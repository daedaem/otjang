import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createMock } from '../src/core.mjs';

const ENGINE='eoul-d12-hang:v1', DRAFT='eoul-d12-hang:input-draft:v1', REG='eoul-d12-hang:reg', CHAT='eoul-d12-hang:consult';
const page=fs.readFileSync(new URL('../src/screen.html',import.meta.url),'utf8');
const block=page.slice(page.indexOf('  const BK = {'),page.indexOf('  function backupSheet('));
function storage(initial={}) {
  const values=new Map(Object.entries(initial));
  return { writes:0, get length(){return values.size;}, key:i=>[...values.keys()][i]??null,
    getItem:k=>values.get(k)??null, setItem(k,v){this.writes++;values.set(k,String(v));}, removeItem(k){this.writes++;values.delete(k);},
    dump:()=>Object.fromEntries([...values.entries()].sort()) };
}
function run(local) {
  const context={localStorage:local,window:{EOUL_MOCK_KEY:ENGINE},CHAT_KEY:CHAT,REG_KEY:REG,URL,M:createMock()};
  vm.runInNewContext(`${block}\nglobalThis.BK=BK;`,context); return context.BK;
}
const draft=()=>({v:1,step:1,updatedAt:'2026-10-25T00:00:00Z',values:{draftId:'draft-abcdefgh',brand:'합성 브랜드',name:'합성 셔츠',kind:'shirt',color:'white',url:''}});
function registered() {
  const local=storage(), m=createMock({storage:local,key:ENGINE,clock:()=>new Date('2026-10-25T00:00:00Z')});
  const first=m.registerGarment({draftId:'draft-abcdefgh',brand:'합성 브랜드',name:'합성 셔츠',kind:'shirt',color:'white',url:''});
  const second=m.registerGarment({draftId:'draft-ijklmnop',brand:'합성 브랜드',name:'합성 바지',kind:'pants',color:'black',url:'https://example.test/item'});
  return {raw:local.getItem(ENGINE),first,second};
}
const baseline=()=>({[ENGINE]:registered().raw,[REG]:JSON.stringify({items:{},catalog:{}}),[CHAT]:JSON.stringify({threads:[],cur:null})});
const envelope=data=>JSON.stringify({app:'eoul-lite',format:1,data});
function refuses(key,raw) {
  const good=baseline(), bad={...good,[key]:raw};
  for(const method of ['make','read','restore']) {
    const local=storage(method==='make'?bad:good), bk=run(local), before=local.dump(), writes=local.writes;
    assert.throws(()=>method==='make'?bk.make():method==='read'?bk.read(envelope(bad)):bk.restore(bad),`${method}: ${key}`);
    assert.deepEqual(local.dump(),before,`${method} changed raw data`);assert.equal(local.writes,writes,`${method} wrote before validation`);
  }
}

test('export, file read and direct restore reject damaged/future input drafts before any write',()=>{
  const valid=draft();
  for(const raw of ['broken','null','[]',JSON.stringify({...valid,v:99}),JSON.stringify({...valid,step:3}),JSON.stringify({...valid,values:{...valid.values,name:'x'.repeat(81)}}),JSON.stringify({...valid,updatedAt:'invalid'})]) refuses(DRAFT,raw);
});
test('export, file read and direct restore reject damaged/future registration metadata without replacing raw data',()=>{
  for(const raw of ['broken','[]','null','{"v":99,"items":{},"catalog":{}}','{"items":[]}','{"catalog":[]}','{"items":{"g1":null}}','{"catalog":{"brand item":[]}}']) refuses(REG,raw);
});
test('registration links are HTTP(S) strings when present, for both items and catalog',()=>{
  for(const collection of ['items','catalog']) for(const url of [123,null,{},[], 'javascript:alert(1)','data:text/html,test','file:///tmp/test','not a URL']) {
    refuses(REG,JSON.stringify({items:{},catalog:{},[collection]:{'g1':{brand:'합성',name:'셔츠',url}}}));
  }
});
test('consultation IDs and turn product-ID containers reject active markup while preserving historical IDs',()=>{
  const thread={id:'old.thread:1',title:'지난 상담',at:'2026-10-25T00:00:00Z',turns:[{role:'assistant',text:'과거 상품',ids:['discontinued:123'],unknown:'keep'},{role:'note',kind:'err',text:'답을 받지 못했어요. 잠시 뒤에 다시 물어봐 주세요.'}]};
  for(const value of [{threads:'broken'}, {threads:[{...thread,id:'x" onclick="bad'}]}, {threads:[{...thread,turns:[{role:'assistant',text:'답',ids:'ms-1'}]}]}, {threads:[{...thread,turns:[{role:'assistant',text:'답',ids:['x<svg>']}]}]}, {threads:[thread],cur:'bad"id'}]) refuses(CHAT,JSON.stringify(value));
  const local=storage({[CHAT]:JSON.stringify({threads:[thread],cur:thread.id})});
  assert.equal(run(local).read(JSON.stringify(run(local).make())).data[CHAT],local.getItem(CHAT));
});
test('valid draft boundaries, legacy metadata and unknown raw values round-trip without normalization',()=>{
  const d=draft();d.values.brand=' '.repeat(2)+'브'.repeat(78);d.values.name='옷'.repeat(80);d.values.url='x'.repeat(2000);d.unknown={future:'preserve'};
  const rawDraft=` ${JSON.stringify(d)} \n`;
  const data={...baseline(),[DRAFT]:rawDraft,[REG]:'{ "items": {"old-id":{"brand":"옛 브랜드","color":null,"unknown":"원문"}}, "catalog":{"옛 상품":{"url":"https://example.test/item","unknown":42}} }','eoul-custom:data':'opaque raw ☃', [`${REG}:unreadable:old`]:'broken original'};
  const local=storage(data), bk=run(local), target=storage(), other=run(target);
  other.restore(other.read(JSON.stringify(bk.make())).data);
  assert.deepEqual(JSON.parse(JSON.stringify(other.make().data)),data);assert.equal(target.getItem(DRAFT),rawDraft);
});
test('direct restore validates manifest types, key ownership and value types before stashing',()=>{
  for(const bad of [null,[], 'text',{'other-app:key':'value'},{'eoul-backup:stash':'raw'},{[REG]:123}]) {
    const local=storage(baseline()),bk=run(local),before=local.dump();
    assert.throws(()=>bk.restore(bad));assert.deepEqual(local.dump(),before);assert.equal(local.writes,0);
  }
});
test('atomic registration receipt URLs cannot hide malformed values behind optional empty-link handling',()=>{
  for(const url of [null,123,{},[], 'javascript:alert(1)','data:text/html,test']) {
    const state=JSON.parse(registered().raw);state.registrations.receipts[0].input.url=url;
    refuses(ENGINE,JSON.stringify(state));
  }
});
test('preview counts the union of legacy garment IDs and atomic receipts, including a removed garment receipt',()=>{
  const {raw,first,second}=registered(), state=JSON.parse(raw);
  state.garments=state.garments.filter(g=>g.id!==first.id);
  const data={[ENGINE]:JSON.stringify(state),[REG]:JSON.stringify({items:{[second.id]:{brand:'합성',name:'바지'},'old-garment':{brand:'예전',name:'셔츠'}},catalog:{}})};
  assert.equal(run(storage()).count(data).reg,3);
});
