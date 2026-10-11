import test from 'node:test';
import assert from 'node:assert/strict';
import * as Model from '../src/model.js';
import * as AI from '../src/ai.js';
const copy = value => JSON.parse(JSON.stringify(value));
function fixture() {
  const state = Model.createState('demo');
  const options = { intent: '출근 옷과 후보를 검토해 주세요', anchorId: 'demo-shirt-blue' };
  const response = AI.importAIRecommendation(JSON.stringify({
    outfits: [{ title: '단정한 출근', items: ['demo-shirt-blue', 'demo-chino-beige'], reasons: ['셔츠와 치노의 단정한 선을 연결해요.'] }],
    gaps: [], purchases: [{ productId: state.products[0].id, itemIds: ['demo-shirt-blue'], decision: 'hold', reasons: ['가지고 있는 셔츠와 역할이 겹치는지 먼저 확인해요.'] }],
  }), state, options);
  state.aiRecommendation = Model.createAIRecommendationCache(state, response, options);
  return state;
}
test('AI cache preserves validated outfits, purchase decisions and request binding across both backups', () => {
  const state = fixture();
  for (const includeImages of [true, false]) {
    const loaded = Model.parseBackup(Model.serializeBackup(state, { includeImages }));
    assert.deepEqual(loaded.aiRecommendation, state.aiRecommendation);
    assert.equal(Model.getAIRecommendationStatus(loaded).status, 'current');
    assert.equal(Model.getAIRecommendationStatus(loaded).result.purchases[0].decision, 'hold');
  }
});
test('AI cache hides stale wardrobe, profile, candidate, intent and anchor contexts without blocking a saved change', () => {
  for (const change of [
    state => { state.items[0].available = false; },
    state => { state.profile.occasion = 'weekend'; },
    state => { state.products[0].price += 1; },
    state => { state.products = []; state.savedProducts = []; },
    state => { state.mode = 'personal'; },
  ]) {
    const state = fixture(); change(state);
    const loaded = Model.parseBackup(Model.serializeBackup(state));
    assert.equal(Model.getAIRecommendationStatus(loaded).status, 'stale');
    assert.equal(Model.getAIRecommendationStatus(loaded).result, null);
  }
  const state = fixture();
  assert.equal(Model.getAIRecommendationStatus(state, { intent: '다른 상황', anchorId: 'demo-shirt-blue' }).status, 'stale');
  assert.equal(Model.getAIRecommendationStatus(state, { ...state.aiRecommendation.options, anchorId: null }).status, 'stale');
});
test('records and photo-free backups do not spend or invalidate a reusable AI response', () => {
  const state = fixture();
  state.items[0].note = '개인 메모';
  state.products[0].url = 'https://example.com/private-reference';
  state.savedProducts.push(state.products[0].id);
  state.items.reverse();
  assert.equal(Model.getAIRecommendationStatus(state).status, 'current');
  const snapshot = JSON.stringify(state.aiRecommendation.snapshot);
  assert.ok(!snapshot.includes('개인 메모') && !snapshot.includes('private-reference'));
});
test('backup import rejects forged cached response references, provenance and request binding', () => {
  for (const corrupt of [
    cache => { cache.result.outfits[0].items[0] = 'invented'; },
    cache => { cache.result.purchases[0].productId = 'invented'; },
    cache => { cache.options.intent = 'different'; },
    cache => { cache.result.provider = 'openai'; },
    cache => { cache.result.outfits[0].id = 42; },
    cache => { delete cache.result.purchases; },
    cache => { cache.snapshot.version = 99; },
  ]) {
    const state = copy(fixture()); corrupt(state.aiRecommendation);
    assert.throws(() => Model.parseBackup(JSON.stringify(state)));
  }
});
