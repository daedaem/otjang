import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { IDBFactory } from 'fake-indexeddb';
import { validateOffer, offerStatus, compareOffers, mergeRefreshed, OFFER_STALE_DAYS } from '../src/offers.js';
import { readOffers, writeOffers, offerRef, OFFER_STORE_KEY } from '../src/offer-store.js';
import { createSupply } from '../../server/src/supply.js';
import { PRODUCT_BY_ID } from '../src/engine.js';

const now = new Date('2026-10-15T12:00:00.000Z');
const offer = (fields) => validateOffer({
  seller: '판매처', url: 'https://shop.example/p/1', price: 30000, shipping: 3000, color: 'navy', size: 'M',
  stock: 'in-stock', sameProduct: 'confirmed', source: 'user', checkedAt: '2026-10-15T10:00:00.000Z', ...fields,
});
const memory = () => {
  const map = new Map();
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
};

test('an offer needs a seller, an https link, a whole-won price and a check time; shipping may be unknown', () => {
  assert.throws(() => offer({ seller: ' ' }), /판매처 이름/);
  assert.throws(() => offer({ url: 'http://shop.example/p/1' }), /https/);
  assert.throws(() => offer({ price: 12.5 }), /원 단위/);
  assert.throws(() => offer({ shipping: -1 }), /배송비/);
  assert.throws(() => offer({ source: 'scraper' }), /출처/);
  assert.equal(offer({ shipping: '' }).shipping, null);
  assert.equal(offer({ color: 'not-a-colour' }).color, null);
});

test('only the same product, same option, in stock, recent and with known shipping is compared', () => {
  const requested = { color: 'navy', size: 'M' };
  const flags = (fields) => offerStatus(offer(fields), { requested, now }).flags;
  assert.deepEqual(flags({}), []);
  assert.deepEqual(flags({ stock: 'sold-out' }), ['sold-out']);
  assert.deepEqual(flags({ checkedAt: new Date(now - (OFFER_STALE_DAYS + 1) * 86400000).toISOString() }), ['stale']);
  assert.deepEqual(flags({ size: 'L' }), ['option-mismatch']);
  assert.deepEqual(flags({ color: null }), ['option-unknown']);
  assert.deepEqual(flags({ shipping: null }), ['shipping-unknown']);
  assert.deepEqual(flags({ sameProduct: 'unconfirmed' }), ['product-unconfirmed']);
  assert.deepEqual(flags({ stock: 'unknown' }), ['stock-unknown'], 'stock must be confirmed, not just "not sold out"');
  assert.equal(offerStatus(offer({}), { requested, now }).total, 33000);
  for (const partial of [{}, { color: 'navy' }, { size: 'M' }]) {
    assert.deepEqual(offerStatus(offer({}), { requested: partial, now }).flags, ['request-incomplete'], JSON.stringify(partial));
    assert.equal(compareOffers([offer({})], { requested: partial, now }).best, null, 'no lowest total before the option is chosen');
  }
});

test('the lowest total among checked sellers is found; the rest keep their reasons', () => {
  const a = offer({ id: 'a', seller: 'A', price: 30000, shipping: 3000 });
  const b = offer({ id: 'b', seller: 'B', price: 31000, shipping: 0 });
  const c = offer({ id: 'c', seller: 'C', price: 20000, shipping: 0, stock: 'sold-out' });
  const d = offer({ id: 'd', seller: 'D', price: 25000, shipping: null });
  const result = compareOffers([a, b, c, d], { requested: { color: 'navy', size: 'M' }, now });
  assert.deepEqual(result.comparable.map((row) => [row.offer.id, row.total]), [['b', 31000], ['a', 33000]]);
  assert.equal(result.best.offer.id, 'b', 'a cheaper item price with shipping loses to free shipping');
  assert.deepEqual(result.reasons, { 'sold-out': 1, 'shipping-unknown': 1 });
  assert.equal(compareOffers([d], { requested: {}, now }).best, null, 'unknown shipping is never declared lowest');
});

