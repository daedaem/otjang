// 추천 엔진: 스타일·상황·계절·예산·선호 브랜드·내 옷장으로 실제 상품과 코디를 고른다.
// 같은 입력이면 같은 결과가 나오는 규칙 기반 계산이며, 개인 정보는 이 기기 밖으로 나가지 않는다.

import { SLOTS, SLOT_BY_ID, STYLES, OCCASIONS, COLORS } from './data/slots.js';
import { LOOKS, ROLE_ORDER } from './data/looks.js';
import { PRODUCTS } from './data/products.js';
import { parseQuery } from './query.js';

export const SEASON_LABEL = { spring: '봄', summer: '여름', fall: '가을', winter: '겨울' };

export function seasonOf(date = new Date()) {
  const m = date.getMonth() + 1;
  if (m >= 3 && m <= 5) return 'spring';
  if (m >= 6 && m <= 8) return 'summer';
  if (m >= 9 && m <= 11) return 'fall';
  return 'winter';
}

// 받침 여부로 조사를 고른다: 치노와 / 재킷과
export function josa(word, withFinal, withoutFinal) {
  const ch = String(word).trim().slice(-1);
  const code = ch.charCodeAt(0) - 0xac00;
  if (code < 0 || code > 11171) return withoutFinal;
  return code % 28 ? withFinal : withoutFinal;
}

export function formatPrice(n) {
  return `${n.toLocaleString('ko-KR')}원`;
}

const PRODUCTS_BY_SLOT = PRODUCTS.reduce((acc, p) => {
  (acc[p.slot] ||= []).push(p);
  return acc;
}, {});
export const PRODUCT_BY_ID = Object.fromEntries(PRODUCTS.map((p) => [p.id, p]));

