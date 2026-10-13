import { SLOTS, SLOT_BY_ID, STYLES, OCCASIONS } from './data/slots.js';

export const GARMENT_KINDS = [
  ['shirt', '셔츠'], ['tee', '티셔츠'], ['knit', '니트'], ['pants', '바지'],
  ['jeans', '청바지'], ['jacket', '재킷'], ['sneaker', '운동화'], ['cardigan', '카디건'],
  ['longtee', '긴팔 티'], ['sweat', '맨투맨'], ['polo', '폴로 셔츠'], ['blazer', '블레이저'],
  ['coat', '코트'], ['down', '패딩'], ['dress', '원피스'], ['skirt', '스커트'],
  ['loafer', '구두·로퍼'], ['boot', '부츠'], ['bag', '가방'], ['cap', '모자'], ['belt', '벨트'],
].map(([id, name]) => ({ id, name }));
const GARMENT_KIND_IDS = new Set(GARMENT_KINDS.map((kind) => kind.id));
export const DEMO_SLOTS = {
  M: ['m-oxford-white', 'm-oxford-blue', 'm-tee-white', 'm-denim', 'm-chino', 'm-sneaker-leather'],
  F: ['f-shirt-white', 'f-tee', 'f-knit', 'f-denim', 'f-slacks', 'f-sneaker'],
};

export function garmentKindName(kind) {
  return GARMENT_KINDS.find((row) => row.id === kind)?.name || '옷';
}

export function garmentLabel(garment) {
  return garment.label || SLOT_BY_ID[garment.slotId]?.name || garmentKindName(garment.kind);
}

export function garmentMatchesSlot(garment, slot) {
  return garment.gender === slot.g && (garment.slotId ? garment.slotId === slot.id : garment.kind === slot.shape);
}

export function newWardrobeState() {
  return { schema: 2, onboarded: true, gender: 'M', style: 'classic', occasion: null, budget: null,
    demo: true, demoSelected: [...DEMO_SLOTS.M], garments: [], saved: [], hidden: [], legacyFingerprint: null };
}

function virtualGarment(slotId, source) {
  const slot = SLOT_BY_ID[slotId];
  return { id: `${source}_${slotId}`, kind: slot.shape, gender: slot.g, slotId, source,
    photoId: null, label: '', attrs: null, createdAt: '2026-10-14T00:00:00.000Z' };
}

export function ownedGarments(state) {
  if (state.demo) return (state.demoSelected || state.owned || DEMO_SLOTS[state.gender || 'M']).filter((id) => SLOT_BY_ID[id]).map((id) => virtualGarment(id, 'demo'));
  if (Array.isArray(state.garments)) return state.garments;
  return (state.owned || []).filter((id) => SLOT_BY_ID[id]).map((id) => virtualGarment(id, 'legacy'));
}

export function ownedSlotIds(state) {
  const garments = ownedGarments(state);
  return SLOTS.filter((slot) => garments.some((garment) => garmentMatchesSlot(garment, slot))).map((slot) => slot.id);
}

export function wardrobeView(record, tab = 'home') {
  return { ...record, owned: ownedSlotIds(record), tab };
}

export function storedWardrobe(state) {
  const { schema, onboarded, gender, style, occasion, budget, demo, demoSelected, garments, saved, hidden, legacyFingerprint } = state;
  const record = { schema, onboarded, gender, style, occasion, budget, demo, demoSelected, garments, saved, hidden, legacyFingerprint };
  validateWardrobe(record);
  return structuredClone(record);
}

function assertRecordKeys(value, allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some((key) => !allowed.includes(key))) throw new Error('저장된 자료의 형식을 확인할 수 없습니다. 원본을 보존했습니다.');
}

