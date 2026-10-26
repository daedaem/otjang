// Deterministic visual evidence only: synthetic clothing and generated pixels.
// All non-local requests are aborted; no private photo or provider call is used.
import { chromium } from "@playwright/test";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const before = process.env.B2B_BASE_DIST,
  after = path.join(root, "app/lite/dist");
if (!before)
  throw Error("B2B_BASE_DIST must point to the built baseline0a9b35e");
const output = path.join(root, "docs/log/2026-10/evidence/b2b");
await fsp.mkdir(output, { recursive: true });
async function serve(folder) {
  const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(
        new URL(req.url, "http://localhost").pathname,
      ),
      file = path.resolve(
        folder,
        "." + (pathname === "/" ? "/index.html" : pathname),
      );
    if (
      !file.startsWith(path.resolve(folder) + path.sep) ||
      !fs.existsSync(file) ||
      !fs.statSync(file).isFile()
    ) {
      res.writeHead(404).end();
      return;
    }
    const types = {
      ".html": "text/html",
      ".js": "text/javascript",
      ".mjs": "text/javascript",
      ".css": "text/css",
      ".json": "application/json",
      ".woff2": "font/woff2",
      ".png": "image/png",
      ".svg": "image/svg+xml",
    };
    res.writeHead(200, {
      "Content-Type": types[path.extname(file)] || "application/octet-stream",
    });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    url: "http://127.0.0.1:" + server.address().port,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
const base = await serve(before),
  next = await serve(after),
  browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_PATH
      ? { executablePath: process.env.CHROMIUM_PATH }
      : {}),
  });
