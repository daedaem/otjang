import { useMemo, useState } from "react";
import type { ClosetHost, StyleGoal } from "./types";
// 개편 A 4단계(대표 11-12 "추천대로", 의도 3번): 새 화면(data-edition="today") 옷장 탭의 「스타일 목표」.
// 원하는 스타일을 고르면 그 스타일의 기본 옷 중 가진 것·빈자리를 지도로 보이고, 먼저 채우면 좋은 옷을 짚는다.
// 기본 옷 목록은 편집 기준(core.styleGoal)이고, 체험용 옷은 보유로 세지 않는다.
export function GoalPanel({ host, version }: { host: ClosetHost; version: number }) {
  const [style, setStyle] = useState(() => host.goal?.get() || "classic");
  const g: StyleGoal | null = useMemo(
    () => host.core.styleGoal?.(style) ?? null,
    // version: 옷장이 바뀌면 다시 센다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [host, style, version],
  );
  if (!g) return null;
  const left = g.total - g.owned;
  const open = (i: StyleGoal["items"][number]) =>
    i.product ? host.product?.(i.product.id) : host.search?.(i.name);
  return (
    <section className="wr-goal" aria-label="스타일 목표">
      <div className="wr-goal-top">
        <label className="wr-goal-pick">
          <span className="t6">목표 스타일</span>
          <select
            aria-label="목표 스타일"
            value={g.style.id}
            onChange={(e) => {
              setStyle(e.target.value);
              host.goal?.set(e.target.value);
            }}
          >
            {g.choices.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <span className="t6 wr-goal-desc">{g.style.desc}</span>
      </div>
      <h2 className="h2">{left ? `목표까지 ${left}벌 남았어요` : "목표 옷장을 다 채웠어요"}</h2>
      <div className="wr-goal-bar">
        <div
          className="wr-goal-track"
          role="img"
          aria-label={`기본 ${g.total}벌 중 ${g.owned}벌 있어요`}
        >
          <span style={{ width: `${g.total ? (g.owned / g.total) * 100 : 0}%` }} />
        </div>
        <span className="t6 num">{`기본 ${g.total}벌 중 ${g.owned}벌 있어요`}</span>
      </div>
      <ul className="wr-goal-map">
        {g.items.map((i) =>
          i.state === "owned" ? (
            <li key={i.slotId} data-goal="owned">
              <span className="wr-goal-cell on">
                <i className="ph-fill ph-check-circle" aria-hidden="true" />
              </span>
              <span className="t6">{i.name}</span>
            </li>
          ) : (
            <li key={i.slotId} data-goal={i.state}>
              <button
                type="button"
                className={`wr-goal-cell ${i.state}`}
                aria-label={`${i.name} 후보 보기`}
                onClick={() => open(i)}
              >
                <i className="ph ph-plus" aria-hidden="true" />
              </button>
              <span className="t6">
                {i.name}
                {i.state === "trial" ? " · 체험용" : ""}
              </span>
            </li>
          ),
        )}
      </ul>
      {g.next ? (
        <div className="wr-goal-next">
          <p className="t6 good">먼저 채우면 좋은 옷</p>
          <p className="h3">{g.next.name}</p>
          <p className="t6">
            {g.next.gain
              ? g.next.cat === "outer"
                ? `가진 코디 ${g.next.gain}개에 걸칠 수 있어요`
                : `가진 옷과 새 코디 ${g.next.gain}개가 생겨요`
              : "목표의 빈자리예요"}
            {g.next.product ? ` · 예: ${g.next.product.brand} ${g.next.product.priceText}` : ""}
          </p>
        </div>
      ) : null}
      <p className="t6 sub">{g.note}</p>
    </section>
  );
}
