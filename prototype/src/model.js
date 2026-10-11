/** Local-only prototype model. Recommendation rules are an explainable baseline. */
import { buildAISnapshotKey, validateAIRequest, validateAIOutput } from './ai.js';

export const CATEGORY_LABELS = Object.freeze({
  top: '상의',
  bottom: '하의',
  outer: '아우터',
  shoes: '신발',
  unknown: '미확인',
});
export const COLOR_LABELS = Object.freeze({
  navy: '네이비',
  blue: '블루',
  white: '화이트',
  cream: '크림',
  ivory: '아이보리',
  beige: '베이지',
  brown: '브라운',
  olive: '올리브',
  green: '그린',
  gray: '그레이',
  black: '블랙',
  red: '레드',
  pink: '핑크',
  yellow: '옐로',
  orange: '오렌지',
  purple: '퍼플',
  other: '기타',
  unknown: '미확인',
});
export const STYLE_LABELS = Object.freeze({
  american: '아메리칸 클래식',
  minimal: '미니멀',
  workwear: '워크웨어',
  casual: '캐주얼',
});

// Typing suggestions only: none of these brands are inferred from a photograph.
export const BRAND_SUGGESTIONS = Object.freeze([
  'Polo Ralph Lauren', 'RRL', 'Brooks Brothers', 'J.Press', 'Gitman Vintage',
  'BEAMS PLUS', 'Engineered Garments', 'L.L.Bean', 'orSlow', 'Levi’s',
  'Red Wing', 'Alden', 'Paraboot', 'New Balance',
]);

/** A saved reference opened only by the user; no page metadata is fetched. */
export function normalizeProductURL(value = '') {
  if (value == null || value === '') return '';
  if (typeof value !== 'string' || value.length > 2048 || /[\u0000-\u001f\u007f]/.test(value))
    throw new Error('상품 링크는 2,048자 이내의 HTTP 또는 HTTPS 주소로 입력해 주세요.');
  try {
    const url = new URL(value.trim());
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password)
      throw new Error();
    return url.href;
  } catch {
    throw new Error('상품 링크는 로그인 정보가 포함되지 않은 HTTP 또는 HTTPS 주소로 입력해 주세요.');
  }
}

/** Normalize explicitly entered identity fields without guessing missing ones. */
export function normalizeProductIdentity(fields = {}) {
  const result = {};
  for (const [key, maximum] of [['brand', 300], ['productName', 300], ['styleCode', 160]]) {
    const value = fields[key] ?? '';
    if (typeof value !== 'string' || value.length > maximum)
      throw new Error('브랜드·상품명·품번의 길이와 내용을 확인해 주세요.');
    result[key] = value.trim();
  }
  result.productURL = normalizeProductURL(fields.productURL);
  result.identityConfirmed = fields.identityConfirmed === true;
  if (result.identityConfirmed && !result.brand && !result.productName && !result.styleCode)
    throw new Error('확인한 브랜드, 상품명 또는 품번을 먼저 입력해 주세요.');
  return result;
}

/** Only typed brand/product/code text enters the query; image data and filenames do not. */
export function productSearchLink(item = {}, provider = 'google') {
  const query = ['brand', 'productName', 'styleCode'].map(key =>
    typeof item[key] === 'string' ? item[key].trim().slice(0, 300) : '').filter(Boolean).join(' ');
  if (!query) return null;
  const url = new URL(provider === 'naver' ? 'https://search.naver.com/search.naver' : 'https://www.google.com/search');
  url.searchParams.set(provider === 'naver' ? 'query' : 'q', query);
  return { query, url: url.href };
}

