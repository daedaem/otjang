import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { closetItems, missingGarmentDetails } from '../src/closet-view.js';
import { COLORS, SLOT_BY_ID } from '../../../app/lite/src/domain/data/slots.js';
import { makeGarment, garmentLabel, garmentKindName, garmentSlotStatus, slotForItem } from '../../../app/lite/src/domain/wardrobe.js';

const stamp = (day) => `2026-10-${String(day).padStart(2, '0')}T09:00:00.000Z`;
const shirt = (id, extra = {}) => makeGarment({ id, slot: 'm-oxford', color: 'white', createdAt: stamp(10), ...extra });
const ids = (rows) => rows.map(({ item }) => item.id);

test('category filtering uses the supplied wardrobe, including generic and opposite-gender garments', () => {
  const items = [shirt('g_male'), makeGarment({ id: 'g_female', slot: 'f-cardigan', color: 'grey', gender: 'F' }),
    makeGarment({ id: 'g_generic_outer', kind: 'jacket' }), makeGarment({ id: 'g_generic_bottom', kind: 'pants' })];
  assert.equal(closetItems(items).length, 4, 'no gender, budget or recommendation preference filters apply');
  assert.deepEqual(ids(closetItems(items, { category: 'outer', sort: 'name' })).sort(), ['g_female', 'g_generic_outer']);
  assert.deepEqual(ids(closetItems(items, { category: 'top' })), ['g_male']);
  assert.deepEqual(ids(closetItems(items, { category: 'bottom' })), ['g_generic_bottom']);
  assert.deepEqual(closetItems(items, { category: 'not-a-category' }), []);
});

test('search finds personal names, brands, kinds and Korean colour labels with flexible case, spaces and Unicode', () => {
  const items = [shirt('g_polo', { brand: '폴로 랄프 로렌', label: '출근 셔츠', color: 'blue' }),
    shirt('g_cafe', { brand: 'Café', label: 'White Oxford', color: 'white' }),
    makeGarment({ id: 'g_coat', kind: 'coat', label: '여행 코트', color: 'navy' })];
  for (const query of ['폴로랄프로렌', '폴로   셔츠 라이트블루', '  라이트 블루  출근셔츠  ', 'shirt 폴로'])
    assert.deepEqual(ids(closetItems(items, { query })), ['g_polo'], query);
  assert.deepEqual(ids(closetItems(items, { query: 'CAFE\u0301 WHITE' })), ['g_cafe']);
  assert.deepEqual(ids(closetItems(items, { query: '네이비 코트' })), ['g_coat']);
  assert.deepEqual(closetItems(items, { query: '폴로 코트' }), [], 'every entered token is required');
  assert.equal(closetItems(items, { query: ' \t\n ' }).length, items.length);
});

test('review details distinguish unknown type and colour without inventing confirmations', () => {
  const complete = shirt('g_complete');
  const typeMissing = makeGarment({ id: 'g_type', kind: 'shirt', color: 'white', createdAt: stamp(10) });
  const colorMissing = shirt('g_color', { color: null });
  const bothMissing = makeGarment({ id: 'g_both', kind: 'shirt', createdAt: stamp(10) });
  assert.deepEqual(missingGarmentDetails(complete), []);
  assert.deepEqual(missingGarmentDetails(typeMissing), ['세부 종류']);
  assert.deepEqual(missingGarmentDetails(colorMissing), ['색']);
  assert.deepEqual(missingGarmentDetails(bothMissing), ['세부 종류', '색']);
  assert.deepEqual(missingGarmentDetails({ ...complete, slot: 'unknown-slot', color: 'unknown-color' }), ['세부 종류', '색']);
  const mismatched = makeGarment({ id: 'g_mismatch', slot: 'm-white-sneaker', color: 'navy' });
  assert.deepEqual(missingGarmentDetails(mismatched), ['세부 종류'], 'an incompatible colour-specific slot is not a confirmed detail');
  assert.deepEqual(missingGarmentDetails(makeGarment({ id: 'g_known_type', slot: 'm-white-sneaker', color: null })), ['색'],
    'an unknown colour does not turn an explicitly known type into a second missing field');
  assert.deepEqual(ids(closetItems([complete, typeMissing, colorMissing, bothMissing], { reviewOnly: true })), ['g_type', 'g_color', 'g_both']);
});

