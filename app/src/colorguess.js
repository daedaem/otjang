/*
 * ColorGuess — 옷 사진에서 색 계열과 밝기의 "초안"을 뽑는다. 브라우저 캔버스 픽셀만 쓰고, AI·외부 요청이 없다(0원).
 * 사진 가운데(가로 20~80%, 세로 15~85%)의 픽셀을 색 상자(HSL 구간)로 묶어 가장 많은 상자의 평균색을 대표색으로 삼는다.
 * 결과는 사용자가 확인하기 전까지 '사진에서 뽑은 초안'(attrSource photo-draft)이다. 조명·그림자·배경 때문에 틀릴 수 있고, 종류·무늬·격식은 추정하지 않는다.
 *
 *  guess(data, w, h) → { family, light, rgb: [r, g, b], share: 대표 상자의 비율(0~1), note }   data: RGBA Uint8ClampedArray (ImageData.data)
 *  familyOf(h, s, l) → 색 계열 (hue 0~360, s·l 0~1).  rgbToHsl(r, g, b) → [h, s, l]
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ColorGuess = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
    if (d < 1e-6) return [0, 0, l];
    const s = d / (1 - Math.abs(2 * l - 1));
    let h;
    if (max === r) h = ((g - b) / d) % 6; else if (max === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
    return [h, Math.min(1, s), l];
  }

  /** 거의 흰색·검정·회색인지. HSL 의 채도는 아주 밝거나 어두운 색에서 커지므로 색도(chroma = max−min)도 함께 본다. */
  const achromatic = (s, l) => s < 0.14 || s * (1 - Math.abs(2 * l - 1)) < 0.08;

  /** HSL → 앱의 색 계열 이름(wardrobe.js FAM). 인디고는 자동으로 고르지 않는다(네이비로 두고 사용자가 바꾼다). */
  function familyOf(h, s, l) {
    if (achromatic(s, l)) {
      if (l >= 0.88) return 'white';
      if (l <= 0.18) return 'black';
      return 'gray';
    }
    if (h >= 30 && h < 60 && s < 0.4 && l >= 0.85) return 'ivory';
    if (h < 15 || h >= 345) return l < 0.35 ? 'burgundy' : l >= 0.7 && s >= 0.25 ? 'pink' : 'red';
    if (h < 45) return s >= 0.6 && l >= 0.4 && l < 0.8 ? 'orange' : l >= 0.68 ? 'beige' : l >= 0.5 ? 'khaki' : 'brown';   // 채도가 높을 때만 오렌지. 베이지·카키·브라운은 채도가 낮다
    if (h < 75) return h < 70 && s >= 0.55 && l >= 0.45 && l < 0.85 ? 'yellow' : l >= 0.68 ? 'beige' : l >= 0.5 ? 'khaki' : 'olive';
    if (h < 165) return s < 0.45 && l < 0.55 ? 'olive' : 'green';
    if (h < 200) return l > 0.6 ? 'blue' : 'green';
    if (h < 250) return l >= 0.55 ? 'blue' : l < 0.32 ? 'navy' : s >= 0.5 ? 'blue' : 'navy';
    if (h < 290) return 'purple';
    return l < 0.3 ? 'burgundy' : l >= 0.6 || h >= 320 ? 'pink' : 'purple';                       // 자주·마젠타 구간: 밝으면 핑크, 아주 어두우면 버건디
  }

  /**
   * data: RGBA 바이트(길이 w*h*4). 가운데 영역을 최대 4096점 표본으로 본다. 표본이 없으면 null.
   */
  function guess(data, w, h) {
    if (!data || !w || !h || data.length < w * h * 4) return null;
    const x0 = Math.floor(w * 0.2), x1 = Math.max(x0 + 1, Math.ceil(w * 0.8)), y0 = Math.floor(h * 0.15), y1 = Math.max(y0 + 1, Math.ceil(h * 0.85));
    const n = (x1 - x0) * (y1 - y0), stride = Math.max(1, Math.floor(Math.sqrt(n / 4096)));
    const bins = new Map();
    let total = 0;
    for (let y = y0; y < y1; y += stride) for (let x = x0; x < x1; x += stride) {
      const i = (y * w + x) * 4;
      if (data[i + 3] < 128) continue;
      const r = data[i], g = data[i + 1], b = data[i + 2], hsl = rgbToHsl(r, g, b);
      // 상자: 무채색은 밝기 구간만, 유채색은 색상 15도 × 채도 3단 × 밝기 5단
      const key = achromatic(hsl[1], hsl[2]) ? 'n' + Math.floor(hsl[2] * 5) : Math.floor(hsl[0] / 15) + ':' + (hsl[1] < 0.3 ? 0 : hsl[1] < 0.6 ? 1 : 2) + ':' + Math.floor(hsl[2] * 5);
      let bin = bins.get(key);
      if (!bin) { bin = { count: 0, r: 0, g: 0, b: 0 }; bins.set(key, bin); }
      bin.count++; bin.r += r; bin.g += g; bin.b += b; total++;
    }
    if (!total) return null;
    let best = null;
    for (const bin of bins.values()) if (!best || bin.count > best.count) best = bin;
    const rgb = [Math.round(best.r / best.count), Math.round(best.g / best.count), Math.round(best.b / best.count)];
    const hsl = rgbToHsl(rgb[0], rgb[1], rgb[2]);
    return { family: familyOf(hsl[0], hsl[1], hsl[2]), light: Math.max(0, Math.min(100, Math.round(hsl[2] * 100))), rgb, share: best.count / total,
      note: '사진 가운데 색을 보고 고른 초안입니다. 조명과 그림자 때문에 실제와 다를 수 있어요. 종류·무늬·격식은 직접 골라 주세요.' };
  }

  const hex = (rgb) => '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('');

  return { guess, familyOf, rgbToHsl, hex };
});
