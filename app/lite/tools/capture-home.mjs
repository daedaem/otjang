import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";
import { fileURLToPath } from "node:url";
const lite = fileURLToPath(new URL("../", import.meta.url)),
  work = path.resolve(lite, "../..");
const beforeDist = process.argv[2],
  out = path.resolve(
    process.argv[3] || path.join(work, "docs/log/2026-10/evidence/home"),
  );
if (!beforeDist)
  throw Error("Usage: node tools/capture-home.mjs BEFORE_DIST [OUT]");
await fs.mkdir(out, { recursive: true });
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".woff2": "font/woff2",
};
async function server(root, port) {
  const s = http.createServer(async (req, res) => {
    try {
      const u = new URL(req.url, "http://localhost"),
        file = path.resolve(
          root,
          "." +
            (u.pathname === "/"
              ? "/index.html"
              : decodeURIComponent(u.pathname)),
        );
      if (!file.startsWith(root + path.sep)) throw Error();
      const data = await fs.readFile(file);
      res.writeHead(200, {
        "content-type": types[path.extname(file)] || "application/octet-stream",
      });
      res.end(data);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((r) => s.listen(port, "127.0.0.1", r));
  return s;
}
const servers = [
  await server(path.resolve(beforeDist), 8796),
  await server(work + "/app/lite/dist", 8797),
];
const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH
    ? { executablePath: process.env.CHROMIUM_PATH }
    : {}),
  headless: true,
});
try {
  const results = [];
  for (const [label, port] of [
    ["before", 8796],
    ["after", 8797],
  ])
    for (const mode of ["empty", "owned"])
      for (const [size, width, height] of [
        ["mobile", 390, 844],
        ["desktop", 1440, 1000],
      ]) {
        const context = await browser.newContext({
            viewport: { width, height },
            deviceScaleFactor: 1,
            colorScheme: "light",
            reducedMotion: "reduce",
            serviceWorkers: "block",
          }),
          page = await context.newPage(),
          origin = "http://127.0.0.1:" + port;
        await page.route("**/*", (r) =>
          new URL(r.request().url()).origin === origin
            ? r.continue()
            : r.abort(),
        );
        await page.goto(origin + "/?photos=0#/closet");
        await page.waitForFunction(() => !!window.K?.M);
        await page.addStyleTag({
          content:
            "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}",
        });
        await page.evaluate((mode) => {
          const w = window,
            m = w.K.M;
          if (mode === "owned") {
            m.addGarment({ kind: "shirt", color: "white", label: "합성 셔츠" });
            m.addGarment({ kind: "pants", color: "black", label: "합성 바지" });
            m.addGarment({
              kind: "sneaker",
              color: "white",
              label: "합성 운동화",
            });
          }
          w.EOUL_WEATHER = () =>
            new Promise((resolve) => (w.finishWeather = resolve));
        }, mode);
        const raw = await page.evaluate(() =>
          localStorage.getItem("eoul-d12-hang:v1"),
        );
        await page.evaluate(() => window.K.tab("home"));
        await page
          .getByLabel("찾는 옷", { exact: true })
          .fill("아직 입력 중인 셔츠 질문");
        await page.waitForFunction(() => !!window.finishWeather);
        await page.evaluate(() =>
          window.finishWeather({
            place: "합성 지역",
            today: { min: 14, max: 24, rain: true, date: "2026-10-27" },
            tomorrow: { min: 9, max: 17, rain: false, date: "2026-10-28" },
          }),
        );
        await page
          .getByRole("region", { name: "오늘 날씨 코디", exact: true })
          .getByText("합성 지역", { exact: false })
          .waitFor();
        await page.evaluate(() => document.fonts.ready);
        results.push({
          file: label + "-" + mode + "-" + size + ".png",
          query: await page.locator("#q").inputValue(),
          mainUnchanged: await page.evaluate(
            (raw) => localStorage.getItem("eoul-d12-hang:v1") === raw,
            raw,
          ),
        });
        await page.locator("#q").blur();
        await page.evaluate(() => {
          scrollTo(0, 0);
          return new Promise((r) =>
            requestAnimationFrame(() => requestAnimationFrame(r)),
          );
        });
        await page.screenshot({
          path: out + "/" + label + "-" + mode + "-" + size + ".png",
          fullPage: true,
        });
        await context.close();
      }
  await fs.writeFile(
    path.join(out, "actions.json"),
    JSON.stringify(results, null, 2) + "\n",
  );
} finally {
  await browser.close();
  for (const s of servers) await new Promise((r) => s.close(r));
}
