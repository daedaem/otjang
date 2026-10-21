import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { handleRakuten, offers, takeSlot, ENDPOINT, APP_ORIGIN, onRequest } from '../functions/api/rakuten.js';
import { createWorker } from '../worker.js';

function db() {
  const raw = new DatabaseSync(':memory:');
  return {
    raw,
    prepare(sql) {
      let args = [];
      const st = { bind(...values) { args = values; return st; },
        async run() { raw.prepare(sql).run(...args); return { success: true }; },
        execute() { const q = raw.prepare(sql); return /RETURNING/.test(sql) ? { results: q.all(...args) } : { meta: { changes: Number(q.run(...args).changes) } }; },
      }; return st;
    },
    async batch(statements) {
      raw.exec('BEGIN IMMEDIATE');
      try { const out = statements.map((s) => s.execute()); raw.exec('COMMIT'); return out; }
      catch (error) { raw.exec('ROLLBACK'); throw error; }
    },
  };
}
const env = () => ({ RAKUTEN_APPLICATION_ID: 'synthetic-app-id', RAKUTEN_ACCESS_KEY: 'synthetic-test-access-key', RANK_DB: db() });
const request = (q = 'Levis 501') => new Request(`https://private.example/api/rakuten?q=${encodeURIComponent(q)}`);
const item = { itemName: 'Synthetic shirt', shopName: 'Synthetic shop', itemPrice: 1234, itemUrl: 'https://item.rakuten.co.jp/example/shirt/', availability: 1, mediumImageUrls: [{ imageUrl: 'https://thumbnail.image.rakuten.co.jp/example.jpg' }], taxFlag: 0 };

test('without keys, DB or a valid query no upstream request is made', async () => {
  let calls = 0;
  const options = { fetcher: async () => { calls++; throw new Error('not allowed'); } };
  for (const [req, config, expected] of [
    [request(), {}, 503], [request(), { ...env(), RANK_DB: null }, 503],
    [request('x'), env(), 400], [request('a'.repeat(129)), env(), 400],
    [new Request(request().url, { method: 'POST' }), env(), 405],
  ]) assert.equal((await handleRakuten(req, config, options)).status, expected);
  assert.equal(calls, 0);
});

test('official request uses only a bounded keyword and server credentials, returning unmodified offers in provider order', async () => {
  const config = env();
  const response = await handleRakuten(request('Levis 501'), config, { fetcher: async (url, options) => {
    const parsed = new URL(url);
    assert.equal(parsed.origin + parsed.pathname, ENDPOINT);
    assert.equal(parsed.searchParams.get('keyword'), 'Levis 501');
    assert.equal(parsed.searchParams.get('hits'), '12');
    assert.equal(parsed.searchParams.get('applicationId'), config.RAKUTEN_APPLICATION_ID);
    assert.equal(parsed.searchParams.has('accessKey'), false);
    assert.equal(parsed.searchParams.has('affiliateId'), false);
    assert.equal(options.headers.accessKey, config.RAKUTEN_ACCESS_KEY);
    assert.equal(options.headers.Origin, APP_ORIGIN);
    assert.equal(options.headers.Referer, `${APP_ORIGIN}/`);
    assert.equal(options.redirect, 'error');
    return Response.json({ Items: [{ Item: item }, { Item: { ...item, itemName: 'Second', itemPrice: 100 } }] });
  } });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('cache-control'), /no-store/);
  const out = await response.json();
  assert.deepEqual(out.items.map((x) => [x.name, x.price, x.currency]), [['Synthetic shirt', 1234, 'JPY'], ['Second', 100, 'JPY']]);
  assert.doesNotMatch(JSON.stringify(out), /synthetic-app-id|synthetic-test-access-key/);
});

