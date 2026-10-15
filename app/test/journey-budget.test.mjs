import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import {
  createPurchaseJourney, transitionPurchaseJourney, purchaseJourneyDetails, MAX_WARDROBE_STATE_BYTES,
} from '../src/purchase-journey.js';
import { newWardrobeState, upgradeWardrobe, validateWardrobe, makeGarment } from '../src/wardrobe.js';
import {
  createWardrobeStore, photoAsset, parseWardrobeBackup, journeyStorageUsage,
  wardrobeStateStorageUsage, MAX_JOURNEY_STATE_BYTES, JOURNEY_STATE_WARNING_BYTES,
  MAX_OWNERSHIP_JOURNEY_STATE_BYTES, WARDROBE_STATE_WARNING_BYTES,
} from '../src/wardrobe-store.js';

const at = (day = 14) => `2026-10-${day}T00:00:00.000Z`;
const bytes = (value) => new TextEncoder().encode(JSON.stringify(value)).length;
const candidate = (large = false) => ({
  productId: 'ms-728000',
  url: `https://www.musinsa.com/products/728000${large ? `?x=${'x'.repeat(1900)}` : ''}`,
  originalUrl: `https://www.musinsa.com/products/728000${large ? `?x=${'x'.repeat(1900)}` : '?size=M'}`,
  slot: 'm-oxford', kind: 'shirt', gender: 'm', color: 'white', colorSource: 'user',
  brand: '사용자가 기록한 브랜드', name: '흰 셔츠', price: 33890, priceSource: 'user',
  checkedAt: '2026-10-14', source: 'user', classificationConfirmed: true,
});
const personal = (journeys = [], garments = []) => ({
  ...newWardrobeState(), demo: false, demoSelected: [], journeys, garments,
});
const jpeg = (value) => new Blob([new Uint8Array([255, 216, 255, value])], { type: 'image/jpeg' });
const garment = (id, photoId = null) => makeGarment({ id, kind: 'shirt', gender: 'M', photoId, createdAt: at() });
const budgetError = (error) => error.code === 'journey-budget' && error.limitBytes === MAX_JOURNEY_STATE_BYTES;
async function photoBytes(snapshot, id) {
  return new Uint8Array(await snapshot.photos.get(id).arrayBuffer());
}

function keptJourney() {
  let value = createPurchaseJourney(candidate(), { id: 'j_wear', at: at() });
  value = transitionPurchaseJourney(value, 'ordered', { at: at() });
  value = transitionPurchaseJourney(value, 'received', { at: at(), changes: { garmentId: 'g_unit' } });
  value = transitionPurchaseJourney(value, 'kept', { at: at() });
  return transitionPurchaseJourney(value, 'note', { at: at(), changes: { reason: '가'.repeat(500), option: '나'.repeat(160) } });
}

// Fit an actual kept record immediately below the byte boundary without
// constructing hundreds of separate pure transitions just to size the fixture.
function nearBudget() {
  const base = keptJourney();
  const event = { action: 'worn', at: at(), details: purchaseJourneyDetails(base) };
  const perEvent = bytes(event) + 1;
  const count = Math.floor((MAX_JOURNEY_STATE_BYTES - bytes([base])) / perEvent);
  const value = {
    ...base, wearCount: count,
    history: [...base.history, ...Array.from({ length: count }, () => structuredClone(event))],
  };
  assert.ok(value.history.length < 512);
  assert.ok(journeyStorageUsage(personal([value])).bytes <= MAX_JOURNEY_STATE_BYTES);
  assert.ok(journeyStorageUsage(personal([transitionPurchaseJourney(value, 'worn', { at: at() })])).overBudget);
  return value;
}

