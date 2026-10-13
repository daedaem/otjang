const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../src/discovery');
const W = require('../src/wardrobe');
const today = '2026-10-14';
const allSeasons = W.SEASONS.slice();
const item = (id, cat, kind, extra = {}) => W.cleanItem({ id, name: id, status: 'owned', cat, kind, family: 'navy', light: 18, formality: 2, pattern: 'solid', seasons: allSeasons, attrSource: 'owner-confirmed', ...extra }, 0);
const wardrobe = () => [item('내 줄무늬 셔츠', 'top', 'shirt', { family: 'white', light: 95, pattern: 'stripe' }), item('내 데님', 'bottom', 'denim')];
const product = (id, cat, kind, extra = {}) => {
  const link = 'https://official.example.kr/products/' + id;
  return { id, brand: '검증용 브랜드', name: '검증용 ' + W.KINDS[cat][kind] + ' ' + id, model: 'MODEL-' + id, priceKRW: 49900, checkedAt: today, link, storeName: '검증용 한국 공식몰', cat, kind, family: 'ivory', colorName: '아이보리', light: 90, formality: 2, pattern: 'solid', seasons: allSeasons, editTags: ['fixture'], evidence: [{ url: link, fields: ['brand', 'name', 'model', 'link', 'priceKRW'], observedAt: today }], availability: { status: 'unknown', note: '테스트용 데이터; 실제 판매 상품이 아님' }, ...extra };
};
const catalog = () => [product('shirt', 'top', 'shirt'), product('knit', 'top', 'knit'), product('chino', 'bottom', 'chino', { family: 'beige', light: 70 }), product('slacks', 'bottom', 'slacks', { family: 'gray', light: 35, formality: 3 }), product('jacket', 'outer', 'jacket', { family: 'olive', light: 45 }), product('sneaker', 'shoes', 'sneaker', { family: 'white', light: 95, formality: 1 }), product('loafer', 'shoes', 'loafer', { family: 'brown', light: 25, formality: 3 })];
const recommend = (items = wardrobe(), products = catalog(), options = {}) => D.recommend(items, products, { today, ...options });

