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
import { createWardrobeStore, parseWardrobeBackup, legacyWardrobeFingerprint, journeyStorageUsage, wardrobeStateStorageUsage, photoAsset } from './wardrobe-store.js';
import { AGREEMENT_VERSION, accountServer, readAccount, writeAccount, clearAccount, createAccountApi, isEmptyWardrobe, syncDecision, pushWardrobe, pullWardrobe, withDeviceFields, sameWardrobe, wardrobeSummary } from './account.js';
import { eraseWardrobeData, WARDROBE_ERASE_PENDING_KEY } from './wardrobe-erase.js';
import { prepareGarmentPhoto, prepareGarmentPhotoWithSource, photoAssetFromSource, photoAssetWithoutBackground, photoPixels, normalizeCrop, dragCrop } from './garment-photo.js';
import { createBackgroundRemover, maskCoverage, BACKGROUND_DOWNLOAD_LABEL, BACKGROUND_MASK_SIZE } from './background-removal.js';
import { keepMainSubject } from './mask-cleanup.js';
import { createPhotoRecognizer } from './photo-recognition.js';
import { suggestPhotoIdentity } from './photo-identity.js';
import { findOwnedCatalog } from './owned-catalog.js';
import { readStorageHealth, requestPersistence, lastBackupAt, markBackup, clearBackupRecord, backupDue, isStandaloneApp, isAppleTouchBrowser, formatBytes } from './storage-health.js';
import { prepareLegacyWardrobe } from './legacy-photos.js';
import { candidateFromLink, candidateFromProduct, compareCandidate } from './purchase-candidate.js';
import { wardrobePlan, describeGarment } from './wardrobe-plan.js';
import { validateOffer, compareOffers, mergeRefreshed, OFFER_FLAG_LABEL, OFFER_SOURCE_LABEL, OFFER_STALE_DAYS } from './offers.js';
import { readOffers, writeOffers, offerRef, clearOffers } from './offer-store.js';
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
// 보관 상태: 브라우저가 알려 주는 값만 보여 준다(보관을 보장하지 않는다)
let storageHealth = null, persistenceAsked = false, backupNudgeDismissed = false;
let returnFocus = null;
let candidateDraft = null;
let photoRecognizerFactory = () => createPhotoRecognizer();
// A deliberate first action precedes large public model downloads. This is
// session-only; it does not alter wardrobe state or claim the cache exists.
let photoAnalysisAllowed = false;
// 배경 지우기: 처음 쓸 때 내려받기 동의를 받고(이 세션 동안 유지), 도구는 세션 동안 하나만 쓴다.
let backgroundRemoverFactory = () => createBackgroundRemover();
let backgroundRemover = null;
let backgroundAllowed = false;
// 로그인한 동안 서버가 배경 처리를 켰으면 서버의 큰 모델을 쓴다. 한 번 실패하면 이 세션은 기기 도구로 지운다.
let backgroundServerOff = false;
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
    kickSync();
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
    kickSync();
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
    accountNotice() +
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
    ${planSection()}
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

