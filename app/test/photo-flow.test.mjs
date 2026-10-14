import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { PRODUCTS } from '../src/data/products.js';
import { SLOT_BY_ID } from '../src/data/slots.js';
import { createWardrobeStore } from '../src/wardrobe-store.js';
import { makeGarment } from '../src/wardrobe.js';

const photoFlowRoot = fileURLToPath(new URL('../', import.meta.url));
const photoFlowTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'eoul-photo-flow-'));
after(() => fs.rmSync(photoFlowTemp, { recursive: true, force: true }));
const photoFlowOutput = path.join(photoFlowTemp, 'index.html');
execFileSync(process.execPath, [path.join(photoFlowRoot, 'tools/build.mjs'), '--out', photoFlowOutput]);
const photoFlowHTML = fs.readFileSync(photoFlowOutput, 'utf8');
const photoFlowScript = photoFlowHTML.match(/<script type="module">([\s\S]*?)<\/script>/)[1].replace(
  /\n\}\)\(\);\s*$/,
  '\nglobalThis.testApp = { state: () => state, ready: appReady, store: wardrobeStore, draft: () => draft, beginDraft, chooseGarmentPhoto, analyzeDraftPhoto, saveGarmentDraft, closeSheet, setPhotoRecognizerFactory: (factory) => { photoRecognizerFactory = factory; }, setPhotoAnalysisAllowed: (allowed) => { photoAnalysisAllowed = allowed; } };\n})();',
);

// These tests execute the actual bundled UI callbacks and IndexedDB transaction
// path. Synthetic decoding and inference doubles verify lifecycle/data safety;
// they do not measure recognition quality, browser layout or camera performance.
async function bootPhotoFlow({ indexedDB = new IDBFactory(), factory, allowAnalysis = true, navigator: photoNavigator } = {}) {
  const urls = new Map();
  let nextURL = 0;
  class PhotoTestURL extends URL {
    static createObjectURL(blob) { const id = `blob:photo-flow/${++nextURL}`; urls.set(id, blob); return id; }
    static revokeObjectURL(id) { urls.delete(id); }
  }
  class PhotoTestImage {
    naturalWidth = 768;
    naturalHeight = 1024;
    decode() { return Promise.resolve(); }
  }
  const nodes = new Map(['app', 'sheet-root', 'toast'].map((id) => [id, {
    innerHTML: '', classList: { add() {}, remove() {} },
    querySelector() { return null; }, querySelectorAll() { return []; },
  }]));
  const listeners = new Map();
  const storage = new Map();
  const context = vm.createContext({
    indexedDB, Blob, crypto: globalThis.crypto, structuredClone, btoa, atob,
    Uint8Array, DataView, TextEncoder, TextDecoder, URL: PhotoTestURL,
    Image: PhotoTestImage, HTMLImageElement: PhotoTestImage,
    localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) },
    document: {
      getElementById: (id) => nodes.get(id) ?? null,
      addEventListener(type, fn) { listeners.set(type, [...(listeners.get(type) || []), fn]); },
      querySelector: () => null, querySelectorAll: () => [],
      body: { style: {}, append() {} },
      createElement(tag) {
        if (tag !== 'canvas') return { click() {}, remove() {} };
        let outputBlob;
        return { getContext: () => ({ fillRect() {}, drawImage(image) { outputBlob = urls.get(image.src); } }), toBlob: (callback) => callback(outputBlob) };
      },
    },
    window: { scrollTo() {} }, CSS: { escape: (value) => value },
    ...(photoNavigator ? { navigator: photoNavigator } : {}),
    setTimeout: () => 1, clearTimeout() {}, requestAnimationFrame: (fn) => fn(),
  });
  vm.runInContext(photoFlowScript, context);
  await context.testApp.ready;
  if (factory) {
    context.testApp.setPhotoRecognizerFactory(factory);
    context.testApp.setPhotoAnalysisAllowed(allowAnalysis);
  }
  return {
    app: context.testApp, indexedDB, storage, nodes, urls,
    state: () => JSON.parse(JSON.stringify(context.testApp.state())),
    async click(dataset) {
      for (const fn of listeners.get('click') || []) await fn({ target: { closest: () => ({ dataset }) }, preventDefault() {}, stopPropagation() {} });
    },
    input(id, value) { for (const fn of listeners.get('input') || []) fn({ target: { id, value, dataset: {} } }); },
    async change(id, value, targetProperties = {}) {
      for (const fn of listeners.get('change') || []) await fn({ target: { id, value, dataset: {}, ...targetProperties } });
    },
    close() { context.testApp.store.close(); },
  };
}

