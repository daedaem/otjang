import { validateProfile } from './domain/garment-profile.js';
import { readLiteInputDraft } from './domain/lite-input-draft.js';
// UX 시안 10개 2판(실제 웹앱 형태)이 함께 쓰는 목업 코어. 1판(app/mockups/ux10/src/core.mjs)을 바탕으로 했다.
// 실제 앱의 엔진(검색·비교·코디·구매 기록)을 화면과 무관한 API로 감싼다.
// 시안은 화면만 다르게 만들고, 판단 문장과 규칙은 모두 여기서 온다(현재 앱의 구매 비교 화면과 같은 순서).
// 2판에서 바뀐 것: 상품·옷장·코디를 그림 대신 사진으로 보여 준다(실제 앱과 같은 규칙: 상품은 판매처 사진,
// 종류·색만 아는 옷은 '비슷한 상품 사진'), 안내문은 짧게 줄이고 자세한 고지는 한 곳(disclosure)에 모은다,
// 주소(#/...)로 화면을 옮겨 브라우저 뒤로가기가 동작하게 하는 route를 둔다.
// 저장은 이 브라우저에만, 앱과 다른 키로 한다. 앱 저장소·서버는 건드리지 않는다.
import { registrationInput, readRegistrations } from './domain/lite-registration.js';
import { CATALOG, PRODUCTS } from './domain/data/products.js';
import { SLOT_BY_ID, SLOTS, COLORS, STYLES } from './domain/data/slots.js';
import { ROLE_LABEL, ROLE_ORDER } from './domain/data/looks.js';
import {
  search, recommendLooks, recommendItems, formatPrice, josa, PRODUCT_BY_ID, productsFor, meetsCriteria,
  productCriteria, criteriaLine, productReasons, scoreSlot, seasonOf, SEASON_LABEL, SAFE_PRODUCTS, lookalike, closetLooks, basicOutfits,
} from './domain/engine.js';
import { newWardrobeState, wardrobeView, makeGarment, garmentKindChoices, garmentKindName, garmentLabel, GARMENT_KINDS } from './domain/wardrobe.js';
import { candidateFromProduct, compareCandidate, quickCompare } from './domain/purchase-candidate.js';
import { createPurchaseJourney, transitionPurchaseJourney, JOURNEY_RETURN_REASONS } from './domain/purchase-journey.js';
import { relatedReturnRecords } from './domain/related-returns.js';
import { purchasePlanContext } from './domain/purchase-plan-context.js';
import { resolveSearchFollowUp } from './domain/search-follow-up.js';
import { outfitCopy } from './domain/outfit-copy.js';

export const MOCK_API_VERSION = 3;
export const LITE_SNAPSHOT_VERSION = 2;

// 날씨 코디(R17)의 옷 종류별 따뜻함. 흔히 쓰는 "기온별 옷차림" 구간을 옷 종류로만 옮긴 것이다(소재·두께 정보는 없다).
const OUTER_WARMTH = { cardigan: 1, vest: 1, jacket: 2, blazer: 2, coat: 3, down: 4 };
const TOP_WARMTH = { tee: 0, polo: 0, shirt: 1, longtee: 1, dress: 1, knit: 2, sweat: 2 };
// 아침 최저 기온으로 겉옷 범위를 정한다. outerMin 0이면 겉옷 없이도 된다.
export function weatherBand(min) {
  if (min >= 20) return { label: '더운 날', advice: '겉옷 없이 가볍게 입어도 돼요.', outerMin: 0, outerMax: 1 };
  if (min >= 17) return { label: '선선한 날', advice: '얇은 겉옷 하나면 충분해요.', outerMin: 0, outerMax: 2 };
  if (min >= 12) return { label: '쌀쌀한 아침', advice: '가벼운 재킷이나 카디건을 챙기세요.', outerMin: 1, outerMax: 2, need: '가벼운 겉옷', query: '재킷' };
  if (min >= 8) return { label: '추워지는 날', advice: '재킷이나 코트가 필요해요.', outerMin: 2, outerMax: 3, need: '재킷이나 코트', query: '코트' };
  if (min >= 4) return { label: '추운 날', advice: '코트를 입고, 추위를 타면 패딩도 좋아요.', outerMin: 3, outerMax: 4, need: '코트', query: '코트' };
  return { label: '아주 추운 날', advice: '패딩이나 두꺼운 코트가 필요해요.', outerMin: 3, outerMax: 4, need: '패딩이나 코트', query: '패딩' };
}

