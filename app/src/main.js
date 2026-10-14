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
  lookalike,
  exampleCloset,
} from './engine.js';
import { silhouetteSvg, ICON } from './icons.js';
import { zipStore, unzipSingle } from './zip-store.js';
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
  wardrobeSlotStatus,
} from './wardrobe.js';
import { createWardrobeStore, parseWardrobeBackup, legacyWardrobeFingerprint, journeyStorageUsage, wardrobeStateStorageUsage } from './wardrobe-store.js';
import { eraseWardrobeData, WARDROBE_ERASE_PENDING_KEY } from './wardrobe-erase.js';
import { prepareGarmentPhoto } from './garment-photo.js';
import { createPhotoRecognizer } from './photo-recognition.js';
import { suggestPhotoIdentity } from './photo-identity.js';
import { prepareLegacyWardrobe } from './legacy-photos.js';
import { candidateFromLink, candidateFromProduct, compareCandidate } from './purchase-candidate.js';
import { createPurchaseJourney, transitionPurchaseJourney, validatePurchaseCandidate } from './purchase-journey.js';

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
const previewInitialTab = typeof location !== 'undefined' && new URLSearchParams(location.search).get('view') === 'closet' ? 'closet' : 'home';
let state = wardrobeView(newWardrobeState(), previewInitialTab);
let query = '',
  searchAnchorId = null,
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
let candidateDraft = null;
let photoRecognizerFactory = () => createPhotoRecognizer();
// A deliberate first action precedes large public model downloads. This is
// session-only; it does not alter wardrobe state or claim the cache exists.
let photoAnalysisAllowed = false;
const journeyForms = new Map();
let pendingOptionChange = null, candidateGarmentReview = null;
let eraseReviewStep = 0,
  erasingAll = false,
  bootBusy = false;
