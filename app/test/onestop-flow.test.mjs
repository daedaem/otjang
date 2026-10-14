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
import { makeGarment, newWardrobeState } from '../src/wardrobe.js';
import { createWardrobeStore, photoAsset, parseWardrobeBackup } from '../src/wardrobe-store.js';

const appRoot = fileURLToPath(new URL('../', import.meta.url));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'eoul-onestop-flow-'));
after(() => fs.rmSync(temp, { recursive: true, force: true }));
const output = path.join(temp, 'index.html');
execFileSync(process.execPath, [path.join(appRoot, 'tools/build.mjs'), '--out', output]);
const html = fs.readFileSync(output, 'utf8');
const script = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1].replace(
  /\n\}\)\(\);\s*$/,
  '\nglobalThis.testApp = { state: () => state, ready: appReady, store: wardrobeStore, candidateDraft: () => candidateDraft, draft: () => draft, beginCandidate, candidateSheet, saveCandidateDraft, journeySheet, setJourneyField, recordJourneyAction, renderSaved, chooseWardrobeBackup, chooseGarmentPhoto, saveGarmentDraft, recommendLooks, search, itemSheet };\n})();',
);

// Run the actual bundled callbacks against IDB. These DOM, photo-decoding and
// canvas doubles do not verify browser layout, camera quality or transactions at a shop.
async function boot(indexedDB = new IDBFactory(), storage = new Map()) {
  const urls = new Map();
  let nextURL = 0;
  class TestURL extends URL {
    static createObjectURL(blob) {
      const id = `blob:onestop/${++nextURL}`;
      urls.set(id, blob);
      return id;
    }
    static revokeObjectURL(id) {
      urls.delete(id);
    }
  }
  class TestImage {
    naturalWidth = 768;
    naturalHeight = 1024;
    decode() {
      return Promise.resolve();
    }
  }
  const nodes = new Map(['app', 'sheet-root', 'toast'].map((id) => [id, {
    innerHTML: '',
    classList: { add() {}, remove() {} },
    querySelector() { return null; },
    querySelectorAll() { return []; },
  }]));
  const listeners = new Map();
  const context = vm.createContext({
    indexedDB, Blob, crypto: globalThis.crypto, structuredClone, btoa, atob,
    Uint8Array, DataView, TextEncoder, TextDecoder, URL: TestURL,
    Image: TestImage, HTMLImageElement: TestImage,
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    },
    document: {
      getElementById: (id) => nodes.get(id) ?? null,
      addEventListener(type, fn) {
        listeners.set(type, [...(listeners.get(type) || []), fn]);
      },
      querySelector: () => null,
      querySelectorAll: () => [],
      body: { style: {}, append() {} },
      createElement(tag) {
        if (tag !== 'canvas') return { click() {}, remove() {} };
        let outputBlob;
        return {
          getContext: () => ({ fillRect() {}, drawImage(image) { outputBlob = urls.get(image.src); } }),
          toBlob: (callback) => callback(outputBlob),
        };
      },
    },
    window: { scrollTo() {} },
    CSS: { escape: (value) => value },
    setTimeout: () => 1, clearTimeout() {}, requestAnimationFrame: (fn) => fn(),
  });
  vm.runInContext(script, context);
  await context.testApp.ready;
  return {
    app: context.testApp, indexedDB, storage, nodes,
    state: () => JSON.parse(JSON.stringify(context.testApp.state())),
    async click(dataset) {
      for (const fn of listeners.get('click') || [])
        await fn({ target: { closest: () => ({ dataset }) }, preventDefault() {}, stopPropagation() {} });
    },
    input(id, value, journey = null) {
      for (const fn of listeners.get('input') || []) fn({ target: { id, value, dataset: { journey } } });
    },
    async change(id, value) {
      for (const fn of listeners.get('change') || []) await fn({ target: { id, value } });
    },
    submitQuery(value) {
      const form = { q: { value, blur() {} } };
      for (const fn of listeners.get('submit') || []) fn({ target: { closest: (selector) => selector.includes('ask') ? form : null }, preventDefault() {} });
    },
    close() { context.testApp.store.close(); },
  };
}

const product = PRODUCTS.find((p) => SLOT_BY_ID[p.slot]?.g === 'M' && p.color && p.colorSource !== 'image' && SLOT_BY_ID[p.slot].cat === 'top');
assert.ok(product, 'the integration fixture must be a real catalog garment');
const jpeg = (value = 7) => new Blob([new Uint8Array([255, 216, 255, value])], { type: 'image/jpeg' });
async function personalPage() {
  const indexedDB = new IDBFactory();
  const store = createWardrobeStore({ indexedDB });
  const first = await store.load();
  const asset = await photoAsset(jpeg());
  const owned = makeGarment({ id: 'g_existing', kind: 'shirt', slot: 'm-oxford', color: 'blue', gender: 'M',
    brand: '내 브랜드', label: '실제 기존 셔츠', photoId: asset.id, createdAt: '2026-10-14T00:00:00.000Z' });
  await store.commit({ ...newWardrobeState(), demo: false, demoSelected: [], garments: [owned] }, first.revision, [asset], first.epoch);
  store.close();
  return { page: await boot(indexedDB), owned, asset };
}

