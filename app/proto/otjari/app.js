// 옷자리 — 내 옷들이 이어져 별자리가 된다.
// 옷장은 밤하늘, 옷 한 벌은 별 하나, 코디 하나는 별자리 하나. 살까 말까 하는 옷은 새 별로 들어와
// 어떤 별자리를 새로 이어 주는지 하늘에 직접 그려 보인다.
(() => {
  const P = Proto;
  const root = document.getElementById('app');
  const esc = P.esc;
  const NS = 'http://www.w3.org/2000/svg';
  const CAND = '__cand';
  const GAP = 8; // 별 사이 최소 여백(px)
  const COMFORT = 10; // 이만큼 떨어지면 '편안하다'고 보고 기본 위상을 지킨다
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeIO = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const easeOut5 = (t) => 1 - Math.pow(1 - t, 5);
  const easeIn3 = (t) => t * t * t;
  const still = () => P.reducedMotion();
  const $ = (s, el = root) => el.querySelector(s);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const sv = (tag, attrs = {}) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
  const WORD = { buy: '띄운 별', hold: '보류', skip: '보낸 별' };
  const RING_OF = { outer: 'outer', top: 'mid', dress: 'mid', bottom: 'inner', shoes: 'arc', acc: 'cluster' };
  const PREF = { outer: 0.9, mid: 0.07, inner: 0.6 }; // 0 = 위, .25 = 오른쪽, .5 = 아래, .75 = 왼쪽

  // ── 아이콘 (인라인 SVG)
  const IC = {
    sky: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><ellipse cx="12" cy="12" rx="9.8" ry="4.4" transform="rotate(-24 12 12)"/><path d="M12 7.4l1.1 3.5 3.5 1.1-3.5 1.1L12 16.6l-1.1-3.5L7.4 12l3.5-1.1z" fill="currentColor" stroke="none"/></svg>',
    spark: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><path d="M10 5.2l1.5 4.8 4.8 1.5-4.8 1.5L10 17.8 8.5 13 3.7 11.5 8.5 10z"/><path d="M18.2 3.6v4.2M16.1 5.7h4.2"/></svg>',
    map: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.4" y="3.4" width="17.2" height="17.2" rx="4.6"/><path d="M7.4 16.2l3.4-5.6 3.2 3 2.8-5.4" opacity=".8"/><g fill="currentColor" stroke="none"><circle cx="7.4" cy="16.2" r="1.3"/><circle cx="10.8" cy="10.6" r="1.3"/><circle cx="14" cy="13.6" r="1.3"/><circle cx="16.8" cy="8.2" r="1.3"/></g></svg>',
    close: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/></svg>',
    back: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.5 5.5L8 12l6.5 6.5"/></svg>',
    out: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 16L16 8M10 8h6v6"/></svg>',
    up: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6.5 14.5L12 9l5.5 5.5"/></svg>',
    check: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5.5 12.5l4 4L18.5 7.5"/></svg>',
    search: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/></svg>',
    plus: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M12 5.5v13M5.5 12h13"/></svg>',
    star4: (c = '') => `<svg class="${c}" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 .6l1.25 4.15L11.4 6 7.25 7.25 6 11.4 4.75 7.25.6 6l4.15-1.25z"/></svg>`,
  };

  // ── 기록과 계산 (같은 옷장이면 다시 계산하지 않는다)
  const gs = () => P.record.garments;
  const isExample = (g) => (P.record.exampleIds || []).includes(g.id);
  let memo = { key: null };
  function m() {
    const key = `${gs().map((g) => g.id).join(',')}|${P.record.decisions.map((d) => d.productId + d.decision).join(',')}`;
    if (memo.key !== key) memo = { key, outfits: null, cands: null, judged: new Map() };
    return memo;
  }
  const outfits = () => { const c = m(); if (!c.outfits) c.outfits = P.outfits({ limit: 12 }).filter((o) => o.garmentIds.length > 1); return c.outfits; };
  const cands = () => { const c = m(); if (!c.cands) c.cands = P.candidates({ limit: 12 }); return c.cands; };
  const judgeOf = (p) => { const c = m(); if (!c.judged.has(p.id)) c.judged.set(p.id, P.judge(p)); return c.judged.get(p.id); };
  const verdictText = (j) => (j.verdict === 'yes' ? `새 별자리 ${j.looks.length}개가 생겨요` : j.verdict === 'overlap' ? '이미 비슷한 별이 있어요' : '아직 이어질 별이 없어요');
  const day = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : `${d.getMonth() + 1}월 ${d.getDate()}일`; };
  const catName = (x) => P.cats[P.category(x)] || '';
  const catsFor = () => Object.keys(P.cats).filter((c) => P.ownables(c, { limit: 1 }).length);

  // ── 화면 상태
  const fresh = () => ({ tab: 'sky', intro: P.record.started ? null : 'hello', pickCat: null, focus: null, card: null, cardAsk: false, judge: null, query: '', results: null, err: '', add: null, resetAsk: false });
  let ui = fresh();
  let busy = false;

  // ── 별 배치: 범주마다 궤도 하나. 바깥 아우터, 가운데 상의·원피스, 안쪽 하의, 아래 호 신발, 오른쪽 위 소품.
  function ellipseTable(rx, ry) {
    const N = 240; const pts = []; const cum = [0];
    for (let i = 0; i <= N; i += 1) {
      const t = -Math.PI / 2 + (i / N) * Math.PI * 2;
      pts.push([rx * Math.cos(t), ry * Math.sin(t)]);
      if (i) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    }
    const L = cum[N];
    const at = (len) => {
      const l = ((len % L) + L) % L; let lo = 0; let hi = N;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] <= l) lo = mid; else hi = mid; }
      const f = (l - cum[lo]) / (cum[hi] - cum[lo] || 1);
      return [pts[lo][0] + (pts[hi][0] - pts[lo][0]) * f, pts[lo][1] + (pts[hi][1] - pts[lo][1]) * f];
    };
    return { L, at };
  }
  const baseSize = (W, H) => Math.round(clamp(Math.min(W * 0.14, H * 0.092), 40, 58));
  function geom(W, H, s) {
    const pad = 10;
    const horizon = clamp(H * 0.2, s + 36, 150);
    const zoneH = H - horizon;
    const rx = W / 2 - pad - s / 2;
    const ry = Math.max(56, (zoneH - s - pad * 2) / 2);
    return {
      W, H, s, cx: W / 2, cy: pad + s / 2 + ry,
      rings: { outer: { rx, ry }, mid: { rx: rx * 0.635, ry: ry * 0.63 }, inner: { rx: rx * 0.29, ry: ry * 0.29 } },
      arc: { half: W / 2 - pad - s / 2, y: H - pad - s / 2, lift: clamp(horizon * 0.42, 14, 50) },
    };
  }
  const arcPt = (g, u) => [g.cx + u * g.arc.half, g.arc.y - g.arc.lift * u * u];
  const CLUSTER = [[0, 0], [-1, 0.24], [-0.45, 1.02], [-1.5, 1.22], [0, 2.02], [-1, 2.24]];

  function tryLayout(W, H, groups, s) {
    const g = geom(W, H, s);
    const size = (it) => (it.big ? Math.round(s * 1.2) : it.cat === 'acc' ? Math.round(s * 0.82) : s);
    const fixed = [];
    const na = groups.arc.length;
    const spread = na <= 1 ? 0 : Math.min(0.86, 0.3 * (na - 1));
    groups.arc.forEach((it, k) => { const u = na <= 1 ? 0 : -spread + (2 * spread * k) / (na - 1); const [x, y] = arcPt(g, u); fixed.push({ id: it.id, x, y, s: size(it) }); });
    if (groups.cluster.length) {
      const sz = Math.max(...groups.cluster.map(size)); const d = sz + 10;
      const ax = W - 12 - sz / 2; const ay = 12 + sz / 2;
      groups.cluster.forEach((it, k) => { const [ox, oy] = CLUSTER[k % CLUSTER.length]; const shift = Math.floor(k / CLUSTER.length) * 2.2; fixed.push({ id: it.id, x: ax + (ox - shift) * d, y: ay + oy * d, s: size(it) }); });
    }
    const tabs = {};
    for (const r of ['outer', 'mid', 'inner']) tabs[r] = ellipseTable(g.rings[r].rx, g.rings[r].ry);
    const options = (r) => {
      const list = groups[r]; if (!list.length) return [[]];
      const T = tabs[r]; const step = T.L / list.length; const out = [];
      for (let j = 0; j < 40; j += 1) {
        const phase = PREF[r] * T.L + (j / 40) * step;
        out.push(list.map((it, k) => { const [dx, dy] = T.at(phase + k * step); return { id: it.id, x: g.cx + dx, y: g.cy + dy, s: size(it) }; }));
      }
      return out;
    };
    const clear = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) - (a.s + b.s) / 2 - GAP;
    const minAgainst = (pts, others) => { let v = Infinity; for (const a of pts) for (const b of others) v = Math.min(v, clear(a, b)); return v; };
    const minSelf = (pts) => { let v = Infinity; for (let i = 0; i < pts.length; i += 1) for (let k = i + 1; k < pts.length; k += 1) v = Math.min(v, clear(pts[i], pts[k])); return v; };
    // 충분히 떨어진 후보는 기본 위상에 가까운 순서로, 아니면 가장 넓게 떨어진 순서로
    const rank = (opts, others) => opts.map((pts, j) => ({ pts, j, sc: Math.min(minAgainst(pts, others), minSelf(pts)) }))
      .sort((a, b) => { const ca = a.sc >= COMFORT; const cb = b.sc >= COMFORT; if (ca !== cb) return ca ? -1 : 1; return ca ? a.j - b.j : b.sc - a.sc; });
    const baseSc = minSelf(fixed);
    let best = null;
    for (const o of rank(options('outer'), fixed).slice(0, 8)) {
      const b1 = fixed.concat(o.pts);
      for (const mm of rank(options('mid'), b1).slice(0, 4)) {
        const b2 = b1.concat(mm.pts);
        const ii = rank(options('inner'), b2)[0];
        const sc = Math.min(baseSc, o.sc, mm.sc, ii.sc);
        const cand = { sc, all: b2.concat(ii.pts) };
        if (!best || (sc >= COMFORT && best.sc < COMFORT) || (best.sc < COMFORT && sc > best.sc)) best = cand;
        if (best.sc >= COMFORT) break;
      }
      if (best && best.sc >= COMFORT) break;
    }
    const pos = {}; for (const p of best.all) pos[p.id] = p;
    return { s, geo: g, tabs, pos, score: best.sc };
  }

  function layout(W, H, items) {
    const groups = { outer: [], mid: [], inner: [], arc: [], cluster: [] };
    for (const it of items) groups[RING_OF[it.cat] || 'cluster'].push(it);
    let best = null;
    for (let s = baseSize(W, H); s >= 34; s -= 3) {
      const res = tryLayout(W, H, groups, s);
      if (!best || res.score > best.score) best = res;
      if (res.score >= 0) { best = res; break; }
    }
    best.labels = placeLabels(best, groups);
    return best;
  }

  const textW = (t) => [...t].reduce((w, ch) => w + (/[가-힣]/.test(ch) ? 12.4 : ch === ' ' ? 4 : 7.4), 6);
  function placeLabels(L, groups) {
    const g = L.geo; const stars = Object.values(L.pos); const out = [];
    const hits = (b) => b.x < 4 || b.x + b.w > g.W - 4 || b.y < 2 || b.y + b.h > g.H - 2
      || stars.some((p) => { const nx = clamp(p.x, b.x, b.x + b.w); const ny = clamp(p.y, b.y, b.y + b.h); return Math.hypot(p.x - nx, p.y - ny) < p.s / 2 + 5; })
      || out.some((o) => !(b.x + b.w < o.x || o.x + o.w < b.x || b.y + b.h < o.y || o.y + o.h < b.y));
    const box = (x, y, t) => { const w = textW(t); return { x: x - w / 2, y: y - 8, w, h: 16, t }; };
    const names = { outer: '아우터', mid: P.record.gender === 'F' ? '상의 · 원피스' : '상의', inner: '하의' };
    for (const r of ['outer', 'mid', 'inner']) {
      const T = L.tabs[r];
      search: for (let k = 0; k <= 40; k += 1) {
        for (const sgn of k ? [-1, 1] : [1]) {
          const [dx, dy] = T.at(0.75 * T.L + (sgn * k * T.L) / 120);
          const b = box(g.cx + dx, g.cy + dy, names[r]);
          if (!hits(b)) { out.push(b); break search; }
        }
      }
    }
    for (let u = -1; u <= 1.001; u += 0.05) {
      const [x, y] = arcPt(g, u); const b = box(x + 8, y, '신발');
      if (!hits(b)) { out.push(b); break; }
    }
    if (groups.cluster.length) {
      const cl = groups.cluster.map((it) => L.pos[it.id]).filter(Boolean);
      const lowest = cl.reduce((a, b) => (b.y > a.y ? b : a), cl[0]);
      const leftmost = cl.reduce((a, b) => (b.x < a.x ? b : a), cl[0]);
      const tries = [[lowest.x, lowest.y + lowest.s / 2 + 12], [leftmost.x - leftmost.s / 2 - 26, leftmost.y], [lowest.x - lowest.s / 2 - 24, lowest.y + lowest.s / 2]];
      for (const [x, y] of tries) { const b = box(x, y, '소품'); if (!hits(b)) { out.push(b); break; } }
    }
    return out;
  }

  // 별자리 선: 같은 별들을 가장 짧게 잇는 순서 (결정적)
  function permute(arr, fn, pre = []) {
    if (!arr.length) { fn(pre); return; }
    for (let i = 0; i < arr.length; i += 1) permute([...arr.slice(0, i), ...arr.slice(i + 1)], fn, [...pre, arr[i]]);
  }
  const plen = (pts) => pts.reduce((s, p, i) => (i ? s + Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y) : 0), 0);
  function shortest(ids, pos, start = null) {
    if (ids.length > 6) return start ? [start, ...ids] : ids;
    if (!start && ids.length <= 2) return ids;
    let best = null; let bestL = Infinity;
    permute(ids, (perm) => { const seq = start ? [start, ...perm] : perm; const l = plen(seq.map(pos)); if (l < bestL - 0.01) { bestL = l; best = seq; } });
    return best;
  }
  const pathD = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join('');

  // ── 배경 별밭: 한 번 만든 좌표를 크기에 맞춰 늘린다
  function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const FIELD = (() => { const r = mulberry(20261015); return Array.from({ length: 140 }, (_, i) => ({ x: r(), y: r(), r: 0.32 + r() ** 2.4 * 1.1, o: 0.12 + r() * 0.46, tw: i % 9 === 0, d: 2.6 + r() * 4, dl: -r() * 6, spark: i % 47 === 11 })); })();
  const sparkD = (x, y, r) => `M${x.toFixed(1)} ${(y - r).toFixed(1)}L${(x + r * 0.2).toFixed(1)} ${(y - r * 0.2).toFixed(1)}L${(x + r).toFixed(1)} ${y.toFixed(1)}L${(x + r * 0.2).toFixed(1)} ${(y + r * 0.2).toFixed(1)}L${x.toFixed(1)} ${(y + r).toFixed(1)}L${(x - r * 0.2).toFixed(1)} ${(y + r * 0.2).toFixed(1)}L${(x - r).toFixed(1)} ${y.toFixed(1)}L${(x - r * 0.2).toFixed(1)} ${(y - r * 0.2).toFixed(1)}Z`;
  const fieldSVG = (W, H) => FIELD.map((s) => {
    const style = `style="--d:${s.d.toFixed(1)}s;--dl:${s.dl.toFixed(1)}s;--o:${(s.spark ? s.o + 0.25 : s.o).toFixed(2)}"`;
    return s.spark ? `<path class="${s.tw ? 'tw' : ''}" d="${sparkD(s.x * W, s.y * H, 3.4)}" opacity="${(s.o + 0.25).toFixed(2)}" ${style}/>`
      : `<circle class="${s.tw ? 'tw' : ''}" cx="${(s.x * W).toFixed(1)}" cy="${(s.y * H).toFixed(1)}" r="${s.r.toFixed(2)}" opacity="${s.o.toFixed(2)}" ${style}/>`;
  }).join('');

  // ── 하늘: 별(사진)은 DOM 단추, 선·궤도·별밭은 SVG. 별 위치는 한 번의 rAF 트윈으로 함께 움직인다.
  const sky = (() => {
    const el = document.createElement('div');
    el.className = 'sky';
    el.innerHTML = `<svg class="sky-svg" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="ojTrail" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#F5D58A" stop-opacity="0"/><stop offset=".72" stop-color="#F5D58A" stop-opacity=".5"/><stop offset="1" stop-color="#FFF6DD" stop-opacity="1"/></linearGradient>
        <filter id="ojBlur" filterUnits="userSpaceOnUse" x="-100" y="-100" width="3000" height="3000"><feGaussianBlur stdDeviation="2.6"/></filter>
      </defs>
      <g class="g-field"></g>
      <g class="g-orbit"><ellipse class="orb"/><ellipse class="orb"/><ellipse class="orb"/><path class="orb"/></g>
      <g class="g-lines"></g><g class="g-new"></g><g class="g-trail"></g><g class="g-labels"></g>
    </svg><div class="g-stars"></div>`;
    const svg = el.querySelector('svg');
    const G = { field: $('.g-field', el), lines: $('.g-lines', el), nw: $('.g-new', el), trail: $('.g-trail', el), labels: $('.g-labels', el), stars: $('.g-stars', el) };
    const orbs = [...el.querySelectorAll('.orb')];
    const nodes = new Map();
    let W = 0; let H = 0; let key = ''; let fieldKey = ''; let raf = 0;
    let geoCur = null; let geoFrom = null; let geoTo = null;
    let defs = []; let known = null; let timers = []; let lit = new Set(); let revealNext = false; let pendingEntry = null;

    function makeNode(it) {
      const b = document.createElement('button');
      b.type = 'button';
      const isC = it.id === CAND;
      b.className = `star${isC ? ' cand' : ''}`;
      const src = isC ? P.photo(it.p) : P.photo(it.g);
      const color = isC ? it.p.color : it.g.color;
      b.innerHTML = `<span class="st-in"><img src="${esc(src)}" alt="" draggable="false"><span class="pip" style="--c:${P.colorHex(color)}"></span></span>`;
      if (isC) { b.dataset.act = 'cand-sheet'; b.setAttribute('aria-label', `새 별 ${it.p.name}, 자세히 보기`); }
      else { b.dataset.act = 'star'; b.dataset.id = it.id; b.setAttribute('aria-label', `${P.label(it.g)}, ${P.colorName(it.g.color)} ${catName(it.g)}`); }
      G.stars.append(b);
      return { id: it.id, el: b, cur: null, from: null, to: null, flying: false };
    }
    function place(n) {
      const { x, y, s } = n.cur; const st = n.el.style;
      st.width = `${s.toFixed(1)}px`; st.height = st.width;
      st.transform = `translate3d(${(x - s / 2).toFixed(1)}px,${(y - s / 2).toFixed(1)}px,0)`;
      n.el.classList.toggle('small', s < 44);
    }
    const mix = (a, b, e) => ({ x: lerp(a.x, b.x, e), y: lerp(a.y, b.y, e), s: lerp(a.s, b.s, e) });
    function mixGeo(a, b, e) {
      const r = (k) => ({ rx: lerp(a.rings[k].rx, b.rings[k].rx, e), ry: lerp(a.rings[k].ry, b.rings[k].ry, e) });
      return { cx: lerp(a.cx, b.cx, e), cy: lerp(a.cy, b.cy, e), rings: { outer: r('outer'), mid: r('mid'), inner: r('inner') },
        arc: { half: lerp(a.arc.half, b.arc.half, e), y: lerp(a.arc.y, b.arc.y, e), lift: lerp(a.arc.lift, b.arc.lift, e) } };
    }
    function drawOrbits(g) {
      ['outer', 'mid', 'inner'].forEach((k, i) => { const o = orbs[i]; o.setAttribute('cx', g.cx.toFixed(1)); o.setAttribute('cy', g.cy.toFixed(1)); o.setAttribute('rx', g.rings[k].rx.toFixed(1)); o.setAttribute('ry', g.rings[k].ry.toFixed(1)); });
      const [x0, y0] = arcPt(g, -1); const [x1, y1] = arcPt(g, 1);
      orbs[3].setAttribute('d', `M${x0.toFixed(1)} ${y0.toFixed(1)}Q${g.cx.toFixed(1)} ${(g.arc.y + g.arc.lift).toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`);
    }
    function drawLines() {
      for (const d of defs) {
        const pts = d.ids.map((id) => nodes.get(id)?.cur).filter(Boolean);
        const dd = pathD(pts); d.glow.setAttribute('d', dd); d.line.setAttribute('d', dd);
      }
    }
    function drawIn(paths, delay, dur) {
      for (const p of paths) {
        const L = p.getTotalLength();
        if (!L) continue;
        p.style.strokeDasharray = `${L} ${L}`;
        p.style.strokeDashoffset = `${L}`;
        const a = p.animate([{ strokeDashoffset: L }, { strokeDashoffset: 0 }], { duration: dur, delay, easing: 'cubic-bezier(.33,.08,.3,1)', fill: 'forwards' });
        a.onfinish = () => { p.style.strokeDasharray = ''; p.style.strokeDashoffset = ''; a.cancel(); };
      }
    }
    function run(dur, done) {
      cancelAnimationFrame(raf);
      const t0 = performance.now();
      const frame = (now) => {
        const k = dur ? clamp((now - t0) / dur, 0, 1) : 1;
        const e = easeIO(k);
        for (const n of nodes.values()) if (!n.flying) { n.cur = mix(n.from, n.to, e); place(n); }
        geoCur = mixGeo(geoFrom, geoTo, e); drawOrbits(geoCur);
        drawLines();
        if (k < 1) raf = requestAnimationFrame(frame); else { raf = 0; if (done) done(); }
      };
      if (!dur) frame(t0); else raf = requestAnimationFrame(frame);
    }

    function sync({ instant = false } = {}) {
      W = el.clientWidth; H = el.clientHeight;
      if (!W || !H) return;
      const J = ui.judge;
      const Heff = Math.max(240, H - (J ? J.sheetH || 0 : 0));
      const items = gs().map((g) => ({ id: g.id, cat: P.category(g), g }));
      const cp = J ? P.product(J.pid) : null;
      if (cp) items.push({ id: CAND, cat: P.category(cp), big: true, p: cp });
      if (fieldKey !== `${W}x${H}`) { fieldKey = `${W}x${H}`; svg.setAttribute('viewBox', `0 0 ${W} ${H}`); G.field.innerHTML = fieldSVG(W, H); }
      const os = outfits();
      const k = `${W}x${H}:${Heff}|${items.map((i) => i.id).join(',')}|${os.map((o) => o.id + o.garmentIds.join('.')).join(',')}`;
      if (k === key) { applyState(); return; }
      const first = !key; key = k;
      const reveal = revealNext && !still(); revealNext = false;
      const L = layout(W, Heff, items);
      let bi = 0;
      const seen = new Set();
      for (const it of items) {
        seen.add(it.id);
        const to = L.pos[it.id];
        let n = nodes.get(it.id);
        if (!n) {
          n = makeNode(it); nodes.set(it.id, n);
          if (it.id === CAND) { n.cur = { x: W + 40, y: -40, s: to.s * 0.4 }; n.flying = true; n.el.style.opacity = '0'; pendingEntry = n; }
          else {
            n.cur = { ...to };
            if (reveal || (!first && !still())) { n.el.classList.add('born'); n.el.style.setProperty('--dl', `${reveal ? 60 + bi * 55 : 120}ms`); bi += 1; }
          }
        }
        n.from = { ...n.cur }; n.to = { ...to };
        if (n.flying && it.id !== CAND) n.flying = false;
      }
      for (const [id, n] of [...nodes]) {
        if (seen.has(id)) continue;
        nodes.delete(id);
        n.el.classList.add('gone'); n.el.disabled = true;
        setTimeout(() => n.el.remove(), still() ? 0 : 480);
      }
      // 별자리 선
      const prev = known; known = new Set(os.map((o) => o.id + o.garmentIds.join('.')));
      G.lines.innerHTML = ''; defs = [];
      for (const o of os) {
        const ids = o.garmentIds.filter((id) => nodes.has(id));
        if (ids.length < 2) continue;
        const order = shortest(ids, (id) => L.pos[id]);
        const g = sv('g', { class: 'cst' }); const glow = sv('path', { class: 'ln-glow' }); const line = sv('path', { class: 'ln' });
        g.append(glow, line); G.lines.append(g);
        defs.push({ o, ids: order, g, glow, line, draw: !still() && (reveal || (prev && !prev.has(o.id + o.garmentIds.join('.')))) });
      }
      geoFrom = geoCur || L.geo; geoTo = L.geo;
      G.labels.classList.add('hide');
      G.labels.innerHTML = L.labels.map((b) => `<text x="${(b.x + b.w / 2).toFixed(1)}" y="${(b.y + b.h / 2 + 3.6).toFixed(1)}" text-anchor="middle">${esc(b.t)}</text>`).join('');
      applyState();
      const dur = instant || still() || first ? 0 : 680;
      if (pendingEntry) { const n = pendingEntry; pendingEntry = null; enter(n); }
      run(dur, () => {
        G.labels.classList.remove('hide');
        defs.filter((d) => d.draw).forEach((d, i) => drawIn([d.glow, d.line], (reveal ? 700 : 80) + i * 220, 900));
        if (J && J.arrived && nodes.has(CAND) && !nodes.get(CAND).flying) drawNew(false);
      });
    }

    function enter(n) {
      const to = n.to;
      if (still()) { n.flying = false; n.cur = { ...to }; n.el.style.opacity = ''; place(n); arrive(); return; }
      const p0 = { x: W + 30, y: -30 };
      const mx = (p0.x + to.x) / 2; const my = (p0.y + to.y) / 2; const dx = to.x - p0.x; const dy = to.y - p0.y; const len = Math.hypot(dx, dy) || 1;
      const c = { x: mx + (-dy / len) * len * 0.16, y: my + (dx / len) * len * 0.16 };
      flight(n, p0, c, to, { dur: 1250, delay: 260, grow: true }).then(() => { n.flying = false; n.cur = { ...n.to }; place(n); arrive(); });
    }
    function flight(n, p0, c, p2, { dur, delay = 0, grow = false }) {
      return new Promise((resolve) => {
        const trail = sv('g', { class: 'trail' });
        const tg = sv('path', { class: 'tr-glow' }); const tl = sv('path', { class: 'tr-line' });
        trail.append(tg, tl); G.trail.append(trail);
        const grad = svg.querySelector('#ojTrail');
        const q = (t) => ({ x: (1 - t) * (1 - t) * p0.x + 2 * (1 - t) * t * c.x + t * t * p2.x, y: (1 - t) * (1 - t) * p0.y + 2 * (1 - t) * t * c.y + t * t * p2.y });
        const ease = grow ? easeOut5 : easeIn3;
        const s0 = (n.to || n.cur).s;
        const t0 = performance.now() + delay;
        const step = (now) => {
          if (now < t0) { requestAnimationFrame(step); return; }
          const k = clamp((now - t0) / dur, 0, 1);
          const e = ease(k); const te = ease(Math.max(0, k - (grow ? 0.2 : 0.16)));
          const head = q(e);
          let d = '';
          for (let i = 0; i <= 20; i += 1) { const p = q(te + ((e - te) * i) / 20); d += `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`; }
          tg.setAttribute('d', d); tl.setAttribute('d', d);
          const tail = q(te);
          grad.setAttribute('x1', tail.x.toFixed(1)); grad.setAttribute('y1', tail.y.toFixed(1)); grad.setAttribute('x2', head.x.toFixed(1)); grad.setAttribute('y2', head.y.toFixed(1));
          n.el.style.opacity = grow ? String(Math.min(1, k * 4)) : String(1 - k * 0.7);
          n.cur = { x: head.x, y: head.y, s: grow ? s0 * (0.4 + 0.6 * e) : s0 * (1 - 0.65 * e) };
          place(n);
          if (k < 1) { requestAnimationFrame(step); return; }
          trail.classList.add('fade'); setTimeout(() => trail.remove(), 800);
          resolve();
        };
        requestAnimationFrame(step);
      });
    }

    function arrive() {
      const J = ui.judge; if (!J) return;
      J.arrived = true;
      const j = judgeOf(P.product(J.pid));
      const n = nodes.get(CAND);
      if (n) { n.el.style.opacity = ''; n.el.classList.add('landed'); }
      setDisplay(verdictText(j), true);
      document.querySelector('.jsheet')?.classList.add('revealed');
      drawNew(!still());
      applyState();
      P.buzz(j.verdict === 'yes' ? 16 : 8);
    }

    function clearTimers() { timers.forEach(clearTimeout); timers = []; }
    function drawNew(animated) {
      clearTimers(); G.nw.innerHTML = '';
      const J = ui.judge; const cn = nodes.get(CAND);
      if (!J || !cn) return;
      const j = judgeOf(P.product(J.pid));
      const pos = (id) => (id === CAND ? cn.to : nodes.get(id)?.to);
      const soft = j.verdict !== 'yes';
      lit = new Set();
      j.looks.forEach((look, k) => {
        const ids = [...new Set(look.items.filter((it) => it.garment).map((it) => it.garment.id))].filter((id) => nodes.has(id));
        if (!ids.length) return;
        const order = shortest(ids, pos, CAND);
        const pts = order.map(pos);
        const d = pathD(pts);
        const g = sv('g', { class: `nl${soft ? ' soft' : ''}` });
        const glow = sv('path', { class: 'nl-glow', d }); const line = sv('path', { class: 'nl-line', d });
        g.append(glow, line); G.nw.append(g);
        if (!animated) { ids.forEach((id) => lit.add(id)); return; }
        const len = line.getTotalLength() || 1;
        const delay = 140 + k * 340; const dur = 560 + len * 1.1;
        drawIn([glow, line], delay, dur);
        let acc = 0;
        for (let i = 1; i < pts.length; i += 1) {
          acc += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
          const id = order[i];
          timers.push(setTimeout(() => { lit.add(id); const nn = nodes.get(id); if (nn) { nn.el.classList.remove('pop'); void nn.el.offsetWidth; nn.el.classList.add('pop'); } applyState(); }, delay + dur * (acc / len) * 0.92));
        }
      });
      j.overlaps.forEach((og, k) => {
        const t = nodes.get(og.id); if (!t) return;
        const ln = sv('path', { class: 'ov-line', d: pathD([cn.to, t.to]) });
        G.nw.append(ln);
        if (animated) ln.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 700, delay: 160 + k * 160, fill: 'backwards' });
      });
    }

    function applyState() {
      const J = ui.judge;
      const j = J ? judgeOf(P.product(J.pid)) : null;
      const ov = new Set(j && J.arrived ? j.overlaps.map((g) => g.id) : []);
      const used = new Set(j ? j.used.map((g) => g.id) : []);
      const fo = !J && ui.focus ? outfits().find((o) => o.id === ui.focus) : null;
      const fset = new Set(fo ? fo.garmentIds : []);
      for (const n of nodes.values()) {
        if (n.id === CAND) continue;
        let dim = false; let hush = false; let on = false;
        if (J) {
          if (!J.arrived) hush = true;
          else if (lit.has(n.id) || ov.has(n.id)) on = true;
          else if (used.has(n.id)) hush = true;
          else dim = true;
        } else if (fo) { on = fset.has(n.id); dim = !on; }
        const c = n.el.classList;
        c.toggle('dim', dim); c.toggle('hush', hush); c.toggle('lit', on); c.toggle('ov', ov.has(n.id)); c.toggle('sel', !J && ui.card === n.id);
        n.el.tabIndex = J ? -1 : 0;
      }
      for (const d of defs) { d.g.classList.toggle('on', !!fo && d.o.id === fo.id); d.g.classList.toggle('off', !!J || (!!fo && d.o.id !== fo.id)); }
      G.labels.classList.toggle('quiet', !!J);
      el.classList.toggle('judging', !!J);
    }

    function dropCand() {
      clearTimers(); lit = new Set();
      const n = nodes.get(CAND);
      if (n) { nodes.delete(CAND); n.el.remove(); }
      G.nw.innerHTML = ''; G.trail.innerHTML = '';
      key = '';
    }
    // 띄우기: 금빛 새 별이 보통 별이 되어 그 자리에 남는다
    async function settle(newId) {
      clearTimers();
      const n = nodes.get(CAND);
      if (!n || !newId || nodes.has(newId)) { dropCand(); return; }
      n.el.classList.remove('cand', 'landed'); n.el.classList.add('settling');
      G.nw.classList.add('fade');
      await sleep(still() ? 0 : 520);
      G.nw.innerHTML = ''; G.nw.classList.remove('fade');
      nodes.delete(CAND);
      n.id = newId; n.el.dataset.act = 'star'; n.el.dataset.id = newId;
      const g = gs().find((x) => x.id === newId);
      if (g) n.el.setAttribute('aria-label', `${P.label(g)}, ${P.colorName(g.color)} ${catName(g)}`);
      nodes.set(newId, n);
      lit = new Set(); key = '';
    }
    // 보류는 희미해지고, 보내 주기는 별똥별처럼 하늘 밖으로 떨어진다
    async function dismiss(mode) {
      clearTimers();
      const n = nodes.get(CAND);
      G.nw.classList.add('fade');
      if (n && !still()) {
        if (mode === 'fall') {
          n.flying = true;
          const p0 = { ...n.cur }; const p2 = { x: -70, y: H + 70 };
          await flight(n, p0, { x: p0.x - 30, y: p0.y + (p2.y - p0.y) * 0.25 }, p2, { dur: 720 });
        } else {
          n.el.classList.add('fading');
          await sleep(460);
        }
      }
      G.nw.classList.remove('fade');
      dropCand();
    }
    const ro = new ResizeObserver(() => { if (el.isConnected && !busy) sync({ instant: true }); });
    ro.observe(el);
    return {
      el, sync, applyState, settle, dismiss, dropCand,
      reveal() { revealNext = true; },
      reset() { for (const n of nodes.values()) n.el.remove(); nodes.clear(); key = ''; geoCur = null; defs = []; known = null; G.lines.innerHTML = ''; G.nw.innerHTML = ''; G.trail.innerHTML = ''; },
      pos: (id) => nodes.get(id)?.to || null,
      height: () => H,
    };
  })();

  // ── 공통 틀
  function shell() {
    if ($('#oj')) return;
    root.innerHTML = `<div class="oj" id="oj">
      <div class="view" id="view"></div>
      <div class="sheet-host" id="sheetHost"></div>
      <nav class="tabs" id="tabs" aria-label="화면"></nav>
      <div class="layer" id="layer"></div>
      <div class="toast" id="toast" role="status" aria-live="polite"></div>
    </div>`;
  }
  let toastT = 0;
  function toast(msg) {
    const t = $('#toast'); if (!t) return;
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2800);
  }
  function setDisplay(text, anim) {
    const d = $('#display'); if (!d || d.textContent === text) return;
    if (!anim || still()) { d.textContent = text; return; }
    d.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-6px)' }], { duration: 170, easing: 'ease-in' }).onfinish = () => {
      d.textContent = text;
      d.animate([{ opacity: 0, transform: 'translateY(8px)', filter: 'blur(3px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }], { duration: 520, easing: 'cubic-bezier(.2,.7,.2,1)' });
    };
  }
  const glyph = (n) => {
    const k = clamp(n, 2, 6); const pts = Array.from({ length: k }, (_, i) => [2.5 + (i * 19) / (k - 1), i % 2 ? 3.5 : 10.5]);
    return `<svg class="glyph" viewBox="0 0 24 14" aria-hidden="true"><polyline points="${pts.map((p) => p.join(',')).join(' ')}"/>${pts.map((p) => `<circle cx="${p[0]}" cy="${p[1]}" r="1.7"/>`).join('')}</svg>`;
  };
  const ph = (x, cls = '') => `<span class="ph ${cls}"><img src="${esc(P.photo(x))}" alt="" loading="lazy" draggable="false"></span>`;

  // ── 첫 실행
  const SHIRT = [[92, 30], [110, 47], [128, 30], [151, 37], [192, 73], [170, 95], [153, 86], [154, 170], [66, 170], [67, 86], [50, 95], [28, 73], [69, 37]];
  function helloHTML() {
    const big = new Set([1, 3, 4, 7, 8, 11, 12]);
    const d = `M${SHIRT.map((p) => p.join(' ')).join('L')}Z`;
    return `<section class="hello">
      <svg class="hello-field" viewBox="0 0 390 844" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${fieldSVG(390, 844)}</svg>
      <svg class="hello-shirt" viewBox="0 0 220 200" aria-hidden="true"><path class="hs-line" d="${d}" pathLength="1"/>${SHIRT.map((p, i) => (big.has(i) ? `<path class="hs-star" style="--i:${i}" d="${sparkD(p[0], p[1], 5.2)}"/>` : `<circle class="hs-dot" style="--i:${i}" cx="${p[0]}" cy="${p[1]}" r="1.9"/>`)).join('')}</svg>
      <div class="hello-copy">
        <h1 class="wordmark">옷자리</h1>
        <p class="lede">내 옷들이 이어져<br>별자리가 돼요.</p>
      </div>
      <div class="hello-ask">
        <p class="ask-q">어느 옷장의 하늘을 열까요?</p>
        <div class="ask-row">
          <button class="g-btn" data-act="gender" data-g="M"><span>남성</span>${IC.star4('g-ic')}</button>
          <button class="g-btn" data-act="gender" data-g="F"><span>여성</span>${IC.star4('g-ic')}</button>
        </div>
        <p class="ask-fine">기록은 이 기기에만 남아요.</p>
      </div>
    </section>`;
  }
  function miniHTML() {
    const list = gs().slice(-9);
    const W = 350; const H = 104; const n = list.length;
    const step = n > 1 ? Math.min(44, (W - 60) / (n - 1)) : 0;
    const x0 = W / 2 - (step * (n - 1)) / 2;
    const pts = list.map((g, i) => ({ g, x: x0 + i * step, y: 54 + Math.sin(i * 1.3 + 0.5) * 20 }));
    const more = gs().length - list.length;
    return `<svg class="mini-svg" viewBox="0 0 ${W} ${H}" aria-hidden="true">
      <defs><clipPath id="ojMiniClip" clipPathUnits="userSpaceOnUse"><circle r="16"/></clipPath></defs>
      ${n > 1 ? `<polyline class="mini-ln" points="${pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}"/>` : ''}
      ${pts.map((p, i) => `<g class="mini-st" data-k="${i}" transform="translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})"><circle class="mini-halo" r="17.5"/><image href="${esc(P.photo(p.g))}" x="-16" y="-16" width="32" height="32" clip-path="url(#ojMiniClip)" preserveAspectRatio="xMidYMid slice"/></g>`).join('')}
    </svg>
    ${n ? `<p class="mini-count">별 ${gs().length}${more > 0 ? ` · 앞의 ${more}개는 하늘에서` : ''}</p>` : '<p class="mini-empty">누른 옷이 여기 별로 떠요</p>'}`;
  }
  function catsHTML(scope, cur) {
    return `<div class="cats" role="tablist" aria-label="옷 종류">${catsFor().map((c) => `<button class="cat${c === cur ? ' on' : ''}" role="tab" aria-selected="${c === cur}" data-act="cat" data-scope="${scope}" data-cat="${c}">${esc(P.cats[c])}</button>`).join('')}</div>`;
  }
  function gridHTML(cat) {
    return P.ownables(cat, { limit: 24 }).map((p) => {
      const on = P.owns(p);
      return `<button class="own${on ? ' on' : ''}" data-act="own" data-pid="${esc(p.id)}" aria-pressed="${on}" aria-label="${esc(`${P.shortKind(p)} ${P.colorName(p.color)}`)}">
        <span class="own-ph"><img src="${esc(P.photo(p))}" alt="" loading="lazy" draggable="false"><span class="own-ck">${IC.check}</span></span>
        <span class="own-k">${esc(P.shortKind(p))}</span>
        <span class="own-c"><i class="dot" style="--c:${P.colorHex(p.color)}"></i>${esc(P.colorName(p.color))}</span>
      </button>`;
    }).join('');
  }
  const pickFoot = () => {
    const n = gs().length;
    return n ? `<button class="cta" data-act="intro-done">별 ${n}개로 하늘 열기</button><button class="btn-text" data-act="example">대신 예시 하늘로 시작</button>`
      : '<button class="cta" data-act="example">예시 하늘로 시작</button><p class="foot-hint">가진 옷을 고르거나, 예시 옷장으로 바로 둘러보세요.</p>';
  };
  function pickHTML() {
    if (!ui.pickCat) ui.pickCat = catsFor().includes('top') ? 'top' : catsFor()[0];
    return `<section class="pick">
      <header class="pick-head">
        <button class="icon-btn" data-act="intro-back" aria-label="처음 화면으로">${IC.back}</button>
        <h1 class="pick-ttl">가진 옷을 하늘에 올려 주세요</h1>
        <p class="pick-sub">닮은 옷을 누르면 별이 돼요. 사진은 비슷한 상품이에요.</p>
      </header>
      <div class="mini" id="mini">${miniHTML()}</div>
      ${catsHTML('pick', ui.pickCat)}
      <div class="own-grid" id="ownGrid">${gridHTML(ui.pickCat)}</div>
      <footer class="pick-foot" id="pickFoot">${pickFoot()}</footer>
    </section>`;
  }
  function flyToMini(fromEl) {
    if (still() || !fromEl) return;
    const stars = root.querySelectorAll('#mini .mini-st');
    const target = stars[stars.length - 1]; if (!target) return;
    const a = fromEl.getBoundingClientRect(); const b = target.getBoundingClientRect();
    const x0 = a.left + a.width / 2; const y0 = a.top + a.height / 2; const x1 = b.left + b.width / 2; const y1 = b.top + b.height / 2;
    const cx = x0 + (x1 - x0) * 0.15; const cy = Math.min(y0, y1) - 70;
    const dot = document.createElement('span'); dot.className = 'flydot'; document.body.append(dot);
    const frames = [];
    for (let i = 0; i <= 14; i += 1) {
      const t = i / 14; const x = (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * cx + t * t * x1; const y = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * cy + t * t * y1;
      frames.push({ transform: `translate(${(x - 7).toFixed(1)}px,${(y - 7).toFixed(1)}px) scale(${(1.3 - 0.5 * t).toFixed(2)})`, opacity: i === 14 ? 0.2 : 1 });
    }
    target.style.opacity = '0';
    dot.animate(frames, { duration: 640, easing: 'cubic-bezier(.35,.1,.25,1)' }).onfinish = () => {
      dot.remove(); target.style.opacity = '';
      target.animate([{ opacity: 0, transform: `${target.getAttribute('transform')} scale(.3)` }, { opacity: 1, transform: `${target.getAttribute('transform')} scale(1)` }], { duration: 380, easing: 'cubic-bezier(.2,1.5,.4,1)' });
    };
  }

  // ── 하늘 탭
  function skyHead() {
    const J = ui.judge;
    const n = gs().length; const o = outfits().length;
    if (J) {
      const p = P.product(J.pid); const j = judgeOf(p);
      const from = J.from === 'new' ? '새 별' : J.from === 'map' ? '별지도' : '하늘';
      return `<div class="h-row"><button class="h-back" data-act="judge-close">${IC.back}<span>${from}</span></button><span class="h-sp"></span><span class="h-mark sm" aria-hidden="true">옷자리</span></div>
        <p class="h-over gold">새 별 · ${esc(P.shortKind(p))} · ${esc(P.colorName(p.color))}</p>
        <h1 class="h-display" id="display" aria-live="polite">${J.arrived ? verdictText(j) : `별 ${n} · 별자리 ${o}`}</h1>`;
    }
    const ex = gs().some(isExample);
    const fo = ui.focus ? outfits().find((x) => x.id === ui.focus) : null;
    const next = cands()[0];
    return `<div class="h-row"><span class="h-mark">옷자리</span>${ex ? '<span class="h-tag">예시 하늘</span>' : ''}<span class="h-sp"></span>
        ${next ? `<button class="h-next" data-act="judge" data-pid="${esc(next.id)}" aria-label="다음 후보 비춰 보기: ${esc(next.name)}">${ph(next, 'h-next-ph')}<span>다음 후보</span></button>` : ''}</div>
      <p class="h-over">${fo ? `별자리 · 별 ${fo.garmentIds.length}` : '내 하늘'}</p>
      <h1 class="h-display" id="display">${fo ? esc(fo.title) : `별 ${n} · 별자리 ${o}`}</h1>`;
  }
  function beltHTML() {
    if (ui.judge) return '';
    const os = outfits();
    if (!gs().length) return `<div class="belt-empty"><p>아직 띄운 별이 없어요</p><button class="pill gold" data-act="add-open">${IC.plus}<span>별 띄우기</span></button></div>`;
    if (!os.length) return `<div class="belt-empty"><p>아직 이어진 별자리가 없어요</p><button class="pill" data-act="add-open">${IC.plus}<span>별 더 띄우기</span></button></div>`;
    return `<div class="chips" role="group" aria-label="별자리">${os.map((o) => `<button class="chip${ui.focus === o.id ? ' on' : ''}" data-act="focus" data-id="${esc(o.id)}" aria-pressed="${ui.focus === o.id}">${glyph(o.garmentIds.length)}<span>${esc(o.title)}</span></button>`).join('')}</div>`;
  }
  function cardHTML() {
    const g = !ui.judge && ui.card ? gs().find((x) => x.id === ui.card) : null;
    if (!g) return '';
    const inN = outfits().filter((o) => o.garmentIds.includes(g.id)).length;
    const pos = sky.pos(g.id); const top = pos && pos.y > sky.height() * 0.52;
    return `<div class="scard${top ? ' at-top' : ''}" role="dialog" aria-label="별 정보">
      ${ph(g, 'sc-ph')}
      <div class="sc-tx">
        <p class="sc-k">${esc(catName(g))}<span class="sep"></span><i class="dot" style="--c:${P.colorHex(g.color)}"></i>${esc(P.colorName(g.color))}${isExample(g) ? '<span class="sep"></span><b class="ex">예시 별</b>' : ''}</p>
        <p class="sc-n">${esc(P.label(g))}</p>
        <p class="sc-m">${inN ? `별자리 ${inN}개에 이어져 있어요` : '아직 이어진 별자리가 없어요'}</p>
      </div>
      <button class="sc-x icon-btn" data-act="card-close" aria-label="닫기">${IC.close}</button>
      <div class="sc-foot">${ui.cardAsk
        ? '<p class="sc-ask">하늘에서 내릴까요?</p><button class="btn-q" data-act="card-keep">그대로</button><button class="btn-danger" data-act="card-drop">내리기</button>'
        : '<button class="btn-q" data-act="card-ask">하늘에서 내리기</button>'}</div>
    </div>`;
  }
  function renderSky() {
    const view = $('#view');
    if (view.dataset.v !== 'sky') {
      view.dataset.v = 'sky';
      view.innerHTML = '<header class="sky-head" id="skyHead"></header><div class="sky-wrap" id="skyWrap"><div class="card-host" id="cardHost"></div></div><div class="belt" id="belt"></div>';
      $('#skyWrap').prepend(sky.el);
    }
    $('#skyHead').innerHTML = skyHead();
    $('#belt').innerHTML = beltHTML();
    $('#cardHost').innerHTML = cardHTML();
  }

  // ── 판단 시트
  function sheetHTML() {
    const J = ui.judge; const p = P.product(J.pid); const j = judgeOf(p);
    const dec = P.record.decisions.find((d) => d.productId === p.id);
    const titles = j.looks.map((l) => l.title);
    const ev = j.verdict === 'overlap'
      ? `<span class="ev-n">겹치는 별 ${j.overlaps.length}</span><span class="ev-t">${esc(j.overlaps.map((g) => `${P.shortKind(g)} ${P.colorName(g.color)}`).join(' · '))}</span>`
      : j.looks.length
        ? `<span class="ev-n">별자리 ${j.looks.length}</span><span class="ev-t">${esc(titles.join(' · '))}</span>`
        : '<span class="ev-n">별자리 0</span><span class="ev-t">종류·색이 맞는 별을 아직 못 찾았어요</span>';
    const lookRow = (look) => {
      const items = look.items.filter((it) => it.candidate || it.garment);
      const cand = items.find((it) => it.candidate); const rest = items.filter((it) => it.garment);
      const seq = [cand, ...rest].filter(Boolean);
      return `<li class="lk">
        <div class="lk-h"><p class="lk-t">${esc(look.title)}</p><span class="lk-tag${look.isNew ? ' new' : ''}">${look.isNew ? '새 별자리' : '바꿔 입기'}</span></div>
        <div class="lk-stars">${seq.map((it) => (it.candidate ? `<span class="lk-st c">${ph(p)}</span>` : `<span class="lk-st">${ph(it.garment)}</span>`)).join('<i class="lk-ln"></i>')}</div>
        <p class="lk-names">${esc(seq.map((it) => (it.candidate ? '새 별' : `${P.shortKind(it.garment)} ${P.colorName(it.garment.color)}`)).join(' · '))}</p>
      </li>`;
    };
    const detail = `<div class="detail" id="jdetail">
      ${j.overlaps.length ? `<h3 class="d-h">겹치는 별 ${j.overlaps.length}</h3><ul class="ovl">${j.overlaps.map((g) => `<li>${ph(g, 'ov-ph')}<div><p class="ov-n">${esc(P.label(g))}</p><p class="ov-m">${g.productId === p.id ? '같은 상품' : `같은 종류 · 같은 색 (${esc(P.colorName(g.color))})`}</p></div></li>`).join('')}</ul>` : ''}
      ${j.looks.length ? `<h3 class="d-h">이어지는 별자리 ${j.looks.length}</h3><ul class="lks">${j.looks.map(lookRow).join('')}</ul>` : ''}
      ${!j.looks.length && !j.overlaps.length ? `<p class="d-p">가진 별과 종류·색으로 맞는 코디 공식을 아직 찾지 못했어요. 비슷한 옷이 더 있다면 하늘에 띄워 보세요.</p><button class="pill" data-act="add-open">${IC.plus}<span>별 더 띄우기</span></button>` : ''}
      ${j.sameKind.length ? `<p class="d-p">같은 종류의 별 ${j.sameKind.length}개가 이미 떠 있어요. 색이 달라 겹치지는 않아요.</p>` : ''}
      ${dec ? `<p class="d-p dim">지난 기록 · ${WORD[dec.decision]} · ${day(dec.at)}</p>` : ''}
    </div>`;
    return `<div class="scrim" data-act="sheet-toggle" ${J.open ? '' : 'hidden'}></div>
    <section class="jsheet${J.open ? ' open' : ''}${J.arrived ? ' revealed' : ''}${J.fresh ? ' enter' : ''}" aria-label="새 별 살펴보기">
      <button class="grab" data-act="sheet-toggle" aria-expanded="${J.open}" aria-controls="jdetail" aria-label="${J.open ? '자세히 접기' : '자세히 보기'}"><span></span></button>
      <div class="js-body">
        <div class="c-row">
          <span class="c-ph">${ph(p)}</span>
          <div class="c-tx"><p class="c-brand">${esc(p.brand || '')}</p><p class="c-name">${esc(p.name)}</p><p class="c-price">${esc(P.price(p.price))}<span class="c-at">${p.checkedAt ? ` · ${esc(p.checkedAt.slice(5).replace('-', '.'))} 기록` : ''}</span></p></div>
          <a class="c-link" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">판매처${IC.out}</a>
        </div>
        <button class="ev ev-${j.verdict}" data-act="sheet-toggle" aria-expanded="${J.open}" aria-controls="jdetail">${IC.star4('ev-ic')}${ev}<span class="ev-more">${J.open ? '접기' : '자세히'}${IC.up}</span></button>
        ${J.open ? detail : ''}
        <p class="note">별자리는 종류·색으로 맞춘 코디 공식이에요. 핏·사이즈·소재·현재 가격은 판매처에서 확인해 주세요.</p>
      </div>
      <div class="acts">
        <button class="act act-buy cta" data-act="decide" data-d="buy">하늘에 띄우기</button>
        <div class="acts-2"><button class="act" data-act="decide" data-d="hold">잠시 보류</button><button class="act" data-act="decide" data-d="skip">보내 주기</button></div>
      </div>
    </section>`;
  }
  function renderSheet() {
    const host = $('#sheetHost');
    if (!ui.judge || ui.intro || ui.tab !== 'sky') { host.innerHTML = ''; return; }
    host.innerHTML = sheetHTML();
    ui.judge.fresh = false;
    if (!ui.judge.open) ui.judge.sheetH = $('.jsheet', host).offsetHeight;
  }

  // ── 새 별 탭
  function candRow(p) {
    const j = judgeOf(p);
    const pv = P.owns(p) ? '<span class="pv pv-own">이미 하늘에</span>'
      : j.verdict === 'yes' ? `<span class="pv pv-yes">${IC.star4('pv-ic')}<b>+${j.looks.length}</b><small>별자리</small></span>`
        : j.verdict === 'overlap' ? '<span class="pv pv-ov"><i class="pv-ring"></i><small>비슷한 별</small></span>'
          : '<span class="pv pv-no"><small>이어질 별<br>아직 없음</small></span>';
    const dec = P.decisionOf(p);
    return `<li><button class="crow" data-act="judge" data-pid="${esc(p.id)}">
      ${ph(p, 'cr-ph')}
      <span class="cr-tx"><span class="cr-k">${esc(catName(p))} · ${esc(P.colorName(p.color))}${dec ? ` · ${WORD[dec]}` : ''}</span><span class="cr-n">${esc(p.name)}</span><span class="cr-b">${esc(p.brand || '')} · ${esc(P.price(p.price))}</span></span>
      ${pv}
    </button></li>`;
  }
  function renderNew() {
    const view = $('#view'); view.dataset.v = 'new';
    const list = ui.results || cands();
    const gender = P.record.gender === 'F' ? '여성' : '남성';
    view.innerHTML = `<div class="page" id="page">
      <header class="pg-head"><p class="pg-over">새 별</p><h1 class="pg-ttl">어떤 별을 비춰 볼까요</h1><p class="pg-sub">고르면 지금 하늘에 띄워, 이어지는 별자리를 그려 봐요.</p></header>
      <form class="finder" id="finder" novalidate>
        <label class="sr-only" for="q">무신사 상품 링크 또는 이름</label>
        <span class="f-ic">${IC.search}</span>
        <input id="q" name="q" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="go" placeholder="무신사 링크 붙여 넣기 · 이름으로 찾기" value="${esc(ui.query)}">
        <button class="f-go" type="submit">비춰 보기</button>
      </form>
      ${ui.err ? `<p class="err" role="alert">${esc(ui.err)}</p>` : ''}
      <section class="sec">
        <div class="sec-h"><h2>${ui.results ? `찾은 별 ${list.length}` : '추천 후보'}</h2>${ui.results ? '<button class="link-q" data-act="clear-search">추천 후보 보기</button>' : `<span class="sec-m">${gender} · 지금 하늘 기준</span>`}</div>
        ${list.length ? `<ul class="clist">${list.map(candRow).join('')}</ul>` : `<p class="empty">${ui.results ? '찾은 별이 없어요. 다른 이름으로 찾아보세요.' : '지금은 비춰 볼 후보가 없어요. 링크나 이름으로 찾아보세요.'}</p>`}
      </section>
    </div>`;
  }

  // ── 별지도 탭
  function chartSVG(ds) {
    const list = ds.slice(-28); const W = 350; const H = 128; const x0 = 74; const x1 = W - 14;
    const lane = { buy: 26, hold: 60, skip: 94 }; const n = list.length;
    const xs = list.map((_, i) => (n === 1 ? (x0 + x1) / 2 : x0 + (i * (x1 - x0)) / (n - 1)));
    const pts = list.map((d, i) => [xs[i], lane[d.decision] || lane.hold]);
    const mark = (d, [x, y]) => (d.decision === 'buy' ? `<path class="mk-buy" d="${sparkD(x, y, 7)}"/>`
      : d.decision === 'hold' ? `<circle class="mk-hold" cx="${x}" cy="${y}" r="4.4"/>`
        : `<line class="mk-tail" x1="${x + 9}" y1="${y - 7}" x2="${x}" y2="${y}"/><circle class="mk-skip" cx="${x}" cy="${y}" r="2.6"/>`);
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="고른 순서대로 이은 별지도. 띄운 별 ${ds.filter((d) => d.decision === 'buy').length}, 보류 ${ds.filter((d) => d.decision === 'hold').length}, 보낸 별 ${ds.filter((d) => d.decision === 'skip').length}">
      ${Object.entries(lane).map(([k, y]) => `<line class="lane" x1="${x0 - 12}" x2="${x1 + 8}" y1="${y}" y2="${y}"/><text class="lane-t" x="0" y="${y + 4}">${WORD[k]}</text>`).join('')}
      ${n > 1 ? `<polyline class="path" points="${pts.map((p) => p.join(',')).join(' ')}"/>` : ''}
      ${list.map((d, i) => mark(d, pts[i])).join('')}
      <text class="axis" x="${x0}" y="${H - 2}">${n > 1 ? '처음' : ''}</text><text class="axis" x="${x1}" y="${H - 2}" text-anchor="end">최근</text>
    </svg>`;
  }
  function renderMap() {
    const view = $('#view'); view.dataset.v = 'map';
    const ds = [...P.record.decisions].sort((a, b) => String(a.at).localeCompare(String(b.at)));
    const count = (k) => ds.filter((d) => d.decision === k).length;
    const skipped = ds.filter((d) => d.decision === 'skip' && Number.isFinite(d.price));
    const sum = skipped.reduce((s, d) => s + d.price, 0);
    const row = (d) => {
      const p = P.product(d.productId);
      const name = p ? p.name : d.productId;
      return `<li><button class="lrow d-${d.decision}" data-act="judge" data-pid="${esc(d.productId)}" ${p ? '' : 'disabled'}>
        <span class="lr-ph">${p ? ph(p) : ''}<span class="lr-mk">${d.decision === 'buy' ? IC.star4('lr-ic') : ''}</span></span>
        <span class="lr-tx"><span class="lr-n">${esc(name)}</span><span class="lr-m"><b>${WORD[d.decision]}</b> · ${day(d.at)}</span></span>
        <span class="lr-p">${esc(P.price(Number.isFinite(d.price) ? d.price : NaN))}</span>
      </button></li>`;
    };
    view.innerHTML = `<div class="page" id="page">
      <header class="pg-head"><p class="pg-over">별지도</p><h1 class="pg-ttl">고른 별들의 지도</h1></header>
      <section class="tally" aria-label="결정 수">
        <div class="t t-buy">${IC.star4('t-ic')}<b>${count('buy')}</b><span>띄운 별</span></div>
        <div class="t t-hold"><i class="t-ring"></i><b>${count('hold')}</b><span>보류</span></div>
        <div class="t t-skip"><i class="t-fall"></i><b>${count('skip')}</b><span>보낸 별</span></div>
      </section>
      ${ds.length ? `<figure class="chart-wrap">${chartSVG(ds)}</figure>` : ''}
      ${skipped.length ? `<div class="sum"><p>보낸 별의 기록 가격 합계</p><b>${esc(P.price(sum))}</b><small>고를 때 기록해 둔 가격을 더했어요. 지금 가격과 다를 수 있어요.</small></div>` : ''}
      <section class="sec">
        <div class="sec-h"><h2>기록</h2><span class="sec-m">${ds.length ? `${ds.length}개 · 최근 순` : ''}</span></div>
        ${ds.length ? `<ul class="llist">${[...ds].reverse().map(row).join('')}</ul>` : '<div class="empty"><p>아직 기록이 없어요. 새 별을 비춰 보고 골라 보세요.</p><button class="pill" data-act="tab" data-tab="new">새 별 보러 가기</button></div>'}
      </section>
      <section class="mine">
        <div><p class="mine-k">내 하늘</p><p class="mine-v">별 ${gs().length} · 별자리 ${outfits().length}${gs().some(isExample) ? ' · 예시 포함' : ''}</p></div>
        <button class="pill" data-act="add-open">${IC.plus}<span>별 더 띄우기</span></button>
      </section>
      <section class="settings">
        ${ui.resetAsk ? `<div class="confirm" role="alertdialog" aria-labelledby="rsTtl"><p id="rsTtl">띄운 별과 기록이 모두 지워져요.</p><div class="cf-row"><button class="btn-q" data-act="reset-cancel">그대로 두기</button><button class="btn-danger" data-act="reset-do">모두 지우기</button></div></div>`
          : '<button class="link-q" data-act="reset-ask">처음부터 다시</button>'}
      </section>
    </div>`;
  }

  // ── 별 더 띄우기 (덮개 시트)
  function renderLayer() {
    const layer = $('#layer');
    if (!ui.add || ui.intro) { layer.innerHTML = ''; return; }
    layer.innerHTML = `<div class="layer-scrim" data-act="add-close"></div>
      <section class="msheet" role="dialog" aria-modal="true" aria-labelledby="addTtl">
        <header class="ms-head"><div><h2 class="ms-ttl" id="addTtl">별 더 띄우기</h2><p class="ms-sub">가진 옷과 닮은 것을 눌러 주세요 · 지금 별 <b id="addCount">${gs().length}</b></p></div><button class="btn-gold sm" data-act="add-close">완료</button></header>
        ${catsHTML('add', ui.add.cat)}
        <div class="own-grid" id="ownGrid">${gridHTML(ui.add.cat)}</div>
      </section>`;
  }

  function renderTabs() {
    const T = [['sky', '하늘', IC.sky], ['new', '새 별', IC.spark], ['map', '별지도', IC.map]];
    $('#tabs').innerHTML = T.map(([id, label, icon]) => `<button class="tab${ui.tab === id ? ' on' : ''}" data-act="tab" data-tab="${id}" ${ui.tab === id ? 'aria-current="page"' : ''}>${icon}<span>${label}</span></button>`).join('');
  }

  function render() {
    shell();
    const oj = $('#oj'); const view = $('#view');
    if (!P.record.started && !ui.intro) ui.intro = 'hello';
    oj.dataset.mode = ui.intro ? 'intro' : 'app';
    oj.dataset.tab = ui.tab;
    oj.dataset.judging = ui.judge ? '1' : '0';
    if (ui.intro) {
      const v = `intro-${ui.intro}`;
      if (view.dataset.v !== v) { view.dataset.v = v; view.innerHTML = ui.intro === 'hello' ? helloHTML() : pickHTML(); }
      $('#sheetHost').innerHTML = ''; $('#layer').innerHTML = ''; $('#tabs').innerHTML = '';
      return;
    }
    if (ui.tab === 'sky') renderSky(); else if (ui.tab === 'new') renderNew(); else renderMap();
    renderSheet(); renderTabs(); renderLayer();
    if (ui.tab === 'sky') sky.sync();
  }

  // ── 동작
  function openJudge(p, from) {
    if (!p || busy) return;
    ui.judge = { pid: p.id, from, open: false, arrived: false, fresh: true, sheetH: 0 };
    ui.tab = 'sky'; ui.card = null; ui.cardAsk = false; ui.focus = null; ui.err = '';
    sky.dropCand();
    render();
  }
  async function closeJudge() {
    if (!ui.judge || busy) return;
    busy = true;
    const from = ui.judge.from;
    await sky.dismiss('fade');
    ui.judge = null; ui.tab = from;
    busy = false;
    render();
  }
  async function decide(d) {
    if (!ui.judge || busy) return;
    busy = true;
    const p = P.product(ui.judge.pid); const from = ui.judge.from;
    P.buzz(10);
    root.querySelectorAll('.act').forEach((b) => { b.disabled = true; });
    if (d === 'buy') {
      const before = new Set(gs().map((g) => g.id));
      P.decide(p, 'buy');
      const ng = gs().find((g) => !before.has(g.id));
      await sky.settle(ng ? ng.id : null);
      ui.judge = null; ui.tab = 'sky';
      busy = false;
      render();
      toast(ng ? '새 별이 하늘에 떴어요' : '이미 떠 있는 별이라 기록만 남겼어요');
    } else {
      P.decide(p, d);
      await sky.dismiss(d === 'skip' ? 'fall' : 'fade');
      ui.judge = null; ui.tab = from;
      busy = false;
      render();
      toast(d === 'hold' ? '잠시 보류했어요. 별지도에 적어 둘게요.' : '보내 주었어요. 별지도에 남겨 둘게요.');
    }
  }
  function toggleOwn(btn) {
    const p = P.product(btn.dataset.pid); if (!p) return;
    if (P.owns(p)) { const g = gs().find((x) => x.productId === p.id); if (g) P.removeOwned(g.id); } else P.addOwned(p);
    const on = P.owns(p);
    btn.classList.toggle('on', on); btn.setAttribute('aria-pressed', String(on));
    P.buzz(on ? 10 : 6);
    if (ui.intro === 'pick') {
      $('#mini').innerHTML = miniHTML(); $('#pickFoot').innerHTML = pickFoot();
      if (on) flyToMini(btn.querySelector('img'));
    } else if (ui.add) {
      const c = $('#addCount'); if (c) c.textContent = String(gs().length);
    }
  }
  function onFind(text) {
    const t = text.trim(); ui.query = t; ui.err = '';
    if (!t) { ui.results = null; render(); return; }
    const url = (t.match(/https?:\/\/\S+/i) || [])[0];
    if (url || /^(www\.|m\.)?musinsa\.com|\.com\/|^www\./i.test(t)) {
      const r = P.fromLink(url || t);
      if (r.error) { ui.err = r.error; ui.results = null; render(); $('#q')?.focus(); return; }
      openJudge(r.product, 'new');
      return;
    }
    ui.results = P.search(t);
    render();
  }

  root.addEventListener('click', (e) => {
    const t = e.target.closest('[data-act]');
    if (!t) {
      if (e.target.closest('.sky') && (ui.card || ui.focus) && !ui.judge) { ui.card = null; ui.cardAsk = false; ui.focus = null; render(); }
      return;
    }
    const act = t.dataset.act;
    switch (act) {
      case 'gender': P.start(t.dataset.g); ui.intro = 'pick'; ui.pickCat = null; render(); break;
      case 'intro-back': ui.intro = 'hello'; render(); break;
      case 'example': {
        P.startExample(P.record.gender || 'M');
        P.record.exampleIds = gs().map((g) => g.id); P.save();
        ui = { ...fresh(), intro: null }; sky.reset(); sky.reveal(); render(); break;
      }
      case 'intro-done': if (gs().length) { ui = { ...fresh(), intro: null }; sky.reset(); sky.reveal(); render(); } break;
      case 'cat': {
        if (t.dataset.scope === 'pick') ui.pickCat = t.dataset.cat; else if (ui.add) ui.add.cat = t.dataset.cat;
        const grid = $('#ownGrid'); if (grid) { grid.innerHTML = gridHTML(t.dataset.cat); grid.scrollTop = 0; }
        t.parentElement.querySelectorAll('.cat').forEach((b) => { const on = b === t; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); });
        break;
      }
      case 'own': toggleOwn(t); break;
      case 'tab': {
        if (busy) break;
        ui.tab = t.dataset.tab; ui.card = null; ui.cardAsk = false; ui.resetAsk = false;
        if (ui.tab !== 'new') { ui.results = null; ui.err = ''; }
        render(); $('#page')?.scrollTo(0, 0); break;
      }
      case 'focus': ui.focus = ui.focus === t.dataset.id ? null : t.dataset.id; ui.card = null; ui.cardAsk = false; render(); break;
      case 'star': if (ui.judge) break; ui.card = ui.card === t.dataset.id ? null : t.dataset.id; ui.cardAsk = false; render(); break;
      case 'card-close': ui.card = null; ui.cardAsk = false; render(); break;
      case 'card-ask': ui.cardAsk = true; render(); $('[data-act="card-keep"]')?.focus(); break;
      case 'card-keep': ui.cardAsk = false; render(); break;
      case 'card-drop': {
        const g = gs().find((x) => x.id === ui.card);
        if (g) { P.removeOwned(g.id); ui.focus = null; }
        ui.card = null; ui.cardAsk = false; render(); toast('별을 하늘에서 내렸어요'); break;
      }
      case 'judge': openJudge(P.product(t.dataset.pid), ui.tab); break;
      case 'judge-close': closeJudge(); break;
      case 'cand-sheet': case 'sheet-toggle': if (ui.judge) { ui.judge.open = !ui.judge.open; renderSheet(); } break;
      case 'decide': decide(t.dataset.d); break;
      case 'clear-search': ui.results = null; ui.query = ''; ui.err = ''; render(); break;
      case 'add-open': {
        const cs = catsFor();
        ui.add = { cat: cs.includes('top') ? 'top' : cs[0] };
        if (ui.judge) { ui.judge.open = false; }
        renderLayer(); $('#layer .msheet .btn-gold')?.focus(); break;
      }
      case 'add-close': ui.add = null; render(); break;
      case 'reset-ask': ui.resetAsk = true; render(); $('[data-act="reset-cancel"]')?.focus(); break;
      case 'reset-cancel': ui.resetAsk = false; render(); break;
      case 'reset-do': P.reset(); sky.reset(); ui = fresh(); $('#view').dataset.v = ''; render(); break;
      default: break;
    }
  });
  root.addEventListener('submit', (e) => {
    if (e.target.id !== 'finder') return;
    e.preventDefault();
    onFind(e.target.elements.q.value);
  });
  root.addEventListener('input', (e) => { if (e.target.id === 'q') ui.query = e.target.value; });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (ui.add) { ui.add = null; render(); } else if (ui.judge?.open) { ui.judge.open = false; renderSheet(); } else if (ui.judge) closeJudge(); else if (ui.card) { ui.card = null; render(); }
  });

  if (P.record.started) sky.reveal();
  render();
})();
