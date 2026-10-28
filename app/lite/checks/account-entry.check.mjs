import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createWorker } from '../worker.js';
import { handlePrivateSession } from '../functions/lib/private-session.js';
import { handleCommunity } from '../functions/api/community.js';
import { memberFromRequest } from '../functions/lib/member-session.js';
const ORIGIN='https://app.test';
const PASSWORD='qa-normal-admin-password';
function d1() {
  const raw=new DatabaseSync(':memory:');
  const db={raw,prepare(sql){let args=[];const st={bind(...a){args=a;return st;},async first(){return raw.prepare(sql).get(...args)??null;},async all(){return {results:raw.prepare(sql).all(...args)};},execute(){return {meta:{changes:Number(raw.prepare(sql).run(...args).changes)}};},async run(){return st.execute();}};return st;},async batch(st){raw.exec('BEGIN IMMEDIATE');try{const result=st.map(s=>s.execute());raw.exec('COMMIT');return result;}catch(e){raw.exec('ROLLBACK');throw e;}}};return db;
}
function fixture() {
  const privateDb=d1(), community=d1(), rankCalls=[];
  const env={PRIVATE_AUTH_MODE:'session',PRIVATE_APP_ACCESS_KEY:'qa-only-old-owner-key',MEMBER_APP_MODE:'accounts',COMMUNITY_MODE:'private',RANK_DB:privateDb,CROWD_DB:privateDb,COMMUNITY_DB:community,ASSETS:{fetch:async()=>new Response('<html><head></head><body>TEST_APP</body></html>',{headers:{'content-type':'text/html'}})}};
  const worker=createWorker({rank:async(_r,_e,options)=>{rankCalls.push(options?.member||'owner');return Response.json({ok:true});}});
  const req=(path,method='GET',body,headers={})=>new Request(ORIGIN+path,{method,headers:{origin:ORIGIN,'content-type':'application/json',...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const call=(path,method='GET',body,headers={})=>worker.fetch(req(path,method,body,headers),env);
  return {env,worker,call,req,db:community,rankCalls};
}
const cookie=(r,name)=>r.headers.getSetCookie().find(c=>c.startsWith(name+'='))?.split(';')[0];
const memberCookie=r=>cookie(r,'__Host-hangit-member');
async function ownerCookie(f) {
  const r=await handlePrivateSession(f.req('/_private/session','POST',{password:f.env.PRIVATE_APP_ACCESS_KEY}),f.env);
  assert.equal(r.status,200); return cookie(r,'__Host-otjang-session');
}
async function setup(f,old) {
  return f.call('/_private/admin-setup','POST',{email:'admin@example.test',password:PASSWORD,confirm:PASSWORD},{cookie:old});
}

test('the ordinary front door is account login, with no additional shared-password gate',async()=>{
  const f=fixture(), r=await f.call('/');
  assert.equal(r.status,303);assert.equal(r.headers.get('location'),'/_member/signin');
  const page=await f.call('/_member/signin');assert.equal(page.status,200);
  const html=await page.text();assert.match(html,/<h1>로그인<\/h1>/);assert.doesNotMatch(html,/<h1>본인 전용 접속/);
  const api=await f.call('/api/rank','POST',{});assert.equal(api.status,401);assert.equal(f.rankCalls.length,0);
});
test('anonymous and forged role input cannot initialize an administrator',async()=>{
  const f=fixture();
  const denied=await f.call('/_private/admin-setup','POST',{email:'x@example.test',password:PASSWORD,confirm:PASSWORD,role:'owner'},{'x-role':'owner'});
  assert.equal(denied.status,401);
  assert.equal(f.db.raw.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name='app_primary_admin'").get().n,1);
  assert.equal(f.db.raw.prepare('SELECT COUNT(*) AS n FROM app_primary_admin').get().n,0);
});
test('the authenticated owner creates one normal account, retaining owner storage and community identity',async()=>{
  const f=fixture(), old=await ownerCookie(f);
  await handleCommunity(f.req('/api/community/join','POST',{name:'기존본인',rules:1,age14:true}),f.env,{member:'owner',operator:true});
  const form=await f.call('/_private/admin-setup','GET',undefined,{cookie:old});assert.equal(form.status,200);assert.match(await form.text(),/관리자 계정 만들기/);
  const made=await setup(f,old);assert.equal(made.status,200);assert.equal((await made.clone().json()).scope,'owner');
  const session=memberCookie(made);assert.ok(session);
  const actual=await memberFromRequest(f.req('/', 'GET',undefined,{cookie:session}),f.env,{provider:'password'});
  assert.match(actual,/^[a-f0-9]{32}$/);
  const app=await f.call('/','GET',undefined,{cookie:session});const html=await app.text();
  assert.match(html,/hangit-role" content="owner"/);assert.match(html,/hangit-storage-scope" content="owner"/);
  const status=await f.call('/api/community/status','GET',undefined,{cookie:session});assert.deepEqual((await status.json()).member,{name:'기존본인'});
  assert.equal((await f.call('/_private/readiness?format=json','GET',undefined,{cookie:session})).status,200);
  const dump=JSON.stringify(f.db.raw.prepare('SELECT * FROM member_accounts').all());assert.ok(!dump.includes(PASSWORD));assert.ok(!dump.includes('admin@example.test'));
});
test('after setup the old shared password and owner cookie cannot act as another administrator login',async()=>{
  const f=fixture(), old=await ownerCookie(f);assert.equal((await setup(f,old)).status,200);
  const replay=await f.call('/_private/readiness?format=json','GET',undefined,{cookie:old,accept:'application/json'});assert.equal(replay.status,401);
  assert.equal((await f.call('/_private/session','POST',{password:f.env.PRIVATE_APP_ACCESS_KEY})).status,401);
  const login=await f.call('/_member/password/signin','POST',{email:'admin@example.test',password:PASSWORD});assert.equal(login.status,200);assert.equal((await login.clone().json()).scope,'owner');
  assert.equal((await f.call('/','GET',undefined,{cookie:memberCookie(login)})).status,200);
});
test('an invited normal member uses the app but never inherits owner data or administrative APIs',async()=>{
  const f=fixture(), old=await ownerCookie(f), admin=await setup(f,old), auth={cookie:memberCookie(admin)};
  const invite=await f.call('/_member/invites','POST',{label:'합성친구'},auth);assert.equal(invite.status,200);const code=(await invite.json()).code;
  const made=await f.call('/_member/password/signup','POST',{code,email:'friend@example.test',password:'qa-friend-password',age14:true});assert.equal(made.status,200);
  const scope=(await made.clone().json()).scope;assert.match(scope,/^m-[a-f0-9]{32}$/);
  const friend={cookie:memberCookie(made)};const html=await (await f.call('/','GET',undefined,friend)).text();
  assert.match(html,/hangit-role" content="member"/);assert.ok(html.includes(scope));assert.doesNotMatch(html,/hangit-storage-scope" content="owner"/);
  for(const path of ['/_private/readiness','/_private/admin-setup','/_member/invites']) assert.equal((await f.call(path,'GET',undefined,friend)).status,403);
  assert.equal((await f.call('/api/rank','POST',{}, {...friend,'x-hangit-scope':'owner'})).status,409);assert.equal(f.rankCalls.length,0);
  assert.equal((await f.call('/api/rank','POST',{}, {...friend,'x-hangit-scope':scope})).status,200);assert.equal(f.rankCalls[0],await memberFromRequest(f.req('/', 'GET',undefined,friend),f.env));
});
test('administrator logout revokes the normal session and self-delete cannot orphan its role',async()=>{
  const f=fixture(), old=await ownerCookie(f), made=await setup(f,old), auth={cookie:memberCookie(made)};
  assert.equal((await f.call('/_private/status','POST',{},auth)).status,405);
  assert.equal((await f.call('/_member/account/delete','POST',{confirm:true},auth)).status,409);
  f.env.MEMBER_APP_MODE='invite';
  assert.equal((await f.call('/_member/account/delete','POST',{confirm:true},auth)).status,409,'a mode rollback cannot orphan the administrator');
  f.env.MEMBER_APP_MODE='accounts';
  const out=await f.call('/_private/logout','POST',{},auth);assert.equal(out.status,200);
  assert.equal(await memberFromRequest(f.req('/', 'GET',undefined,auth),f.env),null);
  assert.equal((await f.call('/_private/readiness?format=json','GET',undefined,auth)).status,401);
  assert.equal(f.db.raw.prepare('SELECT COUNT(*) AS n FROM app_primary_admin').get().n,1);
});

test('a session failure after account creation returns a normal login path without losing the administrator',async()=>{
  const f=fixture(), old=await ownerCookie(f);
  f.db.raw.exec("CREATE TABLE member_sessions (token_hash TEXT PRIMARY KEY, member TEXT NOT NULL, provider TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL); CREATE TRIGGER fail_new_session BEFORE INSERT ON member_sessions BEGIN SELECT RAISE(ABORT,'qa session fault'); END");
  const made=await setup(f,old);assert.equal(made.status,201);assert.equal((await made.json()).loginRequired,true);
  assert.equal(f.db.raw.prepare('SELECT COUNT(*) AS n FROM member_accounts').get().n,1);
  assert.equal(f.db.raw.prepare('SELECT COUNT(*) AS n FROM app_primary_admin').get().n,1);
  f.db.raw.exec('DROP TRIGGER fail_new_session');
  const login=await f.call('/_member/password/signin','POST',{email:'admin@example.test',password:PASSWORD});assert.equal(login.status,200);assert.equal((await login.clone().json()).scope,'owner');
  assert.equal((await f.call('/_private/readiness?format=json','GET',undefined,{cookie:memberCookie(login)})).status,200);
});

test('public community authority also follows the linked account rather than the old owner cookie',async()=>{
  const f=fixture(),old=await ownerCookie(f),made=await setup(f,old),auth={cookie:memberCookie(made)};
  Object.assign(f.env,{COMMUNITY_MODE:'public',COMMUNITY_OPERATOR:'QA operator',COMMUNITY_CONTACT:'qa@example.test',MEMBER_SESSION_SECRET:'qa-'.repeat(20),KAKAO_REST_KEY:'qa-not-a-live-key'});
  const status=await f.call('/api/community/status','GET',undefined,auth);assert.equal(status.status,200);assert.equal((await status.json()).isOperator,true);
  const oldStatus=await f.call('/api/community/status','GET',undefined,{cookie:old});assert.equal((await oldStatus.json()).isOperator,false);
  assert.equal((await f.call('/api/community/review','GET',undefined,{cookie:old})).status,401);
});
test('concurrent administrator setup and injected account failure never create two roles or orphan accounts',async()=>{
  const f=fixture(), old=await ownerCookie(f);
  await f.call('/_private/admin-setup','GET',undefined,{cookie:old});
  f.db.raw.exec("CREATE TRIGGER fail_account BEFORE INSERT ON member_accounts BEGIN SELECT RAISE(ABORT,'qa account fault'); END");
  assert.equal((await setup(f,old)).status,503);
  assert.equal(f.db.raw.prepare('SELECT COUNT(*) AS n FROM app_primary_admin').get().n,0);
  f.db.raw.exec('DROP TRIGGER fail_account');
  const responses=await Promise.all(['a','b'].map(s=>f.call('/_private/admin-setup','POST',{email:s+'@example.test',password:PASSWORD,confirm:PASSWORD},{cookie:old})));
  assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
  assert.equal(f.db.raw.prepare('SELECT COUNT(*) AS n FROM member_accounts').get().n,1);
  assert.equal(f.db.raw.prepare('SELECT COUNT(*) AS n FROM app_primary_admin').get().n,1);
});
