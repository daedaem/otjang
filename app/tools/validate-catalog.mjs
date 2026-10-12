// 검증 카탈로그(data/picks.json)를 엄격하게 검사한다. 오타·빠진 값·말이 안 되는 값을 빌드 전에 막는다.
// 앱의 정리 함수(cleanPicks)는 이상한 상품을 조용히 빼거나 기본값으로 바꾸므로, 여기서는 그런 일이 생기면 실패로 알린다.
// 사용: node tools/validate-catalog.mjs [파일]   (build.mjs 와 npm test 가 부른다. 오류가 있으면 1로 끝난다)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const W = require(path.join(root, 'src/wardrobe.js'));
const P = require(path.join(root, 'src/pick.js'));

/** 검사 결과: { errors: [...], warnings: [...] }. today 는 확인일이 미래인지·오래됐는지 볼 기준일. */
export function validate(raw, today) {
  const errors = [], warnings = [];
  const e = (id, msg) => errors.push((id ? id + ': ' : '') + msg), wn = (id, msg) => warnings.push((id ? id + ': ' : '') + msg);
  if (!raw || raw.schema !== 1 || raw.kind !== 'picks' || !Array.isArray(raw.products)) { e('', 'schema 1, kind "picks", products 배열이어야 한다'); return { errors, warnings }; }
  const lines = raw.lines || {}, brands = raw.brands || {}, fx = raw.fx || {};
  const PRICE = { KRW: [3000, 1500000], USD: [3, 1500] };                                              // [제안값] 한 상품(묶음) 가격으로 말이 되는 범위
  const days = (d) => Math.round((Date.parse(today + 'T00:00:00Z') - Date.parse(d + 'T00:00:00Z')) / 86400000);
  for (const [k, l] of Object.entries(lines)) {
    if (!/^[a-z0-9-]{1,40}$/.test(k)) e('lines.' + k, '품목 키 형식');
    if (!l.label) e('lines.' + k, 'label 없음');
    if (!W.CATS[l.cat]) e('lines.' + k, '모르는 분류 ' + l.cat);
    if (l.value && !(l.value.lo > 0 && l.value.hi > l.value.lo)) e('lines.' + k, 'value.lo < value.hi 여야 한다');
  }
  for (const [k, b] of Object.entries(brands)) if (!/^[a-z0-9-]{1,30}$/.test(k) || !b.name) e('brands.' + k, '키 형식 또는 이름');
  if (fx.USD) { if (!(fx.USD.krw > 500 && fx.USD.krw < 3000)) e('fx.USD', '환율 범위'); const a = days(fx.USD.date); if (a < -1) e('fx.USD', '날짜가 미래'); else if (a > 30) wn('fx.USD', a + '일 전 환율'); }
  const ids = new Set();
  for (const p of raw.products) {
    const id = p && p.id || '(id 없음)';
    if (ids.has(id)) e(id, 'id 중복'); ids.add(id);
    if (!lines[p.line]) e(id, '등록 안 된 품목 ' + p.line);
    if (!brands[p.brand]) e(id, '등록 안 된 브랜드 ' + p.brand);
    if (!W.CATS[p.cat]) e(id, '모르는 분류 ' + p.cat); else if (!W.KINDS[p.cat][p.kind]) e(id, '모르는 종류 ' + p.kind);
    if (lines[p.line] && (lines[p.line].cat !== p.cat || (lines[p.line].kind && lines[p.line].kind !== p.kind))) e(id, '품목과 분류·종류가 다름');
    if (!W.FAM[p.family]) e(id, '모르는 색 계열 ' + p.family);
    if (['short', 'long'].indexOf(p.sleeve) < 0) e(id, 'sleeve 는 short|long');
    if (!PRICE[p.currency]) e(id, '통화 ' + p.currency);
    else if (!(typeof p.price === 'number' && p.price >= PRICE[p.currency][0] && p.price <= PRICE[p.currency][1])) e(id, '가격 범위 밖 ' + p.price + ' ' + p.currency);
    if (p.currency !== 'KRW' && !fx[p.currency]) e(id, '환율 없는 통화');
    if (p.listPrice != null && !(p.listPrice > p.price)) e(id, 'listPrice 는 할인 전 가격(현재가보다 커야 함)');
    if (!/^https:\/\//.test(p.store && p.store.url || '')) e(id, '판매처 주소(https)');
    if (!Array.isArray(p.evidence) || !p.evidence.length || p.evidence.some((x) => !/^https:\/\//.test(x.url || '') || !/^\d{4}-\d{2}-\d{2}$/.test(x.seen || ''))) e(id, '근거(evidence) 주소·확인일');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.checkedAt || '')) e(id, 'checkedAt 형식');
    else { const a = days(p.checkedAt); if (a < -1) e(id, '확인일이 미래 ' + p.checkedAt); else if (a > P.STALE_DAYS) wn(id, '확인한 지 ' + a + '일 (다시 확인 필요)'); }
    const f = p.fabric || {};
    if (f.fiber != null && !P.FIBERS[f.fiber]) e(id, '모르는 원사 ' + f.fiber);
    if (f.knit != null && !P.KNITS[f.knit]) e(id, '모르는 편직 ' + f.knit);
    if (f.thick != null && !P.THICK[f.thick]) e(id, '모르는 두께 ' + f.thick);
    for (const k of ['compSrc', 'fiberSrc', 'thickSrc']) if (f[k] != null && !P.SRC[f[k]]) e(id, '모르는 출처 ' + k + '=' + f[k]);
    if (f.thick != null && !f.thickSrc) e(id, '두께에는 출처(thickSrc)가 있어야 한다');
    if (f.fiber != null && !f.fiberSrc) wn(id, '원사 출처(fiberSrc) 없음 — 공식으로 본다');
    if (typeof f.cotton100 !== 'boolean' && f.cotton100 != null) e(id, 'cotton100 은 true|false|null');
    if (f.cotton100 === true && f.comp && !/100/.test(f.comp)) e(id, 'cotton100 인데 혼용률에 100이 없음: ' + f.comp);
    if (p.neck != null && !P.NECKS[p.neck]) e(id, '모르는 목 ' + p.neck);
    if (p.neck != null && !p.neckSrc) e(id, '목에는 출처(neckSrc)가 있어야 한다');
    if (p.logo != null && !P.LOGOS[p.logo]) e(id, '모르는 로고 ' + p.logo);
    if (p.fit != null && !P.FIT[p.fit]) e(id, '모르는 핏 ' + p.fit);
    for (const s of p.styles || []) if (!P.STYLES[s]) e(id, '모르는 스타일 ' + s);
    const labels = new Set();
    for (const s of p.sizes || []) {
      if (!s.label) e(id, '사이즈 이름 없음'); if (labels.has(s.label)) e(id, '사이즈 이름 중복 ' + s.label); labels.add(s.label);
      const chest = s.chest != null ? s.chest : s.chestCirc != null ? s.chestCirc / 2 : null;
      if (chest != null && !(chest >= 35 && chest <= 90)) e(id, s.label + ' 가슴 너비 ' + chest);
      if (s.length != null && !(s.length >= 50 && s.length <= 100)) e(id, s.label + ' 총장 ' + s.length);
      if (s.shoulder != null && !(s.shoulder >= 30 && s.shoulder <= 70)) e(id, s.label + ' 어깨 ' + s.shoulder);
    }
    if (p.sizes && p.sizes.length && !p.sizeSrc) e(id, '치수에는 출처(sizeSrc)가 있어야 한다');
    if (p.offered && p.stock && Array.isArray(p.stock.sizes)) for (const s of p.stock.sizes) if (p.offered.indexOf(s) < 0) e(id, '재고 사이즈 ' + s + ' 가 판매 사이즈(offered)에 없음');
    if (!p.stock || !/^\d{4}-\d{2}-\d{2}$/.test(p.stock.checkedAt || '')) e(id, '재고 확인일');
    if (p.packCount != null && !(Number.isInteger(p.packCount) && p.packCount >= 1 && p.packCount <= 12)) e(id, 'packCount');
    if (p.currency !== 'KRW' && !p.shipping) wn(id, '해외 상품인데 배송비(shipping)가 없음 — 가성비를 중간으로 본다');
    if (!p.logo) wn(id, '로고 위치 모름'); if (!p.fabric || p.fabric.thick == null) wn(id, '두께 모름');
  }
  // 앱 정리 함수가 빼는 상품이 없어야 한다(조용히 사라지는 것을 막는다)
  const clean = P.cleanPicks(raw);
  if (clean && clean.products.length !== raw.products.length) e('', '앱이 읽을 때 ' + (raw.products.length - clean.products.length) + '개가 빠진다: ' + raw.products.filter((x) => !clean.products.some((c) => c.id === x.id)).map((x) => x.id).join(', '));
  for (const n of raw.brandNotes || []) if (!brands[n.brand]) e('brandNotes', '등록 안 된 브랜드 ' + n.brand);
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
