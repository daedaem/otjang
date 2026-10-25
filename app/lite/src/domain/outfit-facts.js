// Facts about one outfit that an AI ranking may use, and the user's reactions.
//
// R2 stands: the AI decides the final order and writes the reasons. This module
// only prepares what it may base them on: per-dimension verdicts with their
// basis, the user's own reactions, and a check that flags attribute claims an
// answer makes about a candidate when the recorded profile says otherwise or
// says nothing. Rules marked `editorial` are an editor's judgment, not a measurement.
import { SLOT_BY_ID, OCCASIONS } from './data/slots.js';
import { harmony, styleScore, josa, SEASON_LABEL } from './engine.js';
import { CHOICES, CHOICE_LABELS } from './garment-profile.js';

// Formality 1 (relaxed) .. 5 (formal) that each occasion usually expects. Editorial.
export const OCCASION_FORMALITY = { daily: [1, 3], weekend: [1, 2], date: [2, 4], work: [3, 4], formal: [4, 5] };

function slotOf(item) {
  return typeof item.slot === 'string' ? SLOT_BY_ID[item.slot] : item.slot || null;
}

// items: [{ slot (id or slot object), color, profile? }]
export function outfitFacts({ items, occasion = null, season = null, styles = [] }) {
  const entries = items.map((i) => ({ item: i, slot: slotOf(i) })).filter((e) => e.slot);
  const facts = [];

  const colorScore = harmony(entries.map((e) => ({ color: e.item.color, cat: e.slot.cat })));
  facts.push({
    dim: 'color', label: '색 조화', editorial: true,
    verdict: colorScore > 0 ? 'good' : colorScore < 0 ? 'weak' : 'neutral',
    basis: entries.some((e) => !e.item.color) ? '색을 모르는 옷이 있어 일부만 봤어요' : `조화 점수 ${colorScore}(포인트 색은 하나까지, 상·하의 밝기 차이)`,
  });

  if (occasion && OCCASION_FORMALITY[occasion]) {
    const known = entries.filter((e) => Number.isFinite(e.slot.formal));
    const [lo, hi] = OCCASION_FORMALITY[occasion];
    if (known.length) {
      const avg = Math.round((known.reduce((s, e) => s + e.slot.formal, 0) / known.length) * 10) / 10;
      facts.push({
        dim: 'formality', label: '격식', editorial: true,
        verdict: avg < lo ? 'too-casual' : avg > hi ? 'too-formal' : 'fits',
        basis: `격식 평균 ${avg} · ${OCCASIONS[occasion]} 기준 ${lo}~${hi}`,
      });
    }
  }

  const top = entries.find((e) => ['top', 'outer', 'dress'].includes(e.slot.cat) && e.item.profile?.silhouette);
  const bottom = entries.find((e) => e.slot.cat === 'bottom' && e.item.profile?.silhouette);
  if (top && bottom) {
    const t = top.item.profile.silhouette.value;
    const b = bottom.item.profile.silhouette.value;
    const heavy = (t === 'over' || t === 'wide') && b === 'wide';
    facts.push({
      dim: 'silhouette', label: '실루엣', editorial: true,
      verdict: heavy ? 'volume-heavy' : t === 'slim' && b === 'slim' ? 'all-slim' : 'balanced',
      basis: `상의 ${CHOICES.silhouette[t]} · 하의 ${CHOICES.silhouette[b]}`,
    });
  } else facts.push({ dim: 'silhouette', label: '실루엣', editorial: true, verdict: 'unknown', basis: '상의·하의 실루엣이 기록되지 않았어요' });

  if (season && SEASON_LABEL[season]) {
    const off = entries.filter((e) => Array.isArray(e.slot.seasons) && !e.slot.seasons.includes(season));
    facts.push({
      dim: 'season', label: '계절', editorial: true,
      verdict: off.length ? 'off-season' : 'fits',
      basis: off.length ? `${SEASON_LABEL[season]}에 덜 맞는 옷: ${off.map((e) => e.slot.name).join(', ')}` : `${SEASON_LABEL[season]}에 맞는 옷이에요`,
    });
  }

  if (styles.length) {
    const avg = entries.length ? entries.reduce((s, e) => s + styleScore(e.slot, styles), 0) / entries.length : 0;
    facts.push({
      dim: 'style', label: '스타일', editorial: true,
      verdict: avg >= 2 ? 'core' : avg >= 1 ? 'fits' : 'far',
      basis: `고른 스타일과의 점수 평균 ${Math.round(avg * 10) / 10}(0~3)`,
    });
  }
  return facts;
}

