/* 시안 2판 디자인 부품(C1~C18)을 실제 데이터(EoulMock)로 그리는 함수. 디자인 보드 전용(동작 없음).
   구현은 여기서 나온 모양·순서·문구를 그대로 옮긴다. 설계 설명: docs/ux10v2-design-spec-20261019.md */
(function () {
  // 보드는 저장 없이 메모리에서만 그린다(다른 창의 기록을 지우지 않게).
  if (!window.EoulMock?.boot?.preview) { location.replace(`${location.pathname}?preview=1`); return; }
  const M = window.EoulMock;
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const P = {
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    compare: '<rect x="3" y="5" width="7" height="14" rx="1.5"/><rect x="14" y="5" width="7" height="14" rx="1.5"/>',
    closet: '<path d="M12 5a2 2 0 1 1 2 2c-1 .4-2 1-2 2v1"/><path d="M12 10 3 16.5c-.7.5-.4 1.5.5 1.5h17c.9 0 1.2-1 .5-1.5L12 10Z"/>',
    records: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/>',
    back: '<path d="M15 5 8 12l7 7"/>', close: '<path d="M6 6l12 12M18 6 6 18"/>', zoom: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5M11 8v6M8 11h6"/>',
    ext: '<path d="M14 5h5v5M19 5l-8 8M18 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h4"/>',
    warn: '<path d="M12 4 2.5 20h19L12 4Z"/><path d="M12 10v4M12 17h.01"/>', ok: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>', half: '<circle cx="12" cy="12" r="9"/><path d="M12 3v18" /><path d="M12 3a9 9 0 0 1 0 18Z" fill="currentColor"/>',
    plus: '<path d="M12 5v14M5 12h14"/>', menu: '<path d="M4 7h16M4 12h16M4 17h16"/>', up: '<path d="m6 15 6-6 6 6"/>', down: '<path d="m6 9 6 6 6-6"/>', grid: '<rect x="4" y="4" width="7" height="7"/><rect x="13" y="4" width="7" height="7"/><rect x="4" y="13" width="7" height="7"/><rect x="13" y="13" width="7" height="7"/>',
  };
  const ico = (n, cls = '') => `<svg class="ico ${cls}" viewBox="0 0 24 24" aria-hidden="true">${P[n] || ''}</svg>`;
  const toneIcon = (tone) => ({ stop: 'warn', go: 'ok', pair: 'half', info: 'half' }[tone] || 'info');
  const ph = (t, o) => M.photoHtml(t, { eager: true, ...o });

  const K = {
    M, esc, ico, ph,
    // 보드·프레임
    board({ n, name, idea, refs = '', note = '' }) {
      document.title = `디자인 보드 ${n} ${name}`;
      document.body.className = 'board';
      document.body.insertAdjacentHTML('afterbegin', `<header class="board-head"><h1>시안 ${n} ${esc(name)} — 디자인 보드</h1><p>${esc(idea)}</p>${refs ? `<p class="meta">근거: ${esc(refs)}</p>` : ''}<p class="meta">실제 상품 사진·판정은 공통 코어(EoulMock)가 돌려준 값이에요. 빨간 점선은 첫 화면 끝이에요. 동작은 없는 화면 디자인이고, 구현은 이 모양을 그대로 옮겨요.${note ? ' ' + esc(note) : ''} AI 역할 설계이며 실제 수상 디자이너가 참여하지 않았어요.</p></header>`);
    },
    row(html) { document.body.insertAdjacentHTML('beforeend', `<section class="board-row">${html}</section>`); },
    phone(label, inner, { notes = [], clip = false, fold = true, sub = '' } = {}) {
      return `<div class="frame-wrap"><div class="frame-label">${esc(label)}<small>${esc(sub || '휴대폰 390')}</small></div><div class="frame phone"><div class="screen${clip ? ' clip' : ''}">${inner}</div>${fold ? '<div class="fold" style="top:844px"></div>' : ''}</div>${notes.length ? `<ul class="note-list">${notes.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}</div>`;
    },
    pc(label, inner, { notes = [], clip = false } = {}) {
      return `<div class="frame-wrap"><div class="frame-label">${esc(label)}<small>PC 1280</small></div><div class="frame pc"><div class="screen${clip ? ' clip' : ''}">${inner}</div><div class="fold" style="top:800px"></div></div>${notes.length ? `<ul class="note-list" style="max-width:1280px">${notes.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}</div>`;
    },
    // 머리글
    hdr({ n, back = false, compare = 0, closet = 0, records = 0 } = {}) {
      return `<header class="hdr">${back ? `<button class="ib" aria-label="뒤로" style="margin-left:-10px">${ico('back')}</button>` : ''}<span class="logo">어울</span><span class="mock">시안 ${n}</span><span class="sp"></span>
        ${back ? '' : `<button class="ib" aria-label="검색">${ico('search')}<span>검색</span></button>`}
        <button class="ib" aria-label="비교 ${compare}개">${ico('compare')}<span>비교</span>${compare ? `<i class="badge">${compare}</i>` : ''}</button>
        <button class="ib" aria-label="옷장">${ico('closet')}<span>옷장</span>${closet ? `<i class="badge">${closet}</i>` : ''}</button>
        <button class="ib" aria-label="기록">${ico('records')}<span>기록</span>${records ? `<i class="badge">${records}</i>` : ''}</button></header>`;
    },
    hdrPc({ n, q = '', compare = 0 } = {}) {
      return `<header class="hdr pc"><span class="logo">어울</span><span class="mock">시안 ${n}</span>${K.search(q)}<button class="tb">${ico('compare', 's')}비교 ${compare}</button><button class="tb">${ico('closet', 's')}옷장</button><button class="tb">${ico('records', 's')}기록</button></header>`;
    },
    tabbar(on = 0) {
      const t = [['search', '찾기'], ['compare', '비교'], ['closet', '옷장'], ['records', '기록']];
      return `<nav class="tabbar">${t.map(([i, l], k) => `<a class="${k === on ? 'on' : ''}">${ico(i)}${l}</a>`).join('')}</nav>`;
    },
    // C1·C2
    search(q = '') { return `<form class="search" role="search"><label class="field">${ico('search', 's')}<input value="${esc(q)}" placeholder="예: 출근용 셔츠 10만원 이하" aria-label="찾을 옷"></label><button class="go" type="button">찾기</button></form>`; },
    sugs(text = '') { const s = M.searchSuggestions(text); return `<div class="sugs">${s.map((x) => `<div class="row"><span class="k">${esc(x.label)}</span>${esc(x.q)}</div>`).join('')}${s.some((x) => x.kind === 'recent') ? '<span class="clear">최근 지우기</span>' : ''}</div>`; },
    // C3
    chips(r) { return `<div class="chips">${r.conditions.map((c) => c.removable ? `<span class="chip">${esc(c.label)}<span class="x" aria-label="${esc(c.label)} 조건 빼기">${ico('close', 's')}</span></span>` : `<span class="chip kind">${esc(c.label)}</span>`).join('')}</div>`; },
    meta(r) { const p = r.products[0]; return `<div class="meta-line"><b>${r.total}개</b> · 가격: ${p ? `${Number(p.checkedAt.slice(5, 7))}월 ${Number(p.checkedAt.slice(8, 10))}일` : ''} 수집가 · 규칙으로 골랐어요</div>`; },
    // C10
    tag(owned) {
      if (!owned || owned.tone === 'none' || !owned.label) return '';
      const tone = owned.tone === 'stop' ? 'stop' : owned.tone === 'new' ? 'go' : 'info';
      return `<span class="tag ${tone}">${ico(owned.tone === 'stop' ? 'warn' : owned.tone === 'new' ? 'ok' : 'half', 's')}${esc(owned.label)}</span>`;
    },
    // C4
    card(p, { cmp = false, cmpOn = false } = {}) {
      return `<a class="card"><div class="ph">${ph(p)}${cmp ? `<button class="cmp${cmpOn ? ' on' : ''}" aria-label="비교 담기">${ico('compare', 's')}</button>` : ''}</div><div class="b">${esc(p.brand)}</div><div class="n">${esc(p.name)}</div><div class="p">${esc(p.priceText)}</div>${K.tag(p.owned) ? `<div class="t">${K.tag(p.owned)}</div>` : ''}</a>`;
    },
    // C5
    pdpPhoto(d) { return `<div class="pdp-photo">${ph(d)}<button class="zoom">${ico('zoom', 's')}크게</button></div>`; },
    pdpInfo(d, { summary = true } = {}) {
      const v = d.verdict;
      return `<div class="pdp-info"><div class="b">${esc(d.brand)}</div><h1>${esc(d.name)}</h1><div class="price"><strong>${esc(d.priceText)}</strong><span class="f13 sub">${esc(d.priceShort)} · ${esc(d.store)}</span></div>${d.rating ? `<div class="rate">★ ${d.rating} · 후기 ${Number(d.reviews).toLocaleString('ko-KR')}</div>` : ''}<p class="why">${esc(d.why[0] || d.reason)}</p>${summary ? `<div class="sum-verdict ${esc(v.tone)}" data-flow="verdict">${ico(toneIcon(v.tone), 's')}${esc(v.title)}<span class="f13 sub" style="font-weight:400;margin-left:auto">${esc(v.basisLabel)}</span></div>` : ''}</div>`;
    },
    // C6
    // title: false(기본)면 상세 가격 아래 요약 줄이 판정 제목을 맡고, 이 블록은 '내 옷과 비교' 설명만 보여 준다(같은 제목 반복 금지).
    verdict(v, { add = true, before = null, title = false } = {}) {
      return `<section class="verdict">${title ? `<div class="basis">${esc(v.basisLabel)}</div><div class="title ${esc(v.tone)}">${ico(toneIcon(v.tone))}<span>${esc(v.title)}</span></div>` : '<div class="f14" style="font-weight:700;margin-bottom:6px">내 옷과 비교</div>'}${before ? `<div class="just">방금 바뀜 · 전에는: ${esc(before)}</div>` : ''}${v.lines.slice(0, 2).map((l) => `<p>${esc(l)}</p>`).join('')}${v.owned.length ? `<div class="owned">${v.owned.slice(0, 4).map((o) => `<div class="o"><div class="ph">${ph(o, { caption: false })}</div><span>${esc(o.relationLabel)}</span></div>`).join('')}</div>` : ''}${add && v.addSuggestion ? `<button class="btn quiet sm block" style="margin-top:8px">${ico('plus', 's')}가진 ${esc(v.addSuggestion.kindName)} 넣고 비교</button>` : ''}</section>`;
    },
    // C7
    decide(v, { h } = {}) {
      const strong = v?.lean === 'buy' ? 'buy' : v?.lean === 'hold' ? 'hold' : null;
      const b = (k, l) => `<button class="btn${strong === k ? ' primary' : ' quiet'}"${h ? ` style="min-height:${h}px"` : ''}>${l}</button>`;
      return `<div class="decide">${b('hold', '보류')}${b('skip', '안 살래')}${b('buy', '사기로 함')}</div>`;
    },
    dbar(v, o) { return `<div class="dbar">${K.decide(v, o)}</div>`; },
    // C8
    seller() { return `<div class="seller"><div class="hint">사이즈·소재·착용 사진은 무신사에서 확인해요</div><a class="btn quiet sm block">무신사에서 보기 ${ico('ext', 's')}</a></div>`; },
    // C9
    newUsed(id) {
      const nu = M.newVsUsed(id); const links = nu.used.groups.flatMap((g) => g.links);
      return `<div class="nu"><div><div class="h">새 상품</div><div class="v">${esc(nu.fresh.priceText)}</div><div class="s">${esc(nu.fresh.priceNote)} · 판매처 대표 사진</div></div><div><div class="h">중고</div><div class="v" style="font-size:14px">가격·상태는 매물마다 달라요</div><div class="s">어울은 확인하지 않았어요</div><div class="links">${links.slice(0, 4).map((l) => `<a>${esc(l.label)}</a>`).join('')}</div></div></div>`;
    },
    // C11
    viewer(d) { return `<div class="viewer"><div class="top"><button class="btn quiet sm" aria-label="닫기">${ico('close', 's')}</button></div><div class="ph">${ph(d, { fit: 'contain' })}</div><div class="cap">판매처 대표 사진</div></div>`; },
    // C12
    addSheet(v, { picked = 'white' } = {}) {
      const s = v.addSuggestion;
      return `<div class="scrim"></div><div class="sheet"><div class="grab"></div><h3>가진 ${esc(s.kindName)} 색을 골라 주세요</h3><p class="sub">종류는 이 상품과 같은 ${esc(s.slotName)}로 넣어요</p><div class="swatches">${M.colorChoices().slice(0, 12).map((c) => `<button class="${c.id === picked ? 'on' : ''}"><i style="background:${c.hex}"></i>${esc(c.label)}</button>`).join('')}</div><button class="btn primary block">넣고 이 상품으로 돌아가기</button></div>`;
    },
    // C13
    tray(items, { top = 844 - 56 - 72 } = {}) { return `<div class="tray" style="top:${top}px">${items.map((p) => `<div class="ph">${ph(p)}</div>`).join('')}<span class="cnt">${items.length}/4</span><button class="btn primary sm">비교하기</button></div>`; },
    // C14
    compare(ids, { cols = 2 } = {}) {
      const c = M.compareRows(ids);
      const prim = c.rows.filter((r) => r.primary), same = prim.filter((r) => r.same), diff = prim.filter((r) => !r.same);
      return `<div class="cmp-photos" style="grid-template-columns:repeat(${cols},minmax(0,1fr))">${c.items.slice(0, cols).map((p) => `<div class="c"><div class="ph">${ph(p)}</div><span class="x" aria-label="빼기">${ico('close', 's')}</span><div class="b">${esc(p.brand)}</div><div class="n">${esc(p.name)}</div><div class="p">${esc(p.priceText)}</div></div>`).join('')}</div>
        <div class="cmp-table">${diff.map((r) => `<div class="r" style="grid-template-columns:repeat(${cols},minmax(0,1fr))"><div class="k">${esc(r.label)}<span class="diff">다름</span></div>${r.values.slice(0, cols).map((x) => `<div class="v">${r.key === 'verdict' ? `<b>${esc(x)}</b>` : esc(x)}</div>`).join('')}</div>`).join('')}
        ${same.length ? `<div class="fold-same"><span>같은 값 ${same.length}줄 · ${same.map((r) => esc(r.label)).join(', ')}</span>${ico('down', 's')}</div>` : ''}
        <div class="r" style="grid-template-columns:repeat(${cols},minmax(0,1fr));border-top:1px solid var(--line)">${c.items.slice(0, cols).map(() => `<div style="display:grid;gap:6px"><button class="btn quiet sm">보류</button><button class="btn quiet sm">사기로 함</button></div>`).join('')}</div><p class="f12 sub" style="margin:4px 0 0">${esc(c.note)}</p></div>`;
    },
    // C15
    empty(r, { relax = true } = {}) {
      const rel = relax ? M.relax(r) : [];
      return `<div class="empty"><h2>${esc(r.title)}</h2><p>${esc(r.notices.at(-1)?.text || '')}</p>${rel.map((x) => `<div class="relax"><div class="t">${esc(x.title)}</div><div class="pv">${x.preview.map((p) => `<div class="ph">${ph(p)}</div>`).join('')}</div><button class="btn quiet sm">이 조건으로 보기</button></div>`).join('')}<div class="f13 sub" style="margin:12px 0 8px">이렇게 찾아보세요</div><div class="ex">${r.examples.slice(0, 4).map((x) => `<span class="chip">${esc(x)}</span>`).join('')}</div></div>`;
    },
    // C16
    toast(text, { top = 844 - 69 - 64, undo = true } = {}) { return `<div class="toast" role="status" style="top:${top}px"><span>${esc(text)}</span>${undo ? '<b>되돌리기</b>' : ''}</div>`; },
    // C17
    rec(r) { const p = r.product; return `<div class="rec"><div class="ph">${ph(r)}</div><div class="nm"><b>${esc(p.brand)}</b>${esc(p.name)}<div style="margin-top:4px"><span class="tag ${r.decision === 'buy' ? 'go' : r.decision === 'hold' ? 'info' : ''}">${esc(r.stageLabel)}</span></div></div><div class="pr">${esc(p.priceText)}</div></div>`; },
    // C18
    closetTile(g) { return `<div class="g"><div class="ph">${ph(g)}</div><div class="n">${esc(g.label)}</div><div class="s">${esc(g.sourceLabel)}</div></div>`; },
  };
  // 표준 상품 상세(휴대폰·PC). 시안마다 결정 바 대신 다른 부품을 쓰면 dbar: false로 끄고 extra로 덧붙인다.
  K.pdpMobile = (d, { n, before = null, extra = '', dbar = true, cmp = 0 } = {}) => `${K.hdr({ n, back: true, compare: cmp, closet: M.getState().closetCount })}${K.pdpPhoto(d)}${K.pdpInfo(d)}${K.verdict(d.verdict, { before })}<div class="sec"><div class="decide-inline">${dbar ? '' : K.decide(d.verdict)}</div><h2>새 상품과 중고</h2>${K.newUsed(d.id)}</div><div class="sec">${K.seller()}</div><div class="sec"><h2>같은 조건 다른 선택</h2><div class="grid2">${d.alternatives.slice(0, 4).map((x) => K.card(x, { cmp: true })).join('')}</div></div><div style="height:96px"></div>${dbar ? K.dbar(d.verdict) : ''}${extra}`;
  K.pdpPc = (d, { n, q = K.Q, cmp = 0 } = {}) => `${K.hdrPc({ n, q, compare: cmp })}<div style="display:grid;grid-template-columns:7fr 5fr;gap:40px;padding:24px 32px 0;max-width:1280px;margin:0 auto"><div>${K.pdpPhoto(d)}</div><div class="pc-info">${K.pdpInfo(d).replace('class="pdp-info"', 'class="pdp-info" style="padding:0"')}${K.verdict(d.verdict).replace('class="verdict"', 'class="verdict" style="margin:16px 0 0"')}<div style="margin-top:16px">${K.decide(d.verdict)}</div><div style="margin-top:12px">${K.seller()}</div><div style="margin-top:20px">${K.newUsed(d.id)}</div></div></div>`;
  // 자주 쓰는 데이터
  K.Q = '출근용 셔츠 10만원 이하';
  K.data = () => {
    const r = M.ask(K.Q);
    const d = M.product(r.products[0].id);
    return { r, d, p: r.products };
  };
  window.K = K;
})();
