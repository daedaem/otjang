import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { authorizeSession, handlePrivateSession } from '../functions/lib/private-session.js';

const NOW = Date.parse('2026-10-21T10:20:30Z');
const TTL = 7 * 24 * 60 * 60 * 1000;
// Fresh synthetic keys only. Never use a runtime Secret or a real user's password in tests.
const secret = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, '0')).join('');
function fakeD1(raw = new DatabaseSync(':memory:')) {
  return {
    raw,
    prepare(sql) {
      let args = [];
      const statement = {
        bind(...values) { args = values; return statement; },
        async run() { const result = raw.prepare(sql).run(...args); return { success: true, meta: { changes: Number(result.changes) } }; },
      };
      return statement;
    },
  };
}
const environment = (db = fakeD1()) => ({ PRIVATE_AUTH_MODE: 'session', PRIVATE_APP_ACCESS_KEY: secret(), RANK_DB: db });
function request(path, { password, method = password === undefined ? 'GET' : 'POST', origin = 'https://private.example', cookie, ip = '192.0.2.1', headers = {}, body } = {}) {
  return new Request(`https://private.example${path}`, {
    method, headers: { ...(origin === null ? {} : { Origin: origin }), 'Content-Type': 'application/json', 'CF-Connecting-IP': ip, ...(cookie ? { Cookie: cookie } : {}), ...headers },
    ...(method === 'POST' ? { body: body === undefined ? JSON.stringify({ password }) : body } : {}),
  });
}
async function login(env, options = {}) {
  return handlePrivateSession(request('/_private/session', { password: env.PRIVATE_APP_ACCESS_KEY, ...options }), env, { now: () => NOW });
}
const cookieFrom = (response) => response.headers.get('set-cookie').split(';')[0];

test('login page works before setup and contains no remote assets, key or persistent browser storage', async () => {
  const page = await handlePrivateSession(request('/_private/login'), {});
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /type="password"/);
  assert.doesNotMatch(html, /https?:\/\/|localStorage|sessionStorage|console\./);
  assert.match(page.headers.get('content-security-policy'), /default-src 'none'/);
  assert.match(page.headers.get('cache-control'), /no-store/);
});

test('only a configured session mode and a 32–256 printable ASCII server key work', async () => {
  for (const env of [{}, { PRIVATE_AUTH_MODE: 'access', PRIVATE_APP_ACCESS_KEY: secret() }, ...[undefined, '', 'x'.repeat(31), 'x'.repeat(257), '가'.repeat(32), ' '.repeat(32), 'x'.repeat(31) + '\n'].map((PRIVATE_APP_ACCESS_KEY) => ({ PRIVATE_AUTH_MODE: 'session', PRIVATE_APP_ACCESS_KEY }))]) {
    assert.deepEqual(await authorizeSession(request('/'), env), { ok: false, status: 503, code: 'not_configured' });
    const response = await handlePrivateSession(request('/_private/session', { password: 'wrong' }), env);
    assert.equal(response.status, 503);
  }
});

test('login sets a nonce-bearing HMAC cookie for seven days without returning a password', async () => {
  const env = environment();
  const response = await login(env);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  const set = response.headers.get('set-cookie');
  assert.match(set, /^__Host-otjang-session=v1\./);
  for (const attribute of ['Path=/', 'HttpOnly', 'Secure', 'SameSite=Strict', 'Max-Age=604800']) assert.ok(set.includes(attribute));
  assert.ok(!set.includes(env.PRIVATE_APP_ACCESS_KEY));
  const cookie = cookieFrom(response);
  assert.deepEqual(await authorizeSession(request('/', { cookie }), env, { now: () => NOW }), { ok: true });
  const another = await login(env);
  assert.notEqual(cookieFrom(another), cookie);
  const status = await handlePrivateSession(request('/_private/status', { cookie }), env, { now: () => NOW });
  assert.deepEqual(await status.json(), { authenticated: true });
});

test('missing, duplicate, tampered, expired, future and previous-key cookies are rejected', async () => {
  const env = environment();
  const cookie = cookieFrom(await login(env));
  for (const malformed of [undefined, '', '__Host-otjang-session=fake', `${cookie}; ${cookie}`, cookie.slice(0, -1) + (cookie.endsWith('a') ? 'b' : 'a'), cookie.replace('=v1.', '=v2.'), `${cookie}=`]) {
    assert.equal((await authorizeSession(request('/', { cookie: malformed }), env, { now: () => NOW })).status, 401);
  }
  assert.equal((await authorizeSession(request('/', { cookie }), env, { now: () => NOW + TTL })).status, 401);
  assert.equal((await authorizeSession(request('/', { cookie }), env, { now: () => NOW - 1000 })).status, 401);
  assert.equal((await authorizeSession(request('/', { cookie }), { ...env, PRIVATE_APP_ACCESS_KEY: secret() }, { now: () => NOW })).status, 401);
  assert.equal((await authorizeSession(request('/', { cookie }), env, { now: () => NaN })).status, 401);
});

