/*
 * Pick — 사고 싶은 옷 하나를 "내 기준"으로 골라 주는 추천. 검증 카탈로그(data/picks.json) 안에서만 고른다. AI를 쓰지 않는다.
 *
 * 카탈로그: 공식 스토어·공식 판매처의 상품 페이지에서 직접 확인한 값만 들어 있다. 값마다 출처 등급(SRC)이 있다.
 *   가격·재고는 확인한 날(checkedAt)의 값이다. 상품 사진은 가져오지 않고 판매처 링크만 둔다. 스타일 분류(styles)는 어울의 편집 판단이다.
 *
 * 기준(CRITERIA) — 누른 순서대로 무게 3·2·1.5·1.2·1, 누르지 않은 기준은 0.5 [제안값]
 *   value   가성비: 한 장 값(해외면 배송비 포함) ÷ 품질 점수. 품목마다 고정 기준선(lines[].value.lo·hi)으로 0~1. 목록에 무엇이 있든 같은 상품은 같은 값
 *   quality 공개된 품질 근거: 면 100%, 수피마·라일·링스펀, 루프휠·통짜·인터로크, 바인딩 목. 출처 등급으로 가중(공식·고시 1, 상품명 0.5, 판매처 설명 0.3).
 *           정보를 밝히지 않은 상품은 낮게 나온다(품질이 낮다는 뜻이 아니다)
 *   brand   좋아하는 브랜드 1, 같은 계열(폴로 ↔ 퍼플 라벨) 0.5
 *   fit     잘 맞는 옷 실측과 가장 가까운 사이즈, 또는 평소 사이즈의 판매·재고
 *   style   고른 스타일(편집 분류)과 겹치면 1. 기본 품목(styleRole: 'tiebreak')은 무게를 0.3 이하로 묶어 동점 깨기에만 쓴다
 * 용도(USES)와 꼭 지킬 조건(CONDS): 카디건·셔츠 안에 → 로고 안 보이게·얇게·목 립 좁게 / 한 장으로 → 비치지 않게.
 *   조건을 어긴 것이 확인된 상품은 1등·대안에서 빼고(순위에는 남김) 이유를 알린다. 모르는 값은 '?'로 보여 주고 0.5로 센다(용도 무게 2.5).
 *
 * recommend(items, catalog, query) → { pick, alts, ranked, eligible, excluded, notes, rank, about }
 *   query: { line, sleeve, use, conds: [조건], priorities: [기준 순서], brands, styles, size, ref: {chest,length,shoulder}, today }
 * 점수는 0~100의 가중 평균이다. 확률이 아니다. 같은 입력이면 같은 결과가 나온다.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./judge.js'), require('./wardrobe.js'));
  else root.Pick = factory(root.Judge, root.Wardrobe);
})(typeof self !== 'undefined' ? self : this, function (J, W) {
  'use strict';
  const SCHEMA = 1;
  const STALE_DAYS = 14, DROP_DAYS = 30, FX_DAYS = 30;                                                 // [제안값] 14일 지나면 가성비를 중간으로, 30일 지나면 1등 후보에서 뺀다
  const CRITERIA = { value: '가성비', quality: '품질(소재·봉제)', brand: '브랜드', fit: '내 핏', style: '스타일' };
  const STYLES = { 'american-classic': '아메리칸 클래식', preppy: '프레피', amekaji: '아메카지', workwear: '워크웨어', minimal: '미니멀', normcore: '놈코어', gorpcore: '고프코어', street: '스트리트' };
  const USES = { any: '상관없음', layer: '카디건·셔츠 안에', solo: '한 장으로' };
  const CONDS = { noLogo: { label: '로고 안 보이게', use: 'layer' }, thin: { label: '얇게', use: 'layer' }, narrowNeck: { label: '목 립 좁게', use: 'layer' }, notSheer: { label: '비치지 않게', use: 'solo' } };
  const SLEEVES = { short: '반팔', long: '긴팔', any: '상관없음' };
  const FIT = { slim: '슬림핏', regular: '레귤러핏', relaxed: '루즈·박스핏' };
  const THICK = { thin: '얇음', mid: '보통', thick: '두꺼움' };
  const NECKS = { narrow: '목 립이 좁은 편', standard: '기본 립 크루넥', binding: '바인딩 목', wide: '목 립이 넓은 편' };
  const LOGOS = { none: '겉 로고 없음', hem: '밑단 로고', 'small-chest': '가슴 작은 자수', chest: '가슴 자수', tab: '작은 탭·라벨' };
  const SRC = { official: '공식', notice: '상품정보제공고시', name: '상품명에만', seller: '판매처 설명', photo: '상품 사진으로 본 판단', 'official-weight': '공식 원단 무게로 판단' };
  const SRC_W = { official: 1, notice: 1, 'official-weight': 1, photo: 0.6, name: 0.5, seller: 0.3 };   // [제안값] 근거 강도
  const FIBERS = { supima: '수피마 코튼', pima: '피마 코튼', lisle: '라일사', ringspun: '링스펀 코튼', giza: '기자 코튼' };
  const KNITS = { jersey: '저지', interlock: '인터로크', loopwheel: '루프휠' };
  const PRI_W = [3, 2, 1.5, 1.2, 1];                                                                   // [제안값] 누른 순서대로의 무게
  const OFF_W = 0.5, USE_W = 2.5, TIEBREAK_W = 0.3;                                                    // [제안값]
  const SIZE_ALIAS = { '90': 'XS', '95': 'S', '100': 'M', '105': 'L', '110': 'XL', '115': 'XXL', '2XL': 'XXL', 'XXXL': '3XL' };
  const DEFAULT_VALUE = { lo: 2500, hi: 50000 };

  const str = W.str, num = W.num, safeLink = W.safeLink, safeDate = W.safeDate;
  const arr = (v) => (Array.isArray(v) ? v : []);
  const has = (dict, k) => k != null && Object.prototype.hasOwnProperty.call(dict, k);
  const pick1 = (v, dict) => (has(dict, v) ? v : null);
  const won = (n) => Math.round(n).toLocaleString('ko-KR') + '원';
  const signedWon = (n) => (n > 0 ? '+' : n < 0 ? '−' : '±') + Math.abs(Math.round(n)).toLocaleString('ko-KR') + '원';
  const kd = (d) => { const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(d || ''); return m ? Number(m[1]) + '월 ' + Number(m[2]) + '일' : d || ''; };   // 화면 문장의 날짜: 10월 13일
  const SIZE_SRC = { official: '공식 치수', notice: '공식 치수', seller: '판매처 치수표', photo: '사진 판단', name: '상품명', 'official-weight': '공식' };
  const normSize = (label) => { const l = String(label || '').trim().toUpperCase(); return SIZE_ALIAS[l] || l; };

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
  /** 상품 하나를 정리한다. 판매처 주소·가격(1 이상)·확인일·알려진 분류·종류가 없으면 null. */
  function cleanPickProduct(raw, i) {
    if (!raw || typeof raw !== 'object') return null;
    const cat = W.CATS[raw.cat] ? raw.cat : null;
    const name = str(raw.name, 100).trim(), id = str(raw.id, 60).trim();
    const store = raw.store && typeof raw.store === 'object' ? raw.store : {};
    const url = safeLink(store.url), currency = raw.currency === 'USD' ? 'USD' : raw.currency === 'KRW' ? 'KRW' : null;
    const price = num(raw.price, currency === 'KRW' ? 100 : 1, 1e9);                                // 0원·오타 같은 값은 받지 않는다
    if (!cat || !name || !id || !url || price == null || !currency || !safeDate(raw.checkedAt) || !W.KINDS[cat][raw.kind]) return null;
    const f = raw.fabric && typeof raw.fabric === 'object' ? raw.fabric : {};
    const st = raw.stock && typeof raw.stock === 'object' ? raw.stock : null;
    const sh = raw.shipping && typeof raw.shipping === 'object' ? raw.shipping : null;
    return {
      id, line: str(raw.line, 40), brand: str(raw.brand, 40), name, code: str(raw.code, 60), colorName: str(raw.colorName, 40),
      cat, kind: raw.kind, family: W.FAM[raw.family] ? raw.family : 'gray',
      light: num(raw.light, 0, 100) == null ? 50 : Math.round(raw.light), formality: [1, 2, 3].indexOf(raw.formality) >= 0 ? raw.formality : 2,
      pattern: W.PATTERNS[raw.pattern] ? raw.pattern : 'solid', seasons: arr(raw.seasons).filter((s) => W.SEASONS.indexOf(s) >= 0),
      sleeve: raw.sleeve === 'long' ? 'long' : 'short', fit: pick1(raw.fit, FIT), fitNote: str(raw.fitNote, 120),
      fabric: { comp: str(f.comp, 140), cotton100: f.cotton100 === true ? true : f.cotton100 === false ? false : null, compSrc: pick1(f.compSrc, SRC) || 'official',
        fiber: pick1(f.fiber, FIBERS), fiberSrc: pick1(f.fiberSrc, SRC) || (f.fiber ? 'official' : null), knit: pick1(f.knit, KNITS), weight: str(f.weight, 20),
        thick: pick1(f.thick, THICK), thickSrc: pick1(f.thickSrc, SRC), notes: arr(f.notes).map((n) => str(n, 200)).filter(Boolean).slice(0, 6) },
      build: arr(raw.build).map((b) => str(b, 20)).filter(Boolean).slice(0, 8), buildSrc: pick1(raw.buildSrc, SRC) || 'official', neck: pick1(raw.neck, NECKS), neckSrc: pick1(raw.neckSrc, SRC),
      logo: pick1(raw.logo, LOGOS), logoNote: str(raw.logoNote, 120), origin: str(raw.origin, 40),
      sizes: arr(raw.sizes).map(cleanSize).filter(Boolean).slice(0, 12), sizeSrc: pick1(raw.sizeSrc, SRC), sizeNote: str(raw.sizeNote, 200),
      offered: Array.isArray(raw.offered) ? raw.offered.map((s) => str(s, 8).trim()).filter(Boolean).slice(0, 12) : null,
      price, currency, listPrice: num(raw.listPrice, 1, 1e9), priceNote: str(raw.priceNote, 200), packCount: num(raw.packCount, 1, 12) || 1,
      shipping: sh && num(sh.fee, 0, 1000) != null ? { fee: sh.fee, freeOver: num(sh.freeOver, 0, 100000), note: str(sh.note, 200), url: safeLink(sh.url) } : null,
      stock: st ? { sizes: Array.isArray(st.sizes) ? st.sizes.map((s) => str(s, 8)).filter(Boolean) : null, inStock: st.inStock === true ? true : st.inStock === false ? false : null, checkedAt: safeDate(st.checkedAt) } : null,
      store: { name: str(store.name, 60), type: store.type === 'official' ? 'official' : 'retailer', url },
      styles: arr(raw.styles).filter((s) => STYLES[s]).slice(0, 4), checkedAt: raw.checkedAt,
      evidence: arr(raw.evidence).map((e) => (e && typeof e === 'object' && safeLink(e.url) ? { url: safeLink(e.url), what: str(e.what, 240), seen: safeDate(e.seen) } : null)).filter(Boolean).slice(0, 6),
      _i: i || 0,
    };
  }
  /** picks.json 을 정리한다. 모르는 파일이면 null. 품목(line)이 등록되지 않은 상품은 뺀다(오타 방지). */
  function cleanPicks(raw) {
    if (!raw || typeof raw !== 'object' || raw.schema !== SCHEMA || raw.kind !== 'picks' || !Array.isArray(raw.products)) return null;
    const ids = new Set();
    const brands = {};
    if (raw.brands && typeof raw.brands === 'object') for (const k of Object.keys(raw.brands).slice(0, 80)) {
      const b = raw.brands[k]; if (!b || typeof b !== 'object' || !/^[a-z0-9-]{1,30}$/.test(k)) continue;
      brands[k] = { name: str(b.name, 60), ko: str(b.ko, 40) || str(b.name, 40), aliases: arr(b.aliases).map((a) => str(a, 40).toLowerCase()).filter(Boolean).slice(0, 10), family: str(b.family, 30) };
    }
    const fx = {};
    if (raw.fx && raw.fx.USD && num(raw.fx.USD.krw, 100, 10000) != null) fx.USD = { krw: raw.fx.USD.krw, date: safeDate(raw.fx.USD.date), source: safeLink(raw.fx.USD.source), note: str(raw.fx.USD.note, 120) };
    const lines = {};
    if (raw.lines && typeof raw.lines === 'object') for (const k of Object.keys(raw.lines).slice(0, 40)) {
      const l = raw.lines[k]; if (!l || typeof l !== 'object' || !/^[a-z0-9-]{1,40}$/.test(k)) continue;
      const v = l.value && typeof l.value === 'object' && num(l.value.lo, 1, 1e7) != null && num(l.value.hi, 2, 1e8) != null && l.value.hi > l.value.lo ? { lo: l.value.lo, hi: l.value.hi } : DEFAULT_VALUE;
      lines[k] = { label: str(l.label, 40), cat: W.CATS[l.cat] ? l.cat : 'top', kind: str(l.kind, 20), family: str(l.family, 20), value: v, styleRole: l.styleRole === 'tiebreak' ? 'tiebreak' : 'normal', styleNote: str(l.styleNote, 120) };
    }
    const products = raw.products.slice(0, 2000).map(cleanPickProduct).filter(Boolean).filter((p) => (ids.has(p.id) ? false : ids.add(p.id)))
      .filter((p) => lines[p.line] && (p.currency === 'KRW' || fx[p.currency]));                    // 등록 안 된 품목·환율 없는 외화 상품은 견줄 수 없어 뺀다
    const brandNotes = arr(raw.brandNotes).map((n) => (n && typeof n === 'object' ? { brand: str(n.brand, 30), line: str(n.line, 40), text: str(n.text, 300), checkedAt: safeDate(n.checkedAt), url: safeLink(n.url) } : null)).filter((n) => n && n.text);
    return { schema: SCHEMA, kind: 'picks', name: str(raw.name, 60), updatedAt: safeDate(raw.updatedAt), about: str(raw.about, 400), fx, brands, lines, brandNotes, products };
  }

  // ---------- 하나하나 재기 ----------
  const brandName = (cat, key) => (cat.brands[key] ? cat.brands[key].ko || cat.brands[key].name : key);
  function daysSince(date, today) { if (!safeDate(date)) return null; return Math.round((Date.parse((today || W.today()) + 'T00:00:00Z') - Date.parse(date + 'T00:00:00Z')) / 86400000); }
  /** 원화 가격(묶음 전체, 해외면 상품값만). */
  function krw(p, cat) { return p.currency === 'KRW' ? p.price : Math.round(p.price * cat.fx[p.currency].krw); }
  /** 한 장 값: 배송비를 아는 해외 상품은 한 장 주문 기준 배송비를 더하고, 묶음이면 장 수로 나눈다. landed=false 면 배송비를 모른다. */
  function unitPrice(p, cat) {
    if (p.currency === 'KRW') return { krw: p.price / p.packCount, landed: true, ship: 0 };
    const rate = cat.fx[p.currency].krw;
    if (p.shipping) { const ship = p.shipping.freeOver != null && p.price >= p.shipping.freeOver ? 0 : p.shipping.fee; return { krw: Math.round((p.price + ship) * rate) / p.packCount, landed: true, ship: Math.round(ship * rate) }; }
    return { krw: Math.round(p.price * rate) / p.packCount, landed: false, ship: null };
  }

  /** 공개된 품질 근거(3~10): 출처 등급으로 가중한다. parts 는 화면에 그대로 보여 줄 근거, unknown 은 밝히지 않은 것, known 은 정보 공개 정도. */
  function qualityOf(p) {
    const parts = [], unknown = [];
    let s = 3;
    const f = p.fabric, w = (src) => SRC_W[src] == null ? 1 : SRC_W[src], tag = (src) => (src && src !== 'official' ? ' (' + SRC[src] + ')' : '');
    const add = (pts, src, text) => { const v = Math.round(pts * w(src) * 100) / 100; s += v; parts.push(text + tag(src)); };
    if (f.cotton100 === true) add(1, f.compSrc, '면 100%');
    else if (f.cotton100 === false) parts.push('혼방: ' + f.comp + tag(f.compSrc));
    if (f.fiber === 'supima' || f.fiber === 'pima' || f.fiber === 'lisle' || f.fiber === 'giza') add(1.5, f.fiberSrc, FIBERS[f.fiber]);
    else if (f.fiber === 'ringspun') add(0.75, f.fiberSrc, FIBERS[f.fiber]);
    if (f.knit === 'loopwheel') add(1.5, 'official', '루프휠 편직(옛 방식, 느리게 짜며 몸판이 통짜)');
    else if (f.knit === 'interlock') add(0.75, 'official', '인터로크(두 겹으로 촘촘히 짠 원단)');
    if (f.knit !== 'loopwheel' && p.build.indexOf('tubular') >= 0) add(0.75, p.buildSrc, '몸판 옆선 없는 통짜');   // 루프휠이면 통짜는 같은 사실이라 두 번 세지 않는다
    if (p.build.indexOf('binding-neck') >= 0) add(0.5, 'official', '목둘레가 잘 늘어나지 않는 바인딩');
    if (f.cotton100 == null) unknown.push('혼용률');
    if (!f.fiber && !f.knit) unknown.push('원사·편직 방식');
    if (!f.weight) unknown.push('원단 무게');
    if (!p.origin) unknown.push('제조국');
    const keys = [f.cotton100 != null, !!(f.fiber || f.knit), !!f.weight, !!f.thick, !!p.neck, !!p.logo, !!p.origin, p.sizes.length > 0];
    return { score: Math.min(10, Math.round(s * 100) / 100), parts, unknown, known: keys.filter(Boolean).length, of: keys.length };
  }

  /** 꼭 지킬 조건 하나를 상품에 비춰 본다: ok | fail | unknown 과 그 이유. */
  function condOf(p, key) {
    const f = p.fabric, src = (k) => (k ? ' (' + SRC[k] + ')' : '');
    if (key === 'noLogo') {
      if (p.logo === 'none') return { status: 'ok', text: '겉 로고 없음' + (p.logoNote && /사진/.test(p.logoNote) ? ' (상품 사진으로 확인)' : '') };
      if (p.logo === 'hem') return { status: 'ok', text: '로고가 밑단에 있어 카디건 안에서 안 보임' };
      if (p.logo === 'tab') return { status: 'ok', text: '작은 탭·라벨만 있음 (' + (p.logoNote || '위치 확인 안 함') + ')' };
      if (p.logo === 'small-chest' || p.logo === 'chest') return { status: 'fail', text: (p.logoNote || LOGOS[p.logo]).replace(/\((공식|상품 사진으로 확인)\)/, '').trim() };
      return { status: 'unknown', text: '로고 위치 확인 못 함' };
    }
    if (key === 'thin') {
      if (f.thick === 'thin') return { status: 'ok', text: '얇음' + src(f.thickSrc) };
      if (f.thick === 'mid') return { status: 'ok', text: '보통 두께' + src(f.thickSrc) };
      if (f.thick === 'thick') return { status: 'fail', text: '두꺼움' + (f.weight ? '(' + f.weight + ')' : '') + src(f.thickSrc) };
      return { status: 'unknown', text: '두께 확인 못 함' };
    }
    if (key === 'narrowNeck') {
      if (p.neck === 'narrow') return { status: 'ok', text: NECKS.narrow + src(p.neckSrc) };
      if (p.neck === 'wide') return { status: 'fail', text: NECKS.wide + src(p.neckSrc) };
      return { status: 'unknown', text: p.neck ? NECKS[p.neck] + ' — 폭은 확인 못 함' : '목 립 폭 확인 못 함' };
    }
    if (key === 'notSheer') {
      if (f.thick === 'thick' || f.thick === 'mid') return { status: 'ok', text: THICK[f.thick] + src(f.thickSrc) };
      if (f.thick === 'thin') return { status: 'fail', text: '얇아서 흰색이면 비칠 수 있음' + src(f.thickSrc) };
      return { status: 'unknown', text: '두께·비침 확인 못 함' };
    }
    return { status: 'unknown', text: '' };
  }
  function activeConds(q) {
    const use = has(USES, q.use) ? q.use : 'any';
    if (use === 'any') return [];
    const want = Array.isArray(q.conds) ? q.conds.filter((k) => CONDS[k] && CONDS[k].use === use) : Object.keys(CONDS).filter((k) => CONDS[k].use === use);
    return want;
  }

  function sizeName(p, label) { const s = p.sizes.find((x) => x.label === label); return s && s.alias && s.alias !== s.label ? s.label + '(' + s.alias + ')' : label; }
  function sizeOf(p, want) { return p.sizes.find((s) => normSize(s.label) === want || s.alias === want) || null; }
  function offeredHas(p, s, want) { if (!p.offered) return null; return p.offered.some((o) => normSize(o) === want || (s && o === s.label)); }
  function measLine(s, src) { if (!s) return ''; const parts = [s.chest != null ? '가슴단면 ' + s.chest : '', s.length != null ? '총장 ' + s.length : '', s.shoulder != null ? '어깨 ' + s.shoulder : ''].filter(Boolean); return parts.length ? s.label + (s.alias && s.alias !== s.label ? '(' + s.alias + ')' : '') + ': ' + parts.join(' · ') + 'cm' + (src ? ' (' + SIZE_SRC[src] + ')' : '') : ''; }
  /** 사이즈 하나가 살 수 있는지: true(재고 확인) / false(품절·안 팜·상품 전체 품절) / null(모름). */
  function availOf(p, label, want) {
    if (p.stock && p.stock.inStock === false) return { avail: false, why: '상품 전체 품절(' + kd(p.stock.checkedAt) + ' 확인)' };
    const s = sizeOf(p, want) || (label ? p.sizes.find((x) => x.label === label) : null);
    const off = offeredHas(p, s, want);
    if (off === false) return { avail: false, why: want + ' 사이즈는 팔지 않아요(판매 사이즈: ' + p.offered.join('·') + ')', notOffered: true };
    const inStock = p.stock && p.stock.sizes ? p.stock.sizes.map(normSize) : null;
    if (inStock) {
      const hit = inStock.indexOf(want) >= 0 || (s && p.stock.sizes.indexOf(s.label) >= 0);
      if (hit) return { avail: true, why: (s ? s.label : want) + ' 재고 있음(' + kd(p.stock.checkedAt) + ' 확인)' };
      if (off === true) return { avail: false, why: want + ' 품절(' + kd(p.stock.checkedAt) + ' 확인)' };
      return { avail: null, why: want + '을 파는지 확인 못 함' };
    }
    return { avail: null, why: '사이즈별 재고는 판매처에서 확인해 주세요' + (p.stock && p.stock.inStock ? '(상품은 재고 있음, ' + kd(p.stock.checkedAt) + ' 확인)' : '') };
  }
  /** 사이즈 고르기. ref(잘 맞는 옷 실측)가 있으면 가장 가까운 사이즈, 없으면 평소 사이즈. */
  function fitOf(p, q) {
    const ref = q.ref && typeof q.ref === 'object' ? q.ref : null;
    const hasRef = ref && ['chest', 'length', 'shoulder'].some((k) => num(ref[k], 1, 250) != null);
    if (p.stock && p.stock.inStock === false) return { score: 0, size: '', text: '상품 전체 품절(' + kd(p.stock.checkedAt) + ' 확인)', avail: false, caution: true };
    if (hasRef) {
      let best = null;
      for (const s of p.sizes) {
        let cost = 0, n = 0; const diffs = [];
        for (const [k, w, label] of [['chest', 1, '가슴'], ['length', 0.6, '총장'], ['shoulder', 0.6, '어깨']]) {
          const r = num(ref[k], 1, 250); if (r == null || s[k] == null) continue;
          const d = Math.round((s[k] - r) * 10) / 10; cost += Math.abs(d) * w; n += w; diffs.push(label + ' ' + (d > 0 ? '+' : d < 0 ? '−' : '±') + Math.abs(d) + 'cm');
        }
        if (!n) continue;
        const c = cost / n;
        if (!best || c < best.c) best = { s, c, diffs };
      }
      if (!best) return { score: 0.4, size: '', text: '글자로 된 치수표가 없어 사이즈를 고를 수 없어요', caution: true, avail: null };
      const onlyOne = p.sizes.length === 1;
      if (onlyOne && best.c > 3) return { score: 0.4, size: '', text: '공개 치수가 ' + best.s.label + '뿐이라 정확히 고를 수 없어요(' + best.s.label + '와 ' + best.diffs.join(', ') + ')', caution: true, avail: null, onlyOne };
      const a = availOf(p, best.s.label, normSize(best.s.alias || best.s.label));
      let score = Math.max(0, 1 - best.c / 5);                                                         // [제안값] 평균 5cm 어긋나면 0
      if (a.avail === false) score *= 0.3;
      const text = best.s.label + (best.s.alias && best.s.alias !== best.s.label ? '(' + best.s.alias + ')' : '') + ' 사이즈가 잘 맞는 옷과 가장 가까워요: ' + best.diffs.join(', ') + (onlyOne ? ' (공개 치수가 이 사이즈뿐)' : '') + ' · ' + a.why;
      return { score, size: best.s.label, text, caution: best.c > 3 || a.avail === false, avail: a.avail, onlyOne, byRef: true, meas: measLine(best.s, p.sizeSrc) };
    }
    const want = normSize(q.size);
    if (want) {
      const s = sizeOf(p, want), a = availOf(p, s ? s.label : '', want);
      const nonStd = p.sizes.length && p.sizes.every((x) => /^\d+$/.test(x.label)) && !p.sizes.some((x) => x.alias);
      if (nonStd && !s) return { score: 0.5, size: '', text: '이 브랜드는 사이즈 이름이 달라(' + p.sizes.map((x) => x.label).join('·') + ') 평소 사이즈로 못 골라요. 잘 맞는 티 실측을 넣어 주세요', avail: null, meas: '' };
      const score = a.avail === true ? 1 : a.avail === false ? 0 : 0.6;
      return { score, size: s ? s.label : want, text: a.why, avail: a.avail, caution: a.avail === false, notOffered: !!a.notOffered, meas: measLine(s, p.sizeSrc) };
    }
    return { score: 0.5, size: '', text: '잘 맞는 티 실측이나 평소 사이즈를 넣으면 사이즈까지 골라 드려요', neutral: true, avail: null, meas: '' };
  }

  function brandOf(p, q, cat) {
    const fav = arr(q.brands);
    if (!fav.length) return { score: 0.5, text: '', neutral: true };
    if (fav.indexOf(p.brand) >= 0) return { score: 1, text: '좋아하는 브랜드(' + brandName(cat, p.brand) + ')' };
    const fam = cat.brands[p.brand] && cat.brands[p.brand].family;
    const sib = fam && fav.find((b) => cat.brands[b] && cat.brands[b].family === fam);
    if (sib) return { score: 0.5, text: '좋아하는 ' + brandName(cat, sib) + '와 같은 계열(' + brandName(cat, p.brand) + ')' };
    return { score: 0, text: '' };
  }
  function styleOf(p, q) {
    const want = arr(q.styles).filter((s) => STYLES[s]);
    if (!want.length) return { score: 0.5, text: '', neutral: true };
    const hit = p.styles.filter((s) => want.indexOf(s) >= 0);
    if (hit.length) return { score: 1, text: '스타일: ' + hit.map((s) => STYLES[s]).join('·') + ' (어울 편집 분류)' };
    return { score: 0, text: '' };
  }

  /** 상품 하나를 내 옷장의 후보로 바꾼다(살까 말까 판정에 쓴다). 사진은 넣지 않는다. */
  function toCandidate(p, cat, today) {
    const at = today || W.today();
    return W.cleanItem({ id: 'k' + p.id.replace(/[^a-z0-9]/gi, '').slice(0, 24) + '-' + at.replace(/-/g, ''), status: 'candidate', cat: p.cat, kind: p.kind, name: brandName(cat, p.brand) + ' ' + p.name,
      family: p.family, light: p.light, formality: p.formality, pattern: p.pattern, seasons: p.seasons, attrSource: 'owner', brand: brandName(cat, p.brand), model: p.code ? p.name + ' (' + p.code + ')' : p.name,
      link: p.store.url, price: krw(p, cat), checkedAt: p.checkedAt, photo: { kind: 'none' }, detail: p.colorName }, 0);
  }

  // ---------- 고르기 ----------
  function weightsOf(q, line) {
    const pri = arr(q.priorities).filter((k, i, a) => CRITERIA[k] && a.indexOf(k) === i).slice(0, 5);
    const w = {};
    for (const k of Object.keys(CRITERIA)) w[k] = OFF_W;
    pri.forEach((k, i) => { w[k] = PRI_W[i]; });
    if (line && line.styleRole === 'tiebreak') w.style = Math.min(w.style, TIEBREAK_W);
    return { w, pri };
  }
  const mark = (v) => (v >= 0.66 ? 'good' : v >= 0.33 ? 'mid' : 'low');

  /**
   * 기준대로 하나를 고른다.
   * 반환: { pick, alts: [{ label, why, delta, r }], ranked, eligible, excluded, notes, rank, about, conds, use }
   *   r: { product, krw, unit, quality, crit, total, conds, use, fit, reasons, cautions, checks, conclusion, stale, out(뺀 이유) … }
   */
  function recommend(items, cat, q) {
    q = q || {};
    const today = q.today || W.today(), use = has(USES, q.use) ? q.use : 'any', conds = activeConds(q);
    const line = cat.lines[q.line] || null;
    const { w, pri } = weightsOf(q, line);
    const vref = line ? line.value : DEFAULT_VALUE;
    const inLine = cat.products.filter((p) => !q.line || p.line === q.line);
    const pool = [], excluded = [];
    for (const p of inLine) {
      if (!q.sleeve || q.sleeve === 'any' || p.sleeve === q.sleeve) pool.push(p);
      else excluded.push({ id: p.id, name: brandName(cat, p.brand) + ' ' + p.name, why: SLEEVES[p.sleeve] + '이라 뺐어요' });
    }
    const fxAge = cat.fx.USD ? daysSince(cat.fx.USD.date, today) : null;
    const rows = pool.map((p) => {
      const quality = qualityOf(p), up = unitPrice(p, cat), age = daysSince(p.checkedAt, today);
      const ppq = up.krw / quality.score;
      let v = Math.max(0, Math.min(1, (Math.log(vref.hi) - Math.log(ppq)) / (Math.log(vref.hi) - Math.log(vref.lo))));
      const valueNotes = [];
      if (!up.landed) { v = Math.min(v, 0.5); valueNotes.push('배송비·관세를 몰라 가성비를 중간으로 봤어요'); }
      const stale = age == null || age > STALE_DAYS, future = age != null && age < -1;
      if (stale) { v = 0.5; valueNotes.push('가격 확인이 ' + (age == null ? '언제인지 몰라' : age + '일 전이라') + ' 가성비를 중간으로 봤어요'); }
      const cs = conds.map((k) => Object.assign({ key: k, label: CONDS[k].label }, condOf(p, k)));
      const useScore = cs.length ? cs.reduce((a, c) => a + (c.status === 'ok' ? 1 : c.status === 'unknown' ? 0.5 : 0), 0) / cs.length : null;
      const r = { product: p, krw: krw(p, cat), unit: up, quality, ppq, age, stale, future, fit: fitOf(p, q), brand: brandOf(p, q, cat), style: styleOf(p, q), conds: cs, useScore, valueNotes };
      r.crit = { value: v, quality: Math.min(1, (quality.score - 3) / 4.5), brand: r.brand.score, fit: r.fit.score, style: r.style.score };   // [제안값] 공개 근거 7.5점 이상이면 품질 만점
      let sw = 0, sum = 0;
      for (const c of Object.keys(CRITERIA)) { sw += w[c]; sum += w[c] * r.crit[c]; }
      if (useScore != null) { sw += USE_W; sum += USE_W * useScore; }
      r.raw = sum / sw; r.total = Math.round(r.raw * 1000) / 10;
      r.avail = r.fit.avail;
      const fail = cs.filter((c) => c.status === 'fail');
      r.out = future ? '확인일이 미래 날짜라 자료를 다시 봐야 해요' : fail.length ? '고른 조건에 안 맞아요: ' + fail.map((c) => c.label + ' ✕ ' + c.text).join(', ')
        : r.avail === false ? r.fit.text : age != null && age > DROP_DAYS ? '확인한 지 ' + age + '일이 지나 1등 후보에서 뺐어요' : '';
      return r;
    });
    rows.sort((a, b) => b.raw - a.raw || a.unit.krw - b.unit.krw || (a.product.id < b.product.id ? -1 : 1));
    const eligible = rows.filter((r) => !r.out);
    const pickRow = eligible[0] || null;
    // 근거 문장·체크 목록·결론
    for (const r of rows) explain(r, { pri, w, use, conds, cat, fxAge });
    const notes = [];
    for (const r of rows) {
      if (r === pickRow) break;
      if (r.out) notes.push({ kind: 'out', id: r.product.id, text: brandName(cat, r.product.brand) + ' ' + r.product.name + ' — 기준 점수는 더 높지만 ' + r.out });
    }
    // 대안 둘: 점수가 가까운 2위는 늘 보이고, 나머지 하나는 1등과 다른 쪽(조건 확인·더 쌈·다른 좋아하는 브랜드·품질 근거)에서 고른다. 이름은 1등과의 차이로 붙인다
    const alts = [];
    if (pickRow) {
      const fav = arr(q.brands);
      const near = (r) => r.raw >= pickRow.raw - 0.25;                                                 // [제안값] 1등보다 25점 넘게 낮은 것은 대안으로 내지 않는다
      const priceOk = (r) => pri[0] !== 'value' || r.unit.krw <= pickRow.unit.krw * 2;                // 가성비가 1순위면 두 배 넘게 비싼 것은 내지 않는다
      const rest = eligible.filter((r) => r !== pickRow && priceOk(r));
      const okCount = (r) => r.conds.filter((c) => c.status === 'ok').length;
      const diffLabel = (r) => (r.unit.krw <= pickRow.unit.krw * 0.85 ? '더 싸게' : fav.indexOf(r.product.brand) >= 0 && r.product.brand !== pickRow.product.brand ? joinJosa([brandName(cat, r.product.brand)], '을', '를') + ' 더 좋아한다면'
        : r.product.sleeve !== pickRow.product.sleeve ? SLEEVES[r.product.sleeve] + '을 원하면' : r.product.fit && r.product.fit !== pickRow.product.fit ? FIT[r.product.fit] + '을 원하면'
        : r.quality.score >= pickRow.quality.score + 0.75 ? '공개된 품질 근거가 더 많은 것' : '다음 후보');
      const cands = [];
      if (rest[0] && pickRow.raw - rest[0].raw < 0.12) cands.push({ r: rest[0], label: diffLabel(rest[0]) });
      const condBetter = rest.find((r) => near(r) && okCount(r) > okCount(pickRow));
      if (condBetter) { const gain = condBetter.conds.filter((c, i) => c.status === 'ok' && pickRow.conds[i].status !== 'ok').map((c) => c.label); cands.push({ r: condBetter, label: joinJosa(gain, '이', '가') + ' 확인된 것' }); }
      const cheaper = rest.filter((r) => near(r) && r.unit.krw <= pickRow.unit.krw * 0.85).sort((a, b) => b.raw - a.raw)[0];
      if (cheaper) cands.push({ r: cheaper, label: '더 싸게' });
      const favOther = rest.find((r) => near(r) && fav.indexOf(r.product.brand) >= 0 && r.product.brand !== pickRow.product.brand);
      if (favOther) cands.push({ r: favOther, label: joinJosa([brandName(cat, favOther.product.brand)], '을', '를') + ' 더 좋아한다면' });
      const better = rest.filter((r) => near(r) && r.quality.score >= pickRow.quality.score + 0.75).sort((a, b) => b.raw - a.raw)[0];
      if (better) cands.push({ r: better, label: '공개된 품질 근거가 더 많은 것' });
      for (const r of rest) cands.push({ r, label: diffLabel(r) });
      for (const c of cands) {
        if (alts.length >= 2) break;
        if (alts.some((a) => a.r === c.r)) continue;
        const d = c.r.unit.krw - pickRow.unit.krw;
        let label = c.label; if (alts.some((a) => a.label === label)) label = label === '다음 후보' ? '그다음 후보' : label + ' (2)';
        alts.push({ label, delta: signedWon(d) + (c.r.product.packCount > 1 || pickRow.product.packCount > 1 ? '(한 장 기준)' : ''), why: altWhy(c.r), r: c.r });
      }
    }
    // 옷장과의 조합: 1등과 대안만 계산한다
    for (const r of [pickRow].concat(alts.map((a) => a.r)).filter(Boolean)) {
      const v = J.judgeCandidate(items, toCandidate(r.product, cat, today));
      r.closet = { supported: v.supported, note: v.note, added: v.added.length, before: v.before, after: v.after, top3: v.top3, overlaps: v.overlaps.map((o) => ({ id: o.item.id, name: o.item.name, level: o.level })) };
    }
    // 좋아하는 브랜드의 빈자리: 품목에 아예 없는 브랜드와, 이 소매 조건에만 없는 브랜드를 나눠 말한다
    const fav = arr(q.brands);
    for (const b of fav) {
      const inL = inLine.some((p) => p.brand === b), inPool = pool.some((p) => p.brand === b);
      if (inPool) continue;
      const bn = cat.brandNotes.find((n) => n.brand === b && (!q.line || !n.line || n.line === q.line));
      if (!inL) notes.push({ kind: 'missing', brand: b, text: bn ? bn.text : brandName(cat, b) + ': 이 품목에는 아직 확인한 상품이 없어요.' });
      else notes.push({ kind: 'sleeve', brand: b, text: brandName(cat, b) + ': ' + SLEEVES[q.sleeve] + ' 상품은 목록에 없어요(다른 소매는 있어요).' });
    }
    if (fxAge != null && fxAge > FX_DAYS && pool.some((p) => p.currency !== 'KRW')) notes.push({ kind: 'fx', text: '달러 환율이 ' + fxAge + '일 전 값이에요. 해외 상품 원화 가격은 다를 수 있어요.' });
    const second = eligible[1];
    const rank = pickRow ? { n: eligible.length, gap: second ? Math.round((pickRow.raw - second.raw) * 1000) / 10 : null,
      text: eligible.length === 1 ? '조건에 맞는 것은 이것 하나' : '조건에 맞는 ' + eligible.length + '개 중 1위 · 2위와 ' + (pickRow.raw - second.raw < 0.03 ? '근소한 차이' : pickRow.raw - second.raw < 0.1 ? '차이 조금' : '차이 큼') } : null;
    const brandsIn = Array.from(new Set(rows.map((r) => r.product.brand)));
    return { pick: pickRow, alts, ranked: rows, eligible, excluded, notes, rank, weights: w, priorities: pri, use, conds,
      about: { count: rows.length, inLine: inLine.length, brands: brandsIn.length, checkedAt: rows.length ? rows.map((r) => r.product.checkedAt).sort()[0] : '', line: line ? line.label : '', styleNote: line && line.styleRole === 'tiebreak' ? line.styleNote : '' } };
  }

  /** 한 줄 결론, 체크 목록, 근거 문장, 아쉬운 점을 만든다. */
  function explain(r, o) {
    const { pri, use, cat } = o, p = r.product;
    const checks = [];
    for (const c of r.conds) checks.push({ mark: c.status === 'ok' ? 'ok' : c.status === 'fail' ? 'fail' : 'unknown', label: c.label, text: c.text });
    const critText = {
      value: () => '한 장 약 ' + won(r.unit.krw) + (r.unit.landed ? '' : '(배송비 별도)') + ' · 품질 1점당 ' + won(r.ppq),
      quality: () => (r.quality.parts.length ? r.quality.parts.join(', ') : '밝힌 소재·봉제 정보가 거의 없어요') + ' · 정보 공개 ' + r.quality.known + '/' + r.quality.of,
      brand: () => r.brand.text || '고른 브랜드가 아니에요',
      fit: () => r.fit.text,
      style: () => r.style.text || (r.style.neutral ? '스타일을 고르지 않았어요' : '고른 스타일과 달라요(편집 분류: ' + (p.styles.map((s) => STYLES[s]).join('·') || '없음') + ')'),
    };
    pri.forEach((c, i) => checks.push({ mark: mark(r.crit[c]), label: CRITERIA[c] + ' ' + (i + 1) + '순위', text: critText[c]() }));
    r.checks = checks;
    // 근거 문장(긍정): 조건 → 고른 기준 → 고르지 않았지만 좋은 점
    const reasons = [];
    const okConds = r.conds.filter((c) => c.status === 'ok');
    if (okConds.length) reasons.push(USES[use] + ' 입기에: ' + okConds.map((c) => c.text).join(', '));
    for (const c of pri) { if (r.crit[c] >= 0.5) { const t = c === 'fit' ? (r.fit.avail === true || r.fit.byRef ? r.fit.text : '') : critText[c](); if (t && reasons.indexOf(t) < 0) reasons.push(CRITERIA[c] + ': ' + t); } }
    r.reasons = reasons.slice(0, 5);
    const cautions = [];
    const unk = r.conds.filter((c) => c.status === 'unknown');
    if (unk.length) cautions.push('확인 못 한 것: ' + unk.map((c) => c.text.replace(/ 확인 못 함$/, '')).join(', ') + ' — 판매처 상세에서 봐 주세요');
    for (const c of r.conds.filter((x) => x.status === 'fail')) cautions.push(c.label + '와 맞지 않아요: ' + c.text);
    if (r.fit.caution) cautions.push(r.fit.text);
    for (const t of r.valueNotes) cautions.push(t);
    if (p.currency !== 'KRW') cautions.push('해외 주문: $' + p.price + (r.unit.landed && r.unit.ship ? ' + 배송비 $' + p.shipping.fee : '') + ' ≈ 한 장 ' + won(r.unit.krw) + '(' + kd(cat.fx[p.currency].date) + ' 환율). 관세·부가세는 따로 확인');
    if (p.priceNote) cautions.push(p.priceNote);
    if (!r.fit.size && p.stock && p.stock.sizes && p.stock.sizes.length && p.stock.sizes.length <= 2) cautions.push('재고가 ' + p.stock.sizes.join('·') + '만 있어요(' + kd(p.stock.checkedAt) + ' 확인)');
    if (r.future) cautions.push('확인일이 미래 날짜예요. 자료를 다시 확인해야 해요');
    r.cautions = cautions;
    // 한 줄 결론: 가장 무게가 큰 이유 → 조건 상태 → 가장 큰 걸림. 조사는 받침에 맞춘다
    const top = pri.find((c) => r.crit[c] >= 0.5);
    const lead = top === 'brand' ? (r.brand.score === 1 ? '좋아하는 브랜드(' + brandName(cat, p.brand) + ')예요' : '좋아하는 브랜드와 같은 계열이에요')
      : top === 'quality' ? '공개된 품질 근거가 많은 편이에요(' + (r.quality.parts.slice(0, 2).join(', ') || '면') + ')'
      : top === 'value' ? '한 장 약 ' + won(r.unit.krw) + '으로 가성비가 좋은 편이에요'
      : top === 'fit' ? (r.fit.size ? sizeName(p, r.fit.size) + ' 사이즈가 잘 맞을 것 같아요' : '사이즈를 고를 수 있어요')
      : top === 'style' ? '고른 스타일과 맞아요' : '고른 기준을 합한 점수가 가장 높아요';
    const condTxt = !r.conds.length ? '' : okConds.length === r.conds.length ? '고른 조건(' + okConds.map((c) => c.label).join('·') + ')도 모두 확인됐어요'
      : okConds.length ? joinJosa(okConds.map((c) => c.label), '은', '는') + ' 확인됐어요' : '';
    const noun = { noLogo: '로고 위치', thin: '두께', narrowNeck: '목 립 폭', notSheer: '비침' };
    const but = unk.length ? '다만 ' + joinJosa(unk.map((c) => noun[c.key] || c.label), '은', '는') + ' 확인 못 했어요.' : r.fit.caution ? '다만 ' + r.fit.text.replace(/[.\s]+$/, '') + '.' : '';
    r.conclusion = [lead, condTxt].filter(Boolean).join('. ') + '.' + (but ? ' ' + but : '');
  }
  /** 대안 한 줄: 한 장 값과 공개된 품질 근거 둘, 조건 상태. */
  function altWhy(r) {
    const parts = ['한 장 약 ' + won(r.unit.krw) + (r.unit.landed ? '' : '(배송비 별도)')];
    if (r.quality.parts.length) parts.push(r.quality.parts.slice(0, 2).join(', '));
    const ok = r.conds.filter((c) => c.status === 'ok').map((c) => c.label), unk = r.conds.filter((c) => c.status === 'unknown').map((c) => c.label);
    if (ok.length) parts.push('확인: ' + ok.join('·'));
    if (unk.length) parts.push('모름: ' + unk.join('·'));
    return parts.join(' · ');
  }
  /** 낱말들을 '·'로 잇고 마지막 낱말의 받침에 맞춰 조사를 붙인다(한글이 아니면 둘 다 적는다). */
  function joinJosa(words, withBatchim, without) {
    const s = words.join('·'), ch = s.charCodeAt(s.length - 1);
    if (ch >= 0xac00 && ch <= 0xd7a3) return s + ((ch - 0xac00) % 28 ? withBatchim : without);
    return s + withBatchim + '(' + without + ')';
  }

  return { SCHEMA, STALE_DAYS, DROP_DAYS, CRITERIA, STYLES, USES, CONDS, SLEEVES, FIT, THICK, NECKS, LOGOS, SRC, SRC_W, FIBERS, KNITS,
    cleanPicks, cleanPickProduct, qualityOf, condOf, activeConds, fitOf, availOf, brandOf, styleOf, krw, unitPrice, toCandidate, recommend, normSize, brandName, won, signedWon };
});
