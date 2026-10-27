import { useEffect, useMemo, useRef, useState } from "react";
import type { Garment } from "../closet/types";
import type { MirrorHost, MirrorDraft, MirrorSession, Point } from "./types";
import { useLocalPhoto } from "./local-photo";
export function Layer({
  host,
  g,
  draft,
  session,
  register,
  disabled,
}: {
  host: MirrorHost;
  g: Garment;
  draft: MirrorDraft;
  session: MirrorSession;
  register: (id: string, finish: (commit: boolean) => void) => () => void;
  disabled: boolean;
}) {
  const { asset, error } = useLocalPhoto(host, g.photoId, true),
    body = draft.body!;
  const [delta, setDelta] = useState({ x: 0, y: 0 }),
    drag = useRef<null | {
      x: number;
      y: number;
      dx: number;
      dy: number;
      ratioX: number;
      ratioY: number;
      release: () => void;
    }>(null);
  const placed = useMemo(() => {
    if (!asset) return null;
    try {
      return host.core.mirrorPlacement(g.id, draft, asset);
    } catch {
      return null;
    }
  }, [host, g, draft, asset]);
  const finishRef = useRef<(commit: boolean) => void>(() => {});
  finishRef.current = (commit) => {
    const a = drag.current;
    if (!a) return;
    drag.current = null;
    a.release();
    setDelta({ x: 0, y: 0 });
    if (commit && (a.dx || a.dy))
      void session.change((d) => ({
        ...d,
        layers: d.layers.map((l) =>
          l.garmentId === g.id ? { ...l, dx: l.dx + a.dx, dy: l.dy + a.dy } : l,
        ),
      }));
  };
  useEffect(
    () => register(g.id, (commit) => finishRef.current(commit)),
    [g.id, register],
  );
  useEffect(
    () => () => {
      drag.current?.release();
      drag.current = null;
    },
    [],
  );
  if (error)
    return (
      <p className="mr-layer-error" role="status">
        {g.label}: {error}
      </p>
    );
  if (!asset || !placed) return null;
  return (
    <button
      type="button"
      tabIndex={0}
      data-mirror-layer={g.id}
      data-assumed={placed.assumedLength ? "true" : "false"}
      className="mr-layer"
      disabled={disabled}
      aria-label={`${g.label} 위치 조정. 방향키로 이동, Shift와 함께 누르면 크게 이동`}
      style={{
        left: ((placed.x + delta.x) / body.width) * 100 + "%",
        top: ((placed.y + delta.y) / body.height) * 100 + "%",
        width: (placed.width / body.width) * 100 + "%",
        height: (placed.height / body.height) * 100 + "%",
        zIndex: placed.layer,
      }}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => {
        if (disabled || e.button !== 0) return;
        e.stopPropagation();
        const stage = e.currentTarget.parentElement!.getBoundingClientRect();
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = {
          x: e.clientX,
          y: e.clientY,
          dx: 0,
          dy: 0,
          ratioX: body.width / stage.width,
          ratioY: body.height / stage.height,
          release: session.hold(),
        };
      }}
      onPointerMove={(e) => {
        const a = drag.current;
        if (!a) return;
        a.dx = (e.clientX - a.x) * a.ratioX;
        a.dy = (e.clientY - a.y) * a.ratioY;
        setDelta({ x: a.dx, y: a.dy });
      }}
      onPointerUp={() => finishRef.current(true)}
      onPointerCancel={() => finishRef.current(false)}
      onLostPointerCapture={() => finishRef.current(false)}
      onKeyDown={(e) => {
        const vector = (
          {
            ArrowLeft: [-1, 0],
            ArrowRight: [1, 0],
            ArrowUp: [0, -1],
            ArrowDown: [0, 1],
          } as Record<string, number[]>
        )[e.key];
        if (!vector) return;
        e.preventDefault();
        e.stopPropagation();
        const n = e.shiftKey ? 10 : 1;
        void session.change((d) => ({
          ...d,
          layers: d.layers.map((l) =>
            l.garmentId === g.id
              ? { ...l, dx: l.dx + vector[0] * n, dy: l.dy + vector[1] * n }
              : l,
          ),
        }));
      }}
    >
      <img draggable={false} src={asset.src} alt="" />
      {placed.assumedLength && (
        <span className="mr-assumed">총장 모름 · 보통 길이로 놓았어요</span>
      )}
    </button>
  );
}
export function Stage({
  host,
  draft,
  session,
  garments,
  register,
  disabled,
}: {
  host: MirrorHost;
  draft: MirrorDraft;
  session: MirrorSession;
  garments: Garment[];
  register: (id: string, finish: (commit: boolean) => void) => () => void;
  disabled: boolean;
}) {
  const photo = useLocalPhoto(host, draft.body?.photoId),
    body = draft.body;
  const [mode, setMode] = useState<"head" | "feet" | "move">(
      draft.feet ? "move" : draft.head ? "feet" : "head",
    ),
    [cursor, setCursor] = useState<Point>({ x: 0, y: 0 }),
    [error, setError] = useState("");
  useEffect(() => {
    setMode(draft.feet ? "move" : draft.head ? "feet" : "head");
    setCursor({ x: (body?.width || 0) / 2, y: (body?.height || 0) * 0.1 });
    setError("");
  }, [body?.photoId]);
  const sameSize =
    !!body &&
    !!photo.asset &&
    body.width === photo.asset.width &&
    body.height === photo.asset.height;
  const calibration = host.core.mirrorCalibration(draft),
    byId = new Map(garments.map((g) => [g.id, g]));
  function point(p: Point) {
    if (disabled || !body || !sameSize || mode === "move") return;
    setError("");
    if (mode === "feet" && (!draft.head || p.y - draft.head.y < 50)) {
      setError(
        "발끝은 머리 끝보다 아래에서 골라 주세요. 두 점은 사진 원문 기준 50픽셀 이상 떨어져야 해요.",
      );
      return;
    }
    void session.change(
      mode === "head" ? { head: p, feet: null } : { feet: p },
    );
    setMode(mode === "head" ? "feet" : "move");
    setCursor({ x: body.width / 2, y: body.height * 0.9 });
  }
  if (!body)
    return (
      <div className="mr-empty">
        <i className="ph ph-user" aria-hidden="true" />
        <p>내 전신 사진으로 시작해요</p>
        <p className="mr-meta">사진을 올리면 이 기기에만 보관해요.</p>
      </div>
    );
  return (
    <section aria-label="사진에서 위치 맞추기">
      <div className="mr-calibration-actions">
        <button
          type="button"
          className="quiet"
          tabIndex={0}
          disabled={disabled}
          aria-pressed={mode === "head"}
          onClick={() => setMode("head")}
        >
          머리 끝 다시
        </button>
        <button
          type="button"
          className="quiet"
          tabIndex={0}
          disabled={disabled || !draft.head}
          aria-pressed={mode === "feet"}
          onClick={() => setMode("feet")}
        >
          발끝 다시
        </button>
      </div>
      <p className="mr-meta" role="status">
        {mode === "head"
          ? "사진에서 머리 끝을 눌러 주세요."
          : mode === "feet"
            ? "이제 발끝을 눌러 주세요."
            : "옷을 끌거나 방향키로 위치를 맞춰 보세요."}{" "}
        두 점은 키 입력과 함께 배치 축척만 정해요.
      </p>
      {!!error && <p role="alert">{error}</p>}
      {!!photo.error && <p role="alert">{photo.error}</p>}
      {!!photo.asset && !sameSize && (
        <p role="alert">
          사진 크기와 저장된 배치 공간이 달라요. 같은 사진 파일을 다시 골라 두
          점을 맞춰 주세요. 원본을 바꾸지 않았어요.
        </p>
      )}
      <div
        data-mirror-stage
        className={`mr-stage mr-mode-${mode}`}
        style={{
          aspectRatio: `${body.width}/${body.height}`,
          width: `min(100%, calc(62svh * ${body.width / body.height}))`,
        }}
        tabIndex={0}
        role="group"
        aria-label="전신 사진. 방향키로 지점을 옮기고 Enter로 머리 끝과 발끝 선택"
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("button")) return;
          const r = e.currentTarget.getBoundingClientRect();
          point({
            x: Math.max(
              0,
              Math.min(
                body.width,
                ((e.clientX - r.left) * body.width) / r.width,
              ),
            ),
            y: Math.max(
              0,
              Math.min(
                body.height,
                ((e.clientY - r.top) * body.height) / r.height,
              ),
            ),
          });
        }}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget || mode === "move") return;
          const v = (
            {
              ArrowLeft: [-1, 0],
              ArrowRight: [1, 0],
              ArrowUp: [0, -1],
              ArrowDown: [0, 1],
            } as Record<string, number[]>
          )[e.key];
          if (v) {
            e.preventDefault();
            setCursor((c) => ({
              x: Math.max(
                0,
                Math.min(body.width, c.x + v[0] * (e.shiftKey ? 10 : 1)),
              ),
              y: Math.max(
                0,
                Math.min(body.height, c.y + v[1] * (e.shiftKey ? 10 : 1)),
              ),
            }));
          } else if (e.key === "Enter") {
            e.preventDefault();
            point(cursor);
          }
        }}
      >
        {photo.asset && (
          <img
            data-mirror-body
            draggable={false}
            className="mr-body"
            src={photo.asset.src}
            alt="내 기기에 보관한 전신 사진"
          />
        )}
        {sameSize &&
          [draft.head, draft.feet].map(
            (p, i) =>
              p && (
                <span
                  key={i}
                  className="mr-point"
                  style={{
                    left: (p.x / body.width) * 100 + "%",
                    top: (p.y / body.height) * 100 + "%",
                  }}
                >
                  {i ? "발끝" : "머리"}
                </span>
              ),
          )}
        {sameSize && mode !== "move" && (
          <span
            className="mr-crosshair"
            style={{
              left: (cursor.x / body.width) * 100 + "%",
              top: (cursor.y / body.height) * 100 + "%",
            }}
            aria-hidden="true"
          >
            +
          </span>
        )}
        {sameSize &&
          calibration.ok &&
          draft.layers.map((l) => {
            const g = byId.get(l.garmentId);
            return (
              g && (
                <Layer
                  key={g.id}
                  {...{ host, g, draft, session, register }}
                  disabled={disabled || mode !== "move"}
                />
              )
            );
          })}
      </div>
      {!calibration.ok && <p className="mr-meta">{calibration.reason}</p>}
      <p className="mr-meta">
        어깨·허리는 평균 비례에서 시작해요. 사진의 배경도 함께 놓이며, 투명
        PNG는 더 편하게 비교할 수 있어요.
      </p>
    </section>
  );
}
