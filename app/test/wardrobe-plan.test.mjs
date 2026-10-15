import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { IDBFactory } from 'fake-indexeddb';
import { wardrobePlan } from '../src/wardrobe-plan.js';
import { compareCandidate, candidateFromProduct, candidateFromLink } from '../src/purchase-candidate.js';
import { makeGarment, newWardrobeState } from '../src/wardrobe.js';
import { createWardrobeStore } from '../src/wardrobe-store.js';
import { PRODUCT_BY_ID } from '../src/engine.js';
import { createPurchaseJourney, transitionPurchaseJourney } from '../src/purchase-journey.js';

const g = (slot, color, extra = {}) => makeGarment({ slot, color, gender: 'M', ...extra });
const wardrobe = (garments, extra = {}) => ({
  ...newWardrobeState(), demo: false, demoSelected: [], styles: ['classic'], season: 'fall', garments, ...extra,
});
const ivy = () => [g('m-oxford', 'white', { id: 'g_oxford' }), g('m-chino', 'beige', { id: 'g_chino' }), g('m-loafer', 'brown', { id: 'g_loafer' })];

test('gaps are counted from confirmed real clothes with the same rule as the purchase comparison', () => {
  const state = wardrobe(ivy());
  const plan = wardrobePlan(state);
  assert.equal(plan.basis.kind, 'actual');
  assert.equal(plan.analysed.length, 3);
  assert.ok(plan.gaps.length >= 1);
  for (const gap of plan.gaps) {
    assert.ok(gap.newFormulaCount > 0);
    assert.ok(gap.usesOwned.every((item) => ['g_oxford', 'g_chino', 'g_loafer'].includes(item.id)), 'only my clothes fill the formulas');
    for (const entry of gap.products) {
      const product = PRODUCT_BY_ID[entry.product.id];
      assert.equal(entry.product, product, 'a real catalog product, not a generated one');
      assert.equal(entry.price.amount, product.price);
      assert.equal(entry.price.collectedOn, product.checkedAt);
      assert.equal(entry.price.kind, 'collected', 'the collected price, never a current or lowest price');
      assert.match(product.url, /^https:\/\/www\.musinsa\.com\/products\/\d+$/);
      if (entry.colorConfirmed) {
        const same = compareCandidate(state, candidateFromProduct(product), { absence: 'unknown' });
        assert.equal(same.newFormulaCount, gap.newFormulaCount, `${product.id}: the plan and the purchase comparison agree`);
      }
    }
  }
});

test('unconfirmed type or colour is listed for a check and never changes the counts', () => {
  const base = wardrobePlan(wardrobe(ivy()));
  const withUnknown = wardrobePlan(wardrobe([...ivy(), makeGarment({ id: 'g_kind', kind: 'jacket', gender: 'M' }), g('m-denim-raw', null, { id: 'g_jeans' })]));
  assert.deepEqual(withUnknown.needsCheck.map((n) => [n.item.id, n.reason]), [['g_kind', 'type-and-color'], ['g_jeans', 'color']]);
  assert.deepEqual(withUnknown.gaps.map((gap) => [gap.slot.id, gap.newFormulaCount]), base.gaps.map((gap) => [gap.slot.id, gap.newFormulaCount]));
});

test('duplicates are the same detailed type and colour; another gender and returned clothes are left out', () => {
  const returned = g('m-oxford', 'blue', { id: 'g_returned' });
  let journey = createPurchaseJourney(candidateFromProduct(PRODUCT_BY_ID['ms-3323583']), { id: 'j_ret', at: '2026-10-14T00:00:00.000Z' });
  journey = transitionPurchaseJourney(journey, 'buy', { at: '2026-10-14T00:01:00.000Z' });
  journey = transitionPurchaseJourney(journey, 'ordered', { at: '2026-10-14T00:02:00.000Z' });
  journey = transitionPurchaseJourney(journey, 'received', { at: '2026-10-14T01:00:00.000Z', changes: { garmentId: 'g_returned' } });
  journey = transitionPurchaseJourney(journey, 'returned', { at: '2026-10-14T02:00:00.000Z' });
  const state = wardrobe([...ivy(), g('m-oxford', 'white', { id: 'g_oxford2' }), returned,
    makeGarment({ id: 'g_f', slot: 'f-shirt', color: 'white', gender: 'F' })], { journeys: [journey] });
  const plan = wardrobePlan(state);
  assert.deepEqual(plan.duplicates.map((d) => [d.slot.id, d.color, d.items.map((i) => i.id)]), [['m-oxford', 'white', ['g_oxford', 'g_oxford2']]]);
  assert.equal(plan.basis.otherGender, 1);
  assert.equal(plan.basis.retired, 1);
  assert.ok(!plan.analysed.some((item) => item.id === 'g_returned'));
});

