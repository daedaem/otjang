// 개편 A 4단계(대표 11-12 "추천대로", 의도 3번 「스타일 목표 대비 옷장 진단」 — 오늘의집처럼 원하는 스타일 기준으로 빈자리를 짚는다).
// 스타일별 기본 옷 목록은 기존 편집 데이터(slots.js의 style 점수 3 = 그 스타일 옷장의 기본)를 그대로 쓴다.
// 체험용 옷은 실제 보유가 아니다: 채운 칸으로 세지 않고 "체험용으로 채움"으로 따로 보인다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMock } from '../src/core.mjs';

function mine() {
  const M = createMock({ photos: false });
  M.addGarment({ kind: 'shirt', slot: 'm-oxford', color: 'white', label: '내 셔츠', gender: 'M' });
  M.addGarment({ kind: 'pants', slot: 'm-chino', color: 'beige', label: '내 치노', gender: 'M' });
  return M;
}

test('목표 스타일의 기본 옷 중 가진 것과 빈자리를 센다', () => {
  const g = mine().styleGoal('classic');
  assert.equal(g.style.id, 'classic');
  assert.equal(g.style.label, '아메리칸 클래식');
  assert.equal(g.total, g.items.length);
  assert.ok(g.total >= 10);
  assert.equal(g.owned, 2);
  const by = (id) => g.items.find((i) => i.slotId === id);
  assert.equal(by('m-oxford').state, 'owned');
  assert.equal(by('m-chino').state, 'owned');
  assert.equal(by('m-blazer').state, 'missing');
  // 가진 것이 앞, 빈자리는 그 뒤.
  assert.deepEqual(g.items.slice(0, 2).map((i) => i.state), ['owned', 'owned']);
});

test('먼저 채울 옷은 가진 옷과 새 코디가 가장 많이 생기는 빈자리이고, 실제 상품 후보가 붙는다', () => {
  const g = mine().styleGoal('classic');
  assert.ok(g.next, 'next');
  assert.equal(g.next.state, 'missing');
  assert.ok(g.next.gain >= g.items.filter((i) => i.state === 'missing').reduce((m, i) => Math.max(m, i.gain), 0));
  for (const i of g.items.filter((x) => x.state === 'missing' && x.product)) {
    assert.match(i.product.id, /^ms-\d+$/);
    assert.ok(i.product.name && i.product.priceText);
  }
});

test('체험용 옷은 보유로 세지 않고 따로 표시한다', () => {
  const M = mine();
  M.loadTrialCloset('M');
  const g = M.styleGoal('classic');
  assert.equal(g.owned, 2);
  assert.equal(g.items.find((i) => i.slotId === 'm-blazer').state, 'trial');
  assert.ok(g.trial >= 1);
});

test('고를 수 있는 목표는 옷장 성별에 맞는 스타일만이고, 모르는 목표는 클래식으로 본다', () => {
  const M = mine();
  const ids = M.styleGoal().choices.map((c) => c.id);
  assert.ok(ids.includes('classic') && ids.includes('amekaji'));
  assert.ok(!ids.includes('french'));
  assert.equal(M.styleGoal('nope').style.id, 'classic');
  assert.equal(M.styleGoal('amekaji').style.label, '아메카지');
});

test('빈 옷장도 목표 목록과 빈자리를 보여 준다', () => {
  const g = createMock({ photos: false }).styleGoal('classic');
  assert.equal(g.owned, 0);
  assert.equal(g.items.every((i) => i.state === 'missing'), true);
  assert.ok(g.next);
});

test('상품이 목표의 빈자리를 채우는지 알려 준다', () => {
  const M = mine();
  const g = M.styleGoal('classic');
  const empty = g.items.find((i) => i.state === 'missing' && i.product);
  const r = M.goalFor(empty.product.id, 'classic');
  assert.equal(r.inGoal, true);
  assert.equal(r.fills, true);
  assert.equal(r.owned, 2);
  assert.equal(r.total, g.total);
  assert.equal(M.goalFor('ms-0', 'classic'), null);
});
