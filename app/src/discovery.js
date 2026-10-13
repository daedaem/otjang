/* WardrobeDiscovery — 확인된 실제 상품을 등록된 옷 범위 안에서만 제안한다.
 * 상품의 브랜드·품명·상품 코드·판매 링크·확인 가격은 카탈로그의 출처 기록을 보존한다.
 * 색·무늬·격식 규칙의 조합은 실제 착용감이나 취향 적합성을 보장하지 않는다.
 * 미확인 옷은 조합의 근거가 아니라 같은 종류를 다시 권하지 않는 보호에만 사용한다.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./wardrobe.js'), require('./judge.js'), require('./catalog.js'), require('./needs.js'));
  else root.WardrobeDiscovery = factory(root.Wardrobe, root.Judge, root.Catalog, root.WardrobeNeeds);
})(typeof self !== 'undefined' ? self : this, function (W, J, C, N) {
  'use strict';
  const FIELD_ALIASES = { code: 'model', sku: 'model', productCode: 'model', productName: 'name', url: 'link', productUrl: 'link', price: 'priceKRW' };
  const compareId = (a, b) => String(a.id).localeCompare(String(b.id), 'en');
  const validText = (v, max) => typeof v === 'string' && v.trim().length > 0 && v.length <= max && !/[\u0000-\u001f\u007f]/.test(v);
  const validDate = (v, today) => !!W.safeDate(v) && v <= today;
  function secureLink(value) {
    if (typeof value !== 'string' || value.length > 400 || W.safeLink(value) !== value) return '';
    try { const url = new URL(value); return url.protocol === 'https:' && url.hostname && !url.username && !url.password ? value : ''; } catch (_) { return ''; }
  }
  const fieldName = (field) => FIELD_ALIASES[field] || field;

  /** Structural evidence checks do not replace checking the actual source page.
   * Invalid identity/proof rows never become a recommendation. Missing editorial attributes stay unknown.
   * Accept a product array or its { products } wrapper. Neither input is changed.
   */
  function inspectCatalog(raw, options) {
    const today = W.safeDate(options && options.today) || W.today(), issues = [], products = [];
    const rows = Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? raw.products : null;
    if (!Array.isArray(rows) || rows.length > W.RECORD_LIMITS.readCeiling) return { products, issues: [{ index: null, id: '', field: 'products', reason: 'invalid-catalog' }] };
    const idCounts = new Map();
    for (const row of rows) if (row && typeof row.id === 'string') idCounts.set(row.id.trim(), (idCounts.get(row.id.trim()) || 0) + 1);
    rows.forEach((row, index) => {
      const id = row && typeof row.id === 'string' ? row.id.trim() : '', faults = [];
      const fail = (field, reason) => { faults.push({ index, id, field, reason }); };
      if (!row || typeof row !== 'object' || Array.isArray(row)) { fail('product', 'invalid-product'); issues.push(...faults); return; }
      for (const [field, max] of [['id', 40], ['brand', 60], ['name', 80], ['model', 60], ['storeName', 80]]) {
        if (!validText(row[field], max)) fail(field, 'missing-or-invalid-identity');
      }
      if (idCounts.get(id) > 1) fail('id', 'duplicate-id');
      if (!W.known(W.CATS, row.cat)) fail('cat', 'invalid-category');
      if (!W.known(W.CATS, row.cat) || !W.known(W.KINDS[row.cat], row.kind)) fail('kind', 'invalid-kind');
      if (!secureLink(row.link)) fail('link', 'invalid-product-link');
      if (!validDate(row.checkedAt, today)) fail('checkedAt', 'invalid-or-future-date');
      const price = row.priceKRW == null ? null : row.priceKRW;
      if (price !== null && (!Number.isSafeInteger(price) || price < 0 || price > 1e9)) fail('priceKRW', 'invalid-price');
      const evidence = [], proved = new Set(); let priceProved = price === null;
      if (!Array.isArray(row.evidence) || !row.evidence.length || row.evidence.length > 20) fail('evidence', 'missing-proof');
      else for (const proof of row.evidence) {
        if (!proof || typeof proof !== 'object' || !secureLink(proof.url) || !validDate(proof.observedAt, today) || !Array.isArray(proof.fields) || !proof.fields.length || proof.fields.some((f) => !validText(f, 40))) { fail('evidence', 'invalid-proof'); continue; }
        const fields = [...new Set(proof.fields.map(fieldName))];
        evidence.push({ url: proof.url, fields, observedAt: proof.observedAt });
        fields.forEach((field) => proved.add(field));
        // A current-price label must describe the actual purchase page and the stated check date.
        if (fields.includes('priceKRW') && proof.url === row.link && proof.observedAt === row.checkedAt) priceProved = true;
      }
      for (const field of ['brand', 'name', 'model', 'link']) if (!proved.has(field)) fail('evidence.' + field, 'missing-field-proof');
      if (!evidence.some((e) => e.url === row.link && e.fields.includes('link'))) fail('evidence.link', 'purchase-page-not-proved');
      if (!priceProved) fail('evidence.priceKRW', 'missing-current-price-proof');
      if (faults.length) { issues.push(...faults); return; }
      const product = {
        id, brand: row.brand.trim(), name: row.name.trim(), model: row.model.trim(), storeName: row.storeName.trim(), link: row.link,
        priceKRW: price, checkedAt: row.checkedAt, cat: row.cat, kind: row.kind,
        family: W.known(W.FAM, row.family) ? row.family : null, colorName: typeof row.colorName === 'string' ? row.colorName.slice(0, 80).trim() : '',
        light: W.num(row.light, 0, 100), formality: [1, 2, 3].includes(row.formality) ? row.formality : null,
        pattern: W.known(W.PATTERNS, row.pattern) ? row.pattern : null,
        seasons: Array.isArray(row.seasons) ? W.SEASONS.filter((season) => row.seasons.includes(season)) : [],
        editTags: Array.isArray(row.editTags) ? row.editTags.filter((t) => validText(t, 60)).slice(0, 20).map((t) => t.trim()) : [],
        evidence,
        availability: { status: row.availability && row.availability.status === 'observed' ? 'observed' : 'unknown', note: typeof row.availability?.note === 'string' ? row.availability.note.slice(0, 240) : '' },
      };
      // Optional attribution describes editorial decisions; it is not product identity evidence.
      if (row.attrEvidence && typeof row.attrEvidence === 'object') {
        // Bundled JSON should be serializable. A malformed optional annotation must not crash the screen.
        try { product.attrEvidence = JSON.parse(JSON.stringify(row.attrEvidence)); } catch (_) { issues.push({ index, id, field: 'attrEvidence', reason: 'invalid-editorial-attribution' }); }
      }
      products.push(product);
    });
    products.sort(compareId);
    return { products, issues };
  }

  function candidateFor(product, today) {
    return C.toCandidate({ ...product, code: product.model, price: product.priceKRW, img: '', note: '' }, today);
  }
  function roleMatches(item, product, uncertain, purpose) {
    if (item.cat !== product.cat) return false;
    if (!W.known(W.KINDS[item.cat], item.kind)) return uncertain;
    // An explicitly casual owned item does not prove the smart-use role is
    // covered. Pending attributes still hold a duplicate purchase suggestion.
    if (!uncertain && purpose === 'smart' && product.formality >= 2 && item.formality < 2) return false;
    // A smart shoe already in the closet covers the same practical role as another smart shoe.
    if (purpose === 'smart' && product.cat === 'shoes' && ['loafer', 'derby', 'heels', 'flats'].includes(product.kind)) return ['loafer', 'derby', 'heels', 'flats'].includes(item.kind);
    if (item.kind !== product.kind) return false;
    // A plain shirt/tee/knit can fill a slot that a patterned version does not fill.
    if (product.cat === 'top' && ['shirt', 'tee', 'knit'].includes(product.kind) && product.pattern === 'solid') return uncertain || item.pattern === 'solid';
    return true;
  }
  function diverse(rows, limit) {
    const sorted = rows.slice().sort((a, b) => Number(b.missingCategory) - Number(a.missingCategory) || b.rescued - a.rescued || b.partners.length - a.partners.length || compareId(a.product, b.product));
    const picked = [], cats = new Set(), kinds = new Set();
    for (let pass = 0; pass < 2; pass++) for (const row of sorted) {
      const key = row.product.cat + ':' + row.product.kind;
      if (picked.length >= limit || kinds.has(key) || (pass === 0 && cats.has(row.product.cat))) continue;
      picked.push(row); cats.add(row.product.cat); kinds.add(key);
    }
    return picked;
  }
  function recommend(items, raw, options) {
    const opts = options || {}, purpose = Object.hasOwn(N.PURPOSES, opts.purpose) ? opts.purpose : 'daily';
    const season = W.SEASONS.includes(opts.season) ? opts.season : '', today = W.safeDate(opts.today) || W.today();
    // The UI uses zero for “no price cap”; a product's actual zero price remains zero.
    const budgetValue = opts.budget === '0' ? 0 : W.num(opts.budget, 0, 1e9);
    const budget = budgetValue > 0 ? budgetValue : null, catalog = inspectCatalog(raw, { today });
    const owned = (Array.isArray(items) ? items : []).filter((item) => item && typeof item === 'object' && J.isOwned(item)).slice().sort(compareId);
    const pending = owned.filter((item) => !W.assessment(item, { season }).ready);
    const ready = owned.filter((item) => W.assessment(item, { season }).ready && J.inSeason(item, season));
    const active = owned.filter((item) => !season || !Array.isArray(item.seasons) || !item.seasons.length || J.inSeason(item, season));
    const result = { purpose, season, total: owned.length, assessed: ready.length, pending: pending.map((item) => ({ item, missing: W.assessment(item, { season }).missing })), inventory: N.inventory(owned), recommendations: [], explore: [], held: [], covered: [], catalogIssues: catalog.issues, status: !owned.length ? 'empty' : !ready.length ? 'needs-confirmation' : pending.length ? 'partial' : 'ready' };
    if (!owned.length || (season && !active.length)) return result;
    const separates = active.some((item) => item.cat === 'top' || item.cat === 'bottom');
    const paired = new Set(J.cleanOutfits(ready).flatMap((outfit) => [outfit.top.id, outfit.bottom?.id].filter(Boolean)));
    for (const product of catalog.products) {
      if (season && product.seasons.length && !product.seasons.includes(season)) continue;
      if (!season && ['shorts', 'coat', 'padding'].includes(product.kind)) continue;
      if (!separates && active.some((item) => item.cat === 'dress') && ['top', 'bottom'].includes(product.cat)) continue;
      if (purpose === 'smart' && product.formality !== null && product.formality < 2) continue;
      if (budget !== null && product.priceKRW !== null && product.priceKRW > budget) continue;
      const candidate = candidateFor(product, today), relevantPending = pending.filter((item) => active.includes(item) && roleMatches(item, product, true, purpose));
      const covered = ready.filter((item) => roleMatches(item, product, false, purpose));
      if (covered.length) { result.covered.push({ product, items: covered, reason: 'registered-kind-covered' }); continue; }
      if (relevantPending.length) { result.held.push({ product, items: relevantPending, reason: 'confirm-existing-kind', missing: relevantPending.map((item) => ({ itemId: item.id, fields: W.assessment(item, { season }).missing })) }); continue; }
      const sameCat = active.filter((item) => item.cat === product.cat), missingCategory = sameCat.length === 0;
      const existingKind = active.filter((item) => item.cat === product.cat && item.kind === product.kind);
      const reasons = existingKind.length && purpose === 'smart' && existingKind.every((item) => item.formality < 2)
        ? ['등록된 ' + W.KINDS[product.cat][product.kind] + '는 편한 차림으로 확인돼, 단정한 출근·약속용 선택지를 찾아봤어요.']
        : ['등록된 범위에 ' + (product.cat === 'top' && product.pattern === 'solid' ? '무지 ' : '') + W.KINDS[product.cat][product.kind] + ' 종류가 없어요.'];
      const cautions = ['확인한 판매 페이지의 상품입니다. 실제 사이즈·핏·착화감은 비교하지 않았습니다.'];
      if (pending.length) cautions.push('속성 확인 전 ' + pending.length + '벌은 색·무늬·격식 조합 계산에서 제외했습니다.');
      if (product.priceKRW === null) cautions.push(budget !== null ? '가격 미확인 · 예산에 맞는지 판매 페이지에서 확인해 주세요.' : '가격은 판매 페이지에서 확인해 주세요.');
      else if (C.isStale({ price: product.priceKRW, checkedAt: product.checkedAt }, today)) cautions.push('가격 확인일이 오래되어 판매 페이지에서 다시 확인해 주세요.');
      cautions.push('현재 색상·사이즈별 재고는 확인되지 않았습니다.');
      const row = { product, candidate, reasons, cautions, partners: [], outfits: [], combinations: null, missingCategory, matchStatus: 'needs-confirmation', rescued: 0, budgetMatch: budget === null ? 'not-filtered' : product.priceKRW === null ? 'unknown' : 'within' };
      const candidateAssessment = W.assessment(candidate, { season });
      const purposeUnknown = purpose === 'smart' && product.formality === null;
      // Shoes only fill an absent functional kind. The outfit engine does not
      // evaluate their colors/patterns, so those unknown fields are not a gate.
      const shoeKindOnly = product.cat === 'shoes' && (!season || J.inSeason(candidate, season));
      if (!ready.length || (!candidateAssessment.ready && !shoeKindOnly) || purposeUnknown) {
        row.missing = candidateAssessment.missing;
        row.reasons.push(!ready.length ? '상품명과 종류부터 볼 수 있습니다. 내 옷의 색·무늬·느낌을 확인하면 어울리는 조합을 비교합니다.' : '이 상품의 비교 속성을 확인하기 전이라 어울림 판정을 보류합니다.');
        result.explore.push(row); continue;
      }
      const verdict = J.judgeCandidate(ready, candidate, { season });
      const strong = verdict.overlaps.filter((overlap) => overlap.level === 'strong');
      if (strong.length) { result.covered.push({ product, items: strong.map((overlap) => overlap.item), reason: 'strong-overlap' }); continue; }
      if (product.cat === 'shoes') {
        if (!ready.some((item) => ['top', 'bottom', 'dress'].includes(item.cat))) continue;
        row.matchStatus = 'kind-gap';
        row.reasons.push(N.PURPOSES[purpose] + '에 쓸 신발 종류를 검토할 수 있습니다. 신발의 코디 수나 색 어울림은 계산하지 않았습니다.');
      } else {
        if (!verdict.supported || !verdict.added.length) continue;
        row.matchStatus = 'compatible'; row.combinations = verdict.added.length; row.outfits = verdict.top3;
        row.partners = [...new Map(verdict.added.flatMap((combo) => [combo.top, combo.bottom].filter((piece) => piece && piece.id !== candidate.id)).map((piece) => [piece.id, piece])).values()].sort(compareId);
        row.rescued = product.cat === 'outer' ? 0 : row.partners.filter((item) => !paired.has(item.id)).length;
        row.reasons.push('보유 옷과 색·무늬·격식 규칙에서 조합 ' + row.combinations + '개를 만들어요: ' + row.partners.map((item) => item.name).slice(0, 3).join(' · ') + '.');
        if (verdict.overlaps.length) row.cautions.push('일부 겹치는 보유 옷도 있어 추가 구매가 필요한지 함께 살펴보세요.');
      }
      result.recommendations.push(row);
    }
    result.recommendations = diverse(result.recommendations, 3);
    result.explore = diverse(result.explore, 3);
    return result;
  }
  return { inspectCatalog, recommend };
});
