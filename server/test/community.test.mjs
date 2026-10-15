import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { openDatabase } from '../src/db.js';
import { createApp, AGREEMENT_VERSION } from '../src/app.js';
import { communityAdmin, REPORTS_TO_HIDE, MAX_MEMBER_PHOTOS } from '../src/community.js';
import { COMMUNITY_RULES_VERSION } from '../../app/src/community-post.js';

async function start({ community = true, db = openDatabase(':memory:'), communityMaxBytes } = {}) {
  const clock = { t: Date.parse('2026-10-15T00:00:00Z') };
  const logs = [];
  const app = createApp({ db, now: () => clock.t, log: (...e) => logs.push(e),
    config: { allowedOrigins: [], trustProxy: null, inviteCode: null, scryptLog2N: 10, sessionDays: 60, appFile: '/none', community, communityMaxBytes } });
  const server = http.createServer((req, res) => app.handle(req, res));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, { token, json } = {}) => {
    const r = await fetch(base + path, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(json ? { 'Content-Type': 'application/json' } : {}) }, body: json ? JSON.stringify(json) : undefined });
    const type = r.headers.get('content-type') || '';
    return { status: r.status, data: r.status === 204 ? null : type.startsWith('application/json') ? await r.json() : Buffer.from(await r.arrayBuffer()) };
  };
  let n = 0;
  const member = async (name) => {
    const { token } = (await call('POST', '/v1/auth/signup', { json: { email: `m${n++}@example.com`, password: 'correct horse', agreements: { version: AGREEMENT_VERSION, terms: true, privacy: true, age14: true } } })).data;
    if (name) assert.equal((await call('POST', '/v1/community/join', { token, json: { name, rulesVersion: COMMUNITY_RULES_VERSION, agree: true } })).status, 200);
    return token;
  };
  return { db, clock, logs, call, member, close: () => new Promise((resolve) => server.close(() => { db.close(); resolve(); })),
    stop: () => new Promise((resolve) => server.close(resolve)) };
}

const look = (extra = {}) => ({ v: 1, lookId: 'm-ivy-campus', title: '아이비 캠퍼스', items: [
  { role: 'top', slot: 'm-oxford', kind: 'shirt', color: 'white', brand: '유니클로', productId: null, photo: null },
  { role: 'bottom', slot: 'm-chino', kind: 'pants', color: 'beige', brand: '', productId: 'ms-3323583', photo: null },
], ...extra });
// The smallest well-formed JPEG layout: start, scan header, one data byte, end.
const jpegBytes = (byte) => [0xff, 0xd8, 0xff, 0xda, 0x00, 0x02, byte, 0xff, 0xd9];
const jpeg = (byte) => Buffer.from(jpegBytes(byte)).toString('base64');
const segment = (marker, text) => { const body = [...Buffer.from(text, 'latin1')]; return [0xff, marker, (body.length + 2) >> 8, (body.length + 2) & 255, ...body]; };

test('off unless the operator turns it on; reading needs a member who agreed to the current rules', async (t) => {
  const off = await start({ community: false });
  t.after(off.close);
  const token = await off.member();
  assert.equal((await off.call('GET', '/v1/health')).data.features.community, false);
  assert.deepEqual((await off.call('GET', '/v1/community', { token })).data, { enabled: false, rulesVersion: COMMUNITY_RULES_VERSION, member: null });
  assert.equal((await off.call('GET', '/v1/community/posts', { token })).data.error.code, 'feature-off');

  const s = await start();
  t.after(s.close);
  const guest = await s.member();
  assert.equal((await s.call('GET', '/v1/community/posts')).status, 401, 'signed out');
  assert.equal((await s.call('GET', '/v1/community/posts', { token: guest })).data.error.code, 'join-required');
  for (const [json, code] of [
    [{ name: '민지', rulesVersion: 'old', agree: true }, 'rules-required'],
    [{ name: '민지', rulesVersion: COMMUNITY_RULES_VERSION, agree: false }, 'rules-required'],
    [{ name: 'a@b.co', rulesVersion: COMMUNITY_RULES_VERSION, agree: true }, 'bad-name'],
    [{ name: '01012345678', rulesVersion: COMMUNITY_RULES_VERSION, agree: true }, 'bad-name'],
    [{ name: '<b>x</b>', rulesVersion: COMMUNITY_RULES_VERSION, agree: true }, 'bad-name'],
  ]) assert.equal((await s.call('POST', '/v1/community/join', { token: guest, json })).data.error.code, code, JSON.stringify(json));
  await s.member('민지');
  assert.equal((await s.call('POST', '/v1/community/join', { token: guest, json: { name: ' 민지 ', rulesVersion: COMMUNITY_RULES_VERSION, agree: true } })).data.error.code, 'name-taken');
  assert.equal((await s.call('POST', '/v1/community/join', { token: guest, json: { name: '지수', rulesVersion: COMMUNITY_RULES_VERSION, agree: true } })).status, 200);
  assert.deepEqual((await s.call('GET', '/v1/community', { token: guest })).data.member, { name: '지수', current: true, posts: 0 });
});

