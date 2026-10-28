import { useEffect, useState } from "react";
import { OwnedPhoto } from "../photos/OwnedPhoto";
import { reactionIdentity } from "./identity.js";
import type {
  CandidateOutfit,
  ChoiceTarget,
  OutfitHost,
  ProfileGarment,
  Reaction,
} from "./types";
const identityCache = new Map<string, Promise<string>>();
export function OutfitCard({
  candidate,
  host,
  garments,
  occasion,
  selection,
  reason,
  rank,
  disabled,
  choose,
  reasons,
  facts = [],
  trial = false,
  attributeLines = [],
}: {
  candidate: CandidateOutfit;
  host: OutfitHost;
  garments: Map<string, ProfileGarment>;
  occasion: string | null;
  selection: Reaction | null;
  reason?: string;
  rank?: number;
  disabled: boolean;
  choose(target: ChoiceTarget): void;
  reasons: Record<string, string>;
  facts?: string[];
  trial?: boolean;
  attributeLines?: string[];
}) {
  const ids = candidate.pieces
      .map((p) => p.garmentId)
      .filter((id): id is string => !!id),
    key = JSON.stringify([occasion, [...ids].sort()]);
  const [identity, setIdentity] = useState<{ key: string; id: string } | null>(
      null,
    ),
    [error, setError] = useState("");
  useEffect(() => {
    if (trial) return;
    let alive = true;
    const promise = identityCache.get(key) || reactionIdentity(ids, occasion);
    identityCache.set(key, promise);
    promise.then(
      (id) => {
        if (alive) setIdentity({ key, id });
      },
      () => {
        identityCache.delete(key);
        if (alive) setError("이 브라우저에서 반응 메모를 준비하지 못했어요.");
      },
    );
    return () => {
      alive = false;
    };
  }, [key, trial]);
  const id = selection?.id || (identity?.key === key ? identity.id : null),
    blocked = disabled || !id;
  const pick = (
    verdict: "like" | "dislike",
    chips = selection?.reasons || [],
  ) => {
    if (id) choose({ candidate, identity: id, verdict, reasons: chips });
  };
  return (
    <article
      className="of-card"
      data-outfit-card={candidate.id}
      data-outfit-key={candidate.key}
    >
      <header>
        <h2>{trial ? "체험용 조합" : rank ? `AI ${rank}위` : "조합 후보"}</h2>
        <span>{candidate.formula || candidate.title || "내 옷 조합"}</span>
      </header>
      {reason && (
        <p className="of-reason" data-outfit-ai-reason>
          {reason}
        </p>
      )}
      {attributeLines.map((line, i) => (
        <p className="of-card-check" key={i} data-outfit-attribute-check>
          {line}
        </p>
      ))}
      <div className="of-pieces">
        {candidate.pieces.map((piece, index) => {
          const g = piece.garmentId ? garments.get(piece.garmentId) : null;
          return g ? (
            <button
              type="button"
              className="of-piece"
              key={g.id}
              onClick={() => host.owned(g.id)}
              aria-label={`${g.label} 옷 정보`}
            >
              <span className="of-photo">
                <OwnedPhoto g={g} host={host} />
              </span>
              <b>{g.label}</b>
            </button>
          ) : (
            <span key={"missing" + index}>
              이 옷은 현재 옷장에서 확인하지 못했어요.
            </span>
          );
        })}
      </div>
      {!trial && host.share && (
        <button
          type="button"
          className="quiet of-share"
          onClick={() =>
            host.share!(
              candidate.pieces
                .map((p) => (p.garmentId ? garments.get(p.garmentId) : null))
                .filter((g): g is ProfileGarment => !!g && !g.trial)
                .map((g) => ({ kind: g.kind, color: g.color, label: g.label.slice(0, 30) })),
            )
          }
        >
          이 코디 공유
        </button>
      )}
      {!trial && (
        <div
          className="of-reactions"
          role="group"
          aria-label="이 조합의 내 반응"
        >
          <button
            type="button"
            data-reaction="like"
            aria-pressed={selection?.verdict === "like"}
            disabled={blocked}
            onClick={() => pick("like")}
          >
            좋아요
          </button>
          <button
            type="button"
            data-reaction="dislike"
            aria-pressed={selection?.verdict === "dislike"}
            disabled={blocked}
            onClick={() => pick("dislike")}
          >
            별로예요
          </button>
        </div>
      )}
      {selection && (
        <details className="of-reason-choices">
          <summary>
            이유도 남길까요? <small>선택 · 최대5개</small>
          </summary>
          <div>
            {Object.entries(reasons).map(([chip, label]) => (
              <button
                type="button"
                key={chip}
                aria-pressed={selection.reasons.includes(chip)}
                disabled={blocked}
                onClick={() =>
                  pick(
                    selection.verdict,
                    selection.reasons.includes(chip)
                      ? selection.reasons.filter((r) => r !== chip)
                      : [...selection.reasons, chip],
                  )
                }
              >
                {label}
              </button>
            ))}
          </div>
        </details>
      )}
      {error && <p role="alert">{error}</p>}
      {facts.length > 0 && (
        <details className="of-facts">
          <summary>
            {reason ? "이번 AI 비교에 쓴 근거" : "기록과 편집 규칙"}
          </summary>
          <ul>
            {facts.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </details>
      )}
    </article>
  );
}
