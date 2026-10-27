import {
  useLayoutEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";
import { createRoot } from "react-dom/client";
import { ProductPic } from "../detail/parts";
import type { Pic } from "../detail/types";
import { Wordmark } from "../brand/Wordmark";
// Purchase records (WO-05): same markup as the vanilla V.records, rendered
// from recordsModel. Steps and returns call the existing core command and
// return sheet; these are the person's own notes, not confirmed orders.
type Model = {
  total: number;
  decided: number;
  buys: number;
  holds: number;
  skips: number;
  sum: number;
  waiting: {
    id: string;
    name: string;
    stageLabel: string;
    next: { step: string; keep: boolean; label: string } | null;
    ret: string;
  }[];
  days: {
    label: string;
    items: {
      id: string;
      name: string;
      priceText: string;
      buy: boolean;
      decision: string;
      stage: string;
      collection: string;
    }[];
  }[];
};
type Host = {
  element: HTMLElement;
  core: { subscribe(fn: () => void): () => void; version(): number };
  ctl: { subscribe(fn: () => void): () => void; getVersion(): number };
  restoreY: number | null;
  model(): Model;
  pic(id: string): Pic;
  advance(id: string, step: string): void;
  returned(id: string): void;
  product(id: string): void;
  home(): void;
  info(): void;
};
const won = (n: number) => `${Number(n).toLocaleString("ko-KR")}원`;
function Records({ host }: { host: Host }) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [host, coreVersion, version],
  );
  useLayoutEffect(() => {
    if (restored.current) return;
    restored.current = true;
    if (host.restoreY !== null) window.scrollTo(0, host.restoreY);
  }, [host]);
  return (
    <section data-react-records>
      <div className="top" id="top">
        <span className="mark">
          <Wordmark />
        </span>
        <button
          type="button"
          className="icon quiet-i"
          aria-label="가격·사진·판단 기준 보기"
          onClick={host.info}
        >
          <i className="ph ph-info" />
        </button>
        <span className="sp" />
      </div>
      <h1 className="h1" style={{ marginTop: 12 }}>
        {m.decided ? (
          <>
            <span className="num">{m.decided}</span>벌을 정했어요
          </>
        ) : m.holds ? (
          <>
            {"보류 "}
            <span className="num">{m.holds}</span>
            {"벌 · 아직 정하지 않았어요"}
          </>
        ) : (
          "아직 정한 옷이 없어요"
        )}
      </h1>
      {m.total ? null : (
        <p className="t5 sub" style={{ marginTop: 4 }}>
          걸어 본 옷을 살지 정하면 여기에 남아요.
        </p>
      )}
      {m.total ? (
        <div className="sum">
          <div className="c">
            <div className="k">살게요</div>
            <div className="v num">{m.buys}</div>
            {m.sum ? (
              <div className="t6 num nw" style={{ fontSize: 12 }}>
                {`${won(m.sum)} 수집가`}
              </div>
            ) : null}
          </div>
          <div className="c">
            <div className="k">보류</div>
            <div className="v num">{m.holds}</div>
          </div>
          <div className="c">
            <div className="k">안 살래요</div>
            <div className="v num">{m.skips}</div>
          </div>
        </div>
      ) : null}
      {m.waiting.length ? (
        <section className="section">
          <div className="h">
            <h2 className="h3">사기로 한 옷</h2>
          </div>
          {m.waiting.map((x) => (
            <div key={x.id} className="wait-row">
              <ProductPic pic={host.pic(x.id)} />
              <span className="grow">
                <span className="n">{x.name}</span>
                <span className="t6">{x.stageLabel}</span>
              </span>
              <span className="acts">
                {x.next ? (
                  <button
                    type="button"
                    className={`btn ${x.next.keep ? "go" : "soft"}`}
                    onClick={() => host.advance(x.id, x.next!.step)}
                  >
                    {x.next.label}
                  </button>
                ) : null}
                {x.ret ? (
                  <button
                    type="button"
                    className="quiet"
                    onClick={() => host.returned(x.id)}
                  >
                    {x.ret}
                  </button>
                ) : null}
              </span>
            </div>
          ))}
        </section>
      ) : null}
      <div className="tl">
        {m.days.length ? (
          m.days.map((d) => (
            <DayGroup key={d.label} host={host} d={d} />
          ))
        ) : (
          <button
            type="button"
            className="btn soft wide"
            style={{ marginTop: 20 }}
            onClick={host.home}
          >
            옷 찾으러 가기
          </button>
        )}
      </div>
    </section>
  );
}
function DayGroup({ host, d }: { host: Host; d: Model["days"][number] }) {
  return (
    <>
      <div className="day">{d.label}</div>
      {d.items.map((r) => (
        <button
          key={r.id}
          type="button"
          className="rec"
          onClick={() => host.product(r.id)}
        >
          <ProductPic pic={host.pic(r.id)} />
          <span className="grow">
            <span className="n">{r.name}</span>
            <span className="t6">
              <span className={`pill ${r.buy ? "buy" : ""}`}>{r.decision}</span>
              {r.stage ? ` ${r.stage}` : ""}
            </span>
            {r.collection ? (
              <span className="t6" data-record-collection>
                {r.collection}
              </span>
            ) : null}
          </span>
          <span className="pr num">{r.priceText}</span>
        </button>
      ))}
    </>
  );
}
export function mount(host: Host) {
  const root = createRoot(host.element);
  root.render(<Records host={host} />);
  return () => root.unmount();
}
