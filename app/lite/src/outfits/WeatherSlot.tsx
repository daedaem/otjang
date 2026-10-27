import { useState } from "react";
import { WeatherCard } from "../weather/WeatherCard";
import type { OutfitHost } from "./types";
// The optional weather panel of the outfits screen. It renders the shared React
// weather card (WO-02) only while open; opening it starts the weather lookup.
export function WeatherSlot({ host }: { host: OutfitHost; version?: number }) {
  const [open, setOpen] = useState(!!host.session.weatherOpen);
  return (
    <details
      className="of-weather"
      open={open}
      onToggle={(event) => {
        const next = event.currentTarget.open;
        host.session.weatherOpen = next;
        setOpen(next);
      }}
    >
      <summary>
        오늘·내일 날씨 코디 <small>열어서 보기</small>
      </summary>
      <div data-outfit-weather>
        {open && <WeatherCard host={host.weather} core={host.core} where="looks" />}
      </div>
    </details>
  );
}
