import { useEffect, useRef, useState } from "react";
import type { Garment } from "../closet/types";
import "./owned-photo.css";
export type PhotoHost = {
  namespace: string;
  core: {
    boot?: { photos?: boolean; preview?: boolean };
    railCategory(g: Garment): string | null;
  };
};
const roleOf = (g: Garment, host: PhotoHost) => {
  const role = host.core.railCategory(g);
  return role === "dress" ? "top" : role || "accessory";
};
export function OwnedPhoto({ g, host }: { g: Garment; host: PhotoHost }) {
  const node = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [src, setSrc] = useState("");
  const [missing, setMissing] = useState(false);
  const enabled =
    host.core.boot?.photos !== false && !host.core.boot?.preview && !g.trial;
  const allowed = visible && enabled;
  useEffect(() => {
    const observer = new IntersectionObserver((entries) =>
      setVisible(entries.some((entry) => entry.isIntersecting)),
    );
    if (node.current) observer.observe(node.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let alive = true,
      url = "";
    setSrc("");
    setMissing(false);
    if (allowed && g.photoId)
      void (
        (
          window as Window & {
            EOUL_PHOTO_LOAD?: () => Promise<typeof import("./index.js")>;
          }
        ).EOUL_PHOTO_LOAD?.() || import("./index.js")
      )
        .then((mod) => mod.garmentThumbnail(host.namespace, g.photoId!))
        .then((blob) => {
          if (!alive) return;
          if (!blob) {
            setMissing(true);
            return;
          }
          url = URL.createObjectURL(blob);
          setSrc(url);
        })
        .catch(() => {
          if (alive) setMissing(true);
        });
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [allowed, g.photoId, host.namespace]);
  if (src)
    return (
      <span ref={node} className="wr-photo-live">
        <img
          src={src}
          alt={`${g.label} · 내 사진`}
          decoding="async"
          draggable={false}
        />
      </span>
    );
  const role = roleOf(g, host);
  const shape =
    role === "bottom"
      ? "M26 8H74L82 90H58L50 39L42 90H18Z"
      : role === "shoes"
        ? "M15 50L36 38L55 59L85 64V78H15Z"
        : role === "outer" || role === "top"
          ? "M34 12L44 18H56L66 12L91 33L77 49L69 43V90H31V43L23 49L9 33Z"
          : "M30 20H70V80H30Z";
  return (
    <span
      ref={node}
      className="wr-placeholder"
      role="img"
      aria-label={`${g.label} · ${missing ? "사진 연결 없음" : "사진 없음"}`}
    >
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <path
          d={shape}
          fill={g.colorHex || "#bfc3ca"}
          stroke="var(--line)"
          strokeWidth="1"
        />
      </svg>
      <span>
        {missing
          ? "사진 연결 없음"
          : g.photoId && !enabled
            ? "사진 표시 꺼짐"
            : g.photoId
              ? "내 사진 연결됨"
              : "사진 없음"}
      </span>
    </span>
  );
}
