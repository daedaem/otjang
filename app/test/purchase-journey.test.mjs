import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import {
  createPurchaseJourney, transitionPurchaseJourney, validatePurchaseCandidate,
  validatePurchaseJourney, isPublicPurchaseUrl, returnedGarmentIds,
} from '../src/purchase-journey.js';
import { newWardrobeState, validateWardrobe, upgradeWardrobe, wardrobeView, makeGarment } from '../src/wardrobe.js';
import { createWardrobeStore, photoAsset, parseWardrobeBackup } from '../src/wardrobe-store.js';

const purchaseAt = (day = 14) => `2026-10-${day}T00:00:00.000Z`;
const purchaseCandidate = (overrides = {}) => ({
  productId: 'ms-728000', url: 'https://www.musinsa.com/products/728000', originalUrl: 'https://www.musinsa.com/products/728000?size=M',
  slot: 'm-oxford', kind: 'shirt', gender: 'm', color: 'white', colorSource: 'curation',
  brand: '무신사 스탠다드', name: '베이식 옥스포드 셔츠 [화이트]', price: 33890, priceSource: 'catalog',
  checkedAt: '2026-10-13', source: 'catalog', classificationConfirmed: true, ...overrides,
});
const purchaseJourney = (id = 'j_example') => createPurchaseJourney(purchaseCandidate(), { id, at: purchaseAt() });
const purchasePersonal = (garments = [], journeys = []) => ({ ...newWardrobeState(), demo: false, demoSelected: [], garments, journeys });
function purchaseReceived(journey = purchaseJourney()) {
  return transitionPurchaseJourney(transitionPurchaseJourney(journey, 'ordered', { at: purchaseAt() }), 'received', { at: purchaseAt() });
}

test('purchase intentions remain separate from orders and visits have no transition', () => {
  const source = purchaseJourney();
  const decided = transitionPurchaseJourney(source, 'buy', { at: purchaseAt() });
  assert.equal(decided.decision, 'buy');
  assert.equal(decided.stage, 'candidate');
  assert.equal(source.decision, null, 'pure transition leaves the current snapshot untouched');
  assert.throws(() => transitionPurchaseJourney(decided, 'seller-visit', { at: purchaseAt() }), /지원하지/);
  assert.throws(() => transitionPurchaseJourney(decided, 'received', { at: purchaseAt() }), /주문/);
  const ordered = transitionPurchaseJourney(decided, 'ordered', { at: purchaseAt() });
  assert.equal(ordered.stage, 'ordered');
  assert.equal(ordered.garmentId, null, 'an order does not claim possession');
});

test('receipt, wear and return preserve unit identity and explicit original garment reference', () => {
  const received = { ...purchaseReceived(), garmentId: 'g_unit' };
  assert.throws(() => transitionPurchaseJourney(received, 'worn', { at: purchaseAt(15) }), /보관하기로/);
  const kept = transitionPurchaseJourney(received, 'kept', { at: purchaseAt(15) });
  const worn = transitionPurchaseJourney(kept, 'worn', { at: purchaseAt(15) });
  assert.equal(worn.wearCount, 1);
  const returned = transitionPurchaseJourney(worn, 'returned', { at: purchaseAt(16) });
  assert.equal(returned.garmentId, 'g_unit');
  assert.equal(returned.wearCount, 1);
  assert.throws(() => transitionPurchaseJourney(returned, 'worn', { at: purchaseAt(17) }), /보관하기로/);
  const receivedAgain = transitionPurchaseJourney(returned, 'received', { at: purchaseAt(17) });
  assert.equal(receivedAgain.id, received.id);
  assert.equal(receivedAgain.garmentId, 'g_unit');
  assert.equal(receivedAgain.wearCount, 1);
  assert.throws(() => validatePurchaseJourney({ ...worn, wearCount: 2 }), /상태와 기록/);
  assert.throws(() => transitionPurchaseJourney(receivedAgain, 'returned', { at: purchaseAt(13) }), /날짜나 순서/);
});

