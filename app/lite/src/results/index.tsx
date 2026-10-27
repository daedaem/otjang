import {
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createRoot } from "react-dom/client";
import { RetailPanels } from "../retail/RetailPanels";
import { Grid } from "./Grid";
import type { Chip, GridEntry, ResultsHost, ResultsModel } from "./types";
// Search results (WO-03b): the same screen as the vanilla V.results/A.results,
// rendered from the shared resultsModel/gridModel. AI ranking results are
// stored in the shared screen state so the detail screen and a return visit
// reuse them exactly as before.
const WIDE = "(min-width: 900px)";
function useWide() {
  return useSyncExternalStore(
    (fn) => {
      const mq = matchMedia(WIDE);
      mq.addEventListener("change", fn);
      return () => mq.removeEventListener("change", fn);
    },
    () => matchMedia(WIDE).matches,
    () => false,
  );
}
function ScrollChips({
  label,
  children,
}: {
  label?: string;
  children: ReactNode;
}) {
  const row = useRef<HTMLDivElement>(null),
    [fade, setFade] = useState(false);
  const update = useCallback(() => {
    const el = row.current;
    if (el)
      setFade(
        el.scrollWidth - el.clientWidth > 2 &&
          el.scrollLeft + el.clientWidth < el.scrollWidth - 2,
      );
  }, []);
  useEffect(update);
  return (
    <div
      ref={row}
      className={`chips scroll${fade ? " fade" : ""}`}
      aria-label={label}
      onScroll={update}
    >
      {children}
    </div>
  );
}
function Chips({ host, chips }: { host: ResultsHost; chips: Chip[] }) {
  return (
    <>
      {chips.map((c) =>
        c.removable ? (
          <button
            key={c.key}
            type="button"
            className="chip"
            aria-label={`${c.label} 조건 빼기`}
            onClick={() => host.removeCondition(c.key)}
          >
            {c.label}
            <i className="ph ph-x" />
          </button>
        ) : (
          <span key={c.key} className="chip on">
            {c.label}
          </span>
        ),
      )}
    </>
  );
}
function Top({ host, q }: { host: ResultsHost; q: string }) {
  return (
    <div className="top" id="top">
      <button
        type="button"
        className="icon"
        aria-label="뒤로"
        onClick={host.back}
      >
        <i className="ph ph-caret-left" />
      </button>
      <button
        type="button"
        className="qbox"
        aria-label={`다시 찾기: ${q}`}
        onClick={() => host.edit(q)}
      >
        <i className="ph ph-magnifying-glass" />
        <span>{q}</span>
      </button>
      <button
        type="button"
        className="icon quiet-i end"
        aria-label="가격·사진·판단 기준 보기"
        onClick={host.info}
      >
        <i className="ph ph-info" />
      </button>
    </div>
  );
}
function Empty({
  host,
  m,
}: {
  host: ResultsHost;
  m: Extract<ResultsModel, { kind: "empty" }>;
}) {
  return (
    <>
      {m.chips.length ? (
        <ScrollChips>
          <Chips host={host} chips={m.chips} />
        </ScrollChips>
      ) : null}
      <div className="empty">
        <h2 className="h2">{m.title}</h2>
        <p className="sub t5" style={{ marginTop: 6 }}>
          {m.sub}
        </p>
        {m.relax.length ? (
          <div style={{ marginTop: 12 }}>
            {m.relax.map((x) => (
              <button
                key={x.title}
                type="button"
                className="row"
                onClick={() => host.relax(x.drop)}
              >
                <span className="grow t5">{x.title}</span>
                <i className="ph ph-caret-right arr" />
              </button>
            ))}
          </div>
        ) : null}
        {m.alts.length ? (
          <>
            <p className="t6" style={{ marginTop: 20 }}>
              대신 이렇게 볼 수도 있어요
            </p>
            <div className="chips">
              {m.alts.map((a) => (
                <button
                  key={a.label}
                  type="button"
                  className="chip ex"
                  onClick={() => host.query(a.q)}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </>
        ) : null}
        {m.examples ? (
          <div className="chips" style={{ marginTop: 18 }}>
            {m.examples.map((x) => (
              <button
                key={x}
                type="button"
                className="chip ex"
                onClick={() => host.query(x)}
              >
                {x}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </>
  );
}
type Ai = { state: "wait" } | { state: "off"; text: string };
function Results({ host }: { host: ResultsHost }) {
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
    wide = useWide(),
    root = useRef<HTMLElement>(null),
    [ai, setAi] = useState<Ai>({ state: "wait" }),
    [pop, setPop] = useState<string | null>(null),
    [reveal, setReveal] = useState<string | null>(null),
    flip = useRef<Map<string, DOMRect> | null>(null);
  // The model reads the core (closet, hung products) and the screen state.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const m = useMemo(() => host.model(), [host, coreVersion, version]);
  const main = useMemo<GridEntry[]>(
      () => (m.kind === "list" ? host.grid(m.main) : []),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [host, m, wide],
    ),
    off = useMemo<GridEntry[]>(
      () => (m.kind === "list" && m.offTitle ? host.grid(m.off) : []),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [host, m, wide],
    );
  // Same scroll position as before opening a product (the router restores it
  // in the next frame, which can come before this screen has rendered).
  useLayoutEffect(() => {
    if (host.restoreY !== null) window.scrollTo(0, host.restoreY);
  }, [host]);
  const needRank = m.kind === "list" && !m.ranked;
  useEffect(() => {
    if (!needRank) return;
    let live = true;
    host.rank().then((res) => {
      if (!live) return;
      if (res.ok) {
        const cards = root.current?.querySelectorAll<HTMLElement>(
          "#grid [data-card]",
        );
        flip.current = new Map(
          [...(cards || [])].map((c) => [
            c.dataset.card as string,
            c.getBoundingClientRect(),
          ]),
        );
        host.applyRank(res);
      } else
        setAi({
          state: "off",
          text: `${host.whyText(res.why)} · ${m.kind === "list" ? m.listNote : ""}`,
        });
    });
    return () => {
      live = false;
    };
    // Rank once per screen, like the vanilla A.results.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [host, needRank]);
  const order = main.map((e) => (e.type === "card" ? e.id : "")).join(",");
  useLayoutEffect(() => {
    const first = flip.current;
    flip.current = null;
    if (!first || host.reduce()) return;
    root.current
      ?.querySelectorAll<HTMLElement>("#grid [data-card]")
      .forEach((c) => {
        const a = first.get(c.dataset.card as string),
          b = c.getBoundingClientRect();
        if (a)
          c.animate(
            [
              { transform: `translate(${a.left - b.left}px, ${a.top - b.top}px)` },
              { transform: "none" },
            ],
            { duration: 420, easing: host.spring },
          );
      });
  }, [host, order]);
  // Bring a new note or question row into view, as the vanilla redraw did.
  const notes = [...main, ...off]
    .filter((e) => e.type === "note")
    .map((e) => e.id)
    .join(",");
  useEffect(() => {
    if (!notes) return;
    root.current
      ?.querySelector(".qrow.note")
      ?.scrollIntoView({
        behavior: host.reduce() ? "auto" : "smooth",
        block: "center",
      });
  }, [host, notes]);
  useEffect(() => {
    if (!reveal) return;
    setReveal(null);
    root.current
      ?.querySelector(`.qrow:not(.note)[data-for="${CSS.escape(reveal)}"]`)
      ?.scrollIntoView({
        behavior: host.reduce() ? "auto" : "smooth",
        block: "nearest",
      });
  }, [host, reveal]);
  const hang = useCallback(
    (id: string) => {
      const res = host.hang(id);
      setPop(res.added && !host.reduce() ? id : null);
      if (res.added) setReveal(id);
    },
    [host],
  );
  return (
    <section className="rs" data-react-results ref={root}>
      <Top host={host} q={m.q} />
      {m.kind === "partial" ? (
        <>
          <RetailPanels host={host.retail} query={m.q} facts />
          <details className="ai-info">
            <summary>기존 상품 목록에서 찾지 못한 이유</summary>
            <p className="t6">{m.notice}</p>
          </details>
        </>
      ) : m.kind === "empty" ? (
        <>
          <Empty host={host} m={m} />
          <RetailPanels host={host.retail} query={m.q} facts />
        </>
      ) : (
        <>
          <ScrollChips label="조건">
            <span className="cnt num">{`${m.count}개 · ${m.basis}`}</span>
            <Chips host={host} chips={m.chips} />
          </ScrollChips>
          <div
            className={`ai${m.ranked ? "" : ` ${ai.state}`}`}
            id="ai"
            role="status"
          >
            {m.ranked ? (
              <>
                <i className="ph-fill ph-sparkle" />
                <span>{m.summary}</span>
              </>
            ) : ai.state === "off" ? (
              <>
                <i className="ph ph-info" />
                <span>{ai.text}</span>
              </>
            ) : (
              <>
                <i className="ph ph-circle-notch" />
                <span>AI가 후보 순서를 정하는 중이에요</span>
              </>
            )}
          </div>
          <Grid host={host} id="grid" entries={main} pop={pop} onHang={hang} />
          {m.offTitle ? (
            <section className="offh">
              <h2 className="h3">{m.offTitle}</h2>
              <Grid
                host={host}
                id="offgrid"
                entries={off}
                pop={pop}
                onHang={hang}
              />
            </section>
          ) : null}
          <RetailPanels host={host.retail} query={m.q} facts />
        </>
      )}
    </section>
  );
}
export function mount(host: ResultsHost) {
  const root = createRoot(host.element);
  root.render(<Results host={host} />);
  return () => root.unmount();
}
