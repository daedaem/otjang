// View-only wardrobe search and ordering. The caller supplies the active
// wardrobe; recommendation preferences never remove clothes from this list.
import { COLORS, SLOT_BY_ID } from './data/slots.js';
import { garmentLabel, garmentKindName, garmentSlotStatus, slotForItem } from './wardrobe.js';

const closetNameCollator = new Intl.Collator('ko', { numeric: true, sensitivity: 'base' });
const closetSearchText = (value) => String(value ?? '').normalize('NFC').toLocaleLowerCase('ko').replace(/\s+/gu, '');

/** The confirmations still needed before a garment can inform outfit formulas. */
export function missingGarmentDetails(item) {
  const missing = [];
  const slot = Object.hasOwn(SLOT_BY_ID, item?.slot) ? SLOT_BY_ID[item.slot] : null;
  // A known colour-specific type with no colour still needs only its colour;
  // do not ask the person to choose the already-known type again.
  if (!slot || garmentSlotStatus(item, slot) === 'missing') missing.push('세부 종류');
  if (!Object.hasOwn(COLORS, item?.color)) missing.push('색');
  return missing;
}

/** Return render rows without modifying clothes, preferences, or their order. */
export function closetItems(items, { category = 'all', query = '', reviewOnly = false, sort = 'recent' } = {}) {
  if (!Array.isArray(items)) return [];
  const tokens = String(query ?? '').normalize('NFC').trim().split(/\s+/u).filter(Boolean).map(closetSearchText);
  const rows = items.map((item, index) => ({ item, index,
    // Legacy/demo timestamps are not evidence of the user's registration date.
    registered: item.source === 'user' ? Date.parse(item.createdAt) : NaN,
  })).filter(({ item }) => {
    const slot = slotForItem(item);
    if (category !== 'all' && slot.cat !== category) return false;
    if (reviewOnly && !missingGarmentDetails(item).length) return false;
    if (!tokens.length) return true;
    const searchable = [garmentLabel(item), item.brand, garmentKindName(item.kind), item.kind, slot.name,
      Object.hasOwn(COLORS, item.color) ? COLORS[item.color].label : ''].map(closetSearchText).join(' ');
    return tokens.every((token) => searchable.includes(token));
  });
  return rows.sort((a, b) => {
    if (sort === 'name') return closetNameCollator.compare(garmentLabel(a.item).normalize('NFC'), garmentLabel(b.item).normalize('NFC')) || a.index - b.index;
    const aKnown = Number.isFinite(a.registered), bKnown = Number.isFinite(b.registered);
    if (aKnown && bKnown) return (sort === 'oldest' ? a.registered - b.registered : b.registered - a.registered) || a.index - b.index;
    return aKnown !== bKnown ? (aKnown ? -1 : 1) : a.index - b.index;
  });
}