test('candidate input refuses private, credential, disguised and executable URLs', () => {
  for (const url of [
    'javascript:alert(1)', 'data:text/html,x', 'http://www.musinsa.com/products/1',
    'https://user:password@www.musinsa.com/products/1', 'https://localhost/',
    'https://a.localhost/', 'https://photos.local/', 'https://10.0.0.1/',
    'https://172.31.1.1/', 'https://192.168.1.1/', 'https://127.1/',
    'https://2130706433/', 'https://0x7f000001/', 'https://169.254.169.254/',
    'https://100.100.1.1/', 'https://[::1]/', 'https://[fc00::1]/',
    'https://[::ffff:127.0.0.1]/', 'https://[2001:db8::1]/',
    'https:/www.musinsa.com/products/1', 'https://www.musinsa.com\\@localhost/',
    'https://www.musinsa.com:8443/products/1',
  ]) {
    assert.equal(isPublicPurchaseUrl(url), false, url);
    assert.throws(() => validatePurchaseCandidate(purchaseCandidate({ url })), /링크/);
    assert.throws(() => validatePurchaseCandidate(purchaseCandidate({ originalUrl: url })), /링크/);
  }
  assert.equal(isPublicPurchaseUrl('https://www.musinsa.com/products/1?color=white#size'), true);
  assert.equal(isPublicPurchaseUrl('https://[2606:4700:4700::1111]/'), true);
});

test('candidate certainty and source snapshots are not silently upgraded or normalized', () => {
  const candidate = purchaseCandidate({ productId: null, slot: null, kind: null, color: null, colorSource: null,
    brand: '', name: '', price: null, priceSource: null, checkedAt: null, source: 'user', classificationConfirmed: false });
  const created = createPurchaseJourney(candidate, { id: 'j_link_only', at: purchaseAt() });
  assert.deepEqual(created.candidate, candidate);
  assert.notEqual(created.candidate, candidate);
  assert.throws(() => validatePurchaseCandidate({ ...candidate, classificationConfirmed: true }), /확인 정보/);
  assert.throws(() => validatePurchaseCandidate({ ...candidate, slot: 'm-oxford' }), /종류/);
  assert.throws(() => validatePurchaseCandidate({ ...candidate, ignoredFutureValue: 'preserve' }), /지원하지/);
  assert.throws(() => validatePurchaseCandidate(purchaseCandidate({ checkedAt: '2026-02-31' })), /확인 정보/);
  assert.throws(() => validatePurchaseCandidate(purchaseCandidate({ priceSource: null })), /확인 정보/);
  assert.throws(() => validatePurchaseCandidate(purchaseCandidate({ price: null })), /확인 정보/);
  assert.equal(validatePurchaseCandidate(purchaseCandidate({ source: 'catalog', price: 19000, priceSource: 'user' })).priceSource, 'user');
  assert.throws(() => validatePurchaseJourney({ ...created, ignoredFutureValue: true }), /지원하지/);
  assert.throws(() => validatePurchaseJourney({ ...created, history: [{ ...created.history[0], at: '2026-02-31T00:00:00.000Z' }] }), /날짜/);
});

test('strict v3 migration adds journeys while preserving every known field and refusing unknown fields', () => {
  const old = { ...purchasePersonal([makeGarment({ id: 'g_old', kind: 'shirt', gender: 'M' })]), schema: 3 };
  delete old.journeys;
  delete old.wears;
  const original = structuredClone(old);
  assert.equal(validateWardrobe(old), old);
  const migrated = upgradeWardrobe(old);
  assert.deepEqual(migrated, { ...original, schema: 6, journeys: [], wears: [] });
  assert.deepEqual(old, original, 'migration is pure');
  assert.throws(() => upgradeWardrobe({ ...old, futureField: 'preserve' }), /지원하지/);
  assert.throws(() => upgradeWardrobe({ ...old, journeys: [] }), /지원하지/);
  assert.throws(() => validateWardrobe({ ...migrated, journeys: [purchaseJourney(), purchaseJourney()] }), /중복/);
  assert.throws(() => validateWardrobe({ ...migrated, journeys: Array.from({ length: 201 }, (_, i) => purchaseJourney(`j_${i}`)) }), /최대 200/);
});

