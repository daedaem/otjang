import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
const origin = 'https://app.test';
const A = 'a'.repeat(32), B = 'b'.repeat(32);
function fixture() {
  const raw = new DatabaseSync(':memory:');
  const db = { raw, prepare(sql) {
    let args=[];
    const st={bind(...a){args=a;return st;},async first(){return raw.prepare(sql).get(...args)??null;},async run(){return {meta:{changes:Number(raw.prepare(sql).run(...args).changes)}};}};
    return st;
  }};
  return { db, env:{COMMUNITY_DB:db}, request:new Request(origin+'/_private/admin-link',{method:'POST',headers:{origin}}) };
}
const owner = async () => ({ok:true});

test('a regular first member is never automatically an administrator', async () => {
  const { appActor } = await import('../functions/lib/primary-admin.js');
  const f=fixture();
  assert.deepEqual(await appActor(f.env,A),{role:'member',member:A,sessionMember:A});
  assert.equal(f.db.raw.prepare('SELECT COUNT(*) AS n FROM app_primary_admin').get().n,0);
});
test('linking requires authenticated owner proof and never accepts a forged role header', async () => {
  const { bindPrimaryAdmin } = await import('../functions/lib/primary-admin.js');
  const f=fixture();
  const request=new Request(f.request,{headers:{origin,'x-role':'owner'}});
  const result=await bindPrimaryAdmin(request,f.env,A,{authorizeOwner:async()=>({ok:false,status:401})});
  assert.equal(result.status,403);
  assert.equal(f.db.raw.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name='app_primary_admin'").get().n,0);
});
test('only one concurrent owner-authorized link wins; later requests cannot replace the administrator', async () => {
  const { bindPrimaryAdmin,appActor } = await import('../functions/lib/primary-admin.js');
  const f=fixture();
  const responses=await Promise.all([A,B].map(id=>bindPrimaryAdmin(f.request,f.env,id,{authorizeOwner:owner})));
  assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
  const selected=f.db.raw.prepare('SELECT member FROM app_primary_admin').get().member;
  assert.deepEqual(await appActor(f.env,selected),{role:'owner',member:'owner',sessionMember:selected});
  assert.equal((await bindPrimaryAdmin(f.request,f.env,B,{authorizeOwner:owner})).status,409);
  assert.equal(f.db.raw.prepare('SELECT COUNT(*) AS n FROM app_primary_admin').get().n,1);
});
test('foreign origins, missing dedicated storage and malformed members fail before a privilege is written', async () => {
  const { bindPrimaryAdmin,appActor } = await import('../functions/lib/primary-admin.js');
  const f=fixture();
  assert.equal((await bindPrimaryAdmin(new Request(origin+'/_private/admin-link',{method:'POST',headers:{origin:'https://evil.test'}}),f.env,A,{authorizeOwner:owner})).status,403);
  assert.equal((await bindPrimaryAdmin(f.request,f.env,'owner',{authorizeOwner:owner})).status,400);
  assert.equal((await bindPrimaryAdmin(f.request,{CROWD_DB:f.db},A,{authorizeOwner:owner})).status,503);
  await assert.rejects(appActor({},A));
  assert.equal(f.db.raw.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name='app_primary_admin'").get().n,0);
});
