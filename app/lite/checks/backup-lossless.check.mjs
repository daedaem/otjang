import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { createMock } from '../src/core.mjs';

const ENGINE='eoul-d12-hang:v1', REG='eoul-d12-hang:reg', DRAFT='eoul-d12-hang:input-draft:v1', CHAT='eoul-d12-hang:consult', UI='eoul-d12-hang:ui';
const page=fs.readFileSync(new URL('../src/screen.html',import.meta.url),'utf8');
const block=page.slice(page.indexOf('  const BK = {'),page.indexOf('  function backupSheet('));
const legacy=fs.readFileSync(new URL('fixtures/backup66-block.txt',import.meta.url),'utf8');
const provenance=JSON.parse(fs.readFileSync(new URL('fixtures/backup66-provenance.json',import.meta.url)));
assert.equal(createHash('sha256').update(legacy).digest('hex'),provenance.sha256);
function storage(initial={}) {
  const values=new Map(Object.entries(initial));
  return {events:[],fault:null,get length(){return values.size;},key:i=>[...values.keys()][i]??null,getItem:k=>values.get(k)??null,
    setItem(k,v){const e={op:'set',key:k,value:String(v),index:this.events.length};this.events.push(e);if(this.fault?.(e))throw new Error('quota');values.set(k,String(v));},
    removeItem(k){const e={op:'remove',key:k,index:this.events.length};this.events.push(e);if(this.fault?.(e))throw new Error('quota');values.delete(k);},
    dump:()=>Object.fromEntries([...values.entries()].sort())};
}
function run(local,source=block) {
  const modern=createMock(),M=source===legacy?{canReadSaved(raw){try{const v=JSON.parse(raw);return v.v===1&&(v.registrations===undefined||v.registrations.v===1)&&modern.canReadSaved(raw);}catch{return false;}}}:modern;
  const scope={localStorage:local,window:{EOUL_MOCK_KEY:ENGINE},REG_KEY:REG,CHAT_KEY:CHAT,M,URL,TextEncoder};
  vm.runInNewContext(`${source}\nglobalThis.BK=BK;`,scope);return scope.BK;
}
const file=data=>JSON.stringify({app:'eoul-lite',format:1,data});
function engine(n=1){const s=storage(),m=createMock({storage:s,key:ENGINE});for(let i=0;i<n;i++)m.addGarment({kind:'shirt',color:'white'});return s.getItem(ENGINE);}
const good=()=>({[ENGINE]:engine(),[REG]:'{"items":{},"catalog":{}}',[CHAT]:'{"threads":[],"cur":null}',[UI]:'{"absent":{}}'});
const legacyGood=()=>{const data=good(),st=JSON.parse(data[ENGINE]);st.v=1;if(st.registrations)st.registrations.v=1;data[ENGINE]=JSON.stringify(st);return data;};
const broken=()=>({[ENGINE]:'{"v":99,"unknown":"옷장 원문 ☃"}',[REG]:' {"v":99,"items":{},"catalog":{},"unknown":"등록"} ',[DRAFT]:' {"v":99,"privateFuture":"초안 그대로"} ',[CHAT]:'{"threads":[{"id":"x\\" onclick=\\"bad","turns":[]}]}'});
const sourceOf=key=>key.split(':unreadable:')[0];
const archives=(data,source)=>Object.entries(data).filter(([k])=>k.includes(':unreadable:')&&(!source||sourceOf(k)===source));
const rawAt=(data,source)=>archives(data,source).map(([,v])=>v).sort();

