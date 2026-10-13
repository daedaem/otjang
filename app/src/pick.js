/*
 * Pick — 사고 싶은 옷 하나를 "내 기준"으로 골라 주는 추천. 검증 카탈로그(data/picks.json) 안에서만 고른다. AI를 쓰지 않는다.
 *
 * 카탈로그: 공식 스토어·공식 판매처의 상품 페이지에서 직접 확인한 값만 들어 있다. 값마다 출처 등급(SRC)이 있다.
 *   가격·재고는 확인한 날(checkedAt)의 값이다. 상품 사진은 가져오지 않고 판매처 링크만 둔다. 스타일 분류(styles)는 어울의 편집 판단이다.
 *
 * 기준(CRITERIA) — 누른 순서대로 무게 3·2·1.5·1.2·1, 누르지 않은 기준은 0.5 [제안값]
 *   value   가성비: 한 장 값(배송비를 알면 포함) ÷ 품질 점수. 품목마다 고정 기준선(lines[].value.lo·hi)으로 0~1. 목록에 무엇이 있든 같은 상품은 같은 값
 *   quality 공개된 품질 근거: 면 100%, 수피마·라일·링스펀, 루프휠·통짜·인터로크, 바인딩 목. 출처 등급으로 가중(공식·고시 1, 사진 0.6, 브랜드 공정 설명 0.6,
 *           상품명 0.5, 판매처 설명·직접 입력 0.3). 정보를 밝히지 않은 상품은 낮게 나온다(품질이 낮다는 뜻이 아니다)
 *   brand   좋아하는 브랜드 1, 같은 계열(폴로 ↔ 퍼플 라벨) 0.5. 브랜드를 고르지 않았으면 '중립'(결론·근거에 쓰지 않음)
 *   fit     잘 맞는 옷 실측과 가장 가까운 사이즈, 또는 평소 사이즈의 판매·재고. 둘 다 없으면 '중립'
 *   style   고른 스타일(편집 분류)과 겹치면 1. 기본 품목(styleRole: 'tiebreak')은 무게를 0.3 이하로 묶어 동점 깨기에만 쓴다
 * 1순위 기준 문턱(GATE): 1순위 기준이 '보통'(0.5) 이상인 상품이 있으면 1등은 그 안에서 고른다. 문턱이 고정값이라 순위 밖 상품을 빼도 1등은 바뀌지 않는다.
 * 용도(USES)와 꼭 지킬 조건(CONDS): 받쳐 입기 → 로고 안 보이게·얇게·목 립 좁게·박시하지 않게(+카디건 총장) / 한 장으로 → 비치지 않게.
 *   판정과 근거: 공식·고시·공식 원단 무게는 '확인'(✓), 판매처 설명·사진 판단·상품명·브랜드 공정 설명·사용자가 직접 적은 값은 '약한 확인'. 로고는 상품 사진으로 보면 확인으로 본다.
 *   '애매'(partial): 조건에 반쯤 맞음(보통 두께, 카디건과 거의 같은 길이, 단추를 잠그면 가려지는 작은 자수). 점수는 약한 확인과 같다.
 *   조건을 어긴 것이 '확인'된 상품은 1등·대안에서 빼고 이유를 알린다. 약한 근거로만 어긋나 보이면 빼지 않고 경고(!)한다. 모르는 값은 '?'.
 *   점수: 확인 1, 약한 확인·애매 0.75, 모름 0.5, 경고 0.25 (용도 무게 2.5) [제안값]
 * 총장: 유니클로처럼 뒤 중심에서 잰 치수(lengthFrom: 'cb')는 옆목점 기준과 견줄 때 2cm를 더한다 [추정 — 크루넥 뒷목 파임만큼]. 보정이 들어간 판정은 '약한 확인'.
 * 오래된 자료: 점수는 날짜로 바꾸지 않는다. 14일이 지나면 '다시 확인 필요'를 붙이고 가격·재고를 이유로 말하지 않으며, 30일이 지나면 1등 후보에서 뺀다.
 * 예산(budget): 지금 낼 돈(묶음 전체 + 아는 배송비)이 넘으면 1등 후보에서 뺀다.
 *
 * recommend(items, catalog, query) → { pick, alts, ranked, eligible, excluded, notes, rank, gate, gapWhy, favNote, about }
 *   query: { line, sleeve, use, conds: [조건], priorities: [기준 순서], brands, styles, size, ref: {chest,length,shoulder}, budget, outerLen, closed(카디건 단추를 잠그나), extra: [userProduct], today }
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
    notLoose: { label: '박시하지 않게', use: 'layer', noun: '핏' },
    notLonger: { label: '카디건보다 짧게', use: 'layer', noun: '총장', needs: 'outerLen' }, notSheer: { label: '비치지 않게', use: 'solo', noun: '비침' } };   // notLonger: 겉에 입을 카디건 총장(outerLen)을 넣었을 때만
  const SLEEVES = { short: '반팔', long: '긴팔', any: '상관없음' };
  const FIT = { slim: '슬림핏', regular: '레귤러핏', relaxed: '루즈·박스핏' };
  const THICK = { thin: '얇음', mid: '보통', thick: '두꺼움' };
  const NECKS = { narrow: '목 립이 좁은 편', standard: '기본 립 크루넥', binding: '바인딩 목', wide: '목 립이 넓은 편' };
  const LOGOS = { none: '겉 로고 없음', hem: '밑단 로고', 'small-chest': '가슴 작은 자수', chest: '가슴 자수', tab: '작은 탭·라벨', print: '프린트' };
  const SRC = { official: '공식', notice: '상품정보제공고시', name: '상품명에만', seller: '판매처 설명', photo: '상품 사진으로 본 판단', 'official-weight': '공식 원단 무게로 판단', claim: '브랜드 설명, 인증 없음', user: '직접 적음', measured: '어울이 직접 잼' };
  const SRC_W = { official: 1, notice: 1, 'official-weight': 1, measured: 1, photo: 0.6, claim: 0.6, name: 0.5, user: 0.3, seller: 0.3 };   // [제안값] 품질 근거의 강도. 사용자가 적은 값은 판매처 설명을 옮긴 것으로 본다
  const STRONG = { official: 1, notice: 1, 'official-weight': 1, measured: 1 };                       // 조건 판정에서 '확인'으로 보는 출처(사용자가 적은 값은 약한 확인)
  const COND_W = { ok: 1, weak: 0.75, unknown: 0.5, warn: 0.25 };                                       // [제안값]
  const LEN_CB = 2;                                                                                    // [추정] 뒤 중심 총장 → 옆목점 총장 보정(cm)
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
  const SIZE_SRC = { official: '공식 치수', notice: '공식 치수', seller: '판매처 치수표', photo: '사진 판단', name: '상품명', 'official-weight': '공식', claim: '브랜드 설명', user: '직접 적음', measured: '어울이 직접 잼' };
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
  /** '~예요/이에요': 받침이 있으면 '이에요'. */
  function copula(word) { const t = batchim(word); return String(word) + (t == null ? '(이)에요' : t ? '이에요' : '예요'); }
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
      sleeve: raw.sleeve === 'long' ? 'long' : 'short', fit: pick1(raw.fit, FIT), fitSrc: pick1(raw.fit, FIT) ? pick1(raw.fitSrc, SRC) || (user ? 'user' : 'seller') : null, fitNote: str(raw.fitNote, 120),
      fabric: { comp: str(f.comp, 140), cotton100: f.cotton100 === true ? true : f.cotton100 === false ? false : null, compSrc: pick1(f.compSrc, SRC) || dflt,
        fiber: pick1(f.fiber, FIBERS), fiberSrc: pick1(f.fiberSrc, SRC) || (f.fiber ? dflt : null), knit: pick1(f.knit, KNITS), knitSrc: pick1(f.knitSrc, SRC) || (f.knit ? dflt : null), weight: str(f.weight, 20),
        thick: pick1(f.thick, THICK), thickSrc: pick1(f.thickSrc, SRC) || (user && f.thick ? 'user' : null), notes: arr(f.notes).map((n) => str(n, 200)).filter(Boolean).slice(0, 6) },
      build: arr(raw.build).map((b) => str(b, 20)).filter(Boolean).slice(0, 8), buildSrc: pick1(raw.buildSrc, SRC) || dflt, neck: pick1(raw.neck, NECKS), neckSrc: pick1(raw.neckSrc, SRC) || (user && raw.neck ? 'user' : null),
      logo: pick1(raw.logo, LOGOS), logoNote: str(raw.logoNote, 120), logoSrc: pick1(raw.logoSrc, SRC) || (user && raw.logo ? 'user' : null), origin: str(raw.origin, 40),
      sizes: arr(raw.sizes).map(cleanSize).filter(Boolean).slice(0, 12), sizeSrc: pick1(raw.sizeSrc, SRC) || (user ? 'user' : null), sizeNote: str(raw.sizeNote, 200),
      lengthFrom: raw.lengthFrom === 'cb' ? 'cb' : 'hps', sizeDoubt: str(raw.sizeDoubt, 120),                     // 총장을 뒤 중심에서 쟀는지, 치수표를 믿기 어려운 이유(있으면 실측 비교에 쓰지 않는다)
      offered: Array.isArray(raw.offered) ? raw.offered.map((s) => str(s, 8).trim()).filter(Boolean).slice(0, 12) : null,
      price, currency, listPrice: num(raw.listPrice, 1, 1e9), priceNote: str(raw.priceNote, 200), packCount: num(raw.packCount, 1, 12) || 1,
      shipping: shipFee != null ? { fee: shipFee, freeOver: num(sh.freeOver, 0, currency === 'KRW' ? 10000000 : 100000), note: str(sh.note, 200), url: safeLink(sh.url), estimate: sh.estimate === true } : null,   // estimate: 나라·결제 화면에 따라 바뀔 수 있는 배송비
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
  /** 화면 이름: 브랜드 + 상품명. 상품명에 이미 브랜드(이름·한글 이름·별칭)가 들어 있으면 두 번 쓰지 않는다. */
  const pname = (cat, p) => {
    const b = p.user ? p.brandLabel || (p.brand ? brandName(cat, p.brand) : '') : brandName(cat, p.brand);
    const n = bnorm(p.name), bk = has(cat.brands, p.brand) ? cat.brands[p.brand] : null;
    const inName = !!b && [b].concat(bk ? [bk.name, bk.ko].concat(bk.aliases) : []).some((x) => { const t = bnorm(x); return t.length >= 2 && n.indexOf(t) >= 0; });
    return (b && !inName ? b + ' ' + p.name : p.name).trim();
  };
  /** 브랜드 이름 견주기용: 소문자, 띄어쓰기·문장부호(’'.&-) 없앰. "LEVI’S" = "levis", "폴로랄프로렌" = "폴로 랄프로렌". */
  const bnorm = (t) => String(t || '').toLowerCase().normalize('NFC').replace(/[\s'’`.&\-_,·]+/g, '');
  /** 글자로 적은 브랜드를 카탈로그의 브랜드 열쇠로(이름·한글 이름·별칭이 같으면). 없으면 ''. */
  function brandKey(cat, text) {
    const t = bnorm(text);
    if (!t) return '';
    for (const k of Object.keys(cat.brands)) { const b = cat.brands[k]; if (bnorm(k) === t || bnorm(b.name) === t || bnorm(b.ko) === t || b.aliases.some((a) => bnorm(a) === t)) return k; }
    return '';
  }
  /**
   * 상품 이름(또는 공유 글)에서 알 수 있는 것만 뽑는다: 브랜드(이름·별칭이 들어 있으면, 가장 긴 것), 핏(오버핏·루즈·박시 / 슬림 / 레귤러), 묶음 수(3P·3팩·3장), 소매(긴팔·반팔).
   * 화면에서 입력 칸을 미리 채우는 데 쓰고, 사용자가 고칠 수 있다. 출처는 '상품명'.
   */
  function guessFromName(cat, text) {
    const s = String(text || '').slice(0, 300), n = bnorm(s), out = { brand: '', fit: null, packCount: null, sleeve: null };
    let best = '';
    for (const k of Object.keys(cat.brands)) { const b = cat.brands[k]; for (const a of [b.name, b.ko].concat(b.aliases)) { const x = bnorm(a); if (x.length >= 2 && n.indexOf(x) >= 0 && x.length > best.length) { best = x; out.brand = k; } } }
    if (/오버\s*핏|오버\s*사이즈|루즈|박시|릴렉스|릴랙스|빅\s*핏|와이드\s*핏|over\s*-?\s*(fit|size)|loose|boxy|relax/i.test(s)) out.fit = 'relaxed';
    else if (/슬림|머슬\s*핏|slim|muscle/i.test(s)) out.fit = 'slim';
    else if (/레귤러|regular/i.test(s)) out.fit = 'regular';
    const pk = /(?:^|[^0-9a-z])([2-6])\s*(?:p|pk|pack|팩|장|매)(?![a-z])/i.exec(s) || /(?:^|[^0-9])([2-6])\s*-?\s*pack/i.exec(s);
    if (pk) out.packCount = Number(pk[1]);
    if (/긴\s*팔|긴소매|롱\s*슬리브|long\s*-?\s*sleeve|\bl\s*\/\s*s\b/i.test(s)) out.sleeve = 'long'; else if (/반\s*팔|반소매|숏\s*슬리브|short\s*-?\s*sleeve|\bs\s*\/\s*s\b/i.test(s)) out.sleeve = 'short';
    return out;
  }
  /** 짧은 해시(같은 글이면 같은 값). */
  function hash36(s) { let x = 5381; const t = String(s); for (let i = 0; i < t.length; i++) x = ((x << 5) + x + t.charCodeAt(i)) | 0; return (x >>> 0).toString(36); }
  function daysSince(date, today) { const d = realDate(date), t = realDate(today) || W.today(); if (!d) return null; const n = Math.round((Date.parse(t + 'T00:00:00Z') - Date.parse(d + 'T00:00:00Z')) / 86400000); return isFinite(n) ? n : null; }
  /** 원화 가격(묶음 전체, 해외면 상품값만). */
  function krw(p, cat) { return p.currency === 'KRW' ? p.price : Math.round(p.price * cat.fx[p.currency].krw); }
  /**
   * 지금 낼 돈(묶음 전체, 아는 배송비 포함)과 한 장 값. landed=false 면 배송비를 모르거나 확실하지 않다(해외).
   * shipKnown: 배송비를 안다(확실). shipEst: 배송비를 넣었지만 결제 화면에서 바뀔 수 있다.
   */
  function unitPrice(p, cat) {
    const rate = p.currency === 'KRW' ? 1 : cat.fx[p.currency].krw;
    const ship = p.shipping ? (p.shipping.freeOver != null && p.price >= p.shipping.freeOver ? 0 : p.shipping.fee) : null;
    const est = !!(p.shipping && p.shipping.estimate && ship);
    const landed = (p.currency === 'KRW' || ship != null) && !est;
    const pay = Math.round((p.price + (ship || 0)) * rate);
    return { krw: pay / p.packCount, pay, landed, ship: ship == null ? null : Math.round(ship * rate), shipKnown: ship != null && !est, shipEst: est };
  }

  /** 공개된 품질 근거(3~10): 출처 등급으로 가중한다. parts 는 화면에 그대로 보여 줄 근거, unknown 은 밝히지 않은 것, known 은 정보 공개 정도. */
  function qualityOf(p) {
    const parts = [], unknown = [], items = [];
    let s = 3;
    const f = p.fabric, w = (src) => (has(SRC_W, src) ? SRC_W[src] : 1), tag = (src) => (src && src !== 'official' ? ' (' + SRC[src] + ')' : '');
    const add = (pts, src, text) => { const v = Math.round(pts * w(src) * 100) / 100; s += v; parts.push(text + tag(src)); items.push({ text: text.replace(/\(.*\)$/, ''), src: src || 'official', pts: v }); };
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
    items.sort((a, b) => b.pts - a.pts);                                                              // 결론에는 무게가 큰 근거부터
    return { score: Math.min(10, Math.round(s * 100) / 100), parts, items, unknown, known: keys.filter(Boolean).length, of: keys.length };
  }

  /**
   * 꼭 지킬 조건 하나를 상품에 비춰 본다.
   * status: ok(확인) | weak(약한 근거로 맞음 또는 '보통') | unknown(모름) | warn(약한 근거로 어긋나 보임) | fail(확인된 어김, 1등·대안에서 뺀다)
   * short: 순위·브랜드 요약에 쓰는 짧은 이유. src: 근거 출처.
   */
  function condOf(p, key, ctx) {
    const f = p.fabric, src = (k) => (k ? ' (' + SRC[k] + ')' : ''), strong = (k) => has(STRONG, k);
    const sure = (k) => strong(k) || k === 'user';                                                    // 사용자가 상품 페이지를 보고 적은 값은 '본 사실'로 — 어기면 빼고(fail), 맞으면 약한 확인
    const res = (status, text, short, s, kind, say) => ({ status, text, short: short || '', src: s || '', kind: kind || (status === 'weak' ? 'evidence' : ''), say: say || '' });   // kind: weak 가 근거 약함(evidence)인지 반쯤 맞음(partial)인지
    if (key === 'noLogo') {
      const ls = p.logoSrc && p.logoSrc !== 'photo' ? src(p.logoSrc) : /사진/.test(p.logoNote) ? ' (상품 사진으로 확인)' : '';
      const lsrc = p.logoSrc || 'photo', ok = (t) => (p.user ? res('weak', t + ' (직접 적음)', '', 'user') : res('ok', t + ls, '', lsrc));
      if (p.logo === 'none') return ok('겉 로고 없음');
      if (p.logo === 'hem') return p.user ? ok('로고가 밑단에만 있음') : res('ok', '로고가 밑단에 있어 받쳐 입으면 안 보임', '', p.logoSrc || 'official');
      if (p.logo === 'tab') return /밑단/.test(p.logoNote) ? res('ok', '작은 탭이 밑단에 있어 받쳐 입으면 안 보임', '', p.logoSrc || 'photo') : res('unknown', '작은 탭·라벨 — 위치 확인 못 함', '탭 위치 모름');
      const what = (p.logoNote || LOGOS[p.logo] || '').replace(/\((공식|상품 사진으로 확인|상품 사진 판단)\)/, '').trim();
      if (p.logo === 'small-chest' && ctx && ctx.closed === true) return Object.assign(res('weak', what + ' — 카디건 단추를 잠그면 대개 가려져요(카디건 V 깊이에 따라 다름)', '', lsrc, 'partial', '가슴 작은 자수는 카디건 단추를 잠그면 대개 가려져요'), { brief: '작은 가슴 자수(단추를 잠그면 가려짐)' });   // [경험칙] 잠근 V넥 카디건은 왼쪽 가슴 작은 자수를 가린다
      if (p.logo === 'small-chest' || p.logo === 'chest' || p.logo === 'print') return res('fail', what, p.logo === 'print' ? '프린트' : '가슴 로고', p.user ? 'user' : lsrc);
      return res('unknown', '로고 위치 확인 못 함', '로고 위치 모름');
    }
    if (key === 'thin') {
      const s = f.thickSrc;
      if (f.thick === 'thin') return strong(s) ? res('ok', '얇음' + src(s), '', s) : res('weak', '얇음' + src(s), '', s);
      if (f.thick === 'mid') return res('weak', '보통 두께 — 얇은 편은 아님' + src(s), '보통 두께', s, 'partial', '두께는 보통이에요');
      if (f.thick === 'thick') return sure(s) ? res('fail', '두꺼움' + (f.weight ? '(' + f.weight + ')' : '') + src(s), '두꺼움' + (f.weight ? '(' + f.weight + ')' : ''), s) : res('warn', '두꺼울 수 있음' + src(s), '두꺼울 수 있음', s);
      return res('unknown', '두께 확인 못 함', '두께 모름');
    }
    if (key === 'narrowNeck') {
      const s = p.neckSrc;
      if (p.neck === 'narrow') return strong(s) ? res('ok', NECKS.narrow + src(s), '', s) : res('weak', NECKS.narrow + src(s), '', s);
      if (p.neck === 'wide') return sure(s) ? res('fail', NECKS.wide + src(s), '목 립 넓음', s) : res('warn', '목 립이 넓어 보임' + src(s), '목 립 넓어 보임', s);
      return res('unknown', p.neck ? NECKS[p.neck] + ' — 폭은 확인 못 함' : '목 립 폭 확인 못 함', '목 립 폭 모름');
    }
    if (key === 'notLoose') {                                                                         // 카디건 안에서 뭉치지 않게: 루즈·박스핏이 아닌지
      const s = p.fitSrc;
      if (p.fit === 'relaxed') return sure(s) ? res('fail', FIT.relaxed + src(s), '루즈·박스핏', s) : res('warn', FIT.relaxed + '일 수 있음' + src(s), '루즈·박스핏일 수 있음', s);
      if (p.fit === 'slim' || p.fit === 'regular') return strong(s) ? res('ok', FIT[p.fit] + src(s), '', s) : res('weak', FIT[p.fit] + src(s), '', s);
      return res('unknown', '핏 정보 없음', '핏 모름');
    }
    if (key === 'notLonger') {                                                                        // 고른 사이즈의 총장을 겉에 입을 카디건 총장과 견준다(밑단이 보이는지)
      const L = ctx && num(ctx.outerLen, 40, 100), fit = ctx && ctx.fit, s = fit && fit.size ? p.sizes.find((x) => x.label === fit.size) : null;
      if (L == null) return res('unknown', '카디건 총장을 넣지 않았어요', '');
      if (p.sizeDoubt) return res('unknown', '치수표를 믿기 어려워 총장을 몰라요(' + p.sizeDoubt + ')', '총장 모름');
      if (!s || s.length == null) return res('unknown', fit && fit.size ? '고른 사이즈의 총장 모름' : '사이즈를 넣으면 볼 수 있어요', '총장 모름');
      const adj = p.lengthFrom === 'cb' ? LEN_CB : 0, len = Math.round((s.length + adj) * 10) / 10;
      const d = Math.round((len - L) * 10) / 10, sz = p.sizeSrc, tag = ' (' + (has(SIZE_SRC, sz) ? SIZE_SRC[sz] : '치수') + ')';
      const sure = strong(sz) && !adj;                                                                 // 뒤 중심 보정(추정)이 들어가면 확인이 아니라 약한 확인
      const st = (has(SIZE_SRC, sz) ? SIZE_SRC[sz] : '치수') + (adj ? '에 2cm 더한 추정' : '');           // 결론의 근거 이름(치수표 + 보정)
      const head = sizeName(p, s.label) + ' 총장 ' + s.length + 'cm' + (adj ? '(뒤 중심 치수라 약 ' + len + 'cm로 봄)' : '');
      // [제안값, MD 경험칙] 치수표 측정 오차 약 2cm·면 티 세탁 수축 1~2cm: 1.5cm 넘게 짧으면 확인, 같거나 1cm까지 길면 애매, 1~3cm 길면 어긋날 수 있음, 3cm 넘게 길면 출처와 상관없이 어김
      const out = d <= -1.5 ? Object.assign(res(sure ? 'ok' : 'weak', head + ' — 카디건(' + L + 'cm)보다 ' + Math.abs(d) + 'cm 짧아요' + tag, '', sz), { brief: '카디건보다 ' + Math.abs(d) + 'cm 짧아요' })
        : d <= 1 ? res('weak', head + ' — 카디건(' + L + 'cm)' + (d < 0 ? '보다 ' + Math.abs(d) + 'cm 짧아요' : d === 0 ? '과 같아요' : '보다 ' + d + 'cm 길어요') + '. 팔을 들면 밑단이 보일 수 있어요' + tag, '카디건과 거의 같은 길이', sz, 'partial', '총장이 카디건과 거의 같아 팔을 들면 밑단이 보일 수 있어요')
        : d <= 3 ? res('warn', head + ' — 카디건(' + L + 'cm)보다 ' + d + 'cm 길어 밑단이 보일 수 있어요' + tag, '카디건보다 ' + d + 'cm 길어요', sz)
        : res('fail', head + ' — 카디건(' + L + 'cm)보다 ' + d + 'cm 길어 밑단이 보여요' + tag, '카디건보다 ' + d + 'cm 길어요', sz);
      out.srcText = st; out.d = d; out.adj = !!adj; return out;
    }
    if (key === 'notSheer') {
      const s = f.thickSrc;
      if (f.thick === 'thick') return strong(s) ? res('ok', '두꺼움' + src(s), '', s) : res('weak', '두꺼운 편' + src(s), '', s);
      if (f.thick === 'mid') return res('weak', '보통 두께 — 흰색은 조금 비칠 수 있음' + src(s), '보통 두께', s, 'partial', '보통 두께라 흰색은 조금 비칠 수 있어요');
      if (f.thick === 'thin') return sure(s) ? res('fail', '얇아서 흰색이면 비칠 수 있음' + src(s), '얇아 비칠 수 있음', s) : res('warn', '얇아서 비칠 수 있음' + src(s), '얇아 비칠 수 있음', s);
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
  function measLine(s, src, from) { if (!s) return ''; const parts = [s.chest != null ? '가슴단면 ' + s.chest : '', s.length != null ? (from === 'cb' ? '총장(뒤 중심) ' : '총장 ') + s.length : '', s.shoulder != null ? '어깨 ' + s.shoulder : ''].filter(Boolean); return parts.length ? s.label + (s.alias && s.alias !== s.label ? '(' + s.alias + ')' : '') + ': ' + parts.join(' · ') + 'cm' + (src && has(SIZE_SRC, src) ? ' (' + SIZE_SRC[src] + ')' : '') : ''; }
  /**
   * 사이즈 하나가 살 수 있는지: true(재고 확인) / false(품절·안 팜·상품 전체 품절) / null(모름).
   * 재고를 확인한 지 14일이 지났으면 '재고 있음'을 이유로 쓰지 않는다(today 를 줄 때).
   */
  function availOf(p, label, want, today) {
    if (p.stock && p.stock.inStock === false) return { avail: false, why: '상품 전체 품절(' + kd(p.stock.checkedAt) + ' 확인)', short: '전체 품절' };
    const s = sizeOf(p, want) || (label ? p.sizes.find((x) => x.label === label) : null);
    const off = offeredHas(p, s, want);
    if (off === false) return { avail: false, why: want + ' 사이즈는 팔지 않아요(판매 사이즈: ' + p.offered.join('·') + ')', notOffered: true, short: josa(want, '은', '는') + ' 안 팖' };
    const inStock = p.stock && p.stock.sizes ? p.stock.sizes.map(normSize) : null;
    const sAge = p.stock && today ? daysSince(p.stock.checkedAt, today) : null, old = sAge != null && sAge > STALE_DAYS;
    if (inStock) {
      const hit = inStock.indexOf(want) >= 0 || (s && p.stock.sizes.indexOf(s.label) >= 0);
      if (hit && old) return { avail: true, stale: true, why: (s ? sizeName(p, s.label) : want) + ' 재고는 ' + sAge + '일 전 확인이라 판매처에서 봐 주세요' };   // 점수는 날짜로 바꾸지 않고(재고 있음 그대로) 말만 바꾼다
      if (hit) return { avail: true, why: (s ? sizeName(p, s.label) : want) + ' 재고 있음(' + kd(p.stock.checkedAt) + ' 확인)' };
      if (off === true) return { avail: false, why: want + ' 품절(' + kd(p.stock.checkedAt) + ' 확인)', short: want + ' 품절' };
      return { avail: null, why: josa(want, '을', '를') + ' 파는지 확인 못 함' };
    }
    return { avail: null, why: '사이즈별 재고는 판매처에서 확인해 주세요' + (p.stock && p.stock.inStock && !old ? '(상품은 재고 있음, ' + kd(p.stock.checkedAt) + ' 확인)' : '') };
  }
  /** 평소 사이즈로 고르기. */
  function fitBySize(p, want, today) {
    const s = sizeOf(p, want), a = availOf(p, s ? s.label : '', want, today);
    const nonStd = p.sizes.length && p.sizes.every((x) => /^\d+$/.test(x.label)) && !p.sizes.some((x) => x.alias);
    if (nonStd && !s) return { score: 0.5, size: '', text: '이 브랜드는 사이즈 이름이 달라(' + p.sizes.map((x) => x.label).join('·') + ') 평소 사이즈로 못 골라요. 잘 맞는 티 실측을 넣어 주세요', avail: null, meas: '' };
    const score = a.avail === true ? 1 : a.avail === false ? 0 : 0.6;
    return { score, size: s ? s.label : want, text: a.why, avail: a.avail, availStale: !!a.stale, caution: a.avail === false, notOffered: !!a.notOffered, short: a.short || '', meas: p.sizeDoubt ? '' : measLine(s, p.sizeSrc, p.lengthFrom), bySize: true };
  }
  /**
   * 사이즈 고르기. ref(잘 맞는 옷 실측)가 있으면 가장 가까운 사이즈, 실측으로 못 고르면 평소 사이즈, 둘 다 없으면 중립.
   * 뒤 중심 총장(lengthFrom 'cb')은 2cm 더해 견준다[추정]. 치수표를 믿기 어려운 상품(sizeDoubt)은 실측 비교에 쓰지 않는다.
   */
  function fitOf(p, q) {
    const ref = q.ref && typeof q.ref === 'object' ? q.ref : null;
    const hasRef = ref && ['chest', 'length', 'shoulder'].some((k) => num(ref[k], 1, 250) != null);
    const want = normSize(q.size), today = q.today;
    if (p.stock && p.stock.inStock === false) return { score: 0, size: '', text: '상품 전체 품절(' + kd(p.stock.checkedAt) + ' 확인)', avail: false, caution: true, short: '전체 품절' };
    if (p.user && !hasRef && p.sizes.length) {                                                       // 직접 넣은 상품은 적은 사이즈를 그대로 쓴다(평소 사이즈와 달라도 표에서 섞이지 않게)
      const s0 = p.sizes[0];
      return { score: 0.5, size: s0.label, text: '적은 사이즈 ' + s0.label + (want && normSize(s0.label) !== want ? '(평소 사이즈 ' + want + '와 달라요)' : ''), avail: null, meas: measLine(s0, 'user', p.lengthFrom), userSize: true, neutral: !want };
    }
    if (hasRef) {
      let best = null;
      const adj = p.lengthFrom === 'cb' ? LEN_CB : 0;
      for (const s of (p.sizeDoubt ? [] : p.sizes)) {
        let cost = 0, n = 0, mx = 0; const diffs = [];
        for (const [k, w, label] of [['chest', 1, '가슴'], ['length', 0.6, '총장'], ['shoulder', 0.6, '어깨']]) {
          const r = num(ref[k], 1, 250); if (r == null || s[k] == null) continue;
          const d = Math.round((s[k] + (k === 'length' ? adj : 0) - r) * 10) / 10; cost += Math.abs(d) * w; n += w; mx = Math.max(mx, Math.abs(d)); diffs.push(label + ' ' + (d > 0 ? '+' : d < 0 ? '−' : '±') + Math.abs(d) + 'cm');
        }
        if (!n) continue;
        const c = cost / n;
        if (!best || c < best.c) best = { s, c, diffs, mx, lenAdj: adj && num(ref.length, 1, 250) != null && s.length != null };
      }
      const onlyOne = p.sizes.length === 1, mine = p.user ? '적은' : '공개';
      if (!best || (onlyOne && best.c > 3)) {                                                         // 실측으로 못 고르면: 평소 사이즈가 있으면 그것으로(품절·안 팖을 놓치지 않게)
        const why = p.sizeDoubt ? '치수표를 믿기 어려워(' + p.sizeDoubt + ') 실측으로는 못 골라요' : !best ? '글자로 된 치수표가 없어 실측으로는 못 골라요' : mine + ' 치수가 ' + sizeName(p, best.s.label) + '뿐이고 잘 맞는 옷과 ' + best.diffs.join(', ') + ' 달라요';
        const base = { byRefFailed: true, diffs: best ? best.diffs : null, maxDiff: best ? best.mx : null, refSize: best ? best.s.label : '' };
        if (want) { const f = fitBySize(p, want, today); return Object.assign(f, base, { text: why + ' · ' + f.text, score: Math.min(f.score, 0.6), caution: true }); }
        return Object.assign({ score: 0.4, size: '', text: why + '. 판매처 치수표를 봐 주세요', caution: true, avail: null, onlyOne }, base);
      }
      const a = availOf(p, best.s.label, normSize(best.s.alias || best.s.label), today);
      let score = Math.max(0, 1 - best.c / 5);                                                         // [제안값] 평균 5cm 어긋나면 0
      if (onlyOne) score = Math.min(score, 0.6);                                                       // 다른 사이즈 치수를 몰라 확신을 낮춘다
      if (a.avail === false) score *= 0.3;
      const sz = sizeName(p, best.s.label), cbNote = best.lenAdj ? ' (총장은 뒤 중심 치수에 2cm 더해 견줌, 추정)' : '';
      const text = onlyOne ? mine + ' 치수가 ' + sz + '뿐이에요. ' + josa(sz, '은', '는') + ' 잘 맞는 옷과 ' + best.diffs.join(', ') + cbNote + ' — 다른 사이즈는 판매처 치수표를 봐 주세요 · ' + a.why
        : sz + ' 사이즈가 잘 맞는 옷과 가장 가까워요: ' + best.diffs.join(', ') + cbNote + ' · ' + a.why;
      return { score, size: best.s.label, text, caution: best.c > 3 || a.avail === false || onlyOne, avail: a.avail, availStale: !!a.stale, onlyOne, byRef: true, short: a.short || '', meas: measLine(best.s, p.sizeSrc, p.lengthFrom), diffAvg: Math.round(best.c * 10) / 10, maxDiff: best.mx, diffs: best.diffs };
    }
    if (want) return fitBySize(p, want, today);
    return { score: 0.5, size: '', text: '잘 맞는 티 실측이나 평소 사이즈를 넣으면 사이즈까지 골라 드려요', neutral: true, avail: null, meas: '' };
  }

  function brandOf(p, q, cat) {
    const fav = arr(q.brands).filter((b) => typeof b === 'string');
    if (!fav.length) return { score: 0.5, text: '', neutral: true };
    if (p.brand && fav.indexOf(p.brand) >= 0) return { score: 1, text: '좋아하는 브랜드(' + brandName(cat, p.brand) + ')' };
    const fam = has(cat.brands, p.brand) && cat.brands[p.brand].family;
    const sib = fam && fav.find((b) => has(cat.brands, b) && cat.brands[b].family === fam);
    if (sib) return { score: 0.5, text: '좋아하는 ' + josa(brandName(cat, sib), '과', '와') + ' 같은 계열(' + brandName(cat, p.brand) + ')', sib };
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
   * '지금 보는 상품'(무신사 등에서 보던 상품)을 사용자가 적은 값으로 만든다. 출처는 '직접 적음'(약한 확인). 핏·묶음 수를 안 적으면 상품 이름에서 읽는다(출처 '상품명').
   * input: { name, brand(글자), price, packCount, link, storeName, sleeve, fit, logo, thick, neck, cotton100, fiber(원사 또는 편직), size, chest, length, shoulder }
   * id 는 이름·브랜드·가격·사이즈로 만든다(보던 상품이 둘이어도 기록이 섞이지 않게).
   */
  function userProduct(input, cat, line, today) {
    const x = input && typeof input === 'object' ? input : {};
    const L = has(cat.lines, line) ? cat.lines[line] : null;
    if (!L) return null;
    const name = str(x.name, 100).trim(), g = guessFromName(cat, name + ' ' + str(x.brand, 40));
    const bk = brandKey(cat, x.brand) || (str(x.brand, 40).trim() ? '' : g.brand);
    const size = str(x.size, 12).normalize('NFKC').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 8) || 'M';
    const meas = {}; for (const k of ['chest', 'length', 'shoulder']) { const v = num(Number(x[k]), 20, 150); if (v != null) meas[k] = v; }
    const fit = has(FIT, x.fit) ? x.fit : g.fit, pack = num(Number(x.packCount), 1, 12) || (x.packCount == null || x.packCount === '' ? g.packCount : null) || 1;
    const price = num(Math.round(Number(x.price)), 100, 1e8);
    const raw = { id: 'user-' + hash36([name, bk || str(x.brand, 40).trim(), price, size].join('|')), line, brand: bk || str(x.brand, 40).trim(), brandLabel: bk ? '' : str(x.brand, 40).trim(), name: name || '지금 보는 상품', cat: L.cat, kind: L.kind || 'tee',
      family: L.family || 'white', light: 95, formality: 1, pattern: 'solid', sleeve: x.sleeve === 'long' || x.sleeve === 'short' ? x.sleeve : g.sleeve || 'short', fit, fitSrc: has(FIT, x.fit) ? 'user' : fit ? 'name' : undefined,
      fabric: { cotton100: x.cotton100 === true ? true : x.cotton100 === false ? false : undefined, comp: x.cotton100 === true ? '면 100%' : '', thick: x.thick,
        fiber: has(FIBERS, x.fiber) ? x.fiber : undefined, fiberSrc: has(FIBERS, x.fiber) ? 'user' : undefined, knit: has(KNITS, x.fiber) ? x.fiber : undefined, knitSrc: has(KNITS, x.fiber) ? 'user' : undefined },   // fiber 칸 하나로 원사(수피마 등)나 편직(루프휠 등)을 받는다
      neck: x.neck, logo: x.logo, sizes: Object.keys(meas).length ? [Object.assign({ label: size }, meas)] : [], price, currency: 'KRW', packCount: pack,
      store: { name: str(x.storeName, 60) || '직접 넣은 상품', url: safeLink(x.link) }, checkedAt: realDate(today) || W.today(), styles: [] };
    const u = cleanPickProduct(raw, 0, { user: true });
    if (u) { u.userSize = size; const m = matchCatalog(cat, line, name, bk, u.sleeve); if (m) u.sameAs = m.id; }   // userSize: 치수 없이 적은 사이즈도 남긴다
    return u;
  }
  const KO_EN = { 에어리즘: 'airism', 수피마: 'supima', 피마: 'pima', 링스펀: 'ringspun', 클래식: 'classic', 컴포트: 'comfort', 커스텀: 'custom', 슬림: 'slim', 라일: 'lisle', 골든플리스: 'goldenfleece', 숏슬리브: 'shortsleeve', 롱슬리브: 'longsleeve', 헤비웨이트: 'heavyweight', 크루넥: 'crewneck', 크루: 'crew', 넥: 'neck' };
  const GENERIC = /^(티셔츠|티|반팔|긴팔|화이트|흰색|흰|white|tee|tshirt|t|shirt|shirts|셔츠|남성|남자|여성|공용|맨|men|mens|무지|코튼|cotton|면|100|반소매|긴소매)$/;
  /**
   * 사용자가 적은 보던 상품이 어울 카탈로그의 상품과 같은 것인지: 브랜드 열쇠가 같고, 이름의 일반어가 아닌 낱말(2자 이상) 두 개 이상이 카탈로그 이름에 들어 있을 때(가장 많이 겹치는 것, 둘이 같으면 못 정함).
   * 값은 묻지 않는다(쿠폰·세일로 다를 수 있어 화면에서 따로 알린다).
   */
  function matchCatalog(cat, line, name, bk, sleeve) {
    if (!bk || !name) return null;
    const b = cat.brands[bk], bn = [bk, b.name, b.ko].concat(b.aliases).map(bnorm);
    const toks = String(name).toLowerCase().normalize('NFKC').split(/[^0-9a-z가-힣]+/).filter((t) => t.length >= 2 && !GENERIC.test(t) && bn.indexOf(bnorm(t)) < 0);
    if (!toks.length) return null;
    const scored = cat.products.filter((p) => p.line === line && p.brand === bk && (!sleeve || p.sleeve === sleeve)).map((p) => {
      const n = bnorm(p.name) + bnorm(p.code || '');
      return { p, n: toks.filter((t) => n.indexOf(t) >= 0 || (has(KO_EN, t) && n.indexOf(KO_EN[t]) >= 0)).length };
    }).sort((a, b) => b.n - a.n);
    if (!scored.length || scored[0].n < 2) return null;
    if (scored[1] && scored[1].n === scored[0].n) return null;
    return scored[0].p;
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
    const extra = arr(q.extra).filter((p) => p && p.user && p.line === q.line), exclude = arr(q.exclude).filter((x) => typeof x === 'string');   // exclude: 이미 샀다고 기록한 상품(1등·대안에서 뺀다)
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
      if (!up.landed) { v = Math.min(v, 0.5); valueNotes.push(up.shipEst ? '배송비가 결제 화면에서 바뀔 수 있고 관세·부가세를 몰라 가성비를 중간 이하로 봤어요' : '배송비·관세를 몰라 가성비를 중간 이하로 봤어요'); }
      const stale = age == null || age > STALE_DAYS, future = age != null && age < -1;
      const cs = conds.map((k) => Object.assign({ key: k, label: CONDS[k].label, noun: CONDS[k].noun }, condOf(p, k, { fit, outerLen: q.outerLen, closed: q.closed === true })));
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
      r.boughtOut = exclude.indexOf(p.id) >= 0;
      [r.out, r.outShort] = r.boughtOut ? ['이미 샀다고 기록한 상품이라 뺐어요', '이미 삼']
        : age == null ? ['확인일을 알 수 없어 자료를 다시 봐야 해요', '확인일 없음']
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
    const hasWarn = (r) => r.conds.some((c) => c.status === 'warn' && !softLen(c));                 // 뒤 중심 추정 2cm 이하의 길이 경고는 '어긋날 수 있음'으로 안 센다
    const anyClean = rows.some((r) => !r.out && !r.product.user && r.gate && !hasWarn(r));          // 꼭 지킬 것이 어긋날 수 있는 상품은, 어긋날 염려 없이 문턱을 넘은 상품이 하나라도 있으면 뒤로 보낸다
    const grp = (r) => (r.out ? 3 : anyClean && hasWarn(r) ? 2 : r.gate ? 0 : 1);
    const warnBack = anyClean ? rows.filter((r) => !r.out && !r.product.user && hasWarn(r)).length : 0;
    rows.sort((a, b) => grp(a) - grp(b) || b.raw - a.raw || a.unit.krw - b.unit.krw || (a.product.id < b.product.id ? -1 : 1));
    // 보던 상품이 카탈로그 상품과 같은 것이면(sameAs) 직접 적은 행은 순위에서 빼고 카탈로그 행을 '보던 상품'으로 쓴다
    const sameRow = (() => { const u = rows.find((r) => r.product.user && r.product.sameAs); if (!u) return null; const c = rows.find((r) => r.product.id === u.product.sameAs); return c ? { u, c } : null; })();
    if (sameRow) rows.splice(rows.indexOf(sameRow.u), 1);
    const eligibleAll = rows.filter((r) => !r.out);
    const eligible = eligibleAll.filter((r) => !r.product.user);                                       // 1등·대안은 어울이 확인한 상품 안에서만. 직접 넣은 상품은 몇 위인지만 알려 준다
    const pickRow = eligible[0] || null;
    const passCount = eligible.filter((r) => r.gate).length;
    const rawBest = eligible.slice().sort((a, b) => b.raw - a.raw || a.unit.krw - b.unit.krw || (a.product.id < b.product.id ? -1 : 1))[0] || null;
    const gate = g ? { key: g, label: SHORT[g], pass: passCount, changed: !!(pickRow && rawBest && rawBest !== pickRow), none: eligible.length > 0 && passCount === 0 } : null;
    for (const r of rows) if (g && !r.out && !r.gate) r.gateNote = '1순위(' + SHORT[g] + ')가 보통 미만이라 뒤로 보냈어요';
    // 1순위 기준이 '보통' 이하인 1등: 견준 상품 가운데 그 기준이 가장 높은지(결론 첫 문장에 쓴다)
    let priLead = null;
    if (pickRow && pri[0] && !isNeutral(pickRow, pri[0]) && pickRow.crit[pri[0]] < 0.66 && !(gate && gate.none) && !(pri[0] === 'style' && line && line.styleRole === 'tiebreak')) {
      const k = pri[0], mx = Math.max.apply(null, eligible.map((r) => r.crit[k]));
      priLead = { key: k, top: pickRow.crit[k] >= mx - 1e-9, n: eligible.length };
      if (!priLead.top) { const best = eligible.slice().sort((a, b) => b.crit[k] - a.crit[k] || b.raw - a.raw)[0]; priLead.best = best; priLead.bestName = pname(cat, best.product); }   // 1순위가 더 높은 상품(대안으로도 낸다)
    }
    // 근거 문장·체크 목록·결론
    for (const r of rows) explain(r, { pri, w, use, conds, cat, gate, isPick: r === pickRow, priLead: r === pickRow ? priLead : null });
    const notes = [];
    for (const r of rows) {
      if (!r.out || r.product.user || r.boughtOut) continue;                                     // 산 상품은 화면이 따로 알린다
      if (pickRow && r.raw > pickRow.raw) notes.push({ kind: 'out', id: r.product.id, text: pname(cat, r.product) + ' — 기준 점수는 더 높지만 ' + r.out });
      else if (!pickRow) notes.push({ kind: 'out', id: r.product.id, text: pname(cat, r.product) + ' — ' + r.out });
    }
    // 대안 둘
    const alts = pickRow ? chooseAlts(pickRow, eligible, { pri, use, fav: arr(q.brands), cat, priBest: priLead && priLead.best, skip: sameRow ? sameRow.c : null, outerLen: q.outerLen }) : [];
    // 옷장과의 조합: 1등과 대안만 계산한다
    for (const r of [pickRow].concat(alts.map((a) => a.r)).filter(Boolean)) {
      const v = J.judgeCandidate(items, toCandidate(r.product, cat, today));
      r.closet = { supported: v.supported, note: v.note, added: v.added.length, before: v.before, after: v.after, top3: v.top3, overlaps: v.overlaps.map((o) => ({ id: o.item.id, name: o.item.name, level: o.level })) };
    }
    // 좋아하는 브랜드의 빈자리와 요약(직접 넣은 상품은 세지 않는다)
    const fav = arr(q.brands).filter((b) => typeof b === 'string');
    const catLine = inLine.filter((p) => !p.user), catPool = pool.filter((p) => !p.user), catRows = rows.filter((r) => !r.product.user);
    for (const b of fav) {
      const inL = catLine.some((p) => p.brand === b), inPool = catPool.some((p) => p.brand === b);
      if (inPool) continue;
      const bn = cat.brandNotes.find((n) => n.brand === b && (!q.line || !n.line || n.line === q.line));
      if (!inL) notes.push({ kind: 'missing', brand: b, text: bn ? bn.text : brandName(cat, b) + ': 이 품목에는 아직 확인한 상품이 없어요.' });
      else notes.push({ kind: 'sleeve', brand: b, text: brandName(cat, b) + ': ' + SLEEVES[q.sleeve] + ' 상품은 목록에 없어요(다른 소매는 있어요).' });
    }
    const favNote = favSummary(fav, catRows, catPool, catLine, q, cat, pickRow);
    if (fxAge != null && fxAge > FX_DAYS && pool.some((p) => p.currency !== 'KRW')) notes.push({ kind: 'fx', text: '달러 환율이 ' + fxAge + '일 전 값이에요. 해외 상품 원화 가격은 다를 수 있어요.' });
    const second = eligible[1] && (!g || eligible[1].gate === pickRow.gate) ? eligible[1] : null;
    const allOk = conds.length ? eligible.filter((r) => r.conds.every((c) => c.status === 'ok')).length : null;
    const head = conds.length ? '조건을 어기지 않은 ' + eligible.length + '개' : eligible.length + '개';
    const pickWarn = pickRow ? pickRow.conds.filter((c) => c.status === 'warn' && !softLen(c)).length : 0, pickSoft = pickRow ? pickRow.conds.find(softLen) : null;
    const rank = pickRow ? { n: eligible.length, allOk, warn: pickWarn, gap: second ? Math.round((pickRow.raw - second.raw) * 1000) / 10 : null,
      text: (eligible.length === 1 ? (conds.length ? '조건을 어기지 않은 것은 이것 하나' : '고를 수 있는 것은 이것 하나')
        : head + ' 중 1위' + (gate && gate.changed && pickRow.gate ? '(' + josa(gate.label, '이', '가') + ' 보통 이상인 ' + gate.pass + '개 안에서)' : '') + (pickWarn ? '' : second ? ' · 2위와 ' + (pickRow.raw - second.raw < 0.03 ? '근소한 차이' : pickRow.raw - second.raw < 0.1 ? '차이 조금' : '차이 큼') : ''))
        + (pickWarn ? ' · 꼭 지킬 것 ' + pickWarn + '개가 어긋날 수 있어요' : '') + (pickSoft ? ' · 카디건보다 약 ' + pickSoft.d + 'cm 길 수 있어요(뒤 중심 치수 추정)' : '') + (warnBack ? ' · 어긋날 수 있는 ' + warnBack + '개는 뒤로 보냈어요' : ''), warnBack } : null;
    let gapWhy = pickRow && second ? whyAhead(pickRow, second, w, cat) : '';
    if (gapWhy && second && second.altSkip && !alts.some((a) => a.r === second)) gapWhy = gapWhy.replace(' 둘 다 봐 주세요.', '') + ' 2위는 ' + second.altSkip.replace(/뺐어요$/, '뺐어요.');
    if (gapWhy && rows.some((r) => r.product.user && !r.out)) gapWhy = '확인한 상품 중 ' + gapWhy;                 // 직접 넣은 상품까지 센 전체 순위와 헷갈리지 않게
    const altNote = pickRow && alts.length < 2 && eligible.length > 1 ? altNoteFor(pickRow, eligible, alts, cat, q.outerLen) : '';
    const brandsIn = Array.from(new Set(rows.filter((r) => !r.product.user).map((r) => r.product.brand)));
    const userRow = sameRow ? sameRow.c : rows.find((r) => r.product.user) || null;
    const userSame = sameRow ? { id: sameRow.c.product.id, name: pname(cat, sameRow.c.product), userPrice: sameRow.u.product.price, catPrice: sameRow.c.krw, isPick: sameRow.c === pickRow } : null;
    return { pick: pickRow, alts, altNote, ranked: rows, eligible, eligibleAll, excluded, notes, rank, gate, gapWhy, favNote, weights: w, priorities: pri, use, conds, budget,
      user: userRow, userSame, noCatalog: !eligible.length,
      userRank: userRow && !userRow.out && eligible.length ? { idx: eligibleAll.indexOf(userRow), n: eligibleAll.length } : null,
      about: { count: rows.filter((r) => !r.product.user).length, inLine: inLine.filter((p) => !p.user).length, brands: brandsIn.length, checkedAt: rows.length ? rows.filter((r) => !r.product.user).map((r) => r.product.checkedAt).sort()[0] || '' : '', line: line ? line.label : '', styleNote: line && line.styleRole === 'tiebreak' ? line.styleNote : '' } };
  }

  /** 대안이 둘이 안 될 때 이유 한 줄: 가장 흔한 '뺀 이유'와, 카디건 총장 때문이면 한 치수 아래로 길이가 맞는 상품을 알려 준다. */
  function altNoteFor(pickRow, eligible, alts, cat, outerLen) {
    const head = alts.length ? '대안으로 낼 만한 상품이 하나뿐이에요.' : '대안으로 낼 만한 상품이 없어요.';
    const rest = eligible.filter((r) => r !== pickRow && !alts.some((a) => a.r === r));
    const longer = rest.filter((r) => r.conds.some((c) => c.key === 'notLonger' && (c.status === 'warn' || c.status === 'fail')));
    const L = num(outerLen, 40, 100);
    if (L != null && longer.length && longer.length >= rest.length / 2) {
      const down = [];
      for (const r of longer) {
        const p = r.product, i = p.sizes.findIndex((x) => x.label === r.fit.size); if (i <= 0) continue;
        const s2 = p.sizes[i - 1], s1 = p.sizes[i], adj = p.lengthFrom === 'cb' ? LEN_CB : 0;
        if (s2.length == null) continue;
        const d2 = Math.round((s2.length + adj - L) * 10) / 10; if (d2 > 1) continue;
        const ch = s1.chest != null && s2.chest != null ? Math.round((s1.chest - s2.chest) * 10) / 10 : null;
        down.push(pname(cat, p) + josa(pname(cat, p), '은', '는').slice(pname(cat, p).length) + ' ' + sizeName(p, s2.label) + '(총장 ' + (adj ? '약 ' : '') + (s2.length + adj) + 'cm)이면 길이가 맞아요' + (ch != null ? '(가슴은 ' + sizeName(p, s1.label) + '보다 ' + ch + 'cm 좁음)' : ''));
        if (down.length >= 2) break;
      }
      return head + ' 카디건 총장(' + L + 'cm) 때문이에요: 나머지 ' + longer.length + '개는 고른 사이즈가 카디건보다 길어요.' + (down.length ? ' 한 치수 내리면 — ' + down.join(' · ') + '.' : '') + ' 전체 순위에서 모두 볼 수 있어요.';
    }
    const why = {}; for (const r of rest) if (r.altSkip) why[r.altSkip] = (why[r.altSkip] || 0) + 1;
    const top = Object.keys(why).sort((a, b) => why[b] - why[a])[0];
    return head + (top ? ' ' + why[top] + '개는 ' + top.replace(/뺐어요$/, '뺐고') + ', 나머지는 1위보다 나은 점이 없어요.' : ' 1위보다 나은 점이 있는 상품이 없어요.') + ' 전체 순위에서 모두 볼 수 있어요.';
  }
  /** 카디건 길이 경고 가운데 '뒤 중심 추정 2cm 이하'만 있는 것은 대안에서 빼지 않고 이름에 적는다. */
  const softLen = (c) => c.key === 'notLonger' && c.status === 'warn' && c.adj && c.d != null && c.d <= 2;

  /**
   * 대안 둘. 대안마다 1등보다 나은 점이 하나 이상 있어야 하고, 그 나은 점이 대안 이름이 된다(나은 점이 없으면 내지 않는다).
   *   나은 점: 더 쌈(한 장 값과 지금 낼 돈 둘 다) · 묶음이라 한 장 값이 쌈 · 조건이 더 확인됨 · 다른 좋아하는 브랜드 · 공개된 품질 근거가 더 많음 · 사이즈가 더 잘 맞음 ·
   *   다른 소매·핏(고를 거리) · 점수가 거의 같음(3점 안). 가격을 확인한 지 14일이 지났으면 가격을 나은 점으로 쓰지 않는다.
   * 대안은 1등보다 25점 넘게 낮으면 내지 않는다. 예외: 한 장 값이 1등의 1/3 이하이고 가성비가 '좋음'이며 조건 경고가 없는 것 하나는 40점 안이면 '○○ 대신 값을 보면'으로 보여 준다
   *   (1순위로 고른 기준에 값이 있을 때만 — 브랜드를 안 고르고 브랜드를 1순위로 둔 경우 등은 내지 않는다).
   * 받쳐 입기에서는 1등이 루즈핏이 아니면 루즈·박스핏 대안을 내지 않고, 핏이 1순위면 사이즈가 4cm 넘게 어긋나는 대안을 내지 않는다.
   */
  function chooseAlts(pickRow, eligible, o) {
    const { pri, use, fav, cat } = o;
    const near = (r, d) => r.raw >= pickRow.raw - (d || 0.25);                                        // [제안값]
    const priceOk = (r) => pri[0] !== 'value' || r.unit.krw <= pickRow.unit.krw * 2 || r.unit.krw - pickRow.unit.krw <= 15000;   // 가성비가 1순위면 두 배 넘고 한 장 15,000원 넘게 비싼 것은 내지 않는다 [제안값]
    const why = (r) => (use === 'layer' && r.product.fit === 'relaxed' && pickRow.product.fit !== 'relaxed' ? '루즈·박스핏이라 받쳐 입기 대안에서는 뺐어요'
      : pri[0] === 'fit' && !r.fit.neutral && (r.fit.score < 0.5 || r.fit.onlyOne || (r.fit.maxDiff != null && r.fit.maxDiff > 4)) ? '사이즈가 잘 맞는 옷과 많이 달라 핏 1순위 대안에서는 뺐어요'
      : r.conds.some((c) => c.status === 'warn' && !softLen(c)) ? '고른 조건과 어긋날 수 있어 대안에서는 뺐어요' : !priceOk(r) ? '한 장 값이 두 배 넘게(15,000원 넘게) 비싸 가성비 1순위 대안에서는 뺐어요' : '');
    for (const r of eligible) if (r !== pickRow) r.altSkip = o.skip === r ? '보던 상품이라 대안에서는 뺐어요' : why(r);
    const ok = eligible.filter((r) => r !== pickRow && !r.altSkip);
    const rest = ok.filter((r) => r.gate === pickRow.gate).concat(ok.filter((r) => r.gate !== pickRow.gate));   // 1순위 문턱을 넘은 것부터
    const fresh = (r) => !r.stale && !pickRow.stale;                                                 // 가격을 나은 점으로 써도 되나(둘 다 14일 안)
    const isFav = (r) => fav.indexOf(r.product.brand) >= 0 && r.product.brand !== pickRow.product.brand;
    const condGain = (r) => r.conds.filter((c, i) => c.status === 'ok' && pickRow.conds[i] && (pickRow.conds[i].status === 'unknown' || pickRow.conds[i].status === 'warn')).map((c) => c.label);   // 둘 다 맞고 근거 등급만 다르면 '더 확인된 것'이 아니다
    const LB = { cheap: '더 싸게', pack: '묶음으로 한 장 값을 줄이려면', quality: '공개된 품질 근거가 더 많은 것', fit: '사이즈가 더 잘 맞는 것', tie: '점수가 거의 같은 것', value: '가성비가 더 좋은 것' };
    const PRI_LB = { fit: LB.fit, quality: LB.quality, value: LB.value };                         // 1순위가 1등보다 높은 상품의 이름
    /** 1등보다 나은 점의 이름들(강한 것부터). 비어 있으면 대안으로 내지 않는다. */
    const advantages = (r) => {
      const L = [];
      if (o.priBest === r && has(PRI_LB, pri[0]) && near(r) && !(pri[0] === 'value' && !fresh(r))) L.push(PRI_LB[pri[0]]);
      if (fresh(r) && r.unit.krw <= pickRow.unit.krw * 0.85 && r.unit.pay <= pickRow.unit.pay) L.push(LB.cheap);
      if (fresh(r) && r.unit.krw <= pickRow.unit.krw * 0.85 && r.unit.pay > pickRow.unit.pay && r.product.packCount > 1) L.push(LB.pack);
      const gain = condGain(r); if (gain.length) L.push('조건이 더 확인된 것(' + gain.join('·') + ')');
      if (isFav(r)) L.push(joinJosa([brandName(cat, r.product.brand)], '을', '를') + ' 더 좋아한다면');
      if (r.quality.score >= pickRow.quality.score + 0.75) L.push(LB.quality);
      if (r.fit.byRef && pickRow.fit.byRef && r.fit.score >= pickRow.fit.score + 0.15) L.push(LB.fit);          // 치수를 견준 경우만 '더 잘 맞는 것'
      else if (!r.fit.neutral && !pickRow.fit.neutral && r.fit.avail === true && !r.fit.availStale && pickRow.fit.avail == null) L.push('고른 사이즈 재고가 확인된 것');
      if (r.product.sleeve !== pickRow.product.sleeve) L.push(SLEEVES[r.product.sleeve] + '을 원하면');
      if (r.product.fit && pickRow.product.fit && r.product.fit !== pickRow.product.fit) L.push(josa(FIT[r.product.fit], '을', '를') + ' 원하면');
      if (pickRow.raw - r.raw < 0.03) L.push(LB.tie);
      return L;
    };
    const cands = [];
    if (o.priBest && o.priBest !== pickRow && !o.priBest.altSkip && has(PRI_LB, pri[0]) && near(o.priBest) && !(pri[0] === 'value' && !fresh(o.priBest))) cands.push({ r: o.priBest, label: PRI_LB[pri[0]] });   // 1순위에서 1등보다 높은 상품을 먼저(25점·14일 규칙은 그대로)
    if (rest[0] && rest[0].gate === pickRow.gate && pickRow.raw - rest[0].raw < 0.12) cands.push({ r: rest[0] });
    const cheaper = rest.filter((r) => near(r) && advantages(r).indexOf(LB.cheap) >= 0).sort((a, b) => b.raw - a.raw)[0];
    if (cheaper && cheaper.unit.krw <= pickRow.unit.krw * 0.5) cands.push({ r: cheaper, label: LB.cheap });   // 반값 아래면 '더 싸게'가 조건보다 먼저
    const condBetter = rest.find((r) => near(r) && strongOk(r) > strongOk(pickRow) && condGain(r).length);
    if (condBetter) cands.push({ r: condBetter, label: '조건이 더 확인된 것(' + condGain(condBetter).join('·') + ')' });
    if (pri[0] && pri[0] !== 'value' && !isNeutral(pickRow, pri[0])) {
      const deal = ok.filter((r) => fresh(r) && r.unit.krw <= pickRow.unit.krw / 3 && r.unit.pay < pickRow.unit.pay && r.crit.value >= 0.66 && near(r, 0.4)).sort((a, b) => b.raw - a.raw)[0];
      if (deal) cands.push({ r: deal, label: (pri[0] === 'brand' ? '브랜드' : pri[0] === 'quality' ? '품질 근거' : pri[0] === 'fit' ? '핏' : '스타일') + ' 대신 값을 보면', deal: true });
    }
    if (cheaper) cands.push({ r: cheaper, label: LB.cheap });
    const favOther = rest.find((r) => near(r) && isFav(r));
    if (favOther) cands.push({ r: favOther });
    const better = rest.filter((r) => near(r) && r.quality.score >= pickRow.quality.score + 0.75).sort((a, b) => b.raw - a.raw)[0];
    if (better) cands.push({ r: better, label: LB.quality });
    for (const r of rest) if (near(r)) cands.push({ r });
    const alts = [];
    for (const c of cands) {
      if (alts.length >= 2) break;
      if (alts.some((a) => a.r === c.r)) continue;
      const adv = advantages(c.r);
      if (!c.deal && !adv.length) continue;                                                           // 1등보다 나은 점이 없으면 대안이 아니다
      const used = alts.map((a) => a.label.replace(/\(카디건보다.*$/, ''));
      const label0 = [c.label].concat(adv).filter(Boolean).find((l) => used.indexOf(l) < 0 && (l !== c.label || c.deal || adv.indexOf(l) >= 0));   // 이름은 실제 나은 점이어야 한다
      if (!label0) continue;
      const soft = c.r.conds.find(softLen);
      const label = label0 + (soft ? '(카디건보다 약 ' + soft.d + 'cm 길 수 있음)' : '');
      const d = c.r.unit.krw - pickRow.unit.krw;
      alts.push({ label, delta: signedWon(d) + (Math.round(d) !== 0 && (c.r.product.packCount > 1 || pickRow.product.packCount > 1) ? '(한 장 기준)' : ''), why: altWhy(c.r), r: c.r, adv });
    }
    return alts;
  }

  /** 1등이 2위보다 앞선 가장 큰 이유 한 문장. 14일 지난 가격은 이유로 쓰지 않는다. */
  function whyAhead(a, b, w, cat) {
    const d = (a.raw - b.raw) * 100;
    const nb = pname(cat, b.product);
    if (d < 0.5) return '2위 ' + josa(nb, '과', '와') + ' 사실상 같은 점수예요. 둘 다 봐 주세요.';
    const parts = Object.keys(CRITERIA).filter((c) => !(c === 'value' && (a.stale || b.stale))).map((c) => ({ c, v: (w[c] * (a.crit[c] - b.crit[c])) / a.sw }));
    if (a.useScore != null && b.useScore != null) parts.push({ c: 'use', v: (USE_W * (a.useScore - b.useScore)) / a.sw });
    const top = parts.sort((x, y) => y.v - x.v)[0];
    if (!top || top.v <= 0) return '';
    const head = '2위 ' + josa(nb, '과', '와') + '는 ';
    if (top.c === 'quality') { const bt = b.quality.items.map((x) => x.text + '|' + x.src), extra = a.quality.items.filter((x) => bt.indexOf(x.text + '|' + x.src) < 0); return head + '공개된 품질 근거에서 갈렸어요.' + (extra.length ? ' 1위에만 있는 근거: ' + qualityList({ quality: { items: extra } }) + '.' : ''); }
    if (top.c === 'value') {
      const diff = b.unit.krw - a.unit.krw;
      if (Math.abs(diff) < 1) return head + '가성비에서 갈렸어요. 값은 같고 공개된 품질 근거가 더 많아요.';
      return head + '가성비에서 갈렸어요. ' + (diff > 0 ? '한 장 ' + won(diff) + ' 싸요.' : '한 장 ' + won(-diff) + ' 비싸지만 공개된 품질 근거가 더 많아요.');
    }
    if (top.c === 'brand') return head + '브랜드에서 갈렸어요(' + (a.brand.text ? a.brand.text.replace(/^좋아하는 브랜드\((.*)\)$/, '좋아하는 브랜드: $1') : brandName(cat, a.product.brand)) + ').';
    if (top.c === 'fit') return head + '사이즈에서 갈렸어요(' + (a.fit.byRef ? '잘 맞는 옷에 더 가까움' : a.fit.avail === true && !a.fit.availStale ? '고른 사이즈 재고 확인' : '사이즈 정보가 더 많음') + ').';
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
    const lead = passed.length ? '좋아하는 브랜드 ' + fav.length + '곳 중 조건을 통과한 건 ' + (passed.length === 1 ? passed[0] + '뿐이에요.' : copula(passed.join('·')) + '.') : '좋아하는 브랜드 ' + fav.length + '곳 모두 조건을 통과하지 못했어요.';
    const tail = Array.from(why.entries()).map(([reason, names]) => joinJosa(names, '은', '는') + ' ' + reason).join(', ');
    return lead + (tail ? ' ' + tail + '.' : '');
  }

  /** 괄호 뒤 조사: '품질(1순위)은' 처럼 괄호 앞 낱말의 받침을 따른다. */
  function josaP(word, paren, a, b) { const t = batchim(word); return String(word) + paren + (t == null ? a + '(' + b + ')' : t ? a : b); }
  const SRC_SHORT = { notice: '고시', seller: '판매처 설명', name: '상품명', photo: '사진', claim: '브랜드 설명', user: '직접 적음', 'official-weight': '공식 원단 무게', measured: '직접 잼' };
  /** 결론에 쓰는 품질 근거 목록: '면 100%(고시), 수피마 코튼(판매처 설명)'. 공식은 출처를 붙이지 않는다. */
  const qualityList = (r, n) => r.quality.items.slice(0, n || 2).map((it) => it.text + (it.src && it.src !== 'official' && has(SRC_SHORT, it.src) ? '(' + SRC_SHORT[it.src] + ')' : '')).join(', ');
  /** 한 줄 결론(두 문장 안팎), 체크 목록, 근거 문장, 아쉬운 점을 만든다. */
  function explain(r, o) {
    const { pri, use, cat, gate } = o, p = r.product;
    const checks = [];
    for (const c of r.conds) checks.push({ group: 'cond', mark: c.status === 'weak' && c.kind === 'partial' ? 'partial' : c.status, label: c.label, text: c.text });
    const critText = {
      value: () => '한 장 약 ' + won(r.unit.krw) + (r.unit.landed ? (r.unit.shipKnown && r.unit.ship ? '(배송비 포함)' : '') : r.unit.shipEst ? '(배송비 포함, 바뀔 수 있음)' : '(배송비 별도)') + (r.stale ? ' · ' + r.age + '일 전 가격' : ''),
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
    const weakEv = weakConds.filter((c) => c.kind !== 'partial'), partial = weakConds.filter((c) => c.kind === 'partial');
    if (unk.length) cautions.push('확인 못 한 것: ' + unk.map((c) => c.text.replace(/ 확인 못 함$/, '')).join(', ') + ' — 판매처 상세에서 봐 주세요');
    for (const c of warn) cautions.push(josa(c.label, '과', '와') + ' 어긋날 수 있어요: ' + c.text);
    for (const c of r.conds.filter((x) => x.status === 'fail')) cautions.push(josa(c.label, '과', '와') + ' 맞지 않아요: ' + c.text);
    if (r.fit.caution) cautions.push(r.fit.text);
    for (const t of r.valueNotes) cautions.push(t);
    if (r.stale && !r.out) cautions.push('가격·재고를 확인한 지 ' + r.age + '일 지났어요. 판매처에서 다시 확인해 주세요');
    if (p.currency !== 'KRW') cautions.push('해외 주문: $' + p.price + (r.unit.ship ? (r.unit.shipEst ? ' + 배송비 약 $' : ' + 배송비 $') + p.shipping.fee : '') + ' ≈ ' + won(r.unit.pay) + '(' + kd(cat.fx[p.currency].date) + ' 환율). 관세·부가세는 따로 확인');
    if (p.priceNote) cautions.push(p.priceNote);
    if (!r.fit.size && p.stock && p.stock.sizes && p.stock.sizes.length && p.stock.sizes.length <= 2 && !r.stale) cautions.push('재고가 ' + p.stock.sizes.join('·') + '만 있어요(' + kd(p.stock.checkedAt) + ' 확인)');
    if (r.future) cautions.push('확인일이 미래 날짜예요. 자료를 다시 확인해야 해요');
    if (p.user) cautions.push('직접 적은 값으로 견줬어요. 어울이 확인한 값이 아니라 약한 확인으로 봤어요');
    r.cautions = cautions;
    // 결론(두 문장 안팎): ① 1순위 문턱이나 가장 무게가 큰 '좋음' 이유 ② 꼭 지킬 조건의 상태(확인된 것 + 가장 큰 걸림). 상태 나열은 아래 목록에 맡긴다.
    // 고르지 않은 기준(중립)과 '보통' 이하는 이유로 말하지 않는다. '가장 높아요'는 1등에게만 쓴다
    const top = pri.find((c) => !isNeutral(r, c) && r.crit[c] >= 0.66 && (c !== 'value' || (!r.stale && r.unit.landed)) && (c !== 'fit' || r.fit.byRef || (r.fit.avail === true && !r.fit.availStale)));
    const leadOf = (c) => (c === 'brand' ? (r.brand.score === 1 ? '좋아하는 브랜드(' + brandName(cat, p.brand) + ')예요' : '좋아하는 ' + josa(brandName(cat, r.brand.sib), '과', '와') + ' 같은 계열(' + brandName(cat, p.brand) + ')이에요')
      : c === 'quality' ? '공개된 품질 근거가 많은 편이에요' + (r.quality.items.length ? ': ' + qualityList(r) : '')
      : c === 'value' ? '한 장 약 ' + won(r.unit.krw) + '으로 가성비가 좋은 편이에요'
      : c === 'fit' ? (r.fit.byRef ? josa(sizeName(p, r.fit.size), '이', '가') + ' 잘 맞는 옷과 가장 가까워요' : sizeName(p, r.fit.size) + ' 재고가 있어요')
      : '고른 스타일(' + r.style.hit.map((s) => STYLES[s]).join('·') + ')에 들어요');
    const lead = [];
    const gated = o.isPick && gate && gate.changed && r.gate && !gate.none, pl = o.priLead;
    if (o.isPick && gate && gate.none) lead.push(josa(gate.label, '이', '가') + " '보통' 이상인 상품이 없어 다른 기준을 합해 골랐어요");
    else if (gated) { lead.push(josa(gate.label, '을', '를') + ' 1순위로 골라, ' + josa(gate.label, '이', '가') + ' 보통 이상인 ' + gate.pass + '개 안에서 골랐어요'); if (top) lead.push(leadOf(top)); }
    else if (pl && pl.top) {
      const L = SHORT[pl.key], tail = pl.key === 'quality' && r.quality.items.length ? ': ' + qualityList(r) : pl.key === 'value' ? '(한 장 약 ' + won(r.unit.krw) + ')' : pl.key === 'fit' && r.fit.size ? '(' + sizeName(p, r.fit.size) + ')' : '';
      lead.push(josaP(L, '(1순위)', '은', '는') + " '보통'이지만 견준 " + pl.n + '개 중 가장 높아요' + tail);
    } else if (pl) { lead.push(josaP(SHORT[pl.key], '(1순위)', '은', '는') + ' ' + (pl.bestName ? josa(pl.bestName, '이', '가') + ' 더 높지만, 다른 기준을 합해 이것을 골랐어요' : "'보통'이에요")); if (top) lead.push(leadOf(top)); }
    else if (top) lead.push(leadOf(top));
    else if (o.isPick) lead.push(!pri.length ? '아직 기준을 고르지 않아 다섯 기준을 같은 무게로 봤어요' : '고른 기준을 합한 점수가 가장 높아요');
    let s2 = '';
    if (r.conds.length) {
      if (okConds.length === r.conds.length) s2 = '고른 조건(' + okConds.map((c) => c.label).join('·') + ')도 모두 확인됐어요';
      else {
        const pos = okConds.length ? joinJosa(okConds.map((c) => c.label), '은', '는') + ' 확인됐' : '';
        const neg = warn.length ? joinJosa(warn.map((c) => c.label), '과', '와') + ' 어긋날 수 있어요(' + srcPhrase(warn) + ')'
          : unk.length ? joinJosa(unk.map((c) => c.noun), '은', '는') + ' 확인 못 했어요'
          : weakEv.length ? joinJosa(weakEv.map((c) => c.noun), '은', '는') + ' 약한 근거(' + srcPhrase(weakEv) + ')로 봤어요'
          : partial.length ? partial.map((c) => c.say || c.text).join(', ') : '';
        s2 = pos && neg ? pos + '지만 ' + neg : pos ? pos + '어요' : neg ? '다만 ' + neg : '';
      }
    } else if (o.isPick && r.fit.caution && !r.fit.neutral) s2 = '다만 ' + (r.fit.avail === false ? r.fit.short || '고른 사이즈가 없어요' : r.fit.onlyOne ? '다른 사이즈 치수는 판매처에서 봐 주세요' : '사이즈가 잘 맞는 옷과 꽤 달라요');
    r.conclusion = lead.concat(s2 ? [s2] : []).map((t) => t.replace(/[.\s]+$/, '') + '.').join(' ');
  }
  function srcPhrase(cs) { const s = Array.from(new Set(cs.map((c) => c.srcText || (has(SRC, c.src) ? SRC[c.src] : '')).filter(Boolean))); return s.length ? s.join('·') : '약한 근거'; }

  /**
   * 잘 맞는 옷 치수가 없을 때, 보던 상품(a)과 1등(b)의 같은 사이즈끼리 가슴·총장 차이(총장은 옆목점 기준으로 맞춤, 뒤 중심은 +2cm 추정).
   * 예: "같은 L끼리면 보던 상품이 가슴 2.5cm 넓고 총장은 약 1cm 짧아요". 견줄 치수가 없거나 차이가 1cm 아래(치수표 오차 안)면 ''.
   */
  function sameSizeDiff(a, b, label) {
    if (a.fit.byRef || b.fit.byRef || !a.product.sizes.length) return '';
    const sa = label ? sizeOf(a.product, normSize(label)) : a.product.sizes[0]; if (!sa) return '';
    const lab = normSize(sa.label), sb = lab ? sizeOf(b.product, lab) : null;
    if (!sb) return '';
    const END = { 넓: ['넓고', '넓어요'], 좁: ['좁고', '좁아요'], 길: ['길고', '길어요'], 짧: ['짧고', '짧아요'] };
    const hps = (p, s) => (s.length == null ? null : s.length + (p.lengthFrom === 'cb' ? LEN_CB : 0));
    const est = a.product.lengthFrom === 'cb' || b.product.lengthFrom === 'cb';
    const parts = [];
    if (sa.chest != null && sb.chest != null) { const d = Math.round((sa.chest - sb.chest) * 10) / 10; if (Math.abs(d) >= 1) parts.push(['가슴 ' + Math.abs(d) + 'cm ', d > 0 ? '넓' : '좁']); }
    const la = hps(a.product, sa), lb = hps(b.product, sb);
    if (la != null && lb != null) { const d = Math.round((la - lb) * 10) / 10; if (Math.abs(d) >= 1) parts.push(['총장' + (parts.length ? '은' : '') + ' ' + (est ? '약 ' : '') + Math.abs(d) + 'cm ', d > 0 ? '길' : '짧']); }
    if (!parts.length) return '';
    return '같은 ' + sizeName(b.product, sb.label) + '끼리면 보던 상품이 ' + parts.map(([t, k], i) => t + END[k][i < parts.length - 1 ? 0 : 1]).join(' ');
  }
  /**
   * 보던 상품(a, 직접 넣은 상품)과 1등(b)을 같은 줄로 견준다(두 칸 표).
   * 반환: { rows: [{ key, label, a: { text, status }, b: { text, status }, win: 'a'|'b'|'' }], sum: 문장 }
   * 지금 낼 돈은 배송비를 아는 값끼리만 이기고 지는 것을 정한다(보던 상품 배송비를 모르면, 배송비를 빼도 비쌀 때만 1등이 싸다고 한다).
   */
  function contrast(a, b, cat, o) {
    if (!a || !b || a === b) return null;
    o = o || {};
    const rows = [];
    const SRC_TAIL = new RegExp('\\s*\\((' + Object.keys(SRC).map((k) => SRC[k]).concat(Object.keys(SIZE_SRC).map((k) => SIZE_SRC[k]), ['상품 사진으로 확인']).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')\\)\\s*$');
    /** 표 칸에 넣을 짧은 말: 출처 꼬리와 긴 설명을 떼고, 약한 확인·애매는 글자로 붙인다. */
    const brief = (c) => { if (c.status === 'unknown') return '모름'; const t = c.brief || c.short || c.text.replace(SRC_TAIL, '').replace(/ — .*$/, ''); return t + (c.status === 'weak' ? (c.kind === 'partial' ? ' · 애매' : ' · 약한 확인') : ''); };
    const aUser = !!a.product.user, who = aUser ? '보던 상품' : '보던 상품';
    const staleB = !!b.stale, staleA = !!a.stale, anyStale = staleA || staleB;
    const payTxt = (r) => won(r.unit.pay) + (r.product.packCount > 1 ? '(' + r.product.packCount + '장)' : '') + (r.unit.shipKnown ? (r.unit.ship ? ', 배송비 포함' : ', 무료 배송') : r.unit.shipEst ? ', 배송비 바뀔 수 있음' : ', 배송비 모름') + (r.stale ? '(' + r.age + '일 전 가격)' : '');
    const dPay = a.unit.pay - b.unit.pay, SHIP_GUESS = 5000;                                         // [가정] 국내 배송비는 보통 5,000원 아래: 차이가 그보다 크면 배송비를 몰라도 어느 쪽이 싼지 말한다
    const payWin = anyStale ? '' : a.unit.shipKnown && b.unit.shipKnown ? (dPay < 0 ? 'a' : dPay > 0 ? 'b' : '') : dPay > 0 && b.unit.shipKnown ? 'b' : dPay <= -SHIP_GUESS ? 'a' : '';
    rows.push({ key: 'pay', label: '지금 낼 돈', a: { text: payTxt(a) }, b: { text: payTxt(b) }, win: payWin });
    const packDiff = a.product.packCount !== b.product.packCount, dUnit = a.unit.krw - b.unit.krw;
    if (a.product.packCount > 1 || b.product.packCount > 1) rows.push({ key: 'unit', label: '한 장 값', a: { text: '약 ' + won(a.unit.krw) }, b: { text: '약 ' + won(b.unit.krw) }, win: packDiff && !anyStale ? (dUnit < -1 ? 'a' : dUnit > 1 ? 'b' : '') : '' });
    // 조건: 맞음(확인·약한 확인) / 애매 / 어긋날 수 있음 / 모름 — 근거 등급만 다른 것은 이기고 지는 것으로 치지 않는다
    const grade = (x) => (x.status === 'ok' || (x.status === 'weak' && x.kind !== 'partial') ? 2 : x.status === 'weak' ? 1 : x.status === 'warn' ? 0.5 : x.status === 'fail' ? 0 : null);
    const unk = [];
    a.conds.forEach((c, i) => {
      const d = b.conds[i]; if (!d) return;
      const st = (x) => (x.status === 'weak' && x.kind === 'partial' ? 'partial' : x.status);
      const ga = grade(c), gb = grade(d);
      if (ga == null && gb != null) unk.push(c.noun || c.label);
      rows.push({ key: 'cond:' + c.key, label: c.label, noun: c.noun, a: { text: brief(c), status: st(c), full: c.text }, b: { text: brief(d), status: st(d), full: d.text }, win: ga != null && gb != null && ga !== gb ? (ga > gb ? 'a' : 'b') : '' });
    });
    const mtxt = (p, s) => { if (!s) return ''; const m = [s.chest != null ? '가슴 ' + s.chest : '', s.length != null ? (p.lengthFrom === 'cb' ? '총장 약 ' + (s.length + LEN_CB) + '(뒤 중심 ' + s.length + ')' : '총장 ' + s.length) : ''].filter(Boolean); return m.length ? m.join('·') + 'cm' : ''; };
    const sizeTxt = (r, want) => {
      const p = r.product;
      if (r.fit.byRef) return sizeName(p, r.fit.size) + ' — 잘 맞는 옷과 ' + r.fit.diffs.join(', ');
      if (r.fit.byRefFailed && r.fit.diffs) return sizeName(p, r.fit.refSize) + ' — 잘 맞는 옷과 ' + r.fit.diffs.join(', ');
      const lab = (p.user && p.sizes.length ? p.sizes[0].label : '') || (r === a && o.size ? o.size : '') || r.fit.size || want, s = lab ? p.sizes.find((x) => x.label === lab) || sizeOf(p, normSize(lab)) : null;
      return s ? sizeName(p, s.label) + (mtxt(p, s) ? ' — ' + mtxt(p, s) : '') : lab ? lab + ' — 치수 모름' : '모름';
    };
    let sizeNote = '';
    if (!a.fit.neutral || !b.fit.neutral || a.product.sizes.length) {
      const want = aUser ? (a.product.sizes.length ? normSize(a.product.sizes[0].label) : '') : normSize(o.size || '');
      const fw = a.fit.byRef && b.fit.byRef ? (a.fit.diffAvg + 1 <= b.fit.diffAvg ? 'a' : b.fit.diffAvg + 1 <= a.fit.diffAvg ? 'b' : '') : (a.fit.byRefFailed && a.fit.diffs && b.fit.byRef && !b.fit.onlyOne) ? 'b' : '';
      rows.push({ key: 'size', label: '사이즈', noun: '사이즈', a: { text: sizeTxt(a, want) }, b: { text: sizeTxt(b, want) }, win: fw });
      const bl = b.fit.size ? normSize(b.fit.size) : '';
      if (aUser && want && bl && want !== bl && !a.fit.byRef) sizeNote = '보던 상품은 ' + a.product.sizes[0].label + '로 적으셨고 1위는 ' + (b.fit.byRef ? '잘 맞는 옷 치수로 ' : '평소 사이즈로 ') + sizeName(b.product, b.fit.size) + '을 골랐어요';
    }
    // 핏이 다르면(조건으로 보지 않을 때) 한 줄
    let fitNote = '';
    const fa = a.product.fit, fb = b.product.fit;
    if (fa && fb && fa !== fb && !a.conds.some((c) => c.key === 'notLoose')) {
      rows.push({ key: 'fit', label: '핏', noun: '핏', a: { text: FIT[fa] + (a.product.fitSrc === 'name' ? '(상품명에서 읽음)' : a.product.fitSrc === 'user' ? '(직접 적음)' : '') }, b: { text: FIT[fb] + (b.product.fitSrc && has(SRC, b.product.fitSrc) ? '(' + SRC[b.product.fitSrc] + ')' : '') }, win: '' });
      fitNote = '핏이 달라요: 보던 상품은 ' + FIT[fa] + ', 1위는 ' + FIT[fb] + '이에요' + (fa === 'relaxed' ? '. 루즈핏을 원하면 전체 순위에서 핏을 보고 고르세요' : '');
    }
    rows.push({ key: 'quality', label: '품질 근거', noun: '품질 근거', a: { text: qualityList(a, 3) || (aUser ? '적은 근거 없음' : '밝힌 근거 없음') }, b: { text: qualityList(b, 3) || '밝힌 근거 없음' }, win: a.quality.score >= b.quality.score + 0.75 ? 'a' : b.quality.score >= a.quality.score + 0.75 ? 'b' : '' });
    if (!a.brand.neutral) rows.push({ key: 'brand', label: '브랜드', noun: '브랜드', a: { text: a.brand.text || '좋아하는 브랜드 아님' }, b: { text: b.brand.text || '좋아하는 브랜드 아님' }, win: a.brand.score > b.brand.score ? 'a' : a.brand.score < b.brand.score ? 'b' : '' });
    const nb = pname(cat, b.product);
    const packTail = packDiff && a.product.packCount > 1 ? '(보던 상품 ' + a.product.packCount + '장 값과 견줌)' : '';
    const price = anyStale ? '1위 가격은 ' + (staleB ? b.age : a.age) + '일 전에 확인한 값이라 어느 쪽이 싼지는 판매처에서 봐 주세요'
      : payWin === 'b' ? '1위 ' + josa(nb, '이', '가') + ' ' + won(dPay) + (a.unit.shipKnown ? '' : ' 넘게') + ' 싸요' + (a.unit.shipKnown ? packTail : '(보던 상품 배송비는 빼고 셈' + (packTail ? ', ' + a.product.packCount + '장 값과 견줌' : '') + ')')
      : payWin === 'a' ? '보던 상품이 ' + won(-dPay) + ' 싸요' + (a.unit.shipKnown ? packTail : '(보던 상품 배송비는 빼고 셈' + (packTail ? ', ' + a.product.packCount + '장 값과 견줌' : '') + ')')
      : dPay < 0 ? '보던 상품이 ' + won(-dPay) + ' 싸지만 배송비를 몰라 확실하지 않아요'
      : dPay === 0 ? '지금 낼 돈은 같아요' : '';
    const unitLine = packDiff && !anyStale && Math.abs(dUnit) > 1 ? (a.product.packCount > 1 ? '다만 보던 상품은 ' + a.product.packCount + '장 묶음이라 한 장 값은 ' + (dUnit < 0 ? '보던 상품이 ' + won(-dUnit) + ' 싸요' : '1위가 ' + won(dUnit) + ' 싸요') : '한 장 값은 ' + (dUnit < 0 ? '보던 상품이 ' + won(-dUnit) + ' 싸요' : '1위가 ' + won(dUnit) + ' 싸요') + '(1위는 ' + b.product.packCount + '장 묶음)') : '';
    const nouns = (w) => rows.filter((x) => x.win === w && x.key !== 'pay' && x.key !== 'unit').map((x) => x.noun || x.label);
    const bw = nouns('b'), aw = nouns('a');
    const same = sameSizeDiff(a, b, aUser ? '' : o.size);
    const sleeveNote = a.product.sleeve !== b.product.sleeve ? '보던 상품은 ' + SLEEVES[a.product.sleeve] + '이라 ' + SLEEVES[b.product.sleeve] + ' 후보와 견줬어요' : '';
    const sum = [price, unitLine, same, sizeNote, fitNote, sleeveNote, bw.length ? '1위가 더 나은 것: ' + bw.join('·') : '', aw.length ? '보던 상품이 더 나은 것: ' + aw.join('·') : '', unk.length ? (aUser ? '보던 상품은 안 적어서 못 견준 것: ' : '보던 상품은 확인 못 한 것: ') + unk.join('·') + (aUser ? " — '더 정확히'에 적으면 다시 셈해요" : '') : ''].filter(Boolean).map((t) => t + '.').join(' ');
    return { rows, sum, payWin, why: whyBehind(a, b, o.weights, cat, aUser) };
  }
  /** 보던 상품이 1위보다 뒤인 이유 한 줄: 고른 기준(안 골랐으면 다섯 기준) 가운데 1위보다 0.15 넘게 낮은 것 둘까지. */
  function whyBehind(a, b, w, cat, aUser) {
    if (a.raw >= b.raw) return '';
    const ws = w || {}, chosen = Object.keys(CRITERIA).filter((c) => ws[c] != null && ws[c] > OFF_W);
    const list = (chosen.length ? chosen : Object.keys(CRITERIA)).map((c) => ({ c, d: (b.crit[c] - a.crit[c]) * (ws[c] || 1) })).filter((x) => x.d > 0.15 * (ws[x.c] || 1)).sort((x, y) => y.d - x.d).slice(0, 2);
    const reason = (c) => (c === 'value' ? (!a.unit.shipKnown ? '배송비를 몰라 값을 낮게 봤어요' : a.quality.items.length ? '같은 값에 품질 근거가 적어요' : '값에 견줄 품질 근거가 없어요')
      : c === 'quality' ? (!aUser ? '공개된 품질 근거가 1위보다 적어요' : a.quality.items.length ? '적은 품질 근거가 1위보다 적어요' : '품질 근거를 적지 않았어요')
      : c === 'brand' ? '좋아하는 브랜드가 아니에요' : c === 'fit' ? (a.fit.byRef ? '잘 맞는 옷과 더 달라요' : '사이즈 치수를 적지 않았어요') : '스타일 분류가 없어요');
    const conds = a.conds.filter((c, i) => b.conds[i] && (has(COND_W, c.status) ? COND_W[c.status] : 0) < (has(COND_W, b.conds[i].status) ? COND_W[b.conds[i].status] : 0)).map((c) => (c.noun || c.label) + (c.status === 'unknown' ? ' 모름' : c.status === 'warn' ? ' 어긋날 수 있음' : ' 애매'));
    const parts = list.map((x) => reason(x.c)).concat(conds.length ? ['조건: ' + conds.slice(0, 3).join('·')] : []);
    return parts.length ? parts.join(', ') : '';
  }
  /** 대안 한 줄: 한 장 값과 공개된 품질 근거 둘, 조건 상태. */
  function altWhy(r) {
    const parts = r.unit.landed ? [] : [r.unit.shipEst ? '배송비 바뀔 수 있음' : '배송비 별도'];          // 값은 카드에 따로 보인다
    if (r.quality.items.length) parts.push(qualityList(r));
    const by = (s, partial) => r.conds.filter((c) => c.status === s && (partial == null || (c.kind === 'partial') === partial)).map((c) => c.label);
    if (by('ok').length) parts.push('확인: ' + by('ok').join('·'));
    if (by('weak', false).length) parts.push('약한 확인: ' + by('weak', false).join('·'));
    if (by('weak', true).length) parts.push('애매: ' + by('weak', true).join('·'));
    if (by('unknown').length) parts.push('모름: ' + by('unknown').join('·'));
    if (by('warn').length) parts.push('어긋날 수 있음: ' + by('warn').join('·'));
    return parts.join(' · ');
  }

  return { SCHEMA, STALE_DAYS, DROP_DAYS, CRITERIA, SHORT, STYLES, USES, USE_LONG, CONDS, SLEEVES, FIT, THICK, NECKS, LOGOS, SRC, SRC_W, STRONG, FIBERS, KNITS, BUDGETS, GATE, LEN_CB,
    cleanPicks, cleanPickProduct, qualityOf, condOf, activeConds, fitOf, availOf, brandOf, styleOf, krw, unitPrice, toCandidate, toOwned, userProduct, brandKey, guessFromName, contrast, recommend,
    normSize, brandName, pname, sizeName, won, signedWon, josa, josaP, joinJosa, euro, realDate, daysSince, hash36 };
});
