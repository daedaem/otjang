import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker, { createWorker } from '../worker.js';
import { authorizePrivateRequest } from '../functions/lib/private-access.js';

function harness(authorize, { privateSession = async () => null, extraEnv = {} } = {}) {
  const calls = { authorize: 0, rank: 0, weather: 0, catalog: 0, assets: 0 };
  const sessionCalls = [];
  const endpoint = (name) => async () => { calls[name]++; return new Response(name); };
  const app = createWorker({
    authorize: async (...args) => { calls.authorize++; return authorize(...args); },
    rank: endpoint('rank'), weather: endpoint('weather'), catalog: endpoint('catalog'),
    privateSession: async (request, env) => { sessionCalls.push(new URL(request.url).pathname); return privateSession(request, env); },
  });
  const env = { ASSETS: { fetch: endpoint('assets') }, ...extraEnv };
  return { app, env, calls, sessionCalls };
}

const routes = [
  ['/', 'GET', 'assets'], ['/index.html', 'GET', 'assets'],
  ['/shared/eoul-mock.js', 'GET', 'assets'], ['/icons/icon.svg', 'GET', 'assets'],
  ['/sw.js', 'GET', 'assets'], ['/manifest.webmanifest', 'GET', 'assets'],
  ['/api/rank', 'POST', 'rank'], ['/api/weather?lat=37.5&lon=127.0', 'GET', 'weather'],
  ['/api/catalog/search?q=shirt', 'GET', 'catalog'], ['/api/catalog/submit', 'POST', 'catalog'],
];

test('unconfigured or unauthenticated requests cannot reach any API or private asset', async () => {
  for (const access of [{ ok: false, status: 503 }, { ok: false, status: 401 }, null, { ok: 'true' }]) {
    const { app, env, calls } = harness(async () => access);
    for (const [path, method] of routes) {
      const response = await app.fetch(new Request(`https://private.example${path}`, { method }), env);
      assert.equal(response.status, access?.status === 401 ? 401 : 503);
      assert.match(response.headers.get('cache-control'), /no-store/);
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    }
    assert.deepEqual(calls, { authorize: routes.length, rank: 0, weather: 0, catalog: 0, assets: 0 });
  }
});

test('authentication errors fail closed without reflecting error or credential values', async () => {
  const { app, env, calls } = harness(async () => { throw new Error('DO_NOT_REFLECT'); });
  const response = await app.fetch(new Request('https://private.example/'), env);
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /DO_NOT_REFLECT/);
  assert.equal(calls.assets, 0);
});

test('verified requests route normally, with auth first even for cacheable private assets', async () => {
  const { app, env, calls } = harness(async () => ({ ok: true }));
  for (const [path, method, target] of routes) {
    const previous = calls[target];
    const response = await app.fetch(new Request(`https://private.example${path}`, { method }), env);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), target);
    assert.equal(calls[target], previous + 1);
    if (target === 'assets') assert.match(response.headers.get('cache-control'), /private, no-store/);
  }
  assert.equal(calls.authorize, routes.length);
});

test('method errors are returned after authorization and do not fall through to assets', async () => {
  const { app, env, calls } = harness(async () => ({ ok: true }));
  for (const [path, method] of [['/api/rank', 'GET'], ['/api/weather', 'POST']]) {
    const response = await app.fetch(new Request(`https://private.example${path}`, { method }), env);
    assert.equal(response.status, 405);
    assert.match(response.headers.get('cache-control'), /no-store/);
  }
  assert.deepEqual(calls, { authorize: 2, rank: 0, weather: 0, catalog: 0, assets: 0 });
});

test('deployed default cannot replace authentication using environment or request flags', async () => {
  let assets = 0;
  const response = await worker.fetch(new Request('https://private.example/?authorize=true', {
    headers: { 'Cf-Access-Jwt-Assertion': 'fake', 'X-Test-Authorize': 'true' },
  }), {
    authorize: async () => ({ ok: true }), OTJANG_PRIVATE_DEPLOY: 'owner-approved',
    ASSETS: { async fetch() { assets++; return new Response('private'); } },
  });
  assert.equal(response.status, 503);
  assert.equal(assets, 0);
});

