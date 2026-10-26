import {
  createPhotoBackup,
  photoRecord,
  PHOTO_PENDING_KEY,
  MAX_BINARY_BYTES,
} from "./photo-backup.js";
import { openPhotoRepository } from "./photo-repository.js";
const libraries = new Map(),
  clients = new Map();
export function photoLibrary(namespace = "eoul-d12-hang:v1") {
  if (!libraries.has(namespace))
    libraries.set(
      namespace,
      openPhotoRepository(namespace).catch((error) => {
        libraries.delete(namespace);
        throw error;
      }),
    );
  return libraries.get(namespace);
}
export function currentPhotoClient(namespace = "eoul-d12-hang:v1") {
  return clients.get(namespace) || null;
}
// Decode only a user's local photo. No remote URLs, retailer cutouts or network
// are accepted here. Immutable originals and derived thumbnail bytes are separate.
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file),
      img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(
        Error("사진을 읽지 못했어요. PNG·JPEG·WebP 파일을 확인해 주세요."),
      );
    };
    img.src = url;
  });
}
export async function imageDimensions(file) {
  if (
    !(file instanceof Blob) ||
    !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
    !file.size ||
    file.size > 8 * 1024 * 1024
  )
    throw Error("내가 찍은 PNG·JPEG·WebP, 8MB 이하의 사진을 골라 주세요.");
  const img = await loadImage(file);
  if (
    !img.naturalWidth ||
    !img.naturalHeight ||
    img.naturalWidth * img.naturalHeight > 12_000_000
  )
    throw Error(
      "이 화면에서는 1,200만 화소 이하 사진을 넣을 수 있어요. 더 작은 사본을 골라 주세요.",
    );
  return { width: img.naturalWidth, height: img.naturalHeight };
}
const thumbnails = new Map();
let activeDecodes = 0;
const decodeWaiters = [];
async function withDecodeSlot(work) {
  if (activeDecodes < 2) activeDecodes++;
  else await new Promise((resolve) => decodeWaiters.push(resolve));
  try {
    return await work();
  } finally {
    const next = decodeWaiters.shift();
    if (next) next();
    else activeDecodes--;
  }
}
export async function garmentThumbnail(namespace, id) {
  const key = namespace + ":" + id;
  if (thumbnails.has(key)) return thumbnails.get(key);
  const task = (async () => {
    const repository = await photoLibrary(namespace),
      cached = await repository.thumbnail(id);
    if (cached) return cached;
    return withDecodeSlot(async () => {
      const original = await repository.get(id);
      if (!original) return null;
      const img = await loadImage(original.blob);
      if (img.naturalWidth * img.naturalHeight > 12_000_000)
        throw Error(
          "이 사진은 원본 보관함에 있어요. 미리보기는 1,200만 화소 이하에서 만들 수 있어요.",
        );
      const scale = Math.min(
        1,
        320 / Math.max(img.naturalWidth, img.naturalHeight),
      );
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve) =>
        canvas.toBlob(resolve, "image/webp", 0.82),
      );
      img.src = "";
      if (!blob)
        throw Error("사진 미리보기를 만들지 못했어요. 원본은 그대로예요.");
      try {
        await repository.cacheThumbnail(id, blob);
      } catch {
        /* Derived cache failure never deletes originals or blocks a saved photo. */
      }
      return blob;
    });
  })();
  thumbnails.set(key, task);
  try {
    return await task;
  } finally {
    thumbnails.delete(key);
  }
}
// B2b will call this only for the user's own local clothing file. The original
// photo remains immutable even if the later reference write fails.
export async function saveGarmentPhoto({
  namespace,
  core,
  garmentId,
  file,
  width = null,
  height = null,
}) {
  if (core.boot?.preview)
    throw new Error("미리보기에서는 개인 사진을 저장하지 않아요.");
  core.assertPhotoReady();
  const record = await photoRecord(file, { role: "garment", width, height });
  const repository = await photoLibrary(namespace);
  return repository.withLock(async () => {
    core.assertPhotoReady();
    await repository.put(record);
    core.assertPhotoReady();
    return core.updateGarmentPhoto(garmentId, record.id);
  });
}
export async function mountPhotoBackup({
  element,
  namespace,
  core,
  storage,
  textBackup,
  onState = () => {},
  reload = () => location.reload(),
  undoButton,
  isBusy = () => false,
  setBusy = () => {},
  onSelect = () => {},
}) {
  const section = document.createElement("section");
  section.className = "bk-photo";
  section.setAttribute("aria-label", "사진 포함 백업");
  const title = document.createElement("h3");
  title.textContent = "사진까지 함께 보관";
  section.append(title);
  const note = document.createElement("p");
  note.className = "t6";
  note.textContent =
    "사진은 이 기기에만 보관해요. 아래 파일에는 옷장·기록과 원본 사진이 함께 들어가요.";
  section.append(note);
  const message = document.createElement("p");
  message.className = "t6";
  message.setAttribute("role", "status");
  message.dataset.photoStatus = "";
  section.append(message);
  element.append(section);
  if (core.boot?.preview) {
    message.textContent = "체험 화면에서는 개인 사진 보관함을 열지 않아요.";
    return;
  }
  let repository;
  try {
    repository = await photoLibrary(namespace);
  } catch (error) {
    message.textContent = error.message;
    return;
  }
  if (!element.isConnected) return;
  const controller = createPhotoBackup({ storage, repository, textBackup });
  clients.set(namespace, { controller, repository });
  let busy = false;
  const recoveryActions = document.createElement("div");
  recoveryActions.className = "decs";
  section.insertBefore(recoveryActions, message);
  const advanced = document.createElement("details"),
    advancedTitle = document.createElement("summary");
  advancedTitle.textContent = "추가 백업 옵션";
  advanced.dataset.photoOptions = "";
  const actions = document.createElement("div");
  actions.className = "decs";
  advanced.append(advancedTitle, actions);
  section.insertBefore(advanced, message);
  const setMessage = (text) => {
    if (element.isConnected) message.textContent = text;
  };
  const button = (name, action) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "btn line";
    b.textContent = name;
    b.onclick = action;
    actions.append(b);
    return b;
  };
  const recovery = button("사진 백업 복구 마치기", () =>
    run(async () => {
      await controller.recover();
      setMessage("복구를 마쳤어요. 다시 불러와요.");
      reload();
    }),
  );
  recovery.dataset.photoRecover = "";
  recoveryActions.append(recovery);
  async function recoveryState() {
    const pending =
      storage.getItem(PHOTO_PENDING_KEY) !== null ||
      !!(await repository.pending());
    recovery.hidden = !pending;
    onState();
  }
  async function run(work) {
    if (busy) return;
    if (isBusy()) {
      setMessage("진행 중인 상담이 끝나면 백업을 진행해 주세요.");
      return;
    }
    busy = true;
    setBusy(true);
    section.setAttribute("aria-busy", "true");
    for (const b of element.querySelectorAll("button,input")) b.disabled = true;
    try {
      await work();
    } catch (error) {
      setMessage(
        error.message || "사진 보관 작업을 마치지 못했어요. 원본은 그대로예요.",
      );
    } finally {
      busy = false;
      setBusy(false);
      section.removeAttribute("aria-busy");
      for (const b of element.querySelectorAll("button,input"))
        b.disabled = false;
      try {
        await recoveryState();
      } catch (error) {
        setMessage(error.message);
      }
    }
  }
  const persist = button("기기 사진 보관을 더 안정적으로", () =>
    run(async () => {
      if (typeof navigator.storage?.persist !== "function") {
        setMessage(
          "이 브라우저는 장기 보관 요청을 지원하지 않아요. 파일 백업을 함께 보관해 주세요.",
        );
        return;
      }
      const allowed = await navigator.storage.persist();
      setMessage(
        allowed
          ? "브라우저가 장기 보관을 허용했어요. 영구 보장은 아니므로 파일 백업도 보관해 주세요."
          : "브라우저가 장기 보관을 허용하지 않았어요. 파일 백업을 함께 보관해 주세요.",
      );
    }),
  );
  persist.dataset.photoPersist = "";
  const rows = await repository.list();
  note.textContent = `이 기기에 사진 ${rows.length}장 보관 중이에요. 기본 글자 백업에는 사진이 빠져요. 사진은 앱 서버·AI로 보내지 않아요.`;
  const exportButton = button("사진 포함 파일로 내보내기", () =>
    run(async () => {
      const blob = await controller.makeFile(),
        url = URL.createObjectURL(blob),
        a = document.createElement("a");
      if (!element.isConnected) {
        URL.revokeObjectURL(url);
        return;
      }
      a.href = url;
      a.download = `closet-photos-${textBackup.stamp()}.otjang`;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      setMessage(
        "파일 저장을 요청했어요. 파일 앱이나 다운로드 폴더에서 확인해 주세요.",
      );
    }),
  );
  exportButton.dataset.photoExport = "";
  const label = document.createElement("label");
  label.className = "btn line";
  label.textContent = "사진 포함 파일로 복원";
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".otjang,.json,application/octet-stream,application/json";
  input.hidden = true;
  input.dataset.photoFile = "";
  label.append(input);
  actions.append(label);
  const preview = document.createElement("div");
  preview.className = "bk-preview";
  preview.hidden = true;
  preview.dataset.photoPreview = "";
  section.append(preview);
  let selection = 0;
  const invalidatePreview = () => {
    selection++;
    preview.hidden = true;
    preview.replaceChildren();
  };
  const previewFile = (file) => {
    invalidatePreview();
    onSelect();
    const token = selection;
    if (!file) return;
    setMessage("사진 백업 파일을 확인하고 있어요…");
    return run(async () => {
      if (file.size > MAX_BINARY_BYTES)
        throw Error("사진 포함 파일은 1GB 이하로 골라 주세요.");
      const parsed = await controller.readFile(file),
        plan = await controller.preview(parsed);
      if (!element.isConnected || token !== selection) return;
      preview.replaceChildren();
      preview.hidden = false;
      const p = document.createElement("p");
      p.className = "t6";
      p.textContent = `${file.name ? file.name + " · " : ""}${plan.mode === "photos-only" ? "지금 옷장은 유지하고 사진만 보관해요." : "글자 자료와 사진을 파일 기준으로 복원해요."} 사진 ${plan.photoCount}장 · 사진 없는 연결 ${plan.missing.length}개 · 연결 안 된 보관 사진 ${plan.orphans.length}장. 기존 사진은 지우지 않아요.`;
      preview.append(p);
      if (plan.mode === "full") {
        const report = plan.plan.report,
          summary = document.createElement("p");
        summary.className = "t6";
        summary.dataset.photoReport = "";
        summary.textContent = `${textBackup.countText(textBackup.count(parsed.text.data))} · 정상 항목 ${report.active.length}개 · 원문 보관 ${report.archives.length}개 · 기존 활성 자료 유지 ${report.preserved.length}개 · 기존 원문 ${report.archivedCurrent.length}개는 보관 후 활성에서 교체/제거`;
        preview.append(summary);
        const list = document.createElement("ul");
        list.className = "t6";
        for (const row of [...report.archives, ...report.archivedCurrent]) {
          const li = document.createElement("li");
          li.dataset.source = row.source;
          li.textContent = `${textBackup.sourceLabel?.(row.source) || "기타 보관 자료"}: ${row.reason}${row.action ? " · 보관 후 " + row.action : ""}`;
          const diagnostics = document.createElement("details"),
            summary = document.createElement("summary"),
            key = document.createElement("code");
          summary.textContent = "복구 진단";
          key.textContent = row.source;
          diagnostics.append(summary, key);
          li.append(diagnostics);
          list.append(li);
        }
        if (list.children.length) preview.append(list);
      }
      const confirm = document.createElement("button");
      confirm.type = "button";
      confirm.disabled = busy;
      confirm.className = "btn go";
      confirm.textContent = "확인한 사진 백업으로 복원";
      confirm.dataset.photoConfirm = "";
      confirm.onclick = () => {
        if (token !== selection) {
          setMessage("새로 고른 파일을 다시 확인해 주세요.");
          return;
        }
        return run(async () => {
          const result = await controller.restore(parsed);
          if (!result.complete) throw Error("복구 정리를 먼저 마쳐 주세요.");
          setMessage("복원을 마쳤어요. 다시 불러와요.");
          reload();
        });
      };
      preview.append(confirm);
      setMessage("복원할 파일과 원문 보관·유지 내용을 확인해 주세요.");
    });
  };
  input.onchange = () => {
    void previewFile(input.files?.[0]);
  };
  const primaryExport = element.querySelector("[data-bk-save]");
  if (rows.length && primaryExport) {
    const textOnly = primaryExport.onclick;
    primaryExport.textContent = "옷장·사진 전체 파일로 내보내기";
    primaryExport.onclick = exportButton.onclick;
    for (const selector of ["[data-bk-copy]", "[data-bk-paste]"]) {
      const control = element.querySelector(selector);
      if (control) actions.append(control);
    }
    button("글자 자료만 파일로 내보내기", textOnly);
    const summary = element.querySelector(":scope > .sub");
    if (summary)
      summary.textContent = `${textBackup.countText(textBackup.count(textBackup.classify(textBackup.snapshot()).data))} · 원본 사진 ${rows.length}장을 함께 보관해요. 읽을 수 없는 원문은 별도로 보관하며 사진은 서버·AI로 보내지 않아요.`;
    note.textContent = `이 기기에 사진 ${rows.length}장 보관 중이에요. 기본 파일 내보내기에 사진을 포함해요. 글자 복사에는 사진이 빠져요.`;
  }
  const undo = await repository.undo();
  if (
    undoButton &&
    undo &&
    storage.getItem(textBackup.STASH) === undo.stashAfter
  ) {
    undoButton.onclick = () =>
      run(async () => {
        await controller.undo();
        setMessage("사진 백업 전으로 되돌렸어요.");
        reload();
      });
    undoButton.dataset.photoUndo = "";
  }
  await recoveryState();
  section.dataset.photoReady = "true";
  return {
    previewFile,
    invalidatePreview,
    close() {
      clients.delete(namespace);
    },
  };
}
