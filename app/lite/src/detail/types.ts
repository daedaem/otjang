// Product detail, decision bar and compare (WO-04). The vanilla screens
// compute the same models (detailModel / decisionModel / compareModel in
// screen.html); React renders them and calls back for every change.
import type { CorePhoto, TileModel } from "../tiles/Tile";
export type Pic = {
  photo: { src: string; alt: string; flat: boolean } | null;
  core: CorePhoto | null;
};
export type Head =
  | { kind: "ask"; text: string }
  | { kind: "none"; kindName: string; josa: string }
  | { kind: "same"; n: number }
  | { kind: "new"; n: number }
  | { kind: "title"; text: string };
export type DetailModel = Pic & {
  id: string;
  brand: string;
  name: string;
  priceText: string;
  priceNote: string;
  facts: string;
  hung: boolean;
  ai: { rank: number; fit: string; reason: string } | null;
  basisLabel: string;
  head: Head;
  sub: string;
  cautions: string[];
  ask: boolean;
  // Garment and outfit-piece tiles (WO-08c: src/tiles).
  owned: { tile: TileModel; label: string }[];
  looks: {
    title: string;
    isNew: boolean;
    pieces: { me: boolean; tile: TileModel; label: string }[];
  }[];
  addLike: { kindName: string } | null;
  usedCount: number;
  used: {
    region: string;
    links: { url: string; label: string; note: string }[];
  }[];
};
export type DecisionModel = {
  id: string;
  url: string;
  decided: boolean;
  priceText: string;
  priceShort: string;
  store: string;
  status: string;
  canChange: boolean;
  canReturn: boolean;
};
type Subscription = {
  subscribe(fn: () => void): () => void;
  version(): number;
};
type Ctl = { subscribe(fn: () => void): () => void; getVersion(): number };
export type DetailHost = {
  element: HTMLElement;
  bar: HTMLElement;
  core: Subscription;
  ctl: Ctl;
  id: string;
  restoreY: number | null;
  model(): DetailModel | null;
  decision(): DecisionModel | null;
  hang(): { added: boolean; asked: boolean; note: string };
  own(yes: boolean): void;
  addLike(): void;
  zoom(): void;
  measure(): void;
  collection(): void;
  mirror(): void;
  decide(dec: "hold" | "skip"): void;
  change(): void;
  returned(): void;
  records(): void;
  seller(): void;
  back(): void;
  info(): void;
  reduce(): boolean;
};
export type CompareModel =
  | { few: true; count: number }
  | {
      few: false;
      count: number;
      note: string;
      items: (Pic & { id: string; brand: string; name: string })[];
      rows: { label: string; same: boolean; values: string[] }[];
      nSame: number;
    };
export type CompareHost = {
  element: HTMLElement;
  core: Subscription;
  ctl: Ctl;
  restoreY: number | null;
  model(): CompareModel;
  product(id: string): void;
  unhang(id: string): void;
  back(): void;
  info(): void;
};
