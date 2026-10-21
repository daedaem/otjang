// Follow-ups keep the original request. A higher price is never evidence of quality.
export function resolveSearchFollowUp(previousQuery, text) {
  if (typeof previousQuery !== 'string' || !previousQuery.trim() || typeof text !== 'string') return null;
  const match = text.match(/^\s*(?:좀\s*)?더\s*(싼|저렴한|저렴하게|싸게|비싼|비싸게|좋은|나은|괜찮은)\s*(?:걸로|거|것|거로|걸|건)?\s*(?:없어|있어|보여\s*줘|줘|요)?[?.!]*\s*$/);
  if (!match) return null;
  const said = text.trim();
  if (['좋은', '나은', '괜찮은'].includes(match[1])) {
    return { query: previousQuery, follow: {
      said, clarification: '소재·마감·착용감을 비교할 자료가 부족해 어느 상품이 더 좋은지 판단하지 못했어요. 기존 조건과 순서는 유지했어요.',
    } };
  }
  const order = /비싼|비싸게/.test(match[1]) ? '높은 가격순' : '낮은 가격순';
  const base = previousQuery.replace(/\s*(?:낮은 가격순|높은 가격순)\s*$/, '').trim();
  return { query: `${base} ${order}`, follow: { said, order } };
}
