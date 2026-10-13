// 추천 엔진: 스타일·상황·계절·예산·가진 옷으로 실제 상품과 코디를 고른다.
// 같은 입력이면 같은 결과가 나오는 규칙 기반 계산이며, 개인 정보는 이 기기 밖으로 나가지 않는다.

import { SLOTS, SLOT_BY_ID, STYLES, OCCASIONS } from './data/slots.js';
import { LOOKS, ROLE_ORDER } from './data/looks.js';
import { PRODUCTS } from './data/products.js';
import { parseQuery } from './query.js';

export const SEASON_LABEL = { spring: '봄', summer: '여름', fall: '가을', winter: '겨울' };
const OPTIONAL_ROLES = new Set(['acc']);

export function seasonOf(date = new Date()) {
  const m = date.getMonth() + 1;
  if (m >= 3 && m <= 5) return 'spring';
  if (m >= 6 && m <= 8) return 'summer';
  if (m >= 9 && m <= 11) return 'fall';
  return 'winter';
}

// 받침 여부로 조사를 고른다: 치노와 / 셔츠와 / 로퍼와 / 슬랙스와
export function josa(word, withFinal, withoutFinal) {
  const ch = word.trim().slice(-1);
  const code = ch.charCodeAt(0) - 0xac00;
  if (code < 0 || code > 11171) return withoutFinal;
  return code % 28 ? withFinal : withoutFinal;
}

const PRODUCTS_BY_SLOT = PRODUCTS.reduce((acc, p) => {
  (acc[p.slot] ||= []).push(p);
  return acc;
}, {});

export function quality(p) {
  const rating = p.rating ?? 4.5;
  return rating * Math.log10((p.reviews ?? 0) + 10);
}

function withinBudget(p, maxPrice) {
  return !maxPrice || p.price <= maxPrice;
}

export function productsFor(slotId, { maxPrice = null, hidden = [], color = null } = {}) {
  const hide = new Set(hidden);
  return (PRODUCTS_BY_SLOT[slotId] || [])
    .filter((p) => !hide.has(p.id) && withinBudget(p, maxPrice) && (!color || p.color === color))
    .sort((a, b) => quality(b) - quality(a) || a.price - b.price);
}

function ctx(state) {
  return {
    gender: state.gender || 'M',
    style: state.style || 'classic',
    occasion: state.occasion || null,
    season: state.season || seasonOf(state.now ? new Date(state.now) : new Date()),
    maxPrice: state.budget || null,
    owned: new Set(state.owned || []),
    hidden: state.hidden || [],
  };
}

function matchingLooks(c, { occasion = c.occasion } = {}) {
  return LOOKS.filter(
    (l) => l.g === c.gender && l.styles.includes(c.style) && l.seasons.includes(c.season) && (!occasion || l.occ.includes(occasion)),
  );
}

function slotsInLook(look) {
  return Object.values(look.roles).flat();
}

// 한 아이템 자리의 점수와 이유
export function scoreSlot(slot, c, looks = matchingLooks(c)) {
  let score = (slot.style[c.style] || 0) * 2;
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
    for (const other of ids) if (other !== slot.id && c.owned.has(other) && SLOT_BY_ID[other].cat !== slot.cat) pairs.add(other);
  }
  score += Math.min(lookCount, 3) * 1;
  score += Math.min(pairs.size, 4) * 1.5;

  if (pairs.size) {
    const names = [...pairs].slice(0, 2).map((id) => shortName(SLOT_BY_ID[id]));
    const last = names[names.length - 1];
    reasons.push(`가진 ${names.join('·')}${josa(last, '과', '와')} 바로 입을 수 있어요`);
  }
  if (slot.style[c.style] === 3) reasons.push(`${STYLES[c.style].label} 옷장의 기본이에요`);
  if (c.occasion && slot.occ.includes(c.occasion)) reasons.push(`${OCCASIONS[c.occasion]}에 잘 맞아요`);
  if (inSeason && slot.seasons.length < 4) reasons.push(`${SEASON_LABEL[c.season]}에 많이 입어요`);

  return { score, reasons, pairs: [...pairs], inSeason };
}

const SHORT = {
  'm-oxford-white': '흰 셔츠', 'm-oxford-blue': '블루 셔츠', 'f-shirt-white': '흰 셔츠', 'm-tee-white': '흰 티', 'f-tee': '티셔츠',
  'm-denim': '청바지', 'f-denim': '청바지', 'm-chino': '치노', 'm-slacks-grey': '그레이 슬랙스', 'm-slacks-wide': '와이드 슬랙스', 'f-slacks': '슬랙스',
  'm-knit-crew': '니트', 'f-knit': '니트', 'm-knit-cable': '케이블 니트', 'm-loafer': '로퍼', 'f-loafer': '로퍼', 'm-derby': '구두',
  'm-sneaker-leather': '흰 스니커즈', 'm-chuck': '캔버스 스니커즈', 'm-nb': '운동화', 'f-sneaker': '스니커즈', 'm-boots': '부츠',
  'm-blazer': '블레이저', 'f-blazer': '블레이저', 'm-sweat': '맨투맨', 'm-longtee': '긴팔 티', 'f-skirt': '롱 스커트',
};
export function shortName(slot) {
  return SHORT[slot.id] || slot.name.replace(/^(화이트|블루|베이지|그레이|블랙|네이비|생지|페니|스웨이드|코튼|울|피케|무지|베이직)\s+/, '');
}

const CAT_LIMIT = { acc: 1 };

