// 실행: node --test test/   — 직접 넣는 상품 목록과 그 안에서만 고르는 구매 추천
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const C = require('../src/catalog.js');
const W = require('../src/wardrobe.js');
const J = require('../src/judge.js');
const items = W.migrate(JSON.parse(fs.readFileSync(__dirname + '/../data/sample-wardrobe.json', 'utf8'))).items;
const tpl = W.cleanWardrobe(JSON.parse(fs.readFileSync(__dirname + '/../data/template-ivy.json', 'utf8'))).items;
const P = (o) => Object.assign({ id: 'p-' + o.name, name: o.name, cat: 'top', kind: 'shirt', family: 'white', light: 95, formality: 3, pattern: 'solid', seasons: [] }, o);

test('빈 상품 목록이면 추천도 비어 있다. 지어낸 상품은 없다', () => {
  assert.deepEqual(C.rank(items, [], {}), []);
});

test('추천 결과의 모든 상품은 넣은 목록 안의 것이고, 점수 순서가 흔들리지 않는다', () => {
  const products = [P({ name: '버건디 크루넥 니트', kind: 'knit', family: 'burgundy', light: 30, formality: 2 }), P({ name: '흰 옥스퍼드 셔츠' }), P({ name: '네이비 그래픽 스웻', kind: 'sweat', family: 'navy', light: 18, formality: 1, pattern: 'graphic' }), P({ name: '그레이 슬랙스', cat: 'bottom', kind: 'slacks', family: 'gray', light: 45, formality: 3 })];
  const r = C.rank(items, products, {});
  assert.equal(r.length, 4);
  assert.ok(r.every((x) => products.some((p) => p.id === x.product.id)));
  assert.deepEqual(r.map((x) => x.product.id), C.rank(items, products.slice().reverse(), {}).map((x) => x.product.id), '입력 순서를 바꿔도 같은 순서');
  const knit = r.find((x) => x.product.name === '버건디 크루넥 니트'), white = r.find((x) => x.product.name === '흰 옥스퍼드 셔츠'), sweat = r.find((x) => x.product.name === '네이비 그래픽 스웻');
  assert.equal(r[0].product.name, '버건디 크루넥 니트', '겹치는 옷이 없는 니트가 맨 앞');
  assert.ok(knit.score > sweat.score, '겹치는 옷이 있는 스웻셔츠보다 겹치는 옷 없이 새 조합이 생기는 니트가 앞선다');
  assert.ok(sweat.overlaps.length >= 1 && sweat.cautions.some((c) => c.includes('겹치는 보유 옷')));
  assert.ok(white.added === 3 && white.reasons.some((c) => c.includes('조합이 3개')));
  assert.ok(white.overlaps.some((o) => o.id === 's-ocbd-white' && o.level === 'strong') && white.cautions.some((c) => c.includes('많이 겹치는 보유 옷')), '새 조합이 많아도 겹치는 옷은 그대로 알린다');
  assert.ok(r.every((x) => !/\d+\s?%/.test(x.reasons.concat(x.cautions).join(' '))), '확률 표현이 없다');
});

test('견준 옷장의 빈틈을 채우는 상품은 그 이유가 붙고 점수가 오른다', () => {
  const gaps = J.compareWardrobes(items, tpl).onlyTheirs;
  const knit = P({ name: '네이비 크루넥 니트', kind: 'knit', family: 'navy', light: 18, formality: 2 });
  const r = C.rank(items, [knit], { gaps });
  assert.ok(r[0].gap && r[0].reasons.some((t) => t.includes('자리를 채웁니다')));
  const r2 = C.rank(items, [knit], {});
  assert.equal(r[0].score - r2[0].score, 3);
});

test('가격 확인일이 없거나 14일보다 오래되면 재확인 필요다', () => {
  assert.equal(C.isStale(P({ name: 'a', price: 10000, checkedAt: '2026-10-01' }), '2026-10-12'), false);
  assert.equal(C.isStale(P({ name: 'a', price: 10000, checkedAt: '2026-09-20' }), '2026-10-12'), true);
  assert.equal(C.isStale(P({ name: 'a', price: 10000, checkedAt: '' }), '2026-10-12'), true);
  assert.equal(C.isStale(P({ name: 'a', price: null }), '2026-10-12'), false, '가격이 없으면 재확인 대상이 아니다');
  assert.equal(C.daysSince('2026-10-01', '2026-10-12'), 11);
});

test('상품 파일 정리: 이름 없는 상품은 버리고, 위험한 주소와 긴 글자가 걸러지며, 모르는 파일은 읽지 않는다', () => {
  const c = C.cleanCatalog({ schema: 1, kind: 'catalog', products: [P({ name: '', link: 'javascript:1' }), P({ name: 'x'.repeat(200), link: 'javascript:alert(1)', img: 'javascript:2', price: -5, checkedAt: '어제', note: 'n'.repeat(900) })] });
  assert.equal(c.products.length, 1);
  assert.equal(c.products[0].name.length, 80); assert.equal(c.products[0].link, ''); assert.equal(c.products[0].img, ''); assert.equal(c.products[0].price, null); assert.equal(c.products[0].checkedAt, ''); assert.equal(c.products[0].note.length, 200);
  assert.equal(C.cleanCatalog({ schema: 1, kind: 'wardrobe', products: [] }), null);
  assert.equal(C.cleanCatalog({ schema: 2, kind: 'catalog', products: [] }), null);
});

test('상품을 후보로 넣으면 그 상품의 사진은 확인된 동일 제품이고, 가격·링크·확인일이 함께 간다', () => {
  const p = C.cleanProduct(P({ name: '흰 옥스퍼드 셔츠', brand: '브랜드', code: 'A1', link: 'https://shop.example/a', price: 89000, checkedAt: '2026-10-10' }), 0);
  const c = C.toCandidate(p, '2026-10-12');
  assert.equal(c.status, 'candidate'); assert.equal(c.brand, '브랜드'); assert.equal(c.price, 89000); assert.equal(c.link, 'https://shop.example/a'); assert.equal(c.checkedAt, '2026-10-10');
  assert.equal(c.photo.kind, 'confirmed'); assert.deepEqual(c.product, { brand: '브랜드', name: '흰 옥스퍼드 셔츠', code: 'A1', confirmedAt: '2026-10-12' });
  assert.equal(c.attrSource, 'owner');
  const bare = C.toCandidate(C.cleanProduct(P({ name: '사진도 링크도 없는 상품' }), 0), '2026-10-12');
  assert.equal(bare.photo.kind, 'none'); assert.equal(bare.product, null);
});
