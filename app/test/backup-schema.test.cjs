const test = require('node:test');
const assert = require('node:assert/strict');
const B = require('../src/beta.js');
const W = require('../src/wardrobe.js');

test('미래 전체 백업과 중첩 스키마는 정리 함수를 실행하기 전에 거부한다', () => {
  const base = { kind: 'otjang-backup', version: 1, state: { schema: 2, owner: {}, items: [], decisions: [], others: [], rack: [], catalog: { products: [] } } };
  const cases = [
    { raw: { ...base, version: 2 }, path: 'version' },
    { raw: { ...base, state: { ...base.state, schema: 3 } }, path: 'state.schema' },
    { raw: { ...base, state: { ...base.state, catalog: { schema: 2, products: [] } } }, path: 'state.catalog.schema' },
    { raw: { ...base, state: { ...base.state, others: [{ schema: 3, items: [], decisions: [] }] } }, path: 'state.others[0].schema' }
  ];
  for (const { raw, path } of cases) {
    const before = JSON.stringify(raw); let called = false;
    assert.equal(B.newerSchemaPath(raw), path);
    assert.equal(B.readBackup(raw, () => { called = true; return {}; }), null);
    assert.equal(called, false, path + ': no cleanup');
    assert.equal(JSON.stringify(raw), before, path + ': unchanged');
  }
});

test('계정 백업·일반 파일에서도 미래 옷장과 상품 스키마를 찾고 현행·이전 스키마는 그대로 읽는다', () => {
  assert.equal(B.newerSchemaPath({ kind: 'otjang-server-backup', schema: 2 }), 'schema');
  assert.equal(B.newerSchemaPath({ kind: 'otjang-server-backup', schema: 1, wardrobe: { schema: 3 } }), 'wardrobe.schema');
  assert.equal(B.newerSchemaPath({ kind: 'otjang-server-backup', schema: 1, catalog: { schema: 2 } }), 'catalog.schema');
  assert.equal(B.newerSchemaPath({ schema: 3, items: [] }), 'schema');
  assert.equal(B.newerSchemaPath({ kind: 'catalog', schema: 2, products: [] }), 'schema');
  for (const schema of [1, 2]) assert.equal(B.newerSchemaPath({ schema, items: [] }), '');
  assert.equal(B.newerSchemaPath({ kind: 'otjang-backup', version: 1, state: { schema: 2, catalog: { products: [] } } }), '');
});

test('같은 스키마의 예전 전체 백업은 새 선택 키만 채우고 기존 사이즈·반품·연결 값을 보존한다', () => {
  const modern = W.cleanDecision({ id: 'old-decision', itemId: 'old-item', before: { lean: 'unsure' }, after: { decision: 'buy' },
    followup: { outcome: 'purchased', sizeResult: 'unknown', returnReason: 'unknown', worn: 'no', regret: 'unknown', note: '예전 메모', at: '2026-10-13' } });
  const state = { schema: 2, owner: {}, items: [], decisions: [modern], others: [{ schema: 2, items: [], decisions: [modern] }], rack: [], catalog: { products: [] },
    meta: {}, prefs: {}, pickLog: [{ id: 'old-pick', candidateId: '' }], betaTrial: null, syncStamp: null, syncFollowupAck: null };
  const clean = (s) => ({ ...s, decisions: s.decisions.map(W.cleanDecision), others: s.others.map((o) => ({ ...o, decisions: o.decisions.map(W.cleanDecision) })), pickLog: s.pickLog.map((e) => ({ id: e.id, candidateId: typeof e.candidateId === 'string' ? e.candidateId : '' })) });
  const old = B.makeBackup(state);
  delete old.state.decisions[0].followup.sizeResult; delete old.state.decisions[0].followup.returnReason;
  delete old.state.others[0].decisions[0].followup.sizeResult; delete old.state.others[0].decisions[0].followup.returnReason;
  delete old.state.pickLog[0].candidateId;
  const before = JSON.stringify(old), restored = B.readBackup(old, clean);
  assert.deepEqual(restored, state);
  assert.equal(JSON.stringify(old), before, '원본 옛 백업 변경 없음');
  const known = B.makeBackup(state);
  known.state.decisions[0].followup = { ...known.state.decisions[0].followup, outcome: 'returned', sizeResult: 'small', returnReason: 'size' };
  known.state.pickLog[0].candidateId = 'linked-item';
  assert.deepEqual(B.readBackup(known, clean).decisions[0].followup, known.state.decisions[0].followup);
  assert.equal(B.readBackup(known, clean).pickLog[0].candidateId, 'linked-item');
  known.state.decisions[0].followup.sizeResult = 'future-medium';
  assert.equal(B.readBackup(known, clean), null, '명시된 새 값은 백업에서 조용히 정규화하지 않음');
});
