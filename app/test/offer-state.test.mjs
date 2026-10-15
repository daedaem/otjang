import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { validateOffer } from '../src/offers.js';
import {
  OFFER_STORE_KEY, MAX_OFFER_RECORDS, MAX_OFFER_STATE_BYTES, legacyOfferRecords, readOfferRecord,
  setOfferRecord, removeOfferRecord, validateOfferRecords, writeOffers,
} from '../src/offer-store.js';
import { WARDROBE_SCHEMA, newWardrobeState, validateWardrobe, upgradeWardrobe, storedWardrobe, wardrobeView, makeGarment } from '../src/wardrobe.js';
import { createWardrobeStore, parseWardrobeBackup } from '../src/wardrobe-store.js';
import { MAX_WARDROBE_STATE_BYTES } from '../src/purchase-journey.js';

const at = '2026-10-15T08:00:00.000Z';
const now = new Date(at);
const offer = (extra = {}) => validateOffer({
  id: 'o_one', seller: '판매처', url: 'https://shop.example/p/1', price: 39000, shipping: 3000,
  color: 'navy', size: 'M', stock: 'in-stock', sameProduct: 'confirmed', source: 'user', checkedAt: at, title: '재킷', ...extra,
});
const data = (extra = {}) => ({ requested: { color: 'navy', size: 'M' }, offers: [offer()], refresh: null, ...extra });
const records = () => setOfferRecord([], 'ms-3323583', data(), now);
const memory = () => {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
};

test('schema 7 treats seller notes as committed wardrobe data and keeps old snapshot upgrades explicit', () => {
  assert.equal(WARDROBE_SCHEMA, 7);
  const state = { ...newWardrobeState(), offerRecords: records() };
  assert.equal(validateWardrobe(state), state, 'price notes are allowed before the user registers a garment');
  assert.deepEqual(storedWardrobe(wardrobeView(state)).offerRecords, state.offerRecords);
  const { offerRecords, ...v6 } = { ...state, schema: 6 };
  assert.deepEqual(upgradeWardrobe(v6).offerRecords, []);
  const { wears, ...v5 } = { ...v6, schema: 5 };
  assert.deepEqual(upgradeWardrobe(v5).offerRecords, []);
  assert.deepEqual(upgradeWardrobe(v5).wears, []);
  assert.throws(() => validateWardrobe({ ...state, schema: 6 }), /지원하지 않는 옷장 형식/, 'older formats must not quietly lose a new field');
  const missing = { ...state };
  delete missing.offerRecords;
  assert.throws(() => validateWardrobe(missing));
  assert.throws(() => validateWardrobe({ ...state, schema: 8 }), /형식|버전/);
  const copy = upgradeWardrobe(state);
  copy.offerRecords[0].requested.size = 'L';
  assert.equal(state.offerRecords[0].requested.size, 'M');
});

test('a schema 6 snapshot at its exact byte limit upgrades without losing records; older formats keep the original limit', async () => {
  const bytes = (value) => new TextEncoder().encode(JSON.stringify(value)).length;
  const fullLegacy = (targetBytes) => {
    const { offerRecords, ...state } = {
      ...newWardrobeState(), schema: 6, demo: false, demoSelected: [], brands: [''], saved: ['ms-3323583'],
      garments: [makeGarment({ id: 'g_keep', kind: 'shirt', label: '남길 셔츠', gender: 'M', createdAt: at })],
      wears: [{ id: 'w_keep', date: '2026-10-15', garmentIds: ['g_keep'], lookId: null, note: '남길 착용 기록', at }],
    };
    // Fill an existing, valid variable-length field; no unknown padding field
    // bypasses the real schema validator. Every brand stays at most 120 chars.
    let room = targetBytes - bytes(state);
    const fullBrands = Math.floor(room / 123); // comma, two quotes, 120 ASCII bytes
    state.brands.unshift(...Array(fullBrands).fill('b'.repeat(120)));
    room -= fullBrands * 123;
    if (room > 120) { state.brands.push(''); room -= 3; }
    state.brands[state.brands.length - 1] = 'p'.repeat(room);
    assert.equal(bytes(state), targetBytes);
    return state;
  };
  assert.equal(bytes({ schema: 7, offerRecords: [] }) - bytes({ schema: 6 }), 18);
  assert.equal(MAX_WARDROBE_STATE_BYTES, 850000 + 18);
  const old = fullLegacy(850000), original = structuredClone(old);
  assert.equal(validateWardrobe(old), old);
  const store = createWardrobeStore({ indexedDB: new IDBFactory() });
  try {
    const revision = await store.commit(old, 0);
    const upgraded = upgradeWardrobe(old);
    assert.equal(bytes(upgraded), MAX_WARDROBE_STATE_BYTES);
    assert.deepEqual(upgraded, { ...original, schema: 7, offerRecords: [] });
    await store.commit(upgraded, revision);
    const saved = await store.read();
    assert.deepEqual(saved.state, upgraded);
    assert.deepEqual(old, original, 'conversion and saving preserve all original arrays and strings');
    const tooLargeOld = fullLegacy(850001);
    assert.throws(() => validateWardrobe(tooLargeOld), /기록 정보가 너무 큽니다/);
    assert.throws(() => upgradeWardrobe(tooLargeOld), /기록 정보가 너무 큽니다/);
    await assert.rejects(store.commit(tooLargeOld, saved.revision), /기록 정보가 너무 큽니다/);
    assert.deepEqual((await store.read()).state, saved.state, 'a rejected old-format write cannot replace the successful upgrade');
  } finally { store.close(); }
});

