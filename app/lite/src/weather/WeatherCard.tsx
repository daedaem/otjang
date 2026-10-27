import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Card } from "../results/Grid";
import type { CardModel } from "../results/types";
import { Tile } from "../tiles/Tile";
import { PlaceSheet } from "./PlaceSheet";
import type { CoreSubscription, WeatherHost } from "./types";
// Shared React weather card for the home and outfits screens (WO-02). It keeps
// the vanilla card's classes and wording; state changes go through host.ctl so
// both screens and the vanilla fallback share one weather state.
// The missing-item product cards: the results grid card with the vanilla
// showCardNote() note for 3.2 s when a product cannot be hung.
function MissingCards({ host, products }: { host: WeatherHost; products: { id: string; card: CardModel }[] }) {
  const [note, setNote] = useState<{ id: string; text: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const hang = (id: string) => {
    const text = host.hang(id);
    if (!text) return;
    clearTimeout(timer.current);
    setNote({ id, text });
    timer.current = setTimeout(() => setNote(null), 3200);
  };
  return (
    <>
      {products.map((p) => (
        <Card
          key={p.id}
          host={host}
          c={p.card}
          pop={false}
          onHang={hang}
          note={note?.id === p.id ? note.text : undefined}
        />
      ))}
    </>
  );
}
function ExampleChips({
  host,
  examples,
}: {
  host: WeatherHost;
  examples: { id: string; label: string; on: boolean }[];
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
  useEffect(update, [update, examples.length]);
  return (
    <div
      ref={row}
      className={`chips scroll${fade ? " fade" : ""}`}
      role="group"
      aria-label="예시 날씨 고르기"
      onScroll={update}
    >
      {examples.map((e) => (
        <button
          key={e.id}
          type="button"
          className={`chip ${e.on ? "on" : "ex"}`}
          aria-pressed={e.on}
          onClick={() => host.ctl.setExample(e.id)}
        >
          {e.label}
        </button>
      ))}
    </div>
  );
}
export function WeatherCard({
  host,
  core,
  where,
}: {
  host: WeatherHost;
  core: CoreSubscription;
  where: "home" | "looks";
}) {
  const version = useSyncExternalStore(
      host.ctl.subscribe,
      host.ctl.getVersion,
      host.ctl.getVersion,
    ),
    coreVersion = useSyncExternalStore(
      core.subscribe,
      core.version,
      core.version,
    ),
    [placeOpen, setPlaceOpen] = useState(false),
    placeButton = useRef<HTMLButtonElement>(null),
    restoreFocus = useRef(false);
  useEffect(() => {
    host.ctl.load();
  }, [host]);
  const m = useMemo(
    () => host.ctl.model(where),
    // The model reads the core (closet, hung products) and the weather state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [host, where, version, coreVersion],
  );
  const closePlace = useCallback(() => {
    restoreFocus.current = true;
    setPlaceOpen(false);
  }, []);
  // Return focus to the place button once it exists again (a new place
  // reloads the weather, so the button re-renders after the loading state).
  useEffect(() => {
    if (restoreFocus.current && placeButton.current) {
      restoreFocus.current = false;
      placeButton.current.focus({ preventScroll: true });
    }
  });
  if (m.status === "loading")
    return (
      <section className="wx" aria-label="오늘 날씨 코디" data-react-weather>
        <div className="wx-wait" role="status">
          <i className="ph ph-circle-notch" aria-hidden="true" />
          오늘 날씨를 불러오는 중이에요
        </div>
      </section>
    );
  const head = (
    <>
      <div className="label">
        <i className="ph-fill ph-sun-horizon" aria-hidden="true" />
        날씨 코디 ·{" "}
        {m.kind === "real" ? (
          m.canPlace ? (
            <button
              ref={placeButton}
              type="button"
              className="wx-place"
              aria-label={`날씨 지역 바꾸기: ${m.place}`}
              aria-haspopup="dialog"
              onClick={() => setPlaceOpen(true)}
            >
              {m.place}
              <i className="ph ph-caret-down" aria-hidden="true" />
            </button>
          ) : (
            m.place
          )
        ) : (
          "예시 날씨"
        )}
        <span className="sp" />
        {m.hasTomorrow && (
          <span className="wx-days" role="group" aria-label="날짜">
            {(["today", "tomorrow"] as const).map((d) => (
              <button
                key={d}
                type="button"
                className="wx-day"
                aria-pressed={m.day === d}
                onClick={() => host.ctl.setDay(d)}
              >
                {d === "today" ? "오늘" : "내일"}
              </button>
            ))}
          </span>
        )}
      </div>
      <div className="wx-h">
        <span className="wx-t num">
          {/* one text node, like the vanilla template (same glyph run) */}
          {`${m.day === "today" ? "오늘" : "내일"} · 아침 ${m.temp.min}° → 낮 ${m.temp.max}°${m.temp.rain ? " · 비" : ""}`}
        </span>
      </div>
    </>
  );
  const exRow = m.examples && (
    <div className="wx-ex">
      <span className="t6 nw">
        {m.failed ? "날씨를 못 받아 예시로" : "예시 날씨 · 설치 앱에서는 실제 날씨"}
      </span>
      <ExampleChips host={host} examples={m.examples} />
    </div>
  );
  const place = placeOpen && <PlaceSheet host={host} onClose={closePlace} />;
  if (m.mode === "invite")
    return (
      <section className="wx" aria-label="오늘 날씨 코디" data-react-weather>
        {head}
        <div className="wx-invite">
          <h2 className="h3">옷장을 채우면 날씨에 맞춰 골라 드려요</h2>
          <div className="btns">
            <button type="button" className="btn go" onClick={host.add}>
              <i className="ph ph-magnifying-glass" aria-hidden="true" />
              브랜드로 찾아 넣기
            </button>
            <button type="button" className="btn soft" onClick={host.trial}>
              체험용 옷장
            </button>
          </div>
        </div>
        {exRow}
        {place}
      </section>
    );
  if (m.mode === "message")
    return (
      <section className="wx" aria-label="오늘 날씨 코디" data-react-weather>
        {head}
        <p className="t5 sub" style={{ margin: "8px 0 0" }}>
          {m.message}
        </p>
        {exRow}
        {place}
      </section>
    );
  const count = m.count || 0,
    missing = m.missing;
  return (
    <section className="wx" aria-label="오늘 날씨 코디" data-react-weather>
      {head}
      <div className="wx-band">
        <b>{m.band?.label}</b>
        {` · ${m.band?.advice ?? ""}`}
      </div>
      {!!m.notes && (
        <p className="wx-note">
          <i
            className={`ph ${m.temp.rain ? "ph-umbrella" : "ph-thermometer"}`}
            aria-hidden="true"
          />
          <span>{m.notes}</span>
        </p>
      )}
      {m.outfit && (
        <div className="wx-ps">
          {(m.pieces || []).map((x, i) => (
            <div className="p1" key={`${i}:${x.label}`}>
              <Tile m={x.tile} />
              <div className="t6">
                {x.label}
                {x.trial ? " · 체험용" : ""}
              </div>
            </div>
          ))}
        </div>
      )}
      <p className={m.good ? "wx-why good" : "wx-why"}>
        <i className="ph-fill ph-check-circle" aria-hidden="true" />
        <span>
          {m.why}
          {m.whyMore}
        </span>
      </p>
      <div className="wx-ac">
        {count > 1 && (
          <button type="button" className="quiet" onClick={host.ctl.next}>
            <i className="ph ph-arrows-clockwise" aria-hidden="true" />
            다른 조합 <span className="num">{(m.index || 0) + 1}/{count}</span>
          </button>
        )}
        {where === "home" && (
          <button type="button" className="quiet" onClick={host.looks}>
            코디 더 보기
            <i className="ph ph-caret-right" aria-hidden="true" />
          </button>
        )}
      </div>
      {missing && (
        <div className="wx-miss">
          <h3 className="h3">{missing.heading}</h3>
          {missing.products.length ? (
            <>
              <div className="wx-mg">
                <MissingCards host={host} products={missing.products} />
              </div>
              <button
                type="button"
                className="quiet"
                style={{ marginTop: 2 }}
                onClick={() => host.search(missing.query)}
              >
                {missing.query} 더 보기
                <i className="ph ph-caret-right" aria-hidden="true" />
              </button>
            </>
          ) : (
            <p className="t6" style={{ margin: "4px 0 0" }}>
              맞는 {missing.label} 상품을 찾지 못했어요.
            </p>
          )}
        </div>
      )}
      {exRow}
      {place}
    </section>
  );
}
