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
  // 11-15: 지도는 8칸(두 줄)만 펼쳐 두고 나머지는 접는다 — 16칸이면 내 옷이 한 화면 아래로 밀렸다.
  const [all, setAll] = useState(false);
  if (!g) return null;
  const left = g.total - g.owned;
  const FOLD = 8;
  const shown = all ? g.items : g.items.slice(0, FOLD);
  const rest = g.items.length - FOLD;
  const next = g.next;
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
      {next ? (
        <button
          type="button"
          className="wr-goal-next"
          aria-label={`먼저 채우면 좋은 옷 · ${next.name} 후보 보기`}
          onClick={() => open(next)}
        >
          <span className="grow">
            <span className="t6 good">먼저 채우면 좋은 옷</span>
            <span className="h3">{next.name}</span>
            <span className="t6">
              {next.gain
                ? next.cat === "outer"
                  ? `가진 코디 ${next.gain}개에 걸칠 수 있어요`
                  : `가진 옷과 새 코디 ${next.gain}개가 생겨요`
                : "목표의 빈자리예요"}
              {next.product ? ` · 예: ${next.product.brand} ${next.product.priceText}` : ""}
            </span>
          </span>
          <i className="ph ph-caret-right" aria-hidden="true" />
        </button>
      ) : null}
      <ul className="wr-goal-map">
        {shown.map((i) =>
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
      {rest > 0 ? (
        <button
          type="button"
          className="quiet wr-goal-more"
          aria-expanded={all}
          onClick={() => setAll((v) => !v)}
        >
          {all ? "접기" : `나머지 ${rest}벌 보기`}
          <i className={`ph ph-caret-${all ? "up" : "down"}`} aria-hidden="true" />
        </button>
      ) : null}
      <p className="t6 sub">{g.note}</p>
    </section>
  );
}
