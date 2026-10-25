// Compares a candidate's flat-lay measurements with a garment the user knows fits.
//
// The numbers say how two garments differ, not how one will feel on the body.
// The words come from editorial thresholds (SAME_CM, LITTLE_CM), and every
// result carries NOTE so a screen never presents it as a fit guarantee.
import { MEASURES, measureFieldsFor, garmentCategory, garmentShape } from './garment-profile.js';

export const SAME_CM = 1; // a size chart and a tape usually differ by about this much
export const LITTLE_CM = 4; // up to this difference is "조금"
export const NOTE = '실측 숫자를 비교한 결과예요. 착용감이나 핏을 보장하지는 않아요.';

// [more, less] × [connective, final]
const WORDS = {
  length: [['길고', '길어요'], ['짧고', '짧아요']],
  shoulder: [['어깨가 넓고', '어깨가 넓어요'], ['어깨가 좁고', '어깨가 좁아요']],
  chest: [['여유 있고', '여유 있어요'], ['타이트하고', '타이트해요']],
  sleeve: [['소매가 길고', '소매가 길어요'], ['소매가 짧고', '소매가 짧아요']],
  waist: [['허리가 넉넉하고', '허리가 넉넉해요'], ['허리가 작고', '허리가 작아요']],
  thigh: [['허벅지가 넉넉하고', '허벅지가 넉넉해요'], ['허벅지가 붙고', '허벅지가 붙어요']],
  hem: [['밑단이 넓고', '밑단이 넓어요'], ['밑단이 좁고', '밑단이 좁아요']],
  rise: [['밑위가 깊고', '밑위가 깊어요'], ['밑위가 얕고', '밑위가 얕아요']],
};
const MAX_PHRASES = 3;

function cmOf(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  return typeof value?.cm === 'number' && Number.isFinite(value.cm) ? value.cm : null;
}
const round1 = (n) => Math.round(n * 10) / 10;
const signed = (n) => (n > 0 ? `+${n}` : `${n}`);

// candidate/reference: { length: { cm, source } | number, ... }
export function compareMeasures(candidate, reference, item) {
  const rows = measureFieldsFor(item).map((key) => {
    const c = cmOf(candidate?.[key]);
    const r = cmOf(reference?.[key]);
    if (c === null || r === null) return { key, label: MEASURES[key], candidate: c, reference: r, diff: null, word: null };
    const diff = round1(c - r);
    const word = Math.abs(diff) <= SAME_CM ? 'same' : diff > 0 ? 'more' : 'less';
    return { key, label: MEASURES[key], candidate: c, reference: r, diff, word };
  });
  const shared = rows.filter((r) => r.diff !== null);
  if (!shared.length)
    return { rows, shared: 0, factLine: null, sentence: null, reason: '두 옷에 같이 잰 실측이 없어 비교하지 못했어요.', note: NOTE };
  const factLine = shared.map((r) => (r.word === 'same' ? `${r.label} 같음` : `${r.label} ${signed(r.diff)}cm`)).join(' · ');
  const differing = shared.filter((r) => r.word !== 'same').sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff)).slice(0, MAX_PHRASES);
  let sentence;
  if (!differing.length) sentence = '내 기준 옷과 실측이 거의 같아요.';
  else {
    const order = measureFieldsFor(item);
    differing.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
    const parts = differing.map((r, i) => {
      const [connective, final] = WORDS[r.key][r.word === 'more' ? 0 : 1];
      return `${Math.abs(r.diff) <= LITTLE_CM ? '조금 ' : ''}${i === differing.length - 1 ? final : connective}`;
    });
    sentence = `내 기준 옷보다 ${parts.join(' ')}.`;
  }
  return { rows, shared: shared.length, factLine, sentence, reason: null, note: NOTE };
}

// Which size option is numerically closest to the reference garment. Needs at
// least two shared measurements; otherwise it names no size.
export function closestSize(options, reference, item) {
  const ranked = (options || []).map((opt, index) => {
    const cmp = compareMeasures(opt.measures, reference, item);
    const diffs = cmp.rows.filter((r) => r.diff !== null).map((r) => Math.abs(r.diff));
    const meanDiff = diffs.length ? round1(diffs.reduce((s, d) => s + d, 0) / diffs.length) : null;
    return { label: opt.label, index, shared: diffs.length, meanDiff, comparison: cmp };
  });
  const usable = ranked.filter((r) => r.shared >= 2).sort((a, b) => a.meanDiff - b.meanDiff || a.index - b.index);
  if (!usable.length)
    return { ranked, best: null, reason: '기준 옷과 같이 잰 실측이 2개 이상인 사이즈가 없어요.', note: NOTE };
  const tied = usable.filter((r) => r.meanDiff === usable[0].meanDiff);
  return {
    ranked: [...usable, ...ranked.filter((r) => r.shared < 2)],
    best: tied.length === 1 ? usable[0].label : null,
    reason: tied.length === 1 ? null : `${tied.map((r) => r.label).join('·')}의 차이가 같아요. 직접 비교해 주세요.`,
    note: NOTE,
  };
}

// ── Flat sketch ──────────────────────────────────────────────────────────────
// Outline in centimetres (x centred on 0, y downward from the top edge) drawn
// from the measurements. Proportions that size charts do not state (neck
// width, sleeve angle, crotch overlap) are fixed drawing conventions, so two
// garments drawn together differ only where their numbers differ. A missing
// measurement the outline needs is filled by a convention and listed in
// `assumed`, so the screen can say so.
const SLEEVE_ANGLE = (50 * Math.PI) / 180;

