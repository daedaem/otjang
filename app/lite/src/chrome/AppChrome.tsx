import {
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal, flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import type { SheetHost } from "./sheet";
// WO-08b: the bottom tabs, the hanger strip, toasts and the persistent storage
// notice as React. Same markup, classes, inline styles and wording as the
// vanilla chrome in screen.html and kit.js. screen.html keeps the state (view,
// strip summary, storage model) and the commands; this only draws them.
export type Notice = {
  gen: number;
  lines: string[];
  raws: { name: string; label: string }[];
  fresh: boolean;
};
export type ChromeModel = {
  tabbed: boolean;
  current: string | null;
  strip: { text: string; pop: boolean; bump?: number } | null;
  notice: Notice | null;
};
export type ChromeHost = SheetHost & {
  ctl: { subscribe(fn: () => void): () => void };
  model(): ChromeModel;
  tab(id: string): void;
  closet(): void;
  backup(): void;
  download(name: string): void;
  fresh(): void;
};
const TABS: [string, string, string][] = [
  ["home", "ph-magnifying-glass", "찾기"],
  ["looks", "ph-t-shirt", "코디"],
  ["closet", "ph-coat-hanger", "옷장"],
  ["community", "ph-users", "커뮤니티"],
  ["consult", "ph-chats-circle", "상담"],
  ["records", "ph-notebook", "기록"],
];
function Tabs({ host, m }: { host: ChromeHost; m: ChromeModel }) {
  return (
    <nav className="tabs" id="tabs" aria-label="메뉴" hidden={!m.tabbed} data-react-chrome="">
      <div className="in">
        {TABS.map(([id, icon, label]) => {
          const on = m.current === id;
          return (
            <button
              key={id}
              data-tab={id}
              aria-current={on ? "page" : undefined}
              onClick={() => host.tab(id)}
            >
              <i className={`${on ? "ph-fill" : "ph"} ${icon}`} aria-hidden="true" />
              {label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
function Strip({ host, m }: { host: ChromeHost; m: ChromeModel }) {
  const s = m.strip;
  return (
    <button
      className={`strip${s?.pop ? " pop" : ""}${s?.bump ? " bump" : ""}`}
      id="strip"
      hidden={!s}
      aria-label="옷걸이 열기"
      data-react-chrome=""
      onClick={() => host.closet()}
    >
      {s ? (
        <span className="in">
          {/* key: a new hang remounts the icon so its pop plays again */}
          <i key={s.bump || 0} className="ph-fill ph-coat-hanger" aria-hidden="true" />
          <span className="tx">{s.text}</span>
          <span className="go">
            옷장
            <i className="ph ph-caret-right" />
          </span>
        </span>
      ) : null}
    </button>
  );
}
const NOTICE: CSSProperties = {
  position: "fixed",
  zIndex: 95,
  left: 12,
  right: 12,
  top: "calc(12px + env(safe-area-inset-top,0px))",
  padding: "14px 16px",
  borderRadius: 14,
  background: "#fff4e5",
  color: "#3d2600",
  boxShadow: "0 8px 24px rgba(0,0,0,.18)",
  font: "14px/1.5 system-ui,-apple-system,sans-serif",
};
const NOTICE_BUTTON: CSSProperties = {
  minHeight: 40,
  padding: "0 12px",
  border: 0,
  borderRadius: 10,
  background: "#3d2600",
  color: "#fff",
  font: "600 13px system-ui,sans-serif",
};
// Remounted (keyed by gen) on every storageNotice() call, like the vanilla
// notice that is removed and appended again, so the fresh-start arm resets.
function StorageNotice({ host, n }: { host: ChromeHost; n: Notice }) {
  const [arm, setArm] = useState(false);
  return createPortal(
    <div id="eo-storage-issue" role="alert" style={NOTICE} data-react-chrome="">
      {n.lines.map((l, i) => (
        <p key={i} style={{ margin: "0 0 8px" }}>
          {l}
        </p>
      ))}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <button type="button" style={NOTICE_BUTTON} onClick={() => host.backup()}>
          전체 백업 열기
        </button>
        {n.raws.map((r) => (
          <button
            key={r.name}
            type="button"
            style={NOTICE_BUTTON}
            onClick={() => host.download(r.name)}
          >
            {`원문 받기(${r.label})`}
          </button>
        ))}
        {n.fresh ? (
          <button
            type="button"
            style={NOTICE_BUTTON}
            data-arm={arm ? "1" : undefined}
            onClick={() => {
              if (!arm) return setArm(true);
              host.fresh();
            }}
          >
            {arm ? "한 번 더 누르면 새로 시작해요" : "원문을 이 기기에 따로 보관하고 새로 시작"}
          </button>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
type Toast = { id: number; text: string; bottom: number };
function ToastView({ host, t, done }: { host: ChromeHost; t: Toast; done(): void }) {
  const ref = useRef<HTMLDivElement>(null);
  const finish = useRef(done);
  finish.current = done;
  // Keyed by the toast id: one entrance animation and one 2.6 s timer each.
  useLayoutEffect(() => {
    if (!host.reduce())
      ref.current?.animate(
        [
          { transform: "translate(-50%, 10px)", opacity: 0 },
          { transform: "translate(-50%, 0)", opacity: 1 },
        ],
        { duration: 320, easing: host.spring.css },
      );
    const timer = setTimeout(() => finish.current(), 2600);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return createPortal(
    <div
      ref={ref}
      className="k-toast"
      role="status"
      style={{ bottom: `calc(${t.bottom}px + env(safe-area-inset-bottom, 0px))` }}
      data-react-chrome=""
    >
      {t.text}
    </div>,
    document.body,
  );
}
// Mounts the chrome in place of the vanilla #strip and #tabs (same order in
// <body>, so focus order stays) and returns the toast used as K.toast.
export function mountChrome(host: ChromeHost) {
  const strip = document.getElementById("strip");
  const tabs = document.getElementById("tabs");
  const wrap = document.createElement("div");
  wrap.style.display = "contents";
  (strip || tabs)?.before(wrap);
  const root = createRoot(wrap);
  let show: (t: Toast) => void = () => {};
  let seq = 0;
  function App() {
    const [, force] = useReducer((x: number) => x + 1, 0);
    const [toast, setToast] = useState<Toast | null>(null);
    show = setToast;
    // Store changes render synchronously: vanilla code reads #strip right
    // after K.refresh() (toast offsets), as it did with the vanilla DOM.
    useLayoutEffect(
      () =>
        host.ctl.subscribe(() => {
          try {
            flushSync(force);
          } catch {
            force();
          }
        }),
      [],
    );
    const m = host.model();
    return (
      <>
        <Strip host={host} m={m} />
        <Tabs host={host} m={m} />
        {m.notice ? <StorageNotice key={m.notice.gen} host={host} n={m.notice} /> : null}
        {toast ? (
          <ToastView key={toast.id} host={host} t={toast} done={() => setToast((x) => (x === toast ? null : x))} />
        ) : null}
      </>
    );
  }
  flushSync(() => root.render(<App />));
  strip?.remove();
  tabs?.remove();
  return {
    toast(text: string, { bottom = 96 }: { bottom?: number } = {}) {
      document.querySelectorAll(".k-toast:not([data-react-chrome])").forEach((e) => e.remove());
      const t = { id: ++seq, text: String(text), bottom };
      try {
        flushSync(() => show(t));
      } catch {
        show(t);
      }
    },
  };
}
