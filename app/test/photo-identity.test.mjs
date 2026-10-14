import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suggestPhotoIdentity } from '../src/photo-identity.js';
import { PRODUCTS } from '../src/data/products.js';

const identityFixtures = [
  { id: 'ms-101', brand: 'ALPHA', name: 'Ridge Oxford Shirt [White]', slot: 'm-oxford', color: 'white', colorSource: 'name', price: 30000, url: 'https://www.musinsa.com/products/101' },
  { id: 'ms-102', brand: 'ALPHA', name: 'Ridge Oxford Shirt [Blue]', slot: 'm-oxford', color: 'blue', colorSource: 'name', price: 31000, url: 'https://www.musinsa.com/products/102' },
  { id: 'ms-103', brand: 'ALPHA', name: 'River Cable Sweater [Navy]', slot: 'm-knit', color: 'navy', colorSource: 'name', price: 40000, url: 'https://www.musinsa.com/products/103' },
  { id: 'ms-104', brand: 'BETA', name: 'Ridge Oxford Shirt [White]', slot: 'm-oxford', color: 'white', colorSource: 'name', price: 30000, url: 'https://www.musinsa.com/products/104' },
  { id: 'ms-105', brand: 'ALPHA', name: 'River Cable Sweater [Navy]', slot: 'f-knit', color: 'navy', colorSource: 'name', price: 40000, url: 'https://www.musinsa.com/products/105' },
];

test('no OCR and garbled text produce no invented brand or item identity', () => {
  for (const text of ['', null, undefined, {}, 'ㅁㄴㅇㅁ !@@ 2013 728000']) {
    const result = suggestPhotoIdentity(text);
    assert.equal(result.brands.length, 0);
    assert.equal(result.candidates.length, 0);
    assert.equal(result.identityConfirmed, false);
    assert.equal(result.requiresConfirmation, true);
  }
});

test('kind and color alone never manufacture a brand or catalog product', () => {
  const result = suggestPhotoIdentity('흰색 옥스포드 셔츠', { kind: 'shirt', color: 'white', gender: 'M' });
  assert.deepEqual(result.brands, []);
  assert.deepEqual(result.candidates, []);
  assert.equal(result.status, 'no-match');
});

test('actual catalog brand aliases support a logo read while preserving uncertainty', () => {
  const result = suggestPhotoIdentity('PATAGONIA\n100% COTTON\nMADE IN VIETNAM', { kind: 'tee', gender: 'M' });
  assert.deepEqual(result.brands, [{ brand: '파타고니아', evidence: 'patagonia', source: 'ocr-text' }]);
  assert.ok(result.candidates.length);
  assert.ok(result.candidates.every((candidate) => candidate.brand === '파타고니아' && candidate.match === 'brand-and-kind'));
  assert.ok(result.candidates.every((candidate) => !candidate.exact && !candidate.identityConfirmed));
});

test('brand substrings and common single-word mentions are not recognized as labels', () => {
  const catalog = [...identityFixtures, { ...identityFixtures[0], id: 'ms-200', brand: '리' }];
  for (const text of ['ALPHABET', 'preALPHApost', '거리에서 찍은 사진', 'Please see Lee about cotton care']) {
    const result = suggestPhotoIdentity(text, { products: catalog, kind: 'shirt' });
    assert.equal(result.brands.length, 0, text);
  }
  const lee = suggestPhotoIdentity('LEE\n100% COTTON', { products: catalog, kind: 'shirt' });
  assert.equal(lee.brands[0]?.brand, '리');
});

test('generic POLO and NB text do not identify Ralph Lauren or New Balance', () => {
  assert.deepEqual(suggestPhotoIdentity('POLO\nNB\nL', { kind: 'polo' }).brands, []);
});

test('long visible brand names suppress the nested parent brand', () => {
  const result = suggestPhotoIdentity('MUSINSA STANDARD WOMAN\n100% COTTON', { gender: 'F', kind: 'tee' });
  assert.deepEqual(result.brands.map((brand) => brand.brand), ['무신사 스탠다드 우먼']);
  assert.ok(result.candidates.every((candidate) => candidate.brand === '무신사 스탠다드 우먼'));
});

test('explicit brand plus unique full product text can match catalog text, but still requires confirmation', () => {
  const result = suggestPhotoIdentity('ALPHA\nRidge Oxford Shirt [White]', { products: identityFixtures });
  const match = result.candidates.find((candidate) => candidate.productId === 'ms-101');
  assert.equal(match?.exact, true);
  assert.equal(match.match, 'brand-and-name');
  assert.deepEqual(match.evidence, ['alpha', 'Ridge Oxford Shirt [White]']);
  assert.equal(match.identityConfirmed, false);
  assert.equal(result.requiresConfirmation, true);
});

test('real catalog full product text and visible brand are matched without fuzzy identity guessing', () => {
  const product = PRODUCTS.find((p) => p.id === 'ms-6839150');
  const result = suggestPhotoIdentity(`PATAGONIA\n${product.name}`);
  assert.equal(result.candidates.find((candidate) => candidate.productId === product.id)?.exact, true);
  const noBrand = suggestPhotoIdentity(product.name);
  assert.equal(noBrand.candidates.length, 0);
});

