import type {
  AttributeKey,
  Profile,
  ProfileForm,
  ProfileGarment,
  ProfileInfo,
  ProfileCore,
} from "./types";
type Props = {
  tab: string;
  form: ProfileForm;
  info: ProfileInfo;
  base: Profile | null;
  g: ProfileGarment;
  core: ProfileCore;
  locked: boolean;
  change(fn: (form: ProfileForm) => void): void;
  confirm(id: string, on: boolean): void;
  colour(value: string): Promise<void>;
  onFocus(target: HTMLElement): void;
};
export function ProfileFields({
  tab,
  form,
  info,
  base,
  g,
  core,
  locked,
  change,
  confirm,
  colour,
  onFocus,
}: Props) {
  const source = (key: AttributeKey) => {
    const original = base?.[key];
    if (form.attributes[key] !== original?.value && form.attributes[key])
      return "직접 입력 · 저장 대기";
    if (form.confirmed.includes(key)) return "확인함 · 저장 대기";
    return original ? info.sources[original.source] : "모름";
  };
  return (
    <fieldset
      disabled={locked}
      className="rp-fields"
      onFocusCapture={(event) => {
        if (event.target instanceof HTMLElement) onFocus(event.target);
      }}
    >
      {tab === "measure" && (
        <section>
          <h3>잘 맞는 옷 한 벌만 재도 돼요</h3>
          <p className="rp-note">
            몸 치수가 아닌, 옷을 평평하게 놓고 잰 cm예요. 비워 둔 값은 모름으로
            남겨요.
          </p>
          <label className="rp-reference">
            <input
              type="checkbox"
              checked={form.reference}
              aria-label="이 종류의 비교 기준 옷"
              onChange={(e) =>
                change((f) => {
                  f.reference = e.target.checked;
                })
              }
            />
            <span>
              이 종류의 비교 기준 옷
              <small>저장하면 같은 종류의 기존 기준 옷을 대신해요.</small>
            </span>
          </label>
          {info.measures.map((field) => (
            <div className="rp-measure" key={field.id}>
              <label htmlFor={`rp-${field.id}`}>{field.label} (cm)</label>
              <input
                id={`rp-${field.id}`}
                inputMode="decimal"
                autoComplete="off"
                maxLength={20}
                value={form.measures[field.id]}
                placeholder="모름"
                onChange={(e) =>
                  change((f) => {
                    f.measures[field.id] = e.target.value;
                  })
                }
              />
              <select
                aria-label={`${field.label} 출처`}
                value={form.measureSources[field.id]}
                onChange={(e) =>
                  change((f) => {
                    f.measureSources[field.id] = e.target.value as
                      | "measured"
                      | "seller";
                  })
                }
              >
                <option value="measured">직접 잼</option>
                <option value="seller">판매처 표기</option>
              </select>
            </div>
          ))}
        </section>
      )}
      {tab === "detail" && (
        <section>
          <h3>아는 정보만 적어 주세요</h3>
          <p className="rp-note">
            모르는 속성은 채우지 않아요. AI 추정은 확인하기 전까지 추정으로
            남겨요.
          </p>
          {info.attributes.map((attr) => (
            <div className="rp-attribute" key={attr.id}>
              <label htmlFor={`rp-${attr.id}`}>
                {attr.label}
                <small>{source(attr.id)}</small>
              </label>
              {attr.choices ? (
                <select
                  id={`rp-${attr.id}`}
                  value={form.attributes[attr.id]}
                  onChange={(e) =>
                    change((f) => {
                      f.attributes[attr.id] = e.target.value;
                    })
                  }
                >
                  <option value="">모름</option>
                  {Object.entries(attr.choices).map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id={`rp-${attr.id}`}
                  value={form.attributes[attr.id]}
                  maxLength={40}
                  placeholder="모름"
                  onChange={(e) =>
                    change((f) => {
                      f.attributes[attr.id] = e.target.value;
                    })
                  }
                />
              )}{" "}
              {base?.[attr.id]?.source === "ai" &&
                form.attributes[attr.id] === base[attr.id]?.value && (
                  <label className="rp-confirm">
                    <input
                      type="checkbox"
                      aria-label={`${attr.label} 추정을 확인했어요`}
                      checked={form.confirmed.includes(attr.id)}
                      onChange={(e) => confirm(attr.id, e.target.checked)}
                    />
                    이 추정이 맞아요
                  </label>
                )}
            </div>
          ))}
          {form.attributes.pattern && (
            <label className="rp-line">
              무늬 설명 (선택)
              <input
                value={form.patternNote}
                maxLength={40}
                onChange={(e) =>
                  change((f) => {
                    f.patternNote = e.target.value;
                  })
                }
              />
            </label>
          )}
          <label className="rp-line">
            디테일 (한 줄에 하나)
            <textarea
              value={form.details}
              maxLength={1000}
              rows={3}
              placeholder="아는 디테일만 적어요"
              onChange={(e) =>
                change((f) => {
                  f.details = e.target.value;
                })
              }
            />
          </label>
          {info.facts
            .filter((f) => f.key === "details" && f.source === "ai")
            .map((f) => (
              <label className="rp-confirm" key={f.confirmKey}>
                <input
                  type="checkbox"
                  checked={form.confirmed.includes(f.confirmKey)}
                  onChange={(e) => confirm(f.confirmKey, e.target.checked)}
                />
                {f.text} · AI 추정이 맞아요
              </label>
            ))}
        </section>
      )}
      {tab === "collection" && (
        <section>
          <h3>입기 위해서, 모으는 즐거움으로</h3>
          <p className="rp-note">
            소장용 옷은 자주 입지 않아도 실패한 구매로 세지 않아요.
          </p>
          <label className="rp-line">
            이 옷의 목적
            <select
              value={form.purpose}
              onChange={(e) =>
                change((f) => {
                  f.purpose = e.target.value as ProfileForm["purpose"];
                })
              }
            >
              <option value="">아직 정하지 않음</option>
              {Object.entries(info.purposes).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="rp-line">
            컬렉션 이름 (선택)
            <input
              maxLength={40}
              value={form.series}
              placeholder="예: 내가 모으는 옥스퍼드"
              onChange={(e) =>
                change((f) => {
                  f.series = e.target.value;
                })
              }
            />
          </label>
        </section>
      )}
      {tab === "colour" && (
        <section>
          <h3>무슨 색인가요?</h3>
          <p className="rp-note">
            색을 누르면 바로 저장돼요. 실측 편집 초안은 그대로 남겨요.
          </p>
          <div className="rp-colours">
            {core.colorChoices().map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={g.color === c.id}
                onClick={() => void colour(c.id)}
              >
                <span style={{ background: c.hex }} />
                {c.label}
              </button>
            ))}
            <button type="button" onClick={() => void colour("")}>
              색 모름
            </button>
          </div>
        </section>
      )}
    </fieldset>
  );
}
