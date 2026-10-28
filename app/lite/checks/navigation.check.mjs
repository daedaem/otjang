import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
function router({ external = false, boards = false } = {}) {
  const raw = fs.readFileSync(
    new URL("../src/browser/kit.js", import.meta.url),
    "utf8",
  );
  const source = raw.slice(
    raw.indexOf("  const stack = [];"),
    raw.indexOf("  // ── 알림"),
  );
  const events = {};
  const ctx = {
    location: { href: "https://local.invalid/#/measure" },
    history: {
      state: null,
      replaceState(state, _title, href) {
        this.state = state;
        if (href) ctx.location.href = href;
      },
      pushState(state, _title, href) {
        this.state = state;
        if (href) ctx.location.href = href;
      },
      back() {},
    },
    addEventListener(type, run) {
      events[type] = run;
    },
    requestAnimationFrame() {},
    scrollY: 0,
  };
  vm.runInNewContext(
    source + ";globalThis.router={start,go,back,current,setNavigationGuard};",
    ctx,
  );
  ctx.router.start(
    (view, params = {}) => {
      const query = new URLSearchParams();
      if (boards && view === "community") {
        if (params.board && params.board !== "outfits") query.set("board", params.board);
        if (params.mine) query.set("mine", params.mine);
      }
      const suffix = query.toString();
      ctx.location.href = "https://local.invalid/#/" + view + (suffix ? "?" + suffix : "");
    },
    { view: "measure", params: {} },
    external
      ? {
          externalRoute: () => {
            if (!boards) return ctx.location.href.endsWith("#/community") ? { view: "community", params: {} } : null;
            const [path, query = ''] = ctx.location.href.split('#')[1].split('?');
            const p = new URLSearchParams(query);
            return path === '/community' ? { view: 'community', params: { board: p.get('board') || 'outfits', mine: p.get('mine') || undefined } } : null;
          },
          ...(boards ? { sameExternalRoute: (a, b) => a.view === b.view && (a.params.board || 'outfits') === (b.params.board || 'outfits') && (a.params.mine || '') === (b.params.mine || '') } : {}),
        }
      : {},
  );
  return Object.assign(ctx.router, { ctx, events });
}
test("a clean modal cannot bypass unsaved input underneath it", () => {
  const k = router(),
    calls = [];
  k.setNavigationGuard(() => {
    calls.push("comparison");
    return false;
  });
  k.setNavigationGuard(() => {
    calls.push("editor");
    return true;
  });
  k.back({ view: "detail" });
  assert.equal(k.current().view, "measure");
  assert.deepEqual(calls, ["editor", "comparison"]);
});
test("all guards must allow an async transition and cancellation stays on the current screen", async () => {
  const k = router(),
    calls = [];
  let answer;
  k.setNavigationGuard(() => {
    calls.push("comparison");
    return new Promise((resolve) => (answer = resolve));
  });
  k.setNavigationGuard(() => {
    calls.push("editor");
    return Promise.resolve(true);
  });
  k.go("detail");
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls, ["editor", "comparison"]);
  assert.equal(k.current().view, "measure");
  answer(false);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(k.current().view, "measure");
});
test("unmounting a parent before its modal never resurrects a stale guard", () => {
  const k = router();
  const parent = k.setNavigationGuard(() => false),
    child = k.setNavigationGuard(() => true);
  parent();
  child();
  k.go("detail");
  assert.equal(k.current().view, "detail");
});

test("same-address input steps still go Back when explicit community addresses are enabled", () => {
  const k = router({ external: true });
  k.go("reg", { step: 0 });
  k.go("reg", { step: 1 });
  k.ctx.history.state = { k: 2 };
  k.events.popstate({ state: { k: 2 } });
  assert.equal(k.current().view, "reg");
  assert.equal(k.current().params.step, 0);
});
test("external community navigation cannot bypass an unsaved guard", () => {
  const k = router({ external: true });
  k.go("detail");
  let checked = 0;
  k.setNavigationGuard(() => {
    checked++;
    return false;
  });
  k.ctx.location.href = "https://local.invalid/#/community";
  k.ctx.history.state = null;
  k.events.popstate({ state: null });
  k.events.hashchange();
  assert.equal(k.current().view, "detail");
  assert.equal(k.ctx.location.href, "https://local.invalid/#/detail");
  assert.equal(checked, 1);
});
test("popstate and hashchange share one pending guard and do not duplicate the transition", async () => {
  const k = router({ external: true });
  let answer,
    checked = 0;
  k.setNavigationGuard(() => {
    checked++;
    return new Promise((resolve) => {
      answer = resolve;
    });
  });
  k.ctx.location.href = "https://local.invalid/#/community";
  k.ctx.history.state = null;
  k.events.popstate({ state: null });
  k.events.hashchange();
  assert.equal(checked, 1);
  answer(true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(k.current().view, "community");
  assert.equal(k.ctx.history.state.k, 2);
  k.events.popstate({ state: null });
  assert.equal(k.current().view, "community");
  assert.equal(checked, 1);
});

test('same-view community board and mine addresses restore Back/Forward without losing the outfit share', () => {
  const k = router({ external: true, boards: true });
  k.go('community', { board: 'outfits', share: ['PUBLIC_SHARE'] });
  k.ctx.location.href = 'https://local.invalid/#/community?board=free&mine=1';
  k.ctx.history.state = null; k.events.hashchange();
  assert.equal(k.current().params.board, 'free');
  assert.equal(k.current().params.mine, '1');
  k.ctx.location.href = 'https://local.invalid/#/community';
  k.ctx.history.state = { k: 2 }; k.events.popstate({ state: { k: 2 } }); k.events.hashchange();
  assert.equal(k.current().params.board, 'outfits');
  assert.deepEqual(k.current().params.share, ['PUBLIC_SHARE']);
  k.ctx.location.href = 'https://local.invalid/#/community?board=free&mine=1';
  k.ctx.history.state = { k: 3 }; k.events.popstate({ state: { k: 3 } }); k.events.hashchange();
  assert.equal(k.current().params.board, 'free');
  assert.equal(k.ctx.history.state.k, 3);
});

test('same-view board changes wait for one async guard and go to the requested board', async () => {
  const k = router({ external: true, boards: true });
  k.go('community', { board: 'outfits' });
  let answer, checked = 0;
  k.setNavigationGuard(() => { checked++; return new Promise(resolve => answer = resolve); });
  k.ctx.location.href = 'https://local.invalid/#/community?board=sale';
  k.ctx.history.state = null; k.events.popstate({ state: null }); k.events.hashchange();
  assert.equal(checked, 1);
  answer(true); await new Promise(resolve => setImmediate(resolve));
  assert.equal(k.current().view, 'community');
  assert.equal(k.current().params.board, 'sale');
});
