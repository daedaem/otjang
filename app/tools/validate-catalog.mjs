// 검증 카탈로그(data/picks.json)를 엄격하게 검사한다. 오타·빠진 값·말이 안 되는 값을 빌드 전에 막는다.
// 앱의 정리 함수(cleanPicks)는 이상한 값을 조용히 빼거나 기본값으로 바꾸므로, 여기서는 그런 일이 생기면 실패로 알린다(정리 전후 비교).
// 확인한 지 30일이 넘은 상품은 추천에서 빠지므로 오류([만료])로 알린다. 개발 중에만 ALLOW_STALE=1 로 빌드를 이어 갈 수 있다.
// 사용: node tools/validate-catalog.mjs [파일]   (build.mjs 와 npm test 가 부른다. 오류가 있으면 1로 끝난다)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const W = require(path.join(root, 'src/wardrobe.js'));
const P = require(path.join(root, 'src/pick.js'));

const own = (d, k) => typeof k === 'string' && d != null && Object.prototype.hasOwnProperty.call(d, k);
const isNum = (v) => typeof v === 'number' && isFinite(v);

/** 검사 결과: { errors: [...], warnings: [...] }. today 는 확인일이 미래인지·오래됐는지 볼 기준일. */
export function validate(raw, today) {
  const errors = [], warnings = [];
  const e = (id, msg) => errors.push((id ? id + ': ' : '') + msg), wn = (id, msg) => warnings.push((id ? id + ': ' : '') + msg);
  if (!raw || raw.schema !== 1 || raw.kind !== 'picks' || !Array.isArray(raw.products)) { e('', 'schema 1, kind "picks", products 배열이어야 한다'); return { errors, warnings }; }
  const lines = raw.lines || {}, brands = raw.brands || {}, fx = raw.fx || {};
  const PRICE = { KRW: [3000, 1500000], USD: [3, 1500] };                                              // [제안값] 한 상품(묶음) 가격으로 말이 되는 범위
  const SHIP = { KRW: [0, 100000], USD: [0, 1000] };
  const days = (d) => Math.round((Date.parse(today + 'T00:00:00Z') - Date.parse(d + 'T00:00:00Z')) / 86400000);
  const date = (v) => P.realDate(v);
  for (const [k, l] of Object.entries(lines)) {
    if (!/^[a-z0-9-]{1,40}$/.test(k) || k === 'constructor') e('lines.' + k, '품목 키 형식');
    if (!l.label) e('lines.' + k, 'label 없음');
    if (!own(W.CATS, l.cat)) e('lines.' + k, '모르는 분류 ' + l.cat);
    if (l.value && !(isNum(l.value.lo) && isNum(l.value.hi) && l.value.lo > 0 && l.value.hi > l.value.lo)) e('lines.' + k, 'value.lo < value.hi 인 숫자여야 한다');
  }
  for (const [k, b] of Object.entries(brands)) if (!/^[a-z0-9-]{1,30}$/.test(k) || k === 'constructor' || !b.name) e('brands.' + k, '키 형식 또는 이름');
  {                                                                                                  // 브랜드 별칭이 두 브랜드를 가리키면 '보던 상품'의 브랜드를 잘못 알아본다
    const seen = new Map(), norm = (t) => String(t || '').toLowerCase().replace(/[\s'’`.&\-_,·]+/g, '');
    for (const [k, b] of Object.entries(brands)) for (const a of [k, b.name, b.ko].concat(Array.isArray(b.aliases) ? b.aliases : [])) { const n = norm(a); if (!n) continue; if (seen.has(n) && seen.get(n) !== k) e('brands.' + k, '별칭 "' + a + '" 이 ' + seen.get(n) + ' 와 겹친다'); else seen.set(n, k); }
  }
  if (fx.USD) {
    if (!(isNum(fx.USD.krw) && fx.USD.krw > 500 && fx.USD.krw < 3000)) e('fx.USD', '환율 범위(숫자)');
    if (!date(fx.USD.date)) e('fx.USD', '날짜 형식'); else { const a = days(fx.USD.date); if (a < -1) e('fx.USD', '날짜가 미래'); else if (a > 30) wn('fx.USD', a + '일 전 환율'); }
  }
  const ids = new Set(), tables = new Map(), staleByLine = {};
  for (const p of raw.products) {
    const id = (p && p.id) || '(id 없음)';
    if (!p || typeof p !== 'object') { e(id, '상품이 객체가 아님'); continue; }
    if (ids.has(id)) e(id, 'id 중복'); ids.add(id);
    if (!own(lines, p.line)) e(id, '등록 안 된 품목 ' + p.line);
    if (!own(brands, p.brand)) e(id, '등록 안 된 브랜드 ' + p.brand);
    if (!own(W.CATS, p.cat)) e(id, '모르는 분류 ' + p.cat); else if (!own(W.KINDS[p.cat], p.kind)) e(id, '모르는 종류 ' + p.kind);
    if (own(lines, p.line) && (lines[p.line].cat !== p.cat || (lines[p.line].kind && lines[p.line].kind !== p.kind))) e(id, '품목과 분류·종류가 다름');
    if (!own(W.FAM, p.family)) e(id, '모르는 색 계열 ' + p.family);
    if (['short', 'long'].indexOf(p.sleeve) < 0) e(id, 'sleeve 는 short|long');
    if (p.light != null && !(isNum(p.light) && p.light >= 0 && p.light <= 100)) e(id, 'light 는 0~100 숫자');
    if (p.pattern != null && !own(W.PATTERNS, p.pattern)) e(id, '모르는 무늬 ' + p.pattern);
    if (p.formality != null && [1, 2, 3].indexOf(p.formality) < 0) e(id, 'formality 는 1|2|3');
    if (p.seasons != null && !(Array.isArray(p.seasons) && p.seasons.every((x) => W.SEASONS.indexOf(x) >= 0))) e(id, '모르는 계절 ' + JSON.stringify(p.seasons));
    if (p.store && p.store.type != null && ['official', 'retailer'].indexOf(p.store.type) < 0) e(id, 'store.type 은 official|retailer');
    if (p.offered != null && !(Array.isArray(p.offered) && p.offered.every((x) => typeof x === 'string' && x.trim()))) e(id, 'offered 는 글자 배열');
    if (p.lengthFrom != null && ['cb', 'hps'].indexOf(p.lengthFrom) < 0) e(id, 'lengthFrom 은 cb(뒤 중심)|hps(옆목점)');
    if (p.sizeDoubt != null && typeof p.sizeDoubt !== 'string') e(id, 'sizeDoubt 는 글자(치수표를 믿기 어려운 이유)');
    if (!own(PRICE, p.currency)) e(id, '통화 ' + p.currency);
    else if (!(isNum(p.price) && p.price >= PRICE[p.currency][0] && p.price <= PRICE[p.currency][1])) e(id, '가격 범위 밖(숫자여야 함) ' + JSON.stringify(p.price) + ' ' + p.currency);
    if (p.currency !== 'KRW' && !own(fx, p.currency)) e(id, '환율 없는 통화');
    if (p.listPrice != null && !(isNum(p.listPrice) && p.listPrice > p.price)) e(id, 'listPrice 는 할인 전 가격(현재가보다 큰 숫자)');
    if (!/^https:\/\//.test((p.store && p.store.url) || '')) e(id, '판매처 주소(https)');
    if (!Array.isArray(p.evidence) || !p.evidence.length || p.evidence.some((x) => !x || !/^https:\/\//.test(x.url || '') || !date(x.seen))) e(id, '근거(evidence) 주소·확인일(실제 날짜)');
    else for (const x of p.evidence) if (days(x.seen) < -1) e(id, '근거 확인일이 미래 ' + x.seen);
    if (!date(p.checkedAt)) e(id, 'checkedAt 이 실제 날짜가 아님 ' + JSON.stringify(p.checkedAt));
    else {
      const a = days(p.checkedAt);
      if (a < -1) e(id, '확인일이 미래 ' + p.checkedAt);
      else if (a > P.DROP_DAYS) e(id, '[만료] 확인한 지 ' + a + '일 — 추천에서 빠진다. 다시 확인해야 한다');
      else if (a > P.STALE_DAYS) wn(id, '확인한 지 ' + a + '일 (다시 확인 필요)');
      if (!staleByLine[p.line]) staleByLine[p.line] = { n: 0, stale: 0 };
      staleByLine[p.line].n++; if (a > P.STALE_DAYS) staleByLine[p.line].stale++;
    }
    const f = p.fabric || {};
    if (f.fiber != null && !own(P.FIBERS, f.fiber)) e(id, '모르는 원사 ' + f.fiber);
    if (f.knit != null && !own(P.KNITS, f.knit)) e(id, '모르는 편직 ' + f.knit);
    if (f.thick != null && !own(P.THICK, f.thick)) e(id, '모르는 두께 ' + f.thick);
    for (const [k, v] of [['compSrc', f.compSrc], ['fiberSrc', f.fiberSrc], ['knitSrc', f.knitSrc], ['thickSrc', f.thickSrc], ['neckSrc', p.neckSrc], ['buildSrc', p.buildSrc], ['sizeSrc', p.sizeSrc], ['logoSrc', p.logoSrc], ['fitSrc', p.fitSrc]]) {
      if (v == null) continue;
      if (!own(P.SRC, v)) e(id, '모르는 출처 ' + k + '=' + v);
      else if (v === 'user') e(id, k + '=user: 카탈로그에는 직접 입력 출처를 쓸 수 없다(확인한 값만)');
    }
    if ((f.cotton100 != null || f.comp) && !f.compSrc) e(id, '혼용률에는 출처(compSrc)가 있어야 한다');
    if (f.thick != null && !f.thickSrc) e(id, '두께에는 출처(thickSrc)가 있어야 한다');
    if (f.fiber != null && !f.fiberSrc) e(id, '원사에는 출처(fiberSrc)가 있어야 한다');
    if (f.knit != null && !f.knitSrc) wn(id, '편직 출처(knitSrc) 없음 — 공식으로 본다');
    if (Array.isArray(p.build) && p.build.length && !p.buildSrc) e(id, '봉제(build)에는 출처(buildSrc)가 있어야 한다');
    if (typeof f.cotton100 !== 'boolean' && f.cotton100 != null) e(id, 'cotton100 은 true|false|null');
    if (f.cotton100 === true && f.comp && !/100/.test(f.comp)) e(id, 'cotton100 인데 혼용률에 100이 없음: ' + f.comp);
    if (p.neck != null && !own(P.NECKS, p.neck)) e(id, '모르는 목 ' + p.neck);
    if (p.neck != null && !p.neckSrc) e(id, '목에는 출처(neckSrc)가 있어야 한다');
    if (p.logo != null && !own(P.LOGOS, p.logo)) e(id, '모르는 로고 ' + p.logo);
    if (p.logo != null && !p.logoNote && !p.logoSrc) wn(id, '로고에 근거(logoNote 또는 logoSrc)가 없음');
    if (p.logo === 'tab' && !/밑단|소매|옆/.test(p.logoNote || '')) wn(id, '탭 로고 위치 모름 — 받쳐 입기 조건에서 ?로 보인다');
    if (p.fit != null && !own(P.FIT, p.fit)) e(id, '모르는 핏 ' + p.fit);
    if (p.fit != null && !p.fitSrc) e(id, '핏에는 출처(fitSrc)가 있어야 한다');
    for (const s of p.styles || []) if (!own(P.STYLES, s)) e(id, '모르는 스타일 ' + s);
    const labels = new Set();
    for (const s of p.sizes || []) {
      if (!s || !s.label) { e(id, '사이즈 이름 없음'); continue; }
      if (labels.has(s.label)) e(id, '사이즈 이름 중복 ' + s.label); labels.add(s.label);
      if (s.alias != null && ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'].indexOf(P.normSize(s.alias)) < 0) e(id, s.label + ' 별칭이 표준 사이즈가 아님: ' + s.alias);
      for (const k of ['chest', 'chestCirc', 'length', 'shoulder', 'sleeve']) if (s[k] != null && !isNum(s[k])) e(id, s.label + ' ' + k + ' 는 숫자여야 한다: ' + JSON.stringify(s[k]));
      const chest = isNum(s.chest) ? s.chest : isNum(s.chestCirc) ? s.chestCirc / 2 : null;
      if (chest != null && !(chest >= 35 && chest <= 90)) e(id, s.label + ' 가슴 너비 ' + chest);
      if (isNum(s.length) && !(s.length >= 50 && s.length <= 100)) e(id, s.label + ' 총장 ' + s.length);
      if (isNum(s.shoulder) && !(s.shoulder >= 30 && s.shoulder <= 70)) e(id, s.label + ' 어깨 ' + s.shoulder);
    }
    const sz = (p.sizes || []).filter((s) => s && isNum(s.length));
    for (let i = 1; i < sz.length; i++) { const d = sz[i].length - sz[i - 1].length; if (d < 0 || d > 4.5) wn(id, '총장이 ' + sz[i - 1].label + '→' + sz[i].label + ' 에서 ' + (d > 0 ? '+' : '') + d + 'cm — 치수표를 다시 확인'); }
    if (p.sizes && p.sizes.length) {
      const key = JSON.stringify(p.sizes.map((s) => [s.chest, s.chestCirc, s.length, s.shoulder]));
      if (tables.has(key) && !/같은 치수표/.test(p.sizeNote || '')) wn(id, tables.get(key) + ' 와 치수표가 똑같음 — 복사 실수인지 확인(판매처가 같은 표를 쓰면 sizeNote 에 "같은 치수표"라고 적기)');
      else tables.set(key, id);
    }
    if (p.sizes && p.sizes.length && !p.sizeSrc) e(id, '치수에는 출처(sizeSrc)가 있어야 한다');
    if (p.offered && p.stock && Array.isArray(p.stock.sizes)) for (const s of p.stock.sizes) if (p.offered.indexOf(s) < 0) e(id, '재고 사이즈 ' + s + ' 가 판매 사이즈(offered)에 없음');
    if (!p.stock || !date(p.stock.checkedAt)) e(id, '재고 확인일(실제 날짜)');
    else {
      if (days(p.stock.checkedAt) < -1) e(id, '재고 확인일이 미래');
      else if (days(p.stock.checkedAt) > P.STALE_DAYS) wn(id, '재고를 확인한 지 ' + days(p.stock.checkedAt) + '일 — 화면에서 재고를 이유로 쓰지 않는다');
      if (p.stock.inStock != null && typeof p.stock.inStock !== 'boolean') e(id, 'stock.inStock 은 true|false 여야 한다: ' + JSON.stringify(p.stock.inStock));
      if (p.stock.sizes != null && !(Array.isArray(p.stock.sizes) && p.stock.sizes.every((s) => typeof s === 'string'))) e(id, 'stock.sizes 는 글자 배열이어야 한다');
    }
    if (p.packCount != null && !(Number.isInteger(p.packCount) && p.packCount >= 1 && p.packCount <= 12)) e(id, 'packCount');
    if (p.shipping) {
      const s = p.shipping, rng = SHIP[p.currency] || [0, 0];
      if (!(isNum(s.fee) && s.fee >= rng[0] && s.fee <= rng[1])) e(id, '배송비(fee)는 상품과 같은 통화의 숫자: ' + JSON.stringify(s.fee));
      if (s.currency != null && s.currency !== p.currency) e(id, '배송비 통화(' + s.currency + ')가 상품 통화(' + p.currency + ')와 다름');
      if (s.freeOver != null && !isNum(s.freeOver)) e(id, 'freeOver 는 숫자');
      if (s.checkedAt != null && !date(s.checkedAt)) e(id, '배송비 확인일 형식');
      if (s.estimate != null && typeof s.estimate !== 'boolean') e(id, 'shipping.estimate 는 true|false');
    } else if (p.currency === 'KRW') e(id, '배송비(shipping)가 없음 — 원화 상품은 배송비를 모르면 지금 낼 돈이 낮게 잡혀 유리해진다(무료면 fee: 0)');
    if (p.currency !== 'KRW' && !p.shipping) wn(id, '해외 상품인데 배송비(shipping)가 없음 — 가성비를 중간 이하로 본다');
    if (!p.logo) wn(id, '로고 위치 모름'); if (!p.fabric || p.fabric.thick == null) wn(id, '두께 모름');
  }
  for (const [k, v] of Object.entries(staleByLine)) if (v.n && v.stale / v.n >= 0.3) e('lines.' + k, '[만료] 상품 ' + v.n + '개 중 ' + v.stale + '개가 확인한 지 ' + P.STALE_DAYS + '일이 지남 — 다시 확인한 뒤 배포한다');
  // 받쳐 입기 조건을 판단할 근거가 얼마나 있는지(조건별 확인율). 모르는 값은 화면에서 ?로 보인다
  for (const k of Object.keys(lines)) {
    const ps = raw.products.filter((x) => x && x.line === k), n = ps.length, strong = (src) => own(P.STRONG, src);
    if (!n) continue;
    const cov = (has, ok) => ps.filter(has).length + '/' + n + '(확인 ' + ps.filter((x) => has(x) && ok(x)).length + ')';
    wn('lines.' + k, '조건 근거 — 목 립 ' + cov((x) => x.neck != null, (x) => strong(x.neckSrc)) + ' · 두께 ' + cov((x) => x.fabric && x.fabric.thick != null, (x) => strong(x.fabric.thickSrc)) + ' · 로고 ' + cov((x) => x.logo != null, (x) => x.logo === 'none' || strong(x.logoSrc)) + ' · 핏 ' + cov((x) => x.fit != null, (x) => strong(x.fitSrc)));
    const noNeck = ps.filter((x) => x.neck == null).map((x) => x.id);
    if (noNeck.length) wn('lines.' + k, '목 립 정보 없음 ' + noNeck.length + '개(받쳐 입기에서 ?): ' + noNeck.join(', '));
  }
  // 앱 정리 함수가 빼거나 바꾸는 값이 없어야 한다(조용히 사라지거나 바뀌는 것을 막는다)
  const clean = P.cleanPicks(raw);
  if (!clean) e('', '앱이 이 파일을 읽지 못한다');
  else {
    if (clean.products.length !== raw.products.length) e('', '앱이 읽을 때 ' + (raw.products.length - clean.products.length) + '개가 빠진다: ' + raw.products.filter((x) => x && !clean.products.some((c) => c.id === x.id)).map((x) => x && x.id).join(', '));
    for (const c of clean.products) {
      const r = raw.products.find((x) => x && x.id === c.id); if (!r) continue;
      const same = (a, b, what) => { if (a !== b) e(c.id, '앱이 읽으면 ' + what + ' 가 바뀐다: ' + JSON.stringify(b) + ' → ' + JSON.stringify(a)); };
      same(c.price, r.price, 'price'); same(c.currency, r.currency, 'currency'); same(c.checkedAt, r.checkedAt, 'checkedAt'); same(c.packCount, r.packCount == null ? 1 : r.packCount, 'packCount');
      same(c.sizes.length, (r.sizes || []).length, '사이즈 수');
      c.sizes.forEach((s, i) => { const o = (r.sizes || [])[i] || {}; for (const k of ['chest', 'length', 'shoulder']) if (o[k] != null) same(s[k], o[k], s.label + ' ' + k); });
      same(c.shipping ? c.shipping.fee : null, r.shipping ? r.shipping.fee : null, '배송비');
      same(c.stock ? c.stock.inStock : null, r.stock && r.stock.inStock != null ? r.stock.inStock : null, '재고 여부');
      same(c.styles.length, (r.styles || []).length, '스타일 수');
      if (r.light != null) same(c.light, Math.round(r.light), 'light'); if (r.pattern != null) same(c.pattern, r.pattern, 'pattern'); if (r.formality != null) same(c.formality, r.formality, 'formality');
      same(c.seasons.length, (r.seasons || []).length, '계절 수'); if (r.store && r.store.type != null) same(c.store.type, r.store.type, 'store.type');
      if (r.fit != null) same(c.fit, r.fit, 'fit'); if (r.logo != null) same(c.logo, r.logo, 'logo'); if (r.neck != null) same(c.neck, r.neck, 'neck');
      if (r.lengthFrom != null) same(c.lengthFrom, r.lengthFrom, 'lengthFrom'); same(c.offered ? c.offered.length : null, Array.isArray(r.offered) ? r.offered.length : null, '판매 사이즈 수');
    }
  }
  for (const n of raw.brandNotes || []) { if (!own(brands, n.brand)) e('brandNotes', '등록 안 된 브랜드 ' + n.brand); if (n.line != null && !own(lines, n.line)) e('brandNotes', n.brand + ' 등록 안 된 품목 ' + n.line); if (n.checkedAt != null && !date(n.checkedAt)) e('brandNotes', n.brand + ' 확인일 형식'); }
  return { errors, warnings };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const file = process.argv[2] || path.join(root, 'data/picks.json');
  const today = process.env.TODAY || new Date().toISOString().slice(0, 10);
  const { errors, warnings } = validate(JSON.parse(fs.readFileSync(file, 'utf8')), today);
  for (const w of warnings) console.log('  주의 ' + w);
  for (const x of errors) console.log('  오류 ' + x);
  console.log(errors.length ? '카탈로그 오류 ' + errors.length + '건' : '카탈로그 이상 없음 (주의 ' + warnings.length + '건)');
  process.exit(errors.length ? 1 : 0);
}
