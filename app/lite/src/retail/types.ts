// Supplier panels shared by the add screen and the search results (WO-03).
// Each connector is null when the installed app does not provide it, so the
// panel is left out exactly as the vanilla screen did.
export type DomesticItem = {
  name: string;
  shop: string;
  price: string;
  image?: string | null;
  url: string;
};
export type DomesticData = {
  items: DomesticItem[];
  omitted?: number;
  fetchedAt?: string;
};
export type RakutenItem = {
  name: string;
  shop: string;
  price: number;
  taxFlag?: number;
  image?: string | null;
  url: string;
};
export type RakutenData = { items: RakutenItem[]; fetchedAt?: string };
export type OpenFact = { code: string; brand: string; name: string; url: string };
export type OpenData = { items: OpenFact[]; fetchedAt: string };
export type AiInfo = {
  model: string;
  inputTokens: number | string;
  outputTokens: number | string;
  requestId: string;
};
export type RetailerPlan = { on_topic?: boolean; keyword?: unknown; notes?: unknown };
export type OpenRank = {
  summary: string;
  ranking: { id: string; reason: string }[];
  ai?: AiInfo | null;
};
export type AiRequest =
  | { task: "retailer_search"; query: string }
  | { task: "open_rank"; query: string; items: string[] };
export type RetailHost = {
  adpick: ((q: string) => Promise<DomesticData>) | null;
  rakuten: ((q: string) => Promise<RakutenData>) | null;
  openProducts: ((q: string) => Promise<OpenData>) | null;
  ai: ((request: AiRequest) => Promise<unknown>) | null;
  whyText(code: string): string;
};
