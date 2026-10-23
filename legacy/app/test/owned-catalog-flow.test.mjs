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
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'eoul-owned-catalog-flow-'));
after(() => fs.rmSync(temp, { recursive: true, force: true }));
const output = path.join(temp, 'index.html');
execFileSync(process.execPath, [path.join(root, 'tools/build.mjs'), '--out', output]);
const html = fs.readFileSync(output, 'utf8');
const script = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1].replace(
  /\n\}\)\(\);\s*$/,
  '\nglobalThis.testApp = { state: () => state, ready: appReady, store: wardrobeStore, draft: () => draft, beginDraft, chooseGarmentPhoto, saveGarmentDraft };\n})();',
);

// Real bundled callbacks and IndexedDB commits, with DOM/canvas/decoding doubles.
// These checks do not establish browser rendering, camera access or recognition quality.
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
async function withQuota(callback) {
  const put = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (...args) {
    if (this.name === 'records') throw new DOMException('owned catalog synthetic quota', 'QuotaExceededError');
    return put.apply(this, args);
  };
  try { await callback(); } finally { IDBObjectStore.prototype.put = put; }
}

test('search and selection remain drafts and ignore shopping budget, brands and style preferences', async (t) => {
  const page = await seed({ preferences: { budget: 1, brands: ['리바이스'], brandOnly: true, styles: ['gorp'], occasion: 'formal' } });
  t.after(() => page.close());
  const before = await stored(page);
  await page.click({ action: 'add-start' });
  await select(page, white, '무신사스탠다드 옥스포드 화이트');
  assert.match(page.sheet(), /이 상품을 가지고 있나요\?/);
  assert.equal(page.app.draft().productId, null);
  assert.equal(page.app.draft().brand, null);
  assert.equal(page.app.draft().catalogColor, null);
  const after = await stored(page);
  assert.deepEqual(after.state, before.state);
  assert.equal(after.revision, before.revision);
  assert.equal(after.photos.size, 0);
});

test('a supported exact product link selects one catalog item and a forged selection is ignored', async (t) => {
  const page = await boot();
  t.after(() => page.close());
  await page.click({ action: 'add-start' });
  await page.click({ action: 'owned-catalog-start' });
  page.input('owned-catalog-query', 'https://m.musinsa.com/app/goods/728000?source=owned');
  assert.match(page.sheet(), /data-action="owned-catalog-select" data-id="ms-728000"/);
  assert.doesNotMatch(page.sheet(), /data-action="owned-catalog-select" data-id="ms-854339"/);
  await page.click({ action: 'owned-catalog-select', id: 'ms-854339' });
  assert.equal(page.app.draft().catalogProductId, null);
  await page.click({ action: 'owned-catalog-select', id: white.id });
  assert.equal(page.app.draft().catalogProductId, white.id);
});

test('unknown IDs and unsupported links display absence without fabricating a matching product', async (t) => {
  const page = await boot();
  t.after(() => page.close());
  const before = await stored(page);
  await page.click({ action: 'owned-catalog-start' });
  for (const query of ['내 목록에 없는 새로운 브랜드 상품', 'https://www.musinsa.com/products/999999999999']) {
    page.input('owned-catalog-query', query);
    assert.match(page.sheet(), /저장된 상품 목록에 없어요/);
    assert.doesNotMatch(page.sheet(), /data-action="owned-catalog-select"/);
    await page.click({ action: 'owned-catalog-select', id: white.id });
    assert.equal(page.app.draft().catalogProductId, null);
  }
  page.input('owned-catalog-query', 'https://musinsa.com.evil.example/products/728000');
  assert.match(page.sheet(), /이 주소로 찾을 수 없어요/);
  assert.equal((await stored(page)).revision, before.revision);
});

test('final ownership confirmation stores an unknown color until the user explicitly confirms it', async (t) => {
  for (const confirmColor of [false, true]) {
    const page = await boot();
    t.after(() => page.close());
    const before = await stored(page);
    await select(page);
    assert.equal(page.app.draft().catalogColor, null);
    if (confirmColor) await page.click({ action: 'owned-catalog-color', color: white.color });
    await page.click({ action: 'owned-catalog-confirm', id: white.id });
    const saved = await stored(page);
    assert.equal(saved.revision, before.revision + 1);
    assert.equal(saved.state.garments.length, 1);
    const item = saved.state.garments[0];
    assert.equal(item.productId, white.id);
    assert.equal(item.brand, white.brand);
    assert.equal(item.color, confirmColor ? white.color : null);
    assert.equal(saved.state.demo, false);
    assert.equal(page.app.draft(), null);
  }
});

