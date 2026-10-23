import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import {
  createPurchaseJourney, transitionPurchaseJourney, validatePurchaseJourney,
  upgradePurchaseJourneyV4, MAX_JOURNEY_HISTORY, MAX_WARDROBE_STATE_BYTES,
} from '../../../app/lite/src/domain/purchase-journey.js';
import { newWardrobeState, validateWardrobe, upgradeWardrobe, makeGarment, WARDROBE_SCHEMA } from '../../../app/lite/src/domain/wardrobe.js';
import { createWardrobeStore, photoAsset, parseWardrobeBackup } from '../src/wardrobe-store.js';
import { legacyPurchaseV4 } from '../../../app/lite/src/domain/legacy-purchase-v4.js';

const at = (day = 14) => `2026-10-${day}T00:00:00.000Z`;
const candidate = (overrides = {}) => ({
  productId: 'ms-728000', url: 'https://www.musinsa.com/products/728000',
  originalUrl: 'https://www.musinsa.com/products/728000?size=M',
  slot: 'm-oxford', kind: 'shirt', gender: 'm', color: 'white', colorSource: 'curation',
  brand: '무신사 스탠다드', name: '베이식 옥스포드 셔츠 [화이트]',
  price: 33890, priceSource: 'catalog', checkedAt: '2026-10-13',
  source: 'catalog', classificationConfirmed: true, ...overrides,
});
const journey = (id = 'j_evidence') => createPurchaseJourney(candidate(), { id, at: at() });
const personal = (journeys = [], garments = []) => ({
  ...newWardrobeState(), demo: false, demoSelected: [], garments, journeys,
});
const record = (source, action, fields = {}, day = 14) =>
  transitionPurchaseJourney(source, action, { at: at(day), changes: fields });
const last = (value) => value.history.at(-1);
const jpeg = (value) => new Blob([new Uint8Array([255, 216, 255, value])], { type: 'image/jpeg' });
const photoGarment = (id, photoId) => makeGarment({ id, kind: 'shirt', gender: 'M', photoId, createdAt: at() });

// Literal legacy fixtures keep the old data contract independent of the new factory.
const legacyJourney = (overrides = {}) => ({
  id: 'j_legacy', candidate: candidate(), decision: 'hold', stage: 'candidate',
  absence: 'unknown', intent: 'add', option: 'M / white', reason: '현재 저장된 판단 이유',
  garmentId: null, wearCount: 0,
  history: [{ action: 'created', at: at() }, { action: 'hold', at: at(15) }],
  relatedGarmentIds: [], replacementGarmentId: null, replacementConfirmed: false,
  forkedFrom: null, ...overrides,
});
const legacyWardrobe = (journeys = [legacyJourney()], garments = []) => ({
  schema: 4, onboarded: true, gender: 'M', styles: ['classic'],
  brands: ['기록된 브랜드'], brandOnly: true, occasion: null, budget: 90000,
  demo: false, demoSelected: [], garments, journeys, saved: ['ms-728000'], hidden: [],
  legacyFingerprint: null, legacyBaseline: null, legacyDismissed: { owned: [], saved: [] },
});
async function manifest(file) {
  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  assert.equal(new TextDecoder().decode(header.slice(0, 8)), 'EOULBK02');
  const length = new DataView(header.buffer).getUint32(8, true);
  return JSON.parse(await file.slice(12, 12 + length).text());
}
async function photoBytes(snapshot, id) {
  return new Uint8Array(await snapshot.photos.get(id).arrayBuffer());
}
function returnedEvidence() {
  let value = record(journey(), 'ordered', { option: 'M / white', reason: '주문한 M 옵션' });
  value = record(value, 'received', {}, 15);
  value = record(value, 'garment-confirmed', { garmentId: 'g_unit' }, 15);
  value = record(value, 'returned', {
    reason: '어깨가 좁음', feedback: { fit: 'small', returnReason: 'size' },
  }, 16);
  value = record(value, 'note', {
    option: 'L / blue', reason: '다음에는 L을 검토', feedback: { fit: 'right', returnReason: null },
  }, 17);
  return record(value, 'candidate-edit', {
    candidate: candidate({ color: 'blue', colorSource: 'user', price: 39000, priceSource: 'user', checkedAt: '2026-10-17' }),
  }, 17);
}

