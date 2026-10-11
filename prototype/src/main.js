import * as Model from './model.js';
import * as Photo from './photo.js';
import * as Art from './art.js';

const $ = (selector) => document.querySelector(selector);
const e = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch],
  );
const uid = (prefix) =>
  `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
const clone = (value) => JSON.parse(JSON.stringify(value));
const money = (value) =>
  Number.isFinite(value) ? `${value.toLocaleString('ko-KR')}원` : '가격 미확인';
const COLOR = {
  navy: '#394656',
  blue: '#a2b7c3',
  white: '#f8f8f2',
  cream: '#e6dfcb',
  ivory: '#e6dfcb',
  beige: '#c5b69a',
  brown: '#8b7052',
  olive: '#899078',
  green: '#72917c',
  gray: '#9b9d9b',
  black: '#3c3c39',
  red: '#b6665a',
  pink: '#d3a4a0',
  yellow: '#d8bd6d',
  orange: '#c8905a',
  purple: '#9886a2',
  unknown: '#d6d8d1',
};
const COLORS = { ...Model.COLOR_LABELS, orange: '오렌지', purple: '퍼플' };
const KINDS = {
  unknown: '미확인',
  shirt: '셔츠',
  knit: '니트',
  tshirt: '티셔츠',
  sweatshirt: '스웨트셔츠',
  jacket: '재킷',
  chore: '워크 재킷',
  denim: '데님',
  chino: '치노',
  trouser: '슬랙스',
  cargo: '카고 팬츠',
  loafer: '로퍼',
  sneaker: '스니커즈',
  boots: '부츠',
};
const OCCASIONS = { daily: '일상', work: '출근', weekend: '주말' };
const FITS = { regular: '레귤러 핏', relaxed: '여유 있는 핏', slim: '슬림 핏' };
const nav = [
  { id: 'closet', label: '나의 옷장', icon: 'closet' },
  { id: 'outfits', label: '오늘의 코디', icon: 'layers' },
  { id: 'discover', label: '다음 한 벌', icon: 'spark' },
  { id: 'saved', label: '저장한 기록', icon: 'bookmark' },
];
const paths = {
  closet: 'M4 3h16v18H4z M12 3v18 M9 11v3 M15 11v3',
  layers: 'm12 3 10 5-10 5L2 8l10-5Z M2 12l10 5 10-5 M2 16l10 5 10-5',
  spark: 'm12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z M20 2v4 M18 4h4',
  bookmark: 'M6 3h12v18l-6-4-6 4V3Z',
  plus: 'M12 5v14 M5 12h14',
  arrow: 'M4 12h16 M14 6l6 6-6 6',
  search: 'M21 21l-6-6 M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0',
  check: 'm5 12 4 4L19 6',
  close: 'm6 6 12 12 M6 18 18 6',
  camera: 'M3 7h4l2-3h6l2 3h4v13H3V7Z M16 13a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  upload: 'M12 16V3 m-5 5 5-5 5 5 M4 16v5h16v-5',
  download: 'M12 3v13 m-5-5 5 5 5-5 M4 17v4h16v-4',
  shield: 'm12 2 8 3v6c0 6-8 11-8 11S4 17 4 11V5l8-3Z m-4 10 3 3 5-6',
  more: 'M5 11v2 M12 11v2 M19 11v2',
  edit: 'm15 4 5 5 M3 21l5-1L21 7l-5-5L3 15v6Z',
  hanger: 'M10 5a2 2 0 1 1 4 1l-2 2v2 M12 10 2 17v2h20v-2l-10-7Z',
  info: 'M12 11v6 M12 7v.1 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  leaf: 'M20 3C10 2 3 6 3 13a7 7 0 0 0 7 7c7 0 11-7 10-17Z M4 20 16 8',
  arrowLeft: 'M20 12H4 m6-6-6 6 6 6',
  trash: 'M3 6h18 M9 6V3h6v3 M5 6l1 15h12l1-15 M10 10v7 M14 10v7',
  external: 'M14 3h7v7 M21 3 10 14 M10 3H3v18h18v-7',
  clock: 'M12 6v6l4 2 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
};
const icon = (name) =>
  `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.spark}"/></svg>`;
const options = (obj, selected) =>
  Object.entries(obj)
    .map(
      ([key, value]) =>
        `<option value="${e(key)}" ${key === selected ? 'selected' : ''}>${e(value)}</option>`,
    )
    .join('');
const btn = (action, label, { id = '', style = '', ico = '', extra = '' } = {}) =>
  `<button type="button" class="btn ${style}" data-action="${action}" ${id ? `data-id="${e(id)}"` : ''} ${extra}>${ico ? icon(ico) : ''}${label}</button>`;
const notice = (text, kind = '') =>
  `<div class="notice ${kind}">${icon('info')}<span>${text}</span></div>`;
const picture = (item, cls = '') =>
  `<div class="garment-picture ${cls}">${item?.image ? `<img src="${e(item.image)}" alt="${e(item.name)}" loading="lazy">` : Art.garmentSVG(item || {})}</div>`;
const imageOnly = (item) =>
  item?.image
    ? `<img src="${e(item.image)}" alt="${e(item.name)}" loading="lazy">`
    : Art.garmentSVG(item || {});
const brand = () =>
  `<a class="brand" href="#closet" aria-label="WearNext 나의 옷장"><span class="brand-mark">W</span><span class="brand-name">WearNext</span></a>`;
const errorText = (error) => (error instanceof Error ? error.message : String(error));
let state,
  welcome = true,
  loadError = '',
  saveQueue = Promise.resolve(),
  abortController,
  stateEpoch = 0;
