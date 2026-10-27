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
      // Garment tiles and missing-item product cards are the shared screen
      // templates (piecePic/cardHtml) also used by the results grid.
      pieces?: { label: string; trial: boolean; html: string }[];
      why?: string;
      whyMore?: string;
      count?: number;
      index?: number;
      missing?: {
        label: string;
        query: string;
        heading: string;
        products: { id: string; html: string }[];
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
};
export type CoreSubscription = {
  subscribe(listener: () => void): () => void;
  version(): number;
};