function deferredRecognizer() {
  const jobs = [];
  let cancels = 0;
  let disposals = 0;
  const recognizer = {
    analyze(blob, options) {
      return new Promise((resolve, reject) => jobs.push({ blob, options, resolve, reject }));
    },
    // Deliberately allow a canceled worker's late result to arrive, so the app's
    // own draft/token guards are tested independently of worker cancellation.
    cancel() { cancels++; }, dispose() { disposals++; },
  };
  return { jobs, recognizer, factory: () => recognizer, get cancels() { return cancels; }, get disposals() { return disposals; } };
}
const photoFlowJPEG = (value = 7) => new Blob([new Uint8Array([255, 216, 255, value])], { type: 'image/jpeg' });
const photoFlowResult = (extra = {}) => ({
  kinds: [{ kind: 'shirt', label: '셔츠', score: 0.82 }],
  colors: [{ color: 'blue', label: '라이트 블루', score: 0.74 }],
  text: 'PATAGONIA', requiresCrop: false, warnings: [],
  model: 'synthetic-local-model', revision: 'synthetic-local-revision',
  scoreMeaning: 'relative-label-score', requiresConfirmation: true, elapsedMs: 12, ...extra,
});
const photoFlowPlain = (value) => JSON.parse(JSON.stringify(value));
async function photoFlowStored(page) { const row = await page.app.store.read(); return { revision: row.revision, epoch: row.epoch, state: photoFlowPlain(row.state), photos: row.photos }; }
async function waitForPhotoJob(fake, count) {
  // The first WebCrypto image digest can complete after several event-loop
  // turns. Give that real async boundary a bounded timeout, not a fixed tick count.
  const deadline = Date.now() + 2000;
  while (fake.jobs.length < count && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 2));
  assert.ok(fake.jobs.length >= count, `expected local analysis job ${count}`);
  return fake.jobs[count - 1];
}
async function chooseAnalyzedPhoto(page, fake, blob = photoFlowJPEG(), result = photoFlowResult()) {
  const nextJob = fake.jobs.length + 1;
  const chosen = page.app.chooseGarmentPhoto(blob);
  const job = await waitForPhotoJob(fake, nextJob);
  job.resolve(result);
  await chosen;
  return blob;
}
async function assertPhotoFlowBytes(savedBlob, original) {
  assert.ok(savedBlob, 'the original chosen garment image must remain available');
  assert.deepEqual(new Uint8Array(await savedBlob.arrayBuffer()), new Uint8Array(await original.arrayBuffer()));
}
async function withPhotoFlowQuota(callback) {
  const put = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (...args) {
    if (this.name === 'records') throw new DOMException('synthetic photo save quota', 'QuotaExceededError');
    return put.apply(this, args);
  };
  try { await callback(); } finally { IDBObjectStore.prototype.put = put; }
}

test('photo analysis shows confirmable suggestions without assigning brand, kind, color or a product automatically', async (t) => {
  const fake = deferredRecognizer();
  const page = await bootPhotoFlow({ factory: fake.factory });
  t.after(() => page.close());
  const before = await photoFlowStored(page);
  page.app.beginDraft();
  const source = await chooseAnalyzedPhoto(page, fake);
  const draft = page.app.draft();
  assert.equal(draft.kind, null);
  assert.equal(draft.color, null);
  assert.equal(draft.brand, null);
  assert.equal(draft.productId, null);
  assert.deepEqual(photoFlowPlain(draft.photoRecognition.kinds), photoFlowResult().kinds);
  assert.equal(draft.photoIdentity.brands[0].brand, '파타고니아');
  assert.match(page.nodes.get('sheet-root').innerHTML, /확인|후보|제안/);
  assert.doesNotMatch(page.nodes.get('sheet-root').innerHTML, /data-action="photo-brand"/, 'whole-photo print text must not immediately become a brand choice');
  await assertPhotoFlowBytes(draft.asset.blob, source);
  const after = await photoFlowStored(page);
  assert.equal(after.revision, before.revision);
  assert.deepEqual(after.state, before.state);
  assert.equal(after.photos.size, 0);
});

test('explicit kind, color and observed brand confirmations are saved atomically with the chosen photo bytes', async (t) => {
  const fake = deferredRecognizer();
  const page = await bootPhotoFlow({ factory: fake.factory });
  t.after(() => page.close());
  const before = await photoFlowStored(page);
  page.app.beginDraft();
  const source = await chooseAnalyzedPhoto(page, fake, photoFlowJPEG(11));
  await page.click({ action: 'photo-kind', kind: 'shirt' });
  await page.click({ action: 'photo-color', color: 'blue' });
  await page.click({ action: 'photo-text-match' });
  await page.click({ action: 'photo-brand', brand: '파타고니아' });
  page.input('garment-label', '내가 확인한 셔츠');
  const id = page.app.draft().id;
  await page.app.saveGarmentDraft();
  const saved = await photoFlowStored(page);
  const item = saved.state.garments.find((garment) => garment.id === id);
  assert.equal(saved.revision, before.revision + 1);
  assert.equal(item.kind, 'shirt');
  assert.equal(item.color, 'blue');
  assert.equal(item.brand, '파타고니아');
  assert.equal(item.label, '내가 확인한 셔츠');
  assert.equal(item.productId, null);
  assert.equal(item.slot, null, 'broad visual category must not invent a specific wardrobe slot');
  await assertPhotoFlowBytes(saved.photos.get(item.photoId), source);
  assert.equal(page.app.draft(), null);
});

test('whole-photo brand-looking print requires text-source confirmation and corrected label text remains a draft', async (t) => {
  const fake = deferredRecognizer();
  const page = await bootPhotoFlow({ factory: fake.factory });
  t.after(() => page.close());
  const before = await photoFlowStored(page);
  page.app.beginDraft();
  const source = await chooseAnalyzedPhoto(page, fake, photoFlowJPEG(32));
  await page.click({ action: 'photo-brand', brand: '파타고니아' });
  assert.equal(page.app.draft().brand, null, 'an unconfirmed print word cannot be applied as a label brand');
  page.input('photo-label-text', 'NIKE');
  assert.equal(page.app.draft().brand, null);
  assert.equal((await photoFlowStored(page)).revision, before.revision);
  await page.click({ action: 'photo-text-match' });
  assert.equal(page.app.draft().photoIdentity.brands[0].brand, '나이키');
  await page.click({ action: 'photo-brand', brand: '나이키' });
  assert.equal(page.app.draft().brand, '나이키');
  assert.equal(page.app.draft().productId, null);
  await assertPhotoFlowBytes(page.app.draft().asset.blob, source);
  assert.equal((await photoFlowStored(page)).revision, before.revision);
});

