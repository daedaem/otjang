// Production recommendation renderer/click/save/CAS callbacks. DOM and storage
// adapters below are synthetic. This is not a camera/browser/device E2E test.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const W = require('../src/wardrobe.js'), C = require('../src/catalog.js'), D = require('../src/discovery.js'), N = require('../src/needs.js'), SC = require('../src/storage-cas.js');
const html = fs.readFileSync(__dirname + '/../src/app.html', 'utf8');
const src = fs.readFileSync(__dirname + '/../src/needs-ui.js', 'utf8');
const start = html.indexOf('  function save() {'), end = html.indexOf('  // Undo only the values', start);
assert.ok(start >= 0 && end > start);
const production = html.slice(start, end) + '\n' + src;
const clone = (x) => JSON.parse(JSON.stringify(x));
const item = (id, cat, kind, extra = {}) => W.cleanItem({ id, name: id, cat, kind, family: 'navy', light: 20, formality: 2, pattern: 'solid', seasons: W.SEASONS, attrSource: 'owner-confirmed', status: 'owned', ...extra }, 0);
const product = (id, cat, kind, extra = {}) => {
  const link = 'https://example.com/product/' + id;
  return { id, brand: '검증 브랜드', name: '실제 ' + id, model: 'SKU-' + id, storeName: '공식 판매처', link, priceKRW: 39900, checkedAt: '2026-10-14', cat, kind, family: 'white', colorName: '화이트', light: 90, formality: 2, pattern: 'solid', seasons: W.SEASONS, editTags: ['daily','smart'], evidence: [{ url: link, fields: ['brand','name','model','link','priceKRW'], observedAt: '2026-10-14' }], availability: { status: 'unknown' }, ...extra };
};
const catalog = { products: [product('shirt', 'top', 'shirt'), product('chino', 'bottom', 'chino', {family:'beige',light:75}), product('sneaker','shoes','sneaker',{formality:1})] };
function element(type, props, ...children) {
  return { type, props: props || {}, children: children.flat(Infinity).filter(x => x != null), value: '', append(...more) { this.children.push(...more.flat(Infinity).filter(x => x != null)); } };
}
const nodes = (node) => [node, ...(node.children || []).filter(x => x && typeof x === 'object').flatMap(nodes)];
const words = (node) => nodes(node).map(n => n.props?.text || '').join(' ');
function harness(extra = {}) {
  const state = { items: [item('my-tee','top','tee'), item('my-jeans','bottom','denim')], owner: {}, decisions: [], rack: [], pickLog: [], meta: { sample: false }, prefs: { needsPurpose:'daily',needsSeason:'' }, ...extra };
  const storage = new Map(), raw = JSON.stringify(state), scope = 'account:A', lsKey = 'otjang-A'; storage.set(lsKey, raw);
  const store = { db: null, mode:'ls', revision:0, conflicts:new Set(), recoveryByScope:new Map(), persistedSnapshots:new Map([[scope,{idbValue:null,lsValue:raw}]]), writtenSnapshots:new Map() };
  const notices = [], confirms = [], toasts = [], writes = [], controls = { fail:0, throw:0, gate:null, beforeCommit:null };
  const ls = { getItem: (k) => storage.get(k) || null, setItem: (k,v) => { storage.set(k,v); writes.push({key:k,raw:v}); } };
  let ids = 0, renders = 0, ctx;
  ctx = vm.createContext({ state, ui:{ tab:'shop',judgeId:'' }, store, W, C, D, N, DISCOVERY_RAW:clone(catalog), storageOk:true, savePromise:Promise.resolve(true), scope, lsKey,
    window:{localStorage:ls,scrollTo:()=>{}}, navigator:{locks:{request:async(k,fn)=>fn()}},
    SC:{commitSnapshot:async(options)=>{ if(controls.beforeCommit) await controls.beforeCommit(options); if(controls.gate) await controls.gate;
      if(controls.throw>0){controls.throw--;throw new Error('synthetic storage exception');}
      if(controls.fail>0){controls.fail--;return {ok:false,conflict:false,mode:'ls'};}return SC.commitSnapshot(options); }},
    accountScope:()=>ctx.scope, localStorageKey:()=>ctx.lsKey, lsSnapshot:(key)=>ls.getItem(key), saveCommandProvenance:()=>[],
    h:element,
    $:()=>({textContent:'',classList:{toggle:()=>{}}}),
    today:()=>'2026-10-14',newId:(prefix)=>prefix+(++ids),canAdd:(kind,n)=>ctx.state.items.length+(n||0)<=2000,
    render:()=>{renders++;},toast:(text)=>toasts.push(text),won:(v)=>v.toLocaleString('ko-KR')+'원',
    SEASONS:W.SEASONS,FIELD_NAMES:{},CATEGORY_WORDS:{},pic:(it)=>element('img',{src:it.photo?.img}),swatch:()=> '#ddd',
    segmented:(id,label,opts,cur,onPick)=>element('fieldset',{id,label},opts.map(([value,text])=>element('button',{text,onclick:()=>onPick(value)}))),
    openEasyEntry:(opts)=>notices.push(opts),openAttributeCheck:(items,opts)=>confirms.push({items,opts}) });
  vm.runInContext(production,ctx);
  const card = (id='shirt') => {
    const row=D.recommend(ctx.state.items,ctx.DISCOVERY_RAW,{today:'2026-10-14'}).recommendations.concat(D.recommend(ctx.state.items,ctx.DISCOVERY_RAW,{today:'2026-10-14'}).explore).find(r=>r.product.id===id);
    assert.ok(row,id+' exists'); return ctx.discoveryProductCard(row,0,false);
  };
  const button = (id) => nodes(card(id)).find(n=>n.props['data-discovery-compare']);
  return {ctx,state,store,storage,controls,toasts,writes,confirms,notices,card,button,renders:()=>renders};
}

