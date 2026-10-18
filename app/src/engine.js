// 추천 엔진: 스타일·상황·계절·예산·선호 브랜드·내 옷장으로 실제 상품과 코디를 고른다.
// 같은 입력이면 같은 결과가 나오는 규칙 기반 계산이며, 개인 정보는 이 기기 밖으로 나가지 않는다.

import { SLOTS, SLOT_BY_ID, STYLES, OCCASIONS, COLORS } from './data/slots.js';
import { LOOKS, ROLE_ORDER } from './data/looks.js';
import { PRODUCTS } from './data/products.js';
import { parseQuery } from './query.js';
import { garmentMatchesSlot, garmentLabel, garmentSlotStatus, wardrobeSlotStatus, slotForItem } from './wardrobe.js';
import { productEligible, evidenceColor } from './catalog-policy.js';
import { inactivePurchaseGarmentIds } from './purchase-journey.js';
export const SAFE_PRODUCTS = PRODUCTS.filter(productEligible);

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

const PRODUCTS_BY_SLOT = SAFE_PRODUCTS.reduce((acc, p) => {
  (acc[p.slot] ||= []).push(p);
  return acc;
}, {});
export const PRODUCT_BY_ID = Object.fromEntries(PRODUCTS.map((p) => [p.id, p]));

// 브랜드 목록: 성별마다 상품 수가 많은 순서
export function brandsFor(gender) {
  const counts = {};
  for (const p of SAFE_PRODUCTS) if (SLOT_BY_ID[p.slot].g === gender) counts[p.brand] = (counts[p.brand] || 0) + 1;
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));
}