const demoItem = (id, name, category, kind, color, extra = {}) => ({
  id,
  name,
  category,
  kind,
  color,
  pattern: 'solid',
  brand: '',
  available: true,
  source: 'demo',
  confirmed: true,
  attributesConfirmed: true,
  ...extra,
});
export const demoItems = [
  demoItem('demo-shirt-blue', '블루 옥스퍼드 셔츠', 'top', 'shirt', 'blue'),
  demoItem('demo-knit-navy', '네이비 크루넥 니트', 'top', 'knit', 'navy'),
  demoItem('demo-tee-white', '화이트 기본 티셔츠', 'top', 'tshirt', 'white'),
  demoItem('demo-chino-beige', '베이지 치노 팬츠', 'bottom', 'chino', 'beige'),
  demoItem('demo-denim-blue', '인디고 스트레이트 데님', 'bottom', 'denim', 'navy'),
  demoItem('demo-jacket-brown', '네이비 블레이저', 'outer', 'blazer', 'navy'),
  demoItem('demo-loafer-brown', '브라운 페니 로퍼', 'shoes', 'loafer', 'brown'),
  demoItem('demo-shirt-white', '화이트 옥스퍼드 셔츠', 'top', 'shirt', 'white'),
  demoItem('demo-field-olive', '올리브 필드 재킷', 'outer', 'fieldjacket', 'olive'),
  demoItem('demo-sneaker-white', '화이트 로우 스니커즈', 'shoes', 'sneaker', 'white'),
];
const demoProduct = (id, name, category, kind, color, price, text, topic) => ({
  id,
  name,
  brand: '예시 카탈로그 · 실판매 상품 아님',
  category,
  kind,
  color,
  pattern: 'solid',
  price,
  url: null,
  source: 'demo',
  checkedAt: null,
  reviews: [
    { text, topic, sourceLabel: '흐름 설명용 합성 후기 · 실제 구매 후기 아님', kind: 'demo' },
  ],
});
export const demoProducts = [
  demoProduct(
    'example-olive-chino',
    '예시 A · 올리브 치노',
    'bottom',
    'chino',
    'olive',
    89000,
    '허벅지 여유를 선호한다면 실측 확인이 필요하다는 상황을 설명하는 합성 예시입니다.',
    '핏 확인',
  ),
  demoProduct(
    'example-cream-knit',
    '예시 B · 크림 니트',
    'top',
    'knit',
    'cream',
    119000,
    '밝은 색의 관리 부담을 비교하는 합성 예시입니다. 실제 소재나 내구성 근거는 없습니다.',
    '관리',
  ),
  demoProduct(
    'example-navy-jacket',
    '예시 C · 네이비 재킷',
    'outer',
    'jacket',
    'navy',
    189000,
    '겹쳐 입을 여유를 확인하는 합성 예시입니다. 착용감은 검증하지 않았습니다.',
    '레이어링',
  ),
  demoProduct(
    'example-gray-trouser',
    '예시 D · 그레이 트라우저',
    'bottom',
    'trouser',
    'gray',
    99000,
    '출근과 일상의 겸용 여부를 비교하는 합성 예시입니다. 실제 사용자의 경험이 아닙니다.',
    '활용',
  ),
];

const copy = (value) => JSON.parse(JSON.stringify(value));
export function createState(mode = 'demo') {
  if (!['demo', 'personal'].includes(mode)) throw new Error('지원하지 않는 옷장 모드입니다.');
  return {
    schemaVersion: 1,
    mode,
    onboarded: mode === 'demo',
    profile: {
      style: 'american',
      occasion: 'daily',
      budget: mode === 'demo' ? 150000 : null,
      fit: 'regular',
    },
    items: mode === 'demo' ? copy(demoItems) : [],
    drafts: [],
    products: mode === 'demo' ? copy(demoProducts) : [],
    savedOutfits: [],
    savedProducts: [],
    decisions: [],
  };
}

function activeItems(state) {
  return (state.items || []).filter(
    (item) =>
      item.confirmed === true &&
      item.available !== false &&
      (state.mode !== 'personal' || item.source !== 'demo'),
  );
}
const neutralColors = new Set([
  'navy',
  'white',
  'cream',
  'beige',
  'brown',
  'gray',
  'black',
  'olive',
]);
const preferredKinds = {
  american: ['shirt', 'knit', 'chino', 'denim', 'jacket', 'blazer', 'loafer'],
  minimal: ['shirt', 'knit', 'trouser', 'slacks', 'blazer', 'loafer'],
  workwear: ['shirt', 'denim', 'cargo', 'chore', 'jacket', 'boots'],
  casual: ['tshirt', 'tee', 'sweatshirt', 'hoodie', 'denim', 'sneaker'],
};
function relevance(item, profile) {
  let score = (preferredKinds[profile.style] || []).includes(item.kind) ? 4 : 0;
  if (profile.style === 'minimal' && neutralColors.has(item.color)) score += 2;
  if (profile.style === 'minimal' && item.pattern === 'solid') score += 1;
  if (
    profile.occasion === 'work' &&
    ['shirt', 'knit', 'chino', 'trouser', 'slacks', 'loafer', 'jacket', 'blazer'].includes(item.kind)
  )
    score += 3;
  if (
    profile.occasion === 'weekend' &&
    ['tshirt', 'tee', 'denim', 'sneaker', 'hoodie'].includes(item.kind)
  )
    score += 3;
  return score;
}
function contextReason(profile) {
  const occasion =
    { daily: '일상', work: '출근', weekend: '주말' }[profile.occasion] || '선택한 상황';
  return `${STYLE_LABELS[profile.style] || '선택한 스타일'} · ${occasion}의 기본 유형을 우선 비교한 규칙 제안입니다.`;
}
const byScore = (scoreFn) => (a, b) => scoreFn(b) - scoreFn(a) || a.id.localeCompare(b.id);

