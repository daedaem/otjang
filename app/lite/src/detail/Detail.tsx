import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { CorePhotoView, Tile } from "../tiles/Tile";
import { Top } from "./parts";
import type { DecisionModel, DetailHost, DetailModel } from "./types";
// Product detail (WO-04): same markup as the vanilla V.detail, rendered from
// detailModel. Buttons call the host, never the data-* attributes of the
// vanilla global click handler, so nothing runs twice.
function HeadText({ m }: { m: DetailModel }) {
  const h = m.head;
  if (h.kind === "ask" || h.kind === "title") return <>{h.text}</>;
  if (h.kind === "none")
    return (
      <>
        {`겹치는 ${h.kindName}${h.josa} `}
        <b>없어요</b>
      </>
    );
  if (h.kind === "same")
    return (
      <>
        {"비슷한 옷이 "}
        <b>{`${h.n}벌`}</b>
        {" 걸려 있어요"}
      </>
    );
  return (
    <>
      {"걸면 새 코디가 "}
      <b>{`${h.n}개`}</b>
      {" 생겨요"}
    </>
  );
}
function Photo({
  host,
  m,
}: {
  host: DetailHost;
  m: DetailModel;
}) {
  const [pop, setPop] = useState(false),
    [note, setNote] = useState("");
  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(""), 3200);
    return () => clearTimeout(t);
  }, [note]);
  const hang = () => {
    const res = host.hang();
    if (res.note) {
      setNote(res.note);
      return;
    }
    setPop(res.added && !host.reduce());
    if (res.added && res.asked)
      requestAnimationFrame(() =>
        document.getElementById("hangbox")?.scrollIntoView({
          behavior: host.reduce() ? "auto" : "smooth",
          block: "center",
        }),
      );
  };
  return (
    <div className="pdp-photo">
      <span className="ph-box" style={{ display: "block" }}>
        {m.photo ? (
          <button
            type="button"
            className="zoomb"
            aria-label="사진 크게 보기"
            onClick={host.zoom}
          >
            <img
              className={m.photo.flat ? "flat" : "cover"}
              src={m.photo.src}
              alt={m.photo.alt}
              decoding="async"
            />
          </button>
        ) : (
          <button
            type="button"
            className="zoomb"
            aria-label="사진 크게 보기"
            onClick={host.zoom}
          >
            {m.core ? <CorePhotoView p={m.core} /> : null}
          </button>
        )}
        <button
          type="button"
          className={`hangt big${pop ? " pop" : ""}`}
          aria-pressed={m.hung}
          aria-label={m.hung ? "걸어 보는 중 · 내리기" : "걸어 보기"}
          onClick={hang}
        >
          <span>
            <i className={`${m.hung ? "ph-fill" : "ph"} ph-coat-hanger`} />
          </span>
        </button>
      </span>
      {note ? (
        <div
          className="card-note t6"
          role="alert"
          style={{ marginTop: 6, color: "var(--acc-text)", fontWeight: 700 }}
        >
          {note}
        </div>
      ) : null}
    </div>
  );
}
function HangBox({ host, m }: { host: DetailHost; m: DetailModel }) {
  return (
    <section className="box" id="hangbox" aria-label="내 옷에 걸어 보면">
      <div className="label">
        <i className="ph ph-coat-hanger" />
        {`내 옷에 걸어 보면 · ${m.basisLabel}`}
      </div>
      <h2 className="h2">
        <HeadText m={m} />
      </h2>
      {m.sub ? <p className="t5 sub">{m.sub}</p> : null}
      {m.cautions.map((c, i) => (
        <p key={i} className="t6 warn">
          <i className="ph ph-warning-circle" aria-hidden="true" />
          {c}
        </p>
      ))}
      {m.ask ? (
        <div className="ownq">
          <button type="button" onClick={() => host.own(true)}>
            있어요
          </button>
          <button type="button" className="no" onClick={() => host.own(false)}>
            없어요
          </button>
        </div>
      ) : null}
      {m.owned.length ? (
        <div className="owned">
          {m.owned.map((o, i) => (
            <div key={i} className="o">
              <Tile m={o.tile} />
              <div className="t6">{o.label}</div>
            </div>
          ))}
        </div>
      ) : null}
      {m.looks.length ? (
        <div className="looks2">
          {m.looks.map((l, i) => (
            <div key={i} className="lk">
              <div className="head">
                <b>{l.title}</b>
                {l.isNew ? (
                  <span className="t6 acc" style={{ fontWeight: 700 }}>
                    새 코디
                  </span>
                ) : null}
              </div>
              <div className="ps">
                {l.pieces.map((x, j) => (
                  <div key={j} className={`p1${x.me ? " me" : ""}`}>
                    <Tile m={x.tile} />
                    <div className="t6">{x.label}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {m.addLike ? (
        <div style={{ marginTop: 10 }}>
          <button type="button" className="quiet" onClick={host.addLike}>
            <i className="ph ph-plus" />
            {`가진 ${m.addLike.kindName} 걸기`}
          </button>
        </div>
      ) : null}
    </section>
  );
}
function Used({ m }: { m: DetailModel }) {
  return (
    <details className="used">
      <summary>
        <span>중고로 찾기</span>
        <span className="pill">{`외부 검색 · ${m.usedCount}곳`}</span>
        <span className="sp" />
        <i className="ph ph-caret-right" />
      </summary>
      {m.used.map((g, i) => (
        <Fragment key={i}>
          <p className="t6 ug">{g.region}</p>
          <div className="links">
            {g.links.map((l, j) => (
              <a key={j} href={l.url} target="_blank" rel="noopener">
                <span>
                  {l.label}
                  {l.note ? (
                    <span className="t6 un">{` · ${l.note}`}</span>
                  ) : null}
                </span>
                <i className="ph ph-arrow-up-right" />
              </a>
            ))}
          </div>
        </Fragment>
      ))}
    </details>
  );
}
function Bar({ host, d }: { host: DetailHost; d: DecisionModel }) {
  return (
    <div className="buybar" data-react-decision>
      <div className="in">
        <div className="meta">
          {d.decided ? (
            <>
              <span className="fb" role="status">
                <i className="ph-fill ph-check-circle" />
                <span className="nt" style={{ color: "inherit" }}>
                  {d.status}
                </span>
              </span>
              <span className="qs">
                {d.canChange ? (
                  <button type="button" className="quiet" onClick={host.change}>
                    바꾸기
                  </button>
                ) : (
                  <>
                    {d.canReturn ? (
                      <button
                        type="button"
                        className="quiet"
                        onClick={host.returned}
                      >
                        반품했어요
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="quiet"
                      onClick={host.records}
                    >
                      기록
                    </button>
                  </>
                )}
              </span>
            </>
          ) : (
            <>
              <span className="pr">
                <b className="num">{d.priceText}</b>
                <span className="nt">{`${d.priceShort} · ${d.store}`}</span>
              </span>
              <span className="qs">
                <button
                  type="button"
                  className="quiet"
                  onClick={() => host.decide("hold")}
                >
                  보류
                </button>
                <button
                  type="button"
                  className="quiet"
                  onClick={() => host.decide("skip")}
                >
                  안 살래요
                </button>
              </span>
            </>
          )}
        </div>
        <a
          className="btn go wide"
          href={d.url}
          target="_blank"
          rel="noopener"
          onClick={host.seller}
        >
          판매처에서 사기
          <i className="ph ph-arrow-up-right" />
        </a>
      </div>
    </div>
  );
}
export function Detail({ host }: { host: DetailHost }) {
  const coreVersion = useSyncExternalStore(
      host.core.subscribe,
      host.core.version,
      host.core.version,
    ),
    version = useSyncExternalStore(
      host.ctl.subscribe,
      host.ctl.getVersion,
      host.ctl.getVersion,
    ),
    restored = useRef(false);
  const m = useMemo(
    () => host.model(),
    // The model reads the core and the shared screen state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [host, coreVersion, version],
  );
  const d = useMemo(
    () => host.decision(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [host, coreVersion, version],
  );
  useLayoutEffect(() => {
    if (restored.current) return;
    restored.current = true;
    if (host.restoreY !== null) window.scrollTo(0, host.restoreY);
  }, [host]);
  if (!m)
    return (
      <section data-react-detail>
        <Top back={host.back} info={host.info} />
        <p className="t5">상품을 찾지 못했어요.</p>
      </section>
    );
  return (
    <section data-react-detail>
      <Top back={host.back} info={host.info} />
      <div className="pdp">
        <Photo host={host} m={m} />
        <div>
          <div className="pdp-head">
            <div className="b">{m.brand}</div>
            <h1 className="h2" style={{ marginTop: 2 }}>
              {m.name}
            </h1>
            <div className="pricetag num">
              <b>{m.priceText}</b>
              <small>{m.priceNote}</small>
            </div>
            <p className="t6" style={{ marginTop: 6 }}>
              {m.facts}
            </p>
          </div>
          <button
            type="button"
            className="btn line wide"
            style={{ margin: "14px 0" }}
            onClick={host.measure}
          >
            <i className="ph ph-ruler" aria-hidden="true" />
            내 기준 옷과 실측 비교
          </button>{" "}
          {/* The vanilla template has whitespace between these inline buttons. */}
          <button
            type="button"
            className="quiet"
            style={{ marginBottom: 14 }}
            onClick={host.collection}
          >
            활용·소장 가치 비교 →
          </button>{" "}
          <button
            type="button"
            className="quiet"
            style={{ marginBottom: 14 }}
            onClick={host.mirror}
          >
            내 사진 거울 옆에 놓고 보기 →
          </button>
          {m.ai?.reason ? (
            <section className="box ai-why" aria-label="AI 이유">
              <div className="label">
                <i className="ph-fill ph-sparkle" />
                {`AI 순위 ${m.ai.rank}위${m.ai.fit ? ` · ${m.ai.fit}` : ""}`}
              </div>
              <p className="h3">{m.ai.reason}</p>
            </section>
          ) : null}
          <HangBox host={host} m={m} />
          <Used m={m} />
        </div>
      </div>
      {d ? createPortal(<Bar host={host} d={d} />, host.bar) : null}
    </section>
  );
}
