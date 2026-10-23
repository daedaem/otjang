import { test } from 'node:test';
import assert from 'node:assert/strict';
import { purchasePlanContext } from '../../../app/lite/src/domain/purchase-plan-context.js';
import { wardrobePlan } from '../../../app/lite/src/domain/wardrobe-plan.js';
import { candidateFromProduct, candidateFromLink, compareCandidate } from '../../../app/lite/src/domain/purchase-candidate.js';
import { createPurchaseJourney, transitionPurchaseJourney } from '../../../app/lite/src/domain/purchase-journey.js';
import { makeGarment, newWardrobeState } from '../../../app/lite/src/domain/wardrobe.js';
import { PRODUCTS } from '../../../app/lite/src/domain/data/products.js';

function wardrobe(extra = {}) {
  return {
    ...newWardrobeState(), demo: false, demoSelected: [], styles: ['classic'], season: 'fall',
    garments: [['m-oxford', 'white'], ['m-chino', 'beige'], ['m-white-sneaker', 'white']]
      .map(([slot, color]) => makeGarment({ id: `g_${slot}`, slot, color, gender: 'M' })),
    ...extra,
  };
}
function firstPair(state) {
  const pair = wardrobePlan(state).pairs.find((row) => row.slots.every((slot) => row.products[slot.id]?.length));
  assert.ok(pair, 'the real shirt, chinos and sneakers need a two-product outfit');
  return pair;
}

test('each current pair product retains the exact companion, colour evidence and collected price', () => {
  const state = wardrobe();
  const original = structuredClone(state);
  const plan = wardrobePlan(state);
  assert.equal(plan.gaps.length, 0);
  assert.ok(plan.pairs.length > 0);
  for (const pair of plan.pairs) {
    for (const slot of pair.slots) {
      const companionSlot = pair.slots.find((other) => other.id !== slot.id);
      for (const selected of pair.products[slot.id]) {
        const context = purchasePlanContext(state, candidateFromProduct(selected.product));
        assert.ok(context, selected.product.id);
        assert.deepEqual(context.pair, pair);
        assert.deepEqual(context.companionSlot, companionSlot);
        assert.deepEqual(context.selected, selected);
        assert.deepEqual(context.companion, pair.products[companionSlot.id][0]);
        assert.equal(context.selected.product, selected.product, 'catalog product identity is preserved');
        assert.equal(context.companion.price.kind, 'collected');
      }
    }
  }
  assert.deepEqual(state, original, 'reading context never updates clothes or purchase records');
});

test('answering absent preserves the two-product context without changing the single-product verdict', () => {
  const state = wardrobe();
  const pair = firstPair(state);
  const candidate = candidateFromProduct(pair.products[pair.slots[0].id][0].product);
  let journey = createPurchaseJourney(candidate, { id: 'j_pair', at: '2026-10-15T00:00:00.000Z' });
  journey = transitionPurchaseJourney(journey, 'details-change', {
    at: '2026-10-15T00:01:00.000Z', changes: { absence: 'absent' },
  });
  const next = { ...state, journeys: [journey] };
  const before = compareCandidate(next, candidate, { absence: 'absent' });
  assert.equal(before.newFormulaCount, 0);
  assert.equal(before.decision.kind, 'hold', 'two missing products do not make one product a purchase recommendation');
  assert.ok(purchasePlanContext(next, candidate));
  assert.deepEqual(compareCandidate(next, candidate, { absence: 'absent' }), before);
  assert.equal(next.garments.length, 3);
  assert.deepEqual(next.journeys[0], journey);
});

test('example closets, replacement intent and empty actual closets have no purchase-plan context', () => {
  const state = wardrobe();
  const pair = firstPair(state);
  const candidate = candidateFromProduct(pair.products[pair.slots[0].id][0].product);
  assert.equal(purchasePlanContext({ ...state, demo: true, demoSelected: state.garments }, candidate), null);
  assert.equal(purchasePlanContext(state, candidate, { intent: 'replace' }), null);
  assert.equal(purchasePlanContext({ ...state, garments: [] }, candidate), null);
  assert.equal(purchasePlanContext(state, null), null);
});

