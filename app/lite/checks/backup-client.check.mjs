// 개발 계획 2번: 기기 저장 개인 자료의 무손실 왕복. 화면의 백업 블록(BK)을 그대로 떼어 가짜 localStorage로 검사한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createMock } from '../src/core.mjs';

const page = fs.readFileSync(new URL('../src/screen.html', import.meta.url), 'utf8');
const start = page.indexOf('  const BK = {');
const end = page.indexOf('  function backupSheet()');
assert.ok(start > 0 && end > start, 'd12 백업 블록(BK)을 찾아야 한다');
const block = page.slice(start, end);

const storage = () => {
  const m = new Map();
  return {
    get length() { return m.size; }, key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null), setItem(k, v) { this.fault?.('set',k,String(v)); this.trace?.push(['set',k,String(v)]); if (this.quota !== undefined && String(v).length > this.quota) throw new Error('QuotaExceededError'); m.set(k, String(v)); },
    removeItem(k) { this.fault?.('remove',k); this.trace?.push(['remove',k]); m.delete(k); }, dump: () => Object.fromEntries([...m.entries()].sort()),
  };
};
const ENGINE = 'eoul-d12-hang:v1';
const run = (local) => {
  const context = { localStorage: local, window: { EOUL_MOCK_KEY: ENGINE }, CHAT_KEY: 'eoul-d12-hang:consult', REG_KEY: 'eoul-d12-hang:reg', M: createMock(), URL, obj: (x) => x && typeof x === 'object' && !Array.isArray(x) };
  vm.runInNewContext(`${block}\nglobalThis.BK = BK;`, context);
  return context.BK;
};
const engineStates = new Map();
const engineState = (n) => {
  if (engineStates.has(n)) return engineStates.get(n);
  let raw; const m = createMock({storage: {getItem: () => null, setItem(k,v) { raw = v; }}, key: ENGINE});
  for (let i=0;i<n;i++) m.addGarment({kind:'shirt',color:'white',label:`직접 등록 ${i}`});
  m.decide('ms-728000','buy'); m.advance('ms-728000','ordered');
  const state=JSON.parse(raw); state.trialIds=[state.garments[0].id]; state.opaque='원문 그대로 ☃ "따옴표"';
  const result=JSON.stringify(state); engineStates.set(n,result); return result;
};
const seed = (local) => {
  local.setItem(ENGINE, engineState(3));
  local.setItem('eoul-d12-hang:ui', '{"absent":{"ms-1":true}}');
  local.setItem('eoul-d12-hang:reg', '{"items":{"g1":{"brand":"브랜드","name":"이름","kind":"m-oxford","color":null,"key":"k","at":"2026-10-23T00:00:00.000Z"}},"catalog":{}}');
  local.setItem('eoul-d12-hang:consult', '{"threads":[{"id":"t1","title":"10만원 이하 셔츠","at":"2026-10-23T00:00:00.000Z","turns":[{"role":"user","text":"10만원 이하 셔츠"},{"role":"assistant","text":"답","ids":["ms-1"],"check":["가격 확인: …"]}]}],"cur":"t1"}');
  local.setItem('eoul-crowd:device', 'abcdef0123456789abcdef0123456789');
  local.setItem('eoul-weather:place', '{"mode":"fixed","name":"서울","lat":37.5,"lon":127}');
  local.setItem('eoul-weather:last', '{"at":1,"value":{}}'); // 캐시: 백업에 넣지 않는다
  local.setItem('eoul-mockup-ux10v2:probe', '1');
  local.setItem('other-app:key', 'x'); // 다른 앱 키: 건드리지 않는다
};

