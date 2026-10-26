import test from 'node:test';
import assert from 'node:assert/strict';
import {createMock} from '../src/core.mjs';
const reactionModule=await import('../src/outfits/reaction-session.js').catch(()=>({}));
const aiModule=await import('../src/outfits/ai-session.js').catch(()=>({}));
const KEY='eoul-d12-hang:outfit-reactions:v1';
const memory=()=>{const values=new Map();return {values,getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};};
const reaction=(id='r_first',verdict='like')=>({id,garmentIds:['shirt','pants'],verdict,reasons:[],occasion:'work',at:'2026-10-27T00:00:00.000Z'});
const input=id=>({outfits:[{id,garmentIds:['shirt','pants']}],context:{query:id}});
const response=id=>({summary:'기록 기준이에요.',ranking:[{id,reason:'확인된 옷을 비교했어요.'}],attribute_check:{lines:[],note:'일부 표현만 대조했어요.'}});
test('passive scene/weather search preserves saved history and the active product conditions',()=>{
 const storage=memory(),m=createMock({storage,key:'eoul-d12-hang:v1',requireStorage:true});
 assert.equal(typeof m.readSearch,'function');const result=m.ask('출근 셔츠 10만원 이하'),id=result.products[0].id;
 const before=storage.getItem('eoul-d12-hang:v1'),conditions=m.product(id).keptConditions;
 m.readSearch('겨울 코트');m.readSearch('읽지 못할 표현');assert.equal(storage.getItem('eoul-d12-hang:v1'),before);assert.equal(m.product(id).keptConditions,conditions);
 m.ask('주말 바지');assert.notEqual(storage.getItem('eoul-d12-hang:v1'),before);
});
test('reaction updates keep one id and merge unrelated records without overwriting a newer same-id response',async()=>{
 assert.equal(typeof reactionModule.createReactionSession,'function');const core=createMock(),storage=memory();
 const a=reactionModule.createReactionSession({core,storage});await a.put(reaction());const old=reactionModule.createReactionSession({core,storage});
 await a.put(reaction('r_first','dislike'));const current=storage.getItem(KEY);await old.put(reaction('r_first','like'));assert.equal(storage.getItem(KEY),current);await old.put(reaction('r_second'));
 assert.equal(core.readOutfitReactions(storage.getItem(KEY)).reactions.find(r=>r.id==='r_first').verdict,'dislike');assert.equal(old.getSnapshot().persisted,false);assert.match(old.getSnapshot().notice,/다른/);assert.equal(core.readOutfitReactions(storage.getItem(KEY)).reactions.length,2);
});
test('failed reaction input stays in RAM and unrelated successes do not rebase its original comparison',async()=>{
 assert.equal(typeof reactionModule.createReactionSession,'function');const core=createMock(),storage=memory(),base=reactionModule.createReactionSession({core,storage});await base.put(reaction());
 const a=reactionModule.createReactionSession({core,storage}),b=reactionModule.createReactionSession({core,storage}),set=storage.setItem;let fail=true;
 storage.setItem=(k,v)=>{if(fail){fail=false;throw Error('quota');}return set(k,v);};
 await a.put({...reaction('r_first','dislike'),reasons:['not_my_style']});await b.put({...reaction('r_first','like'),reasons:['good_color']});await a.put(reaction('r_second'));const raw=storage.getItem(KEY);await a.retry();assert.equal(storage.getItem(KEY),raw);assert.equal(a.getSnapshot().persisted,false);assert.equal(a.getSnapshot().bag.reactions.find(r=>r.id==='r_first').verdict,'dislike');
});
test('future reaction source blocks writes and an idempotent retry does not double-count a durable write',async()=>{
 assert.equal(typeof reactionModule.createReactionSession,'function');const core=createMock(),storage=memory(),raw=' {"v":99,"reactions":[]} ';storage.setItem(KEY,raw);const future=reactionModule.createReactionSession({core,storage});await future.put(reaction());assert.equal(storage.getItem(KEY),raw);assert.ok(future.getSnapshot().blocked);
 storage.removeItem(KEY);const get=storage.getItem,set=storage.setItem;let failedRead=false,writes=0;storage.getItem=k=>{if(failedRead){failedRead=false;throw Error('read');}return get(k);};storage.setItem=(k,v)=>{writes++;set(k,v);failedRead=true;};const s=reactionModule.createReactionSession({core,storage});await s.put(reaction());assert.equal(s.getSnapshot().persisted,false);await s.retry();assert.equal(s.getSnapshot().persisted,true);assert.equal(writes,1);assert.equal(core.readOutfitReactions(get(KEY)).reactions.length,1);
});
test('AI result is tied to its exact source and a late old response never replaces a newer result',async()=>{
 assert.equal(typeof aiModule.createOutfitAI,'function');const pending=[];const ai=aiModule.createOutfitAI({request:value=>new Promise(resolve=>pending.push({value,resolve})),accept:(request,out)=>{assert.equal(out.ranking[0].id,request.outfits[0].id);return out;}});
 ai.setSource(input('o_first'));const first=ai.ask();ai.setSource(input('o_second'));const second=ai.ask();pending[1].resolve(response('o_second'));await second;assert.equal(ai.getSnapshot().result.ranking[0].id,'o_second');pending[0].resolve(response('o_first'));await first;assert.equal(ai.getSnapshot().result.ranking[0].id,'o_second');
 ai.setSource(input('o_first'));await ai.ask();assert.equal(pending.length,2);assert.equal(ai.getSnapshot().cached,true);
});
test('double click shares one AI call and disposal or malformed output cannot create an AI ranking',async()=>{
 assert.equal(typeof aiModule.createOutfitAI,'function');let calls=0,resolve;const ai=aiModule.createOutfitAI({request:()=>{calls++;return new Promise(r=>resolve=r);},accept:(_,out)=>out});ai.setSource(input('o_first'));const a=ai.ask(),b=ai.ask();assert.equal(calls,1);ai.dispose();resolve(response('o_first'));await Promise.all([a,b]);assert.equal(ai.getSnapshot().result,null);
 const broken=aiModule.createOutfitAI({request:async()=>({ranking:[]}),accept:()=>{throw Error('invalid');}});broken.setSource(input('o_first'));await broken.ask();assert.equal(broken.getSnapshot().phase,'error');assert.equal(broken.getSnapshot().result,null);
});
