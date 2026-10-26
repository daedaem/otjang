// Candidate facts remain separate from owned garments. Raw text is a resumable
// note; parsing it never adds an item or claims a fitting size.
import { hasDuplicateJsonMembers } from "./json-members.js";
import {
  measureFieldsFor,
  MEASURES,
  parseMeasureInput,
} from "./garment-profile.js";
import { SLOTS } from "./data/slots.js";
import { GARMENT_KINDS } from "./wardrobe.js";
import { parseSizeChart, sizeChartOptions } from "./size-chart.js";
import {
  compareMeasures,
  closestSize,
  overlaySketches,
  NOTE,
} from "./measure-compare.js";
export const MEASUREMENT_DRAFT_KEY = "eoul-d12-hang:measure-drafts:v1";
const MEASUREMENT_KINDS = new Set([
  ...GARMENT_KINDS.map((k) => k.id),
  ...SLOTS.map((s) => s.shape),
]);
const measureObject = (x) =>
  x !== null && typeof x === "object" && !Array.isArray(x);
function measurementKeys(x, allowed) {
  if (!measureObject(x) || Object.keys(x).some((k) => !allowed.includes(k)))
    throw Error("실측 비교 초안의 새 형식을 읽지 못해 원문을 보존했어요.");
}
export function measurementDraft(product, at = new Date().toISOString()) {
  const d = {
    v: 1,
    productId: product.id,
    kind: product.kind,
    referenceId: null,
    mode: "manual",
    manual: Object.fromEntries(measureFieldsFor(product).map((k) => [k, ""])),
    source: "seller",
    table: "",
    selected: "",
    updatedAt: at,
  };
  validateMeasurementDraft(d);
  return d;
}
export function validateMeasurementDraft(d) {
  measurementKeys(d, [
    "v",
    "productId",
    "kind",
    "referenceId",
    "mode",
    "manual",
    "source",
    "table",
    "selected",
    "updatedAt",
  ]);
  if (
    d.v !== 1 ||
    typeof d.productId !== "string" ||
    !/^ms-\d+$/.test(d.productId) ||
    !MEASUREMENT_KINDS.has(d.kind) ||
    !(
      d.referenceId === null ||
      (typeof d.referenceId === "string" &&
        /^[-\w]{1,100}$/.test(d.referenceId))
    ) ||
    !["manual", "table"].includes(d.mode) ||
    !["seller", "measured"].includes(d.source) ||
    typeof d.table !== "string" ||
    d.table.length > 20000 ||
    typeof d.selected !== "string" ||
    d.selected.length > 100 ||
    typeof d.updatedAt !== "string" ||
    !Number.isFinite(Date.parse(d.updatedAt))
  )
    throw Error("실측 비교 초안 버전이나 값을 읽지 못해 원문을 보존했어요.");
  const fields = measureFieldsFor({ kind: d.kind });
  measurementKeys(d.manual, fields);
  if (
    Object.keys(d.manual).length !== fields.length ||
    fields.some(
      (k) => typeof d.manual[k] !== "string" || d.manual[k].length > 20,
    )
  )
    throw Error("실측 비교 숫자 초안 형식을 읽지 못해 원문을 보존했어요.");
  return d;
}
export function readMeasurementDrafts(raw) {
  if (raw === null || raw === undefined) return { v: 1, entries: {} };
  const x = JSON.parse(raw);
  if (hasDuplicateJsonMembers(raw))
    throw Error("실측 비교 초안에 같은 이름이 두 번 있어 원문을 보존했어요.");
  measurementKeys(x, ["v", "entries"]);
  if (
    x.v !== 1 ||
    !measureObject(x.entries) ||
    Object.keys(x.entries).length > 1000
  )
    throw Error("실측 비교 초안 버전을 읽지 못해 원문을 보존했어요.");
  for (const [id, d] of Object.entries(x.entries)) {
    validateMeasurementDraft(d);
    if (id !== d.productId) throw Error("비교 상품이 달라 원문을 보존했어요.");
  }
  return structuredClone(x);
}
export function measurementResult(d, item, reference) {
  validateMeasurementDraft(d);
  if (item.kind !== d.kind)
    throw Error("상품 종류가 바뀌어 초안을 자동으로 적용하지 않았어요.");
  const problems = [],
    warnings = [];
  let options = [];
  if (d.mode === "table") {
    const parsed = sizeChartOptions(parseSizeChart(d.table), item);
    options = parsed.options;
    warnings.push(...parsed.warnings);
    const labels = new Map();
    for (const option of options)
      labels.set(option.label, (labels.get(option.label) || 0) + 1);
    const repeated = [...labels]
      .filter(([, count]) => count > 1)
      .map(([label]) => label);
    if (repeated.length) {
      options = options.filter((option) => !repeated.includes(option.label));
      warnings.push(
        `${repeated.join("·")} 사이즈가 두 번 이상 나와 수치를 고르지 않았어요. 표를 확인해 주세요.`,
      );
    }
  } else {
    const measures = {};
    for (const key of measureFieldsFor(item)) {
      const text = d.manual[key].trim();
      if (!text) continue;
      const cm = parseMeasureInput(text);
      if (cm === null)
        problems.push(`${MEASURES[key]}을 숫자(cm)로 확인해 주세요.`);
      else measures[key] = { cm, source: d.source };
    }
    if (!problems.length && Object.keys(measures).length)
      options = [{ label: "입력한 실측", measures }];
  }
  const ref = reference?.kind === item.kind ? reference : null,
    refMeasures = ref?.profile?.measures || {};
  const closest = closestSize(options, refMeasures, item);
  const active =
    d.mode === "manual"
      ? options[0] || null
      : d.selected
        ? options.find((o) => o.label === d.selected) || null
        : (closest.best
            ? options.find((o) => o.label === closest.best)
            : null) || null;
  if (d.mode === "table" && d.selected && !active)
    warnings.push(
      "선택했던 사이즈를 현재 표에서 확인하지 못해 다른 사이즈로 바꾸지 않았어요. 다시 선택해 주세요.",
    );
  const comparison = active
    ? compareMeasures(active.measures, refMeasures, item)
    : null;
  const sketch =
    active && ref ? overlaySketches(item, active.measures, refMeasures) : null;
  return {
    options,
    active,
    closest,
    comparison,
    sketch,
    problems,
    warnings,
    note: NOTE,
    hasReference: !!ref,
  };
}
