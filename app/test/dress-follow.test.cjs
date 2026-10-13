// 실행: node --test test/*.cjs
// 0.5 베타: 원피스(dress)·스커트 등 넓힌 분류, 새 색 계열, 결정 뒤 물음(follow). 자료는 data/sample-wardrobe-b.json (합성 예시 15벌)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const W = require('../src/wardrobe.js');
const J = require('../src/judge.js');
const R = require('../src/recommend.js');
const G = require('../src/colorguess.js');
const C = require('../src/catalog.js');
const B = JSON.parse(fs.readFileSync(__dirname + '/../data/sample-wardrobe-b.json', 'utf8'));
const items = require('./fixtures/rule-fixture.cjs')(B.items);
const cand = (o) => Object.assign({ id: 'cand', status: 'candidate', formality: 2, pattern: 'solid', seasons: [] }, o);

test('넓힌 분류: 원피스·점프수트·스커트·블라우스·힐과 새 색 계열이 정리 뒤에도 남고, 모르는 원피스 종류는 미확인으로 남는다', () => {
  const it = W.cleanItem({ id: 'x', cat: 'dress', kind: 'jumpsuit', name: '점프수트', family: 'purple', light: 40 }, 0);
  assert.deepEqual([it.cat, it.kind, it.family], ['dress', 'jumpsuit', 'purple']);
  assert.equal(W.cleanItem({ cat: 'dress', kind: 'tee' }, 0).kind, null);
  for (const [cat, kind] of [['top', 'blouse'], ['top', 'sleeveless'], ['top', 'turtleneck'], ['bottom', 'skirt'], ['bottom', 'wide'], ['bottom', 'jogger'], ['bottom', 'leggings'], ['outer', 'trench'], ['shoes', 'heels'], ['shoes', 'flats'], ['shoes', 'sandals']]) {
    assert.equal(W.cleanItem({ cat, kind }, 0).kind, kind, cat + '/' + kind);
  }
  for (const f of ['pink', 'purple', 'yellow', 'orange']) assert.equal(W.cleanItem({ cat: 'top', family: f }, 0).family, f);
  // 예전 기본값은 그대로: 분류마다 첫 종류
  assert.deepEqual(Object.keys(W.CATS).map((c) => Object.keys(W.KINDS[c])[0]), ['jacket', 'shirt', 'denim', 'dress', 'derby']);
  const m = W.cleanItem({ cat: 'dress', measures: { length: 110, waist: 70, rise: 30 } }, 0).measures;
  assert.deepEqual(m, { length: 110, waist: 70 });
  assert.equal(items.length, 15);
  assert.ok(items.every((i) => W.cleanItem(i, 0) && W.KINDS[i.cat][i.kind]));
});

test('코디: 원피스는 혼자서 조합 하나가 되고(하의 null, dress 표시) 같은 원피스를 두 번 쓰지 않는다', () => {
  const combos = R.allCombos(items);
  const dress = combos.filter((c) => c.dress);
  assert.equal(dress.length, 2 * 4);                                                                  // 원피스 2벌 × (아우터 없음 + 아우터 3벌)
  assert.ok(dress.every((c) => c.bottom === null && items.find((i) => i.id === c.top).cat === 'dress'));
  const recs = R.recommend(items.filter((i) => i.cat === 'dress' || i.cat === 'outer'), 3);
  assert.equal(recs.length, 2);                                                                        // 원피스가 2벌뿐이므로 2개. 하의가 null 이어도 둘째 원피스가 막히지 않는다
  assert.equal(new Set(recs.map((c) => c.top)).size, 2);
  const s = R.scoreDressOuter({ family: 'navy', light: 18, formality: 3, pattern: 'solid' }, { family: 'ivory', light: 86, formality: 2, pattern: 'graphic' });
  assert.equal(s.score, 3);
  assert.deepEqual(s.caution, []);
  const bad = R.scoreDressOuter({ family: 'indigo', light: 16, formality: 1, pattern: 'check' }, { family: 'navy', light: 18, formality: 3, pattern: 'graphic' });
  assert.deepEqual(bad.caution, ['아우터와 원피스의 색이 비슷합니다.', '아우터와 원피스의 격식 차이가 큽니다.', '아우터와 원피스에 모두 무늬가 있습니다.']);
});

test('살까 말까: 원피스 후보는 차림을 하나 더하고, 걸칠 수 있는 아우터와 겹치는 원피스를 보여 준다', () => {
  const black = J.judgeCandidate(items, cand({ cat: 'dress', kind: 'dress', family: 'black', light: 12, formality: 3 }));
  assert.equal(black.supported, true);
  assert.equal(black.overlaps.length, 0);
  assert.equal(black.after - black.before, 1);
  assert.equal(black.before, J.cleanOutfits(items).length);
  assert.equal(black.added.length, 1);
  assert.equal(black.added[0].outers.length, 3);
  assert.ok(black.top3.length === 3 && black.top3.every((c) => c.dress && c.bottom === null && c.outer));
  const navy = J.judgeCandidate(items, cand({ cat: 'dress', kind: 'dress', family: 'navy', light: 20, formality: 3 }));
  assert.deepEqual(navy.overlaps.map((o) => [o.item.id, o.level]), [['b-dress-navy', 'strong']]);
  // 아우터가 없거나 모두 걸리면 원피스 하나만 보여 주고, 걸리는 점을 아우터 수로 센다
  const noOuter = J.judgeCandidate(items.filter((i) => i.cat !== 'outer'), cand({ cat: 'dress', kind: 'dress', family: 'black', light: 12 }));
  assert.ok(noOuter.top3.length === 1 && noOuter.top3[0].outer === null && noOuter.blockers.length === 0 && noOuter.needs.length === 0);
  const clash = J.judgeCandidate([{ id: 'o1', status: 'owned', cat: 'outer', kind: 'coat', family: 'black', light: 12, formality: 3, pattern: 'solid', seasons: [] }], cand({ cat: 'dress', kind: 'dress', family: 'black', light: 14, formality: 3 }));
  assert.deepEqual(clash.blockers.map((b) => [b.text, b.count, b.total, b.word]), [['아우터와 원피스의 색이 비슷합니다.', 1, 1, '아우터']]);
  assert.equal(clash.needs.length, 1);
});

