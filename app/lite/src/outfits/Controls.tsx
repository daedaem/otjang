import type { Context, OutfitCore } from "./types";
type Choices = ReturnType<OutfitCore["outfitChoices"]>;
export function ContextChips({
  context,
  choices,
  updateContext,
}: {
  context: Context;
  choices: Choices;
  updateContext(value: Partial<Context>): void;
}) {
  return (
    <div className="of-context" role="group" aria-label="코디 상황">
      <button
        type="button"
        aria-pressed={context.occasion === null}
        onClick={() => updateContext({ occasion: null })}
      >
        내 옷 전체
      </button>
      {choices.occasions
        .filter(([id]) => id !== "daily")
        .map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={context.occasion === id}
            onClick={() => updateContext({ occasion: id })}
          >
            {label}
          </button>
        ))}
    </div>
  );
}
export function ComparisonForm({
  query,
  context,
  choices,
  setQuery,
  updateContext,
  setError,
  ask,
  loading,
  disabled,
}: {
  query: string;
  context: Context;
  choices: Choices;
  setQuery(value: string): void;
  updateContext(value: Partial<Context>): void;
  setError(message: string): void;
  ask(): void;
  loading: boolean;
  disabled: boolean;
}) {
  return (
    <form
      className="of-ask"
      onSubmit={(e) => {
        e.preventDefault();
        void ask();
      }}
    >
      <label htmlFor="of-query">어떤 느낌으로 입을까요?</label>
      <div>
        <input
          id="of-query"
          maxLength={300}
          value={query}
          aria-label="코디 비교 요청"
          onChange={(e) => setQuery(e.target.value)}
          placeholder="아메카지로 편하게, 출근할 때 단정하게"
        />
        <button
          type="submit"
          tabIndex={0}
          className="btn go"
          disabled={disabled}
        >
          {loading ? "비교하는 중…" : "AI로 비교"}
        </button>
      </div>
      <details>
        <summary>
          계절·스타일 더 고르기 <small>선택</small>
        </summary>
        <label>
          계절
          <select
            aria-label="코디 계절"
            value={context.season || ""}
            onChange={(e) => updateContext({ season: e.target.value || null })}
          >
            <option value="">아직 정하지 않음</option>
            {choices.seasons.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <div className="of-styles" role="group" aria-label="코디 스타일">
          {choices.styles.map(([id, label]) => (
            <button
              type="button"
              key={id}
              aria-pressed={context.styles.includes(id)}
              onClick={() => {
                const next = context.styles.includes(id)
                  ? context.styles.filter((s) => s !== id)
                  : [...context.styles, id];
                if (next.length > 3) {
                  setError("스타일은 최대3개까지 함께 비교해요.");
                  return;
                }
                updateContext({ styles: next });
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </details>
      <p className="of-note">
        내 옷 사진은 기기에 두고, 기록한 정보만 AI로 비교해요.
      </p>
    </form>
  );
}
