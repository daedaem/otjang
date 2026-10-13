const test = require('node:test');
const assert = require('node:assert/strict');
const I = require('../src/photo-intake.js');
const W = require('../src/wardrobe.js');
const P = require('../src/pick.js');
const J = require('../src/judge.js');
const catalog = P.cleanPicks(require('../data/picks.json'));
const day = '2026-10-13';
const pixels = (value) => new Uint8ClampedArray(Array.from({ length: 64 }, () => [value, value, value, 255]).flat());

test('어두운 사진·과도한 밝기·작은 사진은 색 확정을 유도하지 않는다', () => {
  assert.equal(I.quality(pixels(0), 8, 8, 640, 640).canSuggestColor, false);
  assert.equal(I.quality(pixels(255), 8, 8, 640, 640).canSuggestColor, false);
  assert.ok(I.quality(pixels(100), 8, 8, 90, 90).issues.some(x => x.includes('작아')));
  const transparent = pixels(80); for (let i = 3; i < transparent.length; i += 4) transparent[i] = 0;
  assert.equal(I.quality(transparent, 8, 8, 640, 640).canSuggestColor, false);
});

test('한 벌 선택은 역방향 드래그와 사진 바깥 포인터를 처리한다', () => {
  assert.deepEqual(I.rect({ x: 90, y: 80 }, { x: -30, y: 10 }, 100, 100), { x: 0, y: 10, width: 90, height: 70 });
  assert.deepEqual(I.rect({ x: 10, y: 20 }, { x: 120, y: 150 }, 100, 100), { x: 10, y: 20, width: 90, height: 80 });
});

test('분류만 아는 사진도 저장하되 상품·속성·판정 값을 만들어 넣지 않는다', () => {
  const item = W.cleanItem({ id: 'rough-photo', cat: 'top', name: '내 상의', status: 'owned', attrSource: 'owner' });
  assert.equal(item.kind, null); assert.equal(item.family, null); assert.equal(item.formality, null); assert.equal(item.pattern, null);
  assert.equal(item.brand, ''); assert.equal(item.model, ''); assert.equal(item.product, null);
  assert.equal(W.assessment(item).ready, false);
  assert.equal(J.judgeCandidate([item], P.toCandidate(catalog.products[0], catalog, day)).status, 'needs-confirmation');
});

test('같은 상품을 이미 가지고 있으면 다음 한 벌 추천에서 뒤로 간다', () => {
  const query = { today: day, sleeve: 'short' };
  const before = P.recommend([], catalog, query);
  const own = P.toOwned(before.pick.product, catalog, '', day);
  const after = P.recommend([own], catalog, query);
  assert.notEqual(after.pick.product.id, before.pick.product.id);
  const row = after.ranked.find(r => r.product.id === before.pick.product.id);
  assert.equal(row.ownedMatches.length, 1);
  assert.equal(row.closet.assessedCount, 1);
  assert.ok(row.closet.overlaps.some(o => o.id === own.id), '같은 날 산 상품 ID라도 가진 옷을 평가에서 빼지 않는다');
  assert.ok(!after.pick.out);
  const draft = { ...own, attrSource: 'photo-draft' };
  assert.equal(P.recommend([draft], catalog, query).pick.product.id, before.pick.product.id, '사진 초안으로 순위를 바꾸지 않는다');
});

test('브랜드·품명이 없는 비슷한 옷을 동일 상품으로 확정하지 않는다', () => {
  const own = W.cleanItem({ id: 'generic', status: 'owned', cat: 'top', kind: 'tee', family: 'white', light: 95, formality: 1, pattern: 'solid' });
  const result = P.recommend([own], catalog, { today: day, sleeve: 'short' });
  assert.ok(result.ranked.every(r => !r.ownedMatches.length));
  assert.ok(result.ranked.some(r => r.closet.overlaps.length));
});

test('Claude follow와 로컬 followup을 함께 보존한다', () => {
  const d = W.cleanDecision({ id: 'decision', itemId: 'one', before: { lean: 'buy', at: day }, summary: {}, after: { decision: 'buy', helpful: 'yes', at: day, insight: '직접 기록' },
    follow: { at: day, worn: 'few', feel: 'good' }, followup: { at: day, outcome: 'purchased', worn: 'yes', regret: 'no', note: '입어 봄' } });
  assert.equal(d.follow.worn, 'few'); assert.equal(d.followup.outcome, 'purchased');
  assert.equal(d.after.insight, '직접 기록'); assert.equal(d.summary.added, null);
  assert.deepEqual(W.cleanDecision(d), d);
});

test('구매 후 반품 결과도 옷장 기록을 내보내고 다시 읽을 때 보존한다', () => {
  const raw = { id: 'return-decision', itemId: 'candidate-1', before: { lean: 'buy', at: day }, summary: {}, after: { decision: 'buy', helpful: 'yes', at: day },
    followup: { outcome: 'returned', worn: 'yes', regret: 'yes', note: '사이즈가 맞지 않아 반품', at: day } };
  const clean = W.cleanDecision(raw);
  assert.deepEqual(clean.followup, raw.followup);
  assert.deepEqual(W.cleanDecision(JSON.parse(JSON.stringify(clean))), clean);
  assert.equal(W.cleanDecision(Object.assign({}, raw, { followup: { ...raw.followup, outcome: 'refunded' } })).followup, null);
});
