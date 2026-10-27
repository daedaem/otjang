import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createRoot } from "react-dom/client";
// @ts-ignore plain controller is covered by Node contract checks
import { createMirrorSession } from "./session.js";
import { photoModule } from "./local-photo";
import { Stage } from "./Stage";
import type { MirrorHost, MirrorSession, MirrorState } from "./types";
import "./mirror.css";
function Mirror({ host }: { host: MirrorHost }) {
  const session = useMemo(
    () =>
      createMirrorSession({
        core: host.core,
        storage: host.storage,
        photos: () => photoModule(host),
      }) as MirrorSession,
    [],
  );
  const state: MirrorState = useSyncExternalStore(
      session.subscribe,
      session.getSnapshot,
      session.getSnapshot,
    ),
    d = state.draft;
  const version = useSyncExternalStore(
    host.core.subscribe,
    host.core.version,
    host.core.version,
  );
  const garments = useMemo(
    () => host.core.getState().closet.filter((g) => !g.trial),
    [version],
  );
  const choices = garments.filter(
    (g) =>
      g.photoId &&
      ["top", "outer", "bottom", "dress"].includes(
        host.core.railCategory(g) || "",
      ),
  );
  const byId = new Map(choices.map((g) => [g.id, g]));
  const missing = d.layers.filter((l) => !byId.has(l.garmentId)).length;
  const [error, setError] = useState(""),
    [leave, setLeave] = useState(false),
    [file, setFile] = useState<File | null>(null);
  const latest = useRef(state),
    chosenFile = useRef(file);
  latest.current = state;
  chosenFile.current = file;
  const heading = useRef<HTMLHeadingElement>(null),
    leaveDialog = useRef<HTMLDialogElement>(null),
    replaceDialog = useRef<HTMLDialogElement>(null),
    resolveLeave = useRef<null | ((ok: boolean) => void)>(null);
  const finishers = useRef(new Map<string, (commit: boolean) => void>());
  const register = useMemo(
    () => (id: string, fn: (commit: boolean) => void) => {
      finishers.current.set(id, fn);
      return () => {
        finishers.current.delete(id);
      };
    },
    [],
  );
  useLayoutEffect(() => {
    const active = document.activeElement;
    if (!active || active === document.body || host.element.contains(active))
      heading.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    const off = host.navigationGuard(async () => {
      for (const fn of finishers.current.values()) fn(true);
      await session.flush();
      if (latest.current.persisted && !chosenFile.current) return true;
      return new Promise<boolean>((resolve) => {
        resolveLeave.current = resolve;
        setLeave(true);
      });
    });
    const sync = (e: StorageEvent) => {
      if (e.key === host.core.mirrorDraftKey || e.key === null) session.sync();
    };
    const unload = (e: BeforeUnloadEvent) => {
      if (
        !session.getSnapshot().persisted ||
        session.getSnapshot().uploading ||
        chosenFile.current
      ) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    addEventListener("storage", sync);
    addEventListener("beforeunload", unload);
    return () => {
      off();
      removeEventListener("storage", sync);
      removeEventListener("beforeunload", unload);
      resolveLeave.current?.(false);
    };
  }, []);
  useEffect(() => {
    if (leave && !leaveDialog.current?.open) leaveDialog.current?.showModal();
  }, [leave]);
  useEffect(() => {
    if (file && !replaceDialog.current?.open)
      replaceDialog.current?.showModal();
  }, [file]);
  function decide(ok: boolean) {
    leaveDialog.current?.close();
    setLeave(false);
    resolveLeave.current?.(ok);
    resolveLeave.current = null;
  }
  const disabled =
    !!state.blocked || state.uploading || !!host.core.boot?.preview;
  function selected(f?: File) {
    if (!f) return;
    if (d.body && (d.head || d.feet || d.layers.some((l) => l.dx || l.dy))) {
      setFile(f);
      return;
    }
    void session.upload(f);
  }
  function toggle(id: string) {
    setError("");
    if (d.layers.some((l) => l.garmentId === id))
      void session.change({
        layers: d.layers.filter((l) => l.garmentId !== id),
      });
    else if (d.layers.length >= 12)
      setError("한 번에 놓을 수 있는 옷은 12벌까지예요.");
    else
      void session.change({
        layers: [...d.layers, { garmentId: id, dx: 0, dy: 0 }],
      });
  }
  return (
    <section className="mr" data-react-mirror aria-label="내 사진 거울">
      <header className="mr-header">
        <button
          tabIndex={0}
          className="quiet"
          type="button"
          onClick={host.back}
        >
          돌아가기
        </button>
        <button
          tabIndex={0}
          className="quiet"
          type="button"
          onClick={host.backup}
        >
          백업
        </button>
      </header>
      <p className="mr-kicker">내 사진으로 함께 보기</p>
      <h1 tabIndex={-1} ref={heading}>
        거울
      </h1>
      <p className="mr-note" role="note">
        분위기 미리보기 · 핏 근거 아님
      </p>
      <p className="mr-meta">
        내 전신 사진 위에 내 옷 사진을 직접 놓아 봐요. 사진을 앱 서버·AI로
        보내지 않아요.
      </p>
      {host.core.boot?.preview && (
        <p role="status">체험 화면에서는 개인 사진을 열거나 저장하지 않아요.</p>
      )}
      {state.blocked && <p role="alert">{state.blocked}</p>}
      {(error || (state.notice && state.notice !== state.blocked)) && (
        <p role="alert">{error || state.notice}</p>
      )}
      {!state.persisted && (
        <div className="mr-save-warning">
          <p role="status">입력이 이 화면에 남아 있어요. 다시 보관해 주세요.</p>
          <button
            tabIndex={0}
            type="button"
            className="btn line"
            disabled={disabled || state.saving}
            onClick={() => void session.retry()}
          >
            다시 보관
          </button>
        </div>
      )}
      <div className="mr-layout">
        <div className="mr-workspace">
          <section className="mr-setup" aria-label="내 전신 사진과 키">
            <label className="btn line mr-upload">
              {state.uploading
                ? "사진을 보관하고 있어요…"
                : d.body
                  ? "내 전신 사진 바꾸기"
                  : "내 전신 사진 고르기"}
              <input
                data-mirror-file
                type="file"
                accept="image/png,image/jpeg,image/webp"
                disabled={disabled}
                onChange={(e) => {
                  selected(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </label>
            <label className="mr-height">
              내 키 <span>cm</span>
              <input
                aria-label="내 키 cm"
                inputMode="decimal"
                maxLength={20}
                placeholder="예: 175"
                value={d.heightRaw}
                disabled={disabled}
                onChange={(e) =>
                  void session.change({ heightRaw: e.target.value })
                }
              />
            </label>
            <p className="mr-meta">
              내가 찍은 전신 PNG·JPEG·WebP, 8MB·1,200만 화소 이하. 사진 원본은
              그대로 보관해요.
            </p>
          </section>
          <Stage
            {...{ host, session, garments: choices, register, disabled }}
            draft={d}
          />
        </div>
        <aside className="mr-side" aria-label="함께 놓을 내 옷">
          <h2>
            내 옷 고르기 <span>{d.layers.length}/12</span>
          </h2>
          <p className="mr-meta">
            이 기기 사진을 연결한 내 상의·아우터·하의만 놓을 수 있어요. 원본은
            지우거나 바꾸지 않아요.
          </p>
          {!choices.length && <p>놓을 내 옷 사진이 아직 없어요.</p>}
          <div className="mr-choices">
            {choices.map((g) => (
              <button
                tabIndex={0}
                type="button"
                key={g.id}
                data-mirror-pick={g.id}
                className="mr-choice"
                disabled={disabled}
                aria-pressed={d.layers.some((l) => l.garmentId === g.id)}
                onClick={() => toggle(g.id)}
              >
                <span>{g.label}</span>
                <small>
                  {g.profile?.measures?.length
                    ? "총장 " + g.profile.measures.length.cm + "cm"
                    : "총장 모름"}
                </small>
              </button>
            ))}
          </div>
          {!!missing && (
            <p role="status">
              선택했던 옷 {missing}벌은 현재 사진/보유를 확인하지 못해 표시하지
              않아요. 다른 옷으로 바꾸지 않았어요.
            </p>
          )}
          <button
            tabIndex={0}
            className="btn line wide"
            type="button"
            onClick={host.closet}
          >
            옷장에서 내 사진 넣기
          </button>
          {!!d.layers.length && (
            <button
              tabIndex={0}
              className="quiet"
              type="button"
              disabled={disabled}
              onClick={() => void session.change({ layers: [] })}
            >
              선택 모두 넣어두기
            </button>
          )}
          {host.candidate && (
            <section className="mr-candidate" data-mirror-candidate>
              <h2>구매 후보는 옆에서 보기</h2>
              {host.candidate.image && (
                <img
                  src={host.candidate.image.src}
                  alt={host.candidate.image.alt || host.candidate.name}
                  referrerPolicy="no-referrer"
                />
              )}
              <p>
                {host.candidate.brand} · {host.candidate.name}
              </p>
              <p className="mr-meta">
                판매처 원본 사진이에요. 내 사진 위에 합성하지 않아요.
              </p>
            </section>
          )}
        </aside>
      </div>
      <dialog
        ref={replaceDialog}
        onCancel={(e) => {
          e.preventDefault();
          setFile(null);
          replaceDialog.current?.close();
        }}
      >
        <h2>전신 사진을 바꿀까요?</h2>
        <p>
          다른 사진이면 머리·발끝과 옷 위치를 다시 맞춰요. 키·고른 옷·앞선 사진
          원본은 보관해요.
        </p>
        <button
          tabIndex={0}
          type="button"
          className="btn line"
          onClick={() => {
            setFile(null);
            replaceDialog.current?.close();
          }}
        >
          취소
        </button>
        <button
          tabIndex={0}
          type="button"
          className="btn go"
          onClick={() => {
            const f = file;
            setFile(null);
            replaceDialog.current?.close();
            if (f) void session.upload(f);
          }}
        >
          사진 바꾸기
        </button>
      </dialog>
      <dialog
        ref={leaveDialog}
        onCancel={(e) => {
          e.preventDefault();
          decide(false);
        }}
      >
        <h2>보관하지 못한 입력이 있어요</h2>
        <p>
          지금 나가면 이 화면에만 남은 입력이나 고른 파일을 잃을 수 있어요. 사진
          보관함의 원본은 지우지 않아요.
        </p>
        <button
          tabIndex={0}
          type="button"
          className="btn line"
          onClick={() => decide(false)}
        >
          계속 편집
        </button>
        <button
          tabIndex={0}
          type="button"
          className="btn go"
          onClick={() => decide(true)}
        >
          입력 두고 나가기
        </button>
      </dialog>
    </section>
  );
}
export function mount(host: MirrorHost) {
  const root = createRoot(host.element);
  root.render(<Mirror host={host} />);
  return () => root.unmount();
}