// ── Reactions ────────────────────────────────────────────────────────────────
export const REACTION_REASONS = {
  good_color: '색 조합이 좋아요',
  my_style: '내 스타일이에요',
  comfy: '편해 보여요',
  dull_color: '색이 답답해요',
  too_formal: '너무 격식 있어요',
  too_casual: '너무 캐주얼해요',
  length_off: '기장이 안 맞아요',
  fit_off: '품이 안 맞아요',
  wrong_season: '계절에 안 맞아요',
  not_my_style: '내 스타일이 아니에요',
};
export const MAX_REACTIONS = 500;
const REACTION_KEYS = ['id', 'garmentIds', 'verdict', 'reasons', 'occasion', 'at'];

const instantOK = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v) &&
  Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;

export function validateReaction(r) {
  if (!r || typeof r !== 'object' || Array.isArray(r) || Object.keys(r).length !== REACTION_KEYS.length ||
      Object.keys(r).some((k) => !REACTION_KEYS.includes(k)))
    throw new Error('조합 반응 형식을 읽지 못했어요. 원본을 보존했습니다.');
  if (typeof r.id !== 'string' || !/^r_[A-Za-z0-9_-]{1,64}$/.test(r.id) || !instantOK(r.at) ||
      !['like', 'dislike'].includes(r.verdict) ||
      !(r.occasion === null || Object.hasOwn(OCCASIONS, r.occasion)))
    throw new Error('조합 반응 정보를 확인해 주세요.');
  if (!Array.isArray(r.garmentIds) || !r.garmentIds.length || r.garmentIds.length > 12 ||
      r.garmentIds.some((id) => typeof id !== 'string' || !id || id.length > 100) || new Set(r.garmentIds).size !== r.garmentIds.length)
    throw new Error('조합 반응의 옷 목록을 확인해 주세요.');
  if (!Array.isArray(r.reasons) || r.reasons.length > 5 || r.reasons.some((x) => !Object.hasOwn(REACTION_REASONS, x)) ||
      new Set(r.reasons).size !== r.reasons.length)
    throw new Error('반응 이유를 다시 골라 주세요.');
  return r;
}

export function validateReactions(list) {
  if (!Array.isArray(list) || list.length > MAX_REACTIONS)
    throw new Error(`조합 반응은 ${MAX_REACTIONS}개까지 보관할 수 있어요. 오래된 반응을 정리해 주세요.`);
  const ids = new Set();
  for (const r of list) {
    validateReaction(r);
    if (ids.has(r.id)) throw new Error('같은 조합 반응이 두 번 저장돼 있어요. 원본을 보존했습니다.');
    ids.add(r.id);
  }
  return list;
}

// Real counts only; no score is derived from them here.
export function tasteSummary(reactions, { garmentIds = null } = {}) {
  const pool = garmentIds
    ? reactions.filter((r) => r.garmentIds.some((id) => garmentIds.includes(id)))
    : reactions;
  const counts = {};
  for (const r of pool) for (const x of r.reasons) counts[x] = (counts[x] || 0) + 1;
  return {
    likes: pool.filter((r) => r.verdict === 'like').length,
    dislikes: pool.filter((r) => r.verdict === 'dislike').length,
    reasons: Object.entries(counts)
      .sort((a, b) => b[1] - a[1] || Object.keys(REACTION_REASONS).indexOf(a[0]) - Object.keys(REACTION_REASONS).indexOf(b[0]))
      .map(([id, count]) => ({ id, label: REACTION_REASONS[id], count })),
  };
}

