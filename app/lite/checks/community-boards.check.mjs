import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { handleCommunity } from '../functions/api/community.js';
import { validateCommunityPost } from '../src/domain/community.js';
import { createWorker } from '../worker.js';
import { ACCOUNT_HEADER } from '../src/domain/account-scope.js';

function fixture() {
  const raw = new DatabaseSync(':memory:');
  const db = {
    raw,
    prepare(sql) {
      let args = [];
      const st = {
        bind(...a) { args = a; return st; },
        async first() { return raw.prepare(sql).get(...args) ?? null; },
        async all() { return { results: raw.prepare(sql).all(...args) }; },
        execute() { return { meta: { changes: Number(raw.prepare(sql).run(...args).changes) } }; },
        async run() { return st.execute(); },
      };
      return st;
    },
    async batch(statements) {
      raw.exec('BEGIN IMMEDIATE');
      try { const out = statements.map(s => s.execute()); raw.exec('COMMIT'); return out; }
      catch (error) { raw.exec('ROLLBACK'); throw error; }
    },
  };
  let now = Date.UTC(2026, 9, 29);
  const env = { CROWD_DB: db, COMMUNITY_MODE: 'private' };
  const call = async (member, method, path, body) => {
    const res = await handleCommunity(new Request('https://qa.test/api/community/' + path, {
      method, headers: { 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }), env, { member, operator: member === 'op' }, { now: () => now });
    return { status: res.status, body: res.headers.get('content-type')?.includes('json') ? await res.json() : new Uint8Array(await res.arrayBuffer()) };
  };
  return { db, env, call, tick() { now++; }, async join() {
    for (const [member, name] of [['a', '에이'], ['b', '비이'], ['op', '운영']])
      assert.equal((await call(member, 'POST', 'join', { name, rules: 1, age14: true })).status, 200);
  } };
}
const outfit = () => ({ text: '기존 코디', pieces: [{ kind: 'shirt', color: 'white', label: '셔츠' }, { kind: 'pants', color: 'black', label: '바지' }], consent: false });
const talk = () => ({ board: 'free', title: '출근룩 이야기', text: '좋아하는 셔츠를 이야기해요', pieces: [], consent: false });
const sale = () => ({ board: 'sale', title: '셔츠 할인 제보', text: '작성할 때 본 가격이에요', pieces: [], consent: false,
  sale: { merchant: '예시 판매처', price: 39000, discount: null, endDate: '2026-11-02', sourceUrl: 'https://shop.example.com/shirt?id=1' } });
const post = (f, member, body, photos = []) => f.call(member, 'POST', 'posts', { post: body, photos });
const jpeg = Buffer.from([255, 216, 255, 224, 0, 255, 217]);

test('free board accepts text without wardrobe or photos while the legacy outfit validation is unchanged', () => {
  assert.equal(validateCommunityPost(talk()).ok, true);
  assert.deepEqual(validateCommunityPost(outfit()).post, outfit());
  assert.equal(validateCommunityPost({ text: '옷 없음', pieces: [], consent: false }).ok, false);
  for (const input of [{ ...talk(), text: '' }, { ...talk(), title: '' }, { ...talk(), title: 'x'.repeat(81) }, { ...talk(), board: 'unknown' }, { ...talk(), pieces: outfit().pieces }])
    assert.equal(validateCommunityPost(input).ok, false);
});

test('sale facts are explicit bounded author input, including source URL, percentage and calendar date', () => {
  const p = sale();
  assert.equal(validateCommunityPost(p).ok, true);
  assert.equal(validateCommunityPost({ ...p, sale: { ...p.sale, price: null, discount: 30, endDate: '' } }).ok, true);
  for (const change of [{ price: -1 }, { price: '39000' }, { price: 1e12 }, { price: null, discount: null }, { discount: 101 }, { endDate: '2026-02-30' }, { merchant: '' }, { secret: 'private' }])
    assert.equal(validateCommunityPost({ ...p, sale: { ...p.sale, ...change } }).ok, false);
  for (const sourceUrl of ['javascript:alert(1)', 'data:text/html,bad', 'http://shop.example.com', 'https://user:pass@shop.example.com', 'https://localhost/a', 'https://127.0.0.1/a', 'https://[::1]/a', 'https://shop.local/a'])
    assert.equal(validateCommunityPost({ ...p, sale: { ...p.sale, sourceUrl } }).ok, false, sourceUrl);
  assert.equal(validateCommunityPost({ ...p, sale: { ...p.sale, sourceUrl: 'https://shop.example.com/' + '한'.repeat(300) } }).ok, false, 'encoded source is also bounded');
  assert.equal(validateCommunityPost({ ...p, wardrobeId: 'PRIVATE' }).ok, false);
  assert.equal(validateCommunityPost({ ...p, text: '본문 https://shop.example.com' }).ok, false);
});

test('three boards have isolated feeds and mine filters, and invalid boards never silently fall back', async () => {
  const f = fixture(); await f.join();
  for (const [member, value] of [['a', outfit()], ['a', sale()], ['b', talk()]]) {
    assert.equal((await post(f, member, value)).status, 200); f.tick();
  }
  for (const board of ['outfits', 'sale', 'free']) {
    const r = await f.call('a', 'GET', 'feed?board=' + board);
    assert.equal(r.body.items.length, 1);
    assert.equal(r.body.items[0].board, board);
    assert.equal((await f.call('a', 'GET', 'feed?board=' + board + '&mine=1')).body.items.length, board === 'free' ? 0 : 1);
  }
  assert.equal((await f.call('a', 'GET', 'feed?board=unknown')).status, 400);
  assert.equal((await post(f, 'a', { ...talk(), board: 'unknown' })).status, 400);
  assert.equal((await f.call('a', 'GET', 'feed')).body.items[0].text, '기존 코디');
});

test('old outfit rows and photo bytes remain readable without migrating or rewriting the old post', async () => {
  const f = fixture(); await f.join();
  const id = crypto.randomUUID(), photo = crypto.randomUUID();
  f.db.raw.prepare('INSERT INTO community_posts (id,member,text,pieces,photos,created_at) VALUES (?,?,?,?,?,?)')
    .run(id, 'a', '옛 글', JSON.stringify(outfit().pieces), 1, 1000);
  f.db.raw.prepare('INSERT INTO community_photos (id,post,member,idx,data,size,created_at) VALUES (?,?,?,?,?,?,?)')
    .run(photo, id, 'a', 0, jpeg.toString('base64'), jpeg.length, 1000);
  const before = f.db.raw.prepare('SELECT * FROM community_posts WHERE id=?').get(id);
  const r = await f.call('b', 'GET', 'feed?board=outfits');
  assert.equal(r.body.items[0].board, 'outfits');
  assert.equal(r.body.items[0].revision, 0);
  assert.deepEqual((await f.call('b', 'GET', 'photos/' + photo)).body, new Uint8Array(jpeg));
  assert.deepEqual(f.db.raw.prepare('SELECT * FROM community_posts WHERE id=?').get(id), before);
  assert.equal((await f.call('a', 'PATCH', 'posts/' + id, { post: { ...outfit(), text: '옛 글 정정', consent: true }, revision: 0 })).status, 200);
  assert.equal((await f.call('a', 'GET', 'feed')).body.items[0].revision, 1);
  assert.deepEqual((await f.call('b', 'GET', 'photos/' + photo)).body, new Uint8Array(jpeg));
});

test('board pagination stays within its board, includes tied timestamps and rejects a foreign board cursor', async () => {
  const f = fixture(); await f.join();
  for (let i = 0; i < 5; i++) { assert.equal((await post(f, 'a', { ...sale(), title: '할인' + i })).status, 200); if (i !== 2) f.tick(); }
  assert.equal((await post(f, 'b', talk())).status, 200);
  const seen = [], first = await f.call('b', 'GET', 'feed?board=sale&limit=2');
  assert.ok(first.body.next);
  let r = first;
  for (let guard = 0; guard < 5; guard++) {
    seen.push(...r.body.items.map(x => x.title));
    if (!r.body.next) break;
    r = await f.call('b', 'GET', 'feed?board=sale&limit=2&cursor=' + encodeURIComponent(r.body.next));
  }
  assert.deepEqual(seen.sort(), ['할인0', '할인1', '할인2', '할인3', '할인4']);
  assert.equal((await f.call('b', 'GET', 'feed?board=free&cursor=' + encodeURIComponent(first.body.next))).status, 400);
});

test('text boards still require consent for selected photos and preserve reporting, blocking and photo ownership', async () => {
  const f = fixture(); await f.join();
  assert.equal((await post(f, 'a', talk(), [jpeg.toString('base64')])).status, 400);
  const created = await post(f, 'a', { ...talk(), consent: true }, [jpeg.toString('base64')]);
  assert.equal(created.status, 200);
  const row = (await f.call('b', 'GET', 'feed?board=free')).body.items[0];
  assert.equal((await f.call('b', 'DELETE', 'posts/' + row.id)).status, 404);
  assert.equal((await f.call('b', 'POST', 'reports', { post: row.id, reason: 'ad' })).status, 200);
  assert.equal((await f.call('b', 'GET', 'photos/' + row.photos[0])).status, 404);
  assert.equal((await f.call('a', 'GET', 'photos/' + row.photos[0])).status, 200);
  const s = await post(f, 'a', sale()); assert.equal(s.status, 200);
  assert.equal((await f.call('b', 'POST', 'blocks', { post: s.body.id })).status, 200);
  assert.equal((await f.call('b', 'GET', 'feed?board=sale')).body.items.length, 0);
  assert.equal((await f.call('a', 'DELETE', 'posts/' + row.id)).status, 200);
  assert.equal((await f.call('a', 'GET', 'photos/' + row.photos[0])).status, 404);
});

test('author text edits compare revisions, preserve board/photos and reject foreign or stale writes', async () => {
  const f = fixture(); await f.join();
  const made = await post(f, 'a', sale()); assert.equal(made.status, 200);
  const before = (await f.call('a', 'GET', 'feed?board=sale')).body.items[0];
  const changed = { ...sale(), title: '가격 정정', sale: { ...sale().sale, price: 35000 } };
  assert.equal((await f.call('b', 'PATCH', 'posts/' + before.id, { post: changed, revision: before.revision })).status, 404);
  const ok = await f.call('a', 'PATCH', 'posts/' + before.id, { post: changed, revision: before.revision });
  assert.equal(ok.status, 200);
  assert.equal((await f.call('a', 'GET', 'feed?board=sale')).body.items[0].revision, before.revision + 1);
  assert.equal((await f.call('a', 'PATCH', 'posts/' + before.id, { post: sale(), revision: before.revision })).status, 409);
  assert.equal((await f.call('a', 'PATCH', 'posts/' + before.id, { post: talk(), revision: before.revision + 1 })).status, 400);
  assert.equal((await f.call('a', 'PATCH', 'posts/' + before.id, { post: changed, revision: before.revision + 1, photos: [] })).status, 400);
});

test('legacy edits keep photo bytes and moderation state; public/private readiness and operator authority remain shared', async () => {
  const f = fixture(); await f.join();
  const made = await post(f, 'a', { ...outfit(), consent: true }, [jpeg.toString('base64')]); assert.equal(made.status, 200);
  const row = (await f.call('a', 'GET', 'feed')).body.items[0];
  assert.equal((await f.call('op', 'POST', 'review/' + row.id, { action: 'hide' })).status, 200);
  assert.equal((await f.call('a', 'PATCH', 'posts/' + row.id, { post: { ...outfit(), text: '수정 후에도 숨김', consent: true }, revision: row.revision })).status, 200);
  assert.ok((await f.call('a', 'GET', 'feed')).body.items[0].hidden);
  assert.equal((await f.call('b', 'GET', 'photos/' + row.photos[0])).status, 404);
  assert.deepEqual((await f.call('a', 'GET', 'photos/' + row.photos[0])).body, new Uint8Array(jpeg));
  assert.equal((await f.call('b', 'GET', 'review')).status, 403);
  f.env.COMMUNITY_MODE = 'public';
  assert.equal((await f.call('a', 'GET', 'feed?board=sale')).body.code, 'public_not_ready');
});

test('all boards and edits share the existing hourly cap, including simultaneous submissions', async () => {
  const f = fixture(); await f.join();
  for (let i = 0; i < 9; i++) assert.equal((await post(f, 'a', i % 2 ? sale() : talk())).status, 200);
  const final = await Promise.all([post(f, 'a', outfit()), post(f, 'a', sale())]);
  assert.deepEqual(final.map(x => x.status).sort(), [200, 429]);
  const row = (await f.call('a', 'GET', 'feed?board=free')).body.items[0];
  assert.equal((await f.call('a', 'PATCH', 'posts/' + row.id, { post: talk(), revision: row.revision })).status, 429);
  assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM community_posts WHERE member=?').get('a').n, 10);
});

test('failed transactions do not leave orphan metadata/photos or consume the posting limit', async () => {
  const f = fixture(); await f.join();
  f.db.raw.exec("CREATE TRIGGER qa_fail BEFORE INSERT ON community_posts BEGIN SELECT RAISE(ABORT,'QA failure'); END");
  assert.equal((await post(f, 'a', sale())).status, 500);
  assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM community_posts').get().n, 0);
  assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM community_post_usage').get().n, 0);
  assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM community_post_details').get().n, 0);
});

test('two author edits of the same version commit only one change and one usage reservation', async () => {
  const f = fixture(); await f.join();
  const made = await post(f, 'a', talk()); assert.equal(made.status, 200);
  const results = await Promise.all(['첫 창', '다른 창'].map(title => f.call('a', 'PATCH', 'posts/' + made.body.id, { post: { ...talk(), title }, revision: 1 })));
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  const row = (await f.call('a', 'GET', 'feed?board=free')).body.items[0];
  assert.equal(row.revision, 2);
  assert.ok(['첫 창', '다른 창'].includes(row.title));
  assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM community_post_usage WHERE member=?').get('a').n, 2);
});

test('simultaneous photo posts in different boards and accounts cannot exceed the shared byte cap', async () => {
  const f = fixture(); await f.join();
  f.env.COMMUNITY_MAX_MB = jpeg.length / 1024 / 1024;
  const results = await Promise.all([post(f, 'a', { ...talk(), consent: true }, [jpeg.toString('base64')]), post(f, 'b', { ...sale(), consent: true }, [jpeg.toString('base64')])]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 507]);
  assert.equal(f.db.raw.prepare('SELECT SUM(size) n FROM community_photos').get().n, jpeg.length);
  assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM community_post_details').get().n, 1);
});

