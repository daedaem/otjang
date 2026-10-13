import { SLOTS, SLOT_BY_ID, STYLES, OCCASIONS, CATS, COLORS, stylesFor } from './data/slots.js';
import { ROLE_LABEL } from './data/looks.js';
import { PRODUCTS, CATALOG } from './data/products.js';
import {
  recommendItems, recommendLooks, closetLooks, essentials, search, productsFor, scoreSlot, seasonOf, SEASON_LABEL,
  formatPrice, josa, shortName, brandsFor, brandStyleAffinity, PRODUCT_BY_ID, styleScore,
} from './engine.js';
import { garmentSvg, ICON } from './icons.js';

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
// 이전 버전(색이 붙은 종류)에서 옮겨 오기
const LEGACY = {
  'm-oxford-white': ['m-oxford', 'white'], 'm-oxford-blue': ['m-oxford', 'blue'], 'm-tee-white': ['m-tee', 'white'], 'm-knit-crew': ['m-knit', 'navy'],
  'm-knit-cable': ['m-cable', 'ivory'], 'm-denim': ['m-denim-raw', 'indigo'], 'm-slacks-grey': ['m-slacks', 'grey'], 'm-slacks-wide': ['m-slacks', 'black'],
  'm-fatigue': ['m-work-pants', 'olive'], 'm-sneaker-leather': ['m-white-sneaker', 'white'], 'm-chuck': ['m-canvas', 'ivory'], 'm-nb': ['m-runner', 'grey'],
  'm-boots': ['m-chelsea', 'brown'], 'm-barbour': ['m-wax', 'olive'], 'f-shirt-white': ['f-shirt', 'white'], 'f-shirt-stripe': ['f-stripe', 'blue'],
  'f-maryjane': ['f-flat', 'black'],
};

const defaults = { v: 2, onboarded: false, gender: null, styles: [], brands: [], brandOnly: false, occasion: null, budget: null, closet: [], saved: [], hidden: [], tab: 'home' };
let state = load();
let query = '';
let obStep = state.gender ? 2 : 1;
let lastLooks = [];
let closetFilter = 'all';
let draft = null; // 옷장에 넣는 중인 옷
const photos = new Map(); // 내 옷 사진 (이 기기의 IndexedDB)

function migrate(s) {
  if (!s.styles?.length && s.style) s.styles = [{ casual: s.gender === 'F' ? 'casual' : 'cityboy' }[s.style] || s.style];
  if (s.owned?.length && !s.closet?.length) {
    s.closet = s.owned.map((id, n) => {
      const [slot, color] = LEGACY[id] || [id, SLOT_BY_ID[id]?.colors?.[0]];
      return SLOT_BY_ID[slot] ? { id: `c${Date.now()}${n}`, slot, color } : null;
    }).filter(Boolean);
  }
  delete s.owned;
  delete s.style;
  s.closet = (s.closet || []).filter((i) => SLOT_BY_ID[i.slot]);
  s.saved = (s.saved || []).filter((id) => PRODUCT_BY_ID[id]);
  return s;
}
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...defaults, ...migrate(JSON.parse(raw)), tab: 'home' } : { ...defaults };
  } catch {
    return { ...defaults };
  }
}
function persist() {
  try {
    const { tab, ...rest } = state;
    localStorage.setItem(KEY, JSON.stringify(rest));
  } catch {
    /* 저장이 막힌 브라우저에서도 화면은 그대로 동작한다 */
  }
}
function set(patch, { rerender = true } = {}) {
  state = { ...state, ...patch };
  persist();
  if (rerender) render();
}

