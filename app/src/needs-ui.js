// Inside the app closure. Recommendations are derived; no imaginary product is saved.
function wardrobeDiscovery() { return D.recommend(state.items, DISCOVERY_RAW, { purpose: state.prefs.needsPurpose, season: state.prefs.needsSeason, budget: ui.discoveryBudget || 0, today: today() }); }
function wardrobePlan() { return N.analyze(state.items, { purpose: state.prefs.needsPurpose, season: state.prefs.needsSeason }); }
function needVisual(it) {
  if (it.photo?.img || it.img) return pic(it, 'mini');
  return h('div', { class: 'mini need-silhouette' }, h('div', { class: 'photo-placeholder' }, h('span', { class: 'category-word', text: CATEGORY_WORDS[it.cat] || 'WARDROBE' }), h('span', { class: 'color-disc', style: 'background:' + swatch(it) }), h('span', { class: 'note', text: it.id?.startsWith('need-') ? '색·종류 예시' : '사진 없음' })));
}
function openNeeds() { ui.tab = 'shop'; state.prefs.lastTab = 'shop'; save(); render(); window.scrollTo(0, 0); }
function renderWardrobeOverview(main) {
  const plan = wardrobePlan();
  const box = h('section', { class: 'panel wardrobe-overview', id: 'wardrobeOverview', 'aria-labelledby': 'wardrobeOverviewTitle' },
    h('div', { class: 'section-heading' }, h('div', null, h('p', { class: 'eyebrow', text: 'THE PERSONAL COLLECTION' }), h('h2', { id: 'wardrobeOverviewTitle' }, '지금 내 옷장', h('span', { class: 'count', text: String(plan.total).padStart(2, '0') }))),
      h('button', { type: 'button', class: 'btn', id: 'addOwned', onclick: () => openEasyEntry({ returnTab: 'closet' }), text: '+ 옷 등록' })));
  box.append(h('div', { class: 'inventory-grid' }, plan.inventory.map((c) => h('button', { type: 'button', class: 'inventory-category', 'aria-pressed': ui.cat === c.cat ? 'true' : 'false', 'data-inventory-cat': c.cat, onclick: () => { ui.cat = c.cat; ui.season = ''; render(); } },
    h('span', { class: 'inventory-label', text: c.name }), h('strong', { text: String(c.count) }),
    h('span', { class: 'note', text: c.kinds.map((k) => k.name + ' ' + k.count).concat(c.unknown ? ['종류 미확인 ' + c.unknown] : []).join(' · ') || '아직 등록하지 않았어요' })))));
  if (plan.pending.length) box.append(h('p', { class: 'note', id: 'inventoryPending', text: '등록 정보에 확인 전인 옷 ' + plan.pending.length + '벌이 포함되어 있어요. 브랜드·품명을 몰라도 종류와 색을 확인하면 추천에 쓸 수 있어요.' }));
  const first = plan.recommendations[0];
  box.append(h('div', { class: 'needs-entry' }, h('div', null,
    h('b', { text: first ? '다음으로 살펴볼 옷: ' + first.name : plan.total ? '가진 옷부터 확인하고, 필요한 종류를 찾아보세요' : '옷 몇 벌로 시작해 보세요' }),
    h('p', { class: 'note', text: first ? first.reasons[0] : '등록된 옷의 구성과 함께 입을 조합을 보고 다음 한 벌을 제안해요.' })),
    h('button', { type: 'button', class: 'btn', id: 'openWardrobeNeeds', onclick: openNeeds, text: '필요한 한 벌 살펴보기 ↗' })));
  box.append(h('details', { class: 'owned-registration-tools' }, h('summary', { text: '사진으로 등록 (1장 이상) · 기본 옷 고르기' }), h('div', { class: 'bar' }, h('button', { class: 'btn small', type: 'button', id: 'addPhotos', onclick: () => $('#bulkFile').click(), text: '사진 고르기' }), h('button', { class: 'btn small', type: 'button', id: 'addQuick', onclick: () => openQuick(), text: '기본 옷 골라 넣기' }))));
  main.append(box);
}
function openNeedProduct(r) {
  openQuickItem(null, 'candidate', { initial: { cat: r.cat, kind: r.kind, name: r.name }, hint: '커뮤니티나 쇼핑 앱에서 본 상품명·브랜드·가격·링크·사진을 넣고 내 옷과 비교하세요. 링크에서 상품 정보를 자동으로 가져오지는 않습니다.' });
}
function openNeedCatalog() {
  ui.pickCatalogOpen = true;
  render();
  requestAnimationFrame(() => $('#pickCatalog')?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
}
async function compareNeedOffer(result) {
  const target = state, scope = accountScope();
  let added;
  try { added = await pickToCand(result); }
  catch (error) {
    if (state === target && accountScope() === scope) toast('상품을 비교 목록에 저장하지 못했습니다. 저장 상태를 확인한 뒤 다시 시도해 주세요.');
    return false;
  }
  if (added !== true || state !== target || accountScope() !== scope) return false;
  const candidate = cands().find((item) => item.name === pname(result.product) && (item.link || '') === (result.product.store.url || ''));
  if (!candidate) return false;
  ui.judgeId = candidate.id;
  ui.tab = 'judge';
  render();
  return true;
}
function needOfferCard(need) {
  const result = PK.recommend(state.items, PICKS, { ...pickQuery(), line: need.line });
  const r = result.pick;
  if (!r) return h('section', { class: 'need-product need-product-empty', 'aria-label': '실제 상품 추천 상태' },
    h('p', { class: 'eyebrow', text: '실제 상품 추천 대기' }),
    h('p', { class: 'note', text: '현재 고른 조건에 맞는 확인된 상품이 없어요. 상품 비교에서 조건을 바꾸거나 다시 살펴보세요.' }));
  const p = r.product;
  const defaultReason = String(r.conclusion || '').includes('다섯 기준을 같은 무게로');
  const qualityFacts = r.quality.items.slice(0, 2).map((item) => item.text);
  const closetFact = r.closet.status === 'ready' && r.closet.added != null
    ? r.closet.added > 0 ? '내 옷장과 새 코디 ' + r.closet.added + '개를 만들어요.' : '내 옷장과 새 코디가 생기는지도 확인했어요.'
    : '';
  const reason = [
    defaultReason ? '등록된 상품 중 가격·공개 품질 정보·브랜드·핏·스타일을 같은 비중으로 비교했어요.' : r.conclusion,
    qualityFacts.length ? '상품 정보에 ' + qualityFacts.join(' · ') + '가 공개돼 있어요.' : '',
    closetFact
  ].filter(Boolean).join(' ');
  return h('section', { class: 'need-product', 'data-need-product': p.id, 'aria-label': '실제 상품 추천' },
    h('p', { class: 'eyebrow', text: '현재 조건에 맞는 실제 상품' }),
    h('p', { class: 'need-product-brand', text: PK.brandName(PICKS, p.brand) }),
    h('h3', { class: 'need-product-name', text: p.name }),
    h('p', { class: 'need-product-price' }, h('span', { class: 'note', text: '확인된 판매가 ' }), priceView(r)),
    h('p', { class: 'need-product-why' }, h('b', { text: '추천 이유 ' }), reason),
    h('p', { class: 'need-product-source', text: p.store.name + ' · ' + md(p.checkedAt) + ' 확인 · 판매처 한 곳 가격, 최저가 비교는 아님' }),
    r.stale ? h('p', { class: 'warnnote', text: '가격·재고를 다시 확인해야 해요. 판매처에서 현재 정보를 확인해 주세요.' }) : null,
    h('div', { class: 'bar need-product-actions' },
      h('button', { class: 'btn primary small', type: 'button', 'data-need-offer': p.id, onclick: () => compareNeedOffer(r), text: '이 상품을 내 옷과 비교' }),
      storeLink(r, '판매처에서 상품 보기 ↗', 'btn small'),
      h('span', { class: 'note', text: '가격과 재고는 바뀔 수 있어요.' })));
}
function needOutfit(outfit, candidate) {
  const pieces = [outfit.outer, outfit.top, outfit.bottom].filter(Boolean);
  return h('div', { class: 'need-outfit' }, pieces.map((it) => h('div', { class: 'need-piece' }, needVisual(it),
    h('span', { text: (it.id === candidate.id ? '추가할 옷 · ' : '보유 · ') + it.name }))));
}

// Correct only an unchanged tentative candidate, in the exact actor's latest
// acknowledged snapshot. Later edits/references are independent user actions.
function removeTentativeDiscovery(target, operation) {
  const row = target.items.find((it) => it.id === operation.candidate.id);
  const linked = (target.decisions || []).some((d) => d.itemId === operation.candidate.id) ||
    (target.pickLog || []).some((d) => d.candidateId === operation.candidate.id || d.ownedId === operation.candidate.id);
  if (!row) return true;
  if (linked || JSON.stringify(row) !== operation.installed) return false;
  target.items = target.items.filter((it) => it.id !== row.id);
  target.rack = (target.rack || []).filter((it) => it.id !== row.id);
  return true;
}
function repairDiscoveryCandidate(operation) {
  const repair = async () => {
    try {
      const written = store.writtenSnapshots?.get(operation.scope), expected = store.persistedSnapshots?.get(operation.scope);
      if (!written || written.target !== operation.target) return { ok: true, retained: false };
      if (!expected || (written.data !== expected.idbValue && written.data !== expected.lsValue) || store.recoveryByScope?.has(operation.scope)) return { ok: false, retained: true };
      const corrected = JSON.parse(written.data), removed = removeTentativeDiscovery(corrected, operation);
      if (JSON.stringify(corrected) === written.data) return { ok: true, retained: !removed };
      const data = JSON.stringify({ ...corrected, _storageRevision: ++store.revision });
      let local; try { local = window.localStorage; } catch (error) { /* inaccessible */ }
      const result = await SC.commitSnapshot({ db: store.db, mode: store.mode, idbKey: operation.scope, lsKey: operation.lsKey,
        expectedIdb: expected.idbValue, expectedLs: expected.lsValue, data, locks: navigator.locks, localStorage: local });
      if (!result.ok) { if (result.conflict) store.conflicts.add(operation.scope); return { ok: false, retained: true }; }
      store.persistedSnapshots.set(operation.scope, { idbValue: result.idbValue === undefined ? expected.idbValue : result.idbValue, lsValue: result.lsValue === undefined ? expected.lsValue : result.lsValue });
      store.writtenSnapshots.set(operation.scope, { ...written, data });
      store.conflicts.delete(operation.scope);
      return { ok: true, retained: !removed };
    } catch (error) { return { ok: false, retained: true }; }
  };
  const pending = savePromise.then(repair, repair);
  // Keep the shared save queue boolean-valued for requireFreshStorage callers.
  savePromise = pending.then((result) => result.ok, () => false);
  return pending;
}
function compareDiscoveryProduct(row) {
  const target = state, scope = accountScope();
  const p = D.inspectCatalog(DISCOVERY_RAW, { today: today() }).products.find((it) => it.id === row.product?.id && it.link === row.product?.link);
  if (!p) { toast('확인된 상품을 찾지 못했습니다. 추천을 다시 열어 주세요.'); return Promise.resolve(false); }
  ui.discoverySaves ||= new Map();
  const key = p.id + '\u0000' + p.link, existing = ui.discoverySaves.get(key);
  if (existing?.target === target && existing.scope === scope) return existing.promise;
  const operation = { target, scope, lsKey: localStorageKey() };
  ui.discoverySaves.set(key, operation);
  operation.promise = (async () => {
    const active = () => state === target && accountScope() === scope;
    try {
      await requireFreshStorage();
      if (!active()) return false;
      if (ui.pullSaving || ui.syncBusy) throw new Error('다른 기기와 옷장을 맞추는 중이에요. 끝난 뒤 다시 비교해 주세요.');
      const dup = target.items.find((it) => it.status === 'candidate' && it.link === p.link && it.product?.code === p.model && it.brand === p.brand);
      if (dup) {
        const saving = ui.candidateSaves?.get(dup.id);
        if (saving?.state === target && await saving.promise !== true) return false;
        if (!active() || !target.items.includes(dup)) return false;
        ui.judgeId = dup.id; ui.tab = 'judge'; render(); return true;
      }
      if (!canAdd('items', 1)) return false;
      const catalogProduct = C.cleanProduct({ ...p, code: p.model, price: p.priceKRW, note: '공식 상품 정보와 편집 분류로 비교. 사이즈·실제 착용감은 확인 전.' }, 0);
      const candidate = C.toCandidate(catalogProduct, today()); candidate.id = newId('c');
      operation.candidate = candidate; operation.installed = JSON.stringify(candidate);
      target.items.push(candidate);
      let ok = false;
      try { ok = await save() === true; } catch (error) { /* failure is handled below */ }
      if (!ok) {
        const removed = removeTentativeDiscovery(target, operation), repaired = await repairDiscoveryCandidate(operation);
        const warning = !repaired.ok ? '상품 등록과 복구 저장을 마치지 못했습니다. 후보가 남아 있을 수 있어요. 기록 탭에서 전체 백업을 보관하고 저장 상태를 확인해 주세요.' :
          !removed || repaired.retained ? '첫 저장에 실패했습니다. 이후 편집하거나 연결한 후보는 유지했어요. 저장 상태를 확인한 뒤 다시 비교해 주세요.' : '상품을 저장하지 못했습니다. 다시 시도해 주세요.';
        (store.discoveryRepairFailures ||= new Map()).set(scope, warning);
        if (active()) { render(); toast(warning); }
        return false;
      }
      store.discoveryRepairFailures?.delete(scope);
      if (!active() || !target.items.includes(candidate)) return false;
      ui.judgeId = candidate.id; ui.tab = 'judge'; render(); return true;
    } catch (error) { if (active()) toast(error.message || '상품을 저장하지 못했습니다. 저장 상태를 확인해 주세요.'); return false; }
    finally { if (ui.discoverySaves.get(key) === operation) ui.discoverySaves.delete(key); }
  })();
  return operation.promise;
}
function discoveryProductCard(row, index, exploring) {
  const p = row.product, pending = ui.discoverySaves?.get(p.id + '\u0000' + p.link);
  const body = h('div', { class: 'need-body' },
    h('p', { class: 'eyebrow', text: exploring ? '정보 확인 후 비교할 상품' : row.matchStatus === 'kind-gap' ? '등록 목록에 없는 신발 종류' : '내 옷과 함께 입을 상품' }),
    h('p', { class: 'need-product-brand', text: p.brand }),
    h('h2', { class: 'need-product-name', text: p.name }),
    h('p', { class: 'need-product-price', text: p.priceKRW == null ? '현재 가격은 판매처에서 확인' : won(p.priceKRW) }),
    h('p', { class: 'need-product-source note', text: p.checkedAt + ' · ' + p.storeName + (p.priceKRW == null ? ' · 가격 미확인' : ' 표시가') }),
    h('p', { class: 'need-product-why', text: row.matchStatus === 'compatible' ? row.reasons[row.reasons.length - 1] : row.reasons[0] }));
  if (row.outfits?.length) body.append(h('h3', { text: '내 옷과 이렇게' }), needOutfit(row.outfits[0], row.candidate));
  else if (row.partners?.length) body.append(h('div', { class: 'need-outfit discovery-partners' }, row.partners.slice(0, 3).map((it) => h('div', { class: 'need-piece' }, needVisual(it), h('span', { text: it.name })))));
  if (exploring) body.append(h('p', { class: 'note', text: '색·무늬 조합을 확인하기 전인 상품이에요.' }));
  if (row.matchStatus === 'kind-gap') body.append(h('p', { class: 'note', text: '신발 종류만 제안해요. 색 어울림·착화감은 계산하지 않았어요.' }));
  body.append(h('details', { class: 'ev discovery-proof' }, h('summary', { text: '품번·추천 근거 더 보기' }),
    h('p', { class: 'note discovery-model', text: '품번 ' + p.model + (p.colorName ? ' · ' + p.colorName : '') }),
    h('ul', { class: 'why' }, row.reasons.map((reason) => h('li', { text: reason }))),
    p.attrEvidence?.note ? h('p', { class: 'note', text: '편집 분류 · ' + p.attrEvidence.note }) : null,
    h('p', { class: 'note', text: row.cautions.join(' ') })),
    h('div', { class: 'bar need-actions need-product-actions' },
      h('button', { class: 'btn primary small', type: 'button', 'data-discovery-compare': p.id,
        disabled: pending?.target === state && pending.scope === accountScope(), onclick: () => compareDiscoveryProduct(row), text: '내 옷과 비교' }),
      h('a', { class: 'text-link', href: p.link, target: '_blank', rel: 'noopener noreferrer', text: '공식 판매처 ↗', 'aria-label': p.brand + ' ' + p.name + ' 공식 판매처 상품 페이지 (새 창)' })),
    h('p', { class: 'note', text: '판매처에서 현재 가격·재고를 확인해 주세요.' }));
  return h('article', { class: 'need-card panel discovery-card', 'data-discovery-product': p.id, 'data-match-status': row.matchStatus, 'aria-label': p.brand + ' ' + p.name }, body);
}
function renderNeeds(main) {
  const plan = wardrobeDiscovery();
  const box = h('section', { id: 'wardrobeNeeds', 'aria-labelledby': 'needsTitle' });
  let confirmation = null;
  box.append(h('header', { class: 'needs-intro' }, h('div', null, h('p', { class: 'eyebrow', text: 'THE NEXT PIECE' }),
    h('h1', { id: 'needsTitle', text: '내 옷에 맞는 다음 한 벌' }),
    h('p', { class: 'lead', text: '무엇이 있는지 보고, 함께 입을 실제 상품을 골라요.' }))));
  box.append(segmented('discovery-purpose', '입을 때', Object.entries(N.PURPOSES), state.prefs.needsPurpose || 'daily', (value) => { state.prefs.needsPurpose = value; save(); render(); }),
    h('p', { class: 'note', id: 'needsCoverage', text: '보유 ' + plan.total + '벌 · 조합에 쓸 정보가 확인된 ' + plan.assessed + '벌. 브랜드·품명·가격을 입력할 필요는 없어요.' }));
  const repairWarning = store.discoveryRepairFailures?.get(accountScope());
  if (repairWarning) box.append(h('p', { class: 'warnnote', text: repairWarning }));
  if (!plan.total) {
    box.append(h('section', { class: 'panel needs-empty', id: 'needsEmpty' }, h('h2', { text: '자주 입는 옷부터 넣어 주세요' }),
      h('p', { class: 'sub', text: '상의와 하의 몇 벌로 시작해요. 사진을 고르고 종류만 눌러 등록할 수 있어요.' }),
      h('button', { class: 'btn primary', type: 'button', id: 'discoveryStart', onclick: () => openEasyEntry({ returnTab: 'shop' }), text: '내 옷 사진 넣기' })));
    main.append(box); return;
  }
  if (plan.pending.length) {
    const queue = ['top', 'bottom', 'dress', 'outer', 'shoes'].map((cat) => plan.pending.find((r) => r.item.cat === cat)).filter(Boolean);
    const first = queue.slice(0, 2).map((r) => r.item);
    confirmation = h('section', { class: 'panel needs-pending', id: 'needsPending' },
      h('h2', { text: plan.assessed ? '몇 번만 눌러 추천을 더 정확하게' : '색과 무늬만 확인하면 내 옷과 비교해요' }),
      h('p', { class: 'note', text: '브랜드는 몰라도 괜찮아요. 사진으로 잡은 색은 제안이며, 확인한 정보로만 코디를 계산해요.' }),
      h('div', { class: 'bar' }, h('button', { class: 'btn primary', type: 'button', 'data-discovery-confirm': first.map((it) => it.id).join(','),
        onclick: () => openAttributeCheck(first, { season: state.prefs.needsSeason, onComplete: () => { ui.tab = 'shop'; render(); } }), text: first.length + '벌 간단 확인' }),
        plan.pending.length > first.length ? h('button', { class: 'text-link', type: 'button', onclick: () => openAttributeCheck(plan.pending.map((r) => r.item), { season: state.prefs.needsSeason, onComplete: () => { ui.tab = 'shop'; render(); } }), text: '확인 전 옷 ' + plan.pending.length + '벌 모두 보기' }) : null));
  }
  const filters = h('details', { class: 'ev discovery-filters' }, h('summary', { text: '예산·계절 조정' }),
    segmented('discovery-budget', '상품 가격 상한', [['0', '전체'], ['50000', '5만원 이하'], ['100000', '10만원 이하']], String(ui.discoveryBudget || 0), (value) => { ui.discoveryBudget = Number(value); render(); }));
  const season = h('select', { id: 'needsSeason', onchange: () => { state.prefs.needsSeason = season.value; save(); render(); } }, h('option', { value: '', text: '계절 전체' }));
  SEASONS.forEach((s) => season.append(h('option', { value: s, text: s }))); season.value = state.prefs.needsSeason || '';
  filters.append(h('label', { for: 'needsSeason', text: '계절 ' }), season); box.append(filters);
  if (plan.recommendations.length) {
    box.append(h('h2', { text: '확인한 ' + D.inspectCatalog(DISCOVERY_RAW, { today: today() }).products.length + '개 상품 중 먼저 볼 상품' }),
      h('div', { class: 'needs-grid', id: 'needsResults' }, plan.recommendations.map((row, index) => discoveryProductCard(row, index, false))));
  } else if (plan.assessed) box.append(h('section', { class: 'panel', id: 'needsNoBuy' }, h('h2', { text: '지금은 구매를 서두르지 않아도 돼요' }),
    h('p', { class: 'sub', text: '확인된 상품 목록에서 추가할 근거가 있는 옷을 찾지 못했어요. 같은 종류가 있거나 선택한 조건에 맞는 새 조합이 없어요.' }),
    h('button', { class: 'btn', type: 'button', onclick: () => { ui.tab = 'outfits'; render(); }, text: '내 옷으로 코디 보기' })));
  if (plan.explore.length) box.append(h('details', { class: 'discovery-explore', open: !plan.recommendations.length },
    h('summary', { text: plan.recommendations.length ? '정보 확인 후 비교할 다른 실제 상품' : '등록 목록에 없는 종류의 실제 상품' }),
    h('p', { class: 'note', text: '종류를 기준으로 찾은 후보예요. 아직 색·무늬 조합이 확인된 추천은 아니에요.' }),
    h('div', { class: 'needs-grid', id: 'needsExplore' }, plan.explore.map((row, index) => discoveryProductCard(row, index, true)))));
  if (confirmation) box.append(confirmation);
  if (!plan.recommendations.length && !plan.explore.length && !plan.assessed) box.append(h('p', { class: 'note', text: '위의 간단 확인을 마치면 내 옷과 비교할 상품을 찾을 수 있어요.' }));
  if (plan.held.length || plan.covered.length) {
    const reasons = { 'registered-kind-covered': '이미 같은 역할의 옷이 있어요.', 'strong-overlap': '보유 옷과 색·종류가 많이 겹쳐요.', 'confirm-existing-kind': '같은 종류의 보유 옷 정보를 먼저 확인해요.' };
    box.append(h('details', { class: 'ev', id: 'needsCovered' }, h('summary', { text: '이미 가진 종류·구매를 보류한 이유' }),
      h('ul', { class: 'why' }, [...plan.covered, ...plan.held].map((row) => h('li', { text: row.product.brand + ' ' + row.product.name + ' · ' + (reasons[row.reason] || '보유 옷부터 살펴봐요.') + ' ' + (row.items || []).map((it) => it.name).join(' · ') })))));
  }
  box.append(h('p', { class: 'note', text: '등록된 옷과 확인한 공식 상품 목록 안에서 제안해요. 취향·사이즈·핏과 실시간 최저가는 아직 확인하지 않아요.' }));
  main.append(box);
}
