// Where seller prices come from. Each source says whether it is connected,
// and if not, exactly what it needs. A failed source never hides the others.
//
// - catalog: the price collected into the app's product list on its date
//   (a display price on that day, not a current price)
// - naver-shopping: Naver Search API (shop.json) by brand + product name, when
//   EOUL_NAVER_CLIENT_ID / EOUL_NAVER_CLIENT_SECRET are set. Results are search
//   matches: the user must confirm the same product and option; the API gives
//   no shipping fee or option, so those stay unknown until the user adds them.
//   Field names follow third-party descriptions of the API; confirm against
//   Naver's official documentation before relying on them.
// - musinsa live price, coupang partners: not connected; listed with what an
//   operator must decide or obtain first.
import { PRODUCT_BY_ID } from '../../app/src/engine.js';
import { evidenceColor } from '../../app/src/catalog-policy.js';
import { validateOffer } from '../../app/src/offers.js';

const CACHE_MS = 10 * 60 * 1000;

export function createSupply({ env = process.env, fetchImpl = globalThis.fetch, now = () => Date.now(), log = () => {} } = {}) {
  const naverId = env.EOUL_NAVER_CLIENT_ID || null, naverSecret = env.EOUL_NAVER_CLIENT_SECRET || null;
  const cache = new Map();
  const sources = () => [
    { id: 'catalog', name: '어울 상품 목록 수집가', status: 'collected', note: '목록에 넣은 날의 표시가예요. 현재 가격이 아니에요.' },
    naverId && naverSecret
      ? { id: 'naver-shopping', name: '네이버 쇼핑 검색 API', status: 'connected', note: '검색으로 찾은 판매처예요. 같은 상품·옵션인지 직접 확인해야 비교에 넣어요. 배송비는 제공되지 않아요.' }
      // 여러 보도(2026-08~10)는 쇼핑 검색 API가 2026-07-31에 대체 없이 끝났다고 전한다. 1차 공지는 아직 확인하지 못했다.
      : { id: 'naver-shopping', name: '네이버 쇼핑 검색 API', status: 'not-connected', note: '2026-07-31에 대체 없이 끝났다는 보도가 있어요. 네이버 공지를 먼저 확인하세요.', needs: ['네이버 개발자센터 애플리케이션 등록', 'EOUL_NAVER_CLIENT_ID', 'EOUL_NAVER_CLIENT_SECRET'] },
    { id: 'musinsa', name: '무신사 실시간 가격·재고', status: 'not-connected', needs: ['운영자 결정: 무신사 제휴 또는 공식 API, 이용약관·robots 확인'] },
    { id: 'coupang-partners', name: '쿠팡 파트너스 API', status: 'not-connected', needs: ['쿠팡 파트너스 가입·승인', 'Access Key·Secret Key'] },
  ];

  async function naver(query) {
    const url = `https://openapi.naver.com/v1/search/shop.json?query=${encodeURIComponent(query)}&display=5&sort=sim`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetchImpl(url, { headers: { 'X-Naver-Client-Id': naverId, 'X-Naver-Client-Secret': naverSecret }, signal: controller.signal });
      if (!response.ok) throw new Error(`네이버 검색이 ${response.status}로 응답했어요.`);
      const data = await response.json();
      const at = new Date(now()).toISOString();
      const offers = [];
      for (const item of Array.isArray(data?.items) ? data.items : []) {
        try {
          offers.push(validateOffer({
            seller: String(item.mallName || '').trim() || '네이버 쇼핑',
            url: item.link,
            price: Number.parseInt(item.lprice, 10),
            shipping: null,
            stock: 'unknown',
            sameProduct: 'unconfirmed',
            source: 'naver-shopping',
            checkedAt: at,
            title: String(item.title || '').replace(/<[^>]*>/g, ''),
          }));
        } catch {}
      }
      return offers;
    } finally {
      clearTimeout(timer);
    }
  }

  async function lookup({ productId = null, query = null } = {}) {
    const product = productId ? PRODUCT_BY_ID[productId] : null;
    const q = (typeof query === 'string' && query.trim() ? query.trim() : product ? `${product.brand} ${product.name}` : '').slice(0, 100);
    const key = `${productId}|${q}`;
    const cached = cache.get(key);
    if (cached && now() - cached.at < CACHE_MS) return cached.result;
    const offers = [];
    const status = sources().map((source) => ({ ...source }));
    if (product) {
      offers.push(validateOffer({
        id: `catalog:${product.id}`, seller: product.store, url: product.url, price: product.price, shipping: null,
        color: evidenceColor(product), stock: 'unknown', sameProduct: 'confirmed', source: 'catalog',
        checkedAt: `${product.checkedAt}T00:00:00.000Z`, title: product.name,
      }));
    }
    const naverSource = status.find((source) => source.id === 'naver-shopping');
    if (naverSource.status === 'connected') {
      if (!q) {
        naverSource.status = 'skipped';
        naverSource.message = '검색할 브랜드·상품명이 없어요.';
      } else {
        try {
          offers.push(...await naver(q));
        } catch (error) {
          naverSource.status = 'failed';
          naverSource.message = error.name === 'AbortError' ? '네이버 검색이 5초 안에 답하지 않았어요.' : error.message || '네이버 검색에 실패했어요.';
          log('supply-failed', naverSource.message);
        }
      }
    }
    const result = { checkedAt: new Date(now()).toISOString(), query: q || null, sources: status, offers };
    // Failed lookups are not cached so the next refresh tries again.
    if (!status.some((source) => source.status === 'failed')) cache.set(key, { at: now(), result });
    return result;
  }

  return { sources, lookup };
}