test('a conflicting confirmed color blocks exact linkage and similar registration does not guess a product or brand', async (t) => {
  const page = await boot();
  t.after(() => page.close());
  page.app.beginDraft();
  await page.click({ action: 'draft-kind', kind: 'shirt' });
  await page.click({ action: 'draft-color', color: 'blue' });
  const before = await stored(page);
  await select(page);
  assert.match(page.sheet(), /확인한 내 옷 색과 상품에 표시된 색이 달라요/);
  await page.click({ action: 'owned-catalog-confirm', id: white.id });
  assert.equal((await stored(page)).revision, before.revision);
  await page.click({ action: 'owned-catalog-similar', id: white.id });
  assert.equal(page.app.draft().productId, null);
  assert.equal(page.app.draft().brand, null);
  assert.equal(page.app.draft().slot, null);
  assert.equal(page.app.draft().color, 'blue');
  await page.app.saveGarmentDraft();
  const item = (await stored(page)).state.garments[0];
  assert.equal(item.productId, null);
  assert.equal(item.brand, null);
  assert.equal(item.kind, SLOT_BY_ID[white.slot].shape);
  assert.equal(item.color, 'blue');
});

test('back navigation and exact save preserve the chosen private photo and the user label and do not guess over its brand', async (t) => {
  const page = await boot();
  t.after(() => page.close());
  page.app.beginDraft();
  await page.click({ action: 'draft-kind', kind: 'shirt' });
  page.input('garment-label', '내가 부르는 셔츠');
  page.input('garment-brand', '내가 읽은 브랜드');
  const source = jpeg(52);
  await page.app.chooseGarmentPhoto(source);
  const original = page.app.draft().asset;
  await select(page);
  assert.match(page.sheet(), /내 사진 · 그대로 보관해요/);
  assert.equal(page.app.draft().brand, '내가 읽은 브랜드');
  await page.click({ action: 'owned-catalog-back' });
  assert.equal(page.app.draft().entryMode, 'photo');
  assert.equal(page.app.draft().label, '내가 부르는 셔츠');
  assert.equal(page.app.draft().brand, '내가 읽은 브랜드');
  assert.equal(page.app.draft().asset.id, original.id);
  await select(page);
  await page.click({ action: 'owned-catalog-confirm', id: white.id });
  const saved = await stored(page);
  const item = saved.state.garments[0];
  assert.equal(item.label, '내가 부르는 셔츠');
  assert.equal(item.brand, white.brand, 'only the explicit same-product confirmation adopts the catalog brand');
  assert.equal(item.photoId, original.id);
  await samePhoto(saved.photos.get(original.id), source);
});

test('a quota failure preserves lookup, selected product, explicit color and photo until a successful atomic retry', async (t) => {
  const page = await boot();
  t.after(() => page.close());
  page.app.beginDraft();
  const source = jpeg(53);
  await page.app.chooseGarmentPhoto(source);
  page.input('garment-label', '다시 저장할 내 옷');
  await select(page, white, '무신사스탠다드 옥스포드 화이트');
  await page.click({ action: 'owned-catalog-color', color: white.color });
  const original = page.app.draft().asset;
  const before = await stored(page);
  await withQuota(() => page.click({ action: 'owned-catalog-confirm', id: white.id }));
  const draft = page.app.draft();
  assert.equal(draft.catalogQuery, '무신사스탠다드 옥스포드 화이트');
  assert.equal(draft.catalogProductId, white.id);
  assert.equal(draft.catalogColor, white.color);
  assert.equal(draft.asset.id, original.id);
  assert.equal(draft.label, '다시 저장할 내 옷');
  assert.equal(draft.saving, false);
  assert.ok(draft.error);
  assert.match(page.sheet(), /data-action="owned-catalog-confirm"/);
  const failed = await stored(page);
  assert.equal(failed.revision, before.revision);
  assert.equal(failed.photos.size, 0);
  assert.deepEqual(failed.state, before.state);
  await page.click({ action: 'owned-catalog-confirm', id: white.id });
  const saved = await stored(page);
  assert.equal(saved.state.garments.length, 1);
  assert.equal(saved.state.garments[0].photoId, original.id);
  assert.equal(saved.state.garments[0].color, white.color);
  await samePhoto(saved.photos.get(original.id), source);
});

