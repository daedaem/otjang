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
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'eoul-experience-test-'));
after(() => fs.rmSync(temp, { recursive: true, force: true }));
const output = path.join(temp, 'index.html');
execFileSync(process.execPath, [path.join(root, 'tools/build.mjs'), '--out', output]);
const html = fs.readFileSync(output, 'utf8');
const script = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1].replace(
  /\n\}\)\(\);\s*$/,
  '\nglobalThis.testApp = { state: () => state, ready: appReady, draft: () => garmentDraft, store: wardrobeStore, toggleOwn, itemSheet, render, recommendItems, recommendLooks, chooseGarmentPhoto, chooseWardrobeBackup, saveGarmentDraft };\n})();',
);

// Actual bundled callbacks and IDB transactions; DOM, decoding and canvas are test doubles.
// This is persistence/flow verification, not browser layout or real camera QA.
async function boot(initial = new Map(), indexedDB = new IDBFactory()) {
  const storage = new Map(initial), urls = new Map();
  let nextURL = 0;
  const nodes = new Map(['app', 'sheet-root', 'toast'].map((id) => [id, {
    innerHTML: '', classList: { add() {}, remove() {} }, querySelector() { return null; }, querySelectorAll() { return []; },
  }]));
  const listeners = new Map();
  class FakeImage {
    naturalWidth = 800; naturalHeight = 1000;
    decode() { return urls.get(this.src)?.decodePromise || Promise.resolve(); }
  }
  const context = vm.createContext({
    indexedDB, Blob, crypto: globalThis.crypto, structuredClone, btoa, atob, Uint8Array, DataView, TextEncoder, TextDecoder,
    URL: { createObjectURL(blob) { const id = `blob:test/${++nextURL}`; urls.set(id, blob); return id; }, revokeObjectURL(id) { urls.delete(id); } },
    Image: FakeImage, HTMLImageElement: FakeImage,
    localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    document: {
      getElementById: (id) => nodes.get(id) ?? null,
      addEventListener: (type, fn) => listeners.set(type, fn),
      querySelector: () => null, querySelectorAll: () => [], body: { style: {}, append() {} },
      createElement(tag) {
        if (tag !== 'canvas') return { click() {}, remove() {} };
        let outputBlob;
        return { getContext() { return { fillRect() {}, drawImage(image) { outputBlob = urls.get(image.src); } }; }, toBlob(callback) { callback(outputBlob); } };
      },
    },
    window: { scrollTo() {} }, CSS: { escape: (value) => value },
    setTimeout: () => 1, clearTimeout() {}, requestAnimationFrame: (fn) => fn(),
  });
  vm.runInContext(script, context);
  await context.testApp.ready;
  return {
    app: context.testApp, storage, nodes, indexedDB, urls,
    click(dataset) { return listeners.get('click')({ target: { closest: () => ({ dataset }) }, preventDefault() {}, stopPropagation() {} }); },
    input(id, value) { return listeners.get('input')({ target: { id, value } }); },
    submit() { return listeners.get('submit')({ target: { closest: (selector) => selector.includes('save-garment') ? {} : null }, preventDefault() {} }); },
    state() { return JSON.parse(JSON.stringify(context.testApp.state())); },
  };
}
const jpeg = (value = 7) => new Blob([new Uint8Array([255, 216, 255, value])], { type: 'image/jpeg' });
async function manifest(file) {
  const header = Buffer.from(await file.slice(0, 12).arrayBuffer());
  return JSON.parse(await file.slice(12, 12 + header.readUInt32LE(8)).text());
}
async function add(page, kind = 'shirt', label = '') {
  await page.click({ action: 'add-garment' });
  await page.click({ action: 'pick-kind', kind });
  page.input('garment-label', label);
  await page.submit();
}

test('fresh visit shows six labeled examples and concrete recommendations without onboarding', async () => {
  const page = await boot();
  assert.equal(page.state().demo, true);
  assert.equal(page.state().owned.length, 6);
  assert.equal(page.state().garments.length, 0);
  const markup = page.nodes.get('app').innerHTML;
  assert.match(markup, /예시 옷 6벌로 바로 체험 중/);
  assert.match(markup, /오늘의 코디/);
  assert.doesNotMatch(markup, /1\. 누구의 옷을/);
  assert.ok(page.app.recommendItems(page.app.state()).length >= 3);
  assert.ok(page.app.recommendLooks(page.app.state()).some((look) => look.ownedCount >= 2));
});

