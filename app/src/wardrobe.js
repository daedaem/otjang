import { SLOTS, SLOT_BY_ID, STYLES, OCCASIONS, COLORS } from './data/slots.js';
import { legacyWardrobeV2 } from './legacy-wardrobe.js';

export const LEGACY_SLOT_MAP = {
  'm-oxford-white': ['m-oxford', 'white'],
  'm-oxford-blue': ['m-oxford', 'blue'],
  'm-tee-white': ['m-tee', 'white'],
  'm-knit-crew': ['m-knit', 'navy'],
  'm-knit-cable': ['m-cable', 'ivory'],
  'm-denim': ['m-denim-raw', 'indigo'],
  'm-slacks-grey': ['m-slacks', 'grey'],
  'm-slacks-wide': ['m-slacks', 'black'],
  'm-fatigue': ['m-work-pants', 'olive'],
  'm-sneaker-leather': ['m-white-sneaker', 'white'],
  'm-chuck': ['m-canvas', 'ivory'],
  'm-nb': ['m-runner', 'grey'],
  'm-boots': ['m-chelsea', 'brown'],
  'm-barbour': ['m-wax', 'olive'],
  'f-shirt-white': ['f-shirt', 'white'],
  'f-shirt-stripe': ['f-stripe', 'blue'],
  'f-maryjane': ['f-flat', 'black'],
};
export const GARMENT_KINDS = [
  ['shirt', '셔츠'],
  ['tee', '티셔츠'],
  ['knit', '니트'],
  ['pants', '바지'],
  ['jeans', '청바지'],
  ['jacket', '재킷'],
  ['sneaker', '운동화'],
  ['cardigan', '카디건'],
  ['longtee', '긴팔 티'],
  ['sweat', '맨투맨'],
  ['polo', '폴로 셔츠'],
  ['blazer', '블레이저'],
  ['coat', '코트'],
  ['down', '패딩'],
  ['dress', '원피스'],
  ['skirt', '스커트'],
  ['loafer', '구두·로퍼'],
  ['boot', '부츠'],
  ['bag', '가방'],
  ['cap', '모자'],
  ['belt', '벨트'],
].map(([id, name]) => ({ id, name }));
export function garmentKindName(kind) {
  return GARMENT_KINDS.find((k) => k.id === kind)?.name || '옷';
}
export function garmentLabel(item) {
  return item.label || (item.slot ? SLOT_BY_ID[item.slot]?.name : garmentKindName(item.kind)) || '내 옷';
}
// A generic garment must not inherit a specific material, pattern or styling tip.
export function slotForItem(item) {
  if (SLOT_BY_ID[item.slot]) return SLOT_BY_ID[item.slot];
  const kind = item.kind || 'tee';
  const cat = ['pants', 'jeans', 'skirt'].includes(kind)
    ? 'bottom'
    : ['jacket', 'blazer', 'coat', 'down', 'cardigan'].includes(kind)
      ? 'outer'
      : ['sneaker', 'loafer', 'boot'].includes(kind)
        ? 'shoes'
        : ['bag', 'cap', 'belt', 'beanie'].includes(kind)
          ? 'acc'
          : kind === 'dress'
            ? 'dress'
            : 'top';
  return {
    id: `generic-${item.gender}-${kind}`,
    g: item.gender,
    shape: kind,
    cat,
    name: garmentKindName(kind),
    colors: [],
    tip: '종류를 기준으로 연결했어요. 소재·무늬·핏은 직접 확인해 주세요.',
  };
}
export function garmentMatchesSlot(item, slot) {
  return item.gender === slot.g && (item.slot ? item.slot === slot.id : item.kind === slot.shape);
}
export const DEMO_SLOTS = {
  M: [
    ['m-oxford', 'white'],
    ['m-oxford', 'blue'],
    ['m-tee', 'white'],
    ['m-denim-raw', 'indigo'],
    ['m-chino', 'beige'],
    ['m-white-sneaker', 'white'],
  ],
  F: [
    ['f-shirt', 'white'],
    ['f-tee', 'white'],
    ['f-knit', 'ivory'],
    ['f-denim', 'indigo'],
    ['f-slacks', 'black'],
    ['f-sneaker', 'white'],
  ],
};
export function demoGarments(gender = 'M') {
  return DEMO_SLOTS[gender].map(([slot, color], i) =>
    makeGarment({ id: `demo_${gender}_${i}`, slot, color, gender, source: 'demo' }),
  );
}
export function newWardrobeState() {
  return {
    schema: 3,
    onboarded: true,
    gender: 'M',
    styles: ['classic'],
    brands: [],
    brandOnly: false,
    occasion: null,
    budget: null,
    demo: true,
    demoSelected: demoGarments(),
    garments: [],
    saved: [],
    hidden: [],
    legacyFingerprint: null,
    legacyBaseline: null,
    legacyDismissed: { owned: [], saved: [] },
  };
}
export function makeGarment({
  id = `g_${crypto.randomUUID()}`,
  slot = null,
  kind,
  gender = 'M',
  color = null,
  brand = null,
  productId = null,
  photoId = null,
  label = '',
  source = 'user',
  photoMissing = false,
  createdAt = new Date().toISOString(),
}) {
  return {
    id,
    slot,
    kind: kind || SLOT_BY_ID[slot]?.shape,
    gender,
    color,
    brand,
    productId,
    photoId,
    label: label.trim().slice(0, 80),
    source,
    photoMissing,
    createdAt,
  };
}
export function wardrobeView(record, tab = 'home') {
  const state = upgradeWardrobe(record);
  return { ...state, closet: state.demo ? state.demoSelected : state.garments, tab };
}
export function storedWardrobe(state) {
  const { closet, tab, ...rest } = state;
  const record = structuredClone(rest);
  validateWardrobe(record);
  return record;
}
function assertWardrobeKeys(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some((k) => !keys.includes(k)))
    throw new Error('지원하지 않는 옷장 형식입니다. 원본을 보존했습니다.');
}
const productIdOK = (id) => typeof id === 'string' && /^ms-\d+$/.test(id);
function validateGarment(item, demo = false) {
  assertWardrobeKeys(item, [
    'id',
    'slot',
    'kind',
    'gender',
    'color',
    'brand',
    'productId',
    'photoId',
    'label',
    'source',
    'photoMissing',
    'createdAt',
  ]);
  if (
    typeof item.id !== 'string' ||
    !/^[-\w]{1,100}$/.test(item.id) ||
    !['M', 'F'].includes(item.gender) ||
    (!GARMENT_KINDS.some((k) => k.id === item.kind) && !SLOTS.some((s) => s.shape === item.kind))
  )
    throw new Error('옷 식별 정보가 올바르지 않습니다.');
  if (!(item.slot === null || (SLOT_BY_ID[item.slot]?.g === item.gender && SLOT_BY_ID[item.slot]?.shape === item.kind)))
    throw new Error('알 수 없는 옷 종류입니다. 원본을 보존했습니다.');
  if (typeof item.photoMissing !== 'boolean') throw new Error('사진 상태가 올바르지 않습니다.');
  if (
    !(item.color === null || Object.hasOwn(COLORS, item.color)) ||
    !(item.brand === null || (typeof item.brand === 'string' && item.brand.length <= 120)) ||
    !(item.productId === null || productIdOK(item.productId))
  )
    throw new Error('옷 색·브랜드·상품 정보를 확인해 주세요.');
  if (
    !(item.photoId === null || (typeof item.photoId === 'string' && /^p_[a-f0-9]{64}$/.test(item.photoId))) ||
    typeof item.label !== 'string' ||
    item.label.length > 80 ||
    !['user', 'legacy', ...(demo ? ['demo'] : [])].includes(item.source) ||
    typeof item.createdAt !== 'string' ||
    !Number.isFinite(Date.parse(item.createdAt))
  )
    throw new Error('옷 상세 정보를 확인해 주세요.');
}
export function validateWardrobe(record) {
  if (record?.schema === 2) return legacyWardrobeV2.validateWardrobe(record);
  assertWardrobeKeys(record, [
    'schema',
    'onboarded',
    'gender',
    'styles',
    'brands',
    'brandOnly',
    'occasion',
    'budget',
    'demo',
    'demoSelected',
    'garments',
    'saved',
    'hidden',
    'legacyFingerprint',
    'legacyBaseline',
    'legacyDismissed',
  ]);
  if (
    record.schema !== 3 ||
    typeof record.onboarded !== 'boolean' ||
    !['M', 'F', null].includes(record.gender) ||
    typeof record.demo !== 'boolean' ||
    typeof record.brandOnly !== 'boolean'
  )
    throw new Error('옷장 버전을 읽지 못했습니다. 원본을 보존했습니다.');
  if (
    !Array.isArray(record.styles) ||
    record.styles.length > 3 ||
    record.styles.some((k) => !STYLES[k]) ||
    (record.onboarded && (!record.gender || !record.styles.length))
  )
    throw new Error('스타일을 읽지 못했습니다.');
  if (
    !Array.isArray(record.brands) ||
    record.brands.some((b) => typeof b !== 'string' || b.length > 120) ||
    !(record.occasion === null || OCCASIONS[record.occasion]) ||
    !(record.budget === null || (Number.isFinite(record.budget) && record.budget >= 0))
  )
    throw new Error('취향을 읽지 못했습니다.');
  for (const key of ['saved', 'hidden'])
    if (!Array.isArray(record[key]) || record[key].some((id) => !productIdOK(id)))
      throw new Error('저장된 상품 목록이 올바르지 않습니다.');
  if (
    !(
      record.legacyFingerprint === null ||
      (typeof record.legacyFingerprint === 'string' && /^[a-f0-9]{64}$/.test(record.legacyFingerprint))
    )
  )
    throw new Error('이전 기록의 확인 정보가 올바르지 않습니다.');
  for (const value of [record.legacyBaseline, record.legacyDismissed])
    if (value !== null) {
      assertWardrobeKeys(value, ['owned', 'saved']);
      if (
        !Array.isArray(value.owned) ||
        value.owned.some((id) => typeof id !== 'string' || id.length > 100) ||
        !Array.isArray(value.saved) ||
        value.saved.some((id) => !productIdOK(id))
      )
        throw new Error('이전 기록 비교 기준이 올바르지 않습니다.');
    }
  if (!record.legacyDismissed) throw new Error('삭제 보존 기록이 빠졌습니다.');
  for (const key of ['garments', 'demoSelected']) {
    if (!Array.isArray(record[key]) || record[key].length > 200)
      throw new Error('옷장은 최대 200벌까지 보관할 수 있어요.');
    const ids = new Set();
    for (const item of record[key]) {
      validateGarment(item, key === 'demoSelected');
      if (ids.has(item.id)) throw new Error('옷 ID가 중복됩니다.');
      ids.add(item.id);
    }
  }
  if (record.demo && record.garments.length) throw new Error('예시와 개인 옷을 섞을 수 없습니다.');
  return record;
}
export function upgradeWardrobe(record) {
  validateWardrobe(record);
  if (record.schema === 3) return structuredClone(record);
  const mapItem = (g) => {
    const [slot, color] = g.slotId ? LEGACY_SLOT_MAP[g.slotId] || [g.slotId, null] : [null, null];
    return makeGarment({
      id: g.id,
      slot,
      kind: slot ? SLOT_BY_ID[slot]?.shape : g.kind,
      gender: g.gender,
      color,
      photoId: g.photoId,
      label: g.label,
      source: g.source === 'demo' ? 'demo' : g.source,
      createdAt: g.createdAt,
    });
  };
  const oldDemo = record.demoSelected.map((id) => {
    const s = legacyWardrobeV2.SLOTS.find((s) => s.id === id);
    return mapItem({
      id: `demo_${id}`,
      slotId: id,
      kind: s?.shape,
      gender: s?.g,
      photoId: null,
      label: '',
      source: 'demo',
      createdAt: '2026-10-14T00:00:00.000Z',
    });
  });
  const ownedIds = (ids) => ids.map((id) => (id.startsWith('legacy_') ? id : `legacy_${id}`));
  const result = {
    ...newWardrobeState(),
    onboarded: record.onboarded,
    gender: record.gender,
    styles: record.style ? [record.style === 'casual' && record.gender === 'M' ? 'cityboy' : record.style] : [],
    occasion: record.occasion,
    budget: record.budget,
    demo: record.demo,
    demoSelected: oldDemo,
    garments: record.garments.map(mapItem),
    saved: record.saved,
    hidden: record.hidden,
    legacyFingerprint: record.legacyFingerprint,
    legacyBaseline: record.legacyBaseline
      ? { owned: ownedIds(record.legacyBaseline.owned), saved: record.legacyBaseline.saved }
      : null,
    legacyDismissed: {
      owned: ownedIds(record.legacyDismissed?.owned || []),
      saved: record.legacyDismissed?.saved || [],
    },
  };
  return validateWardrobe(result);
}
// Conversion is pure. Photo data is read separately and attached before a single commit.
export function migrateLegacyWardrobe(raw) {
  if (raw === null) return newWardrobeState();
  const old = JSON.parse(raw);
  if (old?.v !== 2) return upgradeWardrobe(legacyWardrobeV2.migrateLegacyWardrobe(raw));
  assertWardrobeKeys(old, [
    'v',
    'onboarded',
    'gender',
    'styles',
    'brands',
    'brandOnly',
    'occasion',
    'budget',
    'closet',
    'saved',
    'hidden',
    'tab',
    'demo',
  ]);
  if (!Array.isArray(old.closet)) throw new Error('이전 옷장을 읽지 못했습니다.');
  const garments = old.closet.map((item) => {
    assertWardrobeKeys(item, ['id', 'slot', 'color', 'brand', 'productId', 'photo', 'addedAt']);
    if (Object.hasOwn(item, 'photo') && typeof item.photo !== 'boolean')
      throw new Error('이전 사진 상태를 읽지 못했습니다.');
    if (!SLOT_BY_ID[item.slot]) throw new Error('이전 옷 종류를 확인할 수 없습니다. 원본을 보존했습니다.');
    return makeGarment({
      id: item.id,
      slot: item.slot,
      gender: SLOT_BY_ID[item.slot].g,
      color: item.color ?? null,
      brand: item.brand ?? null,
      productId: item.productId ?? null,
      photoMissing: !!item.photo,
      source: 'legacy',
      createdAt: Number.isFinite(item.addedAt) ? new Date(item.addedAt).toISOString() : '2026-10-14T00:00:00.000Z',
    });
  });
  const result = {
    ...newWardrobeState(),
    onboarded: old.onboarded ?? false,
    gender: old.gender ?? null,
    styles: old.styles ?? [],
    brands: old.brands ?? [],
    brandOnly: old.brandOnly ?? false,
    occasion: old.occasion ?? null,
    budget: old.budget ?? null,
    demo: false,
    demoSelected: [],
    garments,
    saved: old.saved ?? [],
    hidden: old.hidden ?? [],
    legacyBaseline: { owned: garments.map((i) => i.id), saved: old.saved ?? [] },
  };
  return validateWardrobe(result);
}
