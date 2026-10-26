import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createRoot } from "react-dom/client";
import { createMeasureSession } from "./session.js";
import type { MeasureHost, MeasureDraft } from "./types";
import { CandidateInputs } from "./CandidateInputs";
import { ComparisonResult } from "./Comparison";
import "./measure.css";
const text = (error: unknown) =>
  error instanceof Error ? error.message : "비교 입력을 처리하지 못했어요.";
function MeasureScreen({ host }: { host: MeasureHost }) {
  const version = useSyncExternalStore(
    host.core.subscribe,
    host.core.version,
    host.core.version,
  );
  const session = useMemo(
    () =>
      createMeasureSession({
        core: host.core,
        storage: host.storage,
        productId: host.productId,
      }),
    [],
  );
  const state = useSyncExternalStore(
      session.subscribe,
      session.getSnapshot,
      session.getSnapshot,
    ),
    d = state.draft;
  const setup = useMemo(
    () => host.core.measurementInfo(host.productId),
    [host.core, version, host.productId],
  );
  const result = useMemo(
    () => host.core.calculateMeasurements(d),
    [host.core, version, d],
  );
  const reference =
    setup.references.find((g) => g.id === d.referenceId) ||
    (!d.referenceId
      ? setup.references.find((g) => g.profile?.reference)
      : null) ||
    null;
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [leave, setLeave] = useState(false);
  const resolveLeave = useRef<null | ((ok: boolean) => void)>(null),
    heading = useRef<HTMLHeadingElement>(null),
    leaveDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    heading.current?.focus();
    const unregister = host.navigationGuard(() => {
      if (stateRef.current.persisted) return true;
      return session.flush().then(() => {
        if (session.getSnapshot().persisted) return true;
        return new Promise<boolean>((resolve) => {
          resolveLeave.current = resolve;
          setLeave(true);
        });
      });
    });
    return () => {
      unregister();
      const resolve = resolveLeave.current;
      resolveLeave.current = null;
      resolve?.(false);
    };
  }, []);
  const stateRef = useRef(state);
  stateRef.current = state;
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (!state.persisted) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [state.persisted]);
  useEffect(() => {
    if (leave && !leaveDialog.current?.open) leaveDialog.current?.showModal();
  }, [leave]);
  const change = (fn: (value: MeasureDraft) => void) => {
    setError("");
    void session.change(fn);
  };
  const selectReference = async (id: string) => {
    setBusy(true);
    setError("");
    try {
      await session.flush();
      if (id)
        await host.core.withStorageLock(() => {
          host.core.assertPhotoReady();
          host.core.reloadSaved();
          const own = host.core.getState().closet.find((g) => g.id === id);
          if (!own || own.trial || own.kind !== setup.product.kind)
            throw Error("같은 종류의 실제 보유 옷을 골라 주세요.");
          host.core.updateGarmentProfile(id, {
            ...(own.profile || { v: 1 }),
            reference: true,
          });
        });
      await session.change((d) => {
        d.referenceId = id || null;
      });
    } catch (e) {
      setError(text(e));
    } finally {
      setBusy(false);
    }
  };
  const addReference = async () => {
    setBusy(true);
    setError("");
    try {
      await session.flush();
      const g = await host.core.withStorageLock(() => {
        host.core.assertPhotoReady();
        host.core.reloadSaved();
        return host.core.addGarment({
          kind: setup.product.kind,
          gender: setup.product.gender,
          color: null,
          label: `${setup.product.kindName} 비교 기준`,
          profile: { v: 1, reference: true },
        });
      });
      await session.change((d) => {
        d.referenceId = g.id;
      });
      host.editReference(g.id);
    } catch (e) {
      setError(text(e));
    } finally {
      setBusy(false);
    }
  };
  const finishLeave = (ok: boolean) => {
    const resolve = resolveLeave.current;
    resolveLeave.current = null;
    leaveDialog.current?.close();
    setLeave(false);
    resolve?.(ok);
  };
  const locked = busy || !!host.core.storageIssue();
  return (
    <section
      className="mc"
      data-measure-screen
      data-measure-saved={state.persisted ? "true" : "false"}
    >
      <header className="mc-top">
        <button
          className="icon"
          type="button"
          onClick={host.back}
          aria-label="뒤로"
        >
          <i className="ph ph-caret-left" aria-hidden="true" />
        </button>
        <span>내 옷과 실측 비교</span>
      </header>
      <h1 ref={heading} tabIndex={-1}>
        {setup.product.brand}
        <br />
        <span>{setup.product.name}</span>
      </h1>
      <p className="mc-price">
        {setup.product.priceText}{" "}
        <small>{setup.product.priceShort || "수집 시점 가격"}</small> ·{" "}
        <a href={setup.product.url} target="_blank" rel="noopener noreferrer">
          상품 원문
        </a>
      </p>
      <p className="mc-note" role="note">
        {result.note}
      </p>
      {state.blocked ? (
        <div className="mc-message">
          <p role="alert">{state.blocked}</p>
          <button className="btn line" type="button" onClick={host.backup}>
            백업으로 원문 보관
          </button>
        </div>
      ) : (
        <>
          <section className="mc-section">
            <h2>1. 잘 맞는 내 기준 옷</h2>
            {setup.references.length ? (
              <>
                <label className="mc-label">
                  비교할 내 옷
                  <select
                    aria-label="비교할 내 옷"
                    value={reference?.id || ""}
                    disabled={locked}
                    onChange={(e) => void selectReference(e.target.value)}
                  >
                    <option value="">
                      {setup.references.some((g) => g.profile?.reference)
                        ? "이 종류의 저장된 기준 사용"
                        : "기준 옷을 골라 주세요"}
                    </option>
                    {setup.references.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.label}
                        {g.profile?.reference ? " · 이 종류 기준" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="mc-small">
                  내 옷을 고르면 이 종류의 저장된 비교 기준도 함께 바뀌어요.
                </p>
                {reference && (
                  <>
                    <p className="mc-small">
                      {Object.entries(reference.profile?.measures || {})
                        .map(
                          ([id, value]) =>
                            `${setup.fields.find((f) => f.id === id)?.label || id} ${value.cm}cm`,
                        )
                        .join(" · ") || "아직 저장된 실측이 없어요."}
                    </p>
                    <button
                      className="quiet"
                      type="button"
                      data-reference-edit
                      onClick={() => host.editReference(reference.id)}
                    >
                      기준 옷 실측 수정
                    </button>
                  </>
                )}
              </>
            ) : (
              <p className="mc-small">
                옷장 전체가 필요하지 않아요. 실제로 가진 이 종류의 한 벌만
                기준으로 기록할 수 있어요.
              </p>
            )}
            {!reference && (
              <button
                className="btn line"
                type="button"
                disabled={locked || !setup.fields.length}
                onClick={() => void addReference()}
              >
                가지고 있는 {setup.product.kindName} 한 벌 기록
              </button>
            )}
          </section>
          <CandidateInputs
            d={d}
            result={result}
            setup={setup}
            change={change}
          />
          {(result.problems.length > 0 || result.warnings.length > 0) && (
            <section className="mc-message" aria-label="입력 확인">
              {result.problems.map((p, i) => (
                <p key={`p${i}`} role="alert">
                  {p}
                </p>
              ))}
              {result.warnings.map((p, i) => (
                <p key={`w${i}`}>{p}</p>
              ))}
            </section>
          )}
          <ComparisonResult result={result} reference={reference} />
          {error && (
            <p role="alert" className="mc-message">
              {error}
            </p>
          )}
          {state.notice && (
            <div className="mc-message">
              <p role="status">{state.notice}</p>
              <button
                className="quiet"
                type="button"
                onClick={() => void session.retry()}
              >
                비교 입력 다시 보관
              </button>
            </div>
          )}
          <p className="mc-small" role="status">
            {state.saving
              ? "비교 입력을 보관하는 중…"
              : state.persisted
                ? "비교 입력은 이 기기에 보관돼요. 옷장에 후보를 추가하지 않아요."
                : "마지막 입력이 아직 이 화면에만 있어요."}
          </p>
        </>
      )}
      {leave && (
        <dialog
          ref={leaveDialog}
          className="mc-leave"
          onCancel={(e) => {
            e.preventDefault();
            finishLeave(false);
          }}
        >
          <h2>보관하지 못한 비교 입력이 있어요</h2>
          <p>저장된 초안은 남지만 마지막 입력은 사라질 수 있어요.</p>
          <button
            className="btn line"
            type="button"
            autoFocus
            onClick={() => finishLeave(false)}
          >
            계속 비교
          </button>
          <button
            className="btn go"
            type="button"
            onClick={() => finishLeave(true)}
          >
            저장된 초안만 남기고 이동
          </button>
        </dialog>
      )}
    </section>
  );
}
export function mount(host: MeasureHost) {
  if (!host.core.product(host.productId)) {
    host.element.textContent = "비교할 상품을 찾지 못했어요.";
    return () => {};
  }
  const root = createRoot(host.element);
  root.render(<MeasureScreen host={host} />);
  return () => root.unmount();
}
