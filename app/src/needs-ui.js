// Inside the app closure. Recommendations are derived; no imaginary product is saved.
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
      h('button', { type: 'button', class: 'btn primary', id: 'addOwned', onclick: () => openQuickItem(null, 'owned', { returnTab: 'closet' }), text: '+ 옷 등록' })));
  box.append(h('div', { class: 'inventory-grid' }, plan.inventory.map((c) => h('button', { type: 'button', class: 'inventory-category', 'aria-pressed': ui.cat === c.cat ? 'true' : 'false', 'data-inventory-cat': c.cat, onclick: () => { ui.cat = c.cat; ui.season = ''; render(); } },
    h('span', { class: 'inventory-label', text: c.name }), h('strong', { text: String(c.count) }),
    h('span', { class: 'note', text: c.kinds.map((k) => k.name + ' ' + k.count).concat(c.unknown ? ['종류 미확인 ' + c.unknown] : []).join(' · ') || '아직 등록하지 않았어요' })))));
  if (plan.pending.length) box.append(h('p', { class: 'note', id: 'inventoryPending', text: '등록 정보에 확인 전인 옷 ' + plan.pending.length + '벌이 포함되어 있어요. 브랜드·품명을 몰라도 종류와 색을 확인하면 추천에 쓸 수 있어요.' }));
  const first = plan.recommendations[0];
  box.append(h('div', { class: 'needs-entry' }, h('div', null,
    h('b', { text: first ? '다음으로 살펴볼 옷: ' + first.name : plan.total ? '가진 옷부터 확인하고, 필요한 종류를 찾아보세요' : '옷 몇 벌로 시작해 보세요' }),
    h('p', { class: 'note', text: first ? first.reasons[0] : '등록된 옷의 구성과 함께 입을 조합을 보고 다음 한 벌을 제안해요.' })),
    h('button', { type: 'button', class: 'btn primary', id: 'openWardrobeNeeds', onclick: openNeeds, text: '필요한 한 벌 살펴보기 ↗' })));
  box.append(h('details', { class: 'owned-registration-tools' }, h('summary', { text: '사진 여러 장 · 기본 옷으로 등록' }), h('div', { class: 'bar' }, h('button', { class: 'btn small', type: 'button', id: 'addPhotos', onclick: () => $('#bulkFile').click(), text: '사진으로 여러 벌' }), h('button', { class: 'btn small', type: 'button', id: 'addQuick', onclick: () => openQuick(), text: '기본 옷 골라 넣기' }))));
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
    h('div', { class: 'bar need-product-actions' }, storeLink(r, '판매처에서 상품 보기 ↗', 'btn primary small'),
      h('span', { class: 'note', text: '가격과 재고는 바뀔 수 있어요.' })));
}
function needOutfit(outfit, candidate) {
  const pieces = [outfit.outer, outfit.top, outfit.bottom].filter(Boolean);
  return h('div', { class: 'need-outfit' }, pieces.map((it) => h('div', { class: 'need-piece' }, needVisual(it),
    h('span', { text: (it.id === candidate.id ? '추가할 옷 · ' : '보유 · ') + it.name }))));
}
function renderNeeds(main) {
  const plan = wardrobePlan();
  const box = h('section', { id: 'wardrobeNeeds', 'aria-labelledby': 'needsTitle' });
  const intro = h('header', { class: 'needs-intro' }, h('div', null, h('p', { class: 'eyebrow', text: 'THE NEXT PIECE' }),
    h('h1', { id: 'needsTitle', text: '내 옷장에 더할 한 벌.' }),
    h('p', { class: 'lead', text: '가진 옷을 더 자주 입게 해 줄 다음 한 벌. 필요한 이유와 함께 입을 옷을 살펴보세요.' })));
  const context = h('div', { class: 'needs-context' }); intro.append(context); box.append(intro);
  const purpose = h('select', { id: 'needsPurpose', onchange: () => { state.prefs.needsPurpose = purpose.value; save(); render(); } });
  for (const [value, text] of Object.entries(N.PURPOSES)) purpose.append(h('option', { value, text }));
  purpose.value = plan.purpose;
  const season = h('select', { id: 'needsSeason', onchange: () => { state.prefs.needsSeason = season.value; save(); render(); } }, h('option', { value: '', text: '계절 전체' }));
  for (const s of SEASONS) season.append(h('option', { value: s, text: s })); season.value = plan.season;
  context.append(h('div', { class: 'bar needs-controls' }, h('label', { for: 'needsPurpose', text: '입을 때' }), purpose, h('label', { for: 'needsSeason', text: '계절' }), season),
    h('p', { class: 'note', id: 'needsCoverage', text: '보유 ' + plan.total + '벌 중 이 조건으로 비교할 수 있는 ' + plan.assessed + '벌을 살펴봤어요. 브랜드·품명은 필수가 아니에요.' }));
  if (!plan.total) box.append(h('section', { class: 'panel needs-empty', id: 'needsEmpty' }, h('div', { class: 'empty-copy' }, h('p', { class: 'eyebrow', text: 'START WITH YOUR WARDROBE' }), h('h2', { text: '좋은 추천은 내 옷을 아는 것부터.' }),
    h('p', { class: 'sub', text: '자주 입는 상의와 하의부터 알려 주세요. 브랜드와 품명은 몰라도 괜찮아요.' }),
    h('div', { class: 'bar' }, h('button', { class: 'btn primary', type: 'button', onclick: () => openQuickItem(null, 'owned', { returnTab: 'shop' }), text: '보유 옷부터 넣기' }),
      h('button', { class: 'btn', type: 'button', onclick: () => $('#bulkFile').click(), text: '옷 사진 등록하기' }))), editorialImage()));
  if (plan.pending.length) {
    const pending = h('details', { class: 'panel needs-pending', id: 'needsPending', open: !plan.assessed },
      h('summary', { text: '추천에 쓸 정보 확인 · ' + plan.pending.length + '벌' }),
      h('p', { class: 'note', text: '사진 초안을 확정된 옷으로 계산하지 않았어요. 한 벌씩 사진과 정보를 확인해 주세요. 같은 종류의 미확인 옷이 있으면 추가 구매 제안을 보류해요.' }));
    const first = ['top', 'bottom', 'dress', 'outer', 'shoes'].map((cat) => plan.pending.find((r) => r.item.cat === cat)).filter(Boolean);
    const queue = first.concat(plan.pending.filter((r) => !first.includes(r)));
    const reviewRow = (row) => h('div', { class: 'needs-review-row' }, needVisual(row.item),
      h('div', { class: 'grow' }, h('b', { text: row.item.name }), h('p', { class: 'note', text: row.missing.map((k) => FIELD_NAMES[k] || k).join(' · ') })),
      h('button', { class: 'btn small', type: 'button', 'data-needs-confirm': row.item.id, onclick: () => openQuickItem(row.item, null, { returnTab: 'shop' }), text: '정보 확인' }));
    queue.slice(0, 3).forEach((row) => pending.append(reviewRow(row)));
    if (queue.length > 3) pending.append(h('details', { class: 'ev' }, h('summary', { text: '나머지 ' + (queue.length - 3) + '벌 확인하기' }), queue.slice(3).map(reviewRow)));
    box.append(pending);
  }
  if (plan.ideas.length) box.append(h('section', { class: 'notice', id: 'needsIdeas' }, h('h2', { text: '등록 목록에 아직 없는 종류' }),
    h('p', { text: plan.ideas.map((r) => r.name).join(' · ') }),
    h('p', { class: 'note', text: '확인 전 목록과 비교한 참고 항목이며 구매 우선순위는 아니에요. 보유 옷을 확인하면 함께 입을 조합이 생기는 종류부터 추천할게요.' })));
  if (plan.recommendations.length) {
    box.append(h('p', { class: 'note', text: '없는 분류를 먼저 보고, 기존에 짝이 없던 옷을 활용하는지와 함께 입을 옷 수를 비교했어요. 종류가 골고루 보이도록 최대 3개를 제안해요.' }));
    const list = h('div', { class: 'needs-grid', id: 'needsResults' });
    plan.recommendations.forEach((r, i) => {
      const cover = h('div', { class: 'need-cover' }, h('span', { class: 'need-index', text: String(i + 1).padStart(2, '0') }), needVisual(r.candidate), h('span', { class: 'note', text: '종류 제안 · 실제 판매 상품 아님' }));
      const body = h('div', { class: 'need-body' }, h('div', { class: 'need-heading' }, h('p', { class: 'rank', text: i === 0 ? 'FIRST TO CONSIDER' : 'ALSO WORTH A LOOK' }), h('h2', { text: r.name })),
        h('ul', { class: 'why' }, r.reasons.map((reason) => h('li', { text: reason }))));
      if (r.outfits.length) {
        body.append(h('h3', { text: '이 옷들과 함께' }), needOutfit(r.outfits[0], r.candidate));
        if (r.outfits.length > 1) body.append(h('details', { class: 'ev' }, h('summary', { text: '다른 조합 ' + (r.outfits.length - 1) + '개 보기' }), r.outfits.slice(1).map((o) => needOutfit(o, r.candidate))));
      }
      body.append(h('p', { class: 'note', text: r.cautions.join(' ') }));
      body.append(r.line ? needOfferCard(r) : h('section', { class: 'need-product need-product-empty', 'aria-label': '상품 준비 상태' },
        h('p', { class: 'eyebrow', text: '실제 상품 추천은 준비 중' }),
        h('p', { class: 'note', text: '이 종류는 아직 검증한 상품명·판매가·구매 링크가 없어요.' })));
      body.append(h('div', { class: 'bar need-actions' },
        h('button', { class: 'btn primary small', type: 'button', 'data-need-candidate': r.id, onclick: () => openNeedProduct(r), text: '보고 있는 상품과 비교하기 ↗' }),
        r.line ? h('button', { class: 'text-link', type: 'button', onclick: openNeedCatalog, text: '흰 티 다른 상품과 비교' }) : null));
      list.append(h('article', { class: 'need-card', 'data-need-id': r.id }, cover, body));
    });
    box.append(list);
  } else if (plan.assessed) box.append(h('div', { class: 'panel', id: 'needsNoBuy' }, h('h2', { text: '지금 정보로는 추가 구매를 먼저 권할 근거가 적어요' }),
    h('p', { class: 'sub', text: plan.held.length ? '이미 비슷한 옷이 있거나, 같은 종류의 미확인 옷이 있어요. 정보를 확인한 뒤 다시 살펴보세요.' : '현재 비교하는 기본 종류가 있거나 새 조합이 확인되지 않았어요. 지금 가진 옷부터 활용해 보세요.' }),
    h('button', { class: 'btn', type: 'button', onclick: () => { ui.tab = 'outfits'; render(); }, text: '보유 옷 코디 보기' })));
  else if (plan.total && !plan.pending.length) box.append(h('p', { class: 'empty', text: '선택한 계절로 등록된 옷이 없어요. 계절을 바꾸거나 보유 옷의 계절 정보를 확인해 주세요.' }));
  if (plan.covered.length || plan.held.length) box.append(h('details', { class: 'ev', id: 'needsCovered' }, h('summary', { text: '추가 구매를 먼저 권하지 않은 종류' }),
    h('ul', { class: 'why' }, plan.covered.map((r) => h('li', { text: r.name + ': ' + r.items.map((it) => it.name).join(' · ') + ' 보유' })),
      plan.held.map((r) => h('li', { text: r.name + ': 같은 분류의 ' + r.items.length + '벌 정보 확인 후 판단' })))));
  main.append(box);
}
