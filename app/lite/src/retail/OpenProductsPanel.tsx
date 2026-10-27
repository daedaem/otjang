import { useEffect, useState } from "react";
import type { AiInfo, OpenData, OpenFact, OpenRank, RetailHost } from "./types";
// Public product facts (Open Products Facts) for the results screen. Facts
// only: no price, stock or seller. An optional AI comparison may reorder them.
const FAILURES: Record<string, string> = {
  credit_unavailable: "API 크레딧을 확인해 주세요.",
  model_unavailable: "설정된 AI 모델에 연결하지 못했어요.",
  provider_access_denied:
    "AI 제공자가 연결을 거절했어요. 잠시 뒤 다시 시도해 주세요.",
  effort_unsupported: "모델의 추론 옵션을 확인하고 있어요.",
  output_config_invalid: "모델 응답 옵션을 확인하고 있어요.",
  provider_request_rejected: "AI 서버가 요청 형식을 거절했어요.",
  provider_timeout: "AI 서버 응답 시간이 길어졌어요.",
  provider_unavailable: "AI 제공자 연결이 원활하지 않아요.",
  screen_error: "후보 비교 화면을 확인하고 있어요.",
};
type View = {
  items: OpenFact[];
  reasons: Map<string, string>;
  summary: string;
  ai: AiInfo | null;
  fetchedAt: string;
};
type State =
  | { status: "loading" }
  | { status: "offline" }
  | { status: "ready"; view: View };
export function OpenProductsPanel({
  host,
  query,
}: {
  host: RetailHost;
  query: string;
}) {
  const [state, setState] = useState<State>({ status: "loading" });
  useEffect(() => {
    const search = host.openProducts;
    if (!search) return;
    let live = true;
    const show = (view: View) => {
      if (live) setState({ status: "ready", view });
    };
    setState({ status: "loading" });
    search(query).then(
      async (data) => {
        const base = {
          items: data.items,
          reasons: new Map<string, string>(),
          ai: null,
          fetchedAt: data.fetchedAt,
        };
        if (!data.items.length) {
          show({ ...base, summary: "이 공개 DB에는 일치하는 후보가 없어요." });
          return;
        }
        const ai = host.ai;
        show({
          ...base,
          summary:
            data.items.length > 1 && ai
              ? "AI가 이름·브랜드·분류 기준으로 비교하고 있어요…"
              : "상품 정보 확인용 후보예요.",
        });
        if (data.items.length < 2 || !ai) return;
        try {
          const ranked = (await ai({
            task: "open_rank",
            query,
            items: data.items.map((p) => p.code),
          })) as OpenRank;
          const byId = new Map(data.items.map((p) => [p.code, p]));
          const items = ranked.ranking.map((r) => byId.get(r.id));
          // An unknown id is a screen error, as in the vanilla draw.
          if (items.some((p) => !p)) throw new TypeError("unknown fact id");
          show({
            ...base,
            items: items as OpenFact[],
            reasons: new Map(ranked.ranking.map((r) => [r.id, r.reason])),
            summary: `AI 후보 비교 · ${ranked.summary}`,
            ai: ranked.ai || null,
          });
        } catch (error) {
          const e = error as { code?: string; name?: string };
          const code =
            e?.code || (e?.name === "TypeError" ? "screen_error" : "error");
          show({
            ...base,
            summary: `AI 비교를 완료하지 못해 상품 코드 순서로 보여드려요. ${FAILURES[code] || host.whyText(code)} (${code})`,
          });
        }
      },
      () => {
        if (live) setState({ status: "offline" });
      },
    );
    return () => {
      live = false;
    };
  }, [host, query]);
  if (!host.openProducts) return null;
  return (
    <section className="section" data-open-recommendations aria-live="polite">
      {state.status === "loading" && (
        <p className="t6" role="status">
          공개 상품 DB에서 후보를 찾고 있어요…
        </p>
      )}
      {state.status === "offline" && (
        <p className="t6" role="status">
          공개 상품 DB에 연결하지 못했어요. 다시 검색해 주세요.
        </p>
      )}
      {state.status === "ready" && <Facts view={state.view} />}
    </section>
  );
}
function Facts({ view }: { view: View }) {
  return (
    <>
      <h2 className="h3">
        공개 상품 후보 <span className="t6">{`${view.items.length}개`}</span>
      </h2>
      <p className="t6">
        가격·재고·구매처 없는 상품 정보예요. 예산·핏 조건 충족 여부는 확인할 수
        없어요.
      </p>
      {view.summary ? (
        <p className="t5" role="status">
          {view.summary}
        </p>
      ) : null}
      {view.items.map((p) => (
        <a
          key={p.code}
          className="srow"
          href={p.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          <span className="grow">
            <span className="b">{p.brand}</span>
            <span className="n">{p.name}</span>
            {view.reasons.has(p.code) ? (
              <span className="m">{view.reasons.get(p.code)}</span>
            ) : null}
          </span>
          <i className="ph ph-arrow-up-right" />
        </a>
      ))}
      <p className="t6">
        <a
          href="https://world.openproductsfacts.org"
          target="_blank"
          rel="noopener noreferrer"
        >
          Open Products Facts 및 기여자
        </a>
        {" · "}
        <a
          href="https://opendatacommons.org/licenses/odbl/1-0/"
          target="_blank"
          rel="noopener noreferrer"
        >
          ODbL
        </a>
        {` · ${view.fetchedAt.slice(0, 10)} 기준 · `}
        <a href="/api/open-products/export" download>
          사용한 DB 내려받기
        </a>
      </p>
      {view.ai ? (
        <details className="ai-info">
          <summary>AI 응답 정보</summary>
          <p className="t6">
            {`${view.ai.model} · 입력 ${view.ai.inputTokens} / 출력 ${view.ai.outputTokens} 토큰`}
            <br />
            {view.ai.requestId}
          </p>
        </details>
      ) : null}
    </>
  );
}
