import type { ProfileCore, ProfileGarment } from "../profile/types";
export type Preference = {
  purpose: null | "wear" | "collect" | "both";
  series: string;
  updatedAt: string;
};
export type CollectionBag = {
  v: 1;
  candidates: Record<string, Preference>;
  goals: { series: string; target: number }[];
};
export type Shelf = {
  name: string;
  items: ProfileGarment[];
  count: number;
  target: number | null;
  empty: number;
};
export type CollectionInfo = {
  product: null | {
    id: string;
    brand: string;
    name: string;
    priceText: string;
    url: string;
    colorFromPhoto: boolean;
  };
  purposes: Record<string, string>;
  ownedCount: number;
  shelves: Shelf[];
  axes: null | {
    summary: string;
    usage: { newOutfits: number | null; similarCount: number };
    collection: {
      series: string | null;
      owned: number;
      position: number | null;
    };
    duplicateWarning: boolean;
    similar: {
      garment: ProfileGarment;
      color: string;
      diff: {
        attrs: {
          key: string;
          label: string;
          candidate: string | null;
          owned: string | null;
          state: string;
        }[];
        onlyCandidate: string[];
        onlyOwned: string[];
        detailsUnknown: boolean;
      };
    }[];
  };
};
export interface CollectionCore extends ProfileCore {
  collectionKey: string;
  collectionSeriesKey(series: string): string;
  readCollectionSettings(raw: string | null): CollectionBag;
  collectionInfo(id: string | null, bag: CollectionBag): CollectionInfo;
  collectionWear(id: string): {
    purpose: string | null;
    expectation: string;
    count: number;
    line: string;
    note: string;
  };
}
export type CollectionState = {
  bag: CollectionBag;
  blocked: string;
  notice: string;
  saving: boolean;
  persisted: boolean;
};
export type CollectionHost = {
  element: HTMLElement;
  core: CollectionCore;
  storage: Storage;
  namespace: string;
  productId?: string;
  back(): void;
  backup(): void;
  owned(id: string): void;
  shelves(): void;
  navigationGuard(check: () => boolean | Promise<boolean>): () => void;
};
