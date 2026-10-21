// OPF facts stay in their own ODbL dataset, outside the retailer/AI price catalog.
export const SOURCE = 'Open Products Facts';
export const SOURCE_URL = 'https://world.openproductsfacts.org';
export const LICENSE_URL = 'https://opendatacommons.org/licenses/odbl/1-0/';
export const MAX_RECORDS = 300;

const clean = (s, max) => typeof s === 'string' ? s.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max) : '';
export function normalizeProduct(p) {
  const code = clean(p?.code, 30);
  const name = clean(p?.product_name, 300);
  const brand = clean(p?.brands, 160);
  const categories = Array.isArray(p?.categories_tags) ? p.categories_tags.filter((v) => typeof v === 'string').map((v) => clean(v, 120)).slice(0, 30) : [];
  if (!/^\d{6,24}$/.test(code) || !name || !brand || !categories.includes('en:clothing')) return null;
  if (/^(unknown|n\/?a|no brand|inconnu)$/i.test(brand) || /^(chargement|loading)[.…\s]*$/i.test(name)
    || categories.includes('en:infant-diapers') || /\d\s*[€$¥]/.test(name)) return null;
  // No price, image, offer, inferred colour, gender or ownership is manufactured.
  return { code, brand, name, categories, url: `${SOURCE_URL}/product/${code}` };
}

const aliases = {
  유니클로: 'uniqlo', 게스: 'guess', 브랜딧: 'brandit', 셀리오: 'celio',
  리바이스: 'levis', 아디다스: 'adidas', 나이키: 'nike', 데카트론: 'decathlon',
};
const norm = (s) => String(s || '').normalize('NFKC').toLowerCase().replace(/[’']/g, '').replace(/[-_]/g, ' ');
export function searchProducts(items, query, limit = 12) {
  const q = norm(query).trim().slice(0, 120);
  if (!q) return [];
  const words = q.split(/\s+/).map((w) => aliases[w] || w);
  return items.filter((p) => words.every((w) => norm(`${p.brand} ${p.name} ${p.code}`).includes(w)))
    .slice(0, Math.min(30, Math.max(1, Number(limit) || 12)));
}

export function rakutenSearchURL(query) {
  const text = String(query || '').trim().slice(0, 120);
  return text ? `https://search.rakuten.co.jp/search/mall/${encodeURIComponent(text)}/` : null;
}

export function registrationDraft(item) {
  // Source URL is reconstructed from its id, never trusted from an upstream link.
  const p = normalizeProduct({ code: item?.code, product_name: item?.name, brands: item?.brand, categories_tags: item?.categories });
  return p ? { brand: p.brand, name: p.name, kind: '', color: '', url: '', source: { provider: 'opf', code: p.code, url: p.url, license: 'ODbL-1.0' } } : null;
}

if (typeof window !== 'undefined') {
  let loading;
  const load = () => {
    if (!loading) loading = fetch('/data/open-products/clothing.json', { credentials: 'same-origin', signal: AbortSignal.timeout(8000) })
      .then(async (response) => {
        if (!response.ok) throw new Error('open_data_unavailable');
        const data = await response.json();
        if (data?.license !== 'ODbL-1.0' || !Array.isArray(data.items) || data.items.length > MAX_RECORDS) throw new Error('invalid_open_data');
        return data;
      }).catch((error) => { loading = null; throw error; });
    return loading;
  };
  window.EOUL_OPEN_PRODUCTS = {
    async search(query) { const data = await load(); return { ...data, items: searchProducts(data.items, query) }; },
    draft: registrationDraft,
    rakutenSearchURL,
  };
  window.dispatchEvent(new Event('eoul-open-products-ready'));
}
