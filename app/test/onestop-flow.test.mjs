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
import { makeGarment, newWardrobeState, WARDROBE_SCHEMA } from '../src/wardrobe.js';
import { createWardrobeStore, photoAsset, parseWardrobeBackup } from '../src/wardrobe-store.js';
import { candidateFromProduct } from '../src/purchase-candidate.js';
import { productEligible } from '../src/catalog-policy.js';

const appRoot = fileURLToPath(new URL('../', import.meta.url));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'eoul-onestop-flow-'));
after(() => fs.rmSync(temp, { recursive: true, force: true }));
const output = path.join(temp, 'index.html');
execFileSync(process.execPath, [path.join(appRoot, 'tools/build.mjs'), '--out', output]);
const html = fs.readFileSync(output, 'utf8');
const script = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1].replace(
  /\n\}\)\(\);\s*$/,
  '\nglobalThis.testApp = { state: () => state, ready: appReady, store: wardrobeStore, candidateDraft: () => candidateDraft, draft: () => draft, pendingOptionChange: () => pendingOptionChange, candidateGarmentReview: () => candidateGarmentReview, beginCandidateGarmentReview, applyCandidateGarmentReview, beginCandidate, compareCatalogProduct, applySnapshot, candidateSheet, saveCandidateDraft, journeySheet, setJourneyField, recordJourneyAction, renderSaved, chooseWardrobeBackup, chooseGarmentPhoto, saveGarmentDraft, recommendLooks, search, itemSheet };\n})();',
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
  const sheetHistory = [];
  let sheetMarkup = '';
  Object.defineProperty(nodes.get('sheet-root'), 'innerHTML', {
    get: () => sheetMarkup,
    set(value) { sheetMarkup = value; sheetHistory.push(value); },
  });
  let bodyMarkup = '', nextBodyReaction = null;
  Object.defineProperty(nodes.get('app'), 'innerHTML', {
    get: () => bodyMarkup,
    set(value) {
      bodyMarkup = value;
      const reaction = nextBodyReaction;
      nextBodyReaction = null;
      // Like a DOM mutation observer: queued during the actual tab render,
      // before the awaiting comparison callback resumes.
      if (reaction) Promise.resolve().then(reaction);
    },
  });
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
    app: context.testApp, indexedDB, storage, nodes, sheetHistory,
    afterNextBodyRender(callback) { nextBodyReaction = callback; },
    state: () => JSON.parse(JSON.stringify(context.testApp.state())),
    async click(dataset) {
      for (const fn of listeners.get('click') || [])
        await fn({ target: { closest: () => ({ dataset }) }, preventDefault() {}, stopPropagation() {} });
    },
    input(id, value, journey = null) {
      for (const fn of listeners.get('input') || []) fn({ target: { id, value, dataset: { journey } } });
    },
    async change(id, value, targetProperties = {}) {
      for (const fn of listeners.get('change') || []) await fn({ target: { id, value, ...targetProperties } });
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
async function personalPage(extraGarments = []) {
  const indexedDB = new IDBFactory();
  const store = createWardrobeStore({ indexedDB });
  const first = await store.load();
  const asset = await photoAsset(jpeg());
  const owned = makeGarment({ id: 'g_existing', kind: 'shirt', slot: 'm-oxford', color: 'blue', gender: 'M',
    brand: '내 브랜드', label: '실제 기존 셔츠', photoId: asset.id, createdAt: '2026-10-14T00:00:00.000Z' });
  await store.commit({ ...newWardrobeState(), demo: false, demoSelected: [], garments: [owned, ...extraGarments] }, first.revision, [asset], first.epoch);
  store.close();
  return { page: await boot(indexedDB), owned, asset };
}

function plain(value) { return JSON.parse(JSON.stringify(value)); }
function hasSheetAction(page, action, attributes = {}) {
  const tags = page.nodes.get('sheet-root').innerHTML.match(/<(?:button|a)\b[^>]*>/g) || [];
  return tags.some((tag) => tag.includes(`data-action="${action}"`) &&
    Object.entries(attributes).every(([name, value]) => tag.includes(`data-${name}="${value}"`)));
}
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

async function saveCatalogCandidate(page, selectedProduct = product) {
  await page.click({ action: 'candidate-product', id: selectedProduct.id });
  const journey = page.state().journeys.at(-1);
  assert.ok(journey, 'saving the actual candidate must create a durable journey');
  return journey;
}

test('one catalog compare tap durably opens the exact product comparison without a metadata form or inferred ownership', async (t) => {
  const { page, owned, asset } = await personalPage();
  t.after(() => page.close());
  const before = await stored(page);
  await page.click({ action: 'candidate-product', id: product.id });
  const saved = await stored(page);
  assert.equal(saved.revision, before.revision + 1);
  assert.equal(saved.state.journeys.length, 1);
  assert.deepEqual(saved.state.journeys[0].candidate, candidateFromProduct(product));
  assert.deepEqual([saved.state.journeys[0].stage, saved.state.journeys[0].decision, saved.state.journeys[0].option], ['candidate', null, '']);
  assert.deepEqual(saved.state.garments, [owned]);
  assert.equal(page.app.candidateDraft(), null);
  assert.match(page.nodes.get('sheet-root').innerHTML, /내 옷을 기준으로 비교/);
  assert.ok(page.sheetHistory.every((markup) => !markup.includes('id="candidate-name"') && !markup.includes('data-action="candidate-save"')),
    'the metadata editor never flashes on the successful one-tap path');
  await assertOriginalPhoto(page, asset);
});

test('catalog comparison keeps photo-guessed colour provenance unconfirmed', async (t) => {
  const { page } = await personalPage();
  t.after(() => page.close());
  const selected = PRODUCTS.find((entry) => entry.color && entry.colorSource === 'image' && productEligible(entry));
  assert.ok(selected, 'a real catalog image-curated colour is required for this regression');
  await page.click({ action: 'candidate-product', id: selected.id });
  const candidate = page.state().journeys[0].candidate;
  assert.deepEqual(candidate, candidateFromProduct(selected));
  assert.equal(candidate.colorSource, 'image', 'one tap must not pretend the person confirmed the photographed colour');
});

test('an in-flight catalog compare ignores double taps and reopening the empty-option candidate preserves its record', async (t) => {
  const { page } = await personalPage();
  t.after(() => page.close());
  const commit = page.app.store.commit;
  let release, started;
  const gate = new Promise((resolve) => { release = resolve; });
  const entered = new Promise((resolve) => { started = resolve; });
  page.app.store.commit = async (...args) => { started(); await gate; return commit(...args); };
  const first = page.click({ action: 'candidate-product', id: product.id });
  await entered;
  await page.click({ action: 'candidate-product', id: product.id });
  assert.equal(page.state().journeys.length, 0, 'nothing is shown as saved before the durable write');
  release();
  await first;
  page.app.store.commit = commit;
  assert.equal(page.state().journeys.length, 1);
  const id = page.state().journeys[0].id;
  await page.click({ action: 'candidate-edit', id });
  page.input('candidate-name', '직접 정정한 상품명');
  await page.app.saveCandidateDraft();
  await page.app.recordJourneyAction(id, 'hold');
  const before = await stored(page);
  await page.click({ action: 'candidate-product', id: product.id });
  assert.deepEqual(await stored(page), before, 'reopening does not rewrite confirmed metadata, decision, history, photos or revision');
  assert.match(page.nodes.get('sheet-root').innerHTML, /직접 정정한 상품명/);
});

for (const scenario of ['ordered', 'option']) {
  test(`catalog compare does not reuse an existing ${scenario} unit`, async (t) => {
    const { page } = await personalPage();
    t.after(() => page.close());
    const original = await saveCatalogCandidate(page);
    if (scenario === 'ordered') await page.app.recordJourneyAction(original.id, 'ordered');
    else {
      page.input('journey-option', '직접 고른 M', original.id);
      await page.app.recordJourneyAction(original.id, 'note');
    }
    const before = page.state().journeys[0];
    await page.click({ action: 'candidate-product', id: product.id });
    assert.equal(page.state().journeys.length, 2);
    assert.deepEqual(page.state().journeys[0], before);
    assert.notEqual(page.state().journeys[1].id, original.id);
    assert.equal(page.state().journeys[1].stage, 'candidate');
    assert.equal(page.state().journeys[1].option, '');
  });
}

test('failed one-tap comparison keeps the exact candidate in an editable retry form without a partial record', async (t) => {
  const { page, owned, asset } = await personalPage();
  t.after(() => page.close());
  const before = await stored(page);
  await withMetadataQuota(() => page.click({ action: 'candidate-product', id: product.id }));
  assert.deepEqual(await stored(page), before);
  assert.deepEqual(plain(page.app.candidateDraft().candidate), candidateFromProduct(product));
  assert.equal(page.app.candidateDraft().saving, false);
  assert.match(page.nodes.get('sheet-root').innerHTML, /id="candidate-name"/);
  assert.match(page.app.candidateDraft().error, /부족|저장|quota/i);
  page.input('candidate-name', '다시 시도할 상품명');
  await page.click({ action: 'candidate-save' });
  const saved = await stored(page);
  assert.equal(saved.revision, before.revision + 1);
  assert.equal(saved.state.journeys.length, 1);
  assert.equal(saved.state.journeys[0].candidate.name, '다시 시도할 상품명');
  assert.deepEqual(saved.state.garments, [owned]);
  await assertOriginalPhoto(page, asset);
});

test('a delayed catalog comparison cannot reopen its result over a newer snapshot and settings screen', async (t) => {
  const { page } = await personalPage();
  t.after(() => page.close());
  const commit = page.app.store.commit;
  let release, started;
  const gate = new Promise((resolve) => { release = resolve; });
  const entered = new Promise((resolve) => { started = resolve; });
  page.app.store.commit = async (...args) => { started(); await gate; return commit(...args); };
  const saving = page.click({ action: 'candidate-product', id: product.id });
  await entered;
  page.app.applySnapshot(await page.app.store.read());
  await page.click({ action: 'open-settings' });
  const currentSheet = page.nodes.get('sheet-root').innerHTML;
  release();
  await saving;
  assert.equal(page.nodes.get('sheet-root').innerHTML, currentSheet);
  assert.equal(page.app.candidateDraft(), null, 'no stale editor can be saved into the replacement context');
});

for (const branch of ['reuse', 'new']) {
  for (const interrupt of ['sheet', 'snapshot', 'account']) {
    test(`the final tab await of ${branch} catalog comparison preserves a newer ${interrupt} context`, async (t) => {
      const { page } = await personalPage();
      t.after(() => page.close());
      if (branch === 'reuse') await saveCatalogCandidate(page);
      await page.click({ action: 'close-sheet' });
      await page.click({ action: 'open-settings' });
      const before = await page.app.store.read();
      let expectedSheet = page.nodes.get('sheet-root').innerHTML;
      let reacted = false;
      page.afterNextBodyRender(() => {
        reacted = true;
        if (interrupt === 'sheet') {
          page.click({ action: 'open-profile' });
          expectedSheet = page.nodes.get('sheet-root').innerHTML;
        } else if (interrupt === 'snapshot') page.app.applySnapshot(before);
        else page.storage.set('eoul:account', JSON.stringify({ v: 1, server: null, email: 'another@example.com', token: 'changed-in-another-tab' }));
      });
      await page.click({ action: 'candidate-product', id: product.id });
      assert.equal(reacted, true, 'the interruption occurs at the final tab render, rather than during durable saving');
      assert.equal(page.nodes.get('sheet-root').innerHTML, expectedSheet, 'the old comparison never closes or replaces the current dialog');
      assert.equal(page.app.candidateDraft(), null);
      const committed = await stored(page);
      assert.equal(committed.state.journeys.length, 1);
      if (branch === 'reuse') {
        assert.equal(committed.revision, before.revision);
        assert.deepEqual(committed.state, plain(before.state), 'reusing a comparison remains a read-only action');
      } else assert.equal(committed.revision, before.revision + 1, 'the successful durable save remains committed when only its late UI is discarded');
    });
  }
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

test('buy and hold clicks show the durably saved decision and never show a rejected change as saved', async (t) => {
  const { page, owned } = await personalPage();
  t.after(() => page.close());
  const journey = await saveCatalogCandidate(page);
  const button = (view, action) => {
    const tag = view.nodes.get('sheet-root').innerHTML.match(new RegExp(`<button\\b[^>]*data-action="journey-action"[^>]*data-step="${action}"[^>]*>[^<]*<\\/button>`))?.[0];
    assert.ok(tag, `${action} must remain available as a decision`);
    return tag;
  };
  const assertDecision = (view, action, label) => {
    for (const step of ['buy', 'hold', 'skip']) {
      const tag = button(view, step);
      assert.match(tag, new RegExp(`aria-pressed="${step === action}"`));
      assert.match(tag, /class="[^"]*\bsecondary\b/, 'saved decisions leave the primary action to the seller link');
      if (step === action) {
        assert.match(tag, new RegExp(`>${label} ✓<`));
      }
    }
    const footer = view.nodes.get('sheet-root').innerHTML.split('<div class="purchase-decisions"')[1];
    assert.match(footer, new RegExp(`<p class="fine" role="status"><strong>현재 기록: ${label} · 저장됨</strong>`));
    assert.match(footer, /주문·결제는 실행하지 않아요/);
    if (action === 'buy') {
      assert.match(footer, /<a class="btn"[^>]*target="_blank"[^>]*>원래 판매처에서 확인/);
      assert.ok(footer.includes(product.url));
    } else assert.doesNotMatch(footer, /<a\b/);
  };
  for (const step of ['buy', 'hold', 'skip']) assert.match(button(page, step), /aria-pressed="false"/);
  assert.doesNotMatch(button(page, 'buy'), /class="[^"]*\bsecondary\b/, 'buy remains the initial primary action without claiming it is selected');
  assert.doesNotMatch(page.nodes.get('sheet-root').innerHTML, /현재 기록:.*저장됨/);

  await page.click({ action: 'journey-action', id: journey.id, step: 'buy' });
  const bought = await stored(page);
  assert.equal(bought.state.journeys.find((row) => row.id === journey.id).decision, 'buy');
  assertDecision(page, 'buy', '사기로 함');
  const sellerLinks = (page.nodes.get('sheet-root').innerHTML.match(/<a\b[^>]*>원래 판매처에서 확인/g) || []);
  assert.equal(sellerLinks.length, 2);
  assert.match(sellerLinks[0], /class="btn secondary candidate-compare"/, 'the body seller link yields priority to the sticky footer after choosing buy');
  assert.match(sellerLinks[1], /class="btn"/);

  await withMetadataQuota(() => page.click({ action: 'journey-action', id: journey.id, step: 'hold' }));
  const rejected = await stored(page);
  assert.equal(rejected.revision, bought.revision);
  assert.deepEqual(rejected.state, bought.state);
  assertDecision(page, 'buy', '사기로 함');

  await page.click({ action: 'journey-action', id: journey.id, step: 'hold' });
  const held = await stored(page);
  const record = held.state.journeys.find((row) => row.id === journey.id);
  assert.equal(held.revision, bought.revision + 1);
  assert.equal(record.decision, 'hold');
  assert.equal(record.stage, 'candidate');
  assert.deepEqual(held.state.garments, [owned]);
  assertDecision(page, 'hold', '보류');

  const reloaded = await boot(page.indexedDB);
  t.after(() => reloaded.close());
  reloaded.app.journeySheet(journey.id);
  assertDecision(reloaded, 'hold', '보류');
});

