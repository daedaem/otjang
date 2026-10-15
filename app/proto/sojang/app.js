// 소장 — "내 옷은 소장품이 된다."
// 옷장은 개인 컬렉션, 사고 싶은 옷은 한 점씩 올라오는 LOT. 판정은 Proto.judge()가 내린다.
(() => {
  const P = Proto;
  const esc = P.esc;
  const root = document.getElementById('app');
  const CAT_ORDER = ['outer', 'top', 'dress', 'bottom', 'shoes', 'acc'];
  const GENDER = { M: '남성', F: '여성' };
  const DECISION = { buy: '소장', hold: '보류', skip: '보냄' };
  const HONEST = '코디는 종류·색으로 맞춘 공식이에요. 핏·사이즈·소재·현재 가격은 판매처에서 확인해 주세요.';

  const ui = { tab: 'home', lot: 0, gender: null, enter: true, view: null, sheet: null, toastTimer: 0, lastFocus: null };

  // ── 도구
  const rm = () => P.reducedMotion();
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  const ymd = (d) => `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
  const dateOf = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? new Date() : d; };
  const tidy = (name) => { const s = String(name || '').replace(/\s*[\[(][^\])]*[\])]\s*$/, '').replace(/\s*-\s*$/, '').trim(); return s || String(name || ''); };
  const ext = () => { const r = P.record; if (!r.sjExample) r.sjExample = []; return r; };
  const isExample = (g) => ext().sjExample.includes(g.id);
  const team = () => P.record.garments;
  const no = (g) => `No. ${pad(team().findIndex((x) => x.id === g.id) + 1, 3)}`;
  const catKind = (p) => { const c = P.cats[P.category(p)]; const k = P.kindName(p); return c === k ? c : `${c} · ${k}`; };
  const garmentOf = (p) => team().find((g) => g.productId === p.id) || null;
  const img = (x, alt = '') => `<img src="${esc(P.photo(x))}" alt="${esc(alt)}" decoding="async" draggable="false">`;
  const svg = (body, size = 20, sw = 1.3) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  const I = {
    close: svg('<path d="M6 6l12 12M18 6L6 18"/>', 22),
    prev: svg('<path d="M14.5 5.5L8 12l6.5 6.5"/>', 22),
    next: svg('<path d="M9.5 5.5L16 12l-6.5 6.5"/>', 22),
    out: svg('<path d="M8 16L16 8M10 8h6v6"/>', 15, 1.4),
  };
  // 작은 모노그램 인장: 판정 결과에 찍힌다
  const seal = (tone, label) => `<span class="seal seal--${tone}" role="img" aria-label="${esc(label)}"><svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="30.5"/><circle cx="32" cy="32" r="26.5"/></svg><span class="seal-m">藏</span><span class="seal-l">${esc(label)}</span></span>`;

  // ═══ 셸
  function mount() {
    root.innerHTML = `<div class="sj"><main id="sj-scr" class="scr"></main></div><nav id="sj-tabs" class="tabs" aria-label="주 메뉴"></nav><div id="sj-view"></div><div id="sj-sheet"></div><div id="sj-toast" class="toast" role="status" aria-live="polite"></div>`;
    renderAll();
  }
  function renderAll() { renderScreen(); renderTabs(); }
  function renderTabs() {
    const nav = document.getElementById('sj-tabs');
    if (!P.record.started) { nav.hidden = true; return; }
    nav.hidden = false;
    nav.innerHTML = `<div class="tabs-in">${[['home', '소장실'], ['col', '컬렉션'], ['rec', '기록']].map(([id, l]) => `<button class="tab${ui.tab === id ? ' is-on' : ''}" data-act="tab" data-tab="${id}" ${ui.tab === id ? 'aria-current="page"' : ''}>${l}</button>`).join('')}</div>`;
  }
  function renderScreen() {
    const scr = document.getElementById('sj-scr');
    if (!P.record.started) { scr.className = 'scr scr--ob'; scr.innerHTML = onboardHTML(); return; }
    scr.className = `scr scr--${ui.tab}${ui.enter && !rm() ? ' is-enter' : ''}`;
    scr.innerHTML = ui.tab === 'home' ? homeHTML() : ui.tab === 'col' ? collectionHTML() : recHTML();
    ui.enter = false;
  }

  // ═══ 첫 실행
  function onboardHTML() {
    const g = ui.gender;
    return `<section class="ob">
      <p class="cap">PRIVATE COLLECTION</p>
      <h1 class="ob-mark">소장</h1>
      <p class="ob-line">내 옷은 소장품이 된다.</p>
      <p class="ob-body">사고 싶은 옷을 한 점씩, 이미 가진 옷 곁에 놓아 보고 들일지 정해요.</p>
      <fieldset class="ob-choice">
        <legend class="cap">컬렉션</legend>
        ${['M', 'F'].map((x) => `<button class="ob-opt${g === x ? ' is-on' : ''}" data-act="gender" data-g="${x}" aria-pressed="${g === x}"><span>${GENDER[x]} 컬렉션</span><i aria-hidden="true"></i></button>`).join('')}
      </fieldset>
      <div class="cta-wrap"><button class="cta" data-act="example" ${g ? '' : 'disabled'}>예시 컬렉션으로 시작</button>
      <p class="fine">예시 소장품 6점으로 시작해요. 기록은 이 브라우저에만 남아요.</p></div>
    </section>`;
  }

  // ═══ 소장실: 한 번에 한 점
  let candCache = null;
  const lots = () => (candCache ||= P.candidates({ limit: 6 }));
  const invalidate = () => { candCache = null; };

  function homeHTML() {
    const list = lots();
    if (!list.length) return `<header class="top"><p class="cap">소장실</p></header><p class="empty">오늘 올라온 작품이 없어요.</p>`;
    ui.lot = Math.min(ui.lot, list.length - 1);
    const p = list[ui.lot];
    const cat = P.category(p);
    return `<header class="top">
        <p class="cap">소장실 · ${esc(ymd(new Date()))}</p>
        <div class="lot-nav">
          <button class="nav-btn" data-act="lot" data-d="-1" aria-label="이전 작품" ${ui.lot ? '' : 'disabled'}>${I.prev}</button>
          <p class="lot-count serif"><span>${pad(ui.lot + 1)}</span> / ${pad(list.length)}</p>
          <button class="nav-btn" data-act="lot" data-d="1" aria-label="다음 작품" ${ui.lot < list.length - 1 ? '' : 'disabled'}>${I.next}</button>
        </div>
      </header>
      <article class="lot" data-swipe aria-labelledby="lot-t">
        <div class="stage">${img(p, p.name)}</div>
        <div class="lot-meta">
          <p class="lot-no serif">LOT ${pad(ui.lot + 1)}</p>
          <p class="brand">${esc(p.brand || '')}</p>
          <h1 class="lot-name serif" id="lot-t">${esc(tidy(p.name))}</h1>
          <p class="lot-sub"><span>${esc(catKind(p))}</span><span class="price serif">${esc(P.price(p.price))}</span></p>
        </div>
      </article>
      <div class="cta-wrap cta-wrap--home"><button class="cta" data-act="view" data-id="${esc(p.id)}">살펴보기</button></div>`;
  }

  // ═══ 살펴보기 (시그니처)
  function openView(p, lotNo, opener) {
    let j;
    try { j = P.judge(p); } catch (e) { toast(e?.message || '이 작품은 살펴볼 수 없어요.'); return; }
    ui.view = { p, j, lotNo };
    ui.lastFocus = opener || document.activeElement;
    const host = document.getElementById('sj-view');
    host.innerHTML = viewHTML(p, j, lotNo);
    document.documentElement.classList.add('is-locked');
    requestAnimationFrame(() => host.querySelector('.v-close')?.focus({ preventScroll: true }));
  }

  function viewHTML(p, j, lotNo) {
    const cat = P.category(p);
    const step = rm() ? 0 : 140;
    let t = rm() ? 0 : 900; // 소장품이 하나씩 놓이는 시각
    const at = () => { const v = t; t += step; return v; };
    const piece = (g) => `<li class="pc" style="--d:${at()}ms"><span class="pc-ph">${img(g)}</span><span class="pc-no serif">${no(g)}</span><span class="pc-k">${esc(P.shortKind(g))}${isExample(g) ? ' · 예시' : ''}</span></li>`;
    const used = j.used.filter((g) => !j.overlaps.some((o) => o.id === g.id));
    const ovHTML = j.overlaps.length ? `<section class="v-sec"><h3 class="cap rule">이미 소장 중인 비슷한 작품 <span>${j.overlaps.length}</span></h3><ul class="pcs">${j.overlaps.map(piece).join('')}</ul></section>` : '';
    const usedHTML = used.length ? `<section class="v-sec"><h3 class="cap rule">함께 놓일 소장품 <span>${used.length}</span></h3><ul class="pcs">${used.map(piece).join('')}</ul></section>` : '';
    const looksHTML = j.looks.length ? `<section class="v-sec" style="--d:${at()}ms"><h3 class="cap rule">코디</h3><ol class="looks">${j.looks.map((l, i) => `<li class="rise" style="--d:${at()}ms"><span class="serif">${pad(i + 1)}</span><b>${esc(l.title)}</b><small>${l.items.filter((x) => x.garment).length}점과 함께${l.isNew ? ' · 새 코디' : ''}</small></li>`).join('')}</ol></section>` : '';
    const sealAt = rm() ? 0 : Math.min(t + 200, 2400);
    const v = j.empty ? { tone: 'none', label: '살펴봄', line: '아직 컬렉션이 비어 있어요', sub: '소장품이 있어야 곁에 놓아 볼 수 있어요.' }
      : j.verdict === 'yes' ? { tone: 'yes', label: '소장 추천', line: `컬렉션에 어울려요 · 코디 ${j.looks.length}`, sub: `소장품 ${used.length}점과 함께 입을 수 있어요.` }
      : j.verdict === 'overlap' ? { tone: 'dup', label: '비슷함', line: '이미 비슷한 작품이 있어요', sub: j.overlaps.some((g) => g.productId === p.id) ? '같은 작품을 이미 소장하고 있어요.' : '종류와 색이 같은 소장품이 있어요.' }
      : { tone: 'hold', label: '보류', line: '함께 놓일 작품을 아직 찾지 못했어요', sub: '소장품이 늘면 달라질 수 있어요.' };
    const checks = [HONEST, ...j.checks.filter((c) => c !== HONEST)];
    const owned = P.owns(p);
    const d = P.decisionOf(p);
    return `<div class="view" role="dialog" aria-modal="true" aria-labelledby="v-t" style="--seal:${sealAt}ms">
      <header class="v-top">
        <button class="nav-btn v-close" data-act="close" aria-label="소장실로 돌아가기">${I.close}</button>
        <p class="cap">LOT ${pad(lotNo)}</p>
        <a class="v-shop" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">판매처 ${I.out}</a>
      </header>
      <div class="v-scroll">
        <section class="v-head">
          <div class="v-stage">${img(p, p.name)}${seal(v.tone, v.label)}</div>
          <div class="v-meta">
            <p class="brand">${esc(p.brand || '')}</p>
            <h2 class="v-name serif" id="v-t">${esc(tidy(p.name))}</h2>
            <p class="v-kind">${esc(catKind(p))} · ${esc(P.colorName(p.color))}</p>
            <p class="price serif">${esc(P.price(p.price))}</p>
          </div>
        </section>
        <section class="verdict">
          <p class="v-line serif">${esc(v.line)}</p>
          <p class="v-sub">${esc(v.sub)}</p>
        </section>
        ${ovHTML}${usedHTML}${looksHTML}
        <section class="honest">
          ${checks.map((c) => `<p>${esc(c)}</p>`).join('')}
          ${p.checkedAt ? `<p>가격은 ${esc(p.checkedAt.replaceAll('-', '.'))}에 확인한 값이에요.</p>` : ''}
          <a class="shop-link" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">판매처에서 확인 ${I.out}</a>
        </section>
      </div>
      <footer class="v-bar">
        ${owned ? '<p class="v-prev">이미 컬렉션에 있는 작품이에요.</p><div class="v-btns v-btns--one"><button class="cta" data-act="close">닫기</button></div>' : `
        ${d ? `<p class="v-prev">기록: ${DECISION[d]} · 다시 정할 수 있어요</p>` : ''}
        <div class="v-btns">
          <button class="btn-q${d === 'hold' ? ' is-on' : ''}" data-act="decide" data-d="hold">보류</button>
          <button class="btn-q${d === 'skip' ? ' is-on' : ''}" data-act="decide" data-d="skip">보내기</button>
          <button class="cta" data-act="decide" data-d="buy">소장하기</button>
        </div>`}
      </footer>
    </div>`;
  }

  function closeView(after) {
    const host = document.getElementById('sj-view');
    const el = host.querySelector('.view');
    const done = () => { host.innerHTML = ''; ui.view = null; if (!ui.sheet) document.documentElement.classList.remove('is-locked'); after?.(); };
    if (!el || rm()) return done();
    el.classList.add('is-out');
    setTimeout(done, 380);
  }

  function decide(kind) {
    const { p } = ui.view;
    P.decide(p, kind);
    invalidate();
    P.buzz(kind === 'buy' ? 24 : 10);
    if (kind === 'buy') return showAcquired(p);
    closeView(() => { ui.enter = true; renderScreen(); toast(kind === 'hold' ? '보류해 두었어요.' : '이번 작품은 보냈어요.'); document.querySelector('[data-act="view"]')?.focus({ preventScroll: true }); });
  }

  function showAcquired(p) {
    const g = garmentOf(p);
    const view = document.querySelector('.view');
    if (!view) return;
    const w = document.createElement('div');
    w.className = 'acq';
    w.setAttribute('role', 'alertdialog');
    w.setAttribute('aria-labelledby', 'acq-t');
    w.innerHTML = `<div class="acq-in">
      <div class="acq-ph">${img(p)}</div>
      ${seal('yes', '소장')}
      <p class="cap">${g ? esc(no(g)) : ''}</p>
      <h2 class="acq-t serif" id="acq-t">컬렉션에 들어왔어요</h2>
      <p class="acq-d">${esc(tidy(p.name))}</p>
      <div class="acq-btns"><button class="btn-q" data-act="to-col">컬렉션 보기</button><button class="cta" data-act="next">다음 작품</button></div>
    </div>`;
    view.appendChild(w);
    view.querySelector('.v-scroll')?.setAttribute('inert', '');
    view.querySelector('.v-bar')?.setAttribute('inert', '');
    requestAnimationFrame(() => w.querySelector('[data-act="next"]')?.focus({ preventScroll: true }));
  }

  // ═══ 컬렉션
  function collectionHTML() {
    const all = team();
    const groups = CAT_ORDER.map((c) => [c, all.filter((g) => P.category(g) === c)]).filter(([, l]) => l.length);
    const ex = all.filter(isExample).length;
    return `<header class="top"><p class="cap">${GENDER[P.record.gender] || ''} 컬렉션</p><h1 class="title serif">컬렉션 <span>${pad(all.length)}</span></h1></header>
      ${ex ? `<p class="note">예시 소장품 ${ex}점이 포함되어 있어요.</p>` : ''}
      ${groups.length ? groups.map(([c, list]) => `<section class="cat"><h2 class="cap rule">${esc(P.cats[c])} <span>${list.length}</span></h2>
        <ul class="grid">${list.map((g) => `<li><button class="piece" data-act="piece" data-id="${esc(g.id)}" aria-label="${esc(no(g))}, ${esc(tidy(P.label(g)))}">
          <span class="piece-ph">${img(g)}</span>
          <span class="pc-no serif">${no(g)}${isExample(g) ? '<em>예시</em>' : ''}</span>
          <span class="piece-n">${esc(tidy(P.label(g)))}</span>
          <span class="piece-k">${esc(P.shortKind(g))} · ${esc(P.colorName(g.color))}</span>
        </button></li>`).join('')}</ul></section>`).join('') : '<p class="empty">컬렉션이 비어 있어요. 소장실에서 작품을 들여 보세요.</p>'}
      <div class="foot"><button class="text-btn" data-act="reset">처음부터 다시</button></div>`;
  }

  // ═══ 기록 (간단히)
  function recHTML() {
    const ds = [...P.record.decisions].sort((a, b) => String(b.at).localeCompare(String(a.at)));
    const c = (k) => ds.filter((d) => d.decision === k).length;
    const skipped = ds.filter((d) => d.decision === 'skip' && Number.isFinite(d.price));
    return `<header class="top"><p class="cap">기록</p><h1 class="title serif">기록 <span>${pad(ds.length)}</span></h1></header>
      <dl class="counts"><div><dt class="cap">소장</dt><dd class="serif">${c('buy')}</dd></div><div><dt class="cap">보류</dt><dd class="serif">${c('hold')}</dd></div><div><dt class="cap">보냄</dt><dd class="serif">${c('skip')}</dd></div></dl>
      ${skipped.length ? `<p class="sum"><span>보낸 작품 기록한 가격 합계</span><b class="serif">${P.price(skipped.reduce((s, d) => s + d.price, 0))}</b></p>` : ''}
      ${ds.length ? `<ul class="log">${ds.map((d) => { const p = P.product(d.productId); return p ? `<li><span class="log-ph">${img(p)}</span><span class="log-t"><b>${esc(tidy(p.name))}</b><small>${esc(ymd(dateOf(d.at)))} · ${esc(P.price(d.price))}</small></span><span class="log-d">${DECISION[d.decision]}</span></li>` : ''; }).join('')}</ul>` : '<p class="empty">소장실에서 정한 작품이 여기에 남아요.</p>'}`;
  }

  // ═══ 시트
  function openSheet(s, opener) { ui.sheet = s; if (opener) ui.lastFocus = opener; renderSheet(true); }
  function renderSheet(first) {
    const host = document.getElementById('sj-sheet');
    const s = ui.sheet;
    if (!s) { host.innerHTML = ''; return; }
    document.documentElement.classList.add('is-locked');
    let body = '';
    if (s.type === 'piece') {
      const g = team().find((x) => x.id === s.id);
      if (!g) return;
      body = s.confirm
        ? `<h2 class="sh-t serif" id="sh-t">컬렉션에서 내보낼까요?</h2><p class="sh-d">${esc(tidy(P.label(g)))} · ${esc(no(g))}<br>다음 살펴보기부터 곁에 놓이지 않아요.</p>
           <div class="sh-btns"><button class="btn-q" data-act="sheet-close" data-autofocus>취소</button><button class="cta cta--dark" data-act="remove" data-id="${esc(g.id)}">내보내기</button></div>`
        : `<div class="sh-piece"><span class="piece-ph">${img(g)}</span><div><p class="pc-no serif">${no(g)}${isExample(g) ? ' · 예시' : ''}</p><h2 class="sh-t serif" id="sh-t">${esc(tidy(P.label(g)))}</h2><p class="sh-d">${esc(P.kindName(g))} · ${esc(P.colorName(g.color))}<br>${esc(ymd(dateOf(g.createdAt)))} 소장</p></div></div>
           <div class="sh-btns"><button class="btn-q" data-act="sheet-close">닫기</button><button class="btn-q" data-act="ask-remove" data-id="${esc(g.id)}">컬렉션에서 내보내기</button></div>`;
    } else if (s.type === 'reset') {
      body = `<h2 class="sh-t serif" id="sh-t">처음부터 다시 할까요?</h2><p class="sh-d">소장품 ${team().length}점과 기록 ${P.record.decisions.length}건이 이 브라우저에서 지워져요.</p>
        <div class="sh-btns"><button class="btn-q" data-act="sheet-close" data-autofocus>취소</button><button class="cta cta--dark" data-act="reset-ok">처음부터 다시</button></div>`;
    }
    host.innerHTML = `<div class="sh-back${first && !rm() ? ' is-in' : ''}" data-act="sheet-close"></div><div class="sheet${first && !rm() ? ' is-in' : ''}" role="dialog" aria-modal="true" aria-labelledby="sh-t">${body}</div>`;
    (host.querySelector('[data-autofocus]') || host.querySelector('button'))?.focus({ preventScroll: true });
  }
  function closeSheet() {
    ui.sheet = null;
    document.getElementById('sj-sheet').innerHTML = '';
    if (!ui.view) document.documentElement.classList.remove('is-locked');
    const f = ui.lastFocus; ui.lastFocus = null;
    if (f && document.contains(f)) f.focus({ preventScroll: true });
  }

  function toast(msg) {
    const t = document.getElementById('sj-toast');
    t.innerHTML = `<span>${esc(msg)}</span>`;
    t.classList.add('is-on');
    clearTimeout(ui.toastTimer);
    ui.toastTimer = setTimeout(() => t.classList.remove('is-on'), 2400);
  }

  function go(tab) { ui.tab = tab; ui.enter = true; renderAll(); window.scrollTo(0, 0); }
  function moveLot(d) {
    const n = lots().length;
    const next = Math.max(0, Math.min(n - 1, ui.lot + d));
    if (next === ui.lot) return;
    ui.lot = next; ui.enter = true; ui.dir = d;
    renderScreen();
  }

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    const a = el.dataset.act;
    if (a === 'tab') { if (ui.view) closeView(); go(el.dataset.tab); }
    else if (a === 'gender') {
      ui.gender = el.dataset.g;
      document.querySelectorAll('.ob-opt').forEach((o) => { const on = o.dataset.g === ui.gender; o.classList.toggle('is-on', on); o.setAttribute('aria-pressed', String(on)); });
      const cta = document.querySelector('[data-act="example"]'); if (cta) cta.disabled = false;
    }
    else if (a === 'example') {
      P.startExample(ui.gender || 'M');
      ext().sjExample = team().map((g) => g.id);
      P.save(); invalidate(); ui.tab = 'home'; ui.lot = 0; ui.enter = true;
      renderAll(); window.scrollTo(0, 0);
    }
    else if (a === 'lot') moveLot(Number(el.dataset.d));
    else if (a === 'view') { const p = P.product(el.dataset.id); if (p) openView(p, ui.lot + 1, el); }
    else if (a === 'close') closeView(() => { const f = ui.lastFocus; ui.lastFocus = null; if (f && document.contains(f)) f.focus({ preventScroll: true }); });
    else if (a === 'decide') decide(el.dataset.d);
    else if (a === 'next') closeView(() => { ui.enter = true; renderScreen(); toast('컬렉션에 들였어요.'); });
    else if (a === 'to-col') closeView(() => go('col'));
    else if (a === 'piece') openSheet({ type: 'piece', id: el.dataset.id }, el);
    else if (a === 'ask-remove') { ui.sheet = { type: 'piece', id: el.dataset.id, confirm: true }; renderSheet(false); }
    else if (a === 'remove') { P.removeOwned(el.dataset.id); invalidate(); ui.lastFocus = null; closeSheet(); renderScreen(); toast('컬렉션에서 내보냈어요.'); }
    else if (a === 'reset') openSheet({ type: 'reset' }, el);
    else if (a === 'reset-ok') { P.reset(); invalidate(); ui.gender = null; ui.tab = 'home'; ui.lot = 0; ui.lastFocus = null; closeSheet(); renderAll(); window.scrollTo(0, 0); }
    else if (a === 'sheet-close') closeSheet();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (ui.sheet) closeSheet();
    else if (ui.view) closeView();
  });
  // 좌우로 밀어 다음 작품
  let sx = null;
  document.addEventListener('pointerdown', (e) => { sx = e.target.closest('[data-swipe]') ? { x: e.clientX, y: e.clientY } : null; });
  document.addEventListener('pointerup', (e) => {
    if (!sx) return;
    const dx = e.clientX - sx.x; const dy = e.clientY - sx.y;
    sx = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) moveLot(dx < 0 ? 1 : -1);
  });

  mount();
})();
