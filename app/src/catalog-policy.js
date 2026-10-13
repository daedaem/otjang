// Runtime and generation share the same conservative exclusions. This is not visual recognition.
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
  return null;
}
export function productEligible(product) {
  return !productExclusionReason(product);
}
export function evidenceColor(product) {
  return product.colorSource === 'image' ? null : product.color;
}
