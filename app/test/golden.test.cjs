// 규칙 회귀: 스키마를 옮긴 뒤에도 판정·코디·비교 계산이 예시 옷장으로 만든 스냅샷(test/golden/sample-results.json)과 같아야 한다.
// 이것은 "확인된 입력의 결과가 맞다"는 뜻이 아니라 "옮기기가 계산을 바꾸지 않았다"는 확인이다. 규칙을 일부러 바꿀 때만 node tools/golden.mjs 로 스냅샷을 다시 만든다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const W = require('../src/wardrobe.js');
const golden = JSON.parse(fs.readFileSync(__dirname + '/golden/sample-results.json', 'utf8'));
const tpl = JSON.parse(fs.readFileSync(__dirname + '/../data/template-ivy.json', 'utf8')).items;
const v1 = JSON.parse(fs.readFileSync(__dirname + '/fixtures/wardrobe-v1.json', 'utf8'));
const v2 = JSON.parse(fs.readFileSync(__dirname + '/../data/sample-wardrobe.json', 'utf8'));

test('골든 회귀: 스키마 1 자료를 스키마 2로 옮겨 계산해도 스냅샷과 같다', async () => {
  const { compute } = await import('../tools/golden.mjs');
  assert.deepEqual(compute(W.migrate(v1).items, tpl), golden);
});

test('골든 회귀: 지금 배포하는 스키마 2 자료(data/sample-wardrobe.json)도 스냅샷과 같다', async () => {
  const { compute } = await import('../tools/golden.mjs');
  assert.deepEqual(compute(W.migrate(v2).items, tpl), golden);
  assert.deepEqual(compute(W.cleanWardrobe(v2).items, W.cleanWardrobe({ schema: 1, kind: 'template', items: tpl }).items), golden, '기본 옷장도 정리해서 넣어도 같다');
});
