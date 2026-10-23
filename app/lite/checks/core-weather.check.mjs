// 날씨 코디(R17) 점검: 기온 구간별 겉옷, 더운 날 겉옷 빼기, 부족할 때 정직하게 알리기.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMock, weatherBand } from '../src/core.mjs';

const trial = () => { const M = createMock({ photos: false }); M.loadTrialCloset('M'); return M; };
const roles = (o) => o.pieces.map((p) => p.role);

test('기온 구간: 아침 최저로 겉옷 범위를 정한다', () => {
  assert.equal(weatherBand(22).outerMin, 0);
  assert.equal(weatherBand(14).query, '재킷');
  assert.equal(weatherBand(5).need, '코트');
  assert.equal(weatherBand(-3).query, '패딩');
});

test('더운 날은 겉옷을 뺀 차림을 주고 가벼운 상의를 고른다', () => {
  const r = trial().weatherOutfits({ min: 22, max: 30 });
  assert.ok(r.ok && r.outfits.length > 0 && !r.short);
  for (const o of r.outfits) assert.ok(!roles(o).includes('outer'));
  assert.ok(r.outfits.every((o) => ['티셔츠', '폴로 셔츠'].includes(o.pieces.find((p) => p.role === 'top')?.kindName)));
});

test('쌀쌀한 아침·큰 일교차·비: 가벼운 겉옷 + 안내', () => {
  const r = trial().weatherOutfits({ min: 14, max: 26, rain: true });
  assert.ok(r.outfits[0].fit === 'good' && roles(r.outfits[0]).includes('outer'));
  assert.ok(r.notes.some((n) => n.includes('우산')) && r.notes.some((n) => n.includes('일교차')));
  assert.equal(r.missing, null);
});

test('맞는 겉옷이 없으면 부족 표시와 찾을 말을 주고, 가장 가까운 조합만 보여 준다', () => {
  const r = trial().weatherOutfits({ min: -3, max: 4 });
  assert.equal(r.short, true);
  assert.deepEqual([r.missing.role, r.missing.query], ['outer', '패딩']);
  assert.ok(r.outfits.length <= 2);
});

test('빈 옷장·날씨 없음', () => {
  const M = createMock({ photos: false });
  assert.equal(M.weatherOutfits({}).ok, false);
  const r = M.weatherOutfits({ min: 10, max: 18 });
  assert.deepEqual([r.ok, r.outfits.length, r.missing.query], [true, 0, '코트']);
});
