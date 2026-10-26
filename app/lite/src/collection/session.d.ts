import type { CollectionCore, CollectionState, Preference } from "./types";
export function createCollectionSession(options: {
  core: CollectionCore;
  storage: Storage;
  clock?: () => string;
}): {
  getSnapshot(): CollectionState;
  subscribe(fn: () => void): () => void;
  flush(): Promise<void>;
  retry(): Promise<void>;
  saveCandidate(id: string, value: Preference): Promise<void>;
  saveGoal(series: string, target: number): Promise<void>;
  removeGoal(series: string): Promise<void>;
};
