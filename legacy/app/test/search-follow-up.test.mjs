import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveSearchFollowUp } from '../../../app/lite/src/domain/search-follow-up.js';
import { search } from '../../../app/lite/src/domain/engine.js';
import { newWardrobeState, wardrobeView } from '../../../app/lite/src/domain/wardrobe.js';

test('better quality never means a higher price or different search results', () => {
  const previous = '출근용 셔츠 10만원 이하';
  const state = wardrobeView(newWardrobeState());
  for (const said of ['더 좋은 걸로', '좀 더 좋은 거 보여줘', '더 나은 걸로요', '더 괜찮은 걸로']) {
    const next = resolveSearchFollowUp(previous, said);
    assert.equal(next.query, previous);
    assert.match(next.follow.clarification, /판단하지 못했어요/);
    assert.equal(next.follow.order, undefined);
    assert.deepEqual(search(state, next.query).items.map((x) => x.product.id), search(state, previous).items.map((x) => x.product.id));
  }
});

test('repeated price follow-ups preserve category, exclusions and budget', () => {
  const original = '검정 말고 출근용 셔츠 10만원 이하';
  const cheap = resolveSearchFollowUp(original, '더 싼 걸로');
  const expensive = resolveSearchFollowUp(cheap.query, '더 비싼 걸로');
  const cheapAgain = resolveSearchFollowUp(expensive.query, '좀 더 저렴한 걸로');
  assert.equal(cheap.query, `${original} 낮은 가격순`);
  assert.equal(expensive.query, `${original} 높은 가격순`);
  assert.equal(cheapAgain.query, cheap.query);
  assert.equal(resolveSearchFollowUp('', '더 좋은 걸로'), null);
  assert.equal(resolveSearchFollowUp(original, '베이지 바지'), null);
});
