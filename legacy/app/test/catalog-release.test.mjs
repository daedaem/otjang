import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PRODUCTS, CATALOG } from '../../../app/lite/src/domain/data/products.js';
import { productEligible, productExclusionReason } from '../../../app/lite/src/domain/catalog-policy.js';
import { classify } from '../tools/catalog/classify.mjs';
import { buildProducts, renderProductsModule, selectBrandProducts, focusProducts } from '../tools/catalog/make-products.mjs';
import { parseCard } from '../tools/catalog/classify.mjs';

const read = (file) => JSON.parse(fs.readFileSync(new URL(`../tools/catalog/${file}`, import.meta.url), 'utf8'));
const source = {
  curation: read('curation.json'),
  snapshot: read('snapshot.json'),
  brandProducts: [...read('brands.json'), ...focusProducts(read('focus.json'), read('raw.json'), parseCard)],
  imageColors: read('image-colors.json'),
  exclude: read('exclude.json'),
  fixes: read('fixes.json'),
  focusCaps: read('focus.json').brands,
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
    fs.readFileSync(new URL('../../../app/lite/src/domain/data/products.js', import.meta.url), 'utf8'),
  );
  assert.equal(first.list.length, CATALOG.count);
  assert.ok(first.list.every(productEligible));
  assert.deepEqual([...new Set(first.list.map((p) => p.checkedAt))].sort(), ['2026-10-13', '2026-10-14']);
});

test('명시적인 코트 형태는 캐시미어 소재를 이유로 니트에 들어가지 않는다', () => {
  const row = source.brandProducts.find((p) => p.id === '4452218');
  assert.ok(row);
  assert.equal(row.slot, 'm-knit', '고정 원문 입력의 오류를 보존해서 검증');
  assert.equal(productExclusionReason(row), 'category-conflict');
  assert.equal(classify(row.name, 'M'), null, '불명확한 코트 종류로 임의 이동하지 않음');
  assert.ok(!buildProducts(source).list.some((p) => p.id === 'ms-4452218'));
  assert.ok(!PRODUCTS.some((p) => p.id === 'ms-4452218'));
  assert.equal(productEligible({ name: '캐시미어 울 코트', slot: 'm-balmacaan', price: 100000 }), true);
  assert.equal(productEligible({ name: 'COATED WORK SHIRT JACKET BLACK', slot: 'm-chore', price: 100000 }), true);
});

test('화이트 운동화 자리는 실제 화이트 색 근거가 있는 상품만 생성한다', () => {
  const red = source.brandProducts.find((p) => p.id === '6192515');
  assert.ok(red);
  assert.equal(red.color, 'red');
  assert.equal(productExclusionReason(red), 'required-color-unverified');
  const result = buildProducts(source);
  const remapped = result.list.find((p) => p.id === 'ms-6192515');
  assert.equal(remapped?.slot, 'm-runner', '유효한 Red 운동화는 일반 운동화 자리로 교정한다');
  assert.equal(remapped.color, 'red');
  assert.equal(remapped.colorSource, 'name');
  assert.equal(remapped.classification, 'correction');
  const white = result.list.filter((p) => p.slot === 'm-white-sneaker');
  assert.ok(white.length);
  assert.ok(white.every((p) => p.color === 'white' && p.colorSource !== 'image'));
  for (const [color, colorSource, eligible] of [['white', 'name', true], ['white', 'curation', true], ['white', 'image', false], ['ivory', 'name', false], ['red', 'name', false], [null, 'image', false]]) {
    assert.equal(productEligible({ name: '레더 스니커즈', slot: 'm-white-sneaker', color, colorSource, price: 70000 }), eligible);
  }
  assert.equal(productEligible({ name: '러닝 스니커즈 Red', slot: 'm-runner', color: 'red', colorSource: 'name', price: 70000 }), true);
});

