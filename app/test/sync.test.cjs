// 실행: node --test test/   — 앱 ↔ 내 서버 보내기·받기의 순수 함수
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const S = require('../src/sync.js');
const W = require('../src/wardrobe.js');
const C = require('../src/catalog.js');
const IMG = 'data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA';
const base = W.migrate(JSON.parse(fs.readFileSync(__dirname + '/../data/sample-wardrobe.json', 'utf8')));

test('주소는 http(s)://호스트[:포트]만 받는다', () => {
  assert.equal(S.normalizeBase('http://localhost:8080/'), 'http://localhost:8080');
  assert.equal(S.normalizeBase(' HTTP://LocalHost:8080 '), 'http://localhost:8080');
  assert.equal(S.normalizeBase('https://192.168.0.10'), 'https://192.168.0.10');
  for (const bad of ['javascript:alert(1)', 'ftp://x', 'http://x/api', 'http://x:99999', 'localhost:8080', '', null]) assert.equal(S.normalizeBase(bad), '', String(bad));
  assert.ok(S.isLocalAddress('http://localhost:8080') && S.isLocalAddress('http://127.0.0.1:9') && !S.isLocalAddress('http://192.168.0.10:8080') && !S.isLocalAddress('bad'));
});

test('보내는 옷장 파일은 보유·후보·처분과 판정 기록을 모두 담고, 서버가 정리해도 같은 옷이 된다', () => {
  const st = { owner: base.owner, items: base.items.concat([W.cleanItem({ id: 'c1', status: 'candidate', cat: 'top', kind: 'knit', name: '후보' }, 0)]), decisions: [], catalog: { products: [] } };
  const p = S.wardrobePayload(st, { photos: true });
  assert.equal(p.schema, 2); assert.equal(p.items.length, 14);
  assert.deepEqual(W.cleanWardrobe(p).items, st.items, '정리해도 그대로');
});

test('사진을 빼고 보내면 내 사진은 사진 없음이 되고, 상품 사진은 상태·출처만 남는다', () => {
  let a = W.setOwnPhoto(base.items[0], IMG);
  let b = W.confirmProduct(W.setOwnPhoto(base.items[1], IMG), { brand: 'B', name: 'N', img: IMG, sourceName: '쇼핑몰' });
  const p = S.wardrobePayload({ owner: base.owner, items: [a, b], decisions: [] }, { photos: false });
  assert.equal(p.items[0].photo.kind, 'none'); assert.equal(p.items[0].photo.ownImg, '');
  assert.equal(p.items[1].photo.kind, 'confirmed'); assert.equal(p.items[1].photo.img, ''); assert.equal(p.items[1].photo.ownImg, ''); assert.equal(p.items[1].photo.sourceName, '쇼핑몰');
  assert.ok(!JSON.stringify(p).includes('data:image'), '사진 데이터가 하나도 없다');
  const w = S.wardrobePayload({ owner: base.owner, items: [a], decisions: [] }, { photos: true });
  assert.equal(w.items[0].photo.ownImg, IMG);
  assert.equal(a.photo.ownImg, IMG, '원본 상태는 바뀌지 않는다');
});

test('받을 때 서버에 내 사진이 없으면 이 브라우저의 내 사진을 남긴다', () => {
  const local = [W.setOwnPhoto(base.items[0], IMG), base.items[1]];
  const pulled = W.cleanWardrobe(S.wardrobePayload({ owner: base.owner, items: local, decisions: [] }, { photos: false })).items;
  const m = S.mergePulled(local, pulled);
  assert.equal(m[0].photo.kind, 'own'); assert.equal(m[0].photo.ownImg, IMG);
  assert.equal(m[1].photo.kind, 'none');
});

test('상품 목록도 같은 모양으로 보내고, 사진을 빼면 img 만 빈다', () => {
  const st = { catalog: { products: [C.cleanProduct({ id: 'p1', name: '니트', cat: 'top', kind: 'knit', img: IMG, price: 1000, checkedAt: '2026-10-12' }, 0)] } };
  const p = S.catalogPayload(st, { photos: false });
  assert.equal(C.cleanCatalog(p).products[0].img, ''); assert.equal(C.cleanCatalog(p).products[0].price, 1000);
  assert.equal(S.catalogPayload(st, { photos: true }).products[0].img, IMG);
});

