import { useState } from "react";
import { CorePhotoView, type CorePhoto } from "../tiles/Tile";
import "./product-photo.css";
export function ProductPhoto({
  host,
  p,
}: {
  host: {
    core: {
      photo(target: { id: string }): null | { src: string; alt: string };
      // The vanilla screens draw a missing product photo with the core tile
      // (photoHtml -> tileHtml). The same data drawn by src/tiles (WO-08c).
      photoInfo?(target: { id: string }, opts: { caption: boolean }): CorePhoto;
    };
  };
  p: { id: string; name: string };
}) {
  const ph = host.core.photo({ id: p.id }),
    [failed, setFailed] = useState(false);
  if (!ph || failed) {
    // Only a missing photo maps to the core tile. A photo that failed to load
    // keeps the plain placeholder below (vanilla showed a broken image there).
    const info = !ph ? host.core.photoInfo?.({ id: p.id }, { caption: false }) : undefined;
    if (info)
      return (
        <span className="ph-box product-photo">
          <CorePhotoView p={{ tile: info.tile, photo: null }} />
        </span>
      );
    return (
      <span className="ph-box product-photo">
        <span className="as-placeholder">사진 없음</span>
      </span>
    );
  }
  return (
    <span className="ph-box product-photo">
      <img
        src={ph.src}
        alt={ph.alt || p.name}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    </span>
  );
}
