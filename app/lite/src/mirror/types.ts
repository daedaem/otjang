import type { ClosetCore, Garment } from "../closet/types";
export type Point = { x: number; y: number };
export type MirrorDraft = {
  v: 1;
  body: null | { photoId: string; width: number; height: number };
  heightRaw: string;
  head: Point | null;
  feet: Point | null;
  layers: { garmentId: string; dx: number; dy: number }[];
  updatedAt: string | null;
};
export type MirrorState = {
  draft: MirrorDraft;
  blocked: string;
  notice: string;
  saving: boolean;
  uploading: boolean;
  persisted: boolean;
};
export type Placement = {
  x: number;
  y: number;
  width: number;
  height: number;
  layer: number;
  assumedLength: boolean;
  note: string;
};
export interface MirrorCore extends ClosetCore {
  mirrorDraftKey: string;
  newMirrorDraft(): MirrorDraft;
  readMirrorDraft(raw: string | null): MirrorDraft;
  mirrorCalibration(draft: MirrorDraft): {
    ok: boolean;
    reason?: string;
    note: string;
  };
  mirrorPlacement(
    id: string,
    draft: MirrorDraft,
    image: { photoId: string; width: number; height: number },
  ): Placement | null;
  withStorageLock<T>(run: () => T | Promise<T>): Promise<T>;
}
export type MirrorSession = {
  subscribe(fn: () => void): () => void;
  getSnapshot(): MirrorState;
  change(
    value: Partial<MirrorDraft> | ((d: MirrorDraft) => MirrorDraft),
  ): Promise<unknown>;
  upload(file: File): Promise<unknown>;
  retry(): Promise<unknown>;
  flush(): Promise<boolean>;
  sync(): void;
  hold(): () => void;
};
export type MirrorHost = {
  element: HTMLElement;
  core: MirrorCore;
  storage: Storage;
  namespace: string;
  back(): void;
  closet(): void;
  backup(): void;
  navigationGuard(check: () => boolean | Promise<boolean>): () => void;
  candidate?: {
    id: string;
    brand: string;
    name: string;
    image?: { src: string; alt: string } | null;
  } | null;
};
export type LayerAsset = {
  src: string;
  width: number;
  height: number;
  photoId: string;
};
export type OwnLayer = {
  garment: Garment;
  asset: LayerAsset;
  placement: Placement;
};