test('catalog candidate review needs confirmation and keeps the user photo when applying product metadata', async (t) => {
  const fake = deferredRecognizer();
  const page = await bootPhotoFlow({ factory: fake.factory });
  t.after(() => page.close());
  const product = PRODUCTS.find((item) => item.id === 'ms-728000');
  const before = await photoFlowStored(page);
  page.app.beginDraft();
  const source = await chooseAnalyzedPhoto(page, fake, photoFlowJPEG(12), photoFlowResult({ text: product.url }));
  const asset = page.app.draft().asset;
  await page.click({ action: 'photo-text-match' });
  await page.click({ action: 'photo-candidate-review', id: product.id });
  assert.equal(page.app.draft().productId, null);
  assert.equal((await photoFlowStored(page)).revision, before.revision);
  assert.match(page.nodes.get('sheet-root').innerHTML, /확인|적용/);
  await page.click({ action: 'photo-product-color', id: product.id });
  await page.click({ action: 'photo-candidate-confirm', id: product.id });
  const draft = page.app.draft();
  assert.equal(draft.productId, product.id);
  assert.equal(draft.brand, product.brand);
  assert.equal(draft.label, product.name);
  assert.equal(draft.kind, SLOT_BY_ID[product.slot].shape);
  assert.equal(draft.photoId, asset.id);
  await assertPhotoFlowBytes(draft.asset.blob, source);
  await page.app.saveGarmentDraft();
  const saved = await photoFlowStored(page);
  assert.equal(saved.state.garments[0].productId, product.id);
  assert.equal(saved.state.garments[0].photoId, asset.id);
  await assertPhotoFlowBytes(saved.photos.get(asset.id), source);
});

test('partial OCR and model failure keep manual editing and saving available', async (t) => {
  for (const outcome of ['partial', 'failure', 'invalid-api']) {
    const fake = deferredRecognizer();
    const page = await bootPhotoFlow({ factory: outcome === 'invalid-api' ? () => ({}) : fake.factory });
    t.after(() => page.close());
    page.app.beginDraft();
    const source = photoFlowJPEG(13);
    const chosen = page.app.chooseGarmentPhoto(source);
    if (outcome !== 'invalid-api') {
      const job = await waitForPhotoJob(fake, 1);
      if (outcome === 'failure') job.reject(new Error('synthetic model unavailable'));
      else job.resolve(photoFlowResult({ text: '', warnings: ['synthetic OCR unavailable'] }));
    }
    await chosen;
    assert.equal(page.app.draft().recognizing, false);
    assert.equal(page.app.draft().productId, null);
    await assertPhotoFlowBytes(page.app.draft().asset.blob, source);
    await page.click({ action: 'draft-kind', kind: 'jacket' });
    page.input('garment-brand', '직접 확인한 브랜드');
    page.input('garment-label', '직접 확인한 재킷');
    await page.app.saveGarmentDraft();
    const saved = await photoFlowStored(page);
    assert.equal(saved.state.garments[0].kind, 'jacket');
    assert.equal(saved.state.garments[0].brand, '직접 확인한 브랜드');
    assert.equal(saved.state.garments[0].productId, null);
    await assertPhotoFlowBytes(saved.photos.get(saved.state.garments[0].photoId), source);
  }
});

test('late analysis of a replaced photo cannot overwrite the newer photo or its suggestions', async (t) => {
  const fake = deferredRecognizer();
  const page = await bootPhotoFlow({ factory: fake.factory });
  t.after(() => page.close());
  page.app.beginDraft();
  const oldChosen = page.app.chooseGarmentPhoto(photoFlowJPEG(21));
  const old = await waitForPhotoJob(fake, 1);
  const newerPhoto = photoFlowJPEG(22);
  const newChosen = page.app.chooseGarmentPhoto(newerPhoto);
  const newer = await waitForPhotoJob(fake, 2);
  newer.resolve(photoFlowResult({ kinds: [{ kind: 'jacket', label: '재킷', score: 0.77 }], text: 'NIKE' }));
  await newChosen;
  const currentAsset = page.app.draft().asset.id;
  old.resolve(photoFlowResult({ text: 'PATAGONIA' }));
  await oldChosen;
  assert.equal(page.app.draft().asset.id, currentAsset);
  assert.equal(page.app.draft().photoRecognition.kinds[0].kind, 'jacket');
  assert.equal(page.app.draft().photoIdentity.brands[0].brand, '나이키');
  await assertPhotoFlowBytes(page.app.draft().asset.blob, newerPhoto);
  assert.equal((await photoFlowStored(page)).photos.size, 0);
});

