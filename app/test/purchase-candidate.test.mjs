import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCandidateLink, candidateFromLink, candidateFromProduct, compareCandidate } from '../src/purchase-candidate.js';
import { PRODUCTS } from '../src/data/products.js';
import { SLOT_BY_ID } from '../src/data/slots.js';
import { recommendItems, recommendLooks, essentials, closetLooks, search, SAFE_PRODUCTS } from '../src/engine.js';
import { createPurchaseJourney, transitionPurchaseJourney } from '../src/purchase-journey.js';

const candidateTestItem = (id, slot, color, extra = {}) => ({
  id, slot, color, kind: SLOT_BY_ID[slot]?.shape || 'shirt', gender: 'M', source: 'user',
  brand: null, label: id, productId: null, photoId: null, ...extra,
});
const candidateTestState = (garments = []) => ({
  gender: 'M', styles: ['classic'], season: 'fall', occasion: null,
  demo: false, garments, closet: garments, budget: null, journeys: [],
});
const candidateTestBasics = () => [
  candidateTestItem('my-shirt-white', 'm-oxford', 'white', { photoId: 'original-shirt-photo' }),
  candidateTestItem('my-chino-beige', 'm-chino', 'beige'),
  candidateTestItem('my-loafer-brown', 'm-loafer', 'brown'),
];
const candidateTestJacket = (extra = {}) => ({
  ...candidateFromLink('https://www.musinsa.com/products/5755268'),
  slot: 'm-harrington', kind: 'jacket', color: 'beige', colorSource: 'user',
  classificationConfirmed: true, ...extra,
});
const candidateTestJourney = (stage, extra = {}) => {
  const at = '2026-10-14T01:00:00.000Z';
  let journey = createPurchaseJourney(candidateTestJacket(), { id: 'j_engine', at });
  for (const action of ['ordered', 'received', 'kept', 'returned']) {
    if (stage === 'candidate') break;
    journey = transitionPurchaseJourney(journey, action, { at });
    if (action === stage) break;
  }
  return { ...journey, ...extra };
};

test('candidate links canonicalize an exact catalog ID and retain the uncatalogued original item', () => {
  const parsed = parseCandidateLink('https://www.musinsa.com/app/goods/728000?utm_source=chat#reviews');
  assert.equal(parsed.canonicalUrl, 'https://www.musinsa.com/products/728000');
  assert.equal(parsed.productId, 'ms-728000');
  assert.equal(parsed.product.id, 'ms-728000');
  assert.equal(parsed.kind, 'catalog');
  assert.equal(parsed.originalUrl, 'https://www.musinsa.com/app/goods/728000?utm_source=chat#reviews');
  const external = candidateFromLink('https://www.musinsa.com/products/5755268?source=test');
  assert.equal(external.url, 'https://www.musinsa.com/products/5755268');
  assert.equal(external.originalUrl, 'https://www.musinsa.com/products/5755268?source=test');
  assert.equal(external.productId, 'ms-5755268');
  assert.equal(external.slot, null);
  assert.equal(external.price, null);
  assert.equal(external.priceSource, null);
  assert.equal(external.name, '');
  assert.equal(external.brand, '');
  assert.equal(external.classificationConfirmed, false);
});

test('candidate links reject active schemes, credentials, local and normalized private address forms', () => {
  for (const raw of [
    'javascript:alert(1)', 'data:text/html,test', 'http://shop.example.com/item/1',
    'https://user:password@shop.example.com/item/1', 'https://localhost/item/1',
    'https://store.local/item/1', 'https://localhost./item/1', 'https://store.home/item/1',
    'https://127.0.0.1/1', 'https://2130706433/1',
    'https://0x7f000001/1', 'https://10.0.0.1/1', 'https://172.20.0.1/1',
    'https://192.168.1.1/1', 'https://169.254.1.1/1', 'https://100.64.1.1/1',
    'https://[::1]/1', 'https://[fc00::1]/1', 'https://[::ffff:127.0.0.1]/1',
    'https://shop.example.com:8443/item/1', 'https://shop.example.com/\nitem/1',
  ]) assert.equal(parseCandidateLink(raw).ok, false, raw);
  const publicLink = parseCandidateLink('https://shop.example.com/item/1?variant=beige#details');
  assert.equal(publicLink.ok, true);
  assert.equal(publicLink.kind, 'external');
  assert.equal(publicLink.canonicalUrl, 'https://shop.example.com/item/1?variant=beige');
  const spoof = parseCandidateLink('https://www.musinsa.com.example.com/products/728000');
  assert.equal(spoof.productId, null);
  assert.equal(spoof.product, null);
});