test('lossless export quarantines damaged/future active raws with provenance and zero storage writes',()=>{
  const bad=broken(), local=storage({...bad,'eoul-extra:data':'opaque unknown'}),before=local.dump(),bk=run(local);
  const exported=bk.make();assert.equal(exported.format,2);assert.equal(exported.data['eoul-extra:data'],'opaque unknown');
  for(const [key,raw] of Object.entries(bad)){assert.equal(exported.data[key],undefined);assert.deepEqual(rawAt(exported.data,key),[raw]);}
  assert.deepEqual(local.dump(),before);assert.equal(local.events.length,0);
});
test('read and restore preview classify old files without writes, normalization or activation',()=>{
  const local=storage(good()),before=local.dump(),bk=run(local),b=bk.read(file(broken()));
  const plan=bk.prepareRestore(b.data,bk.snapshot());
  for(const key of Object.keys(broken()))assert.equal(plan.data[key],before[key]);
  assert.equal(plan.report.preserved.length,3); // no pre-existing editable draft
  assert.deepEqual(local.dump(),before);assert.equal(local.events.length,0);
});
test('empty-device restore boots without bad active keys and re-exports the exact archived strings',()=>{
  const bad=broken(),local=storage(),bk=run(local),read=bk.read(file(bad));bk.restore(read.data);
  for(const key of Object.keys(bad))assert.equal(local.getItem(key),null);
  const m=createMock({storage:local,key:ENGINE});assert.equal(m.storageIssue(),null);assert.equal(m.getState().closetCount,0);
  const second=bk.make();for(const [key,raw] of Object.entries(bad))assert.deepEqual(rawAt(second.data,key),[raw]);
});
test('quarantined incoming sources keep existing good or damaged active bytes while other keys still fully restore',()=>{
  for(const useDamaged of [false,true]) {
    const before={...good(),[DRAFT]:'{"v":99,"local":"must remain"}','eoul-d12-hang:obsolete':'old'};
    if(useDamaged){before[ENGINE]='existing bad engine';before[REG]='existing bad metadata';before[CHAT]='existing bad chat';}
    const local=storage(before),bk=run(local),incoming={...broken(),[UI]:'{"absent":{"new":true}}'};
    bk.restore(bk.read(file(incoming)).data);
    for(const key of Object.keys(broken()))assert.equal(local.getItem(key),before[key]);
    assert.equal(local.getItem(UI),incoming[UI]);assert.equal(local.getItem('eoul-d12-hang:obsolete'),null);
    for(const [key,raw] of Object.entries(broken()))assert.ok(rawAt(bk.make().data,key).includes(raw));
  }
});
test('explicit good incoming active wins, and a historical archive alone does not silently merge active values',()=>{
  const incomingReg='{"items":{"old-id":{"brand":"incoming"}},"catalog":{}}',before=good();
  const key=`${REG}:unreadable:backup-v1:1`,local=storage(before),bk=run(local);
  bk.restore(bk.read(file({[REG]:incomingReg,[key]:'bad original'})).data);assert.equal(local.getItem(REG),incomingReg);assert.equal(local.getItem(key),'bad original');
  const historical=`${REG}:unreadable:2026-10-25T00:00:00Z`,next=storage(good()),other=run(next);
  other.restore(other.read(file({[ENGINE]:engine(),[historical]:'older raw'})).data);assert.equal(next.getItem(REG),null);assert.equal(next.getItem(historical),'older raw');
});
test('file-internal archive collisions preserve both raws and repeated import/export stays bounded',()=>{
  const key=`${REG}:unreadable:backup-v1:1`,bad='{"v":99,"which":"active"}',other='older raw';
  const local=storage(),bk=run(local),input=file({[REG]:bad,[key]:other});
  for(let i=0;i<4;i++)bk.restore(bk.read(input).data);
  assert.deepEqual(rawAt(bk.make().data,REG),[bad,other].sort());assert.equal(archives(bk.make().data,REG).length,2);
});
test('target archive collisions never overwrite earlier raws; identical reimport and historical suffixes do not grow',()=>{
  const key=`${REG}:unreadable:backup-v1:1`,historical=`${REG}:unreadable:old:unreadable:opaque-tail`;
  const local=storage({...good(),[key]:'existing raw',[historical]:'old history'}),bk=run(local);
  const input=file({[key]:'incoming raw',[historical]:'different history'});
  for(let i=0;i<4;i++)bk.restore(bk.read(input).data);
  assert.equal(local.getItem(key),'existing raw');assert.equal(local.getItem(historical),'old history');
  const values=rawAt(bk.make().data,REG);assert.deepEqual(values,['existing raw','incoming raw','old history','different history'].sort());
});
test('owned-key and envelope boundaries cannot be bypassed by wrapping excluded sources',()=>{
  const bk=run(storage());
  for(const key of ['other-app:key','eoul-backup:stash','eoul-backup:stash:unreadable:backup-v1:1','eoul-weather:last:unreadable:x','eoul-x:probe:unreadable:backup-v1:1']) {
    assert.throws(()=>bk.read(file({[key]:'raw'})),key);assert.throws(()=>bk.restore({[key]:'raw'}),key);
  }
  assert.throws(()=>bk.read(file({[REG]:123})));assert.throws(()=>bk.restore({[REG]:123}));
  const duplicate='{"app":"eoul-lite","format":1,"data":{"eoul-x":"first","eoul-x":"second"}}';
  assert.throws(()=>bk.read(duplicate),/중복|모호/);
});
test('same transaction safely archives existing bad local values that normal restore explicitly replaces',()=>{
  const local=storage({[ENGINE]:'damaged local engine',[REG]:'damaged local metadata',[UI]:'old'}),bk=run(local);
  const target={[ENGINE]:engine(2),[UI]:'new'};const plan=bk.prepareRestore(target,bk.snapshot());
  assert.equal(plan.report.archivedCurrent.length,2);assert.equal(local.events.length,0);
  bk.restore(target);assert.equal(local.getItem(ENGINE),target[ENGINE]);assert.equal(local.getItem(REG),null);
  assert.ok(rawAt(bk.make().data,ENGINE).includes('damaged local engine'));assert.ok(rawAt(bk.make().data,REG).includes('damaged local metadata'));
  bk.undo();assert.equal(local.getItem(ENGINE),'damaged local engine');assert.equal(local.getItem(REG),'damaged local metadata');
});
test('5MB is UTF-8 full-envelope bytes; projected and retained post-state overflow never writes',()=>{
  const local=storage({'eoul-extra:data':'한글😀\n"\\'.repeat(20)}),bk=run(local),value=bk.make();
  const bytes=Buffer.byteLength(JSON.stringify(value));assert.ok(bytes>JSON.stringify(value).length);
  bk.MAX_BYTES=bytes;assert.doesNotThrow(()=>bk.make());assert.doesNotThrow(()=>bk.read(JSON.stringify(value)));
  bk.MAX_BYTES=bytes-1;assert.throws(()=>bk.make(),/5MB|크/);assert.throws(()=>bk.read(JSON.stringify(value)),/5MB|크/);
  const large=storage({'eoul-extra:data':'한'.repeat(1_800_000)}),largeBk=run(large);assert.equal(largeBk.MAX_BYTES,5*1024*1024);
  assert.throws(()=>largeBk.make(),/5MB|크/);assert.throws(()=>largeBk.read(file(large.dump())),/5MB|크/);assert.equal(large.events.length,0);
  const retained=storage({[`${REG}:unreadable:old`]:'x'.repeat(650)}),limited=run(retained);limited.MAX_BYTES=1000;
  assert.throws(()=>limited.restore({'eoul-extra:data':'y'.repeat(500)}),/5MB|크/);assert.equal(retained.events.length,0);
});
test('archive-write failure cleanly compensates and never reports successful restore',()=>{
  const before=good(),local=storage(before),bk=run(local);let failed=false;
  local.fault=e=>e.op==='set'&&e.key.includes(':unreadable:')&&!failed?(failed=true):false;
  assert.throws(()=>bk.restore({[ENGINE]:engine(2),[REG]:'{"v":99}'}),/바꾸지 않았어요/);
  assert.ok(failed);assert.deepEqual(local.dump(),before);assert.equal(local.getItem(bk.NEXT),null);
});
test('partial archive compensation and pending promotion preserve the original recovery point and safe archive',()=>{
  const before=good(),local=storage(before),bk=run(local);let failed=false;
  local.fault=e=>{if(e.op==='set'&&e.key.startsWith(`${CHAT}:unreadable:`)){failed=true;return true;}return failed&&e.op==='remove'&&e.key.startsWith(`${REG}:unreadable:`);};
  assert.throws(()=>bk.restore({[ENGINE]:engine(2),[REG]:'bad reg',[CHAT]:'bad chat'}),e=>e.code==='partial');
  assert.equal(bk.stash().key,bk.NEXT);const next=local.getItem(bk.NEXT);
  assert.throws(()=>bk.restore(good()),e=>e.code==='pending');assert.equal(local.getItem(bk.NEXT),next);
  local.fault=null;bk.undo();for(const [key,raw] of Object.entries(before))assert.equal(local.getItem(key),raw);
  assert.ok(archives(local.dump(),REG).some(([,v])=>v==='bad reg'));
  local.fault=e=>e.op==='set'&&e.key===bk.STASH;bk.restore({[REG]:'another bad reg'});assert.equal(bk.stash().key,bk.NEXT);
  local.fault=null;bk.undo();for(const [key,raw] of Object.entries(before))assert.equal(local.getItem(key),raw);
  assert.equal(local.getItem(bk.NEXT),null);assert.ok(rawAt(bk.make().data,REG).includes('another bad reg'));
  assert.doesNotThrow(()=>bk.restore(good()));
});
test('actual #66 round-trip is verified and cannot silently apply a new lossless format2 file',()=>{
  const bad=broken();delete bad[ENGINE];
  const original=run(storage({...legacyGood(),...bad}),legacy),oldFile=original.make();
  const destination=storage(),modern=run(destination);modern.restore(modern.read(JSON.stringify(oldFile)).data);
  for(const [key,raw] of Object.entries(bad))assert.ok(rawAt(modern.make().data,key).includes(raw));
  const legacyStore=storage(legacyGood()),older=run(legacyStore,legacy),newFile=modern.make(),before=legacyStore.dump();
  assert.equal(newFile.format,2);assert.throws(()=>older.read(JSON.stringify(newFile)));assert.deepEqual(legacyStore.dump(),before);assert.equal(legacyStore.events.length,0);
  const normalFile=run(storage(legacyGood()),legacy).make(),empty=storage(),oldEmpty=run(empty,legacy);
  oldEmpty.restore(oldEmpty.read(JSON.stringify(normalFile)).data);assert.deepEqual(JSON.parse(JSON.stringify(oldEmpty.make().data)),JSON.parse(JSON.stringify(normalFile.data)));
  const damagedEngineOld=run(storage({[ENGINE]:broken()[ENGINE]}),legacy).make();
  const modernEmpty=run(storage());assert.doesNotThrow(()=>modernEmpty.read(JSON.stringify(damagedEngineOld)));
});

