/*
 * Pick — 사고 싶은 옷 하나를 "내 기준"으로 골라 주는 추천. 검증 카탈로그(data/picks.json) 안에서만 고른다. AI를 쓰지 않는다.
 *
 * 카탈로그: 공식 스토어·공식 판매처의 상품 페이지에서 직접 확인한 값만 들어 있다. 가격·재고는 확인한 날(checkedAt)의 값이다.
 *   상품 사진은 가져오지 않고 판매처 링크만 둔다. 스타일 분류(styles)는 어울의 편집 판단이다.
 *
 * 기준(CRITERIA)
 *   value   가성비: 품질 점수 1점당 가격(원). 낮을수록 좋다. 이 카탈로그 안에서 견준 상대값이다
 *   quality 품질(소재·봉제): 공개된 정보(면 100%, 수피마·라일·링스펀, 루프휠·통짜 몸판, 원단 무게 공개 등)로만 매긴다. 정보가 없으면 낮게 나온다
 *   brand   좋아하는 브랜드: 고른 브랜드면 1, 같은 계열(예: 폴로 ↔ 퍼플 라벨)이면 0.5
 *   fit     내 핏: 잘 맞는 옷의 치수(가슴 너비·총장·어깨)와 가장 가까운 사이즈, 또는 평소 사이즈의 재고
 *   style   스타일: 고른 스타일(아메리칸 클래식, 아메카지 …)과 겹치면 1
 * 용도(USES): layer(카디건·셔츠 안에: 얇게, 목 립 좁게, 가슴 로고 없이) · solo(혼자 입기: 탄탄하게) · any(상관없음)
 *
 * recommend(items, catalog, query) → { pick, alts, ranked, excluded, notes, about }
 *   query: { line, sleeve: 'short'|'long'|'any', use, priorities: [기준 순서], brands: [브랜드 키], styles: [스타일 키], size: 'M'|'100'|'', ref: {chest,length,shoulder}|null, today }
 * 점수는 0~100의 상대 점수(가중 평균)다. 확률이 아니다. 같은 입력이면 같은 결과가 나온다.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./judge.js'), require('./wardrobe.js'));
  else root.Pick = factory(root.Judge, root.Wardrobe);
})(typeof self !== 'undefined' ? self : this, function (J, W) {
  'use strict';
  const SCHEMA = 1;
  const STALE_DAYS = 14;                                                                              // [제안값] 이보다 오래된 가격·재고는 "다시 확인"으로 표시한다
  const CRITERIA = { value: '가성비', quality: '품질(소재·봉제)', brand: '브랜드', fit: '내 핏', style: '스타일' };
  const STYLES = { 'american-classic': '아메리칸 클래식', preppy: '프레피', amekaji: '아메카지', workwear: '워크웨어', minimal: '미니멀', normcore: '놈코어', gorpcore: '고프코어', street: '스트리트' };
  const USES = { layer: '카디건·셔츠 안에', solo: '혼자 입기', any: '상관없음' };
  const USE_REASON = { layer: '카디건·셔츠 안에 입기에', solo: '혼자 입기에' };
  const SLEEVES = { short: '반팔', long: '긴팔', any: '상관없음' };
  const FIT = { slim: '슬림핏', regular: '레귤러핏', relaxed: '루즈·릴랙스핏' };
  const THICK = { thin: '얇음', mid: '보통', thick: '두꺼움' };
  const NECKS = { narrow: '목 립이 좁은 편', standard: '기본 립 크루넥', binding: '바인딩 목', wide: '목 립이 넓은 편' };
  const LOGOS = { none: '겉 로고 없음', hem: '밑단 로고', 'small-chest': '가슴 작은 자수', chest: '가슴 자수', tab: '작은 탭' };
  const SRC = { official: '공식', seller: '판매처 설명', photo: '상품 사진으로 본 판단', 'official-weight': '공식 원단 무게로 판단' };
  const FIBERS = { supima: '수피마 코튼', pima: '피마 코튼', lisle: '라일사', ringspun: '링스펀 코튼', giza: '기자 코튼' };
  const KNITS = { jersey: '저지', interlock: '인터로크', loopwheel: '루프휠' };
  const PRI_W = [3, 2, 1.5, 1.2, 1];                                                                   // [제안값] 고른 순서대로의 무게. 고르지 않은 기준은 0.5
  const OFF_W = 0.5, USE_W = 2.5;                                                                     // [제안값] 용도는 이번 구매의 조건이라 무겁게 본다
  const SIZE_ALIAS = { '90': 'XS', '95': 'S', '100': 'M', '105': 'L', '110': 'XL', '115': 'XXL', '2XL': 'XXL' };

  const str = W.str, num = W.num, safeLink = W.safeLink, safeDate = W.safeDate;
  const arr = (v) => (Array.isArray(v) ? v : []);
  const pick1 = (v, dict) => (v != null && Object.prototype.hasOwnProperty.call(dict, v) ? v : null);

  // ---------- 정리 ----------
  function cleanSize(s) {
    if (!s || typeof s !== 'object') return null;
    const out = { label: str(s.label, 12).trim() };
    if (!out.label) return null;
    for (const k of ['length', 'shoulder', 'chest', 'chestCirc', 'sleeve']) { const v = num(s[k], 1, 250); if (v != null) out[k] = v; }
    if (out.chest == null && out.chestCirc != null) out.chest = Math.round((out.chestCirc / 2) * 10) / 10;   // 둘레만 있으면 반으로 나눠 너비로 견준다
    return out;
  }
  function cleanPickProduct(raw, i) {
    if (!raw || typeof raw !== 'object') return null;
    const cat = W.CATS[raw.cat] ? raw.cat : null;
    const name = str(raw.name, 100).trim(), id = str(raw.id, 60).trim();
    const store = raw.store && typeof raw.store === 'object' ? raw.store : {};
    const url = safeLink(store.url), price = num(raw.price, 0, 1e9), currency = raw.currency === 'USD' ? 'USD' : raw.currency === 'KRW' ? 'KRW' : null;
    if (!cat || !name || !id || !url || price == null || !currency || !safeDate(raw.checkedAt)) return null;   // 판매처 주소·가격·확인일이 없는 상품은 받지 않는다
    const f = raw.fabric && typeof raw.fabric === 'object' ? raw.fabric : {};
    const st = raw.stock && typeof raw.stock === 'object' ? raw.stock : null;
    return {
      id, line: str(raw.line, 40), brand: str(raw.brand, 40), name, code: str(raw.code, 60), colorName: str(raw.colorName, 40),
      cat, kind: W.KINDS[cat][raw.kind] ? raw.kind : Object.keys(W.KINDS[cat])[0], family: W.FAM[raw.family] ? raw.family : 'gray',
      light: num(raw.light, 0, 100) == null ? 50 : Math.round(raw.light), formality: [1, 2, 3].indexOf(raw.formality) >= 0 ? raw.formality : 2,
      pattern: W.PATTERNS[raw.pattern] ? raw.pattern : 'solid', seasons: arr(raw.seasons).filter((s) => W.SEASONS.indexOf(s) >= 0),
      sleeve: raw.sleeve === 'long' ? 'long' : 'short', fit: pick1(raw.fit, FIT), fitNote: str(raw.fitNote, 120),
      fabric: { comp: str(f.comp, 140), cotton100: f.cotton100 === true ? true : f.cotton100 === false ? false : null, fiber: pick1(f.fiber, FIBERS), fiberSrc: pick1(f.fiberSrc, SRC) || (f.fiber ? 'official' : null),
        knit: pick1(f.knit, KNITS), weight: str(f.weight, 20), thick: pick1(f.thick, THICK), thickSrc: pick1(f.thickSrc, SRC), notes: arr(f.notes).map((n) => str(n, 160)).filter(Boolean).slice(0, 6) },
      build: arr(raw.build).map((b) => str(b, 20)).filter(Boolean).slice(0, 8), neck: pick1(raw.neck, NECKS), neckSrc: pick1(raw.neckSrc, SRC),
      logo: pick1(raw.logo, LOGOS), logoNote: str(raw.logoNote, 120), origin: str(raw.origin, 40),
      sizes: arr(raw.sizes).map(cleanSize).filter(Boolean).slice(0, 12), sizeSrc: pick1(raw.sizeSrc, SRC), sizeNote: str(raw.sizeNote, 160),
      price, currency, listPrice: num(raw.listPrice, 0, 1e9),
      stock: st ? { sizes: Array.isArray(st.sizes) ? st.sizes.map((s) => str(s, 8)).filter(Boolean) : null, inStock: st.inStock === true ? true : st.inStock === false ? false : null, checkedAt: safeDate(st.checkedAt) } : null,
      store: { name: str(store.name, 60), type: store.type === 'official' ? 'official' : 'retailer', url },
      styles: arr(raw.styles).filter((s) => STYLES[s]).slice(0, 4), checkedAt: raw.checkedAt,
      evidence: arr(raw.evidence).map((e) => (e && typeof e === 'object' && safeLink(e.url) ? { url: safeLink(e.url), what: str(e.what, 200), seen: safeDate(e.seen) } : null)).filter(Boolean).slice(0, 6),
      _i: i || 0,
    };
  }
  /** picks.json 을 정리한다. 모르는 파일이면 null. */
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
    if (raw.lines && typeof raw.lines === 'object') for (const k of Object.keys(raw.lines).slice(0, 40)) { const l = raw.lines[k]; if (l && typeof l === 'object' && /^[a-z0-9-]{1,40}$/.test(k)) lines[k] = { label: str(l.label, 40), cat: W.CATS[l.cat] ? l.cat : 'top', kind: str(l.kind, 20), family: str(l.family, 20) }; }
    const products = raw.products.slice(0, 2000).map(cleanPickProduct).filter(Boolean).filter((p) => (ids.has(p.id) ? false : ids.add(p.id)))
      .filter((p) => p.currency === 'KRW' || fx[p.currency]);                                         // 환율이 없는 외화 상품은 견줄 수 없어 뺀다
    const brandNotes = arr(raw.brandNotes).map((n) => (n && typeof n === 'object' ? { brand: str(n.brand, 30), line: str(n.line, 40), text: str(n.text, 300), checkedAt: safeDate(n.checkedAt), url: safeLink(n.url) } : null)).filter((n) => n && n.text);
    return { schema: SCHEMA, kind: 'picks', name: str(raw.name, 60), updatedAt: safeDate(raw.updatedAt), about: str(raw.about, 400), fx, brands, lines, brandNotes, products };
  }

  // ---------- 하나하나 재기 ----------
  const brandName = (cat, key) => (cat.brands[key] ? cat.brands[key].ko || cat.brands[key].name : key);
  function krw(p, cat) { return p.currency === 'KRW' ? p.price : Math.round(p.price * cat.fx[p.currency].krw); }
  function daysSince(date, today) { if (!safeDate(date)) return null; return Math.round((Date.parse((today || W.today()) + 'T00:00:00Z') - Date.parse(date + 'T00:00:00Z')) / 86400000); }

  /** 품질 점수(3~10): 공개된 정보로만. parts 는 화면에 그대로 보여 줄 근거, unknown 은 확인하지 못한 것. */
  function qualityOf(p) {
    const parts = [], unknown = [];
    let s = 3;
    const f = p.fabric, src = (k) => (k ? ' (' + SRC[k] + ')' : '');
    if (f.cotton100 === true) { s += 1; parts.push('면 100%'); }
    else if (f.cotton100 === null && /면/.test(f.comp)) { s += 0.5; parts.push('면 소재(혼용률 미표기)'); }
    else if (f.cotton100 === false) parts.push('혼방: ' + f.comp);
    if (f.fiber === 'supima' || f.fiber === 'pima' || f.fiber === 'lisle' || f.fiber === 'giza') { const add = f.fiberSrc === 'seller' ? 1 : 1.5; s += add; parts.push(FIBERS[f.fiber] + src(f.fiberSrc)); }
    else if (f.fiber === 'ringspun') { s += 1; parts.push(FIBERS[f.fiber] + src(f.fiberSrc)); }
    if (f.knit === 'loopwheel') { s += 1.5; parts.push('루프휠 편직(옛 방식, 느리게 짬)'); }
    else if (f.knit === 'interlock') { s += 1; parts.push('인터로크(두 겹으로 촘촘히 짠 원단)'); }
    if (p.build.indexOf('tubular') >= 0) { s += 1; parts.push('몸판 옆선 없는 통짜'); }
    if (p.build.indexOf('binding-neck') >= 0) { s += 0.5; parts.push('목둘레가 잘 늘어나지 않는 바인딩'); }
    if (f.weight) { s += 0.5; parts.push('원단 무게 공개(' + f.weight + ')'); }
    if (!f.fiber && !f.knit) unknown.push('원사·편직 방식');
    if (!f.weight) unknown.push('원단 무게');
    if (!p.origin) unknown.push('제조국');
    return { score: Math.min(10, Math.round(s * 10) / 10), parts, unknown };
  }

  function normSize(label) { const l = String(label || '').trim().toUpperCase(); return SIZE_ALIAS[l] || l; }
  /** 사이즈 고르기. ref(잘 맞는 옷 치수)가 있으면 가장 가까운 사이즈, 없으면 평소 사이즈의 재고만 본다. */
  function fitOf(p, q) {
    const ref = q.ref && typeof q.ref === 'object' ? q.ref : null;
    const hasRef = ref && ['chest', 'length', 'shoulder'].some((k) => num(ref[k], 1, 250) != null);
    const stockSizes = p.stock && p.stock.sizes ? p.stock.sizes.map(normSize) : null;
    if (hasRef) {
      let best = null;
      for (const s of p.sizes) {
        let cost = 0, n = 0; const diffs = [];
        for (const [k, w, label] of [['chest', 1, '가슴'], ['length', 0.6, '총장'], ['shoulder', 0.6, '어깨']]) {
          const r = num(ref[k], 1, 250); if (r == null || s[k] == null) continue;
          const d = Math.round((s[k] - r) * 10) / 10; cost += Math.abs(d) * w; n += w; diffs.push(label + ' ' + (d > 0 ? '+' : '') + d + 'cm');
        }
        if (!n) continue;
        const c = cost / n;
        if (!best || c < best.c) best = { s, c, diffs };
      }
      if (!best) return { score: 0.4, size: '', text: '이 상품은 글자로 된 치수표가 없어 사이즈를 고를 수 없습니다', caution: true, avail: null };
      const size = best.s.label, avail = stockSizes ? stockSizes.indexOf(normSize(size)) >= 0 : null;
      let score = Math.max(0, 1 - best.c / 5);                                                         // [제안값] 평균 5cm 어긋나면 0
      const text = size + ' 사이즈가 기준 옷과 가장 가깝습니다: ' + best.diffs.join(', ') + (p.sizes.length === 1 ? ' (공개된 치수가 이 사이즈뿐)' : '');
      if (avail === false) score *= 0.3;
      return { score, size, text, caution: best.c > 3, avail, onlyOne: p.sizes.length === 1, byRef: true };
    }
    const want = normSize(q.size);
    if (want) {
      if (stockSizes) {
        if (stockSizes.indexOf(want) >= 0) return { score: 1, size: want, text: want + ' 재고 있음 (' + (p.stock.checkedAt || '') + ' 확인)', avail: true };
        const labels = p.sizes.map((s) => normSize(s.label));
        if (labels.length && labels.indexOf(want) < 0 && !labels.some((l) => /^[A-Z]+$/.test(l))) return { score: 0.5, size: '', text: '이 브랜드는 사이즈 이름이 달라(' + p.sizes.map((s) => s.label).join('·') + ') 평소 사이즈로 못 고릅니다. 잘 맞는 옷 치수를 넣어 주세요', avail: null };
        return { score: 0, size: want, text: want + ' 품절 (' + (p.stock.checkedAt || '') + ' 확인)', caution: true, avail: false };
      }
      const labels = p.sizes.map((s) => normSize(s.label));
      if (labels.length && labels.indexOf(want) < 0 && !labels.some((l) => /^[A-Z]+$/.test(l))) return { score: 0.5, size: '', text: '이 브랜드는 사이즈 이름이 달라(' + p.sizes.map((s) => s.label).join('·') + ') 평소 사이즈로 못 고릅니다. 잘 맞는 옷 치수를 넣어 주세요', avail: null };
      return { score: 0.6, size: want, text: '사이즈별 재고는 판매처에서 확인해 주세요' + (p.stock && p.stock.inStock ? ' (상품은 재고 있음, ' + p.stock.checkedAt + ' 확인)' : ''), avail: null };
    }
    return { score: 0.5, size: '', text: '잘 맞는 옷의 치수나 평소 사이즈를 넣으면 사이즈까지 골라 드립니다', neutral: true, avail: null };
  }

  /** 용도에 맞는지(0~1). 모르는 값은 0.5로 두고 "확인 안 됨"이라고 말한다. */
  function useOf(p, use) {
    const good = [], bad = [], unknown = [];
    if (use !== 'layer' && use !== 'solo') return { score: null, good, bad, unknown };
    const f = p.fabric, src = (k) => (k ? ' (' + SRC[k] + ')' : '');
    const parts = [];
    if (use === 'layer') {
      if (f.thick === 'thin') { parts.push(1); good.push('얇은 두께' + src(f.thickSrc)); }
      else if (f.thick === 'mid') parts.push(0.7);
      else if (f.thick === 'thick') { parts.push(0); bad.push('두꺼운 원단' + (f.weight ? '(' + f.weight + ')' : '') + ' — 카디건 안에서는 부피가 생길 수 있습니다'); }
      else { parts.push(0.5); unknown.push('두께'); }
      if (p.neck === 'narrow') { parts.push(1); good.push(NECKS.narrow + src(p.neckSrc)); }
      else if (p.neck === 'standard') parts.push(0.7);
      else if (p.neck === 'binding') { parts.push(0.5); unknown.push('목 높이(바인딩 목)'); }
      else if (p.neck === 'wide') { parts.push(0.3); bad.push('목 립이 넓어 V넥 안으로 많이 보일 수 있습니다' + src(p.neckSrc)); }
      else { parts.push(0.5); unknown.push('목 립 높이'); }
      if (p.logo === 'none') { parts.push(1); good.push('겉 로고 없음'); }
      else if (p.logo === 'hem') { parts.push(1); good.push('로고가 밑단에 있어 카디건 안에서 안 보입니다'); }
      else if (p.logo === 'tab') parts.push(0.8);
      else if (p.logo === 'small-chest') { parts.push(0.6); bad.push('왼쪽 가슴 작은 자수 — V넥이 깊으면 보일 수 있습니다'); }
      else if (p.logo === 'chest') { parts.push(0.4); bad.push(p.logoNote.replace(/\(공식\)$/, '') + ' — V넥이 깊으면 보일 수 있습니다'); }
      else { parts.push(0.5); unknown.push('로고 위치'); }
      if (p.fit === 'relaxed') { parts.push(0.4); bad.push('루즈한 핏은 카디건 안에서 뭉칠 수 있습니다'); }
      else if (p.fit) parts.push(1);
      else parts.push(0.6);
    } else {
      if (f.thick === 'thick') { parts.push(1); good.push('탄탄한 두께' + src(f.thickSrc)); }
      else if (f.thick === 'mid') parts.push(0.8);
      else if (f.thick === 'thin') { parts.push(0.4); bad.push('얇은 흰 티는 혼자 입으면 비칠 수 있습니다'); }
      else { parts.push(0.5); unknown.push('두께'); }
      if (p.neck === 'binding') { parts.push(1); good.push('목둘레가 잘 늘어나지 않는 바인딩'); } else if (p.neck) parts.push(0.7); else parts.push(0.6);
    }
    // 용도는 이번 구매의 조건이라, 하나라도 크게 어긋나면(예: 카디건 안에 두꺼운 티) 평균이 가리지 못하게 가장 낮은 값을 절반 섞는다 [제안값]
    const avg = parts.reduce((a, b) => a + b, 0) / parts.length, min = Math.min.apply(null, parts);
    return { score: (avg + min) / 2, good, bad, unknown };
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
    return { score: 0, text: '고른 스타일과 다릅니다 (편집 분류: ' + (p.styles.map((s) => STYLES[s]).join('·') || '없음') + ')' };
  }

  /** 상품 하나를 내 옷장의 후보로 바꾼다(살까 말까 판정에 쓴다). 사진은 넣지 않는다. */
  function toCandidate(p, cat, today) {
    const at = today || W.today();
    return W.cleanItem({ id: 'k' + p.id.replace(/[^a-z0-9]/gi, '').slice(0, 24) + '-' + at.replace(/-/g, ''), status: 'candidate', cat: p.cat, kind: p.kind, name: brandName(cat, p.brand) + ' ' + p.name,
      family: p.family, light: p.light, formality: p.formality, pattern: p.pattern, seasons: p.seasons, attrSource: 'owner', brand: brandName(cat, p.brand), model: p.code ? p.name + ' (' + p.code + ')' : p.name,
      link: p.store.url, price: krw(p, cat), checkedAt: p.checkedAt, photo: { kind: 'none' }, detail: p.colorName }, 0);
  }

  // ---------- 고르기 ----------
  function weightsOf(q) {
    const pri = arr(q.priorities).filter((k, i, a) => CRITERIA[k] && a.indexOf(k) === i).slice(0, 5);
    const w = {};
    for (const k of Object.keys(CRITERIA)) w[k] = OFF_W;
    pri.forEach((k, i) => { w[k] = PRI_W[i]; });
    return { w, pri };
  }
  /** "다음으로 맞는 것"을 1등과 무엇이 다른지로 부른다: 다른 좋아하는 브랜드 → 용도에 더 맞음 → 더 쌈 → 더 비쌈 순. */
  function altLabel(r, top, q, cat) {
    const fav = arr(q.brands), bn = brandName(cat, r.product.brand);
    if (fav.indexOf(r.product.brand) >= 0 && r.product.brand !== top.product.brand) return { label: '다른 좋아하는 브랜드: ' + bn, why: '기준 점수 ' + r.total + '점' };
    if (r.use.score != null && top.use.score != null && r.use.score > top.use.score + 0.05) return { label: USE_REASON[q.use] + ' 더 맞게', why: r.use.good.length ? r.use.good.join(', ') : '용도 점수가 더 높습니다' };
    if (r.krw < top.krw * 0.9) return { label: '조금 더 싸게', why: '가격이 ' + Math.round((1 - r.krw / top.krw) * 100) + '% 낮고, 기준 점수는 ' + r.total + '점입니다' };
    if (r.krw > top.krw * 1.3) return { label: '돈을 더 쓴다면', why: '기준 점수 ' + r.total + '점' };
    return { label: '다음으로 맞는 것', why: '기준 점수 ' + r.total + '점' };
  }
  function lineOk(p, q) { return (!q.line || p.line === q.line) && (!q.sleeve || q.sleeve === 'any' || p.sleeve === q.sleeve); }

  /**
   * 기준대로 하나를 고른다.
   * 반환: { pick, alts: [{ label, why, r }], ranked: [r], excluded: [{ id, name, why }], notes: [브랜드 메모], about }
   *   r: { product, krw, total, crit: { value, quality, brand, fit, style }, use, quality, fit, reasons, cautions, stale, avail, closet }
   */
  function recommend(items, cat, q) {
    q = q || {};
    const today = q.today || W.today(), use = USES[q.use] ? q.use : 'any';
    const { w, pri } = weightsOf(q);
    const pool = [], excluded = [];
    for (const p of cat.products) {
      if (lineOk(p, q)) pool.push(p);
      else if (!q.line || p.line === q.line) excluded.push({ id: p.id, name: brandName(cat, p.brand) + ' ' + p.name, why: SLEEVES[p.sleeve] + '이라 뺐습니다' });
    }
    const rows = pool.map((p) => {
      const quality = qualityOf(p), k = krw(p, cat);
      return { product: p, krw: k, quality, ppq: k / quality.score, fit: fitOf(p, q), use: useOf(p, use), brand: brandOf(p, q, cat), style: styleOf(p, q) };
    });
    const logs = rows.map((r) => Math.log(r.ppq)), lo = Math.min.apply(null, logs), hi = Math.max.apply(null, logs);
    const minPpq = Math.min.apply(null, rows.map((r) => r.ppq));
    for (const r of rows) {
      const v = hi - lo < 1e-9 ? 0.5 : (hi - Math.log(r.ppq)) / (hi - lo);
      r.crit = { value: v, quality: (r.quality.score - 3) / 7, brand: r.brand.score, fit: r.fit.score, style: r.style.score };
      let sw = 0, sum = 0;
      for (const c of Object.keys(CRITERIA)) { sw += w[c]; sum += w[c] * r.crit[c]; }
      if (r.use.score != null) { sw += USE_W; sum += USE_W * r.use.score; }
      r.total = Math.round((sum / sw) * 1000) / 10;
      const age = daysSince(r.product.checkedAt, today);
      r.stale = age == null || age > STALE_DAYS;
      r.avail = r.fit.avail;
      const th = r.product.fabric.thick;                                                             // 용도와 정면으로 어긋나면(카디건 안에 두꺼운 티, 혼자 입을 얇은 흰 티) 1등·대안에서 뺀다. 순위에는 남긴다
      r.mismatch = use === 'layer' && th === 'thick' ? '두꺼워서(' + (r.product.fabric.weight || THICK.thick) + ') ' + USES.layer + ' 입는 용도에서 뺐습니다'
        : use === 'solo' && th === 'thin' ? '얇아서 ' + USES.solo + ' 용도에서 뺐습니다' : '';
      // 근거 문장: 용도 → 고른 기준(순서대로) → 고르지 않았지만 좋은 점. 사이즈 줄은 따로 둔다(sizeLine)
      const reasons = [], cautions = [];
      const won = (n) => Math.round(n).toLocaleString('ko-KR') + '원';
      const say = {
        value: () => '가성비: 품질 1점당 약 ' + won(r.ppq) + (r.ppq <= minPpq * 1.0001 ? ' — 이 목록에서 가장 낮습니다' : v >= 0.6 ? ' — 이 목록에서 낮은 편' : v < 0.35 ? ' — 이 목록에서 높은 편' : ''),
        quality: () => (r.quality.parts.length ? '품질: ' + r.quality.parts.join(', ') : ''),
        brand: () => r.brand.text,
        fit: () => (r.fit.avail === true || (r.fit.byRef && !r.fit.caution && r.fit.score >= 0.6) ? r.fit.text : ''),
        style: () => (r.style.score > 0 ? r.style.text : ''),
      };
      if (r.use.score != null && r.use.good.length) reasons.push(USE_REASON[use] + ': ' + r.use.good.join(', '));
      for (const c of pri) { const t = say[c](); if (t && reasons.indexOf(t) < 0) reasons.push(t); }
      const order = Object.keys(CRITERIA).filter((c) => pri.indexOf(c) < 0).sort((a, b) => r.crit[b] - r.crit[a] || (a < b ? -1 : 1));
      for (const c of order) { if (r.crit[c] >= 0.6) { const t = say[c](); if (t && reasons.indexOf(t) < 0) reasons.push(t); } }
      r.sizeLine = r.fit.text;
      for (const b of r.use.bad) cautions.push(b);
      if (r.use.unknown.length) cautions.push('확인 못 한 것: ' + r.use.unknown.join(', '));
      if (r.fit.caution) cautions.push(r.fit.text);
      if (r.fit.onlyOne) cautions.push('공개된 치수가 한 사이즈뿐이라 다른 사이즈는 비례로 짐작해야 합니다');
      if (r.style.score === 0 && !r.style.neutral) cautions.push(r.style.text);
      if (r.product.currency !== 'KRW') cautions.push('해외 주문: $' + r.product.price + ' ≈ ' + r.krw.toLocaleString('ko-KR') + '원(' + cat.fx[r.product.currency].date + ' 환율). 배송비·관세는 따로입니다');
      if (r.stale) cautions.push('가격·재고 확인이 ' + STALE_DAYS + '일 넘게 지났습니다. 판매처에서 다시 확인해 주세요');
      if (r.quality.unknown.length) cautions.push('품질 점수에 빠진 정보: ' + r.quality.unknown.join(', '));
      r.reasons = reasons.slice(0, 5); r.cautions = cautions;
    }
    rows.sort((a, b) => b.total - a.total || a.krw - b.krw || (a.product.id < b.product.id ? -1 : 1));
    // 1등: 품절로 확인된 것과 용도에 정면으로 어긋나는 것은 건너뛴다(순위에는 남긴다)
    const okRow = (r) => r.avail !== false && !r.mismatch;
    const pickRow = rows.find(okRow) || null;
    const notes = [];
    for (const r of rows) {
      if (r === pickRow) break;
      const nm = brandName(cat, r.product.brand) + ' ' + r.product.name;
      if (r.mismatch) notes.push(nm + '은(는) 기준 점수는 더 높지만 ' + r.mismatch + '.');
      else if (r.avail === false) notes.push(nm + '은(는) 기준 점수는 더 높지만 고른 사이즈가 품절이라(' + (r.product.stock && r.product.stock.checkedAt) + ' 확인) 뺐습니다.');
    }
    const alts = [], MAX_ALTS = 2;
    if (pickRow) {
      const rest = rows.filter((r) => r !== pickRow && okRow(r));
      const free = (r) => r && alts.length < MAX_ALTS && alts.every((a) => a.r !== r);
      if (pickRow.product.currency !== 'KRW') {                                                     // 1등이 해외 주문이면 국내에서 바로 살 수 있는 것을 먼저 보여 준다
        const home = rest.filter((r) => r.product.currency === 'KRW')[0];
        if (free(home)) alts.push({ label: '국내에서 바로', why: '해외 배송·관세 없이 원화로 사는 것 가운데 기준 점수가 가장 높습니다(' + home.total + '점)', r: home });
      }
      const cheaper = rest.filter((r) => r.krw <= pickRow.krw * 0.75 && alts.every((a) => a.r !== r)).sort((a, b) => b.total - a.total || a.krw - b.krw)[0];
      if (free(cheaper)) alts.push({ label: '더 싸게', why: '가격이 ' + Math.round((1 - cheaper.krw / pickRow.krw) * 100) + '% 낮고, 기준 점수는 ' + cheaper.total + '점입니다', r: cheaper });
      const second = pri.find((c) => c !== 'value') || (pri[0] === 'value' ? 'quality' : 'brand');
      const by = rest.filter((r) => alts.every((a) => a.r !== r) && (pri[0] !== 'value' || r.krw <= pickRow.krw * 2)).sort((a, b) => b.crit[second] - a.crit[second] || b.total - a.total)[0];   // 가성비가 1순위면 두 배 넘게 비싼 것은 대안으로 내지 않는다
      if (free(by) && by.crit[second] > pickRow.crit[second]) alts.push({ label: CRITERIA[second] + '을(를) 더 보면', why: CRITERIA[second] + ' 점수가 고른 것보다 높습니다', r: by });
      for (const r of rest) { if (free(r)) alts.push(Object.assign({ r }, altLabel(r, pickRow, q, cat))); }
    }
    // 옷장과의 조합: 1등과 대안만 계산한다
    const withCloset = [pickRow].concat(alts.map((a) => a.r)).filter(Boolean);
    for (const r of withCloset) {
      const c = toCandidate(r.product, cat, today);
      const v = J.judgeCandidate(items, c);
      r.closet = { supported: v.supported, note: v.note, added: v.added.length, before: v.before, after: v.after, top3: v.top3, overlaps: v.overlaps.map((o) => ({ id: o.item.id, name: o.item.name, level: o.level })) };
    }
    const favNoItem = arr(q.brands).filter((b) => !rows.some((r) => r.product.brand === b));
    for (const n of cat.brandNotes) if ((!q.line || !n.line || n.line === q.line) && favNoItem.indexOf(n.brand) >= 0) notes.push(n.text);
    for (const b of favNoItem) if (!cat.brandNotes.some((n) => n.brand === b && (!q.line || !n.line || n.line === q.line))) notes.push(brandName(cat, b) + ': 이 목록에는 아직 확인한 상품이 없습니다.');
    const brandsIn = Array.from(new Set(rows.map((r) => r.product.brand)));
    return { pick: pickRow, alts, ranked: rows, excluded, notes, weights: w, priorities: pri, use,
      about: { count: rows.length, brands: brandsIn.length, checkedAt: rows.length ? rows.map((r) => r.product.checkedAt).sort()[0] : '', line: q.line && cat.lines[q.line] ? cat.lines[q.line].label : '' } };
  }

  return { SCHEMA, STALE_DAYS, CRITERIA, STYLES, USES, SLEEVES, FIT, THICK, NECKS, LOGOS, SRC, FIBERS, KNITS, cleanPicks, cleanPickProduct, qualityOf, fitOf, useOf, brandOf, styleOf, krw, toCandidate, recommend, normSize, brandName };
});
