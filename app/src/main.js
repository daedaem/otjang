import { SLOTS, SLOT_BY_ID, STYLES, OCCASIONS, CATS } from './data/slots.js';
import { LOOKS } from './data/looks.js';
import { PRODUCTS, CATALOG } from './data/products.js';
import { recommendItems, recommendLooks, search, productsFor, scoreSlot, seasonOf, SEASON_LABEL, formatPrice, josa } from './engine.js';
import { garmentSvg, ICON } from './icons.js';
import { GARMENT_KINDS, DEMO_SLOTS, newWardrobeState, wardrobeView, storedWardrobe, ownedGarments, garmentLabel, garmentKindName, makeGarment, migrateLegacyWardrobe } from './wardrobe.js';
import { createWardrobeStore, parseWardrobeBackup, legacyWardrobeFingerprint } from './wardrobe-store.js';
import { prepareGarmentPhoto } from './garment-photo.js';

const KEY = 'eoul:v1';
const PRODUCT_BY_ID = Object.fromEntries(PRODUCTS.map((p) => [p.id, p]));
const BUDGETS = [
  [null, '예산 전체'],
  [50000, '5만원 이하'],
  [100000, '10만원 이하'],
  [200000, '20만원 이하'],
];
const ROLE_LABEL = { outer: '아우터', top: '상의', dress: '원피스', bottom: '하의', shoes: '신발', acc: '소품' };
const EXAMPLES = {
  M: ['출근용 셔츠 10만원 이하', '청바지에 어울리는 신발', '겨울 데이트 코트', '가성비 니트', '하객룩 재킷'],
  F: ['출근용 셔츠 10만원 이하', '원피스에 어울리는 신발', '겨울 코트 20만원 이하', '가성비 니트', '데이트 스커트'],
};

const DEMO_OWNED = DEMO_SLOTS;
function demoState(gender = 'M') {
  return wardrobeView({ ...newWardrobeState(), gender, demoSelected: [...DEMO_OWNED[gender]] });
}
let state = demoState();
let query = '';
let lastLooks = [];
let lastSearch = null;
let closetPickerOpen = false;
const wardrobeStore = createWardrobeStore();
let wardrobeRevision = 0, storageReady = false, saving = false, storageError = '', storageConflict = false;
const photoUrls = new Map();
let garmentDraft = null, restoreDraft = null, sheetReturnFocus = null, sheetRevision = 0, legacyPendingRaw = null, legacyImportDraft = null;