test('actual #66 format1 counterexample proves why archive-preservation semantics need a version2 envelope',()=>{
  const oldReg='{"items":{"existing":{"brand":"정상"}},"catalog":{}}';
  const local=storage({[REG]:oldReg}),older=run(local,legacy),archive=`${REG}:unreadable:backup-v1:1`;
  older.restore(older.read(file({[archive]:'damaged raw'})).data);
  assert.equal(local.getItem(REG),null);assert.equal(local.getItem(archive),'damaged raw');assert.equal(older.stash().data[REG],oldReg);
  const modern=run(storage({[REG]:'bad metadata'})).make();assert.equal(modern.format,2);
});


test('new format2 archive-only provenance survives modern preview, restore, reload and repeated re-export',()=>{
  const initial={...good(),[DRAFT]:'existing bad draft'},local=storage(initial),bk=run(local);
  const outgoing=run(storage(broken())).make(),before=local.dump();
  const read=bk.read(JSON.stringify(outgoing)),plan=bk.prepareRestore(read.data,bk.snapshot());
  assert.equal(plan.report.preserved.length,4);assert.equal(local.events.length,0);assert.deepEqual(local.dump(),before);
  bk.restore(read.data);
  bk.restore(bk.read(JSON.stringify(bk.make())).data); // first export also preserves the kept damaged local raw
  const once=JSON.parse(JSON.stringify(bk.snapshot()));
  for(const key of Object.keys(broken()))assert.equal(local.getItem(key),initial[key]);
  assert.equal(local.getItem(UI),null);
  for(let i=0;i<4;i++){const reloaded=run(local),next=reloaded.make();assert.equal(next.format,2);reloaded.restore(reloaded.read(JSON.stringify(next)).data);}
  assert.deepEqual(JSON.parse(JSON.stringify(bk.snapshot())),once);
  for(const [key,raw] of Object.entries(broken()))assert.ok(rawAt(bk.make().data,key).includes(raw));
});
test('duplicate escaped member names are rejected but opaque inner JSON is never scanned as an envelope',()=>{
  const bk=run(storage());
  assert.throws(()=>bk.read('{"app":"eoul-lite","format":1,"data":{"eoul-x":"first","eoul-\\u0078":"second"}}'),/중복|모호/);
  const raw='{"x":1,"x":2,"brace":"}\\"{"}';
  assert.equal(bk.read(file({'eoul-extra:data':raw})).data['eoul-extra:data'],raw);
  const duplicateReg='{"items":{},"items":[]}';const read=bk.read(file({[REG]:duplicateReg}));
  assert.equal(read.data[REG],undefined);assert.deepEqual(rawAt(read.data,REG),[duplicateReg]);
});
test('classification projection overflow and storage-read failures never mutate or truncate',()=>{
  const raw={[REG]:'bad'},local=storage(),bk=run(local),text=file(raw);
  const projected=JSON.stringify(run(storage(raw)).make());assert.ok(Buffer.byteLength(projected)>Buffer.byteLength(text));
  bk.MAX_BYTES=Buffer.byteLength(text);assert.throws(()=>bk.read(text),/5MB|크/);assert.equal(local.events.length,0);
  bk.MAX_BYTES=Buffer.byteLength(JSON.stringify(bk.envelope(raw)));assert.throws(()=>bk.restore(raw),/5MB|크/);assert.equal(local.events.length,0);
  const failing=storage(good());failing.getItem=()=>{throw new Error('storage blocked');};const blocked=run(failing);
  assert.throws(()=>blocked.make(),/storage blocked/);assert.throws(()=>blocked.restore(good()),/storage blocked/);assert.equal(failing.events.length,0);
});


test('archive collision permutations keep the report attached to each original raw',()=>{
  const k1=`${REG}:unreadable:backup-v1:1`,k2=`${REG}:unreadable:backup-v1:2`;
  const bk=run(storage({[k1]:'A',[k2]:'B'})),plan=bk.prepareRestore({[k1]:'B',[k2]:'C'},bk.snapshot());
  assert.equal(plan.report.archives.length,2);assert.equal(new Set(plan.report.archives.map(a=>a.key)).size,2);
  assert.equal(plan.data[plan.report.archives[0].key],'B');assert.equal(plan.data[plan.report.archives[1].key],'C');
});
