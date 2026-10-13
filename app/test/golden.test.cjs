// 합성 fixture에서만 확인을 가정한다. 실제 13벌 초안과 파일은 바꾸지 않는다.
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

test('골든 회귀: 스키마 2의 합성 확인 fixture도 기존 규칙 스냅샷과 같다', async () => {
  const { compute } = await import('../tools/golden.mjs');
  assert.deepEqual(compute(W.migrate(v2).items, tpl), golden);
  assert.deepEqual(compute(W.cleanWardrobe(v2).items, W.cleanWardrobe({ schema: 1, kind: 'template', items: tpl }).items), golden, '기본 옷장도 정리해서 넣어도 같다');
});

test('골든 회귀: 예시 B(원피스·스커트 옷장, data/sample-wardrobe-b.json)와 그 후보들도 스냅샷(sample-b-results.json)과 같다', async () => {
  const { compute, CANDS_B } = await import('../tools/golden.mjs');
  const goldenB = JSON.parse(fs.readFileSync(__dirname + '/golden/sample-b-results.json', 'utf8'));
  const vB = JSON.parse(fs.readFileSync(__dirname + '/../data/sample-wardrobe-b.json', 'utf8'));
  assert.deepEqual(compute(W.cleanWardrobe(vB).items, tpl, CANDS_B), goldenB);
});