test('멱등 키는 내용이 같으면 같고 다르면 다르다', async () => {
  const a = await S.idempotencyKey('{"a":1}'), b = await S.idempotencyKey('{"a":1}'), c = await S.idempotencyKey('{"a":2}');
  assert.equal(a, b); assert.notEqual(a, c); assert.match(a, /^otjang-[0-9a-f]{32}$/);
});

const meta2 = { contract: 2, wardrobeSchema: 2, followup: {
  outcomes: ['purchased', 'not-purchased', 'pending', 'returned'],
  sizeResults: ['right', 'small', 'large', 'unknown'],
  returnReasons: ['size', 'fit', 'color', 'material', 'quality', 'changed', 'price', 'other', 'unknown']
} };
const followDecision = (extra = {}) => W.cleanDecision({ id: 'd-follow', itemId: 'item-follow', before: { lean: 'unsure' }, after: { decision: 'buy' },
  followup: { outcome: 'returned', sizeResult: 'small', returnReason: 'size', worn: 'no', regret: 'unknown', note: '실제 결과', at: '2026-10-13', ...extra } });
const copy = (value) => JSON.parse(JSON.stringify(value));

test('구 서버는 반품뿐 아니라 구매한 옷의 사이즈 결과도 보내기 전에 차단한다', () => {
  for (const discovery of [{ status: 404, meta: null }, { status: 200, meta: { contract: 1 } }]) {
    for (const decision of [followDecision(), followDecision({ outcome: 'purchased', sizeResult: 'right' }), followDecision({ sizeResult: 'unknown', returnReason: 'unknown' })]) {
      const before = copy(decision), result = S.checkPushSupport([decision], discovery);
      assert.equal(result.ok, false); assert.equal(result.reason, 'legacy-followup');
      assert.deepEqual(decision, before, '차단할 때 로컬 판정을 정리하거나 낮추지 않는다');
    }
    assert.equal(S.checkPushSupport([followDecision({ outcome: 'purchased', sizeResult: 'unknown' })], discovery).ok, true);
    assert.equal(S.checkPushSupport([], discovery).ok, true);
  }
});

test('지원 목록을 확인한 계약 2만 신뢰하고 메타 누락·손상·서버 실패는 지원으로 해석하지 않는다', () => {
  assert.equal(S.checkPushSupport([followDecision()], { status: 200, meta: meta2 }).ok, true);
  for (const discovery of [null, { status: 200 }, { status: 200, meta: {} }, { status: 500, meta: meta2 }, { status: 403, meta: meta2 },
    { status: 200, meta: { ...meta2, contract: '2' } }, { status: 200, meta: { ...meta2, wardrobeSchema: 3 } },
    { status: 200, meta: { ...meta2, followup: { ...meta2.followup, outcomes: ['purchased', 'not-purchased', 'pending'] } } },
    { status: 200, meta: { ...meta2, followup: { ...meta2.followup, sizeResults: ['unknown'] } } },
    { status: 200, meta: { ...meta2, followup: { ...meta2.followup, returnReasons: ['unknown'] } } }]) {
    assert.deepEqual(S.checkPushSupport([], discovery), { ok: false, reason: 'unverified-capabilities', protectedCount: 0 });
  }
});

test('받기는 후보·보유·처분 옷의 계약 2 결과가 없어지거나 달라질 때 전체 교체를 차단하고 원본을 유지한다', () => {
  for (const status of ['candidate', 'owned', 'gone']) {
    const item = W.cleanItem({ id: 'item-follow', cat: 'top', name: '결과 있는 옷', status }, 0), decision = followDecision();
    const local = { owner: base.owner, items: [item], decisions: [decision] }, before = copy(local);
    for (const next of [[], [{ ...decision, followup: null }], [followDecision({ outcome: 'purchased' })], [followDecision({ sizeResult: 'unknown' })], [followDecision({ returnReason: 'unknown' })], [{ ...decision, itemId: 'different' }]]) {
      assert.equal(S.checkPullProtection(local.decisions, next).ok, false, status);
      assert.deepEqual(local, before, status + '의 옷·사진·판정·후속 기록은 그대로');
    }
    const identical = S.checkPullProtection(local.decisions, copy(local.decisions));
    assert.equal(identical.ok, true); assert.deepEqual(identical.losses, []); assert.deepEqual(identical.decisions, local.decisions);
  }
});