// ── 판매처·총액 비교: 같은 상품·옵션·재고·배송비가 확인된 판매처만 총액을 비교한다
let offerView = null;
function beginOffers({ productId = null, journeyId = null }) {
  const product = productId ? PRODUCT_BY_ID[productId] : null;
  const journey = journeyId ? state.journeys.find((j) => j.id === journeyId) : null;
  const c = journey?.candidate;
  const ref = offerRef(product ? { productId: product.id } : { productId: c?.productId, url: c?.url });
  if (!ref) { toast('비교할 상품 주소를 확인해 주세요'); return; }
  const productFromJourney = c?.productId ? PRODUCT_BY_ID[c.productId] : null;
  offerView = {
    ref,
    productId: product?.id || c?.productId || null,
    catalog: product || productFromJourney || null,
    url: product?.url || c?.url,
    name: product?.name || c?.name || '',
    brand: product?.brand || c?.brand || '',
    defaultColor: product ? (product.colorSource === 'image' ? null : product.color) : (c?.colorSource === 'image' ? null : c?.color) || null,
    form: null,
    error: '',
    refreshing: false,
  };
  offerSheet();
}
function catalogOffer(product) {
  try {
    return validateOffer({ id: `catalog:${product.id}`, seller: product.store, url: product.url, price: product.price, shipping: null,
      color: product.colorSource === 'image' ? null : product.color, stock: 'unknown', sameProduct: 'confirmed', source: 'catalog',
      checkedAt: `${product.checkedAt}T00:00:00.000Z`, title: product.name });
  } catch {
    return null;
  }
}
function offerTime(iso) {
  const at = new Date(iso);
  return `${at.getFullYear()}. ${at.getMonth() + 1}. ${at.getDate()}. ${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
}
function offerSheet() {
  const v = offerView;
  if (!v) return;
  const data = readOffers(localStorage, v.ref);
  const requested = { color: data.requested.color ?? v.defaultColor, size: data.requested.size };
  const fromCatalog = v.catalog ? catalogOffer(v.catalog) : null;
  const all = [...(fromCatalog ? [fromCatalog] : []), ...data.offers.filter((offer) => offer.source !== 'catalog')];
  const result = compareOffers(all, { requested, now: new Date() });
  const rows = [...result.comparable, ...result.others];
  const optionText = (offer) => [offer.color ? COLORS[offer.color]?.label : null, offer.size].filter(Boolean).join(' / ') || '옵션 미확인';
  const row = ({ offer, flags, total }) => `<li class="offer-row${flags.length ? '' : ' comparable'}">
    <div><b>${esc(offer.seller)}</b> <span class="fine">${esc(OFFER_SOURCE_LABEL[offer.source])}</span></div>
    ${offer.title && offer.source !== 'catalog' ? `<div class="fine">${esc(offer.title)}</div>` : ''}
    <div>${formatPrice(offer.price)} + 배송비 ${offer.shipping === null ? '미확인' : formatPrice(offer.shipping)}${total === null ? '' : ` = <b>${formatPrice(total)}</b>`}</div>
    <div class="fine">${esc(optionText(offer))} · ${offer.stock === 'sold-out' ? '품절' : offer.stock === 'in-stock' ? '재고 있음' : '재고 미확인'} · ${offer.source === 'catalog' ? `${esc(v.catalog.checkedAt)} 수집` : `${offerTime(offer.checkedAt)} 확인`}</div>
    ${flags.length ? `<div class="offer-flags">${flags.map((flag) => `<span class="offer-flag">${esc(OFFER_FLAG_LABEL[flag])}</span>`).join('')}</div>` : '<div class="offer-flags"><span class="offer-flag ok">총액 비교에 포함</span></div>'}
    <div class="opts"><a class="chip" href="${esc(offer.url)}" target="_blank" rel="noopener noreferrer">판매처에서 보기</a><button class="chip" data-action="offer-edit" data-id="${esc(offer.id)}">${offer.source === 'catalog' ? '오늘 가격 기록' : '확인·수정'}</button>${offer.source !== 'catalog' ? `<button class="link" data-action="offer-delete" data-id="${esc(offer.id)}">삭제</button>` : ''}</div>
  </li>`;
  const best = result.best
    ? `<div class="notice offer-best"><b>확인한 판매처 ${result.comparable.length}곳 중 총액이 가장 낮은 곳: ${esc(result.best.offer.seller)} ${formatPrice(result.best.total)}</b><p>상품 ${formatPrice(result.best.offer.price)} + 배송비 ${formatPrice(result.best.offer.shipping)} · ${offerTime(result.best.offer.checkedAt)} 확인. 지금 이 가격이거나 현재 최저가라는 뜻은 아니에요.</p></div>`
    : `<div class="notice"><b>총액을 비교할 수 있는 판매처가 아직 없어요</b><p>같은 상품·같은 옵션·재고 있음·배송비 확인·${OFFER_STALE_DAYS}일 이내 확인이 모두 맞아야 비교해요.${Object.keys(result.reasons).length ? ` 지금 빠진 이유: ${Object.entries(result.reasons).map(([flag, count]) => `${OFFER_FLAG_LABEL[flag]} ${count}`).join(' · ')}` : ''}</p></div>`;
  const supply = accountHealth?.supply || [];
  const canRefresh = signedIn() && accountHealth?.features?.offers;
  const refreshInfo = data.refresh ? `<p class="fine">마지막 갱신 ${offerTime(data.refresh.at)} · ${data.refresh.ok ? '성공' : `실패: ${esc(data.refresh.message || '')} (이전 기록은 그대로 두었어요)`}</p>` : '';
  const sources = `<details class="garment-name"><summary>가격 출처 연결 상태</summary><ul class="plain-list">${supply.length
    ? supply.map((source) => `<li><b>${esc(source.name)}</b>: ${source.status === 'connected' ? '연결됨' : source.status === 'collected' ? '수집가(현재 가격 아님)' : `미연동${source.needs?.length ? ` · 필요: ${esc(source.needs.join(', '))}` : ''}`}</li>`).join('')
    : '<li>이 앱에는 아직 실시간 가격 연동이 없어요. 판매처 가격은 직접 기록하거나, 운영자 서버에 가격 출처를 연결하면 갱신할 수 있어요.</li>'}</ul></details>`;
  const f = v.form;
  const form = f ? `<form data-action="offer" class="account-form offer-form">
      <h3 class="block">${f.id ? '판매처 가격 확인·수정' : '판매처 가격 직접 기록'}</h3>
      <label for="offer-seller">판매처</label><input id="offer-seller" name="seller" maxlength="60" value="${esc(f.seller || '')}" required>
      <label for="offer-url">판매처 상품 링크</label><input id="offer-url" name="url" type="url" value="${esc(f.url || '')}" required>
      <label for="offer-price">상품 가격(원)</label><input id="offer-price" name="price" inputmode="numeric" value="${esc(f.price ?? '')}" required>
      <label for="offer-shipping">배송비(원, 모르면 비워 두기)</label><input id="offer-shipping" name="shipping" inputmode="numeric" value="${esc(f.shipping ?? '')}">
      <label for="offer-color">색</label><select id="offer-color" name="color"><option value="">모름</option>${Object.entries(COLORS).map(([id, c]) => `<option value="${id}"${f.color === id ? ' selected' : ''}>${c.label}</option>`).join('')}</select>
      <label for="offer-size">사이즈</label><input id="offer-size" name="size" maxlength="20" value="${esc(f.size || '')}" placeholder="예: M, 270">
      <label for="offer-stock">재고</label><select id="offer-stock" name="stock">${[['unknown', '모름'], ['in-stock', '재고 있음'], ['sold-out', '품절']].map(([id, label]) => `<option value="${id}"${f.stock === id ? ' selected' : ''}>${label}</option>`).join('')}</select>
      <label class="toggle"><input type="checkbox" name="sameProduct"${f.sameProduct === 'confirmed' ? ' checked' : ''}> 이 상품과 같은 상품이에요(모델·품번 확인)</label>
      ${v.error ? `<p class="notice" role="alert">${esc(v.error)}</p>` : ''}
      <button class="btn" type="submit">기록하기</button><button class="link" type="button" data-action="offer-form-cancel">취소</button>
      <p class="fine">기록한 시각을 함께 남겨요. 이 기기에만 저장되고, 아직 옷장 백업·계정 동기화에는 들어가지 않아요.</p>
    </form>` : `<div class="opts"><button class="chip" data-action="offer-add">판매처 가격 직접 기록</button>${canRefresh ? `<button class="chip" data-action="offer-refresh"${v.refreshing ? ' disabled' : ''}>${v.refreshing ? '확인하는 중…' : '연결된 출처에서 다시 확인'}</button>` : ''}</div>`;
  openSheet(`<h2>판매처·총액 비교</h2>
    <p class="sub">${esc([v.brand, v.name].filter(Boolean).join(' ') || '가져온 상품')}</p>
    <h3 class="block">사려는 옵션</h3>
    <div class="candidate-fields"><label>색<select id="offer-requested-color" data-action="offer-requested"><option value="">아직 모름</option>${Object.entries(COLORS).map(([id, c]) => `<option value="${id}"${requested.color === id ? ' selected' : ''}>${c.label}</option>`).join('')}</select></label><label>사이즈<input id="offer-requested-size" data-action="offer-requested" maxlength="20" value="${esc(requested.size || '')}" placeholder="예: M"></label></div>
    ${!result.requestedComplete ? '<p class="fine">색과 사이즈를 정하면 같은 옵션의 판매처만 비교해요.</p>' : ''}
    ${best}
    <ul class="offer-list">${rows.map(row).join('')}</ul>
    ${refreshInfo}
    ${form}
    ${sources}
    <p class="fine">쿠폰·카드 할인·적립금은 판매처마다 달라 넣지 않았어요. 결제 전에 판매처에서 최종 금액을 확인해 주세요.</p>`, { key: `offers:${v.ref}` });
}
function offerFormFrom(offer) {
  return { id: offer.id, seller: offer.seller, url: offer.url, price: offer.price, shipping: offer.shipping, color: offer.color, size: offer.size, stock: offer.stock, sameProduct: offer.sameProduct, source: offer.source, title: offer.title };
}
function saveOfferForm(fields) {
  const v = offerView;
  if (!v?.form) return false;
  const data = readOffers(localStorage, v.ref);
  const numberOrNull = (value) => (value === '' || value === null || value === undefined ? null : Number(String(value).replace(/[,\s원]/g, '')));
  const editingCatalog = v.form.source === 'catalog';
  try {
    const offer = validateOffer({
      id: editingCatalog || !v.form.id ? undefined : v.form.id,
      seller: fields.seller, url: fields.url, price: numberOrNull(fields.price), shipping: numberOrNull(fields.shipping),
      color: fields.color || null, size: fields.size || null, stock: fields.stock || 'unknown',
      sameProduct: fields.sameProduct ? 'confirmed' : 'unconfirmed',
      // A search result the user corrects becomes the user's own record.
      source: 'user', checkedAt: new Date().toISOString(), title: v.form.title || null,
    });
    const offers = data.offers.filter((o) => o.id !== v.form.id);
    if (!writeOffers(localStorage, v.ref, { ...data, offers: [...offers, offer] })) throw new Error('이 기기에 저장하지 못했어요. 입력은 그대로 두었어요.');
    v.form = null;
    v.error = '';
    offerSheet();
    return true;
  } catch (error) {
    v.form = { ...v.form, ...fields, sameProduct: fields.sameProduct ? 'confirmed' : 'unconfirmed' };
    v.error = error.message;
    offerSheet();
    return false;
  }
}
async function refreshOffers() {
  const v = offerView;
  if (!v || v.refreshing || !signedIn()) return;
  v.refreshing = true;
  offerSheet();
  const data = readOffers(localStorage, v.ref);
  const at = new Date().toISOString();
  try {
    const result = await accountApi().offers({ productId: v.productId, q: [v.brand, v.name].filter(Boolean).join(' ') });
    let offers = data.offers;
    for (const source of result.sources)
      if (source.status === 'connected')
        offers = mergeRefreshed(offers, result.offers.filter((offer) => offer.source === source.id && offer.source !== 'catalog'), source.id);
    const failed = result.sources.filter((source) => source.status === 'failed');
    writeOffers(localStorage, v.ref, { ...data, offers, refresh: { at, ok: !failed.length, message: failed.map((source) => `${source.name}: ${source.message}`).join(' · ') } });
  } catch (error) {
    if (error?.status === 401) syncFailed(error);
    writeOffers(localStorage, v.ref, { ...data, refresh: { at, ok: false, message: error?.message || '가격을 확인하지 못했어요.' } });
  } finally {
    if (offerView === v) {
      v.refreshing = false;
      offerSheet();
    }
  }
}

// ── 내 옷장 기준 다음 한 벌: 실제 옷 → 확인 필요·겹침 → 부족한 종류 → 실제 상품·가격 출처·링크
const ROLE_NAME = { outer: '아우터', top: '상의', inner: '이너', bottom: '하의', shoes: '신발', acc: '소품' };
function planBasisLine(plan) {
  if (plan.basis.kind === 'example') return `예시 옷 ${plan.basis.garmentCount}벌로 보는 진단이에요. 실제 내 옷이 아니에요.`;
  if (plan.basis.kind === 'empty') return '등록한 내 옷이 없어요.';
  return `등록한 내 옷 ${plan.basis.garmentCount}벌 중 종류·색을 확인한 ${plan.analysed.length}벌로 계산했어요.`;
}
function collectedPrice(entry) {
  const p = entry.product;
  return `<b>${formatPrice(entry.price.amount)}</b><span class="fine">${esc(entry.price.store)} 표시가 · ${esc(entry.price.collectedOn)} 수집</span>`;
}
function planProductRow(entry) {
  const p = entry.product, slot = SLOT_BY_ID[p.slot];
  return `<article class="plan-product">
    <button class="plan-product-pic" data-action="open-item" data-id="${p.id}" aria-label="${esc(p.brand)} ${esc(p.name)} 자세히">${picture(p, slot)}</button>
    <div class="plan-product-body">
      <div class="brand-name">${esc(p.brand)}${mine(p) ? ' <span class="mine">내 브랜드</span>' : ''}</div>
      <button class="name" data-action="open-item" data-id="${p.id}">${esc(p.name)}</button>
      <div class="price">${collectedPrice(entry)}</div>
      <div class="fine">${entry.colorConfirmed ? `색 ${esc(COLORS[p.color]?.label || '')}` : '색: 상품 사진으로 추정 · 판매처에서 확인 필요'}</div>
      <div class="opts plan-product-actions"><a class="chip" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">${esc(p.store)}에서 보기</a><button class="chip" data-action="candidate-product" data-id="${p.id}">내 옷과 비교</button></div>
    </div>
  </article>`;
}
function planLookLine(look) {
  return `<li><b>${esc(look.title)}</b> · ${look.items.map((row) => row.owned ? `${esc(ROLE_NAME[row.role] || '')} ${esc(row.label)}` : `${esc(ROLE_NAME[row.role] || '')} <em>후보 ${esc(shortName(row.slot))}</em>`).join(' + ')}</li>`;
}
function planSection() {
  const plan = wardrobePlan(state);
  if (plan.basis.kind === 'empty')
    return `<section class="section plan-entry"><h2>내 옷장 기준 다음 한 벌</h2><p class="sub">가진 옷을 등록하면, 그 옷과 함께 입을 수 있는 실제 상품을 골라 드려요.</p><button class="btn" data-action="add-start">${ICON.plus}내 옷 추가</button></section>`;
  const top = plan.gaps[0];
  const preview = top
    ? `<div class="plan-preview"><p><b>${esc(top.slot.name)}</b>${josa(top.slot.name, '을', '를')} 더하면 ${plan.basis.kind === 'example' ? '예시 옷' : '내 옷'}과 코디 공식 ${top.newFormulaCount}개가 완성돼요.</p>${top.products[0] ? `<p class="fine">예: ${esc(top.products[0].product.brand)} ${esc(top.products[0].product.name)} · ${formatPrice(top.products[0].price.amount)} (${esc(top.products[0].price.store)} 표시가, ${esc(top.products[0].price.collectedOn)} 수집)</p>` : ''}</div>`
    : plan.pairs?.[0]
      ? `<div class="plan-preview"><p>두 벌을 더하면 <b>${esc(plan.pairs[0].look.title)}</b> 코디가 완성돼요: ${plan.pairs[0].slots.map((slot) => esc(shortName(slot))).join(' + ')}</p></div>`
      : '<div class="plan-preview"><p>지금 옷으로는 한두 벌만 더해 완성되는 코디 공식을 찾지 못했어요.</p></div>';
  const counts = [
    `분석 ${plan.analysed.length}벌`,
    plan.needsCheck.length ? `확인 필요 ${plan.needsCheck.length}벌` : null,
    plan.duplicates.length ? `겹치는 옷 ${plan.duplicates.length}묶음` : null,
  ].filter(Boolean).join(' · ');
  return `<section class="section plan-entry">
    <div class="section-head"><div><h2>${plan.basis.kind === 'example' ? '예시 옷장으로 보는 다음 한 벌' : '내 옷장 기준 다음 한 벌'}</h2><div class="sub">${esc(counts)}</div></div></div>
    ${plan.basis.kind === 'example' ? '<p class="fine">예시 옷이라 실제로 가진 옷과 다를 수 있어요. 내 옷을 넣으면 내 옷 기준으로 바뀌어요.</p>' : ''}
    ${preview}
    <button class="btn" data-action="open-plan">부족한 옷과 실제 후보 보기 ${ICON.arrow}</button>
  </section>`;
}
function planSheet() {
  const plan = wardrobePlan(state);
  const example = plan.basis.kind === 'example';
  const ownLabel = example ? '예시 옷' : '내 옷';
  const analysed = plan.analysed.length
    ? `<div class="plan-owned">${plan.analysed.map((item) => `<button class="plan-owned-item" data-action="${example ? 'tab' : 'open-own'}" ${example ? 'data-tab="closet"' : `data-id="${esc(item.id)}"`}>${itemPicture(item)}<span>${esc(describeGarment(item))}</span></button>`).join('')}</div>`
    : `<p class="notice">종류와 색을 확인한 ${ownLabel}이 아직 없어요. 아래 옷을 확인하면 계산할 수 있어요.</p>`;
  const needsCheck = plan.needsCheck.length
    ? `<div class="notice"><b>확인하면 계산에 넣을 수 있어요</b><ul class="plain-list">${plan.needsCheck.map(({ item, reason }) => `<li>${esc(garmentLabel(item))} · ${reason === 'color' ? '색 미확인' : reason === 'type' ? '세부 종류 미확인' : '세부 종류·색 미확인'} <button class="link" data-action="open-own" data-id="${esc(item.id)}">확인하기</button></li>`).join('')}</ul></div>`
    : '';
  const extra = [
    plan.basis.otherGender ? `다른 분류(${state.gender === 'F' ? '남성' : '여성'}) 옷 ${plan.basis.otherGender}벌은 이번 계산에서 뺐어요.` : null,
    plan.basis.retired ? `반품·교체로 보유 추천에서 뺀 옷 ${plan.basis.retired}벌은 세지 않았어요.` : null,
  ].filter(Boolean);
  const duplicates = plan.duplicates.length || plan.paused.length
    ? `${plan.duplicates.map((d) => `<div class="plan-dup">${d.items.slice(0, 3).map((item) => itemPicture(item, 'mini')).join('')}<p><b>${esc(COLORS[d.color]?.label || '')} ${esc(d.slot.name)} ${d.items.length}벌</b><br>같은 종류·색이 이미 있어요. 또 사기 전에 이 옷들을 먼저 활용해 보세요.</p></div>`).join('')}
       ${plan.paused.map((p) => `<p class="fine">${esc(p.slot.name)}: ${p.reason === 'ordered' ? '주문·수령 기록이 있어 후보에서 뺐어요.' : '비슷한 옷이 있다고 답해 후보에서 뺐어요.'}</p>`).join('')}`
    : `<p class="sub">같은 종류·색으로 겹치는 ${ownLabel}은 없어요.</p>`;
  const gaps = plan.gaps.length
    ? plan.gaps.map((gap) => `<section class="plan-gap">
        <h4>${esc(gap.slot.name)} <span class="plan-count">+코디 ${gap.newFormulaCount}개</span></h4>
        <p class="sub">함께 입는 ${ownLabel}: ${gap.usesOwned.map((item) => esc(describeGarment(item))).join(', ')}</p>
        <ul class="plain-list plan-looks">${gap.looks.map(planLookLine).join('')}</ul>
        <div class="plan-products">${gap.products.map(planProductRow).join('')}</div>
        ${gap.moreProducts ? `<button class="link" data-action="example" data-q="${esc(gap.slot.name)}">${esc(gap.slot.name)} 후보 ${gap.moreProducts}개 더 보기</button>` : ''}
      </section>`).join('')
    : '';
  const pairs = plan.pairs?.length
    ? `<h3 class="block">두 벌을 더하면 완성되는 코디</h3>${plan.pairs.map((pair) => `<section class="plan-gap">
        <h4>${esc(pair.look.title)}</h4>
        <ul class="plain-list plan-looks">${planLookLine(pair.look)}</ul>
        ${pair.slots.map((slot) => `<p class="sub"><b>${esc(slot.name)}</b> 후보</p><div class="plan-products">${(pair.products[slot.id] || []).map(planProductRow).join('') || '<p class="fine">조건에 맞는 상품이 목록에 없어요.</p>'}</div>`).join('')}
      </section>`).join('')}`
    : '';
  openSheet(`<h2>${example ? '예시 옷장으로 보는 다음 한 벌' : '내 옷장 기준 다음 한 벌'}</h2>
    <p class="sub">${esc(planBasisLine(plan))}</p>
    ${example ? '<div class="notice"><b>예시 옷장이에요</b><p>흐름을 보여 주는 예시 옷이라 실제로 가진 옷과 섞지 않아요.</p><button class="btn small" data-action="add-start">내 옷으로 바꾸기</button></div>' : ''}
    <h3 class="block">① 계산에 넣은 ${ownLabel}</h3>${analysed}${needsCheck}${extra.map((line) => `<p class="fine">${esc(line)}</p>`).join('')}
    <h3 class="block">② 겹치는 옷</h3>${duplicates}
    <h3 class="block">③ 부족한 종류와 실제 상품</h3>
    ${gaps || (plan.pairs?.length ? '<p class="sub">한 벌만 더해 완성되는 코디는 없어요.</p>' : '<p class="notice">지금 옷으로는 한두 벌만 더해 완성되는 코디 공식을 찾지 못했어요. 옷을 더 등록하거나 스타일을 바꿔 보세요.</p>')}
    ${plan.moreGaps ? `<p class="fine">이 밖에 코디를 완성하는 종류가 ${plan.moreGaps}개 더 있어요.</p>` : ''}
    ${pairs}
    <div class="why"><h3>계산 방법과 한계</h3><ul>${plan.limitations.map((line) => `<li>${esc(line)}</li>`).join('')}<li>가격은 현재 최저가가 아니에요. 같은 상품의 다른 판매처와 배송비는 아직 비교하지 않았어요.</li></ul></div>`, { key: 'plan' });
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
  // The wardrobe lists all active owned garments; recommendation preferences
  // must never hide an item or change merely because a catalog item was added.
  const items = state.closet;
  const ess = essentials(state);
  const cats = Object.entries(CATS).filter(([cat]) => items.some((i) => slotForItem(i).cat === cat));
  if (closetFilter !== 'all' && !cats.some(([cat]) => cat === closetFilter)) closetFilter = 'all';
  const head = `<section class="section closet-toolbar">
    <div class="section-head"><div><h2>내 옷장</h2><div class="sub">${state.demo ? `예시 옷 ${items.length}벌` : `등록한 내 옷 ${items.length}벌`}</div>${items.some((i) => i.gender !== state.gender) ? `<p class="fine">코디 추천 기준: ${state.gender === 'F' ? '여성' : '남성'} · ${esc(styleLine())}. 다른 분류의 옷도 목록에 보관해요.</p>` : ''}</div>
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
      return `<button class="citem" data-action="open-own" data-id="${esc(i.id)}">${itemPicture(i)}<span class="cbrand">${esc(brand)}</span><span class="cname">${esc(garmentLabel(i))}</span>${demo ? '<span class="closet-tag">예시 옷</span>' : registration ? `<span class="cdate">${registration}</span>` : ''}${!demo && !i.color ? '<span class="cdate color-unknown">색 미확인</span>' : ''}</button>`;
    }).join('')}<button class="closet-add-tile" data-action="add-start"><span class="closet-add-stage">${ICON.plus}</span><span>옷 추가</span></button></div>
  </section>`;

  const nudge = backupNudge(items);
  if (!items.length) return head + nudge + grid + essentialSection(ess);

  const { ready, almost } = closetLooks(state, { limit: 3 });
  const today = `<section class="section">
    <div class="section-head"><div><h2>오늘 뭐 입지?</h2><div class="sub">${ready.length ? (state.demo ? '예시 옷만으로 만든 코디예요' : '가진 옷만으로 만든 코디예요') : '가진 옷이 조금 더 있으면 옷장만으로 코디를 짜 드려요'}</div></div></div>
    ${ready.length ? `<div class="looks">${ready.map((r) => lookCard(r)).join('')}</div>` : ''}
    ${almost.length ? `<h3 class="block">등록한 옷에 후보 한 벌 더하기</h3><div class="looks">${almost.map((r) => lookCard(r)).join('')}</div>` : ''}
  </section>`;

  return head + nudge + grid + today + essentialSection(ess);
}
// 실제 옷이 3벌 이상인데 백업 파일을 받은 적이 없거나 오래됐으면 한 번 알려 준다.
function backupNudge(items) {
  const nudge = accountNudge(items);
  if (nudge) return nudge;
  // 계정에 저장된 뒤에는 서버에도 사본이 있어 백업 파일 알림을 줄인다(파일 백업은 프로필에서 계속 받을 수 있다).
  if (signedIn() && account.syncedAt) return '';
  if (state.demo || backupNudgeDismissed || !backupDue({ garmentCount: items.length, last: lastBackupAt() })) return '';
  const safari = isAppleTouchBrowser() && !isStandaloneApp();
  return `<div class="notice backup-nudge" role="status"><b>옷장이 이 기기 브라우저에만 있어요</b><p>${safari ? 'iPhone Safari는 7일 동안 열지 않은 사이트의 저장 자료를 지울 수 있어요. ' : ''}기기 변경·브라우저 정리에 대비해 사진 포함 백업 파일을 받아 두세요.</p><div class="opts"><button class="chip" data-action="backup">사진 포함 백업</button><button class="link" data-action="storage-help">보관 안내</button><button class="link" data-action="backup-nudge-dismiss">나중에</button></div></div>`;
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
    <button class="btn secondary candidate-compare" data-action="open-offers" data-journey="${esc(id)}">판매처·배송비 포함 총액 비교</button>
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
    ['closet', '내 옷장', ICON.hanger, state.closet.length],
    ['saved', '구매 여정', ICON.heart, state.journeys.length || state.saved.length],
  ];
  return `<nav class="nav" aria-label="주요 메뉴"><div class="nav-inner">${tabs.map(([k, label, icon, n]) => `<button data-action="tab" data-tab="${k}" aria-current="${state.tab === k ? 'page' : 'false'}">${icon}${label}${n ? `<span class="count">${n}</span>` : ''}</button>`).join('')}</div></nav>`;
}

const TAB_TITLE = { home: '추천', closet: '내 옷장', saved: '구매 여정' };
function render() {
  if (tastePicking || !state.onboarded || !state.gender || !myStyles().length) {
    $app.innerHTML = `<main><h1 class="sr-only">어울 시작하기</h1>${storageNotice()}${renderOnboarding()}</main>`;
    return;
  }
  const body = state.tab === 'closet' ? renderCloset() : state.tab === 'saved' ? renderSaved() : renderHome();
  // 저장·예시 안내도 본문 구역 안에 둔다(화면 낭독기로 본문에 바로 가도 안내와 복구 버튼을 지나치지 않게). 보이는 순서는 그대로다.
  $app.innerHTML =
    `<main><h1 class="sr-only">어울 ${TAB_TITLE[state.tab] || ''}</h1>${storageNotice()}${demoNotice()}${state.tab === 'home' ? topBar() : ''}${body}</main>` + nav();
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
  // 시트는 대화상자라서 첫 제목으로 이름을 붙인다(화면 낭독기가 무슨 창이 열렸는지 읽는다)
  const titled = html.replace(/<h2(?![^>]*\sid=)/, '<h2 id="sheet-title"');
  $sheet.innerHTML = `<div class="scrim" data-action="close-sheet"></div><div class="sheet" role="dialog" aria-modal="true"${titled === html ? '' : ' aria-labelledby="sheet-title"'}><div class="grabber"></div><button class="sheet-close" data-action="close-sheet" aria-label="닫기">${ICON.close}</button>${titled}</div>`;
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
  releaseDraftPhotoURLs(draft);
  $sheet.innerHTML = '';
  document.body.style.overflow = '';
  draft = null;
  candidateDraft = null;
  pendingOptionChange = null;
  candidateGarmentReview = null;
  if (!accountForm?.busy) accountForm = null;
  offerView = null;
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
    <button class="btn secondary candidate-compare" data-action="open-offers" data-id="${p.id}">판매처·배송비 포함 총액 비교</button>
    <div class="sheet-links">
      <button class="link" data-action="own-product" data-id="${p.id}">${owned ? '보유 옷 확인·추가' : '이 상품 있어요'}</button>
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
    ${active && !state.demo && !item.color ? ownColorCheck(item, p) : ''}
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

// 색을 모르는 실제 옷은 구매 비교의 조합 수에서 빠진다. 한 번 눌러 확인할 수 있게 한다.
// 판매처가 표시한 상품 색이 있으면 그 색만 확인할 수 있고, 다른 색이면 옷 정보 수정으로 간다.
function ownColorCheck(item, p) {
  const known = p?.color && p.colorSource !== 'image' && COLORS[p.color];
  return `<div class="notice color-impact"><p><b>색 미확인</b> · 색을 확인하지 않은 옷은 구매 후보와 비교할 때 조합 수에 들어가지 않아요.</p>${known
    ? `<div class="opts"><button class="chip" data-action="own-color" data-id="${esc(item.id)}" data-color="${esc(p.color)}">상품 색(${esc(COLORS[p.color].label)})과 같아요</button><button class="chip" data-action="edit-own" data-id="${esc(item.id)}">다른 색이에요</button></div>`
    : `<div class="swatches">${Object.entries(COLORS).map(([id, c]) => `<button class="sw" data-action="own-color" data-id="${esc(item.id)}" data-color="${id}" aria-label="${c.label}"><i style="background:${c.hex}"></i></button>`).join('')}</div>`}</div>`;
}

// Required: kind. Color, brand, photo and name remain optional.
function beginDraft(item = null, slot = null, { confirmDetails = false, returnLookId = null } = {}) {
  if (draft?.saving) return;
  releaseDraftPhotoAnalysis(draft);
  releaseDraftPhotoURLs(draft);
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
    catalogQuery: '',
    catalogProductId: null,
    catalogColor: null,
    catalogReturnMode: null,
    // The picked file stays in memory only, so a crop can be re-adjusted
    // before saving. Only the (cropped) JPEG asset is ever stored.
    photoSource: null,
    sourcePreview: null,
    crop: null,
    cropEdit: null,
    bgBefore: null,
    bgRunning: false,
    bgConsent: false,
    bgServerConsent: false,
    bgError: '',
    bgToken: 0,
  };
  addSheet();
}
function releaseDraftPhotoURLs(current) {
  if (!current) return;
  if (current.preview) URL.revokeObjectURL(current.preview);
  if (current.sourcePreview) URL.revokeObjectURL(current.sourcePreview);
  if (current.bgBefore?.preview) URL.revokeObjectURL(current.bgBefore.preview);
}
// 사진이 바뀌면(새 사진·자르기·빼기) 배경을 지운 결과와 되돌릴 이전 사진은 더 이상 맞지 않는다.
function resetDraftBackground(current) {
  if (current.bgBefore?.preview) URL.revokeObjectURL(current.bgBefore.preview);
  current.bgBefore = null;
  current.bgError = '';
  current.bgConsent = false;
  current.bgServerConsent = false;
  current.bgRunning = false;
  current.bgToken = (current.bgToken || 0) + 1;
}

// Owned-item lookup never uses shopping budget, season or style filters.
// Search and selection are transient; only the final confirmation writes.
function ownedCatalogProduct() {
  return draft?.entryMode === 'catalog' && SAFE_PRODUCTS.find((p) => p.id === draft.catalogProductId);
}
function ownedCatalogColorConflict(p) {
  return !!(p?.color && p.colorSource !== 'image' && draft.catalogColor && p.color !== draft.catalogColor);
}
function ownedCatalogResults() {
  const result = findOwnedCatalog(draft.catalogQuery, SAFE_PRODUCTS);
  if (result.status === 'empty') return '<p class="sub">브랜드·상품명 또는 무신사 상품 주소로 찾아보세요. 취향·예산에 관계없이 저장된 상품 목록에서 찾아요.</p>';
  if (!result.total) return `<p class="notice">${result.status === 'unsupported-link' ? '이 주소로 찾을 수 없어요. 브랜드·상품명을 입력하거나 사진으로 추가해 주세요.' : '저장된 상품 목록에 없어요. 사진이나 종류로 추가할 수 있어요.'}</p><button class="chip" data-action="owned-catalog-back">사진·종류로 추가</button>`;
  return `<p class="fine" role="status">${result.total}개${result.total > result.items.length ? ` · 먼저 ${result.items.length}개 표시, 상품명을 더 적으면 좁힐 수 있어요` : ''}</p><div class="owned-catalog-list">${result.items.map((p) => `<button class="owned-catalog-item" data-action="owned-catalog-select" data-id="${esc(p.id)}">${picture(p, SLOT_BY_ID[p.slot], 'thumb')}<span><b>${esc(p.brand)}</b><span>${esc(p.name)}</span><small>${esc(SLOT_BY_ID[p.slot].name)}</small></span>${ICON.chevron}</button>`).join('')}</div>`;
}
function ownedCatalogSheet() {
  if (!draft) return;
  const p = ownedCatalogProduct();
  const ownPhoto = draft.preview || photos.get(draft.photoId);
  const knownColor = p?.color && p.colorSource !== 'image' && COLORS[p.color];
  const previous = p ? (state.demo ? [] : state.closet).filter((i) => i.productId === p.id && i.id !== draft.id) : [];
  const conflict = p && ownedCatalogColorConflict(p);
  openSheet(`<div class="garment-editor owned-catalog"><h2 class="detail-title">${p ? '이 상품을 가지고 있나요?' : '내 옷을 상품 목록에서 찾기'}</h2><fieldset${draft.saving ? ' disabled' : ''}>
  <button class="link" data-action="${p ? 'owned-catalog-search' : 'owned-catalog-back'}">${p ? '다른 상품 찾기' : '사진·종류로 돌아가기'}</button>
  ${p ? `${ownPhoto ? `<div class="owned-catalog-own-photo"><img src="${esc(ownPhoto)}" alt="직접 선택한 내 옷 사진"><span>내 사진 · 그대로 보관해요</span></div>` : ''}
  ${picture(p, SLOT_BY_ID[p.slot], 'hero')}<p class="fine">판매처 상품 사진${ownPhoto ? ' · 내 사진을 바꾸지 않아요' : ' · 직접 찍은 사진은 아니에요'}</p>
  <p class="brand-name">${esc(p.brand)}</p><h3>${esc(p.name)}</h3><p class="sub">${esc(SLOT_BY_ID[p.slot].name)} · 같은 상품인지 이름과 모양을 확인해 주세요.</p>
  ${draft.color ? `<p class="fine">내가 확인한 색: ${esc(COLORS[draft.color]?.label || '모름')}</p>` : ''}
  <h4 class="block">내 옷 색</h4>${knownColor ? `<p class="sub">상품에 표시된 색: <b>${esc(COLORS[p.color].label)}</b></p><div class="opts"><button class="chip" data-action="owned-catalog-color" data-color="${esc(p.color)}" aria-pressed="${draft.catalogColor === p.color}">내 옷도 이 색이에요</button><button class="chip" data-action="owned-catalog-color" data-color="" aria-pressed="${!draft.catalogColor}">색은 아직 모름</button></div>` : `<p class="sub">상품 정보에 확인된 색이 없어요. 상품 사진에서 색을 추정하지 않으니 내 옷 색을 골라 주세요.</p><div class="swatches"><button class="chip" data-action="owned-catalog-color" data-color="" aria-pressed="${!draft.catalogColor}">색 모름</button>${Object.entries(COLORS).map(([id, c]) => `<button class="sw" data-action="owned-catalog-color" data-color="${id}" aria-label="${c.label}" aria-pressed="${draft.catalogColor === id}"><i style="background:${c.hex}"></i></button>`).join('')}</div>`}
  ${draft.catalogColor ? `<p class="fine color-impact">확인한 색: ${esc(COLORS[draft.catalogColor]?.label || '')} · 구매 후보와 비교할 때 이 옷을 조합 수에 넣어요.</p>` : '<p class="notice color-impact">색을 확인하지 않으면 이 옷은 구매 비교의 조합 수에 들어가지 않고, 비교할 때 색을 다시 물어봐요. 옷장에는 그대로 보여요.</p>'}
  ${conflict ? '<p class="notice">확인한 내 옷 색과 상품에 표시된 색이 달라요. 다른 색·비슷한 옷으로 등록하면 상품을 연결하지 않아요.</p>' : ''}
  ${previous.length ? `<p class="notice">이 상품을 연결한 옷이 이미 ${previous.length}벌 있어요. 추가로 가진 한 벌이라면 아래에서 저장하세요.</p>` : ''}
  <div class="cta registration-save"><button class="btn" data-action="owned-catalog-confirm" data-id="${esc(p.id)}"${conflict || draft.processing || draft.saving ? ' disabled' : ''}>${draft.saving ? '저장 중…' : previous.length ? '같은 상품 한 벌 더 저장' : '가지고 있는 상품 · 옷장에 저장'}</button></div>
  <button class="link" data-action="owned-catalog-similar" data-id="${esc(p.id)}">다른 색·비슷한 옷으로 등록</button>` : `<label for="owned-catalog-query">브랜드·상품명·상품 주소</label><input id="owned-catalog-query" type="search" maxlength="500" autocomplete="off" value="${esc(draft.catalogQuery)}" placeholder="예: 폴로 셔츠 또는 상품 주소"><div id="owned-catalog-results">${ownedCatalogResults()}</div>`}
  ${draft.error ? `<p class="editor-error" role="alert">${esc(draft.error)}</p><button class="chip" data-action="reload-wardrobe">입력 유지하고 최신 옷장 불러오기</button>` : ''}
  </fieldset></div>`, { key: `garment:${draft.id}:catalog:${p ? p.id : 'search'}` });
}
function startOwnedCatalog(productId = null) {
  if (!draft) beginDraft();
  if (draft.saving || draft.processing) return;
  releaseDraftPhotoAnalysis(draft);
  if (draft.entryMode !== 'catalog') draft.catalogReturnMode = draft.entryMode;
  draft.entryMode = 'catalog';
  draft.catalogProductId = SAFE_PRODUCTS.some((p) => p.id === productId) ? productId : null;
  draft.catalogColor = draft.color || null;
  draft.error = '';
  ownedCatalogSheet();
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
    ${r?.requiresCrop ? `<div class="notice"><p>한 벌을 구분하기 어려워요. 등록할 옷만 남기도록 잘라 주세요.</p>${draft.cropEdit ? '' : '<button class="chip" data-action="crop-start">옷만 자르기</button>'}</div>` : ''}
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
// ── 사진 자르기: 한 사진에서 등록할 옷 한 벌만 남긴다. 원본 파일은 초안(메모리)에만 두어
// 저장 전까지 다시 조정할 수 있고, 저장되는 것은 잘라 만든 JPEG 한 장뿐이다.
function cropEditor() {
  const e = draft.cropEdit, src = draft.photoSource;
  const pct = (v) => `${(v * 100).toFixed(3)}%`;
  return `<div class="crop-editor"><p class="sub">상자를 끌어 등록할 옷 한 벌만 남기세요. 모서리를 끌면 크기가 바뀌어요. 원본 사진은 저장하지 않아요.</p>
  <div class="crop-stage" data-crop-stage style="width:min(100%, calc(56vh * ${(src.width / src.height).toFixed(4)}));aspect-ratio:${src.width} / ${src.height}"><img src="${esc(draft.sourcePreview)}" alt="자를 원본 사진" draggable="false">
  <div class="crop-box" data-crop-box tabindex="0" role="group" aria-label="자를 영역. 방향키로 옮기고, Shift와 방향키로 크기를 바꿔요." style="left:${pct(e.x)};top:${pct(e.y)};width:${pct(e.w)};height:${pct(e.h)}">${['nw', 'ne', 'sw', 'se'].map((h) => `<span class="crop-handle ${h}" data-handle="${h}" aria-hidden="true"></span>`).join('')}</div></div>
  <div class="crop-actions"><button class="chip" data-action="crop-cancel">취소</button>${draft.crop ? '<button class="chip" data-action="crop-reset">자르기 전 사진으로</button>' : ''}</div></div>`;
}
// 저장된 사진을 수정할 때는 저장된 JPEG를 원본으로 삼는다(처음 고른 원본 파일은 저장하지 않았다).
async function ensureDraftPhotoSource(current) {
  if (current.photoSource) return true;
  const url = current.preview || photos.get(current.photoId);
  if (!url || typeof fetch !== 'function') return false;
  const blob = await (await fetch(url)).blob();
  const { source } = await prepareGarmentPhotoWithSource(blob);
  if (draft !== current) return false;
  current.photoSource = source;
  current.sourcePreview = URL.createObjectURL(source.blob);
  return true;
}
async function startDraftCrop() {
  const current = draft;
  if (!current || current.saving || current.processing) return;
  try {
    if (!(await ensureDraftPhotoSource(current))) throw new Error('사진을 다시 고르면 자를 수 있어요.');
  } catch (error) {
    if (draft === current) { current.photoError = error?.message || '사진을 다시 고르면 자를 수 있어요.'; addSheet(); }
    return;
  }
  if (draft !== current) return;
  current.cropEdit = current.crop ? { ...current.crop } : { x: 0.08, y: 0.06, w: 0.84, h: 0.88 };
  current.photoError = '';
  addSheet();
}
// 자르기가 실패하면 이전 사진·분석 결과·입력은 그대로 두고 편집 상자도 열어 둔다.
async function applyDraftCrop(crop) {
  const current = draft;
  if (!current?.photoSource || current.saving || current.processing) return;
  releaseDraftPhotoAnalysis(current, { keepRecognizer: !current.recognizing });
  const token = ++current.token;
  current.processing = true;
  current.photoError = '';
  current.error = '';
  addSheet();
  try {
    const area = normalizeCrop(crop);
    const asset = await photoAssetFromSource(current.photoSource, area);
    if (draft !== current || current.token !== token) return;
    if (current.preview) URL.revokeObjectURL(current.preview);
    resetDraftBackground(current);
    current.asset = asset;
    current.photoId = asset.id;
    current.photoMissing = false;
    current.preview = URL.createObjectURL(asset.blob);
    current.crop = area;
    current.cropEdit = null;
    // Suggestions were made from the previous picture; confirmed choices stay.
    current.photoRecognition = null;
    current.recognitionError = '';
    current.recognitionProgress = null;
  } catch (error) {
    if (draft === current && current.token === token) current.photoError = error?.message || '사진을 자르지 못했어요. 이전 사진은 그대로예요.';
  } finally {
    if (draft === current && current.token === token) {
      current.processing = false;
      addSheet();
    }
  }
  if (photoCanAutoAnalyze() && draft === current && current.token === token && current.asset && !current.photoError)
    await analyzeDraftPhoto();
}
// ── 배경 지우기: 이 기기에서 옷과 배경을 나눠 흰 배경으로 바꾼다. 결과를 보고 되돌릴 수 있다.
function backgroundPanel() {
  if (!draft) return '';
  if (draft.bgServerConsent) return `<div class="notice bg-consent"><p><b>어디서 배경을 지울까요?</b></p><p>로그인한 동안에는 운영자 서버의 큰 모델로 더 정확하고 빠르게 지울 수 있어요. 이 사진을 320×320으로 줄여 서버로 보내고, 서버는 사진과 결과를 저장하지 않아요. 고른 방법은 이 기기에서 기억하고, 프로필의 계정 칸에서 바꿀 수 있어요.</p><div class="opts"><button class="btn small" data-action="bg-server-allow">서버에서 지우기</button><button class="chip" data-action="bg-device-instead">이 기기에서 지우기(도구 ${BACKGROUND_DOWNLOAD_LABEL})</button><button class="link" data-action="bg-server-cancel">취소</button></div></div>`;
  if (draft.bgConsent) return `<div class="notice bg-consent"><p>배경 지우기 도구(${BACKGROUND_DOWNLOAD_LABEL})를 처음 한 번 내려받아요. 사진은 이 기기에서만 처리하고 밖으로 보내지 않아요. 옷과 배경 색이 비슷하면 잘 안 될 수 있어요.</p><div class="opts"><button class="btn small" data-action="bg-allow">내려받고 배경 지우기</button><button class="link" data-action="bg-consent-cancel">취소</button></div></div>`;
  if (draft.bgRunning) return `<p role="status" class="sub">${draft.bgVia === 'server' ? '배경을 지우는 중이에요…' : '배경을 지우는 중이에요… 처음에는 도구를 내려받아 조금 더 걸려요.'}</p>`;
  if (draft.bgError) return `<div class="photo-error"><p class="editor-error" role="alert">${esc(draft.bgError)}</p></div>`;
  if (draft.bgBefore) return `<p class="fine">배경을 흰색으로 바꿨어요${draft.bgVia === 'server' ? '(운영자 서버에서 처리했고, 서버에 사진을 남기지 않아요)' : ''}. 옷 가장자리가 잘렸으면 ‘원래 배경으로’를 눌러 주세요.</p>`;
  return '';
}
// 질문이 아래 저장 버튼 뒤에 가려지지 않게 화면 가운데로 옮긴다.
function showBackgroundQuestion() {
  $sheet.querySelector?.('.bg-consent')?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
}
async function serverBackgroundReady() {
  if (!signedIn() || backgroundServerOff) return false;
  if (!accountHealth) {
    try {
      accountHealth = await createAccountApi({ base: accountBase }).health();
    } catch {
      return false;
    }
  }
  return !!accountHealth?.features?.photoMask;
}
async function removeDraftBackground({ via = 'device' } = {}) {
  const current = draft;
  if (!current || current.saving || current.processing || current.bgRunning) return;
  let blob = current.asset?.blob || null;
  if (!blob) {
    try { if (await ensureDraftPhotoSource(current)) blob = current.photoSource.blob; } catch {}
  }
  if (!blob || draft !== current) return;
  const token = current.token, bgToken = ++current.bgToken;
  current.bgRunning = true;
  current.bgVia = via;
  current.bgError = '';
  addSheet();
  const live = () => draft === current && current.token === token && current.bgToken === bgToken;
  try {
    let result;
    if (via === 'server') {
      try {
        result = { mask: await accountApi().photoMask(await photoPixels(blob, BACKGROUND_MASK_SIZE)), size: BACKGROUND_MASK_SIZE };
      } catch (error) {
        if (error?.name !== 'AccountError') throw error;
        // 서버가 꺼졌거나 바쁘면 이번 세션은 이 기기 도구로 지운다. 로그인 만료는 계정 안내에도 보인다.
        backgroundServerOff = true;
        if (error.status === 401) syncFailed(error);
        throw new Error('서버에서 배경을 지우지 못했어요. 다시 누르면 이 기기에서 지워요.');
      }
    } else {
      backgroundRemover ||= backgroundRemoverFactory();
      result = await backgroundRemover.segment(blob);
    }
    if (!live()) return;
    // 다른 물건까지 옷으로 잡힌 부분은 떼어 낸다(가장 큰 영역과 그 30% 이상인 영역만 남긴다).
    const size = result.size, mask = keepMainSubject(result.mask, size);
    const cover = maskCoverage(mask);
    if (cover < 0.03 || cover > 0.97) throw new Error('옷을 배경과 구분하지 못했어요. 원래 사진을 그대로 쓸게요.');
    const asset = await photoAssetWithoutBackground(blob, mask, size);
    if (!live()) return;
    current.bgBefore = { asset: current.asset, photoId: current.photoId, preview: current.preview };
    current.asset = asset;
    current.photoId = asset.id;
    current.photoMissing = false;
    current.preview = URL.createObjectURL(asset.blob);
    current.photoRecognition = null;
    current.recognitionError = '';
    current.recognitionProgress = null;
  } catch (error) {
    if (['TimeoutError', 'InvalidStateError'].includes(error?.name)) backgroundRemover = null;
    if (live()) current.bgError = error?.message || '배경을 지우지 못했어요. 원래 사진은 그대로예요.';
  } finally {
    if (live()) {
      current.bgRunning = false;
      addSheet();
    }
  }
  if (photoCanAutoAnalyze() && live() && current.bgBefore && current.asset) await analyzeDraftPhoto();
}
function addSheet() {
  if (!draft) return;
  if (draft.entryMode === 'catalog') { ownedCatalogSheet(); return; }
  // 자르는 동안에는 자르기만 보여 준다(아래 저장 버튼이 자르기 버튼을 가리지 않게).
  if (draft.cropEdit && draft.photoSource) {
    openSheet(`<div class="garment-editor wardrobe-registration"><h2 class="detail-title">옷 한 벌만 남기기</h2>${cropEditor()}${draft.photoError ? `<div class="photo-error"><p class="editor-error" role="alert">${esc(draft.photoError)}</p></div>` : ''}<div class="cta registration-save"><button class="btn" data-action="crop-apply"${draft.processing ? ' disabled' : ''}>${draft.processing ? '자르는 중…' : '이 영역으로 자르기'}</button></div></div>`, { key: `garment:${draft.id}:crop` });
    return;
  }
  const selected = slotForItem(draft);
  const kinds = GARMENT_KINDS.filter((k) => SLOTS.some((s) => s.g === draft.gender && s.shape === k.id));
  const kindButton = (k) => `<button class="kind-pick" data-action="draft-kind" data-kind="${k.id}" aria-pressed="${draft.kind === k.id}">${typePicture(SLOTS.find((s) => s.g === draft.gender && s.shape === k.id))}<span>${k.name}</span></button>`;
  const photo = draft.preview || photos.get(draft.photoId);
  const entry = !draft.before && draft.entryMode === 'choice' && !photo && !draft.kind;
  // The kind grid stays open unless a visual suggestion or a chosen kind is shown above it.
  const suggested = (draft.photoRecognition?.kinds || []).some((x) => SLOTS.some((s) => s.g === draft.gender && s.shape === x.kind));
  const manual = draft.entryMode === 'manual' || draft.entryMode === 'edit' || (!suggested && !draft.kind);
  const specificKinds = SLOTS.filter((s) => s.g === draft.gender && s.shape === draft.kind);
  const manualKinds = `<fieldset><legend>어떤 옷인가요?</legend><div class="kind-grid">${kinds.slice(0, 8).map(kindButton).join('')}</div><details class="more-kinds"><summary>다른 종류</summary><div class="kind-grid">${kinds.slice(8).map(kindButton).join('')}</div></details></fieldset>`;
  const sourceChoices = `<div class="photo-sources"><button class="photo-source primary" data-action="add-photo">${ICON.image || ICON.camera}<b>앨범에서 선택</b><span>옷 사진 한 장</span></button><button class="photo-source" data-action="add-camera">${ICON.camera}<b>카메라로 촬영</b><span>옷 한 벌을 크게</span></button></div><button class="link manual-entry" data-action="draft-manual">사진 없이 종류로 추가</button>`;
  openSheet(`<div class="garment-editor wardrobe-registration"><h2 class="detail-title">${draft.before ? '내 옷 수정' : '옷 한 벌 추가'}</h2><p class="sub">${entry ? '사진부터 골라 주세요. 브랜드·이름은 나중에 넣어도 돼요.' : '종류 하나만 확인하면 옷장에 넣을 수 있어요.'}</p><fieldset${draft.saving ? ' disabled' : ''}>
  ${entry ? `<div class="registration-entry">${sourceChoices}<p class="fine">JPG·PNG·WebP 사진을 사용할 수 있어요.</p><button class="link" data-action="owned-catalog-start">상품 목록에서 찾아 추가</button></div>` : `${`<div class="photo-editor${photo ? ' has-photo' : ''}">${photo ? `<img class="photo-preview" src="${photo}" alt="내 옷 사진${draft.crop ? ' (자른 영역)' : ''}">` : '<div class="photo-empty">사진은 선택</div>'}<div class="photo-edit-actions">${photo ? `<button class="chip" data-action="crop-start"${draft.processing || draft.bgRunning ? ' disabled' : ''}>${draft.crop ? '자른 영역 다시 조정' : '옷만 자르기'}</button>${draft.bgBefore ? '<button class="chip" data-action="bg-restore">원래 배경으로</button>' : `<button class="chip" data-action="bg-remove"${draft.processing || draft.bgRunning ? ' disabled' : ''}>${draft.bgRunning ? '배경 지우는 중…' : '배경 지우기'}</button>`}` : ''}<button class="chip" data-action="add-photo">${photo ? '사진 바꾸기' : '앨범에서 선택'}</button>${photo ? '<button class="link" data-action="clear-photo">사진 빼기</button>' : '<button class="chip" data-action="add-camera">카메라로 촬영</button>'}</div></div>`}<button class="link" data-action="owned-catalog-start">브랜드·상품을 찾아 확인</button>
  ${draft.photoMissing ? '<p class="notice">이전 버전에서 저장되지 않은 사진이에요. 다시 고를 수 있어요.</p>' : ''}
  ${backgroundPanel()}
  ${photoAnalysisPanel()}
  ${draft.kind ? `<div class="confirmed-kind"><span>확인한 종류</span><b>${esc(garmentKindName(draft.kind))}</b>${draft.brand ? `<small>${esc(draft.brand)}</small>` : ''}</div>` : photo ? '<p class="sub registration-kind-hint">종류를 확인해 주세요. 모르면 아래에서 직접 고를 수 있어요.</p>' : ''}
  ${manual ? manualKinds : `<details class="manual-kinds"><summary>${draft.kind ? '다른 종류로 바꾸기' : '다른 종류로 등록'}</summary>${manualKinds}</details>`}
  ${specificKinds.length ? `<details class="garment-name"${draft.confirmDetails ? ' open' : ''}><summary>세부 종류 확인 (선택)${draft.slot ? ` · ${esc(shortName(selected))}` : ''}</summary><div class="opts"><button class="chip" data-action="draft-slot" data-slot="" aria-pressed="${!draft.slot}">아직 모름</button>${specificKinds.map((s) => `<button class="chip" data-action="draft-slot" data-slot="${s.id}" aria-pressed="${draft.slot === s.id}">${esc(s.name)}</button>`).join('')}</div></details>` : ''}
  <details class="garment-name"><summary>색·브랜드·이름 수정 (선택)</summary><label for="garment-label">내가 부를 이름</label><input id="garment-label" maxlength="80" value="${esc(draft.label)}"><label for="garment-brand">브랜드</label><input id="garment-brand" maxlength="120" value="${esc(draft.brand || '')}"><p class="sub">모르는 정보는 비워 둬도 돼요.</p><div class="swatches"><button class="chip" data-action="draft-color" data-color="" aria-pressed="${draft.color === null}">색 모름</button>${Object.entries(COLORS).map(([id, c]) => `<button class="sw" data-action="draft-color" data-color="${id}" aria-label="${c.label}" aria-pressed="${draft.color === id}"><i style="background:${c.hex}"></i></button>`).join('')}</div></details>
  <div class="cta registration-save"><button class="btn" data-action="draft-save"${!draft.kind || draft.processing || draft.saving || draft.bgRunning ? ' disabled' : ''}>${draft.saving ? '저장 중…' : draft.bgRunning ? '배경 지우는 중…' : '옷장에 저장'}</button></div>`}
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
    const { asset, source } = await prepareGarmentPhotoWithSource(file);
    if (draft !== current || current.token !== token) return;
    releaseDraftPhotoURLs(current);
    resetDraftBackground(current);
    current.photoSource = source;
    current.sourcePreview = URL.createObjectURL(source.blob);
    current.crop = null;
    current.cropEdit = null;
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
  const catalogProduct = ownedCatalogProduct();
  // 배경 지우기가 끝나기 전에 저장하면 원래 배경 사진이 저장되므로 끝날 때까지 받지 않는다.
  if (!current || (!current.kind && !catalogProduct) || current.processing || current.saving || current.bgRunning) return;
  if (current.entryMode === 'catalog' && (!catalogProduct || ownedCatalogColorConflict(catalogProduct))) return;
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
    const catalogSlot = catalogProduct && SLOT_BY_ID[catalogProduct.slot];
    const item = makeGarment({ ...current, ...(catalogProduct ? {
      kind: catalogSlot.shape, slot: catalogSlot.id, gender: catalogSlot.g,
      brand: catalogProduct.brand, productId: catalogProduct.id,
      color: current.catalogColor, label: current.label || catalogProduct.name,
    } : {}) });
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
    askPersistenceOnce();
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
    const colorHint = item.color ? '' : ' · 색을 확인하면 구매 비교에도 쓰여요';
    toast((wasDemo ? '내 옷을 저장했어요. 이제 예시를 빼고 등록한 내 옷만 반영해요' : '내 옷을 저장했어요') + colorHint);
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
    ${accountSection()}
    <div class="opt-group"><h3>저장된 정보</h3><p class="sub">옷장·사진·찜·취향은 먼저 이 브라우저에 저장돼요. ${signedIn() ? '로그인한 동안에는 계정에도 저장해요.' : '다른 기기에서는 백업 파일로 옮길 수 있습니다.'}</p><div id="storage-health">${storageHealthHTML()}</div><button class="link" data-action="storage-help">보관 안내 보기</button>
      <button class="chip" data-action="backup">사진 포함 백업</button><button class="chip" data-action="choose-backup">백업 가져오기</button><button class="chip" data-action="recovery-backup">저장 원문 받기</button><p class="sub">현재 옷장을 비워도 이전 버전의 자료와 복구용 사본은 유지됩니다.</p><button class="chip" data-action="reset" style="margin-top:10px">현재 옷장 비우기</button><button class="chip" data-action="erase-review">이전 자료까지 전체 삭제</button></div>
  `);
  refreshStorageHealth();
}

// ── 이 기기 보관 상태
function storageHealthHTML() {
  const last = lastBackupAt();
  const h = storageHealth;
  const kept = h?.persisted === true ? '브라우저가 이 사이트 자료를 ‘오래 보관’으로 표시했어요.' :
    h?.persisted === false ? '브라우저가 아직 ‘오래 보관’으로 표시하지 않았어요.' : '보관 표시 여부를 확인할 수 없는 브라우저예요.';
  const usage = Number.isFinite(h?.usage) ? ` · 사용 중 약 ${formatBytes(h.usage)}` : '';
  return `<p class="fine">${kept}${usage}</p><p class="fine">마지막 백업 파일: ${last ? `${last.getFullYear()}. ${String(last.getMonth() + 1).padStart(2, '0')}. ${String(last.getDate()).padStart(2, '0')}. (이 기기에서 받은 기록)` : '받은 기록 없음'}</p>`;
}
async function refreshStorageHealth() {
  storageHealth = await readStorageHealth();
  const box = $sheet.querySelector?.('#storage-health');
  if (box) box.innerHTML = storageHealthHTML();
}
// 첫 실제 저장 뒤 한 번 요청한다. Safari·Chromium은 묻지 않고 스스로 정하며, 거절은 흔한 일이다.
function askPersistenceOnce() {
  if (persistenceAsked) return;
  persistenceAsked = true;
  requestPersistence().then((persisted) => { if (storageHealth && persisted !== null) storageHealth = { ...storageHealth, persisted }; });
}
function storageHelpSheet() {
  const safari = isAppleTouchBrowser();
  openSheet(`<h2>이 기기 보관 안내</h2>
    ${accountBase ? `<p>옷장·사진·구매 기록은 먼저 이 브라우저 안에 저장돼요. ${signedIn() ? '로그인한 동안에는 계정에도 저장하므로, 브라우저 자료가 지워져도 다시 로그인해 받을 수 있어요.' : '<b>계정에 저장</b>하거나 <b>사진 포함 백업 파일</b>을 받아 두면 사이트 데이터 삭제·브라우저 삭제·기기 변경 뒤에도 되살릴 수 있어요.'}</p>${signedIn() ? '' : '<div class="opts"><button class="btn small" data-action="account-open" data-mode="signup">계정에 저장</button></div>'}` : '<p>옷장·사진·구매 기록은 지금 이 브라우저 안에만 저장돼요. 서버 백업과 계정은 아직 없어서, 사이트 데이터 삭제·브라우저 삭제·기기 변경에서 자료를 되살릴 방법은 <b>사진 포함 백업 파일</b>뿐이에요.</p>'}
    <div id="storage-health">${storageHealthHTML()}</div>
    <div class="opts"><button class="chip" data-action="backup">사진 포함 백업</button><button class="chip" data-action="choose-backup">백업 가져오기</button><button class="chip" data-action="request-persist">오래 보관 요청</button></div>
    <h3 class="block">브라우저가 지울 수 있는 경우</h3>
    <ul class="plain-list">
      <li>${safari ? '<b>iPhone·iPad Safari</b>: ' : 'Safari: '}Safari를 쓰는 7일 동안 이 사이트와 상호작용이 없으면, 사이트가 저장한 자료(이 옷장 포함)가 지워질 수 있어요.</li>
      <li>홈 화면에 추가한 웹 앱은 Safari와 따로 사용 일수를 세고, Safari 17부터는 홈 화면 앱 여부 등을 보고 ‘오래 보관’ 요청을 받아 줘요. 그래도 보관이 보장되지는 않아요.</li>
      <li>홈 화면 앱은 Safari와 저장 공간이 따로일 수 있어요. 옮길 때는 Safari에서 백업 파일을 받아 홈 화면 앱에서 ‘백업 가져오기’로 불러오세요.</li>
      <li>저장 공간이 부족하면 어떤 브라우저든 사이트 자료를 정리할 수 있어요. ‘오래 보관’으로 표시된 사이트는 이 정리에서 빠지지만, 사용자가 직접 지우면 지워져요.</li>
    </ul>
    ${safari && !isStandaloneApp() ? '<p class="sub">홈 화면에 추가: Safari 아래쪽 공유 버튼 → ‘홈 화면에 추가’.</p>' : ''}
    <p class="fine">근거: <a href="https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/" target="_blank" rel="noopener noreferrer">WebKit 2020-03-24</a> · <a href="https://webkit.org/blog/14403/updates-to-storage-policy/" target="_blank" rel="noopener noreferrer">WebKit 2023-08-10</a> · <a href="https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria" target="_blank" rel="noopener noreferrer">MDN</a> (2026-10-15 확인)</p>`, { key: 'storage-help' });
  refreshStorageHealth();
}

// ── 계정과 동기화
// 저장은 언제나 이 기기에 먼저 한다(화면은 서버를 기다리지 않는다). 로그인한 기기는 저장이 끝난
// 옷장을 뒤에서 운영자 서버로 옮긴다. 이 기기와 계정이 서로 다르게 바뀌었으면 자동으로 합치지 않고 묻는다.
const accountBase = accountServer();
let account = accountBase ? readAccount(localStorage, accountBase) : null;
let accountHealth = null;
let accountForm = null;
let accountNudgeDismissed = false;
let syncState = { phase: account?.token ? 'idle' : 'signed-out', message: '', progress: '' };
let syncChoice = null;
let syncRunning = null, syncQueued = false, syncRetryTimer = null, syncRetryDelay = 5000;
const signedIn = () => !!(accountBase && account?.token);
// 동기화 도중 로그아웃하거나 다른 계정으로 로그인하면, 이전 계정에서 받은 결과를 이 기기와 새 계정 기록에 쓰지 않는다.
const sameSession = (token) => signedIn() && account.token === token;
const accountApi = () => createAccountApi({ base: accountBase, token: account?.token || null });
function saveAccount(next) {
  account = next;
  if (next) writeAccount(localStorage, { ...next, server: accountBase });
  else clearAccount(localStorage);
}
function syncTime(iso) {
  const at = new Date(iso);
  if (!Number.isFinite(at.getTime())) return '';
  const now = new Date();
  if (now - at < 60000) return '방금';
  const hm = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
  return at.toDateString() === now.toDateString() ? hm : `${at.getMonth() + 1}. ${at.getDate()}. ${hm}`;
}
// 시트의 계정 칸만 바꾼다(검색 입력 중인 본문을 다시 그리지 않는다)
function refreshAccountViews({ notice = false } = {}) {
  const box = $sheet.querySelector?.('#account-box');
  if (box) box.innerHTML = accountStatusHTML();
  if (notice) render();
}
function setSyncState(next, { notice = false } = {}) {
  const changedNotice = notice || (next.phase !== syncState.phase && ['choose', 'signed-out'].includes(next.phase) !== ['choose', 'signed-out'].includes(syncState.phase));
  syncState = { message: '', progress: '', ...next };
  refreshAccountViews({ notice: changedNotice });
}

/** 지금 상태를 계정과 맞춘다. 이미 도는 중이면 끝난 뒤 한 번 더 확인한다. */
function kickSync() {
  if (!signedIn() || !storageReady || erasingAll) return Promise.resolve();
  if (syncRunning) {
    syncQueued = true;
    return syncRunning;
  }
  clearTimeout(syncRetryTimer);
  syncRunning = (async () => {
    try {
      let rounds = 0;
      while (signedIn() && rounds++ < 5) {
        syncQueued = false;
        const token = account.token;
        try {
          await syncOnce();
        } catch (error) {
          // 이전 계정에서 난 실패(로그아웃으로 만료된 토큰 등)는 새로 로그인한 계정에 적용하지 않는다.
          if (sameSession(token)) throw error;
          syncQueued = signedIn();
        }
        if (!syncQueued) break;
      }
      syncRetryDelay = 5000;
    } catch (error) {
      syncFailed(error);
    } finally {
      syncRunning = null;
    }
  })();
  return syncRunning;
}
function syncFailed(error) {
  if (error?.status === 401) {
    saveAccount({ ...account, token: null });
    setSyncState({ phase: 'signed-out', message: '로그인이 만료됐어요. 다시 로그인하면 이어서 저장해요.' });
    return;
  }
  if (error?.code === 'offline' || error?.code === 'busy' || error?.status === 429 || error?.status >= 500) {
    setSyncState({ phase: 'offline', message: error.code === 'busy' ? '이 기기 저장이 끝나면 다시 올려요.' : '서버에 연결하지 못했어요. 이 기기에는 저장돼 있어요.' });
    syncRetryTimer = setTimeout(kickSync, syncRetryDelay);
    syncRetryDelay = Math.min(syncRetryDelay * 2, 5 * 60 * 1000);
    return;
  }
  setSyncState({ phase: 'error', message: error?.message || '계정에 저장하지 못했어요. 이 기기에는 저장돼 있어요.' });
}
async function syncOnce() {
  const token = account.token;
  const api = accountApi();
  const moved = () => {
    if (sameSession(token)) return false;
    syncQueued = signedIn();
    return true;
  };
  if (syncState.phase !== 'choose') setSyncState({ phase: 'syncing' });
  // 이전 버전에서 만든 기록에는 저장소 구분값(epoch)이 없을 수 있다. 한 번 저장해 붙인 뒤 비교한다.
  if (!storageEpoch) {
    if (writeBusy) throw Object.assign(new Error('busy'), { code: 'busy' });
    await set(storedWardrobe(state), { rerender: false });
  }
  const remote = await api.wardrobeMeta();
  if (moved()) return;
  const decision = syncDecision({
    synced: account.synced || null,
    local: { revision: storageRevision, epoch: storageEpoch, empty: isEmptyWardrobe(state) },
    remote,
  });
  if (decision === 'none') {
    syncChoice = null;
    setSyncState({ phase: 'idle' });
    return;
  }
  if (decision === 'push') return pushLocalWardrobe(api, remote.revision, token);
  if (decision === 'pull') {
    const known = !!account.synced;
    if (await replaceWithAccountWardrobe(api, null, token)) toast(known ? '다른 기기에서 바뀐 옷장을 받았어요' : '계정에 저장된 옷장을 받았어요');
    return;
  }
  if (syncChoice?.remote.revision !== remote.revision) {
    const full = await api.wardrobe();
    if (moved()) return;
    syncChoice = { remote: full };
  }
  // 두 쪽 내용이 같으면(다시 로그인, 같은 백업으로 복원) 고를 것이 없다. 지금을 동기화 지점으로 삼는다.
  if (sameWardrobe(syncChoice.remote.state, storedWardrobe(state)) && syncChoice.remote.revision === remote.revision) {
    saveAccount({
      ...account,
      synced: { remoteRevision: remote.revision, localEpoch: storageEpoch, localRevision: storageRevision },
      syncedAt: syncChoice.remote.updatedAt,
    });
    syncChoice = null;
    setSyncState({ phase: 'idle' });
    return;
  }
  setSyncState({ phase: 'choose' });
}
async function pushLocalWardrobe(api, baseRevision, token = account?.token) {
  const snapshot = await wardrobeStore.read();
  if (!snapshot) return;
  let pushed;
  try {
    pushed = await pushWardrobe({
      api, snapshot, baseRevision,
      onPhoto: (done, total) => setSyncState({ phase: 'syncing', progress: `사진 ${done}/${total}` }),
    });
  } catch (error) {
    // 그 사이 다른 기기가 계정 옷장을 바꿨다. 다시 비교하면 고르기로 넘어간다.
    if (error.code === 'conflict') {
      syncQueued = true;
      return;
    }
    throw error;
  }
  if (!sameSession(token)) {
    syncQueued = signedIn();
    return;
  }
  saveAccount({
    ...account,
    synced: { remoteRevision: pushed.revision, localEpoch: snapshot.epoch || null, localRevision: snapshot.revision },
    syncedAt: pushed.updatedAt,
  });
  syncChoice = null;
  if (snapshot.revision !== storageRevision || (snapshot.epoch || null) !== storageEpoch) syncQueued = true;
  setSyncState({ phase: 'idle' });
}
// 계정 옷장으로 이 기기 옷장을 바꾼다. 이 기기의 이전 버전 가져오기 표시는 유지한다.
async function replaceWithAccountWardrobe(api, remote, token = account?.token) {
  const before = { revision: storageRevision, epoch: storageEpoch };
  setSyncState({ phase: 'syncing', progress: '계정 옷장 받는 중' });
  const pulled = await pullWardrobe({
    api, remote, verify: photoAsset,
    onPhoto: (done, total) => setSyncState({ phase: 'syncing', progress: `사진 ${done}/${total}` }),
  });
  // 받는 동안 이 기기에서 저장했거나 계정이 바뀌었으면 덮어쓰지 않고 다시 비교한다.
  if (storageRevision !== before.revision || storageEpoch !== before.epoch || !sameSession(token)) {
    syncQueued = true;
    return false;
  }
  if (writeBusy) throw Object.assign(new Error('busy'), { code: 'busy' });
  await set(withDeviceFields(pulled.state, storedWardrobe(state)), { assets: pulled.assets });
  if (!sameSession(token)) {
    syncQueued = signedIn();
    return false;
  }
  saveAccount({
    ...account,
    synced: { remoteRevision: pulled.revision, localEpoch: storageEpoch, localRevision: storageRevision },
    syncedAt: pulled.updatedAt,
  });
  syncChoice = null;
  setSyncState({ phase: 'idle' }, { notice: true });
  return true;
}

function accountStatusHTML() {
  if (!signedIn()) return '';
  const s = syncState;
  const line =
    s.phase === 'syncing' ? `계정에 저장하는 중${s.progress ? ` · ${s.progress}` : ''}` :
    s.phase === 'choose' ? '계정 옷장과 이 기기 옷장이 서로 다르게 바뀌었어요. 어느 쪽을 쓸지 골라 주세요.' :
    s.phase === 'offline' || s.phase === 'error' ? s.message :
    account.syncedAt ? `계정에 저장됨 · ${syncTime(account.syncedAt)}` : '아직 계정에 저장하지 않았어요';
  const mask = account.photoMaskConsent === true ? '<p class="fine">배경 지우기: 서버에서 처리 <button class="link" data-action="photo-mask-off">끄기</button></p>' : '';
  const verify = account.emailVerified === false ? `<p class="fine">이메일 미확인 · 비밀번호를 잊었을 때 재설정 메일을 받으려면 확인해 주세요. <button class="link" data-action="verify-send">확인 메일 보내기</button></p>` : '';
  return `<p><b>${esc(account.email)}</b></p><p class="sub" role="status">${esc(line)}</p>${verify}${mask}
    <div class="opts">${s.phase === 'choose' ? '<button class="btn small" data-action="sync-choose">어느 옷장을 쓸지 고르기</button>' : '<button class="chip" data-action="sync-now">지금 저장·확인</button>'}<button class="chip" data-action="account-logout">로그아웃</button><button class="link" data-action="account-delete-open">계정 삭제</button></div>`;
}
function accountSection() {
  if (!accountBase) return '';
  if (signedIn()) return `<div class="opt-group"><h3>계정</h3><div class="account-box" id="account-box">${accountStatusHTML()}</div></div>`;
  return `<div class="opt-group"><h3>계정</h3><p class="sub">이메일로 가입하면 옷장·사진·구매 기록·취향을 운영자 서버에 저장해요. 휴대폰을 바꾸거나 브라우저 자료가 지워져도 로그인해서 다시 받을 수 있어요.</p>${account?.email ? `<p class="fine">${esc(account.email)} · ${esc(syncState.message || '로그인하면 이어서 저장해요.')}</p>` : ''}<div class="opts"><button class="btn small" data-action="account-open" data-mode="${account?.email ? 'login' : 'signup'}">${account?.email ? '다시 로그인' : '계정에 저장'}</button><button class="chip" data-action="account-open" data-mode="${account?.email ? 'signup' : 'login'}">${account?.email ? '새 계정 만들기' : '로그인'}</button></div></div>`;
}
function accountNotice() {
  if (!accountBase) return '';
  if (signedIn() && syncState.phase === 'choose')
    return '<div class="notice account-notice" role="status"><b>계정 옷장과 이 기기 옷장이 달라요</b><p>자동으로 합치지 않았어요. 어느 쪽을 쓸지 골라 주세요. 그때까지 이 기기에는 계속 저장돼요.</p><button class="chip" data-action="sync-choose">확인하기</button></div>';
  if (!signedIn() && account?.email && syncState.message)
    return `<div class="notice account-notice" role="status"><b>계정에 저장하지 못하고 있어요</b><p>${esc(syncState.message)}</p><button class="chip" data-action="account-open" data-mode="login">로그인</button></div>`;
  return '';
}
// 써 본 뒤 저장할 때: 개인 옷을 처음 넣은 뒤 옷장에서 한 번 권한다.
function accountNudge(items) {
  if (!accountBase || signedIn() || account?.email || accountNudgeDismissed || state.demo || !items.length) return '';
  return '<div class="notice backup-nudge account-nudge" role="status"><b>계정에 저장해 둘까요?</b><p>지금은 이 기기 브라우저에만 있어요. 이메일로 가입하면 기기를 바꾸거나 브라우저 자료가 지워져도 다시 받을 수 있어요.</p><div class="opts"><button class="btn small" data-action="account-open" data-mode="signup">계정에 저장</button><button class="link" data-action="account-open" data-mode="login">로그인</button><button class="link" data-action="account-nudge-dismiss">나중에</button></div></div>';
}

const AGREEMENT_HTML = `<details class="agreement"><summary>개인정보 수집·이용 안내와 이용 조건 (필수)</summary>
  <h3 class="block">개인정보 수집·이용</h3>
  <ul class="plain-list">
    <li><b>수집 항목</b>: 이메일, 비밀번호(되돌릴 수 없는 방식으로 바꿔 저장), 옷장 기록(옷 종류·색·브랜드·이름·구매 기록·찜·취향), 옷 사진</li>
    <li><b>목적</b>: 본인 확인, 옷장을 서버에 보관하고 다른 기기와 맞추기, 로그인한 동안 누른 사진의 배경 지우기(줄인 사진을 서버에서 처리하고 저장하지 않아요)</li>
    <li><b>보관 기간</b>: 계정을 삭제할 때까지. 삭제하면 서버에서 바로 지워요. 운영자가 그 전에 만든 서버 백업 파일에는 백업 보관 기간 동안 남을 수 있어요.</li>
    <li><b>처리 장소</b>: 이 서비스 운영자가 직접 관리하는 서버. 사진과 기록을 외부 AI·분석·광고 서비스로 보내지 않아요.</li>
    <li>동의하지 않아도 이 기기에서는 지금처럼 쓸 수 있어요. 계정에 저장만 되지 않아요.</li>
  </ul>
  <h3 class="block">이용 조건</h3>
  <ul class="plain-list">
    <li>시험 중인 서비스예요. 예고 없이 멈추거나 자료가 초기화될 수 있으니 중요한 옷장은 사진 포함 백업 파일도 받아 두세요.</li>
    <li>사진에는 옷만 나오게 찍어 주세요. 얼굴이나 다른 사람이 나온 사진은 올리지 마세요.</li>
    <li>이메일 확인과 비밀번호 찾기는 아직 없어요. 비밀번호를 잊으면 운영자에게 직접 문의해야 해요.</li>
  </ul>
  <p class="fine">안내 버전 ${AGREEMENT_VERSION}</p>
