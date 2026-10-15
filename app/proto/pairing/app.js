// PAIRING — 모든 상품을 내 옷장과의 페어링으로 보여 주는 패션 숍. 판정은 Proto.judge()가 내린다.
(() => {
  const P = Proto;
  const esc = P.esc;
  const root = document.getElementById('app');
  const HONEST = '코디는 종류·색으로 맞춘 공식이에요. 핏·사이즈·소재·현재 가격은 판매처에서 확인해 주세요.';
  const CAT_LABEL = { new: 'NEW', outer: 'OUTER', top: 'TOP', dress: 'DRESS', bottom: 'BOTTOM', shoes: 'SHOES', acc: 'ACC' };
  const DECISION = { buy: '살게요', hold: '찜', skip: '안 살게요' };

  const ui = { tab: 'shop', cat: 'new', gender: null, q: '', searching: false, linkError: '', detail: null, sheet: null, toastTimer: 0, lastFocus: null, enter: true };

  // ── 도구
  const rm = () => P.reducedMotion();
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  const ymd = (d) => `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
  const dateOf = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? new Date() : d; };
  const ext = () => { const r = P.record; if (!r.prExample) r.prExample = []; return r; };
  const isExample = (g) => ext().prExample.includes(g.id);
  const team = () => P.record.garments;
  const img = (x, alt = '', lazy = true) => `<img src="${esc(P.photo(x))}" alt="${esc(alt)}" ${lazy ? 'loading="lazy"' : ''} decoding="async" draggable="false">`;
  const svg = (body, size = 22, sw = 1.4) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true">${body}</svg>`;
  const I = {
    search: svg('<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L20.5 20.5"/>'),
    close: svg('<path d="M5.5 5.5l13 13M18.5 5.5l-13 13"/>'),
    back: svg('<path d="M15 4.5L7.5 12l7.5 7.5"/>'),
    out: svg('<path d="M8 16L16 8M10 8h6v6"/>', 14, 1.6),
    heart: svg('<path d="M12 19.5s-7.5-4.6-7.5-10.1A4.1 4.1 0 0 1 12 7.2a4.1 4.1 0 0 1 7.5 2.2c0 5.5-7.5 10.1-7.5 10.1z"/>', 20),
    heartOn: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M12 19.5s-7.5-4.6-7.5-10.1A4.1 4.1 0 0 1 12 7.2a4.1 4.1 0 0 1 7.5 2.2c0 5.5-7.5 10.1-7.5 10.1z"/></svg>',
  };
  const liked = (p) => P.decisionOf(p) === 'hold';

  // ── 판정 캐시 (옷장이 바뀌면 비운다)
  const jc = new Map();
  let jcKey = '';
  function judged(p) {
    const key = team().map((g) => g.id).join(',');
    if (key !== jcKey) { jc.clear(); jcKey = key; listCache.clear(); }
    if (!jc.has(p.id)) { try { jc.set(p.id, P.judge(p)); } catch { jc.set(p.id, null); } }
    return jc.get(p.id);
  }
  function badge(p) {
    const j = judged(p);
    if (!j) return '';
    if (P.owns(p)) return '<span class="badge badge--own">내 옷장에 있음</span>';
    if (j.verdict === 'yes') return `<span class="badge badge--yes">내 옷 ${j.used.length}벌과 매치</span>`;
    if (j.verdict === 'overlap') return '<span class="badge badge--dup">비슷한 옷 있음</span>';
    return '<span class="badge badge--meh">매치 확인 필요</span>';
  }

  // ── 상품 목록
  const listCache = new Map();
  const invalidate = () => listCache.clear();
  function shopList(cat) {
    if (listCache.has(cat)) return listCache.get(cat);
    const skipped = new Set(P.record.decisions.filter((d) => d.decision === 'skip').map((d) => d.productId));
    const ok = (p) => p && !P.owns(p) && !skipped.has(p.id);
    const base = P.candidates({ limit: cat === 'new' ? 12 : 60, includeDecided: true }).filter(ok);
    let out = base;
    if (cat !== 'new') {
      const seen = new Set();
      out = [...base.filter((p) => P.category(p) === cat), ...P.ownables(cat, { limit: 30 }).filter(ok)]
        .filter((p) => !seen.has(p.id) && seen.add(p.id));
    }
    out = out.slice(0, 12);
    listCache.set(cat, out);
    return out;
  }
  const cats = () => ['new', 'outer', 'top', ...(P.record.gender === 'F' ? ['dress'] : []), 'bottom', 'shoes'];

  // ═══ 셸
  function mount() {
    root.innerHTML = `<div class="pr"><main id="pr-scr"></main></div><nav id="pr-tabs" class="tabs" aria-label="주 메뉴"></nav><div id="pr-detail"></div><div id="pr-sheet"></div><div id="pr-toast" class="toast" role="status" aria-live="polite"></div>`;
    renderAll();
  }
  function renderAll() { renderScreen(); renderTabs(); }
  function renderTabs() {
    const nav = document.getElementById('pr-tabs');
    if (!P.record.started) { nav.hidden = true; return; }
    nav.hidden = false;
    const likes = P.record.decisions.filter((d) => d.decision === 'hold').length;
    nav.innerHTML = `<div class="tabs-in">${[['shop', 'SHOP', '쇼핑'], ['closet', 'MY CLOSET', '내 옷장'], ['wish', `WISHLIST${likes ? ` ${likes}` : ''}`, '찜과 기록']].map(([id, l, ko]) => `<button class="tab${ui.tab === id ? ' is-on' : ''}" data-act="tab" data-tab="${id}" aria-label="${ko}" ${ui.tab === id ? 'aria-current="page"' : ''}>${l}</button>`).join('')}</div>`;
  }
  function renderScreen() {
    const scr = document.getElementById('pr-scr');
    if (!P.record.started) { scr.className = 'scr scr--ob'; scr.innerHTML = onboardHTML(); return; }
    scr.className = `scr scr--${ui.tab}${ui.enter && !rm() ? ' is-enter' : ''}`;
    scr.innerHTML = topbarHTML() + (ui.tab === 'shop' ? shopHTML() : ui.tab === 'closet' ? closetHTML() : wishHTML());
    ui.enter = false;
  }

  // ═══ 첫 실행
  function onboardHTML() {
    const g = ui.gender;
    return `<section class="ob">
      <h1 class="ob-mark">PAIRING</h1>
      <p class="ob-sub">모든 상품을 내 옷장과 맞춰 보는 쇼핑</p>
      <div class="ob-g" role="group" aria-label="성별">
        ${[['M', 'MEN'], ['F', 'WOMEN']].map(([x, l]) => `<button class="ob-btn${g === x ? ' is-on' : ''}" data-act="gender" data-g="${x}" aria-pressed="${g === x}">${l}</button>`).join('')}
      </div>
      <button class="cta" data-act="example" ${g ? '' : 'disabled'}>예시 옷장으로 시작</button>
      <p class="fine">예시 옷 6벌로 시작해요. 기록은 이 브라우저에만 남아요.</p>
    </section>`;
  }

  // ═══ 상단
  function topbarHTML() {
    return `<header class="bar">
      <span class="bar-side"></span>
      <button class="mark" data-act="tab" data-tab="shop" aria-label="PAIRING 홈">PAIRING</button>
      <button class="icon" data-act="search" aria-label="검색" aria-expanded="${ui.searching}">${ui.searching ? I.close : I.search}</button>
    </header>
    ${ui.searching ? `<form class="search" data-form="search" role="search">
      <input id="pr-q" type="search" autocomplete="off" placeholder="브랜드·상품명 검색 또는 무신사 링크" value="${esc(ui.q)}" aria-label="검색어 또는 상품 링크">
      ${ui.linkError ? `<p class="err">${esc(ui.linkError)}</p>` : ''}
    </form>` : ''}`;
  }

  // ═══ SHOP
  function shopHTML() {
    if (ui.searching && ui.q.trim() && !looksLikeLink(ui.q)) {
      const found = P.search(ui.q, { limit: 20 });
      return `<div class="sec-h"><p class="lbl">SEARCH</p><p class="cnt">${found.length} ITEMS</p></div>${found.length ? gridHTML(found) : '<p class="empty">검색 결과가 없어요.</p>'}`;
    }
    const list = shopList(ui.cat);
    const hero = ui.cat === 'new' ? (list.find((p) => judged(p)?.verdict === 'yes') || list[0]) : null;
    return `<nav class="cats" aria-label="카테고리">${cats().map((c) => `<button class="cat${ui.cat === c ? ' is-on' : ''}" data-act="cat" data-cat="${c}" ${ui.cat === c ? 'aria-current="true"' : ''}>${CAT_LABEL[c]}</button>`).join('')}</nav>
      ${hero ? heroHTML(hero) : ''}
      <div class="sec-h"><p class="lbl">${ui.cat === 'new' ? 'NEW IN' : CAT_LABEL[ui.cat]}</p><p class="cnt">${list.length} ITEMS</p></div>
      ${list.length ? gridHTML(list) : '<p class="empty">지금 보여 드릴 상품이 없어요.</p>'}`;
  }
  function heroHTML(p) {
    const j = judged(p);
    return `<button class="hero" data-act="open" data-id="${esc(p.id)}">
      <span class="hero-ph">${img(p, p.name, false)}</span>
      <span class="hero-tx">
        <span class="lbl">WEEKLY SELECTION</span>
        <span class="hero-h">내 옷장과 맞는<br>이번 주 셀렉션</span>
        <span class="hero-s">${esc(p.brand || '')} · ${j?.verdict === 'yes' ? `내 옷 ${j.used.length}벌과 코디 ${j.looks.length}` : esc(P.kindName(p))}</span>
        <span class="hero-go">SHOP NOW</span>
      </span>
    </button>`;
  }
  function gridHTML(list) {
    return `<ul class="grid" role="list">${list.map((p, i) => `<li class="card" style="--i:${i}">
      <button class="card-open" data-act="open" data-id="${esc(p.id)}" aria-label="${esc(p.brand || '')} ${esc(p.name)}">
        <span class="card-ph">${img(p)}</span>
        <span class="brand">${esc(p.brand || '')}</span>
        <span class="card-n">${esc(p.name)}</span>
        <span class="card-p">${esc(P.price(p.price))}</span>
        ${badge(p)}
      </button>
      <button class="heart${liked(p) ? ' is-on' : ''}" data-act="like" data-id="${esc(p.id)}" aria-pressed="${liked(p)}" aria-label="찜">${liked(p) ? I.heartOn : I.heart}</button>
    </li>`).join('')}</ul>`;
  }

  // ═══ 상세 (시그니처: PAIRING WITH YOUR CLOSET)
  function openDetail(p, opener) {
    const j = judged(p);
    if (!j) { toast('이 상품은 맞춰 볼 수 없어요.'); return; }
    ui.detail = p;
    ui.lastFocus = opener || document.activeElement;
    const host = document.getElementById('pr-detail');
    host.innerHTML = detailHTML(p, j);
    document.documentElement.classList.add('is-locked');
    requestAnimationFrame(() => host.querySelector('.d-back')?.focus({ preventScroll: true }));
  }
  function detailHTML(p, j) {
    let k = 0;
    const d = () => `style="--d:${rm() ? 0 : 380 + (k++) * 70}ms"`;
    const tile = (x, tag, label, cand = false) => `<li class="tile${cand ? ' tile--this' : ''}" ${d()}><span class="tile-ph">${img(x)}</span><span class="tile-tag">${tag}</span><span class="tile-n">${esc(label)}</span></li>`;
    const looks = j.looks.map((l, i) => `<section class="look">
        <p class="look-h"><span class="lbl">LOOK ${pad(i + 1)}</span><b>${esc(l.title)}</b>${l.isNew ? '<span class="lbl lbl--new">NEW</span>' : ''}</p>
        <ul class="row" role="list">${l.items.map((it) => (it.candidate ? tile(it.product, 'THIS ITEM', P.shortKind(it.product), true) : tile(it.garment, isExample(it.garment) ? 'MY CLOSET · 예시' : 'MY CLOSET', `${P.shortKind(it.garment)} · ${P.colorName(it.garment.color)}`))).join('')}</ul>
      </section>`).join('');
    const overlaps = j.overlaps.length ? `<section class="look look--dup">
        <p class="look-h"><span class="lbl lbl--dup">ALREADY OWNED</span><b>이미 가진 비슷한 옷</b></p>
        <ul class="row" role="list">${j.overlaps.map((g) => tile(g, isExample(g) ? 'MY CLOSET · 예시' : 'MY CLOSET', `${P.shortKind(g)} · ${P.colorName(g.color)}`)).join('')}</ul>
        <p class="look-note">${j.overlaps.some((g) => g.productId === p.id) ? '같은 상품이 이미 옷장에 있어요.' : '종류와 색이 같은 옷이 옷장에 있어요.'}</p>
      </section>` : '';
    const summary = j.empty ? '옷장이 비어 있어 맞춰 볼 옷이 없어요.'
      : j.verdict === 'yes' ? `내 옷 ${j.used.length}벌과 코디 ${j.looks.length}개가 완성돼요.`
      : j.verdict === 'overlap' ? '옷장에 비슷한 옷이 이미 있어요.'
      : '지금 옷장으로는 맞춰 볼 코디가 없어요. 매치는 직접 확인해 주세요.';
    const dec = P.decisionOf(p);
    const owned = P.owns(p);
    const checks = [HONEST, ...j.checks.filter((c) => c !== HONEST)];
    return `<div class="detail" role="dialog" aria-modal="true" aria-labelledby="d-t">
      <header class="bar bar--d">
        <button class="icon d-back" data-act="close" aria-label="뒤로">${I.back}</button>
        <span class="mark mark--sm" aria-hidden="true">PAIRING</span>
        <a class="icon" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer" aria-label="판매처에서 보기">${I.out}</a>
      </header>
      <div class="d-scroll">
        <div class="d-ph">${img(p, p.name, false)}</div>
        <section class="d-info">
          <p class="brand brand--lg">${esc(p.brand || '')}</p>
          <h2 class="d-name" id="d-t">${esc(p.name)}</h2>
          <p class="d-price">${esc(P.price(p.price))}</p>
          <p class="d-meta">${esc(P.kindName(p))} · ${esc(P.colorName(p.color))}</p>
        </section>
        <section class="pairing" aria-labelledby="pw-t">
          <div class="pw-h"><h3 class="lbl lbl--h" id="pw-t">PAIRING WITH YOUR CLOSET</h3>${badge(p)}</div>
          <p class="pw-sum">${esc(summary)}</p>
          ${overlaps}${looks}
          <div class="honest">${checks.map((c) => `<p>${esc(c)}</p>`).join('')}${p.checkedAt ? `<p>가격은 ${esc(p.checkedAt.replaceAll('-', '.'))} 기준이에요.</p>` : ''}
            <a class="ext" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">판매처에서 보기 ${I.out}</a></div>
        </section>
      </div>
      <footer class="d-bar">${owned ? '<p class="d-own">이미 내 옷장에 있는 상품이에요.</p>' : `
        <button class="b-line${dec === 'skip' ? ' is-on' : ''}" data-act="decide" data-d="skip">안 살게요</button>
        <button class="b-line b-heart${dec === 'hold' ? ' is-on' : ''}" data-act="decide" data-d="hold" aria-pressed="${dec === 'hold'}" aria-label="찜">${dec === 'hold' ? I.heartOn : I.heart}<span>찜</span></button>
        <button class="b-black" data-act="decide" data-d="buy">살게요</button>`}
      </footer>
    </div>`;
  }
  function closeDetail(after) {
    const host = document.getElementById('pr-detail');
    const el = host.querySelector('.detail');
    const done = () => {
      host.innerHTML = ''; ui.detail = null;
      if (!ui.sheet) document.documentElement.classList.remove('is-locked');
      after?.();
      const f = ui.lastFocus; ui.lastFocus = null;
      if (f && document.contains(f)) f.focus({ preventScroll: true });
    };
    if (!el || rm()) return done();
    el.classList.add('is-out');
    setTimeout(done, 220);
  }
  function setLike(p, on) {
    if (on) P.decide(p, 'hold');
    else { P.record.decisions = P.record.decisions.filter((d) => d.productId !== p.id); P.save(); }
  }
  function decide(kind) {
    const p = ui.detail;
    if (kind === 'hold') {
      const on = !liked(p);
      setLike(p, on);
      P.buzz(8);
      const host = document.getElementById('pr-detail');
      const keep = host.querySelector('.d-scroll')?.scrollTop || 0;
      host.innerHTML = detailHTML(p, judged(p)).replace('class="detail"', 'class="detail is-static"');
      host.querySelector('.d-scroll').scrollTop = keep;
      host.querySelector('[data-d="hold"]')?.focus({ preventScroll: true });
      renderTabs();
      toast(on ? '찜했어요.' : '찜을 해제했어요.');
      return;
    }
    P.decide(p, kind);
    P.buzz(kind === 'buy' ? 20 : 10);
    invalidate();
    closeDetail(() => { renderAll(); toast(kind === 'buy' ? '살게요로 기록하고 내 옷장에 넣었어요.' : '안 살게요로 기록했어요.'); });
  }

  // ═══ MY CLOSET
  function closetHTML() {
    const all = team();
    const ex = all.filter(isExample).length;
    const order = ['outer', 'top', 'dress', 'bottom', 'shoes', 'acc'];
    const sorted = [...all].sort((a, b) => order.indexOf(P.category(a)) - order.indexOf(P.category(b)));
    return `<div class="sec-h sec-h--top"><p class="lbl lbl--h">MY CLOSET</p><p class="cnt">${all.length} ITEMS</p></div>
      ${ex ? `<p class="note">예시 옷 ${ex}벌이 들어 있어요. 눌러서 뺄 수 있어요.</p>` : ''}
      ${all.length ? `<ul class="grid grid--3" role="list">${sorted.map((g) => `<li class="card"><button class="card-open" data-act="garment" data-id="${esc(g.id)}" aria-label="${esc(P.label(g))}, 옷장에서 빼기">
        <span class="card-ph">${img(g)}</span>
        <span class="brand">${esc(CAT_LABEL[P.category(g)] || '')}${isExample(g) ? ' · 예시' : ''}</span>
        <span class="card-n">${esc(P.shortKind(g))} · ${esc(P.colorName(g.color))}</span>
      </button></li>`).join('')}</ul>` : '<p class="empty">옷장이 비어 있어요. SHOP에서 살게요를 누르면 여기에 들어와요.</p>'}
      <div class="foot"><button class="text-btn" data-act="reset">처음부터 다시</button></div>`;
  }

  // ═══ WISHLIST + 기록
  function wishHTML() {
    const ds = [...P.record.decisions].sort((a, b) => String(b.at).localeCompare(String(a.at)));
    const c = (k) => ds.filter((d) => d.decision === k).length;
    const likes = ds.filter((d) => d.decision === 'hold').map((d) => P.product(d.productId)).filter(Boolean);
    const skipped = ds.filter((d) => d.decision === 'skip' && Number.isFinite(d.price));
    return `<div class="sec-h sec-h--top"><p class="lbl lbl--h">WISHLIST</p><p class="cnt">${likes.length} ITEMS</p></div>
      ${likes.length ? gridHTML(likes) : '<p class="empty">상품의 하트를 누르면 여기에 모여요.</p>'}
      <div class="sec-h sec-h--hist"><p class="lbl lbl--h">HISTORY</p></div>
      <dl class="counts"><div><dt>살게요</dt><dd>${c('buy')}</dd></div><div><dt>찜</dt><dd>${c('hold')}</dd></div><div><dt>안 살게요</dt><dd>${c('skip')}</dd></div></dl>
      ${skipped.length ? `<p class="sum"><span>안 살게요 상품의 기록한 가격 합계</span><b>${P.price(skipped.reduce((s, d) => s + d.price, 0))}</b></p>` : ''}
      ${ds.length ? `<ul class="log" role="list">${ds.map((d) => { const p = P.product(d.productId); return p ? `<li><button class="log-row" data-act="open" data-id="${esc(p.id)}"><span class="log-ph">${img(p)}</span><span class="log-t"><span class="brand">${esc(p.brand || '')}</span><b>${esc(p.name)}</b><small>${esc(ymd(dateOf(d.at)))} · ${esc(P.price(d.price))}</small></span><span class="log-d log-d--${d.decision}">${DECISION[d.decision]}</span></button></li>` : ''; }).join('')}</ul>` : '<p class="empty">아직 기록이 없어요.</p>'}`;
  }

  // ═══ 시트
  function openSheet(s, opener) {
    ui.sheet = s; if (opener) ui.lastFocus = opener;
    const host = document.getElementById('pr-sheet');
    let body = '';
    if (s.type === 'garment') {
      const g = team().find((x) => x.id === s.id);
      if (!g) return;
      body = `<div class="sh-g"><span class="sh-ph">${img(g)}</span><div><p class="brand">${esc(CAT_LABEL[P.category(g)] || '')}${isExample(g) ? ' · 예시' : ''}</p><h2 class="sh-t" id="sh-t">${esc(P.label(g))}</h2><p class="sh-d">${esc(P.kindName(g))} · ${esc(P.colorName(g.color))}</p></div></div>
        <p class="sh-d">옷장에서 빼면 이 옷과의 매치를 더 보여 주지 않아요.</p>
        <div class="sh-btns"><button class="b-line" data-act="sheet-close" data-autofocus>취소</button><button class="b-black" data-act="remove" data-id="${esc(g.id)}">옷장에서 빼기</button></div>`;
    } else {
      body = `<h2 class="sh-t" id="sh-t">처음부터 다시 할까요?</h2><p class="sh-d">옷 ${team().length}벌과 기록 ${P.record.decisions.length}건이 이 브라우저에서 지워져요.</p>
        <div class="sh-btns"><button class="b-line" data-act="sheet-close" data-autofocus>취소</button><button class="b-black" data-act="reset-ok">처음부터 다시</button></div>`;
    }
    host.innerHTML = `<div class="sh-back" data-act="sheet-close"></div><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sh-t">${body}</div>`;
    document.documentElement.classList.add('is-locked');
    host.querySelector('[data-autofocus]')?.focus({ preventScroll: true });
  }
  function closeSheet() {
    ui.sheet = null;
    document.getElementById('pr-sheet').innerHTML = '';
    if (!ui.detail) document.documentElement.classList.remove('is-locked');
    const f = ui.lastFocus; ui.lastFocus = null;
    if (f && document.contains(f)) f.focus({ preventScroll: true });
  }

  function toast(msg) {
    const t = document.getElementById('pr-toast');
    t.innerHTML = `<span>${esc(msg)}</span>`;
    t.classList.add('is-on');
    clearTimeout(ui.toastTimer);
    ui.toastTimer = setTimeout(() => t.classList.remove('is-on'), 2200);
  }

  const looksLikeLink = (t) => /^\s*(https?:\/\/|www\.|m\.)|musinsa\.com/i.test(t);
  function go(tab) { ui.tab = tab; ui.enter = true; renderAll(); window.scrollTo(0, 0); }

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    const a = el.dataset.act;
    if (a === 'tab') { if (ui.detail) closeDetail(); if (el.dataset.tab === 'shop' && ui.tab === 'shop') { ui.cat = 'new'; } if (el.dataset.tab !== 'shop') { ui.searching = false; ui.q = ''; ui.linkError = ''; } go(el.dataset.tab); }
    else if (a === 'gender') {
      ui.gender = el.dataset.g;
      document.querySelectorAll('.ob-btn').forEach((b) => { const on = b.dataset.g === ui.gender; b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', String(on)); });
      const cta = document.querySelector('[data-act="example"]'); if (cta) cta.disabled = false;
    }
    else if (a === 'example') { P.startExample(ui.gender || 'M'); ext().prExample = team().map((g) => g.id); P.save(); invalidate(); ui.tab = 'shop'; ui.cat = 'new'; go('shop'); }
    else if (a === 'cat') { ui.cat = el.dataset.cat; ui.enter = true; renderScreen(); document.querySelector('.cat.is-on')?.focus({ preventScroll: true }); }
    else if (a === 'search') {
      ui.searching = !ui.searching; if (!ui.searching) { ui.q = ''; ui.linkError = ''; }
      if (ui.tab !== 'shop') ui.tab = 'shop';
      renderAll();
      if (ui.searching) document.getElementById('pr-q')?.focus();
    }
    else if (a === 'open') { const p = P.product(el.dataset.id); if (p) openDetail(p, el); }
    else if (a === 'like') {
      const p = P.product(el.dataset.id); if (!p) return;
      const on = !liked(p); setLike(p, on); P.buzz(8);
      el.classList.toggle('is-on', on); el.setAttribute('aria-pressed', String(on)); el.innerHTML = on ? I.heartOn : I.heart;
      renderTabs();
      if (ui.tab === 'wish') renderScreen();
    }
    else if (a === 'close') closeDetail();
    else if (a === 'decide') decide(el.dataset.d);
    else if (a === 'garment') openSheet({ type: 'garment', id: el.dataset.id }, el);
    else if (a === 'remove') { P.removeOwned(el.dataset.id); invalidate(); ui.lastFocus = null; closeSheet(); renderScreen(); toast('옷장에서 뺐어요.'); }
    else if (a === 'reset') openSheet({ type: 'reset' }, el);
    else if (a === 'reset-ok') { P.reset(); invalidate(); jc.clear(); ui.gender = null; ui.tab = 'shop'; ui.cat = 'new'; ui.searching = false; ui.q = ''; ui.lastFocus = null; closeSheet(); renderAll(); window.scrollTo(0, 0); }
    else if (a === 'sheet-close') closeSheet();
  });
  document.addEventListener('input', (e) => {
    if (e.target.id !== 'pr-q') return;
    ui.q = e.target.value; ui.linkError = '';
    if (looksLikeLink(ui.q)) return;
    const pos = e.target.selectionStart;
    renderScreen();
    const q = document.getElementById('pr-q'); if (q) { q.focus(); q.setSelectionRange(pos, pos); }
  });
  document.addEventListener('submit', (e) => {
    if (e.target.dataset.form !== 'search') return;
    e.preventDefault();
    if (!looksLikeLink(ui.q)) return;
    const r = P.fromLink(ui.q.trim());
    if (r.product) { ui.linkError = ''; openDetail(r.product, document.getElementById('pr-q')); return; }
    ui.linkError = r.error; renderScreen(); document.getElementById('pr-q')?.focus();
  });
  document.addEventListener('paste', (e) => {
    if (e.target.id === 'pr-q') setTimeout(() => { if (looksLikeLink(e.target.value)) e.target.form?.requestSubmit(); }, 0);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (ui.sheet) closeSheet(); else if (ui.detail) closeDetail();
  });

  mount();
})();
