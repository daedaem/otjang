// The primary administrator is a server-side singleton, never a client role or first signup.
import { authorizePrivateRequest } from './private-access.js';
const MEMBER = /^[a-f0-9]{32}$/;
const HEADERS = { 'cache-control': 'private, no-store', 'content-type': 'application/json; charset=utf-8' };
const reply = (status, code) => Response.json(status === 200 ? { ok:true } : { code }, { status, headers:HEADERS });
const ready = new WeakSet();
function database(env) {
  const db=env?.COMMUNITY_DB;
  if (!db || typeof db.prepare !== 'function') throw Error('dedicated account database required');
  return db;
}
async function ensure(db) {
  if (ready.has(db)) return;
  await db.prepare("CREATE TABLE IF NOT EXISTS app_primary_admin (slot INTEGER PRIMARY KEY CHECK(slot=1), member TEXT NOT NULL UNIQUE, linked_at INTEGER NOT NULL)").run();
  ready.add(db);
}
export async function primaryAdmin(env,{create=true}={}) {
  const db=database(env);
  if(create) await ensure(db);
  else {
    const table=await db.prepare("SELECT type FROM sqlite_master WHERE name='app_primary_admin'").first();
    if(!table) return null;
    if(table.type!=='table') throw Error('invalid administrator storage');
  }
  const row=await db.prepare('SELECT member FROM app_primary_admin WHERE slot=1').first();
  if (row && !MEMBER.test(row.member)) throw Error('invalid administrator record');
  return row?.member || null;
}
export async function appActor(env, member) {
  if (!MEMBER.test(member || '')) throw Error('invalid authenticated member');
  const admin=(await primaryAdmin(env)) === member;
  return { role:admin ? 'owner' : 'member', member:admin ? 'owner' : member, sessionMember:member };
}
// Called only with an identity established by account creation or a provider callback.
// Extra SQL is internal code, not HTTP input; password creation joins this transaction.
export async function bindPrimaryAdmin(request, env, member, { authorizeOwner=authorizePrivateRequest, now=Date.now, statements=[] }={}) {
  if (request.method !== 'POST' || request.headers.get('origin') !== new URL(request.url).origin) return reply(403,'invalid_origin');
  let access;
  try { access=await authorizeOwner(request,env); } catch { return reply(403,'owner_only'); }
  if (access?.ok !== true) return reply(403,'owner_only');
  if (!MEMBER.test(member || '')) return reply(400,'invalid_member');
  try {
    const db=database(env); await ensure(db);
    if (await primaryAdmin(env)) return reply(409,'admin_already_linked');
    const insert=db.prepare('INSERT INTO app_primary_admin (slot,member,linked_at) VALUES (1,?1,?2)').bind(member,now());
    const results=statements.length ? await db.batch([insert,...statements]) : [await insert.run()];
    return results[0]?.meta?.changes === 1 ? reply(200) : reply(409,'admin_already_linked');
  } catch {
    if (await primaryAdmin(env).catch(()=>null)) return reply(409,'admin_already_linked');
    return reply(503,'admin_link_unavailable');
  }
}
