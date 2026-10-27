import { DomesticPanel } from "./DomesticPanel";
import { OpenProductsPanel } from "./OpenProductsPanel";
import { RakutenPanel } from "./RakutenPanel";
import type { RetailHost } from "./types";
// The supplier sections below a search, in the vanilla order: domestic
// offers, public product facts (results only), then Rakuten. Keyed by the
// query so a new search starts fresh and an old answer cannot leak in.
export function RetailPanels({
  host,
  query,
  facts = false,
}: {
  host: RetailHost;
  query: string;
  facts?: boolean;
}) {
  const text = query.trim();
  if (!text) return null;
  return (
    <div style={{ display: "contents" }} data-react-retail>
      <DomesticPanel key={`d:${text}`} host={host} query={text} />
      {facts && <OpenProductsPanel key={`o:${query}`} host={host} query={query} />}
      <RakutenPanel key={`r:${text}`} host={host} query={text} />
    </div>
  );
}
export type { RetailHost } from "./types";
