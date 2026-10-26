import type { ProfileCore, ProfileGarment } from "../profile/types";
export type Candidate = {
  id: string;
  kind: string;
  kindName: string;
  gender: "M" | "F";
  brand: string;
  name: string;
  priceText: string;
  priceShort?: string;
  url: string;
};
export type MeasureDraft = {
  v: 1;
  productId: string;
  kind: string;
  referenceId: string | null;
  mode: "manual" | "table";
  manual: Record<string, string>;
  source: "seller" | "measured";
  table: string;
  selected: string;
  updatedAt: string;
};
export type Comparison = {
  rows: {
    key: string;
    label: string;
    candidate: number | null;
    reference: number | null;
    diff: number | null;
  }[];
  factLine: string | null;
  sentence: string | null;
  reason: string | null;
  note: string;
  shared: number;
};
export type MeasureResult = {
  note: string;
  problems: string[];
  warnings: string[];
  hasReference: boolean;
  options: {
    label: string;
    measures: Record<string, { cm: number; source: string }>;
  }[];
  active: { label: string } | null;
  closest: {
    best: string | null;
    reason: string | null;
    ranked: { label: string; shared: number; meanDiff: number | null }[];
  };
  comparison: Comparison | null;
  sketch: {
    viewBox: string;
    candidate: { path: string; assumed: string[] };
    reference: { path: string; assumed: string[] };
  } | null;
};
export interface MeasureCore extends ProfileCore {
  product(id: string): Candidate | null;
  measurementDraft(item: Candidate): MeasureDraft;
  measurementInfo(
    id: string,
    draft?: MeasureDraft | null,
  ): MeasureResult & {
    key: string;
    product: Candidate;
    fields: { id: string; label: string }[];
    references: ProfileGarment[];
    reference: ProfileGarment | null;
  };
  calculateMeasurements(draft: MeasureDraft): MeasureResult;
  readMeasurementDrafts(raw: string | null): {
    v: 1;
    entries: Record<string, MeasureDraft>;
  };
  addGarment(input: {
    kind: string;
    gender?: "M" | "F";
    color?: string | null;
    label: string;
    profile: { v: 1; reference: boolean };
  }): ProfileGarment;
  updateGarmentProfile(
    id: string,
    value: ProfileGarment["profile"],
  ): ProfileGarment;
}
export type MeasureSessionState = {
  draft: MeasureDraft;
  blocked: string;
  notice: string;
  saving: boolean;
  persisted: boolean;
};
export type MeasureHost = {
  element: HTMLElement;
  core: MeasureCore;
  storage: Storage;
  productId: string;
  back(): void;
  editReference(id: string): void;
  backup(): void;
  navigationGuard(fn: () => boolean | Promise<boolean>): () => void;
};
