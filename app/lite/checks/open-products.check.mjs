import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeProduct, searchProducts, registrationDraft, rakutenSearchURL, MAX_RECORDS } from '../src/open-products.mjs';

const raw = { code: '2000209608913', brands: 'Uniqlo', product_name: 'Dry Crew Neck Short Sleeve T-Shirt', categories_tags: ['en:clothing', 'en:t-shirts'] };
const data = JSON.parse(fs.readFileSync(new URL('../data/open-products/clothing.json', import.meta.url)));

test('only clothing facts with a useful name, brand and numeric identifier are imported', () => {
  const item = normalizeProduct({ ...raw, url: 'javascript:alert(1)', image_front_url: 'https://untrusted.test/photo', itemPrice: 1000, color: 'red' });
  assert.equal(item.url, 'https://world.openproductsfacts.org/product/2000209608913');
  assert.deepEqual(Object.keys(item).sort(), ['brand', 'categories', 'code', 'name', 'url']);
  for (const change of [
    { code: '../secret' }, { brands: '' }, { product_name: '' }, { brands: 'unknown' },
    { product_name: 'Chargement…' }, { product_name: 'Nike pas cher 30€' },
    { categories_tags: ['en:food'] }, { categories_tags: ['en:clothing', 'en:infant-diapers'] },
  ]) assert.equal(normalizeProduct({ ...raw, ...change }), null);
});

test('public dataset is attributed, separate, bounded and contains no photos or offers', () => {
  assert.equal(data.license, 'ODbL-1.0');
  assert.match(data.attribution, /Open Products Facts/);
  assert.equal(data.sourceCount, data.items.length + data.skippedCount);
  assert.equal(data.usableCount, data.items.length);
  assert.ok(data.items.length > 0 && data.items.length <= MAX_RECORDS);
  assert.equal(new Set(data.items.map((p) => p.code)).size, data.items.length);
  for (const item of data.items) {
    assert.deepEqual(item, normalizeProduct({ code: item.code, brands: item.brand, product_name: item.name, categories_tags: item.categories }));
  }
});

test('Korean brand aliases retrieve real matching records and never replace a zero-result query', () => {
  const uniqlo = searchProducts(data.items, '유니클로');
  assert.ok(uniqlo.some((p) => p.name === 'Dry-EX T-Shirt'));
  assert.ok(uniqlo.every((p) => p.brand === 'Uniqlo'));
  assert.ok(searchProducts(data.items, '리바이스 511').some((p) => p.name === 'Jean 511 slim'));
  assert.deepEqual(searchProducts(data.items, '없는브랜드상품절대없음'), []);
  assert.deepEqual(searchProducts(data.items, ''), []);
  assert.ok(searchProducts(data.items, 'shirt', 100).length <= 30);
});

test('selection creates a registration draft, leaving colour, kind, purchase link and ownership unconfirmed', () => {
  const item = normalizeProduct(raw);
  const draft = registrationDraft({ ...item, url: 'https://attacker.test' });
  assert.equal(draft.brand, 'Uniqlo');
  assert.equal(draft.name, raw.product_name);
  assert.equal(draft.kind, '');
  assert.equal(draft.color, '');
  assert.equal(draft.url, '');
  assert.equal(draft.source.url, item.url);
  assert.equal(draft.source.license, 'ODbL-1.0');
  assert.equal(draft.productId, undefined);
  assert.equal(registrationDraft({ ...item, code: 'javascript:alert(1)' }), null);
});

test('Rakuten search is an encoded external navigation, without a fake API response or credential', () => {
  const q = 'Levi’s 501 /?x=<script>';
  const url = new URL(rakutenSearchURL(q));
  assert.equal(url.origin, 'https://search.rakuten.co.jp');
  assert.equal(url.search, '');
  assert.equal(decodeURIComponent(url.pathname.slice('/search/mall/'.length, -1)), q);
  assert.equal(rakutenSearchURL('  '), null);
});
