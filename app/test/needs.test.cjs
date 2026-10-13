const test = require('node:test');
const assert = require('node:assert/strict');
const N = require('../src/needs');
const W = require('../src/wardrobe');
const item = (id, cat, kind, extra = {}) => W.cleanItem({ id, name: id, cat, kind, family: 'navy', light: 18, formality: 2, pattern: 'solid', status: 'owned', attrSource: 'owner-confirmed', seasons: ['봄', '여름', '가을', '겨울'], ...extra }, 0);
const base = () => [item('striped-shirt', 'top', 'shirt', { family: 'blue', light: 85, pattern: 'stripe', formality: 3 }), item('graphic-sweat', 'top', 'sweat', { pattern: 'graphic', formality: 1 }), item('dark-denim', 'bottom', 'denim'), item('chino', 'bottom', 'chino', { family: 'beige', light: 70 }), item('derby', 'shoes', 'derby', { family: 'black', light: 10, formality: 3 })];
test('보유 종류별 현황에서 후보와 처분한 옷을 제외하고 미확인 종류를 따로 센다', () => {
  const r = N.analyze([...base(), item('wish', 'outer', 'coat', { status: 'candidate' }), item('gone', 'outer', 'jacket', { status: 'gone' }), item('unknown', 'top', null, { family: null })]);
  assert.equal(r.total, 6); assert.equal(r.inventory.find(x => x.cat === 'outer').count, 0);
  assert.equal(r.inventory.find(x => x.cat === 'top').unknown, 1);
});
test('빈 옷장에 일반 구매 목록을 추천하지 않는다', () => {
  const r = N.analyze([]); assert.equal(r.status, 'empty'); assert.deepEqual(r.recommendations, []); assert.deepEqual(r.ideas, []);
});
test('사진 초안은 추천 점수·조합의 근거가 되지 않고 원본을 바꾸지 않는다', () => {
  const rows = base().map(x => ({ ...x, attrSource: 'photo-draft' })); const before = JSON.stringify(rows);
  const r = N.analyze(rows); assert.equal(r.assessed, 0); assert.equal(r.pending.length, rows.length); assert.deepEqual(r.recommendations, []);
  assert.ok(r.ideas.length); assert.equal(JSON.stringify(rows), before);
});
test('브랜드와 품명이 없어도 직접 확인한 속성으로 추천한다', () => {
  const r = N.analyze(base()); assert.equal(r.status, 'ready'); assert.equal(r.assessed, 5); assert.ok(r.recommendations.length);
});
test('추천은 실제 보유 옷과 비교한 근거와 조합을 제공하며 상품 정보를 만들지 않는다', () => {
  const rows = base(); const r = N.analyze(rows); const ids = new Set(rows.map(x => x.id));
  for (const rec of r.recommendations) {
    assert.ok(rec.reasons.length); assert.equal(rec.candidate.brand, ''); assert.equal(rec.candidate.model, ''); assert.equal(rec.candidate.price, null); assert.equal(rec.candidate.link, '');
    for (const o of rec.outfits) for (const piece of [o.top,o.bottom,o.outer].filter(Boolean)) assert.ok(ids.has(piece.id) || piece.id === rec.candidate.id);
    if (rec.cat !== 'shoes') assert.ok(rec.combinations > 0);
  }
});
test('한 분류만 채우거나 니트 색만 여러 개 추천하지 않는다', () => {
  const r = N.analyze(base()); assert.ok(r.recommendations.length <= 3);
  assert.equal(new Set(r.recommendations.map(x => x.cat + ':' + x.kind)).size, r.recommendations.length);
  assert.ok(new Set(r.recommendations.map(x => x.cat)).size >= 2);
});
test('순서를 바꿔도 추천 결과가 같다', () => {
  assert.deepEqual(N.analyze(base()), N.analyze(base().reverse()));
});
test('미확인 같은 종류가 있으면 없는 것으로 보고 중복 구매를 권하지 않는다', () => {
  const r = N.analyze([...base(), item('pending-knit', 'top', 'knit', { attrSource: 'photo-draft' })]);
  assert.ok(r.held.some(x => x.id === 'light-knit')); assert.ok(!r.recommendations.some(x => x.kind === 'knit'));
  assert.ok(r.recommendations.every(x => x.partners.every(p => p.id !== 'pending-knit')));
});
test('세부 종류 미상인 상의는 상의 추가 제안을 보류하지만 하의·신발까지 막지 않는다', () => {
  const r = N.analyze([...base(), item('unknown-top', 'top', null)]);
  assert.ok(!r.recommendations.some(x => x.cat === 'top')); assert.ok(r.recommendations.some(x => x.cat !== 'top'));
});
test('상품을 보유로 등록하면 해당 필요가 사라진다', () => {
  const r = N.analyze(base()); const pick = r.recommendations.find(x => x.cat === 'top'); assert.ok(pick);
  const after = N.analyze([...base(), { ...pick.candidate, id: 'purchased', status: 'owned', attrSource: 'owner-confirmed' }]);
  assert.ok(!after.recommendations.some(x => x.kind === pick.kind)); assert.ok(after.covered.some(x => x.id === pick.id));
});
test('아직 후보일 때는 보유한 것으로 보지 않는다', () => {
  const r = N.analyze(base()); const pick = r.recommendations[0];
  assert.deepEqual(N.analyze([...base(), pick.candidate]), r);
});
test('여름 선택 시 니트·코트와 겨울 보유 옷이 조합 근거로 들어가지 않는다', () => {
  const r = N.analyze([...base(), item('winter-shirt', 'top', 'shirt', { seasons: ['겨울'] })], { season: '여름' });
  assert.ok(!r.recommendations.some(x => ['knit','coat'].includes(x.kind)));
  assert.ok(r.recommendations.every(x => x.partners.every(p => p.id !== 'winter-shirt'))); assert.equal(r.assessed, 5);
});
test('계절 미확인은 해당 계절 조합에서 제외하고 추가 구매를 성급히 권하지 않는다', () => {
  const r = N.analyze([...base(), item('unknown-season-knit', 'top', 'knit', { seasons: [] })], { season: '겨울' });
  assert.ok(r.pending.some(x => x.missing.includes('seasons'))); assert.ok(!r.recommendations.some(x => x.kind === 'knit'));
});
test('계절에 맞는 옷이 없으면 구매 추천 대신 조건 변경을 기다린다', () => {
  const r = N.analyze(base().map(x => ({ ...x, seasons: ['겨울'] })), { season: '여름' });
  assert.equal(r.assessed, 0); assert.deepEqual(r.recommendations, []); assert.deepEqual(r.ideas, []);
});
test('원피스만 입는 옷장에 상하의를 필수품처럼 권하지 않는다', () => {
  const r = N.analyze([item('dress', 'dress', 'dress', { family: 'ivory', light: 88 })]);
  assert.ok(r.recommendations.length); assert.ok(r.recommendations.every(x => !['top','bottom'].includes(x.cat)));
});
test('단정한 용도에서는 보유 더비를 로퍼의 대안으로 인정하고 캐주얼 스니커즈를 강제하지 않는다', () => {
  const r = N.analyze(base(), { purpose: 'smart' });
  assert.ok(r.covered.some(x => x.id === 'loafer')); assert.ok(!r.recommendations.some(x => x.kind === 'sneaker' || x.kind === 'loafer'));
});
test('신발 추천에서 지원하지 않는 코디 수·핏 점수를 만들지 않는다', () => {
  const r = N.analyze(base().filter(x => x.cat !== 'shoes')).recommendations.find(x => x.cat === 'shoes'); assert.ok(r);
  assert.equal(r.combinations, null); assert.deepEqual(r.outfits, []); assert.ok(r.reasons.some(x => x.includes('계산하지')));
});
test('기본 종류가 충분하면 추가 구매를 억지로 추천하지 않는다', () => {
  const full = [...base(), item('tee', 'top', 'tee', { light: 95, family: 'white' }), item('plain-shirt', 'top', 'shirt'), item('knit', 'top', 'knit'), item('slacks', 'bottom', 'slacks'), item('sneaker', 'shoes', 'sneaker'), item('jacket', 'outer', 'jacket')];
  const r = N.analyze(full); assert.deepEqual(r.recommendations, []); assert.ok(r.covered.length);
});