test('원문에 명확한 신발·수영복·장갑·반바지는 의류 종류에 들어가지 않는다', () => {
  for (const [name, slot, reason] of [
    ['위켄더 옥스포드 3606 - 초콜렛 뮬스키너', 'm-oxford', 'category-conflict'],
    ['STRIPE ONEPIECE SWIMSUIT BLACK', 'f-dress', 'swimwear'],
    ['Grand Mama Hand Knit Gloves (Khaki)', 'f-knit', 'not-garment'],
    ['코튼 치노 드로스트링 쇼트-블랙', 'm-chino', 'shorts'],
    ['숏 팬츠', 'm-chino', 'shorts'],
    ['코튼 하프 팬츠', 'm-chino', 'shorts'],
  ]) {
    assert.equal(productExclusionReason({ name, slot, price: 10000 }), reason, name);
    assert.equal(classify(name, slot.startsWith('f-') ? 'F' : 'M'), name.includes('위켄더') ? 'm-derby' : null, name);
  }
  const weekender = PRODUCTS.filter((p) => /위켄더/.test(p.name));
  assert.equal(weekender.length, 2);
  assert.ok(weekender.every((p) => p.slot === 'm-derby' && p.classification === 'correction'));
  assert.equal(weekender.find((p) => p.id === 'ms-5449884').colorSource, 'image');
  assert.equal(weekender.find((p) => p.id === 'ms-6379376').colorSource, 'name');
  const bootJeans = PRODUCTS.find((p) => p.id === 'ms-5995098');
  assert.equal(bootJeans?.slot, 'f-denim', '부츠 진은 부츠컷 청바지이며 신발이 아니다');
  assert.equal(classify('루즈 부츠 진', 'F'), 'f-denim');
  assert.equal(productExclusionReason({ name: '루즈 부츠 진', slot: 'f-boots', price: 100000 }), 'category-conflict');
});

test('분류 충돌과 별개인 캐릭터 의류·커버업·기능성 카고는 일괄 배제하지 않는다', () => {
  for (const [name, slot] of [
    ['폴로 랄프 로렌 양키스 티셔츠-블루', 'm-tee'],
    ['루니툰즈 스웨트셔츠', 'm-sweat'],
    ['케어베어 코튼 티셔츠', 'f-tee'],
    ['니트 커버업 카디건', 'f-cardigan'],
    ['하이킹 카고 팬츠', 'm-cargo'],
    ['코트 스니커즈 White', 'm-white-sneaker'],
  ])
    assert.equal(productEligible({ name, slot, color: 'white', colorSource: 'name', price: 10000 }), true, name);
  assert.equal(classify('폴로 랄프 로렌 양키스 티셔츠-블루', 'M'), 'm-tee');
  assert.equal(classify('코트 스니커즈 White', 'M'), 'm-white-sneaker');
  assert.equal(productExclusionReason({ name: '감마 AR 팬츠', slot: 'm-chino', price: 10000 }), 'shape-conflict');
  assert.equal(productExclusionReason({ name: '아톰 SL 후디', slot: 'm-hoodie', price: 10000 }), 'shape-conflict');
});

test('편집 상품에도 원문 충돌 검증·수동 교정을 적용하고 출처를 보존한다', () => {
  const snapshot = {
    shoe: { name: '위켄더 옥스포드 - 샌드스톤', price: 100000 },
    red: { name: '트레이너 스니커즈 Red', price: 70000 },
    hidden: { name: '위켄더 옥스포드', price: 100000 },
    removed: { name: '니트 스웨터', price: 50000 },
    licensed: { name: '폴로 랄프 로렌 양키스 티셔츠', price: 50000 },
  };
  const curation = {
    shoe: ['m-oxford', 'beige'], red: ['m-white-sneaker', 'red'],
    hidden: ['m-oxford', 'beige', '베이직 셔츠'], removed: ['m-knit', 'white'],
    licensed: ['m-tee', 'blue'],
  };
  const { list } = buildProducts({ curation, snapshot, fixes: { shoe: { slot: 'm-derby' }, red: { slot: 'm-runner' }, removed: { slot: null } } });
  assert.deepEqual(list.map((p) => [p.id, p.slot, p.colorSource, p.classification]), [
    ['ms-shoe', 'm-derby', 'curation', 'curated'],
    ['ms-red', 'm-runner', 'curation', 'curated'],
    ['ms-licensed', 'm-tee', 'curation', 'curated'],
  ]);
  const { list: corrected } = buildProducts({ curation: { shoe: curation.shoe }, snapshot, fixes: { shoe: { slot: 'm-derby', color: 'brown' } } });
  assert.equal(corrected[0].colorSource, 'correction');
  assert.equal(corrected[0].classification, 'curated');
  const { list: withEvidence } = buildProducts({ brandProducts: [{ id: 'image', name: '스니커즈', slot: 'm-runner', color: 'white', colorSource: 'image', classification: 'reviewed', price: 10000 }] });
  assert.equal(withEvidence[0].colorSource, 'image');
  assert.equal(withEvidence[0].classification, 'reviewed');
});
