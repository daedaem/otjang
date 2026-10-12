// 기준별 추천(Pick)과 검증 카탈로그(data/picks.json)의 시험. 실제 카탈로그 파일을 그대로 읽는다.
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../src/pick.js');
const W = require('../src/wardrobe.js');
const RAW = require('../data/picks.json');
const SAMPLE = W.cleanWardrobe(require('../data/sample-wardrobe.json')).items;
const cat = P.cleanPicks(RAW);
const FAV = ['polo', 'bronson', 'pottery', 'outstanding', 'brooks', 'lvc'];
const rec = (q) => P.recommend(SAMPLE, cat, Object.assign({ line: 'white-tee', today: '2026-10-13' }, q));

test('카탈로그: 모든 상품이 판매처 주소·가격·확인일·근거를 갖고 정리를 통과한다', () => {
  assert.ok(cat, 'picks.json 을 읽지 못함');
  assert.equal(cat.products.length, RAW.products.length, '정리하면서 빠진 상품이 있다');
  for (const p of cat.products) {
    assert.match(p.store.url, /^https:\/\//, p.id);
    assert.ok(p.price > 0 && p.checkedAt, p.id);
    assert.ok(p.evidence.length >= 1 && p.evidence.every((e) => /^https:\/\//.test(e.url) && e.seen), p.id + ' 근거');
    assert.ok(cat.brands[p.brand], p.id + ' 브랜드 등록');
    assert.ok(p.currency === 'KRW' || cat.fx[p.currency], p.id + ' 환율');
    for (const s of p.sizes) assert.ok(s.chest == null || (s.chest > 30 && s.chest < 90), p.id + ' 가슴 너비 범위 ' + s.chest);
  }
  assert.ok(cat.products.every((p) => !('img' in p)), '상품 사진을 넣지 않는다');
});

test('정리: 주소·가격·확인일이 없거나 외화 환율이 없으면 받지 않는다', () => {
  const base = RAW.products[0];
  const bad = [Object.assign({}, base, { id: 'a', store: { url: 'javascript:alert(1)' } }), Object.assign({}, base, { id: 'b', price: null }), Object.assign({}, base, { id: 'c', checkedAt: '어제' }), Object.assign({}, base, { id: 'd', currency: 'JPY' })];
  const c = P.cleanPicks(Object.assign({}, RAW, { products: bad, fx: {} }));
  assert.equal(c.products.length, 0);
  const usd = P.cleanPicks(Object.assign({}, RAW, { products: [Object.assign({}, base, { id: 'e', currency: 'USD', price: 10 })], fx: {} }));
  assert.equal(usd.products.length, 0, '환율이 없는 달러 상품은 뺀다');
  assert.equal(P.cleanPicks({ schema: 2, kind: 'picks', products: [] }), null);
});

test('품질 점수: 공개된 정보만으로 매기고, 모르는 것은 따로 적는다', () => {
  const by = (id) => cat.products.find((p) => p.id === id);
  const bronson = P.qualityOf(by('bronson-loopwheel-white')), airism = P.qualityOf(by('uniqlo-e465193-white')), polo = P.qualityOf(by('polo-480590-white'));
  assert.ok(bronson.score > polo.score && polo.score > airism.score);
  assert.ok(bronson.parts.some((t) => /루프휠/.test(t)) && bronson.parts.some((t) => /10\.5oz/.test(t)));
  assert.ok(polo.unknown.indexOf('원단 무게') >= 0);
  assert.ok(airism.parts.some((t) => /혼방/.test(t)));
  for (const p of cat.products) { const q = P.qualityOf(p); assert.ok(q.score >= 3 && q.score <= 10, p.id); }
});

test('가성비 1순위·용도 상관없음: 품질 1점당 가격이 가장 낮은 축에서 1등이 나오고, 해외 주문이면 국내 대안을 먼저 붙인다', () => {
  const r = rec({ priorities: ['value'], use: 'any', sleeve: 'any' });
  assert.ok(r.pick.crit.value >= 0.9, '가성비 상대 점수 ' + r.pick.crit.value);
  const byValue = r.ranked.slice().sort((a, b) => b.crit.value - a.crit.value);
  assert.ok(byValue.slice(0, 2).indexOf(r.pick) >= 0, '가성비 상위 2개 안');
  if (r.pick.product.currency !== 'KRW') { assert.equal(r.alts[0].label, '국내에서 바로'); assert.equal(r.alts[0].r.product.currency, 'KRW'); }
  assert.ok(r.alts.length <= 2 && r.alts.every((a) => a.r !== r.pick));
  assert.ok(r.pick.reasons.some((t) => /가성비/.test(t)));
});

test('카디건 안에 입을 티: 두꺼운 원단은 1등·대안에서 빼고 이유를 알린다', () => {
  const r = rec({ priorities: ['quality', 'value'], use: 'layer', sleeve: 'short', brands: FAV });
  assert.notEqual(r.pick.product.fabric.thick, 'thick');
  assert.ok(r.alts.every((a) => a.r.product.fabric.thick !== 'thick'));
  assert.ok(r.notes.some((n) => /두꺼워서/.test(n)), '뺀 이유');
  const solo = rec({ priorities: ['quality'], use: 'solo', sleeve: 'short' });
  assert.notEqual(solo.pick.product.fabric.thick, 'thin', '혼자 입을 티에는 얇은 것을 1등으로 내지 않는다');
});

test('좋아하는 브랜드 1순위: 1등은 고른 브랜드 가운데서 나오고, 상품이 없는 브랜드는 메모로 알린다', () => {
  const r = rec({ priorities: ['brand', 'quality'], use: 'layer', sleeve: 'short', brands: FAV, styles: ['american-classic', 'amekaji'] });
  assert.ok(FAV.indexOf(r.pick.product.brand) >= 0);
  assert.ok(r.pick.reasons.some((t) => /좋아하는 브랜드/.test(t)));
  assert.ok(r.notes.some((n) => /LVC/.test(n)) && r.notes.some((n) => /아웃스탠딩/.test(n)));
});

test('반팔·긴팔 거르기', () => {
  const long = rec({ priorities: ['value'], use: 'any', sleeve: 'long' });
  assert.ok(long.ranked.length > 0 && long.ranked.every((x) => x.product.sleeve === 'long'));
  assert.ok(long.excluded.length > 0 && long.excluded.every((e) => /반팔/.test(e.why)));
});

test('내 핏: 잘 맞는 옷 치수와 가장 가까운 사이즈를 고르고 차이를 cm 로 말한다', () => {
  const p = cat.products.find((x) => x.id === 'uniqlo-e422992-white');
  const f = P.fitOf(p, { ref: { chest: 53.5, length: 69, shoulder: 46 } });
  assert.equal(f.size, 'M');
  assert.match(f.text, /가슴 -0\.5cm/);
  const polo = P.fitOf(cat.products.find((x) => x.id === 'polo-480590-white'), { ref: { chest: 50 } });
  assert.equal(polo.size, 'M'); assert.ok(polo.onlyOne, '공개 치수가 한 사이즈뿐임을 알린다');
  const none = P.fitOf(cat.products.find((x) => x.id === 'bronson-loopwheel-white'), { ref: { chest: 53 } });
  assert.equal(none.size, ''); assert.match(none.text, /치수표가 없어/);
});

test('평소 사이즈: 재고를 확인한 사이즈만 "있음", 품절이면 1등에서 빼고, 사이즈 이름이 다른 브랜드는 치수를 묻는다', () => {
  const soft = cat.products.find((x) => x.id === 'polo-630376-white');
  assert.equal(P.fitOf(soft, { size: 'M' }).avail, false);
  assert.equal(P.fitOf(soft, { size: '115' }).avail, true, '115 = XXL');
  const pottery = cat.products.find((x) => x.id === 'pottery-ss-classic-white');
  assert.match(P.fitOf(pottery, { size: 'M' }).text, /사이즈 이름이 달라/);
  const r = rec({ priorities: ['brand'], use: 'any', sleeve: 'short', brands: ['polo'], size: 'M' });
  assert.notEqual(r.pick.product.id, 'polo-630376-white');
  assert.ok(r.alts.every((a) => a.r.avail !== false));
});

test('옷장과의 조합: 1등과 대안에 내 옷장 기준 새 조합 수를 붙인다', () => {
  const r = rec({ priorities: ['value'], use: 'layer', sleeve: 'short' });
  for (const row of [r.pick].concat(r.alts.map((a) => a.r))) {
    assert.ok(row.closet && typeof row.closet.added === 'number');
    assert.ok(row.closet.top3.every((c) => c.top.status === 'candidate'));
  }
});

test('가격 확인일이 14일 넘게 지나면 다시 확인하라고 한다. 같은 입력이면 같은 결과', () => {
  const late = rec({ priorities: ['value'], use: 'any', sleeve: 'any', today: '2026-11-30' });
  assert.ok(late.ranked.every((x) => x.stale) && late.pick.cautions.some((c) => /다시 확인/.test(c)));
  const a = rec({ priorities: ['quality', 'brand'], use: 'layer', sleeve: 'any', brands: FAV }), b = rec({ priorities: ['quality', 'brand'], use: 'layer', sleeve: 'any', brands: FAV });
  assert.deepEqual(a.ranked.map((x) => [x.product.id, x.total]), b.ranked.map((x) => [x.product.id, x.total]));
});

test('후보로 넣기: 판매처 링크·원화 가격·확인일이 들어가고 사진은 비어 있다', () => {
  const p = cat.products.find((x) => x.id === 'bronson-loopwheel-white');
  const c = P.toCandidate(p, cat, '2026-10-13');
  assert.equal(c.status, 'candidate'); assert.equal(c.link, p.store.url);
  assert.equal(c.price, Math.round(28.99 * cat.fx.USD.krw)); assert.equal(c.checkedAt, '2026-10-13');
  assert.equal(c.photo.kind, 'none');
});
