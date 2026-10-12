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
  bad.products[11].fitSrc = undefined; bad.products[12].lengthFrom = 'center'; delete bad.products[13].shipping; bad.products[14].light = 150; bad.products[14].store.type = 'offical';
  bad.products[15].offered = 'S,M'; bad.products[16].pattern = 'stripes'; bad.brands.uniqlo.aliases = bad.brands.uniqlo.aliases.concat(['폴로']); bad.brandNotes[0].line = 'white-teee';
  const rb = validate(bad, TODAY).errors.join('\n');
  for (const want of ['모르는 종류', '등록 안 된 품목', '가격 범위 밖', '확인일이 미래', '가슴 너비', 'length 는 숫자여야', '실제 날짜가 아님', '혼용률에는 출처', 'inStock 은 true|false', '직접 입력 출처', '배송비 통화',
    '핏에는 출처', 'lengthFrom', '배송비(shipping)가 없음', 'light 는', 'store.type', 'offered 는', '모르는 무늬', '별칭', 'brandNotes: lvc 등록 안 된 품목']) assert.ok(rb.includes(want), want);
  const old = validate(RAW, '2026-11-20').errors;
  assert.ok(old.length === RAW.products.length + 1 && old.every((x) => /\[만료\]/.test(x)), '30일이 지나면 [만료] 오류로 빌드를 막는다');
  assert.ok(validate(RAW, '2026-10-28').errors.some((x) => /^lines\.white-tee: \[만료\] 상품 17개 중 17개/.test(x)), '한 품목의 30% 넘게 14일이 지나면 다시 확인할 때까지 배포를 막는다');
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
  assert.equal(bronson.score, Math.round((3 + 1 + 0.75 * 0.6 + 1.5 * 0.6) * 100) / 100, '루프휠·링스펀은 인증 없는 브랜드 설명이라 0.6배');
  assert.ok(bronson.parts.some((t) => /루프휠.*브랜드 설명, 인증 없음/.test(t)));
  assert.deepEqual(P.qualityOf(by('uniqlo-e455365-white')).items.map((x) => x.text), ['수피마 코튼', '면 100%'], '결론에는 무게가 큰 근거부터');
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
  assert.equal(u.landed, false, '결제 화면에서 바뀔 수 있는 배송비(estimate)는 확실하지 않다'); assert.equal(u.shipEst, true); assert.equal(u.shipKnown, false);
  assert.equal(u.krw, Math.round((28.99 + 6.99) * cat.fx.USD.krw)); assert.equal(u.pay, u.krw);
  const br = rec({ priorities: ['value'], use: 'any', sleeve: 'any' }).ranked.find((x) => x.product.id === 'bronson-loopwheel-white');
  assert.ok(br.crit.value <= 0.5 && br.cautions.some((t) => /배송비가 결제 화면에서 바뀔 수 있고/.test(t)) && br.cautions.some((t) => /배송비 약 \$6\.99/.test(t)));
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
      if (q.priorities[0] === 'value') assert.ok(a.r.unit.krw <= r.pick.unit.krw * 2 || a.r.unit.krw - r.pick.unit.krw <= 15000, '가성비 1순위인데 값이 크게 비싼 대안');
    }
  }
});