function budgetPair(stage, limitBytes = MAX_JOURNEY_STATE_BYTES, retirement = false) {
  const base = keptJourney();
  let target = createPurchaseJourney(candidate(), { id: 'j_target', at: at() });
  target = transitionPurchaseJourney(target, 'note', { at: at(), changes: { reason: '가'.repeat(500), option: '나'.repeat(160) } });
  target = transitionPurchaseJourney(target, 'ordered', { at: at() });
  if (stage !== 'ordered') target = transitionPurchaseJourney(target, 'received', { at: at(), changes: { garmentId: 'g_target' } });
  if (stage === 'kept') target = transitionPurchaseJourney(target, 'kept', { at: at() });
  if (retirement) target = transitionPurchaseJourney(target, 'details-change', { at: at(), changes: {
    intent: 'replace', replacementGarmentId: 'g_old', relatedGarmentIds: ['g_old'],
  } });
  const event = { action: 'worn', at: at(), details: purchaseJourneyDetails(base) };
  const count = Math.floor((limitBytes - bytes([base, target])) / (bytes(event) + 1));
  const filler = { ...base, wearCount: count,
    history: [...base.history, ...Array.from({ length: count }, () => structuredClone(event))] };
  const journeys = [filler, target];
  const nextAction = stage === 'ordered' ? 'received' : stage === 'received' ? 'kept' : 'returned';
  const next = transitionPurchaseJourney(target, nextAction, { at: at(),
    ...(stage === 'ordered' ? { changes: { garmentId: 'g_target' } } : {}) });
  assert.ok(bytes(journeys) <= limitBytes);
  assert.ok(bytes([filler, next]) > limitBytes);
  return journeys;
}

function legacyJourney(id, full = true) {
  return {
    id, candidate: candidate(full), decision: full ? 'hold' : null,
    stage: full ? 'candidate' : 'kept', absence: 'unknown', intent: 'add',
    option: full ? '나'.repeat(160) : 'M / white', reason: full ? '가'.repeat(500) : '',
    garmentId: full ? null : 'g_unit', wearCount: 0,
    history: full ? [{ action: 'created', at: at() },
      ...Array.from({ length: 511 }, () => ({ action: 'hold', at: at() }))] :
      ['created', 'ordered', 'received', 'kept'].map((action) => ({ action, at: at() })),
    relatedGarmentIds: [], replacementGarmentId: null, replacementConfirmed: false, forkedFrom: null,
  };
}

function legacyAboveBudget(photoId) {
  const full = legacyJourney('j_full_0');
  for (let count = 1; count <= 30; count++) {
    // Schema 4 predates both the wear diary and seller notes.
    const { wears, offerRecords, ...current } = personal([], [garment('g_unit', photoId)]);
    const original = {
      ...current, schema: 4,
      journeys: [...Array.from({ length: count }, (_, i) => ({ ...structuredClone(full), id: `j_full_${i}` })),
        legacyJourney('j_wear', false)],
    };
    const upgraded = upgradeWardrobe(original, { at: at(18) });
    if (journeyStorageUsage(upgraded).bytes > MAX_JOURNEY_STATE_BYTES + 45000) {
      assert.ok(bytes(upgraded) < MAX_WARDROBE_STATE_BYTES - 10000);
      return { original, upgraded };
    }
  }
  throw new Error('The bounded legacy fixture did not reach the reserve threshold');
}

test('journey usage reports UTF-8 bytes with 500 KiB warning and 600 KiB growth budget', () => {
  const value = personal([nearBudget()]);
  const usage = journeyStorageUsage(value);
  assert.equal(MAX_JOURNEY_STATE_BYTES, 600 * 1024);
  assert.equal(JOURNEY_STATE_WARNING_BYTES, 500 * 1024);
  assert.equal(usage.bytes, bytes(value.journeys));
  assert.ok(usage.bytes > JSON.stringify(value.journeys).length, 'Korean text must consume its real UTF-8 bytes');
  assert.deepEqual(usage, {
    bytes: bytes(value.journeys), limitBytes: 600 * 1024, warningBytes: 500 * 1024,
    warning: true, overBudget: false,
  });
  assert.deepEqual(journeyStorageUsage(newWardrobeState()), {
    bytes: 2, limitBytes: 600 * 1024, warningBytes: 500 * 1024, warning: false, overBudget: false,
  });
});

