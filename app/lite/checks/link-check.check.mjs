// 링크·사진으로 "이거 사도 될까?" 바로 판단(차별점: 사기 전에 내 옷장 기준 판단, 10-28 15:00 Claude 추천 → 16:46 대표 "할 수 있는 건 알아서").
// 무신사 목록에 있는 상품은 상세 판단으로, 그 밖의 링크는 종류·색을 받아 옷장과 겹침·새 코디 수를 바로 보여 준다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMock } from '../src/core.mjs';

const closet = () => {
  const M = createMock({ photos: false });
  for (const [kind, slot, color, label] of [['shirt', 'm-oxford', 'white', '흰 셔츠'], ['pants', 'm-chino', 'beige', '베이지 바지'], ['sneaker', 'm-white-sneaker', 'white', '흰 신발'], ['knit', 'm-knit', 'navy', '네이비 니트']])
    M.addGarment({ kind, slot, color, label });
  return M;
};

test('같은 종류·색이 있으면 겹친다고, 그 옷 이름과 함께 알려 준다', () => {
  const M = closet();
  const r = M.checkCandidate({ kind: 'shirt', color: 'white' });
  assert.equal(r.verdict, 'overlap');
  assert.deepEqual(r.sameColor.map((g) => g.label), ['흰 셔츠']);
  assert.match(r.title, /비슷한 옷이 이미 있어요/);
});

test('없는 종류면 새 코디가 몇 개 생기는지 센다(옷장은 바꾸지 않는다)', () => {
  const M = closet();
  const before = M.getState().closet.length;
  const r = M.checkCandidate({ kind: 'blazer', color: 'navy' });
  assert.equal(r.verdict, 'new');
  assert.ok(r.newOutfits > 0);
  assert.match(r.title, /새 코디 \d+개/);
  assert.equal(M.getState().closet.length, before);
});

test('색만 다르면 그렇게, 색을 모르면 색 확인이 필요하다고 말한다', () => {
  const M = closet();
  assert.equal(M.checkCandidate({ kind: 'knit', color: 'grey' }).verdict, 'other_color');
  assert.equal(M.checkCandidate({ kind: 'knit', color: null }).verdict, 'color_unknown');
});

test('옷장이 비면 판단할 수 없다고 말하고, 목록에 없는 종류는 거절한다', () => {
  const M = createMock({ photos: false });
  assert.equal(M.checkCandidate({ kind: 'shirt', color: 'white' }).verdict, 'no_closet');
  assert.throws(() => M.checkCandidate({ kind: 'spaceship', color: 'white' }), /종류/);
});

test('체험용 옷만 있으면 체험용 기준이라고 밝힌다', () => {
  const M = createMock({ photos: false });
  M.loadTrialCloset('M');
  const r = M.checkCandidate({ kind: 'shirt', color: 'white' });
  assert.match(r.basis, /체험용/);
});

test('링크 읽기: 목록에 있는 무신사 상품, 목록 밖 무신사, 다른 판매처, 링크 아님', () => {
  const M = createMock({ photos: false });
  const known = M.readCandidateLink('이거 어때? https://www.musinsa.com/products/' + M.readSearch('셔츠').products[0].id.replace('ms-', ''));
  assert.equal(known.kind, 'catalog');
  assert.ok(known.productId);
  assert.equal(M.readCandidateLink('https://www.musinsa.com/products/999999999').kind, 'external');
  assert.equal(M.readCandidateLink('https://shop.example.com/item/1').kind, 'external');
  assert.equal(M.readCandidateLink('그냥 글').ok, false);
});
