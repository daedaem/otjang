import {
  Fragment,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import { ProductPic } from "../detail/parts";
import type { Pic } from "../detail/types";
import { DomesticButtonPanel } from "../retail/DomesticPanel";
import type { RetailHost } from "../retail/types";
// Consult (WO-06): same markup as the vanilla V.consult/chatTurnHtml, rendered
// from consultModel. Asking goes through the existing askConsult (grounding,
// server request, on-topic check, candidate-only ids, price-check lines and
// AI response facts stay there); threads use the existing store and sheets.
type Card = Pic & {
  id: string;
  brand: string;
  name: string;
  priceText: string;
  priceShort: string;
  hung: boolean;
};
type Turn =
  | { kind: "me"; text: string }
  | { kind: "err"; text: string }
  | { kind: "refuse"; text: string }
  | {
      kind: "bot";
      text: string;
      check: string[];
      ai: [string, string][];
      cards: Card[];
      shop: string;
    };
type Model =
  | {
      kind: "list";
      examples: string[];
      threads: { id: string; title: string; when: string; count: number }[];
    }
  | { kind: "thread"; title: string; when: string; busy: boolean; turns: Turn[] };
type Host = {
  element: HTMLElement;
  bar: HTMLElement;
  core: { subscribe(fn: () => void): () => void; version(): number };
  ctl: { subscribe(fn: () => void): () => void; getVersion(): number };
  model(): Model;
  ask(text: string): void;
  busy(): boolean;
  newChat(): void;
  list(): void;
  open(id: string): void;
  remove(id: string): void;
  removeAll(): void;
  hang(id: string): { added: boolean; note: string };
  product(id: string): void;
  info(): void;
  reduce(): boolean;
  retail: RetailHost;
};
function Top({ host, children }: { host: Host; children?: ReactNode }) {
  return (
    <div className="top" id="top">
      <span className="mark">
        <i className="ph-fill ph-coat-hanger" aria-hidden="true" />
        이름 미정
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
      {children}
    </div>
  );
}
function RecCard({ host, c }: { host: Host; c: Card }) {
  const [note, setNote] = useState("");
  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(""), 3200);
    return () => clearTimeout(t);
  }, [note]);
  return (
    <div className="rc" data-card={c.id}>
      <button type="button" className="open-p" onClick={() => host.product(c.id)}>
        <ProductPic pic={c} />
        <div className="b">{c.brand}</div>
        <div className="n">{c.name}</div>
        <div className="p num">
          {c.priceText}
          <small>{c.priceShort}</small>
        </div>
      </button>
      <button
        type="button"
        className="hangt"
        aria-pressed={c.hung}
        aria-label={c.hung ? "걸어 보는 중 · 내리기" : "걸어 보기"}
        onClick={() => setNote(host.hang(c.id).note)}
      >
        <span>
          <i className={`${c.hung ? "ph-fill" : "ph"} ph-coat-hanger`} />
        </span>
      </button>
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
function TurnView({ host, t }: { host: Host; t: Turn }) {
  if (t.kind === "me") return <div className="msg me">{t.text}</div>;
  if (t.kind === "err")
    return (
      <div className="msg err" role="status">
        {t.text}
      </div>
    );
  if (t.kind === "refuse")
    return (
      <div className="msg bot refuse">
        <span className="who">
          <i className="ph ph-hand" />
          상담 범위 밖이에요
        </span>
        {t.text}
      </div>
    );
  return (
    <>
      <div className="msg bot">
        <span className="who">
          <i className="ph-fill ph-sparkle" />
          AI 코디 상담
        </span>
        {t.text}
        {t.check.length ? (
          <div className="pcheck" role="note">
            <i className="ph ph-seal-check" aria-hidden="true" />
            <span>
              {t.check.map((line, i) => (
                <Fragment key={i}>
                  {i ? <br /> : null}
                  {line}
                </Fragment>
              ))}
            </span>
          </div>
        ) : null}
        {t.ai.length ? (
          <details className="ai-info">
            <summary>AI 응답 정보</summary>
            <dl>
              {t.ai.map(([label, value]) => (
                <Fragment key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </Fragment>
              ))}
            </dl>
          </details>
        ) : null}
      </div>
      {t.cards.length ? (
        <div className="recs">
          {t.cards.map((c) => (
            <RecCard key={c.id} host={host} c={c} />
          ))}
        </div>
      ) : null}
      {t.shop ? <DomesticButtonPanel host={host.retail} query={t.shop} /> : null}
    </>
  );
}
function ChatBar({ host, busy }: { host: Host; busy: boolean }) {
  const [text, setText] = useState("");
  return (
    <div className="chatbar" data-react-chatbar>
      <form
        id="cf"
        onSubmit={(e) => {
          e.preventDefault();
          const value = text;
          // Like the vanilla bar (rebuilt after each question): a question
          // that was taken clears the input; an empty one keeps focus.
          if (value.trim() && !host.busy()) setText("");
          host.ask(value);
        }}
      >
        <input
          id="cq"
          maxLength={400}
          enterKeyHint="send"
          autoComplete="off"
          placeholder="예: 베이지 니트에 어울리는 바지는?"
          aria-label="코디 질문"
          disabled={busy}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button type="submit" aria-label="보내기" disabled={busy}>
          <i className="ph ph-paper-plane-right" />
        </button>
      </form>
    </div>
  );
}
function Consult({ host }: { host: Host }) {
  const coreVersion = useSyncExternalStore(
      host.core.subscribe,
      host.core.version,
      host.core.version,
    ),
    version = useSyncExternalStore(
      host.ctl.subscribe,
      host.ctl.getVersion,
      host.ctl.getVersion,
    );
  const m = useMemo(
    () => host.model(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [host, coreVersion, version],
  );
  const turns = m.kind === "thread" ? m.turns.length : 0;
  // The vanilla screen scrolls to the latest turn on every redraw (K.refresh).
  useEffect(() => {
    if (!turns) return;
    const raf = requestAnimationFrame(() =>
      window.scrollTo(0, document.documentElement.scrollHeight),
    );
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);
  const bar = createPortal(
    <ChatBar host={host} busy={m.kind === "thread" && m.busy} />,
    host.bar,
  );
  if (m.kind === "list")
    return (
      <section data-react-consult>
        <Top host={host}>
          {m.threads.length ? (
            <button type="button" className="tbtn" onClick={host.removeAll}>
              모두 지우기
            </button>
          ) : null}
        </Top>
        <h1 className="h1" style={{ marginTop: 12 }}>
          코디 상담
        </h1>
        <p className="t5 sub" style={{ marginTop: 4 }}>
          옷·코디 이야기만 답해요
        </p>
        <div className="chips">
          {m.examples.map((q) => (
            <button
              key={q}
              type="button"
              className="chip ex"
              onClick={() => host.ask(q)}
            >
              {q}
            </button>
          ))}
        </div>
        {m.threads.length ? (
          <section className="section">
            <div className="h">
              <h2 className="h3">
                {"이전 상담 "}
                <span className="t6 num">{m.threads.length}</span>
              </h2>
            </div>
            <div className="hist">
              {m.threads.map((t) => (
                <div key={t.id} className="hrow">
                  <button
                    type="button"
                    className="grow"
                    onClick={() => host.open(t.id)}
                  >
                    <span className="n">{t.title}</span>
                    <span className="t6">{`${t.when} · 주고받은 말 ${t.count}개`}</span>
                  </button>
                  <button
                    type="button"
                    className="icon"
                    aria-label="이 상담 지우기"
                    onClick={() => host.remove(t.id)}
                  >
                    <i className="ph ph-trash" />
                  </button>
                </div>
              ))}
            </div>
          </section>
        ) : null}
        {bar}
      </section>
    );
  return (
    <section data-react-consult>
      <Top host={host}>
        <button type="button" className="tbtn" onClick={host.list}>
          <i className="ph ph-list-bullets" />
          이전 상담
        </button>
        <button type="button" className="tbtn" onClick={host.newChat}>
          새 상담
        </button>
      </Top>
      <div className="ttl">
        <i className="ph ph-chats-circle" />
        <span className="grow">{m.title}</span>
        <span className="t6 nw">{m.when}</span>
      </div>
      <div className="thread" id="thread" aria-live="polite">
        {m.turns.map((t, i) => (
          <TurnView key={i} host={host} t={t} />
        ))}
        {m.busy ? (
          <div className="msg bot wait" role="status">
            <span className="who">
              <i className="ph ph-circle-notch" />
              생각하는 중이에요
            </span>
          </div>
        ) : null}
      </div>
      {bar}
    </section>
  );
}
export function mount(host: Host) {
  const root = createRoot(host.element);
  root.render(<Consult host={host} />);
  return () => root.unmount();
}
