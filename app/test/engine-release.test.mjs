import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRODUCTS } from '../src/data/products.js';
import { SLOTS, SLOT_BY_ID } from '../src/data/slots.js';
import { search, recommendItems, recommendLooks, closetLooks, essentials, productsFor } from '../src/engine.js';
import { garmentSlotStatus, wardrobeSlotStatus } from '../src/wardrobe.js';
import { productEligible } from '../src/catalog-policy.js';

const base = { gender: 'M', styles: ['classic'], season: 'fall', closet: [], brands: [], hidden: [] };
const garment = (id, slot, color) => ({ id, slot, color, kind: SLOT_BY_ID[slot].shape, gender: 'M', label: id });

test('unknown jacket remains a possible match, not evidence that fleece and shell are both owned', () => {
  const jacket = { id: 'only-jacket', slot: null, kind: 'jacket', gender: 'M', color: null, label: '내 재킷' };
  const state = { ...base, styles: ['gorp'], closet: [jacket] };
  assert.equal(garmentSlotStatus(jacket, SLOT_BY_ID['m-fleece']), 'uncertain');
  assert.equal(wardrobeSlotStatus(state.closet, SLOT_BY_ID['m-shell']), 'uncertain');
  const recommendation = recommendItems(state).find((row) => row.slot.id === 'm-fleece');
  assert.ok(recommendation, '미확인 플리스를 구매 후보에서 숨기지 않음');
  assert.equal(recommendation.ownership, 'uncertain');
  assert.match(recommendation.reasons[0], /먼저 확인/);
  assert.ok(
    essentials(state)
      .filter((row) => ['m-fleece', 'm-shell'].includes(row.slot.id))
      .every((row) => !row.owned && row.needsCheck),
  );
  const looks = recommendLooks(state, { limit: 100 });
  assert.ok(looks.some((look) => look.uncertainCount > 0));
  assert.ok(
    looks
      .flatMap((look) => look.items)
      .filter((item) => item.item?.id === jacket.id)
      .every((item) => item.certainty === 'uncertain'),
  );
  assert.equal(closetLooks(state).ready.length, 0);
});

test('confirmed type takes precedence over a generic garment and is consistent across basic checks and outfits', () => {
  const state = {
    ...base,
    styles: ['gorp'],
    closet: [
      { id: 'generic', slot: null, kind: 'jacket', gender: 'M', color: 'navy' },
      garment('confirmed', 'm-fleece', 'navy'),
    ],
  };
  assert.equal(wardrobeSlotStatus(state.closet, SLOT_BY_ID['m-fleece']), 'confirmed');
  assert.equal(essentials(state).find((row) => row.slot.id === 'm-fleece').needsCheck, false);
  assert.ok(!recommendItems(state).some((row) => row.slot.id === 'm-fleece'));
  const match = recommendLooks(state, { limit: 100 })
    .flatMap((look) => look.items)
    .find((item) => item.slot.id === 'm-fleece' && item.owned);
  assert.ok(match);
  assert.equal(match.item.id, 'confirmed');
  assert.equal(match.certainty, 'confirmed');
});

test('search outfit uses the actual jeans anchor even when a chino is a competing owned option', () => {
  const state = {
    ...base,
    closet: [garment('my-jeans', 'm-denim-raw', 'indigo'), garment('my-chino', 'm-chino', 'beige')],
  };
  const result = search(state, '청바지에 어울리는 신발');
  assert.ok(result.outfit);
  const bottom = result.outfit.items.find((item) => item.role === 'bottom');
  assert.equal(bottom.item.id, 'my-jeans');
  assert.ok(result.items.every((row) => row.slot.cat === 'shoes'));
});

test('an unowned search anchor stays a purchasable jeans item, never fictional ownership', () => {
  const result = search(base, '청바지에 어울리는 신발');
  assert.ok(result.outfit);
  assert.ok(result.outfit.items.some((item) => item.slot.shape === 'jeans' && item.product && !item.owned));
  assert.equal(result.outfit.ownedCount, 0);
});

test('compound padded vest search does not return knit vest or down jacket slots', () => {
  for (const query of ['패딩 베스트', '패딩 조끼', '다운 베스트', '다운 조끼']) {
    const result = search(base, query);
    assert.ok(result.items.length);
    assert.ok(result.items.every((row) => row.slot.id === 'm-downvest'));
  }
});

test('explicit ivory filter excludes inferred image colors across search and direct product filtering', () => {
  const result = search(base, '아이보리 셔츠');
  assert.ok(result.items.length);
  assert.ok(!result.items.some((row) => row.product.id === 'ms-5262943'));
  assert.ok(result.items.every((row) => row.product.color === 'ivory' && row.product.colorSource !== 'image'));
  for (const slot of SLOTS) assert.ok(productsFor(slot.id, { color: 'ivory' }).every((p) => p.colorSource !== 'image'));
});

test('price sort considers the full eligible collection before cutting results and preserves explicit budget', () => {
  const result = search(base, '셔츠 최저가');
  assert.equal(result.query.maxPrice, null);
  assert.equal(result.query.priceSort, 'asc');
  const eligible = PRODUCTS.filter(
    (p) => productEligible(p) && SLOT_BY_ID[p.slot].g === 'M' && result.query.targetMatch(SLOT_BY_ID[p.slot]),
  );
  const expected = Math.min(...eligible.map((p) => p.price));
  assert.equal(result.items[0].product.price, expected);
  assert.ok(result.items.some((row) => row.product.id === 'ms-4717529'));
  assert.ok(result.items.every((row, i) => !i || result.items[i - 1].product.price <= row.product.price));
  const capped = search(base, '셔츠 낮은 가격순 5만원 이하');
  assert.equal(capped.query.maxPrice, 50000);
  assert.ok(capped.items.every((row) => row.product.price <= 50000));
});

test('brand recognition uses catalog brands of the explicitly requested gender', () => {
  const result = search(base, '여성 로라로라 니트');
  assert.equal(result.query.brand, '로라로라');
  assert.equal(result.gender, 'F');
  assert.ok(result.items.every((row) => row.product.brand === '로라로라' && row.slot.g === 'F'));
  assert.equal(
    result.items.some((row) => row.product.brand === '폴로 랄프 로렌'),
    false,
  );
});
