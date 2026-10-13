// Execute the real app's sync functions with synthetic HTTP responses. This
// verifies orchestration/headers/recovery without claiming a browser or server run.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const S = require('../src/sync.js'), W = require('../src/wardrobe.js'), C = require('../src/catalog.js'), B = require('../src/beta.js');
const html = fs.readFileSync(__dirname + '/../src/app.html', 'utf8');
const code = html.slice(html.indexOf('  async function syncFetch('), html.indexOf('  function renderSync()'));
const cleanStateCode = html.slice(html.indexOf('  function cleanState(raw)'), html.indexOf('  function defaultRack('));
const betaUi = fs.readFileSync(__dirname + '/../src/beta-ui.js', 'utf8');
const enterAccountCode = betaUi.slice(betaUi.indexOf('async function enterAccount('), betaUi.indexOf('async function leaveAccount('));
const clone = (v) => JSON.parse(JSON.stringify(v));
const meta = { contract: 2, wardrobeSchema: 2, followup: { outcomes: ['purchased', 'not-purchased', 'pending', 'returned'], sizeResults: ['right', 'small', 'large', 'unknown'], returnReasons: ['size', 'fit', 'color', 'material', 'quality', 'changed', 'price', 'other', 'unknown'] } };
function setup(options = {}) {
  const decision = W.cleanDecision({ id: 'unit-decision', itemId: 'unit-item', name: '합성 복구', before: { lean: 'unsure', at: '2026-10-13' }, after: { decision: 'buy', at: '2026-10-13' },
    followup: { outcome: 'returned', sizeResult: 'small', returnReason: 'size', worn: 'no', regret: 'unknown', note: '합성 단위 복구', at: '2026-10-13' } });
  const wardrobe = W.cleanWardrobe({ schema: 2, owner: { nickname: '합성 계정' }, items: [{ id: 'unit-item', cat: 'top', name: '합성 옷', status: 'gone' }], decisions: [decision] });
  const requests = [], receipts = new Map(), srv = { version: 8, wardrobe: { ...clone(wardrobe), decisions: [{ ...clone(decision), followup: null }] }, catalog: { schema: 1, kind: 'catalog', name: '', note: '', products: [] }, writes: 0 };
  let saves = 0;
  const ui = { syncBase: 'http://127.0.0.1:8124', syncOrigin: 'http://127.0.0.1:8124', syncToken: 'synthetic-unit-token', syncUserInfo: { ownerId: 77 }, syncVersion: options.version ?? null, syncPhotos: false };
  const ctx = vm.createContext({ ui, state: { ...clone(wardrobe), catalog: { products: [] }, syncFollowupAck: null }, SY: S, W, C, B, str: W.str, render() {}, requireFreshStorage: async () => {}, accountScope: () => 'unit-account-77',
    AbortController, setTimeout, clearTimeout,
    save: async () => { saves++; return saves !== options.failSave; },
    fetch: async (url, request) => {
      const path = new URL(url).pathname, headers = new Headers(request.headers), body = request.body;
      requests.push({ path, method: request.method || 'GET', headers, body });
      const response = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'X-Wardrobe-Version': String(srv.version) } });
      if (path === '/api/meta') return response(meta);
      if (path === '/api/auth/me') return response({ ownerId: 77, username: 'synthetic' });
      if (path === '/api/wardrobe') return response(srv.wardrobe);
      if (path === '/api/catalog') return response(srv.catalog);
      if (path === '/api/wardrobe/import' || path === '/api/catalog/import') {
        if (headers.get('If-Match') !== '"' + srv.version + '"') return response({ detail: '합성 stale 버전' }, 409);
        const key = headers.get('Idempotency-Key'), replayed = receipts.has(key), data = JSON.parse(body), wardrobe = path.includes('wardrobe');
        if (!replayed) { if (wardrobe) srv.wardrobe = clone(data); else srv.catalog = clone(data); srv.version++; srv.writes++; receipts.set(key, body); }
        return response({ items: wardrobe ? data.items.length : data.products.length, created: replayed ? 0 : 1, updated: 0, decisions: wardrobe ? data.decisions.length : 0, replayed });
      }
      return response({}, 404);
    } });
  vm.runInContext(code, ctx);
  return { ctx, requests, receipts, srv, decision, saves: () => saves };
}