test('an existing edit keeps its ID, registration date and original photo while explicitly linking a catalog product', async (t) => {
  const asset = await photoAsset(jpeg(54));
  const owned = makeGarment({ id: 'existing-owned', kind: 'shirt', gender: 'M', photoId: asset.id, label: '원래 내 셔츠', createdAt: '2026-10-10T00:00:00.000Z' });
  const page = await seed({ garments: [owned], assets: [asset] });
  t.after(() => page.close());
  await page.click({ action: 'edit-own', id: owned.id });
  await select(page);
  await page.click({ action: 'owned-catalog-confirm', id: white.id });
  const saved = await stored(page);
  assert.equal(saved.state.garments.length, 1);
  assert.equal(saved.state.garments[0].id, owned.id);
  assert.equal(saved.state.garments[0].createdAt, owned.createdAt);
  assert.equal(saved.state.garments[0].label, owned.label);
  assert.equal(saved.state.garments[0].productId, white.id);
  await samePhoto(saved.photos.get(asset.id), asset.blob);
});

test('a competing edit cannot be overwritten after a revision conflict or after reloading the selected draft', async (t) => {
  const owned = makeGarment({ id: 'conflicting-owned', kind: 'shirt', gender: 'M', label: '첫 이름' });
  const first = await seed({ garments: [owned] });
  const second = await boot(first.indexedDB);
  t.after(() => { first.close(); second.close(); });
  await first.click({ action: 'edit-own', id: owned.id });
  await select(first);
  await second.click({ action: 'edit-own', id: owned.id });
  second.input('garment-label', '다른 화면에서 바꾼 이름');
  await second.app.saveGarmentDraft();
  const before = await stored(second);
  await first.click({ action: 'owned-catalog-confirm', id: white.id });
  assert.ok(first.app.draft().error);
  assert.equal(first.app.draft().catalogProductId, white.id);
  assert.equal((await stored(first)).revision, before.revision);
  await first.click({ action: 'reload-wardrobe' });
  await first.click({ action: 'owned-catalog-confirm', id: white.id });
  const saved = await stored(first);
  assert.equal(saved.revision, before.revision);
  assert.equal(saved.state.garments[0].label, '다른 화면에서 바꾼 이름');
  assert.equal(saved.state.garments[0].productId, null);
  assert.match(first.app.draft().error, /다른 화면에서 바뀌었어요/);
});

test('a failed latest read refuses catalog ownership writes but retains selection and photo for reload and retry', async (t) => {
  const page = await boot();
  t.after(() => page.close());
  page.app.beginDraft();
  const source = jpeg(55);
  await page.app.chooseGarmentPhoto(source);
  await select(page);
  const photoId = page.app.draft().asset.id;
  const before = await stored(page);
  const read = page.app.store.read;
  page.app.store.read = async () => { throw new Error('synthetic latest read failed'); };
  try {
    await page.click({ action: 'reload-wardrobe' });
    await page.click({ action: 'owned-catalog-confirm', id: white.id });
    assert.ok(page.app.draft().error);
    assert.equal(page.app.draft().catalogProductId, white.id);
    assert.equal(page.app.draft().asset.id, photoId);
  } finally { page.app.store.read = read; }
  assert.equal((await stored(page)).revision, before.revision);
  await page.click({ action: 'reload-wardrobe' });
  await page.click({ action: 'owned-catalog-confirm', id: white.id });
  const saved = await stored(page);
  assert.equal(saved.state.garments.length, 1);
  await samePhoto(saved.photos.get(photoId), source);
});

test('female catalog clothes become visible without rewriting any male-only recommendation preferences', async (t) => {
  const male = makeGarment({ id: 'male-owned', kind: 'shirt', gender: 'M', label: '남성 기존 셔츠' });
  const preferences = { gender: 'M', budget: 1, styles: ['cityboy', 'dandy'], brands: ['리바이스'], brandOnly: true, occasion: 'formal' };
  const page = await seed({ garments: [male], preferences });
  t.after(() => page.close());
  await select(page, female);
  assert.equal(page.state().gender, 'M');
  assert.deepEqual(page.state().garments, [male]);
  await page.click({ action: 'owned-catalog-confirm', id: female.id });
  const owned = page.state().garments.find((g) => g.productId === female.id);
  assert.ok(owned);
  assert.equal(owned.gender, 'F');
  for (const [key, value] of Object.entries(preferences)) assert.deepEqual(page.state()[key], value, key);
  assert.equal(page.state().tab, 'closet');
  assert.ok(page.nodes.get('app').innerHTML.includes(`data-action="open-own" data-id="${owned.id}"`));
  assert.ok(page.nodes.get('app').innerHTML.includes(`data-action="open-own" data-id="${male.id}"`));
  assert.deepEqual(page.state().garments.find((g) => g.id === male.id), male);
  assert.match(page.nodes.get('app').innerHTML, /코디 추천 기준: 남성/);
  const saved = await stored(page);
  for (const [key, value] of Object.entries(preferences)) assert.deepEqual(saved.state[key], value, `persisted ${key}`);
  const again = await boot(page.indexedDB);
  t.after(() => again.close());
  await again.click({ action: 'tab', tab: 'closet' });
  for (const [key, value] of Object.entries(preferences)) assert.deepEqual(again.state()[key], value, `reloaded ${key}`);
  assert.ok(again.nodes.get('app').innerHTML.includes(`data-action="open-own" data-id="${owned.id}"`));
  assert.ok(again.nodes.get('app').innerHTML.includes(`data-action="open-own" data-id="${male.id}"`));
});

