// 브라우저에서 만드는 원단: 무채색 결 그림(Blender 쪽 gfabric.py로 만든 옥스퍼드·능직·홉색·코듀로이)에 색을 곱한다.
// 종류·색·무늬로 그린 근사치이지 특정 상품의 재현이 아니다. 로고·그래픽은 그리지 않는다.
import * as THREE from 'three';

const PX = 1024;                                                                                   // 결 그림 한 변(10.24cm)
const cache = new Map();                                                                           // 결 그림 픽셀 (결마다 한 번만 푼다)

function hex(c) { const n = parseInt(String(c).replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
const lum = (rgb) => (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

/** 결 그림(webp 바이트) → 밝기 배열(0~255, PX×PX). */
async function weaveLum(name, bytes) {
  if (cache.has(name)) return cache.get(name);
  const p = createImageBitmap(new Blob([bytes], { type: 'image/webp' }), { colorSpaceConversion: 'none' }).then((img) => {
    const c = document.createElement('canvas'); c.width = c.height = PX; const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0, PX, PX); const d = g.getImageData(0, 0, PX, PX).data; const L = new Uint8Array(PX * PX);
    for (let i = 0; i < L.length; i++) L[i] = d[4 * i];
    let s = 0; for (let i = 0; i < L.length; i++) s += L[i];
    return { L, mean: s / L.length };
  });
  cache.set(name, p); return p;
}

/**
 * spec: { color: '#rrggbb', pattern: 'solid' | 'stripe' | 'check', accent: '#rrggbb'(줄무늬·체크의 둘째 색, 없으면 색에서 만든다) }
 * weave: { name, bytes }   → THREE.CanvasTexture (sRGB, 반복)
 */
export async function makeFabric(spec, weave, repeat) {
  const { L, mean } = await weaveLum(weave.name, weave.bytes);
  const base = hex(spec.color || '#9a9a9a');
  const light = lum(base);
  // 어두운 색일수록 실의 명암 대비가 크게 보인다(염색된 실은 결이 깊어 보임): 밝기 지수를 색에 따라 둔다
  const k = light > 0.75 ? 0.75 : light > 0.45 ? 1.0 : light > 0.2 ? 1.35 : 1.6;
  const accent = spec.accent ? hex(spec.accent) : (light > 0.55 ? mix(base, [20, 32, 70], 0.75) : mix(base, [240, 240, 236], 0.78));
  const c = document.createElement('canvas'); c.width = c.height = PX; const g = c.getContext('2d');
  const img = g.createImageData(PX, PX), D = img.data;
  // 무늬: 색 배치 (줄무늬 = 3.9mm 주기 세로 띠, 체크 = 2.6cm 격자 + 가는 선)
  const stripeP = PX / 26, checkP = PX / 4, line = Math.round(PX / 64);
  const colorAt = (x, y) => {
    if (spec.pattern === 'stripe') return (Math.floor(x / stripeP) % 2) ? base : accent;
    if (spec.pattern === 'check') {
      const bx = Math.floor(x / checkP) % 2, by = Math.floor(y / checkP) % 2;
      const onLine = (x % checkP) < line || (y % checkP) < line;
      if (onLine) return mix(accent, base, 0.35);
      return bx === by ? base : mix(base, accent, 0.45);
    }
    return base;
  };
  const gain = new Float32Array(256); for (let v = 0; v < 256; v++) gain[v] = Math.pow(v / mean, k);
  for (let y = 0, i = 0; y < PX; y++) for (let x = 0; x < PX; x++, i++) {
    const col = colorAt(x, y), gn = gain[L[i]];
    D[4 * i] = Math.min(255, col[0] * gn); D[4 * i + 1] = Math.min(255, col[1] * gn); D[4 * i + 2] = Math.min(255, col[2] * gn); D[4 * i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;   // flipY 기본값(true): 구운 원단 그림과 같은 방향
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / repeat[0], 1 / repeat[1]);
  return t;
}

/** 색 계열·밝기(0~100)를 sRGB 색으로. 앱의 색 칩과 같은 계산(hsl)이라 카드와 3D 색이 맞는다. */
export function familyColor(hue, sat, light) {
  const l = Math.max(6, Math.min(96, light * 0.9 + 5)) / 100, s = sat / 100;
  const c = new THREE.Color().setHSL(hue / 360, s, l, THREE.SRGBColorSpace);
  return '#' + c.getHexString();
}