test('legacy personal clothes, preferences and saved products migrate once; original keys are read only', async () => {
  const saved = { onboarded: true, gender: 'F', style: 'minimal', owned: ['f-denim', 'f-knit'], saved: ['ms-1115031'], hidden: [], budget: 50000 };
  const raw = JSON.stringify(saved);
  const page = await boot(new Map([['eoul:v1', raw], ['eoul.mobile-preview', 'existing-other-app-data']]));
  assert.equal(page.state().demo, false);
  assert.deepEqual(page.state().owned.sort(), [...saved.owned].sort());
  assert.deepEqual(page.state().saved, saved.saved);
  assert.equal(page.state().budget, 50000);
  assert.equal(page.storage.get('eoul:v1'), raw);
  assert.equal(page.storage.get('eoul.mobile-preview'), 'existing-other-app-data');
  const reloaded = await boot(page.storage, page.indexedDB);
  assert.deepEqual(reloaded.state().garments, page.state().garments);
  assert.equal((await reloaded.app.store.read()).revision, 1);
});

test('first personal save changes demo atomically; cancelling the editor does not wipe examples', async () => {
  const page = await boot();
  await page.click({ action: 'start-personal' });
  assert.equal(page.state().demo, true);
  await page.click({ action: 'close-sheet' });
  assert.equal(page.state().owned.length, 6);
  await add(page, 'shirt');
  assert.equal(page.state().demo, false);
  assert.equal(page.state().garments.length, 1);
  assert.equal(page.state().garments[0].photoId, null);
  assert.equal(page.state().garments[0].slotId, null);
  assert.equal(page.state().garments[0].attrs, null);
  assert.equal(page.state().tab, 'closet');
  const reloaded = await boot(page.storage, page.indexedDB);
  assert.deepEqual(reloaded.state().garments, page.state().garments);
  assert.equal(reloaded.state().demo, false);
});

test('demo edits and female examples remain separate from real garments', async () => {
  const page = await boot();
  await page.click({ action: 'toggle-own', slot: 'm-chino' });
  const reloaded = await boot(page.storage, page.indexedDB);
  assert.equal(reloaded.state().demo, true);
  assert.equal(reloaded.state().owned.length, 5);
  await reloaded.click({ action: 'set-gender', g: 'F' });
  assert.equal(reloaded.state().owned.length, 6);
  assert.ok(reloaded.state().owned.every((id) => id.startsWith('f-')));
  assert.deepEqual(reloaded.state().garments, []);
});

test('two garments of one kind retain distinct IDs and names; already-own cannot delete them', async () => {
  const page = await boot();
  await add(page, 'pants', '바지 하나');
  await add(page, 'pants', '바지 둘');
  assert.equal(page.state().garments.length, 2);
  assert.notEqual(page.state().garments[0].id, page.state().garments[1].id);
  await page.click({ action: 'own', slot: 'm-chino' });
  assert.equal(page.state().garments.length, 2);
  assert.match(page.nodes.get('toast').innerHTML, /이미 옷장에 있어요/);
});