function applySnapshot(snapshot) {
  const tasteDraft = tastePicking ? { gender: state.gender, styles: state.styles, brands: state.brands } : null;
  for (const url of photos.values()) URL.revokeObjectURL(url);
  photoBlobs = snapshot.photos;
  photos = new Map([...snapshot.photos].map(([id, blob]) => [id, URL.createObjectURL(blob)]));
  storageRevision = snapshot.revision;
  storageEpoch = snapshot.epoch || null;
  state = wardrobeView(snapshot.state, state.tab);
  if (tasteDraft) {
    tasteBefore = state;
    state = { ...state, ...tasteDraft };
  }
  // 예시 옷장은 지금 계절·스타일에 맞춰 화면에서만 다시 만든다(저장된 예시 목록은 그대로 둔다)
  if (state.demo && state.gender && myStyles().length) state.closet = demoFor(state.gender, myStyles());
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
    if (localStorage.getItem(WARDROBE_ERASE_PENDING_KEY) !== null) {
      pendingLegacy = null;
      throw new Error(
        '이전 전체 삭제가 끝나지 않았어요. 남은 자료를 자동으로 가져오지 않습니다. 삭제 범위를 다시 확인하고 완료해 주세요.',
      );
    }
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
    } else if (current.state.schema < 5) {
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
    storageReady = false;
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
  const usage = journeyStorageUsage(state), wholeUsage = wardrobeStateStorageUsage(state);
  return (
    (usage.warning || wholeUsage.warning ? '<div class="notice"><b>기록이 많이 쌓였어요</b><p>저장 한도에 가까워졌어요. 사진 포함 백업을 받아 두세요. 기존 자료는 자동으로 지우지 않아요.</p><button class="link" data-action="backup">사진·전체 기록 백업 받기</button></div>' : '') +
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
    ? `<div class="notice demo-notice"><b>예시 옷 ${state.closet.length}벌로 바로 체험 중</b><p>추천 흐름을 보는 예시입니다. 실제 보유 옷과 구분해요.</p><div class="demo-actions"><button class="btn small" data-action="add-start">내 옷으로 바꾸기</button><button class="btn small secondary" data-action="taste-start">내 스타일·브랜드 고르기</button></div></div>`
    : '';
}
// 예시 옷장은 고른 성별·스타일의 대표 코디에서 만든다(그 옷만으로 "오늘 뭐 입지?" 코디가 나온다)
function demoFor(gender, styles) {
  return exampleCloset({ ...state, gender, styles, closet: [] }).map(({ slot, color }, i) =>
    makeGarment({ id: `demo_${gender}_${i}`, slot, color, gender, source: 'demo' }),
  );
}
// 취향 고르기는 끝까지 고른 뒤 한 번에 저장한다(스타일이 빈 중간 상태는 저장 형식에 맞지 않는다)
let tastePicking = false,
  tasteBefore = null;

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
// 상품 사진 옆에 그림을 두지 않는다. 사진이 없으면 같은 종류·색의 상품 사진("비슷한 사진"), 그것도 없으면 색 카드.
function swatch(slot, color) {
  const c = COLORS[color];
  const style = c ? ` style="--sw:${c.hex}"` : '';
  return `<div class="swatch${c ? ((c.light ?? 50) < 55 ? ' dark' : '') : ' none'}"${style}>${silhouetteSvg(slot)}<span>${esc(shortName(slot))}</span></div>`;
}
function productImg(product, slot, alt = '', fallbackColor = product.color) {
  return `<img src="${esc(product.img)}" alt="${esc(alt)}" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-slot="${slot.id}" data-color="${fallbackColor || ''}">`;
}
function picture(product, slot, cls = 'thumb') {
  return `<div class="${cls}">${product?.img ? productImg(product, slot, product.name) : swatch(slot, product?.color)}</div>`;
}
// 종류·색만 아는 옷 (세부 종류를 확인한 옷만 사진을 빌린다. 종류만 아는 옷은 특정 상품처럼 보이지 않게 색 카드)
function slotPicture(slot, color, cls = 'thumb', brand = null) {
  const like = SLOT_BY_ID[slot.id] ? lookalike(slot.id, color, { brand }) : null;
  return `<div class="${cls}${like ? ' borrowed-photo' : ''}">${like ? productImg(like, slot, '비슷한 상품 사진 · 실제 내 옷과 다를 수 있어요', color) + '<span class="photo-caption">비슷한 상품 사진</span>' : swatch(slot, color)}</div>`;
}
// 종류를 대표하는 사진 (기본템 체크, 종류 고르기)
function typePicture(slot) {
  const p = SLOT_BY_ID[slot.id] ? productsFor(slot.id)[0] : null;
  return `<div class="type-pic">${p?.img ? productImg(p, slot) : swatch(slot, slot.colors[0])}</div>`;
}
const similarPhoto = (item) =>
  !(item.photoId && photos.has(item.photoId)) &&
  !(item.productId && PRODUCT_BY_ID[item.productId]) &&
  !!item.slot &&
  !!lookalike(item.slot, item.color, { brand: item.brand });
function itemPicture(item, cls = 'thumb') {
  const slot = slotForItem(item);
  if (item.photoId && photos.has(item.photoId))
    return `<div class="${cls}"><img src="${photos.get(item.photoId)}" alt="${esc(garmentLabel(item))}" data-own-photo="${esc(item.id)}"></div>`;
  if (item.productId && PRODUCT_BY_ID[item.productId]) return picture(PRODUCT_BY_ID[item.productId], slot, cls);
  return slotPicture(slot, item.color, cls, item.brand);
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
function itemCard({ slot, product, reasons, ownership }) {
  return `<article class="item">
    <button data-action="open-item" data-id="${product.id}" aria-label="${esc(product.brand)} ${esc(product.name)} 자세히">${picture(product, slot)}</button>
    <div class="item-body">
      ${brandTag(product)}
      <button class="name" data-action="open-item" data-id="${product.id}" style="text-align:left">${esc(product.name)}</button>
      <div class="price">${formatPrice(product.price)}${stars(product)}</div>
      <div class="reason">${esc((reasons?.[0] || slot.why).replace(/^가진 /, state.demo ? '예시 ' : '가진 '))}</div>
    ${ownership === 'missing' && !state.demo ? '<p class="fine">등록 안 된 종류 · 이미 가진 옷일 수 있어요</p>' : ''}
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
    const inner = i.item ? itemPicture(i.item, 'tile-in') : slotPicture(i.slot, i.color, 'tile-in');
    return `<div class="tile"><span class="badge">${state.demo ? '예시' : '내 옷'}</span>${inner}</div>`;
  }
  return `<div class="tile">${i.product.img ? productImg(i.product, i.slot) : swatch(i.slot, i.product.color)}</div>`;
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
        <span>${r.ownedCount ? `${state.demo ? '예시 옷' : '내 옷'} ${r.ownedCount}개${r.buyCount ? ` + 후보 ${r.buyCount}개` : ''}` : `구매 후보 ${r.buyCount}개`}</span>
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
      <div class="mini">${picks.map((x) => `<div>${x.product.img ? productImg(x.product, x.slot) : swatch(x.slot, x.product.color)}</div>`).join('')}</div>
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
        <button class="pick" data-action="ob-gender" data-g="M" aria-pressed="${g === 'M'}"><b>남성 옷</b><span>셔츠·재킷·데님</span></button>
        <button class="pick" data-action="ob-gender" data-g="F" aria-pressed="${g === 'F'}"><b>여성 옷</b><span>셔츠·원피스·코트</span></button>
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
  const later = tastePicking ? '<button class="link" data-action="taste-cancel">나중에 고르기</button>' : '';
  return `<div class="onboard"><div class="onboard-inner"><div class="logo">어울</div>${steps}${body}<p class="privacy">고른 내용은 이 기기에만 저장돼요. ${later}</p></div></div>`;
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
    <section class="section purchase-entry"><h2>살까 고민 중인 옷이 있나요?</h2><p class="sub">상품을 가져와 내 옷과 비교하고, 구매 후에도 이어서 관리해요.</p><button class="btn" data-action="candidate-start">상품 링크로 비교하기 ${ICON.arrow}</button></section>
    <section class="section">
      <div class="section-head"><div><h2>오늘의 코디</h2><div class="sub">${esc(ctxLine)}${ownedCount ? ` · ${state.demo ? '예시 옷' : '내 옷'} ${ownedCount}벌 반영` : ''}</div></div></div>
      ${looks.length ? `<div class="looks">${looks.map((r) => lookCard(r)).join('')}</div>` : `<div class="notice">이 조건에 맞는 코디가 아직 없어요. 예산·상황·브랜드 조건을 넓혀 보세요.</div>`}
      ${ownedCount ? '' : `<div class="notice" style="margin-top:8px">가진 옷을 알려 주면 그 옷을 살린 코디로 바꿔 드려요. <button class="link" data-action="tab" data-tab="closet" style="text-decoration:underline">옷장 채우기</button></div>`}
    </section>
    ${myBrandRow()}
    <section class="section">
      <div class="section-head"><div><h2>내 옷과 비교할 구매 후보</h2><div class="sub">${ownedCount ? (state.demo ? '예시 옷과 연결되는 종류 순서예요' : '등록한 옷과 코디 공식으로 고른 순서예요') : '고른 스타일의 기본부터 골랐어요'}${state.brandOnly ? ' · 내 브랜드만' : ''}</div></div></div>
      ${!state.demo ? '<p class="sub">등록하지 않은 옷이 없다는 뜻은 아니에요. 이미 비슷한 옷이 있다면 상품에서 알려 주세요.</p>' : ''}
      ${items.length ? `<div class="list">${items.map(itemCard).join('')}</div>` : `<div class="empty"><b>추천할 아이템이 없어요</b>예산을 넓히거나 "내 브랜드만"을 꺼 보세요.</div>`}
    </section>
    ${footer()}`;
}

function renderSearch() {
  const r = search(state, query, { anchorItemId: searchAnchorId });
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
    ? `<section class="section"><div class="section-head"><div><h2>추천 아이템 ${r.items.length}개</h2><div class="sub">${r.query.priceSort ? `수집일 가격이 ${r.query.priceSort === 'desc' ? '높은' : '낮은'} 순서 · 옵션과 배송비는 판매 페이지에서 확인해요` : `${SEASON_LABEL[r.season]} 기준 · 평점과 후기 수를 함께 봤어요`}</div></div></div><div class="grid">${r.items.map(gridCard).join('')}</div></section>`
    : `<div class="empty"><b>조건에 맞는 상품이 없어요</b>예산을 조금 넓히거나 다른 표현으로 찾아보세요.</div>`;
  const anchor = r.anchorItem
    ? `<div class="notice search-anchor">${itemPicture(r.anchorItem)}<div><b>이 옷을 기준으로 찾아요</b><p>${esc(garmentLabel(r.anchorItem))} · ${esc(COLORS[r.anchorItem.color]?.label || '색 미확인')}</p></div><button class="link" data-action="clear-anchor">기준 해제</button></div>`
    : r.anchorUnavailable
      ? `<div class="notice" role="status">${esc(r.anchorUnavailable)} <button class="link" data-action="tab" data-tab="closet">내 옷 다시 고르기</button></div>`
      : '';
  const qualityNotice = r.query.qualityUnavailable
    ? '<p class="notice">품질을 비교할 자료는 없어요. 가격으로 품질을 판단하지 않고 평점·후기 등 인기 정보를 참고했어요.</p>'
    : '';
  return head + anchor + notice + qualityNotice + outfit + items + footer();
}

// ── 내 옷장
function renderCloset() {
  lastLooks = [];
  const items = myCloset();
  const ess = essentials(state);
  const cats = Object.entries(CATS).filter(([cat]) => items.some((i) => slotForItem(i).cat === cat));
  if (closetFilter !== 'all' && !cats.some(([cat]) => cat === closetFilter)) closetFilter = 'all';
  const head = `<section class="section closet-toolbar">
    <div class="section-head"><div><h2>내 옷장</h2><div class="sub">${state.demo ? `예시 옷 ${items.length}벌` : `등록한 내 옷 ${items.length}벌`}</div></div>
      <button class="btn small" data-action="add-start">${ICON.plus}옷 추가</button></div>
    <div class="closet-toolbar-tabs" role="group" aria-label="옷 종류"><button data-action="closet-filter" data-cat="all" aria-pressed="${closetFilter === 'all'}">전체 <span>${items.length}</span></button>${cats.map(([cat, label]) => `<button data-action="closet-filter" data-cat="${cat}" aria-pressed="${closetFilter === cat}">${label} <span>${items.filter((i) => slotForItem(i).cat === cat).length}</span></button>`).join('')}</div>
  </section>`;
  // Registration time is not a purchase or photo capture date. Demo clothes
  // have no real registration date, and old missing dates keep their order.
  // Only garments registered in this app carry a real registration time. Migrated
  // records received a placeholder date and are shown as moved, not dated.
  const shown = items
    .map((item, index) => ({ item, index, registered: item.source === 'user' ? Date.parse(item.createdAt) : NaN }))
    .filter(({ item }) => closetFilter === 'all' || slotForItem(item).cat === closetFilter)
    .sort((a, b) => {
      const aValid = Number.isFinite(a.registered), bValid = Number.isFinite(b.registered);
      return aValid && bValid ? b.registered - a.registered || a.index - b.index
        : aValid !== bValid ? (aValid ? -1 : 1) : a.index - b.index;
    });
  const grid = `<section class="section" style="padding-top:0">
    ${!items.length ? '<p class="sub">사진이나 상품 목록에서 첫 옷을 추가해 보세요.</p>' : ''}
    <div class="closet-items">${shown.map(({ item: i, registered }) => {
      const p = i.productId ? PRODUCT_BY_ID[i.productId] : null;
      const brand = p?.brand?.trim() || i.brand?.trim() || '브랜드 미확인';
      const demo = state.demo || i.source === 'demo';
      const date = Number.isFinite(registered) ? new Date(registered) : null;
      const registration = !demo && date
        ? `등록 ${date.getFullYear()}. ${String(date.getMonth() + 1).padStart(2, '0')}. ${String(date.getDate()).padStart(2, '0')}.`
        : !demo && i.source === 'legacy' ? '이전 버전에서 옮김' : '';
      return `<button class="citem" data-action="open-own" data-id="${esc(i.id)}">${itemPicture(i)}<span class="cbrand">${esc(brand)}</span><span class="cname">${esc(garmentLabel(i))}</span>${demo ? '<span class="closet-tag">예시 옷</span>' : registration ? `<span class="cdate">${registration}</span>` : ''}</button>`;
    }).join('')}<button class="closet-add-tile" data-action="add-start"><span class="closet-add-stage">${ICON.plus}</span><span>옷 추가</span></button></div>
  </section>`;

  if (!items.length) return head + grid + essentialSection(ess);

  const { ready, almost } = closetLooks(state, { limit: 3 });
  const today = `<section class="section">
    <div class="section-head"><div><h2>오늘 뭐 입지?</h2><div class="sub">${ready.length ? (state.demo ? '예시 옷만으로 만든 코디예요' : '가진 옷만으로 만든 코디예요') : '가진 옷이 조금 더 있으면 옷장만으로 코디를 짜 드려요'}</div></div></div>
    ${ready.length ? `<div class="looks">${ready.map((r) => lookCard(r)).join('')}</div>` : ''}
    ${almost.length ? `<h3 class="block">등록한 옷에 후보 한 벌 더하기</h3><div class="looks">${almost.map((r) => lookCard(r)).join('')}</div>` : ''}
  </section>`;

  return head + grid + today + essentialSection(ess);
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
    )}의 기본 종류예요. 미등록은 미보유를 뜻하지 않아요. 이미 있는 옷은 눌러서 넣을 수 있어요.</p>
    ${uncertain ? '<p class="sub">종류만 등록한 옷은 소재·무늬까지 확인되지 않아 세부 기본템 보유 수에 넣지 않았어요.</p>' : ''}
    <div class="closet-grid">${missing.map(({ slot }) => `<button class="own" data-action="add-slot" data-slot="${slot.id}">${typePicture(slot)}<span>${esc(slot.name)}</span></button>`).join('')}</div>
  </details></section>`;
}

function renderWishlist() {
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

function renderSaved() {
  const labels = { candidate: '비교 중', ordered: '주문 기록', received: '받음 · 보유 미확정', kept: '내 옷장', returned: '반품 기록' };
  const decisions = { buy: '사기로 함', hold: '보류', skip: '안 사기로 함' };
  return `<section class="section"><div class="section-head"><div><h2>구매 여정</h2><p class="sub">고민하던 옷이 내 옷이 되기까지</p></div><button class="btn small" data-action="candidate-start">${ICON.plus}상품 가져오기</button></div>
    ${state.journeys.length ? `<div class="journey-list">${[...state.journeys].reverse().map((j) => `<button class="journey-row" data-action="open-journey" data-id="${esc(j.id)}">${candidatePicture(j.candidate)}<span><b>${esc(j.candidate.name || '가져온 상품')}</b><span>${esc(j.candidate.brand || new URL(j.candidate.url).hostname)}</span><span>${labels[j.stage]}${j.decision ? ` · ${decisions[j.decision]}` : ''}${j.wearCount ? ` · 착용 기록 ${j.wearCount}회` : ''}</span></span>${ICON.arrow}</button>`).join('')}</div>` : '<div class="empty"><b>구매 고민부터 모아 보세요</b>상품 링크나 추천 상품에서 비교를 시작할 수 있어요.</div>'}
  </section>${renderWishlist()}`;
}

// Purchase decisions are self-reports. Opening a seller page never advances a journey.
function candidatePicture(candidate, cls = 'thumb') {
  const product = candidate.source === 'catalog' && PRODUCT_BY_ID[candidate.productId];
  const slot = SLOT_BY_ID[candidate.slot];
  if (product && slot) return picture(product, slot, cls) + (cls.includes('hero') ? '<p class="fine">판매처 참고 사진 · 고른 색·옵션과 다를 수 있어요.</p>' : '');
  return `<div class="${cls} candidate-placeholder"><span>${esc(garmentKindName(candidate.kind))}</span><small>사진 없음</small></div>`;
}
function beginCandidate(productIdOrURL = null) {
  const product = PRODUCT_BY_ID[productIdOrURL];
  const candidate = product ? candidateFromProduct(product) : productIdOrURL ? candidateFromLink(productIdOrURL, { gender: (state.gender || 'M').toLowerCase() }) : null;
  candidateDraft = { id: `j_${crypto.randomUUID()}`, candidate, link: candidate?.originalUrl || '', before: null, journeyId: null, error: '', saving: false };
  candidateSheet();
}
function candidateSheet() {
  if (!candidateDraft) return;
  const d = candidateDraft, c = d.candidate;
  const options = (values, selected) => values.map(([id, label]) => `<option value="${esc(id)}"${id === (selected || '') ? ' selected' : ''}>${esc(label)}</option>`).join('');
  const gender = c?.gender === 'f' ? 'F' : 'M';
  const specific = c ? SLOTS.filter((s) => s.g === gender && s.shape === c.kind) : [];
  openSheet(`<h2>${d.journeyId ? '후보 정보 확인' : '살까 고민 중인 상품 가져오기'}</h2>
    ${!c ? `<form data-action="candidate-link"><label for="candidate-link">상품 주소</label><input id="candidate-link" name="link" type="url" autocomplete="url" placeholder="https://…" value="${esc(d.link)}"><p class="sub">같은 상품을 가져와 비교해요. 없는 상품을 다른 옷으로 바꾸지 않아요.</p><button class="btn" type="submit">이 상품 가져오기</button></form>` : `
    ${candidatePicture(c, 'hero candidate-hero')}<p class="sub">${c.source === 'catalog' ? '저장된 상품 정보예요. 고른 색·옵션과 현재 판매 페이지를 확인해 주세요.' : '링크를 보관했어요. 아직 상품 정보는 자동으로 읽지 않았어요.'}</p>
    <a class="link candidate-url" href="${esc(c.originalUrl || c.url)}" target="_blank" rel="noopener noreferrer">원래 상품 확인 ${ICON.arrow}</a>
    <label for="candidate-name">상품명 (선택)</label><input id="candidate-name" maxlength="160" value="${esc(c.name)}" placeholder="모르면 나중에 추가해도 돼요">
    <div class="candidate-fields"><label>종류<select id="candidate-kind">${options([['', '아직 모름'], ...GARMENT_KINDS.filter((k) => SLOTS.some((s) => s.g === gender && s.shape === k.id)).map((k) => [k.id, k.name])], c.kind)}</select></label><label>고른 색<select id="candidate-color">${options([['', '아직 모름'], ...Object.entries(COLORS).map(([id, value]) => [id, value.label])], c.colorSource === 'image' ? null : c.color)}</select></label></div>
    ${specific.length ? `<label>세부 종류 (모르면 그대로 두세요)<select id="candidate-slot">${options([['', '아직 모름'], ...specific.map((s) => [s.id, s.name])], c.slot)}</select></label>` : ''}
    <details class="garment-name"><summary>브랜드·가격 추가 (선택)</summary><label for="candidate-brand">브랜드</label><input id="candidate-brand" maxlength="120" value="${esc(c.brand)}"><label for="candidate-price">직접 확인한 가격</label><input id="candidate-price" inputmode="numeric" type="number" min="0" max="1000000000" value="${c.price ?? ''}"><p class="fine">입력한 시점의 참고 가격이에요. 배송비·쿠폰·재고·최저가는 확인하지 않았어요.</p></details>
    <button class="btn candidate-compare" data-action="candidate-save" ${d.saving ? 'disabled' : ''}>${d.saving ? '저장 중…' : '내 옷과 비교하기'}</button>`}
    ${d.error ? `<p class="editor-error" role="alert">${esc(d.error)}</p><button class="chip" data-action="reload-wardrobe">입력 유지하고 다시 불러오기</button>` : ''}`, { key: `candidate:${d.id}` });
}
async function saveCandidateDraft({ allowOptionCorrection = false } = {}) {
  const d = candidateDraft;
  if (!d?.candidate || d.saving) return;
  const currentJourney = d.journeyId && state.journeys.find((j) => j.id === d.journeyId);
  if (currentJourney) pendingJourneyForm(currentJourney.id, currentJourney);
  if (currentJourney && !allowOptionCorrection && showJourneyOptionChange(currentJourney, 'candidate-save')) return false;
  d.saving = true;
  d.error = '';
  candidateSheet();
  try {
    validatePurchaseCandidate(d.candidate);
    const existing = d.journeyId && state.journeys.find((j) => j.id === d.journeyId);
    if (d.before && JSON.stringify(existing) !== d.before) throw new Error('이 구매 후보가 다른 화면에서 바뀌었어요. 최신 기록을 다시 확인해 주세요.');
    const changes = existing ? { ...pendingJourneyForm(existing.id, existing), candidate: structuredClone(d.candidate) } : null;
    const corrected = existing && allowOptionCorrection ? transitionPurchaseJourney(existing, 'correction', { changes }) : existing;
    const next = existing ? transitionPurchaseJourney(corrected, 'candidate-edit', { changes }) : createPurchaseJourney(d.candidate, { id: d.id });
    await set({ journeys: [...state.journeys.filter((j) => j.id !== next.id), next], tab: 'saved' });
    d.saving = false;
    journeyForms.delete(next.id);
    closeSheet();
    journeySheet(next.id);
    toast('이 상품을 그대로 보관했어요');
    return true;
  } catch (error) {
    d.saving = false;
    d.error = storageMessage(error);
    render();
    candidateSheet();
    return false;
  }
}
function candidateLookRows(result, candidate) {
  return `<div class="look-rows">${result.items.map((row) => row.owned ? `<div class="look-row">${itemPicture(row.item)}<div><b>${esc(garmentLabel(row.item))}</b><span>${esc(COLORS[row.item.color]?.label || '색 미확인')} · 내 옷</span></div></div>` : `<div class="look-row">${candidatePicture(candidate)}<div><b>${esc(candidate.name || garmentKindName(candidate.kind))}</b><span>${esc(COLORS[candidate.color]?.label || '색 미확인')} · 비교 중인 후보</span></div></div>`).join('')}</div>`;
}
function journeyHistory(journey) {
  const labels = { created: '후보 가져옴', buy: '사기로 함', hold: '보류', skip: '안 사기로 함', ordered: '주문 기록', received: '수령 기록', kept: '계속 입기로 함', returned: '반품 기록', worn: '착용 기록', note: '옵션·이유 저장', 'candidate-edit': '상품 정보 정정', 'details-change': '비교·착용 정보 확인', 'garment-confirmed': '받은 옷 정보에 적용', correction: '주문 옵션 정보 정정', imported: '구버전 현재 기록 이전' };
  const fit = { small: '작음', right: '맞음', large: '큼' };
  const reasons = { size: '사이즈', color: '색', quality: '품질', 'change-of-mind': '변심', other: '기타' };
  return `<details class="garment-name"><summary>내가 남긴 기록 ${journey.history.length}개</summary><ol class="journey-history">${[...journey.history].reverse().slice(0,12).map((event) => {
    const d = event.details;
    return `<li><b>${labels[event.action] || '기록'}</b><time datetime="${esc(event.at)}">${esc(new Date(event.at).toLocaleString('ko-KR'))}</time>${d ? `<p>${[d.option ? `당시 옵션: ${esc(d.option)}` : '', d.reason ? `당시 이유: ${esc(d.reason)}` : '', d.feedback.fit ? `핏 기록: ${fit[d.feedback.fit]}` : '', d.feedback.returnReason ? `반품 사유: ${reasons[d.feedback.returnReason]}` : ''].filter(Boolean).join(' · ') || '추가 메모 없음'}</p>${event.action === 'candidate-edit' ? `<p class="fine">${esc(d.candidate.name || '상품명 미확인')} · ${esc(COLORS[d.candidate.color]?.label || '색 미확인')} · ${d.candidate.price === null ? '가격 미확인' : formatPrice(d.candidate.price)}</p>` : ''}` : '<p class="fine">구버전 기록 · 당시 옵션과 이유는 기록되지 않았어요.</p>'}</li>`;
  }).join('')}</ol>${journey.history.length > 12 ? '<p class="fine">화면에는 최근 12개를 보여줘요. 전체 기록은 사진 포함 백업에 보관돼요.</p>' : ''}</details>`;
}
function priorReturnEvidence(journey) {
  const candidate = journey.candidate;
  const entries = state.journeys.filter((j) => j.id !== journey.id && (candidate.productId ? j.candidate.productId === candidate.productId : j.candidate.url === candidate.url))
    .map((j) => ({ j, event: [...j.history].reverse().find((e) => e.action === 'returned') })).filter((row) => row.event).slice(-3);
  if (!entries.length) return '';
  const feedbackText = (feedback) => [feedback.fit ? `핏 직접 기록: ${{small:'작음',right:'맞음',large:'큼'}[feedback.fit]}` : '', feedback.returnReason ? `반품 사유: ${{size:'사이즈',color:'색',quality:'품질','change-of-mind':'변심',other:'기타'}[feedback.returnReason]}` : ''].filter(Boolean).join(' · ');
  return `<div class="notice"><b>같은 상품 페이지의 반품 기록이 있어요</b>${entries.map(({j,event}) => {
    const d = event.details;
    const later = d && j.history.slice(j.history.indexOf(event) + 1).filter((e) => e.details && ['note','details-change'].includes(e.action) && e.details.option === d.option && e.details.candidate.url === d.candidate.url && e.details.candidate.kind === d.candidate.kind && e.details.candidate.slot === d.candidate.slot && e.details.candidate.color === d.candidate.color && JSON.stringify(e.details.feedback) !== JSON.stringify(d.feedback)).at(-1);
    return `<p>${d ? `${esc(d.option || '옵션 미기록')} · ${esc(d.reason || '상세 이유 미기록')}${feedbackText(d.feedback) ? ` · ${feedbackText(d.feedback)}` : ''}` : '구버전 반품 기록 · 당시 옵션·이유 미확인'} <button class="link" data-action="open-journey" data-id="${esc(j.id)}">기록 보기</button></p>${later ? `<p class="fine">같은 옵션으로 반품 후 저장한 정보: ${feedbackText(later.details.feedback) || '핏·사유 선택 해제'}. 반품 당시 기록은 위에 보관했어요.</p>` : ''}`;
  }).join('')}<p class="fine">직접 남긴 과거 기록이에요. 이번 옵션의 사이즈·핏을 예측하지 않아요.</p></div>`;
}

function showJourneyOptionChange(journey, action) {
  const form = journeyForms.get(journey.id);
  if (journey.stage === 'candidate' || !form || form.option === journey.option) return false;
  pendingOptionChange = { id: journey.id, before: JSON.stringify(journey), action, option: form.option, reason: form.reason };
  openSheet(`<h2>고른 옵션이 바뀌었어요</h2><p><b>${esc(journey.option || '옵션 미기록')}</b> → <b>${esc(form.option || '옵션 미기록')}</b></p><p>주문한 정보를 잘못 적었나요, 다른 옵션을 하나 더 기록하나요? 기존 주문·수령·반품 때의 기록은 보관해요.</p><button class="btn" data-action="option-correction-confirm">잘못 적은 정보 정정</button><button class="btn secondary candidate-compare" data-action="option-fork-confirm">다른 옵션으로 새 여정 만들기</button><button class="link candidate-compare" data-action="open-journey" data-id="${esc(journey.id)}">입력 유지하고 돌아가기</button>`, { key: `option-change:${journey.id}` });
  return true;
}
async function confirmJourneyOptionChange(fork = false) {
  const review = pendingOptionChange;
  if (!review) return;
  const original = state.journeys.find((j) => j.id === review.id);
  if (JSON.stringify(original) !== review.before) throw new Error('구매 기록이 바뀌었어요. 입력은 유지했으니 최신 기록을 확인해 주세요.');
  if (fork) {
    const candidate = review.action === 'candidate-save' && candidateDraft ? candidateDraft.candidate : original.candidate;
    let sibling = createPurchaseJourney(candidate);
    sibling.forkedFrom = original.id;
    sibling = transitionPurchaseJourney(sibling, 'note', { changes: { option: review.option, reason: review.reason, absence: original.absence, intent: original.intent, relatedGarmentIds: original.relatedGarmentIds } });
    await set({ journeys: [...state.journeys, sibling], tab: 'saved' });
    journeyForms.delete(original.id);
    pendingOptionChange = null;
    candidateDraft = null;
    journeySheet(sibling.id);
    toast('원래 주문 기록을 유지하고 다른 옵션의 여정을 만들었어요. 새 주문 여부는 따로 기록해 주세요');
    return;
  }
  if (review.action === 'candidate-save') {
    if (!await saveCandidateDraft({ allowOptionCorrection: true })) return;
  } else await recordJourneyAction(review.id, review.action, { allowOptionCorrection: true });
  pendingOptionChange = null;
}
function beginCandidateGarmentReview(id) {
  const journey = state.journeys.find((j) => j.id === id);
  const item = journey && state.garments.find((g) => g.id === journey.garmentId);
  if (!journey || !item) throw new Error('연결된 옷 기록을 먼저 확인해 주세요.');
  pendingJourneyForm(id, journey);
  if (showJourneyOptionChange(journey, 'note')) return;
  const c = journey.candidate, proposed = { ...item };
  if (c.kind) {
    proposed.kind = c.kind;
    if (c.classificationConfirmed && c.slot) proposed.slot = c.slot;
    else if (c.kind !== item.kind) proposed.slot = null;
  }
  if (c.color && c.colorSource !== 'image') proposed.color = c.color;
  if (c.brand) proposed.brand = c.brand;
  if (c.name) proposed.label = c.name.slice(0,80);
  const titles = { kind: '종류', slot: '세부 종류', color: '색', brand: '브랜드', label: '내 옷 이름' };
  const fields = Object.keys(titles).filter((field) => proposed[field] !== item[field]);
  const display = (field, value) => field === 'kind' ? garmentKindName(value) : field === 'slot' ? SLOT_BY_ID[value]?.name || '미확인' : field === 'color' ? COLORS[value]?.label || '미확인' : value || '미입력';
  candidateGarmentReview = { id, itemId: item.id, beforeJourney: JSON.stringify(journey), beforeGarment: JSON.stringify(item), proposed, fields, selected: new Set(fields.filter((field) => ['kind','slot','color'].includes(field))) };
  openSheet(`<h2>받은 옷에도 확인 내용을 적용할까요?</h2><p>후보 정보만 바꾸면 실제 옷 기록은 그대로예요. 적용할 정보만 고르세요. 원래 사진은 유지해요.</p>${fields.length ? `<div class="garment-differences">${fields.map((field) => `<label><input type="checkbox" data-action="candidate-garment-toggle" data-field="${field}"${candidateGarmentReview.selected.has(field) ? ' checked' : ''}>${titles[field]}<span>${esc(display(field,item[field]))} → ${esc(display(field,proposed[field]))}</span></label>`).join('')}</div><button class="btn" data-action="candidate-garment-apply">선택한 정보만 옷에 적용</button>` : '<p class="notice">연결된 옷과 확인 정보가 같아요.</p>'}<button class="link candidate-compare" data-action="open-journey" data-id="${esc(id)}">여정으로 돌아가기</button>`, { key: `garment-review:${id}` });
}
async function applyCandidateGarmentReview() {
  const review = candidateGarmentReview;
  if (!review) return;
  const journey = state.journeys.find((j) => j.id === review.id);
  const item = state.garments.find((g) => g.id === review.itemId);
  if (JSON.stringify(journey) !== review.beforeJourney || JSON.stringify(item) !== review.beforeGarment)
    throw new Error('옷이나 구매 기록이 바뀌었어요. 차이를 다시 확인해 주세요. 원래 기록은 유지했어요.');
  pendingJourneyForm(journey.id, journey);
  if (showJourneyOptionChange(journey, 'note')) return;
  const selected = [...review.selected];
  if (!selected.length) throw new Error('적용할 정보만 골라 주세요.');
  const confirmed = { ...item, ...Object.fromEntries(selected.map((field) => [field,review.proposed[field]])) };
  if (confirmed.slot && (SLOT_BY_ID[confirmed.slot]?.shape !== confirmed.kind || SLOT_BY_ID[confirmed.slot]?.g !== confirmed.gender))
    throw new Error('종류와 세부 종류가 맞지 않아요. 바뀌는 두 항목을 함께 골라 주세요. 원래 옷과 사진은 유지했어요.');
  const updatedItem = makeGarment(confirmed);
  const updatedJourney = transitionPurchaseJourney(journey, 'garment-confirmed', { changes: pendingJourneyForm(journey.id, journey) });
  await set({ garments: state.garments.map((g) => g.id === item.id ? updatedItem : g), journeys: state.journeys.map((j) => j.id === journey.id ? updatedJourney : j) });
  candidateGarmentReview = null;
  journeyForms.delete(journey.id);
  journeySheet(journey.id);
  toast('확인한 정보만 받은 옷에 적용했어요. 원래 사진은 유지했어요');
}
async function saveJourneyGarmentCheck(id, itemId, color) {
  const journey = state.journeys.find((j) => j.id === id);
  const item = state.garments.find((g) => g.id === itemId);
  if (!journey || !item || !state.closet.some((g) => g.id === itemId)) throw new Error('확인할 내 옷을 다시 골라 주세요.');
  pendingJourneyForm(id, journey);
  if (showJourneyOptionChange(journey, 'note')) return;
  const updatedItem = makeGarment({ ...item, color: color || null });
  const updatedJourney = transitionPurchaseJourney(journey, 'details-change', { changes: { ...pendingJourneyForm(id, journey), relatedGarmentIds: [...new Set([...journey.relatedGarmentIds,itemId])] } });
  await set({ garments: state.garments.map((g) => g.id === itemId ? updatedItem : g), journeys: state.journeys.map((j) => j.id === id ? updatedJourney : j) });
  journeyForms.delete(id);
  journeySheet(id);
  toast('이 옷의 색을 반영해 비교를 다시 계산했어요');
}

function journeySheet(id) {
  const j = state.journeys.find((row) => row.id === id);
  if (!j) { toast('구매 기록을 다시 확인해 주세요'); return; }
  if (!journeyForms.has(id)) journeyForms.set(id, { before: JSON.stringify(j), option: j.option, reason: j.reason });
  const form = journeyForms.get(id), c = j.candidate;
  const comparison = compareCandidate(state, c, { absence: j.absence, intent: j.intent, replacementGarmentId: j.replacementGarmentId });
  const labels = { candidate: '비교 중', ordered: '직접 기록한 주문', received: '받음 · 보유 미확정', kept: '계속 입는 내 옷', returned: '직접 기록한 반품' };
  const decisionLabels = { buy: '사기로 함', hold: '보류', skip: '안 사기로 함' };
  const picks = (field, entries) => entries.map(([value, label]) => `<button class="chip" data-action="journey-field" data-id="${esc(id)}" data-field="${field}" data-value="${value}" aria-pressed="${j[field] === value}">${label}</button>`).join('');
  const duplicateItems = [...new Map([...comparison.sameProduct, ...comparison.similarOwned, ...comparison.uncertainOwned.slice(0,1)].map((item) => [item.id, item])).values()];
  const replacementChoices = state.closet.filter((item) => item.source !== 'demo' && c.kind && item.kind === c.kind);
  const returned = j.stage === 'returned';
  const linked = j.garmentId && state.garments.find((item) => item.id === j.garmentId);
  openSheet(`${candidatePicture(c, 'hero candidate-hero')}<h2 class="detail-title">${esc(c.name || '가져온 상품')}</h2><p class="sub">${esc(c.brand || '')} · ${labels[j.stage]}${j.decision ? ` · ${decisionLabels[j.decision]}` : ''}</p>
    <div class="fine">${c.price === null ? '가격 미확인' : `${formatPrice(c.price)} · ${esc(c.checkedAt || '확인 날짜 없음')} ${c.priceSource === 'catalog' ? '수집일' : '직접 입력'} 기준 참고 가격`}</div>
    <p class="fine">고른 옵션의 현재 가격·배송비·품절 여부는 판매처에서 확인해 주세요.</p>
    <h3 class="block">내 옷을 기준으로 비교</h3>
    <div class="why"><ul>${comparison.decision.reasons.map((reason) => `<li>${esc(reason)}</li>`).join('')}</ul></div>
    ${comparison.sameTypeOwned.length ? `<p class="sub">등록한 같은 세부 종류 ${comparison.sameTypeOwned.length}벌을 이미 반영했어요.</p>` : ''}
    ${!comparison.sameTypeOwned.length || j.absence !== 'unknown' ? `<h3 class="block">비슷한 옷이 있나요? (확인이 필요할 때만)</h3><div class="opts">${picks('absence', [['unknown','아직 모름'],['present','있어요'],['absent','없어요']])}</div>${j.absence === 'present' ? `<p class="sub">이 답은 이 상품 비교에만 반영해요. 내 옷을 연결하거나 간단히 등록하면 다른 추천에도 반영돼요.</p><button class="chip" data-action="journey-add-own" data-id="${esc(id)}">가진 옷 간단히 추가</button>` : ''}` : ''}
    ${state.demo ? '<p class="notice">아직 실제 옷이 없어요. 예시 옷을 실제 보유 근거로 쓰지 않아요. 내 옷을 추가하면 이 상품과 비교할 수 있어요.</p>' : ''}
    <h3 class="block">이번 구매 목적</h3><div class="opts">${picks('intent', [['add','새로 더하기'],['replace','기존 옷 교체']])}</div>
    ${j.intent === 'replace' ? `<h3 class="block">교체할 내 옷</h3>${replacementChoices.length ? `<div class="purchase-owned">${replacementChoices.map((item) => `<div class="purchase-own">${itemPicture(item)}<b>${esc(garmentLabel(item))}</b><span class="fine">${esc(COLORS[item.color]?.label || '색 미확인')}</span><button class="chip" data-action="journey-replacement" data-id="${esc(id)}" data-item="${esc(item.id)}" aria-pressed="${j.replacementGarmentId === item.id}">이 옷 교체</button></div>`).join('')}</div>` : '<p class="notice">교체할 옷을 먼저 등록하면 그 옷을 기준으로 비교할 수 있어요.</p>'}${comparison.replacement.target ? `<p class="sub">이 옷을 교체한 뒤 등록한 옷으로 가능한 기존 코디 공식 ${comparison.replacement.retainedFormulaCount}개 유지 · ${comparison.replacement.lostFormulaCount}개 미완성. 실제 활용도·핏의 보장은 아니에요.</p>` : ''}` : ''}
    ${duplicateItems.length ? `<div class="purchase-owned">${duplicateItems.map((item) => `<div class="purchase-own">${itemPicture(item)}<b>${esc(garmentLabel(item))}</b><span class="fine">${comparison.exactOwned.some((i) => i.id === item.id) ? '같은 상품·확인한 색' : comparison.sameProduct.some((i) => i.id === item.id) ? '같은 상품 주소 · 옵션 확인 필요' : comparison.similarOwned.some((i) => i.id === item.id) ? '같은 세부 종류·색 · 소재·핏 차이 확인' : '세부 종류·색 확인 필요'}</span>${!item.color ? `<label>이 옷 색만 확인<select data-action="journey-own-color" data-id="${esc(id)}" data-item="${esc(item.id)}"><option value="">아직 모름</option>${Object.entries(COLORS).map(([key,value]) => `<option value="${key}">${value.label}</option>`).join('')}</select></label>` : ''}<button class="link" data-action="journey-check-own" data-id="${esc(id)}" data-item="${esc(item.id)}">이 옷의 색·종류 확인</button><button class="link" data-action="journey-related" data-id="${esc(id)}" data-item="${esc(item.id)}">${j.relatedGarmentIds.includes(item.id) ? '연결 해제' : '이 옷과 비교'}</button></div>`).join('')}</div>` : ''}
    ${comparison.missingChecks.length ? `<div class="notice">${comparison.missingChecks.map((check) => `<p>${esc(check.message)}</p>`).join('')}<button class="chip" data-action="candidate-edit" data-id="${esc(id)}">후보 정보 확인</button><button class="chip" data-action="journey-add-own" data-id="${esc(id)}">내 옷 추가</button></div>` : ''}
    ${comparison.looks.length ? `<h3 class="block">이 후보와 등록한 내 옷</h3><p class="sub">새로 가능한 코디 공식 ${comparison.newFormulaCount}개 · 이미 가능한 공식 ${comparison.existingFormulaCount}개. 실제 활용도나 가상 착용 결과는 아니에요.</p>${comparison.looks.slice(0,3).map((look) => `<h4>${esc(look.look.title)}${look.new ? ' · 새로 연결되는 공식' : ' · 기존 종류로 가능한 공식'}</h4>${candidateLookRows(look, c)}`).join('')}` : ''}
    <p class="fine">종류·색과 코디 공식의 비교예요. 사진 속 소재·핏·사이즈를 분석하거나 몸에 합성하지 않았어요.</p>
    ${priorReturnEvidence(j)}
    <details class="garment-name"><summary>옵션·판단 이유 기록 (선택)</summary><label for="journey-option">고른 색·사이즈 등 옵션 (선택)</label><input id="journey-option" data-journey="${esc(id)}" maxlength="160" value="${esc(form.option)}" placeholder="예: 베이지 / M / 수량 1">
    <label for="journey-reason">판단·착용·반품 이유 (선택)</label><input id="journey-reason" data-journey="${esc(id)}" maxlength="500" value="${esc(form.reason)}" placeholder="예: 같은 용도의 재킷이 있어 보류">
    <button class="link" data-action="journey-note" data-id="${esc(id)}">옵션·이유 저장</button></details>
    ${j.stage === 'candidate' ? `<div class="purchase-decisions">${[['buy','사기로 할게요'],['hold','보류할게요'],['skip','안 살게요']].map(([action,label]) => `<button class="btn ${action === 'buy' ? '' : 'secondary'}" data-action="journey-action" data-id="${esc(id)}" data-step="${action}">${label}</button>`).join('')}</div><p class="fine">판단 기록이에요. 주문하거나 결제하지 않아요.</p>` : ''}
    <a class="btn candidate-compare" href="${esc(c.originalUrl || c.url)}" target="_blank" rel="noopener noreferrer">원래 판매처에서 확인 ${ICON.arrow}</a>
    <p class="fine">판매처 방문은 구매로 기록하지 않아요. 실제 결제·배송·반품은 판매처에서 처리해요.</p>
    ${j.stage === 'candidate' ? `<button class="btn secondary candidate-compare" data-action="journey-action" data-id="${esc(id)}" data-step="ordered">직접 주문했다고 기록</button>` : ''}
    ${j.stage === 'ordered' ? `<button class="btn candidate-compare" data-action="journey-action" data-id="${esc(id)}" data-step="received">받았어요</button>` : ''}
    ${j.stage === 'received' ? `<p class="notice">받은 옷은 보유 미확정으로 보관해요. 계속 입기로 정하면 옷장과 추천에 반영돼요.</p><button class="btn candidate-compare" data-action="journey-action" data-id="${esc(id)}" data-step="kept">계속 입을게요 · 내 옷장에 반영</button>` : ''}
    ${j.stage === 'kept' ? `<p class="sub">착용 기록 ${j.wearCount}회 · 직접 남긴 기록</p><button class="btn secondary candidate-compare" data-action="journey-action" data-id="${esc(id)}" data-step="worn">오늘 입었어요</button>${j.replacementGarmentId && !j.replacementConfirmed ? `<button class="chip" data-action="journey-retire-review" data-id="${esc(id)}">교체한 이전 옷 정리</button>` : ''}` : ''}
    ${['received','kept'].includes(j.stage) ? `<button class="link candidate-compare" data-action="journey-return-review" data-id="${esc(id)}">반품했다고 기록</button>` : ''}
    ${returned ? `<p class="notice">반품한 옷은 보유 추천에서 제외했어요. 옷 기록과 사진은 보관 중이에요.</p><button class="chip" data-action="journey-action" data-id="${esc(id)}" data-step="received">반품 기록 취소 · 다시 수령 상태</button>` : ''}
    ${j.replacementConfirmed ? `<p class="fine">교체한 이전 옷은 보유 추천에서 제외 중이에요.</p><button class="chip" data-action="journey-field" data-id="${esc(id)}" data-field="replacementConfirmed" data-value="false">이전 옷 다시 보유로 표시</button>` : ''}
    ${['received','kept'].includes(j.stage) && linked ? `<button class="chip candidate-compare" data-action="candidate-garment-review" data-id="${esc(id)}">확인한 상품 정보를 받은 옷에도 적용</button>` : ''}
    ${linked ? `<button class="link candidate-compare" data-action="open-own" data-id="${esc(linked.id)}">연결된 옷 기록·사진 확인</button>` : j.garmentId ? `<p class="notice">연결했던 옷 기록이 없어요. 구매 기록은 유지했어요.</p><button class="chip" data-action="journey-receipt-repair" data-id="${esc(id)}">받은 옷 다시 등록해 연결</button>` : ''}
    ${['received','kept','returned'].includes(j.stage) ? `<details class="garment-name"><summary>직접 입어본 결과 (선택)</summary><h4>핏은 어땠나요?</h4><div class="opts">${[['small','작음'],['right','맞음'],['large','큼']].map(([value,label]) => `<button class="chip" data-action="journey-fit" data-id="${esc(id)}" data-value="${value}" aria-pressed="${j.feedback.fit === value}">${label}</button>`).join('')}</div><h4>반품 사유 (해당할 때만)</h4><div class="opts">${[['size','사이즈'],['color','색'],['quality','품질'],['change-of-mind','변심'],['other','기타']].map(([value,label]) => `<button class="chip" data-action="journey-return-reason" data-id="${esc(id)}" data-value="${value}" aria-pressed="${j.feedback.returnReason === value}">${label}</button>`).join('')}</div><p class="fine">선택한 시점의 직접 기록이에요. 실제 반품 완료와 핏 예측은 별도예요.</p></details>` : ''}
    ${journeyHistory(j)}
    ${c.productId ? `<button class="link candidate-compare" data-action="journey-hide-product" data-id="${esc(id)}">${state.hidden.includes(c.productId) ? '이 상품 다시 추천받기' : '이 상품 다시 추천하지 않기'}</button>` : ''}
    <button class="chip candidate-compare" data-action="journey-fork" data-id="${esc(id)}">다른 사이즈·옵션 하나 더 기록</button>${j.forkedFrom ? `<button class="link candidate-compare" data-action="open-journey" data-id="${esc(j.forkedFrom)}">처음 비교한 상품 기록으로 돌아가기</button>` : ''}
    <p class="fine">이 여정은 상품·옵션 한 개의 기록이에요. 여러 사이즈를 샀다면 각각 가져와 기록해 주세요. 구매와 반품은 판매처가 확인한 주문 데이터가 아닌 사용자 기록이에요.</p>`, { key: `journey:${id}` });
}
function pendingJourneyForm(id, journey) {
  const form = journeyForms.get(id);
  if (form?.before && JSON.stringify(journey) !== form.before) throw new Error('이 구매 기록이 다른 화면에서 바뀌었어요. 입력을 유지했으니 최신 기록을 확인해 주세요.');
  return form ? { option: form.option, reason: form.reason } : {};
}
async function setJourneyField(id, field, value) {
  if (field === 'replacementConfirmed') value = value === true || value === 'true';
  const j = state.journeys.find((row) => row.id === id);
  if (!j) throw new Error('구매 기록을 찾지 못했어요.');
  if (!['absence','intent','relatedGarmentIds','replacementGarmentId','replacementConfirmed','feedback'].includes(field)) throw new Error('변경할 기록을 확인해 주세요.');
  pendingJourneyForm(id, j);
  if (showJourneyOptionChange(j, 'note')) return;
  const updated = transitionPurchaseJourney(j, 'details-change', { changes: { ...pendingJourneyForm(id, j), [field]: value } });
  await set({ journeys: state.journeys.map((row) => row.id === id ? updated : row) });
  journeyForms.delete(id);
  journeySheet(id);
}
async function recordJourneyAction(id, action, { allowOptionCorrection = false } = {}) {
  const j = state.journeys.find((row) => row.id === id);
  if (!j) throw new Error('구매 기록을 찾지 못했어요.');
  if (['kept','worn'].includes(action) && !state.garments.some((item) => item.id === j.garmentId))
    throw new Error('연결된 옷 기록이 없어요. 받은 옷을 다시 등록해 연결한 뒤 기록해 주세요.');
  const changes = pendingJourneyForm(id, j);
  if (!allowOptionCorrection && showJourneyOptionChange(j, action)) return;
  if (action === 'received' && j.stage === 'received' || action === 'kept' && j.stage === 'kept') {
    if (Object.keys(changes).some((key) => changes[key] !== j[key])) action = 'note';
    else { journeyForms.delete(id); journeySheet(id); return; }
  }
  let garments = state.garments;
  if (action === 'received') {
    if (!j.candidate.kind) throw new Error('받은 옷의 종류를 먼저 확인해 주세요. 상품 정보 확인에서 고를 수 있어요.');
    const c = j.candidate, garmentId = j.garmentId || `g_purchase_${j.id}`;
    const existing = garments.find((item) => item.id === garmentId);
    if (!existing) garments = [...garments, makeGarment({ id: garmentId, kind: c.kind, slot: c.classificationConfirmed ? c.slot : null, color: c.colorSource === 'image' ? null : c.color, brand: c.brand || null, label: c.name, productId: c.productId, gender: c.gender.toUpperCase() })];
    changes.garmentId = garmentId;
  }
  // Corrections and the requested transition share the same durable commit.
  // The first ordered/received snapshot keeps its originally recorded values.
  const corrected = allowOptionCorrection ? transitionPurchaseJourney(j, 'correction', { changes: pendingJourneyForm(id, j) }) : j;
  const updated = transitionPurchaseJourney(corrected, action, { changes });
  await set({ journeys: state.journeys.map((row) => row.id === id ? updated : row), garments, ...(['received','kept'].includes(action) ? { demo: false, demoSelected: [] } : {}) });
  journeyForms.delete(id);
  journeySheet(id);
  toast(action === 'received' ? '수령 기록과 옷을 함께 보관했어요. 계속 입을지 정해 주세요' : action === 'kept' ? '내 옷장과 다음 추천에 반영했어요' : action === 'returned' ? '반품 기록을 남겼어요. 옷과 사진은 보관하고 추천에서 제외해요' : '기록을 저장했어요');
}

function footer() {
  return `<p class="footer">상품명·가격·평점은 ${esc(CATALOG.store)} 판매 페이지에서 ${esc(CATALOG.checkedLabel)}에 확인한 값이에요(상품 ${CATALOG.count}개). 할인·쿠폰·재고에 따라 달라질 수 있으니 구매 전에 판매 페이지에서 확인해 주세요. 내 옷장·찜·구매 여정은 이 기기에만 저장돼요.</p>`;
}

function nav() {
  const tabs = [
    ['home', '추천', ICON.sparkle, 0],
    ['closet', '내 옷장', ICON.hanger, myCloset().length],
    ['saved', '구매 여정', ICON.heart, state.journeys.length || state.saved.length],
  ];
  return `<nav class="nav" aria-label="주요 메뉴"><div class="nav-inner">${tabs.map(([k, label, icon, n]) => `<button data-action="tab" data-tab="${k}" aria-current="${state.tab === k ? 'page' : 'false'}">${icon}${label}${n ? `<span class="count">${n}</span>` : ''}</button>`).join('')}</div></nav>`;
}

function render() {
  if (tastePicking || !state.onboarded || !state.gender || !myStyles().length) {
    $app.innerHTML = storageNotice() + renderOnboarding();
    return;
  }
  const body = state.tab === 'closet' ? renderCloset() : state.tab === 'saved' ? renderSaved() : renderHome();
  $app.innerHTML =
    storageNotice() + demoNotice() + (state.tab === 'home' ? topBar() : '') + `<main>${body}</main>` + nav();
}

// ── 시트
// key가 같은 시트를 다시 그리면(고르기 등) 보던 위치와 누른 버튼의 포커스를 유지한다
let sheetKey = null;
function openSheet(html, { key = null } = {}) {
  sheetRevision++;
  restoreDraft = null;
  eraseReviewStep = 0;
  if (!$sheet.innerHTML) returnFocus = document.activeElement;
  $app.inert = true;
  const same = !!key && key === sheetKey && !!$sheet.innerHTML;
  const scroll = $sheet.querySelector('.sheet')?.scrollTop;
  const focusId = same ? document.activeElement?.id : null;
  const pressed = same ? document.activeElement?.dataset : null;
  const again = pressed?.action
    ? `[data-action="${CSS.escape(pressed.action)}"]` +
      Object.entries(pressed)
        .filter(([k]) => k !== 'action')
        .map(([k, v]) => `[data-${k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}="${CSS.escape(v)}"]`)
        .join('')
    : null;
  $sheet.innerHTML = `<div class="scrim" data-action="close-sheet"></div><div class="sheet" role="dialog" aria-modal="true"><div class="grabber"></div><button class="sheet-close" data-action="close-sheet" aria-label="닫기">${ICON.close}</button>${html}</div>`;
  sheetKey = key;
  const sheet = $sheet.querySelector('.sheet');
  if (same && sheet && scroll) sheet.scrollTop = scroll;
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() =>
    ((focusId && $sheet.querySelector(`#${CSS.escape(focusId)}`)) || (again && $sheet.querySelector(again)) || $sheet.querySelector('button, input, select'))?.focus({ preventScroll: same }),
  );
  return scroll;
}
function closeSheet() {
  if (writeBusy || draft?.saving || candidateDraft?.saving) return;
  releaseDraftPhotoAnalysis(draft);
  sheetRevision++;
  restoreDraft = null;
  eraseReviewStep = 0;
  $app.inert = false;
  returnFocus?.focus?.();
  if (draft?.preview) URL.revokeObjectURL(draft.preview);
  $sheet.innerHTML = '';
  document.body.style.overflow = '';
  draft = null;
  candidateDraft = null;
  pendingOptionChange = null;
  candidateGarmentReview = null;
  sheetKey = null;
}