test('author deletion, operator deletion and leaving remove board metadata with the existing content', async () => {
  const f = fixture(); await f.join();
  const a = await post(f, 'a', sale()), b = await post(f, 'b', talk());
  assert.equal((await f.call('a', 'DELETE', 'posts/' + b.body.id)).status, 404);
  assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM community_post_details').get().n, 2);
  assert.equal((await f.call('a', 'DELETE', 'posts/' + a.body.id)).status, 200);
  assert.equal((await f.call('op', 'POST', 'review/' + b.body.id, { action: 'delete' })).status, 200);
  assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM community_post_details').get().n, 0);
  assert.equal((await post(f, 'a', sale())).status, 200);
  assert.equal((await f.call('a', 'POST', 'leave', { confirm: true })).status, 200);
  assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM community_post_details').get().n, 0);
});

test('new edit requests still cross the existing authentication and stale-account gates before reaching handlers', async () => {
  let reached = false;
  const handler = async () => { reached = true; return Response.json({ ok: true }); };
  const request = headers => new Request('https://qa.test/api/community/posts/' + crypto.randomUUID(), { method: 'PATCH', headers: { 'content-type': 'application/json', ...headers }, body: '{}' });
  const locked = createWorker({ authorize: async () => ({ ok: false, status: 401 }), community: handler });
  assert.equal((await locked.fetch(request({}), { PRIVATE_AUTH_MODE: 'session' })).status, 401);
  assert.equal(reached, false);
  const owner = createWorker({ authorize: async () => ({ ok: true }), community: handler });
  assert.equal((await owner.fetch(request({ [ACCOUNT_HEADER]: 'm-' + 'a'.repeat(32) }), { PRIVATE_AUTH_MODE: 'session' })).status, 409);
  assert.equal(reached, false);
  assert.equal((await owner.fetch(request({ [ACCOUNT_HEADER]: 'owner' }), { PRIVATE_AUTH_MODE: 'session' })).status, 200);
  assert.equal(reached, true);
});

