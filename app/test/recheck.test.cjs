// 재확인 도구(tools/recheck.mjs)의 읽기·반영 시험. 판매처 페이지를 열지 않고, 구조만 흉내 낸 작은 자료로 본다.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const RAW = require('../data/picks.json');
const load = () => import(pathToFileURL(path.join(__dirname, '../tools/recheck.mjs')).href);

test('robots.txt: 막힌 경로는 열지 않고, 더 긴 규칙과 우리 이름의 묶음을 따른다', async () => {
  const { robotsAllows } = await load();
  const txt = 'User-agent: *\nDisallow: /search\nDisallow: /*?sort=\nAllow: /search/help\n\nUser-agent: GPTBot\nDisallow: /\n';
  assert.equal(robotsAllows(txt, '/products/a.js', 'EOUL-recheck/0.1'), true);
  assert.equal(robotsAllows(txt, '/search?q=x', 'EOUL-recheck/0.1'), false);
  assert.equal(robotsAllows(txt, '/search/help', 'EOUL-recheck/0.1'), true, '더 긴 Allow 가 이긴다');
  assert.equal(robotsAllows(txt, '/list?sort=new', 'EOUL-recheck/0.1'), false, '* 와일드카드');
  assert.equal(robotsAllows('User-agent: EOUL-recheck\nDisallow: /\n', '/x', 'EOUL-recheck/0.1'), false, '우리 이름의 묶음');
  assert.equal(robotsAllows('', '/x', 'EOUL-recheck/0.1'), true);
});

test('읽기: JSON-LD(사이즈별 변형·단일 상품), Shopify, 유니클로 자료에서 가격과 재고만 꺼낸다', async () => {
  const { parseJsonLd, parseShopify, parseUniqlo } = await load();
  const ld = (o) => '<html><script type="application/ld+json">' + JSON.stringify(o) + '</script></html>';
  const g = parseJsonLd(ld({ '@type': 'ProductGroup', hasVariant: [{ color: 'White', size: 'S', offers: { price: 139000, availability: 'https://schema.org/InStock' } }, { color: 'White', size: 'M', offers: { price: 139000, availability: 'https://schema.org/OutOfStock' } }, { color: 'Navy', size: 'L', offers: { price: 139000, availability: 'https://schema.org/InStock' } }] }), 'White');
  assert.deepEqual(g, { price: 139000, inStock: true, sizes: ['S'] });
  assert.deepEqual(parseJsonLd(ld({ '@type': 'Product', offers: { price: '79000', availability: 'InStock' } })), { price: 79000, inStock: true, sizes: null });
  assert.deepEqual(parseJsonLd('<html></html>'), { price: null, inStock: null, sizes: null });
  const sh = parseShopify({ variants: [{ option1: 'White', option2: 'S', price: 2899, available: true }, { option1: 'White', option2: 'XS', price: 2899, available: false }, { option1: 'Black', option2: 'M', price: 2899, available: true }] }, 'White');
  assert.deepEqual(sh, { price: 28.99, inStock: true, sizes: ['S'] });
  const uq = parseUniqlo({ result: { l2s: [{ l2Id: 'a', color: { displayCode: '00' }, size: { displayCode: '004' } }, { l2Id: 'b', color: { displayCode: '00' }, size: { displayCode: '005' } }, { l2Id: 'c', color: { displayCode: '09' }, size: { displayCode: '004' } }],
    stocks: { a: { statusCode: 'IN_STOCK' }, b: { statusCode: 'STOCK_OUT' }, c: { statusCode: 'IN_STOCK' } }, prices: { a: { base: { value: 19900 } }, b: { base: { value: 19900 } }, c: { base: { value: 14900 } } } } }, '00');
  assert.deepEqual(uq, { price: 19900, inStock: true, sizes: ['M'] });
});

test('판매처별 읽는 곳: 유니클로는 가격·재고 자료, Shopify 는 상품 JSON, 나머지는 상품 페이지', async () => {
  const { sourceFor } = await load();
  const by = (id) => RAW.products.find((p) => p.id === id);
  assert.equal(sourceFor(by('uniqlo-e455365-white')).kind, 'uniqlo'); assert.match(sourceFor(by('uniqlo-e455365-white')).url, /E455365-000\/price-groups/);
  assert.equal(sourceFor(by('bronson-loopwheel-white')).kind, 'shopify'); assert.match(sourceFor(by('bronson-loopwheel-white')).url, /\.js$/);
  assert.equal(sourceFor(by('levis-005gy0000')).kind, 'shopify');
  assert.equal(sourceFor(by('pottery-ss-classic-white')).kind, 'jsonld');
  assert.equal(sourceFor(by('polo-480590-white')).color, 'White');
});

test('반영: 가격·재고·확인일만 바꾸고(판매 사이즈 밖은 버림), 통화가 다르면 반영하지 않으며, 결과는 검사기를 통과한다', async () => {
  const { applyObservations } = await load();
  const { validate } = await import(pathToFileURL(path.join(__dirname, '../tools/validate-catalog.mjs')).href);
  const obs = [{ id: 'uniqlo-e455365-white', seen: '2026-10-20', price: 14900, currency: 'KRW', inStock: true, sizes: ['S', 'M', 'ZZ'] }, { id: 'bronson-loopwheel-white', seen: '2026-10-20', price: 30, currency: 'KRW' }, { id: 'nope', seen: '2026-10-20', price: 1 }];
  const { catalog, changes } = applyObservations(RAW, obs);
  const u = catalog.products.find((p) => p.id === 'uniqlo-e455365-white');
  assert.equal(u.price, 14900); assert.deepEqual(u.stock.sizes, ['S', 'M']); assert.equal(u.checkedAt, '2026-10-20'); assert.equal(u.evidence[0].seen, '2026-10-20');
  assert.equal(u.fabric.comp, '면 100%', '소재는 바꾸지 않는다');
  assert.ok(changes.find((c) => c.id === 'uniqlo-e455365-white').diff.some((d) => /가격 19900 → 14900/.test(d)));
  assert.equal(catalog.products.find((p) => p.id === 'bronson-loopwheel-white').price, 28.99, '통화가 다르면 반영하지 않는다');
  assert.equal(RAW.products.find((p) => p.id === 'uniqlo-e455365-white').price, 19900, '원본은 그대로');
  assert.deepEqual(validate(catalog, '2026-10-20').errors, []);
});
