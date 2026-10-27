import { useState } from "react";
import "./product-photo.css";
export function ProductPhoto({
  host,
  p,
}: {
  host: {
    core: {
      photo(target: { id: string }): null | { src: string; alt: string };
      // The vanilla screens draw a missing product photo with the core tile
      // (photoHtml -> tileHtml). Reuse that exact markup so the React rows
      // look the same as the screens they replace.
      photoHtml?(target: { id: string }, opts: { caption: boolean }): string;
    };
  };
  p: { id: string; name: string };
}) {
  const ph = host.core.photo({ id: p.id }),
    [failed, setFailed] = useState(false);
  if (!ph || failed) {
    // Only a missing photo maps to the core tile. A photo that failed to load
    // would make photoHtml return the same broken <img> again, so it keeps the
    // plain placeholder below (vanilla showed a broken image there).
    const tile = !ph
      ? host.core.photoHtml?.({ id: p.id }, { caption: false })
      : undefined;
    if (tile)
      // Trusted core template (tileHtml); for a bare {id} it holds no catalog text.
      return (
        <span
          className="ph-box product-photo"
          dangerouslySetInnerHTML={{ __html: tile }}
        />
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
