// Local, explicit metadata comparison. A pasted link does not fetch or recognize a garment.
import { PRODUCTS } from './data/products.js';
import { SLOT_BY_ID, STYLES, COLORS } from './data/slots.js';
import { fillLook, matchingLooks, seasonOf } from './engine.js';
import { garmentSlotStatus, garmentLabel } from './wardrobe.js';
import { productExclusionReason, productClassificationConflict } from './catalog-policy.js';
import { isPublicPurchaseUrl, inactivePurchaseGarmentIds } from './purchase-journey.js';

const CANDIDATE_ABSENCE = new Set(['unknown', 'absent', 'present']);
const CANDIDATE_INTENTS = new Set(['add', 'replace']);
const CANDIDATE_COLOR_SOURCES = new Set(['user', 'name', 'curation', 'image']);

// 쇼핑 앱의 '공유' 글은 "상품명 + 링크" 모양이다. 글 속 첫 http(s) 링크만 꺼내고, 나머지 글은
// 상품 정보로 쓰지 않는다(이름·색을 글에서 짐작해 확정하지 않는다). 주소로 시작하는 글은
// 주소 전체로 본다: 중간에 줄바꿈·공백이 낀 주소를 잘라 다른 주소로 만들지 않기 위해서다.
export function extractPurchaseLink(raw) {
  const text = String(raw ?? '').trim();
  if (!/\s/.test(text) || /^https?:\/\//i.test(text)) return text;
  const found = text.match(/https?:\/\/[^\s<>"'`]+/i);
  return found ? found[0].replace(/[)\]}>.,!?…。、」』"'”’]+$/u, '') : text;
}

export function parseCandidateLink(raw, { catalog = PRODUCTS } = {}) {
  const invalid = (error) => ({ ok: false, kind: null, originalUrl: null, canonicalUrl: null, productId: null, product: null, error });
  if (typeof raw !== 'string' || raw.length > 4096) return invalid('상품 링크를 확인해 주세요.');
  const link = extractPurchaseLink(raw);
  if (link.length > 2048 || /[\u0000-\u001f\u007f\\]/.test(link)) return invalid('상품 링크를 확인해 주세요.');
  let url;
  try { url = new URL(link); } catch { return invalid('https 상품 링크를 붙여 넣어 주세요.'); }
  if (!isPublicPurchaseUrl(url.href))
    return invalid('공개 판매처의 https 링크를 사용해 주세요.');
  if (url.port && url.port !== '443') return invalid('판매처의 기본 https 링크를 사용해 주세요.');
  const knownStore = /^(?:www\.|m\.)?musinsa\.com$/.test(url.hostname);
  const path = knownStore && url.pathname.match(/^\/(?:products|app\/goods)\/(\d{1,16})\/?$/);
  if (path && !/^0+$/.test(path[1])) {
    const number = path[1].replace(/^0+(?=\d)/, '');
    const productId = `ms-${number}`;
    const canonicalUrl = `https://www.musinsa.com/products/${number}`;
    const product = catalog.find((p) => p.id === productId) || null;
    return { ok: true, kind: product ? 'catalog' : 'external', originalUrl: url.href, canonicalUrl, productId, product, error: null };
  }
  const originalUrl = url.href;
  url.hash = '';
  return { ok: true, kind: 'external', originalUrl, canonicalUrl: url.href, productId: null, product: null, error: null };
}

export function candidateFromProduct(product) {
  const parsed = parseCandidateLink(product?.url || '');
  if (!parsed.ok || parsed.productId !== product?.id || !SLOT_BY_ID[product?.slot])
    throw new Error('상품의 정확한 링크와 종류를 확인해 주세요.');
  const exclusion = productExclusionReason(product);
  if (exclusion) throw new Error('현재 코디 비교에 사용할 수 없는 상품입니다.');
  const slot = SLOT_BY_ID[product.slot];
  return {
    productId: product.id,
    originalUrl: product.url,
    url: parsed.canonicalUrl,
    slot: slot.id,
    kind: slot.shape,
    gender: slot.g.toLowerCase(),
    color: Object.hasOwn(COLORS, product.color) ? product.color : null,
    colorSource: Object.hasOwn(COLORS, product.color)
      ? CANDIDATE_COLOR_SOURCES.has(product.colorSource) ? product.colorSource : 'curation'
      : null,
    brand: product.brand || '',
    name: product.name || '',
    price: Number.isFinite(product.price) && product.price > 0 ? product.price : null,
    priceSource: Number.isFinite(product.price) && product.price > 0 ? 'catalog' : null,
    checkedAt: product.checkedAt || null,
    source: 'catalog',
    classificationConfirmed: true,
  };
}

export function candidateFromLink(raw, { gender = 'm' } = {}) {
  const parsed = parseCandidateLink(raw);
  if (!parsed.ok) throw new Error(parsed.error);
  if (parsed.product) return { ...candidateFromProduct(parsed.product), originalUrl: parsed.originalUrl };
  return {
    productId: parsed.productId,
    originalUrl: parsed.originalUrl,
    url: parsed.canonicalUrl,
    slot: null,
    kind: null,
    gender: gender === 'f' || gender === 'F' ? 'f' : 'm',
    color: null,
    colorSource: null,
    brand: '',
    name: '',
    price: null,
    priceSource: null,
    checkedAt: null,
    source: 'user',
    classificationConfirmed: false,
  };
}

function candidateContext(state, closet, gender) {
  const styles = (state.styles?.length ? state.styles : [state.style || 'classic'])
    .filter((style) => STYLES[style]?.g.includes(gender));
  return {
    gender,
    styles: styles.length ? styles : ['classic'],
    occasion: state.occasion || null,
    season: state.season || seasonOf(state.now ? new Date(state.now) : new Date()),
    closet,
    brands: new Set(),
    hidden: new Set(),
    maxPrice: null,
    minPrice: null,
    brandOnly: false,
  };
}

export function compareCandidate(state, candidate, { absence = 'unknown', intent = 'add', replacementGarmentId = null } = {}) {
  const resultCandidate = { ...candidate };
  const gender = candidate?.gender === 'f' || candidate?.gender === 'F' ? 'F' : 'M';
  const inactiveIds = inactivePurchaseGarmentIds(state);
  const actual = (Array.isArray(state.garments) ? state.garments : state.demo ? [] : state.closet || [])
    .filter((item) => ['user', 'legacy'].includes(item.source) && !String(item.id).startsWith('demo_') &&
      item.gender === gender && !inactiveIds.has(item.id));
  const slot = SLOT_BY_ID[candidate?.slot];
  const candidateColor = candidate?.colorSource === 'image' ? null : candidate?.color;
  const hasColor = !!candidateColor && Object.hasOwn(COLORS, candidateColor);
  const candidateExclusion = productExclusionReason(candidate);
  const excludedCandidate = candidateExclusion && candidateExclusion !== 'incomplete';
  const classificationValid = !!slot && slot.g === gender && candidate.kind === slot.shape &&
    candidate.classificationConfirmed === true && !productClassificationConflict(candidate) && !excludedCandidate;
  const acceptedAbsence = CANDIDATE_ABSENCE.has(absence) ? absence : 'unknown';
  const acceptedIntent = CANDIDATE_INTENTS.has(intent) ? intent : 'add';
  const sameProduct = actual.filter((item) => candidate?.productId && item.productId === candidate.productId);
  const exactOwned = sameProduct.filter((item) => hasColor && item.color === candidateColor &&
    classificationValid && garmentSlotStatus(item, slot) === 'confirmed');
  const similarOwned = classificationValid ? actual.filter((item) => !sameProduct.includes(item) &&
    garmentSlotStatus(item, slot) === 'confirmed' && hasColor && item.color === candidateColor) : [];
  const sameTypeOwned = classificationValid ? actual.filter((item) => garmentSlotStatus(item, slot) === 'confirmed') : [];
  const uncertainOwned = actual.filter((item) =>
    !SLOT_BY_ID[item.slot] || !Object.hasOwn(COLORS, item.color) ||
    (slot && garmentSlotStatus(item, slot) === 'uncertain') ||
    (classificationValid && garmentSlotStatus(item, slot) === 'confirmed' && !item.color) ||
    (sameProduct.includes(item) && !exactOwned.includes(item)));
  const checks = [];
  const check = (code, message, garmentIds) => checks.push({ code, message, ...(garmentIds ? { garmentIds } : {}) });
  const parsed = parseCandidateLink(candidate?.url || '');
  if (!parsed.ok) check('invalid-link', parsed.error);
  else if (candidate.productId !== parsed.productId)
    check('product-id-mismatch', '상품 링크와 상품 번호가 달라요. 원래 링크를 다시 확인해 주세요.');
  if (!classificationValid) check('candidate-classification', '비교할 상품의 세부 종류를 먼저 확인해 주세요.');
  if (!hasColor) check('candidate-color', '상품의 색을 확인해야 내 옷과 색을 비교할 수 있어요.');
  if (slot?.requiredColors && hasColor && !slot.requiredColors.includes(candidateColor))
    check('candidate-color-conflict', '고른 종류에 필요한 색과 상품 색이 달라요. 종류를 다시 확인해 주세요.');
  if (uncertainOwned.length)
    check('owned-details', '일부 내 옷의 세부 종류·색을 확인하면 비교에 포함할 수 있어요.', uncertainOwned.map((item) => item.id));
  if (!actual.length) check('actual-wardrobe', '예시 옷이 아닌 실제 가진 옷을 등록하면 비교할 수 있어요.');
  if (acceptedIntent === 'add' && !sameProduct.length && !sameTypeOwned.length && acceptedAbsence === 'unknown')
    check('ownership-unknown', '등록되지 않은 옷이 있을 수 있어요. 비슷한 옷을 실제로 가지고 있는지 확인해 주세요.');
  if (sameTypeOwned.length && acceptedAbsence === 'absent')
    check('ownership-conflict', '등록한 같은 세부 종류의 옷이 있어요. 추가 구매인지 기존 옷 교체인지 확인해 주세요.', sameTypeOwned.map((item) => item.id));
  if (sameProduct.some((item) => !exactOwned.includes(item)))
    check('product-variant', '같은 상품 페이지의 옷이 있어요. 색·옵션이 같은지 확인해 주세요.', sameProduct.map((item) => item.id));

  // Unknown type/color never counts as a complete formula. These are recipe counts,
  // not photorealistic fit, independent outfit permutations, or wearability predictions.
  const confirmed = actual.filter((item) => SLOT_BY_ID[item.slot] && Object.hasOwn(COLORS, item.color) &&
    garmentSlotStatus(item, SLOT_BY_ID[item.slot]) === 'confirmed');
  const context = candidateContext(state, confirmed, gender);
  const formulas = matchingLooks(context);
  const existing = new Map(formulas.map((look) => [look.id, fillLook(look, context, { ownedOnly: true })])
    .filter(([, filled]) => filled));
  const completeCandidate = classificationValid && hasColor &&
    (!slot.requiredColors || slot.requiredColors.includes(candidateColor)) &&
    parsed.ok && candidate.productId === parsed.productId;
  const requestedReplacement = acceptedIntent === 'replace'
    ? actual.find((item) => item.id === replacementGarmentId) || null : null;
  const replacementTarget = completeCandidate && requestedReplacement &&
    requestedReplacement.kind === candidate.kind && SLOT_BY_ID[requestedReplacement.slot] &&
    Object.hasOwn(COLORS, requestedReplacement.color) &&
    garmentSlotStatus(requestedReplacement, SLOT_BY_ID[requestedReplacement.slot]) === 'confirmed'
    ? requestedReplacement : null;
  const replacement = { target: replacementTarget, beforeFormulaCount: 0, retainedFormulaCount: 0,
    lostFormulaCount: 0, newFormulaCount: 0 };
  if (acceptedIntent === 'replace' && !replacementTarget)
    check('replacement-target', requestedReplacement
      ? '교체할 내 옷과 후보의 종류·색을 먼저 확인해 주세요.'
      : '교체할 실제 보유 옷 한 벌을 골라 주세요.');
  const looks = [];
  if (completeCandidate) {
    let anchorId = '__purchase_candidate__';
    while (actual.some((item) => item.id === anchorId)) anchorId += '_';
    const anchor = {
      id: anchorId,
      slot: slot.id,
      kind: slot.shape,
      gender,
      color: candidateColor,
      brand: candidate.brand || null,
      label: candidate.name || slot.name,
      productId: candidate.productId,
      photoId: null,
      source: 'candidate',
    };
    const withCandidate = { ...context, closet: [...confirmed.filter((item) => item.id !== replacementTarget?.id), anchor] };
    if (replacementTarget) {
      const beforeTarget = new Set(formulas.filter((look) =>
        fillLook(look, context, { ownedOnly: true, anchorItem: replacementTarget })).map((look) => look.id));
      const afterReplacement = new Set(formulas.filter((look) =>
        fillLook(look, withCandidate, { ownedOnly: true })).map((look) => look.id));
      replacement.beforeFormulaCount = beforeTarget.size;
      replacement.retainedFormulaCount = [...beforeTarget].filter((id) => afterReplacement.has(id)).length;
      replacement.lostFormulaCount = beforeTarget.size - replacement.retainedFormulaCount;
    }
    for (const look of formulas) {
      const filled = fillLook(look, withCandidate, { ownedOnly: true, anchorItem: anchor });
      if (!filled || filled.uncertainCount) continue;
      const wasExisting = existing.has(look.id);
      looks.push({
        look,
        items: filled.items.map((row) => row.item?.id === anchorId
          ? { ...row, owned: false, item: null, candidate: resultCandidate, source: 'candidate' }
          : { ...row, source: 'wardrobe' }),
        existing: wasExisting,
        new: !wasExisting,
        unknownColorCount: 0,
      });
    }
  }
  const newFormulaCount = looks.filter((look) => look.new).length;
  if (replacementTarget) replacement.newFormulaCount = newFormulaCount;
  const priceAmount = Number.isSafeInteger(candidate.price) && candidate.price >= 0 ? candidate.price : null;
  const budgetExceeded = Number.isFinite(state.budget) && priceAmount !== null && priceAmount > state.budget;
  if (budgetExceeded) check('budget', '입력한 상품 가격이 현재 예산을 넘어요. 판매처의 실제 결제 금액도 확인해 주세요.');
  let decision;
  if (completeCandidate && exactOwned.length && acceptedIntent === 'add') {
    decision = { kind: 'skip', reasons: ['이미 등록한 같은 상품·색의 옷을 먼저 활용해 보세요.', '추가 구매가 필요한 용도가 있는지 확인해 주세요.'] };
  } else if (!completeCandidate || !actual.length || budgetExceeded ||
    acceptedIntent === 'replace' && (!replacementTarget || !replacement.retainedFormulaCount && !replacement.newFormulaCount) ||
    acceptedIntent === 'add' && !newFormulaCount ||
    acceptedIntent === 'add' && ['unknown', 'present'].includes(acceptedAbsence) && !sameProduct.length && !sameTypeOwned.length) {
    decision = { kind: 'hold', reasons: replacementTarget && !budgetExceeded
      ? [`${garmentLabel(replacementTarget)} 교체 후 유지되는 코디 공식을 찾지 못했어요. 기존 공식 ${replacement.lostFormulaCount}개가 빠지고 새로 완성되는 공식은 ${replacement.newFormulaCount}개예요.`,
        '교체할 용도와 다른 계절·소재·핏을 직접 확인한 뒤 결정해 주세요.']
      : checks.length
      ? checks.slice(0, 3).map((entry) => entry.message)
      : ['현재 등록한 옷에서는 이 상품만 더해 새로 완성되는 코디 공식을 찾지 못했어요.', '등록하지 않은 옷·교체 목적·다른 계절을 확인한 뒤 결정해 주세요.'] };
  } else if (acceptedIntent === 'replace') {
    decision = { kind: 'consider', reasons: [
      `${garmentLabel(replacementTarget)} 대신 이 후보를 넣으면 코디 공식 ${replacement.retainedFormulaCount}개가 유지되고 ${replacement.lostFormulaCount}개가 빠져요. 새로 완성되는 공식은 ${replacement.newFormulaCount}개예요.`,
      '종류·색으로 만든 공식의 변화예요. 교체 필요성과 소재·핏·사이즈·현재 가격을 직접 확인해 주세요.',
    ] };
  } else {
    decision = { kind: 'consider', reasons: [
      `확인한 내 옷에 이 상품 하나를 더하면 코디 공식 ${newFormulaCount}개가 새로 완성돼요.`,
      similarOwned.length ? '비슷한 종류·색의 내 옷이 있어요. 소재·핏·추가 용도를 직접 비교해 주세요.' : '상품의 소재·핏·사이즈와 현재 가격은 판매처에서 확인해 주세요.',
    ] };
  }
  return {
    candidate: resultCandidate,
    actualGarmentIds: actual.map((item) => item.id),
    sameProduct,
    exactOwned,
    similarOwned,
    sameTypeOwned,
    uncertainOwned,
    existingFormulaCount: existing.size,
    newFormulaCount,
    looks,
    replacement,
    missingChecks: checks,
    price: { amount: priceAmount, source: candidate.priceSource || null, checkedAt: candidate.checkedAt || null, live: false },
    decision,
    scope: 'formula-comparison',
    absence: acceptedAbsence,
    intent: acceptedIntent,
    limitations: ['종류·색과 코디 공식으로 비교했어요. 사진 인식·소재·핏·사이즈 검증은 하지 않았어요.',
      '새 코디 수는 등록한 실제 옷으로 완성되는 코디 공식 수예요. 전체 옷장의 미보유를 뜻하지 않아요.'],
  };
}
