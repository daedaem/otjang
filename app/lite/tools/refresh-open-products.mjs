// Explicit maintainer task only; never runs during a build, page view or CI.
// A small clothing subset is read in <=3 requests. Larger sources require an export workflow.
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { normalizeProduct, SOURCE, SOURCE_URL, LICENSE_URL, MAX_RECORDS } from '../src/open-products.mjs';

const ENDPOINT = 'https://world.openproductsfacts.org/api/v2/search';
const fields = 'code,product_name,brands,categories_tags';
const items = new Map();
const requests = [];
let total = null;
let received = 0;
for (let page = 1; page <= 3; page++) {
  const url = new URL(ENDPOINT);
  url.search = new URLSearchParams({ categories_tags_en: 'clothing', page_size: '100', page: String(page), sort_by: 'code', fields }).toString();
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Otjang/0.1 (https://github.com/daedaem/otjang)', Accept: 'application/json' },
    signal: AbortSignal.timeout(25000), redirect: 'error',
  });
  if (!response.ok) throw new Error(`OPF HTTP ${response.status}; previous dataset unchanged`);
  const raw = await response.text();
  if (Buffer.byteLength(raw) > 2000000) throw new Error('OPF response too large; previous dataset unchanged');
  const data = JSON.parse(raw);
  if (!Number.isSafeInteger(data.count) || data.count < 1 || data.count > MAX_RECORDS || !Array.isArray(data.products)) throw new Error('Use an official bulk export for more than 300 products; previous dataset unchanged');
  if (total !== null && total !== data.count) throw new Error('OPF changed during refresh; retry later');
  total = data.count;
  received += data.products.length;
  for (const p of data.products) { const item = normalizeProduct(p); if (item) items.set(item.code, item); }
  requests.push(url.toString());
  if (received >= total) break;
  // The official search limit is 10/minute; <=3 queries with at least 6 seconds between them.
  await new Promise((resolve) => setTimeout(resolve, 6100));
}
if (received !== total || !items.size) throw new Error('Incomplete response; previous dataset unchanged');
const data = {
  source: SOURCE, sourceURL: SOURCE_URL, license: 'ODbL-1.0', licenseURL: LICENSE_URL,
  contentsLicense: 'https://opendatacommons.org/licenses/dbcl/1-0/',
  attribution: 'Contains information from Open Products Facts, made available under the Open Database License (ODbL).',
  fetchedAt: new Date().toISOString(), query: { category: 'en:clothing', endpoint: ENDPOINT },
  sourceCount: total, usableCount: items.size, skippedCount: total - items.size, requests,
  modifications: 'Clothing subset; missing/unknown brand, missing name/id, loading placeholders, infant diapers and price-like names omitted; fields projected and renamed; no images or prices included.',
  items: [...items.values()].sort((a, b) => a.code.localeCompare(b.code)),
};
const out = fileURLToPath(new URL('../data/open-products/clothing.json', import.meta.url));
await fs.mkdir(fileURLToPath(new URL('../data/open-products/', import.meta.url)), { recursive: true });
await fs.writeFile(`${out}.tmp`, `${JSON.stringify(data, null, 2)}\n`);
await fs.rename(`${out}.tmp`, out);
console.log(JSON.stringify({ sourceCount: total, usableCount: items.size, skippedCount: total - items.size, requests: requests.length, brands: [...new Set(data.items.map((x) => x.brand))] }));
