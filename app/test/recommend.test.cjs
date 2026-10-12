// 실행: node --test recommend.test.cjs
// 자료는 data/sample-wardrobe.json (공개용 예시 옷장 13벌). 개인 옷장 파일은 저장소에 넣지 않는다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const R = require('../src/recommend.js');
const items = JSON.parse(fs.readFileSync(__dirname + '/../data/sample-wardrobe.json', 'utf8')).items;
const byId = Object.fromEntries(items.map((i) => [i.id, i]));

test('밝은 셔츠와 어두운 데님은 밝기 차이로 점수를 얻는다', () => {
  const r = R.scorePair(byId['s-ocbd-stripe'], byId['s-denim-raw']);
  assert.ok(r.score >= 3);
  assert.ok(r.why.some((s) => s.includes('밝기 차이')));
});

test('네이비 상의와 인디고 하의는 같은 계열로 보고 감점한다', () => {
  const r = R.scorePair(byId['s-sweat-navy'], byId['s-denim-raw']);
  assert.ok(r.score < R.scorePair(byId['s-ocbd-stripe'], byId['s-denim-raw']).score);
  assert.ok(r.caution.some((s) => s.includes('한 덩어리')));
});

test('스웻셔츠 위 카디건은 감점, 셔츠 위 카디건은 가점', () => {
  const sweat = R.scoreOuter(byId['s-cardigan-gray'], byId['s-sweat-navy'], byId['s-denim-raw']);
  const shirt = R.scoreOuter(byId['s-cardigan-gray'], byId['s-ocbd-stripe'], byId['s-denim-raw']);
  assert.ok(shirt.score > sweat.score);
  assert.ok(sweat.caution.some((s) => s.includes('부피')));
});

test('추천은 3개이고 상의가 서로 다르며 모두 근거가 있다', () => {
  const recs = R.recommend(items, 3);
  assert.equal(recs.length, 3);
  assert.equal(new Set(recs.map((r) => r.top)).size, 3);
  for (const r of recs) { assert.ok(r.why.length > 0); assert.ok(byId[r.top] && byId[r.bottom]); assert.ok(r.outer === null || byId[r.outer]); }
  assert.deepEqual(recs[0], Object.assign({}, recs[0], { top: 's-ocbd-stripe', bottom: 's-denim-raw', outer: 's-cardigan-gray' }), '첫 추천은 줄무늬 셔츠 + 생지 데님 + 카디건');
});

test('추천에는 옷장에 없는 id가 나오지 않고 신발은 조합에 넣지 않는다', () => {
  for (const c of R.allCombos(items)) {
    assert.equal(byId[c.top].cat, 'top'); assert.equal(byId[c.bottom].cat, 'bottom');
    if (c.outer) assert.equal(byId[c.outer].cat, 'outer');
  }
});

test('같은 입력은 같은 추천을 낸다', () => {
  assert.deepEqual(R.recommend(items, 3), R.recommend(items.slice().reverse(), 3));
});

test('제외한 조합은 다시 나오지 않는다', () => {
  const first = R.recommend(items, 3);
  const key = (c) => [c.top, c.bottom, c.outer || ''].join('|');
  const next = R.recommend(items, 3, first.map(key));
  for (const c of next) assert.ok(!first.some((f) => key(f) === key(c)));
});

test('하의가 하나뿐이어도 추천 3개를 채운다', () => {
  const few = items.filter((i) => i.cat !== 'bottom' || i.id === 's-denim-raw');
  assert.equal(R.recommend(few, 3).length, 3);
});

test('아우터가 없으면 아우터 없는 조합만 낸다', () => {
  const summer = items.filter((i) => i.cat !== 'outer');
  for (const r of R.recommend(summer, 3)) assert.equal(r.outer, null);
});
