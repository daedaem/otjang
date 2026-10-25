// Reads a size chart the user pasted (from a product page, or copied out of a
// chart image with the phone's text recognition) into flat-lay centimetres.
//
// It only reads what is written. A column it does not recognise is reported,
// not guessed; 둘레 (circumference) is halved to 단면 and inches converted, each
// with a warning. Nothing is fetched: the text comes from the user.
import { MEASURES, measureFieldsFor, measureOK } from './garment-profile.js';
import { josa } from './engine.js';

// Longest names first so "가슴단면" wins over "가슴".
const LABELS = [
  ['총기장', 'length'], ['총길이', 'length'], ['전체길이', 'length'], ['총장', 'length'], ['기장', 'length'], ['length', 'length'],
  ['어깨너비', 'shoulder'], ['어깨넓이', 'shoulder'], ['어깨단면', 'shoulder'], ['어깨', 'shoulder'], ['shoulder', 'shoulder'],
  ['가슴단면', 'chest'], ['가슴너비', 'chest'], ['가슴둘레', 'chest', 'circ'], ['가슴', 'chest'], ['chest', 'chest'],
  ['소매길이', 'sleeve'], ['소매기장', 'sleeve'], ['팔길이', 'sleeve'], ['소매', 'sleeve'], ['sleeve', 'sleeve'],
  ['허리단면', 'waist'], ['허리둘레', 'waist', 'circ'], ['허리', 'waist'], ['waist', 'waist'],
  ['허벅지단면', 'thigh'], ['허벅지둘레', 'thigh', 'circ'], ['허벅지', 'thigh'], ['thigh', 'thigh'],
  ['밑단단면', 'hem'], ['밑단너비', 'hem'], ['밑단둘레', 'hem', 'circ'], ['밑단', 'hem'], ['hem', 'hem'],
  ['앞밑위', 'rise'], ['밑위', 'rise'], ['rise', 'rise'],
];
// Columns that look like measurements but are not ours: never mapped onto one.
const KNOWN_OTHER = ['화장', '뒷밑위', '엉덩이', '힙', '암홀', '소매통', '소매단', '목둘레', '넥', '총장(뒤)', 'hip', 'inseam', '인심', '무릎'];
const SIZE_HEADERS = ['사이즈', '구분', '호칭', 'size', 'sizes', '(cm)', 'cm', '단위'];
const SIZE_LABEL = /^(?:x{0,3}s|m|x{0,4}l|[2-6]xl|free|프리|f|os|one ?size|\d{2,3}|[0-9]|w?\d{2}|\d{2,3}[a-z]?)$/i;
const NUMBER = /^(\d{1,3}(?:\.\d+)?)(?:cm|㎝)?$/i;

function normalize(text) {
  return String(text ?? '')
    .normalize('NFKC')
    .replace(/[|│┃,;]/g, '\t')
    .replace(/(가슴|어깨|허리|허벅지|밑단|소매|총)\s+(단면|너비|넓이|둘레|길이|기장|장)/g, '$1$2')
    .replace(/(앞|뒷)\s+밑위/g, '$1밑위')
    .replace(/one size/gi, 'onesize');
}
function cellsOf(line) {
  const byTab = line.split('\t').map((c) => c.trim()).filter(Boolean);
  const cells = byTab.length > 1 ? byTab : line.trim().split(/\s+/).filter(Boolean);
  return cells.map((c) => c.replace(/\s+/g, ''));
}
const bare = (cell) => cell.toLowerCase().replace(/\((?:cm|㎝|inch|인치)\)|(?:cm|㎝)$/g, '').replace(/[():]/g, '');
function labelOf(cell) {
  const lower = bare(cell);
  for (const [name, key, circ] of LABELS) if (lower === name) return { key, circ: !!circ };
  return null;
}
const isOther = (cell) => KNOWN_OTHER.includes(bare(cell));
const isSizeHeader = (cell) => SIZE_HEADERS.includes(cell.toLowerCase());
const numberOf = (cell) => {
  const m = cell.match(NUMBER);
  return m ? Number(m[1]) : null;
};
const isSizeLabel = (cell) => SIZE_LABEL.test(cell) && !labelOf(cell);

