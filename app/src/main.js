import { SLOTS, SLOT_BY_ID, STYLES, OCCASIONS, CATS, COLORS, stylesFor } from './data/slots.js';
import { ROLE_LABEL } from './data/looks.js';
import { PRODUCTS, CATALOG } from './data/products.js';
import {
  recommendItems,
  recommendLooks,
  closetLooks,
  essentials,
  search,
  productsFor,
  scoreSlot,
  seasonOf,
  SEASON_LABEL,
  SAFE_PRODUCTS,
  formatPrice,
  josa,
  shortName,
  brandsFor,
  brandStyleAffinity,
  PRODUCT_BY_ID,
  styleScore,
} from './engine.js';
import { garmentSvg, ICON } from './icons.js';
import {
  newWardrobeState,
  wardrobeView,
  storedWardrobe,
  upgradeWardrobe,
  makeGarment,
  garmentLabel,
  garmentKindName,
  GARMENT_KINDS,
  slotForItem,
  demoGarments,
  wardrobeSlotStatus,
} from './wardrobe.js';
import { createWardrobeStore, parseWardrobeBackup, legacyWardrobeFingerprint } from './wardrobe-store.js';
import { eraseWardrobeData } from './wardrobe-erase.js';
import { prepareGarmentPhoto } from './garment-photo.js';
import { prepareLegacyWardrobe } from './legacy-photos.js';

const KEY = 'eoul:v1';
const BUDGETS = [
  [null, '예산 전체'],
  [50000, '5만원 이하'],
  [100000, '10만원 이하'],
  [200000, '20만원 이하'],
  [400000, '40만원 이하'],
];
const EXAMPLES = {
  M: ['출근용 셔츠 10만원 이하', '청바지에 어울리는 신발', '아메카지 재킷', '폴로 니트', '겨울 데이트 코트'],
  F: ['출근용 셔츠 10만원 이하', '원피스에 어울리는 신발', '겨울 코트 20만원 이하', '가성비 니트', '데이트 스커트'],
};
// Personal state and photos have one durable write path.
const wardrobeStore = createWardrobeStore();
let state = wardrobeView(newWardrobeState());
let query = '',
  obStep = 1,
  lastLooks = [],
  closetFilter = 'all',
  draft = null;
let storageRevision = 0,
  storageEpoch = null,
  storageReady = false,
  storageError = '',
  storageConflict = false,
  writeBusy = false;
let photoBlobs = new Map(),
  photos = new Map(),
  sheetRevision = 0,
  restoreDraft = null,
  pendingLegacy = null,
  legacyChanged = false;
let claudeLatestPresent = false;
let returnFocus = null;
let eraseReviewStep = 0,
  erasingAll = false,
  bootBusy = false;
function applySnapshot(snapshot) {
  for (const url of photos.values()) URL.revokeObjectURL(url);
  photoBlobs = snapshot.photos;
  photos = new Map([...snapshot.photos].map(([id, blob]) => [id, URL.createObjectURL(blob)]));
  storageRevision = snapshot.revision;
  storageEpoch = snapshot.epoch || null;
  state = wardrobeView(snapshot.state, state.tab);
}
function storageMessage(error) {
  return error?.name === 'QuotaExceededError'
    ? storageReady
      ? '저장 공간이 부족해요. 입력은 그대로 두었습니다. 백업 후 필요 없는 옷을 정리해 주세요.'
      : '원문과 복구 사본을 함께 보관할 저장 공간이 부족해요. 기존 자료는 유지했습니다. 저장 원문 파일을 받은 뒤 저장 공간을 확보해 주세요.'
    : error?.message || '저장하지 못했어요. 입력을 유지했습니다.';
}
async function bootWardrobe() {
  if (bootBusy || erasingAll) throw new Error('저장소 작업을 마무리하고 있어요. 잠시 후 다시 눌러 주세요.');
  bootBusy = true;
  try {
    claudeLatestPresent =
      localStorage.getItem('eoul:v2') !== null || localStorage.getItem('eoul:v2:unreadable') !== null;
    let current = await wardrobeStore.read();
    if (!current) {
      const raw = localStorage.getItem(KEY),
        prepared = await prepareLegacyWardrobe(raw);
      if (localStorage.getItem(KEY) !== raw) throw new Error('이전 옷장이 읽는 중 바뀌었습니다. 다시 불러와 주세요.');
      if (prepared.missing?.length) {
        pendingLegacy = { ...prepared, raw, initial: true };
        throw new Error('이전 사진 일부가 저장되지 않았습니다. 목록을 확인한 뒤 옷 기록을 가져올 수 있어요.');
      }
      await wardrobeStore.commit(prepared.state, 0, prepared.assets);
      current = await wardrobeStore.read();
    } else if (current.state.schema === 2) {
      const upgraded = upgradeWardrobe(current.state);
      await wardrobeStore.commit(upgraded, current.revision, [], current.epoch || null);
      current = { ...current, state: upgraded, revision: current.revision + 1, epoch: wardrobeStore.currentEpoch() };
    }
    applySnapshot(current);
    storageReady = true;
    storageError = '';
    storageConflict = false;
    legacyChanged = (await legacyWardrobeFingerprint(localStorage.getItem(KEY))) !== state.legacyFingerprint;
  } catch (error) {
    storageError = storageMessage(error);
    storageConflict = error.code === 'conflict';
  } finally {
    bootBusy = false;
  }
  render();
}
async function set(patch, { rerender = true, assets = [] } = {}) {
  if (Object.keys(patch).every((k) => k === 'tab')) {
    state = { ...state, ...patch };
    if (rerender) render();
    return;
  }
  if (!storageReady) throw new Error(storageError || '옷장을 불러오는 중이에요. 잠시 후 다시 저장해 주세요.');
  if (writeBusy) throw new Error('이전 저장을 마무리하고 있어요. 잠시 후 다시 눌러 주세요.');
  const { closet, tab, ...changes } = patch;
  const next = storedWardrobe({ ...state, ...changes, ...(closet ? { garments: closet } : {}) });
  writeBusy = true;
  try {
    const revision = await wardrobeStore.commit(next, storageRevision, assets, storageEpoch);
    const needed = new Set(next.garments.map((i) => i.photoId).filter(Boolean));
    const rows = new Map([...photoBlobs, ...assets.map((a) => [a.id, a.blob])].filter(([id]) => needed.has(id)));
    applySnapshot({ state: next, revision, epoch: wardrobeStore.currentEpoch(), photos: rows });
    if (tab) state.tab = tab;
    storageError = '';
    storageConflict = false;
    if (rerender) render();
  } catch (error) {
    storageError = storageMessage(error);
    storageConflict = error.code === 'conflict';
    throw error;
  } finally {
    writeBusy = false;
  }
}
function storageNotice() {
  return (
    (storageError
      ? `<section class="storage-error" role="alert"><b>저장 확인이 필요해요</b><p>${esc(storageError)}</p><button class="chip" data-action="reload-wardrobe">입력 유지하고 다시 불러오기</button><button class="chip" data-action="choose-backup">정상 백업으로 복구</button><button class="chip" data-action="recovery-backup">저장 원문 받기</button><button class="chip" data-action="erase-review">이전 자료까지 전체 삭제</button>${pendingLegacy?.initial ? '<button class="chip" data-action="review-legacy">누락 사진 확인하기</button>' : ''}</section>`
      : '') +
    (legacyChanged
      ? '<div class="notice legacy-notice">이전 버전에서 옷장이 바뀌었어요. <button class="link" data-action="review-legacy">변경 확인</button></div>'
      : '') +
    (claudeLatestPresent
      ? '<div class="notice legacy-notice">Claude 최신 버전의 기록이 별도로 있습니다. 이 미리보기로 자동 이전되지 않았으며 원본은 유지 중입니다. 최신 버전에서 백업한 자료를 보관해 주세요.</div>'
      : '')
  );
}
function demoNotice() {
  return state.demo
    ? `<div class="notice demo-notice"><b>예시 옷 ${state.closet.length}벌로 바로 체험 중</b><p>추천 흐름을 보는 예시입니다. 실제 보유 옷과 구분해요.</p><button class="btn small" data-action="add-start">내 옷으로 바꾸기</button></div>`
    : '';
}

const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const $app = document.getElementById('app');
const $sheet = document.getElementById('sheet-root');
const $toast = document.getElementById('toast');
const myStyles = () => state.styles.filter((s) => STYLES[s]?.g.includes(state.gender));
const styleLine = () => {
  const list = myStyles();
  return list.length ? `${STYLES[list[0]].short}${list.length > 1 ? ` 외 ${list.length - 1}` : ''}` : '스타일';
};
const myCloset = () => state.closet.filter((i) => i.gender === state.gender);
const hex = (c) => COLORS[c]?.hex || '#BBB';

