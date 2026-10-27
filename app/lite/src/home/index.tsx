import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createRoot } from "react-dom/client";
import { ProductPhoto } from "../photos/ProductPhoto";
import { WeatherCard } from "../weather/WeatherCard";
import type { HomeHost, Proof, ProofProduct } from "./types";
import "./home.css";
import { Wordmark } from "../brand/Wordmark";
function ProofRow({ host, p }: { host: HomeHost; p: ProofProduct }) {
  return (
    <button
      type="button"
      tabIndex={0}
      className="prow"
      data-pid={p.id}
      onClick={(e) => {
        e.stopPropagation();
        host.product(p.id);
      }}
    >
      <ProductPhoto host={host} p={p} />
      <span className="grow">
        <span className="n">
          {p.brand} {p.name}
        </span>
        <span className={`d ${p.delta?.tone === "stop" ? "stop" : ""}`}>
          {p.delta?.text || "옷장을 걸면 겹치는지 알려 드려요"}
        </span>
      </span>
      <i className="ph ph-caret-right arr" aria-hidden="true" />
    </button>
  );
}
function ProofCard({ host, model }: { host: HomeHost; model: Proof }) {
  if (model.kind === "empty") return null;
  return (
    <section
      className="proof"
      aria-label={model.kind === "hung" ? "걸어 본 옷" : "내 옷 기준"}
    >
      <div className="label">
        <i className="ph-fill ph-coat-hanger" aria-hidden="true" />
        {model.kind === "hung"
          ? `걸어 본 옷 ${model.count} · ${model.basis}`
          : `내 옷 ${model.count}벌 기준${model.trialCount ? " · 체험용 " + model.trialCount + "벌" : ""}`}
      </div>
      {model.kind === "wardrobe" && (
        <>
          <button
            className="row hm-looks"
            type="button"
            tabIndex={0}
            onClick={host.looks}
          >
            <span className="grow">
              <span className="h3">내 옷으로 코디 보기</span>
              <span className="t6">
                {model.outfits
                  ? `입을 수 있는 조합 ${model.outfits}가지`
                  : "상의·하의·신발이 모이면 조합이 생겨요"}
              </span>
            </span>
            <i className="ph ph-caret-right arr" aria-hidden="true" />
          </button>
          <p className="t6 hm-example">‘{model.example}’를 걸어 보면</p>
        </>
      )}
      {model.products.map((p) => (
        <ProofRow key={p.id} host={host} p={p} />
      ))}
      <div className="hm-proof-actions">
        {model.kind === "hung" ? (
          <>
            {model.count >= 2 && (
              <button
                className="quiet"
                type="button"
                tabIndex={0}
                onClick={host.compare}
              >
                나란히 비교
              </button>
            )}
            <button
              className="quiet"
              type="button"
              tabIndex={0}
              onClick={host.closet}
            >
              옷걸이에서 보기
            </button>
          </>
        ) : (
          <>
            <button
              className="quiet"
              type="button"
              tabIndex={0}
              onClick={() => host.search(model.example)}
            >
              전체 결과 보기
            </button>
            <button
              className="quiet"
              type="button"
              tabIndex={0}
              onClick={host.add}
            >
              옷 넣기
            </button>
            {!!model.trialCount && (
              <button
                className="quiet"
                type="button"
                tabIndex={0}
                onClick={host.clearTrial}
              >
                체험용 옷 내리기
              </button>
            )}
          </>
        )}
      </div>
    </section>
  );
}
function Home({ host }: { host: HomeHost }) {
  const version = useSyncExternalStore(
      host.core.subscribe,
      host.core.version,
      host.core.version,
    ),
    [q, setQ] = useState(host.query || ""),
    [refresh, setRefresh] = useState(0),
    input = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    const update = () => setRefresh((n) => n + 1);
    host.element.addEventListener("eoul-home-refresh", update);
    return () => host.element.removeEventListener("eoul-home-refresh", update);
  }, [host]);
  const proof = useMemo(() => host.proof(), [host, version, refresh]),
    // examples() follows the core's current gender (e.g. a trial closet), so
    // recompute with the subscribed version like the vanilla redraw did.
    examples = useMemo(() => host.core.examples().slice(0, 4), [host, version]);
  // WO-11 새 디자인(v2): 찾기 칸을 맨 위에, 날씨 코디는 그 아래에 둔다. 메뉴로
  // 바꾸면 K.refresh()가 이 화면을 다시 그린다.
  const v2 = document.documentElement.dataset.look === "v2",
    weather = <WeatherCard host={host.weather} core={host.core} where="home" />;
  return (
    <section className="hm" data-react-home aria-label="옷 찾기 홈">
      <header className="top">
        <span className="mark">
          <Wordmark />
        </span>
        <button
          className="icon quiet-i"
          type="button"
          tabIndex={0}
          aria-label="가격·사진·판단 기준 보기"
          onClick={host.info}
        >
          <i className="ph ph-info" aria-hidden="true" />
        </button>
        <span className="sp" />
        <button
          className="icon"
          type="button"
          tabIndex={0}
          aria-label="더보기"
          onClick={host.menu}
        >
          <i className="ph ph-dots-three" aria-hidden="true" />
        </button>
      </header>
      {v2 ? null : weather}
      <h1 className={v2 ? "h1 hero" : "h1 hero after-wx"}>
        뭐 사려고요?
        <br />
        <span className="acc">걸어 보고</span> 사요.
      </h1>
      <form
        className="ask"
        id="sf"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim()) host.search(q.trim());
          else input.current?.focus();
        }}
      >
        <input
          id="q"
          name="q"
          ref={input}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            host.remember(e.target.value);
          }}
          enterKeyHint="search"
          autoComplete="off"
          placeholder="대충 말해도 돼요"
          aria-label="찾는 옷"
        />
        <button type="submit" tabIndex={0} aria-label="찾기">
          <i className="ph ph-arrow-right" aria-hidden="true" />
        </button>
      </form>
      <div className="chips">
        {examples.map((example) => (
          <button
            key={example}
            className="chip ex"
            type="button"
            tabIndex={0}
            onClick={() => host.search(example)}
          >
            {example}
          </button>
        ))}
      </div>
      {v2 ? weather : null}
      <ProofCard host={host} model={proof} />
    </section>
  );
}
export function mount(host: HomeHost) {
  const root = createRoot(host.element);
  root.render(<Home host={host} />);
  return () => root.unmount();
}
