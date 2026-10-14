import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { makeGarment, newWardrobeState } from '../src/wardrobe.js';
import { createWardrobeStore, photoAsset } from '../src/wardrobe-store.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'eoul-wardrobe-first-'));
after(() => fs.rmSync(temp, { recursive: true, force: true }));
const output = path.join(temp, 'index.html');
execFileSync(process.execPath, [path.join(root, 'tools/build.mjs'), '--out', output]);
const html = fs.readFileSync(output, 'utf8');
const script = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1].replace(
  /\n\}\)\(\);\s*$/,
  '\nglobalThis.testApp = { state: () => state, ready: appReady, store: wardrobeStore, draft: () => draft, beginDraft, chooseGarmentPhoto, analyzeDraftPhoto, saveGarmentDraft, closeSheet, renderCloset, setPhotoRecognizerFactory: (factory) => { photoRecognizerFactory = factory; }, setPhotoAnalysisAllowed: (allowed) => { photoAnalysisAllowed = allowed; } };\n})();',
);

// Exercise the real bundled registration callbacks and IndexedDB commits.
// Synthetic decoding/inference and a minimal DOM prove state/data contracts;
// they do not prove mobile rendering, camera access or recognition accuracy.
async function boot({ indexedDB = new IDBFactory(), factory, allowAnalysis = false } = {}) {
  const urls = new Map();
  let nextURL = 0;
  class TestURL extends URL {
    static createObjectURL(blob) { const id = `blob:wardrobe-first/${++nextURL}`; urls.set(id, blob); return id; }
    static revokeObjectURL(id) { urls.delete(id); }
  }
  class TestImage {
    naturalWidth = 768;
    naturalHeight = 1024;
    decode() { return Promise.resolve(); }
  }
  const nodes = new Map(['app', 'sheet-root', 'toast'].map((id) => [id, {
    innerHTML: '', classList: { add() {}, remove() {} },
    querySelector() { return null; }, querySelectorAll() { return []; },
  }]));
  for (const id of ['photo-input', 'camera-photo-input']) nodes.set(id, {
    clicks: 0, click() { this.clicks++; },
  });
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
      querySelector: () => null, querySelectorAll: () => [],
      body: { style: {}, append() {} },
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
  if (factory) context.testApp.setPhotoRecognizerFactory(factory);
  context.testApp.setPhotoAnalysisAllowed(allowAnalysis);
  return {
    app: context.testApp, nodes, indexedDB, urls,
    state: () => plain(context.testApp.state()),
    sheet: () => nodes.get('sheet-root').innerHTML,
    async click(dataset) {
      for (const fn of listeners.get('click') || []) await fn({ target: { closest: () => ({ dataset }) }, preventDefault() {}, stopPropagation() {} });
    },
    input(id, value) { for (const fn of listeners.get('input') || []) fn({ target: { id, value, dataset: {} } }); },
    async change(id, properties = {}) {
      for (const fn of listeners.get('change') || []) await fn({ target: { id, value: '', dataset: {}, ...properties } });
    },
    close() { context.testApp.store.close(); },
  };
}

