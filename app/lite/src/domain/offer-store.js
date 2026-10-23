// Seller notes are wardrobe data in schema 7: they share the snapshot's atomic
// save, backup and account choice. The localStorage API below remains only for
// reading/importing versions published before schema 7.
import { validateOffer, MAX_OFFERS_PER_PRODUCT } from './offers.js';
import { COLORS } from './data/slots.js';

export const OFFER_STORE_KEY = 'eoul:offers:v1';
const MAX_PRODUCTS = 100;
export const MAX_OFFER_RECORDS = MAX_PRODUCTS;
export const MAX_OFFER_STATE_BYTES = 200 * 1024;
const RECORD_KEYS = ['ref', 'requested', 'offers', 'refresh', 'touchedAt'];
const OFFER_KEYS = ['id', 'seller', 'url', 'price', 'shipping', 'color', 'size', 'stock', 'sameProduct', 'source', 'checkedAt', 'title'];

function shape(value, keys) {
  return !!value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}
function instant(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}
function referenceOK(ref) {
  if (typeof ref !== 'string' || !ref || ref.length > 2000) return false;
  if (/^ms-\d+$/.test(ref)) return true;
  try {
    const url = new URL(ref);
    return url.protocol === 'https:' && !url.username && !url.password && url.href === ref;
  } catch { return false; }
}
function offerStateError(message, code = 'invalid-offer-records') {
  return Object.assign(new Error(message), { code });
}
function validateRequested(value) {
  if (!shape(value, ['color', 'size']) ||
      !(value.color === null || (typeof value.color === 'string' && Object.hasOwn(COLORS, value.color))) ||
      !(value.size === null || (typeof value.size === 'string' && value.size.length > 0 && value.size.length <= 20 &&
        value.size === value.size.trim() && !/[\u0000-\u001f\u007f]/.test(value.size))))
    throw offerStateError('사려는 색·사이즈 기록을 읽지 못했어요. 원본을 보존했습니다.');
}

/** Persistence is strict: a damaged backup must never be silently normalized. */
export function validateOfferRecords(records) {
  if (!Array.isArray(records) || records.length > MAX_OFFER_RECORDS)
    throw offerStateError(`판매처 가격은 상품 ${MAX_OFFER_RECORDS}개까지 보관할 수 있어요. 필요 없는 상품의 가격 기록을 지워 주세요.`, 'offer-full');
  const refs = new Set();
  for (const record of records) {
    if (!shape(record, RECORD_KEYS) || !referenceOK(record.ref) || !instant(record.touchedAt))
      throw offerStateError('판매처 가격 기록 형식을 읽지 못했어요. 원본을 보존했습니다.');
    if (refs.has(record.ref)) throw offerStateError('판매처 가격의 상품이 중복됩니다.');
    refs.add(record.ref);
    validateRequested(record.requested);
    if (record.refresh !== null && (!shape(record.refresh, ['at', 'ok', 'message']) ||
        !instant(record.refresh.at) || typeof record.refresh.ok !== 'boolean' ||
        typeof record.refresh.message !== 'string' || record.refresh.message.length > 1000 ||
        /[\u0000-\u001f\u007f]/.test(record.refresh.message)))
      throw offerStateError('가격 갱신 기록을 읽지 못했어요. 원본을 보존했습니다.');
    if (!Array.isArray(record.offers) || record.offers.length > MAX_OFFERS_PER_PRODUCT)
      throw offerStateError(`한 상품에는 판매처 ${MAX_OFFERS_PER_PRODUCT}곳까지 기록할 수 있어요. 필요 없는 판매처를 지워 주세요.`, 'offer-full');
    const ids = new Set();
    for (const offer of record.offers) {
      if (!shape(offer, OFFER_KEYS)) throw offerStateError('판매처 가격의 상세 형식을 읽지 못했어요. 원본을 보존했습니다.');
      const normalized = validateOffer(offer);
      if (OFFER_KEYS.some((key) => normalized[key] !== offer[key]))
        throw offerStateError('판매처 가격의 상세 정보가 올바르지 않아요. 원본을 보존했습니다.');
      if (ids.has(offer.id)) throw offerStateError('한 상품의 판매처 기록 ID가 중복됩니다.');
      ids.add(offer.id);
    }
  }
  if (new TextEncoder().encode(JSON.stringify(records)).length > MAX_OFFER_STATE_BYTES)
    throw offerStateError('판매처 가격 기록이 너무 커요. 백업 후 필요 없는 상품의 가격 기록을 지워 주세요. 기존 기록은 유지했습니다.', 'offer-budget');
  return records;
}

/** Read an independent copy so unsaved form edits cannot mutate the snapshot. */
export function readOfferRecord(records, ref) {
  const record = records.find((entry) => entry.ref === ref);
  return structuredClone(record ? { requested: record.requested, offers: record.offers, refresh: record.refresh } :
    { requested: { color: null, size: null }, offers: [], refresh: null });
}

/** Pure replacement; only the caller's successful wardrobe commit saves it. */
export function setOfferRecord(records, ref, { requested, offers, refresh }, now = new Date()) {
  validateOfferRecords(records);
  const record = { ref, requested: { color: requested?.color ?? null, size: requested?.size ?? null },
    offers: structuredClone(offers), refresh: structuredClone(refresh ?? null), touchedAt: now.toISOString() };
  const next = records.some((entry) => entry.ref === ref)
    ? records.map((entry) => structuredClone(entry.ref === ref ? record : entry))
    : [...structuredClone(records), record];
  return validateOfferRecords(next);
}

/** Explicit user deletion, also used to free the bounded record capacity. */
export function removeOfferRecord(records, ref) {
  validateOfferRecords(records);
  return structuredClone(records.filter((entry) => entry.ref !== ref));
}

/** Lossless legacy import. Failure leaves the raw localStorage source intact. */
export function legacyOfferRecords(raw) {
  if (raw === null) return [];
  let value;
  try { value = JSON.parse(raw); } catch { throw offerStateError('이전 판매처 가격 기록을 읽지 못했어요. 원본을 보존했습니다.'); }
  if (!shape(value, ['v', 'products']) || value.v !== 1 || !value.products ||
      typeof value.products !== 'object' || Array.isArray(value.products))
    throw offerStateError('이전 판매처 가격 기록 형식을 읽지 못했어요. 원본을 보존했습니다.');
  const records = Object.entries(value.products).map(([ref, entry]) => {
    if (!shape(entry, ['requested', 'offers', 'refresh', 'touchedAt']))
      throw offerStateError('이전 판매처 가격 상세 기록을 읽지 못했어요. 원본을 보존했습니다.');
    return { ref, ...structuredClone(entry) };
  });
  return validateOfferRecords(records);
}

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
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password && parsed.href.length <= 2000 ? parsed.href : null;
  } catch { return null; }
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
