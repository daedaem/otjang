import { createRoot } from "react-dom/client";
import { CommunityView } from "./CommunityView";
import type { CommunityHost } from "./types";
import "./community.css";
export type { CommunityHost, CommunityClient, Piece } from "./types";

export function mount(host: CommunityHost) {
  const root = createRoot(host.element);
  root.render(<CommunityView host={host} />);
  return () => root.unmount();
}
