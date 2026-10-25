// Where seller prices come from. Each source says whether it is connected,
// and if not, exactly what it needs. A failed source never hides the others.
//
// - catalog: the price collected into the app's product list on its date
//   (a display price on that day, not a current price)
// - naver-shopping: discontinued on 2026-07-31 (official notice 32564).
//   Old credentials must never enable requests. Existing saved offers remain intact.
// - musinsa live price, coupang partners: need a separately approved data source.
import { PRODUCT_BY_ID } from '../../../app/lite/src/domain/engine.js';
import { evidenceColor } from '../../../app/lite/src/domain/catalog-policy.js';
import { validateOffer } from '../../../app/lite/src/domain/offers.js';

const CACHE_MS = 10 * 60 * 1000;

export function createSupply({ now = () => Date.now() } = {}) {
  const cache = new Map();
  const sources = () => [
    { id: 'catalog', name: '어울 상품 목록 수집가', status: 'collected', note: '목록에 넣은 날의 표시가예요. 현재 가격이 아니에요.' },
    { id: 'naver-shopping', name: '네이버 쇼핑 검색 API', status: 'discontinued',
      stoppedAt: '2026-07-31', noticeUrl: 'https://developers.naver.com/notice/article/32564',
      note: '2026-07-31 서비스가 종료됐어요. 기존 키로도 호출하지 않아요. 저장한 과거 가격 기록은 유지해요.', needs: [] },
    { id: 'musinsa', name: '무신사 실시간 가격·재고', status: 'not-connected', needs: ['운영자 결정: 무신사 제휴 또는 공식 API, 이용약관·robots 확인'] },
    { id: 'coupang-partners', name: '쿠팡 파트너스 API', status: 'not-connected', needs: ['쿠팡 파트너스 가입·승인', 'Access Key·Secret Key'] },
  ];

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
    const result = { checkedAt: new Date(now()).toISOString(), query: q || null, sources: status, offers };
    // Failed lookups are not cached so the next refresh tries again.
    if (!status.some((source) => source.status === 'failed')) cache.set(key, { at: now(), result });
    return result;
  }

  return { sources, lookup };
}