// 브랜드 목록: 성별마다 상품 수가 많은 순서
export function brandsFor(gender) {
  const counts = {};
  for (const p of PRODUCTS) if (SLOT_BY_ID[p.slot].g === gender) counts[p.brand] = (counts[p.brand] || 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
}

// 브랜드가 어떤 스타일에 가까운지: 그 브랜드 상품들이 속한 아이템 종류의 스타일 점수 평균
export function brandStyleAffinity(brand, gender, style) {
  const list = PRODUCTS.filter((p) => p.brand === brand && SLOT_BY_ID[p.slot].g === gender);
  if (!list.length) return 0;
  return list.reduce((s, p) => s + (SLOT_BY_ID[p.slot].style[style] || 0), 0) / list.length;
}

export function quality(p) {
  const rating = p.rating ?? 4.4;
  return rating * Math.log10((p.reviews || 0) + (p.likes || 0) / 8 + 10);
}

const light = (c) => COLORS[c]?.light ?? 50;

// 색 조화: 포인트 색은 하나까지, 상·하의는 밝기 차이가 있을 때 정돈돼 보인다
export function harmony(entries, { tonal = false } = {}) {
  const colors = entries.map((e) => e.color).filter(Boolean);
  let score = 0;
  const accents = colors.filter((c) => COLORS[c] && !COLORS[c].neutral).length;
  score -= Math.max(0, accents - 1) * 2;
  const top = entries.find((e) => e.cat === 'top' || e.cat === 'dress');
  const bottom = entries.find((e) => e.cat === 'bottom');
  if (top?.color && bottom?.color) {
    const d = Math.abs(light(top.color) - light(bottom.color));
    if (!tonal && d >= 25) score += 1;
    if (!tonal && top.color === bottom.color && top.color !== 'indigo') score -= 1;
    if (tonal && d < 25) score += 0.5;
  }
  return score;
}

function ctx(state) {
  const gender = state.gender || 'M';
  const styles = (state.styles?.length ? state.styles : [state.style || 'classic']).filter((s) => STYLES[s]?.g.includes(gender));
  const closet = (state.closet || []).filter((i) => SLOT_BY_ID[i.slot]?.g === gender);
  return {
    gender,
    styles: styles.length ? styles : [gender === 'F' ? 'classic' : 'classic'],
    occasion: state.occasion || null,
    season: state.season || seasonOf(state.now ? new Date(state.now) : new Date()),
    maxPrice: state.budget || null,
    closet,
    ownedSlots: new Set([...closet.map((i) => i.slot), ...(state.owned || [])]),
    brands: new Set(state.brands || []),
    brandOnly: !!state.brandOnly && (state.brands || []).length > 0,
    hidden: new Set(state.hidden || []),
  };
}

export function styleScore(slot, styles) {
  let best = 0;
  styles.forEach((s, i) => {
    best = Math.max(best, (slot.style[s] || 0) * (i === 0 ? 1 : 0.85));
  });
  return best;
}

export function productsFor(slotId, { maxPrice = null, hidden = new Set(), color = null, brands = new Set(), brandOnly = false, season = null, brand = null } = {}) {
  const hide = hidden instanceof Set ? hidden : new Set(hidden);
  return (PRODUCTS_BY_SLOT[slotId] || [])
    .filter((p) => !hide.has(p.id)
      && (!maxPrice || p.price <= maxPrice)
      && (!color || p.color === color)
      && (!brand || p.brand === brand)
      && (!brandOnly || brands.has(p.brand))
      && (!season || season === 'summer' || !p.summer))
    .sort((a, b) => (brands.has(b.brand) - brands.has(a.brand)) || quality(b) - quality(a) || a.price - b.price);
}

function productOpts(c, extra = {}) {
  return { maxPrice: c.maxPrice, hidden: c.hidden, brands: c.brands, brandOnly: c.brandOnly, season: c.season, ...extra };
}

function roleOf(look, role) {
  const r = look.roles[role];
  if (!r) return null;
  return Array.isArray(r) ? { s: r, c: [] } : r;
}

function slotsInLook(look) {
  return ROLE_ORDER.flatMap((r) => roleOf(look, r)?.s || []);
}

export function matchingLooks(c, { occasion = c.occasion, anySeason = false } = {}) {
  return LOOKS.filter((l) => l.g === c.gender
    && l.styles.some((s) => c.styles.includes(s))
    && (anySeason || l.seasons.includes(c.season))
    && (!occasion || l.occ.includes(occasion)));
}

const SHORT = {
  'm-oxford': '옥스퍼드 셔츠', 'm-chambray': '데님 셔츠', 'm-flannel': '체크 셔츠', 'm-tee': '티셔츠', 'm-longtee': '긴팔 티',
  'm-denim-raw': '생지 데님', 'm-denim': '청바지', 'm-chino': '치노', 'm-slacks': '슬랙스', 'm-work-pants': '워크 팬츠',
  'm-knit': '니트', 'm-cable': '케이블 니트', 'm-loafer': '로퍼', 'm-derby': '구두', 'm-workboots': '워크부츠', 'm-chelsea': '첼시 부츠',
  'm-white-sneaker': '흰 스니커즈', 'm-canvas': '캔버스화', 'm-runner': '운동화', 'm-trail': '트레일 슈즈', 'm-trucker': '데님 재킷',
  'm-chore': '워크 재킷', 'm-field': '필드 재킷', 'm-harrington': '블루종', 'm-sweat': '맨투맨', 'm-hoodie': '후드',
  'f-shirt': '셔츠', 'f-denim': '청바지', 'f-slacks': '슬랙스', 'f-knit': '니트', 'f-jacket': '데님 재킷', 'f-flat': '플랫',
};
export function shortName(slot) {
  return SHORT[slot.id] || slot.name.split('·')[0];
}

// 한 아이템 종류의 점수와 이유
export function scoreSlot(slot, c, looks = matchingLooks(c)) {
  const st = styleScore(slot, c.styles);
  let score = st * 2;
  const reasons = [];
  const inSeason = slot.seasons.includes(c.season);
  score += inSeason ? 2 : -6;
  if (c.occasion) score += slot.occ.includes(c.occasion) ? 2.5 : -2;

  const pairs = new Set();
  let lookCount = 0;
  for (const look of looks) {
    const ids = slotsInLook(look);
    if (!ids.includes(slot.id)) continue;
    lookCount += 1;
    for (const other of ids) if (other !== slot.id && c.ownedSlots.has(other) && SLOT_BY_ID[other].cat !== slot.cat) pairs.add(other);
  }
  score += Math.min(lookCount, 3);
  score += Math.min(pairs.size, 4) * 1.5;

  if (pairs.size) {
    const names = [...pairs].slice(0, 2).map((id) => shortName(SLOT_BY_ID[id]));
    const last = names[names.length - 1];
    reasons.push(`가진 ${names.join('·')}${josa(last, '과', '와')} 바로 입을 수 있어요`);
  }
  const top = c.styles.find((s) => slot.style[s] === 3);
  if (top) reasons.push(`${STYLES[top].label} 옷장의 기본이에요`);
  if (c.occasion && slot.occ.includes(c.occasion)) reasons.push(`${OCCASIONS[c.occasion]}에 잘 맞아요`);
  return { score, reasons, pairs: [...pairs], inSeason };
}

const CAT_LIMIT = { acc: 1 };

// 지금 사면 좋은 아이템
export function recommendItems(state, { limit = 8 } = {}) {
  const c = ctx(state);
  const looks = matchingLooks(c);
  const ranked = SLOTS.filter((s) => s.g === c.gender && !c.ownedSlots.has(s.id))
    .map((slot) => ({ slot, ...scoreSlot(slot, c, looks) }))
    .filter((r) => r.inSeason && r.score > 3)
    .sort((a, b) => b.score - a.score);

  const out = [];
  const perCat = {};
  const perBrand = {};
  for (const r of ranked) {
    const products = productsFor(r.slot.id, productOpts(c));
    if (!products.length) continue;
    if ((perCat[r.slot.cat] || 0) >= (CAT_LIMIT[r.slot.cat] ?? 2)) continue;
    perCat[r.slot.cat] = (perCat[r.slot.cat] || 0) + 1;
    // 선호 브랜드가 없으면 한 브랜드가 목록을 채우지 않도록 두 번까지만 먼저 고른다
    const product = c.brands.size ? products[0] : products.find((p) => (perBrand[p.brand] || 0) < 2) || products[0];
    perBrand[product.brand] = (perBrand[product.brand] || 0) + 1;
    const pair = r.reasons.find((x) => x.startsWith('가진 '));
    const reasons = pair ? [pair, r.slot.why] : [r.slot.why, ...r.reasons];
    out.push({ slot: r.slot, product, alternatives: products.filter((p) => p !== product).slice(0, 6), score: r.score, reasons: reasons.slice(0, 2) });
    if (out.length >= limit) break;
  }
  return out;
}

// 코디 공식의 역할을 가진 옷과 상품으로 채운다
// ownedOnly: 가진 옷만으로, maxBuy: 새로 살 아이템 수 한도, forceOwned: 검색의 기준 아이템(가진 것으로 취급)
export function fillLook(look, c, { forceOwned = new Set(), ownedOnly = false, maxBuy = Infinity, anchorItem = null } = {}) {
  const items = [];
  const tonal = c.styles[0] === 'minimal' || look.styles[0] === 'minimal';
  let buys = 0;
  for (const role of ROLE_ORDER) {
    const r = roleOf(look, role);
    if (!r) continue;
    const optional = role === 'acc' || (role === 'inner' && ownedOnly);
    const inSeason = r.s.filter((id) => SLOT_BY_ID[id].seasons.includes(c.season));
    const current = items.map((i) => ({ color: i.color, cat: i.slot.cat }));

    // 1) 기준 아이템 · 가진 옷
    if (anchorItem && r.s.includes(anchorItem.slot)) {
      items.push({ role, slot: SLOT_BY_ID[anchorItem.slot], owned: true, item: anchorItem, color: anchorItem.color });
      continue;
    }
    const forced = r.s.find((id) => forceOwned.has(id));
    if (forced) {
      items.push({ role, slot: SLOT_BY_ID[forced], owned: true, item: null, color: SLOT_BY_ID[forced].colors[0] });
      continue;
    }
    const ownedItems = c.closet.filter((i) => r.s.includes(i.slot));
    if (ownedItems.length) {
      const best = ownedItems
        .map((i) => ({ i, s: harmony([...current, { color: i.color, cat: SLOT_BY_ID[i.slot].cat }], { tonal }) + (r.c.includes(i.color) ? 1 : 0) - r.s.indexOf(i.slot) * 0.3 }))
        .sort((a, b) => b.s - a.s)[0].i;
      items.push({ role, slot: SLOT_BY_ID[best.slot], owned: true, item: best, color: best.color });
      continue;
    }
    const legacy = r.s.find((id) => c.ownedSlots.has(id));
    if (legacy) {
      items.push({ role, slot: SLOT_BY_ID[legacy], owned: true, item: null, color: SLOT_BY_ID[legacy].colors[0] });
      continue;
    }
    if (!inSeason.length) continue; // 이 계절엔 필요 없는 역할(예: 여름 아우터)
    if (ownedOnly || buys >= maxBuy) {
      if (optional) continue;
      return null;
    }

    // 2) 상품: 품질·권장 색·색 조화·선호 브랜드를 함께 본다
    let best = null;
    inSeason.forEach((id, order) => {
      for (const p of productsFor(id, productOpts(c)).slice(0, 10)) {
        const s = quality(p) / 5 + (r.c.includes(p.color) ? 1.5 : 0) + harmony([...current, { color: p.color, cat: SLOT_BY_ID[id].cat }], { tonal })
          + (c.brands.has(p.brand) ? 2 : 0) - order * 0.4;
        if (!best || s > best.s) best = { s, p, id };
      }
    });
    if (best) {
      items.push({ role, slot: SLOT_BY_ID[best.id], owned: false, product: best.p, color: best.p.color });
      buys += 1;
    } else if (!optional) return null;
  }
  const buy = items.filter((i) => !i.owned);
  return {
    look,
    items,
    ownedCount: items.length - buy.length,
    buyCount: buy.length,
    buyTotal: buy.reduce((sum, i) => sum + i.product.price, 0),
    harmony: harmony(items.map((i) => ({ color: i.color, cat: i.slot.cat })), { tonal }),
  };
}

function rankLooks(results, c) {
  return results
    .filter(Boolean)
    .map((r) => {
      const styleScoreLook = c.styles.indexOf(r.look.styles.find((s) => c.styles.includes(s)));
      const styleBonus = styleScoreLook === 0 ? 2 : 1;
      const occBonus = c.occasion && r.look.occ[0] === c.occasion ? 1.5 : 0;
      const ownedBonus = (r.ownedCount / r.items.length) * 4;
      return { ...r, score: styleBonus + occBonus + ownedBonus + r.harmony * 0.5 };
    })
    .sort((a, b) => b.score - a.score || a.buyTotal - b.buyTotal);
}

// 오늘의 코디 (사야 할 상품 포함)
export function recommendLooks(state, { limit = 3, forceOwned = [], occasion, anchorItem = null } = {}) {
  const c = ctx(state);
  const force = new Set(forceOwned);
  let looks = matchingLooks(c, { occasion: occasion ?? c.occasion });
  if (!looks.length) looks = matchingLooks(c, { occasion: null });
  if (force.size) looks = looks.filter((l) => slotsInLook(l).some((id) => force.has(id)));
  if (anchorItem) looks = looks.filter((l) => slotsInLook(l).includes(anchorItem.slot));
  return rankLooks(looks.map((look) => fillLook(look, c, { forceOwned: force, anchorItem })), c).slice(0, limit);
}

// 내 옷장: 가진 옷만으로 되는 코디와, 하나만 사면 되는 코디
export function closetLooks(state, { limit = 3 } = {}) {
  const c = ctx(state);
  const looks = matchingLooks(c, { occasion: null });
  const ready = rankLooks(looks.map((l) => fillLook(l, c, { ownedOnly: true })), c).slice(0, limit);
  const readyIds = new Set(ready.map((r) => r.look.id));
  const almost = rankLooks(looks.filter((l) => !readyIds.has(l.id)).map((l) => fillLook(l, c, { maxBuy: 1 })), c)
    .filter((r) => r.buyCount === 1 && r.ownedCount >= 2)
    .slice(0, limit);
  return { ready, almost };
}

// 고른 스타일의 기본 아이템을 가졌는지
export function essentials(state) {
  const c = ctx(state);
  return SLOTS.filter((s) => s.g === c.gender && styleScore(s, c.styles) >= 3 && s.cat !== 'acc')
    .map((slot) => ({ slot, owned: c.ownedSlots.has(slot.id) }));
}

// 한 줄 검색: "출근용 셔츠 10만원 이하", "청바지에 어울리는 신발", "폴로 니트"
export function search(state, text) {
  const brandNames = brandsFor(state.gender || 'M').map((b) => b.name);
  const q = parseQuery(text, { brands: brandNames });
  const c = ctx({
    ...state,
    gender: q.gender || state.gender,
    styles: q.style ? [q.style, ...(state.styles || [])] : state.styles,
    occasion: q.occasion || state.occasion || null,
    season: q.season || state.season,
    budget: q.maxPrice ?? state.budget,
    brandOnly: q.brand ? false : state.brandOnly,
  });

  const genderSlots = SLOTS.filter((s) => s.g === c.gender);
  const anchors = genderSlots.filter((s) => q.anchorMatch(s));
  let targets = genderSlots.filter((s) => q.targetMatch(s));
  if (!targets.length && anchors.length) targets = genderSlots.filter((s) => !anchors.some((a) => a.cat === s.cat));
  const understood = q.terms.length > 0;
  if (!targets.length) targets = genderSlots;

  const looks = LOOKS.filter((l) => l.g === c.gender);
  const anchorIds = new Set(anchors.map((a) => a.id));
  const results = [];
  for (const slot of targets) {
    if (anchorIds.has(slot.id)) continue;
    const base = scoreSlot(slot, { ...c, ownedSlots: new Set([...c.ownedSlots, ...anchorIds]) }, matchingLooks(c, { occasion: null }));
    let score = base.score;
    let reasons = [slot.why, ...base.reasons].slice(0, 2);
    if (anchors.length) {
      const a = shortName(anchors[0]);
      reasons = [`${a}${josa(a, '과', '와')} 잘 어울려요`, ...base.reasons.filter((r) => !r.startsWith('가진 '))].slice(0, 2);
      const together = looks.filter((l) => slotsInLook(l).includes(slot.id) && slotsInLook(l).some((id) => anchorIds.has(id))).length;
      score += together * 3;
      if (!together) score -= 4;
    }
    // 계절을 말했으면 그 계절 옷만, 아이템을 콕 집었으면 계절이 지나도 보여 준다
    if (!base.inSeason && (q.season || !q.slotNamed)) continue;
    let products = productsFor(slot.id, { ...productOpts(c), color: q.color, brand: q.brand, season: q.season || (q.slotNamed ? null : c.season) });
    if (q.premium) products = [...products].sort((a, b) => b.price - a.price);
    products.slice(0, q.brand ? 6 : 3).forEach((product, i) => {
      results.push({ slot, product, score: score - i * 1.2 + quality(product) * 0.3, reasons });
    });
  }
  results.sort((a, b) => b.score - a.score);

  const items = results.slice(0, 16);
  const outfit = anchors.length || c.occasion
    ? recommendLooks({ ...state, gender: c.gender, styles: c.styles, season: c.season, budget: c.maxPrice, occasion: c.occasion }, { limit: 1, forceOwned: [...anchorIds] })[0] || null
    : null;
  return { query: q, understood, items, outfit, season: c.season, gender: c.gender };
}
