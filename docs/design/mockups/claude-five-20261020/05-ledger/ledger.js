// 시안 05 결정 노트. 검색 하나 = 날짜가 찍힌 결정 시트 한 장(01 요청 → 02 후보 → 03 비교 → 04 결정).
// 상품·판정·기록은 공통 코어(window.EoulMock)에서만 오고, 이 파일은 화면만 그린다. 결정은 사용자가 누른 것만 기록한다.
(() => {
  const M = window.EoulMock;
  const FLAT = window.PHOTO_FLAT || new Set();
  const app = document.getElementById('app');
  const over = document.getElementById('over');
  const wide = matchMedia('(min-width: 960px)');
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (n) => Number(n || 0).toLocaleString('ko-KR');
  const go = (path, params, opt) => M.route.go(path, params, opt);
  const DECIDE = [['hold', '보류', 'decide-hold'], ['buy', '살게요', 'decide-buy'], ['skip', '안 살래요', 'decide-skip']];

  // ── 시트 목록(이 시안만의 화면 자료): 요청 문장, 처음 만든 날짜, 시트 번호, 상품이 어느 시트에서 열렸는지.
  const KEY = 'eoul-five-05:sheets:v1';
  let book = { seq: 0, sheets: [], origin: {} };
  try { const raw = localStorage.getItem(KEY); if (raw) book = { ...book, ...JSON.parse(raw) }; } catch { /* 저장이 막혀도 화면은 동작한다. */ }
  if (M.boot.reset || M.boot.preview) book = { seq: 0, sheets: [], origin: {} };
  const saveBook = () => { try { localStorage.setItem(KEY, JSON.stringify(book)); } catch { /* 무시 */ } };
  saveBook();
  function sheetFor(q, n) {
    let s = book.sheets.find((x) => x.q === q);
    if (!s) { s = { no: ++book.seq, q, at: new Date().toISOString(), n }; book.sheets.unshift(s); book.sheets = book.sheets.slice(0, 30); }
    else if (n != null) s.n = n;
    saveBook();
    return s;
  }
  const sheetOf = (q) => book.sheets.find((x) => x.q === q) || null;
  const noText = (s) => `No.${String(s.no).padStart(2, '0')}`;
  const day = (iso) => { const d = new Date(iso); return `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`; };
  const fullDay = (iso) => { const d = new Date(iso); return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${'일월화수목금토'[d.getDay()]}`; };

  // ── 사진 표본: 같은 3:4 틀. 흰 배경 사진(flat)은 틀 안에 바닥 맞춤, 모델 사진은 위 맞춤.
  // tiny: 40~72px 썸네일. 사진 위 글씨(비슷한 상품 사진)는 읽히지 않으니 빼고, 옆 글에 같은 말을 적는다.
  function spec(target, { eager = false, id = null, tiny = false } = {}) {
    const pid = id || target?.productId || target?.product?.id || (target?.brand ? target.id : null);
    const flat = pid && FLAT.has(pid);
    return `<span class="spec ${flat ? 'flat' : 'model'}">${M.photoHtml(target, { eager, caption: !tiny })}</span>`;
  }
  const similarNote = (t) => (M.photo(t)?.similar ? ` · ${esc(M.note.short.similar)}` : '');
  const recordOf = (id) => M.judge(id)?.record || null;
  function statusTag(rec) {
    if (!rec) return '';
    const cls = rec.decision || 'hold';
    return `<span class="status ${esc(cls)}">${esc(rec.stage === 'candidate' ? rec.decisionLabel : rec.stageLabel)}</span>`;
  }
  function toast(text) {
    const t = document.getElementById('toast');
    t.textContent = text; t.classList.add('on');
    clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 2200);
  }
  function setTab(name) {
    document.querySelectorAll('.tabs a').forEach((a) => (a.dataset.tab === name ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
    const n = M.compareList().length;
    const c = document.querySelector('.cmp');
    c.dataset.on = String(n);
    document.getElementById('cmpn').textContent = n;
  }

  // ── 01 요청 입력
  function askForm(value = '', { submit = '찾기' } = {}) {
    return `<form class="ask" role="search" data-act="ask">
      <input name="q" data-flow="ask-input" value="${esc(value)}" placeholder="예: 출근용 셔츠 10만원 이하" aria-label="찾을 옷을 한 줄로" autocomplete="off" enterkeyhint="search">
      <button data-flow="ask-submit">${esc(submit)}</button></form>`;
  }

  // ── 노트(처음 화면): 요청 한 줄 + 지난 시트 장부
  function home() {
    setTab('note');
    const st = M.getState();
    const recs = st.records;
    const sugs = M.searchSuggestions('');
    app.innerHTML = `
      <section class="sec"><h1 class="sh"><span class="no">01</span>요청 <span class="aux">새 시트를 만들어요</span></h1>
        ${askForm()}
        <div class="row-tools"><span class="chip-label">찾는 옷</span>
          <div class="seg" role="group" aria-label="찾는 옷">${[['M', '남성'], ['F', '여성']].map(([g, l]) => `<button type="button" data-act="gender" data-g="${g}" aria-pressed="${st.gender === g}">${l}</button>`).join('')}</div>
        </div>
        <div class="chips" aria-label="요청 예시">${sugs.map((s) => `<button type="button" class="chip${s.kind === 'recent' ? '' : ' ghost'}" data-flow="example" data-act="ask-q" data-q="${esc(s.q)}">${s.kind === 'recent' ? '<span class="chip-label">최근</span>' : ''}${esc(s.q)}</button>`).join('')}</div>
      </section>
      <section class="sec"><h2 class="sh"><span class="no">—</span>지난 시트 <span class="aux num">${book.sheets.length}장</span></h2>
        ${book.sheets.length ? `<div class="lrows">${book.sheets.map((s) => {
          const r = recs.filter((x) => book.origin[x.productId] === s.q).length;
          return `<a class="lrow" href="${M.route.href('/search', { q: s.q })}" style="grid-template-columns:64px 1fr auto">
            <span class="num" style="font-size:13px;font-weight:700">${noText(s)}<br><span style="font-weight:400;color:var(--ink2)">${day(s.at)}</span></span>
            <span class="t"><span class="n" style="display:block">${esc(s.q)}</span><span class="m">후보 <span class="num">${s.n ?? '-'}</span> · 결정 <span class="num">${r}</span></span></span>
            <span aria-hidden="true" class="num">→</span></a>`;
        }).join('')}</div>` : '<p class="note">아직 시트가 없어요. 위에 한 줄로 적으면 첫 시트가 생겨요. 옷장은 비워 둬도 돼요.</p>'}
      </section>`;
  }

  // ── 시트(검색 결과)
  let sortBy = 'rank';
  let lastResult = null;
  let why = new Map(); // 상품 id → 같은 시트 안에서 다른 후보와 다른 점(규칙으로 계산한 한 줄)
  function sorted(list) {
    const rows = list.map((p, i) => ({ p, rank: i + 1 }));
    if (sortBy === 'price') rows.sort((a, b) => a.p.price - b.p.price || a.rank - b.rank);
    if (sortBy === 'reviews') rows.sort((a, b) => (b.p.reviews || 0) - (a.p.reviews || 0) || a.rank - b.rank);
    if (sortBy === 'rating') rows.sort((a, b) => (b.p.rating || 0) - (a.p.rating || 0) || a.rank - b.rank);
    return rows;
  }
  const ownedCls = (o) => (o?.tone === 'stop' ? 'stop' : o?.tone === 'new' ? 'go' : '');
  function card({ p, rank }) {
    const rec = recordOf(p.id);
    const inCmp = M.compareHas(p.id);
    return `<article class="card">
      <a class="open" href="${M.route.href(`/p/${p.id}`)}" data-flow="result" data-product-id="${p.id}" data-act="open" data-id="${p.id}">
        <span class="rk" aria-label="엔진 순서 ${rank}번">${String(rank).padStart(2, '0')}</span>
        ${spec(p)}
        <div class="b">${esc(p.brand)}</div>
        <div class="n">${esc(p.name)}</div>
        <div class="kv stack"><span class="k num">${esc(p.priceShort)}</span><span class="v price">${esc(p.priceText)}</span></div>
        <div class="kv"><span class="k">평점·후기</span><span class="v num">${p.rating ? `${p.rating} · ${num(p.reviews)}` : '—'}</span></div>
        <div class="kv stack"><span class="k">내 옷</span><span class="v ${ownedCls(p.owned)}">${esc(p.owned?.label || '옷장 없이')}</span></div>
        <p class="reason${why.get(p.id)?.caution ? ' stop' : ''}">${esc(why.get(p.id)?.headline || p.reason)}</p>
      </a>
      <div class="acts">
        <button type="button" class="btn sm full" data-flow="compare-add" data-product-id="${p.id}" data-act="cmp-toggle" data-id="${p.id}" aria-pressed="${inCmp}">${inCmp ? '비교에 있음' : '비교에 담기'}</button>
      </div>
      ${rec ? `<div style="padding:0 8px 8px">${statusTag(rec)}</div>` : ''}
    </article>`;
  }
  function table(rows) {
    const th = (key, label, cls = '') => `<th class="${cls}" aria-sort="${sortBy === key ? (key === 'price' ? 'ascending' : 'descending') : 'none'}"><button type="button" class="sort" data-act="sort" data-sort="${key}">${label}${sortBy === key ? (key === 'price' ? ' ↑' : ' ↓') : ''}</button></th>`;
    return `<div class="tbl-wrap"><table class="ledger" aria-label="후보 표">
      <thead><tr>${th('rank', 'No.', 'rkc')}<th class="ph-cell">사진</th><th>브랜드·품명</th>${th('price', '수집가', 'r')}${th('rating', '평점', 'r')}${th('reviews', '후기', 'r')}<th>내 옷</th><th>다른 점</th><th>비교</th></tr></thead>
      <tbody>${rows.map(({ p, rank }) => {
        const rec = recordOf(p.id);
        const inCmp = M.compareHas(p.id);
        return `<tr data-flow="result" data-product-id="${p.id}" data-act="open" data-id="${p.id}" tabindex="0" aria-label="${esc(`${p.brand} ${p.name} ${p.priceText}`)}">
          <td class="rkc">${String(rank).padStart(2, '0')}</td>
          <td class="ph-cell">${spec(p)}</td>
          <td class="nm"><div class="b">${esc(p.brand)}</div><div class="n">${esc(p.name)}</div><div class="sub">${esc(p.colorLabel)} · ${esc(p.slotName)}</div>${rec ? `<div style="margin-top:6px">${statusTag(rec)}</div>` : ''}</td>
          <td class="r"><div class="price">${esc(p.priceText)}</div><div class="sub num">${esc(p.priceShort)}</div></td>
          <td class="r num">${p.rating ?? '—'}</td>
          <td class="r num">${p.reviews ? num(p.reviews) : '—'}</td>
          <td class="${p.owned?.tone === 'stop' ? 'stop' : ''}">${esc(p.owned?.label || '옷장 없이')}${p.owned?.text ? `<div class="sub">${esc(p.owned.text)}</div>` : ''}</td>
          <td class="why${why.get(p.id)?.caution ? ' stop' : ''}">${esc(why.get(p.id)?.headline || p.reason)}<div class="sub">${esc(p.reason)}</div></td>
          <td><button type="button" class="btn sm" data-flow="compare-add" data-product-id="${p.id}" data-act="cmp-toggle" data-id="${p.id}" aria-pressed="${inCmp}">${inCmp ? '비교에 있음' : '비교 담기'}</button></td>
        </tr>`;
      }).join('')}</tbody></table></div>`;
  }
  function tray() {
    const ids = M.compareList();
    const slots = [...ids.map((id) => { const p = M.product(id, { criteria: null }); return `<a class="slot" href="${M.route.href(`/p/${id}`)}" aria-label="${esc(`${p.brand} ${p.name}`)}">${spec(p, { id, tiny: true })}</a>`; }),
      ...Array.from({ length: Math.max(0, 2 - ids.length) }, (_, i) => `<span class="empty-slot" aria-hidden="true">${ids.length + i + 1}</span>`)];
    return `<div class="tray">${slots.join('')}</div>
      <div class="row-tools">${ids.length >= 2 ? `<a class="btn ink" href="#/compare" data-flow="compare-open">${ids.length}개 나란히 보기</a>` : `<span class="note" style="margin:0">후보를 ${2 - ids.length}개 더 담으면 나란히 볼 수 있어요.</span>`}${ids.length ? '<button type="button" class="btn sm" data-act="cmp-clear">비교 비우기</button>' : ''}</div>`;
  }
  function decisionsFor(ids, q) {
    const recs = M.getState().records.filter((r) => ids.has(r.productId) || book.origin[r.productId] === q);
    if (!recs.length) return '<p class="note" style="margin-top:0">아직 결정이 없어요. 상품을 열어 보류·살게요·안 살래요 중 하나를 누르면 여기에 남아요.</p>';
    return `<div class="lrows">${recs.map((r) => `<a class="lrow" href="${M.route.href(`/p/${r.productId}`)}">${spec(r, { id: r.productId, tiny: true })}<span class="t"><span class="b">${esc(r.product?.brand)}</span><span class="n" style="display:block">${esc(r.product?.name)}</span><span class="m num">${esc(r.product?.priceText)}</span></span>${statusTag(r)}</a>`).join('')}</div>`;
  }
  function search(params) {
    setTab('note');
    const q = params.q || '';
    const drop = params.drop ? params.drop.split(',').filter(Boolean) : [];
    const r = M.ask(q, { drop, previous: lastResult && lastResult.text !== q && !drop.length ? lastResult : null });
    if (r.understood) lastResult = r;
    const s = r.understood ? sheetFor(drop.length ? (sheetOf(q)?.q || q) : r.text, drop.length ? undefined : r.products.length) : sheetOf(q);
    const list = r.products;
    why = new Map((list.length ? M.rankReasons(r).items : []).map((x) => [x.id, x]));
    const ids = new Set([...list, ...r.offOccasion].map((p) => p.id));
    const chips = r.conditions.map((c) => (c.removable
      ? `<button type="button" class="chip" data-flow="condition-remove" data-key="${esc(c.key)}" data-act="drop" data-q="${esc(r.text)}" data-drop="${esc([...r.dropped, c.key].join(','))}" aria-label="${esc(c.label)} 조건 빼기">${esc(c.label)} <span class="x" aria-hidden="true">✕</span></button>`
      : `<span class="chip fixed">${esc(c.label)}</span>`)).join('');
    const dropped = r.dropped.length ? `<button type="button" class="chip ghost" data-act="ask-q" data-q="${esc(r.text)}">뺀 조건 되돌리기</button>` : '';
    const notices = r.notices.slice(0, 2).map((n) => `<p class="note${n.kind === 'empty' || n.kind === 'kind-unavailable' ? ' warn' : ''}">${esc(n.text)}</p>`).join('');
    let body;
    if (!list.length) {
      const relax = r.understood ? M.relax(r) : [];
      body = `<div class="empty"><h3>${esc(r.title)}</h3>${r.notices.map((n) => `<p>${esc(n.text)}</p>`).join('')}
        ${relax.length ? `<div class="opts">${relax.map((x) => `<button type="button" class="btn" data-flow="empty-action" data-act="drop" data-q="${esc(r.text)}" data-drop="${esc(x.drop.join(','))}">${esc(x.title)}</button>`).join('')}</div>` : ''}
        <p style="margin-top:12px">다른 요청으로 새 시트를 만들 수 있어요.</p>
        <div class="opts">${r.examples.slice(0, 4).map((x) => `<button type="button" class="chip ghost" data-flow="example" data-act="ask-q" data-q="${esc(x)}">${esc(x)}</button>`).join('')}</div></div>`;
    } else {
      const rows = sorted(list);
      body = `${wide.matches ? table(rows) : `<div class="cards">${rows.map(card).join('')}</div>`}
        <p class="note">${esc(r.listNote)} · 다른 점은 이 시트 후보끼리 비교한 내용이에요</p>
        ${r.offOccasion.length ? `<details class="more" style="margin-top:12px"><summary>${esc(r.offOccasionTitle)}</summary><div class="cards">${r.offOccasion.map((p, i) => card({ p, rank: list.length + i + 1 })).join('')}</div></details>` : ''}`;
    }
    app.innerHTML = `
      <div class="sheet">
        <nav class="sheethead" aria-label="위치"><a class="up" href="#/">노트</a><span class="sep" aria-hidden="true">/</span><span class="no">${s ? noText(s) : 'No.—'}</span><span class="date">${fullDay(s?.at || new Date().toISOString())}</span><span class="count">후보 <span class="num">${r.total}</span></span></nav>
        <section class="sec" aria-labelledby="h01"><h1 class="sh" id="h01"><span class="no">01</span>요청</h1>
          ${askForm(r.text, { submit: '다시 찾기' })}
          ${chips || dropped ? `<div class="chips" aria-label="읽은 조건">${chips}${dropped}</div>` : ''}
          ${list.length ? notices : ''}
        </section>
        <section class="sec" aria-labelledby="h02"><h2 class="sh" id="h02"><span class="no">02</span>후보 <span class="aux">${list.length ? `<span class="num">${list.length}</span>개` : ''}</span>${list.length ? `<span class="seg sortseg" role="group" aria-label="정렬">${[['rank', '기본'], ['price', '가격↑'], ['reviews', '후기↓']].map(([k, l]) => `<button type="button" data-act="sort" data-sort="${k}" aria-pressed="${sortBy === k}" aria-label="${{ rank: '기본 순서', price: '수집가 낮은 순', reviews: '후기 많은 순' }[k]}">${l}</button>`).join('')}</span>` : ''}</h2>${body}</section>
        ${list.length ? `<section class="sec" aria-labelledby="h03"><h2 class="sh" id="h03"><span class="no">03</span>비교 <span class="aux num">${M.compareList().length}/4</span></h2>${tray()}</section>
        <section class="sec" aria-labelledby="h04"><h2 class="sh" id="h04"><span class="no">04</span>결정</h2>${decisionsFor(ids, s?.q)}</section>` : ''}
      </div>`;
  }

  // ── 상품 상세: 표본 사진 + 명세서
  function decideRow(id, rec, { bar = false } = {}) {
    return `<div class="${bar ? 'decide-bar' : ''}">
      ${bar ? `<div class="lab"><span>04 결정</span><span>${rec ? `지금: ${esc(rec.stage === 'candidate' ? rec.decisionLabel : rec.stageLabel)}` : '누른 것만 기록돼요'}</span></div>` : ''}
      <div class="decide" role="group" aria-label="결정">${DECIDE.map(([d, l, f]) => `<button type="button" class="btn ${d === 'skip' ? '' : 'on-acc'}" data-flow="${f}" data-act="decide" data-id="${id}" data-d="${d}" aria-pressed="${rec?.decision === d}">${l}</button>`).join('')}</div></div>`;
  }
  function pdp(id, params) {
    setTab('note');
    const d = M.product(id);
    if (!d) { app.innerHTML = '<div class="empty" style="margin-top:16px"><h3>상품을 찾지 못했어요</h3><p><a href="#/">노트로 돌아가기</a></p></div>'; return; }
    const q = book.origin[id] || lastResult?.text || null;
    const s = q ? sheetOf(q) : null;
    const v = d.verdict;
    const nu = M.newVsUsed(id);
    const rec = v.record;
    const inCmp = M.compareHas(id);
    const flat = FLAT.has(id);
    app.innerHTML = `
      <nav class="crumb" aria-label="위치"><a href="#/">노트</a><span class="sep">/</span>${s ? `<a href="${M.route.href('/search', { q: s.q })}">시트 ${noText(s)}</a><span class="sep">/</span>` : ''}<span>${esc(d.slotName)}</span></nav>
      <article class="pdp" data-flow="pdp">
        <figure class="pdp-photo">
          <button type="button" class="zoom" data-flow="photo-zoom" data-act="zoom" data-id="${id}" aria-label="사진 크게 보기">${spec(d, { eager: true, id })}</button>
          <figcaption class="spec-cap"><span>판매처 대표 사진 · ${flat ? '흰 배경' : '모델 착용'}</span><span>눌러서 크게</span></figcaption>
        </figure>
        <div class="pdp-sheet">
          <div class="brand" data-flow="pdp-brand">${esc(d.brand)}</div>
          <h1 data-flow="pdp-name">${esc(d.name)}</h1>
          <div class="priceline"><span class="price" data-flow="pdp-price">${esc(d.priceText)}</span><span class="pnote">${esc(d.priceNote)} · ${esc(d.store)}</span></div>
          <dl class="specs">
            <dt>고른 이유</dt><dd>${esc(d.why[0] || d.reason)}</dd>
            <dt>색</dt><dd>${esc(d.colorLabel)}</dd>
            <dt>종류</dt><dd>${esc(d.slotName)}</dd>
            <dt>평점·후기</dt><dd>${d.rating ? `<span class="num">${d.rating}</span> · 후기 <span class="num">${num(d.reviews)}</span>개 <span style="color:var(--ink2);font-size:12px">판매처 정보</span>` : '정보 없음'}</dd>
          </dl>
          ${decideRow(id, rec, { bar: true })}
          <div class="acts-row">
            <button type="button" class="btn" data-flow="compare-add" data-product-id="${id}" data-act="cmp-toggle" data-id="${id}" aria-pressed="${inCmp}">${inCmp ? '비교에 있음' : '비교에 담기'}</button>
            <a class="btn" data-flow="seller-link" href="${esc(d.url)}" target="_blank" rel="noopener noreferrer">무신사에서 보기</a>
          </div>
          <section class="box verdict-wrap" data-tone="${esc(v.tone)}" aria-labelledby="vt">
            <div class="bh"><span class="no">03</span>내 옷과 <span style="margin-left:auto">${esc(v.basisLabel)}</span></div>
            <div class="bb">
              <h2 class="verdict" id="vt"><span data-flow="verdict">${esc(v.title)}</span></h2>
              ${v.lines.length ? `<ul class="vlines">${v.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}
              ${v.owned.length ? `<div class="owned">${v.owned.slice(0, 4).map((o) => `<div class="o">${spec(o, { tiny: true })}<span><b>${esc(o.label)}</b><br><span style="color:var(--ink2)">${esc(o.relationLabel)}${o.trial ? ' · 체험용' : ''}${similarNote(o)}</span></span></div>`).join('')}</div>` : ''}
              ${v.addSuggestion ? `<button type="button" class="btn full" data-flow="closet-add" data-act="add-open" data-id="${id}">가진 ${esc(v.addSuggestion.kindName)} 넣고 비교</button>` : ''}
            </div>
          </section>
          <div class="nvu" aria-label="새 상품과 중고">
            <div><div class="h">새 상품</div><div class="big">${esc(nu.fresh.priceText)}</div><p class="s">${esc(nu.fresh.priceNote)} · ${esc(nu.fresh.store)}</p><p class="s">${esc(nu.fresh.photoNote)}</p></div>
            <div data-flow="used-search"><div class="h">중고</div><div style="font-weight:700">${esc(M.note.short.used)}</div><p class="s">${esc(nu.used.note)}</p>
              ${nu.used.groups.map((g) => `<div class="grp">${esc(g.region)}</div><div class="links">${g.links.map((l) => `<a class="chip" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.label)}</a>`).join('')}</div>`).join('')}</div>
          </div>
          ${d.alternatives.length ? `<h2 class="subh"><span class="no">02</span>같은 조건 다른 후보 <span class="aux">${d.alternatives.length}개</span></h2>
            <div class="alts">${d.alternatives.slice(0, 6).map((p, i) => card({ p, rank: i + 1 }).replace('data-flow="result" ', '')).join('')}</div>
            ${d.alternativesNote ? `<p class="note">${esc(d.alternativesNote)}</p>` : ''}` : ''}
          ${d.outfit ? `<h2 class="subh"><span class="no">+</span>이 옷이 들어간 코디 예시 <span class="aux">${esc(d.outfit.title)}</span></h2>
            <div class="look">${d.outfit.pieces.map((x) => {
              const inner = `<span class="role">${esc(x.roleLabel)}${x.owned ? (x.trial ? ' · 체험용' : ' · 내 옷') : ''}</span>${spec(x, { id: x.product?.id, tiny: true })}<span class="lb">${esc(x.label)}${M.photo(x)?.similar ? `<br><span style="color:var(--ink2)">${esc(M.note.short.similar)}</span>` : ''}</span>`;
              return x.product && !x.focus ? `<a class="piece" href="${M.route.href(`/p/${x.product.id}`)}">${inner}</a>` : `<div class="piece${x.focus ? ' me' : ''}">${inner}</div>`;
            }).join('')}</div>${d.outfit.note ? `<p class="note">${esc(d.outfit.note)}</p>` : ''}` : ''}
        </div>
      </article>`;
    over.innerHTML = '';
    if (params.view === 'photo') {
      over.innerHTML = `<div class="viewer${flat ? ' flat' : ''}" data-flow="photo-viewer" role="dialog" aria-modal="true" aria-label="사진 크게 보기">
        <div class="vh"><span class="t">${esc(d.brand)} · ${esc(d.name)}</span><button type="button" class="btn sm" data-act="back">닫기</button></div>
        <div class="vb">${M.photoHtml(d, { fit: 'contain', eager: true })}</div>
        <div class="vf">판매처 대표 사진 · 사이즈·실착은 판매처에서 확인해요</div></div>`;
      over.querySelector('[data-act="back"]').focus();
    }
    if (params.add) addSheet(id, v.addSuggestion);
  }

  // 상세에서 바로 옷 넣기: 종류는 이 상품과 같게 미리 고르고 색만 묻는다.
  let picked = null;
  function addSheet(id, s) {
    if (!s) return;
    picked = null;
    over.innerHTML = `<div class="scrim" data-act="back"></div>
      <div class="sheet-panel" role="dialog" aria-modal="true" aria-labelledby="addh">
        <h2 id="addh">가진 ${esc(s.kindName)}의 색</h2>
        <p class="note" style="margin-top:0">종류는 이 상품과 같은 ‘${esc(s.slotName)}’로 넣어요. 사진 없이 종류·색만 저장돼요.</p>
        <div class="opts" style="margin-top:12px"><button type="button" class="chip" data-flow="kind-option" data-kind="${esc(s.kind)}" aria-pressed="true" aria-label="종류 ${esc(s.kindName)} (이 상품과 같아요)">${esc(s.kindName)}</button></div>
        <div class="opts" style="margin-top:8px" role="group" aria-label="색">${M.colorChoices().map((c) => `<button type="button" class="chip" data-flow="color-option" data-color="${c.id}" data-act="pick-color" aria-pressed="false"><span class="sw" style="background:${c.hex}" aria-hidden="true"></span>${esc(c.label)}</button>`).join('')}</div>
        <div class="sp-acts"><button type="button" class="btn" data-act="back">취소</button><button type="button" class="btn ink" data-flow="closet-save" data-act="save-garment" data-kind="${esc(s.kind)}" data-slot="${esc(s.slot)}" disabled>넣고 이 상품으로</button></div>
      </div>`;
    over.querySelector('[data-flow="color-option"]').focus();
  }

  // ── 비교: 표 머리에 후보, 줄마다 compareRows 값(같은 값 줄은 흐리게)
  function compare() {
    setTab('note');
    const c = M.compareRows();
    const items = c.items;
    const lastQ = lastResult?.text;
    const s = lastQ ? sheetOf(lastQ) : null;
    const row = (r) => `<tr class="${r.same ? 'same' : ''} ${r.primary ? 'primary' : ''}"><th scope="row">${esc(r.label)}</th>${r.values.map((x) => `<td class="${r.key === 'price' ? 'num' : ''}">${esc(x)}</td>`).join('')}</tr>`;
    app.innerHTML = `
      <nav class="crumb" aria-label="위치"><a href="#/">노트</a><span class="sep">/</span>${s ? `<a href="${M.route.href('/search', { q: s.q })}">시트 ${noText(s)}</a><span class="sep">/</span>` : ''}<span>비교</span></nav>
      <section class="sec" data-flow="compare-view" aria-labelledby="ch"><h1 class="sh" id="ch"><span class="no">03</span>비교 <span class="aux num">${items.length}/4</span></h1>
        ${items.length < 2 ? `<div class="empty"><h3>후보를 둘 이상 담아 주세요</h3><p>결과 카드의 ‘비교에 담기’를 누르면 여기 나란히 놓여요.</p>${s ? `<div class="opts"><a class="btn" href="${M.route.href('/search', { q: s.q })}">시트 ${noText(s)}로</a></div>` : ''}</div>` : ''}
        ${items.length ? `<div class="cmp-wrap"><table class="cmp-t" style="min-width:${60 + items.length * 140}px"><colgroup><col class="lab">${items.map(() => '<col>').join('')}</colgroup>
          <thead><tr><th scope="col"><span class="note" style="margin:0">후보</span></th>${items.map((p) => {
            const rec = recordOf(p.id);
            return `<th scope="col"><div class="citem" data-flow="compare-item" data-product-id="${p.id}">
              <a class="go" href="${M.route.href(`/p/${p.id}`)}">${spec(p, { id: p.id })}<div class="b">${esc(p.brand)}</div><div class="n">${esc(p.name)}</div></a>
              <div class="cacts">${DECIDE.map(([d, l, f]) => `<button type="button" class="btn ${d === 'skip' ? '' : 'on-acc'}" data-flow="${f}" data-act="decide" data-id="${p.id}" data-d="${d}" aria-pressed="${rec?.decision === d}">${l}</button>`).join('')}
                <button type="button" class="btn rm" data-act="cmp-remove" data-id="${p.id}" aria-label="${esc(p.name)} 비교에서 빼기">빼기</button></div></div></th>`;
          }).join('')}</tr></thead>
          <tbody>${c.rows.filter((r) => r.primary).map(row).join('')}</tbody>
          <tbody class="more-rows" hidden>${c.rows.filter((r) => !r.primary).map(row).join('')}</tbody></table></div>
          <div class="row-tools"><button type="button" class="btn sm" data-act="more-rows" aria-expanded="false">줄 더 보기 (${c.rows.filter((r) => !r.primary).length})</button><span class="note" style="margin:0">${esc(c.note)}</span></div>` : ''}
      </section>`;
  }

  // ── 기록 장부: 시트로 돌아가는 줄
  let reasonFor = null;
  function records() {
    setTab('records');
    const recs = M.getState().records;
    app.innerHTML = `
      <section class="sec"><h1 class="sh"><span class="no">04</span>기록 <span class="aux">${esc(M.note.short.records)} · <span class="num">${recs.length}</span>건</span></h1>
        ${recs.length ? `<div class="ledger-rows">${recs.map((r) => {
          const q = book.origin[r.productId];
          const s = q ? sheetOf(q) : null;
          return `<div class="lr" data-flow="record" data-product-id="${r.productId}">
            <span class="d">${r.updatedAt ? day(r.updatedAt) : '—'}</span>
            <a href="${M.route.href(`/p/${r.productId}`)}" aria-label="${esc(r.product?.name)} 상세">${spec(r, { id: r.productId, tiny: true })}</a>
            <span class="t"><a href="${M.route.href(`/p/${r.productId}`)}"><span class="b">${esc(r.product?.brand)}</span><span class="n" style="display:block">${esc(r.product?.name)}</span></a><span class="num" style="font-size:12px;color:var(--ink2)">${esc(r.product?.priceText)}</span></span>
            <span class="meta">${statusTag(r)}
              ${s ? `<a class="sheet" href="${M.route.href('/search', { q: s.q })}">시트 <span class="num">${noText(s)}</span></a>` : ''}
              ${r.next.map((n) => `<button type="button" class="btn sm" data-flow="record-step" data-step="${n.step}" data-act="step" data-id="${r.productId}" data-need="${n.needsReason ? 1 : ''}">${esc(n.label)}</button>`).join('')}
              ${r.stage === 'candidate' ? `<button type="button" class="btn sm" data-act="rec-remove" data-id="${r.productId}">지우기</button>` : ''}
            </span>
            ${reasonFor === r.productId ? `<div class="opts" style="grid-column:1/-1" role="group" aria-label="반품 사유">${M.returnReasons.map((x) => `<button type="button" class="chip" data-act="return" data-id="${r.productId}" data-reason="${x.id}">${esc(x.label)}</button>`).join('')}</div>` : ''}
          </div>`;
        }).join('')}</div>` : '<p class="note">아직 기록이 없어요. 상품 상세나 비교에서 보류·살게요·안 살래요를 누르면 이 장부에 한 줄씩 남아요.</p>'}
      </section>`;
  }

  // ── 옷장(선택): 종류 → 색 두 번 고르기
  let draft = { kind: null, color: null };
  function closet() {
    setTab('closet');
    const st = M.getState();
    app.innerHTML = `
      <section class="sec"><h1 class="sh"><span class="no">—</span>옷장 <span class="aux"><span class="num">${st.closetCount}</span>벌${st.trialCount ? ` · 체험용 <span class="num">${st.trialCount}</span>` : ''}</span></h1>
        <p class="note" style="margin-top:0">비워 둬도 찾고 고를 수 있어요. 넣으면 상세의 ‘내 옷과’가 겹침을 알려 줘요.</p>
        ${st.closet.length ? `<div class="closet-grid" style="margin-top:12px">${st.closet.map((g) => `<div class="g">${spec(g, { tiny: true })}<div class="lb">${esc(g.label)}</div><div class="src">${esc(g.sourceLabel)}${similarNote(g)}${g.detailMissing ? ` · ${esc(g.detailMissing)}` : ''}</div><button type="button" class="btn sm" data-act="rm-garment" data-id="${g.id}" aria-label="${esc(g.label)} 빼기">빼기</button></div>`).join('')}</div>` : ''}
        <div class="picker"><h3>옷 넣기</h3>
          <div class="opts" role="group" aria-label="종류">${M.kindChoices().map((k) => `<button type="button" class="chip" data-flow="kind-option" data-kind="${k.id}" data-act="draft-kind" aria-pressed="${draft.kind === k.id}">${esc(k.name)}</button>`).join('')}</div>
          ${draft.kind ? `<div class="opts" style="margin-top:10px" role="group" aria-label="색">${M.colorChoices().map((c) => `<button type="button" class="chip" data-flow="color-option" data-color="${c.id}" data-act="draft-color" aria-pressed="${draft.color === c.id}"><span class="sw" style="background:${c.hex}" aria-hidden="true"></span>${esc(c.label)}</button>`).join('')}</div>` : ''}
          <div class="row-tools"><button type="button" class="btn ink" data-flow="closet-save" data-act="draft-save" ${draft.kind ? '' : 'disabled'}>옷장에 넣기</button><span class="note" style="margin:0">색은 몰라도 돼요</span></div>
        </div>
        <div class="row-tools" style="margin-top:20px">
          <button type="button" class="btn" data-flow="trial-closet" data-act="trial">${st.trialCount ? '체험용 옷 빼기' : '체험용 옷 넣어 보기'}</button>
          <button type="button" class="btn" data-flow="reset" data-act="reset">처음부터</button>
        </div>
      </section>`;
  }

  // ── 그리기
  function render(route = M.route.current()) {
    over.innerHTML = '';
    const [, a, b] = route.path.split('/');
    if (a === 'search') search(route.params);
    else if (a === 'p' && b) pdp(decodeURIComponent(b), route.params);
    else if (a === 'compare') compare();
    else if (a === 'records') records();
    else if (a === 'closet') closet();
    else home();
  }
  const refresh = () => { const y = scrollY; render(); scrollTo(0, y); };

  // ── 누르기(한 곳에서 처리)
  document.addEventListener('submit', (e) => {
    const f = e.target.closest('form[data-act="ask"]');
    if (!f) return;
    e.preventDefault();
    const q = f.q.value.trim();
    if (!q) { f.q.focus(); return; }
    sortBy = 'rank';
    go('/search', { q });
  });
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || el.tagName === 'FORM') return;
    const act = el.dataset.act;
    const id = el.dataset.id;
    switch (act) {
      case 'open': {
        if (e.target.closest('button') && e.target.closest('button') !== el) return;
        e.preventDefault();
        const q = M.route.current().params.q;
        if (q && M.route.current().path === '/search') { book.origin[id] = sheetOf(q)?.q || q; saveBook(); }
        go(`/p/${id}`);
        break;
      }
      case 'ask-q': sortBy = 'rank'; go('/search', { q: el.dataset.q }); break;
      case 'drop': go('/search', { q: el.dataset.q, drop: el.dataset.drop }); break;
      case 'gender': M.setGender(el.dataset.g); refresh(); break;
      case 'sort': sortBy = el.dataset.sort; refresh(); break;
      case 'cmp-toggle': {
        e.stopPropagation();
        try {
          if (M.compareHas(id)) { M.compareRemove(id); toast('비교에서 뺐어요'); }
          else { M.compareAdd(id); toast(`비교에 담았어요 (${M.compareList().length}/4)`); }
        } catch (err) { toast(err.message); }
        refresh();
        break;
      }
      case 'cmp-remove': M.compareRemove(id); refresh(); break;
      case 'cmp-clear': M.compareClear(); refresh(); break;
      case 'decide': {
        const was = recordOf(id);
        if (was?.decision === el.dataset.d && was.stage === 'candidate') { toast(`이미 ‘${was.decisionLabel}’로 기록돼 있어요`); break; }
        try { const r = M.decide(id, el.dataset.d); if (!book.origin[id] && lastResult) { book.origin[id] = lastResult.text; saveBook(); } toast(`기록했어요: ${r.decisionLabel}`); } catch (err) { toast(err.message); }
        refresh();
        break;
      }
      case 'zoom': go(`/p/${id}`, { view: 'photo' }); break;
      case 'add-open': go(`/p/${id}`, { add: 1 }); break;
      case 'back': history.back(); break;
      case 'pick-color': {
        picked = el.dataset.color;
        over.querySelectorAll('[data-flow="color-option"]').forEach((b) => b.setAttribute('aria-pressed', String(b === el)));
        over.querySelector('[data-flow="closet-save"]').disabled = false;
        break;
      }
      case 'save-garment': {
        if (!picked) return;
        try { M.addGarment({ kind: el.dataset.kind, slot: el.dataset.slot, color: picked }); toast('옷장에 넣었어요. 판정을 다시 봤어요'); } catch (err) { toast(err.message); return; }
        picked = null;
        history.back();
        break;
      }
      case 'more-rows': {
        const tb = app.querySelector('.more-rows');
        tb.hidden = !tb.hidden;
        el.setAttribute('aria-expanded', String(!tb.hidden));
        break;
      }
      case 'step': {
        if (el.dataset.need) { reasonFor = id; refresh(); break; }
        try { M.advance(id, el.dataset.step); } catch (err) { toast(err.message); }
        refresh();
        break;
      }
      case 'return': try { M.advance(id, 'returned', { reason: el.dataset.reason }); reasonFor = null; } catch (err) { toast(err.message); } refresh(); break;
      case 'rec-remove': if (confirm('이 기록을 지울까요?')) { try { M.removeRecord(id); } catch (err) { toast(err.message); } refresh(); } break;
      case 'draft-kind': draft = { kind: el.dataset.kind, color: null }; refresh(); break;
      case 'draft-color': draft.color = el.dataset.color; refresh(); break;
      case 'draft-save': try { M.addGarment({ kind: draft.kind, color: draft.color }); draft = { kind: null, color: null }; toast('옷장에 넣었어요'); } catch (err) { toast(err.message); } refresh(); break;
      case 'rm-garment': try { M.removeGarment(id); } catch (err) { toast(err.message); } refresh(); break;
      case 'trial': if (M.getState().trialCount) M.clearTrialCloset(); else M.loadTrialCloset(); refresh(); break;
      case 'reset': if (confirm('옷장·기록·비교·시트를 모두 지우고 처음부터 할까요?')) { M.reset(); book = { seq: 0, sheets: [], origin: {} }; saveBook(); lastResult = null; go('/'); } break;
      default: break;
    }
  });
  document.querySelector('[data-flow="mock-label"]').addEventListener('click', () => M.openDisclosure());
  // 표: 화살표로 줄 이동, Enter로 열기
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && over.innerHTML && !document.querySelector('#eo-disclosure[open]')) { history.back(); return; }
    const tr = e.target.closest?.('tr[data-flow="result"]');
    if (!tr || e.target !== tr) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tr.click(); }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = e.key === 'ArrowDown' ? tr.nextElementSibling : tr.previousElementSibling;
      next?.focus();
    }
  });
  wide.addEventListener('change', () => refresh());

  if (M.boot.q && !location.hash) history.replaceState(null, '', M.route.href('/search', { q: M.boot.q }));
  M.route.on(render);
})();
