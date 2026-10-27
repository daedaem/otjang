import { Fragment, useState } from "react";
import type { Close } from "./sheet";
// Shared sheet contents (WO-08a): same markup and wording as the vanilla
// disclose(), menu(), confirmSheet(), colour sheets, addFlow(), returnSheet()
// and decisionSheet(). A pick handler does its synchronous work first, then
// the sheet closes, then the returned continuation runs (vanilla order). A
// handler that returns false keeps the sheet open (e.g. a failed record).
export type After = (() => void) | false | void;
export type Color = { id: string; label: string; hex: string; same: boolean };
async function finish(close: Close, after: After) {
  if (after === false) return;
  await close();
  if (typeof after === "function") after();
}
export function Disclose({
  close,
  title,
  sections,
}: {
  close: Close;
  title: string;
  sections: { h: string; lines: string[] }[];
}) {
  return (
    <>
      <h2 className="h2">{title}</h2>
      {sections.map((x, i) => (
        <Fragment key={i}>
          <h3 className="t6" style={{ margin: "16px 0 4px", fontWeight: 700 }}>
            {x.h}
          </h3>
          {x.lines.map((l, j) => (
            <p
              key={j}
              className="t5"
              style={{ margin: "0 0 6px", color: "var(--ink2)" }}
            >
              {l}
            </p>
          ))}
        </Fragment>
      ))}
      <button
        type="button"
        className="btn soft wide"
        data-close=""
        style={{ marginTop: 18 }}
        onClick={() => void close()}
      >
        닫기
      </button>
    </>
  );
}
export function Menu({
  close,
  place,
  look = false,
  onInfo,
  onBackup,
  onPlace,
  onTheme,
  onLook,
  onReset,
}: {
  close: Close;
  place: boolean;
  // WO-11 design preview: whether the new look (v2) is on.
  look?: boolean;
  // Each returns what to run after the sheet closes (see finish()).
  onInfo(): After;
  onBackup(): After;
  onPlace(): After;
  onTheme(): After;
  onLook?(): After;
  onReset(): After;
}) {
  const row = (attr: string, label: string, icon: string, run: () => After) => (
    <button
      key={attr}
      type="button"
      className="row"
      {...{ [attr]: "" }}
      onClick={() => void finish(close, run())}
    >
      <span className="grow t5">{label}</span>
      <i className={`ph ${icon} arr`} />
    </button>
  );
  return (
    <div className="menu">
      {row("data-info", "이 시안에 대해", "ph-info", onInfo)}
      {row("data-backup", "백업 · 복원", "ph-floppy-disk", onBackup)}
      {place ? row("data-place", "날씨 지역", "ph-map-pin", onPlace) : null}
      {row("data-theme", "밝게 · 어둡게", "ph-moon", onTheme)}
      {onLook
        ? row("data-look", look ? "지금 디자인으로 보기" : "새 디자인으로 보기", "ph-sparkle", onLook)
        : null}
      {row("data-reset", "처음부터 다시", "ph-arrow-counter-clockwise", onReset)}
    </div>
  );
}
export function Confirm({
  close,
  title,
  sub,
  okLabel,
  onOk,
}: {
  close: Close;
  title: string;
  sub: string;
  okLabel: string;
  onOk(): void;
}) {
  return (
    <>
      <h2 className="h2">{title}</h2>
      <p className="t6 sub">{sub}</p>
      <div className="decs">
        <button
          type="button"
          className="btn go"
          data-ok=""
          onClick={() => void finish(close, onOk)}
        >
          {okLabel}
        </button>
        <button
          type="button"
          className="btn soft"
          data-no=""
          onClick={() => void close()}
        >
          그대로 둘게요
        </button>
      </div>
    </>
  );
}
function ColorGrid({
  colors,
  onPick,
}: {
  colors: Color[];
  onPick(id: string): void;
}) {
  return (
    <div className="colors">
      {colors.map((c) => (
        <button
          key={c.id}
          type="button"
          data-c={c.id}
          className={c.same ? "same" : ""}
          aria-label={`${c.label}${c.same ? " (이 옷과 같은 색)" : ""}`}
          onClick={() => onPick(c.id)}
        >
          <i style={{ background: c.hex }} />
          {c.label}
          {c.same ? " · 같은 색" : ""}
        </button>
      ))}
    </div>
  );
}
export function ColorSheet({
  close,
  title,
  sub,
  colors,
  onPick,
}: {
  close: Close;
  title: string;
  sub?: string;
  colors: Color[];
  onPick(id: string): After;
}) {
  return (
    <>
      <h2 className="h2">{title}</h2>
      {sub ? <p className="t6 sub">{sub}</p> : null}
      <ColorGrid colors={colors} onPick={(id) => void finish(close, onPick(id))} />
    </>
  );
}
export function AddByKind({
  close,
  kinds,
  colors,
  onPick,
}: {
  close: Close;
  // The kind picture stays the shared garment tile template (WO-08c).
  kinds: { id: string; name: string; html: string }[];
  colors: Color[];
  onPick(kind: string, color: string): After;
}) {
  const [kind, setKind] = useState<{ id: string; name: string } | null>(null);
  if (kind)
    return (
      <>
        <h2 className="h2">{`${kind.name} 색을 골라 주세요`}</h2>
        <ColorGrid
          colors={colors}
          onPick={(id) => void finish(close, onPick(kind.id, id))}
        />
      </>
    );
  return (
    <>
      <h2 className="h2">어떤 옷을 걸까요?</h2>
      <div className="kinds">
        {kinds.map((k) => (
          <button
            key={k.id}
            type="button"
            data-k={k.id}
            onClick={() => setKind({ id: k.id, name: k.name })}
            dangerouslySetInnerHTML={{ __html: k.html }}
          />
        ))}
      </div>
    </>
  );
}
export function ReturnReasons({
  close,
  name,
  reasons,
  onPick,
}: {
  close: Close;
  name: string;
  reasons: [string, string][];
  onPick(reason: string): After;
}) {
  return (
    <>
      <h2 className="h2">{`${name} · 왜 반품했어요?`}</h2>
      <p className="sub t6">
        기록하면 옷장에서 내려가고, 같은 상품을 다시 볼 때 알려 드려요. 확인된
        거래가 아니라 직접 남기는 기록이에요.
      </p>
      <div className="decs">
        {reasons.map(([k, l]) => (
          <button
            key={k}
            type="button"
            className="btn soft"
            data-reason={k}
            onClick={() => void finish(close, onPick(k))}
          >
            {l}
          </button>
        ))}
      </div>
    </>
  );
}
export function Decision({
  close,
  title,
  sub,
  has,
  onPick,
}: {
  close: Close;
  title: string;
  sub: string;
  has: boolean;
  onPick(decision: string): After;
}) {
  const pick = (d: string) => void finish(close, onPick(d));
  return (
    <>
      <h2 className="h2">{title}</h2>
      <p className="t6 sub">{sub}</p>
      <div className="decs">
        <button type="button" className="btn go" data-d="buy" onClick={() => pick("buy")}>
          <i className="ph ph-check" />
          샀어요
        </button>
        <button type="button" className="btn soft" data-d="hold" onClick={() => pick("hold")}>
          보류
        </button>
        <button type="button" className="btn soft" data-d="skip" onClick={() => pick("skip")}>
          안 살래요
        </button>
        {has ? (
          <button type="button" className="btn line" data-d="clear" onClick={() => pick("clear")}>
            기록 지우기
          </button>
        ) : null}
        <button
          type="button"
          className="quiet"
          data-d=""
          style={{ justifyContent: "center", width: "100%" }}
          onClick={() => pick("")}
        >
          {has ? "그대로 둘게요" : "아직 보는 중이에요"}
        </button>
      </div>
    </>
  );
}
