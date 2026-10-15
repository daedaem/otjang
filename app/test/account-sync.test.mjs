import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { IDBFactory } from 'fake-indexeddb';
import { makeGarment, newWardrobeState } from '../src/wardrobe.js';
import { createWardrobeStore, photoAsset } from '../src/wardrobe-store.js';
import { syncDecision, accountServer, readAccount, writeAccount, withDeviceFields, pushWardrobe, pullWardrobe, isEmptyWardrobe, sameWardrobe, ACCOUNT_KEY } from '../src/account.js';
import { openDatabase } from '../../server/src/db.js';
import { createApp } from '../../server/src/app.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'eoul-account-'));
after(() => fs.rmSync(temp, { recursive: true, force: true }));
const output = path.join(temp, 'index.html');
execFileSync(process.execPath, [path.join(root, 'tools/build.mjs'), '--out', output]);
const html = fs.readFileSync(output, 'utf8');
const script = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1].replace(
  /\n\}\)\(\);\s*$/,
  '\nglobalThis.testApp = { state: () => state, ready: appReady, store: wardrobeStore, set, kickSync, submitAccountForm, account: () => account, syncState: () => syncState, syncChoice: () => syncChoice, photoBlobs: () => photoBlobs, storage: () => ({ revision: storageRevision, epoch: storageEpoch }) };\n})();',
);

// ── a real server in this process (in-memory SQLite, low scrypt cost)
async function startServer() {
  const db = openDatabase(':memory:');
  const app = createApp({ db, config: { allowedOrigins: [], trustProxy: null, inviteCode: null, scryptLog2N: 10, sessionDays: 60, appFile: '/nonexistent' } });
  const server = http.createServer((req, res) => app.handle(req, res));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const control = { offline: false, requests: [], hook: null };
  const fetchVia = async (url, init) => {
    const request = `${init?.method || 'GET'} ${String(url).replace(base, '')}`;
    control.requests.push(request);
    if (control.hook) await control.hook(request);
    if (control.offline) throw new TypeError('Failed to fetch');
    return fetch(url, init);
  };
  return {
    db, base, control, fetchVia,
    rows: (sql, ...args) => db.prepare(sql).all(...args),
    close: () => new Promise((resolve) => server.close(() => { db.close(); resolve(); })),
  };
}
const server = await startServer();
after(() => server.close());

