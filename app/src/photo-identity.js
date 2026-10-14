// Local OCR text can suggest catalog entries. It does not prove that the pictured
// garment is that product, and never writes a brand/product into the wardrobe.
import { PRODUCTS } from './data/products.js';
import { SLOT_BY_ID } from './data/slots.js';

const PHOTO_IDENTITY_TEXT_LIMIT = 1200;
// Only aliases for brands actually present in the supplied catalog are enabled.
// Short/common aliases such as POLO or NB are deliberately absent.
const PHOTO_IDENTITY_ALIASES = {
  '무신사 스탠다드': ['MUSINSA STANDARD', 'MUSINSASTANDARD'],
  '무신사 스탠다드 우먼': ['MUSINSA STANDARD WOMAN', 'MUSINSA STANDARD WOMEN'],
  '폴로 랄프 로렌': ['POLO RALPH LAUREN', 'RALPH LAUREN'],
  '나이키': ['NIKE'], '아디다스': ['ADIDAS'], '리복': ['REEBOK'],
  '리바이스': ["LEVI'S", 'LEVIS'], '리': ['LEE'],
  '뉴발란스': ['NEW BALANCE'], '챔피온': ['CHAMPION'],
  '컨버스': ['CONVERSE'], '디키즈': ['DICKIES'],
  '오어슬로우': ['ORSLOW'], '유니폼브릿지': ['UNIFORM BRIDGE'],
  '프리즘웍스': ['FRIZMWORKS'], '포터리': ['POTTERY'],
  '커버낫': ['COVERNAT'], '브룩스 브라더스': ['BROOKS BROTHERS'],
  '타미힐피거': ['TOMMY HILFIGER'], '라코스테': ['LACOSTE'],
  '레드윙': ['RED WING'], '바버': ['BARBOUR'],
  '디스이즈네버댓': ['THISISNEVERTHAT'], '인사일런스': ['INSILENCE'],
  '인사일런스 우먼': ['INSILENCE WOMAN', 'INSILENCE WOMEN'],
  '살로몬': ['SALOMON'], '파타고니아': ['PATAGONIA'],
  '스노우피크 어패럴': ['SNOW PEAK APPAREL'],
  '아크테릭스': ["ARC'TERYX", 'ARCTERYX'], '호카': ['HOKA'], '반스': ['VANS'],
};
const PHOTO_IDENTITY_GENERIC_WORDS = new Set([
  'shirt', 'shirts', 'tee', 'tshirt', 't', 'hoodie', 'knit', 'sweater', 'oxford', 'zip', 'up',
  'jacket', 'pants', 'jeans', 'coat', 'shoes', 'sneakers', 'vest', 'polo',
  '셔츠', '티셔츠', '후드', '집업', '후드집업', '옥스포드', '옥스퍼드', '옥스포드셔츠', '옥스퍼드셔츠',
  '니트', '스웨터', '재킷', '자켓', '팬츠', '바지', '청바지', '코트', '베스트',
  '남성', '여성', '남자', '여자', '맨즈', '우먼즈', 'mens', 'men', 'women', 'womens',
  'white', 'black', 'blue', 'grey', 'gray', 'navy', 'beige', 'brown', 'red',
  'green', 'pink', '화이트', '블랙', '블루', '그레이', '네이비', '베이지',
  '브라운', '레드', '그린', '핑크', '아이보리', '올리브', '차콜',
]);

function photoIdentityNormalize(value) {
  return String(value || '').normalize('NFKC').toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}

function photoIdentityPhrase(text, phrase) {
  let start = text.indexOf(phrase);
  while (start >= 0) {
    const end = start + phrase.length;
    if ((!start || !/[\p{L}\p{N}]/u.test(text[start - 1])) &&
        (end === text.length || !/[\p{L}\p{N}]/u.test(text[end]))) return { start, end };
    start = text.indexOf(phrase, start + 1);
  }
  return null;
}

