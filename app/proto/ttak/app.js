// 딱 — "넘기다, 딱." 후보 카드를 넘기며 가진 옷 기준으로 판정하고 도장을 찍는다.
(() => {
  const P = Proto;
  const esc = P.esc;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const rm = () => P.reducedMotion();
  const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
  const clamp = (n, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, n));
  const store = {
    get(k, d) { try { const v = localStorage.getItem(`ttak-ui:${k}`); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(`ttak-ui:${k}`, JSON.stringify(v)); } catch {} },
    del(k) { try { localStorage.removeItem(`ttak-ui:${k}`); } catch {} },
  };

  const WORD = { buy: '딱!', hold: '잠깐', skip: '패스' };
  const PLAIN = { buy: '딱', hold: '잠깐', skip: '패스' };
  const STICKER = { yes: '딱 맞음', overlap: '겹침', unsure: '애매' };
  const STICKER_TXT = { yes: '딱 맞음', overlap: '겹침', unsure: '애매' };
  const HEAD = { yes: '딱 맞아요', overlap: '잠깐요, 겹쳐요', unsure: '애매해요' };
  const HONEST = '코디는 종류·색 공식이에요. 핏·사이즈·소재·현재 가격은 판매처에서 확인해 주세요.';
  const CATS = ['outer', 'top', 'dress', 'bottom', 'shoes', 'acc'];
  const TH_X = 96;
  const TH_Y = 104;

  const svg = (w, body, extra = '') => `<svg viewBox="0 0 24 24" width="${w}" height="${w}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"${extra}>${body}</svg>`;
  const I = {
    link: svg(18, '<path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1"/><path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1"/>'),
    cards: svg(22, '<rect x="7" y="3.5" width="12" height="15" rx="2.5"/><path d="M4.5 7.5v10a3 3 0 0 0 3 3H15"/>', ' stroke-width="1.8"'),
    hanger: svg(22, '<path d="M12 7.2a2.1 2.1 0 1 1 2.1-2.1c0 1.2-2.1 1.5-2.1 3v.9"/><path d="M12 9 3.4 16.2c-.7.6-.3 1.8.6 1.8h16c.9 0 1.3-1.2.6-1.8z"/>', ' stroke-width="1.8"'),
    stamp: svg(22, '<circle cx="12" cy="12" r="8.6"/><circle cx="12" cy="12" r="4.6"/>', ' stroke-width="1.8"'),
    flip: svg(16, '<path d="M4 11.5A8 8 0 0 1 18 7l1.6 1.8"/><path d="M19.8 4v4.8H15"/><path d="M20 12.5A8 8 0 0 1 6 17l-1.6-1.8"/><path d="M4.2 20v-4.8H9"/>'),
    out: svg(16, '<path d="M7 17 17 7M9 7h8v8"/>'),
    x: svg(20, '<path d="M6 6l12 12M18 6 6 18"/>'),
    plus: svg(18, '<path d="M12 5v14M5 12h14"/>', ' stroke-width="2.4"'),
    check: svg(14, '<path d="M5 12.5 9.5 17 19 7.5"/>', ' stroke-width="3.2"'),
    minus: svg(14, '<path d="M6 12h12"/>', ' stroke-width="3"'),
    arrL: svg(18, '<path d="M19 12H5M11 6l-6 6 6 6"/>', ' stroke-width="2.4"'),
    arrR: svg(18, '<path d="M5 12h14M13 6l6 6-6 6"/>', ' stroke-width="2.4"'),
    arrU: svg(18, '<path d="M12 19V5M6 11l6-6 6 6"/>', ' stroke-width="2.4"'),
    search: svg(18, '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4-4"/>'),
  };

  const ui = {
    tab: 'judge', queue: null, flipped: false, busy: false, session: [],
    closetEdit: false, confirmReset: false, recFilter: 'all',
    pickCat: null, picks: new Map(), addCat: null, sheet: null,
    toastT: 0, raf: 0, spring: null, lastFocus: null, ctx: new Map(), needs: null, needsSig: '',
  };
  let EX = new Set(store.get('ex', []));
  const isEx = (g) => !!(g && g.productId && EX.has(g.productId));
  const hasEx = () => P.record.garments.some(isEx);
  const saveEx = () => store.set('ex', [...EX]);

  // judge() is pure for a given closet; cache per closet signature.
  let jcache = new Map();
  let jsig = '';
  function judgeOf(p) {
    const sig = P.record.garments.map((g) => g.id).join('|');
    if (sig !== jsig) { jcache = new Map(); jsig = sig; }
    if (!jcache.has(p.id)) jcache.set(p.id, P.judge(p));
    return jcache.get(p.id);
  }
  const md = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : `${d.getMonth() + 1}.${String(d.getDate()).padStart(2, '0')}`; };
  const checkedMd = (p) => (p.checkedAt ? p.checkedAt.slice(5).replace('-', '.').replace(/^0/, '') : '');
  const kc = (x) => `${P.shortKind(x)} · ${P.colorName(x.color)}`;

  // ── root ─────────────────────────────────────────────
  const app = document.getElementById('app');
  app.innerHTML = `<div id="tt-root"></div><div id="tt-sheets"></div>
    <div class="tt-toastwrap" id="tt-toastwrap"><div class="tt-toast" id="tt-toast" role="status" aria-live="polite"></div></div>
    <p class="sr-only" id="tt-live" aria-live="assertive"></p>`;
  const announce = (msg) => { const el = $('#tt-live'); el.textContent = ''; setTimeout(() => { el.textContent = msg; }, 30); };

  function route() {
    const root = $('#tt-root');
    document.body.dataset.screen = !P.record.started ? 'splash' : store.get('onb', false) ? 'onb' : 'main';
    if (!P.record.started) { root.innerHTML = splashHTML(); playSplash(); return; }
    if (store.get('onb', false)) { root.innerHTML = onbHTML(); return; }
    root.innerHTML = `<div class="tt-shell"><main class="tt-view" id="tt-view"></main>${tabsHTML()}</div>`;
    renderView();
  }

  // ── first run: splash ────────────────────────────────
  function splashPicks() {
    try {
      const pool = SAFE_PRODUCTS.filter((p) => p.img && SLOT_BY_ID[p.slot]);
      const pick = (g, cat, n = 0) => pool.filter((p) => SLOT_BY_ID[p.slot].g === g && SLOT_BY_ID[p.slot].cat === cat)[n];
      return [pick('M', 'shoes'), pick('F', 'top', 2), pick('M', 'outer')].filter(Boolean);
    } catch { return []; }
  }
  function splashHTML() {
    const picks = splashPicks();
    const stamps = ['skip', 'hold', 'buy'];
    const fan = picks.map((p, i) => `<div class="tt-fcard tt-fcard-${i}"><div class="tt-fcard-ph"><img src="${P.photo(p)}" alt=""></div><span class="tt-fline"></span><span class="tt-fline is-short"></span><span class="tt-mstamp is-${stamps[i]} tt-fstamp">${WORD[stamps[i]]}</span></div>`).join('');
    return `<div class="tt-splash">
      <div class="tt-fan" aria-hidden="true">${fan}</div>
      <div class="tt-splash-copy">
        <h1 class="tt-mark"><span class="tt-mark-ring" aria-hidden="true"></span><span class="tt-mark-w">딱</span></h1>
        <p class="tt-tagline">넘기다, 딱.</p>
        <p class="tt-lede">살까 말까 할 때, 가진 옷 기준으로 판정해요.</p>
      </div>
      <div class="tt-splash-pick">
        <p class="tt-q" id="tt-q">누구 옷장으로 시작할까요?</p>
        <div class="tt-gender" role="group" aria-labelledby="tt-q">
          <button class="tt-gbtn" data-act="gender" data-g="M"><b>남성</b><span>옷장</span>${I.arrR}</button>
          <button class="tt-gbtn" data-act="gender" data-g="F"><b>여성</b><span>옷장</span>${I.arrR}</button>
        </div>
        <p class="tt-fine">기록은 이 브라우저에만 남아요.</p>
      </div>
    </div>`;
  }
  function playSplash() {
    if (rm()) return;
    const mark = $('.tt-mark-w');
    const ring = $('.tt-mark-ring');
    $$('.tt-fcard').forEach((c, i) => {
      c.animate([{ opacity: 0, transform: 'translate3d(0, 60px, 0) rotate(0deg) scale(.9)' }, { opacity: 1 }],
        { duration: 520, delay: 80 + i * 90, easing: 'cubic-bezier(.2,.9,.25,1.15)', fill: 'backwards', composite: 'add' });
    });
    $$('.tt-fstamp').forEach((s, i) => {
      s.animate([{ opacity: 0, transform: 'scale(1.8)' }, { opacity: 1, transform: 'scale(.94)', offset: 0.7 }, { opacity: 1, transform: 'scale(1)' }],
        { duration: 260, delay: 820 + i * 140, easing: 'cubic-bezier(.55,0,.6,1)', fill: 'backwards', composite: 'add' });
    });
    if (mark) {
      mark.animate([
        { opacity: 0, transform: 'scale(2.6) rotate(-18deg)', easing: 'cubic-bezier(.6,0,.9,.4)' },
        { opacity: 1, transform: 'scale(.92) rotate(-6deg)', offset: 0.55, easing: 'cubic-bezier(.2,.8,.3,1)' },
        { opacity: 1, transform: 'scale(1.03) rotate(-6deg)', offset: 0.78 },
        { opacity: 1, transform: 'scale(1) rotate(-6deg)' },
      ], { duration: 520, delay: 380, fill: 'backwards' });
      ring?.animate([{ opacity: 0, transform: 'scale(.4)' }, { opacity: 0.9, transform: 'scale(.9)', offset: 0.2 }, { opacity: 0, transform: 'scale(1.7)' }],
        { duration: 620, delay: 640, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'both' });
      $('.tt-splash-copy')?.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-5px)' }, { transform: 'translateX(4px)' }, { transform: 'translateX(-2px)' }, { transform: 'translateX(0)' }],
        { duration: 200, delay: 670 });
    }
    $$('.tt-tagline, .tt-lede, .tt-splash-pick').forEach((el, i) => el.animate([{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }],
      { duration: 420, delay: 760 + i * 70, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' }));
  }

  // ── first run: pick what you own ─────────────────────
  const catsWithItems = () => CATS.filter((c) => P.ownables(c, { limit: 1 }).length);
  function chipsHTML(cats, cur, act, countOf) {
    return cats.map((c) => {
      const n = countOf ? countOf(c) : 0;
      return `<button class="tt-chip" role="tab" data-act="${act}" data-c="${c}" aria-selected="${c === cur}">${esc(P.cats[c])}${n ? `<b>${n}</b>` : ''}</button>`;
    }).join('');
  }
  function pickGridHTML(cat, isOn, act) {
    return P.ownables(cat, { limit: 30 }).map((p) => {
      const on = isOn(p);
      return `<button class="tt-pick" data-act="${act}" data-pid="${esc(p.id)}" aria-pressed="${on}" aria-label="${esc(`${P.kindName(p)} ${P.colorName(p.color)}`)}">
        <span class="tt-pick-ph"><img src="${P.photo(p)}" alt="" loading="lazy" draggable="false"></span>
        <span class="tt-pick-k">${esc(P.shortKind(p))}</span>
        <span class="tt-pick-c"><i style="background:${P.colorHex(p.color)}"></i>${esc(P.colorName(p.color))}</span>
        <span class="tt-check" aria-hidden="true">${I.check}</span>
      </button>`;
    }).join('');
  }
  const pickedIn = (c) => [...ui.picks.values()].filter((p) => P.category(p) === c).length;
  const onbDoneLabel = () => (ui.picks.size ? `${ui.picks.size}벌 걸고 시작` : '옷을 골라 주세요');
  function onbHTML() {
    const cats = catsWithItems();
    if (!ui.pickCat || !cats.includes(ui.pickCat)) ui.pickCat = cats.includes('top') ? 'top' : cats[0];
    return `<div class="tt-onb">
      <header class="tt-onb-head">
        <button class="tt-iconbtn" data-act="onb-back" aria-label="성별 다시 고르기">${I.arrL}</button>
        <p class="tt-step">${P.record.gender === 'F' ? '여성' : '남성'} 옷장 <span>2 / 2</span></p>
      </header>
      <h1 class="tt-onb-t">가진 옷을<br>탭하세요</h1>
      <p class="tt-onb-s">똑같지 않아도 돼요. 종류와 색이 비슷하면 판정에 충분해요.</p>
      <div class="tt-chips tt-onb-chips" role="tablist" aria-label="종류" id="tt-onb-chips">${chipsHTML(cats, ui.pickCat, 'onb-cat', pickedIn)}</div>
      <div class="tt-pgrid" id="tt-onb-grid">${pickGridHTML(ui.pickCat, (p) => ui.picks.has(p.id), 'onb-pick')}</div>
      <footer class="tt-onb-foot">
        <button class="tt-ghostbtn" data-act="onb-example">예시 옷장으로 시작</button>
        <button class="tt-cta" data-act="onb-done" id="tt-onb-done" ${ui.picks.size ? '' : 'disabled'}>${onbDoneLabel()}</button>
      </footer>
    </div>`;
  }

  // ── shell ────────────────────────────────────────────
  function tabsHTML() {
    const t = (id, label, icon) => `<button class="tt-tab" data-act="tab" data-t="${id}"${ui.tab === id ? ' aria-current="page"' : ''}>${icon}<span>${label}</span></button>`;
    return `<nav class="tt-tabs" aria-label="메뉴">${t('judge', '판정', I.cards)}${t('closet', '옷장', I.hanger)}${t('records', '도장', I.stamp)}</nav>`;
  }
  function setTab(t) {
    cancelAnimationFrame(ui.raf);
    ui.tab = t; ui.flipped = false; ui.closetEdit = false; ui.confirmReset = false; ui.busy = false; ui.spring = null;
    $$('.tt-tab').forEach((b) => (b.dataset.t === t ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current')));
    renderView();
  }
  function renderView({ keepScroll = false } = {}) {
    const v = $('#tt-view');
    if (!v) return;
    const top = keepScroll ? v.scrollTop : 0;
    v.className = `tt-view is-${ui.tab}`;
    $('#tt-toastwrap').dataset.tab = ui.tab;
    if (ui.tab === 'judge') { v.innerHTML = judgeHTML(); renderStack(); }
    else if (ui.tab === 'closet') v.innerHTML = closetHTML();
    else v.innerHTML = recordsHTML();
    v.scrollTop = top;
  }

  // ── 판정: the stack ──────────────────────────────────
  // What the closet needs (cached per closet).
  function needsNow() {
    const sig = P.record.garments.map((g) => g.id).join('|');
    if (!ui.needs || ui.needsSig !== sig) { ui.needs = P.needs({ limit: 4, productsPerGap: 4 }); ui.needsSig = sig; }
    return ui.needs;
  }
  // The stack starts from the closet: each gap's products, then the pairs' products, then other candidates.
  function buildQueue() {
    const n = needsNow();
    const decided = new Set(P.record.decisions.map((d) => d.productId));
    const out = [];
    const seen = new Set();
    ui.ctx = new Map();
    const add = (p, c) => {
      if (!p || seen.has(p.id) || decided.has(p.id) || P.owns(p)) return;
      seen.add(p.id); out.push(p);
      if (c) ui.ctx.set(p.id, c);
    };
    n.gaps.forEach((gap) => gap.products.forEach((p) => add(p, { type: 'gap', gap })));
    n.pairs.forEach((pair) => pair.products.forEach((p) => add(p, { type: 'pair', pair })));
    P.candidates({ limit: 12 }).forEach((p) => add(p, null));
    ui.qsig = P.record.garments.map((g) => g.id).join('|');
    return out;
  }
  const ensureQueue = () => { if (!ui.queue) ui.queue = buildQueue(); };
  function diagHTML() {
    const n = needsNow();
    const g = n.gaps[0];
    const pr = n.pairs[0];
    const line = !n.garments ? '가진 옷을 걸면 옷장에 필요한 옷을 알려 드려요.'
      : g ? `${g.short} 하나면 코디 ${g.newLooks}개가 더 생겨요`
      : pr ? `${pr.kinds.join(' · ')} 두 벌이면 코디가 하나 더 생겨요`
      : '지금 옷장으로 충분해요. 겹치는 옷만 피하세요.';
    return `<p class="tt-diag-a">내 옷장 <b>${n.garments}</b>벌 · 지금 입을 수 있는 코디 <b>${n.ready.length}</b>개${hasEx() ? '<em>예시 옷장</em>' : ''}</p>
      <p class="tt-diag-b">${esc(line)}</p>`;
  }
  const productsLeft = () => ui.queue.filter((x) => !x.summary).length;
  const leftHTML = () => `<span>남은 후보</span><b>${productsLeft()}</b>`;
  function judgeHTML() {
    ensureQueue();
    return `<header class="tt-jhead">
        <div class="tt-jbrand"><span class="tt-wm" aria-hidden="true">딱</span><p class="tt-left" id="tt-left">${leftHTML()}</p></div>
        <button class="tt-linkbtn" data-act="link">${I.link}<span>링크로 판정</span></button>
      </header>
      <div class="tt-diag" id="tt-diag">${diagHTML()}</div>
      <div class="tt-stack" id="tt-stack"></div>
      <div class="tt-actions" id="tt-actions">
        <button class="tt-act tt-act-skip" data-act="decide" data-d="skip" aria-label="패스: 안 사요">${I.arrL}<span>패스</span></button>
        <button class="tt-act tt-act-hold" data-act="decide" data-d="hold" aria-label="잠깐: 보류해요">${I.arrU}<span>잠깐</span></button>
        <button class="tt-act tt-act-buy" data-act="decide" data-d="buy" aria-label="딱: 살래요"><span>딱!</span>${I.arrR}</button>
      </div>`;
  }
  const depthTf = (d) => (d <= 0.001 ? 'none' : `translate3d(0, ${(d * 13).toFixed(2)}px, 0) scale(${(1 - d * 0.05).toFixed(4)})`);
  function setDepth(card, d) {
    card.dataset.depth = String(d);
    card.style.transform = depthTf(d);
    card.style.setProperty('--dim', d === 0 ? 0 : d === 1 ? 0.45 : 0.72);
  }
  const todayKey = () => new Date().toDateString();
  function todayCounts() {
    const c = { buy: 0, hold: 0, skip: 0, all: 0 };
    P.record.decisions.forEach((d) => { if (new Date(d.at).toDateString() === todayKey()) { c[d.decision] += 1; c.all += 1; } });
    return c;
  }
  // Every 5 judgments: a quiet pause card, swiped or tapped away without a decision.
  function summaryHTML(item) {
    const c = item.counts;
    const line = `오늘 ${c.all}벌 판정 · 딱 ${c.buy} · 잠깐 ${c.hold} · 패스 ${c.skip}`;
    return `<article class="tt-card tt-sum" data-pid="${esc(item.id)}" aria-label="${esc(line)}" aria-roledescription="요약 카드">
      <div class="tt-shake"><div class="tt-card-in"><div class="tt-face tt-front tt-sum-front">
        <span class="tt-sum-big" aria-hidden="true">${c.all}</span>
        <p class="tt-sum-k">잠깐 쉬어 가기</p>
        <p class="tt-sum-t">오늘 ${c.all}벌<br>판정</p>
        <ul class="tt-sum-row" aria-hidden="true">${['buy', 'hold', 'skip'].map((d) => `<li><span class="tt-mstamp is-${d}">${WORD[d]}</span><b>${c[d]}</b></li>`).join('')}</ul>
        <p class="tt-sum-s">남은 후보 ${productsLeft()}벌. 천천히 봐도 돼요.</p>
        <button class="tt-sum-go" data-act="continue">계속 보기</button>
      </div></div></div>
    </article>`;
  }
  // The whole outfit this product completes, in wearing order, and the card's headline.
  function boardOf(p) {
    const j = judgeOf(p);
    // A gap or pair only speaks for the card while the closet still needs it (a 딱 can fill it).
    const raw = ui.ctx.get(p.id);
    const n = needsNow();
    const live = raw?.type === 'gap' ? n.gaps.some((g) => g.kind === raw.gap.kind)
      : raw?.type === 'pair' ? n.pairs.some((pr) => pr.kinds.join('|') === raw.pair.kinds.join('|')) : false;
    const c = live ? raw : null;
    const jl = j.looks.find((l) => l.isNew) || j.looks[0];
    const fromJudge = (l) => ({ title: l.title, note: l.note, pieces: l.items });
    let look = null;
    let head;
    if (c?.type === 'gap') {
      const gl = c.gap.looks[0];
      const same = j.looks.find((l) => l.title === gl?.title);
      look = same ? fromJudge(same) : gl ? P.fillNeed(gl, p) : null;
      head = j.verdict === 'overlap' ? `${c.gap.short}, 이미 비슷한 옷이 있어요` : `${c.gap.short} 하나면 코디 ${c.gap.newLooks}개 완성`;
    } else if (c?.type === 'pair') {
      look = P.fillNeed(c.pair.look, p);
      head = `${c.pair.kinds.join(' + ')}, 두 벌이면 코디 완성`;
    } else if (jl) {
      look = fromJudge(jl);
      head = j.verdict === 'overlap' ? '가진 옷과 겹쳐요' : j.newLooks ? `이 옷 하나면 코디 ${j.newLooks}개 완성` : `가진 옷과 코디 ${j.looks.length}개`;
    } else {
      head = j.empty ? '옷장이 비어 있어요' : '가진 옷과 맞는 코디가 아직 없어요';
    }
    return { j, look, head };
  }
  function stripHTML(look, p) {
    if (!look) return '<div class="tt-strip is-empty"><p>등록한 옷으로는 맞춰지는 코디가 없어요. 근거에서 자세히 볼 수 있어요.</p></div>';
    return `<ol class="tt-strip" aria-label="입는 순서">${look.pieces.map((it) => {
      if (it.candidate) return `<li class="tt-pc is-me"><span class="tt-pc-ph"><img src="${P.photo(p)}" alt="" draggable="false"></span><span class="tt-pc-r">${esc(it.roleName)}</span><span class="tt-pc-o">이 옷</span></li>`;
      if (it.need) return `<li class="tt-pc is-need"><span class="tt-pc-ph"><span>${esc(String(it.kind).split('·')[0])}</span></span><span class="tt-pc-r">${esc(it.roleName)}</span><span class="tt-pc-o">필요</span></li>`;
      return `<li class="tt-pc"><span class="tt-pc-ph"><img src="${P.photo(it.garment)}" alt="" draggable="false"></span><span class="tt-pc-r">${esc(it.roleName)}</span><span class="tt-pc-o">내 옷</span></li>`;
    }).join('')}</ol>`;
  }
  function cardHTML(p, depth) {
    if (p.summary) return summaryHTML(p);
    const b = boardOf(p);
    const j = b.j;
    const n = { looks: j.looks.length, used: j.used.length, over: j.overlaps.length };
    const outfitText = b.look ? `${b.look.title}: ${b.look.pieces.map((it) => `${it.roleName} ${it.candidate ? '이 옷' : it.need ? `${it.kind} 필요` : '내 옷'}`).join(', ')}` : '';
    const label = `${b.head}. ${outfitText}. ${p.brand} ${p.name}, ${P.price(p.price)}. 판정 ${STICKER_TXT[j.verdict]}. 코디 ${n.looks}, 어울리는 옷 ${n.used}, 겹침 ${n.over}`;
    return `<article class="tt-card" data-pid="${esc(p.id)}" aria-label="${esc(label)}" aria-roledescription="후보 카드">
      <div class="tt-shake">
        <div class="tt-card-in">
          <div class="tt-face tt-front">
            <div class="tt-lb-head">
              <p class="tt-lb-h">${esc(b.head)}</p>
              ${b.look ? `<p class="tt-lb-note"><b>${esc(b.look.title)}</b>${b.look.note ? ` · ${esc(b.look.note)}` : ''}</p>` : ''}
            </div>
            <div class="tt-photo" data-cat="${P.category(p)}">
              <img src="${P.photo(p)}" alt="" draggable="false">
              <span class="tt-kc"><i style="background:${P.colorHex(p.color)}"></i>${esc(kc(p))}</span>
              <span class="tt-sticker is-${j.verdict}" aria-hidden="true">${STICKER[j.verdict]}</span>
            </div>
            ${stripHTML(b.look, p)}
            <div class="tt-info">
              <p class="tt-info-a"><span class="tt-brand">${esc(p.brand)}</span><span class="tt-price">${esc(P.price(p.price))}</span></p>
              <div class="tt-row">
                <h2 class="tt-name">${esc(p.name)}</h2>
                <button class="tt-why" data-act="flip" aria-label="판정 근거 보기">근거${I.flip}</button>
              </div>
            </div>
          </div>
          <div class="tt-face tt-back" aria-hidden="true" inert>${evidenceHTML(j, { inCard: true })}</div>
        </div>
        <span class="tt-hint tt-hint-buy" aria-hidden="true">딱!</span>
        <span class="tt-hint tt-hint-skip" aria-hidden="true">패스</span>
        <span class="tt-hint tt-hint-hold" aria-hidden="true">잠깐</span>
      </div>
    </article>`;
  }
  function promote(card) {
    card.classList.add('is-top');
    card.tabIndex = 0;
    card.removeAttribute('aria-hidden');
    card.querySelector('.tt-front').inert = false;
  }
  function demote(card) {
    card.classList.remove('is-top');
    card.removeAttribute('tabindex');
    card.setAttribute('aria-hidden', 'true');
    card.querySelector('.tt-front').inert = true;
  }
  function renderStack() {
    const s = $('#tt-stack');
    if (!s) return;
    ensureQueue();
    $('#tt-left').innerHTML = leftHTML();
    $('#tt-actions').hidden = !ui.queue.length;
    s.classList.toggle('is-empty', !ui.queue.length);
    if (!ui.queue.length) { s.innerHTML = doneHTML(); return; }
    const vis = ui.queue.slice(0, 3);
    s.innerHTML = vis.map((p, i) => cardHTML(p, i)).reverse().join('');
    const cards = $$('.tt-card', s).reverse();
    cards.forEach((c, i) => { setDepth(c, i); i === 0 ? promote(c) : demote(c); });
  }
  // After a card leaves: shift the rest up without re-rendering (no image flash).
  function advanceStack() {
    const s = $('#tt-stack');
    const diag = $('#tt-diag');
    if (diag) diag.innerHTML = diagHTML();
    ui.queue.shift();
    // The closet changed (a 딱): keep the two cards already in view, refill the rest from the new needs.
    const sig = P.record.garments.map((g) => g.id).join('|');
    if (ui.qsig !== undefined && sig !== ui.qsig && ui.queue.length) {
      const vis = ui.queue.slice(0, 2);
      const oldCtx = new Map(ui.ctx);
      const fresh = buildQueue().filter((p) => !vis.some((v) => v.id === p.id));
      vis.forEach((v) => { if (!ui.ctx.has(v.id) && oldCtx.has(v.id)) ui.ctx.set(v.id, oldCtx.get(v.id)); });
      ui.queue = [...vis, ...fresh];
      $('#tt-left').innerHTML = leftHTML();
    }
    ui.flipped = false;
    $('#tt-left').innerHTML = leftHTML();
    const b = $('#tt-left b');
    if (b && !rm()) b.animate([{ transform: 'translateY(-70%)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 260, easing: 'cubic-bezier(.2,.8,.2,1)' });
    if (!ui.queue.length) { renderStack(); if (!rm()) $('.tt-done')?.animate([{ opacity: 0, transform: 'scale(.94)' }, { opacity: 1, transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.2,.9,.3,1.2)' }); return; }
    const cards = $$('.tt-card', s).filter((c) => !c.classList.contains('is-gone'));
    const ordered = cards.sort((a, b) => Number(a.dataset.depth) - Number(b.dataset.depth));
    ordered.forEach((c, i) => {
      // judgments may change after a 딱 (the piece joins the closet)
      const p = ui.queue[i];
      if (!p || c.dataset.pid !== p.id) { c.remove(); return; }
      setDepth(c, i);
      i === 0 ? promote(c) : demote(c);
    });
    const have = $$('.tt-card', s).length;
    if (ui.queue.length > have && have < 3) {
      const p = ui.queue[have];
      s.insertAdjacentHTML('afterbegin', cardHTML(p, have));
      const c = s.firstElementChild;
      setDepth(c, have);
      demote(c);
      if (!rm()) c.animate([{ opacity: 0, transform: depthTf(have + 0.8) }, { opacity: 1, transform: depthTf(have) }], { duration: 380, easing: 'cubic-bezier(.2,.8,.2,1)' });
    }
    refreshTopJudgment();
  }
  // Re-read the top card when the closet changed under it (e.g. after a 딱).
  function refreshTopJudgment() {
    const top = $('.tt-card.is-top');
    if (!top) return;
    const p = ui.queue[0];
    if (!p || p.summary) return;
    const fresh = document.createElement('div');
    fresh.innerHTML = cardHTML(p, 0);
    if (fresh.firstElementChild.getAttribute('aria-label') === top.getAttribute('aria-label')) return;
    ['.tt-lb-head', '.tt-strip', '.tt-info', '.tt-sticker'].forEach((sel) => { const n = fresh.querySelector(sel); const o = top.querySelector(sel); if (n && o) o.replaceWith(n); });
    top.querySelector('.tt-back').innerHTML = fresh.querySelector('.tt-back').innerHTML;
    top.setAttribute('aria-label', fresh.firstElementChild.getAttribute('aria-label'));
  }
  function doneHTML() {
    const c = { buy: 0, hold: 0, skip: 0 };
    ui.session.forEach((d) => { c[d] += 1; });
    return `<div class="tt-done">
      <p class="tt-done-k">오늘 판정<br>끝</p>
      <p class="tt-done-s">${ui.session.length ? `이번에 도장 ${ui.session.length}개를 찍었어요.` : '지금 판정할 후보가 없어요.'}</p>
      ${ui.session.length ? `<div class="tt-done-row">${['buy', 'hold', 'skip'].map((d) => `<span class="tt-done-cell"><span class="tt-mstamp is-${d}">${WORD[d]}</span><b>${c[d]}</b></span>`).join('')}</div>` : ''}
      <button class="tt-cta tt-done-cta" data-act="reload">후보 다시 불러오기</button>
      <form class="tt-linkform is-dark" data-form="link" novalidate>
        <label class="sr-only" for="tt-done-q">상품 링크 또는 이름</label>
        <input id="tt-done-q" name="q" type="text" autocomplete="off" spellcheck="false" placeholder="상품 링크 붙여넣기" enterkeyhint="go">
        <button type="submit" class="tt-go">판정</button>
      </form>
      <p class="tt-err" role="alert"></p>
    </div>`;
  }

  // ── evidence (card back, record sheet) ───────────────
  function thumb(x, { me = false, cap = null } = {}) {
    const ex = !me && isEx(x);
    return `<figure class="tt-th${me ? ' is-me' : ''}">
      <div class="tt-th-ph"><img src="${P.photo(x)}" alt="" loading="lazy" draggable="false">${ex ? '<span class="tt-ex">예시</span>' : ''}</div>
      <figcaption>${esc(cap ?? (me ? '이 옷' : P.shortKind(x)))}</figcaption>
    </figure>`;
  }
  function evidenceHTML(j, { inCard = false } = {}) {
    const p = j.product;
    const v = j.verdict;
    const nL = j.looks.length;
    const nU = j.used.length;
    const nO = j.overlaps.length;
    const sameProduct = j.overlaps.some((g) => g.productId === p.id);
    let sub;
    if (j.empty) sub = '옷장이 비어 있어요. 가진 옷을 걸면 코디를 맞춰 볼게요.';
    else if (v === 'yes') sub = `가진 옷 ${nU}벌과 코디 ${nL}개가 나와요.${j.newLooks ? ` 그중 ${j.newLooks}개는 이 옷이 있어야 완성돼요.` : ' 지금 옷장으로도 되는 코디예요.'}`;
    else if (v === 'overlap') sub = sameProduct ? '이미 옷장에 걸린 상품이에요.' : `가진 옷 ${nO}벌과 종류·색이 같아요.${nL ? ` 코디는 ${nL}개 나와요.` : ''}`;
    else sub = '지금 옷장으로는 맞는 코디 공식이 없어요.';
    const looks = nL ? `<ol class="tt-looks">${j.looks.map((look) => `<li class="tt-look">
        <p class="tt-look-t"><span>${esc(look.title)}</span>${look.isNew ? '<em class="tt-tag is-new">새 코디</em>' : '<em class="tt-tag">지금도 되는 코디</em>'}</p>
        <div class="tt-look-row">${look.items.map((it) => (it.candidate ? thumb(p, { me: true }) : thumb(it.garment))).join('')}</div>
      </li>`).join('')}</ol>` : `<p class="tt-none">${j.empty ? '옷장이 비어 있어요.' : '등록한 옷으로 맞춰지는 코디가 없어요.'}</p>`;
    const used = nU ? `<div class="tt-ev-row">${j.used.map((g) => thumb(g)).join('')}</div>` : '<p class="tt-none">아직 없어요.</p>';
    const overs = nO ? `<ul class="tt-overs">${j.overlaps.map((g) => `<li>${thumb(g)}<div><p>${esc(P.label(g))}</p><span>${g.productId === p.id ? '같은 상품' : `같은 종류·같은 색 (${esc(kc(g))})`}</span></div></li>`).join('')}</ul>` : '<p class="tt-none">겹치는 옷이 없어요.</p>';
    const checks = [...new Set(j.checks || [])].filter((c) => c && c !== HONEST);
    const store = p.store || '판매처';
    return `<div class="tt-ev">
      <div class="tt-ev-top">
        <p class="tt-ev-h is-${v}">${HEAD[v]}</p>
        ${inCard ? `<button class="tt-ev-flip" data-act="flip" aria-label="앞면으로">앞면${I.flip}</button>` : ''}
      </div>
      <p class="tt-ev-sub">${esc(sub)}</p>
      <section class="tt-ev-sec"><h3>코디 <b class="${nL ? 'on' : ''}">${nL}</b></h3>${looks}</section>
      <section class="tt-ev-sec"><h3>어울리는 옷 <b class="${nU ? 'on' : ''}">${nU}</b></h3>${used}</section>
      <section class="tt-ev-sec"><h3>겹침 <b class="${nO ? 'warn' : ''}">${nO}</b></h3>${overs}</section>
      <div class="tt-honest"><p>${HONEST}</p>${checks.map((c) => `<p class="tt-check-l">${esc(c)}</p>`).join('')}</div>
      <a class="tt-seller" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">${esc(store)}에서 확인하기${I.out}</a>
      <p class="tt-ev-price">${esc(P.price(p.price))}${checkedMd(p) ? ` · ${checkedMd(p)} 기록한 가격` : ''}</p>
    </div>`;
  }

  // ── flip, drag, commit ───────────────────────────────
  function flip(force) {
    const card = $('.tt-card.is-top');
    if (!card || ui.busy || ui.queue?.[0]?.summary) return;
    ui.flipped = typeof force === 'boolean' ? force : !ui.flipped;
    card.classList.toggle('is-flipped', ui.flipped);
    const back = card.querySelector('.tt-back');
    const front = card.querySelector('.tt-front');
    back.scrollTop = 0;
    back.inert = !ui.flipped;
    front.inert = ui.flipped;
    back.setAttribute('aria-hidden', String(!ui.flipped));
    front.setAttribute('aria-hidden', String(ui.flipped));
    P.buzz(6);
    if (ui.flipped && card.contains(document.activeElement)) back.querySelector('.tt-ev-flip')?.focus({ preventScroll: true });
    else if (!ui.flipped && card.contains(document.activeElement)) card.focus({ preventScroll: true });
  }
  const dirOf = (x, y) => (y < -24 && -y > Math.abs(x) ? 'hold' : x >= 0 ? 'buy' : 'skip');
  function place(card, x, y, sign = 1) {
    const r = x * 0.055 * sign;
    card.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${r}deg)`;
    const d = dirOf(x, y);
    const p = d === 'hold' ? clamp(-y / TH_Y) : clamp(Math.abs(x) / TH_X);
    card.style.setProperty('--pb', d === 'buy' ? p : 0);
    card.style.setProperty('--ps', d === 'skip' ? p : 0);
    card.style.setProperty('--ph', d === 'hold' ? p : 0);
    const armed = p >= 1 ? d : '';
    if (armed !== (card.dataset.armed || '')) { if (armed) P.buzz(8); card.dataset.armed = armed; }
    const next = card.parentElement?.querySelector('.tt-card[data-depth="1"]');
    const prog = clamp(Math.max(Math.abs(x) / TH_X, -y / TH_Y));
    if (next) { next.style.transition = 'none'; next.style.transform = depthTf(1 - prog * 0.45); }
    return r;
  }
  function settle(card) {
    card.style.transform = 'none';
    card.style.setProperty('--pb', 0); card.style.setProperty('--ps', 0); card.style.setProperty('--ph', 0);
    card.dataset.armed = '';
    const next = card.parentElement?.querySelector('.tt-card[data-depth="1"]');
    if (next) next.style.transform = depthTf(1);
  }
  // A real damped spring from the release point and velocity (px/ms).
  function springBack(card, x, y, vx, vy, sign) {
    cancelAnimationFrame(ui.raf);
    if (rm()) { ui.spring = null; settle(card); return; }
    let px = x; let py = y; let ux = vx * 1000; let uy = vy * 1000;
    const k = 420; const c = 27;
    let last = performance.now();
    ui.spring = { x: px, y: py, sign };
    const step = (now) => {
      const dt = Math.min(0.034, (now - last) / 1000);
      last = now;
      for (let i = 0; i < 4; i += 1) {
        const h = dt / 4;
        ux += (-k * px - c * ux) * h; px += ux * h;
        uy += (-k * py - c * uy) * h; py += uy * h;
      }
      if (!card.isConnected) { ui.spring = null; return; }
      place(card, px, py, sign);
      ui.spring = { x: px, y: py, sign };
      if (Math.abs(px) < 0.4 && Math.abs(py) < 0.4 && Math.abs(ux) < 10 && Math.abs(uy) < 10) { ui.spring = null; settle(card); return; }
      ui.raf = requestAnimationFrame(step);
    };
    ui.raf = requestAnimationFrame(step);
  }

  let drag = null;
  document.addEventListener('pointerdown', (e) => {
    const front = e.target.closest('.tt-card.is-top .tt-front');
    if (!front || ui.busy || ui.flipped || e.target.closest('button, a, input')) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const card = front.closest('.tt-card');
    cancelAnimationFrame(ui.raf);
    const off = ui.spring || { x: 0, y: 0, sign: null };
    ui.spring = null;
    const rect = card.getBoundingClientRect();
    drag = {
      card, id: e.pointerId, sx: e.clientX - off.x, sy: e.clientY - off.y, x: off.x, y: off.y,
      moved: Math.abs(off.x) + Math.abs(off.y) > 2, sign: off.sign ?? (e.clientY - rect.top < rect.height * 0.72 ? 1 : -1),
      pts: [{ t: e.timeStamp, x: e.clientX, y: e.clientY }],
    };
    try { card.setPointerCapture(e.pointerId); } catch {}
    card.classList.add('is-grab');
  });
  document.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const x = e.clientX - drag.sx;
    const y = e.clientY - drag.sy;
    if (!drag.moved && Math.hypot(x, y) < 7) return;
    drag.moved = true; drag.x = x; drag.y = y;
    drag.pts.push({ t: e.timeStamp, x: e.clientX, y: e.clientY });
    if (drag.pts.length > 8) drag.pts.shift();
    place(drag.card, x, y, drag.sign);
  });
  function endDrag(e, cancelled) {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    d.card.classList.remove('is-grab');
    try { d.card.releasePointerCapture(d.id); } catch {}
    if (!d.moved) { if (!cancelled) flip(); return; }
    const now = e.timeStamp;
    const pts = d.pts.filter((p) => now - p.t < 110);
    const a = pts[0] || d.pts[d.pts.length - 1];
    const b = d.pts[d.pts.length - 1];
    const dt = Math.max(16, b.t - a.t);
    const vx = (b.x - a.x) / dt;
    const vy = (b.y - a.y) / dt;
    const dir = dirOf(d.x, d.y);
    let go = false;
    if (!cancelled) {
      if (dir === 'hold') go = -d.y > TH_Y || (vy < -0.5 && -d.y > 36);
      else go = Math.abs(d.x) > TH_X || (Math.abs(vx) > 0.5 && Math.sign(vx) === Math.sign(d.x) && Math.abs(d.x) > 36);
    }
    if (go) commit(dir, { x: d.x, y: d.y, r: d.x * 0.055 * d.sign, vx, vy });
    else springBack(d.card, d.x, d.y, vx, vy, d.sign);
  }
  document.addEventListener('pointerup', (e) => endDrag(e, false));
  document.addEventListener('pointercancel', (e) => endDrag(e, true));

  async function commit(dir, rel = null) {
    if (ui.busy || !ui.queue?.length) return;
    const card = $('.tt-card.is-top');
    if (!card) return;
    if (ui.queue[0].summary) { dismissSummary(dir, rel); return; }
    ui.busy = true;
    cancelAnimationFrame(ui.raf);
    const hadFocus = card.contains(document.activeElement);
    const cur = rel || (ui.spring ? { x: ui.spring.x, y: ui.spring.y, r: ui.spring.x * 0.055 * ui.spring.sign } : { x: 0, y: 0, r: 0 });
    ui.spring = null;
    const p = ui.queue[0];
    const wasOwned = P.owns(p);
    P.decide(p, dir);
    ui.session.push(dir);
    announce(`${PLAIN[dir]} 도장을 찍었어요. ${p.name}`);
    const reduce = rm();
    const shake = card.querySelector('.tt-shake');
    const stamp = document.createElement('div');
    stamp.className = `tt-stamp is-${dir}`;
    stamp.setAttribute('aria-hidden', 'true');
    stamp.innerHTML = `<b>${WORD[dir]}</b><small>${md(new Date().toISOString())}</small>`;
    shake.appendChild(stamp);
    card.classList.add('is-stamped');
    card.style.transform = `translate3d(${cur.x}px, ${cur.y}px, 0) rotate(${cur.r}deg)`;
    // The first few stamps land with a shake and a ring; after that, just the stamp.
    const calm = ui.session.length > 3;
    if (reduce) {
      P.buzz(12);
      await wait(220);
    } else {
      const slam = stamp.animate([
        { transform: 'scale(1.35) rotate(-12deg)', opacity: 0, easing: 'cubic-bezier(.55,0,.9,.45)' },
        { transform: 'scale(.97) rotate(-12deg)', opacity: 1, offset: 0.6, easing: 'cubic-bezier(.2,.8,.3,1)' },
        { transform: 'scale(1) rotate(-12deg)', opacity: 1 },
      ], { duration: calm ? 190 : 230, fill: 'both' });
      await wait(calm ? 115 : 140);
      P.buzz(calm ? 8 : 15);
      if (!calm) shake.animate([
        { transform: 'none' }, { transform: 'translate3d(-6px, 2px, 0) scale(.982)' }, { transform: 'translate3d(5px, -1px, 0) scale(.99)' },
        { transform: 'translate3d(-3px, 0, 0)' }, { transform: 'translate3d(1px, 0, 0)' }, { transform: 'none' },
      ], { duration: 200, easing: 'linear' });
      if (!calm) {
        const ring = document.createElement('span');
        ring.className = `tt-ring is-${dir}`;
        shake.appendChild(ring);
        ring.animate([{ opacity: 0.7, transform: 'scale(.85)' }, { opacity: 0, transform: 'scale(1.6)' }], { duration: 420, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'forwards' });
      }
      await slam.finished;
      await wait(calm ? 60 : 110);
    }
    const needSum = ui.session.length % 5 === 0 && productsLeft() > 1;
    const s = card.parentElement;
    const next = s.querySelector('.tt-card[data-depth="1"]');
    const third = s.querySelector('.tt-card[data-depth="2"]');
    const W = card.offsetWidth;
    const H = card.offsetHeight;
    let to;
    if (dir === 'buy') to = { x: W * 1.45, y: cur.y + clamp(rel?.vy || 0, -1, 1) * 140 + 30, r: 24 };
    else if (dir === 'skip') to = { x: -W * 1.45, y: cur.y + clamp(rel?.vy || 0, -1, 1) * 140 + 30, r: -24 };
    else to = { x: cur.x * 1.6, y: -H * 1.3, r: cur.r * 0.4 - 3 };
    const fromT = `translate3d(${cur.x}px, ${cur.y}px, 0) rotate(${cur.r}deg)`;
    const toT = reduce ? fromT : `translate3d(${to.x}px, ${to.y}px, 0) rotate(${to.r}deg)`;
    card.classList.add('is-gone');
    const fly = card.animate([{ transform: fromT, opacity: 1 }, { transform: toT, opacity: reduce ? 0 : 1 }],
      { duration: reduce ? 140 : rel ? 260 : 290, easing: rel ? 'cubic-bezier(.3,.45,.45,1)' : 'cubic-bezier(.6,0,.75,.35)', fill: 'forwards' });
    if (needSum) {
      await fly.finished;
      card.remove();
      ui.queue.shift();
      ui.queue.unshift({ summary: true, id: `sum-${ui.session.length}`, counts: todayCounts() });
      ui.flipped = false;
      renderStack();
      const top = $('.tt-card.is-top');
      if (top && !reduce) top.animate([{ opacity: 0, transform: 'translate3d(0, 24px, 0) scale(.96)' }, { opacity: 1, transform: 'none' }], { duration: 380, easing: 'cubic-bezier(.2,.8,.2,1)' });
      if (dir === 'buy' && P.meta.addOnBuy && !wasOwned) toast('옷장에 걸었어요', { act: 'tab-closet', label: '보기' });
      ui.busy = false;
      if (hadFocus && top) top.focus({ preventScroll: true });
      return;
    }
    if (next) {
      next.style.transition = reduce ? 'none' : 'transform 520ms cubic-bezier(.3,1.4,.5,1)';
      requestAnimationFrame(() => setDepth(next, 0));
    }
    if (third) {
      third.style.transition = reduce ? 'none' : 'transform 520ms cubic-bezier(.3,1.3,.5,1) 40ms';
      requestAnimationFrame(() => setDepth(third, 1));
    }
    await fly.finished;
    card.remove();
    advanceStack();
    if (dir === 'buy' && P.meta.addOnBuy && !wasOwned) toast('옷장에 걸었어요', { act: 'tab-closet', label: '보기' });
    ui.busy = false;
    const top = $('.tt-card.is-top');
    if (hadFocus && top) top.focus({ preventScroll: true });
    if (next) setTimeout(() => { if (next.isConnected) next.style.transition = ''; }, 560);
    if (third) setTimeout(() => { if (third.isConnected) third.style.transition = ''; }, 600);
  }

  async function dismissSummary(dir = 'hold', rel = null) {
    const card = $('.tt-card.is-top');
    if (!card || ui.busy) return;
    ui.busy = true;
    cancelAnimationFrame(ui.raf);
    const reduce = rm();
    const cur = rel || (ui.spring ? { x: ui.spring.x, y: ui.spring.y, r: ui.spring.x * 0.055 * ui.spring.sign } : { x: 0, y: 0, r: 0 });
    ui.spring = null;
    const W = card.offsetWidth;
    const H = card.offsetHeight;
    const to = dir === 'buy' ? { x: W * 1.4, y: cur.y, r: 16 } : dir === 'skip' ? { x: -W * 1.4, y: cur.y, r: -16 } : { x: cur.x, y: -H * 1.15, r: 0 };
    const fromT = `translate3d(${cur.x}px, ${cur.y}px, 0) rotate(${cur.r}deg)`;
    const toT = reduce ? fromT : `translate3d(${to.x}px, ${to.y}px, 0) rotate(${to.r}deg)`;
    card.classList.add('is-gone');
    const next = card.parentElement.querySelector('.tt-card[data-depth="1"]');
    if (next) { next.style.transition = reduce ? 'none' : 'transform 460ms cubic-bezier(.3,1.25,.5,1)'; requestAnimationFrame(() => setDepth(next, 0)); }
    await card.animate([{ transform: fromT, opacity: 1 }, { transform: toT, opacity: 0 }], { duration: reduce ? 120 : 280, easing: 'cubic-bezier(.4,0,.7,.4)', fill: 'forwards' }).finished;
    card.remove();
    advanceStack();
    ui.busy = false;
    $('.tt-card.is-top')?.focus({ preventScroll: true });
    if (next) setTimeout(() => { if (next.isConnected) next.style.transition = ''; }, 500);
  }

  // A product from a link or search goes on top of the stack.
  function pushTop(p) {
    ensureQueue();
    ui.queue = [p, ...ui.queue.filter((x) => x.id !== p.id)];
    closeSheet(true);
    if (ui.tab !== 'judge') setTab('judge');
    else { ui.flipped = false; renderStack(); }
    const top = $('.tt-card.is-top');
    if (top && !rm()) {
      top.animate([
        { transform: 'translate3d(0, -56px, 0) scale(1.08) rotate(-3deg)', opacity: 0, easing: 'cubic-bezier(.5,0,.9,.5)' },
        { transform: 'translate3d(0, 4px, 0) scale(.985) rotate(0deg)', opacity: 1, offset: 0.6, easing: 'cubic-bezier(.2,.8,.3,1)' },
        { transform: 'none', opacity: 1 },
      ], { duration: 460 });
      setTimeout(() => P.buzz(10), 270);
    }
    announce(`${p.name}을 맨 위에 올렸어요.`);
  }
  function handleQuery(form) {
    const input = form.querySelector('input');
    const err = form.parentElement.querySelector('.tt-err');
    const list = form.parentElement.querySelector('.tt-results');
    const t = input.value.trim();
    const fail = (msg) => {
      err.textContent = msg;
      if (!rm()) form.animate([{ transform: 'none' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(-2px)' }, { transform: 'none' }], { duration: 260 });
      input.focus();
    };
    if (!t) { fail('링크나 상품 이름을 넣어 주세요.'); return; }
    err.textContent = '';
    if (/https?:\/\/|www\.|musinsa|\/products?\/|^\d{4,}$/i.test(t)) {
      const r = P.fromLink(t);
      if (r.error) { fail(r.error); return; }
      pushTop(r.product);
      return;
    }
    if (!list) { openSheet('link', { q: t }); return; }
    const found = P.search(t, { limit: 12 });
    list.innerHTML = found.length
      ? found.map((p) => `<li><button class="tt-res" data-act="pushpid" data-pid="${esc(p.id)}"><span class="tt-res-ph"><img src="${P.photo(p)}" alt="" loading="lazy"></span><span class="tt-res-t"><small>${esc(p.brand)}</small><b>${esc(p.name)}</b><span>${esc(P.price(p.price))}</span></span>${I.arrU}</button></li>`).join('')
      : `<li class="tt-none">‘${esc(t)}’에 맞는 옷이 없어요. 종류나 색으로 찾아보세요.</li>`;
  }
  function sampleLink() {
    for (const g of P.record.garments) {
      const hit = P.search(P.kindName(g), { limit: 80 }).find((p) => p.slot === g.slot && p.color === g.color && !P.owns(p));
      if (hit) return hit.url;
    }
    return P.ownables(null, { limit: 40 }).find((p) => !P.owns(p))?.url || '';
  }

  // ── 옷장 ─────────────────────────────────────────────
  function closetHTML() {
    const gs = P.record.garments;
    const ready = gs.length ? P.outfits({ limit: 12 }) : [];
    const outfits = ready.length;
    const groups = CATS.map((c) => [c, gs.filter((g) => P.category(g) === c)]).filter(([, l]) => l.length);
    const ex = hasEx();
    const tiles = (list) => list.map((g) => `<li class="tt-tile" data-gid="${esc(g.id)}">
        <div class="tt-tile-ph"><img src="${P.photo(g)}" alt="" loading="lazy" draggable="false">${isEx(g) ? '<span class="tt-ex">예시</span>' : ''}</div>
        <p class="tt-tile-k">${esc(P.shortKind(g))}</p>
        <p class="tt-tile-c"><i style="background:${P.colorHex(g.color)}"></i>${esc(P.colorName(g.color))}</p>
        ${ui.closetEdit ? `<button class="tt-tile-x" data-act="remove" data-gid="${esc(g.id)}" aria-label="${esc(`${P.label(g)} 빼기`)}">${I.minus}</button>` : ''}
      </li>`).join('');
    return `<section class="tt-page tt-closet${ui.closetEdit ? ' is-edit' : ''}">
      <header class="tt-phead">
        <h1 class="tt-ptitle">옷장</h1>
        ${gs.length ? `<button class="tt-textbtn${ui.closetEdit ? ' on' : ''}" data-act="edit" aria-pressed="${ui.closetEdit}">${ui.closetEdit ? '완료' : '편집'}</button>` : ''}
      </header>
      <div class="tt-cstats">
        <p><b>${gs.length}</b><span>벌</span></p>
        <p><b class="${outfits ? 'on' : ''}">${outfits}</b><span>지금 되는 코디</span></p>
      </div>
      <button class="tt-addbtn" data-act="add">${I.plus}<span>옷 추가</span></button>
      ${ex ? '<p class="tt-exnote"><span class="tt-ex">예시</span>표시는 예시 옷장에서 온 옷이에요. 편집에서 빼고 가진 옷을 걸어 보세요.</p>' : ''}
      ${ready.length ? `<section class="tt-ready" aria-label="지금 입을 수 있는 코디">
          <h2><span>지금 입을 수 있는 코디</span><b>${ready.length}</b></h2>
          <ul class="tt-boards">${ready.map((o) => `<li class="tt-mb">
            <p class="tt-mb-t">${esc(o.title)}</p>
            ${o.note ? `<p class="tt-mb-n">${esc(o.note)}</p>` : ''}
            <ol class="tt-strip is-mini">${o.pieces.map((it) => `<li class="tt-pc"><span class="tt-pc-ph"><img src="${P.photo(it.garment)}" alt="" loading="lazy"></span><span class="tt-pc-r">${esc(it.roleName)}</span><span class="tt-pc-o">${esc(P.shortKind(it.garment))}</span></li>`).join('')}</ol>
          </li>`).join('')}</ul>
        </section>` : ''}
      ${groups.length ? groups.map(([c, l]) => `<section class="tt-cgroup" aria-label="${esc(P.cats[c])}">
          <h2><span>${esc(P.cats[c])}</span><b>${l.length}</b></h2>
          <ul class="tt-cgrid">${tiles(l)}</ul>
        </section>`).join('') : '<div class="tt-cempty"><p class="tt-cempty-k">옷장이 비었어요</p><p>가진 옷을 걸어야 판정할 수 있어요.</p></div>'}
      <section class="tt-settings" aria-label="설정">
        <h2>설정</h2>
        <p class="tt-set-row"><span>${P.record.gender === 'F' ? '여성' : '남성'} 옷장</span><span>기록은 이 브라우저에만 남아요</span></p>
        ${ui.confirmReset
          ? `<div class="tt-confirm" role="group" aria-label="처음부터 다시"><p>옷장과 도장 기록이 모두 지워져요.</p><div><button class="tt-danger" data-act="reset-yes">지우고 처음으로</button><button class="tt-ghostbtn" data-act="reset-no">취소</button></div></div>`
          : '<button class="tt-resetbtn" data-act="reset">처음부터 다시</button>'}
      </section>
    </section>`;
  }

  // ── 도장 ─────────────────────────────────────────────
  function recordsHTML() {
    const ds = [...P.record.decisions].sort((a, b) => String(b.at).localeCompare(String(a.at)));
    const c = { buy: 0, hold: 0, skip: 0 };
    ds.forEach((d) => { c[d.decision] = (c[d.decision] || 0) + 1; });
    const skips = ds.filter((d) => d.decision === 'skip' && Number.isFinite(d.price));
    const skipSum = skips.reduce((s, d) => s + d.price, 0);
    const list = ds.filter((d) => ui.recFilter === 'all' || d.decision === ui.recFilter);
    const chip = (id, label, n) => `<button class="tt-chip" data-act="rfilter" data-f="${id}" aria-pressed="${ui.recFilter === id}">${label}<b>${n}</b></button>`;
    const cards = list.map((d) => {
      const p = P.product(d.productId);
      if (!p) return '';
      return `<li><button class="tt-mini" data-act="rec" data-pid="${esc(p.id)}" aria-label="${esc(`${PLAIN[d.decision]} 도장, ${p.brand} ${p.name}`)}">
        <span class="tt-mini-ph"><img src="${P.photo(p)}" alt="" loading="lazy" draggable="false"><span class="tt-mstamp is-${d.decision}">${WORD[d.decision]}</span></span>
        <span class="tt-mini-b">${esc(p.brand)}</span>
        <span class="tt-mini-n">${esc(p.name)}</span>
        <span class="tt-mini-p"><b>${esc(P.price(d.price ?? p.price))}</b><span>${md(d.at)}</span></span>
      </button></li>`;
    }).join('');
    return `<section class="tt-page tt-records">
      <header class="tt-phead"><h1 class="tt-ptitle">도장</h1><p class="tt-psub">${ds.length ? `판정한 옷 ${ds.length}벌` : ''}</p></header>
      <div class="tt-counters">
        <p class="is-buy"><span>딱</span><b>${c.buy}</b></p>
        <p class="is-hold"><span>잠깐</span><b>${c.hold}</b></p>
        <p class="is-skip"><span>패스</span><b>${c.skip}</b></p>
      </div>
      ${skips.length ? `<p class="tt-skipsum"><span>패스한 옷의 기록 가격 합계</span><b>${esc(P.price(skipSum))}</b></p><p class="tt-skipnote">판정할 때 기록한 가격을 더했어요. 지금 가격과 다를 수 있어요.</p>` : ''}
      ${ds.length ? `<div class="tt-chips tt-rchips" role="group" aria-label="도장으로 거르기">${chip('all', '전체', ds.length)}${chip('buy', '딱', c.buy)}${chip('hold', '잠깐', c.hold)}${chip('skip', '패스', c.skip)}</div>
        ${list.length ? `<ul class="tt-rgrid">${cards}</ul>` : '<p class="tt-none tt-rnone">이 도장은 아직 없어요.</p>'}`
        : `<div class="tt-rempty"><span class="tt-mstamp is-hold tt-rempty-s">?</span><p class="tt-rempty-k">아직 찍은 도장이 없어요</p><p>후보를 넘기면 여기에 쌓여요.</p><button class="tt-cta" data-act="tab-judge">판정하러 가기</button></div>`}
    </section>`;
  }

  // ── sheets ───────────────────────────────────────────
  function sheetBody() {
    const s = ui.sheet;
    if (s.type === 'link') {
      return `<div class="tt-sheet-head"><h2 id="tt-sh-t">링크로 판정</h2><button class="tt-iconbtn" data-act="close" aria-label="닫기">${I.x}</button></div>
        <p class="tt-sheet-sub">무신사 상품 링크를 붙여넣으면 맨 위 카드로 올려요. 이름으로 찾아도 돼요.</p>
        <form class="tt-linkform" data-form="link" novalidate>
          <label class="sr-only" for="tt-link-q">상품 링크 또는 이름</label>
          <input id="tt-link-q" name="q" type="text" autocomplete="off" spellcheck="false" placeholder="musinsa.com/products/… 또는 이름" enterkeyhint="go" value="${esc(s.q || '')}">
          <button type="submit" class="tt-go">판정</button>
        </form>
        <p class="tt-err" role="alert"></p>
        <button class="tt-sample" data-act="sample">${I.link}<span>예시 링크 넣기</span></button>
        <ul class="tt-results" aria-label="찾은 옷"></ul>`;
    }
    if (s.type === 'rec') {
      const p = P.product(s.pid);
      const cur = P.decisionOf(p);
      const d = P.record.decisions.find((x) => x.productId === p.id);
      return `<div class="tt-sheet-head"><h2 id="tt-sh-t">도장 기록</h2><button class="tt-iconbtn" data-act="close" aria-label="닫기">${I.x}</button></div>
        <div class="tt-rec-hero">
          <div class="tt-rec-ph"><img src="${P.photo(p)}" alt="">${cur ? `<span class="tt-mstamp is-${cur}">${WORD[cur]}</span>` : ''}</div>
          <div class="tt-rec-t"><small>${esc(p.brand)}</small><b>${esc(p.name)}</b><span>${esc(P.price(d?.price ?? p.price))}${d ? ` · ${md(d.at)} 판정` : ''}</span></div>
        </div>
        <p class="tt-rec-q">도장 바꾸기</p>
        <div class="tt-seg" role="group" aria-label="도장 바꾸기">${['skip', 'hold', 'buy'].map((x) => `<button class="tt-seg-b is-${x}" data-act="restamp" data-d="${x}" data-pid="${esc(p.id)}" aria-pressed="${cur === x}">${WORD[x]}</button>`).join('')}</div>
        <p class="tt-rec-now">지금 옷장 기준으로 다시 읽은 판정이에요.</p>
        ${evidenceHTML(judgeOf(p))}`;
    }
    if (s.type === 'add') {
      const cats = catsWithItems();
      if (!ui.addCat || !cats.includes(ui.addCat)) ui.addCat = cats[0];
      return `<div class="tt-sheet-head"><h2 id="tt-sh-t">옷 추가</h2><button class="tt-textbtn on" data-act="close">완료</button></div>
        <p class="tt-sheet-sub">가진 옷과 종류·색이 비슷한 걸 탭하세요. 다시 탭하면 빠져요.</p>
        <div class="tt-chips" role="tablist" aria-label="종류" id="tt-add-chips">${chipsHTML(cats, ui.addCat, 'add-cat', (c) => P.record.garments.filter((g) => P.category(g) === c).length)}</div>
        <div class="tt-pgrid" id="tt-add-grid">${pickGridHTML(ui.addCat, (p) => P.owns(p), 'add-pick')}</div>`;
    }
    return '';
  }
  function openSheet(type, data = {}) {
    ui.lastFocus = document.activeElement;
    ui.sheet = { type, ...data };
    const root = $('#tt-sheets');
    root.innerHTML = `<div class="tt-scrim" data-act="close"></div><div class="tt-sheet is-${type}" role="dialog" aria-modal="true" aria-labelledby="tt-sh-t"><div class="tt-grab" aria-hidden="true"></div>${sheetBody()}</div>`;
    const sheet = $('.tt-sheet', root);
    if (!rm()) {
      sheet.animate([{ transform: 'translate3d(0, 100%, 0)' }, { transform: 'none' }], { duration: 380, easing: 'cubic-bezier(.2,.9,.25,1)' });
      $('.tt-scrim', root).animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260 });
    }
    const input = $('input', sheet);
    if (input) { input.focus({ preventScroll: true }); if (data.q) handleQuery($('form', sheet)); }
    else $('button', sheet)?.focus({ preventScroll: true });
  }
  function refreshSheet() {
    const sheet = $('.tt-sheet');
    if (!sheet || !ui.sheet) return;
    const top = sheet.scrollTop;
    sheet.innerHTML = `<div class="tt-grab" aria-hidden="true"></div>${sheetBody()}`;
    sheet.scrollTop = top;
  }
  async function closeSheet(fast = false) {
    const root = $('#tt-sheets');
    if (!ui.sheet) return;
    const type = ui.sheet.type;
    ui.sheet = null;
    const sheet = $('.tt-sheet', root);
    if (sheet && !rm() && !fast) {
      $('.tt-scrim', root)?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, fill: 'forwards' });
      await sheet.animate([{ transform: 'none' }, { transform: 'translate3d(0, 100%, 0)' }], { duration: 240, easing: 'cubic-bezier(.4,0,.8,.4)', fill: 'forwards' }).finished;
    }
    root.innerHTML = '';
    if (type === 'add' || type === 'rec') renderView({ keepScroll: true });
    if (!fast && ui.lastFocus?.isConnected) ui.lastFocus.focus({ preventScroll: true });
  }

  function toast(msg, action = null) {
    const t = $('#tt-toast');
    t.innerHTML = `${I.hanger}<span>${esc(msg)}</span>${action ? `<button data-act="${action.act}">${esc(action.label)}</button>` : ''}`;
    t.classList.remove('on');
    void t.offsetWidth;
    t.classList.add('on');
    clearTimeout(ui.toastT);
    ui.toastT = setTimeout(() => t.classList.remove('on'), 2600);
  }

  // ── events ───────────────────────────────────────────
  function snap(el) {
    if (rm()) return;
    el.animate([{ transform: 'scale(.92)' }, { transform: 'scale(1.03)', offset: 0.6 }, { transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.2,.8,.3,1)' });
  }
  function swapChips(container, cur) {
    $$('.tt-chip', container).forEach((b) => b.setAttribute('aria-selected', String(b.dataset.c === cur)));
  }
  const actions = {
    gender(el) {
      P.start(el.dataset.g);
      store.set('onb', true);
      ui.picks = new Map(); ui.pickCat = null;
      route();
      window.scrollTo(0, 0);
      if (!rm()) $('.tt-onb')?.animate([{ opacity: 0, transform: 'translateX(24px)' }, { opacity: 1, transform: 'none' }], { duration: 360, easing: 'cubic-bezier(.2,.8,.2,1)' });
    },
    'onb-back'() { P.reset(); store.del('onb'); route(); },
    'onb-cat'(el) {
      ui.pickCat = el.dataset.c;
      swapChips($('#tt-onb-chips'), ui.pickCat);
      $('#tt-onb-grid').innerHTML = pickGridHTML(ui.pickCat, (p) => ui.picks.has(p.id), 'onb-pick');
    },
    'onb-pick'(el) {
      const p = P.product(el.dataset.pid);
      if (!p) return;
      if (ui.picks.has(p.id)) ui.picks.delete(p.id); else { ui.picks.set(p.id, p); P.buzz(8); }
      el.setAttribute('aria-pressed', String(ui.picks.has(p.id)));
      snap(el);
      $('#tt-onb-chips').innerHTML = chipsHTML(catsWithItems(), ui.pickCat, 'onb-cat', pickedIn);
      const done = $('#tt-onb-done');
      done.disabled = !ui.picks.size;
      done.textContent = onbDoneLabel();
    },
    'onb-done'() {
      if (!ui.picks.size) return;
      ui.picks.forEach((p) => P.addOwned(p));
      EX = new Set(); saveEx();
      store.del('onb');
      ui.picks = new Map(); ui.queue = null; ui.tab = 'judge';
      route();
    },
    'onb-example'() {
      P.startExample(P.record.gender || 'M');
      EX = new Set(P.record.garments.map((g) => g.productId)); saveEx();
      store.del('onb');
      ui.queue = null; ui.tab = 'judge';
      route();
    },
    tab(el) { if (el.dataset.t !== ui.tab) setTab(el.dataset.t); else if (ui.tab !== 'judge') $('#tt-view').scrollTo({ top: 0, behavior: rm() ? 'auto' : 'smooth' }); },
    'tab-closet'() { $('#tt-toast').classList.remove('on'); setTab('closet'); },
    'tab-judge'() { setTab('judge'); },
    flip() { flip(); },
    decide(el) { commit(el.dataset.d); },
    link() { openSheet('link'); },
    close() { closeSheet(); },
    sample() {
      const input = $('#tt-link-q');
      input.value = sampleLink();
      input.focus();
      $('.tt-sheet .tt-err').textContent = '';
    },
    continue() { dismissSummary('hold'); },
    pushpid(el) { const p = P.product(el.dataset.pid); if (p) pushTop(p); },
    reload() {
      ui.queue = buildQueue();
      ui.session = [];
      renderStack();
      if (!ui.queue.length) {
        const err = $('.tt-done .tt-err');
        if (err) err.textContent = '새 후보가 없어요. 옷장에 옷을 더 걸거나 링크로 판정해 보세요.';
      } else if (!rm()) {
        $$('.tt-card').reverse().forEach((c, i) => c.animate([{ opacity: 0, transform: `translate3d(0, 40px, 0) scale(.94)` }, { opacity: 1 }], { duration: 420, delay: i * 70, easing: 'cubic-bezier(.2,.9,.3,1.1)', fill: 'backwards', composite: 'add' }));
      }
    },
    edit() { ui.closetEdit = !ui.closetEdit; ui.confirmReset = false; renderView({ keepScroll: true }); },
    async remove(el) {
      const g = P.record.garments.find((x) => x.id === el.dataset.gid);
      if (!g) return;
      const tile = el.closest('.tt-tile');
      if (!rm() && tile) await tile.animate([{ transform: 'none', opacity: 1 }, { transform: 'scale(.6) rotate(-6deg)', opacity: 0 }], { duration: 200, easing: 'cubic-bezier(.4,0,.8,.4)', fill: 'forwards' }).finished;
      P.removeOwned(g.id);
      EX.delete(g.productId); saveEx();
      if (!P.record.garments.length) ui.closetEdit = false;
      renderView({ keepScroll: true });
      announce(`${P.label(g)}을 옷장에서 뺐어요.`);
    },
    add() { openSheet('add'); },
    'add-cat'(el) {
      ui.addCat = el.dataset.c;
      swapChips($('#tt-add-chips'), ui.addCat);
      $('#tt-add-grid').innerHTML = pickGridHTML(ui.addCat, (p) => P.owns(p), 'add-pick');
      $('.tt-sheet').scrollTop = 0;
    },
    'add-pick'(el) {
      const p = P.product(el.dataset.pid);
      if (!p) return;
      if (P.owns(p)) { P.removeOwned(p.id); EX.delete(p.id); saveEx(); } else { P.addOwned(p); P.buzz(8); }
      el.setAttribute('aria-pressed', String(P.owns(p)));
      snap(el);
      $('#tt-add-chips').innerHTML = chipsHTML(catsWithItems(), ui.addCat, 'add-cat', (c) => P.record.garments.filter((g) => P.category(g) === c).length);
    },
    reset() { ui.confirmReset = true; renderView({ keepScroll: true }); $('.tt-danger')?.focus({ preventScroll: true }); },
    'reset-no'() { ui.confirmReset = false; renderView({ keepScroll: true }); },
    'reset-yes'() {
      P.reset();
      store.del('ex'); store.del('onb'); EX = new Set();
      Object.assign(ui, { tab: 'judge', queue: null, flipped: false, busy: false, session: [], closetEdit: false, confirmReset: false, recFilter: 'all', picks: new Map(), pickCat: null, addCat: null });
      route();
    },
    rfilter(el) { ui.recFilter = el.dataset.f; renderView({ keepScroll: true }); },
    rec(el) { openSheet('rec', { pid: el.dataset.pid }); },
    restamp(el) {
      const p = P.product(el.dataset.pid);
      const d = el.dataset.d;
      if (!p || P.decisionOf(p) === d) return;
      const wasOwned = P.owns(p);
      P.decide(p, d);
      P.buzz(15);
      refreshSheet();
      const st = $('.tt-rec-ph .tt-mstamp');
      if (st && !rm()) st.animate([{ transform: 'scale(1.7) rotate(-12deg)', opacity: 0 }, { transform: 'scale(.95) rotate(-12deg)', opacity: 1, offset: 0.65 }, { transform: 'rotate(-12deg)', opacity: 1 }], { duration: 280, easing: 'cubic-bezier(.55,0,.6,1)' });
      if (d === 'buy' && P.meta.addOnBuy && !wasOwned) toast('옷장에 걸었어요');
      $(`.tt-seg-b[data-d="${d}"]`)?.focus({ preventScroll: true });
    },
  };

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    const fn = actions[el.dataset.act];
    if (!fn) return;
    e.preventDefault();
    fn(el, e);
  });
  document.addEventListener('submit', (e) => {
    const form = e.target.closest('[data-form="link"]');
    if (!form) return;
    e.preventDefault();
    handleQuery(form);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && ui.sheet) { e.preventDefault(); closeSheet(); return; }
    if (ui.sheet || ui.tab !== 'judge' || !$('#tt-stack') || e.target.closest?.('input, textarea')) return;
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const map = { ArrowRight: 'buy', ArrowLeft: 'skip', ArrowUp: 'hold' };
    if (map[e.key] && ui.queue?.length && !ui.busy) { e.preventDefault(); commit(map[e.key]); return; }
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList?.contains('tt-card')) { e.preventDefault(); flip(); }
  });

  route();
})();