test('catalog snapshots keep dated price and color provenance, never mark either as live recognition', () => {
  const product = PRODUCTS.find((p) => p.id === 'ms-728000');
  const candidate = candidateFromProduct(product);
  assert.equal(candidate.productId, product.id);
  assert.equal(candidate.gender, 'm');
  assert.equal(candidate.price, product.price);
  assert.equal(candidate.priceSource, 'catalog');
  assert.equal(candidate.checkedAt, product.checkedAt);
  assert.equal(candidate.source, 'catalog');
  const unknownColor = candidateFromProduct({ ...product, color: null, colorSource: null });
  assert.equal(unknownColor.color, null);
  assert.equal(unknownColor.colorSource, null);
  const comparison = compareCandidate(candidateTestState(), candidate);
  assert.deepEqual(comparison.price, { amount: product.price, source: 'catalog', checkedAt: product.checkedAt, live: false });
  assert.equal(comparison.decision.kind, 'hold');
});

test('one candidate completes a formula using exact real garment IDs and photos without changing the wardrobe', () => {
  const state = candidateTestState(candidateTestBasics());
  const before = structuredClone(state);
  const candidate = candidateTestJacket();
  const candidateBefore = structuredClone(candidate);
  const result = compareCandidate(state, candidate, { absence: 'absent' });
  assert.equal(result.newFormulaCount, 1);
  assert.equal(result.decision.kind, 'consider');
  const look = result.looks.find((l) => l.look.id === 'm-ivy-campus');
  assert.ok(look);
  const ownRows = look.items.filter((row) => row.source === 'wardrobe');
  assert.deepEqual(ownRows.map((row) => row.item.id), ['my-shirt-white', 'my-chino-beige', 'my-loafer-brown']);
  assert.equal(ownRows[0].item.photoId, 'original-shirt-photo');
  const candidateRow = look.items.find((row) => row.source === 'candidate');
  assert.equal(candidateRow.owned, false);
  assert.equal(candidateRow.item, null);
  assert.equal(candidateRow.candidate.productId, 'ms-5755268');
  assert.deepEqual(state, before);
  assert.deepEqual(candidate, candidateBefore);
});

test('absent registration is not confirmed absence and demo rows never count as actual garments', () => {
  const candidate = candidateTestJacket();
  const unknown = compareCandidate(candidateTestState(candidateTestBasics()), candidate);
  assert.equal(unknown.newFormulaCount, 1);
  assert.equal(unknown.decision.kind, 'hold');
  assert.ok(unknown.missingChecks.some((c) => c.code === 'ownership-unknown'));
  const present = compareCandidate(candidateTestState(candidateTestBasics()), candidate, { absence: 'present' });
  assert.equal(present.decision.kind, 'hold');
  const demoRows = candidateTestBasics().map((item) => ({ ...item, id: `demo_${item.id}`, source: 'demo' }));
  const demo = compareCandidate({ ...candidateTestState([]), demo: true, closet: demoRows }, candidate, { absence: 'absent' });
  assert.deepEqual(demo.actualGarmentIds, []);
  assert.equal(demo.newFormulaCount, 0);
  assert.equal(demo.decision.kind, 'hold');
});

test('generic kind, unconfirmed candidate classification and image-derived colors cannot inflate complete formulas', () => {
  const basics = candidateTestBasics();
  for (const extra of [
    { slot: null, kind: 'jacket', classificationConfirmed: false },
    { classificationConfirmed: false }, { kind: 'knit' },
    { color: null, colorSource: null }, { colorSource: 'image' },
  ]) {
    const result = compareCandidate(candidateTestState(basics), candidateTestJacket(extra), { absence: 'absent' });
    assert.equal(result.newFormulaCount, 0, JSON.stringify(extra));
    assert.equal(result.decision.kind, 'hold');
    assert.ok(result.missingChecks.length);
  }
  const generic = basics.map((item, i) => i === 0 ? { ...item, slot: null } : item);
  const result = compareCandidate(candidateTestState(generic), candidateTestJacket(), { absence: 'absent' });
  assert.equal(result.newFormulaCount, 0);
  assert.equal(result.decision.kind, 'hold');
  assert.ok(result.missingChecks.some((check) => check.code === 'owned-details' && check.garmentIds.includes('my-shirt-white')));
  const unknownColor = basics.map((item, i) => i === 0 ? { ...item, color: null } : item);
  assert.equal(compareCandidate(candidateTestState(unknownColor), candidateTestJacket(), { absence: 'absent' }).newFormulaCount, 0);
});

test('a complete existing formula does not become newly complete because another same-type item is added', () => {
  const state = candidateTestState([
    ...candidateTestBasics(), candidateTestItem('my-jacket-navy', 'm-harrington', 'navy'),
  ]);
  const result = compareCandidate(state, candidateTestJacket(), { absence: 'absent' });
  assert.ok(result.existingFormulaCount >= 1);
  assert.equal(result.newFormulaCount, 0);
  assert.equal(result.decision.kind, 'hold');
  assert.ok(result.looks.find((look) => look.look.id === 'm-ivy-campus').existing);
});