// ── 사진 저장 (IndexedDB, 실패해도 앱은 동작)
let dbp = null;
function db() {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      try {
        const req = indexedDB.open('eoul', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('photos');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      } catch (e) {
        reject(e);
      }
    });
  }
  return dbp;
}
async function photoPut(id, data) {
  photos.set(id, data);
  try {
    const d = await db();
    d.transaction('photos', 'readwrite').objectStore('photos').put(data, id);
  } catch {
    /* 이번 세션 동안만 보인다 */
  }
}
async function photoDelete(id) {
  photos.delete(id);
  try {
    const d = await db();
    d.transaction('photos', 'readwrite').objectStore('photos').delete(id);
  } catch {
    /* 무시 */
  }
}
async function photoLoadAll() {
  try {
    const d = await db();
    const store = d.transaction('photos').objectStore('photos');
    const ids = state.closet.filter((i) => i.photo).map((i) => i.id);
    await Promise.all(ids.map((id) => new Promise((res) => {
      const r = store.get(id);
      r.onsuccess = () => { if (r.result) photos.set(id, r.result); res(); };
      r.onerror = () => res();
    })));
    if (ids.length) render();
  } catch {
    /* 사진 없이 그림으로 보여 준다 */
  }
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const $app = document.getElementById('app');
const $sheet = document.getElementById('sheet-root');
const $toast = document.getElementById('toast');
const myStyles = () => state.styles.filter((s) => STYLES[s]?.g.includes(state.gender));
const styleLine = () => {
  const list = myStyles();
  return list.length ? `${STYLES[list[0]].short}${list.length > 1 ? ` 외 ${list.length - 1}` : ''}` : '스타일';
};
const myCloset = () => state.closet.filter((i) => SLOT_BY_ID[i.slot]?.g === state.gender);
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
  const slot = SLOT_BY_ID[item.slot];
  if (item.productId && PRODUCT_BY_ID[item.productId]) return picture(PRODUCT_BY_ID[item.productId], slot, cls);
  if (item.photo && photos.has(item.id)) return `<div class="${cls}"><img src="${photos.get(item.id)}" alt="${esc(slot.name)}"></div>`;
  return `<div class="${cls}">${art(slot, item.color)}</div>`;
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
      <div class="reason">${esc(reasons?.[0] || slot.why)}</div>
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
    return `<div class="tile"><span class="badge">내 옷</span>${inner}</div>`;
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
        <span>${r.ownedCount ? `내 옷 ${r.ownedCount}개${r.buyCount ? ` + 새로 ${r.buyCount}개` : ''}` : `새로 ${r.buyCount}개`}</span>
        <b>${r.buyCount ? formatPrice(r.buyTotal) : '가진 옷으로 완성'}</b>
      </div>
    </div>
  </button>`;
}

// ── 시작 화면: 성별 → 스타일(최대 3개) → 자주 사는 브랜드(선택)
function styleTiles(g) {
  const used = new Set();
  return stylesFor(g).map((key) => {
    const s = STYLES[key];
    const others = (x) => Math.max(...stylesFor(g).filter((k) => k !== key).map((k) => x.style[k] || 0));
    const picks = SLOTS.filter((x) => x.g === g && (x.style[key] || 0) >= 2 && x.cat !== 'acc' && !used.has(x.id))
      .sort((a, b) => (b.style[key] - others(b)) - (a.style[key] - others(a)) || b.style[key] - a.style[key])
      .map((slot) => ({ slot, product: productsFor(slot.id)[0] }))
      .filter((x) => x.product)
      .slice(0, 3);
    picks.forEach((x) => used.add(x.slot.id));
    const order = state.styles.indexOf(key);
    return `<button class="pick" data-action="toggle-style" data-style="${key}" aria-pressed="${order >= 0}">
      <div><b>${s.label}${order >= 0 ? ` <span class="order">${order + 1}</span>` : ''}</b><span>${esc(s.desc[g])}</span></div>
      <div class="mini">${picks.map((x) => `<div>${x.product.img ? `<img src="${esc(x.product.img)}" alt="" referrerpolicy="no-referrer" data-slot="${x.slot.id}">` : art(x.slot)}</div>`).join('')}</div>
    </button>`;
  }).join('');
}
function brandChips({ action = 'toggle-brand', limit = 40 } = {}) {
  const g = state.gender;
  const st = myStyles();
  const list = brandsFor(g)
    .map((b) => ({ ...b, aff: st.reduce((s, k, i) => s + brandStyleAffinity(b.name, g, k) * (i ? 0.7 : 1), 0) * Math.log2(Math.min(b.count, 12) + 1) }))
    .sort((a, b) => b.aff - a.aff || b.count - a.count)
    .slice(0, limit);
  return list.map((b) => `<button class="chip" data-action="${action}" data-brand="${esc(b.name)}" aria-pressed="${state.brands.includes(b.name)}">${esc(b.name)}</button>`).join('');
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
      ${Object.entries(OCCASIONS).map(([k, v]) => `<button class="chip" data-action="occasion" data-occ="${k}" aria-pressed="${state.occasion === k}">${v}</button>`).join('')}
      <button class="chip ghost" data-action="open-budget" aria-pressed="${!!state.budget}">${budgetLabel}${ICON.chevron}</button>
    </div>
  </header>`;
}

