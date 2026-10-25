import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findOwnedCatalog } from '../src/owned-catalog.js';
import { PRODUCTS } from '../../../app/lite/src/domain/data/products.js';
import { productEligible } from '../../../app/lite/src/domain/catalog-policy.js';

const catalog = Object.freeze([
  Object.freeze({ id: 'ms-5755268', brand: '프리즘웍스', name: '베이지 탱커 재킷', price: 500000, slot: 'm-harrington', color: 'beige' }),
  Object.freeze({ id: 'ms-728000', brand: '무신사 스탠다드', name: '베이식 옥스포드 셔츠 [화이트]', price: 33890, slot: 'm-oxford' }),
  Object.freeze({ id: 'ms-854339', brand: '무신사 스탠다드', name: '릴렉스 핏 옥스포드 셔츠 [블루]', price: 33890, slot: 'm-oxford' }),
  Object.freeze({ id: 'ms-3010402', brand: '폴로 랄프 로렌', name: 'W 케이블 니트 코튼 크루넥 카디건 - 화이트', price: 379000, slot: 'f-cardigan' }),
  Object.freeze({ id: 'ms-51', brand: 'Caf\u00e9', name: 'WHITE Jacket', slot: 'm-chore' }),
]);

test('빈 입력과 지원하지 않는 입력 타입은 모든 상품을 펼치지 않는다', () => {
  for (const query of ['', '   ', undefined, null, {}, []]) {
    assert.deepEqual(findOwnedCatalog(query, catalog), { items: [], total: 0, status: 'empty' });
  }
});

test('브랜드와 상품명 토큰은 모두 포함되어야 하며 입력 순서에 관계없이 검색한다', () => {
  const result = findOwnedCatalog('화이트 무신사 셔츠', catalog);
  assert.deepEqual(result.items.map((p) => p.id), ['ms-728000']);
  assert.equal(result.total, 1);
  assert.equal(result.status, 'match');
  assert.equal(findOwnedCatalog('프리즘웍스 화이트', catalog).status, 'no-match');
});

test('NFC 대소문자와 브랜드·상품명의 띄어쓰기 차이는 같은 텍스트로 찾는다', () => {
  for (const query of ['무신사스탠다드 옥스포드셔츠', '  무신사   스탠다드  옥스포드  ']) {
    assert.deepEqual(findOwnedCatalog(query, catalog).items.map((p) => p.id), ['ms-728000', 'ms-854339']);
  }
  assert.deepEqual(findOwnedCatalog('무신사스탠다드베이식옥스포드셔츠', catalog).items.map((p) => p.id), ['ms-728000']);
  assert.deepEqual(findOwnedCatalog('CAFE\u0301 white', catalog).items.map((p) => p.id), ['ms-51']);
});

test('브랜드와 상품명 사이 문장 부호는 AND 검색 구분자로 처리한다', () => {
  for (const query of ['폴로, 카디건', '폴로 / 카디건', '폴로·카디건', '폴로 (카디건)']) {
    assert.deepEqual(findOwnedCatalog(query, catalog).items.map((p) => p.id), ['ms-3010402'], query);
  }
  assert.equal(findOwnedCatalog('프리즘웍스, 화이트', catalog).status, 'no-match', 'all words remain required');
  for (const query of ['...', ',', ' / ', '()']) {
    assert.deepEqual(findOwnedCatalog(query, catalog), { items: [], total: 0, status: 'empty' }, query);
  }
});

test('명시적인 ms 식별자는 정확히 같은 상품만 찾고, 존재하는 숫자 상품 번호를 우선한다', () => {
  for (const query of ['5755268', 5755268, 'ms-5755268', 'MS-5755268']) {
    assert.deepEqual(findOwnedCatalog(query, catalog).items.map((p) => p.id), ['ms-5755268']);
  }
  for (const query of ['575526', 'ms-575526', '05755268', 'ms-999999']) {
    assert.deepEqual(findOwnedCatalog(query, catalog), { items: [], total: 0, status: 'no-match' });
  }
  assert.equal(findOwnedCatalog('ms-999999', [{ id: 'ms-7', brand: '999999', name: '999999' }]).status, 'no-match');
  assert.deepEqual(findOwnedCatalog('728000', [...catalog, { id: 'ms-8', brand: '브랜드', name: '모델 728000' }]).items.map((p) => p.id), ['ms-728000']);
});

test('상품 번호로 없는 숫자는 실제 상품명의 모델 번호를 검색하되 명시적인 ID·주소는 넓히지 않는다', () => {
  const safeProducts = PRODUCTS.filter(productEligible);
  for (const [query, expectedBrand] of [['501', '리바이스'], ['530', '뉴발란스'], ['874', '디키즈']]) {
    assert.ok(!safeProducts.some((p) => p.id === `ms-${query}`), 'the model-number fixture has no exact catalog ID');
    const result = findOwnedCatalog(query, safeProducts, { limit: 1000 });
    assert.equal(result.status, 'match', query);
    assert.ok(result.items.some((p) => p.brand === expectedBrand && p.name.includes(query)), query);
    assert.deepEqual(result.items, safeProducts.filter((p) => `${p.brand} ${p.name}`.includes(query)), query);
    assert.equal(findOwnedCatalog(`ms-${query}`, safeProducts).status, 'no-match', 'explicit IDs stay exact');
    assert.equal(findOwnedCatalog(`https://www.musinsa.com/products/${query}`, safeProducts).status, 'no-match', 'product URLs stay exact');
  }
});

