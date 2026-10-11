import test from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/model.js';
import { getPreparedAIOutfits } from '../src/ai-samples.js';
import { buildAIRequest, buildAIHandoffPrompt, buildAISnapshotKey, importAIRecommendation,
  validateAIRequest, AI_OUTPUT_SCHEMA } from '../src/ai.js';

const responseFor = (state, anchorId) => ({
  outfits: getPreparedAIOutfits(state, { anchorId }).slice(0, 1)
    .map(({ title, items, reasons }) => ({ title, items, reasons })), gaps: [],
});

test('six prepared AI examples use the real sample IDs and explain proportions and layering', () => {
  const state = createState('demo');
  const outfits = getPreparedAIOutfits(state);
  assert.equal(outfits.length, 6);
  assert.equal(new Set(outfits.map(outfit => outfit.id)).size, 6);
  for (const outfit of outfits) {
    assert.equal(outfit.source, 'prepared-ai-sample');
    assert.match(outfit.sourceLabel, /미리 준비한 AI 추천/);
    const items = outfit.items.map(id => state.items.find(item => item.id === id));
    assert.ok(items.every(item => item?.confirmed && item.available));
    assert.ok(items.some(item => item.category === 'top'));
    assert.ok(items.some(item => item.category === 'bottom'));
    assert.equal(outfit.reasons.length, 3);
    assert.ok(outfit.feedbackPrompt.length > 10);
    assert.match(outfit.limitations.join(' '), /실측과 체형은 확인하지 않았/);
  }
  assert.ok(outfits.some(outfit => outfit.items.filter(id => state.items.find(item => item.id === id).category === 'top').length === 2));
});

test('prepared samples never enter a personal wardrobe even if it contains copied demo IDs', () => {
  const personal = createState('personal');
  assert.deepEqual(getPreparedAIOutfits(personal), []);
  personal.items = createState('demo').items;
  assert.deepEqual(getPreparedAIOutfits(personal), []);
  personal.items.forEach(item => { item.source = 'manual'; });
  assert.deepEqual(getPreparedAIOutfits(personal), []);
});

test('missing, unconfirmed, excluded or materially edited sample clothes invalidate affected examples', () => {
  for (const change of [item => { item.confirmed = false; }, item => { item.available = false; },
    item => { item.source = 'manual'; }, item => { item.kind = 'hoodie'; },
    item => { item.color = 'pink'; }, item => { item.category = 'outer'; }]) {
    const state = createState('demo');
    change(state.items.find(item => item.id === 'demo-shirt-blue'));
    const outfits = getPreparedAIOutfits(state);
    assert.ok(outfits.length > 0 && outfits.length < 6);
    assert.ok(outfits.every(outfit => !outfit.items.includes('demo-shirt-blue')));
  }
  const state = createState('demo');
  state.items = state.items.filter(item => item.id !== 'demo-shirt-blue');
  assert.ok(getPreparedAIOutfits(state).every(outfit => !outfit.items.includes('demo-shirt-blue')));
});

test('prepared selection respects an anchor and returns independent copies', () => {
  const state = createState('demo');
  const outfits = getPreparedAIOutfits(state, { anchorId: 'demo-field-olive' });
  assert.equal(outfits.length, 1);
  assert.ok(outfits.every(outfit => outfit.items.includes('demo-field-olive')));
  outfits[0].items.push('mutated');
  outfits[0].reasons[0] = 'mutated';
  assert.ok(!getPreparedAIOutfits(state)[2].items.includes('mutated'));
  assert.notEqual(getPreparedAIOutfits(state)[2].reasons[0], 'mutated');
  assert.deepEqual(getPreparedAIOutfits(state, { anchorId: 'missing' }), []);
});

