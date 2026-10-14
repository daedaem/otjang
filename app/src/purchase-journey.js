import { SLOTS, SLOT_BY_ID, COLORS } from './data/slots.js';

export const JOURNEY_DECISIONS = ['buy', 'hold', 'skip'];
export const JOURNEY_STAGES = ['candidate', 'ordered', 'received', 'kept', 'returned'];
export const JOURNEY_ACTIONS = [...JOURNEY_DECISIONS, 'ordered', 'received', 'kept', 'returned', 'worn'];
export const MAX_PURCHASE_JOURNEYS = 200;
export const MAX_JOURNEY_HISTORY = 512;
export const MAX_WARDROBE_STATE_BYTES = 850000;

const purchaseKinds = new Set(SLOTS.map((slot) => slot.shape));
const purchaseCandidateKeys = [
  'productId', 'url', 'originalUrl', 'slot', 'kind', 'gender', 'color', 'colorSource',
  'brand', 'name', 'price', 'priceSource', 'checkedAt', 'source', 'classificationConfirmed',
];
const purchaseJourneyKeys = [
  'id', 'candidate', 'decision', 'stage', 'absence', 'intent', 'option',
  'reason', 'garmentId', 'wearCount', 'history', 'relatedGarmentIds',
  'replacementGarmentId', 'replacementConfirmed', 'forkedFrom',
];
function purchaseKeys(value, allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).length !== allowed.length ||
      Object.keys(value).some((key) => !allowed.includes(key)))
    throw new Error('지원하지 않는 구매 기록 형식입니다. 원본을 보존했습니다.');
}
function purchaseText(value, max) {
  return typeof value === 'string' && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value);
}
function purchaseInstant(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}
function purchaseCheckedDate(value) {
  if (value === null) return true;
  if (purchaseInstant(value)) return true;
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
// These are saved outbound links, not fetched pages. Reject local/private URLs
// and credentials before they can reach the UI; this is not DNS verification.
export function isPublicPurchaseUrl(value) {
  if (!purchaseText(value, 2048) || !/^https:\/\//i.test(value) || value.trim() !== value || /[\s\\]/.test(value)) return false;
  let parsed;
  try { parsed = new URL(value); } catch { return false; }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port && parsed.port !== '443') return false;
  const host = parsed.hostname.toLowerCase().replace(/\.$/, '');
  if (!host || host === 'localhost' || /\.(?:localhost|local|internal|lan|home|test|invalid)$/.test(host)) return false;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    const [a, b, c] = host.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
      a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 ||
      a === 192 && b === 168 || a === 100 && b >= 64 && b <= 127 ||
      a === 192 && b === 0 && (c === 0 || c === 2) ||
      a === 198 && (b === 18 || b === 19 || b === 51 && c === 100) ||
      a === 203 && b === 0 && c === 113);
  }
  if (host.startsWith('['))
    return /^\[[23][a-f0-9]{0,3}:/.test(host) && !/^\[2001:db8(?::|\])/.test(host);
  return host.length <= 253 && host.includes('.') && host.split('.').every((part) =>
    /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(part));
}
export function validatePurchaseCandidate(candidate) {
  purchaseKeys(candidate, purchaseCandidateKeys);
  if (!(candidate.productId === null || typeof candidate.productId === 'string' && /^ms-\d+$/.test(candidate.productId)) ||
      !isPublicPurchaseUrl(candidate.url) || !isPublicPurchaseUrl(candidate.originalUrl) || !['m', 'f'].includes(candidate.gender) ||
      !(candidate.kind === null || purchaseKinds.has(candidate.kind)) ||
      !(candidate.slot === null || SLOT_BY_ID[candidate.slot]?.g === candidate.gender.toUpperCase() &&
        SLOT_BY_ID[candidate.slot]?.shape === candidate.kind))
    throw new Error('구매 후보의 링크·종류·상품 정보를 확인해 주세요.');
  if (!(candidate.color === null || Object.hasOwn(COLORS, candidate.color)) ||
      ![null, 'user', 'name', 'curation', 'image'].includes(candidate.colorSource) ||
      (candidate.color === null) !== (candidate.colorSource === null) ||
      !purchaseText(candidate.brand, 120) || !purchaseText(candidate.name, 160) ||
      !(candidate.price === null || Number.isSafeInteger(candidate.price) && candidate.price >= 0 && candidate.price <= 1000000000) ||
      ![null, 'catalog', 'user'].includes(candidate.priceSource) ||
      (candidate.price === null) !== (candidate.priceSource === null) ||
      !purchaseCheckedDate(candidate.checkedAt) || !['catalog', 'user'].includes(candidate.source) ||
      typeof candidate.classificationConfirmed !== 'boolean' ||
      candidate.classificationConfirmed && candidate.kind === null)
    throw new Error('구매 후보의 확인 정보가 올바르지 않습니다.');
  return candidate;
}
export function validatePurchaseJourney(journey) {
  purchaseKeys(journey, purchaseJourneyKeys);
  validatePurchaseCandidate(journey.candidate);
  if (typeof journey.id !== 'string' || !/^[-\w]{1,100}$/.test(journey.id) ||
      ![null, ...JOURNEY_DECISIONS].includes(journey.decision) || !JOURNEY_STAGES.includes(journey.stage) ||
      !['unknown', 'absent', 'present'].includes(journey.absence) || !['add', 'replace'].includes(journey.intent) ||
      !purchaseText(journey.option, 160) || !purchaseText(journey.reason, 500) ||
      !(journey.garmentId === null || typeof journey.garmentId === 'string' && /^[-\w]{1,100}$/.test(journey.garmentId)) ||
      !Number.isSafeInteger(journey.wearCount) || journey.wearCount < 0 || journey.wearCount > 1000000 ||
      !Array.isArray(journey.history) || !journey.history.length || journey.history.length > MAX_JOURNEY_HISTORY ||
      !(journey.forkedFrom === null || typeof journey.forkedFrom === 'string' && /^[-\w]{1,100}$/.test(journey.forkedFrom)) ||
      journey.forkedFrom === journey.id ||
      !Array.isArray(journey.relatedGarmentIds) || journey.relatedGarmentIds.length > 200 ||
      journey.relatedGarmentIds.some((id) => typeof id !== 'string' || !/^[-\w]{1,100}$/.test(id)) ||
      new Set(journey.relatedGarmentIds).size !== journey.relatedGarmentIds.length ||
      !(journey.replacementGarmentId === null || typeof journey.replacementGarmentId === 'string' && /^[-\w]{1,100}$/.test(journey.replacementGarmentId)) ||
      typeof journey.replacementConfirmed !== 'boolean' ||
      journey.replacementConfirmed && !journey.replacementGarmentId ||
      journey.replacementGarmentId !== null && journey.replacementGarmentId === journey.garmentId)
    throw new Error('구매 진행 기록을 읽지 못했습니다. 원본을 보존했습니다.');
  let previous = '', stage = 'candidate', decision = null, worn = 0, everKept = false;
  journey.history.forEach((entry, index) => {
    purchaseKeys(entry, ['action', 'at']);
    if (!purchaseInstant(entry.at) || entry.at < previous ||
        !['created', ...JOURNEY_ACTIONS].includes(entry.action) ||
        (index === 0 ? entry.action !== 'created' : entry.action === 'created'))
      throw new Error('구매 기록의 날짜나 순서를 확인해 주세요.');
    previous = entry.at;
    if (JOURNEY_DECISIONS.includes(entry.action)) decision = entry.action;
    else if (entry.action === 'ordered') {
      if (stage !== 'candidate') throw new Error('구매 진행 순서가 올바르지 않습니다.');
      stage = 'ordered';
    } else if (entry.action === 'received') {
      if (!['ordered', 'returned'].includes(stage)) throw new Error('수령 확인 전에 주문 기록을 확인해 주세요.');
      stage = 'received';
    } else if (entry.action === 'kept') {
      if (stage !== 'received') throw new Error('보관 결정 전에 수령 기록을 확인해 주세요.');
      stage = 'kept';
      everKept = true;
    } else if (entry.action === 'returned') {
      if (!['received', 'kept'].includes(stage)) throw new Error('반품 확인 전에 수령 기록을 확인해 주세요.');
      stage = 'returned';
    } else if (entry.action === 'worn') {
      if (stage !== 'kept') throw new Error('계속 보관하기로 결정한 옷만 착용을 기록할 수 있어요.');
      worn++;
    }
  });
  if (stage !== journey.stage || decision !== journey.decision || worn !== journey.wearCount ||
      journey.garmentId !== null && !['received', 'kept', 'returned'].includes(stage) ||
      journey.replacementConfirmed && !everKept)
    throw new Error('구매 상태와 기록이 다릅니다. 원본을 보존했습니다.');
  return journey;
}
export function createPurchaseJourney(candidate, { id = `j_${crypto.randomUUID()}`, at = new Date().toISOString() } = {}) {
  validatePurchaseCandidate(candidate);
  return validatePurchaseJourney({
    id, candidate: structuredClone(candidate), decision: null, stage: 'candidate',
    absence: 'unknown', intent: 'add', option: '', reason: '', garmentId: null,
    relatedGarmentIds: [], replacementGarmentId: null, replacementConfirmed: false,
    forkedFrom: null,
    wearCount: 0, history: [{ action: 'created', at }],
  });
}
// Pure transitions. A seller visit and an intention to buy never imply payment.
// The UI commits receipt plus garment creation together in the same transaction.
export function transitionPurchaseJourney(journey, action, { at = new Date().toISOString() } = {}) {
  validatePurchaseJourney(journey);
  if (!JOURNEY_ACTIONS.includes(action)) throw new Error('지원하지 않는 구매 동작입니다.');
  if (journey.history.length >= MAX_JOURNEY_HISTORY)
    throw new Error('이 구매 기록의 변경이 너무 많아요. 백업한 뒤 새 구매 기록을 만들어 주세요.');
  const next = structuredClone(journey);
  if (JOURNEY_DECISIONS.includes(action)) next.decision = action;
  else if (action === 'worn') next.wearCount++;
  else next.stage = action;
  next.history.push({ action, at });
  return validatePurchaseJourney(next);
}

// Receipt stays provisional until the customer explicitly chooses to keep it.
// Inactive records/photos remain intact; a re-receipt reuses the same unit ID.
export function inactivePurchaseGarmentIds(state) {
  const journeys = state.journeys || [];
  const active = new Set(journeys.filter((journey) => journey.stage === 'kept').map((journey) => journey.garmentId).filter(Boolean));
  const inactive = new Set(journeys.filter((journey) => ['received', 'returned'].includes(journey.stage) && journey.garmentId && !active.has(journey.garmentId)).map((journey) => journey.garmentId));
  for (const journey of journeys)
    if (journey.replacementConfirmed && journey.replacementGarmentId && journey.history.some((entry) => entry.action === 'kept'))
      inactive.add(journey.replacementGarmentId);
  return inactive;
}
// Existing callers keep the broader inactive-item policy through this alias.
export function returnedGarmentIds(state) {
  return inactivePurchaseGarmentIds(state);
}