// Exercise the actual cache cleaner and login entry before syncPush. Unrelated
// preference adapters are synthetic; stamp/ack validation is production code.
async function reloadAccount(t, stamp, ack) {
  t.ctx.state.syncStamp = stamp; t.ctx.state.syncFollowupAck = ack;
  const cached = JSON.stringify(t.ctx.state);
  Object.assign(t.ctx, { store: { db: {}, revision: 0, persistedSnapshots: new Map(), conflicts: new Set(), conflict: false },
    savePromise: Promise.resolve(), kvGet: async () => cached, lsSnapshot: () => null,
    num: W.num, cleanPrefs: () => ({}), cleanPickLog: () => [] });
  t.ctx.accountScope = () => t.ctx.ui.syncScope || 'state';
  t.ctx.localStorageKey = () => 'local:' + t.ctx.accountScope();
  t.ctx.ui.syncScope = ''; t.ctx.ui.syncVersion = null;
  vm.runInContext(cleanStateCode + '\n' + enterAccountCode, t.ctx);
  await t.ctx.enterAccount({ token: 'x'.repeat(43), user: { ownerId: 77, username: 'synthetic' } }, t.ctx.ui.syncBase);
}
const ackFor = (t, serverVersion, extra = {}) => S.makeFollowupAck({ origin: t.ctx.ui.syncOrigin, ownerId: 77, serverVersion, capture: 'pull', completeSnapshot: true, ...extra }, t.ctx.state.decisions);
function remoteCorrection(t) {
  t.srv.wardrobe.decisions[0].followup = { ...clone(t.decision.followup), outcome: 'purchased', sizeResult: 'right', returnReason: 'unknown', note: '다른 기기의 최신 구매 정정' };
  t.srv.wardrobe.items[0].status = 'owned';
}

test('실제 앱 push: 로컬 복원으로 버전이 없을 때만 현재 revision을 읽고 반환·사이즈를 복구한다', async () => {
  const t = setup(); await t.ctx.syncPush();
  assert.deepEqual(t.requests.map((r) => r.path), ['/api/meta', '/api/wardrobe', '/api/wardrobe/import', '/api/catalog/import']);
  const writes = t.requests.filter((r) => r.method === 'POST');
  assert.equal(writes[0].headers.get('If-Match'), '"8"'); assert.equal(writes[1].headers.get('If-Match'), '"9"');
  assert.ok(writes.every((r) => r.headers.get('X-Eoul-Contract') === '2' && r.headers.get('Authorization') === 'Bearer synthetic-unit-token'));
  assert.deepEqual(t.srv.wardrobe.decisions[0].followup, t.decision.followup);
  assert.equal(t.ctx.state.syncFollowupAck.capture, 'push'); assert.equal(t.ctx.state.syncFollowupAck.completeSnapshot, false);
  assert.equal(t.ctx.state.syncFollowupAck.decisions[0].fingerprint, S.followupFingerprint(t.decision));
  assert.match(t.ctx.ui.syncMsg, /보냈습니다/);
});

test('실제 앱 push: 이미 아는 stale revision의 409는 자동 갱신·재전송하지 않는다', async () => {
  const t = setup({ version: 7 }), before = clone(t.ctx.state), remote = clone(t.srv.wardrobe);
  await t.ctx.syncPush();
  assert.deepEqual(t.requests.map((r) => r.path), ['/api/meta', '/api/wardrobe/import']);
  assert.equal(t.requests[1].headers.get('If-Match'), '"7"'); assert.equal(t.srv.writes, 0);
  assert.deepEqual(clone(t.ctx.state), before); assert.deepEqual(t.srv.wardrobe, remote);
  assert.equal(t.ctx.ui.syncVersion, 7); assert.match(t.ctx.ui.syncMsg, /409/);
});

test('실제 앱 push: 성공 후 baseline 저장 실패는 승인하지 않고 동일 본문 영수증 재생으로 회복한다', async () => {
  const t = setup({ version: 8, failSave: 2 }); await t.ctx.syncPush();
  assert.equal(t.srv.writes, 2); assert.equal(t.ctx.state.syncFollowupAck, null);
  assert.match(t.ctx.ui.syncMsg, /확인 기록을 보관하지 못했습니다/);
  const changedRemote = [{ ...t.decision, followup: { ...t.decision.followup, outcome: 'purchased', returnReason: 'unknown' } }];
  const unsafe = S.checkPullProtection(t.ctx.state.decisions, changedRemote, { source: { origin: t.ctx.ui.syncOrigin, ownerId: 77 }, serverVersion: 11, ack: t.ctx.state.syncFollowupAck, discovery: { status: 200, meta }, completeIncoming: true });
  assert.equal(unsafe.ok, false); assert.equal(unsafe.conflicts[0].localOnly, true);
  await t.ctx.syncPush();
  const posts = t.requests.filter((r) => r.path === '/api/wardrobe/import');
  assert.equal(posts.length, 2); assert.equal(posts[0].body, posts[1].body); assert.equal(posts[0].headers.get('Idempotency-Key'), posts[1].headers.get('Idempotency-Key'));
  assert.equal(t.srv.writes, 2, '재전송은 새로운 서버 수정 없이 영수증 재생');
  assert.equal(t.ctx.state.syncFollowupAck.decisions[0].fingerprint, S.followupFingerprint(t.decision));
  assert.match(t.ctx.ui.syncMsg, /저장된 결과/);
});