test('returned garments remain in durable records and disappear only from active closet recommendations', () => {
  const garment = makeGarment({ id: 'g_unit', kind: 'shirt', gender: 'M', color: 'white' });
  const received = { ...purchaseReceived(), garmentId: garment.id };
  const returned = transitionPurchaseJourney(received, 'returned', { at: purchaseAt() });
  const source = purchasePersonal([garment], [returned]);
  assert.deepEqual(wardrobeView(purchasePersonal([garment], [received])).closet, [], 'receipt is provisional');
  const kept = transitionPurchaseJourney(received, 'kept', { at: purchaseAt() });
  assert.deepEqual(wardrobeView(purchasePersonal([garment], [kept])).closet, [garment]);
  const view = wardrobeView(source);
  assert.deepEqual(view.garments, [garment]);
  assert.deepEqual(view.closet, []);
  assert.deepEqual(source.garments, [garment]);
  const otherReceived = { ...transitionPurchaseJourney(purchaseReceived(purchaseJourney('j_other_unit')), 'kept', { at: purchaseAt() }), garmentId: garment.id };
  assert.equal(returnedGarmentIds({ ...source, journeys: [returned, otherReceived] }).size, 0);
  assert.deepEqual(wardrobeView({ ...source, journeys: [returned, otherReceived] }).closet, [garment]);
});

test('a kept replacement retires only the specifically confirmed old item while preserving its record', () => {
  const older = makeGarment({ id: 'g_older', kind: 'shirt', gender: 'M', color: 'blue' });
  const newer = makeGarment({ id: 'g_newer', kind: 'shirt', gender: 'M', color: 'white' });
  const kept = {
    ...transitionPurchaseJourney(purchaseReceived(), 'kept', { at: purchaseAt() }),
    garmentId: newer.id, intent: 'replace', replacementGarmentId: older.id,
    replacementConfirmed: false, relatedGarmentIds: [older.id],
  };
  assert.deepEqual(wardrobeView(purchasePersonal([older, newer], [kept])).closet, [older, newer]);
  const confirmed = { ...kept, replacementConfirmed: true };
  const view = wardrobeView(purchasePersonal([older, newer], [confirmed]));
  assert.deepEqual(view.closet, [newer]);
  assert.deepEqual(view.garments, [older, newer]);
  const returned = transitionPurchaseJourney(confirmed, 'returned', { at: purchaseAt() });
  assert.deepEqual(wardrobeView(purchasePersonal([older, newer], [returned])).closet, [], 'returning the new item cannot resurrect the explicitly retired old item');
  assert.deepEqual(wardrobeView(purchasePersonal([older, newer], [{ ...returned, replacementConfirmed: false }])).closet, [older], 'only an explicit correction restores the old item');
  assert.deepEqual(purchasePersonal([older, newer], [returned]).garments, [older, newer]);
  assert.throws(() => validatePurchaseJourney({ ...confirmed, replacementGarmentId: newer.id }), /진행 기록/);
});

test('receipt and garment photo metadata fail atomically and retry writes exactly one unit', async () => {
  const store = createWardrobeStore({ indexedDB: new IDBFactory() });
  const initial = await store.load();
  const asset = await photoAsset(new Blob([new Uint8Array([255, 216, 255, 9])], { type: 'image/jpeg' }));
  const journey = purchaseJourney();
  await store.commit(purchasePersonal([], [journey]), initial.revision);
  const received = { ...purchaseReceived(journey), garmentId: 'g_received' };
  const garment = makeGarment({ id: received.garmentId, kind: 'shirt', gender: 'M', photoId: asset.id });
  const next = purchasePersonal([garment], [received]);
  const put = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (...args) {
    if (this.name === 'records') throw new DOMException('receipt quota', 'QuotaExceededError');
    return put.apply(this, args);
  };
  try { await assert.rejects(store.commit(next, 2, [asset]), /receipt quota/); }
  finally { IDBObjectStore.prototype.put = put; }
  const failed = await store.read();
  assert.equal(failed.state.journeys[0].stage, 'candidate');
  assert.equal(failed.state.garments.length, 0);
  assert.equal(failed.photos.size, 0);
  await store.commit(next, failed.revision, [asset]);
  const committed = await store.read();
  assert.equal(committed.state.journeys.length, 1);
  assert.equal(committed.state.journeys[0].garmentId, committed.state.garments[0].id);
  assert.equal(committed.photos.size, 1);
  await store.commit({ ...committed.state, journeys: [transitionPurchaseJourney(received, 'returned', { at: purchaseAt() })] }, committed.revision);
  const returned = await store.read();
  assert.equal(wardrobeView(returned.state).closet.length, 0);
  assert.equal(returned.state.garments.length, 1);
  assert.equal(returned.photos.size, 1);
  const parsed = await parseWardrobeBackup(await store.backup());
  assert.deepEqual(parsed.state, returned.state);
  assert.equal(parsed.assets.length, 1);
  store.close();
});