test('a refresh replaces that source’s offers but keeps the user’s confirmations and their own records', () => {
  const mine = offer({ id: 'mine', seller: 'My shop' });
  const searched = offer({ id: 's1', source: 'naver-shopping', url: 'https://shop.example/n/1', sameProduct: 'confirmed', shipping: 2500, size: 'M', price: 29000 });
  const refreshed = [offer({ id: 's1b', source: 'naver-shopping', url: 'https://shop.example/n/1', sameProduct: 'unconfirmed', shipping: null, size: null, price: 28000 }),
    offer({ id: 's2', source: 'naver-shopping', url: 'https://shop.example/n/2', sameProduct: 'unconfirmed', shipping: null })];
  const merged = mergeRefreshed([mine, searched], refreshed, 'naver-shopping');
  assert.deepEqual(merged.map((o) => o.id), ['mine', 's1b', 's2']);
  assert.equal(merged[1].price, 28000, 'the new price is used');
  assert.deepEqual([merged[1].sameProduct, merged[1].shipping, merged[1].size], ['confirmed', 2500, 'M'], 'the user’s confirmation of that link survives');
  assert.equal(merged[2].sameProduct, 'unconfirmed');

  const manual = Array.from({ length: 12 }, (_, i) => offer({ id: `u${i}`, seller: `직접${i}` }));
  const fetched = Array.from({ length: 5 }, (_, i) => offer({ id: `n${i}`, source: 'naver-shopping', url: `https://shop.example/n/${i}` }));
  assert.deepEqual(mergeRefreshed(manual, fetched, 'naver-shopping').map((o) => o.id), manual.map((o) => o.id), 'the cap never removes the user’s own records');
  const some = mergeRefreshed(manual.slice(0, 9), fetched, 'naver-shopping');
  assert.deepEqual(some.map((o) => o.id), [...manual.slice(0, 9).map((o) => o.id), 'n2', 'n3', 'n4'], 'fetched results fill only the room left');
});

test('price records live per product on this device, capped, and broken entries are dropped', () => {
  const storage = memory();
  const ref = offerRef({ productId: 'ms-123' });
  assert.equal(offerRef({ url: 'http://x' }), null);
  assert.equal(writeOffers(storage, ref, { requested: { color: 'navy', size: 'M' }, offers: [offer({})] }, now), true);
  const raw = JSON.parse(storage.map.get(OFFER_STORE_KEY));
  raw.products[ref].offers.push({ seller: 'broken' });
  storage.map.set(OFFER_STORE_KEY, JSON.stringify(raw));
  const read = readOffers(storage, ref);
  assert.equal(read.offers.length, 1);
  assert.deepEqual(read.requested, { color: 'navy', size: 'M' });
  const full = { getItem: () => null, setItem() { throw new Error('QuotaExceededError'); } };
  assert.equal(writeOffers(full, ref, { requested: {}, offers: [] }), false, 'a refused write is reported, not hidden');
});

test('supply: the collected catalog price, sources that are not connected with what they need, and a failing source', async () => {
  const product = PRODUCT_BY_ID['ms-3323583'];
  const plain = createSupply({ env: {}, now: () => now.getTime() });
  const sources = plain.sources();
  assert.equal(sources.find((s) => s.id === 'naver-shopping').status, 'not-connected');
  assert.deepEqual(sources.find((s) => s.id === 'naver-shopping').needs.slice(1), ['EOUL_NAVER_CLIENT_ID', 'EOUL_NAVER_CLIENT_SECRET']);
  assert.equal(sources.find((s) => s.id === 'musinsa').status, 'not-connected');
  const base = await plain.lookup({ productId: product.id });
  assert.equal(base.offers.length, 1);
  assert.deepEqual([base.offers[0].source, base.offers[0].price, base.offers[0].checkedAt, base.offers[0].shipping], ['catalog', product.price, `${product.checkedAt}T00:00:00.000Z`, null]);

  const calls = [];
  const fakeFetch = async (url, init) => {
    calls.push({ url, headers: init.headers });
    return new Response(JSON.stringify({ items: [
      { title: '<b>코튼</b> 해링턴 재킷', link: 'https://smartstore.naver.com/x/products/1', lprice: '89000', mallName: '어느 스토어' },
      { title: 'bad', link: 'javascript:alert(1)', lprice: '1', mallName: 'x' },
    ] }), { status: 200 });
  };
  const naver = createSupply({ env: { EOUL_NAVER_CLIENT_ID: 'id', EOUL_NAVER_CLIENT_SECRET: 'secret' }, fetchImpl: fakeFetch, now: () => now.getTime() });
  const found = await naver.lookup({ productId: product.id });
  assert.match(calls[0].url, /^https:\/\/openapi\.naver\.com\/v1\/search\/shop\.json\?query=/);
  assert.equal(calls[0].headers['X-Naver-Client-Id'], 'id');
  const searched = found.offers.filter((o) => o.source === 'naver-shopping');
  assert.equal(searched.length, 1, 'a non-https link is dropped');
  assert.deepEqual([searched[0].title, searched[0].sameProduct, searched[0].shipping, searched[0].price], ['코튼 해링턴 재킷', 'unconfirmed', null, 89000]);
  await naver.lookup({ productId: product.id });
  assert.equal(calls.length, 1, 'a successful lookup is cached for a few minutes');

  const failing = createSupply({ env: { EOUL_NAVER_CLIENT_ID: 'id', EOUL_NAVER_CLIENT_SECRET: 'secret' }, fetchImpl: async () => new Response('', { status: 429 }), now: () => now.getTime() });
  const failed = await failing.lookup({ productId: product.id });
  assert.equal(failed.sources.find((s) => s.id === 'naver-shopping').status, 'failed');
  assert.match(failed.sources.find((s) => s.id === 'naver-shopping').message, /429/);
  assert.equal(failed.offers.length, 1, 'the catalog price is still there');
});

