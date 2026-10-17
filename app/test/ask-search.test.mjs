import { test } from 'node:test';
import assert from 'node:assert/strict';
import { search } from '../src/engine.js';
import { parseQuery } from '../src/query.js';
import { newWardrobeState, wardrobeView, makeGarment } from '../src/wardrobe.js';
import { COLORS } from '../src/data/slots.js';

// No closet at all: a one-line request alone must lead to real products.
const empty = () => ({ ...wardrobeView({ ...newWardrobeState(), demo: false, garments: [] }), now: '2026-10-17' });

test('"X 말고" excludes that color and "밝은" keeps light colors only', () => {
  const r = search(empty(), '검정 말고 밝은 출근 셔츠');
  assert.ok(r.items.length > 0);
  assert.ok(r.query.terms.includes('블랙 제외'));
  assert.equal(r.query.color, null, 'a negated color is never the requested color');
  for (const { product, slot } of r.items) {
    assert.equal(slot.shape, 'shirt');
    assert.notEqual(product.color, 'black');
    assert.ok(COLORS[product.color].light >= 60, `${product.name} should be light`);
  }
});

test('"셔츠 말고 니트" recommends knits and no shirts', () => {
  const r = search(empty(), '셔츠 말고 니트');
  assert.ok(r.items.length > 0);
  assert.ok(r.items.every(({ slot }) => slot.shape === 'knit'));
  assert.ok(r.query.terms.includes('셔츠 제외'));
});

test('conditions the catalog cannot check are reported, not silently dropped', () => {
  const r = search(empty(), '구김 안 가는 여름 셔츠');
  assert.deepEqual(r.query.unsupported, ['구김 정도']);
  assert.ok(r.items.length > 0, 'the supported part of the request still returns shirts');
});

test('a style named in the request outranks the saved taste in ranking and reasons', () => {
  const state = { ...empty(), styles: ['classic'] };
  const r = search(state, '아메카지 겨울 아우터');
  assert.match(r.items[0].reasons[0], /^아메카지/);
  assert.ok(r.items[0].slot.style.amekaji >= 2);
});

test('example garments are not ownership evidence in search', () => {
  const demo = wardrobeView(newWardrobeState());
  assert.equal(demo.demo, true);
  const r = search({ ...demo, now: '2026-10-17' }, '청바지에 어울리는 신발');
  assert.equal(r.anchorItem, null);
  assert.ok(!r.outfit || r.outfit.items.every((row) => !row.owned), 'an outfit never counts example garments as owned');
});

test('a real owned garment still anchors a request', () => {
  const jeans = makeGarment({ slot: 'm-denim', color: 'blue', gender: 'M' });
  const state = { ...wardrobeView({ ...newWardrobeState(), demo: false, garments: [jeans] }), now: '2026-10-17' };
  assert.equal(search(state, '청바지에 어울리는 신발').anchorItem?.id, jeans.id);
});

test('zero matches stay zero instead of loosening the budget', () => {
  const r = search(empty(), '코트 1만원 이하');
  assert.equal(r.items.length, 0);
  assert.equal(r.query.maxPrice, 10000);
});

test('unknown words are listed, filler words are not', () => {
  assert.deepEqual(parseQuery('출근용 셔츠 추천해줘').unknown, []);
  assert.ok(parseQuery('뽀글뽀글한 출근 셔츠').unknown.includes('뽀글뽀글한'));
});
