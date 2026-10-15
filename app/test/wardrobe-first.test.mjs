import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { makeGarment, newWardrobeState, garmentKindName, slotForItem } from '../src/wardrobe.js';
import { createWardrobeStore, photoAsset, parseWardrobeBackup } from '../src/wardrobe-store.js';
import { SLOT_BY_ID, STYLES } from '../src/data/slots.js';

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
  // Like a browser without a HEIF decoder: a HEIC blob fails to decode unless
  // a test marks it decodable (Safari 17+ decodes HEIC natively).
  class TestImage {
    naturalWidth = 768;
    naturalHeight = 1024;
    decode() {
      const blob = urls.get(this.src);
      return /^image\/hei[cf]/.test(blob?.type || '') && !blob.decodable ? Promise.reject(new Error('undecodable')) : Promise.resolve();
    }
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
    async searchCloset(value) {
      const form = { elements: { closetQuery: { value } } };
      let prevented = false;
      for (const fn of listeners.get('submit') || []) await fn({
        target: { closest: (selector) => selector === 'form[data-action="closet-search"]' ? form : null },
        preventDefault() { prevented = true; },
      });
      assert.ok(prevented, 'closet search must use the app submit handler');
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
async function registrationPage(gender, style) {
  const indexedDB = new IDBFactory();
  const store = createWardrobeStore({ indexedDB });
  const first = await store.load();
  await store.commit({ ...newWardrobeState(), gender, styles: [style], demo: false, demoSelected: [] }, first.revision, [], first.epoch);
  store.close();
  return boot({ indexedDB });
}
function quickRegistrationSlots(markup) {
  return [...markup.matchAll(/data-action="draft-quick-slot" data-slot="([^"]+)"/g)]
    .map((match) => SLOT_BY_ID[match[1]]);
}
function assertBalancedRegistrationChoices(slots, gender) {
  assert.equal(slots.length, 12);
  assert.equal(new Set(slots.map((slot) => slot.id)).size, 12, 'quick choices cannot repeat a detailed type');
  assert.ok(slots.every((slot) => slot.g === gender), 'quick choices must match the garment gender');
  assert.deepEqual(Object.fromEntries(['top', 'outer', 'bottom', 'shoes'].map((cat) => [cat, slots.filter((slot) => slot.cat === cat).length])),
    { top: 4, outer: 2, bottom: 3, shoes: 3 }, 'a complete outfit must remain reachable without expanding more types');
  for (const kind of ['tee', 'shirt', 'knit', 'jeans', 'sneaker', 'loafer', 'boot'])
    assert.ok(slots.some((slot) => slot.shape === kind), `${kind} must not disappear behind a style filter`);
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

test('a photograph alone cannot save a garment and optional name and brand controls stay collapsed', async (t) => {
  const page = await boot();
  t.after(() => page.close());
  page.app.beginDraft();
  await page.app.chooseGarmentPhoto(jpeg(54));
  assert.equal(page.app.draft().kind, null);
  assert.match(page.sheet(), /class="photo-preview"/);
  const details = openingDetailsFor(page.sheet(), '브랜드·이름');
  assert.ok(details, 'optional metadata remains available for correction');
  assert.doesNotMatch(details, /\bopen(?:\s|=|>)/);
  const before = await stored(page);
  await page.app.saveGarmentDraft();
  const afterSave = await stored(page);
  assert.equal(afterSave.revision, before.revision);
  assert.equal(afterSave.photos.size, 0);
  assert.ok(page.app.draft()?.asset, 'the photograph remains a draft after the guarded save');
});

test('after choosing a photographed garment kind, recipe detail and colour are visible before optional identity fields', async (t) => {
  const page = await boot();
  t.after(() => page.close());
  page.app.beginDraft();
  const source = jpeg(55);
  await page.app.chooseGarmentPhoto(source);
  await page.click({ action: 'draft-kind', kind: 'shirt' });
  const markup = page.sheet();
  const detail = openingDetailsFor(markup, '세부 종류 확인');
  assert.ok(detail && /\bopen(?:\s|=|>)/.test(detail), 'the unknown detailed type is offered directly after kind selection');
  assert.match(markup, /<fieldset class="color-confirm">[\s\S]*data-action="draft-color"/);
  assert.ok(markup.indexOf('color-confirm') < markup.indexOf('브랜드·이름 수정'), 'recommendation-relevant confirmation precedes optional identity entry');
  assert.doesNotMatch(openingDetailsFor(markup, '브랜드·이름 수정'), /\bopen(?:\s|=|>)/);
  assert.equal(page.app.draft().slot, null);
  assert.equal(page.app.draft().color, null, 'visibility does not silently infer type or colour');
  const colour = markup.slice(markup.indexOf('<fieldset class="color-confirm">'));
  assert.doesNotMatch(colour, /aria-pressed="true"/, 'no colour, not even "unknown", is preselected');
  assert.match(colour, /data-color="navy" aria-pressed="false"><i [^>]*><\/i><span>네이비<\/span>/, 'each colour shows its name');
  assert.match(colour, /data-color="indigo"[^>]*>[\s\S]*?<span>인디고<\/span>/);
  assert.match(colour, /아직 고르지 않았어요/);
  await page.click({ action: 'draft-slot', slot: 'm-oxford' });
  await page.click({ action: 'draft-color', color: 'navy' });
  assert.match(page.sheet(), /data-color="navy" aria-pressed="true"/);
  assert.match(page.sheet(), /data-action="draft-color" data-color="">색은 나중에 정하기/, 'a chosen colour can be cleared again');
  await page.click({ action: 'draft-color', color: '' });
  assert.equal(page.app.draft().color, null);
  await page.click({ action: 'draft-color', color: 'blue' });
  const id = page.app.draft().id;
  await page.app.saveGarmentDraft();
  const snapshot = await stored(page);
  const item = snapshot.state.garments.find((entry) => entry.id === id);
  assert.equal(item.slot, 'm-oxford');
  assert.equal(item.color, 'blue');
  await sameBytes(snapshot.photos.get(item.photoId), source);
});

test('photo quick-type selection confirms one detailed kind without inventing colour, brand or exact product identity', async (t) => {
  const page = await boot();
  t.after(() => page.close());
  page.app.beginDraft();
  const source = jpeg(56);
  await page.app.chooseGarmentPhoto(source);
  const markup = page.sheet();
  const slots = [...markup.matchAll(/data-action="draft-quick-slot" data-slot="([^"]+)"/g)].map((match) => match[1]);
  assert.ok(slots.length > 0 && slots.length <= 12, 'the quick choices are bounded, real wardrobe types');
  assert.ok(slots.every((id) => SLOT_BY_ID[id]?.g === page.app.draft().gender));
  assert.match(markup, /사진은 종류를 고르는 참고용/);
  const photoTools = openingDetailsFor(markup, '사진 고치기');
  assert.ok(photoTools);
  assert.doesNotMatch(photoTools, /\bopen(?:\s|=|>)/, 'photo tools stay available without distracting from the type choice');
  await page.click({ action: 'draft-quick-slot', slot: slots[0] });
  const current = page.app.draft();
  assert.equal(current.slot, slots[0]);
  assert.equal(current.kind, SLOT_BY_ID[slots[0]].shape);
  assert.equal(current.color, null);
  assert.equal(current.brand, null);
  assert.equal(current.productId, null);
  assert.match(page.sheet(), /class="color-confirm"/);
  const id = current.id;
  await page.app.saveGarmentDraft();
  const snapshot = await stored(page);
  const item = snapshot.state.garments.find((entry) => entry.id === id);
  assert.equal(item.slot, slots[0]);
  assert.equal(item.color, null, 'the user may save without confirming the colour');
  assert.equal(item.brand, null);
  assert.equal(item.productId, null);
  await sameBytes(snapshot.photos.get(item.photoId), source);
});

test('men can quickly register tops, outerwear, trousers and shoes in every supported style', async (t) => {
  const choices = new Map();
  for (const [style, definition] of Object.entries(STYLES).filter(([, value]) => value.g.includes('M'))) {
    const page = await registrationPage('M', style);
    t.after(() => page.close());
    page.app.beginDraft();
    await page.app.chooseGarmentPhoto(jpeg(61));
    const slots = quickRegistrationSlots(page.sheet());
    assertBalancedRegistrationChoices(slots, 'M');
    assert.ok(slots.some((slot) => slot.id === 'm-chino'), `${definition.label}: basic chinos stay available`);
    assert.ok(slots.some((slot) => slot.id === 'm-vest'), `${definition.label}: a knit vest stays available`);
    assert.equal(page.app.draft().color, null);
    choices.set(style, slots.map((slot) => slot.id));
  }
  assert.ok(choices.get('classic').includes('m-harrington'));
  assert.ok(choices.get('amekaji').includes('m-trucker'));
  assert.ok(choices.get('gorp').includes('m-trail'));
  assert.notDeepEqual(choices.get('classic'), choices.get('amekaji'), 'style changes the representatives without removing clothing categories');
});

test('women receive twelve gender-appropriate quick choices with bottoms and shoes in every supported style', async (t) => {
  for (const [style] of Object.entries(STYLES).filter(([, value]) => value.g.includes('F'))) {
    const page = await registrationPage('F', style);
    t.after(() => page.close());
    page.app.beginDraft();
    await page.app.chooseGarmentPhoto(jpeg(62));
    const slots = quickRegistrationSlots(page.sheet());
    assertBalancedRegistrationChoices(slots, 'F');
    assert.ok(slots.some((slot) => slot.shape === 'skirt'));
    assert.match(page.sheet(), /data-action="draft-kind" data-kind="dress"/, 'other available kinds remain reachable');
    assert.doesNotMatch(page.sheet(), /data-action="draft-kind" data-kind="vest"/, 'a male-only detailed type cannot be selected for a female garment');
    assert.equal(page.app.draft().color, null);
    assert.equal(page.app.draft().brand, null);
  }
});

test('manual vests retain unknown details while padded vests remain distinct through storage and backup', async (t) => {
  const page = await registrationPage('M', 'classic');
  t.after(() => page.close());
  page.app.beginDraft();
  await page.click({ action: 'draft-manual' });
  assert.match(page.sheet(), /data-action="draft-kind" data-kind="vest"/);
  await page.click({ action: 'draft-kind', kind: 'vest' });
  assert.equal(page.app.draft().kind, 'vest');
  assert.equal(page.app.draft().slot, null);
  assert.match(page.sheet(), /data-action="draft-slot" data-slot="m-vest"/);
  assert.match(page.sheet(), /data-action="draft-slot" data-slot="m-downvest"/);
  const genericId = page.app.draft().id;
  await page.app.saveGarmentDraft();

  page.app.beginDraft();
  await page.click({ action: 'draft-manual' });
  await page.click({ action: 'draft-kind', kind: 'vest' });
  await page.click({ action: 'draft-slot', slot: 'm-downvest' });
  const paddedId = page.app.draft().id;
  await page.app.saveGarmentDraft();

  const saved = await stored(page);
  const generic = saved.state.garments.find((item) => item.id === genericId);
  const padded = saved.state.garments.find((item) => item.id === paddedId);
  assert.equal(garmentKindName(generic.kind), '베스트·조끼');
  assert.equal(generic.slot, null, 'a generic vest must not silently acquire knit or padding details');
  assert.equal(generic.color, null);
  assert.equal(padded.slot, 'm-downvest');
  assert.equal(slotForItem(padded).cat, 'outer');
  assert.equal(padded.color, null);
  assert.equal(padded.brand, null);
  assert.equal(padded.productId, null);
  const parsed = await parseWardrobeBackup(await page.app.store.backup());
  const restored = createWardrobeStore({ indexedDB: new IDBFactory() });
  t.after(() => restored.close());
  await restored.commit(parsed.state, 0, parsed.assets);
  assert.deepEqual(plain((await restored.read()).state), saved.state, 'both vest classifications survive an actual backup restore');
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

async function filterClosetToNoResults(page) {
  await page.click({ action: 'tab', tab: 'closet' });
  await page.click({ action: 'closet-review' });
  await page.click({ action: 'closet-filter', cat: 'top' });
  await page.change('closet-sort', { value: 'oldest' });
  await page.searchCloset('no-results-ux');
  assertFilteredCloset(page.app.renderCloset());
}
function assertFilteredCloset(markup) {
  assert.match(markup, /id="closet-search"[^>]*value="no-results-ux"/);
  assert.match(markup, /data-action="closet-filter" data-cat="top" aria-pressed="true"/);
  assert.match(markup, /data-action="closet-review" aria-pressed="true"/);
  assert.match(markup, /<option value="oldest" selected>/);
  assert.match(markup, /조건에 맞는 옷이 없어요/);
}
function assertSavedGarmentVisible(page, id) {
  const markup = page.nodes.get('app').innerHTML;
  assert.match(markup, /id="closet-search"[^>]*value=""/);
  assert.match(markup, /data-action="closet-filter" data-cat="all" aria-pressed="true"/);
  assert.match(markup, /data-action="closet-review" aria-pressed="false"/);
  assert.match(markup, /<option value="recent" selected>/);
  assert.match(markup, new RegExp(`data-action="open-own" data-id="${id}"`));
  assert.doesNotMatch(markup, /조건에 맞는 옷이 없어요/);
}

test('a durable photo garment save reveals the new item despite every previous closet filter', async (t) => {
  const { page, owned } = await personalPage({ color: null });
  t.after(() => page.close());
  await filterClosetToNoResults(page);
  await page.click({ action: 'add-start' });
  await page.app.chooseGarmentPhoto(jpeg(75));
  await page.click({ action: 'draft-kind', kind: 'jacket' });
  page.input('garment-label', '새로 등록한 사진 재킷');
  const { id, asset } = page.app.draft();
  const before = await stored(page);

  await page.app.saveGarmentDraft();

  const saved = await stored(page);
  assert.equal(saved.revision, before.revision + 1);
  assert.equal(saved.state.garments.length, 2);
  assert.ok(saved.state.garments.some((item) => item.id === id && item.kind === 'jacket'));
  await sameBytes(saved.photos.get(asset.id), asset.blob);
  assertSavedGarmentVisible(page, id);
  assert.match(page.nodes.get('app').innerHTML, new RegExp(`data-action="open-own" data-id="${owned.id}"`));
});

test('a rejected photo save preserves closet filters and the draft until a durable retry succeeds', async (t) => {
  const { page } = await personalPage({ color: null });
  t.after(() => page.close());
  await filterClosetToNoResults(page);
  await page.click({ action: 'add-start' });
  await page.app.chooseGarmentPhoto(jpeg(76));
  await page.click({ action: 'draft-kind', kind: 'jacket' });
  page.input('garment-label', '입력을 유지할 사진 재킷');
  const { id, asset } = page.app.draft();
  const before = await stored(page);
  const put = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (...args) {
    if (this.name === 'records') throw new DOMException('filtered closet synthetic quota', 'QuotaExceededError');
    return put.apply(this, args);
  };
  try { await page.app.saveGarmentDraft(); } finally { IDBObjectStore.prototype.put = put; }

  const rejected = await stored(page);
  assert.equal(rejected.revision, before.revision);
  assert.deepEqual(rejected.state, before.state);
  assert.deepEqual([...rejected.photos.keys()], [...before.photos.keys()]);
  assertFilteredCloset(page.nodes.get('app').innerHTML);
  assert.equal(page.app.draft().id, id);
  assert.equal(page.app.draft().label, '입력을 유지할 사진 재킷');
  assert.equal(page.app.draft().asset.id, asset.id);
  assert.ok(page.app.draft().error);

  await page.app.saveGarmentDraft();

  const saved = await stored(page);
  assert.equal(saved.revision, before.revision + 1);
  assert.equal(saved.state.garments.length, 2);
  await sameBytes(saved.photos.get(asset.id), asset.blob);
  assertSavedGarmentVisible(page, id);
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
  assert.equal(brandText, undefined, 'a missing brand is omitted from the compact wardrobe card');
  assert.doesNotMatch(card, /class="cbrand"[^>]*>라이트 블루/);
  assert.doesNotMatch(markup, /예시 옷\s*\d+벌로 바로 체험 중/);
  await page.click({ action: 'open-own', id: owned.id });
  assert.match(page.sheet(), /브랜드 미입력/, 'the detail view still states that the brand was not entered');
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

// Claude review of 98de4cc: registration recovery and the own-photo / reference / example distinction.
async function seededPage(garments, assets = []) {
  const indexedDB = new IDBFactory();
  const store = createWardrobeStore({ indexedDB });
  const first = await store.load();
  await store.commit({ ...newWardrobeState(), demo: false, demoSelected: [], garments }, first.revision, assets, first.epoch);
  store.close();
  return boot({ indexedDB });
}
const tiles = (markup) => markup.split('class="citem"').slice(1);

test('migrated garments say they were moved instead of showing the placeholder migration date', async (t) => {
  const asset = await photoAsset(jpeg(51));
  const page = await seededPage([
    makeGarment({ id: 'legacy_m-tee-white', kind: 'tee', slot: 'm-tee', gender: 'M', color: 'white', source: 'legacy', createdAt: '2026-10-14T00:00:00.000Z' }),
    makeGarment({ id: 'own-shirt', kind: 'shirt', slot: 'm-oxford', gender: 'M', color: 'white', photoId: asset.id, createdAt: '2026-10-10T00:00:00.000Z' }),
  ], [asset]);
  t.after(() => page.close());
  await page.click({ action: 'tab', tab: 'closet' });
  const markup = page.nodes.get('app').innerHTML;
  const legacy = tiles(markup).find((tile) => tile.includes('legacy_m-tee-white'));
  const own = tiles(markup).find((tile) => tile.includes('own-shirt'));
  assert.match(legacy, /이전 버전에서 옮김/);
  assert.doesNotMatch(legacy, /등록 2026\. 10\. 14\./, 'a migration placeholder is not a registration date');
  assert.match(own, /등록 2026\. 10\. 10\./);
});

test('the wardrobe grid keeps the stand-in caption on borrowed product photos and never on the person’s own photo', async (t) => {
  const asset = await photoAsset(jpeg(52));
  const page = await seededPage([
    makeGarment({ id: 'no-photo-tee', kind: 'tee', slot: 'm-tee', gender: 'M', color: 'white', createdAt: '2026-10-11T00:00:00.000Z' }),
    makeGarment({ id: 'own-photo-shirt', kind: 'shirt', slot: 'm-oxford', gender: 'M', color: 'white', photoId: asset.id, createdAt: '2026-10-12T00:00:00.000Z' }),
  ], [asset]);
  t.after(() => page.close());
  await page.click({ action: 'tab', tab: 'closet' });
  const markup = page.nodes.get('app').innerHTML;
  const standIn = tiles(markup).find((tile) => tile.includes('no-photo-tee'));
  const own = tiles(markup).find((tile) => tile.includes('own-photo-shirt'));
  assert.match(standIn, /borrowed-photo[\s\S]*비슷한 상품 사진/);
  assert.doesNotMatch(own, /비슷한 상품 사진|borrowed-photo/);
  assert.match(own, /data-own-photo="own-photo-shirt"/);
});

test('with analysis off, a chosen photograph shows the kind grid open instead of a collapsed "other kind" fallback', async (t) => {
  const page = await boot();
  t.after(() => page.close());
  await page.click({ action: 'add-start' });
  await page.app.chooseGarmentPhoto(jpeg(53));
  assert.equal(page.app.draft().entryMode, 'photo');
  assert.match(page.sheet(), /data-action="draft-kind"/);
  assert.equal(openingDetailsFor(page.sheet(), '다른 종류로 등록'), null, 'no suggestion exists, so the grid is the primary choice');
  await page.click({ action: 'draft-kind', kind: 'shirt' });
  assert.ok(openingDetailsFor(page.sheet(), '다른 종류로 바꾸기'), 'after choosing, the grid folds behind a change option');
});

test('an unsupported photo offers photo recovery, not a wardrobe reload, and keeps the draft', async (t) => {
  const page = await boot();
  t.after(() => page.close());
  await page.click({ action: 'add-start' });
  await page.app.chooseGarmentPhoto(new Blob([new Uint8Array([0, 0, 0, 24])], { type: 'image/heic' }));
  const sheet = page.sheet();
  assert.match(sheet, /HEIC 사진을 열지 못했어요/);
  assert.match(sheet, /높은 호환성/, 'the iPhone camera setting is named as the way out');
  assert.match(sheet, /class="photo-error"[\s\S]*data-action="add-photo"[\s\S]*data-action="add-camera"[\s\S]*data-action="draft-manual"/);
  assert.doesNotMatch(sheet, /data-action="reload-wardrobe"/);
  assert.equal(page.app.draft().error, '');
  assert.ok(page.app.draft(), 'the draft stays open for another choice');
});

test('album and label pickers ask the browser for JPEG, PNG or WebP so phones can convert HEIC before upload', () => {
  for (const id of ['photo-input', 'label-photo-input', 'camera-photo-input']) {
    const tag = html.match(new RegExp(`<input\\b[^>]*id="${id}"[^>]*>`))?.[0];
    assert.ok(tag, id);
    assert.match(tag, /accept="image\/jpeg,image\/png,image\/webp"/);
  }
});

test('every bottom sheet is a named dialog so screen readers say which window opened', async (t) => {
  const page = await boot();
  t.after(() => page.close());
  await page.click({ action: 'add-start' });
  const sheet = page.sheet();
  assert.match(sheet, /role="dialog"[^>]*aria-labelledby="sheet-title"/);
  assert.match(sheet, /<h2 id="sheet-title" class="detail-title">옷 한 벌 추가<\/h2>/);
  assert.equal(sheet.match(/id="sheet-title"/g).length, 1, 'only the first heading names the dialog');
});

test('storage and example notices live inside the main landmark under one page heading', async (t) => {
  const page = await boot();
  t.after(() => page.close());
  const markup = page.nodes.get('app').innerHTML;
  assert.match(markup, /^<main\b[^>]*id="main-content"[^>]*><h1 class="sr-only">어울 추천<\/h1>/);
  assert.ok(markup.indexOf('demo-notice') > markup.indexOf('<main'), 'the example notice is inside main');
  assert.ok(markup.indexOf('demo-notice') < markup.indexOf('</main>'));
  assert.equal(markup.match(/<h1\b/g).length, 1);
  await page.click({ action: 'tab', tab: 'closet' });
  assert.match(page.nodes.get('app').innerHTML, /^<main\b[^>]*id="main-content"[^>]*><h1 class="sr-only">어울 내 옷장<\/h1>/);
});