test('seller-note edits and explicit removal are pure and cannot mutate a committed snapshot through a read', () => {
  const original = records();
  const before = structuredClone(original);
  const read = readOfferRecord(original, 'ms-3323583');
  read.requested.size = 'L';
  read.offers[0].seller = '다른 가게';
  assert.deepEqual(original, before);
  const changed = setOfferRecord(original, 'ms-3323583', data({ requested: { color: 'navy', size: 'L' } }), now);
  assert.equal(changed.length, 1);
  assert.equal(changed[0].requested.size, 'L');
  assert.deepEqual(original, before);
  assert.deepEqual(removeOfferRecord(original, 'ms-3323583'), []);
  assert.deepEqual(readOfferRecord([], 'ms-0'), { requested: { color: null, size: null }, offers: [], refresh: null });
});

test('strict persisted notes reject corrupt or future values instead of normalizing or omitting them', () => {
  const good = records()[0];
  const invalid = [
    { ...good, future: true },
    { ...good, ref: 'javascript:alert(1)' },
    { ...good, ref: 'https://user:secret@shop.example/p/1' },
    { ...good, touchedAt: 'yesterday' },
    { ...good, requested: { color: 'unknown', size: 'M' } },
    { ...good, requested: { color: 'navy', size: ' M ' } },
    { ...good, requested: { color: 'navy', size: 'M', future: true } },
    { ...good, refresh: { at, ok: 'yes', message: '' } },
    { ...good, refresh: { at, ok: true, message: '', future: true } },
    { ...good, offers: [{ ...offer(), id: 'invalid id' }] },
    { ...good, offers: [{ ...offer(), color: 'not-a-color' }] },
    { ...good, offers: [{ ...offer(), seller: ' 판매처 ' }] },
    { ...good, offers: [{ ...offer(), future: true }] },
    { ...good, offers: [offer(), offer()] },
  ];
  for (const record of invalid) assert.throws(() => validateOfferRecords([record]), undefined, JSON.stringify(record));
  assert.throws(() => validateOfferRecords([good, good]), /중복/);
  assert.equal(validateOfferRecords([{ ...good, refresh: { at, ok: false, message: '연결 실패' } }]).length, 1);
});

test('product, seller and byte bounds refuse growth without evicting user notes; explicit deletion frees capacity', () => {
  const full = Array.from({ length: MAX_OFFER_RECORDS }, (_, i) => ({ ...records()[0], ref: `ms-${i}` }));
  const before = structuredClone(full);
  assert.throws(() => setOfferRecord(full, 'ms-999', data(), now), (error) => error.code === 'offer-full');
  assert.deepEqual(full, before, 'the oldest product is still there');
  assert.equal(setOfferRecord(full, 'ms-0', data({ offers: [] }), now).length, MAX_OFFER_RECORDS, 'editing works at the cap');
  assert.equal(setOfferRecord(removeOfferRecord(full, 'ms-0'), 'ms-999', data(), now).length, MAX_OFFER_RECORDS);
  assert.throws(() => setOfferRecord([], 'ms-1', data({ offers: Array.from({ length: 13 }, (_, i) => offer({ id: `o_${i}` })) }), now),
    (error) => error.code === 'offer-full');
  assert.throws(() => setOfferRecord([], 'ms-1', data({ offers: [offer({ url: `https://shop.example/p?q=${'x'.repeat(MAX_OFFER_STATE_BYTES)}` })] }), now),
    (error) => error.code === 'offer-budget');
});

test('legacy import copies every valid note and never rewrites or partially accepts a malformed source', () => {
  const storage = memory();
  assert.equal(writeOffers(storage, 'ms-3323583', data(), now), true);
  const raw = storage.getItem(OFFER_STORE_KEY);
  assert.deepEqual(legacyOfferRecords(raw), records());
  assert.equal(storage.getItem(OFFER_STORE_KEY), raw);
  assert.deepEqual(legacyOfferRecords(null), []);
  const bad = JSON.parse(raw);
  bad.products['ms-3323583'].offers.push({ seller: 'broken' });
  const broken = JSON.stringify(bad);
  storage.setItem(OFFER_STORE_KEY, broken);
  assert.throws(() => legacyOfferRecords(broken), /형식|정보/);
  assert.equal(storage.getItem(OFFER_STORE_KEY), broken);
  assert.throws(() => legacyOfferRecords('{'));
  assert.throws(() => legacyOfferRecords(JSON.stringify({ v: 1, products: {}, future: true })));
});

test('the wardrobe backup carries seller notes and a failed atomic replacement preserves them', async () => {
  const store = createWardrobeStore({ indexedDB: new IDBFactory() });
  const state = { ...newWardrobeState(), offerRecords: records() };
  const revision = await store.commit(state, 0);
  const parsed = await parseWardrobeBackup(await store.backup());
  assert.deepEqual(parsed.state.offerRecords, state.offerRecords);
  const invalid = { ...state, offerRecords: [{ ...records()[0], future: true }] };
  await assert.rejects(store.commit(invalid, revision));
  assert.deepEqual((await store.read()).state.offerRecords, state.offerRecords);
  const target = createWardrobeStore({ indexedDB: new IDBFactory() });
  await target.commit(parsed.state, 0, parsed.assets);
  assert.deepEqual((await target.read()).state.offerRecords, state.offerRecords);
  await target.commit({ ...parsed.state, offerRecords: [] }, 1);
  assert.deepEqual((await target.read()).state.offerRecords, [], 'a confirmed full replacement does not merge the old seller notes back');
  store.close();
  target.close();
});