test('same product page does not imply the same variant or a no-buy decision', () => {
  const samePage = candidateTestItem('my-other-variant', 'm-harrington', 'navy', { productId: 'ms-5755268' });
  const result = compareCandidate(candidateTestState([...candidateTestBasics(), samePage]), candidateTestJacket());
  assert.equal(result.sameProduct.length, 1);
  assert.equal(result.exactOwned.length, 0);
  assert.equal(result.decision.kind, 'hold');
  assert.ok(result.missingChecks.some((entry) => entry.code === 'product-variant'));
  const sameColor = { ...samePage, color: 'beige' };
  const exact = compareCandidate(candidateTestState([...candidateTestBasics(), sameColor]), candidateTestJacket());
  assert.equal(exact.exactOwned[0].id, 'my-other-variant');
  assert.equal(exact.decision.kind, 'skip');
  assert.equal(compareCandidate(candidateTestState([...candidateTestBasics(), sameColor]), candidateTestJacket(), { intent: 'replace' }).decision.kind, 'hold');
});

test('same type and color remains similarity, with budget and link provenance checked separately', () => {
  const similar = candidateTestItem('my-similar-jacket', 'm-harrington', 'beige', { productId: 'ms-123' });
  const result = compareCandidate(candidateTestState([...candidateTestBasics(), similar]), candidateTestJacket());
  assert.equal(result.similarOwned[0].id, 'my-similar-jacket');
  assert.equal(result.exactOwned.length, 0);
  assert.notEqual(result.decision.kind, 'skip');
  const budget = compareCandidate({ ...candidateTestState(candidateTestBasics()), budget: 50000 }, candidateTestJacket({ price: 80000, priceSource: 'user' }), { absence: 'absent' });
  assert.equal(budget.decision.kind, 'hold');
  assert.ok(budget.missingChecks.some((c) => c.code === 'budget'));
  assert.equal(budget.price.source, 'user');
  const mismatch = compareCandidate(candidateTestState(candidateTestBasics()), candidateTestJacket({ productId: 'ms-728000' }), { absence: 'absent' });
  assert.equal(mismatch.newFormulaCount, 0);
  assert.equal(mismatch.decision.kind, 'hold');
  assert.ok(mismatch.missingChecks.some((c) => c.code === 'product-id-mismatch'));
});

test('lack of a required own garment holds the decision instead of inserting another shopping product', () => {
  const result = compareCandidate(candidateTestState(candidateTestBasics().slice(0, 2)), candidateTestJacket(), { absence: 'absent' });
  assert.equal(result.newFormulaCount, 0);
  assert.deepEqual(result.looks, []);
  assert.equal(result.decision.kind, 'hold');
  assert.match(result.decision.reasons.join(' '), /찾지 못했어요/);
});

test('provisional receipt and return keep original garment/photo records without counting them as currently owned', () => {
  const garments = candidateTestBasics();
  for (const stage of ['received', 'returned']) {
    const state = { ...candidateTestState(garments), journeys: [{ stage, garmentId: 'my-shirt-white' }] };
    const before = structuredClone(state);
    const result = compareCandidate(state, candidateTestJacket(), { absence: 'absent' });
    assert.equal(result.actualGarmentIds.includes('my-shirt-white'), false, stage);
    assert.equal(result.newFormulaCount, 0, stage);
    assert.equal(result.decision.kind, 'hold');
    assert.deepEqual(state, before);
    assert.equal(state.garments[0].photoId, 'original-shirt-photo');
  }
  const kept = { ...candidateTestState(garments), journeys: [{ stage: 'kept', garmentId: 'my-shirt-white' }] };
  assert.equal(compareCandidate(kept, candidateTestJacket(), { absence: 'absent' }).newFormulaCount, 1);
});

test('active kept ownership wins a shared provisional link and replacement removes the old garment only after confirmation', () => {
  const state = {
    ...candidateTestState(candidateTestBasics()),
    journeys: [{ stage: 'returned', garmentId: 'my-shirt-white' }, { stage: 'kept', garmentId: 'my-shirt-white' }],
  };
  assert.equal(compareCandidate(state, candidateTestJacket(), { absence: 'absent' }).newFormulaCount, 1);
  state.journeys = [{ stage: 'kept', garmentId: 'new-shirt', replacementGarmentId: 'my-shirt-white', replacementConfirmed: false, history: [{ action: 'kept', at: '2026-10-14T01:00:00.000Z' }] }];
  assert.equal(compareCandidate(state, candidateTestJacket(), { absence: 'absent' }).newFormulaCount, 1);
  state.journeys[0].replacementConfirmed = true;
  const replaced = compareCandidate(state, candidateTestJacket(), { absence: 'absent' });
  assert.equal(replaced.actualGarmentIds.includes('my-shirt-white'), false);
  assert.equal(replaced.newFormulaCount, 0);
  assert.equal(state.garments[0].photoId, 'original-shirt-photo');
});

