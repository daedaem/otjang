// What we know about one garment beyond its kind and color, and where each fact came from.
//
// Every value carries its source. A missing key means unknown: nothing here
// fills a value in on its own, and an AI estimate stays "확인 전" until the user
// confirms it. Measurements are flat-lay centimetres (단면 = half the
// circumference), the way Korean size charts state them.
//
// This module only validates and describes a profile. Where a profile is stored
// (core snapshot, registration receipt, backup) is decided by the screen work;
// see docs/log/2026-10/wardrobe-rail-handoff-20261025.md.
import { SLOT_BY_ID } from './data/slots.js';
import { slotForItem } from './wardrobe.js';
import { josa } from './engine.js';

export const PROFILE_VERSION = 1;

export const SOURCES = {
  seller: '판매처 표기',
  measured: '직접 잼',
  chosen: '직접 고름',
  ai: 'AI 추정 · 확인 전',
};

export const MEASURES = {
  length: '총장',
  shoulder: '어깨',
  chest: '가슴단면',
  sleeve: '소매',
  waist: '허리단면',
  thigh: '허벅지단면',
  hem: '밑단단면',
  rise: '밑위',
};
const MEASURES_BY_CAT = {
  top: ['length', 'shoulder', 'chest', 'sleeve'],
  outer: ['length', 'shoulder', 'chest', 'sleeve'],
  dress: ['length', 'shoulder', 'chest', 'waist'],
  bottom: ['length', 'waist', 'thigh', 'hem', 'rise'],
};
const SKIRT_MEASURES = ['length', 'waist', 'hem'];

export const CHOICES = {
  silhouette: { slim: '슬림', regular: '레귤러', wide: '와이드', over: '오버' },
  thickness: { thin: '얇음', mid: '보통', thick: '두꺼움' },
  surface: { smooth: '매끈', textured: '결', brushed: '기모', glossy: '광택' },
  pattern: { solid: '무지', stripe: '스트라이프', check: '체크', dot: '도트', print: '프린트' },
};
export const CHOICE_LABELS = { silhouette: '실루엣', thickness: '두께', surface: '표면', pattern: '무늬', fabric: '소재' };
// Suggestions for the free-text fabric field. Users may type anything else.
export const FABRIC_SUGGESTIONS = [
  '옥스퍼드', '포플린', '샴브레이', '데님', '치노·코튼 트윌', '코듀로이', '플란넬', '울', '캐시미어',
  '린넨', '코튼 니트', '울 니트', '저지', '스웨트', '나일론', '왁스드 코튼', '가죽', '스웨이드',
];
export const PURPOSES = { wear: '착용', collect: '소장', both: '착용·소장' };

export const MAX_DETAILS = 20;
const TEXT_MAX = 40;
const PROFILE_KEYS = ['v', 'measures', 'silhouette', 'fabric', 'thickness', 'surface', 'pattern', 'details', 'purpose', 'series', 'reference'];

// The category decides which measurements make sense. Catalog products carry a
// slot; owned garments may only carry a kind.
export function garmentCategory(item) {
  const slot = SLOT_BY_ID[item?.slot];
  if (slot) return slot.cat;
  if (!item?.kind) return null;
  return slotForItem({ gender: 'M', ...item, slot: undefined }).cat;
}
export function garmentShape(item) {
  return SLOT_BY_ID[item?.slot]?.shape || item?.kind || null;
}
export function measureFieldsFor(item) {
  if (garmentShape(item) === 'skirt') return SKIRT_MEASURES;
  return MEASURES_BY_CAT[garmentCategory(item)] || [];
}

const sourceOK = (s) => typeof s === 'string' && Object.hasOwn(SOURCES, s);
function plainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function cleanText(value, label) {
  if (typeof value !== 'string') throw new Error(`${label}${josa(label, '을', '를')} 다시 확인해 주세요.`);
  const text = value.trim().replace(/\s+/g, ' ');
  if (!text || text.length > TEXT_MAX || /[\u0000-\u001f\u007f]/.test(text))
    throw new Error(`${label}${josa(label, '은', '는')} ${TEXT_MAX}자 이내로 적어 주세요.`);
  return text;
}
function sourced(value, label, read) {
  if (!plainObject(value) || !sourceOK(value.source)) throw new Error(`${label}의 출처를 확인해 주세요.`);
  return { ...read(value), source: value.source };
}
function onlyKeys(value, keys, label) {
  if (Object.keys(value).some((k) => !keys.includes(k))) throw new Error(`${label} 형식을 읽지 못했어요. 원본을 보존했습니다.`);
}

