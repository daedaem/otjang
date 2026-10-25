import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { PRODUCTS } from '../../../app/lite/src/domain/data/products.js';
import { SLOT_BY_ID } from '../../../app/lite/src/domain/data/slots.js';
import { makeGarment, newWardrobeState } from '../../../app/lite/src/domain/wardrobe.js';
import { createWardrobeStore, photoAsset } from '../src/wardrobe-store.js';
import { candidateFromProduct } from '../../../app/lite/src/domain/purchase-candidate.js';
import { createPurchaseJourney, transitionPurchaseJourney } from '../../../app/lite/src/domain/purchase-journey.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'eoul-owned-color-'));
after(() => fs.rmSync(temp, { recursive: true, force: true }));
const output = path.join(temp, 'index.html');
execFileSync(process.execPath, [path.join(root, 'tools/build.mjs'), '--out', output]);
const html = fs.readFileSync(output, 'utf8');
const script = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1].replace(
  /\n\}\)\(\);\s*$/,
  '\nglobalThis.testApp = { state: () => state, ready: appReady, store: wardrobeStore, draft: () => draft, beginDraft, chooseGarmentPhoto, saveGarmentDraft };\n})();',
);

// Real bundled callbacks and IndexedDB commits with DOM doubles. They check what is
// stored and shown; they do not show that the wording is understood by real users.
async function boot(indexedDB = new IDBFactory()) {
  const urls = new Map();
  let nextURL = 0;
  class TestURL extends URL {
    static createObjectURL(blob) { const id = `blob:owned-color/${++nextURL}`; urls.set(id, blob); return id; }
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
    close() { context.testApp.store.close(); },
  };
}

const plain = (value) => JSON.parse(JSON.stringify(value));
const jpeg = (value = 7) => new Blob([new Uint8Array([255, 216, 255, value])], { type: 'image/jpeg' });
const white = PRODUCTS.find((p) => p.id === 'ms-728000');
const female = PRODUCTS.find((p) => p.id === 'ms-1115031');
assert.ok(white && female);
async function stored(page) { const row = await page.app.store.read(); return { revision: row.revision, state: plain(row.state), photos: row.photos }; }
async function samePhoto(saved, source) {
  assert.ok(saved, 'the selected private photograph must remain available');
  assert.deepEqual(new Uint8Array(await saved.arrayBuffer()), new Uint8Array(await source.arrayBuffer()));
}
async function seed({ garments = [], assets = [], journeys = [], preferences = {} } = {}) {
  const indexedDB = new IDBFactory();
  const store = createWardrobeStore({ indexedDB });
  const first = await store.load();
  await store.commit({ ...newWardrobeState(), demo: false, demoSelected: [], garments, journeys, ...preferences }, first.revision, assets, first.epoch);
  store.close();
  return boot(indexedDB);
}
async function select(page, product = white, query = product.url) {
  await page.click({ action: 'owned-catalog-start' });
  page.input('owned-catalog-query', query);
  await page.click({ action: 'owned-catalog-select', id: product.id });
  assert.equal(page.app.draft().catalogProductId, product.id);
}

const imageColored = PRODUCTS.find((p) => p.id === 'ms-5101728');
assert.ok(imageColored && imageColored.colorSource === 'image');
const toastText = (page) => page.nodes.get('toast').innerHTML;

test('the ownership sheet says what an unconfirmed color means before saving', async (t) => {
  const page = await boot();
  t.after(() => page.close());
  await select(page, white);
  assert.match(page.sheet(), /색을 확인하지 않으면 이 옷은 구매 비교의 조합 수에 들어가지 않고/);
  await page.click({ action: 'owned-catalog-color', color: 'white' });
  assert.match(page.sheet(), /확인한 색: [^·]+ · 구매 후보와 비교할 때 이 옷을 조합 수에 넣어요/);
  assert.doesNotMatch(page.sheet(), /조합 수에 들어가지 않고/);
});

test('a seller-shown color can only be confirmed; a forged different color is ignored', async (t) => {
  const page = await boot();
  t.after(() => page.close());
  await select(page, white);
  await page.click({ action: 'owned-catalog-color', color: 'navy' });
  assert.equal(page.app.draft().catalogColor, null);
  await page.click({ action: 'owned-catalog-color', color: 'not-a-color' });
  assert.equal(page.app.draft().catalogColor, null);
});

test('when the catalog color is only guessed from a photo, the user picks their own color from the palette', async (t) => {
  const page = await boot();
  t.after(() => page.close());
  await select(page, imageColored);
  const sheet = page.sheet();
  assert.match(sheet, /상품 사진에서 색을 추정하지 않으니 내 옷 색을 골라 주세요/);
  assert.match(sheet, /data-action="owned-catalog-color" data-color="navy"/);
  await page.click({ action: 'owned-catalog-color', color: 'navy' });
  await page.click({ action: 'owned-catalog-confirm', id: imageColored.id });
  const saved = page.state().garments.find((g) => g.productId === imageColored.id);
  assert.equal(saved.color, 'navy', 'the user-confirmed color is stored, not the guessed catalog color');
});

test('saving without a color says how to fix it, flags the tile and offers a one-tap color without touching preferences', async (t) => {
  const page = await seed({ preferences: { styles: ['cityboy', 'dandy'], brands: ['리바이스'], budget: 1, occasion: 'formal' } });
  t.after(() => page.close());
  const before = page.state();
  await select(page, white);
  await page.click({ action: 'owned-catalog-confirm', id: white.id });
  assert.match(toastText(page), /색을 확인하면 구매 비교에도 쓰여요/);
  const item = page.state().garments.find((g) => g.productId === white.id);
  assert.equal(item.color, null);
  assert.match(page.nodes.get('app').innerHTML, new RegExp(`data-id="${item.id}">(?:(?!</button>)[\\s\\S])*<span class="closet-status">색 확인</span>`), 'the tile itself shows what to confirm, under the photo');

  await page.click({ action: 'open-own', id: item.id });
  assert.match(page.sheet(), /색 미확인<\/b> · 색을 확인하지 않은 옷은 구매 후보와 비교할 때 조합 수에 들어가지 않아요/);
  assert.match(page.sheet(), /data-action="own-color"[^>]*data-color="white"[^>]*>상품 색\(/);
  await page.click({ action: 'own-color', id: item.id, color: 'navy' });
  assert.equal(page.state().garments.find((g) => g.id === item.id).color, null, 'a color different from the seller color is not saved on the product link');
  await page.click({ action: 'own-color', id: item.id, color: 'white' });
  const after = (await stored(page)).state;
  assert.equal(after.garments.find((g) => g.id === item.id).color, 'white');
  assert.match(toastText(page), /구매 비교에도 쓰여요/);
  for (const key of ['gender', 'styles', 'brands', 'budget', 'occasion']) assert.deepEqual(after[key], before[key], key);
});