function plain(value) { return JSON.parse(JSON.stringify(value)); }
async function withMetadataQuota(callback) {
  const put = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (...args) {
    if (this.name === 'records') throw new DOMException('onestop metadata quota', 'QuotaExceededError');
    return put.apply(this, args);
  };
  try { await callback(); } finally { IDBObjectStore.prototype.put = put; }
}

async function stored(page) {
  const row = await page.app.store.read();
  return { revision: row.revision, state: plain(row.state), photos: row.photos };
}

async function assertOriginalPhoto(page, asset) {
  const snapshot = await stored(page);
  assert.equal(snapshot.photos.get(asset.id)?.size, asset.blob.size);
  assert.deepEqual(new Uint8Array(await snapshot.photos.get(asset.id).arrayBuffer()), new Uint8Array(await asset.blob.arrayBuffer()));
}

async function saveCatalogCandidate(page) {
  page.app.beginCandidate(product.id);
  assert.equal(page.app.candidateDraft().candidate.productId, product.id);
  await page.app.saveCandidateDraft();
  const journey = page.state().journeys.at(-1);
  assert.ok(journey, 'saving the actual candidate must create a durable journey');
  return journey;
}

test('an exact catalog URL starts the matching candidate, preserving checked price and source instead of creating ownership', async (t) => {
  const { page, owned, asset } = await personalPage();
  t.after(() => page.close());
  const before = await stored(page);
  page.app.beginCandidate(product.url);
  const draft = plain(page.app.candidateDraft());
  assert.equal(draft.candidate.productId, product.id);
  assert.equal(draft.candidate.name, product.name);
  assert.equal(draft.candidate.brand, product.brand);
  assert.equal(draft.candidate.price, product.price);
  assert.equal(draft.candidate.checkedAt, product.checkedAt);
  assert.equal(draft.candidate.source, 'catalog');
  assert.deepEqual(page.state().garments, [owned]);
  await page.app.saveCandidateDraft();
  const current = await stored(page);
  assert.equal(current.revision, before.revision + 1);
  assert.equal(current.state.journeys.length, 1);
  assert.equal(current.state.journeys[0].candidate.productId, product.id);
  assert.equal(current.state.journeys[0].stage, 'candidate');
  assert.equal(current.state.journeys[0].decision, null);
  assert.equal(current.state.journeys[0].garmentId, null);
  assert.deepEqual(current.state.garments, [owned]);
  await assertOriginalPhoto(page, asset);
});

test('the actual user URL outside the catalog retains original and canonical links without fabricating garment metadata', async (t) => {
  const { page, owned } = await personalPage();
  t.after(() => page.close());
  assert.equal(PRODUCTS.some((p) => p.id === 'ms-5755268'), false);
  const raw = 'https://www.musinsa.com/products/5755268?utm_source=personal#detail';
  page.app.beginCandidate(raw);
  const candidate = plain(page.app.candidateDraft().candidate);
  assert.equal(candidate.productId, 'ms-5755268');
  assert.equal(candidate.originalUrl, raw);
  assert.equal(candidate.url, 'https://www.musinsa.com/products/5755268');
  assert.equal(candidate.source, 'user');
  for (const key of ['slot', 'kind', 'color', 'colorSource', 'price', 'checkedAt']) assert.equal(candidate[key], null, key);
  assert.equal(candidate.brand, '');
  assert.equal(candidate.name, '');
  assert.equal(candidate.classificationConfirmed, false);
  await page.app.saveCandidateDraft();
  const journey = page.state().journeys.at(-1);
  assert.deepEqual(journey.candidate, candidate);
  assert.equal(journey.stage, 'candidate');
  assert.equal(journey.absence, 'unknown');
  assert.deepEqual(page.state().garments, [owned]);
  page.app.journeySheet(journey.id);
  assert.match(page.nodes.get('sheet-root').innerHTML, /확인|미확인/);
});

