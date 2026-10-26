// Facts about one outfit that an AI ranking may use, and the user's reactions.
//
// R2 stands: the AI decides the final order and writes the reasons. This module
// only prepares what it may base them on: per-dimension verdicts with their
// basis, the user's own reactions, and a check that flags attribute claims an
// answer makes about a candidate when the recorded profile says otherwise or
// says nothing. Rules marked `editorial` are an editor's judgment, not a measurement.
import { SLOT_BY_ID, OCCASIONS } from './data/slots.js';
import { harmony, styleScore, josa, SEASON_LABEL } from './engine.js';
import { CHOICES, CHOICE_LABELS, SOURCES } from './garment-profile.js';

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
    verdict: entries.length!==items.length||!entries.length||entries.some(e=>!e.item.color) ? 'unknown' : colorScore > 0 ? 'good' : colorScore < 0 ? 'weak' : 'neutral',
    basis: entries.length!==items.length||!entries.length ? '세부 종류를 모르는 옷이 있어 색 조화를 확정하지 않았어요' : entries.some((e) => !e.item.color) ? '색을 모르는 옷이 있어 일부만 봤어요' : `조화 점수 ${colorScore}(포인트 색은 하나까지, 상·하의 밝기 차이)`,
  });

  if (occasion && OCCASION_FORMALITY[occasion]) {
    const known = entries.filter((e) => Number.isFinite(e.slot.formal));
    const [lo, hi] = OCCASION_FORMALITY[occasion];
    if (known.length) {
      const avg = Math.round((known.reduce((s, e) => s + e.slot.formal, 0) / known.length) * 10) / 10;
      facts.push({
        dim: 'formality', label: '격식', editorial: true,
        verdict: known.length!==items.length ? 'unknown' : avg < lo ? 'too-casual' : avg > hi ? 'too-formal' : 'fits',
        basis: known.length!==items.length ? `세부 종류를 확인한 ${known.length}벌의 격식 평균 ${avg} · 전체 조합 판단은 보류했어요` : `격식 평균 ${avg} · ${OCCASIONS[occasion]} 기준 ${lo}~${hi}`,
      });
    } else facts.push({dim:'formality',label:'격식',editorial:true,verdict:'unknown',basis:'세부 종류의 격식 정보가 없어 판단을 보류했어요'});
  }

  const top = entries.find((e) => ['top', 'outer', 'dress'].includes(e.slot.cat) && e.item.profile?.silhouette);
  const bottom = entries.find((e) => e.slot.cat === 'bottom' && e.item.profile?.silhouette);
  if (top && bottom) {
    const topAttr = top.item.profile.silhouette;
    const bottomAttr = bottom.item.profile.silhouette;
    const t = topAttr.value;
    const b = bottomAttr.value;
    const confirmed = [topAttr, bottomAttr].every((attr) => Object.hasOwn(SOURCES, attr.source) && attr.source !== 'ai');
    const heavy = (t === 'over' || t === 'wide') && b === 'wide';
    facts.push({
      dim: 'silhouette', label: '실루엣', editorial: true,
      confirmed,
      verdict: !confirmed ? 'unknown' : heavy ? 'volume-heavy' : t === 'slim' && b === 'slim' ? 'all-slim' : 'balanced',
      basis: `상의 ${CHOICES.silhouette[t]} (${SOURCES[topAttr.source] || '출처 확인 전'}) · 하의 ${CHOICES.silhouette[b]} (${SOURCES[bottomAttr.source] || '출처 확인 전'})${confirmed ? '' : ' · 확인 전 속성이 있어 판단을 보류했어요'}`,
    });
  } else facts.push({ dim: 'silhouette', label: '실루엣', editorial: true, verdict: 'unknown', basis: '상의·하의 실루엣이 기록되지 않았어요' });

  if (season && SEASON_LABEL[season]) {
    const off = entries.filter((e) => Array.isArray(e.slot.seasons) && !e.slot.seasons.includes(season));
    facts.push({
      dim: 'season', label: '계절', editorial: true,
      verdict: off.length ? 'off-season' : entries.length!==items.length||!entries.length ? 'unknown' : 'fits',
      basis: off.length ? `${SEASON_LABEL[season]}에 덜 맞는 옷: ${off.map((e) => e.slot.name).join(', ')}` : entries.length!==items.length||!entries.length ? '세부 종류가 없어 계절 적합성을 확인하지 않았어요' : `${SEASON_LABEL[season]}에 맞는 옷이에요`,
    });
  }

  if (styles.length) {
    const avg = entries.length ? entries.reduce((s, e) => s + styleScore(e.slot, styles), 0) / entries.length : 0;
    facts.push({
      dim: 'style', label: '스타일', editorial: true,
      verdict: entries.length!==items.length||!entries.length ? 'unknown' : avg >= 2 ? 'core' : avg >= 1 ? 'fits' : 'far',
      basis: entries.length!==items.length||!entries.length ? '세부 종류가 없어 스타일 적합성을 확인하지 않았어요' : `고른 스타일과의 점수 평균 ${Math.round(avg * 10) / 10}(0~3)`,
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
const OUTFIT_VERDICT_LABELS={color:{good:'규칙상 조화가 있는 편',weak:'색 조합 추가 확인',neutral:'뚜렷한 판단 없음',unknown:'정보 부족'},formality:{'too-casual':'기준보다 캐주얼한 편','too-formal':'기준보다 격식 있는 편',fits:'기준 범위',unknown:'정보 부족'},silhouette:{'volume-heavy':'상의·하의 모두 넉넉함','all-slim':'상의·하의 모두 슬림함',balanced:'기록된 실루엣 조합',unknown:'정보 부족'},season:{'off-season':'계절 추가 확인',fits:'분류상 해당 계절',unknown:'정보 부족'},style:{core:'스타일 특징이 가까움',fits:'스타일 분류가 겹침',far:'스타일 분류 차이 있음',unknown:'정보 부족'}};
export function outfitFactLines(facts, taste = null, {human=false}={}) {
  const lines = facts.map((f) => `${f.label}: ${human?(OUTFIT_VERDICT_LABELS[f.dim]?.[f.verdict]||'기록 확인 필요'):f.verdict} — ${f.basis}${f.editorial ? ' (편집 규칙)' : ''}`);
  if (taste && (taste.likes || taste.dislikes))
    lines.push(`${taste.scope==='overlap'?'겹치는 옷의 과거 조합 반응(이 후보만의 평가 수 아님)':'내 반응'}: 좋아요 ${taste.likes} · 별로 ${taste.dislikes}${taste.reasons.length ? ` · ${taste.reasons.slice(0, 3).map((r) => `${r.label} ${r.count}`).join(', ')}` : ''}`);
  return lines;
}

// ── Attribute claim check ────────────────────────────────────────────────────
// Like the price check: a fact line is added under the answer; the answer
// itself is not rewritten. It prefers missing a claim to flagging a sound
// sentence, so it reads only two narrow shapes and skips everything else:
//   "와이드 치노 팬츠"        a word right before the candidate's name
//   "치노 팬츠는 울 소재라"   the first such word after the candidate's name,
//                             before another candidate or a clause break
// A word followed by another noun ("셔츠는 와이드 팬츠와") describes that noun
// and is skipped, and so is anything after "와/과/랑". A negated claim ("울
// 소재가 아니에요") is checked the other way round. Words count only when they
// do not continue another Hangul word, so "어울려요" is not 울.
const CLAIM_WORDS = [
  ...Object.entries(CHOICES.silhouette).map(([value, w]) => ({ key: 'silhouette', value, w })),
  ...Object.entries(CHOICES.pattern).filter(([v]) => v !== 'solid').map(([value, w]) => ({ key: 'pattern', value, w })),
  ...['울', '린넨', '코듀로이', '캐시미어', '나일론', '가죽', '스웨이드', '데님', '옥스퍼드', '플란넬', '코튼']
    .map((w) => ({ key: 'fabric', value: w, w })),
];
const NOT_A_PATTERN = /^(?:해|하|를|리스트|아웃)/; // "체크해 보세요"
const ATTACHED = /^(?:핏|소재|원단|무늬|패턴|이에요|예요|이라|라서|라|이고|고|하고|한|해요|이며|며|입니다|이다|으로|로|이|가|은|는|에|[.,!?)]|$)/;
const SPACED = /^\s+(?:핏|소재|원단|무늬|패턴|느낌|스타일|계열)/;
const ATTRIBUTE_NEGATION = /아니|않|없|말고/;
const BREAK = /지만|는데|[,;]|그리고|반면/;
const WINDOW = 24;
const NEAR = 16;

function firstWord(text) {
  let best = null;
  for (const claim of CLAIM_WORDS) {
    for (const m of text.matchAll(new RegExp(`(?<![가-힣])${claim.w}`, 'g'))) {
      const after = text.slice(m.index + claim.w.length);
      if (claim.value === 'check' && NOT_A_PATTERN.test(after)) continue;
      if (!best || m.index < best.index || (m.index === best.index && claim.w.length > best.claim.w.length))
        best = { claim, index: m.index, after };
      break;
    }
  }
  return best;
}
function prefixClaim(before) {
  const found = CLAIM_WORDS.find((claim) => new RegExp(`(?<![가-힣])${claim.w}\\s?$`).test(before));
  return found ? { claim: found, negated: false } : null;
}
function predicateClaim(window) {
  const found = firstWord(window);
  if (!found || found.index > NEAR) return null;
  const suffix = found.after.match(ATTACHED) || found.after.match(SPACED);
  if (!suffix) return null;
  return { claim: found.claim, negated: ATTRIBUTE_NEGATION.test(found.after.slice(suffix[0].length, suffix[0].length + 10)) };
}
function claimsAbout(sentence, name, otherNames) {
  const claims = [];
  for (let at = sentence.indexOf(name); at !== -1; at = sentence.indexOf(name, at + name.length)) {
    const prefix = prefixClaim(sentence.slice(Math.max(0, at - 10), at));
    if (prefix) claims.push(prefix);
    let window = sentence.slice(at + name.length, at + name.length + WINDOW);
    const particle = window.match(/^(?:이랑|랑|하고|와|과|은|는|이|가|도|의)?/)[0];
    if (['이랑', '랑', '하고', '와', '과'].includes(particle)) continue;
    window = window.slice(particle.length);
    const cuts = [window.search(BREAK), ...otherNames.map((n) => window.indexOf(n))].filter((i) => i >= 0);
    if (cuts.length) window = window.slice(0, Math.min(...cuts));
    const claim = predicateClaim(window);
    if (claim) claims.push(claim);
  }
  return claims;
}
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
  const available = (candidates || []).filter((c) => typeof c?.name==='string'&&c.name);
  const named = available.filter(c=>!available.some(o=>o!==c&&(o.name.includes(c.name)||c.name.includes(o.name))));
  const lines = [];
  for (const c of named) {
    const others = named.filter((o) => o !== c && !c.name.includes(o.name)).map((o) => o.name);
    for (const sentence of sentences) {
      for (const { claim, negated } of claimsAbout(sentence, c.name, others)) {
        const label = CHOICE_LABELS[claim.key];
        const subject = `${c.name}의 ${label}${josa(label, '은', '는')}`;
        // An unconfirmed estimate is not evidence that the answer is wrong.
        // Keep its status visible without asserting the guessed value as fact.
        if (c.profile?.[claim.key]?.source === 'ai') {
          lines.push(`확인: ${subject} AI 추정 · 확인 전이에요.`);
          continue;
        }
        const holds = claimHolds(claim, c.profile);
        if (holds === null) {
          if (!negated) lines.push(`확인: ${subject} 기록되지 않았어요.`);
        } else if (holds === negated) {
          const value = recorded(claim, c.profile);
          lines.push(`확인: ${subject} '${value}'${ro(value)} 기록돼 있어요.`);
        }
      }
    }
  }
  return [...new Set(lines)];
}