test('manual color confirmation preserves catalog price provenance while a separately edited price is user provided', () => {
  const product = PRODUCTS.find((p) => p.id === 'ms-728000');
  const confirmedColor = { ...candidateFromProduct(product), color: 'white', colorSource: 'user' };
  const catalog = compareCandidate(candidateTestState(), confirmedColor);
  assert.equal(catalog.price.source, 'catalog');
  assert.equal(catalog.price.checkedAt, product.checkedAt);
  const manualPrice = { ...confirmedColor, price: 30000, priceSource: 'user', checkedAt: '2026-10-14' };
  const user = compareCandidate(candidateTestState(), manualPrice);
  assert.deepEqual(user.price, { amount: 30000, source: 'user', checkedAt: '2026-10-14', live: false });
  assert.equal(manualPrice.source, 'catalog');
});

test('returning the new replacement does not resurrect the old garment after explicit replacement confirmation', () => {
  const state = {
    ...candidateTestState(candidateTestBasics()),
    journeys: [{
      stage: 'returned', garmentId: 'new-shirt', replacementGarmentId: 'my-shirt-white', replacementConfirmed: true,
      history: [{ action: 'kept', at: '2026-10-14T01:00:00.000Z' }, { action: 'returned', at: '2026-10-14T02:00:00.000Z' }],
    }],
  };
  const returned = compareCandidate(state, candidateTestJacket(), { absence: 'absent' });
  assert.equal(returned.actualGarmentIds.includes('my-shirt-white'), false);
  assert.equal(returned.newFormulaCount, 0);
  assert.equal(state.garments[0].photoId, 'original-shirt-photo');
  state.journeys[0].replacementConfirmed = false;
  assert.equal(compareCandidate(state, candidateTestJacket(), { absence: 'absent' }).newFormulaCount, 1);
});

test('pending orders and receipts pause another home purchase without supplying an owned outfit or an owned essential', () => {
  for (const stage of ['ordered', 'received']) {
    const pendingGarment = candidateTestItem('g-pending-jacket', 'm-harrington', 'beige', { productId: 'ms-5755268' });
    const basics = candidateTestBasics();
    const state = {
      ...candidateTestState([...basics, ...(stage === 'received' ? [pendingGarment] : [])]),
      journeys: [{ stage, garmentId: stage === 'received' ? pendingGarment.id : null, candidate: candidateTestJacket() }],
    };
    assert.equal(recommendItems(state, { limit: 100 }).some((row) => row.slot.id === 'm-harrington'), false, stage);
    const essential = essentials(state).find((row) => row.slot.id === 'm-harrington');
    assert.equal(essential.owned, false, stage);
    assert.equal(essential.needsCheck, true, stage);
    assert.equal(essential.pending, true, stage);
    assert.equal(closetLooks(state, { limit: 100 }).ready.some((row) => row.look.id === 'm-ivy-campus'), false, stage);
    assert.equal(compareCandidate(state, candidateTestJacket(), { absence: 'absent' }).actualGarmentIds.includes(pendingGarment.id), false);
    const query = search(state, '재킷');
    assert.ok(query.items.length <= 16);
    assert.ok(query.items.some((row) => row.slot.id === 'm-harrington'), 'explicit searches remain available for comparison');
  }
});

test('pending generic kind respects gender and verified color-specific essentials while a kept item is actual ownership', () => {
  const unknownSubtype = { ...candidateTestJacket(), slot: null, classificationConfirmed: false };
  const state = { ...candidateTestState(candidateTestBasics()), journeys: [{ stage: 'ordered', candidate: unknownSubtype }] };
  assert.equal(recommendItems(state, { limit: 100 }).some((row) => row.slot.shape === 'jacket'), false);
  const otherGender = { ...candidateTestJacket(), gender: 'f' };
  const baseline = recommendItems(candidateTestState(candidateTestBasics()), { limit: 100 }).map((row) => row.slot.id);
  assert.deepEqual(recommendItems({ ...state, journeys: [{ stage: 'ordered', candidate: otherGender }] }, { limit: 100 }).map((row) => row.slot.id), baseline);
  const shoe = { ...candidateTestJacket(), slot: null, kind: 'sneaker', classificationConfirmed: false };
  const essentialFor = (candidate) => essentials({ ...state, styles: ['minimal'], journeys: [{ stage: 'ordered', candidate }] }).find((row) => row.slot.id === 'm-white-sneaker');
  assert.equal(essentialFor({ ...shoe, color: 'red', colorSource: 'user' }).pending, false);
  assert.equal(essentialFor({ ...shoe, color: 'white', colorSource: 'image' }).pending, false);
  assert.equal(essentialFor({ ...shoe, color: 'white', colorSource: 'user' }).pending, true);
  const keptJacket = candidateTestItem('g-kept-jacket', 'm-harrington', 'beige');
  const kept = { ...candidateTestState([...candidateTestBasics(), keptJacket]), journeys: [{ stage: 'kept', garmentId: keptJacket.id, candidate: candidateTestJacket() }] };
  const keptEssential = essentials(kept).find((row) => row.slot.id === 'm-harrington');
  assert.equal(keptEssential.owned, true);
  assert.equal(keptEssential.pending, false);
});

