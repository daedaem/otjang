import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';
import { createMock } from '../src/core.mjs';
const KEY='eoul-d12-hang:v1',DRAFT='eoul-d12-hang:input-draft:v1';
const profile=(n=72)=>({v:1,measures:{length:{cm:n,source:'measured'},chest:{cm:55,source:'seller'}},fabric:{value:'옥스퍼드',source:'seller'},silhouette:{value:'regular',source:'chosen'}});
const input=(draftId='profile-draft-abcdefgh',p=profile())=>({draftId,brand:'합성 브랜드',name:'실측 셔츠',kind:'shirt',color:'white',url:'',profile:p});
function fixture(initial={}){const map=new Map(Object.entries(initial));let fail=false,writes=0;const storage={get length(){return map.size;},key:i=>[...map.keys()][i]??null,getItem:k=>map.get(k)??null,setItem(k,v){writes++;if(fail)throw Error('quota');map.set(k,String(v));},removeItem(k){writes++;if(fail)throw Error('quota');map.delete(k);}};const options={storage,key:KEY,requireStorage:true};return {storage,map,options,get writes(){return writes;},fail:x=>fail=x,m:createMock(options)};}
const page=fs.readFileSync(new URL('../src/screen.html',import.meta.url),'utf8'),block=page.slice(page.indexOf('  const BK = {'),page.indexOf('  function backupSheet('));
function backup(f){const ctx={TextEncoder,URL,localStorage:f.storage,window:{EOUL_MOCK_KEY:KEY},REG_KEY:'eoul-d12-hang:reg',CHAT_KEY:'eoul-d12-hang:consult',M:f.m};vm.runInNewContext(block+';globalThis.bk=BK',ctx);return ctx.bk;}

