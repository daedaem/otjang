import { createRoot } from "react-dom/client";
import { PlaceSheet } from "../weather/PlaceSheet";
import type { WeatherHost } from "../weather/types";
import { openSheet, type SheetHost } from "./sheet";
import {
  AddByKind,
  ColorSheet,
  Confirm,
  Decision,
  Disclose,
  Menu,
  ReturnReasons,
} from "./sheets";
// WO-08 chrome island. open() shows one shared sheet; screen.html keeps the
// state changes (core commands, refresh, toasts) in the props it passes.
type Props = Record<string, unknown>;
export function open(name: string, props: Props, host: SheetHost) {
  const p = props as never;
  switch (name) {
    case "disclose":
      return openSheet(host, (close) => <Disclose {...(p as object as Parameters<typeof Disclose>[0])} close={close} />);
    case "menu":
      return openSheet(host, (close) => <Menu {...(p as object as Parameters<typeof Menu>[0])} close={close} />);
    case "confirm":
      return openSheet(host, (close) => <Confirm {...(p as object as Parameters<typeof Confirm>[0])} close={close} />);
    case "color":
      return openSheet(host, (close) => <ColorSheet {...(p as object as Parameters<typeof ColorSheet>[0])} close={close} />);
    case "add-kind":
      return openSheet(host, (close) => <AddByKind {...(p as object as Parameters<typeof AddByKind>[0])} close={close} />);
    case "return":
      return openSheet(host, (close) => <ReturnReasons {...(p as object as Parameters<typeof ReturnReasons>[0])} close={close} />);
    case "decision":
      return openSheet(host, (close) => <Decision {...(p as object as Parameters<typeof Decision>[0])} close={close} />);
    case "place": {
      // The weather place dialog from WO-02, opened from the menu.
      const wrap = document.createElement("div");
      document.body.appendChild(wrap);
      const root = createRoot(wrap);
      const close = () => {
        root.unmount();
        wrap.remove();
      };
      root.render(<PlaceSheet host={(props as { weather: WeatherHost }).weather} onClose={close} />);
      return close;
    }
    default:
      throw Error(`unknown sheet ${name}`);
  }
}