test('an unlinked similar-owned answer stays local to its candidate instead of excluding other home purchases', () => {
  const garments = candidateTestBasics();
  const state = {
    ...candidateTestState(garments),
    journeys: [{ stage: 'candidate', absence: 'present', candidate: candidateTestJacket() }],
  };
  const before = structuredClone(state);
  const homeState = { ...state, styles: ['amekaji'] };
  assert.ok(recommendItems({ ...homeState, journeys: [] }, { limit: 100 }).some((row) => row.slot.shape === 'jacket'), 'fixture must contain a jacket purchase suggestion');
  assert.deepEqual(recommendItems(homeState, { limit: 100 }), recommendItems({ ...homeState, journeys: [] }, { limit: 100 }));
  const essential = essentials(state).find((row) => row.slot.id === 'm-harrington');
  assert.equal(essential.owned, false);
  assert.equal(essential.pending, false);
  assert.equal(essential.ownershipCheck, false);
  assert.equal(essential.needsCheck, false);
  assert.equal(closetLooks(state, { limit: 100 }).ready.some((row) => row.look.id === 'm-ivy-campus'), false);
  const comparison = compareCandidate(state, candidateTestJacket(), { absence: 'present' });
  assert.deepEqual(comparison.actualGarmentIds, garments.map((garment) => garment.id));
  assert.equal(comparison.exactOwned.length, 0);
  assert.equal(comparison.decision.kind, 'hold');
  assert.equal(compareCandidate(state, candidateTestJacket({ color: 'navy' }), { absence: 'absent' }).decision.kind, 'consider', 'the local answer does not transfer to another candidate');
  assert.deepEqual(state, before);
  state.journeys[0].absence = 'unknown';
  assert.equal(essentials(state).find((row) => row.slot.id === 'm-harrington').ownershipCheck, false);
  assert.deepEqual(recommendItems({ ...state, styles: ['amekaji'] }, { limit: 100 }).map((row) => row.slot.id),
    recommendItems({ ...candidateTestState(garments), styles: ['amekaji'] }, { limit: 100 }).map((row) => row.slot.id));
});

test('linked similar-owned knowledge keeps gender and color-specific evidence boundaries and yields to registered ownership', () => {
  const shoe = { ...candidateTestJacket(), slot: null, kind: 'sneaker', classificationConfirmed: false };
  const actualShoe = candidateTestItem('my-unclassified-shoe', null, null, { kind: 'sneaker' });
  const state = { ...candidateTestState([...candidateTestBasics(), actualShoe]), styles: ['minimal'] };
  const essentialFor = (candidate) => essentials({ ...state, journeys: [{ stage: 'candidate', absence: 'present', candidate, relatedGarmentIds: [actualShoe.id] }] }).find((row) => row.slot.id === 'm-white-sneaker');
  assert.equal(essentialFor({ ...shoe, color: 'red', colorSource: 'user' }).ownershipCheck, false);
  assert.equal(essentialFor({ ...shoe, color: 'white', colorSource: 'image' }).ownershipCheck, false);
  const white = essentialFor({ ...shoe, color: 'white', colorSource: 'user' });
  assert.equal(white.ownershipCheck, true);
  assert.equal(white.owned, false);
  const otherGender = { ...candidateTestJacket(), gender: 'f' };
  const baseline = recommendItems(candidateTestState(candidateTestBasics()), { limit: 100 }).map((row) => row.slot.id);
  assert.deepEqual(recommendItems({ ...candidateTestState(candidateTestBasics()), journeys: [{ stage: 'candidate', absence: 'present', candidate: otherGender }] }, { limit: 100 }).map((row) => row.slot.id), baseline);
  const own = candidateTestItem('g-real-jacket', 'm-harrington', 'beige');
  const actual = essentials({ ...candidateTestState([...candidateTestBasics(), own]), journeys: [{ stage: 'candidate', absence: 'present', candidate: candidateTestJacket() }] }).find((row) => row.slot.id === 'm-harrington');
  assert.equal(actual.owned, true);
  assert.equal(actual.ownershipCheck, false);
});

test('automatic outfit purchases respect pending orders and receipts without dropping a required role', () => {
  for (const stage of ['ordered', 'received']) {
    const basics = candidateTestBasics();
    const pending = candidateTestItem('g_pending', 'm-harrington', 'beige', { productId: 'ms-5755268' });
    const state = {
      ...candidateTestState([...basics, ...(stage === 'received' ? [pending] : [])]),
      journeys: [candidateTestJourney(stage, { garmentId: stage === 'received' ? pending.id : null })],
    };
    const before = structuredClone(state);
    const automatic = [...recommendLooks(state, { limit: 100 }), ...closetLooks(state, { limit: 100 }).almost];
    assert.ok(automatic.length, 'unrelated formulas remain available');
    assert.equal(automatic.some((row) => row.items.some((item) => !item.owned && item.slot.id === 'm-harrington')), false, stage);
    assert.equal(automatic.some((row) => row.look.id === 'm-ivy-campus'), false, 'a required jacket is not silently skipped');
    assert.equal(closetLooks(state, { limit: 100 }).ready.some((row) => row.look.id === 'm-ivy-campus'), false);
    const pinned = SAFE_PRODUCTS.find((product) => product.slot === 'm-harrington');
    assert.ok(recommendLooks(state, { limit: 100, pinnedProduct: pinned })
      .some((row) => row.items.some((item) => item.product?.id === pinned.id)), 'a deliberately selected candidate remains comparable');
    const namedQuery = search(state, '옥스퍼드 셔츠에 어울리는 블루종');
    assert.ok(namedQuery.items.some((row) => row.slot.id === 'm-harrington'));
    assert.ok(namedQuery.outfit?.items.some((item) => item.slot.id === 'm-harrington' && !item.owned), 'a named search can compare the requested type');
    const looseQuery = search(state, '옥스퍼드 셔츠에 어울리는 옷');
    assert.equal(looseQuery.outfit?.items.some((item) => item.slot.id === 'm-harrington' && !item.owned) || false, false);
    assert.deepEqual(state, before, 'original IDs, photos and purchase records remain unchanged');
  }
});

