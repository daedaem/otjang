import { useCallback, useEffect, useRef, useState } from "react";
import type { DomesticData, RetailHost } from "./types";
type State =
  | { status: "loading" }
  | { status: "short" }
  | { status: "done"; data: DomesticData }
  | { status: "error"; message: string };
// Adpick domestic offers for a submitted query. Starts once per query; a late
// answer for an older query or an unmounted panel is ignored.
export function DomesticPanel({
  host,
  query,
}: {
  host: RetailHost;
  query: string;
}) {
  const text = query.trim();
  const [state, setState] = useState<State>({ status: "loading" });
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);
  const run = useCallback(() => {
    const adpick = host.adpick;
    if (!adpick || text.length > 100) return;
    const id = ++seq.current;
    if (text.length < 2) {
      setState({ status: "short" });
      return;
    }
    setBusy(true);
    setState({ status: "loading" });
    adpick(text).then(
      (data) => {
        if (id === seq.current) setState({ status: "done", data });
      },
      (error: unknown) => {
        if (id === seq.current)
          setState({
            status: "error",
            message:
              (error as Error)?.message || "국내 상품을 찾지 못했어요.",
          });
      },
    ).finally(() => {
      if (id === seq.current) setBusy(false);
    });
  }, [host, text]);
  useEffect(() => {
    run();
    return () => {
      seq.current++;
    };
  }, [run]);
  if (!text) return null;
  // Same order as the vanilla screen: the length notice shows even without a
  // connector, and nothing is sent for an over-long query.
  if (text.length > 100)
    return <p className="t6">국내 상품 검색어는 100자 이내로 입력해 주세요.</p>;
  if (!host.adpick) return null;
  return (
    <section
      className="section"
      data-adpick-panel
      data-started="1"
      data-adpick-q={text}
    >
      <h2 className="h3">국내 쇼핑몰 상품</h2>
      <p className="t6">
        애드픽 제휴 광고 · 입력한 단어로 찾아요. 예산·핏·코디 조건은 적용하지
        않아요.
      </p>
      <div data-adpick-results aria-live="polite">
        {state.status === "loading" && (
          <p className="t6" role="status">
            국내 상품을 찾고 있어요…
          </p>
        )}
        {state.status === "short" && (
          <p className="t6" role="status">
            브랜드나 상품명을 2자 이상 입력해 주세요.
          </p>
        )}
        {state.status === "error" && (
          <>
            <p className="t6" role="status">
              {state.message}
            </p>
            <button
              type="button"
              className="btn line sm"
              disabled={busy}
              onClick={run}
            >
              다시 시도
            </button>
          </>
        )}
        {state.status === "done" && <Offers data={state.data} />}
      </div>
    </section>
  );
}
function Offers({ data }: { data: DomesticData }) {
  return (
    <>
      <p className="t6">
        {`애드픽 제공 순서 · ${data.fetchedAt?.slice(0, 10) || ""} 조회 · 가격은 참고값이며 결제 전 판매처에서 확인해 주세요.`}
      </p>
      {data.items.length ? (
        <>
          <p className="t6">
            제휴 광고: 링크를 통한 구매 시 운영자에게 수수료가 지급될 수
            있습니다.
          </p>
          {data.items.map((p, i) => (
            <a
              key={`${i}:${p.url}`}
              className="srow"
              href={p.url}
              target="_blank"
              rel="noopener noreferrer sponsored"
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
                <span className="m">{`${p.shop} · ${p.price}`}</span>
              </span>
              <i className="ph ph-arrow-up-right" />
            </a>
          ))}
        </>
      ) : (data.omitted || 0) > 0 ? (
        <p className="t5">
          검색어와 맞지 않거나 국내 판매처·구매 링크 등 필수 정보를 확인할 수
          없어 결과를 표시하지 못했어요. 브랜드·상품명만 짧게 입력해 보세요.
        </p>
      ) : (
        <p className="t5">
          이번 검색 결과에는 맞는 국내 제휴 상품이 없어요. 조건을 자동으로
          넓히지 않았어요.
        </p>
      )}
    </>
  );
}
