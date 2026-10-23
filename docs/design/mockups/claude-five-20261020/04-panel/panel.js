// 시안 04 · 사진과 선택 패널
// 화면: 처음(한 줄 요청) → 결과(무대 + 선택 패널 + 후보 필름 줄) → 상세(같은 무대를 넓혀 사실·내 옷과·새 상품/중고·한 벌·다른 선택)
//       → 비교(나란히 무대) → 기록 → 옷장. 주소는 EoulMock.route(#/search?q=…, #/p/<id> …)라 뒤로가기가 그대로 동작한다.
// 판단·문장은 모두 코어(EoulMock)에서 온다. 이 파일은 그리기와 조작만 한다.
(() => {
  const M = window.EoulMock;
  const FLAT = window.PHOTO_FLAT || new Set();
  const $main = document.getElementById('main');
  const $layer = document.getElementById('layer');
  const $cmpN = document.getElementById('cmp-n');
  const $toast = document.getElementById('toast');
  const wide = window.matchMedia('(min-width: 960px)');
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const go = (path, params, opt) => M.route.go(path, params, opt);
  const href = (path, params) => M.route.href(path, params);
  const chev = (dir) => `<svg viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${dir === 'left' ? 'M12.5 4.5 7 10l5.5 5.5' : dir === 'up' ? 'M4.5 12.5 10 7l5.5 5.5' : 'M7.5 4.5 13 10l-5.5 5.5'}"/></svg>`;

  // ── 사진: 흰 배경 단독 사진은 바탕에 녹여 가운데(여백), 모델·연출 사진은 칸을 가득. 한 칸 안에서 섞지 않는다.
  function isFlat(target) {
    const ph = M.photo(target);
    if (!ph) return false;
    const m = /goods_img\/\d+\/(\d+)\//.exec(ph.src) || /(\d+)\.jpg$/.exec(ph.src);
    return !!m && FLAT.has(`ms-${m[1]}`);
  }
  function pic(target, { eager = false, cls = '' } = {}) {
    const ph = M.photo(target);
    const flat = ph ? isFlat(target) : false;
    return `<span class="pic ${ph ? (flat ? 'is-flat' : 'is-model') : 'is-none'} ${cls}">${M.photoHtml(target, { eager, fit: flat ? 'contain' : 'cover' })}</span>`;
  }

  // ── 알림(되돌리기 하나까지)
  let toastTimer = 0;
  function toast(text, action = null) {
    clearTimeout(toastTimer);
    $toast.innerHTML = `<span>${esc(text)}</span>${action ? `<button type="button" data-toast-act>${esc(action.label)}</button>` : ''}`;
    $toast.classList.add('on');
    $toast.onclick = (e) => { if (e.target.closest('[data-toast-act]')) { action.run(); hideToast(); } };
    toastTimer = setTimeout(hideToast, action ? 5000 : 2600);
  }
  function hideToast() { $toast.classList.remove('on'); $toast.innerHTML = ''; }

  function askForm(value = '', compact = false) {
    const id = compact ? 'ask-c' : 'ask-h';
    return `<form class="ask ${compact ? 'is-compact' : ''}" role="search" data-ask>
      <label class="sr" for="${id}">찾을 옷</label>
      <input id="${id}" name="q" type="search" data-flow="ask-input" value="${esc(value)}" placeholder="예: 출근용 셔츠 10만원 이하" autocomplete="off" enterkeyhint="search">
      <button class="btn ink" data-flow="ask-submit">찾기</button>
    </form>`;
  }

  // ── 처음 화면: 한 줄로 시작. 옷장은 선택.
  function home() {
    const sug = M.suggest({ limit: 8 });
    $main.innerHTML = `<section class="home" aria-labelledby="home-t">
        <p class="k">한 줄이면 돼요</p>
        <h1 id="home-t">어떤 옷을 찾으세요?</h1>
        ${askForm('')}
        <div class="sugs" id="sugs">${sugChips('')}</div>
        <p class="quiet">옷장 없이 시작해도 돼요. 가진 옷은 상품을 보다가 필요할 때만 넣어요.</p>
      </section>
      ${sug.items.length ? `<section class="home-shelf" aria-labelledby="shelf-t">
        <h2 id="shelf-t">${esc(sug.title)}</h2>
        <ul class="alts">${sug.items.map((p) => altCard(p, { compare: false })).join('')}</ul>
      </section>` : ''}`;
  }
  function sugChips(text) {
    return M.searchSuggestions(text).map((s) => `<button type="button" class="chip" data-flow="example" data-q="${esc(s.q)}">${s.kind === 'recent' ? '<span class="small" style="margin:0">최근</span> ' : ''}${esc(s.q)}</button>`).join('');
  }

  // ── 결과: 무대(한 벌) + 선택 패널 + 필름 줄
  let last = null; // 이어서 묻기(‘더 싼 걸로’)에 쓰는 마지막 결과
  let view = null; // { r, list, key, focus }
  const focusMemo = new Map(); // 주소별로 무대에 올렸던 후보(뒤로가기로 돌아오면 그대로)
  let sheet = 'peek';

  function search(params) {
    const q = (params.q || '').trim();
    if (!q) { home(); return; }
    const drop = params.drop ? params.drop.split(',').filter(Boolean) : [];
    const r = M.ask(q, { drop, previous: last && last.text !== q ? last : null });
    if (r.understood) last = r;
    const list = [...r.products.map((p) => ({ p, off: false })), ...r.offOccasion.map((p) => ({ p, off: true }))];
    const key = location.hash;
    const remembered = list.findIndex((x) => x.p.id === focusMemo.get(key));
    view = { r, list, key, focus: Math.max(0, remembered) };
    const chips = r.conditions.map((c) => (c.removable
      ? `<button type="button" class="chip cond" data-flow="condition-remove" data-key="${esc(c.key)}" data-drop="${esc([...r.dropped, c.key].join(','))}" aria-label="${esc(c.label)} 조건 빼기">${esc(c.label)} <span class="x" aria-hidden="true">×</span></button>`
      : `<span class="chip fixed">${esc(c.label)}</span>`)).join('');
    const notes = r.notices.filter((n) => n.kind !== 'empty' && n.kind !== 'kind-unavailable' && n.kind !== 'not-understood').slice(0, 2);
    const scope = `<div class="scope">
        ${askForm(r.text, true)}
        ${chips ? `<div class="chips" aria-label="검색 범위">${chips}</div>` : ''}
        ${list.length ? `<div class="rhead"><h1 class="rtitle"><span class="t">${esc(r.title)}</span><span class="count">${r.products.length}개${r.offOccasion.length ? ` + 덜 맞는 ${r.offOccasion.length}` : ''}</span></h1><p class="meta">${esc(r.listNote)}</p></div>` : ''}
        ${notes.length && list.length ? `<div class="notes">${notes.map((n) => `<p>${esc(n.text)}</p>`).join('')}</div>` : ''}
      </div>`;
    if (!list.length) { document.body.classList.remove('has-sheet'); $main.innerHTML = `<section class="results is-empty">${scope}${emptyHtml(r)}</section>`; return; }
    document.body.classList.add('has-sheet');
    const offStart = r.products.length;
    $main.innerHTML = `<section class="results" aria-label="검색 결과">
        ${scope}
        <div class="floor">
          <div class="stage" id="stage"></div>
          <aside class="panel" id="panel" data-sheet="${sheet}" aria-label="선택한 후보"></aside>
        </div>
        <div class="strip-head"><h2>후보 ${list.length}</h2><span class="hint">눌러서 무대에 올리고, 한 번 더 누르면 자세히</span></div>
        <ol class="strip" id="strip" aria-label="후보 목록">${list.map((x, i) => `${i === offStart && x.off ? `<li class="divider" aria-hidden="true"><span>${esc(r.offOccasionTitle)}</span></li>` : ''}<li>
          <button type="button" class="frame ${x.off ? 'is-off' : ''}" data-flow="result" data-product-id="${esc(x.p.id)}" data-i="${i}" aria-current="${i === view.focus}" aria-label="${i + 1}번째 후보 · ${esc(x.p.brand)} ${esc(x.p.name)}">
            ${pic(x.p)}<span class="f-no">${i + 1}</span><span class="f-brand">${esc(x.p.brand)}</span>
          </button></li>`).join('')}</ol>
      </section>`;
    paintFocus(false);
    centerFrame();
  }

  function stageHtml(x, i, n) {
    const p = x.p;
    return `<button type="button" class="stage-pic" data-flow="result" data-product-id="${esc(p.id)}" aria-label="${esc(p.brand)} ${esc(p.name)} 자세히 보기">${pic(p, { eager: true })}</button>
      <div class="stage-nav"><button type="button" class="arrow" data-step="-1" aria-label="이전 후보">${chev('left')}</button><span class="pos" aria-live="polite">${i + 1} / ${n}</span><button type="button" class="arrow" data-step="1" aria-label="다음 후보">${chev('right')}</button></div>`;
  }
  function panelHtml(x, i, n) {
    const p = x.p;
    const v = M.judge(p.id);
    const has = M.compareHas(p.id);
    const rec = v?.record;
    const mine = p.owned.tone === 'none' ? (v?.title || '옷장 없이 고른 후보예요') : p.owned.text || p.owned.label;
    return `<span class="grip" aria-hidden="true"></span>
      <p class="p-pos">${i + 1}번째 후보${x.off ? ` · ${esc(view.r.offOccasionTitle)}` : ''}</p>
      <p class="p-brand">${esc(p.brand)}</p>
      <h2 class="p-name">${esc(p.name)}</h2>
      <p class="p-price"><span class="num">${esc(p.priceText)}</span><span class="when">${esc(p.priceShort)}</span></p>
      <p class="p-why">${esc(p.reason)}</p>
      <p class="p-mine tone-${esc(p.owned.tone)}"><span class="k">내 옷과</span><span>${esc(mine)}</span></p>
      <div class="p-acts">
        <button type="button" class="btn ${has ? 'line' : 'ink'}" data-flow="compare-add" data-product-id="${esc(p.id)}" aria-pressed="${has}">${has ? '비교함에 담김' : '비교에 담기'}</button>
        <a class="btn line" href="${href(`/p/${p.id}`)}">자세히</a>
        <button type="button" class="btn ghost p-toggle" data-sheet-toggle aria-expanded="${sheet === 'full'}" aria-label="${sheet === 'full' ? '패널 접기' : '패널 더 보기'}">${chev('up')}</button>
      </div>
      <div class="p-more">
        <div class="row">
          <button type="button" class="btn line" data-decide="hold" data-id="${esc(p.id)}" aria-pressed="${rec?.decision === 'hold'}">${rec?.decision === 'hold' ? '보류함' : '보류'}</button>
          <a class="btn ghost" href="${href(`/p/${p.id}`, { to: 'used' })}">중고 찾아보기</a>
        </div>
        ${rec ? `<p class="small">기록: ${esc(rec.stageLabel)}</p>` : ''}
        ${p.rating ? `<p class="small">평점 ${esc(p.rating)} · 후기 ${Number(p.reviews || 0).toLocaleString('ko-KR')}개</p>` : ''}
      </div>`;
  }
  function paintFocus(animate = true) {
    if (!view?.list.length) return;
    const n = view.list.length, i = view.focus, x = view.list[i];
    const $stage = document.getElementById('stage'), $panel = document.getElementById('panel');
    if (!$stage || !$panel) return;
    $stage.innerHTML = stageHtml(x, i, n);
    $panel.innerHTML = panelHtml(x, i, n);
    $panel.dataset.sheet = sheet;
    if (animate) { $stage.classList.remove('swap'); void $stage.offsetWidth; $stage.classList.add('swap'); }
    document.querySelectorAll('#strip .frame').forEach((f) => f.setAttribute('aria-current', String(Number(f.dataset.i) === i)));
  }
  function centerFrame(smooth = false) {
    const strip = document.getElementById('strip');
    const f = strip?.querySelector(`.frame[data-i="${view.focus}"]`);
    if (!f) return;
    const li = f.parentElement;
    const left = li.offsetLeft - strip.offsetLeft - (strip.clientWidth - li.offsetWidth) / 2;
    strip.scrollTo({ left: Math.max(0, left), behavior: smooth ? 'smooth' : 'auto' });
  }
  function setFocus(i) {
    if (!view?.list.length) return;
    const n = view.list.length;
    view.focus = ((i % n) + n) % n;
    focusMemo.set(view.key, view.list[view.focus].p.id);
    paintFocus(true);
    centerFrame(true);
  }

  function emptyHtml(r) {
    const options = M.relax(r);
    const notes = r.notices.map((n) => `<p>${esc(n.text)}</p>`).join('');
    return `<div class="empty">
      <h1>${esc(r.title)}</h1>
      <div class="notes">${notes}</div>
      ${options.length ? `<p class="k" style="margin-top:16px">직접 골라 다시 찾기</p><div class="relax-list">${options.map((o) => `<button type="button" class="relax" data-flow="empty-action" data-drop="${esc(o.drop.join(','))}">
          <span class="thumbs">${o.preview.map((p) => pic(p)).join('')}</span><span><b>${esc(o.title)}</b><br><span class="small">조건 하나를 빼고 찾아요</span></span></button>`).join('')}</div>` : ''}
      <p class="k" style="margin-top:16px">이렇게 적어 보세요</p>
      <div class="sugs">${(r.examples || M.examples()).slice(0, 6).map((q) => `<button type="button" class="chip" data-flow="example" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>
    </div>`;
  }

  // ── 상세: 같은 무대를 넓힌다
  function lookHtml(o) {
    if (!o?.pieces?.length) return '';
    return `<p class="look-t">${esc(o.title)}</p>
      <ol class="look-row">${o.pieces.map((pc) => {
        const tag = pc.owned ? (pc.trial ? '체험용 옷' : '내 옷') : pc.focus || pc.candidate ? '이 상품' : pc.product ? pc.product.priceText : '';
        const body = `${pic(pc)}<span class="role">${esc(pc.roleLabel || pc.kindName)}</span><span class="pl">${esc(tag)}</span>`;
        return `<li class="piece ${pc.focus || pc.candidate ? 'is-focus' : ''}">${pc.product && !pc.focus && !pc.candidate ? `<button type="button" data-open="${esc(pc.product.id)}" aria-label="${esc(pc.label)} 자세히">${body}</button>` : `<div>${body}</div>`}</li>`;
      }).join('<li class="plus" aria-hidden="true">+</li>')}</ol>
      ${o.note ? `<p class="small">${esc(o.note)}</p>` : ''}`;
  }
  function altCard(p, { compare = true } = {}) {
    const has = M.compareHas(p.id);
    return `<li><button type="button" class="open" data-open="${esc(p.id)}" aria-label="${esc(p.brand)} ${esc(p.name)} 자세히">${pic(p)}<span class="a-brand">${esc(p.brand)}</span><span class="a-name">${esc(p.name)}</span><span class="a-price">${esc(p.priceText)}</span><span class="a-when">${esc(p.priceShort)}</span></button>
      ${compare ? `<button type="button" class="chip" data-flow="compare-add" data-product-id="${esc(p.id)}" aria-pressed="${has}">${has ? '비교함에 담김' : '비교에 담기'}</button>` : ''}</li>`;
  }
  function pdp(id, params) {
    document.body.classList.remove('has-sheet');
    const d = M.product(id);
    if (!d) { $main.innerHTML = `<section class="page"><h1>상품을 찾지 못했어요</h1><p><a class="btn line" href="#/">처음으로</a></p></section>`; return; }
    const v = d.verdict, nu = M.newVsUsed(id), rec = v.record, has = M.compareHas(id);
    const dec = (k, label) => `<button type="button" class="btn ${k === 'hold' ? 'line' : 'ghost'}" data-flow="decide-${k}" data-decide="${k}" data-id="${esc(id)}" aria-pressed="${rec?.decision === k}">${rec?.decision === k ? `${label} ✓` : label}</button>`;
    const owned = v.owned?.length ? `<div class="owned-row">${v.owned.slice(0, 6).map((g) => `<figure>${pic(g)}<figcaption>${esc(g.label)}<br>${esc(g.relationLabel)}${g.trial ? ' · 체험용' : ''}</figcaption></figure>`).join('')}</div>` : '';
    const askOwn = v.ask ? `<div class="ask-own"><p>${esc(v.ask.question)}</p>${v.ask.choices.map((c) => `<button type="button" class="chip" data-own="${esc(c.id)}" data-id="${esc(id)}" aria-pressed="${v.ask.value === c.id}">${esc(c.label)}</button>`).join('')}</div>` : '';
    const look = v.looks?.length ? v.looks[0] : null;
    $main.innerHTML = `<article class="pdp" data-flow="pdp" aria-labelledby="pdp-name">
      <div class="pdp-stage">
        <button type="button" class="pdp-pic" data-flow="photo-zoom" aria-label="사진 크게 보기">${pic(d, { eager: true })}<span class="zoom-hint">크게 보기</span></button>
      </div>
      <div class="pdp-panel">
        <button type="button" class="back" data-back>${chev('left')}<span>후보로</span></button>
        <p class="p-brand" data-flow="pdp-brand">${esc(d.brand)}</p>
        <h1 class="p-name" id="pdp-name" data-flow="pdp-name">${esc(d.name)}</h1>
        <p class="p-price"><span class="num" data-flow="pdp-price">${esc(d.priceText)}</span><span class="when">${esc(d.priceShort)} · ${esc(d.store)}</span></p>
        <p class="p-why">${esc(d.why[0] || d.reason)}</p>
        <div class="d-acts">
          <button type="button" class="btn ${has ? 'line' : 'ink'}" data-flow="compare-add" data-product-id="${esc(id)}" aria-pressed="${has}">${has ? '비교함에 담김' : '비교에 담기'}</button>
          ${dec('hold', '보류')}${dec('buy', '사기로 함')}${dec('skip', '안 살래요')}
        </div>
        <p class="d-rec">${rec ? `<span>기록: ${esc(rec.stageLabel)}</span>${rec.stage === 'candidate' ? `<button type="button" data-undo="${esc(id)}">기록 지우기</button>` : ''}<a href="#/records">기록 보기</a>` : ''}</p>

        <section class="block" aria-labelledby="mine-t">
          <h2 class="bh" id="mine-t">내 옷과 <small>${esc(v.basisLabel)}</small></h2>
          <p class="verdict-t"><span data-flow="verdict">${esc(v.title)}</span></p>
          <div class="lines">${v.lines.map((l) => `<p>${esc(l)}</p>`).join('')}${(v.cautions || []).map((l) => `<p>${esc(l)}</p>`).join('')}</div>
          ${owned}${askOwn}
          ${look ? `<div style="margin-top:12px">${lookHtml(look)}</div>` : ''}
          <p style="margin:12px 0 0"><button type="button" class="btn line" data-flow="closet-add">가진 ${esc(v.addSuggestion?.kindName || '옷')} 넣고 비교</button></p>
        </section>

        <section class="block" id="used" aria-labelledby="nu-t">
          <h2 class="bh" id="nu-t">새 상품 · 중고</h2>
          <div class="nu-grid">
            <div>
              <p class="k">새 상품</p>
              <p class="serif">${esc(nu.fresh.priceText)}</p>
              <p class="small">${esc(nu.fresh.priceNote)} · ${esc(nu.fresh.store)}</p>
              <p class="small">${esc(nu.fresh.photoNote)}</p>
              <a class="btn line" data-flow="seller-link" href="${esc(d.url)}" target="_blank" rel="noopener noreferrer">무신사에서 보기</a>
            </div>
            <div data-flow="used-search">
              <p class="k">중고</p>
              <p class="serif">매물마다 달라요</p>
              <p class="small">${esc(M.note.short.used)}</p>
              <div class="links">${nu.used.groups.map((g) => `<span class="grp">${esc(g.region)}</span>${g.links.map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.label)}</a>`).join('')}`).join('')}</div>
            </div>
          </div>
          <p class="small">${esc(nu.used.note)}</p>
        </section>

        <section class="block" aria-labelledby="facts-t">
          <h2 class="bh" id="facts-t">이 상품</h2>
          <dl class="facts">
            <dt>종류</dt><dd>${esc(d.slotName)}</dd>
            <dt>색</dt><dd>${esc(d.colorLabel)} <span class="small">${esc(d.colorNote)}</span></dd>
            ${d.popularity ? `<dt>평점·후기</dt><dd>${esc(d.popularity)}</dd>` : ''}
            ${d.why.length > 1 ? `<dt>더 본 점</dt><dd>${d.why.slice(1).map(esc).join('<br>')}</dd>` : ''}
            ${d.tip ? `<dt>입는 법</dt><dd>${esc(d.tip.replace(/^이렇게 입어요:\s*/, ''))}</dd>` : ''}
            <dt>사이즈·실착</dt><dd>판매처에서 확인해 주세요</dd>
          </dl>
        </section>

        ${d.outfit ? `<section class="block" aria-labelledby="look-t"><h2 class="bh" id="look-t">이 옷으로 입는 한 벌 <small>규칙으로 조합한 예시</small></h2>${lookHtml(d.outfit)}${d.outfitNote ? `<p class="small">${esc(d.outfitNote)}</p>` : ''}</section>` : d.outfitNote ? `<section class="block"><p class="small">${esc(d.outfitNote)}</p></section>` : ''}

        ${d.alternatives.length ? `<section class="block" aria-labelledby="alt-t"><h2 class="bh" id="alt-t">같은 조건 다른 선택 <small>${d.alternatives.length}개</small></h2>
          <ul class="alts">${d.alternatives.map((p) => altCard(p)).join('')}</ul>
          ${d.alternativesNote ? `<p class="small">${esc(d.alternativesNote)}</p>` : ''}</section>` : ''}
      </div>
    </article>`;
    if (params.view === 'photo') openViewer(d);
    else if (params.add) openAdd(v);
    else if (params.to === 'used') requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById('used')?.scrollIntoView({ block: 'start' })));
  }
  function openViewer(d) {
    $layer.innerHTML = `<div class="viewer" data-flow="photo-viewer" role="dialog" aria-modal="true" aria-label="사진 크게 보기">
      <div class="viewer-pic">${M.photoHtml(d, { fit: 'contain', eager: true })}</div>
      <div class="viewer-bar"><span>${esc(d.brand)} · ${esc(d.name)}</span><button type="button" class="btn line" data-close>닫기</button></div>
    </div>`;
    $layer.querySelector('[data-close]').focus();
  }
  let picked = null;
  function openAdd(v) {
    const s = v.addSuggestion;
    picked = null;
    $layer.innerHTML = `<div class="scrim" data-close></div>
      <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="add-t">
        <h2 id="add-t">가진 ${esc(s.kindName)}, 무슨 색인가요?</h2>
        <p class="small">종류는 이 상품과 같은 ${esc(s.slotName)}로 넣어요. 사진 없이 종류·색만 저장해요.</p>
        <div class="kinds"><button type="button" class="chip" data-flow="kind-option" data-kind="${esc(s.kind)}" aria-pressed="true">${esc(s.kindName)}</button></div>
        <div class="swatches">${M.colorChoices().map((c) => `<button type="button" class="sw" data-flow="color-option" data-color="${esc(c.id)}" aria-pressed="false"><span class="dot" style="background:${esc(c.hex)}"></span>${esc(c.label)}</button>`).join('')}</div>
        <div class="stack">
          <button type="button" class="btn ink wide" data-flow="closet-save" data-kind="${esc(s.kind)}" data-slot="${esc(s.slot)}" disabled>넣고 이 상품으로 돌아가기</button>
          <button type="button" class="btn line wide" data-close>닫기</button>
        </div>
      </div>`;
    $layer.querySelector('.sw')?.focus();
  }

  // ── 비교: 나란히 무대
  function compare() {
    document.body.classList.remove('has-sheet');
    const c = M.compareRows();
    const n = c.items.length;
    const prim = c.rows.filter((r) => r.primary), rest = c.rows.filter((r) => !r.primary);
    const table = (rows) => `<table class="cmp-table"><tbody>${rows.map((r) => `<tr class="${r.same ? 'same' : ''}"><th scope="row">${esc(r.label)}</th>${r.values.map((x) => `<td>${esc(x)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    $main.innerHTML = `<section class="cmp" data-flow="compare-view" aria-labelledby="cmp-t">
      <h1 id="cmp-t">후보 비교 <span class="small">${n}개</span></h1>
      ${n < 2 ? `<p>후보를 둘 이상 담으면 나란히 비교해요. 결과나 상세에서 ‘비교에 담기’를 눌러 주세요.</p>` : ''}
      ${n ? `<div class="cmp-items" style="--n:${n}">${c.items.map((p) => {
        const rec = M.judge(p.id)?.record;
        return `<div class="cmp-item" data-flow="compare-item" data-product-id="${esc(p.id)}">
          <a class="open" href="${href(`/p/${p.id}`)}">${pic(p)}<p class="p-brand">${esc(p.brand)}</p><p class="c-name">${esc(p.name)}</p><span class="c-price">${esc(p.priceText)}</span> <span class="c-when">${esc(p.priceShort)}</span></a>
          <div class="c-acts">
            <button type="button" class="btn line" data-flow="decide-hold" data-decide="hold" data-id="${esc(p.id)}" aria-pressed="${rec?.decision === 'hold'}">${rec?.decision === 'hold' ? '보류함' : '보류'}</button>
            <button type="button" class="btn ghost" data-cmp-remove="${esc(p.id)}">빼기</button>
          </div></div>`;
      }).join('')}</div>` : ''}
      ${n ? table(prim) : ''}
      ${n && rest.length ? `<details><summary>더 비교하기</summary>${table(rest)}</details>` : ''}
      ${n ? `<p class="small">${esc(c.note)}</p>` : ''}
      ${n ? `<p style="margin-top:14px"><button type="button" class="btn ghost" data-cmp-clear>비교함 비우기</button></p>` : ''}
    </section>`;
  }

  // ── 기록
  let returning = null;
  function records() {
    document.body.classList.remove('has-sheet');
    const rs = M.getState().records;
    $main.innerHTML = `<section class="page" aria-labelledby="rec-t">
      <h1 id="rec-t">기록</h1>
      <p class="small">${esc(M.note.short.records)} · 이 브라우저에만 저장돼요</p>
      ${rs.length ? `<ul class="rec-list">${rs.map((r) => `<li class="rec" data-flow="record" data-product-id="${esc(r.productId)}">
        <a href="${href(`/p/${r.productId}`)}" aria-label="${esc(r.product?.brand)} ${esc(r.product?.name)} 자세히">${pic(r)}</a>
        <div>
          <p class="r-stage">${esc(r.stageLabel)}</p>
          <p class="p-brand" style="font-size:12px">${esc(r.product?.brand)}</p>
          <p class="r-name">${esc(r.product?.name)}</p>
          <p class="small">${esc(r.product?.priceText)} ${esc(M.product(r.productId, { criteria: null })?.priceShort || '수집가')}${r.wearCount ? ` · ${r.wearCount}번 입음` : ''}${r.returnReasonLabel ? ` · 반품 사유 ${esc(r.returnReasonLabel)}` : ''}</p>
          <div class="r-acts">${returning === r.productId
            ? `${M.returnReasons.map((x) => `<button type="button" class="btn line" data-flow="record-step" data-step="returned" data-reason="${esc(x.id)}" data-id="${esc(r.productId)}">${esc(x.label)}</button>`).join('')}<button type="button" class="btn ghost" data-return-cancel>취소</button>`
            : `${(r.next || []).map((s) => `<button type="button" class="btn line" data-flow="record-step" data-step="${esc(s.step)}" data-id="${esc(r.productId)}"${s.needsReason ? ' data-needs-reason="1"' : ''}>${esc(s.label)}</button>`).join('')}${r.stage === 'candidate' ? `<button type="button" class="btn ghost" data-undo="${esc(r.productId)}">기록 지우기</button>` : ''}`}</div>
        </div></li>`).join('')}</ul>` : `<p style="margin-top:16px">아직 기록이 없어요. 상품 상세에서 보류·사기로 함을 누르면 여기에 남아요.</p><p><a class="btn line" href="#/">찾으러 가기</a></p>`}
    </section>`;
  }

  // ── 옷장(선택)
  let draft = { kind: null, slot: null, color: null };
  let confirmKey = null;
  function closet() {
    document.body.classList.remove('has-sheet');
    const st = M.getState();
    const kinds = M.kindChoices();
    const slots = draft.kind ? M.slotChoices(draft.kind) : [];
    $main.innerHTML = `<section class="page" aria-labelledby="closet-t">
      <h1 id="closet-t">옷장 <span class="small">${st.closetCount}벌</span></h1>
      <p class="small">옷장은 선택이에요. 넣어 두면 상품마다 겹치는지, 새 조합이 생기는지 알려 드려요.</p>
      <div class="addbox">
        <h2>옷 한 벌 넣기</h2>
        <p class="k" style="margin-top:8px">종류</p>
        <div class="kinds">${kinds.map((k) => `<button type="button" class="chip" data-flow="kind-option" data-kind="${esc(k.id)}" aria-pressed="${draft.kind === k.id}">${esc(k.name)}</button>`).join('')}</div>
        ${draft.kind ? `${slots.length > 1 ? `<p class="k" style="margin-top:12px">세부 종류 <span style="text-transform:none;letter-spacing:0;font-weight:400">(선택)</span></p><div class="kinds">${slots.map((s) => `<button type="button" class="chip" data-flow="slot-option" data-slot="${esc(s.id)}" aria-pressed="${draft.slot === s.id}">${esc(s.name)}</button>`).join('')}</div>` : ''}
          <p class="k" style="margin-top:12px">색</p>
          <div class="swatches" style="margin-top:6px">${M.colorChoices().map((c) => `<button type="button" class="sw" data-flow="color-option" data-color="${esc(c.id)}" aria-pressed="${draft.color === c.id}"><span class="dot" style="background:${esc(c.hex)}"></span>${esc(c.label)}</button>`).join('')}</div>
          <button type="button" class="btn ink" data-flow="closet-save" data-closet-save ${draft.color ? '' : 'disabled'}>옷장에 넣기</button>` : ''}
      </div>
      ${st.closet.length ? `<div class="closet-grid">${st.closet.map((g) => `<figure>${pic(g)}<figcaption>${esc(g.label)}<br><span class="src">${esc(g.sourceLabel)}${g.detailMissing ? ` · ${esc(g.detailMissing)}` : ''}</span><br>
          <button type="button" class="rm" data-rm="${esc(g.id)}">${confirmKey === g.id ? '정말 빼기' : '빼기'}</button></figcaption></figure>`).join('')}</div>` : ''}
      <div class="tools">
        ${st.trialCount ? `<button type="button" class="btn line" data-trial-clear>체험용 옷 빼기</button>` : `<button type="button" class="btn line" data-flow="trial-closet" data-trial>체험용 옷 넣어 보기</button>`}
        <button type="button" class="btn ghost" data-flow="reset" data-reset>${confirmKey === 'reset' ? '정말 처음부터(기록·옷장 모두 지움)' : '처음부터'}</button>
      </div>
    </section>`;
  }

  // ── 그리기
  function setNav(a) {
    document.querySelectorAll('[data-nav]').forEach((el) => { if (el.dataset.nav === a) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current'); });
  }
  function count() {
    const n = M.compareList().length;
    $cmpN.textContent = n;
    if (n) $cmpN.removeAttribute('data-zero'); else $cmpN.setAttribute('data-zero', '');
  }
  function render(route = M.route.current()) {
    count();
    $layer.innerHTML = '';
    const [, a, b] = route.path.split('/');
    setNav(a);
    if (a !== 'closet') confirmKey = null;
    if (a !== 'records') returning = null;
    if (a === 'search') search(route.params);
    else if (a === 'p' && b) pdp(decodeURIComponent(b), route.params);
    else if (a === 'compare') compare();
    else if (a === 'records') records();
    else if (a === 'closet') closet();
    else { document.body.classList.remove('has-sheet'); home(); }
  }
  // 같은 화면에서 상태만 바뀌었을 때: 결과 화면은 무대·패널만, 그 밖은 다시 그린다(스크롤 유지).
  function refresh() {
    count();
    const a = M.route.current().path.split('/')[1];
    if (a === 'search' && view?.list.length && document.getElementById('panel')) {
      const $panel = document.getElementById('panel');
      $panel.innerHTML = panelHtml(view.list[view.focus], view.focus, view.list.length);
      return;
    }
    const y = window.scrollY;
    render();
    window.scrollTo(0, y);
  }

  // ── 조작
  function toggleCompare(id) {
    try {
      if (M.compareHas(id)) { M.compareRemove(id); toast('비교함에서 뺐어요'); }
      else { const list = M.compareAdd(id); toast(list.length >= 2 ? `비교함 ${list.length}개 · 위의 ‘비교’에서 나란히 봐요` : '비교함에 담았어요. 하나 더 담으면 나란히 비교해요'); }
    } catch (e) { toast(e.message); }
    refresh();
  }
  const DEC = { buy: '사기로 함', hold: '보류', skip: '안 살래요' };
  function decide(id, k) {
    const before = M.judge(id)?.record;
    if (before?.decision === k && before.stage === 'candidate') { M.removeRecord(id); toast(`${DEC[k]} 기록을 지웠어요`); refresh(); return; }
    M.decide(id, k);
    toast(`${DEC[k]}로 기록했어요`, before ? null : { label: '되돌리기', run: () => { try { M.removeRecord(id); } catch (e) { toast(e.message); } refresh(); } });
    refresh();
  }

  document.addEventListener('submit', (e) => {
    const f = e.target.closest('form[data-ask]');
    if (!f) return;
    e.preventDefault();
    const q = f.q.value.trim();
    if (!q) { f.q.focus(); return; }
    f.q.blur();
    go('/search', { q });
  });
  document.addEventListener('input', (e) => {
    if (e.target.id === 'ask-h') { const s = document.getElementById('sugs'); if (s) s.innerHTML = sugChips(e.target.value); }
  });

  document.addEventListener('click', (e) => {
    const t = e.target;
    let el;
    if ((el = t.closest('[data-flow="mock-label"]'))) { M.openDisclosure(); return; }
    if ((el = t.closest('[data-q]'))) { go('/search', { q: el.dataset.q }); return; }
    if ((el = t.closest('[data-flow="condition-remove"], .relax'))) { go('/search', { q: view?.r?.text || M.route.current().params.q, drop: el.dataset.drop }); return; }
    if ((el = t.closest('[data-step]'))) { setFocus(view.focus + Number(el.dataset.step)); return; }
    if ((el = t.closest('.frame'))) {
      const i = Number(el.dataset.i);
      if (i === view.focus) go(`/p/${el.dataset.productId}`); else setFocus(i);
      return;
    }
    if ((el = t.closest('.stage-pic'))) { if (swiped) { swiped = false; return; } go(`/p/${el.dataset.productId}`); return; }
    if ((el = t.closest('[data-sheet-toggle]'))) { sheet = sheet === 'full' ? 'peek' : 'full'; refresh(); const p = document.getElementById('panel'); if (p) p.dataset.sheet = sheet; return; }
    if ((el = t.closest('[data-flow="compare-add"]'))) { toggleCompare(el.dataset.productId); return; }
    if ((el = t.closest('[data-decide]'))) { decide(el.dataset.id, el.dataset.decide); return; }
    if ((el = t.closest('[data-undo]'))) { try { M.removeRecord(el.dataset.undo); toast('기록을 지웠어요'); } catch (err) { toast(err.message); } refresh(); return; }
    if ((el = t.closest('[data-own]'))) { M.setOwnership(el.dataset.id, el.dataset.own); refresh(); return; }
    if ((el = t.closest('[data-open]'))) { go(`/p/${el.dataset.open}`); return; }
    if ((el = t.closest('[data-back]'))) { if (history.length > 1) history.back(); else go('/'); return; }
    if ((el = t.closest('[data-flow="photo-zoom"]'))) { go(M.route.current().path, { view: 'photo' }); return; }
    if ((el = t.closest('.pdp [data-flow="closet-add"]'))) { go(M.route.current().path, { add: 1 }); return; }
    if ((el = t.closest('[data-close]'))) { history.back(); return; }
    // 옷 넣기(상세 위 시트)
    if ((el = t.closest('.dialog [data-flow="color-option"]'))) {
      $layer.querySelectorAll('[data-flow="color-option"]').forEach((b) => b.setAttribute('aria-pressed', String(b === el)));
      picked = el.dataset.color;
      $layer.querySelector('[data-flow="closet-save"]').disabled = false;
      return;
    }
    if ((el = t.closest('.dialog [data-flow="closet-save"]'))) {
      if (!picked) return;
      M.addGarment({ kind: el.dataset.kind, slot: el.dataset.slot, color: picked });
      picked = null;
      toast('옷장에 넣었어요. 판정이 바뀌었는지 확인해 보세요');
      history.back();
      return;
    }
    if (t.closest('.dialog [data-flow="kind-option"]')) return;
    // 비교
    if ((el = t.closest('[data-cmp-remove]'))) { M.compareRemove(el.dataset.cmpRemove); refresh(); return; }
    if (t.closest('[data-cmp-clear]')) { M.compareClear(); refresh(); return; }
    // 기록
    if ((el = t.closest('[data-flow="record-step"]'))) {
      if (el.dataset.needsReason) { returning = el.dataset.id; refresh(); return; }
      try { M.advance(el.dataset.id, el.dataset.step, { reason: el.dataset.reason || null }); returning = null; toast('기록을 남겼어요'); } catch (err) { toast(err.message); }
      refresh();
      return;
    }
    if (t.closest('[data-return-cancel]')) { returning = null; refresh(); return; }
    // 옷장
    if ((el = t.closest('.addbox [data-flow="kind-option"]'))) { draft = { kind: el.dataset.kind, slot: null, color: draft.color }; refresh(); return; }
    if ((el = t.closest('.addbox [data-flow="slot-option"]'))) { draft.slot = draft.slot === el.dataset.slot ? null : el.dataset.slot; refresh(); return; }
    if ((el = t.closest('.addbox [data-flow="color-option"]'))) { draft.color = el.dataset.color; refresh(); return; }
    if (t.closest('[data-closet-save]')) {
      if (!draft.kind || !draft.color) return;
      M.addGarment({ kind: draft.kind, slot: draft.slot, color: draft.color });
      draft = { kind: null, slot: null, color: null };
      toast('옷장에 넣었어요');
      refresh();
      return;
    }
    if ((el = t.closest('[data-rm]'))) {
      if (confirmKey !== el.dataset.rm) { confirmKey = el.dataset.rm; refresh(); return; }
      try { M.removeGarment(el.dataset.rm); toast('옷장에서 뺐어요'); } catch (err) { toast(err.message); }
      confirmKey = null; refresh(); return;
    }
    if (t.closest('[data-trial]')) { M.loadTrialCloset(); toast('체험용 옷을 넣었어요. 내 옷과 따로 표시돼요'); refresh(); return; }
    if (t.closest('[data-trial-clear]')) { M.clearTrialCloset(); refresh(); return; }
    if (t.closest('[data-reset]')) {
      if (confirmKey !== 'reset') { confirmKey = 'reset'; refresh(); return; }
      M.reset(); confirmKey = null; last = null; focusMemo.clear(); toast('처음 상태로 돌렸어요'); go('/');
    }
  });

  // 키보드: Esc는 겹친 화면을 닫고(뒤로), 펼친 패널을 접는다. ←/→는 무대의 후보를 바꾼다.
  document.addEventListener('keydown', (e) => {
    if (document.querySelector('#eo-disclosure[open]')) return;
    if (e.key === 'Escape') {
      if ($layer.innerHTML) { e.preventDefault(); history.back(); return; }
      if (sheet === 'full' && document.getElementById('panel')) { sheet = 'peek'; document.getElementById('panel').dataset.sheet = 'peek'; refresh(); }
      return;
    }
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && view?.list.length && document.getElementById('stage') && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '')) {
      e.preventDefault();
      setFocus(view.focus + (e.key === 'ArrowRight' ? 1 : -1));
    }
  });

  // 무대 밀기(휴대폰): 옆으로 밀면 다음·이전 후보. 미는 동안의 누름은 상세 열기로 치지 않는다.
  let sx = 0, sy = 0, swiped = false;
  document.addEventListener('pointerdown', (e) => { if (e.target.closest('#stage')) { sx = e.clientX; sy = e.clientY; swiped = false; } });
  document.addEventListener('pointerup', (e) => {
    if (!e.target.closest('#stage') || !view?.list.length) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.abs(dx) > 44 && Math.abs(dy) < 60) { swiped = true; setFocus(view.focus + (dx < 0 ? 1 : -1)); }
  });

  wide.addEventListener('change', () => { if (document.getElementById('stage')) centerFrame(); });

  if (M.boot.q && !location.hash) history.replaceState(null, '', href('/search', { q: M.boot.q }));
  M.route.on(render);
})();
