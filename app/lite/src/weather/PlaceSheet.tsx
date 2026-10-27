import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Place, WeatherHost } from "./types";
// The weather place sheet (installed app only). It keeps the vanilla sheet's
// wording and classes. Location is requested only when the user taps
// "지금 있는 곳을 내 지역으로" here; nothing is asked on open.
export function PlaceSheet({
  host,
  onClose,
}: {
  host: WeatherHost;
  onClose(): void;
}) {
  const places = host.ctl.places(),
    title = useId(),
    sheet = useRef<HTMLDivElement>(null),
    first = useRef<HTMLButtonElement>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    alive = useRef(true);
  useLayoutEffect(() => {
    first.current?.focus({ preventScroll: true });
    if (!host.reduce())
      sheet.current?.animate(
        [{ transform: "translateY(100%)" }, { transform: "none" }],
        { duration: 320, easing: "cubic-bezier(.2,.8,.2,1)" },
      );
  }, [host]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    addEventListener("keydown", key);
    return () => {
      alive.current = false;
      removeEventListener("keydown", key);
    };
  }, [onClose]);
  if (!places) return null;
  const cur = places.current;
  const apply = (place: Place) => {
    onClose();
    host.ctl.applyPlace(place);
  };
  const saveHere = async () => {
    if (busy) return;
    setBusy(true);
    setMessage("위치를 확인하는 중이에요…");
    const c = await places.here().catch(() => null);
    if (!alive.current) return;
    setBusy(false);
    if (!c) {
      setMessage(
        "위치를 받지 못했어요. 설정에서 위치를 허용하거나 목록에서 골라 주세요.",
      );
      return;
    }
    apply({ mode: "fixed", name: "저장한 위치", lat: c.lat, lon: c.lon });
  };
  return createPortal(
    <div data-react-place>
      <div className="scrim" onClick={onClose} />
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={title}
        ref={sheet}
      >
        <div className="grab" />
        <h2 className="h2" id={title} style={{ margin: "4px 0 4px" }}>
          날씨 지역
        </h2>
        <p className="t6" style={{ margin: "0 0 12px" }}>
          이 기기에만 저장해요. 날씨를 물을 때는 약 10km 단위로 줄인 위치만
          보내요.
        </p>
        <div className="menu">
          <button
            ref={first}
            type="button"
            className="row"
            aria-pressed={cur.mode === "here"}
            onClick={() => apply({ mode: "here" })}
          >
            <span className="grow t5">
              현재 위치
              <span className="t6" style={{ display: "block" }}>
                열 때마다 위치로 · 거절하면 서울
              </span>
            </span>
            {cur.mode === "here" && (
              <i className="ph-fill ph-check-circle arr" aria-hidden="true" />
            )}
          </button>
          <button
            type="button"
            className="row"
            aria-busy={busy}
            onClick={() => void saveHere()}
          >
            <span className="grow t5">지금 있는 곳을 내 지역으로</span>
            <i className="ph ph-map-pin arr" aria-hidden="true" />
          </button>
        </div>
        <div className="label" style={{ margin: "14px 0 8px" }}>
          내 지역 고르기{cur.mode === "fixed" ? ` · 지금 ${cur.name}` : ""}
        </div>
        <div className="chips wrap">
          {places.presets.map((p) => {
            const on = cur.mode === "fixed" && cur.name === p.name;
            return (
              <button
                key={p.name}
                type="button"
                className={`chip ${on ? "on" : ""}`}
                aria-pressed={on}
                onClick={() =>
                  apply({ mode: "fixed", name: p.name, lat: p.lat, lon: p.lon })
                }
              >
                {p.name}
              </button>
            );
          })}
        </div>
        <p className="t6" role="status" style={{ margin: "10px 0 0" }}>
          {message}
        </p>
      </div>
    </div>,
    document.body,
  );
}