test('an ordered purchase pauses its type; a budget filters products; photo-guessed colours are marked', () => {
  let journey = createPurchaseJourney(candidateFromProduct(PRODUCT_BY_ID['ms-3323583']), { id: 'j_order', at: '2026-10-14T00:00:00.000Z' });
  journey = transitionPurchaseJourney(journey, 'buy', { at: '2026-10-14T00:01:00.000Z' });
  journey = transitionPurchaseJourney(journey, 'ordered', { at: '2026-10-14T00:02:00.000Z' });
  const ordered = wardrobePlan(wardrobe(ivy(), { journeys: [journey] }));
  assert.ok(ordered.paused.some((p) => p.slot.id === 'm-harrington' && p.reason === 'ordered'));
  assert.ok(!ordered.gaps.some((gap) => gap.slot.id === 'm-harrington'));

  const cheap = wardrobePlan(wardrobe(ivy(), { budget: 50000 }));
  assert.ok(cheap.gaps.flatMap((gap) => gap.products).every((entry) => entry.product.price <= 50000));
  const all = wardrobePlan(wardrobe(ivy()), { productsPerGap: 20 });
  for (const entry of all.gaps.flatMap((gap) => gap.products))
    assert.equal(entry.colorConfirmed, entry.product.colorSource !== 'image');
});

test('two garments away: formulas built only from confirmed clothes are shown when no single one completes', () => {
  const plan = wardrobePlan(wardrobe([g('m-oxford', 'white'), g('m-chino', 'beige'), g('m-white-sneaker', 'white')]));
  assert.equal(plan.gaps.length, 0);
  assert.ok(plan.pairs.length >= 1);
  for (const pair of plan.pairs) {
    assert.equal(pair.slots.length, 2);
    assert.ok(pair.usesOwned.length >= 2);
    for (const slot of pair.slots) assert.ok(pair.products[slot.id].every((entry) => entry.product.slot === slot.id));
  }
});

test('the example closet is analysed only as an example and nothing is analysed without clothes', () => {
  const example = wardrobePlan({ ...newWardrobeState(), season: 'fall' });
  assert.equal(example.basis.kind, 'example');
  assert.ok(example.analysed.every((item) => item.source === 'demo'));
  const empty = wardrobePlan(wardrobe([]));
  assert.equal(empty.basis.kind, 'empty');
  assert.deepEqual(empty.gaps, []);
});

test('a Musinsa link outside the catalog stays that exact product and is never swapped for a listed one', () => {
  assert.equal(PRODUCT_BY_ID['ms-5755268'], undefined);
  const candidate = candidateFromLink('https://www.musinsa.com/products/5755268?utm_source=share');
  assert.equal(candidate.productId, 'ms-5755268');
  assert.equal(candidate.url, 'https://www.musinsa.com/products/5755268');
  assert.equal(candidate.originalUrl, 'https://www.musinsa.com/products/5755268?utm_source=share');
  assert.deepEqual([candidate.source, candidate.name, candidate.brand, candidate.price, candidate.slot, candidate.color], ['user', '', '', null, null, null]);
});