test('last allowed wear event succeeds; over-budget event preserves revision, wear count, every event and photo bytes', async () => {
  const asset = await photoAsset(jpeg(11));
  const maximum = nearBudget();
  const beforeLast = { ...maximum, wearCount: maximum.wearCount - 1, history: maximum.history.slice(0, -1) };
  const store = createWardrobeStore({ indexedDB: new IDBFactory() });
  try {
    await store.commit(personal([beforeLast], [garment('g_unit', asset.id)]), 0, [asset]);
    const initial = await store.read();
    const allowed = { ...initial.state, journeys: [transitionPurchaseJourney(beforeLast, 'worn', { at: at() })] };
    await store.commit(allowed, initial.revision, [], initial.epoch);
    const boundary = await store.read();
    assert.equal(boundary.state.journeys[0].wearCount, maximum.wearCount);
    const nextPhoto = await photoAsset(jpeg(12));
    const rejected = { ...boundary.state,
      journeys: [transitionPurchaseJourney(boundary.state.journeys[0], 'worn', { at: at() })],
      garments: [...boundary.state.garments, garment('g_pending', nextPhoto.id)],
    };
    const pending = structuredClone(rejected);
    assert.ok(bytes(rejected) < MAX_WARDROBE_STATE_BYTES, 'reserve failure must occur before the global cap');
    await assert.rejects(store.commit(rejected, boundary.revision, [nextPhoto], boundary.epoch), budgetError);
    const unchanged = await store.read();
    assert.equal(unchanged.revision, boundary.revision);
    assert.equal(unchanged.epoch, boundary.epoch);
    assert.deepEqual(unchanged.state, boundary.state);
    assert.deepEqual(rejected, pending, 'caller-owned pending input is retained');
    assert.deepEqual(await photoBytes(unchanged, asset.id), new Uint8Array([255, 216, 255, 11]));
    assert.equal((await store.recoveryState()).photoCount, 1, 'failed growth cannot add an orphan photo');
  } finally { store.close(); }
});

test('a fresh current-schema record above the reserve refuses its first write without storing metadata or photos', async () => {
  const asset = await photoAsset(jpeg(21));
  const value = personal([transitionPurchaseJourney(nearBudget(), 'worn', { at: at() })], [garment('g_unit', asset.id)]);
  const pending = structuredClone(value);
  const store = createWardrobeStore({ indexedDB: new IDBFactory() });
  try {
    assert.equal(validateWardrobe(value), value);
    await assert.rejects(store.commit(value, 0, [asset]), budgetError);
    assert.equal(await store.read(), null);
    assert.equal((await store.recoveryState()).photoCount, 0);
    assert.deepEqual(value, pending);
  } finally { store.close(); }
});

test('lossless v4 migration may cross the reserve while preserving 512-entry histories and original photo bytes', async () => {
  const asset = await photoAsset(jpeg(31));
  const { original, upgraded } = legacyAboveBudget(asset.id);
  const before = structuredClone(original);
  const store = createWardrobeStore({ indexedDB: new IDBFactory() });
  try {
    await store.commit(original, 0, [asset]);
    const legacy = await store.read();
    await store.commit(upgraded, legacy.revision, [], legacy.epoch);
    const current = await store.read();
    assert.equal(journeyStorageUsage(current.state).overBudget, true);
    assert.deepEqual(current.state, upgraded);
    assert.equal(current.revision, legacy.revision + 1);
    assert.equal(current.epoch, legacy.epoch);
    assert.equal(current.state.journeys[0].history.length, 512);
    assert.ok(current.state.journeys[0].history.every((entry) => entry.details === null));
    assert.deepEqual(original, before);
    assert.deepEqual(await photoBytes(current, asset.id), new Uint8Array([255, 216, 255, 31]));
  } finally { store.close(); }
});

test('existing over-budget records remain readable and restorable; pure garment addition and journey reduction succeed', async () => {
  const asset = await photoAsset(jpeg(41));
  const { original, upgraded } = legacyAboveBudget(asset.id);
  const store = createWardrobeStore({ indexedDB: new IDBFactory() });
  const restored = createWardrobeStore({ indexedDB: new IDBFactory() });
  try {
    await store.commit(original, 0, [asset]);
    let current = await store.read();
    await store.commit(upgraded, current.revision, [], current.epoch);
    current = await store.read();
    const parsed = await parseWardrobeBackup(await store.backup());
    const recovered = await restored.recover(parsed.state, await restored.recoveryState(), parsed.assets);
    assert.deepEqual(recovered.state, current.state);
    assert.deepEqual(await photoBytes(await restored.read(), asset.id), new Uint8Array([255, 216, 255, 41]));
    const extra = await photoAsset(jpeg(42));
    const added = { ...current.state, garments: [...current.state.garments, garment('g_added', extra.id)] };
    assert.ok(bytes(added) < MAX_WARDROBE_STATE_BYTES);
    await store.commit(added, current.revision, [extra], current.epoch);
    const afterAdded = await store.read();
    assert.deepEqual(afterAdded.state.journeys, current.state.journeys);
    assert.equal(afterAdded.state.garments.length, 2);
    assert.deepEqual(await photoBytes(afterAdded, extra.id), new Uint8Array([255, 216, 255, 42]));
    const reduced = { ...afterAdded.state, journeys: afterAdded.state.journeys.slice(1) };
    assert.ok(journeyStorageUsage(reduced).overBudget, 'reduction must work even before the record is below the reserve');
    await store.commit(reduced, afterAdded.revision, [], afterAdded.epoch);
    const smaller = await store.read();
    assert.deepEqual(smaller.state, reduced);
    assert.equal(smaller.photos.size, 2);
    const moreWear = { ...smaller.state, journeys: smaller.state.journeys.map((value) => value.id === 'j_wear' ?
      transitionPurchaseJourney(value, 'worn', { at: at(18) }) : value) };
    await assert.rejects(store.commit(moreWear, smaller.revision, [], smaller.epoch), budgetError);
    assert.deepEqual((await store.read()).state, reduced);
  } finally { store.close(); restored.close(); }
});

