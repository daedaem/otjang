import type { OutfitCore, Reaction, ReactionState } from "./types";
export function createReactionSession(options: {
  core: OutfitCore;
  storage: Storage;
}): {
  getSnapshot(): ReactionState;
  subscribe(fn: () => void): () => void;
  put(reaction: Reaction): Promise<void>;
  flush(): Promise<void>;
  retry(): Promise<void>;
  sync(): void;
};
