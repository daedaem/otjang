import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authorizePrivateRequest } from '../functions/lib/private-access.js';

const issuer = 'https://qa-private.cloudflareaccess.com';
const env = { ACCESS_TEAM_DOMAIN: issuer, ACCESS_AUD: 'qa-audience' };
const ms = 1792540800000;
const seconds = ms / 1000;
const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const jwk = { ...await crypto.subtle.exportKey('jwk', pair.publicKey), kid: 'qa-key', alg: 'RS256', use: 'sig' };
const encode = (value) => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');
async function token(claims = {}, header = {}, key = pair.privateKey) {
  const input = `${encode({ alg: 'RS256', kid: jwk.kid, ...header })}.${encode({ iss: issuer, aud: [env.ACCESS_AUD], iat: seconds - 10, nbf: seconds - 10, exp: seconds + 60, ...claims })}`;
  return `${input}.${Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(input))).toString('base64url')}`;
}
const request = (value) => new Request('https://qa.invalid/api/rank', { headers: value ? { 'Cf-Access-Jwt-Assertion': value } : {} });
const json = (keys = [jwk]) => new Response(JSON.stringify({ keys }), { headers: { 'Content-Type': 'application/json' } });
const deny = { ok: false, status: 401, code: 'unauthorized' };
const notConfigured = { ok: false, status: 503, code: 'not_configured' };
const call = async (value, fetchImpl = async () => json(), config = env, time = ms) => authorizePrivateRequest(request(value), config, { fetchImpl, now: () => time });

test('authoritative team JWKS verifies RS256 with issuer, audience and time claims', async () => {
  const jwt = await token();
  let count = 0;
  const fetchImpl = async (url, options) => {
    count++;
    assert.equal(url, `${issuer}/cdn-cgi/access/certs`);
    assert.equal(options.redirect, 'error');
    assert.equal(options.method, 'GET');
    assert.ok(options.signal instanceof AbortSignal);
    return json();
  };
  assert.deepEqual(await call(jwt, fetchImpl), { ok: true });
  assert.deepEqual(await call(jwt, fetchImpl), { ok: true });
  assert.equal(count, 1, 'JWKS cached without retaining the token');
  assert.deepEqual(await call(await token({ aud: env.ACCESS_AUD }), async () => json(), { ...env, ACCESS_TEAM_DOMAIN: 'qa-private.cloudflareaccess.com' }), { ok: true });
});

test('missing or hostile configuration fails closed without a network request', async () => {
  let count = 0;
  const fake = async () => { count++; return json(); };
  for (const config of [{}, { ...env, ACCESS_AUD: '' }, { ...env, ACCESS_AUD: ' ' }, ...[
    'http://qa-private.cloudflareaccess.com', 'https://qa-private.cloudflareaccess.com/path',
    'https://user@qa-private.cloudflareaccess.com', 'https://qa-private.cloudflareaccess.com:443',
    'https://qa-private.cloudflareaccess.com.evil.invalid', 'https://cloudflareaccess.com',
    'qa-private.cloudflareaccess.com?redirect=x', 'qa.private.cloudflareaccess.com', 'https://127.0.0.1',
  ].map((ACCESS_TEAM_DOMAIN) => ({ ...env, ACCESS_TEAM_DOMAIN }))]) {
    assert.deepEqual(await call(await token(), fake, config), notConfigured);
  }
  assert.equal(count, 0);
});

test('wrong audience/issuer, expired/future/fractional or missing times fail before key retrieval', async () => {
  let count = 0;
  const fake = async () => { count++; return json(); };
  for (const claims of [
    { aud: ['other'] }, { aud: [] }, { iss: `${issuer}/` }, { iss: 'https://evil.invalid' },
    { exp: seconds }, { exp: seconds - 1 }, { exp: '9999999999' }, { exp: null }, { exp: seconds + 0.5 },
    { iat: seconds + 1 }, { iat: null }, { iat: undefined }, { iat: seconds - 0.5 }, { iat: -1 },
    { nbf: seconds + 1 }, { nbf: '0' }, { nbf: seconds - 0.5 }, { nbf: -1 }, { exp: Number.MAX_SAFE_INTEGER + 1 },
  ]) assert.deepEqual(await call(await token(claims), fake), deny, JSON.stringify(claims));
  assert.equal(count, 0);
  assert.deepEqual(await call(await token({ nbf: undefined })), { ok: true }, 'nbf is optional, exp and iat are required');
});

