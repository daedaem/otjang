// 사진으로 옷 넣기: 옷 사진 한 장을 Claude에게 보내 종류·색·이름을 추천받는다. 대표 10-28 16:46
// "옷장 등록할 때 사진으로 자동 분석은 안 되려나요, 피드백 받으면서 그때 Claude 쓰던지요".
// 사진은 사용자가 동의한 경우에만 보내고 서버에 저장하지 않는다. 추천 종류·색은 앱 목록 안에서만 받는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { handleGarmentPhoto } from '../functions/api/garment-photo.js';
import { createWorker } from '../worker.js';

const jpeg = (n = 200) => { const b = new Uint8Array(n); b.set([0xff, 0xd8, 0xff, 0xe0]); b[n - 2] = 0xff; b[n - 1] = 0xd9; return Buffer.from(b).toString('base64'); };
function claude(answer, calls = []) {
  return { calls, messages: { create: async (req) => { calls.push(req); return { id: 'msg_1', model: 'claude-haiku-5-5', stop_reason: 'end_turn', usage: { input_tokens: 900, output_tokens: 40 }, content: [{ type: 'text', text: typeof answer === 'string' ? answer : JSON.stringify(answer) }] }; } } };
}
const ok = { authorize: async () => ({ ok: true }), reserve: async () => ({ ok: true }) };
const call = async (body, opts = {}, init = {}) => {
  const res = await handleGarmentPhoto(new Request('https://x.test/api/garment-photo', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), ...init }), { ANTHROPIC_API_KEY: 'k' }, { ...ok, ...opts });
  return { status: res.status, body: await res.json() };
};

test('사진을 이미지로 보내고, 앱 목록 안의 종류·색만 돌려준다', async () => {
  const c = claude({ clothing: true, kind: 'blazer', color: 'navy', label: '네이비 울 블레이저', confidence: 'high' });
  const r = await call({ image: jpeg() }, { client: c });
  assert.equal(r.status, 200);
  assert.deepEqual([r.body.clothing, r.body.kind, r.body.color, r.body.label, r.body.confidence], [true, 'blazer', 'navy', '네이비 울 블레이저', 'high']);
  assert.equal(r.body.ai.model, 'claude-haiku-5-5');
  const content = c.calls[0].messages[0].content;
  assert.equal(content[0].type, 'image');
  assert.equal(content[0].source.media_type, 'image/jpeg');
  assert.match(c.calls[0].system, /blazer/);
  assert.match(c.calls[0].system, /navy/);
});

test('목록 밖 종류·색은 비우고, 옷이 아니면 그렇게 알린다. 이상한 답은 502', async () => {
  const odd = await call({ image: jpeg() }, { client: claude({ clothing: true, kind: 'spaceship', color: 'neon', label: '<b>x</b>', confidence: 'sure' }) });
  assert.deepEqual([odd.body.kind, odd.body.color, odd.body.confidence], [null, null, 'low']);
  assert.equal(odd.body.label.includes('<'), false);
  const cat = await call({ image: jpeg() }, { client: claude({ clothing: false, kind: null, color: null, label: '', confidence: 'high' }) });
  assert.equal(cat.body.clothing, false);
  assert.equal((await call({ image: jpeg() }, { client: claude('옷이네요!') })).status, 502);
});

test('JPEG만, 너무 크면 413, 다른 키·빈 본문은 400, POST만', async () => {
  assert.equal((await call({ image: Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('base64') }, { client: claude({}) })).status, 400);
  assert.equal((await call({ image: jpeg(), extra: 1 }, { client: claude({}) })).status, 400);
  assert.equal((await call({ image: jpeg(400 * 1024) }, { client: claude({}) })).status, 413);
  const get = await handleGarmentPhoto(new Request('https://x.test/api/garment-photo'), {}, ok);
  assert.equal(get.status, 405);
});

test('AI 한도를 먼저 예약하고, 한도에 막히면 Claude를 부르지 않는다. 인증 실패도 마찬가지', async () => {
  const c = claude({ clothing: true, kind: 'tee', color: 'white', label: '흰 티', confidence: 'high' });
  const limited = await call({ image: jpeg() }, { client: c, reserve: async () => ({ ok: false, status: 429, code: 'member_daily_limit' }) });
  assert.deepEqual([limited.status, limited.body.code], [429, 'member_daily_limit']);
  const denied = await call({ image: jpeg() }, { client: c, authorize: async () => ({ ok: false, status: 401 }) });
  assert.equal(denied.status, 401);
  assert.equal(c.calls.length, 0);
});

test('Worker: 본인은 기존 한도, 초대 회원은 회원 한도로 사진 분석을 쓴다', async () => {
  const seen = [];
  const make = (owner, member) => createWorker({
    authorize: async () => (owner ? { ok: true } : { ok: false, status: 401 }),
    member: async () => member,
    garmentPhoto: async (_r, _e, opts) => { seen.push(opts || null); return Response.json({ ok: true }); },
  });
  const req = () => new Request('https://hangit.test/api/garment-photo', { method: 'POST', headers: { origin: 'https://hangit.test', 'content-type': 'application/json' }, body: '{}' });
  await make(true, null).fetch(req(), { PRIVATE_AUTH_MODE: 'session' });
  assert.equal(seen[0], null);
  await make(false, 'm1').fetch(req(), { PRIVATE_AUTH_MODE: 'session', MEMBER_APP_MODE: 'invite' });
  assert.equal((await seen[1].authorize()).ok, true);
  assert.equal(typeof seen[1].reserve, 'function');
  const anon = await make(false, null).fetch(req(), { PRIVATE_AUTH_MODE: 'session', MEMBER_APP_MODE: 'invite' });
  assert.ok([303, 401].includes(anon.status));
});
