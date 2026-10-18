import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';

const root = fileURLToPath(new URL('../', import.meta.url));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'eoul-order-import-flow-'));
after(() => fs.rmSync(temp, { recursive: true, force: true }));
const output = path.join(temp, 'index.html');
execFileSync(process.execPath, [path.join(root, 'tools/build.mjs'), '--out', output]);
const html = fs.readFileSync(output, 'utf8');
const script = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1].replace(
  /\n\}\)\(\);\s*$/,
  '\nglobalThis.testApp = { state: () => state, ready: appReady, store: wardrobeStore, draft: () => orderImportDraft, beginOrderImport, reviewOrderImport, saveOrderImport, contextChanged: () => wardrobeContext++ };\n})();',
);

// Bundled UI callbacks and IndexedDB; DOM doubles do not verify browser rendering.
async function boot(indexedDB = new IDBFactory()) {
  const urls = new Map();
  let nextURL = 0;
  class TestURL extends URL {
    static createObjectURL(blob) { const id = `blob:owned-catalog/${++nextURL}`; urls.set(id, blob); return id; }
    static revokeObjectURL(id) { urls.delete(id); }
  }
  class TestImage { naturalWidth = 768; naturalHeight = 1024; decode() { return Promise.resolve(); } }
  const nodes = new Map(['app', 'sheet-root', 'toast'].map((id) => [id, {
    innerHTML: '', classList: { add() {}, remove() {} },
    querySelector() { return null; }, querySelectorAll() { return []; },
  }]));
  const listeners = new Map();
  const storage = new Map();
  const context = vm.createContext({
    indexedDB, Blob, crypto: globalThis.crypto, structuredClone, btoa, atob,
    Uint8Array, DataView, TextEncoder, TextDecoder, URL: TestURL,
    Image: TestImage, HTMLImageElement: TestImage,
    localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) },
    document: {
      getElementById: (id) => nodes.get(id) ?? null,
      addEventListener(type, fn) { listeners.set(type, [...(listeners.get(type) || []), fn]); },
      querySelector: () => null, querySelectorAll: () => [], body: { style: {}, append() {} },
      createElement(tag) {
        if (tag !== 'canvas') return { click() {}, remove() {} };
        let outputBlob;
        return { getContext: () => ({ fillRect() {}, drawImage(image) { outputBlob = urls.get(image.src); } }), toBlob: (callback) => callback(outputBlob) };
      },
    },
    window: { scrollTo() {} }, CSS: { escape: (value) => value },
    setTimeout: () => 1, clearTimeout() {}, requestAnimationFrame: (fn) => fn(),
  });
  vm.runInContext(script, context);
  await context.testApp.ready;
  return {
    app: context.testApp, nodes, indexedDB, urls,
    state: () => plain(context.testApp.state()), sheet: () => nodes.get('sheet-root').innerHTML,
    async click(dataset) {
      for (const fn of listeners.get('click') || []) await fn({ target: { closest: () => ({ dataset }) }, preventDefault() {}, stopPropagation() {} });
    },
    input(id, value) { for (const fn of listeners.get('input') || []) fn({ target: { id, value, dataset: {} } }); },
    async change(target) { for (const fn of listeners.get('change') || []) await fn({ target }); },
    close() { context.testApp.store.close(); },
  };
}

const plain = (value) => JSON.parse(JSON.stringify(value));
const data = (name = '합성 시험 셔츠') => ({ format: 'eoul-orders', version: 1, retailer: 'musinsa', extractedAt: '2026-10-18T00:00:00.000Z', items: [{
  key: 'a'.repeat(64), identity: 'order', productId: 'ms-900000000001', url: 'https://www.musinsa.com/products/900000000001', name,
  brand: '검증용 브랜드', option: 'M', orderDate: '2024-05-12', status: 'returned', quantity: 1, amount: 12300,
}] });

test('review and cancellation do not write; selected orders save once and survive reload', async (t) => {
  let page = await boot(); t.after(() => page.close());
  const initial = await page.app.store.read();
  await page.click({ action: 'order-import-open' });
  page.app.reviewOrderImport(JSON.stringify(data('<img src=x onerror=bad>')));
  assert.match(page.sheet(), /&lt;img src=x onerror=bad&gt;/);
  assert.doesNotMatch(page.sheet(), /<img src=x/);
  assert.equal((await page.app.store.read()).revision, initial.revision);
  await page.click({ action: 'close-sheet' });
  assert.equal((await page.app.store.read()).revision, initial.revision);
  await page.click({ action: 'order-import-open' }); page.app.reviewOrderImport(JSON.stringify(data()));
  await page.click({ action: 'order-import-save' });
  const saved = await page.app.store.read();
  assert.equal(saved.state.journeys.length, 1);
  assert.deepEqual(plain(saved.state.garments), plain(initial.state.garments));
  assert.equal(saved.state.journeys[0].stage, 'candidate');
  assert.match(page.nodes.get('app').innerHTML, /무신사 주문 · 반품 완료/);
  await page.click({ action: 'open-journey', id: saved.state.journeys[0].id });
  assert.match(page.sheet(), /장부에만 보관/);
  assert.doesNotMatch(page.sheet(), /data-action="order-import-connect"/);
  const db = page.indexedDB; page.close(); page = await boot(db);
  assert.equal(page.state().journeys.length, 1);
  await page.click({ action: 'order-import-open' }); page.app.reviewOrderImport(JSON.stringify(data()));
  assert.match(page.sheet(), /이미 가져온 주문/);
  await page.click({ action: 'order-import-save' });
  assert.equal((await page.app.store.read()).state.journeys.length, 1);
});

test('storage refusal retains the source selection without claiming success', async (t) => {
  const page = await boot(); t.after(() => page.close());
  await page.click({ action: 'order-import-open' }); page.app.reviewOrderImport(JSON.stringify(data()));
  const original = await page.app.store.read();
  const put = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (...args) {
    if (this.name === 'records') throw new DOMException('synthetic quota', 'QuotaExceededError');
    return put.apply(this, args);
  };
  try { await page.click({ action: 'order-import-save' }); } finally { IDBObjectStore.prototype.put = put; }
  assert.equal((await page.app.store.read()).revision, original.revision);
  assert.equal(page.state().journeys.length, 0);
  assert.ok(page.app.draft());
  assert.equal(page.app.draft().selected.size, 1);
  assert.match(page.sheet(), /role="alert"/);
  assert.doesNotMatch(page.nodes.get('toast').innerHTML, /장부에 저장/);
});

test('a replaced wardrobe cannot receive a prior account or wardrobe order draft', async (t) => {
  const page = await boot(); t.after(() => page.close());
  await page.click({ action: 'order-import-open' }); page.app.reviewOrderImport(JSON.stringify(data()));
  page.app.contextChanged(); await page.click({ action: 'order-import-save' });
  assert.equal((await page.app.store.read()).state.journeys.length, 0);
  assert.match(page.sheet(), /옷장이나 계정이 바뀌었어요/);
});

test('late file reads cannot resurrect a closed import', async (t) => {
  const page = await boot(); t.after(() => page.close());
  await page.click({ action: 'order-import-open' });
  let resolveFile;
  const pending = page.change({ id: 'order-import-input', dataset: {}, value: 'file', files: [{ size: 1000, text: () => new Promise((resolve) => { resolveFile = resolve; }) }] });
  await page.click({ action: 'close-sheet' }); resolveFile(JSON.stringify(data())); await pending;
  assert.equal(page.app.draft(), null);
  assert.equal(page.sheet(), '');
  assert.equal((await page.app.store.read()).state.journeys.length, 0);
});