test('a post carries the outfit shape only; photos need consent for that post and stay with it', async (t) => {
  const s = await start();
  t.after(s.close);
  const a = await s.member('민지'), b = await s.member('지수');
  const bad = [
    [{ look: look({ items: [{ ...look().items[0], garmentId: 'g_1' }] }), caption: '' }, 'invalid-post'],
    [{ look: look({ items: [{ ...look().items[0], brand: 'https://shop.example/p?token=1' }] }), caption: '' }, 'invalid-post'],
    [{ look: look({ items: [{ ...look().items[0], slot: 'm-oxford', kind: 'pants' }] }), caption: '' }, 'invalid-post'],
    [{ look: look(), caption: '줄\n바꿈' }, 'invalid-post'],
    [{ look: look({ items: [{ ...look().items[0], photo: 0 }] }), caption: '', photos: [{ mime: 'image/jpeg', data: jpeg(1) }] }, 'photo-consent-required'],
    [{ look: look(), caption: '', photos: [{ mime: 'image/jpeg', data: jpeg(1) }], photoConsent: true }, 'invalid-post'],
    [{ look: look({ items: [{ ...look().items[0], photo: 0 }] }), caption: '', photos: [{ mime: 'image/png', data: jpeg(1) }], photoConsent: true }, 'bad-photo'],
  ];
  for (const [json, code] of bad) assert.equal((await s.call('POST', '/v1/community/posts', { token: a, json })).data.error.code, code, JSON.stringify(json).slice(0, 120));
  assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM posts').get().n, 0, 'nothing stored from a refused post');

  const plain = await s.call('POST', '/v1/community/posts', { token: a, json: { look: look(), caption: '출근 첫날' } });
  assert.equal(plain.status, 201);
  s.clock.t += 1000;
  const withPhoto = await s.call('POST', '/v1/community/posts', { token: b, json: {
    look: look({ items: [{ ...look().items[0], photo: 0 }, look().items[1]] }), caption: '', photos: [{ mime: 'image/jpeg', data: jpeg(7) }], photoConsent: true,
  } });
  assert.equal(withPhoto.status, 201);
  const feed = (await s.call('GET', '/v1/community/posts', { token: a })).data;
  assert.deepEqual(feed.posts.map((p) => [p.author, p.mine, p.photoCount, p.caption]), [['지수', false, 1, ''], ['민지', true, 0, '출근 첫날']]);
  assert.deepEqual(feed.posts[1].look, look());
  assert.ok(!JSON.stringify(feed).includes('@example.com'), 'no email in the feed');
  const photo = await s.call('GET', `/v1/community/posts/${withPhoto.data.id}/photos/0`, { token: a });
  assert.deepEqual([...photo.data], jpegBytes(7));
  assert.ok(s.logs.every((entry) => !/출근 첫날|민지/.test(JSON.stringify(entry))), 'no post text or names in the log');
});

test('shared photos are stored without location, time or device metadata', async (t) => {
  const s = await start();
  t.after(s.close);
  const a = await s.member('민지');
  const withExif = [0xff, 0xd8, ...segment(0xe0, 'JFIF\0\x01\x01\0\0\x01\0\x01\0\0'), ...segment(0xe1, 'Exif\0\0GPS 37.5665N 126.9780E 2026:10:15'),
    ...segment(0xe1, 'http://ns.adobe.com/xap/1.0/\0<x:xmpmeta>iPhone</x:xmpmeta>'), ...segment(0xed, 'Photoshop 3.0\0IPTC'), ...segment(0xfe, 'shot at home'),
    0xff, 0xda, 0x00, 0x02, 0x11, 0x22, 0xff, 0xd9];
  const { id } = (await s.call('POST', '/v1/community/posts', { token: a, json: {
    look: look({ items: [{ ...look().items[0], photo: 0 }] }), caption: '', photos: [{ mime: 'image/jpeg', data: Buffer.from(withExif).toString('base64') }], photoConsent: true } })).data;
  const stored = Buffer.from(s.db.prepare('SELECT bytes FROM post_photos WHERE post_id = ?').get(id).bytes);
  for (const secret of ['Exif', 'GPS', 'xmpmeta', 'iPhone', 'Photoshop', 'shot at home']) assert.ok(!stored.includes(secret), `${secret} removed`);
  assert.ok(stored.includes('JFIF'), 'the JFIF header stays');
  assert.deepEqual([...stored.subarray(stored.indexOf(0xda) - 1)], [0xff, 0xda, 0x00, 0x02, 0x11, 0x22, 0xff, 0xd9], 'the picture data is unchanged');
  const broken = await s.call('POST', '/v1/community/posts', { token: a, json: {
    look: look({ items: [{ ...look().items[0], photo: 0 }] }), caption: '', photos: [{ mime: 'image/jpeg', data: Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x40, 1]).toString('base64') }], photoConsent: true } });
  assert.equal(broken.data.error.code, 'bad-photo', 'a file that does not parse is refused, never stored as it is');
});