test('actual named cards retain brand/model/price/source/link and save exact candidate before comparison',async()=>{
 const t=harness(), card=t.card(), before=clone(t.state.items);assert.match(words(card),/검증 브랜드/);assert.match(words(card),/SKU-shirt/);assert.match(words(card),/39,900원/);assert.match(words(card),/2026-10-14/);
 const anchor=nodes(card).find(n=>n.type==='a');assert.equal(anchor.props.href,catalog.products[0].link);
 await t.button().props.onclick();const candidate=t.state.items.find(it=>it.status==='candidate');assert.ok(candidate);const durable=JSON.parse(t.storage.get('otjang-A'));
 assert.equal(durable.items.at(-1).id,candidate.id);assert.equal(t.ctx.ui.tab,'judge');assert.equal(t.ctx.ui.judgeId,candidate.id);
 assert.equal(candidate.brand,'검증 브랜드');assert.equal(candidate.product.code,'SKU-shirt');assert.equal(candidate.price,39900);assert.equal(candidate.link,anchor.props.href);assert.equal(candidate.checkedAt,'2026-10-14');assert.deepEqual(t.state.items.slice(0,2),before);
});
test('main recommendation renderer displays multiple real-product categories',()=>{
 const t=harness(), main=element('main');t.ctx.renderNeeds(main);const cards=nodes(main).filter(n=>n.props['data-discovery-product']);assert.ok(cards.length>=2);assert.ok(cards.some(n=>n.props['data-discovery-product']==='shirt'));assert.ok(cards.some(n=>n.props['data-discovery-product']==='chino'));assert.ok(!words(main).includes('실제 상품 추천은 준비 중'));
});
test('unknown price is labelled unknown, while verified zero remains zero',()=>{
 const t=harness();t.ctx.DISCOVERY_RAW.products[0].priceKRW=null;assert.match(words(t.card()),/가격은 판매처에서 확인/);assert.ok(!words(t.card()).includes('0원'));t.ctx.DISCOVERY_RAW.products[0].priceKRW=0;assert.match(words(t.card()),/0원/);
});
test('double tap and retry reuse one saved exact candidate',async()=>{
 const t=harness(), click=t.button().props.onclick;const a=click(),b=click();assert.equal(a,b);assert.equal(await a,true);await b;const id=t.ctx.ui.judgeId;t.ctx.ui.tab='shop';assert.equal(await click(),true);assert.equal(t.state.items.filter(it=>it.status==='candidate').length,1);assert.equal(t.ctx.ui.judgeId,id);assert.equal(t.writes.length,1);
});
for(const fault of ['fail','throw'])test('storage '+fault+' removes tentative row and keeps comparison closed',async()=>{
 const t=harness(), old=clone(t.state.items);t.controls[fault]=1;assert.equal(await t.button().props.onclick(),false);assert.deepEqual(t.state.items,old);assert.equal(t.ctx.ui.tab,'shop');assert.equal(JSON.parse(t.storage.get('otjang-A')).items.length,2);assert.ok(t.toasts.length);
});
test('changed actor during successful save does not navigate or mutate the new wardrobe',async()=>{
 const t=harness();let enter,finish;const entered=new Promise(r=>enter=r);t.controls.beforeCommit=async()=>{enter();await new Promise(r=>finish=r);};const pending=t.button().props.onclick();await entered;
 const next={items:[item('B','top','tee')],prefs:{},decisions:[],pickLog:[],rack:[]};t.ctx.state=next;t.ctx.scope='account:B';t.ctx.lsKey='otjang-B';t.ctx.ui.tab='closet';t.ctx.ui.judgeId='';finish();assert.equal(await pending,false);assert.equal(t.ctx.ui.tab,'closet');assert.equal(t.ctx.ui.judgeId,'');assert.equal(next.items.length,1);assert.equal(t.storage.has('otjang-B'),false);
});
test('later queued snapshot is repaired without losing an unrelated owned edit',async()=>{
 const t=harness();let enter,finish;const entered=new Promise(r=>enter=r);let calls=0;t.controls.beforeCommit=async()=>{if(++calls===1){enter();await new Promise(r=>finish=r);}};t.controls.fail=1;
 const pending=t.button().props.onclick();await entered;t.state.items[0].name='직접 고친 이름';const later=t.ctx.save();finish();await later;assert.equal(await pending,false);
 const durable=JSON.parse(t.storage.get('otjang-A'));assert.equal(durable.items.length,2);assert.equal(durable.items[0].name,'직접 고친 이름');assert.equal(t.state.items[0].name,'직접 고친 이름');assert.equal(t.ctx.ui.tab,'shop');
});
test('repair uses original actor storage after account switch and preserves the new account',async()=>{
 const t=harness();let enter,finish;const entered=new Promise(r=>enter=r);let calls=0;t.controls.beforeCommit=async()=>{if(++calls===1){enter();await new Promise(r=>finish=r);}};t.controls.fail=1;
 const pending=t.button().props.onclick();await entered;t.state.items[0].name='A 변경';const later=t.ctx.save();const next={items:[],decisions:[],rack:[],pickLog:[],prefs:{}};t.ctx.state=next;t.ctx.scope='account:B';t.ctx.lsKey='otjang-B';t.storage.set('otjang-B','B 원본');t.ctx.ui.tab='closet';finish();await later;assert.equal(await pending,false);
 assert.equal(JSON.parse(t.storage.get('otjang-A')).items.length,2);assert.equal(JSON.parse(t.storage.get('otjang-A')).items[0].name,'A 변경');assert.equal(t.storage.get('otjang-B'),'B 원본');assert.equal(next.items.length,0);assert.equal(t.ctx.ui.tab,'closet');
});
test('explicit later candidate edit is retained when its original registration fails',async()=>{
 const t=harness();let enter,finish;const entered=new Promise(r=>enter=r);let calls=0;t.controls.beforeCommit=async()=>{if(++calls===1){enter();await new Promise(r=>finish=r);}};t.controls.fail=1;
 const pending=t.button().props.onclick();await entered;const candidate=t.state.items.at(-1);candidate.detail='사용자가 직접 수정';const later=t.ctx.save();finish();await later;assert.equal(await pending,false);assert.equal(t.state.items.at(-1).detail,'사용자가 직접 수정');assert.equal(JSON.parse(t.storage.get('otjang-A')).items.at(-1).detail,'사용자가 직접 수정');assert.match(t.toasts.at(-1),/이후 편집/);
});
test('stale storage refuses candidate registration without overwriting the other tab',async()=>{
 const t=harness();t.storage.set('otjang-A','다른 탭 자료');assert.equal(await t.button().props.onclick(),false);assert.equal(t.state.items.length,2);assert.equal(t.writes.length,0);assert.equal(t.storage.get('otjang-A'),'다른 탭 자료');assert.match(t.toasts.at(-1),/다른 탭/);
});
test('capacity refusal preserves existing data and does not navigate',async()=>{
 const t=harness();t.ctx.canAdd=()=>false;assert.equal(await t.button().props.onclick(),false);assert.equal(t.state.items.length,2);assert.equal(t.writes.length,0);assert.equal(t.ctx.ui.tab,'shop');
});
test('pending attributes open the short confirmation API, not a full product editor',()=>{
 const t=harness({items:[item('pending','top','tee',{family:null,light:null,pattern:null,formality:null})]}),main=element('main');t.ctx.renderNeeds(main);const button=nodes(main).find(n=>n.props['data-discovery-confirm']);assert.ok(button);button.props.onclick();assert.equal(t.confirms.length,1);assert.equal(t.confirms[0].items[0].id,'pending');assert.equal(t.state.items[0].family,null);assert.match(words(main),/브랜드는 몰라도/);
});
test('empty wardrobe starts compact owned entry without a fake shopping recommendation',()=>{
 const t=harness({items:[]}),main=element('main');t.ctx.renderNeeds(main);assert.equal(nodes(main).filter(n=>n.props['data-discovery-product']).length,0);nodes(main).find(n=>n.props.id==='discoveryStart').props.onclick();assert.equal(t.notices[0].returnTab,'shop');
});
test('invalid product proof cannot be saved from a stale card',async()=>{
 const t=harness(),click=t.button().props.onclick;t.ctx.DISCOVERY_RAW.products[0].evidence=[];assert.equal(await click(),false);assert.equal(t.state.items.length,2);assert.equal(t.writes.length,0);
});