test('replacing the photo invalidates a previously reviewed catalog identity before metadata can be applied', async (t) => {
  const fake = deferredRecognizer();
  const page = await bootPhotoFlow({ factory: fake.factory });
  t.after(() => page.close());
  const product = PRODUCTS.find((item) => item.id === 'ms-728000');
  page.app.beginDraft();
  await chooseAnalyzedPhoto(page, fake, photoFlowJPEG(30), photoFlowResult({ text: product.url }));
  await page.click({ action: 'photo-text-match' });
  await page.click({ action: 'photo-candidate-review', id: product.id });
  const newerPhoto = photoFlowJPEG(31);
  await chooseAnalyzedPhoto(page, fake, newerPhoto, photoFlowResult({ text: 'NIKE' }));
  await page.click({ action: 'photo-candidate-confirm', id: product.id });
  assert.equal(page.app.draft().productId, null);
  assert.equal(page.app.draft().brand, null);
  assert.equal(page.app.draft().photoIdentity.brands[0].brand, '나이키');
  await assertPhotoFlowBytes(page.app.draft().asset.blob, newerPhoto);
  assert.equal((await photoFlowStored(page)).photos.size, 0);
});

test('late results after closing or removing the photo cannot restore a discarded analysis', async (t) => {
  for (const action of ['close-sheet', 'clear-photo']) {
    const fake = deferredRecognizer();
    const page = await bootPhotoFlow({ factory: fake.factory });
    t.after(() => page.close());
    page.app.beginDraft();
    const chosen = page.app.chooseGarmentPhoto(photoFlowJPEG(23));
    const old = await waitForPhotoJob(fake, 1);
    await page.click({ action });
    old.resolve(photoFlowResult());
    await chosen;
    if (action === 'close-sheet') assert.equal(page.app.draft(), null);
    else {
      assert.equal(page.app.draft().photoId, null);
      assert.equal(page.app.draft().asset, null);
      assert.equal(page.app.draft().photoRecognition, null);
      assert.equal(page.app.draft().photoIdentity, null);
    }
    assert.equal((await photoFlowStored(page)).photos.size, 0);
  }
});

test('canceling and retrying analysis preserves the selected photo and makes no durable write', async (t) => {
  const fake = deferredRecognizer();
  const page = await bootPhotoFlow({ factory: fake.factory });
  t.after(() => page.close());
  const before = await photoFlowStored(page);
  page.app.beginDraft();
  const source = photoFlowJPEG(24);
  const chosen = page.app.chooseGarmentPhoto(source);
  const old = await waitForPhotoJob(fake, 1);
  const assetId = page.app.draft().asset.id;
  await page.click({ action: 'photo-cancel' });
  assert.ok(fake.cancels + fake.disposals > 0, 'cancel must stop local worker resources');
  assert.equal(page.app.draft().recognizing, false);
  assert.equal(page.app.draft().asset.id, assetId);
  old.resolve(photoFlowResult());
  await chosen;
  assert.equal(page.app.draft().photoRecognition, null);
  const retry = page.click({ action: 'photo-retry' });
  const newer = await waitForPhotoJob(fake, 2);
  newer.resolve(photoFlowResult());
  await retry;
  assert.equal(page.app.draft().asset.id, assetId);
  assert.equal(page.app.draft().photoRecognition.kinds[0].kind, 'shirt');
  await assertPhotoFlowBytes(page.app.draft().asset.blob, source);
  assert.equal((await photoFlowStored(page)).revision, before.revision);
  assert.equal((await photoFlowStored(page)).photos.size, 0);
});

test('a separate label-photo OCR analysis identifies text without replacing or storing the garment image', async (t) => {
  const fake = deferredRecognizer();
  const page = await bootPhotoFlow({ factory: fake.factory });
  t.after(() => page.close());
  page.app.beginDraft();
  const garment = await chooseAnalyzedPhoto(page, fake, photoFlowJPEG(25), photoFlowResult({ text: '' }));
  const garmentAssetId = page.app.draft().asset.id;
  const label = photoFlowJPEG(26);
  const analyzed = page.app.analyzeDraftPhoto({ mode: 'label', file: label });
  const job = await waitForPhotoJob(fake, 2);
  assert.equal(job.options.mode, 'label');
  await assertPhotoFlowBytes(job.blob, label);
  job.resolve(photoFlowResult({ kinds: [], colors: [], text: 'PATAGONIA', model: null, revision: null }));
  await analyzed;
  assert.equal(page.app.draft().asset.id, garmentAssetId);
  assert.equal(page.app.draft().photoId, garmentAssetId);
  await assertPhotoFlowBytes(page.app.draft().asset.blob, garment);
  assert.equal(page.app.draft().photoIdentity.brands[0].brand, '파타고니아');
  await page.click({ action: 'draft-kind', kind: 'shirt' });
  await page.app.saveGarmentDraft();
  const saved = await photoFlowStored(page);
  assert.equal(saved.photos.size, 1);
  await assertPhotoFlowBytes(saved.photos.get(garmentAssetId), garment);
});

test('quota failure preserves recognized choices and the unsaved photo for a successful retry', async (t) => {
  const fake = deferredRecognizer();
  const page = await bootPhotoFlow({ factory: fake.factory });
  t.after(() => page.close());
  const before = await photoFlowStored(page);
  page.app.beginDraft();
  const source = await chooseAnalyzedPhoto(page, fake, photoFlowJPEG(27));
  await page.click({ action: 'photo-kind', kind: 'shirt' });
  await page.click({ action: 'photo-text-match' });
  await page.click({ action: 'photo-brand', brand: '파타고니아' });
  const assetId = page.app.draft().asset.id;
  await withPhotoFlowQuota(() => page.app.saveGarmentDraft());
  assert.match(page.app.draft().error, /부족|저장|quota/i);
  assert.equal(page.app.draft().kind, 'shirt');
  assert.equal(page.app.draft().brand, '파타고니아');
  assert.equal(page.app.draft().asset.id, assetId);
  assert.equal(page.app.draft().photoIdentity.brands[0].brand, '파타고니아');
  await assertPhotoFlowBytes(page.app.draft().asset.blob, source);
  const failed = await photoFlowStored(page);
  assert.equal(failed.revision, before.revision);
  assert.equal(failed.photos.size, 0);
  await page.app.saveGarmentDraft();
  const saved = await photoFlowStored(page);
  assert.equal(saved.revision, before.revision + 1);
  await assertPhotoFlowBytes(saved.photos.get(assetId), source);
});

