// 체험용 옷 예시 사진(2026-10-27 대표 요청 "옷이 왜 자꾸 그림이에요… 사진이어야"):
// 대표가 만든 예시 사진을 앱에 함께 묶어, 체험용 옷은 그림 대신 이 사진으로 보인다.
// 앱 안의 파일이라 외부 요청이 없으므로 상품 사진을 끈 상태(photos: false)에서도 보인다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMock } from '../src/core.mjs';

const closet = (photos) => { const M = createMock({ photos }); M.loadTrialCloset('M'); return { M, items: M.getState().closet }; };
const byLabel = (items, label) => items.find((g) => g.label === label);

test('체험용 옷은 함께 묶은 예시 사진을 쓴다(상품 사진을 꺼도)', () => {
  for (const photos of [false, true]) {
    const { items } = closet(photos);
    const shirt = byLabel(items, '흰 옥스퍼드 셔츠');
    assert.equal(shirt.photo?.src, 'examples/m-oxford.webp');
    assert.equal(shirt.photo.example, true);
    assert.equal(shirt.photo.similar, false);
    assert.match(shirt.photo.alt, /예시 사진/);
    for (const [label, file] of [['흰 무지 티셔츠', 'm-tee'], ['네이비 크루넥 니트', 'm-knit'], ['네이비 블레이저', 'm-blazer'], ['베이지 치노 팬츠', 'm-chino']])
      assert.equal(byLabel(items, label).photo?.src, `examples/${file}.webp`, label);
  }
});

test('예시 사진이 아직 없는 체험용 옷은 전과 같다', () => {
  assert.equal(byLabel(closet(false).items, '인디고 워시드 데님').photo, null);
  const similar = byLabel(closet(true).items, '인디고 워시드 데님').photo;
  assert.equal(similar?.similar, true);
});

test('내가 넣은 옷은 예시 사진을 쓰지 않는다(내 옷처럼 보이면 안 된다)', () => {
  const M = createMock({ photos: false });
  M.addGarment({ kind: 'shirt', slot: 'm-oxford', color: 'white', gender: 'M' });
  const mine = M.getState().closet[0];
  assert.equal(mine.trial, false);
  assert.equal(mine.photo, null);
});
