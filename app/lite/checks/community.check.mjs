// 코디 공유(커뮤니티) 점검. D1 대신 Node 내장 SQLite로 같은 SQL을 돌린다(비용 0). 실행: npm test (app/lite)
// 대표 10-28 08:08(누구나 가입·직접 찍은 사진·코디 공유 먼저), 09:39 "끝까지". 공개는 스위치(COMMUNITY_MODE)로 막는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { handleCommunity } from '../functions/api/community.js';
import { validateCommunityPost, validateNickname, isCommunityJpeg, COMMUNITY_LIMITS, REPORT_REASONS } from '../src/domain/community.js';
import { createWorker } from '../worker.js';

function fakeD1() {
  const db = new DatabaseSync(':memory:');
  return {
    raw: db,
    prepare(sql) {
      let args = [];
      const st = { bind(...a) { args = a; return st; },
        async first() { return db.prepare(sql).get(...args) ?? null; },
        async all() { return { results: db.prepare(sql).all(...args) }; },
        execute() { const r = db.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes) } }; },
        async run() { return st.execute(); } };
      return st;
    },
    async batch(statements) {
      db.exec('BEGIN IMMEDIATE');
      try { const out = statements.map((s) => s.execute()); db.exec('COMMIT'); return out; }
      catch (error) { db.exec('ROLLBACK'); throw error; }
    },
  };
}
// 가장 작은 올바른 JPEG 모양(머리 FF D8 FF … 끝 FF D9). 서버는 머리·끝·크기만 본다.
const jpeg = (n = 64) => { const b = new Uint8Array(n); b.set([0xff, 0xd8, 0xff, 0xe0]); b[n - 2] = 0xff; b[n - 1] = 0xd9; return b; };
const b64 = (bytes) => Buffer.from(bytes).toString('base64');
const env = (extra = {}) => ({ CROWD_DB: fakeD1(), COMMUNITY_MODE: 'private', COMMUNITY_CONTACT: 'owner@example.test', ...extra });
const call = async (e, method, path, body, who = { member: 'owner', operator: true }) => {
  const res = await handleCommunity(new Request(`https://x.test${path}`, {
    method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
  }), e, who);
  const type = res.headers.get('content-type') || '';
  return { status: res.status, headers: res.headers, body: type.includes('json') ? await res.json() : new Uint8Array(await res.arrayBuffer()) };
};
const join = (e, who, name = '대담') => call(e, 'POST', '/api/community/join', { name, rules: 1, age14: true }, who);
const look = { text: '출근룩', pieces: [{ kind: 'blazer', color: 'navy', label: '네이비 블레이저' }, { kind: 'pants', color: 'beige', label: '베이지 치노' }], consent: false };
const A = { member: 'a', operator: false }, B = { member: 'b', operator: false }, C = { member: 'c', operator: false }, D = { member: 'd', operator: false };

test('글 형식: 옷장 id·링크·모르는 키는 거절하고 종류·색은 목록에서만 받는다', () => {
  assert.equal(validateCommunityPost(look).ok, true);
  assert.equal(validateCommunityPost({ ...look, garmentIds: ['g1'] }).ok, false);
  assert.equal(validateCommunityPost({ ...look, pieces: [{ kind: 'blazer', color: 'navy', label: 'x', id: 'g1' }] }).ok, false);
  assert.equal(validateCommunityPost({ ...look, pieces: [{ kind: 'spaceship', color: 'navy', label: 'x' }] }).ok, false);
  assert.equal(validateCommunityPost({ ...look, pieces: [{ kind: 'blazer', color: 'neon', label: 'x' }] }).ok, false);
  assert.equal(validateCommunityPost({ ...look, text: 'https://shop.example.com 여기서 샀어요' }).ok, false);
  assert.equal(validateCommunityPost({ ...look, text: 'x'.repeat(COMMUNITY_LIMITS.textMax + 1) }).ok, false);
  // 사진이 있으면 공개 동의가 꼭 필요하다.
  assert.equal(validateCommunityPost({ text: '', pieces: [], consent: false }, { photos: 1 }).ok, false);
  assert.equal(validateCommunityPost({ text: '', pieces: [], consent: true }, { photos: 1 }).ok, true);
  assert.equal(validateCommunityPost({ text: '', pieces: [], consent: true }, { photos: COMMUNITY_LIMITS.photosMax + 1 }).ok, false);
  // 빈 글은 받지 않는다.
  assert.equal(validateCommunityPost({ text: '', pieces: [], consent: false }).ok, false);
});