function lookRows(r) {
  return r.items
    .map((i) => {
      if (i.owned) {
        const pic = i.item ? itemPicture(i.item) : slotPicture(i.slot, i.color);
        const brand = i.item?.productId ? PRODUCT_BY_ID[i.item.productId]?.brand : i.item?.brand;
        const confirm = i.certainty === 'uncertain' && i.item && !state.demo;
        const tag = confirm ? 'button' : 'div';
        return `<${tag} class="look-row"${confirm ? ` data-action="confirm-own-kind" data-id="${i.item.id}" data-look="${r.look.id}"` : ''}>${pic}<div><div class="role">${ROLE_LABEL[i.role]} · ${state.demo ? '예시 옷' : '내 옷'}${i.certainty === 'uncertain' ? ` · ${esc(shortName(i.slot))}인지 확인 필요` : ''}</div><div class="nm">${esc([COLORS[i.color]?.label, brand, i.item ? garmentLabel(i.item) : i.slot.name].filter(Boolean).join(' '))}</div></div><span class="badge">${i.certainty === 'uncertain' ? '종류 확인' : state.demo ? '예시' : '보유'}</span></${tag}>`;
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
    ${!state.demo && !owned && !needsCheck ? '<p class="notice">등록한 옷 기준의 구매 후보예요. 실제로 없는 옷인지 먼저 확인해 주세요.</p>' : ''}
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
    <button class="btn secondary candidate-compare" data-action="candidate-product" data-id="${p.id}">내 옷과 비교 · 구매 여정에 넣기</button>
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
    <div class="total"><span>${r.uncertainCount ? `종류 확인 필요${r.buyCount ? ` · 구매 후보 ${r.buyCount}개` : ''}` : r.buyCount ? `구매 후보 ${r.buyCount}개` : state.demo ? '예시로 완성' : '가진 옷으로 완성'}</span><b>${r.buyCount ? formatPrice(r.buyTotal) : ''}</b></div>
    ${buyIds.length ? `<div class="cta"><button class="btn" data-action="save-all" data-ids="${buyIds.join(',')}">후보 ${buyIds.length}개 모두 찜하기</button></div>` : ''}
  `);
}

// 내 옷 한 벌
function ownSheet(id) {
  const item = state.closet.find((i) => i.id === id) || state.garments.find((i) => i.id === id);
  if (!item) return;
  const active = state.closet.some((i) => i.id === id);
  const slot = slotForItem(item);
  const p = item.productId ? PRODUCT_BY_ID[item.productId] : null;
  const looks = active ? recommendLooks(
    { ...state, budget: null, occasion: null },
    { limit: 2, occasion: null, anchorItem: item },
  ) : [];
  lastLooks = [];
  openSheet(`
    ${itemPicture(item, 'hero')}
    ${similarPhoto(item) ? `<p class="fine" style="margin-top:8px">${state.demo ? '예시 옷이라' : '사진이 없어'} 같은 종류·색의 상품 사진으로 보여 줘요. 실제 옷의 모양·핏과 다를 수 있어요.</p>` : ''}
    <div class="brand-name" style="margin-top:14px">${esc(p?.brand || item.brand || '브랜드 미입력')}</div>
    <h2 class="detail-title">${esc(item.label || p?.name || garmentLabel(item))}</h2>
    ${!active ? '<p class="notice">보유 추천에서 제외 중인 옷이에요. 사진과 기록은 보관 중이며 구매 여정에서 수령·보유·반품 상태를 확인할 수 있어요.</p>' : ''}
    ${item.photoMissing ? '<p class="notice">이전 버전에서 사진이 저장되지 않았던 옷이에요. 사진을 다시 골라 주세요.</p>' : ''}<div class="fine">${esc(garmentLabel(item))} · ${esc(COLORS[item.color]?.label || '색 미확인')}</div>
    <div class="why"><h3>이렇게 입어요</h3><ul><li>${esc(slot.tip)}</li></ul></div>
    ${looks.length ? `<h3 class="block">이 옷으로 만든 코디</h3><div class="looks">${looks.map((r) => lookCard(r)).join('')}</div>` : active ? '<p class="sub">이 옷이 들어가는 코디 공식이 아직 없어요.</p>' : ''}
    <div class="sheet-links">
      ${p ? `<a class="link" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">판매 페이지</a>` : ''}
      ${active ? `<button class="link" data-action="search-with" data-id="${item.id}">이 옷에 어울리는 아이템 찾기</button>` : ''}
      <button class="link" data-action="edit-own" data-id="${item.id}">옷 정보 수정</button>
      <button class="link danger" data-action="remove-own" data-id="${item.id}">옷장에서 빼기</button>
    </div>
  `);
}

// Required: kind. Color, brand, photo and name remain optional.
function beginDraft(item = null, slot = null, { confirmDetails = false, returnLookId = null } = {}) {
  if (draft?.saving) return;
  releaseDraftPhotoAnalysis(draft);
  if (draft?.preview) URL.revokeObjectURL(draft.preview);
  const base = item || makeGarment({ kind: slot ? SLOT_BY_ID[slot].shape : null, slot, gender: state.gender });
  draft = {
    ...structuredClone(base),
    kind: base.kind || null,
    entryMode: item ? 'edit' : slot ? 'manual' : 'choice',
    photoDetailsOpen: false,
    before: item ? JSON.stringify(item) : null,
    confirmDetails,
    returnLookId,
    asset: null,
    preview: null,
    processing: false,
    saving: false,
    token: 0,
    error: '',
    recognizing: false,
    analysisToken: 0,
    labelToken: 0,
    photoRecognition: null,
    photoIdentity: null,
    identitySource: null,
    labelText: '',
    labelTextRevision: 0,
    labelPreview: null,
    recognitionError: '',
    recognitionProgress: null,
    recognizer: null,
    photoReview: null,
  };
  addSheet();
}

// Inference is transient. Only a human-confirmed value reaches makeGarment.
function releaseDraftPhotoAnalysis(current, { clearResults = false, keepRecognizer = false } = {}) {
  if (!current) return;
  current.analysisToken++;
  current.labelToken = (current.labelToken || 0) + 1;
  if (!keepRecognizer || current.recognizing) {
    try { current.recognizer?.cancel?.(); } catch {}
    try { current.recognizer?.dispose?.(); } catch {}
    current.recognizer = null;
  }
  current.recognizing = false;
  current.photoReview = null;
  if (current.labelPreview) URL.revokeObjectURL(current.labelPreview);
  current.labelPreview = null;
  if (clearResults) {
    current.photoRecognition = null;
    current.photoIdentity = null;
    current.identitySource = null;
    current.labelText = '';
    current.labelTextRevision = (current.labelTextRevision || 0) + 1;
    current.recognitionError = '';
    current.recognitionProgress = null;
  }
}
function refreshPhotoIdentity() {
  if (!draft) return;
  draft.photoIdentity = suggestPhotoIdentity(draft.labelText, {
    gender: draft.gender, kind: draft.kind, color: draft.color, limit: 4,
  });
  draft.photoReview = null;
}
function photoLabelLines() {
  return [...new Set((draft?.labelText || '').split(/\r?\n/).map((line) => line.trim()))]
    .filter((line) => line && line.length <= 120 && !/https?:\/\//i.test(line)).slice(0, 8);
}
function photoCanAutoAnalyze() {
  return photoAnalysisAllowed && (typeof navigator === 'undefined' || !navigator.connection?.saveData);
}
function photoAnalysisPanel() {
  if (!draft || (!draft.photoId && !draft.photoRecognition && !draft.recognitionError)) return '';
  const r = draft.photoRecognition, identity = draft.photoIdentity;
  const confirmedText = ['label', 'text'].includes(draft.identitySource);
  const progress = draft.recognitionProgress;
  const stage = progress?.task === 'ocr' ? '라벨 글자 읽는 중' :
    progress?.stage === 'kind-analysis' ? '옷 종류 분석 중' :
    progress?.stage === 'color-analysis' ? '색 후보 분석 중' : '분석 도구 준비 중';
  const kinds = (r?.kinds || []).filter((x) => SLOTS.some((s) => s.g === draft.gender && s.shape === x.kind));
  const candidates = confirmedText ? identity?.candidates || [] : [];
  return `<section class="photo-analysis" aria-label="사진 분석 후보"><h3>${r ? '사진에서 찾았어요' : draft.recognizing ? '사진 분석 중' : '사진에서 정보 찾기'}</h3>
    ${!photoCanAutoAnalyze() && !draft.photoRecognition ? '<p class="sub">사진에서 종류와 라벨 글자를 찾아볼까요? 처음에는 약154MB의 모델과 문자 도구를 다운로드해요. 사진은 이 기기에서 처리해요. 데이터 절약 모드에서는 사진마다 분석을 선택해요.</p><button class="chip" data-action="photo-start">이 기기에서 사진 분석하기</button><p class="sub">아래에서 종류만 골라 바로 저장해도 돼요.</p>' : ''}
    ${draft.recognizing ? `<p role="status" data-photo-progress>${stage}…</p><p class="sub">첫 분석은 큰 분석 도구(약 154MB와 문자 도구)를 내려받아 시간이 걸려요. 사진은 이 기기에서 처리해요.</p><button class="chip" data-action="photo-cancel">분석 취소하고 직접 고르기</button>` : ''}
    ${kinds.length ? `<p class="sub">어떤 옷을 넣나요? 맞는 종류를 눌러 주세요.</p><div class="opts">${kinds.map((x) => `<button class="chip" data-action="photo-kind" data-kind="${x.kind}" aria-pressed="${draft.kind === x.kind}">${esc(x.label)}</button>`).join('')}</div>` : ''}
    ${r?.colors?.length ? `<p class="sub">맞는 색이 있나요?</p><div class="opts">${r.colors.map((x) => `<button class="chip" data-action="photo-color" data-color="${x.color}" aria-pressed="${draft.color === x.color}">${esc(x.label)}</button>`).join('')}<button class="chip" data-action="draft-color" data-color="">색 모름</button></div>` : ''}
    ${r?.requiresCrop ? '<p class="notice">한 벌을 구분하기 어려워요. 등록할 옷만 크게 찍거나 다른 종류를 골라 주세요.</p>' : ''}
    ${r?.warnings?.length ? `<p class="sub">${esc(r.warnings.join(' '))}</p>` : ''}
    ${draft.recognitionError ? `<p class="editor-error" role="alert">${esc(draft.recognitionError)}</p>` : ''}
    <details class="photo-extra"${draft.photoDetailsOpen || draft.photoReview ? ' open' : ''}><summary>브랜드·상품 확인 (선택)</summary>
    ${draft.labelPreview ? `<img class="label-preview" src="${esc(draft.labelPreview)}" alt="문자 분석에만 사용하는 라벨 사진">` : ''}
    <details class="photo-label"${draft.labelText || confirmedText ? ' open' : ''}><summary>${draft.labelText ? '읽힌 글자 확인' : '브랜드·상품 찾기'}</summary><p class="sub">프린트 문구도 읽힐 수 있어요. 라벨의 브랜드·상품 글자인지 확인해 주세요.</p><label for="photo-label-text">라벨에 적힌 글자</label><textarea id="photo-label-text" maxlength="1200" rows="3" placeholder="예: MUSINSA STANDARD 또는 브랜드: BARACUTA">${esc(draft.labelText)}</textarea><button class="chip" data-action="photo-text-match">이 글자로 브랜드·상품 찾기</button></details>
    ${confirmedText && identity?.brands?.length ? `<p class="sub">라벨에 적힌 브랜드가 맞나요?</p><div class="opts">${identity.brands.map((x) => `<button class="chip" data-action="photo-brand" data-brand="${esc(x.brand)}" aria-pressed="${draft.brand === x.brand}">${esc(x.brand)}</button>`).join('')}</div>` : ''}
    ${confirmedText && identity?.unknownBrandText ? `<p class="sub">목록에 없는 브랜드예요. 라벨을 확인했다면 이름만 저장할 수 있어요.</p><button class="chip" data-action="photo-brand" data-brand="${esc(identity.unknownBrandText)}">${esc(identity.unknownBrandText)} 확인</button>` : ''}
    ${confirmedText && !identity?.brands?.length && !identity?.unknownBrandText && photoLabelLines().length ? `<label for="photo-brand-line">읽힌 줄 중 브랜드 이름이 있나요?</label><select id="photo-brand-line"><option value="">고르기·모름</option>${photoLabelLines().map((line) => `<option value="${esc(line)}"${draft.brand === line ? ' selected' : ''}>${esc(line)}</option>`).join('')}</select><p class="sub">고른 글자만 브랜드로 저장해요. 상품이 확인된 것은 아니에요.</p>` : ''}
    ${candidates.length ? `<p class="sub">같은 상품인지 사진과 이름을 확인해 주세요. 닮았다는 이유만으로 연결하지 않아요.</p><div class="photo-products">${candidates.map((x) => `<button class="photo-product" data-action="photo-candidate-review" data-id="${esc(x.productId)}">${x.product.img ? `<img src="${esc(x.product.img)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}<span><b>${esc(x.brand)}</b>${esc(x.name)}<small>${x.conflicts.length ? '종류·색 등 확인한 정보와 다름' : x.exact ? '상품 글자·주소와 일치하는 후보' : '브랜드가 같은 상품 후보'}</small></span></button>`).join('')}</div>` : confirmedText ? '<p class="sub">확정할 상품을 찾지 못했어요. 브랜드가 없어도 종류·색으로 코디를 추천할 수 있어요.</p>' : ''}
    ${confirmedText && identity?.unresolvedProductLinks?.length ? `<p class="sub">읽힌 상품 주소가 현재 목록에 없어서 연결하지 않았어요. ${identity.unresolvedProductLinks.map((url) => `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">원래 상품 보기</a>`).join(' · ')}</p>` : ''}
    ${draft.photoReview ? photoCandidateReviewPanel() : ''}
    ${photoAnalysisAllowed ? `<div class="opts"><button class="chip" data-action="photo-label-picker">라벨·로고를 크게 찍어 추가</button>${!draft.recognizing && draft.photoId ? '<button class="link" data-action="photo-retry">사진 다시 분석</button>' : ''}</div>` : ''}</details><p class="sub">종류만 확인하면 저장할 수 있어요.</p>
  </section>`;
}
function photoCandidateCanLink(candidate) {
  return !!candidate?.exact && ['product-link', 'brand-and-name'].includes(candidate.match);
}
function photoCandidateReviewPanel() {
  const p = PRODUCT_BY_ID[draft.photoReview.id];
  if (!p) return '';
  const candidate = draft.photoIdentity?.candidates.find((x) => x.productId === p.id);
  if (!photoCandidateCanLink(candidate)) return `<div class="notice"><h4>같은 브랜드의 참고 상품</h4><p>${esc(p.brand)} · ${esc(p.name)}</p><p class="sub">브랜드·종류만 같아서 내 옷과 같은 상품으로 연결하지 않았어요. 구매한 상품 주소나 고유한 상품명 글자를 위 글자 칸에 넣으면 다시 대조할 수 있어요.</p><a class="link" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">참고 상품 보기</a></div>`;
  const slot = SLOT_BY_ID[p.slot];
  const needsColor = !draft.color && p.color && p.colorSource !== 'image';
  return `<div class="notice"><h4>이 상품이 내 옷과 같은가요?</h4><p>${esc(p.brand)} · ${esc(p.name)}</p><p>종류: ${esc(garmentKindName(draft.kind))} → ${esc(garmentKindName(slot.shape))}<br>세부 종류: ${esc(SLOT_BY_ID[draft.slot]?.name || '모름')} → ${esc(slot.name)}<br>브랜드: ${esc(draft.brand || '모름')} → ${esc(p.brand)}<br>이름: ${esc(draft.label || '없음')} → ${esc(draft.label || p.name)}</p>${needsColor ? `<p>내 옷도 ${esc(COLORS[p.color]?.label || p.color)}인가요?</p><button class="chip" data-action="photo-product-color" data-id="${esc(p.id)}" aria-pressed="${!!draft.photoReview.colorConfirmed}">이 색이 맞아요</button>` : ''}<p class="sub">같은 색·옵션인지 확인해 주세요. 내 사진과 직접 적은 이름은 유지해요.</p><button class="chip" data-action="photo-candidate-confirm" data-id="${esc(p.id)}"${needsColor && !draft.photoReview.colorConfirmed ? ' disabled' : ''}>같은 상품 확인하고 적용</button></div>`;
}
async function analyzeDraftPhoto({ mode = 'garment', file = null } = {}) {
  const current = draft;
  if (!current || current.saving || !['garment', 'label'].includes(mode)) return;
  const blob = file || current.asset?.blob || photoBlobs.get(current.photoId);
  if (!(blob instanceof Blob)) return;
  releaseDraftPhotoAnalysis(current, { keepRecognizer: !current.recognizing });
  const token = current.analysisToken;
  const textRevision = current.labelTextRevision;
  current.recognizing = true;
  current.recognitionError = '';
  current.recognitionProgress = null;
  if (mode === 'label') current.labelPreview = URL.createObjectURL(blob);
  addSheet();
  try {
    const recognizer = current.recognizer || photoRecognizerFactory();
    if (typeof recognizer?.analyze !== 'function') throw new Error('사진 분석 도구를 시작하지 못했어요. 종류는 직접 골라 저장할 수 있어요.');
    current.recognizer = recognizer;
    const result = await recognizer.analyze(blob, { mode, onProgress(value) {
      if (draft !== current || current.analysisToken !== token || !current.recognizing) return;
      current.recognitionProgress = value;
      const status = $sheet.querySelector('[data-photo-progress]');
      if (status) status.textContent = value?.task === 'ocr' ? '라벨 글자 읽는 중…' :
        value?.stage === 'kind-analysis' ? '옷 종류 분석 중…' : '분석 도구 준비 중…';
    } });
    if (draft !== current || current.analysisToken !== token) return;
    current.photoRecognition = mode === 'label' ? { ...current.photoRecognition, text: result.text, warnings: result.warnings } : result;
    if (current.labelTextRevision === textRevision) {
      current.labelText = String(result.text || '').slice(0, 1200);
      current.identitySource = mode === 'label' ? 'label' : null;
    }
    refreshPhotoIdentity();
  } catch (error) {
    if (draft === current && current.analysisToken === token && error?.name !== 'AbortError')
      current.recognitionError = error?.message || '분석하지 못했어요. 종류를 직접 골라 저장할 수 있어요.';
  } finally {
    if (draft === current && current.analysisToken === token) { current.recognizing = false; addSheet(); }
  }
}
function addSheet() {
  if (!draft) return;
  const selected = slotForItem(draft);
  const kinds = GARMENT_KINDS.filter((k) => SLOTS.some((s) => s.g === state.gender && s.shape === k.id));
  const kindButton = (k) => `<button class="kind-pick" data-action="draft-kind" data-kind="${k.id}" aria-pressed="${draft.kind === k.id}">${typePicture(SLOTS.find((s) => s.g === state.gender && s.shape === k.id))}<span>${k.name}</span></button>`;
  const photo = draft.preview || photos.get(draft.photoId);
  const entry = !draft.before && draft.entryMode === 'choice' && !photo && !draft.kind;
  // The kind grid stays open unless a visual suggestion or a chosen kind is shown above it.
  const suggested = (draft.photoRecognition?.kinds || []).some((x) => SLOTS.some((s) => s.g === draft.gender && s.shape === x.kind));
  const manual = draft.entryMode === 'manual' || draft.entryMode === 'edit' || (!suggested && !draft.kind);
  const specificKinds = SLOTS.filter((s) => s.g === draft.gender && s.shape === draft.kind);
  const manualKinds = `<fieldset><legend>어떤 옷인가요?</legend><div class="kind-grid">${kinds.slice(0, 8).map(kindButton).join('')}</div><details class="more-kinds"><summary>다른 종류</summary><div class="kind-grid">${kinds.slice(8).map(kindButton).join('')}</div></details></fieldset>`;
  const sourceChoices = `<div class="photo-sources"><button class="photo-source primary" data-action="add-photo">${ICON.image || ICON.camera}<b>앨범에서 선택</b><span>옷 사진 한 장</span></button><button class="photo-source" data-action="add-camera">${ICON.camera}<b>카메라로 촬영</b><span>옷 한 벌을 크게</span></button></div><button class="link manual-entry" data-action="draft-manual">사진 없이 종류로 추가</button>`;
  openSheet(`<div class="garment-editor wardrobe-registration"><h2 class="detail-title">${draft.before ? '내 옷 수정' : '옷 한 벌 추가'}</h2><p class="sub">${entry ? '사진부터 골라 주세요. 브랜드·이름은 나중에 넣어도 돼요.' : '종류 하나만 확인하면 옷장에 넣을 수 있어요.'}</p><fieldset${draft.saving ? ' disabled' : ''}>
  ${entry ? `<div class="registration-entry">${sourceChoices}<p class="fine">JPG·PNG·WebP 사진을 사용할 수 있어요.</p><button class="link" data-action="tab" data-tab="home">추천 상품에서 찾아 '이 상품 있어요'로 추가</button></div>` : `<div class="photo-editor${photo ? ' has-photo' : ''}">${photo ? `<img class="photo-preview" src="${photo}" alt="내 옷 사진">` : '<div class="photo-empty">사진은 선택</div>'}<div class="photo-edit-actions"><button class="chip" data-action="add-photo">${photo ? '사진 바꾸기' : '앨범에서 선택'}</button>${photo ? '<button class="link" data-action="clear-photo">사진 빼기</button>' : '<button class="chip" data-action="add-camera">카메라로 촬영</button>'}</div></div>
  ${draft.photoMissing ? '<p class="notice">이전 버전에서 저장되지 않은 사진이에요. 다시 고를 수 있어요.</p>' : ''}
  ${photoAnalysisPanel()}
  ${draft.kind ? `<div class="confirmed-kind"><span>확인한 종류</span><b>${esc(garmentKindName(draft.kind))}</b>${draft.brand ? `<small>${esc(draft.brand)}</small>` : ''}</div>` : photo ? '<p class="sub registration-kind-hint">종류를 확인해 주세요. 모르면 아래에서 직접 고를 수 있어요.</p>' : ''}
  ${manual ? manualKinds : `<details class="manual-kinds"><summary>${draft.kind ? '다른 종류로 바꾸기' : '다른 종류로 등록'}</summary>${manualKinds}</details>`}
  ${specificKinds.length ? `<details class="garment-name"${draft.confirmDetails ? ' open' : ''}><summary>세부 종류 확인 (선택)${draft.slot ? ` · ${esc(shortName(selected))}` : ''}</summary><div class="opts"><button class="chip" data-action="draft-slot" data-slot="" aria-pressed="${!draft.slot}">아직 모름</button>${specificKinds.map((s) => `<button class="chip" data-action="draft-slot" data-slot="${s.id}" aria-pressed="${draft.slot === s.id}">${esc(s.name)}</button>`).join('')}</div></details>` : ''}
  <details class="garment-name"><summary>색·브랜드·이름 수정 (선택)</summary><label for="garment-label">내가 부를 이름</label><input id="garment-label" maxlength="80" value="${esc(draft.label)}"><label for="garment-brand">브랜드</label><input id="garment-brand" maxlength="120" value="${esc(draft.brand || '')}"><p class="sub">모르는 정보는 비워 둬도 돼요.</p><div class="swatches"><button class="chip" data-action="draft-color" data-color="" aria-pressed="${draft.color === null}">색 모름</button>${Object.entries(COLORS).map(([id, c]) => `<button class="sw" data-action="draft-color" data-color="${id}" aria-label="${c.label}" aria-pressed="${draft.color === id}"><i style="background:${c.hex}"></i></button>`).join('')}</div></details>
  <div class="cta registration-save"><button class="btn" data-action="draft-save"${!draft.kind || draft.processing || draft.saving ? ' disabled' : ''}>${draft.saving ? '저장 중…' : '옷장에 저장'}</button></div>`}
  ${draft.processing ? '<p role="status">사진 준비 중…</p>' : ''}${draft.photoError ? `<div class="photo-error"><p class="editor-error" role="alert">${esc(draft.photoError)}</p><div class="opts"><button class="chip" data-action="add-photo">다른 사진 고르기</button><button class="chip" data-action="add-camera">카메라로 촬영</button>${draft.kind ? '' : '<button class="chip" data-action="draft-manual">사진 없이 종류로</button>'}</div></div>` : ''}${draft.error ? `<p class="editor-error" role="alert">${esc(draft.error)}</p><button class="chip" data-action="reload-wardrobe">입력 유지하고 최신 옷장 불러오기</button>` : ''}
  </fieldset></div>`, { key: `garment:${draft.id}` });
}
async function chooseGarmentPhoto(file) {
  if (!draft) beginDraft();
  if (draft.saving) return;
  releaseDraftPhotoAnalysis(draft, { clearResults: true, keepRecognizer: !draft.recognizing });
  const current = draft,
    token = ++current.token;
  current.processing = true;
  current.error = '';
  current.photoError = '';
  addSheet();
  try {
    const asset = await prepareGarmentPhoto(file);
    if (draft !== current || current.token !== token) return;
    if (current.preview) URL.revokeObjectURL(current.preview);
    current.asset = asset;
    current.entryMode = 'photo';
    current.photoId = asset.id;
    current.photoMissing = false;
    current.preview = URL.createObjectURL(asset.blob);
  } catch (error) {
    if (draft === current && current.token === token) current.photoError = error?.message || '사진을 읽지 못했어요.';
  } finally {
    if (draft === current && current.token === token) {
      current.processing = false;
      addSheet();
    }
  }
  if (photoCanAutoAnalyze() && draft === current && current.token === token && current.asset && !current.error && !current.photoError)
    await analyzeDraftPhoto();
}
async function saveGarmentDraft() {
  const current = draft;
  if (!current || !current.kind || current.processing || current.saving) return;
  releaseDraftPhotoAnalysis(current);
  current.saving = true;
  current.error = '';
  addSheet();
  try {
    const wasDemo = state.demo;
    const actual = state.garments;
    const existing = actual.find((i) => i.id === current.id);
    if (current.before && JSON.stringify(existing) !== current.before)
      throw new Error('이 옷이 다른 화면에서 바뀌었어요. 최신 옷 정보를 다시 열어 확인해 주세요.');
    const item = makeGarment(current);
    item.photoMissing = !!current.photoMissing;
    let journeys = state.journeys;
    if (current.returnJourneyId) {
      const journey = state.journeys.find((j) => j.id === current.returnJourneyId);
      if (!journey) throw new Error('돌아갈 구매 기록이 없어졌어요. 입력은 유지했어요.');
      const form = journeyForms.get(journey.id);
      if (journey.stage !== 'candidate' && form && form.option !== journey.option)
        throw new Error('주문 후 바뀐 옵션은 여정에서 정보 정정 또는 새 옵션으로 먼저 확인해 주세요. 옷과 입력은 유지했어요.');
      const changes = { ...pendingJourneyForm(journey.id, journey), relatedGarmentIds: [...new Set([...journey.relatedGarmentIds,item.id])] };
      const updated = transitionPurchaseJourney(journey, 'note', { changes });
      journeys = journeys.map((j) => j.id === journey.id ? updated : j);
    }
    await set(
      { demo: false, demoSelected: [], garments: [...actual.filter((i) => i.id !== item.id), item], journeys, tab: 'closet' },
      { assets: current.asset ? [current.asset] : [] },
    );
    current.saving = false;
    closeSheet();
    if (current.returnJourneyId) {
      journeyForms.delete(current.returnJourneyId);
      journeySheet(current.returnJourneyId);
      toast('내 옷을 저장하고 구매 후보로 돌아왔어요');
      return;
    }
    if (current.returnLookId) {
      const updated = recommendLooks(state, { limit: 32, occasion: null, anchorItem: item }).find(
        (r) => r.look.id === current.returnLookId,
      );
      if (updated) {
        lastLooks = [updated];
        lookSheet(0);
      } else {
        ownSheet(item.id);
        toast('옷 정보가 바뀌어 코디를 다시 확인해 주세요');
        return;
      }
    }
    toast(wasDemo ? '내 옷을 저장했어요. 이제 예시를 빼고 등록한 내 옷만 반영해요' : '내 옷을 저장했어요');
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
    `<h2>이전 자료까지 전체 삭제</h2><p>이 브라우저의 현재·이전 옷장, 사진, 찜, 구매 여정·옵션·이유·이력, 취향, 복구용 사본을 삭제합니다. 다른 앱의 자료는 유지합니다. Claude 최신 버전의 기록·원문 사본도 포함됩니다. 이 앱에서는 해당 자료를 열거나 백업할 수 없으니 최신 버전에서 먼저 백업해 주세요.</p><p class="notice">되돌릴 수 없어요. 현재 옷장은 아래에서, 이전 버전 자료는 해당 버전에서 먼저 백업해 주세요. 다른 옷장 탭을 모두 닫아 주세요. 내려받은 백업 파일은 별도로 지워야 합니다.</p><button class="chip" data-action="backup">현재 옷장 사진 포함 백업</button><button class="chip" data-action="recovery-backup">현재 저장 원문 받기</button><p>${step === 2 ? '삭제 범위를 확인했습니다. 마지막 버튼을 누르면 삭제를 시작합니다.' : '범위를 확인한 뒤 한 번 더 확인합니다.'}</p><button class="btn" data-action="${step === 2 ? 'erase-execute' : 'erase-confirm'}">${step === 2 ? '확인한 옷장 자료 영구 삭제' : '삭제 범위 확인 후 계속'}</button>`,
  );
  eraseReviewStep = step;
}
function eraseFailureNotice(result) {
  const labels = {
    'eoul-wardrobe-v2': '현재 옷장·사진·구매 여정·복구 사본',
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
  releaseDraftPhotoAnalysis(draft, { clearResults: true });
  eraseReviewStep = 0;
  tastePicking = false;
  tasteBefore = null;
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
    candidateDraft = null;
    journeyForms.clear();
    pendingOptionChange = null;
    candidateGarmentReview = null;
    draft = null;
    restoreDraft = null;
    pendingLegacy = null;
    legacyChanged = false;
    query = '';
    searchAnchorId = null;
    lastLooks = [];
    state = wardrobeView(newWardrobeState());
    storageRevision = 0;
    storageEpoch = null;
    storageError = '';
    storageConflict = false;
  } catch (error) {
    failureResult = error.result || {};
    storageError =
      '전체 삭제를 완료하지 못했습니다. 아래 범위를 확인해 주세요. 미완료 표시를 유지하며 남은 이전 자료를 자동으로 가져오지 않습니다.';
    // Removed records must not remain usable in this tab after partial success.
    for (const url of photos.values()) URL.revokeObjectURL(url);
    if (draft?.preview) URL.revokeObjectURL(draft.preview);
    photoBlobs = new Map();
    photos = new Map();
    candidateDraft = null;
    journeyForms.clear();
    pendingOptionChange = null;
    candidateGarmentReview = null;
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
      `<h2>전체 삭제 미완료</h2><p role="alert">${esc(storageError)}</p>${eraseFailureNotice(failureResult)}<button class="chip" data-action="erase-review">범위를 다시 확인하고 재시도</button><button class="chip" data-action="recovery-backup">현재 저장소·이전 기록 원문 받기</button><p class="sub">이 파일에는 현재 저장소와 이전 옷장 기록만 담깁니다. 이전 사진과 Claude 최신 버전의 기록·원문 사본은 해당 버전에서 따로 백업해 주세요.</p>`,
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
    savedBtn.innerHTML = `${ICON.heart}구매 여정${state.journeys.length || state.saved.length ? `<span class="count">${state.journeys.length || state.saved.length}</span>` : ''}`;
}

async function downloadWardrobe(blob, name) {
  // claude.ai 미리보기 안에서는 그 화면의 파일 저장을 쓴다(.eoul은 허용 목록 밖이라 무압축 ZIP으로 감싼다)
  const downloads = window.claude?.use ? await window.claude.use('downloads').catch(() => null) : null;
  if (downloads) {
    try {
      await downloads.save({ filename: `${name}.zip`, data: await zipStore(name, blob) });
      toast('백업 파일을 저장했어요. 불러올 때 이 .zip 파일을 그대로 고르면 돼요');
    } catch (error) {
      toast(
        error?.code === 'declined'
          ? '백업 파일을 받지 않았어요'
          : '이 화면에서는 파일을 받을 수 없어요. 브라우저에서 앱 주소를 직접 열어 주세요.',
      );
    }
    return;
  }
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
  if (localStorage.getItem(WARDROBE_ERASE_PENDING_KEY) !== null) {
    toast('미완료된 전체 삭제를 먼저 마무리해 주세요. 원문 받기는 계속 사용할 수 있어요');
    return;
  }
  openSheet('<h2>백업 확인 중</h2><p>현재 옷장은 그대로입니다.</p>');
  const revision = sheetRevision;
  try {
    const inner = await unzipSingle(file);
    const parsed = await parseWardrobeBackup(inner ? inner.blob : file);
    if (sheetRevision !== revision) return;
    parsed.state = upgradeWardrobe(parsed.state);
    if (!storageReady) {
      parsed.recovery = await wardrobeStore.recoveryState();
      parsed.legacyRaw = localStorage.getItem(KEY);
      if (sheetRevision !== revision) return;
    }
    openSheet(
      `<h2>백업으로 바꿀까요?</h2><p>개인 옷 ${parsed.state.garments.length}벌 · 사진 ${parsed.assets.length}장</p>${parsed.recovery ? `<p class="notice">${parsed.recovery.schema > 5 ? '현재 자료는 이 앱이 지원하지 않는 새 버전입니다. ' : ''}현재 자료와 사진 ${parsed.recovery.photoCount}장을 복구용 사본으로 보존한 뒤, 확인한 백업으로 교체합니다. 기존 자료를 자동 변환하거나 영구 삭제하지 않습니다. 사본은 이 브라우저에 남습니다. 저장 원문 받기는 자료 형식·파일 크기에 따라 실패할 수 있어요. 중요한 원문은 교체 전에 먼저 내려받아 주세요.</p>` : `<p class="notice">현재 개인 옷 ${state.garments.length}벌 · 사진 ${photoBlobs.size}장 · 찜 ${state.saved.length}개 · 구매 여정 ${state.journeys.length}개와 취향을 교체합니다. 복구 사본을 만들지 않으니 필요한 기록은 먼저 백업해 주세요.</p>`}<button class="chip" data-action="${parsed.recovery ? 'recovery-backup' : 'backup'}">현재 자료 먼저 받기</button><button class="btn" data-action="restore-backup">${parsed.recovery ? '원문을 보존하고 이 백업으로 교체' : '이 백업으로 바꾸기'}</button>`,
    );
    restoreDraft = parsed;
  } catch (error) {
    if (sheetRevision === revision)
      openSheet(`<h2>백업 확인 필요</h2><p role="alert">${esc(storageMessage(error))}</p>`);
  }
}
async function reviewLegacyChanges() {
  if (localStorage.getItem(WARDROBE_ERASE_PENDING_KEY) !== null) {
    toast('미완료된 전체 삭제를 먼저 마무리해 주세요');
    return;
  }
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
    if (sheetRevision !== revision) return;
    openSheet(
      `<h2>이전 기록 확인 필요</h2><p role="alert">${esc(storageMessage(error))}</p><button class="chip" data-action="recovery-backup">원문 받기</button>`,
    );
  }
}

// ── Events: await durable writes before acknowledging or closing a draft.
document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  if (draft?.saving) { e.preventDefault(); return; }
  const a = el.dataset.action;
  if (erasingAll) {
    toast('옷장 자료 삭제 완료를 확인하고 있어요');
    return;
  }
  if (
    writeBusy &&
    tastePicking &&
    [
      'taste-start',
      'taste-cancel',
      'ob-gender',
      'toggle-style',
      'toggle-brand',
      'ob-next',
      'ob-back',
      'ob-done',
    ].includes(a)
  ) {
    toast('취향을 저장하고 있어요. 완료 후 다시 눌러 주세요');
    return;
  }
  try {
    switch (a) {
      case 'candidate-start':
        beginCandidate();
        break;
      case 'candidate-product':
        beginCandidate(el.dataset.id);
        break;
      case 'candidate-save':
        await saveCandidateDraft();
        break;
      case 'candidate-edit': {
        const j = state.journeys.find((row) => row.id === el.dataset.id);
        if (!j) break;
        candidateDraft = { id: j.id, journeyId: j.id, candidate: structuredClone(j.candidate), link: j.candidate.originalUrl, before: JSON.stringify(j), error: '', saving: false };
        candidateSheet();
        break;
      }
      case 'open-journey':
        pendingOptionChange = null;
        candidateGarmentReview = null;
        journeySheet(el.dataset.id);
        break;
      case 'option-correction-confirm':
        await confirmJourneyOptionChange();
        break;
      case 'option-fork-confirm':
        await confirmJourneyOptionChange(true);
        break;
      case 'candidate-garment-review':
        beginCandidateGarmentReview(el.dataset.id);
        break;
      case 'candidate-garment-apply':
        await applyCandidateGarmentReview();
        break;
      case 'candidate-garment-toggle':
        if (candidateGarmentReview?.fields.includes(el.dataset.field)) {
          if (el.checked) candidateGarmentReview.selected.add(el.dataset.field);
          else candidateGarmentReview.selected.delete(el.dataset.field);
        }
        break;
      case 'journey-fit':
      case 'journey-return-reason': {
        const j = state.journeys.find((row) => row.id === el.dataset.id);
        if (!j || !['received','kept','returned'].includes(j.stage)) break;
        const field = a === 'journey-fit' ? 'fit' : 'returnReason';
        await setJourneyField(j.id, 'feedback', { ...j.feedback, [field]: j.feedback[field] === el.dataset.value ? null : el.dataset.value });
        break;
      }
      case 'journey-hide-product': {
        const j = state.journeys.find((row) => row.id === el.dataset.id), productId = j?.candidate.productId;
        if (!productId) break;
        const hidden = state.hidden.includes(productId);
        await set({ hidden: hidden ? state.hidden.filter((id) => id !== productId) : [...state.hidden, productId] });
        journeySheet(j.id);
        toast(hidden ? '이 상품을 다시 추천에 포함해요' : '이 상품만 추천에서 제외했어요. 구매·반품 이유는 자동 제외에 쓰지 않아요');
        break;
      }
      case 'journey-fork': {
        const parent = state.journeys.find((j) => j.id === el.dataset.id);
        if (!parent) break;
        const sibling = createPurchaseJourney(parent.candidate);
        sibling.forkedFrom = parent.id;
        sibling.absence = parent.absence;
        sibling.intent = parent.intent;
        sibling.relatedGarmentIds = [...parent.relatedGarmentIds];
        await set({ journeys: [...state.journeys, sibling], tab: 'saved' });
        journeySheet(sibling.id);
        toast('원래 기록은 유지하고 다른 옵션의 기록을 만들었어요. 고른 색·사이즈를 확인해 주세요');
        break;
      }
      case 'journey-field':
        await setJourneyField(el.dataset.id, el.dataset.field, el.dataset.value);
        break;
      case 'journey-receipt-repair': {
        const pending = state.journeys.find((row) => row.id === el.dataset.id);
        if (pending) { pendingJourneyForm(pending.id, pending); if (showJourneyOptionChange(pending, 'note')) break; }
        const j = state.journeys.find((row) => row.id === el.dataset.id);
        if (!j?.garmentId || state.garments.some((item) => item.id === j.garmentId)) break;
        const c = j.candidate;
        beginDraft();
        Object.assign(draft, makeGarment({ id: j.garmentId, kind: c.kind, slot: c.classificationConfirmed ? c.slot : null, color: c.colorSource === 'image' ? null : c.color, brand: c.brand || null, label: c.name, productId: c.productId, gender: c.gender.toUpperCase() }));
        draft.returnJourneyId = j.id;
        addSheet();
        break;
      }
      case 'journey-check-own': {
        const pending = state.journeys.find((row) => row.id === el.dataset.id);
        if (pending) { pendingJourneyForm(pending.id, pending); if (showJourneyOptionChange(pending, 'note')) break; }
        const item = state.garments.find((i) => i.id === el.dataset.item);
        if (!item) break;
        beginDraft(item, null, { confirmDetails: true });
        draft.returnJourneyId = el.dataset.id;
        addSheet();
        break;
      }
      case 'journey-related': {
        const j = state.journeys.find((row) => row.id === el.dataset.id);
        if (!j) break;
        await setJourneyField(j.id, 'relatedGarmentIds', j.relatedGarmentIds.includes(el.dataset.item) ? j.relatedGarmentIds.filter((id) => id !== el.dataset.item) : [...j.relatedGarmentIds, el.dataset.item]);
        break;
      }
      case 'journey-replacement':
        await setJourneyField(el.dataset.id, 'replacementGarmentId', el.dataset.item);
        break;
      case 'journey-note':
        await recordJourneyAction(el.dataset.id, 'note');
        break;
      case 'journey-action':
        await recordJourneyAction(el.dataset.id, el.dataset.step);
        break;
      case 'journey-add-own': {
        const pending = state.journeys.find((row) => row.id === el.dataset.id);
        if (pending) { pendingJourneyForm(pending.id, pending); if (showJourneyOptionChange(pending, 'note')) break; }
        const j = state.journeys.find((row) => row.id === el.dataset.id);
        if (!j) break;
        beginDraft();
        draft.kind = j.candidate.kind;
        draft.gender = j.candidate.gender.toUpperCase();
        draft.confirmDetails = true;
        draft.returnJourneyId = j.id;
        addSheet();
        break;
      }
      case 'journey-return-review':
        openSheet(`<h2>반품 기록을 남길까요?</h2><p>연결된 옷은 보유 코디와 추천에서 제외합니다. 옷 기록과 사진, 구매 여정은 보관해요. 실제 반품 신청·환불은 판매처에서 처리해야 합니다.</p><button class="btn" data-action="journey-action" data-id="${esc(el.dataset.id)}" data-step="returned">판매처에 반품했다고 기록</button>`);
        break;
      case 'journey-retire-review':
        openSheet(`<h2>이전 옷을 보유 목록에서 뺄까요?</h2><p>실제로 처분했거나 더 이상 입지 않는 이전 옷만 정리해 주세요. 옷과 사진은 보관하고 보유 추천에서 제외해요.</p><button class="btn" data-action="journey-field" data-id="${esc(el.dataset.id)}" data-field="replacementConfirmed" data-value="true">이전 옷을 보유 추천에서 제외</button>`);
        break;
      case 'ob-gender':
        if (tastePicking) state = { ...state, gender: el.dataset.g, styles: [], brands: [] };
        else await set({ gender: el.dataset.g, styles: [], brands: [] });
        obStep = 2;
        render();
        break;
      case 'taste-start':
        tasteBefore = state;
        tastePicking = true;
        obStep = 1;
        render();
        window.scrollTo(0, 0);
        break;
      case 'taste-cancel':
        tastePicking = false;
        if (tasteBefore) state = tasteBefore;
        tasteBefore = null;
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
        const styles = has ? state.styles.filter((x) => x !== k) : [...state.styles, k];
        if (tastePicking) {
          state = { ...state, styles };
          render();
          break;
        }
        await set({ styles, ...(state.demo && styles.length ? { demoSelected: demoFor(state.gender, styles) } : {}) });
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
        const brands = state.brands.includes(b) ? state.brands.filter((x) => x !== b) : [...state.brands, b];
        if (tastePicking) {
          state = { ...state, brands };
          render();
          break;
        }
        await set({ brands });
        if (a === 'toggle-brand-sheet') optionSheet('brands');
        break;
      }
      case 'ob-done': {
        const pick = { gender: state.gender, styles: myStyles(), brands: state.brands };
        const picking = tastePicking;
        const candidate = state;
        const before = tasteBefore;
        if (picking) state = before || state;
        try {
          await set({
            ...pick,
            onboarded: true,
            tab: 'home',
            ...(state.demo ? { demoSelected: demoFor(pick.gender, pick.styles) } : {}),
          });
          tastePicking = false;
          tasteBefore = null;
          render();
        } catch (error) {
          if (picking) {
            const liveBase = tasteBefore || before || candidate;
            state = { ...liveBase, gender: candidate.gender, styles: candidate.styles, brands: candidate.brands };
            tasteBefore = liveBase;
            tastePicking = true;
          }
          throw error;
        }
        window.scrollTo(0, 0);
        break;
      }
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
          ...(state.demo ? { demoSelected: demoFor(el.dataset.g, stylesFor(el.dataset.g).slice(0, 1)) } : {}),
        });
        optionSheet('profile');
        break;
      case 'reset':
        if (el.dataset.armed !== '1') {
          el.dataset.armed = '1';
          el.textContent = '한 번 더 누르면 현재 옷장·찜·구매 기록을 비워요';
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
        searchAnchorId = null;
        render();
        break;
      case 'example':
        searchAnchorId = null;
        query = el.dataset.q;
        render();
        break;
      case 'tab':
        closeSheet();
        if (el.dataset.tab === 'home' && state.tab === 'home') {
          query = '';
          searchAnchorId = null;
        }
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
        toast('구매 후보를 찜했어요');
        break;
      }
      case 'own-product': {
        const wasDemo = state.demo;
        const p = PRODUCT_BY_ID[el.dataset.id];
        if (!p) break;
        if (!state.demo && state.closet.some((i) => i.productId === p.id)) {
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
          garments: [...state.garments, item],
          gender: item.gender,
          styles: state.styles.filter((k) => STYLES[k]?.g.includes(item.gender)).length
            ? state.styles.filter((k) => STYLES[k]?.g.includes(item.gender))
            : stylesFor(item.gender).slice(0, 1),
          tab: 'closet',
        });
        closeSheet();
        toast(wasDemo ? '내 옷장에 저장했어요. 이제 예시를 빼고 등록한 내 옷만 반영해요' : '내 옷장에 저장했어요');
        break;
      }
      case 'clear-anchor':
        searchAnchorId = null;
        render();
        break;
      case 'confirm-own-kind': {
        const item = state.garments.find((i) => i.id === el.dataset.id);
        if (item) beginDraft(item, null, { confirmDetails: true, returnLookId: el.dataset.look });
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
        searchAnchorId = item.id;
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
      case 'add-camera':
        if (!draft) beginDraft();
        document.getElementById('camera-photo-input')?.click();
        break;
      case 'draft-manual':
        if (draft) { draft.entryMode = 'manual'; addSheet(); }
        break;
      case 'draft-kind':
      case 'photo-kind':
        if (draft) {
          if (!GARMENT_KINDS.some((k) => k.id === el.dataset.kind) ||
              !SLOTS.some((s) => s.g === draft.gender && s.shape === el.dataset.kind)) break;
          if (el.dataset.action === 'photo-kind' && !draft.photoRecognition?.kinds?.some((x) => x.kind === el.dataset.kind)) break;
          draft.kind = el.dataset.kind;
          if (draft.entryMode === 'choice') draft.entryMode = 'manual';
          draft.slot = null;
          draft.productId = null;
          refreshPhotoIdentity();
          addSheet();
        }
        break;
      case 'draft-color':
      case 'photo-color':
        if (draft) {
          if (el.dataset.color && !COLORS[el.dataset.color]) break;
          if (el.dataset.action === 'photo-color' && !draft.photoRecognition?.colors?.some((x) => x.color === el.dataset.color)) break;
          draft.color = el.dataset.color || null;
          const p = PRODUCT_BY_ID[draft.productId];
          if (p?.color && p.colorSource !== 'image' && p.color !== draft.color) draft.productId = null;
          refreshPhotoIdentity();
          addSheet();
        }
        break;
      case 'photo-text-match':
        if (draft && !draft.saving) {
          draft.photoDetailsOpen = true;
          draft.labelTextRevision++;
          draft.identitySource = 'text';
          refreshPhotoIdentity();
          addSheet();
        }
        break;
      case 'photo-brand': {
        if (!draft || !['text', 'label'].includes(draft.identitySource)) break;
        draft.photoDetailsOpen = true;
        const identity = draft.photoIdentity;
        if (!identity?.brands.some((x) => x.brand === el.dataset.brand) && identity?.unknownBrandText !== el.dataset.brand) break;
        draft.brand = el.dataset.brand;
        if (draft.productId && PRODUCT_BY_ID[draft.productId]?.brand !== draft.brand) draft.productId = null;
        draft.photoReview = null;
        addSheet();
        break;
      }
      case 'photo-candidate-review': {
        if (!draft || !['text', 'label'].includes(draft.identitySource)) break;
        draft.photoDetailsOpen = true;
        const candidate = draft.photoIdentity?.candidates.find((x) => x.productId === el.dataset.id);
        if (!candidate) break;
        if (candidate.conflicts.length || (draft.brand && draft.brand !== candidate.brand)) {
          draft.recognitionError = '확인한 종류·색·브랜드와 다른 후보예요. 같은 상품으로 연결하지 않았어요.';
          draft.photoReview = null;
        } else {
          draft.recognitionError = '';
          draft.photoReview = { id: candidate.productId, analysisToken: draft.analysisToken, colorConfirmed: false,
    values: JSON.stringify([draft.kind, draft.color, draft.brand, draft.label, draft.photoId, draft.slot, draft.productId]) };
        }
        addSheet();
        break;
      }
      case 'photo-product-color': {
        const review = draft?.photoReview;
        const candidate = draft?.photoIdentity?.candidates.find((x) => x.productId === el.dataset.id);
        if (!review || review.id !== el.dataset.id || review.analysisToken !== draft.analysisToken ||
            !photoCandidateCanLink(candidate)) break;
        review.colorConfirmed = true;
        addSheet();
        break;
      }
      case 'photo-candidate-confirm': {
        const review = draft?.photoReview;
        if (!review || review.id !== el.dataset.id || review.analysisToken !== draft.analysisToken ||
            review.values !== JSON.stringify([draft.kind, draft.color, draft.brand, draft.label, draft.photoId, draft.slot, draft.productId])) break;
        const candidate = draft.photoIdentity?.candidates.find((x) => x.productId === review.id);
        const p = PRODUCT_BY_ID[review.id], slot = SLOT_BY_ID[p?.slot];
        if (!photoCandidateCanLink(candidate) || candidate.conflicts.length || !p || !slot || slot.g !== draft.gender ||
            (draft.brand && draft.brand !== p.brand)) break;
        if (!draft.color && p.color && p.colorSource !== 'image' && !review.colorConfirmed) break;
        draft.productId = p.id;
        draft.slot = slot.id;
        draft.kind = slot.shape;
        draft.brand = p.brand;
        if (!draft.label) draft.label = p.name.slice(0, 80);
        if (!draft.color && review.colorConfirmed && p.colorSource !== 'image') draft.color = p.color || null;
        draft.photoReview = null;
        addSheet();
        break;
      }
      case 'photo-label-picker':
        if (draft && !draft.saving) { draft.photoDetailsOpen = true; document.getElementById('label-photo-input')?.click(); }
        break;
      case 'photo-start':
        if (draft && !draft.saving && !draft.processing) {
          photoAnalysisAllowed = true;
          await analyzeDraftPhoto();
        }
        break;
      case 'photo-cancel':
        if (draft) { releaseDraftPhotoAnalysis(draft); addSheet(); }
        break;
      case 'photo-retry':
        await analyzeDraftPhoto();
        break;
      case 'draft-slot': {
        if (!draft) break;
        const slot = SLOT_BY_ID[el.dataset.slot];
        if (el.dataset.slot && (!slot || slot.g !== draft.gender || slot.shape !== draft.kind)) break;
        draft.slot = slot?.id || null;
        draft.photoReview = null;
        if (draft.productId && PRODUCT_BY_ID[draft.productId]?.slot !== draft.slot) draft.productId = null;
        addSheet();
        break;
      }
      case 'clear-photo':
        if (draft) {
          releaseDraftPhotoAnalysis(draft, { clearResults: true });
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
        else if (candidateDraft) candidateSheet();
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
          if (writeBusy || bootBusy) throw new Error('저장소 작업을 마무리하고 있어요. 완료 후 다시 눌러 주세요.');
          writeBusy = true;
          try {
            await wardrobeStore.commit(pending.state, 0, pending.assets);
            pendingLegacy = null;
            await bootWardrobe();
          } finally {
            writeBusy = false;
          }
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
    if (candidateDraft) {
      candidateDraft.error = storageError;
      candidateSheet();
    } else if (draft) {
      draft.error = storageError;
      addSheet();
    } else toast(storageError);
  }
});
document.addEventListener('input', (e) => {
  const id = e.target.id, value = e.target.value;
  if (candidateDraft && !candidateDraft.saving) {
    if (id === 'candidate-link') candidateDraft.link = value;
    if (candidateDraft.candidate) {
      const c = candidateDraft.candidate;
      if (id === 'candidate-name') c.name = value;
      if (id === 'candidate-brand') c.brand = value;
      if (id === 'candidate-price') {
        c.price = value.trim() ? Number(value) : null;
        c.priceSource = c.price === null ? null : 'user';
        c.checkedAt = c.price === null ? null : new Date().toISOString();
      }
    }
  }
  if (['journey-option', 'journey-reason'].includes(id)) {
    const form = journeyForms.get(e.target.dataset?.journey);
    if (form) form[id === 'journey-option' ? 'option' : 'reason'] = value;
  }
  if (!draft) return;
  if (draft.saving) return;
  if (e.target.id === 'photo-label-text') {
    draft.labelTextRevision++;
    draft.labelText = e.target.value.slice(0, 1200);
    draft.identitySource = null;
    draft.photoReview = null;
  }
  if (e.target.id === 'garment-label') draft.label = e.target.value;
  if (e.target.id === 'garment-brand') {
    draft.brand = e.target.value || null;
    if (draft.productId && PRODUCT_BY_ID[draft.productId]?.brand !== draft.brand) draft.productId = null;
  }
});
document.addEventListener('change', async (e) => {
  try {
    if (candidateDraft?.candidate && !candidateDraft.saving) {
      const c = candidateDraft.candidate;
      if (e.target.id === 'candidate-kind') { c.kind = e.target.value || null; c.slot = null; c.classificationConfirmed = false; candidateSheet(); }
      if (e.target.id === 'candidate-slot') { c.slot = e.target.value || null; c.classificationConfirmed = !!c.slot; candidateSheet(); }
      if (e.target.id === 'candidate-color') { c.color = e.target.value || null; c.colorSource = c.color ? 'user' : null; }
    }
    if (e.target.id === 'photo-brand-line' && draft && !draft.saving &&
        ['label', 'text'].includes(draft.identitySource) && photoLabelLines().includes(e.target.value)) {
      draft.brand = e.target.value;
      draft.productId = null;
      draft.photoReview = null;
      addSheet();
    }
    if (e.target.dataset?.action === 'candidate-garment-toggle' && candidateGarmentReview?.fields.includes(e.target.dataset.field)) {
      if (e.target.checked) candidateGarmentReview.selected.add(e.target.dataset.field);
      else candidateGarmentReview.selected.delete(e.target.dataset.field);
    }
    if (e.target.dataset?.action === 'journey-own-color') await saveJourneyGarmentCheck(e.target.dataset.id, e.target.dataset.item, e.target.value);
    if (e.target.id === 'brand-only') await set({ brandOnly: e.target.checked });
    if (['photo-input', 'camera-photo-input'].includes(e.target.id) && e.target.files?.[0]) {
      const file = e.target.files[0];
      e.target.value = '';
      await chooseGarmentPhoto(file);
    }
    if (e.target.id === 'label-photo-input' && e.target.files?.[0]) {
      const file = e.target.files[0];
      e.target.value = '';
      const current = draft, token = current?.token;
      if (!current || current.saving) return;
      const labelToken = ++current.labelToken;
      const textRevision = current.labelTextRevision;
      try {
        const asset = await prepareGarmentPhoto(file);
        if (draft === current && current.token === token && current.labelToken === labelToken &&
            current.labelTextRevision === textRevision)
          await analyzeDraftPhoto({ mode: 'label', file: asset.blob });
      } catch (error) {
        if (draft === current && current.token === token && current.labelToken === labelToken) {
          current.recognitionError = error?.message || '라벨 사진을 읽지 못했어요.'; addSheet();
        }
      }
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
  const candidateForm = e.target.closest('form[data-action="candidate-link"]');
  if (candidateForm) {
    e.preventDefault();
    if (!candidateDraft || candidateDraft.saving) return;
    candidateDraft.link = candidateForm.link.value.trim();
    try { candidateDraft.candidate = candidateFromLink(candidateDraft.link, { gender: (state.gender || 'M').toLowerCase() }); candidateDraft.error = ''; }
    catch (error) { candidateDraft.error = error.message; }
    candidateSheet();
    return;
  }
  const form = e.target.closest('form[data-action="ask"]');
  if (!form) return;
  e.preventDefault();
  const submitted = form.q.value.trim();
  if (/^https?:\/\//i.test(submitted)) {
    try { beginCandidate(submitted); }
    catch (error) { beginCandidate(); candidateDraft.link = submitted; candidateDraft.error = error.message; candidateSheet(); }
    form.q.blur();
    return;
  }
  searchAnchorId = null;
  query = submitted;
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

// 상품 사진을 못 불러오면 색 카드로 바꾼다
document.addEventListener(
  'error',
  (e) => {
    const img = e.target;
    if (img instanceof HTMLImageElement && img.dataset.ownPhoto) {
      const t = document.createElement('template');
      t.innerHTML = `<span class="photo-display-failed">${ICON.camera}<span>사진 표시 실패</span><small>상세에서 다시 선택</small></span>`;
      img.replaceWith(t.content.firstChild);
      return;
    }
    const slot = img instanceof HTMLImageElement && SLOT_BY_ID[img.dataset.slot];
    if (!slot) return;
    const t = document.createElement('template');
    t.innerHTML = swatch(slot, img.dataset.color || null);
    img.replaceWith(t.content.firstChild);
  },
  true,
);

render();
const appReady = bootWardrobe();
