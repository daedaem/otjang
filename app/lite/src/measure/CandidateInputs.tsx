import type { MeasureDraft, MeasureResult, MeasureCore } from "./types";
export function CandidateInputs({
  d,
  result,
  setup,
  change,
}: {
  d: MeasureDraft;
  result: MeasureResult;
  setup: ReturnType<MeasureCore["measurementInfo"]>;
  change(edit: (draft: MeasureDraft) => void): void;
}) {
  return (
    <section className="mc-section">
      <h2>2. 사려는 옷의 실측</h2>
      <div className="mc-tabs" role="tablist" aria-label="실측 입력 방법">
        <button
          role="tab"
          type="button"
          aria-selected={d.mode === "manual"}
          onClick={() =>
            change((d) => {
              d.mode = "manual";
            })
          }
        >
          숫자 직접 입력
        </button>
        <button
          role="tab"
          type="button"
          aria-selected={d.mode === "table"}
          onClick={() =>
            change((d) => {
              d.mode = "table";
            })
          }
        >
          사이즈표 붙여넣기
        </button>
      </div>
      {d.mode === "manual" ? (
        <>
          <p className="mc-small">
            같은 단면 기준의 cm를 넣어요. 비어 있는 값은 모름으로 남겨요.
          </p>
          <label className="mc-label">
            입력한 실측의 출처
            <select
              value={d.source}
              onChange={(e) =>
                change((d) => {
                  d.source = e.target.value as "seller" | "measured";
                })
              }
            >
              <option value="seller">판매처 표기</option>
              <option value="measured">직접 잼</option>
            </select>
          </label>
          <div className="mc-fields">
            {setup.fields.map((f) => (
              <label key={f.id}>
                {f.label} (cm)
                <input
                  aria-label={`후보 ${f.label} (cm)`}
                  inputMode="decimal"
                  autoComplete="off"
                  value={d.manual[f.id]}
                  maxLength={20}
                  placeholder="모름"
                  onChange={(e) =>
                    change((d) => {
                      d.manual[f.id] = e.target.value;
                    })
                  }
                />
              </label>
            ))}
          </div>
          {!setup.fields.length && (
            <p className="mc-small">
              이 종류의 실측 도식은 아직 지원하지 않아요.
            </p>
          )}
        </>
      ) : (
        <>
          <p className="mc-small">
            판매처 표의 글자를 붙여 주세요. 이미지 표라면 iPhone 라이브 텍스트로
            복사한 글자도 여기에 붙여요.
          </p>
          <textarea
            aria-label="후보 사이즈표 글자"
            value={d.table}
            maxLength={20000}
            rows={5}
            placeholder={"사이즈 총장 어깨 가슴 소매\nM 72 47 55 61"}
            onChange={(e) =>
              change((d) => {
                d.table = e.target.value;
              })
            }
          />
          <label className="mc-label">
            비교할 사이즈
            <select
              aria-label="비교할 사이즈"
              value={result.active?.label || ""}
              onChange={(e) =>
                change((d) => {
                  d.selected = e.target.value;
                })
              }
            >
              <option value="">사이즈를 골라 비교하세요</option>
              {result.options.map((o, index) => (
                <option key={`${o.label}-${index}`} value={o.label}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          {result.closest.best ? (
            <p className="mc-close">
              숫자 차이의 평균이 가장 가까운 표기: {result.closest.best}
            </p>
          ) : (
            <p className="mc-small" data-no-size-choice>
              {result.closest.reason}
            </p>
          )}
        </>
      )}
    </section>
  );
}