test('search, category and review filters compose without bringing back unrelated clothes', () => {
  const items = [shirt('g_known', { brand: '폴로' }), shirt('g_unknown', { brand: '폴로', color: null }),
    makeGarment({ id: 'g_outer', kind: 'coat', brand: '폴로' }), shirt('g_other', { brand: '다른 브랜드', color: null })];
  const rows = closetItems(items, { category: 'top', query: '폴로', reviewOnly: true });
  assert.deepEqual(ids(rows), ['g_unknown']);
  assert.equal(rows[0].index, 1, 'render rows retain the original source position');
});

test('recent and oldest sort only actual user dates and keep missing, demo and legacy dates stable at the end', () => {
  const items = [shirt('g_legacy', { source: 'legacy', createdAt: stamp(30) }),
    shirt('g_old', { createdAt: stamp(1) }), shirt('g_missing', { createdAt: null }),
    shirt('g_new_a', { createdAt: stamp(20) }), shirt('g_demo', { source: 'demo', createdAt: stamp(31) }),
    shirt('g_new_b', { createdAt: stamp(20) }), shirt('g_invalid', { createdAt: 'unreadable' })];
  const tail = ['g_legacy', 'g_missing', 'g_demo', 'g_invalid'];
  const recent = closetItems(items);
  assert.deepEqual(ids(recent), ['g_new_a', 'g_new_b', 'g_old', ...tail]);
  assert.deepEqual(ids(closetItems(items, { sort: 'oldest' })), ['g_old', 'g_new_a', 'g_new_b', ...tail]);
  assert.deepEqual(ids(closetItems(items, { sort: 'unsupported' })), ids(recent));
  assert.equal(recent[0].registered, Date.parse(stamp(20)));
  for (const row of recent.filter(({ item }) => tail.includes(item.id))) assert.ok(Number.isNaN(row.registered));
});

test('name ordering uses Korean and natural numbers while equal names retain their source order', () => {
  const items = [shirt('g_ten', { label: '가방 10' }), shirt('g_na', { label: '나들이 셔츠' }),
    shirt('g_two', { label: '가방 2' }), shirt('g_same_first', { label: '같은 셔츠', createdAt: stamp(1) }),
    shirt('g_same_second', { label: '같은 셔츠', createdAt: stamp(30) })];
  assert.deepEqual(ids(closetItems(items, { sort: 'name' })), ['g_two', 'g_ten', 'g_same_first', 'g_same_second', 'g_na']);
});

test('filtering and sorting never rewrite caller-owned garments or the input array', () => {
  const items = [shirt('g_b', { label: '나' }), shirt('g_a', { label: '가', color: null })];
  const before = structuredClone(items);
  for (const item of items) Object.freeze(item);
  Object.freeze(items);
  const rows = closetItems(items, { sort: 'name' });
  closetItems(items, { category: 'top', query: '셔츠', reviewOnly: true, sort: 'oldest' });
  missingGarmentDetails(items[1]);
  assert.deepEqual(items, before);
  assert.notEqual(rows, items);
  assert.equal(rows[0].item, items[1], 'rows refer to the original garment, rather than manufacturing garment data');
  assert.deepEqual(closetItems(null), []);
});

test('the display helpers also run in a DOM-free VM with no app state or account objects', () => {
  const source = fs.readFileSync(new URL('../src/closet-view.js', import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '').replace(/^export function /gm, 'function ');
  const context = vm.createContext({ COLORS, SLOT_BY_ID, garmentLabel, garmentKindName, garmentSlotStatus, slotForItem });
  vm.runInContext(source + '\nglobalThis.view = { closetItems, missingGarmentDetails };', context);
  const item = shirt('g_vm', { color: null, brand: '폴로 랄프 로렌' });
  const rows = context.view.closetItems([item], { query: '폴로랄프로렌', category: 'top', reviewOnly: true });
  assert.deepEqual(ids(rows), ['g_vm']);
  assert.deepEqual(Array.from(context.view.missingGarmentDetails(item)), ['색']);
});
