// 체험용 옷 예시 사진(2026-10-27 대표 요청 "옷이 왜 자꾸 그림이에요… 사진이어야"):
// 대표가 만든 예시 사진을 앱에 함께 묶어, 체험용 옷은 그림 대신 이 사진으로 보인다.
// 앱 안의 파일이라 외부 요청이 없으므로 상품 사진을 끈 상태(photos: false)에서도 보인다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createMock } from '../src/core.mjs';

const closet = (photos, gender = 'M') => { const M = createMock({ photos }); M.loadTrialCloset(gender); return { M, items: M.getState().closet }; };
const byLabel = (items, label) => items.find((g) => g.label === label);
const expected = {
  M: [['흰 옥스퍼드 셔츠', 'm-oxford'], ['흰 무지 티셔츠', 'm-tee'], ['네이비 크루넥 니트', 'm-knit'], ['네이비 블레이저', 'm-blazer'], ['베이지 치노 팬츠', 'm-chino'], ['인디고 워시드 데님', 'm-denim'], ['브라운 로퍼', 'm-loafer'], ['흰 스니커즈', 'm-white-sneaker']],
  F: [['흰 티셔츠', 'f-tee'], ['베이지 니트', 'f-knit'], ['베이지 트렌치 코트', 'f-trench'], ['블랙 슬랙스', 'f-slacks'], ['라이트 블루 데님', 'f-denim'], ['블랙 로퍼', 'f-loafer'], ['흰 스니커즈', 'm-white-sneaker']],
};

test('체험용 옷은 함께 묶은 예시 사진을 쓴다(상품 사진을 꺼도)', () => {
  for (const photos of [false, true]) {
    for (const [gender, rows] of Object.entries(expected)) {
      const { items } = closet(photos, gender);
      assert.equal(items.length, rows.length);
      for (const [label, file] of rows) {
        const photo = byLabel(items, label).photo;
        assert.equal(photo?.src, `examples/${file}.webp`, label);
        assert.equal(photo.example, true, label);
        assert.equal(photo.similar, false, label);
        assert.match(photo.alt, /예시 사진/);
        const bytes = readFileSync(new URL(`../public/examples/${file}.webp`, import.meta.url));
        assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
        assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
      }
    }
  }
});

test('체험용 옷의 색을 바꾸면 원래 색 예시 사진으로 오인하지 않는다', () => {
  for (const photos of [false, true]) {
    const { M, items } = closet(photos);
    const denim = byLabel(items, '인디고 워시드 데님');
    M.updateGarment(denim.id, { color: 'black' });
    const changed = M.getState().closet.find((g) => g.id === denim.id);
    assert.equal(changed.photo?.example, undefined);
    assert.notEqual(changed.photo?.src?.startsWith('examples/'), true);
    if (!photos) assert.equal(changed.photo, null);
  }
});

test('내가 넣은 옷은 예시 사진을 쓰지 않는다(내 옷처럼 보이면 안 된다)', () => {
  const M = createMock({ photos: false });
  M.addGarment({ kind: 'shirt', slot: 'm-oxford', color: 'white', gender: 'M' });
  const mine = M.getState().closet[0];
  assert.equal(mine.trial, false);
  assert.equal(mine.photo, null);
});