export function getOutfits(state, limit = 3, anchorId = null) {
  const items = activeItems(state);
  const profile = state.profile || {};
  const anchor = anchorId ? items.find(item => item.id === anchorId) : null;
  if (anchorId && !anchor) return [];
  const tops = items.filter((item) => item.category === 'top');
  const bottoms = items.filter((item) => item.category === 'bottom');
  const shoe = anchor?.category === 'shoes' ? anchor : items
    .filter((item) => item.category === 'shoes')
    .sort(byScore((item) => relevance(item, profile)))[0];
  const outer = anchor?.category === 'outer' ? anchor :
    profile.occasion === 'work'
      ? items
          .filter((item) => item.category === 'outer')
          .sort(byScore((item) => relevance(item, profile)))[0]
      : null;
  const candidates = [];
  for (const top of tops)
    for (const bottom of bottoms) {
      const selected = [top, bottom, ...(outer ? [outer] : []), ...(shoe ? [shoe] : [])];
      if (anchor && !selected.some(item => item.id === anchorId)) continue;
      const reasons = [
        contextReason(profile),
        `${top.name}와 ${bottom.name}를 등록된 보유 옷에서 골랐습니다.`,
      ];
      if (profile.style === 'minimal' && selected.every((item) => neutralColors.has(item.color)))
        reasons.push('기록된 색상 기준으로 차분한 색 조합을 먼저 보여 줍니다.');
      if (top.color === bottom.color && top.color !== 'unknown')
        reasons.push('비슷한 색의 조합입니다. 실제 밝기와 질감은 직접 확인해 주세요.');
      const cautions = [];
      if (selected.some((item) => !item.attributesConfirmed))
        cautions.push(
          '일부 속성은 자동 초안 또는 미확인 값입니다. 색·종류가 맞는지 확인해 주세요.',
        );
      if (selected.some((item) => item.color === 'unknown' || !item.color))
        cautions.push('색 정보가 부족해 색의 어울림을 판단하지 않았습니다.');
      if (outer)
        cautions.push(
          '겉옷은 선택한 옷 또는 상황에 따른 제안입니다. 날씨·실내 온도는 반영하지 않았습니다.',
        );
      if (!shoe) cautions.push('신발은 등록된 정보가 없어 포함하지 않았습니다.');
      cautions.push('실측·착용감을 확인한 코디가 아닙니다.');
      candidates.push({
        id: `outfit:${selected.map((item) => encodeURIComponent(item.id)).join('|')}`,
        title: `${top.name} × ${bottom.name}`,
        items: selected.map((item) => item.id),
        reasons,
        cautions,
        score: selected.reduce((sum, item) => sum + relevance(item, profile), 0),
      });
    }
  return candidates
    .sort(byScore((item) => item.score))
    .slice(0, Math.max(0, Math.min(20, Number.isFinite(limit) ? Math.floor(limit) : 3)))
    .map(({ score, ...outfit }) => outfit);
}

