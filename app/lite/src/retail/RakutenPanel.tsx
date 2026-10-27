import { useEffect, useRef, useState } from "react";
import type { RakutenData, RetailerPlan, RetailHost } from "./types";
// Rakuten keyword search. Nothing is searched until the person presses a
// button; an AI keyword is only a proposal they can edit before searching.
type Plan =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "off" }
  | { status: "error"; text: string }
  | { status: "ready"; keyword: string; notes: string[] };
type Search =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; query: string; data: RakutenData }
  | { status: "error"; message: string };
// Rakuten's required attribution snippet, kept verbatim (static, no user data).
const ATTRIBUTION = `
        <!-- Rakuten Web Services Attribution Snippet FROM HERE -->
        <a href="https://developers.rakuten.com/" target="_blank">Supported by Rakuten Developers</a>
        <!-- Rakuten Web Services Attribution Snippet TO HERE -->`;
export function RakutenPanel({
  host,
  query,
}: {
  host: RetailHost;
  query: string;
}) {
  const text = query.trim();
  const [plan, setPlan] = useState<Plan>({ status: "idle" });
  const [search, setSearch] = useState<Search>({ status: "idle" });
  const live = useRef(true),
    planSeq = useRef(0),
    searchSeq = useRef(0);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  if (!text) return null;
  const url = `https://search.rakuten.co.jp/search/mall/${encodeURIComponent(text)}/`;
  const makePlan = async () => {
    const ai = host.ai;
    if (!ai || plan.status === "loading") return;
    const id = ++planSeq.current;
    setPlan({ status: "loading" });
    try {
      const data = (await ai({ task: "retailer_search", query: text })) as
        | RetailerPlan
        | undefined;
      if (!live.current || id !== planSeq.current) return;
      if (!data?.on_topic) {
        setPlan({ status: "off" });
        return;
      }
      if (typeof data.keyword !== "string" || !Array.isArray(data.notes))
        throw Error("검색어를 만들지 못했어요. 다시 시도해 주세요.");
      setPlan({
        status: "ready",
        keyword: data.keyword,
        notes: data.notes.map(String),
      });
      setSearch({ status: "idle" });
    } catch (error) {
      if (!live.current || id !== planSeq.current) return;
      setPlan({
        status: "error",
        text:
          (error as { code?: string })?.code === "bad_request"
            ? "앱을 새로고침하고 다시 시도해 주세요."
            : "AI 검색어를 만들지 못했어요. 입력한 말로 검색할 수 있어요.",
      });
    }
  };
  const run = async (words: string) => {
    const rakuten = host.rakuten;
    if (!rakuten || search.status === "loading") return;
    const id = ++searchSeq.current;
    setSearch({ status: "loading" });
    try {
      const data = await rakuten(words);
      if (!live.current || id !== searchSeq.current) return;
      setSearch({ status: "done", query: words, data });
    } catch (error) {
      if (!live.current || id !== searchSeq.current) return;
      setSearch({
        status: "error",
        message:
          (error as Error)?.message || "라쿠텐 검색을 불러오지 못했어요.",
      });
    }
  };
  return (
    <section className="section" data-rakuten-panel>
      <h2 className="h3">일본 상품도 더 찾아볼까요?</h2>
      <p className="t6">
        라쿠텐 키워드 검색 · 앱의 예산·핏·코디 조건은 적용되지 않아요.
        일본어 판매처에서 구매하며 한국 배송은 판매처에서 확인해 주세요.
      </p>
      {host.rakuten ? (
        <>
          {host.ai ? (
            <>
              <button
                type="button"
                className="btn line sm"
                disabled={plan.status === "loading"}
                onClick={makePlan}
              >
                AI로 일본어 검색어 만들기
              </button>
              <div aria-live="polite">
                <PlanView
                  plan={plan}
                  busy={search.status === "loading"}
                  onKeyword={(keyword) =>
                    setPlan((p) =>
                      p.status === "ready" ? { ...p, keyword } : p,
                    )
                  }
                  onSearch={(keyword) => run(keyword.trim())}
                />
              </div>
            </>
          ) : null}
          <button
            type="button"
            className="btn line sm"
            disabled={search.status === "loading"}
            onClick={() => run(text)}
          >
            입력한 말로 라쿠텐 검색
          </button>
          <div aria-live="polite">
            <SearchView search={search} />
          </div>
        </>
      ) : null}
      <a className="row" href={url} target="_blank" rel="noopener noreferrer">
        <span className="grow t5">라쿠텐 사이트에서 직접 검색</span>
        <i className="ph ph-arrow-up-right arr" />
      </a>
    </section>
  );
}
function PlanView({
  plan,
  busy,
  onKeyword,
  onSearch,
}: {
  plan: Plan;
  busy: boolean;
  onKeyword(keyword: string): void;
  onSearch(keyword: string): void;
}) {
  if (plan.status === "loading")
    return (
      <p className="t6" role="status">
        한국어 요청으로 검색어를 만들고 있어요…
      </p>
    );
  if (plan.status === "off")
    return (
      <p className="t6" role="status">
        찾는 옷이나 브랜드를 말해 주세요.
      </p>
    );
  if (plan.status === "error")
    return (
      <p className="t6" role="status">
        {plan.text}
      </p>
    );
  if (plan.status !== "ready") return null;
  return (
    <>
      <div className="field">
        <label>
          AI가 제안한 일본어 검색어
          <input
            maxLength={80}
            value={plan.keyword}
            onChange={(e) => onKeyword(e.target.value)}
          />
        </label>
      </div>
      <details className="ai-info">
        <summary>미적용 조건: 예산·핏·코디</summary>
        <p className="t6">
          검색어 제안이며 상품별 추천이나 상품명 번역은 아니에요. 예산·핏·코디
          조건은 적용하지 않아요.
          {plan.notes.map((n) => ` ${n}`).join("")}
        </p>
      </details>
      <button
        type="button"
        className="btn line sm"
        disabled={busy}
        onClick={() => onSearch(plan.keyword)}
      >
        이 검색어로 찾아보기
      </button>
    </>
  );
}
function SearchView({ search }: { search: Search }) {
  if (search.status === "idle") return null;
  if (search.status === "loading")
    return (
      <p className="t6" role="status">
        라쿠텐 상품을 불러오는 중이에요…
      </p>
    );
  if (search.status === "error")
    return (
      <p className="t6" role="status">
        {`${search.message} 아래 링크로 직접 검색할 수 있어요.`}
      </p>
    );
  const { data, query } = search;
  return (
    <>
      <p className="t6">
        {`검색어: ${query} · 라쿠텐 제공 순서(AI 추천 순위 아님) · 일본 엔(JPY) · ${data.fetchedAt?.slice(0, 10) || ""} 조회`}
      </p>
      {data.items.length ? (
        data.items.map((p, i) => (
          <a
            key={`${i}:${p.url}`}
            className="srow"
            href={p.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {p.image ? (
              <img
                src={p.image}
                alt=""
                width={64}
                height={64}
                loading="lazy"
                referrerPolicy="no-referrer"
                style={{ objectFit: "contain", flex: "none" }}
              />
            ) : null}
            <span className="grow">
              <span className="n">{p.name}</span>
              <span className="m">
                {`${p.shop} · ¥${Number(p.price).toLocaleString("ja-JP")} JPY${p.taxFlag === 1 ? " (세전)" : ""}`}
              </span>
            </span>
            <i className="ph ph-arrow-up-right" />
          </a>
        ))
      ) : (
        <p className="t5">
          라쿠텐에서 일치하는 상품을 찾지 못했어요. 조건을 자동으로 넓히지
          않았어요.
        </p>
      )}
      <span
        style={{ display: "contents" }}
        dangerouslySetInnerHTML={{ __html: ATTRIBUTION }}
      />
    </>
  );
}
