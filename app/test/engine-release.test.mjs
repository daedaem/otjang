import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRODUCTS } from '../src/data/products.js';
import { SLOTS, SLOT_BY_ID } from '../src/data/slots.js';
import { search, recommendItems, recommendLooks, closetLooks, essentials, productsFor } from '../src/engine.js';
import {
  garmentSlotStatus,
  wardrobeSlotStatus,
  garmentMatchesSlot,
  garmentLabel,
  slotForItem,
  makeGarment,
  newWardrobeState,
  wardrobeView,
  validateWardrobe,
  migrateLegacyWardrobe,
} from '../src/wardrobe.js';
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
  const floor = search(base, '셔츠 10만원 이상');
  assert.ok(floor.items.length);
  assert.ok(floor.items.every((row) => row.product.price >= 100000));
  // Real catalog prices give an observable equality boundary, without mocked products.
  const boundary = eligible.find((p) => p.id === 'ms-4717529');
  assert.ok(boundary);
  const inclusive = search(base, `셔츠 ${boundary.price}원 이상 ${boundary.price}원 이하`);
  assert.ok(inclusive.items.some((row) => row.product.id === boundary.id));
  assert.ok(inclusive.items.every((row) => row.product.price === boundary.price));
  for (const strict of [
    `셔츠 ${boundary.price}원 초과`,
    `셔츠 ${boundary.price}원 넘는`,
    `셔츠 ${boundary.price}원 미만`,
  ]) {
    assert.ok(!search(base, strict).items.some((row) => row.product.id === boundary.id));
  }
  const outfitBudget = search({ ...base, budget: 60000 }, '출근용 셔츠');
  assert.ok(outfitBudget.outfit);
  assert.ok(outfitBudget.outfit.items.filter((i) => !i.owned).every((i) => i.product.price <= 60000));
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

test('an already-owned product pin uses that exact garment and preserves its photo and actual color', () => {
  const selected = PRODUCTS.find((p) => p.id === 'ms-854339');
  assert.ok(selected);
  const ownedPin = makeGarment({
    id: 'selected-blue',
    slot: selected.slot,
    color: 'blue',
    productId: selected.id,
    photoId: `p_${'a'.repeat(64)}`,
  });
  const other = makeGarment({ id: 'existing-white', slot: 'm-oxford', color: 'white' });
  for (const garments of [
    [other, ownedPin],
    [ownedPin, other],
  ]) {
    const record = { ...newWardrobeState(), demo: false, demoSelected: [], garments };
    validateWardrobe(record);
    const state = { ...wardrobeView(record), season: 'fall' };
    const looks = recommendLooks(state, { limit: 100, occasion: null, pinnedProduct: selected });
    assert.ok(looks.length);
    for (const look of looks) {
      const actual = look.items.find((i) => i.item?.productId === selected.id);
      assert.ok(actual, look.look.id);
      assert.equal(actual.owned, true);
      assert.equal(actual.item.id, ownedPin.id);
      assert.equal(actual.item.photoId, ownedPin.photoId);
      assert.equal(actual.color, ownedPin.color);
      assert.equal(actual.certainty, 'confirmed');
      assert.ok(!look.items.some((i) => i.product?.id === selected.id), '보유 상품을 추가 구매로 세지 않음');
    }
  }
});

