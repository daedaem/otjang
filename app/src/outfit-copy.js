import { COLORS } from './data/slots.js';
import { garmentKindName } from './wardrobe.js';

// Recipe names describe an example. The visible copy describes the garments actually selected.
export function outfitCopy(result) {
  const rows = (result?.items || []).filter((row) => row && (row.slot || row.item));
  const kind = (row) => garmentKindName(row.item?.kind || row.slot?.shape);
  const main = rows.filter((row) => !['acc', 'inner'].includes(row.role));
  const title = result?.basic ? result.look.title
    : [...new Set((main.length ? main : rows).map(kind))].join(' · ') || '옷 조합';
  const labels = rows.map((row) => {
    // The engine leaves unverified photo colours empty. Do not recover them from the product.
    const color = row.color && COLORS[row.color]?.label;
    return [color, kind(row)].filter(Boolean).join(' ');
  });
  return { title, note: labels.length ? `${labels.join(' · ')} 조합이에요.` : '구성 옷을 확인해 주세요.' };
}
