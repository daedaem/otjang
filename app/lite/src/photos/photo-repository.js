import { withPhotoLock } from "../domain/photo-pending.js";
import { photoRecord } from "./photo-backup.js";
// One database per wardrobe namespace. Photos are immutable; only recovery
// metadata is replaced. No quota error ever triggers deletion/reset.
export async function openPhotoRepository(
  namespace = "eoul-d12-hang:v1",
  indexedDB = globalThis.indexedDB,
) {
  if (!indexedDB) throw Error("이 브라우저에서 사진 보관함을 쓸 수 없어요.");
  const db = await new Promise((resolve, reject) => {
    let finished = false;
    const req = indexedDB.open("eoul-local-photos:" + namespace, 2);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains("photos"))
        d.createObjectStore("photos", { keyPath: "id" });
      if (!d.objectStoreNames.contains("meta")) d.createObjectStore("meta");
      if (!d.objectStoreNames.contains("photo-index")) {
        const index = d.createObjectStore("photo-index", { keyPath: "id" }),
          cursor = req.transaction.objectStore("photos").openCursor();
        cursor.onsuccess = () => {
          const c = cursor.result;
          if (!c) return;
          const row = c.value;
          index.put({
            id: row.id || c.key,
            digest: row.digest,
            mime: row.mime,
            role: row.role,
            width: row.width ?? null,
            height: row.height ?? null,
            at: row.at,
            size: row.blob?.size ?? row.bytes?.byteLength ?? 0,
          });
          c.continue();
        };
      }
    };
    req.onsuccess = () => {
      if (finished) {
        req.result.close();
        return;
      }
      finished = true;
      resolve(req.result);
    };
    req.onerror = () => {
      finished = true;
      reject(Error("사진 보관함을 열지 못했어요. 기존 자료는 그대로예요."));
    };
    req.onblocked = () => {
      finished = true;
      reject(Error("다른 탭의 사진 보관 작업을 마친 뒤 다시 열어 주세요."));
    };
  });
  const transaction = (stores, mode, run) =>
    new Promise((resolve, reject) => {
      const tx = db.transaction(stores, mode);
      let result,
        error,
        operation = stores.join(",") + ":" + mode;
      const state = {
        set: (v) => (result = v),
        watch: (request, label) => {
          request.addEventListener("error", () => {
            error = request.error;
            operation = label;
          });
          return request;
        },
        fail: (e) => {
          error = e;
          tx.abort();
        },
      };
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => {
        const cause = error || tx.error;
        const message =
          cause?.name === "QuotaExceededError"
            ? "사진 보관 공간이 부족해요. 원본은 그대로예요."
            : `사진 보관 작업을 마치지 못했어요(${cause?.name || "AbortError"}). 원본은 그대로예요.`;
        const failure = Error(message, { cause });
        failure.code = "photo_store_failed";
        failure.operation = operation;
        reject(failure);
      };
      tx.onerror = () => {};
      try {
        run(tx, state);
      } catch (e) {
        error = e;
        tx.abort();
      }
    });
  const hydrate = (row) => {
    if (!row) return null;
    if (row.blob instanceof Blob) return row;
    if (row.encoding !== 1 || !(row.bytes instanceof ArrayBuffer))
      throw Error("사진 보관 형식을 읽지 못했어요. 원문은 그대로예요.");
    const { bytes, encoding, ...meta } = row;
    return { ...meta, blob: new Blob([bytes], { type: row.mime }) };
  };
  const get = (store, key) =>
    transaction([store], "readonly", (tx, s) => {
      const q = tx.objectStore(store).get(key);
      q.onsuccess = () => {
        try {
          s.set(store === "photos" ? hydrate(q.result) : q.result || null);
        } catch (error) {
          s.fail(error);
        }
      };
    });
  return {
    withLock(run) {
      return withPhotoLock(namespace, run);
    },
    async list() {
      return transaction(["photo-index"], "readonly", (tx, s) => {
        const q = tx.objectStore("photo-index").getAll();
        q.onsuccess = () =>
          s.set(
            q.result.map((row) => {
              const { size, ...meta } = row;
              return {
                ...meta,
                blob: {
                  size,
                  type: row.mime,
                  async arrayBuffer() {
                    const stored = await get("photos", row.id);
                    if (!stored) throw Error("연결할 사진 원문이 없어요.");
                    return stored.blob.arrayBuffer();
                  },
                },
              };
            }),
          );
      });
    },
    async get(id) {
      return get("photos", id);
    },
    async thumbnail(id) {
      const row = await get("meta", "thumb:" + id);
      if (
        !row ||
        row.v !== 1 ||
        !["image/png", "image/webp"].includes(row.mime) ||
        !(row.bytes instanceof ArrayBuffer) ||
        row.bytes.byteLength > 512 * 1024
      )
        return null;
      return new Blob([row.bytes], { type: row.mime });
    },
    async cacheThumbnail(id, blob) {
      if (
        !/^p_[a-f0-9]{64}$/.test(id) ||
        !["image/png", "image/webp"].includes(blob.type) ||
        blob.size > 512 * 1024
      )
        throw Error("썸네일 형식을 확인해 주세요.");
      const bytes = await blob.arrayBuffer();
      return transaction(["meta"], "readwrite", (tx) => {
        tx.objectStore("meta").put(
          { v: 1, mime: blob.type, bytes },
          "thumb:" + id,
        );
      });
    },
    async put(record) {
      const verified = await photoRecord(record.blob, record);
      if (record.id !== verified.id || record.digest !== verified.digest)
        throw Error("사진 해시가 원문과 달라요.");
      const old = await get("photos", record.id);
      if (old) {
        const check = await photoRecord(old.blob, old);
        if (check.id !== record.id || check.digest !== old.digest)
          throw Error(
            "기존 사진의 해시를 확인하지 못했어요. 원본을 보존했어요.",
          );
      }
      const { blob, ...meta } = verified,
        bytes = await blob.arrayBuffer();
      return transaction(["photos", "photo-index"], "readwrite", (tx, s) => {
        const store = tx.objectStore("photos"),
          index = tx.objectStore("photo-index"),
          q = index.get(verified.id);
        q.onsuccess = () => {
          if (
            q.result &&
            (q.result.digest !== verified.digest ||
              q.result.mime !== verified.mime)
          ) {
            s.fail(Error("같은 번호의 다른 사진을 덮지 않았어요."));
            return;
          }
          if (q.result && !old) {
            const existing = store.get(verified.id);
            existing.onsuccess = () => {
              try {
                if (!existing.result) {
                  s.fail(
                    Error("사진 색인과 원문이 달라요. 원본을 보존했어요."),
                  );
                  return;
                }
                s.set(hydrate(existing.result));
              } catch (error) {
                s.fail(error);
              }
            };
            return;
          }
          if (!old)
            s.watch(
              store.add({ ...meta, encoding: 1, bytes }),
              "photos:add-bytes",
            );
          if (!q.result) {
            const current = old || verified;
            index.put({
              id: current.id,
              digest: current.digest,
              mime: current.mime,
              role: current.role,
              width: current.width,
              height: current.height,
              at: current.at,
              size: current.blob.size,
            });
          }
          s.set(old || verified);
        };
      });
    },
    async pending() {
      return get("meta", "pending");
    },
    async undo() {
      return get("meta", "undo");
    },
    async saveJournal(value) {
      return transaction(["meta"], "readwrite", (tx, s) => {
        const store = tx.objectStore("meta"),
          q = store.get("pending");
        q.onsuccess = () => {
          const old = q.result;
          if (old && old.id !== value.id) {
            s.fail(Error("다른 사진 복원이 진행 중이에요."));
            return;
          }
          store.put(structuredClone(value), "pending");
        };
      });
    },
    async promoteUndo(value) {
      return transaction(["meta"], "readwrite", (tx, s) => {
        const store = tx.objectStore("meta"),
          q = store.get("pending");
        q.onsuccess = () => {
          if (q.result?.id !== value.id) {
            s.fail(Error("다른 복구 기록을 덮지 않았어요."));
            return;
          }
          store.put(structuredClone(value), "undo");
          store.put(
            { ...structuredClone(value), phase: "committed" },
            "pending",
          );
        };
      });
    },
    async clearJournal(id) {
      return transaction(["meta"], "readwrite", (tx) => {
        const store = tx.objectStore("meta"),
          q = store.get("pending");
        q.onsuccess = () => {
          if (q.result?.id === id) store.delete("pending");
        };
      });
    },
    close() {
      db.close();
    },
  };
}
