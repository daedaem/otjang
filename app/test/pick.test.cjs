// 기준별 추천(Pick)과 검증 카탈로그(data/picks.json)의 시험. 실제 카탈로그와, 값을 바꿔 본 작은 카탈로그를 함께 쓴다.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const P = require('../src/pick.js');
const W = require('../src/wardrobe.js');
const RAW = require('../data/picks.json');
const SAMPLE = W.cleanWardrobe(require('../data/sample-wardrobe.json')).items;
const cat = P.cleanPicks(RAW);
const FAV = ['polo', 'bronson', 'pottery', 'outstanding', 'brooks', 'lvc'];
const TODAY = '2026-10-13';
const rec = (q, c) => P.recommend(SAMPLE, c || cat, Object.assign({ line: 'white-tee', today: TODAY }, q));
const by = (id) => cat.products.find((p) => p.id === id);
const variant = (fn) => { const raw = JSON.parse(JSON.stringify(RAW)); fn(raw); return P.cleanPicks(raw); };

test('카탈로그 검사기: 실제 카탈로그는 오류 없이 통과하고, 앱이 읽을 때 빠지는 상품이 없다', async () => {
  const { validate } = await import(pathToFileURL(path.join(__dirname, '../tools/validate-catalog.mjs')).href);
  const r = validate(RAW, TODAY);
  assert.deepEqual(r.errors, []);
  assert.equal(cat.products.length, RAW.products.length);
  for (const p of cat.products) {
    assert.match(p.store.url, /^https:\/\//, p.id);
    assert.ok(p.evidence.length >= 1 && p.evidence.every((e) => /^https:\/\//.test(e.url) && e.seen), p.id + ' 근거');
    assert.ok(!('img' in p), '상품 사진을 넣지 않는다');
  }
  // 검사기가 잡아야 하는 것들
  const bad = JSON.parse(JSON.stringify(RAW));
  bad.products[0].kind = 'tshirt'; bad.products[1].line = 'white-teee'; bad.products[2].price = 0; bad.products[3].checkedAt = '2027-01-01'; bad.products[4].sizes[0].chest = 530;
  const rb = validate(bad, TODAY).errors.join('\n');
  for (const want of ['모르는 종류', '등록 안 된 품목', '가격 범위 밖', '확인일이 미래', '가슴 너비']) assert.ok(rb.includes(want), want);
});

test('정리: 0원·오타 가격, 모르는 종류·품목, 환율 없는 외화는 받지 않는다', () => {
  const base = RAW.products[0];
  const c = P.cleanPicks(Object.assign({}, RAW, { products: [Object.assign({}, base, { id: 'a', price: 0 }), Object.assign({}, base, { id: 'b', price: 79 }), Object.assign({}, base, { id: 'c', kind: 'tshirt' }), Object.assign({}, base, { id: 'd', line: 'nope' }), Object.assign({}, base, { id: 'e', store: { url: 'javascript:alert(1)' } })] }));
  assert.equal(c.products.length, 0);
  const usd = P.cleanPicks(Object.assign({}, RAW, { products: [Object.assign({}, base, { id: 'f', currency: 'USD', price: 10 })], fx: {} }));
  assert.equal(usd.products.length, 0);
  assert.equal(P.cleanPicks({ schema: 2, kind: 'picks', products: [] }), null);
});

test('품질 근거: 출처 등급으로 가중하고(상품명 0.5, 판매처 설명 0.3), 루프휠과 통짜를 두 번 세지 않는다', () => {
  const bronson = P.qualityOf(by('bronson-loopwheel-white')), brooks = P.qualityOf(by('brooks-bbnpmm5192a')), polo = P.qualityOf(by('polo-480590-white'));
  assert.ok(bronson.parts.some((t) => /루프휠/.test(t)) && !bronson.parts.some((t) => /통짜$/.test(t)), '루프휠이면 통짜 가점을 따로 주지 않는다');
  assert.equal(bronson.score, 3 + 1 + 0.75 + 1.5);
  assert.ok(brooks.parts.some((t) => /수피마 코튼 \(상품명에만\)/.test(t)), '상품명에만 있는 수피마는 그렇게 적는다');
  assert.equal(brooks.score, 3 + 1 + 0.75);
  assert.equal(polo.score, 4);
  const hanes = P.qualityOf(by('hanes-red-3p-white'));
  assert.ok(hanes.parts.some((t) => /통짜 \(판매처 설명\)/.test(t)));
  for (const p of cat.products) { const q = P.qualityOf(p); assert.ok(q.score >= 3 && q.score <= 10 && q.known <= q.of, p.id); }
});

test('가성비: 품목의 고정 기준선이라 순위 밖 상품을 빼도 1등이 바뀌지 않는다(엔지니어 재현 입력 포함)', () => {
  const qs = [
    { priorities: ['value'], use: 'layer', sleeve: 'any', brands: FAV, styles: ['american-classic'] },
    { priorities: ['value'], use: 'any', sleeve: 'any' }, { priorities: ['quality', 'value'], use: 'layer', sleeve: 'short', brands: FAV },
    { priorities: ['brand', 'quality'], use: 'layer', sleeve: 'short', brands: FAV, size: 'M' }, { priorities: ['fit'], use: 'any', sleeve: 'short', ref: { chest: 53, length: 70, shoulder: 45 } },
  ];
  for (const q of qs) {
    const r = rec(q), pickId = r.pick.product.id;
    for (const p of cat.products) {
      if (p.id === pickId) continue;
      const c = variant((raw) => { raw.products = raw.products.filter((x) => x.id !== p.id); });
      assert.equal(rec(q, c).pick.product.id, pickId, JSON.stringify(q) + ' 에서 ' + p.id + ' 를 빼면 1등이 바뀜');
    }
  }
});

test('꼭 지킬 조건: 카디건 안에(로고 안 보이게·얇게·목 립 좁게)를 어긴 것이 확인된 상품은 1등·대안에서 빠지고 이유가 남는다', () => {
  const r = rec({ priorities: ['brand', 'quality'], use: 'layer', sleeve: 'short', brands: FAV, styles: ['american-classic', 'amekaji'], size: 'M' });
  const isFail = (row) => row.conds.some((c) => c.status === 'fail');
  assert.ok(!isFail(r.pick) && r.alts.every((a) => !isFail(a.r)));
  assert.notEqual(r.pick.product.logo, 'chest'); assert.notEqual(r.pick.product.logo, 'small-chest'); assert.notEqual(r.pick.product.fabric.thick, 'thick');
  assert.ok(r.notes.some((n) => n.kind === 'out' && /브룩스|폴로|브론슨/.test(n.text)), '점수가 더 높았지만 뺀 상품을 알린다');
  assert.ok(r.pick.checks.some((c) => c.mark === 'unknown'), '모르는 조건은 ?로 남긴다');
  // 로고 조건을 끄면 작은 로고 상품도 후보가 된다
  const r2 = rec({ priorities: ['brand', 'quality'], use: 'layer', conds: ['thin', 'narrowNeck'], sleeve: 'short', brands: FAV, size: 'M' });
  assert.ok(r2.eligible.some((x) => x.product.id === 'brooks-bbnpmm5192a'));
  // 한 장으로 입을 티: 얇은 것이 확인되면 뺀다
  const solo = rec({ priorities: ['quality'], use: 'solo', sleeve: 'short' });
  assert.notEqual(solo.pick.product.fabric.thick, 'thin');
});

test('기본 용도는 "상관없음"이고, 그때는 조건이 없다', () => {
  assert.deepEqual(P.activeConds({}), []);
  const r = rec({ priorities: [] });
  assert.equal(r.use, 'any'); assert.equal(r.pick.conds.length, 0);
});

test('품절·판매 안 하는 사이즈를 구분한다(엔지니어 재현 입력)', () => {
  const bronson = by('bronson-loopwheel-white');
  const xs = P.fitOf(bronson, { size: 'XS' });
  assert.equal(xs.avail, false); assert.match(xs.text, /XS 사이즈는 팔지 않아요/);
  const soft = by('polo-630376-white');
  assert.equal(P.fitOf(soft, { size: 'M' }).avail, false); assert.match(P.fitOf(soft, { size: 'M' }).text, /M 품절/);
  assert.equal(P.fitOf(soft, { size: 'XXL' }).avail, true);
  assert.equal(P.fitOf(soft, { size: '115' }).avail, true, '115 = XXL');
  // 상품 전체가 품절이면 1등이 될 수 없다
  const c = variant((raw) => { const b = raw.products.find((x) => x.id === 'hanes-red-3p-white'); b.stock.inStock = false; });
  const r = rec({ priorities: ['value'], use: 'any', sleeve: 'any' }, c);
  assert.notEqual(r.pick.product.id, 'hanes-red-3p-white');
  assert.ok(r.ranked.find((x) => x.product.id === 'hanes-red-3p-white').out.includes('품절'));
  // 사이즈 이름이 1~5인 포터리는 판매처 옵션 표기(2 = M)로 평소 사이즈를 고른다
  const pot = P.fitOf(by('pottery-ss-classic-white'), { size: 'M' });
  assert.equal(pot.size, '2'); assert.match(pot.meas, /2\(M\): 가슴단면 54\.5/);
});

test('내 핏: 실측과 가장 가까운 사이즈와 차이(cm), 공개 치수가 하나뿐이고 많이 다르면 고르지 않는다', () => {
  const f = P.fitOf(by('uniqlo-e422992-white'), { ref: { chest: 53.5, length: 69, shoulder: 46 } });
  assert.equal(f.size, 'M'); assert.match(f.text, /가슴 −0\.5cm/);
  const far = P.fitOf(by('polo-480590-white'), { ref: { chest: 59, length: 76, shoulder: 52 } });
  assert.equal(far.size, ''); assert.match(far.text, /공개 치수가 M뿐이라 정확히 고를 수 없어요/);
  const none = P.fitOf(by('bronson-loopwheel-white'), { ref: { chest: 53 } });
  assert.equal(none.size, ''); assert.match(none.text, /치수표가 없어/);
});

test('해외 상품: 배송비를 알면 한 장 값에 넣고, 모르면 가성비를 중간으로 본다', () => {
  const b = by('bronson-loopwheel-white');
  const u = P.unitPrice(b, cat);
  assert.equal(u.landed, true); assert.equal(u.krw, Math.round((28.99 + 6.99) * cat.fx.USD.krw));
  const c = variant((raw) => { delete raw.products.find((x) => x.id === 'bronson-loopwheel-white').shipping; });
  const r = rec({ priorities: ['value'], use: 'any', sleeve: 'any' }, c);
  const row = r.ranked.find((x) => x.product.id === 'bronson-loopwheel-white');
  assert.ok(row.crit.value <= 0.5 && row.cautions.some((t) => /배송비·관세를 몰라/.test(t)));
  const h = P.unitPrice(by('hanes-red-3p-white'), cat);
  assert.equal(h.krw, 29000 / 3, '3장 묶음은 한 장 값으로 견준다');
});

test('오래된 가격: 14일이 지나면 가성비를 중간으로, 30일이 지나면 1등 후보에서 뺀다. 미래 확인일도 뺀다', () => {
  const late = rec({ priorities: ['value'], use: 'any', sleeve: 'any', today: '2026-11-05' });
  assert.ok(late.ranked.every((x) => x.stale && x.crit.value === 0.5));
  const gone = rec({ priorities: ['value'], use: 'any', sleeve: 'any', today: '2026-12-01' });
  assert.equal(gone.pick, null); assert.ok(gone.ranked.every((x) => /일이 지나/.test(x.out)));
  const c = variant((raw) => { raw.products.find((x) => x.id === 'hanes-red-3p-white').checkedAt = '2026-12-31'; });
  assert.ok(/미래/.test(rec({ priorities: ['value'] }, c).ranked.find((x) => x.product.id === 'hanes-red-3p-white').out));
});

test('좋아하는 브랜드의 빈자리: 품목에 아예 없는 브랜드와 이 소매에만 없는 브랜드를 나눠 말한다(긴팔 오표시 수정)', () => {
  const r = rec({ priorities: ['brand'], use: 'any', sleeve: 'long', brands: FAV });
  assert.ok(r.notes.some((n) => n.kind === 'sleeve' && /폴로/.test(n.text) && /긴팔 상품은 목록에 없어요/.test(n.text)));
  assert.ok(r.notes.some((n) => n.kind === 'missing' && /LVC/.test(n.text)) && r.notes.some((n) => n.kind === 'missing' && /아웃스탠딩/.test(n.text)));
  assert.ok(!r.notes.some((n) => /폴로/.test(n.text) && n.kind === 'missing'));
});

test('대안 둘: 서로 다르고, 이름이 겹치지 않으며, 1등과의 한 장 값 차이를 붙인다. 가성비 1순위면 두 배 넘게 비싼 대안은 없다', () => {
  const qs = [{ priorities: ['brand', 'quality'], use: 'layer', sleeve: 'short', brands: FAV, size: 'M' }, { priorities: ['value'], use: 'layer', sleeve: 'any' }, { priorities: ['quality'], use: 'any', sleeve: 'short' }, { priorities: ['brand'], use: 'any', sleeve: 'short', brands: ['polo'] }];
  for (const q of qs) {
    const r = rec(q);
    assert.ok(r.alts.length <= 2 && new Set(r.alts.map((a) => a.r)).size === r.alts.length && r.alts.every((a) => a.r !== r.pick));
    assert.equal(new Set(r.alts.map((a) => a.label)).size, r.alts.length, '대안 이름이 겹친다: ' + r.alts.map((a) => a.label));
    for (const a of r.alts) assert.match(a.delta, /^[+−±][\d,]+원/);
    if (q.priorities[0] === 'value') assert.ok(r.alts.every((a) => a.r.unit.krw <= r.pick.unit.krw * 2));
  }
});

test('결론 한 문장과 체크 목록: 고른 기준 순서대로, 조건은 확인/모름으로 표시한다', () => {
  const r = rec({ priorities: ['brand', 'quality'], use: 'layer', sleeve: 'short', brands: FAV, size: 'M' });
  assert.match(r.pick.conclusion, /요\./);
  assert.ok(!/은\(는\)|이\(가\)|을\(를\)/.test(r.pick.conclusion), '한글 낱말 뒤 조사는 받침에 맞춘다');
  const labels = r.pick.checks.map((c) => c.label);
  assert.ok(labels.indexOf('로고 안 보이게') >= 0 && labels.indexOf('브랜드 1순위') > labels.indexOf('목 립 좁게') && labels.indexOf('품질(소재·봉제) 2순위') > labels.indexOf('브랜드 1순위'));
  assert.match(r.rank.text, /조건에 맞는 \d+개 중 1위/);
});

test('옷장과의 조합과 후보로 넣기: 1등·대안에 새 조합 수, 후보에는 판매처 링크·원화 가격·확인일, 사진 없음. 같은 입력이면 같은 결과', () => {
  const r = rec({ priorities: ['value'], use: 'layer', sleeve: 'short' });
  for (const row of [r.pick].concat(r.alts.map((a) => a.r))) assert.ok(row.closet && typeof row.closet.added === 'number' && row.closet.top3.every((c) => c.top.status === 'candidate'));
  const c = P.toCandidate(by('bronson-loopwheel-white'), cat, TODAY);
  assert.equal(c.status, 'candidate'); assert.equal(c.link, by('bronson-loopwheel-white').store.url); assert.equal(c.price, Math.round(28.99 * cat.fx.USD.krw)); assert.equal(c.photo.kind, 'none');
  const a = rec({ priorities: ['quality', 'brand'], use: 'layer', sleeve: 'any', brands: FAV }), b = rec({ priorities: ['quality', 'brand'], use: 'layer', sleeve: 'any', brands: FAV });
  assert.deepEqual(a.ranked.map((x) => [x.product.id, x.total]), b.ranked.map((x) => [x.product.id, x.total]));
});
