import { useEffect, useState, type RefObject } from "react";
import { OwnedPhoto } from "../photos/OwnedPhoto";
import type { ProfileGarment, ProfileHost } from "./types";
type Props = {
  g: ProfileGarment;
  host: ProfileHost;
  metadata: ReturnType<ProfileHost["metadata"]>;
  link: string | null;
  disabled: boolean;
  onColour(): void;
  heading: RefObject<HTMLHeadingElement | null>;
};
export function GarmentSummary({
  g,
  host,
  metadata,
  link,
  disabled,
  onColour,
  heading,
}: Props) {
  const brand = g.brand || metadata?.brand;
  const wear = host.core.collectionWear?.(g.id);
  const sellerPhoto =
    !g.photoId && g.productId ? host.core.photo({ id: g.productId }) : null;
  const [photoFailed, setPhotoFailed] = useState(false);
  useEffect(() => setPhotoFailed(false), [sellerPhoto?.src]);
  return (
    <>
      <div className="rp-head">
        <div className="rp-photo">
          {sellerPhoto && !photoFailed ? (
            <div className="rp-seller-photo">
              <img
                src={sellerPhoto.src}
                alt={sellerPhoto.alt}
                decoding="async"
                onError={() => setPhotoFailed(true)}
              />
              <span>판매처 원문 사진</span>
            </div>
          ) : (
            <OwnedPhoto g={g} host={host} />
          )}
        </div>
        <div>
          <p className="rp-brand">{brand || "브랜드 미입력"}</p>
          <h2 id="rp-profile-title" ref={heading} tabIndex={-1}>
            {g.label}
          </h2>
          <p>
            {g.kindName} · {g.colorLabel || "색 미확인"}
          </p>
          <button
            className="quiet"
            type="button"
            disabled={disabled}
            onClick={onColour}
          >
            색 바꾸기
          </button>
        </div>
      </div>
      {wear && (
        <p className="rp-note" data-owned-wear>
          {wear.line}
          <br />
          {wear.note}
        </p>
      )}
      {metadata?.source?.provider === "opf" &&
        /^\d{6,24}$/.test(metadata.source.code) && (
          <p className="rp-note">
            Open Products Facts에서 가져온 정보예요.{" "}
            <a
              href={`https://world.openproductsfacts.org/product/${metadata.source.code}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              원본
            </a>{" "}
            ·{" "}
            <a
              href="https://opendatacommons.org/licenses/odbl/1-0/"
              target="_blank"
              rel="noopener noreferrer"
            >
              ODbL
            </a>
          </p>
        )}
      {metadata?.community && (
        <p className="rp-note">
          {metadata.community.label}
          {link && (
            <>
              {" "}
              ·{" "}
              <a href={link} target="_blank" rel="noopener noreferrer">
                등록한 링크
              </a>
            </>
          )}
        </p>
      )}
      {!metadata?.community && link && (
        <a
          className="rp-link"
          href={link}
          target="_blank"
          rel="noopener noreferrer"
        >
          상품 원문 링크{" "}
          <i className="ph ph-arrow-up-right" aria-hidden="true" />
        </a>
      )}
    </>
  );
}
