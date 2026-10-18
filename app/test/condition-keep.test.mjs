import { test } from 'node:test';
import assert from 'node:assert/strict';
import { search, meetsCriteria, productsFor } from '../src/engine.js';
import { newWardrobeState, wardrobeView } from '../src/wardrobe.js';

// First visit: example closet, default gender M, nothing chosen yet.
const firstVisit = () => ({ ...wardrobeView(newWardrobeState()), now: '2026-10-17' });

test('a named kind is never refilled with other kinds; an unstated gender follows the kind', () => {
  const r = search(firstVisit(), '원피스');
  assert.ok(r.items.length > 0);
  assert.ok(r.items.every(({ slot }) => slot.cat === 'dress'), 'only dresses for "원피스"');
  assert.equal(r.genderFromKind, 'F', 'the switch to women’s products is reported');
});

test('a stated gender without that kind gives zero, not other kinds', () => {
  const r = search(firstVisit(), '남자 원피스');
  assert.equal(r.items.length, 0);
  assert.equal(r.kindUnavailable, '원피스');
});

test('kinds the catalog does not carry say so instead of showing other pants', () => {
  for (const text of ['반바지', '조거 팬츠', '츄리닝', '레깅스', '수영복']) {
    const r = search(firstVisit(), text);
    assert.equal(r.items.length, 0, text);
    assert.ok(r.kindNowhere, `${text} is reported as not in the catalog`);
  }
});

test('requests without a kind still get products (the all-kinds fill stays for them)', () => {
  const r = search(firstVisit(), '여름 데이트룩');
  assert.ok(r.items.length > 0);
});

test('the search criteria carry budget and exclusions to the detail alternatives', () => {
  const r = search(firstVisit(), '검정 말고 출근용 셔츠 10만원 이하');
  assert.equal(r.criteria.maxPrice, 100000);
  assert.deepEqual(r.criteria.excludeColors, ['black']);
  const alts = productsFor(r.items[0].slot.id).filter((p) => meetsCriteria(p, r.criteria));
  assert.ok(alts.length > 0);
  assert.ok(alts.every((p) => p.price <= 100000 && p.color !== 'black'));
  assert.ok(productsFor(r.items[0].slot.id).some((p) => !meetsCriteria(p, r.criteria)), 'some same-kind products are filtered out');
});

test('chips come from the applied conditions; a dropped condition is the user’s, and is shown', () => {
  const r = search(firstVisit(), '코트 1만원 이하');
  assert.equal(r.items.length, 0, 'zero stays zero');
  assert.deepEqual(r.conds.map((c) => c.key), ['kind', 'price']);
  const again = search(firstVisit(), '코트 1만원 이하', { drop: ['price'] });
  assert.ok(again.items.length > 0);
  assert.deepEqual(again.dropped, ['price']);
  assert.ok(!again.conds.some((c) => c.key === 'price'));
});

test('the first reason line names the matched conditions; off-occasion kinds are marked', () => {
  const r = search(firstVisit(), '출근용 셔츠 10만원 이하');
  const fit = r.items.filter((i) => !i.offOccasion);
  assert.ok(fit.length > 0);
  assert.match(fit[0].reasons[0], /출근 · 10만원 이하에 맞춰 골랐어요/);
  for (const i of r.items) assert.equal(i.offOccasion, !i.slot.occ.includes('work'));
});

test('"편한" puts names with easy-fit marks first and never ranks raw denim first', () => {
  const r = search(firstVisit(), '주말에 입을 편한 바지');
  assert.ok(r.items.length > 0);
  assert.notEqual(r.items[0].slot.id, 'm-denim-raw');
  assert.ok(r.conds.some((c) => c.key === 'comfort'));
});

// Everyday sentences people actually type. Each line: request → what every result must be.
const SENTENCES = [
  ['그레이 후드티', (s) => s.id === 'm-hoodie' || s.id === 'f-sweat'],
  ['후드 집업', (s) => s.id === 'm-hoodie' || s.id === 'f-sweat'],
  ['빨간 니트', (s) => s.shape === 'knit'],
  ['반팔 티', (s) => s.shape === 'tee' || s.shape === 'longtee'],
  ['흰 티셔츠 3만원 이하', (s) => s.shape === 'tee' || s.shape === 'longtee'],
  ['청바지', (s) => s.shape === 'jeans'],
  ['출근 슬랙스', (s) => /slacks/.test(s.id)],
  ['겨울 코트', (s) => s.shape === 'coat'],
  ['데이트 셔츠', (s) => s.shape === 'shirt'],
  ['여자 스커트', (s) => s.shape === 'skirt'],
  ['치마', (s) => s.shape === 'skirt'],
  ['여자 니트 5만원 이하', (s) => s.shape === 'knit' && s.g === 'F'],
  ['스니커즈', (s) => s.shape === 'sneaker'],
  ['로퍼', (s) => /loafer/.test(s.id)],
  ['패딩', (s) => s.shape === 'down'],
  ['가디건', (s) => s.shape === 'cardigan'],
  ['셔츠 말고 니트', (s) => s.shape === 'knit'],
  ['검정 말고 바지', (s) => s.cat === 'bottom'],
  ['원피스 10만원 이하', (s) => s.cat === 'dress'],
  ['주말 바지', (s) => s.cat === 'bottom'],
];

for (const [text, every] of SENTENCES) {
  test(`everyday request "${text}" returns only what was asked`, () => {
    const r = search(firstVisit(), text);
    assert.ok(r.understood, `${text} is understood`);
    assert.ok(r.items.every(({ slot }) => every(slot)), r.items.map((i) => i.slot.id).join(','));
  });
}

test('"티" in "꾸민 티 안 나게" is not a T-shirt', () => {
  const r = search(firstVisit(), '꾸민 티 안 나게 입을 옷');
  assert.ok(!r.items.some(({ slot }) => slot.shape === 'tee') || !r.understood);
});
