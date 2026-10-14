// Runtime and generation share the same conservative exclusions. This is not visual recognition.
import { SLOT_BY_ID } from './data/slots.js';

export function productClassificationConflict(product) {
  const slot = SLOT_BY_ID[product?.slot];
  if (!slot) return null;
  const name = String(product.name || '').replace(/베스트\s*셀러/gi, ' ');
  const pants = /팬츠|바지|트라우저|슬랙스|(?:^|\s)진(?:\s|$)|\b(?:pants?|trousers?|slacks|jeans?)\b/i.test(name);
  // 신발 이름(위켄더 옥스포드 등)이 옷 종류에, 코트·기능성 아우터 이름이 상의·후드 종류에 들어가지 않게 한다
  const shoe = /위켄더|weekender|왈라비|wallabee|스니커즈|sneakers?|슈즈|\bshoes?\b|로퍼|loafer|구두|부츠(?!\s*(?:컷|진|팬츠))|\bboots?\b(?!\s*-?(?:cut|jeans?|pants?)\b)/i.test(name);
  const technical = /아톰|\batom\b|프로톤|proton|감마|gamma|후디니|houdini|\br1\b|마이크로\s*d\b|micro\s*d\b|알파\s*(재킷|자켓|sv|ar)|\balpha\s*(jacket|sv|ar)\b|델타\s*(재킷|자켓)|레트로\s*(파일|-?\s*x)|retro\s*(pile|-?\s*x)/i.test(name);
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
  const coat = /코트|\bcoats?\b/i.test(name);

  if (pants && slot.cat !== 'bottom') return 'category-conflict';
  if (shoe && slot.cat !== 'shoes') return 'category-conflict';
  if (coat && !shoe && slot.cat !== 'outer') return 'category-conflict';
  // A hood does not turn a parka into a sweatshirt. The explicit hooded sweatshirt
  // name HOOD ZIP UP PARKA remains allowed; technical model names are checked below.
  if (slot.cat === 'top' && /파카|\bparka\b/i.test(name) && !/\bHOOD ZIP UP PARKA\b/i.test(name)) return 'category-conflict';
  if (technical && ['m-hoodie', 'm-harrington', 'm-knit', 'm-sweat'].includes(slot.id)) return 'shape-conflict';
  if (slot.id === 'm-harrington' && /색\s*(재킷|자켓)|sack\s*jacket|[23]\s*-?\s*(버튼|button)|해리스\s*트위드|harris\s*tweed/i.test(name)) return 'shape-conflict';
  if (['tee', 'longtee'].includes(slot.shape) && /폴로(?!\s*(랄프|베어|bear|클럽|스포츠))|\bpolo\b(?!\s*ralph)/i.test(name)) return 'shape-conflict';
  if (slot.shape === 'shirt' && /스웨터|sweater/i.test(name)) return 'shape-conflict';
  // Technical trousers conflict with chino/tailored/denim shapes, but cargo is
  // explicitly a functional-trouser slot in this catalog.
  if (['m-chino', 'm-slacks', 'm-cords', 'm-denim', 'm-denim-raw', 'f-slacks', 'f-denim', 'f-skirt'].includes(slot.id) && /감마|gamma|타슬란|taslan|트레킹|trekking|하이킹|hiking|등산/i.test(name)) return 'shape-conflict';
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
  if (/swim|수영|스윔|래쉬\s*가드/i.test(name)) return 'swimwear';
  if (/장갑|글러브|\bgloves?\b|\bmittens?\b/i.test(name)) return 'not-garment';
  if (
    /쇼츠|반바지|숏\s*팬츠|하프\s*팬츠|\bshorts?\b(?!\s*sleeve)|버뮤다|bermuda|(치노|드로스트링|코튼|데님|카고|트윌)\s*쇼트(?!\s*(재킷|자켓|코트|초어|블루종|푸퍼|패딩|다운))/i.test(name)
  )
    return 'shorts';
  if (!name || !Number.isFinite(product.price) || product.price <= 0) return 'incomplete';
  const conflict = productClassificationConflict(product);
  if (conflict) return conflict;
  const requiredColors = SLOT_BY_ID[product.slot]?.requiredColors;
  if (requiredColors && !requiredColors.includes(evidenceColor(product))) return 'required-color-unverified';
  return null;
}
export function productEligible(product) {
  return !productExclusionReason(product);
}
export function evidenceColor(product) {
  return product.colorSource === 'image' ? null : product.color;
}