test('실제 재로그인: 정상 stamp·ack의 이전 revision은 최신 서버 정정을 409로 보호한다', async () => {
  const t = setup(), origin = t.ctx.ui.syncOrigin, ack = ackFor(t, 7);
  remoteCorrection(t);
  await reloadAccount(t, { origin, ownerId: 77, version: 7 }, ack);
  assert.equal(t.ctx.ui.syncVersion, 7);
  const before = clone(t.ctx.state), remote = clone(t.srv.wardrobe);
  await t.ctx.syncPush();
  assert.deepEqual(t.requests.map((r) => r.path), ['/api/auth/me', '/api/meta', '/api/wardrobe/import']);
  assert.equal(t.requests[2].headers.get('If-Match'), '"7"');
  assert.equal(t.srv.writes, 0); assert.deepEqual(t.srv.wardrobe, remote);
  assert.deepEqual(clone(t.ctx.state), before); assert.match(t.ctx.ui.syncMsg, /409/);
});

test('실제 재로그인: stamp가 없거나 무효여도 같은 계정 ack의 이전 revision을 복원하며 probe·재시도하지 않는다', async () => {
  for (const stamp of [undefined, null,
    { origin: 'http://127.0.0.1:8124', ownerId: 77, version: '7' },
    { origin: 'http://127.0.0.1:8124', ownerId: 77, version: -1 },
    { origin: 'http://127.0.0.1:8124', ownerId: 78, version: 8 }]) {
    const t = setup(), ack = ackFor(t, 7); remoteCorrection(t);
    await reloadAccount(t, stamp, ack);
    assert.equal(t.ctx.ui.syncVersion, null);
    const before = clone(t.ctx.state), remote = clone(t.srv.wardrobe);
    await t.ctx.syncPush(); await t.ctx.syncPush();
    assert.deepEqual(t.requests.map((r) => r.path), ['/api/auth/me', '/api/meta', '/api/wardrobe/import', '/api/meta', '/api/wardrobe/import']);
    assert.ok(t.requests.filter((r) => r.method === 'POST').every((r) => r.headers.get('If-Match') === '"7"' && r.headers.get('X-Eoul-Contract') === '2'));
    assert.equal(t.ctx.ui.syncVersion, 7); assert.equal(t.srv.writes, 0);
    assert.deepEqual(t.srv.wardrobe, remote); assert.deepEqual(clone(t.ctx.state), before);
    assert.match(t.ctx.ui.syncMsg, /409/);
  }
});

test('실제 재로그인: 다른 계정·출처 또는 손상 ack는 쓰기 버전으로 쓰지 않고 명시 첫 보내기를 유지한다', async () => {
  for (const kind of ['none', 'owner', 'origin', 'invalid']) {
    const t = setup();
    const ack = kind === 'none' ? null : kind === 'owner' ? ackFor(t, 7, { ownerId: 78 }) : kind === 'origin' ? ackFor(t, 7, { origin: 'http://localhost:8124' }) : { ...ackFor(t, 7), serverVersion: '7' };
    await reloadAccount(t, null, ack);
    assert.equal(t.ctx.ui.syncVersion, null);
    await t.ctx.syncPush();
    assert.deepEqual(t.requests.map((r) => r.path), ['/api/auth/me', '/api/meta', '/api/wardrobe', '/api/wardrobe/import', '/api/catalog/import']);
    assert.equal(t.requests[3].headers.get('If-Match'), '"8"'); assert.equal(t.srv.writes, 2);
    assert.deepEqual(t.srv.wardrobe.decisions[0].followup, t.decision.followup);
    assert.equal(t.ctx.state.syncFollowupAck.origin, t.ctx.ui.syncOrigin);
    assert.equal(t.ctx.state.syncFollowupAck.ownerId, 77);
  }
});

test('실제 재로그인: stamp 없이도 현재 revision의 ack는 미전송 로컬 결과를 정상 저장한다', async () => {
  const t = setup(), ack = ackFor(t, 8);
  t.srv.wardrobe.decisions = [clone(t.decision)];
  t.ctx.state.decisions[0].followup.note = '이번 기기의 미전송 정정';
  await reloadAccount(t, null, ack);
  await t.ctx.syncPush();
  assert.deepEqual(t.requests.map((r) => r.path), ['/api/auth/me', '/api/meta', '/api/wardrobe/import', '/api/catalog/import']);
  assert.equal(t.requests[2].headers.get('If-Match'), '"8"'); assert.equal(t.requests[3].headers.get('If-Match'), '"9"');
  assert.equal(t.srv.writes, 2); assert.equal(t.srv.wardrobe.decisions[0].followup.note, '이번 기기의 미전송 정정');
  assert.equal(t.ctx.state.syncFollowupAck.serverVersion, 9);
  assert.equal(t.ctx.state.syncFollowupAck.decisions[0].fingerprint, S.followupFingerprint(t.ctx.state.decisions[0]));
});