test('이름: 2~20자, 이메일·전화번호처럼 보이면 거절, 비교는 대소문자·공백 무시', () => {
  assert.equal(validateNickname('대담').ok, true);
  assert.equal(validateNickname('a').ok, false);
  assert.equal(validateNickname('me@example.com').ok, false);
  assert.equal(validateNickname('010-1234-5678').ok, false);
  assert.equal(validateNickname('Dae Daem').key, validateNickname('daedaem').key);
});

test('JPEG만 받는다: 머리·끝·크기', () => {
  assert.equal(isCommunityJpeg(jpeg()), true);
  assert.equal(isCommunityJpeg(new Uint8Array([0x89, 0x50, 0x4e, 0x47])), false);
  assert.equal(isCommunityJpeg(jpeg(COMMUNITY_LIMITS.photoBytesMax + 1)), false);
});

test('스위치: 기본은 꺼짐, public은 로그인(C4) 전까지 열리지 않음, DB가 없으면 503', async () => {
  for (const mode of [undefined, 'off', 'anything']) {
    const r = await call(env({ COMMUNITY_MODE: mode }), 'GET', '/api/community/status');
    assert.deepEqual([r.status, r.body.code], [503, 'community_off']);
  }
  const pub = await call(env({ COMMUNITY_MODE: 'public' }), 'GET', '/api/community/status');
  assert.deepEqual([pub.status, pub.body.code], [503, 'public_not_ready']);
  const nodb = await call({ COMMUNITY_MODE: 'private' }, 'GET', '/api/community/status');
  assert.deepEqual([nodb.status, nodb.body.code], [503, 'not_configured']);
  // 신원을 모르면(인증 계층이 회원을 넘기지 않으면) 아무것도 하지 않는다.
  const anon = await call(env(), 'GET', '/api/community/status', null, {});
  assert.equal(anon.status, 401);
});

test('가입: 규칙에 동의하고 이름을 정해야 글을 쓴다. 이름은 겹치지 않는다', async () => {
  const e = env();
  const s0 = await call(e, 'GET', '/api/community/status', null, A);
  assert.equal(s0.status, 200);
  assert.equal(s0.body.member, null);
  assert.equal(s0.body.rules.version, 1);
  assert.ok(s0.body.rules.items.length >= 3);
  assert.equal(s0.body.contact, 'owner@example.test');
  const early = await call(e, 'POST', '/api/community/posts', { post: look, photos: [] }, A);
  assert.deepEqual([early.status, early.body.code], [403, 'join_required']);
  assert.equal((await call(e, 'POST', '/api/community/join', { name: '대담', rules: 0, age14: true }, A)).status, 400);
  assert.equal((await join(e, A, '대담')).status, 200);
  const dup = await join(e, B, ' 대담 ');
  assert.deepEqual([dup.status, dup.body.code], [409, 'name_taken']);
  const s1 = await call(e, 'GET', '/api/community/status', null, A);
  assert.equal(s1.body.member.name, '대담');
});

test('글과 사진: 동의한 사진만 저장하고, 피드에는 옷장 id 없이 보이며 사진 바이트는 그대로 돌려준다', async () => {
  const e = env();
  await join(e, A, '에이'); await join(e, B, '비이');
  const noConsent = await call(e, 'POST', '/api/community/posts', { post: { text: '', pieces: [], consent: false }, photos: [b64(jpeg())] }, A);
  assert.equal(noConsent.status, 400);
  const png = await call(e, 'POST', '/api/community/posts', { post: { text: '', pieces: [], consent: true }, photos: [Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('base64')] }, A);
  assert.equal(png.status, 400);
  const bytes = jpeg(200);
  const ok = await call(e, 'POST', '/api/community/posts', { post: { ...look, consent: true }, photos: [b64(bytes)] }, A);
  assert.equal(ok.status, 200);
  const feed = await call(e, 'GET', '/api/community/feed', null, B);
  assert.equal(feed.body.items.length, 1);
  const item = feed.body.items[0];
  assert.deepEqual(Object.keys(item).sort(), ['author', 'createdAt', 'hidden', 'id', 'mine', 'photos', 'pieces', 'text'].sort());
  assert.deepEqual(item.author, { name: '에이' });
  assert.equal(item.mine, false);
  assert.equal(JSON.stringify(item).includes('"a"'), false, '회원 내부 id를 내보내지 않는다');
  const photo = await call(e, 'GET', `/api/community/photos/${item.photos[0]}`, null, B);
  assert.equal(photo.status, 200);
  assert.equal(photo.headers.get('content-type'), 'image/jpeg');
  assert.deepEqual([...photo.body], [...bytes]);
});

