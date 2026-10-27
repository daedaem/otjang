import {
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  MAX_BINARY_BYTES,
  PHOTO_PENDING_KEY,
  photoBackupSession,
} from "../photos/index.js";
// WO-07: the backup sheet as React. Same markup, data-* hooks and wording as
// the vanilla backupSheet + mountPhotoBackup, reusing BK (text backup) and the
// photo backup controller unchanged. No backup format or restore rule lives
// here: every read, preview, restore and undo goes through BK / controller.
type Report = {
  active: unknown[];
  archives: Row[];
  preserved: unknown[];
  archivedCurrent: Row[];
};
type Row = { key?: string; source: string; reason: string; action?: string };
type Backup = { data: unknown; at?: string };
export type TextBackup = {
  MAX_BYTES: number;
  NEXT: string;
  STASH: string;
  lastReport: Report;
  classify(snapshot: unknown): { data: unknown; report: Report };
  snapshot(): unknown;
  count(data: unknown): unknown;
  countText(n: unknown): string;
  stash(): { at: string } | null;
  make(): unknown;
  read(text: string): Backup;
  prepareRestore(data: unknown, snapshot: unknown): { report: Report };
  restore(data: unknown): unknown;
  undo(): unknown;
  sourceLabel(source: string): string;
  stamp(): string;
};
type PhotoPlan = {
  mode: "photos-only" | "full";
  photoCount: number;
  missing: unknown[];
  orphans: unknown[];
  plan: { report: Report };
};
type Controller = {
  recover(): Promise<unknown>;
  makeFile(): Promise<Blob>;
  readFile(file: File): Promise<{ text: Backup }>;
  preview(parsed: unknown): Promise<PhotoPlan>;
  restore(parsed: unknown): Promise<{ complete: boolean }>;
  undo(): Promise<unknown>;
};
type Repository = {
  list(): Promise<unknown[]>;
  pending(): Promise<unknown>;
  undo(): Promise<{ stashAfter: string } | null>;
};
export type BackupHost = {
  bk: TextBackup;
  core: { withStorageLock(work: () => unknown): Promise<unknown> };
  namespace: string;
  storage: Storage;
  note: string;
  photos: boolean;
  whenText(iso: string): string;
  isBusy(): boolean;
  reopen(note: string): void;
  reload(): void;
  photoReload(): void;
  onState(): void;
  reduce(): boolean;
  spring: { css: string; ms: number };
};
function ReportView({ host, report }: { host: BackupHost; report: Report }) {
  const rows = [...report.archives, ...report.archivedCurrent];
  return (
    <>
      <div className="t6" data-bk-report>
        {`정상 자료 ${report.active.length}개 항목 · 원문 보관 ${report.archives.length}개(활성화 안 됨)${report.preserved.length ? ` · 기존 활성 자료 유지 ${report.preserved.length}개` : ""}${report.archivedCurrent.length ? ` · 기존 원문 ${report.archivedCurrent.length}개는 보관 후 활성에서 교체/제거` : ""}`}
      </div>
      {rows.length ? (
        <ul className="t6">
          {rows.map((a, i) => (
            <li key={i}>
              {`${host.bk.sourceLabel(a.source)}: ${a.reason}${a.action ? ` · 보관 후 ${a.action}` : ""}`}
              <details>
                <summary>복구 진단</summary>
                <code>{a.source}</code>
              </details>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}
type TextPreview =
  | { kind: "paste" }
  | { kind: "plan"; token: number; backup: Backup; report: Report; current: unknown };
type PhotoPreview = {
  token: number;
  file: File;
  parsed: { text: Backup };
  plan: PhotoPlan;
};
type Photo =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | {
      phase: "ready";
      rows: number;
      pending: boolean;
      undo: boolean;
    };
export function BackupSheet({
  host,
  current,
  busyRef: sheetBusy,
}: {
  host: BackupHost;
  current: { data: unknown; report: Report };
  // Read by the sheet shell: a running photo task blocks closing.
  busyRef: { current: boolean };
}) {
  const bk = host.bk;
  const [msg, setMsg] = useState(host.note || ""),
    [busy, setBusyState] = useState(false),
    [text, setText] = useState<{ shown: boolean; value: string; placeholder: string }>({
      shown: false,
      value: "",
      placeholder: "",
    }),
    [preview, setPreview] = useState<TextPreview | null>(null),
    [photo, setPhoto] = useState<Photo>({ phase: "loading" }),
    [photoMsg, setPhotoMsg] = useState(""),
    [photoPreview, setPhotoPreview] = useState<PhotoPreview | null>(null);
  const ta = useRef<HTMLTextAreaElement>(null),
    save = useRef<HTMLButtonElement>(null),
    textSelection = useRef(0),
    photoSelection = useRef(0),
    busyRef = useRef(false),
    live = useRef(true),
    session = useRef<{ repository: Repository; controller: Controller } | null>(
      null,
    ),
    sessionReady = useRef<Promise<boolean>>(Promise.resolve(false)),
    focusText = useRef(false);
  const stash = useRef(bk.stash()).current;
  const count = useRef(bk.count(current.data)).current;
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  useLayoutEffect(() => {
    save.current?.focus();
  }, []);
  useEffect(() => {
    if (focusText.current && ta.current) {
      focusText.current = false;
      ta.current.focus();
      if (ta.current.value) ta.current.select();
    }
  });
  const setBusy = (value: boolean) => {
    busyRef.current = value;
    sheetBusy.current = value;
    setBusyState(value);
  };
  const showText = (value: string) => {
    focusText.current = true;
    setText({ shown: true, value, placeholder: "" });
  };
  const makeText = () => {
    try {
      return JSON.stringify(bk.make());
    } catch (e) {
      setMsg((e as Error).message);
      return null;
    }
  };
  // ── text backup (vanilla backupSheet)
  const exportText = async () => {
    const value = makeText();
    if (value === null) return;
    const name = `closet-backup-${bk.stamp()}.json`;
    try {
      const file = new File([value], name, { type: "application/json" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: name });
        setMsg("공유 창에서 파일에 저장하거나 다른 기기로 보내세요.");
        return;
      }
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return;
    }
    try {
      const url = URL.createObjectURL(
          new Blob([value], { type: "application/json" }),
        ),
        a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      setMsg(`${name} 파일을 내보냈어요. 아이폰은 파일 앱의 다운로드 폴더에 저장돼요.`);
    } catch {
      showText(value);
      setMsg("내려받기가 막혀 글자로 보여 드려요. 전체 선택해 복사해 두세요.");
    }
  };
  const copyText = async () => {
    const value = makeText();
    if (value === null) return;
    try {
      await navigator.clipboard.writeText(value);
      setMsg("백업 글자를 복사했어요. 메모 앱 등에 붙여 두세요.");
    } catch {
      showText(value);
      setMsg("복사가 막혀 글자로 보여 드려요. 전체 선택해 복사해 두세요.");
    }
  };
  const readText = (value: string) => {
    const token = textSelection.current;
    let backup: Backup, report: Report, cur: unknown;
    try {
      backup = bk.read(value);
      const snapshot = bk.snapshot();
      report = bk.prepareRestore(backup.data, snapshot).report;
      cur = bk.count(bk.classify(snapshot).data);
    } catch (e) {
      setPreview(null);
      setMsg((e as Error).message);
      return;
    }
    setPreview({ kind: "plan", token, backup, report, current: cur });
    setMsg("");
  };
  const restoreText = async (p: Extract<TextPreview, { kind: "plan" }>) => {
    if (p.token !== textSelection.current) {
      setMsg("새로 고른 파일을 다시 확인해 주세요.");
      return;
    }
    try {
      await host.core.withStorageLock(() => bk.restore(p.backup.data));
    } catch (e) {
      const err = e as Error & { code?: string };
      if (err.code === "partial" || err.code === "pending") host.reopen(err.message);
      else setMsg(err.message);
      return;
    }
    if (localStorage.getItem(bk.NEXT) !== null) {
      host.reopen(
        "자료는 적용했지만 복구 지점 정리가 끝나지 않았어요. '복원 전으로 되돌리기'가 가능하며 새 복원은 잠시 막았어요.",
      );
      return;
    }
    setMsg(
      `복원했어요. 원문 ${new Set([...bk.lastReport.archives, ...bk.lastReport.archivedCurrent].map((a) => a.key)).size}개 보관 · 기존 활성 자료 ${bk.lastReport.preserved.length}개 유지. 다시 불러와요.`,
    );
    setTimeout(host.reload, 300);
  };
  const undoText = async () => {
    try {
      await host.core.withStorageLock(() => bk.undo());
    } catch (e) {
      setMsg((e as Error).message);
      return;
    }
    setMsg("복원 전으로 되돌렸어요. 다시 불러와요.");
    setTimeout(host.reload, 300);
  };
  // ── photo backup (vanilla mountPhotoBackup)
  const invalidatePhoto = () => {
    photoSelection.current++;
    setPhotoPreview(null);
  };
  const recoveryState = useCallback(async () => {
    const s = session.current;
    if (!s) return;
    const pending =
      host.storage.getItem(PHOTO_PENDING_KEY) !== null ||
      !!(await s.repository.pending());
    if (live.current)
      setPhoto((p) => (p.phase === "ready" ? { ...p, pending } : p));
    host.onState();
  }, [host]);
  const run = async (work: () => Promise<void>) => {
    if (busyRef.current) return;
    if (host.isBusy()) {
      setPhotoMsg("진행 중인 상담이 끝나면 백업을 진행해 주세요.");
      return;
    }
    setBusy(true);
    try {
      await work();
    } catch (error) {
      if (live.current)
        setPhotoMsg(
          (error as Error).message ||
            "사진 보관 작업을 마치지 못했어요. 원본은 그대로예요.",
        );
    } finally {
      if (live.current) setBusy(false);
      try {
        await recoveryState();
      } catch (error) {
        if (live.current) setPhotoMsg((error as Error).message);
      }
    }
  };
  useEffect(() => {
    if (!host.photos) return;
    let cancelled = false;
    let done = (_ok: boolean) => {};
    sessionReady.current = new Promise((resolve) => (done = resolve));
    (async () => {
      let s;
      try {
        s = (await photoBackupSession(host.namespace, {
          storage: host.storage,
          textBackup: bk,
        })) as { repository: Repository; controller: Controller };
      } catch (error) {
        if (!cancelled) setPhoto({ phase: "error", message: (error as Error).message });
        done(false);
        return;
      }
      if (cancelled) return done(false);
      session.current = s;
      const rows = (await s.repository.list()).length;
      const undo = await s.repository.undo();
      const pending =
        host.storage.getItem(PHOTO_PENDING_KEY) !== null ||
        !!(await s.repository.pending());
      if (cancelled) return;
      setPhoto({
        phase: "ready",
        rows,
        pending,
        undo: !!(stash && undo && host.storage.getItem(bk.STASH) === undo.stashAfter),
      });
      host.onState();
      done(true);
    })().catch((error) => {
      if (!cancelled) setPhoto({ phase: "error", message: (error as Error).message });
      done(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [host]);
  const exportPhotos = () =>
    run(async () => {
      const s = session.current!;
      const blob = await s.controller.makeFile(),
        url = URL.createObjectURL(blob),
        a = document.createElement("a");
      if (!live.current) {
        URL.revokeObjectURL(url);
        return;
      }
      a.href = url;
      a.download = `closet-photos-${bk.stamp()}.otjang`;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      setPhotoMsg("파일 저장을 요청했어요. 파일 앱이나 다운로드 폴더에서 확인해 주세요.");
    });
  const previewPhotoFile = (file: File | undefined) => {
    invalidatePhoto();
    // onSelect: a photo selection revokes the text preview.
    textSelection.current++;
    setMsg("");
    setPreview(null);
    const token = photoSelection.current;
    if (!file) return;
    setPhotoMsg("사진 백업 파일을 확인하고 있어요…");
    return run(async () => {
      if (file.size > MAX_BINARY_BYTES)
        throw Error("사진 포함 파일은 1GB 이하로 골라 주세요.");
      const s = session.current!;
      const parsed = await s.controller.readFile(file),
        plan = await s.controller.preview(parsed);
      if (!live.current || token !== photoSelection.current) return;
      setPhotoPreview({ token, file, parsed, plan });
      setPhotoMsg("복원할 파일과 원문 보관·유지 내용을 확인해 주세요.");
    });
  };
  const restorePhotos = (p: PhotoPreview) => {
    if (p.token !== photoSelection.current) {
      setPhotoMsg("새로 고른 파일을 다시 확인해 주세요.");
      return;
    }
    return run(async () => {
      const result = await session.current!.controller.restore(p.parsed);
      if (!result.complete) throw Error("복구 정리를 먼저 마쳐 주세요.");
      setPhotoMsg("복원을 마쳤어요. 다시 불러와요.");
      host.photoReload();
    });
  };
  const recover = () =>
    run(async () => {
      await session.current!.controller.recover();
      setPhotoMsg("복구를 마쳤어요. 다시 불러와요.");
      host.photoReload();
    });
  const persist = () =>
    run(async () => {
      if (typeof navigator.storage?.persist !== "function") {
        setPhotoMsg(
          "이 브라우저는 장기 보관 요청을 지원하지 않아요. 파일 백업을 함께 보관해 주세요.",
        );
        return;
      }
      const allowed = await navigator.storage.persist();
      setPhotoMsg(
        allowed
          ? "브라우저가 장기 보관을 허용했어요. 영구 보장은 아니므로 파일 백업도 보관해 주세요."
          : "브라우저가 장기 보관을 허용하지 않았어요. 파일 백업을 함께 보관해 주세요.",
      );
    });
  const undoPhotos = () =>
    run(async () => {
      await session.current!.controller.undo();
      setPhotoMsg("사진 백업 전으로 되돌렸어요.");
      host.photoReload();
    });
  // ── text file / paste selection (both revoke a photo preview)
  const onTextFile = async (f: File | undefined) => {
    const token = ++textSelection.current;
    setMsg("");
    setPreview(null);
    invalidatePhoto();
    if (!f) return;
    if (new TextDecoder().decode(await f.slice(0, 8).arrayBuffer()) === "EOULPH01") {
      const ready = await sessionReady.current;
      if (token !== textSelection.current) return;
      if (ready) await previewPhotoFile(f);
      else setMsg("사진 백업 화면을 열지 못했어요. 앱을 갱신한 뒤 다시 열어 주세요.");
      return;
    }
    if (f.size > bk.MAX_BYTES) {
      if (token === textSelection.current) setMsg("파일이 너무 커요(5MB 초과).");
      return;
    }
    const r = new FileReader();
    r.onload = () => {
      if (token === textSelection.current) readText(String(r.result || ""));
    };
    r.onerror = () => {
      if (token === textSelection.current) setMsg("파일을 읽지 못했어요.");
    };
    r.readAsText(f);
  };
  const startPaste = () => {
    textSelection.current++;
    invalidatePhoto();
    focusText.current = true;
    setText({ shown: true, value: "", placeholder: "백업 글자를 붙여 넣으세요" });
    setPreview({ kind: "paste" });
  };
  const rows = photo.phase === "ready" ? photo.rows : 0;
  const copyButton = (
    <button
      key="copy"
      type="button"
      className="btn line"
      data-bk-copy
      disabled={busy}
      onClick={copyText}
    >
      <i className="ph ph-copy" />글자로 복사
    </button>
  );
  const pasteButton = (
    <button
      key="paste"
      type="button"
      className="btn line"
      data-bk-paste
      disabled={busy}
      onClick={startPaste}
    >
      <i className="ph ph-clipboard-text" />
      붙여넣어 복원
    </button>
  );
  return (
    <div className="bk" data-react-backup>
      <h2 className="h2">백업 · 복원</h2>
      <p className="sub t6">
        {rows ? (
          `${bk.countText(bk.count(bk.classify(bk.snapshot()).data))} · 원본 사진 ${rows}장을 함께 보관해요. 읽을 수 없는 원문은 별도로 보관하며 사진은 서버·AI로 보내지 않아요.`
        ) : (
          <>
            이 기기의 자료를 글자 파일 하나로 내보내요(사진 없음).
            <br />
            {`${bk.countText(count)}.`}
            <br />
            {" 새 기기나 다시 설치한 앱에서 그 파일로 복원하면 내보낸 시점으로 돌아가요. 읽을 수 없는 원문은 따로 보관하며 옷·상담으로 활성화하지 않아요. 새 백업은 최신 앱에서 복원해 주세요."}
          </>
        )}
      </p>
      <ReportView host={host} report={current.report} />
      <div className="decs">
        <button
          ref={save}
          type="button"
          className="btn go"
          data-bk-save
          disabled={busy}
          onClick={rows ? exportPhotos : exportText}
        >
          {rows ? (
            "옷장·사진 전체 파일로 내보내기"
          ) : (
            <>
              <i className="ph ph-download-simple" />
              파일로 내보내기
            </>
          )}
        </button>
        {rows ? null : copyButton}
        <label className="btn line" htmlFor="bkfile">
          <i className="ph ph-upload-simple" />
          파일로 복원
          <input
            id="bkfile"
            type="file"
            accept=".json,.otjang,application/octet-stream,application/json,text/plain"
            hidden
            disabled={busy}
            onChange={(e) => void onTextFile(e.target.files?.[0])}
          />
        </label>
        {rows ? null : pasteButton}
        {stash ? (
          <button
            type="button"
            className="btn line"
            data-bk-undo
            {...(photo.phase === "ready" && photo.undo ? { "data-photo-undo": "" } : {})}
            disabled={busy}
            onClick={photo.phase === "ready" && photo.undo ? undoPhotos : undoText}
          >
            <i className="ph ph-arrow-counter-clockwise" />
            {`복원 전(${host.whenText(stash.at)})으로 되돌리기`}
          </button>
        ) : null}
      </div>
      <textarea
        ref={ta}
        className="bk-ta"
        hidden={!text.shown}
        aria-label="백업 글자"
        spellCheck={false}
        autoCapitalize="off"
        placeholder={text.placeholder || undefined}
        value={text.value}
        onChange={(e) => setText((t) => ({ ...t, value: e.target.value }))}
      />
      <div className="bk-preview" hidden={!preview}>
        {preview?.kind === "paste" ? (
          <button
            type="button"
            className="btn line wide"
            data-bk-read
            disabled={busy}
            onClick={() => readText(text.value)}
          >
            붙여 넣은 글자 확인
          </button>
        ) : preview?.kind === "plan" ? (
          <>
            <div className="t5">{`복원할 백업${preview.backup.at ? ` · ${host.whenText(preview.backup.at)}` : ""}`}</div>
            <div className="t6">{bk.countText(bk.count(preview.backup.data))}</div>
            <ReportView host={host} report={preview.report} />
            <div className="t6">{`지금 이 기기: ${bk.countText(preview.current)}`}</div>
            <button
              type="button"
              className="btn go wide"
              data-bk-go
              disabled={busy}
              onClick={() => void restoreText(preview)}
            >
              지금 자료를 바꾸고 복원
            </button>
            <p className="t6">
              원문 보관만 있는 항목은 이 기기의 기존 활성 자료를 유지해요. 그 밖의 활성 자료는 파일 기준으로 바뀌며 '복원 전으로 되돌리기'로 한 번 되돌릴 수 있어요.
            </p>
          </>
        ) : null}
      </div>
      <p className="bk-msg t6" role="status" aria-live="polite">
        {msg}
      </p>
      {host.photos ? (
        <PhotoSection
          photo={photo}
          busy={busy}
          message={photoMsg}
          preview={photoPreview}
          bk={bk}
          moved={rows ? [copyButton, pasteButton] : null}
          onRecover={recover}
          onPersist={persist}
          onExport={exportPhotos}
          onFile={(f) => void previewPhotoFile(f)}
          onRestore={(p) => void restorePhotos(p)}
          onTextOnly={exportText}
        />
      ) : null}
    </div>
  );
}
function PhotoSection({
  photo,
  busy,
  message,
  preview,
  bk,
  moved,
  onRecover,
  onPersist,
  onExport,
  onFile,
  onRestore,
  onTextOnly,
}: {
  photo: Photo;
  busy: boolean;
  message: string;
  preview: PhotoPreview | null;
  bk: TextBackup;
  moved: ReactNode[] | null;
  onRecover(): void;
  onPersist(): void;
  onExport(): void;
  onFile(file: File | undefined): void;
  onRestore(p: PhotoPreview): void;
  onTextOnly(): void;
}) {
  const ready = photo.phase === "ready" ? photo : null;
  const status =
    photo.phase === "error" ? photo.message : message;
  return (
    <section
      className="bk-photo"
      aria-label="사진 포함 백업"
      aria-busy={busy ? "true" : undefined}
      data-photo-ready={ready ? "true" : undefined}
    >
      <h3>사진까지 함께 보관</h3>
      <p className="t6">
        {ready
          ? ready.rows
            ? `이 기기에 사진 ${ready.rows}장 보관 중이에요. 기본 파일 내보내기에 사진을 포함해요. 글자 복사에는 사진이 빠져요.`
            : `이 기기에 사진 ${ready.rows}장 보관 중이에요. 기본 글자 백업에는 사진이 빠져요. 사진은 앱 서버·AI로 보내지 않아요.`
          : "사진은 이 기기에만 보관해요. 아래 파일에는 옷장·기록과 원본 사진이 함께 들어가요."}
      </p>
      {ready ? (
        <>
          <div className="decs">
            <button
              type="button"
              className="btn line"
              data-photo-recover
              hidden={!ready.pending}
              disabled={busy}
              onClick={onRecover}
            >
              사진 백업 복구 마치기
            </button>
          </div>
          <details data-photo-options>
            <summary>추가 백업 옵션</summary>
            <div className="decs">
              <button
                type="button"
                className="btn line"
                data-photo-persist
                disabled={busy}
                onClick={onPersist}
              >
                기기 사진 보관을 더 안정적으로
              </button>
              <button
                type="button"
                className="btn line"
                data-photo-export
                disabled={busy}
                onClick={onExport}
              >
                사진 포함 파일로 내보내기
              </button>
              <label className="btn line">
                사진 포함 파일로 복원
                <input
                  type="file"
                  accept=".otjang,.json,application/octet-stream,application/json"
                  hidden
                  data-photo-file
                  disabled={busy}
                  onChange={(e) => onFile(e.target.files?.[0])}
                />
              </label>
              {moved}
              {moved ? (
                <button
                  type="button"
                  className="btn line"
                  disabled={busy}
                  onClick={onTextOnly}
                >
                  글자 자료만 파일로 내보내기
                </button>
              ) : null}
            </div>
          </details>
        </>
      ) : null}
      <p className="t6" role="status" data-photo-status="">
        {status}
      </p>
      {ready ? (
        <div className="bk-preview" hidden={!preview} data-photo-preview="">
          {preview ? <PhotoPlanView preview={preview} bk={bk} busy={busy} onRestore={onRestore} /> : null}
        </div>
      ) : null}
    </section>
  );
}
function PhotoPlanView({
  preview,
  bk,
  busy,
  onRestore,
}: {
  preview: PhotoPreview;
  bk: TextBackup;
  busy: boolean;
  onRestore(p: PhotoPreview): void;
}) {
  const { file, plan, parsed } = preview;
  const report = plan.mode === "full" ? plan.plan.report : null;
  const rows = report ? [...report.archives, ...report.archivedCurrent] : [];
  return (
    <>
      <p className="t6">
        {`${file.name ? file.name + " · " : ""}${plan.mode === "photos-only" ? "지금 옷장은 유지하고 사진만 보관해요." : "글자 자료와 사진을 파일 기준으로 복원해요."} 사진 ${plan.photoCount}장 · 사진 없는 연결 ${plan.missing.length}개 · 연결 안 된 보관 사진 ${plan.orphans.length}장. 기존 사진은 지우지 않아요.`}
      </p>
      {report ? (
        <p className="t6" data-photo-report="">
          {`${bk.countText(bk.count(parsed.text.data))} · 정상 항목 ${report.active.length}개 · 원문 보관 ${report.archives.length}개 · 기존 활성 자료 유지 ${report.preserved.length}개 · 기존 원문 ${report.archivedCurrent.length}개는 보관 후 활성에서 교체/제거`}
        </p>
      ) : null}
      {rows.length ? (
        <ul className="t6">
          {rows.map((row, i) => (
            <li key={i} data-source={row.source}>
              {`${bk.sourceLabel?.(row.source) || "기타 보관 자료"}: ${row.reason}${row.action ? " · 보관 후 " + row.action : ""}`}
              <details>
                <summary>복구 진단</summary>
                <code>{row.source}</code>
              </details>
            </li>
          ))}
        </ul>
      ) : null}
      <button
        type="button"
        className="btn go"
        data-photo-confirm=""
        disabled={busy}
        onClick={() => onRestore(preview)}
      >
        확인한 사진 백업으로 복원
      </button>
    </>
  );
}
