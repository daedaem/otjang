// Where each owned garment hangs on the closet rails, and how tall it is drawn.
//
// Three rails (아우터·상의·하의) carry garments on hangers; dresses hang on the
// top rail; shoes and accessories go on a shelf instead. A measured length sets
// the drawn height on a scale shared by every rail, so the rail shows real
// length differences. An unmeasured garment gets a placeholder height and is
// marked, so the screen can say "실측 없음" rather than imply a length.
import { COLORS } from './data/slots.js';
import { garmentCategory } from './garment-profile.js';

export const RAILS = [
  { id: 'outer', label: '아우터', cats: ['outer'] },
  { id: 'top', label: '상의', cats: ['top', 'dress'] },
  { id: 'bottom', label: '하의', cats: ['bottom'] },
];
export const SORTS = { recent: '최근 넣은 옷', color: '색', worn: '많이 입은 옷', brand: '브랜드', series: '컬렉션' };
const COLOR_ORDER = Object.keys(COLORS);

const lengthOf = (g) => {
  const cm = g.profile?.measures?.length?.cm;
  return Number.isFinite(cm) ? cm : null;
};
const addedAt = (g) => (typeof g.addedAt === 'string' ? g.addedAt : '');

function sorter(sort, wearCounts) {
  const byRecent = (a, b) => addedAt(b.g).localeCompare(addedAt(a.g)) || b.i - a.i;
  switch (sort) {
    case 'color':
      return (a, b) =>
        (COLOR_ORDER.indexOf(a.g.color) + 1 || 99) - (COLOR_ORDER.indexOf(b.g.color) + 1 || 99) || byRecent(a, b);
    case 'worn':
      return (a, b) => (wearCounts[b.g.id] || 0) - (wearCounts[a.g.id] || 0) || byRecent(a, b);
    case 'brand':
      return (a, b) => (a.g.brand || '￿').localeCompare(b.g.brand || '￿', 'ko') || byRecent(a, b);
    case 'series':
      return (a, b) =>
        (a.g.profile?.series || '￿').localeCompare(b.g.profile?.series || '￿', 'ko') || byRecent(a, b);
    default:
      return byRecent;
  }
}

// garments: [{ id, kind|slot, color, brand?, addedAt?, profile? }]
// wearCounts: { [garmentId]: number } from the user's wear records.
export function railLayout(garments, { sort = 'recent', wearCounts = {}, tallestPx = 220, placeholderRatio = 0.7 } = {}) {
  if (!Object.hasOwn(SORTS, sort)) throw new Error('정렬 기준을 다시 골라 주세요.');
  const onRails = [];
  const shelf = [];
  (garments || []).forEach((g, i) => {
    const cat = garmentCategory(g);
    const rail = RAILS.find((r) => r.cats.includes(cat));
    (rail ? onRails : shelf).push({ g, i, rail: rail?.id });
  });
  const longest = Math.max(0, ...onRails.map(({ g }) => lengthOf(g) ?? 0));
  const pxPerCm = longest ? tallestPx / longest : null;
  const placeholder = Math.round(tallestPx * placeholderRatio);
  const cmp = sorter(sort, wearCounts);
  return {
    pxPerCm,
    rails: RAILS.map((r) => ({
      id: r.id,
      label: r.label,
      items: onRails
        .filter((x) => x.rail === r.id)
        .sort(cmp)
        .map(({ g }) => {
          const cm = lengthOf(g);
          return { id: g.id, measured: cm !== null, heightPx: cm !== null && pxPerCm ? Math.round(cm * pxPerCm) : placeholder };
        }),
    })),
    shelf: shelf.sort(cmp).map(({ g }) => ({ id: g.id })),
  };
}