const manifest = {
  base: "0a9b35ea72ea7bba464ce64ab500674ba1484f81",
  date: "2026-10-27",
  synthetic: true,
  externalRequests: "blocked",
  captures: [],
};
try {
  for (const [device, viewport] of [
    ["mobile", { width: 390, height: 844 }],
    ["desktop", { width: 1440, height: 1000 }],
  ]) {
    for (const [version, server] of [
      ["before", base],
      ["after", next],
    ]) {
      const context = await browser.newContext({
          viewport,
          colorScheme: "light",
          locale: "ko-KR",
          reducedMotion: "reduce",
          serviceWorkers: "block",
        }),
        page = await context.newPage();
      await page.clock.install({ time: new Date("2026-10-27T12:00:00Z") });
      await page.route("**/*", (route) => {
        const u = new URL(route.request().url());
        if (u.origin !== server.url) return route.abort();
        if (u.pathname.startsWith("/api/"))
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: '{"items":[]}',
          });
        return route.continue();
      });
      await page.goto(server.url + "/?photos=0#/closet");
      await page.waitForFunction(() => !!window.K?.M);
      if (version === "after")
        await page.waitForSelector("[data-react-closet]");
      await page.evaluate(() => document.fonts.ready);
      const shot = async (state) => {
        await page.waitForFunction(() => {
          const tabs = document.getElementById("tabs");
          if (!tabs || tabs.hidden || tabs.inert) return false;
          const r = tabs.getBoundingClientRect();
          return (
            r.height > 0 &&
            r.top >= 0 &&
            r.bottom <= innerHeight + 1 &&
            tabs.querySelectorAll("button").length === 5
          );
        });
        await page.screenshot({
          path: path.join(output, `${version}-${device}-${state}.png`),
          fullPage: false,
          animations: "disabled",
        });
        manifest.captures.push(`${version}-${device}-${state}.png`);
      };
      await shot("empty");
      await page.evaluate(() => {
        const m = window.K.M;
        for (const [kind, color, label, length] of [
          ["shirt", "white", "합성 옥스퍼드 셔츠", 72],
          ["jacket", "navy", "합성 탱커 재킷", 63],
          ["pants", "beige", "합성 치노 팬츠", 102],
          ["sneaker", "white", "합성 스니커즈", null],
        ]) {
          const g = m.addGarment({ kind, color, label });
          if (length)
            m.updateGarmentProfile(g.id, {
              v: 1,
              measures: { length: { cm: length, source: "measured" } },
            });
        }
        window.K.refresh();
      });
      if (version === "after") await page.waitForSelector("[data-rail-item]");
      await page.evaluate(() => document.fonts.ready);
      await shot("owned");
      if (version === "after") {
        await page.evaluate(async () => {
          const mod = await window.EOUL_PHOTO_LOAD();
          for (const g of window.K.M.getState().closet) {
            const c = document.createElement("canvas");
            c.width = 160;
            c.height = 220;
            const x = c.getContext("2d");
            x.fillStyle = g.colorHex || "#7d8a95";
            if (g.kind === "pants") {
              x.fillRect(40, 18, 80, 40);
              x.fillRect(40, 58, 34, 150);
              x.fillRect(86, 58, 34, 150);
            } else if (g.kind === "sneaker") {
              x.fillStyle = "#d4d2cb";
              x.beginPath();
              x.moveTo(20, 110);
              x.lineTo(55, 90);
              x.lineTo(85, 115);
              x.lineTo(140, 130);
              x.lineTo(140, 155);
              x.lineTo(20, 155);
              x.fill();
            } else {
              x.beginPath();
              x.moveTo(45, 25);
              x.lineTo(65, 35);
              x.lineTo(95, 35);
              x.lineTo(115, 25);
              x.lineTo(153, 66);
              x.lineTo(130, 90);
              x.lineTo(115, 75);
              x.lineTo(115, 195);
              x.lineTo(45, 195);
              x.lineTo(45, 75);
              x.lineTo(30, 90);
              x.lineTo(7, 66);
              x.closePath();
              x.fill();
              x.strokeStyle = "#999";
              x.lineWidth = 1;
              x.beginPath();
              x.moveTo(80, 40);
              x.lineTo(80, 185);
              x.stroke();
            }
            const f = await new Promise((r) => c.toBlob(r, "image/png"));
            await mod.saveGarmentPhoto({
              core: window.K.M,
              namespace: window.EOUL_MOCK_KEY,
              garmentId: g.id,
              file: f,
              width: 160,
              height: 220,
            });
          }
        });
        await page.goto(server.url + "/?photos=1#/closet");
        await page.waitForSelector("[data-react-closet]");
        await page.waitForFunction(
          () => document.querySelectorAll("[data-rail-item] img").length > 0,
        );
        const ids = await page.evaluate(() =>
          window.K.M.getState()
            .closet.filter((g) =>
              ["shirt", "jacket", "pants", "sneaker"].includes(g.kind),
            )
            .map((g) => g.id),
        );
        for (const id of ids)
          await page.locator(`[data-rail-item="${id}"] [data-pick]`).click();
        await page.evaluate(() => {
          document
            .querySelector("#wr-assembly")
            ?.scrollIntoView({ block: "center" });
        });
        await page.waitForFunction(
          () => document.querySelectorAll(".wr-assembly img").length === 4,
        );
        await shot("assembly");
      }
      await context.close();
    }
  }
  const files = [
    "src/closet/index.tsx",
    "src/closet/closet.css",
    "src/closet/types.ts",
    "src/photos/index.js",
    "src/photos/photo-repository.js",
    "src/screen.html",
    "src/core.mjs",
    "tools/build-core.mjs",
    "build.mjs",
  ];
  manifest.sourceSha256 = Object.fromEntries(
    files.map((f) => [
      f,
      crypto
        .createHash("sha256")
        .update(fs.readFileSync(path.join(root, "app/lite", f)))
        .digest("hex"),
    ]),
  );
  await fsp.writeFile(
    path.join(output, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  console.log(JSON.stringify({ captures: manifest.captures.length, output }));
} finally {
  await browser.close();
  await base.close();
  await next.close();
}
