/* 다기기 대응(2026-11-01). 앱 화면(screen.html)과 독립 커뮤니티 /c가 함께 쓴다(/c는 CSP상 인라인 스크립트가 안 돼 파일로 둔다).
   화면을 다시 그리지 않으므로 작성 중인 글·선택·초점은 그대로이고, 아래 세 가지만 맞춘다.
   - 키보드: 보이는 영역(visualViewport)이 80px 넘게 줄면(확대 제외) data-kb·--kb(iOS). 안드로이드는 viewport의
     interactive-widget=resizes-content로 화면 자체가 줄어, 입력칸 초점 + 높이 72% 미만일 때 data-kb만 둔다. --vvh는 보이는 높이,
     --vvt는 보이는 영역의 위 끝(offsetTop).
   - 아래 막대: 화면 아래에 붙은 고정 막대가 차지한 높이를 --chrome-b·data-chrome으로 두어 본문 끝이 가리지 않게 한다.
   - 스크롤 위치: 배치가 바뀌면(창 폭 변화 = 회전·펼치기·분할, 또는 높이 500px을 넘나들어 짧은 창 메뉴 줄이 켜지고
     꺼짐) 바뀌기 전 화면 위쪽에 보이던 요소를 같은 높이로 되돌린다. 배치가 그대로인 높이 변화(휴대폰 주소창 접힘·
     키보드)는 건드리지 않는다(내리던 화면을 끌어올리지 않게).
     되돌린 직후 0.5초 동안은 그 위치에서 나는 스크롤 이벤트(되돌림 자신)와 내용이 짧아져 맨 끝으로 당겨진 스크롤로
     기준을 바꾸지 않아 연속 크기 변화에도 조금씩 밀리지 않고, 사람이 그사이 다른 곳으로 스크롤하면 그 위치를 새
     기준으로 삼는다. 배치가 바뀌었는데 resize 이벤트가 아직 오지 않은 동안의 스크롤 이벤트(브라우저가 늦게 보낼 때)도
     기준을 바꾸지 않는다. */
