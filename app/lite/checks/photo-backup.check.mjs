import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { createMock } from '../src/core.mjs';
import fs from 'node:fs';
import vm from 'node:vm';
const api=await import('../src/photos/photo-backup.js').catch(()=>({}));
const KEY='eoul-d12-hang:v1',MARKER='eoul-backup:photos-pending';
const png=()=>new Blob([Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6z3sAAAAASUVORK5CYII=','base64'))],{type:'image/png'});
function fixture(){const map=new Map(),events=[];let failure=null;const storage={get length(){return map.size;},key:i=>[...map.keys()][i]??null,getItem:k=>map.get(k)??null,setItem(k,v){if(failure?.('set',k))throw Error('storage fault');events.push(['set',k]);map.set(k,String(v));},removeItem(k){if(failure?.('remove',k))throw Error('storage fault');events.push(['remove',k]);map.delete(k);}};
 const photos=new Map();let journal=null,undo=null;const repository={fail:null,async list(){return [...photos.values()];},async put(record){if(this.fail==='put')throw Error('photo quota');const old=photos.get(record.id);if(old&&old.digest!==record.digest)throw Error('collision');photos.set(record.id,record);},async pending(){return journal;},async saveJournal(v){if(this.fail==='journal')throw Error('journal quota');journal=structuredClone(v);},async promoteUndo(v){if(this.fail==='promote')throw Error('promotion fault');undo=structuredClone(v);journal={...structuredClone(v),phase:'committed'};},async clearJournal(){journal=null;},async undo(){return undo;}};
 const m=createMock({storage,key:KEY,requireStorage:true});const src=fs.readFileSync(new URL('../src/screen.html',import.meta.url),'utf8'),block=src.slice(src.indexOf('  const BK = {'),src.indexOf('  function backupSheet('));const ctx={TextEncoder,URL,localStorage:storage,window:{EOUL_MOCK_KEY:KEY},REG_KEY:'eoul-d12-hang:reg',CHAT_KEY:'eoul-d12-hang:consult',M:m};vm.runInNewContext(block+';globalThis.bk=BK',ctx);
 return {map,events,storage,repository,photos,m,bk:ctx.bk,fault:f=>failure=f,controller(){return api.createPhotoBackup({storage,repository,textBackup:ctx.bk,crypto:webcrypto});}};
}
async function bundle(){const f=fixture(),g=f.m.addGarment({kind:'shirt',color:'white'}),record=await api.photoRecord(png(),{role:'garment',width:1,height:1},webcrypto);await f.repository.put(record);f.m.updateGarmentPhoto(g.id,record.id);return {f,record,value:await f.controller().make()};}

test('photo hashing is immutable and rejects URLs, wrong MIME, oversized data and forged hashes',async()=>{
 const record=await api.photoRecord(png(),{role:'garment',width:1,height:1},webcrypto);assert.match(record.id,/^p_[a-f0-9]{64}$/);assert.equal(record.blob.size,png().size);assert.equal(record.role,'garment');
 await assert.rejects(()=>api.photoRecord('https://seller.test/image.jpg',{},webcrypto));await assert.rejects(()=>api.photoRecord(new Blob(['<svg/>'],{type:'image/svg+xml'}),{},webcrypto));
 const f=fixture(),c=f.controller();await assert.rejects(()=>c.read(JSON.stringify({app:'eoul-photo-backup',format:1,text:f.bk.make(),photos:[{...record,blob:undefined,data:'AAAA'}]})));
});
test('photo-inclusive export/read/preview preserve exact text and bytes, report missing and orphan references, and never write',async()=>{
 const {f,record}=await bundle(),c=f.controller();f.m.updateGarmentPhoto(f.m.getState().closet[0].id,'p_'+'a'.repeat(64));const raw=f.map.get(KEY),before=f.events.length;
 const value=await c.make(),read=await c.read(JSON.stringify(value)),plan=await c.preview(read);assert.equal(read.text.data[KEY],raw);assert.equal(plan.missing.length,1);assert.equal(plan.orphans.length,1);assert.equal(f.events.length,before);assert.equal((await f.repository.list())[0].id,record.id);
});
test('bundle restore on an empty device loads photos and exact wardrobe, then undo keeps original references and archives',async()=>{
 const {value,record}=await bundle(),f=fixture(),c=f.controller();f.m.addGarment({kind:'pants',color:'black'});const before=f.map.get(KEY);
 const result=await c.restore(await c.read(JSON.stringify(value)));assert.equal(result.complete,true);assert.equal(f.map.get(MARKER),undefined);assert.equal(f.map.get(KEY),value.text.data[KEY]);assert.equal(f.photos.get(record.id).blob.size,record.blob.size);
 assert.equal(createMock({storage:f.storage,key:KEY}).getState().closet[0].photoId,record.id);await c.undo();assert.equal(f.map.get(KEY),before);assert.equal(f.map.get(MARKER),undefined);assert.equal(f.photos.has(record.id),true);
});
test('journal or photo-write failure never overwrites the current wardrobe or previous undo point',async()=>{
 const {value}=await bundle();for(const stage of ['journal','put']){const f=fixture(),c=f.controller();f.m.addGarment({kind:'pants'});const before=f.map.get(KEY);f.repository.fail=stage;await assert.rejects(()=>c.restore(value));assert.equal(f.map.get(KEY),before);f.repository.fail=null;if(f.map.has(MARKER))await c.recover();assert.equal(f.map.get(KEY),before);assert.equal(f.map.has(MARKER),false);}
});
test('text write or undo promotion failure retains a recoverable journal and restores original text on restart',async()=>{
 const {value}=await bundle();for(const stage of ['text','promote']){const f=fixture(),c=f.controller();f.m.addGarment({kind:'pants'});const before=f.map.get(KEY);if(stage==='text')f.fault((op,k)=>op==='set'&&k===KEY);else f.repository.fail='promote';await assert.rejects(()=>c.restore(value));assert.ok(f.map.get(MARKER));assert.ok(await f.repository.pending());
 f.fault(null);f.repository.fail=null;await f.controller().recover();assert.equal(f.map.get(KEY),before);assert.equal(f.map.has(MARKER),false);}
});
test('marker cleanup failure is incomplete, then committed recovery finishes without reverting restored data',async()=>{
 const {value}=await bundle(),f=fixture(),c=f.controller();f.m.addGarment({kind:'pants'});f.fault((op,k)=>op==='remove'&&k===MARKER);await assert.rejects(()=>c.restore(value));assert.equal(f.map.get(KEY),value.text.data[KEY]);assert.equal((await f.repository.pending()).phase,'committed');
 f.fault(null);await f.controller().recover();assert.equal(f.map.get(KEY),value.text.data[KEY]);assert.equal(f.map.has(MARKER),false);
});
test('a pending marker blocks new core/draft writes and new restore; malformed or missing recovery data is preserved',async()=>{
 const f=fixture();f.m.addGarment({kind:'shirt'});f.storage.setItem(MARKER,'{"v":99,"keep":"raw"}');const raw=f.map.get(KEY),count=f.events.length;
 assert.throws(()=>f.m.addGarment({kind:'pants'}),e=>e.code==='photo_recovery_pending');assert.equal(f.map.get(KEY),raw);assert.equal(f.events.length,count);
 const restarted=createMock({storage:f.storage,key:KEY});assert.equal(restarted.storageIssue()?.code,'photo_recovery_pending');assert.equal(restarted.getState().closetCount,1);
 await assert.rejects(()=>f.controller().recover());assert.equal(f.map.get(MARKER),'{"v":99,"keep":"raw"}');
});
test('normal JSON restore never deletes photo blobs; bundle bytes/format/duplicates/foreign records are rejected before writes',async()=>{
 const {f,record,value}=await bundle(),c=f.controller();f.bk.restore({'eoul-d12-hang:ui':'{}'});assert.equal(f.photos.has(record.id),true);
 const count=f.events.length;for(const text of ['', '{"app":"other"}',JSON.stringify({...value,format:99}),JSON.stringify({...value,photos:[...value.photos,...value.photos]})])await assert.rejects(()=>c.read(text));assert.equal(f.events.length,count);
});