test('a changed durable revision rejects the stale save while preserving recognition, source photo and newer wardrobe', async (t) => {
  const fake = deferredRecognizer();
  const page = await bootPhotoFlow({ factory: fake.factory });
  t.after(() => page.close());
  page.app.beginDraft();
  const source = await chooseAnalyzedPhoto(page, fake, photoFlowJPEG(28));
  await page.click({ action: 'photo-kind', kind: 'shirt' });
  await page.click({ action: 'photo-text-match' });
  await page.click({ action: 'photo-brand', brand: '파타고니아' });
  const assetId = page.app.draft().asset.id;
  const newerStore = createWardrobeStore({ indexedDB: page.indexedDB });
  const live = await newerStore.load();
  const newerGarment = makeGarment({ id: 'g_newer-photo-flow', kind: 'jacket', gender: 'M', label: '다른 화면의 새 옷' });
  await newerStore.commit({ ...live.state, demo: false, demoSelected: [], garments: [newerGarment] }, live.revision, [], live.epoch);
  newerStore.close();
  await page.app.saveGarmentDraft();
  assert.match(page.app.draft().error, /다른|충돌|최신|바뀌/);
  assert.equal(page.app.draft().asset.id, assetId);
  assert.equal(page.app.draft().photoIdentity.brands[0].brand, '파타고니아');
  await assertPhotoFlowBytes(page.app.draft().asset.blob, source);
  const saved = await photoFlowStored(page);
  assert.equal(saved.revision, live.revision + 1);
  assert.deepEqual(saved.state.garments, [newerGarment]);
  assert.equal(saved.photos.size, 0);
});

test('full erase cancels the pending draft and late analysis cannot repopulate erased state', async (t) => {
  const fake = deferredRecognizer();
  const page = await bootPhotoFlow({ factory: fake.factory });
  t.after(() => page.close());
  page.app.beginDraft();
  const chosen = page.app.chooseGarmentPhoto(photoFlowJPEG(29));
  const job = await waitForPhotoJob(fake, 1);
  const stopsBeforeErase = fake.cancels + fake.disposals;
  await page.click({ action: 'erase-review' });
  await page.click({ action: 'erase-confirm' });
  await page.click({ action: 'erase-execute' });
  assert.ok(fake.cancels + fake.disposals > stopsBeforeErase, 'full erase must stop the pending analysis resources');
  job.resolve(photoFlowResult());
  await chosen;
  assert.equal(page.app.draft(), null);
  const saved = await photoFlowStored(page);
  assert.deepEqual(saved.state.garments, []);
  assert.equal(saved.photos.size, 0);
  assert.doesNotMatch(page.nodes.get('sheet-root').innerHTML, /PATAGONIA|파타고니아/);
});

test('saving freezes editor callbacks and cancels late inference before the acknowledged snapshot closes', async (t) => {
  const fake = deferredRecognizer();
  const page = await bootPhotoFlow({ factory: fake.factory });
  t.after(() => page.close());
  page.app.beginDraft();
  const source = await chooseAnalyzedPhoto(page, fake, photoFlowJPEG(33));
  await page.click({ action: 'photo-kind', kind: 'shirt' });
  await page.click({ action: 'photo-color', color: 'blue' });
  await page.click({ action: 'photo-text-match' });
  await page.click({ action: 'photo-brand', brand: '파타고니아' });
  page.input('garment-label', '저장 직전 확인한 셔츠');
  const id = page.app.draft().id;
  const assetId = page.app.draft().asset.id;
  const retry = page.app.analyzeDraftPhoto();
  const lateJob = await waitForPhotoJob(fake, 2);
  const stopsBeforeSave = fake.cancels + fake.disposals;
  let releaseCommit;
  const commitGate = new Promise((resolve) => { releaseCommit = resolve; });
  const commit = page.app.store.commit.bind(page.app.store);
  page.app.store.commit = async (...args) => { await commitGate; return commit(...args); };
  const saving = page.app.saveGarmentDraft();
  assert.equal(page.app.draft().saving, true);
  assert.match(page.nodes.get('sheet-root').innerHTML, /<fieldset disabled>/);
  assert.ok(fake.cancels + fake.disposals > stopsBeforeSave);
  page.input('garment-label', '저장 중 바뀌면 안 되는 이름');
  page.input('garment-brand', '저장 중 바뀌면 안 되는 브랜드');
  page.input('photo-label-text', 'NIKE');
  await page.click({ action: 'draft-kind', kind: 'jacket' });
  await page.click({ action: 'draft-color', color: 'black' });
  await page.click({ action: 'clear-photo' });
  await page.app.chooseGarmentPhoto(photoFlowJPEG(34));
  page.app.beginDraft();
  lateJob.resolve(photoFlowResult({ text: 'NIKE' }));
  await retry;
  assert.equal(page.app.draft().id, id);
  assert.equal(page.app.draft().kind, 'shirt');
  assert.equal(page.app.draft().color, 'blue');
  assert.equal(page.app.draft().brand, '파타고니아');
  assert.equal(page.app.draft().label, '저장 직전 확인한 셔츠');
  assert.equal(page.app.draft().labelText, 'PATAGONIA');
  assert.equal(page.app.draft().asset.id, assetId);
  releaseCommit();
  await saving;
  const saved = await photoFlowStored(page);
  const item = saved.state.garments.find((garment) => garment.id === id);
  assert.equal(item.kind, 'shirt');
  assert.equal(item.color, 'blue');
  assert.equal(item.brand, '파타고니아');
  assert.equal(item.label, '저장 직전 확인한 셔츠');
  await assertPhotoFlowBytes(saved.photos.get(assetId), source);
  assert.equal(page.app.draft(), null);
});

