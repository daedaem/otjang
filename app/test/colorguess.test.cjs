// 실행: node --test test/   — 사진에서 색 계열·밝기 초안 뽑기. 합성 픽셀로 확인한다(실제 사진의 정확도는 별도 검증 대상).
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../src/colorguess.js');

/** w×h 그림. fill(x, y) → [r, g, b] */
function image(w, h, fill) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const [r, g, b] = fill(x, y); const i = (y * w + x) * 4; data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255; }
  return data;
}
const solid = (rgb) => () => rgb;

test('단색 사진은 그 색 계열과 밝기로 읽힌다', () => {
  const navy = G.guess(image(40, 40, solid([28, 38, 72])), 40, 40);
  assert.equal(navy.family, 'navy'); assert.ok(navy.light >= 15 && navy.light <= 25, '밝기 ' + navy.light);
  assert.equal(navy.share, 1);
  assert.equal(G.guess(image(40, 40, solid([250, 250, 248])), 40, 40).family, 'white');
  assert.equal(G.guess(image(40, 40, solid([22, 22, 24])), 40, 40).family, 'black');
  assert.equal(G.guess(image(40, 40, solid([128, 128, 128])), 40, 40).family, 'gray');
  assert.equal(G.guess(image(40, 40, solid([96, 108, 70])), 40, 40).family, 'olive');
  assert.equal(G.guess(image(40, 40, solid([70, 45, 32])), 40, 40).family, 'brown');
  assert.equal(G.guess(image(40, 40, solid([214, 190, 150])), 40, 40).family, 'beige');
  assert.equal(G.guess(image(40, 40, solid([170, 150, 110])), 40, 40).family, 'khaki');
  assert.equal(G.guess(image(40, 40, solid([110, 150, 200])), 40, 40).family, 'blue');
  assert.equal(G.guess(image(40, 40, solid([110, 24, 40])), 40, 40).family, 'burgundy');
  assert.equal(G.guess(image(40, 40, solid([210, 40, 50])), 40, 40).family, 'red');
  assert.equal(G.guess(image(40, 40, solid([40, 110, 60])), 40, 40).family, 'green');
});

test('가운데 옷만 보고 가장자리 배경은 보지 않는다', () => {
  // 바깥 15%는 흰 배경, 가운데는 네이비 옷
  const data = image(60, 60, (x, y) => (x < 10 || x >= 50 || y < 8 || y >= 52 ? [255, 255, 255] : [30, 40, 75]));
  const r = G.guess(data, 60, 60);
  assert.equal(r.family, 'navy');
  assert.ok(r.share > 0.9, '대표 상자 비율 ' + r.share);
});

test('줄무늬는 많은 쪽 색을 대표색으로 고르고, 비율이 1보다 작다', () => {
  const data = image(60, 60, (x) => (x % 6 < 4 ? [240, 242, 246] : [70, 110, 190]));
  const r = G.guess(data, 60, 60);
  assert.equal(r.family, 'white');
  assert.ok(r.share < 0.8 && r.share > 0.5, '비율 ' + r.share);
});

test('투명 픽셀만 있으면 null, 작은 그림도 읽는다', () => {
  const t = new Uint8ClampedArray(16); // 2×2 전부 투명
  assert.equal(G.guess(t, 2, 2), null);
  assert.equal(G.guess(image(2, 2, solid([28, 38, 72])), 2, 2).family, 'navy');
  assert.equal(G.guess(null, 2, 2), null);
});

test('색 계열 이름은 모두 옷장 어휘에 있다', () => {
  const W = require('../src/wardrobe.js');
  for (let h = 0; h < 360; h += 7) for (const s of [0.05, 0.2, 0.5, 0.9]) for (const l of [0.05, 0.25, 0.45, 0.65, 0.9]) assert.ok(W.FAM[G.familyOf(h, s, l)], h + ' ' + s + ' ' + l);
});
