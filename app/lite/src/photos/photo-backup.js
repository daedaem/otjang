// Photo bytes never enter a network/provider request. This module only accepts
// local Blobs and a local repository. Text remains the #74/#76 backup contract.
import {MIRROR_DRAFT_KEY,readMirrorDraft} from '../domain/mirror-draft.js';
export const PHOTO_PENDING_KEY = "eoul-backup:photos-pending";
export const MAX_PHOTO_BYTES = 8 * 1024 * 1024,
  MAX_BUNDLE_BYTES = 64 * 1024 * 1024,
  MAX_PHOTOS = 2000;
export const MAX_BINARY_BYTES = 1024 * 1024 * 1024;
const MAGIC = "EOULPH01",
  MAX_HEADER_BYTES = 8 * 1024 * 1024;
const APP = "eoul-photo-backup",
  FORM = 1,
  terminal = (p) => p === "committed" || p === "rolled-back";
const object = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const same = (a, b) =>
  JSON.stringify(Object.entries(a).sort()) ===
  JSON.stringify(Object.entries(b).sort());
const problem = (message) =>
  Object.assign(new Error(message), { code: "photo_recovery_pending" });
const encode = (bytes) => {
  let s = "";
  for (let i = 0; i < bytes.length; i += 16384)
    s += String.fromCharCode(...bytes.subarray(i, i + 16384));
  return btoa(s);
};
function decode(s) {
  if (
    typeof s !== "string" ||
    s.length > Math.ceil(MAX_PHOTO_BYTES / 3) * 4 ||
    s.length % 4 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(s)
  )
    throw Error("사진 글자 형식이나 크기를 확인해 주세요.");
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}
export async function photoRecord(
  blob,
  {
    role = "garment",
    width = null,
    height = null,
    at = new Date().toISOString(),
  } = {},
  crypto = globalThis.crypto,
) {
  if (
    !blob ||
    typeof blob.arrayBuffer !== "function" ||
    !Number.isInteger(blob.size) ||
    blob.size < 1 ||
    blob.size > MAX_PHOTO_BYTES
  )
    throw Error("사진은 8MB 이하의 기기 파일을 골라 주세요.");
  if (
    !["image/png", "image/jpeg", "image/webp"].includes(blob.type) ||
    !["garment", "body"].includes(role)
  )
    throw Error("내가 찍은 PNG·JPEG·WebP 사진만 보관해요.");
  if (
    ![width, height].every(
      (v) => v === null || (Number.isInteger(v) && v > 0 && v <= 30000),
    ) ||
    typeof at !== "string" ||
    !Number.isFinite(Date.parse(at))
  )
    throw Error("사진 정보가 올바르지 않아요.");
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (bytes.byteLength !== blob.size || bytes.byteLength > MAX_PHOTO_BYTES)
    throw Error("사진 크기가 보관 정보와 달라요.");
  const magic =
    blob.type === "image/png"
      ? bytes[0] === 137 &&
        bytes[1] === 80 &&
        bytes[2] === 78 &&
        bytes[3] === 71
      : blob.type === "image/jpeg"
        ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
        : String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" &&
          String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP";
  if (!magic)
    throw Error("사진 파일 형식이 표기와 달라요. 원본은 바꾸지 않았어요.");
  const digest = [
    ...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
  ]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
  return {
    id: "p_" + digest,
    digest,
    mime: blob.type,
    blob: blob instanceof Blob ? blob : new Blob([bytes], { type: blob.type }),
    role,
    width,
    height,
    at,
  };
}
export function createPhotoBackup({
  storage,
  repository,
  textBackup: BK,
  crypto = globalThis.crypto,
}) {
  const recognized = new WeakSet();
  const freezeFile = (value) => {
    Object.freeze(value.text.data);
    Object.freeze(value.text);
    for (const row of value.photos) Object.freeze(row);
    Object.freeze(value.photos);
    Object.freeze(value);
    recognized.add(value);
    return value;
  };
  const normalized = async (value) =>
    recognized.has(value)
      ? value
      : value?.sourceFile instanceof Blob
        ? readFile(value.sourceFile)
        : value instanceof Blob
          ? readFile(value)
          : read(JSON.stringify(value));
  const marker = () => storage.getItem(PHOTO_PENDING_KEY);
  const setMarker = (id) => {
    const raw = JSON.stringify({ v: 1, id });
    storage.setItem(PHOTO_PENDING_KEY, raw);
    if (marker() !== raw) throw problem("사진 복구 표식을 보관하지 못했어요.");
  };
  const clearMarker = (id) => {
    const raw = marker();
    if (raw === null) return;
    let current;
    try {
      current = JSON.parse(raw);
    } catch {
      throw problem("복구 표식 원문을 보존했어요.");
    }
    if (current?.v !== 1 || current.id !== id)
      throw problem("다른 복구 표식을 지우지 않았어요.");
    storage.removeItem(PHOTO_PENDING_KEY);
    if (marker() !== null)
      throw problem("자료는 적용됐지만 복구 표식 정리가 끝나지 않았어요.");
  };
  const textOperation = (fn) => {
    if (typeof BK.withPhotoTransaction !== "function")
      throw problem("앱을 갱신한 뒤 사진 복구를 진행해 주세요.");
    return BK.withPhotoTransaction(fn);
  };
  const clearFinished = async () => {
    const j = await repository.pending();
    if (j && terminal(j.phase) && marker() === null)
      await repository.clearJournal(j.id);
  };
  const assertReady = async () => {
    if (marker() !== null || storage.getItem(BK.NEXT) !== null)
      throw problem("앞선 복구를 먼저 마쳐 주세요.");
    const j = await repository.pending();
    if (j && !terminal(j.phase))
      throw problem("사진 복구 기록이 남아 있어요. 먼저 복구해 주세요.");
  };
  function textRecord(value, mode) {
    if (mode === "photos-only") {
      if (
        !object(value) ||
        value.app !== BK.APP ||
        ![1, BK.FORMAT].includes(value.format) ||
        !object(value.data) ||
        Object.keys(value.data).length
      )
        throw Error("사진만 보관하는 파일의 글자 자료가 올바르지 않아요.");
      BK.manifest(value.data);
      BK.requireSize(JSON.stringify(value));
      return value;
    }
    const parsed = BK.read(JSON.stringify(value)),
      out = { ...value, data: parsed.data };
    BK.requireSize(JSON.stringify(out));
    return out;
  }
  async function read(text) {
    if (
      typeof text !== "string" ||
      new TextEncoder().encode(text).byteLength > MAX_BUNDLE_BYTES
    )
      throw Error("사진 묶음은 64MB 이하 파일로 골라 주세요.");
    let v;
    try {
      v = JSON.parse(text);
    } catch {
      throw Error("사진 포함 백업 JSON이 아니에요.");
    }
    if (
      BK.duplicates(text) ||
      !object(v) ||
      v.app !== APP ||
      v.format !== FORM ||
      !["full", "photos-only"].includes(v.mode) ||
      !Array.isArray(v.photos) ||
      v.photos.length > MAX_PHOTOS
    )
      throw Error("사진 포함 백업 형식·버전·중복 항목을 확인해 주세요.");
    const normalizedText = textRecord(v.text, v.mode),
      photos = [],
      ids = new Set();
    for (const row of v.photos) {
      if (
        !object(row) ||
        ![
          "id",
          "digest",
          "mime",
          "role",
          "width",
          "height",
          "at",
          "data",
        ].every((k) => Object.hasOwn(row, k)) ||
        Object.keys(row).some(
          (k) =>
            ![
              "id",
              "digest",
              "mime",
              "role",
              "width",
              "height",
              "at",
              "data",
            ].includes(k),
        ) ||
        ids.has(row.id)
      )
        throw Error("사진 항목이 중복되거나 알 수 없는 형식이에요.");
      const blob = new Blob([decode(row.data)], { type: row.mime }),
        record = await photoRecord(blob, row, crypto);
      if (record.id !== row.id || record.digest !== row.digest)
        throw Error("사진 원문과 해시가 달라서 복원하지 않았어요.");
      ids.add(row.id);
      const wire = { ...row };
      Object.defineProperty(wire, "blob", { value: blob });
      photos.push(wire);
    }
    if (v.mode === "photos-only" && !photos.length)
      throw Error("백업할 자료가 없어요.");
    return freezeFile({ ...v, text: normalizedText, photos });
  }
  async function make() {
    await assertReady();
    const text = BK.make(),
      photos = [],
      rows = await repository.list();
    if (rows.length > MAX_PHOTOS)
      throw Error("사진 묶음은 2000장까지 담을 수 있어요.");
    let estimated =
      new TextEncoder().encode(JSON.stringify(text)).byteLength + 300;
    for (const row of rows) {
      estimated += Math.ceil(row.blob?.size / 3) * 4 + 700;
      if (!Number.isFinite(estimated) || estimated > MAX_BUNDLE_BYTES)
        throw Error("사진 포함 백업이 64MB를 넘어요. 원본은 그대로예요.");
      const verified = await photoRecord(row.blob, row, crypto);
      if (verified.id !== row.id || verified.digest !== row.digest)
        throw Error(
          "보관 사진의 해시를 확인하지 못했어요. 사진을 지우지 않았어요.",
        );
      photos.push({
        id: row.id,
        digest: row.digest,
        mime: row.mime,
        role: row.role,
        width: row.width,
        height: row.height,
        at: row.at,
        data: encode(new Uint8Array(await verified.blob.arrayBuffer())),
      });
    }
    if (photos.length > MAX_PHOTOS)
      throw Error("사진 묶음은 2000장까지 담을 수 있어요.");
    const value = {
      app: APP,
      format: FORM,
      mode: Object.keys(text.data).length ? "full" : "photos-only",
      at: new Date().toISOString(),
      text,
      photos,
    };
    if (
      new TextEncoder().encode(JSON.stringify(value)).byteLength >
      MAX_BUNDLE_BYTES
    )
      throw Error("사진 포함 백업이 64MB를 넘어요. 원본은 그대로예요.");
    if (value.mode === "photos-only" && !photos.length)
      throw Error("백업할 자료가 없어요.");
    return value;
  }
  async function makeFile() {
    await assertReady();
    const text = BK.make(),
      rows = await repository.list(),
      photos = [],
      chunks = [];
    let size = 12;
    if (rows.length > MAX_PHOTOS)
      throw Error("사진 묶음은 2000장까지 담을 수 있어요.");
    for (const row of rows) {
      size += row.blob?.size || 0;
      if (size > MAX_BINARY_BYTES)
        throw Error("사진 묶음은 1GB 이하로 보관해 주세요.");
      const verified = await photoRecord(row.blob, row, crypto);
      if (verified.id !== row.id || verified.digest !== row.digest)
        throw Error("보관 사진 원문을 확인하지 못했어요. 삭제하지 않았어요.");
      const { blob, ...meta } = verified;
      photos.push({ ...meta, bytes: blob.size });
      chunks.push(blob);
    }
    const header = {
      app: APP,
      format: 2,
      mode: Object.keys(text.data).length ? "full" : "photos-only",
      at: new Date().toISOString(),
      text,
      photos,
    };
    if (!photos.length && header.mode === "photos-only")
      throw Error("백업할 자료가 없어요.");
    const bytes = new TextEncoder().encode(JSON.stringify(header));
    if (
      bytes.byteLength > MAX_HEADER_BYTES ||
      size + bytes.byteLength > MAX_BINARY_BYTES
    )
      throw Error("사진 묶음 크기 한도를 넘었어요. 원본은 그대로예요.");
    const prefix = new Uint8Array(12);
    prefix.set(new TextEncoder().encode(MAGIC));
    new DataView(prefix.buffer).setUint32(8, bytes.byteLength, false);
    return new Blob([prefix, bytes, ...chunks], {
      type: "application/octet-stream",
    });
  }
  async function readFile(file) {
    if (!(file instanceof Blob) || file.size > MAX_BINARY_BYTES)
      throw Error("사진 묶음은 1GB 이하 파일로 골라 주세요.");
    const prefix = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    if (new TextDecoder().decode(prefix.subarray(0, 8)) !== MAGIC) {
      if (file.size > MAX_BUNDLE_BYTES)
        throw Error("글자형 사진 백업은 64MB 이하 파일로 골라 주세요.");
      return read(await file.text());
    }
    if (prefix.byteLength !== 12) throw Error("사진 묶음 머리글이 잘렸어요.");
    const length = new DataView(prefix.buffer).getUint32(8, false);
    if (length > MAX_HEADER_BYTES || length < 1 || 12 + length > file.size)
      throw Error("사진 묶음 머리글 길이를 확인해 주세요.");
    const raw = await file.slice(12, 12 + length).text();
    let h;
    try {
      h = JSON.parse(raw);
    } catch {
      throw Error("사진 묶음 머리글을 읽지 못했어요.");
    }
    if (
      BK.duplicates(raw) ||
      !object(h) ||
      h.app !== APP ||
      h.format !== 2 ||
      !["full", "photos-only"].includes(h.mode) ||
      !Array.isArray(h.photos) ||
      h.photos.length > MAX_PHOTOS
    )
      throw Error("사진 묶음 형식·버전을 확인해 주세요.");
    const text = textRecord(h.text, h.mode),
      photos = [],
      ids = new Set();
    let offset = 12 + length;
    for (const row of h.photos) {
      if (
        !object(row) ||
        ![
          "id",
          "digest",
          "mime",
          "role",
          "width",
          "height",
          "at",
          "bytes",
        ].every((k) => Object.hasOwn(row, k)) ||
        Object.keys(row).some(
          (k) =>
            ![
              "id",
              "digest",
              "mime",
              "role",
              "width",
              "height",
              "at",
              "bytes",
            ].includes(k),
        ) ||
        ids.has(row.id) ||
        !Number.isInteger(row.bytes) ||
        row.bytes < 1 ||
        row.bytes > MAX_PHOTO_BYTES ||
        offset + row.bytes > file.size
      )
        throw Error("사진 묶음의 항목·길이·중복을 확인해 주세요.");
      const blob = file.slice(offset, offset + row.bytes, row.mime),
        checked = await photoRecord(blob, row, crypto);
      offset += row.bytes;
      if (checked.id !== row.id || checked.digest !== row.digest)
        throw Error("사진 해시가 달라 복원하지 않았어요.");
      ids.add(row.id);
      const wire = { ...row };
      Object.defineProperty(wire, "blob", { value: blob });
      photos.push(wire);
    }
    if (offset !== file.size || (!photos.length && h.mode === "photos-only"))
      throw Error("사진 묶음 길이가 맞지 않거나 자료가 없어요.");
    const result = { ...h, text, photos };
    Object.defineProperty(result, "sourceFile", { value: file });
    return freezeFile(result);
  }
  function references(data) {
    const refs = new Set();
    try {
      const state = JSON.parse(
        data[globalThis.window?.EOUL_MOCK_KEY || "eoul-d12-hang:v1"] || "null",
      );
      for (const g of state?.garments || []) if (g.photoId) refs.add(g.photoId);
    } catch {}
    try{const mirror=readMirrorDraft(data[MIRROR_DRAFT_KEY]);if(mirror.body)refs.add(mirror.body.photoId);}catch{}
    return refs;
  }
  async function preview(value) {
    const file = await normalized(value),
      before = BK.snapshot(),
      plan =
        file.mode === "photos-only"
          ? { data: before, report: {} }
          : BK.prepareRestore(file.text.data, before);
    const all = new Set([
        ...(await repository.list()).map((p) => p.id),
        ...file.photos.map((p) => p.id),
      ]),
      refs = references(plan.data);
    return {
      file,
      plan,
      missing: [...refs].filter((id) => !all.has(id)),
      orphans: [...all].filter((id) => !refs.has(id)),
      photoCount: file.photos.length,
      mode: file.mode,
    };
  }
  function journalOK(j) {
    if (
      !object(j) ||
      j.v !== 1 ||
      typeof j.id !== "string" ||
      !["prepared", "applied", "committed", "rolled-back"].includes(j.phase) ||
      !object(j.before) ||
      !(j.priorStash === null || typeof j.priorStash === "string") ||
      j.priorNext !== null
    )
      throw problem("복구 기록을 읽지 못했어요. 원문을 지우지 않았어요.");
    BK.manifest(j.before);
    if (j.after !== null && j.after !== undefined) BK.manifest(j.after);
    return j;
  }
  function restoreStash(j) {
    if (j.priorStash === null) storage.removeItem(BK.STASH);
    else storage.setItem(BK.STASH, j.priorStash);
    if (storage.getItem(BK.STASH) !== j.priorStash)
      throw problem("이전 복구 지점 보관을 마치지 못했어요.");
    storage.removeItem(BK.NEXT);
    if (storage.getItem(BK.NEXT) !== null)
      throw problem("복구 지점 정리가 끝나지 않았어요.");
  }
  async function restore(value) {
    const prepared = await preview(value);
    await assertReady();
    await clearFinished();
    const before = BK.snapshot(),
      priorStash = storage.getItem(BK.STASH),
      j = {
        v: 1,
        id: crypto.randomUUID(),
        phase: "prepared",
        before,
        priorStash,
        priorNext: null,
        after: null,
      };
    await repository.saveJournal(j); // Repository claims this slot atomically.
    try {
      setMarker(j.id);
    } catch (error) {
      if (marker() === null)
        try {
          await repository.clearJournal(j.id);
        } catch {}
      throw error;
    }
    if (
      !same(before, BK.snapshot()) ||
      storage.getItem(BK.STASH) !== priorStash ||
      storage.getItem(BK.NEXT) !== null
    ) {
      await repository.saveJournal({ ...j, phase: "rolled-back" });
      clearMarker(j.id);
      throw Error("준비하는 동안 자료가 바뀌어 복원하지 않았어요.");
    }
    for (const row of prepared.file.photos) await repository.put(row);
    if (
      !same(before, BK.snapshot()) ||
      storage.getItem(BK.STASH) !== priorStash ||
      storage.getItem(BK.NEXT) !== null
    ) {
      await repository.saveJournal({ ...j, phase: "rolled-back" });
      clearMarker(j.id);
      throw Error(
        "사진을 보관하는 동안 자료가 바뀌어 글자는 복원하지 않았어요.",
      );
    }
    const target =
      prepared.file.mode === "photos-only" ? before : prepared.file.text.data;
    textOperation(() => BK.restore(target));
    if (storage.getItem(BK.NEXT) !== null)
      throw problem(
        "글자 자료의 복구 지점 정리가 끝나지 않았어요. 먼저 복구해 주세요.",
      );
    j.phase = "applied";
    j.after = BK.snapshot();
    j.stashAfter = storage.getItem(BK.STASH);
    await repository.saveJournal(j);
    await repository.promoteUndo(j);
    clearMarker(j.id);
    try {
      await repository.clearJournal(j.id);
    } catch {}
    return {
      complete: true,
      missing: prepared.missing,
      orphans: prepared.orphans,
      photoCount: prepared.photoCount,
    };
  }
  async function recover() {
    const raw = marker(),
      j = journalOK(await repository.pending());
    let m = null;
    if (raw !== null) {
      try {
        m = JSON.parse(raw);
      } catch {
        throw problem("복구 표식의 원문을 보존했어요.");
      }
      if (m?.v !== 1 || m.id !== j.id)
        throw problem("복구 기록과 표식이 달라요. 원문을 보존했어요.");
    }
    if (terminal(j.phase)) {
      if (raw !== null) clearMarker(j.id);
      try {
        await repository.clearJournal(j.id);
      } catch {}
      return { complete: true, rolledBack: j.phase === "rolled-back" };
    }
    if (
      raw === null &&
      !same(BK.snapshot(), j.before) &&
      !(j.after && same(BK.snapshot(), j.after))
    )
      throw problem("복구 중 다른 자료가 생겼어요. 덮어쓰지 않았어요.");
    if (raw === null) setMarker(j.id);
    textOperation(() => BK.apply(j.before));
    restoreStash(j);
    await repository.saveJournal({ ...j, phase: "rolled-back" });
    clearMarker(j.id);
    try {
      await repository.clearJournal(j.id);
    } catch {}
    return { complete: true, rolledBack: true };
  }
  async function undo() {
    await assertReady();
    await clearFinished();
    const prior = await repository.undo();
    if (!prior || storage.getItem(BK.STASH) !== prior.stashAfter)
      throw Error("이 사진 백업의 되돌리기 지점이 아니에요.");
    const j = {
      ...journalOK(prior),
      id: crypto.randomUUID(),
      phase: "prepared",
      before: BK.snapshot(),
      priorStash: storage.getItem(BK.STASH),
      priorNext: null,
      after: null,
    };
    await repository.saveJournal(j);
    setMarker(j.id);
    if (
      !same(BK.snapshot(), j.before) ||
      storage.getItem(BK.STASH) !== j.priorStash ||
      storage.getItem(BK.NEXT) !== null
    ) {
      await repository.saveJournal({ ...j, phase: "rolled-back" });
      clearMarker(j.id);
      throw Error("준비하는 동안 자료가 바뀌어 되돌리지 않았어요.");
    }
    textOperation(() => BK.apply(prior.before));
    restoreStash(prior);
    await repository.saveJournal({ ...j, phase: "committed" });
    clearMarker(j.id);
    try {
      await repository.clearJournal(j.id);
    } catch {}
    return { complete: true };
  }
  const exclusive = (run) => {
    if (typeof repository.withLock !== "function")
      throw problem("사진 복구 잠금을 확인하지 못했어요.");
    return repository.withLock(run);
  };
  return {
    make,
    read,
    makeFile,
    readFile,
    preview,
    restore: (value) => exclusive(() => restore(value)),
    recover: () => exclusive(recover),
    undo: () => exclusive(undo),
  };
}
