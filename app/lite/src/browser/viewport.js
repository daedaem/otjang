/* 다기기 대응(2026-11-01). 앱 화면(screen.html)과 독립 커뮤니티 /c가 함께 쓴다(/c는 CSP상 인라인 스크립트가 안 돼 파일로 둔다).
   화면을 다시 그리지 않으므로 작성 중인 글·선택·초점은 그대로이고, 아래 세 가지만 맞춘다.
   - 키보드: 보이는 영역(visualViewport)이 80px 넘게 줄면(확대 제외) data-kb·--kb(iOS). 안드로이드는 viewport의
     interactive-widget=resizes-content로 화면 자체가 줄어, 입력칸 초점 + 높이 72% 미만일 때 data-kb만 둔다. --vvh는 보이는 높이,
     --vvt는 보이는 영역의 위 끝(offsetTop).
   - 아래 막대: 화면 아래에 붙은 고정 막대가 차지한 높이를 --chrome-b·data-chrome으로 두어 본문 끝이 가리지 않게 한다.
   - 스크롤 위치: 창 크기가 바뀌면(회전·펼치기·분할) 바뀌기 전 화면 위쪽에 보이던 요소를 같은 높이로 되돌린다.
     연속으로 크기가 바뀌는 동안(0.5초)은 같은 기준 요소를 유지해 위치가 조금씩 밀리지 않게 한다. */
(function () {
  if (window.EOUL_VIEWPORT) return;
  var root = document.documentElement, vv = window.visualViewport, raf = 0, tall = 0, wide = 0;
  var BARS = '.tabs, .strip, .buybar, .chatbar, .pinbar, .shelfbar, .regbar, .wr-sheet, [data-fixed-bottom]';
  var anchor = null, holdUntil = 0, lastW = innerWidth, lastH = innerHeight;
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
    // 키보드만 열리고 닫히는 높이 변화(폭 같음, 입력 중)는 위치를 되돌리지 않는다.
    var widthChanged = innerWidth !== lastW, keyboardOnly = !widthChanged && editing();
    lastW = innerWidth; lastH = innerHeight;
    if (!keyboardOnly) { keepAnchor(); holdUntil = now() + 500; }
    soon();
  });
  addEventListener('scroll', function () { if (now() > holdUntil) pickAnchor(); }, { passive: true });
  if (vv) { vv.addEventListener('resize', soon); vv.addEventListener('scroll', soon); }
  addEventListener('focusin', soon);
  addEventListener('focusout', function () { setTimeout(soon, 60); });
  // 화면이 바뀌면(시트가 열리는 등) 다음 그리기 전에 바로 잰다: 한 프레임 동안 마지막 줄이 막대에 가리지 않게.
  var mo = new MutationObserver(function () { if (raf) { cancelAnimationFrame(raf); raf = 0; } apply(); });
  function start() { mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'class'] }); apply(); }
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
  window.EOUL_VIEWPORT = { refresh: soon };
})();
