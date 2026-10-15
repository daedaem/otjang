// Shared core of the concept prototypes (app/proto/<id>/): the real catalog and
// the real comparison engine, with a small record kept in this browser only.
// Each prototype keeps its own record under its own key. Nothing is sent anywhere.
// PROTO_META is injected by tools/build-proto.mjs from app/proto/<id>/meta.json.
const Proto = (() => {
  const meta = PROTO_META;
  const KEY = `eoul-proto:${meta.id}`;
  const blank = () => ({ v: 1, gender: null, styles: [], garments: [], decisions: [], started: false });
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
  const photo = (x) => (x?.productId !== undefined && !x.img ? garmentProduct(x)?.img : x?.img) || '';
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
      items: row.items.map((it) => (it.source === 'candidate' ? { candidate: true, product: p, role: it.role } : { garment: it.item, role: it.role })),
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
  function decide(p, decision) {
    record.decisions = [...record.decisions.filter((d) => d.productId !== p.id), { productId: p.id, decision, at: new Date().toISOString(), price: Number.isFinite(p.price) ? p.price : null }];
    if (decision === 'buy' && meta.addOnBuy) addOwned(p);
    save();
  }
  const decisionOf = (p) => record.decisions.find((d) => d.productId === p.id)?.decision || null;
  // Ready outfits from the registered closet only, each as the garment ids it uses.
  function outfits({ limit = 12 } = {}) {
    return closetLooks(engineState(), { limit }).ready.map((r) => ({
      id: r.look.id, title: r.look.title, garmentIds: r.items.filter((it) => it.owned && it.item).map((it) => it.item.id),
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

  return {
    meta, get record() { return record; }, save, reset, start, startExample, addOwned, removeOwned, owns, ownables, candidates, judge, decide, decisionOf,
    outfits, fromLink, search, product, garmentProduct, photo, colorName, colorHex, kindName, shortKind, category, label, price, buzz, esc, reducedMotion,
    styles: (g) => stylesFor(g).map((id) => ({ id, name: STYLES[id].label, short: STYLES[id].short })), cats: CATS,
  };
})();