test('changing a confirmed subtype invalidates an earlier product review instead of overwriting that choice', async (t) => {
  const fake = deferredRecognizer();
  const page = await bootPhotoFlow({ factory: fake.factory });
  t.after(() => page.close());
  const product = PRODUCTS.find((item) => item.id === 'ms-728000');
  page.app.beginDraft();
  await chooseAnalyzedPhoto(page, fake, photoFlowJPEG(35), photoFlowResult({ text: product.url }));
  await page.click({ action: 'photo-kind', kind: 'shirt' });
  await page.click({ action: 'photo-text-match' });
  await page.click({ action: 'photo-candidate-review', id: product.id });
  assert.match(page.nodes.get('sheet-root').innerHTML, /세부 종류/);
  assert.ok(page.app.draft().photoReview);
  await page.click({ action: 'draft-slot', slot: 'm-flannel' });
  assert.equal(page.app.draft().slot, 'm-flannel');
  assert.equal(page.app.draft().photoReview, null);
  await page.click({ action: 'photo-candidate-confirm', id: product.id });
  assert.equal(page.app.draft().slot, 'm-flannel');
  assert.equal(page.app.draft().productId, null);
  assert.equal(page.app.draft().brand, null);
  assert.equal((await photoFlowStored(page)).photos.size, 0);
});

test('a late OCR result cannot replace manually corrected and source-confirmed label text or its brand', async (t) => {
  const fake = deferredRecognizer();
  const page = await bootPhotoFlow({ factory: fake.factory });
  t.after(() => page.close());
  const before = await photoFlowStored(page);
  page.app.beginDraft();
  const chosen = page.app.chooseGarmentPhoto(photoFlowJPEG(36));
  const old = await waitForPhotoJob(fake, 1);
  page.input('photo-label-text', 'NIKE');
  await page.click({ action: 'photo-text-match' });
  await page.click({ action: 'photo-brand', brand: '나이키' });
  assert.equal(page.app.draft().brand, '나이키');
  old.resolve(photoFlowResult({ text: 'PATAGONIA' }));
  await chosen;
  assert.equal(page.app.draft().labelText, 'NIKE');
  assert.equal(page.app.draft().identitySource, 'text');
  assert.equal(page.app.draft().photoIdentity.brands[0].brand, '나이키');
  assert.equal(page.app.draft().brand, '나이키');
  assert.equal(page.app.draft().kind, null);
  assert.equal(page.app.draft().productId, null);
  assert.equal((await photoFlowStored(page)).revision, before.revision);
});

test('an unknown label brand can be selected from an observed OCR line without inventing a catalog identity or replacing the photo', async (t) => {
  const fake = deferredRecognizer();
  const page = await bootPhotoFlow({ factory: fake.factory });
  t.after(() => page.close());
  const before = await photoFlowStored(page);
  page.app.beginDraft();
  const source = await chooseAnalyzedPhoto(page, fake, photoFlowJPEG(37), photoFlowResult({ text: '' }));
  const assetId = page.app.draft().asset.id;
  const labelAnalysis = page.app.analyzeDraftPhoto({ mode: 'label', file: photoFlowJPEG(38) });
  const labelJob = await waitForPhotoJob(fake, 2);
  labelJob.resolve(photoFlowResult({ kinds: [], colors: [], text: 'BARACUTA\nMADE IN ENGLAND\n100% COTTON', model: null, revision: null }));
  await labelAnalysis;
  assert.equal(page.app.draft().identitySource, 'label');
  assert.deepEqual(photoFlowPlain(page.app.draft().photoIdentity.brands), []);
  assert.match(page.nodes.get('sheet-root').innerHTML, /id="photo-brand-line"/);
  await page.change('photo-brand-line', '텍스트에 없는 브랜드');
  assert.equal(page.app.draft().brand, null, 'unobserved option values cannot manufacture a brand');
  await page.change('photo-brand-line', 'BARACUTA');
  assert.equal(page.app.draft().brand, 'BARACUTA');
  assert.equal(page.app.draft().productId, null);
  assert.equal(page.app.draft().photoId, assetId);
  await assertPhotoFlowBytes(page.app.draft().asset.blob, source);
  assert.equal((await photoFlowStored(page)).revision, before.revision);
  await page.click({ action: 'draft-kind', kind: 'jacket' });
  await page.app.saveGarmentDraft();
  const saved = await photoFlowStored(page);
  assert.equal(saved.state.garments[0].brand, 'BARACUTA');
  assert.equal(saved.state.garments[0].productId, null);
  assert.equal(saved.photos.size, 1);
  await assertPhotoFlowBytes(saved.photos.get(assetId), source);
});

