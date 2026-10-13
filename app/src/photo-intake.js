/* Local photo intake helpers. These checks do not identify garments or products. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PhotoIntake = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  function quality(data, width, height, originalWidth, originalHeight) {
    if (!data || !width || !height) return { issues: ['사진을 읽지 못했습니다.'], canSuggestColor: false };
    let sum = 0, sum2 = 0, count = 0;
    for (let i = 0; i + 3 < data.length; i += 4) {
      if (data[i + 3] < 128) continue;
      const y = .2126 * data[i] + .7152 * data[i + 1] + .0722 * data[i + 2];
      sum += y; sum2 += y * y; count++;
    }
    const issues = [], mean = count ? sum / count : 0;
    const deviation = count ? Math.sqrt(Math.max(0, sum2 / count - mean * mean)) : 0;
    if (!count) issues.push('옷이 보이는 사진을 골라 주세요.');
    if (Math.min(originalWidth || width, originalHeight || height) < 160) issues.push('사진이 작아 세부를 확인하기 어렵습니다. 가까이 찍은 사진이면 더 좋아요.');
    if (count && mean < 30) issues.push('사진이 많이 어둡습니다. 실제 색을 직접 골라 주세요.');
    if (count && mean > 238) issues.push('사진이 많이 밝습니다. 실제 색을 직접 골라 주세요.');
    if (count && deviation < 5) issues.push('사진에서 옷의 구분이 어렵습니다. 한 벌이 보이는지 확인해 주세요.');
    return { issues, canSuggestColor: count > 0 && mean >= 30 && mean <= 238 && deviation >= 5 };
  }
  function rect(a, b, width, height) {
    const clamp = (v, hi) => Math.max(0, Math.min(hi, Number.isFinite(v) ? v : 0));
    const x = clamp(Math.min(a.x, b.x), width), y = clamp(Math.min(a.y, b.y), height);
    return { x, y, width: clamp(Math.max(a.x, b.x), width) - x, height: clamp(Math.max(a.y, b.y), height) - y };
  }
  return { quality, rect };
});
