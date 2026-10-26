import type { ProfileCore, ProfileGarment } from "../profile/types";
export type Reaction = {
  id: string;
  garmentIds: string[];
  verdict: "like" | "dislike";
  reasons: string[];
  occasion: string | null;
  at: string;
};
export type ReactionBag = { v: 1; reactions: Reaction[] };
export type Context = {
  query: string;
  occasion: string | null;
  season: string | null;
  styles: string[];
};
export type OutfitRequest = {
  task: "outfit_rank";
  context: Context;
  garments: Record<string, unknown>[];
  outfits: { id: string; garmentIds: string[] }[];
  taste: {
    outfitId: string;
    likes: number;
    dislikes: number;
    reasons: { id: string; count: number }[];
  }[];
};
export type CandidateOutfit = {
  id: string;
  key: string;
  title?: string;
  formula?: string;
  pieces: { garmentId?: string | null; label?: string; role?: string }[];
};
export type Review = {
  request: OutfitRequest | null;
  candidates: CandidateOutfit[];
  total: number;
  note: string;
  reactionBasis?: string;
};
export type ProviderInfo = {
  provider: "anthropic";
  model: string;
  requestId: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
  providerRequestId?: string;
};
export type OutfitResult = {
  summary: string;
  ranking: { id: string; reason: string }[];
  attribute_check: { lines: string[]; note: string };
  ai?: ProviderInfo;
};
export type AIState = {
  phase: "empty" | "idle" | "loading" | "ready" | "error";
  result: OutfitResult | null;
  why: string;
  cached: boolean;
  receivedAt: string | null;
  sourceKey: string;
};
export type ReactionState = {
  bag: ReactionBag;
  blocked: string;
  notice: string;
  persisted: boolean;
  saving: boolean;
};
export type Suggestion = {
  id: string;
  brand: string;
  name: string;
  priceText: string;
  priceShort?: string;
  why?: string;
  reason?: string;
  photo?: { src: string; alt: string } | null;
  kindName?: string;
  colorHex?: string;
};
export type Scene = {
  text: string;
  outfitNote?: string | null;
  products: Suggestion[];
  conditions: { key: string; label: string }[];
  outfit: null | {
    buyCount: number;
    ownedCount: number;
    pieces: {
      owned: boolean;
      garmentId?: string | null;
      label: string;
      kindName: string;
      product?: Suggestion | null;
      role: string;
    }[];
  };
};
export interface OutfitCore extends ProfileCore {
  compareHas(id: string): boolean;
  compareAdd(id: string): string[];
  compareRemove(id: string): string[];
  outfitReactionsKey: string;
  readOutfitReactions(raw: string | null): ReactionBag;
  readOutfitResponse(request: OutfitRequest, out: unknown): OutfitResult;
  outfitEvidence(request: OutfitRequest): {
    outfits: { id: string; facts: string[]; reactionBasis: string }[];
  };
  reactionReasons(): Record<string, string>;
  outfitChoices(): {
    occasions: [string, string][];
    seasons: [string, string][];
    styles: [string, string][];
  };
  outfitReview(context: Partial<Context>, bag: ReactionBag): Review;
  suggest(options: { limit: number }): { basis: string; items: Suggestion[] };
  product(id: string): Suggestion | null;
}
export type OutfitHost = {
  element: HTMLElement;
  core: OutfitCore;
  storage: Storage;
  namespace: string;
  session: { query: string; context: Context; weatherOpen?: boolean };
  mood?: string;
  menu(): void;
  info(): void;
  find(): void;
  add(): void;
  trial(): void;
  owned(id: string): void;
  backup(): void;
  product(id: string): void;
  compared(id: string, added: boolean): void;
  query(q: string): void;
  scene(label: string): Scene | null;
  weather(element: HTMLElement): void;
  request(value: OutfitRequest): Promise<unknown>;
  navigationGuard(check: () => boolean | Promise<boolean>): () => void;
};
export type ChoiceTarget = {
  candidate: CandidateOutfit;
  identity: string;
  verdict: "like" | "dislike";
  reasons?: string[];
};
export type { ProfileGarment };