// Lines for an AI request: facts with their basis, then the user's reactions.
export function outfitFactLines(facts, taste = null) {
  const lines = facts.map((f) => `${f.label}: ${f.verdict} — ${f.basis}${f.editorial ? ' (편집 규칙)' : ''}`);
  if (taste && (taste.likes || taste.dislikes))
    lines.push(`내 반응: 좋아요 ${taste.likes} · 별로 ${taste.dislikes}${taste.reasons.length ? ` · ${taste.reasons.slice(0, 3).map((r) => `${r.label} ${r.count}`).join(', ')}` : ''}`);
  return lines;
}

// ── Attribute claim check ────────────────────────────────────────────────────
// Like the price check: only sentences that name a candidate are read, and a
// fact line is added under the answer; the answer itself is not rewritten.
// A word counts only when it does not continue another Hangul word, so "어울려요"
// is not read as 울 and "체크해 보세요" is not read as a check pattern.
const word = (w, after = '') => new RegExp(`(?<![가-힣])${w}${after}`);
const CLAIM_WORDS = [
  ...Object.entries(CHOICES.silhouette).map(([value, w]) => ({ key: 'silhouette', value, re: word(w) })),
  ...Object.entries(CHOICES.pattern)
    .filter(([v]) => v !== 'solid')
    .map(([value, w]) => ({ key: 'pattern', value, re: word(w, value === 'check' ? '(?!해|하|를|리스트|아웃)' : '') })),
  { key: 'fabric', value: '울', re: word('울', '(?=\\s|$|[.,!?·)%\\d]|니트|코트|소재|원단|혼방|블렌드|이|은|로|과|을)') },
  ...['린넨', '코듀로이', '캐시미어', '나일론', '가죽', '스웨이드', '데님', '옥스퍼드', '플란넬', '코튼']
    .map((w) => ({ key: 'fabric', value: w, re: word(w) })),
];
function claimHolds(claim, profile) {
  const attr = profile?.[claim.key];
  if (!attr) return null;
  if (claim.key === 'fabric') return attr.value.replace(/\s+/g, '').includes(claim.value);
  return attr.value === claim.value;
}
// 으로/로: a final consonant takes 으로, except ㄹ.
function ro(word) {
  const code = String(word).trim().slice(-1).charCodeAt(0) - 0xac00;
  return code >= 0 && code <= 11171 && code % 28 && code % 28 !== 8 ? '으로' : '로';
}
function recorded(claim, profile) {
  const attr = profile[claim.key];
  return claim.key === 'fabric' ? attr.value : CHOICES[claim.key][attr.value];
}

// candidates: [{ name, profile }]
export function attributeClaimCheck(answer, candidates) {
  if (typeof answer !== 'string' || !answer) return [];
  const sentences = answer.split(/(?<=[.!?。])\s+|\n+/);
  const lines = [];
  for (const c of candidates || []) {
    if (!c?.name) continue;
    for (const sentence of sentences) {
      if (!sentence.includes(c.name)) continue;
      const rest = sentence.split(c.name).join(' ');
      for (const claim of CLAIM_WORDS) {
        if (!claim.re.test(rest)) continue;
        const holds = claimHolds(claim, c.profile);
        const label = CHOICE_LABELS[claim.key];
        const subject = `${c.name}의 ${label}${josa(label, '은', '는')}`;
        if (holds === null) lines.push(`확인: ${subject} 기록되지 않았어요.`);
        else if (!holds) {
          const value = recorded(claim, c.profile);
          lines.push(`확인: ${subject} '${value}'${ro(value)} 기록돼 있어요.`);
        }
      }
    }
  }
  return [...new Set(lines)];
}
