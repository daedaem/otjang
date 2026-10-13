const test = require('node:test');
const assert = require('node:assert/strict');
const W = require('../src/wardrobe.js');
const C = require('../src/catalog.js');

const item = (at) => W.cleanItem({ id: 'dated', cat: 'top', kind: 'tee', name: '합성 티', checkedAt: at }, 0);
const decision = (at) => W.cleanDecision({ id: 'dated-decision', itemId: 'dated', before: { lean: 'unsure', at }, after: { decision: 'buy', at },
  followup: { outcome: 'returned', sizeResult: 'small', returnReason: 'size', at } });

test('실제 날짜는 시간대로 바꾸지 않고 유지하며 윤년과 4자리 연도 경계를 보존한다', () => {
  for (const at of ['0001-01-01', '2000-02-29', '2024-02-29', '2026-10-13', '9999-12-31']) {
    assert.equal(item(at).checkedAt, at);
    assert.equal(decision(at).before.at, at);
    assert.equal(decision(at).after.at, at);
    assert.equal(decision(at).followup.at, at);
  }
});

test('달력에 없는 확인일은 가격을 신선하게 보이게 하거나 반품 날짜로 남지 않는다', () => {
  for (const at of ['0000-01-01', '1900-02-29', '2026-02-29', '2026-02-31', '2026-04-31', '2026-00-01', '2026-13-01', '2026-01-00', '2026-99-99']) {
    assert.equal(item(at).checkedAt, '', at);
    assert.equal(decision(at).before.at, '', at);
    assert.equal(decision(at).after.at, '', at);
    assert.equal(decision(at).followup.at, '', at);
    const product = C.cleanProduct({ id: 'invalid-date', name: '합성 티', cat: 'top', kind: 'tee', price: 10000, checkedAt: at }, 0);
    assert.equal(product.checkedAt, '', at);
    assert.equal(C.isStale(product, '2026-10-13'), true, at);
  }
});

test('날짜 전용 필드에 시각이나 자동 보정이 필요한 문자열을 넣지 않는다', () => {
  for (const at of ['2026-10-13T12:00:00+09:00', '2026-2-3', ' 2026-10-13', null, 20261013]) {
    assert.equal(item(at).checkedAt, '');
    assert.equal(decision(at).before.at, '');
    assert.equal(decision(at).after.at, '');
    assert.equal(decision(at).followup.at, '');
  }
});
