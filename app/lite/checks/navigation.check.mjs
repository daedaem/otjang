import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
function router() {
  const raw = fs.readFileSync(new URL('../src/browser/kit.js', import.meta.url), 'utf8');
  const source = raw.slice(raw.indexOf('  const stack = [];'), raw.indexOf('  // ── 알림'));
  const ctx = { location: {href:'https://local.invalid/#/measure'}, history: {replaceState(){},pushState(){},back(){}}, addEventListener(){}, requestAnimationFrame(){}, scrollY:0 };
  vm.runInNewContext(source + ';globalThis.router={start,go,back,current,setNavigationGuard};', ctx);
  ctx.router.start(()=>{}, {view:'measure',params:{}});
  return ctx.router;
}
test('a clean modal cannot bypass unsaved input underneath it', () => {
  const k=router(), calls=[];
  k.setNavigationGuard(()=>{calls.push('comparison');return false;});
  k.setNavigationGuard(()=>{calls.push('editor');return true;});
  k.back({view:'detail'});
  assert.equal(k.current().view,'measure');
  assert.deepEqual(calls,['editor','comparison']);
});
test('all guards must allow an async transition and cancellation stays on the current screen', async () => {
  const k=router(), calls=[];
  let answer;
  k.setNavigationGuard(()=>{calls.push('comparison');return new Promise(resolve=>answer=resolve);});
  k.setNavigationGuard(()=>{calls.push('editor');return Promise.resolve(true);});
  k.go('detail');
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(calls,['editor','comparison']);
  assert.equal(k.current().view,'measure');
  answer(false);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(k.current().view,'measure');
});
test('unmounting a parent before its modal never resurrects a stale guard', () => {
  const k=router();
  const parent=k.setNavigationGuard(()=>false), child=k.setNavigationGuard(()=>true);
  parent();child();
  k.go('detail');
  assert.equal(k.current().view,'detail');
});