test('schema 5 starts with a complete created snapshot independent of the candidate input', () => {
  const input = candidate();
  const value = createPurchaseJourney(input, { id: 'j_created', at: at() });
  assert.equal(newWardrobeState().schema, WARDROBE_SCHEMA);
  assert.deepEqual(value.feedback, { fit: null, returnReason: null });
  assert.deepEqual(value.history, [{ action: 'created', at: at(), details: {
    candidate: input, option: '', reason: '', feedback: { fit: null, returnReason: null },
    absence: 'unknown', intent: 'add', relatedGarmentIds: [], replacementGarmentId: null,
    replacementConfirmed: false, garmentId: null,
  } }]);
  assert.notEqual(value.candidate, input);
  assert.notEqual(value.history[0].details.candidate, input);
  assert.notEqual(value.history[0].details.candidate, value.candidate);
  value.candidate.name = '현재 후보 수정';
  input.color = 'blue';
  assert.equal(value.history[0].details.candidate.name, '베이식 옥스포드 셔츠 [화이트]');
  assert.equal(value.history[0].details.candidate.color, 'white');
});

test('hold and buy reasons remain attached to their own decisions after later notes', () => {
  const source = journey();
  const held = record(source, 'hold', { option: 'M', reason: '비슷한 흰 셔츠가 있어 보류' });
  const bought = record(held, 'buy', { reason: '기존 셔츠가 낡아 구매 검토' }, 15);
  const edited = record(bought, 'note', { reason: '배송 전 확인할 메모', option: 'L' }, 16);
  assert.equal(source.history.length, 1);
  assert.equal(edited.decision, 'buy');
  assert.equal(edited.stage, 'candidate');
  assert.deepEqual(edited.history.slice(1).map(({ action, details }) => [action, details.option, details.reason]), [
    ['hold', 'M', '비슷한 흰 셔츠가 있어 보류'],
    ['buy', 'M', '기존 셔츠가 낡아 구매 검토'],
    ['note', 'L', '배송 전 확인할 메모'],
  ]);
  assert.deepEqual(held.history[1], edited.history[1]);
  assert.equal(validatePurchaseJourney(edited), edited);
});

test('M order, return reason and fit survive L notes and candidate color and price edits', () => {
  const value = returnedEvidence();
  const order = value.history.find((entry) => entry.action === 'ordered');
  const returned = value.history.find((entry) => entry.action === 'returned');
  const edited = last(value);
  assert.equal(order.details.option, 'M / white');
  assert.equal(returned.details.option, 'M / white');
  assert.equal(returned.details.reason, '어깨가 좁음');
  assert.deepEqual(returned.details.feedback, { fit: 'small', returnReason: 'size' });
  assert.equal(returned.details.candidate.color, 'white');
  assert.equal(returned.details.candidate.price, 33890);
  assert.equal(returned.details.candidate.checkedAt, '2026-10-13');
  assert.equal(edited.action, 'candidate-edit');
  assert.equal(edited.details.option, 'L / blue');
  assert.equal(edited.details.candidate.color, 'blue');
  assert.equal(edited.details.candidate.price, 39000);
  assert.equal(value.stage, 'returned');
  assert.equal(value.garmentId, 'g_unit');
  value.feedback.fit = 'large';
  value.candidate.price = 41000;
  value.history.at(-1).details.candidate.name = '다른 이벤트의 독립 사본';
  assert.deepEqual(returned.details.feedback, { fit: 'small', returnReason: 'size' });
  assert.equal(returned.details.candidate.price, 33890);
  assert.equal(returned.details.candidate.name, '베이식 옥스포드 셔츠 [화이트]');
});

