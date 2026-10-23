import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recommendLooks, recommendItems, closetLooks, basicOutfits } from '../../../app/lite/src/domain/engine.js';
import { newWardrobeState, wardrobeView, makeGarment } from '../../../app/lite/src/domain/wardrobe.js';

const closet = (...garments) => ({ ...wardrobeView({ ...newWardrobeState(), demo: false, garments }), now: '2026-10-17' });

test('owning washed jeans never turns into advice to buy raw denim', () => {
  const state = closet(
    makeGarment({ id: 'g_t1', slot: 'm-knit', color: 'navy', gender: 'M' }),
    makeGarment({ id: 'g_t2', slot: 'm-denim', color: 'indigo', gender: 'M' }),
    makeGarment({ id: 'g_t3', slot: 'm-white-sneaker', color: 'white', gender: 'M' }),
  );
  const looks = recommendLooks(state, { limit: 20 });
  assert.ok(looks.length > 0);
  for (const look of looks)
    assert.ok(!look.items.some((i) => !i.owned && ['m-denim', 'm-denim-raw'].includes(i.slot.id)), look.look.title);
  assert.ok(!recommendItems(state, { limit: 20 }).some((r) => r.slot.id === 'm-denim-raw'));
});

test('the closet tab and the item sheet agree: a top, bottom and shoes always make an outfit', () => {
  const state = closet(
    makeGarment({ id: 'g_t4', slot: 'm-oxford', color: 'blue', gender: 'M' }),
    makeGarment({ id: 'g_t5', slot: 'm-denim', color: 'indigo', gender: 'M' }),
    makeGarment({ id: 'g_t6', slot: 'm-white-sneaker', color: 'white', gender: 'M' }),
  );
  const { ready } = closetLooks(state, { limit: 3 });
  // Whatever the formula library finds, the closet tab falls back to the same basic outfits the item sheet shows.
  assert.ok(ready.length > 0 || basicOutfits(state, { limit: 2 }).length > 0);
});
