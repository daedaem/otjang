// Self-reported garment facts and local reaction history. No images, retailer
// URLs, model selection or client-supplied instructions cross this boundary.
import { hasDuplicateJsonMembers } from "./json-members.js";
import {
  validateProfile,
  profileFactLines,
  PURPOSES,
} from "./garment-profile.js";
import { GARMENT_KINDS, garmentLabel, garmentKindName } from "./wardrobe.js";
import { SLOT_BY_ID, SLOTS, COLORS, OCCASIONS, STYLES } from "./data/slots.js";
import { SEASON_LABEL } from "./engine.js";
import {
  validateReactions,
  tasteSummary,
  outfitFacts,
  outfitFactLines,
  REACTION_REASONS,
  MAX_REACTIONS,
} from "./outfit-facts.js";
export const OUTFIT_REACTIONS_KEY = "eoul-d12-hang:outfit-reactions:v1";
export const REACTION_OVERLAP_NOTE =
  "같은 옷이 하나 이상 겹치는 과거 조합 반응이에요. 이 후보 조합만의 평가 수는 아니에요.";
const reviewObject = (x) =>
  x !== null && typeof x === "object" && !Array.isArray(x);
const reviewKeys = (x, allowed) =>
  reviewObject(x) && Object.keys(x).every((k) => allowed.includes(k));
const reviewText = (s, max, nonempty = false) =>
  typeof s === "string" &&
  s.length <= max &&
  (!nonempty || !!s.trim()) &&
  !/[\x00-\x1f\x7f]|https?:\/\/|blob:|data:/i.test(s);