test('구매 상태의 사이즈 유실, 정리 과정에서 생기는 유실과 확인 직전 새 결과도 검사한다', () => {
  const local = [followDecision({ outcome: 'purchased', sizeResult: 'large' })];
  const outdated = [followDecision({ outcome: 'purchased', sizeResult: 'unknown' })];
  assert.deepEqual(S.checkPullProtection(local, outdated).losses[0].fields, ['sizeResult']);
  const raw = [{ ...local[0], after: null }];
  assert.equal(S.checkPullProtection(local, raw).ok, false, '원본 필드가 있어도 결정 없이 결과만 있으면 정리 전에 차단');
  assert.equal(S.checkPullProtection(local, raw.map(W.cleanDecision)).ok, false, '정리 뒤 사라질 값까지 검사');
  const initial = [followDecision({ outcome: 'purchased', sizeResult: 'unknown' })];
  assert.equal(S.checkPullProtection(initial, outdated).ok, true);
  assert.equal(S.checkPullProtection(local, outdated).ok, false, '받기 확인을 띄운 뒤 기록한 새 결과도 바꾸기 전에 재검사');
});

test('사진 제외 계정 복원은 서버 백업 wrapper 키를 추가하지 않고 결과·상품·원본을 보존한다', () => {
  const wardrobe = S.wardrobePayload({ owner: base.owner, items: [W.setOwnPhoto(base.items[0], IMG)], decisions: [followDecision()] }, { photos: true });
  delete wardrobe.name;
  const catalog = S.catalogPayload({ catalog: { products: [C.cleanProduct({ id: 'photo-product', name: '사진 있는 상품', cat: 'top', img: IMG }, 0)] } }, { photos: true });
  delete catalog.name; delete catalog.note;
  const backup = { schema: 1, kind: 'otjang-server-backup', wardrobe, catalog, exportedAt: '2026-10-13T00:00:00Z' }, before = copy(backup);
  const stripped = S.withoutBackupPhotos(backup);
  assert.deepEqual(Object.keys(stripped.wardrobe).sort(), Object.keys(backup.wardrobe).sort());
  assert.deepEqual(Object.keys(stripped.catalog).sort(), Object.keys(backup.catalog).sort());
  assert.ok(!Object.hasOwn(stripped.wardrobe, 'name'), '엄격한 서버 복원 계약의 허용 키만 유지');
  assert.equal(stripped.wardrobe.items[0].photo.kind, 'none');
  assert.equal(stripped.catalog.products[0].img, '');
  assert.deepEqual(stripped.wardrobe.decisions, backup.wardrobe.decisions);
  assert.deepEqual(stripped.wardrobe.owner, backup.wardrobe.owner);
  assert.deepEqual(backup, before);
});

test('공유 완료된 반품 결과는 같은 계정의 더 새롭고 명시적인 계약 2 정정을 확인해서 받을 수 있다', () => {
  const local = [followDecision()], remote = [followDecision({ outcome: 'purchased', returnReason: 'unknown' })];
  const source = { origin: 'http://127.0.0.1:8099', ownerId: 77 };
  const ack = S.makeFollowupAck({ ...source, serverVersion: 3 }, local);
  const before = copy({ local, remote, ack });
  const context = { source, serverVersion: 4, ack, discovery: { status: 200, meta: meta2 } };
  const result = S.checkPullProtection(local, remote, context);
  assert.equal(result.ok, true);
  assert.deepEqual(result.acknowledgedChanges, [{ id: local[0].id, itemId: local[0].itemId, fields: ['outcome', 'returnReason'] }]);
  assert.deepEqual({ local, remote, ack }, before, '허용 판정도 실제 교체는 하지 않는 순수 함수');
  assert.deepEqual(S.cleanFollowupAck(JSON.parse(JSON.stringify(ack))), ack, '재실행에서 쓸 확인 기준은 JSON 왕복 보존');
  const after = S.makeFollowupAck({ ...source, serverVersion: 4 }, remote);
  assert.equal(S.checkPullProtection(remote, local, { ...context, ack: after, serverVersion: 3 }).ok, false, '정정 뒤 이전 서버 결과로 되돌리지 않는다');
});

