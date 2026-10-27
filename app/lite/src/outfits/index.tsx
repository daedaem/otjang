import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createRoot } from "react-dom/client";
import { createReactionSession } from "./reaction-session.js";
import { createOutfitAI } from "./ai-session.js";
import { OutfitGrid, attributeLinesFor } from "./OutfitGrid";
import { AIResult, AttributeCheck } from "./AIResult";
import { ContextChips, ComparisonForm } from "./Controls";
import { OutfitIntro, EmptyWardrobe } from "./Intro";
import { SceneSuggestions } from "./SceneSuggestions";
import type {
  ChoiceTarget,
  Context,
  OutfitHost,
  Reaction,
  Review,
} from "./types";
import "./outfits.css";
const whyText = (code: string) =>
  ({
    unauthorized: "로그인 상태를 확인해 주세요.",
    not_configured: "AI 연결을 확인하지 못했어요.",
    provider_access_denied: "AI 제공자가 이 요청을 허용하지 않았어요.",
    daily_limit: "오늘 AI 사용 한도에 도달했어요.",
    monthly_limit: "이번 달 AI 사용 한도에 도달했어요.",
    rate_limited: "AI 요청이 많아 잠시 뒤에 다시 시도해 주세요.",
    budget_unavailable: "AI 사용 한도를 확인하지 못했어요.",
    timeout: "AI 응답이 늦어졌어요.",
    offline: "연결이 없어 AI 응답을 받지 못했어요.",
    preview: "체험 화면에서는 실제 AI를 요청하지 않아요.",
    parse: "AI 응답을 확인하지 못했어요.",
  })[code] || "AI 응답을 받지 못했어요.";
const sameIds = (a: string[], b: string[]) =>
  JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
