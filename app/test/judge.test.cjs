// 실행: node --test test/
// 자료는 data/sample-wardrobe.json (공개용 예시 옷장 13벌). 개인 옷장 파일은 저장소에 넣지 않는다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const J = require('../src/judge.js');
const items = JSON.parse(fs.readFileSync(__dirname + '/../data/sample-wardrobe.json', 'utf8')).items;
const tpl = JSON.parse(fs.readFileSync(__dirname + '/../data/template-ivy.json', 'utf8')).items;
const cand = (o) => Object.assign({ id: 'cand', status: 'candidate', formality: 2, pattern: 'solid', seasons: [] }, o);

test('버건디 니트 후보: 겹치는 옷이 없고 카키 치노와만 조합이 생기며 어두운 하의 2벌에는 밝기 주의가 붙는다', () => {
  const r = J.judgeCandidate(items, cand({ cat: 'top', kind: 'knit', family: 'burgundy', light: 30 }));
  assert.equal(r.overlaps.length, 0);
  assert.deepEqual(r.added.map((a) => a.bottom.id), ['s-chino-khaki']);
  assert.equal(r.after - r.before, 1);
  assert.equal(r.top3.length, 1);
  assert.ok(r.blockers.some((b) => b.text.includes('밝기') && b.count === 2 && b.total === 3));
});

test('흰 옥스퍼드 셔츠 후보: 가진 흰 셔츠와 강하게, 흰 티셔츠와 약하게 겹치고 하의 3벌 모두와 조합이 생긴다', () => {
  const r = J.judgeCandidate(items, cand({ cat: 'top', kind: 'shirt', family: 'white', light: 95, formality: 3 }));
  assert.deepEqual(r.overlaps.map((o) => [o.item.id, o.level]), [['s-ocbd-white', 'strong'], ['s-tee-white', 'partial']]);
  assert.equal(r.added.length, 3);
  assert.equal(r.after - r.before, 3);
  assert.equal(new Set(r.top3.map((c) => c.bottom.id)).size, 3);
  assert.equal(r.blockers.length, 0);
});

test('네이비 그래픽 스웻셔츠 후보는 가진 네이비 스웻셔츠와 겹친다 (무늬가 달라 부분 겹침)', () => {
  const r = J.judgeCandidate(items, cand({ cat: 'top', kind: 'sweat', family: 'navy', light: 18, formality: 1, pattern: 'graphic' }));
  assert.equal(r.overlaps[0].item.id, 's-sweat-navy');
  assert.ok(['strong', 'partial'].includes(r.overlaps[0].level));
});

test('네이비 니트 후보: 인디고 데님과는 한 덩어리 주의가 붙고 치노·슬랙스와 조합이 된다', () => {
  const r = J.judgeCandidate(items, cand({ cat: 'top', kind: 'knit', family: 'navy', light: 18 }));
  assert.deepEqual(r.added.map((a) => a.bottom.id), ['s-chino-khaki', 's-slacks-gray']);
  assert.ok(r.blockers.some((b) => b.text.includes('한 덩어리') && b.count === 1));
});

test('조합이 하나도 안 되면 필요한 옷을 문장으로 알려 준다', () => {
  const dark = items.filter((i) => i.id !== 's-chino-khaki' && i.id !== 's-slacks-gray');
  const r = J.judgeCandidate(dark, cand({ cat: 'top', kind: 'knit', family: 'navy', light: 18 }));
  assert.equal(r.added.length, 0);
  assert.equal(r.top3.length, 0);
  assert.ok(r.needs[0].includes('하의') && r.needs[0].includes('밝기 36 이상'));
});

test('아우터 후보는 걸칠 수 있는 조합 수와 대표 3개를 돌려준다. 대표는 상의가 겹치지 않게 고른다', () => {
  const r = J.judgeCandidate(items, cand({ cat: 'outer', kind: 'jacket', family: 'beige', light: 72 }));
  assert.ok(r.before > 0 && r.added.length > 0 && r.added.length <= r.before);
  assert.ok(r.top3.every((c) => c.outer.id === 'cand'));
  assert.equal(new Set(r.top3.map((c) => c.top.id)).size, Math.min(3, new Set(r.added.map((c) => c.top.id)).size));
  assert.ok(r.blockers.some((b) => b.text.includes('아우터와 하의의 색') && b.count === 5 && b.total === 10));
});

test('신발 후보는 조합을 판정하지 않고 그 이유를 말한다', () => {
  const r = J.judgeCandidate(items, cand({ cat: 'shoes', kind: 'derby', family: 'black', light: 10, formality: 3 }));
  assert.equal(r.supported, false);
  assert.ok(r.note.includes('신발'));
  const loafer = J.judgeCandidate(items, cand({ cat: 'shoes', kind: 'loafer', family: 'brown', light: 25, formality: 3 }));
  assert.equal(loafer.overlaps[0].item.id, 's-loafer-brown');
});

