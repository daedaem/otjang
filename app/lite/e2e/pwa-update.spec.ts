import { test, expect, type Page } from "@playwright/test";
const KEY = "eoul-d12-hang:v1";
test.use({ serviceWorkers: "allow" });
async function app(page: Page) {
  await page.route("**/*", route => {
    const url = new URL(route.request().url());
    if (url.origin !== "http://127.0.0.1:8792") return route.abort();
    if (url.pathname.startsWith("/api/")) return route.fulfill({status:503,contentType:"application/json",body:'{"code":"not_configured"}'});
    return route.continue();
  });
  await page.goto("/?photos=0#/");
  await page.waitForFunction(() => !!(window as any).K?.M);
  await page.evaluate(async () => {
    (window as any).K.M.addGarment({kind:"shirt",color:"white",label:"QA saved shirt"});
    await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise<void>(resolve => navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), {once:true}));
  });
  return page.evaluate(k => localStorage.getItem(k), KEY);
}
test("a new worker waits for open tabs and an unvisited screen works offline without changing saved bytes", async ({ page, request }) => {
  const raw = await app(page);
  const before = await page.evaluate(async () => ({controller:navigator.serviceWorker.controller!.scriptURL,caches:await caches.keys()}));
  await page.evaluate(() => navigator.serviceWorker.register("/sw.js?__qa_revision=next"));
  await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.waiting?.scriptURL || "")).toContain("__qa_revision=next");
  expect(await page.evaluate(() => navigator.serviceWorker.controller!.scriptURL)).toBe(before.controller);
  for (const key of before.caches) expect(await page.evaluate(() => caches.keys())).toContain(key);
  await page.unrouteAll({behavior:"wait"});
  try {
    await request.post("http://127.0.0.1:8793/stop");
    expect(await page.evaluate(() => fetch("/__qa_not_cached").then(()=>true,()=>false))).toBe(false);
    await page.evaluate(() => (window as any).K.go("photoadd",{}));
    await expect(page.locator("[data-react-photo-add]")).toBeVisible();
    await expect(page.getByRole("heading",{name:"사진으로 옷 넣기",exact:true})).toBeVisible();
    expect(await page.evaluate(k => localStorage.getItem(k),KEY)).toBe(raw);
    expect(await page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())?.waiting)).toBe(true);
  } finally { await request.post("http://127.0.0.1:8793/start"); }
});
test("visiting an account page cannot replace the offline app with authentication HTML", async ({ page, request }) => {
  const raw = await app(page);
  await page.goto("/_member/__qa");
  await expect(page.getByRole("heading",{name:"QA_AUTH_PAGE_ONLY"})).toBeVisible();
  const cached = await page.evaluate(async () => {
    const result = [];
    for (const key of await caches.keys()) { const root=await (await caches.open(key)).match("/"); if(root)result.push(await root.text()); }
    return result.join("\n");
  });
  expect(cached).not.toContain("QA_AUTH_PAGE_ONLY");
  await page.unrouteAll({behavior:"wait"});
  try {
    await request.post("http://127.0.0.1:8793/stop");
    const response = await page.goto("/?photos=0#/");
    expect(response?.fromServiceWorker()).toBe(true);
    await expect(page.locator("[data-react-home]")).toBeVisible();
    await expect(page.locator('meta[name="hangit-offline"]')).toHaveAttribute("content","1");
    expect(await page.evaluate(k => localStorage.getItem(k),KEY)).toBe(raw);
  } finally { await request.post("http://127.0.0.1:8793/start"); }
});