test('the first photo is prepared without starting the optional model or making a durable write', async (t) => {
  const fake = deferredRecognizer();
  let factoryCalls = 0;
  const page = await bootPhotoFlow({ factory: () => { factoryCalls++; return fake.recognizer; }, allowAnalysis: false });
  t.after(() => page.close());
  const before = await photoFlowStored(page);
  page.app.beginDraft();
  const source = photoFlowJPEG(39);
  await page.app.chooseGarmentPhoto(source);
  assert.equal(factoryCalls, 0, 'selecting a picture alone must not initialize the large optional model');
  assert.equal(fake.jobs.length, 0);
  assert.equal(page.app.draft().recognizing, false);
  assert.equal(page.app.draft().photoRecognition, null);
  assert.equal(page.app.draft().photoIdentity, null);
  assert.match(page.nodes.get('sheet-root').innerHTML, /data-action="photo-start"/);
  await assertPhotoFlowBytes(page.app.draft().asset.blob, source);
  const waiting = await photoFlowStored(page);
  assert.equal(waiting.revision, before.revision);
  assert.equal(waiting.photos.size, 0);
});

test('an explicit analysis choice starts one job and enables analysis of subsequent photos only in that session', async (t) => {
  const fake = deferredRecognizer();
  let factoryCalls = 0;
  const factory = () => { factoryCalls++; return fake.recognizer; };
  const page = await bootPhotoFlow({ factory, allowAnalysis: false });
  t.after(() => page.close());
  page.app.beginDraft();
  await page.app.chooseGarmentPhoto(photoFlowJPEG(40));
  assert.equal(factoryCalls, 0);
  const explicitlyStarted = page.click({ action: 'photo-start' });
  const first = await waitForPhotoJob(fake, 1);
  assert.equal(factoryCalls, 1);
  first.resolve(photoFlowResult());
  await explicitlyStarted;
  assert.equal(page.app.draft().photoRecognition.kinds[0].kind, 'shirt');
  const secondPhoto = photoFlowJPEG(41);
  await chooseAnalyzedPhoto(page, fake, secondPhoto, photoFlowResult({ text: 'NIKE' }));
  assert.equal(factoryCalls, 1, 'a completed recognizer should be reused for the next photo in the same draft');
  assert.equal(fake.jobs.length, 2);
  await assertPhotoFlowBytes(page.app.draft().asset.blob, secondPhoto);
  page.app.closeSheet();
  const newSession = await bootPhotoFlow({ indexedDB: page.indexedDB, factory, allowAnalysis: false });
  t.after(() => newSession.close());
  newSession.app.beginDraft();
  await newSession.app.chooseGarmentPhoto(photoFlowJPEG(42));
  assert.equal(factoryCalls, 1, 'an opt-in in another page session must not silently start a new model job');
  assert.equal(fake.jobs.length, 2);
  assert.equal(newSession.app.draft().photoRecognition, null);
});

test('declining optional analysis still permits manual garment entry and atomic photo saving', async (t) => {
  const fake = deferredRecognizer();
  let factoryCalls = 0;
  const page = await bootPhotoFlow({ factory: () => { factoryCalls++; return fake.recognizer; }, allowAnalysis: false });
  t.after(() => page.close());
  const before = await photoFlowStored(page);
  page.app.beginDraft();
  const source = photoFlowJPEG(43);
  await page.app.chooseGarmentPhoto(source);
  await page.click({ action: 'draft-kind', kind: 'jacket' });
  await page.click({ action: 'draft-color', color: 'beige' });
  page.input('garment-brand', '직접 라벨을 확인한 브랜드');
  page.input('garment-label', '분석 없이 등록한 재킷');
  await page.app.saveGarmentDraft();
  const saved = await photoFlowStored(page);
  assert.equal(factoryCalls, 0);
  assert.equal(fake.jobs.length, 0);
  assert.equal(saved.revision, before.revision + 1);
  assert.equal(saved.state.garments[0].kind, 'jacket');
  assert.equal(saved.state.garments[0].color, 'beige');
  assert.equal(saved.state.garments[0].brand, '직접 라벨을 확인한 브랜드');
  assert.equal(saved.state.garments[0].productId, null);
  assert.equal(saved.photos.size, 1);
  await assertPhotoFlowBytes(saved.photos.get(saved.state.garments[0].photoId), source);
});

test('brand-and-kind reference products cannot become an owned product ID even through a forged confirmation action', async (t) => {
  const fake = deferredRecognizer();
  const page = await bootPhotoFlow({ factory: fake.factory });
  t.after(() => page.close());
  page.app.beginDraft();
  const source = await chooseAnalyzedPhoto(page, fake, photoFlowJPEG(44), photoFlowResult({
    kinds: [{ kind: 'jacket', label: '재킷', score: 0.82 }], text: 'PATAGONIA',
  }));
  await page.click({ action: 'photo-kind', kind: 'jacket' });
  await page.click({ action: 'photo-text-match' });
  await page.click({ action: 'photo-brand', brand: '파타고니아' });
  const candidate = page.app.draft().photoIdentity.candidates[0];
  assert.ok(candidate, 'the observed brand and confirmed kind should yield reference products');
  assert.equal(candidate.exact, false);
  assert.equal(candidate.match, 'brand-and-kind');
  await page.click({ action: 'photo-candidate-review', id: candidate.productId });
  assert.match(page.nodes.get('sheet-root').innerHTML, /같은 브랜드의 참고 상품/);
  assert.doesNotMatch(page.nodes.get('sheet-root').innerHTML, /data-action="photo-candidate-confirm"/);
  await page.click({ action: 'photo-product-color', id: candidate.productId });
  await page.click({ action: 'photo-candidate-confirm', id: candidate.productId });
  assert.equal(page.app.draft().productId, null);
  assert.equal(page.app.draft().slot, null);
  assert.equal(page.app.draft().kind, 'jacket');
  assert.equal(page.app.draft().brand, '파타고니아');
  await page.app.saveGarmentDraft();
  const saved = await photoFlowStored(page);
  assert.equal(saved.state.garments[0].productId, null);
  assert.equal(saved.state.garments[0].slot, null);
  await assertPhotoFlowBytes(saved.photos.get(saved.state.garments[0].photoId), source);
});

