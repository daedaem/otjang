import { SLOTS, SLOT_BY_ID, STYLES, OCCASIONS, CATS } from './data/slots.js';
import { LOOKS } from './data/looks.js';
import { PRODUCTS, CATALOG } from './data/products.js';
import { recommendItems, recommendLooks, search, productsFor, scoreSlot, seasonOf, SEASON_LABEL, formatPrice, josa } from './engine.js';
import { garmentSvg, ICON } from './icons.js';

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

const defaults = { onboarded: false, gender: null, style: null, occasion: null, budget: null, owned: [], saved: [], hidden: [], tab: 'home' };
const DEMO_OWNED = {
  M: ['m-oxford-white', 'm-oxford-blue', 'm-tee-white', 'm-denim', 'm-chino', 'm-sneaker-leather'],
  F: ['f-shirt-white', 'f-tee', 'f-knit', 'f-denim', 'f-slacks', 'f-sneaker'],
};
function demoState(gender = 'M') {
  return { ...defaults, onboarded: true, gender, style: 'classic', demo: true, owned: [...DEMO_OWNED[gender]], saved: [], hidden: [] };
}
let state = load();
let query = '';
let lastLooks = [];
let lastSearch = null;
let closetPickerOpen = false;

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...defaults, demo: false, ...JSON.parse(raw), tab: 'home' } : demoState();
  } catch {
    return demoState();
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

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const $app = document.getElementById('app');
const $sheet = document.getElementById('sheet-root');
const $toast = document.getElementById('toast');
const ownedLabel = () => state.demo ? '예시 옷' : '내 옷';
const reasonText = (text) => state.demo ? text.replace(/^가진 /, '예시 옷장 속 ') : text;

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
    </button>
    ${heartBtn(product)}
  </article>`;
}
function lookCard(r, index, { wide = false } = {}) {
  const tiles = r.items.filter((i) => i.role !== 'acc').slice(0, 4);
  const n = tiles.length;
  return `<button class="look" data-action="open-look" data-index="${index}" ${wide ? 'style="width:100%"' : ''}>
    <div class="look-grid n${n}">
      ${tiles.map((i) => `<div class="tile">${i.owned ? `<span class="badge">${ownedLabel()}</span><div class="art">${garmentSvg(i.slot)}</div>` : i.product.img ? `<img src="${esc(i.product.img)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-slot="${i.slot.id}">` : `<div class="art">${garmentSvg(i.slot)}</div>`}</div>`).join('')}
    </div>
    <div class="look-body">
      <div class="look-title">${esc(r.look.title)}</div>
      <div class="look-note">${esc(r.look.note)}</div>
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
  const ownedCount = state.owned.filter((id) => SLOT_BY_ID[id]?.g === state.gender).length;
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
  const outfit = r.outfit ? `<section class="section"><div class="section-head"><div><h2>이렇게 입어 보세요</h2><div class="sub">${esc(r.outfit.look.title)}</div></div></div>${lookCard(r.outfit, 0, { wide: true })}</section>` : '';
  const items = r.items.length
    ? `<section class="section"><div class="section-head"><div><h2>추천 아이템 ${r.items.length}개</h2><div class="sub">${SEASON_LABEL[r.season]} 기준 · 평점과 후기 수를 함께 봤어요</div></div></div><div class="grid">${r.items.map(gridCard).join('')}</div></section>`
    : `<div class="empty"><b>조건에 맞는 상품이 없어요</b>예산을 조금 넓히거나 다른 표현으로 찾아보세요.</div>`;
  return head + notice + outfit + items + footer();
}

function renderCloset() {
  const mine = SLOTS.filter((s) => s.g === state.gender);
  const owned = mine.filter((s) => state.owned.includes(s.id));
  const ownButton = (s) => `<button class="own" data-action="toggle-own" data-slot="${s.id}" aria-pressed="${state.owned.includes(s.id)}"><i class="tick">${ICON.check}</i><div class="art">${garmentSvg(s)}</div><span>${esc(s.name)}</span></button>`;
  const groups = Object.entries(CATS)
    .map(([cat, label]) => [label, mine.filter((s) => s.cat === cat && !state.owned.includes(s.id))])
    .filter(([, list]) => list.length);
  return `<section class="section">
    <h2>${state.demo ? '예시 옷장' : '내 옷장'} · ${owned.length}벌</h2>
    <div class="sub">${state.demo ? '체험용 옷이에요. 눌러서 빼면 추천이 달라져요.' : '비슷한 옷을 눌러 추가해 주세요. 한 벌만 있어도 시작할 수 있어요.'}</div>
    ${owned.length ? `<div class="closet-grid owned-grid">${owned.map(ownButton).join('')}</div>` : ''}
    <details class="closet-add" ${closetPickerOpen || !owned.length ? 'open' : ''}><summary>옷 추가하기</summary>
    ${groups.map(([label, list]) => `<div class="closet-group"><h3>${label}</h3><div class="closet-grid">
      ${list.map(ownButton).join('')}
    </div></div>`).join('')}
    </details>
    <div style="margin-top:24px"><button class="btn" data-action="tab" data-tab="home">이 옷장으로 추천 보기</button></div>
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
    ['closet', '내 옷장', ICON.hanger, state.owned.filter((id) => SLOT_BY_ID[id]?.g === state.gender).length],
    ['saved', '찜', ICON.heart, state.saved.length],
  ];
  return `<nav class="nav" aria-label="주요 메뉴"><div class="nav-inner">${tabs.map(([k, label, icon, n]) => `<button data-action="tab" data-tab="${k}" aria-current="${state.tab === k ? 'page' : 'false'}">${icon}${label}${n ? `<span class="count">${n}</span>` : ''}</button>`).join('')}</div></nav>`;
}

function render() {
  if (!state.onboarded || !state.gender || !state.style) {
    $app.innerHTML = renderOnboarding();
    return;
  }
  const body = state.tab === 'closet' ? renderCloset() : state.tab === 'saved' ? renderSaved() : renderHome();
  $app.innerHTML = (state.tab === 'home' ? topBar() : '') + demoBanner() + `<main>${body}</main>` + nav();
}

// ── 시트
function openSheet(html) {
  $sheet.innerHTML = `<div class="scrim" data-action="close-sheet"></div><div class="sheet" role="dialog" aria-modal="true"><div class="grabber"></div><button class="sheet-close" data-action="close-sheet" aria-label="닫기">${ICON.close}</button>${html}</div>`;
  document.body.style.overflow = 'hidden';
  $sheet.querySelector('.sheet-close')?.focus({ preventScroll: true });
}
function closeSheet() {
  $sheet.innerHTML = '';
  document.body.style.overflow = '';
}

function itemSheet(id) {
  const p = PRODUCT_BY_ID[id];
  if (!p) return;
  const slot = SLOT_BY_ID[p.slot];
  const c = { gender: state.gender, style: state.style, occasion: state.occasion, season: seasonOf(), owned: new Set(state.owned) };
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
    ? `<div class="look-row"><div class="thumb"><div class="art">${garmentSvg(i.slot)}</div></div><div><div class="role">${ROLE_LABEL[i.role]} · ${ownedLabel()}</div><div class="nm">${esc(i.slot.name)}</div></div><span class="badge">${state.demo ? '예시' : '보유'}</span></div>`
    : `<button class="look-row" data-action="open-item" data-id="${i.product.id}">${picture(i.product, i.slot)}<div><div class="role">${ROLE_LABEL[i.role]} · ${esc(i.product.brand)}</div><div class="nm">${esc(i.product.name)}</div></div><span class="pr">${formatPrice(i.product.price)}</span></button>`).join('');
}

function lookSheet(index) {
  const r = lastLooks[index];
  if (!r) return;
  const buyIds = r.items.filter((i) => !i.owned).map((i) => i.product.id);
  openSheet(`
    <h2 class="detail-title" style="padding-right:48px">${esc(r.look.title)}</h2>
    <p class="sub" style="margin:6px 0 10px;color:var(--ink-2)">${esc(r.look.note)}</p>
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
  const navCount = state.saved.length;
  const savedBtn = document.querySelector('.nav [data-tab="saved"]');
  if (savedBtn) savedBtn.innerHTML = `${ICON.heart}찜${navCount ? `<span class="count">${navCount}</span>` : ''}`;
}

function toggleOwn(slotId, { fromItem = false } = {}) {
  const had = state.owned.includes(slotId);
  if (fromItem && had) {
    closeSheet();
    toast('이미 옷장에 있어요');
    return;
  }
  closetPickerOpen = !!document.querySelector('.closet-add')?.open;
  const before = state.owned;
  set({ owned: had ? state.owned.filter((x) => x !== slotId) : [...state.owned, slotId] });
  if (fromItem) {
    closeSheet();
    const name = SLOT_BY_ID[slotId].name;
    toast(`${name}${josa(name, '을', '를')} ${state.demo ? '예시 ' : ''}옷장에 넣었어요`, () => set({ owned: before }));
  }
}

// ── 이벤트
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const a = el.dataset.action;
  if (a === 'ask') return;
  switch (a) {
    case 'start-personal':
      query = '';
      closetPickerOpen = true;
      set({ demo: false, owned: [], tab: 'closet' });
      window.scrollTo(0, 0);
      break;
    case 'pick-gender':
      set({ gender: el.dataset.g, style: null });
      requestAnimationFrame(() => document.querySelector('.style-pick')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
      break;
    case 'pick-style':
      set({ style: el.dataset.style, onboarded: true, tab: 'home' });
      window.scrollTo(0, 0);
      break;
    case 'occasion':
      set({ occasion: state.occasion === el.dataset.occ ? null : el.dataset.occ });
      break;
    case 'open-budget': optionSheet('budget'); break;
    case 'open-profile': optionSheet('profile'); break;
    case 'set-budget':
      set({ budget: el.dataset.v ? Number(el.dataset.v) : null });
      closeSheet();
      break;
    case 'set-gender': set({ gender: el.dataset.g, ...(state.demo ? { owned: [...DEMO_OWNED[el.dataset.g]] } : {}) }); optionSheet('profile'); break;
    case 'set-style': set({ style: el.dataset.style }); optionSheet('profile'); break;
    case 'reset':
      if (el.dataset.armed !== '1') {
        el.dataset.armed = '1';
        el.textContent = '한 번 더 누르면 모두 지워져요';
        break;
      }
      state = { ...defaults };
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
    case 'own': toggleOwn(el.dataset.slot, { fromItem: true }); break;
    case 'toggle-own': toggleOwn(el.dataset.slot); break;
    case 'undo': toast.undo?.(); $toast.classList.remove('show'); break;
    default: break;
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
  const art = document.createElement('div');
  art.className = 'art';
  art.innerHTML = garmentSvg(slot);
  img.replaceWith(art);
}, true);

render();
