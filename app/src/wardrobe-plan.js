// Wardrobe plan: from the clothes actually owned to the next real product.
//
// One pass over the active owned garments (never returned or retired ones):
// 1. which garments can be analysed (type and colour confirmed) and which need a check
// 2. duplicates: confirmed garments of the same detailed type and colour
// 3. gaps: a detailed type that, added once, completes outfit formulas with the
//    confirmed garments — counted by the same compareCandidate rules the purchase
//    comparison uses, so both screens give the same number
// 4. real catalog products for each gap: brand, exact name, the price as
//    collected with its date and store, and the product link
//
// Nothing is invented: products whose colour is only guessed from the photo are
// listed with "colour unconfirmed" and do not count; prices are the catalog's
// collected price on its date, never a current or lowest price.
import { SLOTS, SLOT_BY_ID, COLORS } from './data/slots.js';
import { productsFor, matchingLooks, formulaSlots, recommendationContext, styleScore, fillLook } from './engine.js';
import { compareCandidate, candidateFromProduct } from './purchase-candidate.js';
import { garmentSlotStatus, garmentLabel } from './wardrobe.js';
import { inactivePurchaseGarmentIds } from './purchase-journey.js';
import { productEligible, evidenceColor } from './catalog-policy.js';

function confirmedGarment(item) {
  const slot = SLOT_BY_ID[item.slot];
  return !!slot && Object.hasOwn(COLORS, item.color) && garmentSlotStatus(item, slot) === 'confirmed';
}

function productColorConfirmed(product) {
  const slot = SLOT_BY_ID[product.slot];
  const color = evidenceColor(product);
  return !!color && Object.hasOwn(COLORS, color) && (!slot?.requiredColors || slot.requiredColors.includes(color));
}

function gapProducts(slot, state, season, limit) {
  const products = productsFor(slot.id, {
    maxPrice: state.budget ?? null, hidden: new Set(state.hidden || []),
    brands: new Set(state.brands || []), brandOnly: !!state.brandOnly && (state.brands || []).length > 0,
    season,
  }).filter(productEligible);
  // Products with a confirmed colour come first; the others stay visible but marked.
  const ordered = [...products.filter(productColorConfirmed), ...products.filter((p) => !productColorConfirmed(p))];
  return {
    representative: ordered.find(productColorConfirmed) || null,
    total: products.length,
    list: ordered.slice(0, limit).map((product) => ({
      product,
      colorConfirmed: productColorConfirmed(product),
      price: { amount: product.price, store: product.store, collectedOn: product.checkedAt, kind: 'collected' },
    })),
  };
}

export function describeGarment(item) {
  return [COLORS[item.color]?.label, item.brand, garmentLabel(item)].filter(Boolean).join(' ');
}

/**
 * basis.kind: 'actual' (the user's own clothes), 'example' (the example closet,
 * analysed only for display and never mixed with real clothes) or 'empty'.
 */
