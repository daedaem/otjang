import type { MeasureCore, MeasureDraft, MeasureSessionState } from "./types";
export function createMeasureSession(options: {
  core: MeasureCore;
  storage: Storage;
  productId: string;
  clock?: () => string;
}): {
  getSnapshot(): MeasureSessionState;
  subscribe(fn: () => void): () => void;
  change(fn: (draft: MeasureDraft) => void): Promise<void>;
  flush(): Promise<void>;
  retry(): Promise<void>;
};
