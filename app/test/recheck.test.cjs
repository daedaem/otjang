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
  assert.equal(robotsAllows('User-agent: *\nDisallow: /상품/\n', '/%EC%83%81%ED%92%88/1', 'EOUL-recheck/0.1'), false, '인코딩한 한글 경로도 같은 규칙');
  assert.equal(robotsAllows('User-agent: *\nDisallow: /%EC%83%81%ED%92%88/\n', '/상품/1', 'EOUL-recheck/0.1'), false);
});

test('robots.txt 응답: 2xx 는 글, 4xx 는 규칙 없음(허용), 5xx·연결 실패는 건너뜀', async () => {
  const { robotsFrom } = await load();
  assert.equal(robotsFrom(200, 'User-agent: *'), 'User-agent: *'); assert.equal(robotsFrom(404, 'x'), ''); assert.equal(robotsFrom(503, 'x'), null); assert.equal(robotsFrom(null), null);
});

test('읽기: JSON-LD(사이즈별 변형·단일 상품), Shopify, 유니클로 자료에서 가격과 재고만 꺼낸다', async () => {
  const { parseJsonLd, parseShopify, parseUniqlo } = await load();
  const ld = (o) => '<html><script type="application/ld+json">' + JSON.stringify(o) + '</script></html>';
  const g = parseJsonLd(ld({ '@type': 'ProductGroup', hasVariant: [{ color: 'White', size: 'S', offers: { price: 139000, availability: 'https://schema.org/InStock' } }, { color: 'White', size: 'M', offers: { price: 139000, availability: 'https://schema.org/OutOfStock' } }, { color: 'Navy', size: 'L', offers: { price: 139000, availability: 'https://schema.org/InStock' } }] }), 'White');
  assert.deepEqual(g, { price: 139000, inStock: true, sizes: ['S'], currency: null });
  assert.deepEqual(parseJsonLd(ld({ '@type': 'Product', offers: { price: '79000', availability: 'InStock', priceCurrency: 'KRW' } })), { price: 79000, inStock: true, sizes: null, currency: 'KRW' });
  assert.deepEqual(parseJsonLd('<html></html>'), { price: null, inStock: null, sizes: null, currency: null });
  assert.equal(parseJsonLd(ld({ '@type': 'Product', offers: { price: 395000 } })).inStock, null, '재고 표시가 없으면 품절이 아니라 모름');
  assert.equal(parseJsonLd(ld({ '@type': 'ProductGroup', hasVariant: [{ size: 'M', offers: { price: 1 } }] })).sizes, null, '변형에 재고 표시가 없으면 사이즈별 재고도 모름');
  const sh = parseShopify({ variants: [{ option1: 'White', option2: 'Small', price: 2899, available: true }, { option1: 'White', option2: 'X-Large', price: 2899, available: true }, { option1: 'White', option2: 'XS', price: 2899, available: false }, { option1: 'Black', option2: 'M', price: 2899, available: true }] }, 'White');
  assert.deepEqual(sh, { price: 28.99, inStock: true, sizes: ['S', 'XL'] }, 'Small·X-Large 같은 이름은 S·XL 로');
  const uq = parseUniqlo({ result: { l2s: [{ l2Id: 'a', color: { displayCode: '00' }, size: { displayCode: '004' } }, { l2Id: 'b', color: { displayCode: '00' }, size: { displayCode: '005' } }, { l2Id: 'c', color: { displayCode: '09' }, size: { displayCode: '004' } }],
    stocks: { a: { statusCode: 'IN_STOCK' }, b: { statusCode: 'STOCK_OUT' }, c: { statusCode: 'IN_STOCK' } }, prices: { a: { base: { value: 19900 } }, b: { base: { value: 19900 } }, c: { base: { value: 14900 } } } } }, '00');
  assert.deepEqual(uq, { price: 19900, inStock: true, sizes: ['M'] });
});