test('off-domain links, invalid prices, missing identity and unavailable offers are omitted', () => {
  for (const bad of [{ itemUrl: 'javascript:alert(1)' }, { itemUrl: 'https://item.rakuten.co.jp.attacker.test/x' }, { itemUrl: 'https://user:password@item.rakuten.co.jp/x' }, { itemPrice: '100' }, { availability: 0 }, { shopName: '' }]) {
    assert.deepEqual(offers({ Items: [{ Item: { ...item, ...bad } }] }), []);
  }
  assert.equal(offers({ Items: [{ Item: { ...item, mediumImageUrls: [{ imageUrl: 'https://tracking.attacker.test/x' }] } }] })[0].image, null);
  assert.equal(offers({ error: 'upstream invalid' }), null);
});

test('upstream failures, malformed/oversized or stalled responses reveal no raw error or secret', async () => {
  const fetchers = [
    async () => { throw new Error('synthetic-test-access-key'); },
    async () => new Response('synthetic-test-access-key', { status: 403 }),
    async () => new Response('not json'),
    async () => new Response('x'.repeat(1000001)),
    async () => new Promise(() => {}),
    async () => new Response(new ReadableStream({ start() {} })),
  ];
  for (const fetcher of fetchers) {
    const response = await handleRakuten(request(), env(), { fetcher, timeoutMs: 15 });
    assert.equal(response.status, 502);
    assert.doesNotMatch(await response.text(), /synthetic|not json/);
  }
  const missing = await handleRakuten(request(), env(), { fetcher: async () => new Response(null, { status: 404 }) });
  assert.deepEqual((await missing.json()).items, []);
});

test('D1 enforces one shared request/second and at most ten attempts/minute across concurrent callers', async () => {
  const store = db();
  const base = Date.parse('2026-10-21T00:00:00Z');
  const sameSecond = await Promise.all(Array.from({ length: 5 }, () => takeSlot(store, base)));
  assert.equal(sameSecond.filter(Boolean).length, 1);
  let allowed = 1;
  for (let i = 1; i < 20; i++) if (await takeSlot(store, base + i * 1000)) allowed++;
  assert.ok(allowed <= 10);
  assert.equal(await takeSlot(store, base + 60000), true);
  assert.equal(await takeSlot(store, base + 240000), true);
  assert.ok(store.raw.prepare('SELECT COUNT(*) AS n FROM external_source_usage').get().n < 5);
});

test('Rakuten route stays behind private authorization and never falls through to static assets', async () => {
  let called = 0;
  const app = (ok) => createWorker({ authorize: async () => ({ ok, status: 401 }), rakuten: async () => { called++; return new Response('source'); } });
  assert.equal((await app(false).fetch(request(), {})).status, 401);
  assert.equal(called, 0);
  assert.equal(await (await app(true).fetch(request(), {})).text(), 'source');
  assert.equal(called, 1);
});

test('Pages entry also fails closed before a provider call when authentication is unconfigured', async () => {
  assert.equal((await onRequest({ request: request(), env: {} })).status, 503);
});

test('provider authorization errors have a safe status/code and never reflect error details or credentials', async () => {
  const res = await handleRakuten(request(), env(), { fetcher: async () => new Response('denied synthetic-test-access-key', { status: 403 }) });
  const body = await res.json();
  assert.equal(res.status, 502);
  assert.equal(body.code, 'provider_auth');
  assert.equal(body.upstreamStatus, 403);
  assert.doesNotMatch(JSON.stringify(body), /synthetic|denied/);
});

test('format failures expose only safe public schema names, not response values', async () => {
  const res = await handleRakuten(request(), env(), { fetcher: async () => Response.json({ items: [], error_description: 'synthetic-test-access-key', privateField: 'hidden' }) });
  const body = await res.json();
  assert.equal(body.code, 'provider_shape');
  assert.deepEqual(body.upstreamKeys, ['items', 'error_description']);
  assert.doesNotMatch(JSON.stringify(body), /synthetic|privateField|hidden/);
  const html = await handleRakuten(request(), env(), { fetcher: async () => new Response('<html>private text</html>', { headers: { 'content-type': 'text/html' } }) });
  assert.deepEqual((await html.json()).upstreamFormat, 'html');
});
