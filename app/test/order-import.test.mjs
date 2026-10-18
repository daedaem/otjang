import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { newWardrobeState, makeGarment, validateWardrobe, WARDROBE_SCHEMA } from '../src/wardrobe.js';
import { createWardrobeStore, photoAsset, parseWardrobeBackup } from '../src/wardrobe-store.js';
import { transitionPurchaseJourney } from '../src/purchase-journey.js';
import { parseOrderImport, planOrderImport, connectImportedOrder, importedOrderInfo, ORDER_STATUS_LABELS } from '../src/order-import.js';

const at = '2026-10-18T01:00:00.000Z';
const row = (overrides = {}) => ({ key: 'a'.repeat(64), identity: 'order', productId: 'ms-900000000001',
  url: 'https://www.musinsa.com/products/900000000001', name: '합성 시험용 셔츠', brand: '시험 브랜드',
  option: '화이트 / M', orderDate: '2024-05-12', status: 'delivered', quantity: 1, amount: 30000, ...overrides });
const payload = (items = [row()]) => ({ format: 'eoul-orders', version: 1, retailer: 'musinsa', extractedAt: at, items });
const plan = (state = newWardrobeState(), items = [row()], selected = items.map((r) => r.key)) =>
  planOrderImport(state, payload(items), selected, { at });

test('only selected source observations are imported; no ownership, attributes, payment or past events are invented', () => {
  const before = newWardrobeState(), original = structuredClone(before);
  const result = plan(before, [row(), row({ key: 'b'.repeat(64), status: 'returned' })], ['a'.repeat(64)]);
  assert.deepEqual(before, original);
  assert.equal(result.added, 1);
  assert.equal(result.next.schema, WARDROBE_SCHEMA);
  assert.deepEqual(result.next.garments, before.garments);
  assert.deepEqual(result.next.demoSelected, before.demoSelected);
  assert.deepEqual(result.next.saved, before.saved);
  const j = result.next.journeys[0];
  assert.equal(j.stage, 'candidate');
  assert.equal(j.decision, null);
  assert.equal(j.garmentId, null);
  assert.equal(j.candidate.price, null);
  assert.equal(j.candidate.checkedAt, null);
  assert.equal(j.candidate.kind, null);
  assert.equal(j.candidate.color, null);
  assert.deepEqual(j.history.map((event) => [event.action, event.at]), [['created', at], ['imported', at]]);
  assert.deepEqual(importedOrderInfo(j), { orderDate: '2024-05-12', status: 'delivered', quantity: 1, amount: 30000, extractedAt: at, identity: 'order' });
  assert.equal(validateWardrobe(result.next), result.next);
});

test('every order state remains source information; returns and cancellation never create owned clothes', () => {
  for (const status of Object.keys(ORDER_STATUS_LABELS)) {
    const j = plan(undefined, [row({ status })]).next.journeys[0];
    assert.equal(importedOrderInfo(j).status, status);
    assert.equal(j.stage, 'candidate');
    assert.equal(j.garmentId, null);
    assert.deepEqual(j.feedback, { fit: null, returnReason: null });
  }
});

test('repeat import is idempotent without overwriting notes; separate purchases of the same SKU remain separate', () => {
  const first = plan().next;
  first.journeys[0] = transitionPurchaseJourney(first.journeys[0], 'note', { at, changes: { reason: '직접 남긴 메모', option: '확인한 옵션' } });
  const again = plan(first, [row({ status: 'returned' })]);
  assert.equal(again.added, 0);
  assert.equal(again.skipped, 1);
  assert.deepEqual(again.next, first);
  assert.equal(importedOrderInfo(again.next.journeys[0]).status, 'delivered', 'source snapshot must not silently pretend it refreshed');
  const another = plan(first, [row({ key: 'b'.repeat(64) })]);
  assert.equal(another.added, 1);
  assert.equal(another.next.journeys.length, 2);
  assert.equal(another.next.journeys[0].reason, '직접 남긴 메모');
});

test('explicit current ownership confirmation adds one garment atomically and keeps source order facts', () => {
  const state = plan().next, j = state.journeys[0], before = structuredClone(state);
  assert.throws(() => connectImportedOrder(state, j.id, j.candidate), /종류/);
  const candidate = { ...j.candidate, kind: 'shirt', color: 'white', colorSource: 'user' };
  const result = connectImportedOrder(state, j.id, candidate, { at });
  assert.deepEqual(state, before);
  assert.equal(result.next.garments.length, 1);
  assert.equal(result.next.demo, false);
  assert.equal(result.next.journeys[0].stage, 'kept');
  assert.equal(result.next.journeys[0].garmentId, result.garmentId);
  assert.equal(result.next.garments[0].createdAt, at);
  assert.equal(importedOrderInfo(result.next.journeys[0]).orderDate, '2024-05-12');
  assert.deepEqual(result.next.journeys[0].history.slice(-3).map((e) => [e.action, e.at]), [['ordered', at], ['received', at], ['kept', at]]);
  assert.throws(() => connectImportedOrder(result.next, j.id, candidate), /확인/);
  for (const status of ['returned', 'cancelled', 'unknown', 'exchanging', 'returning']) {
    const inactive = plan(undefined, [row({ status })]).next;
    assert.throws(() => connectImportedOrder(inactive, inactive.journeys[0].id, candidate), /확인/);
    assert.equal(inactive.garments.length, 0);
  }
});