test('결론은 고른 기준·확인된 표시만 말한다: 고르지 않은 브랜드·스타일·사이즈, 보통인 가성비를 이유로 쓰지 않는다', () => {
  for (const q of grid()) {
    const r = rec(q); if (!r.pick) continue;
    const t = r.pick.conclusion;
    assert.ok(/\.$/.test(t) && !/\.\./.test(t) && t.split('. ').length <= 3, '결론은 세 문장 안: ' + t);
    assert.ok(!/은\(는\)|이\(가\)|을\(를\)|와\(과\)|으로\(로\)|\(이\)에요/.test(t), '조사: ' + t);
    assert.ok(!/\([^()]*\([^()]*\)[^()]*\)/.test(t), '괄호 안 괄호: ' + t);
    for (const x of r.ranked) if (x !== r.pick) assert.ok(!/가장 높아요|합한 점수가 가장/.test(x.conclusion), '1등이 아닌데: ' + x.conclusion);
    if (!q.brands.length) assert.ok(!/좋아하는/.test(t), '브랜드를 안 골랐는데: ' + t);
    if (!q.styles.length) assert.ok(!/고른 스타일/.test(t), '스타일을 안 골랐는데: ' + t);
    if (!q.size && !q.ref) assert.ok(!/사이즈가 잘|재고가 있어요/.test(t), '사이즈를 안 넣었는데: ' + t);
    if (/가성비가 좋은 편/.test(t)) assert.ok(r.pick.crit.value >= 0.66 && !r.pick.stale);
    for (const c of r.pick.checks.filter((x) => x.group === 'pri')) if (c.mark === 'none') assert.ok(/고르지 않았|넣으면/.test(c.text), c.text);
  }
  const r = rec(FOUNDER);
  assert.equal(r.pick.conclusion, '좋아하는 브랜드(포터리)예요. 로고 안 보이게는 확인됐지만 목 립 폭은 확인 못 했어요.');
  const labels = r.pick.checks.map((c) => c.label);
  assert.ok(labels.indexOf('로고 안 보이게') >= 0 && labels.indexOf('브랜드 1순위') > labels.indexOf('목 립 좁게') && labels.indexOf('품질(소재·봉제) 2순위') > labels.indexOf('브랜드 1순위'));
  assert.match(r.gapWhy, /^2위 포터리 Short Sleeve Comfort T-Shirt와는 조건 확인에서 갈렸어요\(박시하지 않게\)\. 2위는 루즈·박스핏이라 받쳐 입기 대안에서는 뺐어요\.$/);
  const q1 = rec({ priorities: ['quality', 'value'], use: 'layer', sleeve: 'short', size: 'M' });
  assert.match(q1.pick.conclusion, /^품질\(1순위\)은 '보통'이지만 견준 \d+개 중 가장 높아요: 수피마 코튼, 면 100%\./, '1순위가 보통이면 그렇다고 먼저 말한다');
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
  assert.ok(u && u.user && u.brand === 'outstanding' && u.store.url && u.fabric.thickSrc === 'user' && /^user-[a-z0-9]+$/.test(u.id));
  const r = rec(Object.assign({}, FOUNDER, { extra: [u] }));
  const row = r.ranked.find((x) => x.product.user);
  assert.ok(row && !row.out, '어긴 게 확인되지 않은 직접 입력 상품은 순위에 든다');
  assert.ok(row.conds.every((c) => c.status !== 'ok'), '직접 적은 값은 약한 확인(카탈로그의 확인보다 약하게)');
  assert.equal(row.conds.find((c) => c.key === 'notLoose').status, 'warn', '직접 적은 루즈핏은 경고');
  assert.ok(row.cautions.some((t) => /직접 적은 값/.test(t)));
  assert.ok(!/가장 높아요/.test(row.conclusion));
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


test('직접 넣은 상품은 1등·대안·좋아하는 브랜드 줄·뺀 상품 알림·순위 문장을 바꾸지 않는다(조건 격자)', () => {
  const us = [P.userProduct({ name: '아웃스탠딩 반팔 티', brand: '아웃스탠딩', price: 39000, logo: 'none', thick: 'thin', neck: 'narrow', cotton100: true, size: 'M', chest: 56, length: 71 }, cat, 'white-tee', TODAY),
    P.userProduct({ name: '무지 티', price: 9000, size: 'M', chest: 52, length: 69, shoulder: 45 }, cat, 'white-tee', TODAY)];
  for (const q of grid().filter((_, i) => i % 5 === 0)) for (const u of us) {
    const a = rec(q), b = rec(Object.assign({}, q, { extra: [u] }));
    assert.equal(b.pick && b.pick.product.id, a.pick && a.pick.product.id, JSON.stringify(q));
    assert.deepEqual(b.alts.map((x) => [x.label, x.r.product.id]), a.alts.map((x) => [x.label, x.r.product.id]));
    assert.equal(b.favNote, a.favNote); assert.deepEqual(b.notes.map((n) => n.text), a.notes.map((n) => n.text)); assert.deepEqual(b.rank, a.rank);
    assert.equal(b.gapWhy.replace(/^확인한 상품 중 /, ''), a.gapWhy);
  }
  assert.notEqual(us[0].id, us[1].id, '보던 상품마다 다른 id(기록이 섞이지 않게)');
});

test('이름에서 읽기: 브랜드(띄어쓰기·문장부호 무시), 오버핏·슬림, 묶음 수, 소매. 보던 상품은 안 적은 핏을 이름에서 채운다(출처 상품명)', () => {
  assert.equal(P.brandKey(cat, '폴로랄프로렌'), 'polo'); assert.equal(P.brandKey(cat, 'LEVI’S'), 'levis'); assert.equal(P.brandKey(cat, '퍼플라벨'), 'rlpl'); assert.equal(P.brandKey(cat, '없는 브랜드'), '');
  const g = P.guessFromName(cat, '[무신사] 아웃스탠딩 오버핏 3P 반팔 티셔츠');
  assert.deepEqual(g, { brand: 'outstanding', fit: 'relaxed', packCount: 3, sleeve: 'short' });
  assert.equal(P.guessFromName(cat, '리바이스 슬림 롱슬리브 티').fit, 'slim'); assert.equal(P.guessFromName(cat, '리바이스 슬림 롱슬리브 티').sleeve, 'long');
  assert.equal(P.guessFromName(cat, '2XL 티').packCount, null, '2XL 은 묶음 수가 아니다');
  const u = P.userProduct({ name: '헤비 오버핏 티 2팩', price: 30000 }, cat, 'white-tee', TODAY);
  assert.equal(u.fit, 'relaxed'); assert.equal(u.fitSrc, 'name'); assert.equal(u.packCount, 2);
  assert.equal(P.userProduct({ name: '헤비 오버핏 티 2팩', price: 30000, fit: 'regular', packCount: 1 }, cat, 'white-tee', TODAY).fit, 'regular', '사용자가 고른 값이 먼저');
});

test('카디건 총장: 2cm 넘게 짧으면 확인, 거의 같으면 애매, 1.5cm까지 길면 경고(!), 그보다 길면 공식 치수로는 어김. 뒤 중심 총장은 2cm 더하고 약한 확인', () => {
  const base = { id: 't', sizes: [{ label: 'M', length: 70, chest: 52 }], sizeSrc: 'official', fabric: {}, build: [], stock: null, offered: null };
  const at = (L, extra) => P.condOf(Object.assign({}, base, extra), 'notLonger', { outerLen: L, fit: { size: 'M' } });
  assert.equal(at(72).status, 'ok'); assert.match(at(72).text, /2cm 짧아요/);
  assert.equal(at(71).status, 'weak'); assert.equal(at(71).kind, 'partial'); assert.match(at(70).text, /카디건\(70cm\)과 같아요/);
  assert.equal(at(69).status, 'warn'); assert.match(at(69).text, /1cm 길어 밑단이 살짝 보일 수 있어요/);
  assert.equal(at(68.4).status, 'fail'); assert.equal(at(68.4, { sizeSrc: 'seller' }).status, 'warn', '판매처 치수표로는 어김을 확정하지 않는다');
  const cb = at(74, { lengthFrom: 'cb' });
  assert.equal(cb.status, 'weak', '보정(추정)이 들어가면 확인이 아니다'); assert.match(cb.text, /뒤 중심 치수라 약 72cm로 봄/);
  assert.equal(at(70, { sizeDoubt: '같은 표' }).status, 'unknown');
  const f = P.fitOf(by('uniqlo-e455365-white'), { ref: { chest: 53, length: 70, shoulder: 45 } });
  assert.match(f.text, /뒤 중심 치수에 2cm 더해 견줌/);
});

test('카디건 단추를 잠그면 가슴 작은 자수는 애매(빼지 않음), 큰 자수·프린트는 그대로 어김. 받쳐 입기의 박시하지 않게는 핏 출처로 나눈다', () => {
  const brooks = by('brooks-bbnpmm5192a'), polo = by('polo-480590-white');
  assert.equal(P.condOf(brooks, 'noLogo').status, 'fail');
  const c = P.condOf(brooks, 'noLogo', { closed: true }); assert.equal(c.status, 'weak'); assert.equal(c.kind, 'partial'); assert.match(c.text, /단추를 잠그면 대개 가려져요/);
  assert.equal(P.condOf(polo, 'noLogo', { closed: true }).status, 'fail');
  const r = rec(Object.assign({}, FOUNDER, { closed: true }));
  assert.ok(r.eligible.some((x) => x.product.id === 'brooks-bbnpmm5192a'), '단추를 잠그면 브룩스도 후보');
  assert.equal(P.condOf(by('levis-005gy0000'), 'notLoose').status, 'fail', '공식 루즈핏은 어김');
  assert.equal(P.condOf(by('pottery-ss-comfort-white'), 'notLoose').status, 'warn', '판매처 설명의 루즈핏은 경고');
  assert.equal(P.condOf(by('uniqlo-e455365-white'), 'notLoose').status, 'ok'); assert.equal(P.condOf(by('uniqlo-e422992-white'), 'notLoose').status, 'unknown');
});

test('대안 이름은 1등보다 나은 점이다: 나은 점 없는 대안·"조금 더 써도"·"다음 후보" 없음, 더 싸게는 두 값 모두, 14일 지난 가격은 이유로 안 씀(조건 격자)', () => {
  let n = 0;
  for (const q of grid()) for (const today of [TODAY, '2026-10-29']) {
    const r = rec(Object.assign({}, q, { today })); if (!r.pick) continue;
    for (const a of r.alts) {
      n++;
      assert.ok(!/조금 더 써도|다음 후보/.test(a.label), a.label);
      const deal = / 대신 값을 보면$/.test(a.label);
      assert.ok(deal || a.adv.indexOf(a.label) >= 0, '나은 점이 이름이어야: ' + a.label + ' / ' + a.adv);
      if (a.label === '더 싸게') assert.ok(a.r.unit.krw <= r.pick.unit.krw * 0.85 && a.r.unit.pay <= r.pick.unit.pay, '더 싸게인데 지금 낼 돈이 많음');
      if (deal) assert.ok(q.priorities[0] && !(q.priorities[0] === 'brand' && !q.brands.length) && !(q.priorities[0] === 'fit' && !q.size && !q.ref), '고르지 않은 기준 이름: ' + a.label + ' ' + JSON.stringify(q));
      if (today !== TODAY) assert.ok(!/더 싸게|한 장 값을 줄이려면|대신 값을 보면/.test(a.label), '오래된 가격을 이유로: ' + a.label);
    }
    if (today !== TODAY && r.gapWhy) assert.ok(!/가성비에서 갈렸어요/.test(r.gapWhy), r.gapWhy);
  }
  assert.ok(n > 500, '본 대안 ' + n);
});

test('재고: 14일 지난 재고는 "재고 있음"을 이유로 쓰지 않지만 점수는 그대로다', () => {
  const p = by('uniqlo-e455365-white');
  const a = P.fitOf(p, { size: 'M', today: TODAY }), b = P.fitOf(p, { size: 'M', today: '2026-10-29' });
  assert.equal(a.score, b.score); assert.match(a.text, /M 재고 있음/); assert.match(b.text, /재고는 16일 전 확인이라 판매처에서 봐 주세요/);
  const r = rec({ priorities: ['fit'], size: 'M', today: '2026-10-29' });
  assert.ok(!/재고가 있어요/.test(r.pick.conclusion), r.pick.conclusion);
});

test('치수표를 믿기 어려운 상품(sizeDoubt)은 실측 비교에 쓰지 않는다', () => {
  const f = P.fitOf(by('hanes-blue-3p-white'), { ref: { chest: 49, length: 72 }, size: 'M' });
  assert.ok(f.byRefFailed); assert.match(f.text, /치수표를 믿기 어려워/); assert.ok(!f.byRef);
});

test('보던 상품과 1등 두 칸 비교: 배송비를 모르면 "넘게" 싸다고만, 조건·사이즈·품질 근거에서 나은 쪽을 적는다', () => {
  const u = P.userProduct({ name: '아웃스탠딩 흰 반팔 티', brand: '아웃스탠딩', price: 39000, logo: 'none', size: 'M', chest: 56, length: 71 }, cat, 'white-tee', TODAY);
  const r = rec(Object.assign({}, FOUNDER, { priorities: ['value', 'quality'], extra: [u] }));
  const c = P.contrast(r.user, r.pick, cat);
  assert.equal(c.rows[0].key, 'pay'); assert.equal(c.payWin, 'b'); assert.match(c.sum, /^1위 .* 넘게 싸요\(보던 상품 배송비는 빼고 셈\)\./);
  assert.ok(c.rows.some((x) => x.key === 'cond:noLogo' && x.a.status === 'weak'), '직접 적은 로고 없음은 약한 확인');
  assert.equal(P.contrast(r.pick, r.pick, cat), null);
  const pay = rec({ priorities: ['value'] }).pick.unit.pay;
  const cheap = P.userProduct({ name: '무지 티', price: pay - 9000 }, cat, 'white-tee', TODAY), near = P.userProduct({ name: '무지 티 2', price: pay - 1000 }, cat, 'white-tee', TODAY);
  const r2 = rec({ priorities: ['value'], extra: [cheap] }), r3 = rec({ priorities: ['value'], extra: [near] });
  assert.match(P.contrast(r2.user, r2.pick, cat).sum, /^보던 상품이 9,000원 싸요\(보던 상품 배송비는 빼고 셈\)/, '국내 배송비(보통 5,000원 아래)보다 큰 차이면 싸다고 말한다');
  assert.match(P.contrast(r3.user, r3.pick, cat).sum, /^보던 상품이 1,000원 싸지만 배송비를 몰라 확실하지 않아요/);
  assert.ok(c.rows.every((x) => x.a.text.length <= 40 && x.b.text.length <= 60), '표 칸은 짧게(출처 꼬리·긴 설명은 뗀다)');
});

test('잘 맞는 옷 치수가 없으면 같은 사이즈끼리 가슴·총장 차이를 말한다(뒤 중심 총장은 +2cm 추정, 1cm 아래는 말하지 않음)', () => {
  const sup = by('uniqlo-e455365-white'), L = sup.sizes.find((s) => s.label === 'L');
  assert.equal(sup.lengthFrom, 'cb');
  const mk = (chest, length) => P.userProduct({ name: '보던 티', price: 19900, size: 'L', chest, length }, cat, 'white-tee', TODAY);
  const sumFor = (u) => { const r = rec({ use: 'layer', priorities: ['quality'], extra: [u] }); assert.equal(r.pick.product.id, sup.id, '품질 1순위면 유니클로 수피마가 1위(이 시험의 전제)'); return P.contrast(r.user, r.pick, cat); };
  const c = sumFor(mk(L.chest + 2.5, L.length + P.LEN_CB - 1));
  assert.match(c.sum, /같은 L끼리면 보던 상품이 가슴 2\.5cm 넓고 총장은 약 1cm 짧아요\./, c.sum);
  assert.ok(c.rows.some((x) => x.key === 'size' && /총장 약 \d+\(뒤 중심 \d+\)cm/.test(x.b.text)), '1위 칸은 옆목점 기준 추정과 뒤 중심 값을 함께');
  assert.ok(!/같은 L끼리면/.test(sumFor(mk(L.chest + 0.5, L.length + P.LEN_CB)).sum), '치수표 오차(1cm) 안의 차이는 말하지 않는다');
  assert.ok(!/끼리면/.test(P.contrast(rec({ use: 'layer', priorities: ['quality'], ref: { chest: 54, length: 72 }, extra: [mk(57, 72)] }).user, rec({ use: 'layer', priorities: ['quality'], ref: { chest: 54, length: 72 }, extra: [mk(57, 72)] }).pick, cat).sum), '잘 맞는 옷 치수가 있으면 그 비교를 쓴다');
});