function myBrandRow() {
  if (!state.brands.length) return '';
  const st = myStyles();
  const season = seasonOf();
  const picks = PRODUCTS.filter((p) => state.brands.includes(p.brand) && SLOT_BY_ID[p.slot].g === state.gender && SLOT_BY_ID[p.slot].seasons.includes(season) && !p.summer
    && (!state.budget || p.price <= state.budget) && !state.closet.some((i) => i.productId === p.id))
    .map((p) => ({ p, s: styleScore(SLOT_BY_ID[p.slot], st) * 2 + (p.rating || 4.4) * Math.log10((p.reviews || 0) + (p.likes || 0) / 8 + 10) / 3 }))
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
  const ctxLine = [SEASON_LABEL[season], myStyles().map((s) => STYLES[s].short).join('·'), state.occasion ? OCCASIONS[state.occasion] : null].filter(Boolean).join(' · ');
  const ownedCount = myCloset().length;
  return `
    <section class="section">
      <div class="section-head"><div><h2>오늘의 코디</h2><div class="sub">${esc(ctxLine)}${ownedCount ? ` · 내 옷 ${ownedCount}벌 반영` : ''}</div></div></div>
      ${looks.length ? `<div class="looks">${looks.map((r) => lookCard(r)).join('')}</div>` : `<div class="notice">이 조건에 맞는 코디가 아직 없어요. 예산·상황·브랜드 조건을 넓혀 보세요.</div>`}
      ${ownedCount ? '' : `<div class="notice" style="margin-top:8px">가진 옷을 알려 주면 그 옷을 살린 코디로 바꿔 드려요. <button class="link" data-action="tab" data-tab="closet" style="text-decoration:underline">옷장 채우기</button></div>`}
    </section>
    ${myBrandRow()}
    <section class="section">
      <div class="section-head"><div><h2>지금 사면 좋은 아이템</h2><div class="sub">${ownedCount ? '가진 옷과 가장 많이 어울리는 순서예요' : '고른 스타일의 기본부터 골랐어요'}${state.brandOnly ? ' · 내 브랜드만' : ''}</div></div></div>
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
  const notice = r.understood ? '' : `<div class="notice">아직 이해하지 못한 표현이에요. 대신 고른 스타일에 맞는 아이템을 보여 드릴게요.<div class="suggest">${EXAMPLES[state.gender].map((e) => `<button class="chip" data-action="example" data-q="${esc(e)}">${esc(e)}</button>`).join('')}</div></div>`;
  const outfit = r.outfit ? `<section class="section"><div class="section-head"><div><h2>이렇게 입어 보세요</h2><div class="sub">${esc(r.outfit.look.title)}</div></div></div>${lookCard(r.outfit, { wide: true })}</section>` : '';
  const items = r.items.length
    ? `<section class="section"><div class="section-head"><div><h2>추천 아이템 ${r.items.length}개</h2><div class="sub">${SEASON_LABEL[r.season]} 기준 · 평점과 후기 수를 함께 봤어요</div></div></div><div class="grid">${r.items.map(gridCard).join('')}</div></section>`
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
    <div class="section-head"><div><h2>내 옷장</h2><div class="sub">${items.length ? `${items.length}벌 · ${esc(myStyles().map((s) => STYLES[s].short).join('·'))} 기본템 ${ess.length - missing.length}/${ess.length}` : '가진 옷을 넣으면 그 옷으로 코디를 짜 드려요'}</div></div>
      <button class="btn small" data-action="add-start">${ICON.plus}옷 넣기</button></div>
  </section>`;

  if (!items.length) {
    return `${head}<section class="section" style="padding-top:4px">
      <div class="ways">
        <button class="way" data-action="add-start">${ICON.hanger}<b>종류 골라 넣기</b><span>셔츠·바지 그림을 누르고 색만 고르면 돼요</span></button>
        <button class="way" data-action="add-photo">${ICON.camera}<b>사진으로 넣기</b><span>사진은 이 기기에만 저장돼요</span></button>
        <button class="way" data-action="tab" data-tab="home">${ICON.sparkle}<b>상품에서 넣기</b><span>추천 상품을 열고 "이 상품 있어요"를 누르세요</span></button>
      </div>
    </section>${essentialSection(ess)}`;
  }

  const { ready, almost } = closetLooks(state, { limit: 3 });
  const today = `<section class="section">
    <div class="section-head"><div><h2>오늘 뭐 입지?</h2><div class="sub">${ready.length ? '가진 옷만으로 만든 코디예요' : '가진 옷이 조금 더 있으면 옷장만으로 코디를 짜 드려요'}</div></div></div>
    ${ready.length ? `<div class="looks">${ready.map((r) => lookCard(r)).join('')}</div>` : ''}
    ${almost.length ? `<h3 class="block">하나만 사면 완성</h3><div class="looks">${almost.map((r) => lookCard(r)).join('')}</div>` : ''}
  </section>`;

  const cats = Object.entries(CATS).filter(([cat]) => items.some((i) => SLOT_BY_ID[i.slot].cat === cat));
  const shown = items.filter((i) => closetFilter === 'all' || SLOT_BY_ID[i.slot].cat === closetFilter);
  const grid = `<section class="section">
    <div class="section-head"><div><h2>내 옷</h2></div></div>
    <div class="chips" style="padding-top:0"><button class="chip" data-action="closet-filter" data-cat="all" aria-pressed="${closetFilter === 'all'}">전체 ${items.length}</button>${cats.map(([cat, label]) => `<button class="chip" data-action="closet-filter" data-cat="${cat}" aria-pressed="${closetFilter === cat}">${label} ${items.filter((i) => SLOT_BY_ID[i.slot].cat === cat).length}</button>`).join('')}</div>
    <div class="closet-items">${shown.map((i) => {
      const slot = SLOT_BY_ID[i.slot];
      const p = i.productId ? PRODUCT_BY_ID[i.productId] : null;
      return `<button class="citem" data-action="open-own" data-id="${i.id}">${itemPicture(i)}<span class="cname"><i class="dot" style="background:${hex(i.color)}"></i>${esc(shortName(slot))}</span><span class="cbrand">${esc(p?.brand || i.brand || COLORS[i.color]?.label || '')}</span></button>`;
    }).join('')}</div>
  </section>`;
  return head + today + grid + essentialSection(ess);
}

