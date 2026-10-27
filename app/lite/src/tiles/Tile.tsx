import { useState, type ReactNode } from "react";
// WO-08c: the shared picture tiles as React. Same markup, classes and inline
// styles as the core photoHtml()/tileHtml() and the screen templates
// productPic()/garmentPic()/piecePic(); screen.html and the core compute the
// data (tileModel / M.photoInfo), so one rule decides what a tile shows.
export type CoreTile = { hex: string; ink: string; name: string };
export type CorePhoto = {
  tile: CoreTile;
  photo: {
    src: string;
    alt: string;
    similar: boolean;
    fit: "cover" | "contain";
    eager: boolean;
    caption: string;
  } | null;
};
export type TileModel =
  | { t: "img"; cls: "flat" | "cover"; src: string; alt: string }
  | { t: "core"; core: CorePhoto }
  | { t: "mine"; label: string; hex: string }
  | { t: "swatch"; label: string; hex: string };
// Colour card shown when there is no photo (core tileHtml).
export function CoreTileView({ t }: { t: CoreTile }) {
  return (
    <span
      className="eo-tile"
      data-photo="none"
      style={{
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "flex-start",
        width: "100%",
        height: "100%",
        aspectRatio: "var(--eo-ratio,4/5)",
        background: t.hex,
        color: t.ink,
        font: "600 12px/1.3 system-ui,sans-serif",
        padding: 8,
        boxSizing: "border-box",
        borderRadius: "inherit",
      }}
    >
      {t.name}
    </span>
  );
}
// core photoHtml(): the photo, or the colour card when there is none or the
// image fails to load (the vanilla onerror swaps in the same card).
export function CorePhotoView({ p }: { p: CorePhoto }) {
  const [failed, setFailed] = useState(false);
  const ph = p.photo;
  if (!ph || failed) return <CoreTileView t={p.tile} />;
  return (
    <span
      className="eo-ph"
      data-photo={ph.similar ? "similar" : "product"}
      style={{
        position: "relative",
        display: "block",
        width: "100%",
        height: "100%",
        aspectRatio: "var(--eo-ratio,4/5)",
        background: "#f3f3f1",
        borderRadius: "inherit",
        overflow: "hidden",
      }}
    >
      <img
        loading={ph.eager ? undefined : "lazy"}
        decoding="async"
        referrerPolicy="no-referrer"
        src={ph.src}
        alt={ph.alt}
        onError={() => setFailed(true)}
        style={{
          display: "block",
          width: "100%",
          height: "100%",
          objectFit: ph.fit,
          borderRadius: "inherit",
        }}
      />
      {ph.caption ? (
        <span
          className="eo-cap"
          style={{
            position: "absolute",
            left: 6,
            bottom: 6,
            maxWidth: "calc(100% - 12px)",
            padding: "2px 6px",
            borderRadius: 4,
            background: "rgba(255,255,255,.92)",
            color: "#333",
            font: "600 11px/1.4 system-ui,sans-serif",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {ph.caption}
        </span>
      ) : null}
    </span>
  );
}
// What goes inside .ph-box for a tile (no wrapper).
export function TileInner({ m }: { m: TileModel }) {
  if (m.t === "img")
    return <img className={m.cls} src={m.src} alt={m.alt} decoding="async" />;
  if (m.t === "core") return <CorePhotoView p={m.core} />;
  return (
    <span className="swatch">
      <i style={{ background: m.hex }} />
    </span>
  );
}
// productPic()/garmentPic()/piecePic(): the .ph-box with the tile and any
// tags (children) after it.
export function Tile({ m, children }: { m: TileModel; children?: ReactNode }) {
  if (m.t === "mine" || m.t === "swatch")
    return (
      <span className="ph-box" role="img" aria-label={m.label}>
        <TileInner m={m} />
        {m.t === "mine" ? <span className="tag">내 사진 연결됨</span> : null}
        {children}
      </span>
    );
  return (
    <span className="ph-box">
      <TileInner m={m} />
      {children}
    </span>
  );
}