// ── the real bundled screen
const root = fileURLToPath(new URL('../', import.meta.url));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'eoul-offers-'));
after(() => fs.rmSync(temp, { recursive: true, force: true }));
const output = path.join(temp, 'index.html');
execFileSync(process.execPath, [path.join(root, 'tools/build.mjs'), '--out', output]);
const script = fs.readFileSync(output, 'utf8').match(/<script type="module">([\s\S]*?)<\/script>/)[1].replace(
  /\n\}\)\(\);\s*$/,
  '\nglobalThis.testApp = { ready: appReady, saveOfferForm, offerView: () => offerView };\n})();',
);
async function boot() {
  const storage = memory();
  const nodes = new Map(['app', 'sheet-root', 'toast'].map((id) => [id, { innerHTML: '', classList: { add() {}, remove() {} }, querySelector() { return null; }, querySelectorAll() { return []; } }]));
  const listeners = new Map();
  const context = vm.createContext({
    indexedDB: new IDBFactory(), Blob, crypto: globalThis.crypto, structuredClone, btoa, atob, Uint8Array, DataView, TextEncoder, TextDecoder,
    URL: class extends URL { static createObjectURL() { return 'blob:x'; } static revokeObjectURL() {} }, URLSearchParams,
    Image: class { decode() { return Promise.resolve(); } }, localStorage: storage, navigator: {},
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
    app: context.testApp, storage,
    sheet: () => nodes.get('sheet-root').innerHTML,
    async click(dataset) { for (const fn of listeners.get('click') || []) await fn({ target: { closest: () => ({ dataset }) }, preventDefault() {}, stopPropagation() {} }); },
    async change(id, value) { for (const fn of listeners.get('change') || []) await fn({ target: { id, value, dataset: { action: 'offer-requested' } } }); },
  };
}

test('the comparison screen: collected price as is, my records, option and stock checks, lowest total among those checked', async () => {
  const page = await boot();
  const product = PRODUCT_BY_ID['ms-3323583'];
  await page.click({ action: 'open-item', id: product.id });
  assert.match(page.sheet(), /data-action="open-offers" data-id="ms-3323583"/);
  await page.click({ action: 'open-offers', id: product.id });
  let sheet = page.sheet();
  assert.match(sheet, /판매처·총액 비교/);
  assert.ok(sheet.includes(`${product.checkedAt} 수집`), 'the catalog price shows its collection date');
  assert.match(sheet, /배송비 미확인/);
  assert.match(sheet, /총액을 비교할 수 있는 판매처가 아직 없어요/);
  assert.match(sheet, /이 앱에는 아직 실시간 가격 연동이 없어요/);
  assert.doesNotMatch(sheet, /data-action="offer-refresh"/, 'no refresh button without a connected source');

  await page.change('offer-requested-size', 'M');
  assert.equal(JSON.parse(page.storage.getItem('eoul:offers:v1')).products['ms-3323583'].requested.size, 'M');

  const record = async (fields) => {
    await page.click({ action: 'offer-add' });
    return page.app.saveOfferForm({ seller: '', url: 'https://shop.example/p/1', price: '', shipping: '', color: product.color, size: 'M', stock: 'in-stock', sameProduct: true, ...fields });
  };
  assert.equal(await record({ seller: 'A샵', price: '30,000', shipping: '3000' }), true);
  assert.equal(await record({ seller: 'B샵', price: '31000', shipping: '0' }), true);
  assert.equal(await record({ seller: 'C샵', price: '20000', shipping: '0', stock: 'sold-out' }), true);
  assert.equal(await record({ seller: 'D샵', price: '25000', shipping: '0', size: 'L' }), true);
  assert.equal(await record({ seller: 'E샵', price: 'abc' }), false);
  sheet = page.sheet();
  assert.match(sheet, /가격을 원 단위 숫자로 입력해 주세요/);
  assert.match(sheet, /value="E샵"/, 'the typed input stays after an error');
  await page.click({ action: 'offer-form-cancel' });
  sheet = page.sheet();
  assert.match(sheet, /확인한 판매처 2곳 중 총액이 가장 낮은 곳: B샵 31,000원/);
  assert.match(sheet, /현재 최저가라는 뜻은 아니에요/);
  assert.match(sheet, /품절/);
  assert.match(sheet, /옵션 다름/);
  assert.equal(JSON.parse(page.storage.getItem('eoul:offers:v1')).products['ms-3323583'].offers.length, 4);
});