test('my last record of the same product is shown next to it without hiding or reordering anything', () => {
  const state = wardrobe(ivy());
  const before = wardrobePlan(state, { productsPerGap: 20 });
  const entry = before.gaps[0].products[0];
  const product = entry.product;
  assert.equal(entry.record, null);
  let returned = createPurchaseJourney(candidateFromProduct(product), { id: 'j_back', at: '2026-10-01T00:00:00.000Z' });
  returned = transitionPurchaseJourney(returned, 'buy', { at: '2026-10-01T00:01:00.000Z', changes: { option: 'M' } });
  returned = transitionPurchaseJourney(returned, 'ordered', { at: '2026-10-01T00:02:00.000Z' });
  returned = transitionPurchaseJourney(returned, 'received', { at: '2026-10-03T00:00:00.000Z', changes: { garmentId: 'g_back' } });
  returned = transitionPurchaseJourney(returned, 'returned', { at: '2026-10-04T00:00:00.000Z',
    changes: { feedback: { fit: 'small', returnReason: 'size' } } });
  let skipped = createPurchaseJourney(candidateFromProduct(product), { id: 'j_skip', at: '2026-09-01T00:00:00.000Z' });
  skipped = transitionPurchaseJourney(skipped, 'skip', { at: '2026-09-01T00:01:00.000Z' });
  const after = wardrobePlan(wardrobe([...ivy(), g(product.slot, product.color, { id: 'g_back' })], { journeys: [skipped, returned] }), { productsPerGap: 20 });
  const gap = after.gaps.find((x) => x.slot.id === before.gaps[0].slot.id);
  assert.ok(gap, 'a returned purchase does not count as owned');
  assert.deepEqual(gap.products.map((x) => x.product.id), before.gaps[0].products.map((x) => x.product.id), 'same products, same order');
  assert.deepEqual(gap.products[0].record, {
    journeyId: 'j_back', count: 2, stage: 'returned', decision: 'buy', at: '2026-10-04T00:00:00.000Z',
    option: 'M', fit: 'small', returnReason: 'size', wearCount: 0,
  }, 'the latest of the two records, with the option and what the user wrote');
  assert.ok(gap.products.slice(1).every((x) => x.record === null), 'other products carry no record');
});

// ── the real bundled screen
const root = fileURLToPath(new URL('../', import.meta.url));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'eoul-plan-'));
after(() => fs.rmSync(temp, { recursive: true, force: true }));
const output = path.join(temp, 'index.html');
execFileSync(process.execPath, [path.join(root, 'tools/build.mjs'), '--out', output]);
const script = fs.readFileSync(output, 'utf8').match(/<script type="module">([\s\S]*?)<\/script>/)[1].replace(
  /\n\}\)\(\);\s*$/,
  '\nglobalThis.testApp = { state: () => state, ready: appReady, store: wardrobeStore, candidateDraft: () => candidateDraft };\n})();',
);
async function boot(indexedDB = new IDBFactory()) {
  const nodes = new Map(['app', 'sheet-root', 'toast'].map((id) => [id, { innerHTML: '', classList: { add() {}, remove() {} }, querySelector() { return null; }, querySelectorAll() { return []; } }]));
  const listeners = new Map();
  const context = vm.createContext({
    indexedDB, Blob, crypto: globalThis.crypto, structuredClone, btoa, atob, Uint8Array, DataView, TextEncoder, TextDecoder,
    URL: class extends URL { static createObjectURL() { return 'blob:plan/1'; } static revokeObjectURL() {} },
    URLSearchParams, Image: class { decode() { return Promise.resolve(); } },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, navigator: {},
    document: {
      getElementById: (id) => nodes.get(id) ?? null,
      addEventListener(type, fn) { listeners.set(type, [...(listeners.get(type) || []), fn]); },
      querySelector: () => null, querySelectorAll: () => [], body: { style: {}, append() {} }, createElement: () => ({ click() {}, remove() {} }),
    },
    window: { scrollTo() {}, matchMedia: () => ({ matches: false }) }, CSS: { escape: (v) => v },
    setTimeout: () => 1, clearTimeout() {}, requestAnimationFrame: (fn) => fn(),
  });
  vm.runInContext(script, context);
  await context.testApp.ready;
  return {
    app: context.testApp,
    body: () => nodes.get('app').innerHTML,
    sheet: () => nodes.get('sheet-root').innerHTML,
    async click(dataset) { for (const fn of listeners.get('click') || []) await fn({ target: { closest: () => ({ dataset }) }, preventDefault() {}, stopPropagation() {} }); },
    async submit(value) {
      for (const fn of listeners.get('submit') || [])
        fn({ target: { closest: (sel) => (sel === 'form[data-action="ask"]' ? { q: { value, blur() {} } } : null) }, preventDefault() {} });
    },
  };
}