test('the mixed wardrobe lists active male and female garments while excluding pending and returned female records', async (t) => {
  const at = '2026-10-14T00:00:00.000Z';
  const asset = await photoAsset(jpeg(56));
  const male = makeGarment({ id: 'mixed-active-m', kind: 'shirt', gender: 'M', label: '보유 남성 셔츠' });
  const active = makeGarment({ id: 'mixed-active-f', kind: 'sneaker', gender: 'F', label: '보유 여성 신발' });
  const pending = makeGarment({ id: 'mixed-pending-f', kind: 'sneaker', gender: 'F', label: '보관 미확정 여성 신발', photoId: asset.id });
  const returned = makeGarment({ id: 'mixed-returned-f', kind: 'sneaker', gender: 'F', label: '반품 여성 신발', photoId: asset.id });
  function journeyFor(garment, stage) {
    let journey = createPurchaseJourney(candidateFromProduct(female), { id: `journey-${garment.id}`, at });
    journey = transitionPurchaseJourney(journey, 'ordered', { at });
    journey = transitionPurchaseJourney(journey, 'received', { at, changes: { garmentId: garment.id } });
    if (stage === 'returned') journey = transitionPurchaseJourney(journey, 'returned', { at });
    return journey;
  }
  const journeys = [journeyFor(pending, 'received'), journeyFor(returned, 'returned')];
  const page = await seed({ garments: [male, active, pending, returned], assets: [asset], journeys, preferences: { gender: 'M', styles: ['cityboy', 'dandy'] } });
  t.after(() => page.close());
  await page.click({ action: 'tab', tab: 'closet' });
  const grid = page.nodes.get('app').innerHTML.match(/<div class="closet-items">([\s\S]*?)<\/section>/)?.[1];
  assert.ok(grid);
  for (const item of [male, active]) assert.ok(grid.includes(`data-action="open-own" data-id="${item.id}"`), item.id);
  for (const item of [pending, returned]) assert.ok(!grid.includes(`data-action="open-own" data-id="${item.id}"`), item.id);
  assert.deepEqual(page.state().closet.map((g) => g.id), [male.id, active.id]);
  assert.equal(page.state().garments.length, 4, 'inactive records are retained rather than silently deleted');
  assert.match(page.nodes.get('app').innerHTML, /등록한 내 옷 2벌/);
  const saved = await stored(page);
  assert.deepEqual(saved.state.journeys, journeys);
  assert.deepEqual(saved.state.garments, [male, active, pending, returned]);
  await samePhoto(saved.photos.get(asset.id), asset.blob);
});

test('double clicking confirmation creates one garment and another explicit selection still needs its own confirmation', async (t) => {
  const page = await boot();
  t.after(() => page.close());
  await select(page);
  await Promise.all([
    page.click({ action: 'owned-catalog-confirm', id: white.id }),
    page.click({ action: 'owned-catalog-confirm', id: white.id }),
  ]);
  assert.equal(page.state().garments.length, 1);
  await page.click({ action: 'owned-catalog-confirm', id: white.id });
  assert.equal(page.state().garments.length, 1, 'stale confirmation cannot create a new draft');
  await page.click({ action: 'own-product', id: white.id });
  assert.match(page.sheet(), /같은 상품 한 벌 더 저장/);
  assert.equal(page.state().garments.length, 1);
  await page.click({ action: 'owned-catalog-confirm', id: white.id });
  assert.equal(page.state().garments.length, 2, 'a separately confirmed second owned garment is allowed');
  assert.notEqual(page.state().garments[0].id, page.state().garments[1].id);
});