test('login and logout require exact HTTPS same Origin; bad input never sets a cookie', async () => {
  const env = environment();
  for (const origin of [null, 'null', 'https://evil.example', 'https://private.example.evil.test', 'http://private.example']) {
    const response = await login(env, { origin });
    assert.equal(response.status, 403);
    assert.equal(response.headers.get('set-cookie'), null);
  }
  for (const [options, status] of [
    [{ body: '{' }, 400], [{ body: '{"password":1}' }, 400], [{ body: '{"password":"x","admin":true}' }, 400],
    [{ headers: { 'Content-Type': 'text/plain' } }, 415], [{ body: 'x'.repeat(1025) }, 413],
    [{ headers: { 'Content-Length': '1025' } }, 413], [{ headers: { 'Content-Length': '0' }, body: 'x'.repeat(1025) }, 413],
  ]) {
    const response = await login(env, options);
    assert.equal(response.status, status);
    assert.equal(response.headers.get('set-cookie'), null);
  }
  const wrong = await login(env, { password: 'wrong' });
  assert.equal(wrong.status, 401);
  assert.equal(wrong.headers.get('set-cookie'), null);
  assert.deepEqual(await wrong.json(), { error: 'unauthorized' });
});

test('D1 absent, failed or ambiguous reservations fail closed without issuing a session', async () => {
  for (const db of [undefined, { prepare() { throw Error('SECRET_MUST_NOT_ESCAPE'); } }, { prepare() { return { bind() { return this; }, async run() { return { meta: {} }; } }; } }]) {
    const env = environment(db);
    if (db === undefined) delete env.RANK_DB;
    const response = await login(env);
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('set-cookie'), null);
    assert.doesNotMatch(await response.text(), /SECRET_MUST_NOT_ESCAPE/);
  }
});

test('session flow makes zero external calls and can use the existing CROWD_DB binding', async () => {
  const previousFetch = globalThis.fetch;
  let externalCalls = 0;
  globalThis.fetch = async () => { externalCalls++; throw Error('external calls forbidden'); };
  try {
    const db = fakeD1(), env = environment(db);
    delete env.RANK_DB;
    env.CROWD_DB = db;
    const response = await login(env);
    assert.equal(response.status, 200);
    assert.equal((await authorizeSession(request('/', { cookie: cookieFrom(response) }), env, { now: () => NOW })).ok, true);
    assert.equal(externalCalls, 0);
  } finally { globalThis.fetch = previousFetch; }
});

test('65 concurrent attempts from one IP reserve at most five even across module/DB instances', async () => {
  const raw = new DatabaseSync(':memory:');
  const env = environment(fakeD1(raw));
  const other = await import('../functions/lib/private-session.js?other-isolate=1');
  const responses = await Promise.all(Array.from({ length: 65 }, (_, i) => {
    const handle = i % 2 ? other.handlePrivateSession : handlePrivateSession;
    return handle(request('/_private/session', { password: 'wrong' }), { ...env, RANK_DB: fakeD1(raw) }, { now: () => NOW });
  }));
  assert.equal(responses.filter((r) => r.status === 401).length, 5);
  assert.equal(responses.filter((r) => r.status === 429).length, 60);
  const rows = raw.prepare('SELECT * FROM private_login_usage').all();
  assert.equal(rows.length, 5);
  assert.ok(rows.every((r) => !r.ip_tag.includes('192.0.2.1') && !r.ip_tag.includes(env.PRIVATE_APP_ACCESS_KEY)));
  assert.deepEqual(raw.prepare('PRAGMA table_info(private_login_usage)').all().map((r) => r.name), ['utc_minute', 'ip_tag']);
});

test('global minute cap is sixty; minute change releases quota and removes records older than two minutes', async () => {
  const db = fakeD1(), env = environment(db);
  const responses = await Promise.all(Array.from({ length: 65 }, (_, i) => login(env, { password: 'wrong', ip: `192.0.2.${i + 1}` })));
  assert.equal(responses.filter((r) => r.status === 401).length, 60);
  assert.equal(responses.filter((r) => r.status === 429).length, 5);
  const next = await handlePrivateSession(request('/_private/session', { password: env.PRIVATE_APP_ACCESS_KEY }), env, { now: () => NOW + 120_000 });
  assert.equal(next.status, 200);
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM private_login_usage').get().n, 1);
});

test('logout deletes only the session cookie and requires current session and same Origin', async () => {
  const env = environment(), cookie = cookieFrom(await login(env));
  const response = await handlePrivateSession(request('/_private/logout', { method: 'POST', cookie }), env, { now: () => NOW });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('set-cookie'), /Max-Age=0/);
  assert.equal(response.headers.get('Clear-Site-Data'), null);
  assert.doesNotMatch(await response.text(), /localStorage|wardrobe|password/);
  assert.equal((await handlePrivateSession(request('/_private/logout', { method: 'POST', cookie, origin: 'https://evil.example' }), env, { now: () => NOW })).status, 403);
  assert.equal((await handlePrivateSession(request('/_private/logout', { method: 'POST' }), env, { now: () => NOW })).status, 401);
});

test('private endpoints reject unsupported methods and unknown paths are not consumed', async () => {
  for (const path of ['/_private/session', '/_private/logout']) {
    const response = await handlePrivateSession(request(path), {});
    assert.equal(response.status, 405);
    assert.equal(response.headers.get('Allow'), 'POST');
  }
  assert.equal(await handlePrivateSession(request('/unknown'), {}), null);
});