export function rankProducts(state) {
  const items = activeItems(state);
  const profile = state.profile || {};
  const budget = profile.budget;
  return (state.products || [])
    .filter((product) => state.mode !== 'personal' || product.source !== 'demo')
    .map((product) => {
      const budgetState =
        !Number.isFinite(product.price) || !Number.isFinite(budget)
          ? 'unknown'
          : product.price > budget
            ? 'over'
            : 'within';
      const overlap = items
        .filter(
          (item) =>
            item.category === product.category &&
            ((item.kind && item.kind !== 'unknown' && item.kind === product.kind) ||
              (item.color && item.color !== 'unknown' && item.color === product.color)),
        )
        .map((item) => item.id);
      const pairCategories =
        product.category === 'top'
          ? ['bottom']
          : product.category === 'bottom'
            ? ['top']
            : ['outer', 'shoes'].includes(product.category)
              ? ['top', 'bottom']
              : [];
      const pairings = items
        .filter((item) => pairCategories.includes(item.category))
        .sort(byScore((item) => relevance(item, profile)))
        .slice(0, 6)
        .map((item) => item.id);
      const reasons = [contextReason(profile)];
      reasons.push(
        overlap.length
          ? `비슷한 종류나 색의 보유 옷 ${overlap.length}벌이 있습니다. 실제 역할 차이를 비교해 보세요.`
          : '등록된 옷에서 같은 종류·색의 중복을 찾지 못했습니다. 미등록 옷은 비교하지 않았습니다.',
      );
      reasons.push(
        pairings.length
          ? `함께 검토할 보유 옷 ${pairings.length}벌을 연결했습니다. 완성 코디 수나 구매 가치를 뜻하지 않습니다.`
          : '함께 입을 옷의 정보가 부족합니다. 구매 필요로 해석하지 않습니다.',
      );
      reasons.push(
        budgetState === 'over'
          ? '입력한 상품 가격 예산을 초과합니다.'
          : budgetState === 'within'
            ? '기록된 상품 가격이 입력 예산 안에 있습니다. 배송비·현재 가격은 별도 확인이 필요합니다.'
            : '예산 또는 상품 가격이 미확인입니다.',
      );
      if (product.source === 'demo')
        reasons.push(
          '가격·상품·후기가 모두 흐름 설명을 위한 합성 예시입니다. 실제로 구매할 수 없습니다.',
        );
      else if (!product.reviews?.length) reasons.push('연결된 후기 근거가 없습니다.');
      const score =
        relevance(product, profile) +
        pairings.length -
        overlap.length * 4 -
        (budgetState === 'over' ? 1000 : budgetState === 'unknown' ? 100 : 0);
      return { ...product, overlap, pairings, budgetState, reasons, score };
    })
    .sort(byScore((product) => product.score))
    .map(({ score, ...product }) => product);
}

export function getGaps(state) {
  const items = activeItems(state);
  const outfits = getOutfits(state, 1);
  const gaps = [];
  if (outfits.length)
    gaps.push({
      title: '먼저 가진 옷으로 입어 보기',
      description: `${outfits[0].title}. 새 구매 없이 이 조합부터 검토할 수 있습니다.`,
      category: 'existing',
    });
  for (const category of ['top', 'bottom'])
    if (!items.some((item) => item.category === category))
      gaps.push({
        title: `${CATEGORY_LABELS[category]} 기록부터 확인`,
        description: `확정된 ${CATEGORY_LABELS[category]} 정보가 부족합니다. 이미 가진 옷을 추가한 뒤 보완할 역할을 판단하세요.`,
        category,
      });
  if (items.some((item) => !item.attributesConfirmed))
    gaps.push({
      title: '내 옷 정보 한 번 확인하기',
      description: '자동 추정한 색·종류와 미확인 속성을 고치면 비교 근거가 분명해집니다.',
      category: 'unknown',
    });
  if (
    outfits.length &&
    state.profile?.occasion === 'work' &&
    !items.some(
      (item) => item.category === 'bottom' && ['chino', 'trouser', 'slacks'].includes(item.kind),
    )
  )
    gaps.push({
      title: '출근에 쓸 하의 역할 비교',
      description:
        '지금 가진 하의가 실제 출근 상황에 맞는지 먼저 확인하세요. 부족하다면 후보와 그 역할을 비교할 수 있습니다.',
      category: 'bottom',
    });
  return gaps.slice(0, 3);
}

