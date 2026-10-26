// An owned garment edit has its own versioned draft. Raw unfinished input is
// never confused with confirmed measurements, nor with the registration draft.
import {
  validateProfile,
  measureFieldsFor,
  parseMeasureInput,
  CHOICES,
  MEASURES,
  detailKey,
  PURPOSES,
} from "./garment-profile.js";
import { GARMENT_KINDS } from "./wardrobe.js";
import { SLOTS } from "./data/slots.js";
export const PROFILE_DRAFT_KEY = "eoul-d12-hang:profile-drafts:v1";
export const PROFILE_DRAFT_VERSION = 1;
const PROFILE_EDIT_ATTRS = [
  "silhouette",
  "fabric",
  "thickness",
  "surface",
  "pattern",
];
const PROFILE_EDIT_KINDS = new Set([
  ...GARMENT_KINDS.map((k) => k.id),
  ...SLOTS.map((s) => s.shape),
]);
const profileEditObject = (x) =>
  x !== null && typeof x === "object" && !Array.isArray(x);
function profileEditKeys(value, keys) {
  if (
    !profileEditObject(value) ||
    Object.keys(value).some((k) => !keys.includes(k))
  )
    throw Error("옷 정보 초안의 새 형식을 읽지 못했어요. 원문을 보존했어요.");
}
function profileEditText(x, max) {
  return typeof x === "string" && x.length <= max;
}
export function profileEditDraft(garment, at = new Date().toISOString()) {
  const p = garment.profile || null;
  const draft = {
    v: 1,
    garmentId: garment.id,
    kind: garment.kind,
    baseProfile: p ? structuredClone(p) : null,
    updatedAt: at,
    form: {
      measures: Object.fromEntries(
        measureFieldsFor(garment).map((k) => [
          k,
          p?.measures?.[k] ? String(p.measures[k].cm) : "",
        ]),
      ),
      measureSources: Object.fromEntries(
        measureFieldsFor(garment).map((k) => [
          k,
          p?.measures?.[k]?.source || "measured",
        ]),
      ),
      attributes: Object.fromEntries(
        PROFILE_EDIT_ATTRS.map((k) => [k, p?.[k]?.value || ""]),
      ),
      patternNote: p?.pattern?.note || "",
      details: (p?.details || []).map((d) => d.text).join("\n"),
      purpose: p?.purpose || "",
      series: p?.series || "",
      reference: !!p?.reference,
      confirmed: [],
    },
  };
  validateProfileEdit(draft);
  return draft;
}
export function validateProfileEdit(d) {
  profileEditKeys(d, [
    "v",
    "garmentId",
    "kind",
    "baseProfile",
    "updatedAt",
    "form",
  ]);
  if (
    d.v !== 1 ||
    typeof d.garmentId !== "string" ||
    !/^[-\w]{1,100}$/.test(d.garmentId) ||
    !PROFILE_EDIT_KINDS.has(d.kind) ||
    typeof d.updatedAt !== "string" ||
    !Number.isFinite(Date.parse(d.updatedAt))
  )
    throw Error(
      "옷 정보 초안 버전이나 대상을 읽지 못했어요. 원문을 보존했어요.",
    );
  if (d.baseProfile !== null) validateProfile(d.baseProfile, { kind: d.kind });
  const f = d.form;
  profileEditKeys(f, [
    "measures",
    "measureSources",
    "attributes",
    "patternNote",
    "details",
    "purpose",
    "series",
    "reference",
    "confirmed",
  ]);
  const fields = measureFieldsFor({ kind: d.kind });
  profileEditKeys(f.measures, fields);
  profileEditKeys(f.measureSources, fields);
  if (
    Object.keys(f.measures).length !== fields.length ||
    Object.keys(f.measureSources).length !== fields.length ||
    fields.some(
      (k) =>
        !profileEditText(f.measures[k], 20) ||
        !["measured", "seller"].includes(f.measureSources[k]),
    )
  )
    throw Error("실측 초안 형식을 읽지 못했어요. 원문을 보존했어요.");
  profileEditKeys(f.attributes, PROFILE_EDIT_ATTRS);
  for (const key of PROFILE_EDIT_ATTRS) {
    const value = f.attributes[key];
    if (
      !profileEditText(value, 40) ||
      (value && key !== "fabric" && !Object.hasOwn(CHOICES[key], value))
    )
      throw Error("속성 초안 형식을 읽지 못했어요. 원문을 보존했어요.");
  }
  if (
    !profileEditText(f.patternNote, 40) ||
    !profileEditText(f.details, 1000) ||
    !profileEditText(f.series, 40) ||
    typeof f.reference !== "boolean" ||
    !(f.purpose === "" || Object.hasOwn(PURPOSES, f.purpose))
  )
    throw Error("소장 정보 초안 형식을 읽지 못했어요. 원문을 보존했어요.");
  if (
    !Array.isArray(f.confirmed) ||
    f.confirmed.length > 25 ||
    new Set(f.confirmed).size !== f.confirmed.length ||
    f.confirmed.some(
      (k) =>
        typeof k !== "string" ||
        (!PROFILE_EDIT_ATTRS.includes(k) &&
          !(d.baseProfile?.details || []).some(
            (v) => k === "detail|" + detailKey(v.text),
          )),
    )
  )
    throw Error("출처 확인 초안 형식을 읽지 못했어요. 원문을 보존했어요.");
  return d;
}
export function readProfileDrafts(raw) {
  if (raw === null || raw === undefined) return { v: 1, edits: {} };
  const x = JSON.parse(raw);
  if (profileEditDuplicateMembers(raw))
    throw Error("옷 정보 초안에 같은 이름이 두 번 있어 원문을 보존했어요.");
  profileEditKeys(x, ["v", "edits"]);
  if (
    x.v !== 1 ||
    !profileEditObject(x.edits) ||
    Object.keys(x.edits).length > 1000
  )
    throw Error("옷 정보 초안 버전을 읽지 못했어요. 원문을 보존했어요.");
  for (const [id, d] of Object.entries(x.edits)) {
    validateProfileEdit(d);
    if (id !== d.garmentId)
      throw Error("옷 정보 초안 대상이 달라 원문을 보존했어요.");
  }
  return structuredClone(x);
}
export function profileFromEdit(d) {
  validateProfileEdit(d);
  const old = d.baseProfile || { v: 1 },
    p = structuredClone(old),
    f = d.form,
    initial = profileEditDraft({
      id: d.garmentId,
      kind: d.kind,
      profile: old,
    }).form;
  const measures = { ...(p.measures || {}) };
  for (const key of measureFieldsFor({ kind: d.kind })) {
    const raw = f.measures[key] || "";
    if (
      raw === initial.measures[key] &&
      f.measureSources[key] === initial.measureSources[key]
    )
      continue;
    if (!raw.trim()) {
      delete measures[key];
      continue;
    }
    const cm = parseMeasureInput(raw);
    if (cm === null)
      throw Error(
        `${MEASURES[key]}을 숫자(cm)로 확인해 주세요. 입력 초안은 그대로예요.`,
      );
    measures[key] = { cm, source: f.measureSources[key] };
  }
  if (Object.keys(measures).length) p.measures = measures;
  else delete p.measures;
  for (const key of PROFILE_EDIT_ATTRS) {
    const value = f.attributes[key];
    if (
      value !== initial.attributes[key] ||
      (key === "pattern" && f.patternNote !== initial.patternNote)
    ) {
      if (!value) {
        delete p[key];
        continue;
      }
      p[key] = {
        value,
        source: "chosen",
        ...(key === "pattern" && f.patternNote.trim()
          ? { note: f.patternNote }
          : {}),
      };
    }
    if (p[key]?.source === "ai" && f.confirmed.includes(key))
      p[key].source = "chosen";
  }
  if (f.details !== initial.details) {
    const lines = f.details
      .split("\n")
      .map((t) => t.trim())
      .filter(Boolean);
    if (lines.length)
      p.details = lines.map((text) => {
        const original = (old.details || []).find((d) => d.text === text);
        return original
          ? structuredClone(original)
          : { text, source: "chosen" };
      });
    else delete p.details;
  }
  for (const detail of p.details || [])
    if (
      detail.source === "ai" &&
      f.confirmed.includes("detail|" + detailKey(detail.text))
    )
      detail.source = "chosen";
  for (const key of ["purpose", "series"]) {
    if (f[key]) p[key] = f[key];
    else delete p[key];
  }
  if (f.reference) p.reference = true;
  else delete p.reference;
  return validateProfile(p, { kind: d.kind });
}

function profileEditDuplicateMembers(text) {
  const stack = [];
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      const start = i++;
      for (; i < text.length; i++) {
        if (text[i] === "\\") i++;
        else if (text[i] === '"') break;
      }
      let next = i + 1;
      while (next < text.length && /\s/.test(text[next])) next++;
      if (text[next] === ":") {
        const names = stack[stack.length - 1],
          key = JSON.parse(text.slice(start, i + 1));
        if (names?.has(key)) return true;
        names?.add(key);
      }
    } else if (c === "{") stack.push(new Set());
    else if (c === "[") stack.push(null);
    else if (c === "}" || c === "]") stack.pop();
  }
  return false;
}