test('서로 다른 계정·주소, 오래된 버전, 구 서버, 로컬 미전송 수정과 누락 응답은 확인 기준이 있어도 차단한다', () => {
  const local = [followDecision()], remote = [followDecision({ outcome: 'purchased', returnReason: 'unknown' })];
  const source = { origin: 'http://127.0.0.1:8099', ownerId: 77 }, ack = S.makeFollowupAck({ ...source, serverVersion: 3 }, local);
  const context = { source, serverVersion: 4, ack, discovery: { status: 200, meta: meta2 } };
  for (const altered of [{ ...context, source: { ...source, ownerId: 78 } }, { ...context, source: { ...source, origin: 'http://localhost:8099' } },
    { ...context, serverVersion: 3 }, { ...context, serverVersion: 2 }, { ...context, serverVersion: null }, { ...context, ack: null },
    { ...context, discovery: { status: 404 } }, { ...context, discovery: { status: 200, meta: { contract: 1 } } }, { ...context, discovery: { status: 200, meta: null } }]) {
    assert.equal(S.checkPullProtection(local, remote, altered).ok, false);
  }
  for (const alteredLocal of [[followDecision({ sizeResult: 'large' })], [followDecision({ note: '아직 보내지 않은 후속 메모' })]])
    assert.equal(S.checkPullProtection(alteredLocal, remote, context).ok, false);
  for (const alteredRemote of [[], [{ ...remote[0], followup: null }], [{ ...remote[0], followup: { ...remote[0].followup, worn: 'maybe' } }], [{ ...remote[0], followup: { ...remote[0].followup, at: '2026-02-30' } }]])
    assert.equal(S.checkPullProtection(local, alteredRemote, context).ok, false);
  for (const key of ['sizeResult', 'returnReason', 'outcome', 'worn', 'regret', 'note', 'at']) {
    const missing = copy(remote); delete missing[0].followup[key];
    assert.equal(S.checkPullProtection(local, missing, context).ok, false, '명시된 후속 필드 누락: ' + key);
  }
});

test('확인 기준은 전송한 스냅샷에서 만들며 이후 로컬 수정과 백업 복원에 의해 확인값을 바꾸지 않는다', () => {
  const payload = { decisions: [followDecision()] }, source = { origin: 'http://127.0.0.1:8099', ownerId: 77, serverVersion: 3 };
  const ack = S.makeFollowupAck(source, payload.decisions), original = copy(ack);
  payload.decisions[0].followup.sizeResult = 'large';
  assert.deepEqual(ack, original);
  assert.notEqual(ack.decisions[0].fingerprint, S.followupFingerprint(payload.decisions[0]));
  assert.equal(S.cleanFollowupAck({ ...ack, ownerId: 0 }), null);
  assert.equal(S.cleanFollowupAck({ ...ack, origin: 'https://bad.example/path' }), null);
  assert.equal(S.cleanFollowupAck({ ...ack, decisions: [{ ...ack.decisions[0], fingerprint: '["returned"]' }] }), null);
});

test('판정별 세 방향 비교는 X의 미전송 변경을 유지하며 Y의 서버 정정과 보유 상태를 함께 받는다', () => {
  const baseX = followDecision(), baseY = { ...followDecision(), id: 'd-y', itemId: 'item-y' };
  const local = [{ ...baseX, followup: { ...baseX.followup, sizeResult: 'large' } }, copy(baseY)];
  const remote = [copy(baseX), { ...baseY, followup: { ...baseY.followup, outcome: 'purchased', returnReason: 'unknown' } }];
  const source = { origin: 'http://127.0.0.1:8099', ownerId: 77 };
  const ack = S.makeFollowupAck({ ...source, serverVersion: 3 }, [baseX, baseY]);
  const plan = S.checkPullProtection(local, remote, { source, serverVersion: 4, ack, discovery: { status: 200, meta: meta2 } });
  assert.equal(plan.ok, true); assert.equal(plan.keptLocal.length, 1); assert.equal(plan.acknowledgedChanges.length, 1);
  assert.equal(plan.decisions[0].followup.sizeResult, 'large'); assert.equal(plan.decisions[1].followup.outcome, 'purchased');
  const mine = [W.cleanItem({ id: baseX.itemId, cat: 'top', name: 'X', status: 'gone' }, 0), W.cleanItem({ id: baseY.itemId, cat: 'top', name: 'Y', status: 'gone' }, 0)];
  const theirs = mine.map((it) => ({ ...it, status: 'owned' }));
  const items = S.mergePullPlanItems(mine, theirs, plan);
  assert.equal(items[0].status, 'gone', 'X 로컬 반품 상태 유지'); assert.equal(items[1].status, 'owned', 'Y 원격 구매 정정 반영');
  const nextAck = S.makeFollowupAck({ ...source, serverVersion: 4 }, remote);
  assert.notEqual(nextAck.decisions[0].fingerprint, S.followupFingerprint(plan.decisions[0]), 'baseline은 수신 원격값, local-only는 미전송 상태로 유지');
});

