import type { ClosetCore } from "../closet/types";
export type ProofProduct = {
  id: string;
  brand: string;
  name: string;
  delta: null | { text: string; tone: string };
};
export type Proof = {
  kind: "empty" | "hung" | "wardrobe";
  count: number;
  trialCount: number;
  basis: string;
  outfits: number;
  example: string;
  products: ProofProduct[];
};
export interface HomeCore extends ClosetCore {
  photo(target: { id: string }): null | { src: string; alt: string };
  examples(): string[];
}
export type HomeHost = {
  element: HTMLElement;
  core: HomeCore;
  query?: string;
  proof(): Proof;
  search(q: string): void;
  remember(q: string): void;
  product(id: string): void;
  closet(): void;
  looks(): void;
  add(): void;
  compare(): void;
  clearTrial(): void;
  menu(): void;
  info(): void;
  weather(node: HTMLElement): void;
};
