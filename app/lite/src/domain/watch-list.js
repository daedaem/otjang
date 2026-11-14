// 개편 A 5단계(대표 11-12 "추천대로", 의도 2번 「본 옷 찾아 주기」): 본 옷을 「찾는 중」에 적어 두고 다시 찾는다.
// 자동 매물 알림은 없다(공식 경로·약관 확인 전). 저장 키는 화면이 회원별 저장 범위 안에서 정한다.
export const WATCH_LIMIT = 50;
const fail = () => {
  throw Error('찾는 중 목록 형식을 읽지 못해 원문을 보호하고 있어요. 백업에서 보관해 주세요.');
};
const exact = (x, keys) =>
  x !== null && typeof x === 'object' && !Array.isArray(x) &&
  Object.keys(x).every((k) => keys.includes(k)) && keys.every((k) => k === 'productId' || k in x);
const clean = (s) => (typeof s === 'string' ? s.normalize('NFKC').replace(/\s+/g, ' ').trim() : '');
const okText = (s) => typeof s === 'string' && s.length > 0 && s.length <= 80 && !/[\x00-\x1f\x7f]/.test(s);
const okProduct = (id) => id === undefined || (typeof id === 'string' && /^ms-\d+$/.test(id));

export function readWatch(raw) {
  if (raw == null) return { v: 1, items: [] };
  let x;
  try { x = JSON.parse(raw); } catch { fail(); }
  if (!exact(x, ['v', 'items']) || x.v !== 1 || !Array.isArray(x.items) || x.items.length > WATCH_LIMIT) fail();
  for (const it of x.items)
    if (!exact(it, ['id', 'text', 'at', 'productId']) || typeof it.id !== 'string' || !/^w[0-9a-z]{6,24}$/.test(it.id) ||
      !okText(it.text) || !okProduct(it.productId) || typeof it.at !== 'string' || !Number.isFinite(Date.parse(it.at))) fail();
  return x;
}

export function addWatch(list, { text, productId } = {}, at = new Date().toISOString()) {
  const t = clean(text);
  if (!okText(t)) throw Error('찾을 옷을 1~80자로 적어 주세요.');
  if (!okProduct(productId)) throw Error('상품을 확인하지 못했어요.');
  const same = list.items.some((x) => (productId ? x.productId === productId : !x.productId && clean(x.text) === t));
  if (same) return list;
  const id = 'w' + Date.parse(at).toString(36) + Math.random().toString(36).slice(2, 6);
  const item = productId ? { id, text: t, at, productId } : { id, text: t, at };
  return { v: 1, items: [item, ...list.items].slice(0, WATCH_LIMIT) };
}

export function removeWatch(list, id) {
  return { v: 1, items: list.items.filter((x) => x.id !== id) };
}