// ── the bundled app against fake IndexedDB/DOM, talking to the real server
async function boot({ indexedDB = new IDBFactory(), storage = new Map(), meta = 'same-origin' } = {}) {
  const urls = new Map();
  let nextURL = 0;
  class TestURL extends URL {
    static createObjectURL(blob) { const id = `blob:account/${++nextURL}`; urls.set(id, blob); return id; }
    static revokeObjectURL(id) { urls.delete(id); }
  }
  const nodes = new Map(['app', 'sheet-root', 'toast'].map((id) => [id, {
    innerHTML: '', classList: { add() {}, remove() {} }, querySelector() { return null; }, querySelectorAll() { return []; },
  }]));
  const listeners = new Map();
  const toasts = [];
  const context = vm.createContext({
    indexedDB, Blob, crypto: globalThis.crypto, structuredClone, btoa, atob,
    Uint8Array, DataView, TextEncoder, TextDecoder, URL: TestURL, URLSearchParams,
    Image: class { decode() { return Promise.resolve(); } },
    fetch: (url, init) => (String(url).startsWith('blob:') ? Promise.resolve({ blob: async () => urls.get(url) }) : server.fetchVia(url, init)),
    localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)), removeItem: (key) => storage.delete(key) },
    location: { origin: server.base, search: '' },
    navigator: {},
    document: {
      getElementById: (id) => nodes.get(id) ?? null,
      addEventListener(type, fn) { listeners.set(type, [...(listeners.get(type) || []), fn]); },
      querySelector: (selector) => (selector === 'meta[name="eoul-api"]' && meta ? { content: meta } : null),
      querySelectorAll: () => [],
      visibilityState: 'visible',
      body: { style: {}, append() {} },
      createElement: () => ({ click() {}, remove() {} }),
    },
    window: { scrollTo() {}, matchMedia: () => ({ matches: false }) }, CSS: { escape: (value) => value },
    setTimeout: () => 1, clearTimeout() {}, requestAnimationFrame: (fn) => fn(),
  });
  vm.runInContext(script, context);
  await context.testApp.ready;
  await context.testApp.kickSync();
  const toast = nodes.get('toast');
  Object.defineProperty(toast, 'innerHTML', { get: () => toasts.at(-1) || '', set: (v) => toasts.push(v) });
  return {
    app: context.testApp, nodes, storage, toasts,
    sheet: () => nodes.get('sheet-root').innerHTML,
    body: () => nodes.get('app').innerHTML,
    state: () => JSON.parse(JSON.stringify(context.testApp.state())),
    async click(dataset) {
      for (const fn of listeners.get('click') || []) await fn({ target: { closest: () => ({ dataset }) }, preventDefault() {}, stopPropagation() {} });
    },
    input(id, value) { for (const fn of listeners.get('input') || []) fn({ target: { id, value, dataset: {} } }); },
    async check(field, checked = true) {
      for (const fn of listeners.get('change') || []) await fn({ target: { id: '', checked, dataset: { action: 'account-check', field } } });
    },
    async signup(email, password = 'correct horse') {
      await this.click({ action: 'account-open', mode: 'signup' });
      this.input('account-email', email);
      this.input('account-password', password);
      for (const field of ['age14', 'privacy', 'terms']) await this.check(field);
      await context.testApp.submitAccountForm({});
    },
    async login(email, password = 'correct horse') {
      await this.click({ action: 'account-open', mode: 'login' });
      await context.testApp.submitAccountForm({ email: { value: email }, password: { value: password } });
    },
    close() { context.testApp.store.close(); },
  };
}

async function jpegAsset(seed) {
  return photoAsset(new Blob([new Uint8Array([255, 216, 255, ...new TextEncoder().encode(seed)])], { type: 'image/jpeg' }));
}
// A device that already has personal clothes (with photos) in its own browser.
async function deviceWith(labels, { indexedDB = new IDBFactory(), storage = new Map() } = {}) {
  const store = createWardrobeStore({ indexedDB });
  const first = await store.load();
  const assets = [];
  const garments = [];
  for (const [i, label] of labels.entries()) {
    const asset = await jpegAsset(label);
    assets.push(asset);
    garments.push(makeGarment({ id: `g_${label}`, kind: 'shirt', gender: 'M', color: 'white', label, photoId: asset.id }));
  }
  await store.commit({ ...newWardrobeState(), demo: false, demoSelected: [], garments }, first.revision, assets, first.epoch);
  store.close();
  return boot({ indexedDB, storage });
}
const labels = (page) => page.state().garments.map((g) => g.label).sort();
const serverWardrobe = (email) => {
  const row = server.rows("SELECT w.revision, w.state FROM wardrobes w JOIN identities i ON i.user_id = w.user_id WHERE i.subject = ?", email)[0];
  return row ? { revision: row.revision, state: JSON.parse(row.state) } : null;
};

