import type { Garment, ClosetState } from "../closet/types";
export type Source = "seller" | "measured" | "chosen" | "ai";
export type AttributeKey =
  | "silhouette"
  | "fabric"
  | "thickness"
  | "surface"
  | "pattern";
export type Attribute = { value: string; source: Source; note?: string };
export type Profile = {
  v: 1;
  measures?: Record<string, { cm: number; source: Source }>;
  silhouette?: Attribute;
  fabric?: Attribute;
  thickness?: Attribute;
  surface?: Attribute;
  pattern?: Attribute;
  details?: { text: string; source: Source }[];
  purpose?: "wear" | "collect" | "both";
  series?: string;
  reference?: boolean;
  [key: string]: unknown;
};
export type ProfileGarment = Omit<Garment, "profile"> & { profile?: Profile };
export type ProfileForm = {
  measures: Record<string, string>;
  measureSources: Record<string, "measured" | "seller">;
  attributes: Record<AttributeKey, string>;
  patternNote: string;
  details: string;
  purpose: "" | "wear" | "collect" | "both";
  series: string;
  reference: boolean;
  confirmed: string[];
};
export type ProfileDraft = {
  v: 1;
  garmentId: string;
  kind: string;
  baseProfile: Profile | null;
  updatedAt: string;
  form: ProfileForm;
};
export type ProfileInfo = {
  key: string;
  measures: { id: string; label: string }[];
  attributes: {
    id: AttributeKey;
    label: string;
    choices: Record<string, string> | null;
  }[];
  sources: Record<Source, string>;
  purposes: Record<string, string>;
  facts: {
    key: string;
    label: string;
    text: string;
    source: Source;
    confirmed: boolean;
    confirmKey: string;
  }[];
  unknown: string[];
};
export interface ProfileCore {
  collectionWear?(id:string):{line:string;note:string};
  version(): number;
  subscribe(listener: () => void): () => void;
  getState(): Omit<ClosetState, "closet"> & { closet: ProfileGarment[] };
  boot?: { photos?: boolean; preview?: boolean };
  railCategory(g: Garment): string | null;
  photo(target: { id: string }): { src: string; alt: string } | null;
  assertPhotoReady(): void;
  withStorageLock<T>(run: () => T | Promise<T>): Promise<T>;
  readProfileDrafts(raw: string | null): {
    v: 1;
    edits: Record<string, ProfileDraft>;
  };
  profileEditDraft(g: ProfileGarment, at?: string): ProfileDraft;
  profileEditInfo(g: ProfileGarment): ProfileInfo;
  applyProfileEdit(d: ProfileDraft): ProfileGarment;
  reloadSaved(): void;
  updateGarment(id: string, value: { color: string | null }): void;
  removeGarment(id: string): void;
  colorChoices(): { id: string; label: string; hex: string }[];
  storageIssue(): { code: string; message: string } | null;
  closetOutfits(options: { detail: boolean; limit?: number }): {
    total: number;
    list: {
      key: string;
      title?: string;
      pieces: { garmentId?: string; label?: string }[];
    }[];
  };
}
export type ProfileHost = {
  element: HTMLElement;
  core: ProfileCore;
  storage: Storage;
  namespace: string;
  garmentId: string;
  metadata(id: string): {
    brand?: string;
    url?: string;
    source?: { provider: string; code: string };
    community?: { label: string; url?: string };
  } | null;
  close(refresh?: boolean): void;
  backup(): void;
  looks(): void;
  navigationGuard(check: () => boolean | Promise<boolean>): () => void;
};
export type ProfileSessionState = {
  draft: ProfileDraft;
  pending: ProfileDraft | null;
  blocked: string;
  notice: string;
  saving: boolean;
  committing: boolean;
  persisted: boolean;
  dirty: boolean;
  needsCleanup: boolean;
};
export interface ProfileSession {
  getSnapshot(): ProfileSessionState;
  subscribe(fn: () => void): () => void;
  restore(): void;
  change(fn: (form: ProfileForm) => void): Promise<void>;
  flush(): Promise<void>;
  retryDraft(): Promise<void>;
  restart(): Promise<void>;
  save(): Promise<{ garment: ProfileGarment; warning: string }>;
}
