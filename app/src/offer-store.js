// Price records kept on this device, per product.
//
// These are notes about sellers (not the wardrobe): the option the user wants,
// the offers seen, and the last refresh attempt. They live in localStorage, are
// capped, and are not part of the wardrobe backup or account sync yet
// (docs/price-offers-20261015.md). A full erase clears them.
import { validateOffer, MAX_OFFERS_PER_PRODUCT } from './offers.js';
import { COLORS } from './data/slots.js';

export const OFFER_STORE_KEY = 'eoul:offers:v1';
const MAX_PRODUCTS = 100;

function readAll(storage) {
  try {
    const value = JSON.parse(storage?.getItem(OFFER_STORE_KEY) || 'null');
    return value && value.v === 1 && value.products && typeof value.products === 'object' ? value : { v: 1, products: {} };
  } catch {
    return { v: 1, products: {} };
  }
}
function writeAll(storage, value) {
  const keys = Object.keys(value.products);
  // Oldest touched products go first when the cap is reached.
  if (keys.length > MAX_PRODUCTS)
    for (const key of keys.sort((a, b) => (value.products[a].touchedAt || '').localeCompare(value.products[b].touchedAt || '')).slice(0, keys.length - MAX_PRODUCTS))
      delete value.products[key];
  try {
    storage?.setItem(OFFER_STORE_KEY, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function offerRef({ productId = null, url = null } = {}) {
  if (typeof productId === 'string' && /^ms-\d+$/.test(productId)) return productId;
  return typeof url === 'string' && url.startsWith('https://') ? url.slice(0, 300) : null;
}

export function readOffers(storage, ref) {
  const entry = ref ? readAll(storage).products[ref] : null;
  const offers = [];
  for (const raw of entry?.offers || []) {
    try { offers.push(validateOffer(raw)); } catch {}
  }
  return {
    requested: {
      color: entry?.requested?.color && Object.hasOwn(COLORS, entry.requested.color) ? entry.requested.color : null,
      size: typeof entry?.requested?.size === 'string' && entry.requested.size ? entry.requested.size.slice(0, 20) : null,
    },
    offers,
    refresh: entry?.refresh || null,
  };
}

/** Returns false when the browser refused to store (full or blocked); the caller keeps the input. */
export function writeOffers(storage, ref, { requested, offers, refresh }, now = new Date()) {
  if (!ref) return false;
  const all = readAll(storage);
  all.products[ref] = {
    requested: { color: requested?.color || null, size: requested?.size || null },
    offers: offers.slice(-MAX_OFFERS_PER_PRODUCT),
    refresh: refresh || null,
    touchedAt: now.toISOString(),
  };
  return writeAll(storage, all);
}

export function clearOffers(storage) {
  try { storage?.removeItem(OFFER_STORE_KEY); } catch {}
}