test('hold, skip and buy intentions preserve the wardrobe and never infer an order from a seller visit', async (t) => {
  const { page, owned, asset } = await personalPage();
  t.after(() => page.close());
  const journey = await saveCatalogCandidate(page);
  page.input('journey-reason', '같은 용도의 옷을 먼저 확인할 예정', journey.id);
  await page.app.setJourneyField(journey.id, 'absence', 'unknown');
  for (const action of ['hold', 'skip', 'buy']) {
    await page.app.recordJourneyAction(journey.id, action);
    const current = page.state().journeys.find((j) => j.id === journey.id);
    assert.equal(current.decision, action);
    assert.equal(current.stage, 'candidate');
    assert.equal(current.garmentId, null);
    assert.deepEqual(page.state().garments, [owned]);
  }
  page.app.journeySheet(journey.id);
  const sheet = page.nodes.get('sheet-root').innerHTML;
  assert.ok(sheet.includes(product.url), 'the seller link must address the selected product');
  const before = await stored(page);
  // A normal outbound anchor has no data-action state transition. Dispatching
  // the document handler must not turn that click into an order or purchase.
  await page.click({});
  assert.deepEqual((await stored(page)).state.journeys, before.state.journeys);
  assert.equal((await stored(page)).revision, before.revision);
  await assertOriginalPhoto(page, asset);
});

test('receipt creates one provisional garment atomically; keeping, wear and return control active ownership without deleting records', async (t) => {
  const { page, owned, asset } = await personalPage();
  t.after(() => page.close());
  const journey = await saveCatalogCandidate(page);
  page.input('journey-option', '판매처에서 확인한 옵션 M', journey.id);
  await page.app.recordJourneyAction(journey.id, 'ordered');
  const ordered = await stored(page);
  await page.app.recordJourneyAction(journey.id, 'received');
  const received = await stored(page);
  const current = received.state.journeys.find((j) => j.id === journey.id);
  assert.equal(received.revision, ordered.revision + 1, 'receipt and garment creation require exactly one acknowledged commit');
  assert.equal(current.stage, 'received');
  assert.equal(current.garmentId, `g_purchase_${journey.id}`);
  const garment = received.state.garments.find((g) => g.id === current.garmentId);
  assert.equal(garment.productId, product.id);
  assert.equal(garment.label, product.name);
  assert.equal(garment.color, product.color);
  assert.equal(garment.slot, product.slot);
  assert.equal(garment.brand, product.brand);
  assert.equal(page.state().closet.some((g) => g.id === current.garmentId), false, 'a received parcel is not yet a kept wardrobe item');
  const receiptSheet = page.nodes.get('sheet-root').innerHTML;
  await page.click({ action: 'open-own', id: current.garmentId });
  assert.ok(page.nodes.get('sheet-root').innerHTML !== receiptSheet, 'the received-journey link must open its retained garment record');
  assert.doesNotMatch(page.nodes.get('sheet-root').innerHTML, /data-action="search-with"|이 옷으로 만든 코디/);
  await page.app.recordJourneyAction(journey.id, 'received');
  assert.equal(page.state().garments.filter((g) => g.id === current.garmentId).length, 1);
  assert.equal(page.state().journeys.find((j) => j.id === journey.id).stage, 'received');
  await assert.rejects(page.app.recordJourneyAction(journey.id, 'worn'), /보유|착용|확정|수령/);
  assert.equal(page.state().journeys.find((j) => j.id === journey.id).wearCount, 0, 'wear cannot be recorded before keeping');
  await page.app.recordJourneyAction(journey.id, 'kept');
  assert.equal(page.state().closet.some((g) => g.id === current.garmentId), true);
  await page.click({ action: 'edit-own', id: current.garmentId });
  page.input('garment-label', '직접 이름과 사진을 바꾼 새 옷');
  await page.app.chooseGarmentPhoto(jpeg(11));
  await page.app.saveGarmentDraft();
  const edited = page.state().garments.find((g) => g.id === current.garmentId);
  assert.equal(edited.label, '직접 이름과 사진을 바꾼 새 옷');
  assert.ok(edited.photoId);
  await page.app.recordJourneyAction(journey.id, 'worn');
  assert.equal(page.state().journeys.find((j) => j.id === journey.id).wearCount, 1);
  await page.app.recordJourneyAction(journey.id, 'returned');
  assert.equal(page.state().journeys.find((j) => j.id === journey.id).stage, 'returned');
  assert.equal(page.state().closet.some((g) => g.id === current.garmentId), false);
  assert.equal(page.state().garments.some((g) => g.id === current.garmentId), true, 'return records preserve the original garment');
  assert.deepEqual(page.state().garments.find((g) => g.id === current.garmentId), edited, 'return preserves a personally edited received garment');
  const returnedPhoto = (await stored(page)).photos.get(edited.photoId);
  assert.deepEqual(new Uint8Array(await returnedPhoto.arrayBuffer()), new Uint8Array(await jpeg(11).arrayBuffer()));
  const returnSheet = page.nodes.get('sheet-root').innerHTML;
  await page.click({ action: 'open-own', id: current.garmentId });
  assert.ok(page.nodes.get('sheet-root').innerHTML !== returnSheet, 'the return-journey link must open its retained garment and photo');
  assert.match(page.nodes.get('sheet-root').innerHTML, /직접 이름과 사진을 바꾼 새 옷/);
  assert.doesNotMatch(page.nodes.get('sheet-root').innerHTML, /data-action="search-with"|이 옷으로 만든 코디/);
  assert.deepEqual(page.state().garments.find((g) => g.id === owned.id), owned);
  const returnedAnchor = page.app.search(page.app.state(), '어울리는 옷', { anchorItemId: current.garmentId });
  assert.equal(returnedAnchor.anchorItem, null);
  assert.ok(returnedAnchor.anchorUnavailable, 'a returned garment cannot silently become an active comparison anchor');
  await assertOriginalPhoto(page, asset);
});