test('확인한 옷장에 여러 분류의 실제 브랜드·품명·구매 링크와 보유 옷 근거를 제안한다', () => {
  const mine = wardrobe(), verified = catalog(), r = recommend(mine, verified);
  assert.equal(r.status, 'ready'); assert.equal(r.assessed, 2); assert.equal(r.pending.length, 0);
  assert.equal(r.recommendations.length, 3); assert.ok(new Set(r.recommendations.map(x => x.product.cat)).size >= 2);
  for (const row of r.recommendations) {
    const source = verified.find(p => p.id === row.product.id); assert.ok(source);
    assert.equal(row.product.brand, source.brand); assert.equal(row.product.name, source.name); assert.equal(row.product.link, source.link);
    assert.ok(row.reasons.some(reason => reason.includes('등록된 범위')));
    if (row.matchStatus === 'compatible') {
      assert.ok(row.combinations > 0); assert.ok(row.partners.length > 0);
      assert.ok(row.partners.every(partner => mine.some(owned => owned.id === partner.id)));
      assert.ok(row.outfits.every(outfit => [outfit.top, outfit.bottom, outfit.outer].filter(Boolean).every(piece => mine.some(owned => owned.id === piece.id) || piece.id === row.candidate.id)));
    }
  }
});
test('비교 후보는 확인한 상품의 브랜드·품명·모델 코드·가격·출처를 그대로 보존한다', () => {
  const source = product('jacket', 'outer', 'jacket', { family: 'olive', light: 45 });
  const row = recommend(wardrobe(), [source]).recommendations[0]; assert.ok(row);
  assert.equal(row.candidate.name, source.name); assert.equal(row.candidate.brand, source.brand);
  assert.equal(row.candidate.product.name, source.name); assert.equal(row.candidate.product.code, source.model);
  assert.equal(row.candidate.price, source.priceKRW); assert.equal(row.candidate.checkedAt, source.checkedAt);
  assert.equal(row.candidate.link, source.link); assert.equal(row.candidate.photo.sourceUrl, source.link);
  assert.equal(row.candidate.status, 'candidate'); assert.equal(row.candidate.photo.kind, 'confirmed');
});
test('사진만 등록한 옷에는 이름 있는 탐색 상품만 보여 주고 어울림·조합 수를 만들지 않는다', () => {
  const mine = wardrobe().map(x => ({ ...x, family: null, light: null, pattern: null, formality: null }));
  const r = recommend(mine); assert.equal(r.assessed, 0); assert.equal(r.status, 'needs-confirmation');
  assert.deepEqual(r.recommendations, []); assert.ok(r.explore.length > 0);
  for (const row of r.explore) {
    assert.ok(row.product.brand && row.product.name && row.product.link);
    assert.equal(row.matchStatus, 'needs-confirmation'); assert.equal(row.combinations, null); assert.deepEqual(row.partners, []); assert.deepEqual(row.outfits, []);
  }
});
test('색·무늬 초안은 값이 모두 있어도 조합 근거가 아니다', () => {
  const r = recommend(wardrobe().map(x => ({ ...x, attrSource: 'photo-draft' })));
  assert.equal(r.assessed, 0); assert.deepEqual(r.recommendations, []); assert.ok(r.explore.length);
  assert.ok(r.pending.every(x => x.missing.includes('confirmation')));
});
test('미확인 종류의 상의는 상의 구매를 보류하고 다른 분류는 개별 판단한다', () => {
  const r = recommend([...wardrobe(), item('종류 모를 상의', 'top', null)]);
  assert.ok(r.held.some(x => x.product.cat === 'top'));
  assert.ok(r.recommendations.every(x => x.product.cat !== 'top'));
  assert.ok(r.explore.every(x => x.product.cat !== 'top'));
  assert.ok(r.recommendations.some(x => x.product.cat !== 'top'));
});
test('이미 등록한 같은 종류의 미확인 니트는 중복 추천 대신 확인을 기다린다', () => {
  const r = recommend([...wardrobe(), item('확인 전 니트', 'top', 'knit', { family: null })]);
  assert.ok(r.held.some(x => x.product.kind === 'knit'));
  assert.ok([...r.recommendations, ...r.explore].every(x => x.product.kind !== 'knit'));
  assert.ok(r.recommendations.every(x => x.partners.every(p => p.id !== '확인 전 니트')));
});
test('후보와 처분한 옷은 보유 종류와 추천의 근거에서 제외한다', () => {
  const mine = wardrobe(), r = recommend([...mine, item('살까말까', 'outer', 'jacket', { status: 'candidate' }), item('처분', 'shoes', 'sneaker', { status: 'gone' })]);
  assert.deepEqual(r, recommend(mine));
});
test('종류가 충분하면 색만 달리한 구매를 억지로 권하지 않는다', () => {
  const sources = catalog(), mine = sources.map((p, i) => item('owned-' + i, p.cat, p.kind, { family: p.family, light: p.light, pattern: p.pattern, formality: p.formality }));
  const r = recommend(mine, sources);
  assert.deepEqual(r.recommendations, []); assert.deepEqual(r.explore, []); assert.equal(r.covered.length, sources.length);
});
test('새 상품이 보유 옷과 조합을 만들 수 없으면 구매를 강제하지 않는다', () => {
  const dark = [item('어두운 셔츠', 'top', 'shirt', { formality: 1 }), item('어두운 데님', 'bottom', 'denim', { formality: 1 })];
  const r = recommend(dark, [product('dark-knit', 'top', 'knit', { family: 'navy', light: 18, formality: 3 })]);
  assert.deepEqual(r.recommendations, []); assert.deepEqual(r.explore, []);
});
test('신발은 종류의 빈자리만 표시하고 색 어울림·코디 수·착화감 판정을 만들지 않는다', () => {
  const r = recommend(wardrobe(), [product('sneaker', 'shoes', 'sneaker', { formality: 1 })]);
  assert.equal(r.recommendations.length, 1); const row = r.recommendations[0];
  assert.equal(row.matchStatus, 'kind-gap'); assert.equal(row.combinations, null); assert.deepEqual(row.outfits, []); assert.deepEqual(row.partners, []);
  assert.ok(row.reasons.some(x => x.includes('계산하지 않았')));
});
test('단정한 용도는 캐주얼 상품을 제외하고 보유 더비로 로퍼 역할을 충족한다', () => {
  const mine = [...wardrobe(), item('내 더비', 'shoes', 'derby', { formality: 3 })], r = recommend(mine, catalog(), { purpose: 'smart' });
  assert.ok(r.recommendations.every(x => x.product.formality >= 2));
  assert.ok(r.covered.some(x => x.product.kind === 'loafer')); assert.ok(r.recommendations.every(x => x.product.kind !== 'sneaker' && x.product.kind !== 'loafer'));
});
test('원피스만 등록한 옷장에 상의·하의를 필수품처럼 제안하지 않는다', () => {
  const r = recommend([item('내 원피스', 'dress', 'dress', { family: 'white', light: 95 })]);
  assert.ok([...r.recommendations, ...r.explore].every(x => !['top', 'bottom'].includes(x.product.cat)));
});
test('선택 계절에 맞지 않는 상품과 보유 옷은 조합에서 제외한다', () => {
  const mine = [...wardrobe(), item('겨울용 셔츠', 'top', 'shirt', { family: 'white', light: 95, seasons: ['겨울'] })];
  const sources = [product('winter-knit', 'top', 'knit', { seasons: ['겨울'] }), product('jacket', 'outer', 'jacket', { family: 'olive', light: 45, seasons: ['봄', '가을'] })];
  const r = recommend(mine, sources, { season: '가을' });
  assert.equal(r.assessed, 2); assert.ok(r.recommendations.every(x => x.product.id !== 'winter-knit'));
  assert.ok(r.recommendations.every(x => x.partners.every(p => p.id !== '겨울용 셔츠')));
});
test('비교할 옷의 계절이 미확인이면 같은 종류 추가 추천을 먼저 보류한다', () => {
  const r = recommend([...wardrobe(), item('계절 모를 니트', 'top', 'knit', { seasons: [] })], catalog(), { season: '가을' });
  assert.ok(r.pending.some(x => x.missing.includes('seasons'))); assert.ok(r.held.some(x => x.product.kind === 'knit'));
});
test('상품의 색·무늬·격식이 미확인이면 이름 있는 탐색만 가능하다', () => {
  const r = recommend(wardrobe(), [product('knit', 'top', 'knit', { family: null, light: null, formality: null, pattern: null })]);
  assert.deepEqual(r.recommendations, []); assert.equal(r.explore.length, 1);
  assert.equal(r.explore[0].matchStatus, 'needs-confirmation'); assert.ok(r.explore[0].missing.includes('family'));
});
test('확인한 보유 옷이 선택 계절 밖에만 있으면 새로운 구매 목록을 강제하지 않는다', () => {
  const mine = wardrobe().map(item => ({ ...item, seasons: ['겨울'] }));
  const r = recommend(mine, catalog(), { season: '여름' });
  assert.equal(r.assessed, 0); assert.equal(r.pending.length, 0); assert.deepEqual(r.recommendations, []); assert.deepEqual(r.explore, []);
});
test('계절을 고르지 않았는데 반바지나 겨울 코트 필요성을 임의로 추정하지 않는다', () => {
  const source = [product('winter-coat', 'outer', 'coat', { family: 'olive', light: 45, seasons: ['겨울'] }), product('summer-shorts', 'bottom', 'shorts', { family: 'beige', light: 70, seasons: ['여름'] })];
  assert.deepEqual(recommend(wardrobe(), source).recommendations, []);
  assert.ok(recommend(wardrobe(), source, { season: '겨울' }).recommendations.some(x => x.product.kind === 'coat'));
});
test('잘못된 선택적 편집 주석은 전체 추천 화면을 예외로 중단하지 않는다', () => {
  const annotation = {}; annotation.circular = annotation;
  const p = product('knit', 'top', 'knit', { attrEvidence: annotation });
  const r = D.inspectCatalog([p], { today }); assert.equal(r.products.length, 1); assert.ok(r.issues.some(x => x.field === 'attrEvidence'));
});
test('0원과 가격 미확인은 구별하며 예산 미확인 상품에 가격을 만들어 붙이지 않는다', () => {
  const sources = [product('free-chino', 'bottom', 'chino', { priceKRW: 0, family: 'beige', light: 70 }), product('unknown-knit', 'top', 'knit', { priceKRW: null }), product('expensive-jacket', 'outer', 'jacket', { priceKRW: 100000, family: 'olive', light: 45 })];
  const inspected = D.inspectCatalog(sources, { today }); assert.equal(inspected.products.find(p => p.id === 'free-chino').priceKRW, 0); assert.equal(inspected.products.find(p => p.id === 'unknown-knit').priceKRW, null);
  const r = recommend(wardrobe(), sources, { budget: 50000 });
  assert.ok(r.recommendations.every(x => x.product.id !== 'expensive-jacket'));
  const free = r.recommendations.find(x => x.product.id === 'free-chino'); assert.ok(free); assert.equal(free.candidate.price, 0);
  const unknown = r.recommendations.find(x => x.product.id === 'unknown-knit'); assert.ok(unknown); assert.equal(unknown.candidate.price, null); assert.equal(unknown.budgetMatch, 'unknown'); assert.ok(unknown.cautions.some(x => x.includes('가격 미확인') && x.includes('예산')));
});
test('예산 선택 안 함의 0과 문자열 0은 가격 있는 추천을 모두 제거하지 않는다', () => {
  const sources = catalog();
  assert.deepEqual(recommend(wardrobe(), sources, { budget: 0 }), recommend(wardrobe(), sources));
  assert.deepEqual(recommend(wardrobe(), sources, { budget: '0' }), recommend(wardrobe(), sources));
  assert.ok(recommend(wardrobe(), sources, { budget: 0 }).recommendations.some(x => x.product.priceKRW > 0));
});
test('가격은 확인일 이후 바뀔 수 있음을 오래된 확인 정보에 표시한다', () => {
  const p = product('knit', 'top', 'knit', { checkedAt: '2026-09-01' }); p.evidence[0].observedAt = p.checkedAt;
  const row = recommend(wardrobe(), [p]).recommendations[0]; assert.ok(row.cautions.some(x => x.includes('다시 확인'))); assert.equal(row.product.checkedAt, '2026-09-01');
});
test('브랜드·상품 코드·출처가 없거나 가격 출처 날짜가 다르면 카탈로그에서 거절한다', () => {
  for (const patch of [{ brand: '' }, { model: '' }, { evidence: [] }, { priceKRW: '49900' }, { priceKRW: -1 }]) {
    const r = D.inspectCatalog([product('knit', 'top', 'knit', patch)], { today }); assert.equal(r.products.length, 0); assert.ok(r.issues.length);
  }
  const p = product('knit', 'top', 'knit'); p.evidence[0].observedAt = '2026-10-13';
  const r = D.inspectCatalog([p], { today }); assert.equal(r.products.length, 0); assert.ok(r.issues.some(x => x.reason === 'missing-current-price-proof'));
});
test('잘못된·미래 날짜와 구매 링크·출처 URL은 상품을 추천에 통과시키지 않는다', () => {
  for (const patch of [{ checkedAt: '2026-02-30' }, { checkedAt: '2026-10-15' }, { link: 'javascript:alert(1)' }, { link: 'http://official.example.kr/product' }, { link: 'https://person:secret@official.example.kr/product' }]) {
    const r = D.inspectCatalog([product('knit', 'top', 'knit', patch)], { today }); assert.equal(r.products.length, 0); assert.ok(r.issues.length);
  }
  for (const patch of [{ url: 'javascript:alert(1)' }, { observedAt: '2026-10-15' }, { fields: ['brand', 'name', 'link'] }]) {
    const p = product('knit', 'top', 'knit'); p.evidence[0] = { ...p.evidence[0], ...patch };
    assert.equal(D.inspectCatalog([p], { today }).products.length, 0);
  }
});
test('중복 상품 ID는 둘 다 거절하고 원본 입력이나 순서를 바꾸지 않는다', () => {
  const dup = product('knit', 'top', 'knit'), rows = [dup, { ...dup, name: '다른 품명' }], snapshot = JSON.stringify(rows);
  const r = D.inspectCatalog(rows, { today }); assert.deepEqual(r.products, []); assert.ok(r.issues.some(x => x.reason === 'duplicate-id')); assert.equal(JSON.stringify(rows), snapshot);
  const mine = wardrobe(), source = catalog(), before = JSON.stringify({ mine, source });
  assert.deepEqual(recommend(mine, source), recommend(mine.slice().reverse(), source.slice().reverse()));
  assert.equal(JSON.stringify({ mine, source }), before);
});
test('원본 상품 목록이나 옷장이 없거나 형식이 다르면 구매 추천이 생기지 않는다', () => {
  for (const raw of [null, {}, { products: 'bad' }, { products: [null] }]) { const r = recommend(wardrobe(), raw); assert.deepEqual(r.recommendations, []); assert.deepEqual(r.explore, []); assert.ok(r.catalogIssues.length); }
  const r = recommend([], catalog()); assert.equal(r.status, 'empty'); assert.deepEqual(r.recommendations, []); assert.deepEqual(r.explore, []);
});
test('현재 판매 페이지의 가격 출처가 아닌 다른 페이지의 가격을 채택하지 않는다', () => {
  const p = product('knit', 'top', 'knit'); p.evidence = [
    { url: p.link, observedAt: today, fields: ['brand', 'name', 'model', 'link'] },
    { url: 'https://other.example.kr/search', observedAt: today, fields: ['priceKRW'] },
  ];
  assert.equal(D.inspectCatalog([p], { today }).products.length, 0);
});
test('긴 품명이나 모델 코드가 잘려 다른 상품으로 바뀌지 않도록 검증 단계에서 거절한다', () => {
  for (const patch of [{ name: '가'.repeat(81) }, { model: 'A'.repeat(61) }, { id: 'x'.repeat(41) }]) assert.equal(D.inspectCatalog([product('knit', 'top', 'knit', patch)], { today }).products.length, 0);
});

