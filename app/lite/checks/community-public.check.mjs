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
  CROWD_DB: fakeD1(), COMMUNITY_DB: fakeD1(), COMMUNITY_MODE: 'public', COMMUNITY_OPERATOR: '운영자(예시)', COMMUNITY_CONTACT: 'contact@example.test',
  MEMBER_SESSION_SECRET: 's'.repeat(40), KAKAO_REST_KEY: 'k', ...extra,
});
const call = async (e, method, path, body, who = {}) => {
  const res = await handleCommunity(new Request(`https://x.test${path}`, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }), e, who);
  return { status: res.status, body: await res.json() };
};

test('public은 운영자 이름·연락처·회원 로그인 설정이 모두 있어야 열리고, 빠진 것을 알려 준다', async () => {
  const none = await call({ CROWD_DB: fakeD1(), COMMUNITY_MODE: 'public' }, 'GET', '/api/community/status');
  assert.deepEqual([none.status, none.body.code], [503, 'public_not_ready']);
  assert.deepEqual(none.body.missing.sort(), ['contact', 'database', 'login', 'operator']);
  const noLogin = await call(ready({ KAKAO_REST_KEY: '' }), 'GET', '/api/community/status');
  assert.deepEqual(noLogin.body.missing, ['login']);
  const open = await call(ready(), 'GET', '/api/community/status');
  assert.equal(open.status, 200);
  assert.equal(open.body.mode, 'public');
  assert.equal(open.body.member, null);
  assert.equal(open.body.signedIn, false);
  assert.deepEqual(open.body.login, { kakao: true, google: false, email: false });
  // 이메일 인증만 있어도 로그인 준비로 친다.
  const mailOnly = await call(ready({ KAKAO_REST_KEY: '', EMAIL_FROM: 'no-reply@hangit.test', RESEND_API_KEY: 're_x' }), 'GET', '/api/community/status');
  assert.equal(mailOnly.status, 200);
  assert.deepEqual(mailOnly.body.login, { kakao: false, google: false, email: true });
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

// 보안 검토(10-28, 별도 에이전트) 반영.
test('public은 개인 앱 DB와 다른 커뮤니티 전용 DB(COMMUNITY_DB)가 있어야 열리고, 글은 그 DB에만 들어간다', async () => {
  const shared = ready({ COMMUNITY_DB: undefined });
  const r = await call(shared, 'GET', '/api/community/status');
  assert.deepEqual([r.status, r.body.missing], [503, ['database']]);
  const same = ready();
  same.COMMUNITY_DB = same.CROWD_DB;
  assert.deepEqual((await call(same, 'GET', '/api/community/status')).body.missing, ['database']);
  const e = ready();
  const who = { member: 'm1', operator: false };
  await call(e, 'POST', '/api/community/join', { name: '대담', rules: 1, age14: true }, who);
  await call(e, 'POST', '/api/community/posts', { post: { text: '글', pieces: [{ kind: 'coat', color: 'navy', label: '코트' }], consent: false }, photos: [] }, who);
  assert.equal(e.COMMUNITY_DB.raw.prepare('SELECT COUNT(*) AS n FROM community_posts').get().n, 1);
  assert.equal(e.CROWD_DB.raw.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'community_posts'").get().n, 0);
});

test('public 자동 숨김은 가입한 지 3일이 지난 회원의 신고만 센다(새 계정 여러 개로 남의 글을 숨기지 못하게)', async () => {
  const e = ready();
  const DAY = 86400_000;
  let t = 1_000 * DAY;
  const at = { now: () => t };
  const req = (who, path, body) => handleCommunity(new Request(`https://x.test/api/community/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }), e, who, at).then((r) => r.json());
  const author = { member: 'author', operator: false };
  await req(author, 'join', { name: '작성자', rules: 1, age14: true });
  const old = ['o1', 'o2', 'o3'].map((m) => ({ member: m, operator: false }));
  for (const [i, w] of old.entries()) await req(w, 'join', { name: `오래${i}`, rules: 1, age14: true });
  const { id } = await req(author, 'posts', { post: { text: '내 코디', pieces: [{ kind: 'coat', color: 'navy', label: '코트' }], consent: false }, photos: [] });
  t += 4 * DAY;
  const fresh = ['n1', 'n2', 'n3'].map((m) => ({ member: m, operator: false }));
  for (const [i, w] of fresh.entries()) { await req(w, 'join', { name: `새${i}`, rules: 1, age14: true }); await req(w, 'reports', { post: id, reason: 'ad' }); }
  const hidden = () => e.COMMUNITY_DB.raw.prepare('SELECT hidden FROM community_posts WHERE id = ?').get(id).hidden;
  assert.equal(hidden(), null, '새 계정 3개의 신고로는 숨겨지지 않는다');
  for (const w of old) await req(w, 'reports', { post: id, reason: 'ad' });
  assert.equal(hidden(), 'reports');
});

test('/c는 정적 파일이 주소를 바꿔 답해도(307) 따라가서 연다. 해시 없는 아이콘은 오래 묶어 두지 않는다', async () => {
  const files = { '/community-shell': '<!doctype html><title>c</title>', '/community-public.json': JSON.stringify({ files: ['/icons/icon.svg'] }), '/icons/icon.svg': '<svg/>' };
  const ASSETS = { fetch: async (req) => {
    const p = new URL(req.url).pathname;
    if (p === '/community-shell.html') return new Response(null, { status: 307, headers: { location: '/community-shell' } });
    return Object.hasOwn(files, p) ? new Response(files[p]) : new Response('nf', { status: 404 });
  } };
  const w = createWorker({ authorize: async () => ({ ok: false, status: 401 }) });
  const env = { ...ready(), ASSETS, PRIVATE_AUTH_MODE: 'session' };
  const shell = await w.fetch(new Request('https://hangit.test/c'), env);
  assert.equal(shell.status, 200);
  assert.match(await shell.text(), /<title>c<\/title>/);
  const icon = await w.fetch(new Request('https://hangit.test/icons/icon.svg'), env);
  assert.equal(icon.status, 200);
  assert.doesNotMatch(icon.headers.get('cache-control') || '', /immutable/);
});
