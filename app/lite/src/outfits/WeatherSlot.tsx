import { useEffect, useRef, useState } from "react";
import type { OutfitHost } from "./types";
// Preserve the existing weather controls inside a host node until its separate
// React migration. Opening this optional panel starts the weather lookup.
export function WeatherSlot({
  host,
  version,
}: {
  host: OutfitHost;
  version: number;
}) {
  const node = useRef<HTMLDivElement>(null),
    [open, setOpen] = useState(!!host.session.weatherOpen);
  useEffect(() => {
    if (open && node.current)
      try {
        host.weather(node.current);
      } catch {
        node.current.textContent = "날씨 카드를 불러오지 못했어요.";
      }
  }, [open, version]);
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
      <div ref={node} data-outfit-weather />
    </details>
  );
}