function plain(value) { return JSON.parse(JSON.stringify(value)); }
const jpeg = (value = 7) => new Blob([new Uint8Array([255, 216, 255, value])], { type: 'image/jpeg' });
async function stored(page) { const row = await page.app.store.read(); return { revision: row.revision, state: plain(row.state), photos: row.photos }; }
async function sameBytes(saved, source) {
  assert.ok(saved, 'the selected garment photograph must be retained');
  assert.deepEqual(new Uint8Array(await saved.arrayBuffer()), new Uint8Array(await source.arrayBuffer()));
}
function openingDetailsFor(markup, summary) {
  for (const match of markup.matchAll(/(<details\b[^>]*>)\s*<summary[^>]*>([\s\S]*?)<\/summary>/g)) {
    if (match[2].includes(summary)) return match[1];
  }
  return null;
}
function analysisDouble() {
  const jobs = [];
  const recognizer = { analyze(blob, options) { return new Promise((resolve, reject) => jobs.push({ blob, options, resolve, reject })); }, cancel() {}, dispose() {} };
  return { jobs, factory: () => recognizer };
}
async function awaitJob(fake) {
  const deadline = Date.now() + 2000;
  while (!fake.jobs.length && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 2));
  assert.equal(fake.jobs.length, 1);
  return fake.jobs[0];
}
async function personalPage({ brand = null, color = 'blue' } = {}) {
  const indexedDB = new IDBFactory();
  const store = createWardrobeStore({ indexedDB });
  const first = await store.load();
  const asset = await photoAsset(jpeg(41));
  const owned = makeGarment({ id: 'wardrobe-first-existing', kind: 'shirt', slot: 'm-oxford', gender: 'M',
    color, brand, label: '실제 기존 셔츠', photoId: asset.id, createdAt: '2026-10-10T00:00:00.000Z' });
  await store.commit({ ...newWardrobeState(), demo: false, demoSelected: [], garments: [owned] }, first.revision, [asset], first.epoch);
  store.close();
  return { page: await boot({ indexedDB }), owned, asset };
}

test('a new garment starts with album, camera and manual entry choices instead of the full metadata form', async (t) => {
  const page = await boot();
  t.after(() => page.close());
  const before = await stored(page);
  await page.click({ action: 'add-start' });
  assert.equal(page.app.draft().entryMode, 'choice');
  assert.match(page.sheet(), /data-action="add-photo"/);
  assert.match(page.sheet(), /data-action="add-camera"/);
  assert.match(page.sheet(), /data-action="draft-manual"/);
  assert.doesNotMatch(page.sheet(), /data-action="draft-kind"|id="garment-brand"|id="garment-label"/);
  assert.doesNotMatch(page.sheet(), /이메일에서 가져오기|온라인 스토어에서 자동|계정 연결 완료/);
  assert.equal((await stored(page)).revision, before.revision);
});

test('album and camera open their configured inputs and camera selection uses the same guarded photo path', async (t) => {
  const page = await boot();
  t.after(() => page.close());
  page.app.beginDraft();
  await page.click({ action: 'add-photo' });
  assert.equal(page.nodes.get('photo-input').clicks, 1);
  await page.click({ action: 'add-camera' });
  assert.equal(page.nodes.get('camera-photo-input').clicks, 1);
  const cameraTag = html.match(/<input\b[^>]*id="camera-photo-input"[^>]*>/)?.[0];
  assert.ok(cameraTag, 'the camera control must have a real file input');
  assert.match(cameraTag, /capture="environment"/);
  assert.match(cameraTag, /accept="image\/jpeg,image\/png,image\/webp"/);
  const source = jpeg(52);
  await page.change('camera-photo-input', { files: [source] });
  assert.equal(page.app.draft().entryMode, 'photo');
  await sameBytes(page.app.draft().asset.blob, source);
  assert.equal((await stored(page)).photos.size, 0, 'choosing a camera photo must not create ownership before confirmation');
});

test('manual entry can choose a kind, add a photograph and save both atomically without analysis', async (t) => {
  let modelStarts = 0;
  const page = await boot({ factory: () => { modelStarts++; throw new Error('manual entry must not need a model'); } });
  t.after(() => page.close());
  page.app.beginDraft();
  await page.click({ action: 'draft-manual' });
  assert.equal(page.app.draft().entryMode, 'manual');
  assert.match(page.sheet(), /data-action="draft-kind"/);
  await page.click({ action: 'draft-kind', kind: 'shirt' });
  page.input('garment-label', '내 여름 셔츠');
  page.input('garment-brand', '직접 확인한 브랜드');
  const source = jpeg(53);
  await page.app.chooseGarmentPhoto(source);
  assert.equal(page.app.draft().kind, 'shirt');
  assert.equal(modelStarts, 0);
  const id = page.app.draft().id;
  const before = await stored(page);
  await page.app.saveGarmentDraft();
  const saved = await stored(page);
  assert.equal(saved.revision, before.revision + 1);
  const item = saved.state.garments.find((entry) => entry.id === id);
  assert.equal(item.kind, 'shirt');
  assert.equal(item.brand, '직접 확인한 브랜드');
  assert.equal(item.label, '내 여름 셔츠');
  await sameBytes(saved.photos.get(item.photoId), source);
  assert.equal(saved.state.demo, false);
  assert.equal(page.app.draft(), null);
});