const MAX_BACKUP_BYTES = 32 * 1024 * 1024;
const MAX_IMAGE_CHARS = 8 * 1024 * 1024;
const imagePattern = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
const fail = (message) => {
  throw new Error(`옷장 파일을 읽을 수 없습니다: ${message}`);
};
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
function validImage(value) {
  if (value.length > MAX_IMAGE_CHARS || !imagePattern.test(value)) return false;
  const [header, payload] = value.split(',', 2);
  if (payload.length % 4 !== 0) return false;
  let bytes;
  try {
    bytes = atob(payload.slice(0, 32));
  } catch {
    return false;
  }
  if (header.includes('/png;')) return bytes.startsWith('\x89PNG\r\n\x1a\n');
  if (header.includes('/jpeg;')) return bytes.startsWith('\xff\xd8\xff');
  return bytes.startsWith('RIFF') && bytes.slice(8, 12) === 'WEBP';
}
function checkString(value, label, max = 5000, required = false) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim()))
    fail(`${label} 값이 올바르지 않습니다.`);
}
function checkUrl(value, label) {
  if (value == null || value === '') return;
  checkString(value, label, 2048);
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password)
      fail(`${label}은 인증정보 없는 HTTPS 주소여야 합니다.`);
  } catch {
    fail(`${label} 주소가 올바르지 않습니다.`);
  }
}
function walkSafe(value, depth = 0, counter = { count: 0 }, key = '') {
  if (depth > 30 || ++counter.count > 100000) fail('데이터 구조가 너무 큽니다.');
  if (
    /^(?:image|sourceImage|originalImage|photo|thumbnail)$/i.test(key) &&
    value !== null &&
    typeof value !== 'string'
  )
    fail('사진 필드는 이미지 데이터 문자열이어야 합니다.');
  if (
    /^(?:images|mergedImages|photos)$/i.test(key) &&
    !Array.isArray(value) &&
    typeof value !== 'string'
  )
    fail('사진 목록이 올바르지 않습니다.');
  if (typeof value === 'string') {
    if (
      /^data:/i.test(value) ||
      /^(?:image|images|mergedImages|sourceImage|originalImage|photo|photos|thumbnail)$/i.test(key)
    ) {
      if (value && !validImage(value))
        fail('이미지는 크기 제한 안의 PNG/JPEG/WebP 데이터만 허용합니다.');
    } else if (value.length > 20000) fail('텍스트가 너무 깁니다.');
    if (/^productURL$/i.test(key)) normalizeProductURL(value);
    else if (/^(?:url|sourceUrl|reviewUrl)$/i.test(key)) checkUrl(value, key);
  } else if (typeof value === 'number' && !Number.isFinite(value))
    fail('유효하지 않은 숫자가 있습니다.');
  else if (Array.isArray(value)) {
    if (value.length > 10000) fail('배열이 너무 큽니다.');
    for (const child of value) walkSafe(child, depth + 1, counter, key);
  } else if (isObject(value))
    for (const [childKey, child] of Object.entries(value)) {
      if (['__proto__', 'prototype', 'constructor'].includes(childKey))
        fail('허용하지 않는 데이터 키입니다.');
      walkSafe(child, depth + 1, counter, childKey);
    }
}
function checkIds(entries, label) {
  const ids = new Set();
  for (const entry of entries) {
    if (!isObject(entry)) fail(`${label} 항목이 올바르지 않습니다.`);
    checkString(entry.id, `${label} ID`, 160, true);
    if (ids.has(entry.id)) fail(`${label} ID가 중복되었습니다.`);
    ids.add(entry.id);
  }
  return ids;
}
function validateState(state) {
  if (!isObject(state) || state.schemaVersion !== 1) fail('지원하지 않는 파일 버전입니다.');
  if (!['demo', 'personal'].includes(state.mode) || typeof state.onboarded !== 'boolean')
    fail('옷장 모드가 올바르지 않습니다.');
  if (!isObject(state.profile)) fail('프로필이 없습니다.');
  for (const key of ['style', 'occasion', 'fit'])
    checkString(state.profile[key], `프로필 ${key}`, 100, true);
  if (
    !Object.hasOwn(STYLE_LABELS, state.profile.style) ||
    !['daily', 'work', 'weekend'].includes(state.profile.occasion) ||
    !['regular', 'relaxed', 'slim'].includes(state.profile.fit)
  )
    fail('지원하지 않는 프로필 선택값입니다.');
  if (
    state.profile.budget !== null &&
    (!Number.isFinite(state.profile.budget) ||
      state.profile.budget < 0 ||
      state.profile.budget > 100000000)
  )
    fail('예산이 올바르지 않습니다.');
  for (const key of ['items', 'drafts', 'products', 'savedOutfits', 'savedProducts', 'decisions'])
    if (!Array.isArray(state[key])) fail(`${key} 목록이 없습니다.`);
  if (state.items.length > 2000 || state.drafts.length > 2000 || state.products.length > 2000)
    fail('한 옷장의 항목 수 제한을 넘었습니다.');
  const itemIds = checkIds(state.items, '옷');
  const draftIds = checkIds(state.drafts, '초안');
  const productIds = checkIds(state.products, '상품');
  for (const item of [...state.items, ...state.drafts]) {
    checkString(item.name, '옷 이름', 300, true);
    if (!Object.hasOwn(CATEGORY_LABELS, item.category)) fail('옷 종류가 올바르지 않습니다.');
    if (item.confirmed !== undefined && typeof item.confirmed !== 'boolean')
      fail('확정 상태가 올바르지 않습니다.');
    if (item.available !== undefined && typeof item.available !== 'boolean')
      fail('사용 가능 상태가 올바르지 않습니다.');
    if (!['demo', 'manual', 'photo'].includes(item.source)) fail('옷의 출처가 올바르지 않습니다.');
    for (const key of ['kind', 'color', 'pattern', 'brand'])
      if (item[key] !== undefined) checkString(item[key], `옷 ${key}`, 300);
    if (item.productName !== undefined) checkString(item.productName, '상품명', 300);
    if (item.styleCode !== undefined) checkString(item.styleCode, '품번', 160);
    if (item.productURL !== undefined) {
      checkString(item.productURL, '상품 링크', 2048);
      normalizeProductURL(item.productURL);
    }
    if (item.identityConfirmed !== undefined && typeof item.identityConfirmed !== 'boolean')
      fail('상품 정보 확인 상태가 올바르지 않습니다.');
    if (item.identityConfirmed && ![item.brand, item.productName, item.styleCode].some(value => typeof value === 'string' && value.trim()))
      fail('직접 확인한 브랜드, 상품명 또는 품번이 없습니다.');
    if (item.color !== undefined && !Object.hasOwn(COLOR_LABELS, item.color))
      fail('지원하지 않는 옷 색입니다.');
    for (const key of ['note', 'analysisNote'])
      if (item[key] !== undefined) checkString(item[key], `옷 ${key}`, 5000);
    if (item.selected !== undefined && typeof item.selected !== 'boolean')
      fail('초안 선택 상태가 올바르지 않습니다.');
    if (item.attributesConfirmed !== undefined && typeof item.attributesConfirmed !== 'boolean')
      fail('속성 확인 상태가 올바르지 않습니다.');
    if (
      item.region !== undefined &&
      (!isObject(item.region) ||
        !['x', 'y', 'width', 'height'].every((key) => Number.isFinite(item.region[key])) ||
        item.region.x < 0 ||
        item.region.y < 0 ||
        item.region.width <= 0 ||
        item.region.height <= 0 ||
        item.region.x + item.region.width > 1.000001 ||
        item.region.y + item.region.height > 1.000001)
    )
      fail('사진 영역이 올바르지 않습니다.');
    if (item.duplicateOf && !itemIds.has(item.duplicateOf) && !draftIds.has(item.duplicateOf))
      fail('중복 검토가 없는 옷을 참조합니다.');
    if (item.productRef && !productIds.has(item.productRef))
      fail('보유 옷이 없는 상품을 참조합니다.');
  }
  for (const product of state.products) {
    checkString(product.name, '상품명', 300, true);
    if (
      !Object.hasOwn(CATEGORY_LABELS, product.category) ||
      !['demo', 'manual'].includes(product.source)
    )
      fail('상품 분류 또는 출처가 올바르지 않습니다.');
    for (const key of ['kind', 'color', 'pattern', 'brand'])
      if (product[key] !== undefined) checkString(product[key], `상품 ${key}`, 300);
    if (product.color !== undefined && !Object.hasOwn(COLOR_LABELS, product.color))
      fail('지원하지 않는 상품 색입니다.');
    if (product.checkedAt != null) checkString(product.checkedAt, '상품 확인일', 100);
    if (
      product.price !== null &&
      (!Number.isFinite(product.price) || product.price < 0 || product.price > 100000000)
    )
      fail('상품 가격이 올바르지 않습니다.');
    checkUrl(product.url, '구매처');
    if (!Array.isArray(product.reviews)) fail('후기 목록이 올바르지 않습니다.');
    for (const review of product.reviews) {
      if (!isObject(review)) fail('후기가 올바르지 않습니다.');
      checkString(review.text, '후기 본문', 10000, true);
      for (const key of ['topic', 'sourceLabel'])
        if (review[key] !== undefined) checkString(review[key], `후기 ${key}`, 1000);
      if (!['demo', 'manual'].includes(review.kind)) fail('후기 종류가 올바르지 않습니다.');
      checkUrl(review.url, '후기 원문');
    }
  }
  const savedOutfitIds = new Set();
  for (const saved of state.savedOutfits) {
    if (
      !isObject(saved) ||
      !Array.isArray(saved.items) ||
      !saved.items.every((id) => itemIds.has(id))
    )
      fail('저장 코디가 없는 옷을 참조합니다.');
    checkString(saved.id, '저장 코디 ID', 2000, true);
    if (savedOutfitIds.has(saved.id)) fail('저장 코디가 중복되었습니다.');
    savedOutfitIds.add(saved.id);
    checkString(saved.title, '저장 코디 이름', 1000, true);
    for (const key of ['reasons', 'cautions'])
      if (
        !Array.isArray(saved[key]) ||
        !saved[key].every((value) => typeof value === 'string' && value.length <= 5000)
      )
        fail('저장 코디 설명이 올바르지 않습니다.');
  }
  if (new Set(state.savedProducts).size !== state.savedProducts.length)
    fail('저장 상품이 중복되었습니다.');
  for (const saved of state.savedProducts)
    if (typeof saved !== 'string' || !productIds.has(saved))
      fail('저장 목록이 없는 상품을 참조합니다.');
  for (const decision of state.decisions) {
    if (!isObject(decision)) fail('사용 기록이 올바르지 않습니다.');
    if (
      decision.itemIds !== undefined &&
      (!Array.isArray(decision.itemIds) || !decision.itemIds.every((id) => itemIds.has(id)))
    )
      fail('사용 기록이 없는 옷을 참조합니다.');
    if (
      decision.productId !== undefined &&
      (typeof decision.productId !== 'string' || !productIds.has(decision.productId))
    )
      fail('사용 기록이 없는 상품을 참조합니다.');
    if (decision.id !== undefined) checkString(decision.id, '사용 기록 ID', 160, true);
    if (!['wear', 'purchase', 'hold', 'skip'].includes(decision.type))
      fail('사용 기록 종류가 올바르지 않습니다.');
    if (decision.note !== undefined) checkString(decision.note, '사용 기록 메모', 5000);
    if (decision.createdAt !== undefined) {
      checkString(decision.createdAt, '사용 기록 날짜', 100);
      if (!Number.isFinite(Date.parse(decision.createdAt)))
        fail('사용 기록 날짜가 올바르지 않습니다.');
    }
  }
  if (state.aiRecommendation !== undefined) validateAIRecommendationCache(state.aiRecommendation);
  walkSafe(state);
  return state;
}

