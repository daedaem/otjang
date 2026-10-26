import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createRoot } from "react-dom/client";
import { createCollectionSession } from "./session.js";
import { CandidateValue } from "./CandidateValue";
import { Shelves } from "./Shelves";
import type { CollectionHost, Preference } from "./types";
import "./collection.css";
function CollectionScreen({ host }: { host: CollectionHost }) {
  const version = useSyncExternalStore(
    host.core.subscribe,
    host.core.version,
    host.core.version,
  );
  const session = useMemo(
    () => createCollectionSession({ core: host.core, storage: host.storage }),
    [],
  );
  const state = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot,
  );
  const info = useMemo(
    () => host.core.collectionInfo(host.productId || null, state.bag),
    [host.core, host.productId, state.bag, version],
  );
  const [series, setSeries] = useState(""),
    [target, setTarget] = useState(""),
    [goalDirty, setGoalDirty] = useState(false),
    [error, setError] = useState(""),
    [leave, setLeave] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null),
    goalForm = useRef<HTMLDetailsElement>(null),
    goalInput = useRef<HTMLInputElement>(null),
    dialog = useRef<HTMLDialogElement>(null),
    answer = useRef<null | ((ok: boolean) => void)>(null);
  const goalUnstored =
    goalDirty &&
    !(
      state.persisted &&
      state.bag.goals.some(
        (g) =>
          host.core.collectionSeriesKey(g.series) ===
            host.core.collectionSeriesKey(series.trim()) &&
          String(g.target) === target,
      )
    );
  const latest = useRef({
    persisted: state.persisted,
    goalDirty: goalUnstored,
  });
  latest.current = { persisted: state.persisted, goalDirty: goalUnstored };
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    const remove = host.navigationGuard(() => {
      if (latest.current.persisted && !latest.current.goalDirty) return true;
      return session.flush().then(() => {
        if (session.getSnapshot().persisted && !latest.current.goalDirty)
          return true;
        return new Promise<boolean>((resolve) => {
          answer.current = resolve;
          setLeave(true);
        });
      });
    });
    return () => {
      remove();
      answer.current?.(false);
      answer.current = null;
    };
  }, []);
  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => {
      if (!state.persisted || goalUnstored) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [state.persisted, goalUnstored]);
  useEffect(() => {
    if (leave && !dialog.current?.open) dialog.current?.showModal();
  }, [leave]);
  const finishLeave = (ok: boolean) => {
    const resolve = answer.current;
    answer.current = null;
    dialog.current?.close();
    setLeave(false);
    resolve?.(ok);
  };
  const saveGoal = async () => {
    setError("");
    if (
      !series.trim() ||
      !/^\d+$/.test(target) ||
      Number(target) < 1 ||
      Number(target) > 100
    ) {
      setError("시리즈 이름과 1~100벌의 목표 수량을 확인해 주세요.");
      return;
    }
    await session.saveGoal(series, Number(target));
    if (session.getSnapshot().persisted) {
      setSeries("");
      setTarget("");
      setGoalDirty(false);
    }
  };
  const editGoal = (name: string, count: number | null) => {
    setSeries(name);
    setTarget(count === null ? "" : String(count));
    setGoalDirty(true);
    setError("");
    if (goalForm.current) goalForm.current.open = true;
    requestAnimationFrame(() => goalInput.current?.focus());
  };
  const disabled = !!state.blocked || !!host.core.storageIssue();
  const preference: Preference = state.bag.candidates[host.productId || ""] || {
    purpose: null,
    series: "",
    updatedAt: new Date().toISOString(),
  };
  return (
    <section
      className="cv"
      data-collection-screen
      data-collection-saved={state.persisted ? "true" : "false"}
    >
      <header className="cv-top">
        <button
          className="icon"
          type="button"
          aria-label="뒤로"
          onClick={host.back}
        >
          ←
        </button>
        <span>{info.product ? "활용과 소장" : "내 진열장"}</span>
      </header>
      <h1 tabIndex={-1} ref={heading}>
        {info.product ? (
          <>
            {info.product.brand}
            <small>{info.product.name}</small>
          </>
        ) : (
          "모으는 이유도 내 취향이에요"
        )}
      </h1>
      {info.product ? (
        <p className="cv-note">
          {info.product.priceText} · 수집 시점 가격 ·{" "}
          <a href={info.product.url} target="_blank" rel="noopener noreferrer">
            상품 원문
          </a>
        </p>
      ) : (
        <p className="cv-note">
          {info.ownedCount}벌의 실제 내 옷에서 모았어요. 체험용과 구매 후보는
          보유 수에 넣지 않아요.
        </p>
      )}
      {host.core.boot?.preview && (
        <p className="cv-note">
          체험 화면의 메모는 실제 개인 자료에 저장하지 않아요.
        </p>
      )}
      {state.blocked ? (
        <div className="cv-message">
          <p role="alert">{state.blocked}</p>
          <button className="btn line" type="button" onClick={host.backup}>
            백업으로 원문 보관
          </button>
        </div>
      ) : (
        <>
          {info.product ? (
            <CandidateValue
              info={info}
              preference={preference}
              disabled={disabled}
              onChange={(p) => void session.saveCandidate(info.product!.id, p)}
              onShelves={host.shelves}
            />
          ) : (
            <>
              <Shelves
                shelves={info.shelves}
                host={host}
                disabled={disabled}
                edit={editGoal}
                remove={(name) => void session.removeGoal(name)}
              />
              <details className="cv-goal-form" ref={goalForm}>
                <summary>목표 직접 정하기</summary>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void saveGoal();
                  }}
                >
                  <label className="cv-field">
                    시리즈 이름
                    <input
                      ref={goalInput}
                      aria-label="목표 시리즈 이름"
                      maxLength={40}
                      value={series}
                      disabled={disabled}
                      onChange={(e) => {
                        setSeries(e.target.value);
                        setGoalDirty(true);
                      }}
                    />
                  </label>
                  <label className="cv-field">
                    목표 수량 <small>선택한 시리즈의1~100벌</small>
                    <input
                      aria-label="진열 목표 수량"
                      inputMode="numeric"
                      value={target}
                      maxLength={3}
                      disabled={disabled}
                      onChange={(e) => {
                        setTarget(e.target.value);
                        setGoalDirty(true);
                      }}
                    />
                  </label>
                  <p className="cv-note">
                    정한 목표의 빈칸만 보여요. 부족한 필수품이나 구매 권유가
                    아니에요.
                  </p>
                  <button
                    className="btn line"
                    disabled={disabled || state.saving}
                    type="submit"
                  >
                    목표 저장
                  </button>
                </form>
              </details>
            </>
          )}
          {(state.notice || error) && (
            <div className="cv-message">
              <p role="alert">{error || state.notice}</p>
              {!state.persisted && (
                <>
                  <button
                    className="btn line"
                    type="button"
                    onClick={() => void session.retry()}
                  >
                    입력 보관 다시 시도
                  </button>
                  <button className="quiet" type="button" onClick={host.backup}>
                    백업 확인
                  </button>
                </>
              )}
            </div>
          )}
          <p className="cv-status" role="status">
            {state.saving
              ? "이 기기에 보관하는 중…"
              : state.persisted
                ? "이 기기의 메모예요 · 사진은 전송하지 않아요"
                : "마지막 입력은 이 화면에만 남아 있어요"}
          </p>
        </>
      )}
      {leave && (
        <dialog
          className="cv-leave"
          ref={dialog}
          onCancel={(e) => {
            e.preventDefault();
            finishLeave(false);
          }}
        >
          <h2>아직 보관하지 못한 입력이 있어요</h2>
          <p>
            입력 중인 목표나 마지막 메모가 사라질 수 있어요. 저장된 자료는
            남아요.
          </p>
          <button
            className="btn line"
            type="button"
            autoFocus
            onClick={() => finishLeave(false)}
          >
            계속 확인
          </button>
          <button
            className="btn go"
            type="button"
            onClick={() => finishLeave(true)}
          >
            저장된 메모만 남기고 이동
          </button>
        </dialog>
      )}
    </section>
  );
}
export function mount(host: CollectionHost) {
  const root = createRoot(host.element);
  root.render(<CollectionScreen host={host} />);
  return () => root.unmount();
}
