/*
 * Pick — 사고 싶은 옷 하나를 "내 기준"으로 골라 주는 추천. 검증 카탈로그(data/picks.json) 안에서만 고른다. AI를 쓰지 않는다.
 *
 * 카탈로그: 공식 스토어·공식 판매처의 상품 페이지에서 직접 확인한 값만 들어 있다. 값마다 출처 등급(SRC)이 있다.
 *   가격·재고는 확인한 날(checkedAt)의 값이다. 상품 사진은 가져오지 않고 판매처 링크만 둔다. 스타일 분류(styles)는 어울의 편집 판단이다.
 *
 * 기준(CRITERIA) — 누른 순서대로 무게 3·2·1.5·1.2·1, 누르지 않은 기준은 0.5 [제안값]
 *   value   가성비: 한 장 값(배송비를 알면 포함) ÷ 품질 점수. 품목마다 고정 기준선(lines[].value.lo·hi)으로 0~1. 목록에 무엇이 있든 같은 상품은 같은 값
 *   quality 공개된 품질 근거: 면 100%, 수피마·라일·링스펀, 루프휠·통짜·인터로크, 바인딩 목. 출처 등급으로 가중(공식·고시 1, 상품명·직접 입력 0.5, 판매처 설명 0.3).
 *           정보를 밝히지 않은 상품은 낮게 나온다(품질이 낮다는 뜻이 아니다)
 *   brand   좋아하는 브랜드 1, 같은 계열(폴로 ↔ 퍼플 라벨) 0.5. 브랜드를 고르지 않았으면 '중립'(결론·근거에 쓰지 않음)
 *   fit     잘 맞는 옷 실측과 가장 가까운 사이즈, 또는 평소 사이즈의 판매·재고. 둘 다 없으면 '중립'
 *   style   고른 스타일(편집 분류)과 겹치면 1. 기본 품목(styleRole: 'tiebreak')은 무게를 0.3 이하로 묶어 동점 깨기에만 쓴다
 * 1순위 기준 문턱(GATE): 1순위 기준이 '보통'(0.5) 이상인 상품이 있으면 1등은 그 안에서 고른다. 문턱이 고정값이라 순위 밖 상품을 빼도 1등은 바뀌지 않는다.
 * 용도(USES)와 꼭 지킬 조건(CONDS): 받쳐 입기 → 로고 안 보이게·얇게·목 립 좁게 / 한 장으로 → 비치지 않게.
 *   근거 강도: 공식·고시·공식 원단 무게·직접 입력은 '확인'(✓), 판매처 설명·사진 판단·상품명은 '약한 확인'(◐). 로고는 상품 사진으로 보면 확인으로 본다.
 *   조건을 어긴 것이 '확인'된 상품은 1등·대안에서 빼고 이유를 알린다. 약한 근거로만 어긋나 보이면 빼지 않고 경고(!)한다. 모르는 값은 '?'.
 *   점수: 확인 1, 약한 확인 0.75, 모름 0.5, 경고 0.25 (용도 무게 2.5) [제안값]
 * 오래된 자료: 점수는 날짜로 바꾸지 않는다. 14일이 지나면 '다시 확인 필요'를 붙이고 가성비를 이유로 말하지 않으며, 30일이 지나면 1등 후보에서 뺀다.
 * 예산(budget): 지금 낼 돈(묶음 전체 + 아는 배송비)이 넘으면 1등 후보에서 뺀다.
 *
 * recommend(items, catalog, query) → { pick, alts, ranked, eligible, excluded, notes, rank, gate, gapWhy, favNote, about }
 *   query: { line, sleeve, use, conds: [조건], priorities: [기준 순서], brands, styles, size, ref: {chest,length,shoulder}, budget, extra: [userProduct], today }
 * 점수는 0~100의 가중 평균이다. 확률이 아니다. 같은 입력이면 같은 결과가 나온다.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./judge.js'), require('./wardrobe.js'));
  else root.Pick = factory(root.Judge, root.Wardrobe);
})(typeof self !== 'undefined' ? self : this, function (J, W) {
  'use strict';
  const SCHEMA = 1;
  const STALE_DAYS = 14, DROP_DAYS = 30, FX_DAYS = 30;                                                 // [제안값] 14일 지나면 '다시 확인 필요', 30일 지나면 1등 후보에서 뺀다
  const CRITERIA = { value: '가성비', quality: '품질(소재·봉제)', brand: '브랜드', fit: '내 핏', style: '스타일' };
  const SHORT = { value: '가성비', quality: '품질', brand: '브랜드', fit: '핏', style: '스타일' };
  const STYLES = { 'american-classic': '아메리칸 클래식', preppy: '프레피', amekaji: '아메카지', workwear: '워크웨어', minimal: '미니멀', normcore: '놈코어', gorpcore: '고프코어', street: '스트리트' };
  const USES = { any: '상관없음', layer: '받쳐 입기', solo: '한 장으로' };
  const USE_LONG = { any: '', layer: '카디건·셔츠 안에 받쳐 입기', solo: '한 장으로 입기' };
  const CONDS = { noLogo: { label: '로고 안 보이게', use: 'layer', noun: '로고 위치' }, thin: { label: '얇게', use: 'layer', noun: '두께' }, narrowNeck: { label: '목 립 좁게', use: 'layer', noun: '목 립 폭' },
    notLonger: { label: '카디건보다 짧게', use: 'layer', noun: '총장', needs: 'outerLen' }, notSheer: { label: '비치지 않게', use: 'solo', noun: '비침' } };   // notLonger: 겉에 입을 카디건 총장(outerLen)을 넣었을 때만
  const SLEEVES = { short: '반팔', long: '긴팔', any: '상관없음' };
  const FIT = { slim: '슬림핏', regular: '레귤러핏', relaxed: '루즈·박스핏' };
  const THICK = { thin: '얇음', mid: '보통', thick: '두꺼움' };
  const NECKS = { narrow: '목 립이 좁은 편', standard: '기본 립 크루넥', binding: '바인딩 목', wide: '목 립이 넓은 편' };
  const LOGOS = { none: '겉 로고 없음', hem: '밑단 로고', 'small-chest': '가슴 작은 자수', chest: '가슴 자수', tab: '작은 탭·라벨', print: '프린트' };
  const SRC = { official: '공식', notice: '상품정보제공고시', name: '상품명에만', seller: '판매처 설명', photo: '상품 사진으로 본 판단', 'official-weight': '공식 원단 무게로 판단', user: '직접 입력', measured: '어울이 직접 잼' };
  const SRC_W = { official: 1, notice: 1, 'official-weight': 1, measured: 1, photo: 0.6, name: 0.5, user: 0.5, seller: 0.3 };   // [제안값] 품질 근거의 강도
  const STRONG = { official: 1, notice: 1, 'official-weight': 1, measured: 1, user: 1 };              // 조건 판정에서 '확인'으로 보는 출처
  const COND_W = { ok: 1, weak: 0.75, unknown: 0.5, warn: 0.25 };                                       // [제안값]
  const FIBERS = { supima: '수피마 코튼', pima: '피마 코튼', lisle: '라일사', ringspun: '링스펀 코튼', giza: '기자 코튼' };
  const KNITS = { jersey: '저지', interlock: '인터로크', loopwheel: '루프휠' };
  const BUDGETS = [0, 30000, 50000, 100000];
  const PRI_W = [3, 2, 1.5, 1.2, 1];                                                                   // [제안값] 누른 순서대로의 무게
  const OFF_W = 0.5, USE_W = 2.5, TIEBREAK_W = 0.3, GATE = 0.5;                                        // [제안값]
  const SIZE_ALIAS = { '90': 'XS', '95': 'S', '100': 'M', '105': 'L', '110': 'XL', '115': 'XXL', '2XL': 'XXL', 'XXXL': '3XL' };
  const DEFAULT_VALUE = { lo: 2500, hi: 50000 };

  const str = W.str, num = W.num, safeLink = W.safeLink;
  const arr = (v) => (Array.isArray(v) ? v : []);
  const has = (dict, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(dict, k);
  const pick1 = (v, dict) => (has(dict, v) ? v : null);
  /** 실제로 있는 날짜만(2026-10-32 같은 것은 받지 않는다). */
  const realDate = (v) => { const d = W.safeDate(v); if (!d) return ''; const t = Date.parse(d + 'T00:00:00Z'); return isFinite(t) && new Date(t).toISOString().slice(0, 10) === d ? d : ''; };
  const won = (n) => Math.round(n).toLocaleString('ko-KR') + '원';
  const signedWon = (n) => (Math.round(n) === 0 ? '같은 값' : (n > 0 ? '+' : '−') + Math.abs(Math.round(n)).toLocaleString('ko-KR') + '원');
  const kd = (d) => { const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(d || ''); return m ? Number(m[1]) + '월 ' + Number(m[2]) + '일' : d || ''; };   // 화면 문장의 날짜: 10월 13일
  const SIZE_SRC = { official: '공식 치수', notice: '공식 치수', seller: '판매처 치수표', photo: '사진 판단', name: '상품명', 'official-weight': '공식', user: '직접 입력', measured: '어울이 직접 잼' };
  const normSize = (label) => { const l = String(label || '').trim().toUpperCase(); return has(SIZE_ALIAS, l) ? SIZE_ALIAS[l] : l; };
  /** 조사: 한글은 받침, 라틴 글자·숫자는 읽는 소리(엠·엘·엔·알, 영·일·삼·육·칠·팔, 10의 배수)로 받침을 정한다. */
  function batchim(word) {
    const s = String(word).replace(/[\s)\]'"]+$/, ''), ch = s.charCodeAt(s.length - 1);
    if (ch >= 0xac00 && ch <= 0xd7a3) return (ch - 0xac00) % 28 !== 0;
    const c = s.slice(-1).toUpperCase();
    if (/[LMNR]/.test(c)) return true;
    if (/[A-Z]/.test(c)) return false;
    if (/[0-9]/.test(c)) return '0136780'.indexOf(c) >= 0;                                           // 0(영·십·백), 1(일), 3(삼), 6(육), 7(칠), 8(팔)
    return null;
  }
  function josa(word, a, b) { const t = batchim(word); return String(word) + (t == null ? a + '(' + b + ')' : t ? a : b); }
  /** '(으)로': 받침이 없거나 ㄹ 받침이면 '로'. */
  function euro(word) { const s = String(word), ch = s.charCodeAt(s.length - 1); if (ch >= 0xac00 && ch <= 0xd7a3) { const j = (ch - 0xac00) % 28; return s + (j === 0 || j === 8 ? '로' : '으로'); } const t = batchim(s); return s + (t ? '으로' : '로'); }
  /** 낱말들을 '·'로 잇고 마지막 낱말의 받침에 맞춰 조사를 붙인다. */
  function joinJosa(words, withBatchim, without) { return josa(words.join('·'), withBatchim, without); }

  // ---------- 정리 (모르는 값은 받지 않거나 null 로 둔다) ----------
  function cleanSize(s) {
    if (!s || typeof s !== 'object') return null;
    const out = { label: str(s.label, 12).trim() };
    if (!out.label) return null;
    const al = str(s.alias, 8).trim(); if (al) out.alias = normSize(al);
    for (const k of ['length', 'shoulder', 'chest', 'chestCirc', 'sleeve']) { const v = num(s[k], 1, 250); if (v != null) out[k] = v; }
    if (out.chest == null && out.chestCirc != null) out.chest = Math.round((out.chestCirc / 2) * 10) / 10;   // 둘레만 있으면 반으로 나눠 너비로 견준다
    return out;
  }
  /**
   * 상품 하나를 정리한다. 판매처 주소·가격(1 이상)·실제 확인일·알려진 분류·종류가 없으면 null.
   * opts.user: '지금 보는 상품'처럼 사용자가 직접 넣은 상품(주소는 없어도 되고, 출처 기본값이 '직접 입력').
   */
  function cleanPickProduct(raw, i, opts) {
    if (!raw || typeof raw !== 'object') return null;
    const user = !!(opts && opts.user);
    const cat = has(W.CATS, raw.cat) ? raw.cat : null;
    const name = str(raw.name, 100).trim(), id = str(raw.id, 60).trim();
    const store = raw.store && typeof raw.store === 'object' ? raw.store : {};
    const url = safeLink(store.url), currency = raw.currency === 'USD' ? 'USD' : raw.currency === 'KRW' ? 'KRW' : null;
    const price = num(raw.price, currency === 'KRW' ? 100 : 1, 1e9);                                // 0원·오타 같은 값은 받지 않는다
    const checkedAt = realDate(raw.checkedAt);
    if (!cat || !name || !id || (!url && !user) || price == null || !currency || !checkedAt || !has(W.KINDS[cat], raw.kind)) return null;
    const dflt = user ? 'user' : 'official';
    const f = raw.fabric && typeof raw.fabric === 'object' ? raw.fabric : {};
    const st = raw.stock && typeof raw.stock === 'object' ? raw.stock : null;
    const sh = raw.shipping && typeof raw.shipping === 'object' ? raw.shipping : null;
    const shipFee = sh ? num(sh.fee, 0, currency === 'KRW' ? 100000 : 1000) : null;                   // 배송비는 상품과 같은 통화로 적는다(원화 10만 원, 달러 1,000 까지)
    return {
      id, line: str(raw.line, 40), brand: str(raw.brand, 40), brandLabel: str(raw.brandLabel, 40), name, code: str(raw.code, 60), colorName: str(raw.colorName, 40),
      cat, kind: raw.kind, family: has(W.FAM, raw.family) ? raw.family : 'gray',
      light: num(raw.light, 0, 100) == null ? 50 : Math.round(raw.light), formality: [1, 2, 3].indexOf(raw.formality) >= 0 ? raw.formality : 2,
      pattern: has(W.PATTERNS, raw.pattern) ? raw.pattern : 'solid', seasons: arr(raw.seasons).filter((s) => W.SEASONS.indexOf(s) >= 0),
      sleeve: raw.sleeve === 'long' ? 'long' : 'short', fit: pick1(raw.fit, FIT), fitNote: str(raw.fitNote, 120),
      fabric: { comp: str(f.comp, 140), cotton100: f.cotton100 === true ? true : f.cotton100 === false ? false : null, compSrc: pick1(f.compSrc, SRC) || dflt,
        fiber: pick1(f.fiber, FIBERS), fiberSrc: pick1(f.fiberSrc, SRC) || (f.fiber ? dflt : null), knit: pick1(f.knit, KNITS), knitSrc: pick1(f.knitSrc, SRC) || (f.knit ? dflt : null), weight: str(f.weight, 20),
        thick: pick1(f.thick, THICK), thickSrc: pick1(f.thickSrc, SRC) || (user && f.thick ? 'user' : null), notes: arr(f.notes).map((n) => str(n, 200)).filter(Boolean).slice(0, 6) },
      build: arr(raw.build).map((b) => str(b, 20)).filter(Boolean).slice(0, 8), buildSrc: pick1(raw.buildSrc, SRC) || dflt, neck: pick1(raw.neck, NECKS), neckSrc: pick1(raw.neckSrc, SRC) || (user && raw.neck ? 'user' : null),
      logo: pick1(raw.logo, LOGOS), logoNote: str(raw.logoNote, 120), logoSrc: pick1(raw.logoSrc, SRC) || (user && raw.logo ? 'user' : null), origin: str(raw.origin, 40),
      sizes: arr(raw.sizes).map(cleanSize).filter(Boolean).slice(0, 12), sizeSrc: pick1(raw.sizeSrc, SRC) || (user ? 'user' : null), sizeNote: str(raw.sizeNote, 200),
      offered: Array.isArray(raw.offered) ? raw.offered.map((s) => str(s, 8).trim()).filter(Boolean).slice(0, 12) : null,
      price, currency, listPrice: num(raw.listPrice, 1, 1e9), priceNote: str(raw.priceNote, 200), packCount: num(raw.packCount, 1, 12) || 1,
      shipping: shipFee != null ? { fee: shipFee, freeOver: num(sh.freeOver, 0, currency === 'KRW' ? 10000000 : 100000), note: str(sh.note, 200), url: safeLink(sh.url) } : null,
      stock: st ? { sizes: Array.isArray(st.sizes) ? st.sizes.map((s) => str(s, 8)).filter(Boolean) : null, inStock: st.inStock === true ? true : st.inStock === false ? false : null, checkedAt: realDate(st.checkedAt) } : null,
      store: { name: str(store.name, 60) || (user ? '직접 넣은 상품' : ''), type: store.type === 'official' ? 'official' : 'retailer', url },
      styles: arr(raw.styles).filter((s) => has(STYLES, s)).slice(0, 4), checkedAt,
      evidence: arr(raw.evidence).map((e) => (e && typeof e === 'object' && safeLink(e.url) ? { url: safeLink(e.url), what: str(e.what, 240), seen: realDate(e.seen) } : null)).filter(Boolean).slice(0, 6),
      user, _i: i || 0,
    };
  }
  /** picks.json 을 정리한다. 모르는 파일이면 null. 품목(line)이 등록되지 않은 상품은 뺀다(오타 방지). */
  function cleanPicks(raw) {
    if (!raw || typeof raw !== 'object' || raw.schema !== SCHEMA || raw.kind !== 'picks' || !Array.isArray(raw.products)) return null;
    const ids = new Set();
    const brands = {};
    if (raw.brands && typeof raw.brands === 'object') for (const k of Object.keys(raw.brands).slice(0, 80)) {
      const b = raw.brands[k]; if (!b || typeof b !== 'object' || !/^[a-z0-9-]{1,30}$/.test(k) || k === 'constructor') continue;
      brands[k] = { name: str(b.name, 60), ko: str(b.ko, 40) || str(b.name, 40), aliases: arr(b.aliases).map((a) => str(a, 40).toLowerCase()).filter(Boolean).slice(0, 10), family: str(b.family, 30) };
    }
    const fx = {};
    if (raw.fx && raw.fx.USD && num(raw.fx.USD.krw, 100, 10000) != null) fx.USD = { krw: raw.fx.USD.krw, date: realDate(raw.fx.USD.date), source: safeLink(raw.fx.USD.source), note: str(raw.fx.USD.note, 120) };
    const lines = {};
    if (raw.lines && typeof raw.lines === 'object') for (const k of Object.keys(raw.lines).slice(0, 40)) {
      const l = raw.lines[k]; if (!l || typeof l !== 'object' || !/^[a-z0-9-]{1,40}$/.test(k) || k === 'constructor') continue;
      const v = l.value && typeof l.value === 'object' && num(l.value.lo, 1, 1e7) != null && num(l.value.hi, 2, 1e8) != null && l.value.hi > l.value.lo ? { lo: l.value.lo, hi: l.value.hi } : DEFAULT_VALUE;
      lines[k] = { label: str(l.label, 40), cat: has(W.CATS, l.cat) ? l.cat : 'top', kind: str(l.kind, 20), family: str(l.family, 20), value: v, styleRole: l.styleRole === 'tiebreak' ? 'tiebreak' : 'normal', styleNote: str(l.styleNote, 120) };
    }
    const products = raw.products.slice(0, 2000).map((p, i) => cleanPickProduct(p, i)).filter(Boolean).filter((p) => (ids.has(p.id) ? false : ids.add(p.id)))
      .filter((p) => has(lines, p.line) && (p.currency === 'KRW' || has(fx, p.currency)));         // 등록 안 된 품목·환율 없는 외화 상품은 견줄 수 없어 뺀다
    const brandNotes = arr(raw.brandNotes).map((n) => (n && typeof n === 'object' ? { brand: str(n.brand, 30), line: str(n.line, 40), text: str(n.text, 300), checkedAt: realDate(n.checkedAt), url: safeLink(n.url) } : null)).filter((n) => n && n.text);
    return { schema: SCHEMA, kind: 'picks', name: str(raw.name, 60), updatedAt: realDate(raw.updatedAt), about: str(raw.about, 400), fx, brands, lines, brandNotes, products };
  }

  // ---------- 하나하나 재기 ----------
  const brandName = (cat, key) => (has(cat.brands, key) ? cat.brands[key].ko || cat.brands[key].name : key);
  const pname = (cat, p) => {
    const b = p.user ? p.brandLabel || (p.brand ? brandName(cat, p.brand) : '') : brandName(cat, p.brand);
    return (b && p.name.toLowerCase().indexOf(String(b).toLowerCase()) !== 0 ? b + ' ' + p.name : p.name).trim();   // 이름이 이미 브랜드로 시작하면 두 번 쓰지 않는다
  };
  /** 글자로 적은 브랜드를 카탈로그의 브랜드 열쇠로(이름·한글 이름·별칭이 같으면). 없으면 ''. */
  function brandKey(cat, text) {
    const t = String(text || '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (!t) return '';
    for (const k of Object.keys(cat.brands)) { const b = cat.brands[k]; if (k === t || b.name.toLowerCase() === t || b.ko.toLowerCase() === t || b.aliases.indexOf(t) >= 0) return k; }
    return '';
  }
  function daysSince(date, today) { const d = realDate(date), t = realDate(today) || W.today(); if (!d) return null; const n = Math.round((Date.parse(t + 'T00:00:00Z') - Date.parse(d + 'T00:00:00Z')) / 86400000); return isFinite(n) ? n : null; }
  /** 원화 가격(묶음 전체, 해외면 상품값만). */
  function krw(p, cat) { return p.currency === 'KRW' ? p.price : Math.round(p.price * cat.fx[p.currency].krw); }
  /** 지금 낼 돈(묶음 전체, 아는 배송비 포함)과 한 장 값. landed=false 면 배송비를 모른다(해외). */
  function unitPrice(p, cat) {
    const rate = p.currency === 'KRW' ? 1 : cat.fx[p.currency].krw;
    const ship = p.shipping ? (p.shipping.freeOver != null && p.price >= p.shipping.freeOver ? 0 : p.shipping.fee) : null;
    const landed = p.currency === 'KRW' || ship != null;
    const pay = Math.round((p.price + (ship || 0)) * rate);
    return { krw: pay / p.packCount, pay, landed, ship: ship == null ? null : Math.round(ship * rate), shipKnown: ship != null };
  }

  /** 공개된 품질 근거(3~10): 출처 등급으로 가중한다. parts 는 화면에 그대로 보여 줄 근거, unknown 은 밝히지 않은 것, known 은 정보 공개 정도. */
  function qualityOf(p) {
    const parts = [], unknown = [];
    let s = 3;
    const f = p.fabric, w = (src) => (has(SRC_W, src) ? SRC_W[src] : 1), tag = (src) => (src && src !== 'official' ? ' (' + SRC[src] + ')' : '');
    const add = (pts, src, text) => { const v = Math.round(pts * w(src) * 100) / 100; s += v; parts.push(text + tag(src)); };
    if (f.cotton100 === true) add(1, f.compSrc, '면 100%');
    else if (f.cotton100 === false) parts.push('혼방: ' + (f.comp || '면 외 섬유 포함') + tag(f.compSrc));
    if (f.fiber === 'supima' || f.fiber === 'pima' || f.fiber === 'lisle' || f.fiber === 'giza') add(1.5, f.fiberSrc, FIBERS[f.fiber]);
    else if (f.fiber === 'ringspun') add(0.75, f.fiberSrc, FIBERS[f.fiber]);
    if (f.knit === 'loopwheel') add(1.5, f.knitSrc || 'official', '루프휠 편직(옛 방식, 느리게 짜며 몸판이 통짜)');
    else if (f.knit === 'interlock') add(0.75, f.knitSrc || 'official', '인터로크(두 겹으로 촘촘히 짠 원단)');
    if (f.knit !== 'loopwheel' && p.build.indexOf('tubular') >= 0) add(0.75, p.buildSrc, '몸판 옆선 없는 통짜');   // 루프휠이면 통짜는 같은 사실이라 두 번 세지 않는다
    if (p.build.indexOf('binding-neck') >= 0) add(0.5, p.buildSrc, '목둘레가 잘 늘어나지 않는 바인딩');
    if (f.cotton100 == null) unknown.push('혼용률');
    if (!f.fiber && !f.knit) unknown.push('원사·편직 방식');
    if (!f.weight) unknown.push('원단 무게');
    if (!p.origin) unknown.push('제조국');
    const keys = [f.cotton100 != null, !!(f.fiber || f.knit), !!f.weight, !!f.thick, !!p.neck, !!p.logo, !!p.origin, p.sizes.length > 0];
    return { score: Math.min(10, Math.round(s * 100) / 100), parts, unknown, known: keys.filter(Boolean).length, of: keys.length };
  }

  /**
   * 꼭 지킬 조건 하나를 상품에 비춰 본다.
   * status: ok(확인) | weak(약한 근거로 맞음 또는 '보통') | unknown(모름) | warn(약한 근거로 어긋나 보임) | fail(확인된 어김, 1등·대안에서 뺀다)
   * short: 순위·브랜드 요약에 쓰는 짧은 이유. src: 근거 출처.
   */
  function condOf(p, key, ctx) {
    const f = p.fabric, src = (k) => (k ? ' (' + SRC[k] + ')' : ''), strong = (k) => has(STRONG, k);
    const res = (status, text, short, s) => ({ status, text, short: short || '', src: s || '' });
    if (key === 'noLogo') {
      const ls = p.logoSrc && p.logoSrc !== 'photo' ? src(p.logoSrc) : /사진/.test(p.logoNote) ? ' (상품 사진으로 확인)' : '';
      if (p.logo === 'none') return res('ok', '겉 로고 없음' + ls, '', p.logoSrc || 'photo');
      if (p.logo === 'hem') return res('ok', '로고가 밑단에 있어 받쳐 입으면 안 보임', '', p.logoSrc || 'official');
      if (p.logo === 'tab') return /밑단/.test(p.logoNote) ? res('ok', '작은 탭이 밑단에 있어 받쳐 입으면 안 보임', '', p.logoSrc || 'photo') : res('unknown', '작은 탭·라벨 — 위치 확인 못 함', '탭 위치 모름');
      if (p.logo === 'small-chest' || p.logo === 'chest' || p.logo === 'print') return res('fail', (p.logoNote || LOGOS[p.logo]).replace(/\((공식|상품 사진으로 확인|상품 사진 판단)\)/, '').trim(), p.logo === 'print' ? '프린트' : '가슴 로고', p.logoSrc || 'photo');
      return res('unknown', '로고 위치 확인 못 함', '로고 위치 모름');
    }
    if (key === 'thin') {
      const s = f.thickSrc;
      if (f.thick === 'thin') return strong(s) ? res('ok', '얇음' + src(s), '', s) : res('weak', '얇음' + src(s), '', s);
      if (f.thick === 'mid') return res('weak', '보통 두께 — 얇은 편은 아님' + src(s), '보통 두께', s);
      if (f.thick === 'thick') return strong(s) ? res('fail', '두꺼움' + (f.weight ? '(' + f.weight + ')' : '') + src(s), '두꺼움' + (f.weight ? '(' + f.weight + ')' : ''), s) : res('warn', '두꺼울 수 있음' + src(s), '두꺼울 수 있음', s);
      return res('unknown', '두께 확인 못 함', '두께 모름');
    }
    if (key === 'narrowNeck') {
      const s = p.neckSrc;
      if (p.neck === 'narrow') return strong(s) ? res('ok', NECKS.narrow + src(s), '', s) : res('weak', NECKS.narrow + src(s), '', s);
      if (p.neck === 'wide') return strong(s) ? res('fail', NECKS.wide + src(s), '목 립 넓음', s) : res('warn', '목 립이 넓어 보임' + src(s), '목 립 넓어 보임', s);
      return res('unknown', p.neck ? NECKS[p.neck] + ' — 폭은 확인 못 함' : '목 립 폭 확인 못 함', '목 립 폭 모름');
    }
    if (key === 'notLonger') {                                                                        // 고른 사이즈의 총장을 겉에 입을 카디건 총장과 견준다(밑단이 보이는지)
      const L = ctx && num(ctx.outerLen, 40, 100), fit = ctx && ctx.fit, s = fit && fit.size ? p.sizes.find((x) => x.label === fit.size) : null;
      if (L == null) return res('unknown', '카디건 총장을 넣지 않았어요', '');
      if (!s || s.length == null) return res('unknown', fit && fit.size ? '고른 사이즈의 총장 모름' : '사이즈를 넣으면 볼 수 있어요', '총장 모름');
      const d = Math.round((s.length - L) * 10) / 10, sz = p.sizeSrc, tag = ' (' + (has(SIZE_SRC, sz) ? SIZE_SRC[sz] : '치수') + ')';
      if (d <= 0) return res(strong(sz) ? 'ok' : 'weak', sizeName(p, s.label) + ' 총장 ' + s.length + 'cm — 카디건(' + L + 'cm)보다 ' + Math.abs(d) + 'cm 짧음' + tag, '', sz);
      if (d <= 2) return res('weak', sizeName(p, s.label) + ' 총장 ' + s.length + 'cm — 카디건(' + L + 'cm)과 거의 같음' + tag, '', sz);
      return res(strong(sz) ? 'fail' : 'warn', sizeName(p, s.label) + ' 총장 ' + s.length + 'cm — 카디건(' + L + 'cm)보다 ' + d + 'cm 길어 밑단이 보임' + tag, '카디건보다 ' + d + 'cm 김', sz);
    }
    if (key === 'notSheer') {
      const s = f.thickSrc;
      if (f.thick === 'thick') return strong(s) ? res('ok', '두꺼움' + src(s), '', s) : res('weak', '두꺼운 편' + src(s), '', s);
      if (f.thick === 'mid') return res('weak', '보통 두께 — 흰색은 조금 비칠 수 있음' + src(s), '보통 두께', s);
      if (f.thick === 'thin') return strong(s) ? res('fail', '얇아서 흰색이면 비칠 수 있음' + src(s), '얇아 비칠 수 있음', s) : res('warn', '얇아서 비칠 수 있음' + src(s), '얇아 비칠 수 있음', s);
      return res('unknown', '두께·비침 확인 못 함', '비침 모름');
    }
    return res('unknown', '', '');
  }
  function activeConds(q) {
    const use = has(USES, q.use) ? q.use : 'any';
    if (use === 'any') return [];
    const ok = (k) => has(CONDS, k) && CONDS[k].use === use && (!CONDS[k].needs || num(q[CONDS[k].needs], 40, 100) != null);
    const want = Array.isArray(q.conds) ? q.conds.filter(ok) : Object.keys(CONDS).filter(ok);
    return want.filter((k, i, a) => a.indexOf(k) === i);
  }

  function sizeName(p, label) { const s = p.sizes.find((x) => x.label === label); return s && s.alias && s.alias !== s.label ? s.label + '(' + s.alias + ')' : label; }
  function sizeOf(p, want) { return p.sizes.find((s) => normSize(s.label) === want || s.alias === want) || null; }
  function offeredHas(p, s, want) { if (!p.offered) return null; return p.offered.some((o) => normSize(o) === want || (s && o === s.label)); }
  function measLine(s, src) { if (!s) return ''; const parts = [s.chest != null ? '가슴단면 ' + s.chest : '', s.length != null ? '총장 ' + s.length : '', s.shoulder != null ? '어깨 ' + s.shoulder : ''].filter(Boolean); return parts.length ? s.label + (s.alias && s.alias !== s.label ? '(' + s.alias + ')' : '') + ': ' + parts.join(' · ') + 'cm' + (src && has(SIZE_SRC, src) ? ' (' + SIZE_SRC[src] + ')' : '') : ''; }
  /** 사이즈 하나가 살 수 있는지: true(재고 확인) / false(품절·안 팜·상품 전체 품절) / null(모름). */
  function availOf(p, label, want) {
    if (p.stock && p.stock.inStock === false) return { avail: false, why: '상품 전체 품절(' + kd(p.stock.checkedAt) + ' 확인)', short: '전체 품절' };
    const s = sizeOf(p, want) || (label ? p.sizes.find((x) => x.label === label) : null);
    const off = offeredHas(p, s, want);
    if (off === false) return { avail: false, why: want + ' 사이즈는 팔지 않아요(판매 사이즈: ' + p.offered.join('·') + ')', notOffered: true, short: josa(want, '은', '는') + ' 안 팖' };
    const inStock = p.stock && p.stock.sizes ? p.stock.sizes.map(normSize) : null;
    if (inStock) {
      const hit = inStock.indexOf(want) >= 0 || (s && p.stock.sizes.indexOf(s.label) >= 0);
      if (hit) return { avail: true, why: (s ? sizeName(p, s.label) : want) + ' 재고 있음(' + kd(p.stock.checkedAt) + ' 확인)' };
      if (off === true) return { avail: false, why: want + ' 품절(' + kd(p.stock.checkedAt) + ' 확인)', short: want + ' 품절' };
      return { avail: null, why: josa(want, '을', '를') + ' 파는지 확인 못 함' };
    }
    return { avail: null, why: '사이즈별 재고는 판매처에서 확인해 주세요' + (p.stock && p.stock.inStock ? '(상품은 재고 있음, ' + kd(p.stock.checkedAt) + ' 확인)' : '') };
  }
  /** 평소 사이즈로 고르기. */
  function fitBySize(p, want) {
    const s = sizeOf(p, want), a = availOf(p, s ? s.label : '', want);
    const nonStd = p.sizes.length && p.sizes.every((x) => /^\d+$/.test(x.label)) && !p.sizes.some((x) => x.alias);
    if (nonStd && !s) return { score: 0.5, size: '', text: '이 브랜드는 사이즈 이름이 달라(' + p.sizes.map((x) => x.label).join('·') + ') 평소 사이즈로 못 골라요. 잘 맞는 티 실측을 넣어 주세요', avail: null, meas: '' };
    const score = a.avail === true ? 1 : a.avail === false ? 0 : 0.6;
    return { score, size: s ? s.label : want, text: a.why, avail: a.avail, caution: a.avail === false, notOffered: !!a.notOffered, short: a.short || '', meas: measLine(s, p.sizeSrc), bySize: true };
  }
  /** 사이즈 고르기. ref(잘 맞는 옷 실측)가 있으면 가장 가까운 사이즈, 실측으로 못 고르면 평소 사이즈, 둘 다 없으면 중립. */
  function fitOf(p, q) {
    const ref = q.ref && typeof q.ref === 'object' ? q.ref : null;
    const hasRef = ref && ['chest', 'length', 'shoulder'].some((k) => num(ref[k], 1, 250) != null);
    const want = normSize(q.size);
    if (p.stock && p.stock.inStock === false) return { score: 0, size: '', text: '상품 전체 품절(' + kd(p.stock.checkedAt) + ' 확인)', avail: false, caution: true, short: '전체 품절' };
    if (hasRef) {
      let best = null;
      for (const s of p.sizes) {
        let cost = 0, n = 0, mx = 0; const diffs = [];
        for (const [k, w, label] of [['chest', 1, '가슴'], ['length', 0.6, '총장'], ['shoulder', 0.6, '어깨']]) {
          const r = num(ref[k], 1, 250); if (r == null || s[k] == null) continue;
          const d = Math.round((s[k] - r) * 10) / 10; cost += Math.abs(d) * w; n += w; mx = Math.max(mx, Math.abs(d)); diffs.push(label + ' ' + (d > 0 ? '+' : d < 0 ? '−' : '±') + Math.abs(d) + 'cm');
        }
        if (!n) continue;
        const c = cost / n;
        if (!best || c < best.c) best = { s, c, diffs, mx };
      }
      const onlyOne = p.sizes.length === 1;
      if (!best || (onlyOne && best.c > 3)) {                                                         // 실측으로 못 고르면: 평소 사이즈가 있으면 그것으로(품절·안 팖을 놓치지 않게)
        const why = !best ? '글자로 된 치수표가 없어 실측으로는 못 골라요' : '공개 치수가 ' + best.s.label + '뿐이고 잘 맞는 옷과 ' + best.diffs.join(', ') + ' 달라요';
        if (want) { const f = fitBySize(p, want); return Object.assign(f, { text: why + ' · ' + f.text, score: Math.min(f.score, 0.6), caution: true, byRefFailed: true }); }
        return { score: 0.4, size: '', text: why + '. 판매처 치수표를 봐 주세요', caution: true, avail: null, onlyOne };
      }
      const a = availOf(p, best.s.label, normSize(best.s.alias || best.s.label));
      let score = Math.max(0, 1 - best.c / 5);                                                         // [제안값] 평균 5cm 어긋나면 0
      if (onlyOne) score = Math.min(score, 0.6);                                                       // 다른 사이즈 치수를 몰라 확신을 낮춘다
      if (a.avail === false) score *= 0.3;
      const sz = sizeName(p, best.s.label);
      const text = onlyOne ? '공개 치수가 ' + sz + '뿐이에요. ' + josa(sz, '은', '는') + ' 잘 맞는 옷과 ' + best.diffs.join(', ') + ' — 다른 사이즈는 판매처 치수표를 봐 주세요 · ' + a.why
        : sz + ' 사이즈가 잘 맞는 옷과 가장 가까워요: ' + best.diffs.join(', ') + ' · ' + a.why;
      return { score, size: best.s.label, text, caution: best.c > 3 || a.avail === false || onlyOne, avail: a.avail, onlyOne, byRef: true, short: a.short || '', meas: measLine(best.s, p.sizeSrc), diffAvg: Math.round(best.c * 10) / 10, maxDiff: best.mx };
    }
    if (want) return fitBySize(p, want);
    return { score: 0.5, size: '', text: '잘 맞는 티 실측이나 평소 사이즈를 넣으면 사이즈까지 골라 드려요', neutral: true, avail: null, meas: '' };
  }

  function brandOf(p, q, cat) {
    const fav = arr(q.brands).filter((b) => typeof b === 'string');
    if (!fav.length) return { score: 0.5, text: '', neutral: true };
    if (p.brand && fav.indexOf(p.brand) >= 0) return { score: 1, text: '좋아하는 브랜드(' + brandName(cat, p.brand) + ')' };
    const fam = has(cat.brands, p.brand) && cat.brands[p.brand].family;
    const sib = fam && fav.find((b) => has(cat.brands, b) && cat.brands[b].family === fam);
    if (sib) return { score: 0.5, text: '좋아하는 ' + brandName(cat, sib) + '와 같은 계열(' + brandName(cat, p.brand) + ')', sib };
    return { score: 0, text: '' };
  }
  function styleOf(p, q) {
    const want = arr(q.styles).filter((s) => has(STYLES, s));
    if (!want.length) return { score: 0.5, text: '', neutral: true };
    const hit = p.styles.filter((s) => want.indexOf(s) >= 0);
    if (hit.length) return { score: 1, text: '스타일: ' + hit.map((s) => STYLES[s]).join('·') + ' (어울 편집 분류)', hit };
    return { score: 0, text: '' };
  }

  /** 상품 하나를 내 옷장의 후보로 바꾼다(살까 말까 판정에 쓴다). 사진은 넣지 않는다. */
  function toCandidate(p, cat, today) {
    const at = today || W.today();
    return W.cleanItem({ id: 'k' + p.id.replace(/[^a-z0-9]/gi, '').slice(0, 24) + '-' + at.replace(/-/g, ''), status: 'candidate', cat: p.cat, kind: p.kind, name: pname(cat, p),
      family: p.family, light: p.light, formality: p.formality, pattern: p.pattern, seasons: p.seasons, attrSource: 'owner', brand: p.user ? p.brandLabel || brandName(cat, p.brand) : brandName(cat, p.brand), model: p.code ? p.name + ' (' + p.code + ')' : p.name,
      link: p.store.url, price: krw(p, cat), checkedAt: p.checkedAt, photo: { kind: 'none' }, detail: p.colorName }, 0);
  }
  /** 산 상품을 보유 옷으로(산 사이즈의 치수를 옷장 실측으로 옮긴다). */
  function toOwned(p, cat, size, today) {
    const c = toCandidate(p, cat, today);
    const s = p.sizes.find((x) => x.label === size) || sizeOf(p, normSize(size));
    const m = {}; if (s) for (const k of ['chest', 'length', 'shoulder', 'sleeve']) if (s[k] != null) m[k] = s[k];
    return W.cleanItem(Object.assign({}, c, { status: 'owned', size: size ? sizeName(p, size) : '', boughtYear: Number(String(today || W.today()).slice(0, 4)), measures: m }), 0);
  }

  /**
   * '지금 보는 상품'(무신사 등에서 보던 상품)을 사용자가 적은 값으로 만든다. 출처는 모두 '직접 입력'.
   * input: { name, brand(글자), price, packCount, link, storeName, sleeve, fit, logo, thick, neck, cotton100, size, chest, length, shoulder }
   */
  function userProduct(input, cat, line, today) {
    const x = input && typeof input === 'object' ? input : {};
    const L = has(cat.lines, line) ? cat.lines[line] : null;
    if (!L) return null;
    const bk = brandKey(cat, x.brand);
    const size = str(x.size, 8).trim().toUpperCase() || 'M';
    const meas = {}; for (const k of ['chest', 'length', 'shoulder']) { const v = num(Number(x[k]), 20, 150); if (v != null) meas[k] = v; }
    const raw = { id: 'user-now', line, brand: bk || str(x.brand, 40).trim(), brandLabel: bk ? '' : str(x.brand, 40).trim(), name: str(x.name, 100).trim() || '지금 보는 상품', cat: L.cat, kind: L.kind || 'tee',
      family: L.family || 'white', light: 95, formality: 1, pattern: 'solid', sleeve: x.sleeve === 'long' ? 'long' : 'short', fit: x.fit,
      fabric: { cotton100: x.cotton100 === true ? true : x.cotton100 === false ? false : undefined, comp: x.cotton100 === true ? '면 100%' : '', thick: x.thick },
      neck: x.neck, logo: x.logo, sizes: Object.keys(meas).length ? [Object.assign({ label: size }, meas)] : [], price: num(Number(x.price), 100, 1e8), currency: 'KRW', packCount: num(Number(x.packCount), 1, 12) || 1,
      store: { name: str(x.storeName, 60) || '직접 넣은 상품', url: safeLink(x.link) }, checkedAt: realDate(today) || W.today(), styles: [] };
    return cleanPickProduct(raw, 0, { user: true });
  }

  // ---------- 고르기 ----------
  function weightsOf(q, line) {
    const pri = arr(q.priorities).filter((k, i, a) => has(CRITERIA, k) && a.indexOf(k) === i).slice(0, 5);
    const w = {};
    for (const k of Object.keys(CRITERIA)) w[k] = OFF_W;
    pri.forEach((k, i) => { w[k] = PRI_W[i]; });
    if (line && line.styleRole === 'tiebreak') w.style = Math.min(w.style, TIEBREAK_W);
    return { w, pri };
  }
  const mark = (v) => (v >= 0.66 ? 'good' : v >= 0.33 ? 'mid' : 'low');
  const isNeutral = (r, c) => (c === 'brand' && r.brand.neutral) || (c === 'style' && r.style.neutral) || (c === 'fit' && r.fit.neutral);
  const strongOk = (r) => r.conds.filter((c) => c.status === 'ok').length;

  /**
   * 기준대로 하나를 고른다.
   * 반환: { pick, alts: [{ label, why, delta, r }], ranked, eligible, excluded, notes, rank, gate, gapWhy, favNote, about, conds, use }
   *   r: { product, krw, unit, quality, crit, total, conds, useScore, fit, reasons, cautions, checks, conclusion, stale, out(뺀 이유), outShort, gate … }
   */
  function recommend(items, cat, q) {
    q = q || {};
    const today = realDate(q.today) || W.today(), use = has(USES, q.use) ? q.use : 'any', conds = activeConds(q);
    const line = has(cat.lines, q.line) ? cat.lines[q.line] : null;
    const { w, pri } = weightsOf(q, line);
    const vref = line ? line.value : DEFAULT_VALUE;
    const budget = BUDGETS.indexOf(q.budget) > 0 ? q.budget : 0;
    const extra = arr(q.extra).filter((p) => p && p.user && p.line === q.line);
    const inLine = cat.products.filter((p) => !q.line || p.line === q.line).concat(extra);
    const pool = [], excluded = [];
    for (const p of inLine) {
      if (!q.sleeve || q.sleeve === 'any' || p.sleeve === q.sleeve || p.user) pool.push(p);
      else excluded.push({ id: p.id, name: pname(cat, p), why: SLEEVES[p.sleeve] + '이라 뺐어요' });
    }
    const fxAge = cat.fx.USD ? daysSince(cat.fx.USD.date, today) : null;
    const rows = pool.map((p) => {
      const quality = qualityOf(p), up = unitPrice(p, cat), age = daysSince(p.checkedAt, today), fit = fitOf(p, q);
      const ppq = up.krw / quality.score;
      let v = Math.max(0, Math.min(1, (Math.log(vref.hi) - Math.log(ppq)) / (Math.log(vref.hi) - Math.log(vref.lo))));
      const valueNotes = [];
      if (!up.landed) { v = Math.min(v, 0.5); valueNotes.push('배송비·관세를 몰라 가성비를 중간 이하로 봤어요'); }
      const stale = age == null || age > STALE_DAYS, future = age != null && age < -1;
      const cs = conds.map((k) => Object.assign({ key: k, label: CONDS[k].label, noun: CONDS[k].noun }, condOf(p, k, { fit, outerLen: q.outerLen })));
      const useScore = cs.length ? cs.reduce((a, c) => a + (has(COND_W, c.status) ? COND_W[c.status] : 0), 0) / cs.length : null;
      const r = { product: p, krw: krw(p, cat), unit: up, quality, ppq, age, stale, future, fit, brand: brandOf(p, q, cat), style: styleOf(p, q), conds: cs, useScore, valueNotes };
      r.crit = { value: v, quality: Math.min(1, (quality.score - 3) / 4.5), brand: r.brand.score, fit: r.fit.score, style: r.style.score };   // [제안값] 공개 근거 7.5점 이상이면 품질 만점
      let sw = 0, sum = 0;
      for (const c of Object.keys(CRITERIA)) { sw += w[c]; sum += w[c] * r.crit[c]; }
      if (useScore != null) { sw += USE_W; sum += USE_W * useScore; }
      r.sw = sw; r.raw = sum / sw; r.total = Math.round(r.raw * 1000) / 10;
      r.avail = r.fit.avail;
      const fail = cs.filter((c) => c.status === 'fail');
      const overBudget = budget && up.pay > budget;
      [r.out, r.outShort] = age == null ? ['확인일을 알 수 없어 자료를 다시 봐야 해요', '확인일 없음']
        : future ? ['확인일이 미래 날짜라 자료를 다시 봐야 해요', '확인일 오류']
        : age > DROP_DAYS ? ['확인한 지 ' + age + '일이 지나 1등 후보에서 뺐어요', '확인 ' + age + '일 지남']
        : fail.length ? ['고른 조건에 안 맞아요: ' + fail.map((c) => c.label + ' ✕ ' + c.text).join(', '), fail.map((c) => c.short).join('·')]
        : overBudget ? ['예산(' + won(budget) + ')을 넘어요: 지금 낼 돈 ' + won(up.pay) + (up.shipKnown && up.ship ? '(배송비 포함)' : ''), '예산 넘음']
        : r.avail === false ? [r.fit.text, r.fit.short || '사이즈 없음'] : ['', ''];
      return r;
    });
    // 1순위 기준 문턱: 고른 값이 있는(중립이 아닌) 1순위 기준이 '보통' 이상인 상품을 먼저 본다. 스타일이 동점 깨기 품목이면 문턱을 쓰지 않는다
    const g = pri[0] && !(pri[0] === 'style' && line && line.styleRole === 'tiebreak') && rows.some((r) => !isNeutral(r, pri[0])) ? pri[0] : null;
    for (const r of rows) r.gate = !g || isNeutral(r, g) || r.crit[g] >= GATE;
    const grp = (r) => (r.out ? 2 : r.gate ? 0 : 1);
    rows.sort((a, b) => grp(a) - grp(b) || b.raw - a.raw || a.unit.krw - b.unit.krw || (a.product.id < b.product.id ? -1 : 1));
    const eligibleAll = rows.filter((r) => !r.out);
    const eligible = eligibleAll.filter((r) => !r.product.user);                                       // 1등·대안은 어울이 확인한 상품 안에서만. 직접 넣은 상품은 몇 위인지만 알려 준다
    const pickRow = eligible[0] || null;
    const passCount = eligible.filter((r) => r.gate).length;
    const rawBest = eligible.slice().sort((a, b) => b.raw - a.raw || a.unit.krw - b.unit.krw || (a.product.id < b.product.id ? -1 : 1))[0] || null;
    const gate = g ? { key: g, label: SHORT[g], pass: passCount, changed: !!(pickRow && rawBest && rawBest !== pickRow), none: eligible.length > 0 && passCount === 0 } : null;
    for (const r of rows) if (g && !r.out && !r.gate) r.gateNote = '1순위(' + SHORT[g] + ')가 보통 미만이라 뒤로 보냈어요';
    // 근거 문장·체크 목록·결론
    for (const r of rows) explain(r, { pri, w, use, conds, cat, gate, isPick: r === pickRow });
    const notes = [];
    for (const r of rows) {
      if (!r.out) continue;
      if (pickRow && r.raw > pickRow.raw) notes.push({ kind: 'out', id: r.product.id, text: pname(cat, r.product) + ' — 기준 점수는 더 높지만 ' + r.out });
      else if (!pickRow) notes.push({ kind: 'out', id: r.product.id, text: pname(cat, r.product) + ' — ' + r.out });
    }
    // 대안 둘
    const alts = pickRow ? chooseAlts(pickRow, eligible, { pri, use, fav: arr(q.brands), cat }) : [];
    // 옷장과의 조합: 1등과 대안만 계산한다
    for (const r of [pickRow].concat(alts.map((a) => a.r)).filter(Boolean)) {
      const v = J.judgeCandidate(items, toCandidate(r.product, cat, today));
      r.closet = { supported: v.supported, note: v.note, added: v.added.length, before: v.before, after: v.after, top3: v.top3, overlaps: v.overlaps.map((o) => ({ id: o.item.id, name: o.item.name, level: o.level })) };
    }
    // 좋아하는 브랜드의 빈자리와 요약
    const fav = arr(q.brands).filter((b) => typeof b === 'string');
    for (const b of fav) {
      const inL = inLine.some((p) => p.brand === b), inPool = pool.some((p) => p.brand === b);
      if (inPool) continue;
      const bn = cat.brandNotes.find((n) => n.brand === b && (!q.line || !n.line || n.line === q.line));
      if (!inL) notes.push({ kind: 'missing', brand: b, text: bn ? bn.text : brandName(cat, b) + ': 이 품목에는 아직 확인한 상품이 없어요.' });
      else notes.push({ kind: 'sleeve', brand: b, text: brandName(cat, b) + ': ' + SLEEVES[q.sleeve] + ' 상품은 목록에 없어요(다른 소매는 있어요).' });
    }
    const favNote = favSummary(fav, rows, pool, inLine, q, cat, pickRow);
    if (fxAge != null && fxAge > FX_DAYS && pool.some((p) => p.currency !== 'KRW')) notes.push({ kind: 'fx', text: '달러 환율이 ' + fxAge + '일 전 값이에요. 해외 상품 원화 가격은 다를 수 있어요.' });
    const second = eligible[1] && (!g || eligible[1].gate === pickRow.gate) ? eligible[1] : null;
    const allOk = conds.length ? eligible.filter((r) => r.conds.every((c) => c.status === 'ok')).length : null;
    const head = conds.length ? '조건을 어기지 않은 ' + eligible.length + '개' : eligible.length + '개';
    const rank = pickRow ? { n: eligible.length, allOk, gap: second ? Math.round((pickRow.raw - second.raw) * 1000) / 10 : null,
      text: eligible.length === 1 ? (conds.length ? '조건을 어기지 않은 것은 이것 하나' : '고를 수 있는 것은 이것 하나')
        : head + ' 중 1위' + (gate && gate.changed && pickRow.gate ? '(' + josa(gate.label, '이', '가') + ' 보통 이상인 ' + gate.pass + '개 안에서)' : '') + (second ? ' · 2위와 ' + (pickRow.raw - second.raw < 0.03 ? '근소한 차이' : pickRow.raw - second.raw < 0.1 ? '차이 조금' : '차이 큼') : '') } : null;
    let gapWhy = pickRow && second ? whyAhead(pickRow, second, w, cat) : '';
    if (gapWhy && second && second.altSkip && !alts.some((a) => a.r === second)) gapWhy += ' 2위는 ' + second.altSkip.replace(/뺐어요$/, '뺐어요.');
    const altNote = pickRow && alts.length < 2 && eligible.length > 1 ? (alts.length ? '대안으로 낼 만한 상품이 하나뿐이에요.' : '대안으로 낼 만한 상품이 없어요.') + ' 조건·값·핏으로 걸렀고, 전체 순위에서 모두 볼 수 있어요.' : '';
    const brandsIn = Array.from(new Set(rows.filter((r) => !r.product.user).map((r) => r.product.brand)));
    const userRow = rows.find((r) => r.product.user) || null;
    return { pick: pickRow, alts, altNote, ranked: rows, eligible, eligibleAll, excluded, notes, rank, gate, gapWhy, favNote, weights: w, priorities: pri, use, conds, budget,
      user: userRow, userRank: userRow && !userRow.out ? { idx: eligibleAll.indexOf(userRow), n: eligibleAll.length } : null,
      about: { count: rows.filter((r) => !r.product.user).length, inLine: inLine.filter((p) => !p.user).length, brands: brandsIn.length, checkedAt: rows.length ? rows.filter((r) => !r.product.user).map((r) => r.product.checkedAt).sort()[0] || '' : '', line: line ? line.label : '', styleNote: line && line.styleRole === 'tiebreak' ? line.styleNote : '' } };
  }

  /**
   * 대안 둘. 점수가 가까운(12점 안) 2위, 그다음 1등과 다른 쪽(조건이 더 확인된 것 → 값을 크게 줄이는 것 → 더 쌈 → 다른 좋아하는 브랜드 → 품질 근거 많은 것).
   * 대안은 1등보다 25점 넘게 낮으면 내지 않는다. 예외: 한 장 값이 1등의 1/3 이하이고 가성비가 '좋음'이며 조건 경고가 없는 것 하나는 40점 안이면 '○○ 대신 값을 보면'으로 보여 준다.
   * 받쳐 입기에서는 1등이 루즈핏이 아니면 루즈·박스핏 대안을 내지 않고, 핏이 1순위면 사이즈가 3cm 넘게 어긋나는 대안을 내지 않는다. 이름이 겹치면 다른 이름을 붙이고, 없으면 내지 않는다.
   */
  function chooseAlts(pickRow, eligible, o) {
    const { pri, use, fav, cat } = o;
    const near = (r, d) => r.raw >= pickRow.raw - (d || 0.25);                                        // [제안값]
    const priceOk = (r) => pri[0] !== 'value' || r.unit.krw <= pickRow.unit.krw * 2;                  // 가성비가 1순위면 두 배 넘게 비싼 것은 내지 않는다
    const why = (r) => (use === 'layer' && r.product.fit === 'relaxed' && pickRow.product.fit !== 'relaxed' ? '루즈·박스핏이라 받쳐 입기 대안에서는 뺐어요'
      : pri[0] === 'fit' && !r.fit.neutral && (r.fit.score < 0.5 || r.fit.onlyOne || (r.fit.maxDiff != null && r.fit.maxDiff > 4)) ? '사이즈가 잘 맞는 옷과 많이 달라 핏 1순위 대안에서는 뺐어요'
      : r.conds.some((c) => c.status === 'warn') ? '고른 조건과 어긋날 수 있어 대안에서는 뺐어요' : !priceOk(r) ? '값이 두 배가 넘어 가성비 1순위 대안에서는 뺐어요' : '');
    for (const r of eligible) if (r !== pickRow) r.altSkip = why(r);
    const ok = eligible.filter((r) => r !== pickRow && !r.altSkip);
    const rest = ok.filter((r) => r.gate === pickRow.gate).concat(ok.filter((r) => r.gate !== pickRow.gate));   // 1순위 문턱을 넘은 것부터
    const restAny = ok;
    const isFav = (r) => fav.indexOf(r.product.brand) >= 0 && r.product.brand !== pickRow.product.brand;
    const labelsFor = (r) => {
      const L = [];
      if (r.unit.krw <= pickRow.unit.krw * 0.85) L.push('더 싸게');
      if (isFav(r)) L.push(joinJosa([brandName(cat, r.product.brand)], '을', '를') + ' 더 좋아한다면');
      if (r.product.sleeve !== pickRow.product.sleeve) L.push(SLEEVES[r.product.sleeve] + '을 원하면');
      if (r.product.fit && pickRow.product.fit && r.product.fit !== pickRow.product.fit) L.push(josa(FIT[r.product.fit], '을', '를') + ' 원하면');
      if (r.quality.score >= pickRow.quality.score + 0.75) L.push('공개된 품질 근거가 더 많은 것');
      if (r.unit.krw >= pickRow.unit.krw * 1.15) L.push('조금 더 써도 된다면');
      L.push('다음 후보');
      return L;
    };
    const cands = [];
    if (rest[0] && rest[0].gate === pickRow.gate && pickRow.raw - rest[0].raw < 0.12) cands.push({ r: rest[0] });
    const condBetter = rest.find((r) => near(r) && strongOk(r) > strongOk(pickRow));
    if (condBetter) { const gain = condBetter.conds.filter((c, i) => c.status === 'ok' && pickRow.conds[i].status !== 'ok').map((c) => c.label); cands.push({ r: condBetter, label: '조건이 더 확인된 것(' + gain.join('·') + ')' }); }
    if (pri[0] && pri[0] !== 'value') {
      const deal = restAny.filter((r) => r.unit.krw <= pickRow.unit.krw / 3 && r.crit.value >= 0.66 && near(r, 0.4)).sort((a, b) => b.raw - a.raw)[0];
      if (deal) cands.push({ r: deal, label: (pri[0] === 'brand' ? '브랜드' : pri[0] === 'quality' ? '품질 근거' : pri[0] === 'fit' ? '핏' : '스타일') + ' 대신 값을 보면' });
    }
    const cheaper = rest.filter((r) => near(r) && r.unit.krw <= pickRow.unit.krw * 0.85).sort((a, b) => b.raw - a.raw)[0];
    if (cheaper) cands.push({ r: cheaper, label: '더 싸게' });
    const favOther = rest.find((r) => near(r) && isFav(r));
    if (favOther) cands.push({ r: favOther });
    const better = rest.filter((r) => near(r) && r.quality.score >= pickRow.quality.score + 0.75).sort((a, b) => b.raw - a.raw)[0];
    if (better) cands.push({ r: better, label: '공개된 품질 근거가 더 많은 것' });
    for (const r of rest) if (near(r)) cands.push({ r });
    const alts = [];
    for (const c of cands) {
      if (alts.length >= 2) break;
      if (alts.some((a) => a.r === c.r)) continue;
      const used = alts.map((a) => a.label);
      const label = [c.label].concat(labelsFor(c.r)).filter(Boolean).find((l) => used.indexOf(l) < 0);
      if (!label) continue;
      const d = c.r.unit.krw - pickRow.unit.krw;
      alts.push({ label, delta: signedWon(d) + (Math.round(d) !== 0 && (c.r.product.packCount > 1 || pickRow.product.packCount > 1) ? '(한 장 기준)' : ''), why: altWhy(c.r), r: c.r });
    }
    return alts;
  }

  /** 1등이 2위보다 앞선 가장 큰 이유 한 문장. */
  function whyAhead(a, b, w, cat) {
    const d = (a.raw - b.raw) * 100;
    const nb = pname(cat, b.product);
    if (d < 0.5) return '2위 ' + josa(nb, '과', '와') + ' 사실상 같은 점수예요. 둘 다 봐 주세요.';
    const parts = Object.keys(CRITERIA).map((c) => ({ c, v: (w[c] * (a.crit[c] - b.crit[c])) / a.sw }));
    if (a.useScore != null && b.useScore != null) parts.push({ c: 'use', v: (USE_W * (a.useScore - b.useScore)) / a.sw });
    const top = parts.sort((x, y) => y.v - x.v)[0];
    if (!top || top.v <= 0) return '';
    const head = '2위 ' + josa(nb, '과', '와') + '는 ';
    if (top.c === 'quality') { const extra = a.quality.parts.filter((t) => b.quality.parts.indexOf(t) < 0); return head + '공개된 품질 근거에서 갈렸어요' + (extra.length ? '(' + extra.slice(0, 2).join(', ') + ')' : '') + '.'; }
    if (top.c === 'value') return head + '가성비에서 갈렸어요(한 장 ' + won(Math.abs(b.unit.krw - a.unit.krw)) + (a.unit.krw < b.unit.krw ? ' 쌈' : ' 비싸지만 품질 근거가 더 많음') + ').';
    if (top.c === 'brand') return head + '브랜드에서 갈렸어요(' + (a.brand.text || brandName(cat, a.product.brand)) + ').';
    if (top.c === 'fit') return head + '사이즈에서 갈렸어요(' + (a.fit.byRef ? '잘 맞는 옷에 더 가까움' : a.fit.avail === true ? '고른 사이즈 재고 확인' : '사이즈 정보가 더 많음') + ').';
    if (top.c === 'style') return head + '고른 스타일에서 갈렸어요.';
    const gain = a.conds.filter((c, i) => COND_W[c.status] > (COND_W[b.conds[i].status] || 0)).map((c) => c.label);
    return head + '조건 확인에서 갈렸어요' + (gain.length ? '(' + gain.join('·') + ')' : '') + '.';
  }

  /** 좋아하는 브랜드가 왜 1등이 아닌지 한 문장으로(같은 이유는 묶는다). 브랜드를 2곳 이상 골랐을 때만. */
  function favSummary(fav, rows, pool, inLine, q, cat, pickRow) {
    if (fav.length < 2) return '';
    const passed = [], why = new Map();
    for (const b of fav) {
      const rs = rows.filter((r) => r.product.brand === b);
      let reason;
      if (rs.some((r) => !r.out)) { passed.push(brandName(cat, b)); continue; }
      if (rs.length) reason = rs[0].outShort || '조건에 안 맞음';
      else if (inLine.some((p) => p.brand === b)) reason = SLEEVES[q.sleeve] + ' 상품 없음';
      else reason = '확인한 상품 없음';
      if (!why.has(reason)) why.set(reason, []);
      why.get(reason).push(brandName(cat, b));
    }
    const lead = passed.length ? '좋아하는 브랜드 ' + fav.length + '곳 중 조건을 통과한 건 ' + passed.join('·') + (passed.length === 1 ? '뿐이에요.' : '이에요.') : '좋아하는 브랜드 ' + fav.length + '곳 모두 조건을 통과하지 못했어요.';
    const tail = Array.from(why.entries()).map(([reason, names]) => joinJosa(names, '은', '는') + ' ' + reason).join(', ');
    return lead + (tail ? ' ' + tail + '.' : '');
  }

  /** 한 줄 결론, 체크 목록, 근거 문장, 아쉬운 점을 만든다. */
  function explain(r, o) {
    const { pri, use, cat, gate } = o, p = r.product;
    const checks = [];
    for (const c of r.conds) checks.push({ group: 'cond', mark: c.status, label: c.label, text: c.text });
    const critText = {
      value: () => '한 장 약 ' + won(r.unit.krw) + (r.unit.landed ? (r.unit.shipKnown && r.unit.ship ? '(배송비 포함)' : '') : '(배송비 별도)') + (r.stale ? ' · ' + r.age + '일 전 가격' : ''),
      quality: () => (r.quality.parts.length ? r.quality.parts.join(', ') : '밝힌 소재·봉제 정보가 거의 없어요') + ' · 공개된 품질 정보 ' + r.quality.of + '개 중 ' + r.quality.known + '개',
      brand: () => (r.brand.neutral ? '좋아하는 브랜드를 아직 고르지 않았어요' : r.brand.text || '좋아하는 브랜드가 아니에요'),
      fit: () => r.fit.text,
      style: () => r.style.text || (r.style.neutral ? '스타일을 고르지 않았어요' : '고른 스타일과 달라요(편집 분류: ' + (p.styles.map((s) => STYLES[s]).join('·') || '없음') + ')'),
    };
    pri.forEach((c, i) => checks.push({ group: 'pri', mark: isNeutral(r, c) ? 'none' : mark(r.crit[c]), label: CRITERIA[c] + ' ' + (i + 1) + '순위', text: critText[c]() }));
    r.checks = checks;
    // 근거 문장(긍정): 조건 → 고른 기준(값이 있고 '좋음'인 것만)
    const reasons = [];
    const okConds = r.conds.filter((c) => c.status === 'ok'), weakConds = r.conds.filter((c) => c.status === 'weak');
    if (okConds.length) reasons.push(USE_LONG[use] + ': ' + okConds.map((c) => c.text).join(', '));
    for (const c of pri) {
      if (isNeutral(r, c) || r.crit[c] < 0.66 || (c === 'value' && (r.stale || !r.unit.landed))) continue;
      const t = critText[c](); if (t && reasons.indexOf(t) < 0) reasons.push(CRITERIA[c] + ': ' + t);
    }
    r.reasons = reasons.slice(0, 5);
    const cautions = [];
    const unk = r.conds.filter((c) => c.status === 'unknown'), warn = r.conds.filter((c) => c.status === 'warn');
    if (unk.length) cautions.push('확인 못 한 것: ' + unk.map((c) => c.text.replace(/ 확인 못 함$/, '')).join(', ') + ' — 판매처 상세에서 봐 주세요');
    for (const c of warn) cautions.push(c.label + '와 어긋날 수 있어요: ' + c.text);
    for (const c of r.conds.filter((x) => x.status === 'fail')) cautions.push(c.label + '와 맞지 않아요: ' + c.text);
    if (r.fit.caution) cautions.push(r.fit.text);
    for (const t of r.valueNotes) cautions.push(t);
    if (r.stale && !r.out) cautions.push('가격·재고를 확인한 지 ' + r.age + '일 지났어요. 판매처에서 다시 확인해 주세요');
    if (p.currency !== 'KRW') cautions.push('해외 주문: $' + p.price + (r.unit.shipKnown && r.unit.ship ? ' + 배송비 $' + p.shipping.fee : '') + ' ≈ ' + won(r.unit.pay) + '(' + kd(cat.fx[p.currency].date) + ' 환율). 관세·부가세는 따로 확인');
    if (p.priceNote) cautions.push(p.priceNote);
    if (!r.fit.size && p.stock && p.stock.sizes && p.stock.sizes.length && p.stock.sizes.length <= 2) cautions.push('재고가 ' + p.stock.sizes.join('·') + '만 있어요(' + kd(p.stock.checkedAt) + ' 확인)');
    if (r.future) cautions.push('확인일이 미래 날짜예요. 자료를 다시 확인해야 해요');
    if (p.user) cautions.push('직접 넣은 값으로 견줬어요. 어울이 확인한 값이 아니에요');
    r.cautions = cautions;
    // 한 줄 결론: 1순위 문턱 → 가장 무게가 큰 '좋음' 이유 → 조건 상태 → 가장 큰 걸림. 고르지 않은 기준(중립)과 '보통' 이하는 이유로 말하지 않는다
    const top = pri.find((c) => !isNeutral(r, c) && r.crit[c] >= 0.66 && (c !== 'value' || (!r.stale && r.unit.landed)) && (c !== 'fit' || r.fit.byRef || r.fit.avail === true));
    const leadOf = (c) => (c === 'brand' ? (r.brand.score === 1 ? '좋아하는 브랜드(' + brandName(cat, p.brand) + ')예요' : '좋아하는 ' + brandName(cat, r.brand.sib) + '와 같은 계열(' + brandName(cat, p.brand) + ')이에요')
      : c === 'quality' ? '공개된 품질 근거가 많은 편이에요(' + (r.quality.parts.slice(0, 2).join(', ') || '면') + ')'
      : c === 'value' ? '한 장 약 ' + won(r.unit.krw) + '으로 가성비가 좋은 편이에요'
      : c === 'fit' ? (r.fit.byRef ? josa(sizeName(p, r.fit.size), '이', '가') + ' 잘 맞는 옷과 가장 가까워요' : sizeName(p, r.fit.size) + ' 재고가 있어요')
      : '고른 스타일(' + r.style.hit.map((s) => STYLES[s]).join('·') + ')에 들어요');
    let lead;
    const gated = o.isPick && gate && gate.changed && r.gate && !gate.none;
    if (o.isPick && gate && gate.none) lead = josa(gate.label, '이', '가') + " '보통' 이상인 상품이 없어 다른 기준을 합해 골랐어요";
    else if (gated) lead = josa(gate.label, '을', '를') + ' 1순위로 골라, ' + josa(gate.label, '이', '가') + ' 보통 이상인 ' + gate.pass + '개 안에서 골랐어요' + (top && top !== gate.key ? '. ' + leadOf(top) : top ? '(' + leadOf(top).replace(/이에요$|예요$|어요$|아요$/, '') + ')' : '');
    else if (top) lead = leadOf(top);
    else lead = !pri.length ? '아직 기준을 고르지 않아 다섯 기준을 같은 무게로 봤어요' : '고른 기준을 합한 점수가 가장 높아요';
    const condTxt = !r.conds.length ? '' : okConds.length === r.conds.length ? '고른 조건(' + okConds.map((c) => c.label).join('·') + ')도 모두 확인됐어요'
      : [okConds.length ? joinJosa(okConds.map((c) => c.label), '은', '는') + ' 확인됐어요' : '', weakConds.length ? joinJosa(weakConds.map((c) => c.noun), '은', '는') + ' 약한 근거(' + srcPhrase(weakConds) + ')로 봤어요' : ''].filter(Boolean).join('. ');
    const but = warn.length ? '다만 ' + joinJosa(warn.map((c) => c.label), '과', '와') + ' 어긋날 수 있어요(' + srcPhrase(warn) + ').'
      : unk.length ? '다만 ' + joinJosa(unk.map((c) => c.noun), '은', '는') + ' 확인 못 했어요.' : r.fit.caution ? '다만 ' + r.fit.text.replace(/[.\s]+$/, '') + '.' : '';
    r.conclusion = [lead, condTxt].filter(Boolean).join('. ') + '.' + (but ? ' ' + but : '');
  }
  function srcPhrase(cs) { const s = Array.from(new Set(cs.map((c) => c.src).filter((x) => has(SRC, x)))).map((x) => SRC[x]); return s.length ? s.join('·') : '약한 근거'; }
  /** 대안 한 줄: 한 장 값과 공개된 품질 근거 둘, 조건 상태. */
  function altWhy(r) {
    const parts = r.unit.landed ? [] : ['배송비 별도'];                                                  // 값은 카드에 따로 보인다
    if (r.quality.parts.length) parts.push(r.quality.parts.slice(0, 2).join(', '));
    const by = (s) => r.conds.filter((c) => c.status === s).map((c) => c.label);
    if (by('ok').length) parts.push('확인: ' + by('ok').join('·'));
    if (by('weak').length) parts.push('약한 확인: ' + by('weak').join('·'));
    if (by('unknown').length) parts.push('모름: ' + by('unknown').join('·'));
    if (by('warn').length) parts.push('어긋날 수 있음: ' + by('warn').join('·'));
    return parts.join(' · ');
  }

  return { SCHEMA, STALE_DAYS, DROP_DAYS, CRITERIA, SHORT, STYLES, USES, USE_LONG, CONDS, SLEEVES, FIT, THICK, NECKS, LOGOS, SRC, SRC_W, STRONG, FIBERS, KNITS, BUDGETS, GATE,
    cleanPicks, cleanPickProduct, qualityOf, condOf, activeConds, fitOf, availOf, brandOf, styleOf, krw, unitPrice, toCandidate, toOwned, userProduct, brandKey, recommend,
    normSize, brandName, pname, sizeName, won, signedWon, josa, joinJosa, euro, realDate, daysSince };
});