test('photo storage is bounded per member and for the whole server; posts without photos still go', async (t) => {
  const s = await start({ communityMaxBytes: 40 });
  t.after(s.close);
  const a = await s.member('민지'), b = await s.member('지수');
  const withPhoto = (byte) => ({ look: look({ items: [{ ...look().items[0], photo: 0 }] }), caption: '', photos: [{ mime: 'image/jpeg', data: jpeg(byte) }], photoConsent: true });
  assert.equal((await s.call('POST', '/v1/community/posts', { token: a, json: withPhoto(1) })).status, 201);
  // Fill this member's photo count directly, as if posted over many hours.
  const userId = s.db.prepare('SELECT user_id FROM posts LIMIT 1').get().user_id;
  for (let i = 1; i < MAX_MEMBER_PHOTOS; i++) {
    s.db.prepare('INSERT INTO posts (id, user_id, created_at, look, caption) VALUES (?, ?, ?, ?, ?)').run(`c_${String(i).padStart(24, '0')}`, userId, 1, JSON.stringify(look()), '');
    s.db.prepare('INSERT INTO post_photos (post_id, idx, bytes) VALUES (?, 0, ?)').run(`c_${String(i).padStart(24, '0')}`, Buffer.alloc(0));
  }
  assert.equal((await s.call('POST', '/v1/community/posts', { token: a, json: withPhoto(2) })).data.error.code, 'community-quota');
  assert.equal((await s.call('POST', '/v1/community/posts', { token: a, json: { look: look(), caption: '사진 없이' } })).status, 201);
  // The whole server has room for 40 bytes of photos in this test; the first photo used 9.
  for (let i = 0; i < 3; i++) await s.call('POST', '/v1/community/posts', { token: b, json: withPhoto(3 + i) });
  assert.equal((await s.call('POST', '/v1/community/posts', { token: b, json: withPhoto(9) })).data.error.code, 'community-full');
});

test('a report hides the post from the reporter; three reports hide it for everyone until the operator reviews', async (t) => {
  const s = await start();
  t.after(s.close);
  const author = await s.member('작성자');
  const readers = [await s.member('독자하나'), await s.member('독자둘'), await s.member('독자셋'), await s.member('독자넷')];
  const { id } = (await s.call('POST', '/v1/community/posts', { token: author, json: { look: look(), caption: '' } })).data;
  assert.equal((await s.call('POST', `/v1/community/posts/${id}/report`, { token: author, json: { reason: 'spam' } })).data.error.code, 'own-post');
  assert.equal((await s.call('POST', `/v1/community/posts/${id}/report`, { token: readers[0], json: { reason: 'nope' } })).data.error.code, 'bad-reason');
  await s.call('POST', `/v1/community/posts/${id}/report`, { token: readers[0], json: { reason: 'privacy' } });
  assert.equal((await s.call('GET', '/v1/community/posts', { token: readers[0] })).data.posts.length, 0, 'gone for the reporter at once');
  assert.equal((await s.call('GET', '/v1/community/posts', { token: readers[3] })).data.posts.length, 1, 'still there for others');
  for (const reader of readers.slice(1, REPORTS_TO_HIDE)) await s.call('POST', `/v1/community/posts/${id}/report`, { token: reader, json: { reason: 'privacy' } });
  assert.equal((await s.call('GET', '/v1/community/posts', { token: readers[3] })).data.posts.length, 0, 'hidden for everyone');
  const own = (await s.call('GET', '/v1/community/posts', { token: author })).data.posts[0];
  assert.match(own.hidden, /운영자 확인 전까지 숨겨졌어요/, 'the author is told why');

  const admin = communityAdmin(s.db, () => s.clock.t);
  assert.deepEqual(admin.review().map((r) => [r.id, r.author, r.hidden, r.reports.length]), [[id, '작성자', 'reports', 3]]);
  assert.equal(admin.restore(id), true);
  assert.equal((await s.call('GET', '/v1/community/posts', { token: readers[3] })).data.posts.length, 1, 'visible again after review');
  assert.equal(admin.hide(id), true);
  assert.equal((await s.call('GET', '/v1/community/posts', { token: readers[3] })).data.posts.length, 0);
  assert.equal(admin.remove(id), true);
  assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM post_reports').get().n, 0);
});

