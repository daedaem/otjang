import { Fragment, useState } from "react";
import { Tile, type TileModel } from "../tiles/Tile";
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
  onInfo,
  onBackup,
  onPlace,
  onTheme,
  onReset,
}: {
  close: Close;
  place: boolean;
  // Each returns what to run after the sheet closes (see finish()).
  onInfo(): After;
  onBackup(): After;
  onPlace(): After;
  onTheme(): After;
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
  kinds: { id: string; name: string; tile: TileModel }[];
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
          >
            <Tile m={k.tile} />
            {k.name}
          </button>
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
// Outfit card (vanilla lookHtml): title, a short tail and up to four tiles.
export type Look = {
  title: string;
  tail: string;
  pieces: { cand: boolean; tile: TileModel; capCls: string; cap: string }[];
};
export function LookCard({ l }: { l: Look }) {
  return (
    <div className="lk">
      <div className="head">
        <b>{l.title}</b>
        <span className="t6">{l.tail}</span>
      </div>
      <div className="ps">
        {l.pieces.map((x, i) => (
          <div key={i} className={`p1${x.cand ? " cand" : ""}`}>
            <Tile m={x.tile} />
            <div className={x.capCls}>{x.cap}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
export type Crowd = { n: number; min: number; searchable: boolean; server: boolean; url: string };
// Registration status line (vanilla crowdLine) with the seller link.
function CrowdNotice({ c }: { c: Crowd }) {
  const meter = (
    <span className="meter" aria-hidden="true">
      {Array.from({ length: c.min }, (_, i) => (
        <i key={i} className={i < c.n ? "on" : ""} />
      ))}
    </span>
  );
  return (
    <div className="crowd" style={{ margin: "0 0 14px" }}>
      <i className="ph ph-users-three" />
      <span>
        {c.searchable ? (
          <>
            {`같은 옷을 ${c.min}명이 등록해서 이제 모두가 검색할 수 있어요`}
            {meter}
          </>
        ) : (
          <>
            {`같은 옷을 ${c.min}명이 등록하면 모두가 검색할 수 있어요 · 지금 ${c.n}/${c.min}`}
            {meter}
            {c.server ? "" : " · 서버 연결 전에는 이 기기에만"}
          </>
        )}
        {c.url ? (
          <>
            {" · "}
            <a href={c.url} target="_blank" rel="noopener" style={{ textDecoration: "underline" }}>
              판매처 링크
            </a>
          </>
        ) : null}
      </span>
    </div>
  );
}
// Open Products Facts source line (vanilla opfNotice).
function OpfNotice({ code }: { code: string }) {
  const link = { target: "_blank", rel: "noopener noreferrer", style: { textDecoration: "underline" } } as const;
  return (
    <p className="t6" style={{ margin: "10px 0" }}>
      Open Products Facts에서 가져온 정보 ·{" "}
      <a href={`https://world.openproductsfacts.org/product/${code}`} {...link}>
        원본 확인
      </a>{" "}
      ·{" "}
      <a href="https://opendatacommons.org/licenses/odbl/1-0/" {...link}>
        ODbL
      </a>
      <br />
      종류·색과 실제로 가진 상품인지 확인해 주세요. 상품 사진·가격은 제공하지 않아요.
    </p>
  );
}
// The garment info sheet (vanilla garmentSheet without the profile editor):
// trial garments and the fallback when the editor cannot open.
export function GarmentInfo({
  close,
  tile,
  title,
  sub,
  opf,
  crowd,
  askColor,
  canColor,
  count,
  looks,
  empty,
  onColor,
  onRemove,
}: {
  close: Close;
  tile: TileModel;
  title: string;
  sub: string;
  opf: { code: string } | null;
  crowd: Crowd | null;
  askColor: boolean;
  canColor: boolean;
  count: number;
  looks: Look[];
  empty: string;
  onColor(): After;
  onRemove(): After;
}) {
  const color = () => void finish(close, onColor());
  return (
    <>
      <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 14 }}>
        <span style={{ width: 84, display: "block", flex: "none" }}>
          <Tile m={tile} />
        </span>
        <div style={{ minWidth: 0 }}>
          <h2 className="h2" style={{ margin: 0 }}>
            {title}
          </h2>
          <div className="t6">{sub}</div>
        </div>
      </div>
      {opf ? <OpfNotice code={opf.code} /> : crowd ? <CrowdNotice c={crowd} /> : null}
      {askColor ? (
        <div className="notice" style={{ margin: "0 0 12px" }}>
          <span className="grow">색을 알려 주시면 코디에 셀 수 있어요</span>
          <button type="button" data-gcolor="" onClick={color}>
            색 고르기
          </button>
        </div>
      ) : null}
      <h3 className="h3" style={{ marginBottom: 4 }}>
        이 옷으로 입을 수 있는 코디 <span className="num acc">{count}</span>가지
      </h3>
      {looks.length ? (
        <div className="lks" style={{ marginTop: 8 }}>
          {looks.map((l, i) => (
            <LookCard key={i} l={l} />
          ))}
        </div>
      ) : (
        <p className="t6">{empty}</p>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        {canColor ? (
          <button type="button" className="btn line sm" data-gcolor="" style={{ flex: 1 }} onClick={color}>
            색 바꾸기
          </button>
        ) : null}
        <button
          type="button"
          className="btn soft sm"
          data-rm=""
          style={{ flex: 1 }}
          onClick={() => void finish(close, onRemove())}
        >
          옷장에서 빼기
        </button>
      </div>
    </>
  );
}
