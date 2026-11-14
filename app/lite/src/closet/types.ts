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
  photo?: {
    src: string;
    alt: string;
    similar?: boolean;
    example?: boolean;
    // Background-removed copy of a bundled example, for closet tiles.
    cut?: string;
  } | null;
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
  // 개편 A 4단계: 목표 스타일 대비 옷장 진단(core.styleGoal).
  styleGoal?(style: string): StyleGoal;
  trialGain(ids: string[]): TrialGain;
}
export type TrialVerdict = {
  id: string;
  label: string;
  verdict: "similar" | "outer" | "new" | "other_color" | "none" | "no_closet";
  similarTo: { id: string; label: string } | null;
  gain: number;
  layerable: number;
  text: string;
  tone: "good" | "dup" | "plain";
};
export type TrialGain = {
  ownedCount: number;
  before: number;
  newOutfits: number;
  layerable: number;
  items: TrialVerdict[];
};
export type Session = {
  sort: string;
  brand: string;
  toolsOpen?: boolean;
  // Closet category tab (10-30): all | outer | top | bottom | shoes. In memory only.
  cat?: string;
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
  // 개편 A 4단계(새 화면): 목표 스타일 기억(이 기기), 상품 보기, 이름으로 찾기.
  goal?: { get(): string | null; set(id: string): void };
  product?(id: string): void;
  search?(q: string): void;
};
export type StyleGoal = {
  style: { id: string; label: string; desc: string };
  choices: { id: string; label: string; desc: string }[];
  total: number;
  owned: number;
  trial: number;
  note: string;
  items: {
    slotId: string;
    name: string;
    cat: string;
    state: "owned" | "trial" | "missing";
    gain: number;
    product: { id: string; brand: string; name: string; price: number; priceText: string } | null;
  }[];
  next: StyleGoal["items"][number] | null;
};
export type LayoutItem = { id: string; measured?: boolean; heightPx?: number };
