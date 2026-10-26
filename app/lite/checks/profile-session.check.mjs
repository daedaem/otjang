import test from "node:test";
import assert from "node:assert/strict";
import { createMock } from "../src/core.mjs";
const api = await import("../src/profile/draft-session.js").catch(() => ({}));
const KEY = "eoul-d12-hang:v1",
  DRAFT = "eoul-d12-hang:profile-drafts:v1";
function fixture() {
  const map = new Map();
  let fault = () => false;
  const storage = {
    getItem: (k) => map.get(k) ?? null,
    setItem(k, v) {
      if (fault("set", k)) throw Error("quota");
      map.set(k, String(v));
    },
    removeItem(k) {
      if (fault("remove", k)) throw Error("quota");
      map.delete(k);
    },
  };
  const core = createMock({ storage, key: KEY, requireStorage: true });
  const g = core.registerGarment({
    draftId: "profile-session-garment",
    brand: "합성 브랜드",
    name: "합성 셔츠",
    kind: "shirt",
    color: "white",
    url: "",
  });
  return {
    map,
    storage,
    core,
    g,
    fault: (f) => {
      fault = f;
    },
  };
}
function session(f) {
  assert.equal(typeof api.createProfileSession, "function");
  return api.createProfileSession({
    core: f.core,
    storage: f.storage,
    garmentId: f.g.id,
    key: DRAFT,
  });
}
test("profile session opens without writes and unfinished text resumes independently of registration input", async () => {
  const f = fixture();
  f.map.set("eoul-d12-hang:input-draft:v1", "registration-original");
  const before = [...f.map],
    a = session(f);
  assert.deepEqual([...f.map], before);
  await a.change((form) => {
    form.measures.length = "72.";
  });
  const raw = f.map.get(DRAFT);
  assert.equal(
    f.map.get("eoul-d12-hang:input-draft:v1"),
    "registration-original",
  );
  const b = session(f);
  assert.equal(b.getSnapshot().pending.form.measures.length, "72.");
  b.restore();
  assert.equal(b.getSnapshot().draft.form.measures.length, "72.");
  await assert.rejects(b.save(), /총장/);
  assert.equal(f.map.get(DRAFT), raw);
  assert.equal(f.core.getState().closet[0].profile, undefined);
});
test("profile save commits once, cleanup failure reports saved state and retries without another wardrobe write", async () => {
  const f = fixture(),
    s = session(f);
  await s.change((form) => {
    form.measures.length = "72";
  });
  f.fault((op, k) => op === "remove" && k === DRAFT);
  const result = await s.save();
  assert.ok(result.warning);
  assert.equal(f.core.getState().closet[0].profile.measures.length.cm, 72);
  const core = f.map.get(KEY),
    version = f.core.version();
  f.fault(() => false);
  await s.save();
  assert.equal(f.map.get(KEY), core);
  assert.equal(f.core.version(), version);
  assert.equal(f.map.has(DRAFT), false);
});
test("a changed shared draft refuses another editors save while preserving both its visible input and newer stored draft", async () => {
  const f = fixture(),
    a = session(f);
  await a.change((form) => {
    form.measures.length = "70";
  });
  const b = session(f);
  b.restore();
  await a.change((form) => {
    form.measures.length = "72";
  });
  const raw = f.map.get(DRAFT),
    main = f.map.get(KEY);
  await b.change((form) => {
    form.measures.length = "74";
  });
  assert.equal(b.getSnapshot().draft.form.measures.length, "74");
  await assert.rejects(b.save(), (e) => e.code === "profile_draft_changed");
  assert.equal(f.map.get(DRAFT), raw);
  assert.equal(f.map.get(KEY), main);
});
test("future drafts and pending photo recovery never get cleared or overwritten by an editor", async () => {
  const f = fixture();
  f.map.set(DRAFT, ' {"v":99,"edits":{}} ');
  const s = session(f),
    before = [...f.map];
  assert.ok(s.getSnapshot().blocked);
  await assert.rejects(s.restart());
  assert.deepEqual([...f.map], before);
  f.map.delete(DRAFT);
  const next = session(f);
  f.map.set("eoul-backup:photos-pending", '{"v":1,"id":"held"}');
  await next.change((form) => {
    form.measures.length = "72";
  });
  assert.equal(f.map.has(DRAFT), false);
  await assert.rejects(next.save(), (e) => e.code === "photo_recovery_pending");
  assert.equal(f.map.get(KEY), before.find(([k]) => k === KEY)[1]);
});

test("editing again after saved-but-cleanup-failed uses the saved profile as its new baseline", async () => {
  const f = fixture(),
    s = session(f);
  await s.change((form) => {
    form.measures.length = "72";
  });
  f.fault((op, k) => op === "remove" && k === DRAFT);
  await s.save();
  await s.change((form) => {
    form.measures.chest = "56";
  });
  f.fault(() => false);
  await s.save();
  const p = f.core.getState().closet[0].profile;
  assert.equal(p.measures.length.cm, 72);
  assert.equal(p.measures.chest.cm, 56);
});
test("restarting an edit whose garment was removed keeps the existing draft original", async () => {
  const f = fixture(),
    s = session(f);
  await s.change((form) => {
    form.measures.length = "72";
  });
  const raw = f.map.get(DRAFT);
  f.core.removeGarment(f.g.id);
  await assert.rejects(s.restart());
  assert.equal(f.map.get(DRAFT), raw);
});

test('a later successful queued draft save clears the earlier temporary failure notice',async()=>{
 const f=fixture(),s=session(f);let first=true;f.fault((op,k)=>{if(first&&op==='set'&&k===DRAFT){first=false;return true;}return false;});const a=s.change(form=>{form.measures.length='71';}),b=s.change(form=>{form.measures.length='72';});await Promise.all([a,b]);await s.flush();assert.equal(s.getSnapshot().draft.form.measures.length,'72');assert.equal(s.getSnapshot().persisted,true);assert.equal(s.getSnapshot().saving,false);assert.equal(s.getSnapshot().notice,'');
});