export function wardrobePlan(state, { gapLimit = 3, productsPerGap = 3 } = {}) {
  const gender = state.gender || 'M';
  const example = !!state.demo;
  const inactive = inactivePurchaseGarmentIds(state);
  const source = example ? state.demoSelected || [] : state.garments || [];
  const owned = source.filter((item) => item.gender === gender && !inactive.has(item.id) &&
    (example || ['user', 'legacy'].includes(item.source)));
  const otherGender = example ? 0 : (state.garments || []).filter((item) =>
    item.gender !== gender && ['user', 'legacy'].includes(item.source) && !inactive.has(item.id)).length;
  const retired = example ? 0 : (state.garments || []).filter((item) => inactive.has(item.id)).length;
  const basis = { kind: owned.length ? (example ? 'example' : 'actual') : 'empty', garmentCount: owned.length, otherGender, retired };

  const confirmed = owned.filter(confirmedGarment);
  const needsCheck = owned.filter((item) => !confirmedGarment(item)).map((item) => ({
    item,
    reason: !SLOT_BY_ID[item.slot] || garmentSlotStatus(item, SLOT_BY_ID[item.slot]) !== 'confirmed'
      ? (Object.hasOwn(COLORS, item.color) ? 'type' : 'type-and-color')
      : 'color',
  }));

  const groups = new Map();
  for (const item of confirmed) {
    const key = `${item.slot}|${item.color}`;
    groups.set(key, [...(groups.get(key) || []), item]);
  }
  const duplicates = [...groups.values()].filter((items) => items.length > 1)
    .map((items) => ({ slot: SLOT_BY_ID[items[0].slot], color: items[0].color, items }));

  // The example closet is analysed through an in-memory copy marked as wardrobe
  // clothes; it is never saved and every label says it is the example.
  const analysisState = example
    ? { ...state, demo: false, demoSelected: [], journeys: [],
        garments: owned.map((item) => ({ ...item, id: `example-${item.id}`, source: 'user', exampleOf: item.id })) }
    : state;
  const context = recommendationContext({ ...analysisState, closet: analysisState.garments });
  const formulas = matchingLooks(context, { occasion: null });
  const formulaSlotIds = new Set(formulas.flatMap(formulaSlots));
  const ownedSlotIds = new Set(confirmed.map((item) => item.slot));
  const paused = [];
  const gaps = [];
  if (confirmed.length) {
    for (const slot of SLOTS) {
      if (slot.g !== gender || !formulaSlotIds.has(slot.id) || ownedSlotIds.has(slot.id)) continue;
      // An order or a "similar one at home" answer pauses buying the same type.
      if (context.pendingSlots.has(slot.id) || context.ownershipCheckSlots.has(slot.id)) {
        paused.push({ slot, reason: context.pendingSlots.has(slot.id) ? 'ordered' : 'similar-owned' });
        continue;
      }
      const products = gapProducts(slot, state, context.season, productsPerGap);
      const representative = products.representative;
      if (!representative) continue;
      let comparison;
      try {
        comparison = compareCandidate(analysisState, candidateFromProduct(representative), { absence: 'unknown' });
      } catch {
        // A product that cannot form an exact candidate (link or type unclear) is
        // skipped rather than letting one row stop the whole plan.
        continue;
      }
      if (!comparison.newFormulaCount) continue;
      const looks = comparison.looks.filter((look) => look.new);
      const used = new Map();
      for (const look of looks)
        for (const row of look.items) if (row.source === 'wardrobe' && row.item) used.set(row.item.id, row.item);
      gaps.push({
        slot,
        newFormulaCount: comparison.newFormulaCount,
        looks: looks.slice(0, 3).map((look) => ({ title: look.look.title, note: look.look.note,
          items: look.items.map((row) => row.source === 'wardrobe'
            ? { role: row.role, owned: true, item: row.item, label: describeGarment(row.item) }
            : { role: row.role, owned: false, slot }) })),
        usesOwned: [...used.values()],
        styleFit: styleScore(slot, context.styles),
        products: products.list,
        moreProducts: Math.max(0, products.total - products.list.length),
      });
    }
  }
  gaps.sort((a, b) => b.newFormulaCount - a.newFormulaCount || b.styleFit - a.styleFit);
  // When no single garment completes a formula, show formulas two garments away,
  // built only from confirmed clothes (never from unconfirmed ones).
  const pairs = [];
  if (confirmed.length >= 2) {
    const confirmedAnalysis = (analysisState.garments || []).filter((item) =>
      confirmedGarment(item) && owned.some((o) => o.id === (item.exampleOf || item.id)));
    const pairContext = recommendationContext({ ...analysisState, closet: confirmedAnalysis });
    const seen = new Set(gaps.map((gap) => gap.slot.id));
    for (const look of matchingLooks(pairContext, { occasion: null })) {
      const filled = fillLook(look, pairContext, { maxBuy: 2 });
      if (!filled || filled.buyCount !== 2 || filled.uncertainCount || filled.ownedCount < 2) continue;
      const buys = filled.items.filter((row) => !row.owned).map((row) => row.slot);
      const key = buys.map((slot) => slot.id).sort().join('+');
      if (seen.has(key) || buys.some((slot) => seen.has(slot.id))) continue;
      seen.add(key);
      pairs.push({
        slots: buys,
        look: { title: look.title, note: look.note,
          items: filled.items.map((row) => row.owned
            ? { role: row.role, owned: true, item: row.item, label: describeGarment(row.item) }
            : { role: row.role, owned: false, slot: row.slot }) },
        usesOwned: filled.items.filter((row) => row.owned).map((row) => row.item),
        products: Object.fromEntries(buys.map((slot) => [slot.id, gapProducts(slot, state, context.season, 2).list])),
      });
      if (pairs.length >= 2) break;
    }
  }
  return {
    basis,
    analysed: confirmed,
    needsCheck,
    duplicates,
    gaps: gaps.slice(0, gapLimit),
    moreGaps: Math.max(0, gaps.length - gapLimit),
    pairs: gaps.length >= gapLimit ? [] : pairs,
    paused,
    season: context.season,
    limitations: [
      '종류와 색을 확인한 옷만 셌어요. 소재·핏·사이즈는 비교하지 않았어요.',
      '코디 수는 편집자가 만든 코디 공식 중 이 옷 하나를 더해 완성되는 수예요.',
      '가격은 수집한 날의 판매처 표시가예요. 지금 가격·쿠폰·배송비는 판매처에서 확인해 주세요.',
    ],
  };
}
