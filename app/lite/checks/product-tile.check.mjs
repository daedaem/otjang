// 대표 11-15 "개선할게 있으면 다 해주세요". 초대 회원은 무신사 사진 대신 색 칸을 본다(10-28). 그 색 칸이 상품마다
// 회색 「옷」으로 똑같으면 무슨 옷인지 알 수 없다: 상품의 색과 종류 이름을 보인다(사진이 아니라 색·글자뿐이다).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMock } from '../src/core.mjs';

test('사진이 없는 상품 칸은 그 상품의 색과 종류 이름을 보인다', () => {
  const M = createMock({ photos: false });
  const p = M.product('ms-728000');
  const info = M.photoInfo({ id: p.id });
  assert.equal(info.photo, null);
  assert.equal(info.tile.hex, p.colorHex);
  assert.equal(info.tile.name, p.kindName);
  assert.match(M.photoHtml({ id: p.id }), new RegExp(`background:${p.colorHex}`));
});

test('옷장 옷에 연결된 상품(productId)도 같은 규칙이다', () => {
  const M = createMock({ photos: false });
  const p = M.product('ms-728000');
  assert.deepEqual(M.photoInfo({ productId: p.id }).tile, M.photoInfo({ id: p.id }).tile);
});

test('색이 어두운 상품은 흰 글씨, 종류·색을 직접 준 대상은 준 값이 우선이다', () => {
  const M = createMock({ photos: false });
  const t = M.photoInfo({ id: 'ms-728000', color: 'navy', kindName: '직접 준 이름' }).tile;
  assert.equal(t.name, '직접 준 이름');
  assert.equal(t.ink, '#fff');
});

test('모르는 대상은 지금처럼 회색 「옷」이다', () => {
  const M = createMock({ photos: false });
  assert.deepEqual(M.photoInfo({ id: 'nope' }).tile, { hex: '#e9e9e9', ink: '#222', name: '옷' });
});
