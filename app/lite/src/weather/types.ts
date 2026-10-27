import type { CardModel } from "../results/types";
import type { TileModel } from "../tiles/Tile";
// Data the screen's weatherModel() returns. The vanilla card and the React card
// draw the same model, so both screens keep the same weather rules.
export type WeatherExample = { id: string; label: string; on: boolean };
export type WeatherModel =
  | { status: "loading"; where: string }
  | {
      status: "ready";
      where: string;
      kind: "real" | "example";
      place: string;
      canPlace: boolean;
      day: "today" | "tomorrow";
      hasTomorrow: boolean;
      temp: { min: number; max: number; rain: boolean };
      failed: boolean;
      examples: WeatherExample[] | null;
      mode: "invite" | "message" | "outfit";
      message?: string;
      band?: { label: string; advice: string };
      notes?: string;
      outfit?: boolean;
      // Garment tiles (src/tiles) and missing-item product cards (the results
      // grid card), WO-08c.
      pieces?: { label: string; trial: boolean; tile: TileModel }[];
      why?: string;
      // A real good fit (not the nearest fallback): leaf green in the new look.
      good?: boolean;
      whyMore?: string;
      count?: number;
      index?: number;
      missing?: {
        label: string;
        query: string;
        heading: string;
        products: { id: string; card: CardModel }[];
      } | null;
    };
export type Place =
  | { mode: "here" }
  | { mode: "fixed"; name: string; lat: number; lon: number };
export type WeatherCtl = {
  subscribe(fn: () => void): () => void;
  getVersion(): number;
  model(where: string): WeatherModel;
  load(): void;
  setDay(day: "today" | "tomorrow"): void;
  setExample(id: string): void;
  next(): void;
  places():
    | null
    | {
        current: Place;
        presets: { name: string; lat: number; lon: number }[];
        here(): Promise<null | { lat: number; lon: number }>;
      };
  applyPlace(place: Place): void;
};
export type WeatherHost = {
  ctl: WeatherCtl;
  add(): void;
  trial(): void;
  looks(): void;
  search(q: string): void;
  reduce(): boolean;
  // Missing-item product cards (WO-08c): open the product, hang it. hang()
  // returns a short note when it could not be hung (e.g. four already hung).
  product(id: string): void;
  hang(id: string): string | null;
};
export type CoreSubscription = {
  subscribe(listener: () => void): () => void;
  version(): number;
};