test('양쪽 같은 결과로 수렴하면 허용하고 진짜 충돌은 선택 없이 교체하지 않는다', () => {
  const original = followDecision(), mine = followDecision({ sizeResult: 'large' });
  const theirs = followDecision({ outcome: 'purchased', returnReason: 'unknown' });
  const source = { origin: 'http://127.0.0.1:8099', ownerId: 77 };
  const context = { source, serverVersion: 4, ack: S.makeFollowupAck({ ...source, serverVersion: 3 }, [original]), discovery: { status: 200, meta: meta2 }, resolutions: {} };
  assert.equal(S.checkPullProtection([mine], [copy(mine)], context).ok, true, '양쪽 수정이 같으면 수렴');
  const blocked = S.checkPullProtection([mine], [theirs], context);
  assert.equal(blocked.ok, false); assert.deepEqual(blocked.losses, []); assert.equal(blocked.conflicts.length, 1);
  const row = blocked.conflicts[0];
  for (const value of ['server', 'local']) {
    const choices = { [row.key]: { value, localFingerprint: row.localFingerprint, remoteFingerprint: row.remoteFingerprint } };
    const resolved = S.checkPullProtection([mine], [theirs], { ...context, resolutions: choices });
    assert.equal(resolved.ok, true);
    assert.deepEqual(resolved.decisions[0].followup, value === 'server' ? theirs.followup : mine.followup);
    assert.equal(S.checkPullProtection([followDecision({ sizeResult: 'large', note: '선택 뒤 새 수정' })], [theirs], { ...context, resolutions: choices }).ok, false, '적용 직전 수정은 이전 선택을 무효화');
  }
});

test('판정 없음·followup null·followup 있음 fingerprint를 구분하고 이전 cleaner 값도 같은 규칙으로 이전한다', () => {
  const present = followDecision(), without = { ...present, followup: null };
  assert.notEqual(S.followupFingerprint(null), S.followupFingerprint(without));
  assert.notEqual(S.followupFingerprint(without), S.followupFingerprint(present));
  const source = { origin: 'http://127.0.0.1:8099', ownerId: 77 };
  const ack = S.makeFollowupAck({ ...source, serverVersion: 3 }, [without]);
  const localOnly = S.checkPullProtection([present], [without], { source, serverVersion: 3, ack, discovery: { status: 200, meta: meta2 } });
  assert.equal(localOnly.ok, true); assert.deepEqual(localOnly.decisions[0].followup, present.followup, '기존 null에서 이 기기만 적은 결과는 유지');
  const missing = { ...without }; delete missing.followup;
  assert.equal(S.checkPullProtection([present], [missing], { source, serverVersion: 4, ack, discovery: { status: 200, meta: meta2 } }).ok, false, '명시적 null과 누락을 같은 서버 증거로 보지 않는다');
  const oldAck = { ...source, serverVersion: 3, decisions: [{ id: present.id, itemId: present.itemId, fingerprint: JSON.stringify(['returned', 'no', 'unknown', 'small', 'size', '실제 결과', '2026-02-30']) }] };
  const cleanedAck = S.cleanFollowupAck(oldAck), cleanedLocal = followDecision({ at: '2026-02-30' });
  assert.equal(cleanedAck.decisions[0].fingerprint, S.followupFingerprint(cleanedLocal), '날짜 cleaner 변경은 가짜 미전송 수정으로 만들지 않음');
});

