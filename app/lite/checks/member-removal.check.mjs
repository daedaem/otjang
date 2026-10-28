import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { handleMemberAccounts } from '../functions/lib/member-accounts.js';
import { handleCommunity } from '../functions/api/community.js';

function memoryD1() {
  const raw = new DatabaseSync(':memory:');
  return {
    raw,
    prepare(sql) {
      let args = [];
      const st = {
        bind(...a) { args = a; return st; },
        async first() { return raw.prepare(sql).get(...args) ?? null; },
        async all() { return { results: raw.prepare(sql).all(...args) }; },
        execute() { return { meta: { changes: Number(raw.prepare(sql).run(...args).changes) } }; },
        async run() { return st.execute(); },
      };
      return st;
    },
    async batch(statements) {
      raw.exec('BEGIN IMMEDIATE');
      try { const rows = statements.map(s => s.execute()); raw.exec('COMMIT'); return rows; }
      catch (error) { raw.exec('ROLLBACK'); throw error; }
    },
  };
}
const A = 'pw_qa-author', B = 'pw_qa-other';
const JPEG = Buffer.from([255, 216, 255, 224, 0, 255, 217]).toString('base64');
const currentTime = Date.UTC(2026, 9, 29);
const request = (path, method, data) => new Request('https://qa.test' + path, {
  method, headers: { origin: 'https://qa.test', 'content-type': 'application/json' },
  ...(data === undefined ? {} : { body: JSON.stringify(data) }),
});
async function setup(separate, schema) {
  const db = memoryD1(), privateDb = memoryD1();
  privateDb.raw.exec("CREATE TABLE untouched (id TEXT PRIMARY KEY, value TEXT); INSERT INTO untouched VALUES ('private','KEEP_PRIVATE');");
  const env = { MEMBER_APP_MODE: 'invite', COMMUNITY_MODE: 'private', CROWD_DB: separate ? privateDb : db, ...(separate ? { COMMUNITY_DB: db } : {}) };
  const account = (path, method, data, who = {}) => handleMemberAccounts(request(path, method, data), env, who, { now: () => currentTime });
  assert.equal((await account('/_member/invites?format=json', 'GET', undefined, { owner: true })).status, 200);
  const made = await account('/_member/invites', 'POST', { label: '합성 회원 A' }, { owner: true });
  const code = (await made.json()).code.replaceAll('-', '');
  for (const member of [A, B]) db.raw.prepare('INSERT INTO member_accounts (member,email_key,salt,hash,iterations,invite,created_at) VALUES (?,?,?,?,?,?,?)')
    .run(member, 'qa-email-key-' + member, 'qa-salt', 'qa-hash', 1, code, currentTime);
  db.raw.prepare('INSERT INTO member_settings (k,v) VALUES (?,?)').run('qa-global', 'KEEP_SHARED_SETTING');
  db.raw.prepare('UPDATE member_invites SET used_at=?,used_by=? WHERE code=?').run(currentTime, A, code);
  if (schema !== 'none') {
    db.raw.exec('CREATE TABLE member_sessions (token_hash TEXT PRIMARY KEY,member TEXT NOT NULL,provider TEXT NOT NULL,created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL)');
    for (const member of [A, B]) db.raw.prepare('INSERT INTO member_sessions VALUES (?,?,?,?,?)').run('qa-token-' + member, member, 'password', currentTime, currentTime + 10000);
    for (const [member, name] of [[A, '작성회원'], [B, '다른회원']]) {
      const who = { member, operator: false };
      assert.equal((await handleCommunity(request('/api/community/join', 'POST', { name, rules: 1, age14: true }), env, who)).status, 200);
      const post = schema === 'legacy'
        ? { text: '옛 코디', pieces: [], consent: true }
        : { board: 'sale', title: '합성 세일 ' + member, text: '제보', pieces: [], consent: true, sale: { merchant: '예시 판매처', price: 30000, sourceUrl: 'https://shop.example.com/qa' } };
      assert.equal((await handleCommunity(request('/api/community/posts', 'POST', { post, photos: [JPEG] }), env, who)).status, 200);
    }
    if (schema === 'legacy') db.raw.exec('DROP TABLE community_post_details');
  }
  const remove = entry => entry === 'account'
    ? account('/_member/account/delete', 'POST', { confirm: true }, { member: A })
    : account('/_member/invites/remove', 'POST', { code }, { owner: true });
  const count = (table, column = 'member') => Number(db.raw.prepare(`SELECT COUNT(*) n FROM ${table} WHERE ${column}=?`).get(A).n);
  const snapshot = () => {
    const names = db.raw.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(r => r.name);
    return Object.fromEntries(names.map(name => [name, db.raw.prepare(`SELECT * FROM "${name}" ORDER BY 1`).all()]));
  };
  return { db, privateDb, env, account, code, remove, count, snapshot };
}