// ── 공통 조각
function art(slot, color) {
  return `<div class="art">${garmentSvg(slot, { color: color ? hex(color) : hex(slot.colors[0]) })}</div>`;
}
function picture(product, slot, cls = 'thumb') {
  if (!product?.img) return `<div class="${cls}">${art(slot, product?.color)}</div>`;
  return `<div class="${cls}"><img src="${esc(product.img)}" alt="${esc(product.name)}" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-slot="${slot.id}" data-color="${product.color || ''}"></div>`;
}
function itemPicture(item, cls = 'thumb') {
  const slot = slotForItem(item);
  if (item.photoId && photos.has(item.photoId))
    return `<div class="${cls}"><img src="${photos.get(item.photoId)}" alt="${esc(garmentLabel(item))}" data-own-photo></div>`;
  if (item.productId && PRODUCT_BY_ID[item.productId]) return picture(PRODUCT_BY_ID[item.productId], slot, cls);
  return `<div class="${cls}">${art(slot, item.color || 'unknown')}</div>`;
}
function stars(p) {
  if (!p.rating) return '';
  return `<span class="rating">${ICON.star}${p.rating.toFixed(1)}${p.reviews ? ` (${p.reviews.toLocaleString('ko-KR')})` : ''}</span>`;
}
function heartBtn(p) {
  const on = state.saved.includes(p.id);
  return `<button class="heart" data-action="save" data-id="${p.id}" aria-pressed="${on}" aria-label="${on ? '찜 해제' : '찜하기'}">${on ? ICON.heartFill : ICON.heart}</button>`;
}
const mine = (p) => state.brands.includes(p.brand);
function brandTag(p) {
  return `<div class="brand-name">${esc(p.brand)}${mine(p) ? ' <span class="mine">내 브랜드</span>' : ''}</div>`;
}
function itemCard({ slot, product, reasons }) {
  return `<article class="item">
    <button data-action="open-item" data-id="${product.id}" aria-label="${esc(product.brand)} ${esc(product.name)} 자세히">${picture(product, slot)}</button>
    <div class="item-body">
      ${brandTag(product)}
      <button class="name" data-action="open-item" data-id="${product.id}" style="text-align:left">${esc(product.name)}</button>
      <div class="price">${formatPrice(product.price)}${stars(product)}</div>
      <div class="reason">${esc((reasons?.[0] || slot.why).replace(/^가진 /, state.demo ? '예시 ' : '가진 '))}</div>
    </div>
    ${heartBtn(product)}
  </article>`;
}
function gridCard({ slot, product, reasons }) {
  return `<article class="card">
    <button data-action="open-item" data-id="${product.id}" style="display:block;width:100%;text-align:left">
      ${picture(product, slot)}
      ${brandTag(product)}
      <div class="name">${esc(product.name)}</div>
      <div class="price">${formatPrice(product.price)}</div>
      ${reasons?.[0] ? `<div class="reason">${esc(reasons[0])}</div>` : ''}
    </button>
    ${heartBtn(product)}
  </article>`;
}
function tile(i) {
  if (i.owned) {
    const inner = i.item ? itemPicture(i.item, 'tile-in') : `<div class="tile-in">${art(i.slot, i.color)}</div>`;
    return `<div class="tile"><span class="badge">${state.demo ? '예시' : '내 옷'}</span>${inner}</div>`;
  }
  return `<div class="tile">${i.product.img ? `<img src="${esc(i.product.img)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-slot="${i.slot.id}" data-color="${i.product.color || ''}">` : art(i.slot, i.product.color)}</div>`;
}
function lookCard(r, { wide = false } = {}) {
  const index = lastLooks.push(r) - 1;
  const tiles = r.items.filter((i) => i.role !== 'acc' && i.role !== 'inner').slice(0, 4);
  return `<button class="look" data-action="open-look" data-index="${index}" ${wide ? 'style="width:100%"' : ''}>
    <div class="look-grid n${tiles.length}">${tiles.map(tile).join('')}</div>
    <div class="look-body">
      <div class="look-title">${esc(r.look.title)}</div>
      <div class="look-note">${esc(r.look.note)}</div>
      <div class="look-meta">
        <span>${r.ownedCount ? `${state.demo ? '예시 옷' : '내 옷'} ${r.ownedCount}개${r.buyCount ? ` + 새로 ${r.buyCount}개` : ''}` : `새로 ${r.buyCount}개`}</span>
        <b>${r.uncertainCount ? '옷 종류 확인 필요' : r.buyCount ? formatPrice(r.buyTotal) : state.demo ? '예시로 완성' : '가진 옷으로 완성'}</b>
      </div>
      ${r.uncertainCount ? `<p class="fine">${r.uncertainCount}벌은 세부 종류가 미확인입니다. 확인 후 구매를 판단해 주세요.${r.buyCount ? ` 후보 합계 ${formatPrice(r.buyTotal)}` : ''}</p>` : ''}
    </div>
  </button>`;
}

// ── 시작 화면: 성별 → 스타일(최대 3개) → 자주 사는 브랜드(선택)
function styleTiles(g) {
  const used = new Set();
  return stylesFor(g)
    .map((key) => {
      const s = STYLES[key];
      const others = (x) =>
        Math.max(
          ...stylesFor(g)
            .filter((k) => k !== key)
            .map((k) => x.style[k] || 0),
        );
      const picks = SLOTS.filter((x) => x.g === g && (x.style[key] || 0) >= 2 && x.cat !== 'acc' && !used.has(x.id))
        .sort((a, b) => b.style[key] - others(b) - (a.style[key] - others(a)) || b.style[key] - a.style[key])
        .map((slot) => ({ slot, product: productsFor(slot.id)[0] }))
        .filter((x) => x.product)
        .slice(0, 3);
      picks.forEach((x) => used.add(x.slot.id));
      const order = state.styles.indexOf(key);
      return `<button class="pick" data-action="toggle-style" data-style="${key}" aria-pressed="${order >= 0}">
      <div><b>${s.label}${order >= 0 ? ` <span class="order">${order + 1}</span>` : ''}</b><span>${esc(s.desc[g])}</span></div>
      <div class="mini">${picks.map((x) => `<div>${x.product.img ? `<img src="${esc(x.product.img)}" alt="" referrerpolicy="no-referrer" data-slot="${x.slot.id}">` : art(x.slot)}</div>`).join('')}</div>
    </button>`;
    })
    .join('');
}
function brandChips({ action = 'toggle-brand', limit = 40 } = {}) {
  const g = state.gender;
  const st = myStyles();
  const list = brandsFor(g)
    .map((b) => ({
      ...b,
      aff:
        st.reduce((s, k, i) => s + brandStyleAffinity(b.name, g, k) * (i ? 0.7 : 1), 0) *
        Math.log2(Math.min(b.count, 12) + 1),
    }))
    .sort((a, b) => b.aff - a.aff || b.count - a.count)
    .slice(0, limit);
  return list
    .map(
      (b) =>
        `<button class="chip" data-action="${action}" data-brand="${esc(b.name)}" aria-pressed="${state.brands.includes(b.name)}">${esc(b.name)}</button>`,
    )
    .join('');
}
function renderOnboarding() {
  const g = state.gender;
  const steps = `<div class="steps" aria-hidden="true">${[1, 2, 3].map((n) => `<i class="${n <= obStep ? 'on' : ''}"></i>`).join('')}</div>`;
  let body = '';
  if (obStep === 1 || !g) {
    body = `<p class="lead">나에게 어울리는<br>다음 한 벌을 바로 골라 드릴게요</p>
      <p class="lead-sub">가입 없이, 세 번만 고르면 실제 브랜드 상품으로 추천해요.</p>
      <div class="step"><h2>누구의 옷을 찾으세요?</h2><div class="pick2">
        <button class="pick" data-action="pick-gender" data-g="M" aria-pressed="${g === 'M'}"><b>남성 옷</b><span>셔츠·재킷·데님</span></button>
        <button class="pick" data-action="pick-gender" data-g="F" aria-pressed="${g === 'F'}"><b>여성 옷</b><span>셔츠·원피스·코트</span></button>
      </div></div>`;
  } else if (obStep === 2) {
    body = `<p class="lead">끌리는 스타일을<br>골라 주세요</p>
      <p class="lead-sub">세 개까지 고를 수 있어요. 먼저 고른 스타일을 더 많이 반영해요.</p>
      <div class="step"><div class="style-pick">${styleTiles(g)}</div></div>
      <div class="ob-cta"><button class="btn secondary small" data-action="ob-back">이전</button><button class="btn" data-action="ob-next" ${state.styles.length ? '' : 'disabled'}>다음</button></div>`;
  } else {
    body = `<p class="lead">자주 사는 브랜드가<br>있나요?</p>
      <p class="lead-sub">고른 브랜드의 상품을 먼저 추천해요. 나중에 바꿀 수 있어요.</p>
      <div class="step"><div class="opts">${brandChips()}</div></div>
      <div class="ob-cta"><button class="btn secondary small" data-action="ob-back">이전</button><button class="btn" data-action="ob-done">${state.brands.length ? `${state.brands.length}개 브랜드로 시작` : '건너뛰고 시작'}</button></div>`;
  }
  return `<div class="onboard"><div class="onboard-inner"><div class="logo">어울</div>${steps}${body}<p class="privacy">고른 내용은 이 기기에만 저장돼요.</p></div></div>`;
}

