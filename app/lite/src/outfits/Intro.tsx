import type { RefObject } from "react";
import type { OutfitHost } from "./types";
import { WeatherSlot } from "./WeatherSlot";
export function OutfitIntro({
  host,
  closet,
  heading,
  version,
}: {
  host: OutfitHost;
  closet: { mineCount: number; trialCount: number };
  heading: RefObject<HTMLHeadingElement | null>;
  version: number;
}) {
  return (
    <>
      <header className="of-top">
        <span className="mark">내 옷으로</span>
        <span className="sp" />
        {host.community ? (
          <button type="button" className="quiet of-community" onClick={host.community}>
            코디 공유
          </button>
        ) : null}
        <button
          type="button"
          className="icon"
          onClick={host.info}
          aria-label="가격·사진·판단 기준 보기"
        >
          ⓘ
        </button>
        <button
          type="button"
          className="icon"
          onClick={host.menu}
          aria-label="더보기"
        >
          ···
        </button>
      </header>
      <WeatherSlot host={host} version={version} />
      <h1 tabIndex={-1} ref={heading}>
        내 옷으로, 다른 조합
      </h1>
      <p className="of-note">
        실제 내 옷 {closet.mineCount}벌
        {closet.trialCount ? ` · 체험용 ${closet.trialCount}벌 별도` : ""} ·
        최종 순위와 이유는 AI가 비교해요.
      </p>
    </>
  );
}
export function EmptyWardrobe({ host }: { host: OutfitHost }) {
  return (
    <div className="of-empty">
      <h2>옷장 없이도 상품은 찾을 수 있어요</h2>
      <p>
        내 옷 코디는 상의·하의·신발 또는 원피스·신발이 있으면 비교할 수 있어요.
      </p>
      <button className="btn go" type="button" onClick={host.find}>
        옷 없이 상품 찾기
      </button>
      <button className="btn line" type="button" onClick={host.add}>
        내 옷 한 벌 넣기
      </button>
      <button className="quiet" type="button" onClick={host.trial}>
        체험용 코디 보기
      </button>
    </div>
  );
}
