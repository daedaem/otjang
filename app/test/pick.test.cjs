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
const FOUNDER = { priorities: ['brand', 'quality'], use: 'layer', sleeve: 'short', brands: FAV, styles: ['american-classic', 'amekaji'], size: 'M' };
// 조건 격자: 기준 순서·용도·브랜드·스타일·사이즈·예산을 섞은 질문들(속성 시험에 쓴다)
function grid() {
  const pris = [[], ['value'], ['quality'], ['brand'], ['fit'], ['style'], ['brand', 'quality'], ['quality', 'value'], ['value', 'quality'], ['fit', 'value'], ['brand', 'value', 'quality']];
  const out = [];
  for (const priorities of pris) for (const use of ['any', 'layer', 'solo']) for (const brands of [[], FAV, ['uniqlo']]) for (const extra of [{}, { size: 'M' }, { ref: { chest: 53, length: 69, shoulder: 46 } }, { size: 'XS', ref: { chest: 47 } }, { budget: 30000 }]) {
    for (const sleeve of ['short', 'any']) out.push(Object.assign({ priorities, use, brands, sleeve, styles: brands.length ? ['american-classic'] : [] }, extra));
  }
  return out;
}

test('카탈로그 검사기: 실제 카탈로그는 오류 없이 통과하고, 조용히 바뀌는 값·오래된 값·잘못된 날짜를 잡는다', async () => {
  const { validate } = await import(pathToFileURL(path.join(__dirname, '../tools/validate-catalog.mjs')).href);
  const r = validate(RAW, TODAY);
  assert.deepEqual(r.errors, []);
  assert.equal(cat.products.length, RAW.products.length);
  for (const p of cat.products) {
    assert.match(p.store.url, /^https:\/\//, p.id);
    assert.ok(p.evidence.length >= 1 && p.evidence.every((e) => /^https:\/\//.test(e.url) && e.seen), p.id + ' 근거');
    assert.ok(!('img' in p), '상품 사진을 넣지 않는다');
  }
  const bad = JSON.parse(JSON.stringify(RAW));
  bad.products[0].kind = 'tshirt'; bad.products[1].line = 'white-teee'; bad.products[2].price = 0; bad.products[3].checkedAt = '2027-01-01'; bad.products[4].sizes[0].chest = 530;
  bad.products[5].sizes[0].length = '67.5'; bad.products[6].checkedAt = '2026-10-32'; bad.products[7].fabric.compSrc = undefined; bad.products[7].fabric.cotton100 = true;
  bad.products[8].stock.inStock = 'false'; bad.products[9].fabric.thickSrc = 'user'; bad.products[10].shipping = { fee: 6.99, currency: 'USD' };
  const rb = validate(bad, TODAY).errors.join('\n');
  for (const want of ['모르는 종류', '등록 안 된 품목', '가격 범위 밖', '확인일이 미래', '가슴 너비', 'length 는 숫자여야', '실제 날짜가 아님', '혼용률에는 출처', 'inStock 은 true|false', '직접 입력 출처', '배송비 통화']) assert.ok(rb.includes(want), want);
  const old = validate(RAW, '2026-11-20').errors;
  assert.ok(old.length === RAW.products.length && old.every((x) => /\[만료\]/.test(x)), '30일이 지나면 [만료] 오류로 빌드를 막는다');
});

test('정리: 0원·오타 가격, 모르는 종류·품목, 환율 없는 외화, 없는 날짜, 사전의 기본 속성 이름은 받지 않는다', () => {
  const base = RAW.products[0];
  const c = P.cleanPicks(Object.assign({}, RAW, { products: [Object.assign({}, base, { id: 'a', price: 0 }), Object.assign({}, base, { id: 'b', price: 79 }), Object.assign({}, base, { id: 'c', kind: 'tshirt' }), Object.assign({}, base, { id: 'd', line: 'nope' }), Object.assign({}, base, { id: 'e', store: { url: 'javascript:alert(1)' } }),
    Object.assign({}, base, { id: 'f', checkedAt: '2026-10-32' }), Object.assign({}, base, { id: 'g', kind: 'constructor' }), Object.assign({}, base, { id: 'h', line: 'constructor' }), Object.assign({}, base, { id: 'i', cat: 'toString' })] }));
  assert.equal(c.products.length, 0);
  const usd = P.cleanPicks(Object.assign({}, RAW, { products: [Object.assign({}, base, { id: 'f', currency: 'USD', price: 10 })], fx: {} }));
  assert.equal(usd.products.length, 0);
  assert.equal(P.cleanPicks({ schema: 2, kind: 'picks', products: [] }), null);
  const odd = P.cleanPickProduct(Object.assign({}, base, { id: 'j', styles: ['constructor', 'preppy'], fit: 'toString', logo: '__proto__' }));
  assert.deepEqual(odd.styles, ['preppy']); assert.equal(odd.fit, null); assert.equal(odd.logo, null);
  assert.equal(P.brandName(cat, 'constructor'), 'constructor', '없는 브랜드 열쇠는 글자 그대로');
  const r = rec({ priorities: ['brand', 'constructor', 'toString'], use: 'constructor', brands: ['constructor'], styles: ['toString'], sleeve: 'short' });
  assert.equal(r.use, 'any'); assert.deepEqual(r.priorities, ['brand']);
  assert.ok(r.pick && !/function|undefined/.test(r.pick.conclusion + r.pick.checks.map((x) => x.text).join(' ')));
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

test('순위 안정: 고정 기준선과 고정 1순위 문턱이라, 순위 밖 상품을 빼도 1등이 바뀌지 않는다(조건 격자)', () => {
  const qs = grid().filter((_, i) => i % 7 === 0);
  let checked = 0;
  for (const q of qs) {
    const r = rec(q); if (!r.pick) continue;
    const pickId = r.pick.product.id;
    for (const p of cat.products) {
      if (p.id === pickId) continue;
      const c = variant((raw) => { raw.products = raw.products.filter((x) => x.id !== p.id); });
      assert.equal(rec(q, c).pick.product.id, pickId, JSON.stringify(q) + ' 에서 ' + p.id + ' 를 빼면 1등이 바뀜'); checked++;
    }
  }
  assert.ok(checked > 1000, '확인한 경우 ' + checked);
});

test('꼭 지킬 조건: 확인된 어김은 빼고, 약한 근거(판매처 설명·사진)는 ◐·!로 나눈다. 모르는 것은 ?', () => {
  const r = rec(FOUNDER);
  const isFail = (row) => row.conds.some((c) => c.status === 'fail');
  assert.ok(!isFail(r.pick) && r.alts.every((a) => !isFail(a.r)));
  assert.equal(r.pick.product.id, 'pottery-ss-classic-white');
  const thin = r.pick.conds.find((c) => c.key === 'thin');
  assert.equal(thin.status, 'weak', '판매처 설명의 "얇음"은 약한 확인'); assert.match(thin.text, /판매처 설명/);
  assert.ok(r.pick.checks.some((c) => c.mark === 'unknown' && c.label === '목 립 좁게'));
  assert.ok(r.notes.some((n) => n.kind === 'out' && /브룩스|폴로|브론슨/.test(n.text)), '점수가 더 높았지만 뺀 상품을 알린다');
  // 사진으로만 본 '목 립 넓음'은 빼지 않고 경고, 공식 원단 무게의 '두꺼움'은 뺀다
  const b = r.ranked.find((x) => x.product.id === 'bronson-loopwheel-white');
  assert.equal(b.conds.find((c) => c.key === 'narrowNeck').status, 'warn'); assert.equal(b.conds.find((c) => c.key === 'thin').status, 'fail');
  // 위치를 모르는 탭 로고는 ?, 밑단 로고는 확인
  assert.equal(P.condOf(by('levis-001lj0001'), 'noLogo').status, 'unknown');
  assert.equal(P.condOf(by('rlpl-281670-white'), 'noLogo').status, 'ok');
  // 로고 조건을 끄면 작은 로고 상품도 후보가 된다
  const r2 = rec({ priorities: ['brand', 'quality'], use: 'layer', conds: ['thin', 'narrowNeck'], sleeve: 'short', brands: FAV, size: 'M' });
  assert.ok(r2.eligible.some((x) => x.product.id === 'brooks-bbnpmm5192a'));
  // 한 장으로 입을 티: 공식으로 얇다고 확인된 것이 없으니 판매처 설명의 얇음은 경고만
  const solo = rec({ priorities: ['quality'], use: 'solo', sleeve: 'short' });
  assert.ok(solo.pick.conds.every((c) => c.status !== 'fail'));
  assert.match(r.rank.text, /^조건을 어기지 않은 \d+개 중 1위/);
  assert.equal(typeof r.rank.allOk, 'number');
});

test('기본 용도는 "상관없음"이고, 그때는 조건이 없다', () => {
  assert.deepEqual(P.activeConds({}), []);
  const r = rec({ priorities: [] });
  assert.equal(r.use, 'any'); assert.equal(r.pick.conds.length, 0);
  assert.equal(r.pick.conclusion, '아직 기준을 고르지 않아 다섯 기준을 같은 무게로 봤어요.');
});

test('품절·판매 안 하는 사이즈를 구분하고, 실측으로 못 고르면 평소 사이즈의 품절·안 팖을 놓치지 않는다', () => {
  const bronson = by('bronson-loopwheel-white');
  const xs = P.fitOf(bronson, { size: 'XS' });
  assert.equal(xs.avail, false); assert.match(xs.text, /XS 사이즈는 팔지 않아요/);
  const both = P.fitOf(bronson, { size: 'XS', ref: { chest: 47 } });
  assert.equal(both.avail, false, '치수표가 없어 실측으로 못 고르면 평소 사이즈로 본다'); assert.match(both.text, /실측으로는 못 골라요/);
  const soft = by('polo-630376-white');
  assert.equal(P.fitOf(soft, { size: 'M' }).avail, false); assert.match(P.fitOf(soft, { size: 'M' }).text, /M 품절/);
  assert.equal(P.fitOf(soft, { size: 'XXL' }).avail, true);
  assert.equal(P.fitOf(soft, { size: '115' }).avail, true, '115 = XXL');
  const c = variant((raw) => { const b = raw.products.find((x) => x.id === 'hanes-red-3p-white'); b.stock.inStock = false; });
  const r = rec({ priorities: ['value'], use: 'any', sleeve: 'any' }, c);
  assert.notEqual(r.pick.product.id, 'hanes-red-3p-white');
  assert.ok(r.ranked.find((x) => x.product.id === 'hanes-red-3p-white').out.includes('품절'));
  const pot = P.fitOf(by('pottery-ss-classic-white'), { size: 'M' });
  assert.equal(pot.size, '2'); assert.match(pot.meas, /2\(M\): 가슴단면 54\.5/);
  assert.equal(P.availOf({ stock: { sizes: ['M'], inStock: true, checkedAt: TODAY }, sizes: [], offered: null }, '', 'XS').why, 'XS를 파는지 확인 못 함', '라틴 사이즈 조사');
  assert.equal(P.availOf({ stock: { sizes: ['M'], inStock: true, checkedAt: TODAY }, sizes: [], offered: null }, '', 'L').why, 'L을 파는지 확인 못 함');
});

test('내 핏: 실측과 가장 가까운 사이즈와 차이(cm). 공개 치수가 하나뿐이면 확신을 낮추고 그렇게 말한다', () => {
  const f = P.fitOf(by('uniqlo-e422992-white'), { ref: { chest: 53.5, length: 69, shoulder: 46 } });
  assert.equal(f.size, 'M'); assert.match(f.text, /가슴 −0\.5cm/); assert.ok(f.maxDiff != null);
  const far = P.fitOf(by('polo-480590-white'), { ref: { chest: 59, length: 76, shoulder: 52 } });
  assert.equal(far.size, ''); assert.match(far.text, /공개 치수가 M뿐이고/);
  const near = P.fitOf(by('polo-480590-white'), { ref: { chest: 47 } });
  assert.ok(near.score <= 0.6 && near.caution); assert.match(near.text, /공개 치수가 M뿐이에요/); assert.ok(!/가장 가까워요/.test(near.text));
  const none = P.fitOf(by('bronson-loopwheel-white'), { ref: { chest: 53 } });
  assert.equal(none.size, ''); assert.match(none.text, /치수표가 없어/);
});

test('해외 상품·묶음·배송비: 배송비를 알면 지금 낼 돈에 넣고, 모르면 가성비를 중간 이하로 본다', () => {
  const b = by('bronson-loopwheel-white');
  const u = P.unitPrice(b, cat);
  assert.equal(u.landed, true); assert.equal(u.krw, Math.round((28.99 + 6.99) * cat.fx.USD.krw)); assert.equal(u.pay, u.krw);
  const c = variant((raw) => { delete raw.products.find((x) => x.id === 'bronson-loopwheel-white').shipping; });
  const r = rec({ priorities: ['value'], use: 'any', sleeve: 'any' }, c);
  const row = r.ranked.find((x) => x.product.id === 'bronson-loopwheel-white');
  assert.ok(row.crit.value <= 0.5 && row.cautions.some((t) => /배송비·관세를 몰라/.test(t)));
  const h = P.unitPrice(by('hanes-red-3p-white'), cat);
  assert.equal(h.pay, 29000 + 2500, '3만 원 아래라 배송비 2,500원을 넣는다'); assert.equal(h.krw, (29000 + 2500) / 3, '3장 묶음은 한 장 값으로 견준다');
  assert.equal(P.unitPrice(by('hanes-blue-3p-white'), cat).pay, 31000, '3만 원 이상이면 배송비 없음');
  const k = variant((raw) => { raw.products.find((x) => x.id === 'hanes-red-3p-white').shipping = { fee: 3000, freeOver: 50000, note: '시험' }; });
  assert.equal(P.unitPrice(k.products.find((x) => x.id === 'hanes-red-3p-white'), k).pay, 32000, '국내 배송비도 넣는다');
});

test('오래된 자료: 날짜로 점수를 바꾸지 않는다(1등 불변), 이유로 말하지 않고, 30일 지나면 빼고, 미래 확인일도 뺀다', () => {
  for (const q of grid().filter((_, i) => i % 11 === 0)) {
    const a = rec(q), b = rec(Object.assign({}, q, { today: '2026-10-29' }));
    assert.equal(b.pick && b.pick.product.id, a.pick && a.pick.product.id, '15일이 지나도 1등은 같다 ' + JSON.stringify(q));
    if (b.pick) assert.ok(!/가성비가 좋은 편/.test(b.pick.conclusion), '오래된 가격을 가성비 이유로 말하지 않는다');
  }
  const late = rec({ priorities: ['value'], use: 'any', sleeve: 'any', today: '2026-10-29' });
  assert.ok(late.ranked.every((x) => x.stale) && late.pick.cautions.some((t) => /16일 지났어요/.test(t)));
  const gone = rec({ priorities: ['value'], use: 'any', sleeve: 'any', today: '2026-12-01' });
  assert.equal(gone.pick, null); assert.ok(gone.ranked.every((x) => /일이 지나/.test(x.out)));
  assert.ok(gone.notes.filter((n) => n.kind === 'out').every((n) => !/더 높지만/.test(n.text)), '1등이 없으면 "더 높지만"이라 말하지 않는다');
  const c = variant((raw) => { raw.products.find((x) => x.id === 'hanes-red-3p-white').checkedAt = '2026-12-31'; });
  assert.ok(/미래/.test(rec({ priorities: ['value'] }, c).ranked.find((x) => x.product.id === 'hanes-red-3p-white').out));
});

test('좋아하는 브랜드: 빈자리를 나눠 말하고(긴팔 오표시 없음), 왜 1등이 아닌지 한 문장으로 묶는다', () => {
  const r = rec({ priorities: ['brand'], use: 'any', sleeve: 'long', brands: FAV });
  assert.ok(r.notes.some((n) => n.kind === 'sleeve' && /폴로/.test(n.text) && /긴팔 상품은 목록에 없어요/.test(n.text)));
  assert.ok(r.notes.some((n) => n.kind === 'missing' && /LVC/.test(n.text)) && r.notes.some((n) => n.kind === 'missing' && /아웃스탠딩/.test(n.text)));
  assert.ok(!r.notes.some((n) => /폴로/.test(n.text) && n.kind === 'missing'));
  const f = rec(FOUNDER).favNote;
  assert.match(f, /^좋아하는 브랜드 6곳 중 조건을 통과한 건 포터리뿐이에요\./);
  assert.match(f, /가슴 로고/); assert.match(f, /두꺼움/); assert.match(f, /확인한 상품 없음/);
});

test('대안: 서로 다르고 이름이 겹치지 않으며("(2)" 없음), 25점 안(값을 크게 줄이는 하나만 40점 안), 경고 있는 상품·받쳐 입기의 루즈핏·핏 1순위의 큰 차이는 내지 않는다(조건 격자)', () => {
  for (const q of grid()) {
    const r = rec(q); if (!r.pick) continue;
    assert.ok(r.alts.length <= 2 && new Set(r.alts.map((a) => a.r)).size === r.alts.length && r.alts.every((a) => a.r !== r.pick));
    assert.equal(new Set(r.alts.map((a) => a.label)).size, r.alts.length, '대안 이름이 겹친다: ' + r.alts.map((a) => a.label));
    for (const a of r.alts) {
      assert.ok(!/\(2\)/.test(a.label));
      assert.match(a.delta, /^([+−][\d,]+원|같은 값)/);
      const deal = / 대신 값을 보면$/.test(a.label);
      assert.ok(a.r.raw >= r.pick.raw - (deal ? 0.4 : 0.25) - 1e-9, JSON.stringify(q) + ' ' + a.label + ' 점수 차');
      if (deal) assert.ok(a.r.unit.krw <= r.pick.unit.krw / 3 + 1e-9);
      assert.ok(!a.r.conds.some((c) => c.status === 'warn' || c.status === 'fail'));
      if (q.use === 'layer' && r.pick.product.fit !== 'relaxed') assert.notEqual(a.r.product.fit, 'relaxed');
      if (q.priorities[0] === 'fit' && !a.r.fit.neutral) assert.ok(a.r.fit.score >= 0.5 && !(a.r.fit.maxDiff > 4));
      if (q.priorities[0] === 'value') assert.ok(a.r.unit.krw <= r.pick.unit.krw * 2);
    }
  }
});

test('결론은 고른 기준·확인된 표시만 말한다: 고르지 않은 브랜드·스타일·사이즈, 보통인 가성비를 이유로 쓰지 않는다', () => {
  for (const q of grid()) {
    const r = rec(q); if (!r.pick) continue;
    const t = r.pick.conclusion;
    assert.match(t, /(요|\))\.( 다만 .*\.)?$/, t);
    assert.ok(!/은\(는\)|이\(가\)|을\(를\)|와\(과\)|으로\(로\)/.test(t), '조사: ' + t);
    if (!q.brands.length) assert.ok(!/좋아하는/.test(t), '브랜드를 안 골랐는데: ' + t);
    if (!q.styles.length) assert.ok(!/고른 스타일/.test(t), '스타일을 안 골랐는데: ' + t);
    if (!q.size && !q.ref) assert.ok(!/사이즈가 잘|재고가 있어요/.test(t), '사이즈를 안 넣었는데: ' + t);
    if (/가성비가 좋은 편/.test(t)) assert.ok(r.pick.crit.value >= 0.66 && !r.pick.stale);
    for (const c of r.pick.checks.filter((x) => x.group === 'pri')) if (c.mark === 'none') assert.ok(/고르지 않았|넣으면/.test(c.text), c.text);
  }
  const r = rec(FOUNDER);
  assert.equal(r.pick.conclusion, '좋아하는 브랜드(포터리)예요. 로고 안 보이게는 확인됐어요. 두께는 약한 근거(판매처 설명)로 봤어요. 다만 목 립 폭은 확인 못 했어요.');
  const labels = r.pick.checks.map((c) => c.label);
  assert.ok(labels.indexOf('로고 안 보이게') >= 0 && labels.indexOf('브랜드 1순위') > labels.indexOf('목 립 좁게') && labels.indexOf('품질(소재·봉제) 2순위') > labels.indexOf('브랜드 1순위'));
  assert.match(r.gapWhy, /^2위 포터리 .*와는 공개된 품질 근거에서 갈렸어요/);
  assert.ok(!r.pick.checks.some((c) => /1점당|\/10/.test(c.text)), '내부 숫자를 보이지 않는다');
});

test('1순위 기준 문턱: 1순위가 보통 이상인 상품이 있으면 그 안에서 고르고 그렇게 말한다. 없으면 그렇다고 말한다', () => {
  const r = rec({ priorities: ['quality', 'value'], use: 'layer', sleeve: 'short', size: 'M' });
  assert.ok(r.pick.crit.quality >= P.GATE, '품질 1순위인데 품질이 약한 상품이 1등');
  let changed = 0;
  for (const q of grid()) {
    const x = rec(q); if (!x.pick || !x.gate) continue;
    const g = x.gate.key, L = x.gate.label;
    if (x.eligible.some((e) => e.crit[g] >= P.GATE)) assert.ok(x.pick.crit[g] >= P.GATE, JSON.stringify(q));
    if (x.gate.changed && !x.gate.none) {
      changed++;
      assert.ok(x.pick.conclusion.indexOf(P.josa(L, '을', '를') + ' 1순위로 골라, ' + P.josa(L, '이', '가') + ' 보통 이상인 ') === 0, x.pick.conclusion);
      assert.ok(x.rank.text.indexOf('보통 이상인 ' + x.gate.pass + '개 안에서') > 0 || x.rank.n === 1, x.rank.text);
    }
  }
  assert.ok(changed > 0, '문턱 때문에 1등이 바뀌는 경우가 격자에 있어야 시험이 의미 있다');
  const none = variant((raw) => { for (const p of raw.products) { p.fabric.fiber = null; p.fabric.fiberSrc = null; p.fabric.knit = null; p.build = []; } });
  const n = rec({ priorities: ['quality'], use: 'any', sleeve: 'short' }, none);
  assert.ok(n.gate.none); assert.match(n.pick.conclusion, /^품질이 '보통' 이상인 상품이 없어 다른 기준을 합해 골랐어요/);
});

test('예산: 지금 낼 돈(묶음 전체·아는 배송비)이 넘으면 1등 후보에서 뺀다', () => {
  const r = rec({ priorities: ['value'], use: 'solo', sleeve: 'short', budget: 30000 });
  assert.ok(r.eligible.every((x) => x.unit.pay <= 30000));
  const blue = r.ranked.find((x) => x.product.id === 'hanes-blue-3p-white');
  assert.match(blue.out, /예산\(30,000원\)을 넘어요: 지금 낼 돈 31,000원/);
  assert.equal(rec({ priorities: ['value'], budget: 12345 }).budget, 0, '정해진 예산 값만 받는다');
});

test('지금 보는 상품: 직접 넣은 값으로 같은 기준에 끼워 순위를 매기고, 직접 입력 출처로 표시한다', () => {
  const u = P.userProduct({ name: '오버핏 반팔 티', brand: '아웃스탠딩', price: 39000, link: 'https://www.musinsa.com/products/1', storeName: '무신사', logo: 'none', thick: 'thin', neck: 'narrow', cotton100: true, size: 'M', chest: 56, length: 71, shoulder: 52, fit: 'relaxed' }, cat, 'white-tee', TODAY);
  assert.ok(u && u.user && u.brand === 'outstanding' && u.store.url && u.fabric.thickSrc === 'user');
  const r = rec(Object.assign({}, FOUNDER, { extra: [u] }));
  const row = r.ranked.find((x) => x.product.user);
  assert.ok(row && !row.out, '조건을 지킨 직접 입력 상품은 순위에 든다');
  assert.ok(row.conds.every((c) => c.status === 'ok'), '직접 입력은 확인으로 본다');
  assert.ok(row.cautions.some((t) => /직접 넣은 값/.test(t)));
  assert.ok(!r.pick.product.user && r.alts.every((a) => !a.r.product.user), '1등·대안은 확인한 상품 안에서만');
  assert.ok(r.userRank && r.userRank.n === r.eligible.length + 1 && r.userRank.idx >= 0);
  assert.equal(r.about.count, rec(FOUNDER).about.count, '카탈로그 개수에는 넣지 않는다');
  const noLink = P.userProduct({ name: 'x', price: 20000 }, cat, 'white-tee', TODAY);
  assert.ok(noLink && noLink.store.url === '' && noLink.sizes.length === 0);
  assert.equal(P.userProduct({ name: 'x', price: 5 }, cat, 'white-tee', TODAY), null, '가격이 이상하면 만들지 않는다');
});

test('옷장과의 조합·후보·보유로 넣기: 1등·대안에 새 조합 수, 후보에는 판매처 링크·원화 가격·확인일, 산 사이즈 치수는 옷장 실측으로', () => {
  const r = rec({ priorities: ['value'], use: 'layer', sleeve: 'short' });
  for (const row of [r.pick].concat(r.alts.map((a) => a.r))) assert.ok(row.closet && typeof row.closet.added === 'number' && row.closet.top3.every((c) => c.top.status === 'candidate'));
  const c = P.toCandidate(by('bronson-loopwheel-white'), cat, TODAY);
  assert.equal(c.status, 'candidate'); assert.equal(c.link, by('bronson-loopwheel-white').store.url); assert.equal(c.price, Math.round(28.99 * cat.fx.USD.krw)); assert.equal(c.photo.kind, 'none');
  const o = P.toOwned(by('pottery-ss-classic-white'), cat, '2', TODAY);
  assert.equal(o.status, 'owned'); assert.equal(o.size, '2(M)'); assert.equal(o.measures.chest, 54.5); assert.equal(o.boughtYear, 2026);
  const a = rec({ priorities: ['quality', 'brand'], use: 'layer', sleeve: 'any', brands: FAV }), b = rec({ priorities: ['quality', 'brand'], use: 'layer', sleeve: 'any', brands: FAV });
  assert.deepEqual(a.ranked.map((x) => [x.product.id, x.total]), b.ranked.map((x) => [x.product.id, x.total]));
});

test('중립성: 상품에 제휴 수수료·광고비 같은 값을 붙여도 순위가 바뀌지 않는다(그런 값은 계산에 쓰지 않는다)', () => {
  const paid = variant((raw) => { raw.products.forEach((p, i) => { p.commission = i * 0.05; p.adBid = 10000 * i; p.store.affiliate = { rate: 0.1 * i, url: 'https://example.com/aff' }; }); });
  for (const q of grid().filter((_, i) => i % 9 === 0)) {
    const a = rec(q), b = rec(q, paid);
    assert.deepEqual(b.ranked.map((r) => [r.product.id, r.total]), a.ranked.map((r) => [r.product.id, r.total]), JSON.stringify(q));
  }
  assert.ok(!('commission' in paid.products[1]) && !('affiliate' in paid.products[1].store), '정리할 때 그런 값은 아예 버린다');
});