test('migration exemption cannot hide a new note or changed legacy values above the reserve', async () => {
  const asset = await photoAsset(jpeg(51));
  const { original, upgraded } = legacyAboveBudget(asset.id);
  const store = createWardrobeStore({ indexedDB: new IDBFactory() });
  try {
    await store.commit(original, 0, [asset]);
    const before = await store.read();
    const combined = { ...upgraded, journeys: upgraded.journeys.map((value) => value.id === 'j_wear' ?
      transitionPurchaseJourney(value, 'note', { at: at(18), changes: { reason: '새로 입력한 내용' } }) : value) };
    await assert.rejects(store.commit(combined, before.revision, [], before.epoch), budgetError);
    const edited = structuredClone(upgraded);
    edited.journeys[0].reason = '이전 값을 몰래 바꾼 내용';
    await assert.rejects(store.commit(edited, before.revision, [], before.epoch), budgetError);
    const unchanged = await store.read();
    assert.deepEqual(unchanged.state, original);
    assert.equal(unchanged.revision, before.revision);
    assert.deepEqual(await photoBytes(unchanged, asset.id), new Uint8Array([255, 216, 255, 51]));
  } finally { store.close(); }
});

test('CAS conflict takes precedence over budget and leaves the winning garment update intact', async () => {
  const asset = await photoAsset(jpeg(61));
  const maximum = nearBudget();
  const indexedDB = new IDBFactory();
  const first = createWardrobeStore({ indexedDB });
  const second = createWardrobeStore({ indexedDB });
  try {
    await first.commit(personal([maximum], [garment('g_unit', asset.id)]), 0, [asset]);
    const stale = await second.read();
    const winner = { ...stale.state, garments: stale.state.garments.map((value) => ({ ...value, label: '먼저 저장한 옷 이름' })) };
    await first.commit(winner, stale.revision, [], stale.epoch);
    const pending = { ...stale.state, journeys: [transitionPurchaseJourney(maximum, 'worn', { at: at() })] };
    await assert.rejects(second.commit(pending, stale.revision, [], stale.epoch), (error) => error.code === 'conflict');
    assert.deepEqual((await first.read()).state, winner);
  } finally { first.close(); second.close(); }
});

test('the journey reserve keeps the global state limit and cannot guarantee space for unlimited other metadata', async () => {
  const store = createWardrobeStore({ indexedDB: new IDBFactory() });
  const original = personal([nearBudget()]);
  try {
    await store.commit(original, 0);
    const current = await store.read();
    const tooLarge = { ...current.state, brands: Array.from({ length: 3000 }, () => '가'.repeat(120)) };
    assert.equal(journeyStorageUsage(tooLarge).bytes, journeyStorageUsage(original).bytes);
    assert.ok(bytes(tooLarge) > MAX_WARDROBE_STATE_BYTES);
    await assert.rejects(store.commit(tooLarge, current.revision, [], current.epoch), /기록 정보가 너무 큽니다/);
    assert.deepEqual((await store.read()).state, original);
  } finally { store.close(); }
});