function validateAIRecommendationCache(cache) {
  if (!isObject(cache) || !isObject(cache.snapshot) || !isObject(cache.options) || !isObject(cache.result))
    fail('저장한 AI 응답의 형식이 올바르지 않습니다.');
  const { version, mode, ...requestData } = cache.snapshot;
  if (version !== 2 || !['demo', 'personal'].includes(mode)) fail('저장한 AI 요청의 버전을 확인해 주세요.');
  const request = validateAIRequest(requestData);
  if (cache.options.intent !== request.intent || cache.options.anchorId !== request.anchorId)
    fail('저장한 AI 응답의 요청 조건이 일치하지 않습니다.');
  const result = cache.result;
  if (result.provider !== 'manual-ai' || !Array.isArray(result.outfits) || !Array.isArray(result.purchases))
    fail('저장한 AI 응답의 출처 또는 목록이 올바르지 않습니다.');
  checkString(result.model, 'AI 출처', 300, true);
  checkString(result.generatedAt, 'AI 응답 날짜', 100, true);
  if (!Number.isFinite(Date.parse(result.generatedAt))) fail('AI 응답 날짜가 올바르지 않습니다.');
  checkIds(result.outfits, 'AI 코디');
  validateAIOutput({ outfits: result.outfits.map(({ id, ...outfit }) => outfit), gaps: result.gaps,
    purchases: result.purchases }, request);
  if (!Array.isArray(result.limitations) || result.limitations.length > 10
    || result.limitations.some(text => typeof text !== 'string' || text.length > 5000))
    fail('AI 응답의 확인 사항이 올바르지 않습니다.');
  return cache;
}