for (const separate of [false, true]) for (const entry of ['account', 'invite']) {
  for (const schema of ['none', 'legacy', 'current']) test(`${entry} removal uses only the selected ${separate ? 'separate community' : 'fallback'} DB (${schema} tables)`, async () => {
    const f = await setup(separate, schema);
    const otherBefore = f.snapshot().member_accounts.find(r => r.member === B);
    const r = await f.remove(entry);
    assert.equal(r.status, 200);
    assert.equal(f.count('member_accounts'), 0);
    assert.deepEqual(f.snapshot().member_accounts.find(r => r.member === B), otherBefore);
    assert.equal(f.db.raw.prepare('SELECT v FROM member_settings WHERE k=?').get('qa-global').v, 'KEEP_SHARED_SETTING');
    assert.equal(f.privateDb.raw.prepare('SELECT value FROM untouched').get().value, 'KEEP_PRIVATE');
    if (schema !== 'none') {
      for (const table of ['member_sessions', 'community_members', 'community_posts', 'community_photos']) assert.equal(f.count(table), 0, table);
      assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM community_posts WHERE member=?').get(B).n, 1);
      assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM community_photos WHERE member=?').get(B).n, 1);
      if (schema === 'current') {
        const details = f.db.raw.prepare('SELECT title FROM community_post_details').all();
        assert.deepEqual(details.map(d => d.title), ['합성 세일 ' + B]);
      }
    }
    if (entry === 'invite') assert.equal(f.db.raw.prepare('SELECT revoked_at FROM member_invites WHERE code=?').get(f.code).revoked_at, currentTime);
  });

  for (const failure of ['photos', 'account']) test(`${entry} removal rolls back a ${failure} failure and succeeds on retry (${separate ? 'separate' : 'fallback'})`, async () => {
    const f = await setup(separate, 'current');
    const table = failure === 'photos' ? 'community_photos' : 'member_accounts';
    f.db.raw.exec(`CREATE TRIGGER qa_delete_failure BEFORE DELETE ON ${table} WHEN OLD.member='${A}' BEGIN SELECT RAISE(ABORT,'QA transient failure'); END`);
    const before = f.snapshot();
    const failed = await f.remove(entry);
    assert.equal(failed.status, 503);
    assert.equal(failed.headers.get('set-cookie'), null);
    assert.deepEqual(f.snapshot(), before);
    f.db.raw.exec('DROP TRIGGER qa_delete_failure');
    assert.equal((await f.remove(entry)).status, 200);
    assert.equal(f.count('member_accounts'), 0);
    assert.equal(f.count('community_photos'), 0);
    assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM community_post_details').get().n, 1);
  });
}

for (const separate of [false, true]) test(`owner invitation revocation is in the same removal transaction (${separate ? 'separate' : 'fallback'})`, async () => {
  const f = await setup(separate, 'current');
  f.db.raw.exec("CREATE TRIGGER qa_revoke_failure BEFORE UPDATE ON member_invites BEGIN SELECT RAISE(ABORT,'QA transient failure'); END");
  const before = f.snapshot();
  assert.equal((await f.remove('invite')).status, 503);
  assert.deepEqual(f.snapshot(), before);
  f.db.raw.exec('DROP TRIGGER qa_revoke_failure');
  assert.equal((await f.remove('invite')).status, 200);
  assert.equal(f.count('member_accounts'), 0);
});

test('identical COMMUNITY_DB and CROWD_DB bindings preserve the same scoped removal', async () => {
  const f = await setup(false, 'current');
  f.env.COMMUNITY_DB = f.db;
  assert.equal((await f.remove('account')).status, 200);
  assert.equal(f.count('member_accounts'), 0);
  assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM community_post_details').get().n, 1);
  assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM community_posts WHERE member=?').get(B).n, 1);
});

for (const separate of [false, true]) for (const remains of ['photo', 'reservation'])
  test(`retry repairs identifiable details left by an old partial deletion (${remains}, ${separate ? 'separate' : 'fallback'})`, async () => {
    const f = await setup(separate, 'current');
    // Reproduce the old partial state only in this synthetic in-memory database.
    f.db.raw.prepare('DELETE FROM community_posts WHERE member=?').run(A);
    f.db.raw.prepare('DELETE FROM member_accounts WHERE member=?').run(A);
    f.db.raw.prepare('DELETE FROM member_sessions WHERE member=?').run(A);
    if (remains === 'reservation') f.db.raw.prepare('DELETE FROM community_photos WHERE member=?').run(A);
    else f.db.raw.prepare('DELETE FROM community_post_usage WHERE member=?').run(A);
    assert.equal((await f.remove('invite')).status, 200);
    assert.equal(f.count('community_photos'), 0);
    assert.deepEqual(f.db.raw.prepare('SELECT title FROM community_post_details').all().map(r => r.title), ['합성 세일 ' + B]);
    assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM community_posts WHERE member=?').get(B).n, 1);
  });
