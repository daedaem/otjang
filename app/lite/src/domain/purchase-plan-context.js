// A two-product outfit remains context, never a decision to buy one product.
import { wardrobePlan } from './wardrobe-plan.js';
import { candidateFromProduct, parseCandidateLink } from './purchase-candidate.js';

const PLAN_CANDIDATE_FIELDS = [
  'productId', 'url', 'slot', 'kind', 'gender', 'color', 'colorSource',
  'brand', 'name', 'price', 'priceSource', 'checkedAt', 'source', 'classificationConfirmed',
];

function matchesPlanProduct(candidate, product) {
  try {
    const expected = candidateFromProduct(product);
    if (!PLAN_CANDIDATE_FIELDS.every((field) => candidate[field] === expected[field])) return false;
    // A copied tracking link is fine; an original link to another item is not.
    const original = parseCandidateLink(candidate.originalUrl);
    return original.ok && original.productId === expected.productId && original.canonicalUrl === expected.url;
  } catch {
    return false;
  }
}

/** Current actual-wardrobe context for an unchanged catalog purchase candidate. */
export function purchasePlanContext(state, candidate, { intent = 'add' } = {}) {
  if (!state || state.demo || intent !== 'add' || !candidate || typeof candidate.productId !== 'string') return null;
  const plan = wardrobePlan(state);
  if (plan.basis.kind !== 'actual') return null;
  for (const pair of plan.pairs) {
    if (pair.slots.length !== 2) continue;
    for (const slot of pair.slots) {
      const selected = pair.products[slot.id]?.find((entry) => entry.product.id === candidate.productId);
      if (!selected || !matchesPlanProduct(candidate, selected.product)) continue;
      const companionSlot = pair.slots.find((other) => other.id !== slot.id);
      const companion = pair.products[companionSlot?.id]?.[0];
      if (!companion) continue;
      try { candidateFromProduct(companion.product); } catch { continue; }
      // Keep the entry's colour evidence and collected-price metadata intact.
      return { pair, companionSlot, companion, selected };
    }
  }
  return null;
}