test('a strong product URL requires an independent unknown-color confirmation before applying exact catalog metadata', async (t) => {
  const fake = deferredRecognizer();
  const page = await bootPhotoFlow({ factory: fake.factory });
  t.after(() => page.close());
  const product = PRODUCTS.find((item) => item.id === 'ms-728000');
  page.app.beginDraft();
  const source = await chooseAnalyzedPhoto(page, fake, photoFlowJPEG(45), photoFlowResult({ text: product.url }));
  await page.click({ action: 'photo-text-match' });
  await page.click({ action: 'photo-candidate-review', id: product.id });
  assert.equal(page.app.draft().photoIdentity.candidates[0].exact, true);
  assert.equal(page.app.draft().color, null);
  assert.equal(page.app.draft().productId, null);
  assert.match(page.nodes.get('sheet-root').innerHTML, /data-action="photo-product-color"/);
  const confirmTag = page.nodes.get('sheet-root').innerHTML.match(/<button[^>]*data-action="photo-candidate-confirm"[^>]*>/)?.[0];
  assert.ok(confirmTag?.includes('disabled'));
  await page.click({ action: 'photo-candidate-confirm', id: product.id });
  assert.equal(page.app.draft().productId, null, 'confirming the product alone cannot fill its unverified color');
  await page.click({ action: 'photo-product-color', id: 'ms-854339' });
  assert.equal(page.app.draft().photoReview.colorConfirmed, false);
  await page.click({ action: 'photo-product-color', id: product.id });
  assert.equal(page.app.draft().photoReview.colorConfirmed, true);
  assert.equal(page.app.draft().color, null, 'the separate choice remains pending until the product metadata is applied');
  await page.click({ action: 'photo-candidate-confirm', id: product.id });
  assert.equal(page.app.draft().productId, product.id);
  assert.equal(page.app.draft().color, product.color);
  assert.equal(page.app.draft().brand, product.brand);
  await assertPhotoFlowBytes(page.app.draft().asset.blob, source);
  assert.equal((await photoFlowStored(page)).photos.size, 0);
});

test('retrying completed analysis reuses one recognizer and closing the draft disposes it', async (t) => {
  const fake = deferredRecognizer();
  let factoryCalls = 0;
  const page = await bootPhotoFlow({ factory: () => { factoryCalls++; return fake.recognizer; } });
  t.after(() => page.close());
  page.app.beginDraft();
  await chooseAnalyzedPhoto(page, fake, photoFlowJPEG(46));
  assert.equal(factoryCalls, 1);
  assert.equal(fake.disposals, 0);
  const retried = page.click({ action: 'photo-retry' });
  const job = await waitForPhotoJob(fake, 2);
  assert.equal(factoryCalls, 1);
  assert.equal(fake.disposals, 0);
  job.resolve(photoFlowResult({ text: 'NIKE' }));
  await retried;
  assert.equal(page.app.draft().photoIdentity.brands[0].brand, '나이키');
  assert.equal(factoryCalls, 1);
  await page.click({ action: 'close-sheet' });
  assert.equal(page.app.draft(), null);
  assert.equal(fake.disposals, 1);
});

test('data saving mode requires an explicit analysis choice for each new photo despite session opt-in', async (t) => {
  const fake = deferredRecognizer();
  let factoryCalls = 0;
  const page = await bootPhotoFlow({
    factory: () => { factoryCalls++; return fake.recognizer; },
    allowAnalysis: true, navigator: { connection: { saveData: true } },
  });
  t.after(() => page.close());
  page.app.beginDraft();
  await page.app.chooseGarmentPhoto(photoFlowJPEG(47));
  assert.equal(factoryCalls, 0);
  assert.equal(fake.jobs.length, 0);
  assert.match(page.nodes.get('sheet-root').innerHTML, /data-action="photo-start"/);
  const explicit = page.click({ action: 'photo-start' });
  const job = await waitForPhotoJob(fake, 1);
  job.resolve(photoFlowResult());
  await explicit;
  assert.equal(factoryCalls, 1);
  assert.equal(fake.jobs.length, 1);
  await page.app.chooseGarmentPhoto(photoFlowJPEG(48));
  assert.equal(factoryCalls, 1);
  assert.equal(fake.jobs.length, 1);
  assert.equal(page.app.draft().photoRecognition, null);
  assert.match(page.nodes.get('sheet-root').innerHTML, /data-action="photo-start"/);
  assert.equal((await photoFlowStored(page)).photos.size, 0);
});