test('metadata actions record references and confirmation without changing lifecycle, decision or wear count', () => {
  let value = record(record(journey(), 'buy'), 'ordered');
  value = record(value, 'received', {}, 15);
  value = record(value, 'kept', {}, 15);
  value = record(value, 'worn', {}, 15);
  const before = structuredClone(value);
  value = record(value, 'details-change', {
    absence: 'present', intent: 'replace', relatedGarmentIds: ['g_old'],
    replacementGarmentId: 'g_old', replacementConfirmed: true, garmentId: 'g_new',
  }, 16);
  const changes = last(value);
  for (const action of ['note', 'candidate-edit', 'garment-confirmed', 'correction', 'imported'])
    value = record(value, action, {}, 16);
  assert.deepEqual([value.stage, value.decision, value.wearCount], [before.stage, before.decision, before.wearCount]);
  assert.deepEqual(changes.details.relatedGarmentIds, ['g_old']);
  assert.equal(changes.details.replacementGarmentId, 'g_old');
  assert.equal(changes.details.replacementConfirmed, true);
  assert.equal(changes.details.garmentId, 'g_new');
  value.relatedGarmentIds.push('g_another');
  assert.deepEqual(changes.details.relatedGarmentIds, ['g_old']);
  assert.equal(last(value).details.relatedGarmentIds.length, 1);
});

test('a fork has its own history and feedback even when the exact product URL is reused', () => {
  const original = returnedEvidence();
  const originalCopy = structuredClone(original);
  let fork = createPurchaseJourney(original.candidate, { id: 'j_fork', at: at(17) });
  fork = record({ ...fork, forkedFrom: original.id }, 'note', {
    option: 'L / blue', reason: '교환 대신 새 옵션 검토', feedback: { fit: null, returnReason: null },
  }, 17);
  fork = record(fork, 'buy', {}, 18);
  assert.equal(fork.forkedFrom, original.id);
  assert.equal(fork.history.length, 3);
  assert.equal(fork.stage, 'candidate');
  assert.equal(fork.garmentId, null);
  assert.deepEqual(fork.feedback, { fit: null, returnReason: null });
  fork.history[0].details.candidate.price = 20000;
  assert.deepEqual(original, originalCopy);
  assert.equal(validateWardrobe(personal([original, fork])).journeys.length, 2);
});

test('v4 import preserves known current values and marks unknown old details without inventing history', () => {
  const old = legacyJourney();
  const source = structuredClone(old);
  const upgraded = upgradePurchaseJourneyV4(old, { at: at(18) });
  assert.deepEqual(old, source);
  assert.deepEqual(upgraded.history.slice(0, source.history.length), source.history.map((entry) => ({ ...entry, details: null })));
  assert.deepEqual(upgraded.feedback, { fit: null, returnReason: null });
  assert.deepEqual(last(upgraded), { action: 'imported', at: at(18), details: {
    candidate: source.candidate, option: source.option, reason: source.reason,
    feedback: { fit: null, returnReason: null }, absence: source.absence, intent: source.intent,
    relatedGarmentIds: source.relatedGarmentIds, replacementGarmentId: source.replacementGarmentId,
    replacementConfirmed: source.replacementConfirmed, garmentId: source.garmentId,
  } });
  const { feedback, history, ...scalars } = upgraded;
  const { history: oldHistory, ...oldScalars } = source;
  assert.deepEqual(scalars, oldScalars);
  upgraded.candidate.price = 45000;
  assert.equal(last(upgraded).details.candidate.price, 33890);
  assert.equal(old.candidate.price, 33890);
  const wardrobe = legacyWardrobe([old]);
  assert.equal(validateWardrobe(wardrobe), wardrobe);
  const converted = upgradeWardrobe(wardrobe, { at: at(18) });
  assert.equal(converted.schema, WARDROBE_SCHEMA);
  assert.deepEqual(converted.journeys[0], upgradePurchaseJourneyV4(old, { at: at(18) }));
  const { wears, offerRecords, ...withoutDiary } = converted;
  assert.deepEqual(wears, [], 'the wear diary starts empty');
  assert.deepEqual(offerRecords, [], 'seller notes start empty');
  assert.deepEqual({ ...withoutDiary, schema: 4, journeys: wardrobe.journeys }, wardrobe);
});

test('a future-dated legacy history skips the import marker instead of backdating current evidence', () => {
  const old = legacyJourney({ history: [{ action: 'created', at: at(19) }, { action: 'hold', at: at(20) }] });
  const upgraded = upgradePurchaseJourneyV4(old, { at: at(18) });
  assert.equal(upgraded.history.length, old.history.length);
  assert.equal(upgraded.history.some((entry) => entry.action === 'imported'), false);
  assert.ok(upgraded.history.every((entry) => entry.details === null));
  assert.equal(upgraded.reason, old.reason);
  assert.equal(validatePurchaseJourney(upgraded), upgraded);
});

