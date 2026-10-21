import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { openDatabase, backupDatabase } from '../src/db.js';
import { createApp, requestAddress, AGREEMENT_VERSION } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { hashPassword, verifyPassword } from '../src/auth.js';
import { makeGarment, newWardrobeState } from '../../app/src/wardrobe.js';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'eoul-server-'));
after(() => fs.rmSync(temp, { recursive: true, force: true }));

async function start(overrides = {}) {
  const clock = { t: Date.parse('2026-10-15T00:00:00Z') };
  const db = openDatabase(overrides.database || ':memory:');
  const config = {
    allowedOrigins: [], trustProxy: null, inviteCode: null, scryptLog2N: 10, sessionDays: 60,
    appFile: path.join(temp, 'missing.html'), ...overrides,
  };
  const logs = [];
  const app = createApp({ db, config, now: () => clock.t, log: (...entry) => logs.push(entry) });
  const server = http.createServer((req, res) => app.handle(req, res));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, url, { token, json, body, headers = {} } = {}) => {
    const response = await fetch(base + url, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body: json !== undefined ? JSON.stringify(json) : body,
    });
    const type = response.headers.get('content-type') || '';
    const data = type.includes('json') ? await response.json() : Buffer.from(await response.arrayBuffer());
    return { status: response.status, data, headers: response.headers };
  };
  const signup = (email = 'me@example.com', extra = {}) => call('POST', '/v1/auth/signup', {
    json: { email, password: 'correct horse', agreements: { version: AGREEMENT_VERSION, terms: true, privacy: true, age14: true }, ...extra },
  });
  return {
    db, clock, call, signup, logs, port: server.address().port,
    close: () => new Promise((resolve) => server.close(() => { db.close(); resolve(); })),
  };
}

function jpeg(seed) {
  const bytes = Buffer.concat([Buffer.from([255, 216, 255]), Buffer.from(String(seed))]);
  return { bytes, id: `p_${crypto.createHash('sha256').update(bytes).digest('hex')}` };
}
function wardrobeWith(photoIds) {
  return {
    ...newWardrobeState(), demo: false, demoSelected: [],
    garments: photoIds.map((photoId, i) => makeGarment({ id: `g${i}`, kind: 'shirt', gender: 'M', color: 'white', photoId })),
  };
}
const putPhoto = (s, token, photo) => s.call('PUT', `/v1/photos/${photo.id}`, { token, body: photo.bytes, headers: { 'Content-Type': 'image/jpeg' } });

test('passwords are salted scrypt hashes and verify only the same password', async () => {
  const a = await hashPassword('correct horse', 10), b = await hashPassword('correct horse', 10);
  assert.notEqual(a, b, 'each hash has its own salt');
  assert.match(a, /^scrypt\$10\$8\$1\$/);
  assert.equal(await verifyPassword('correct horse', a), true);
  assert.equal(await verifyPassword('correct horsf', a), false);
  assert.equal(await verifyPassword('correct horse', 'plain'), false);
});

test('health says which sign-in methods are on', async (t) => {
  const s = await start({ inviteCode: 'friends' });
  t.after(s.close);
  const { data } = await s.call('GET', '/v1/health');
  assert.deepEqual(data.providers, { email: true, kakao: false, google: false });
  assert.equal(data.signup.inviteRequired, true);
  assert.equal(data.agreementVersion, AGREEMENT_VERSION);
});

