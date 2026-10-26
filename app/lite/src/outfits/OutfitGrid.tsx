import { OutfitCard } from "./OutfitCard";
import type {
  CandidateOutfit,
  ChoiceTarget,
  OutfitHost,
  ProfileGarment,
  Reaction,
} from "./types";
type Props = {
  candidates: CandidateOutfit[];
  host: OutfitHost;
  garments: Map<string, ProfileGarment>;
  occasion: string | null;
  selected?(ids: string[]): Reaction | null;
  disabled: boolean;
  choose?(value: ChoiceTarget): void;
  ranking?: Map<string, { rank: number; reason: string }>;
  evidence?: { id: string; facts: string[] }[];
  trial?: boolean;
  attributeLines?: string[];
};
export function attributeLinesFor(
  candidate: CandidateOutfit,
  garments: Map<string, ProfileGarment>,
  lines: string[],
) {
  return lines.filter((line) =>
    candidate.pieces.some((piece) => {
      const name = piece.garmentId
        ? garments.get(piece.garmentId)?.label
        : null;
      return !!name && line.startsWith(`확인: ${name}의 `);
    }),
  );
}
export function OutfitGrid({
  candidates,
  host,
  garments,
  occasion,
  selected,
  disabled,
  choose,
  ranking,
  evidence = [],
  trial = false,
  attributeLines = [],
}: Props) {
  return (
    <div className="of-grid">
      {candidates.map((candidate) => (
        <OutfitCard
          key={candidate.key}
          candidate={candidate}
          host={host}
          garments={garments}
          occasion={occasion}
          selection={
            trial
              ? null
              : selected?.(
                  candidate.pieces
                    .map((p) => p.garmentId)
                    .filter((id): id is string => !!id),
                ) || null
          }
          disabled={disabled}
          choose={choose || (() => {})}
          reasons={trial ? {} : host.core.reactionReasons()}
          rank={ranking?.get(candidate.id)?.rank}
          reason={ranking?.get(candidate.id)?.reason}
          facts={evidence.find((e) => e.id === candidate.id)?.facts}
          trial={trial}
          attributeLines={attributeLinesFor(
            candidate,
            garments,
            attributeLines,
          )}
        />
      ))}
    </div>
  );
}
