import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createMock } from '../src/core.mjs';
const input = { draftId: 'test-draft', brand: '브랜드', name: '흰 셔츠', kind: 'shirt', color: 'white', url: '' };
const key = 'test';
test('registration writes garment + metadata + receipt atomically, retries across reload, detects changed payload', () => {
  const values = new Map(); let fail = false; let writes = 0;
  const storage = { getItem: k => values.get(k) ?? null, setItem(k,v) { if(fail) throw new Error('quota'); values.set(k,v); writes++; } };
  const m = createMock({storage,key}); m.addGarment({kind:'pants'});
  const before = values.get(key), version = m.version(); let notices = 0; m.subscribe(()=>notices++);
  fail = true; assert.throws(()=>m.registerGarment(input), {code:'storage_write_failed'});
  assert.equal(values.get(key),before); assert.equal(m.version(),version); assert.equal(notices,0);
  fail = false; const g = m.registerGarment(input); const savedWrites = writes;
  assert.equal(m.registrationMetadata(g.id).brand, input.brand);
  const reload = createMock({storage,key}); assert.equal(reload.registerGarment(input).id,g.id);
  assert.equal(writes,savedWrites); assert.equal(reload.getState().closetCount,2);
  assert.throws(()=>reload.registerGarment({...input,name:'다른 옷'}),{code:'registration_conflict'});
});
test('future registration schema blocks writes without destroying old raw data', () => {
  const raw = JSON.stringify({v:1,garments:[],journeys:[],registrations:{v:99,receipts:[]}});
  let writes=0; const m=createMock({storage:{getItem:()=>raw,setItem(){writes++;}}});
  assert.equal(m.storageIssue().code,'storage_unreadable');
  assert.throws(()=>m.registerGarment(input)); assert.equal(writes,0);
});
test('current core golden: fixed wardrobe and date preserve search candidates and judgment', () => {
  const m=createMock({clock:()=>new Date('2026-10-22T12:00:00Z'),photos:false});
  for(const g of [{kind:'shirt',color:'white',slot:'m-oxford'},{kind:'pants',color:'beige',slot:'m-chino'},{kind:'loafer',color:'brown',slot:'m-loafer'}])m.addGarment(g);
  const ids=m.ask('출근용 셔츠 10만원 이하').products.slice(0,4).map(p=>p.id);
  const judgment=JSON.parse(JSON.stringify(m.judge(ids[0])).replace(/g_mock_[a-z0-9]+_[a-z0-9]+/g,'garment-id'));
  // New profile read-model metadata has its own persistence assertions. Keep
  // this golden focused on unchanged search IDs and legacy judgment behavior.
  judgment.owned = judgment.owned.map(({profile,brand,addedAt,photoId,...oldView})=>oldView);
  assert.deepEqual({ids,judgment},JSON.parse(fs.readFileSync(new URL('fixtures/current-core.json',import.meta.url))));
});
