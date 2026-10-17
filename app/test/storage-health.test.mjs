import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { IDBFactory } from 'fake-indexeddb';
import { makeGarment, newWardrobeState } from '../src/wardrobe.js';
import { createWardrobeStore, photoAsset } from '../src/wardrobe-store.js';
import { backupDue, requestPersistence, readStorageHealth, lastBackupAt, markBackup, LAST_BACKUP_KEY, formatBytes } from '../src/storage-health.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'eoul-storage-health-'));
after(() => fs.rmSync(temp, { recursive: true, force: true }));
const output = path.join(temp, 'index.html');
execFileSync(process.execPath, [path.join(root, 'tools/build.mjs'), '--out', output]);
const html = fs.readFileSync(output, 'utf8');
const script = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1].replace(
  /\n\}\)\(\);\s*$/,
  '\nglobalThis.testApp = { state: () => state, ready: appReady, store: wardrobeStore, draft: () => draft, beginDraft, chooseGarmentPhoto, saveGarmentDraft, closeSheet, setPhotoAnalysisAllowed: (allowed) => { photoAnalysisAllowed = allowed; } };\n})();',
);

// The real bundled callbacks run against fake IndexedDB and a fake navigator.
// They check what is shown and requested; they cannot show whether a real
// browser keeps or evicts data.
async function boot({ indexedDB = new IDBFactory(), navigator: nav = {}, standalone = false, storage = new Map() } = {}) {
  const urls = new Map();
  let nextURL = 0;
  const draws = [];
  const control = { failEncodes: 0 };
  class TestURL extends URL {
    static createObjectURL(blob) { const id = `blob:storage-health/${++nextURL}`; urls.set(id, blob); return id; }
    static revokeObjectURL(id) { urls.delete(id); }
  }
  class TestImage {
    naturalWidth = 800;
    naturalHeight = 1000;
    decode() {
      const blob = urls.get(this.src);
      return (/^image\/hei[cf]/.test(blob?.type || '') || /\.hei[cf]$/i.test(blob?.name || '')) && !blob.decodable ? Promise.reject(new Error('undecodable')) : Promise.resolve();
    }
  }
  const nodes = new Map(['app', 'sheet-root', 'toast'].map((id) => [id, {
    innerHTML: '', classList: { add() {}, remove() {} }, querySelector() { return null; }, querySelectorAll() { return []; },
  }]));
  const listeners = new Map();
  const context = vm.createContext({
    indexedDB, Blob, crypto: globalThis.crypto, structuredClone, btoa, atob,
    Uint8Array, DataView, TextEncoder, TextDecoder, URL: TestURL,
    Image: TestImage, HTMLImageElement: TestImage,
    fetch: async (url) => ({ blob: async () => urls.get(url) }),
    localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)), removeItem: (key) => storage.delete(key) },
    navigator: nav,
    document: {
      getElementById: (id) => nodes.get(id) ?? null,
      addEventListener(type, fn) { listeners.set(type, [...(listeners.get(type) || []), fn]); },
      querySelector: () => null, querySelectorAll: () => [],
      body: { style: {}, append() {} },
      createElement(tag) {
        if (tag !== 'canvas') return { click() {}, remove() {} };
        let rect = null;
        return {
          width: 0, height: 0,
          getContext: () => ({ fillRect() {}, drawImage(image, sx, sy, sw, sh) { rect = [sx, sy, sw, sh]; draws.push(rect); } }),
          toBlob(callback) {
            if (control.failEncodes > 0) { control.failEncodes--; return callback(null); }
            callback(new Blob([new Uint8Array([255, 216, 255, ...new TextEncoder().encode(rect.join(','))])], { type: 'image/jpeg' }));
          },
        };
      },
    },
    window: { scrollTo() {}, matchMedia: () => ({ matches: standalone }) }, CSS: { escape: (value) => value },
    setTimeout: () => 1, clearTimeout() {}, requestAnimationFrame: (fn) => fn(),
  });
  vm.runInContext(script, context);
  await context.testApp.ready;
  context.testApp.setPhotoAnalysisAllowed(false);
  return {
    app: context.testApp, nodes, urls, draws, control, storage,
    sheet: () => nodes.get('sheet-root').innerHTML,
    state: () => JSON.parse(JSON.stringify(context.testApp.state())),
    async click(dataset) {
      for (const fn of listeners.get('click') || []) await fn({ target: { closest: () => ({ dataset }) }, preventDefault() {}, stopPropagation() {} });
    },
    input(id, value) { for (const fn of listeners.get('input') || []) fn({ target: { id, value, dataset: {} } }); },
    close() { context.testApp.store.close(); },
  };
}
const plain = (value) => JSON.parse(JSON.stringify(value));
const iPhone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
async function seeded(count, options = {}) {
  const indexedDB = new IDBFactory();
  const store = createWardrobeStore({ indexedDB });
  const first = await store.load();
  const garments = Array.from({ length: count }, (_, i) => makeGarment({ id: `g${i}`, kind: 'shirt', gender: 'M', color: 'white' }));
  await store.commit({ ...newWardrobeState(), demo: false, demoSelected: [], garments }, first.revision, [], first.epoch);
  store.close();
  return boot({ indexedDB, ...options });
}

