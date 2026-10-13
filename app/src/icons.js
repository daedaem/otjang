// 상품 사진이 없거나 내 옷(사진 없음)을 보여 줄 때 쓰는 단순한 옷 그림.

const SHAPES = {
  shirt: 'M30 18 L42 12 L50 20 L58 12 L70 18 L86 30 L78 44 L70 40 L70 88 L30 88 L30 40 L22 44 L14 30 Z M50 20 L50 88',
  tee: 'M32 16 L42 12 Q50 20 58 12 L68 16 L88 30 L80 44 L70 38 L70 88 L30 88 L30 38 L20 44 L12 30 Z',
  longtee: 'M32 16 L42 12 Q50 20 58 12 L68 16 L84 26 L90 70 L80 72 L70 38 L70 88 L30 88 L30 38 L20 72 L10 70 L16 26 Z',
  polo: 'M32 16 L42 12 L50 22 L58 12 L68 16 L88 30 L80 44 L70 38 L70 88 L30 88 L30 38 L20 44 L12 30 Z M50 22 L50 36',
  knit: 'M32 16 L42 12 Q50 18 58 12 L68 16 L84 26 L90 72 L80 74 L70 40 L70 86 L30 86 L30 40 L20 74 L10 72 L16 26 Z M30 80 L70 80',
  sweat: 'M32 16 L42 12 Q50 18 58 12 L68 16 L84 26 L90 72 L80 74 L70 40 L70 86 L30 86 L30 40 L20 74 L10 72 L16 26 Z M30 80 L70 80',
  cardigan: 'M32 14 L44 12 L50 40 L56 12 L68 14 L84 26 L90 74 L80 76 L70 40 L70 88 L30 88 L30 40 L20 76 L10 74 L16 26 Z M50 40 L50 88',
  blazer: 'M30 14 L42 10 L50 44 L58 10 L70 14 L86 26 L90 80 L78 82 L72 42 L72 90 L28 90 L28 42 L22 82 L10 80 L14 26 Z M42 10 L36 30 L44 34 M58 10 L64 30 L56 34 M50 44 L50 90',
  jacket: 'M30 14 L42 10 Q50 16 58 10 L70 14 L86 26 L90 74 L78 76 L72 42 L72 80 L28 80 L28 42 L22 76 L10 74 L14 26 Z M50 14 L50 80',
  coat: 'M32 10 L42 8 L50 34 L58 8 L68 10 L84 24 L88 80 L78 82 L74 40 L76 94 L24 94 L26 40 L22 82 L12 80 L16 24 Z M50 34 L50 94',
  down: 'M30 12 L42 8 Q50 14 58 8 L70 12 L86 26 L90 76 L78 78 L72 42 L72 84 L28 84 L28 42 L22 78 L10 76 L14 26 Z M28 36 L72 36 M28 52 L72 52 M28 68 L72 68 M50 12 L50 84',
  pants: 'M30 10 L70 10 L74 92 L56 92 L50 34 L44 92 L26 92 Z M30 18 L70 18',
  jeans: 'M30 10 L70 10 L74 92 L56 92 L50 34 L44 92 L26 92 Z M30 18 L70 18 M36 18 Q38 28 46 26',
  skirt: 'M34 12 L66 12 L80 88 L20 88 Z M34 20 L66 20',
  dress: 'M38 8 L44 8 Q50 16 56 8 L62 8 L66 30 L60 38 L78 90 L22 90 L40 38 L34 30 Z M40 38 L60 38',
  loafer: 'M12 62 Q14 48 30 48 L52 50 Q70 52 82 58 Q92 62 90 70 L88 74 L14 74 Z M40 52 L62 54',
  sneaker: 'M10 64 Q12 44 28 46 L44 50 Q60 46 76 56 Q92 60 90 70 L88 76 L12 76 Z M10 70 L90 70 M36 52 L40 60 M44 52 L48 60',
  boot: 'M30 20 L58 20 L60 56 Q80 58 88 66 L88 78 L28 78 Z M58 30 L60 50',
  cap: 'M18 58 Q20 26 50 24 Q80 26 82 58 Z M18 58 Q50 64 94 62 L92 68 Q50 72 18 64 Z',
  vest: 'M34 10 L44 10 Q50 30 56 10 L66 10 L72 30 L74 88 L26 88 L28 30 Z M50 30 L50 88',
  beanie: 'M20 66 Q20 22 50 20 Q80 22 80 66 Z M18 62 L82 62 L82 76 L18 76 Z',
  belt: 'M8 44 L92 44 L92 56 L8 56 Z M60 40 L74 40 L74 60 L60 60 Z',
  bag: 'M18 40 L82 40 L78 88 L22 88 Z M34 40 Q34 16 50 16 Q66 16 66 40',
};

function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const clamp = (v) => Math.max(0, Math.min(255, v));
  const r = clamp((n >> 16) + amount);
  const g = clamp(((n >> 8) & 255) + amount);
  const b = clamp((n & 255) + amount);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

export function garmentSvg(slot, { size = '100%', color = null } = {}) {
  const d = SHAPES[slot.shape] || SHAPES.tee;
  const fill = color || slot.color || '#cccccc';
  const n = parseInt(fill.slice(1), 16);
  const luma = 0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
  // 아주 밝거나 어두운 옷은 테마의 선 색으로 윤곽을 그려 배경에 묻히지 않게 한다
  const stroke = luma > 200 || luma < 60 ? 'var(--art-line)' : shade(fill, -40);
  let pattern = '';
  let fillRef = fill;
  if (slot.pattern === 'stripe' || slot.pattern === 'check') {
    const id = `p-${slot.id}-${fill.slice(1)}`;
    const lines = slot.pattern === 'stripe'
      ? `<rect width="10" height="10" fill="${fill}"/><rect width="10" height="3" fill="${shade(fill, 70)}"/>`
      : `<rect width="10" height="10" fill="${fill}"/><path d="M0 5H10M5 0V10" stroke="${shade(fill, 60)}" stroke-width="1.6"/>`;
    pattern = `<defs><pattern id="${id}" width="10" height="10" patternUnits="userSpaceOnUse">${lines}</pattern></defs>`;
    fillRef = `url(#${id})`;
  }
  return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" aria-hidden="true">${pattern}<path d="${d}" fill="${fillRef}" style="stroke:${stroke}" stroke-width="1.6" stroke-linejoin="round" fill-rule="evenodd"/></svg>`;
}

export const ICON = {
  search: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
  close: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  heart: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>',
  heartFill: '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>',
  sparkle: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/></svg>',
  eye: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  hanger: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 7a2 2 0 1 1 2-2c0 1.2-2 1.6-2 3v1"/><path d="M12 9L3 16.5c-.6.5-.3 1.5.5 1.5h17c.8 0 1.1-1 .5-1.5z"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17L17 7M9 7h8v8"/></svg>',
  check: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
  star: '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9 6.8 19.6l1-5.8-4.3-4.1 5.9-.9z"/></svg>',
  plus: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  camera: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  user: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>',
};
