import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { openDatabase } from '../src/db.js';
import { createApp, AGREEMENT_VERSION } from '../src/app.js';
import { createSupply } from '../src/supply.js';

async function start(supply) {
  const db = openDatabase(':memory:');
  const app = createApp({ db, supply, config: { allowedOrigins: [], trustProxy: null, inviteCode: null, scryptLog2N: 10, sessionDays: 60, appFile: '/none' } });
  const server = http.createServer((req, res) => app.handle(req, res));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const { token } = await (await fetch(`${base}/v1/auth/signup`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'p@example.com', password: 'correct horse', agreements: { version: AGREEMENT_VERSION, terms: true, privacy: true, age14: true } }) })).json();
  return { base, token, close: () => new Promise((resolve) => server.close(() => { db.close(); resolve(); })) };
}

test('offers: signed in only, checked input, sources with their status in health', async (t) => {
  const s = await start(createSupply({ env: {} }));
  t.after(s.close);
  const get = (path, token = s.token) => fetch(`${s.base}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  assert.equal((await get('/v1/offers?productId=ms-3323583', null)).status, 401);
  assert.equal((await get('/v1/offers?productId=abc')).status, 400);
  assert.equal((await get('/v1/offers')).status, 400);
  const ok = await (await get('/v1/offers?productId=ms-3323583')).json();
  assert.equal(ok.offers[0].source, 'catalog');
  assert.ok(ok.sources.some((source) => source.id === 'naver-shopping' && source.status === 'discontinued'));
  const unlisted = await (await get('/v1/offers?productId=ms-5755268&q=%EB%B8%8C%EB%9E%9C%EB%93%9C')).json();
  assert.deepEqual(unlisted.offers, [], 'an unlisted product gets no catalog price and no substitute');
  const health = await (await fetch(`${s.base}/v1/health`)).json();
  assert.equal(health.features.offers, true);
  assert.ok(health.supply.find((source) => source.id === 'musinsa').needs.length);
});

test('offers: off when the server has no supply configured', async (t) => {
  const s = await start(null);
  t.after(s.close);
  assert.equal((await fetch(`${s.base}/v1/offers?productId=ms-3323583`, { headers: { Authorization: `Bearer ${s.token}` } })).status, 404);
  assert.equal((await (await fetch(`${s.base}/v1/health`)).json()).features.offers, false);
});
