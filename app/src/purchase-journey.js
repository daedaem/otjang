import { SLOTS, SLOT_BY_ID, COLORS } from './data/slots.js';
import { legacyPurchaseV4 } from './legacy-purchase-v4.js';

export const JOURNEY_DECISIONS = ['buy', 'hold', 'skip'];
export const JOURNEY_STAGES = ['candidate', 'ordered', 'received', 'kept', 'returned'];
export const JOURNEY_DETAIL_ACTIONS = ['note', 'candidate-edit', 'details-change', 'garment-confirmed', 'correction', 'imported'];
export const JOURNEY_ACTIONS = [...JOURNEY_DECISIONS, 'ordered', 'received', 'kept', 'returned', 'worn', ...JOURNEY_DETAIL_ACTIONS];
export const JOURNEY_FITS = ['small', 'right', 'large'];
export const JOURNEY_RETURN_REASONS = ['size', 'color', 'quality', 'change-of-mind', 'other'];
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
  'replacementGarmentId', 'replacementConfirmed', 'forkedFrom', 'feedback',
];
const purchaseDetailKeys = [
  'candidate', 'option', 'reason', 'feedback', 'absence', 'intent',
  'relatedGarmentIds', 'replacementGarmentId', 'replacementConfirmed', 'garmentId',
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
export function validatePurchaseFeedback(feedback) {
  purchaseKeys(feedback, ['fit', 'returnReason']);
  if (![null, ...JOURNEY_FITS].includes(feedback.fit) ||
      ![null, ...JOURNEY_RETURN_REASONS].includes(feedback.returnReason))
    throw new Error('착용·반품의 확인 정보가 올바르지 않습니다.');
  return feedback;
}
function validatePurchaseDetails(details) {
  purchaseKeys(details, purchaseDetailKeys);
  validatePurchaseCandidate(details.candidate);
  validatePurchaseFeedback(details.feedback);
  if (!['unknown', 'absent', 'present'].includes(details.absence) || !['add', 'replace'].includes(details.intent) ||
      !purchaseText(details.option, 160) || !purchaseText(details.reason, 500) ||
      !(details.garmentId === null || typeof details.garmentId === 'string' && /^[-\w]{1,100}$/.test(details.garmentId)) ||
      !Array.isArray(details.relatedGarmentIds) || details.relatedGarmentIds.length > 200 ||
      details.relatedGarmentIds.some((id) => typeof id !== 'string' || !/^[-\w]{1,100}$/.test(id)) ||
      new Set(details.relatedGarmentIds).size !== details.relatedGarmentIds.length ||
      !(details.replacementGarmentId === null || typeof details.replacementGarmentId === 'string' && /^[-\w]{1,100}$/.test(details.replacementGarmentId)) ||
      typeof details.replacementConfirmed !== 'boolean' ||
      details.replacementConfirmed && !details.replacementGarmentId ||
      details.replacementGarmentId !== null && details.replacementGarmentId === details.garmentId)
    throw new Error('구매 진행 기록을 읽지 못했습니다. 원본을 보존했습니다.');
  return details;
}
// Event values are copies of what the user had actually recorded at this point.
// They never borrow later candidate edits, options or return feedback.
export function purchaseJourneyDetails(journey) {
  const details = Object.fromEntries(purchaseDetailKeys.map((key) => [key, structuredClone(journey[key])]));
  return validatePurchaseDetails(details);
}
export function validatePurchaseJourney(journey) {
  purchaseKeys(journey, purchaseJourneyKeys);
  purchaseJourneyDetails(journey);
  if (typeof journey.id !== 'string' || !/^[-\w]{1,100}$/.test(journey.id) ||
      ![null, ...JOURNEY_DECISIONS].includes(journey.decision) || !JOURNEY_STAGES.includes(journey.stage) ||
      !Number.isSafeInteger(journey.wearCount) || journey.wearCount < 0 || journey.wearCount > 1000000 ||
      !Array.isArray(journey.history) || !journey.history.length || journey.history.length > MAX_JOURNEY_HISTORY ||
      !(journey.forkedFrom === null || typeof journey.forkedFrom === 'string' && /^[-\w]{1,100}$/.test(journey.forkedFrom)) ||
      journey.forkedFrom === journey.id)
    throw new Error('구매 진행 기록을 읽지 못했습니다. 원본을 보존했습니다.');
  let previous = '', stage = 'candidate', decision = null, worn = 0, everKept = false, detailsStarted = false;
  journey.history.forEach((entry, index) => {
    purchaseKeys(entry, ['action', 'at', 'details']);
    if (!purchaseInstant(entry.at) || entry.at < previous ||
        !['created', ...JOURNEY_ACTIONS].includes(entry.action) ||
        (index === 0 ? entry.action !== 'created' : entry.action === 'created'))
      throw new Error('구매 기록의 날짜나 순서를 확인해 주세요.');
    if (entry.details === null) {
      // Only the contiguous legacy prefix may lack past values. New metadata
      // actions cannot masquerade as events migrated from schema 4.
      if (detailsStarted || JOURNEY_DETAIL_ACTIONS.includes(entry.action))
        throw new Error('구매 기록의 당시 확인 정보가 빠졌습니다. 원본을 보존했습니다.');
    } else {
      validatePurchaseDetails(entry.details);
      detailsStarted = true;
    }
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
  const journey = {
    id, candidate: structuredClone(candidate), decision: null, stage: 'candidate',
    absence: 'unknown', intent: 'add', option: '', reason: '', garmentId: null,
    feedback: { fit: null, returnReason: null },
    relatedGarmentIds: [], replacementGarmentId: null, replacementConfirmed: false,
    forkedFrom: null,
    wearCount: 0, history: [],
  };
  journey.history.push({ action: 'created', at, details: purchaseJourneyDetails(journey) });
  return validatePurchaseJourney(journey);
}
// Pure transitions. A seller visit and an intention to buy never imply payment.
// The UI commits receipt plus garment creation together in the same transaction.
export function transitionPurchaseJourney(journey, action, { at = new Date().toISOString(), changes = {} } = {}) {
  validatePurchaseJourney(journey);
  if (!JOURNEY_ACTIONS.includes(action)) throw new Error('지원하지 않는 구매 동작입니다.');
  if (!changes || typeof changes !== 'object' || Array.isArray(changes) ||
      Object.keys(changes).some((key) => !purchaseDetailKeys.includes(key)))
    throw new Error('지원하지 않는 구매 기록 변경입니다. 원본을 보존했습니다.');
  if (journey.history.length >= MAX_JOURNEY_HISTORY)
    throw new Error('이 구매 기록의 변경이 너무 많아요. 백업한 뒤 새 구매 기록을 만들어 주세요.');
  const next = { ...structuredClone(journey), ...structuredClone(changes) };
  if (JOURNEY_DECISIONS.includes(action)) next.decision = action;
  else if (action === 'worn') next.wearCount++;
  else if (!JOURNEY_DETAIL_ACTIONS.includes(action)) next.stage = action;
  next.history.push({ action, at, details: purchaseJourneyDetails(next) });
  return validatePurchaseJourney(next);
}

export function upgradePurchaseJourneyV4(journey, { at = new Date().toISOString() } = {}) {
  legacyPurchaseV4.validatePurchaseJourney(journey);
  if (!purchaseInstant(at)) throw new Error('구매 기록의 이전 날짜를 확인해 주세요.');
  const next = {
    ...structuredClone(journey),
    feedback: { fit: null, returnReason: null },
    history: journey.history.map((entry) => ({ ...entry, details: null })),
  };
  // Existing current values are known at import, never at the old action dates.
  // A full log or a future-dated legacy event keeps every value without adding
  // an invented timestamp or discarding a real old event.
  if (next.history.length < MAX_JOURNEY_HISTORY && at >= next.history.at(-1).at)
    next.history.push({ action: 'imported', at, details: purchaseJourneyDetails(next) });
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