test('이미 공유한 rich 결과를 로컬에서 일반 구매·미구매·보류·null로 정정해도 이전 서버 결과로 덮지 않는다', () => {
  const original = followDecision(), source = { origin: 'http://127.0.0.1:8099', ownerId: 77 };
  const ack = S.makeFollowupAck({ ...source, serverVersion: 3 }, [original]);
  const context = { source, serverVersion: 4, ack, discovery: { status: 200, meta: meta2 } };
  for (const mine of [followDecision({ outcome: 'purchased', sizeResult: 'unknown', returnReason: 'unknown' }), followDecision({ outcome: 'not-purchased' }), followDecision({ outcome: 'pending' }), { ...original, followup: null }]) {
    const plan = S.checkPullProtection([mine], [original], context);
    assert.equal(plan.ok, true); assert.equal(plan.keptLocal.length, 1);
    assert.deepEqual(plan.decisions[0].followup, mine.followup);
  }
  const ordinary = followDecision({ outcome: 'purchased', sizeResult: 'unknown', returnReason: 'unknown' });
  const ordinaryAck = S.makeFollowupAck({ ...source, serverVersion: 3 }, [ordinary]);
  const modified = followDecision({ outcome: 'purchased', sizeResult: 'unknown', returnReason: 'unknown', note: '새 미전송 메모', worn: 'yes' });
  const plan = S.checkPullProtection([modified], [ordinary], { ...context, ack: ordinaryAck });
  assert.deepEqual(plan.decisions[0].followup, modified.followup, '구매 unknown도 착용·메모 수정은 보존');
  const absent = S.checkPullProtection([], [original], context);
  assert.equal(absent.ok, true); assert.deepEqual(absent.decisions, [], '이 기기에서 지운 기록을 이전 서버 기록으로 되살리지 않음');
});

test('완전 pull의 확인 snapshot만 absence를 증명하며 새 local 기록·옷을 보존한다', () => {
  const local = [followDecision()], source = { origin: 'http://127.0.0.1:8099', ownerId: 77 };
  const discovery = { status: 200, meta: meta2 };
  const completeAck = S.makeFollowupAck({ ...source, serverVersion: 3, capture: 'pull', completeSnapshot: true }, []);
  const plan = S.checkPullProtection(local, [], { source, serverVersion: 4, ack: completeAck, discovery });
  assert.equal(plan.ok, true); assert.deepEqual(plan.decisions, local);
  const item = W.cleanItem({ id: local[0].itemId, cat: 'top', name: '새 로컬 옷', status: 'gone' }, 0);
  assert.deepEqual(S.mergePullPlanItems([item], [], plan), [item]);
  const pushAck = S.makeFollowupAck({ ...source, serverVersion: 3 }, []);
  const unknown = S.checkPullProtection(local, [], { source, serverVersion: 4, ack: pushAck, discovery });
  assert.equal(unknown.ok, false); assert.equal(unknown.losses.length, 1, 'upsert payload에서 안 보인 기록은 서버 부재로 단정하지 않음');
  const currentFull = { source, serverVersion: 4, ack: pushAck, discovery, completeIncoming: true, resolutions: {} };
  const preview = S.checkPullProtection(local, [], currentFull);
  assert.equal(preview.ok, false); assert.equal(preview.conflicts.length, 1); assert.equal(preview.conflicts[0].localOnly, true);
  const row = preview.conflicts[0];
  const resolved = S.checkPullProtection(local, [], { ...currentFull, resolutions: { [row.key]: { value: 'local', localFingerprint: row.localFingerprint, remoteFingerprint: row.remoteFingerprint } } });
  assert.equal(resolved.ok, true); assert.deepEqual(resolved.decisions, local, '새 전체 GET을 확인하고 이 기기 값을 유지하는 복구 경로');
});

test('확인 기준의 타입·enum·구조는 달력 정리 이외에 조용히 낮추지 않는다', () => {
  const original = followDecision(), source = { origin: 'http://127.0.0.1:8099', ownerId: 77, serverVersion: 3 };
  const good = S.makeFollowupAck(source, [original]);
  for (const [index, value] of [[0, 'unsupported'], [1, 'maybe'], [2, 'sometimes'], [3, 'medium'], [4, 'damaged'], [5, null], [5, 123], [6, 123], [6, 'not-date']]) {
    const fp = JSON.parse(good.decisions[0].fingerprint); fp.values[index] = value;
    assert.equal(S.cleanFollowupAck({ ...good, decisions: [{ ...good.decisions[0], fingerprint: JSON.stringify(fp) }] }), null);
  }
  assert.equal(S.cleanFollowupAck({ ...good, decisions: [{ ...good.decisions[0], fingerprint: '{"presence":"null-followup","values":[]}' }] }), null);
  assert.equal(S.cleanFollowupAck({ ...good, capture: 'push', completeSnapshot: true }).completeSnapshot, false);
});