test('home and the plan sheet: my clothes → overlap → gap → exact product, collected price and its link', async () => {
  const indexedDB = new IDBFactory();
  const store = createWardrobeStore({ indexedDB });
  const first = await store.load();
  const { season, ...record } = wardrobe([...ivy(), g('m-oxford', 'white', { id: 'g_oxford2' }), g('m-denim-raw', null, { id: 'g_jeans' })]);
  await store.commit(record, first.revision, [], first.epoch);
  store.close();
  const page = await boot(indexedDB);
  assert.match(page.body(), /내 옷장 기준 다음 한 벌/);
  assert.match(page.body(), /분석 4벌 · 확인 필요 1벌 · 겹치는 옷 1묶음/);
  await page.click({ action: 'open-plan' });
  const sheet = page.sheet();
  assert.match(sheet, /등록한 내 옷 5벌 중 종류·색을 확인한 4벌로 계산했어요/);
  assert.match(sheet, /부족한 종류와 실제 상품[\s\S]*<summary>계산 기준 · 내 옷과 겹치는 종류<\/summary>[\s\S]*계산에 넣은 내 옷[\s\S]*겹치는 옷/);
  assert.match(sheet, /데님 · 색 미확인 <button class="link" data-action="open-own" data-id="g_jeans">/);
  assert.match(sheet, /<b>화이트 [^<]*옥스퍼드[^<]* 2벌<\/b>/);
  const plan = wardrobePlan(JSON.parse(JSON.stringify(page.app.state())));
  const entry = plan.gaps[0]?.products[0] || plan.pairs[0] && Object.values(plan.pairs[0].products)[0][0];
  assert.ok(entry, 'the current season gives at least one real product');
  const p = entry.product;
  assert.ok(sheet.includes(`${p.brand}`) && sheet.includes(p.name.replace(/&/g, '&amp;')), 'brand and exact product name');
  assert.ok(sheet.includes(`${p.store} 표시가 · ${p.checkedAt} 수집`), 'collected price with its store and date');
  assert.ok(sheet.includes(`href="${p.url}"`), 'the product link');
  assert.ok(sheet.includes(`data-action="candidate-product" data-id="${p.id}"`), 'one tap to compare with my clothes and keep a journey');
  assert.match(sheet, /가격은 현재 최저가가 아니에요/);
  assert.doesNotMatch(sheet.replace('가격은 현재 최저가가 아니에요', ''), /최저가/);
  await page.click({ action: 'candidate-product', id: p.id });
  assert.equal(page.app.state().journeys.at(-1).candidate.productId, p.id);
  assert.equal(page.app.candidateDraft(), null, 'one comparison tap no longer asks for catalog metadata again');
  assert.match(page.sheet(), /내 옷을 기준으로 비교/);
});

test('the plan sheet shows a product I decided not to buy as my record, with a way back to it', async () => {
  const indexedDB = new IDBFactory();
  const store = createWardrobeStore({ indexedDB });
  const first = await store.load();
  const { season, ...base } = wardrobe(ivy());
  const plan = wardrobePlan({ ...base, season: undefined });
  const product = plan.gaps[0]?.products[0]?.product;
  assert.ok(product, 'the current season gives a product');
  let skipped = createPurchaseJourney(candidateFromProduct(product), { id: 'j_skip', at: '2026-09-01T00:00:00.000Z' });
  skipped = transitionPurchaseJourney(skipped, 'skip', { at: '2026-09-02T00:00:00.000Z' });
  await store.commit({ ...base, journeys: [skipped] }, first.revision, [], first.epoch);
  store.close();
  const page = await boot(indexedDB);
  await page.click({ action: 'open-plan' });
  assert.match(page.sheet(), /내 지난 기록 · 안 사기로 했던 상품 · 2026-09-02 기록<\/span><button class="link" data-action="open-journey" data-id="j_skip">기록 보기/);
  await page.click({ action: 'open-item', id: product.id });
  assert.match(page.sheet(), /내 지난 기록 · 안 사기로 했던 상품/, 'the product sheet shows it too');
  await page.click({ action: 'open-journey', id: 'j_skip' });
  assert.match(page.sheet(), /안 사기로 함/);
});

