import type { ProfileGarment } from "../profile/types";
import type { MeasureResult } from "./types";
export function ComparisonResult({
  result,
  reference,
}: {
  result: MeasureResult;
  reference: ProfileGarment | null;
}) {
  return (
    <section className="mc-section">
      <h2>3. 숫자로 나란히 보기</h2>
      {!reference ? (
        <p className="mc-small">
          기준 옷을 골라야 두 옷의 차이를 비교할 수 있어요.
        </p>
      ) : !result.active ? (
        <p className="mc-small">
          읽은 사이즈를 직접 고르거나 숫자를 넣어 주세요.
        </p>
      ) : (
        <>
          <p className="mc-fact" data-measure-fact>
            {result.comparison?.factLine || result.comparison?.reason}
          </p>
          {result.comparison?.sentence && <p>{result.comparison.sentence}</p>}
          <table>
            <thead>
              <tr>
                <th>실측</th>
                <th>내 옷</th>
                <th>후보</th>
                <th>차이</th>
              </tr>
            </thead>
            <tbody>
              {result.comparison?.rows.map((r) => (
                <tr key={r.key}>
                  <th>{r.label}</th>
                  <td>{r.reference === null ? "모름" : `${r.reference}cm`}</td>
                  <td>{r.candidate === null ? "모름" : `${r.candidate}cm`}</td>
                  <td>
                    {r.diff === null
                      ? "비교 전"
                      : `${r.diff > 0 ? "+" : ""}${r.diff}cm`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {result.sketch && (
            <div className="mc-sketch">
              <svg
                role="img"
                aria-label="같은 축척의 기준 옷과 후보 실측 도식"
                viewBox={result.sketch.viewBox}
              >
                <path
                  d={result.sketch.reference.path}
                  fill="var(--well)"
                  stroke="var(--ink2)"
                  strokeWidth=".7"
                />
                <path
                  d={result.sketch.candidate.path}
                  fill="none"
                  stroke="var(--acc)"
                  strokeWidth=".8"
                  strokeDasharray="2 1.5"
                />
              </svg>
              <p className="mc-small">회색: 내 기준 옷 · 주황 점선: 후보</p>
              {[
                ...new Set([
                  ...result.sketch.candidate.assumed,
                  ...result.sketch.reference.assumed,
                ]),
              ].length > 0 && (
                <p className="mc-small">
                  그림용 가정:{" "}
                  {[
                    ...new Set([
                      ...result.sketch.candidate.assumed,
                      ...result.sketch.reference.assumed,
                    ]),
                  ].join("·")}
                </p>
              )}
            </div>
          )}
        </>
      )}
      <p className="mc-note">{result.note}</p>
    </section>
  );
}