test('deployed default rejects a forged JWT even when Access configuration is present', async () => {
  let assets = 0;
  const response = await worker.fetch(new Request('https://private.example/shared/eoul-mock.js', {
    headers: { 'Cf-Access-Jwt-Assertion': 'fake', Authorization: 'Bearer owner-approved' },
  }), {
    ACCESS_TEAM_DOMAIN: 'wardrobe-owner.cloudflareaccess.com', ACCESS_AUD: 'private-app-audience',
    ASSETS: { async fetch() { assets++; return new Response('private'); } },
  });
  assert.equal(response.status, 401);
  assert.match(response.headers.get('cache-control'), /no-store/);
  assert.equal(assets, 0);
});

test('Workers asset routing must pass every request through authentication', () => {
  const config = fs.readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  assert.match(config, /"run_worker_first"\s*:\s*true\b/);
});

test('session mode sends document navigations to login while APIs and assets stay closed', async () => {
  const { app, env, calls } = harness(async () => ({ ok: false, status: 401 }), {
    extraEnv: { PRIVATE_AUTH_MODE: 'session' },
  });
  for (const [path, headers] of [
    ['/', {}], ['/index.html', { accept: 'text/html' }],
    ['/saved', { 'sec-fetch-mode': 'navigate' }],
  ]) {
    const response = await app.fetch(new Request(`https://private.example${path}`, { headers }), env);
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/_private/login');
    assert.match(response.headers.get('cache-control'), /private, no-store/);
  }
  for (const [path, method] of routes.filter(([path]) => !['/', '/index.html'].includes(path))) {
    const response = await app.fetch(new Request(`https://private.example${path}`, {
      method, headers: { accept: 'text/html', 'sec-fetch-mode': 'navigate' },
    }), env);
    assert.equal(response.status, 401);
    assert.equal(response.headers.get('location'), null);
    const body = await response.json();
    assert.equal(body.error, 'unauthorized');
    assert.equal(body.login, '/_private/login');
  }
  assert.equal(calls.rank + calls.catalog + calls.weather + calls.assets, 0);
});

test('only the four exact private authentication paths may answer before authorization', async () => {
  const { app, env, calls, sessionCalls } = harness(async () => ({ ok: false, status: 401 }), {
    extraEnv: { PRIVATE_AUTH_MODE: 'session' },
    privateSession: async () => new Response('public authentication page'),
  });
  const endpoints = ['/_private/login', '/_private/session', '/_private/status', '/_private/logout'];
  for (const path of endpoints) {
    const response = await app.fetch(new Request(`https://private.example${path}`), env);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), 'public authentication page');
  }
  assert.deepEqual(sessionCalls, endpoints);
  assert.equal(calls.authorize, 0);
  for (const path of ['/_private', '/_private/login/', '/_private/session/extra', '/_private/login.json', '/_private/%6cogin', '/shared/eoul-mock.js']) {
    const response = await app.fetch(new Request(`https://private.example${path}`), env);
    assert.equal(response.status, 401);
  }
  assert.deepEqual(sessionCalls, endpoints);
  assert.equal(calls.authorize, 6);
  assert.equal(calls.assets + calls.rank + calls.weather + calls.catalog, 0);
});

test('unsupported session routes and handler errors fail through or fail closed', async () => {
  const unsupported = harness(async () => ({ ok: false, status: 503 }));
  const response = await unsupported.app.fetch(new Request('https://private.example/_private/login'), unsupported.env);
  assert.equal(response.status, 503);
  assert.equal(unsupported.calls.authorize, 1);
  const failed = harness(async () => ({ ok: true }), {
    privateSession: async () => { throw new Error('DO_NOT_REFLECT_SESSION_SECRET'); },
    extraEnv: { PRIVATE_AUTH_MODE: 'session' },
  });
  const error = await failed.app.fetch(new Request('https://private.example/_private/login'), failed.env);
  assert.equal(error.status, 503);
  assert.equal(error.headers.get('location'), null);
  assert.doesNotMatch(await error.text(), /DO_NOT_REFLECT_SESSION_SECRET/);
  assert.equal(failed.calls.authorize + failed.calls.assets, 0);
});