test('살까 말까: 아우터 후보는 원피스 위에도 걸쳐 보고, 상의·하의 후보는 원피스를 짝으로 쓰지 않는다', () => {
  const blazer = J.judgeCandidate(items, cand({ cat: 'outer', kind: 'blazer', family: 'black', light: 12, formality: 3 }));
  assert.equal(blazer.before, 14);
  assert.deepEqual(blazer.added.filter((a) => a.dress).map((a) => [a.top.id, a.bottom]), [['b-dress-navy', null], ['b-dress-flower', null]]);   // 검정과 네이비는 다른 계열로 본다
  const skirt = J.judgeCandidate(items, cand({ cat: 'bottom', kind: 'skirt', family: 'pink', light: 80 }));
  assert.ok(skirt.added.every((a) => a.top.cat === 'top'));
  assert.equal(skirt.blockers[0].total, 4);
});

test('상품 순위: 원피스 상품도 순위에 들고 지어낸 상품이 없다', () => {
  const products = [{ id: 'p1', name: '검정 원피스', cat: 'dress', kind: 'dress', family: 'black', light: 12, formality: 3 }, { id: 'p2', name: '네이비 원피스', cat: 'dress', kind: 'dress', family: 'navy', light: 20, formality: 3 }].map((p, i) => C.cleanProduct({ ...p, pattern: 'solid' }, i));
  const r = C.rank(items, products);
  assert.deepEqual(r.map((x) => x.product.id), ['p1', 'p2']);
  assert.ok(r[1].cautions.some((c) => c.includes('많이 겹치는 보유 옷')));
});

test('색 초안: 핑크·퍼플·옐로·오렌지를 고르고, 예전 색(베이지·카키·브라운·레드·버건디·올리브)은 그대로다', () => {
  const fam = (rgb) => G.familyOf(...G.rgbToHsl(...rgb));
  assert.equal(fam([250, 200, 205]), 'pink');
  assert.equal(fam([230, 90, 150]), 'pink');
  assert.equal(fam([190, 170, 220]), 'purple');
  assert.equal(fam([110, 60, 150]), 'purple');
  assert.equal(fam([240, 210, 80]), 'yellow');
  assert.equal(fam([230, 120, 40]), 'orange');
  assert.deepEqual([[214, 190, 150], [170, 150, 110], [70, 45, 32], [210, 40, 50], [110, 24, 40], [96, 108, 70], [193, 154, 107]].map(fam), ['beige', 'khaki', 'brown', 'red', 'burgundy', 'olive', 'khaki']);
});

test('결정 뒤 물음: 산 옷은 착용 횟수와 만족, 안 산 옷은 아쉬움만 받고 보류는 묻지 않는다', () => {
  const dec = (decision, at, follow) => W.cleanDecision({ id: 'd', itemId: 'c', name: 'x', before: { lean: 'buy', at: '2026-09-01' }, after: { decision, helpful: 'yes', at, shift: 'same' }, follow });
  assert.deepEqual(dec('buy', '2026-09-01', { at: '2026-09-20', worn: 'few', feel: 'good' }).follow, { at: '2026-09-20', worn: 'few', feel: 'good' });
  assert.deepEqual(dec('buy', '2026-09-01', { at: '2026-09-20', worn: 'notbought', feel: 'regret' }).follow, { at: '2026-09-20', worn: 'notbought', feel: '' });
  assert.equal(dec('buy', '2026-09-01', { at: '2026-09-20', worn: 'few' }).follow, null);              // 만족을 안 고르면 받지 않는다
  assert.deepEqual(dec('skip', '2026-09-01', { at: '2026-09-20', worn: 'many', feel: 'regret' }).follow, { at: '2026-09-20', worn: '', feel: 'regret' });
  assert.equal(dec('hold', '2026-09-01', { at: '2026-09-20', feel: 'good' }).follow, null);
  assert.equal(dec('buy', '2026-09-01', { at: 'yesterday', worn: 'few', feel: 'good' }).follow, null);
  assert.equal(W.cleanDecision({ before: { lean: 'buy' }, follow: { at: '2026-09-20', feel: 'good' } }).follow, null);   // 결정 전이면 물음도 없다
  const list = [dec('buy', '2026-09-10'), dec('skip', '2026-09-01'), dec('hold', '2026-08-01'), dec('buy', '2026-09-27'), dec('buy', '2026-08-20', { at: '2026-09-05', worn: 'none', feel: 'regret' })];
  assert.deepEqual(W.followDue(list, '2026-10-10').map((d) => d.after.at), ['2026-09-01', '2026-09-10']);   // 14일 이상, 답 없음, 보류 제외, 오래된 것부터
  assert.deepEqual(W.followDue(list, '2026-10-11').map((d) => d.after.at), ['2026-09-01', '2026-09-10', '2026-09-27']);
  const w = W.cleanWardrobe({ schema: 2, items: [], decisions: [{ id: 'd', itemId: 'c', name: 'x', before: { lean: 'buy' }, after: { decision: 'buy', helpful: 'yes', at: '2026-09-01' }, follow: { at: '2026-09-20', worn: 'many', feel: 'good' } }] });
  assert.equal(w.decisions[0].follow.worn, 'many');
});