test('피드는 최신순으로 빠짐없이 이어지고, 내 글만 볼 수 있다', async () => {
  const e = env();
  await join(e, A, '에이'); await join(e, B, '비이');
  let t = 1000;
  const at = { now: () => t };
  for (let i = 0; i < 5; i++) {
    const who = i % 2 ? B : A;
    await handleCommunity(new Request('https://x.test/api/community/posts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ post: { ...look, text: `글${i}` }, photos: [] }) }), e, who, at);
    if (i !== 2) t += 1; // 두 글이 같은 밀리초에 올라와도 빠지지 않는다
  }
  const seen = [];
  let cursor = '';
  for (let guard = 0; guard < 10; guard++) {
    const r = await call(e, 'GET', `/api/community/feed?limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, null, A);
    seen.push(...r.body.items.map((x) => x.text));
    if (!r.body.next) break;
    cursor = r.body.next;
  }
  assert.deepEqual(seen.sort(), ['글0', '글1', '글2', '글3', '글4']);
  const mine = await call(e, 'GET', '/api/community/feed?mine=1', null, B);
  assert.deepEqual(mine.body.items.map((x) => x.text).sort(), ['글1', '글3']);
});

test('지우기는 작성자만, 지우면 사진도 사라진다', async () => {
  const e = env();
  await join(e, A, '에이'); await join(e, B, '비이');
  const { body } = await call(e, 'POST', '/api/community/posts', { post: { ...look, consent: true }, photos: [b64(jpeg())] }, A);
  const photoId = (await call(e, 'GET', '/api/community/feed', null, A)).body.items[0].photos[0];
  assert.equal((await call(e, 'DELETE', `/api/community/posts/${body.id}`, null, B)).status, 404);
  assert.equal((await call(e, 'DELETE', `/api/community/posts/${body.id}`, null, A)).status, 200);
  assert.equal((await call(e, 'GET', `/api/community/photos/${photoId}`, null, A)).status, 404);
  assert.equal(e.CROWD_DB.raw.prepare('SELECT COUNT(*) AS n FROM community_photos').get().n, 0);
});

test('신고: 신고한 사람에게는 바로 사라지고, 서로 다른 3명이면 모두에게 숨겨져 운영자 확인을 기다린다', async () => {
  const e = env();
  for (const [w, n] of [[A, '에이'], [B, '비이'], [C, '씨이'], [D, '디이']]) await join(e, w, n);
  const { body } = await call(e, 'POST', '/api/community/posts', { post: look, photos: [] }, A);
  const bad = await call(e, 'POST', '/api/community/reports', { post: body.id, reason: 'spaceship' }, B);
  assert.equal(bad.status, 400);
  const r1 = await call(e, 'POST', '/api/community/reports', { post: body.id, reason: REPORT_REASONS[3][0] }, B);
  assert.equal(r1.status, 200);
  assert.equal(r1.body.reviewDays, 7);
  assert.equal((await call(e, 'GET', '/api/community/feed', null, B)).body.items.length, 0);
  assert.equal((await call(e, 'GET', '/api/community/feed', null, C)).body.items.length, 1);
  // 자기 글은 신고할 수 없다.
  assert.equal((await call(e, 'POST', '/api/community/reports', { post: body.id, reason: 'ad' }, A)).status, 400);
  await call(e, 'POST', '/api/community/reports', { post: body.id, reason: 'ad' }, C);
  await call(e, 'POST', '/api/community/reports', { post: body.id, reason: 'ad' }, D);
  assert.equal((await call(e, 'GET', '/api/community/feed', null, D)).body.items.length, 0);
  // 작성자에게는 숨겨진 사실과 이유가 보인다.
  const own = (await call(e, 'GET', '/api/community/feed', null, A)).body.items[0];
  assert.equal(own.hidden, 'reports');
  // 운영자만 확인 목록을 본다.
  assert.equal((await call(e, 'GET', '/api/community/review', null, B)).status, 403);
  const review = await call(e, 'GET', '/api/community/review', null, { member: 'owner', operator: true });
  assert.equal(review.body.items.length, 1);
  assert.equal(review.body.items[0].reports, 3);
  const restore = await call(e, 'POST', `/api/community/review/${body.id}`, { action: 'restore' }, { member: 'owner', operator: true });
  assert.equal(restore.status, 200);
  assert.equal((await call(e, 'GET', '/api/community/feed', null, D)).body.items.length, 0, '신고한 사람에게는 계속 안 보인다');
  // 처리 기록에는 글·작성자 없이 처리만 남는다.
  const log = e.CROWD_DB.raw.prepare('SELECT * FROM community_log').all();
  assert.ok(log.some((row) => row.action === 'auto_hide') && log.some((row) => row.action === 'restore'));
  assert.equal(JSON.stringify(log).includes('출근룩'), false);
});

test('차단: 서로의 글이 안 보이고 알리지 않으며, 목록에서 풀 수 있다', async () => {
  const e = env();
  await join(e, A, '에이'); await join(e, B, '비이');
  const { body } = await call(e, 'POST', '/api/community/posts', { post: look, photos: [] }, B);
  await call(e, 'POST', '/api/community/posts', { post: { ...look, text: '에이 글' }, photos: [] }, A);
  assert.equal((await call(e, 'POST', '/api/community/blocks', { post: body.id }, A)).status, 200);
  assert.deepEqual((await call(e, 'GET', '/api/community/feed', null, A)).body.items.map((x) => x.text), ['에이 글']);
  assert.deepEqual((await call(e, 'GET', '/api/community/feed', null, B)).body.items.map((x) => x.text), ['출근룩']);
  const list = await call(e, 'GET', '/api/community/blocks', null, A);
  assert.deepEqual(list.body.items.map((x) => x.name), ['비이']);
  assert.equal(JSON.stringify(list.body).includes('"b"'), false);
  assert.equal((await call(e, 'DELETE', `/api/community/blocks/${list.body.items[0].key}`, null, A)).status, 200);
  assert.equal((await call(e, 'GET', '/api/community/feed', null, A)).body.items.length, 2);
});

test('나가기: 내 글·사진·신고·차단·이름을 모두 지운다', async () => {
  const e = env();
  await join(e, A, '에이'); await join(e, B, '비이');
  await call(e, 'POST', '/api/community/posts', { post: { ...look, consent: true }, photos: [b64(jpeg())] }, A);
  const { body } = await call(e, 'POST', '/api/community/posts', { post: look, photos: [] }, B);
  await call(e, 'POST', '/api/community/reports', { post: body.id, reason: 'ad' }, A);
  assert.equal((await call(e, 'POST', '/api/community/leave', { confirm: true }, A)).status, 200);
  const raw = e.CROWD_DB.raw;
  for (const table of ['community_posts', 'community_photos', 'community_reports', 'community_blocks', 'community_members']) {
    const n = raw.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE member = 'a'`).get().n;
    assert.equal(n, 0, table);
  }
  assert.equal((await call(e, 'GET', '/api/community/status', null, A)).body.member, null);
  // 이름이 비어 다른 사람이 쓸 수 있다.
  assert.equal((await join(e, C, '에이')).status, 200);
});

test('한도: 한 시간에 글 10개, 서버 전체 사진 상한을 넘으면 사진 글만 막는다', async () => {
  const e = env({ COMMUNITY_MAX_MB: '0.0005' }); // 약 524바이트
  await join(e, A, '에이');
  const one = await call(e, 'POST', '/api/community/posts', { post: { text: '', pieces: [], consent: true }, photos: [b64(jpeg(400))] }, A);
  assert.equal(one.status, 200);
  const full = await call(e, 'POST', '/api/community/posts', { post: { text: '', pieces: [], consent: true }, photos: [b64(jpeg(400))] }, A);
  assert.deepEqual([full.status, full.body.code], [507, 'storage_full']);
  for (let i = 0; i < 9; i++) assert.equal((await call(e, 'POST', '/api/community/posts', { post: look, photos: [] }, A)).status, 200);
  const limited = await call(e, 'POST', '/api/community/posts', { post: look, photos: [] }, A);
  assert.deepEqual([limited.status, limited.body.code], [429, 'hourly_limit']);
});

test('Worker: 인증된 본인 요청만 커뮤니티에 닿고, 본인은 회원 owner·운영자다', async () => {
  let seen = null;
  const worker = createWorker({
    authorize: async () => ({ ok: true }),
    community: async (_req, _env, who) => { seen = who; return new Response('{}', { headers: { 'content-type': 'application/json' } }); },
  });
  await worker.fetch(new Request('https://x.test/api/community/status'), { PRIVATE_AUTH_MODE: 'session' });
  assert.deepEqual(seen, { member: 'owner', operator: true });
  seen = null;
  const locked = createWorker({ authorize: async () => ({ ok: false, status: 401 }), community: async () => { seen = 'reached'; return new Response('{}'); } });
  const res = await locked.fetch(new Request('https://x.test/api/community/status'), { PRIVATE_AUTH_MODE: 'session' });
  assert.equal(res.status, 401);
  assert.equal(seen, null);
});
