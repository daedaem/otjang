import test from 'node:test';
import assert from 'node:assert/strict';
import {createMock} from '../src/core.mjs';
const api=await import('../src/domain/measurement-draft.js').catch(()=>({}));
const productId='ms-728000';
function reference(){return {id:'own-reference',kind:'shirt',profile:{v:1,reference:true,measures:{length:{cm:70,source:'measured'},chest:{cm:55,source:'measured'}}}};}
test('candidate measurement draft preserves unfinished input and does not create an owned garment',()=>{
 assert.equal(typeof api.measurementDraft,'function');const d=api.measurementDraft({id:productId,kind:'shirt'});d.manual.length='72.';const raw=' '+JSON.stringify({v:1,entries:{[productId]:d}})+'\n';assert.equal(api.readMeasurementDrafts(raw).entries[productId].manual.length,'72.');const result=api.measurementResult(d,{kind:'shirt'},reference());assert.ok(result.problems.length);assert.equal(result.options.length,0);assert.equal(createMock().getState().closetCount,0);
});
test('candidate size table compares numeric facts and always carries the fit limitation note',()=>{
 assert.equal(typeof api.measurementDraft,'function');const d=api.measurementDraft({id:productId,kind:'shirt'});d.mode='table';d.table='사이즈 총장 가슴\nS 68 53\nM 72 57';const r=api.measurementResult(d,{kind:'shirt'},reference());assert.equal(r.closest.best,null);assert.match(r.closest.reason,/같아요/);assert.equal(r.active,null);assert.match(r.note,/착용감이나 핏/);d.selected='M';const selected=api.measurementResult(d,{kind:'shirt'},reference());assert.match(selected.comparison.factLine,/총장 \+2cm/);assert.equal(selected.active.label,'M');
});
test('a missing reference and mismatched metric coverage never silently pick a size',()=>{
 assert.equal(typeof api.measurementDraft,'function');const d=api.measurementDraft({id:productId,kind:'shirt'});d.mode='table';d.table='M 총장 70 가슴 55\nL 총장 71 어깨 47';assert.equal(api.measurementResult(d,{kind:'shirt'},null).closest.best,null);const g=reference();g.profile.measures.shoulder={cm:46,source:'seller'};assert.equal(api.measurementResult(d,{kind:'shirt'},g).closest.best,null);
});
test('future, truncated, duplicated or wrong-kind comparison drafts are rejected without normalizing them',()=>{
 assert.equal(typeof api.readMeasurementDrafts,'function');for(const raw of ['{"v":99,"entries":{}}','broken','{"v":99,"v":1,"entries":{}}','{"v":1,"entries":{},"unknown":true}'])assert.throws(()=>api.readMeasurementDrafts(raw));const d=api.measurementDraft({id:productId,kind:'shirt'});d.manual.waist='30';assert.throws(()=>api.readMeasurementDrafts(JSON.stringify({v:1,entries:{[productId]:d}})));
});
test('quick reference creation stores unknown brand and profile in one atomic wardrobe write',()=>{
 const map=new Map();let fail=false,writes=0;const m=createMock({key:'reference',storage:{getItem:k=>map.get(k)??null,setItem(k,v){if(fail)throw Error('quota');writes++;map.set(k,v);}},requireStorage:true});const old=m.addGarment({kind:'shirt',color:'white',profile:{v:1,reference:true,measures:{length:{cm:70,source:'measured'}}}});assert.equal(m.getState().closet[0].profile?.reference,true);const before=map.get('reference'),n=writes;fail=true;assert.throws(()=>m.addGarment({kind:'shirt',profile:{v:1,reference:true}}),e=>e.code==='storage_write_failed');assert.equal(map.get('reference'),before);assert.equal(writes,n);fail=false;const g=m.addGarment({kind:'shirt',profile:{v:1,reference:true}});assert.equal(writes,n+1);assert.equal(g.brand,null);assert.equal(g.profile.reference,true);assert.equal(m.getState().closet.find(g=>g.id===old.id).profile.reference,undefined);
});