test('a photograph alone cannot save a garment and optional name, brand and color controls stay collapsed', async (t) => {
  const page = await boot();
  t.after(() => page.close());
  page.app.beginDraft();
  await page.app.chooseGarmentPhoto(jpeg(54));
  assert.equal(page.app.draft().kind, null);
  assert.match(page.sheet(), /class="photo-preview"/);
  const details = openingDetailsFor(page.sheet(), '색·브랜드·이름');
  assert.ok(details, 'optional metadata remains available for correction');
  assert.doesNotMatch(details, /\bopen(?:\s|=|>)/);
  const before = await stored(page);
  await page.app.saveGarmentDraft();
  const afterSave = await stored(page);
  assert.equal(afterSave.revision, before.revision);
  assert.equal(afterSave.photos.size, 0);
  assert.ok(page.app.draft()?.asset, 'the photograph remains a draft after the guarded save');
});

test('photo suggestions appear once, with the manual kind grid collapsed and identity still unconfirmed', async (t) => {
  const fake = analysisDouble();
  const page = await boot({ factory: fake.factory, allowAnalysis: true });
  t.after(() => page.close());
  page.app.beginDraft();
  const chosen = page.app.chooseGarmentPhoto(jpeg(55));
  const job = await awaitJob(fake);
  job.resolve({ kinds: [{ kind: 'shirt', label: '셔츠', score: 0.8 }], colors: [{ color: 'blue', label: '라이트 블루', score: 0.7 }],
    text: 'PATAGONIA', requiresCrop: false, warnings: [], requiresConfirmation: true });
  await chosen;
  assert.equal((page.sheet().match(/data-action="photo-kind"/g) || []).length, 1);
  const manualDetails = openingDetailsFor(page.sheet(), '다른 종류');
  assert.ok(manualDetails, 'manual fallback must remain available after a visual suggestion');
  assert.doesNotMatch(manualDetails, /\bopen(?:\s|=|>)/);
  const draft = page.app.draft();
  assert.equal(draft.kind, null);
  assert.equal(draft.color, null);
  assert.equal(draft.brand, null);
  assert.equal(draft.productId, null);
  await page.click({ action: 'photo-kind', kind: 'shirt' });
  assert.equal(page.app.draft().kind, 'shirt');
  assert.equal(page.app.draft().brand, null);
  assert.equal(page.app.draft().productId, null);
});

test('replacing a draft photograph preserves confirmed metadata and stores the latest chosen photograph', async (t) => {
  const page = await boot();
  t.after(() => page.close());
  page.app.beginDraft();
  await page.click({ action: 'draft-manual' });
  await page.click({ action: 'draft-kind', kind: 'jacket' });
  await page.click({ action: 'draft-color', color: 'navy' });
  page.input('garment-brand', '내가 확인한 브랜드');
  page.input('garment-label', '직접 부르는 재킷');
  await page.app.chooseGarmentPhoto(jpeg(56));
  const second = jpeg(57);
  await page.app.chooseGarmentPhoto(second);
  const draft = page.app.draft();
  assert.equal(draft.kind, 'jacket');
  assert.equal(draft.color, 'navy');
  assert.equal(draft.brand, '내가 확인한 브랜드');
  assert.equal(draft.label, '직접 부르는 재킷');
  await page.app.saveGarmentDraft();
  const saved = await stored(page);
  const item = saved.state.garments[0];
  await sameBytes(saved.photos.get(item.photoId), second);
  assert.equal(saved.photos.size, 1, 'only the final draft photograph belongs in the new wardrobe record');
  assert.equal(item.brand, '내가 확인한 브랜드');
});

