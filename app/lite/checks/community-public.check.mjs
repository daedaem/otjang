// 코디 공유 공개 모드 점검(C4·C5). 대표 10-28 11:47: 카카오+구글, 14세 미만 받지 않음, 운영자 정보는 대표가 제공(값은 Git에 넣지 않음).
// public은 운영자 정보·연락처·회원 로그인 설정이 모두 있어야만 열린다. 공개되는 것은 /c 화면과 그 파일, 커뮤니티 API뿐이다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { handleCommunity } from '../functions/api/community.js';
import { createWorker } from '../worker.js';

function fakeD1() {
  const db = new DatabaseSync(':memory:');
  return {
    raw: db,
    prepare(sql) {
      let args = [];
      const st = { bind(...a) { args = a; return st; },
        async first() { return db.prepare(sql).get(...args) ?? null; },
        async all() { return { results: db.prepare(sql).all(...args) }; },
        execute() { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; },
        async run() { return st.execute(); } };
      return st;
    },
    async batch(s) { db.exec('BEGIN'); try { const o = s.map((x) => x.execute()); db.exec('COMMIT'); return o; } catch (e) { db.exec('ROLLBACK'); throw e; } },
  };
}
const ready = (extra = {}) => ({
  CROWD_DB: fakeD1(), COMMUNITY_MODE: 'public', COMMUNITY_OPERATOR: '운영자(예시)', COMMUNITY_CONTACT: 'contact@example.test',
  MEMBER_SESSION_SECRET: 's'.repeat(40), KAKAO_REST_KEY: 'k', ...extra,
});
const call = async (e, method, path, body, who = {}) => {
  const res = await handleCommunity(new Request(`https://x.test${path}`, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }), e, who);
  return { status: res.status, body: await res.json() };
};

test('public은 운영자 이름·연락처·회원 로그인 설정이 모두 있어야 열리고, 빠진 것을 알려 준다', async () => {
  const none = await call({ CROWD_DB: fakeD1(), COMMUNITY_MODE: 'public' }, 'GET', '/api/community/status');
  assert.deepEqual([none.status, none.body.code], [503, 'public_not_ready']);
  assert.deepEqual(none.body.missing.sort(), ['contact', 'login', 'operator']);
  const noLogin = await call(ready({ KAKAO_REST_KEY: '' }), 'GET', '/api/community/status');
  assert.deepEqual(noLogin.body.missing, ['login']);
  const open = await call(ready(), 'GET', '/api/community/status');
  assert.equal(open.status, 200);
  assert.equal(open.body.mode, 'public');
  assert.equal(open.body.member, null);
  assert.equal(open.body.signedIn, false);
  assert.deepEqual(open.body.login, { kakao: true, google: false });
  assert.deepEqual(open.body.operator, { name: '운영자(예시)', contact: 'contact@example.test', privacyOfficer: '운영자(예시)' });
  assert.equal(open.body.minAge, 14);
});

test('로그인하지 않으면 상태만 볼 수 있고 피드·글쓰기·사진은 401이다', async () => {
  const e = ready();
  assert.equal((await call(e, 'GET', '/api/community/feed')).status, 401);
  assert.equal((await call(e, 'POST', '/api/community/join', { name: '대담', rules: 1, age14: true })).status, 401);
  assert.equal((await call(e, 'GET', '/api/community/photos/x')).status, 401);
});

test('가입은 만 14세 이상 확인이 있어야 한다(모든 모드)', async () => {
  for (const e of [ready(), { CROWD_DB: fakeD1(), COMMUNITY_MODE: 'private' }]) {
    const who = { member: 'm1', operator: false };
    const no = await call(e, 'POST', '/api/community/join', { name: '대담', rules: 1 }, who);
    assert.deepEqual([no.status, no.body.code], [400, 'age_required']);
    assert.equal((await call(e, 'POST', '/api/community/join', { name: '대담', rules: 1, age14: true }, who)).status, 200);
  }
});

test('private 상태에도 운영자 정보가 있으면 보여 준다', async () => {
  const s = await call({ CROWD_DB: fakeD1(), COMMUNITY_MODE: 'private', COMMUNITY_OPERATOR: '운영자', COMMUNITY_CONTACT: 'c@example.test' }, 'GET', '/api/community/status', null, { member: 'owner', operator: true });
  assert.equal(s.body.signedIn, true);
  assert.deepEqual(s.body.operator, { name: '운영자', contact: 'c@example.test', privacyOfficer: '운영자' });
});

