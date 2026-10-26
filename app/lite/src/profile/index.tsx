import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createRoot } from "react-dom/client";
import { OwnedPhoto } from "../photos/OwnedPhoto";
import { createProfileSession } from "./draft-session.js";
import type { AttributeKey, ProfileHost, ProfileForm } from "./types";
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
  const initial = useRef(
    host.core.getState().closet.find((g) => g.id === host.garmentId)!,
  );
  const current = host.core
      .getState()
      .closet.find((g) => g.id === host.garmentId),
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
    closing = useRef(false);
  const [tab, setTab] = useState(info.measures.length ? "measure" : "detail"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [discard, setDiscard] = useState<
      null | "close" | "backup" | "looks" | "restart"
    >(null),
    [remove, setRemove] = useState(false);
  const issue = host.core.storageIssue();
  const locked =
    busy || state.committing || issue?.code === "photo_recovery_pending";
  const metadata = host.metadata(g.id),
    brand = g.brand || metadata?.brand,
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
  const source = (key: AttributeKey) => {
    const base = state.draft.baseProfile?.[key];
    if (form.attributes[key] !== base?.value && form.attributes[key])
      return "직접 입력 · 저장 대기";
    if (form.confirmed.includes(key)) return "확인함 · 저장 대기";
    return base ? info.sources[base.source] : "모름";
  };
  return (
    <dialog
      ref={dialog}
      className="sheet rp"
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
      <div className="rp-head">
        <div className="rp-photo">
          <OwnedPhoto g={g} host={host} />
        </div>
        <div>
          <p className="rp-brand">{brand || "브랜드 미입력"}</p>
          <h2 ref={heading} tabIndex={-1}>
            {g.label}
          </h2>
          <p>
            {g.kindName} · {g.colorLabel || "색 미확인"}
          </p>
          <button
            className="quiet"
            type="button"
            disabled={locked || !!state.blocked || !!state.pending}
            onClick={() => setTab("colour")}
          >
            색 바꾸기
          </button>
        </div>
      </div>
      {metadata?.source?.provider === "opf" &&
        /^\d{6,24}$/.test(metadata.source.code) && (
          <p className="rp-note">
            Open Products Facts에서 가져온 정보예요.{" "}
            <a
              href={`https://world.openproductsfacts.org/product/${metadata.source.code}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              원본
            </a>{" "}
            ·{" "}
            <a
              href="https://opendatacommons.org/licenses/odbl/1-0/"
              target="_blank"
              rel="noopener noreferrer"
            >
              ODbL
            </a>
          </p>
        )}
      {metadata?.community && (
        <p className="rp-note">
          {metadata.community.label}
          {link && (
            <>
              {" "}
              ·{" "}
              <a href={link} target="_blank" rel="noopener noreferrer">
                등록한 링크
              </a>
            </>
          )}
        </p>
      )}
      {!metadata?.community && link && (
        <a
          className="rp-link"
          href={link}
          target="_blank"
          rel="noopener noreferrer"
        >
          상품 원문 링크{" "}
          <i className="ph ph-arrow-up-right" aria-hidden="true" />
        </a>
      )}
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
            <fieldset disabled={locked} className="rp-fields">
              {tab === "measure" && (
                <section>
                  <h3>잘 맞는 옷 한 벌만 재도 돼요</h3>
                  <p className="rp-note">
                    몸 치수가 아닌, 옷을 평평하게 놓고 잰 cm예요. 비워 둔 값은
                    모름으로 남겨요.
                  </p>
                  <label className="rp-reference">
                    <input
                      type="checkbox"
                      checked={form.reference}
                      aria-label="이 종류의 비교 기준 옷"
                      onChange={(e) =>
                        change((f) => {
                          f.reference = e.target.checked;
                        })
                      }
                    />
                    <span>
                      이 종류의 비교 기준 옷
                      <small>
                        저장하면 같은 종류의 기존 기준 옷을 대신해요.
                      </small>
                    </span>
                  </label>
                  {info.measures.map((field) => (
                    <div className="rp-measure" key={field.id}>
                      <label htmlFor={`rp-${field.id}`}>
                        {field.label} (cm)
                      </label>
                      <input
                        id={`rp-${field.id}`}
                        inputMode="decimal"
                        autoComplete="off"
                        maxLength={20}
                        value={form.measures[field.id]}
                        placeholder="모름"
                        onChange={(e) =>
                          change((f) => {
                            f.measures[field.id] = e.target.value;
                          })
                        }
                      />
                      <select
                        aria-label={`${field.label} 출처`}
                        value={form.measureSources[field.id]}
                        onChange={(e) =>
                          change((f) => {
                            f.measureSources[field.id] = e.target.value as
                              | "measured"
                              | "seller";
                          })
                        }
                      >
                        <option value="measured">직접 잼</option>
                        <option value="seller">판매처 표기</option>
                      </select>
                    </div>
                  ))}
                </section>
              )}
              {tab === "detail" && (
                <section>
                  <h3>아는 정보만 적어 주세요</h3>
                  <p className="rp-note">
                    모르는 속성은 채우지 않아요. AI 추정은 확인하기 전까지
                    추정으로 남겨요.
                  </p>
                  {info.attributes.map((attr) => (
                    <div className="rp-attribute" key={attr.id}>
                      <label htmlFor={`rp-${attr.id}`}>
                        {attr.label}
                        <small>{source(attr.id)}</small>
                      </label>
                      {attr.choices ? (
                        <select
                          id={`rp-${attr.id}`}
                          value={form.attributes[attr.id]}
                          onChange={(e) =>
                            change((f) => {
                              f.attributes[attr.id] = e.target.value;
                            })
                          }
                        >
                          <option value="">모름</option>
                          {Object.entries(attr.choices).map(([id, label]) => (
                            <option key={id} value={id}>
                              {label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          id={`rp-${attr.id}`}
                          value={form.attributes[attr.id]}
                          maxLength={40}
                          placeholder="모름"
                          onChange={(e) =>
                            change((f) => {
                              f.attributes[attr.id] = e.target.value;
                            })
                          }
                        />
                      )}{" "}
                      {state.draft.baseProfile?.[attr.id]?.source === "ai" &&
                        form.attributes[attr.id] ===
                          state.draft.baseProfile[attr.id]?.value && (
                          <label className="rp-confirm">
                            <input
                              type="checkbox"
                              aria-label={`${attr.label} 추정을 확인했어요`}
                              checked={form.confirmed.includes(attr.id)}
                              onChange={(e) =>
                                confirm(attr.id, e.target.checked)
                              }
                            />
                            이 추정이 맞아요
                          </label>
                        )}
                    </div>
                  ))}
                  {form.attributes.pattern && (
                    <label className="rp-line">
                      무늬 설명 (선택)
                      <input
                        value={form.patternNote}
                        maxLength={40}
                        onChange={(e) =>
                          change((f) => {
                            f.patternNote = e.target.value;
                          })
                        }
                      />
                    </label>
                  )}
                  <label className="rp-line">
                    디테일 (한 줄에 하나)
                    <textarea
                      value={form.details}
                      maxLength={1000}
                      rows={3}
                      placeholder="아는 디테일만 적어요"
                      onChange={(e) =>
                        change((f) => {
                          f.details = e.target.value;
                        })
                      }
                    />
                  </label>
                  {info.facts
                    .filter((f) => f.key === "details" && f.source === "ai")
                    .map((f) => (
                      <label className="rp-confirm" key={f.confirmKey}>
                        <input
                          type="checkbox"
                          checked={form.confirmed.includes(f.confirmKey)}
                          onChange={(e) =>
                            confirm(f.confirmKey, e.target.checked)
                          }
                        />
                        {f.text} · AI 추정이 맞아요
                      </label>
                    ))}
                </section>
              )}
              {tab === "collection" && (
                <section>
                  <h3>입기 위해서, 모으는 즐거움으로</h3>
                  <p className="rp-note">
                    소장용 옷은 자주 입지 않아도 실패한 구매로 세지 않아요.
                  </p>
                  <label className="rp-line">
                    이 옷의 목적
                    <select
                      value={form.purpose}
                      onChange={(e) =>
                        change((f) => {
                          f.purpose = e.target.value as ProfileForm["purpose"];
                        })
                      }
                    >
                      <option value="">아직 정하지 않음</option>
                      {Object.entries(info.purposes).map(([id, label]) => (
                        <option key={id} value={id}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="rp-line">
                    컬렉션 이름 (선택)
                    <input
                      maxLength={40}
                      value={form.series}
                      placeholder="예: 내가 모으는 옥스퍼드"
                      onChange={(e) =>
                        change((f) => {
                          f.series = e.target.value;
                        })
                      }
                    />
                  </label>
                </section>
              )}
              {tab === "colour" && (
                <section>
                  <h3>무슨 색인가요?</h3>
                  <p className="rp-note">
                    색을 누르면 바로 저장돼요. 실측 편집 초안은 그대로 남겨요.
                  </p>
                  <div className="rp-colours">
                    {host.core.colorChoices().map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        aria-pressed={g.color === c.id}
                        onClick={() => void colour(c.id)}
                      >
                        <span style={{ background: c.hex }} />
                        {c.label}
                      </button>
                    ))}
                    <button type="button" onClick={() => void colour("")}>
                      색 모름
                    </button>
                  </div>
                </section>
              )}
            </fieldset>
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
              <p className="rp-error" role="alert">
                {error}
              </p>
            )}
            {state.notice && !error && (
              <p className="rp-status" role="status">
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
                else host.close();
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
              onClick={() => {
                setDiscard(null);
                setRemove(false);
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