function topSketch(m, assumed, { sleeves = true } = {}) {
  const L = m.length;
  const c = m.chest;
  const s = m.shoulder ?? (assumed.push('shoulder'), c);
  const neck = s * 0.36;
  const drop = s * 0.08;
  const armpit = drop + c * 0.42;
  const pts = [];
  const left = [];
  left.push([-neck / 2, 0], [-s / 2, drop]);
  if (sleeves && m.sleeve) {
    const [dx, dy] = [-Math.cos(SLEEVE_ANGLE), Math.sin(SLEEVE_ANGLE)];
    const cuff = c * 0.28;
    const end = [-s / 2 + dx * m.sleeve, drop + dy * m.sleeve];
    left.push(end, [end[0] + Math.sin(SLEEVE_ANGLE) * cuff, end[1] + Math.cos(SLEEVE_ANGLE) * cuff]);
  } else if (sleeves) assumed.push('sleeve');
  left.push([-c / 2, armpit], [-c / 2, L]);
  pts.push(...left, ...left.slice().reverse().map(([x, y]) => [-x, y]));
  return { pts, neck: neck * 0.5, shoulder: s, drop, armpit };
}

function dressSketch(m, assumed) {
  const top = topSketch(m, assumed, { sleeves: false });
  const L = m.length;
  const c = m.chest;
  const waistY = top.armpit + (L - top.armpit) * 0.35;
  const w = m.waist ?? (assumed.push('waist'), c * 0.85);
  const hem = c * 1.1; // drawing convention: dresses flare slightly below the waist
  const left = [top.pts[0], top.pts[1], [-c / 2, top.armpit], [-w / 2, waistY], [-hem / 2, L]];
  return { pts: [...left, ...left.slice().reverse().map(([x, y]) => [-x, y])], neck: top.neck };
}

function pantsSketch(m, assumed) {
  const L = m.length;
  const W = m.waist / 2;
  const r = m.rise ?? (assumed.push('rise'), L * 0.27);
  const t = m.thigh ?? (assumed.push('thigh'), m.waist * 0.62);
  const h = m.hem ?? (assumed.push('hem'), t * 0.65);
  const outer = Math.max(W, t * 0.8); // legs overlap at the crotch in a flat lay
  const legC = Math.max(t * 0.3, h / 2 + 1.5); // inner hem edges stay apart
  return {
    pts: [
      [-W, 0], [W, 0], [outer, r], [legC + h / 2, L], [legC - h / 2, L],
      [0, r], [-legC + h / 2, L], [-legC - h / 2, L], [-outer, r],
    ],
  };
}

function skirtSketch(m, assumed) {
  const W = m.waist / 2;
  const H = (m.hem ?? (assumed.push('hem'), m.waist * 1.2)) / 2;
  return { pts: [[-W, 0], [W, 0], [H, m.length], [-H, m.length]] };
}

const fmt = (n) => String(Math.round(n * 10) / 10);
function toPath({ pts, neck }) {
  if (!neck) return `M ${pts.map(([x, y]) => `${fmt(x)} ${fmt(y)}`).join(' L ')} Z`;
  // Tops start at the left neck point and close with a neckline curve.
  const body = pts.map(([x, y]) => `${fmt(x)} ${fmt(y)}`).join(' L ');
  return `M ${body} Q 0 ${fmt(neck)} ${fmt(pts[0][0])} ${fmt(pts[0][1])} Z`;
}

export function flatSketch(item, measures) {
  const m = Object.fromEntries(Object.entries(measures || {}).map(([k, v]) => [k, cmOf(v)]).filter(([, v]) => v !== null));
  const cat = garmentCategory(item);
  const assumed = [];
  let shape;
  if (garmentShape(item) === 'skirt') {
    if (!m.length || !m.waist) return null;
    shape = { type: 'skirt', ...skirtSketch(m, assumed) };
  } else if (cat === 'bottom') {
    if (!m.length || !m.waist) return null;
    shape = { type: 'pants', ...pantsSketch(m, assumed) };
  } else if (cat === 'dress') {
    if (!m.length || !m.chest) return null;
    shape = { type: 'dress', ...dressSketch(m, assumed) };
  } else if (cat === 'top' || cat === 'outer') {
    if (!m.length || !m.chest) return null;
    shape = { type: 'top', ...topSketch(m, assumed) };
  } else return null;
  const xs = shape.pts.map(([x]) => x);
  const ys = shape.pts.map(([, y]) => y);
  return {
    type: shape.type,
    path: toPath(shape),
    bounds: { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(0, ...ys), maxY: Math.max(...ys) },
    assumed: assumed.map((k) => MEASURES[k]),
  };
}

// Two outlines on one scale, for an SVG viewBox in centimetres.
export function overlaySketches(item, candidate, reference, { pad = 4 } = {}) {
  const a = flatSketch(item, candidate);
  const b = flatSketch(item, reference);
  if (!a || !b) return null;
  const minX = Math.min(a.bounds.minX, b.bounds.minX) - pad;
  const maxX = Math.max(a.bounds.maxX, b.bounds.maxX) + pad;
  const minY = Math.min(a.bounds.minY, b.bounds.minY) - pad;
  const maxY = Math.max(a.bounds.maxY, b.bounds.maxY) + pad;
  return {
    candidate: a,
    reference: b,
    viewBox: [minX, minY, maxX - minX, maxY - minY].map(fmt).join(' '),
  };
}