// Worker 경로: 기본(꺼짐·private)에서는 어떤 것도 새로 공개되지 않는다.
const assets = (files = { '/community-shell.html': '<!doctype html><title>c</title>', '/community-public.json': JSON.stringify({ files: ['/react/community-shell-abc.js', '/react/shell-abc.css'] }), '/react/community-shell-abc.js': 'x', '/react/shell-abc.css': 'y', '/react/home-abc.js': 'secret', '/index.html': 'app' }) => ({
  fetch: async (req) => {
    const p = new URL(req.url).pathname;
    return Object.hasOwn(files, p) ? new Response(files[p], { status: 200 }) : new Response('nf', { status: 404 });
  },
});
function worker({ owner = false, member = null } = {}) {
  const seen = [];
  const w = createWorker({
    authorize: async () => (owner ? { ok: true } : { ok: false, status: 401 }),
    community: async (_r, _e, who) => { seen.push(who); return Response.json({ ok: true }); },
    member: async () => member,
    memberAuth: async (req) => Response.json({ memberAuth: new URL(req.url).pathname }),
  });
  return { w, seen };
}
const get = (w, env, path, init) => w.fetch(new Request(`https://hangit.test${path}`, init), { ASSETS: assets(), PRIVATE_AUTH_MODE: 'session', ...env });

test('기본·private에서는 /c, 회원 로그인, 커뮤니티 API 모두 본인 로그인 뒤에만 닿는다', async () => {
  for (const mode of [undefined, 'off', 'private']) {
    const { w, seen } = worker();
    for (const path of ['/c', '/_member/login/kakao', '/api/community/status', '/react/community-shell-abc.js']) {
      const r = await get(w, { COMMUNITY_MODE: mode }, path);
      assert.ok([303, 401].includes(r.status), `${mode} ${path} ${r.status}`);
    }
    assert.equal(seen.length, 0);
  }
});

test('public: /c 화면과 허용 목록의 파일만 로그인 없이 열리고, 나머지 앱은 그대로 잠겨 있다', async () => {
  const { w } = worker();
  const env = ready();
  const shell = await get(w, env, '/c');
  assert.equal(shell.status, 200);
  assert.match(await shell.text(), /<title>c<\/title>/);
  assert.match(shell.headers.get('content-security-policy') || '', /frame-ancestors 'none'/);
  assert.equal((await get(w, env, '/react/community-shell-abc.js')).status, 200);
  assert.equal((await get(w, env, '/react/shell-abc.css')).status, 200);
  for (const path of ['/', '/react/home-abc.js', '/index.html', '/api/rank', '/api/adpick?q=x']) {
    const r = await get(w, env, path);
    assert.ok([303, 401].includes(r.status), `${path} ${r.status}`);
  }
  const auth = await get(w, env, '/_member/login/kakao');
  assert.deepEqual(await auth.json(), { memberAuth: '/_member/login/kakao' });
});

test('public 커뮤니티 API: 본인은 운영자, 회원은 회원, 로그인 안 한 사람은 신원 없이 넘긴다. 다른 출처의 쓰기는 막는다', async () => {
  const env = ready();
  const a = worker({ owner: true });
  await get(a.w, env, '/api/community/status');
  assert.deepEqual(a.seen[0], { member: 'owner', operator: true });
  const b = worker({ member: 'abc123' });
  await get(b.w, env, '/api/community/status');
  assert.deepEqual(b.seen[0], { member: 'abc123', operator: false });
  const c = worker();
  await get(c.w, env, '/api/community/status');
  assert.deepEqual(c.seen[0], {});
  const d = worker({ member: 'abc123' });
  const cross = await get(d.w, env, '/api/community/posts', { method: 'POST', headers: { origin: 'https://evil.test', 'content-type': 'application/json' }, body: '{}' });
  assert.equal(cross.status, 403);
  assert.equal(d.seen.length, 0);
  const same = await get(d.w, env, '/api/community/posts', { method: 'POST', headers: { origin: 'https://hangit.test', 'content-type': 'application/json' }, body: '{}' });
  assert.equal(same.status, 200);
});

test('public이어도 준비가 덜 되면(운영자 정보·로그인 없음) /c와 회원 로그인은 열리지 않는다', async () => {
  const { w } = worker();
  const env = { COMMUNITY_MODE: 'public', CROWD_DB: fakeD1() };
  for (const path of ['/c', '/_member/login/kakao', '/react/community-shell-abc.js']) {
    const r = await get(w, env, path);
    assert.ok([303, 401].includes(r.status), `${path} ${r.status}`);
  }
});
