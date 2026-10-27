import { createRoot } from "react-dom/client";
import { Compare } from "./Compare";
import { Detail } from "./Detail";
import type { CompareHost, DetailHost } from "./types";
// WO-04 island: product detail (with the decision bar portalled into #bar)
// and the side-by-side comparison.
export function mount(host: DetailHost) {
  const root = createRoot(host.element);
  root.render(<Detail host={host} />);
  return () => root.unmount();
}
export function mountCompare(host: CompareHost) {
  const root = createRoot(host.element);
  root.render(<Compare host={host} />);
  return () => root.unmount();
}
