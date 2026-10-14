// Runtime and generation share the same conservative exclusions. This is not visual recognition.
import { SLOT_BY_ID } from './data/slots.js';

export function productClassificationConflict(product) {
  const slot = SLOT_BY_ID[product?.slot];
  if (!slot) return null;
  const name = String(product.name || '').replace(/베스트\s*셀러/gi, ' ');
  const pants = /팬츠|바지|트라우저|\b(?:pants?|trousers?)\b/i.test(name);
  const vest = /베스트|조끼|\bvests?\b/i.test(name);
  const shirt = /셔츠|\bshirts?\b/i.test(
    name.replace(/티\s*셔츠|t-?shirts?|스웨트\s*셔츠|스웻\s*셔츠|sweat\s*shirts?/gi, ' '),
  );
  const outer = /재킷|자켓|jacket|코트|coat|오버셔츠|overshirt|셔켓|shacket|파카|parka|블루종|blouson|점퍼/i.test(name);
  const insulated = /패딩|다운|구스|푸퍼|프리마로프트|\b(?:down|puffer|padded)\b|insulat|primaloft/i.test(
    name.replace(/버튼\s*다운|button\s*down/gi, ' '),
  );
  const fleece = /플리스|후리스|fleece|베터\s*스웨터|better\s*sweater/i.test(name);
  const sweater = /니트|스웨터|knit|sweater/i.test(name);

  if (pants && slot.cat !== 'bottom') return 'category-conflict';
  if (vest && slot.shape !== 'vest' && !(slot.shape === 'cardigan' && /가디건|카디건|cardigan/i.test(name)))
    return 'shape-conflict';
  if (shirt && slot.cat === 'outer' && !outer) return 'shape-conflict';
  if (slot.shape === 'shirt' && /\bpk\b|피케|pique|카라\s*티|폴로\s*셔츠|polo\s*shirt/i.test(name))
    return 'shape-conflict';
  // A generic or fleece vest must not be presented as a padded/down vest.
  if (slot.id === 'm-downvest' && !insulated) return 'insulation-unverified';
  if (slot.id === 'm-vest' && (insulated || fleece)) return 'shape-conflict';
  // "Down Sweater" and knitted-shell down jackets have insulation evidence.
  if (slot.shape === 'down' && (fleece || sweater) && !insulated) return 'shape-conflict';
  return null;
}

export function productExclusionReason(product) {
  const name = String(product?.name || '');
  if (
    /구두\s*주걱|슈혼|shoe\s*horn|슈\s*트리|shoe\s*tree|슈즈?\s*클리너|구두\s*약|가죽\s*클리너|가죽\s*크림|슈\s*케어|신발\s*관리|shoe\s*care|슈\s*레이스|신발\s*끈|깔창|인솔|insole|방수\s*스프레이/i.test(
      name,
    )
  )
    return 'care-tool';
  if (
    /키즈|아동|남아|여아|주니어|베이비|토들러|보이즈|걸즈|쇼트올|쇼트\s*올|\b(kids?|junior|baby|infant|toddler|shortall)\b/i.test(
      name,
    )
  )
    return 'childrenswear';
  if (!name || !Number.isFinite(product.price) || product.price <= 0) return 'incomplete';
  return productClassificationConflict(product);
}
export function productEligible(product) {
  return !productExclusionReason(product);
}
export function evidenceColor(product) {
  return product.colorSource === 'image' ? null : product.color;
}
