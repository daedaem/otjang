// Fixed synthetic state. Retailer images/APIs and private photos are blocked.
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const before = process.env.B4_BASE_DIST,
  after = path.join(root, "app/lite/dist");
if (!before) throw Error("B4_BASE_DIST must be the built master1a401f1");
const output = path.join(root, "docs/log/2026-10/evidence/b4");
fs.mkdirSync(output, { recursive: true });
async function serve(folder) {
  const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(
        new URL(req.url, "http://local.invalid").pathname,
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
    const type = {
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
      "Content-Type": type[path.extname(file)] || "application/octet-stream",
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
  base: "1a401f1bcc936505085bb031044a10cccd3dc313",
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
          locale: "ko-KR",
          colorScheme: "light",
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
        const m = window.K.M;
        for (const [color, label] of [
          ["white", "내 첫 셔츠"],
          ["navy", "내 둘째 셔츠"],
        ])
          m.addGarment({
            kind: "shirt",
            color,
            label,
            profile: { v: 1, purpose: "collect", series: "My Archive" },
          });
        window.K.tab("closet");
      });
      await page.evaluate(() => document.fonts.ready);
      const shot = async (state) => {
        const filename = `${version}-${device}-${state}.png`;
        await page.screenshot({
          path: path.join(output, filename),
          fullPage: true,
          animations: "disabled",
        });
        manifest.captures.push(filename);
      };
      if (version === "before") await shot("closet");
      await page.evaluate(() => window.K.go("detail", { id: "ms-728000" }));
      if (version === "before") await shot("product");
      else {
        await page
          .getByRole("button", { name: "활용·소장 가치 비교 →", exact: true })
          .click();
        await page.getByRole("button", { name: "소장", exact: true }).click();
        await page
          .getByLabel("후보 시리즈 이름", { exact: true })
          .fill("My Archive");
        await page.locator('[data-collection-saved="true"]').waitFor();
        await shot("candidate");
        await page
          .getByRole("button", { name: "내 진열장 보기 →", exact: true })
          .click();
        await page.getByText("목표 직접 정하기", { exact: true }).click();
        await page
          .getByLabel("목표 시리즈 이름", { exact: true })
          .fill("My Archive");
        await page.getByLabel("진열 목표 수량", { exact: true }).fill("5");
        await page
          .getByRole("button", { name: "목표 저장", exact: true })
          .click();
        await page.locator("[data-empty-slot]").first().waitFor();
        await shot("shelves");
      }
      await context.close();
    }
  const files = [
    "src/collection/index.tsx",
    "src/collection/CandidateValue.tsx",
    "src/collection/Shelves.tsx",
    "src/collection/session.js",
    "src/collection/collection.css",
    "src/collection/types.ts",
    "src/domain/collection-settings.js",
    "src/domain/collection-value.js",
    "src/core.mjs",
    "src/screen.html",
    "src/closet/index.tsx",
    "src/profile/Summary.tsx",
    "build.mjs",
  ];
  manifest.sourceSha256 = Object.fromEntries(
    files.map((file) => [
      file,
      crypto
        .createHash("sha256")
        .update(fs.readFileSync(path.join(root, "app/lite", file)))
        .digest("hex"),
    ]),
  );
  fs.writeFileSync(
    path.join(output, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  console.log(JSON.stringify({ captures: manifest.captures.length, output }));
} finally {
  await browser.close();
  await base.close();
  await next.close();
}