test('판매처별 읽는 곳: 유니클로는 가격·재고 자료, Shopify 는 상품 JSON, 나머지는 상품 페이지', async () => {
  const { sourceFor } = await load();
  const by = (id) => RAW.products.find((p) => p.id === id);
  assert.equal(sourceFor(by('uniqlo-e455365-white')).kind, 'uniqlo'); assert.match(sourceFor(by('uniqlo-e455365-white')).url, /E455365-000\/price-groups/);
  assert.equal(sourceFor(by('bronson-loopwheel-white')).kind, 'shopify'); assert.match(sourceFor(by('bronson-loopwheel-white')).url, /\.js$/); assert.equal(sourceFor(by('bronson-loopwheel-white')).currency, 'USD');
  assert.equal(sourceFor(by('levis-005gy0000')).kind, 'shopify'); assert.equal(sourceFor(by('levis-005gy0000')).currency, 'KRW');
  assert.equal(sourceFor(by('pottery-ss-classic-white')).kind, 'jsonld');
  assert.equal(sourceFor(by('polo-480590-white')).color, 'White');
});

test('반영: 읽은 값과 그 확인일만 바꾸고(처음 근거는 그대로), 통화·큰 가격 변동·안 맞는 사이즈 이름은 반영하지 않으며, 결과는 검사기를 통과한다', async () => {
  const { applyObservations } = await load();
  const { validate } = await import(pathToFileURL(path.join(__dirname, '../tools/validate-catalog.mjs')).href);
  const obs = [{ id: 'uniqlo-e455365-white', seen: '2026-10-20', price: 17900, currency: 'KRW', inStock: true, sizes: ['S', 'M'], via: 'browser' },
    { id: 'bronson-loopwheel-white', seen: '2026-10-20', price: 30, currency: 'KRW' }, { id: 'nope', seen: '2026-10-20', price: 1, currency: 'KRW' },
    { id: 'pottery-ss-classic-white', seen: '2026-10-20', price: null, inStock: null, currency: 'KRW' }, { id: 'hanes-red-3p-white', seen: '2026-10-20', price: 19000, currency: 'KRW' },
    { id: 'levis-005gy0000', seen: '2026-10-20', price: 47200, currency: 'KRW', inStock: true, sizes: ['Medium', 'Large'] }, { id: 'uniqlo-e422992-white', seen: '2026-10-20', price: 19900, currency: 'KRW', sizes: ['Q1'] },
    { id: 'brooks-bbnpmm5192a', seen: '2026-10-20', inStock: false, currency: 'KRW' }, { id: 'polo-480590-white', seen: '2026-10-20', price: 139000 }];
  const { catalog, changes } = applyObservations(RAW, obs, { today: '2026-10-20' });
  const get = (id) => catalog.products.find((p) => p.id === id), ch = (id) => changes.find((c) => c.id === id);
  const u = get('uniqlo-e455365-white');
  assert.equal(u.price, 17900); assert.deepEqual(u.stock.sizes, ['S', 'M']); assert.equal(u.checkedAt, '2026-10-20'); assert.equal(u.stock.checkedAt, '2026-10-20');
  assert.equal(u.evidence[0].seen, '2026-10-13', '처음 근거(소재·치수를 본 날)는 덮어쓰지 않는다'); assert.ok(u.evidence.some((e) => /^다시 확인: 가격·재고 \(브라우저로 봄\)/.test(e.what) && e.seen === '2026-10-20'));
  assert.equal(u.fabric.comp, '면 100%', '소재는 바꾸지 않는다');
  assert.ok(ch('uniqlo-e455365-white').diff.some((d) => /가격 19900 → 17900/.test(d)));
  assert.equal(get('bronson-loopwheel-white').price, 28.99, '통화가 다르면 반영하지 않는다');
  assert.equal(get('pottery-ss-classic-white').checkedAt, '2026-10-13', '아무것도 못 읽으면 날짜도 그대로'); assert.ok(ch('pottery-ss-classic-white').skipped);
  assert.equal(get('hanes-red-3p-white').price, 29000, '20% 넘는 변동은 --force 없이 반영하지 않는다'); assert.match(ch('hanes-red-3p-white').diff[0], /20% 넘게/);
  assert.equal(applyObservations(RAW, [obs[4]], { force: true, today: '2026-10-20' }).catalog.products.find((p) => p.id === 'hanes-red-3p-white').price, 19000);
  assert.deepEqual(get('levis-005gy0000').stock.sizes, ['M', 'L'], 'Medium·Large 를 판매 사이즈 이름으로');
  assert.deepEqual(get('uniqlo-e422992-white').stock.sizes, RAW.products.find((p) => p.id === 'uniqlo-e422992-white').stock.sizes, '안 맞는 사이즈 이름이면 반영하지 않는다'); assert.ok(ch('uniqlo-e422992-white').skipped);
  const b = get('brooks-bbnpmm5192a'); assert.equal(b.stock.inStock, false); assert.equal(b.stock.checkedAt, '2026-10-20'); assert.equal(b.checkedAt, '2026-10-13', '재고만 읽으면 가격 확인일은 그대로');
  assert.ok(ch('polo-480590-white').skipped, '통화를 모르면 반영하지 않는다');
  assert.equal(RAW.products.find((p) => p.id === 'uniqlo-e455365-white').price, 19900, '원본은 그대로');
  assert.deepEqual(validate(catalog, '2026-10-20').errors, []);
  assert.ok(ch('nope') && ch('nope').skipped, '카탈로그에 없는 id 는 조용히 넘기지 않고 알린다');
});