(function () {
  if (window.EOUL_VIEWPORT) return;
  var root = document.documentElement, vv = window.visualViewport, raf = 0, tall = 0, wide = 0;
  var BARS = '.tabs, .strip, .buybar, .chatbar, .pinbar, .shelfbar, .regbar, .wr-sheet, [data-fixed-bottom]';
  // 높이로 배치가 바뀌는 단계: screen.html의 짧은 창(폭 600 이상·높이 500 이하) 메뉴 줄. 폭과 함께 배치 열쇠로 쓴다.
  var SHORT = window.matchMedia ? matchMedia('(min-width: 600px) and (max-height: 500px)') : null;
  function layout() { return innerWidth + (SHORT && SHORT.matches ? ':short' : ''); }
  var anchor = null, holdUntil = 0, heldY = 0, lastLayout = layout();
  function now() { return Date.now(); }
  function editing() {
    var el = document.activeElement;
    return !!el && (el.isContentEditable || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' ||
      (el.tagName === 'INPUT' && !/^(checkbox|radio|button|submit|reset|range|color|file|image)$/.test(el.type)));
  }
  function chrome() {
    var h = innerHeight, used = 0, list = document.querySelectorAll(BARS);
    for (var i = 0; i < list.length; i++) {
      var el = list[i], cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || el.closest('[hidden]')) continue;
      var b = el.getBoundingClientRect();
      // 목록에 있는 아래 막대만 재므로 폭으로 거르지 않는다(넓은 창의 560px 옷장 시트도 포함).
      if (!b.height || b.height > h * 0.6 || b.bottom < h - 160) continue;
      used = Math.max(used, h - b.top);
    }
    return Math.round(used);
  }
  // 화면 위쪽(고정 머리 아래) 가운데에 보이는 요소 중, 창 높이의 60%보다 작은 가장 바깥 요소를 기준으로 삼는다.
  function pickAnchor() {
    if (window.scrollY <= 0 || document.querySelector('.sheet, .cm-veil, .scrim')) { anchor = null; return; }
    var main = document.getElementById('app') || document.getElementById('community') || document.body;
    var mb = main.getBoundingClientRect();
    var x = Math.max(0, Math.min(innerWidth - 1, mb.left + mb.width / 2)), y = Math.min(innerHeight * 0.35, 160);
    var el = document.elementFromPoint(x, y);
    if (!el || !main.contains(el)) { anchor = null; return; }
    while (el.parentElement && el.parentElement !== main && el.parentElement.getBoundingClientRect().height <= innerHeight * 0.6) el = el.parentElement;
    anchor = { el: el, top: el.getBoundingClientRect().top };
  }
  function keepAnchor() {
    if (!anchor || !anchor.el.isConnected) return;
    var d = anchor.el.getBoundingClientRect().top - anchor.top;
    if (Math.abs(d) > 1) window.scrollBy(0, d);
  }
  function apply() {
    raf = 0;
    if (innerWidth !== wide) { wide = innerWidth; tall = 0; }
    tall = Math.max(tall, innerHeight);
    var k = vv ? Math.round(innerHeight - vv.height - vv.offsetTop) : 0;
    if (!(k > 80) || (vv && vv.scale > 1.05)) k = 0;
    var open = k > 0 || (editing() && innerHeight < tall * 0.72);
    // --vvt: 보이는 영역의 위 끝(iOS는 키보드가 열리면 보이는 영역이 아래로 밀릴 수 있다).
    if (open) { root.setAttribute('data-kb', ''); root.style.setProperty('--kb', k + 'px'); root.style.setProperty('--vvt', Math.max(0, Math.round(vv ? vv.offsetTop : 0)) + 'px'); }
    else { root.removeAttribute('data-kb'); root.style.removeProperty('--kb'); root.style.removeProperty('--vvt'); }
    root.style.setProperty('--vvh', Math.round(vv ? vv.height : innerHeight) + 'px');
    if (!open) { root.style.setProperty('--chrome-b', chrome() + 'px'); root.setAttribute('data-chrome', ''); }
  }
  function soon() { if (!raf) raf = requestAnimationFrame(apply); }
  addEventListener('resize', function () {
    // 배치가 그대로인 높이 변화(주소창·키보드)는 위치를 되돌리지 않는다. 배치가 바뀌면 아래 여백을 먼저 새 크기로
    // 맞춘 뒤 되돌린다(옛 여백이면 맨 끝 근처에서 되돌림이 짧아진 문서에 걸려 덜 간다).
    var key = layout();
    if (key !== lastLayout) {
      lastLayout = key;
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      apply();
      keepAnchor();
      holdUntil = now() + 500; heldY = window.scrollY;
    }
    soon();
  });
  addEventListener('scroll', function () {
    if (layout() !== lastLayout) return;
    // 되돌린 위치 그대로이거나, 내용이 짧아져 브라우저가 맨 끝으로 당긴 경우는 사람이 한 스크롤이 아니다.
    if (now() < holdUntil && (Math.abs(window.scrollY - heldY) <= 2 || window.scrollY >= document.documentElement.scrollHeight - innerHeight - 2)) return;
    pickAnchor();
  }, { passive: true });
  if (vv) { vv.addEventListener('resize', soon); vv.addEventListener('scroll', soon); }
  addEventListener('focusin', soon);
  addEventListener('focusout', function () { setTimeout(soon, 60); });
  // 화면이 바뀌면(시트가 열리는 등) 다음 그리기 전에 바로 잰다: 한 프레임 동안 마지막 줄이 막대에 가리지 않게.
  var mo = new MutationObserver(function () { if (raf) { cancelAnimationFrame(raf); raf = 0; } apply(); });
  function start() { mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'class'] }); apply(); }
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
  window.EOUL_VIEWPORT = { refresh: soon };
})();