export function validateWardrobe(record) {
  assertRecordKeys(record, ['schema', 'onboarded', 'gender', 'style', 'occasion', 'budget', 'demo', 'demoSelected', 'garments', 'saved', 'hidden', 'legacyFingerprint']);
  if (!(record.legacyFingerprint === null || typeof record.legacyFingerprint === 'string' && /^[a-f0-9]{64}$/.test(record.legacyFingerprint))) throw new Error('이전 옷장 확인 기록이 올바르지 않습니다.');
  if (record.schema !== 2 || typeof record.onboarded !== 'boolean' || typeof record.demo !== 'boolean') throw new Error('지원하지 않는 옷장 형식입니다. 원본을 보존했습니다.');
  if (![null, 'M', 'F'].includes(record.gender) || !(record.style === null || Object.hasOwn(STYLES, record.style)) || !(record.occasion === null || Object.hasOwn(OCCASIONS, record.occasion))) throw new Error('저장된 취향을 읽지 못했습니다.');
  if (record.onboarded && (!record.gender || !record.style)) throw new Error('저장된 시작 정보가 올바르지 않습니다.');
  if (!(record.budget === null || Number.isFinite(record.budget) && record.budget >= 0)) throw new Error('저장된 예산이 올바르지 않습니다.');
  for (const key of ['saved', 'hidden']) if (!Array.isArray(record[key]) || record[key].some((id) => typeof id !== 'string' || !/^ms-\d+$/.test(id))) throw new Error('저장된 상품 목록이 올바르지 않습니다.');
  if (!Array.isArray(record.demoSelected) || record.demoSelected.some((id) => !SLOT_BY_ID[id]) || new Set(record.demoSelected).size !== record.demoSelected.length) throw new Error('예시 옷장 정보가 올바르지 않습니다.');
  if (!Array.isArray(record.garments) || record.demo && record.garments.length) throw new Error('옷장 자료를 안전하게 읽을 수 없습니다.');
  if (record.garments.length > 200) throw new Error('현재 옷장은 최대 200벌까지 보관할 수 있어요. 백업 후 필요 없는 옷을 정리해 주세요.');
  const ids = new Set();
  for (const garment of record.garments) {
    assertRecordKeys(garment, ['id', 'kind', 'gender', 'slotId', 'source', 'photoId', 'label', 'attrs', 'createdAt']);
    if (typeof garment.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(garment.id) || ids.has(garment.id)) throw new Error('옷의 식별 정보가 올바르지 않습니다.');
    ids.add(garment.id);
    if (!GARMENT_KIND_IDS.has(garment.kind) || !['M', 'F'].includes(garment.gender) || !['user', 'legacy'].includes(garment.source)) throw new Error('옷 종류 또는 출처를 읽을 수 없습니다.');
    if (!(garment.slotId === null || SLOT_BY_ID[garment.slotId]?.g === garment.gender && SLOT_BY_ID[garment.slotId]?.shape === garment.kind)) throw new Error('옷 종류 연결이 올바르지 않습니다.');
    if (!(garment.photoId === null || typeof garment.photoId === 'string' && /^p_[a-f0-9]{64}$/.test(garment.photoId))) throw new Error('사진 참조가 올바르지 않습니다.');
    if (typeof garment.label !== 'string' || garment.label.length > 80 || garment.attrs !== null || typeof garment.createdAt !== 'string' || !Number.isFinite(Date.parse(garment.createdAt))) throw new Error('옷의 상세 정보를 읽을 수 없습니다.');
  }
  return record;
}

export function migrateLegacyWardrobe(raw) {
  if (raw === null) return newWardrobeState();
  const legacy = JSON.parse(raw);
  assertRecordKeys(legacy, ['onboarded', 'gender', 'style', 'occasion', 'budget', 'owned', 'saved', 'hidden', 'tab', 'demo']);
  if (Object.hasOwn(legacy, 'demo') && typeof legacy.demo !== 'boolean') throw new Error('이전 예시 옷장 상태를 읽지 못했습니다. 원본을 보존했습니다.');
  if (!Array.isArray(legacy.owned) || legacy.owned.some((id) => !SLOT_BY_ID[id])) throw new Error('이전 옷장 종류를 읽지 못했습니다. 원본을 보존했습니다.');
  const ids = [...new Set(legacy.owned)];
  const record = { ...newWardrobeState(), onboarded: legacy.onboarded ?? false, gender: legacy.gender ?? null,
    style: legacy.style ?? null, occasion: legacy.occasion ?? null, budget: legacy.budget ?? null,
    demo: legacy.demo === true, demoSelected: legacy.demo ? ids : [],
    garments: legacy.demo ? [] : ids.map((id) => virtualGarment(id, 'legacy')),
    saved: legacy.saved ?? [], hidden: legacy.hidden ?? [] };
  return validateWardrobe(record);
}

export function makeGarment({ kind, gender, slotId = null, photoId = null, label = '', id = `g_${crypto.randomUUID()}`, createdAt = new Date().toISOString() }) {
  return { id, kind, gender, slotId, source: 'user', photoId, label: label.trim().slice(0, 80), attrs: null, createdAt };
}
