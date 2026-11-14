import type { WeatherHost } from "../weather/types";
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
  // 개편 A 2단계: 새 화면에서 이 묶음이 그리는 탭 — home(오늘)·find(찾기)·me(나).
  mode?: string;
  // 개편 A 5단계: 「찾는 중」(본 옷 적어 두기·다시 찾기). 자동 알림 없음.
  watch?: {
    list(): { error: string; items: { id: string; text: string; productId: string | null; links: { url: string; label: string }[] }[] };
    add(input: { text: string }): string;
    remove(id: string): void;
  };
  find?(): void;
  consult?(): void;
  records?(): void;
  query?: string;
  proof(): Proof;
  search(q: string): void;
  remember(q: string): void;
  product(id: string): void;
  closet(): void;
  looks(): void;
  add(): void;
  check?(): void;
  compare(): void;
  clearTrial(): void;
  menu(): void;
  info(): void;
  weather: WeatherHost;
};