test('하의 후보는 상의 쪽에서 조합을 세고, 같은 회색 슬랙스와 강하게 겹친다', () => {
  const r = J.judgeCandidate(items, cand({ cat: 'bottom', kind: 'slacks', family: 'gray', light: 45, formality: 3 }));
  assert.deepEqual(r.overlaps.map((o) => [o.item.id, o.level]), [['s-slacks-gray', 'strong']]);
  assert.deepEqual(r.added.map((a) => a.top.id).sort(), ['s-ocbd-stripe', 's-ocbd-white']);
  assert.ok(r.top3.every((c) => c.bottom.id === 'cand'));
});

test('다른 구매 후보와 처분한 옷은 보유 옷으로 세지 않는다', () => {
  const chino = items.find((i) => i.id === 's-chino-khaki');
  const extra = items.concat([cand({ id: 'c2', cat: 'bottom', kind: 'slacks', family: 'gray', light: 50 }), Object.assign({}, chino, { id: 'gone1', status: 'gone' })]);
  const a = J.judgeCandidate(items, cand({ cat: 'top', kind: 'shirt', family: 'white', light: 95, formality: 3 }));
  const b = J.judgeCandidate(extra, cand({ cat: 'top', kind: 'shirt', family: 'white', light: 95, formality: 3 }));
  assert.equal(a.added.length, b.added.length);
  assert.equal(a.before, b.before);
});

test('계절을 고르면 그 계절의 옷만으로 판정한다', () => {
  const r = J.judgeCandidate(items, cand({ cat: 'top', kind: 'shirt', family: 'white', light: 95, formality: 3 }), { season: '여름' });
  assert.ok(r.added.every((a) => !a.bottom.seasons.length || a.bottom.seasons.includes('여름')));
  assert.ok(!r.added.some((a) => a.bottom.id === 's-slacks-gray'), '봄·가을·겨울 슬랙스는 여름 판정에서 빠진다');
  assert.ok(r.overlaps.some((o) => o.item.id === 's-tee-white'), '봄·여름·가을 티셔츠는 여름 판정에 들어간다');
  const w = J.judgeCandidate(items, cand({ cat: 'top', kind: 'shirt', family: 'white', light: 95, formality: 3 }), { season: '겨울' });
  assert.ok(!w.overlaps.some((o) => o.item.id === 's-tee-white'), '봄·여름·가을 티셔츠는 겨울 판정에서 빠진다');
  assert.ok(w.before < J.judgeCandidate(items, cand({ cat: 'top', kind: 'shirt', family: 'white', light: 95, formality: 3 })).before);
});

test('기본 옷장과 견주면 가진 것과 빠진 것이 나뉜다', () => {
  const r = J.compareWardrobes(items, tpl);
  const have = r.both.map((b) => b.theirs.id), missing = r.onlyTheirs.map((t) => t.id);
  for (const id of ['t-ocbd-white', 't-stripe', 't-tee-white', 'b-chino-khaki', 'b-denim-raw', 'b-wool-gray', 'o-blazer-navy', 'o-field-olive', 's-loafer-brown']) assert.ok(have.includes(id), id + ' 가진 것');
  for (const id of ['t-ocbd-blue', 't-sweat-gray', 't-knit-navy', 'o-cardigan-navy', 'o-harrington', 's-sneaker-white']) assert.ok(missing.includes(id), id + ' 빠진 것');
  assert.equal(have.length + missing.length, tpl.length);
  assert.equal(new Set(r.both.map((b) => b.mine.id)).size, r.both.length, '내 옷 한 벌은 한 번만 짝짓는다');
  assert.deepEqual(r.onlyMine.map((m) => m.id).sort(), ['s-cardigan-gray', 's-shirt-check', 's-sweat-navy', 's-trucker-cord']);
});

test('브랜드와 이름이 같으면 속성이 달라도 같은 옷으로 본다', () => {
  const mine = [{ id: 'm1', status: 'owned', cat: 'top', kind: 'shirt', brand: 'Brand A', name: 'Oxford BD', family: 'white', light: 95, pattern: 'solid' }];
  const theirs = [{ id: 't1', status: 'owned', cat: 'top', kind: 'shirt', brand: 'brand a', name: 'oxford-bd', family: 'blue', light: 70, pattern: 'solid' }];
  const r = J.compareWardrobes(mine, theirs);
  assert.equal(r.both.length, 1);
  assert.equal(r.both[0].how, 'exact');
});

test('같은 입력이면 결과가 같다', () => {
  const c = cand({ cat: 'bottom', kind: 'slacks', family: 'gray', light: 45, formality: 3 });
  const a = J.judgeCandidate(items, c), b = J.judgeCandidate(items.slice().reverse(), c);
  assert.deepEqual(a.top3.map((x) => x.top.id).sort(), b.top3.map((x) => x.top.id).sort());
  assert.equal(a.added.length, b.added.length);
});