// ── 홈
function topBar() {
  const budgetLabel = BUDGETS.find(([v]) => v === state.budget)?.[1] || '예산 전체';
  return `<header class="top">
    <div class="top-row">
      <div class="brand">어울<small>다음 한 벌</small></div>
      <button class="profile-btn" data-action="open-profile">${ICON.user}${state.gender === 'F' ? '여성' : '남성'} · ${esc(styleLine())}</button>
    </div>
    <form class="ask" data-action="ask" role="search">
      ${ICON.search}
      <input id="ask-input" name="q" type="search" enterkeyhint="search" autocomplete="off" placeholder="예) ${esc(EXAMPLES[state.gender][0])}" value="${esc(query)}" aria-label="찾는 옷을 한 줄로 적어 주세요">
      ${query ? `<button type="button" class="clear" data-action="clear-q" aria-label="검색 지우기">${ICON.close}</button>` : ''}
    </form>
    <div class="suggest-pop" id="suggest" hidden><div class="sub">이렇게 물어보세요</div><div class="suggest">${EXAMPLES[state.gender].map((e) => `<button class="chip" data-action="example" data-q="${esc(e)}">${esc(e)}</button>`).join('')}</div></div>
    <div class="chips" role="group" aria-label="상황과 예산">
      ${state.brands.length ? `<button class="chip" data-action="toggle-brand-only" aria-pressed="${state.brandOnly}">내 브랜드만</button>` : ''}
      ${Object.entries(OCCASIONS)
        .map(
          ([k, v]) =>
            `<button class="chip" data-action="occasion" data-occ="${k}" aria-pressed="${state.occasion === k}">${v}</button>`,
        )
        .join('')}
      <button class="chip ghost" data-action="open-budget" aria-pressed="${!!state.budget}">${budgetLabel}${ICON.chevron}</button>
    </div>
  </header>`;
}

function myBrandRow() {
  if (!state.brands.length) return '';
  const st = myStyles();
  const season = seasonOf();
  const picks = SAFE_PRODUCTS.filter(
    (p) =>
      state.brands.includes(p.brand) &&
      SLOT_BY_ID[p.slot].g === state.gender &&
      SLOT_BY_ID[p.slot].seasons.includes(season) &&
      !p.summer &&
      (!state.budget || p.price <= state.budget) &&
      !state.closet.some((i) => i.productId === p.id),
  )
    .map((p) => ({
      p,
      s:
        styleScore(SLOT_BY_ID[p.slot], st) * 2 +
        ((p.rating || 4.4) * Math.log10((p.reviews || 0) + (p.likes || 0) / 8 + 10)) / 3,
    }))
    .sort((a, b) => b.s - a.s);
  // 한 종류가 줄을 채우지 않게 종류마다 두 개까지
  const per = {};
  const list = picks.filter(({ p }) => (per[p.slot] = (per[p.slot] || 0) + 1) <= 2).slice(0, 12);
  if (!list.length) return '';
  return `<section class="section">
    <div class="section-head"><div><h2>내 브랜드에서</h2><div class="sub">${esc(state.brands.slice(0, 3).join(' · '))}${state.brands.length > 3 ? ` 외 ${state.brands.length - 3}` : ''} · ${SEASON_LABEL[season]}에 입기 좋은 것</div></div><button class="link" data-action="open-brands">브랜드 바꾸기</button></div>
    <div class="row-scroll">${list.map(({ p }) => gridCard({ slot: SLOT_BY_ID[p.slot], product: p, reasons: [SLOT_BY_ID[p.slot].why] })).join('')}</div>
  </section>`;
}

function renderHome() {
  if (query) return renderSearch();
  const season = seasonOf();
  lastLooks = [];
  const looks = recommendLooks(state, { limit: 4 });
  const items = recommendItems(state, { limit: 8 });
  const ctxLine = [
    SEASON_LABEL[season],
    myStyles()
      .map((s) => STYLES[s].short)
      .join('·'),
    state.occasion ? OCCASIONS[state.occasion] : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const ownedCount = myCloset().length;
  return `
    <section class="section">
      <div class="section-head"><div><h2>오늘의 코디</h2><div class="sub">${esc(ctxLine)}${ownedCount ? ` · ${state.demo ? '예시 옷' : '내 옷'} ${ownedCount}벌 반영` : ''}</div></div></div>
      ${looks.length ? `<div class="looks">${looks.map((r) => lookCard(r)).join('')}</div>` : `<div class="notice">이 조건에 맞는 코디가 아직 없어요. 예산·상황·브랜드 조건을 넓혀 보세요.</div>`}
      ${ownedCount ? '' : `<div class="notice" style="margin-top:8px">가진 옷을 알려 주면 그 옷을 살린 코디로 바꿔 드려요. <button class="link" data-action="tab" data-tab="closet" style="text-decoration:underline">옷장 채우기</button></div>`}
    </section>
    ${myBrandRow()}
    <section class="section">
      <div class="section-head"><div><h2>지금 사면 좋은 아이템</h2><div class="sub">${ownedCount ? (state.demo ? '예시 옷과 연결되는 종류 순서예요' : '보유 종류와 코디 공식으로 고른 순서예요') : '고른 스타일의 기본부터 골랐어요'}${state.brandOnly ? ' · 내 브랜드만' : ''}</div></div></div>
      ${items.length ? `<div class="list">${items.map(itemCard).join('')}</div>` : `<div class="empty"><b>추천할 아이템이 없어요</b>예산을 넓히거나 "내 브랜드만"을 꺼 보세요.</div>`}
    </section>
    ${footer()}`;
}

function renderSearch() {
  const r = search(state, query);
  lastLooks = [];
  const head = `<div class="result-head">
    <h2>${r.query.summary ? esc(r.query.summary) : `‘${esc(query)}’`}</h2>
    ${r.query.terms.length ? `<div class="terms">${r.query.terms.map((t) => `<span class="chip soft">${esc(t)}</span>`).join('')}</div>` : ''}
  </div>`;
  const notice = r.understood
    ? ''
    : `<div class="notice">아직 이해하지 못한 표현이에요. 대신 고른 스타일에 맞는 아이템을 보여 드릴게요.<div class="suggest">${EXAMPLES[state.gender].map((e) => `<button class="chip" data-action="example" data-q="${esc(e)}">${esc(e)}</button>`).join('')}</div></div>`;
  const outfit = r.outfit
    ? `<section class="section"><div class="section-head"><div><h2>이렇게 입어 보세요</h2><div class="sub">${esc(r.outfit.look.title)}</div></div></div>${lookCard(r.outfit, { wide: true })}</section>`
    : '';
  const items = r.items.length
    ? `<section class="section"><div class="section-head"><div><h2>추천 아이템 ${r.items.length}개</h2><div class="sub">${r.query.priceSort === 'asc' ? '수집일 가격이 낮은 순서 · 옵션과 배송비는 판매 페이지에서 확인해요' : `${SEASON_LABEL[r.season]} 기준 · 평점과 후기 수를 함께 봤어요`}</div></div></div><div class="grid">${r.items.map(gridCard).join('')}</div></section>`
    : `<div class="empty"><b>조건에 맞는 상품이 없어요</b>예산을 조금 넓히거나 다른 표현으로 찾아보세요.</div>`;
  return head + notice + outfit + items + footer();
}

// ── 내 옷장
function renderCloset() {
  lastLooks = [];
  const items = myCloset();
  const ess = essentials(state);
  const missing = ess.filter((e) => !e.owned);
  const head = `<section class="section">
    <div class="section-head"><div><h2>내 옷장</h2><div class="sub">${
      items.length
        ? `${items.length}벌 · ${esc(
            myStyles()
              .map((s) => STYLES[s].short)
              .join('·'),
          )} 기본템 ${ess.length - missing.length}/${ess.length}`
        : '가진 옷을 넣으면 그 옷으로 코디를 짜 드려요'
    }</div></div>
      <button class="btn small" data-action="add-start">${ICON.plus}옷 넣기</button></div>
  </section>`;

  if (!items.length) {
    return `${head}<section class="section" style="padding-top:4px">
      <div class="ways">
        <button class="way" data-action="add-start">${ICON.hanger}<b>종류 골라 넣기</b><span>종류만 고르면 돼요. 사진과 색은 선택이에요</span></button>
        <button class="way" data-action="add-photo">${ICON.camera}<b>사진으로 넣기</b><span>사진은 이 기기에만 저장돼요</span></button>
        <button class="way" data-action="tab" data-tab="home">${ICON.sparkle}<b>상품에서 넣기</b><span>추천 상품을 열고 "이 상품 있어요"를 누르세요</span></button>
      </div>
    </section>${essentialSection(ess)}`;
  }

  const { ready, almost } = closetLooks(state, { limit: 3 });
  const today = `<section class="section">
    <div class="section-head"><div><h2>오늘 뭐 입지?</h2><div class="sub">${ready.length ? (state.demo ? '예시 옷만으로 만든 코디예요' : '가진 옷만으로 만든 코디예요') : '가진 옷이 조금 더 있으면 옷장만으로 코디를 짜 드려요'}</div></div></div>
    ${ready.length ? `<div class="looks">${ready.map((r) => lookCard(r)).join('')}</div>` : ''}
    ${almost.length ? `<h3 class="block">하나만 사면 완성</h3><div class="looks">${almost.map((r) => lookCard(r)).join('')}</div>` : ''}
  </section>`;

  const cats = Object.entries(CATS).filter(([cat]) => items.some((i) => slotForItem(i).cat === cat));
  const shown = items.filter((i) => closetFilter === 'all' || slotForItem(i).cat === closetFilter);
  const grid = `<section class="section">
    <div class="section-head"><div><h2>내 옷</h2></div></div>
    <div class="chips" style="padding-top:0"><button class="chip" data-action="closet-filter" data-cat="all" aria-pressed="${closetFilter === 'all'}">전체 ${items.length}</button>${cats.map(([cat, label]) => `<button class="chip" data-action="closet-filter" data-cat="${cat}" aria-pressed="${closetFilter === cat}">${label} ${items.filter((i) => slotForItem(i).cat === cat).length}</button>`).join('')}</div>
    <div class="closet-items">${shown
      .map((i) => {
        const slot = slotForItem(i);
        const p = i.productId ? PRODUCT_BY_ID[i.productId] : null;
        return `<button class="citem" data-action="open-own" data-id="${i.id}">${itemPicture(i)}<span class="cname"><i class="dot" style="background:${hex(i.color)}"></i>${esc(garmentLabel(i))}</span><span class="cbrand">${esc(p?.brand || i.brand || COLORS[i.color]?.label || '')}</span></button>`;
      })
      .join('')}</div>
  </section>`;
  return head + today + grid + essentialSection(ess);
}

function essentialSection(ess) {
  const missing = ess.filter((e) => !e.owned && !e.needsCheck);
  const uncertain = ess.some((e) => !e.owned && e.needsCheck);
  if (!missing.length && !uncertain) return '';
  return `<section class="section"><details>
    <summary>기본템 체크 · ${missing.length}종류 확인하기</summary>
    <p class="sub">${esc(
      myStyles()
        .map((s) => STYLES[s].label)
        .join('·'),
    )}의 기본 종류예요. 이미 있는 옷은 눌러서 넣을 수 있어요.</p>
    ${uncertain ? '<p class="sub">종류만 등록한 옷은 소재·무늬까지 확인되지 않아 세부 기본템 보유 수에 넣지 않았어요.</p>' : ''}
    <div class="closet-grid">${missing.map(({ slot }) => `<button class="own" data-action="add-slot" data-slot="${slot.id}">${art(slot)}<span>${esc(slot.name)}</span></button>`).join('')}</div>
  </details></section>`;
}

function renderSaved() {
  const list = state.saved.map((id) => PRODUCT_BY_ID[id]).filter(Boolean);
  const unavailable = state.saved.filter((id) => !PRODUCT_BY_ID[id]);
  const retained = unavailable.length
    ? `<div class="notice"><b>현재 목록에 없는 찜 ${unavailable.length}개도 보관 중이에요</b><p>상품 정보가 없어 추천과 합계에서 제외했어요.</p><ul>${unavailable.map((id) => `<li><a href="https://www.musinsa.com/products/${id.slice(3)}" target="_blank" rel="noopener noreferrer">상품 ${id.slice(3)} 확인</a> <button class="link" data-action="save" data-id="${id}">찜 해제</button></li>`).join('')}</ul></div>`
    : '';
  if (!list.length)
    return `<section class="section"><h2>찜</h2>${retained || '<div class="empty"><b>아직 찜한 아이템이 없어요</b>마음에 드는 상품의 ♡를 눌러 모아 두세요.</div>'}</section>`;
  const total = list.reduce((s, p) => s + p.price, 0);
  return `<section class="section">
    <h2>찜</h2><div class="sub">구매는 각 상품의 판매 페이지에서 해요.</div>${retained}
    <div class="list" style="margin-top:14px">${list.map((p) => itemCard({ slot: SLOT_BY_ID[p.slot], product: p, reasons: [SLOT_BY_ID[p.slot].why] })).join('')}</div>
    <div class="total"><span>찜한 ${list.length}개</span><b>${formatPrice(total)}</b></div>
  </section>`;
}

function footer() {
  return `<p class="footer">상품명·가격·평점은 ${esc(CATALOG.store)} 판매 페이지에서 ${esc(CATALOG.checkedLabel)}에 확인한 값이에요(상품 ${CATALOG.count}개). 할인·쿠폰·재고에 따라 달라질 수 있으니 구매 전에 판매 페이지에서 확인해 주세요. 내 옷장과 찜 목록은 이 기기에만 저장돼요.</p>`;
}

function nav() {
  const tabs = [
    ['home', '추천', ICON.sparkle, 0],
    ['closet', '내 옷장', ICON.hanger, myCloset().length],
    ['saved', '찜', ICON.heart, state.saved.length],
  ];
  return `<nav class="nav" aria-label="주요 메뉴"><div class="nav-inner">${tabs.map(([k, label, icon, n]) => `<button data-action="tab" data-tab="${k}" aria-current="${state.tab === k ? 'page' : 'false'}">${icon}${label}${n ? `<span class="count">${n}</span>` : ''}</button>`).join('')}</div></nav>`;
}

function render() {
  if (!state.onboarded || !state.gender || !myStyles().length) {
    $app.innerHTML = storageNotice() + renderOnboarding();
    return;
  }
  const body = state.tab === 'closet' ? renderCloset() : state.tab === 'saved' ? renderSaved() : renderHome();
  $app.innerHTML =
    storageNotice() + demoNotice() + (state.tab === 'home' ? topBar() : '') + `<main>${body}</main>` + nav();
}

// ── 시트
function openSheet(html) {
  sheetRevision++;
  restoreDraft = null;
  eraseReviewStep = 0;
  if (!$sheet.innerHTML) returnFocus = document.activeElement;
  $app.inert = true;
  const scroll = $sheet.querySelector('.sheet')?.scrollTop;
  $sheet.innerHTML = `<div class="scrim" data-action="close-sheet"></div><div class="sheet" role="dialog" aria-modal="true"><div class="grabber"></div><button class="sheet-close" data-action="close-sheet" aria-label="닫기">${ICON.close}</button>${html}</div>`;
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => $sheet.querySelector('button, input')?.focus());
  return scroll;
}
function closeSheet() {
  if (writeBusy || draft?.saving) return;
  sheetRevision++;
  restoreDraft = null;
  eraseReviewStep = 0;
  $app.inert = false;
  returnFocus?.focus?.();
  if (draft?.preview) URL.revokeObjectURL(draft.preview);
  $sheet.innerHTML = '';
  document.body.style.overflow = '';
  draft = null;
}

