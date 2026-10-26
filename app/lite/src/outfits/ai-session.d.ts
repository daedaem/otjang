import type { AIState, OutfitRequest, OutfitResult } from "./types";
export function createOutfitAI(options: {
  request(input: OutfitRequest): Promise<unknown>;
  accept(input: OutfitRequest, out: unknown): OutfitResult;
  clock?: () => string;
}): {
  getSnapshot(): AIState;
  subscribe(fn: () => void): () => void;
  setSource(request: OutfitRequest | null): void;
  ask(): Promise<unknown>;
  dispose(): void;
};