test('반영 안전장치(5회차): 사이즈가 일부만 맞으면·재고 있음인데 사이즈가 비면·본 날짜가 확인일보다 앞서거나 미래면·관측 줄의 force·숫자 아닌 가격은 반영하지 않고, 같은 상품은 늦게 본 것이 남는다', async () => {
  const { applyObservations } = await load();
  const T = { today: '2026-10-20' }, id = 'uniqlo-e455365-white', base = RAW.products.find((p) => p.id === id);
  const one = (o, opt) => applyObservations(RAW, [Object.assign({ id, currency: 'KRW' }, o)], opt || T);
  let r = one({ seen: '2026-10-20', inStock: true, sizes: ['Small', 'Med', 'Lrg'] });
  assert.ok(r.changes[0].skipped && /일부만 맞아도/.test(r.changes[0].diff[0])); assert.deepEqual(r.catalog.products.find((p) => p.id === id).stock, base.stock);
  r = one({ seen: '2026-10-20', inStock: true, sizes: [] }); assert.ok(r.changes[0].skipped && /재고 사이즈가 비어/.test(r.changes[0].diff[0]));
  r = one({ seen: '2026-09-01', price: 19900 }); assert.ok(r.changes[0].skipped && /되돌리지 않음/.test(r.changes[0].diff[0])); assert.equal(r.catalog.products.find((p) => p.id === id).checkedAt, base.checkedAt);
  r = one({ seen: '2026-10-25', price: 19900 }); assert.ok(r.changes[0].skipped && /미래/.test(r.changes[0].diff[0]));
  r = one({ seen: '2026-10-32', price: 19900 }); assert.ok(r.changes[0].skipped);
  r = one({ seen: '2026-10-20', price: 9900, force: true }); assert.ok(r.changes[0].skipped && /20% 넘게/.test(r.changes[0].diff[0]), '관측 줄 안의 force 는 받지 않는다');
  r = one({ seen: '2026-10-20', price: '19900' }); assert.ok(r.changes[0].skipped && /숫자가 아님/.test(r.changes[0].diff[0]));
  r = applyObservations(RAW, [{ id, currency: 'KRW', seen: '2026-10-19', price: 18900 }, { id, currency: 'KRW', seen: '2026-10-15', price: 17900 }], T);
  const got = r.catalog.products.find((p) => p.id === id); assert.equal(got.price, 18900); assert.equal(got.checkedAt, '2026-10-19', '파일 순서와 상관없이 늦게 본 값이 남는다');
});
