import type { CollectionInfo, Preference } from "./types";
export function CandidateValue({
  info,
  preference,
  disabled,
  onChange,
  onShelves,
}: {
  info: CollectionInfo;
  preference: Preference;
  disabled: boolean;
  onChange(p: Preference): void;
  onShelves(): void;
}) {
  const axes = info.axes!;
  const change = (patch: Partial<Preference>) =>
    onChange({ ...preference, ...patch, updatedAt: new Date().toISOString() });
  return (
    <>
      <fieldset className="cv-purpose" disabled={disabled}>
        <legend>이 옷을 들이려는 이유</legend>
        <div>
          {[[null, "아직 모름"], ...Object.entries(info.purposes)].map(
            ([id, label]) => (
              <button
                key={String(id)}
                type="button"
                aria-pressed={preference.purpose === id}
                onClick={() => change({ purpose: id as Preference["purpose"] })}
              >
                {label}
              </button>
            ),
          )}
        </div>
      </fieldset>
      <label className="cv-field">
        시리즈·컬렉션 이름 <small>선택 · 직접 정한 이름</small>
        <input
          aria-label="후보 시리즈 이름"
          value={preference.series}
          maxLength={40}
          disabled={disabled}
          onChange={(e) => change({ series: e.target.value })}
        />
      </label>
      <p className="cv-note">
        목적과 시리즈는 내 메모예요. 상품의 한정·단종 여부나 실제 보유를 뜻하지
        않아요.
      </p>
      <section className="cv-summary" aria-label="활용과 소장 요약">
        <p>{axes.summary}</p>
      </section>
      <div
        className={`cv-axes ${preference.purpose === "collect" ? "cv-collect-first" : ""}`}
      >
        <section className="cv-axis cv-usage" aria-label="활용 축">
          <span>활용</span>
          <h2>
            {axes.usage.newOutfits === null
              ? "새 조합은 아직 계산 전"
              : `새 조합 +${axes.usage.newOutfits}`}
          </h2>
          <p>{info.ownedCount}벌의 실제 내 옷 기준 · 종류·색의 편집 규칙</p>
          <p>
            같은 종류·같거나 가까운 색의 비교 후보 {axes.usage.similarCount}벌
          </p>
          {info.product?.colorFromPhoto && (
            <p>후보 색이 사진 추정이라 색과 새 조합 수를 확정하지 않았어요.</p>
          )}
          {axes.duplicateWarning && (
            <p className="cv-warning" data-collection-duplicate>
              확인된 속성에서 같은 옷이 있어요. 착용 목적에 필요한 차이를 확인해
              보세요.
            </p>
          )}
        </section>
        <section className="cv-axis cv-collect" aria-label="수집 축">
          <span>수집</span>
          <h2>
            {axes.collection.series
              ? `${axes.collection.series}에 더한다면`
              : "소장할 이유는 따로 봐요"}
          </h2>
          <p>
            {axes.collection.series
              ? `현재 보유 ${axes.collection.owned}벌 · 추가하면 ${axes.collection.position}번째`
              : "시리즈가 없어도 소장 목적으로 고를 수 있어요."}
          </p>
          <p>
            비슷한 옷이 있거나 착용 기록이 적어도 소장 목적을 감점하지 않아요.
          </p>
          <button type="button" className="quiet" onClick={onShelves}>
            내 진열장 보기 →
          </button>
        </section>
      </div>
      <section className="cv-differences">
        <h2>기록된 차이 비교</h2>
        <p className="cv-note">
          모르는 색·속성과 AI 확인 전 정보는 같다는 근거로 쓰지 않아요. 활용과
          수집을 한 점수로 합치지 않아요.
        </p>
        {axes.similar.length ? (
          axes.similar.map((s) => (
            <details key={s.garment.id}>
              <summary>
                {s.garment.label} ·{" "}
                {s.color === "unknown"
                  ? "색 미확인"
                  : s.color === "near"
                    ? "가까운 색"
                    : "같은 색"}
              </summary>
              <dl>
                {s.diff.attrs.map((a) => (
                  <div key={a.key}>
                    <dt>{a.label}</dt>
                    <dd>
                      후보 {a.candidate || "모름"} / 내 옷 {a.owned || "모름"} ·{" "}
                      {a.state === "unknown"
                        ? "확인 전"
                        : a.state === "same"
                          ? "기록 같음"
                          : "기록 다름"}
                    </dd>
                  </div>
                ))}
              </dl>
              {s.diff.onlyCandidate.length > 0 && (
                <p>후보에만 기록: {s.diff.onlyCandidate.join(" · ")}</p>
              )}
              {s.diff.onlyOwned.length > 0 && (
                <p>내 옷에만 기록: {s.diff.onlyOwned.join(" · ")}</p>
              )}
              {s.diff.detailsUnknown && (
                <p className="cv-note">
                  디테일 정보가 부족해 동일 여부는 확인 전이에요.
                </p>
              )}
            </details>
          ))
        ) : (
          <p className="cv-note">
            현재 내 옷에서 비교할 같은 종류·색 후보가 없어요.
          </p>
        )}
      </section>
    </>
  );
}
