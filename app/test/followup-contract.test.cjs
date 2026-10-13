// Shared client/server vocabulary and normalization contract. Server reject inputs
// intentionally retain the client's permissive local-file cleanup behavior.
const test = require('node:test');
const assert = require('node:assert/strict');
const W = require('../src/wardrobe.js');
const fixture = require('../../contracts/followup-contract.json');

test('공유 후속 계약 2: 유효·정규화·서버 거부 입력의 로컬 기대값과 JSON 왕복', () => {
  assert.equal(fixture.version, 2);
  assert.equal(new Set(fixture.cases.map((c) => c.id)).size, fixture.cases.length);
  assert.ok(fixture.cases.filter((c) => c.classification === 'valid').length >= 42, '42 core outcome/size/reason combinations are represented');
  assert.ok(fixture.cases.some((c) => c.classification === 'normalize'));
  assert.ok(fixture.cases.some((c) => c.classification === 'reject'));
  for (const c of fixture.cases) {
    const before = JSON.stringify(c.decision), cleaned = W.cleanDecision(c.decision);
    assert.deepEqual(cleaned?.followup || null, c.expectedFollowup, c.id + ': local followup');
    assert.deepEqual(W.cleanDecision(JSON.parse(JSON.stringify(cleaned))), cleaned, c.id + ': local round trip');
    assert.equal(JSON.stringify(c.decision), before, c.id + ': input unchanged');
  }
});