test('essential receipt, keep and return can resolve ownership beyond 600 KiB while wear and notes remain blocked', async () => {
  const asset = await photoAsset(jpeg(71));
  const parcel = await photoAsset(jpeg(72));
  const journeys = budgetPair('ordered');
  const store = createWardrobeStore({ indexedDB: new IDBFactory() });
  try {
    await store.commit(personal(journeys, [garment('g_unit', asset.id)]), 0, [asset]);
    let current = await store.read();
    const received = transitionPurchaseJourney(current.state.journeys[1], 'received', {
      at: at(), changes: { garmentId: 'g_target' },
    });
    const receipt = { ...current.state, journeys: [current.state.journeys[0], received],
      garments: [...current.state.garments, garment('g_target', parcel.id)] };
    assert.ok(journeyStorageUsage(receipt).bytes > MAX_JOURNEY_STATE_BYTES);
    assert.ok(journeyStorageUsage(receipt).bytes < MAX_OWNERSHIP_JOURNEY_STATE_BYTES);
    await store.commit(receipt, current.revision, [parcel], current.epoch);
    current = await store.read();
    for (const action of ['kept', 'returned']) {
      const next = { ...current.state, journeys: [current.state.journeys[0],
        transitionPurchaseJourney(current.state.journeys[1], action, { at: at() })] };
      await store.commit(next, current.revision, [], current.epoch);
      current = await store.read();
      assert.equal(current.state.journeys[1].stage, action);
    }
    const beforeOptional = current;
    for (const [index, action] of [[0, 'worn'], [1, 'note']]) {
      const pending = { ...current.state, journeys: current.state.journeys.map((value, row) =>
        row === index ? transitionPurchaseJourney(value, action, { at: at() }) : value) };
      await assert.rejects(store.commit(pending, current.revision, [], current.epoch), budgetError);
    }
    const unchanged = await store.read();
    assert.equal(unchanged.revision, beforeOptional.revision);
    assert.deepEqual(unchanged.state, beforeOptional.state);
    assert.equal(unchanged.state.journeys[0].wearCount, journeys[0].wearCount);
    assert.deepEqual(await photoBytes(unchanged, asset.id), new Uint8Array([255, 216, 255, 71]));
    assert.deepEqual(await photoBytes(unchanged, parcel.id), new Uint8Array([255, 216, 255, 72]));
    assert.equal((await store.recoveryState()).photoCount, 2);
  } finally { store.close(); }
});

test('explicit retirement and restoration use the ownership reserve without admitting unrelated details changes', async () => {
  const asset = await photoAsset(jpeg(81));
  const journeys = budgetPair('kept', MAX_JOURNEY_STATE_BYTES, true);
  const store = createWardrobeStore({ indexedDB: new IDBFactory() });
  try {
    await store.commit(personal(journeys, [garment('g_unit', asset.id), garment('g_target'), garment('g_old')]), 0, [asset]);
    let current = await store.read();
    for (const confirmed of [true, false]) {
      const updated = transitionPurchaseJourney(current.state.journeys[1], 'details-change', {
        at: at(), changes: { replacementConfirmed: confirmed },
      });
      const next = { ...current.state, journeys: [current.state.journeys[0], updated] };
      await store.commit(next, current.revision, [], current.epoch);
      current = await store.read();
      assert.equal(current.state.journeys[1].replacementConfirmed, confirmed);
    }
    const mixed = transitionPurchaseJourney(current.state.journeys[1], 'details-change', {
      at: at(), changes: { replacementConfirmed: true, reason: '다'.repeat(500) },
    });
    await assert.rejects(store.commit({ ...current.state, journeys: [current.state.journeys[0], mixed] },
      current.revision, [], current.epoch), budgetError);
    assert.deepEqual((await store.read()).state, current.state);
    assert.deepEqual(await photoBytes(current, asset.id), new Uint8Array([255, 216, 255, 81]));
  } finally { store.close(); }
});

