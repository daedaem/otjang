import type { Page } from "@playwright/test";
// Shared checks for the adaptive layout specs (11-01). Representative window sizes in CSS px, not devices.
// Controls inside the screen (or the open sheet) that sit under fixed chrome after scrolling to the end.
// Every <details> is opened first so content that only shows when expanded is checked too, and controls the
// browser does not render (inside a closed <details>, display/visibility hidden) are skipped: a closed
// details still reports a layout box in Chromium, which made the first version report the folded 중고로 찾기
// links on the product page although nothing was visible there (review 11-01). Each control is hit-tested
// at three points (3px inside its top and bottom edges, and its centre), so a bar that hides only the top
// or bottom part of a control still fails.
export const covered = (page: Page) =>
  page.evaluate(() => {
    const sheet = document.querySelector<HTMLElement>(".sheet");
    const scope = sheet || document.getElementById("app") || document.getElementById("community")!;
    scope.querySelectorAll("details").forEach((d) => ((d as HTMLDetailsElement).open = true));
    window.scrollTo(0, document.documentElement.scrollHeight);
    if (sheet) sheet.scrollTop = sheet.scrollHeight;
    const out: string[] = [];
    for (const c of scope.querySelectorAll<HTMLElement>("button, a[href], input, select, textarea")) {
      const s = getComputedStyle(c);
      if (s.display === "none" || s.visibility === "hidden") continue;
      if (typeof c.checkVisibility === "function" && !c.checkVisibility({ contentVisibilityAuto: true, visibilityProperty: true })) continue;
      const r = c.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      let box = { l: r.left, t: r.top, rr: r.right, b: r.bottom };
      // Clip by scrolling/clipping ancestors so hidden-by-scroll parts do not count.
      for (let p = c.parentElement; p && p !== document.body; p = p.parentElement) {
        const ps = getComputedStyle(p);
        if (/(auto|scroll|hidden|clip)/.test(ps.overflow + ps.overflowX + ps.overflowY)) {
          const q = p.getBoundingClientRect();
          box = { l: Math.max(box.l, q.left), t: Math.max(box.t, q.top), rr: Math.min(box.rr, q.right), b: Math.min(box.b, q.bottom) };
        }
      }
      box = { l: Math.max(box.l, 0), t: Math.max(box.t, 0), rr: Math.min(box.rr, innerWidth), b: Math.min(box.b, innerHeight) };
      if (box.rr - box.l < 4 || box.b - box.t < 8) continue;
      const x = (box.l + box.rr) / 2;
      for (const y of [box.t + 3, (box.t + box.b) / 2, box.b - 3]) {
        const hit = document.elementFromPoint(x, y);
        if (!hit || c.contains(hit) || hit.contains(c)) continue;
        let f: HTMLElement | null = hit as HTMLElement;
        while (f && f !== document.body && getComputedStyle(f).position !== "fixed") f = f.parentElement;
        if (f && f !== document.body && !scope.contains(f) && !f.contains(scope)) {
          out.push(`${(c.textContent || c.getAttribute("aria-label") || c.tagName).trim().slice(0, 20)} @${Math.round(y)} ← ${f.className || f.id}`);
          break;
        }
      }
    }
    window.scrollTo(0, 0);
    return out;
  });
export const overflowX = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
export const rect = (page: Page, sel: string) =>
  page.locator(sel).first().evaluate((e) => {
    const b = e.getBoundingClientRect();
    return { x: b.x, y: b.y, w: b.width, h: b.height, r: b.right, b: b.bottom };
  });
// Change the window size and hand the page to the checks only after the layout script (src/browser/viewport.js)
// has handled that size. The browser can deliver the resize event a few frames after the new layout is already
// measurable; WebKit did in CI run 41281268565 (#148), and the long consult check at 690×840 then measured before
// the script had re-measured the bottom bars or put the scroll position back (추정, adaptive-resize.spec.ts
// repeats it with resize held back 300ms). Two animation frames after setViewportSize were not enough. A resize
// listener added here, after the script's own, records the size it was called for: listeners run in the order
// they were added, so once it reports the new size the script's handler has run as well, and two more frames let
// the measurement it schedules land. The checks that follow are unchanged.
export async function resizeTo(page: Page, width: number, height: number) {
  const same = await page.evaluate(([w, h]) => {
    const g = window as any;
    if (g.__adaptiveSeen === undefined) {
      g.__adaptiveSeen = `${innerWidth}x${innerHeight}`;
      addEventListener("resize", () => { g.__adaptiveSeen = `${innerWidth}x${innerHeight}`; });
    }
    return innerWidth === w && innerHeight === h;
  }, [width, height]);
  await page.setViewportSize({ width, height });
  if (!same) await page.waitForFunction((size) => (window as any).__adaptiveSeen === size, `${width}x${height}`);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}