test('repeating a saved decision is idempotent and pending option or reason edits create only one note', async (t) => {
  const { page } = await personalPage();
  t.after(() => page.close());
  const journey = await saveCatalogCandidate(page);
  const click = (step) => page.click({ action: 'journey-action', id: journey.id, step });
  for (const decision of ['buy', 'hold', 'skip']) {
    await click(decision);
    const saved = await stored(page);
    const record = saved.state.journeys.find((row) => row.id === journey.id);
    assert.equal(record.decision, decision);
    assert.equal(record.history.at(-1).action, decision);
    await click(decision);
    const repeated = await stored(page);
    assert.equal(repeated.revision, saved.revision, `${decision} must not write another identical decision`);
    assert.deepEqual(repeated.state, saved.state);

    page.input('journey-option', `직접 확인한 ${decision} 옵션`, journey.id);
    page.input('journey-reason', `${decision} 판단을 유지하고 이유만 보완`, journey.id);
    await click(decision);
    const noted = await stored(page);
    const updated = noted.state.journeys.find((row) => row.id === journey.id);
    assert.equal(noted.revision, saved.revision + 1);
    assert.equal(updated.decision, decision);
    assert.equal(updated.stage, 'candidate');
    assert.equal(updated.option, `직접 확인한 ${decision} 옵션`);
    assert.equal(updated.reason, `${decision} 판단을 유지하고 이유만 보완`);
    assert.equal(updated.history.length, record.history.length + 1);
    assert.equal(updated.history.at(-1).action, 'note', 'edited inputs are notes, not duplicate decision events');
    await click(decision);
    const unchanged = await stored(page);
    assert.equal(unchanged.revision, noted.revision);
    assert.deepEqual(unchanged.state, noted.state);
  }
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
  const journey = await saveCatalogCandidate(page, matching);
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
  const journey = await saveCatalogCandidate(page);
  await page.click({ action: 'candidate-edit', id: journey.id });
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
  page.app.beginCandidate(product.url);
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
  page.app.beginCandidate(product.id);
  await page.app.saveCandidateDraft();
  const journey = page.state().journeys.at(-1);
  assert.ok(journey, 'an explicitly saved candidate remains available before owning clothes');
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
  assert.equal(page.state().garments.filter((g) => g.productId === product.id).length, 1, 're-registration selection does not create a new active garment');
  assert.ok(page.nodes.get('sheet-root').innerHTML.includes(`data-action="owned-catalog-confirm" data-id="${product.id}"`));
  await page.click({ action: 'owned-catalog-color', color: product.color });
  await page.click({ action: 'owned-catalog-confirm', id: product.id });
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
  assert.deepEqual(edited.history.map((entry) => entry.action), ['created', 'candidate-edit']);
  await page.app.recordJourneyAction(journey.id, 'hold');
  const held = page.state().journeys.find((j) => j.id === journey.id);
  assert.equal(held.decision, 'hold');
  assert.equal(held.stage, 'candidate');
  assert.equal(held.option, edited.option);
  assert.equal(held.reason, edited.reason);
  assert.equal(held.candidate.name, edited.candidate.name);
  assert.deepEqual(held.history.map((entry) => entry.action), ['created', 'candidate-edit', 'hold']);
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

test('purchase improvements: checking an existing garment preserves pending option and reason in the same commit', async (t) => {
  const { page, owned, asset } = await personalPage();
  t.after(() => page.close());
  const matching = PRODUCTS.find((p) => p.slot === owned.slot && p.color === owned.color && p.colorSource !== 'image');
  assert.ok(matching);
  const journey = await saveCatalogCandidate(page, matching);
  page.input('journey-option', '블루 / M', journey.id);
  page.input('journey-reason', '현재 셔츠 상태를 확인하고 결정', journey.id);
  assert.ok(hasSheetAction(page, 'journey-check-own', { id: journey.id, item: owned.id }));
  await page.click({ action: 'journey-check-own', id: journey.id, item: owned.id });
  page.input('garment-label', '직접 확인한 기존 셔츠');
  const before = await stored(page);
  await page.app.saveGarmentDraft();
  const after = await stored(page);
  const updated = after.state.journeys.find((j) => j.id === journey.id);
  assert.equal(after.revision, before.revision + 1, 'garment confirmation and outgoing journey inputs are one acknowledged write');
  assert.equal(updated.option, '블루 / M');
  assert.equal(updated.reason, '현재 셔츠 상태를 확인하고 결정');
  assert.ok(updated.relatedGarmentIds.includes(owned.id));
  assert.equal(updated.history.at(-1).details.option, updated.option);
  assert.equal(updated.history.at(-1).details.reason, updated.reason);
  assert.equal(after.state.garments.find((g) => g.id === owned.id).label, '직접 확인한 기존 셔츠');
  assert.equal(after.state.garments.find((g) => g.id === owned.id).photoId, owned.photoId);
  assert.match(page.nodes.get('sheet-root').innerHTML, /현재 셔츠 상태를 확인하고 결정/);
  await assertOriginalPhoto(page, asset);
});

test('purchase improvements: adding a photo-backed owned garment rolls back journey inputs and photo on quota failure, then retries atomically', async (t) => {
  const { page, owned, asset } = await personalPage();
  t.after(() => page.close());
  const journey = await saveCatalogCandidate(page);
  page.input('journey-option', '판매처 옵션 / M', journey.id);
  page.input('journey-reason', '이미 가진 옷을 추가한 뒤 다시 비교', journey.id);
  await page.click({ action: 'journey-add-own', id: journey.id });
  page.input('garment-label', '원래부터 가진 실제 옷');
  await page.app.chooseGarmentPhoto(jpeg(79));
  const draftBefore = plain(page.app.draft());
  assert.ok(draftBefore.asset.id);
  const before = await stored(page);
  const beforeView = page.state();
  await withMetadataQuota(() => page.app.saveGarmentDraft());
  const failed = await stored(page);
  assert.equal(failed.revision, before.revision);
  assert.deepEqual(failed.state, before.state);
  assert.deepEqual(page.state(), beforeView, 'failed confirmation leaves the visible wardrobe state unchanged');
  assert.deepEqual([...failed.photos.keys()].sort(), [...before.photos.keys()].sort());
  assert.equal(failed.photos.has(draftBefore.asset.id), false, 'a rejected metadata transaction cannot leave its new personal photo behind');
  assert.equal(page.app.draft().label, draftBefore.label);
  assert.equal(page.app.draft().asset.id, draftBefore.asset.id);
  assert.deepEqual(new Uint8Array(await page.app.draft().asset.blob.arrayBuffer()), new Uint8Array(await jpeg(79).arrayBuffer()));
  assert.match(page.app.draft().error, /부족|저장|quota/i);
  await assertOriginalPhoto(page, asset);
  await page.app.saveGarmentDraft();
  const after = await stored(page);
  const added = after.state.garments.find((g) => g.id === draftBefore.id);
  const updated = after.state.journeys.find((j) => j.id === journey.id);
  assert.equal(after.revision, before.revision + 1);
  assert.equal(added.label, draftBefore.label);
  assert.equal(added.photoId, draftBefore.asset.id);
  assert.equal(updated.option, '판매처 옵션 / M');
  assert.equal(updated.reason, '이미 가진 옷을 추가한 뒤 다시 비교');
  assert.ok(updated.relatedGarmentIds.includes(added.id));
  assert.deepEqual(after.state.garments.find((g) => g.id === owned.id), owned);
  assert.deepEqual(new Uint8Array(await after.photos.get(added.photoId).arrayBuffer()), new Uint8Array(await jpeg(79).arrayBuffer()));
  await assertOriginalPhoto(page, asset);
});

test('purchase improvements: a stale journey during owned-garment confirmation preserves the draft and commits neither record', async (t) => {
  const { page: first, owned, asset } = await personalPage();
  t.after(() => first.close());
  const matching = PRODUCTS.find((p) => p.slot === owned.slot && p.color === owned.color && p.colorSource !== 'image');
  const journey = await saveCatalogCandidate(first, matching);
  const second = await boot(first.indexedDB, first.storage);
  t.after(() => second.close());
  first.input('journey-option', '내 초안 / M', journey.id);
  first.input('journey-reason', '기존 셔츠 확인 중인 이유', journey.id);
  await first.click({ action: 'journey-check-own', id: journey.id, item: owned.id });
  first.input('garment-label', '저장되지 않아야 하는 셔츠 수정');
  await second.app.setJourneyField(journey.id, 'absence', 'present');
  const live = await stored(second);
  await first.app.saveGarmentDraft();
  const failed = await stored(second);
  assert.equal(failed.revision, live.revision);
  assert.deepEqual(failed.state, live.state);
  assert.deepEqual(failed.state.garments.find((g) => g.id === owned.id), owned);
  assert.equal(first.app.draft().label, '저장되지 않아야 하는 셔츠 수정');
  assert.match(first.app.draft().error, /다른|바뀌|최신|충돌/);
  first.app.journeySheet(journey.id);
  assert.match(first.nodes.get('sheet-root').innerHTML, /내 초안 \/ M/);
  assert.match(first.nodes.get('sheet-root').innerHTML, /기존 셔츠 확인 중인 이유/);
  await assertOriginalPhoto(second, asset);
});

test('purchase improvements: replacement selection includes a differently colored active garment and survives candidate color editing', async (t) => {
  const otherShirt = makeGarment({ id: 'g_other_shirt', kind: 'shirt', slot: 'm-flannel', color: 'green', gender: 'M', label: '기존 체크 셔츠' });
  const { page, owned, asset } = await personalPage([otherShirt]);
  t.after(() => page.close());
  const differentColor = PRODUCTS.find((p) => p.slot === owned.slot && p.color !== owned.color && p.color && p.colorSource !== 'image');
  assert.ok(differentColor);
  const journey = await saveCatalogCandidate(page, differentColor);
  await page.app.setJourneyField(journey.id, 'intent', 'replace');
  assert.ok(hasSheetAction(page, 'journey-replacement', { id: journey.id, item: owned.id }), 'same-kind owned garments remain selectable even when the candidate has another color');
  assert.ok(hasSheetAction(page, 'journey-replacement', { id: journey.id, item: otherShirt.id }), 'a different confirmed subtype of the same garment kind is also selectable for replacement');
  await page.click({ action: 'journey-replacement', id: journey.id, item: owned.id });
  await page.click({ action: 'candidate-edit', id: journey.id });
  await page.change('candidate-color', 'black');
  await page.app.saveCandidateDraft();
  const edited = page.state().journeys.find((j) => j.id === journey.id);
  assert.equal(edited.replacementGarmentId, owned.id);
  assert.equal(edited.replacementConfirmed, false);
  assert.equal(page.state().closet.some((g) => g.id === owned.id), true);
  await page.app.recordJourneyAction(journey.id, 'ordered');
  await page.app.recordJourneyAction(journey.id, 'received');
  await page.app.recordJourneyAction(journey.id, 'kept');
  assert.equal(page.state().closet.some((g) => g.id === owned.id), true);
  await page.click({ action: 'journey-retire-review', id: journey.id });
  await page.click({ action: 'journey-field', id: journey.id, field: 'replacementConfirmed', value: 'true' });
  assert.equal(page.state().closet.some((g) => g.id === owned.id), false);
  assert.deepEqual(page.state().garments.find((g) => g.id === owned.id), owned);
  await assertOriginalPhoto(page, asset);
});

test('purchase improvements: repairing a received garment preserves pending notes without treating repair as a keep decision', async (t) => {
  const { page, owned, asset } = await personalPage();
  t.after(() => page.close());
  const journey = await saveCatalogCandidate(page);
  page.input('journey-option', '처음 받은 옵션 확인', journey.id);
  await page.app.recordJourneyAction(journey.id, 'ordered');
  await page.app.recordJourneyAction(journey.id, 'received');
  const garmentId = page.state().journeys.find((j) => j.id === journey.id).garmentId;
  await page.click({ action: 'open-own', id: garmentId });
  const deletion = { action: 'remove-own', id: garmentId };
  await page.click(deletion);
  await page.click(deletion);
  assert.equal(page.state().garments.some((g) => g.id === garmentId), false);
  page.app.journeySheet(journey.id);
  page.input('journey-option', '처음 받은 옵션 확인', journey.id);
  page.input('journey-reason', '실제 받은 옷을 다시 확인해 연결', journey.id);
  await page.click({ action: 'journey-receipt-repair', id: journey.id });
  await page.app.chooseGarmentPhoto(jpeg(83));
  const repairedPhotoId = page.app.draft().asset.id;
  const before = await stored(page);
  await page.app.saveGarmentDraft();
  const after = await stored(page);
  const updated = after.state.journeys.find((j) => j.id === journey.id);
  assert.equal(after.revision, before.revision + 1);
  assert.equal(updated.stage, 'received');
  assert.equal(updated.garmentId, garmentId);
  assert.equal(updated.option, '처음 받은 옵션 확인');
  assert.equal(updated.reason, '실제 받은 옷을 다시 확인해 연결');
  assert.equal(after.state.garments.find((g) => g.id === garmentId).photoId, repairedPhotoId);
  assert.equal(page.state().closet.some((g) => g.id === garmentId), false);
  assert.deepEqual(after.state.garments.find((g) => g.id === owned.id), owned);
  assert.deepEqual(new Uint8Array(await after.photos.get(repairedPhotoId).arrayBuffer()), new Uint8Array(await jpeg(83).arrayBuffer()));
  await assertOriginalPhoto(page, asset);
});

test('purchase improvements: hold, buy, wear and return preserve their own reasons and feedback through later notes, reload and backup', async (t) => {
  const { page, asset } = await personalPage();
  t.after(() => page.close());
  const journey = await saveCatalogCandidate(page);
  page.input('journey-reason', '비슷한 옷이 있어서 먼저 보류', journey.id);
  await page.app.recordJourneyAction(journey.id, 'hold');
  const held = plain(page.state().journeys.find((j) => j.id === journey.id).history.at(-1));
  page.input('journey-option', '직접 확인한 M', journey.id);
  page.input('journey-reason', '기존 옷이 낡아 새 옷으로 교체', journey.id);
  await page.app.recordJourneyAction(journey.id, 'buy');
  const bought = plain(page.state().journeys.find((j) => j.id === journey.id).history.at(-1));
  await page.app.recordJourneyAction(journey.id, 'ordered');
  await page.app.recordJourneyAction(journey.id, 'received');
  await page.app.recordJourneyAction(journey.id, 'kept');
  await page.app.setJourneyField(journey.id, 'feedback', { fit: 'small', returnReason: null });
  page.input('journey-reason', '입어 보니 어깨가 좁음', journey.id);
  await page.app.recordJourneyAction(journey.id, 'worn');
  const worn = plain(page.state().journeys.find((j) => j.id === journey.id).history.at(-1));
  await page.app.setJourneyField(journey.id, 'feedback', { fit: 'small', returnReason: 'size' });
  page.input('journey-reason', '사이즈가 맞지 않아 판매처에 반품', journey.id);
  await page.app.recordJourneyAction(journey.id, 'returned');
  const returned = plain(page.state().journeys.find((j) => j.id === journey.id).history.at(-1));
  page.input('journey-reason', '다음에는 한 사이즈 크게 확인', journey.id);
  await page.app.recordJourneyAction(journey.id, 'note');
  const updated = page.state().journeys.find((j) => j.id === journey.id);
  assert.equal(held.details.reason, '비슷한 옷이 있어서 먼저 보류');
  assert.equal(bought.details.reason, '기존 옷이 낡아 새 옷으로 교체');
  assert.equal(bought.details.option, '직접 확인한 M');
  assert.equal(worn.details.reason, '입어 보니 어깨가 좁음');
  assert.deepEqual(worn.details.feedback, { fit: 'small', returnReason: null });
  assert.equal(returned.details.reason, '사이즈가 맞지 않아 판매처에 반품');
  assert.deepEqual(returned.details.feedback, { fit: 'small', returnReason: 'size' });
  for (const event of [held, bought, worn, returned]) {
    assert.deepEqual(updated.history.find((entry) => entry.action === event.action), event);
  }
  assert.equal(updated.reason, '다음에는 한 사이즈 크게 확인');
  const persisted = await stored(page);
  assert.equal(persisted.state.schema, WARDROBE_SCHEMA);
  const reloaded = await boot(page.indexedDB, page.storage);
  t.after(() => reloaded.close());
  assert.deepEqual(reloaded.state().journeys.find((j) => j.id === journey.id), updated);
  const backup = await page.app.store.backup();
  assert.deepEqual((await parseWardrobeBackup(backup)).state.journeys.find((j) => j.id === journey.id), updated);
  await assertOriginalPhoto(reloaded, asset);
});

test('purchase improvements: changing an ordered option requires a visible correction choice and preserves the original order event', async (t) => {
  const { page, owned, asset } = await personalPage();
  t.after(() => page.close());
  const journey = await saveCatalogCandidate(page);
  page.input('journey-option', 'M', journey.id);
  await page.app.recordJourneyAction(journey.id, 'ordered');
  const before = await stored(page);
  const orderEvent = plain(before.state.journeys.find((j) => j.id === journey.id).history.find((entry) => entry.action === 'ordered'));
  assert.equal(orderEvent.details.option, 'M');
  page.input('journey-option', 'L', journey.id);
  page.input('journey-reason', '판매처에서 실제 주문한 옵션을 잘못 적어 정정', journey.id);
  await page.app.recordJourneyAction(journey.id, 'received');
  assert.ok(page.app.pendingOptionChange());
  assert.ok(page.nodes.get('sheet-root').innerHTML.includes('data-action="option-correction-confirm"'));
  assert.ok(page.nodes.get('sheet-root').innerHTML.includes('data-action="option-fork-confirm"'));
  const waiting = await stored(page);
  assert.equal(waiting.revision, before.revision, 'showing the choice cannot silently alter the ordered unit');
  assert.deepEqual(waiting.state, before.state);
  await page.click({ action: 'option-correction-confirm' });
  const after = await stored(page);
  const updated = page.state().journeys.find((j) => j.id === journey.id);
  assert.equal(after.revision, before.revision + 1, 'option correction, receipt and garment creation require one acknowledged commit');
  assert.equal(updated.stage, 'received');
  assert.equal(updated.option, 'L');
  assert.deepEqual(updated.history.find((entry) => entry.action === 'ordered'), orderEvent);
  assert.deepEqual(updated.history.slice(-2).map((entry) => entry.action), ['correction', 'received']);
  assert.equal(updated.history.at(-2).details.option, 'L');
  assert.equal(updated.history.at(-2).details.reason, '판매처에서 실제 주문한 옵션을 잘못 적어 정정');
  assert.equal(updated.history.at(-1).details.option, 'L');
  assert.equal(updated.history.at(-1).details.garmentId, updated.garmentId);
  assert.equal(page.state().garments.filter((g) => g.id === updated.garmentId).length, 1);
  assert.equal(page.state().closet.some((g) => g.id === updated.garmentId), false);
  assert.deepEqual(page.state().garments.find((g) => g.id === owned.id), owned);
  assert.equal(page.app.pendingOptionChange(), null);
  const reloaded = await boot(page.indexedDB, page.storage);
  t.after(() => reloaded.close());
  assert.deepEqual(reloaded.state().journeys.find((j) => j.id === journey.id), updated);
  await assertOriginalPhoto(page, asset);
});

test('purchase improvements: a different-option choice forks independently instead of rewriting the original ordered unit', async (t) => {
  const { page, owned, asset } = await personalPage();
  t.after(() => page.close());
  const journey = await saveCatalogCandidate(page);
  page.input('journey-option', 'M', journey.id);
  await page.app.recordJourneyAction(journey.id, 'ordered');
  const original = plain(page.state().journeys.find((j) => j.id === journey.id));
  const before = await stored(page);
  page.input('journey-option', 'L', journey.id);
  page.input('journey-reason', 'L 옵션도 별도로 비교', journey.id);
  await page.app.recordJourneyAction(journey.id, 'note');
  assert.ok(page.app.pendingOptionChange());
  assert.equal((await stored(page)).revision, before.revision);
  await page.click({ action: 'option-fork-confirm' });
  assert.equal((await stored(page)).revision, before.revision + 1);
  const state = page.state();
  assert.deepEqual(state.journeys.find((j) => j.id === journey.id), original);
  const fork = state.journeys.find((j) => j.id !== journey.id);
  assert.ok(fork);
  assert.equal(fork.forkedFrom, journey.id);
  assert.equal(fork.option, 'L');
  assert.equal(fork.reason, 'L 옵션도 별도로 비교');
  assert.equal(fork.stage, 'candidate');
  assert.equal(fork.decision, null);
  assert.equal(fork.garmentId, null);
  assert.equal(fork.wearCount, 0);
  assert.equal(fork.history.some((entry) => entry.action === 'ordered'), false);
  assert.deepEqual(fork.candidate, original.candidate);
  assert.deepEqual(state.garments, [owned]);
  assert.equal(page.app.pendingOptionChange(), null);
  const reloaded = await boot(page.indexedDB, page.storage);
  t.after(() => reloaded.close());
  assert.deepEqual(reloaded.state().journeys, state.journeys);
  await assertOriginalPhoto(page, asset);
});

test('purchase improvements: quota failure during option correction keeps the original order and pending receipt choice retryable', async (t) => {
  const { page, owned, asset } = await personalPage();
  t.after(() => page.close());
  const journey = await saveCatalogCandidate(page);
  page.input('journey-option', 'M', journey.id);
  await page.app.recordJourneyAction(journey.id, 'ordered');
  const before = await stored(page);
  const original = before.state.journeys.find((j) => j.id === journey.id);
  page.input('journey-option', 'L', journey.id);
  page.input('journey-reason', '실제 받은 옵션으로 정정', journey.id);
  await page.app.recordJourneyAction(journey.id, 'received');
  await withMetadataQuota(() => page.click({ action: 'option-correction-confirm' }));
  const failed = await stored(page);
  assert.equal(failed.revision, before.revision);
  assert.deepEqual(failed.state, before.state);
  assert.deepEqual(page.state().journeys.find((j) => j.id === journey.id), original);
  assert.ok(page.app.pendingOptionChange(), 'the failed write must retain the correction and receipt choice');
  assert.ok(hasSheetAction(page, 'option-correction-confirm'));
  assert.deepEqual(page.state().garments, [owned]);
  await assertOriginalPhoto(page, asset);
  await page.click({ action: 'option-correction-confirm' });
  const after = await stored(page);
  const updated = after.state.journeys.find((j) => j.id === journey.id);
  assert.equal(after.revision, before.revision + 1);
  assert.equal(updated.stage, 'received');
  assert.equal(updated.option, 'L');
  assert.equal(updated.reason, '실제 받은 옵션으로 정정');
  assert.deepEqual(updated.history.slice(0, original.history.length), original.history);
  assert.equal(after.state.garments.filter((g) => g.id === updated.garmentId).length, 1);
  assert.equal(page.app.pendingOptionChange(), null);
});

test('purchase improvements: editing a received candidate waits for explicit garment review and preserves personal name, brand and photo', async (t) => {
  const { page, owned, asset } = await personalPage();
  t.after(() => page.close());
  const journey = await saveCatalogCandidate(page);
  await page.app.recordJourneyAction(journey.id, 'ordered');
  await page.app.recordJourneyAction(journey.id, 'received');
  const garmentId = page.state().journeys.find((j) => j.id === journey.id).garmentId;
  const receiptEvent = plain(page.state().journeys.find((j) => j.id === journey.id).history.find((entry) => entry.action === 'received'));
  await page.click({ action: 'edit-own', id: garmentId });
  page.input('garment-label', '내가 붙인 실제 옷 이름');
  page.input('garment-brand', '직접 확인한 실제 브랜드');
  await page.app.chooseGarmentPhoto(jpeg(89));
  await page.app.saveGarmentDraft();
  const actualBefore = plain(page.state().garments.find((g) => g.id === garmentId));
  const color = actualBefore.color === 'navy' ? 'blue' : 'navy';
  await page.click({ action: 'candidate-edit', id: journey.id });
  await page.change('candidate-color', color);
  await page.app.saveCandidateDraft();
  assert.deepEqual(page.state().garments.find((g) => g.id === garmentId), actualBefore, 'candidate metadata alone cannot overwrite a personally edited received garment');
  const candidateEdited = page.state().journeys.find((j) => j.id === journey.id);
  assert.equal(candidateEdited.candidate.color, color);
  assert.deepEqual(candidateEdited.history.find((entry) => entry.action === 'received'), receiptEvent);
  page.app.beginCandidateGarmentReview(journey.id);
  const sheet = page.nodes.get('sheet-root').innerHTML;
  assert.match(sheet, /내가 붙인 실제 옷 이름/);
  assert.match(sheet, /직접 확인한 실제 브랜드/);
  assert.match(sheet, /→/);
  assert.ok(hasSheetAction(page, 'candidate-garment-apply'));
  const before = await stored(page);
  await withMetadataQuota(() => assert.rejects(page.app.applyCandidateGarmentReview(), (error) => error.name === 'QuotaExceededError'));
  const failed = await stored(page);
  assert.equal(failed.revision, before.revision);
  assert.deepEqual(failed.state, before.state);
  assert.deepEqual(page.state().garments.find((g) => g.id === garmentId), actualBefore);
  await page.app.applyCandidateGarmentReview();
  const after = await stored(page);
  const updatedItem = after.state.garments.find((g) => g.id === garmentId);
  const updatedJourney = after.state.journeys.find((j) => j.id === journey.id);
  assert.equal(after.revision, before.revision + 1);
  assert.deepEqual(updatedItem, { ...actualBefore, color });
  assert.equal(updatedJourney.history.at(-1).action, 'garment-confirmed');
  assert.deepEqual(updatedJourney.history.find((entry) => entry.action === 'received'), receiptEvent);
  assert.equal(page.state().closet.some((g) => g.id === garmentId), false);
  assert.deepEqual(after.state.garments.find((g) => g.id === owned.id), owned);
  assert.deepEqual(new Uint8Array(await after.photos.get(updatedItem.photoId).arrayBuffer()), new Uint8Array(await jpeg(89).arrayBuffer()));
  await assertOriginalPhoto(page, asset);
});

test('purchase improvements: stale received-garment review cannot overwrite another tab\'s actual garment and photo', async (t) => {
  const { page: first, asset } = await personalPage();
  t.after(() => first.close());
  const journey = await saveCatalogCandidate(first);
  await first.app.recordJourneyAction(journey.id, 'ordered');
  await first.app.recordJourneyAction(journey.id, 'received');
  const garmentId = first.state().journeys.find((j) => j.id === journey.id).garmentId;
  const color = product.color === 'navy' ? 'blue' : 'navy';
  await first.click({ action: 'candidate-edit', id: journey.id });
  await first.change('candidate-color', color);
  await first.app.saveCandidateDraft();
  first.app.beginCandidateGarmentReview(journey.id);
  const second = await boot(first.indexedDB, first.storage);
  t.after(() => second.close());
  await second.click({ action: 'edit-own', id: garmentId });
  second.input('garment-label', '다른 탭에서 확인한 실제 옷');
  await second.app.chooseGarmentPhoto(jpeg(97));
  await second.app.saveGarmentDraft();
  const live = await stored(second);
  await assert.rejects(first.app.applyCandidateGarmentReview(), /다른|바뀌|최신|충돌/);
  const failed = await stored(second);
  assert.equal(failed.revision, live.revision);
  assert.deepEqual(failed.state, live.state);
  const actual = failed.state.garments.find((g) => g.id === garmentId);
  assert.equal(actual.label, '다른 탭에서 확인한 실제 옷');
  assert.equal(actual.color, product.color);
  assert.deepEqual(new Uint8Array(await failed.photos.get(actual.photoId).arrayBuffer()), new Uint8Array(await jpeg(97).arrayBuffer()));
  await assertOriginalPhoto(second, asset);
});

test('option protection: auxiliary feedback, garment review and editor entry wait for correction before retrying their writes', async (t) => {
  const { page, owned, asset } = await personalPage();
  t.after(() => page.close());
  const matching = PRODUCTS.find((p) => p.slot === owned.slot && p.color === owned.color && p.colorSource !== 'image');
  const journey = await saveCatalogCandidate(page, matching);
  page.input('journey-option', 'M', journey.id);
  await page.app.recordJourneyAction(journey.id, 'ordered');
  await page.app.recordJourneyAction(journey.id, 'received');
  const garmentId = page.state().journeys.find((j) => j.id === journey.id).garmentId;
  await page.click({ action: 'candidate-edit', id: journey.id });
  await page.change('candidate-color', 'navy');
  await page.app.saveCandidateDraft();
  page.app.beginCandidateGarmentReview(journey.id);
  const before = await stored(page);
  const original = before.state.journeys.find((j) => j.id === journey.id);
  page.input('journey-option', 'L', journey.id);
  page.input('journey-reason', '주문 옵션을 잘못 적어 수정', journey.id);
  const attempts = [
    () => page.app.applyCandidateGarmentReview(),
    () => page.app.setJourneyField(journey.id, 'feedback', { fit: 'right', returnReason: null }),
    () => page.app.beginCandidateGarmentReview(journey.id),
    () => page.click({ action: 'journey-check-own', id: journey.id, item: owned.id }),
    () => page.click({ action: 'journey-add-own', id: journey.id }),
  ];
  for (const attempt of attempts) {
    await attempt();
    assert.ok(page.app.pendingOptionChange());
    assert.ok(hasSheetAction(page, 'option-correction-confirm'));
    assert.equal(page.app.draft(), null, 'an editor cannot open while a changed ordered option awaits a choice');
    const waiting = await stored(page);
    assert.equal(waiting.revision, before.revision);
    assert.deepEqual(waiting.state, before.state);
  }
  await page.click({ action: 'option-correction-confirm' });
  const corrected = await stored(page);
  const correctedJourney = corrected.state.journeys.find((j) => j.id === journey.id);
  assert.equal(corrected.revision, before.revision + 1);
  assert.equal(correctedJourney.option, 'L');
  assert.deepEqual(correctedJourney.history.slice(0, original.history.length), original.history);
  assert.deepEqual(correctedJourney.feedback, { fit: null, returnReason: null }, 'confirming the option must not silently perform the blocked feedback choice');
  assert.deepEqual(corrected.state.garments, before.state.garments);
  assert.equal(page.app.pendingOptionChange(), null);
  await page.app.setJourneyField(journey.id, 'feedback', { fit: 'right', returnReason: null });
  page.app.beginCandidateGarmentReview(journey.id);
  await page.click({ action: 'candidate-garment-apply' });
  assert.equal(page.state().garments.find((g) => g.id === garmentId).color, 'navy');
  await page.click({ action: 'journey-check-own', id: journey.id, item: owned.id });
  assert.equal(page.app.draft().id, owned.id);
  page.input('garment-label', '옵션 확인 후 저장한 기존 셔츠');
  await page.app.saveGarmentDraft();
  const after = await stored(page);
  const updated = after.state.journeys.find((j) => j.id === journey.id);
  assert.equal(updated.option, 'L');
  assert.deepEqual(updated.feedback, { fit: 'right', returnReason: null });
  assert.deepEqual(updated.history.slice(0, original.history.length), original.history);
  assert.equal(after.state.garments.find((g) => g.id === owned.id).label, '옵션 확인 후 저장한 기존 셔츠');
  assert.equal(after.state.garments.find((g) => g.id === owned.id).photoId, owned.photoId);
  await assertOriginalPhoto(page, asset);
});

test('option protection: inline owned-color change gates a changed ordered option, then preserves photo and retries a failed write', async (t) => {
  const { page, owned, asset } = await personalPage();
  t.after(() => page.close());
  await page.click({ action: 'edit-own', id: owned.id });
  await page.click({ action: 'draft-color', color: '' });
  await page.app.saveGarmentDraft();
  assert.equal(page.state().garments.find((g) => g.id === owned.id).color, null);
  const matching = PRODUCTS.find((p) => p.slot === owned.slot && p.color === owned.color && p.colorSource !== 'image');
  const journey = await saveCatalogCandidate(page, matching);
  page.input('journey-option', 'M', journey.id);
  await page.app.recordJourneyAction(journey.id, 'ordered');
  assert.match(page.nodes.get('sheet-root').innerHTML, /data-action="journey-own-color"/);
  const before = await stored(page);
  const original = before.state.journeys.find((j) => j.id === journey.id);
  page.input('journey-option', 'L', journey.id);
  page.input('journey-reason', '옵션을 먼저 정정하고 내 옷 색 확인', journey.id);
  const target = { dataset: { action: 'journey-own-color', id: journey.id, item: owned.id } };
  await page.change('', 'blue', target);
  const waiting = await stored(page);
  assert.equal(waiting.revision, before.revision);
  assert.deepEqual(waiting.state, before.state);
  assert.ok(page.app.pendingOptionChange());
  await page.click({ action: 'option-correction-confirm' });
  const corrected = await stored(page);
  assert.equal(corrected.state.garments.find((g) => g.id === owned.id).color, null);
  await withMetadataQuota(() => page.change('', 'blue', target));
  const failed = await stored(page);
  assert.equal(failed.revision, corrected.revision);
  assert.deepEqual(failed.state, corrected.state);
  assert.deepEqual([...failed.photos.keys()], [...corrected.photos.keys()]);
  await assertOriginalPhoto(page, asset);
  await page.change('', 'blue', target);
  const after = await stored(page);
  const updated = after.state.journeys.find((j) => j.id === journey.id);
  assert.equal(after.revision, corrected.revision + 1);
  assert.equal(updated.option, 'L');
  assert.equal(updated.stage, 'ordered');
  assert.deepEqual(updated.history.slice(0, original.history.length), original.history);
  assert.equal(updated.history.at(-1).action, 'details-change');
  assert.ok(updated.relatedGarmentIds.includes(owned.id));
  assert.equal(after.state.garments.find((g) => g.id === owned.id).color, 'blue');
  assert.equal(after.state.garments.find((g) => g.id === owned.id).photoId, owned.photoId);
  await assertOriginalPhoto(page, asset);
});

test('option protection: checkbox change applies only explicitly selected garment fields and retains selection and photo after quota failure', async (t) => {
  const { page, owned, asset } = await personalPage();
  t.after(() => page.close());
  const journey = await saveCatalogCandidate(page);
  await page.app.recordJourneyAction(journey.id, 'ordered');
  await page.app.recordJourneyAction(journey.id, 'received');
  const garmentId = page.state().journeys.find((j) => j.id === journey.id).garmentId;
  await page.click({ action: 'edit-own', id: garmentId });
  page.input('garment-label', '내가 붙인 원래 이름');
  page.input('garment-brand', '사진과 함께 직접 남긴 브랜드');
  await page.app.chooseGarmentPhoto(jpeg(103));
  await page.app.saveGarmentDraft();
  const actual = plain(page.state().garments.find((g) => g.id === garmentId));
  const color = actual.color === 'navy' ? 'blue' : 'navy';
  await page.click({ action: 'candidate-edit', id: journey.id });
  page.input('candidate-name', '판매처에서 확인한 새 상품 이름');
  await page.change('candidate-color', color);
  await page.app.saveCandidateDraft();
  const historyBefore = plain(page.state().journeys.find((j) => j.id === journey.id).history);
  await page.click({ action: 'candidate-garment-review', id: journey.id });
  await page.change('', '', { dataset: { action: 'candidate-garment-toggle', field: 'color' }, checked: false });
  await page.change('', '', { dataset: { action: 'candidate-garment-toggle', field: 'label' }, checked: true });
  assert.deepEqual([...page.app.candidateGarmentReview().selected], ['label']);
  const before = await stored(page);
  await withMetadataQuota(() => page.click({ action: 'candidate-garment-apply' }));
  const failed = await stored(page);
  assert.equal(failed.revision, before.revision);
  assert.deepEqual(failed.state, before.state);
  assert.deepEqual([...page.app.candidateGarmentReview().selected], ['label']);
  assert.deepEqual(page.state().garments.find((g) => g.id === garmentId), actual);
  assert.deepEqual(new Uint8Array(await failed.photos.get(actual.photoId).arrayBuffer()), new Uint8Array(await jpeg(103).arrayBuffer()));
  assert.ok(hasSheetAction(page, 'candidate-garment-apply'));
  await page.click({ action: 'candidate-garment-apply' });
  const after = await stored(page);
  assert.equal(after.revision, before.revision + 1);
  assert.deepEqual(after.state.garments.find((g) => g.id === garmentId), { ...actual, label: '판매처에서 확인한 새 상품 이름' });
  assert.deepEqual(after.state.journeys.find((j) => j.id === journey.id).history.slice(0, historyBefore.length), historyBefore);
  assert.deepEqual(after.state.garments.find((g) => g.id === owned.id), owned);
  assert.deepEqual(new Uint8Array(await after.photos.get(actual.photoId).arrayBuffer()), new Uint8Array(await jpeg(103).arrayBuffer()));
  await assertOriginalPhoto(page, asset);
});

test('option protection: a new candidate shows original return feedback separately from later same-option notes and excludes corrected-option feedback', async (t) => {
  const { page, owned, asset } = await personalPage();
  t.after(() => page.close());
  const journey = await saveCatalogCandidate(page);
  page.input('journey-option', 'M', journey.id);
  await page.app.recordJourneyAction(journey.id, 'ordered');
  await page.app.recordJourneyAction(journey.id, 'received');
  await page.app.setJourneyField(journey.id, 'feedback', { fit: 'small', returnReason: 'size' });
  page.input('journey-reason', 'M 옵션을 받아 입어 보고 반품', journey.id);
  await page.app.recordJourneyAction(journey.id, 'returned');
  const originalReturn = plain(page.state().journeys.find((j) => j.id === journey.id).history.find((event) => event.action === 'returned'));
  await page.app.setJourneyField(journey.id, 'feedback', { fit: 'right', returnReason: 'color' });
  await page.click({ action: 'journey-fork', id: journey.id });
  const forkId = page.state().journeys.find((j) => j.forkedFrom === journey.id).id;
  const firstSheet = page.nodes.get('sheet-root').innerHTML;
  assert.match(firstSheet, /M 옵션을 받아 입어 보고 반품/);
  assert.match(firstSheet, /핏 직접 기록: 작음/);
  assert.match(firstSheet, /같은 옵션으로 반품 후 저장한 정보: 핏 직접 기록: 맞음/);
  assert.match(firstSheet, /반품 사유: 사이즈/);
  assert.match(firstSheet, /반품 사유: 색/);
  await page.click({ action: 'open-journey', id: journey.id });
  page.input('journey-option', 'L', journey.id);
  page.input('journey-reason', '다른 옵션으로 잘못 기록한 내용을 정정', journey.id);
  await page.app.recordJourneyAction(journey.id, 'note');
  await page.click({ action: 'option-correction-confirm' });
  await page.app.setJourneyField(journey.id, 'feedback', { fit: 'large', returnReason: 'size' });
  await page.click({ action: 'open-journey', id: forkId });
  const afterSheet = page.nodes.get('sheet-root').innerHTML;
  assert.match(afterSheet, /핏 직접 기록: 작음/);
  assert.match(afterSheet, /같은 옵션으로 반품 후 저장한 정보: 핏 직접 기록: 맞음/);
  assert.doesNotMatch(afterSheet, /핏 직접 기록: 큼/);
  const updatedOriginal = page.state().journeys.find((j) => j.id === journey.id);
  assert.equal(updatedOriginal.option, 'L');
  assert.deepEqual(updatedOriginal.feedback, { fit: 'large', returnReason: 'size' });
  assert.deepEqual(updatedOriginal.history.find((event) => event.action === 'returned'), originalReturn);
  assert.deepEqual(page.state().garments.find((g) => g.id === owned.id), owned);
  await assertOriginalPhoto(page, asset);
});


test('browsing a demo catalog comparison opens registration without creating a real purchase record', async (t) => {
  const page = await boot();
  t.after(() => page.close());
  assert.equal(page.state().demo, true);
  const before = await stored(page), beforeTab = page.state().tab;
  await page.click({ action: 'candidate-product', id: product.id });
  const after = await stored(page);
  assert.equal(after.revision, before.revision);
  assert.equal(after.state.journeys.length, 0);
  assert.equal(page.state().tab, beforeTab);
  assert.ok(page.app.draft(), 'the first useful next step is adding a real garment');
  assert.equal(page.app.candidateDraft(), null);
});
