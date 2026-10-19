// Historical evidence for a different product, never a size prediction or ranking input.
import { SLOT_BY_ID } from './data/slots.js';

const brandKey = (value) => typeof value === 'string' ? value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase() : '';
const kindKey = (candidate) => candidate?.kind || SLOT_BY_ID[candidate?.slot]?.shape || null;

export function relatedReturnRecords(journeys, candidate, excludeId = null) {
  const brand = brandKey(candidate?.brand), kind = kindKey(candidate);
  if (!brand || !kind) return [];
  return journeys.flatMap((journey) => {
    if (journey.id === excludeId) return [];
    const event = [...journey.history].reverse().find((entry) => entry.action === 'returned');
    // A later edit cannot rewrite the product, option or feedback at return time.
    const details = event?.details, past = details?.candidate;
    if (!past || brandKey(past.brand) !== brand || kindKey(past) !== kind) return [];
    if ((candidate.productId && past.productId === candidate.productId) || past.url === candidate.url) return [];
    return [{ journeyId: journey.id, at: event.at, name: past.name || '상품명 미기록',
      option: details.option || null, fit: details.feedback?.fit || null,
      returnReason: details.feedback?.returnReason || null }];
  }).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 3);
}
