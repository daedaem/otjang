import type { Garment, ClosetCore, ClosetState } from "../closet/types";
import type { RetailHost } from "../retail/types";
export type Product = {
  id: string;
  brand: string;
  name: string;
  kind: string;
  kindName: string;
  colorLabel: string;
  colorFromPhoto?: boolean;
  gender: string;
};
export type Fact = {
  code: string;
  brand: string;
  name: string;
  url: string;
  categories: string[];
};
export type FactData = {
  items: Fact[];
  fetchedAt: string;
  usableCount: number;
};
export type CrowdRow = {
  brand: string;
  name: string;
  kind: string;
  color: string | null;
  count: number;
  server: boolean;
  savedGarment?: Garment;
  pendingNotice?: string;
};
export interface AddCore extends ClosetCore {
  getState(): Omit<ClosetState, "closet"> & {
    gender: string;
    closet: (Garment & { detailMissing?: string; sourceLabel?: string })[];
  };
  kindChoices(): { id: string; name: string }[];
  colorChoices(): { id: string; label: string }[];
  findProducts(q: string, options: { limit: number }): Product[];
  addOwnedProduct(id: string): Garment;
  photo(g: { id: string }): null | { src: string; alt: string };
  storageIssue(): null | { code: string; message: string };
}
export type AddHost = {
  element: HTMLElement;
  core: AddCore;
  namespace: string;
  query?: string;
  back(): void;
  info(): void;
  requiredCount: number;
  legacyIssue(): string | null;
  manual(q: string): void;
  // 사진으로 옷 넣기(10-28 16:46). 없으면 버튼을 보이지 않는다.
  photoAdd?(): void;
  examples(): string[];
  shelf(): void;
  toast(text: string): void;
  own(id: string): void;
  facts(q: string, submitted: boolean): Promise<FactData>;
  fact(row: Fact): void;
  crowd(q: string): Promise<CrowdRow[]>;
  crowdKey(row: CrowdRow): string;
  ownCrowd(row: CrowdRow): Garment;
  pending: Map<string, CrowdRow>;
  finishCrowd(g: Garment): void;
  retail: RetailHost;
  navigationGuard(check: () => boolean | Promise<boolean>): () => void;
};
