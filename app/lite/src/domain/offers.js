// Seller offers for one product and the total cost to compare them.
//
// An offer is one seller's price for one product page, with the option (colour,
// size) it was seen for, the shipping fee if known, stock and when it was checked.
// Offers are compared only when they are the same product (confirmed), the same
// option the user wants (both colour and size chosen), confirmed in stock,
// recent, and their shipping fee is known.
// Everything else stays visible with the reason it is not compared. The result
// is "the lowest total among the sellers checked", never "the current lowest price".
import { COLORS } from './data/slots.js';

export const OFFER_STALE_DAYS = 3;
export const MAX_OFFERS_PER_PRODUCT = 12;
export const OFFER_SOURCE_LABEL = {
  catalog: '목록 수집가',
  user: '직접 기록',
  'naver-shopping': '네이버 쇼핑 검색',
};
export const OFFER_FLAG_LABEL = {
  'sold-out': '품절',
  'stock-unknown': '재고 미확인',
  'request-incomplete': '원하는 색·사이즈 미정',
  stale: '오래된 가격',
  'option-mismatch': '옵션 다름',
  'option-unknown': '옵션 미확인',
  'shipping-unknown': '배송비 미확인',
  'product-unconfirmed': '같은 상품인지 미확인',
};
const STOCK = new Set(['in-stock', 'sold-out', 'unknown']);
const SAME = new Set(['confirmed', 'unconfirmed']);

function httpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}
function wholeWon(value) {
  return Number.isSafeInteger(value) && value >= 0 && value <= 100000000 ? value : null;
}

/** Normalize an offer or throw with a user message. */
export function validateOffer(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('판매처 가격 정보를 확인해 주세요.');
  const seller = typeof raw.seller === 'string' ? raw.seller.trim().slice(0, 60) : '';
  const url = httpsUrl(raw.url);
  const price = wholeWon(raw.price);
  if (!seller) throw new Error('판매처 이름을 입력해 주세요.');
  if (!url) throw new Error('판매처 상품의 https 링크를 입력해 주세요.');
  if (price === null) throw new Error('가격을 원 단위 숫자로 입력해 주세요.');
  const shipping = raw.shipping === null || raw.shipping === undefined || raw.shipping === '' ? null : wholeWon(raw.shipping);
  if (raw.shipping !== null && raw.shipping !== undefined && raw.shipping !== '' && shipping === null)
    throw new Error('배송비를 원 단위 숫자로 입력해 주세요. 모르면 비워 두세요.');
  const checkedAt = typeof raw.checkedAt === 'string' && Number.isFinite(Date.parse(raw.checkedAt)) ? new Date(raw.checkedAt).toISOString() : null;
  if (!checkedAt) throw new Error('확인 시각이 없어요.');
  const source = Object.hasOwn(OFFER_SOURCE_LABEL, raw.source) ? raw.source : null;
  if (!source) throw new Error('가격 출처를 알 수 없어요.');
  return {
    id: typeof raw.id === 'string' && /^[-\w:]{1,80}$/.test(raw.id) ? raw.id : `o_${crypto.randomUUID()}`,
    seller,
    url,
    price,
    shipping,
    color: raw.color && Object.hasOwn(COLORS, raw.color) ? raw.color : null,
    size: typeof raw.size === 'string' && raw.size.trim() ? raw.size.trim().slice(0, 20) : null,
    stock: STOCK.has(raw.stock) ? raw.stock : 'unknown',
    sameProduct: SAME.has(raw.sameProduct) ? raw.sameProduct : 'unconfirmed',
    source,
    checkedAt,
    title: typeof raw.title === 'string' ? raw.title.slice(0, 200) : null,
  };
}

/** Why an offer can or cannot be compared for the requested option. */
export function offerStatus(offer, { requested = {}, now = new Date() } = {}) {
  const flags = [];
  // Only confirmed stock takes part; "unknown" is the default for new and fetched offers.
  if (offer.stock === 'sold-out') flags.push('sold-out');
  else if (offer.stock !== 'in-stock') flags.push('stock-unknown');
  if (now - new Date(offer.checkedAt) > OFFER_STALE_DAYS * 86400000) flags.push('stale');
  const wantColor = requested.color || null, wantSize = requested.size || null;
  // Without the option the user means to buy, no price is known to apply to it.
  if (!wantColor || !wantSize) flags.push('request-incomplete');
  else if ((wantColor && offer.color && offer.color !== wantColor) || (wantSize && offer.size && offer.size !== wantSize)) flags.push('option-mismatch');
  else if ((wantColor && !offer.color) || (wantSize && !offer.size)) flags.push('option-unknown');
  if (offer.shipping === null) flags.push('shipping-unknown');
  if (offer.sameProduct !== 'confirmed') flags.push('product-unconfirmed');
  return {
    flags,
    comparable: flags.length === 0,
    total: offer.shipping === null ? null : offer.price + offer.shipping,
  };
}

/**
 * Comparable offers sorted by total (price + shipping), and the rest with their
 * reasons. requested.color/size are what the user wants to buy.
 */
export function compareOffers(offers, { requested = {}, now = new Date() } = {}) {
  const rows = offers.map((offer) => ({ offer, ...offerStatus(offer, { requested, now }) }));
  const comparable = rows.filter((row) => row.comparable).sort((a, b) => a.total - b.total || a.offer.checkedAt.localeCompare(b.offer.checkedAt));
  const others = rows.filter((row) => !row.comparable);
  const reasons = {};
  for (const row of others) for (const flag of row.flags) reasons[flag] = (reasons[flag] || 0) + 1;
  return {
    comparable,
    others,
    best: comparable[0] || null,
    reasons,
    requestedComplete: !!(requested.color && requested.size),
  };
}

/**
 * Offers from a refresh replace that source's earlier offers. The user's own
 * records always stay; when over the cap, the oldest other records go first.
 */
export function mergeRefreshed(existing, refreshed, source) {
  const kept = existing.filter((offer) => offer.source !== source);
  // A user's confirmation of a search result survives a refresh of the same link.
  const confirmed = new Map(existing.filter((offer) => offer.source === source).map((offer) => [offer.url, offer]));
  const next = refreshed.map((offer) => {
    const before = confirmed.get(offer.url);
    return before ? { ...offer, sameProduct: before.sameProduct, color: offer.color ?? before.color, size: offer.size ?? before.size, shipping: offer.shipping ?? before.shipping } : offer;
  });
  const all = [...kept, ...next];
  if (all.length <= MAX_OFFERS_PER_PRODUCT) return all;
  const others = all.filter((offer) => offer.source !== 'user');
  const room = Math.max(0, MAX_OFFERS_PER_PRODUCT - (all.length - others.length));
  const keep = new Set(others.slice(others.length - room));
  return all.filter((offer) => offer.source === 'user' || keep.has(offer));
}
