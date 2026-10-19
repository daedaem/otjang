import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { search } from '../src/engine.js';
import { wardrobeView, newWardrobeState } from '../src/wardrobe.js';

const corpus = JSON.parse(fs.readFileSync(new URL('./fixtures/request-corpus-20261019.json', import.meta.url)));
const state = { ...wardrobeView({ ...newWardrobeState(), demo: false, garments: [] }), now: '2026-10-19' };
test('corpus provenance distinguishes curated examples from collected user evidence', () => {
  assert.equal(corpus.cases.length, 50);
  assert.equal(corpus.cases.filter((c) => c.source === 'curated-regression').length, 48);
  assert.match(corpus.provenance, /No collected user-typing dataset/);
});
for (const { text, source, expect } of corpus.cases) {
  test(`${source}: ${text}`, () => {
    const r = search(state, text);
    assert.equal(r.understood, expect.understood ?? true);
    if (expect.zero) assert.equal(r.items.length, 0, 'no unrelated fallback');
    for (const key of ['minPrice', 'maxPrice', 'minPriceExclusive', 'maxPriceExclusive', 'priceSort', 'brand', 'color', 'season', 'style', 'occasion', 'comfort'])
      if (Object.hasOwn(expect, key)) assert.equal(r.query[key], expect[key], key);
    if (expect.excludeColor) assert.ok(r.criteria.excludeColors.includes(expect.excludeColor));
    if (expect.excludedItem) assert.ok(r.criteria.excludedItems.includes(expect.excludedItem));
    if (expect.unsupported) assert.ok(r.query.unsupported.includes(expect.unsupported));
    for (const { slot, product } of r.items) {
      if (expect.shape) assert.equal(slot.shape, expect.shape);
      if (expect.shapes) assert.ok(expect.shapes.includes(slot.shape));
      if (expect.namePattern) assert.match(product.name, new RegExp(expect.namePattern, 'i'));
      if (expect.category) assert.equal(slot.cat, expect.category);
      if (expect.excludeColor) assert.notEqual(product.color, expect.excludeColor);
      if (expect.maxPrice !== undefined) assert.ok(expect.maxPriceExclusive ? product.price < expect.maxPrice : product.price <= expect.maxPrice);
      if (expect.minPrice !== undefined) assert.ok(expect.minPriceExclusive ? product.price > expect.minPrice : product.price >= expect.minPrice);
    }
    // An absent matching catalog item is a truthful 0, not evidence of understanding quality.
  });
}
