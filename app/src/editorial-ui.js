// Presentation only. No synthetic garments are inserted into the user's wardrobe.
const CATEGORY_WORDS = { top: 'TOPS', bottom: 'BOTTOMS', outer: 'OUTERWEAR', dress: 'DRESSES', shoes: 'SHOES' };
function editorialImage() {
  return h('figure', { class: 'hero-image' }, h('img', { src: EDITORIAL_IMAGE, alt: '빛이 드는 스튜디오의 옷걸이에 셔츠와 재킷을 걸어 둔 연출 이미지', decoding: 'async' }),
    h('figcaption', { text: 'AI 연출 이미지 · 실제 보유 옷 아님' }));
}
function renderEditorialHero(main, plan) {
  const has = plan.total > 0;
  const copy = h('div', { class: 'hero-copy' }, h('p', { class: 'eyebrow', text: has ? 'YOUR WARDROBE, RECONSIDERED' : 'A NEW LOOK AT WHAT YOU OWN' }),
    h('h1', null, h('span', { text: has ? '나의 옷,' : '내 옷을,' }), h('span', { text: has ? '다음의 가능성.' : '다시 발견하다.' })),
    h('p', { text: has ? '가진 옷에서 시작하는 다음 한 벌.' : '이미 가진 옷을 더 잘 입고, 정말 필요한 한 벌을 찾아보세요.' }),
    h('div', { class: 'bar' }, h('button', { type: 'button', class: 'btn primary', id: has ? 'heroNeeds' : 'startNeedsOwned', onclick: has ? openNeeds : () => openQuickItem(null, 'owned', { returnTab: 'closet' }), text: has ? '필요한 한 벌 보기 ↗' : '내 옷 등록하기 ↗' }),
      !has ? h('button', { type: 'button', class: 'btn', id: 'heroPhotos', onclick: () => $('#bulkFile').click(), text: '사진으로 시작' }) : null));
  if (!has) copy.append(h('button', { type: 'button', class: 'text-link', onclick: () => { $('#startMore').open = true; $('#startMore').scrollIntoView({ block: 'center', behavior: 'smooth' }); }, text: '등록 전에 예시 옷장 둘러보기' }));
  if (BRAND.mobilePreview) copy.append(h('p', { class: 'note', text: '모바일 미리보기 · 옷과 사진은 이 브라우저에 저장돼요. PC와 자동으로 맞춰지지 않습니다.' }));
  const image = editorialImage();
  const photos = owned().filter((it) => it.photo?.img && it.photo.kind === 'own').slice(0, 3);
  if (has && photos.length) {
    image.textContent = ''; image.classList.add('owned-hero-image');
    image.append(h('div', { class: 'owned-photo-collage' }, photos.map((it) => h('img', { src: it.photo.img, alt: it.name, decoding: 'async' }))), h('figcaption', { text: '내 옷장에 등록한 사진' }));
  }
  main.append(h('section', { class: 'editorial-hero' + (has ? ' has-items' : ''), 'aria-label': '내 옷장에서 시작하는 추천' }, copy, image));
  if (!has) main.append(h('div', { class: 'onboard-steps' }, [
    ['01', '가진 옷부터', '자주 입는 옷 몇 벌이면 충분해요. 사진이나 간단한 정보로 시작하세요.'],
    ['02', '나에게 필요한 한 벌', '내 옷장에 없는 종류와 함께 입을 수 있는 옷을 살펴보세요.'],
    ['03', '사기 전에 한 번 더', '고민 중인 옷이 이미 가진 옷과 겹치는지 비교해 보세요.'],
  ].map(([n, title, text]) => h('div', { class: 'onboard-step' }, h('span', { text: n }), h('div', null, h('h3', { text: title }), h('p', { text }))))));
}
function draftFields(it) {
  return [W.CATS[it.cat], W.KINDS[it.cat]?.[it.kind], W.FAM[it.family]?.[0], it.light == null ? '' : '밝기 ' + it.light,
    W.FORMAL[it.formality], W.PATTERNS[it.pattern], it.seasons?.length ? it.seasons.join(' · ') : '계절 미확인'].filter(Boolean).join(' · ');
}
function openDraftReview(drafts) {
  $('#draftReview')?.remove();
  const dialog = h('dialog', { id: 'draftReview', class: 'draft-review-dialog' });
  const list = h('div', { class: 'draft-review-list' });
  const selected = h('p', { class: 'note', id: 'draftReviewCount', 'aria-live': 'polite', text: '확인한 옷을 선택해 주세요.' });
  const error = h('p', { class: 'warnnote', id: 'draftReviewError', hidden: true, role: 'alert' });
  const apply = h('button', { class: 'btn primary', id: 'applyDraftConfirmation', type: 'button', disabled: true, text: '확인한 옷을 비교에 반영' });
  const syncSelection = () => {
    const count = list.querySelectorAll('[data-confirm-draft]:checked').length;
    selected.textContent = count ? count + '벌을 선택했습니다. 확인한 속성만 비교에 반영됩니다.' : '확인한 옷을 선택해 주세요.';
    apply.disabled = count === 0;
    apply.textContent = count ? '확인한 ' + count + '벌을 비교에 반영' : '확인한 옷을 비교에 반영';
  };
  for (const it of drafts) {
    const missing = W.assessment(it).missing.filter((key) => key !== 'confirmation');
    const attrs = h('p', { class: 'sub draft-review-attrs', text: draftFields(it) || '입력된 속성이 없습니다.' });
    const row = h('article', { class: 'draft-review-row' }, pic(it, 'mini'), h('div', { class: 'draft-review-copy' },
      h('h3', { text: it.name }), attrs,
      missing.length ? h('p', { class: 'warnnote', text: '필수 정보가 비어 있어 먼저 입력해야 합니다.' }) : h('label', { class: 'draft-review-check' },
        h('input', { type: 'checkbox', 'data-confirm-draft': it.id, onchange: syncSelection }), ' 사진과 위 속성이 맞는지 확인했습니다'),
      h('button', { class: 'btn small', type: 'button', onclick: () => { dialog.close(); openQuickItem(it, null, { returnTab: 'closet' }); }, text: missing.length ? '정보 채우기' : '정보 수정' })));
    list.append(row);
  }
  apply.addEventListener('click', async () => {
    const ids = new Set(Array.from(list.querySelectorAll('[data-confirm-draft]:checked'), (input) => input.getAttribute('data-confirm-draft')));
    const targets = state.items.filter((it) => ids.has(it.id) && W.isDraft(it) && !W.assessment(it).missing.some((key) => key !== 'confirmation'));
    if (!targets.length) { error.textContent = '확인할 수 있는 옷이 없습니다. 정보를 다시 확인해 주세요.'; error.hidden = false; return; }
    const before = state.items.slice();
    for (const it of targets) replaceItem(W.setAttrSource(it, 'owner-confirmed'));
    apply.disabled = true; apply.textContent = '저장하는 중…'; error.hidden = true;
    if (!await save()) {
      state.items = before; apply.disabled = false; error.textContent = '저장하지 못했습니다. 옷장 상태는 되돌렸습니다. 다시 시도해 주세요.'; error.hidden = false; syncSelection(); return;
    }
    dialog.close(); render();
  });
  dialog.append(h('div', { class: 'dhead' }, h('h2', { text: '사진으로 등록한 옷 확인' }), h('button', { class: 'btn small', type: 'button', onclick: () => dialog.close(), text: '닫기' })),
    h('div', { class: 'dbody' }, h('p', { class: 'sub', text: '사진과 분류·색·밝기·격식·무늬를 확인한 옷만 골라 주세요. 이 확인은 코디 계산에 쓸 속성에 대한 확인이며, 브랜드·상품명이나 동일 제품을 확인하는 절차가 아닙니다.' }), list, selected, error,
      h('div', { class: 'bar' }, apply, h('button', { class: 'btn', type: 'button', onclick: () => dialog.close(), text: '나중에' }))));
  document.body.append(dialog); dialog.addEventListener('close', () => dialog.remove(), { once: true }); dialog.showModal();
}
function renderEditorialCloset(main) {
  const plan = wardrobePlan();
  renderEditorialHero(main, plan);
  if (!state.items.length) { startNotices(main); return; }
  if (state.meta.sample) startNotices(main);
  renderWardrobeOverview(main);
  const drafts = owned().filter(W.isDraft);
  if (drafts.length) {
    const ready = drafts.filter((it) => !W.assessment(it).missing.some((key) => key !== 'confirmation')).length;
    main.append(h('section', { class: 'panel draft-confirm-panel', id: 'draftConfirmPanel' },
      h('div', null, h('h2', { text: '사진으로 등록한 옷 ' + drafts.length + '벌' }),
        h('p', { class: 'sub', text: '사진에서 추정한 속성은 확인 전까지 추천 계산에서 제외됩니다. 맞는 옷만 확인해 한 번에 반영하세요.' })),
      h('button', { class: 'btn primary', type: 'button', id: 'reviewPhotoDrafts', onclick: () => openDraftReview(drafts), text: ready ? '사진과 속성 확인하기 · ' + ready + '벌 확인 가능' : '정보를 채워야 비교할 수 있어요' })));
  }
  const search = h('input', { type: 'search', id: 'closetSearch', placeholder: '이름 · 종류 · 브랜드로 찾기', value: ui.closetSearch || '', 'aria-label': '내 옷 검색' });
  const toolbar = h('div', { class: 'closet-toolbar' }, h('div', { class: 'bar', 'aria-label': '옷 분류' }, chip('전체', ui.cat === 'all', () => { ui.cat = 'all'; render(); }),
    Object.keys(CATS).map((c) => chip(CATS[c], ui.cat === c, () => { ui.cat = c; render(); }))), h('label', { class: 'closet-search' }, search));
  const count = h('span', { class: 'note', id: 'closetResultCount', 'aria-live': 'polite' });
  const gallery = h('div', { class: 'grid closet-gallery', id: 'closetGrid' });
  const draw = () => {
    gallery.textContent = '';
    const q = (ui.closetSearch || '').trim().toLocaleLowerCase();
    const list = state.items.filter((i) => i.status !== 'gone' && (ui.cat === 'all' || i.cat === ui.cat) && J.inSeason(i, ui.season) && (!q || [i.name, i.brand, i.model, kindLabel(i), CATS[i.cat], famLabel(i)].join(' ').toLocaleLowerCase().includes(q)));
    const order = { outer: 0, top: 1, bottom: 2, dress: 3, shoes: 4 };
    list.sort((a, b) => a.status === b.status ? order[a.cat] - order[b.cat] : a.status === 'candidate' ? 1 : -1);
    count.textContent = list.length + '벌 표시' + (cands().length ? ' · 구매 후보는 따로 표시해요' : '');
    for (const it of list) {
      const card = itemCard(it);
      const photo = card.firstElementChild;
      const open = () => W.isDraft(it) || !W.assessment(it).ready ? openQuickItem(it, null, { returnTab: 'closet' }) : openEditor(it);
      const photoButton = h('button', { type: 'button', class: 'closet-photo-button', 'aria-label': it.name + ' 자세히 보기', onclick: open });
      photo.replaceWith(photoButton); photoButton.append(photo);
      const tools = h('details', { class: 'item-tools' }, h('summary', { text: '더 보기' }), h('div', { class: 'bar' },
        h('button', { class: 'btn small', type: 'button', onclick: () => openEditor(it), text: '기록 수정' }),
        h('button', { class: 'btn small', type: 'button', onclick: () => openMatch(it.id), text: '상품 사진' }),
        it.status === 'candidate' ? h('button', { class: 'btn small', type: 'button', onclick: () => { ui.judgeId = it.id; ui.tab = 'judge'; render(); }, text: '판정 보기' }) : null,
        h('button', { class: 'btn small danger', type: 'button', 'aria-label': it.name + ' 삭제', onclick: () => deleteItem(it), text: '삭제' })));
      card.querySelector('.cbody').append(h('div', { class: 'cfoot' }, h('button', { type: 'button', class: 'text-link', onclick: open, text: W.isDraft(it) ? '정보 확인 ↗' : '자세히 보기 ↗' }), tools));
      gallery.append(card);
    }
    if (!list.length) gallery.append(h('p', { class: 'empty', style: 'grid-column:1/-1', text: '이 조건에 맞는 옷이 없어요. 검색어나 분류를 바꿔 보세요.' }));
  };
  search.addEventListener('input', () => { ui.closetSearch = search.value; draw(); });
  main.append(toolbar, h('div', { class: 'closet-subbar' }, h('div', { class: 'bar' }, seasonChips(ui.season, (s) => { ui.season = s; render(); })), count), gallery);
  draw();
  const notices = h('section', { class: 'closet-notices', 'aria-label': '옷장 관리 안내' }); if (!state.meta.sample) startNotices(notices); main.append(notices);
}