const REVIEW_KINDS = new Set([
  ...GARMENT_KINDS.map((k) => k.id),
  ...SLOTS.map((s) => s.shape),
]);
export function readOutfitReactions(raw) {
  if (raw == null) return { v: 1, reactions: [] };
  const reject = () => {
    throw Error(
      "코디 반응 형식을 읽지 못해 원문을 보호하고 있어요. 백업에서 보관해 주세요.",
    );
  };
  let x;
  try {
    x = JSON.parse(raw);
  } catch {
    reject();
  }
  if (
    hasDuplicateJsonMembers(raw) ||
    !reviewKeys(x, ["v", "reactions"]) ||
    Object.keys(x).length !== 2 ||
    x.v !== 1
  )
    reject();
  try {
    validateReactions(x.reactions);
  } catch {
    reject();
  }
  return structuredClone(x);
}
export function validateOutfitRequest(v) {
  try {
    if (
      !reviewKeys(v, ["task", "context", "garments", "outfits", "taste"]) ||
      Object.keys(v).length !== 5 ||
      v.task !== "outfit_rank"
    )
      return false;
    const c = v.context;
    if (
      !reviewKeys(c, ["query", "occasion", "season", "styles"]) ||
      Object.keys(c).length !== 4 ||
      !reviewText(c.query, 300, true) ||
      !(c.occasion === null || Object.hasOwn(OCCASIONS, c.occasion)) ||
      !(c.season === null || Object.hasOwn(SEASON_LABEL, c.season)) ||
      !Array.isArray(c.styles) ||
      c.styles.length > 3 ||
      new Set(c.styles).size !== c.styles.length ||
      c.styles.some((s) => !Object.hasOwn(STYLES, s))
    )
      return false;
    if (
      !Array.isArray(v.garments) ||
      v.garments.length < 2 ||
      v.garments.length > 24 ||
      !Array.isArray(v.outfits) ||
      !v.outfits.length ||
      v.outfits.length > 8 ||
      !Array.isArray(v.taste) ||
      v.taste.length > v.outfits.length
    )
      return false;
    const ids = new Set();
    for (const g of v.garments) {
      if (
        !reviewKeys(g, [
          "id",
          "kind",
          "slot",
          "color",
          "label",
          "profile",
          "omittedDetails",
        ]) ||
        typeof g.id !== "string" ||
        !/^[-\w]{1,100}$/.test(g.id) ||
        ids.has(g.id) ||
        !REVIEW_KINDS.has(g.kind) ||
        !(
          g.slot === null ||
          (typeof g.slot === "string" && SLOT_BY_ID[g.slot]?.shape === g.kind)
        ) ||
        !(g.color === null || Object.hasOwn(COLORS, g.color)) ||
        !reviewText(g.label, 80, true)
      )
        return false;
      if (
        g.omittedDetails !== undefined &&
        (!Number.isInteger(g.omittedDetails) ||
          g.omittedDetails < 1 ||
          g.omittedDetails > 14 ||
          g.profile?.details?.length !== 6)
      )
        return false;
      if (g.profile !== undefined) {
        validateProfile(g.profile, g);
        if (/https?:\/\/|blob:|data:/i.test(JSON.stringify(g.profile)))
          return false;
      }
      ids.add(g.id);
    }
    const outfitIds = new Set(),
      compositions = new Set(),
      used = new Set();
    for (const o of v.outfits) {
      if (
        !reviewKeys(o, ["id", "garmentIds"]) ||
        Object.keys(o).length !== 2 ||
        typeof o.id !== "string" ||
        !/^o_[\w-]{1,64}$/.test(o.id) ||
        outfitIds.has(o.id) ||
        !Array.isArray(o.garmentIds) ||
        o.garmentIds.length < 2 ||
        o.garmentIds.length > 12 ||
        new Set(o.garmentIds).size !== o.garmentIds.length ||
        o.garmentIds.some((id) => !ids.has(id))
      )
        return false;
      const key = [...o.garmentIds].sort().join("|");
      if (compositions.has(key)) return false;
      compositions.add(key);
      outfitIds.add(o.id);
      for (const id of o.garmentIds) used.add(id);
    }
    if (used.size !== ids.size) return false;
    const tasteIds = new Set();
    for (const t of v.taste) {
      if (
        !reviewKeys(t, ["outfitId", "likes", "dislikes", "reasons"]) ||
        Object.keys(t).length !== 4 ||
        !outfitIds.has(t.outfitId) ||
        tasteIds.has(t.outfitId) ||
        ![t.likes, t.dislikes].every(
          (n) => Number.isInteger(n) && n >= 0 && n <= MAX_REACTIONS,
        ) ||
        t.likes + t.dislikes > MAX_REACTIONS ||
        !Array.isArray(t.reasons) ||
        t.reasons.length > Object.keys(REACTION_REASONS).length
      )
        return false;
      const reasons = new Set();
      for (const r of t.reasons) {
        if (
          !reviewKeys(r, ["id", "count"]) ||
          Object.keys(r).length !== 2 ||
          !Object.hasOwn(REACTION_REASONS, r.id) ||
          reasons.has(r.id) ||
          !Number.isInteger(r.count) ||
          r.count < 1 ||
          r.count > t.likes + t.dislikes
        )
          return false;
        reasons.add(r.id);
      }
      tasteIds.add(t.outfitId);
    }
    return true;
  } catch {
    return false;
  }
}
export function buildOutfitRequest({
  context = {},
  garments,
  outfits,
  reactions = [],
}) {
  validateReactions(reactions);
  const base = {
    task: "outfit_rank",
    context: {
      query: context.query ?? "내 옷으로 코디",
      occasion: context.occasion ?? null,
      season: context.season ?? null,
      styles: context.styles ?? [],
    },
  };
  let selected = outfits.slice(0, 8),
    value;
  while (selected.length) {
    const used = new Set(selected.flatMap((o) => o.garmentIds));
    const actual = garments
      .filter((g) => used.has(g.id))
      .map((g) => {
        const profile = g.profile ? structuredClone(g.profile) : undefined,
          omittedDetails = Math.max(0, (profile?.details?.length || 0) - 6);
        if (profile?.details) profile.details = profile.details.slice(0, 6);
        return {
          id: g.id,
          kind: g.kind,
          slot: g.slot || null,
          color: g.color || null,
          label: (g.label || garmentLabel(g)).slice(0, 80),
          ...(profile ? { profile } : {}),
          ...(omittedDetails ? { omittedDetails } : {}),
        };
      });
    if (actual.length > 24) {
      selected = selected.slice(0, -1);
      continue;
    }
    value = {
      ...base,
      garments: actual,
      outfits: selected.map((o) => ({
        id: o.id,
        garmentIds: [...o.garmentIds],
      })),
      taste: selected.map((o) => {
        const t = tasteSummary(reactions, { garmentIds: o.garmentIds });
        return {
          outfitId: o.id,
          likes: t.likes,
          dislikes: t.dislikes,
          reasons: t.reasons.map(({ id, count }) => ({ id, count })),
        };
      }),
    };
    if (new TextEncoder().encode(JSON.stringify(value)).length <= 28 * 1024)
      break;
    selected = selected.slice(0, -1);
  }
  if (!selected.length || !validateOutfitRequest(value))
    throw Error(
      "코디 정보를 확인해 주세요. 사진·링크 없이 기록된 내 옷만 비교할 수 있어요.",
    );
  return value;
}
export function outfitReviewFacts(v) {
  if (!validateOutfitRequest(v)) throw Error("invalid_outfit_request");
  const byId = new Map(v.garments.map((g) => [g.id, g]));
  return {
    query: v.context.query,
    occasion: v.context.occasion ? OCCASIONS[v.context.occasion] : null,
    season: v.context.season ? SEASON_LABEL[v.context.season] : null,
    styles: v.context.styles.map((s) => STYLES[s].label),
    notice:
      "사용자가 기록한 내 옷 정보예요. 편집 규칙은 최종 판단이 아닙니다. 사진·현재 구매 정보는 제공되지 않습니다.",
    outfits: v.outfits.map((o) => {
      const items = o.garmentIds.map((id) => byId.get(id)),
        t = v.taste.find((t) => t.outfitId === o.id);
      const taste = t
        ? {
            ...t,
            scope: "overlap",
            reasons: t.reasons.map((r) => ({
              ...r,
              label: REACTION_REASONS[r.id],
            })),
          }
        : null;
      return {
        id: o.id,
        reactionBasis: REACTION_OVERLAP_NOTE,
        garments: items.map((g) => ({
          id: g.id,
          name: g.label,
          kind: garmentKindName(g.kind),
          color: COLORS[g.color]?.label || "모름",
          purpose: PURPOSES[g.profile?.purpose] || "모름",
          facts: profileFactLines(g.profile, g),
          ...(g.omittedDetails
            ? {
                notice: `디테일 ${g.omittedDetails}개는 입력 한도로 생략했어요.`,
              }
            : {}),
        })),
        facts: outfitFactLines(outfitFacts({ items, ...v.context }), taste),
      };
    }),
  };
}