export function measureOK(cm) {
  return typeof cm === 'number' && Number.isFinite(cm) && cm >= 1 && cm <= 200;
}

// Validates a stored profile and returns a normalized copy. A profile from a
// newer app is refused rather than partly read, so its raw text can be kept.
export function validateProfile(profile, item) {
  if (!plainObject(profile)) throw new Error('옷 정보 형식을 읽지 못했어요. 원본을 보존했습니다.');
  if (profile.v !== PROFILE_VERSION) {
    if (Number.isInteger(profile.v) && profile.v > PROFILE_VERSION)
      throw new Error('새 버전 앱에서 만든 옷 정보예요. 원본을 보존했습니다.');
    throw new Error('옷 정보 형식을 읽지 못했어요. 원본을 보존했습니다.');
  }
  onlyKeys(profile, PROFILE_KEYS, '옷 정보');
  const out = { v: PROFILE_VERSION };
  if (profile.measures !== undefined) {
    if (!plainObject(profile.measures)) throw new Error('실측 형식을 확인해 주세요.');
    const allowed = measureFieldsFor(item);
    const measures = {};
    for (const [key, m] of Object.entries(profile.measures)) {
      if (!allowed.includes(key)) throw new Error(`이 종류에는 '${MEASURES[key] || key}' 실측을 쓰지 않아요.`);
      measures[key] = sourced(m, MEASURES[key], (x) => {
        onlyKeys(x, ['cm', 'source'], MEASURES[key]);
        if (!measureOK(x.cm)) throw new Error(`${MEASURES[key]}${josa(MEASURES[key], '은', '는')} 1~200cm 사이 숫자로 적어 주세요.`);
        return { cm: Math.round(x.cm * 10) / 10 };
      });
      // A centimetre is read off a size chart or a tape, never chosen or estimated.
      if (!['seller', 'measured'].includes(measures[key].source)) throw new Error(`${MEASURES[key]} 실측의 출처를 확인해 주세요.`);
    }
    if (Object.keys(measures).length) out.measures = measures;
  }
  for (const key of ['silhouette', 'thickness', 'surface']) {
    if (profile[key] === undefined) continue;
    out[key] = sourced(profile[key], CHOICE_LABELS[key], (x) => {
      onlyKeys(x, ['value', 'source'], CHOICE_LABELS[key]);
      if (!Object.hasOwn(CHOICES[key], x.value)) throw new Error(`${CHOICE_LABELS[key]} 값을 다시 골라 주세요.`);
      return { value: x.value };
    });
  }
  if (profile.fabric !== undefined)
    out.fabric = sourced(profile.fabric, '소재', (x) => {
      onlyKeys(x, ['value', 'source'], '소재');
      return { value: cleanText(x.value, '소재') };
    });
  if (profile.pattern !== undefined)
    out.pattern = sourced(profile.pattern, '무늬', (x) => {
      onlyKeys(x, ['value', 'note', 'source'], '무늬');
      if (!Object.hasOwn(CHOICES.pattern, x.value)) throw new Error('무늬 값을 다시 골라 주세요.');
      return x.note === undefined ? { value: x.value } : { value: x.value, note: cleanText(x.note, '무늬 설명') };
    });
  if (profile.details !== undefined) {
    if (!Array.isArray(profile.details) || profile.details.length > MAX_DETAILS)
      throw new Error(`디테일은 ${MAX_DETAILS}개까지 적을 수 있어요.`);
    const seen = new Set();
    const details = profile.details.map((d) =>
      sourced(d, '디테일', (x) => {
        onlyKeys(x, ['text', 'source'], '디테일');
        const text = cleanText(x.text, '디테일');
        if (seen.has(detailKey(text))) throw new Error(`디테일 '${text}'${josa(text, '이', '가')} 두 번 적혀 있어요.`);
        seen.add(detailKey(text));
        return { text };
      }),
    );
    if (details.length) out.details = details;
  }
  if (profile.purpose !== undefined) {
    if (!Object.hasOwn(PURPOSES, profile.purpose)) throw new Error('목적을 다시 골라 주세요.');
    out.purpose = profile.purpose;
  }
  if (profile.series !== undefined) out.series = cleanText(profile.series, '컬렉션 이름');
  if (profile.reference !== undefined) {
    if (typeof profile.reference !== 'boolean') throw new Error('기준 옷 표시를 확인해 주세요.');
    if (profile.reference) out.reference = true;
  }
  return out;
}

export function emptyProfile() {
  return { v: PROFILE_VERSION };
}

// Detail text compares without spaces or case, so "셀비지" and "셀 비지" are one detail.
export function detailKey(text) {
  return text.normalize('NFKC').toLowerCase().replace(/[\s·.,/_-]+/g, '');
}