test('editing an existing item and adding from a specific slot keep their existing identity contracts', async (t) => {
  const { page, owned, asset } = await personalPage({ brand: '내 브랜드' });
  t.after(() => page.close());
  page.app.beginDraft(owned);
  assert.equal(page.app.draft().entryMode, 'edit');
  assert.equal(page.app.draft().kind, owned.kind);
  assert.equal(page.app.draft().slot, owned.slot);
  assert.equal(page.app.draft().photoId, owned.photoId);
  assert.match(page.sheet(), /id="garment-label"/);
  page.input('garment-label', '확인한 기존 셔츠');
  await page.app.saveGarmentDraft();
  let saved = await stored(page);
  assert.equal(saved.state.garments.length, 1);
  assert.equal(saved.state.garments[0].createdAt, owned.createdAt);
  assert.equal(saved.state.garments[0].label, '확인한 기존 셔츠');
  await sameBytes(saved.photos.get(asset.id), asset.blob);
  page.app.beginDraft(null, 'm-oxford');
  assert.notEqual(page.app.draft().entryMode, 'choice');
  assert.equal(page.app.draft().kind, 'shirt');
  assert.equal(page.app.draft().slot, 'm-oxford');
  await page.app.saveGarmentDraft();
  saved = await stored(page);
  assert.equal(saved.state.garments.length, 2);
});

test('a failed photo-first save keeps the selected photograph and human edits for retry', async (t) => {
  const page = await boot();
  t.after(() => page.close());
  page.app.beginDraft();
  await page.app.chooseGarmentPhoto(jpeg(58));
  await page.click({ action: 'draft-kind', kind: 'shirt' });
  page.input('garment-label', '다시 저장할 셔츠');
  const original = page.app.draft().asset;
  const before = await stored(page);
  const put = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (...args) {
    if (this.name === 'records') throw new DOMException('wardrobe-first synthetic quota', 'QuotaExceededError');
    return put.apply(this, args);
  };
  try { await page.app.saveGarmentDraft(); } finally { IDBObjectStore.prototype.put = put; }
  assert.equal(page.app.draft().label, '다시 저장할 셔츠');
  assert.equal(page.app.draft().kind, 'shirt');
  assert.equal(page.app.draft().asset.id, original.id);
  assert.ok(page.app.draft().error);
  assert.equal((await stored(page)).revision, before.revision);
  await page.app.saveGarmentDraft();
  const saved = await stored(page);
  assert.equal(saved.state.garments[0].label, '다시 저장할 셔츠');
  await sameBytes(saved.photos.get(original.id), original.blob);
});

test('personal wardrobe photos precede outfit advice and an unknown brand is not replaced by a color name', async (t) => {
  const { page, owned } = await personalPage();
  t.after(() => page.close());
  const markup = page.app.renderCloset();
  const photosAt = markup.indexOf('class="closet-items"');
  const adviceAt = markup.indexOf('오늘 뭐 입지?');
  assert.ok(photosAt >= 0);
  assert.ok(adviceAt >= 0);
  assert.ok(photosAt < adviceAt, 'the freshly registered wardrobe must be visible before outfit advice');
  const card = markup.match(new RegExp(`<button\\b[^>]*data-id="${owned.id}"[^>]*>([\\s\\S]*?)<\\/button>`))?.[1];
  assert.ok(card);
  const brandText = card.match(/<span class="cbrand">([\s\S]*?)<\/span>/)?.[1];
  assert.ok(brandText, 'a missing brand must receive an explicit unknown presentation');
  assert.match(brandText, /브랜드.*(?:미확인|모름|미입력)|No Brand/);
  assert.doesNotMatch(brandText, /라이트 블루/);
  assert.doesNotMatch(markup, /예시 옷\s*\d+벌로 바로 체험 중/);
});

test('example wardrobes retain the example distinction and do not acquire invented user registration dates', async (t) => {
  const page = await boot();
  t.after(() => page.close());
  assert.equal(page.state().demo, true);
  const markup = page.app.renderCloset();
  assert.match(markup, /예시/);
  assert.doesNotMatch(markup, /등록일|<time\b|\b20\d{2}\.\s*\d{1,2}\.\s*\d{1,2}/);
  assert.doesNotMatch(markup, /계정 연결 완료|이메일에서 가져오기|온라인 스토어에서 자동/);
});