test('explicit mode selection does not fall back to another authentication mechanism', async () => {
  const request = new Request('https://private.example/shared/eoul-mock.js', {
    headers: { 'Cf-Access-Jwt-Assertion': 'forged', Authorization: 'Bearer owner-approved' },
  });
  const access = {
    ACCESS_TEAM_DOMAIN: 'wardrobe-owner.cloudflareaccess.com', ACCESS_AUD: 'private-app-audience',
  };
  for (const PRIVATE_AUTH_MODE of ['', 'Session', 'none', 'public', false, null]) {
    assert.deepEqual(await authorizePrivateRequest(request, { ...access, PRIVATE_AUTH_MODE }),
      { ok: false, status: 503, code: 'not_configured' });
  }
  // Explicit Access remains identical to the existing default and rejects a forged JWT.
  assert.deepEqual(await authorizePrivateRequest(request, { ...access, PRIVATE_AUTH_MODE: 'access' }),
    { ok: false, status: 401, code: 'unauthorized' });
  // Session mode does not borrow a plausible Access header/configuration when its own
  // runtime credentials are missing. No paid API or assets can run in this state.
  assert.deepEqual(await authorizePrivateRequest(request, { ...access, PRIVATE_AUTH_MODE: 'session' }),
    { ok: false, status: 503, code: 'not_configured' });
  let assets = 0;
  const response = await worker.fetch(request, {
    ...access, PRIVATE_AUTH_MODE: 'session',
    ASSETS: { async fetch() { assets++; return new Response('private catalog'); } },
  });
  assert.equal(response.status, 503);
  assert.equal(assets, 0);
});

test('real session login opens private routes only with its signed cookie and never bypasses Access mode', async () => {
  const db = new DatabaseSync(':memory:');
  const RANK_DB = {
    prepare(sql) {
      let values = [];
      return {
        bind(...args) { values = args; return this; },
        async run() {
          const result = db.prepare(sql).run(...values);
          return { success: true, meta: { changes: Number(result.changes) } };
        },
      };
    },
  };
  const secret = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, '0')).join('');
  const calls = { rank: 0, weather: 0, catalog: 0, assets: 0 };
  const endpoint = (name) => async () => { calls[name]++; return new Response(name); };
  const app = createWorker({ rank: endpoint('rank'), weather: endpoint('weather'), catalog: endpoint('catalog') });
  const env = { PRIVATE_AUTH_MODE: 'session', PRIVATE_APP_ACCESS_KEY: secret, RANK_DB, ASSETS: { fetch: endpoint('assets') } };
  try {
    assert.equal((await app.fetch(new Request('https://private.example/'), env)).status, 303);
    assert.equal((await app.fetch(new Request('https://private.example/shared/eoul-mock.js'), env)).status, 401);
    const login = await app.fetch(new Request('https://private.example/_private/session', {
      method: 'POST', headers: { Origin: 'https://private.example', 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.1' },
      body: JSON.stringify({ password: secret }),
    }), env);
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie').split(';')[0];
    assert.ok(!cookie.includes(secret));
    assert.deepEqual(await login.json(), { ok: true });
    for (const [path, method, target] of routes) {
      const previous = calls[target];
      const response = await app.fetch(new Request(`https://private.example${path}`, { method, headers: { Cookie: cookie } }), env);
      assert.equal(response.status, 200);
      assert.equal(await response.text(), target);
      assert.equal(calls[target], previous + 1);
    }
    const accessEnv = { ...env, PRIVATE_AUTH_MODE: 'access', ACCESS_TEAM_DOMAIN: 'wardrobe-owner.cloudflareaccess.com', ACCESS_AUD: 'private-app-audience' };
    const access = await app.fetch(new Request('https://private.example/', { headers: { Cookie: cookie } }), accessEnv);
    assert.equal(access.status, 401);
    assert.equal(access.headers.get('location'), null);
    const accessLogin = await app.fetch(new Request('https://private.example/_private/login'), accessEnv);
    assert.equal(accessLogin.status, 401);
  } finally { db.close(); }
});