test('완전 snapshot 표시는 원본 배열 한도·중복·유효 기록 정리 손실을 검사한다', () => {
  const raw = S.wardrobePayload({ owner: base.owner, items: [base.items[0]], decisions: [followDecision()] }, { photos: true });
  assert.equal(S.completePullSnapshot(raw, W.cleanWardrobe(raw)), true);
  for (const bad of [{ ...raw, items: Array.from({ length: 501 }, () => base.items[0]) }, { ...raw, decisions: [{ ...raw.decisions[0], before: null }] }, { ...raw, items: [raw.items[0], raw.items[0]] }])
    assert.equal(S.completePullSnapshot(bad, W.cleanWardrobe(bad)), false);
  const invalid = copy(raw); invalid.decisions[0].followup.sizeResult = 'future-medium';
  assert.equal(S.completePullSnapshot(invalid, W.cleanWardrobe(invalid)), false);
});

test('처음 로그인·과거 손상의 기준 없는 rich 결과는 자동교체를 막고 완전 현재 GET 확인 뒤 내 결과만 유지할 수 있다', () => {
  const mine = followDecision(), source = { origin: 'http://127.0.0.1:8099', ownerId: 77 };
  const context = { source, serverVersion: 4, ack: null, discovery: { status: 200, meta: meta2 }, completeIncoming: true, resolutions: {} };
  for (const remote of [[], [{ ...mine, followup: null }]]) {
    const plan = S.checkPullProtection([mine], remote, context);
    assert.equal(plan.ok, false); assert.equal(plan.conflicts.length, 1); assert.equal(plan.conflicts[0].localOnly, true);
    const row = plan.conflicts[0];
    const server = { [row.key]: { value: 'server', localFingerprint: row.localFingerprint, remoteFingerprint: row.remoteFingerprint } };
    assert.equal(S.checkPullProtection([mine], remote, { ...context, resolutions: server }).ok, false);
    const local = { [row.key]: { ...server[row.key], value: 'local' } };
    const kept = S.checkPullProtection([mine], remote, { ...context, resolutions: local });
    assert.equal(kept.ok, true); assert.deepEqual(kept.decisions[0].followup, mine.followup);
  }
  assert.equal(S.checkPullProtection([mine], [], { ...context, completeIncoming: false }).losses.length, 1);
  assert.equal(S.checkPullProtection([mine], [], { ...context, discovery: { status: 404 } }).losses.length, 1);
});

test('같은 판정의 명시 null 정정은 새 완전 서버 snapshot에서 직접 선택하고 키 누락과 구분한다', () => {
  const mine = followDecision(), remote = [{ ...mine, followup: null }];
  const source = { origin: 'http://127.0.0.1:8099', ownerId: 77 };
  const context = { source, serverVersion: 4, ack: S.makeFollowupAck({ ...source, serverVersion: 3 }, [mine]), discovery: { status: 200, meta: meta2 }, completeIncoming: true, resolutions: {} };
  const preview = S.checkPullProtection([mine], remote, context);
  assert.equal(preview.ok, false); assert.equal(preview.conflicts.length, 1); assert.equal(preview.conflicts[0].localOnly, false);
  const row = preview.conflicts[0];
  for (const value of ['server', 'local']) {
    const plan = S.checkPullProtection([mine], remote, { ...context, resolutions: { [row.key]: { value, localFingerprint: row.localFingerprint, remoteFingerprint: row.remoteFingerprint } } });
    assert.equal(plan.ok, true); assert.deepEqual(plan.decisions[0].followup, value === 'server' ? null : mine.followup);
  }
  const missing = [{ ...mine }]; delete missing[0].followup;
  assert.equal(S.checkPullProtection([mine], missing, context).losses.length, 1, '명시 null 이외의 누락은 계속 안전 차단');
});