test('forged signatures, unsigned/wrong algorithms and missing keys are rejected', async () => {
  const other = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, false, ['sign', 'verify']);
  assert.deepEqual(await call(await token({}, {}, other.privateKey)), deny);
  for (const header of [{ alg: 'none' }, { alg: 'HS256' }, { kid: '' }, { kid: 'missing-key' }, { crit: ['unknown'] }, { b64: false }])
    assert.deepEqual(await call(await token({}, header)), deny);
  assert.deepEqual(await call(await token(), async () => json([{ ...jwk, alg: 'HS256' }])), deny);
  assert.deepEqual(await call(await token(), async () => json([{ ...jwk, use: 'enc' }])), deny);
  assert.deepEqual(await call(await token(), async () => json([jwk, jwk])), deny, 'ambiguous duplicate kid fails');
});

test('untrusted token URLs are ignored; malformed and missing tokens do not reach JWKS', async () => {
  let count = 0;
  const fake = async (url) => { count++; assert.equal(url, `${issuer}/cdn-cgi/access/certs`); return json(); };
  for (const jwt of [undefined, '', 'x.y.z', 'a.b', 'a.b.c.d', '.e30.eA', 'x'.repeat(16385)]) assert.deepEqual(await call(jwt, fake), deny);
  assert.equal(count, 0);
  assert.deepEqual(await call(await token({}, { jku: 'https://evil.invalid/keys', x5u: 'https://evil.invalid/cert' }), fake), { ok: true });
  assert.equal(count, 1);
});

test('expired cached keys are not reused after network failure and rotation is bounded', async () => {
  let count = 0;
  const fake = async () => { count++; return count === 1 ? json() : new Response('', { status: 503 }); };
  const jwt = await token({ exp: seconds + 1000 });
  assert.deepEqual(await call(jwt, fake), { ok: true });
  assert.deepEqual(await call(jwt, fake, env, ms + 5 * 60 * 1000), deny);
  assert.equal(count, 2);
  let rotationCalls = 0;
  const rotation = async () => { rotationCalls++; return rotationCalls === 1 ? json() : json([{ ...jwk, kid: 'rotated' }]); };
  assert.deepEqual(await call(jwt, rotation), { ok: true });
  const rotated = await token({ exp: seconds + 1000 }, { kid: 'rotated' });
  assert.deepEqual(await call(rotated, rotation), deny, 'new kid cannot repeatedly refetch during cooldown');
  assert.equal(rotationCalls, 1);
  assert.deepEqual(await call(rotated, rotation, env, ms + 31000), { ok: true });
  assert.equal(rotationCalls, 2);
});

test('oversized/invalid JWKS and redirect/fetch failures fail closed', async () => {
  const jwt = await token();
  for (const fake of [
    async () => new Response('x'.repeat(65537)), async () => new Response('{}'),
    async () => new Response('{invalid'), async () => new Response('', { status: 302, headers: { Location: 'https://evil.invalid' } }),
    async () => { throw Error('network'); }, async () => json(Array(33).fill(jwk)),
  ]) assert.deepEqual(await call(jwt, fake), deny);
});

test('a stalled JWKS request times out even if fetch ignores AbortSignal', async () => {
  assert.deepEqual(await call(await token(), async () => new Promise(() => {})), deny);
});

test('expiry is checked again after obtaining the signing key', async () => {
  let time = ms;
  const jwt = await token({ exp: seconds + 1 });
  assert.deepEqual(await authorizePrivateRequest(request(jwt), env, {
    now: () => time,
    fetchImpl: async () => { time += 2000; return json(); },
  }), deny);
});