test('무신사 HTTPS의 지원 호스트·경로·443 포트는 정확한 상품 번호로 찾는다', () => {
  for (const query of [
    'https://musinsa.com/products/5755268',
    'https://www.musinsa.com/products/5755268/',
    'https://m.musinsa.com/app/goods/5755268',
    'HTTPS://WWW.MUSINSA.COM:443/products/5755268?source=closet#details',
    ' https://www.musinsa.com/products/5755268 ',
  ]) {
    assert.deepEqual(findOwnedCatalog(query, catalog).items.map((p) => p.id), ['ms-5755268'], query);
  }
  assert.deepEqual(findOwnedCatalog('https://www.musinsa.com/products/999999?name=베이지', catalog), {
    items: [], total: 0, status: 'no-match',
  });
});

test('외부·위장 호스트와 인증정보·비 HTTPS·비 443 포트 링크는 거부한다', () => {
  for (const query of [
    'https://musinsa.com.evil.example/products/5755268',
    'https://evil.musinsa.com/products/5755268',
    'https://www.musinsa.com@evil.example/products/5755268',
    'https://user:password@www.musinsa.com/products/5755268',
    'https://@www.musinsa.com/products/5755268',
    'https://www.musinsa.com:80/products/5755268',
    'https://www.musinsa.com:444/products/5755268',
    'http://www.musinsa.com/products/5755268',
    'ftp://www.musinsa.com/products/5755268',
    'javascript:5755268',
    '//www.musinsa.com/products/5755268',
    'www.musinsa.com/products/5755268',
    'musinsa.com/products/5755268',
    'https://example.com/products/5755268',
    'https://www.%6dusinsa.com/products/5755268',
    'https://www.musinsa.com./products/5755268',
  ]) {
    assert.deepEqual(findOwnedCatalog(query, catalog), { items: [], total: 0, status: 'unsupported-link' }, query);
  }
});

test('백슬래시·제어 문자·정규화될 경로·상품 번호 뒤 텍스트를 링크로 인정하지 않는다', () => {
  for (const query of [
    'https://www.musinsa.com\\products\\5755268',
    'https://www.musinsa.com/other/../products/5755268',
    'https://www.musinsa.com/products/%35%37%35%35%32%36%38',
    'https://www.musinsa.com/products/5755268/extra',
    'https://www.musinsa.com/products/5755268 베이지',
    'https://www.musinsa.com/products/5755268\n',
    'https://www.musinsa.com/products/5755268\t',
    'https://www.musin\u0000sa.com/products/5755268',
    'https://www.musinsa.com/products/5755268\u007f',
  ]) {
    assert.equal(findOwnedCatalog(query, catalog).status, 'unsupported-link', JSON.stringify(query));
  }
});

test('결과 제한 전 전체 수와 원본 순서를 보존하며 상품·배열을 변경하지 않는다', () => {
  const snapshot = structuredClone(catalog);
  const result = findOwnedCatalog('옥스포드', catalog, { limit: 1 });
  assert.equal(result.total, 2);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0], catalog[1]);
  assert.deepEqual(catalog, snapshot);
  assert.deepEqual(findOwnedCatalog('옥스포드', catalog, { limit: 0 }), { items: [], total: 2, status: 'match' });
  assert.equal(findOwnedCatalog('옥스포드', catalog, { limit: -1 }).items.length, 0);
  assert.equal(findOwnedCatalog('옥스포드', catalog, { limit: 1.9 }).items.length, 1);
  assert.equal(findOwnedCatalog('옥스포드', catalog, { limit: NaN }).items.length, 2);
});

test('소유 옷 검색은 예산·성별·계절·추천 스타일 조건을 적용하지 않는다', () => {
  assert.equal(findOwnedCatalog('프리즘웍스', catalog).items[0], catalog[0]);
  assert.equal(findOwnedCatalog('폴로 카디건', catalog).items[0], catalog[3]);
});

test('실제 전체 안전 카탈로그에서 브랜드·상품명·ID 검색을 반복해도 결과가 같다', () => {
  const safeProducts = PRODUCTS.filter(productEligible);
  assert.ok(safeProducts.length > 800);
  const whiteOxford = safeProducts.find((p) => p.id === 'ms-728000');
  assert.ok(whiteOxford);
  const first = findOwnedCatalog('무신사스탠다드 화이트 옥스포드', safeProducts, { limit: 1000 });
  const second = findOwnedCatalog('무신사스탠다드 화이트 옥스포드', safeProducts, { limit: 1000 });
  assert.deepEqual(first, second);
  assert.ok(first.items.includes(whiteOxford));
  assert.equal(findOwnedCatalog('https://www.musinsa.com/products/728000', safeProducts).items[0], whiteOxford);
  assert.deepEqual(first.items, safeProducts.filter((p) => first.items.includes(p)));
});

test('잘못된 카탈로그 입력과 유효하지 않은 행은 예외나 가짜 결과를 만들지 않는다', () => {
  assert.deepEqual(findOwnedCatalog('셔츠', null), { items: [], total: 0, status: 'no-match' });
  assert.deepEqual(findOwnedCatalog('셔츠', [null, {}, { id: 9, name: '셔츠' }]), {
    items: [], total: 0, status: 'no-match',
  });
});