test('journey metadata, personal photos and return exclusions survive reload and explicit backup restore', async (t) => {
  const { page, asset } = await personalPage();
  t.after(() => page.close());
  const journey = await saveCatalogCandidate(page);
  page.input('journey-reason', '구매 후 입어 보고 색이 달라 반품', journey.id);
  page.input('journey-option', 'M / 파랑', journey.id);
  await page.app.setJourneyField(journey.id, 'absence', 'absent');
  await page.app.recordJourneyAction(journey.id, 'buy');
  await page.app.recordJourneyAction(journey.id, 'ordered');
  await page.app.recordJourneyAction(journey.id, 'received');
  await page.app.recordJourneyAction(journey.id, 'kept');
  await page.app.recordJourneyAction(journey.id, 'worn');
  await page.app.recordJourneyAction(journey.id, 'returned');
  const expected = page.state();
  const file = await page.app.store.backup();
  const parsed = await parseWardrobeBackup(file);
  assert.deepEqual(parsed.state.journeys, expected.journeys);
  const reloaded = await boot(page.indexedDB, page.storage);
  t.after(() => reloaded.close());
  assert.deepEqual(reloaded.state().journeys, expected.journeys);
  assert.deepEqual(reloaded.state().garments, expected.garments);
  assert.deepEqual(reloaded.state().closet, expected.closet);
  await assertOriginalPhoto(reloaded, asset);
  const restored = await boot();
  t.after(() => restored.close());
  await restored.app.chooseWardrobeBackup(file);
  await restored.click({ action: 'restore-backup' });
  assert.deepEqual(restored.state().journeys, expected.journeys);
  assert.deepEqual(restored.state().garments, expected.garments);
  assert.deepEqual(restored.state().closet, expected.closet);
  await assertOriginalPhoto(restored, asset);
  assert.match(restored.app.renderSaved(), /구매|기록|반품/);
});

test('candidate metadata write failure preserves the draft and actual photo-backed wardrobe for a successful retry', async (t) => {
  const { page, owned, asset } = await personalPage();
  t.after(() => page.close());
  page.app.beginCandidate('https://www.musinsa.com/products/5755268');
  const beforeDraft = plain(page.app.candidateDraft().candidate);
  const before = await stored(page);
  await withMetadataQuota(() => page.app.saveCandidateDraft());
  assert.ok(page.app.candidateDraft(), 'failed candidate input must remain editable');
  assert.deepEqual(plain(page.app.candidateDraft().candidate), beforeDraft);
  assert.match(page.app.candidateDraft().error, /부족|저장|quota/i);
  const failed = await stored(page);
  assert.equal(failed.revision, before.revision);
  assert.deepEqual(failed.state.garments, [owned]);
  assert.deepEqual(failed.state.journeys, []);
  await assertOriginalPhoto(page, asset);
  await page.app.saveCandidateDraft();
  assert.equal(page.state().journeys.length, 1);
  assert.deepEqual(page.state().journeys[0].candidate, beforeDraft);
  assert.deepEqual(page.state().garments, [owned]);
});

test('receipt failure rolls back both the linked garment and journey stage; retry acknowledges them together', async (t) => {
  const { page, owned, asset } = await personalPage();
  t.after(() => page.close());
  const journey = await saveCatalogCandidate(page);
  await page.app.recordJourneyAction(journey.id, 'ordered');
  const before = await stored(page);
  await withMetadataQuota(() => assert.rejects(page.app.recordJourneyAction(journey.id, 'received'), (error) => error.name === 'QuotaExceededError'));
  const failed = await stored(page);
  assert.equal(failed.revision, before.revision);
  assert.deepEqual(failed.state.journeys, before.state.journeys);
  assert.deepEqual(failed.state.garments, [owned]);
  assert.equal(page.state().journeys.find((j) => j.id === journey.id).stage, 'ordered');
  await assertOriginalPhoto(page, asset);
  await page.app.recordJourneyAction(journey.id, 'received');
  const retried = await stored(page);
  assert.equal(retried.revision, before.revision + 1);
  assert.equal(retried.state.journeys.find((j) => j.id === journey.id).stage, 'received');
  assert.equal(retried.state.garments.filter((g) => g.id === `g_purchase_${journey.id}`).length, 1);
});

