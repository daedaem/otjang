import { COLORS } from './data/slots.js';
import { garmentKindName } from './wardrobe.js';

// Recipe names describe an example. The visible copy describes the garments actually selected.
export function outfitCopy(result, { demo = false } = {}) {
  const rows = (result?.items || []).filter((row) => row && (row.slot || row.item));
  const kind = (row) => garmentKindName(row.item?.kind || row.slot?.shape);
  const main = rows.filter((row) => !['acc', 'inner'].includes(row.role));
  const title = result?.basic ? result.look.title
    : [...new Set((main.length ? main : rows).map(kind))].join(' · ') || '옷 조합';
  const labels = rows.map((row) => {
    // The engine leaves unverified photo colours empty. Do not recover them from the product.
    const color = row.certainty !== 'uncertain' && row.color && COLORS[row.color]?.label;
    const name = row.item?.label || kind(row);
    const owner = row.owned ? (demo ? '예시' : '내') : '후보';
    return `${owner} ${[color, name].filter(Boolean).join(' ')}${row.certainty === 'uncertain' ? '(종류 확인 필요)' : ''}`;
  });
  return { title, note: labels.length ? `${labels.join(' · ')} 조합이에요.` : '구성 옷을 확인해 주세요.' };
}