// 브랜드가 어떤 스타일에 가까운지: 그 브랜드 상품들이 속한 아이템 종류의 스타일 점수 평균
export function brandStyleAffinity(brand, gender, style) {
  const list = SAFE_PRODUCTS.filter((p) => p.brand === brand && SLOT_BY_ID[p.slot].g === gender);
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
  const inactivePurchaseItems = inactivePurchaseGarmentIds(state);
  const styles = (state.styles?.length ? state.styles : [state.style || 'classic']).filter((s) =>
    STYLES[s]?.g.includes(gender),
  );
  const closet = (state.closet || [])
    .map((i) => ({ ...i, gender: i.gender || SLOT_BY_ID[i.slot]?.g }))
    .filter((i) => i.gender === gender && !inactivePurchaseItems.has(i.id));
  const activeGarmentIds = new Set(closet
    .filter((item) => ['user', 'legacy'].includes(item.source) && !String(item.id).startsWith('demo_'))
    .map((item) => item.id));
  // An order/receipt is a reason to pause another purchase of the same type,
  // not proof of an owned garment. It never enters closet or fills a look.
  const pendingSlots = new Set((state.journeys || [])
    .filter((journey) => ['ordered', 'received'].includes(journey.stage) &&
      journey.candidate?.gender?.toUpperCase() === gender)
    .flatMap((journey) => {
      const candidate = journey.candidate;
      const knownColor = evidenceColor(candidate);
      return SLOTS.filter((slot) => slot.g === gender &&
        slot.shape === candidate.kind &&
        (!slot.requiredColors || slot.requiredColors.includes(knownColor)))
        .map((slot) => slot.id);
    }));
  // An unlinked "I have something similar" answer belongs to that candidate's
  // comparison. Only an active actual garment link can affect other home or
  // automatic outfit purchases; the answer itself never creates an owned role.
  const ownershipCheckSlots = new Set((state.journeys || [])
    .filter((journey) => {
      if (journey.absence !== 'present' || journey.candidate?.gender?.toUpperCase() !== gender) return false;
      const linkedIds = new Set([
        ...(journey.relatedGarmentIds || []),
        ...(journey.replacementGarmentId ? [journey.replacementGarmentId] : []),
      ]);
      // Missing, demo, retired and returned records cannot establish current
      // ownership for another candidate. Keep the journey answer unchanged.
      return [...linkedIds].some((id) => activeGarmentIds.has(id));
    })
    .flatMap((journey) => {
      const candidate = journey.candidate;
      const knownColor = evidenceColor(candidate);
      return SLOTS.filter((slot) => slot.g === gender && slot.shape === candidate.kind &&
        (!slot.requiredColors || slot.requiredColors.includes(knownColor)) &&
        wardrobeSlotStatus(closet, slot) !== 'confirmed').map((slot) => slot.id);
    }));
  return {
    gender,
    styles: styles.length ? styles : [gender === 'F' ? 'classic' : 'classic'],
    occasion: state.occasion || null,
    season: state.season || seasonOf(state.now ? new Date(state.now) : new Date()),
    maxPrice: state.budget ?? null,
    minPrice: state.minPrice ?? null,
    minPriceExclusive: !!state.minPriceExclusive,
    maxPriceExclusive: !!state.maxPriceExclusive,
    closet,
    pendingSlots,
    ownershipCheckSlots,
    ownedSlots: new Set([
      ...SLOTS.filter((s) => wardrobeSlotStatus(closet, s) === 'confirmed').map((s) => s.id),
      ...(state.owned || []),
    ]),
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

export function productsFor(
  slotId,
  {
    maxPrice = null,
    minPrice = null,
    minPriceExclusive = false,
    maxPriceExclusive = false,
    hidden = new Set(),
    color = null,
    brands = new Set(),
    brandOnly = false,
    season = null,
    brand = null,
  } = {},
) {
  const hide = hidden instanceof Set ? hidden : new Set(hidden);
  return (PRODUCTS_BY_SLOT[slotId] || [])
    .filter(
      (p) =>
        !hide.has(p.id) &&
        (maxPrice === null || (maxPriceExclusive ? p.price < maxPrice : p.price <= maxPrice)) &&
        (minPrice === null || (minPriceExclusive ? p.price > minPrice : p.price >= minPrice)) &&
        (!color || evidenceColor(p) === color) &&
        (!brand || p.brand === brand) &&
        (!brandOnly || brands.has(p.brand)) &&
        (!season || season === 'summer' || !p.summer),
    )
    .sort((a, b) => brands.has(b.brand) - brands.has(a.brand) || quality(b) - quality(a) || a.price - b.price);
}

// 상품명에 편하게 입는 표기가 있으면 1, 뻣뻣하다는 표기면 -1. 착용감을 보장하지 않는다.
function comfortMark(p) {
  const name = `${p.name}`;
  if (/생지|리지드|rigid|셀비지|selvedge|raw/i.test(name)) return -1;
  return /밴딩|이지|easy|조거|스웨트|릴렉스|relax|와이드|wide|원턱/i.test(name) ? 1 : 0;
}

// 검색 조건(search().criteria)에 상품이 맞는지. 종류는 보지 않는다(상세의 같은 종류 대안에 쓴다).
export function meetsCriteria(p, cr) {
  if (!cr) return true;
  const { maxPrice = null, minPrice = null, minPriceExclusive = false, maxPriceExclusive = false } = cr;
  if (maxPrice !== null && maxPrice !== undefined && (maxPriceExclusive ? p.price >= maxPrice : p.price > maxPrice)) return false;
  if (minPrice !== null && minPrice !== undefined && (minPriceExclusive ? p.price <= minPrice : p.price < minPrice)) return false;
  if (cr.color && evidenceColor(p) !== cr.color) return false;
  if (cr.brand && p.brand !== cr.brand) return false;
  if ((cr.excludeColors || []).includes(p.color)) return false;
  if (cr.tone) {
    const l = COLORS[p.color]?.light;
    if (!Number.isFinite(l) || (cr.tone === 'light' ? l < 60 : l > 40)) return false;
  }
  return true;
}

const wonLabel = (n) => (n % 10000 === 0 ? `${n / 10000}만원` : `${n.toLocaleString('ko-KR')}원`);
// 검색 조건을 한 줄로: "10만원 이하 · 블랙 제외 · 밝은 색"
// 상품 하나에 거는 조건만(가격·색·뺀 색·브랜드). 같은 종류의 대안을 걸러낼 때 쓴다.
export function productCriteria(cr) {
  if (!cr) return null;
  const { occasion, occasionFromQuery, season, style, styles, excludedItems, excludeSlot, slotIds, ...rest } = cr;
  return rest;
}
export function criteriaLine(cr) {
  if (!cr) return '';
  const SEASONS = { spring: '봄', summer: '여름', fall: '가을', winter: '겨울' };
  return [
    cr.occasion ? OCCASIONS[cr.occasion] || '' : '',
    cr.season ? SEASONS[cr.season] || '' : '',
    cr.style ? STYLES[cr.style]?.label || '' : '',
    ...(cr.excludedItems || []).map((x) => `${x} 제외`),
    cr.minPrice != null ? `${wonLabel(cr.minPrice)} ${cr.minPriceExclusive ? '초과' : '이상'}` : '',
    cr.maxPrice != null ? `${wonLabel(cr.maxPrice)} ${cr.maxPriceExclusive ? '미만' : '이하'}` : '',
    cr.color ? COLORS[cr.color]?.label || '' : '',
    ...(cr.excludeColors || []).map((c) => `${COLORS[c]?.label || c} 제외`),
    cr.tone ? (cr.tone === 'light' ? '밝은 색' : '어두운 색') : '',
    cr.brand || '',
  ].filter(Boolean).join(' · ');
}

function productOpts(c, extra = {}) {
  return {
    maxPrice: c.maxPrice,
    minPrice: c.minPrice,
    minPriceExclusive: c.minPriceExclusive,
    maxPriceExclusive: c.maxPriceExclusive,
    hidden: c.hidden,
    brands: c.brands,
    brandOnly: c.brandOnly,
    season: c.season,
    ...extra,
  };
}

function roleOf(look, role) {
  const r = look.roles[role];
  if (!r) return null;
  return Array.isArray(r) ? { s: r, c: [] } : r;
}

function slotsInLook(look) {
  return ROLE_ORDER.flatMap((r) => roleOf(look, r)?.s || []);
}
// The wardrobe plan reuses the same formula slots and purchase exclusions as recommendations.
export function formulaSlots(look) {
  return slotsInLook(look);
}
export function recommendationContext(state) {
  return ctx(state);
}

export function matchingLooks(c, { occasion = c.occasion, anySeason = false } = {}) {
  return LOOKS.filter(
    (l) =>
      l.g === c.gender &&
      l.styles.some((s) => c.styles.includes(s)) &&
      (anySeason || l.seasons.includes(c.season)) &&
      (!occasion || l.occ.includes(occasion)),
  );
}

const SHORT = {
  'm-oxford': '옥스퍼드 셔츠',
  'm-chambray': '데님 셔츠',
  'm-flannel': '체크 셔츠',
  'm-tee': '티셔츠',
  'm-longtee': '긴팔 티',
  'm-denim-raw': '생지 데님',
  'm-denim': '청바지',
  'm-chino': '치노',
  'm-slacks': '슬랙스',
  'm-work-pants': '워크 팬츠',
  'm-knit': '니트',
  'm-cable': '케이블 니트',
  'm-loafer': '로퍼',
  'm-derby': '구두',
  'm-workboots': '워크부츠',
  'm-chelsea': '첼시 부츠',
  'm-white-sneaker': '흰 스니커즈',
  'm-canvas': '캔버스화',
  'm-runner': '운동화',
  'm-trail': '트레일 슈즈',
  'm-trucker': '데님 재킷',
  'm-chore': '워크 재킷',
  'm-field': '필드 재킷',
  'm-harrington': '블루종',
  'm-sweat': '맨투맨',
  'm-hoodie': '후드',
  'f-shirt': '셔츠',
  'f-denim': '청바지',
  'f-slacks': '슬랙스',
  'f-knit': '니트',
  'f-jacket': '데님 재킷',
  'f-flat': '플랫',
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

  const pairs = new Map();
  let lookCount = 0;
  for (const look of looks) {
    const ids = slotsInLook(look);
    if (!ids.includes(slot.id)) continue;
    lookCount += 1;
    for (const item of c.closet)
      if (
        ids.some((id) => id !== slot.id && SLOT_BY_ID[id].cat !== slot.cat && garmentMatchesSlot(item, SLOT_BY_ID[id]))
      )
        pairs.set(item.id, item);
  }
  score += Math.min(lookCount, 3);
  score += Math.min(pairs.size, 4) * 1.5;

  if (pairs.size) {
    const names = [...pairs.values()].slice(0, 2).map(garmentLabel);
    const last = names[names.length - 1];
    reasons.push(`가진 ${names.join('·')}${josa(last, '과', '와')} 함께 쓰는 코디 공식이 있어요`);
  }
  const top = c.styles.find((s) => slot.style[s] === 3);
  if (top) reasons.push(`${STYLES[top].label} 옷장의 기본이에요`);
  if (c.occasion && slot.occ.includes(c.occasion)) reasons.push(`${OCCASIONS[c.occasion]}에 잘 맞아요`);
  return { score, reasons, pairs: [...pairs.keys()], inSeason };
}

const CAT_LIMIT = { acc: 1 };

// 지금 사면 좋은 아이템
export function recommendItems(state, { limit = 8 } = {}) {
  const c = ctx(state);
  const looks = matchingLooks(c);
  const purchaseExcludedSlots = new Set([...c.ownedSlots, ...c.pendingSlots, ...c.ownershipCheckSlots,
    ...c.closet.filter((i) => realOwned(i) && i.slot).flatMap((i) => nearSame(i.slot))]);
  const ranked = SLOTS.filter((s) => s.g === c.gender && !purchaseExcludedSlots.has(s.id))
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
    const ownership = wardrobeSlotStatus(c.closet, r.slot);
    out.push({
      slot: r.slot,
      product,
      alternatives: products.filter((p) => p !== product).slice(0, 6),
      score: r.score,
      ownership,
      reasons:
        ownership === 'uncertain'
          ? [`비슷한 종류가 있어요. ${shortName(r.slot)}인지 먼저 확인해요`, ...reasons].slice(0, 2)
          : reasons.slice(0, 2),
    });
    if (out.length >= limit) break;
  }
  return out;
}

// 세부 종류만 다르고 사실상 같은 옷(예: 생지 데님과 워시드 데님). 하나를 가졌으면 다른 하나를 사라고 하지 않고 가진 옷으로 채운다.
const NEAR_SAME = [['m-denim', 'm-denim-raw']];
const nearSame = (slotId) => NEAR_SAME.find((group) => group.includes(slotId))?.filter((id) => id !== slotId) || [];
const realOwned = (i) => ['user', 'legacy'].includes(i.source) && !String(i.id).startsWith('demo_');

// 코디 공식의 역할을 가진 옷과 상품으로 채운다
// ownedOnly: 가진 옷만으로, maxBuy: 새로 살 아이템 수 한도.
// Search anchors only select formulas; they never create an owned garment.
export function fillLook(
  look,
  c,
  {
    forceOwned = new Set(),
    ownedOnly = false,
    maxBuy = Infinity,
    anchorItem = null,
    pinnedProduct = null,
    anchorColor = null,
    allowPendingPurchases = false,
    requestedPurchaseSlots = null,
    excludeSlot = null,
  } = {},
) {
  const items = [],
    used = new Set();
  const tonal = c.styles[0] === 'minimal' || look.styles[0] === 'minimal';
  let buys = 0;
  for (const role of ROLE_ORDER) {
    const r = roleOf(look, role);
    if (!r) continue;
    const optional = role === 'acc' || (role === 'inner' && ownedOnly);
    const anchorChoices = r.s.filter((id) => forceOwned.has(id));
    let candidates =
      anchorChoices.length && !items.some((i) => anchorChoices.includes(i.slot.id)) ? anchorChoices : r.s;
    // 검색에서 뺀 종류는 이 역할의 후보에서도 뺀다. 그 역할을 채울 종류가 없으면 이 공식은 쓰지 않는다.
    if (excludeSlot) {
      candidates = candidates.filter((id) => !excludeSlot(SLOT_BY_ID[id]));
      if (!candidates.length && !optional) return null;
      if (!candidates.length) continue;
    }
    const inSeason = candidates.filter((id) => SLOT_BY_ID[id].seasons.includes(c.season));
    const current = items.map((i) => ({ color: i.color, cat: i.slot.cat }));

    // 1) 기준 아이템 · 가진 옷
    if (pinnedProduct && candidates.includes(pinnedProduct.slot)) {
      const ownedPin = c.closet.find(
        (i) => i.productId === pinnedProduct.id && (!anchorColor || i.color === anchorColor),
      );
      if (ownedPin) {
        const slot = SLOT_BY_ID[pinnedProduct.slot];
        const certainty = garmentSlotStatus(ownedPin, slot);
        if (used.has(ownedPin.id) || certainty === 'missing' || (ownedOnly && certainty !== 'confirmed')) return null;
        items.push({ role, slot, owned: true, item: ownedPin, color: ownedPin.color, certainty });
        used.add(ownedPin.id);
        continue;
      }
      if (ownedOnly || buys >= maxBuy) return null;
      items.push({
        role,
        slot: SLOT_BY_ID[pinnedProduct.slot],
        owned: false,
        product: pinnedProduct,
        color: evidenceColor(pinnedProduct),
      });
      buys++;
      continue;
    }
    if (
      anchorItem &&
      !used.has(anchorItem.id) &&
      candidates.some((id) => garmentMatchesSlot(anchorItem, SLOT_BY_ID[id]))
    ) {
      const id = candidates.find((id) => garmentMatchesSlot(anchorItem, SLOT_BY_ID[id]));
      const certainty = garmentSlotStatus(anchorItem, SLOT_BY_ID[id]);
      if (ownedOnly && certainty !== 'confirmed') return null;
      items.push({ role, slot: SLOT_BY_ID[id], owned: true, item: anchorItem, color: anchorItem.color, certainty });
      used.add(anchorItem.id);
      continue;
    }
    const ownedItems = c.closet
      .filter(
        (i) =>
          !used.has(i.id) &&
          candidates.some(
            (id) =>
              garmentMatchesSlot(i, SLOT_BY_ID[id]) &&
              (!ownedOnly || garmentSlotStatus(i, SLOT_BY_ID[id]) === 'confirmed'),
          ),
      )
      .map((i) => ({ ...i, matchedSlot: i.slot || candidates.find((id) => garmentMatchesSlot(i, SLOT_BY_ID[id])) }));
    if (ownedItems.length) {
      const best = ownedItems
        .map((i) => ({
          i,
          s:
            harmony([...current, { color: i.color, cat: SLOT_BY_ID[i.matchedSlot].cat }], { tonal }) +
            (r.c.includes(i.color) ? 1 : 0) +
            (i.slot ? 3 : 0) -
            r.s.indexOf(i.matchedSlot) * 0.3,
        }))
        .sort((a, b) => b.s - a.s)[0].i;
      items.push({
        role,
        slot: SLOT_BY_ID[best.matchedSlot],
        owned: true,
        item: best,
        color: best.color,
        certainty: garmentSlotStatus(best, SLOT_BY_ID[best.matchedSlot]),
      });
      used.add(best.id);
      continue;
    }
    // 비슷한 세부 종류를 가졌으면 그 옷으로 채운다(같은 옷을 또 사라고 하지 않는다).
    const twin = c.closet.find((i) => !used.has(i.id) && realOwned(i) && i.slot &&
      candidates.some((id) => nearSame(id).includes(i.slot)) &&
      (!ownedOnly || garmentSlotStatus(i, SLOT_BY_ID[i.slot]) === 'confirmed'));
    if (twin) {
      items.push({ role, slot: SLOT_BY_ID[twin.slot], owned: true, item: twin, color: twin.color, certainty: garmentSlotStatus(twin, SLOT_BY_ID[twin.slot]) });
      used.add(twin.id);
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
      const explicitlyRequested = allowPendingPurchases && (!requestedPurchaseSlots || requestedPurchaseSlots.has(id));
      if (!explicitlyRequested && (c.pendingSlots?.has(id) || c.ownershipCheckSlots?.has(id))) return;
      for (const p of productsFor(id, productOpts(c)).slice(0, 10)) {
        const s =
          quality(p) / 5 +
          (r.c.includes(evidenceColor(p)) ? 1.5 : 0) +
          harmony([...current, { color: evidenceColor(p), cat: SLOT_BY_ID[id].cat }], { tonal }) +
          (c.brands.has(p.brand) ? 2 : 0) -
          order * 0.4;
        if (!best || s > best.s) best = { s, p, id };
      }
    });
    if (best) {
      items.push({ role, slot: SLOT_BY_ID[best.id], owned: false, product: best.p, color: evidenceColor(best.p) });
      buys += 1;
    } else if (!optional) return null;
  }
  const buy = items.filter((i) => !i.owned);
  if (pinnedProduct && !items.some((i) => i.product?.id === pinnedProduct.id || i.item?.productId === pinnedProduct.id))
    return null;
  if (anchorItem && !items.some((i) => i.owned && i.item?.id === anchorItem.id)) return null;
  const requiredCats = [...new Set([...forceOwned].map((id) => SLOT_BY_ID[id]?.cat))];
  if (requiredCats.some((cat) => !items.some((i) => i.slot.cat === cat && forceOwned.has(i.slot.id)))) return null;
  return {
    look,
    items,
    ownedCount: items.length - buy.length,
    uncertainCount: items.filter((i) => i.owned && i.certainty === 'uncertain').length,
    buyCount: buy.length,
    buyTotal: buy.reduce((sum, i) => sum + i.product.price, 0),
    harmony: harmony(
      items.map((i) => ({ color: i.color, cat: i.slot.cat })),
      { tonal },
    ),
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
export function recommendLooks(
  state,
  { limit = 3, forceOwned = [], occasion, anchorItem = null, pinnedProduct = null, anchorColor = null,
    allowPendingPurchases = false, requestedPurchaseSlots = null, anySeason = false, anyStyle = false,
    // strictOccasion: 상황에 맞는 공식이 없어도 상황 없는 공식으로 바꾸지 않는다(검색 조건을 몰래 풀지 않기).
    // excludeSlot: 검색에서 뺀 종류("셔츠 말고")는 코디의 다른 자리에도 쓰지 않는다.
    strictOccasion = false, excludeSlot = null } = {},
) {
  if (pinnedProduct && !productEligible(pinnedProduct)) return [];
  const base = ctx(state);
  // A widened search (every season and style of this gender) is for "what can I wear with what I own",
  // never for buying advice; callers label those looks as outside the current season/style.
  const c = anyStyle ? { ...base, styles: Object.keys(STYLES).filter((k) => STYLES[k].g.includes(base.gender)) } : base;
  const force = new Set(forceOwned);
  let looks = matchingLooks(c, { occasion: occasion ?? c.occasion, anySeason });
  if (!looks.length && !strictOccasion) looks = matchingLooks(c, { occasion: null, anySeason });
  if (force.size) {
    const cats = [...new Set([...force].map((id) => SLOT_BY_ID[id]?.cat))];
    looks = looks.filter((l) =>
      cats.every((cat) => slotsInLook(l).some((id) => force.has(id) && SLOT_BY_ID[id].cat === cat)),
    );
  }
  if (anchorItem)
    looks = looks.filter((l) => slotsInLook(l).some((id) => garmentMatchesSlot(anchorItem, SLOT_BY_ID[id])));
  if (pinnedProduct) looks = looks.filter((l) => slotsInLook(l).includes(pinnedProduct.slot));
  return rankLooks(
    looks.map((look) => fillLook(look, c, { forceOwned: force, anchorItem, pinnedProduct, anchorColor, excludeSlot,
      allowPendingPurchases: allowPendingPurchases || !!pinnedProduct,
      requestedPurchaseSlots: requestedPurchaseSlots || (pinnedProduct ? new Set([pinnedProduct.slot]) : null) })),
    c,
  ).slice(0, limit);
}

// 내 옷장: 가진 옷만으로 되는 코디와, 하나만 사면 되는 코디
export function closetLooks(state, { limit = 3 } = {}) {
  const c = ctx(state);
  const looks = matchingLooks(c, { occasion: null });
  const ready = rankLooks(
    looks.map((l) => fillLook(l, c, { ownedOnly: true })),
    c,
  ).slice(0, limit);
  const readyIds = new Set(ready.map((r) => r.look.id));
  const almost = rankLooks(
    looks.filter((l) => !readyIds.has(l.id)).map((l) => fillLook(l, c, { maxBuy: 1 })),
    c,
  )
    .filter((r) => r.buyCount === 1 && r.ownedCount >= 2 && r.uncertainCount === 0)
    .slice(0, limit);
  return { ready, almost };
}

// 가진 옷 기본 조합: 코디 공식(LOOKS)에 없어도 가진 옷으로 입을 수 있는 상의+하의+신발(또는 원피스+신발),
// 겉옷이 있으면 하나 더한다. 종류와 색 조화만 본 조합이라 구매 추천·부족한 옷 판단에는 쓰지 않는다.
export function basicOutfits(state, { anchorItem = null, limit = 2 } = {}) {
  const c = ctx(state);
  const owned = c.closet.filter((i) => ['user', 'legacy'].includes(i.source) && !String(i.id).startsWith('demo_'));
  const cat = (i) => slotForItem(i).cat;
  const pick = (k) => (anchorItem && cat(anchorItem) === k ? [anchorItem] : owned.filter((i) => cat(i) === k)).slice(0, 8);
  const shoes = pick('shoes'), outers = [null, ...pick('outer')];
  const bases = anchorItem && cat(anchorItem) === 'dress'
    ? [[anchorItem]]
    : [...pick('top').flatMap((t) => pick('bottom').map((b) => [t, b])),
       ...(anchorItem && !['top', 'bottom'].includes(cat(anchorItem)) ? pick('dress').map((d) => [d]) : [])];
  const out = [];
  for (const base of bases) for (const shoe of shoes) for (const outer of outers) {
    const items = [outer, ...base, shoe].filter(Boolean);
    if (anchorItem && !items.includes(anchorItem)) continue;
    const entries = items.map((i) => ({ color: i.color, cat: cat(i) }));
    out.push({ items, score: harmony(entries) + (outer ? 0.2 : 0) - items.filter((i) => !i.color).length * 0.5 });
  }
  out.sort((a, b) => b.score - a.score);
  const seen = new Set();
  return out.filter(({ items }) => {
    const key = items.filter((i) => cat(i) !== 'outer').map((i) => i.id).join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, limit).map(({ items }, n) => ({
    look: { id: `basic-${n}`, title: `가진 옷 기본 조합 ${n + 1}`, note: '코디 공식이 아니라 종류와 색이 어울리는 기본 조합이에요.' },
    items: items.map((i) => ({ role: cat(i) === 'dress' ? 'top' : cat(i), slot: slotForItem(i), owned: true, item: i, color: i.color, certainty: 'confirmed' })),
    ownedCount: items.length, buyCount: 0, buyTotal: 0, uncertainCount: 0, basic: true,
  }));
}

// 고른 스타일의 기본 아이템을 가졌는지
export function essentials(state) {
  const c = ctx(state);
  return SLOTS.filter((s) => s.g === c.gender && styleScore(s, c.styles) >= 3 && s.cat !== 'acc').map((slot) => ({
    slot,
    owned: wardrobeSlotStatus(c.closet, slot) === 'confirmed',
    needsCheck: wardrobeSlotStatus(c.closet, slot) === 'uncertain' || c.pendingSlots.has(slot.id) || c.ownershipCheckSlots.has(slot.id),
    pending: c.pendingSlots.has(slot.id),
    ownershipCheck: c.ownershipCheckSlots.has(slot.id),
  }));
}

// 한 줄 검색: "출근용 셔츠 10만원 이하", "청바지에 어울리는 신발", "폴로 니트"
// drop: 사용자가 칩의 ×로 직접 뺀 조건 키(occasion·season·style·color·price·exclude·tone·brand).
// 자동으로 빼지 않는다. 뺀 조건은 결과의 dropped로 돌려줘 화면에 보인다.
export function search(state, text, { anchorItemId = null, drop = [] } = {}) {
  const brandNames = [...new Set(SAFE_PRODUCTS.map((p) => p.brand))];
  const dropped = new Set(drop);
  const q = { ...parseQuery(text, { brands: brandNames }) };
  if (dropped.has('occasion')) q.occasion = null;
  if (dropped.has('season')) q.season = null;
  if (dropped.has('style')) q.style = null;
  if (dropped.has('color')) q.color = null;
  if (dropped.has('tone')) q.tone = null;
  if (dropped.has('brand')) q.brand = null;
  if (dropped.has('comfort')) q.comfort = false;
  if (dropped.has('exclude')) {
    q.excludeColors = [];
    q.excludedItems = [];
    q.excludeMatch = () => false;
  }
  if (dropped.has('price')) {
    q.maxPrice = null;
    q.minPrice = null;
    q.minPriceExclusive = false;
    q.maxPriceExclusive = false;
  }
  // 말한 종류가 성별 기본값보다 먼저다. 성별을 말하지 않았고 그 종류가 다른 성별에만 있으면
  // 그 성별에서 찾고 화면에 알린다(종류를 바꿔 채우지 않는다).
  const baseGender = q.gender || state.gender || 'M';
  const kindIn = (g) => SLOTS.some((s) => s.g === g && q.targetMatch(s) && !q.excludeMatch(s));
  const otherGender = baseGender === 'M' ? 'F' : 'M';
  const genderFromKind = q.slotNamed && !q.gender && !kindIn(baseGender) && kindIn(otherGender) ? otherGender : null;
  const c = ctx({
    ...state,
    // 예시 옷은 실제 보유 근거가 아니다: 검색에서는 옷장이 없는 것으로 본다.
    closet: state.demo ? [] : state.closet,
    gender: genderFromKind || baseGender,
    // 이번 요청에서 말한 스타일이 저장된 취향보다 먼저다.
    styles: q.style ? [q.style] : state.styles,
    occasion: q.occasion || (dropped.has('occasion') ? null : state.occasion) || null,
    season: q.season || state.season,
    budget: q.maxPrice ?? (dropped.has('price') ? null : state.budget),
    minPrice: q.minPrice,
    minPriceExclusive: q.minPriceExclusive,
    maxPriceExclusive: q.maxPriceExclusive,
    brandOnly: q.brand ? false : state.brandOnly,
  });

  const genderSlots = SLOTS.filter((s) => s.g === c.gender);
  const selectedAnchor = anchorItemId !== null;
  let anchorUnavailable = null;
  let anchorItem = null;
  let anchorProduct = null;
  let anchors = genderSlots.filter((s) => q.anchorMatch(s));
  if (selectedAnchor) {
    anchorItem = !state.demo
      ? c.closet.find((i) => i.id === anchorItemId && i.source !== 'demo' && !i.id.startsWith('demo_')) || null
      : null;
    if (anchorItem) anchors = genderSlots.filter((s) => garmentMatchesSlot(anchorItem, s));
    if (!anchorItem || !anchors.length) {
      anchorItem = null;
      anchors = [];
      anchorUnavailable = '선택한 옷을 현재 옷장에서 확인할 수 없어요. 옷장에서 다시 선택해 주세요.';
    }
  } else if (anchors.length) {
    anchorItem =
      c.closet
        .filter(
          (i) => anchors.some((slot) => garmentMatchesSlot(i, slot)) && (!q.anchorColor || i.color === q.anchorColor),
        )
        .sort((a, b) => Number(!!b.slot) - Number(!!a.slot) || a.id.localeCompare(b.id))[0] || null;
    if (q.anchorColor && !anchorItem) {
      anchorProduct =
        anchors.flatMap((slot) =>
          productsFor(slot.id, {
            ...productOpts(c),
            color: q.anchorColor,
            season: q.season || null,
          }),
        )[0] || null;
      if (anchorProduct) anchors = anchors.filter((slot) => slot.id === anchorProduct.slot);
      else anchorUnavailable = '요청한 기준 옷의 색을 확인할 수 있는 옷장 기록이나 상품이 없어요.';
    }
  }
  let targets = genderSlots.filter((s) => q.targetMatch(s) && !q.excludeMatch(s));
  // 종류를 말했는데 이 성별 상품에 그 종류가 없으면 다른 종류로 채우지 않고 0건으로 둔다.
  const kindUnavailable = q.slotNamed && !targets.length ? q.targetLabels.join('·') : null;
  const kindNowhere = !!kindUnavailable && !kindIn(otherGender);
  if (!q.slotNamed && !targets.length && anchors.length)
    targets = genderSlots.filter((s) => !anchors.some((a) => a.cat === s.cat));
  const understood = q.terms.length > 0 || !!anchorItem;
  if (!q.slotNamed && !targets.length) targets = genderSlots.filter((s) => !q.excludeMatch(s));
  // 말한 스타일에 맞는 자리만 남긴다(맞는 자리가 하나도 없으면 그대로 둔다).
  if (q.style) {
    const styled = targets.filter((s) => (s.style[q.style] || 0) >= 2);
    if (styled.length) targets = styled;
  }
  // 색을 빼거나 밝기를 말했으면 그 조건에 맞는 상품만 남긴다(맞는 게 없으면 조건을 풀지 않고 0건으로 둔다).
  const toneOK = (p) => {
    if (q.excludeColors.includes(p.color)) return false;
    if (!q.tone) return true;
    const l = COLORS[p.color]?.light;
    return Number.isFinite(l) && (q.tone === 'light' ? l >= 60 : l <= 40);
  };

  const looks = LOOKS.filter((l) => l.g === c.gender);
  const anchorIds = new Set(anchors.map((a) => a.id));
  // 카드 이유의 첫 줄은 이 요청에서 실제로 맞춘 조건이다(종류별 고정 문구는 둘째 줄).
  const SEASONS = { spring: '봄', summer: '여름', fall: '가을', winter: '겨울' };
  const matched = [
    q.style ? STYLES[q.style]?.label : '',
    c.occasion ? OCCASIONS[c.occasion] : '',
    q.season ? SEASONS[q.season] : '',
    criteriaLine({ maxPrice: c.maxPrice, minPrice: c.minPrice, minPriceExclusive: c.minPriceExclusive,
      maxPriceExclusive: c.maxPriceExclusive, color: q.color, excludeColors: q.excludeColors, tone: q.tone, brand: q.brand }),
  ].filter(Boolean).join(' · ');
  const results = [];
  for (const slot of targets) {
    if (anchorIds.has(slot.id)) continue;
    const base = scoreSlot(slot, { ...c, ownedSlots: c.ownedSlots }, matchingLooks(c, { occasion: null }));
    let score = base.score;
    // "편한": 생지·리지드처럼 뻣뻣하다고 알려진 종류는 뒤로.
    if (q.comfort && slot.id === 'm-denim-raw') score -= 4;
    // 요청한 상황에 맞지 않는 종류는 따로 묶는다(섞어서 같은 줄에 보이지 않게).
    const offOccasion = !!c.occasion && !slot.occ.includes(c.occasion);
    let reasons = matched ? [`${matched}에 맞춰 골랐어요`, slot.why] : [slot.why, ...base.reasons].slice(0, 2);
    if (offOccasion) reasons = [`${OCCASIONS[c.occasion]}보다 캐주얼한 종류예요`, slot.why];
    // 요청에서 말한 스타일에 더 가까운 아이템이 앞선다.
    if (q.style) {
      score += (slot.style[q.style] || 0) * 1.5;
      if (!matched) reasons = [`${STYLES[q.style].label} 코디에 쓰는 ${shortName(slot)}`, slot.why];
    }
    if (anchors.length) {
      const a = anchorItem
        ? garmentLabel(anchorItem)
        : `${q.anchorColor ? `${COLORS[q.anchorColor]?.label || q.anchorColor} ` : ''}${shortName(anchors[0])}`;
      reasons = [`${a}${josa(a, '과', '와')} 잘 어울려요`, ...base.reasons.filter((r) => !r.startsWith('가진 '))].slice(
        0,
        2,
      );
      const together = looks.filter(
        (l) => slotsInLook(l).includes(slot.id) && slotsInLook(l).some((id) => anchorIds.has(id)),
      ).length;
      score += together * 3;
      if (!together) score -= 4;
    }
    // 계절을 말했으면 그 계절 옷만, 아이템을 콕 집었으면 계절이 지나도 보여 준다
    if (!base.inSeason && (q.season || !q.slotNamed)) continue;
    let products = productsFor(slot.id, {
      ...productOpts(c),
      color: q.color,
      brand: q.brand,
      season: q.season || (q.slotNamed ? null : c.season),
    });
    products = products.filter(toneOK);
    if (q.comfort) products = [...products].sort((a, b) => comfortMark(b) - comfortMark(a));
    const selected = q.priceSort ? products : products.slice(0, q.brand ? 6 : 3);
    selected.forEach((product, i) => {
      const easy = q.comfort ? comfortMark(product) : 0;
      results.push({ slot, product, score: score - i * 1.2 + quality(product) * 0.3 + easy * 2, reasons, offOccasion });
    });
  }
  results.sort(
    q.priceSort
      ? (a, b) =>
          (q.priceSort === 'desc' ? b.product.price - a.product.price : a.product.price - b.product.price) ||
          a.product.id.localeCompare(b.product.id)
      : (a, b) => b.score - a.score,
  );

  const items = results.slice(0, 16);
  const outfitTried = !anchorUnavailable && !kindUnavailable && (anchors.length || c.occasion);
  const outfit =
    outfitTried
      ? recommendLooks(
          {
            ...state,
            closet: state.demo ? [] : state.closet,
            gender: c.gender,
            styles: c.styles,
            season: c.season,
            budget: c.maxPrice,
            minPrice: c.minPrice,
            minPriceExclusive: c.minPriceExclusive,
            maxPriceExclusive: c.maxPriceExclusive,
            occasion: c.occasion,
          },
          {
            limit: 1,
            forceOwned: [...anchorIds, ...(q.slotNamed ? targets.map((slot) => slot.id) : [])],
            anchorItem,
            pinnedProduct: anchorProduct,
            anchorColor: q.anchorColor,
            allowPendingPurchases: q.slotNamed || !!anchorProduct,
            strictOccasion: !!q.occasion,
            excludeSlot: q.excludedItems.length ? q.excludeMatch : null,
            requestedPurchaseSlots: new Set([
              ...(q.slotNamed ? targets.map((slot) => slot.id) : []),
              ...(anchorProduct ? [anchorProduct.slot] : []),
            ]),
          },
        )[0] || null
      : null;
  if (!anchorProduct && !anchorItem && outfit && anchors.length)
    anchorProduct = outfit.items.find((i) => anchorIds.has(i.slot.id) && !i.owned)?.product || null;
  // 검색에서 상세·코디로 넘어가도 같은 조건을 쓴다.
  // 상품 조건(종류·색·가격·브랜드·뺀 색)과 코디 전체 조건(상황·계절·스타일·뺀 종류)을 함께 담는다.
  // 상세 화면은 같은 종류의 대안에 상품 조건을, 코디에 두 조건을 모두 쓴다.
  const criteria = {
    gender: c.gender,
    slotIds: q.slotNamed ? targets.map((s) => s.id) : null,
    occasion: c.occasion,
    occasionFromQuery: !!q.occasion,
    season: q.season,
    style: q.style,
    styles: c.styles,
    excludedItems: q.excludedItems,
    excludeSlot: q.excludedItems.length ? q.excludeMatch : null,
    maxPrice: c.maxPrice,
    minPrice: c.minPrice,
    minPriceExclusive: c.minPriceExclusive,
    maxPriceExclusive: c.maxPriceExclusive,
    color: q.color,
    brand: q.brand,
    excludeColors: q.excludeColors,
    tone: q.tone,
  };
  // 화면 칩: 실제로 적용한 조건만, 한 곳에서 만든다.
  const priceLine = criteriaLine({ maxPrice: criteria.maxPrice, minPrice: criteria.minPrice, minPriceExclusive: criteria.minPriceExclusive, maxPriceExclusive: criteria.maxPriceExclusive });
  const conds = [
    q.slotNamed ? { key: 'kind', label: q.targetLabels.join('·') } : null,
    c.occasion ? { key: 'occasion', label: OCCASIONS[c.occasion] || c.occasion, saved: !q.occasion } : null,
    q.season ? { key: 'season', label: SEASONS[q.season] } : null,
    q.style ? { key: 'style', label: STYLES[q.style]?.label || q.style } : null,
    q.color ? { key: 'color', label: COLORS[q.color]?.label || q.color } : null,
    q.tone ? { key: 'tone', label: q.tone === 'light' ? '밝은 색' : '어두운 색' } : null,
    q.excludeColors.length || q.excludedItems.length
      ? { key: 'exclude', label: [...q.excludeColors.map((x) => COLORS[x]?.label || x), ...q.excludedItems].map((x) => `${x} 제외`).join(' · ') }
      : null,
    priceLine ? { key: 'price', label: priceLine, saved: q.maxPrice == null && q.minPrice == null } : null,
    q.brand ? { key: 'brand', label: q.brand } : null,
    q.comfort ? { key: 'comfort', label: '편한 표기 먼저' } : null,
  ].filter(Boolean);
  return {
    query: q,
    criteria,
    conds,
    dropped: [...dropped],
    kindUnavailable,
    kindNowhere,
    outfitTried: !!outfitTried,
    genderFromKind,
    understood,
    items,
    outfit,
    anchorItem,
    anchorProduct,
    anchorUnavailable,
    season: c.season,
    gender: c.gender,
  };
}

// 사진이 없는 옷을 보여 줄 같은 종류의 상품 사진. 같은 색, 없으면 아주 가까운 색까지만 쓴다.
// 상품명·편집으로 확인한 색을 사진 추정 색보다 먼저, 고른 브랜드 → 사계절 상품 → 인기 순서로 고른다.
const NEAR_COLORS = {
  white: ['ivory'], ivory: ['white', 'beige'], beige: ['ivory'], navy: ['indigo'], indigo: ['navy'], blue: ['indigo'],
  charcoal: ['grey', 'black'], grey: ['charcoal'], black: ['charcoal'], olive: ['green'], green: ['olive'], red: ['pink'], pink: ['red'],
};
export function lookalike(slotId, color, { brand = null } = {}) {
  if (!color) return null;
  const list = (PRODUCTS_BY_SLOT[slotId] || []).filter((p) => p.img);
  const key = (p) => [p.brand === brand ? 1 : 0, p.colorSource === 'image' ? 0 : 1, p.summer ? 0 : 1, quality(p)];
  const better = (a, b) => {
    const x = key(a), y = key(b);
    return x[0] - y[0] || x[1] - y[1] || x[2] - y[2] || x[3] - y[3];
  };
  for (const c of [color, ...(NEAR_COLORS[color] || [])]) {
    const same = list.filter((p) => p.color === c);
    if (same.length) return same.reduce((best, p) => (better(p, best) > 0 ? p : best));
  }
  return null;
}

// 예시 옷장: 고른 스타일의 대표 코디에서 겹치지 않게 몇 벌을 고른다. 그 옷만으로 "오늘 뭐 입지?" 코디가 나오도록
// 첫 코디를 통째로 넣는다. 색은 그 종류의 대표 색으로 둔다(코디에 뽑힌 상품이 튀는 색일 수 있다).
export function exampleCloset(state, { size = 6 } = {}) {
  const looks = recommendLooks(
    { ...state, closet: [], demo: false, demoSelected: [], occasion: null, budget: null, brandOnly: false },
    { limit: 3, occasion: null },
  );
  const out = [];
  for (const r of looks) {
    for (const i of r.items) {
      if (i.role === 'acc' || out.length >= size || out.some((x) => x.slot === i.slot.id)) continue;
      const shown = (c) => c && lookalike(i.slot.id, c);
      const color = (i.slot.colors.includes(i.color) && shown(i.color) && i.color) || i.slot.colors.find(shown) || i.color || i.slot.colors[0];
      out.push({ slot: i.slot.id, color });
    }
  }
  return out;
}
