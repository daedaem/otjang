// 3팀 균일 진열대 화면. 상품·판정·기록은 모두 공통 코어(EoulMock)에서 오고, 이 파일은 그리기와
// 필터(이미 받은 검색 결과를 화면에서 좁히기)만 한다. 필터 값은 결과 상품에 실제로 있는 값(세부 종류·색·수집가·평점·후기·옷장 겹침)만 쓴다.
(() => {
  const M = window.EoulMock;
  const FLAT = window.PHOTO_FLAT || new Set();
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const app = $('#app'), over = $('#over'), tray = $('#tray'), toastEl = $('#toast'), topQ = $('#topQ');
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const go = (path, params = {}, opt) => M.route.go(path, params, opt);
  const href = (path, params) => M.route.href(path, params);
  const pad = (v) => String(v).padStart(2, '0');
  const num = (v) => Number(v || 0).toLocaleString('ko-KR');
  const josa = (w, a, b) => { const c = String(w).charCodeAt(String(w).length - 1); return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 ? a : b; };

  // ── 사진 칸: 흰 배경 단독 사진은 같은 여백으로 칸 안에 세우고(배경은 칸 색에 녹임), 그 밖의 사진(모델·연출)은 위쪽 기준으로 잘라 '모델·연출' 표시.
  // 사진 종류는 photo-kinds.js(가장자리 픽셀 분석)만 따른다. 모델 사진인지 연출 사진인지는 구분하지 않았으니 둘을 함께 적는다.
  function ph(target, opts = {}) {
    const photo = M.photo(target);
    // 종류·색만 아는 옷(옷장)은 같은 종류·색의 흰 배경 사진(cutouts.js)이 있으면 그 사진으로 칸을 맞춘다. '비슷한 상품 사진' 표시는 그대로.
    const cut = photo?.similar && target?.kind && target?.color && target?.gender ? window.CUTOUTS?.[`${target.gender}|${target.kind}|${target.color}`]?.[0] : null;
    if (cut) {
      const alt = `비슷한 상품 사진 · ${target.colorLabel || ''} ${target.kindName || ''}`.trim();
      return `<span class="ph is-flat">${M.photoHtml({ id: cut }, { eager: opts.eager, alt })}${opts.caption === false ? '' : `<span class="ph-sim">${esc(M.note.short.similar)}</span>`}</span>`;
    }
    const id = target?.productId || target?.product?.id || target?.id;
    const flat = !!photo && !photo.similar && FLAT.has(id);
    const worn = !!photo && !photo.similar && !flat;
    const tag = worn && opts.tag !== false ? '<span class="ph-tag">모델·연출</span>' : '';
    return `<span class="ph ${flat ? 'is-flat' : worn ? 'is-worn' : 'is-other'}">${M.photoHtml(target, { fit: opts.fit, eager: opts.eager, caption: opts.caption })}${tag}</span>`;
  }

  // ── 알림(되돌리기 하나까지)
  let toastTimer = null;
  function toast(text, action = null) {
    toastEl.innerHTML = `<span>${esc(text)}</span>${action ? `<button type="button">${esc(action.label)}</button>` : ''}`;
    toastEl.hidden = false;
    if (action) toastEl.querySelector('button').onclick = () => { hideToast(); action.run(); };
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, 5000);
  }
  function hideToast() { toastEl.hidden = true; }

  // ── 검색: 같은 주소를 다시 그릴 때 이어서 묻기(더 싼 걸로 등)가 두 번 적용되지 않게, 주소마다 처음 쓴 '이전 요청'을 기억한다.
  const asked = new Map();
  let last = null;
  function runAsk(q, drop) {
    const key = `${q}|${drop.join(',')}`;
    if (!asked.has(key)) asked.set(key, last && last.text !== q ? last.text : null);
    const r = M.ask(q, { drop, previous: asked.get(key) });
    if (r.understood) last = r;
    return r;
  }

  // ── 필터: 결과 상품에 있는 값만. 같은 묶음 안은 '또는', 묶음끼리는 '그리고'.
  const BANDS = [[0, 30000, '3만원 미만'], [30000, 50000, '3만~5만원'], [50000, 70000, '5만~7만원'], [70000, 100001, '7만~10만원'], [100001, Infinity, '10만원 넘음']];
  const POP = ['평점 4.8 이상', '후기 1천 개 이상', '후기 100개 이상'];
  const GROUPS = [
    { key: 'kind', en: 'Kind', ko: '세부 종류', tags: (p) => [p.slotName] },
    { key: 'color', en: 'Color', ko: '색', tags: (p) => [p.colorLabel], swatch: true },
    { key: 'price', en: 'Price', ko: '수집가', tags: (p) => [BANDS.find(([a, b]) => p.price >= a && p.price < b)[2]], order: BANDS.map((x) => x[2]) },
    { key: 'pop', en: 'Rating', ko: '평점·후기', tags: (p) => [p.rating >= 4.8 ? POP[0] : null, p.reviews >= 1000 ? POP[1] : null, p.reviews >= 100 ? POP[2] : null].filter(Boolean), order: POP },
    { key: 'own', en: 'My closet', ko: '내 옷과', tags: (p) => (p.owned?.tone && p.owned.tone !== 'none' ? [p.owned.label.replace(/ · 체험용$/, '')] : []) },
  ];
  const GROUP = Object.fromEntries(GROUPS.map((g) => [g.key, g]));
  const parseF = (s) => {
    const m = new Map();
    for (const part of String(s || '').split('|')) {
      const i = part.indexOf(':');
      if (i < 1 || !GROUP[part.slice(0, i)]) continue;
      const k = part.slice(0, i);
      if (!m.has(k)) m.set(k, new Set());
      m.get(k).add(part.slice(i + 1));
    }
    return m;
  };
  const fmtF = (m) => [...m].flatMap(([k, set]) => [...set].map((v) => `${k}:${v}`)).join('|');
  const passes = (p, f, skip = null) => [...f].every(([k, set]) => k === skip || !set.size || GROUP[k].tags(p).some((t) => set.has(t)));
  const activeCount = (f) => [...f.values()].reduce((s, set) => s + set.size, 0);
  const SORTS = [['', '추천 순서'], ['price', '낮은 수집가'], ['reviews', '후기 많은'], ['rating', '평점 높은']];
  function sorted(list, s) {
    const a = [...list];
    if (s === 'price') a.sort((x, y) => x.price - y.price);
    else if (s === 'reviews') a.sort((x, y) => (y.reviews || 0) - (x.reviews || 0));
    else if (s === 'rating') a.sort((x, y) => (y.rating || 0) - (x.rating || 0) || (y.reviews || 0) - (x.reviews || 0));
    return a;
  }

  // ── 진열 칸 하나(결과·옆 상품·비교 공통 모양)
  function cell(p, no, { here = false, owned = true } = {}) {
    const on = M.compareHas(p.id);
    const own = owned && p.owned && p.owned.tone !== 'none' ? `<span class="own ${p.owned.tone === 'stop' ? 'stop' : p.owned.tone === 'new' ? 'new' : 'info'}">${esc(p.owned.label)}</span> ` : '';
    const meta = p.rating ? `★ ${p.rating} · 후기 ${num(p.reviews)}` : esc(p.colorLabel);
    return `<article class="cell${here ? ' here' : ''}"${here ? ' aria-current="true"' : ''}>
      <a class="cell-link" href="${href(`/p/${p.id}`)}" data-flow="result" data-product-id="${esc(p.id)}">
        ${ph(p)}
        <span class="cell-info">
          ${no ? `<span class="no">No.${pad(no)}</span>` : ''}
          <span class="brand">${esc(p.brand)}</span>
          <span class="name">${esc(p.name)}</span>
          <span class="price">${esc(p.priceText)}<small>${esc(p.priceShort)}</small></span>
          ${own ? `<span class="own-line">${own}</span>` : ''}
        </span>
      </a>
      <div class="cell-foot"><span class="meta">${meta}</span>${cmpButton(p, on)}</div>
    </article>`;
  }
  const cmpButton = (p, on = M.compareHas(p.id)) => `<button type="button" class="cmp-toggle" data-act="cmp" data-flow="compare-add" data-product-id="${esc(p.id)}" aria-pressed="${on}" aria-label="${esc(p.brand)} ${esc(p.name)} ${on ? '비교함에서 빼기' : '비교함에 담기'}">${on ? '✓' : '+'}</button>`;

  // ── 처음 화면: 진열대 색인(예시·최근 요청)
  function viewHome() {
    const st = M.getState();
    const sug = M.searchSuggestions('', { limit: 8 });
    app.innerHTML = `<section class="home">
      <span class="en">Index</span>
      <h1>찾는 옷을 한 줄로 적으면<br>같은 크기로 나란히 진열해요</h1>
      <form class="home-search" role="search">
        <label class="sr" for="homeQ">찾을 옷</label>
        <input id="homeQ" name="q" data-flow="ask-input" placeholder="예: 출근용 셔츠 10만원 이하" autocomplete="off" enterkeyhint="search">
        <button class="btn-ink" data-flow="ask-submit">찾기</button>
        <div class="sugs" role="listbox" aria-label="검색 제안" hidden></div>
      </form>
      <div class="seg" role="group" aria-label="상품 성별">
        <button type="button" data-act="gender" data-g="M" aria-pressed="${st.gender === 'M'}">남성</button>
        <button type="button" data-act="gender" data-g="F" aria-pressed="${st.gender === 'F'}">여성</button>
      </div>
      <ol class="index" aria-label="진열대 목록">${sug.map((s, i) => `<li><button type="button" data-flow="example" data-act="ask" data-q="${esc(s.q)}"><span class="en">${s.kind === 'recent' ? 'Recent' : pad(i + 1)}</span><span>${esc(s.q)}</span><span class="arrow" aria-hidden="true">→</span></button></li>`).join('')}</ol>
      <div class="home-foot"><span>옷장 ${st.closetCount}벌 · 옷장 없이도 찾을 수 있어요</span><a href="#/closet">옷장 채우기</a><a href="#/records">기록 ${st.records.length}건</a></div>
    </section>`;
  }

  // ── 검색 결과
  let sheet = null; // 'filter' | 'closet-add'
  let current = null; // { r, f, s, params }
  function facetsHtml(all, f) {
    const hex = new Map(all.map((p) => [p.colorLabel, p.colorHex]));
    return GROUPS.map((g) => {
      const universe = [...new Set(all.flatMap((p) => g.tags(p)))];
      const sel = f.get(g.key) || new Set();
      if (g.key === 'own' && !universe.length) {
        return M.getState().closetCount ? '' : `<section class="fg"><h3 class="fg-h"><span class="en">${g.en}</span>${g.ko}</h3><p class="fg-note">옷장을 넣으면 겹치는 옷을 거를 수 있어요. <a href="#/closet">옷장</a></p></section>`;
      }
      if (universe.length < 2 && !sel.size) return '';
      const counts = new Map();
      for (const p of all.filter((x) => passes(x, f, g.key))) for (const t of g.tags(p)) counts.set(t, (counts.get(t) || 0) + 1);
      const vals = g.order ? universe.sort((a, b) => g.order.indexOf(a) - g.order.indexOf(b)) : universe.sort((a, b) => (counts.get(b) || 0) - (counts.get(a) || 0) || a.localeCompare(b, 'ko'));
      for (const v of sel) if (!vals.includes(v)) vals.push(v);
      return `<section class="fg"><h3 class="fg-h"><span class="en">${g.en}</span>${g.ko}</h3><ul>${vals.map((v) => {
        const c = counts.get(v) || 0, on = sel.has(v);
        const sw = g.swatch && hex.get(v) ? `<span class="sw" style="background:${esc(hex.get(v))}"></span>` : '';
        return `<li><button type="button" class="fv" data-act="facet" data-g="${g.key}" data-v="${esc(v)}" aria-pressed="${on}"${!c && !on ? ' aria-disabled="true"' : ''}><span class="box" aria-hidden="true"></span><span>${sw}${esc(v)}</span><span class="n">${c}</span></button></li>`;
      }).join('')}</ul></section>`;
    }).join('');
  }
  function viewSearch(params) {
    const q = params.q || '';
    const drop = params.drop ? params.drop.split(',').filter(Boolean) : [];
    const r = runAsk(q, drop);
    topQ.value = r.text || q;
    const f = parseF(params.f);
    const s = SORTS.some(([k]) => k === (params.s || '')) ? params.s || '' : '';
    current = { r, f, s, params };
    const all = r.products;
    const rankNo = new Map(all.map((p, i) => [p.id, i + 1]));
    const shown = sorted(all.filter((p) => passes(p, f)), s);
    const nAct = activeCount(f);
    const chips = [
      ...r.conditions.map((c) => (c.removable
        ? `<button type="button" class="chip" data-act="drop" data-key="${esc(c.key)}" data-flow="condition-remove" aria-label="${esc(c.label)} 조건 빼기">${esc(c.label)} <span class="x" aria-hidden="true">×</span></button>`
        : `<span class="chip fixed">${esc(c.label)}</span>`)),
      ...[...f].flatMap(([k, set]) => [...set].map((v) => `<button type="button" class="chip facet" data-act="facet" data-g="${k}" data-v="${esc(v)}" aria-label="필터 ${esc(v)} 빼기">${esc(GROUP[k].ko)}: ${esc(v)} <span class="x" aria-hidden="true">×</span></button>`)),
    ].join('');
    const notes = r.notices.map((x) => `<li>${esc(x.text)}</li>`).join('');
    const head = `<div class="res-head">
        <span class="en">Index / 검색</span>
        <h1 class="res-title">${esc(r.title)}</h1>
        ${r.understood && all.length ? `<div class="res-count"><span class="num">${shown.length}</span>개 진열${nAct ? ` · 검색 결과 ${all.length}개 중` : ''} · ${esc(r.listNote)}</div>` : ''}
        ${chips ? `<div class="chips" aria-label="지금 범위">${chips}</div>` : ''}
        ${notes ? `<ul class="notes">${notes}</ul>` : ''}
      </div>`;
    if (!all.length) {
      app.innerHTML = `<section class="shelf">${head}${emptyHtml(r)}</section>`;
      return;
    }
    const bar = `<div class="bar">
        <button type="button" class="filter-btn" data-act="open-filter" aria-haspopup="dialog">필터${nAct ? ` <span class="dot" aria-hidden="true"></span><span class="num">${nAct}</span>` : ''}</button>
        <label class="sort"><span class="en">Sort</span><select id="sort" aria-label="정렬">${SORTS.map(([k, l]) => `<option value="${k}"${k === s ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
        <span class="grow"></span>
      </div>`;
    const rail = `<aside class="rail" aria-label="필터">${facetsHtml(all, f)}${nAct ? '<button type="button" class="rail-clear" data-act="facet-clear">필터 모두 지우기</button>' : ''}</aside>`;
    const grid = shown.length
      ? `<div class="rack">${shown.map((p) => cell(p, rankNo.get(p.id))).join('')}</div>`
      : `<div class="empty"><h2>이 필터에 맞는 상품이 없어요</h2><p class="fine">검색 결과 ${all.length}개는 그대로예요. 필터만 바꿔 주세요.</p><button type="button" class="btn-line" data-act="facet-clear" data-flow="empty-action">필터 모두 지우기</button></div>`;
    // 상황에 덜 맞는 대안도 같은 필터·정렬을 따른다(접어 둠).
    const offShown = sorted(r.offOccasion.filter((p) => passes(p, f)), s);
    const off = offShown.length ? `<details class="more-off"><summary>${esc(r.offOccasionTitle)}${offShown.length < r.offOccasion.length ? ` · 필터 후 ${offShown.length}개` : ''}</summary><div class="rack">${offShown.map((p) => cell(p)).join('')}</div></details>` : '';
    app.innerHTML = `<section class="shelf">${head}<div class="layout">${rail}<div>${bar}${grid}${off}</div></div></section>`;
    if (sheet === 'filter') drawFilterSheet();
  }
  function emptyHtml(r) {
    const rel = r.understood ? M.relax(r) : [];
    return `<div class="empty">
      ${rel.length ? `<span class="en">Remove a condition</span><div class="relax">${rel.map((x) => `<button type="button" data-flow="empty-action" data-act="relax" data-drop="${esc(x.drop.join(','))}"><span>${esc(x.title)}<span class="fine" style="display:block;font-weight:500">조건을 직접 빼고 다시 진열해요</span></span><span class="mini" aria-hidden="true">${x.preview.map((p) => `<span class="ph-mini" style="width:40px">${ph(p, { tag: false })}</span>`).join('')}</span></button>`).join('')}</div>` : ''}
      <span class="en">Try</span>
      <div class="ex-list">${r.examples.slice(0, 6).map((x) => `<button type="button" class="chip" data-flow="example" data-act="ask" data-q="${esc(x)}">${esc(x)}</button>`).join('')}</div>
    </div>`;
  }
  function drawFilterSheet() {
    if (!current) return;
    const { r, f } = current;
    const n = r.products.filter((p) => passes(p, f)).length;
    over.innerHTML = `<div class="scrim" data-act="close-sheet"></div>
      <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="fh">
        <div class="sheet-h"><h2 id="fh">필터</h2><button type="button" class="x-btn" data-act="close-sheet" aria-label="필터 닫기">×</button></div>
        <p class="fine" style="margin:0 0 6px">검색 결과 ${r.products.length}개 안에서만 좁혀요.</p>
        ${facetsHtml(r.products, f)}
        <div style="display:grid;grid-template-columns:auto 1fr;gap:6px;margin-top:12px">
          <button type="button" class="btn-line" data-act="facet-clear">모두 지우기</button>
          <button type="button" class="btn-fill" data-act="close-sheet">${n}개 보기</button>
        </div>
      </div>`;
    $('.sheet .x-btn', over)?.focus();
  }

  // ── 상품 상세
  function viewPdp(id, params) {
    const d = M.product(id);
    if (!d) { app.innerHTML = '<section class="page"><h1>상품을 찾지 못했어요</h1><p><a class="btn-line" href="#/">처음으로</a></p></section>'; return; }
    const v = d.verdict, nu = M.newVsUsed(id);
    const list = last && last.products.some((p) => p.id === id) ? last.products : null;
    const i = list ? list.findIndex((p) => p.id === id) : -1;
    const prev = list && i > 0 ? list[i - 1] : null;
    const next = list && i < list.length - 1 ? list[i + 1] : null;
    const on = M.compareHas(id);
    const dec = v.record?.decision || null;
    const owned = v.owned?.length ? `<div class="owned-row">${v.owned.slice(0, 4).map((g) => `<div class="o">${ph(g, { tag: false, caption: false })}<span class="ol">${esc(g.label)}</span><span>${esc(g.relationLabel)}${g.trial ? ' · 체험용' : ''}</span>${g.photo?.similar ? `<span>${esc(M.note.short.similar)}</span>` : ''}</div>`).join('')}</div>` : '';
    const usedLinks = nu.used.groups.map((g) => `<p class="fine" style="margin-top:6px">${esc(g.region)}</p><div class="links">${g.links.map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.label)}</a>`).join('')}</div>`).join('');
    const facts = [
      ['Color', d.colorNote],
      d.popularity ? ['Rating', d.popularity] : null,
      d.tip ? ['Wear', d.tip] : null,
      d.why[1] ? ['Why', d.why.slice(1).join(' · ')] : null,
      d.alternativesNote ? ['Rack', d.alternativesNote] : null,
    ].filter(Boolean);
    const strip = list
      ? { title: '같은 진열대의 옆 상품', sub: `No.${pad(i + 1)} / ${pad(list.length)}`, items: list.slice(0, 16).map((p, k) => cell(p, k + 1, { here: p.id === id, owned: false })) }
      : { title: '같은 종류의 다른 상품', sub: d.alternatives.length ? `${d.alternatives.length}개` : '', items: d.alternatives.map((p) => cell(p, null, { owned: false })) };
    const outfit = d.outfit ? `<section class="outfit"><span class="en">Outfit</span><h2>이 옷으로 입는 예시</h2><p class="fine">${esc(d.outfit.title)} · 규칙으로 조합한 예시</p>
      <div class="pieces">${d.outfit.pieces.map((pc) => {
        const inner = `${ph(pc, { tag: false })}<span class="r en">${esc(pc.roleLabel)}</span><span class="l">${esc(pc.label)}</span><span class="fine">${pc.focus ? '이 상품' : pc.owned ? (pc.trial ? '체험용 옷' : '내 옷') : pc.product ? `${esc(pc.product.priceText)}` : ''}</span>`;
        return pc.product && !pc.focus ? `<a class="pc" href="${href(`/p/${pc.product.id}`)}">${inner}</a>` : `<div class="pc${pc.focus ? ' focus' : ''}">${inner}</div>`;
      }).join('')}</div>${d.outfitNote ? `<p class="fine">${esc(d.outfitNote)}</p>` : ''}</section>` : '';
    app.innerHTML = `<article class="pdp" data-flow="pdp">
      <div class="pdp-grid">
        <div class="pdp-photo">
          <button type="button" class="zoom" data-act="zoom" data-flow="photo-zoom" aria-label="사진 크게 보기">${ph(d, { eager: true })}</button>
          <span class="zoom-hint" aria-hidden="true">크게 보기</span>
        </div>
        <div class="pdp-panel">
          <div class="pdp-step"><span class="en">${list ? `No.${pad(i + 1)} / ${pad(list.length)}` : 'Item'}</span>
            <span class="nav2">${prev ? `<a href="${href(`/p/${prev.id}`)}" aria-label="진열대의 앞 상품">←</a>` : '<span aria-hidden="true">←</span>'}${next ? `<a href="${href(`/p/${next.id}`)}" aria-label="진열대의 다음 상품">→</a>` : '<span aria-hidden="true">→</span>'}</span></div>
          <div class="pdp-brand" data-flow="pdp-brand">${esc(d.brand)}</div>
          <h1 class="pdp-name" data-flow="pdp-name">${esc(d.name)}</h1>
          <div class="pdp-price-row"><span class="pdp-price" data-flow="pdp-price">${esc(d.priceText)}</span><span class="fine">${esc(d.priceNote)} · ${esc(d.store)}</span></div>
          <p class="pdp-why"><span class="en">Why</span> <b>${esc(d.why[0] || d.reason)}</b></p>
          <div class="actions">
            <button type="button" class="${on ? 'btn-line' : 'btn-fill'}" data-act="cmp" data-flow="compare-add" data-product-id="${esc(id)}" aria-pressed="${on}">${on ? '비교함에 있음 ✓' : '비교함에 담기'}</button>
            <a class="btn-line" data-flow="seller-link" href="${esc(d.url)}" target="_blank" rel="noopener noreferrer">${esc(d.store)}에서 보기</a>
          </div>
          <section class="verdict-box" aria-label="내 옷과 비교">
            <span class="en">My closet</span> <span class="fine">${esc(v.basisLabel)}</span>
            <div class="verdict-title"><span data-flow="verdict">${esc(v.title)}</span></div>
            ${v.lines.map((l) => `<p>${esc(l)}</p>`).join('')}
            ${owned}
            ${v.addSuggestion ? `<button type="button" class="btn-line full" data-act="add" data-flow="closet-add">가진 ${esc(v.addSuggestion.kindName)} 넣고 비교</button>` : ''}
          </section>
          <div class="decide" role="group" aria-label="이 상품 결정">
            <button type="button" data-act="decide" data-id="${esc(id)}" data-d="buy" data-flow="decide-buy" aria-pressed="${dec === 'buy'}">사기로 함</button>
            <button type="button" data-act="decide" data-id="${esc(id)}" data-d="hold" data-flow="decide-hold" aria-pressed="${dec === 'hold'}">보류</button>
            <button type="button" data-act="decide" data-id="${esc(id)}" data-d="skip" data-flow="decide-skip" aria-pressed="${dec === 'skip'}">안 살래요</button>
          </div>
          <p class="rec-line">${v.record ? `기록: ${esc(v.record.stageLabel)} · <a href="#/records">기록 보기</a>` : ''}</p>
          ${v.cautions?.length ? `<p class="fine">${v.cautions.map(esc).join('<br>')}</p>` : ''}
          <section class="nu" aria-label="새 상품과 중고">
            <div><span class="en">New</span><div class="k">새 상품</div><p><b class="num">${esc(nu.fresh.priceText)}</b> ${esc(nu.fresh.priceNote)}</p><p>${esc(nu.fresh.store)} · ${esc(nu.fresh.photoNote)}</p></div>
            <div data-flow="used-search"><span class="en">Used</span><div class="k">중고</div><p>${esc(nu.used.condition)}</p><p class="fine">${esc(M.note.short.used)}</p>${usedLinks}<p class="fine">${esc(nu.used.note)}</p></div>
          </section>
          <ul class="facts">${facts.map(([k, t]) => `<li><span class="en">${k}</span><span>${esc(t)}</span></li>`).join('')}</ul>
          ${outfit}
        </div>
      </div>
      ${strip.items.length ? `<section class="strip-wrap" aria-label="${esc(strip.title)}"><div class="strip-h"><h2>${esc(strip.title)}</h2><span class="en">${esc(strip.sub)}</span></div><div class="strip">${strip.items.join('')}</div></section>` : ''}
    </article>`;
    const here = $('.strip .cell.here');
    if (here) here.parentElement.scrollLeft = Math.max(0, here.offsetLeft - 24);
    if (params.view === 'photo') {
      over.innerHTML = `<div class="viewer" data-flow="photo-viewer" role="dialog" aria-modal="true" aria-label="사진 크게 보기">
        <div class="viewer-top"><span><span class="pdp-brand">${esc(d.brand)}</span> <span class="fine">${esc(d.name)}</span></span><button type="button" class="x-btn" data-act="back" aria-label="닫기">×</button></div>
        <div class="viewer-ph">${ph(d, { fit: 'contain', eager: true, tag: false })}</div>
      </div>`;
      $('.viewer .x-btn')?.focus();
    } else if (params.add && v.addSuggestion) {
      drawAddSheet({ ...v.addSuggestion, back: true });
    }
  }

  // 가진 옷 넣기(상세에서는 이 상품의 종류를 미리 고르고 색만 묻는다. 옷장 화면에서는 종류부터).
  let pick = { kind: null, slot: null, color: null, gender: null, back: false };
  function drawAddSheet(s) {
    pick = { kind: s.kind || null, slot: s.slot || null, color: null, gender: s.gender || M.getState().gender, back: !!s.back };
    paintAddSheet();
  }
  function paintAddSheet() {
    const kinds = M.kindChoices(pick.gender);
    const kindName = kinds.find((k) => k.id === pick.kind)?.name || '';
    const slots = pick.kind ? M.slotChoices(pick.kind, pick.gender) : [];
    over.innerHTML = `<div class="scrim" data-act="${pick.back ? 'back' : 'close-sheet'}"></div>
      <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="ah">
        <div class="sheet-h"><h2 id="ah">${pick.kind ? `가진 ${esc(kindName)} 넣기` : '가진 옷 넣기'}</h2><button type="button" class="x-btn" data-act="${pick.back ? 'back' : 'close-sheet'}" aria-label="닫기">×</button></div>
        ${pick.back ? '' : `<span class="en">Kind</span><div class="kinds">${kinds.map((k) => `<button type="button" data-act="kind" data-flow="kind-option" data-kind="${esc(k.id)}" aria-pressed="${pick.kind === k.id}">${esc(k.name)}</button>`).join('')}</div>`}
        ${slots.length > 1 ? `<span class="en">Type</span><div class="kinds">${slots.map((x) => `<button type="button" data-act="slot" data-flow="slot-option" data-slot="${esc(x.id)}" aria-pressed="${pick.slot === x.id}">${esc(x.name)}</button>`).join('')}</div>` : ''}
        ${pick.kind ? `<span class="en">Color</span><div class="swatches">${M.colorChoices().map((c) => `<button type="button" data-act="color" data-flow="color-option" data-color="${esc(c.id)}" aria-pressed="${pick.color === c.id}"><span class="sw" style="background:${esc(c.hex)}"></span>${esc(c.label)}</button>`).join('')}</div>` : ''}
        <p class="fine" style="margin:0 0 10px">사진 없이 종류·색으로 넣어요. 옷장에는 ${esc(M.note.short.similar)}으로 보여요.</p>
        <button type="button" class="btn-fill" data-act="save-garment" data-flow="closet-save">${pick.back ? '넣고 이 상품으로 돌아가기' : '옷장에 넣기'}</button>
      </div>`;
  }
  function saveGarment() {
    if (!pick.kind) { toast('종류를 골라 주세요'); return; }
    if (!pick.color) { toast('색을 골라 주세요'); return; }
    const color = M.colorChoices().find((c) => c.id === pick.color)?.label || '';
    const kindName = M.kindChoices(pick.gender).find((k) => k.id === pick.kind)?.name || '옷';
    try { M.addGarment({ kind: pick.kind, slot: pick.slot, color: pick.color, gender: pick.gender }); }
    catch (error) { toast(error.message); return; }
    const back = pick.back;
    pick = { kind: null, slot: null, color: null, gender: null, back: false };
    toast(`${color} ${kindName}${josa(kindName, '을', '를')} 옷장에 넣었어요`);
    if (back) history.back();
    else { sheet = null; render(); }
  }

  // ── 비교
  function viewCompare() {
    const c = M.compareRows();
    const k = c.items.length, cols = Math.max(2, k);
    const grid = `--cols:${cols}`;
    const col = (p) => {
      const dec = M.judge(p.id)?.record?.decision || null;
      return `<div class="cmp-col cell" data-flow="compare-item" data-product-id="${esc(p.id)}">
        <a class="cell-link" href="${href(`/p/${p.id}`)}">${ph(p)}<span class="cell-info"><span class="brand">${esc(p.brand)}</span><span class="name">${esc(p.name)}</span><span class="price">${esc(p.priceText)}<small>${esc(p.priceShort)}</small></span></span></a>
        <div class="acts">
          <button type="button" data-act="decide" data-id="${esc(p.id)}" data-d="hold" data-flow="decide-hold" aria-pressed="${dec === 'hold'}">${dec === 'hold' ? '보류함' : '보류'}</button>
          <button type="button" data-act="decide" data-id="${esc(p.id)}" data-d="buy" data-flow="decide-buy" aria-pressed="${dec === 'buy'}">사기로 함</button>
          <button type="button" class="rm" data-act="cmp-rm" data-id="${esc(p.id)}">비교함에서 빼기</button>
        </div></div>`;
    };
    const row = (r) => `<div class="cmp-row${r.same ? ' same' : ''}${r.primary ? ' primary' : ''}"><span class="en">${esc(r.label)}${r.same ? ' · 같음' : ''}</span><div class="vals" style="${grid}">${r.values.map((x) => `<div>${esc(x)}</div>`).join('')}</div></div>`;
    const prim = c.rows.filter((r) => r.primary), rest = c.rows.filter((r) => !r.primary);
    const back = last ? href('/search', { q: last.text }) : '#/';
    app.innerHTML = `<section class="cmp" data-flow="compare-view">
      <span class="en">Side by side</span>
      <h1>후보 비교 <span class="num">${k}/4</span></h1>
      ${k < 2 ? `<p>후보를 둘 이상 담으면 같은 줄에 나란히 놓고 비교해요. <a class="btn-line" href="${back}">진열대로 돌아가기</a></p>` : ''}
      ${k ? `<div class="cmp-scroll"><div class="cmp-wide" style="--minw:${k > 2 ? k * 42 : 100}%">
        <div class="cmp-cols" style="${grid}">${c.items.map(col).join('')}${k === 1 ? '<div class="cmp-col" aria-hidden="true"></div>' : ''}</div>
        <div class="cmp-rows">${prim.map(row).join('')}</div>
        ${rest.length ? `<details><summary>더 보기 · ${rest.length}줄</summary>${rest.map(row).join('')}</details>` : ''}
      </div></div><p class="fine">${esc(c.note)}</p>` : ''}
    </section>`;
  }

  // ── 기록
  let returning = null;
  function viewRecords() {
    const rs = M.getState().records;
    app.innerHTML = `<section class="page"><span class="en">Records</span><h1>기록 <span class="num">${rs.length}</span></h1><p class="fine">${esc(M.note.short.records)}이에요.</p>
      ${rs.length ? `<ul class="rows">${rs.map((r) => `<li class="rec" data-flow="record" data-product-id="${esc(r.productId)}">
        <a href="${href(`/p/${r.productId}`)}" aria-label="${esc(r.product?.name || '상품')} 상세">${ph(r, { tag: false })}</a>
        <div><span class="b">${esc(r.product?.brand)}</span><br><a class="n" href="${href(`/p/${r.productId}`)}">${esc(r.product?.name)}</a>
          <div class="num">${esc(r.product?.priceText || '')}</div>
          <div class="st">${esc(r.stageLabel)}</div>
          <div class="steps">${returning === r.productId
            ? M.returnReasons.map((x) => `<button type="button" data-act="step" data-id="${esc(r.productId)}" data-step="returned" data-reason="${esc(x.id)}" data-flow="record-step">${esc(x.label)}</button>`).join('') + '<button type="button" data-act="return-cancel">취소</button>'
            : r.next.map((s) => `<button type="button" data-act="${s.needsReason ? 'return-ask' : 'step'}" data-id="${esc(r.productId)}" data-step="${esc(s.step)}" data-flow="record-step">${esc(s.label)}</button>`).join('') + (r.stage === 'candidate' ? `<button type="button" data-act="unrecord" data-id="${esc(r.productId)}">기록 지우기</button>` : '')}</div>
        </div></li>`).join('')}</ul>` : '<p style="margin-top:16px">아직 기록이 없어요. 상품 상세에서 사기로 함·보류·안 살래요를 누르면 여기에 남아요.</p>'}
    </section>`;
  }

  // ── 옷장
  function viewCloset() {
    const st = M.getState();
    app.innerHTML = `<section class="page"><span class="en">My closet</span><h1>옷장 <span class="num">${st.closetCount}</span>벌</h1>
      <p class="fine">${st.trialCount ? `체험용 ${st.trialCount}벌 포함 · ` : ''}옷장은 선택이에요. 넣으면 상품마다 겹치는지 알려 드려요.</p>
      <div class="page-acts">
        <button type="button" class="btn-fill" data-act="closet-add-open">옷 넣기</button>
        ${st.trialCount ? '<button type="button" class="btn-line" data-act="trial-off">체험용 옷 빼기</button>' : '<button type="button" class="btn-line" data-act="trial" data-flow="trial-closet">체험용 옷 넣어 보기</button>'}
        <button type="button" class="btn-line" data-act="reset" data-flow="reset">처음부터</button>
      </div>
      ${st.closetCount ? `<div class="closet-grid">${st.closet.map((g) => `<div class="g">${ph(g, { tag: false })}<div class="t">${esc(g.label)}<span class="fine">${esc(g.sourceLabel)}${g.detailMissing ? ` · ${esc(g.detailMissing)}` : ''}</span></div>${g.trial ? '' : `<button type="button" class="rmv" data-act="g-remove" data-id="${esc(g.id)}">빼기</button>`}</div>`).join('')}</div>` : ''}
    </section>`;
    if (sheet === 'closet-add') paintAddSheet();
  }

  // ── 비교함(아래 고정)
  function drawTray() {
    const ids = M.compareList();
    const slots = [0, 1, 2, 3].map((i) => (ids[i] ? `<span class="slot on">${ph({ id: ids[i] }, { tag: false })}</span>` : '<span class="slot" aria-hidden="true"></span>')).join('');
    tray.innerHTML = `<div class="tray-in"><div class="slots">${slots}</div>
      <div class="lab"><b>${ids.length}/4</b> 비교함${ids.length < 2 ? '<span class="hint">둘 이상 담으면 나란히 봐요</span>' : ''}</div>
      <a class="open" href="#/compare" data-flow="compare-open"${ids.length < 2 ? ' aria-disabled="true"' : ''}>비교 보기 →</a></div>`;
  }
  function syncCompare(id) {
    const on = M.compareHas(id);
    for (const b of $$(`[data-act="cmp"][data-product-id="${CSS.escape(id)}"]`)) {
      b.setAttribute('aria-pressed', String(on));
      if (b.classList.contains('cmp-toggle')) { b.textContent = on ? '✓' : '+'; b.setAttribute('aria-label', b.getAttribute('aria-label').replace(/비교함(에서 빼기|에 담기)$/, on ? '비교함에서 빼기' : '비교함에 담기')); }
      else { b.textContent = on ? '비교함에 있음 ✓' : '비교함에 담기'; b.className = on ? 'btn-line' : 'btn-fill'; }
    }
    drawTray();
  }

  // ── 검색 제안
  function showSugs(input) {
    const box = input.closest('form')?.querySelector('.sugs');
    if (!box) return;
    const list = document.activeElement === input ? M.searchSuggestions(input.value, { limit: 6 }) : [];
    if (!list.length) { box.hidden = true; return; }
    box.innerHTML = list.map((s) => `<button type="button" class="sug" role="option" data-act="ask" data-q="${esc(s.q)}"><span class="en">${s.kind === 'recent' ? 'Recent' : s.kind === 'kind' ? 'Kind' : 'Ex.'}</span>${esc(s.q)}</button>`).join('');
    box.hidden = false;
  }
  const hideSugs = () => $$('.sugs').forEach((b) => { b.hidden = true; });

  // ── 화면 고르기
  const measureTop = () => document.documentElement.style.setProperty('--top-h', `${$('.top').offsetHeight}px`);
  function render(route = M.route.current()) {
    const [, a, b] = route.path.split('/');
    const view = a === 'search' ? 'search' : a === 'p' && b ? 'pdp' : a === 'compare' ? 'compare' : a === 'records' ? 'records' : a === 'closet' ? 'closet' : 'home';
    if (view !== 'search' && sheet === 'filter') sheet = null;
    if (view !== 'closet' && sheet === 'closet-add') sheet = null;
    if (view !== 'records') returning = null;
    document.body.dataset.view = view;
    over.innerHTML = '';
    hideSugs();
    for (const el of $$('.top-nav a')) el.toggleAttribute('aria-current', el.getAttribute('href') === `#/${a}`);
    if (view === 'search') viewSearch(route.params);
    else if (view === 'pdp') viewPdp(decodeURIComponent(b), route.params);
    else if (view === 'compare') viewCompare();
    else if (view === 'records') viewRecords();
    else if (view === 'closet') viewCloset();
    else viewHome();
    tray.hidden = view === 'compare';
    drawTray();
    measureTop();
  }
  const rerender = () => render();

  // ── 누르기(위임)
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-act]');
    if (!t) return;
    const act = t.dataset.act;
    const route = M.route.current();
    const id = t.dataset.id || t.dataset.productId;
    switch (act) {
      case 'disclosure': M.openDisclosure(); break;
      case 'ask': hideSugs(); go('/search', { q: t.dataset.q }); break;
      case 'gender': M.setGender(t.dataset.g); rerender(); break;
      case 'drop': {
        const r = current?.r; if (!r) break;
        go('/search', { q: r.text, drop: [...r.dropped, t.dataset.key].join(',') });
        break;
      }
      case 'relax': go('/search', { q: current?.r.text || route.params.q, drop: t.dataset.drop }); break;
      case 'facet': {
        if (t.getAttribute('aria-disabled') === 'true') break;
        const f = parseF(route.params.f), k = t.dataset.g, v = t.dataset.v;
        if (!f.has(k)) f.set(k, new Set());
        if (f.get(k).has(v)) f.get(k).delete(v); else f.get(k).add(v);
        go('/search', { ...route.params, f: fmtF(f) }, { replace: true });
        break;
      }
      case 'facet-clear': go('/search', { ...route.params, f: '' }, { replace: true }); break;
      case 'open-filter': sheet = 'filter'; drawFilterSheet(); break;
      case 'close-sheet': sheet = null; over.innerHTML = ''; break;
      case 'cmp': {
        try {
          if (M.compareHas(id)) M.compareRemove(id); else M.compareAdd(id);
          if (M.compareHas(id)) toast(`비교함 ${M.compareList().length}/4`);
        } catch (error) { toast(error.message); }
        syncCompare(id);
        break;
      }
      case 'cmp-rm': M.compareRemove(id); rerender(); break;
      case 'zoom': go(route.path, { view: 'photo' }); break;
      case 'add': go(route.path, { add: 1 }); break;
      case 'back': history.back(); break;
      case 'kind': pick.kind = t.dataset.kind; pick.slot = null; pick.color = null; paintAddSheet(); break;
      case 'slot': pick.slot = t.dataset.slot; paintAddSheet(); break;
      case 'color': pick.color = t.dataset.color; for (const b of $$('[data-act="color"]')) b.setAttribute('aria-pressed', String(b === t)); break;
      case 'save-garment': saveGarment(); break;
      case 'closet-add-open': sheet = 'closet-add'; drawAddSheet({ back: false }); break;
      case 'decide': {
        const pid = t.dataset.id, d = t.dataset.d;
        const before = M.judge(pid)?.record?.decision || null;
        try { M.decide(pid, d); } catch (error) { toast(error.message); break; }
        const label = { buy: '사기로 함', hold: '보류', skip: '안 살래요' }[d];
        rerender();
        toast(`${label}${josa(label, '으로', '로')} 기록했어요`, before ? null : { label: '되돌리기', run: () => { try { M.removeRecord(pid); } catch (error) { toast(error.message); } rerender(); } });
        break;
      }
      case 'step': {
        try { M.advance(t.dataset.id, t.dataset.step, { reason: t.dataset.reason || null }); } catch (error) { toast(error.message); }
        returning = null; rerender();
        break;
      }
      case 'return-ask': returning = t.dataset.id; rerender(); break;
      case 'return-cancel': returning = null; rerender(); break;
      case 'unrecord': try { M.removeRecord(t.dataset.id); } catch (error) { toast(error.message); } rerender(); break;
      case 'trial': M.loadTrialCloset(); toast('체험용 옷을 넣었어요. 내 옷과 따로 표시돼요'); rerender(); break;
      case 'trial-off': M.clearTrialCloset(); rerender(); break;
      case 'g-remove': try { M.removeGarment(t.dataset.id); } catch (error) { toast(error.message); } rerender(); break;
      case 'reset':
        if (window.confirm('옷장·기록·비교함을 모두 지우고 처음부터 시작할까요?')) { M.reset(); last = null; asked.clear(); go('/'); rerender(); }
        break;
      default: break;
    }
  });
  document.addEventListener('submit', (e) => {
    const form = e.target;
    if (!form.matches('#topSearch, .home-search')) return;
    e.preventDefault();
    const q = form.q.value.trim();
    if (!q) { form.q.focus(); return; }
    hideSugs();
    form.q.blur();
    go('/search', { q });
  });
  document.addEventListener('change', (e) => {
    if (e.target.id !== 'sort') return;
    const route = M.route.current();
    go('/search', { ...route.params, s: e.target.value }, { replace: true });
  });
  document.addEventListener('input', (e) => { if (e.target.matches('[data-flow="ask-input"]')) showSugs(e.target); });
  document.addEventListener('focusin', (e) => { if (e.target.matches('[data-flow="ask-input"]')) showSugs(e.target); });
  document.addEventListener('focusout', (e) => { if (e.target.matches('[data-flow="ask-input"]')) setTimeout(() => { if (!document.activeElement?.closest('.sugs')) hideSugs(); }, 120); });
  document.addEventListener('pointerdown', (e) => { if (e.target.closest('.sugs')) e.preventDefault(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (document.querySelector('#eo-disclosure[open]')) return;
      if ($('.sugs:not([hidden])')) { hideSugs(); return; }
      const p = M.route.current().params;
      if (p.view === 'photo' || p.add) { history.back(); return; }
      if (sheet) { sheet = null; over.innerHTML = ''; }
      return;
    }
    if (document.body.dataset.view === 'pdp' && !over.innerHTML && !/input|select|textarea/i.test(document.activeElement?.tagName || '')) {
      const link = e.key === 'ArrowLeft' ? $('.nav2 a[aria-label*="앞"]') : e.key === 'ArrowRight' ? $('.nav2 a[aria-label*="다음"]') : null;
      if (link) { e.preventDefault(); location.hash = link.getAttribute('href'); }
    }
  });
  window.addEventListener('resize', measureTop);
  M.subscribe(() => { if (document.body.dataset.view !== 'compare') drawTray(); });
  $('[data-flow="mock-label"]').dataset.act = 'disclosure';

  if (M.boot.q && !location.hash) history.replaceState(null, '', M.route.href('/search', { q: M.boot.q }));
  M.route.on(render);
})();
