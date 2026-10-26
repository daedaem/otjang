import { AIInfo } from "./AIInfo";
import { useEffect, useRef } from "react";
import type { OutfitResult, AIState } from "./types";
export function AIResult({
  result,
  feedbackChanged,
  aiState,
  scope,
}: {
  result: OutfitResult;
  feedbackChanged: boolean;
  aiState: Pick<AIState, "cached" | "receivedAt">;
  scope: { total: number; compared: number };
}) {
  const node = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!document.querySelector("dialog[open],.sheet"))
      node.current?.scrollIntoView({
        block: "start",
        behavior: matchMedia("(prefers-reduced-motion:reduce)").matches
          ? "auto"
          : "smooth",
      });
  }, [result]);
  return (
    <div ref={node} className="of-ai-summary" data-outfit-ai-summary>
      <span>AI가 비교한 순서</span>
      <p className="of-note" data-outfit-comparison-scope>
        현재 만든 후보 {scope.total}개 중 {scope.compared}개 비교
      </p>
      <p>{result.summary}</p>
      <p
        className="of-note"
        data-unapplied-reactions={feedbackChanged ? "true" : "false"}
      >
        새 반응은 다음 AI 비교에 반영해요.
      </p>
      <AIInfo
        info={result.ai}
        cached={aiState.cached}
        receivedAt={aiState.receivedAt}
      />
    </div>
  );
}
export function AttributeCheck({
  result,
  lines = result.attribute_check.lines,
}: {
  result: OutfitResult;
  lines?: string[];
}) {
  return (
    <section className="of-attribute-check" aria-label="AI 속성 기록 대조">
      {lines.map((line, i) => (
        <p key={i} data-outfit-attribute-check>
          {line}
        </p>
      ))}
      <p className="of-note">{result.attribute_check.note}</p>
    </section>
  );
}
