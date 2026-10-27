import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";
import { fileURLToPath } from "node:url";
const lite = fileURLToPath(new URL("../", import.meta.url)),
  work = path.resolve(lite, "../..");
const beforeDist = process.argv[2],
  out = path.resolve(
    process.argv[3] || path.join(work, "docs/log/2026-10/evidence/add-search"),
  );
if (!beforeDist)
  throw Error("Usage: node tools/capture-add-search.mjs BEFORE_DIST [OUT]");
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
  for (const [label, port] of [
    ["before", 8796],
    ["after", 8797],
  ])
    for (const [size, width, height] of [
      ["mobile", 390, 844],
      ["desktop", 1440, 1000],
    ]) {
      const context = await browser.newContext({
          viewport: { width, height },
          deviceScaleFactor: 1,
          serviceWorkers: "block",
        }),
        page = await context.newPage(),
        origin = "http://127.0.0.1:" + port;
      await page.route("**/*", (r) =>
        new URL(r.request().url()).origin === origin ? r.continue() : r.abort(),
      );
      await page.goto(origin + "/?photos=0#/closet");
      await page.waitForFunction(() => !!window.K?.M);
      const q = await page.evaluate(() => {
        const m = window.K.M;
        m.addGarment({
          kind: "pants",
          color: "black",
          label: "합성 기존 바지",
        });
        const p = m.findProducts("옥스퍼드", { limit: 1 })[0];
        window.EOUL_CROWD = {
          submit: async () => ({}),
          search: async () => ({
            items: [
              {
                brand: "합성 사용자등록",
                name: p.name,
                kind: "shirt",
                color: "blue",
                count: 3,
              },
            ],
          }),
        };
        return p.name;
      });
      await page.evaluate(() => window.K.go("add", {}));
      await page.locator("#aq").fill(q);
      await page
        .locator("#acrowd")
        .getByText("합성 사용자등록", { exact: true })
        .waitFor();
      await page
        .locator("#aopen")
        .getByText("공개 상품 정보", { exact: false })
        .first()
        .waitFor();
      await page.evaluate(() => document.fonts.ready);
      await page.locator("#aq").blur();
      await page.evaluate(() => {
        scrollTo(0, 0);
        return new Promise((r) =>
          requestAnimationFrame(() => requestAnimationFrame(r)),
        );
      });
      await page.screenshot({
        path: out + "/" + label + "-" + size + ".png",
        fullPage: true,
      });
      await context.close();
    }
} finally {
  await browser.close();
  for (const s of servers) await new Promise((r) => s.close(r));
}
