import { test, expect, type Page } from "@playwright/test";
// 진단 전용(병합하지 않음, 브랜치 claude/rail-diag-20261101). adaptive.spec.ts "height change switches the layout" 검사의
// 준비 단계(결과 화면 8번째 칸을 위 150px에 두기)가 CI Chromium에서 3px 어긋난 이유를 찾는다. 스크롤 직후·준비 뒤·+100/300/600ms의
// 칸 위치와 그 사이 사건(layout-shift 원인 요소, 글꼴 로딩, scroll, resize, DOM 변경)을 남기고 항상 실패로 끝내 annotation으로 받는다.
async function start(page: Page, w: number, h: number) {
  await page.setViewportSize({ width: w, height: h });
  await page.goto("/?photos=0#/");
  await page.waitForFunction(() => !!(window as any).K?.M);
  await page.evaluate(() => { const K = (window as any).K; K.M.addGarment({ kind: "knit", slot: "m-knit", color: "navy", label: "내 니트", gender: "M" }); K.M.loadTrialCloset("M"); });
}
async function open(page: Page, v: string) {
  await page.evaluate((v) => { const K = (window as any).K; if (v === "results") K.go("results", { q: "셔츠" }); else K.tab(v); }, v);
  await page.waitForFunction((v) => (window as any).K.current().view === v, v);
  await page.waitForFunction(() => !/여는 중이에요/.test(document.getElementById("app")?.textContent || ""));
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}
for (let rep = 0; rep < 30; rep++)
  test(`diag rail ${rep}`, async ({ page }) => {
    await page.route("**/*", (r) => { const u = new URL(r.request().url()); if (u.origin !== "http://127.0.0.1:8792") return r.abort(); if (u.pathname.startsWith("/api/")) return r.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ code: "not_configured" }) }); return r.continue(); });
    await page.addInitScript(() => {
      const g = window as any; g.__ev = [];
      const log = (s: string) => g.__ev.push(`${Math.round(performance.now())} ${s}`); g.__log = log;
      document.addEventListener("DOMContentLoaded", () => {
        const st = document.createElement("style"); st.textContent = "html, body { overflow-anchor: none; }"; document.head.append(st);
        new MutationObserver((ms) => { let c = 0; const where = new Set<string>(); for (const m of ms) { c++; const t = m.target as HTMLElement; where.add((t.id ? "#" + t.id : "") + (typeof t.className === "string" ? "." + t.className.split(" ")[0] : "")); } log(`mut ${c} [${[...where].slice(0, 4).join(" ")}] sh${document.documentElement.scrollHeight}`); }).observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
      });
      try {
        new PerformanceObserver((list) => { for (const e of list.getEntries() as any[]) log(`shift ${e.value.toFixed(4)} ` + (e.sources || []).slice(0, 3).map((s: any) => { const n = s.node as HTMLElement | null; const tag = n ? (n.tagName || "#text") + (n.id ? "#" + n.id : "") + (typeof n.className === "string" && n.className ? "." + n.className.split(" ")[0] : "") : "?"; return `${tag} y${Math.round(s.previousRect.y)}→${Math.round(s.currentRect.y)} h${Math.round(s.previousRect.height)}→${Math.round(s.currentRect.height)}`; }).join(" | ")); }).observe({ type: "layout-shift", buffered: true });
      } catch (e) { log("no layout-shift api"); }
      (document as any).fonts?.addEventListener("loadingdone", (e: any) => log(`fonts loadingdone ${[...e.fontfaces].map((f: any) => f.family).join(",")}`));
      (document as any).fonts?.addEventListener("loading", (e: any) => log(`fonts loading ${[...e.fontfaces].map((f: any) => f.family).join(",")}`));
      addEventListener("scroll", () => log(`scroll sy${Math.round(scrollY)} sh${document.documentElement.scrollHeight}`), { passive: true, capture: true });
      addEventListener("resize", () => log(`resize ${innerWidth}x${innerHeight}`), true);
    });
    await start(page, 690, 600);
    await open(page, "results");
    const card = page.locator("[data-react-results] [data-card]").nth(7);
    const id = await card.getAttribute("data-card");
    const at = () => page.locator(`[data-react-results] [data-card="${id}"]`).evaluate((el) => +el.getBoundingClientRect().top.toFixed(1));
    const t0 = await card.evaluate((el) => { (window as any).__log(`--- anim ${[...document.querySelectorAll(".view")].map((v) => v.getAnimations().map((a: any) => `${a.animationName}:${a.playState}@${Math.round(a.currentTime)}`).join(";") + " tf=" + getComputedStyle(v).transform).join(" | ")} cardTop=${el.getBoundingClientRect().top.toFixed(1)}`); (window as any).__log(`--- scrollBy fonts=${(document as any).fonts?.status} faces=${[...(document as any).fonts].filter((f: any) => f.status === "loaded").map((f: any) => f.family).join(",")}`); window.scrollBy(0, el.getBoundingClientRect().top - 150); return +el.getBoundingClientRect().top.toFixed(1); });
    await page.evaluate(() => new Promise((r) => setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(r)), 50)));
    const before = await at();
    const animAfter = await page.evaluate(() => [...document.querySelectorAll(".view")].map((v) => v.getAnimations().map((a: any) => `${a.animationName}:${a.playState}@${Math.round(a.currentTime)}`).join(";") + " tf=" + getComputedStyle(v).transform).join(" | "));
    await page.evaluate(() => (window as any).__log("--- before measured"));
    await page.waitForTimeout(100); const p1 = await at();
    await page.waitForTimeout(200); const p2 = await at();
    await page.waitForTimeout(300); const p3 = await at();
    const ev: string[] = await page.evaluate(() => (window as any).__ev);
    const from = Math.max(0, ev.findIndex((e) => e.includes("--- anim")) - 4);
    const dev = Math.abs(before - 150);
    expect(`DIAG ${dev > 2 ? "DEVIATION" : "ok"} t0=${t0} before=${before} animAtBefore=[${animAfter}] +100=${p1} +300=${p2} +600=${p3} fonts=${await page.evaluate(() => (document as any).fonts?.status)}\n${ev.slice(from).slice(0, 70).join("\n")}`).toBe("(diagnostic, always fails)");
  });