test('manual AI handoff projects confirmed metadata without photos, links or personal records', () => {
  const state = createState('demo');
  state.items[0].image = 'PRIVATE-PHOTO';
  state.items[0].sourceImage = 'PRIVATE-ORIGINAL';
  state.items[0].productURL = 'https://private.example/item';
  state.items[0].brand = '직접 입력한 브랜드';
  state.items[0].productName = '직접 입력한 상품명';
  state.items[0].styleCode = 'USER-123';
  state.items[1].confirmed = false;
  state.items[2].available = false;
  state.profile.facePhoto = 'PRIVATE-FACE';
  state.decisions = [{ note: 'PRIVATE-DECISION' }];
  state.drafts = [{ name: 'PRIVATE-DRAFT' }];
  const prompt = buildAIHandoffPrompt(state, { intent: '산책과 저녁 약속', anchorId: state.items[0].id });
  for (const value of ['PRIVATE-', 'private.example']) assert.ok(!prompt.includes(value));
  assert.match(prompt, /직접 입력한 브랜드/);
  assert.match(prompt, /산책과 저녁 약속/);
  const payload = buildAIRequest(state);
  assert.ok(!payload.items.some(item => item.id === state.items[1].id || item.id === state.items[2].id));
  state.mode = 'personal';
  assert.equal(buildAIRequest(state).items.length, 0);
});

test('a manually returned JSON response retains only validated owned combinations', () => {
  const state = createState('demo');
  const raw = responseFor(state);
  const result = importAIRecommendation('```json\n' + JSON.stringify(raw) + '\n```', state);
  assert.equal(result.provider, 'manual-ai');
  assert.equal(result.model, '사용자가 연결한 AI');
  assert.deepEqual(result.outfits[0].items, raw.outfits[0].items);
  assert.match(result.outfits[0].id, /^ai-/);
  assert.match(result.limitations.join(' '), /검색하지 않았/);
  assert.ok(!('products' in result));
});

test('manual AI import rejects invented IDs, duplicate clothes and stale availability', () => {
  const state = createState('demo');
  let raw = responseFor(state);
  raw.outfits[0].items.push('invented-product');
  assert.throws(() => importAIRecommendation(raw, state), { code: 'UNKNOWN_ITEM' });
  raw = responseFor(state);
  raw.outfits[0].items.push(raw.outfits[0].items[0]);
  assert.throws(() => importAIRecommendation(raw, state), { code: 'UNKNOWN_ITEM' });
  raw = responseFor(state);
  state.items.find(item => item.id === raw.outfits[0].items[0]).available = false;
  assert.throws(() => importAIRecommendation(raw, state), { code: 'UNKNOWN_ITEM' });
});

test('manual AI import enforces complete combinations and the chosen anchor', () => {
  const state = createState('demo');
  const raw = responseFor(state);
  assert.throws(() => importAIRecommendation(raw, state, { anchorId: 'demo-field-olive' }), { code: 'INVALID_COMBINATION' });
  raw.outfits[0].items = ['demo-shirt-blue', 'demo-loafer-brown'];
  assert.throws(() => importAIRecommendation(raw, state), { code: 'INVALID_COMBINATION' });
  const duplicate = responseFor(state);
  duplicate.outfits.push(structuredClone(duplicate.outfits[0]));
  assert.throws(() => importAIRecommendation(duplicate, state), { code: 'INVALID_COMBINATION' });
});

test('manual AI exchange rejects commerce claims, extra fields and malformed responses', () => {
  const state = createState('demo');
  for (const reason of ['평점 4.9인 제품', '지금 39,000원', 'https://store.example/item', '재고가 있어요']) {
    const raw = responseFor(state);
    raw.outfits[0].reasons = [reason];
    assert.throws(() => importAIRecommendation(raw, state), { code: 'UNSUPPORTED_CLAIM' });
  }
  assert.throws(() => importAIRecommendation({ ...responseFor(state), products: [] }, state));
  assert.throws(() => importAIRecommendation('답변입니다: {}', state), { code: 'INVALID_RESPONSE' });
  assert.throws(() => importAIRecommendation('가'.repeat(12000), state), { code: 'INVALID_RESPONSE' });
  assert.throws(() => importAIRecommendation({ outfits: [], gaps: [] }, state), { code: 'INVALID_RESPONSE' });
  const result = importAIRecommendation({ outfits: [], gaps: [{ category: 'bottom', reason: '이미 가진 하의의 종류를 더 알려 주세요.' }] }, createState('personal'));
  assert.equal(result.outfits.length, 0);
  assert.equal(result.gaps[0].category, 'bottom');
});

