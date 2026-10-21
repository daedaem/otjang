// Frozen actual e51f118 schema 4 purchase validator and classification tables.
// Do not loosen it when changing the current schema: unknown legacy fields must fail closed.
export const legacyPurchaseV4 = (() => {
const SLOTS = [{"id":"m-oxford","g":"M","shape":"shirt"},{"id":"m-stripe-shirt","g":"M","shape":"shirt"},{"id":"m-chambray","g":"M","shape":"shirt"},{"id":"m-flannel","g":"M","shape":"shirt"},{"id":"m-tee","g":"M","shape":"tee"},{"id":"m-longtee","g":"M","shape":"longtee"},{"id":"m-henley","g":"M","shape":"longtee"},{"id":"m-polo","g":"M","shape":"polo"},{"id":"m-rugby","g":"M","shape":"polo"},{"id":"m-sweat","g":"M","shape":"sweat"},{"id":"m-hoodie","g":"M","shape":"sweat"},{"id":"m-knit","g":"M","shape":"knit"},{"id":"m-cable","g":"M","shape":"knit"},{"id":"m-vest","g":"M","shape":"vest"},{"id":"m-cardigan","g":"M","shape":"cardigan"},{"id":"m-blazer","g":"M","shape":"blazer"},{"id":"m-trucker","g":"M","shape":"jacket"},{"id":"m-chore","g":"M","shape":"jacket"},{"id":"m-field","g":"M","shape":"jacket"},{"id":"m-harrington","g":"M","shape":"jacket"},{"id":"m-varsity","g":"M","shape":"jacket"},{"id":"m-deck","g":"M","shape":"jacket"},{"id":"m-wax","g":"M","shape":"jacket"},{"id":"m-fleece","g":"M","shape":"jacket"},{"id":"m-shell","g":"M","shape":"jacket"},{"id":"m-down","g":"M","shape":"down"},{"id":"m-downvest","g":"M","shape":"vest"},{"id":"m-balmacaan","g":"M","shape":"coat"},{"id":"m-trench","g":"M","shape":"coat"},{"id":"m-peacoat","g":"M","shape":"coat"},{"id":"m-chino","g":"M","shape":"pants"},{"id":"m-denim-raw","g":"M","shape":"jeans"},{"id":"m-denim","g":"M","shape":"jeans"},{"id":"m-slacks","g":"M","shape":"pants"},{"id":"m-work-pants","g":"M","shape":"pants"},{"id":"m-cargo","g":"M","shape":"pants"},{"id":"m-cords","g":"M","shape":"pants"},{"id":"m-loafer","g":"M","shape":"loafer"},{"id":"m-derby","g":"M","shape":"loafer"},{"id":"m-workboots","g":"M","shape":"boot"},{"id":"m-chelsea","g":"M","shape":"boot"},{"id":"m-white-sneaker","g":"M","shape":"sneaker"},{"id":"m-canvas","g":"M","shape":"sneaker"},{"id":"m-runner","g":"M","shape":"sneaker"},{"id":"m-trail","g":"M","shape":"sneaker"},{"id":"m-cap","g":"M","shape":"cap"},{"id":"m-beanie","g":"M","shape":"beanie"},{"id":"m-belt","g":"M","shape":"belt"},{"id":"f-shirt","g":"F","shape":"shirt"},{"id":"f-stripe","g":"F","shape":"shirt"},{"id":"f-tee","g":"F","shape":"tee"},{"id":"f-knit","g":"F","shape":"knit"},{"id":"f-sweat","g":"F","shape":"sweat"},{"id":"f-cardigan","g":"F","shape":"cardigan"},{"id":"f-blazer","g":"F","shape":"blazer"},{"id":"f-trench","g":"F","shape":"coat"},{"id":"f-coat","g":"F","shape":"coat"},{"id":"f-jacket","g":"F","shape":"jacket"},{"id":"f-padding","g":"F","shape":"down"},{"id":"f-denim","g":"F","shape":"jeans"},{"id":"f-slacks","g":"F","shape":"pants"},{"id":"f-skirt","g":"F","shape":"skirt"},{"id":"f-dress","g":"F","shape":"dress"},{"id":"f-loafer","g":"F","shape":"loafer"},{"id":"f-flat","g":"F","shape":"loafer"},{"id":"f-sneaker","g":"F","shape":"sneaker"},{"id":"f-boots","g":"F","shape":"boot"},{"id":"f-bag","g":"F","shape":"bag"}];
const SLOT_BY_ID = Object.fromEntries(SLOTS.map((slot) => [slot.id, slot]));
const COLORS = {"white":true,"ivory":true,"beige":true,"blue":true,"grey":true,"olive":true,"brown":true,"indigo":true,"charcoal":true,"navy":true,"black":true,"green":true,"red":true,"pink":true,"yellow":true,"purple":true,"orange":true};
const JOURNEY_DECISIONS = ['buy', 'hold', 'skip'];
const JOURNEY_STAGES = ['candidate', 'ordered', 'received', 'kept', 'returned'];
const JOURNEY_ACTIONS = [...JOURNEY_DECISIONS, 'ordered', 'received', 'kept', 'returned', 'worn'];
const MAX_PURCHASE_JOURNEYS = 200;
const MAX_JOURNEY_HISTORY = 512;
const MAX_WARDROBE_STATE_BYTES = 850000;

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
function isPublicPurchaseUrl(value) {
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
function validatePurchaseCandidate(candidate) {
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
function validatePurchaseJourney(journey) {
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
return { validatePurchaseCandidate, validatePurchaseJourney };
})();