test('an edit transaction failure preserves the old title, text, revision and posting allowance', async () => {
  const f = fixture(); await f.join();
  const made = await post(f, 'a', talk());
  const before = (await f.call('a', 'GET', 'feed?board=free')).body.items[0];
  f.db.raw.exec("CREATE TRIGGER qa_fail_edit BEFORE UPDATE ON community_posts BEGIN SELECT RAISE(ABORT,'QA failure'); END");
  assert.equal((await f.call('a', 'PATCH', 'posts/' + made.body.id, { post: { ...talk(), title: '보존되어야 할 실패 초안', text: '새 본문' }, revision: 1 })).status, 500);
  assert.deepEqual((await f.call('a', 'GET', 'feed?board=free')).body.items[0], before);
  assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM community_post_usage WHERE member=?').get('a').n, 1);
});

function seedLegacy(f, n, journal = 0) {
  const ids = [], at = Date.UTC(2026, 9, 29) - 1000;
  for (let i = 0; i < n; i++) {
    const id = crypto.randomUUID(); ids.push(id);
    f.db.raw.prepare('INSERT INTO community_posts (id,member,text,pieces,photos,created_at) VALUES (?,?,?,?,?,?)')
      .run(id, 'a', '기존 글' + i, JSON.stringify(outfit().pieces), 0, at);
    if (i < journal) f.db.raw.prepare('INSERT INTO community_post_usage (id,member,created_at) VALUES (?,?,?)').run(crypto.randomUUID(), 'a', at);
  }
  return ids;
}

