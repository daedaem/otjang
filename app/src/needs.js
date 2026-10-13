/* WardrobeNeeds — 보유 옷에서 다음에 검토할 종류를 찾는다.
 * 아래 항목은 판매 상품이 아닌 비교용 기본 형태다. 가격·브랜드·핏을 추측하지 않는다.
 * 확인한 속성만 조합 계산에 사용한다. 미확인 옷은 같은 종류의 중복 구매를 막는 데만 쓴다.
 * 우선순위: 없는 기본 분류 → 기존에 짝이 없던 옷 활용 → 함께 입을 보유 옷 수.
 * 이는 설명 가능한 제안 규칙이며 실제 취향·구매 효용이 검증된 모델은 아니다.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./wardrobe.js'), require('./judge.js'));
  else root.WardrobeNeeds = factory(root.Wardrobe, root.Judge);
})(typeof self !== 'undefined' ? self : this, function (W, J) {
  'use strict';
  const PURPOSES = { daily: '평소 외출', smart: '단정한 출근·약속' };
  const ALL = W.SEASONS.slice(), COOL = ['봄', '가을', '겨울'];
  const SPECS = [
    { id: 'light-tee', name: '밝은 무지 티셔츠', cat: 'top', kind: 'tee', family: 'white', light: 95, formality: 1, seasons: ALL, purposes: ['daily', 'smart'], plain: true, line: 'white-tee' },
    { id: 'plain-shirt', name: '밝은 무지 셔츠', cat: 'top', kind: 'shirt', family: 'white', light: 92, formality: 3, seasons: ALL, purposes: ['smart', 'daily'], plain: true },
    { id: 'light-knit', name: '밝은 무지 니트', cat: 'top', kind: 'knit', family: 'ivory', light: 88, formality: 2, seasons: COOL, purposes: ['daily', 'smart'], plain: true },
    { id: 'dark-knit', name: '어두운 무지 니트', cat: 'top', kind: 'knit', family: 'navy', light: 18, formality: 2, seasons: COOL, purposes: ['daily', 'smart'], plain: true },
    { id: 'slacks', name: '차콜 슬랙스', cat: 'bottom', kind: 'slacks', family: 'gray', light: 35, formality: 3, seasons: ALL, purposes: ['smart', 'daily'] },
    { id: 'chino', name: '밝은 베이지 치노', cat: 'bottom', kind: 'chino', family: 'beige', light: 76, formality: 2, seasons: ALL, purposes: ['daily', 'smart'] },
    { id: 'denim', name: '어두운 무지 데님', cat: 'bottom', kind: 'denim', family: 'indigo', light: 16, formality: 1, seasons: ALL, purposes: ['daily'] },
    { id: 'shorts', name: '밝은 무지 반바지', cat: 'bottom', kind: 'shorts', family: 'beige', light: 76, formality: 1, seasons: ['여름'], purposes: ['daily'] },
    { id: 'sneaker', name: '기본 스니커즈', cat: 'shoes', kind: 'sneaker', family: 'white', light: 95, formality: 1, seasons: ALL, purposes: ['daily'] },
    { id: 'loafer', name: '단정한 로퍼', cat: 'shoes', kind: 'loafer', family: 'brown', light: 25, formality: 3, seasons: ALL, purposes: ['smart'], alternatives: ['loafer', 'derby', 'heels', 'flats'] },
    { id: 'cardigan', name: '무지 카디건', cat: 'outer', kind: 'cardigan', family: 'gray', light: 45, formality: 2, seasons: COOL, purposes: ['daily', 'smart'], outerBase: true },
    { id: 'jacket', name: '가벼운 재킷', cat: 'outer', kind: 'jacket', family: 'olive', light: 45, formality: 1, seasons: ['봄', '가을'], purposes: ['daily'], outerBase: true },
    { id: 'coat', name: '겨울용 코트', cat: 'outer', kind: 'coat', family: 'navy', light: 18, formality: 3, seasons: ['겨울'], purposes: ['daily', 'smart'], alternatives: ['coat', 'padding'] },
  ];
  const ownedOnly = (items) => (Array.isArray(items) ? items : []).filter((it) => it && J.isOwned(it));
  const ordered = (a, b) => String(a.id).localeCompare(String(b.id), 'en');
  function settings(opts) {
    opts = opts || {};
    return { purpose: Object.hasOwn(PURPOSES, opts.purpose) ? opts.purpose : 'daily', season: W.SEASONS.includes(opts.season) ? opts.season : '' };
  }
  function inventory(items) {
    const owned = ownedOnly(items);
    return Object.keys(W.CATS).map((cat) => {
      const rows = owned.filter((it) => it.cat === cat);
      const kinds = Object.entries(W.KINDS[cat]).map(([kind, name]) => {
        const matches = rows.filter((it) => it.kind === kind);
        return { kind, name, count: matches.length, pending: matches.filter((it) => !W.assessment(it).ready).length, items: matches.slice().sort(ordered) };
      }).filter((k) => k.count);
      return { cat, name: W.CATS[cat], count: rows.length, pending: rows.filter((it) => !W.assessment(it).ready).length, unknown: rows.filter((it) => !W.known(W.KINDS[cat], it.kind)).length, kinds };
    });
  }
  function applicable(spec, owned, opts) {
    if (!spec.purposes.includes(opts.purpose) || (opts.season && !spec.seasons.includes(opts.season))) return false;
    // 계절을 고르지 않았다면 반바지·겨울 코트의 필요를 임의로 추측하지 않는다.
    if (!opts.season && (spec.id === 'shorts' || spec.id === 'coat')) return false;
    const separates = owned.some((it) => it.cat === 'top' || it.cat === 'bottom');
    if (!separates && owned.some((it) => it.cat === 'dress') && (spec.cat === 'top' || spec.cat === 'bottom')) return false;
    return true;
  }
  function fillsRole(it, spec, uncertain) {
    if (it.cat !== spec.cat) return false;
    // 분류만 알고 세부 종류를 모르면 해당 분류의 추가 구매를 먼저 권하지 않는다.
    if (!W.known(W.KINDS[it.cat], it.kind)) return uncertain;
    if (spec.outerBase) return true;
    if (!(spec.alternatives || [spec.kind]).includes(it.kind)) return false;
    return !spec.plain || uncertain || it.pattern === 'solid';
  }
  function archetype(spec) {
    return W.cleanItem({ ...spec, id: 'need-' + spec.id, status: 'candidate', attrSource: 'owner', pattern: 'solid', brand: '', model: '' }, 0);
  }
  function analyze(allItems, options) {
    const opts = settings(options), owned = ownedOnly(allItems).slice().sort(ordered);
    const pending = owned.filter((it) => !W.assessment(it, opts).ready);
    const ready = owned.filter((it) => W.assessment(it, opts).ready && J.inSeason(it, opts.season));
    const activeOrUnknown = owned.filter((it) => !opts.season || !it.seasons?.length || J.inSeason(it, opts.season));
    const result = { ...opts, total: owned.length, assessed: ready.length, pending: pending.map((item) => ({ item, missing: W.assessment(item, opts).missing })), inventory: inventory(owned), recommendations: [], ideas: [], held: [], covered: [], status: !owned.length ? 'empty' : !ready.length ? 'needs-confirmation' : pending.length ? 'partial' : 'ready' };
    if (!owned.length) return result;
    const currentPairs = J.cleanOutfits(ready), paired = new Set(currentPairs.flatMap((p) => [p.top.id, p.bottom?.id].filter(Boolean)));
    for (const spec of SPECS.filter((s) => applicable(s, activeOrUnknown, opts))) {
      const covered = ready.filter((it) => fillsRole(it, spec, false));
      if (covered.length) { result.covered.push({ id: spec.id, name: spec.name, items: covered }); continue; }
      const uncertain = pending.filter((it) => activeOrUnknown.includes(it) && fillsRole(it, spec, true));
      if (uncertain.length) { result.held.push({ id: spec.id, name: spec.name, items: uncertain }); continue; }
      if (!ready.length) { if (pending.length) result.ideas.push({ id: spec.id, cat: spec.cat, kind: spec.kind, name: W.KINDS[spec.cat][spec.kind] }); continue; }
      const candidate = archetype(spec), verdict = J.judgeCandidate(ready, candidate, opts);
      if (verdict.overlaps.some((o) => o.level === 'strong')) continue;
      const isShoe = spec.cat === 'shoes';
      if (!isShoe && !verdict.added.length) continue;
      // 신발은 기존 엔진에 조합 규칙이 없으므로 용도에 맞는 종류의 빈자리만 제안한다.
      if (isShoe && !ready.some((it) => ['top', 'bottom', 'dress'].includes(it.cat))) continue;
      const partners = [...new Map(verdict.added.map((c) => [c.partner.id, c.partner])).values()].sort(ordered);
      const rescued = partners.filter((it) => !paired.has(it.id));
      const reasons = [];
      const sameCat = ready.filter((it) => it.cat === spec.cat);
      if (!sameCat.length) reasons.push('확인한 옷에 ' + W.CATS[spec.cat] + (spec.cat === 'shoes' ? '이' : '가') + ' 없어 이 분류부터 검토합니다.');
      else if (spec.plain) reasons.push('확인한 옷장에 무지 ' + W.KINDS[spec.cat][spec.kind] + ' 종류가 없어 무늬 있는 옷과 번갈아 입을 선택지입니다.');
      else reasons.push('확인한 옷장에 ' + W.KINDS[spec.cat][spec.kind] + ' 종류가 없습니다.');
      if (rescued.length && spec.cat !== 'outer') reasons.push('현재 규칙에서 짝을 찾지 못한 ' + rescued.map((it) => it.name).slice(0, 3).join(' · ') + '에 새 선택지가 생깁니다.');
      if (partners.length) reasons.push('확인한 보유 옷 ' + partners.length + '벌과 색·무늬·격식 기준에서 조합을 만들 수 있습니다.');
      if (isShoe) reasons.push(PURPOSES[opts.purpose] + '에 쓸 신발 종류를 보완하는 제안입니다. 신발의 코디 수와 착화감은 계산하지 않았습니다.');
      const cautions = ['종류와 색을 제안한 것이며 실제 상품·사이즈·핏 추천은 아닙니다.'];
      if (pending.length) cautions.push('확인 전 ' + pending.length + '벌은 조합 계산에서 제외했습니다.');
      if (verdict.overlaps.length) cautions.push('비슷한 옷도 있어 새 구매가 필요한지 함께 살펴보세요.');
      result.recommendations.push({ id: spec.id, name: spec.name, cat: spec.cat, kind: spec.kind, line: spec.line || '', candidate, reasons, cautions, partners, rescued: spec.cat === 'outer' ? 0 : rescued.length, combinations: isShoe ? null : verdict.added.length, outfits: isShoe ? [] : verdict.top3, missingCategory: !sameCat.length, purposeMatch: opts.purpose !== 'smart' || spec.formality >= 2 });
    }
    result.ideas = result.ideas.filter((r, i, all) => all.findIndex((x) => x.cat === r.cat && x.kind === r.kind) === i).slice(0, 4);
    const rank = (a, b) => Number(b.missingCategory) - Number(a.missingCategory) || Number(b.purposeMatch) - Number(a.purposeMatch) || b.rescued - a.rescued || b.partners.length - a.partners.length || a.id.localeCompare(b.id, 'en');
    const sorted = result.recommendations.sort(rank), picked = [], cats = new Set(), kinds = new Set();
    // 한 분류만 세 번 추천하지 않는다. 같은 종류의 색 변형도 한 개만 남긴다.
    for (let pass = 0; pass < 2; pass++) for (const r of sorted) {
      if (picked.length >= 3 || kinds.has(r.cat + ':' + r.kind) || (pass === 0 && cats.has(r.cat))) continue;
      picked.push(r); cats.add(r.cat); kinds.add(r.cat + ':' + r.kind);
    }
    result.recommendations = picked;
    return result;
  }
  return { PURPOSES, inventory, analyze };
});