function photoIdentityBrandMatches(rawText, normalized, products) {
  const lines = rawText.split(/\r?\n/).map(photoIdentityNormalize);
  const matches = [];
  for (const brand of new Set(products.map((p) => p.brand))) {
    const aliases = [brand, ...(PHOTO_IDENTITY_ALIASES[brand] || [])];
    if (/\s/.test(brand)) aliases.push(brand.replace(/\s+/g, ''));
    for (const alias of new Set(aliases.map(photoIdentityNormalize))) {
      if (!alias) continue;
      // One Korean character and a short/common English label are too weak in
      // running text. A complete logo/brand line is still a visible-text hint.
      const weak = alias.length <= 4 || ['lee', 'levis', 'coach', 'signature'].includes(alias);
      if (weak && !lines.some((line) => line === alias || line === `brand ${alias}` || line === `브랜드 ${alias}`)) continue;
      const span = photoIdentityPhrase(normalized, alias);
      if (span) matches.push({ brand, evidence: alias, source: 'ocr-text', ...span });
    }
  }
  // WOMAN and other longer visible names should not also identify their parent
  // brand simply because it is the beginning of the same OCR phrase.
  return matches.filter((m) => !matches.some((other) => other.brand !== m.brand &&
    other.start <= m.start && other.end >= m.end && other.end - other.start > m.end - m.start))
    .filter((m, index, all) => all.findIndex((other) => other.brand === m.brand) === index)
    .map(({ brand, evidence, source }) => ({ brand, evidence, source }));
}

function photoIdentityProductLinks(rawText, products) {
  const links = [];
  const unresolved = [];
  for (const raw of rawText.match(/https:\/\/[^\s<>"']+/gi) || []) {
    let url;
    try { url = new URL(raw.replace(/[),.;\]}]+$/, '')); } catch { continue; }
    if (!/^(?:www\.|m\.)?musinsa\.com$/.test(url.hostname) || url.username || url.password ||
        (url.port && url.port !== '443')) continue;
    const path = url.pathname.match(/^\/(?:products|app\/goods)\/([1-9]\d{0,15})\/?$/);
    if (!path) continue;
    const product = products.find((p) => p.id === `ms-${path[1]}`);
    const canonicalUrl = `https://www.musinsa.com/products/${path[1]}`;
    if (product && !links.some((link) => link.product.id === product.id)) links.push({ product, url: canonicalUrl });
    else if (!product && !unresolved.includes(canonicalUrl)) unresolved.push(canonicalUrl);
  }
  return { links, unresolved };
}

function photoIdentityConstraints(product, { gender, kind, color }) {
  const slot = SLOT_BY_ID[product.slot];
  const conflicts = [];
  if (gender && slot?.g && slot.g !== gender) conflicts.push('gender');
  if (kind && slot?.shape && slot.shape !== kind) conflicts.push('kind');
  // Image-curated color is not evidence strong enough to exclude a text match.
  if (color && product.color && product.colorSource !== 'image' && product.color !== color) conflicts.push('color');
  return conflicts;
}

function photoIdentityDistinctiveName(name) {
  const words = name.split(' ').filter((word) => word.length >= 2);
  return words.some((word) => !PHOTO_IDENTITY_GENERIC_WORDS.has(word) && !/^\d+$/.test(word));
}

/**
 * Suggest identity from locally read label/product text, never from appearance.
 * `exact` means exact catalog text/link evidence, not verified photo identity.
 * Callers must show the evidence and ask for confirmation before storing it.
 */