// ── pure decisions
test('the sync decision never lets a replaced or empty local wardrobe overwrite the account', () => {
  const synced = { remoteRevision: 3, localEpoch: 'e1', localRevision: 7 };
  const local = (revision, epoch = 'e1', empty = false) => ({ revision, epoch, empty });
  assert.equal(syncDecision({ synced, local: local(7), remote: { revision: 3 } }), 'none');
  assert.equal(syncDecision({ synced, local: local(8), remote: { revision: 3 } }), 'push');
  assert.equal(syncDecision({ synced, local: local(7), remote: { revision: 4 } }), 'pull');
  assert.equal(syncDecision({ synced, local: local(8), remote: { revision: 4 } }), 'choose', 'both changed');
  assert.equal(syncDecision({ synced, local: local(7), remote: { revision: 2 } }), 'choose', 'the server went back to an older backup');
  // A new local database (cleared, evicted or recovered) is never treated as an edit.
  assert.equal(syncDecision({ synced, local: local(1, 'e2', true), remote: { revision: 3 } }), 'pull');
  assert.equal(syncDecision({ synced, local: local(9, 'e2'), remote: { revision: 3 } }), 'choose');
  assert.equal(syncDecision({ synced, local: local(9, 'e2'), remote: { revision: 0 } }), 'push');
  // First sync on this device.
  assert.equal(syncDecision({ synced: null, local: local(2), remote: { revision: 0 } }), 'push');
  assert.equal(syncDecision({ synced: null, local: local(1, 'e1', true), remote: { revision: 5 } }), 'pull');
  assert.equal(syncDecision({ synced: null, local: local(2), remote: { revision: 5 } }), 'choose');
});

test('the API address comes only from the page marker, and an account belongs to one server', () => {
  const doc = (content) => ({ querySelector: () => (content === null ? null : { content }) });
  assert.equal(accountServer(doc(null), { origin: 'https://a.example' }), null, 'no server: the app stays device-only');
  assert.equal(accountServer(doc('same-origin'), { origin: 'https://a.example' }), 'https://a.example');
  assert.equal(accountServer(doc('https://eoul.example/path'), {}), 'https://eoul.example');
  assert.equal(accountServer(doc('http://eoul.example'), {}), null, 'plain http only for this computer');
  assert.equal(accountServer(doc('http://localhost:8787'), {}), 'http://localhost:8787');
  const storage = new Map();
  const local = { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v), removeItem: (k) => storage.delete(k) };
  writeAccount(local, { server: 'https://a.example', email: 'me@example.com', token: 't' });
  assert.equal(readAccount(local, 'https://a.example').email, 'me@example.com');
  assert.equal(readAccount(local, 'https://b.example'), null);
  storage.set(ACCOUNT_KEY, '{broken');
  assert.equal(readAccount(local, 'https://a.example'), null);
});

test('pulling keeps this device’s migration markers; pushing uploads only the photos the server lacks', async () => {
  const base = newWardrobeState();
  const remote = { ...structuredClone(base), legacyFingerprint: 'a'.repeat(64) };
  const local = { ...structuredClone(base), legacyFingerprint: null, legacyDismissed: { owned: ['x'], saved: [] } };
  const merged = withDeviceFields(remote, local);
  assert.equal(merged.legacyFingerprint, null);
  assert.deepEqual(merged.legacyDismissed, { owned: ['x'], saved: [] });
  assert.equal(sameWardrobe(remote, { ...local, legacyFingerprint: 'b'.repeat(64) }), true, 'device markers do not make two wardrobes differ');
  assert.equal(sameWardrobe(remote, { ...local, budget: 100000 }), false);
  assert.equal(isEmptyWardrobe(newWardrobeState()), true);
  assert.equal(isEmptyWardrobe({ ...newWardrobeState(), saved: ['ms-1'] }), false);

  const a = await jpegAsset('a'), b = await jpegAsset('b');
  const uploads = [];
  let puts = 0;
  const api = {
    putWardrobe: async () => {
      if (++puts === 1) throw Object.assign(new Error('missing'), { code: 'missing-photos', extra: { missing: [b.id] } });
      return { revision: 1 };
    },
    putPhoto: async (id) => { uploads.push(id); },
  };
  const snapshot = { state: {}, photos: new Map([[a.id, a.blob], [b.id, b.blob]]) };
  assert.deepEqual(await pushWardrobe({ api, snapshot, baseRevision: 0 }), { revision: 1 });
  assert.deepEqual(uploads, [b.id]);
  const bad = { getPhoto: async () => a.blob };
  await assert.rejects(pullWardrobe({ api: bad, verify: photoAsset, remote: { revision: 1, state: {}, photoIds: [b.id] } }), /손상/);
});

