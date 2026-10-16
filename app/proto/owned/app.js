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
    plus: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    close: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17"/></svg>',
  };

  // ── 기록과 계산
  const gs = () => P.record.garments;
  const isEx = (g) => (P.record.exampleIds || []).includes(g.id);
  let memo = { key: null };
  function mm() {
    const key = `${gs().map((g) => g.id).join(',')}|${P.record.decisions.map((d) => d.productId + d.decision).join(',')}`;
    if (memo.key !== key) memo = { key, cands: null, needs: null, judged: new Map() };
    return memo;
  }
  const cands = () => { const c = mm(); if (!c.cands) c.cands = P.candidates({ limit: 12 }); return c.cands; };
  const needsM = () => { const c = mm(); if (!c.needs) c.needs = P.needs({ limit: 4 }); return c.needs; };
  const judgeOf = (p) => { const c = mm(); if (!c.judged.has(p.id)) c.judged.set(p.id, P.judge(p)); return c.judged.get(p.id); };
  const catName = (x) => P.cats[P.category(x)] || '';
  const pic = (x, cls = '') => `<img class="${cls}" src="${esc(P.photo(x))}" alt="" loading="lazy" draggable="false">`;
  const plural = (n, one, many) => (n === 1 ? one : many);

  const ui = { view: P.record.started ? 'home' : 'welcome', pid: null, from: 'home', gender: null, addCat: 'top', resetAsk: false, gapIdx: 0, sel: {}, justFilled: false };

  // ── 첫 실행
  function welcome() {
    return `<main class="welcome">
      <div class="w-top">
        <p class="w-mark">Owned</p>
        <h1 class="w-tag">사기 전에,<br>가진 옷부터.</h1>
      </div>
      <div class="w-bottom">
        <p class="w-q" id="wq">어떤 옷장으로 볼까요?</p>
        <div class="seg" role="radiogroup" aria-labelledby="wq">
          ${[['M', '남성'], ['F', '여성']].map(([g, l]) => `<button class="seg-b${ui.gender === g ? ' on' : ''}" role="radio" aria-checked="${ui.gender === g}" data-act="gender" data-g="${g}">${l}</button>`).join('')}
        </div>
        <button class="btn-primary wide" data-act="start-own" ${ui.gender ? '' : 'disabled'}>내 옷 넣고 시작</button>
        <button class="btn-link" data-act="start-example" ${ui.gender ? '' : 'disabled'}>예시 옷장으로 둘러보기</button>
        <p class="w-fine">기록은 이 기기에만 저장돼요.</p>
      </div>
    </main>`;
  }

  function topbar() {
    const n = gs().length;
    return `<header class="bar"><div class="bar-in">
      <button class="bar-mark" data-act="go" data-v="home" aria-label="Owned 홈">Owned</button>
      <nav class="bar-nav" aria-label="화면">
        <button class="bar-l${ui.view === 'home' || ui.view === 'judge' ? ' on' : ''}" data-act="go" data-v="home">홈</button>
        <button class="bar-l${ui.view === 'closet' ? ' on' : ''}" data-act="go" data-v="closet">옷장 <span class="bar-n">${n}</span></button>
      </nav>
    </div></header>`;
  }

  // ── 전체 코디 보드: 입는 순서대로, 가진 옷은 Owned, 필요한 자리는 빈 칸
  const kindOf = (pc) => (pc.need ? P.shortKind({ slot: pc.slot?.id }) || pc.kind : P.shortKind(pc.garment || pc.product));
  function board(pieces, { candTag = '선택함', fill = false } = {}) {
    const n = pieces.length; const cols = n === 4 ? 2 : Math.max(1, Math.min(3, n));
    return `<ul class="board c${cols}">${pieces.map((pc, k) => {
      if (pc.need) return `<li class="pc need" style="--k:${k}"><span class="pc-stage"><span class="pc-plus">${IC.plus}</span><span class="pc-need">${esc(kindOf(pc))}</span></span><span class="pc-tag">필요해요</span><span class="pc-k">${esc(pc.roleName || '')} · ${esc(kindOf(pc))}</span></li>`;
      const x = pc.garment || pc.product; const cand = !!pc.candidate;
      return `<li class="pc ${cand ? `cand${fill ? ' fill' : ''}` : 'own'}" style="--k:${k}"><span class="pc-stage">${pic(x)}</span><span class="pc-tag">${cand ? candTag : '내 옷'}</span><span class="pc-k">${esc(pc.roleName || catName(x))} · ${esc(P.shortKind(x))}</span></li>`;
    }).join('')}</ul>`;
  }
  const thumbs = (pieces) => `<span class="mini">${pieces.map((pc) => (pc.need ? '<span class="mi need"></span>' : `<span class="mi">${pic(pc.garment || pc.product)}</span>`)).join('')}</span>`;

  // ── 홈: 내 옷장에 필요한 것부터
  function home() {
    if (gs().length < 3) {
      const have = gs();
      const slots = [0, 1, 2].map((i) => have[i]);
      return `<main class="page"><section class="need-hero start" aria-labelledby="startH">
        <p class="eyebrow">내 옷장</p>
        <h1 class="h-xl" id="startH">내 옷부터<br>넣어 주세요.</h1>
        <p class="sub big">옷을 3벌 이상 넣으면, 필요한 옷과 코디를 찾아 드려요.</p>
        <article class="tile t-start">
          <ul class="board c3">${slots.map((g, k) => (g
            ? `<li class="pc own" style="--k:${k}"><span class="pc-stage">${pic(g)}</span><span class="pc-tag">내 옷</span><span class="pc-k">${esc(P.shortKind(g))} · ${esc(P.colorName(g.color))}</span></li>`
            : `<li class="pc need" style="--k:${k}"><button class="pc-stage" data-act="add" aria-label="내 옷 추가"><span class="pc-plus">${IC.plus}</span></button><span class="pc-tag">${k === have.length ? '다음' : '&nbsp;'}</span><span class="pc-k">&nbsp;</span></li>`)).join('')}</ul>
          <p class="t-cap">지금 ${have.length}벌 · ${3 - have.length}벌 더 넣으면 시작돼요</p>
        </article>
        <div class="cta-row"><button class="btn-primary wide" data-act="add">내 옷 추가</button><p class="cta-hint">사진, 종류와 색, 상품 이름 중 편한 방법으로</p></div>
      </section></main>`;
    }
    const N = needsM(); const gaps = N.gaps;
    const ex = gs().some(isEx);
    let hero;
    if (!gaps.length) {
      hero = `<section class="need-hero"><p class="eyebrow">내 옷장에 필요한 옷</p><h1 class="h-xl">지금 옷장으로<br>충분히 입을 수 있어요.</h1><p class="sub">새로 채울 자리가 보이지 않아요. 옷장에 옷을 더 담으면 다시 찾아볼게요.</p><button class="btn-primary" data-act="go" data-v="closet">옷장 열기</button></section>`;
    } else {
      const gi = Math.min(ui.gapIdx, gaps.length - 1); const gap = gaps[gi];
      const look = gap.looks[0];
      const sel = gap.products.find((x) => x.id === ui.sel[gap.kind]) || null;
      const shown = sel && look ? P.fillNeed(look, sel) : look;
      hero = `<section class="need-hero" aria-labelledby="needH">
        <p class="eyebrow">내 옷장에 필요한 옷</p>
        <h1 class="h-xl" id="needH">${esc(gap.short)} 하나면,<br>코디 ${gap.newLooks}개가 더 완성돼요.</h1>
        <p class="sub big">${esc(gap.line)}</p>
        ${look ? `<article class="tile t-board">
          <div class="b-head"><p class="b-title">${esc(look.title)}</p>${gap.looks.length > 1 ? `<span class="b-more">외 ${gap.looks.length - 1}개</span>` : ''}</div>
          ${look.note ? `<p class="b-note">${esc(look.note)}</p>` : ''}
          ${board(shown.pieces, { fill: ui.justFilled })}
          ${ex ? '<p class="t-fine">예시 옷장 기준</p>' : ''}
        </article>` : ''}
        <div class="choose">
          <div class="sec-h row"><h2 class="h-m">하나 골라 보세요</h2><p class="sub sm">${esc(gap.short)} · 실제 상품 ${gap.products.length}개</p></div>
          <div class="rail">${gap.products.slice(0, 4).map((x) => `<button class="rcard${sel && sel.id === x.id ? ' on' : ''}" data-act="pick" data-pid="${esc(x.id)}" aria-pressed="${!!(sel && sel.id === x.id)}">
            <span class="rc-stage">${pic(x)}<span class="rc-ck">${IC.tick}</span></span>
            <span class="rc-k">${esc(x.brand || '')}</span>
            <span class="rc-n">${esc(x.name)}</span>
            <span class="rc-p">${esc(P.price(x.price))}</span>
          </button>`).join('')}</div>
          <div class="cta-row"><button class="btn-primary wide" data-act="judge" data-pid="${sel ? esc(sel.id) : ''}" ${sel ? '' : 'disabled'}>맞춰 보기</button>
          <p class="cta-hint">${sel ? `${esc(P.shortKind(sel))} · ${esc(P.colorName(sel.color))}로 전체 코디를 판단해요` : '하나를 고르면 빈 자리에 채워 보여 드려요'}</p></div>
        </div>
      </section>`;
    }
    const ready = N.ready.filter((o) => o.pieces && o.pieces.length > 1);
    const nextGaps = gaps.map((g, i) => ({ g, i })).filter(({ i }) => i !== Math.min(ui.gapIdx, gaps.length - 1));
    const pairs = N.pairs.filter((pr) => pr.products[0]);
    return `<main class="page">
      ${hero}
      ${ready.length ? `<section class="block" aria-labelledby="readyH"><div class="sec-h"><h2 class="h-l" id="readyH">지금 입을 수 있는 코디</h2><p class="sub">지금 가진 옷으로 바로 입는 코디 ${ready.length}개</p></div>
        <div class="rail">${ready.map((o) => `<article class="rtile"><p class="r-title">${esc(o.title)}</p>${o.note ? `<p class="r-note">${esc(o.note)}</p>` : ''}
          <ul class="r-pcs">${o.pieces.map((pc) => `<li><span class="r-stage">${pic(pc.garment)}</span><span class="r-k">${esc(pc.roleName)}</span></li>`).join('')}</ul></article>`).join('')}</div></section>` : ''}
      ${nextGaps.length || pairs.length ? `<section class="block" aria-labelledby="nextH"><div class="sec-h"><h2 class="h-l" id="nextH">더 있으면 좋은 옷</h2><p class="sub">다음으로 채우면 좋은 자리</p></div>
        <div class="ngrid">
          ${nextGaps.map(({ g, i }) => `<button class="ntile" data-act="gap" data-i="${i}"><span class="t-eye">필요해요 · ${esc(g.short)}</span><span class="n-h">코디 ${g.newLooks}개 더</span><span class="n-line">${esc(g.line)}</span>${g.looks[0] ? thumbs(g.looks[0].pieces) : ''}</button>`).join('')}
          ${pairs.map((pr) => `<button class="ntile" data-act="judge" data-pid="${esc(pr.products[0].id)}"><span class="t-eye">두 벌만 더 있으면</span><span class="n-h">${esc(pr.kinds.join(' + '))}</span><span class="n-line">${esc(pr.line)}</span>${thumbs(pr.look.pieces)}</button>`).join('')}
        </div></section>` : ''}
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
    const look0 = j.looks[0];
    const tileBoard = `<article class="tile t-wide t-board" style="--i:0">
      <p class="t-eye">완성되는 코디</p>
      ${look0 ? `<div class="b-head"><p class="b-title">${esc(look0.title)}</p>${j.looks.length > 1 ? `<span class="b-more">외 ${j.looks.length - 1}개</span>` : ''}</div>${look0.note ? `<p class="b-note">${esc(look0.note)}</p>` : ''}${board(look0.items, { candTag: '이 옷' })}`
        : `<p class="b-title">아직 완성되는 코디가 없어요.</p><p class="b-note">가진 옷과 종류·색이 맞는 공식을 찾지 못했어요. 옷장에 옷을 더 담아 보세요.</p>${board([{ candidate: true, product: p, roleName: catName(p) }], { candTag: '이 옷' })}`}
      ${ex && look0 ? '<p class="t-fine">예시 옷장 기준</p>' : ''}
    </article>`;
    const tileUsed = `<article class="tile" style="--i:1">
      <p class="t-eye">어울리는 내 옷</p>
      <p class="t-big"><span class="t-pre">가진 옷</span><br><span class="num">${used.length}</span>벌과 어울려요</p>
      <p class="t-cap">${used.length ? esc(used.map((g) => P.shortKind(g)).join(' · ')) : '함께 입을 옷을 아직 못 찾았어요.'}</p>
    </article>`;
    const tileLooks = `<article class="tile" style="--i:2">
      <p class="t-eye">완성되는 코디</p>
      <p class="t-big"><span class="t-pre">코디</span><br><span class="num">${j.looks.length}</span>개</p>
      ${j.looks.length ? `<ul class="t-list">${j.looks.slice(0, 3).map((l) => `<li>${esc(l.title)}${l.isNew ? ' <b class="new">새 코디</b>' : ''}</li>`).join('')}</ul>` : '<p class="t-cap">맞는 코디 공식이 아직 없어요.</p>'}
    </article>`;
    const tileDup = j.overlaps.length
      ? `<article class="tile t-wide warn" style="--i:3"><p class="t-eye">겹치는 옷</p><p class="t-big"><span class="num">${j.overlaps.length}</span><span>벌</span></p><p class="t-cap">비슷한 옷 ${j.overlaps.length}벌<br>${esc(j.overlaps.map((g) => `${P.shortKind(g)} ${P.colorName(g.color)}`).join(', '))}</p><div class="t-mini">${j.overlaps.slice(0, 3).map((g) => `<span class="tp-stage sm">${pic(g)}</span>`).join('')}</div></article>`
      : `<article class="tile t-wide dup-ok" style="--i:3"><p class="t-eye">겹치는 옷</p><span class="t-check">${IC.check}</span><p class="t-mid">겹치는 옷 없음</p><p class="t-cap">같은 종류·같은 색의 옷이 옷장에 없어요.</p></article>`;
    const tilePrice = `<article class="tile t-wide" style="--i:4">
      <div class="t-row"><div><p class="t-eye">가격</p><p class="t-price">${esc(P.price(p.price))}</p><p class="t-cap">${p.checkedAt ? `${esc(p.checkedAt.slice(5).replace('-', '.'))} 기록 가격` : '기록 가격'}</p></div>
      <a class="link" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">판매처에서 확인하기${IC.out}</a></div>
      <p class="t-note">코디는 종류·색으로 맞춘 공식이에요. 핏·사이즈·소재·현재 가격은 판매처에서 확인해 주세요.</p>
    </article>`;
    const dec = P.decisionOf(p);
    return `<main class="page judge">
      <button class="back" data-act="go" data-v="${ui.from}">${IC.back}${ui.from === 'closet' ? '옷장' : '홈'}</button>
      <section class="j-hero">
        <div class="j-stage">${pic(p, 'j-img')}</div>
        <p class="eyebrow">${esc(catName(p))} · ${esc(P.colorName(p.color))}</p>
        <h1 class="h-xl">${head}</h1>
        <p class="j-name">${esc(p.brand || '')} · ${esc(p.name)}</p>
        ${dec ? `<p class="j-dec">지난 선택: ${dec === 'buy' ? '살게요' : dec === 'hold' ? '나중에' : '안 살게요'}</p>` : ''}
      </section>
      <section class="bento" aria-label="판단 근거">${tileBoard}${tileUsed}${tileLooks}${tileDup}${tilePrice}</section>
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
    return `<main class="page">
      <section class="c-head"><p class="eyebrow">내 옷장</p><h1 class="h-xl">내 옷 ${list.length}벌</h1>${ex ? '<p class="sub">예시 옷장이에요. 내 옷으로 바꿔 담아 보세요.</p>' : '<p class="sub">많이 넣을수록 필요한 옷과 코디가 정확해져요.</p>'}</section>
      <ul class="cgrid">
        <li class="ccard add-tile"><button class="add-btn" data-act="add"><span class="add-plus">${IC.plus}</span><span class="add-t">내 옷 추가</span><span class="add-s">사진 · 종류와 색 · 상품 이름</span></button></li>
        ${list.map((g) => `<li class="ccard">
        <span class="cc-stage">${pic(g)}</span>
        <span class="cc-k">${esc(P.shortKind(g))} · ${esc(P.colorName(g.color))}${isEx(g) ? ' · 예시' : ''}</span>
        <span class="cc-n">${esc(P.label(g))}</span>
        <button class="cc-x" data-act="remove" data-id="${esc(g.id)}" aria-label="${esc(P.label(g))} 빼기">${IC.close}</button>
      </li>`).join('')}</ul>
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
    root.innerHTML = `<div class="ow${scroll ? ' enter' : ''}" data-view="${ui.view}">${body}</div>`;
    ui.justFilled = false;
    if (scroll) window.scrollTo(0, 0);
  }

  const openAdd = () => P.openAdd({ onChange: () => render({ scroll: false }), onClose: () => render({ scroll: false }) });
  root.addEventListener('click', (e) => {
    const t = e.target.closest('[data-act]');
    if (!t || t.disabled) return;
    const a = t.dataset.act;
    if (a === 'gender') { ui.gender = t.dataset.g; render({ scroll: false }); }
    else if (a === 'start-example') { P.startExample(ui.gender); P.record.exampleIds = gs().map((g) => g.id); P.save(); ui.view = 'home'; render(); }
    else if (a === 'start-own') { P.start(ui.gender); ui.view = 'home'; render(); openAdd(); }
    else if (a === 'add') { openAdd(); }
    else if (a === 'go') { ui.view = t.dataset.v; ui.resetAsk = false; render(); }
    else if (a === 'judge') { ui.from = ui.view === 'closet' ? 'closet' : 'home'; ui.pid = t.dataset.pid; ui.view = 'judge'; render(); }
    else if (a === 'decide') {
      const p = P.product(ui.pid); if (!p) return;
      P.decide(p, t.dataset.d); P.buzz(12);
      ui.view = 'home'; render();
      toast(t.dataset.d === 'buy' ? '옷장에 담았어요' : t.dataset.d === 'hold' ? '나중에 다시 볼게요' : '안 사기로 했어요');
    }
    else if (a === 'pick') { const g = needsM().gaps[Math.min(ui.gapIdx, needsM().gaps.length - 1)]; if (g) { ui.sel[g.kind] = ui.sel[g.kind] === t.dataset.pid ? null : t.dataset.pid; ui.justFilled = !!ui.sel[g.kind]; P.buzz(8); render({ scroll: false }); } }
    else if (a === 'gap') { ui.gapIdx = Number(t.dataset.i) || 0; render(); }
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
