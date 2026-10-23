import { createPurchaseJourney, transitionPurchaseJourney } from '../../../app/lite/src/domain/purchase-journey.js';
import { validateWardrobe, makeGarment, wardrobeView } from '../../../app/lite/src/domain/wardrobe.js';
import { journeyStorageUsage } from './wardrobe-store.js';

export const ORDER_IMPORT_FORMAT = 'eoul-orders';
export const ORDER_IMPORT_LIMIT = 100;
export const ORDER_STATUS_LABELS = {
  ordered: '주문·결제', shipping: '배송 중', delivered: '배송 완료', confirmed: '구매 확정',
  cancelled: '취소 완료', returning: '반품 진행', returned: '반품 완료', exchanging: '교환 진행', unknown: '상태 미확인',
};
const orderItemFields = ['key', 'identity', 'productId', 'url', 'name', 'brand', 'option', 'orderDate', 'status', 'quantity', 'amount'];
function orderKeys(value, allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).length !== allowed.length || Object.keys(value).some((key) => !allowed.includes(key)))
    throw new Error('지원하지 않는 구매내역 형식이에요. 확장프로그램에서 다시 가져와 주세요.');
}
function orderText(value, max) {
  return typeof value === 'string' && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value);
}
function orderInstant(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}
function orderDateValid(value) {
  return value === null || typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export function parseOrderImport(input) {
  if (typeof input !== 'string' || new TextEncoder().encode(input).length > 250000)
    throw new Error('구매내역은 250KB 이하로 나눠 가져와 주세요.');
  let data;
  try { data = JSON.parse(input); } catch { throw new Error('구매내역 파일이나 확장프로그램에서 복사한 내용을 넣어 주세요.'); }
  orderKeys(data, ['format', 'version', 'retailer', 'extractedAt', 'items']);
  if (data.format !== ORDER_IMPORT_FORMAT || data.version !== 1 || data.retailer !== 'musinsa' ||
      !orderInstant(data.extractedAt) || !Array.isArray(data.items) || !data.items.length || data.items.length > ORDER_IMPORT_LIMIT)
    throw new Error('무신사 구매내역을 한 번에 1~100개까지 가져올 수 있어요.');
  const keys = new Set();
  for (const row of data.items) {
    orderKeys(row, orderItemFields);
    if (typeof row.key !== 'string' || !/^[a-f0-9]{64}$/.test(row.key) || !['order', 'page'].includes(row.identity) ||
        typeof row.productId !== 'string' || !/^ms-\d{1,15}$/.test(row.productId) ||
        row.url !== `https://www.musinsa.com/products/${row.productId.slice(3)}` ||
        !orderText(row.name, 160) || !row.name.trim() || !orderText(row.brand, 120) || !orderText(row.option, 160) ||
        !orderDateValid(row.orderDate) || !Object.hasOwn(ORDER_STATUS_LABELS, row.status) ||
        !(row.quantity === null || Number.isInteger(row.quantity) && row.quantity >= 1 && row.quantity <= 99) ||
        !(row.amount === null || Number.isSafeInteger(row.amount) && row.amount >= 0 && row.amount <= 1000000000))
      throw new Error('상품 주소·옵션·금액·주문 상태를 확인하지 못했어요. 기존 기록은 유지했어요.');
    if (keys.has(row.key)) throw new Error('같은 주문이 파일 안에 겹쳐 있어요. 다시 읽어 주세요.');
    keys.add(row.key);
  }
  return data;
}
export function importedOrderId(row) { return `j_musinsa_${row.key}`; }

// Source observations live in an existing immutable history snapshot. No new
// wardrobe/schema fields or fabricated past order/receipt/return events.
function orderSourceNote(row, extractedAt) {
  return `[무신사 주문내역 v1] · 주문일: ${row.orderDate || '미확인'} · 상태: ${ORDER_STATUS_LABELS[row.status]} · 수량: ${row.quantity ?? '미확인'} · 표시금액: ${row.amount ?? '미확인'} · 읽은 시각: ${extractedAt} · 식별: ${row.identity}`;
}
export function importedOrderInfo(journey) {
  if (!/^j_musinsa_[a-f0-9]{64}$/.test(journey?.id || '')) return null;
  const event = journey.history.find((entry) => entry.action === 'imported' && entry.details?.reason?.startsWith('[무신사 주문내역 v1] · '));
  if (!event) return null;
  const match = event.details.reason.match(/^\[무신사 주문내역 v1\] · 주문일: (\d{4}-\d{2}-\d{2}|미확인) · 상태: (.+?) · 수량: (\d+|미확인) · 표시금액: (\d+|미확인) · 읽은 시각: (\S+) · 식별: (order|page)$/);
  if (!match) return null;
  const status = Object.keys(ORDER_STATUS_LABELS).find((key) => ORDER_STATUS_LABELS[key] === match[2]);
  if (!status) return null;
  return { orderDate: match[1] === '미확인' ? null : match[1], status,
    quantity: match[3] === '미확인' ? null : Number(match[3]), amount: match[4] === '미확인' ? null : Number(match[4]),
    extractedAt: match[5], identity: match[6] };
}
export function planOrderImport(record, data, selectedKeys, { gender = 'M', at = new Date().toISOString() } = {}) {
  parseOrderImport(JSON.stringify(data));
  if (!['M', 'F'].includes(gender) || !orderInstant(at) || !Array.isArray(selectedKeys) ||
      new Set(selectedKeys).size !== selectedKeys.length || selectedKeys.some((key) => !data.items.some((row) => row.key === key)))
    throw new Error('가져올 주문을 다시 골라 주세요.');
  validateWardrobe(record);
  const existing = new Set(record.journeys.map((journey) => journey.id));
  const selected = new Set(selectedKeys);
  const added = data.items.filter((row) => selected.has(row.key) && !existing.has(importedOrderId(row))).map((row) => {
    const candidate = {
      productId: row.productId, url: row.url, originalUrl: row.url, slot: null, kind: null, gender: gender.toLowerCase(),
      color: null, colorSource: null, brand: row.brand, name: row.name,
      // An order's displayed amount is NOT today's listing price or proof of
      // an item-level net payment after coupons/shipping. Keep it in provenance.
      price: null, priceSource: null, checkedAt: null, source: 'user', classificationConfirmed: false,
    };
    return transitionPurchaseJourney(createPurchaseJourney(candidate, { id: importedOrderId(row), at }), 'imported',
      { at, changes: { option: row.option, reason: orderSourceNote(row, data.extractedAt) } });
  });
  const next = { ...structuredClone(record), journeys: [...structuredClone(record.journeys), ...added] };
  validateWardrobe(next);
  if (journeyStorageUsage(next).overBudget) throw new Error('구매 기록 공간이 부족해요. 백업 후 필요한 내역만 나눠 가져와 주세요.');
  return { next, added: added.length, skipped: selectedKeys.length - added.length };
}

// Called only after the customer explicitly confirms current ownership. All
// lifecycle acknowledgements are dated now, never backdated to the order date.
export function connectImportedOrder(record, id, candidate, { garmentId = null, at = new Date().toISOString() } = {}) {
  validateWardrobe(record);
  const original = record.journeys.find((j) => j.id === id), info = importedOrderInfo(original);
  if (!original || original.stage !== 'candidate' || !info ||
      !['ordered', 'shipping', 'delivered', 'confirmed'].includes(info.status) || !candidate.kind ||
      candidate.productId !== original.candidate.productId || candidate.url !== original.candidate.url)
    throw new Error('지금 가진 옷인지와 옷 종류를 먼저 확인해 주세요.');
  const existing = garmentId && wardrobeView(record).closet.find((g) => g.id === garmentId && g.source !== 'demo' && g.productId === original.candidate.productId);
  if (garmentId && !existing) throw new Error('연결할 기존 옷을 다시 골라 주세요.');
  const garment = existing || makeGarment({ id: `g_purchase_${id}`, kind: candidate.kind,
    slot: candidate.classificationConfirmed ? candidate.slot : null, gender: candidate.gender.toUpperCase(),
    color: candidate.colorSource === 'image' ? null : candidate.color,
    brand: candidate.brand || null, productId: candidate.productId, label: candidate.name, createdAt: at });
  if (!existing && record.garments.some((g) => g.id === garment.id)) throw new Error('이미 연결한 옷이 있어요. 기존 기록을 확인해 주세요.');
  let journey = transitionPurchaseJourney(original, 'candidate-edit', { at, changes: { candidate } });
  journey = transitionPurchaseJourney(journey, 'ordered', { at });
  journey = transitionPurchaseJourney(journey, 'received', { at, changes: { garmentId: garment.id } });
  journey = transitionPurchaseJourney(journey, 'kept', { at });
  const next = { ...structuredClone(record), demo: false, demoSelected: [],
    garments: existing ? structuredClone(record.garments) : [...structuredClone(record.garments), garment],
    journeys: record.journeys.map((j) => j.id === id ? journey : structuredClone(j)) };
  validateWardrobe(next);
  return { next, garmentId: garment.id };
}