// ── the real app with the real server
test('without a server marker the app shows no account features', async (t) => {
  const page = await boot({ meta: null });
  t.after(() => page.close());
  await page.click({ action: 'open-profile' });
  assert.equal(page.app.account(), null);
  assert.equal(server.control.requests.length, 0, 'nothing is sent anywhere');
});

test('sign up after using the app: required notices, then the wardrobe and photos are copied in the background', async (t) => {
  server.control.requests.length = 0;
  const page = await deviceWith(['oxford', 'chino']);
  t.after(() => page.close());
  await page.click({ action: 'tab', tab: 'closet' });
  assert.match(page.body(), /계정에 저장해 둘까요/, 'after real clothes exist, the closet suggests saving to an account');

  await page.click({ action: 'account-open', mode: 'signup' });
  assert.match(page.sheet(), /개인정보 수집·이용 안내와 이용 조건/);
  assert.match(page.sheet(), /만 14세 이상/);
  assert.match(page.sheet(), /옷 2벌·사진 2장/);
  page.input('account-email', 'first@example.com');
  page.input('account-password', 'correct horse');
  await page.app.submitAccountForm({});
  assert.match(page.sheet(), /필수 항목 세 가지에 동의해야/);
  assert.equal(page.app.account(), null, 'nothing is created without the agreements');
  assert.ok(!server.control.requests.some((r) => r.includes('signup')));

  for (const field of ['age14', 'privacy', 'terms']) await page.check(field);
  await page.app.submitAccountForm({});
  await page.app.kickSync();
  const account = page.app.account();
  assert.equal(account.email, 'first@example.com');
  assert.match(account.token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(page.app.syncState().phase, 'idle');
  const saved = serverWardrobe('first@example.com');
  assert.equal(saved.revision, 1);
  assert.deepEqual(saved.state.garments.map((g) => g.label).sort(), ['chino', 'oxford']);
  assert.equal(server.rows('SELECT COUNT(*) AS n FROM photos')[0].n, 2);
  const stored = JSON.parse(page.storage.get(ACCOUNT_KEY));
  assert.equal(stored.server, server.base);
  assert.equal(stored.synced.remoteRevision, 1);
  assert.doesNotMatch(page.storage.get(ACCOUNT_KEY), /correct horse/, 'the password is never kept on the device');

  // A later local change is committed first and then copied without waiting.
  const before = page.app.storage().revision;
  await page.app.set({ brands: ['폴로 랄프 로렌'] });
  assert.equal(page.app.storage().revision, before + 1);
  await page.app.kickSync();
  assert.equal(serverWardrobe('first@example.com').revision, 2);
  assert.deepEqual(serverWardrobe('first@example.com').state.brands, ['폴로 랄프 로렌']);
  await page.click({ action: 'tab', tab: 'closet' });
  assert.doesNotMatch(page.body(), /계정에 저장해 둘까요|backup-nudge/);
});

test('a second device that logs in receives the same wardrobe and verified photos', async (t) => {
  const a = await deviceWith(['tee']);
  t.after(() => a.close());
  await a.signup('second@example.com');
  await a.app.kickSync();
  const b = await boot();
  t.after(() => b.close());
  assert.equal(b.state().demo, true);
  await b.login('second@example.com');
  await b.app.kickSync();
  assert.deepEqual(labels(b), ['tee']);
  const photoId = b.state().garments[0].photoId;
  assert.ok(b.app.photoBlobs().has(photoId));
  assert.equal((await photoAsset(b.app.photoBlobs().get(photoId))).id, photoId);
  assert.equal(serverWardrobe('second@example.com').revision, 1, 'receiving does not write back');
  // A change on B reaches A when A looks again.
  await b.app.set({ budget: 100000 });
  await b.app.kickSync();
  await a.app.kickSync();
  assert.equal(a.state().budget, 100000);
  assert.match(a.toasts.at(-1), /다른 기기에서 바뀐 옷장을 받았어요/);
});

test('when both sides changed, nothing is merged silently and the user picks a side', async (t) => {
  const a = await deviceWith(['coat']);
  t.after(() => a.close());
  await a.signup('both@example.com');
  await a.app.kickSync();
  const b = await deviceWith(['boots']);
  t.after(() => b.close());
  await b.login('both@example.com');
  await b.app.kickSync();
  assert.equal(b.app.syncState().phase, 'choose');
  assert.deepEqual(labels(b), ['boots'], 'this device is unchanged');
  assert.deepEqual(serverWardrobe('both@example.com').state.garments.map((g) => g.label), ['coat'], 'the account is unchanged');
  assert.match(b.body(), /계정 옷장과 이 기기 옷장이 달라요/);
  await b.click({ action: 'sync-choose' });
  assert.match(b.sheet(), /계정 옷장[\s\S]*옷 1벌 · 사진 1장/);

  // A local edit while undecided stays local.
  await b.app.set({ budget: 200000 });
  await b.app.kickSync();
  assert.equal(b.app.syncState().phase, 'choose');
  assert.equal(serverWardrobe('both@example.com').revision, 1);

  await b.click({ action: 'sync-use-device' });
  assert.equal(serverWardrobe('both@example.com').revision, 1, 'the first tap only asks again');
  const armed = { action: 'sync-use-device', armed: '1' };
  await b.click(armed);
  assert.deepEqual(serverWardrobe('both@example.com').state.garments.map((g) => g.label), ['boots']);
  assert.equal(b.app.syncState().phase, 'idle');

  // A now sees the account moved and itself unchanged: it receives B's choice.
  await a.app.kickSync();
  assert.deepEqual(labels(a), ['boots']);

  // The other direction: replace this device with the account copy.
  await b.app.set({ budget: 50000 });
  await b.app.kickSync();
  await a.app.set({ budget: 300000 });
  await a.app.kickSync();
  assert.equal(a.app.syncState().phase, 'choose');
  await a.click({ action: 'sync-use-account' });
  assert.equal(a.state().budget, 50000);
  assert.equal(a.app.syncState().phase, 'idle');
});

test('a browser that lost its storage gets the account back instead of overwriting it', async (t) => {
  const storage = new Map();
  const a = await deviceWith(['denim', 'loafer'], { storage });
  await a.signup('evicted@example.com');
  await a.app.kickSync();
  a.close();
  // Same login note, brand-new empty IndexedDB (as after an eviction that kept localStorage).
  const again = await boot({ storage });
  t.after(() => again.close());
  await again.app.kickSync();
  assert.deepEqual(labels(again), ['denim', 'loafer']);
  assert.equal(serverWardrobe('evicted@example.com').revision, 1, 'the empty browser never pushed');
});

test('offline or signed-out, saving on the device keeps working and the reason is shown', async (t) => {
  const page = await deviceWith(['polo']);
  t.after(() => { server.control.offline = false; page.close(); });
  await page.signup('offline@example.com');
  await page.app.kickSync();
  server.control.offline = true;
  await page.app.set({ budget: 100000 });
  await page.app.kickSync();
  assert.equal(page.state().budget, 100000, 'the local save did not wait for the server');
  assert.equal(page.app.syncState().phase, 'offline');
  assert.match(page.app.syncState().message, /서버에 연결하지 못했어요/);
  server.control.offline = false;
  await page.app.kickSync();
  assert.equal(serverWardrobe('offline@example.com').state.budget, 100000);

  server.db.prepare('DELETE FROM sessions').run();
  await page.app.set({ budget: 200000 });
  await page.app.kickSync();
  assert.equal(page.app.syncState().phase, 'signed-out');
  assert.equal(page.app.account().token, null);
  assert.match(page.body(), /계정에 저장하지 못하고 있어요[\s\S]*로그인/);
  await page.login('offline@example.com');
  await page.app.kickSync();
  assert.equal(serverWardrobe('offline@example.com').state.budget, 200000, 'the same account continues from its last sync point');
});

test('deleting the account removes the server copy and keeps this device’s wardrobe', async (t) => {
  const page = await deviceWith(['cap']);
  t.after(() => page.close());
  await page.signup('delete@example.com');
  await page.app.kickSync();
  await page.click({ action: 'account-delete-open' });
  assert.match(page.sheet(), /이 기기에 저장된 옷장은 지우지 않아요/);
  await page.app.submitAccountForm({ password: { value: 'wrong horse' } });
  assert.match(page.sheet(), /비밀번호가 맞지 않아요/);
  assert.ok(serverWardrobe('delete@example.com'));
  await page.app.submitAccountForm({ password: { value: 'correct horse' } });
  assert.equal(page.app.account(), null);
  assert.equal(page.storage.get(ACCOUNT_KEY), undefined);
  assert.equal(server.rows("SELECT COUNT(*) AS n FROM identities WHERE subject = 'delete@example.com'")[0].n, 0);
  assert.deepEqual(labels(page), ['cap']);
});

test('logging out or erasing this browser never deletes the account copy', async (t) => {
  const page = await deviceWith(['scarf']);
  t.after(() => page.close());
  await page.signup('erase@example.com');
  await page.app.kickSync();
  await page.click({ action: 'account-logout' });
  assert.equal(page.app.account(), null);
  assert.deepEqual(labels(page), ['scarf'], 'logout keeps the device wardrobe');
  await page.login('erase@example.com');
  await page.app.kickSync();
  assert.equal(page.app.syncState().phase, 'idle', 'same account, same data: nothing to choose');

  await page.click({ action: 'erase-review' });
  assert.match(page.sheet(), /이 브라우저는 로그아웃되고, 계정에 저장된 옷장은 지우지 않아요/);
  await page.click({ action: 'erase-confirm' });
  await page.click({ action: 'erase-execute' });
  assert.equal(page.app.account(), null);
  assert.equal(page.state().garments.length, 0);
  assert.deepEqual(serverWardrobe('erase@example.com').state.garments.map((g) => g.label), ['scarf']);
});

test('switching accounts while a pull is running never applies the old account’s wardrobe to the new one', async (t) => {
  const a = await deviceWith(['blazer']);
  t.after(() => a.close());
  await a.signup('switch-from@example.com');
  await a.app.kickSync();
  const b = await boot();
  t.after(() => { server.control.hook = null; b.close(); });
  let switching = null;
  // While B downloads the first account's photo, the user logs out and signs up for another account.
  server.control.hook = async (request) => {
    if (switching || !request.startsWith('GET /v1/photos/')) return;
    switching = (async () => {
      await b.click({ action: 'account-logout' });
      await b.signup('switch-to@example.com');
    })();
    while (b.app.account()?.email !== 'switch-to@example.com') await new Promise((resolve) => setImmediate(resolve));
  };
  await b.login('switch-from@example.com');
  await switching;
  await b.app.kickSync();
  assert.deepEqual(labels(b), [], 'the first account’s clothes were not written into this device');
  assert.equal(b.app.account().email, 'switch-to@example.com');
  assert.equal(b.app.syncState().phase, 'idle');
  assert.equal(serverWardrobe('switch-to@example.com').state.garments.length, 0);
  assert.deepEqual(serverWardrobe('switch-from@example.com').state.garments.map((g) => g.label), ['blazer'], 'the first account is unchanged');
});
