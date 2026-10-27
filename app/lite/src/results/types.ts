import type { CorePhoto } from "../tiles/Tile";
import type { RetailHost } from "../retail/types";
// Search results screen (WO-03b). The vanilla screen computes the same models
// (resultsModel / gridModel / cardModel in screen.html); React only renders
// them and calls back for every state change.
export type Chip = { key: string; label: string; removable: boolean };
// Product objects stay opaque to React: they are passed back to host.grid().
export type Listed = { id: string };
export type ResultsModel =
  | { kind: "partial"; q: string; drop: string[]; chips: Chip[]; notice: string }
  | {
      kind: "empty";
      q: string;
      drop: string[];
      chips: Chip[];
      title: string;
      sub: string;
      relax: { title: string; drop: string[] }[];
      alts: { label: string; q: string }[];
      examples: string[] | null;
    }
  | {
      kind: "list";
      q: string;
      drop: string[];
      chips: Chip[];
      count: number;
      basis: string;
      ranked: boolean;
      summary: string;
      listNote: string;
      main: Listed[];
      off: Listed[];
      offTitle: string;
    };
export type CardModel = {
  id: string;
  brand: string;
  name: string;
  priceText: string;
  priceShort: string;
  hung: boolean;
  rank: number | null;
  dl: string;
  stop: boolean;
  tag: string;
  tagCls: string;
  photo: { src: string; alt: string; flat: boolean } | null;
  core: CorePhoto | null;
};
export type GridEntry =
  | { type: "card"; id: string; card: CardModel }
  | { type: "note"; id: string; text: string }
  | { type: "ask"; id: string; text: string; sub: string };
export type RankResult =
  | { ok: true; order: { id: string; rank: number }[]; summary: string }
  | { ok: false; why: string };
export type ResultsHost = {
  element: HTMLElement;
  core: { subscribe(fn: () => void): () => void; version(): number };
  ctl: { subscribe(fn: () => void): () => void; getVersion(): number };
  q: string;
  drop: string[];
  restoreY: number | null;
  model(): ResultsModel;
  grid(list: Listed[]): GridEntry[];
  rank(): Promise<RankResult>;
  applyRank(result: RankResult): void;
  whyText(code: string): string;
  hang(id: string): { added: boolean };
  own(id: string, yes: boolean): void;
  product(id: string): void;
  back(): void;
  edit(q: string): void;
  info(): void;
  removeCondition(key: string): void;
  relax(drop: string[]): void;
  query(q: string): void;
  reduce(): boolean;
  spring: string;
  retail: RetailHost;
};
