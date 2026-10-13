const test=require('node:test');
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const base=__dirname+'/..';
const html=fs.readFileSync(base+'/src/app.html','utf8'),entry=fs.readFileSync(base+'/src/entry-ui.js','utf8'),W=require(base+'/src/wardrobe.js'),N=require(base+'/src/needs.js'),G=require(base+'/src/colorguess.js'),PhotoIntake=require(base+'/src/photo-intake.js');
const section=(from,to)=>{const at=html.indexOf(from),end=html.indexOf(to,at);assert(at>=0&&end>at);return html.slice(at,end)};
// Actual application DOM builder, save queue, freshness and record-capacity functions.
// DOM and storage adapters below are synthetic; these tests are not browser E2E.
const production=section('  function h(tag, attrs) {','  const swatch =')+
 section('  function save() {','  // Undo only the values')+
 section('  function samePullValue(', '  function undoPullValue(')+
 section('  function pullCommand(', '  function retainedPullResults(')+
 section('  function saveCommandProvenance(', '  function capturePullCommands(')+
 section('  function capacityCounts(', '  function canImportReplace(')+
 section('  function replaceItem(', '\n\n  const B =');

class Node {
 constructor(tag,doc){this.tag=tag;this.doc=doc;this.children=[];this.props={};this.style={};this.events={};this.open=false;this.disabled=false;this.classList={toggle(){}};this.isConnected=true;}
 getAttribute(k){return this.props[k]}
 prepend(...values){this.children.unshift(...values)}
 setAttribute(k,v){this.props[k]=v;if(k==='disabled')this.disabled=true;if(k==='open')this.open=true;if(k==='hidden')this.hidden=true;if(k==='id')this.id=v;}
 append(...values){for(const value of values.flat())if(value!=null){this.children.push(value);if(typeof value==='object')value.parent=this;}}
 replaceChildren(...values){this.children=[];this.append(...values)}
 addEventListener(k,fn){(this.events[k]||=[]).push(fn)}
 focus(){this.doc.activeElement=this}
 showModal(){this.open=true}
 close(){this.open=false}
 remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);this.isConnected=false}
 scrollIntoView(){}
 querySelector(sel){return walk(this).find(n=>matches(n,sel))||null}
 get textContent(){return (this.text||'')+this.children.map(n=>typeof n==='object'?n.textContent:String(n)).join('')}
 set textContent(value){this.text=String(value);this.children=[]}
}
const walk=(node)=>node.children.filter(n=>typeof n==='object').flatMap(n=>[n,...walk(n)]);
const matches=(node,sel)=>sel[0]==='#'?node.id===sel.slice(1):sel[0]==='.'?String(node.className||'').split(' ').includes(sel.slice(1)):sel[0]==='['?(()=>{const m=sel.match(/^\[([^=]+)="([^"]*)"\]$/);return m&&node.props[m[1]]===m[2]})():node.tag===sel;
function fixture(commit,config={}){const document={activeElement:null,createElement(tag){const node=new Node(tag,this);if(tag==='canvas')node.getContext=()=>({drawImage(){},getImageData(){return {data:config.pixels}}});return node},querySelector(sel){return this.body.querySelector(sel)}};document.body=new Node('body',document);for(const id of ['bulkFile','saveNote','main','closetGrid']){const node=new Node('div',document);node.id=id;document.body.append(node)}
 const state={items:[],meta:{sample:false},decisions:[],catalog:{products:[]},pickLog:[],others:[]},storage=new Map(),calls=[];
 const ctx=vm.createContext({document,$:(s,el)=>(el||document).querySelector(s),window:{File:class {},localStorage:{}},navigator:{locks:{}},URL,setTimeout,clearTimeout,W,CATS:W.CATS,KINDS:W.KINDS,FAM:W.FAM,SEASONS:W.SEASONS,PhotoIntake,G,imageElement:async()=>{if(!config.pixels)throw Error('no synthetic pixels');return {naturalWidth:600,naturalHeight:800}},swatch:()=> '#aaa',openNeeds(){},state,scope:'state',ui:{},store:{db:{},mode:'idb',revision:0,persistedSnapshots:new Map([['state',{idbValue:null,lsValue:null}]]),conflicts:new Set(),recoveryByScope:new Map()},storageOk:true,savePromise:Promise.resolve(),accountScope:()=>ctx.scope,localStorageKey:()=>ctx.scope+'.local',lsSnapshot:()=>null,kvGet:async k=>storage.get(k)||null,SC:{commitSnapshot:async p=>{calls.push(p);const ok=await commit(p,calls.length);if(ok){storage.set(p.idbKey,p.data);return {ok:true,mode:'idb',idbValue:p.data,lsValue:null}}return {ok:false}}},newId:(()=>{let n=0;return()=>`entry-${++n}`})(),render(){},toast(){},openQuickItem(){},readImage(){throw Error('No files used in this smoke')},josa:(name,a,b)=>name+b,byId:id=>ctx.state.items.find(i=>i.id===id),openEditor(){}});
 vm.runInContext(production+entry+'\nthis.openEasy=openEasyEntry;this.openAttrs=openAttributeCheck;this.makeDraft=attributeDraft;this.makeNext=attributeNext;this.commitChanges=commitEasyChanges;',ctx);
 const tap=async(node)=>{assert(node);for(const fn of node.events.click||[])await fn({preventDefault(){}})};
 const kind=(cat='top',type='shirt')=>document.querySelector(`[data-easy-kind="${cat}:${type}"]`);
 return {ctx,state,storage,calls,document,tap,kind,open:()=>ctx.openEasy({withoutPhoto:true}),save:()=>document.querySelector('#easyEntrySave'),choice:(v)=>document.querySelector('[data-attribute-choice="'+v+'"]'),attrs:(items,options)=>ctx.openAttrs(items,options),confirm:()=>document.querySelector('#attributeConfirm')};}
const tick = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };
const copy = (value) => JSON.parse(JSON.stringify(value));
const item = (id, extra) => W.cleanItem({ id, status: 'owned', cat: 'top', kind: 'shirt', name: '셔츠', ...extra }, 0);
const choose = async (f, values) => { for (const value of values) await f.tap(f.choice(value)); };
const color = ['family:navy','light:20','pattern:solid','formality:2'];

test('photo-first registration saves only selected type and shows real wardrobe counts without invented attributes', async () => {
 const f=fixture(async()=>true);f.open();await f.tap(f.kind());await f.tap(f.save());
 assert.equal(f.state.items.length,1);assert.equal(f.state.items[0].kind,'shirt');assert.equal(f.state.items[0].brand,'');assert.equal(f.state.items[0].price,null);assert.equal(f.state.items[0].family,null);
 assert.equal(N.analyze(f.state.items).recommendations.length,0);assert.match(f.document.querySelector('#easyEntry').textContent,/지금 내 옷장에 1벌/);assert.match(f.document.querySelector('#easyEntry').textContent,/필요한 새 옷 추천 보기/);
});
test('duplicate registration submits one durable record', async () => {
 const hold=deferred(),f=fixture(async()=>hold.promise);f.open();await f.tap(f.kind());const one=f.tap(f.save());await tick();const two=f.tap(f.save());hold.resolve(true);await Promise.all([one,two]);assert.equal(f.calls.length,1);assert.equal(f.state.items.length,1);
});
test('false persistence preserves old garment and allows retry with the selected kind retained', async () => {
 const f=fixture(async()=>false);f.state.items.push(item('old',{brand:'saved brand',price:34000}));const before=copy(f.state.items);f.open();await f.tap(f.kind());await f.tap(f.save());assert.deepEqual(copy(f.state.items),before);assert.match(f.document.querySelector('#easyEntryStatus').textContent,/저장하지 못했어요/);assert.equal(f.save().disabled,false);assert.equal(f.kind().props['aria-pressed'],'true');
});
test('throwing storage also undoes only the provisional insertion', async () => {
 const f=fixture(async()=>{throw Error('storage failure')});f.state.items.push(item('old'));const before=copy(f.state.items);f.open();await f.tap(f.kind());await f.tap(f.save());assert.deepEqual(copy(f.state.items),before);assert.match(f.document.querySelector('#easyEntryStatus').textContent,/저장하지 못했어요/);
});
test('failed first save followed by successful queued edit is repaired without deleting that edit', async () => {
 const hold=deferred(),f=fixture(async(_payload,n)=>n===1?hold.promise:true);f.open();await f.tap(f.kind());const started=f.tap(f.save());await tick();f.state.items.push(item('new-unrelated',{brand:'do not lose'}));const queued=f.ctx.save();hold.resolve(false);await Promise.all([started,queued]);
 assert.deepEqual(f.state.items.map(row=>row.id),['new-unrelated']);assert.deepEqual(JSON.parse(f.storage.get('state')).items.map(row=>row.id),['new-unrelated']);assert.equal(f.calls.length,3);
});
test('failed original actor save repairs only the original key after switching actor', async () => {
 const hold=deferred(),f=fixture(async(_payload,n)=>n===1?hold.promise:true);f.open();await f.tap(f.kind());const started=f.tap(f.save());await tick();f.state.items.push(item('keep-old-actor'));const queued=f.ctx.save();const other={items:[{id:'other-actor'}]};f.ctx.state=other;f.ctx.scope='another';hold.resolve(false);await Promise.all([started,queued]);
 assert.equal(f.ctx.state,other);assert.equal(f.ctx.state.items[0].id,'other-actor');assert.equal(f.document.querySelector('#easyEntry'),null);assert.ok(f.calls.every(call=>call.idbKey==='state'));assert.deepEqual(JSON.parse(f.storage.get('state')).items.map(row=>row.id),['keep-old-actor']);
});
test('successful old actor save never replaces or shows success over a new actor', async () => {
 const hold=deferred(),f=fixture(async()=>hold.promise);f.open();await f.tap(f.kind());const started=f.tap(f.save());await tick();const other={items:[{id:'other'}]};f.ctx.state=other;f.ctx.scope='another';hold.resolve(true);await started;assert.equal(f.ctx.state,other);assert.equal(f.document.querySelector('#easyEntry'),null);
});
test('500-record capacity blocks new insertion before storage writes', async () => {
 const f=fixture(async()=>true);f.state.items=Array.from({length:500},(_,i)=>item('old-'+i));f.open();await f.tap(f.kind());await f.tap(f.save());assert.equal(f.calls.length,0);assert.equal(f.state.items.length,500);
});
test('unknown-kind category fallback does not invent a type', async () => {
 const f=fixture(async()=>true);f.open();await f.tap(f.kind('bottom',''));await f.tap(f.save());assert.equal(f.state.items[0].cat,'bottom');assert.equal(f.state.items[0].kind,null);
});
test('attribute choices make a real garment assessable and preserve brand, price, photos, product and measurements', async () => {
 const f=fixture(async()=>true),own='data:image/png;base64,AAAA';let saved=item('old',{brand:'owner brand',model:'owner product',price:78000,measures:{chest:54},photo:{kind:'own',img:own,ownImg:own}});
 saved=W.confirmProduct(saved,{brand:'verified brand',name:'verified product',img:'data:image/png;base64,BBBB',at:'2026-10-14'});f.state.items.push(saved);const keep=copy(saved);let result;
 f.attrs([saved],{onComplete:(value)=>{result=value}});await choose(f,color);await f.tap(f.confirm());const now=f.state.items[0];assert.equal(W.assessment(now).ready,true);assert.equal(now.attrSource,'owner-confirmed');for(const key of ['brand','model','price','measures','photo','product'])assert.deepEqual(copy(now[key]),keep[key]);assert.deepEqual(copy(result),{confirmed:['old'],remaining:[]});
});
test('known attributes are not asked for or overwritten', async () => {
 const f=fixture(async()=>true),saved=item('old',{family:'black',light:12,pattern:'stripe',formality:null,brand:'existing'});f.state.items.push(saved);f.attrs([saved]);assert.equal(f.choice('family:white'),null);assert.equal(f.choice('light:85'),null);assert.equal(f.choice('pattern:solid'),null);await choose(f,['formality:3']);await f.tap(f.confirm());assert.equal(f.state.items[0].family,'black');assert.equal(f.state.items[0].light,12);assert.equal(f.state.items[0].pattern,'stripe');assert.equal(f.state.items[0].brand,'existing');
});
test('unknown choices preserve null and hold matching recommendations rather than fabricate readiness', async () => {
 const f=fixture(async()=>true),saved=item('old');f.state.items.push(saved);let result;f.attrs([saved],{onComplete:value=>{result=value}});await choose(f,['family:unknown','light:unknown','pattern:unknown','formality:unknown']);await f.tap(f.confirm());const now=f.state.items[0];assert.equal(now.family,null);assert.equal(now.light,null);assert.equal(now.pattern,null);assert.equal(now.formality,null);assert.equal(W.assessment(now).ready,false);assert.equal(now.attrSource,'owner');assert.deepEqual(copy(result),{confirmed:[],remaining:['old']});
});
test('an untouched photo-derived draft cannot become owner-confirmed', async () => {
 const f=fixture(async()=>true),saved=item('draft',{family:'navy',light:20,pattern:'solid',formality:2,attrSource:'photo-draft'});f.state.items.push(saved);f.attrs([saved]);await f.tap(f.confirm());assert.equal(f.calls.length,0);assert.equal(f.state.items[0].attrSource,'photo-draft');assert.match(f.document.querySelector('#attributeCheck').textContent,/아는 값/);
});
test('explicitly confirming all draft fields makes the garment ready', async () => {
 const f=fixture(async()=>true),saved=item('draft',{family:'navy',light:20,pattern:'solid',formality:2,attrSource:'photo-draft'});f.state.items.push(saved);f.attrs([saved]);await choose(f,['kind:shirt',...color]);await f.tap(f.confirm());assert.equal(f.state.items[0].attrSource,'owner-confirmed');assert.equal(W.assessment(f.state.items[0]).ready,true);
});
test('failed attribute persistence keeps exact old data and leaves the selections for retry', async () => {
 const f=fixture(async()=>false),saved=item('old',{brand:'old brand',price:55000});f.state.items.push(saved);const before=copy(f.state.items);f.attrs([saved]);await choose(f,color);await f.tap(f.confirm());assert.deepEqual(copy(f.state.items),before);assert.equal(f.confirm().disabled,false);assert.equal(f.choice('family:navy').props['aria-pressed'],'true');
});
test('failed attribute save plus successful queued unrelated edit restores old attributes in durable data', async () => {
 const hold=deferred(),f=fixture(async(_payload,n)=>n===1?hold.promise:true),saved=item('old');f.state.items.push(saved);f.attrs([saved]);await choose(f,color);const started=f.tap(f.confirm());await tick();f.state.items[0].brand='new user brand';const queued=f.ctx.save();hold.resolve(false);await Promise.all([started,queued]);const durable=JSON.parse(f.storage.get('state')).items[0];assert.equal(durable.family,null);assert.equal(durable.pattern,null);assert.equal(durable.brand,'new user brand');assert.equal(f.state.items[0].brand,'new user brand');
});
test('editing a garment while attribute dialog is open blocks stale overwrite', async () => {
 const f=fixture(async()=>true),saved=item('old');f.state.items.push(saved);f.attrs([saved]);await choose(f,color);saved.brand='edited elsewhere';await f.tap(f.confirm());assert.equal(f.calls.length,0);assert.equal(saved.brand,'edited elsewhere');assert.match(f.document.querySelector('#attributeCheck').textContent,/정보가 바뀌었어요/);
});
test('two garments are checked in sequence and saved once before onComplete', async () => {
 const f=fixture(async()=>true),a=item('a'),b=item('b',{cat:'bottom',kind:'denim',name:'데님'});f.state.items.push(a,b);let count=0;f.attrs([a,b],{onComplete:()=>{count++}});await choose(f,color);await f.tap(f.confirm());assert.equal(f.calls.length,0);assert.equal(count,0);assert.match(f.document.querySelector('#attributeTitle').textContent,/2\/2벌/);await choose(f,color);await f.tap(f.confirm());assert.equal(f.calls.length,1);assert.equal(count,1);assert.ok(f.state.items.every(it=>W.assessment(it).ready));
});
test('a later complete replacement at the same actor supersedes failed provisional repair', async () => {
 const hold=deferred(),f=fixture(async(_payload,n)=>n===1?hold.promise:true);f.open();await f.tap(f.kind());const started=f.tap(f.save());await tick();const replacement={...f.state,items:[item('complete-backup')]};f.ctx.state=replacement;const newer=f.ctx.save();hold.resolve(false);await Promise.all([started,newer]);assert.equal(f.ctx.state,replacement);assert.deepEqual(JSON.parse(f.storage.get('state')).items.map(row=>row.id),['complete-backup']);assert.equal(f.calls.length,2);
});
test('failed scoped repair surfaces residual storage warning instead of claiming rollback completed', async () => {
 const hold=deferred(),f=fixture(async(_payload,n)=>n===1?hold.promise:n===2);f.open();await f.tap(f.kind());const started=f.tap(f.save());await tick();f.state.items.push(item('new-edit'));const newer=f.ctx.save();hold.resolve(false);await Promise.all([started,newer]);assert.match(f.document.querySelector('#easyEntryStatus').textContent,/복구 저장을 마치지 못했어요/);assert.equal(f.state.items.length,1);assert.equal(JSON.parse(f.storage.get('state')).items.length,2);
});
test('photo color suggestion is produced from real ColorGuess and remains unconfirmed until explicit choice', async () => {
 const pixels=new Uint8ClampedArray(96*96*4);for(let i=0;i<pixels.length;i+=4){const at=i/4;pixels[i]=40+(at%70);pixels[i+1]=100+(at%90);pixels[i+2]=190;pixels[i+3]=255}
 const f=fixture(async()=>true,{pixels}),own='data:image/png;base64,AAAA',saved=item('photo',{photo:{kind:'own',img:own,ownImg:own}});f.state.items.push(saved);f.attrs([saved]);await tick();assert.ok(f.choice('color:suggestion'));assert.equal(f.state.items[0].family,null);assert.equal(f.state.items[0].attrSource,'owner');assert.equal(f.calls.length,0);await f.tap(f.choice('color:suggestion'));await choose(f,['pattern:solid','formality:2']);await f.tap(f.confirm());assert.equal(W.assessment(f.state.items[0]).ready,true);assert.equal(f.state.items[0].attrSource,'owner-confirmed');
});
test('dark or visually flat photo does not invent a color suggestion', async () => {
 const pixels=new Uint8ClampedArray(96*96*4);for(let i=3;i<pixels.length;i+=4)pixels[i]=255;
 const f=fixture(async()=>true,{pixels}),own='data:image/png;base64,AAAA',saved=item('photo',{photo:{kind:'own',img:own,ownImg:own}});f.state.items.push(saved);f.attrs([saved]);await tick();assert.equal(f.choice('color:suggestion'),null);assert.equal(f.calls.length,0);assert.equal(f.state.items[0].family,null);assert.match(f.document.querySelector('#attributeCheck').textContent,/사진이 많이 어둡습니다/);
});
test('season requested by the caller stays unknown when the user chooses unknown', async () => {
 const f=fixture(async()=>true),saved=item('old',{family:'navy',light:20,pattern:'solid',formality:2});f.state.items.push(saved);let result;f.attrs([saved],{season:'겨울',onComplete:value=>{result=value}});await choose(f,['season:unknown']);await f.tap(f.confirm());assert.deepEqual(copy(f.state.items[0].seasons),[]);assert.equal(W.assessment(f.state.items[0],{season:'겨울'}).ready,false);assert.deepEqual(copy(result.remaining),['old']);
});
test('combined real entry, short checks, recommendation cards and compare callback save an exact catalog candidate', async () => {
 const D=require('../src/discovery.js'),C=require('../src/catalog.js'),J=require('../src/judge.js');
 const raw=JSON.parse(fs.readFileSync(base+'/data/discovery-products.json','utf8'));
 assert.deepEqual(D.inspectCatalog(raw,{today:'2026-10-14'}).issues,[], 'actual catalog source and editorial attribution must validate');
 const f=fixture(async()=>true);f.state.prefs={needsPurpose:'daily',needsSeason:'',lastTab:''};f.state.rack=[];
 f.ctx.D=D;f.ctx.C=C;f.ctx.J=J;f.ctx.N=N;f.ctx.DISCOVERY_RAW=raw;f.ctx.today=()=> '2026-10-14';f.ctx.CATEGORY_WORDS={top:'TOPS',bottom:'BOTTOMS',outer:'OUTERWEAR',dress:'DRESSES',shoes:'SHOES'};
 f.ctx.won=(price)=>price.toLocaleString('ko-KR')+'원';f.ctx.cands=()=>f.ctx.state.items.filter(row=>row.status==='candidate');f.ctx.window.scrollTo=()=>{};
 f.ctx.segmented=()=>f.ctx.h('div');f.ctx.pic=(it)=>f.ctx.h('span',{text:it.name});f.ctx.draftReviewButton=()=>f.ctx.h('button');
 vm.runInContext(fs.readFileSync(base+'/src/needs-ui.js','utf8')+'\nthis.showNeeds=()=>renderNeeds(document.querySelector("#main"));',f.ctx);
 // Use the real registration buttons, not synthetic item injection.
 f.open();await f.tap(f.kind('top','shirt'));await f.tap(f.save());await f.tap(f.document.querySelector('[aria-label="옷 추가 닫기"]'));
 f.open();await f.tap(f.kind('bottom','denim'));await f.tap(f.save());await f.tap(f.document.querySelector('[aria-label="옷 추가 닫기"]'));
 assert.equal(f.state.items.length,2);assert.ok(f.state.items.every(row=>!W.assessment(row).ready));assert.ok(f.state.items.every(row=>row.brand===''&&row.price===null));
 // Real card confirmations provide only owned-garment attributes.
 let complete=0;f.attrs(f.state.items,{onComplete:()=>{complete++;f.ctx.showNeeds()}});
 await choose(f,['family:white','light:85','pattern:solid','formality:1']);await f.tap(f.confirm());
 await choose(f,['family:navy','light:20','pattern:solid','formality:1']);await f.tap(f.confirm());
 assert.equal(complete,1);assert.ok(f.state.items.every(row=>W.assessment(row).ready));
 const ownedBefore=copy(f.state.items),plan=D.recommend(f.state.items,raw,{purpose:'daily',today:'2026-10-14'});assert.ok(plan.recommendations.length,'verified actual catalog must provide at least one matching item');
 const chosen=plan.recommendations[0].product,main=f.document.querySelector('#main');
 assert.ok(main.querySelector('[data-discovery-product="'+chosen.id+'"]'));assert.match(main.textContent,new RegExp(chosen.brand.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));assert.ok(main.textContent.includes(chosen.name));
 const button=main.querySelector('[data-discovery-compare="'+chosen.id+'"]');assert.ok(button);await f.tap(button);
 const candidate=f.state.items.find(row=>row.status==='candidate');assert.ok(candidate);assert.equal(candidate.brand,chosen.brand);assert.equal(candidate.name,chosen.name);assert.equal(candidate.product.code,chosen.model);assert.equal(candidate.link,chosen.link);assert.equal(candidate.price,chosen.priceKRW);assert.equal(f.ctx.ui.judgeId,candidate.id);assert.equal(f.ctx.ui.tab,'judge');
 assert.deepEqual(copy(f.state.items.filter(row=>row.status==='owned')),ownedBefore);const durable=JSON.parse(f.storage.get('state'));assert.equal(durable.items.find(row=>row.status==='candidate').link,chosen.link);
});
test('failed attribute callback preserves later in-place color and pattern changes in memory and durable queue', async () => {
 const hold=deferred(),f=fixture(async(_payload,n)=>n===1?hold.promise:true),saved=item('old');f.state.items.push(saved);f.attrs([saved]);await choose(f,color);const started=f.tap(f.confirm());await tick();
 f.state.items[0].family='white';f.state.items[0].pattern='stripe';const newer=f.ctx.save();hold.resolve(false);await Promise.all([started,newer]);
 assert.equal(f.state.items[0].family,'white');assert.equal(f.state.items[0].pattern,'stripe');const durable=JSON.parse(f.storage.get('state')).items[0];assert.equal(durable.family,'white');assert.equal(durable.pattern,'stripe');
});
test('failed new registration preserves a subsequently edited live row rather than deleting it through baseline alias', async () => {
 const hold=deferred(),f=fixture(async(_payload,n)=>n===1?hold.promise:true);f.open();await f.tap(f.kind());const started=f.tap(f.save());await tick();
 const id=f.state.items[0].id;f.state.items[0].brand='user-added brand';f.state.items[0].family='white';const newer=f.ctx.save();hold.resolve(false);await Promise.all([started,newer]);
 assert.equal(f.state.items.length,1);assert.equal(f.state.items[0].id,id);assert.equal(f.state.items[0].brand,'user-added brand');const durable=JSON.parse(f.storage.get('state')).items[0];assert.equal(durable.brand,'user-added brand');assert.equal(durable.family,'white');assert.match(f.document.querySelector('#easyEntryStatus').textContent,/등록 중 수정한 기록은 남겨/);
});
test('retry after a later-edited registration was retained does not create a second copy', async () => {
 const hold=deferred(),f=fixture(async(_payload,n)=>n===1?hold.promise:true);f.open();await f.tap(f.kind());const started=f.tap(f.save());await tick();
 f.state.items[0].brand='edited';const newer=f.ctx.save();hold.resolve(false);await Promise.all([started,newer]);const id=f.state.items[0].id;await f.tap(f.save());assert.equal(f.state.items.length,1);assert.equal(f.state.items[0].id,id);assert.equal(f.state.items[0].brand,'edited');assert.match(f.document.querySelector('#easyEntryStatus').textContent,/이미 이 옷의 기록이 남아/);
});
