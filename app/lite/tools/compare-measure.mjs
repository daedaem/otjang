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
const before = process.env.B3C_BASE_DIST,
  after = path.join(root, "app/lite/dist");
if (!before)
  throw Error("B3C_BASE_DIST must point to the built baseline7493826");
const output = path.join(root, "docs/log/2026-10/evidence/b3c");
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
  base: "7493826d5e77a31e75502ebb6117ef5583f24c3f",
  date: "2026-10-27",
  synthetic: true,
  externalRequests: "blocked",
  captures: [],
};
try {
  for (const [device, viewport] of [
    ["mobile", { width: 390, height: 844 }],
    ["desktop", { width: 1440, height: 1000 }],
  ])
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
      await page.clock.setFixedTime(new Date("2026-10-27T12:00:00Z"));
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
      await page.evaluate(() => {
        const m = window.K.M,
          p = m.product("ms-728000"),
          g = m.addGarment({
            kind: p.kind,
            color: "white",
            label: "합성 기준 옷",
          });
        m.updateGarmentProfile(g.id, {
          v: 1,
          reference: true,
          measures: {
            length: { cm: 70, source: "measured" },
            chest: { cm: 55, source: "measured" },
          },
        });
        window.K.go("detail", { id: "ms-728000" });
      });
      await page.evaluate(() => document.fonts.ready);
      const shot = async (state) => {
        await page.screenshot({
          path: path.join(output, `${version}-${device}-${state}.png`),
          fullPage: false,
          animations: "disabled",
        });
        manifest.captures.push(`${version}-${device}-${state}.png`);
      };
      if (version === "before") await shot("product");
      else {
        await page
          .getByRole("button", { name: "내 기준 옷과 실측 비교", exact: true })
          .click();
        await page.getByLabel("후보 총장 (cm)", { exact: true }).fill("72");
        await page.getByLabel("후보 가슴단면 (cm)", { exact: true }).fill("57");
        await page.locator("[data-measure-fact]").waitFor();
        await shot("manual");
        await page
          .getByRole("tab", { name: "사이즈표 붙여넣기", exact: true })
          .click();
        await page
          .getByLabel("후보 사이즈표 글자", { exact: true })
          .fill("사이즈 총장 가슴\nS 68 53\nM 72 57");
        await page.locator("[data-no-size-choice]").scrollIntoViewIfNeeded();
        await shot("tie");
        await page
          .getByLabel("비교할 사이즈", { exact: true })
          .selectOption("M");
        await page.locator(".mc-sketch").scrollIntoViewIfNeeded();
        await shot("diagram");
      }
      await context.close();
    }
  const files = [
    "src/measure/index.tsx",
    "src/measure/CandidateInputs.tsx",
    "src/measure/Comparison.tsx",
    "src/measure/measure.css",
    "src/measure/session.js",
    "src/measure/types.ts",
    "src/domain/measurement-draft.js",
    "src/domain/json-members.js",
    "src/domain/profile-edit.js",
    "src/core.mjs",
    "src/screen.html",
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
