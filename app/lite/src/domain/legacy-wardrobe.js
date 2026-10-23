// Frozen schema 2 reader. Kept for lossless conversion and backup compatibility.
export const legacyWardrobeV2 = (() => {
const SLOTS=[{"id":"m-oxford-white","g":"M","shape":"shirt","name":"화이트 옥스퍼드 셔츠"},{"id":"m-oxford-blue","g":"M","shape":"shirt","name":"블루 옥스퍼드 셔츠"},{"id":"m-stripe-shirt","g":"M","shape":"shirt","name":"스트라이프 셔츠"},{"id":"m-flannel","g":"M","shape":"shirt","name":"플란넬 체크 셔츠"},{"id":"m-tee-white","g":"M","shape":"tee","name":"화이트 티셔츠"},{"id":"m-longtee","g":"M","shape":"longtee","name":"무지 긴팔 티셔츠"},{"id":"m-knit-crew","g":"M","shape":"knit","name":"크루넥 울 니트"},{"id":"m-knit-cable","g":"M","shape":"knit","name":"케이블 니트"},{"id":"m-cardigan","g":"M","shape":"cardigan","name":"울 카디건"},{"id":"m-sweat","g":"M","shape":"sweat","name":"그레이 스웻셔츠"},{"id":"m-polo","g":"M","shape":"polo","name":"피케 폴로 셔츠"},{"id":"m-rugby","g":"M","shape":"polo","name":"럭비 셔츠"},{"id":"m-blazer","g":"M","shape":"blazer","name":"네이비 블레이저"},{"id":"m-trucker","g":"M","shape":"jacket","name":"데님 트러커 재킷"},{"id":"m-chore","g":"M","shape":"jacket","name":"초어 재킷"},{"id":"m-field","g":"M","shape":"jacket","name":"필드 재킷"},{"id":"m-harrington","g":"M","shape":"jacket","name":"해링턴 재킷"},{"id":"m-balmacaan","g":"M","shape":"coat","name":"발마칸 코트"},{"id":"m-trench","g":"M","shape":"coat","name":"트렌치 코트"},{"id":"m-down","g":"M","shape":"down","name":"패딩 재킷"},{"id":"m-barbour","g":"M","shape":"jacket","name":"왁스 재킷"},{"id":"m-chino","g":"M","shape":"pants","name":"베이지 치노 팬츠"},{"id":"m-denim","g":"M","shape":"jeans","name":"생지 데님 스트레이트"},{"id":"m-slacks-grey","g":"M","shape":"pants","name":"그레이 울 슬랙스"},{"id":"m-slacks-wide","g":"M","shape":"pants","name":"블랙 와이드 슬랙스"},{"id":"m-fatigue","g":"M","shape":"pants","name":"퍼티그 팬츠"},{"id":"m-loafer","g":"M","shape":"loafer","name":"페니 로퍼"},{"id":"m-derby","g":"M","shape":"loafer","name":"블랙 더비 슈즈"},{"id":"m-sneaker-leather","g":"M","shape":"sneaker","name":"화이트 레더 스니커즈"},{"id":"m-chuck","g":"M","shape":"sneaker","name":"캔버스 스니커즈"},{"id":"m-nb","g":"M","shape":"sneaker","name":"그레이 러닝 스니커즈"},{"id":"m-boots","g":"M","shape":"boot","name":"스웨이드 첼시 부츠"},{"id":"m-cap","g":"M","shape":"cap","name":"코튼 볼캡"},{"id":"m-belt","g":"M","shape":"belt","name":"가죽 벨트"},{"id":"f-shirt-white","g":"F","shape":"shirt","name":"화이트 코튼 셔츠"},{"id":"f-shirt-stripe","g":"F","shape":"shirt","name":"스트라이프 셔츠"},{"id":"f-tee","g":"F","shape":"tee","name":"베이직 티셔츠"},{"id":"f-knit","g":"F","shape":"knit","name":"크루넥 니트"},{"id":"f-cardigan","g":"F","shape":"cardigan","name":"카디건"},{"id":"f-blazer","g":"F","shape":"blazer","name":"블레이저"},{"id":"f-trench","g":"F","shape":"coat","name":"트렌치 코트"},{"id":"f-coat","g":"F","shape":"coat","name":"울 코트"},{"id":"f-jacket","g":"F","shape":"jacket","name":"데님 재킷"},{"id":"f-padding","g":"F","shape":"down","name":"숏패딩"},{"id":"f-denim","g":"F","shape":"jeans","name":"스트레이트 데님"},{"id":"f-slacks","g":"F","shape":"pants","name":"와이드 슬랙스"},{"id":"f-skirt","g":"F","shape":"skirt","name":"롱 스커트"},{"id":"f-dress","g":"F","shape":"dress","name":"셔츠 원피스"},{"id":"f-loafer","g":"F","shape":"loafer","name":"로퍼"},{"id":"f-maryjane","g":"F","shape":"loafer","name":"메리제인"},{"id":"f-sneaker","g":"F","shape":"sneaker","name":"스니커즈"},{"id":"f-bag","g":"F","shape":"bag","name":"숄더백"}];
const SLOT_BY_ID=Object.fromEntries(SLOTS.map(s=>[s.id,s]));
const STYLES={"classic":{"label":"클래식","desc":"셔츠 · 치노 · 로퍼"},"minimal":{"label":"미니멀","desc":"모노톤 · 깔끔한 핏"},"casual":{"label":"캐주얼","desc":"편한 데일리 · 워크웨어"}}, OCCASIONS={"daily":"데일리","work":"출근","date":"데이트","weekend":"주말·여행","formal":"격식·하객"};

const GARMENT_KINDS = [
  ['shirt', '셔츠'], ['tee', '티셔츠'], ['knit', '니트'], ['pants', '바지'],
  ['jeans', '청바지'], ['jacket', '재킷'], ['sneaker', '운동화'], ['cardigan', '카디건'],
  ['longtee', '긴팔 티'], ['sweat', '맨투맨'], ['polo', '폴로 셔츠'], ['blazer', '블레이저'],
  ['coat', '코트'], ['down', '패딩'], ['dress', '원피스'], ['skirt', '스커트'],
  ['loafer', '구두·로퍼'], ['boot', '부츠'], ['bag', '가방'], ['cap', '모자'], ['belt', '벨트'],
].map(([id, name]) => ({ id, name }));
const GARMENT_KIND_IDS = new Set(GARMENT_KINDS.map((kind) => kind.id));
const DEMO_SLOTS = {
  M: ['m-oxford-white', 'm-oxford-blue', 'm-tee-white', 'm-denim', 'm-chino', 'm-sneaker-leather'],
  F: ['f-shirt-white', 'f-tee', 'f-knit', 'f-denim', 'f-slacks', 'f-sneaker'],
};

function garmentKindName(kind) {
  return GARMENT_KINDS.find((row) => row.id === kind)?.name || '옷';
}

function garmentLabel(garment) {
  return garment.label || SLOT_BY_ID[garment.slotId]?.name || garmentKindName(garment.kind);
}

function garmentMatchesSlot(garment, slot) {
  return garment.gender === slot.g && (garment.slotId ? garment.slotId === slot.id : garment.kind === slot.shape);
}

function newWardrobeState() {
  return { schema: 2, onboarded: true, gender: 'M', style: 'classic', occasion: null, budget: null,
    demo: true, demoSelected: [...DEMO_SLOTS.M], garments: [], saved: [], hidden: [], legacyFingerprint: null,
    legacyBaseline: null, legacyDismissed: { owned: [], saved: [] } };
}

function virtualGarment(slotId, source) {
  const slot = SLOT_BY_ID[slotId];
  return { id: `${source}_${slotId}`, kind: slot.shape, gender: slot.g, slotId, source,
    photoId: null, label: '', attrs: null, createdAt: '2026-10-14T00:00:00.000Z' };
}

function ownedGarments(state) {
  if (state.demo) return (state.demoSelected || state.owned || DEMO_SLOTS[state.gender || 'M']).filter((id) => SLOT_BY_ID[id]).map((id) => virtualGarment(id, 'demo'));
  if (Array.isArray(state.garments)) return state.garments;
  return (state.owned || []).filter((id) => SLOT_BY_ID[id]).map((id) => virtualGarment(id, 'legacy'));
}

function ownedSlotIds(state) {
  const garments = ownedGarments(state);
  return SLOTS.filter((slot) => garments.some((garment) => garmentMatchesSlot(garment, slot))).map((slot) => slot.id);
}

function wardrobeView(record, tab = 'home') {
  return { ...record, legacyBaseline: record.legacyBaseline ?? null, legacyDismissed: record.legacyDismissed ?? { owned: [], saved: [] }, owned: ownedSlotIds(record), tab };
}

function storedWardrobe(state) {
  const { schema, onboarded, gender, style, occasion, budget, demo, demoSelected, garments, saved, hidden, legacyFingerprint, legacyBaseline = null, legacyDismissed = { owned: [], saved: [] } } = state;
  const record = { schema, onboarded, gender, style, occasion, budget, demo, demoSelected, garments, saved, hidden, legacyFingerprint, legacyBaseline, legacyDismissed };
  validateWardrobe(record);
  return structuredClone(record);
}

function assertRecordKeys(value, allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some((key) => !allowed.includes(key))) throw new Error('저장된 자료의 형식을 확인할 수 없습니다. 원본을 보존했습니다.');
}

function validateWardrobe(record) {
  assertRecordKeys(record, ['schema', 'onboarded', 'gender', 'style', 'occasion', 'budget', 'demo', 'demoSelected', 'garments', 'saved', 'hidden', 'legacyFingerprint', 'legacyBaseline', 'legacyDismissed']);
  if (!(record.legacyFingerprint === null || typeof record.legacyFingerprint === 'string' && /^[a-f0-9]{64}$/.test(record.legacyFingerprint))) throw new Error('이전 옷장 확인 기록이 올바르지 않습니다.');
  for (const value of [record.legacyBaseline, record.legacyDismissed]) if (value != null) {
    assertRecordKeys(value, ['owned', 'saved']);
    if (!Array.isArray(value.owned) || value.owned.some((id) => !SLOT_BY_ID[id]) || !Array.isArray(value.saved) || value.saved.some((id) => typeof id !== 'string' || !/^ms-\d+$/.test(id))) throw new Error('이전 기록의 비교 기준이 올바르지 않습니다.');
  }
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

function migrateLegacyWardrobe(raw) {
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
    saved: legacy.saved ?? [], hidden: legacy.hidden ?? [],
    legacyBaseline: { owned: legacy.demo ? [] : ids, saved: legacy.saved ?? [] } };
  return validateWardrobe(record);
}

function makeGarment({ kind, gender, slotId = null, photoId = null, label = '', id = `g_${crypto.randomUUID()}`, createdAt = new Date().toISOString() }) {
  return { id, kind, gender, slotId, source: 'user', photoId, label: label.trim().slice(0, 80), attrs: null, createdAt };
}

return { validateWardrobe, newWardrobeState, makeGarment, migrateLegacyWardrobe, storedWardrobe, SLOTS };
})();
