import { useMemo } from "react";
import { OwnedPhoto } from "../photos/OwnedPhoto";
import type { ProfileGarment, ProfileHost } from "./types";
export function OwnedOutfits({
  g,
  closet,
  host,
  version,
}: {
  g: ProfileGarment;
  closet: ProfileGarment[];
  host: ProfileHost;
  version: number;
}) {
  const matchingLooks = useMemo(
    () =>
      host.core
        .closetOutfits({ detail: true })
        .list.filter((look) =>
          look.pieces.some((piece) => piece.garmentId === g.id),
        ),
    [host.core, version, g.id],
  );
  const seenLooks = new Set<string>();
  const lookPreviews = matchingLooks
    .filter((look) => !seenLooks.has(look.key) && !!seenLooks.add(look.key))
    .slice(0, 2);
  return (
    <details className="rp-looks">
      <summary>
        이 옷의 기본 조합 후보{" "}
        <span data-owned-outfit-count>{matchingLooks.length}</span>건
      </summary>
      <p className="rp-note">
        지금 만든 후보 목록 기준이에요. 종류·색의 편집 규칙으로 만들었고, 같은
        구성 미리보기는 묶었어요.
      </p>
      {lookPreviews.length ? (
        <div className="rp-look-grid">
          {lookPreviews.map((look) => (
            <article key={look.key} data-owned-look>
              <h3>{look.title || "기본 조합"}</h3>
              <div className="rp-look-pieces">
                {look.pieces.map((piece, index) => {
                  const owned = closet.find(
                    (item) => item.id === piece.garmentId,
                  );
                  return (
                    <div key={piece.garmentId || index} data-owned-piece>
                      {owned ? (
                        <>
                          <div className="rp-look-photo">
                            <OwnedPhoto g={owned} host={host} />
                          </div>
                          <p>
                            {owned.label}
                            {owned.trial ? " · 체험용" : ""}
                          </p>
                        </>
                      ) : (
                        <p>{piece.label || "옷 정보 없음"} · 보유 확인 전</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="rp-note">
          {!g.color
            ? "색을 채우면 조합을 셀 수 있어요."
            : "상의·하의·신발이 한 벌씩 있으면 기본 조합을 만들 수 있어요."}
        </p>
      )}
    </details>
  );
}