test('a stale candidate write does not overwrite another tab; preserved input can retry after reading the current wardrobe', async (t) => {
  const { page: first, owned, asset } = await personalPage();
  t.after(() => first.close());
  const second = await boot(first.indexedDB, first.storage);
  t.after(() => second.close());
  first.app.beginCandidate('https://www.musinsa.com/products/5755268');
  const staleCandidate = plain(first.app.candidateDraft().candidate);
  const liveJourney = await saveCatalogCandidate(second);
  const live = await stored(second);
  await first.app.saveCandidateDraft();
  assert.match(first.app.candidateDraft().error, /다른|바뀌|최신|충돌/);
  assert.deepEqual(plain(first.app.candidateDraft().candidate), staleCandidate);
  const afterRejected = await stored(second);
  assert.equal(afterRejected.revision, live.revision);
  assert.deepEqual(afterRejected.state.journeys, live.state.journeys);
  assert.deepEqual(afterRejected.state.garments, [owned]);
  await first.click({ action: 'reload-wardrobe' });
  assert.deepEqual(plain(first.app.candidateDraft().candidate), staleCandidate);
  await first.app.saveCandidateDraft();
  const ids = first.state().journeys.map((j) => j.id);
  assert.equal(ids.length, 2);
  assert.ok(ids.includes(liveJourney.id));
  assert.ok(first.state().journeys.some((j) => j.candidate.productId === 'ms-5755268'));
  assert.deepEqual(first.state().garments, [owned]);
  await assertOriginalPhoto(first, asset);
});