test('a second tab cannot overwrite a receipt with a stale candidate journey', async () => {
  const indexedDB = new IDBFactory();
  const first = createWardrobeStore({ indexedDB });
  const source = purchasePersonal([], [purchaseJourney()]);
  await first.commit(source, 0);
  const second = createWardrobeStore({ indexedDB });
  const stale = await second.read();
  await first.commit({ ...source, journeys: [purchaseReceived(source.journeys[0])] }, 1);
  await assert.rejects(second.commit(stale.state, stale.revision), (error) => error.code === 'conflict');
  assert.equal((await first.read()).state.journeys[0].stage, 'received');
  first.close(); second.close();
});

test('an existing v3 envelope and photo upgrade through one revision without changing original bytes', async () => {
  const store = createWardrobeStore({ indexedDB: new IDBFactory() });
  const asset = await photoAsset(new Blob([new Uint8Array([255, 216, 255, 37])], { type: 'image/jpeg' }));
  const old = {
    ...purchasePersonal([makeGarment({ id: 'g_v3', kind: 'shirt', gender: 'M', photoId: asset.id })]),
    schema: 3,
  };
  delete old.journeys;
  delete old.wears;
  await store.commit(old, 0, [asset]);
  const read = await store.read();
  assert.equal(read.state.schema, 3);
  const upgraded = upgradeWardrobe(read.state);
  await store.commit(upgraded, read.revision, [], read.epoch);
  const current = await store.read();
  assert.equal(current.state.schema, 6);
  assert.equal(current.revision, read.revision + 1);
  assert.equal(current.epoch, read.epoch);
  assert.deepEqual(current.state.garments, old.garments);
  assert.deepEqual(new Uint8Array(await current.photos.get(asset.id).arrayBuffer()), new Uint8Array(await asset.blob.arrayBuffer()));
  const parsed = await parseWardrobeBackup(await store.backup());
  assert.deepEqual(parsed.state, current.state);
  store.close();
});

test('each purchase unit keeps independent options even when both have the exact same product URL', () => {
  const first = { ...purchaseJourney('j_size_m'), option: 'M / white' };
  const second = { ...purchaseJourney('j_size_l'), option: 'L / white' };
  const state = purchasePersonal([], [first, second]);
  assert.equal(validateWardrobe(state), state);
  assert.equal(state.journeys.length, 2);
  assert.equal(state.journeys[0].candidate.productId, state.journeys[1].candidate.productId);
  assert.notEqual(state.journeys[0].id, state.journeys[1].id);
});

test('a fork starts a new unit history and cannot refer to itself; a missing original stays readable', () => {
  const original = { ...purchaseReceived(purchaseJourney('j_original')), option: 'M / white' };
  const fork = { ...createPurchaseJourney(original.candidate, { id: 'j_size_l', at: purchaseAt(15) }), forkedFrom: original.id, option: 'L / white' };
  assert.equal(validatePurchaseJourney(fork), fork);
  assert.equal(fork.stage, 'candidate');
  assert.equal(fork.decision, null);
  assert.equal(fork.garmentId, null);
  assert.equal(fork.history.length, 1);
  assert.equal(original.stage, 'received');
  assert.equal(original.option, 'M / white');
  assert.equal(validateWardrobe(purchasePersonal([], [fork])).journeys[0].forkedFrom, original.id);
  assert.throws(() => validatePurchaseJourney({ ...fork, forkedFrom: fork.id }), /진행 기록/);
});

test('new large purchase records fail before writes rather than creating an unexportable normal backup', () => {
  const large = purchasePersonal([], Array.from({ length: 200 }, (_, i) => ({
    ...purchaseJourney(`j_large_${i}`),
    candidate: purchaseCandidate({ url: `https://www.musinsa.com/products/728000?x=${'x'.repeat(1900)}` }),
    reason: '가'.repeat(500), option: '나'.repeat(160),
  })));
  assert.throws(() => validateWardrobe(large), /기록 정보가 너무 큽니다/);
});
