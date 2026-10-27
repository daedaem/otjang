import type { Pic } from "./types";
// Shared bits of the WO-04 screens: the top bar of a pushed screen and the
// product picture, both matching the vanilla templates (top(), productPic()).
export function Html({ html }: { html: string }) {
  // Trusted shared screen templates (garment / outfit-piece tiles).
  return (
    <span
      style={{ display: "contents" }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
export function Top({ back, info }: { back(): void; info(): void }) {
  return (
    <div className="top" id="top">
      <button type="button" className="icon" aria-label="뒤로" onClick={back}>
        <i className="ph ph-caret-left" />
      </button>
      <span className="sp" />
      <button
        type="button"
        className="icon quiet-i end"
        aria-label="가격·사진·판단 기준 보기"
        onClick={info}
      >
        <i className="ph ph-info" />
      </button>
    </div>
  );
}
// The inside of productPic(): an <img> for a product photo, otherwise the
// core colour tile template.
export function PicInner({ pic }: { pic: Pic }) {
  if (pic.photo)
    return (
      <img
        className={pic.photo.flat ? "flat" : "cover"}
        src={pic.photo.src}
        alt={pic.photo.alt}
        decoding="async"
      />
    );
  return <Html html={pic.tile || ""} />;
}
export function ProductPic({ pic }: { pic: Pic }) {
  if (pic.photo)
    return (
      <span className="ph-box">
        <PicInner pic={pic} />
      </span>
    );
  return (
    <span
      className="ph-box"
      dangerouslySetInnerHTML={{ __html: pic.tile || "" }}
    />
  );
}
