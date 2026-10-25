import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';
const source = fs.readFileSync(new URL('../src/input-session.js', import.meta.url), 'utf8');
function fixture() {
  const values = new Map();
  const storage = { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v), removeItem: k => values.delete(k) };
  const context = vm.createContext({ crypto: { randomUUID } });
  vm.runInContext(source, context);
  return { values, storage, create: () => context.EOUL_INPUT_STATE.create(storage), key: context.EOUL_INPUT_STATE.KEY };
}
test('host input session keeps one draft identity across views, stages and a restored reload', () => {
  const f=fixture(), input=f.create(); input.enter({brand:'브랜드',name:'셔츠'});
  assert.equal(JSON.parse(f.values.get(f.key)).values.name,'셔츠'); // a search/OPF seed survives closing before the first edit
  input.change('kind','shirt'); input.change('color','white'); input.setStep(2);
  const id=input.values.draftId;
  input.enter(undefined,0); assert.equal(input.values.draftId,id);
  const reloaded=f.create(); reloaded.enter();
  assert.equal(reloaded.getSnapshot().pending.type,'ready');
  reloaded.restore(); assert.equal(reloaded.values.draftId,id);
  assert.equal(reloaded.values.name,'셔츠');
  assert.equal(input.finish(),undefined); assert.equal(f.values.has(f.key),false);
});
test('future or corrupt input bytes are kept until explicit restart; failed removal keeps them too', () => {
  const f=fixture(), raw='{"v":99,"future":"keep"}'; f.values.set(f.key,raw);
  const input=f.create(); input.enter(); input.change('name','overwrite'); input.setStep(2);
  assert.equal(input.getSnapshot().pending.type,'blocked'); assert.equal(f.values.get(f.key),raw);
  f.storage.removeItem=()=>{throw new Error('blocked');}; assert.throws(()=>input.restart()); assert.equal(f.values.get(f.key),raw);
});
test('pending #66 backup stash-next blocks draft writes and restart without changing persisted bytes', () => {
  const f=fixture(), input=f.create(); input.enter(); input.change('name','원본');
  const before=f.values.get(f.key); f.values.set('eoul-backup:stash-next','keep');
  input.change('name','다른 입력'); assert.equal(f.values.get(f.key),before);
  assert.match(input.getSnapshot().notice,/복원 복구/); assert.throws(()=>input.restart()); assert.equal(f.values.get(f.key),before);
});

test('host startup stays readable when the browser localStorage getter throws', () => {
  const context = vm.createContext({ crypto: { randomUUID } });
  vm.runInContext("globalThis.window=globalThis;Object.defineProperty(globalThis,'localStorage',{get(){throw new Error('SecurityError')}});",context);
  vm.runInContext(source,context);
  const page=fs.readFileSync(new URL('../src/screen.html',import.meta.url),'utf8');
  const start=page.indexOf('  const Input = '), end=page.indexOf('  const S = ',start);
  assert.ok(start>=0 && end>start);
  assert.doesNotThrow(()=>vm.runInContext(page.slice(start,end)+'globalThis.input=Input;',context));
  context.input.enter();
  assert.equal(context.input.getSnapshot().pending.type,'blocked');
  assert.match(context.input.getSnapshot().pending.message,/초안을 읽지 못했어요/);
});

test('draft length boundaries round-trip; oversized edits keep the last readable bytes and can be corrected', () => {
  const f=fixture(), input=f.create(); input.enter();
  for (const [field, limit] of [['brand',80], ['name',80], ['url',2000]]) {
    input.change(field,'x'.repeat(limit));
    const loaded=f.create(); loaded.enter(); assert.equal(loaded.getSnapshot().pending.type,'ready');
    loaded.restore(); assert.equal(loaded.values[field],'x'.repeat(limit));
    const before=f.values.get(f.key); // restore() legitimately refreshes updatedAt before the oversized edit
    input.change(field,'x'.repeat(limit+1));
    assert.equal(f.values.get(f.key),before);
    assert.equal(input.values[field].length,limit+1); // no silent truncation of the in-memory input
    assert.match(input.getSnapshot().notice,/80.*2000/);
    input.values[field]='y'.repeat(limit+1); input.changed(); // vanilla updates the shared values directly
    assert.equal(f.values.get(f.key),before); assert.equal(input.values[field].length,limit+1);
    input.change(field,'corrected');
    assert.equal(input.getSnapshot().notice,'');
    const corrected=f.create(); corrected.enter(); corrected.restore(); assert.equal(corrected.values[field],'corrected');
  }
});

test('oversized seeds cannot write an unreadable draft; already saved oversized bytes remain protected', () => {
  const f=fixture(), input=f.create(); input.enter({brand:'x'.repeat(81),name:'셔츠'});
  assert.equal(f.values.has(f.key),false); assert.equal(input.values.brand.length,81);
  assert.match(input.getSnapshot().notice,/80.*2000/);
  input.change('brand','브랜드');
  const raw=JSON.parse(f.values.get(f.key)); raw.values.name='x'.repeat(81);
  const oversized=JSON.stringify(raw); f.values.set(f.key,oversized);
  const reloaded=f.create(); reloaded.enter(); reloaded.change('name','overwrite');
  assert.equal(reloaded.getSnapshot().pending.type,'blocked'); assert.equal(f.values.get(f.key),oversized);
});
