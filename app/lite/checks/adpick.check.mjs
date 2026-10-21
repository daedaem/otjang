// Synthetic provider fixtures only; no live key, user wardrobe or paid AI call.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { handleAdpick, offers, malls, takeSlot, onRequest } from '../functions/api/adpick.js';
import { createWorker } from '../worker.js';
const KEY = 'synthetic-adpick-test-key';
function db() {
  const raw = new DatabaseSync(':memory:');
  return { raw, prepare(sql) { let args = []; const s = {
    bind(...v) { args = v; return s; }, async run() { raw.prepare(sql).run(...args); return { success: true }; },
    execute() { const q = raw.prepare(sql); return /RETURNING/.test(sql) ? { results: q.all(...args) } : { meta: { changes: Number(q.run(...args).changes) } }; },
  }; return s; }, async batch(statements) { raw.exec('BEGIN IMMEDIATE'); try { const out = statements.map((s) => s.execute()); raw.exec('COMMIT'); return out; } catch(e) { raw.exec('ROLLBACK'); throw e; } } };
}
const env = () => ({ ADPICK_API_KEY: KEY, RANK_DB: db() });
const request = (q = '옥스포드 셔츠') => new Request(`https://private.example/api/adpick?q=${encodeURIComponent(q)}`);
const item = { title: '합성 테스트 셔츠', price: '29,900원', photo: 'https://cdn.adpick.co.kr/synthetic.jpg', cp_code: 'COUPANG', cp_name: '쿠팡', commissionlink: 'https://link.adpick.co.kr/synthetic' };
const response = (...items) => ({ success: true, data: items });
test('Adpick input, missing credentials and missing quota DB fail before any provider call', async () => {
  let calls = 0;
  const options = { fetcher: async () => { calls++; throw Error('not allowed'); } };
  for (const [req, config, status] of [
    [request(), {}, 503], [request(), { ...env(), RANK_DB: null }, 503],
    [request('x'), env(), 400], [request('가'.repeat(101)), env(), 400],
    [request('셔츠\n키'), env(), 400], [new Request(request().url + '&url=https://other.test'), env(), 400],
    [new Request('https://private.example/api/adpick/unknown'), env(), 404],
    [new Request(request().url, { method: 'POST' }), env(), 405],
  ]) assert.equal((await handleAdpick(req, config, options)).status, status);
  assert.equal(calls, 0);
});
test('Adpick calls only official search with a server path key, bounded Korean query and original affiliate links', async () => {
  const res = await handleAdpick(request(), env(), { fetcher: async (raw, init) => {
    const url = new URL(raw);
    assert.equal(url.origin, 'https://biz.adpick.co.kr');
    assert.equal(url.pathname, `/api/${KEY}/search`);
    assert.equal(url.searchParams.get('q'), '옥스포드 셔츠');
    assert.equal(url.searchParams.get('limit'), '20');
    assert.deepEqual([...url.searchParams.keys()].sort(), ['limit', 'q']);
    assert.equal(init.redirect, 'manual');
    assert.equal(init.cache, 'no-store');
    return Response.json(response(item, { ...item, title: '두 번째', price: 42000 }));
  } });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('cache-control'), /no-store/);
  const out = await res.json();
  assert.deepEqual(out.items.map((p) => [p.name, p.price]), [[item.title, '29,900원'], ['두 번째', '42,000원']]);
  assert.equal(out.items[0].url, item.commissionlink);
  assert.equal(out.items[0].currency, 'KRW');
  assert.doesNotMatch(JSON.stringify(out), /synthetic-adpick-test-key|\/api\//);
});
test('Adpick normalization never guesses brand/availability and rejects unsafe links or credential echoes', () => {
  const good = offers(response(item), KEY)[0];
  assert.equal(Object.hasOwn(good, 'brand'), false);
  assert.equal(Object.hasOwn(good, 'availability'), false);
  for (const bad of [
    { title: KEY }, { price: KEY }, { cp_name: '' }, { cp_name: 'SHEIN' }, { cp_name: '알리익스프레스' }, { cp_name: '미확인 판매처' }, { cp_code: '' }, { commissionlink: '' },
    { commissionlink: 'javascript:alert(1)' }, { commissionlink: 'https://link.adpick.co.kr.attacker.test/x' },
    { commissionlink: 'https://user:password@link.adpick.co.kr/x' }, { commissionlink: `https://link.adpick.co.kr/${KEY}` },
  ]) assert.deepEqual(offers(response({ ...item, ...bad }), KEY), []);
  for (const photo of ['http://insecure.test/image.jpg', 'https://127.0.0.1/a.jpg', `https://cdn.adpick.co.kr/${KEY}.jpg`]) {
    assert.equal(offers(response({ ...item, photo }), KEY)[0].image, null);
  }
  assert.equal(offers({ success: false, data: [] }, KEY), null);
  assert.equal(offers({ success: true, data: {} }, KEY), null);
  assert.deepEqual(offers(response(), KEY), []);
});
test('Adpick mall lookup returns identity only; account commissions, reports and links are excluded', async () => {
  const raw = response({ cp_code: 'SYNTHETIC', name: '합성몰', commission_per: 9, commissionlink: 'private link' });
  assert.deepEqual(malls(raw, KEY), [{ code: 'SYNTHETIC', name: '합성몰' }]);
  const res = await handleAdpick(new Request('https://private.example/api/adpick/malls'), env(), { fetcher: async (rawUrl) => {
    const url = new URL(rawUrl);
    assert.equal(url.pathname, `/api/${KEY}/malls`);
    assert.equal(url.searchParams.get('rewardmalls'), 'false');
    return Response.json(raw);
  } });
  assert.deepEqual((await res.json()).malls, [{ code: 'SYNTHETIC', name: '합성몰' }]);
});
test('Adpick provider errors, redirects, hangs and oversized bodies reveal neither path key nor raw response', async () => {
  for (const fetcher of [
    async () => new Response(KEY, { status: 403 }),
    async () => new Response(KEY, { status: 302, headers: { Location: `https://attacker.test/${KEY}` } }),
    async () => Response.json({ success: false, message: KEY, data: [] }),
    async () => Response.json({ success: true, data: {} }),
    async () => new Response('x'.repeat(1000001)), async () => new Response('not json ' + KEY),
    async () => { throw Error(KEY); }, async () => new Promise(() => {}),
    async () => new Response(new ReadableStream({ start() {} })),
  ]) {
    const res = await handleAdpick(request(), env(), { fetcher, timeoutMs: 15 });
    assert.equal(res.status, 502);
    assert.doesNotMatch(await res.text(), /synthetic|attacker|not json/);
  }
});
test('Adpick shares ten search attempts per minute, isolates mall counters and expires only counters', async () => {
  const store = db(), now = Date.parse('2026-10-21T00:00:00Z');
  assert.equal((await Promise.all(Array.from({ length: 4 }, () => takeSlot(store, 'search', now)))).filter(Boolean).length, 1);
  assert.equal(await takeSlot(store, 'malls', now), true);
  let allowed = 1;
  for (let i = 1; i < 20; i++) if (await takeSlot(store, 'search', now + i * 1000)) allowed++;
  assert.ok(allowed <= 10);
  assert.equal(await takeSlot(store, 'search', now + 60000), true);
  assert.equal(await takeSlot(store, 'search', now + 240000), true);
  assert.ok(store.raw.prepare('SELECT COUNT(*) AS n FROM external_source_usage').get().n < 5);
});
test('Adpick Worker and Pages routes stay behind owner authentication and do not fall through to assets', async () => {
  let calls = 0;
  const app = (ok) => createWorker({ authorize: async () => ({ ok, status: 401 }), adpick: async () => { calls++; return new Response('adpick'); } });
  for (const req of [request(), new Request('https://private.example/api/adpick/malls')]) {
    assert.equal((await app(false).fetch(req, {})).status, 401);
    assert.equal(await (await app(true).fetch(req, {})).text(), 'adpick');
  }
  assert.equal(calls, 2);
  assert.equal((await onRequest({ request: request(), env: {} })).status, 503);
});
