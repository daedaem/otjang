export type Garment = {
  id: string;
  label: string;
  kind: string;
  kindName: string;
  slot?: string | null;
  brand?: string | null;
  color: string | null;
  colorLabel: string;
  colorHex: string;
  trial: boolean;
  productId?: string | null;
  addedAt?: string | null;
  photoId?: string | null;
  // The core's picture for this garment: a bundled example photo of a trial
  // garment, or a labelled similar store photo while store photos are on.
  photo?: { src: string; alt: string; similar?: boolean; example?: boolean } | null;
  profile?: {
    v: 1;
    measures?: { length?: { cm: number; source: string } };
    series?: string;
    [key: string]: unknown;
  };
};
export type ClosetState = {
  closet: Garment[];
  closetCount: number;
  mineCount: number;
  trialCount: number;
  records: { productId: string; wearCount: number }[];
};
export interface ClosetCore {
  version(): number;
  subscribe(listener: () => void): () => void;
  getState(): ClosetState;
  boot?: { preview?: boolean; photos?: boolean };
  loadTrialCloset(): void;
  clearTrialCloset(): void;
  assertPhotoReady(): void;
  updateGarmentPhoto(id: string, photoId: string | null): Garment;
  railLayout(
    garments: Garment[],
    options: {
      sort: string;
      wearCounts: Record<string, number>;
      tallestPx: number;
    },
  ): {
    rails: { id: string; label: string; items: LayoutItem[] }[];
    shelf: LayoutItem[];
  };
  railCategory(garment: Garment): string | null;
  railSortChoices(): [string, string][];
}
export type Session = {
  sort: string;
  brand: string;
  selected: string[];
  scroll: Record<string, number>;
};
export type ClosetHost = {
  element: HTMLElement;
  core: ClosetCore;
  namespace: string;
  session: Session;
  menu(): void;
  info(): void;
  add(): void;
  quickAdd(): void;
  detail(id: string): void;
  looks(): void;
  collection(): void;
  mirror(): void;
  registration(id: string): { brand?: string } | null;
};
export type LayoutItem = { id: string; measured?: boolean; heightPx?: number };