test('upgrade counts ten recent legacy posts even when the old posting journal is empty', async () => {
  const f = fixture(); await f.join(); seedLegacy(f, 10);
  assert.equal((await post(f, 'a', outfit())).status, 429);
  assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM community_posts').get().n, 10);
  assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM community_post_usage').get().n, 10);
});

test('upgrade does not count existing legacy journal entries a second time', async () => {
  const f = fixture(); await f.join(); seedLegacy(f, 9, 9);
  assert.equal((await post(f, 'a', sale())).status, 200);
  assert.equal((await post(f, 'a', talk())).status, 429);
  assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM community_post_usage').get().n, 10);
});

test('concurrent first writes share the missing legacy journal without duplicate reservations', async () => {
  const f = fixture(); await f.join(); seedLegacy(f, 9, 4);
  const results = await Promise.all([post(f, 'a', sale()), post(f, 'a', talk())]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 429]);
  assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM community_posts').get().n, 10);
  assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM community_post_usage').get().n, 10);
});

test('deleting a legacy post as the first upgrade action cannot erase its recent posting allowance', async () => {
  const f = fixture(); await f.join(); const ids = seedLegacy(f, 10);
  assert.equal((await f.call('a', 'DELETE', 'posts/' + ids[0])).status, 200);
  assert.equal((await post(f, 'a', sale())).status, 429);
  assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM community_posts').get().n, 9);
});