export function createAIRecommendationCache(state, result, { intent = '', anchorId = null } = {}) {
  const snapshot = JSON.parse(buildAISnapshotKey(state, { intent, anchorId }));
  const cache = JSON.parse(JSON.stringify({ snapshot, options: { intent: snapshot.intent, anchorId: snapshot.anchorId }, result }));
  return validateAIRecommendationCache(cache);
}

export function getAIRecommendationStatus(state, options = state.aiRecommendation?.options || {}) {
  const cache = state.aiRecommendation;
  if (!cache) return { status: 'empty', result: null };
  try {
    validateAIRecommendationCache(cache);
    if (JSON.stringify(cache.snapshot) !== buildAISnapshotKey(state, options))
      return { status: 'stale', result: null };
    return { status: 'current', result: cache.result };
  } catch { return { status: 'stale', result: null }; }
}
export function parseBackup(text) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).byteLength > MAX_BACKUP_BYTES)
    fail('파일이 너무 큽니다(최대 32 MB).');
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    fail('올바른 JSON 파일이 아닙니다.');
  }
  walkSafe(parsed);
  if (parsed?.format && parsed.format !== 'wearnext-backup')
    fail('웨어넥스트 백업 형식이 아닙니다.');
  return validateState(parsed?.format === 'wearnext-backup' ? parsed.state : parsed);
}
function withoutImages(value) {
  if (typeof value === 'string' && value.startsWith('data:image/')) return undefined;
  if (Array.isArray(value)) return value.map(withoutImages).filter((entry) => entry !== undefined);
  if (isObject(value))
    return Object.fromEntries(
      Object.entries(value)
        .map(([key, child]) => [key, withoutImages(child)])
        .filter(([, child]) => child !== undefined),
    );
  return value;
}
export function serializeBackup(state, { includeImages = true } = {}) {
  const cloned = parseBackup(JSON.stringify(state));
  const result = JSON.stringify(
    {
      format: 'wearnext-backup',
      exportedAt: new Date().toISOString(),
      state: includeImages ? cloned : withoutImages(cloned),
    },
    null,
    2,
  );
  if (new TextEncoder().encode(result).byteLength > MAX_BACKUP_BYTES)
    fail('내보내기 파일 크기가 32 MB를 넘습니다.');
  return result;
}

