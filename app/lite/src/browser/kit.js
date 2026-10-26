// 다섯 시안이 함께 쓰는 작은 도구. 화면 모양은 각 시안이 정하고, 여기는 사진·이동·알림·정보창만 맡는다.
// 사진은 함께 올린 p/ 폴더(상품 id.jpg)에서 읽는다. 못 읽으면 코어가 색 카드로 바꾼다.
(() => {
  const M = window.EoulMock;
  const CUT = window.CUTOUTS || {};
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // 스프링 곡선: 실제 스프링 식을 풀어 CSS linear()로 만든다. 지원하지 않으면 cubic-bezier.
  function spring(k = 210, c = 21) {
    let x = 0, v = 0, t = 0; const pts = []; const dt = 1 / 120;
    while (t < 1.6) { const a = -k * (x - 1) - c * v; v += a * dt; x += v * dt; t += dt; pts.push(x); if (t > .3 && Math.abs(x - 1) < .002 && Math.abs(v) < .02) break; }
    const step = Math.max(1, Math.floor(pts.length / 40)); const s = [0];
    for (let i = step; i < pts.length; i += step) s.push(+pts[i].toFixed(3));
    s.push(1);
    const lin = `linear(${s.join(', ')})`;
    return { css: CSS.supports('transition-timing-function', lin) ? lin : 'cubic-bezier(.2, .9, .25, 1.15)', ms: Math.round(t * 1000) };
  }
  const SPRING = spring();
  document.documentElement.style.setProperty('--spring', SPRING.css);

  // ── 사진
  const WHITE = new Set(Object.values(CUT).flat());
  const imgTag = (src, cls, alt = '') => `<img class="${cls}" src="${esc(src)}" alt="${esc(alt)}" decoding="async" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'k-miss'}))">`;
  // 상품 사진(판매처 사진). 흰 배경 사진이면 cutout 표시를 붙여 각 시안이 배경을 지우는 방식으로 쓸 수 있다.
  function productImg(id, { cls = 'k-img' } = {}) {
    const ph = M.photo({ id });
    if (!ph) return M.photoHtml({ id }, { caption: false });
    return imgTag(ph.src, `${cls}${WHITE.has(id) ? ' k-white' : ''}`, ph.alt);
  }
  // 종류·색만 아는 옷(내 옷장)의 '비슷한 상품 사진'. 흰 배경 사진을 먼저 쓰고, 없으면 코어의 비슷한 사진, 그것도 없으면 색 카드.
  function garmentImg(g, { cls = 'k-img' } = {}) {
    if (g.photoId) return `<span class="k-miss" role="img" aria-label="${esc(g.label || '내 옷')} · 내 사진 연결됨">내 사진 연결됨</span>`;
    const id = CUT[`${g.gender || M.getState().gender}|${g.kind}|${g.color}`]?.[0];
    if (id) return productImg(id, { cls });
    const ph = M.photo(g);
    if (ph) return imgTag(ph.src, cls, ph.alt);
    return M.photoHtml(g, { caption: false });
  }
  // 조합 칸(outfitView의 piece): 가진 옷이면 garmentImg, 후보 상품이면 productImg.
  function pieceImg(p, opts) {
    const g = p.garmentId && M.getState().closet.find((x) => x.id === p.garmentId);
    if (g) return garmentImg(g, opts);
    if (p.product) return productImg(p.product.id, opts);
    return M.photoHtml(p, { caption: false });
  }

  // ── 화면 이동: 페이지 안에서만 쓰는 쌓기식 이동. 브라우저 뒤로가기도 따라간다.
  const stack = [];
  let onRender = () => {};
  function start(render, first = { view: 'home', params: {} }) {
    onRender = render;
    stack.length = 0; stack.push(first);
    try { history.replaceState({ k: 1 }, ''); } catch {}
    addEventListener('popstate', () => { if (stack.length > 1) { stack.pop(); draw('back'); } });
    draw('none');
  }
  function go(view, params = {}, { replace = false } = {}) {
    const memo = { ...current(), scroll: scrollY };
    stack[stack.length - 1] = memo;
    if (replace) stack[stack.length - 1] = { view, params };
    else { stack.push({ view, params }); try { history.pushState({ k: stack.length }, ''); } catch {} }
    draw('forward');
  }
  function tab(view, params = {}) { stack.length = 0; stack.push({ view, params }); draw('tab'); }
  function back() { if (stack.length > 1) { try { history.back(); } catch { stack.pop(); draw('back'); } } }
  const current = () => stack[stack.length - 1];
  function draw(dir) {
    const cur = current();
    onRender(cur.view, cur.params || {}, dir);
    requestAnimationFrame(() => scrollTo(0, dir === 'back' ? cur.scroll || 0 : 0));
  }
  const refresh = () => { const cur = current(); onRender(cur.view, cur.params || {}, 'none'); };

  // ── 알림
  let tt;
  function toast(text, { bottom = 96 } = {}) {
    $('.k-toast')?.remove();
    const el = document.createElement('div');
    el.className = 'k-toast'; el.setAttribute('role', 'status'); el.textContent = text;
    el.style.bottom = `calc(${bottom}px + env(safe-area-inset-bottom, 0px))`;
    document.body.appendChild(el);
    if (!reduce) el.animate([{ transform: 'translate(-50%, 10px)', opacity: 0 }, { transform: 'translate(-50%, 0)', opacity: 1 }], { duration: 320, easing: SPRING.css });
    clearTimeout(tt); tt = setTimeout(() => el.remove(), 2600);
  }

  // ── 시안 정보(사진 출처·가격·규칙 기반 판단을 한 곳에서 밝힌다)
  function info(designName) {
    let d = $('#k-info');
    if (!d) {
      d = document.createElement('dialog');
      d.id = 'k-info';
      d.innerHTML = `<div class="k-info-body"><h2>이 시안에 대해</h2>
        <p><b>${esc(designName)}</b> · 서비스 이름은 정하지 않았어요.</p>
        <h3>누가 만들었나</h3><p>AI(Claude)가 디자인 수상작을 조사·분석해 만든 시안이에요. 수상 디자이너가 참여하지 않았어요. 목표는 세계 최고 수준의 UX/UI이고, 이 시안이 그 수준이라고 검증된 것은 아니에요.</p>
        <h3>상품과 사진</h3><p>상품명·가격·사진은 무신사 상품 페이지에서 2026년 10월 13~14일에 모은 자료예요. 사진은 확인용으로 이 페이지에 함께 올린 사본이고, 사용 권리는 확인하지 않았어요. 링크를 외부에 공유하지 말아 주세요.</p>
        <p>가격은 수집 시점의 판매가예요(쿠폰·배송비 제외). 내 옷장의 사진은 내 옷이 아니라 종류·색이 같은 비슷한 상품 사진이에요.</p>
        <h3>판단</h3><p>검색과 '내 옷과' 판단은 정해 둔 규칙으로 계산해요. 대화형 AI가 아니에요. 핏·소재·사이즈는 따지지 않아요.</p>
        <h3>저장</h3><p>옷장과 기록은 이 브라우저에만 저장돼요. '처음부터'를 누르면 지워져요.</p></div>
        <form method="dialog" class="k-info-foot"><button>닫기</button></form>`;
      document.body.appendChild(d);
      d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
    }
    if (d.showModal) d.showModal(); else d.setAttribute('open', '');
  }

  // 처음 상태로: 저장된 옷장·기록·비교를 지운다.
  function reset() { M.reset(); }

  // 숫자 굴리기(자리마다 0~9 띠를 올린다). from이 없으면 바로 n.
  function odo(n, from) {
    const to = String(n), fr = String(from ?? n).padStart(to.length, '0').slice(-to.length);
    return `<span class="k-odo" role="img" aria-label="${n}">${[...to].map((d, i) => `<span class="k-d"><span class="k-col" data-to="${d}" style="transform:translateY(-${Number(fr[i]) * 10}%)">${'0123456789'.split('').map((x) => `<span>${x}</span>`).join('')}</span></span>`).join('')}</span>`;
  }
  const rollOdo = (root = document) => requestAnimationFrame(() => requestAnimationFrame(() => $$('.k-odo .k-col', root).forEach((c) => { c.style.transform = `translateY(-${Number(c.dataset.to) * 10}%)`; })));

  // 날아가 앉기: from 사각형에서 to 요소 자리로 html 조각을 옮기는 움직임.
  function fly(html, from, toEl, { radius = 0, bg = 'transparent' } = {}) {
    if (reduce || !toEl) return Promise.resolve();
    const to = toEl.getBoundingClientRect();
    const f = document.createElement('div');
    f.className = 'k-fly'; f.innerHTML = html;
    Object.assign(f.style, { left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px`, borderRadius: `${radius}px`, background: bg });
    document.body.appendChild(f);
    const s = to.width / from.width;
    return f.animate([{ transform: 'translate(0,0) scale(1)' }, { transform: `translate(${to.left - from.left}px, ${to.top - from.top}px) scale(${s})` }], { duration: Math.max(520, SPRING.ms), easing: SPRING.css, fill: 'forwards' }).finished.then(() => f.remove());
  }

  // 공통 스타일(각 시안이 덮어쓸 수 있게 낮은 우선순위로).
  const css = document.createElement('style');
  css.textContent = `
  .k-miss{display:block;width:100%;height:100%;background:repeating-linear-gradient(135deg,transparent 0 8px,rgba(0,0,0,.04) 8px 9px)}
  .k-toast{position:fixed;z-index:90;left:50%;transform:translateX(-50%);max-width:calc(100% - 32px);padding:12px 18px;border-radius:999px;background:var(--k-toast-bg,#111);color:var(--k-toast-fg,#fff);font:600 14px/1.4 var(--k-font,system-ui,sans-serif);box-shadow:0 8px 24px rgba(0,0,0,.18)}
  .k-fly{position:fixed;z-index:95;pointer-events:none;display:grid;place-items:center;overflow:hidden;will-change:transform}
  .k-fly img{width:100%;height:100%;object-fit:contain}
  .k-odo{display:inline-flex;height:1em;line-height:1;overflow:hidden;font-variant-numeric:tabular-nums}
  .k-odo .k-d{display:block;height:1em;overflow:hidden}
  .k-odo .k-col{display:flex;flex-direction:column;transition:transform 900ms var(--spring,ease)}
  .k-odo .k-col span{display:block;height:1em}
  #k-info{max-width:520px;width:calc(100% - 32px);max-height:82vh;border:0;border-radius:16px;padding:0;background:var(--k-info-bg,#fff);color:var(--k-info-fg,#111);font:15px/1.6 var(--k-font,system-ui,sans-serif)}
  #k-info::backdrop{background:rgba(0,0,0,.4)}
  #k-info .k-info-body{padding:22px 22px 6px}#k-info h2{margin:0 0 8px;font-size:19px}#k-info h3{margin:18px 0 4px;font-size:13px;opacity:.6}#k-info p{margin:0 0 8px}
  #k-info .k-info-foot{position:sticky;bottom:0;padding:12px 22px 20px;background:inherit}#k-info .k-info-foot button{width:100%;min-height:48px;border:0;border-radius:999px;background:var(--k-info-fg,#111);color:var(--k-info-bg,#fff);font:600 15px var(--k-font,system-ui,sans-serif);cursor:pointer}
  @media (prefers-reduced-motion: reduce){.k-odo .k-col{transition:none}}`;
  document.head.appendChild(css);

  window.K = { M, esc, $, $$, reduce, SPRING, spring, productImg, garmentImg, pieceImg, WHITE, CUT, start, go, tab, back, current, refresh, toast, info, reset, odo, rollOdo, fly };
})();