test('edited or mismatched candidate metadata cannot inherit a catalog pair', () => {
  const state = wardrobe();
  const pair = firstPair(state);
  const candidate = candidateFromProduct(pair.products[pair.slots[0].id][0].product);
  const other = pair.products[pair.slots[1].id][0].product;
  const changes = {
    productId: other.id, url: other.url, originalUrl: other.url, slot: pair.slots[1].id,
    kind: 'tee', gender: 'f', color: candidate.color === 'white' ? 'black' : 'white',
    colorSource: 'user', brand: 'edited brand', name: 'edited name', price: candidate.price + 1,
    priceSource: 'user', checkedAt: '2020-01-01', source: 'user', classificationConfirmed: false,
  };
  for (const [field, value] of Object.entries(changes))
    assert.equal(purchasePlanContext(state, { ...candidate, [field]: value }), null, field);
  const tracked = candidateFromLink(`${candidate.url}?utm_source=test`);
  assert.ok(purchasePlanContext(state, tracked), 'the same catalog product may arrive through a tracking link');
  assert.equal(purchasePlanContext(state, candidateFromProduct(PRODUCTS.find((product) => product.slot === 'm-oxford'))), null);
  assert.equal(purchasePlanContext(state, candidateFromLink('https://example.com/products/unrelated')), null);
});

test('each call uses the current clothes, hidden products and available companion rather than stale context', () => {
  const state = wardrobe();
  const pair = firstPair(state);
  const slot = pair.slots[0];
  const companionSlot = pair.slots[1];
  const candidate = candidateFromProduct(pair.products[slot.id][0].product);
  assert.ok(purchasePlanContext(state, candidate));
  assert.equal(purchasePlanContext({ ...state, hidden: [candidate.productId] }, candidate), null);
  // Outfit formulas can choose alternative shoe/pants slots; remove every
  // possible other-product slot rather than only the original loafer choice.
  const hiddenCompanions = PRODUCTS.filter((product) => product.slot !== slot.id).map((product) => product.id);
  assert.equal(purchasePlanContext({ ...state, hidden: hiddenCompanions }, candidate), null);
  assert.equal(purchasePlanContext({ ...state, budget: 1 }, candidate), null);
  assert.equal(purchasePlanContext({ ...state, garments: state.garments.slice(0, 1) }, candidate), null);
  const firstCompanion = pair.products[companionSlot.id][0].product.id;
  const updated = purchasePlanContext({ ...state, hidden: [firstCompanion] }, candidate);
  assert.ok(updated, 'a currently eligible replacement companion remains available');
  assert.notEqual(updated.companion.product.id, firstCompanion);
  assert.equal(purchasePlanContext(state, candidate).companion.product.id, firstCompanion, 'there is no retained cache');
});

test('photo-guessed colours remain explicitly unconfirmed for both products', () => {
  const state = wardrobe();
  const hidden = PRODUCTS.filter((product) => product.colorSource !== 'image')
    .map((product) => product.id);
  const imageState = { ...state, hidden };
  const imagePair = firstPair(imageState);
  for (const slot of imagePair.slots) {
    const selected = imagePair.products[slot.id][0];
    const candidate = candidateFromProduct(selected.product);
    const context = purchasePlanContext(imageState, candidate);
    assert.ok(context);
    assert.equal(candidate.colorSource, 'image');
    assert.equal(context.selected.colorConfirmed, false);
    assert.equal(context.companion.colorConfirmed, false);
    assert.ok(compareCandidate(imageState, candidate, { absence: 'absent' }).missingChecks
      .some((check) => check.code === 'candidate-color'));
  }
});