test('v4 migration keeps all 512 events and uses the final free slot only when one exists', () => {
  const old = legacyJourney({ history: [
    { action: 'created', at: at() },
    ...Array.from({ length: MAX_JOURNEY_HISTORY - 1 }, () => ({ action: 'hold', at: at(15) })),
  ] });
  const source = structuredClone(old);
  const full = upgradePurchaseJourneyV4(old, { at: at(18) });
  assert.equal(full.history.length, MAX_JOURNEY_HISTORY);
  assert.deepEqual(full.history, source.history.map((entry) => ({ ...entry, details: null })));
  assert.deepEqual(old, source);
  assert.equal(validateWardrobe(upgradeWardrobe(legacyWardrobe([old]), { at: at(18) })).schema, WARDROBE_SCHEMA);
  const almost = { ...old, history: old.history.slice(0, -1) };
  const completed = upgradePurchaseJourneyV4(almost, { at: at(18) });
  assert.equal(completed.history.length, MAX_JOURNEY_HISTORY);
  assert.equal(last(completed).action, 'imported');
  assert.equal(last(completed).at, at(18));
});

test('frozen v4 migration refuses unknown keys and malformed old history before changing the source', () => {
  assert.throws(() => legacyPurchaseV4.validatePurchaseJourney(journey()));
  assert.throws(() => validateWardrobe(legacyWardrobe([journey()])), 'old readers must refuse a schema 5 journey');
  const mutations = [
    (old) => { old.feedback = { fit: null, returnReason: null }; },
    (old) => { old.futureValue = 'preserve'; },
    (old) => { old.candidate.futureValue = 'preserve'; },
    (old) => { old.history[0].details = null; },
    (old) => { old.history[0].futureValue = 'preserve'; },
    (old) => { old.history[1].action = 'note'; },
    (old) => { old.history[1].at = '2026-02-31T00:00:00.000Z'; },
    (old) => { old.wearCount = 1; },
    (old) => { delete old.forkedFrom; },
  ];
  for (const mutate of mutations) {
    const old = legacyJourney();
    mutate(old);
    const source = structuredClone(old);
    assert.throws(() => upgradePurchaseJourneyV4(old, { at: at(18) }));
    assert.throws(() => validateWardrobe(legacyWardrobe([old])));
    assert.throws(() => upgradeWardrobe(legacyWardrobe([old]), { at: at(18) }));
    assert.deepEqual(old, source);
  }
});

test('strict v2 and v3 paths still reach the current schema while retaining known records', () => {
  const v2 = {
    schema: 2, onboarded: true, gender: 'M', style: 'classic', occasion: null, budget: null,
    demo: false, demoSelected: [], saved: ['ms-728000'], hidden: [], legacyFingerprint: null,
    legacyBaseline: null, legacyDismissed: { owned: [], saved: [] },
    garments: [{ id: 'g_v2', kind: 'shirt', gender: 'M', slotId: 'm-oxford-white', source: 'user',
      photoId: null, label: '이전 흰 셔츠', attrs: null, createdAt: at() }],
  };
  const copy = structuredClone(v2);
  const upgraded = upgradeWardrobe(v2, { at: at(18) });
  assert.equal(upgraded.schema, WARDROBE_SCHEMA);
  assert.deepEqual(upgraded.journeys, []);
  assert.deepEqual(upgraded.saved, v2.saved);
  assert.deepEqual(upgraded.garments[0], makeGarment({
    id: 'g_v2', kind: 'shirt', gender: 'M', slot: 'm-oxford', color: 'white',
    label: '이전 흰 셔츠', source: 'user', createdAt: at(),
  }));
  assert.deepEqual(v2, copy);
  const { journeys, ...knownV3 } = legacyWardrobe([], upgraded.garments);
  const v3 = { ...knownV3, schema: 3 };
  assert.deepEqual(upgradeWardrobe(v3, { at: at(18) }), { ...v3, schema: WARDROBE_SCHEMA, journeys: [], wears: [], offerRecords: [] });
  for (const old of [v2, v3]) {
    assert.throws(() => upgradeWardrobe({ ...old, futureValue: 'preserve' }, { at: at(18) }));
    assert.throws(() => upgradeWardrobe({ ...old, journeys: [] }, { at: at(18) }));
  }
});

