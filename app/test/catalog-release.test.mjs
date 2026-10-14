import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PRODUCTS, CATALOG } from '../src/data/products.js';
import { productEligible, productExclusionReason } from '../src/catalog-policy.js';
import { classify } from '../tools/catalog/classify.mjs';
import { buildProducts, renderProductsModule, selectBrandProducts } from '../tools/catalog/make-products.mjs';

const read = (file) => JSON.parse(fs.readFileSync(new URL(`../tools/catalog/${file}`, import.meta.url), 'utf8'));
const source = {
  curation: read('curation.json'),
  snapshot: read('snapshot.json'),
  brandProducts: read('brands.json'),
  imageColors: read('image-colors.json'),
  exclude: read('exclude.json'),
  fixes: read('fixes.json'),
};
const verified = [
  ['6894812', 'm-downvest', null],
  ['2452865', 'm-oxford', 'm-polo'],
  ['3531136', 'm-field', 'm-work-pants'],
  ['4705394', 'm-wax', 'm-oxford'],
  ['4773286', 'm-wax', null],
];

test('확인된 다섯 상품의 충돌 분류는 런타임과 생성 결과에서 제외한다', () => {
  for (const [id, wrongSlot] of verified) {
    const row = source.brandProducts.find((p) => p.id === id);
    assert.ok(row, id);
    assert.equal(productEligible({ ...row, slot: wrongSlot }), false, id);
    assert.ok(productExclusionReason({ ...row, slot: wrongSlot }), id);
    assert.equal(
      PRODUCTS.some((p) => p.id === `ms-${id}`),
      false,
      id,
    );
  }
  assert.equal(source.fixes['6894812'].slot, null, '플리스 조끼를 니트/다운 조끼로 자동 이동하지 않는다');
});

test('분류기는 형태와 충돌하는 스타일 단어를 건너뛴다', () => {
  for (const [id, , expected] of verified) {
    const row = source.brandProducts.find((p) => p.id === id);
    assert.equal(classify(row.name, 'M'), expected, id);
  }
  assert.equal(classify('JUNGLE CLOTH FATIGUE PANT BLACK', 'M'), 'm-work-pants');
});

test('셔츠 재킷·셔켓과 실제 다운 스웨터는 원래 형태로 허용한다', () => {
  for (const [name, slot] of [
    ['COATED WORK SHIRT JACKET BLACK', 'm-chore'],
    ['멘즈 라이트 거스트 셔츠 재킷', 'm-shell'],
    ['플란넬 셔켓 - 네이비', 'm-chore'],
    ['Patagonia DOWN SWEATER VEST', 'm-downvest'],
    ['Patagonia DOWN SWEATER JACKET', 'm-down'],
    ['Primaloft Insulated Vest', 'm-downvest'],
    ['유틸리티 니트 베스트 가디건 블랙', 'm-cardigan'],
  ]) {
    assert.equal(productEligible({ name, slot, price: 100000 }), true, name);
    assert.equal(classify(name, 'M'), slot, name);
  }
  assert.equal(
    PRODUCTS.some((p) => p.id === 'ms-7230376'),
    true,
    '실제 구스 다운 조끼 유지',
  );
});

test('PK 소재만으로 라운드 니트·티셔츠를 폴로 셔츠로 만들지 않는다', () => {
  assert.equal(classify('[ITALY] 베이직 라운드 PK 하프 니트', 'M'), 'm-knit');
  assert.equal(classify('PK 라운드 티셔츠', 'M'), 'm-tee');
  assert.equal(
    PRODUCTS.some((p) => p.id === 'ms-6227011'),
    true,
  );
});

test('분류 충돌이 있는 인기 후보는 브랜드별 세 자리에서 유효한 후보를 밀어내지 않는다', () => {
  const rows = [
    { id: 'bad', name: 'JUNGLE CLOTH FATIGUE PANTS BLACK', slot: 'm-field', price: 89000, rating: 5, reviews: 999999 },
    ...['one', 'two', 'three', 'four'].map((id, i) => ({
      id,
      name: '정글 필드 재킷',
      slot: 'm-field',
      price: 90000,
      rating: 4.5,
      reviews: 100 - i,
    })),
  ];
  assert.deepEqual(
    selectBrandProducts(rows).map((p) => p.id),
    ['one', 'two', 'three'],
  );
  assert.equal(rows[0].id, 'bad', '입력 순서는 변경하지 않는다');
});

test('생성 결과는 반복해도 같으며 저장된 모듈·확인 날짜와 일치한다', () => {
  const first = buildProducts(source);
  const second = buildProducts(source);
  assert.deepEqual(first, second);
  assert.equal(
    renderProductsModule(first.list),
    fs.readFileSync(new URL('../src/data/products.js', import.meta.url), 'utf8'),
  );
  assert.equal(first.list.length, CATALOG.count);
  assert.ok(first.list.every(productEligible));
  assert.deepEqual([...new Set(first.list.map((p) => p.checkedAt))].sort(), ['2026-10-13', '2026-10-14']);
});
