import { type ReactNode } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
// The vanilla sheet() as React: scrim + bottom dialog appended to <body>,
// opening/closing animation (skipped for reduced motion), Escape and scrim
// close. Rendered synchronously so the single-sheet guard (.sheet) sees it.
export type SheetHost = {
  reduce(): boolean;
  spring: { css: string; ms: number };
};
export type Close = () => Promise<void>;
export function openSheet(
  host: SheetHost,
  render: (close: Close) => ReactNode,
) {
  const wrap = document.createElement("div");
  document.body.appendChild(wrap);
  const root = createRoot(wrap);
  let closing: Promise<void> | null = null;
  const key = (e: KeyboardEvent) => {
    if (e.key === "Escape") void close();
  };
  const close: Close = () =>
    (closing ||= (async () => {
      removeEventListener("keydown", key);
      const s = wrap.querySelector<HTMLElement>(".sheet");
      if (!host.reduce() && s)
        await s.animate(
          [{ transform: "none" }, { transform: "translateY(100%)" }],
          { duration: 200, easing: "cubic-bezier(.4,0,1,1)", fill: "forwards" },
        ).finished;
      root.unmount();
      wrap.remove();
    })());
  flushSync(() =>
    root.render(
      <>
        <div className="scrim" onClick={() => void close()} />
        <div className="sheet" role="dialog" aria-modal="true" data-react-sheet="">
          <div className="grab" />
          {render(close)}
        </div>
      </>,
    ),
  );
  const s = wrap.querySelector<HTMLElement>(".sheet");
  if (!host.reduce() && s)
    s.animate([{ transform: "translateY(100%)" }, { transform: "none" }], {
      duration: host.spring.ms,
      easing: host.spring.css,
    });
  addEventListener("keydown", key);
  return close;
}
