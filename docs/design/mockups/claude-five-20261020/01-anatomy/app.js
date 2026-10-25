// 시안 01 「착장 해부도」
// 검색 결과를 '착장 도면'으로 연다. 고른 후보가 들어간 실제 코디(코어가 규칙으로 조합한 것)를 부품처럼
// 번호·지시선으로 보여 주고, 부품 목록에서 후보를 도면에 끼워 보거나 부품 상세로 들어간다.
// 데이터·판정·주소 이동·고지는 공통 코어(window.EoulMock)만 쓴다. 화면 코드는 이 파일과 app.css뿐이다.
(() => {
  const M = window.EoulMock;
  const FLAT = window.PHOTO_FLAT || new Set();
  const $app = document.getElementById('app');
  const $over = document.getElementById('overlay');
  const $toast = document.getElementById('toast');
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const go = (path, params, opt) => M.route.go(path, params, opt);
  const no = (i) => String(i + 1).padStart(2, '0');
  const won = (n) => `${Number(n).toLocaleString('ko-KR')}원`;

  // 검색마다 도면에 끼운 후보(주소에 넣지 않는다: 끼울 때마다 화면 위치가 바뀌지 않게)와 부품 목록 가로 위치.
  const picks = new Map();
  const railX = new Map();
  let last = null; // 마지막으로 읽은 검색 결과(이어서 묻기)

  // ── 사진: 흰 배경 단독 사진은 같은 축척·같은 바닥선으로, 착용·연출 사진은 빗금 틀 안에 둔다.
  function photoId(target) {
    const ph = M.photo(target);
    const m = ph?.src?.match(/goods_img\/\d+\/(\d+)\//);
    return m ? `ms-${m[1]}` : null;
  }
  // caption: false면 '비슷한 상품 사진' 표시를 사진 위가 아니라 옆 글자로 쓴다(작은 칸에서 글자가 잘리지 않게).
  function shot(target, { eager = false, cls = '', caption = true } = {}) {
    const ph = M.photo(target);
    const flat = !!ph && FLAT.has(photoId(target));
    const kind = !ph ? 'none' : flat ? 'flat' : 'worn';
    return `<span class="pic pic-${kind} ${cls}">${M.photoHtml(target, { eager, caption, fit: flat ? 'contain' : 'cover' })}</span>`;
  }
  const similarNote = (target) => (M.photo(target)?.similar ? M.note.short.similar : '');

  function toast(text) {
    $toast.textContent = text;
    $toast.classList.add('on');
    clearTimeout(toast.t);
    toast.t = setTimeout(() => $toast.classList.remove('on'), 2200);
  }
  function syncHeader(route) {
    document.getElementById('cmpn').textContent = M.compareList().length;
    const [, a] = route.path.split('/');
    const tab = a === 'closet' ? 'closet' : a === 'records' ? 'records' : a === 'compare' || a === 'p' ? '' : 'ask';
    document.querySelectorAll('.tabs a').forEach((el) => el.setAttribute('aria-current', el.dataset.tab === tab ? 'page' : 'false'));
    document.body.dataset.view = a || 'home';
  }

  // ── 검색칸(주 위치 한 곳) + 입력 중 제안
  function searchForm(value = '', { big = false } = {}) {
    return `<form class="ask ${big ? 'ask-big' : ''}" role="search" data-ask>
      <label class="ask-k ${big ? '' : 'sr'}" for="q">${big ? '무엇을 입을까요' : '요청'}</label>
      <div class="ask-row">
        <input id="q" name="q" data-flow="ask-input" value="${esc(value)}" placeholder="예: 출근용 셔츠 10만원 이하" autocomplete="off" enterkeyhint="search">
        <button class="btn btn-ink" data-flow="ask-submit">찾기</button>
      </div>
      <div class="sug" data-sug hidden></div>
    </form>`;
  }
  function bindAsk() {
    const form = $app.querySelector('[data-ask]');
    if (!form) return;
    const input = form.querySelector('input');
    const box = form.querySelector('[data-sug]');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const q = input.value.trim();
      if (q) go('/search', { q });
    });
    const show = () => {
      const t = input.value.trim();
      const rows = t ? M.searchSuggestions(t) : [];
      box.hidden = !rows.length;
      box.innerHTML = rows.map((s) => `<button type="button" class="sug-row" data-flow="example" data-q="${esc(s.q)}"><span class="mono">${esc(s.label)}</span>${esc(s.q)}</button>`).join('');
    };
    input.addEventListener('input', show);
    input.addEventListener('blur', () => setTimeout(() => { box.hidden = true; }, 150));
  }

  // ── 착장 도면: 부품 그림(같은 축척) + 번호 + 지시선 + 부품표
  function board(outfit, { title = '', sub = '', nav = '', note = '', compact = false } = {}) {
    if (!outfit) return '';
    const parts = outfit.pieces;
    const target = (p) => (p.product ? `#/p/${p.product.id}` : p.owned ? '#/closet' : null);
    const tag = (p) => (p.focus ? '<span class="tag tag-focus">고른 부품</span>' : p.owned ? `<span class="tag">${[p.trial ? '체험용' : '내 옷', similarNote(p)].filter(Boolean).join(' · ')}</span>` : '');
    const priceOf = (p) => (p.owned ? '가진 옷' : p.product ? p.product.priceText : '');
    return `<section class="board ${compact ? 'board-compact' : ''}" aria-label="착장 도면">
      <div class="tb">
        <div class="tb-l"><span class="mono tb-k">도면</span><span class="tb-t">${esc(title)}</span></div>
        ${nav}
      </div>
      <div class="bd" style="--n:${parts.length}">
        <ol class="fig" aria-label="부품 그림">${parts.map((p, i) => {
          const href = target(p);
          return `<li class="fig-i ${p.focus ? 'is-focus' : ''}" data-part="${i}">${href ? `<a href="${href}" aria-label="${esc(no(i))} ${esc(p.roleLabel)} ${esc(p.label)} 자세히">` : '<span>'}<span class="bal">${no(i)}</span>${shot(p, { caption: false })}<span class="fig-cap"><span>${esc(p.roleLabel || p.kindName)}</span><span class="mono">${esc(priceOf(p))}</span></span>${href ? '</a>' : '</span>'}</li>`;
        }).join('')}</ol>
        <ol class="parts">${parts.map((p, i) => {
          const href = target(p);
          const inner = `<span class="bal">${no(i)}</span><span class="pt-role mono">${esc(p.roleLabel || p.kindName)}</span><span class="pt-name">${p.product ? `<b>${esc(p.product.brand)}</b> ${esc(p.product.name)}` : esc(p.label)}</span><span class="pt-price mono">${esc(priceOf(p))}</span>${tag(p)}`;
          return `<li class="pt ${p.focus ? 'is-focus' : ''}" data-part="${i}">${href ? `<a class="pt-a" href="${href}" aria-label="${esc(no(i))} ${esc(p.roleLabel)} ${esc(p.label)} 자세히">${inner}</a>` : `<div class="pt-a">${inner}</div>`}</li>`;
        }).join('')}</ol>
      </div>
      <div class="tb-foot"><span>${esc(outfit.title)}</span><span>규칙으로 조합한 예시</span>${sub ? `<span class="tb-s">${esc(sub)}</span>` : ''}</div>
      ${note ? `<p class="board-note">${esc(note)}</p>` : ''}
    </section>`;
  }

  // ── 처음 화면: 한 줄로 시작, 옷장은 선택
  function home() {
    const sug = M.searchSuggestions('');
    $app.innerHTML = `<section class="home">
      <div class="home-head">
        <p class="mono home-k">새 도면 · 옷장 없이 시작</p>
        <h1 class="home-t">한 줄로 적으면<br>실제 상품으로 착장을 그려요</h1>
      </div>
      ${searchForm('', { big: true })}
      <div class="chips" aria-label="예시 요청">${sug.map((s) => `<button type="button" class="chip" data-flow="example" data-q="${esc(s.q)}"><span class="mono chip-k">${esc(s.label)}</span>${esc(s.q)}</button>`).join('')}</div>
      <div class="blank" aria-hidden="true">
        <div class="blank-fig">${['아우터', '상의', '하의', '신발'].map((r, i) => `<span class="blank-i"><span class="bal">${no(i)}</span><span class="blank-r mono">${r}</span></span>`).join('')}</div>
        <p class="mono blank-c">찾으면 이 자리에 실제 상품이 채워져요</p>
      </div>
      <p class="home-opt">가진 옷과 겹치는지 보고 싶을 때만 <a href="#/closet" class="link">옷장</a>에 넣어 주세요.</p>
    </section>`;
    bindAsk();
  }

  // ── 검색 결과: 도면(위·왼쪽) + 부품 목록(아래·오른쪽)
  function resultCard(p, i, { sel, headline }) {
    return `<article class="card ${sel ? 'is-sel' : ''}" data-id="${p.id}">
      <a class="card-a" href="#/p/${p.id}" data-flow="result" data-product-id="${p.id}" aria-label="${esc(p.brand)} ${esc(p.name)} 자세히">
        <span class="card-ph">${shot(p)}<span class="bal card-no">${no(i)}</span></span>
        <span class="card-b">${esc(p.brand)}</span>
        <span class="card-n">${esc(p.name)}</span>
        <span class="card-p"><b>${esc(p.priceText)}</b> <span class="mono">${esc(p.priceShort)}</span></span>
        ${headline ? `<span class="card-why mono">${esc(headline)}</span>` : ''}
        ${p.owned && p.owned.tone !== 'none' ? `<span class="card-own tone-${esc(p.owned.tone)}">${esc(p.owned.label)}</span>` : ''}
      </a>
      <button type="button" class="swap" data-swap="${p.id}" aria-pressed="${sel}">${sel ? '도면에 있어요' : '도면에 끼우기'}</button>
    </article>`;
  }
  function search(params) {
    const q = params.q || '';
    const drop = params.drop ? params.drop.split(',') : [];
    const r = M.ask(q, { drop, previous: last && last.text !== q ? last : null });
    if (r.understood) last = r;
    const key = `${r.text}|${drop.join(',')}`;
    const list = [...r.products, ...r.offOccasion];
    const kindLabel = r.conditions.find((c) => c.key === 'kind')?.label || '후보';
    const chips = `<div class="scope" aria-label="현재 검색 범위">${r.conditions.map((c) => (c.removable
      ? `<button type="button" class="scope-c" data-flow="condition-remove" data-key="${esc(c.key)}" data-drop="${esc([...r.dropped, c.key].join(','))}" aria-label="${esc(c.label)} 조건 빼기">${esc(c.label)}<span aria-hidden="true">×</span></button>`
      : `<span class="scope-c scope-fixed">${esc(c.label)}</span>`)).join('')}${r.dropped.length ? `<span class="mono scope-n">뺀 조건 ${r.dropped.length}</span>` : ''}</div>`;
    const notices = r.notices.length ? `<ul class="notes">${r.notices.map((n) => `<li>${esc(n.text)}</li>`).join('')}</ul>` : '';

    if (!list.length) {
      const relax = r.understood ? M.relax(r) : [];
      $app.innerHTML = `<section class="res res-empty">
        <div class="res-top">${searchForm(r.text)}${chips}</div>
        <h1 class="res-t">${esc(r.title)}</h1>
        ${notices}
        ${relax.length ? `<div class="relax"><p class="mono relax-k">조건을 하나 빼면</p>${relax.map((x) => `<button type="button" class="relax-i" data-flow="empty-action" data-drop="${esc(x.drop.join(','))}">
          <span class="relax-ph">${x.preview.map((p) => shot(p)).join('')}</span><span class="relax-t">${esc(x.title)}</span></button>`).join('')}</div>` : ''}
        <div class="chips" aria-label="다른 요청">${(r.examples || []).slice(0, 5).map((x) => `<button type="button" class="chip" data-flow="example" data-q="${esc(x)}">${esc(x)}</button>`).join('')}</div>
      </section>`;
      bindAsk();
      bindSearch(r);
      return;
    }
    if (!picks.has(key) || !list.some((p) => p.id === picks.get(key))) picks.set(key, list[0].id);
    const rank = new Map(M.rankReasons({ products: list }).items.map((x) => [x.id, x.headline]));
    const pick = picks.get(key);
    $app.innerHTML = `<section class="res">
      <div class="res-top">${searchForm(r.text)}${chips}</div>
      <h1 class="res-t">${esc(r.title)} <span class="mono res-n">${r.products.length}개</span></h1>
      ${notices}
      <div class="res-body">
        <div class="res-board" data-board>${resultBoard(r, list, pick)}</div>
        <section class="rail-wrap" aria-label="${esc(kindLabel)} 후보">
          <div class="rail-h"><h2>${esc(kindLabel)} 후보 <span class="mono">${r.products.length}</span>${r.offOccasion.length ? ` <span class="rail-off">+ 덜 맞는 ${r.offOccasion.length}</span>` : ''}</h2><span class="mono rail-s">${esc(r.listNote)}</span></div>
          <div class="rail" data-rail>
            ${r.products.map((p, i) => resultCard(p, i, { sel: p.id === pick, headline: rank.get(p.id) })).join('')}
            ${r.offOccasion.length ? `<div class="rail-div mono">${esc(r.offOccasionTitle)}</div>${r.offOccasion.map((p, i) => resultCard(p, r.products.length + i, { sel: p.id === pick, headline: rank.get(p.id) })).join('')}` : ''}
          </div>
        </section>
      </div>
    </section>`;
    bindAsk();
    bindSearch(r, key, list);
  }
  function resultBoard(r, list, pick) {
    const d = M.product(pick);
    const i = list.findIndex((p) => p.id === pick);
    const nav = `<div class="tb-nav">
      <button type="button" class="icon-btn" data-step="-1" aria-label="이전 후보 끼우기"${i <= 0 ? ' disabled' : ''}>‹</button>
      <span class="mono tb-pos">${no(i)}/${String(list.length).padStart(2, '0')}</span>
      <button type="button" class="icon-btn" data-step="1" aria-label="다음 후보 끼우기"${i >= list.length - 1 ? ' disabled' : ''}>›</button>
    </div>`;
    if (!d?.outfit) {
      return `<section class="board board-none"><div class="tb"><div class="tb-l"><span class="mono tb-k">도면</span><span class="tb-t">${esc(d?.name || '')}</span></div>${nav}</div>
        <p class="board-note">${esc(d?.outfitNote || r.outfitNote || '이 후보로 만들 수 있는 코디 공식이 없어요. 조건을 풀지 않았어요.')}</p></section>`;
    }
    return board(d.outfit, { title: `${d.kindName} 자리에 ${d.brand}`, sub: r.outfitNote || '', nav, note: '' });
  }
  function bindSearch(r, key, list) {
    $app.querySelectorAll('[data-flow="condition-remove"], [data-flow="empty-action"]').forEach((b) => b.addEventListener('click', () => go('/search', { q: r.text, drop: b.dataset.drop })));
    if (!list) return;
    const setPick = (id) => {
      picks.set(key, id);
      const holder = $app.querySelector('[data-board]');
      holder.innerHTML = resultBoard(r, list, id);
      holder.querySelector('.board')?.classList.add('flash');
      bindBoardNav();
      $app.querySelectorAll('[data-swap]').forEach((b) => {
        const on = b.dataset.swap === id;
        b.setAttribute('aria-pressed', on);
        b.textContent = on ? '도면에 있어요' : '도면에 끼우기';
        b.closest('.card').classList.toggle('is-sel', on);
      });
    };
    const bindBoardNav = () => $app.querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', () => {
      const i = list.findIndex((p) => p.id === picks.get(key)) + Number(b.dataset.step);
      if (list[i]) { setPick(list[i].id); scrollRailTo(list[i].id); }
    }));
    bindBoardNav();
    $app.querySelectorAll('[data-swap]').forEach((b) => b.addEventListener('click', () => {
      setPick(b.dataset.swap);
      if (window.matchMedia('(max-width: 899px)').matches) $app.querySelector('[data-board]').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }));
    const rail = $app.querySelector('[data-rail]');
    if (rail) {
      const k = location.hash;
      rail.scrollLeft = railX.get(k) || 0;
      rail.addEventListener('scroll', () => railX.set(k, rail.scrollLeft), { passive: true });
    }
  }
  function scrollRailTo(id) {
    const card = $app.querySelector(`.card[data-id="${CSS.escape(id)}"]`);
    const rail = $app.querySelector('[data-rail]');
    if (card && rail && rail.scrollWidth > rail.clientWidth) rail.scrollTo({ left: card.offsetLeft - 16, behavior: 'smooth' });
  }

  // ── 부품 상세
  function pdp(id, params) {
    const d = M.product(id);
    if (!d) { $app.innerHTML = '<section class="empty"><h1>상품을 찾지 못했어요</h1><a class="btn" href="#/">처음으로</a></section>'; return; }
    const v = d.verdict;
    const nu = M.newVsUsed(id);
    const inCmp = M.compareHas(id);
    const rec = v.record;
    const looks = v.basis !== 'none' && v.looks?.length ? v.looks : null;
    const spec = [
      ['종류', d.slotName],
      ['색', `${d.colorLabel}${d.colorFromPhoto ? ' (사진에서 추정)' : ''}`],
      d.rating ? ['평점', `${d.rating} · 후기 ${Number(d.reviews || 0).toLocaleString('ko-KR')}개`] : null,
      ['판매처', d.store],
    ].filter(Boolean);
    $app.innerHTML = `<article class="pdp" data-flow="pdp">
      <div class="pdp-media">
        <p class="crumb mono"><button type="button" class="link crumb-back" data-back>← 도면</button><span>부품 상세 · ${esc(d.slotName)}</span></p>
        <div class="hero">
          <button type="button" class="hero-btn" data-flow="photo-zoom" aria-label="사진 크게 보기">${shot(d, { eager: true, cls: 'pic-hero' })}<span class="zoom-k mono">확대</span></button>
        </div>
      </div>
      <div class="pdp-info">
        <header class="pdp-head">
          <div class="pdp-brand" data-flow="pdp-brand">${esc(d.brand)}</div>
          <h1 class="pdp-name" data-flow="pdp-name">${esc(d.name)}</h1>
          <div class="pdp-pr"><span class="pdp-price" data-flow="pdp-price">${esc(d.priceText)}</span><span class="mono pdp-pn">${esc(d.priceShort)} · ${esc(d.store)}</span></div>
          <p class="pdp-why"><span class="bal bal-k">근거</span>${esc(d.why[0] || d.reason)}</p>
          ${rec ? `<p class="pdp-rec mono">기록 · ${esc(rec.decisionLabel)} <a class="link" href="#/records">기록 보기</a></p>` : ''}
        </header>
      <div class="act" role="group" aria-label="이 부품 결정">
        <button type="button" class="act-b act-cmp" data-flow="compare-add" data-product-id="${id}" aria-pressed="${inCmp}">${inCmp ? '대조표에 있음' : '대조 담기'}</button>
        <button type="button" class="act-b" data-flow="decide-skip" aria-pressed="${rec?.decision === 'skip'}">안 살래</button>
        <button type="button" class="act-b" data-flow="decide-hold" aria-pressed="${rec?.decision === 'hold'}">보류</button>
        <button type="button" class="act-b act-main" data-flow="decide-buy" aria-pressed="${rec?.decision === 'buy'}">사기로 함</button>
      </div>

        <section class="sec vs" aria-label="내 옷과 맞대기">
          <div class="sec-h"><h2>내 옷과 맞대기</h2><span class="mono">${esc(v.basisLabel)}</span></div>
          <p class="vs-t"><span data-flow="verdict">${esc(v.title)}</span></p>
          ${v.lines.map((l) => `<p class="vs-l">${esc(l)}</p>`).join('')}
          ${v.owned.length ? `<ul class="rel">${v.owned.slice(0, 4).map((g) => `<li><span class="rel-ph">${shot(g, { caption: false })}</span><span><b>${esc(g.label)}</b><span class="mono rel-k">${esc(g.relationLabel)}${g.trial ? ' · 체험용' : ''}</span>${similarNote(g) ? `<span class="rel-s">${esc(similarNote(g))}</span>` : ''}</span></li>`).join('')}</ul>` : ''}
          ${v.ask ? `<div class="vs-ask"><p>${esc(v.ask.question)}</p><div class="seg">${v.ask.choices.map((c) => `<button type="button" class="seg-b" data-own="${c.id}" aria-pressed="${v.ask.value === c.id}">${esc(c.label)}</button>`).join('')}</div></div>` : ''}
          ${v.cautions.map((c) => `<p class="vs-c">${esc(c)}</p>`).join('')}
          ${v.addSuggestion ? `<button type="button" class="btn btn-line vs-add" data-flow="closet-add">가진 ${esc(v.addSuggestion.kindName)} 넣고 맞대기</button>` : ''}
        </section>

        <section class="sec" aria-label="이 옷이 들어가는 착장">
          <div class="sec-h"><h2>이 옷이 들어가는 착장</h2><span class="mono">${looks ? `내 옷 기준 ${looks.length}개` : '상품으로 조합'}</span></div>
          ${looks ? looks.map((l, i) => board(l, { title: l.new ? '새로 생기는 착장' : '이미 되는 착장', sub: `${l.ownedCount}벌은 가진 옷`, compact: true })).join('')
            : d.outfit ? board(d.outfit, { title: `${d.kindName} 중심 착장`, sub: d.outfit.buyTotalText ? `나머지 ${d.outfit.buyCount}벌 ${d.outfit.buyTotalText}` : '', note: d.outfitNote || '', compact: true })
            : `<p class="board-note">${esc(d.outfitNote || '이 상품으로 만들 수 있는 코디 공식이 없어요.')}</p>`}
        </section>

        <section class="sec nu" aria-label="새 상품과 중고">
          <div class="sec-h"><h2>새 상품 · 중고</h2></div>
          <div class="nu-g">
            <div class="nu-c">
              <p class="mono nu-k">${esc(nu.fresh.label)}</p>
              <p class="nu-p">${esc(nu.fresh.priceText)}</p>
              <p class="mono nu-s">${esc(nu.fresh.priceNote)} · ${esc(nu.fresh.photoNote)}</p>
              <a class="btn btn-line nu-btn" data-flow="seller-link" href="${esc(d.url)}" target="_blank" rel="noopener">무신사에서 보기</a>
            </div>
            <div class="nu-c nu-used" data-flow="used-search">
              <p class="mono nu-k">${esc(nu.used.label)} · ${esc(M.note.short.used)}</p>
              <p class="nu-p nu-p-used">${esc(nu.used.priceNote)}</p>
              <p class="mono nu-s">${esc(nu.used.condition)}</p>
              <div class="nu-links">${nu.used.groups.flatMap((g) => g.links).map((l) => `<a class="nu-l" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}<span aria-hidden="true">↗</span></a>`).join('')}</div>
              <p class="nu-n">${esc(nu.used.note)}</p>
            </div>
          </div>
        </section>

        <section class="sec" aria-label="부품 정보">
          <div class="sec-h"><h2>부품 정보</h2><span class="mono">${esc(d.colorNote)}</span></div>
          <dl class="spec">${spec.map(([k, val]) => `<div><dt class="mono">${esc(k)}</dt><dd>${esc(val)}</dd></div>`).join('')}</dl>
          ${d.tip ? `<p class="vs-l">${esc(d.tip)}</p>` : ''}
          <p class="mono fine">소재·핏·사이즈·재고는 판매처에서 확인해 주세요.</p>
        </section>

        ${d.alternatives.length ? `<section class="sec" aria-label="같은 자리 다른 부품">
          <div class="sec-h"><h2>같은 자리 다른 부품</h2><span class="mono">${d.alternatives.length}개</span></div>
          ${d.alternativesNote ? `<p class="board-note">${esc(d.alternativesNote)}</p>` : ''}
          <div class="alt">${d.alternatives.slice(0, 6).map((p) => `<article class="alt-c">
            <a class="alt-a" href="#/p/${p.id}" aria-label="${esc(p.brand)} ${esc(p.name)} 자세히"><span class="alt-ph">${shot(p)}</span><span class="card-b">${esc(p.brand)}</span><span class="card-n">${esc(p.name)}</span><span class="card-p"><b>${esc(p.priceText)}</b> <span class="mono">${esc(p.priceShort)}</span></span></a>
            <button type="button" class="btn btn-line btn-s" data-flow="compare-add" data-product-id="${p.id}" aria-pressed="${M.compareHas(p.id)}">${M.compareHas(p.id) ? '대조표에 있음' : '대조표에 담기'}</button>
          </article>`).join('')}</div>
        </section>` : ''}
      </div>
    </article>`;

    $app.querySelector('[data-back]').addEventListener('click', () => (last ? history.back() : go('/')));
    $app.querySelector('[data-flow="photo-zoom"]').addEventListener('click', () => go(`/p/${id}`, { view: 'photo' }));
    $app.querySelector('[data-flow="closet-add"]')?.addEventListener('click', () => go(`/p/${id}`, { add: 1 }));
    $app.querySelectorAll('[data-own]').forEach((b) => b.addEventListener('click', () => { M.setOwnership(id, b.dataset.own); render(); }));
    $app.querySelectorAll('[data-flow="compare-add"]').forEach((b) => b.addEventListener('click', () => addCompare(b.dataset.productId)));
    for (const k of ['buy', 'hold', 'skip']) $app.querySelector(`[data-flow="decide-${k}"]`).addEventListener('click', () => decide(id, k));

    $over.innerHTML = '';
    if (params.view === 'photo') {
      $over.innerHTML = `<div class="viewer" data-flow="photo-viewer" role="dialog" aria-modal="true" aria-label="사진 크게 보기">
        <div class="viewer-ph">${M.photoHtml(d, { fit: 'contain', eager: true })}</div>
        <div class="viewer-bar"><span class="mono">${esc(d.brand)} · ${esc(d.name)} · 판매처 대표 사진</span><button type="button" class="btn btn-ink" data-close>닫기</button></div>
      </div>`;
      $over.querySelector('[data-close]').addEventListener('click', () => history.back());
      $over.querySelector('[data-close]').focus();
    }
    if (params.add && v.addSuggestion) addSheet(id, v.addSuggestion);
  }

  // 상세 안에서 가진 옷 넣기: 종류는 이 부품과 같게 미리 고르고 색만 묻는다. 넣으면 같은 부품으로 돌아온다.
  function addSheet(id, s) {
    let color = s.color || null;
    $over.innerHTML = `<div class="scrim" data-close></div>
      <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-t">
        <p class="mono sheet-k">옷장에 넣기 · ${esc(s.slotName)}</p>
        <h2 id="sheet-t" class="sheet-t">가진 ${esc(s.kindName)}의 색을 골라 주세요</h2>
        <p class="sheet-s">종류는 이 부품과 같은 ${esc(s.slotName)}로 넣어요. 사진 없이 넣으면 비슷한 상품 사진으로 보여요.</p>
        <div class="sw">${M.colorChoices().map((c) => `<button type="button" class="sw-b" data-flow="color-option" data-color="${c.id}" aria-pressed="${color === c.id}"><span class="sw-c" style="background:${c.hex}"></span>${esc(c.label)}</button>`).join('')}</div>
        <div class="sheet-bar"><button type="button" class="btn btn-line" data-close>닫기</button><button type="button" class="btn btn-ink" data-flow="closet-save"${color ? '' : ' disabled'}>넣고 부품으로 돌아가기</button></div>
      </div>`;
    const save = $over.querySelector('[data-flow="closet-save"]');
    $over.querySelectorAll('[data-flow="color-option"]').forEach((b) => b.addEventListener('click', () => {
      color = b.dataset.color;
      $over.querySelectorAll('[data-flow="color-option"]').forEach((x) => x.setAttribute('aria-pressed', x === b));
      save.disabled = false;
    }));
    $over.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => history.back()));
    save.addEventListener('click', () => {
      if (!color) return;
      M.addGarment({ kind: s.kind, slot: s.slot, color, gender: s.gender });
      toast('옷장에 넣었어요 · 판정을 다시 했어요');
      history.back();
    });
  }

  function decide(id, k) {
    M.decide(id, k);
    toast({ buy: '사기로 함으로 기록했어요', hold: '보류로 기록했어요', skip: '안 사기로 기록했어요' }[k]);
    render();
  }
  function addCompare(id) {
    try {
      if (M.compareHas(id)) { M.compareRemove(id); toast('대조표에서 뺐어요'); }
      else { M.compareAdd(id); toast(`대조표에 담았어요 · ${M.compareList().length}개`); }
    } catch (e) { toast(e.message); }
    const y = scrollY;
    render();
    scrollTo(0, y);
  }

  // ── 대조표: 같은 축척 사진 + 같은 축의 값(같은 값 줄은 흐리게)
  function compare() {
    const c = M.compareRows();
    const n = c.items.length;
    const rec = (id) => M.judge(id)?.record;
    const row = (r) => `<div class="cr ${r.same ? 'is-same' : ''}"><div class="cr-k mono">${esc(r.label)}${r.same ? ' · 같음' : ''}</div><div class="cr-v">${r.values.map((x) => `<span>${esc(x)}</span>`).join('')}</div></div>`;
    $app.innerHTML = `<section class="cmp" data-flow="compare-view" style="--n:${Math.max(2, n)}">
      <div class="cmp-h"><p class="mono">대조표</p><h1>후보 ${n}개를 맞대어 봐요</h1></div>
      ${n < 2 ? `<p class="board-note">부품 상세에서 ‘대조 담기’로 둘 이상 담아 주세요.</p>${n ? '' : '<a class="btn btn-line" href="#/">찾으러 가기</a>'}` : ''}
      ${n ? `<div class="cmp-scroll"><div class="cmp-g">${c.items.map((p, i) => {
        const r = rec(p.id);
        return `<div class="cmp-i" data-flow="compare-item" data-product-id="${p.id}">
          <a href="#/p/${p.id}" class="cmp-a" aria-label="${esc(p.brand)} ${esc(p.name)} 자세히"><span class="cmp-ph">${shot(p)}<span class="bal card-no">${no(i)}</span></span><span class="card-b">${esc(p.brand)}</span><span class="card-n">${esc(p.name)}</span></a>
          <div class="cmp-btns">
            <button type="button" class="btn btn-line btn-s" data-flow="decide-hold" data-id="${p.id}" aria-pressed="${r?.decision === 'hold'}">${r?.decision === 'hold' ? '보류함' : '보류'}</button>
            <button type="button" class="btn btn-ghost btn-s" data-remove="${p.id}" aria-label="${esc(p.name)} 대조표에서 빼기">빼기</button>
          </div>
        </div>`;
      }).join('')}</div>
      <div class="cmp-rows">${c.rows.filter((r) => r.primary).map(row).join('')}
        <details class="cmp-more"><summary>더 보기 · 옷장·종류·이유·평점</summary>${c.rows.filter((r) => !r.primary).map(row).join('')}</details>
      </div></div>
      <p class="mono fine">${esc(c.note)}</p>` : ''}
    </section>`;
    $app.querySelectorAll('[data-flow="decide-hold"]').forEach((b) => b.addEventListener('click', () => { M.decide(b.dataset.id, 'hold'); toast('보류로 기록했어요'); render(); }));
    $app.querySelectorAll('[data-remove]').forEach((b) => b.addEventListener('click', () => { M.compareRemove(b.dataset.remove); render(); }));
  }

  // ── 기록(직접 남긴 것)
  function records() {
    const rs = M.getState().records;
    $app.innerHTML = `<section class="recs">
      <div class="cmp-h"><p class="mono">기록 · ${esc(M.note.short.records)}</p><h1>결정한 부품 ${rs.length}개</h1></div>
      ${rs.length ? `<ol class="rec-l">${rs.map((r) => `<li class="rec" data-flow="record" data-product-id="${r.productId}">
        <a class="rec-ph" href="#/p/${r.productId}" aria-label="${esc(r.product?.name)} 자세히">${shot(r)}</a>
        <div class="rec-b">
          <span class="card-b">${esc(r.product?.brand)}</span>
          <a class="rec-n" href="#/p/${r.productId}">${esc(r.product?.name)}</a>
          <span class="mono rec-s">${esc(r.stageLabel)}${r.product ? ` · ${esc(r.product.priceText)}` : ''}</span>
          <div class="rec-steps">${(r.next || []).map((s) => `<button type="button" class="btn btn-line btn-s" data-flow="record-step" data-step="${s.step}" data-id="${r.productId}" data-reason="${s.needsReason ? 1 : ''}">${esc(s.label)}</button>`).join('')}
          ${r.stage === 'candidate' ? `<button type="button" class="btn btn-ghost btn-s" data-del="${r.productId}">기록 지우기</button>` : ''}</div>
          <div class="rec-why" data-why="${r.productId}" hidden>${M.returnReasons.map((x) => `<button type="button" class="chip chip-s" data-ret="${x.id}" data-id="${r.productId}">${esc(x.label)}</button>`).join('')}</div>
        </div>
      </li>`).join('')}</ol>` : `<p class="board-note">아직 기록이 없어요. 부품 상세에서 ‘보류’나 ‘사기로 함’을 누르면 여기에 남아요.</p><a class="btn btn-line" href="#/">찾으러 가기</a>`}
    </section>`;
    $app.querySelectorAll('[data-flow="record-step"]').forEach((b) => b.addEventListener('click', () => {
      if (b.dataset.reason) { $app.querySelector(`[data-why="${CSS.escape(b.dataset.id)}"]`).hidden = false; return; }
      try { M.advance(b.dataset.id, b.dataset.step); render(); } catch (e) { toast(e.message); }
    }));
    $app.querySelectorAll('[data-ret]').forEach((b) => b.addEventListener('click', () => { try { M.advance(b.dataset.id, 'returned', { reason: b.dataset.ret }); render(); } catch (e) { toast(e.message); } }));
    $app.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => { if (confirm('이 기록을 지울까요?')) { M.removeRecord(b.dataset.del); render(); } }));
  }

  // ── 옷장(선택): 가진 부품 목록과 그 부품으로 그린 착장
  let draft = { kind: null, slot: null, color: null };
  function closet() {
    const st = M.getState();
    const outs = st.closetCount ? M.closetOutfits({ detail: true, limit: 12 }) : null;
    const kinds = M.kindChoices();
    const slots = draft.kind ? M.slotChoices(draft.kind) : [];
    $app.innerHTML = `<section class="closet">
      <div class="cmp-h"><p class="mono">옷장 · 선택</p><h1>가진 옷 ${st.closetCount}벌</h1></div>
      <p class="board-note">옷장은 넣지 않아도 돼요. 넣으면 부품 상세에서 가진 옷과 겹치는지 맞대어 봐요.</p>
      <div class="closet-tools">
        <button type="button" class="btn btn-line" data-flow="trial-closet">${st.trialCount ? '체험용 옷 다시 넣기' : '체험용 옷 넣어 보기'}</button>
        ${st.trialCount ? '<button type="button" class="btn btn-ghost" data-trial-off>체험용 옷 빼기</button>' : ''}
        <button type="button" class="btn btn-ghost" data-flow="reset">처음부터</button>
      </div>
      <section class="sec add" aria-label="옷 넣기">
        <div class="sec-h"><h2>옷 한 벌 넣기</h2><span class="mono">종류 → 색</span></div>
        <div class="opts">${kinds.map((k) => `<button type="button" class="chip" data-flow="kind-option" data-kind="${k.id}" aria-pressed="${draft.kind === k.id}">${esc(k.name)}</button>`).join('')}</div>
        ${slots.length > 1 ? `<p class="mono add-k">세부 종류(모르면 건너뛰기)</p><div class="opts">${slots.map((s) => `<button type="button" class="chip" data-flow="slot-option" data-slot="${s.id}" aria-pressed="${draft.slot === s.id}">${esc(s.name)}</button>`).join('')}</div>` : ''}
        ${draft.kind ? `<p class="mono add-k">색</p><div class="sw">${M.colorChoices().map((c) => `<button type="button" class="sw-b" data-flow="color-option" data-color="${c.id}" aria-pressed="${draft.color === c.id}"><span class="sw-c" style="background:${c.hex}"></span>${esc(c.label)}</button>`).join('')}</div>
        <button type="button" class="btn btn-ink" data-flow="closet-save"${draft.color ? '' : ' disabled'}>옷장에 넣기</button>` : ''}
      </section>
      ${st.closet.length ? `<section class="sec"><div class="sec-h"><h2>가진 부품</h2><span class="mono">${st.mineCount}벌 내 옷 · ${st.trialCount}벌 체험용</span></div>
        <div class="own-g">${st.closet.map((g) => `<div class="own"><span class="own-ph">${shot(g)}</span><b>${esc(g.label)}</b><span class="mono">${esc(g.sourceLabel)}${g.detailMissing ? ` · ${esc(g.detailMissing)}` : ''}</span>${g.trial || g.bought ? '' : `<button type="button" class="btn btn-ghost btn-s" data-rm="${g.id}" aria-label="${esc(g.label)} 빼기">빼기</button>`}</div>`).join('')}</div></section>` : ''}
      ${outs?.total ? `<section class="sec"><div class="sec-h"><h2>가진 옷으로 그린 착장</h2><span class="mono">${outs.total}개${st.trialCount ? ' · 체험용 포함' : ''}</span></div>
        ${(outs.list || []).slice(0, 2).map((o) => board(o, { title: o.formulaLook ? o.title : '기본 조합', sub: `${o.ownedCount}벌`, compact: true })).join('')}
        <p class="mono fine">${esc(outs.note)}</p></section>` : ''}
    </section>`;
    $app.querySelector('[data-flow="trial-closet"]').addEventListener('click', () => { M.loadTrialCloset(); toast('체험용 옷을 넣었어요'); render(); });
    $app.querySelector('[data-trial-off]')?.addEventListener('click', () => { M.clearTrialCloset(); render(); });
    $app.querySelector('[data-flow="reset"]').addEventListener('click', () => { if (confirm('옷장·기록·대조표를 모두 지우고 처음으로 돌아갈까요?')) { M.reset(); picks.clear(); last = null; go('/'); } });
    $app.querySelectorAll('[data-flow="kind-option"]').forEach((b) => b.addEventListener('click', () => { draft = { kind: b.dataset.kind, slot: null, color: null }; render(); }));
    $app.querySelectorAll('[data-flow="slot-option"]').forEach((b) => b.addEventListener('click', () => { draft.slot = draft.slot === b.dataset.slot ? null : b.dataset.slot; render(); }));
    $app.querySelectorAll('[data-flow="color-option"]').forEach((b) => b.addEventListener('click', () => { draft.color = b.dataset.color; render(); }));
    $app.querySelector('[data-flow="closet-save"]')?.addEventListener('click', () => {
      try { M.addGarment(draft); draft = { kind: null, slot: null, color: null }; toast('옷장에 넣었어요'); render(); } catch (e) { toast(e.message); }
    });
    $app.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', () => { try { M.removeGarment(b.dataset.rm); render(); } catch (e) { toast(e.message); } }));
  }

  function render(route = M.route.current()) {
    syncHeader(route);
    $over.innerHTML = '';
    const [, a, b] = route.path.split('/');
    if (a === 'search') search(route.params);
    else if (a === 'p' && b) pdp(b, route.params);
    else if (a === 'compare') compare();
    else if (a === 'records') records();
    else if (a === 'closet') closet();
    else home();
  }

  // 예시·제안·다른 요청(data-q)은 한 곳에서 받는다. 입력칸 제안은 누르는 동안 입력칸이 닫히지 않게 한다.
  $app.addEventListener('mousedown', (e) => { if (e.target.closest('.sug-row')) e.preventDefault(); });
  $app.addEventListener('click', (e) => {
    const b = e.target.closest('[data-q]');
    if (b) go('/search', { q: b.dataset.q });
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $over.innerHTML && !document.querySelector('#eo-disclosure[open]')) history.back(); });
  M.subscribe?.(() => { document.getElementById('cmpn').textContent = M.compareList().length; });
  if (M.boot.q && !location.hash) history.replaceState(null, '', M.route.href('/search', { q: M.boot.q }));
  M.route.on(render);
})();