test('내보내기는 eoul- 개인 자료 키의 원문을 그대로 담고 캐시·다른 앱 키는 빼며, 복원하면 글자 하나까지 같다', () => {
  const a = storage(); seed(a); const BK = run(a);
  const file = BK.make();
  assert.equal(file.app, 'eoul-lite'); assert.equal(file.format, 1); assert.match(file.at, /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(Object.keys(file.data), ['eoul-crowd:device', 'eoul-d12-hang:consult', 'eoul-d12-hang:reg', 'eoul-d12-hang:ui', 'eoul-d12-hang:v1', 'eoul-weather:place']);
  assert.equal(file.data[ENGINE], a.getItem(ENGINE));
  assert.deepEqual(JSON.parse(JSON.stringify(BK.count(file.data))), { garments: 2, journeys: 1, threads: 1, reg: 1 }); // 체험용(trialIds) 옷은 세지 않는다
  const text = JSON.stringify(file);
  // 새 기기(빈 저장소)에서 복원
  const b = storage(); const BK2 = run(b);
  const read = BK2.read(text);
  assert.equal(read.at, file.at);
  BK2.restore(read.data);
  const expected = { ...file.data };
  const got = b.dump(); const stash = JSON.parse(got['eoul-backup:stash']); delete got['eoul-backup:stash'];
  assert.deepEqual(got, expected);
  assert.deepEqual(stash.data, {}); // 빈 기기였으니 보관본도 비어 있다
  // 같은 자료를 다시 내보내면 글자가 같다(왕복 무손실)
  assert.equal(JSON.stringify(BK2.make().data), JSON.stringify(file.data));
});

test('복원은 현재 자료를 먼저 보관하고 백업 시점 그대로 바꾸며, 되돌리기는 복원 전 상태로 돌아간다. 다른 앱 키는 건드리지 않는다', () => {
  const a = storage(); seed(a); const BK = run(a);
  const before = a.dump();
  const other = storage(); other.setItem(ENGINE, engineState(5)); other.setItem('eoul-d12-hang:consult', '{"threads":[],"cur":null}');
  const text = JSON.stringify(run(other).make());
  BK.restore(BK.read(text).data);
  assert.equal(a.getItem(ENGINE), other.getItem(ENGINE));
  assert.equal(a.getItem('eoul-d12-hang:reg'), null); // 백업에 없던 키는 지운다(백업 시점 그대로)
  assert.equal(a.getItem('eoul-weather:last'), before['eoul-weather:last']); // 캐시는 그대로
  assert.equal(a.getItem('other-app:key'), 'x');
  assert.ok(BK.stash());
  BK.undo();
  assert.equal(a.getItem('eoul-backup:stash'), null);
  assert.deepEqual(a.dump(), before);
  assert.throws(() => BK.undo(), /보관본이 없어요/);
});

test('이 앱 파일이 아니거나 옷장 자료를 읽을 수 없으면 아무것도 바꾸지 않고 거절한다', () => {
  const a = storage(); seed(a); const BK = run(a);
  const before = a.dump();
  const ok = BK.make();
  const bad = [
    ['', /비어 있어요/], ['not json', /JSON/], ['[]', /이 앱의 백업/], [JSON.stringify({ ...ok, app: 'x' }), /이 앱의 백업/], [JSON.stringify({ ...ok, format: 2 }), /이 앱의 백업/],
    [JSON.stringify({ ...ok, data: [] }), /이 앱의 백업/], [JSON.stringify({ ...ok, data: {} }), /자료가 없어요/],
    [JSON.stringify({ ...ok, data: { 'other-app:key': 'x' } }), /모르는 항목/], [JSON.stringify({ ...ok, data: { 'eoul-backup:stash': 'x' } }), /모르는 항목/],
    [JSON.stringify({ ...ok, data: { [ENGINE]: 5 } }), /글자가 아니에요/], [JSON.stringify({ ...ok, data: { [ENGINE]: 'broken' } }), /옷장 자료를 읽을 수 없어요/],
    [JSON.stringify({ ...ok, data: { [ENGINE]: '{"v":2,"garments":[],"journeys":[]}' } }), /옷장 자료를 읽을 수 없어요/],
    ['x'.repeat(5 * 1024 * 1024 + 1), /너무 커요/],
  ];
  for (const [text, re] of bad) assert.throws(() => BK.read(text), re, text.slice(0, 40));
  assert.deepEqual(a.dump(), before);
  // 보관본을 쓸 수 없으면 복원하지 않는다
  const full = storage(); seed(full); const BKf = run(full); full.quota = 10;
  assert.throws(() => BKf.restore(BKf.read(JSON.stringify(ok)).data), /보관본을 저장하지 못해/);
  assert.deepEqual(full.dump(), before);
});


test('restore writes replacements before removals; a failure at every mutation compensates to exact original bytes', () => {
  const original=storage(); seed(original); original.setItem('eoul-extra:empty','');
  const target={ [ENGINE]:engineState(5), 'eoul-new:record':'new', 'eoul-extra:empty':'filled' };
  const successful=storage(); for(const [k,v] of Object.entries(original.dump()))successful.setItem(k,v);
  successful.trace=[]; run(successful).restore(target);
  const personal=successful.trace.filter(([,k])=>!k.startsWith('eoul-backup:'));
  const firstRemove=personal.findIndex(([op])=>op==='remove');
  assert.ok(firstRemove>0);
  assert.ok(personal.slice(firstRemove).every(([op])=>op==='remove'));
  const operations=successful.trace;
  // Journal creation has its own no-write failure case. Every later mutation,
  // including deleting obsolete keys and journal cleanup, must compensate.
  for(let failureAt=1;failureAt<=operations.length;failureAt++) {
    const local=storage(); for(const [k,v] of Object.entries(original.dump()))local.setItem(k,v);
    const before=local.dump(); let count=0;
    local.fault=()=>{if(++count===failureAt)throw new Error('injected');};
    assert.throws(()=>run(local).restore(target), /보관본을 저장하지 못해|복원을 되돌렸어요/);
    assert.deepEqual(local.dump(),before,`mutation ${failureAt}`);
  }
});

test('undo compensates each interrupted mutation and retains the undo stash for retry', () => {
  const initial=storage(); seed(initial); const target={ [ENGINE]:engineState(5),'eoul-new:record':'new' };
  const bk=run(initial); bk.restore(target); const ready=initial.dump();
  initial.trace=[]; bk.undo(); const operations=initial.trace;
  for(let failureAt=1;failureAt<=operations.length;failureAt++) {
    const local=storage(); for(const [k,v] of Object.entries(ready))local.setItem(k,v);
    let count=0; local.fault=()=>{if(++count===failureAt)throw new Error('injected');};
    assert.throws(()=>run(local).undo(),/보관본을 저장하지 못해|복원을 되돌렸어요/);
    assert.deepEqual(local.dump(),ready,`undo mutation ${failureAt}`);
    local.fault=null; run(local).undo();
    assert.equal(local.getItem(ENGINE),JSON.parse(ready['eoul-backup:stash']).data[ENGINE]);
  }
});

test('failed compensation preserves a durable raw journal, blocks core writes and permits explicit recovery after reload', () => {
  const local=storage(); seed(local); local.setItem('eoul-extra:empty','');
  local.setItem('eoul-backup:stash','unreadable prior stash'); const before=local.dump();
  const bk=run(local), originalEngine=local.getItem(ENGINE);
  let newWriteFailed=false;
  local.fault=(op,key,value)=>{
    if(op==='set'&&key==='eoul-new:record') {newWriteFailed=true;throw new Error('quota');}
    if(newWriteFailed&&op==='set'&&key===ENGINE&&value===originalEngine)throw new Error('rollback blocked');
  };
  assert.throws(()=>bk.restore({[ENGINE]:engineState(5),'eoul-new:record':'new'}),/되돌리기도 끝내지 못했어요/);
  const journal=JSON.parse(local.getItem('eoul-backup:transaction'));
  assert.deepEqual(journal.before,Object.fromEntries(Object.entries(before).filter(([k])=>!bk.skip(k))));
  assert.equal(journal.before[ENGINE],originalEngine); assert.equal(journal.before['eoul-extra:empty'],'');
  assert.equal(journal.stash,'unreadable prior stash');
  assert.throws(()=>bk.restore({[ENGINE]:engineState(2)}),/복원 복구를 먼저/);
  assert.throws(()=>bk.undo(),/복원 복구를 먼저/);
  const m=createMock({storage:local,key:ENGINE}); const bytes=local.getItem(ENGINE),state=m.getState(),version=m.version();
  assert.throws(()=>m.addGarment({kind:'pants',color:'black'}),e=>e.code==='storage_recovery_pending');
  assert.deepEqual(m.getState(),state); assert.equal(m.version(),version); assert.equal(local.getItem(ENGINE),bytes);
  local.fault=null;
  run(local).recover(); // A newly created client can finish a prior transaction.
  assert.deepEqual(local.dump(),before);
  assert.match(page,/role', 'alertdialog'/); assert.match(page,/root.inert = true/);
});

test('undo failure after partial writes preserves its exact start state in the journal and recovers without consuming stash', () => {
  const local=storage(); seed(local); const bk=run(local); const target={ [ENGINE]:engineState(5),'eoul-new:record':'new' };
  bk.restore(target); const before=local.dump(); let failed=false;
  local.fault=(op,key,value)=>{
    if(op==='remove'&&key==='eoul-new:record'){failed=true;throw new Error('remove denied');}
    if(failed&&op==='set'&&key===ENGINE&&value===target[ENGINE])throw new Error('rollback blocked');
  };
  assert.throws(()=>bk.undo(),/되돌리기도 끝내지 못했어요/);
  assert.equal(JSON.parse(local.getItem('eoul-backup:transaction')).before[ENGINE],target[ENGINE]);
  local.fault=null; run(local).recover(); assert.deepEqual(local.dump(),before);
  run(local).undo(); assert.equal(local.getItem('eoul-backup:stash'),null);
});

test('backup covers registration receipts and input draft; future/corrupt imports are rejected without touching original raw values', () => {
  const local=storage();seed(local);const bk=run(local);
  const registered=createMock({storage:local,key:ENGINE});
  registered.registerGarment({draftId:'draft-abcdefgh',brand:'합성',name:'합성 셔츠',kind:'shirt',color:'white',url:''});
  const draft=JSON.stringify({v:1,step:1,updatedAt:'2026-10-23T00:00:00Z',values:{draftId:'draft-abcdefgh',brand:'합성',name:'합성 셔츠',kind:'',color:'',url:''}});
  local.setItem('eoul-d12-hang:input-draft:v1',draft);
  const file=bk.make(),destination=storage();run(destination).restore(file.data);
  assert.equal(destination.getItem(ENGINE),local.getItem(ENGINE));
  assert.equal(destination.getItem('eoul-d12-hang:input-draft:v1'),draft);
  assert.equal(JSON.parse(destination.getItem(ENGINE)).registrations.receipts[0].input.draftId,'draft-abcdefgh');
  const before=local.dump();
  for(const bad of [
    {...file.data,[ENGINE]:JSON.stringify({v:1,garments:[],journeys:[],registrations:{v:99,receipts:[]}})},
    {...file.data,'eoul-d12-hang:input-draft:v1':'broken'},
    {...file.data,'eoul-d12-hang:input-draft:v1':JSON.stringify({v:99})},
    {...file.data,'eoul-d12-hang:reg':'broken'},
  ])assert.throws(()=>bk.restore(bad),/읽을 수 없어요/);
  assert.deepEqual(local.dump(),before);
});

test('restoring over corrupt/future originals preserves them byte-for-byte for undo, which restores normal core write protection', () => {
  for(const raw of ['broken','{"v":99,"unknown":"원문"}']) {
    const local=storage();seed(local);local.setItem(ENGINE,raw);local.setItem('eoul-d12-hang:reg','unreadable reg');
    const before=local.dump(),bk=run(local);bk.restore({[ENGINE]:engineState(5)});bk.undo();
    assert.deepEqual(local.dump(),before);
    const m=createMock({storage:local,key:ENGINE});assert.equal(m.storageIssue().code,'storage_unreadable');
    assert.throws(()=>m.addGarment({kind:'shirt',color:'white'}),e=>e.code==='storage_unreadable');
    assert.equal(local.getItem(ENGINE),raw);
  }
});


test('unreadable recovery journal cannot be silently cleared; explicit archival preserves exact raw and fails closed on write failure', () => {
  const local=storage();seed(local);local.setItem('eoul-backup:transaction','broken journal');const bk=run(local),before=local.dump();
  assert.throws(()=>bk.recover(),/복구 원문을 읽지 못했어요/);
  local.fault=(op,key)=>{if(op==='set'&&key.startsWith('eoul-backup:transaction:unreadable:'))throw new Error('quota');};
  assert.throws(()=>bk.archiveUnreadableRecovery(),/따로 보관하지 못했어요/);assert.deepEqual(local.dump(),before);
  local.fault=null;const key=bk.archiveUnreadableRecovery();assert.equal(local.getItem(key),'broken journal');assert.equal(local.getItem('eoul-backup:transaction'),null);
  // A readable journal must use actual recovery rather than this escape hatch.
  local.setItem('eoul-backup:transaction',JSON.stringify({v:1,operation:'restore',before:{},stash:null}));
  assert.throws(()=>bk.archiveUnreadableRecovery(),/복구를 먼저/);
});


test('malformed or active-content chat/registration links and markup IDs are rejected before any write', () => {
  const local=storage();seed(local);const bk=run(local),before=local.dump(),good=bk.make().data;
  const chat=JSON.parse(good['eoul-d12-hang:consult']);chat.threads[0].id='t1" onclick="alert(1)';
  const reg=JSON.parse(good['eoul-d12-hang:reg']);reg.catalog.bad={brand:'합성',name:'이름',url:'javascript:alert(1)'};
  const core=JSON.parse(good[ENGINE]);core.garments[0].id='bad"><img src=x onerror=alert(1)>';
  for(const data of [
    {...good,'eoul-d12-hang:consult':JSON.stringify(chat)},
    {...good,'eoul-d12-hang:consult':'{"threads":[{"id":"t1","title":"x","at":"x","turns":"broken"}]}'},
    {...good,'eoul-d12-hang:consult':'{"threads":[{"id":"t1","title":"x","at":"x","turns":[{"role":"assistant","text":"x","ids":"broken"}]}]}'},
    {...good,'eoul-d12-hang:reg':JSON.stringify(reg)},
    {...good,'eoul-d12-hang:reg':JSON.stringify({items:{},catalog:{bad:{brand:'x',name:'x',count:'<img src=x onerror=alert(1)>'}}})},
    {...good,'eoul-d12-hang:reg':JSON.stringify({items:{},catalog:{bad:{brand:'x',name:'x',serverMin:'<img src=x onerror=alert(1)>'}}})},
    {...good,[ENGINE]:JSON.stringify(core)},
  ])assert.throws(()=>bk.restore(data),/읽을 수 없어요/);
  assert.deepEqual(local.dump(),before);
  assert.match(page,/data-thread="\$\{esc\(t.id\)\}"/);
});
test('preview includes new atomic registration receipts without double-counting legacy metadata for the same garment', () => {
  const local=storage();seed(local);const m=createMock({storage:local,key:ENGINE});
  const g=m.registerGarment({draftId:'draft-abcdefgh',brand:'합성',name:'합성 셔츠',kind:'shirt',color:'white',url:''});
  const old=JSON.parse(local.getItem('eoul-d12-hang:reg'));old.items[g.id]={brand:'합성',name:'합성 셔츠'};local.setItem('eoul-d12-hang:reg',JSON.stringify(old));
  const bk=run(local);assert.equal(bk.count(bk.snapshot()).reg,2);
  m.removeGarment(g.id);delete old.items[g.id];local.setItem('eoul-d12-hang:reg',JSON.stringify(old));
  assert.equal(bk.count(bk.snapshot()).reg,1);
});