function essentialSection(ess) {
  const missing = ess.filter((e) => !e.owned);
  if (!missing.length) return '';
  return `<section class="section">
    <div class="section-head"><div><h2>기본템 체크</h2><div class="sub">${esc(myStyles().map((s) => STYLES[s].label).join('·'))} 옷장의 기본이에요. 있는 건 눌러서 넣어 주세요.</div></div></div>
    <div class="closet-grid">${missing.map(({ slot }) => `<button class="own" data-action="add-slot" data-slot="${slot.id}">${art(slot)}<span>${esc(slot.name)}</span></button>`).join('')}</div>
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
    $app.innerHTML = renderOnboarding();
    return;
  }
  const body = state.tab === 'closet' ? renderCloset() : state.tab === 'saved' ? renderSaved() : renderHome();
  $app.innerHTML = (state.tab === 'home' ? topBar() : '') + `<main>${body}</main>` + nav();
}

// ── 시트
function openSheet(html) {
  const scroll = $sheet.querySelector('.sheet')?.scrollTop;
  $sheet.innerHTML = `<div class="scrim" data-action="close-sheet"></div><div class="sheet" role="dialog" aria-modal="true"><div class="grabber"></div><button class="sheet-close" data-action="close-sheet" aria-label="닫기">${ICON.close}</button>${html}</div>`;
  document.body.style.overflow = 'hidden';
  return scroll;
}
function closeSheet() {
  $sheet.innerHTML = '';
  document.body.style.overflow = '';
  draft = null;
}

function lookRows(r) {
  return r.items.map((i) => {
    if (i.owned) {
      const pic = i.item ? itemPicture(i.item) : `<div class="thumb">${art(i.slot, i.color)}</div>`;
      const brand = i.item?.productId ? PRODUCT_BY_ID[i.item.productId]?.brand : i.item?.brand;
      return `<div class="look-row">${pic}<div><div class="role">${ROLE_LABEL[i.role]} · 내 옷</div><div class="nm">${esc([COLORS[i.color]?.label, brand, i.slot.name].filter(Boolean).join(' '))}</div></div><span class="badge">보유</span></div>`;
    }
    return `<button class="look-row" data-action="open-item" data-id="${i.product.id}">${picture(i.product, i.slot)}<div><div class="role">${ROLE_LABEL[i.role]} · ${esc(i.product.brand)}</div><div class="nm">${esc(i.product.name)}</div></div><span class="pr">${formatPrice(i.product.price)}</span></button>`;
  }).join('');
}

function itemSheet(id) {
  const p = PRODUCT_BY_ID[id];
  if (!p) return;
  const slot = SLOT_BY_ID[p.slot];
  const c = { gender: state.gender, styles: myStyles(), occasion: state.occasion, season: seasonOf(), ownedSlots: new Set(myCloset().map((i) => i.slot)) };
  const { reasons } = scoreSlot(slot, c);
  const alts = productsFor(slot.id).filter((x) => x.id !== p.id).slice(0, 8);
  const sameBrand = PRODUCTS.filter((x) => x.brand === p.brand && x.id !== p.id && SLOT_BY_ID[x.slot].g === state.gender && x.slot !== p.slot).slice(0, 8);
  const anchor = { id: 'preview', slot: p.slot, color: p.color, productId: p.id };
  const look = recommendLooks({ ...state, budget: null }, { limit: 1, occasion: null, anchorItem: anchor })[0];
  const owned = state.closet.some((i) => i.productId === p.id);
  lastLooks = look ? [look] : [];
  openSheet(`
    ${picture(p, slot, 'hero')}
    <div style="margin-top:14px">${brandTag(p)}</div>
    <h2 class="detail-title">${esc(p.name)}</h2>
    <div class="detail-price">${formatPrice(p.price)}${stars(p)}</div>
    <div class="fine">${esc(p.store)} 판매가 · ${esc(CATALOG.checkedLabel)} 확인${p.color ? ` · ${COLORS[p.color]?.label || ''}` : ''}</div>
    <div class="why"><h3>이래서 추천해요</h3><ul>
      ${[...new Set([slot.why, ...reasons])].slice(0, 3).map((r) => `<li>${esc(r)}</li>`).join('')}
      <li>이렇게 입어요: ${esc(slot.tip)}</li>
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
    <div class="total"><span>${r.buyCount ? `새로 살 것 ${r.buyCount}개` : '가진 옷으로 완성'}</span><b>${r.buyCount ? formatPrice(r.buyTotal) : ''}</b></div>
    ${buyIds.length ? `<div class="cta"><button class="btn" data-action="save-all" data-ids="${buyIds.join(',')}">필요한 ${buyIds.length}개 모두 찜하기</button></div>` : ''}
  `);
}

// 내 옷 한 벌
function ownSheet(id) {
  const item = state.closet.find((i) => i.id === id);
  if (!item) return;
  const slot = SLOT_BY_ID[item.slot];
  const p = item.productId ? PRODUCT_BY_ID[item.productId] : null;
  const looks = recommendLooks({ ...state, budget: null, occasion: null }, { limit: 2, occasion: null, anchorItem: item });
  lastLooks = [];
  openSheet(`
    ${itemPicture(item, 'hero')}
    <div class="brand-name" style="margin-top:14px">${esc(p?.brand || item.brand || '브랜드 미입력')}</div>
    <h2 class="detail-title">${esc(p?.name || `${COLORS[item.color]?.label || ''} ${slot.name}`)}</h2>
    <div class="fine">${esc(slot.name)} · ${esc(COLORS[item.color]?.label || '색 미입력')}</div>
    <div class="why"><h3>이렇게 입어요</h3><ul><li>${esc(slot.tip)}</li></ul></div>
    ${looks.length ? `<h3 class="block">이 옷으로 만든 코디</h3><div class="looks">${looks.map((r) => lookCard(r)).join('')}</div>` : '<p class="sub">이 옷이 들어가는 코디 공식이 아직 없어요.</p>'}
    <div class="sheet-links">
      ${p ? `<a class="link" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">판매 페이지</a>` : ''}
      <button class="link" data-action="search-with" data-slot="${slot.id}">이 옷에 어울리는 아이템 찾기</button>
      <button class="link danger" data-action="remove-own" data-id="${item.id}">옷장에서 빼기</button>
    </div>
  `);
}

// 옷 넣기: 종류 → 색·브랜드(선택)·사진(선택)
function addSheet() {
  const g = state.gender;
  if (!draft?.slot) {
    const groups = Object.entries(CATS).map(([cat, label]) => [label, SLOTS.filter((s) => s.g === g && s.cat === cat)]).filter(([, l]) => l.length);
    openSheet(`
      <h2 class="detail-title">어떤 옷인가요?</h2>
      ${draft?.photo ? `<div class="draft-photo"><img src="${draft.photo}" alt="고른 사진"></div>` : `<p class="sub" style="margin-top:4px">비슷한 종류를 누르면 돼요. <button class="link" data-action="add-photo" style="text-decoration:underline">사진으로 넣기</button></p>`}
      ${groups.map(([label, list]) => `<div class="closet-group"><h3>${label}</h3><div class="closet-grid">${list.map((s) => `<button class="own" data-action="draft-slot" data-slot="${s.id}">${art(s, draft?.color)}<span>${esc(s.name)}</span></button>`).join('')}</div></div>`).join('')}
    `);
    return;
  }
  const slot = SLOT_BY_ID[draft.slot];
  const colorKeys = [...new Set([...slot.colors, ...Object.keys(COLORS)])];
  const brandList = [...new Set([...state.brands, ...brandsFor(g).slice(0, 18).map((b) => b.name)])];
  openSheet(`
    <h2 class="detail-title">${esc(slot.name)}</h2>
    <div class="draft-preview">${draft.photo ? `<img src="${draft.photo}" alt="고른 사진">` : art(slot, draft.color)}</div>
    <div class="opt-group"><h3>색</h3><div class="swatches">${colorKeys.map((k) => `<button class="sw" data-action="draft-color" data-color="${k}" aria-pressed="${draft.color === k}" aria-label="${COLORS[k].label}" title="${COLORS[k].label}"><i style="background:${COLORS[k].hex}"></i></button>`).join('')}</div><div class="sub" style="margin-top:6px">${esc(COLORS[draft.color]?.label || '')}${draft.autoColor ? ' · 사진에서 고른 색이에요' : ''}</div></div>
    <div class="opt-group"><h3>브랜드 <span class="sub">(몰라도 돼요)</span></h3><div class="opts">${brandList.map((b) => `<button class="chip" data-action="draft-brand" data-brand="${esc(b)}" aria-pressed="${draft.brand === b}">${esc(b)}</button>`).join('')}</div></div>
    <div class="cta">
      ${draft.photo ? '' : `<button class="btn secondary" data-action="add-photo" aria-label="사진 추가">${ICON.camera}</button>`}
      <button class="btn" data-action="draft-save">옷장에 넣기</button>
    </div>
    <div class="sheet-links"><button class="link" data-action="draft-back">종류 다시 고르기</button></div>
  `);
}

function optionSheet(kind) {
  const budgetOpts = BUDGETS.map(([v, label]) => `<button class="chip" data-action="set-budget" data-v="${v ?? ''}" aria-pressed="${state.budget === v}">${label}</button>`).join('');
  if (kind === 'budget') {
    openSheet(`<h2 class="detail-title">한 벌 예산</h2><p class="sub" style="margin-top:4px">이 가격 이하 상품만 추천해요.</p><div class="opts" style="margin-top:16px">${budgetOpts}</div>`);
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
      ${[...myStyles(), ...stylesFor(state.gender).filter((k) => !state.styles.includes(k))].map((k) => { const n = state.styles.indexOf(k); return `<button class="chip" data-action="profile-style" data-style="${k}" aria-pressed="${n >= 0}">${n >= 0 ? `${n + 1}. ` : ''}${STYLES[k].label}</button>`; }).join('')}
    </div></div>
    <div class="opt-group"><h3>자주 사는 브랜드</h3><div class="opts">
      ${state.brands.map((b) => `<span class="chip" aria-pressed="true">${esc(b)}</span>`).join('')}
      <button class="chip ghost" data-action="open-brands">${state.brands.length ? '바꾸기' : '고르기'}</button>
    </div>
    ${state.brands.length ? `<label class="toggle"><input type="checkbox" id="brand-only" data-action="toggle-brand-only-box" ${state.brandOnly ? 'checked' : ''}> 내 브랜드 상품만 추천</label>` : ''}</div>
    <div class="opt-group"><h3>한 벌 예산</h3><div class="opts">${budgetOpts}</div></div>
    <div class="opt-group"><h3>저장된 정보</h3><p class="sub">옷장·사진·찜·취향은 이 기기의 브라우저에만 있어요.</p>
      <button class="chip" data-action="reset" style="margin-top:10px">모두 지우고 처음부터</button></div>
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
  const savedBtn = document.querySelector('.nav [data-tab="saved"]');
  if (savedBtn) savedBtn.innerHTML = `${ICON.heart}찜${state.saved.length ? `<span class="count">${state.saved.length}</span>` : ''}`;
}

const newId = () => `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
function addToCloset(item, message) {
  const before = state.closet;
  const entry = { id: newId(), addedAt: Date.now(), ...item };
  set({ closet: [...state.closet, entry] });
  toast(message || `${SLOT_BY_ID[item.slot].name}${josa(SLOT_BY_ID[item.slot].name, '을', '를')} 옷장에 넣었어요`, () => {
    set({ closet: before });
    if (entry.photo) photoDelete(entry.id);
  });
  return entry;
}

// 사진의 가운데 색으로 옷 색을 짐작한다 (사용자가 바꿀 수 있는 제안)
function guessColor(img) {
  const c = document.createElement('canvas');
  c.width = 40;
  c.height = 40;
  const g = c.getContext('2d');
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  g.drawImage(img, w * 0.3, h * 0.3, w * 0.4, h * 0.4, 0, 0, 40, 40);
  const d = g.getImageData(0, 0, 40, 40).data;
  let r = 0, gg = 0, b = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) {
    r += d[i]; gg += d[i + 1]; b += d[i + 2]; n += 1;
  }
  r /= n; gg /= n; b /= n;
  let best = 'grey';
  let bestD = Infinity;
  for (const [k, v] of Object.entries(COLORS)) {
    const x = parseInt(v.hex.slice(1), 16);
    const dd = (r - (x >> 16)) ** 2 + (gg - ((x >> 8) & 255)) ** 2 + (b - (x & 255)) ** 2;
    if (dd < bestD) { bestD = dd; best = k; }
  }
  return best;
}
function readPhoto(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      const max = 720;
      const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * scale);
      c.height = Math.round(img.naturalHeight * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      const data = c.toDataURL('image/jpeg', 0.82);
      const color = guessColor(img);
      draft = { ...(draft || {}), photo: data, color: draft?.slot ? color : color, autoColor: true };
      addSheet();
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

// ── 이벤트
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || el.disabled) return;
  const a = el.dataset.action;
  if (a === 'ask' || a === 'toggle-brand-only-box') return;
  switch (a) {
    case 'pick-gender':
      set({ gender: el.dataset.g, styles: [] });
      obStep = 2;
      render();
      window.scrollTo(0, 0);
      break;
    case 'toggle-style': {
      const k = el.dataset.style;
      const has = state.styles.includes(k);
      if (!has && state.styles.length >= 3) { toast('스타일은 세 개까지 고를 수 있어요'); break; }
      set({ styles: has ? state.styles.filter((x) => x !== k) : [...state.styles, k] });
      break;
    }
    case 'ob-next': obStep = 3; render(); window.scrollTo(0, 0); break;
    case 'ob-back': obStep = Math.max(1, obStep - 1); render(); break;
    case 'toggle-brand': {
      const b = el.dataset.brand;
      set({ brands: state.brands.includes(b) ? state.brands.filter((x) => x !== b) : [...state.brands, b] });
      break;
    }
    case 'toggle-brand-sheet': {
      const b = el.dataset.brand;
      set({ brands: state.brands.includes(b) ? state.brands.filter((x) => x !== b) : [...state.brands, b] });
      el.setAttribute('aria-pressed', String(state.brands.includes(b)));
      break;
    }
    case 'ob-done': set({ onboarded: true, tab: 'home' }); window.scrollTo(0, 0); break;
    case 'toggle-brand-only': set({ brandOnly: !state.brandOnly }); break;
    case 'occasion': set({ occasion: state.occasion === el.dataset.occ ? null : el.dataset.occ }); break;
    case 'open-budget': optionSheet('budget'); break;
    case 'open-profile': optionSheet('profile'); break;
    case 'open-brands': optionSheet('brands'); break;
    case 'set-budget': set({ budget: el.dataset.v ? Number(el.dataset.v) : null }); closeSheet(); break;
    case 'set-gender': set({ gender: el.dataset.g, styles: stylesFor(el.dataset.g).slice(0, 1), brands: [] }); optionSheet('profile'); break;
    case 'profile-style': {
      const k = el.dataset.style;
      const has = state.styles.includes(k);
      if (has && myStyles().length === 1) { toast('스타일은 하나 이상 골라 주세요'); break; }
      if (!has && myStyles().length >= 3) { toast('스타일은 세 개까지 고를 수 있어요'); break; }
      set({ styles: has ? state.styles.filter((x) => x !== k) : [...state.styles, k] });
      optionSheet('profile');
      break;
    }
    case 'reset':
      if (el.dataset.armed !== '1') {
        el.dataset.armed = '1';
        el.textContent = '한 번 더 누르면 모두 지워져요';
        break;
      }
      state.closet.forEach((i) => i.photo && photoDelete(i.id));
      state = { ...defaults };
      obStep = 1;
      persist();
      closeSheet();
      render();
      break;
    case 'clear-q': query = ''; render(); document.getElementById('ask-input')?.focus(); break;
    case 'example': query = el.dataset.q; render(); window.scrollTo(0, 0); break;
    case 'tab':
      closeSheet();
      if (el.dataset.tab === 'home' && state.tab === 'home' && query) query = '';
      set({ tab: el.dataset.tab });
      window.scrollTo(0, 0);
      break;
    case 'open-item': e.preventDefault(); itemSheet(el.dataset.id); break;
    case 'open-look': lookSheet(Number(el.dataset.index)); break;
    case 'open-own': ownSheet(el.dataset.id); break;
    case 'close-sheet': closeSheet(); break;
    case 'save': {
      e.stopPropagation();
      const id = el.dataset.id;
      const on = state.saved.includes(id);
      set({ saved: on ? state.saved.filter((x) => x !== id) : [...state.saved, id] }, { rerender: state.tab === 'saved' });
      refreshHearts(id);
      if (!on) toast('찜했어요');
      break;
    }
    case 'save-all': {
      const ids = el.dataset.ids.split(',');
      set({ saved: [...new Set([...state.saved, ...ids])] }, { rerender: false });
      ids.forEach(refreshHearts);
      closeSheet();
      toast(`${ids.length}개를 찜했어요`);
      break;
    }
    case 'own-product': {
      const p = PRODUCT_BY_ID[el.dataset.id];
      closeSheet();
      addToCloset({ slot: p.slot, color: p.color || SLOT_BY_ID[p.slot].colors[0], brand: p.brand, productId: p.id }, `${p.brand} ${shortName(SLOT_BY_ID[p.slot])}${josa(shortName(SLOT_BY_ID[p.slot]), '을', '를')} 옷장에 넣었어요`);
      break;
    }
    case 'remove-own': {
      const item = state.closet.find((i) => i.id === el.dataset.id);
      const before = state.closet;
      closeSheet();
      set({ closet: state.closet.filter((i) => i.id !== el.dataset.id) });
      toast('옷장에서 뺐어요', () => set({ closet: before }));
      if (item?.photo) setTimeout(() => { if (!state.closet.some((i) => i.id === item.id)) photoDelete(item.id); }, 3500);
      break;
    }
    case 'search-with': {
      const slot = SLOT_BY_ID[el.dataset.slot];
      closeSheet();
      query = `${shortName(slot)}에 어울리는 ${slot.cat === 'shoes' ? '바지' : slot.cat === 'bottom' ? '상의' : '바지'}`;
      set({ tab: 'home' });
      window.scrollTo(0, 0);
      break;
    }
    case 'closet-filter': closetFilter = el.dataset.cat; render(); break;
    case 'add-start': draft = {}; addSheet(); break;
    case 'add-slot': {
      const slot = SLOT_BY_ID[el.dataset.slot];
      draft = { slot: slot.id, color: slot.colors[0] };
      addSheet();
      break;
    }
    case 'add-photo': document.getElementById('photo-input')?.click(); break;
    case 'draft-slot': {
      const slot = SLOT_BY_ID[el.dataset.slot];
      draft = { ...draft, slot: slot.id, color: draft?.autoColor ? draft.color : slot.colors[0] };
      addSheet();
      break;
    }
    case 'draft-color': draft = { ...draft, color: el.dataset.color, autoColor: false }; addSheet(); break;
    case 'draft-brand': draft = { ...draft, brand: draft.brand === el.dataset.brand ? null : el.dataset.brand }; addSheet(); break;
    case 'draft-back': draft = { ...draft, slot: null }; addSheet(); break;
    case 'draft-save': {
      const d = draft;
      closeSheet();
      const entry = addToCloset({ slot: d.slot, color: d.color, brand: d.brand || null, photo: !!d.photo });
      if (d.photo) photoPut(entry.id, d.photo).then(render);
      if (state.tab !== 'closet') set({ tab: 'closet' });
      break;
    }
    case 'undo': toast.undo?.(); $toast.classList.remove('show'); break;
    default: break;
  }
});

document.addEventListener('change', (e) => {
  if (e.target.id === 'brand-only') set({ brandOnly: e.target.checked });
  if (e.target.id === 'photo-input' && e.target.files?.[0]) {
    readPhoto(e.target.files[0]);
    e.target.value = '';
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
  if (e.target.id === 'ask-input') setTimeout(() => document.getElementById('suggest')?.setAttribute('hidden', ''), 180);
});
document.addEventListener('mousedown', (e) => {
  if (e.target.closest('#suggest')) e.preventDefault();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && $sheet.innerHTML) closeSheet();
});

// 상품 사진을 못 불러오면 옷 그림으로 바꾼다
document.addEventListener('error', (e) => {
  const img = e.target;
  if (!(img instanceof HTMLImageElement) || !img.dataset.slot) return;
  const slot = SLOT_BY_ID[img.dataset.slot];
  const div = document.createElement('div');
  div.className = 'art';
  div.innerHTML = garmentSvg(slot, { color: hex(img.dataset.color || slot.colors[0]) });
  img.replaceWith(div);
}, true);

render();
photoLoadAll();