test('sign-up checks email, password, agreements and invite code, and stores no raw secret', async (t) => {
  const s = await start({ inviteCode: 'friends' });
  t.after(s.close);
  assert.equal((await s.signup('not-an-email', { inviteCode: 'friends' })).data.error.code, 'invalid-email');
  assert.equal((await s.call('POST', '/v1/auth/signup', { json: { email: 'a@b.co', password: 'short', inviteCode: 'friends' } })).data.error.code, 'weak-password');
  assert.equal((await s.signup('a@b.co', { inviteCode: 'wrong' })).status, 403);
  const noAge = await s.call('POST', '/v1/auth/signup', { json: { email: 'a@b.co', password: 'correct horse', inviteCode: 'friends', agreements: { version: AGREEMENT_VERSION, terms: true, privacy: true } } });
  assert.equal(noAge.data.error.code, 'agreement-required');
  const old = await s.call('POST', '/v1/auth/signup', { json: { email: 'a@b.co', password: 'correct horse', inviteCode: 'friends', agreements: { version: '2000-01-01', terms: true, privacy: true, age14: true } } });
  assert.equal(old.data.error.code, 'agreement-required', 'an outdated notice must be read again');

  const ok = await s.signup(' Me@Example.COM ', { inviteCode: 'friends' });
  assert.equal(ok.status, 201);
  assert.equal(ok.data.user.email, 'me@example.com');
  assert.match(ok.data.token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(ok.data.wardrobe.revision, 0);
  assert.equal((await s.signup('ME@example.com', { inviteCode: 'friends' })).data.error.code, 'email-taken');

  const sessions = s.db.prepare('SELECT token_hash FROM sessions').all();
  assert.equal(sessions.length, 1);
  assert.notEqual(sessions[0].token_hash, ok.data.token, 'only a hash of the token is stored');
  const identity = s.db.prepare('SELECT password_hash FROM identities').get();
  assert.doesNotMatch(identity.password_hash, /correct horse/);
  assert.equal(s.db.prepare('SELECT agreement_version FROM users').get().agreement_version, AGREEMENT_VERSION);
});

test('login gives the same answer for an unknown email and a wrong password; logout ends the session', async (t) => {
  const s = await start();
  t.after(s.close);
  await s.signup();
  const unknown = await s.call('POST', '/v1/auth/login', { json: { email: 'who@example.com', password: 'correct horse' } });
  const wrong = await s.call('POST', '/v1/auth/login', { json: { email: 'me@example.com', password: 'wrong horse' } });
  assert.equal(unknown.status, 401);
  assert.deepEqual(unknown.data, wrong.data);
  const login = await s.call('POST', '/v1/auth/login', { json: { email: 'ME@example.com', password: 'correct horse' } });
  assert.equal(login.status, 200);
  const token = login.data.token;
  assert.equal((await s.call('GET', '/v1/me', { token })).data.user.email, 'me@example.com');
  assert.equal((await s.call('POST', '/v1/auth/logout', { token })).status, 204);
  assert.equal((await s.call('GET', '/v1/me', { token })).status, 401);
  assert.equal((await s.call('GET', '/v1/me')).data.error.code, 'signed-out');
});

test('repeated wrong passwords for one email are slowed down', async (t) => {
  const s = await start();
  t.after(s.close);
  await s.signup();
  const statuses = [];
  for (let i = 0; i < 11; i++)
    statuses.push((await s.call('POST', '/v1/auth/login', { json: { email: 'me@example.com', password: `guess ${i}xx` } })).status);
  assert.deepEqual(statuses.slice(0, 10), Array(10).fill(401));
  assert.equal(statuses[10], 429);
  s.clock.t += 16 * 60 * 1000;
  assert.equal((await s.call('POST', '/v1/auth/login', { json: { email: 'me@example.com', password: 'correct horse' } })).status, 200);
});

test('sessions expire after the configured days without use', async (t) => {
  const s = await start();
  t.after(s.close);
  const { token } = (await s.signup()).data;
  s.clock.t += 30 * 24 * 3600 * 1000;
  assert.equal((await s.call('GET', '/v1/me', { token })).status, 200, 'use within the window slides it');
  s.clock.t += 59 * 24 * 3600 * 1000;
  assert.equal((await s.call('GET', '/v1/me', { token })).status, 200);
  s.clock.t += 61 * 24 * 3600 * 1000;
  assert.equal((await s.call('GET', '/v1/me', { token })).status, 401);
});

test('wardrobe sync: photos first, then a snapshot that the app itself would accept', async (t) => {
  const s = await start();
  t.after(s.close);
  const { token } = (await s.signup()).data;
  assert.deepEqual((await s.call('GET', '/v1/wardrobe', { token })).data, { revision: 0, updatedAt: null, state: null, photoIds: [] });
  const shirt = jpeg('shirt');
  const state = wardrobeWith([shirt.id]);

  const early = await s.call('PUT', '/v1/wardrobe', { token, json: { baseRevision: 0, state } });
  assert.equal(early.status, 409);
  assert.deepEqual(early.data.error.missing, [shirt.id]);

  assert.equal((await s.call('PUT', `/v1/photos/${shirt.id}`, { token, body: jpeg('other').bytes, headers: { 'Content-Type': 'image/jpeg' } })).data.error.code, 'photo-mismatch');
  assert.equal((await s.call('PUT', `/v1/photos/${shirt.id}`, { token, body: shirt.bytes, headers: { 'Content-Type': 'image/png' } })).status, 415);
  const png = Buffer.from([137, 80, 78, 71]);
  const pngId = `p_${crypto.createHash('sha256').update(png).digest('hex')}`;
  assert.equal((await s.call('PUT', `/v1/photos/${pngId}`, { token, body: png, headers: { 'Content-Type': 'image/jpeg' } })).data.error.code, 'not-jpeg');
  assert.equal((await putPhoto(s, token, shirt)).status, 201);
  assert.equal((await putPhoto(s, token, shirt)).status, 200, 'uploading the same photo again is harmless');

  const saved = await s.call('PUT', '/v1/wardrobe', { token, json: { baseRevision: 0, state } });
  assert.equal(saved.status, 200);
  assert.equal(saved.data.revision, 1);
  const read = (await s.call('GET', '/v1/wardrobe', { token })).data;
  assert.equal(read.revision, 1);
  assert.deepEqual(read.state, state);
  assert.deepEqual(read.photoIds, [shirt.id]);
  assert.deepEqual((await s.call('GET', '/v1/wardrobe?meta=1', { token })).data, { revision: 1, updatedAt: read.updatedAt });
  const got = await s.call('GET', `/v1/photos/${shirt.id}`, { token });
  assert.equal(got.headers.get('content-type'), 'image/jpeg');
  assert.deepEqual(got.data, shirt.bytes);

  const stale = await s.call('PUT', '/v1/wardrobe', { token, json: { baseRevision: 0, state } });
  assert.equal(stale.status, 409);
  assert.equal(stale.data.error.code, 'conflict');
  assert.equal(stale.data.error.revision, 1);

  const broken = await s.call('PUT', '/v1/wardrobe', { token, json: { baseRevision: 1, state: { ...state, styles: ['nope'] } } });
  assert.equal(broken.status, 400);
  assert.equal(broken.data.error.code, 'invalid-wardrobe');
  assert.equal((await s.call('PUT', '/v1/wardrobe', { token, json: { baseRevision: 1, state: { ...state, schema: 4 } } })).data.error.code, 'old-app');
  assert.equal((await s.call('GET', '/v1/wardrobe?meta=1', { token })).data.revision, 1, 'rejected writes change nothing');
});

test('a replaced photo is removed with its last reference; stray uploads go after a day', async (t) => {
  const s = await start();
  t.after(s.close);
  const { token } = (await s.signup()).data;
  const first = jpeg('first'), second = jpeg('second'), stray = jpeg('stray');
  for (const photo of [first, second, stray]) await putPhoto(s, token, photo);
  await s.call('PUT', '/v1/wardrobe', { token, json: { baseRevision: 0, state: wardrobeWith([first.id]) } });
  const ids = () => s.db.prepare('SELECT id FROM photos ORDER BY id').all().map((r) => r.id).sort();
  assert.deepEqual(ids(), [first.id, second.id, stray.id].sort(), 'uploads not yet referenced are kept for a pending sync');
  await s.call('PUT', '/v1/wardrobe', { token, json: { baseRevision: 1, state: wardrobeWith([second.id]) } });
  assert.deepEqual(ids(), [second.id, stray.id].sort());
  s.clock.t += 25 * 3600 * 1000;
  await s.call('PUT', '/v1/wardrobe', { token, json: { baseRevision: 2, state: wardrobeWith([second.id]) } });
  assert.deepEqual(ids(), [second.id]);
});

test('accounts cannot see each other’s wardrobe or photos', async (t) => {
  const s = await start();
  t.after(s.close);
  const a = (await s.signup('a@example.com')).data.token, b = (await s.signup('b@example.com')).data.token;
  const photo = jpeg('mine');
  await putPhoto(s, a, photo);
  await s.call('PUT', '/v1/wardrobe', { token: a, json: { baseRevision: 0, state: wardrobeWith([photo.id]) } });
  assert.equal((await s.call('GET', `/v1/photos/${photo.id}`, { token: b })).status, 404);
  assert.equal((await s.call('GET', '/v1/wardrobe', { token: b })).data.revision, 0);
  const borrowed = await s.call('PUT', '/v1/wardrobe', { token: b, json: { baseRevision: 0, state: wardrobeWith([photo.id]) } });
  assert.equal(borrowed.data.error.code, 'missing-photos', 'another account’s photo id does not count as uploaded');
});

test('deleting the account needs the password and removes every row of that user', async (t) => {
  const s = await start();
  t.after(s.close);
  const { token } = (await s.signup()).data;
  const other = (await s.signup('other@example.com')).data.token;
  const photo = jpeg('gone');
  await putPhoto(s, token, photo);
  await s.call('PUT', '/v1/wardrobe', { token, json: { baseRevision: 0, state: wardrobeWith([photo.id]) } });
  assert.equal((await s.call('DELETE', '/v1/me', { token, json: { password: 'wrong horse' } })).status, 401);
  assert.equal((await s.call('DELETE', '/v1/me', { token, json: { password: 'correct horse' } })).status, 204);
  assert.equal((await s.call('GET', '/v1/me', { token })).status, 401);
  for (const table of ['users', 'identities', 'sessions'])
    assert.equal(s.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n, 1, `${table} keeps only the other account`);
  for (const table of ['wardrobes', 'photos'])
    assert.equal(s.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n, 0);
  assert.equal((await s.call('GET', '/v1/me', { token: other })).status, 200);
  assert.equal((await s.signup()).status, 201, 'the email can sign up again');
});

test('only listed origins get CORS headers; oversized bodies are refused', async (t) => {
  const s = await start({ allowedOrigins: ['https://daedaem.github.io'] });
  t.after(s.close);
  const allowed = await s.call('OPTIONS', '/v1/wardrobe', { headers: { Origin: 'https://daedaem.github.io' } });
  assert.equal(allowed.status, 204);
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://daedaem.github.io');
  assert.match(allowed.headers.get('access-control-allow-headers'), /Authorization/);
  const other = await s.call('GET', '/v1/health', { headers: { Origin: 'https://evil.example' } });
  assert.equal(other.headers.get('access-control-allow-origin'), null);
  const { token } = (await s.signup()).data;
  const big = await s.call('PUT', '/v1/wardrobe', { token, json: { baseRevision: 0, state: { pad: 'x'.repeat(1200 * 1024) } } });
  assert.equal(big.status, 413);
  const bigPhoto = Buffer.concat([Buffer.from([255, 216, 255]), Buffer.alloc(800001)]);
  assert.equal((await s.call('PUT', `/v1/photos/p_${'0'.repeat(64)}`, { token, body: bigPhoto, headers: { 'Content-Type': 'image/jpeg' } })).status, 413);
  assert.equal((await s.call('GET', '/v1/health')).headers.get('cache-control'), 'no-store');
  assert.ok(s.logs.every((entry) => !JSON.stringify(entry).includes(token)), 'tokens never reach the log');
  assert.ok(s.logs.every((entry) => !JSON.stringify(entry).includes('me@example.com')), 'emails never reach the log');
});

test('the built app is served with a marker that its API is on the same origin', async (t) => {
  const appFile = path.join(temp, 'index.html');
  fs.writeFileSync(appFile, '<!doctype html><html><head><title>어울</title></head><body></body></html>');
  const s = await start({ appFile });
  t.after(s.close);
  const page = await s.call('GET', '/');
  assert.equal(page.status, 200);
  assert.match(page.data.toString('utf8'), /<head>\n<meta name="eoul-api" content="same-origin">/);
  assert.equal(page.headers.get('x-frame-options'), 'DENY');
});

test('the app page is sent compressed with an ETag, and an unchanged build answers 304', async (t) => {
  const appFile = path.join(temp, 'compressed.html');
  const html = `<!doctype html><html><head><title>어울</title></head><body>${'<p>옷장</p>'.repeat(4000)}</body></html>`;
  fs.writeFileSync(appFile, html);
  const s = await start({ appFile });
  t.after(s.close);
  const raw = (headers) => new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port: s.port, path: '/', headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
  });
  const expected = html.replace('<head>', '<head>\n<meta name="eoul-api" content="same-origin">');

  const plain = await raw({});
  assert.equal(plain.status, 200);
  assert.equal(plain.headers['content-encoding'], undefined);
  assert.equal(plain.body.toString('utf8'), expected);
  assert.equal(plain.headers.vary, 'Accept-Encoding');
  assert.match(plain.headers.etag, /^W\/"[A-Za-z0-9_-]+"$/);

  const gz = await raw({ 'Accept-Encoding': 'gzip' });
  assert.equal(gz.headers['content-encoding'], 'gzip');
  assert.equal(zlib.gunzipSync(gz.body).toString('utf8'), expected);
  assert.ok(gz.body.length < plain.body.length / 4, 'compressed page is much smaller');
  assert.equal(Number(gz.headers['content-length']), gz.body.length);

  const br = await raw({ 'Accept-Encoding': 'gzip, deflate, br' });
  assert.equal(br.headers['content-encoding'], 'br');
  assert.equal(zlib.brotliDecompressSync(br.body).toString('utf8'), expected);
  const noBr = await raw({ 'Accept-Encoding': 'br;q=0, gzip' });
  assert.equal(noBr.headers['content-encoding'], 'gzip');

  const again = await raw({ 'Accept-Encoding': 'gzip', 'If-None-Match': plain.headers.etag });
  assert.equal(again.status, 304);
  assert.equal(again.body.length, 0);
  assert.equal(again.headers.etag, plain.headers.etag);
  assert.equal(again.headers['x-frame-options'], 'DENY');

  // A new build gets a new ETag, so the stale copy is not reused.
  fs.writeFileSync(appFile, html.replace('옷장', '새 옷장'));
  const future = new Date(Date.now() + 5000);
  fs.utimesSync(appFile, future, future);
  const rebuilt = await raw({ 'If-None-Match': plain.headers.etag });
  assert.equal(rebuilt.status, 200);
  assert.notEqual(rebuilt.headers.etag, plain.headers.etag);
  assert.match(rebuilt.body.toString('utf8'), /새 옷장/);
});

