import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { BackupSheet, type BackupHost } from "./BackupSheet";
// WO-07 island: opens the backup sheet as a bottom sheet with the vanilla
// sheet() markup (scrim + dialog, z-index above the storage notice), opening
// animation, Escape/scrim to close, and no closing while a photo task runs.
type Open = BackupHost & {
  current: Parameters<typeof BackupSheet>[0]["current"];
};
export function openBackup(host: Open) {
  const wrap = document.createElement("div");
  document.body.appendChild(wrap);
  const root = createRoot(wrap),
    busy = { current: false };
  let closing = false;
  const key = (e: KeyboardEvent) => {
    if (e.key === "Escape") void close();
  };
  async function close() {
    if (busy.current || closing) return;
    closing = true;
    removeEventListener("keydown", key);
    const s = wrap.querySelector<HTMLElement>(".sheet");
    if (!host.reduce() && s)
      await s.animate(
        [{ transform: "none" }, { transform: "translateY(100%)" }],
        { duration: 200, easing: "cubic-bezier(.4,0,1,1)", fill: "forwards" },
      ).finished;
    root.unmount();
    wrap.remove();
  }
  const reopenHost: Open = {
    ...host,
    reopen: (note: string) => {
      void close().then(() => host.reopen(note));
    },
  };
  // Synchronous first render, like the vanilla sheet: callers and the
  // single-sheet guard (.bk) see it immediately.
  flushSync(() =>
    root.render(
      <>
        <div className="scrim" style={{ zIndex: 96 }} onClick={() => void close()} />
        <div
          className="sheet"
          role="dialog"
          aria-modal="true"
          style={{ zIndex: 97 }}
        >
          <div className="grab" />
          <BackupSheet host={reopenHost} current={host.current} busyRef={busy} />
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