function OutfitScreen({ host }: { host: OutfitHost }) {
  const version = useSyncExternalStore(
    host.core.subscribe,
    host.core.version,
    host.core.version,
  );
  const session = useMemo(
    () => createReactionSession({ core: host.core, storage: host.storage }),
    [],
  );
  const state = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot,
  );
  const ai = useMemo(
    () =>
      createOutfitAI({
        request: host.request,
        accept: (request, out) => host.core.readOutfitResponse(request, out),
      }),
    [],
  );
  const aiState = useSyncExternalStore(
    ai.subscribe,
    ai.getSnapshot,
    ai.getSnapshot,
  );
  const [query, setQuery] = useState(host.session.query),
    [context, setContext] = useState<Context>(() => ({
      ...host.session.context,
      ...(host.mood ? { occasion: host.mood } : {}),
    })),
    [error, setError] = useState(""),
    [leave, setLeave] = useState(false),
    [submittedBag, setSubmittedBag] = useState(() =>
      structuredClone(state.bag),
    ),
    [hasAsked, setHasAsked] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null),
    leaveDialog = useRef<HTMLDialogElement>(null),
    answer = useRef<null | ((ok: boolean) => void)>(null);
  const latest = useRef(state);
  latest.current = state;
  host.session.query = query;
  host.session.context = context;
  const choices = useMemo(() => host.core.outfitChoices(), [host.core]);
  const closet = useMemo(() => host.core.getState(), [host.core, version]);
  const byId = useMemo(
    () => new Map(closet.closet.map((g) => [g.id, g])),
    [closet],
  );
  const computed = useMemo(() => {
    try {
      return { review: host.core.outfitReview(context, state.bag), issue: "" };
    } catch {
      return {
        review: { request: null, candidates: [], total: 0, note: "" } as Review,
        issue:
          "코디에 보낼 옷 정보를 확인하지 못했어요. 기록을 바꾸지 않았어요.",
      };
    }
  }, [host.core, version, context, state.bag]);
  const review = computed.review;
  // A thumb vote applies on the next explicit comparison, keeping cards stable.
  // Garment/profile/context edits still rebuild and invalidate the exact source.
  const comparedReview = useMemo(() => {
    if (!hasAsked) return review;
    try {
      return host.core.outfitReview(context, submittedBag);
    } catch {
      return review;
    }
  }, [host.core, version, context, submittedBag, hasAsked, review]);
  const sourceKey = comparedReview.request
    ? JSON.stringify(comparedReview.request)
    : "";
  const queryDirty = query.trim() !== (context.query || "");
  const result =
    !queryDirty && aiState.sourceKey === sourceKey ? aiState.result : null;
  const feedbackChanged =
    hasAsked &&
    JSON.stringify(review.request?.taste) !==
      JSON.stringify(comparedReview.request?.taste);
  const order = useMemo(
    () =>
      new Map(
        result?.ranking.map((row, i) => [row.id, { ...row, rank: i + 1 }]) ||
          [],
      ),
    [result],
  );
  const candidates = useMemo(
    () =>
      result
        ? [...review.candidates].sort(
            (a, b) =>
              (order.get(a.id)?.rank || 999) - (order.get(b.id)?.rank || 999),
          )
        : review.candidates,
    [review.candidates, result, order],
  );
  const evidence = useMemo(() => {
    try {
      const input = result ? comparedReview.request : review.request;
      return input ? host.core.outfitEvidence(input).outfits : [];
    } catch {
      return [];
    }
  }, [host.core, review.request, comparedReview.request, result]);
  const reactions = state.bag.reactions;
  const unmatchedAttributeLines = useMemo(
    () =>
      result
        ? result.attribute_check.lines.filter(
            (line) =>
              !candidates.some(
                (candidate) =>
                  attributeLinesFor(candidate, byId, [line]).length,
              ),
          )
        : [],
    [result, candidates, byId],
  );
  const demo = useMemo(
    () =>
      !review.candidates.length && closet.trialCount
        ? host.core
            .closetOutfits({ detail: true, limit: 4 })
            .list.map((o, i) => ({ ...o, id: `trial_${i}` }))
        : [],
    [host.core, version, review.candidates.length, closet.trialCount],
  );
  const sceneLabel =
    choices.occasions.find(([id]) => id === context.occasion)?.[1] || "";
  const scene = useMemo(
    () => (sceneLabel ? host.scene(sceneLabel) : null),
    [host.core, version, sceneLabel],
  );
  const suggestions = useMemo(() => {
    if (sceneLabel || closet.trialCount) return [];
    const s = host.core.suggest({ limit: 3 });
    return s.basis === "closet" ? s.items : [];
  }, [host.core, version, sceneLabel, closet.trialCount]);
  useLayoutEffect(() => {
    ai.setSource(comparedReview.request);
  }, [ai, sourceKey]);
  useLayoutEffect(() => {
    // A lazy screen must not take focus back after the user chose a tab.
    const active = document.activeElement;
    if (!active || active === document.body || host.element.contains(active))
      heading.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    const listener = (event: StorageEvent) => {
      if (event.key === host.core.outfitReactionsKey || event.key === null)
        session.sync();
    };
    window.addEventListener("storage", listener);
    const unregister = host.navigationGuard(() => {
      if (latest.current.persisted) return true;
      return session.flush().then(() => {
        if (session.getSnapshot().persisted) return true;
        return new Promise<boolean>((resolve) => {
          answer.current = resolve;
          setLeave(true);
        });
      });
    });
    return () => {
      window.removeEventListener("storage", listener);
      unregister();
      answer.current?.(false);
      answer.current = null;
      ai.dispose();
    };
  }, []);
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
  const finishLeave = (ok: boolean) => {
    const resolve = answer.current;
    answer.current = null;
    leaveDialog.current?.close();
    setLeave(false);
    resolve?.(ok);
  };
  const updateContext = (patch: Partial<Context>) => {
    setError("");
    setContext((c) => ({ ...c, ...patch }));
  };
  const ask = async () => {
    setError("");
    await session.flush();
    if (!session.getSnapshot().persisted) {
      setError(
        "보관하지 못한 반응을 먼저 확인해 주세요. 그 반응으로 AI를 요청하지 않았어요.",
      );
      return;
    }
    try {
      const nextContext = {
          ...context,
          query: query.trim() || "내 옷으로 코디",
        },
        next = host.core.outfitReview(nextContext, session.getSnapshot().bag);
      setQuery(nextContext.query);
      setContext(nextContext);
      setSubmittedBag(structuredClone(session.getSnapshot().bag));
      setHasAsked(true);
      ai.setSource(next.request);
      await ai.ask();
    } catch {
      setError("코디 정보를 확인하지 못했어요. 옷장 기록은 그대로예요.");
    }
  };
  const selected = (ids: string[]) =>
    [...reactions]
      .filter(
        (r) => r.occasion === context.occasion && sameIds(r.garmentIds, ids),
      )
      .sort((a, b) => b.at.localeCompare(a.at))[0] || null;
  const choose = (target: ChoiceTarget) => {
    setError("");
    const ids = target.candidate.pieces
      .map((p) => p.garmentId)
      .filter((id): id is string => !!id);
    if (target.reasons && target.reasons.length > 5) {
      setError("이유는 최대5개까지 남길 수 있어요.");
      return;
    }
    const existing = [...session.getSnapshot().bag.reactions]
      .filter(
        (r) => r.occasion === context.occasion && sameIds(r.garmentIds, ids),
      )
      .sort((a, b) => b.at.localeCompare(a.at))[0];
    const reasons = target.reasons || existing?.reasons || [];
    if (
      existing?.verdict === target.verdict &&
      JSON.stringify(existing.reasons) === JSON.stringify(reasons)
    )
      return;
    const reaction: Reaction = {
      id: existing?.id || target.identity,
      garmentIds: ids,
      verdict: target.verdict,
      reasons,
      occasion: context.occasion,
      at: new Date().toISOString(),
    };
    void session.put(reaction);
  };
  const blocked = !!state.blocked || !!host.core.storageIssue(),
    loading = aiState.phase === "loading" && aiState.sourceKey === sourceKey;
  return (
    <section
      className="of"
      data-react-outfits
      data-reactions-saved={state.persisted ? "true" : "false"}
    >
      <OutfitIntro
        host={host}
        closet={closet}
        heading={heading}
        version={version}
      />
      <ContextChips
        context={context}
        choices={choices}
        updateContext={updateContext}
      />
      {!closet.closetCount && <EmptyWardrobe host={host} />}
      {computed.issue && (
        <p className="of-notice" role="alert">
          {computed.issue}
        </p>
      )}
      {state.blocked ? (
        <div className="of-notice">
          <p role="alert">{state.blocked}</p>
          <button type="button" className="btn line" onClick={host.backup}>
            백업으로 원문 보관
          </button>
        </div>
      ) : (
        <>
          {review.request && (
            <ComparisonForm
              query={query}
              context={context}
              choices={choices}
              setQuery={setQuery}
              updateContext={updateContext}
              setError={setError}
              ask={() => void ask()}
              loading={loading}
              disabled={
                blocked || loading || state.saving || !!host.core.boot?.preview
              }
            />
          )}
          {host.core.boot?.preview && (
            <p className="of-note">
              체험 화면에서는 실제 AI를 요청하지 않고, 반응도 실제 기록에
              저장하지 않아요.
            </p>
          )}
          {queryDirty && result === null && review.request && (
            <p className="of-note">
              입력 중인 요청은 아직 비교하지 않았어요. AI로 비교를 눌러 주세요.
            </p>
          )}
          {(error || state.notice) && (
            <div className="of-notice">
              <p role="alert">{error || state.notice}</p>
              {!state.persisted && (
                <>
                  <button
                    className="btn line"
                    type="button"
                    onClick={() => void session.retry()}
                  >
                    반응 보관 다시 시도
                  </button>
                  <button className="quiet" type="button" onClick={host.backup}>
                    백업 확인
                  </button>
                </>
              )}
            </div>
          )}
          {aiState.phase === "error" && aiState.sourceKey === sourceKey && (
            <p className="of-notice" role="alert">
              {whyText(aiState.why)} 아래는 AI 순위가 없는 조합 후보예요.
            </p>
          )}
          {result ? (
            <AIResult
              result={result}
              feedbackChanged={feedbackChanged}
              aiState={aiState}
              scope={{
                total: comparedReview.total,
                compared: comparedReview.request?.outfits.length || 0,
              }}
            />
          ) : (
            review.request && (
              <p className="of-basis" role="status">
                {loading
                  ? "AI 순서와 이유를 기다리는 중이에요."
                  : "아직 순위가 없는 조합 후보예요."}{" "}
                {review.note}
              </p>
            )
          )}
          <OutfitGrid
            candidates={candidates}
            host={host}
            garments={byId}
            occasion={context.occasion}
            selected={selected}
            disabled={blocked}
            choose={choose}
            ranking={order}
            evidence={evidence}
            attributeLines={result?.attribute_check.lines || []}
          />
          {!review.request && closet.mineCount > 0 && !computed.issue && (
            <div className="of-empty">
              <h2>실제 내 옷의 조합이 아직 없어요</h2>
              <p>{review.note}</p>
              <button className="btn line" type="button" onClick={host.add}>
                내 옷 더 넣기
              </button>
            </div>
          )}
          {demo.length > 0 && (
            <details className="of-demo" open>
              <summary>체험용 코디 · 가진 옷이 아니에요</summary>
              <p className="of-note">
                이 예시는 AI 요청·내 반응·실제 보유 집계에 넣지 않아요.
              </p>
              <OutfitGrid
                candidates={demo.slice(0, 4)}
                host={host}
                garments={byId}
                occasion={null}
                disabled
                trial
              />
            </details>
          )}
          {result && (
            <AttributeCheck result={result} lines={unmatchedAttributeLines} />
          )}
          {review.request && (
            <p className="of-note">
              {review.reactionBasis} 반응 {reactions.length}개는 이 기기에 직접
              남긴 기록이며 사람 수가 아니에요.
            </p>
          )}
          <SceneSuggestions
            host={host}
            scene={scene}
            suggestions={suggestions}
            label={sceneLabel}
          />
          <p className="of-status" role="status">
            {host.core.boot?.preview
              ? "미리보기 반응은 이 화면에서만 확인해요."
              : state.saving
                ? "반응을 보관하는 중…"
                : state.persisted
                  ? "반응과 옷 사진은 이 기기에 보관해요."
                  : "마지막 반응은 이 화면에만 남아 있어요."}
          </p>
        </>
      )}
      {leave && (
        <dialog
          ref={leaveDialog}
          className="of-leave"
          onCancel={(e) => {
            e.preventDefault();
            finishLeave(false);
          }}
        >
          <h2>보관하지 못한 반응이 있어요</h2>
          <p>
            지금 이동하면 마지막 선택이 사라질 수 있어요. 저장된 반응은 남아요.
          </p>
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
            저장된 반응만 남기고 이동
          </button>
        </dialog>
      )}
    </section>
  );
}
export function mount(host: OutfitHost) {
  const root = createRoot(host.element);
  root.render(<OutfitScreen host={host} />);
  return () => root.unmount();
}