test('the installable-app files next to the page are served by name, and nothing else in that folder is', async (t) => {
  const folder = fs.mkdtempSync(path.join(temp, 'pwa-'));
  fs.mkdirSync(path.join(folder, 'icons'));
  const appFile = path.join(folder, 'index.html');
  fs.writeFileSync(appFile, '<!doctype html><html><head></head><body></body></html>');
  fs.writeFileSync(path.join(folder, 'manifest.webmanifest'), '{"name":"어울"}');
  fs.writeFileSync(path.join(folder, 'sw.js'), 'self.addEventListener("fetch", () => {});');
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
  fs.writeFileSync(path.join(folder, 'icons', 'icon-192.png'), png);
  fs.writeFileSync(path.join(folder, 'icons', 'maskable.svg'), '<svg/>');
  fs.writeFileSync(path.join(folder, 'secret.txt'), 'not public');
  const s = await start({ appFile });
  t.after(s.close);
  const manifest = await s.call('GET', '/manifest.webmanifest');
  assert.equal(manifest.status, 200);
  assert.match(manifest.headers.get('content-type'), /^application\/manifest\+json/);
  assert.equal(manifest.headers.get('cache-control'), 'no-cache');
  const worker = await s.call('GET', '/sw.js');
  assert.match(worker.headers.get('content-type'), /^text\/javascript/);
  assert.equal(worker.data.toString('utf8'), 'self.addEventListener("fetch", () => {});');
  const icon = await s.call('GET', '/icons/icon-192.png');
  assert.equal(icon.headers.get('content-type'), 'image/png');
  assert.deepEqual(icon.data, png);
  assert.deepEqual((await s.call('GET', '/favicon.ico')).data, png, 'the browser default favicon request gets the app icon');
  assert.equal((await s.call('GET', '/icons/icon-512.png')).status, 404, 'a listed file that was not built is a plain 404');
  for (const hidden of ['/secret.txt', '/icons/maskable.svg', '/icons/../secret.txt', '/index.html/../secret.txt'])
    assert.equal((await s.call('GET', hidden)).status, 404, `${hidden} is not served`);
});