test('similar-owned comparison keeps the actual photo and ID; replacement removes the old garment only after explicit confirmation', async (t) => {
  const { page, owned, asset } = await personalPage();
  t.after(() => page.close());
  const matching = PRODUCTS.find((p) => p.slot === owned.slot && p.color === owned.color && p.colorSource !== 'image');
  assert.ok(matching, 'the catalog must provide an actual same-type and color comparison fixture');
  page.app.beginCandidate(matching.id);
  await page.app.saveCandidateDraft();
  const journey = page.state().journeys.at(-1);
  const sheet = page.nodes.get('sheet-root').innerHTML;
  assert.match(sheet, /실제 기존 셔츠/);
  assert.match(sheet, /blob:onestop\//, 'the comparison must render the actual stored photo');
  assert.ok(sheet.includes(`data-item="${owned.id}"`));
  await page.click({ action: 'journey-related', id: journey.id, item: owned.id });
  assert.deepEqual(page.state().journeys.find((j) => j.id === journey.id).relatedGarmentIds, [owned.id]);
  await page.app.setJourneyField(journey.id, 'intent', 'replace');
  await page.click({ action: 'journey-replacement', id: journey.id, item: owned.id });
  await page.app.recordJourneyAction(journey.id, 'ordered');
  await page.app.recordJourneyAction(journey.id, 'received');
  await page.app.recordJourneyAction(journey.id, 'kept');
  assert.equal(page.state().closet.some((g) => g.id === owned.id), true, 'choosing a replacement alone must not retire a real garment');
  await page.click({ action: 'journey-retire-review', id: journey.id });
  assert.match(page.nodes.get('sheet-root').innerHTML, /실제로|처분|보관/);
  assert.equal(page.state().closet.some((g) => g.id === owned.id), true);
  await page.click({ action: 'journey-field', id: journey.id, field: 'replacementConfirmed', value: 'true' });
  assert.equal(page.state().journeys.find((j) => j.id === journey.id).replacementConfirmed, true);
  assert.equal(page.state().closet.some((g) => g.id === owned.id), false);
  assert.deepEqual(page.state().garments.find((g) => g.id === owned.id), owned);
  await page.app.recordJourneyAction(journey.id, 'returned');
  assert.equal(page.state().closet.some((g) => g.id === owned.id), false, 'returning the new garment cannot undo a separately confirmed disposal');
  await assertOriginalPhoto(page, asset);
});

test('manual color or brand edits retain catalog price provenance; only a manually entered price receives a new user timestamp', async (t) => {
  const { page } = await personalPage();
  t.after(() => page.close());
  page.app.beginCandidate(product.id);
  const initial = plain(page.app.candidateDraft().candidate);
  const chosenColor = initial.color === 'blue' ? 'navy' : 'blue';
  await page.change('candidate-color', chosenColor);
  page.input('candidate-brand', '사용자가 확인한 브랜드');
  const edited = plain(page.app.candidateDraft().candidate);
  assert.equal(edited.color, chosenColor);
  assert.equal(edited.colorSource, 'user');
  assert.equal(edited.price, initial.price);
  assert.equal(edited.priceSource, 'catalog');
  assert.equal(edited.checkedAt, initial.checkedAt, 'confirming color must not renew a stale price');
  const manualPrice = initial.price + 1000;
  page.input('candidate-price', String(manualPrice));
  const repriced = plain(page.app.candidateDraft().candidate);
  assert.equal(repriced.price, manualPrice);
  assert.equal(repriced.priceSource, 'user');
  assert.match(repriced.checkedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  await page.app.saveCandidateDraft();
  const saved = page.state().journeys.at(-1).candidate;
  assert.equal(saved.priceSource, 'user');
  assert.equal(saved.price, manualPrice);
  assert.equal(saved.checkedAt, repriced.checkedAt);
  page.app.beginCandidate(product.id);
  const nextDraft = plain(page.app.candidateDraft().candidate);
  assert.equal(nextDraft.price, product.price);
  assert.equal(nextDraft.priceSource, 'catalog');
  assert.equal(nextDraft.checkedAt, product.checkedAt);
  assert.equal(nextDraft.color, product.color);
  assert.equal(nextDraft.brand, product.brand, 'editing a saved candidate must not mutate the catalog');
});

test('receipt ends demo mode while keeping the provisional garment inactive and safe through later photo editing and actual registration', async (t) => {
  const page = await boot();
  t.after(() => page.close());
  assert.equal(page.state().demo, true);
  const journey = await saveCatalogCandidate(page);
  await page.app.recordJourneyAction(journey.id, 'ordered');
  await page.app.recordJourneyAction(journey.id, 'received');
  const garmentId = page.state().journeys.find((j) => j.id === journey.id).garmentId;
  assert.equal(page.state().demo, false, 'the first actual receipt ends the example wardrobe');
  assert.equal(page.state().garments.length, 1);
  assert.equal(page.state().closet.some((g) => g.id === garmentId), false);
  await page.click({ action: 'edit-own', id: garmentId });
  page.input('garment-label', '받고 아직 결정하지 않은 옷');
  await page.app.chooseGarmentPhoto(jpeg(23));
  await page.app.saveGarmentDraft();
  const edited = page.state().garments.find((g) => g.id === garmentId);
  assert.ok(edited, 'editing the first provisional parcel cannot discard its existing record');
  assert.equal(edited.label, '받고 아직 결정하지 않은 옷');
  assert.ok(edited.photoId);
  assert.equal(page.state().demo, false);
  assert.equal(page.state().closet.some((g) => g.id === garmentId), false);
  await page.click({ action: 'add-start' });
  await page.click({ action: 'draft-kind', kind: 'shirt' });
  page.input('garment-label', '이전부터 가진 실제 셔츠');
  await page.app.saveGarmentDraft();
  assert.equal(page.state().garments.length, 2);
  assert.deepEqual(page.state().garments.find((g) => g.id === garmentId), edited);
  assert.equal(page.state().closet.length, 1);
  assert.equal(page.state().closet[0].label, '이전부터 가진 실제 셔츠');
  const savedPhoto = (await stored(page)).photos.get(edited.photoId);
  assert.deepEqual(new Uint8Array(await savedPhoto.arrayBuffer()), new Uint8Array(await jpeg(23).arrayBuffer()));
  await page.app.recordJourneyAction(journey.id, 'kept');
  assert.equal(page.state().closet.length, 2);
  assert.deepEqual(page.state().garments.find((g) => g.id === garmentId), edited);
});

test('regression: deleting a received record blocks false keep acknowledgment and requires explicit draft repair', async (t) => {
  const { page, owned, asset } = await personalPage();
  t.after(() => page.close());
  const journey = await saveCatalogCandidate(page);
  await page.app.recordJourneyAction(journey.id, 'ordered');
  await page.app.recordJourneyAction(journey.id, 'received');
  const garmentId = page.state().journeys.find((j) => j.id === journey.id).garmentId;
  await page.click({ action: 'open-own', id: garmentId });
  const deletion = { action: 'remove-own', id: garmentId };
  await page.click(deletion);
  assert.equal(page.state().garments.some((g) => g.id === garmentId), true, 'the first deletion click only arms the explicit action');
  await page.click(deletion);
  assert.equal(page.state().garments.some((g) => g.id === garmentId), false);
  const beforeKeep = await stored(page);
  await assert.rejects(page.app.recordJourneyAction(journey.id, 'kept'), /연결|등록|없/);
  const afterKeep = await stored(page);
  assert.equal(afterKeep.revision, beforeKeep.revision);
  assert.deepEqual(afterKeep.state, beforeKeep.state);
  assert.equal(page.state().journeys.find((j) => j.id === journey.id).stage, 'received');
  page.app.journeySheet(journey.id);
  assert.match(page.nodes.get('sheet-root').innerHTML, /연결했던 옷 기록이 없어요/);
  await page.click({ action: 'journey-receipt-repair', id: journey.id });
  const repair = plain(page.app.draft());
  assert.equal(repair.id, garmentId);
  assert.equal(repair.kind, SLOT_BY_ID[product.slot].shape);
  assert.equal(repair.slot, product.slot);
  assert.equal(repair.color, product.color);
  assert.equal(repair.productId, product.id);
  assert.equal(repair.label, product.name);
  assert.equal(repair.returnJourneyId, journey.id);
  assert.equal(page.state().garments.some((g) => g.id === garmentId), false, 'opening a seeded repair draft must not resurrect the deleted record');
  await page.app.saveGarmentDraft();
  assert.equal(page.state().garments.filter((g) => g.id === garmentId).length, 1);
  assert.equal(page.state().closet.some((g) => g.id === garmentId), false, 'explicitly re-registering the parcel does not itself confirm keeping it');
  await page.app.recordJourneyAction(journey.id, 'kept');
  assert.equal(page.state().closet.some((g) => g.id === garmentId), true);
  assert.deepEqual(page.state().garments.find((g) => g.id === owned.id), owned);
  await assertOriginalPhoto(page, asset);
});

test('regression: registering a catalog product again creates a new active ID and preserves its returned record and personal photo', async (t) => {
  const { page, asset } = await personalPage();
  t.after(() => page.close());
  const journey = await saveCatalogCandidate(page);
  await page.app.recordJourneyAction(journey.id, 'ordered');
  await page.app.recordJourneyAction(journey.id, 'received');
  await page.app.recordJourneyAction(journey.id, 'kept');
  const oldId = page.state().journeys.find((j) => j.id === journey.id).garmentId;
  await page.click({ action: 'edit-own', id: oldId });
  page.input('garment-label', '반품한 옷의 직접 남긴 기록');
  await page.app.chooseGarmentPhoto(jpeg(67));
  await page.app.saveGarmentDraft();
  const oldRecord = page.state().garments.find((g) => g.id === oldId);
  await page.app.recordJourneyAction(journey.id, 'returned');
  assert.equal(page.state().closet.some((g) => g.id === oldId), false);
  page.app.itemSheet(product.id);
  assert.ok(page.nodes.get('sheet-root').innerHTML.includes(`data-action="own-product" data-id="${product.id}"`));
  await page.click({ action: 'own-product', id: product.id });
  const sameProduct = page.state().garments.filter((g) => g.productId === product.id);
  assert.equal(sameProduct.length, 2);
  const newRecord = sameProduct.find((g) => g.id !== oldId);
  assert.ok(newRecord, 'a returned record cannot block an explicitly registered new garment');
  assert.equal(page.state().closet.some((g) => g.id === newRecord.id), true);
  assert.equal(page.state().closet.some((g) => g.id === oldId), false);
  assert.deepEqual(page.state().garments.find((g) => g.id === oldId), oldRecord);
  assert.equal(page.state().journeys.find((j) => j.id === journey.id).stage, 'returned');
  assert.equal(page.state().journeys.find((j) => j.id === journey.id).garmentId, oldId);
  const photo = (await stored(page)).photos.get(oldRecord.photoId);
  assert.deepEqual(new Uint8Array(await photo.arrayBuffer()), new Uint8Array(await jpeg(67).arrayBuffer()));
  await assertOriginalPhoto(page, asset);
});

test('regression: candidate metadata edit preserves unsaved option and reason, rebasing the following decision against the edited record', async (t) => {
  const { page, owned } = await personalPage();
  t.after(() => page.close());
  const journey = await saveCatalogCandidate(page);
  page.input('journey-option', '블랙 / M / 수량 1', journey.id);
  page.input('journey-reason', '실제 옷과 먼저 비교하고 가격을 다시 확인', journey.id);
  assert.equal(page.state().journeys.find((j) => j.id === journey.id).option, '');
  assert.equal(page.state().journeys.find((j) => j.id === journey.id).reason, '');
  await page.click({ action: 'candidate-edit', id: journey.id });
  page.input('candidate-name', '내가 직접 확인한 후보 상품 이름');
  await page.app.saveCandidateDraft();
  const edited = page.state().journeys.find((j) => j.id === journey.id);
  assert.equal(edited.candidate.name, '내가 직접 확인한 후보 상품 이름');
  assert.equal(edited.option, '블랙 / M / 수량 1');
  assert.equal(edited.reason, '실제 옷과 먼저 비교하고 가격을 다시 확인');
  assert.deepEqual(edited.history.map((entry) => entry.action), ['created']);
  await page.app.recordJourneyAction(journey.id, 'hold');
  const held = page.state().journeys.find((j) => j.id === journey.id);
  assert.equal(held.decision, 'hold');
  assert.equal(held.stage, 'candidate');
  assert.equal(held.option, edited.option);
  assert.equal(held.reason, edited.reason);
  assert.equal(held.candidate.name, edited.candidate.name);
  assert.deepEqual(held.history.map((entry) => entry.action), ['created', 'hold']);
  assert.deepEqual(page.state().garments, [owned]);
});

test('regression: a different-option fork retains source and outgoing original URL while keeping parent history and choices independent', async (t) => {
  const { page, owned } = await personalPage();
  t.after(() => page.close());
  const original = `${product.url}?color=black&size=M&utm_source=personal#detail`;
  page.app.beginCandidate(original);
  await page.app.saveCandidateDraft();
  const parentId = page.state().journeys.at(-1).id;
  page.input('journey-option', '블랙 / M', parentId);
  page.input('journey-reason', '원래 선택한 사이즈로 주문', parentId);
  await page.app.recordJourneyAction(parentId, 'buy');
  await page.app.recordJourneyAction(parentId, 'ordered');
  const parent = page.state().journeys.find((j) => j.id === parentId);
  assert.equal(parent.forkedFrom, null);
  await page.click({ action: 'journey-fork', id: parentId });
  const fork = page.state().journeys.find((j) => j.id !== parentId);
  assert.ok(fork);
  assert.equal(fork.forkedFrom, parentId);
  assert.equal(fork.stage, 'candidate');
  assert.equal(fork.decision, null);
  assert.equal(fork.garmentId, null);
  assert.equal(fork.wearCount, 0);
  assert.equal(fork.option, '', 'the user must confirm the different option independently');
  assert.deepEqual(fork.history.map((entry) => entry.action), ['created']);
  assert.deepEqual(fork.candidate, parent.candidate);
  assert.equal(fork.candidate.originalUrl, original);
  assert.equal(fork.candidate.url, product.url);
  assert.deepEqual(page.state().journeys.find((j) => j.id === parentId), parent);
  page.input('journey-option', '블랙 / L', fork.id);
  page.input('journey-reason', '다른 사이즈는 아직 보류', fork.id);
  await page.app.recordJourneyAction(fork.id, 'hold');
  const independent = page.state().journeys.find((j) => j.id === fork.id);
  assert.equal(independent.option, '블랙 / L');
  assert.equal(independent.decision, 'hold');
  assert.deepEqual(independent.history.map((entry) => entry.action), ['created', 'hold']);
  assert.deepEqual(page.state().journeys.find((j) => j.id === parentId), parent);
  page.app.journeySheet(fork.id);
  const sheet = page.nodes.get('sheet-root').innerHTML;
  assert.ok(sheet.includes(`href="${original.replaceAll('&', '&amp;')}"`), 'the outgoing link must retain original option/query context');
  assert.ok(sheet.includes(`data-action="open-journey" data-id="${parentId}"`));
  assert.deepEqual(page.state().garments, [owned]);
});

 test('pasted product links in search keep exact candidate identity and option references rather than showing unrelated search results', async () => {
  const page = await boot();
  page.submitQuery('https://www.musinsa.com/products/5755268?color=beige&size=M');
  const draft = page.app.candidateDraft();
  assert.equal(draft.candidate.productId, 'ms-5755268');
  assert.equal(draft.candidate.originalUrl, 'https://www.musinsa.com/products/5755268?color=beige&size=M');
  assert.equal(draft.candidate.slot, null);
  assert.equal(draft.candidate.name, '');
  assert.equal(draft.candidate.price, null);
  assert.equal(page.state().journeys.length, 0, 'pasting a link never saves or orders a product');
  assert.match(page.nodes.get('sheet-root').innerHTML, /아직 상품 정보는 자동으로 읽지 않았어요/);
  page.submitQuery('http://localhost/private');
  assert.equal(page.app.candidateDraft().candidate, null);
  assert.match(page.app.candidateDraft().error, /공개 판매처|https/);
  page.close();
});