test('schema 5 validates historic metadata and feedback and refuses future snapshot fields', () => {
  const source = returnedEvidence();
  const mutations = [
    (value) => { value.feedback.fit = 'unknown-fit'; },
    (value) => { value.feedback.returnReason = 'unknown-return'; },
    (value) => { value.feedback.futureValue = true; },
    (value) => { delete value.feedback.returnReason; },
    (value) => { last(value).futureValue = true; },
    (value) => { last(value).details.futureValue = true; },
    (value) => { delete last(value).details.option; },
    (value) => { last(value).details.feedback.fit = 'unknown-fit'; },
    (value) => { last(value).details.feedback.futureValue = true; },
    (value) => { last(value).details.candidate.futureValue = true; },
    (value) => { last(value).details.relatedGarmentIds = ['g_old', 'g_old']; },
    (value) => { last(value).details.reason = '가'.repeat(501); },
  ];
  for (const mutate of mutations) {
    const value = structuredClone(source);
    mutate(value);
    assert.throws(() => validatePurchaseJourney(value));
    assert.throws(() => validateWardrobe(personal([value])));
  }
});

test('binary backup v2 round trip retains schema 5 historic snapshots, unknown old details and synthetic photo bytes', async () => {
  const asset = await photoAsset(jpeg(31));
  const imported = upgradePurchaseJourneyV4(legacyJourney(), { at: at(18) });
  const state = personal([returnedEvidence(), imported], [photoGarment('g_unit', asset.id)]);
  const source = createWardrobeStore({ indexedDB: new IDBFactory() });
  const target = createWardrobeStore({ indexedDB: new IDBFactory() });
  try {
    await source.commit(state, 0, [asset]);
    const backup = await source.backup();
    const metadata = await manifest(backup);
    assert.equal(metadata.version, 2);
    assert.equal(metadata.state.schema, WARDROBE_SCHEMA);
    const parsed = await parseWardrobeBackup(backup);
    assert.deepEqual(parsed.state, state);
    assert.equal(parsed.assets.length, 1);
    await target.commit(parsed.state, 0, parsed.assets);
    const restored = await target.read();
    assert.deepEqual(restored.state, state);
    assert.deepEqual(await photoBytes(restored, asset.id), new Uint8Array([255, 216, 255, 31]));
    assert.equal(restored.state.journeys[1].history[0].details, null);
    assert.equal(restored.state.journeys[0].history.find((entry) => entry.action === 'returned').details.reason, '어깨가 좁음');
  } finally { source.close(); target.close(); }
});

test('quota failure during schema 5 migration preserves the v4 source, photo bytes and pending input for one retry', async () => {
  const originalPhoto = await photoAsset(jpeg(41));
  const replacementPhoto = await photoAsset(jpeg(42));
  const source = legacyWardrobe([legacyJourney()], [photoGarment('g_legacy', originalPhoto.id)]);
  const store = createWardrobeStore({ indexedDB: new IDBFactory() });
  try {
    await store.commit(source, 0, [originalPhoto]);
    const before = await store.read();
    const pending = upgradeWardrobe(before.state, { at: at(18) });
    pending.journeys[0] = record(pending.journeys[0], 'note', { option: 'L', reason: '저장 실패 후에도 남길 입력' }, 18);
    pending.garments[0].photoId = replacementPhoto.id;
    const input = structuredClone(pending);
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'records') throw new DOMException('migration quota', 'QuotaExceededError');
      return put.apply(this, args);
    };
    try { await assert.rejects(store.commit(pending, before.revision, [replacementPhoto], before.epoch), /migration quota/); }
    finally { IDBObjectStore.prototype.put = put; }
    const failed = await store.read();
    assert.deepEqual(failed.state, source);
    assert.equal(failed.revision, before.revision);
    assert.equal(failed.epoch, before.epoch);
    assert.deepEqual(await photoBytes(failed, originalPhoto.id), new Uint8Array([255, 216, 255, 41]));
    assert.equal((await store.recoveryState()).photoCount, 1, 'aborted replacement leaves no orphan blob');
    assert.deepEqual(pending, input, 'the caller retains its exact pending input');
    await store.commit(pending, failed.revision, [replacementPhoto], failed.epoch);
    const retried = await store.read();
    assert.deepEqual(retried.state, input);
    assert.equal(retried.revision, before.revision + 1);
    assert.equal(retried.state.journeys[0].history.filter((entry) => entry.action === 'imported').length, 1);
    assert.deepEqual(await photoBytes(retried, replacementPhoto.id), new Uint8Array([255, 216, 255, 42]));
  } finally { store.close(); }
});

