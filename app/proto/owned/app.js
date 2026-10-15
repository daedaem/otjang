// Owned — Before you buy, see what you own. 사기 전에, 가진 옷부터.
// 밝은 무대 위 후보 하나, 그리고 판단이 타일 하나씩 맞춰지는 벤토 그리드.
(() => {
  const P = Proto;
  const root = document.getElementById('app');
  const esc = P.esc;
  const IC = {
    back: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.5 5.5L8 12l6.5 6.5"/></svg>',
    out: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 16L16 8M10 8h6v6"/></svg>',
    chev: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.5 6l6 6-6 6"/></svg>',
    check: '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M7.5 12.3l3 3 6-6.3"/></svg>',
    tick: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5.5 12.5l4 4L18.5 7.5"/></svg>',
    close: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17"/></svg>',
  };

  // ── 기록과 계산
  const gs = () => P.record.garments;
  const isEx = (g) => (P.record.exampleIds || []).includes(g.id);
  let memo = { key: null };
  function mm() {
    const key = `${gs().map((g) => g.id).join(',')}|${P.record.decisions.map((d) => d.productId + d.decision).join(',')}`;
    if (memo.key !== key) memo = { key, cands: null, judged: new Map() };
    return memo;
  }
  const cands = () => { const c = mm(); if (!c.cands) c.cands = P.candidates({ limit: 12 }); return c.cands; };
  const judgeOf = (p) => { const c = mm(); if (!c.judged.has(p.id)) c.judged.set(p.id, P.judge(p)); return c.judged.get(p.id); };
  const catName = (x) => P.cats[P.category(x)] || '';
  const pic = (x, cls = '') => `<img class="${cls}" src="${esc(P.photo(x))}" alt="" loading="lazy" draggable="false">`;
  const plural = (n, one, many) => (n === 1 ? one : many);

  const ui = { view: P.record.started ? 'home' : 'welcome', pid: null, from: 'home', gender: null, addCat: 'top', resetAsk: false };

  // ── 첫 실행
  function welcome() {
    return `<main class="welcome">
      <div class="w-top">
        <p class="w-mark">Owned</p>
        <h1 class="w-tag">Before you buy,<br>see what you own.</h1>
        <p class="w-sub">사기 전에, 가진 옷부터.</p>
      </div>
      <div class="w-bottom">
        <p class="w-q" id="wq">어떤 옷장으로 볼까요?</p>
        <div class="seg" role="radiogroup" aria-labelledby="wq">
          ${[['M', '남성'], ['F', '여성']].map(([g, l]) => `<button class="seg-b${ui.gender === g ? ' on' : ''}" role="radio" aria-checked="${ui.gender === g}" data-act="gender" data-g="${g}">${l}</button>`).join('')}
        </div>
        <button class="btn-primary wide" data-act="start-example" ${ui.gender ? '' : 'disabled'}>예시 옷장으로 시작</button>
        <button class="btn-link" data-act="start-own" ${ui.gender ? '' : 'disabled'}>가진 옷 직접 고르기</button>
        <p class="w-fine">기록은 이 기기에만 저장돼요.</p>
      </div>
    </main>`;
  }

  function topbar() {
    const n = gs().length;
    return `<header class="bar"><div class="bar-in">
      <button class="bar-mark" data-act="go" data-v="home" aria-label="Owned 홈">Owned</button>
      <nav class="bar-nav" aria-label="화면">
        <button class="bar-l${ui.view === 'home' || ui.view === 'judge' ? ' on' : ''}" data-act="go" data-v="home">둘러보기</button>
        <button class="bar-l${ui.view === 'closet' ? ' on' : ''}" data-act="go" data-v="closet">옷장 <span class="bar-n">${n}</span></button>
      </nav>
    </div></header>`;
  }

  // ── 홈
  function home() {
    const list = cands();
    const top = list[0];
    if (!top) {
      return `<main class="page"><section class="hero empty"><p class="eyebrow">All caught up</p><h1 class="h-xl">지금은 볼 후보가 없어요.</h1><p class="sub">옷장에 옷을 더 담으면 새 후보가 생겨요.</p><button class="btn-primary" data-act="go" data-v="closet">옷장 열기</button></section></main>`;
    }
    const tj = judgeOf(top);
    const rest = list.slice(1);
    return `<main class="page">
      <section class="hero" aria-labelledby="heroH">
        <p class="eyebrow">Top pick for your closet</p>
        <h1 class="h-xl" id="heroH">이 ${esc(P.shortKind(top))},<br>내 옷장과 맞을까요?</h1>
        <p class="hero-name">${esc(top.brand || '')} · ${esc(top.name)}</p>
        <div class="hero-cta"><button class="btn-primary" data-act="judge" data-pid="${esc(top.id)}">맞춰 보기</button><span class="hero-price">${esc(P.price(top.price))}</span></div>
        <div class="hero-stage">${pic(top, 'hero-img')}</div>
        <p class="hero-hint">${tj.used.length ? `가진 옷 ${tj.used.length}벌과 함께 입을 수 있어요` : '가진 옷과 맞춰 볼게요'}</p>
      </section>
      ${rest.length ? `<section class="rail-sec" aria-labelledby="railH">
        <div class="sec-h"><h2 class="h-l latin" id="railH">More to consider</h2><p class="sub">지금 옷장 기준으로 골랐어요.</p></div>
        <div class="rail">${rest.map((p) => { const j = judgeOf(p); return `<button class="rcard" data-act="judge" data-pid="${esc(p.id)}">
          <span class="rc-stage">${pic(p)}</span>
          <span class="rc-k">${esc(catName(p))} · ${esc(P.colorName(p.color))}</span>
          <span class="rc-n">${esc(p.name)}</span>
          <span class="rc-p">${esc(P.price(p.price))}</span>
          <span class="rc-f ${j.verdict}">${j.verdict === 'overlap' ? '비슷한 옷 있음' : `Pairs with ${j.used.length}`}</span>
        </button>`; }).join('')}</div>
      </section>` : ''}
    </main>`;
  }

  // ── 판단: 벤토 그리드가 타일 하나씩 맞춰진다
  function judge() {
    const p = P.product(ui.pid);
    if (!p) { ui.view = 'home'; return home(); }
    const j = judgeOf(p);
    const head = j.verdict === 'yes' ? '가진 옷과 잘 어울려요.' : j.verdict === 'overlap' ? '비슷한 옷이 이미 있어요.' : '아직 맞춰 볼 옷이 없어요.';
    const ex = gs().some(isEx);
    const used = j.used;
    const tileUsed = `<article class="tile t-wide" style="--i:0">
      <p class="t-eye latin">Pairs with</p>
      <p class="t-big"><span class="num">${used.length}</span> <span class="latin">${plural(used.length, 'piece', 'pieces')} you own</span></p>
      ${used.length ? `<ul class="t-photos">${used.map((g, k) => `<li style="--k:${k}"><span class="tp-stage">${pic(g)}</span><span class="tp-k">${esc(P.shortKind(g))}</span></li>`).join('')}</ul>`
        : '<p class="t-cap">함께 입을 옷을 아직 못 찾았어요. 옷장에 옷을 더 담아 보세요.</p>'}
      ${ex && used.length ? '<p class="t-fine">예시 옷장 기준</p>' : ''}
    </article>`;
    const tileLooks = `<article class="tile" style="--i:1">
      <p class="t-eye latin">Outfits</p>
      <p class="t-big"><span class="num">${j.looks.length}</span> <span class="latin">${plural(j.looks.length, 'outfit', 'outfits')}</span></p>
      ${j.looks.length ? `<ul class="t-list">${j.looks.slice(0, 3).map((l) => `<li>${esc(l.title)}${l.isNew ? ' <b class="new latin">New</b>' : ''}</li>`).join('')}</ul>` : '<p class="t-cap">맞는 코디 공식이 아직 없어요.</p>'}
    </article>`;
    const tileDup = j.overlaps.length
      ? `<article class="tile warn" style="--i:2"><p class="t-eye latin">Duplicates</p><p class="t-big"><span class="num">${j.overlaps.length}</span><span>벌</span></p><p class="t-cap">비슷한 옷 ${j.overlaps.length}벌<br>${esc(j.overlaps.map((g) => `${P.shortKind(g)} ${P.colorName(g.color)}`).join(', '))}</p><div class="t-mini">${j.overlaps.slice(0, 3).map((g) => `<span class="tp-stage sm">${pic(g)}</span>`).join('')}</div></article>`
      : `<article class="tile" style="--i:2"><p class="t-eye latin">Duplicates</p><span class="t-check">${IC.check}</span><p class="t-mid latin">No duplicates</p><p class="t-cap">겹치는 옷이 없어요.</p></article>`;
    const tilePrice = `<article class="tile t-wide" style="--i:3">
      <div class="t-row"><div><p class="t-eye latin">Price</p><p class="t-price">${esc(P.price(p.price))}</p><p class="t-cap">${p.checkedAt ? `${esc(p.checkedAt.slice(5).replace('-', '.'))} 기록 가격` : '기록 가격'}</p></div>
      <a class="link" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">판매처에서 확인하기${IC.out}</a></div>
      <p class="t-note">코디는 종류·색으로 맞춘 공식이에요. 핏·사이즈·소재·현재 가격은 판매처에서 확인해 주세요.</p>
    </article>`;
    const dec = P.decisionOf(p);
    return `<main class="page judge">
      <button class="back" data-act="go" data-v="${ui.from}">${IC.back}${ui.from === 'closet' ? '옷장' : '둘러보기'}</button>
      <section class="j-hero">
        <div class="j-stage">${pic(p, 'j-img')}</div>
        <p class="eyebrow">${esc(catName(p))} · ${esc(P.colorName(p.color))}</p>
        <h1 class="h-xl">${head}</h1>
        <p class="j-name">${esc(p.brand || '')} · ${esc(p.name)}</p>
        ${dec ? `<p class="j-dec">지난 선택: ${dec === 'buy' ? '살게요' : dec === 'hold' ? '나중에' : '안 살게요'}</p>` : ''}
      </section>
      <section class="bento" aria-label="판단 근거">${tileUsed}${tileLooks}${tileDup}${tilePrice}</section>
      <div class="dbar" role="group" aria-label="결정"><div class="dbar-in">
        <button class="btn-primary grow" data-act="decide" data-d="buy">살게요</button>
        <button class="btn-soft" data-act="decide" data-d="hold">나중에</button>
        <button class="btn-soft" data-act="decide" data-d="skip">안 살게요</button>
      </div></div>
    </main>`;
  }

  // ── 옷장 (대략)
  function closet() {
    const list = gs();
    const ex = list.some(isEx);
    const cats = Object.keys(P.cats).filter((c) => P.ownables(c, { limit: 1 }).length);
    if (!cats.includes(ui.addCat)) ui.addCat = cats[0];
    return `<main class="page">
      <section class="c-head"><p class="eyebrow latin">Your closet</p><h1 class="h-xl">내 옷장 ${list.length}벌</h1>${ex ? '<p class="sub">예시 옷장이에요. 내 옷으로 바꿔 담아 보세요.</p>' : ''}</section>
      ${list.length ? `<ul class="cgrid">${list.map((g) => `<li class="ccard">
        <span class="cc-stage">${pic(g)}</span>
        <span class="cc-k">${esc(P.shortKind(g))} · ${esc(P.colorName(g.color))}${isEx(g) ? ' · 예시' : ''}</span>
        <span class="cc-n">${esc(P.label(g))}</span>
        <button class="cc-x" data-act="remove" data-id="${esc(g.id)}" aria-label="${esc(P.label(g))} 빼기">${IC.close}</button>
      </li>`).join('')}</ul>` : '<p class="sub pad">아직 담은 옷이 없어요. 아래에서 닮은 옷을 골라 주세요.</p>'}
      <section class="add" aria-labelledby="addH">
        <div class="sec-h"><h2 class="h-l latin" id="addH">Add pieces</h2><p class="sub">가진 옷과 닮은 것을 눌러 담아요.</p></div>
        <div class="chips" role="tablist">${cats.map((c) => `<button class="chip${c === ui.addCat ? ' on' : ''}" role="tab" aria-selected="${c === ui.addCat}" data-act="cat" data-cat="${c}">${esc(P.cats[c])}</button>`).join('')}</div>
        <div class="agrid">${P.ownables(ui.addCat, { limit: 18 }).map((p) => { const on = P.owns(p); return `<button class="acard${on ? ' on' : ''}" data-act="own" data-pid="${esc(p.id)}" aria-pressed="${on}">
          <span class="ac-stage">${pic(p)}<span class="ac-ck">${IC.tick}</span></span><span class="ac-k">${esc(P.shortKind(p))}</span><span class="ac-c">${esc(P.colorName(p.color))}</span></button>`; }).join('')}</div>
      </section>
      <section class="reset">${ui.resetAsk ? '<p>옷장과 기록이 모두 지워져요.</p><div class="r-row"><button class="btn-soft" data-act="reset-no">취소</button><button class="btn-danger" data-act="reset-yes">모두 지우기</button></div>' : '<button class="btn-link sm" data-act="reset-ask">처음부터 다시</button>'}</section>
    </main>`;
  }

  // ── 그리기
  let toastT = 0;
  function toast(msg) {
    let t = document.getElementById('owToast');
    if (!t) { t = document.createElement('div'); t.id = 'owToast'; t.className = 'toast'; t.setAttribute('role', 'status'); t.setAttribute('aria-live', 'polite'); document.body.append(t); }
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2400);
  }
  function render({ scroll = true } = {}) {
    if (!P.record.started) ui.view = 'welcome';
    const body = ui.view === 'welcome' ? welcome() : topbar() + (ui.view === 'judge' ? judge() : ui.view === 'closet' ? closet() : home());
    root.innerHTML = `<div class="ow" data-view="${ui.view}">${body}</div>`;
    if (scroll) window.scrollTo(0, 0);
  }

  root.addEventListener('click', (e) => {
    const t = e.target.closest('[data-act]');
    if (!t || t.disabled) return;
    const a = t.dataset.act;
    if (a === 'gender') { ui.gender = t.dataset.g; render({ scroll: false }); }
    else if (a === 'start-example') { P.startExample(ui.gender); P.record.exampleIds = gs().map((g) => g.id); P.save(); ui.view = 'home'; render(); }
    else if (a === 'start-own') { P.start(ui.gender); ui.view = 'closet'; ui.addCat = 'top'; render(); }
    else if (a === 'go') { ui.view = t.dataset.v; ui.resetAsk = false; render(); }
    else if (a === 'judge') { ui.from = ui.view === 'closet' ? 'closet' : 'home'; ui.pid = t.dataset.pid; ui.view = 'judge'; render(); }
    else if (a === 'decide') {
      const p = P.product(ui.pid); if (!p) return;
      P.decide(p, t.dataset.d); P.buzz(12);
      ui.view = 'home'; render();
      toast(t.dataset.d === 'buy' ? '옷장에 담았어요' : t.dataset.d === 'hold' ? '나중에 다시 볼게요' : '안 사기로 했어요');
    }
    else if (a === 'remove') { P.removeOwned(t.dataset.id); render({ scroll: false }); toast('옷장에서 뺐어요'); }
    else if (a === 'cat') { ui.addCat = t.dataset.cat; render({ scroll: false }); }
    else if (a === 'own') {
      const p = P.product(t.dataset.pid); if (!p) return;
      if (P.owns(p)) { const g = gs().find((x) => x.productId === p.id); if (g) P.removeOwned(g.id); } else P.addOwned(p);
      render({ scroll: false });
    }
    else if (a === 'reset-ask') { ui.resetAsk = true; render({ scroll: false }); }
    else if (a === 'reset-no') { ui.resetAsk = false; render({ scroll: false }); }
    else if (a === 'reset-yes') { P.reset(); Object.assign(ui, { view: 'welcome', gender: null, resetAsk: false }); render(); }
  });

  render();
})();