function finish(rawSizes, { inch, ignored, warnings }) {
  const sizes = [];
  const seenCirc = new Set();
  for (const { label, values } of rawSizes) {
    const measures = {};
    for (const { key, circ, value } of values) {
      let cm = inch ? value * 2.54 : value;
      if (circ) {
        cm /= 2;
        seenCirc.add(MEASURES[key]);
      }
      cm = Math.round(cm * 10) / 10;
      if (!measureOK(cm)) {
        warnings.push(`${label} ${MEASURES[key]} 값(${value})은 읽을 수 있는 범위가 아니라 뺐어요.`);
        continue;
      }
      measures[key] = cm;
    }
    if (Object.keys(measures).length) sizes.push({ label, measures });
  }
  if (inch) warnings.push('인치로 적힌 값을 cm로 바꿨어요(1인치 = 2.54cm).');
  if (seenCirc.size) {
    const names = [...seenCirc].join('·');
    warnings.push(`${names}${josa(names, '은', '는')} 둘레로 적혀 있어 반으로 나눠 단면으로 바꿨어요.`);
  }
  if (!sizes.length) warnings.push('사이즈표를 읽지 못했어요. 숫자를 직접 넣어 주세요.');
  return { unit: 'cm', sizes, ignored: [...new Set(ignored)], warnings };
}

// Rows are sizes: a header of measurement names, then "M 72 47 55 61".
function readRows(lines, h, ctx) {
  const header = cellsOf(lines[h]).filter((c) => !isSizeHeader(c));
  const cols = header.map((c) => labelOf(c) || (ctx.ignored.push(c), null));
  const sizes = [];
  for (const line of lines.slice(h + 1)) {
    const cells = cellsOf(line);
    if (cells.length < 2) continue;
    const [label, ...rest] = cells;
    const nums = rest.map(numberOf);
    if (!isSizeLabel(label) || nums.some((n) => n === null)) continue;
    if (nums.length !== cols.length) {
      ctx.warnings.push(`${label} 줄의 숫자 개수가 머리글과 달라 뺐어요.`);
      continue;
    }
    sizes.push({ label: label.toUpperCase(), values: cols.map((col, i) => col && { ...col, value: nums[i] }).filter(Boolean) });
  }
  return sizes;
}

// Columns are sizes: "구분 S M L", then "총장 70 72 74".
function readColumns(lines, ctx) {
  let labels = null;
  const rows = [];
  for (const line of lines) {
    const cells = cellsOf(line);
    const rest = cells.slice(isSizeHeader(cells[0] || '') ? 1 : 0);
    if (!labels && rest.length >= 2 && rest.every(isSizeLabel)) {
      labels = rest.map((c) => c.toUpperCase());
      continue;
    }
    const label = labelOf(cells[0] || '');
    if (!label) {
      if (cells[0] && isOther(cells[0])) ctx.ignored.push(cells[0]);
      continue;
    }
    const nums = cells.slice(1).map(numberOf);
    if (!nums.length || nums.some((n) => n === null)) continue;
    rows.push({ ...label, nums });
  }
  if (!labels || !rows.length) return [];
  return labels.map((label, i) => ({
    label,
    values: rows.filter((r) => r.nums.length === labels.length).map((r) => ({ key: r.key, circ: r.circ, value: r.nums[i] })),
  }));
}

// One size per line: "M 총장 72 어깨 47 가슴 55".
function readPairs(lines, ctx) {
  const sizes = [];
  for (const line of lines) {
    const cells = cellsOf(line);
    if (cells.length < 3 || !isSizeLabel(cells[0])) continue;
    const values = [];
    for (let i = 1; i + 1 < cells.length; i += 2) {
      const label = labelOf(cells[i]);
      const value = numberOf(cells[i + 1]);
      if (!label) {
        ctx.ignored.push(cells[i]);
        continue;
      }
      if (value !== null) values.push({ ...label, value });
    }
    if (values.length) sizes.push({ label: cells[0].toUpperCase(), values });
  }
  return sizes;
}

export function parseSizeChart(text) {
  const normalized = normalize(text);
  const inch = /inch|인치/i.test(normalized);
  const lines = normalized.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const ctx = { inch, ignored: [], warnings: [] };
  const h = lines.findIndex((l) => cellsOf(l).filter((c) => labelOf(c)).length >= 2);
  let sizes = [];
  if (h >= 0) sizes = readRows(lines, h, ctx);
  if (!sizes.length) sizes = readColumns(lines, ctx);
  if (!sizes.length) sizes = readPairs(lines, ctx);
  return finish(sizes, ctx);
}

// Keeps only the measurements this garment uses, as seller-sourced profile measures.
export function sizeChartOptions(parsed, item) {
  const allowed = measureFieldsFor(item);
  const dropped = new Set();
  const options = parsed.sizes.map(({ label, measures }) => ({
    label,
    measures: Object.fromEntries(
      Object.entries(measures)
        .filter(([key]) => allowed.includes(key) || (dropped.add(MEASURES[key]), false))
        .map(([key, cm]) => [key, { cm, source: 'seller' }]),
    ),
  })).filter((o) => Object.keys(o.measures).length);
  const warnings = [...parsed.warnings];
  if (dropped.size) {
    const names = [...dropped].join('·');
    warnings.push(`이 종류에는 쓰지 않는 ${names}${josa(names, '은', '는')} 뺐어요.`);
  }
  return { options, warnings, ignored: parsed.ignored };
}
