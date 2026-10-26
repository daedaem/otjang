// Intent and explicit targets are notes, never ownership or transaction facts.
import { PURPOSES, detailKey } from "./garment-profile.js";
import { hasDuplicateJsonMembers } from "./json-members.js";
export const COLLECTION_KEY = "eoul-d12-hang:collection:v1";
const collectionObject = (x) =>
  x !== null && typeof x === "object" && !Array.isArray(x);
const collectionKeys = (x, keys) =>
  collectionObject(x) &&
  Object.keys(x).length === keys.length &&
  Object.keys(x).every((k) => keys.includes(k));
const collectionText = (s) =>
  typeof s === "string" && s.length <= 40 && !/[\x00-\x1f\x7f]/.test(s);
export const collectionSeriesKey = (s) => detailKey(s);
export function readCollectionSettings(raw) {
  if (raw == null) return { v: 1, candidates: {}, goals: [] };
  const reject = () => {
    throw Error(
      "소장 목적·진열장 형식을 읽지 못해 원문을 보호하고 있어요. 백업에서 보관해 주세요.",
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
    !collectionKeys(x, ["v", "candidates", "goals"]) ||
    x.v !== 1 ||
    !collectionObject(x.candidates) ||
    Object.keys(x.candidates).length > 1000 ||
    !Array.isArray(x.goals) ||
    x.goals.length > 100
  )
    reject();
  for (const [id, p] of Object.entries(x.candidates)) {
    if (
      !/^ms-\d+$/.test(id) ||
      !collectionKeys(p, ["purpose", "series", "updatedAt"]) ||
      !(p.purpose === null || Object.hasOwn(PURPOSES, p.purpose)) ||
      !collectionText(p.series) ||
      typeof p.updatedAt !== "string" ||
      !Number.isFinite(Date.parse(p.updatedAt))
    )
      reject();
  }
  const seen = new Set();
  for (const goal of x.goals) {
    if (
      !collectionKeys(goal, ["series", "target"]) ||
      !collectionText(goal.series) ||
      !goal.series.trim() ||
      goal.series !== goal.series.trim() ||
      !Number.isInteger(goal.target) ||
      goal.target < 1 ||
      goal.target > 100
    )
      reject();
    const key = collectionSeriesKey(goal.series);
    if (!key || seen.has(key)) reject();
    seen.add(key);
  }
  return structuredClone(x);
}