test('generic pending kinds suppress automatic outfit purchases but allow explicitly requested candidates', () => {
  const basics = candidateTestBasics();
  const base = { ...candidateTestState(basics), styles: ['amekaji', 'classic'] };
  assert.ok(recommendLooks(base, { limit: 100 }).some((row) => row.items.some((item) => !item.owned && item.slot.shape === 'jacket')));
  for (const journey of ['ordered', 'received'].map((stage) => candidateTestJourney(stage, { candidate: candidateTestJacket({ slot: null, classificationConfirmed: false }) }))) {
    const state = { ...base, journeys: [journey] };
    const automatic = [...recommendLooks(state, { limit: 100 }), ...closetLooks(state, { limit: 100 }).almost];
    assert.equal(automatic.some((row) => row.items.some((item) => !item.owned && item.slot.shape === 'jacket')), false);
    assert.equal(closetLooks(state, { limit: 100 }).ready.some((row) => row.look.id === 'm-ivy-campus'), false);
    assert.ok(search(state, '재킷').items.some((row) => row.slot.shape === 'jacket'));
    assert.deepEqual(compareCandidate(state, candidateTestJacket(), { absence: 'absent' }).actualGarmentIds, basics.map((item) => item.id));
  }
});

test('unlinked or missing ownership references do not suppress automatic outfit purchases', () => {
  const basics = candidateTestBasics();
  const base = { ...candidateTestState(basics), styles: ['amekaji', 'classic'] };
  const automaticFor = (state) => [...recommendLooks(state, { limit: 100 }), ...closetLooks(state, { limit: 100 }).almost];
  const baseline = automaticFor(base);
  assert.ok(baseline.some((row) => row.items.some((item) => !item.owned && item.slot.shape === 'jacket')));
  for (const links of [
    {},
    { relatedGarmentIds: ['missing-owned-jacket'] },
    { replacementGarmentId: 'missing-owned-jacket' },
  ]) {
    const state = { ...base, journeys: [candidateTestJourney('candidate', { absence: 'present', ...links })] };
    const before = structuredClone(state);
    assert.deepEqual(automaticFor(state), baseline);
    assert.ok(search(state, '재킷').items.some((row) => row.slot.shape === 'jacket'));
    assert.equal(compareCandidate(state, candidateTestJacket(), { absence: 'present' }).decision.kind, 'hold');
    assert.deepEqual(state, before, 'the answer and original reference are retained');
  }
});

test('demo links cannot turn an unregistered answer into global ownership evidence', () => {
  const sample = candidateTestItem('demo_unclassified-jacket', null, null, { kind: 'jacket', source: 'demo' });
  const base = { ...candidateTestState([...candidateTestBasics(), sample]), demo: true, styles: ['amekaji', 'classic'] };
  const state = { ...base, journeys: [candidateTestJourney('candidate', { absence: 'present', relatedGarmentIds: [sample.id] })] };
  assert.equal(essentials({ ...state, styles: ['classic'] }).find((row) => row.slot.id === 'm-harrington').ownershipCheck, false);
  assert.deepEqual(recommendItems(state, { limit: 100 }), recommendItems(base, { limit: 100 }));
  assert.deepEqual(recommendLooks(state, { limit: 100 }), recommendLooks(base, { limit: 100 }));
});

test('a kept jacket supplies actual owned roles and a returned jacket does not remain pending', () => {
  const jacket = candidateTestItem('g_kept', 'm-harrington', 'beige', { productId: 'ms-5755268' });
  const state = {
    ...candidateTestState([...candidateTestBasics(), jacket]),
    journeys: [candidateTestJourney('kept', { garmentId: jacket.id })],
  };
  const ready = closetLooks(state, { limit: 100 }).ready.find((row) => row.look.id === 'm-ivy-campus');
  assert.ok(ready?.items.some((item) => item.owned && item.item.id === jacket.id));
  assert.equal(essentials(state).find((row) => row.slot.id === 'm-harrington').owned, true);
  const returned = { ...state, journeys: [candidateTestJourney('returned', { garmentId: jacket.id })] };
  assert.equal(essentials(returned).find((row) => row.slot.id === 'm-harrington').pending, false);
  assert.ok(closetLooks(returned, { limit: 100 }).almost.some((row) => row.look.id === 'm-ivy-campus'));
  assert.deepEqual(compareCandidate(returned, candidateTestJacket(), { absence: 'absent' }).actualGarmentIds, candidateTestBasics().map((item) => item.id));
});

