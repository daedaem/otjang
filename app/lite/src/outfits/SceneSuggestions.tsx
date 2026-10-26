import type { OutfitHost, Scene, Suggestion } from "./types";
import { OwnedPhoto } from "../photos/OwnedPhoto";
import { useEffect, useState } from "react";
function Product({
  p,
  host,
  why,
}: {
  p: Suggestion;
  host: OutfitHost;
  why?: string;
}) {
  const [error, setError] = useState("");
  const [photoFailed, setPhotoFailed] = useState(false);
  useEffect(() => setPhotoFailed(false), [p.photo?.src]);
  const hung = host.core.compareHas(p.id);
  const toggle = () => {
    try {
      if (hung) host.core.compareRemove(p.id);
      else host.core.compareAdd(p.id);
      setError("");
      host.compared(p.id, !hung);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "비교함을 바꾸지 못했어요. 기존 선택은 그대로예요.",
      );
    }
  };
  return (
    <article className="of-product-row" data-outfit-product={p.id}>
      <button
        type="button"
        className="of-product"
        onClick={() => host.product(p.id)}
      >
        {p.photo && !photoFailed ? (
          <img
            src={p.photo.src}
            alt={p.photo.alt}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setPhotoFailed(true)}
          />
        ) : (
          <span className="of-product-placeholder">{p.kindName || "상품"}</span>
        )}
        <span>
          <small>{p.brand}</small>
          <b>{p.name}</b>
          <span>{why || p.why || p.reason}</span>
          <strong>
            {p.priceText} <small>{p.priceShort || "수집 시점 가격"}</small>
          </strong>
        </span>
      </button>
      <button
        type="button"
        className="of-hang"
        data-outfit-hang={p.id}
        aria-label={hung ? "걸어 보는 중 · 내리기" : "걸어 보기"}
        aria-pressed={hung}
        onClick={toggle}
      >
        {hung ? "내리기" : "걸기"}
      </button>
      {error && (
        <p className="of-product-error" role="alert">
          {error}
        </p>
      )}
    </article>
  );
}
export function SceneSuggestions({
  host,
  scene,
  suggestions,
  label,
}: {
  host: OutfitHost;
  scene: Scene | null;
  suggestions: Suggestion[];
  label: string;
}) {
  const candidates =
    scene?.outfit?.pieces.filter((piece) => !piece.owned && piece.product) ||
    [];
  return (
    <>
      {scene && !scene.outfit && (
        <p className="of-notice">
          {scene.outfitNote ||
            `${label}에 맞는 코디 공식은 아직 없어요. 조건을 풀어 다른 공식으로 채우지 않았어요.`}
        </p>
      )}
      {scene?.outfit && (
        <details className="of-scene-preview">
          <summary>{label}의 기본 공식 보기 · AI 순위와 별도</summary>
          <p className="of-note">
            기록된 옷 {scene.outfit.ownedCount}벌 + 구매 후보{" "}
            {scene.outfit.buyCount}벌 · 체험용이 있으면 따로 표시해요.
          </p>
          <div className="of-pieces">
            {scene.outfit.pieces.map((piece, i) => {
              const g = piece.garmentId
                  ? host.core
                      .getState()
                      .closet.find((g) => g.id === piece.garmentId)
                  : null,
                p = piece.product
                  ? host.core.product(piece.product.id) || piece.product
                  : null;
              return (
                <div className="of-piece" key={piece.garmentId || p?.id || i}>
                  <span className="of-photo">
                    {g ? (
                      <OwnedPhoto g={g} host={host} />
                    ) : p?.photo ? (
                      <img
                        src={p.photo.src}
                        alt={p.photo.alt}
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <span>{piece.kindName}</span>
                    )}
                  </span>
                  <b>
                    {g
                      ? g.label + (g.trial ? " · 체험용" : "")
                      : p
                        ? "구매 후보 · " + p.name
                        : piece.label}
                  </b>
                </div>
              );
            })}
          </div>
        </details>
      )}
      {(candidates.length > 0 || suggestions.length > 0) && (
        <section className="of-suggestions">
          <h2>한 벌만 더 있으면</h2>
          <p className="of-note">
            내 옷과 연결하는 기본 공식의 상품 후보예요. AI 최종 순위와 구분하고,
            현재 가격·재고는 판매처에서 확인해요.
          </p>
          {candidates.length
            ? candidates.map((piece, i) => {
                const p =
                  host.core.product(piece.product!.id) || piece.product!;
                return (
                  <Product
                    key={p.id + "-" + i}
                    p={p}
                    host={host}
                    why={`${label} 기본 공식의 ${piece.kindName} 자리`}
                  />
                );
              })
            : suggestions.map((p) => <Product key={p.id} p={p} host={host} />)}
        </section>
      )}
      {scene && scene.products.length > 0 && (
        <button
          type="button"
          className="of-more"
          onClick={() => host.query(scene.text)}
        >
          {label} 조건의 상품 {scene.products.length}개 더 보기 →
        </button>
      )}
    </>
  );
}