test('memo, feedback, candidate changes, hidden snapshot values or multiple events cannot masquerade as essential ownership', async () => {
  const asset = await photoAsset(jpeg(91));
  const journeys = budgetPair('ordered');
  const store = createWardrobeStore({ indexedDB: new IDBFactory() });
  try {
    await store.commit(personal(journeys, [garment('g_unit', asset.id)]), 0, [asset]);
    const initial = await store.read();
    const received = { ...initial.state, journeys: [initial.state.journeys[0],
      transitionPurchaseJourney(initial.state.journeys[1], 'received', { at: at(), changes: { garmentId: 'g_target' } })],
      garments: [...initial.state.garments, garment('g_target')] };
    await store.commit(received, initial.revision, [], initial.epoch);
    const current = await store.read();
    assert.equal(journeyStorageUsage(current.state).overBudget, true);
    for (const changes of [
      { reason: '다'.repeat(500) }, { feedback: { fit: 'right', returnReason: null } },
      { option: '다'.repeat(160) }, { candidate: { ...candidate(), color: 'blue' } },
      { absence: 'present' }, { intent: 'replace' }, { relatedGarmentIds: ['g_unit'] },
    ]) {
      const mixed = transitionPurchaseJourney(current.state.journeys[1], 'kept', { at: at(), changes });
      await assert.rejects(store.commit({ ...current.state, journeys: [current.state.journeys[0], mixed] },
        current.revision, [], current.epoch), budgetError);
    }
    const hidden = transitionPurchaseJourney(current.state.journeys[1], 'kept', { at: at() });
    hidden.history.at(-1).details.reason = '다'.repeat(500);
    const validWithDifferentHistoricReason = personal([current.state.journeys[0], hidden]);
    assert.equal(validateWardrobe(validWithDifferentHistoricReason), validWithDifferentHistoricReason);
    await assert.rejects(store.commit({ ...current.state, journeys: [current.state.journeys[0], hidden] },
      current.revision, [], current.epoch), budgetError);
    const corrected = transitionPurchaseJourney(current.state.journeys[1], 'correction', {
      at: at(), changes: { option: '명시적으로 정정한 옵션' },
    });
    const double = transitionPurchaseJourney(corrected, 'kept', { at: at() });
    await assert.rejects(store.commit({ ...current.state, journeys: [current.state.journeys[0], double] },
      current.revision, [], current.epoch), budgetError);
    const twoChanged = { ...current.state, journeys: [
      transitionPurchaseJourney(current.state.journeys[0], 'returned', { at: at() }),
      transitionPurchaseJourney(current.state.journeys[1], 'kept', { at: at() }),
    ] };
    await assert.rejects(store.commit(twoChanged, current.revision, [], current.epoch), budgetError);
    const unchanged = await store.read();
    assert.deepEqual(unchanged.state, current.state);
    assert.equal(unchanged.revision, current.revision);
    assert.deepEqual(await photoBytes(unchanged, asset.id), new Uint8Array([255, 216, 255, 91]));
  } finally { store.close(); }
});

test('the 680 KiB ownership boundary refuses growth atomically and existing larger records still allow unchanged or decreasing journeys', async () => {
  const asset = await photoAsset(jpeg(101));
  const targetPhoto = await photoAsset(jpeg(102));
  const journeys = budgetPair('received', MAX_OWNERSHIP_JOURNEY_STATE_BYTES);
  const state = personal(journeys, [garment('g_unit', asset.id), garment('g_target', targetPhoto.id)]);
  const store = createWardrobeStore({ indexedDB: new IDBFactory() });
  const larger = createWardrobeStore({ indexedDB: new IDBFactory() });
  try {
    await store.recover(state, await store.recoveryState(), [asset, targetPhoto]);
    const boundary = await store.read();
    const pending = { ...state, journeys: [journeys[0], transitionPurchaseJourney(journeys[1], 'kept', { at: at() })] };
    assert.ok(journeyStorageUsage(pending).bytes > MAX_OWNERSHIP_JOURNEY_STATE_BYTES);
    assert.ok(bytes(pending) < MAX_WARDROBE_STATE_BYTES);
    const caller = structuredClone(pending);
    await assert.rejects(store.commit(pending, boundary.revision, [], boundary.epoch), (error) =>
      error.code === 'journey-budget' && error.limitBytes === MAX_OWNERSHIP_JOURNEY_STATE_BYTES);
    const unchanged = await store.read();
    assert.equal(unchanged.revision, boundary.revision);
    assert.equal(unchanged.epoch, boundary.epoch);
    assert.deepEqual(unchanged.state, state);
    assert.deepEqual(pending, caller);
    assert.deepEqual(await photoBytes(unchanged, targetPhoto.id), new Uint8Array([255, 216, 255, 102]));
    await larger.recover(pending, await larger.recoveryState(), [asset, targetPhoto]);
    const existing = await larger.read();
    const editedGarment = { ...existing.state,
      garments: existing.state.garments.map((value) => value.id === 'g_target' ? { ...value, label: '보유 중인 옷 이름 수정' } : value) };
    await larger.commit(editedGarment, existing.revision, [], existing.epoch);
    const saved = await larger.read();
    const decreased = { ...saved.state, journeys: saved.state.journeys.slice(1) };
    await larger.commit(decreased, saved.revision, [], saved.epoch);
    assert.deepEqual((await larger.read()).state, decreased);
    assert.deepEqual(await photoBytes(await larger.read(), asset.id), new Uint8Array([255, 216, 255, 101]));
  } finally { store.close(); larger.close(); }
});

