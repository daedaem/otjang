import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createRoot } from "react-dom/client";
import { ProfileFields } from "./Fields";
import { GarmentSummary } from "./Summary";
import { OwnedOutfits } from "./Outfits";
import { createProfileSession } from "./draft-session.js";
import type { ProfileHost, ProfileForm } from "./types";
import "./profile.css";
const message = (e: unknown) =>
  e instanceof Error
    ? e.message
    : "옷 정보를 처리하지 못했어요. 입력은 남겨 두었어요.";
const http = (value?: string) => {
  try {
    const u = new URL(value || "");
    return ["http:", "https:"].includes(u.protocol) ? u.href : null;
  } catch {
    return null;
  }
};
function ProfileEditor({ host }: { host: ProfileHost }) {
  const coreVersion = useSyncExternalStore(
    host.core.subscribe,
    host.core.version,
    host.core.version,
  );
  const closetState = useMemo(
    () => host.core.getState(),
    [host.core, coreVersion],
  );
  const initial = useRef(
    closetState.closet.find((g) => g.id === host.garmentId)!,
  );
  const current = closetState.closet.find((g) => g.id === host.garmentId),
    g = current || initial.current;
  const initialInfo = host.core.profileEditInfo(g);
  const session = useMemo(
    () =>
      createProfileSession({
        core: host.core,
        storage: host.storage,
        garmentId: host.garmentId,
        key: initialInfo.key,
      }),
    [],
  );
  const state = useSyncExternalStore(
      session.subscribe,
      session.getSnapshot,
      session.getSnapshot,
    ),
    form = state.draft.form;
  const info = host.core.profileEditInfo({
    ...g,
    kind: state.draft.kind,
    profile: state.draft.baseProfile || undefined,
  });
  const dialog = useRef<HTMLDialogElement>(null),
    heading = useRef<HTMLHeadingElement>(null),
    alive = useRef(true),
    closing = useRef(false),
    resolveNavigation = useRef<null | ((allow: boolean) => void)>(null),
    lastField = useRef<HTMLElement | null>(null),
    continueButton = useRef<HTMLButtonElement>(null),
    feedback = useRef<HTMLElement | null>(null);
  const [tab, setTab] = useState(info.measures.length ? "measure" : "detail"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [discard, setDiscard] = useState<
      null | "close" | "backup" | "looks" | "restart" | "navigation"
    >(null),
    [remove, setRemove] = useState(false);
  const issue = host.core.storageIssue();
  const locked =
    busy || state.committing || issue?.code === "photo_recovery_pending";
  const metadata = useMemo(
      () => host.metadata(g.id),
      [host, coreVersion, g.id],
    ),
    link = http(metadata?.community?.url || metadata?.url);
  const requestClose = async (
    target: "close" | "backup" | "looks" = "close",
  ) => {
    if (closing.current || state.committing) return;
    closing.current = true;
    setBusy(true);
    await session.flush();
    const latest = session.getSnapshot();
    if (latest.dirty && !latest.persisted) {
      setDiscard(target);
      setBusy(false);
      closing.current = false;
      return;
    }
    if (target === "backup") host.backup();
    else if (target === "looks") host.looks();
    else host.close();
  };
  useEffect(() => {
    const unregister = host.navigationGuard(() => {
      const latest = session.getSnapshot();
      if (latest.committing) return false;
      if (!latest.dirty || latest.persisted) return true;
      return session.flush().then(() => {
        const ready = session.getSnapshot();
        if (!ready.dirty || ready.persisted) return true;
        return new Promise<boolean>((resolve) => {
          resolveNavigation.current = resolve;
          setDiscard("navigation");
        });
      });
    });
    return () => {
      unregister();
      const resolve = resolveNavigation.current;
      resolveNavigation.current = null;
      resolve?.(false);
    };
  }, [host, session]);
  useEffect(() => {
    if (discard || remove) continueButton.current?.focus();
  }, [discard, remove]);
  useEffect(() => {
    alive.current = true;
    const el = dialog.current!,
      previous = document.activeElement as HTMLElement | null,
      overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    el.showModal();
    heading.current?.focus();
    return () => {
      alive.current = false;
      document.body.style.overflow = overflow;
      if (el.open) el.close();
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (state.dirty && !state.persisted) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [state.dirty, state.persisted]);
  const change = (fn: (f: ProfileForm) => void) => {
    setError("");
    void session.change(fn);
  };
  const save = async () => {
    setError("");
    try {
      await session.save();
    } catch (e) {
      if (alive.current) setError(message(e));
    } finally {
      if (alive.current)
        requestAnimationFrame(() =>
          requestAnimationFrame(() =>
            feedback.current?.scrollIntoView({ block: "center" }),
          ),
        );
    }
  };
  const restart = async () => {
    setError("");
    try {
      host.core.reloadSaved();
      await session.restart();
      setDiscard(null);
    } catch (e) {
      setError(message(e));
    }
  };
  const colour = async (value: string) => {
    setBusy(true);
    setError("");
    try {
      await session.flush();
      await host.core.withStorageLock(() => {
        host.core.assertPhotoReady();
        host.core.reloadSaved();
        if (!host.core.getState().closet.some((item) => item.id === g.id))
          throw new Error(
            "현재 옷장에 없는 옷이에요. 편집 초안은 그대로 보관했어요.",
          );
        host.core.updateGarment(g.id, { color: value || null });
      });
      setTab(info.measures.length ? "measure" : "detail");
    } catch (e) {
      setError(message(e));
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  const removeOwned = async () => {
    setBusy(true);
    setError("");
    try {
      await session.flush();
      await host.core.withStorageLock(() => {
        host.core.assertPhotoReady();
        host.core.reloadSaved();
        host.core.removeGarment(g.id);
      });
      host.close();
    } catch (e) {
      setError(message(e));
      setRemove(false);
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  const confirm = (id: string, on: boolean) =>
    change((f) => {
      f.confirmed = on
        ? [...f.confirmed.filter((k) => k !== id), id]
        : f.confirmed.filter((k) => k !== id);
    });

  return (
    <dialog
      ref={dialog}
      className="sheet rp"
      aria-labelledby="rp-profile-title"
      data-profile-editor
      data-draft-saved={state.persisted ? "true" : "false"}
      onCancel={(e) => {
        e.preventDefault();
        void requestClose();
      }}
      onClick={(e) => {
        if (e.target !== e.currentTarget) return;
        const r = e.currentTarget.getBoundingClientRect();
        if (
          e.clientX < r.left ||
          e.clientX > r.right ||
          e.clientY < r.top ||
          e.clientY > r.bottom
        )
          void requestClose();
      }}
    >
      <header className="rp-top">
        <span>내 옷 정보</span>
        <button
          type="button"
          aria-label="닫기"
          disabled={busy || state.committing}
          onClick={() => void requestClose()}
        >
          <i className="ph ph-x" aria-hidden="true" />
        </button>
      </header>
      <GarmentSummary
        exists={!!current}
        heading={heading}
        g={g}
        host={host}
        metadata={metadata}
        link={link}
        disabled={locked || !!state.blocked || !!state.pending}
        onColour={() => setTab("colour")}
      />
      {!current ? (
        <div className="rp-message">
          <p role="alert">
            이 옷은 현재 옷장에 없어요. 남아 있는 편집 초안은 백업에 보관해요.
          </p>
          <button
            className="btn line"
            type="button"
            onClick={() => void requestClose("backup")}
          >
            백업 열기
          </button>
        </div>
      ) : state.blocked ? (
        <div className="rp-message">
          <p role="alert">{state.blocked}</p>
          <button
            className="btn line"
            type="button"
            onClick={() => void requestClose("backup")}
          >
            백업으로 원문 보관
          </button>
          <p className="rp-note">
            최신 앱에서 다시 확인해 주세요. 현재 초안을 빈 값으로 바꾸지 않아요.
          </p>
        </div>
      ) : state.pending ? (
        <section className="rp-message">
          <h3>쓰던 옷 정보가 있어요</h3>
          <p>
            저장해 둔 편집을 이어 쓸 수 있어요. 아직 실제 옷 정보에 적용하지
            않은 초안이에요.
          </p>
          <button
            className="btn go"
            type="button"
            onClick={() => session.restore()}
          >
            이어서 수정
          </button>
          <button
            className="btn line"
            type="button"
            onClick={() => setDiscard("restart")}
          >
            현재 값으로 새로 수정
          </button>
        </section>
      ) : (
        <>
          <div className="rp-tabs" role="tablist" aria-label="편집할 정보">
            {[
              ["measure", "실측"],
              ["detail", "소재·디테일"],
              ["collection", "소장·컬렉션"],
            ]
              .filter(([id]) => id !== "measure" || info.measures.length)
              .map(([id, label]) => (
                <button
                  type="button"
                  role="tab"
                  key={id}
                  aria-selected={tab === id}
                  onClick={() => setTab(id)}
                >
                  {label}
                </button>
              ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <ProfileFields
              tab={tab}
              form={form}
              info={info}
              base={state.draft.baseProfile}
              g={g}
              core={host.core}
              locked={locked}
              change={change}
              confirm={confirm}
              colour={colour}
              onFocus={(target) => {
                lastField.current = target;
              }}
            />
            {issue?.code === "photo_recovery_pending" && (
              <div className="rp-message">
                <p role="alert">{issue.message}</p>
                <button
                  className="btn line"
                  type="button"
                  onClick={() => void requestClose("backup")}
                >
                  백업에서 복구하기
                </button>
              </div>
            )}
            {error && (
              <div
                className="rp-error"
                ref={(node) => {
                  feedback.current = node;
                }}
              >
                <p role="alert">{error}</p>
                <button
                  className="quiet"
                  type="button"
                  onClick={() => setDiscard("restart")}
                >
                  최신 값으로 새로 수정
                </button>
              </div>
            )}
            {state.notice && !error && (
              <p
                className="rp-status"
                role="status"
                ref={(node) => {
                  feedback.current = node;
                }}
              >
                {state.notice}
              </p>
            )}
            <div className="rp-autosave" role="status">
              {state.saving
                ? "편집 초안을 보관하는 중이에요…"
                : state.dirty && state.persisted
                  ? "편집 초안을 보관했어요 · 옷 정보에는 아직 적용 전"
                  : state.dirty
                    ? "입력이 이 화면에 있어요"
                    : "저장된 옷 정보를 보고 있어요"}
            </div>
            {tab !== "colour" && (
              <footer className="rp-footer">
                <button className="btn go wide" type="submit" disabled={locked}>
                  {state.committing
                    ? "저장하는 중…"
                    : state.needsCleanup
                      ? "초안 정리 다시"
                      : "옷 정보 저장"}
                </button>
              </footer>
            )}
          </form>
          <OwnedOutfits
            g={g}
            closet={closetState.closet}
            host={host}
            version={coreVersion}
          />
          <section className="rp-actions">
            <button
              className="btn line"
              type="button"
              onClick={() => void requestClose("looks")}
            >
              내 옷 코디 보기
            </button>
            <button
              type="button"
              className="quiet"
              disabled={locked}
              onClick={() => setRemove(true)}
            >
              옷장에서 빼기
            </button>
          </section>
        </>
      )}
      {(discard || remove) && (
        <section
          className="rp-confirmation"
          role="alertdialog"
          aria-label={remove ? "옷장에서 빼기 확인" : "편집 닫기 확인"}
        >
          <h3>
            {remove
              ? "이 옷을 옷장에서 뺄까요?"
              : discard === "restart"
                ? "지금 저장된 값으로 새로 수정할까요?"
                : "아직 보관하지 못한 입력이 있어요"}
          </h3>
          <p>
            {remove
              ? "사진 원본·등록 이력·남은 편집 초안은 보관돼요. 구매 기록과 연결된 옷은 기록에서 반품으로 정리해 주세요."
              : discard === "restart"
                ? "현재 편집 초안을 지우고 저장된 옷 정보를 다시 읽어요."
                : "저장된 초안은 남지만, 이 화면에만 있는 마지막 입력은 사라질 수 있어요."}
          </p>
          <div>
            <button
              className="btn go"
              type="button"
              onClick={() => {
                if (remove) void removeOwned();
                else if (discard === "restart") void restart();
                else if (discard === "backup") host.backup();
                else if (discard === "looks") host.looks();
                else if (discard === "navigation") {
                  const resolve = resolveNavigation.current;
                  resolveNavigation.current = null;
                  setDiscard(null);
                  resolve?.(true);
                } else host.close();
              }}
            >
              {remove
                ? "옷장에서 빼기"
                : discard === "restart"
                  ? "새로 수정하기"
                  : "저장된 초안만 남기고 닫기"}
            </button>
            <button
              className="btn line"
              type="button"
              ref={continueButton}
              onClick={() => {
                const resolve = resolveNavigation.current;
                resolveNavigation.current = null;
                resolve?.(false);
                setDiscard(null);
                setRemove(false);
                requestAnimationFrame(() => {
                  if (lastField.current?.isConnected) lastField.current.focus();
                  else heading.current?.focus();
                });
              }}
            >
              계속 수정
            </button>
          </div>
        </section>
      )}
    </dialog>
  );
}
export function mount(host: ProfileHost) {
  const target = host.core
    .getState()
    .closet.find((g) => g.id === host.garmentId);
  if (!target || target.trial) {
    host.close(false);
    return () => {};
  }
  const root = createRoot(host.element);
  root.render(<ProfileEditor host={host} />);
  return () => root.unmount();
}