export function suggestPhotoIdentity(text, { products = PRODUCTS, gender = null, kind = null, color = null, limit = 6 } = {}) {
  const input = typeof text === 'string' ? text : '';
  const rawText = input.slice(0, PHOTO_IDENTITY_TEXT_LIMIT);
  const normalized = photoIdentityNormalize(rawText);
  const catalog = Array.isArray(products) ? products.filter((p) => p && typeof p.id === 'string' &&
    typeof p.brand === 'string' && p.brand.trim() && typeof p.name === 'string' && p.name.trim()) : [];
  const brands = photoIdentityBrandMatches(rawText, normalized, catalog);
  const explicitLabel = rawText.match(/(?:^|\n)\s*(?:brand|브랜드)\s*[:：]\s*([^\r\n]{1,120})/i)?.[1]?.trim() || null;
  const unknownBrandText = explicitLabel && !brands.some((brand) =>
    photoIdentityPhrase(photoIdentityNormalize(explicitLabel), brand.evidence)) ? explicitLabel : null;
  const { links, unresolved } = photoIdentityProductLinks(rawText, catalog);
  const constraints = { gender: ['M', 'F'].includes(String(gender).toUpperCase()) ? String(gender).toUpperCase() : null, kind, color };
  const candidates = [];
  for (const { product, url } of links) {
    const conflicts = photoIdentityConstraints(product, constraints);
    if (brands.some((brand) => brand.brand !== product.brand)) conflicts.push('brand-text');
    if (unknownBrandText) conflicts.push('unknown-brand-text');
    candidates.push({ productId: product.id, brand: product.brand, name: product.name,
      match: 'product-link', exact: conflicts.length === 0, identityConfirmed: false,
      evidence: [url], conflicts, product: { ...product } });
  }
  for (const product of catalog) {
    if (candidates.some((candidate) => candidate.productId === product.id)) continue;
    const brand = brands.find((match) => match.brand === product.brand);
    if (!brand || photoIdentityConstraints(product, constraints).length) continue;
    const name = photoIdentityNormalize(product.name);
    const fullName = photoIdentityPhrase(normalized, name);
    const nameTokens = new Set(name.split(' ').filter((word) => word.length >= 3 && !PHOTO_IDENTITY_GENERIC_WORDS.has(word)));
    const matchedTokens = [...nameTokens].filter((word) => photoIdentityPhrase(normalized, word));
    const sameKind = !!kind && SLOT_BY_ID[product.slot]?.shape === kind;
    if (!fullName && matchedTokens.length < 2 && !sameKind) continue;
    const uniqueFullName = fullName && photoIdentityDistinctiveName(name) &&
      catalog.filter((p) => p.brand === product.brand && photoIdentityNormalize(p.name) === name).length === 1;
    const exact = !!uniqueFullName && brands.length === 1 && !unknownBrandText;
    candidates.push({ productId: product.id, brand: product.brand, name: product.name,
      match: fullName ? 'brand-and-name' : matchedTokens.length >= 2 ? 'brand-and-name' : 'brand-and-kind',
      exact, identityConfirmed: false, evidence: [brand.evidence, ...(fullName ? [product.name] : matchedTokens)],
      conflicts: [], product: { ...product }, _matchedTokens: matchedTokens.length });
  }
  candidates.sort((a, b) => Number(b.match === 'product-link') - Number(a.match === 'product-link') ||
    Number(b.exact) - Number(a.exact) || Number(b.match === 'brand-and-name') - Number(a.match === 'brand-and-name') ||
    (b._matchedTokens || 0) - (a._matchedTokens || 0) || a.productId.localeCompare(b.productId));
  const boundedLimit = Number.isFinite(limit) ? Math.max(1, Math.min(12, Math.floor(limit))) : 6;
  const hasConflict = candidates.some((candidate) => candidate.conflicts.length);
  const ambiguous = brands.length > 1 || candidates.filter((candidate) => candidate.exact).length > 1;
  const status = !normalized ? 'no-text' : hasConflict ? 'conflict' : ambiguous ? 'ambiguous' :
    candidates.length || brands.length ? 'suggestions' : unknownBrandText ? 'unknown-brand' : 'no-match';
  return { status, rawText, textTruncated: input.length > rawText.length, brands,
    candidates: candidates.slice(0, boundedLimit).map(({ _matchedTokens, ...candidate }) => candidate),
    unknownBrandText, unresolvedProductLinks: unresolved, totalCandidates: candidates.length,
    requiresConfirmation: true, identityConfirmed: false };
}