test('a color-specific white sneaker needs white evidence for both migrated and current explicit slots', () => {
  const slot = SLOT_BY_ID['m-white-sneaker'];
  for (const [color, expected] of [
    ['white', 'confirmed'],
    ['ivory', 'missing'],
    ['red', 'missing'],
    [null, 'uncertain'],
  ]) {
    const record = migrateLegacyWardrobe(
      JSON.stringify({
        v: 2,
        onboarded: true,
        gender: 'M',
        styles: ['minimal'],
        brands: [],
        brandOnly: false,
        occasion: null,
        budget: null,
        saved: [],
        hidden: [],
        closet: [
          {
            id: `legacy-shoe-${color || 'unknown'}`,
            slot: slot.id,
            color,
            productId: 'ms-6192515',
            photo: false,
            addedAt: 0,
          },
        ],
      }),
    );
    const view = wardrobeView(record);
    const state = {
      ...view,
      season: 'fall',
      closet: [
        ...view.closet,
        garment('my-cardigan', 'm-cardigan', 'grey'),
        garment('my-tee', 'm-tee', 'white'),
        garment('my-slacks', 'm-slacks', 'black'),
      ],
    };
    const item = state.closet[0];
    assert.equal(item.color, color, '이전 기록의 실제 색은 보존');
    assert.equal(item.productId, 'ms-6192515', '실제 보유 상품 ID는 보존');
    assert.equal(item.slot, slot.id, '임의의 다른 소재/종류로 이동하지 않음');
    assert.equal(garmentSlotStatus(item, slot), expected);
    assert.equal(garmentSlotStatus(garment('current-shoe', slot.id, color), slot), expected);
    const basic = essentials(state).find((r) => r.slot.id === slot.id);
    assert.equal(basic.owned, expected === 'confirmed');
    assert.equal(basic.needsCheck, expected === 'uncertain');
    const owned = recommendLooks(state, { limit: 100 })
      .flatMap((l) => l.items)
      .filter((i) => i.item?.id === item.id);
    if (expected === 'missing') {
      assert.equal(garmentMatchesSlot(item, slot), false);
      assert.equal(owned.length, 0, '색 조건과 충돌하는 옷은 보유 역할로 사용하지 않음');
      assert.equal(garmentLabel(item), '운동화');
      assert.equal(slotForItem(item).name, '운동화');
    } else {
      assert.ok(owned.length);
      assert.ok(owned.every((i) => i.certainty === expected));
    }
    const ready = closetLooks(state, { limit: 100 }).ready;
    assert.equal(
      ready.some((look) => look.look.id === 'm-mono-daily'),
      expected === 'confirmed',
    );
  }
});

test('white-specific product candidates require evidence in searches and direct filters', () => {
  const direct = productsFor('m-white-sneaker');
  assert.ok(direct.length);
  assert.ok(direct.every((p) => p.color === 'white' && p.colorSource !== 'image'));
  assert.deepEqual(productsFor('m-white-sneaker', { color: 'red' }), []);
  assert.deepEqual(productsFor('m-white-sneaker', { color: 'ivory' }), []);
  const result = search({ ...base, styles: ['minimal'] }, '화이트 스니커즈');
  assert.ok(result.items.length);
  assert.ok(result.items.every((row) => row.product.color === 'white' && row.product.colorSource !== 'image'));
  assert.ok(!search(base, '검정 니트').items.some((row) => row.product.id === 'ms-4452218'));
});

test('descending price uses the full catalog and a quality request does not equate price with quality', () => {
  for (const request of ['셔츠 높은 가격순', '셔츠 가격 내림차순', '비싼 셔츠']) {
    const result = search(base, request);
    const eligible = PRODUCTS.filter(
      (p) => productEligible(p) && SLOT_BY_ID[p.slot].g === 'M' && result.query.targetMatch(SLOT_BY_ID[p.slot]),
    );
    assert.equal(result.query.priceSort, 'desc', request);
    assert.equal(result.query.maxPrice, null, request);
    assert.equal(result.items[0].product.price, Math.max(...eligible.map((p) => p.price)), request);
    assert.ok(
      result.items.every((row, i) => !i || result.items[i - 1].product.price >= row.product.price),
      request,
    );
  }
  const regular = search(base, '셔츠').items.map((row) => row.product.id);
  for (const request of ['고급 셔츠', '퀄리티 좋은 셔츠', '품질 좋은 셔츠', '비싸도 좋은 거 셔츠']) {
    const result = search(base, request);
    assert.equal(result.query.qualityUnavailable, true, request);
    assert.ok(result.query.terms.includes('품질 정보 미확인'), request);
    assert.ok(!result.query.terms.includes('품질 우선'), request);
    assert.deepEqual(
      result.items.map((row) => row.product.id),
      regular,
      request,
    );
  }
});