const purchaseFor = (state, overrides = {}) => ({
  productId: state.products[0].id,
  itemIds: [state.items.find(item => item.category === 'top').id],
  reasons: ['보유한 셔츠와 함께 입어 지금 옷장의 활용 범위를 넓힐 수 있어요.'],
  decision: 'buy', ...overrides,
});
const purchasesOnly = purchases => ({ outfits: [], gaps: [], purchases });

test('purchase handoff contains only recorded candidate metadata and keeps personal demo data out', () => {
  const state = createState('demo');
  Object.assign(state.products[0], { source: 'manual', checkedAt: '2026-10-11',
    url: 'https://PRIVATE.example/product', image: 'PRIVATE-IMAGE', note: 'PRIVATE-NOTE',
    reviews: [{ text: 'PRIVATE-REVIEW', url: 'https://PRIVATE.example/review', kind: 'manual' }] });
  const payload = buildAIRequest(state);
  assert.deepEqual(Object.keys(payload.candidates[0]), ['id', 'name', 'category', 'kind', 'color', 'brand', 'price', 'checkedAt']);
  assert.equal(payload.candidates[0].price, state.products[0].price);
  assert.equal(payload.candidates[0].checkedAt, '2026-10-11');
  const prompt = buildAIHandoffPrompt(state);
  assert.ok(!prompt.includes('PRIVATE'));
  assert.match(prompt, /"purchases"/);
  assert.match(prompt, /사용자가 적은 기록/);
  assert.match(prompt, /후기와 링크는 제공되지 않았/);
  state.mode = 'personal';
  assert.deepEqual(buildAIRequest(state).candidates.map(candidate => candidate.id), [state.products[0].id]);
  assert.deepEqual(AI_OUTPUT_SCHEMA.required, ['outfits', 'gaps']);
});

test('legacy outfit JSON imports with an empty purchase list; new purchase-only JSON retains grounded decisions', () => {
  const state = createState('demo');
  assert.deepEqual(importAIRecommendation(responseFor(state), state).purchases, []);
  const purchase = purchaseFor(state);
  const result = importAIRecommendation(purchasesOnly([purchase]), state);
  assert.deepEqual(result.purchases, [purchase]);
  assert.equal(result.provider, 'manual-ai');
  assert.deepEqual(result.outfits, []);
  assert.ok(!('price' in result.purchases[0]));
  purchase.itemIds.push('mutated');
  purchase.reasons[0] = 'mutated';
  assert.equal(result.purchases[0].itemIds.length, 1);
  assert.notEqual(result.purchases[0].reasons[0], 'mutated');
});

test('purchase import rejects invented or duplicate products and references to unavailable owned clothes', () => {
  const state = createState('demo');
  for (const productId of ['invented-product', state.items[0].id, null, {}])
    assert.throws(() => importAIRecommendation(purchasesOnly([purchaseFor(state, { productId })]), state), { code: 'UNKNOWN_PRODUCT' });
  assert.throws(() => importAIRecommendation(purchasesOnly([purchaseFor(state), purchaseFor(state)]), state), { code: 'UNKNOWN_PRODUCT' });
  for (const itemIds of [['invented-item'], [state.products[0].id], [state.items[0].id, state.items[0].id], [null]])
    assert.throws(() => importAIRecommendation(purchasesOnly([purchaseFor(state, { itemIds })]), state), { code: 'UNKNOWN_ITEM' });
  const raw = purchasesOnly([purchaseFor(state)]);
  state.items.find(item => item.id === raw.purchases[0].itemIds[0]).available = false;
  assert.throws(() => importAIRecommendation(raw, state), { code: 'UNKNOWN_ITEM' });
  state.items.forEach(item => { item.available = true; });
  state.products = state.products.slice(1);
  assert.throws(() => importAIRecommendation(raw, state), { code: 'UNKNOWN_PRODUCT' });
});

test('buy requires a known wardrobe connection while hold/skip can explain insufficient wardrobe information', () => {
  const state = createState('demo');
  for (const decision of ['purchase', 'BUY', '', null, 1])
    assert.throws(() => importAIRecommendation(purchasesOnly([purchaseFor(state, { decision })]), state), { code: 'INVALID_DECISION' });
  assert.throws(() => importAIRecommendation(purchasesOnly([purchaseFor(state, { itemIds: [] })]), state), { code: 'INVALID_DECISION' });
  const noItems = { ...state, items: [] };
  for (const decision of ['hold', 'skip']) {
    const purchase = purchaseFor(state, { decision, itemIds: [], reasons: ['보유한 옷 정보를 더 확인한 뒤 판단해 주세요.'] });
    assert.equal(importAIRecommendation(purchasesOnly([purchase]), noItems).purchases[0].decision, decision);
  }
});