// 지금 사면 좋은 아이템
export function recommendItems(state, { limit = 8 } = {}) {
  const c = ctx(state);
  const looks = matchingLooks(c);
  const ranked = SLOTS.filter((s) => s.g === c.gender && !c.owned.has(s.id))
    .map((slot) => ({ slot, ...scoreSlot(slot, c, looks) }))
    .filter((r) => r.inSeason && r.score > 3)
    .sort((a, b) => b.score - a.score);

  const out = [];
  const perCat = {};
  const perBrand = {};
  for (const r of ranked) {
    const products = productsFor(r.slot.id, { maxPrice: c.maxPrice, hidden: c.hidden });
    if (!products.length) continue;
    const limitForCat = CAT_LIMIT[r.slot.cat] ?? 2;
    if ((perCat[r.slot.cat] || 0) >= limitForCat) continue;
    perCat[r.slot.cat] = (perCat[r.slot.cat] || 0) + 1;
    // 한 브랜드가 목록을 채우지 않도록 두 번까지만 먼저 고른다
    const product = products.find((p) => (perBrand[p.brand] || 0) < 2) || products[0];
    perBrand[product.brand] = (perBrand[product.brand] || 0) + 1;
    const pair = r.reasons.find((x) => x.startsWith('가진 '));
    const reasons = pair ? [pair, r.slot.why] : [r.slot.why, ...r.reasons];
    out.push({ slot: r.slot, product, alternatives: products.filter((p) => p !== product).slice(0, 3), score: r.score, reasons: reasons.slice(0, 2) });
    if (out.length >= limit) break;
  }
  return out;
}

function fillLook(look, c, { anchorSlots = new Set(), product = null } = {}) {
  const items = [];
  for (const role of ROLE_ORDER) {
    const candidates = look.roles[role];
    if (!candidates) continue;
    // 검색의 기준 아이템("청바지에 어울리는")을 먼저, 그다음 가진 옷
    // 상품 상세에서 연 코디에는 선택한 상품 자체를 넣는다.
    if (product && candidates.includes(product.slot)) {
      items.push({ role, slot: SLOT_BY_ID[product.slot], owned: false, product });
      continue;
    }
    const anchorId = candidates.find((id) => anchorSlots.has(id));
    const ownedId = anchorId && c.owned.has(anchorId) ? anchorId : !anchorId ? candidates.find((id) => c.owned.has(id)) : null;
    if (ownedId) {
      items.push({ role, slot: SLOT_BY_ID[ownedId], owned: true });
      continue;
    }
    const inSeason = anchorId ? [anchorId] : candidates.filter((id) => SLOT_BY_ID[id].seasons.includes(c.season));
    if (!inSeason.length) continue; // 이 계절엔 필요 없는 역할(예: 여름 아우터)
    let picked = null;
    for (const id of inSeason) {
      const product = productsFor(id, { maxPrice: c.maxPrice, hidden: c.hidden })[0];
      if (product) {
        picked = { role, slot: SLOT_BY_ID[id], owned: false, product };
        break;
      }
    }
    if (picked) items.push(picked);
    else if (!OPTIONAL_ROLES.has(role)) return null; // 코디의 핵심 역할을 채울 수 없으면 보여 주지 않는다
  }
  const buy = items.filter((i) => !i.owned);
  return {
    look,
    items,
    ownedCount: items.length - buy.length,
    buyCount: buy.length,
    buyTotal: buy.reduce((sum, i) => sum + i.product.price, 0),
  };
}

// 오늘의 코디
export function recommendLooks(state, { limit = 3, anchorSlots = [], product = null, occasion } = {}) {
  const c = ctx(state);
  const force = new Set(anchorSlots);
  let looks = matchingLooks(c, { occasion: occasion ?? c.occasion });
  if (!looks.length) looks = matchingLooks(c, { occasion: null });
  if (force.size) looks = looks.filter((l) => slotsInLook(l).some((id) => force.has(id)));
  if (product) looks = looks.filter((l) => slotsInLook(l).includes(product.slot));
  return looks
    .map((look) => fillLook(look, c, { anchorSlots: force, product }))
    .filter(Boolean)
    .map((r) => {
      const styleScore = r.look.styles[0] === c.style ? 2 : 1;
      const occScore = c.occasion && r.look.occ[0] === c.occasion ? 1.5 : 0;
      const ownedScore = (r.ownedCount / r.items.length) * 4;
      return { ...r, score: styleScore + occScore + ownedScore };
    })
    .sort((a, b) => b.score - a.score || a.buyTotal - b.buyTotal)
    .slice(0, limit);
}

// 자연어 한 줄 검색: "출근용 셔츠 10만원 이하", "청바지에 어울리는 신발"
export function search(state, text) {
  const q = parseQuery(text);
  const c = ctx({
    ...state,
    gender: q.gender || state.gender,
    style: q.style || state.style,
    occasion: q.occasion || state.occasion || null,
    season: q.season || state.season,
    budget: q.maxPrice ?? state.budget,
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
    const base = scoreSlot(slot, { ...c, owned: new Set([...c.owned, ...anchorIds]) }, matchingLooks(c, { occasion: null }));
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
    let products = productsFor(slot.id, { maxPrice: c.maxPrice, hidden: c.hidden, color: q.color });
    if (q.premium) products = [...products].sort((a, b) => b.price - a.price);
    products.slice(0, 3).forEach((product, i) => {
      results.push({ slot, product, score: score - i * 1.2 + quality(product) * 0.3, reasons });
    });
  }
  results.sort((a, b) => b.score - a.score);

  const items = results.slice(0, 12);
  const outfit = anchors.length || c.occasion
    ? recommendLooks({ ...state, gender: c.gender, style: c.style, season: c.season, budget: c.maxPrice, occasion: c.occasion }, { limit: 1, anchorSlots: [...anchorIds] })[0] || null
    : null;

  return { query: q, understood, items, outfit, season: c.season, gender: c.gender };
}

export function formatPrice(n) {
  return `${n.toLocaleString('ko-KR')}원`;
}