test('generic full names cannot claim an exact product even with a brand', () => {
  const catalog = [{ ...identityFixtures[0], name: '옥스포드 셔츠' }];
  const result = suggestPhotoIdentity('ALPHA\n옥스포드 셔츠', { products: catalog });
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].exact, false);
});

test('duplicate full names remain uncertain even if filters or limit expose only one entry', () => {
  const result = suggestPhotoIdentity('ALPHA\nRiver Cable Sweater [Navy]', {
    products: identityFixtures, gender: 'M', kind: 'knit', color: 'navy', limit: 1,
  });
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].productId, 'ms-103');
  assert.equal(result.candidates[0].exact, false);
});

test('multiple observed brands remain ambiguous, rather than silently selecting one', () => {
  const result = suggestPhotoIdentity('ALPHA\nBETA\nRidge Oxford Shirt [White]', { products: identityFixtures });
  assert.equal(result.status, 'ambiguous');
  assert.deepEqual(result.brands.map((brand) => brand.brand), ['ALPHA', 'BETA']);
  assert.ok(result.candidates.length > 1);
  assert.ok(result.candidates.every((candidate) => !candidate.exact));
});

test('a valid catalog product URL is an explicit text match; arbitrary numbers and spoof hosts are not', () => {
  const valid = suggestPhotoIdentity('https://m.musinsa.com/app/goods/101?utm_source=test).', { products: identityFixtures });
  assert.equal(valid.candidates.length, 1);
  assert.equal(valid.candidates[0].match, 'product-link');
  assert.equal(valid.candidates[0].exact, true);
  assert.deepEqual(valid.candidates[0].evidence, ['https://www.musinsa.com/products/101']);
  for (const text of ['101', 'STYLE: 101', 'https://musinsa.com.evil.example/products/101', 'https://user@musinsa.com/products/101', 'https://musinsa.com:8443/products/101']) {
    assert.equal(suggestPhotoIdentity(text, { products: identityFixtures }).candidates.length, 0, text);
  }
});

test('URL evidence contradicting an observed brand or confirmed kind remains an explicit conflict', () => {
  const brandConflict = suggestPhotoIdentity('BETA\nhttps://www.musinsa.com/products/101', { products: identityFixtures });
  assert.equal(brandConflict.status, 'conflict');
  assert.equal(brandConflict.candidates[0].exact, false);
  assert.deepEqual(brandConflict.candidates[0].conflicts, ['brand-text']);
  const kindConflict = suggestPhotoIdentity('https://www.musinsa.com/products/101', { products: identityFixtures, kind: 'knit' });
  assert.equal(kindConflict.status, 'conflict');
  assert.equal(kindConflict.candidates[0].exact, false);
  assert.deepEqual(kindConflict.candidates[0].conflicts, ['kind']);
});

test('unknown external brand label is retained as text without fabricating catalog membership', () => {
  const result = suggestPhotoIdentity('브랜드: 내 동네 디자이너\nSTYLE 728000\n100% cotton');
  assert.equal(result.status, 'unknown-brand');
  assert.equal(result.unknownBrandText, '내 동네 디자이너');
  assert.deepEqual(result.brands, []);
  assert.deepEqual(result.candidates, []);
  const unknownLink = suggestPhotoIdentity('https://www.musinsa.com/products/999999999999', { products: identityFixtures });
  assert.deepEqual(unknownLink.candidates, []);
  assert.deepEqual(unknownLink.unresolvedProductLinks, ['https://www.musinsa.com/products/999999999999']);
});

test('confirmed category and color constrain candidates without inventing evidence for image-curated color', () => {
  const result = suggestPhotoIdentity('ALPHA', { products: identityFixtures, kind: 'shirt', gender: 'M', color: 'white' });
  assert.deepEqual(result.candidates.map((candidate) => candidate.productId), ['ms-101']);
  assert.equal(result.candidates[0].match, 'brand-and-kind');
  assert.equal(result.candidates[0].exact, false);
  const imageColor = suggestPhotoIdentity('ALPHA', {
    products: [{ ...identityFixtures[0], color: 'blue', colorSource: 'image' }], kind: 'shirt', color: 'white',
  });
  assert.equal(imageColor.candidates.length, 1);
  assert.equal(imageColor.candidates[0].exact, false);
});

test('OCR evidence is bounded and the supplied catalog is not mutated', () => {
  const before = JSON.stringify(identityFixtures);
  const result = suggestPhotoIdentity(`${'x'.repeat(1200)}\nALPHA`, { products: identityFixtures, kind: 'shirt', limit: 999 });
  assert.equal(result.rawText.length, 1200);
  assert.equal(result.textTruncated, true);
  assert.deepEqual(result.brands, []);
  assert.equal(JSON.stringify(identityFixtures), before);
  const matched = suggestPhotoIdentity('ALPHA\nRidge Oxford Shirt [White]', { products: identityFixtures });
  matched.candidates[0].product.brand = 'mutated';
  assert.equal(JSON.stringify(identityFixtures), before);
});