const ui = {
  route: 'closet',
  filter: 'all',
  search: '',
  step: 1,
  processing: false,
  progress: 0,
  errors: [],
  detailTab: 'pairings',
  product: null,
  choice: 'hold',
  outfitOffset: 0,
  recordTab: 'outfits',
  mergeUndo: null,
};
let toastTimer;
function toast(message) {
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($('#toast').hidden = true), 4200);
}
function go(route) {
  if (location.hash !== `#${route}`) location.hash = route;
  else render();
  window.scrollTo({ top: 0, behavior: 'instant' });
}
async function mutate(change, message = '') {
  const epoch = stateEpoch;
  const task = saveQueue.then(async () => {
    if (epoch !== stateEpoch) throw new Error('옷장이 바뀌어 이전 작업을 취소했어요.');
    const next = clone(state);
    change(next);
    await Model.saveState(next);
    if (epoch === stateEpoch) {
      state = next;
      if (message) toast(message);
      render();
    }
  });
  saveQueue = task.catch(() => {});
  try {
    await task;
    return true;
  } catch (error) {
    toast(`저장하지 못했어요. ${errorText(error)}`);
    return false;
  }
}
async function replaceState(next) {
  const epoch = ++stateEpoch;
  abortController?.abort();
  ui.processing = false;
  ui.mergeUndo = null;
  const task = saveQueue.then(async () => {
    if (epoch !== stateEpoch) return;
    await Model.saveState(next);
    state = next;
    welcome = false;
    ui.filter = 'all';
    ui.search = '';
    ui.outfitOffset = 0;
    render();
  });
  saveQueue = task.catch(() => {});
  await task;
}
function openDialog(title, body) {
  const d = $('#dialog');
  d.innerHTML = `<div class="dialog-head"><h2 id="dialog-title">${title}</h2><button class="icon-btn" data-action="close-dialog" aria-label="닫기">${icon('close')}</button></div><div class="dialog-body">${body}</div>`;
  if (!d.open) d.showModal();
}
function closeDialog() {
  $('#dialog').close();
}
function confirmDialog(title, text, action, label = '확인') {
  openDialog(
    title,
    `<p class="muted">${text}</p><div class="dialog-footer">${btn('close-dialog', '취소')}${btn(action, label, { style: 'primary' })}</div>`,
  );
}
function heading(eyebrow, title, subtitle, actions = '') {
  return `<div class="page-heading"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1>${subtitle ? `<p>${subtitle}</p>` : ''}</div>${actions ? `<div class="page-actions">${actions}</div>` : ''}</div>`;
}
function empty(title, text, action = 'photos', label = '옷 사진 추가하기') {
  return `<div class="empty">${icon('hanger')}<h3>${title}</h3><p>${text}</p>${action ? btn(action, label, { style: 'primary', ico: 'plus' }) : ''}</div>`;
}
function navLink(n, mobile = false) {
  return `<a class="${mobile ? '' : 'nav-link '}${ui.route === n.id ? 'active' : ''}" href="#${n.id}" ${ui.route === n.id ? 'aria-current="page"' : ''}>${icon(n.icon)}<span>${n.label}</span>${!mobile && n.id === 'closet' ? `<span class="count">${state.items.length}</span>` : ''}</a>`;
}
function render() {
  ui.route = location.hash.slice(1) || 'closet';
  if (!['closet', 'onboarding', 'outfits', 'discover', 'saved'].includes(ui.route))
    ui.route = 'closet';
  if (welcome) {
    $('#app').innerHTML = renderWelcome();
    return;
  }
  const current = nav.find((n) => n.id === ui.route)?.label || '첫 옷장 만들기';
  $('#app').innerHTML =
    `<aside class="sidebar">${brand()}<div class="brand-caption">YOUR PERSONAL WARDROBE</div><div class="nav-section">MY SPACE</div><nav class="nav" aria-label="주 메뉴">${nav.map((n) => navLink(n)).join('')}</nav><div class="sidebar-bottom"><div class="mini-panel" style="padding:14px;background:#f1f3eb;border:0"><div class="eyebrow" style="font-size:8px">MAKE IT YOURS</div><p style="font-size:11px;margin:8px 0">매일 입는 옷에서<br>나다운 스타일이 시작돼요.</p><button class="text-link small" data-action="photos">옷 사진 추가하기 ${icon('arrow')}</button></div><div class="profile-link"><div class="avatar">W</div><div><b class="small">${state.mode === 'demo' ? '샘플 옷장' : '나의 개인 옷장'}</b><div style="font-size:10px;color:var(--muted)">${e(Model.STYLE_LABELS[state.profile.style] || '나의 스타일')}</div></div><button class="icon-btn" data-action="profile" aria-label="스타일 설정" style="margin-left:auto;width:28px;height:28px;border:0">${icon('more')}</button></div><div class="local-status" style="margin-top:18px"><span class="dot"></span>이 브라우저에 저장됨</div></div></aside><div class="layout"><header class="topbar"><div class="breadcrumb">My space <span style="padding:0 12px;color:#bbc0b4">/</span> <b>${current}</b></div><div class="mobile-brand">${brand()}</div><div class="topbar-right"><span class="top-date">${new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit', year: 'numeric', timeZone: 'Asia/Seoul' }).format(new Date()).toUpperCase()}</span><span class="badge outline">${state.mode === 'demo' ? '샘플 체험' : '개인 옷장'}</span><button class="icon-btn" data-action="profile" aria-label="스타일 설정">${icon('more')}</button></div></header><main class="main" id="main">${ui.route === 'closet' ? renderCloset() : ui.route === 'onboarding' ? renderOnboarding() : ui.route === 'outfits' ? renderOutfits() : ui.route === 'discover' ? renderDiscover() : renderSaved()}<p class="footnote">${icon('shield')}사진과 기록은 이 브라우저에만 보관돼요. · WearNext prototype</p></main></div><nav class="bottom-nav" aria-label="모바일 메뉴">${nav.map((n) => navLink(n, true)).join('')}</nav>`;
}
function renderWelcome() {
  return `<main class="welcome-shell" id="main"><header class="welcome-top">${brand()}<span class="badge outline">PERSONAL PROTOTYPE · 01</span></header><section class="welcome-hero"><div class="welcome-copy"><div class="eyebrow">LESS GUESSING. MORE YOU.</div><h1>내 옷장에서 시작하는,<br><em>나다운 다음 한 벌.</em></h1><p>가지고 있는 옷은 더 잘 입고,<br>새로운 옷은 더 나답게 고르세요.<br>사진 몇 장으로 당신의 옷장을 만들어 볼까요?</p><div class="welcome-buttons">${btn('start-personal', '내 옷 사진으로 시작', { style: 'primary', ico: 'camera' })}${btn('start-demo', '샘플 옷장 둘러보기', { ico: 'arrow' })}</div><p class="small muted">가입 없이 · 사진 외부 전송 없이 · 이 브라우저에 저장</p>${loadError ? `<div class="mt">${notice(e(loadError) + ' 기존 데이터는 덮어쓰지 않았습니다. 백업을 불러오거나 저장 가능한 브라우저로 다시 열어 주세요.', 'error')}${btn('import', '백업 불러오기', { style: 'small' })}</div>` : ''}</div><div class="welcome-visual">${Art.wardrobeSceneSVG()}<div class="floating-label">A LITTLE MORE INTENTIONAL.<b>더 사기 전에, 더 잘 입기.</b><span style="font-size:9px;color:var(--muted)">샘플 옷장 · 일러스트</span></div></div></section><section class="welcome-steps"><div class="welcome-step"><span class="step-number">01</span><div><h3>사진으로 가볍게 시작</h3><p>옷 사진에서 찾은 영역을 확인하고 내 옷장에 담아요.</p></div></div><div class="welcome-step"><span class="step-number">02</span><div><h3>이미 가진 옷의 새로운 조합</h3><p>원하는 스타일과 오늘의 상황에 맞춰 함께 입을 옷을 찾아요.</p></div></div><div class="welcome-step"><span class="step-number">03</span><div><h3>다음 한 벌은 이유 있게</h3><p>보유 옷, 후기, 예산을 함께 놓고 구매할지 판단해요.</p></div></div></section><p class="footnote">샘플 체험의 옷·상품·가격·후기는 흐름을 보여 주기 위한 예시입니다.</p></main>`;
}
function renderCloset() {
  const items = state.items;
  const outfits = Model.getOutfits(state);
  const top = items.find((i) => i.category === 'top') || Model.demoItems[0];
  const bottom = items.find((i) => i.category === 'bottom') || Model.demoItems[3];
  return `${heading('MY WARDROBE', '나의 옷장', '좋아하는 옷을 모아, 더 나다운 매일을 만들어 가요.', btn('photos', '옷 추가하기', { style: 'primary', ico: 'plus' }))}${state.mode === 'demo' ? notice('지금은 샘플 옷장이에요. 내 옷으로 시작하려면 <button class="text-link" style="font-size:inherit;padding:0" data-action="switch-personal">개인 옷장 만들기 →</button>', 'demo') : ''}<section class="dashboard-hero ${state.mode === 'demo' ? 'mt' : ''}"><div class="hero-copy"><div class="eyebrow">YOUR WARDROBE, REIMAGINED</div><h2>${outfits.length ? '옷은 충분해요.<br>새로운 조합을 만나 보세요.' : items.length ? '옷장에 첫걸음을 뗐어요.<br>함께 입을 옷을 더해 보세요.' : '아직 비어 있는 옷장,<br>첫 번째 옷을 담아 볼까요?'}</h2><p>${outfits.length ? '익숙한 옷들 사이에, 아직 입어 보지 않은 조합.' : '한 번에 전부 등록하지 않아도 괜찮아요. 그림은 구성 예시예요.'}</p><button class="text-link" data-action="${items.length ? 'outfits' : 'photos'}">${items.length ? '오늘의 코디 살펴보기' : '사진으로 내 옷장 만들기'} ${icon('arrow')}</button></div><div class="hero-visual"><div class="hero-garment">${imageOnly(top)}</div><div class="hero-garment">${imageOnly(bottom)}</div><span class="hero-note">${items.some((i) => i.category === 'top') && items.some((i) => i.category === 'bottom') ? 'FROM YOUR WARDROBE' : 'ILLUSTRATION PREVIEW'}</span></div></section><section class="insights"><div class="insight"><div class="insight-icon">${icon('closet')}</div><div><div class="value">${items.length}<span style="font:10px var(--font);margin-left:4px">벌</span></div><div class="label">옷장에 담긴 옷</div></div></div><div class="insight"><div class="insight-icon">${icon('layers')}</div><div><div class="value">${outfits.length}<span style="font:10px var(--font);margin-left:4px">가지</span></div><div class="label">지금 제안하는 코디</div></div></div><div class="insight"><div class="insight-icon">${icon('bookmark')}</div><div><div class="value">${state.savedOutfits.length + state.savedProducts.length}<span style="font:10px var(--font);margin-left:4px">개</span></div><div class="label">내가 저장한 발견</div></div></div></section>${state.drafts.length ? `<div class="notice mb">${icon('camera')}<span>확인을 기다리는 사진 초안 ${state.drafts.length}개가 있어요. <button class="text-link" data-action="resume">이어서 정리하기 →</button></span></div>` : ''}<div class="section-heading"><h2>내가 가진 옷 <span class="muted">${items.length}</span></h2><button class="text-link small" data-action="manual">${icon('edit')}직접 기록</button></div><div class="filters"><div class="filter-tabs" role="group" aria-label="옷 분류">${Object.entries(
    { all: '전체', top: '상의', bottom: '하의', outer: '아우터', shoes: '신발' },
  )
    .map(
      ([key, label]) =>
        `<button class="filter ${ui.filter === key ? 'active' : ''}" data-action="filter" data-id="${key}" aria-pressed="${ui.filter === key}">${label}<span>${key === 'all' ? items.length : items.filter((i) => i.category === key).length}</span></button>`,
    )
    .join(
      '',
    )}</div><label class="search">${icon('search')}<input id="closet-search" aria-label="옷 이름이나 브랜드 검색" placeholder="어떤 옷을 찾고 있나요?" value="${e(ui.search)}"></label></div><div id="closet-results">${closetResults()}</div>`;
}
function closetResults() {
  const filtered = state.items.filter(
    (i) =>
      (ui.filter === 'all' || i.category === ui.filter) &&
      `${i.name} ${i.brand || ''}`.toLowerCase().includes(ui.search.toLowerCase()),
  );
  return `<div class="closet-grid">${filtered.map((item) => `<article class="garment-card"><div style="position:relative"><button class="item-open" data-action="edit-item" data-id="${e(item.id)}" aria-label="${e(item.name)} 수정">${picture(item)}</button><button class="picture-action icon-btn" style="position:absolute;right:9px;top:9px;width:29px;height:29px;border:0" data-action="edit-item" data-id="${e(item.id)}" aria-label="${e(item.name)} 상세">${icon('more')}</button>${item.available === false ? '<span class="badge sand" style="position:absolute;bottom:10px;left:10px">오늘 제외</span>' : ''}</div><div class="garment-info"><div class="brand-label">${item.source === 'demo' ? 'SAMPLE WARDROBE' : e(item.brand || 'MY WARDROBE')}</div><h3>${e(item.name)}</h3><div class="item-meta"><span class="swatch" style="background:${COLOR[item.color] || COLOR.unknown}"></span>${e(COLORS[item.color] || '미확인')}<span>·</span>${e(Model.CATEGORY_LABELS[item.category] || '미확인')}${!item.attributesConfirmed ? '<span>· 확인 필요</span>' : ''}</div></div></article>`).join('')}<button class="add-card" data-action="photos"><span class="add-circle">${icon('plus')}</span><strong>새로운 옷을 담아 보세요</strong><span>사진으로 간편하게 추가</span></button></div>${!filtered.length && state.items.length ? '<p class="muted small mt">조건에 맞는 옷이 없어요. 다른 분류나 검색어로 찾아보세요.</p>' : ''}`;
}
function renderOnboarding() {
  return `${heading('BUILD YOUR WARDROBE', '사진으로 내 옷장 만들기', '가장 자주 입는 옷 몇 벌부터 시작해도 좋아요.', btn('closet', '나중에 하기', { style: 'ghost' }))}<div class="steps-bar">${['사진 담기', '옷 확인하기', '스타일 설정'].map((label, i) => `<div class="step ${ui.step === i + 1 ? 'active' : ''}"><span class="num">${i + 1}</span>${label}</div>`).join('')}</div>${ui.step === 1 ? uploadStep() : ui.step === 2 ? reviewStep() : styleStep()}`;
}
function uploadStep() {
  return `<div class="upload-panel"><div class="upload-intro"><span class="eyebrow">START WITH WHAT YOU HAVE</span><h2>사진 몇 장이면, 첫 시작은 충분해요.</h2><p>옷장 사진이나 개별 옷 사진을 골라 주세요.</p></div><div id="dropzone" class="dropzone" role="button" tabindex="0" aria-label="옷 사진 선택" data-action="select-photos"><div class="upload-icon">${ui.processing ? '<div class="spinner"></div>' : icon('upload')}</div><h3>${ui.processing ? '이 기기에서 사진을 살펴보고 있어요' : '사진을 끌어 놓거나 눌러서 선택하세요'}</h3><p>${ui.processing ? '완료된 초안은 취소해도 남아요.' : 'JPG · PNG · WebP · GIF / 한 번에 최대 12장, 한 장당 12MB'}</p>${ui.processing ? `<div class="progress"><div style="width:${ui.progress}%"></div></div>${btn('cancel-analysis', '처리 취소', { style: 'small' })}` : '<span class="btn primary small">사진 선택하기</span>'}</div><input id="photo-files" type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple hidden><div class="upload-options"><div class="mini-panel"><h3>바로 촬영하고 싶다면</h3><p>한 벌씩 밝은 바닥에 펼치면 영역을 찾기 쉬워요.</p>${btn('camera', '카메라로 촬영', { style: 'small', ico: 'camera' })}<input id="camera-file" type="file" accept="image/*" capture="environment" hidden></div><div class="mini-panel"><h3>사진은 나중에 넣을게요</h3><p>이름과 종류만 직접 기록하고 시작할 수도 있어요.</p>${btn('manual', '직접 한 벌 기록', { style: 'small', ico: 'edit' })}</div></div>${notice('사진은 외부로 보내지 않아요. 현재 영역 찾기는 단색 배경에 적합한 시험 기능이며, 옷의 종류·브랜드는 직접 확인해 주세요. 옷이 겹치거나 배경이 복잡하면 영역을 수정할 수 있어요.')}${ui.errors.map((err) => `<div class="mt">${notice(e(err.name) + ': ' + e(err.message), 'error')}</div>`).join('')}${state.drafts.length ? `<div class="mt">${btn('resume', `저장된 초안 ${state.drafts.length}개 이어서 확인`, { style: 'wide' })}</div>` : ''}<div class="tips"><div class="tip"><b>01. 밝은 배경 위에</b>옷과 배경이 구분될수록 좋아요.</div><div class="tip"><b>02. 겹치지 않게</b>옷 여러 벌도 떨어뜨려 놓아 주세요.</div><div class="tip"><b>03. 완벽하지 않아도</b>다음 단계에서 수정할 수 있어요.</div></div></div>`;
}
function reviewStep() {
  const selected = state.drafts.filter((d) => d.selected !== false);
  return `<div class="section-heading"><div><h2>내 옷이 맞는지 가볍게 확인해 주세요.</h2><p class="muted small" style="margin-top:8px">종류와 이름을 확인하고, 중복된 사진은 하나만 남겨 주세요.</p></div>${btn('upload-step', '사진 더 담기', { style: 'small', ico: 'plus' })}</div>${ui.errors.length ? notice(ui.errors.map((x) => e(x.name) + ': ' + e(x.message)).join('<br>'), 'error') : ''}<div class="row wrap mb mt"><span class="badge">${selected.length}개 선택됨</span>${btn('merge-drafts', '선택한 초안을 같은 옷으로 묶기', { style: 'small' })}${btn('delete-drafts', '선택 초안 삭제', { style: 'small danger' })}${ui.mergeUndo ? btn('undo-merge', '묶기 취소', { style: 'small' }) : ''}<span class="muted small">서로 다른 옷은 따로 남겨 주세요.</span></div><div class="draft-grid">${state.drafts.map((d) => `<article class="draft-card ${d.selected === false ? 'excluded' : ''}"><div class="draft-top"><label><input type="checkbox" data-draft-select="${e(d.id)}" ${d.selected !== false ? 'checked' : ''}>옷장에 담기</label>${d.duplicateOf ? '<span class="badge warn">중복 가능</span>' : '<span class="badge outline">초안</span>'}</div>${picture(d)}<div class="draft-fields"><label class="field"><span>옷 이름</span><input data-draft-field="name" data-id="${e(d.id)}" value="${e(d.name)}" maxlength="300"></label><label class="field"><span>종류</span><select data-draft-field="category" data-id="${e(d.id)}">${options(Model.CATEGORY_LABELS, d.category)}</select></label><label class="field"><span>색</span><select data-draft-field="color" data-id="${e(d.id)}">${options(COLORS, d.color)}</select></label></div><p class="draft-note">${e(d.analysisNote || '사진에서 만든 초안이에요. 종류와 색을 확인해 주세요.')}</p><div class="row wrap">${d.sourceImage ? btn('crop-draft', '영역 수정', { id: d.id, style: 'small' }) : ''}${btn('remove-draft', '제외', { id: d.id, style: 'small ghost' })}</div></article>`).join('')}</div>${!state.drafts.length ? empty('확인할 초안이 없어요', '사진을 추가하거나 직접 한 벌을 기록해 보세요.') : ''}<div class="sticky-actions"><div><strong class="small">${selected.length}개의 옷으로 시작</strong><p class="muted" style="font-size:10px">모르는 속성은 나중에 채워도 괜찮아요.</p></div>${btn('confirm-drafts', '선택한 옷 확정하기', { style: 'primary', ico: 'check', extra: selected.length ? '' : 'disabled' })}</div>`;
}
function styleFields() {
  return `<div class="style-grid">${Object.entries(Model.STYLE_LABELS)
    .map(
      ([key, name]) =>
        `<button type="button" class="style-option ${state.profile.style === key ? 'active' : ''}" data-action="set-style" data-id="${key}" aria-pressed="${state.profile.style === key}"><strong>${name}</strong><span>${{ american: '셔츠, 치노, 데님이 만드는 오래 입는 조합', minimal: '절제된 색과 간결한 실루엣', workwear: '편안하고 실용적인 디테일', casual: '가볍고 자유로운 일상의 옷' }[key]}</span></button>`,
    )
    .join(
      '',
    )}</div><form id="profile-form"><div class="form-grid"><label class="field"><span>주로 입을 상황</span><select name="occasion">${options(OCCASIONS, state.profile.occasion)}</select></label><label class="field"><span>선호하는 핏 · 선택 기록</span><select name="fit">${options(FITS, state.profile.fit)}</select></label><label class="field full"><span>한 벌의 상품 가격 예산 · 선택</span><input type="number" name="budget" min="0" max="100000000" placeholder="아직 정하지 않았어요" value="${state.profile.budget ?? ''}"></label></div><p class="muted small mt">상황과 스타일은 언제든 바꿀 수 있어요. 체형·얼굴 사진은 필요하지 않아요. 핏 선호는 기록되며 실제 사이즈 판정에는 사용하지 않습니다.</p><div class="dialog-footer"><button class="btn primary" type="submit">${icon('check')}이 스타일로 시작하기</button></div></form>`;
}
function styleStep() {
  return `<div class="upload-panel"><div class="upload-intro"><span class="eyebrow">A LITTLE MORE YOU</span><h2>어떤 모습으로 입고 싶으세요?</h2><p>하나의 장르에 머무를 필요는 없어요. 지금 원하는 방향을 골라 주세요.</p></div>${styleFields()}</div>`;
}
function contextBar() {
  return `<form id="context-form" class="context-bar"><label class="field"><span>원하는 스타일</span><select name="style">${options(Model.STYLE_LABELS, state.profile.style)}</select></label><label class="field"><span>입을 상황</span><select name="occasion">${options(OCCASIONS, state.profile.occasion)}</select></label><label class="field"><span>한 벌 예산</span><input name="budget" type="number" min="0" max="100000000" placeholder="미정" value="${state.profile.budget ?? ''}"></label><button class="btn soft" type="submit">조건 적용</button></form>`;
}
function outfitArt(outfit) {
  return `<div class="outfit-art"><span class="outfit-tag">THE EVERYDAY EDIT</span>${outfit.items
    .map((id) => state.items.find((i) => i.id === id))
    .filter(Boolean)
    .sort(
      (a, b) =>
        ['top', 'bottom', 'shoes', 'outer'].indexOf(a.category) -
        ['top', 'bottom', 'shoes', 'outer'].indexOf(b.category),
    )
    .map((item) => `<div class="outfit-piece">${imageOnly(item)}</div>`)
    .join('')}</div>`;
}
function outfitCard(outfit, index) {
  const saved = state.savedOutfits.some((x) => x.id === outfit.id);
  return `<article class="outfit-card">${outfitArt(outfit)}<div class="outfit-body"><div class="row between"><span class="eyebrow">LOOK ${String(index + 1).padStart(2, '0')}</span><button class="icon-btn ${saved ? 'active' : ''}" data-action="save-outfit" data-id="${e(outfit.id)}" aria-label="${saved ? '코디 저장 취소' : '코디 저장'}" aria-pressed="${saved}">${icon('bookmark')}</button></div><h3>${['익숙한 옷, 새로운 하루', '단정함에 여유를 더해서', '오래 입을 클래식 조합'][index % 3]}</h3><p class="outfit-names">${outfit.items.map((id) => e(state.items.find((i) => i.id === id)?.name || '')).join(' + ')}</p><ul class="reasons">${outfit.reasons
    .slice(0, 2)
    .map((r) => `<li>${e(r)}</li>`)
    .join(
      '',
    )}</ul>${btn('outfit-detail', '조합 자세히 보기', { id: outfit.id, style: 'wide small', ico: 'arrow' })}</div></article>`;
}
function getVisibleOutfits() {
  const all = Model.getOutfits(state, 20);
  return all.length
    ? Array.from(
        { length: Math.min(3, all.length) },
        (_, i) => all[(ui.outfitOffset + i) % all.length],
      )
    : [];
}
function renderOutfits() {
  const outfits = getVisibleOutfits();
  return `${heading('THE EVERYDAY EDIT', '오늘, 이렇게 입어 볼까요?', '새로 사지 않아도 좋아요. 등록된 옷에서 조합을 찾아봤어요.', btn('more-outfits', '다른 조합 보기', { style: 'ghost', ico: 'layers' }))}${contextBar()}${state.mode === 'demo' ? `<div class="mb">${notice('샘플 옷으로 조합을 체험하고 있어요. 저장과 착용 기록도 직접 남겨 보세요.', 'demo')}</div>` : ''}${outfits.length ? `<div class="outfit-grid">${outfits.map(outfitCard).join('')}</div><p class="small muted mt">등록된 종류·스타일·상황에 따른 규칙 제안이에요. 날씨, 실제 실측과 착용감은 확인하지 않았어요.</p>` : empty('함께 입을 옷을 조금 더 알려 주세요', '확정된 상의와 하의가 각각 한 벌 이상 필요해요. 오늘 제외한 옷은 코디에 넣지 않아요.')}`;
}
function renderDiscover() {
  const products = Model.rankProducts(state);
  const gaps = Model.getGaps(state);
  return `${heading('YOUR NEXT GOOD FIND', '다음 한 벌은, 이유 있게.', '지금 가진 옷과 함께 생각하면 선택이 조금 더 쉬워져요.', btn('add-product', '후보 직접 추가', { style: 'primary', ico: 'plus' }))}${contextBar()}${gaps.length ? `<div class="gap-grid">${gaps.map((g, i) => `<div class="gap-card"><span class="eyebrow">BEFORE YOU BUY · ${String(i + 1).padStart(2, '0')}</span><h3>${e(g.title)}</h3><p>${e(g.description)}</p>${g.category === 'existing' ? '<button class="text-link small" data-action="outfits">가진 옷으로 코디 보기 →</button>' : ''}</div>`).join('')}</div>` : ''}<div class="section-heading"><h2>함께 비교할 구매 후보 <span class="muted">${products.length}</span></h2></div>${state.mode === 'demo' ? `<div class="mb">${notice('아래 상품·가격·후기는 모두 화면 체험용 예시예요. 실제 판매 상품이나 구매 후기가 아닙니다. 실제 후보는 직접 추가해 비교할 수 있어요.', 'demo')}</div>` : notice('실제 상품 자동 검색은 아직 연결되지 않았어요. 확인한 상품 링크·가격·후기를 추가하면 내 옷과 함께 비교할 수 있어요.')}<div class="product-grid mt">${products.map(productCard).join('')}</div>${!products.length ? empty('비교하고 싶은 첫 후보를 담아 보세요', '상품 링크, 확인한 가격과 후기 메모를 한곳에 모을 수 있어요.', 'add-product', '구매 후보 추가') : ''}`;
}
function productCard(p) {
  return `<article class="product-card"><div style="position:relative">${picture(p)}<span class="badge ${p.source === 'demo' ? 'sand' : 'outline'}" style="position:absolute;top:12px;left:12px">${p.source === 'demo' ? '예시 상품' : '직접 기록'}</span></div><div class="product-body"><span class="eyebrow">${p.source === 'demo' ? 'WARDROBE MATCH' : e(p.brand || 'MY NEXT FIND')}</span><h3>${e(p.name)}</h3><div class="price">${money(p.price)}${p.source === 'demo' ? '<small>예시 가격</small>' : ''}</div><span class="badge ${p.budgetState === 'over' ? 'warn' : 'outline'}">${p.budgetState === 'within' ? '입력한 예산 안' : p.budgetState === 'over' ? '입력한 예산 초과' : '가격·예산 확인 필요'}</span><p class="product-reason">${p.overlap.length ? `비슷한 보유 옷 ${p.overlap.length}벌과 역할을 비교해 보세요.` : `함께 검토할 보유 옷 ${p.pairings.length}벌을 연결했어요.`}</p><div class="row">${btn('product-detail', '내 옷과 비교', { id: p.id, style: 'grow', ico: 'arrow' })}<button class="icon-btn ${state.savedProducts.includes(p.id) ? 'active' : ''}" data-action="save-product" data-id="${e(p.id)}" aria-label="${state.savedProducts.includes(p.id) ? '상품 저장 취소' : '상품 저장'}">${icon('bookmark')}</button></div></div></article>`;
}
function renderSaved() {
  const savedItems =
    ui.recordTab === 'outfits'
      ? state.savedOutfits
      : state.products.filter((p) => state.savedProducts.includes(p.id));
  return `${heading('COLLECT YOUR GOOD DAYS', '좋아하는 선택을 모아 두세요.', '다시 입고 싶은 코디부터, 조금 더 고민할 다음 한 벌까지.')}<div class="record-grid"><div><section class="panel mb"><div class="section-heading" style="margin-top:0"><h2>나의 컬렉션</h2><div class="filter-tabs"><button class="filter ${ui.recordTab === 'outfits' ? 'active' : ''}" data-action="record-tab" data-id="outfits">코디 ${state.savedOutfits.length}</button><button class="filter ${ui.recordTab === 'products' ? 'active' : ''}" data-action="record-tab" data-id="products">상품 ${state.savedProducts.length}</button></div></div>${
    savedItems.length
      ? savedItems
          .map((x) => {
            const item =
              ui.recordTab === 'outfits' ? state.items.find((i) => i.id === x.items?.[0]) : x;
            return `<div class="record-row"><div class="record-thumb">${imageOnly(item)}</div><div class="grow"><h3>${e(x.title || x.name)}</h3><p>${ui.recordTab === 'outfits' ? '다시 꺼내 입고 싶은 조합' : money(x.price) + (x.source === 'demo' ? ' · 예시 가격' : '')}</p></div>${btn(ui.recordTab === 'outfits' ? 'outfit-detail' : 'product-detail', '보기', { id: x.id, style: 'small' })}</div>`;
          })
          .join('')
      : '<div class="empty" style="border:0;padding:25px"><p>마음에 드는 코디나 상품의 북마크를 눌러 보세요.</p></div>'
  }</section><section class="panel"><h2>내가 입고, 고민한 기록</h2><p class="muted small">구매 여부보다 어떤 이유로 골랐는지가 중요하니까요.</p>${
    state.decisions.length
      ? [...state.decisions]
          .reverse()
          .map(
            (d) =>
              `<div class="record-row"><div class="insight-icon">${icon(d.type === 'wear' ? 'hanger' : 'bookmark')}</div><div class="grow"><h3>${e({ wear: '이 조합을 입었어요', purchase: '구매하고 싶어요', hold: '조금 더 고민할게요', skip: '이번에는 사지 않을래요' }[d.type] || '나의 기록')}</h3><p>${e(
                d.note ||
                  state.products.find((p) => p.id === d.productId)?.name ||
                  d.itemIds
                    ?.map((id) => state.items.find((i) => i.id === id)?.name)
                    .filter(Boolean)
                    .join(' + ') ||
                  '',
              )}</p><span class="small muted">${e(new Date(d.createdAt).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' }))}</span></div></div>`,
          )
          .join('')
      : '<p class="muted small mt">코디에서 착용을 기록하거나 구매 후보에서 생각을 남겨 보세요.</p>'
  }</section></div><aside><section class="panel"><span class="eyebrow">ONLY ON THIS DEVICE</span><h2 style="margin-top:10px">나의 기록은, 내 곁에.</h2><p class="storage-note">사진과 기록은 이 브라우저에 저장돼요. 브라우저 데이터를 지우면 함께 사라질 수 있으니 개인 백업을 받아 두세요.</p><div class="data-buttons">${btn('export', '사진 포함 개인 백업', { ico: 'download' })}${btn('export-no-images', '사진 없이 백업', { ico: 'download', style: 'ghost' })}${btn('import', '백업 불러오기', { ico: 'upload', style: 'ghost' })}</div><p class="storage-note">백업에는 개인 기록이 포함돼요. 공개 게시보다는 개인 보관용으로 사용하세요.</p></section><section class="panel mt"><h2>나의 스타일</h2><p class="storage-note">${e(Model.STYLE_LABELS[state.profile.style])} · ${e(OCCASIONS[state.profile.occasion])}<br>예산 ${money(state.profile.budget)}</p>${btn('profile', '스타일 수정', { style: 'wide small' })}<div class="divider"></div>${state.mode === 'demo' ? btn('switch-personal', '내 옷으로 새로 시작', { style: 'wide small' }) : ''}${btn('reset', '이 브라우저 기록 삭제', { style: 'wide small danger' })}</section></aside></div>`;
}
function editItem(id) {
  const item = state.items.find((i) => i.id === id) || {
    id: '',
    name: '',
    category: 'top',
    kind: 'shirt',
    color: 'unknown',
    brand: '',
    available: true,
    source: 'manual',
    attributesConfirmed: false,
  };
  openDialog(
    id ? '내 옷 기록 수정' : '새로운 옷 직접 기록',
    `<form id="item-form" data-id="${e(id || '')}"><div class="edit-layout">${picture(item)}<div class="form-grid"><label class="field full"><span>옷 이름</span><input name="name" value="${e(item.name)}" maxlength="300" placeholder="예: 자주 입는 블루 셔츠" required></label><label class="field"><span>분류</span><select name="category">${options(Model.CATEGORY_LABELS, item.category)}</select></label><label class="field"><span>종류</span><select name="kind">${options(KINDS, item.kind)}</select></label><label class="field"><span>색</span><select name="color">${options(COLORS, item.color)}</select></label><label class="field"><span>브랜드 · 선택</span><input name="brand" value="${e(item.brand || '')}" maxlength="300" placeholder="몰라도 괜찮아요"></label><label class="field full"><span>메모 · 선택</span><textarea name="note" maxlength="3000" placeholder="잘 맞는 점, 실제 사이즈, 입을 때의 느낌">${e(item.note || '')}</textarea></label><label class="small full"><input type="checkbox" name="available" ${item.available !== false ? 'checked' : ''}> 지금 입을 수 있어요</label><label class="small full"><input type="checkbox" name="attributesConfirmed" ${item.attributesConfirmed ? 'checked' : ''}> 분류·종류·색을 직접 확인했어요</label></div></div>${item.source === 'photo' ? '<p class="small muted mt">원본 사진은 기기 안에서 크기를 줄인 후 저장했어요. 자동 추정값은 직접 고칠 수 있어요.</p>' : ''}<div class="dialog-footer">${id ? btn('delete-item', '이 옷 삭제', { id, style: 'danger' }) : ''}${btn('close-dialog', '취소')}<button class="btn primary" type="submit">저장하기</button></div></form>`,
  );
}
function productForm() {
  openDialog(
    '비교할 구매 후보 추가',
    `<form id="product-form"><div class="form-grid"><label class="field full"><span>상품명</span><input name="name" required maxlength="300" placeholder="확인한 상품 이름"></label><label class="field"><span>분류</span><select name="category">${options(Model.CATEGORY_LABELS, 'top')}</select></label><label class="field"><span>종류</span><select name="kind">${options(KINDS, 'shirt')}</select></label><label class="field"><span>색</span><select name="color">${options(COLORS, 'unknown')}</select></label><label class="field"><span>브랜드 · 선택</span><input name="brand" maxlength="300"></label><label class="field"><span>확인한 상품 가격 · 선택</span><input name="price" type="number" min="0" max="100000000" placeholder="미확인"></label><label class="field"><span>확인한 날짜</span><input name="checkedAt" type="date" value="${new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())}"></label><label class="field full"><span>상품 원문 링크 · 선택</span><input name="url" type="url" placeholder="https://" maxlength="2048"></label><label class="field full"><span>읽은 후기 메모 · 선택</span><textarea name="review" maxlength="3000" placeholder="실제로 읽은 내용과 아직 확인하지 못한 점을 남겨 주세요."></textarea></label><label class="field full"><span>후기 원문 링크 · 선택</span><input name="reviewUrl" type="url" placeholder="https://" maxlength="2048"></label></div><p class="muted small mt">링크만으로 상품이나 후기를 자동 수집하지 않아요. 직접 확인한 정보가 비교의 근거로 쓰입니다. 배송비·회원 할인·현재 재고는 판매처에서 확인해 주세요.</p><div class="dialog-footer">${btn('close-dialog', '취소')}<button class="btn primary" type="submit">후보에 담기</button></div></form>`,
  );
}
function outfitDetail(id) {
  const outfit =
    Model.getOutfits(state, 20).find((o) => o.id === id) ||
    state.savedOutfits.find((o) => o.id === id);
  if (!outfit) return toast('현재 옷장에서는 이 조합을 찾지 못했어요.');
  ui.currentOutfit = outfit;
  const saved = state.savedOutfits.some((x) => x.id === id);
  openDialog(
    '이 조합, 나답게 입기',
    `${outfitArt(outfit)}<h3 class="mt" style="font-size:17px">${e(outfit.title)}</h3><ul class="reasons">${outfit.reasons.map((r) => `<li>${e(r)}</li>`).join('')}</ul>${notice(outfit.cautions.map(e).join('<br>'))}<div class="dialog-footer">${btn('save-outfit', saved ? '저장 취소' : '코디 저장', { id, ico: 'bookmark' })}${btn('wear', '오늘 이렇게 입었어요', { id, style: 'primary', ico: 'check' })}</div>`,
  );
}
function productDetail(id, tab = 'pairings') {
  const p = Model.rankProducts(state).find((x) => x.id === id);
  if (!p) return;
  ui.product = id;
  ui.detailTab = tab;
  const saved = state.savedProducts.includes(id);
  openDialog(
    '나에게 필요한 다음 한 벌일까요?',
    `<div class="product-details">${picture(p)}<div><span class="badge ${p.source === 'demo' ? 'sand' : 'outline'}">${p.source === 'demo' ? '예시 상품 · 실제 판매 아님' : '직접 기록한 상품'}</span><h3 style="font-size:22px;line-height:1.5;margin-top:15px">${e(p.name)}</h3><div class="price">${money(p.price)}${p.source === 'demo' ? '<small>예시 가격</small>' : ''}</div><p class="muted small">${p.checkedAt ? '정보 확인일 ' + e(p.checkedAt) : '실제 가격·재고 미확인'} · 배송비 별도 확인</p><div class="row wrap mt"><span class="badge ${p.budgetState === 'over' ? 'warn' : 'outline'}">${p.budgetState === 'over' ? '예산 초과' : p.budgetState === 'within' ? '입력 예산 안' : '예산·가격 미확인'}</span><span class="badge outline">비슷한 보유 옷 ${p.overlap.length}벌</span></div><button class="text-link small mt" data-action="save-product" data-id="${e(id)}">${icon('bookmark')}${saved ? '저장한 후보 · 취소' : '다음에 다시 볼 후보로 저장'}</button></div></div><div class="detail-tabs" role="tablist" aria-label="후보 비교">${[
      ['pairings', '내 옷과 조합'],
      ['reviews', '후기 확인'],
      ['decision', '구매 판단'],
    ]
      .map(
        ([key, label]) =>
          `<button class="detail-tab ${tab === key ? 'active' : ''}" role="tab" aria-selected="${tab === key}" data-action="product-tab" data-id="${key}">${label}</button>`,
      )
      .join('')}</div><div role="tabpanel">${
      tab === 'pairings'
        ? `<h3 style="font-size:15px">가진 옷과의 연결부터 살펴보세요.</h3><ul class="reasons">${p.reasons.map((r) => `<li>${e(r)}</li>`).join('')}</ul><div class="pairing-list">${p.pairings
            .map((itemId) => state.items.find((i) => i.id === itemId))
            .filter(Boolean)
            .map((i) => `<div class="pairing">${picture(i)}<p>${e(i.name)}</p></div>`)
            .join(
              '',
            )}</div>${p.overlap.length ? `<div class="mt">${notice('비슷한 보유 옷: ' + p.overlap.map((itemId) => e(state.items.find((i) => i.id === itemId)?.name)).join(', ') + '<br>같은 종류나 색이라는 이유만으로 같은 제품 또는 불필요한 구매라고 단정하지 않아요.')}</div>` : ''}`
        : tab === 'reviews'
          ? `${p.source === 'demo' ? notice('아래 내용은 비교 흐름을 설명하는 합성 후기예요. 실제 구매자의 평가가 아닙니다.', 'demo') : notice('직접 기록한 후기 메모예요. 원문과 상품 모델·옵션이 일치하는지 확인해 주세요.')}${p.reviews?.length ? p.reviews.map((r) => `<div class="review"><span class="badge outline">${e(r.topic || '확인한 내용')}</span><p>${e(r.text)}</p><div class="meta">${e(r.sourceLabel || '직접 기록')}${r.url ? ` · <a href="${e(r.url)}" target="_blank" rel="noopener noreferrer">원문 보기 ↗</a>` : ''}</div></div>`).join('') : '<p class="muted small mt">아직 연결된 후기 근거가 없어요. 후기와 실측을 확인하기 전에는 핏이나 착용감을 단정할 수 없어요.</p>'}`
          : `<h3 style="font-size:15px">지금은 어떤 생각이 드세요?</h3><p class="muted small" style="margin-top:8px">사지 않는 것도 좋은 선택이에요. 실제 구매와는 별도로 기록해요.</p><form id="decision-form" data-id="${e(id)}"><div class="decision-choices">${[
              ['purchase', '구매하고 싶어요'],
              ['hold', '조금 더 고민'],
              ['skip', '이번에는 안 살래요'],
            ]
              .map(
                ([value, label]) =>
                  `<label class="decision-choice"><input type="radio" name="decision" value="${value}" ${value === 'hold' ? 'checked' : ''}> ${label}</label>`,
              )
              .join(
                '',
              )}</div><label class="field"><span>이렇게 생각한 이유 · 선택</span><textarea name="note" maxlength="3000" placeholder="가지고 있는 옷과 겹치나요? 활용할 상황이 떠오르나요?"></textarea></label><div class="dialog-footer"><button class="btn primary" type="submit">내 생각 저장하기</button></div></form><div class="divider"></div>${p.source === 'demo' ? `<p class="small muted">이 상품은 예시라 구매할 수 없어요. 실제로 관심 있는 상품은 링크와 함께 후보로 추가해 주세요.</p>` : p.url ? `<a class="btn wide" href="${e(p.url)}" target="_blank" rel="noopener noreferrer">${icon('external')}판매처에서 최신 정보 확인</a><p class="small muted mt">외부 판매처로 이동해요. 현재 가격·옵션·재고를 확인한 뒤 결정하세요.</p>${btn('mark-owned', '실제로 구매했어요 · 옷장에 추가', { id, style: 'wide small mt' })}` : `${notice('등록된 판매처 링크가 없어요. 자동으로 구매처를 만들어 연결하지 않습니다.')}${btn('mark-owned', '실제로 구매했어요 · 옷장에 추가', { id, style: 'wide small mt' })}`}`
    }</div>`,
  );
}
function cropDraft(id) {
  const d = state.drafts.find((x) => x.id === id);
  if (!d?.sourceImage) return;
  ui.cropId = id;
  const r = d.region || { x: 0, y: 0, width: 1, height: 1 };
  openDialog(
    '사진에서 옷 영역 고르기',
    `<div class="crop-preview"><div class="crop-frame"><img src="${e(d.sourceImage)}" alt="영역을 선택할 사진"><div id="crop-box" class="crop-box"></div></div></div><form id="crop-form" class="crop-form"><div class="form-grid">${[
      ['x', '왼쪽 위치'],
      ['y', '위쪽 위치'],
      ['width', '너비'],
      ['height', '높이'],
    ]
      .map(
        ([key, label]) =>
          `<label class="field"><span>${label}</span><input type="range" name="${key}" min="${key === 'width' || key === 'height' ? 1 : 0}" max="100" value="${Math.round(r[key] * 100)}"></label>`,
      )
      .join(
        '',
      )}</div><p class="muted small mt">사각형이 옷을 감싸도록 조절하세요. 사진을 다시 찍지 않아도 돼요.</p><div class="dialog-footer">${btn('close-dialog', '취소')}<button class="btn primary" type="submit">이 영역으로 수정</button></div></form>`,
  );
  updateCropBox();
}
function cropRegion() {
  const f = $('#crop-form');
  return Object.fromEntries(
    ['x', 'y', 'width', 'height'].map((k) => [k, Number(f.elements[k].value) / 100]),
  );
}
function updateCropBox() {
  try {
    const r = Photo.normalizeRegion(cropRegion());
    Object.assign($('#crop-box').style, {
      left: r.x * 100 + '%',
      top: r.y * 100 + '%',
      width: r.width * 100 + '%',
      height: r.height * 100 + '%',
    });
  } catch {}
}
async function analyze(files) {
  if (ui.processing || !files?.length) return;
  const epoch = stateEpoch;
  ui.step = 1;
  ui.processing = true;
  ui.progress = 0;
  ui.errors = [];
  ui.mergeUndo = null;
  abortController = new AbortController();
  render();
  try {
    const result = await Photo.analyzePhotos(files, {
      signal: abortController.signal,
      onProgress: ({ completed, total }) => {
        if (epoch !== stateEpoch) return;
        ui.progress = Math.round((completed / total) * 100);
        if (ui.route === 'onboarding' && ui.step === 1) render();
      },
    });
    if (epoch !== stateEpoch) return;
    ui.errors = result.errors;
    const drafts = result.drafts.map((d) => ({
      ...d,
      selected: !d.duplicateOf,
      available: true,
      attributesConfirmed: false,
    }));
    if (drafts.length) {
      const saved = await mutate((s) => {
        s.drafts.push(...drafts);
      });
      if (epoch !== stateEpoch) return;
      if (saved) ui.step = 2;
      else
        ui.errors.push({
          name: '로컬 저장',
          message:
            '처리한 초안을 저장하지 못했어요. 기존 옷장은 유지됩니다. 저장 공간을 확인한 뒤 다시 시도해 주세요.',
        });
    }
  } catch (error) {
    if (epoch === stateEpoch) ui.errors.push({ name: '사진 처리', message: errorText(error) });
  } finally {
    if (epoch === stateEpoch) {
      ui.processing = false;
      render();
    }
  }
}
function readFile(accept, onFile) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = accept;
  input.addEventListener(
    'change',
    () => {
      if (input.files?.[0]) onFile(input.files[0]);
    },
    { once: true },
  );
  input.click();
}
async function importBackup(file) {
  try {
    if (file.size > 32 * 1024 * 1024) throw new Error('백업 파일은 32MB 이하로 선택해 주세요.');
    const next = Model.parseBackup(await file.text());
    ui.importState = next;
    openDialog(
      '백업을 불러올까요?',
      `<p>옷 <b>${next.items.length}벌</b> · 사진 초안 <b>${next.drafts.length}개</b> · 구매 후보 <b>${next.products.length}개</b> · 기록 <b>${next.decisions.length}개</b></p><p class="muted small mt">현재 브라우저의 옷장과 기록을 이 백업으로 교체해요. 필요한 기록은 먼저 백업해 주세요.</p><div class="dialog-footer">${btn('close-dialog', '취소')}${btn('confirm-import', '이 백업으로 교체', { style: 'primary' })}</div>`,
    );
  } catch (error) {
    toast(errorText(error));
  }
}
function downloadBackup(includeImages) {
  try {
    const content = Model.serializeBackup(state, { includeImages });
    const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `wearnext-${includeImages ? 'private' : 'without-photos'}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    toast(includeImages ? '사진이 포함된 개인 백업을 받았어요.' : '사진을 제외한 백업을 받았어요.');
  } catch (error) {
    toast(errorText(error));
  }
}
function profileDialog() {
  openDialog('나의 스타일과 상황', styleFields());
}
async function handleAction(action, id) {
  if (action === 'close-dialog') {
    closeDialog();
    return;
  }
  if (action === 'start-demo') {
    await replaceState(Model.createState('demo'));
    go('closet');
    return;
  }
  if (action === 'start-personal') {
    await replaceState(Model.createState('personal'));
    ui.step = 1;
    go('onboarding');
    return;
  }
  if (action === 'switch-personal') {
    confirmDialog(
      '내 옷으로 시작할까요?',
      '현재 샘플 체험의 수정·저장 기록은 지워지고 빈 개인 옷장으로 시작해요. 필요한 체험 기록은 먼저 백업해 주세요.',
      'confirm-personal',
      '개인 옷장 만들기',
    );
    return;
  }
  if (action === 'confirm-personal') {
    closeDialog();
    await replaceState(Model.createState('personal'));
    ui.step = 1;
    go('onboarding');
    return;
  }
  if (['closet', 'outfits', 'discover', 'saved'].includes(action)) {
    go(action);
    return;
  }
  if (action === 'photos' || action === 'resume' || action === 'upload-step') {
    ui.step = action === 'resume' ? 2 : 1;
    go('onboarding');
    return;
  }
  if (action === 'select-photos') {
    if (!ui.processing) $('#photo-files')?.click();
    return;
  }
  if (action === 'camera') {
    $('#camera-file')?.click();
    return;
  }
  if (action === 'cancel-analysis') {
    abortController?.abort();
    return;
  }
  if (action === 'filter') {
    ui.filter = id;
    render();
    return;
  }
  if (action === 'manual') {
    editItem();
    return;
  }
  if (action === 'edit-item') {
    editItem(id);
    return;
  }
  if (action === 'delete-item') {
    ui.deleteId = id;
    confirmDialog(
      '이 옷을 삭제할까요?',
      '이 옷의 기록·사진과 저장한 코디를 삭제해요. 다른 초안에서 함께 사용하는 사진은 남을 수 있어요. 사용 기록에는 남은 옷만 표시됩니다.',
      'confirm-delete-item',
      '삭제하기',
    );
    return;
  }
  if (action === 'confirm-delete-item') {
    const remove = ui.deleteId;
    const ok = await mutate((s) => {
      s.items = s.items.filter((i) => i.id !== remove);
      s.savedOutfits = s.savedOutfits.filter((o) => !o.items.includes(remove));
      for (const d of s.drafts) if (d.duplicateOf === remove) delete d.duplicateOf;
      s.decisions = s.decisions.map((d) => ({
        ...d,
        ...(d.itemIds ? { itemIds: d.itemIds.filter((x) => x !== remove) } : {}),
      }));
    }, '옷장에서 삭제했어요.');
    if (ok) closeDialog();
    return;
  }
  if (action === 'profile') {
    profileDialog();
    return;
  }
  if (action === 'set-style') {
    const form = $('#profile-form');
    const pending = form ? new FormData(form) : null;
    await mutate((s) => {
      s.profile.style = id;
      if (pending) {
        s.profile.occasion = pending.get('occasion');
        s.profile.fit = pending.get('fit');
        s.profile.budget = pending.get('budget') === '' ? null : Number(pending.get('budget'));
      }
    });
    if ($('#dialog').open) profileDialog();
    return;
  }
  if (action === 'crop-draft') {
    cropDraft(id);
    return;
  }
  if (action === 'remove-draft') {
    ui.mergeUndo = null;
    await mutate((s) => {
      const d = s.drafts.find((x) => x.id === id);
      if (d) d.selected = false;
    });
    return;
  }
  if (action === 'delete-drafts') {
    const selected = state.drafts.filter((d) => d.selected !== false);
    if (!selected.length) return toast('삭제할 초안을 선택해 주세요.');
    confirmDialog(
      '선택한 사진 초안을 삭제할까요?',
      `${selected.length}개 초안과 그 초안의 사진을 삭제해요. 이미 확정한 옷과 다른 초안이 사용하는 사진은 유지돼요.`,
      'confirm-delete-drafts',
      '초안 삭제',
    );
    return;
  }
  if (action === 'confirm-delete-drafts') {
    ui.mergeUndo = null;
    const ok = await mutate((s) => {
      const removed = new Set(s.drafts.filter((d) => d.selected !== false).map((d) => d.id));
      s.drafts = s.drafts.filter((d) => !removed.has(d.id));
      for (const d of s.drafts) if (removed.has(d.duplicateOf)) delete d.duplicateOf;
    }, '선택한 초안을 삭제했어요.');
    if (ok) closeDialog();
    return;
  }
  if (action === 'merge-drafts') {
    const selected = state.drafts.filter((d) => d.selected !== false);
    if (selected.length < 2) return toast('같은 옷으로 묶을 초안을 2개 이상 선택해 주세요.');
    confirmDialog(
      '선택한 초안이 같은 옷인가요?',
      `${selected.length}개 초안을 첫 번째 옷 하나로 묶어요. 서로 다른 옷은 묶지 마세요. 다른 수정 전, 현재 화면에서 묶기를 취소할 수 있어요.`,
      'confirm-merge',
      '같은 옷으로 묶기',
    );
    return;
  }
  if (action === 'confirm-merge') {
    const before = clone(state.drafts);
    const ok = await mutate((s) => {
      const selected = s.drafts.filter((d) => d.selected !== false);
      const keep = selected[0];
      const removed = new Set(selected.slice(1).map((d) => d.id));
      keep.mergedImages = [
        ...(keep.mergedImages || []),
        ...selected.slice(1).flatMap((d) => [d.image, ...(d.mergedImages || [])].filter(Boolean)),
      ];
      s.drafts = s.drafts.filter((d) => !removed.has(d.id));
      for (const d of s.drafts) if (removed.has(d.duplicateOf)) d.duplicateOf = keep.id;
    });
    if (ok) {
      ui.mergeUndo = before;
      closeDialog();
      render();
    }
    return;
  }
  if (action === 'undo-merge') {
    const before = ui.mergeUndo;
    if (
      before &&
      (await mutate((s) => {
        s.drafts = before;
      }))
    ) {
      ui.mergeUndo = null;
      render();
    }
    return;
  }
  if (action === 'confirm-drafts') {
    const selected = state.drafts.filter((d) => d.selected !== false);
    if (!selected.length) return;
    const ok = await mutate((s) => {
      const chosen = new Set(selected.map((d) => d.id));
      for (const d of selected) {
        const { selected: selection, duplicateOf, sourceImage, region, ...item } = d;
        if (!s.items.some((i) => i.id === d.id))
          s.items.push({ ...item, confirmed: true, available: true, attributesConfirmed: false });
      }
      s.drafts = s.drafts.filter((d) => !chosen.has(d.id));
      for (const d of s.drafts) if (chosen.has(d.duplicateOf)) delete d.duplicateOf;
    }, `${selected.length}벌을 옷장에 담았어요.`);
    if (ok) {
      ui.mergeUndo = null;
      ui.step = 3;
      render();
    }
    return;
  }
  if (action === 'more-outfits') {
    ui.outfitOffset += 3;
    render();
    return;
  }
  if (action === 'save-outfit') {
    const outfit =
      Model.getOutfits(state, 20).find((x) => x.id === id) ||
      state.savedOutfits.find((x) => x.id === id) ||
      ui.currentOutfit;
    if (!outfit) return;
    const saved = state.savedOutfits.some((x) => x.id === id);
    await mutate(
      (s) => {
        s.savedOutfits = s.savedOutfits.some((x) => x.id === id)
          ? s.savedOutfits.filter((x) => x.id !== id)
          : [...s.savedOutfits, outfit];
      },
      saved ? '코디 저장을 취소했어요.' : '다시 입고 싶은 코디에 저장했어요.',
    );
    if ($('#dialog').open) outfitDetail(id);
    return;
  }
  if (action === 'outfit-detail') {
    outfitDetail(id);
    return;
  }
  if (action === 'wear') {
    const outfit =
      Model.getOutfits(state, 20).find((x) => x.id === id) ||
      state.savedOutfits.find((x) => x.id === id) ||
      ui.currentOutfit;
    if (
      outfit &&
      (await mutate((s) => {
        s.decisions.push({
          id: uid('record'),
          type: 'wear',
          itemIds: outfit.items,
          note: '',
          createdAt: new Date().toISOString(),
        });
      }, '오늘 입은 코디를 기록했어요.'))
    )
      closeDialog();
    return;
  }
  if (action === 'add-product') {
    productForm();
    return;
  }
  if (action === 'product-detail') {
    productDetail(id);
    return;
  }
  if (action === 'product-tab') {
    productDetail(ui.product, id);
    return;
  }
  if (action === 'save-product') {
    const saved = state.savedProducts.includes(id);
    await mutate(
      (s) => {
        s.savedProducts = s.savedProducts.includes(id)
          ? s.savedProducts.filter((x) => x !== id)
          : [...s.savedProducts, id];
      },
      saved ? '후보 저장을 취소했어요.' : '다음 한 벌 후보를 저장했어요.',
    );
    if ($('#dialog').open) productDetail(id, ui.detailTab);
    return;
  }
  if (action === 'mark-owned') {
    const p = state.products.find((x) => x.id === id);
    if (!p || p.source === 'demo') return toast('예시 상품은 실제 구매로 등록할 수 없어요.');
    if (state.items.some((i) => i.productRef === id)) return toast('이미 옷장에 담은 상품이에요.');
    ui.ownedProduct = id;
    confirmDialog(
      '실제로 구매한 옷인가요?',
      '구매 의향과는 별개로, 실제로 가진 옷으로 추가해요. 입력한 상품 속성은 추정 상태로 남겨 확인할 수 있어요.',
      'confirm-owned',
      '보유 옷에 추가',
    );
    return;
  }
  if (action === 'confirm-owned') {
    const p = state.products.find((x) => x.id === ui.ownedProduct);
    if (!p || state.items.some((i) => i.productRef === p.id)) return;
    const ok = await mutate((s) => {
      if (s.items.some((i) => i.productRef === p.id)) return;
      s.items.push({
        id: uid('item'),
        productRef: p.id,
        name: p.name,
        brand: p.brand,
        category: p.category,
        kind: p.kind,
        color: p.color,
        pattern: p.pattern || 'unknown',
        available: true,
        source: 'manual',
        confirmed: true,
        attributesConfirmed: false,
      });
    }, '실제로 구매한 옷을 옷장에 담았어요.');
    if (ok) {
      closeDialog();
      go('closet');
    }
    return;
  }
  if (action === 'record-tab') {
    ui.recordTab = id;
    render();
    return;
  }
  if (action === 'export' || action === 'export-no-images') {
    downloadBackup(action === 'export');
    return;
  }
  if (action === 'import') {
    readFile('.json,application/json', importBackup);
    return;
  }
  if (action === 'confirm-import') {
    if (ui.importState) {
      await replaceState(ui.importState);
      ui.importState = null;
      closeDialog();
      go('closet');
      toast('백업의 옷장과 기록을 불러왔어요.');
    }
    return;
  }
  if (action === 'reset') {
    confirmDialog(
      '이 브라우저의 기록을 모두 지울까요?',
      '옷·사진 초안·저장한 코디·구매 기록이 삭제돼요. 내려받은 백업 파일은 별도로 남아 있어요.',
      'confirm-reset',
      '모두 삭제',
    );
    return;
  }
  if (action === 'confirm-reset') {
    const epoch = ++stateEpoch;
    abortController?.abort();
    ui.processing = false;
    const task = saveQueue.then(async () => {
      if (epoch !== stateEpoch) return;
      await Model.clearState();
      state = Model.createState('personal');
      welcome = true;
      ui.mergeUndo = null;
      ui.importState = null;
      closeDialog();
      render();
      toast('이 브라우저의 옷장 기록을 삭제했어요.');
    });
    saveQueue = task.catch(() => {});
    await task;
    return;
  }
}

