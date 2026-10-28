// QA only: generated trial images and existing catalog facts, no personal data.
// Every external request is blocked; APIs return a safe unavailable response.
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
const baseline = process.argv[2];
if (!baseline) throw Error("Pass a built baseline directory");
const output = path.join(root, "docs/log/2026-10/evidence/finish-ux");
fs.mkdirSync(output, { recursive: true });
async function serve(folder) {
  const base = path.resolve(folder);
  const server = http.createServer((req, res) => {
    const file = path.resolve(
      base,
      "." +
        new URL(req.url, "http://local").pathname.replace(
          /^\/$/,
          "/index.html",
        ),
    );
    if (
      !file.startsWith(base + path.sep) ||
      !fs.existsSync(file) ||
      !fs.statSync(file).isFile()
    )
      return res.writeHead(404).end();
    const types = {
      ".html": "text/html",
      ".js": "text/javascript",
      ".mjs": "text/javascript",
      ".css": "text/css",
      ".webp": "image/webp",
      ".json": "application/json",
      ".woff2": "font/woff2",
      ".svg": "image/svg+xml",
    };
    res.writeHead(200, {
      "Content-Type": types[path.extname(file)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    url: "http://127.0.0.1:" + server.address().port,
    close: () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  };
}
const servers = [
  ["before", await serve(baseline)],
  ["after", await serve(path.join(root, "app/lite/dist"))],
];
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROMIUM_PATH
    ? { executablePath: process.env.CHROMIUM_PATH }
    : {}),
});
const manifest = {
  baseline: "ddfb776480436afb5508ec9ef64cf28fc1111564",
  synthetic: true,
  externalRequests: "blocked",
  captures: [],
};
try {
  for (const [version, server] of servers) {
    for (const device of [
      {
        name: "mobile",
        viewport: { width: 390, height: 844 },
        colorScheme: "light",
      },
      {
        name: "mobile-dark",
        viewport: { width: 390, height: 844 },
        colorScheme: "dark",
      },
      {
        name: "desktop",
        viewport: { width: 1440, height: 1000 },
        colorScheme: "light",
      },
    ]) {
      const context = await browser.newContext({
        viewport: device.viewport,
        colorScheme: device.colorScheme,
        locale: "ko-KR",
        serviceWorkers: "block",
        reducedMotion: "reduce",
      });
      const page = await context.newPage();
      await page.route("**/*", (route) => {
        const url = new URL(route.request().url());
        if (url.origin !== server.url) return route.abort();
        if (url.pathname.startsWith("/api/"))
          return route.fulfill({
            status: 503,
            contentType: "application/json",
            body: '{"code":"not_configured"}',
          });
        return route.continue();
      });
      await page.goto(server.url + "/?photos=0#/closet");
      await page.waitForFunction(() => !!window.K?.M);
      await page.evaluate(() => {
        window.K.M.loadTrialCloset("M");
        window.K.refresh();
      });
      await page
        .locator("[data-react-closet] [data-rail-item]")
        .first()
        .waitFor();
      await page.evaluate(() => document.fonts.ready);
      await page.addStyleTag({
        content:
          "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}",
      });
      await page.waitForFunction(() => {
        const i = document.querySelector(".wr img");
        return i?.complete && i.naturalWidth > 0;
      });
      const shot = async (state) => {
        await page.evaluate(() => window.scrollTo(0, 0));
        const file = version + "-" + device.name + "-" + state + ".png";
        await page.screenshot({
          path: path.join(output, file),
          animations: "disabled",
        });
        const data = fs.readFileSync(path.join(output, file));
        manifest.captures.push({
          file,
          sha256: crypto.createHash("sha256").update(data).digest("hex"),
          bytes: data.length,
        });
      };
      await shot("closet");
      await page.evaluate(() =>
        window.K.go("results", { q: "출근용 셔츠 10만원 이하" }),
      );
      await page.locator(".grid .card").first().waitFor();
      await page.evaluate(() => document.fonts.ready);
      await page.addStyleTag({
        content:
          "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}",
      });
      await shot("results");
      await context.close();
    }
  }
  fs.writeFileSync(
    path.join(output, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  console.log(JSON.stringify({ captures: manifest.captures.length, output }));
} finally {
  await browser.close();
  for (const [, s] of servers) await s.close();
}