test('linked ownership knowledge expires when every linked garment is retired or returned', () => {
  const basics = candidateTestBasics();
  const older = candidateTestItem('g_old', 'm-harrington', 'navy', { photoId: 'old-original-photo' });
  const newer = candidateTestItem('g_new', 'm-harrington', 'beige');
  const journey = candidateTestJourney('returned', {
    absence: 'present', intent: 'replace', garmentId: newer.id,
    relatedGarmentIds: [older.id], replacementGarmentId: older.id, replacementConfirmed: true,
  });
  const state = { ...candidateTestState([...basics, older, newer]), journeys: [journey] };
  const before = structuredClone(state);
  const essential = essentials(state).find((row) => row.slot.id === 'm-harrington');
  assert.equal(essential.owned, false);
  assert.equal(essential.ownershipCheck, false);
  assert.ok(closetLooks(state, { limit: 100 }).almost.some((row) => row.look.id === 'm-ivy-campus'));
  assert.deepEqual(compareCandidate(state, candidateTestJacket(), { absence: 'absent' }).actualGarmentIds, basics.map((item) => item.id));
  assert.deepEqual(state, before, 'expiration changes the view without deleting original records or photos');
  const corrected = { ...state, journeys: [{ ...journey, replacementConfirmed: false }] };
  assert.equal(essentials(corrected).find((row) => row.slot.id === 'm-harrington').owned, true);
});

test('an active related garment retains ownership knowledge when another linked garment is retired', () => {
  const older = candidateTestItem('g_old', 'm-harrington', 'navy');
  const other = candidateTestItem('g_other', 'm-trucker', 'indigo', { photoId: 'other-original-photo' });
  const newer = candidateTestItem('g_new', 'm-harrington', 'beige');
  const journey = candidateTestJourney('returned', {
    absence: 'present', intent: 'replace', garmentId: newer.id,
    relatedGarmentIds: [older.id, other.id], replacementGarmentId: older.id, replacementConfirmed: true,
  });
  const state = { ...candidateTestState([...candidateTestBasics(), older, newer, other]), journeys: [journey] };
  const essential = essentials(state).find((row) => row.slot.id === 'm-harrington');
  assert.equal(essential.owned, false);
  assert.equal(essential.ownershipCheck, true);
  assert.equal(closetLooks(state, { limit: 100 }).almost.some((row) => row.look.id === 'm-ivy-campus'), false);
  assert.equal(state.garments.find((item) => item.id === other.id).photoId, 'other-original-photo');
  const removed = { ...state, garments: state.garments.filter((item) => item.id !== other.id), closet: state.closet.filter((item) => item.id !== other.id) };
  assert.equal(essentials(removed).find((row) => row.slot.id === 'm-harrington').ownershipCheck, false);
});

test('a registered same subtype remains ownership evidence across colors and contradicts a reported absence', () => {
  const blue = { ...candidateTestBasics()[0], color: 'blue', label: '파란 옥스퍼드 셔츠' };
  const state = candidateTestState([blue, ...candidateTestBasics().slice(1)]);
  const whiteCandidate = candidateFromLink('https://www.musinsa.com/products/728000');
  const known = compareCandidate(state, whiteCandidate);
  assert.deepEqual(known.sameTypeOwned.map((item) => item.id), [blue.id]);
  assert.equal(known.similarOwned.length, 0, 'different colors remain distinct');
  assert.equal(known.exactOwned.length, 0, 'same subtype never implies the same product');
  assert.equal(known.missingChecks.some((check) => check.code === 'ownership-unknown'), false);
  const absent = compareCandidate(state, whiteCandidate, { absence: 'absent' });
  assert.ok(absent.missingChecks.some((check) => check.code === 'ownership-conflict' && check.garmentIds.includes(blue.id)));
});