test('explicit linking to an existing owned unit preserves its photo and avoids a duplicate garment', () => {
  const state = plan().next, j = state.journeys[0];
  const garment = makeGarment({ id: 'g_existing', kind: 'shirt', gender: 'M', productId: j.candidate.productId, photoId: `p_${'a'.repeat(64)}`, label: '수정해 둔 내 옷', createdAt: at });
  state.demo = false; state.demoSelected = []; state.garments = [garment];
  const result = connectImportedOrder(state, j.id, { ...j.candidate, kind: 'shirt' }, { garmentId: garment.id, at });
  assert.deepEqual(result.next.garments, [garment]);
  assert.equal(result.next.journeys[0].garmentId, garment.id);
  assert.throws(() => connectImportedOrder(state, j.id, { ...j.candidate, kind: 'shirt' }, { garmentId: 'missing', at }), /다시 골라/);
});

test('unknown fields, spoofed links, malformed values, future versions and oversized batches are rejected', () => {
  const bad = [
    { ...payload(), address: 'do not import' }, { ...payload(), version: 2 }, { ...payload(), retailer: 'other' },
    payload([]), payload(Array.from({ length: 101 }, (_, i) => row({ key: i.toString(16).padStart(64, '0') }))),
    payload([row(), row()]),
    ...[
      { url: 'https://www.musinsa.com.evil.test/products/900000000001' },
      { url: 'https://www.musinsa.com/products/900000000001?token=secret' },
      { productId: 'ms-2' }, { key: ['a'.repeat(64)] }, { status: '__proto__' },
      { orderDate: '2026-02-31' }, { quantity: 0 }, { amount: -1 }, { amount: 1.5 },
      { brand: 'line\nbreak' }, { name: '' }, { option: 'x'.repeat(161) }, { photo: 'do not import' },
    ].map((patch) => payload([row(patch)])),
  ];
  for (const input of bad) assert.throws(() => parseOrderImport(JSON.stringify(input)));
  assert.throws(() => parseOrderImport('x'.repeat(250001)), /250KB/);
  assert.throws(() => parseOrderImport('<html>'), /파일/);
  assert.throws(() => planOrderImport(newWardrobeState(), payload(), ['b'.repeat(64)]), /다시 골라/);
});

test('capacity refusal is atomic and retains the pre-existing record', () => {
  const full = plan(newWardrobeState(), Array.from({ length: 100 }, (_, i) => row({ key: i.toString(16).padStart(64, '0') }))).next;
  const full200 = plan(full, Array.from({ length: 100 }, (_, i) => row({ key: (i + 100).toString(16).padStart(64, '0') }))).next;
  const original = structuredClone(full200);
  assert.throws(() => plan(full200, [row({ key: 'f'.repeat(64) })]), /200/);
  assert.deepEqual(full200, original);
});

test('imported provenance, existing personal photos and preferences survive durable save, reload and full backup restore', async () => {
  const store = createWardrobeStore({ indexedDB: new IDBFactory() });
  const first = await store.load();
  const image = await photoAsset(new Blob([new Uint8Array([255, 216, 255, 7])], { type: 'image/jpeg' }));
  const personal = { ...newWardrobeState(), demo: false, demoSelected: [], brands: ['기존 취향'], budget: 1,
    garments: [makeGarment({ id: 'g_existing', kind: 'shirt', gender: 'M', photoId: image.id, createdAt: at })] };
  await store.commit(personal, first.revision, [image], first.epoch);
  const before = await store.read();
  const result = plan(before.state, [row({ status: 'returned' }), row({ key: 'b'.repeat(64), status: 'cancelled' })]);
  await store.commit(result.next, before.revision, [], before.epoch);
  const saved = await store.read();
  assert.deepEqual(saved.state.garments, before.state.garments);
  assert.equal(saved.state.budget, 1);
  assert.deepEqual(saved.state.brands, ['기존 취향']);
  assert.deepEqual(new Uint8Array(await saved.photos.get(image.id).arrayBuffer()), new Uint8Array(await image.blob.arrayBuffer()));
  const backup = await parseWardrobeBackup(await store.backup());
  assert.deepEqual(backup.state, saved.state);
  assert.equal(backup.assets.length, 1);
  assert.deepEqual(backup.state.journeys.map(importedOrderInfo).map((info) => info.status), ['returned', 'cancelled']);
  store.close();
});