test('a stale v4 tab cannot overwrite a schema 5 note or photo and retains its unsaved input', async () => {
  const indexedDB = new IDBFactory();
  const first = createWardrobeStore({ indexedDB });
  const second = createWardrobeStore({ indexedDB });
  const asset = await photoAsset(jpeg(51));
  const stalePhoto = await photoAsset(jpeg(52));
  const old = legacyWardrobe([legacyJourney()], [photoGarment('g_shared', asset.id)]);
  try {
    await first.commit(old, 0, [asset]);
    const stale = await second.read();
    const winner = upgradeWardrobe(old, { at: at(18) });
    winner.journeys[0] = record(winner.journeys[0], 'note', { reason: '먼저 저장한 판단' }, 18);
    await first.commit(winner, stale.revision, [], stale.epoch);
    const pending = upgradeWardrobe(stale.state, { at: at(18) });
    pending.journeys[0] = record(pending.journeys[0], 'note', { option: 'L', reason: '늦게 저장한 입력' }, 18);
    pending.garments[0].photoId = stalePhoto.id;
    const input = structuredClone(pending);
    await assert.rejects(second.commit(pending, stale.revision, [stalePhoto], stale.epoch), (error) => error.code === 'conflict');
    const current = await first.read();
    assert.deepEqual(current.state, winner);
    assert.equal(current.revision, stale.revision + 1);
    assert.equal(current.epoch, stale.epoch);
    assert.deepEqual(await photoBytes(current, asset.id), new Uint8Array([255, 216, 255, 51]));
    assert.equal((await first.recoveryState()).photoCount, 1);
    assert.deepEqual(pending, input);
    assert.deepEqual(stale.state, old);
  } finally { first.close(); second.close(); }
});

test('the 512-event write limit preserves every event instead of truncating old evidence', () => {
  const value = upgradePurchaseJourneyV4(legacyJourney({ history: [
    { action: 'created', at: at() },
    ...Array.from({ length: MAX_JOURNEY_HISTORY - 2 }, () => ({ action: 'hold', at: at(15) })),
  ] }), { at: at(18) });
  const source = structuredClone(value);
  assert.equal(value.history.length, MAX_JOURNEY_HISTORY);
  assert.throws(() => transitionPurchaseJourney(value, 'note', { at: at(18) }), /너무 많/);
  assert.deepEqual(value, source);
});

test('UTF-8 size limit refuses oversized snapshot writes without losing durable source or caller input', async () => {
  const store = createWardrobeStore({ indexedDB: new IDBFactory() });
  try {
    const original = personal([journey('j_original')]);
    await store.commit(original, 0);
    const pending = personal(Array.from({ length: 150 }, (_, i) => record(journey(`j_utf8_${i}`), 'note', {
      reason: '가'.repeat(500), option: '나'.repeat(160),
    })));
    const json = JSON.stringify(pending);
    assert.ok(json.length < MAX_WARDROBE_STATE_BYTES, 'character count alone misses the UTF-8 boundary');
    assert.ok(new TextEncoder().encode(json).length > MAX_WARDROBE_STATE_BYTES);
    const input = structuredClone(pending);
    await assert.rejects(store.commit(pending, 1), /기록 정보가 너무 큽니다/);
    assert.deepEqual((await store.read()).state, original);
    assert.equal((await store.read()).revision, 1);
    assert.deepEqual(pending, input);
  } finally { store.close(); }
});
