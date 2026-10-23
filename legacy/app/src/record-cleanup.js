// How full the wardrobe record is, and which purchase records can be removed
// without changing any garment.
//
// A purchase record linked to a garment decides whether that garment counts as
// owned (received, returned, replaced). Removing it would silently bring a
// returned or replaced garment back, so only records without a garment link
// are offered: comparisons (stage candidate) and orders not yet received.
import { MAX_PURCHASE_JOURNEYS } from '../../../app/lite/src/domain/purchase-journey.js';
import { wardrobeStateStorageUsage, journeyStorageUsage, noteStorageUsage } from './wardrobe-store.js';
import { MAX_WEAR_ENTRIES } from '../../../app/lite/src/domain/wear-log.js';

export const MAX_GARMENTS = 200;
const NEAR = 0.9;

export function storageLimits(state) {
  const garments = (state.garments || []).length;
  const journeys = (state.journeys || []).length;
  const wears = (state.wears || []).length;
  const bytes = wardrobeStateStorageUsage(state);
  const journeyBytes = journeyStorageUsage(state);
  const noteBytes = noteStorageUsage(state);
  const noteRatio = noteBytes.limitBytes ? noteBytes.bytes / noteBytes.limitBytes : 1;
  const ratios = [garments / MAX_GARMENTS, journeys / MAX_PURCHASE_JOURNEYS, wears / MAX_WEAR_ENTRIES, bytes.bytes / bytes.limitBytes, journeyBytes.bytes / journeyBytes.limitBytes, noteRatio];
  return {
    garments: { count: garments, max: MAX_GARMENTS },
    journeys: { count: journeys, max: MAX_PURCHASE_JOURNEYS },
    wears: { count: wears, max: MAX_WEAR_ENTRIES },
    bytes,
    journeyBytes,
    noteBytes,
    fullest: Math.max(...ratios),
    near: ratios.some((ratio) => ratio >= NEAR),
    // Full optional notes only stop note growth; clothing and ownership writes
    // still use their own limits, as does a diary at its entry-count cap.
    wearsFull: wears >= MAX_WEAR_ENTRIES,
    full: garments >= MAX_GARMENTS || journeys >= MAX_PURCHASE_JOURNEYS || bytes.overBudget || journeyBytes.overBudget,
  };
}

export function journeyRemovable(journey) {
  return !journey.garmentId && !journey.replacementConfirmed && ['candidate', 'ordered'].includes(journey.stage);
}

/** Removable records, oldest activity first, with their size. */
export function removableJourneys(state) {
  return (state.journeys || []).filter(journeyRemovable).map((journey) => ({
    journey,
    kind: journey.stage === 'ordered' ? 'ordered' : 'compared',
    lastAt: journey.history.at(-1)?.at || '',
    bytes: new TextEncoder().encode(JSON.stringify(journey)).length,
  })).sort((a, b) => a.lastAt.localeCompare(b.lastAt));
}

/** The journeys left after removing the chosen ones; refuses anything not removable. */
export function journeysWithout(state, ids) {
  const chosen = new Set(ids);
  for (const journey of state.journeys || [])
    if (chosen.has(journey.id) && !journeyRemovable(journey))
      throw new Error('옷과 연결된 구매 기록은 정리에서 지울 수 없어요. 옷의 보유·반품 상태가 바뀌기 때문이에요.');
  return (state.journeys || []).filter((journey) => !chosen.has(journey.id));
}