const DB_NAME = 'wearnext-prototype';
const STORE_NAME = 'wardrobe';
function storageError(error) {
  const detail =
    error?.name === 'QuotaExceededError'
      ? '저장 공간이 부족합니다. 사진 크기를 줄이거나 백업해 주세요.'
      : error?.message || '브라우저 저장소를 사용할 수 없습니다.';
  return new Error(`로컬 저장 실패: ${detail}`);
}
async function openDatabase() {
  if (!globalThis.indexedDB)
    throw storageError(new Error('이 환경은 IndexedDB를 지원하지 않습니다.'));
  return new Promise((resolve, reject) => {
    let settled = false;
    let request;
    try {
      request = globalThis.indexedDB.open(DB_NAME, 1);
    } catch (error) {
      reject(storageError(error));
      return;
    }
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME))
        request.result.createObjectStore(STORE_NAME);
    };
    request.onerror = () => {
      settled = true;
      reject(storageError(request.error));
    };
    request.onblocked = () => {
      settled = true;
      reject(
        storageError(
          new Error('다른 탭이 저장소 변경을 막고 있습니다. 다른 탭을 닫고 다시 시도해 주세요.'),
        ),
      );
    };
    request.onsuccess = () => {
      if (settled) request.result.close();
      else {
        settled = true;
        resolve(request.result);
      }
    };
  });
}
async function transaction(mode, action) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    let tx;
    let result;
    try {
      tx = db.transaction(STORE_NAME, mode);
      const request = action(tx.objectStore(STORE_NAME));
      request.onsuccess = () => {
        result = request.result;
      };
      tx.oncomplete = () => {
        db.close();
        resolve(result);
      };
      tx.onerror = tx.onabort = () => {
        db.close();
        reject(storageError(tx.error || request.error));
      };
    } catch (error) {
      try {
        tx?.abort();
      } catch {}
      db.close();
      reject(storageError(error));
    }
  });
}
export async function loadState() {
  const data = await transaction('readonly', (store) => store.get('current'));
  return data == null ? null : parseBackup(typeof data === 'string' ? data : JSON.stringify(data));
}
export async function saveState(state) {
  const valid = parseBackup(JSON.stringify(state));
  await transaction('readwrite', (store) => store.put(valid, 'current'));
}
export async function clearState() {
  await transaction('readwrite', (store) => store.delete('current'));
}
