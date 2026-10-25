// 시안 02 "한 줄 스레드" — 화면 코드. 데이터·판단 규칙은 공통 코어(window.EoulMock)만 쓴다.
// 스레드: 한 줄 요청 → 앱이 읽은 조건(그 자리에서 빼기·되살리기) → 바로 결과 → 이어서 한 가지만.
// 주소: #/search?q=말&p=이전 요청&drop=뺀 조건&s=단계 번호 · #/p/<id> · #/compare · #/records · #/closet
// 지난 단계는 이 탭(sessionStorage)에 요약만 남겨 한 줄로 접고, 지금 단계만 펼친다(검색은 지금 단계 한 번만 다시 계산).
(() => {
  'use strict';
  const M = window.EoulMock;
  const FLAT = window.PHOTO_FLAT || new Set();
  const $main = document.getElementById('main');
  const $aside = document.getElementById('aside');
  const $over = document.getElementById('overlay');
  const $wrap = document.getElementById('composer-wrap');
  const $form = document.getElementById('composer');
  const $ask = document.getElementById('ask');
  const $sugs = document.getElementById('sugs');
  const $toast = document.getElementById('toast');
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const href = (path, params) => M.route.href(path, params);
  const go = (path, params, opt) => M.route.go(path, params, opt);
  const SHORT = M.note.short;

  // ── 스레드 저장(이 탭에만)
  const KEY = 'eo-five-02:thread';
  const ss = (() => { try { const s = window.sessionStorage; s.getItem(KEY); return s; } catch { return null; } })();
  const loadThread = () => { try { return JSON.parse(ss?.getItem(KEY) || '[]'); } catch { return []; } };
  const saveThread = (t) => { try { ss?.setItem(KEY, JSON.stringify(t)); } catch { /* 저장 못 해도 지금 단계는 그대로 보인다 */ } };
  const lastThreadHash = () => { try { return ss?.getItem(`${KEY}:last`) || ''; } catch { return ''; } };
  const setLastThreadHash = (h) => { try { ss?.setItem(`${KEY}:last`, h); } catch { /* 없음 */ } };
  if (M.boot.reset) { saveThread([]); setLastThreadHash(''); }

  // ── 사진: 흰 1:1 칸. 흰 배경 단독 사진은 여백을 두고 가운데, 모델 사진은 옷 종류에 맞는 부분을 잘라 보인다.
  const POS = { pants: '50% 70%', jeans: '50% 70%', skirt: '50% 62%', sneaker: '50% 88%', loafer: '50% 88%', boot: '50% 85%', dress: '50% 38%', coat: '50% 34%', down: '50% 34%', bag: '50% 55%' };
  function frame(t, { eager = false, cls = '', caption = true } = {}) {
    const ph = M.photo(t);
    const m = ph?.src?.match(/\/(\d+)\/\1_/);
    const flat = !!m && FLAT.has(`ms-${m[1]}`);
    const kind = t?.kind || t?.product?.kind || '';
    return `<span class="frame ${flat ? 'is-flat' : 'is-model'} ${cls}" style="--pos:${POS[kind] || '50% 24%'}">${M.photoHtml(t, { fit: flat ? 'contain' : 'cover', eager, caption })}</span>`;
  }
  // 작은 칸에서는 사진 위 표시 대신 아래 글로 '비슷한 상품 사진'을 밝힌다.
  const simNote = (t) => (M.photo(t)?.similar ? `<span class="sim">${esc(SHORT.similar)}</span>` : '');

  // ── 이동 기록(뒤로가기 위치 복원과 '스레드로' 버튼)
  const memo = new Map();
  const nav = { backTo: '', canPop: false, replacing: false, enter: false, overlayPushed: false };
  const baseOf = (h) => h.split('?')[0];
  const hasOverlay = (h) => /[?&](view|add)=/.test(h);
  const pidOf = (h) => (h.match(/^#\/p\/([^?]+)/) || [])[1] || null;
  const isSearch = (h) => h.startsWith('#/search');
  function track(old, now) {
    if (baseOf(old) === baseOf(now) && hasOverlay(now) && !hasOverlay(old)) nav.overlayPushed = true;
    else if (!hasOverlay(now)) nav.overlayPushed = false;
    if (nav.replacing) { nav.replacing = false; return; }
    if (isSearch(old) && pidOf(now)) { nav.backTo = old; nav.canPop = true; return; }
    if (pidOf(old) && pidOf(old) === pidOf(now)) return; // 같은 상품의 크게 보기·옷 넣기 열고 닫기
    nav.canPop = false;
  }
  function replaceGo(path, params) { nav.replacing = true; go(path, params, { replace: true }); }

  // ── 카드
  function ownBadge(p) {
    if (!p.owned || p.owned.tone === 'none') return '';
    const cls = p.owned.tone === 'stop' ? 'stop' : p.owned.tone === 'new' ? 'new' : '';
    return `<span class="own ${cls}">${esc(p.owned.label)}</span>`;
  }
  function pinBtn(id) {
    const on = M.compareHas(id);
    return `<button type="button" class="pin" data-flow="compare-add" data-product-id="${esc(id)}" data-act="pin" data-id="${esc(id)}" aria-pressed="${on}">${on ? '✓ 비교함에 있음' : '+ 비교 담기'}</button>`;
  }
  function card(p, { result = true } = {}) {
    return `<li class="card">
      <a class="card-hit" href="${href(`/p/${p.id}`)}"${result ? ` data-flow="result" data-product-id="${esc(p.id)}"` : ''}>
        ${frame(p)}
        <span class="c-brand">${esc(p.brand)}</span>
        <span class="c-name">${esc(p.name)}</span>
        <span class="c-price">${esc(p.priceText)}<small>${esc(p.priceShort)}</small></span>
      </a>${ownBadge(p)}
      <div>${pinBtn(p.id)}</div>
    </li>`;
  }

  // ── 처음: 한 줄이면 시작
  function homeView() {
    const st = M.getState();
    const last = lastThreadHash();
    const lastSnap = loadThread().filter(Boolean).slice(-1)[0]?.snap;
    const sugs = M.searchSuggestions('', { limit: 6 });
    $main.innerHTML = `<section class="home" aria-labelledby="home-q">
      ${last && lastSnap ? `<a class="resume" href="${esc(last)}"><span class="k">이어 보기</span><span class="t">${esc(lastSnap.said)}</span></a>` : ''}
      <p class="eyebrow">한 줄이면 시작해요</p>
      <h1 id="home-q">어떤 옷을 찾으세요?</h1>
      <div class="seg" role="group" aria-label="상품 성별">
        <button type="button" data-act="gender" data-g="M" aria-pressed="${st.gender === 'M'}">남성 상품</button>
        <button type="button" data-act="gender" data-g="F" aria-pressed="${st.gender === 'F'}">여성 상품</button>
      </div>
      <ul class="starts" aria-label="이렇게 시작해 보세요">${sugs.map((s) => `<li><button type="button" data-flow="example" data-act="start" data-q="${esc(s.q)}"><span class="k">${esc(s.label)}</span><span>${esc(s.q)}</span><span class="go" aria-hidden="true">→</span></button></li>`).join('')}</ul>
      <p class="aside-line">옷장은 없어도 돼요. 넣어 두면 겹치는 옷을 함께 알려 드려요. <a href="#/closet">옷장 열기</a></p>
    </section>`;
    $ask.placeholder = '예: 출근용 셔츠 10만원 이하';
    return 'top';
  }

  // ── 스레드
  let current = { s: 0, prevText: '' };
  function threadView(params) {
    const s = Math.max(0, Number.parseInt(params.s, 10) || 0);
    const q = params.q || '';
    const drop = (params.drop || '').split(',').filter(Boolean);
    const r = M.ask(q, { drop, previous: params.p || null });
    const thread = loadThread().slice(0, s);
    thread[s] = {
      q, p: params.p || '', drop: drop.join(','), say: params.say || '',
      snap: { said: params.say || r.said || q, text: r.text, title: r.title, total: r.total, understood: r.understood, chips: r.conditions.map((c) => c.label), ids: r.products.map((x) => x.id), hash: location.hash },
    };
    saveThread(thread);
    setLastThreadHash(location.hash);
    const prevText = [...thread].reverse().find((x) => x?.snap?.understood)?.snap.text || '';
    current = { s, prevText };

    const past = thread.slice(0, s).map((x, i) => (x ? { ...x, i } : null)).filter(Boolean);
    const hiddenPast = past.length > 3 ? past.slice(0, past.length - 3) : [];
    const shownPast = past.slice(-3);
    const fold = (x) => `<li class="step"><a class="fold" href="${esc(x.snap.hash || href('/search', { q: x.q, p: x.p, drop: x.drop, say: x.say, s: x.i }))}">
      <span class="f-said">${esc(x.snap.said)}</span>
      <span class="f-meta">${x.snap.understood ? `${esc(x.snap.chips.join(' · '))} → ${x.snap.total}개` : '못 읽은 말'} · 이 단계로 돌아가기</span></a></li>`;

    $main.innerHTML = `<ol class="thread" aria-label="찾은 순서">
      ${hiddenPast.length ? `<li class="step"><button type="button" class="more-steps" data-act="more-steps">앞의 ${hiddenPast.length}단계 보기</button></li><template id="hidden-steps">${hiddenPast.map(fold).join('')}</template>` : ''}
      ${shownPast.map(fold).join('')}
      <li class="step active${nav.enter ? ' enter' : ''}" id="active" aria-current="step">${activeStep(r, { q, drop, s, p: params.p || '', say: params.say || '' })}</li>
    </ol>`;
    $ask.placeholder = r.understood && r.products.length ? '이어서 한 줄 · 예: 더 싼 걸로' : '다시 한 줄로 · 예: 출근용 셔츠';
    return 'step';
  }

  function activeStep(r, ctx) {
    const said = ctx.say || r.said || ctx.q;
    const chipHtml = r.conditions.map((c) => (c.removable
      ? `<button type="button" class="chip" data-flow="condition-remove" data-key="${esc(c.key)}" data-act="drop" aria-label="${esc(c.label)} 조건 빼기">${esc(c.label)}<span class="x" aria-hidden="true">✕</span></button>`
      : `<span class="chip">${esc(c.label)}</span>`)).join('');
    const droppedHtml = (r.dropped || []).map((k) => `<button type="button" class="chip off" data-act="undrop" data-key="${esc(k)}" aria-label="뺀 조건 되살리기"><s>${esc(DROP_LABEL[k] || k)}</s><span class="x" aria-hidden="true">↺</span></button>`).join('');
    const notices = r.notices.filter((n) => !['empty', 'kind-unavailable', 'not-understood'].includes(n.kind)).slice(0, 2);
    const head = `<h1 class="said">${esc(said)}</h1>`;

    if (!r.understood) {
      return `${head}
        <div class="empty">
          <p class="answer"><b>${esc(r.title)}</b></p>
          ${r.notices.map((n) => `<p class="small">${esc(n.text)}</p>`).join('')}
          <div class="ex" aria-label="이렇게 적어 보세요">${r.examples.slice(0, 4).map((x) => `<button type="button" class="chip" data-flow="example" data-act="start" data-q="${esc(x)}">${esc(x)}</button>`).join('')}</div>
          <button type="button" class="text-btn" data-flow="empty-action" data-act="focus">다른 말로 다시 적기</button>
        </div>`;
    }
    const reading = `<div class="reading"><span class="rlabel">${esc(SHORT.rules)}</span>${chipHtml}${droppedHtml}</div>`;
    if (!r.products.length) {
      const rel = M.relax(r);
      return `${head}${reading}
        <div class="empty">
          <p class="answer"><b>${esc(r.title)}</b></p>
          ${r.notices.map((n) => `<p class="small">${esc(n.text)}</p>`).join('')}
          ${rel.length ? `<ul class="relax" aria-label="조건을 하나 빼면">${rel.map((x) => `<li><button type="button" data-flow="empty-action" data-act="relax" data-drop="${esc(x.drop.join(','))}"><span>${esc(x.title)}</span><span class="pv" aria-hidden="true">${x.preview.map((p) => frame(p)).join('')}</span></button></li>`).join('')}</ul>` : ''}
          <div class="ex" aria-label="다른 요청">${r.examples.slice(0, 4).map((x) => `<button type="button" class="chip" data-flow="example" data-act="start" data-q="${esc(x)}">${esc(x)}</button>`).join('')}</div>
          <button type="button" class="text-btn" data-flow="empty-action" data-act="focus">다른 종류로 다시 적기</button>
        </div>`;
    }
    // 이어서 한 가지만: 더 싼 걸로 또는 지금 결과에 있는 색 하나로 좁히기(결과에 실제로 있는 색만)
    const hasColor = r.conditions.some((c) => c.key === 'color');
    const colors = hasColor ? [] : Object.entries(r.products.reduce((m, p) => ((m[p.colorLabel] = (m[p.colorLabel] || 0) + 1), m), {})).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c]) => c);
    const cheaper = !/낮은 가격순/.test(r.text);
    const follow = cheaper || colors.length ? `<div class="follow"><p class="lead">이어서 한 가지만 정해 볼까요?</p><div class="row">
      ${cheaper ? '<button type="button" class="chip" data-act="follow" data-say="더 싼 걸로" data-q="더 싼 걸로">더 싼 걸로</button>' : ''}
      ${colors.map((c) => `<button type="button" class="chip" data-act="follow" data-say="${esc(c)}만" data-q="${esc(`${r.text} ${c}`)}">${esc(c)}만</button>`).join('')}
    </div></div>` : '';
    return `${head}${reading}
      <p class="answer"><b><span class="num">${r.products.length}</span>개</b> · ${esc(r.title)}</p>
      <p class="small">${esc(r.listNote)}</p>
      ${notices.length ? `<div class="notices">${notices.map((n) => `<p class="small">${esc(n.text)}</p>`).join('')}</div>` : ''}
      <ul class="grid" aria-label="결과">${r.products.map((p) => card(p)).join('')}</ul>
      ${r.offOccasion.length ? `<details class="off-occ"><summary>${esc(r.offOccasionTitle)}</summary><ul class="grid">${r.offOccasion.map((p) => card(p, { result: false })).join('')}</ul></details>` : ''}
      ${follow}`;
  }
  const DROP_LABEL = { occasion: '상황', price: '예산', color: '색', style: '스타일', season: '계절', exclude: '뺀 것', brand: '브랜드' };

  // ── 상품 한 단계
  function threadIds(id) {
    const t = loadThread().filter(Boolean);
    for (let i = t.length - 1; i >= 0; i--) if (t[i].snap?.ids?.includes(id)) return t[i].snap.ids;
    return [];
  }
  function pdpView(id, params) {
    const d = M.product(id);
    if (!d) {
      $main.innerHTML = `<section class="page"><h1 class="said">상품을 찾지 못했어요</h1><a class="btn" href="#/">처음으로</a></section>`;
      return 'top';
    }
    const v = d.verdict;
    const nu = M.newVsUsed(id);
    const ids = threadIds(id);
    const i = ids.indexOf(id);
    const rec = v.record;
    const pressed = (k) => (rec?.decision === k ? 'true' : 'false');
    const posNav = i >= 0 ? `<span class="pos">후보 ${i + 1} / ${ids.length}</span><span class="pn">
        ${i > 0 ? `<a href="${href(`/p/${ids[i - 1]}`)}" data-act="swap" data-id="${esc(ids[i - 1])}" aria-label="이전 후보">‹</a>` : '<span aria-hidden="true">‹</span>'}
        ${i < ids.length - 1 ? `<a href="${href(`/p/${ids[i + 1]}`)}" data-act="swap" data-id="${esc(ids[i + 1])}" aria-label="다음 후보">›</a>` : '<span aria-hidden="true">›</span>'}</span>` : '';
    const s = v.addSuggestion;
    const addPanel = params.add && s ? `<div class="addq" id="addq" role="group" aria-labelledby="addq-t">
        <span class="q-k">질문 하나</span>
        <h3 id="addq-t">가진 ${esc(s.kindName)}${josa(s.kindName)} 무슨 색인가요?</h3>
        <p class="small">${esc(s.slotName)}로 넣어요. 색을 고르면 바로 비교해요.</p>
        <div class="swatches">${M.colorChoices().map((c) => `<button type="button" class="sw" data-flow="color-option" data-color="${esc(c.id)}" data-act="add-color"><i style="background:${esc(c.hex)}"></i>${esc(c.label)}</button>`).join('')}</div>
        <button type="button" class="text-btn" data-act="close-overlay">그만두기</button>
      </div>` : '';
    const ask = v.ask ? `<div class="ask-own"><p>${esc(v.ask.question)}</p><div class="seg2" role="group" aria-label="${esc(v.ask.question)}">${v.ask.choices.map((c) => `<button type="button" data-act="own" data-v="${esc(c.id)}" aria-pressed="${v.ask.value === c.id}">${esc(c.label)}</button>`).join('')}</div>${v.ask.hint ? `<p class="small" style="margin-top:6px">${esc(v.ask.hint)}</p>` : ''}</div>` : '';
    const owned = v.owned.length ? `<div class="owned-row" aria-label="옷장에서 겹치는 옷">${v.owned.slice(0, 4).map((g) => `<figure>${frame(g, { caption: false })}<figcaption>${esc(g.label)}${simNote(g)}<span class="small">${esc(g.relationLabel)}${g.trial ? ` · ${esc(SHORT.trial)}` : ''}</span></figcaption></figure>`).join('')}</div>` : '';
    const look = d.outfit;
    $main.innerHTML = `<article class="pdp" data-flow="pdp" aria-labelledby="p-name">
      <nav class="pdp-nav" aria-label="스레드"><button type="button" class="back" data-act="back"><span aria-hidden="true">←</span> 스레드로</button>${posNav}</nav>
      <div class="pdp-grid">
        <div class="hero"><button type="button" class="zoom" data-flow="photo-zoom" data-act="zoom" aria-label="사진 크게 보기">${frame(d, { eager: true })}<span class="zoom-hint" aria-hidden="true">크게 보기</span></button></div>
        <div class="info">
          <div class="p-brand" data-flow="pdp-brand">${esc(d.brand)}</div>
          <h1 class="p-name" id="p-name" data-flow="pdp-name">${esc(d.name)}</h1>
          <div class="p-price"><span data-flow="pdp-price">${esc(d.priceText)}</span><span class="p-note">${esc(d.priceNote)} · ${esc(d.store)}</span></div>
          <p class="p-why">${esc(d.why[0] || d.reason)}</p>
          <a class="seller" data-flow="seller-link" href="${esc(d.url)}" target="_blank" rel="noopener noreferrer">무신사에서 보기 ↗</a>
          <div class="decide" role="group" aria-label="이 후보를 어떻게 할까요">
            <button type="button" data-flow="compare-add" data-product-id="${esc(id)}" data-act="pin" data-id="${esc(id)}" aria-pressed="${M.compareHas(id)}">${M.compareHas(id) ? '비교함 ✓' : '비교 담기'}</button>
            <button type="button" data-flow="decide-skip" data-act="decide" data-d="skip" aria-pressed="${pressed('skip')}">안 살래</button>
            <button type="button" data-flow="decide-hold" data-act="decide" data-d="hold" aria-pressed="${pressed('hold')}">보류</button>
            <button type="button" class="primary" data-flow="decide-buy" data-act="decide" data-d="buy" aria-pressed="${pressed('buy')}">사기로 함</button>
          </div>
          ${rec ? `<p class="rec-line">${esc(SHORT.records)}: ${esc(rec.stageLabel)} · <a href="#/records">기록 보기</a></p>` : ''}
          <section class="q-step" aria-labelledby="v-title">
            <div class="q-head"><span class="q-k">내 옷과</span><span class="q-basis">${esc(v.basisLabel)}</span></div>
            <h2 class="v-title" id="v-title"><span data-flow="verdict">${esc(v.title)}</span></h2>
            ${v.lines.length ? `<ul class="v-lines">${v.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}
            ${(v.cautions || []).map((c) => `<p class="small">${esc(c)}</p>`).join('')}
            ${owned}${ask}
            ${s && !params.add ? `<button type="button" class="btn" data-flow="closet-add" data-act="add">가진 ${esc(s.kindName)} 넣고 비교</button>` : ''}
            ${addPanel}
          </section>
          <h2 class="sec">새 상품과 중고</h2>
          <div class="nu">
            <div class="nu-new"><span class="k">새 상품</span><b>${esc(nu.fresh.priceText)}</b><p class="small">${esc(nu.fresh.priceNote)} · ${esc(nu.fresh.store)}</p><p class="small">${esc(nu.fresh.photoNote)}</p></div>
            <div class="nu-used" data-flow="used-search"><span class="k">중고</span><b>${esc(nu.used.priceNote)}</b><p class="small">${esc(SHORT.used)}</p>
              <div class="links">${nu.used.groups.map((g) => `<span class="rg">${esc(g.region)}</span>${g.links.map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.label)}</a>`).join('')}`).join('')}</div>
              <p class="small" style="margin-top:8px">${esc(nu.used.note)}</p></div>
          </div>
        </div>
      </div>
      ${d.alternatives.length ? `<section class="alts" aria-labelledby="alt-h"><h2 class="sec" id="alt-h">같은 조건 다른 선택<small>${d.alternatives.length}개</small></h2>
        ${d.alternativesNote ? `<p class="small" style="margin:-6px 0 12px">${esc(d.alternativesNote)}</p>` : ''}
        <ul class="grid">${d.alternatives.slice(0, 8).map((p) => card(p, { result: false })).join('')}</ul></section>` : ''}
      ${look ? `<section aria-labelledby="look-h"><h2 class="sec" id="look-h">이 옷으로 입는 예<small>규칙으로 조합한 예시</small></h2>
        <div class="look">${look.pieces.map((p, k) => `${k ? '<span class="plus" aria-hidden="true">+</span>' : ''}<figure class="${p.focus ? 'me' : ''}">${frame(p, { caption: false })}<figcaption><b>${esc(p.focus ? '이 옷' : p.roleLabel)}</b>${esc(p.owned ? `내 ${p.label}` : p.label)}${p.product && !p.focus ? `<br><span class="num">${esc(p.product.priceText)}</span>` : ''}${simNote(p)}</figcaption></figure>`).join('')}</div>
        ${look.note ? `<p class="small" style="margin-top:8px">${esc(look.note)}</p>` : ''}
        ${d.outfitNote ? `<p class="small">${esc(d.outfitNote)}</p>` : ''}</section>` : ''}
    </article>`;
    if (params.view === 'photo') {
      $over.innerHTML = `<div class="viewer" data-flow="photo-viewer" role="dialog" aria-modal="true" aria-label="사진 크게 보기">
        <div class="v-photo">${M.photoHtml(d, { fit: 'contain', eager: true })}</div>
        <div class="v-bar"><span>${esc(d.brand)} · ${esc(d.name)}</span><button type="button" class="btn primary" data-act="close-overlay">닫기</button></div></div>`;
      setTimeout(() => $over.querySelector('[data-act="close-overlay"]')?.focus(), 0);
    }
    return params.view ? 'keep' : params.add ? 'addq' : 'top';
  }
  const josa = (w) => { const c = w.charCodeAt(w.length - 1) - 0xac00; return c >= 0 && c <= 11171 && c % 28 ? '은' : '는'; };

  // ── 비교
  function compareView() {
    const c = M.compareRows();
    const n = c.items.length;
    const recOf = (id) => M.judge(id)?.record;
    $main.innerHTML = `<section class="page" data-flow="compare-view" aria-labelledby="cmp-h">
      <h1 class="said" id="cmp-h">${n >= 2 ? `후보 ${n}개를 나란히` : '비교할 후보를 담아 주세요'}</h1>
      <p class="small">${n >= 2 ? '값이 같은 줄은 흐리게 보여요' : '결과나 상품에서 ‘비교 담기’를 누르면 여기에 모여요. 4개까지 담을 수 있어요.'}</p>
      ${n ? `<div class="cmp-items" style="--n:${Math.max(2, n)}">${c.items.map((p) => `<div class="cmp-item" data-flow="compare-item" data-product-id="${esc(p.id)}">
          <a href="${href(`/p/${p.id}`)}">${frame(p)}<span class="c-brand">${esc(p.brand)}</span><span class="c-name">${esc(p.name)}</span></a>
          <div class="cmp-act"><button type="button" data-flow="decide-hold" data-act="decide" data-d="hold" data-id="${esc(p.id)}" aria-pressed="${recOf(p.id)?.decision === 'hold'}">${recOf(p.id)?.decision === 'hold' ? '보류함' : '보류'}</button>
          <button type="button" data-act="unpin" data-id="${esc(p.id)}" aria-label="${esc(p.name)} 비교에서 빼기">빼기</button></div></div>`).join('')}</div>` : ''}
      ${n >= 2 ? `<div class="tbl"><table><caption class="vh">후보 비교 표</caption><tbody>${c.rows.filter((r) => r.primary).map(row).join('')}</tbody></table>
        <details class="more-rows"><summary>더 보기(옷장·종류·이유·평점)</summary><table><tbody>${c.rows.filter((r) => !r.primary).map(row).join('')}</tbody></table></details></div>
        <p class="small" style="margin-top:10px">${esc(c.note)}</p>` : `<div class="row-actions"><a class="btn" href="${esc(lastThreadHash() || '#/')}">스레드로 돌아가기</a></div>`}
    </section>`;
    return 'top';
  }
  const row = (r) => `<tr class="${r.same ? 'same' : ''}"><th scope="row">${esc(r.label)}</th>${r.values.map((x) => `<td>${esc(x)}</td>`).join('')}</tr>`;

  // ── 기록
  function recordsView(params) {
    const rs = M.getState().records;
    $main.innerHTML = `<section class="page" aria-labelledby="rec-h">
      <h1 class="said" id="rec-h">기록 ${rs.length ? `<span class="num">${rs.length}</span>` : ''}</h1>
      <p class="small">${esc(SHORT.records)}이에요. 주문·수령도 눌러서 남겨요.</p>
      ${rs.length ? `<ol class="recs">${rs.map((r) => `<li class="rec" data-flow="record" data-product-id="${esc(r.productId)}">
          <a href="${href(`/p/${r.productId}`)}">${frame(r.product || r)}</a>
          <div><a href="${href(`/p/${r.productId}`)}"><span class="c-brand" style="margin-top:0">${esc(r.product?.brand)}</span><span class="c-name" style="min-height:0">${esc(r.product?.name)}</span></a>
            <span class="r-stage">${esc(r.stageLabel)}</span>${r.product ? ` <span class="small num">${esc(r.product.priceText)}</span>` : ''}
            ${r.returnReasonLabel ? `<p class="small">반품 사유: ${esc(r.returnReasonLabel)}</p>` : ''}
            <div class="r-steps">${params.reason === r.productId
              ? `${M.returnReasons.map((x) => `<button type="button" data-act="return" data-id="${esc(r.productId)}" data-reason="${esc(x.id)}">${esc(x.label)}</button>`).join('')}<button type="button" data-act="cancel-reason">그만두기</button>`
              : r.next.map((x) => `<button type="button" data-flow="record-step" data-step="${esc(x.step)}" data-act="step" data-id="${esc(r.productId)}" data-reason-need="${x.needsReason ? 1 : ''}">${esc(x.label)}</button>`).join('')}
              ${r.stage === 'candidate' ? `<button type="button" data-act="remove-record" data-id="${esc(r.productId)}">지우기</button>` : ''}</div>
          </div></li>`).join('')}</ol>`
        : `<div class="row-actions"><a class="btn" href="${esc(lastThreadHash() || '#/')}">찾으러 가기</a></div>`}
    </section>`;
    return 'top';
  }

  // ── 옷장: 질문 하나씩(종류 → 세부 종류 → 색)
  function closetView(params) {
    const st = M.getState();
    if (params.add) {
      const kind = params.kind;
      const slots = kind ? M.slotChoices(kind) : [];
      const needSlot = kind && slots.length > 1 && !params.slot;
      const slot = params.slot || (slots.length === 1 ? slots[0].id : '');
      const kindName = kind ? (M.kindChoices().find((k) => k.id === kind)?.name || '옷') : '';
      $main.innerHTML = `<section class="page" aria-labelledby="add-h">
        <span class="q-k">질문 하나</span>
        ${!kind ? `<h1 class="said" id="add-h">어떤 옷을 넣을까요?</h1><div class="opts">${M.kindChoices().map((k) => `<button type="button" data-flow="kind-option" data-kind="${esc(k.id)}" data-act="kind">${esc(k.name)}</button>`).join('')}</div>`
          : needSlot ? `<h1 class="said" id="add-h">어떤 ${esc(kindName)}인가요?</h1><div class="opts">${slots.map((x) => `<button type="button" data-flow="slot-option" data-slot="${esc(x.id)}" data-act="slot">${esc(x.name)}</button>`).join('')}<button type="button" data-act="slot" data-slot="">잘 모르겠어요</button></div>`
          : `<h1 class="said" id="add-h">${esc(kindName)} 색은요?</h1><div class="swatches">${M.colorChoices().map((c) => `<button type="button" class="sw" data-flow="color-option" data-color="${esc(c.id)}" data-act="closet-color" data-kind="${esc(kind)}" data-slot="${esc(slot)}"><i style="background:${esc(c.hex)}"></i>${esc(c.label)}</button>`).join('')}</div>`}
        <div class="row-actions"><button type="button" class="text-btn" data-act="close-overlay">그만두기</button></div>
      </section>`;
      return 'top';
    }
    $main.innerHTML = `<section class="page" aria-labelledby="closet-h">
      <h1 class="said" id="closet-h">옷장 <span class="num">${st.closetCount}</span>벌</h1>
      <p class="small">없어도 찾을 수 있어요. 넣어 두면 결과와 상품에서 겹치는 옷을 알려 드려요.</p>
      <div class="row-actions">
        <a class="btn primary" href="${href('/closet', { add: 1 })}" data-flow="closet-add">옷 한 벌 넣기</a>
        ${st.trialCount ? '<button type="button" class="btn" data-act="trial-off">체험용 옷 빼기</button>' : '<button type="button" class="btn" data-flow="trial-closet" data-act="trial">체험용 옷으로 해 보기</button>'}
      </div>
      ${st.closetCount ? `<ul class="closet-grid">${st.closet.map((g) => `<li>${frame(g, { caption: false })}<div class="g-name">${esc(g.label)}</div>${simNote(g)}<div class="g-src">${esc(g.sourceLabel)}${g.detailMissing ? ` · ${esc(g.detailMissing)}` : ''}</div>${g.bought ? '' : `<button type="button" data-act="remove-garment" data-id="${esc(g.id)}" aria-label="${esc(g.label)} 빼기">빼기</button>`}</li>`).join('')}</ul>` : ''}
      <div class="row-actions" style="margin-top:36px"><button type="button" class="text-btn" data-flow="reset" data-act="reset">${resetArmed ? '한 번 더 누르면 옷장·기록·비교함을 모두 지워요' : '처음부터 다시 하기'}</button></div>
    </section>`;
    return 'top';
  }
  let resetArmed = false;

  // ── PC 오른쪽: 지금 보는 후보
  function asideView(view) {
    if (view === 'pdp') { $aside.innerHTML = ''; return; }
    const list = M.compareList().map((id) => M.product(id, { criteria: null })).filter(Boolean);
    const recN = M.getState().records.length;
    $aside.innerHTML = `<div class="panel">
      <h2>지금 보는 후보</h2><p class="small">비교함 ${list.length} / 4</p>
      ${list.length ? `<ul>${list.map((p) => `<li><a href="${href(`/p/${p.id}`)}">${frame(p)}</a><a href="${href(`/p/${p.id}`)}"><span class="pb">${esc(p.brand)}</span><span class="pn2">${esc(p.name)}</span><span class="pp">${esc(p.priceText)}</span></a><button type="button" data-act="unpin" data-id="${esc(p.id)}" aria-label="${esc(p.name)} 비교에서 빼기">×</button></li>`).join('')}</ul>
        ${list.length >= 2 && view !== 'compare' ? `<a class="btn primary" href="#/compare">${list.length}개 나란히 보기</a>` : ''}` : '<p class="empty-p">결과에서 ‘+ 비교 담기’를 누르면 여기에 모여요.</p>'}
      <div class="p-sec"><h2>기록</h2><p class="small">${recN ? `${recN}개 · <a href="#/records">기록 보기</a>` : '사기로 함·보류·안 살래를 누르면 남아요.'}</p></div>
    </div>`;
  }

  // ── 머리글·입력칸 상태
  function chrome(view) {
    document.body.dataset.view = view;
    const n = M.compareList().length;
    const $n = document.getElementById('cmp-n');
    $n.textContent = n; $n.hidden = !n;
    document.querySelectorAll('.menu a').forEach((a) => { if (a.dataset.nav === view) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    $wrap.hidden = !(view === 'home' || view === 'thread');
    asideView(view);
  }

  // ── 그리기
  function render() {
    const { path, params } = M.route.current();
    const [, a, b] = path.split('/');
    $over.innerHTML = '';
    hideSugs();
    let view = 'home', how = 'top';
    if (a === 'search') { view = 'thread'; how = threadView(params); }
    else if (a === 'p' && b) { view = 'pdp'; how = pdpView(decodeURIComponent(b), params); }
    else if (a === 'compare') { view = 'compare'; how = compareView(); }
    else if (a === 'records') { view = 'records'; how = recordsView(params); }
    else if (a === 'closet') { view = 'closet'; how = closetView(params); }
    else how = homeView();
    if (a !== 'closet') resetArmed = false;
    chrome(view);
    nav.enter = false;
    return how;
  }
  const headerH = () => document.querySelector('.top').getBoundingClientRect().height;
  function place(how, prevY) {
    const saved = memo.get(location.hash);
    const target = () => {
      if (saved != null) return saved;
      if (how === 'keep') return prevY;
      if (how === 'step') { const el = document.getElementById('active'); return el ? Math.max(0, el.getBoundingClientRect().top + window.scrollY - headerH() - 14) : 0; }
      if (how === 'addq') { const el = document.getElementById('addq'); return el ? Math.max(0, el.getBoundingClientRect().top + window.scrollY - headerH() - 12) : prevY; }
      return 0;
    };
    window.scrollTo(0, target());
    requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, target())));
  }
  function refresh() { const y = window.scrollY; render(); window.scrollTo(0, y); }

  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  let lastHash = location.hash;
  window.addEventListener('hashchange', () => {
    const old = lastHash;
    const prevY = window.scrollY;
    memo.set(old, prevY);
    lastHash = location.hash;
    track(old, lastHash);
    place(render(), prevY);
    if (!pidOf(lastHash) || !/[?&](view|add)=/.test(lastHash)) $main.focus({ preventScroll: true });
  });

  // ── 알림(되돌리기)
  let toastTimer = 0;
  function toast(msg, { undo = null, link = null } = {}) {
    clearTimeout(toastTimer);
    $toast.innerHTML = `<span>${esc(msg)}</span>${undo ? '<button type="button" data-act="toast-undo">되돌리기</button>' : ''}${link ? `<a href="${esc(link.href)}">${esc(link.label)}</a>` : ''}`;
    $toast.hidden = false;
    $toast._undo = undo;
    toastTimer = setTimeout(() => { $toast.hidden = true; $toast._undo = null; }, 5000);
  }

  // ── 입력칸과 제안
  function submitAsk(text, { say = '' } = {}) {
    const t = String(text || '').trim();
    if (!t) { $ask.focus(); return; }
    $ask.value = '';
    hideSugs();
    nav.enter = true;
    const onThread = isSearch(location.hash);
    if (onThread) go('/search', { q: t, p: current.prevText, say, s: current.s + 1 });
    else { saveThread([]); go('/search', { q: t, say, s: 0 }); }
  }
  $form.addEventListener('submit', (e) => { e.preventDefault(); submitAsk($ask.value); });
  function showSugs() {
    const v = $ask.value.trim();
    const list = v ? M.searchSuggestions(v, { limit: 5 }).filter((x) => x.q !== v) : [];
    if (!list.length) { hideSugs(); return; }
    $sugs.innerHTML = list.map((s) => `<button type="button" role="option" data-act="sug" data-q="${esc(s.q)}"><span class="k">${esc(s.label)}</span>${esc(s.q)}</button>`).join('');
    $sugs.hidden = false;
  }
  function hideSugs() { $sugs.hidden = true; $sugs.innerHTML = ''; }
  $ask.addEventListener('input', showSugs);
  $ask.addEventListener('blur', () => setTimeout(hideSugs, 150));

  // ── 누르기
  function backToThread() {
    if (nav.canPop) history.back();
    else location.hash = (nav.backTo || lastThreadHash() || '#/').replace(/^#/, '');
  }
  function closeOverlay() {
    const { path } = M.route.current();
    if (nav.overlayPushed) history.back();
    else replaceGo(path);
  }
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const act = el.dataset.act;
    const { path, params } = M.route.current();
    const pid = path.startsWith('/p/') ? decodeURIComponent(path.slice(3)) : null;
    const id = el.dataset.id || pid;
    switch (act) {
      case 'start': e.preventDefault(); nav.enter = true; saveThread([]); go('/search', { q: el.dataset.q, s: 0 }); break;
      case 'sug': e.preventDefault(); submitAsk(el.dataset.q); break;
      case 'follow': nav.enter = true; go('/search', { q: el.dataset.q, p: current.prevText, say: el.dataset.say, s: current.s + 1 }); break;
      case 'drop': go('/search', { ...params, drop: [...(params.drop || '').split(',').filter(Boolean), el.dataset.key].join(',') }); break;
      case 'undrop': go('/search', { ...params, drop: (params.drop || '').split(',').filter((k) => k && k !== el.dataset.key).join(',') }); break;
      case 'relax': go('/search', { ...params, drop: el.dataset.drop }); break;
      case 'focus': $ask.focus(); break;
      case 'more-steps': { const tpl = document.getElementById('hidden-steps'); if (tpl) { el.closest('li').replaceWith(tpl.content.cloneNode(true)); tpl.remove(); } break; }
      case 'gender': M.setGender(el.dataset.g); refresh(); break;
      case 'pin': {
        e.preventDefault();
        try {
          if (M.compareHas(el.dataset.id)) { M.compareRemove(el.dataset.id); toast('비교함에서 뺐어요'); }
          else { M.compareAdd(el.dataset.id); const n = M.compareList().length; toast(`비교함에 담았어요 · ${n}개`, n >= 2 ? { link: { href: '#/compare', label: '나란히 보기' } } : {}); }
        } catch (err) { toast(err.message); }
        refresh(); break;
      }
      case 'unpin': M.compareRemove(el.dataset.id); refresh(); break;
      case 'swap': e.preventDefault(); replaceGo(`/p/${el.dataset.id}`); break;
      case 'back': backToThread(); break;
      case 'zoom': go(path, { view: 'photo' }); break;
      case 'add': go(path, { add: 1 }); break;
      case 'close-overlay': closeOverlay(); break;
      case 'add-color': {
        const s = M.judge(pid)?.addSuggestion;
        if (!s) break;
        const before = new Set(M.getState().closet.map((g) => g.id));
        M.addGarment({ kind: s.kind, slot: s.slot, color: el.dataset.color });
        const g = M.getState().closet.find((x) => !before.has(x.id));
        closeOverlay();
        toast(`옷장에 넣었어요 · ${g ? g.label : ''}`, { undo: g ? () => { try { M.removeGarment(g.id); } catch (err) { toast(err.message); } refresh(); } : null });
        break;
      }
      case 'own': M.setOwnership(pid, el.dataset.v); refresh(); break;
      case 'decide': {
        const pidD = el.dataset.id || pid;
        const had = M.judge(pidD)?.record;
        const rec = M.decide(pidD, el.dataset.d);
        toast(`기록했어요 · ${rec.decisionLabel}`, had ? { link: { href: '#/records', label: '기록' } } : { undo: () => { try { M.removeRecord(pidD); } catch (err) { toast(err.message); } refresh(); } });
        refresh(); break;
      }
      case 'step': {
        if (el.dataset.reasonNeed) { go('/records', { reason: el.dataset.id }); break; }
        try { M.advance(el.dataset.id, el.dataset.step); } catch (err) { toast(err.message); }
        refresh(); break;
      }
      case 'return': try { M.advance(el.dataset.id, 'returned', { reason: el.dataset.reason }); } catch (err) { toast(err.message); } go('/records', {}, { replace: true }); break;
      case 'cancel-reason': go('/records', {}, { replace: true }); break;
      case 'remove-record': try { M.removeRecord(el.dataset.id); } catch (err) { toast(err.message); } refresh(); break;
      case 'kind': nav.replacing = true; go('/closet', { add: 1, kind: el.dataset.kind }, { replace: true }); break;
      case 'slot': nav.replacing = true; go('/closet', { ...params, slot: el.dataset.slot || 'unknown' }, { replace: true }); break;
      case 'closet-color': {
        const before = new Set(M.getState().closet.map((g) => g.id));
        const slot = el.dataset.slot && el.dataset.slot !== 'unknown' ? el.dataset.slot : null;
        M.addGarment({ kind: el.dataset.kind, slot, color: el.dataset.color });
        const g = M.getState().closet.find((x) => !before.has(x.id));
        closeOverlay();
        toast(`옷장에 넣었어요 · ${g ? g.label : ''}`, { undo: g ? () => { try { M.removeGarment(g.id); } catch (err) { toast(err.message); } refresh(); } : null });
        break;
      }
      case 'remove-garment': try { M.removeGarment(el.dataset.id); toast('옷장에서 뺐어요'); } catch (err) { toast(err.message); } refresh(); break;
      case 'trial': M.loadTrialCloset(); toast(`체험용 옷 ${M.getState().trialCount}벌을 넣었어요`); refresh(); break;
      case 'trial-off': M.clearTrialCloset(); refresh(); break;
      case 'reset':
        if (!resetArmed) { resetArmed = true; refresh(); break; }
        resetArmed = false; M.reset(); saveThread([]); setLastThreadHash(''); toast('처음 상태로 돌렸어요'); go('/'); break;
      case 'toast-undo': { const f = $toast._undo; $toast.hidden = true; $toast._undo = null; if (f) f(); break; }
      default: break;
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (document.querySelector('#eo-disclosure[open]')) return;
    if (!$sugs.hidden) { hideSugs(); return; }
    const { path, params } = M.route.current();
    if ((path.startsWith('/p/') && (params.view || params.add)) || (path === '/closet' && params.add)) { e.preventDefault(); closeOverlay(); }
  });

  // ── 시작: 주소의 ?q=는 바로 결과로
  if (M.boot.q && !location.hash) { saveThread([]); history.replaceState(null, '', href('/search', { q: M.boot.q, s: 0 })); }
  lastHash = location.hash;
  place(render(), 0);
})();