test('wardrobe state usage excludes screen view fields and photos and warns independently with 64 KiB of JSON headroom', async () => {
  const value = nearBudget();
  while (bytes([value]) > 440000) {
    value.history.pop();
    value.wearCount--;
  }
  const photo = new Uint8Array(800000);
  photo.set([255, 216, 255]);
  const asset = await photoAsset(new Blob([photo], { type: 'image/jpeg' }));
  const base = personal([value], [garment('g_headroom', asset.id)]);
  const state = { ...base, brands: Array.from({ length: 1000 }, () => '가'.repeat(120)) };
  assert.equal(validateWardrobe(state), state);
  assert.equal(journeyStorageUsage(state).warning, false, 'the whole-state notice must detect an independent shortage');
  const usage = wardrobeStateStorageUsage(state);
  assert.equal(WARDROBE_STATE_WARNING_BYTES, MAX_WARDROBE_STATE_BYTES - 64 * 1024);
  assert.deepEqual(usage, { bytes: bytes(state), limitBytes: MAX_WARDROBE_STATE_BYTES,
    warningBytes: WARDROBE_STATE_WARNING_BYTES, warning: true, overBudget: false });
  assert.ok(usage.bytes + asset.blob.size > MAX_WARDROBE_STATE_BYTES,
    'separate photo Blob bytes are not part of the JSON state limit');
  const view = { ...state, closet: [...Array.from({ length: 1000 }, () => garment('g_screen_only')),
    { ...state.garments[0], preview: asset.blob }], tab: 'saved' };
  assert.deepEqual(wardrobeStateStorageUsage(view), usage);
  assert.deepEqual(wardrobeStateStorageUsage(newWardrobeState()), {
    bytes: bytes(newWardrobeState()), limitBytes: MAX_WARDROBE_STATE_BYTES, warningBytes: WARDROBE_STATE_WARNING_BYTES, warning: false, overBudget: false,
  });
});

test('price growth leaves clothing headroom while full validated backup replacement and price cleanup remain possible', async () => {
  const { setOfferRecord } = await import('../src/offer-store.js');
  const { validateOffer } = await import('../src/offers.js');
  const { original, upgraded } = legacyAboveBudget(null);
  let next;
  for (let length = 1000; length < 195000; length += 1000) {
    const entry = validateOffer({ id: 'o_big', seller: '판매처', url: `https://shop.example/?x=${'x'.repeat(length)}`, price: 30000, shipping: 0,
      color: 'navy', size: 'M', stock: 'in-stock', sameProduct: 'confirmed', source: 'user', checkedAt: at() });
    next = { ...upgraded, offerRecords: setOfferRecord([], 'ms-123', { requested: { color: 'navy', size: 'M' }, offers: [entry], refresh: null }) };
    if (bytes(next) > WARDROBE_STATE_WARNING_BYTES) break;
  }
  validateWardrobe(next);
  assert.ok(bytes(next) > WARDROBE_STATE_WARNING_BYTES && bytes(next) < MAX_WARDROBE_STATE_BYTES);
  const store = createWardrobeStore({ indexedDB: new IDBFactory() });
  try {
    await store.commit(original, 0);
    let snapshot = await store.read();
    await store.commit(upgraded, snapshot.revision, [], snapshot.epoch);
    snapshot = await store.read();
    await assert.rejects(store.commit(next, snapshot.revision, [], snapshot.epoch), (error) => error.code === 'offer-budget');
    assert.deepEqual((await store.read()).state, upgraded, 'refused price growth leaves every existing record unchanged');
    await store.commit(next, snapshot.revision, [], snapshot.epoch, { replacingOffers: true });
    snapshot = await store.read();
    const changed = { ...snapshot.state, garments: [...snapshot.state.garments, garment('g_headroom')] };
    await store.commit(changed, snapshot.revision, [], snapshot.epoch);
    snapshot = await store.read();
    await store.commit({ ...snapshot.state, offerRecords: [] }, snapshot.revision, [], snapshot.epoch);
    assert.deepEqual((await store.read()).state.offerRecords, []);
  } finally { store.close(); }
});