document.addEventListener('click', (event) => {
  const target = event.target.closest('[data-action]');
  if (!target || target.disabled) return;
  event.preventDefault();
  event.stopPropagation();
  handleAction(target.dataset.action, target.dataset.id).catch((error) => toast(errorText(error)));
});
document.addEventListener('input', (event) => {
  if (event.target.id === 'closet-search') {
    ui.search = event.target.value;
    $('#closet-results').innerHTML = closetResults();
  }
  if (event.target.closest('#crop-form')) updateCropBox();
});
document.addEventListener('change', async (event) => {
  const target = event.target;
  if (['photo-files', 'camera-file'].includes(target.id)) {
    await analyze([...target.files]);
    return;
  }
  if (target.dataset.draftSelect) {
    ui.mergeUndo = null;
    await mutate((s) => {
      const d = s.drafts.find((x) => x.id === target.dataset.draftSelect);
      if (d) d.selected = target.checked;
    });
  }
  if (target.dataset.draftField) {
    ui.mergeUndo = null;
    const value = target.value;
    await mutate((s) => {
      const d = s.drafts.find((x) => x.id === target.dataset.id);
      if (d) {
        d[target.dataset.draftField] = value || '이름 없는 옷';
        if (target.dataset.draftField === 'category')
          d.kind = {
            top: 'shirt',
            bottom: 'chino',
            outer: 'jacket',
            shoes: 'sneaker',
            unknown: 'unknown',
          }[value];
      }
    });
  }
});
document.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.target;
  const data = new FormData(form);
  const submit = form.querySelector('[type="submit"]');
  if (submit?.disabled) return;
  if (submit) submit.disabled = true;
  try {
    if (form.id === 'item-form') {
      const id = form.dataset.id;
      const ok = await mutate((s) => {
        let item = s.items.find((i) => i.id === id);
        if (!item) {
          item = { id: uid('item'), source: 'manual', confirmed: true, pattern: 'unknown' };
          s.items.push(item);
        }
        Object.assign(item, {
          name: String(data.get('name')).trim(),
          category: data.get('category'),
          kind: data.get('kind'),
          color: data.get('color'),
          brand: String(data.get('brand')).trim(),
          note: data.get('note'),
          available: data.has('available'),
          attributesConfirmed: data.has('attributesConfirmed'),
        });
      }, '옷 기록을 저장했어요.');
      if (ok) {
        closeDialog();
        if (ui.route === 'onboarding' && state.items.length) {
          ui.step = 3;
          render();
        }
      }
    }
    if (form.id === 'profile-form' || form.id === 'context-form') {
      const budget = data.get('budget');
      const ok = await mutate((s) => {
        s.profile = {
          ...s.profile,
          occasion: data.get('occasion'),
          budget: budget === '' ? null : Number(budget),
          ...(data.has('fit') ? { fit: data.get('fit') } : { style: data.get('style') }),
        };
        s.onboarded = true;
      }, '선택한 조건을 적용했어요.');
      if (ok) {
        ui.outfitOffset = 0;
        if (form.id === 'profile-form') {
          closeDialog();
          go('closet');
        }
      }
    }
    if (form.id === 'product-form') {
      const price = data.get('price');
      const review = String(data.get('review') || '').trim();
      const p = {
        id: uid('product'),
        name: String(data.get('name')).trim(),
        category: data.get('category'),
        kind: data.get('kind'),
        color: data.get('color'),
        brand: String(data.get('brand')).trim(),
        price: price === '' ? null : Number(price),
        url: String(data.get('url')).trim() || null,
        source: 'manual',
        pattern: 'unknown',
        checkedAt: data.get('checkedAt') || null,
        reviews: review
          ? [
              {
                text: review,
                topic: '직접 확인한 후기',
                sourceLabel: '사용자가 직접 기록한 원문 메모',
                kind: 'manual',
                url: String(data.get('reviewUrl')).trim() || null,
              },
            ]
          : [],
      };
      if (
        await mutate((s) => {
          s.products.push(p);
        }, '비교할 후보에 담았어요.')
      ) {
        closeDialog();
        go('discover');
      }
    }
    if (form.id === 'decision-form') {
      const ok = await mutate((s) => {
        s.decisions.push({
          id: uid('record'),
          type: data.get('decision'),
          productId: form.dataset.id,
          note: String(data.get('note')),
          createdAt: new Date().toISOString(),
        });
      }, '선택의 이유를 기록했어요.');
      if (ok) {
        closeDialog();
        go('saved');
      }
    }
    if (form.id === 'crop-form') {
      ui.mergeUndo = null;
      const d = state.drafts.find((x) => x.id === ui.cropId);
      const region = Photo.normalizeRegion(cropRegion());
      const image = await Photo.cropImage(d.sourceImage, region);
      if (
        await mutate((s) => {
          const draft = s.drafts.find((x) => x.id === d.id);
          draft.image = image;
          draft.region = region;
          draft.analysisNote = '직접 영역을 수정했어요. 종류와 색을 확인해 주세요.';
        }, '사진 영역을 수정했어요.')
      )
        closeDialog();
    }
  } catch (error) {
    toast(errorText(error));
  } finally {
    if (submit) submit.disabled = false;
  }
});
document.addEventListener('keydown', (event) => {
  if ((event.key === 'Enter' || event.key === ' ') && event.target.id === 'dropzone') {
    event.preventDefault();
    $('#photo-files')?.click();
  }
});
document.addEventListener('dragover', (event) => {
  const drop = event.target.closest('#dropzone');
  if (drop) {
    event.preventDefault();
    drop.classList.add('dragover');
  }
});
document.addEventListener('dragleave', (event) => {
  event.target.closest('#dropzone')?.classList.remove('dragover');
});
document.addEventListener('drop', (event) => {
  if (event.target.closest('#dropzone')) {
    event.preventDefault();
    analyze([...event.dataTransfer.files]);
  }
});
$('#dialog').addEventListener('click', (event) => {
  if (event.target === $('#dialog')) {
    const rect = $('#dialog').getBoundingClientRect();
    if (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    )
      closeDialog();
  }
});
window.addEventListener('hashchange', render);
try {
  state = await Model.loadState();
  welcome = !state;
  state ||= Model.createState('personal');
} catch (error) {
  loadError = errorText(error);
  state = Model.createState('personal');
  welcome = true;
}
ui.step = state.drafts.length ? 2 : 1;
render();
// Read-only snapshots for reproducible browser tests; never exposes live mutable state.
window.__wearnext = { snapshot: () => clone(state), ready: true };
