// Legacy UI metadata remains distinct from snapshot registration receipts.
// Reading is strict and side-effect free; supported extra fields remain opaque.
import { hasDuplicateJsonMembers } from "./json-members.js";
export function readLegacyRegistrations(raw) {
  if (raw === null || raw === undefined) return { items: {}, catalog: {} };
  const reject = () => {
    throw Error(
      "저장된 브랜드·링크 정보를 읽지 못했어요. 원문을 보관한 뒤 다시 확인해 주세요.",
    );
  };
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    reject();
  }
  const object = (x) =>
    x !== null && typeof x === "object" && !Array.isArray(x);
  const link = (x) => {
    if (x === "") return true;
    if (typeof x !== "string") return false;
    try {
      return ["http:", "https:"].includes(new URL(x).protocol);
    } catch {
      return false;
    }
  };
  if (
    hasDuplicateJsonMembers(raw) ||
    !object(value) ||
    (value.v !== undefined && value.v !== 1) ||
    (value.items !== undefined && !object(value.items)) ||
    (value.catalog !== undefined && !object(value.catalog))
  )
    reject();
  for (const records of [value.items || {}, value.catalog || {}])
    for (const record of Object.values(records)) {
      if (!object(record)) reject();
      for (const key of ["brand", "name", "kind", "key", "at"])
        if (record[key] !== undefined && typeof record[key] !== "string")
          reject();
      if (
        record.color !== undefined &&
        record.color !== null &&
        typeof record.color !== "string"
      )
        reject();
      if (record.url !== undefined && !link(record.url)) reject();
    }
  return {
    ...structuredClone(value),
    items: structuredClone(value.items || {}),
    catalog: structuredClone(value.catalog || {}),
  };
}
