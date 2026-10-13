/*
 * Catalog — 사람이 직접 넣은 상품 목록과, 그 안에서만 고르는 구매 추천. AI를 쓰지 않고 가격·재고·링크를 찾아오지 않는다.
 *
 * 상품(products[]): { id, brand, name, code, cat, kind, family, light, formality, pattern, seasons, link, price, checkedAt, img, note, addedAt }
 *   price·checkedAt: 사람이 확인한 시점의 가격과 그 날짜. 오래되면 "재확인 필요"로 표시한다(STALE_DAYS, 제안값).
 *   img: 사람이 직접 넣은 상품 사진. 외부에서 가져오지 않는다.
 *
 * rank(items, products, opts): 내 옷장(items)에 비춰 상품마다 판정(겹침, 새 조합, 걸림)과 빈틈 채움을 계산해 순서를 매긴다.
 *   점수는 가산과 감점의 합이고 확률이 아니다. 결과의 상품은 모두 products 안의 것이다. 지어낸 상품은 없다.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./judge.js'), require('./wardrobe.js'));
  else root.Catalog = factory(root.Judge, root.Wardrobe);
})(typeof self !== 'undefined' ? self : this, function (J, W) {
  'use strict';
  const SCHEMA = 1;
  const STALE_DAYS = 14;                                                                              // [제안값] 이보다 오래된 가격은 다시 확인하라고 표시한다
  const MAX = W.RECORD_LIMITS.readCeiling;

  function cleanProduct(raw, i) {
    if (!raw || typeof raw !== 'object') return null;
    const cat = W.known(W.CATS, raw.cat) ? raw.cat : null;
    if (!cat) return null;
    const name = W.str(raw.name, 80).trim();
    if (!name) return null;
    return {
      id: W.str(raw.id, 40) || 'p' + (i || 0), brand: W.str(raw.brand, 60).trim(), name, code: W.str(raw.code, 60).trim(),
      cat, kind: W.known(W.KINDS[cat], raw.kind) ? raw.kind : null, family: W.known(W.FAM, raw.family) ? raw.family : null,
      light: W.num(raw.light, 0, 100) == null ? null : Math.round(raw.light), formality: [1, 2, 3].indexOf(raw.formality) >= 0 ? raw.formality : null,
      pattern: W.known(W.PATTERNS, raw.pattern) ? raw.pattern : null, seasons: Array.isArray(raw.seasons) ? W.SEASONS.filter((s) => raw.seasons.indexOf(s) >= 0) : [],
      link: W.safeLink(raw.link), price: W.num(raw.price, 0, 1e9), checkedAt: W.safeDate(raw.checkedAt), img: W.safeImg(raw.img), note: W.str(raw.note, 200), addedAt: W.safeDate(raw.addedAt),
    };
  }
  function cleanCatalog(raw) {
    if (!raw || typeof raw !== 'object' || raw.schema !== SCHEMA || raw.kind !== 'catalog' || !Array.isArray(raw.products)) return null;
    if (raw.products.length > MAX) return null;
    const ids = new Set();
    return { schema: SCHEMA, kind: 'catalog', name: W.str(raw.name, 60), note: W.str(raw.note, 200), products: raw.products.map(cleanProduct).filter(Boolean).filter((p) => (ids.has(p.id) ? false : ids.add(p.id))) };
  }
  function daysSince(date, today) {
    if (!W.safeDate(date)) return null;
    const ms = Date.parse((today || W.today()) + 'T00:00:00Z') - Date.parse(date + 'T00:00:00Z');
    return Math.round(ms / 86400000);
  }
  /** 가격 확인일이 없거나 STALE_DAYS보다 오래되면 true. */
  function isStale(p, today, days) {
    if (p.price == null) return false;
    const d = daysSince(p.checkedAt, today);
    return d == null || d > (days == null ? STALE_DAYS : days);
  }

  /** 상품 하나를 후보 옷(살까 말까)으로 바꾼다. 사진은 그 상품의 사진이므로 '확인된 동일 제품'이다. */
  function toCandidate(p, today) {
    const at = today || W.today();
    return W.cleanItem({ id: 'c' + p.id + '-' + at.replace(/-/g, ''), status: 'candidate', cat: p.cat, kind: p.kind, name: p.name, family: p.family, light: p.light, formality: p.formality, pattern: p.pattern, seasons: p.seasons,
      attrSource: 'owner', brand: p.brand, model: p.code ? p.name + ' (' + p.code + ')' : p.name, link: p.link, price: p.price, checkedAt: p.checkedAt,
      photo: { kind: p.img || p.link ? 'confirmed' : 'none', img: p.img, sourceName: '상품 목록에서 넣음', sourceUrl: p.link, checkedAt: at },
      product: p.img || p.link ? { brand: p.brand, name: p.name, code: p.code, confirmedAt: at } : null, detail: p.note }, 0);
  }

  /**
   * 내 옷장에 비춰 상품 순서를 매긴다.
   * opts: { season, gaps: [다른 옷장에는 있고 내게 없는 옷], today, staleDays }
   * 반환: [{ product, score, reasons, cautions, added, overlaps, blockers, gap, stale, supported }] 점수 내림차순, 같으면 id 순
   */
  function rank(items, products, opts) {
    opts = opts || {};
    const gaps = opts.gaps || [];
    const out = products.filter((p) => !W.assessment(p, opts).ready || J.inSeason(p, opts.season)).map((p) => {
      const cand = Object.assign({}, p, { status: 'candidate' });
      const v = J.judgeCandidate(items, cand, { season: opts.season });
      const reasons = [], cautions = [];
      if (v.status === 'needs-confirmation') return { product: p, score: null, status: v.status, missing: v.missing, excludedItems: v.excludedItems, assessedCount: v.assessedCount, reasons, cautions: [v.note], added: null, overlaps: [], blockers: [], gap: null, stale: isStale(p, opts.today, opts.staleDays), supported: v.supported, top3: [] };
      let score = 0;
      const strong = v.overlaps.filter((o) => o.level === 'strong').length, partial = v.overlaps.length - strong;
      if (v.supported) {
        if (v.added.length) { score += Math.min(5, v.added.length); reasons.push('가진 옷과 주의 사항 없는 조합이 ' + v.added.length + '개 생깁니다.'); }
        else if (!v.note) { score -= 2; cautions.push('가진 옷과 주의 사항 없는 조합이 생기지 않습니다.'); }
        if (v.note) cautions.push(v.note);
      } else cautions.push(v.note || '조합 규칙이 없는 종류라 겹치는 옷만 봅니다.');
      if (strong) { score -= 2 * strong; cautions.push('많이 겹치는 보유 옷이 ' + strong + '벌 있습니다: ' + v.overlaps.filter((o) => o.level === 'strong').map((o) => o.item.name).join(', ')); }
      if (partial) { score -= partial; cautions.push('일부 겹치는 보유 옷이 ' + partial + '벌 있습니다: ' + v.overlaps.filter((o) => o.level === 'partial').map((o) => o.item.name).join(', ')); }
      const gap = gaps.find((g) => J.matchKind(cand, g));
      if (gap) { score += 3; reasons.push('견준 옷장에는 있고 내게 없는 "' + gap.name + '" 자리를 채웁니다.'); }
      if (v.blockers.length && v.supported) cautions.push('걸리는 점: ' + v.blockers.map((b) => b.text + ' (' + b.count + '/' + b.total + ')').join(' / '));
      const stale = isStale(p, opts.today, opts.staleDays);
      return { product: p, score, status: v.status, missing: v.missing, excludedItems: v.excludedItems, assessedCount: v.assessedCount, reasons, cautions, added: v.added.length, overlaps: v.overlaps.map((o) => ({ id: o.item.id, name: o.item.name, level: o.level })), blockers: v.blockers, gap: gap || null, stale, supported: v.supported, top3: v.top3 };
    });
    out.sort((a, b) => (a.score == null) - (b.score == null) || (a.score != null && b.score != null ? b.score - a.score : 0) || (a.product.id < b.product.id ? -1 : a.product.id > b.product.id ? 1 : 0));
    return out;
  }

  return { SCHEMA, STALE_DAYS, cleanProduct, cleanCatalog, daysSince, isStale, toCandidate, rank };
});