test('selected search anchor retains the exact real garment and missing or demo IDs are explicit', () => {
  const chosen = makeGarment({
    id: 'selected-blue-shirt',
    slot: 'm-oxford',
    color: 'blue',
    photoId: `p_${'b'.repeat(64)}`,
  });
  const competing = makeGarment({ id: 'aaa-white-shirt', slot: 'm-oxford', color: 'white' });
  for (const closet of [
    [competing, chosen],
    [chosen, competing],
  ]) {
    const result = search({ ...base, demo: false, closet }, '셔츠에 어울리는 신발', { anchorItemId: chosen.id });
    assert.equal(result.anchorUnavailable, null);
    assert.equal(result.anchorItem.id, chosen.id);
    assert.equal(result.anchorItem.photoId, chosen.photoId);
    assert.equal(result.anchorItem.color, 'blue');
    assert.ok(result.outfit);
    const actual = result.outfit.items.find((i) => i.item?.id === chosen.id);
    assert.ok(actual);
    assert.equal(actual.owned, true);
    assert.equal(actual.item.photoId, chosen.photoId);
    assert.equal(actual.color, 'blue');
  }
  for (const [state, id] of [
    [{ ...base, demo: false, closet: [competing] }, chosen.id],
    [{ ...base, demo: true, closet: [{ ...chosen, source: 'demo' }] }, chosen.id],
  ]) {
    const result = search(state, '셔츠에 어울리는 신발', { anchorItemId: id });
    assert.ok(result.anchorUnavailable);
    assert.equal(result.anchorItem, null);
    assert.equal(result.anchorProduct, null);
    assert.equal(result.outfit, null);
  }
});

test('free text anchor color uses actual matching ownership or an evidenced catalog product and never fabricates it', () => {
  const blue = makeGarment({ id: 'aaa-blue', slot: 'm-oxford', color: 'blue' });
  const white = makeGarment({ id: 'zzz-white', slot: 'm-oxford', color: 'white' });
  const request = '흰 셔츠에 어울리는 신발';
  const owned = search({ ...base, closet: [blue, white] }, request);
  assert.equal(owned.query.anchorColor, 'white');
  assert.equal(owned.query.color, null, 'target color is independent of the anchor');
  assert.equal(owned.anchorItem.id, white.id);
  assert.ok(owned.outfit.items.some((i) => i.item?.id === white.id && i.color === 'white'));
  const catalog = search({ ...base, closet: [blue] }, request);
  assert.equal(catalog.anchorItem, null);
  assert.equal(catalog.anchorUnavailable, null);
  assert.ok(catalog.anchorProduct);
  assert.equal(catalog.anchorProduct.color, 'white');
  assert.notEqual(catalog.anchorProduct.colorSource, 'image');
  assert.ok(
    catalog.outfit.items.some((i) => i.product?.id === catalog.anchorProduct.id && i.color === 'white' && !i.owned),
  );
  const sameProductDifferentActualColor = search(
    { ...base, closet: [{ ...blue, productId: catalog.anchorProduct.id }] },
    request,
  );
  assert.ok(
    sameProductDifferentActualColor.outfit.items.some(
      (i) => i.product?.id === catalog.anchorProduct.id && i.color === 'white' && !i.owned,
    ),
  );
  for (const result of [search(base, '흰 청바지에 어울리는 신발'), search({ ...base, budget: 1 }, request)]) {
    assert.ok(result.anchorUnavailable);
    assert.equal(result.anchorItem, null);
    assert.equal(result.anchorProduct, null);
    assert.equal(result.outfit, null);
  }
});
