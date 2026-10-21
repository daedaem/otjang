import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readOpenProducts, findOpenProducts } from '../functions/lib/open-products-store.js';
import { handleOpenProducts } from '../functions/api/open-products.js';
import { handle } from '../functions/api/rank.js';
import { createWorker } from '../worker.js';
const allow = async () => ({ ok: true });
function fakeD1() {
  const db = new DatabaseSync(':memory:');
  return {
    raw: db,
    prepare(sql) {
      let args = [];
      const st = { bind(...a) { assert.ok(a.length <= 100, 'D1 Free parameter limit'); args = a; return st; },
        async first() { return db.prepare(sql).get(...args) ?? null; },
        async all() { return { results: db.prepare(sql).all(...args) }; },
        execute() { const r = db.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes) } }; },
        async run() { return st.execute(); } };
      return st;
    },
    async batch(statements) {
      db.exec('BEGIN IMMEDIATE');
      try {
        const results = statements.map((statement) => statement.execute());
        db.exec('COMMIT');
        return results;
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    },
  };
}

test('ODbL seeding is idempotent, independent and exports the same DB facts with notices', async () => {
  const db = fakeD1(), env = { CROWD_DB: db };
  db.raw.exec("CREATE TABLE personal_sentinel (data TEXT); INSERT INTO personal_sentinel VALUES ('preserve');");
  const [a, b] = await Promise.all([readOpenProducts(env), readOpenProducts(env)]);
  assert.equal(a.items.length, 194); assert.deepEqual(a, b);
  assert.equal(a.storage, 'D1'); assert.equal(a.license, 'ODbL-1.0');
  assert.match(a.attribution, /Open Products Facts/);
  assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM open_product_facts').get().n, 194);
  assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM open_product_snapshots').get().n, 1);
  assert.equal(db.raw.prepare('SELECT data FROM personal_sentinel').get().data, 'preserve');
  const response = await handleOpenProducts(new Request('https://x.test/api/open-products/export'), env, { authorize: allow });
  assert.equal(response.status, 200); assert.match(response.headers.get('content-disposition'), /attachment/);
  assert.deepEqual(await response.json(), a);
  assert.ok(a.items.every((p) => !('price' in p) && !('image' in p)));
  const shirts = await findOpenProducts(env, '유니클로 티셔츠');
  assert.ok(shirts.items.length > 0);
  assert.ok(shirts.items.every((p) => p.brand === 'Uniqlo' && p.categories.includes('en:t-shirts')));
  assert.deepEqual((await findOpenProducts(env, '유니클로 100원 이하')).items, []);
  assert.deepEqual((await findOpenProducts(env, '존재하지않는상품')).items, []);
});

test('unauthenticated, invalid and unavailable DB requests fail closed without a replacement catalog', async () => {
  let reads = 0;
  const env = { CROWD_DB: { prepare() { reads++; throw Error('internal secret'); }, batch() {} } };
  const request = new Request('https://x.test/api/open-products?q=셔츠');
  assert.equal((await handleOpenProducts(request, env, { authorize: async () => ({ ok: false, status: 401 }) })).status, 401);
  assert.equal(reads, 0);
  const failed = await handleOpenProducts(request, env, { authorize: allow });
  assert.equal(failed.status, 503); assert.doesNotMatch(await failed.text(), /internal secret/);
  for (const path of ['/api/open-products?q=', '/api/open-products?q=' + 'a'.repeat(121), '/api/open-products/unknown']) {
    assert.ok([400, 404].includes((await handleOpenProducts(new Request('https://x.test'+path), {}, { authorize: allow })).status));
  }
  let invoked = 0;
  const options = { openProducts: async () => { invoked++; return new Response('open-db'); } };
  for (const path of ['/api/open-products?q=셔츠', '/api/open-products/export']) {
    const req = new Request('https://x.test'+path);
    assert.equal((await createWorker({ ...options, authorize: async () => ({ ok: false, status: 401 }) }).fetch(req, {})).status, 401);
    assert.equal(await (await createWorker({ ...options, authorize: allow }).fetch(req, {})).text(), 'open-db');
  }
  assert.equal(invoked, 2);
});

const post = (value) => new Request('https://x.test/api/rank', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) });
test('open AI uses server DB identities and existing quota; client facts, unknown ids and invented output are rejected', async () => {
  const env = { CROWD_DB: fakeD1() }, calls = [];
  const ids = (await findOpenProducts(env, '유니클로')).items.slice(0, 2).map((p) => p.code);
  assert.equal(ids.length, 2);
  const value = { task: 'open_rank', query: '유니클로', items: ids };
  let reservations = 0, ranking = ids.map((id) => ({ id, reason: '상품명과 브랜드를 확인할 후보예요.' }));
  const client = { messages: { async create(req) { calls.push(req); return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ summary: '공개 상품명 기준 비교예요.', ranking }) }] }; } } };
  const options = { client, authorize: allow, reserve: async () => { reservations++; return { ok: true }; } };
  const res = await handle(post(value), env, options);
  assert.equal(res.status, 200);
  const out = await res.json(); assert.equal(out.comparisonOnly, true); assert.equal(out.license, 'ODbL-1.0');
  const sent = JSON.parse(calls[0].messages[0].content);
  assert.equal(sent.source, 'Open Products Facts');
  assert.ok(sent.items.every((p) => !('price' in p) && !('image' in p) && !('closet' in p)));
  assert.match(calls[0].system, /추정하면 안/);
  for (const v of [{ ...value, items: ['123456789'] }, { ...value, items: [ids[0], ids[0]] }, { ...value, closet: [] }, { ...value, price: 1 }, { ...value, items: [{ id: ids[0], name: 'fake' }] }]) {
    assert.equal((await handle(post(v), env, options)).status, 400);
  }
  assert.equal(reservations, 1); assert.equal(calls.length, 1);
  assert.equal((await handle(post(value), env, { ...options, reserve: async () => ({ ok: false, status: 429 }) })).status, 429);
  assert.equal(calls.length, 1);
  for (const bad of [[], [{ id: '123456789', reason: 'fake' }], ids.map(() => ({ id: ids[0], reason: 'duplicate' })), ids.map((id) => ({ id, reason: 'extra', price: 100 }))]) {
    ranking = bad;
    assert.equal((await handle(post(value), env, options)).status, 502);
  }
});