export function createMock({ storage = null, requireStorage = false, key = 'eoul-mockup-ux10v2:v1', clock = () => new Date(), reset = false, photos = true } = {}) {
  const DECISION_LABEL = { buy: '사기로 함', hold: '보류', skip: '안 사기로 함' };
  const RETURN_LABEL = { size: '사이즈', color: '색', quality: '품질', 'change-of-mind': '마음이 바뀜', other: '기타' };
  const FINE = '종류·색과 코디 공식으로 비교했어요. 소재·핏·사이즈·현재 가격은 판매처에서 확인해요.';
  // 화면에는 짧은 문구(short)만 한 번씩 쓰고, 자세한 고지는 disclosure 한 곳에 모은다.
  const NOTE = {
    mock: '시안',
    ai: 'AI가 디자이너·프론트엔드 개발자 10팀 역할로 만든 시안이에요. 실제 수상 디자이너나 빅테크 디자이너가 참여하지 않았어요.',
    catalog: `상품 이름·가격·사진은 ${CATALOG.checkedLabel} ${CATALOG.store} 상품 페이지에서 수집한 개인 시험용 자료예요.`,
    price: '수집일 가격이에요. 현재가·최저가가 아니고 쿠폰·배송비는 빠져 있어요.',
    rules: '대화형 AI가 아니라 정해진 규칙으로 요청을 읽어요. 못 읽은 말은 못 읽었다고 알려요.',
    records: '주문·수령·반품은 직접 남긴 기록이에요. 확인된 거래가 아니에요.',
    photos: '상품 사진은 무신사 이미지 서버의 주소를 그대로 불러와요(저장소에 사진 파일 없음). 사용 권리는 확인되지 않았어요.',
    similar: '사진 없이 종류·색으로 넣은 옷은 같은 종류·색의 비슷한 상품 사진으로 보여 줘요. 실제 옷과 다를 수 있어요.',
    short: { price: '수집가', records: '직접 남긴 기록', similar: '비슷한 상품 사진', used: '외부 검색 · 매물 확인 안 함', rules: '규칙으로 읽었어요', trial: '체험용' },
  };
  // 체험용 옷장: 같은 요청 안에서도 "겹쳐요·색만 달라요"가 갈리고, 코트처럼 없는 종류에서는 새 코디가 생기도록 고른 구성.
  const TRIAL = {
    M: [['m-oxford', 'white', '흰 옥스퍼드 셔츠'], ['m-tee', 'white', '흰 무지 티셔츠'], ['m-knit', 'navy', '네이비 크루넥 니트'], ['m-blazer', 'navy', '네이비 블레이저'],
      ['m-chino', 'beige', '베이지 치노 팬츠'], ['m-denim', 'indigo', '인디고 워시드 데님'], ['m-loafer', 'brown', '브라운 로퍼'], ['m-white-sneaker', 'white', '흰 스니커즈']],
    F: [['f-tee', 'white', '흰 티셔츠'], ['f-knit', 'beige', '베이지 니트'], ['f-trench', 'beige', '베이지 트렌치 코트'], ['f-slacks', 'black', '블랙 슬랙스'],
      ['f-denim', 'blue', '라이트 블루 데님'], ['f-loafer', 'black', '블랙 로퍼'], ['f-sneaker', 'white', '흰 스니커즈']],
  };
  const EXAMPLES = {
    M: ['출근용 셔츠 10만원 이하', '겨울 데이트 코트', '검정 말고 주말에 입을 편한 바지', '흰 스니커즈 10만원 이하', '하객룩 셔츠', '아메카지 재킷'],
    F: ['출근용 셔츠 10만원 이하', '원피스 10만원 이하', '겨울 코트 20만원 이하', '데이트 스커트', '가성비 니트', '흰 스니커즈'],
  };
  // 정직한 답을 보여 주는 요청: 없는 종류, 성별과 맞지 않는 종류, 못 읽는 말, 이어서 묻기.
  const EDGE_EXAMPLES = ['반바지', '남자 원피스', '꾸안꾸 느낌으로', '더 싼 걸로'];

  const listeners = new Set();
  const blank = () => ({ v: LITE_SNAPSHOT_VERSION, gender: 'M', garments: [], journeys: [], trialIds: [], absences: {}, compare: [], recent: [], seq: 0 });
  let S = blank();
  let version = 0;
  let cache = { version: -1, state: null, judge: new Map() };
  let lastAsk = null;
  const scrollMemo = new Map();

  const iso = () => clock().toISOString();
  const today = () => {
    const d = clock();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const nextId = (prefix) => `${prefix}_mock_${Date.now().toString(36)}_${(S.seq++).toString(36)}`;
  const uniq = (rows) => [...new Map(rows.map((row) => [row.id, row])).values()];
  const colorLabel = (c) => COLORS[c]?.label || '색 미확인';
  const colorHex = (c) => COLORS[c]?.hex || null;

  function buildState(record) {
    const references = new Set();
    const projected = record.garments.map(g => {
      if (g.profile !== undefined) {
        validateProfile(g.profile, g);
        if (g.profile.reference) { if (references.has(g.kind)) throw new Error('duplicate_reference'); references.add(g.kind); }
      }
      // The legacy kind/color engine does not own the profile storage schema.
      const { profile, ...flat } = g; return flat;
    });
    const base = {
      ...newWardrobeState(), demo: false, demoSelected: [], gender: record.gender,
      garments: projected, journeys: record.journeys,
    };
    return { ...wardrobeView(base), now: today() };
  }
  // 저장된 원문을 읽지 못하면 빈 옷장으로 보여 주되, 다음 저장이 그 원문을 덮어쓰지 않게 막는다.
  // (미래 형식·잘린 JSON·엔진 검증 실패·읽기 예외). 사용자가 원문을 따로 보관하고 새로 시작할 때만 풀린다.
  const UNREADABLE = '저장된 옷장 기록을 읽지 못했어요. 기록을 지우지 않도록 저장을 멈췄어요. 원문을 받아 두거나 따로 보관한 뒤 새로 시작할 수 있어요.';
  const UNAVAILABLE = '이 브라우저 저장소를 쓸 수 없어요. 지금 화면의 변경은 저장되지 않아요. 브라우저 설정·저장 공간을 확인해 주세요.';
  let legacyPending = false; // Defer incidental search-history saves until an explicit v2 command.
  let storageIssue = null; // { code: 'storage_unreadable'|'storage_unavailable', message, raw }
  // 저장 원문 하나를 엔진 규칙으로 읽는다. 읽을 수 없으면 던진다. 불러오기와 백업 복원 전 검사가 같은 규칙을 쓴다.
  function readSaved(raw) {
    const v = JSON.parse(raw);
    if (![1, LITE_SNAPSHOT_VERSION].includes(v?.v) || !Array.isArray(v.garments) || !Array.isArray(v.journeys)) throw new Error('unsupported');
    const next = { ...blank(), ...v, v: LITE_SNAPSHOT_VERSION, trialIds: Array.isArray(v.trialIds) ? v.trialIds : [], absences: v.absences && typeof v.absences === 'object' ? v.absences : {},
      compare: Array.isArray(v.compare) ? v.compare.filter((id) => PRODUCT_BY_ID[id]).slice(0, 4) : [], recent: Array.isArray(v.recent) ? v.recent.filter((x) => typeof x === 'string').slice(0, 5) : [] };
    next.gender = next.gender === 'F' ? 'F' : 'M';
    next.registrations = readRegistrations(v.registrations);
    buildState(next);
    return next;
  }
  function load() {
    storageIssue = null; legacyPending = false;
    if (!storage) {
      if (requireStorage) storageIssue = { code: 'storage_unavailable', message: UNAVAILABLE, raw: null };
      return blank();
    }
    let raw;
    try { raw = storage.getItem(key); } catch {
      storageIssue = { code: 'storage_unavailable', message: UNAVAILABLE, raw: null }; // 무엇이 저장돼 있는지 모르면 쓰지 않는다.
      return blank();
    }
    if (raw === null || raw === undefined || raw === '') return blank();
    try {
      const loaded = readSaved(raw); legacyPending = JSON.parse(raw).v === 1; return loaded;
    } catch {
      storageIssue = { code: 'storage_unreadable', message: UNREADABLE, raw: String(raw) };
      return blank();
    }
  }
  function save() {
    if (storageIssue?.code === 'storage_unreadable') throw Object.assign(new Error(UNREADABLE), { code: 'storage_unreadable' });
    if (storageIssue) throw Object.assign(new Error(UNAVAILABLE), { code: 'storage_write_failed' });
    if (!storage && !requireStorage) return; // 명시적인 메모리 전용 시안/검사.
    try {
      if (!storage) throw new Error('unavailable');
      storage.setItem(key, JSON.stringify(S));
    } catch {
      throw Object.assign(new Error('저장하지 못했어요. 기존 기록은 그대로예요. 저장 공간·브라우저 설정을 확인한 뒤 다시 시도해 주세요.'), { code: 'storage_write_failed' });
    }
  }
  function notify() {
    for (const fn of [...listeners]) {
      try { fn(api.getState()); } catch (error) { console.error(error); }
    }
  }
  function commit(change) {
    const before = structuredClone(S);
    try {
      change();
      buildState(S); // 엔진 검증을 통과해야만 저장한다.
      save(); // 저장 성공 전에는 버전·구독자에게 변경을 공개하지 않는다.
    } catch (error) {
      S = before;
      throw error;
    }
    legacyPending = false;
    version++;
    notify();
  }
  function engineState() {
    if (cache.version !== version || !cache.state) cache = { version, state: buildState(S), judge: new Map() };
    return cache.state;
  }
  const isTrial = (id) => S.trialIds.includes(id);
  const journeyFor = (productId) => S.journeys.find((j) => j.candidate.productId === productId) || null;
  const replaceJourney = (next) => { S.journeys = [...S.journeys.filter((j) => j.id !== next.id), next]; };

  // ── 보이는 모양
  function garmentView(g) {
    const raw = S.garments.find(x => x.id === g.id) || g;
    const slot = SLOT_BY_ID[g.slot];
    const bought = !!g.productId;
    return {
      id: g.id, kind: g.kind, kindName: garmentKindName(g.kind), slot: g.slot || null, slotName: slot?.name || null,
      label: g.label || garmentLabel(g), gender: g.gender, color: g.color, colorLabel: colorLabel(g.color), colorHex: colorHex(g.color),
      trial: isTrial(g.id), bought, productId: g.productId || null,
      brand: raw.brand || PRODUCT_BY_ID[raw.productId]?.brand || null, addedAt: raw.createdAt || null, photoId: raw.photoId || null,
      ...(raw.profile !== undefined ? { profile: structuredClone(raw.profile) } : {}),
      sourceLabel: isTrial(g.id) ? '체험용' : bought ? '기록에서 산 옷' : '내 옷',
      detailMissing: !g.slot ? '세부 종류 미확인' : !g.color ? '색 미확인' : null,
      photo: garmentPhoto(g),
    };
  }
  // ── 사진 (실제 앱 main.js의 picture/slotPicture와 같은 규칙)
  // 상품: 판매처 사진. 산 옷: 그 상품 사진. 종류·색만 아는 옷: 같은 세부 종류·색의 비슷한 상품 사진(표시 필수).
  // 세부 종류나 색을 모르는 옷: 특정 상품처럼 보이지 않게 사진 없이 색 카드.
  const PHOTO_HOST = /^https:\/\/image\.msscdn\.net\//;
  // 외부 사진 서버를 막는 곳(예: 공유 링크 페이지)에서는 window.EOUL_PHOTO_BASE에 함께 올린 사진 폴더를 적는다(파일 이름은 상품 id.jpg).
  const photoSrc = (p) => (typeof window !== 'undefined' && window.EOUL_PHOTO_BASE ? `${window.EOUL_PHOTO_BASE}${p.id}.jpg` : p.img);
  const productPhoto = (p) => (photos && p?.img && PHOTO_HOST.test(p.img) ? { src: photoSrc(p), similar: false, alt: `${p.brand} ${p.name}`, caption: '' } : null);
  function garmentPhoto(g) {
    if (!photos) return null;
    if (g.productId && PRODUCT_BY_ID[g.productId]) return productPhoto(PRODUCT_BY_ID[g.productId]);
    if (!g.slot || !g.color) return null;
    const like = lookalike(g.slot, g.color, { brand: g.brand || null });
    const ph = productPhoto(like);
    return ph ? { ...ph, similar: true, alt: `비슷한 상품 사진 · ${colorLabel(g.color)} ${SLOT_BY_ID[g.slot]?.name || ''}`.trim(), caption: NOTE.short.similar } : null;
  }
  // 카드·옷·코디 칸·기록 무엇을 받아도 사진을 찾는다(코어가 돌려준 값에는 photo가 이미 들어 있다).
  function photoOf(target) {
    if (!target) return null;
    if ('photo' in target) return target.photo;
    const pid = PRODUCT_BY_ID[target.id] ? target.id : PRODUCT_BY_ID[target.productId] ? target.productId : PRODUCT_BY_ID[target.product?.id] ? target.product.id : null;
    if (pid) return productPhoto(PRODUCT_BY_ID[pid]);
    const g = S.garments.find((x) => x.id === target.id);
    if (g) return garmentPhoto(g);
    if (target.slot && target.color) return garmentPhoto({ slot: target.slot, color: target.color });
    return null;
  }
  const escAttr = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // 사진이 없거나 못 불러올 때 보이는 색 카드(그림 아님): 색 바탕 + 종류 이름.
  function tileHtml(target) {
    const slot = SLOT_BY_ID[target?.slot];
    const hex = target?.colorHex || colorHex(target?.color) || '#e9e9e9';
    const light = COLORS[target?.color]?.light ?? 80;
    const name = target?.kindName || slot?.name || garmentKindName(target?.kind) || '옷';
    return `<span class="eo-tile" data-photo="none" style="display:flex;align-items:flex-end;justify-content:flex-start;width:100%;height:100%;aspect-ratio:var(--eo-ratio,4/5);background:${hex};color:${light < 55 ? '#fff' : '#222'};font:600 12px/1.3 system-ui,sans-serif;padding:8px;box-sizing:border-box;border-radius:inherit">${escAttr(name)}</span>`;
  }
  function photoHtml(target, { fit = 'cover', caption = true, alt = null, eager = false } = {}) {
    const ph = photoOf(target);
    if (!ph) return tileHtml(target);
    const fallback = tileHtml(target).replace(/"/g, '&quot;');
    const cap = ph.similar && caption ? `<span class="eo-cap" style="position:absolute;left:6px;bottom:6px;max-width:calc(100% - 12px);padding:2px 6px;border-radius:4px;background:rgba(255,255,255,.92);color:#333;font:600 11px/1.4 system-ui,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${NOTE.short.similar}</span>` : '';
    return `<span class="eo-ph" data-photo="${ph.similar ? 'similar' : 'product'}" style="position:relative;display:block;width:100%;height:100%;aspect-ratio:var(--eo-ratio,4/5);background:#f3f3f1;border-radius:inherit;overflow:hidden"><img src="${escAttr(ph.src)}" alt="${escAttr(alt ?? ph.alt)}" referrerpolicy="no-referrer"${eager ? '' : ' loading="lazy"'} decoding="async" onerror="this.parentNode.outerHTML='${fallback.replace(/'/g, '&#39;')}'" style="display:block;width:100%;height:100%;object-fit:${fit === 'contain' ? 'contain' : 'cover'};border-radius:inherit">${cap}</span>`;
  }

  function card(product, { slot = SLOT_BY_ID[product.slot], reasons = null, offOccasion = false } = {}) {
    const fixed = productReasons(product, slot, reasons || [slot.why]);
    const st = engineState();
    return {
      id: product.id, brand: product.brand, name: product.name,
      price: product.price, priceText: formatPrice(product.price),
      priceNote: `${Number(product.checkedAt.slice(5, 7))}월 ${Number(product.checkedAt.slice(8, 10))}일 수집가`,
      priceShort: `${Number(product.checkedAt.slice(5, 7))}/${Number(product.checkedAt.slice(8, 10))} 수집가`,
      photo: productPhoto(product),
      checkedAt: product.checkedAt, store: product.store, url: product.url,
      color: product.color, colorLabel: colorLabel(product.color), colorHex: colorHex(product.color),
      colorFromPhoto: product.colorSource === 'image',
      kind: slot.shape, kindName: garmentKindName(slot.shape), slot: slot.id, slotName: slot.name, gender: slot.g,
      rating: product.rating ?? null, reviews: product.reviews ?? null,
      reason: fixed.reasons[0] || slot.why, reasons: fixed.reasons, traitLine: fixed.traitLine && fixed.traitLine !== fixed.reasons[0] ? fixed.traitLine : null,
      offOccasion: !!offOccasion,
      owned: ownedQuick(product, slot, st),
      record: recordView(journeyFor(product.id)),
    };
  }
  // 목록용 빠른 보유 판정: 앱의 카드 문장(ownedLine)과 같은 규칙.
  function ownedQuick(product, slot, st) {
    const mine = st.closet.filter((i) => i.gender === slot.g && ['user', 'legacy'].includes(i.source));
    if (!mine.length) return { tone: 'none', label: '옷장 없이', text: '' };
    const kind = garmentKindName(slot.shape);
    const same = mine.filter((i) => i.productId === product.id);
    if (same.length) return { tone: 'stop', label: '이미 있어요', text: '옷장에 있는 상품이에요' };
    const qc = quickCompare(st, { kind: slot.shape, color: product.colorSource === 'image' ? null : product.color, gender: slot.g });
    // 겹친 옷이 모두 체험용이면 '내 옷장'이 아니라 체험용 옷장이라고 쓴다.
    const where = (rows) => rows.every((g) => isTrial(g.id)) ? '체험용 옷장에' : '옷장에';
    const tag = (rows) => rows.every((g) => isTrial(g.id)) ? ' · 체험용' : '';
    if (qc.sameColor.length) return { tone: 'stop', label: `겹쳐요${tag(qc.sameColor)}`, text: `${where(qc.sameColor)} 같은 종류·색 ${kind} ${qc.sameColor.length}벌`, trial: qc.sameColor.every((g) => isTrial(g.id)) };
    if (qc.otherColor.length) return { tone: 'info', label: `색만 달라요${tag(qc.otherColor)}`, text: `${where(qc.otherColor)} ${kind} ${qc.otherColor.length}벌 · 색은 달라요`, trial: qc.otherColor.every((g) => isTrial(g.id)) };
    if (qc.unknownColor.length) return { tone: 'info', label: `색 확인${tag(qc.unknownColor)}`, text: `${where(qc.unknownColor)} ${kind} ${qc.unknownColor.length}벌 · 색 확인 필요`, trial: qc.unknownColor.every((g) => isTrial(g.id)) };
    return { tone: 'new', label: '없는 종류', text: `${mine.every((g) => isTrial(g.id)) ? '체험용 옷' : '등록한 옷'} 중 ${kind}${josa(kind, '은', '는')} 아직 없어요` };
  }
  function outfitView(result, { candidateId = null, focusId = null } = {}) {
    if (!result) return null;
    const copy = outfitCopy(result);
    const pieces = [...result.items]
      .sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role))
      .map((row) => {
        const isCandidate = row.source === 'candidate' || (!row.owned && row.candidate);
        const product = row.product || (isCandidate && candidateId ? PRODUCT_BY_ID[candidateId] : null);
        const slot = row.slot || (row.item ? SLOT_BY_ID[row.item.slot] : null) || (product ? SLOT_BY_ID[product.slot] : null);
        const color = row.owned ? row.item?.color ?? row.color : product?.color ?? row.color;
        return {
          role: row.role, roleLabel: ROLE_LABEL[row.role] || '',
          garmentId: row.owned ? row.item?.id ?? null : null,
          owned: !!row.owned, trial: !!(row.owned && row.item && isTrial(row.item.id)),
          candidate: !!isCandidate || (!!product && product.id === candidateId),
          focus: !!product && product.id === focusId,
          label: row.owned ? (row.item?.label || garmentLabel(row.item || { kind: slot?.shape })) : product ? `${product.brand} ${product.name}` : slot?.name || '',
          kindName: garmentKindName(slot?.shape || row.item?.kind), slot: slot?.id || null,
          color, colorLabel: colorLabel(color), colorHex: colorHex(color),
          uncertain: row.certainty === 'uncertain',
          photo: row.owned ? (row.item ? garmentPhoto(row.item) : null) : product ? productPhoto(product) : (slot && color ? garmentPhoto({ slot: slot.id, color }) : null),
          product: product && !row.owned ? { id: product.id, brand: product.brand, name: product.name, price: product.price, priceText: formatPrice(product.price), url: product.url } : null,
        };
      });
    const buy = pieces.filter((p) => !p.owned && p.product && !p.candidate);
    return {
      id: result.look?.id || null, formula: result.look?.title || '', title: copy.title, note: copy.note,
      pieces, ownedCount: pieces.filter((p) => p.owned).length, buyCount: buy.length,
      buyTotal: buy.reduce((sum, p) => sum + (p.product?.price || 0), 0),
      buyTotalText: buy.length ? formatPrice(buy.reduce((sum, p) => sum + (p.product?.price || 0), 0)) : '',
      uncertainCount: result.uncertainCount || 0,
    };
  }
  function recordView(j) {
    if (!j) return null;
    const p = PRODUCT_BY_ID[j.candidate.productId];
    const stageLabel = {
      candidate: j.decision === 'buy' ? '사기로 함 · 주문 전' : j.decision ? DECISION_LABEL[j.decision] : '비교 중',
      ordered: '주문했다고 기록함', received: '받음 · 계속 입을지 결정 전', kept: '계속 입는 내 옷', returned: '반품했다고 기록함',
    }[j.stage];
    const next = {
      candidate: [{ step: 'ordered', label: '주문했어요' }],
      ordered: [{ step: 'received', label: '받았어요' }],
      received: [{ step: 'kept', label: '계속 입을게요' }, { step: 'returned', label: '반품했어요', needsReason: true }],
      kept: [{ step: 'worn', label: '오늘 입었어요' }, { step: 'returned', label: '반품했어요', needsReason: true }],
      returned: [],
    }[j.stage];
    const last = j.history[j.history.length - 1];
    return {
      id: j.id, productId: j.candidate.productId,
      product: p ? { id: p.id, brand: p.brand, name: p.name, price: p.price, priceText: formatPrice(p.price), url: p.url, photo: productPhoto(p), color: p.color, colorHex: colorHex(p.color), colorLabel: colorLabel(p.color), slot: p.slot, kind: SLOT_BY_ID[p.slot]?.shape, kindName: garmentKindName(SLOT_BY_ID[p.slot]?.shape) } : null,
      decision: j.decision, decisionLabel: j.decision ? DECISION_LABEL[j.decision] : '결정 전',
      stage: j.stage, stageLabel, next, wearCount: j.wearCount,
      returnReason: j.feedback?.returnReason || null, returnReasonLabel: RETURN_LABEL[j.feedback?.returnReason] || null,
      updatedAt: last?.at || null,
    };
  }

  // ── API
  const api = {
    apiVersion: MOCK_API_VERSION,
    readInputDraft: readLiteInputDraft,
    canReadInputDraft(raw) { try { readLiteInputDraft(raw); return true; } catch { return false; } },
    note: NOTE,
    catalog: { store: CATALOG.store, checkedLabel: CATALOG.checkedLabel, count: CATALOG.count, rights: CATALOG.rights },
    returnReasons: JOURNEY_RETURN_REASONS.map((id) => ({ id, label: RETURN_LABEL[id] })),
    version: () => version,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    storageIssue: () => (storageIssue ? { code: storageIssue.code, message: storageIssue.message } : null),
    unreadableRaw: () => (storageIssue?.code === 'storage_unreadable' ? storageIssue.raw : null),
    // 백업 복원 전 검사: 이 원문을 지금 엔진이 그대로 읽을 수 있는지(저장소는 건드리지 않는다).
    canReadSaved(raw) {
      if (typeof raw !== 'string' || !raw) return false;
      try { readSaved(raw); return true; } catch { return false; }
    },
    // 읽지 못한 원문을 같은 기기의 별도 키에 그대로 보관한 것을 확인한 뒤에만 빈 기록으로 새로 시작한다.
    startFresh() {
      const issue = storageIssue;
      if (issue?.code !== 'storage_unreadable') throw new Error('새로 시작할 필요가 없어요.');
      const keep = Object.assign(new Error('원문을 따로 보관하지 못해 새로 시작하지 않았어요. 기존 기록은 그대로예요. 원문 파일을 먼저 받아 주세요.'), { code: 'storage_write_failed' });
      let current;
      try { current = storage.getItem(key); } catch { throw keep; }
      if (current !== issue.raw) { // 그 사이 다른 탭이 기록을 바꿨다면 덮어쓰지 않고 다시 읽는다.
        S = load(); version++; lastAsk = null; notify();
        throw Object.assign(new Error('다른 화면에서 기록이 바뀌어 다시 불러왔어요. 다시 확인해 주세요.'), { code: 'storage_changed' });
      }
      const archiveKey = `${key}:unreadable:${iso()}`;
      try {
        storage.setItem(archiveKey, issue.raw);
        if (storage.getItem(archiveKey) !== issue.raw) throw new Error('mismatch');
      } catch { throw keep; }
      const before = S;
      storageIssue = null; S = blank();
      try { save(); } catch (error) { storageIssue = issue; S = before; throw error; }
      version++; lastAsk = null; notify();
      return archiveKey;
    },
    getState() {
      const st = engineState();
      const closet = st.closet.map(garmentView);
      return {
        gender: S.gender,
        closet,
        closetCount: closet.length,
        trialCount: closet.filter((g) => g.trial).length,
        mineCount: closet.filter((g) => !g.trial).length,
        records: S.journeys.map(recordView).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))),
      };
    },
    setGender(g) { commit(() => { S.gender = g === 'F' ? 'F' : 'M'; }); },
    reset() { commit(() => { S = blank(); }); lastAsk = null; },
    examples: (gender = S.gender) => [...EXAMPLES[gender === 'F' ? 'F' : 'M']],
    edgeExamples: () => [...EDGE_EXAMPLES],
    kindChoices: (gender = S.gender) => garmentKindChoices(gender === 'F' ? 'F' : 'M').map((k) => ({ id: k.id, name: k.name })),
    slotChoices: (kind, gender = S.gender) => SLOTS.filter((s) => s.g === (gender === 'F' ? 'F' : 'M') && s.shape === kind).map((s) => ({ id: s.id, name: s.name })),
    colorChoices: () => Object.entries(COLORS).map(([id, c]) => ({ id, label: c.label, hex: c.hex, light: c.light ?? 50 })),
    formatPrice,

    registrationMetadata(id) {
      const receipt = S.registrations?.receipts.find((r) => r.garmentId === id);
      if (!receipt) return null;
      const { draftId, ...input } = receipt.input;
      return { ...structuredClone(input), kindName: garmentKindName(input.kind),
        key: `${input.brand} ${input.name}`.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' '), at: receipt.at };
    },
    registerGarment(value) {
      const input = registrationInput(value);
      if (!GARMENT_KINDS.some((k) => k.id === input.kind) || !COLORS[input.color]) throw new Error('종류·색을 다시 골라 주세요.');
      const registrations = readRegistrations(S.registrations);
      const previous = registrations.receipts.find((r) => r.input.draftId === input.draftId);
      if (previous) {
        if (JSON.stringify(previous.input) !== JSON.stringify(input)) throw Object.assign(new Error('이미 저장한 등록의 내용이 달라요. 새 등록으로 시작해 주세요.'), { code: 'registration_conflict' });
        const garment = S.garments.find((g) => g.id === previous.garmentId);
        if (!garment) throw new Error('이미 등록한 뒤 삭제한 옷이에요. 새 등록으로 시작해 주세요.');
        return garmentView(garment);
      }
      if (registrations.receipts.length >= 2000) throw new Error('등록 기록 한도에 도달했어요. 자료를 내보낸 뒤 정리해 주세요.');
      let garment;
      commit(() => {
        const slot = SLOTS.find((s) => s.shape === input.kind && s.g === S.gender)?.id || null;
        garment = makeGarment({ id: nextId('g'), slot, kind: input.kind, gender: S.gender, color: input.color,
          brand: input.brand, label: input.name, source: 'user', createdAt: iso() });
        if (input.profile !== undefined) garment.profile = structuredClone(input.profile);
        if (garment.profile?.reference) for (const other of S.garments) if (other.kind === garment.kind && other.profile?.reference) { other.profile = { ...other.profile }; delete other.profile.reference; }
        S.garments = [...S.garments, garment];
        registrations.receipts.push({ input, garmentId: garment.id, at: iso() });
        S.registrations = registrations;
      });
      return garmentView(garment);
    },

    addGarment({ kind, color = null, slot = null, gender = S.gender, label = '', trial = false } = {}) {
      const g = gender === 'F' ? 'F' : 'M';
      if (!GARMENT_KINDS.some((k) => k.id === kind)) throw new Error('옷 종류를 골라 주세요.');
      const s = slot && SLOT_BY_ID[slot]?.shape === kind && SLOT_BY_ID[slot]?.g === g ? slot : null;
      let garment;
      commit(() => {
        garment = makeGarment({ id: nextId('g'), slot: s, kind, gender: g, color: COLORS[color] ? color : null, label: String(label || ''), source: 'user', createdAt: iso() });
        S.garments = [...S.garments, garment];
        if (trial) S.trialIds = [...S.trialIds, garment.id];
      });
      return garmentView(garment);
    },
    updateGarmentProfile(id, value) {
      const garment = S.garments.find(g => g.id === id);
      if (!garment || isTrial(id)) throw new Error('실제 보유한 옷을 골라 주세요.');
      const profile = validateProfile(value, garment);
      commit(() => {
        if (profile.reference) for (const other of S.garments) if (other.id !== id && other.kind === garment.kind && other.profile?.reference) { other.profile = { ...other.profile }; delete other.profile.reference; }
        S.garments = S.garments.map(g => g.id === id ? { ...g, profile: structuredClone(profile) } : g);
      });
      return garmentView(S.garments.find(g => g.id === id));
    },
    updateGarment(id, { color, slot } = {}) {
      commit(() => {
        S.garments = S.garments.map((g) => {
          if (g.id !== id) return g;
          const next = { ...g };
          if (color !== undefined) next.color = COLORS[color] ? color : null;
          if (slot !== undefined) next.slot = slot && SLOT_BY_ID[slot]?.shape === g.kind && SLOT_BY_ID[slot]?.g === g.gender ? slot : null;
          return next;
        });
      });
    },
    removeGarment(id) {
      const linked = S.journeys.some((j) => j.garmentId === id);
      if (linked) throw new Error('구매 기록과 연결된 옷이에요. 기록에서 반품으로 정리해 주세요.');
      commit(() => {
        S.garments = S.garments.filter((g) => g.id !== id);
        S.trialIds = S.trialIds.filter((x) => x !== id);
      });
    },
    loadTrialCloset(gender = S.gender) {
      const g = gender === 'F' ? 'F' : 'M';
      commit(() => {
        const old = new Set(S.trialIds);
        S.garments = S.garments.filter((x) => !old.has(x.id));
        const rows = TRIAL[g].map(([slot, color, label]) => makeGarment({ id: nextId('g'), slot, kind: SLOT_BY_ID[slot].shape, gender: g, color, label, source: 'user', createdAt: iso() }));
        S.garments = [...S.garments, ...rows];
        S.trialIds = rows.map((x) => x.id);
        S.gender = g;
      });
    },
    clearTrialCloset() {
      commit(() => {
        const old = new Set(S.trialIds);
        S.garments = S.garments.filter((x) => !old.has(x.id));
        S.trialIds = [];
      });
    },

    // 한 줄 요청 → 실제 상품과 조건·안내. 조건을 몰래 넓히지 않는다(검색 엔진 규칙 그대로).
    ask(text, { drop = [], previous = null } = {}) {
      const said = String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
      const base = { said, text: said, understood: false, title: '', conditions: [], dropped: [], notices: [], products: [], offOccasion: [], total: 0, outfit: null, outfitNote: null, listNote: '', criteria: null, gender: S.gender, season: null, seasonLabel: '', examples: api.examples() };
      if (!said) return { ...base, title: '찾고 싶은 옷을 적어 주세요', notices: [{ kind: 'empty-input', text: '예: 출근용 셔츠 10만원 이하' }] };
      let query = said, follow = null;
      const prev = typeof previous === 'string' ? previous : previous?.text;
      if (prev) {
        const resolved = resolveSearchFollowUp(prev, said);
        if (resolved) { query = resolved.query; follow = resolved.follow; }
      }
      let r;
      try {
        r = search(engineState(), query, { drop });
      } catch (error) {
        return { ...base, text: query, title: '요청을 읽지 못했어요', notices: [{ kind: 'error', text: '다른 말로 다시 적어 주세요.' }] };
      }
      const conditions = r.conds.map((c) => ({ key: c.key, label: c.saved ? `${c.label} (내 설정)` : c.label, removable: c.key !== 'kind' }));
      const notices = [];
      if (follow) notices.push({ kind: 'follow', text: follow.clarification ? `‘${follow.said}’: ${follow.clarification}` : `‘${follow.said}’는 이전 조건을 그대로 두고 ${follow.order}으로 다시 찾았어요. 새로 찾으려면 종류까지 적어 주세요.` });
      else if (/^\s*(?:좀\s*)?더\s*(싼|저렴한|비싼|좋은|나은|괜찮은)/.test(said) && !prev)
        notices.push({ kind: 'follow-missing', text: '이어서 물을 이전 요청이 없어요. 찾을 옷 종류부터 적어 주세요.' });
      if (!r.understood) {
        lastAsk = null;
        return { ...base, text: query, title: `‘${said}’는 아직 찾을 수 없어요`, notices: [...notices, { kind: 'not-understood', text: '이 말에 맞는 조건을 찾지 못해서 상품을 고르지 않았어요. 옷 종류·상황·예산으로 다시 적어 주세요.' }], examples: api.examples(r.gender) };
      }
      const kindLabel = r.conds.find((x) => x.key === 'kind')?.label || '이 종류';
      if (r.genderFromKind) notices.push({ kind: 'gender', text: `${kindLabel}${josa(kindLabel, '은', '는')} ${r.genderFromKind === 'F' ? '여성' : '남성'} 상품에만 있어서 ${r.genderFromKind === 'F' ? '여성' : '남성'} 상품에서 찾았어요.` });
      if (r.query.unsupported?.length) notices.push({ kind: 'unsupported', text: `반영하지 못한 조건: ${r.query.unsupported.join(', ')}. 상품 자료에 이 정보가 없어서 이 조건 없이 골랐어요.` });
      if (r.query.unknown?.length) notices.push({ kind: 'unknown', text: `이해하지 못한 말: ${r.query.unknown.join(', ')}. 이 말은 빼고 골랐어요.` });
      if (r.query.comfort) notices.push({ kind: 'comfort', text: '착용감 자료는 없어요. 상품명에 ‘밴딩·이지·와이드’ 같은 표기가 있는 상품을 앞에 뒀어요.' });
      if (r.query.qualityUnavailable) notices.push({ kind: 'quality', text: '품질을 비교할 자료는 없어요. 가격으로 품질을 판단하지 않았어요.' });
      const none = !r.items.length;
      if (none) {
        notices.push(r.kindUnavailable
          ? { kind: 'kind-unavailable', text: `${r.kindNowhere ? '상품 목록에 아직' : `${r.gender === 'F' ? '여성' : '남성'} 상품에는`} ${r.kindUnavailable}${josa(r.kindUnavailable, '이', '가')} 없어요. 다른 종류로 바꿔 채우지 않았어요.` }
          : { kind: 'empty', text: `조건에 맞는 상품이 없어요. 조건을 자동으로 넓히지 않았어요.${conditions.some((c) => c.removable) ? ' 조건을 직접 빼고 다시 찾을 수 있어요.' : ''}` });
      }
      const fit = r.items.filter((x) => !x.offOccasion).map((x) => card(x.product, { slot: x.slot, reasons: x.reasons, offOccasion: false }));
      const off = r.items.filter((x) => x.offOccasion).map((x) => card(x.product, { slot: x.slot, reasons: x.reasons, offOccasion: true }));
      const occLabel = r.conds.find((x) => x.key === 'occasion')?.label || '';
      const outfit = r.outfit && !none ? outfitView(r.outfit) : null;
      const outfitNote = outfit
        ? (r.criteria.maxPrice != null ? '예산은 상품 한 벌 기준이에요(코디 합계 아님).' : null)
        : r.outfitTried && !none && (r.criteria.occasionFromQuery || r.criteria.excludedItems.length)
          ? `검색 조건(${criteriaLine({ occasion: r.criteria.occasion, season: r.criteria.season, style: r.criteria.style, excludedItems: r.criteria.excludedItems })})을 지키는 코디 공식은 없어요. 조건을 풀지 않았어요.`
          : null;
      const result = {
        ...base,
        text: query, understood: true,
        title: none ? '맞는 상품이 없어요' : r.dropped.length ? `${r.conds.map((x) => x.label).join(' · ') || '조건 없이'} 조건으로 다시 골랐어요` : (r.query.summary || `‘${said}’ 결과`),
        conditions, dropped: r.dropped, notices,
        products: fit, offOccasion: off, offOccasionTitle: off.length ? `${occLabel}에는 덜 맞는 대안 ${off.length}개` : '',
        total: r.items.length,
        outfit, outfitNote,
        listNote: r.query.priceSort ? `수집일 가격이 ${r.query.priceSort === 'desc' ? '높은' : '낮은'} 순서예요` : `${SEASON_LABEL[r.season]} 기준 · 평점과 후기 수를 함께 봤어요`,
        criteria: r.criteria, gender: r.gender, season: r.season, seasonLabel: SEASON_LABEL[r.season],
        examples: api.examples(r.gender),
      };
      lastAsk = { ids: new Set(r.items.map((x) => x.product.id)), criteria: r.criteria };
      if (!drop.length && said !== S.recent[0]) {
        const before = S.recent;
        S.recent = [said, ...S.recent.filter((x) => x !== said)].slice(0, 5);
        if (!legacyPending) try { save(); } catch { S.recent = before; } // 검색 결과는 반환하되 저장되지 않은 이력은 남기지 않는다.
      }
      return result;
    },

    // 상품 자세히: 이유, 같은 조건의 다른 선택, 이 상품으로 만든 코디, 판정.
    product(id, { criteria = 'auto' } = {}) {
      const p = PRODUCT_BY_ID[id];
      if (!p) return null;
      const slot = SLOT_BY_ID[p.slot];
      const st = engineState();
      const cr = criteria === 'auto' ? (lastAsk?.ids.has(id) ? lastAsk.criteria : null) : criteria;
      const g = slot.g;
      const styles = st.styles.filter((k) => STYLES[k]?.g.includes(g));
      const closet = st.closet.filter((i) => i.gender === g);
      const c = { gender: g, styles: styles.length ? styles : ['classic'], occasion: st.occasion, season: seasonOf(new Date(st.now)), closet, ownedSlots: new Set(closet.map((i) => i.slot)) };
      const { reasons } = scoreSlot(slot, c);
      const allowed = (text) => !(cr?.excludedItems || []).some((kind) => text.includes(kind));
      const fixed = productReasons(p, slot, [slot.why, ...reasons]);
      const why = [...new Set([...(fixed.traitLine ? [fixed.traitLine] : []), ...fixed.reasons])].filter(allowed).slice(0, 4);
      const sameKind = productsFor(slot.id).filter((x) => x.id !== p.id);
      const alts = sameKind.filter((x) => meetsCriteria(x, cr));
      const outside = sameKind.length - alts.length;
      const look = recommendLooks(
        { ...st, closet: st.closet.filter((item) => !(cr?.excludeColors || []).includes(item.color)), gender: g,
          styles: cr?.style ? [cr.style] : c.styles, season: cr?.season || undefined,
          budget: cr ? cr.maxPrice : null, minPrice: cr?.minPrice ?? null,
          minPriceExclusive: !!cr?.minPriceExclusive, maxPriceExclusive: !!cr?.maxPriceExclusive,
          hidden: [...(st.hidden || []), ...(cr?.excludeColors?.length ? SAFE_PRODUCTS.filter((x) => cr.excludeColors.includes(x.color)).map((x) => x.id) : [])] },
        { limit: 1, occasion: cr?.occasion || null, strictOccasion: !!cr?.occasionFromQuery, excludeSlot: cr?.excludeSlot || null, pinnedProduct: p },
      )[0] || null;
      const kept = cr ? criteriaLine({ ...cr, color: null, tone: null, brand: null }) : '';
      return {
        ...card(p, { slot }),
        why, tip: allowed(slot.tip) ? `이렇게 입어요: ${slot.tip}` : null,
        popularity: p.rating ? `평점 ${p.rating} · 후기 ${Number(p.reviews || 0).toLocaleString('ko-KR')}개 (인기 정보예요. 색·사이즈·핏을 보장하지 않아요.)` : null,
        colorNote: p.colorSource === 'image' ? '색은 상품 사진에서 추정했어요' : '색은 상품명·편집 분류 기준이에요',
        alternatives: alts.slice(0, 8).map((x) => card(x, { slot })),
        alternativesNote: cr && outside ? `검색 조건(${criteriaLine(productCriteria(cr))})에 맞지 않는 같은 종류 ${outside}개는 뺐어요.` : null,
        outfit: outfitView(look, { focusId: p.id }),
        outfitNote: look ? (kept ? `검색 조건(${kept})을 코디의 다른 옷에도 그대로 적용했어요. 예산은 옷 한 벌마다 같은 기준이에요.` : null)
          : kept ? `검색 조건(${kept})을 지키면서 만들 수 있는 코디가 없어요. 조건을 풀지 않았어요.` : null,
        keptConditions: kept || null,
        verdict: api.judge(id),
      };
    },

    // 내 옷 기준 판정. 현재 앱의 구매 비교 화면과 같은 순서로 결론을 고른다.
    judge(id) {
      const st = engineState();
      if (cache.judge.has(id)) return cache.judge.get(id);
      const p = PRODUCT_BY_ID[id];
      if (!p) return null;
      const slot = SLOT_BY_ID[p.slot];
      const j = journeyFor(id);
      const mine = st.closet.filter((g) => g.gender === slot.g && ['user', 'legacy'].includes(g.source));
      const trialN = mine.filter((g) => isTrial(g.id)).length, ownN = mine.length - trialN;
      const basis = !mine.length ? 'none' : !ownN ? 'trial' : !trialN ? 'mine' : 'mixed';
      const basisLabel = basis === 'none' ? '옷장 없이 판단했어요' : basis === 'trial' ? `체험용 옷 ${trialN}벌 기준` : basis === 'mine' ? `내 옷 ${ownN}벌 기준` : `내 옷 ${ownN}벌 · 체험용 ${trialN}벌 기준`;
      const kindName = garmentKindName(slot.shape);
      let candidate;
      try { candidate = candidateFromProduct(p); } catch (error) {
        const v = { basis, basisLabel, tone: 'info', title: '이 상품은 비교에 쓸 수 없어요', lines: [error.message], lean: null, owned: [], looks: [], newLookCount: 0, existingLookCount: 0, companion: null, ask: null, addSuggestion: null, cautions: [], record: recordView(j), fine: FINE };
        cache.judge.set(id, v);
        return v;
      }
      const cautions = relatedReturnRecords(S.journeys, candidate, j?.id)
        .map((r) => `같은 브랜드의 ${kindName}${josa(kindName, '을', '를')} 반품한 적 있어요 · ${r.name}${r.returnReason ? ` (${RETURN_LABEL[r.returnReason]})` : ''}`);
      if (j?.stage === 'returned') cautions.unshift(`이 상품을 반품했다고 기록했어요${j.feedback?.returnReason ? ` (${RETURN_LABEL[j.feedback.returnReason]})` : ''}`);
      const addSuggestion = { kind: slot.shape, kindName, slot: slot.id, slotName: slot.name, gender: slot.g, color: p.colorSource === 'image' ? null : p.color };
      if (basis === 'none') {
        const v = {
          basis, basisLabel, tone: 'none', title: '옷장 없이 고른 후보예요',
          lines: ['요청한 조건에는 맞아요. 가진 옷과 겹치는지는 아직 몰라요.', `가진 ${kindName}${josa(kindName, '을', '를')} 한 벌만 넣어도 겹치는지 바로 알려 드려요.`],
          lean: null, owned: [], looks: [], newLookCount: 0, existingLookCount: 0, companion: null, ask: null, addSuggestion, cautions, record: recordView(j), fine: FINE,
        };
        cache.judge.set(id, v);
        return v;
      }
      const self = j && ['received', 'kept'].includes(j.stage) && j.garmentId;
      const others = self ? { ...st, garments: st.garments.filter((g) => g.id !== j.garmentId), closet: st.closet.filter((g) => g.id !== j.garmentId) } : st;
      const absence = S.absences[id] || 'unknown';
      const cmp = compareCandidate(others, candidate, { absence, intent: 'add' });
      const ownershipCheck = cmp.missingChecks.find((x) => x.code === 'ownership-unknown');
      const needsOwnership = !cmp.sameTypeOwned.length && !cmp.sameProduct.length;
      const similarHeld = cmp.decision.kind !== 'skip' ? uniq([...cmp.similarOwned, ...(cmp.kindMatch?.sameColor || [])]) : [];
      const pair = cmp.newFormulaCount || cmp.decision.kind === 'skip' || similarHeld.length ? null : purchasePlanContext(others, candidate, { intent: 'add' });
      const firstLook = cmp.looks.find((l) => l.new) || cmp.looks[0];
      const otherKind = cmp.kindMatch?.otherColor || [], unsureKind = cmp.kindMatch?.unknownColor || [];
      const roughOnly = !cmp.newFormulaCount && cmp.decision.kind === 'hold' && cmp.actualGarmentIds.length;
      const title = j?.stage === 'kept' ? '계속 입는 내 옷이에요'
        : j?.stage === 'received' ? '받은 옷이에요 · 계속 입을지 정해 주세요'
        : cmp.decision.kind === 'skip' ? '같은 상품이 이미 있어요'
        : similarHeld.length ? '비슷한 옷이 이미 있어요'
        : firstLook && cmp.newFormulaCount ? `${firstLook.look.title} 코디가 새로 연결돼요`
        : pair ? '이 옷 하나로는 새 코디가 생기지 않아요'
        : cmp.decision.kind === 'consider' ? '가진 옷과 활용해볼 수 있어요'
        : roughOnly && unsureKind.length ? `${kindName}${josa(kindName, '은', '는')} 이미 ${otherKind.length + unsureKind.length}벌 있어요 · 색은 확인이 필요해요`
        : roughOnly && otherKind.length ? `${kindName}${josa(kindName, '은', '는')} 이미 ${otherKind.length}벌 있어요 · 색은 달라요`
        : roughOnly ? `등록한 옷 중 ${kindName}${josa(kindName, '은', '는')} 아직 없어요`
        : '결정 전에 조금 더 확인해요';
      const tone = j?.stage === 'kept' ? 'own' : j?.stage === 'received' ? 'info'
        : cmp.decision.kind === 'skip' || similarHeld.length ? 'stop'
        : cmp.newFormulaCount ? 'go' : pair ? 'pair' : cmp.decision.kind === 'consider' ? 'think' : roughOnly ? 'info' : 'think';
      const lean = cmp.decision.kind === 'skip' || similarHeld.length ? 'hold' : cmp.newFormulaCount ? 'buy' : null;
      // 직접 붙인 이름(예: '흰 옥스퍼드 셔츠')에는 이미 색이 들어 있으니 색을 다시 붙이지 않는다.
      const name = (g) => (g.label ? g.label : `${colorLabel(g.color)} ${garmentLabel(g)}`.trim());
      const lines = [];
      if (similarHeld.length) lines.push(`${similarHeld.slice(0, 3).map(name).join(', ')}${similarHeld.length > 3 ? ` 외 ${similarHeld.length - 3}벌` : ''} · 같은 종류·색이에요. 새로 더할 이유가 있는지 먼저 확인해 주세요.`);
      if (roughOnly && !similarHeld.length && !pair) lines.push('종류·색으로 먼저 비교했어요. 내 옷의 세부 종류·색을 채우면 어떤 코디가 생기는지도 알려 드려요.');
      if (pair) lines.push(`${pair.companionSlot.name}${josa(pair.companionSlot.name, '을', '를')} 함께 더해야 ${pair.pair.look.title} 조합이 돼요.`);
      if (firstLook && cmp.newFormulaCount) lines.push(`등록한 옷 기준으로 새 코디 공식 ${cmp.newFormulaCount}개. 실제 핏·사이즈는 따로 확인이 필요해요.`);
      if (ownershipCheck) lines.push(`${firstLook ? '어울리는 조합은 찾았어요. ' : ''}구매가 필요한지는 가진 옷을 한 번 더 확인해요.`);
      const reasons = [...new Set(pair || similarHeld.length ? cmp.missingChecks.map((x) => x.message) : cmp.decision.reasons)]
        .filter((x) => x !== ownershipCheck?.message && !lines.includes(x));
      const rel = new Map();
      const put = (rows, relation, label) => rows.forEach((g) => { if (!rel.has(g.id)) rel.set(g.id, { g, relation, label }); });
      put(cmp.exactOwned, 'same-product', '같은 상품·색');
      put(cmp.sameProduct, 'same-product', '같은 상품 · 옵션 확인 필요');
      put(cmp.similarOwned, 'same-color', '같은 세부 종류·색');
      put(cmp.kindMatch?.sameColor || [], 'same-color', '같은 종류·색');
      put(otherKind, 'other-color', '같은 종류 · 색 다름');
      put(unsureKind, 'unknown-color', '같은 종류 · 색 확인 필요');
      const looks = [...cmp.looks].sort((a, b) => Number(b.new) - Number(a.new)).slice(0, 3)
        .map((l) => ({ ...outfitView({ ...l, items: l.items }, { candidateId: id, focusId: id }), new: !!l.new }));
      const v = {
        basis, basisLabel, tone, title, lean, lines, reasons,
        owned: [...rel.values()].map(({ g, relation, label }) => ({ ...garmentView(g), relation, relationLabel: label })),
        looks, newLookCount: cmp.newFormulaCount, existingLookCount: cmp.existingFormulaCount,
        companion: pair ? { ...card(pair.companion.product), pairTitle: pair.pair.look.title, slotName: pair.companionSlot.name } : null,
        ask: needsOwnership && (!j || j.stage === 'candidate') ? {
          question: `${slot.name}${josa(slot.name, '이', '가')} 이미 있나요?`, value: absence,
          choices: [{ id: 'absent', label: '없어요' }, { id: 'present', label: '있어요' }, { id: 'unknown', label: '아직 몰라요' }],
          hint: absence === 'present' ? '가진 옷을 넣으면 겹치는지 정확히 비교해요.' : null,
        } : null,
        addSuggestion, cautions, record: recordView(j), fine: FINE,
      };
      cache.judge.set(id, v);
      return v;
    },
    setOwnership(productId, value) {
      if (!['absent', 'present', 'unknown'].includes(value)) throw new Error('있는지 여부를 골라 주세요.');
      commit(() => { S.absences = { ...S.absences, [productId]: value }; });
    },

    // 결정과 그 뒤의 기록(주문 → 받음 → 계속 입음 또는 반품).
    decide(productId, decision) {
      if (!['buy', 'hold', 'skip'].includes(decision)) throw new Error('결정을 골라 주세요.');
      const p = PRODUCT_BY_ID[productId];
      if (!p) throw new Error('상품을 다시 확인해 주세요.');
      const candidate = candidateFromProduct(p);
      commit(() => {
        let j = journeyFor(productId);
        if (!j) { j = createPurchaseJourney(candidate, { id: nextId('j'), at: iso() }); S.journeys = [...S.journeys, j]; }
        replaceJourney(transitionPurchaseJourney(j, decision, { at: iso() }));
      });
      return recordView(journeyFor(productId));
    },
    advance(productId, step, { reason = null } = {}) {
      const p = PRODUCT_BY_ID[productId];
      if (!p) throw new Error('상품을 다시 확인해 주세요.');
      const slot = SLOT_BY_ID[p.slot];
      commit(() => {
        let j = journeyFor(productId);
        if (!j) { j = createPurchaseJourney(candidateFromProduct(p), { id: nextId('j'), at: iso() }); S.journeys = [...S.journeys, j]; }
        if (step === 'received') {
          const garment = makeGarment({ id: nextId('g'), slot: slot.id, kind: slot.shape, gender: slot.g, color: p.colorSource === 'image' ? null : p.color, brand: p.brand, productId: p.id, label: p.name.slice(0, 80), source: 'user', createdAt: iso() });
          S.garments = [...S.garments, garment];
          replaceJourney(transitionPurchaseJourney(j, 'received', { at: iso(), changes: { garmentId: garment.id } }));
        } else if (step === 'returned') {
          if (!JOURNEY_RETURN_REASONS.includes(reason)) throw new Error('반품 사유를 골라 주세요.');
          replaceJourney(transitionPurchaseJourney(j, 'returned', { at: iso(), changes: { feedback: { fit: null, returnReason: reason } } }));
        } else if (['ordered', 'kept', 'worn'].includes(step)) {
          replaceJourney(transitionPurchaseJourney(j, step, { at: iso() }));
        } else throw new Error('지원하지 않는 기록이에요.');
      });
      return recordView(journeyFor(productId));
    },
    removeRecord(productId) {
      const j = journeyFor(productId);
      if (!j) return;
      if (j.stage !== 'candidate') throw new Error('주문 뒤의 기록은 지우지 않아요. 반품으로 정리해 주세요.');
      commit(() => { S.journeys = S.journeys.filter((x) => x.id !== j.id); const { [productId]: _, ...rest } = S.absences; S.absences = rest; });
    },
    records() { return api.getState().records; },

    // 옷장 기준 다음 한 벌(요청 없이). 옷장이 없으면 이번 계절 기본템이라고 밝힌다.
    suggest({ limit = 3 } = {}) {
      const st = engineState();
      const mine = st.closet.filter((g) => g.gender === S.gender && ['user', 'legacy'].includes(g.source));
      const rows = recommendItems(st, { limit });
      return {
        basis: mine.length ? 'closet' : 'none',
        title: mine.length ? '옷장 기준 다음 한 벌' : `옷장 없이 고른 ${SEASON_LABEL[seasonOf(new Date(st.now))]} 기본템`,
        items: rows.map((r) => ({ ...card(r.product, { slot: r.slot, reasons: r.reasons }), why: r.reasons[0] })),
      };
    },

    // 검색 제안(규칙 기반): 최근 요청 → 입력과 이어지는 예시 → 옷 종류. 누르면 바로 그 요청으로 찾는다.
    searchSuggestions(text = '', { limit = 6 } = {}) {
      const t = String(text).replace(/\s+/g, ' ').trim();
      const has = (x) => !t || x.includes(t) || t.split(' ').every((w) => x.includes(w));
      const rows = [
        ...S.recent.filter(has).map((q) => ({ q, kind: 'recent', label: '최근' })),
        ...api.examples().filter(has).map((q) => ({ q, kind: 'example', label: '예시' })),
        ...(t ? api.kindChoices().filter((k) => k.name.includes(t) || t.includes(k.name)).map((k) => ({ q: k.name, kind: 'kind', label: '종류' })) : []),
      ];
      const seen = new Set();
      return rows.filter((r) => !seen.has(r.q) && seen.add(r.q)).slice(0, limit);
    },
    clearRecent() { commit(() => { S.recent = []; }); },

    // 가진 옷을 상품으로 찾기(오늘의집처럼 브랜드·품명으로). 띄어 쓴 낱말이 모두 브랜드나 품명에 들어 있는 상품만 준다.
    // 사기 전 추천 검색(ask)과 달리 조건·계절·성별로 거르지 않는다. 남녀 모두에서 찾고, 지금 성별 상품을 앞에 둔다.
    findProducts(text, { limit = 20 } = {}) {
      const words = String(text ?? '').toLowerCase().replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
      if (!words.length) return [];
      const hits = SAFE_PRODUCTS.filter((p) => SLOT_BY_ID[p.slot] && words.every((w) => `${p.brand} ${p.name}`.toLowerCase().includes(w)));
      const mine = (p) => (SLOT_BY_ID[p.slot].g === S.gender ? 0 : 1);
      return hits.sort((a, b) => mine(a) - mine(b)).slice(0, limit).map((p) => card(p));
    },
    // 찾은 상품을 '가진 옷'으로 넣는다. 산 기록(advance 'received')과 같은 모양이라 옷장에 판매처 사진·브랜드·품명이 남는다.
    // 색이 사진에서 추정된 상품은 색을 비워 둔다(화면에서 물어 채운다). 같은 상품을 두 번 넣지 않는다.
    addOwnedProduct(productId, { trial = false } = {}) {
      const p = PRODUCT_BY_ID[productId];
      const slot = p && SLOT_BY_ID[p.slot];
      if (!slot) throw new Error('상품을 다시 확인해 주세요.');
      const dup = S.garments.find((g) => g.productId === p.id);
      if (dup) return garmentView(dup);
      let garment;
      commit(() => {
        garment = makeGarment({ id: nextId('g'), slot: slot.id, kind: slot.shape, gender: slot.g, color: p.colorSource === 'image' ? null : p.color, brand: p.brand, productId: p.id, label: p.name.slice(0, 80), source: 'user', createdAt: iso() });
        S.garments = [...S.garments, garment];
        if (trial) S.trialIds = [...S.trialIds, garment.id];
      });
      return garmentView(garment);
    },

    // 가진 옷만으로 입을 수 있는 조합 수(코디 공식 + 종류·색 기본 조합). 옷장을 채우는 재미의 보상 숫자.
    // 구매 추천이 아니다. 체험용 옷도 포함하므로 화면에서 '체험용 포함'을 밝힌다.
    // detail: true면 조합 목록(list)도 준다. key는 조합에 든 옷 id를 이은 값, baseKey는 겉옷을 뺀 값이다.
    // 기본 조합은 겉옷만 다른 조합을 하나로 묶으므로 '새로 생긴 조합'은 baseKey로 가린다.
    closetOutfits({ limit = 60, detail = false } = {}) {
      const st = engineState();
      const ready = closetLooks(st, { limit }).ready;
      const basics = basicOutfits(st, { limit });
      const out = { formulas: ready.length, basic: basics.length, total: ready.length + basics.length, note: '가진 옷으로 입을 수 있는 조합 수예요(종류·색 기준, 핏·소재는 따지지 않았어요).' };
      if (detail) {
        out.list = [...ready, ...basics].map((r) => {
          const v = outfitView(r);
          const ids = (pieces) => pieces.map((p) => p.garmentId).filter(Boolean).sort().join('|');
          return { ...v, formulaLook: !r.basic, key: ids(v.pieces), baseKey: ids(v.pieces.filter((p) => p.role !== 'outer')) };
        });
      }
      return out;
    },

    // 오늘 날씨에 맞춘 내 옷 코디(R17). 날씨는 화면이 준다({min, max, rain}: 아침 최저·낮 최고 기온 °C, 비 여부).
    // 기온 구간별 옷 종류 규칙으로 가진 옷 조합에 점수를 매긴다. 소재·두께는 데이터에 없어 따지지 않는다.
    // 맞는 겉옷이 옷장에 없으면 missing으로 찾을 말(query)을 준다. 자동으로 사 오라고 하지 않는다.
    weatherOutfits(weather = {}, { limit = 3 } = {}) {
      const min = Number(weather.min);
      const max = Number(weather.max);
      if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) return { ok: false, message: '날씨 정보가 없어요.' };
      const rain = !!weather.rain;
      const gap = max - min;
      const band = weatherBand(min);
      const list = this.closetOutfits({ limit: 120, detail: true }).list || [];
      // 겉옷이 없어도 되는 날은 겉옷을 뺀 차림도 후보로 둔다(가진 조합에는 늘 겉옷이 끼어 있다).
      const variants = band.outerMin === 0
        ? list.flatMap((o) => (o.pieces.some((p) => p.role === 'outer') ? [o, { ...o, pieces: o.pieces.filter((p) => p.role !== 'outer'), key: o.baseKey, withoutOuter: true }] : [o]))
        : list;
      const scored = variants.map((o) => {
        const kinds = Object.fromEntries(o.pieces.filter((p) => p.slot).map((p) => [p.role, SLOT_BY_ID[p.slot]?.shape]));
        const reasons = [];
        let score = 0;
        const outer = kinds.outer || null;
        const ow = OUTER_WARMTH[outer] ?? 0;
        if (ow < band.outerMin) { score -= 3 * (band.outerMin - ow); }
        else if (ow > band.outerMax) { score -= 2 * (ow - band.outerMax); }
        else { score += 3; if (outer) reasons.push(`${garmentKindName(outer)}: 아침 ${min}°에 맞는 겉옷`); }
        const top = kinds.top || kinds.dress || null;
        const tw = TOP_WARMTH[top] ?? 1;
        if (max >= 25 && tw >= 2) score -= 3;
        else if (max >= 25 && tw === 0) { score += 2; reasons.push(`${garmentKindName(top)}: 낮 ${max}°라 가볍게`); }
        else if (max < 15 && tw === 2) { score += 2; reasons.push(`${garmentKindName(top)}: 낮에도 ${max}°라 따뜻하게`); }
        else if (max < 15 && tw === 0 && ow < 2) score -= 2;
        if (gap >= 10 && outer && ow >= 1 && ow <= 2) { score += 1; reasons.push('일교차가 커서 낮엔 겉옷을 벗어도 돼요'); }
        if (rain && kinds.shoes === 'boot') { score += 1; reasons.push('비 오는 날 부츠'); }
        return { ...o, score, fit: score >= 3 ? 'good' : score >= 0 ? 'ok' : 'poor', reasons };
      }).sort((a, b) => b.score - a.score);
      // 겉옷만 다른 조합이 줄줄이 나오지 않게 겉옷 뺀 조합(baseKey)마다 가장 맞는 것 하나만 남긴다.
      const seen = new Set();
      let outfits = scored.filter((o) => o.fit !== 'poor' && !seen.has(o.baseKey) && seen.add(o.baseKey)).slice(0, limit);
      // 맞는 조합이 없으면 가진 옷 중 가장 가까운 것을 '부족' 표시와 함께 보여 준다(빈 화면 대신).
      const short = !outfits.length;
      if (short) outfits = scored.filter((o) => !seen.has(o.baseKey) && seen.add(o.baseKey)).slice(0, Math.min(limit, 2));
      const owned = new Set(S.garments.map((g) => SLOT_BY_ID[g.slot]?.shape || g.kind));
      const hasOuter = Object.entries(OUTER_WARMTH).some(([k, w]) => owned.has(k) && w >= band.outerMin && w <= band.outerMax);
      const missing = band.outerMin > 0 && !hasOuter ? { role: 'outer', label: band.need, query: band.query } : null;
      const notes = [];
      if (rain) notes.push('비 소식이 있어요. 우산을 챙기세요.');
      if (gap >= 10) notes.push(`일교차가 ${gap}°예요. 벗기 쉬운 겉옷이 좋아요.`);
      return {
        ok: true, weather: { min, max, rain, gap }, band: { label: band.label, advice: band.advice },
        outfits, short, missing, notes, count: list.length,
        note: '기온과 옷 종류로만 골랐어요(소재·두께는 몰라요).',
      };
    },

    // 순위와 순위별 이유: 같은 결과 안에서 이 상품이 다른 상품과 무엇이 다른지를 규칙으로 계산한다(대화형 AI가 아니다).
    // 순서는 엔진이 정한 그대로다(종류가 요청·옷장에 맞는 정도 + 평점·후기 + 같은 종류 안 순서). 지어낸 말은 넣지 않는다.
    rankReasons(result, { limit = 24 } = {}) {
      const list = (result?.products || []).slice(0, limit);
      if (!list.length) return { basis: '', items: [] };
      const prices = list.map((p) => p.price);
      const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
      const minPrice = Math.min(...prices);
      const maxReviews = Math.max(...list.map((p) => p.reviews || 0));
      const rated = list.filter((p) => (p.reviews || 0) >= 100 && p.rating);
      const maxRating = rated.length ? Math.max(...rated.map((p) => p.rating)) : null;
      const n = (v) => Number(v).toLocaleString('ko-KR');
      const items = list.map((p, i) => {
        const v = api.judge(p.id);
        const same = (v?.owned || []).filter((o) => ['same-product', 'same-color'].includes(o.relation)).length;
        const facts = [];
        if (v?.basis !== 'none' && v?.newLookCount) facts.push({ kind: 'closet', good: true, text: `가진 옷과 새 조합 ${v.newLookCount}개가 생겨요` });
        if (same) facts.push({ kind: 'closet', good: false, text: `옷장에 비슷한 옷이 ${same}벌 있어요` });
        if (list.length > 1 && (p.reviews || 0) === maxReviews && maxReviews >= 100) facts.push({ kind: 'reviews', good: true, text: `이 중 후기가 가장 많아요 (${n(p.reviews)}개)` });
        else if ((p.reviews || 0) >= 1000) facts.push({ kind: 'reviews', good: true, text: `후기 ${n(p.reviews)}개` });
        if (maxRating && rated.length > 1 && p.rating === maxRating && (p.reviews || 0) >= 100) facts.push({ kind: 'rating', good: true, text: `후기 100개 이상 중 평점이 가장 높아요 (${p.rating})` });
        if (list.length > 1 && p.price === minPrice) facts.push({ kind: 'price', good: true, text: '이 중 가장 저렴해요' });
        else if (p.price < avg * 0.85) facts.push({ kind: 'price', good: true, text: `평균보다 ${Math.round((1 - p.price / avg) * 100)}% 저렴해요` });
        if (p.traitLine) facts.push({ kind: 'trait', good: true, text: p.traitLine });
        const kindWhy = (p.reasons || []).find((r) => !/맞춰 골랐어요$/.test(r));
        if (kindWhy) facts.push({ kind: 'why', good: true, text: kindWhy });
        const head = facts.find((f) => f.kind === 'closet') || facts.find((f) => f.kind === 'reviews' && f.text.startsWith('이 중'))
          || facts.find((f) => f.kind === 'rating') || facts.find((f) => f.kind === 'price') || facts[0] || { text: p.reason };
        return { id: p.id, rank: i + 1, headline: head.text, caution: head.good === false, facts: facts.slice(0, 4), matched: (p.reasons || [])[0] || '' };
      });
      return { basis: '순위는 요청한 조건과 내 옷장에 맞는 정도, 평점·후기, 가격을 정해 둔 규칙으로 계산했어요. 평점·후기는 판매처 정보예요.', items };
    },

    // 빈 결과·좁은 결과의 다음 선택: 조건을 하나씩 뺐을 때의 결과 수와 사진 미리보기.
    // 자동으로 적용하지 않는다(대표 원칙: 조건 보존. 대안이 하나뿐이어도 사용자가 고른다).
    relax(result, { limit = 3, preview = 3 } = {}) {
      if (!result?.understood) return [];
      const out = [];
      for (const c of result.conditions.filter((x) => x.removable)) {
        const r = api.ask(result.text, { drop: [...(result.dropped || []), c.key] });
        if (r.total) out.push({ key: c.key, label: c.label, drop: [...(result.dropped || []), c.key], total: r.total, title: `‘${c.label}’ 빼고 ${r.total}개`, preview: r.products.slice(0, preview) });
      }
      // relax가 마지막 검색 맥락을 바꾸지 않게 원래 결과의 맥락으로 되돌린다.
      lastAsk = { ids: new Set([...result.products, ...result.offOccasion].map((p) => p.id)), criteria: result.criteria };
      return out.sort((a, b) => b.total - a.total).slice(0, limit);
    },

    // 후보 비교함(최대 4개). 브라우저에 저장되어 화면을 오가도(뒤로가기 포함) 유지된다. 자동으로 담지 않는다.
    compareList: () => [...S.compare],
    compareHas: (id) => S.compare.includes(id),
    compareAdd(id) {
      if (!PRODUCT_BY_ID[id]) throw new Error('상품을 다시 확인해 주세요.');
      if (S.compare.includes(id)) return [...S.compare];
      if (S.compare.length >= 4) throw new Error('비교함에는 4개까지 담을 수 있어요. 하나를 빼고 담아 주세요.');
      commit(() => { S.compare = [...S.compare, id]; });
      return [...S.compare];
    },
    compareRemove(id) { commit(() => { S.compare = S.compare.filter((x) => x !== id); }); return [...S.compare]; },
    compareClear() { commit(() => { S.compare = []; }); },
    // 비교 표에 쓸 같은 축의 값. 판정은 judge()와 같고, 값이 모두 같은 줄은 same: true.
    compareRows(ids = S.compare) {
      const items = ids.map((id) => PRODUCT_BY_ID[id]).filter(Boolean).map((p) => ({ card: card(p), verdict: api.judge(p.id) }));
      const low = Math.min(...items.map((x) => x.card.price));
      const row = (key, label, value) => { const values = items.map(value); return { key, label, values, same: values.every((v) => v === values[0]) }; };
      return {
        items: items.map((x) => x.card),
        // 옷은 외형으로 고르는 상품이라 스펙 표보다 '내 옷과 겹치는지'가 중심이다(NN/g·Baymard 조사). primary 5줄을 먼저, 나머지는 접어 둔다.
        rows: items.length ? [
          { ...row('verdict', '내 옷과', (x) => x.verdict.title), primary: true },
          { ...row('price', '수집가', (x) => `${x.card.priceText}${items.length > 1 && x.card.price > low ? ` (+${formatPrice(x.card.price - low)})` : ''}`), primary: true },
          { ...row('color', '색', (x) => x.card.colorLabel), primary: true },
          { ...row('looks', '새 코디', (x) => (x.verdict.basis === 'none' ? '옷장을 넣으면 알 수 있어요' : `${x.verdict.newLookCount}개`)), primary: true },
          { ...row('store', '판매처', (x) => x.card.store), primary: true },
          { ...row('owned', '옷장', (x) => x.card.owned.label || '옷장 없이'), primary: false },
          { ...row('kind', '종류', (x) => x.card.slotName), primary: false },
          { ...row('reason', '고른 이유', (x) => x.card.reason), primary: false },
          { ...row('popularity', '평점·후기', (x) => (x.card.rating ? `${x.card.rating} · ${Number(x.card.reviews || 0).toLocaleString('ko-KR')}개` : '정보 없음')), primary: false },
        ] : [],
        note: '수집가는 수집일 기준이에요. 차액은 가장 낮은 수집가와의 차이예요.',
      };
    },

    // 같은 상품의 새 상품/중고를 같은 자리에서(Patagonia Worn Wear처럼 한 맥락에서 보되, 중고 매물 자료는 없으니 지어내지 않는다).
    newVsUsed(id) {
      const p = PRODUCT_BY_ID[id];
      if (!p) return null;
      const used = api.usedSearch(id);
      return {
        fresh: { label: '새 상품', priceText: formatPrice(p.price), priceNote: card(p).priceShort, store: p.store, url: p.url, condition: '새 상품', photoNote: '판매처 대표 사진' },
        used: { label: '중고', priceText: null, priceNote: '매물마다 달라요', condition: '매물마다 달라요 · 상태 등급 없음', photoNote: '매물 사진은 각 사이트에서', note: used.note, groups: used.groups },
        diff: ['가격: 새 상품은 수집가가 있어요. 중고 가격은 이 앱이 확인하지 않았어요.', '상태: 중고는 매물마다 달라요. 판매자 설명과 사진을 확인해 주세요.', '사진: 위 사진은 판매처 대표 사진이에요. 중고 매물의 실제 사진이 아니에요.'],
      };
    },

    // 중고 매물: 앱 안 통합이 아니라 외부 사이트의 공개 검색 결과로 보내는 링크다.
    // 이 앱은 매물·가격·재고·판매 상태를 읽거나 저장하지 않는다(공식 연동 전).
    usedSearch(target) {
      const p = typeof target === 'string' ? PRODUCT_BY_ID[target] : target?.id ? PRODUCT_BY_ID[target.id] : null;
      const text = typeof target === 'object' && target?.text ? String(target.text).slice(0, 80) : null;
      if (!p && !text) return null;
      const slot = p ? SLOT_BY_ID[p.slot] : null;
      const clean = (name) => name.replace(/\[[^\]]*\]|\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
      const ko = p ? `${p.brand} ${clean(p.name)}`.slice(0, 60) : text;
      const EN = { shirt: 'shirt', tee: 't-shirt', longtee: 'long sleeve t-shirt', polo: 'polo shirt', knit: 'sweater', sweat: 'sweatshirt', cardigan: 'cardigan', vest: 'vest', blazer: 'blazer', jacket: 'jacket', coat: 'coat', down: 'down jacket', pants: 'pants', jeans: 'jeans', skirt: 'skirt', dress: 'dress', sneaker: 'sneakers', loafer: 'loafers', boot: 'boots', bag: 'bag', cap: 'cap', beanie: 'beanie', belt: 'belt' };
      const JA = { shirt: 'シャツ', tee: 'Tシャツ', longtee: 'ロンT', polo: 'ポロシャツ', knit: 'ニット', sweat: 'スウェット', cardigan: 'カーディガン', vest: 'ベスト', blazer: 'ブレザー', jacket: 'ジャケット', coat: 'コート', down: 'ダウン', pants: 'パンツ', jeans: 'デニム', skirt: 'スカート', dress: 'ワンピース', sneaker: 'スニーカー', loafer: 'ローファー', boot: 'ブーツ', bag: 'バッグ', cap: 'キャップ', beanie: 'ニット帽', belt: 'ベルト' };
      const CEN = { white: 'white', ivory: 'ivory', beige: 'beige', blue: 'light blue', grey: 'grey', olive: 'olive', brown: 'brown', indigo: 'indigo', charcoal: 'charcoal', navy: 'navy', black: 'black', green: 'green', red: 'burgundy', pink: 'pink', yellow: 'yellow', purple: 'purple', orange: 'orange' };
      const CJA = { white: '白', ivory: 'アイボリー', beige: 'ベージュ', blue: 'ライトブルー', grey: 'グレー', olive: 'オリーブ', brown: 'ブラウン', indigo: 'インディゴ', charcoal: 'チャコール', navy: 'ネイビー', black: '黒', green: 'グリーン', red: 'ボルドー', pink: 'ピンク', yellow: 'イエロー', purple: 'パープル', orange: 'オレンジ' };
      const latin = p && /[A-Za-z]{3,}/.test(p.name) ? clean(p.name).replace(/[^A-Za-z0-9 \-]/g, ' ').replace(/\s+/g, ' ').trim() : '';
      const en = p ? (latin || [CEN[p.color], EN[slot.shape]].filter(Boolean).join(' ')) : '';
      const ja = p ? [CJA[p.color], JA[slot.shape]].filter(Boolean).join(' ') : '';
      const e = encodeURIComponent;
      const domestic = [
        { id: 'bunjang', label: '번개장터', url: `https://m.bunjang.co.kr/search/products?q=${e(ko)}`, query: ko },
        { id: 'daangn', label: '당근', url: `https://www.daangn.com/kr/search/buy-sell/?q=${e(ko)}`, query: ko, note: '동네 기준 검색' },
        { id: 'joongna', label: '중고나라', url: `https://web.joongna.com/search/${e(ko)}`, query: ko },
        { id: 'fruits', label: '후루츠패밀리', url: `https://fruitsfamily.com/search/${e(ko)}`, query: ko, note: '패션 중고' },
      ];
      const abroad = p ? [
        { id: 'ebay', label: 'eBay', url: `https://www.ebay.com/sch/i.html?_nkw=${e(en)}&LH_ItemCondition=3000`, query: en, note: '영어로 비슷한 종류·색 검색' },
        { id: 'mercari-jp', label: '메루카리(일본)', url: `https://jp.mercari.com/search?keyword=${e(ja)}&status=on_sale`, query: ja, note: '일본어로 비슷한 종류·색 검색' },
        // 패션 중고 전문(2026-10-21 대표 요청). Grailed·Depop은 자동 확인에 403(봇 차단)이라 실제 브라우저에서 확인이 필요하다.
        { id: 'grailed', label: 'Grailed', url: `https://www.grailed.com/shop?query=${e(en)}`, query: en, note: '디자이너·스트리트 중고' },
        { id: 'vinted', label: 'Vinted', url: `https://www.vinted.com/catalog?search_text=${e(en)}`, query: en, note: '미국·유럽 중고' },
        { id: 'depop', label: 'Depop', url: `https://www.depop.com/search/?q=${e(en)}`, query: en, note: '빈티지·스트리트 중고' },
      ] : [];
      return {
        kind: 'search-links',
        note: '외부 사이트의 검색 결과로 이동해요. 이 앱은 매물·가격·재고·상태를 확인하지 않았어요.',
        exactNote: p ? `국내는 ‘${ko}’로 같은 상품을, 해외는 비슷한 종류·색을 찾아요.` : `‘${ko}’로 찾아요.`,
        abroadNote: '해외 매물은 배송대행·관세·반품 조건이 따로 있어요. 결제 전 판매처에서 확인해 주세요.',
        groups: [{ region: '국내 중고', links: domestic }, ...(abroad.length ? [{ region: '해외 중고', links: abroad }] : [])],
      };
    },

    // ── 사진. 상품은 판매처 사진, 종류·색만 아는 옷은 '비슷한 상품 사진'(표시 붙음), 그 밖에는 색 카드.
    // 사진을 못 불러오면 색 카드로 바뀐다. 크기는 감싸는 칸이 정한다(칸 높이가 없으면 4:5, CSS 변수 --eo-ratio로 바꿈).
    photo: (target) => photoOf(target),
    photoHtml: (target, opts) => photoHtml(target, opts),
    // 1판 호환: art()도 이제 사진을 돌려준다. size를 주면 그 크기의 칸으로 감싼다.
    art(target, { size = '100%', fit = 'cover', caption = true } = {}) {
      const html = photoHtml(target, { fit, caption });
      return size === '100%' ? html : `<span style="display:block;width:${escAttr(size)};height:${escAttr(size)}">${html}</span>`;
    },
    photos: {
      on: !!photos,
      count: PRODUCTS.filter((p) => p.img && PHOTO_HOST.test(p.img)).length,
      source: `${CATALOG.store} 상품 이미지 서버(image.msscdn.net) 주소를 그대로 불러옴 · 저장소에 사진 파일 없음`,
      rights: CATALOG.rights,
      note: NOTE.photos,
    },

    // ── 화면 주소. #/경로?키=값 형식이라 file://에서도 동작하고 브라우저 뒤로가기가 그대로 쓰인다.
    route: {
      current() {
        const raw = typeof location !== 'undefined' ? location.hash.replace(/^#/, '') : '';
        const [path, qs = ''] = raw.split('?');
        return { path: path || '/', params: Object.fromEntries(new URLSearchParams(qs)) };
      },
      href(path, params = {}) {
        const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== '')).toString();
        return `#${path}${qs ? `?${qs}` : ''}`;
      },
      go(path, params = {}, { replace = false } = {}) {
        const next = api.route.href(path, params);
        if (typeof location === 'undefined') return;
        if (location.hash === next) { window.dispatchEvent(new HashChangeEvent('hashchange')); return; }
        if (replace) { history.replaceState(history.state, '', next); window.dispatchEvent(new HashChangeEvent('hashchange')); }
        else location.hash = next;
      },
      // fn(현재 화면)을 주소가 바뀔 때마다 부른다. 처음 한 번도 부른다.
      // restoreScroll: 떠나는 화면의 스크롤 위치를 기억했다가, 뒤로가기 등으로 같은 주소에 오면 그 위치로 돌려 놓는다.
      on(fn, { restoreScroll = true, immediate = true } = {}) {
        if (restoreScroll && 'scrollRestoration' in history) history.scrollRestoration = 'manual';
        let last = location.hash;
        const run = () => {
          if (restoreScroll) scrollMemo.set(last, window.scrollY);
          last = location.hash;
          fn(api.route.current());
          if (restoreScroll) {
            const y = scrollMemo.get(location.hash) ?? 0;
            requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, y)));
          }
        };
        window.addEventListener('hashchange', run);
        if (immediate) fn(api.route.current());
        return () => window.removeEventListener('hashchange', run);
      },
      // 스크롤 칸이 window가 아닌 화면(PC 여러 칸)은 직접 기억·복원한다.
      remember: (key, y) => scrollMemo.set(key, y),
      recall: (key) => scrollMemo.get(key) ?? 0,
    },

    // ── 고지는 한 곳에. 화면에는 짧은 문구(note.short)만 쓰고, 시안 표시(data-flow="mock-label")를 누르면 이 내용을 연다.
    disclosure() {
      return {
        title: '이 시안에 대해',
        sections: [
          { h: '누가 만들었나', lines: [NOTE.ai, '목표와 품질 기준은 ‘세계 최고 수준의 UX/UI’예요. 이 시안이 그 수준에 이르렀다고 검증된 것은 아니에요.'] },
          { h: '상품 자료와 사진', lines: [NOTE.catalog, NOTE.photos, NOTE.similar, NOTE.price] },
          { h: '판단과 기록', lines: [NOTE.rules, FINE, NOTE.records, '중고 링크는 외부 사이트의 검색 결과로 이동할 뿐이에요. 매물·가격·재고는 확인하지 않았어요.'] },
          { h: '저장', lines: ['기록은 이 브라우저에만 저장돼요. 실제 앱의 저장 자료와 섞이지 않아요.'] },
        ],
      };
    },
    openDisclosure() {
      if (typeof document === 'undefined') return;
      let d = document.getElementById('eo-disclosure');
      if (!d) {
        const info = api.disclosure();
        d = document.createElement('dialog');
        d.id = 'eo-disclosure';
        d.setAttribute('aria-labelledby', 'eo-disclosure-title');
        d.style.cssText = 'max-width:520px;width:calc(100% - 32px);max-height:80vh;border:0;border-radius:16px;padding:0;color:#1a1a1a;background:#fff;box-shadow:0 12px 40px rgba(0,0,0,.25);font:15px/1.6 system-ui,-apple-system,sans-serif';
        d.innerHTML = `<div style="padding:20px 20px 8px"><h2 id="eo-disclosure-title" style="margin:0 0 8px;font-size:18px">${info.title}</h2>${info.sections.map((x) => `<h3 style="margin:16px 0 4px;font-size:14px;color:#555">${x.h}</h3>${x.lines.map((l) => `<p style="margin:0 0 6px">${escAttr(l)}</p>`).join('')}`).join('')}</div><form method="dialog" style="position:sticky;bottom:0;padding:12px 20px 20px;background:#fff"><button style="width:100%;min-height:48px;border:0;border-radius:10px;background:#111;color:#fff;font:600 15px system-ui,sans-serif">닫기</button></form>`;
        document.body.appendChild(d);
      }
      if (typeof d.showModal === 'function') d.showModal(); else d.setAttribute('open', '');
    },
  };

  if (reset) { S = blank(); save(); } else S = load();
  if (typeof window !== 'undefined' && window.addEventListener)
    window.addEventListener('storage', (event) => {
      if (event.key !== key) return;
      S = load();
      version++;
      lastAsk = null;
      notify();
    });
  return api;
}