function lookRows(r) {
  return r.items
    .map((i) => {
      if (i.owned) {
        const pic = i.item ? itemPicture(i.item) : `<div class="thumb">${art(i.slot, i.color)}</div>`;
        const brand = i.item?.productId ? PRODUCT_BY_ID[i.item.productId]?.brand : i.item?.brand;
        return `<div class="look-row">${pic}<div><div class="role">${ROLE_LABEL[i.role]} · ${state.demo ? '예시 옷' : '내 옷'}${i.certainty === 'uncertain' ? ` · ${esc(shortName(i.slot))}인지 확인 필요` : ''}</div><div class="nm">${esc([COLORS[i.color]?.label, brand, i.item ? garmentLabel(i.item) : i.slot.name].filter(Boolean).join(' '))}</div></div><span class="badge">${i.certainty === 'uncertain' ? '종류 확인' : state.demo ? '예시' : '보유'}</span></div>`;
      }
      return `<button class="look-row" data-action="open-item" data-id="${i.product.id}">${picture(i.product, i.slot)}<div><div class="role">${ROLE_LABEL[i.role]} · ${esc(i.product.brand)}</div><div class="nm">${esc(i.product.name)}</div></div><span class="pr">${formatPrice(i.product.price)}</span></button>`;
    })
    .join('');
}