test('backup reminders start at three real garments and repeat after two weeks', () => {
  const now = new Date('2026-10-15T00:00:00Z');
  assert.equal(backupDue({ garmentCount: 4, last: null, now }), false);
  assert.equal(backupDue({ garmentCount: 5, last: null, now }), true);
  assert.equal(backupDue({ garmentCount: 5, last: new Date('2026-10-10T00:00:00Z'), now }), false);
  assert.equal(backupDue({ garmentCount: 5, last: new Date('2026-09-30T00:00:00Z'), now }), true);
  const storage = new Map();
  const local = { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v) };
  assert.equal(lastBackupAt(local), null);
  markBackup(local, now);
  assert.equal(lastBackupAt(local).toISOString(), now.toISOString());
  storage.set(LAST_BACKUP_KEY, 'not a date');
  assert.equal(lastBackupAt(local), null);
  assert.equal(formatBytes(5 * 1024 * 1024), '5.0MB');
});

test('persistence is requested only when not already granted, and a missing API is not an error', async () => {
  let asked = 0;
  assert.equal(await requestPersistence({ storage: { persisted: async () => false, persist: async () => { asked++; return true; } } }), true);
  assert.equal(asked, 1);
  assert.equal(await requestPersistence({ storage: { persisted: async () => true, persist: async () => { asked++; return true; } } }), true);
  assert.equal(asked, 1, 'an origin already marked persistent is not asked again');
  assert.equal(await requestPersistence({}), null);
  assert.equal(await requestPersistence({ storage: { persist: async () => { throw new Error('blocked'); } } }), null);
  const health = await readStorageHealth({ storage: { persist() {}, persisted: async () => false, estimate: async () => ({ usage: 2048, quota: 10 ** 9 }) } });
  assert.deepEqual(health, { supported: true, persisted: false, usage: 2048, quota: 10 ** 9 });
});

test('a real wardrobe without a backup file gets a reminder; iPhone Safari also hears about the 7-day rule', async (t) => {
  const page = await seeded(5, { navigator: { userAgent: iPhone } });
  t.after(() => page.close());
  await page.click({ action: 'tab', tab: 'closet' });
  const closet = page.nodes.get('app').innerHTML;
  assert.match(closet, /class="notice backup-nudge"/);
  assert.match(closet, /iPhone Safari는 7일 동안 열지 않은 사이트의 저장 자료를 지울 수 있어요/);
  await page.click({ action: 'backup' });
  assert.ok(page.storage.get('eoul:last-backup-at'), 'taking a backup file records the time on this device');
  assert.doesNotMatch(page.nodes.get('app').innerHTML, /backup-nudge/);
});

test('the reminder can be dismissed for the session, and a Home Screen app is not told about Safari eviction', async (t) => {
  const page = await seeded(5, { navigator: { userAgent: iPhone }, standalone: true });
  t.after(() => page.close());
  await page.click({ action: 'tab', tab: 'closet' });
  assert.match(page.nodes.get('app').innerHTML, /backup-nudge/);
  assert.doesNotMatch(page.nodes.get('app').innerHTML, /7일 동안/);
  await page.click({ action: 'backup-nudge-dismiss' });
  assert.doesNotMatch(page.nodes.get('app').innerHTML, /backup-nudge/);
});

test('the storage guide never promises retention and names its sources', async (t) => {
  const page = await seeded(1, { navigator: { userAgent: iPhone, storage: { persisted: async () => false, persist: async () => false, estimate: async () => ({ usage: 3 * 1024 * 1024 }) } } });
  t.after(() => page.close());
  await page.click({ action: 'storage-help' });
  const sheet = page.sheet();
  assert.match(sheet, /서버 백업과 계정은 아직 없어서/);
  assert.match(sheet, /보관이 보장되지는 않아요/);
  assert.doesNotMatch(sheet, /보관이 보장돼요|안전하게 보관돼요/);
  assert.match(sheet, /webkit\.org\/blog\/10218/);
  assert.match(sheet, /webkit\.org\/blog\/14403/);
  assert.match(sheet, /공유 버튼 → ‘홈 화면에 추가’/);
  await page.click({ action: 'request-persist' });
  assert.match(page.nodes.get('toast').innerHTML, /지금은 받아 주지 않았어요/);
});

test('the first real save asks the browser once to keep the data', async (t) => {
  let asked = 0;
  const page = await boot({ navigator: { storage: { persisted: async () => false, persist: async () => { asked++; return true; } } } });
  t.after(() => page.close());
  for (const n of [1, 2]) {
    await page.click({ action: 'add-start' });
    await page.click({ action: 'draft-manual' });
    await page.click({ action: 'draft-kind', kind: 'shirt' });
    await page.click({ action: 'draft-save' });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(page.state().garments.length, n);
  }
  assert.equal(asked, 1);
});

test('a completed full erase also removes the last-backup note, so a new wardrobe is reminded again', async (t) => {
  const storage = new Map([['eoul:last-backup-at', '2026-10-14T00:00:00.000Z']]);
  const page = await seeded(3, { storage });
  t.after(() => page.close());
  await page.click({ action: 'tab', tab: 'closet' });
  assert.doesNotMatch(page.nodes.get('app').innerHTML, /backup-nudge/, 'a recent backup suppresses the reminder');
  await page.click({ action: 'erase-review' });
  await page.click({ action: 'erase-confirm' });
  await page.click({ action: 'erase-execute' });
  assert.doesNotMatch(page.sheet(), /전체 삭제 미완료/, 'the erase itself completed');
  assert.equal(storage.has('eoul:last-backup-at'), false);
});
