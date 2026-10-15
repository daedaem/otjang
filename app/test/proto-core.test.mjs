import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// The concept prototypes' shared core (app/proto/core.js) on the real engine,
// bundled by tools/build-proto.mjs, and every prototype folder still builds.
const root = fileURLToPath(new URL('../', import.meta.url));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'eoul-proto-test-'));
after(() => fs.rmSync(temp, { recursive: true, force: true }));

function build(dir, name) {
  const out = path.join(temp, `${name}.html`);
  execFileSync(process.execPath, [path.join(root, 'tools/build-proto.mjs'), dir, '--out', out]);
  return fs.readFileSync(out, 'utf8');
}
function boot(html) {
  const storage = new Map();
  const context = vm.createContext({
    crypto: globalThis.crypto, structuredClone, URL, URLSearchParams, Intl,
    localStorage: { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)), removeItem: (k) => storage.delete(k) },
    navigator: {}, matchMedia: () => ({ matches: false }), document: { getElementById: () => null },
  });
  vm.runInContext(html.match(/<script type="module">([\s\S]*?)<\/script>/)[1], context);
  return { Proto: context.probe, storage };
}

test('the core judges real catalog products against a real closet', () => {
  const html = build(path.join(root, 'proto/_probe'), 'probe');
  assert.match(html, /<title>probe<\/title>/);
  const { Proto, storage } = boot(html);
  assert.equal(Proto.record.started, false);

  Proto.startExample('M');
  const closet = Proto.record.garments;
  assert.ok(closet.length >= 4, 'an example closet of real catalog pieces');
  assert.ok(closet.every((g) => g.productId && Proto.photo(g)), 'every example garment has a product photo');
  assert.ok(JSON.parse(storage.get('eoul-proto:_probe')).garments.length === closet.length, 'kept in this browser');

  const candidates = Proto.candidates({ limit: 8 });
  assert.equal(candidates.length, 8);
  assert.ok(new Set(candidates.map((p) => Proto.category(p))).size >= 2, 'kinds alternate');
  assert.ok(candidates.every((p) => !Proto.owns(p)));

  const judged = candidates.map((p) => Proto.judge(p));
  const yes = judged.find((j) => j.verdict === 'yes');
  assert.ok(yes, 'at least one candidate completes an outfit');
  assert.ok(yes.looks.length >= 1 && yes.used.length >= 1 && !yes.overlaps.length);
  assert.ok(yes.looks.every((look) => look.items.some((it) => it.candidate) && look.items.some((it) => it.garment)));

  // Owning the same product turns the judgment into an overlap.
  const owned = Proto.product(closet[0].productId);
  const again = Proto.judge(owned);
  assert.equal(again.verdict, 'overlap');
  assert.equal(again.overlaps[0].productId, owned.id);

  // Deciding is recorded once per product; buying adds it to the closet here.
  Proto.decide(yes.product, 'hold');
  Proto.decide(yes.product, 'buy');
  assert.deepEqual([...Proto.record.decisions.map((d) => d.decision)], ['buy']);
  assert.ok(Proto.owns(yes.product));
  assert.ok(!Proto.candidates({ limit: 20 }).some((p) => p.id === yes.product.id));

  assert.ok(Proto.outfits().length >= 1);
  assert.equal(Proto.fromLink('https://example.com/x').error !== undefined, true);
  assert.equal(Proto.fromLink(yes.product.url).product.id, yes.product.id);
  assert.equal(Proto.esc('<b>"x"</b>'), '&lt;b&gt;&quot;x&quot;&lt;/b&gt;');

  Proto.reset();
  assert.equal(Proto.record.garments.length, 0);
});

test('every concept prototype builds into one page', () => {
  const dirs = fs.readdirSync(path.join(root, 'proto'), { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('_') && fs.existsSync(path.join(root, 'proto', d.name, 'meta.json')));
  for (const d of dirs) {
    const meta = JSON.parse(fs.readFileSync(path.join(root, 'proto', d.name, 'meta.json'), 'utf8'));
    assert.equal(meta.id, d.name);
    const html = build(d.name, d.name);
    assert.match(html, new RegExp(`<title>${meta.name}</title>`));
    assert.doesNotMatch(html, /^\s*(import|export) /m);
    new vm.Script(html.match(/<script type="module">([\s\S]*?)<\/script>/)[1]);
  }
});