// Reads one measurement typed in a form: "72", "72.5", "72cm", "72 cm".
export function parseMeasureInput(text) {
  if (typeof text !== 'string') return null;
  const m = text.trim().replace(',', '.').match(/^(\d{1,3}(?:\.\d)?)\s*(?:cm|센티|㎝)?$/i);
  if (!m) return null;
  const cm = Number(m[1]);
  return measureOK(cm) ? cm : null;
}

// Builds a profile from form fields. Empty fields stay unknown; a typed value
// that cannot be read is reported instead of being dropped or guessed.
export function profileFromForm(form, item, { measureSource = 'measured' } = {}) {
  const profile = { v: PROFILE_VERSION };
  const problems = [];
  const measures = {};
  for (const key of measureFieldsFor(item)) {
    const raw = form?.measures?.[key];
    if (raw === undefined || raw === null || String(raw).trim() === '') continue;
    const cm = typeof raw === 'number' ? (measureOK(raw) ? raw : null) : parseMeasureInput(String(raw));
    if (cm === null) problems.push(`${MEASURES[key]}: '${String(raw).trim()}'${josa(String(raw), '은', '는')} 숫자(cm)로 읽지 못했어요.`);
    else measures[key] = { cm, source: measureSource };
  }
  if (Object.keys(measures).length) profile.measures = measures;
  for (const key of ['silhouette', 'thickness', 'surface']) {
    if (form?.[key]) profile[key] = { value: form[key], source: 'chosen' };
  }
  if (form?.fabric && String(form.fabric).trim()) profile.fabric = { value: String(form.fabric), source: 'chosen' };
  if (form?.pattern)
    profile.pattern = form.patternNote && String(form.patternNote).trim()
      ? { value: form.pattern, note: String(form.patternNote), source: 'chosen' }
      : { value: form.pattern, source: 'chosen' };
  const details = (form?.details || []).map((t) => String(t).trim()).filter(Boolean);
  if (details.length) {
    const seen = new Set();
    profile.details = details.filter((t) => !seen.has(detailKey(t)) && seen.add(detailKey(t))).map((text) => ({ text, source: 'chosen' }));
  }
  if (form?.purpose) profile.purpose = form.purpose;
  if (form?.series && String(form.series).trim()) profile.series = String(form.series);
  if (form?.reference) profile.reference = true;
  if (problems.length) return { profile: null, problems };
  return { profile: validateProfile(profile, item), problems: [] };
}

// The user confirmed an AI estimate: the value stays, the source becomes theirs.
// Measurements have no estimates to confirm.
export function confirmEstimate(profile, key, index = null) {
  const next = structuredClone(profile);
  if (key === 'details') {
    if (next.details?.[index]?.source === 'ai') next.details[index].source = 'chosen';
  } else if (next[key]?.source === 'ai') next[key].source = 'chosen';
  return next;
}

function factValue(key, attr) {
  if (key === 'fabric') return attr.value;
  const label = CHOICES[key][attr.value];
  return key === 'pattern' && attr.note ? `${label}(${attr.note})` : label;
}

// Facts that may be said about the garment, each with its source. Unknown
// fields are listed separately so an explanation can say "모름" instead of guessing.
export function profileFacts(profile, item) {
  const facts = [];
  const unknown = [];
  for (const key of measureFieldsFor(item)) {
    const m = profile?.measures?.[key];
    if (m) facts.push({ key, label: MEASURES[key], text: `${m.cm}cm`, source: m.source, confirmed: m.source !== 'ai' });
    else unknown.push(MEASURES[key]);
  }
  for (const key of ['silhouette', 'fabric', 'thickness', 'surface', 'pattern']) {
    const attr = profile?.[key];
    if (attr) facts.push({ key, label: CHOICE_LABELS[key], text: factValue(key, attr), source: attr.source, confirmed: attr.source !== 'ai' });
    else unknown.push(CHOICE_LABELS[key]);
  }
  for (const d of profile?.details || [])
    facts.push({ key: 'details', label: '디테일', text: d.text, source: d.source, confirmed: d.source !== 'ai' });
  return { facts, unknown };
}

// One line per fact for an AI request or a card. Unconfirmed estimates are
// labelled, never mixed in as facts.
export function profileFactLines(profile, item) {
  const { facts, unknown } = profileFacts(profile, item);
  const lines = facts.map((f) => `${f.label} ${f.text} (${SOURCES[f.source]})`);
  if (unknown.length) lines.push(`모름: ${unknown.join('·')}`);
  return lines;
}
