// Two separate answers to "should I buy this when I own something similar?":
// what it adds to what I can wear, and what it adds to what I collect.
//
// They are never folded into one score. The user's stated purpose decides
// which answer leads, and owning something similar is not a penalty when the
// purpose is 소장. Rarity (단종·한정) is only shown when a seller or brand says
// so; this module never infers it.
import { CHOICES, CHOICE_LABELS, PURPOSES, detailKey, garmentShape } from './garment-profile.js';

// Colors people usually call "the same" on a rail. Editorial and conservative.
const NEAR_COLORS = [
  ['white', 'ivory'], ['ivory', 'beige'], ['navy', 'indigo'],
  ['charcoal', 'black'], ['grey', 'charcoal'], ['olive', 'green'],
];
export function colorMatch(a, b) {
  if (!a || !b) return 'unknown';
  if (a === b) return 'same';
  return NEAR_COLORS.some(([x, y]) => (x === a && y === b) || (x === b && y === a)) ? 'near' : 'different';
}

const sameText = (a, b) => detailKey(a) === detailKey(b);
const ATTRS = ['silhouette', 'fabric', 'thickness', 'surface', 'pattern'];
function attrText(key, attr) {
  if (!attr) return null;
  return key === 'fabric' ? attr.value : CHOICES[key][attr.value];
}

// Attribute by attribute: same, different or unknown. Details are compared as
// sets; a detail recorded on only one side is a difference only if the other
// side has details recorded at all.
export function detailDiff(candidate, owned) {
  const attrs = ATTRS.map((key) => {
    const c = candidate?.[key];
    const o = owned?.[key];
    let state = 'unknown';
    if (c && o) state = key === 'fabric' ? (sameText(c.value, o.value) ? 'same' : 'different') : c.value === o.value ? 'same' : 'different';
    return { key, label: CHOICE_LABELS[key], candidate: attrText(key, c), owned: attrText(key, o), state };
  });
  const cDetails = candidate?.details || [];
  const oDetails = owned?.details || [];
  const has = (list, d) => list.some((x) => sameText(x.text, d.text));
  return {
    attrs,
    onlyCandidate: oDetails.length ? cDetails.filter((d) => !has(oDetails, d)).map((d) => d.text) : [],
    onlyOwned: cDetails.length ? oDetails.filter((d) => !has(cDetails, d)).map((d) => d.text) : [],
    detailsUnknown: !cDetails.length || !oDetails.length,
  };
}

// Owned garments of the same shape and a same or near color. A missing color
// keeps the garment in the list, marked, because "not similar" would be a guess.
export function similarOwned(candidate, owned) {
  const shape = garmentShape(candidate);
  if (!shape) return [];
  return (owned || [])
    .filter((g) => garmentShape(g) === shape)
    .map((g) => ({ garment: g, color: colorMatch(candidate.color, g.color), diff: detailDiff(candidate.profile, g.profile) }))
    .filter((s) => s.color !== 'different')
    .sort((a, b) => ['same', 'near', 'unknown'].indexOf(a.color) - ['same', 'near', 'unknown'].indexOf(b.color));
}

const seriesKey = (s) => (typeof s === 'string' && s.trim() ? detailKey(s) : null);

// newOutfits comes from the outfit engine (null when not computed). purpose is
// the user's choice for this candidate, or null when they have not said.
export function valueAxes({ candidate, owned, purpose = null, newOutfits = null }) {
  if (purpose !== null && !Object.hasOwn(PURPOSES, purpose)) throw new Error('목적을 다시 골라 주세요.');
  const similar = similarOwned(candidate, owned);
  const closest = similar[0];
  const differences = closest
    ? [...closest.diff.attrs.filter((a) => a.state === 'different').map((a) => a.label), ...closest.diff.onlyCandidate]
    : [];
  const series = candidate.profile?.series || null;
  const inSeries = seriesKey(series)
    ? (owned || []).filter((g) => seriesKey(g.profile?.series) === seriesKey(series)).length
    : 0;
  const usage = { newOutfits, similarCount: similar.length };
  const collection = { series, owned: inSeries, position: series ? inSeries + 1 : null };

  const similarLine = !similar.length
    ? '비슷한 옷은 없어요.'
    : differences.length
      ? `비슷한 옷 ${similar.length}벌: 다른 점은 ${differences.join('·')}.`
      : `비슷한 옷 ${similar.length}벌: 기록된 차이는 없어요.`;
  const wearLine = newOutfits === null ? '착용용이면 새로 생기는 조합은 아직 계산 전이에요' : `착용용이면 새 조합 +${newOutfits}`;
  const collectLine = series ? `소장용이면 '${series}' ${collection.position}번째` : '소장용이면 비슷한 옷이 있어도 감점하지 않아요';
  const order = purpose === 'collect' ? [collectLine, wearLine] : [wearLine, collectLine];
  return {
    similar,
    differences,
    usage,
    collection,
    summary: `${similarLine} ${order.join(', ')}.`,
    // Only a wear-only purchase with nothing recorded as different is flagged.
    duplicateWarning: purpose === 'wear' && similar.length > 0 && differences.length === 0,
  };
}

// A collected garment that is rarely worn is not a failed purchase.
export function wearExpectation(purpose) {
  return purpose === 'collect' ? 'not-expected' : 'expected';
}

export function costPerWear(price, wearCount) {
  if (!(Number.isFinite(price) && price > 0 && Number.isInteger(wearCount) && wearCount > 0)) return null;
  return Math.round(price / wearCount);
}

// Shelves by the user's own series names. An empty slot exists only when the
// user set a target for that series; the app never invents collection goals.
export function seriesShelves(owned, goals = []) {
  const shelves = new Map();
  for (const g of owned || []) {
    const key = seriesKey(g.profile?.series);
    if (!key) continue;
    if (!shelves.has(key)) shelves.set(key, { name: g.profile.series.trim(), items: [], target: null });
    shelves.get(key).items.push(g);
  }
  for (const goal of goals) {
    const key = seriesKey(goal?.series);
    if (!key || !Number.isInteger(goal.target) || goal.target < 1 || goal.target > 100) continue;
    if (!shelves.has(key)) shelves.set(key, { name: goal.series.trim(), items: [], target: null });
    shelves.get(key).target = goal.target;
  }
  return [...shelves.values()].map((s) => ({
    ...s,
    count: s.items.length,
    empty: s.target === null ? 0 : Math.max(0, s.target - s.items.length),
  }));
}