</details>`;
async function openAccountSheet(mode = 'signup') {
  if (!accountBase) return;
  accountForm = { mode, email: accountForm?.email || account?.email || '', password: '', invite: '', age14: false, terms: false, privacy: false, busy: false, error: '' };
  accountSheet();
  if (!accountHealth) {
    try {
      accountHealth = await createAccountApi({ base: accountBase }).health();
      // 폼을 다시 그리면 입력 중인 비밀번호가 지워지므로, 초대 코드 칸만 자리에 끼워 넣는다.
      if (accountForm?.mode === 'signup' && !accountForm.busy && accountHealth?.signup?.inviteRequired) {
        const slot = $sheet.querySelector?.('#account-invite-slot');
        if (slot) slot.innerHTML = inviteFieldHTML();
        else accountSheet();
      }
    } catch {}
  }
}
function inviteFieldHTML() {
  return `<label for="account-invite">초대 코드</label><input id="account-invite" name="invite" autocomplete="off" value="${esc(accountForm?.invite || '')}" required>`;
}
function accountSheet() {
  const f = accountForm;
  if (!f) return;
  const busy = f.busy ? ' disabled' : '';
  const error = f.error ? `<p class="notice" role="alert">${esc(f.error)}</p>` : '';
  if (f.mode === 'forgot') {
    openSheet(`<h2>비밀번호 찾기</h2><p class="sub">가입한 이메일로 재설정 링크를 보내요. 링크는 30분 동안 한 번만 쓸 수 있어요.</p>
      ${accountHealth && !accountHealth.features?.email ? '<p class="notice">이 서버는 메일 발송이 아직 설정되지 않았어요. 비밀번호를 바꾸려면 운영자에게 문의해 주세요.</p>' : ''}
      <form data-action="account" class="account-form"><label for="account-email">이메일</label><input id="account-email" name="email" type="email" inputmode="email" autocomplete="username" value="${esc(f.email)}" required>
      ${error}${f.notice ? `<p class="notice" role="status">${esc(f.notice)}</p>` : ''}<button class="btn" type="submit"${busy}>${f.busy ? '보내는 중…' : '재설정 링크 보내기'}</button></form>
      <button class="link" data-action="account-mode" data-mode="login">로그인으로 돌아가기</button>`, { key: 'account' });
    return;
  }
  if (f.mode === 'reset') {
    openSheet(`<h2>새 비밀번호 정하기</h2><p class="sub">바꾸면 이 계정에 로그인한 모든 기기에서 다시 로그인해야 해요.</p>
      <form data-action="account" class="account-form"><label for="account-password">새 비밀번호 (8자 이상)</label><input id="account-password" name="password" type="password" autocomplete="new-password" minlength="8" required>
      ${error}<button class="btn" type="submit"${busy}>${f.busy ? '바꾸는 중…' : '비밀번호 바꾸기'}</button></form>`, { key: 'account' });
    return;
  }
  if (f.mode === 'delete') {
    openSheet(`<h2>계정 삭제</h2><p>${esc(account?.email || '')} 계정과 서버에 저장된 옷장·사진·구매 기록을 영구 삭제해요. 이 기기에 저장된 옷장은 지우지 않아요.</p>
      <form data-action="account" class="account-form"><label for="account-delete-password">비밀번호 확인</label><input id="account-delete-password" name="password" type="password" autocomplete="current-password" required>
      ${error}<button class="btn" type="submit"${busy}>${f.busy ? '삭제하는 중…' : '계정과 서버 자료 영구 삭제'}</button></form>
      <p class="fine">운영자가 이전에 만든 서버 백업 파일에는 백업 보관 기간 동안 남을 수 있어요.</p>`, { key: 'account' });
    return;
  }
  const signup = f.mode === 'signup';
  const garments = state.demo ? 0 : state.garments.length;
  const invite = `<div id="account-invite-slot" class="account-invite">${signup && accountHealth?.signup?.inviteRequired ? inviteFieldHTML() : ''}</div>`;
  const check = (field, label) => `<label class="toggle"><input type="checkbox" data-action="account-check" data-field="${field}"${f[field] ? ' checked' : ''}> ${label}</label>`;
  openSheet(`<h2>${signup ? '계정에 저장' : '로그인'}</h2>
    <p class="sub">${signup ? `이메일로 가입하면 지금 옷장(${garments ? `옷 ${garments}벌` : '취향·찜'}${photoBlobs.size ? `·사진 ${photoBlobs.size}장` : ''})을 계정에 저장해요. 저장은 뒤에서 하니 바로 계속 쓰면 돼요.` : '로그인하면 계정에 저장된 옷장과 이 기기 옷장을 맞춰요. 둘 다 내용이 있으면 어느 쪽을 쓸지 물어요.'}</p>
    <form data-action="account" class="account-form">
      <label for="account-email">이메일</label><input id="account-email" name="email" type="email" inputmode="email" autocomplete="${signup ? 'email' : 'username'}" value="${esc(f.email)}" required>
      <label for="account-password">비밀번호${signup ? ' (8자 이상)' : ''}</label><input id="account-password" name="password" type="password" autocomplete="${signup ? 'new-password' : 'current-password'}" minlength="${signup ? 8 : 1}" required>
      ${invite}
      ${signup ? `${AGREEMENT_HTML}${check('age14', '만 14세 이상이에요 (필수)')}${check('privacy', '개인정보 수집·이용에 동의해요 (필수)')}${check('terms', '이용 조건에 동의해요 (필수)')}` : ''}
      ${error}
      <button class="btn" type="submit"${busy}>${f.busy ? '확인하는 중…' : signup ? '가입하고 계정에 저장' : '로그인'}</button>
    </form>
    <button class="link" data-action="account-mode" data-mode="${signup ? 'login' : 'signup'}">${signup ? '이미 계정이 있어요 · 로그인' : '계정이 없어요 · 가입하기'}</button>
    ${signup ? '' : '<button class="link" data-action="account-mode" data-mode="forgot">비밀번호를 잊었어요</button>'}`, { key: 'account' });
}
async function submitAccountForm(form) {
  const f = accountForm;
  if (!f || f.busy) return;
  // 비밀번호 관리자가 채운 값은 input 이벤트 없이 들어올 수 있어 제출할 때 폼에서 다시 읽는다.
  for (const field of ['email', 'password', 'invite']) if (typeof form?.[field]?.value === 'string') f[field] = form[field].value;
  f.email = f.email.trim();
  if (f.mode === 'forgot' || f.mode === 'reset') {
    f.busy = true;
    f.error = '';
    accountSheet();
    try {
      const api = createAccountApi({ base: accountBase });
      if (f.mode === 'forgot') {
        const result = await api.forgotPassword(f.email.trim());
        f.notice = result?.message || '가입한 이메일이면 재설정 링크를 보냈어요.';
      } else {
        await api.resetPassword(f.token, f.password);
        accountForm = null;
        // The server ended every session of that account; this device signs in again.
        if (account?.token) saveAccount({ ...account, token: null });
        setSyncState({ phase: 'signed-out', message: '비밀번호를 바꿨어요. 새 비밀번호로 로그인하면 이어서 저장해요.' }, { notice: true });
        toast('비밀번호를 바꿨어요. 새 비밀번호로 로그인해 주세요');
        await openAccountSheet('login');
        return;
      }
    } catch (error) {
      f.error = error.message;
    }
    f.busy = false;
    f.password = '';
    if (accountForm === f) accountSheet();
    return;
  }
  if (f.mode === 'signup' && !(f.age14 && f.privacy && f.terms)) {
    f.error = '필수 항목 세 가지에 동의해야 가입할 수 있어요. 동의하지 않아도 이 기기에서는 계속 쓸 수 있어요.';
    accountSheet();
    return;
  }
  f.busy = true;
  f.error = '';
  accountSheet();
  try {
    if (f.mode === 'delete') {
      await accountApi().deleteAccount(f.password);
      saveAccount(null);
      syncChoice = null;
      accountForm = null;
      setSyncState({ phase: 'signed-out' }, { notice: true });
      closeSheet();
      toast('계정과 서버의 옷장을 삭제했어요. 이 기기의 옷장은 그대로예요');
      return;
    }
    const api = createAccountApi({ base: accountBase });
    const result = f.mode === 'signup'
      ? await api.signup({ email: f.email, password: f.password, inviteCode: f.invite || undefined, agreements: { version: AGREEMENT_VERSION, age14: true, privacy: true, terms: true } })
      : await api.login({ email: f.email, password: f.password });
    // 같은 계정으로 다시 로그인하면 마지막 동기화 지점을 이어 쓴다.
    const same = account?.userId === result.user.id;
    saveAccount({
      email: result.user.email, userId: result.user.id, token: result.token,
      synced: same ? account.synced || null : null, syncedAt: same ? account.syncedAt || null : null,
      photoMaskConsent: same ? account.photoMaskConsent === true : false,
      emailVerified: result.emailVerified === true,
    });
    syncChoice = null;
    if (accountForm === f) accountForm = null;
    setSyncState({ phase: 'idle' }, { notice: true });
    closeSheet();
    toast(f.mode === 'signup' ? '가입했어요. 옷장을 뒤에서 계정에 저장해요' : '로그인했어요. 계정 옷장과 맞추고 있어요');
    await kickSync();
  } catch (error) {
    f.busy = false;
    f.password = '';
    f.error = error.status === 401 && f.mode === 'delete' ? '비밀번호가 맞지 않아요.' : error.message;
    if (error.status === 401 && f.mode === 'delete') {
      // 로그인이 만료된 경우에도 같은 응답이 온다. 다시 로그인한 뒤 삭제하게 한다.
      if (error.code === 'signed-out') { saveAccount({ ...account, token: null }); f.error = '로그인이 만료됐어요. 다시 로그인한 뒤 삭제해 주세요.'; }
    }
    if (accountForm === f) accountSheet();
  }
}
function syncChoiceSheet() {
  const c = syncChoice;
  if (!c?.remote) return;
  openSheet(`<h2>어느 옷장을 쓸까요?</h2>
    <p>계정에 저장된 옷장과 이 기기 옷장이 서로 다르게 바뀌었어요. 자동으로 합치지 않아요.</p>
    <section class="sync-choice"><h3>계정 옷장</h3><p>${esc(wardrobeSummary(c.remote.state, c.remote.photoIds?.length || 0))}${c.remote.updatedAt ? ` · 마지막 저장 ${esc(syncTime(c.remote.updatedAt))}` : ''}</p>
      <button class="btn" data-action="sync-use-account">계정 옷장으로 바꾸기</button>
      <p class="fine">이 기기 옷장이 계정 옷장으로 바뀌어요. 필요하면 먼저 이 기기 옷장을 백업 파일로 받아 두세요.</p><button class="chip" data-action="backup">이 기기 옷장 백업</button></section>
    <section class="sync-choice"><h3>이 기기 옷장</h3><p>${esc(wardrobeSummary(storedWardrobe(state), photoBlobs.size))}</p>
      <button class="btn secondary" data-action="sync-use-device">이 기기 옷장을 계정에 저장</button>
      <p class="fine">계정에 있던 옷장이 이 기기 옷장으로 바뀌어요.</p></section>
    <button class="link" data-action="close-sheet">나중에 정하기</button>`, { key: 'sync-choice' });
}

// ── 알림
function showEraseReview(step = 1) {
  openSheet(
    `<h2>이전 자료까지 전체 삭제</h2><p>이 브라우저의 현재·이전 옷장, 사진, 찜, 구매 여정·옵션·이유·이력, 취향, 복구용 사본을 삭제합니다. 다른 앱의 자료는 유지합니다. Claude 최신 버전의 기록·원문 사본도 포함됩니다.${signedIn() ? ' 이 브라우저는 로그아웃되고, 계정에 저장된 옷장은 지우지 않아요(계정 자료는 프로필의 계정 삭제로 지워요).' : ''} 이 앱에서는 해당 자료를 열거나 백업할 수 없으니 최신 버전에서 먼저 백업해 주세요.</p><p class="notice">되돌릴 수 없어요. 현재 옷장은 아래에서, 이전 버전 자료는 해당 버전에서 먼저 백업해 주세요. 다른 옷장 탭을 모두 닫아 주세요. 내려받은 백업 파일은 별도로 지워야 합니다.</p><button class="chip" data-action="backup">현재 옷장 사진 포함 백업</button><button class="chip" data-action="recovery-backup">현재 저장 원문 받기</button><p>${step === 2 ? '삭제 범위를 확인했습니다. 마지막 버튼을 누르면 삭제를 시작합니다.' : '범위를 확인한 뒤 한 번 더 확인합니다.'}</p><button class="btn" data-action="${step === 2 ? 'erase-execute' : 'erase-confirm'}">${step === 2 ? '확인한 옷장 자료 영구 삭제' : '삭제 범위 확인 후 계속'}</button>`,
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
    // 백업 파일을 받은 날짜 기록은 옷장 자료가 아니라 이 기기의 메모라서 이전 자료
    // 범위(eoul:v1 등)와 따로, 전체 삭제가 끝난 뒤 지운다. 새 옷장은 다시 백업 알림을 받는다.
    clearBackupRecord();
    clearOffers(localStorage);
    backupNudgeDismissed = false;
    // 이 브라우저의 로그인도 이 기기 자료라서 함께 끝낸다. 계정에 저장된 옷장은 지우지 않는다.
    if (account) {
      if (account.token) accountApi().logout().catch(() => {});
      saveAccount(null);
      syncChoice = null;
      syncState = { phase: 'signed-out', message: '', progress: '' };
    }
    for (const url of photos.values()) URL.revokeObjectURL(url);
    releaseDraftPhotoURLs(draft);
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
    releaseDraftPhotoURLs(draft);
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
      if (name === 'eoul-wardrobe.eoul') { markBackup(); render(); }
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
  // 브라우저가 파일을 실제로 보관했는지는 알 수 없어 ‘받은 기록’으로만 남긴다.
  if (name === 'eoul-wardrobe.eoul') { markBackup(); render(); }
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
          el.textContent = signedIn() ? '한 번 더 누르면 현재 옷장·찜·구매 기록을 비워요(계정 옷장도 함께 비워져요)' : '한 번 더 누르면 현재 옷장·찜·구매 기록을 비워요';
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
      case 'open-plan':
        planSheet();
        break;
      case 'open-offers':
        beginOffers({ productId: el.dataset.id || null, journeyId: el.dataset.journey || null });
        if (accountBase && !accountHealth) {
          createAccountApi({ base: accountBase }).health().then((health) => { accountHealth = health; if (offerView) offerSheet(); }).catch(() => {});
        }
        break;
      case 'offer-add':
        if (!offerView) break;
        offerView.form = { seller: '', url: offerView.url || '', price: '', shipping: '', color: readOffers(localStorage, offerView.ref).requested.color ?? offerView.defaultColor, size: readOffers(localStorage, offerView.ref).requested.size || '', stock: 'unknown', sameProduct: 'unconfirmed' };
        offerView.error = '';
        offerSheet();
        break;
      case 'offer-edit': {
        if (!offerView) break;
        const data = readOffers(localStorage, offerView.ref);
        const offer = el.dataset.id === `catalog:${offerView.productId}` && offerView.catalog ? catalogOffer(offerView.catalog) : data.offers.find((o) => o.id === el.dataset.id);
        if (!offer) break;
        offerView.form = offerFormFrom(offer);
        if (offer.source === 'catalog') offerView.form = { ...offerView.form, price: '', shipping: '', stock: 'unknown' };
        offerView.error = '';
        offerSheet();
        break;
      }
      case 'offer-delete': {
        if (!offerView) break;
        const data = readOffers(localStorage, offerView.ref);
        writeOffers(localStorage, offerView.ref, { ...data, offers: data.offers.filter((o) => o.id !== el.dataset.id) });
        offerSheet();
        break;
      }
      case 'offer-form-cancel':
        if (offerView) { offerView.form = null; offerView.error = ''; offerSheet(); }
        break;
      case 'offer-refresh':
        await refreshOffers();
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
        const p = PRODUCT_BY_ID[el.dataset.id];
        if (!p || !SAFE_PRODUCTS.some((x) => x.id === p.id)) break;
        beginDraft();
        startOwnedCatalog(p.id);
        break;
      }
      case 'own-color': {
        const item = state.garments.find((g) => g.id === el.dataset.id);
        const color = el.dataset.color;
        const p = item?.productId ? PRODUCT_BY_ID[item.productId] : null;
        if (state.demo || !item || item.color || !Object.hasOwn(COLORS, color)) break;
        if (p?.color && p.colorSource !== 'image' && p.color !== color) break;
        try {
          await set({ garments: state.garments.map((g) => (g.id === item.id ? { ...g, color } : g)) });
          ownSheet(item.id);
          toast('색을 저장했어요 · 이제 구매 비교에도 쓰여요');
        } catch (error) {
          toast(storageMessage(error));
        }
        break;
      }
      case 'owned-catalog-start':
        startOwnedCatalog();
        break;
      case 'owned-catalog-select':
        if (draft?.entryMode === 'catalog' && findOwnedCatalog(draft.catalogQuery, SAFE_PRODUCTS).items.some((p) => p.id === el.dataset.id)) {
          draft.catalogProductId = el.dataset.id;
          draft.catalogColor = draft.color || null;
          ownedCatalogSheet();
        }
        break;
      case 'owned-catalog-color': {
        const p = ownedCatalogProduct();
        const color = el.dataset.color || null;
        // A product color shown by the seller can only be confirmed, not replaced:
        // a different color is a "similar" garment without the product link.
        const known = p?.color && p.colorSource !== 'image';
        if (!p || (color && (!Object.hasOwn(COLORS, color) || (known && p.color !== color)))) break;
        draft.catalogColor = color;
        ownedCatalogSheet();
        break;
      }
      case 'owned-catalog-confirm': {
        const p = ownedCatalogProduct();
        if (p && p.id === el.dataset.id && !ownedCatalogColorConflict(p)) await saveGarmentDraft();
        break;
      }
      case 'owned-catalog-search':
        if (draft?.entryMode === 'catalog') { draft.catalogProductId = null; draft.error = ''; ownedCatalogSheet(); }
        break;
      case 'owned-catalog-back':
        if (draft?.entryMode === 'catalog') {
          draft.entryMode = draft.catalogReturnMode || (draft.photoId ? 'photo' : 'choice');
          draft.catalogProductId = null;
          draft.error = '';
          addSheet();
        }
        break;
      case 'owned-catalog-similar': {
        const p = ownedCatalogProduct();
        if (!p || p.id !== el.dataset.id) break;
        const slot = SLOT_BY_ID[p.slot];
        draft.kind = slot.shape;
        draft.gender = slot.g;
        draft.slot = null;
        draft.productId = null;
        draft.color = draft.catalogColor;
        draft.catalogProductId = null;
        draft.entryMode = draft.photoId ? 'photo' : 'manual';
        draft.error = '';
        addSheet();
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
      case 'bg-remove':
        if (!draft || draft.saving) break;
        if (await serverBackgroundReady()) {
          if (!draft) break;
          // 사진을 서버로 보내기 전에 한 번 고르게 한다(이 기기·이 계정에서 기억한다).
          if (account.photoMaskConsent !== true) { draft.bgServerConsent = true; draft.bgError = ''; addSheet(); showBackgroundQuestion(); break; }
          await removeDraftBackground({ via: 'server' });
          break;
        }
        if (!draft) break;
        if (!backgroundAllowed) { draft.bgConsent = true; draft.bgError = ''; addSheet(); showBackgroundQuestion(); break; }
        await removeDraftBackground();
        break;
      case 'bg-allow':
        if (!draft) break;
        backgroundAllowed = true;
        draft.bgConsent = false;
        await removeDraftBackground();
        break;
      case 'bg-consent-cancel':
        if (draft) { draft.bgConsent = false; addSheet(); }
        break;
      case 'bg-server-allow':
        if (!draft || !signedIn()) break;
        saveAccount({ ...account, photoMaskConsent: true });
        draft.bgServerConsent = false;
        await removeDraftBackground({ via: 'server' });
        break;
      case 'bg-device-instead':
        if (!draft) break;
        // 이 세션은 기기 도구로 지운다. 서버 처리는 다시 묻지 않는다.
        backgroundServerOff = true;
        draft.bgServerConsent = false;
        if (!backgroundAllowed) { draft.bgConsent = true; addSheet(); showBackgroundQuestion(); break; }
        await removeDraftBackground();
        break;
      case 'bg-server-cancel':
        if (draft) { draft.bgServerConsent = false; addSheet(); }
        break;
      case 'photo-mask-off':
        if (!signedIn()) break;
        saveAccount({ ...account, photoMaskConsent: false });
        refreshAccountViews();
        toast('배경 지우기를 서버로 보내지 않아요. 다음부터 이 기기에서 지울지 물어요');
        break;
      case 'bg-restore':
        if (draft?.bgBefore && !draft.bgRunning && !draft.saving) {
          const before = draft.bgBefore;
          if (draft.preview) URL.revokeObjectURL(draft.preview);
          draft.asset = before.asset;
          draft.photoId = before.photoId;
          draft.preview = before.preview;
          draft.bgBefore = null;
          draft.photoRecognition = null;
          addSheet();
        }
        break;
      case 'crop-start':
        await startDraftCrop();
        break;
      case 'crop-cancel':
        if (draft && !draft.processing) { draft.cropEdit = null; addSheet(); }
        break;
      case 'crop-apply':
        if (draft?.cropEdit) await applyDraftCrop(draft.cropEdit);
        break;
      case 'crop-reset':
        if (draft?.crop) await applyDraftCrop(null);
        break;
      case 'clear-photo':
        if (draft) {
          releaseDraftPhotoAnalysis(draft, { clearResults: true });
          draft.token++;
          draft.processing = false;
          releaseDraftPhotoURLs(draft);
          resetDraftBackground(draft);
          draft.preview = null;
          draft.sourcePreview = null;
          draft.photoSource = null;
          draft.crop = null;
          draft.cropEdit = null;
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
        await downloadWardrobe(await wardrobeStore.backup(), 'eoul-wardrobe.eoul');
        break;
      case 'storage-help':
        storageHelpSheet();
        break;
      case 'request-persist': {
        const persisted = await requestPersistence();
        await refreshStorageHealth();
        toast(persisted ? '브라우저가 오래 보관으로 표시했어요. 그래도 백업 파일은 받아 두세요' : persisted === false ? '브라우저가 지금은 받아 주지 않았어요. 백업 파일을 받아 두세요' : '이 브라우저는 오래 보관 요청을 지원하지 않아요');
        break;
      }
      case 'backup-nudge-dismiss':
        backupNudgeDismissed = true;
        render();
        break;
      case 'account-open':
        await openAccountSheet(el.dataset.mode === 'login' ? 'login' : 'signup');
        break;
      case 'account-mode':
        if (accountForm && !accountForm.busy) {
          accountForm = { ...accountForm, mode: ['login', 'forgot'].includes(el.dataset.mode) ? el.dataset.mode : 'signup', password: '', error: '', notice: '' };
          accountSheet();
        }
        break;
      case 'account-nudge-dismiss':
        accountNudgeDismissed = true;
        render();
        break;
      case 'verify-send': {
        if (!signedIn()) break;
        try {
          const result = await accountApi().verifyRequest();
          if (result?.emailVerified) { saveAccount({ ...account, emailVerified: true }); refreshAccountViews(); toast('이미 확인한 이메일이에요'); }
          else toast('확인 메일을 보냈어요. 24시간 안에 메일의 링크를 열어 주세요');
        } catch (error) {
          if (error?.status === 401) syncFailed(error);
          toast(error?.message || '확인 메일을 보내지 못했어요');
        }
        break;
      }
      case 'account-delete-open':
        if (!signedIn()) break;
        accountForm = { mode: 'delete', email: account.email, password: '', busy: false, error: '' };
        accountSheet();
        break;
      case 'account-logout': {
        if (!account) break;
        const api = accountApi();
        saveAccount(null);
        syncChoice = null;
        setSyncState({ phase: 'signed-out' }, { notice: true });
        api.logout().catch(() => {});
        optionSheet('profile');
        toast('로그아웃했어요. 이 기기의 옷장은 그대로예요');
        break;
      }
      case 'sync-now':
        await kickSync();
        if (syncState.phase === 'idle') toast('계정과 맞춰져 있어요');
        else if (syncState.phase === 'choose') syncChoiceSheet();
        break;
      case 'sync-choose':
        if (!signedIn()) break;
        if (!syncChoice) await kickSync();
        if (syncChoice) syncChoiceSheet();
        break;
      case 'sync-use-account': {
        if (!signedIn() || !syncChoice) break;
        if (syncRunning) {
          toast('계정과 맞추는 중이에요. 잠시 후 다시 눌러 주세요');
          break;
        }
        const token = account.token;
        const pending = (async () => {
          try {
            if (await replaceWithAccountWardrobe(accountApi(), syncChoice.remote, token)) {
              closeSheet();
              toast('계정 옷장으로 바꿨어요');
            } else syncChoiceSheet();
          } catch (error) {
            if (!sameSession(token)) return;
            syncFailed(error);
            toast(syncState.message || '계정 옷장을 받지 못했어요. 이 기기 옷장은 그대로예요');
          }
        })();
        syncRunning = pending.finally(() => { syncRunning = null; });
        await syncRunning;
        if (syncQueued) await kickSync();
        break;
      }
      case 'sync-use-device': {
        if (!signedIn() || !syncChoice) break;
        if (syncRunning) {
          toast('계정과 맞추는 중이에요. 잠시 후 다시 눌러 주세요');
          break;
        }
        if (el.dataset.armed !== '1') {
          el.dataset.armed = '1';
          el.textContent = '한 번 더 누르면 계정 옷장을 이 기기 옷장으로 바꿔요';
          break;
        }
        const token = account.token;
        const pending = (async () => {
          try {
            await pushLocalWardrobe(accountApi(), syncChoice.remote.revision, token);
            if (syncQueued) toast('그 사이 계정 옷장이 또 바뀌었어요. 다시 확인해 주세요');
            else {
              closeSheet();
              toast('이 기기 옷장을 계정에 저장했어요');
            }
          } catch (error) {
            if (!sameSession(token)) return;
            syncFailed(error);
            toast(syncState.message || '계정에 저장하지 못했어요. 이 기기 옷장은 그대로예요');
          }
        })();
        syncRunning = pending.finally(() => { syncRunning = null; });
        await syncRunning;
        if (syncQueued) {
          await kickSync();
          if (syncChoice) syncChoiceSheet();
        }
        break;
      }
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
            kickSync();
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
  if (accountForm && !accountForm.busy) {
    if (id === 'account-email') accountForm.email = value;
    if (id === 'account-password' || id === 'account-delete-password') accountForm.password = value;
    if (id === 'account-invite') accountForm.invite = value;
  }
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
  if (id === 'owned-catalog-query' && draft.entryMode === 'catalog' && !draft.catalogProductId) {
    draft.catalogQuery = value.slice(0, 500);
    const results = $sheet.querySelector('#owned-catalog-results');
    // Replacing only results preserves the actual input focus and caret.
    if (results) results.innerHTML = ownedCatalogResults();
    else ownedCatalogSheet();
  }
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
    if (e.target.dataset?.action === 'offer-requested' && offerView) {
      const data = readOffers(localStorage, offerView.ref);
      const requested = { ...data.requested, ...(e.target.id === 'offer-requested-color' ? { color: e.target.value || null } : { size: e.target.value.trim() || null }) };
      if (requested.color === null && e.target.id !== 'offer-requested-color') requested.color = data.requested.color ?? offerView.defaultColor;
      writeOffers(localStorage, offerView.ref, { ...data, requested });
      offerSheet();
    }
    if (e.target.dataset?.action === 'account-check' && accountForm && !accountForm.busy && ['age14', 'privacy', 'terms'].includes(e.target.dataset.field))
      accountForm[e.target.dataset.field] = !!e.target.checked;
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
  const offerFormEl = e.target.closest('form[data-action="offer"]');
  if (offerFormEl) {
    e.preventDefault();
    const field = (name) => offerFormEl.elements?.[name] ?? offerFormEl[name];
    saveOfferForm({
      seller: field('seller')?.value, url: field('url')?.value, price: field('price')?.value, shipping: field('shipping')?.value,
      color: field('color')?.value, size: field('size')?.value, stock: field('stock')?.value, sameProduct: !!field('sameProduct')?.checked,
    });
    return;
  }
  const accountFormEl = e.target.closest('form[data-action="account"]');
  if (accountFormEl) {
    e.preventDefault();
    submitAccountForm(accountFormEl);
    return;
  }
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
// 메일의 확인·재설정 링크(#verify=…, #reset=…). 토큰은 주소의 # 뒤라 서버 로그·Referer에 남지 않는다.
async function handleAccountLink() {
  const hash = typeof location !== 'undefined' ? String(location.hash || '') : '';
  const match = /^#(verify|reset)=([A-Za-z0-9_-]{20,100})$/.exec(hash);
  if (!match || !accountBase) return;
  try { history.replaceState(null, '', location.pathname + location.search); } catch {}
  const [, purpose, token] = match;
  if (purpose === 'verify') {
    try {
      await createAccountApi({ base: accountBase }).verifyConfirm(token);
      if (account) saveAccount({ ...account, emailVerified: true });
      toast('이메일을 확인했어요');
    } catch (error) {
      toast(error?.message || '이메일을 확인하지 못했어요');
    }
    return;
  }
  accountForm = { mode: 'reset', token, email: account?.email || '', password: '', busy: false, error: '' };
  accountSheet();
}
const accountLinkHandled = appReady.then(handleAccountLink);
// 다른 기기에서 바꾼 옷장은 이 화면으로 돌아올 때나 연결이 돌아올 때 확인한다.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') kickSync();
});
window.addEventListener?.('online', () => kickSync());

// ── 사진 자르기 상자 끌기: 시트를 다시 그리지 않고 상자만 옮겨 손가락을 따라가게 한다
let cropDrag = null;
function placeCropBox(box, r) {
  box.style.left = `${(r.x * 100).toFixed(3)}%`;
  box.style.top = `${(r.y * 100).toFixed(3)}%`;
  box.style.width = `${(r.w * 100).toFixed(3)}%`;
  box.style.height = `${(r.h * 100).toFixed(3)}%`;
}
document.addEventListener('pointerdown', (e) => {
  const box = e.target?.closest?.('[data-crop-box]');
  if (!box || !draft?.cropEdit || draft.processing) return;
  const stage = box.closest('[data-crop-stage]')?.getBoundingClientRect();
  if (!stage?.width || !stage?.height) return;
  cropDrag = { id: e.pointerId, handle: e.target.dataset?.handle || 'move', x: e.clientX, y: e.clientY, from: { ...draft.cropEdit }, w: stage.width, h: stage.height, box };
  box.setPointerCapture?.(e.pointerId);
  e.preventDefault();
});
document.addEventListener('pointermove', (e) => {
  if (!cropDrag || e.pointerId !== cropDrag.id || !draft?.cropEdit) return;
  draft.cropEdit = dragCrop(cropDrag.from, cropDrag.handle, (e.clientX - cropDrag.x) / cropDrag.w, (e.clientY - cropDrag.y) / cropDrag.h);
  placeCropBox(cropDrag.box, draft.cropEdit);
});
const endCropDrag = (e) => { if (cropDrag && e.pointerId === cropDrag.id) cropDrag = null; };
document.addEventListener('pointerup', endCropDrag);
document.addEventListener('pointercancel', endCropDrag);
document.addEventListener('keydown', (e) => {
  if (!e.target?.matches?.('[data-crop-box]') || !draft?.cropEdit) return;
  const step = 0.02, moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
  if (!moves[e.key]) return;
  e.preventDefault();
  draft.cropEdit = dragCrop(draft.cropEdit, e.shiftKey ? 'se' : 'move', ...moves[e.key]);
  placeCropBox(e.target, draft.cropEdit);
});