test('B1 old v1 opens without writes; first explicit change upgrades in memory to snapshot2',()=>{
 const source=fixture();source.m.addGarment({kind:'shirt',color:'white'});const old=JSON.parse(source.map.get(KEY));old.v=1;old.annotation={keep:'unknown root attribute'};
 const raw=` ${JSON.stringify(old)} \n`,f=fixture({[KEY]:raw});assert.equal(f.m.getState().closetCount,1);assert.equal(f.map.get(KEY),raw);assert.equal(f.writes,0);
 f.m.setGender('F');const stored=JSON.parse(f.map.get(KEY));assert.equal(stored.v,2);assert.deepEqual(stored.annotation,old.annotation);assert.equal(stored.garments[0].profile,undefined);
});
test('B1 profile, metadata and receipt persist in one write, survive reload and do not leak mutable views',()=>{
 const f=fixture(),before=f.writes,g=f.m.registerGarment(input());assert.equal(f.writes-before,1);assert.deepEqual(g.profile,profile());
 const saved=JSON.parse(f.map.get(KEY));assert.equal(saved.v,2);assert.equal(saved.registrations.v,2);assert.deepEqual(saved.garments[0].profile,profile());assert.deepEqual(saved.registrations.receipts[0].input.profile,profile());
 const loaded=createMock(f.options),view=loaded.getState().closet[0];assert.deepEqual(view.profile,profile());assert.equal(view.brand,'합성 브랜드');assert.equal(view.addedAt,saved.garments[0].createdAt);view.profile.measures.length.cm=999;
 assert.equal(loaded.getState().closet[0].profile.measures.length.cm,72);assert.equal(f.map.get(KEY),JSON.stringify(saved));
});
test('B1 same draft retries once; different profile with same identity conflicts without writes',()=>{
 const f=fixture(),a=f.m.registerGarment(input()),raw=f.map.get(KEY),writes=f.writes;assert.equal(f.m.registerGarment(input()).id,a.id);assert.equal(f.writes,writes);
 assert.throws(()=>f.m.registerGarment(input(undefined,profile(73))),e=>e.code==='registration_conflict');assert.equal(f.map.get(KEY),raw);assert.equal(f.writes,writes);
});
test('B1 profile edits and reference switch commit atomically; failed writes preserve raw, version and subscribers',()=>{
 const f=fixture(),a=f.m.registerGarment(input()),b=f.m.registerGarment(input('profile-draft-ijklmnop'));assert.equal(typeof f.m.updateGarmentProfile,'function');
 f.m.updateGarmentProfile(a.id,{...profile(),reference:true});const before=f.map.get(KEY),version=f.m.version();let events=0;f.m.subscribe(()=>events++);f.fail(true);
 assert.throws(()=>f.m.updateGarmentProfile(b.id,{...profile(73),reference:true}),e=>e.code==='storage_write_failed');assert.equal(f.map.get(KEY),before);assert.equal(f.m.version(),version);assert.equal(events,0);
 f.fail(false);f.m.updateGarmentProfile(b.id,{...profile(73),reference:true});assert.equal(events,1);const rows=f.m.getState().closet;assert.equal(rows.find(g=>g.id===a.id).profile.reference,undefined);assert.equal(rows.find(g=>g.id===b.id).profile.reference,true);
 assert.deepEqual(createMock(f.options).getState().closet,rows);assert.deepEqual(JSON.parse(f.map.get(KEY)).registrations.receipts[0].input.profile,profile());
});
test('B1 edited profile is not overwritten by retrying the original registration receipt',()=>{
 const f=fixture(),g=f.m.registerGarment(input());f.m.updateGarmentProfile(g.id,profile(75));const raw=f.map.get(KEY),writes=f.writes;
 assert.equal(f.m.registerGarment(input()).profile.measures.length.cm,75);assert.equal(f.writes,writes);assert.equal(f.map.get(KEY),raw);
});
test('B1 future/corrupt profile and future snapshot preserve exact active raw and refuse later writes',()=>{
 const source=fixture();source.m.addGarment({kind:'shirt',color:'white'});const base=JSON.parse(source.map.get(KEY));
 for(const p of [{v:99}, {...profile(),unknown:'must not disappear'}, {...profile(),measures:{length:{cm:72,source:'ai'}}}]){
  const bad={...base,v:2,garments:base.garments.map(g=>({...g,profile:p}))},raw=JSON.stringify(bad),f=fixture({[KEY]:raw});assert.equal(f.m.storageIssue()?.code,'storage_unreadable');assert.equal(f.m.unreadableRaw(),raw);assert.throws(()=>f.m.setGender('F'));assert.equal(f.writes,0);assert.equal(f.map.get(KEY),raw);
 }
 const raw=JSON.stringify({...base,v:99}),f=fixture({[KEY]:raw});assert.equal(f.m.unreadableRaw(),raw);assert.equal(f.writes,0);
});
test('B1 invalid profile input is rejected before registration mutates or stores anything',()=>{
 for(const p of [{v:99},{...profile(),measures:{length:{cm:72,source:'ai'}}},{...profile(),details:[{text:'한정',source:'invented'}]}]){
  const f=fixture();assert.throws(()=>f.m.registerGarment(input(undefined,p)));assert.equal(f.writes,0);assert.equal(f.m.getState().closetCount,0);
 }
});
test('B1 actual draft controller and core decoder resume profile values and keep future raw blocked',()=>{
 const f=fixture(),ctx={crypto:{randomUUID}},src=fs.readFileSync(new URL('../src/input-session.js',import.meta.url),'utf8');vm.runInNewContext(src,ctx);
 assert.equal(typeof f.m.readInputDraft,'function');const make=()=>ctx.EOUL_INPUT_STATE.create(f.storage,{readRecord:f.m.readInputDraft});
 const c=make();c.enter();for(const[k,v]of Object.entries(input()))if(k!=='draftId')c.change(k,v);c.setStep(2);
 const saved=JSON.parse(f.map.get(DRAFT));assert.equal(saved.v,2);assert.deepEqual(saved.values.profile,profile());const again=make();again.enter();assert.equal(again.getSnapshot().pending.type,'ready');again.restore();assert.deepEqual(JSON.parse(JSON.stringify(again.values.profile)),profile());
 const raw=JSON.stringify({...saved,v:99});f.storage.setItem(DRAFT,raw);const writes=f.writes,blocked=make();blocked.enter();blocked.change('name','overwrite');assert.equal(blocked.getSnapshot().pending.type,'blocked');assert.equal(f.map.get(DRAFT),raw);assert.equal(f.writes,writes);
});
test('B1 profile snapshot and draft round-trip through format2 backup, new boot and undo',()=>{
 const f=fixture();f.m.registerGarment(input());const draft={v:2,step:2,values:input(),updatedAt:'2026-10-25T00:00:00Z'};f.storage.setItem(DRAFT,JSON.stringify(draft));const original=f.map.get(KEY),draftRaw=f.map.get(DRAFT),exported=backup(f).make();
 assert.equal(exported.data[KEY],original);assert.equal(exported.data[DRAFT],draftRaw);const target=fixture();const bk=backup(target);bk.restore(bk.read(JSON.stringify(exported)).data);
 assert.equal(target.map.get(KEY),original);assert.equal(target.map.get(DRAFT),draftRaw);assert.deepEqual(createMock(target.options).getState().closet[0].profile,profile());
 bk.undo();assert.equal(target.map.get(KEY),undefined);assert.equal(target.map.get(DRAFT),undefined);
});
