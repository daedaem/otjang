import { useState } from "react";
import "./product-photo.css";
export function ProductPhoto({
  host,
  p,
}: {
  host: {
    core: {
      photo(target: { id: string }): null | { src: string; alt: string };
    };
  };
  p: { id: string; name: string };
}) {
  const ph = host.core.photo({ id: p.id }),
    [failed, setFailed] = useState(false);
  return (
    <span className="ph-box product-photo">
      {ph && !failed ? (
        <img
          src={ph.src}
          alt={ph.alt || p.name}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="as-placeholder">사진 없음</span>
      )}
    </span>
  );
}