test('only the author deletes a post; leaving the community or deleting the account removes posts and photos', async (t) => {
  const s = await start();
  t.after(s.close);
  const a = await s.member('민지'), b = await s.member('지수');
  const post = async (token) => (await s.call('POST', '/v1/community/posts', { token, json: {
    look: look({ items: [{ ...look().items[0], photo: 0 }] }), caption: '', photos: [{ mime: 'image/jpeg', data: jpeg(3) }], photoConsent: true } })).data.id;
  const mine = await post(a);
  assert.equal((await s.call('DELETE', `/v1/community/posts/${mine}`, { token: b })).data.error.code, 'not-yours');
  assert.equal((await s.call('DELETE', `/v1/community/posts/${mine}`, { token: a })).status, 204);
  assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM post_photos').get().n, 0);

  await post(a);
  assert.equal((await s.call('DELETE', '/v1/community/me', { token: a })).status, 204);
  assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM posts').get().n, 0);
  assert.equal((await s.call('GET', '/v1/community', { token: a })).data.member, null);

  await post(b);
  assert.equal((await s.call('DELETE', '/v1/me', { token: b, json: { password: 'correct horse' } })).status, 204);
  for (const table of ['posts', 'post_photos', 'community_members'])
    assert.equal(s.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n, 0, `${table} is empty after the account is deleted`);
});

test('after the operator turns the community off, members can still see what they left and remove it', async (t) => {
  const db = openDatabase(':memory:');
  const on = await start({ db });
  const a = await on.member('민지');
  await on.call('POST', '/v1/community/posts', { token: a, json: { look: look({ items: [{ ...look().items[0], photo: 0 }] }), caption: '', photos: [{ mime: 'image/jpeg', data: jpeg(5) }], photoConsent: true } });
  const { id } = (await on.call('POST', '/v1/community/posts', { token: a, json: { look: look(), caption: '' } })).data;
  await on.stop();
  const off = await start({ db, community: false });
  t.after(off.close);
  assert.deepEqual((await off.call('GET', '/v1/community', { token: a })).data.member, { name: '민지', current: true, posts: 2 });
  assert.equal((await off.call('GET', '/v1/community/posts', { token: a })).data.error.code, 'feature-off', 'reading stays off');
  assert.equal((await off.call('DELETE', `/v1/community/posts/${id}`, { token: a })).status, 204, 'one post');
  assert.equal((await off.call('DELETE', '/v1/community/me', { token: a })).status, 204, 'everything else');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM post_photos').get().n, 0);
  assert.equal((await off.call('GET', '/v1/community', { token: a })).data.member, null);
});

test('the feed pages through posts made in the same millisecond without skipping any', async (t) => {
  const s = await start();
  t.after(s.close);
  const a = await s.member('민지');
  // Ten posts an hour is the limit; each batch is made within one millisecond.
  for (const batch of [10, 10, 5]) {
    for (let i = 0; i < batch; i++)
      assert.equal((await s.call('POST', '/v1/community/posts', { token: a, json: { look: look(), caption: `${batch}-${i}` } })).status, 201);
    s.clock.t += 3600 * 1000 + 1;
  }
  assert.equal((await s.call('POST', '/v1/community/posts', { token: a, json: { look: look(), caption: '' } })).status, 201);
  for (let i = 0; i < 10; i++) await s.call('POST', '/v1/community/posts', { token: a, json: { look: look(), caption: '' } });
  assert.equal((await s.call('POST', '/v1/community/posts', { token: a, json: { look: look(), caption: '' } })).data.error.code, 'rate-limited');
  const total = s.db.prepare('SELECT COUNT(*) AS n FROM posts').get().n;
  const seen = [];
  let next = '';
  do {
    const page = (await s.call('GET', `/v1/community/posts${next ? `?before=${encodeURIComponent(next)}` : ''}`, { token: a })).data;
    seen.push(...page.posts.map((p) => p.id));
    next = page.next;
  } while (next);
  assert.equal(seen.length, total);
  assert.equal(new Set(seen).size, total);
  assert.equal((await s.call('GET', '/v1/community/posts?before=123', { token: a })).data.error.code, 'bad-cursor');
});