function itemSheet(id) {
  const p = PRODUCT_BY_ID[id];
  if (!p) return;
  const slot = SLOT_BY_ID[p.slot];
  const productGender = slot.g;
  const compatibleStyles = state.styles.filter((k) => STYLES[k]?.g.includes(productGender));
  const productStyles = compatibleStyles.length ? compatibleStyles : stylesFor(productGender).slice(0, 1);
  const productCloset = state.closet.filter((i) => i.gender === productGender);
  const c = {
    gender: productGender,
    styles: productStyles,
    occasion: state.occasion,
    season: seasonOf(),
    closet: productCloset,
    ownedSlots: new Set(productCloset.map((i) => i.slot)),
  };
  const { reasons } = scoreSlot(slot, c);
  const alts = productsFor(slot.id)
    .filter((x) => x.id !== p.id)
    .slice(0, 8);
  const sameBrand = SAFE_PRODUCTS.filter(
    (x) => x.brand === p.brand && x.id !== p.id && SLOT_BY_ID[x.slot].g === productGender && x.slot !== p.slot,
  ).slice(0, 8);
  const look = recommendLooks(
    { ...state, gender: productGender, styles: productStyles, budget: null },
    { limit: 1, occasion: null, pinnedProduct: p },
  )[0];
  const owned = state.closet.some((i) => i.productId === p.id);
  const needsCheck =
    wardrobeSlotStatus(
      state.closet.filter((i) => i.gender === slot.g),
      slot,
    ) === 'uncertain';
  lastLooks = look ? [look] : [];
  openSheet(`
    ${picture(p, slot, 'hero')}
    <div style="margin-top:14px">${brandTag(p)}</div>
    <h2 class="detail-title">${esc(p.name)}</h2>
    <div class="detail-price">${formatPrice(p.price)}${stars(p)}</div>
    <div class="fine">${esc(p.store)} 판매가 · ${esc(p.checkedAt)} 확인${p.color ? ` · ${COLORS[p.color]?.label || ''} (${p.colorSource === 'image' ? '상품 사진 추정' : '상품명·편집 분류'})` : ''}</div>
    ${needsCheck ? `<p class="notice">비슷한 종류의 내 옷이 있어요. ${esc(shortName(slot))}인지 확인한 뒤 추가 구매를 판단해 주세요.</p>` : ''}
    <div class="why"><h3>종류·스타일 규칙에 따른 추천</h3><ul>
      ${[...new Set([slot.why, ...reasons])]
        .slice(0, 3)
        .map((r) => `<li>${esc(r.replace(/^가진 /, state.demo ? '예시 ' : '가진 '))}</li>`)
        .join('')}
      <li>이렇게 입어요: ${esc(slot.tip)}</li><li>평점·후기·좋아요는 인기 기준입니다. 실제 색·사이즈·핏을 보장하지 않아요.</li>
    </ul></div>
    ${look ? `<h3 class="block">이 상품으로 만든 코디</h3>${lookRows(look)}` : ''}
    ${alts.length ? `<h3 class="block">같은 종류, 다른 선택</h3><div class="row-scroll">${alts.map((a) => gridCard({ slot, product: a })).join('')}</div>` : ''}
    ${sameBrand.length ? `<h3 class="block">${esc(p.brand)}의 다른 아이템</h3><div class="row-scroll">${sameBrand.map((a) => gridCard({ slot: SLOT_BY_ID[a.slot], product: a })).join('')}</div>` : ''}
    <div class="cta">
      <button class="btn secondary" data-action="save" data-id="${p.id}" aria-pressed="${state.saved.includes(p.id)}" aria-label="찜하기" style="color:${state.saved.includes(p.id) ? 'var(--heart)' : 'inherit'}">${state.saved.includes(p.id) ? ICON.heartFill : ICON.heart}</button>
      <a class="btn" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">${esc(p.store)}에서 보기 ${ICON.arrow}</a>
    </div>
    <div class="sheet-links">
      <button class="link" data-action="own-product" data-id="${p.id}" ${owned ? 'disabled' : ''}>${owned ? '옷장에 있는 상품이에요' : '이 상품 있어요'}</button>
      <button class="link" data-action="add-slot" data-slot="${slot.id}">비슷한 옷이 있어요</button>
    </div>
  `);
}

function lookSheet(index) {
  const r = lastLooks[index];
  if (!r) return;
  const buyIds = r.items.filter((i) => !i.owned).map((i) => i.product.id);
  openSheet(`
    <h2 class="detail-title" style="padding-right:48px">${esc(r.look.title)}</h2>
    <p class="sub" style="margin:6px 0 10px;color:var(--ink-2)">${esc(r.look.note)}</p>
    ${lookRows(r)}
    ${r.uncertainCount ? `<p class="notice">${r.uncertainCount}벌의 세부 종류를 확인해야 이 코디를 확정할 수 있어요. 확인 전에는 새 옷이 꼭 필요한지 판단하지 않습니다.</p>` : ''}
    <div class="total"><span>${r.uncertainCount ? `종류 확인 필요${r.buyCount ? ` · 구매 후보 ${r.buyCount}개` : ''}` : r.buyCount ? `새로 살 것 ${r.buyCount}개` : state.demo ? '예시로 완성' : '가진 옷으로 완성'}</span><b>${r.buyCount ? formatPrice(r.buyTotal) : ''}</b></div>
    ${buyIds.length ? `<div class="cta"><button class="btn" data-action="save-all" data-ids="${buyIds.join(',')}">필요한 ${buyIds.length}개 모두 찜하기</button></div>` : ''}
  `);
}

