import { useState } from "react";
import { OwnedPhoto } from "../photos/OwnedPhoto";
import type { CollectionHost, Shelf } from "./types";
function Series({
  s,
  host,
  edit,
  remove,
  disabled,
}: {
  s: Shelf;
  host: CollectionHost;
  edit(): void;
  remove(): void;
  disabled: boolean;
}) {
  const [limit, setLimit] = useState(8);
  return (
    <article className="cv-shelf" data-collection-shelf={s.name}>
      <header>
        <div>
          <h2>{s.name}</h2>
          <p>
            실제 보유 {s.count}벌
            {s.target !== null ? ` · 직접 정한 목표 ${s.target}벌` : ""}
          </p>
        </div>
        <button
          className="quiet"
          type="button"
          disabled={disabled}
          onClick={edit}
        >
          목표 {s.target === null ? "정하기" : "바꾸기"}
        </button>
      </header>
      <div className="cv-items">
        {s.items.slice(0, limit).map((g) => (
          <button
            className="cv-item"
            key={g.id}
            data-collection-g={g.id}
            type="button"
            onClick={() => host.owned(g.id)}
          >
            <span className="cv-picture">
              <OwnedPhoto g={g} host={host} />
            </span>
            <b>{g.label}</b>
            <small>{host.core.collectionWear(g.id).line}</small>
          </button>
        ))}
        {Array.from({ length: Math.min(s.empty, 4) }, (_, i) => (
          <div className="cv-empty-slot" data-empty-slot key={"empty" + i}>
            <span>+</span>
            <small>직접 정한 목표의 빈칸</small>
          </div>
        ))}
      </div>
      {s.items.length > limit && (
        <button
          className="quiet"
          type="button"
          onClick={() => setLimit((n) => n + 8)}
        >
          보유 옷 더 보기 ({s.items.length - limit}벌)
        </button>
      )}
      {s.empty > 4 && (
        <p className="cv-note">
          빈칸은 모두 {s.empty}칸이에요. 화면에는4칸만 표시했어요.
        </p>
      )}
      {s.target !== null && (
        <button
          className="quiet"
          type="button"
          disabled={disabled}
          aria-label={`${s.name} 목표 지우기`}
          onClick={remove}
        >
          목표만 지우기 · 보유 옷은 유지
        </button>
      )}
    </article>
  );
}
export function Shelves({
  shelves,
  host,
  edit,
  remove,
  disabled,
}: {
  shelves: Shelf[];
  host: CollectionHost;
  edit(name: string, target: number | null): void;
  remove(name: string): void;
  disabled: boolean;
}) {
  return (
    <div className="cv-shelves">
      {shelves.length ? (
        shelves.map((s) => (
          <Series
            key={host.core.collectionSeriesKey(s.name)}
            s={s}
            host={host}
            disabled={disabled}
            edit={() => edit(s.name, s.target)}
            remove={() => remove(s.name)}
          />
        ))
      ) : (
        <section className="cv-empty">
          <h2>아직 이름 붙인 컬렉션이 없어요</h2>
          <p>
            옷 정보에서 시리즈 이름을 적으면 보유한 옷끼리 모여요. 목표를 정하지
            않으면 빈칸은 만들지 않아요.
          </p>
        </section>
      )}
    </div>
  );
}