test('photo and optional name appear in actual wardrobe and outfit rows after reload', async () => {
  const page = await boot();
  await page.click({ action: 'add-garment' });
  await page.app.chooseGarmentPhoto(jpeg());
  await page.click({ action: 'pick-kind', kind: 'shirt' });
  page.input('garment-label', '출근 셔츠');
  await page.submit();
  const garment = page.state().garments[0];
  assert.match(garment.photoId, /^p_[a-f0-9]{64}$/);
  const reloaded = await boot(page.storage, page.indexedDB);
  await reloaded.click({ action: 'tab', tab: 'closet' });
  assert.match(reloaded.nodes.get('app').innerHTML, /출근 셔츠/);
  assert.match(reloaded.nodes.get('app').innerHTML, /src="blob:test\//);
  await reloaded.click({ action: 'tab', tab: 'home' });
  assert.match(reloaded.nodes.get('app').innerHTML, /data-own-photo=/);
  assert.match(reloaded.nodes.get('app').innerHTML, /색과 핏은 직접 확인/);
});

test('a failed photo write leaves demo and draft intact, then retry commits both together', async () => {
  const page = await boot();
  await page.click({ action: 'add-garment' });
  await page.app.chooseGarmentPhoto(jpeg());
  await page.click({ action: 'pick-kind', kind: 'shirt' });
  page.input('garment-label', '다시 저장할 옷');
  const put = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (...args) {
    if (this.name === 'photos') throw new DOMException('사진 용량 부족', 'QuotaExceededError');
    return put.apply(this, args);
  };
  try { await page.submit(); } finally { IDBObjectStore.prototype.put = put; }
  assert.equal(page.state().demo, true);
  assert.equal((await page.app.store.read()).state.demo, true);
  assert.match(page.nodes.get('sheet-root').innerHTML, /다시 저장할 옷/);
  assert.match(page.nodes.get('sheet-root').innerHTML, /다시 저장/);
  assert.match(page.nodes.get('app').innerHTML, /저장을 확인/);
  await page.submit();
  assert.equal(page.state().demo, false);
  assert.equal((await page.app.store.read()).photos.size, 1);
  assert.equal(page.nodes.get('sheet-root').innerHTML, '');
});

test('late photo preparation cannot resurrect a cancelled draft or attach to another garment', async () => {
  const page = await boot();
  await page.click({ action: 'add-garment' });
  const file = jpeg();
  let resolve;
  file.decodePromise = new Promise((done) => { resolve = done; });
  const pending = page.app.chooseGarmentPhoto(file);
  await page.click({ action: 'close-sheet' });
  await page.click({ action: 'add-garment' });
  const newId = page.app.draft().id;
  resolve(); await pending;
  assert.equal(page.app.draft().id, newId);
  assert.equal(page.app.draft().photoId, null);
  assert.equal(page.app.draft().asset, null);
});

test('backup restore previews before mutation and restores photo contents on confirmation', async () => {
  const source = await boot();
  await source.click({ action: 'add-garment' });
  await source.app.chooseGarmentPhoto(jpeg());
  await source.click({ action: 'pick-kind', kind: 'shirt' });
  await source.submit();
  const target = await boot();
  await target.app.chooseWardrobeBackup(new Blob([await source.app.store.backup()]));
  assert.equal(target.state().demo, true);
  assert.match(target.nodes.get('sheet-root').innerHTML, /내 옷 1벌 · 사진 1장/);
  await target.click({ action: 'restore-confirm' });
  assert.deepEqual(target.state().garments, source.state().garments);
  assert.equal((await target.app.store.read()).photos.size, 1);
});

test('unsupported legacy fields are preserved, visibly block saving and allow raw export', async () => {
  const raw = JSON.stringify({ owned: ['m-chino'], futureField: { keep: 'original' } });
  const page = await boot(new Map([['eoul:v1', raw]]));
  assert.equal(page.storage.get('eoul:v1'), raw);
  assert.match(page.nodes.get('app').innerHTML, /저장된 옷장을 읽지 못해 예시/);
  assert.match(page.nodes.get('app').innerHTML, /저장 원문 받기/);
  await page.click({ action: 'add-garment' });
  assert.equal(page.app.draft(), null);
  assert.equal((await manifest(await page.app.store.recoveryBackup(raw))).legacyRaw, raw);
});

test('a new garment draft survives a conflicting tab write and merges only after refreshing stored state', async () => {
  const first = await boot(), second = await boot(first.storage, first.indexedDB);
  await second.click({ action: 'add-garment' });
  await second.click({ action: 'pick-kind', kind: 'shirt' });
  second.input('garment-label', '두 번째 탭의 셔츠');
  await add(first, 'pants', '첫 번째 탭의 바지');
  await second.submit();
  assert.match(second.nodes.get('sheet-root').innerHTML, /최신 옷장 불러오기/);
  assert.equal((await second.app.store.read()).state.garments.length, 1);
  await second.click({ action: 'reload-wardrobe' });
  assert.equal(second.app.draft().label, '두 번째 탭의 셔츠');
  await second.submit();
  assert.deepEqual(second.state().garments.map((garment) => garment.label), ['첫 번째 탭의 바지', '두 번째 탭의 셔츠']);
});

test('cancelled backup parsing cannot replace a subsequently opened garment editor', async () => {
  const page = await boot();
  const backup = await page.app.store.backup();
  const originalSlice = backup.slice.bind(backup);
  let resolve;
  backup.slice = (start, end, type) => {
    const part = originalSlice(start, end, type);
    if (start === 0) part.arrayBuffer = () => new Promise((done) => { resolve = done; });
    return part;
  };
  const pending = page.app.chooseWardrobeBackup(backup);
  await page.click({ action: 'close-sheet' });
  await page.click({ action: 'add-garment' });
  const id = page.app.draft().id;
  resolve(await originalSlice(0, 12).arrayBuffer()); await pending;
  assert.equal(page.app.draft().id, id);
  assert.match(page.nodes.get('sheet-root').innerHTML, /옷 한 벌 추가/);
});

test('changes in the old app are noticed and imported without overwriting actual photos or edited legacy IDs', async () => {
  const original = { onboarded: true, gender: 'M', style: 'classic', owned: ['m-chino'], saved: [], hidden: [] };
  const first = await boot(new Map([['eoul:v1', JSON.stringify(original)]]));
  await first.click({ action: 'edit-garment', id: 'legacy_m-chino' });
  first.input('garment-label', '내가 수정한 바지');
  await first.app.chooseGarmentPhoto(jpeg());
  await first.submit();
  const edited = first.state().garments[0];
  first.storage.set('eoul:v1', JSON.stringify({ ...original, style: 'casual', owned: ['m-chino', 'm-denim'], saved: ['ms-1115031'] }));
  const reloaded = await boot(first.storage, first.indexedDB);
  assert.match(reloaded.nodes.get('app').innerHTML, /이전 버전에서 옷장이 바뀌었어요/);
  assert.equal(reloaded.state().garments.length, 1);
  await reloaded.click({ action: 'review-legacy' });
  assert.match(reloaded.nodes.get('sheet-root').innerHTML, /옷 종류 1개 · 찜 1개/);
  await reloaded.click({ action: 'import-legacy' });
  assert.deepEqual(reloaded.state().garments[0], edited);
  assert.equal(reloaded.state().garments.length, 2);
  assert.equal(reloaded.state().style, 'classic');
  assert.deepEqual(reloaded.state().saved, ['ms-1115031']);
  const again = await boot(reloaded.storage, reloaded.indexedDB);
  assert.doesNotMatch(again.nodes.get('app').innerHTML, /이전 버전에서 옷장이 바뀌었어요/);
  assert.equal((await again.app.store.read()).photos.size, 1);
});

test('a new legacy change does not resurrect garments or favorites deleted in this app; skipping persists', async () => {
  const original = { onboarded: true, gender: 'M', style: 'classic', owned: ['m-tee-white'], saved: ['ms-1115031'] };
  const page = await boot(new Map([['eoul:v1', JSON.stringify(original)]]));
  await page.click({ action: 'edit-garment', id: 'legacy_m-tee-white' });
  const deletion = { action: 'delete-garment' };
  await page.click(deletion); await page.click(deletion);
  await page.click({ action: 'save', id: 'ms-1115031' });
  page.storage.set('eoul:v1', JSON.stringify({ ...original, owned: ['m-tee-white', 'm-blazer'], saved: ['ms-1115031', 'ms-404474'] }));
  let next = await boot(page.storage, page.indexedDB);
  await next.click({ action: 'review-legacy' });
  assert.match(next.nodes.get('sheet-root').innerHTML, /옷 종류 1개 · 찜 1개/);
  await next.click({ action: 'import-legacy' });
  assert.deepEqual(next.state().garments.map((garment) => garment.slotId), ['m-blazer']);
  assert.deepEqual(next.state().saved, ['ms-404474']);
  next.storage.set('eoul:v1', JSON.stringify({ ...original, owned: ['m-tee-white', 'm-blazer', 'm-chino'] }));
  const skipped = await boot(next.storage, next.indexedDB);
  await skipped.click({ action: 'review-legacy' });
  await skipped.click({ action: 'ignore-legacy' });
  next = await boot(skipped.storage, skipped.indexedDB);
  assert.doesNotMatch(next.nodes.get('app').innerHTML, /이전 버전에서 옷장이 바뀌었어요/);
  assert.deepEqual(next.state().garments.map((garment) => garment.slotId), ['m-blazer']);
});
