// Lightweight codec shared by text backup and photo-reference discovery. Keep
// catalog/geometry/browser dependencies out of this module.
import { hasDuplicateJsonMembers } from "./json-members.js";
export const MIRROR_DRAFT_KEY = "eoul-d12-hang:mirror:v1";
export const MIRROR_NOTE = "분위기 미리보기 · 핏 근거 아님";
const mirrorObject = (x) =>
  x !== null && typeof x === "object" && !Array.isArray(x);
const mirrorKeys = (x, keys) =>
  mirrorObject(x) &&
  Object.keys(x).length === keys.length &&
  Object.keys(x).every((k) => keys.includes(k));
const mirrorPhotoId = (id) =>
  typeof id === "string" && /^p_[a-f0-9]{64}$/.test(id);
const mirrorTimestamp = (x) =>
  x === null ||
  (typeof x === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(x) &&
    Number.isFinite(Date.parse(x)) &&
    new Date(x).toISOString() === x);
export function newMirrorDraft() {
  return {
    v: 1,
    body: null,
    heightRaw: "",
    head: null,
    feet: null,
    layers: [],
    updatedAt: null,
  };
}
export function readMirrorDraft(raw) {
  if (raw === null || raw === undefined) return newMirrorDraft();
  const reject = () => {
    throw Error(
      "거울 초안 형식을 읽지 못해 원문을 보호하고 있어요. 백업에서 보관해 주세요.",
    );
  };
  let d;
  try {
    d = JSON.parse(raw);
  } catch {
    reject();
  }
  if (
    hasDuplicateJsonMembers(raw) ||
    !mirrorKeys(d, [
      "v",
      "body",
      "heightRaw",
      "head",
      "feet",
      "layers",
      "updatedAt",
    ]) ||
    d.v !== 1 ||
    typeof d.heightRaw !== "string" ||
    d.heightRaw.length > 20 ||
    /[\x00-\x1f\x7f]/.test(d.heightRaw) ||
    !mirrorTimestamp(d.updatedAt) ||
    !Array.isArray(d.layers) ||
    d.layers.length > 12
  )
    reject();
  if (
    d.body !== null &&
    (!mirrorKeys(d.body, ["photoId", "width", "height"]) ||
      !mirrorPhotoId(d.body.photoId) ||
      ![d.body.width, d.body.height].every(
        (n) => Number.isInteger(n) && n > 0 && n <= 30000,
      ) ||
      d.body.width * d.body.height > 12000000)
  )
    reject();
  const point = (p) =>
    p === null ||
    (d.body !== null &&
      mirrorKeys(p, ["x", "y"]) &&
      Number.isFinite(p.x) &&
      Number.isFinite(p.y) &&
      p.x >= 0 &&
      p.x <= d.body.width &&
      p.y >= 0 &&
      p.y <= d.body.height);
  if (
    !point(d.head) ||
    !point(d.feet) ||
    (d.feet !== null && d.head === null) ||
    (d.head !== null && d.feet !== null && d.feet.y - d.head.y < 50)
  )
    reject();
  const ids = new Set();
  for (const layer of d.layers) {
    if (
      !mirrorKeys(layer, ["garmentId", "dx", "dy"]) ||
      typeof layer.garmentId !== "string" ||
      !/^[-\w]{1,100}$/.test(layer.garmentId) ||
      ids.has(layer.garmentId) ||
      ![layer.dx, layer.dy].every(
        (n) => Number.isFinite(n) && Math.abs(n) <= 100000,
      )
    )
      reject();
    ids.add(layer.garmentId);
  }
  return structuredClone(d);
}
export function mirrorHeight(raw) {
  if (typeof raw !== "string") return null;
  const value = raw.trim().replace(/\s*cm$/i, "");
  if (!/^\d{1,3}(?:\.\d{1,2})?$/.test(value)) return null;
  const height = Number(value);
  return height >= 100 && height <= 230 ? height : null;
}