test('the example closet says it is an example on home and in the sheet', async () => {
  const page = await boot();
  assert.match(page.body(), /예시 옷장으로 보는 다음 한 벌/);
  assert.match(page.body(), /예시 옷이라 실제로 가진 옷과 다를 수 있어요/);
  await page.click({ action: 'open-plan' });
  assert.match(page.sheet(), /예시 옷 6벌로 보는 진단이에요. 실제 내 옷이 아니에요./);
  assert.match(page.sheet(), /계산에 넣은 예시 옷/);
});

test('pasting the unlisted Musinsa link opens a comparison for that link only', async () => {
  const page = await boot();
  await page.submit('https://www.musinsa.com/products/5755268');
  const draft = page.app.candidateDraft();
  assert.equal(draft.candidate.productId, 'ms-5755268');
  assert.equal(draft.candidate.name, '');
  assert.equal(draft.candidate.source, 'user');
  assert.match(page.sheet(), /5755268/);
});


test('home surfaces the exact two-product plan when one new garment cannot complete a formula', async () => {
  const indexedDB = new IDBFactory(), store = createWardrobeStore({ indexedDB });
  const first = await store.load();
  const { season, ...record } = wardrobe([g('m-oxford', 'white'), g('m-chino', 'beige'), g('m-white-sneaker', 'white')]);
  await store.commit(record, first.revision, [], first.epoch); store.close();
  const page = await boot(indexedDB);
  const plan = wardrobePlan(JSON.parse(JSON.stringify(page.app.state())));
  assert.equal(plan.gaps.length, 0);
  const pair = plan.pairs.find((entry) => entry.slots.every((slot) => entry.products[slot.id]?.length));
  assert.ok(pair);
  const card = page.body().match(/<article class="next-pick next-pick-pair">([\s\S]*?)<\/article>/)[1];
  assert.match(card, /두 벌 조합과 내 옷 보기/);
  assert.match(card, /한 상품만으로 완성되는 조합은 아니에요/);
  for (const slot of pair.slots) {
    const p = pair.products[slot.id][0].product;
    assert.ok(card.includes(p.brand) && card.includes(p.name.replace(/&/g, '&amp;')));
  }
  assert.doesNotMatch(card, /data-action="candidate-product"/, 'a two-item recommendation must not pretend a single-item comparison covers it');
  await page.click({ action: 'open-plan' });
  assert.match(page.sheet(), /두 벌을 더하면 완성되는 코디/);
  assert.equal(page.app.state().journeys.length, 0);
  page.app.store.close();
});

test('comparison shows the supported formula and asks ownership once before disclosing detailed evidence', async () => {
  const indexedDB = new IDBFactory(), store = createWardrobeStore({ indexedDB });
  const first = await store.load();
  const { season, ...record } = wardrobe(ivy());
  await store.commit(record, first.revision, [], first.epoch); store.close();
  const page = await boot(indexedDB);
  const plan = wardrobePlan(JSON.parse(JSON.stringify(page.app.state())));
  const entry = plan.gaps.flatMap((gap) => gap.products).find((entry) => entry.colorConfirmed);
  assert.ok(entry);
  await page.click({ action: 'candidate-product', id: entry.product.id });
  let sheet = page.sheet();
  assert.match(sheet, /코디가 새로 연결돼요/);
  assert.match(sheet, /journey-quick-check/);
  assert.match(sheet, /<details class="journey-controls journey-details">/);
  assert.equal((sheet.match(/data-field="absence" data-value="absent"/g) || []).length, 1);
  assert.equal((sheet.match(/이 후보와 등록한 내 옷/g) || []).length, 1);
  assert.ok(sheet.indexOf('journey-quick-check') < sheet.indexOf('journey-details'));
  const journey = page.app.state().journeys[0];
  assert.equal(compareCandidate(page.app.state(), journey.candidate).decision.kind, 'hold', 'UI must not infer the user owns no similar garment');
  await page.click({ action: 'journey-field', id: journey.id, field: 'absence', value: 'absent' });
  const updated = page.app.state().journeys[0];
  assert.equal(updated.absence, 'absent');
  assert.equal(compareCandidate(page.app.state(), updated.candidate, { absence: updated.absence }).decision.kind, 'consider');
  assert.doesNotMatch(page.sheet(), /구매가 필요한지는 가진 옷을 한 번 더 확인/);
  page.app.store.close();
});