test('actual official seed preserves editorial attribution and passes strict inspection', () => {
 const seed = require('../data/discovery-products.json'), before = JSON.stringify(seed), result = D.inspectCatalog(seed, { today });
 assert.deepEqual(result.issues, []); assert.equal(result.products.length, seed.products.length);
 assert.equal(result.products.length, 12); assert.equal(new Set(result.products.map(p => p.kind)).size, 9);
 assert.ok(result.products.every(p => p.attrEvidence?.note)); assert.equal(JSON.stringify(seed), before);
 result.products[0].attrEvidence.note = 'changed copy'; assert.equal(JSON.stringify(seed), before);
 const r = D.recommend(wardrobe(), seed, { today, budget: 0 });
 assert.ok(r.recommendations.some(row => row.matchStatus === 'compatible'));
 assert.ok(new Set(r.recommendations.map(row => row.product.cat)).size >= 2);
 assert.ok(r.recommendations.every(row => seed.products.some(p => p.id === row.product.id && p.model === row.candidate.product.code && p.link === row.candidate.link)));
});
test('shoe kind gap does not require unevaluated colors or pattern and does not invent compatibility', () => {
 const shoe = product('loafer', 'shoes', 'loafer', { pattern:null,family:null,light:null,formality:3 });
 const row = recommend(wardrobe(), [shoe], {purpose:'smart'}).recommendations[0]; assert.ok(row);
 assert.equal(row.matchStatus,'kind-gap'); assert.equal(row.combinations,null); assert.deepEqual(row.outfits,[]); assert.deepEqual(row.partners,[]);
 assert.ok(row.reasons.some(text=>text.includes('색 어울림은 계산하지')));
 assert.ok(row.cautions.some(text=>text.includes('재고는 확인되지')));
 const existing=item('내 구두','shoes','derby');const held=recommend([...wardrobe(),existing],[shoe],{purpose:'smart'}); assert.deepEqual(held.recommendations,[]);assert.ok(held.covered.length);
});

test('casual known kind does not falsely cover a smart-use role, pending same kind still protects duplicates', () => {
 const source=product('smart-shirt','top','shirt',{family:'white',light:95,formality:3}), mine=[item('캐주얼 셔츠','top','shirt',{family:'blue',light:70,formality:1}),item('단정한 바지','bottom','slacks',{family:'navy',light:20,formality:3})];
 const r=recommend(mine,[source],{purpose:'smart'});assert.equal(r.covered.length,0);assert.equal(r.recommendations.length,1);assert.match(r.recommendations[0].reasons[0],/편한 차림/);assert.ok(!r.recommendations[0].reasons[0].includes('종류가 없'));
 const held=recommend([...mine,item('확인 전 셔츠','top','shirt',{formality:null})],[source],{purpose:'smart'});assert.deepEqual(held.recommendations,[]);assert.ok(held.held.some(row=>row.items.some(it=>it.id==='확인 전 셔츠')));
});