test('a backup copy of the live database holds the same accounts and photos', async (t) => {
  const database = path.join(temp, 'live.db');
  const s = await start({ database });
  t.after(s.close);
  const { token } = (await s.signup()).data;
  const photo = jpeg('kept');
  await putPhoto(s, token, photo);
  await s.call('PUT', '/v1/wardrobe', { token, json: { baseRevision: 0, state: wardrobeWith([photo.id]) } });
  const copy = path.join(temp, 'copies', 'backup.db');
  backupDatabase(s.db, copy);
  assert.throws(() => backupDatabase(s.db, copy), /덮어쓰지 않아요/);
  const restored = openDatabase(copy);
  t.after(() => restored.close());
  assert.equal(restored.prepare('SELECT COUNT(*) AS n FROM users').get().n, 1);
  assert.deepEqual(Buffer.from(restored.prepare('SELECT bytes FROM photos').get().bytes), photo.bytes);
  assert.equal(restored.prepare('SELECT revision FROM wardrobes').get().revision, 1);
});

test('the client address comes from cloudflared only, on loopback or at a listed container address', () => {
  const req = (remoteAddress, ip = '203.0.113.7') => ({ socket: { remoteAddress }, headers: { 'cf-connecting-ip': ip } });
  const cloudflare = { trustProxy: 'cloudflare', trustedProxies: ['172.31.87.10'] };
  assert.equal(requestAddress(req('127.0.0.1'), cloudflare), '203.0.113.7');
  assert.equal(requestAddress(req('::ffff:127.0.0.1'), cloudflare), '203.0.113.7');
  assert.equal(requestAddress(req('::1'), cloudflare), '203.0.113.7');
  // cloudflared in its own container (deploy/docker-compose.yml)
  assert.equal(requestAddress(req('172.31.87.10'), cloudflare), '203.0.113.7');
  assert.equal(requestAddress(req('::ffff:172.31.87.10'), cloudflare), '203.0.113.7');
  // Anyone else on the network, or the published port, cannot choose an address.
  assert.equal(requestAddress(req('172.31.87.1'), cloudflare), '172.31.87.1');
  assert.equal(requestAddress(req('172.31.87.11'), cloudflare), '172.31.87.11');
  assert.equal(requestAddress(req('198.51.100.2'), cloudflare), '198.51.100.2');
  // Without the Cloudflare setting nothing is believed, and older configs without the list still work.
  assert.equal(requestAddress(req('172.31.87.10'), { trustProxy: null, trustedProxies: ['172.31.87.10'] }), '172.31.87.10');
  assert.equal(requestAddress(req('127.0.0.1'), { trustProxy: 'cloudflare' }), '203.0.113.7');
  assert.equal(requestAddress(req('127.0.0.1', 'x'.repeat(64)), cloudflare), '127.0.0.1');

  assert.deepEqual(loadConfig({ EOUL_TRUSTED_PROXIES: ' 172.31.87.10, ::ffff:10.0.0.2 ,' }).trustedProxies, ['172.31.87.10', '10.0.0.2']);
  assert.deepEqual(loadConfig({}).trustedProxies, []);
  assert.throws(() => loadConfig({ EOUL_TRUSTED_PROXIES: 'cloudflared' }), /IP 주소가 아니에요/);
});

test('an account keeps its last use to the hour, for retention counts', async (t) => {
  const s = await start();
  t.after(s.close);
  const signedUp = s.clock.t;
  const { token } = (await s.signup()).data;
  const lastSeen = () => s.db.prepare('SELECT last_seen_at FROM users').get().last_seen_at;
  assert.equal(lastSeen(), signedUp);
  s.clock.t += 30 * 60 * 1000;
  await s.call('GET', '/v1/wardrobe', { token });
  assert.equal(lastSeen(), signedUp, 'written at most once an hour');
  s.clock.t += 9 * 24 * 3600 * 1000;
  await s.call('GET', '/v1/wardrobe', { token });
  assert.equal(lastSeen(), s.clock.t);
  // Signing out deletes the session, but the account still remembers its last use.
  await s.call('POST', '/v1/auth/logout', { token });
  assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n, 0);
  assert.equal(lastSeen(), s.clock.t);
});