test('purchase output rejects extra commerce fields, fabricated claims and oversized or malformed lists', () => {
  const state = createState('demo');
  for (const field of ['price', 'url', 'name', 'brand', 'reviews', 'image'])
    assert.throws(() => importAIRecommendation(purchasesOnly([{ ...purchaseFor(state), [field]: 'fabricated' }]), state));
  for (const reason of ['좋은 후기', '99만원에 살 수 있어요', 'USD 75', '가격은 80000', '평점 4.7', 'https://invented.example/buy'])
    assert.throws(() => importAIRecommendation(purchasesOnly([purchaseFor(state, { reasons: [reason] })]), state), { code: 'UNSUPPORTED_CLAIM' });
  for (const reasons of [[], [''], ['x'.repeat(701)], Array(5).fill('이유')])
    assert.throws(() => importAIRecommendation(purchasesOnly([purchaseFor(state, { reasons })]), state));
  for (const purchases of [null, {}, Array(21).fill(purchaseFor(state))])
    assert.throws(() => importAIRecommendation(purchasesOnly(purchases), state), { code: 'INVALID_RESPONSE' });
});

test('candidate request validates duplicate IDs, malformed values, unknown fields and limits', () => {
  const state = createState('demo');
  const request = buildAIRequest(state);
  const legacy = structuredClone(request);
  delete legacy.candidates;
  assert.deepEqual(validateAIRequest(legacy).candidates, []);
  const candidate = request.candidates[0];
  for (const candidates of [null, {}, [candidate, candidate], Array(51).fill(candidate)])
    assert.throws(() => validateAIRequest({ ...request, candidates }), { code: 'INVALID_INPUT' });
  for (const price of [-1, Infinity, NaN, 100000001, '100'])
    assert.throws(() => validateAIRequest({ ...request, candidates: [{ ...candidate, price }] }), { code: 'INVALID_INPUT' });
  for (const patch of [{ id: '' }, { category: 'anything' }, { checkedAt: 3 }, { url: 'https://example.com' }, { reviews: [] }])
    assert.throws(() => validateAIRequest({ ...request, candidates: [{ ...candidate, ...patch }] }), { code: 'INVALID_INPUT' });
});

test('snapshot context invalidates substantive wardrobe, profile, candidate and request changes', () => {
  const original = createState('demo');
  const key = buildAISnapshotKey(original);
  for (const change of [
    state => { state.items[0].name += ' 수정'; },
    state => { state.items[0].available = false; },
    state => { state.profile.budget += 1; },
    state => { state.profile.fit = 'relaxed'; },
    state => { state.products[0].price += 1; },
    state => { state.products[0].name += ' 수정'; },
    state => { state.products[0].checkedAt = '2026-10-12'; },
    state => { state.products[0].color = 'black'; },
    state => { state.products.pop(); },
  ]) {
    const changed = structuredClone(original);
    change(changed);
    assert.notEqual(buildAISnapshotKey(changed), key);
  }
  assert.notEqual(buildAISnapshotKey(original, { intent: '출근' }), key);
  assert.notEqual(buildAISnapshotKey(original, { anchorId: original.items[0].id }), key);
});

test('snapshot keys ignore ordering and excluded photos, links, reviews, personal notes and records', () => {
  const state = createState('demo');
  const key = buildAISnapshotKey(state);
  state.items.reverse(); state.products.reverse();
  Object.assign(state.items[0], { image: 'PRIVATE-IMAGE', note: 'PRIVATE-NOTE', productURL: 'https://private.example' });
  Object.assign(state.products[0], { url: 'https://private.example', reviews: [{ text: 'PRIVATE-REVIEW' }] });
  state.decisions.push({ note: 'PRIVATE-RECORD' });
  assert.equal(buildAISnapshotKey(state), key);
  assert.ok(!key.includes('PRIVATE'));
});