// 내 옷 한 벌
function ownSheet(id) {
  const item = state.closet.find((i) => i.id === id);
  if (!item) return;
  const slot = slotForItem(item);
  const p = item.productId ? PRODUCT_BY_ID[item.productId] : null;
  const looks = recommendLooks(
    { ...state, budget: null, occasion: null },
    { limit: 2, occasion: null, anchorItem: item },
  );
  lastLooks = [];
  openSheet(`
    ${itemPicture(item, 'hero')}
    <div class="brand-name" style="margin-top:14px">${esc(p?.brand || item.brand || '브랜드 미입력')}</div>
    <h2 class="detail-title">${esc(item.label || p?.name || garmentLabel(item))}</h2>
    ${item.photoMissing ? '<p class="notice">이전 버전에서 사진이 저장되지 않았던 옷이에요. 사진을 다시 골라 주세요.</p>' : ''}<div class="fine">${esc(garmentLabel(item))} · ${esc(COLORS[item.color]?.label || '색 미확인')}</div>
    <div class="why"><h3>이렇게 입어요</h3><ul><li>${esc(slot.tip)}</li></ul></div>
    ${looks.length ? `<h3 class="block">이 옷으로 만든 코디</h3><div class="looks">${looks.map((r) => lookCard(r)).join('')}</div>` : '<p class="sub">이 옷이 들어가는 코디 공식이 아직 없어요.</p>'}
    <div class="sheet-links">
      ${p ? `<a class="link" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">판매 페이지</a>` : ''}
      <button class="link" data-action="search-with" data-id="${item.id}">이 옷에 어울리는 아이템 찾기</button>
      <button class="link" data-action="edit-own" data-id="${item.id}">옷 정보 수정</button>
      <button class="link danger" data-action="remove-own" data-id="${item.id}">옷장에서 빼기</button>
    </div>
  `);
}

// Required: kind. Color, brand, photo and name remain optional.
function beginDraft(item = null, slot = null) {
  if (draft?.preview) URL.revokeObjectURL(draft.preview);
  const base = item || makeGarment({ kind: slot ? SLOT_BY_ID[slot].shape : null, slot, gender: state.gender });
  draft = {
    ...structuredClone(base),
    before: item ? JSON.stringify(item) : null,
    asset: null,
    preview: null,
    processing: false,
    saving: false,
    token: 0,
    error: '',
  };
  addSheet();
}
function addSheet() {
  if (!draft) return;
  const selected = slotForItem(draft);
  const kinds = GARMENT_KINDS.filter((k) => SLOTS.some((s) => s.g === state.gender && s.shape === k.id));
  const kindButton = (k) =>
    `<button class="kind-pick" data-action="draft-kind" data-kind="${k.id}" aria-pressed="${draft.kind === k.id}">${art(SLOTS.find((s) => s.g === state.gender && s.shape === k.id))}<span>${k.name}</span></button>`;
  const photo = draft.preview || photos.get(draft.photoId);
  const specificKinds = SLOTS.filter((s) => s.g === draft.gender && s.shape === draft.kind);
  openSheet(`<div class="garment-editor"><h2 class="detail-title">${draft.before ? '내 옷 수정' : '옷 한 벌 추가'}</h2><p class="sub">종류만 고르면 저장할 수 있어요.</p>
 <div class="photo-editor">${photo ? `<img class="photo-preview" src="${photo}" alt="내 옷 사진">` : '<div class="photo-empty">사진은 선택</div>'}<div><button class="chip" data-action="add-photo">${photo ? '사진 바꾸기' : '사진 고르기'}</button>${photo ? '<button class="link" data-action="clear-photo">사진 빼기</button>' : ''}</div></div>
 ${draft.photoMissing ? '<p class="notice">이전 버전에서 사진이 저장되지 않았던 옷이에요. 다시 고를 수 있습니다.</p>' : ''}
 <fieldset><legend>어떤 옷인가요?</legend><div class="kind-grid">${kinds.slice(0, 8).map(kindButton).join('')}</div><details class="more-kinds"><summary>다른 종류</summary><div class="kind-grid">${kinds.slice(8).map(kindButton).join('')}</div></details></fieldset>
 ${specificKinds.length ? `<details class="garment-name"><summary>세부 종류 확인 (선택)${draft.slot ? ` · ${esc(shortName(selected))}` : ''}</summary><p class="sub">모르면 종류만 저장해도 돼요. 소재·형태가 맞는 경우에만 확인해 주세요.</p><div class="opts"><button class="chip" data-action="draft-slot" data-slot="" aria-pressed="${!draft.slot}">아직 모름</button>${specificKinds.map((s) => `<button class="chip" data-action="draft-slot" data-slot="${s.id}" aria-pressed="${draft.slot === s.id}">${esc(s.name)}</button>`).join('')}</div></details>` : ''}
 <details class="garment-name"><summary>색·브랜드·이름 추가 (선택)</summary><label for="garment-label">내가 부를 이름</label><input id="garment-label" maxlength="80" value="${esc(draft.label)}"><label for="garment-brand">브랜드</label><input id="garment-brand" maxlength="120" value="${esc(draft.brand || '')}"><p class="sub">사진만으로 색·브랜드를 확정하지 않아요.</p><div class="swatches"><button class="chip" data-action="draft-color" data-color="" aria-pressed="${draft.color === null}">색 모름</button>${Object.entries(
   COLORS,
 )
   .map(
     ([id, c]) =>
       `<button class="sw" data-action="draft-color" data-color="${id}" aria-label="${c.label}" aria-pressed="${draft.color === id}"><i style="background:${c.hex}"></i></button>`,
   )
   .join('')}</div></details>
 ${draft.processing ? '<p role="status">사진 준비 중…</p>' : ''}${draft.error ? `<p class="editor-error" role="alert">${esc(draft.error)}</p><button class="chip" data-action="reload-wardrobe">입력 유지하고 최신 옷장 불러오기</button>` : ''}
 <div class="cta"><button class="btn" data-action="draft-save" ${!draft.kind || draft.processing || draft.saving ? 'disabled' : ''}>${draft.saving ? '저장 중…' : '옷장에 저장'}</button></div></div>`);
}
async function chooseGarmentPhoto(file) {
  if (!draft) beginDraft();
  const current = draft,
    token = ++current.token;
  current.processing = true;
  current.error = '';
  addSheet();
  try {
    const asset = await prepareGarmentPhoto(file);
    if (draft !== current || current.token !== token) return;
    if (current.preview) URL.revokeObjectURL(current.preview);
    current.asset = asset;
    current.photoId = asset.id;
    current.photoMissing = false;
    current.preview = URL.createObjectURL(asset.blob);
  } catch (error) {
    if (draft === current && current.token === token) current.error = storageMessage(error);
  } finally {
    if (draft === current && current.token === token) {
      current.processing = false;
      addSheet();
    }
  }
}
async function saveGarmentDraft() {
  const current = draft;
  if (!current || !current.kind || current.processing || current.saving) return;
  current.saving = true;
  current.error = '';
  addSheet();
  try {
    const actual = state.demo ? [] : state.garments;
    const existing = actual.find((i) => i.id === current.id);
    if (current.before && JSON.stringify(existing) !== current.before)
      throw new Error('이 옷이 다른 화면에서 바뀌었어요. 최신 옷 정보를 다시 열어 확인해 주세요.');
    const item = makeGarment(current);
    item.photoMissing = !!current.photoMissing;
    await set(
      { demo: false, demoSelected: [], garments: [...actual.filter((i) => i.id !== item.id), item], tab: 'closet' },
      { assets: current.asset ? [current.asset] : [] },
    );
    current.saving = false;
    closeSheet();
    toast('내 옷을 저장했어요');
  } catch (error) {
    current.error = storageMessage(error);
    current.saving = false;
    render();
    addSheet();
  }
}

function optionSheet(kind) {
  const budgetOpts = BUDGETS.map(
    ([v, label]) =>
      `<button class="chip" data-action="set-budget" data-v="${v ?? ''}" aria-pressed="${state.budget === v}">${label}</button>`,
  ).join('');
  if (kind === 'budget') {
    openSheet(
      `<h2 class="detail-title">한 벌 예산</h2><p class="sub" style="margin-top:4px">이 가격 이하 상품만 추천해요.</p><div class="opts" style="margin-top:16px">${budgetOpts}</div>`,
    );
    return;
  }
  if (kind === 'brands') {
    openSheet(`<h2 class="detail-title">자주 사는 브랜드</h2><p class="sub" style="margin-top:4px">고른 브랜드를 먼저 추천해요. 고른 스타일과 가까운 순서예요.</p>
      <div class="opts" style="margin-top:16px">${brandChips({ action: 'toggle-brand-sheet', limit: 80 })}</div>
      <p class="sub" style="margin-top:16px">찾는 브랜드가 없으면 알려 주세요. 상품을 더 모아 넣을게요.</p>`);
    return;
  }
  openSheet(`
    <h2 class="detail-title">내 취향</h2>
    <div class="opt-group"><h3>누구의 옷</h3><div class="opts">
      <button class="chip" data-action="set-gender" data-g="M" aria-pressed="${state.gender === 'M'}">남성</button>
      <button class="chip" data-action="set-gender" data-g="F" aria-pressed="${state.gender === 'F'}">여성</button>
    </div></div>
    <div class="opt-group"><h3>스타일 <span class="sub">(세 개까지, 먼저 고른 순서대로 반영)</span></h3><div class="opts">
      ${[...myStyles(), ...stylesFor(state.gender).filter((k) => !state.styles.includes(k))]
        .map((k) => {
          const n = state.styles.indexOf(k);
          return `<button class="chip" data-action="profile-style" data-style="${k}" aria-pressed="${n >= 0}">${n >= 0 ? `${n + 1}. ` : ''}${STYLES[k].label}</button>`;
        })
        .join('')}
    </div></div>
    <div class="opt-group"><h3>자주 사는 브랜드</h3><div class="opts">
      ${state.brands.map((b) => `<span class="chip" aria-pressed="true">${esc(b)}</span>`).join('')}
      <button class="chip ghost" data-action="open-brands">${state.brands.length ? '바꾸기' : '고르기'}</button>
    </div>
    ${state.brands.length ? `<label class="toggle"><input type="checkbox" id="brand-only" data-action="toggle-brand-only-box" ${state.brandOnly ? 'checked' : ''}> 내 브랜드 상품만 추천</label>` : ''}</div>
    <div class="opt-group"><h3>한 벌 예산</h3><div class="opts">${budgetOpts}</div></div>
    <div class="opt-group"><h3>저장된 정보</h3><p class="sub">옷장·사진·찜·취향은 이 브라우저에 저장돼요. 다른 기기에서는 백업 파일로 옮길 수 있습니다.</p>
      <button class="chip" data-action="backup">사진 포함 백업</button><button class="chip" data-action="choose-backup">백업 가져오기</button><button class="chip" data-action="recovery-backup">저장 원문 받기</button><p class="sub">현재 옷장을 비워도 이전 버전의 자료와 복구용 사본은 유지됩니다.</p><button class="chip" data-action="reset" style="margin-top:10px">현재 옷장 비우기</button><button class="chip" data-action="erase-review">이전 자료까지 전체 삭제</button></div>
  `);
}

// ── 알림
function showEraseReview(step = 1) {
  openSheet(
    `<h2>이전 자료까지 전체 삭제</h2><p>이 브라우저의 현재·이전 옷장, 사진, 찜, 취향, 복구용 사본을 삭제합니다. 다른 앱의 자료는 유지합니다.</p><p class="notice">되돌릴 수 없어요. 현재 옷장은 아래에서, 이전 버전 자료는 해당 버전에서 먼저 백업해 주세요. 다른 옷장 탭을 모두 닫아 주세요. 내려받은 백업 파일은 별도로 지워야 합니다.</p><button class="chip" data-action="backup">현재 옷장 사진 포함 백업</button><button class="chip" data-action="recovery-backup">현재 저장 원문 받기</button><p>${step === 2 ? '삭제 범위를 확인했습니다. 마지막 버튼을 누르면 삭제를 시작합니다.' : '범위를 확인한 뒤 한 번 더 확인합니다.'}</p><button class="btn" data-action="${step === 2 ? 'erase-execute' : 'erase-confirm'}">${step === 2 ? '확인한 옷장 자료 영구 삭제' : '삭제 범위 확인 후 계속'}</button>`,
  );
  eraseReviewStep = step;
}
function eraseFailureNotice(result) {
  const labels = {
    'eoul-wardrobe-v2': '현재 옷장·사진·복구 사본',
    eoul: '이전 사진',
    'eoul:v1': '이전 옷장·찜·취향',
    'eoul:v2': 'Claude 최신 옷장·찜·취향',
    'eoul:v2:unreadable': 'Claude 최신 저장 원문 사본',
  };
  const entries = [
    ...(result?.databases || []),
    ...(result?.localStorageEntries || (result?.localStorage ? [result.localStorage] : [])),
  ];
  return entries
    .map(
      (entry) =>
        `<p><b>${labels[entry.name || entry.key] || '옷장 자료'}</b>: ${['cleared', 'removed', 'absent'].includes(entry.status) ? '삭제 완료 또는 자료 없음' : entry.status === 'uncertain' ? '완료 여부 확인 필요' : '보존 또는 아직 시작하지 않음'}${entry.reason ? ` · ${esc(entry.reason)}` : ''}</p>`,
    )
    .join('');
}
async function eraseAllWardrobe() {
  if (eraseReviewStep !== 2) return;
  if (writeBusy || bootBusy)
    throw new Error('저장소 작업을 마무리하고 있어요. 완료 후 삭제 범위를 다시 확인해 주세요.');
  eraseReviewStep = 0;
  sheetRevision++;
  writeBusy = true;
  erasingAll = true;
  storageReady = false;
  wardrobeStore.close();
  $sheet.innerHTML =
    '<div class="sheet" role="dialog" aria-modal="true"><h2>확인한 옷장 자료 삭제 중</h2><p role="status">완료를 확인할 때까지 기다려 주세요.</p></div>';
  let failureResult = null;
  try {
    await eraseWardrobeData();
    for (const url of photos.values()) URL.revokeObjectURL(url);
    if (draft?.preview) URL.revokeObjectURL(draft.preview);
    photoBlobs = new Map();
    photos = new Map();
    draft = null;
    restoreDraft = null;
    pendingLegacy = null;
    legacyChanged = false;
    query = '';
    lastLooks = [];
    state = wardrobeView(newWardrobeState());
    storageRevision = 0;
    storageEpoch = null;
    storageError = '';
    storageConflict = false;
  } catch (error) {
    failureResult = error.result || {};
    storageError =
      '전체 삭제를 완료하지 못했습니다. 아래 범위를 확인해 주세요. 다시 불러오면 남아 있는 이전 자료가 표시될 수 있습니다.';
    // Removed records must not remain usable in this tab after partial success.
    for (const url of photos.values()) URL.revokeObjectURL(url);
    if (draft?.preview) URL.revokeObjectURL(draft.preview);
    photoBlobs = new Map();
    photos = new Map();
    draft = null;
    pendingLegacy = null;
    legacyChanged = false;
    state = wardrobeView(newWardrobeState());
  } finally {
    writeBusy = false;
    erasingAll = false;
  }
  if (failureResult) {
    render();
    openSheet(
      `<h2>전체 삭제 미완료</h2><p role="alert">${esc(storageError)}</p>${eraseFailureNotice(failureResult)}<button class="chip" data-action="erase-review">범위를 다시 확인하고 재시도</button><button class="chip" data-action="recovery-backup">남은 저장 원문 받기</button>`,
    );
    return;
  }
  closeSheet();
  await bootWardrobe();
  toast(
    storageReady
      ? '현재·이전 옷장과 사진·복구 사본을 삭제했어요'
      : '옷장 자료 삭제는 완료했지만 새 옷장을 불러오지 못했어요',
  );
}
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
  const savedBtn = document.querySelector('.nav [data-tab="saved"]');
  if (savedBtn)
    savedBtn.innerHTML = `${ICON.heart}찜${state.saved.length ? `<span class="count">${state.saved.length}</span>` : ''}`;
}

function downloadWardrobe(blob, name) {
  const url = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
async function chooseWardrobeBackup(file) {
  openSheet('<h2>백업 확인 중</h2><p>현재 옷장은 그대로입니다.</p>');
  const revision = sheetRevision;
  try {
    const parsed = await parseWardrobeBackup(file);
    if (sheetRevision !== revision) return;
    parsed.state = upgradeWardrobe(parsed.state);
    if (!storageReady) {
      parsed.recovery = await wardrobeStore.recoveryState();
      parsed.legacyRaw = localStorage.getItem(KEY);
      if (sheetRevision !== revision) return;
    }
    openSheet(
      `<h2>백업으로 바꿀까요?</h2><p>개인 옷 ${parsed.state.garments.length}벌 · 사진 ${parsed.assets.length}장</p>${parsed.recovery ? `<p class="notice">${parsed.recovery.schema > 3 ? '현재 자료는 이 앱이 지원하지 않는 새 버전입니다. ' : ''}현재 자료와 사진 ${parsed.recovery.photoCount}장을 복구용 사본으로 보존한 뒤, 확인한 백업으로 교체합니다. 기존 자료를 자동 변환하거나 영구 삭제하지 않습니다. 교체 뒤에도 저장 원문 받기로 사본을 받을 수 있습니다.</p>` : '<p>현재 옷장·찜·취향을 교체합니다. 필요한 기록은 먼저 백업해 주세요.</p>'}<button class="btn" data-action="restore-backup">${parsed.recovery ? '원문을 보존하고 이 백업으로 교체' : '이 백업으로 바꾸기'}</button>`,
    );
    restoreDraft = parsed;
  } catch (error) {
    if (sheetRevision === revision)
      openSheet(`<h2>백업 확인 필요</h2><p role="alert">${esc(storageMessage(error))}</p>`);
  }
}
async function reviewLegacyChanges() {
  const raw = localStorage.getItem(KEY);
  openSheet('<h2>이전 기록 확인 중</h2>');
  const revision = sheetRevision;
  try {
    const prepared = await prepareLegacyWardrobe(raw);
    if (sheetRevision !== revision) return;
    const existing = state.demo ? [] : state.garments,
      baseline = state.legacyBaseline || { owned: [], saved: [] },
      dismissed = state.legacyDismissed;
    const added = prepared.state.demo
      ? []
      : prepared.state.garments.filter(
          (i) =>
            !baseline.owned.includes(i.id) && !dismissed.owned.includes(i.id) && !existing.some((x) => x.id === i.id),
        );
    const saved = prepared.state.saved.filter(
      (id) => !state.saved.includes(id) && !baseline.saved.includes(id) && !dismissed.saved.includes(id),
    );
    openSheet(
      `<h2>이전 기록 확인</h2><p>옷 ${added.length}벌 · 찜 ${saved.length}개를 추가할 수 있어요.</p><p>${added.map((i) => esc(garmentLabel(i))).join(' · ')}</p>${prepared.missing?.length ? `<p class="notice">사진이 저장되지 않았던 옷: ${prepared.missing.map((id) => esc(garmentLabel(prepared.state.garments.find((i) => i.id === id)))).join(' · ')}. 사진 없음 표시를 남기고 옷 정보는 가져옵니다. 원래 자료는 유지됩니다.</p>` : ''}<p class="sub">현재 사진·수정한 옷은 유지하고, 지운 기록은 되살리지 않습니다.</p><button class="btn" data-action="import-legacy">확인한 옷 가져오기</button>${storageReady ? '<button class="chip" data-action="ignore-legacy">이번 변경 건너뛰기</button>' : ''}<button class="chip" data-action="recovery-backup">원문 받기</button>`,
    );
    pendingLegacy = { ...prepared, raw, added, saved, initial: !storageReady };
  } catch (error) {
    openSheet(
      `<h2>이전 기록 확인 필요</h2><p role="alert">${esc(storageMessage(error))}</p><button class="chip" data-action="recovery-backup">원문 받기</button>`,
    );
  }
}

// ── Events: await durable writes before acknowledging or closing a draft.
document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const a = el.dataset.action;
  if (erasingAll) {
    toast('옷장 자료 삭제 완료를 확인하고 있어요');
    return;
  }
  try {
    switch (a) {
      case 'ob-gender':
        await set({ gender: el.dataset.g, styles: [], brands: [] });
        obStep = 2;
        render();
        break;
      case 'toggle-style':
      case 'profile-style': {
        const k = el.dataset.style,
          has = state.styles.includes(k);
        if (has && state.styles.length === 1 && a === 'profile-style') {
          toast('스타일은 하나 이상 골라 주세요');
          break;
        }
        if (!has && state.styles.length >= 3) {
          toast('스타일은 세 개까지 고를 수 있어요');
          break;
        }
        await set({ styles: has ? state.styles.filter((x) => x !== k) : [...state.styles, k] });
        if (a === 'profile-style') optionSheet('profile');
        break;
      }
      case 'ob-next':
        if (!state.styles.length) break;
        obStep = 3;
        render();
        break;
      case 'ob-back':
        obStep = Math.max(1, obStep - 1);
        render();
        break;
      case 'toggle-brand':
      case 'toggle-brand-sheet': {
        const b = el.dataset.brand;
        await set({ brands: state.brands.includes(b) ? state.brands.filter((x) => x !== b) : [...state.brands, b] });
        if (a === 'toggle-brand-sheet') optionSheet('brands');
        break;
      }
      case 'ob-done':
        await set({ onboarded: true, tab: 'home' });
        break;
      case 'toggle-brand-only':
        await set({ brandOnly: !state.brandOnly });
        break;
      case 'occasion':
        await set({ occasion: state.occasion === el.dataset.occ ? null : el.dataset.occ });
        break;
      case 'open-budget':
        optionSheet('budget');
        break;
      case 'open-profile':
        optionSheet('profile');
        break;
      case 'open-brands':
        optionSheet('brands');
        break;
      case 'set-budget':
        await set({ budget: el.dataset.v ? Number(el.dataset.v) : null });
        closeSheet();
        break;
      case 'set-gender':
        await set({
          gender: el.dataset.g,
          styles: stylesFor(el.dataset.g).slice(0, 1),
          brands: [],
          ...(state.demo ? { demoSelected: demoGarments(el.dataset.g) } : {}),
        });
        optionSheet('profile');
        break;
      case 'reset':
        if (el.dataset.armed !== '1') {
          el.dataset.armed = '1';
          el.textContent = '한 번 더 누르면 현재 옷장만 비워요';
          break;
        }
        await set({
          ...newWardrobeState(),
          demo: false,
          demoSelected: [],
          onboarded: false,
          gender: null,
          styles: [],
          legacyFingerprint: state.legacyFingerprint,
          legacyBaseline: state.legacyBaseline,
          legacyDismissed: {
            owned: [...new Set([...state.legacyDismissed.owned, ...state.garments.map((i) => i.id)])],
            saved: [...new Set([...state.legacyDismissed.saved, ...state.saved])],
          },
          tab: 'home',
        });
        obStep = 1;
        closeSheet();
        break;
      case 'erase-review':
        showEraseReview();
        break;
      case 'erase-confirm':
        if (eraseReviewStep === 1) showEraseReview(2);
        break;
      case 'erase-execute':
        await eraseAllWardrobe();
        break;
      case 'clear-q':
        query = '';
        render();
        break;
      case 'example':
        query = el.dataset.q;
        render();
        break;
      case 'tab':
        closeSheet();
        if (el.dataset.tab === 'home' && state.tab === 'home') query = '';
        await set({ tab: el.dataset.tab });
        window.scrollTo(0, 0);
        break;
      case 'open-item':
        e.preventDefault();
        itemSheet(el.dataset.id);
        break;
      case 'open-look':
        lookSheet(Number(el.dataset.index));
        break;
      case 'open-own':
        ownSheet(el.dataset.id);
        break;
      case 'close-sheet':
        closeSheet();
        break;
      case 'save': {
        e.stopPropagation();
        const id = el.dataset.id,
          on = state.saved.includes(id);
        await set(
          {
            saved: on ? state.saved.filter((x) => x !== id) : [...state.saved, id],
            ...(on
              ? {
                  legacyDismissed: {
                    ...state.legacyDismissed,
                    saved: [...new Set([...state.legacyDismissed.saved, id])],
                  },
                }
              : {}),
          },
          { rerender: state.tab === 'saved' },
        );
        refreshHearts(id);
        if (!on) toast('찜했어요');
        break;
      }
      case 'save-all': {
        const ids = el.dataset.ids.split(',');
        await set({ saved: [...new Set([...state.saved, ...ids])] });
        closeSheet();
        toast('필요한 상품을 찜했어요');
        break;
      }
      case 'own-product': {
        const p = PRODUCT_BY_ID[el.dataset.id];
        if (!p) break;
        if (!state.demo && state.garments.some((i) => i.productId === p.id)) {
          toast('이미 등록한 상품이에요');
          break;
        }
        const item = makeGarment({
          slot: p.slot,
          color: p.colorSource === 'image' ? null : p.color,
          brand: p.brand,
          productId: p.id,
          gender: SLOT_BY_ID[p.slot].g,
        });
        await set({
          demo: false,
          demoSelected: [],
          garments: [...(state.demo ? [] : state.garments), item],
          gender: item.gender,
          styles: state.styles.filter((k) => STYLES[k]?.g.includes(item.gender)).length
            ? state.styles.filter((k) => STYLES[k]?.g.includes(item.gender))
            : stylesFor(item.gender).slice(0, 1),
          tab: 'closet',
        });
        closeSheet();
        toast('내 옷장에 저장했어요');
        break;
      }
      case 'edit-own': {
        const item = state.garments.find((i) => i.id === el.dataset.id);
        if (item) beginDraft(item);
        break;
      }
      case 'remove-own': {
        if (state.demo) {
          toast('예시 옷입니다. 내 옷을 추가해 시작하세요.');
          break;
        }
        if (el.dataset.armed !== '1') {
          el.dataset.armed = '1';
          el.textContent = '한 번 더 누르면 이 옷을 지워요';
          break;
        }
        await set({
          garments: state.garments.filter((i) => i.id !== el.dataset.id),
          legacyDismissed: {
            ...state.legacyDismissed,
            owned: [...new Set([...state.legacyDismissed.owned, el.dataset.id])],
          },
        });
        closeSheet();
        toast('옷을 삭제했어요');
        break;
      }
      case 'search-with': {
        const item = state.closet.find((i) => i.id === el.dataset.id);
        if (!item) break;
        const slot = slotForItem(item);
        closeSheet();
        query = `${shortName(slot)}에 어울리는 ${slot.cat === 'shoes' ? '바지' : slot.cat === 'bottom' ? '상의' : '바지'}`;
        await set({ tab: 'home' });
        break;
      }
      case 'closet-filter':
        closetFilter = el.dataset.cat;
        render();
        break;
      case 'add-start':
        beginDraft();
        break;
      case 'add-slot':
        beginDraft(null, el.dataset.slot);
        break;
      case 'add-photo':
        if (!draft) beginDraft();
        document.getElementById('photo-input')?.click();
        break;
      case 'draft-kind':
        if (draft) {
          draft.kind = el.dataset.kind;
          draft.slot = null;
          draft.productId = null;
          addSheet();
        }
        break;
      case 'draft-color':
        if (draft) {
          draft.color = el.dataset.color || null;
          addSheet();
        }
        break;
      case 'draft-slot': {
        if (!draft) break;
        const slot = SLOT_BY_ID[el.dataset.slot];
        if (el.dataset.slot && (!slot || slot.g !== draft.gender || slot.shape !== draft.kind)) break;
        draft.slot = slot?.id || null;
        if (draft.productId && PRODUCT_BY_ID[draft.productId]?.slot !== draft.slot) draft.productId = null;
        addSheet();
        break;
      }
      case 'clear-photo':
        if (draft) {
          draft.token++;
          draft.processing = false;
          if (draft.preview) URL.revokeObjectURL(draft.preview);
          draft.preview = null;
          draft.photoId = null;
          draft.asset = null;
          draft.photoMissing = false;
          addSheet();
        }
        break;
      case 'draft-save':
        await saveGarmentDraft();
        break;
      case 'reload-wardrobe':
        await bootWardrobe();
        if (draft) addSheet();
        break;
      case 'backup':
        downloadWardrobe(await wardrobeStore.backup(), 'eoul-wardrobe.eoul');
        break;
      case 'recovery-backup':
        downloadWardrobe(await wardrobeStore.recoveryBackup(localStorage.getItem(KEY)), 'eoul-wardrobe.eoul-recovery');
        break;
      case 'choose-backup':
        document.getElementById('wardrobe-backup-input')?.click();
        break;
      case 'restore-backup': {
        const saved = restoreDraft;
        if (!saved) break;
        if (saved.recovery) {
          if (writeBusy) throw new Error('이전 저장을 마무리하고 있어요. 잠시 후 다시 눌러 주세요.');
          if (localStorage.getItem(KEY) !== saved.legacyRaw)
            throw new Error('이전 자료가 바뀌었습니다. 백업을 다시 선택해 확인해 주세요.');
          writeBusy = true;
          try {
            const recovered = await wardrobeStore.recover(saved.state, saved.recovery, saved.assets, saved.legacyRaw);
            applySnapshot(recovered);
            storageReady = true;
            storageError = '';
            storageConflict = false;
            pendingLegacy = null;
            legacyChanged = (await legacyWardrobeFingerprint(saved.legacyRaw)) !== state.legacyFingerprint;
            render();
          } finally {
            writeBusy = false;
          }
        } else await set(saved.state, { assets: saved.assets });
        closeSheet();
        toast('옷장과 사진을 복원했어요');
        break;
      }
      case 'review-legacy':
        await reviewLegacyChanges();
        break;
      case 'import-legacy':
      case 'ignore-legacy': {
        const pending = pendingLegacy;
        if (!pending) break;
        if (localStorage.getItem(KEY) !== pending.raw) {
          await reviewLegacyChanges();
          break;
        }
        if (pending.initial) {
          await wardrobeStore.commit(pending.state, 0, pending.assets);
          pendingLegacy = null;
          await bootWardrobe();
        } else {
          const additions = a === 'ignore-legacy' ? [] : pending.added;
          const used = new Set(additions.map((i) => i.photoId).filter(Boolean));
          await set(
            {
              ...(additions.length
                ? { demo: false, demoSelected: [], garments: [...state.garments, ...additions] }
                : {}),
              saved: a === 'ignore-legacy' ? state.saved : [...new Set([...state.saved, ...pending.saved])],
              legacyBaseline: pending.state.legacyBaseline,
              legacyFingerprint: pending.state.legacyFingerprint,
            },
            { assets: pending.assets.filter((a) => used.has(a.id)) },
          );
        }
        pendingLegacy = null;
        legacyChanged = false;
        closeSheet();
        render();
        toast(a === 'ignore-legacy' ? '이번 변경은 건너뛰었어요' : '이전 기록을 가져왔어요');
        break;
      }
    }
  } catch (error) {
    storageError = storageMessage(error);
    render();
    if (draft) {
      draft.error = storageError;
      addSheet();
    } else toast(storageError);
  }
});
document.addEventListener('input', (e) => {
  if (!draft) return;
  if (e.target.id === 'garment-label') draft.label = e.target.value;
  if (e.target.id === 'garment-brand') draft.brand = e.target.value || null;
});
document.addEventListener('change', async (e) => {
  try {
    if (e.target.id === 'brand-only') await set({ brandOnly: e.target.checked });
    if (e.target.id === 'photo-input' && e.target.files?.[0]) {
      const file = e.target.files[0];
      e.target.value = '';
      await chooseGarmentPhoto(file);
    }
    if (e.target.id === 'wardrobe-backup-input' && e.target.files?.[0]) {
      const file = e.target.files[0];
      e.target.value = '';
      await chooseWardrobeBackup(file);
    }
  } catch (error) {
    storageError = storageMessage(error);
    render();
  }
});

document.addEventListener('submit', (e) => {
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
});
document.addEventListener('focusout', (e) => {
  if (e.target.id === 'ask-input')
    setTimeout(() => document.getElementById('suggest')?.setAttribute('hidden', ''), 180);
});
document.addEventListener('mousedown', (e) => {
  if (e.target.closest('#suggest')) e.preventDefault();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && $sheet.innerHTML) closeSheet();
  if (e.key === 'Tab' && $sheet.innerHTML) {
    const elements = [
      ...$sheet.querySelectorAll('button:not(:disabled), a[href], input, select, summary, [tabindex="0"]'),
    ].filter((el) => !el.hidden && el.getClientRects().length);
    const first = elements[0],
      last = elements[elements.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last?.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first?.focus();
    }
  }
});

// 상품 사진을 못 불러오면 옷 그림으로 바꾼다
document.addEventListener(
  'error',
  (e) => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement) || !img.dataset.slot) return;
    const slot = SLOT_BY_ID[img.dataset.slot];
    const div = document.createElement('div');
    div.className = 'art';
    div.innerHTML = garmentSvg(slot, { color: hex(img.dataset.color || slot.colors[0]) });
    img.replaceWith(div);
  },
  true,
);

render();
const appReady = bootWardrobe();
