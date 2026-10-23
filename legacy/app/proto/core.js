// Shared core of the concept prototypes (app/proto/<id>/): the real catalog and
// the real comparison engine, with a small record kept in this browser only.
// Each prototype keeps its own record under its own key. Nothing is sent anywhere.
// PROTO_META is injected by tools/build-proto.mjs from app/proto/<id>/meta.json.
const Proto = (() => {
  const meta = PROTO_META;
  const KEY = `eoul-proto:${meta.id}`;
  const blank = () => ({ v: 1, gender: null, styles: [], garments: [], decisions: [], started: false });
  // A new generation (meta.gen) or a link ending in #reset starts this prototype
  // fresh, as on first use. An artifact page has its own origin, so clearing its
  // storage clears only this prototype's records.
  try {
    const gen = String(meta.gen || '1');
    if ((typeof location !== 'undefined' && location.hash === '#reset') || localStorage.getItem('eoul-proto:gen') !== gen) {
      localStorage.clear();
      localStorage.setItem('eoul-proto:gen', gen);
    }
  } catch {}
  let record = load();

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (saved?.v === 1) return { ...blank(), ...saved };
    } catch {}
    return blank();
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(record)); } catch {}
  }
  function reset() {
    record = blank();
    save();
  }

  // The engine reads the same state shape as the app: real garments only, no example closet.
  const engineState = () => ({
    ...newWardrobeState(), gender: record.gender || 'M', styles: record.styles.length ? record.styles : stylesFor(record.gender || 'M').slice(0, 1),
    demo: false, demoSelected: [], garments: record.garments, closet: record.garments, journeys: [],
  });
  const slotOf = (p) => SLOT_BY_ID[p?.slot];
  const product = (id) => PRODUCT_BY_ID[id] || null;
  const garmentProduct = (g) => product(g.productId) || lookalike(g.slot, g.color);
  // A garment shows its own photo when it has one, else its catalog product, else a look-alike product.
  const photo = (x) => (x?.photoId ? photoOf(x.photoId) : '') || (x?.productId !== undefined && !x.img ? garmentProduct(x)?.img : x?.img) || (x?.slot ? art(x) : '');
  // Last resort for a garment with no photo and no look-alike product: its silhouette in its colour.
  function art(g) {
    const s = SLOT_BY_ID[g.slot];
    if (!s) return '';
    const svg = garmentSvg(s, { color: COLORS[g.color]?.hex || '#BBBBBB' }).replaceAll('var(--art-line)', '#8A8A8A')
      .replace(/<svg([^>]*)>/, '<svg$1 xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100" fill="#EFEFEC"/>');
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
  }
  const colorName = (c) => COLORS[c]?.label || '';
  const colorHex = (c) => COLORS[c]?.hex || '#999999';
  const kindName = (x) => slotOf(x)?.name || '';
  const shortKind = (x) => (slotOf(x) ? shortName(slotOf(x)) : '');
  const category = (x) => slotOf(x)?.cat || 'acc';
  const label = (g) => g.label || garmentLabel(g);
  const price = (n) => (Number.isFinite(n) ? formatPrice(n) : '가격 미확인');
  const eligible = (p) => SAFE_PRODUCTS.includes(p);

  function garmentFrom(p) {
    return makeGarment({ slot: p.slot, color: p.color, gender: slotOf(p).g, productId: p.id, brand: p.brand || null, label: p.name || '', source: 'user' });
  }
  function start(gender, styles = stylesFor(gender).slice(0, 1)) {
    record = { ...blank(), gender, styles, started: true };
    save();
  }
  // A ready-made closet to try the prototype at once: the style's representative
  // pieces, each shown with a real catalog product of that kind and color.
  function startExample(gender, styles = stylesFor(gender).slice(0, 1)) {
    start(gender, styles);
    const picks = exampleCloset({ ...engineState() }).map(({ slot, color }) => lookalike(slot, color)).filter(Boolean);
    record.garments = picks.map(garmentFrom);
    save();
  }
  const owns = (p) => record.garments.some((g) => g.productId === p.id);
  function addOwned(p) {
    if (!owns(p)) record.garments = [...record.garments, garmentFrom(p)];
    save();
  }
  function removeOwned(id) {
    for (const g of record.garments.filter((g) => (g.id === id || g.productId === id) && g.photoId)) {
      try { localStorage.removeItem(PHOTO_KEY(g.photoId)); } catch {}
      photoCache.delete(g.photoId);
    }
    record.garments = record.garments.filter((g) => g.id !== id && g.productId !== id);
    save();
  }
  // Products a person can tap as "I have one like this", per category, best first.
  function ownables(cat = null, { limit = 24 } = {}) {
    const gender = record.gender || 'M';
    const seen = new Set();
    return SAFE_PRODUCTS.filter((p) => slotOf(p)?.g === gender && (!cat || slotOf(p).cat === cat) && p.img && COLORS[p.color])
      .sort((a, b) => quality(b) - quality(a))
      .filter((p) => { const k = `${p.slot}:${p.color}`; return !seen.has(k) && seen.add(k); })
      .slice(0, limit);
  }
  // Candidates to judge: the closet plan's one-piece gaps, the two pieces of a
  // pair, then recommended products, taken in turns so kinds alternate.
  // Owned and already decided ones are left out.
  function candidates({ limit = 12, includeDecided = false } = {}) {
    const state = engineState();
    const plan = wardrobePlan(state);
    const decided = new Set(record.decisions.map((d) => d.productId));
    const groups = [
      ...plan.gaps.map((gap) => gap.products.map((entry) => entry.product)),
      ...(plan.pairs || []).map((pair) => pair.slots.map((slot) => pair.products[slot.id]?.[0]?.product)),
      ...recommendItems(state, { limit: 16 }).map((item) => [item.product, ...item.alternatives.slice(0, 2)]),
    ];
    const seen = new Set();
    const out = [];
    for (let i = 0; out.length < limit && groups.some((g) => g.length > i); i += 1) {
      for (const group of groups) {
        const p = group[i];
        if (p && eligible(p) && !owns(p) && (includeDecided || !decided.has(p.id)) && !seen.has(p.id) && seen.add(p.id)) out.push(p);
        if (out.length >= limit) break;
      }
    }
    return out;
  }
  // The judgment, restated from compareCandidate. verdict: 'yes' when the product
  // completes at least one look and nothing owned overlaps, 'overlap' when a
  // registered garment is the same product or the same kind and color, else 'unsure'.
  function judge(p) {
    const candidate = candidateFromProduct(p);
    const c = compareCandidate(engineState(), candidate);
    const unique = (items) => [...new Map(items.map((g) => [g.id, g])).values()];
    const looks = c.looks.map((row) => ({
      id: row.look.id, title: row.look.title, note: row.look.note || '', isNew: row.new,
      items: byRole(row.items.map((it) => (it.source === 'candidate' ? { candidate: true, product: p, role: it.role } : { garment: it.item, role: it.role }))),
    }));
    const used = unique(looks.flatMap((look) => look.items.filter((it) => it.garment).map((it) => it.garment)));
    const overlaps = unique([...c.sameProduct, ...c.similarOwned]);
    const others = record.garments.filter((g) => !used.some((u) => u.id === g.id) && !overlaps.some((o) => o.id === g.id));
    const verdict = looks.length && !overlaps.length ? 'yes' : overlaps.length ? 'overlap' : 'unsure';
    const sameKind = c.sameTypeOwned.filter((g) => !overlaps.some((o) => o.id === g.id));
    return {
      product: p, candidate, verdict, looks, newLooks: c.newFormulaCount, used, overlaps, others, sameKind,
      reasons: c.decision.reasons, checks: c.missingChecks.map((x) => x.message), price: candidate.price, empty: !record.garments.length,
    };
  }
  // Outfit pieces in wearing order (outer, top, inner, dress, bottom, shoes, acc), each with its role name.
  const byRole = (items) => [...items]
    .sort((x, y) => ROLE_ORDER.indexOf(x.role) - ROLE_ORDER.indexOf(y.role))
    .map((it) => ({ ...it, roleName: ROLE_LABEL[it.role] || '' }));
  // What my closet needs, from the closet plan: each gap is one kind of garment
  // that completes new outfits with clothes I own (why = how many owned pieces and
  // new outfits), with those outfits as whole looks and real products for the gap.
  // Pairs are outfits two pieces away. Ready = outfits I can already wear.
  function needs({ limit = 4, productsPerGap = 4 } = {}) {
    const plan = wardrobePlan(engineState(), { gapLimit: limit, productsPerGap });
    const look = (l, extra = {}) => ({ title: l.title, note: l.note || '', pieces: byRole(l.items.map((it) => (it.owned
      ? { garment: it.item, role: it.role }
      : { need: true, slot: it.slot, kind: it.slot?.name || '', role: it.role }))), ...extra });
    return {
      garments: record.garments.length,
      ready: outfits({ limit: 20 }),
      gaps: plan.gaps.map((gap) => ({
        kind: gap.slot.name, short: shortName(gap.slot), cat: gap.slot.cat, why: gap.slot.why || '',
        newLooks: gap.newFormulaCount, usesOwned: gap.usesOwned,
        line: `가진 옷 ${gap.usesOwned.length}벌과 코디 ${gap.newFormulaCount}개가 새로 완성돼요`,
        looks: gap.looks.map((l) => look(l)),
        products: gap.products.map((entry) => entry.product).filter((p) => p && eligible(p) && !owns(p)),
      })).filter((gap) => gap.products.length),
      pairs: (plan.pairs || []).map((pair) => ({
        kinds: pair.slots.map((slot) => slot.name), look: look(pair.look),
        products: pair.slots.map((slot) => pair.products[slot.id]?.[0]?.product || null),
        line: `${pair.slots.map((slot) => shortName(slot)).join(' + ')}를 더하면 가진 옷 ${pair.usesOwned.length}벌로 코디가 완성돼요`,
      })),
      duplicates: plan.duplicates.map((d) => ({ kind: d.slot.name, color: d.color, items: d.items })),
    };
  }
  // The same look with a chosen product filling the needed piece of its kind.
  function fillNeed(lookValue, p) {
    return { ...lookValue, pieces: lookValue.pieces.map((it) => (it.need && it.slot?.id === p.slot ? { candidate: true, product: p, role: it.role, roleName: it.roleName } : it)) };
  }
  const roleName = (role) => ROLE_LABEL[role] || '';
  function decide(p, decision) {
    record.decisions = [...record.decisions.filter((d) => d.productId !== p.id), { productId: p.id, decision, at: new Date().toISOString(), price: Number.isFinite(p.price) ? p.price : null }];
    if (decision === 'buy' && meta.addOnBuy) addOwned(p);
    save();
  }
  const decisionOf = (p) => record.decisions.find((d) => d.productId === p.id)?.decision || null;
  // Ready outfits from the registered closet only, each as the garment ids it uses.
  function outfits({ limit = 12 } = {}) {
    return closetLooks(engineState(), { limit }).ready.map((r) => ({
      id: r.look.id, title: r.look.title, note: r.look.note || '', garmentIds: r.items.filter((it) => it.owned && it.item).map((it) => it.item.id),
      pieces: byRole(r.items.filter((it) => it.owned && it.item).map((it) => ({ garment: it.item, role: it.role }))),
    }));
  }
  function fromLink(raw) {
    const parsed = parseCandidateLink(raw);
    if (!parsed.ok) return { error: parsed.error };
    const p = product(parsed.productId);
    if (!p) return { error: '이 시안은 수집해 둔 무신사 상품 링크만 바로 비교해요.' };
    if (!eligible(p)) return { error: '코디 비교에 쓰지 않는 상품이에요.' };
    return { product: p };
  }
  function search(text, { limit = 20 } = {}) {
    const q = text.trim().toLowerCase();
    const gender = record.gender || 'M';
    if (!q) return [];
    return SAFE_PRODUCTS.filter((p) => slotOf(p)?.g === gender && `${p.brand} ${p.name} ${slotOf(p).name} ${colorName(p.color)}`.toLowerCase().includes(q)).slice(0, limit);
  }
  const buzz = (ms = 12) => { try { navigator.vibrate?.(ms); } catch {} };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  const reducedMotion = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

  // ── My own clothes: a photo, or kind and color, or a product found by name.
  // Photos are made small (longest side 560px, JPEG) and kept in this browser only.
  const PHOTO_KEY = (id) => `eoul-proto:photo:${id}`;
  const photoCache = new Map();
  function photoOf(id) {
    if (!photoCache.has(id)) { let v = ''; try { v = localStorage.getItem(PHOTO_KEY(id)) || ''; } catch {} photoCache.set(id, v); }
    return photoCache.get(id);
  }
  // Kinds of clothes for the current gender, grouped by category, in the app's own order.
  function kinds() {
    const gender = record.gender || 'M';
    return Object.entries(CATS).map(([cat, name]) => ({ cat, name, slots: SLOTS.filter((s) => s.g === gender && s.cat === cat) }))
      .filter((group) => group.slots.length);
  }
  const colorList = () => Object.entries(COLORS).map(([id, c]) => ({ id, label: c.label, hex: c.hex }));
  function addGarment({ slot, color, photo = null, label = '' }) {
    const s = SLOT_BY_ID[slot];
    if (!s || !COLORS[color]) throw new Error('종류와 색을 골라 주세요.');
    const id = `g_${crypto.randomUUID()}`;
    if (photo) {
      try { localStorage.setItem(PHOTO_KEY(id), photo); } catch { throw new Error('이 브라우저에 사진을 더 저장할 공간이 없어요. 사진 없이 추가해 주세요.'); }
      photoCache.set(id, photo);
    }
    const garment = makeGarment({ id, slot, color, gender: s.g, photoId: photo ? id : null, label, source: 'user' });
    record.garments = [...record.garments, garment];
    save();
    return garment;
  }
  // Reads a picked image file into a small JPEG data URL and a suggested color
  // (the most common colour in the middle of the picture, matched to the app's colours).
  function readPhoto(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        try {
          const scale = Math.min(1, 560 / Math.max(img.naturalWidth, img.naturalHeight));
          const w = Math.max(1, Math.round(img.naturalWidth * scale)), h = Math.max(1, Math.round(img.naturalHeight * scale));
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          const g = canvas.getContext('2d');
          g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, w, h);
          g.drawImage(img, 0, 0, w, h);
          // The background is estimated from the picture's edge and left out, so a
          // white studio or a floor does not decide the garment's colour.
          const all = g.getImageData(0, 0, w, h).data;
          const at = (x, y) => { const i = (y * w + x) * 4; return [all[i], all[i + 1], all[i + 2]]; };
          const edge = [];
          for (let x = 0; x < w; x += 4) edge.push(at(x, 0), at(x, h - 1));
          for (let y = 0; y < h; y += 4) edge.push(at(0, y), at(w - 1, y));
          const bg = [0, 1, 2].map((k) => edge.reduce((t, c) => t + c[k], 0) / edge.length);
          const near = (c, d) => (c[0] - d[0]) ** 2 + (c[1] - d[1]) ** 2 + (c[2] - d[2]) ** 2 < 45 ** 2;
          const bins = new Map();
          for (let y = Math.round(h * .15); y < Math.round(h * .85); y += 3) {
            for (let x = Math.round(w * .15); x < Math.round(w * .85); x += 3) {
              const c = at(x, y);
              if (near(c, bg)) continue;
              const key = `${c[0] >> 5},${c[1] >> 5},${c[2] >> 5}`;
              const bin = bins.get(key) || { n: 0, r: 0, g: 0, b: 0 };
              bin.n += 1; bin.r += c[0]; bin.g += c[1]; bin.b += c[2];
              bins.set(key, bin);
            }
          }
          const top = [...bins.values()].sort((x, y) => y.n - x.n)[0];
          const avg = top ? [top.r / top.n, top.g / top.n, top.b / top.n] : [128, 128, 128];
          const hexRGB = (hex) => [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16));
          const color = Object.entries(COLORS).map(([id, c]) => [id, hexRGB(c.hex).reduce((d, v, k) => d + (v - avg[k]) ** 2, 0)])
            .sort((x, y) => x[1] - y[1])[0][0];
          resolve({ photo: canvas.toDataURL('image/jpeg', .8), color });
        } catch (error) { reject(error); } finally { URL.revokeObjectURL(url); }
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('이 사진을 열 수 없어요. 다른 사진을 골라 주세요.')); };
      img.src = url;
    });
  }

  // The add sheet, shared by every prototype and themed by CSS custom properties
  // (--pa-bg, --pa-ink, --pa-sub, --pa-line, --pa-surface, --pa-accent, --pa-accent-ink, --pa-radius).
  function openAdd({ onChange = () => {}, onClose = () => {} } = {}) {
    document.querySelector('.pa-scrim')?.remove();
    const root = document.createElement('div');
    root.className = 'pa-scrim';
    root.innerHTML = '<div class="pa-sheet" role="dialog" aria-modal="true" aria-label="내 옷 추가"><div class="pa-grab"></div><div class="pa-body"></div></div>';
    document.body.append(root);
    const body = root.querySelector('.pa-body');
    const ui = { step: 'start', photo: null, cat: kinds()[0]?.cat, slot: null, color: null, suggested: null, label: '', query: '', added: [], error: '' };
    const close = () => { root.remove(); document.removeEventListener('keydown', onKey); onClose(); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    const head = (title, back = true) => `<div class="pa-head">${back ? '<button class="pa-icon" data-pa="back" aria-label="이전">‹</button>' : '<span></span>'}<h2>${esc(title)}</h2><button class="pa-icon" data-pa="close" aria-label="닫기">×</button></div>`;
    const preview = () => ui.photo ? `<div class="pa-preview"><img src="${ui.photo}" alt="고른 사진"></div>` : '';
    function draw() {
      const slot = SLOT_BY_ID[ui.slot];
      if (ui.step === 'start') {
        body.innerHTML = `${head('내 옷 추가', false)}
          <p class="pa-lead">가진 옷을 넣으면, 그 옷에 맞춰 필요한 옷과 코디를 찾아 드려요.</p>
          <label class="pa-option pa-primary"><input type="file" accept="image/*" data-pa="file" hidden><b>사진으로 추가</b><span>옷 사진을 찍거나 앨범에서 골라요</span></label>
          <button class="pa-option" data-pa="go" data-step="kind"><b>종류와 색으로 추가</b><span>사진 없이 빠르게</span></button>
          <button class="pa-option" data-pa="go" data-step="search"><b>상품 이름으로 찾기</b><span>무신사 상품에서 같은·비슷한 옷을 골라요</span></button>
          ${ui.added.length ? `<p class="pa-note">방금 넣은 옷 ${ui.added.length}벌</p><button class="pa-cta" data-pa="close">다 했어요</button>` : ''}
          ${ui.error ? `<p class="pa-error">${esc(ui.error)}</p>` : ''}`;
      } else if (ui.step === 'kind') {
        const groups = kinds();
        const group = groups.find((g) => g.cat === ui.cat) || groups[0];
        body.innerHTML = `${head('어떤 옷인가요?')}${preview()}
          <div class="pa-tabs" role="tablist">${groups.map((g) => `<button role="tab" data-pa="cat" data-cat="${g.cat}" aria-selected="${g.cat === group.cat}">${esc(g.name)}</button>`).join('')}</div>
          <div class="pa-chips">${group.slots.map((s) => `<button data-pa="slot" data-slot="${s.id}" aria-pressed="${ui.slot === s.id}">${esc(s.name)}</button>`).join('')}</div>`;
      } else if (ui.step === 'color') {
        const fixed = slot?.requiredColors;
        const list = colorList().filter((c) => !fixed || fixed.includes(c.id));
        body.innerHTML = `${head('무슨 색인가요?')}${preview()}
          <p class="pa-lead"><b>${esc(slot?.name || '')}</b>${ui.suggested ? ` · 사진에서 고른 색은 <b>${esc(COLORS[ui.suggested]?.label || '')}</b>이에요. 다르면 바꿔 주세요.` : ''}</p>
          <div class="pa-swatches">${list.map((c) => `<button data-pa="color" data-color="${c.id}" aria-pressed="${ui.color === c.id}"><i style="background:${c.hex}"></i><span>${esc(c.label)}</span></button>`).join('')}</div>
          <label class="pa-field"><span>이름 (선택)</span><input data-pa="label" maxlength="40" placeholder="예: 유니클로 옥스퍼드 셔츠" value="${esc(ui.label)}"></label>
          ${ui.error ? `<p class="pa-error">${esc(ui.error)}</p>` : ''}
          <button class="pa-cta" data-pa="save" ${ui.color ? '' : 'disabled'}>옷장에 넣기</button>`;
      } else if (ui.step === 'search') {
        const results = ui.query.trim() ? search(ui.query, { limit: 24 }) : ownables(null, { limit: 12 });
        body.innerHTML = `${head('상품 이름으로 찾기')}
          <label class="pa-field"><span>브랜드나 상품 이름</span><input data-pa="query" type="search" placeholder="예: 옥스퍼드 셔츠, 치노" value="${esc(ui.query)}"></label>
          <p class="pa-note">${ui.query.trim() ? `${results.length}개 찾았어요` : '많이 가진 기본 옷이에요'} · 눌러서 내 옷장에 넣어요</p>
          <div class="pa-grid">${results.map((p) => `<button data-pa="product" data-id="${p.id}" ${owns(p) ? 'aria-pressed="true"' : ''}><img src="${p.img}" alt="" loading="lazy"><span>${esc(p.brand)}</span><b>${esc(p.name)}</b></button>`).join('') || '<p class="pa-note">찾는 상품이 없어요. 종류와 색으로 추가해 주세요.</p>'}</div>`;
        const input = body.querySelector('[data-pa="query"]');
        input.focus(); input.setSelectionRange(input.value.length, input.value.length);
      } else if (ui.step === 'done') {
        const last = ui.added[ui.added.length - 1];
        body.innerHTML = `${head('옷장에 넣었어요', false)}
          <div class="pa-done"><img src="${photo(last)}" alt=""><div><b>${esc(label(last))}</b><span>${esc(COLORS[last.color]?.label || '')} · ${esc(SLOT_BY_ID[last.slot]?.name || '')}</span></div></div>
          <p class="pa-lead">지금 옷장 ${record.garments.length}벌. 많이 넣을수록 필요한 옷과 코디가 정확해져요.</p>
          <button class="pa-cta" data-pa="again">한 벌 더 추가</button>
          <button class="pa-ghost" data-pa="close">다 했어요</button>`;
      }
    }
    const finish = (garment) => { ui.added.push(garment); ui.error = ''; ui.step = 'done'; onChange(garment); draw(); };
    root.addEventListener('click', (e) => {
      if (e.target === root) return close();
      const el = e.target.closest('[data-pa]');
      if (!el) return;
      const a = el.dataset.pa;
      if (a === 'close') return close();
      if (a === 'back') { ui.step = ui.step === 'color' ? 'kind' : 'start'; ui.error = ''; return draw(); }
      if (a === 'go') { ui.step = el.dataset.step; ui.photo = null; ui.suggested = null; ui.color = null; ui.slot = null; return draw(); }
      if (a === 'cat') { ui.cat = el.dataset.cat; return draw(); }
      if (a === 'slot') { ui.slot = el.dataset.slot; const fixed = SLOT_BY_ID[ui.slot]?.requiredColors; ui.color = fixed?.length === 1 ? fixed[0] : ui.suggested; ui.step = 'color'; return draw(); }
      if (a === 'color') { ui.color = el.dataset.color; return draw(); }
      if (a === 'save') {
        try { finish(addGarment({ slot: ui.slot, color: ui.color, photo: ui.photo, label: ui.label.trim() })); buzz(10); }
        catch (error) { ui.error = error.message; draw(); }
        return;
      }
      if (a === 'product') {
        const p = product(el.dataset.id);
        if (p && !owns(p)) { addOwned(p); finish(record.garments[record.garments.length - 1]); buzz(10); }
        return;
      }
      if (a === 'again') { Object.assign(ui, { step: 'start', photo: null, slot: null, color: null, suggested: null, label: '', query: '' }); return draw(); }
    });
    root.addEventListener('change', async (e) => {
      if (e.target.dataset?.pa !== 'file' || !e.target.files?.[0]) return;
      try {
        const { photo: data, color } = await readPhoto(e.target.files[0]);
        Object.assign(ui, { photo: data, suggested: color, color: null, slot: null, error: '', step: 'kind' });
      } catch (error) { ui.error = error.message; }
      draw();
    });
    root.addEventListener('input', (e) => {
      if (e.target.dataset?.pa === 'label') ui.label = e.target.value;
      if (e.target.dataset?.pa === 'query') { ui.query = e.target.value; draw(); }
    });
    draw();
    return close;
  }

  return {
    meta, get record() { return record; }, save, reset, start, startExample, addOwned, removeOwned, owns, ownables, candidates, judge, decide, decisionOf,
    outfits, needs, fillNeed, roleName, kinds, colorList, addGarment, readPhoto, openAdd, fromLink, search, product, garmentProduct, photo, colorName, colorHex, kindName, shortKind, category, label, price, buzz, esc, reducedMotion,
    styles: (g) => stylesFor(g).map((id) => ({ id, name: STYLES[id].label, short: STYLES[id].short })), cats: CATS,
  };
})();