function installPhotoUrls(photos) {
  for (const url of photoUrls.values()) URL.revokeObjectURL(url);
  photoUrls.clear();
  for (const [id, blob] of photos) photoUrls.set(id, URL.createObjectURL(blob));
}
async function bootApp() {
  try {
    const current = await wardrobeStore.read() || await wardrobeStore.load(localStorage.getItem(KEY));
    state = wardrobeView(current.state); wardrobeRevision = current.revision;
    installPhotoUrls(current.photos); storageReady = true;
    await checkLegacyChanges();
  } catch (error) {
    storageError = error.message || '옷장을 읽지 못했습니다. 기존 자료는 변경하지 않았습니다.';
  }
  render();
}
async function checkLegacyChanges() {
  try {
    const raw = localStorage.getItem(KEY);
    legacyPendingRaw = raw !== null && await legacyWardrobeFingerprint(raw) !== state.legacyFingerprint ? raw : null;
  } catch { /* The current IndexedDB wardrobe remains usable when the legacy store is unavailable. */ }
}
async function set(patch, { rerender = true, assets = [] } = {}) {
  if (Object.keys(patch).every((key) => key === 'tab')) {
    state = { ...state, ...patch }; if (rerender) render(); return true;
  }
  if (!storageReady || saving) {
    toast(saving ? '저장이 끝날 때까지 잠시 기다려 주세요.' : '저장소를 사용할 수 없습니다. 기존 자료는 변경하지 않았습니다.');
    return false;
  }
  saving = true;
  try {
    const next = wardrobeView({ ...state, ...patch }, patch.tab || state.tab);
    wardrobeRevision = await wardrobeStore.commit(storedWardrobe(next), wardrobeRevision, assets);
    state = next;
    for (const asset of assets) if (!photoUrls.has(asset.id)) photoUrls.set(asset.id, URL.createObjectURL(asset.blob));
    const refs = new Set(state.garments.map((garment) => garment.photoId));
    for (const [id, url] of photoUrls) if (!refs.has(id)) { URL.revokeObjectURL(url); photoUrls.delete(id); }
    const hadStorageError = !!storageError;
    storageError = ''; storageConflict = false;
    if (rerender || hadStorageError) render();
    return true;
  } catch (error) {
    storageError = error.name === 'QuotaExceededError' ? '이 브라우저의 저장 공간이 부족해요. 저장된 옷장을 백업하고 불필요한 옷을 정리한 뒤 다시 저장해 주세요.' : error.message || '저장하지 못했습니다. 다시 시도해 주세요.';
    storageConflict = error.code === 'conflict';
    render();
    return false;
  } finally {
    saving = false;
  }
}
async function reloadWardrobeKeepingDraft() {
  if (saving) return;
  saving = true;
  try {
    const current = await wardrobeStore.read();
    if (!current) throw new Error('저장된 옷장을 찾지 못했습니다. 입력은 유지했습니다.');
    state = wardrobeView(current.state, state.tab); wardrobeRevision = current.revision;
    installPhotoUrls(current.photos); storageReady = true; storageError = ''; storageConflict = false;
    if (garmentDraft) garmentDraft.error = '';
    render();
  } catch (error) { storageError = error.message; render(); }
  finally { saving = false; if (garmentDraft) renderGarmentEditor(); }
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const $app = document.getElementById('app');
const $sheet = document.getElementById('sheet-root');
const $toast = document.getElementById('toast');
const ownedLabel = () => state.demo ? '예시 옷' : '내 옷';
const reasonText = (text) => state.demo ? text.replace(/^가진 /, '예시 옷장 속 ') : text;

function garmentArt(garment) {
  const photo = photoUrls.get(garment?.photoId);
  if (photo) return `<img src="${esc(photo)}" alt="${esc(garmentLabel(garment))}" loading="lazy" decoding="async" data-own-photo="${esc(garment.id)}">`;
  const slot = SLOT_BY_ID[garment?.slotId] || { shape: garment?.kind || 'shirt', color: '#A8AAA4' };
  return `<div class="art">${garmentSvg(slot)}</div>`;
}
function lookTitle(result) {
  return result.items.some((item) => item.garment && !item.garment.slotId)
    ? [...new Set(result.items.filter((item) => item.role !== 'acc').map((item) => garmentKindName(item.garment?.kind || item.slot.shape)))].join(' · ') + ' 코디'
    : result.look.title;
}
function lookNote(result) {
  return result.items.some((item) => item.garment && !item.garment.slotId)
    ? '등록한 옷 종류로 만든 조합이에요. 색과 핏은 직접 확인해 주세요.' : result.look.note;
}
function storageNotice() {
  if (!storageError) return '';
  return `<div class="notice storage-error" role="alert"><b>저장을 확인해 주세요</b><p>${esc(storageError)}</p><p>${storageReady ? '화면은 마지막으로 저장한 상태예요. 입력 중인 옷은 다시 저장할 수 있어요.' : '저장된 옷장을 읽지 못해 예시를 보여 드립니다. 기존 자료는 변경하지 않았습니다.'}</p><div class="opts">${storageConflict ? '<button class="chip" data-action="reload-wardrobe">입력 유지하고 최신 옷장 불러오기</button>' : ''}${storageReady ? '<button class="chip" data-action="backup">저장된 옷장 백업 받기</button>' : ''}<button class="chip" data-action="recovery-backup">저장 원문 받기</button></div></div>`;
}

function demoBanner() {
  if (!state.demo) return '';
  const owned = state.owned.filter((id) => SLOT_BY_ID[id]?.g === state.gender);
  return `<aside class="demo-banner" aria-label="예시 옷장 체험">
    <div class="demo-heading"><b>예시 옷 ${owned.length}벌로 바로 체험 중</b><button class="link" data-action="start-personal">내 옷으로 바꾸기 ${ICON.chevron}</button></div>
    <p>옷을 등록하지 않아도 코디와 추천을 볼 수 있어요.</p>
    <button class="demo-garments" data-action="tab" data-tab="closet" aria-label="예시 옷장 살펴보기">${owned.slice(0, 6).map((id) => `<span title="${esc(SLOT_BY_ID[id].name)}">${garmentSvg(SLOT_BY_ID[id])}</span>`).join('')}</button>
  </aside>`;
}

// ── 공통 조각
function picture(product, slot, cls = 'thumb') {
  const art = `<div class="art">${garmentSvg(slot)}</div>`;
  if (!product?.img) return `<div class="${cls}">${art}</div>`;
  return `<div class="${cls}"><img src="${esc(product.img)}" alt="${esc(product.name)}" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-slot="${slot.id}"></div>`;
}
function stars(p) {
  if (!p.rating) return '';
  return `<span class="rating">${ICON.star}${p.rating.toFixed(1)}${p.reviews ? ` (${p.reviews.toLocaleString('ko-KR')})` : ''}</span>`;
}
function heartBtn(p) {
  const on = state.saved.includes(p.id);
  return `<button class="heart" data-action="save" data-id="${p.id}" aria-pressed="${on}" aria-label="${on ? '찜 해제' : '찜하기'}">${on ? ICON.heartFill : ICON.heart}</button>`;
}
function itemCard({ slot, product, reasons }) {
  return `<article class="item">
    <button data-action="open-item" data-id="${product.id}" aria-label="${esc(product.brand)} ${esc(product.name)} 자세히">${picture(product, slot)}</button>
    <div class="item-body">
      <div class="brand-name">${esc(product.brand)}</div>
      <button class="name" data-action="open-item" data-id="${product.id}" style="text-align:left">${esc(product.name)}</button>
      <div class="price">${formatPrice(product.price)}${stars(product)}</div>
      <div class="reason">${esc(reasonText(reasons?.[0] || slot.why))}</div>
      <div class="fine">종류 조합 기준 · 상품 선택은 평점·후기 수 참고</div>
    </div>
    ${heartBtn(product)}
  </article>`;
}
function gridCard({ slot, product, reasons }) {
  return `<article class="card">
    <button data-action="open-item" data-id="${product.id}" style="display:block;width:100%;text-align:left">
      ${picture(product, slot)}
      <div class="brand-name">${esc(product.brand)}</div>
      <div class="name">${esc(product.name)}</div>
      <div class="price">${formatPrice(product.price)}</div>
      ${reasons?.[0] ? `<div class="reason">${esc(reasonText(reasons[0]))}</div>` : ''}
      <div class="fine">종류 조합 기준 · 평점·후기 수 참고</div>
    </button>
    ${heartBtn(product)}
  </article>`;
}
function lookCard(r, index, { wide = false } = {}) {
  const tiles = r.items.filter((i) => i.role !== 'acc').slice(0, 4);
  const n = tiles.length;
  return `<button class="look" data-action="open-look" data-index="${index}" ${wide ? 'style="width:100%"' : ''}>
    <div class="look-grid n${n}">
      ${tiles.map((i) => `<div class="tile">${i.owned ? `<span class="badge">${ownedLabel()}</span>${garmentArt(i.garment)}` : i.product.img ? `<img src="${esc(i.product.img)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-slot="${i.slot.id}">` : `<div class="art">${garmentSvg(i.slot)}</div>`}</div>`).join('')}
    </div>
    <div class="look-body">
      <div class="look-title">${esc(lookTitle(r))}</div>
      <div class="look-note">${esc(lookNote(r))}</div>
      <div class="look-meta">
        <span>${r.ownedCount ? `${ownedLabel()} ${r.ownedCount}개 + ` : ''}새로 ${r.buyCount}개</span>
        <b>${r.buyCount ? formatPrice(r.buyTotal) : `${ownedLabel()}으로 완성`}</b>
      </div>
    </div>
  </button>`;
}

// ── 시작 화면 (두 번 누르면 끝)
function renderOnboarding() {
  const g = state.gender;
  // 스타일마다 그 스타일다운 아이템(다른 스타일보다 점수가 높은 것)을 겹치지 않게 3개씩 보여 준다
  const used = new Set();
  const styleTiles = g
    ? Object.entries(STYLES).map(([key, s]) => {
        const others = (x) => Math.max(...Object.keys(STYLES).filter((k) => k !== key).map((k) => x.style[k] || 0));
        const picks = SLOTS.filter((x) => x.g === g && x.style[key] >= 2 && x.cat !== 'acc' && !used.has(x.id))
          .sort((a, b) => (b.style[key] - others(b)) - (a.style[key] - others(a)) || b.style[key] - a.style[key])
          .map((slot) => ({ slot, product: productsFor(slot.id)[0] }))
          .filter((x) => x.product)
          .slice(0, 3);
        picks.forEach((x) => used.add(x.slot.id));
        return `<button class="pick" data-action="pick-style" data-style="${key}" aria-pressed="${state.style === key}">
          <div><b>${s.label}</b><span>${s.desc}</span></div>
          <div class="mini">${picks.map((x) => `<div>${x.product.img ? `<img src="${esc(x.product.img)}" alt="" referrerpolicy="no-referrer" data-slot="${x.slot.id}">` : `<div class="art">${garmentSvg(x.slot)}</div>`}</div>`).join('')}</div>
        </button>`;
      }).join('')
    : '';
  return `<div class="onboard"><div class="onboard-inner">
    <div class="logo">어울</div>
    <p class="lead">나에게 어울리는<br>다음 한 벌을 바로 골라 드릴게요</p>
    <p class="lead-sub">가입 없이 두 번만 누르면 실제 브랜드 상품을 추천해요.</p>
    <div class="step">
      <h2>1. 누구의 옷을 찾으세요?</h2>
      <div class="pick2">
        <button class="pick" data-action="pick-gender" data-g="M" aria-pressed="${g === 'M'}"><b>남성 옷</b><span>셔츠·재킷·치노</span></button>
        <button class="pick" data-action="pick-gender" data-g="F" aria-pressed="${g === 'F'}"><b>여성 옷</b><span>셔츠·원피스·코트</span></button>
      </div>
    </div>
    ${g ? `<div class="step"><h2>2. 끌리는 스타일을 골라 주세요</h2><div class="style-pick">${styleTiles}</div></div>` : ''}
    <p class="privacy">선택한 내용은 이 기기에만 저장돼요.</p>
  </div></div>`;
}

// ── 홈
function topBar() {
  const budgetLabel = BUDGETS.find(([v]) => v === state.budget)?.[1] || '예산 전체';
  return `<header class="top">
    <div class="top-row">
      <div class="brand">어울<small>다음 한 벌</small></div>
      <button class="profile-btn" data-action="open-profile">${ICON.user}${state.gender === 'F' ? '여성' : '남성'} · ${STYLES[state.style].label}</button>
    </div>
    <form class="ask" data-action="ask" role="search">
      ${ICON.search}
      <input id="ask-input" name="q" type="search" enterkeyhint="search" autocomplete="off" placeholder="예) ${esc(EXAMPLES[state.gender][0])}" value="${esc(query)}" aria-label="찾는 옷을 한 줄로 적어 주세요">
      ${query ? `<button type="button" class="clear" data-action="clear-q" aria-label="검색 지우기">${ICON.close}</button>` : ''}
    </form>
    <div class="suggest-pop" id="suggest" hidden><div class="sub">이렇게 물어보세요</div><div class="suggest">${EXAMPLES[state.gender].map((e) => `<button class="chip" data-action="example" data-q="${esc(e)}">${esc(e)}</button>`).join('')}</div></div>
    <div class="chips" role="group" aria-label="상황과 예산">
      ${Object.entries(OCCASIONS).map(([k, v]) => `<button class="chip" data-action="occasion" data-occ="${k}" aria-pressed="${state.occasion === k}">${v}</button>`).join('')}
      <button class="chip ghost" data-action="open-budget" aria-pressed="${!!state.budget}">${budgetLabel}${ICON.chevron}</button>
    </div>
  </header>`;
}

function renderHome() {
  if (query) return renderSearch();
  const season = seasonOf();
  lastLooks = recommendLooks(state, { limit: 4 });
  const items = recommendItems(state, { limit: 8 });
  const ctxLine = [SEASON_LABEL[season], STYLES[state.style].label, state.occasion ? OCCASIONS[state.occasion] : null].filter(Boolean).join(' · ');
  const ownedCount = ownedGarments(state).filter((garment) => garment.gender === state.gender).length;
  return `
    <section class="section">
      <div class="section-head"><div><h2>오늘의 코디</h2><div class="sub">${ctxLine}${ownedCount ? ` · ${ownedLabel()} ${ownedCount}개 반영` : ''}</div></div></div>
      ${lastLooks.length ? `<div class="looks">${lastLooks.map((r, i) => lookCard(r, i)).join('')}</div>` : `<div class="notice">이 조건에 맞는 코디가 아직 없어요. 예산이나 상황을 바꿔 보세요.</div>`}
      ${ownedCount ? '' : `<div class="notice" style="margin:8px 0 0">가진 옷을 알려 주면 그 옷을 살린 코디로 바꿔 드려요. <button class="link" data-action="tab" data-tab="closet" style="text-decoration:underline">옷장 채우기</button></div>`}
    </section>
    <section class="section">
      <div class="section-head"><div><h2>${state.demo ? '예시 옷장' : '내 옷장'}에 더할 한 벌</h2><div class="sub">${ownedCount ? `${ownedLabel()}을 활용할 코디가 많은 순서예요` : `${STYLES[state.style].label} 옷장의 기본부터 골랐어요`}</div></div></div>
      ${items.length ? `<div class="list">${items.map(itemCard).join('')}</div>` : `<div class="empty"><b>추천할 아이템이 없어요</b>예산을 넓히거나 다른 상황을 골라 보세요.</div>`}
    </section>
    ${footer()}`;
}

function renderSearch() {
  const r = search(state, query);
  lastSearch = r;
  lastLooks = r.outfit ? [r.outfit] : [];
  const head = `<div class="result-head">
    <h2>${r.query.summary ? esc(r.query.summary) : `‘${esc(query)}’`}</h2>
    ${r.query.terms.length ? `<div class="terms">${r.query.terms.map((t) => `<span class="chip soft">${esc(t)}</span>`).join('')}</div>` : ''}
  </div>`;
  const notice = r.understood ? '' : `<div class="notice">아직 이해하지 못한 표현이에요. 대신 지금 ${STYLES[state.style].label} 스타일에 맞는 아이템을 보여 드릴게요.<div class="suggest">${EXAMPLES[state.gender].map((e) => `<button class="chip" data-action="example" data-q="${esc(e)}">${esc(e)}</button>`).join('')}</div></div>`;
  const outfit = r.outfit ? `<section class="section"><div class="section-head"><div><h2>이렇게 입어 보세요</h2><div class="sub">${esc(lookTitle(r.outfit))}</div></div></div>${lookCard(r.outfit, 0, { wide: true })}</section>` : '';
  const items = r.items.length
    ? `<section class="section"><div class="section-head"><div><h2>추천 아이템 ${r.items.length}개</h2><div class="sub">${SEASON_LABEL[r.season]} 기준 · 평점과 후기 수를 함께 봤어요</div></div></div><div class="grid">${r.items.map(gridCard).join('')}</div></section>`
    : `<div class="empty"><b>조건에 맞는 상품이 없어요</b>예산을 조금 넓히거나 다른 표현으로 찾아보세요.</div>`;
  return head + notice + outfit + items + footer();
}

function renderCloset() {
  const mine = SLOTS.filter((s) => s.g === state.gender);
  const owned = ownedGarments(state).filter((garment) => garment.gender === state.gender);
  const ownButton = (s) => `<button class="own" data-action="toggle-own" data-slot="${s.id}" aria-pressed="${state.owned.includes(s.id)}"><i class="tick">${ICON.check}</i><div class="art">${garmentSvg(s)}</div><span>${esc(s.name)}</span></button>`;
  const groups = Object.entries(CATS)
    .map(([cat, label]) => [label, mine.filter((s) => s.cat === cat && !state.owned.includes(s.id))])
    .filter(([, list]) => list.length);
  return `<section class="section">
    <h2>${state.demo ? '예시 옷장' : '내 옷장'} · ${owned.length}벌</h2>
    <div class="sub">${state.demo ? '체험용 옷이에요. 내 옷을 추가하면 실제 옷장으로 바뀌어요.' : '한 벌만 있어도 시작할 수 있어요. 종류만 골라도 저장돼요.'}</div>
    <button class="btn add-garment" data-action="add-garment">옷 한 벌 추가</button>
    ${owned.length ? `<div class="closet-grid owned-grid">${owned.map((garment) => state.demo ? ownButton(SLOT_BY_ID[garment.slotId]) : `<button class="own garment-card" data-action="edit-garment" data-id="${esc(garment.id)}"><div class="garment-thumb">${garmentArt(garment)}</div><span>${esc(garmentLabel(garment))}</span><small>${garment.photoId ? '내 사진' : '사진 없음'} · 종류 기준</small></button>`).join('')}</div>` : ''}
    <details class="closet-add" ${closetPickerOpen ? 'open' : ''}><summary>기존 종류 목록에서 고르기</summary>
    ${groups.map(([label, list]) => `<div class="closet-group"><h3>${label}</h3><div class="closet-grid">
      ${list.map(ownButton).join('')}
    </div></div>`).join('')}
    </details>
    <div class="closet-actions"><button class="btn" data-action="tab" data-tab="home">이 옷장으로 추천 보기</button><button class="link" data-action="open-profile">취향·백업 관리</button></div>
  </section>`;
}

function renderSaved() {
  const list = state.saved.map((id) => PRODUCT_BY_ID[id]).filter(Boolean);
  if (!list.length) return `<section class="section"><h2>찜</h2><div class="empty"><b>아직 찜한 아이템이 없어요</b>마음에 드는 상품의 ♡를 눌러 모아 두세요.</div></section>`;
  const total = list.reduce((s, p) => s + p.price, 0);
  return `<section class="section">
    <h2>찜</h2><div class="sub">구매는 각 상품의 판매 페이지에서 해요.</div>
    <div class="list" style="margin-top:14px">${list.map((p) => itemCard({ slot: SLOT_BY_ID[p.slot], product: p, reasons: [SLOT_BY_ID[p.slot].why] })).join('')}</div>
    <div class="total"><span>찜한 ${list.length}개</span><b>${formatPrice(total)}</b></div>
  </section>`;
}

function footer() {
  return `<p class="footer">상품명·가격·평점은 ${esc(CATALOG.store)} 판매 페이지에서 ${esc(CATALOG.checkedLabel)}에 확인한 값이에요. 할인·쿠폰·재고에 따라 달라질 수 있으니 구매 전에 판매 페이지에서 확인해 주세요. 내 옷장과 찜 목록은 이 기기에만 저장돼요.</p>`;
}

function nav() {
  const tabs = [
    ['home', '추천', ICON.sparkle, 0],
    ['closet', '내 옷장', ICON.hanger, ownedGarments(state).filter((garment) => garment.gender === state.gender).length],
    ['saved', '찜', ICON.heart, state.saved.length],
  ];
  return `<nav class="nav" aria-label="주요 메뉴"><div class="nav-inner">${tabs.map(([k, label, icon, n]) => `<button data-action="tab" data-tab="${k}" aria-current="${state.tab === k ? 'page' : 'false'}">${icon}${label}${n ? `<span class="count">${n}</span>` : ''}</button>`).join('')}</div></nav>`;
}

function render() {
  if (!state.onboarded || !state.gender || !state.style) {
    $app.innerHTML = storageNotice() + renderOnboarding();
    return;
  }
  const body = state.tab === 'closet' ? renderCloset() : state.tab === 'saved' ? renderSaved() : renderHome();
  const legacyNotice = legacyPendingRaw !== null ? '<aside class="notice legacy-notice"><b>이전 버전에서 옷장이 바뀌었어요</b><p>바뀐 기록을 확인한 뒤 가져올 수 있어요.</p><button class="chip" data-action="review-legacy">바뀐 기록 보기</button></aside>' : '';
  $app.innerHTML = storageNotice() + legacyNotice + (state.tab === 'home' ? topBar() : '') + demoBanner() + `<main>${body}</main>` + nav();
}

// ── 시트
function openSheet(html, { preserveDraft = false } = {}) {
  ++sheetRevision;
  restoreDraft = null;
  legacyImportDraft = null;
  if (!$sheet.innerHTML) sheetReturnFocus = document.activeElement;
  if (!preserveDraft) clearGarmentDraft();
  $sheet.innerHTML = `<div class="scrim" data-action="close-sheet"></div><div class="sheet" role="dialog" aria-modal="true" aria-label="${preserveDraft ? '내 옷 등록' : '상세 정보'}"><div class="grabber"></div><button class="sheet-close" data-action="close-sheet" aria-label="닫기">${ICON.close}</button>${html}</div>`;
  $app.inert = true;
  document.body.style.overflow = 'hidden';
  if (!preserveDraft) $sheet.querySelector('.sheet-close')?.focus({ preventScroll: true });
}
function closeSheet() {
  if (saving) return;
  ++sheetRevision;
  clearGarmentDraft();
  restoreDraft = null;
  legacyImportDraft = null;
  $sheet.innerHTML = '';
  $app.inert = false;
  document.body.style.overflow = '';
  if (sheetReturnFocus?.isConnected) sheetReturnFocus.focus({ preventScroll: true });
}

// 사진·종류·선택 이름을 한 화면에서 편집한다. 저장 전에는 정본을 바꾸지 않는다.
function clearGarmentDraft() {
  if (garmentDraft?.preview) URL.revokeObjectURL(garmentDraft.preview);
  garmentDraft = null;
}
function editGarment(id) {
  if (!storageReady) { toast('저장소를 사용할 수 없습니다. 저장 안내를 확인해 주세요.'); return; }
  const previous = id ? state.garments.find((garment) => garment.id === id) : null;
  if (id && !previous) return;
  clearGarmentDraft();
  garmentDraft = { ...(previous || makeGarment({ kind: null, gender: state.gender })),
    before: previous ? JSON.stringify(previous) : null, asset: null, preview: null,
    processing: false, photoToken: 0, error: '', nameOpen: !!previous?.label,
    moreOpen: !!previous && GARMENT_KINDS.findIndex((kind) => kind.id === previous.kind) >= 8 };
  renderGarmentEditor();
  $sheet.querySelector('.sheet-close')?.focus({ preventScroll: true });
}
function renderGarmentEditor() {
  const draft = garmentDraft;
  if (!draft) return;
  const photo = draft.preview || photoUrls.get(draft.photoId);
  const kinds = (list) => list.map((kind) => `<button type="button" class="kind-pick" data-action="pick-kind" data-kind="${kind.id}" aria-pressed="${draft.kind === kind.id}"><span class="art">${garmentSvg({ shape: kind.id, color: '#A8AAA4' })}</span>${kind.name}</button>`).join('');
  openSheet(`<form data-action="save-garment" class="garment-editor" aria-labelledby="garment-title">
    <h2 id="garment-title" class="detail-title">${draft.before ? '내 옷 수정' : '옷 한 벌 추가'}</h2>
    <p class="sub">종류만 골라도 돼요. 사진과 이름은 선택이에요.</p>
    <div class="photo-editor">${photo ? `<img class="photo-preview" src="${esc(photo)}" alt="선택한 옷 사진">` : '<div class="photo-empty" aria-hidden="true">사진 없이도<br>등록할 수 있어요</div>'}
      <div><button type="button" class="chip photo-label" data-action="pick-photo" ${draft.processing || saving ? 'disabled' : ''}>${photo ? '사진 바꾸기' : '사진 선택'}</button><input id="garment-photo" type="file" accept="image/jpeg,image/png,image/webp" hidden aria-label="옷 사진 선택">
      ${photo ? '<button type="button" class="link" data-action="clear-photo">사진 빼기</button>' : ''}<p class="fine">사진은 이 브라우저 안에만 저장해요.<br>JPG·PNG·WebP, 25MB 이하</p></div>
    </div>
    ${draft.processing ? '<p class="photo-status" role="status">사진을 준비하고 있어요…</p>' : ''}
    <fieldset ${saving ? 'disabled' : ''}><legend>어떤 옷인가요?</legend><div class="kind-grid">${kinds(GARMENT_KINDS.slice(0, 8))}</div>
      <details class="more-kinds" ${draft.moreOpen ? 'open' : ''}><summary>다른 종류</summary><div class="kind-grid">${kinds(GARMENT_KINDS.slice(8))}</div></details>
    </fieldset>
    <details class="garment-name" ${draft.nameOpen ? 'open' : ''}><summary>이름 붙이기 · 선택</summary><label for="garment-label" class="fine">같은 종류의 옷을 구분할 이름</label><input id="garment-label" type="text" maxlength="80" placeholder="예: 자주 입는 셔츠" value="${esc(draft.label)}" ${saving ? 'disabled' : ''}></details>
    <p class="fine">등록한 종류로 코디를 제안해요. 사진의 색·브랜드·핏을 자동으로 알아내지는 않아요.</p>
    ${draft.error ? `<p class="editor-error" role="alert">${esc(draft.error)}</p>${storageError ? '<button type="button" class="chip" data-action="backup">저장된 옷장 백업 받기</button>' : ''}` : ''}
    ${storageConflict ? '<button type="button" class="chip" data-action="reload-wardrobe">입력 유지하고 최신 옷장 불러오기</button>' : ''}
    <button class="btn" type="submit" ${draft.processing || saving ? 'disabled' : ''}>${saving ? '저장 중…' : draft.error ? '다시 저장' : '저장하고 내 옷장 보기'}</button>
    ${draft.before ? '<button type="button" class="link delete-garment" data-action="delete-garment">이 옷 삭제</button>' : ''}
  </form>`, { preserveDraft: true });
}
async function chooseGarmentPhoto(file) {
  const draft = garmentDraft;
  if (!draft || !file || saving) return;
  const token = ++draft.photoToken;
  draft.processing = true; draft.error = ''; renderGarmentEditor();
  try {
    const asset = await prepareGarmentPhoto(file);
    if (garmentDraft !== draft || token !== draft.photoToken) return;
    if (draft.preview) URL.revokeObjectURL(draft.preview);
    draft.asset = asset; draft.photoId = asset.id; draft.preview = URL.createObjectURL(asset.blob);
  } catch (error) {
    if (garmentDraft === draft && token === draft.photoToken) draft.error = error.message || '사진을 읽지 못했습니다. 다른 사진을 골라 주세요.';
  } finally {
    if (garmentDraft === draft && token === draft.photoToken) { draft.processing = false; renderGarmentEditor(); }
  }
}
async function saveGarmentDraft() {
  const draft = garmentDraft;
  if (!draft || saving) return;
  if (!draft.kind || draft.processing) {
    draft.error = draft.processing ? '사진 준비가 끝나면 저장해 주세요.' : '옷 종류를 하나 골라 주세요.';
    renderGarmentEditor(); return;
  }
  if (draft.before && JSON.stringify(state.garments.find((garment) => garment.id === draft.id)) !== draft.before) {
    draft.error = '이 옷이 변경됐습니다. 창을 닫고 다시 열어 주세요.'; renderGarmentEditor(); return;
  }
  const garment = makeGarment(draft);
  const garments = state.demo ? [garment] : draft.before ? state.garments.map((row) => row.id === garment.id ? garment : row) : [...state.garments, garment];
  const save = set({ demo: false, demoSelected: [], garments, tab: 'closet' }, { assets: draft.asset ? [draft.asset] : [] });
  renderGarmentEditor();
  if (await save) { closeSheet(); toast('내 옷을 저장했어요. 이 옷으로 추천을 볼 수 있어요.'); }
  else if (garmentDraft === draft) { draft.error = storageError || '저장하지 못했습니다. 입력은 유지했어요.'; renderGarmentEditor(); }
}
function downloadFile(content, filename) {
  const url = URL.createObjectURL(content instanceof Blob ? content : new Blob([content], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename;
  document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function downloadWardrobeBackup({ recovery = false } = {}) {
  try {
    const file = recovery ? await wardrobeStore.recoveryBackup(localStorage.getItem(KEY)) : await wardrobeStore.backup();
    downloadFile(file, `eoul-${new Date().toISOString().slice(0, 10)}.${recovery ? 'eoul-recovery' : 'eoul'}`);
    toast(recovery ? '저장 원문 파일을 내려받습니다. 이 파일은 개발 지원용이며 일반 복원용이 아닙니다.' : '사진 포함 백업 파일을 내려받습니다. 파일을 보관해 주세요.');
  } catch (error) { toast(error.message || '백업 파일을 만들지 못했습니다.'); }
}
async function chooseWardrobeBackup(file) {
  if (!file || saving) return;
  if (file.size > 220000000) { toast('백업 파일이 너무 큽니다.'); return; }
  openSheet('<h2 class="detail-title">백업 확인 중</h2><p role="status">사진과 옷 기록을 확인하고 있어요. 창을 닫으면 취소합니다.</p>');
  const revision = sheetRevision;
  try {
    const draft = await parseWardrobeBackup(file);
    if (sheetRevision !== revision || saving) return;
    showRestoreConfirmation(draft);
  } catch (error) { if (sheetRevision === revision) { openSheet(`<h2 class="detail-title">백업을 읽지 못했어요</h2><p class="editor-error" role="alert">${esc(error.message || '파일을 확인해 주세요.')}</p><p>현재 옷장은 변경하지 않았습니다.</p>`); } }
}
function showRestoreConfirmation(draft, error = '') {
  openSheet(`<h2 class="detail-title">이 백업으로 복원할까요?</h2><p class="sub">내 옷 ${draft.state.garments.length}벌 · 사진 ${draft.assets.length}장 · 찜 ${draft.state.saved.length}개</p><p class="notice">이 브라우저의 현재 옷장·사진·찜·취향을 백업 내용으로 바꿉니다. 현재 자료도 필요하면 먼저 백업을 받아 주세요.</p><div class="opts"><button class="chip" data-action="backup">현재 옷장 백업 받기</button></div>${error ? `<p class="editor-error" role="alert">${esc(error)}</p>` : ''}${storageConflict ? '<button class="chip" data-action="reload-wardrobe">최신 옷장 불러오기</button>' : ''}<div class="cta"><button class="btn" data-action="restore-confirm">이 백업으로 교체</button></div>`);
  restoreDraft = draft;
}
async function reviewLegacyChanges(errorText = '') {
  const revision = sheetRevision;
  await checkLegacyChanges();
  if (sheetRevision !== revision) return;
  if (legacyPendingRaw === null) { render(); toast('이전 버전에서 추가로 바뀐 기록이 없어요.'); return; }
  try {
    const old = migrateLegacyWardrobe(legacyPendingRaw);
    const existing = state.demo ? [] : state.garments;
    const added = old.demo ? [] : old.garments.filter((garment) => !existing.some((row) => row.id === garment.id || row.slotId === garment.slotId));
    const saved = [...new Set([...state.saved, ...old.saved])];
    const raw = legacyPendingRaw, fingerprint = await legacyWardrobeFingerprint(raw);
    if (sheetRevision !== revision) return;
    openSheet(`<h2 class="detail-title">이전 기록 확인</h2><p>옷 종류 ${added.length}개 · 찜 ${saved.length - state.saved.length}개를 추가할 수 있어요.</p><p class="sub">${added.map((garment) => esc(garmentLabel(garment))).join(' · ') || '추가할 옷 종류가 없습니다.'}</p><p class="notice">현재 옷·사진·취향은 유지합니다. 이전 버전에서 삭제하거나 수정한 기록은 현재 옷장에 덮어쓰지 않습니다. 종류만 가져오므로 사진은 없어요.</p>${errorText ? `<p class="editor-error" role="alert">${esc(errorText)}</p>` : ''}${storageConflict ? '<button class="chip" data-action="reload-wardrobe">최신 옷장 불러오기</button>' : ''}<button class="chip" data-action="recovery-backup">이전 기록 원문 받기</button><div class="cta"><button class="btn" data-action="import-legacy">${added.length || saved.length > state.saved.length ? '추가 기록 가져오기' : '확인했어요'}</button></div>`);
    legacyImportDraft = { raw, fingerprint, added, saved };
  } catch (error) { openSheet(`<h2 class="detail-title">이전 기록 확인 필요</h2><p class="editor-error">${esc(error.message)}</p><button class="chip" data-action="recovery-backup">원문 받기</button>`); }
}

function itemSheet(id) {
  const p = PRODUCT_BY_ID[id];
  if (!p) return;
  const slot = SLOT_BY_ID[p.slot];
  const c = { gender: state.gender, style: state.style, occasion: state.occasion, season: seasonOf(), owned: new Set(state.owned), garments: ownedGarments(state) };
  const { reasons } = scoreSlot(slot, c);
  const alts = productsFor(slot.id).filter((x) => x.id !== p.id).slice(0, 6);
  const withLooks = recommendLooks({ ...state, budget: null }, { limit: 1, product: p });
  const look = withLooks[0];
  openSheet(`
    ${picture(p, slot, 'hero')}
    <div style="margin-top:14px" class="brand-name">${esc(p.brand)}</div>
    <h2 class="detail-title">${esc(p.name)}</h2>
    <div class="detail-price">${formatPrice(p.price)}${stars(p)}</div>
    <div class="fine">${esc(p.store)} 판매가 · ${esc(CATALOG.checkedLabel)} 확인</div>
    <div class="why"><h3>이래서 추천해요</h3><ul>
      ${[...new Set([slot.why, ...reasons])].slice(0, 3).map((r) => `<li>${esc(reasonText(r))}</li>`).join('')}
      <li>이렇게 입어요: ${esc(slot.tip)}</li>
    </ul></div>
    <p class="fine">옷 종류의 조합 공식으로 제안합니다. 상품 순서는 평점·후기 수를 참고하며, 사진의 색·소재·핏을 분석한 결과는 아닙니다.</p>
    ${look ? `<h3 class="block">이 아이템으로 만든 코디</h3>${lookRows(look)}` : ''}
    ${alts.length ? `<h3 class="block">같은 아이템, 다른 선택</h3><div class="row-scroll">${alts.map((a) => gridCard({ slot, product: a })).join('')}</div>` : ''}
    <div class="cta">
      <button class="btn secondary" data-action="save" data-id="${p.id}" aria-pressed="${state.saved.includes(p.id)}" aria-label="찜하기" style="color:${state.saved.includes(p.id) ? 'var(--heart)' : 'inherit'}">${state.saved.includes(p.id) ? ICON.heartFill : ICON.heart}</button>
      <a class="btn" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">${esc(p.store)}에서 보기 ${ICON.arrow}</a>
    </div>
    <div style="text-align:center;margin-top:6px"><button class="link" data-action="own" data-slot="${slot.id}" style="padding:10px">${state.demo ? '예시 옷장에 넣기' : state.owned.includes(slot.id) ? '이미 옷장에 있어요' : '비슷한 옷이 이미 있어요'}</button></div>
  `);
}

function lookRows(r) {
  return r.items.map((i) => i.owned
    ? `<div class="look-row"><div class="thumb">${garmentArt(i.garment)}</div><div><div class="role">${ROLE_LABEL[i.role]} · ${ownedLabel()}</div><div class="nm">${esc(garmentLabel(i.garment))}</div></div><span class="badge">${state.demo ? '예시' : '보유'}</span></div>`
    : `<button class="look-row" data-action="open-item" data-id="${i.product.id}">${picture(i.product, i.slot)}<div><div class="role">${ROLE_LABEL[i.role]} · ${esc(i.product.brand)}</div><div class="nm">${esc(i.product.name)}</div></div><span class="pr">${formatPrice(i.product.price)}</span></button>`).join('');
}

function lookSheet(index) {
  const r = lastLooks[index];
  if (!r) return;
  const buyIds = r.items.filter((i) => !i.owned).map((i) => i.product.id);
  openSheet(`
    <h2 class="detail-title" style="padding-right:48px">${esc(lookTitle(r))}</h2>
    <p class="sub" style="margin:6px 0 10px;color:var(--ink-2)">${esc(lookNote(r))}</p>
    ${lookRows(r)}
    <div class="total"><span>${r.buyCount ? `새로 살 것 ${r.buyCount}개` : `${ownedLabel()}으로 완성`}</span><b>${r.buyCount ? formatPrice(r.buyTotal) : ''}</b></div>
    ${buyIds.length ? `<div class="cta"><button class="btn" data-action="save-all" data-ids="${buyIds.join(',')}">필요한 ${buyIds.length}개 모두 찜하기</button></div>` : ''}
  `);
}

function optionSheet(kind) {
  const budgetOpts = BUDGETS.map(([v, label]) => `<button class="chip" data-action="set-budget" data-v="${v ?? ''}" aria-pressed="${state.budget === v}">${label}</button>`).join('');
  if (kind === 'budget') {
    openSheet(`<h2 class="detail-title">한 벌 예산</h2><p class="sub" style="margin-top:4px">이 가격 이하 상품만 추천해요.</p><div class="opts" style="margin-top:16px">${budgetOpts}</div>`);
    return;
  }
  openSheet(`
    <h2 class="detail-title">내 취향</h2>
    <div class="opt-group"><h3>누구의 옷</h3><div class="opts">
      <button class="chip" data-action="set-gender" data-g="M" aria-pressed="${state.gender === 'M'}">남성</button>
      <button class="chip" data-action="set-gender" data-g="F" aria-pressed="${state.gender === 'F'}">여성</button>
    </div></div>
    <div class="opt-group"><h3>스타일</h3><div class="opts">
      ${Object.entries(STYLES).map(([k, s]) => `<button class="chip" data-action="set-style" data-style="${k}" aria-pressed="${state.style === k}">${s.label} · ${s.desc}</button>`).join('')}
    </div></div>
    <div class="opt-group"><h3>한 벌 예산</h3><div class="opts">${budgetOpts}</div></div>
    <div class="opt-group"><h3>저장된 정보</h3><p class="sub">옷장·찜·취향은 이 기기의 브라우저에만 있어요.</p>
      <div class="opts"><button class="chip" data-action="backup">사진 포함 백업 받기</button><button class="chip" data-action="restore-file">백업에서 복원</button></div>
      <p class="fine">브라우저 데이터를 지우면 사진도 사라져요. 백업 파일을 보관해 주세요.</p>
      <button class="chip" data-action="reset" style="margin-top:10px">이 옷장 비우고 처음부터</button></div>
  `);
}

// ── 알림
let toastTimer;
function toast(message, undo) {
  clearTimeout(toastTimer);
  $toast.innerHTML = `<span>${esc(message)}</span>${undo ? '<button data-action="undo">되돌리기</button>' : ''}`;
  $toast.classList.add('show');
  toast.undo = undo;
  toastTimer = setTimeout(() => $toast.classList.remove('show'), 3200);
}

function refreshHearts(id) {
  const on = state.saved.includes(id);
  document.querySelectorAll(`[data-action="save"][data-id="${CSS.escape(id)}"]`).forEach((b) => {
    b.setAttribute('aria-pressed', String(on));
    b.innerHTML = on ? ICON.heartFill : ICON.heart;
    if (b.classList.contains('secondary')) b.style.color = on ? 'var(--heart)' : 'inherit';
  });
  const navCount = state.saved.length;
  const savedBtn = document.querySelector('.nav [data-tab="saved"]');
  if (savedBtn) savedBtn.innerHTML = `${ICON.heart}찜${navCount ? `<span class="count">${navCount}</span>` : ''}`;
}

async function toggleOwn(slotId, { fromItem = false } = {}) {
  const had = state.owned.includes(slotId);
  if (fromItem && had) {
    closeSheet();
    toast('이미 옷장에 있어요');
    return;
  }
  closetPickerOpen = !!document.querySelector('.closet-add')?.open;
  if (!SLOT_BY_ID[slotId]) return;
  const patch = state.demo
    ? { demoSelected: had ? state.demoSelected.filter((id) => id !== slotId) : [...state.demoSelected, slotId] }
    : { garments: [...state.garments, makeGarment({ slotId, kind: SLOT_BY_ID[slotId].shape, gender: SLOT_BY_ID[slotId].g })] };
  if (!await set(patch)) return;
  if (fromItem) {
    closeSheet();
    const name = SLOT_BY_ID[slotId].name;
    toast(`${name}${josa(name, '을', '를')} ${state.demo ? '예시 ' : ''}옷장에 넣었어요`);
  }
}

// ── 이벤트
document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const a = el.dataset.action;
  if (a === 'ask') return;
  if (saving) { toast('저장하는 중이에요. 잠시 기다려 주세요.'); return; }
  switch (a) {
    case 'start-personal':
      editGarment();
      break;
    case 'pick-gender':
      await set({ gender: el.dataset.g, style: null });
      requestAnimationFrame(() => document.querySelector('.style-pick')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
      break;
    case 'pick-style':
      await set({ style: el.dataset.style, onboarded: true, tab: 'home' });
      window.scrollTo(0, 0);
      break;
    case 'occasion':
      await set({ occasion: state.occasion === el.dataset.occ ? null : el.dataset.occ });
      break;
    case 'open-budget': optionSheet('budget'); break;
    case 'open-profile': optionSheet('profile'); break;
    case 'set-budget':
      if (await set({ budget: el.dataset.v ? Number(el.dataset.v) : null })) closeSheet();
      break;
    case 'set-gender': await set({ gender: el.dataset.g, ...(state.demo ? { demoSelected: [...DEMO_OWNED[el.dataset.g]] } : {}) }); optionSheet('profile'); break;
    case 'set-style': await set({ style: el.dataset.style }); optionSheet('profile'); break;
    case 'reset':
      if (el.dataset.armed !== '1') {
        el.dataset.armed = '1';
        el.textContent = '한 번 더 누르면 모두 지워져요';
        break;
      }
      if (await set({ ...newWardrobeState(), legacyFingerprint: state.legacyFingerprint, demo: false, demoSelected: [], onboarded: false, gender: null, style: null, tab: 'home' })) closeSheet();
      break;
    case 'clear-q': query = ''; render(); document.getElementById('ask-input')?.focus(); break;
    case 'example': query = el.dataset.q; render(); window.scrollTo(0, 0); break;
    case 'tab':
      closeSheet();
      if (el.dataset.tab === 'home' && state.tab === 'home' && query) query = '';
      await set({ tab: el.dataset.tab });
      window.scrollTo(0, 0);
      break;
    case 'open-item': e.preventDefault(); itemSheet(el.dataset.id); break;
    case 'open-look': lookSheet(Number(el.dataset.index)); break;
    case 'close-sheet': closeSheet(); break;
    case 'save': {
      e.stopPropagation();
      const id = el.dataset.id;
      const on = state.saved.includes(id);
      if (!await set({ saved: on ? state.saved.filter((x) => x !== id) : [...state.saved, id] }, { rerender: state.tab === 'saved' })) break;
      refreshHearts(id);
      if (!on) toast('찜했어요');
      break;
    }
    case 'save-all': {
      const ids = el.dataset.ids.split(',');
      if (!await set({ saved: [...new Set([...state.saved, ...ids])] }, { rerender: false })) break;
      ids.forEach(refreshHearts);
      closeSheet();
      toast(`${ids.length}개를 찜했어요`);
      break;
    }
    case 'own': await toggleOwn(el.dataset.slot, { fromItem: true }); break;
    case 'toggle-own': await toggleOwn(el.dataset.slot); break;
    case 'add-garment': editGarment(); break;
    case 'edit-garment': editGarment(el.dataset.id); break;
    case 'pick-photo': document.getElementById('garment-photo')?.click(); break;
    case 'pick-kind': if (garmentDraft) { garmentDraft.kind = el.dataset.kind; garmentDraft.slotId = null; garmentDraft.moreOpen ||= GARMENT_KINDS.findIndex((kind) => kind.id === el.dataset.kind) >= 8; renderGarmentEditor(); $sheet.querySelector(`[data-kind="${CSS.escape(el.dataset.kind)}"]`)?.focus(); } break;
    case 'clear-photo': if (garmentDraft) { ++garmentDraft.photoToken; garmentDraft.processing = false; if (garmentDraft.preview) URL.revokeObjectURL(garmentDraft.preview); garmentDraft.photoId = null; garmentDraft.asset = null; garmentDraft.preview = null; renderGarmentEditor(); } break;
    case 'delete-garment':
      if (el.dataset.armed !== '1') { el.dataset.armed = '1'; el.textContent = '한 번 더 누르면 이 옷을 지워요'; break; }
      if (garmentDraft) {
        if (await set({ garments: state.garments.filter((garment) => garment.id !== garmentDraft.id) })) closeSheet();
        else { garmentDraft.error = storageError; renderGarmentEditor(); }
      }
      break;
    case 'backup': await downloadWardrobeBackup(); break;
    case 'recovery-backup': await downloadWardrobeBackup({ recovery: true }); break;
    case 'reload-wardrobe': await reloadWardrobeKeepingDraft(); break;
    case 'restore-file': document.getElementById('wardrobe-backup-input')?.click(); break;
    case 'restore-confirm':
      if (restoreDraft) {
        const draft = restoreDraft;
        if (await set({ ...draft.state, tab: 'closet' }, { assets: draft.assets })) { await checkLegacyChanges(); closeSheet(); render(); toast('백업을 복원했어요'); }
        else showRestoreConfirmation(draft, storageError);
      }
      break;
    case 'review-legacy': await reviewLegacyChanges(); break;
    case 'import-legacy': {
      const draft = legacyImportDraft;
      if (!draft) break;
      if (localStorage.getItem(KEY) !== draft.raw) { await reviewLegacyChanges(); toast('이전 기록이 다시 바뀌었어요. 내용을 확인해 주세요.'); break; }
      const existing = state.demo ? [] : state.garments;
      const added = draft.added.filter((garment) => !existing.some((row) => row.id === garment.id || row.slotId === garment.slotId));
      if (await set({ ...(added.length ? { demo: false, demoSelected: [] } : {}), garments: [...existing, ...added], saved: [...new Set([...state.saved, ...draft.saved])], legacyFingerprint: draft.fingerprint })) { legacyPendingRaw = null; closeSheet(); render(); toast('확인한 기록을 반영했어요'); }
      else await reviewLegacyChanges(storageError);
      break;
    }
    case 'undo': toast.undo?.(); $toast.classList.remove('show'); break;
    default: break;
  }
});

document.addEventListener('submit', async (e) => {
  if (e.target.closest('form[data-action="save-garment"]')) { e.preventDefault(); await saveGarmentDraft(); return; }
  const form = e.target.closest('form[data-action="ask"]');
  if (!form) return;
  e.preventDefault();
  query = form.q.value.trim();
  form.q.blur();
  render();
  window.scrollTo(0, 0);
});

// 검색창을 비운 채 누르면 예시 요청을 보여 준다
document.addEventListener('focusin', (e) => {
  if (e.target.id === 'ask-input' && !e.target.value) document.getElementById('suggest')?.removeAttribute('hidden');
});
document.addEventListener('input', (e) => {
  if (e.target.id === 'ask-input') document.getElementById('suggest')?.toggleAttribute('hidden', !!e.target.value);
  if (e.target.id === 'garment-label' && garmentDraft) { garmentDraft.label = e.target.value; garmentDraft.nameOpen = true; }
});
document.addEventListener('change', async (e) => {
  if (e.target.id === 'garment-photo') await chooseGarmentPhoto(e.target.files?.[0]);
  if (e.target.id === 'wardrobe-backup-input') { const file = e.target.files?.[0]; e.target.value = ''; await chooseWardrobeBackup(file); }
});
document.addEventListener('focusout', (e) => {
  if (e.target.id === 'ask-input') setTimeout(() => document.getElementById('suggest')?.setAttribute('hidden', ''), 180);
});
document.addEventListener('mousedown', (e) => {
  if (e.target.closest('#suggest')) e.preventDefault();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && $sheet.innerHTML) closeSheet();
  if (e.key === 'Tab' && $sheet.innerHTML) {
    const elements = [...$sheet.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),summary')].filter((element) => element.getClientRects().length);
    const first = elements[0], last = elements.at(-1);
    if (first && e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (last && !e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
});

// 상품 사진을 못 불러오면 옷 그림으로 바꾼다
document.addEventListener('error', (e) => {
  const img = e.target;
  if (!(img instanceof HTMLImageElement) || !(img.dataset.slot || img.dataset.ownPhoto)) return;
  const garment = img.dataset.ownPhoto && state.garments.find((row) => row.id === img.dataset.ownPhoto);
  const slot = SLOT_BY_ID[img.dataset.slot] || { shape: garment?.kind || 'shirt', color: '#A8AAA4' };
  const art = document.createElement('div');
  art.className = 'art';
  art.innerHTML = garmentSvg(slot);
  img.replaceWith(art);
}, true);

render();
const appReady = bootApp();