test('a selected blue-to-white Oxford replacement can retain a formula without claiming a new formula or changing original records', () => {
  const blue = { ...candidateTestBasics()[0], color: 'blue', label: '파란 옥스퍼드 셔츠' };
  const jacket = candidateTestItem('my-jacket', 'm-harrington', 'navy', { photoId: 'original-jacket-photo' });
  const state = candidateTestState([blue, ...candidateTestBasics().slice(1), jacket]);
  const before = structuredClone(state);
  const candidate = candidateFromLink('https://www.musinsa.com/products/728000');
  const result = compareCandidate(state, candidate, { intent: 'replace', replacementGarmentId: blue.id });
  assert.equal(result.replacement.target.id, blue.id);
  assert.equal(result.replacement.beforeFormulaCount, 1);
  assert.equal(result.replacement.retainedFormulaCount, 1);
  assert.equal(result.replacement.lostFormulaCount, 0);
  assert.equal(result.replacement.newFormulaCount, 0);
  assert.equal(result.newFormulaCount, 0);
  assert.equal(result.decision.kind, 'consider');
  assert.match(result.decision.reasons.join(' '), /파란 옥스퍼드 셔츠/);
  assert.match(result.decision.reasons.join(' '), /유지/);
  assert.equal(result.missingChecks.some((check) => check.code === 'ownership-unknown'), false);
  assert.equal(result.looks.some((look) => look.items.some((row) => row.item?.id === blue.id)), false, 'only the selected target is removed from hypothetical looks');
  assert.ok(result.looks.some((look) => look.items.some((row) => row.item?.id === jacket.id && row.item.photoId === jacket.photoId)));
  assert.deepEqual(result.actualGarmentIds, state.garments.map((item) => item.id), 'current ownership remains the original actual records');
  assert.deepEqual(state, before);
  const overBudget = compareCandidate({ ...state, budget: 1000 }, candidate, { intent: 'replace', replacementGarmentId: blue.id });
  assert.equal(overBudget.decision.kind, 'hold');
  assert.ok(overBudget.missingChecks.some((check) => check.code === 'budget'));
});

test('replacement requires an explicit active same-kind target with confirmed subtype and color', () => {
  const blue = { ...candidateTestBasics()[0], color: 'blue' };
  const state = candidateTestState([blue, ...candidateTestBasics().slice(1), candidateTestItem('my-jacket', 'm-harrington', 'navy')]);
  const candidate = candidateFromLink('https://www.musinsa.com/products/728000');
  for (const [replacementGarmentId, garments] of [
    [null, state.garments],
    ['missing', state.garments],
    ['my-chino-beige', state.garments],
    [blue.id, state.garments.map((item) => item.id === blue.id ? { ...item, slot: null } : item)],
    [blue.id, state.garments.map((item) => item.id === blue.id ? { ...item, color: null } : item)],
  ]) {
    const result = compareCandidate({ ...state, garments, closet: garments }, candidate, { intent: 'replace', replacementGarmentId });
    assert.equal(result.replacement.target, null);
    assert.equal(result.replacement.retainedFormulaCount, 0);
    assert.equal(result.decision.kind, 'hold');
    assert.ok(result.missingChecks.some((check) => check.code === 'replacement-target'));
  }
  const returned = { ...state, journeys: [candidateTestJourney('returned', { garmentId: blue.id, candidate })] };
  assert.equal(compareCandidate(returned, candidate, { intent: 'replace', replacementGarmentId: blue.id }).replacement.target, null);
  for (const unknown of [{ ...candidate, color: null, colorSource: null }, { ...candidate, classificationConfirmed: false }, { ...candidate, colorSource: 'image' }]) {
    const result = compareCandidate(state, unknown, { intent: 'replace', replacementGarmentId: blue.id });
    assert.equal(result.replacement.target, null);
    assert.equal(result.replacement.retainedFormulaCount, 0);
    assert.equal(result.decision.kind, 'hold');
  }
});

test('replacement reports a lost formula while other actual garments can preserve that formula', () => {
  const target = candidateTestItem('my-chambray', 'm-chambray', 'blue', { photoId: 'chambray-original-photo', label: '데님 셔츠' });
  const garments = [target, candidateTestItem('my-work-pants', 'm-work-pants', 'olive'),
    candidateTestItem('my-boots', 'm-workboots', 'brown'), candidateTestItem('my-chore', 'm-chore', 'navy')];
  const state = { ...candidateTestState(garments), styles: ['classic', 'amekaji'] };
  const candidate = candidateFromLink('https://www.musinsa.com/products/728000');
  const lost = compareCandidate(state, candidate, { intent: 'replace', replacementGarmentId: target.id });
  assert.equal(lost.replacement.beforeFormulaCount, 1);
  assert.equal(lost.replacement.retainedFormulaCount, 0);
  assert.equal(lost.replacement.lostFormulaCount, 1);
  assert.equal(lost.decision.kind, 'hold');
  assert.match(lost.decision.reasons.join(' '), /데님 셔츠/);
  assert.equal(lost.missingChecks.some((check) => check.code === 'ownership-unknown'), false, 'the selected known target already establishes ownership');
  const other = candidateTestItem('other-chambray', 'm-chambray', 'white', { photoId: 'other-shirt-original-photo' });
  const preserved = compareCandidate({ ...state, garments: [...garments, other], closet: [...garments, other] }, candidate, { intent: 'replace', replacementGarmentId: target.id });
  assert.equal(preserved.replacement.retainedFormulaCount, 1);
  assert.equal(preserved.replacement.lostFormulaCount, 0, 'a surviving actual garment keeps the formula available');
  assert.equal(target.photoId, 'chambray-original-photo');
  assert.equal(other.photoId, 'other-shirt-original-photo');
});
