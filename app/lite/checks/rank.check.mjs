// AI 순위 서버 함수 점검(가짜 Claude 클라이언트, 비용 0). 실행: npm test (app/lite)
// 파일 이름이 *.test.mjs가 아닌 것은 app/의 `node --test`가 이 파일을 줍지 않게 하려는 것이다(SDK는 app/lite에만 설치).
import test from 'node:test';
import assert from 'node:assert/strict';
import Anthropic from '@anthropic-ai/sdk';
import { handle, PROMPT_HEAD, MAX_PROMPT, MODEL } from '../functions/api/rank.js';

const post = (body) => new Request('https://x.test/api/rank', { method: 'POST', headers: { 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) });
const okPrompt = `${PROMPT_HEAD}\n후보 …`;
const fake = (text, extra = {}) => {
  const calls = [];
  return { calls, messages: { async create(req) { calls.push(req); return { stop_reason: 'end_turn', content: [{ type: 'text', text }], ...extra }; } } };
};
const json = async (res) => ({ status: res.status, body: await res.json() });

test('키가 없으면 503 not_configured, Claude를 부르지 않는다', async () => {
  const r = await json(await handle(post({ prompt: okPrompt }), {}));
  assert.deepEqual([r.status, r.body.code], [503, 'not_configured']);
});

test('정해진 첫 문장이 아니거나 너무 길면 거절한다(대리 질문 통로 방지)', async () => {
  const client = fake('{}');
  for (const prompt of ['아무 질문', `${PROMPT_HEAD}${'가'.repeat(MAX_PROMPT)}`, 42]) {
    const r = await json(await handle(post({ prompt }), { ANTHROPIC_API_KEY: 'k' }, { client }));
    assert.deepEqual([r.status, r.body.code], [400, 'bad_request']);
  }
  const bad = await json(await handle(post('not json'), { ANTHROPIC_API_KEY: 'k' }, { client }));
  assert.equal(bad.status, 400);
  assert.equal(client.calls.length, 0);
});

test('모델·출력 길이를 고정하고, 코드 울타리가 있어도 JSON을 꺼낸다', async () => {
  const client = fake('```json\n{"summary":"s","ranking":[{"id":"ms-1","reason":"r","fit":"추천"}]}\n```');
  const r = await json(await handle(post({ prompt: okPrompt }), { ANTHROPIC_API_KEY: 'k' }, { client }));
  assert.equal(r.status, 200);
  assert.equal(r.body.ranking[0].id, 'ms-1');
  assert.equal(client.calls[0].model, MODEL);
  assert.equal(client.calls[0].max_tokens, 4000);
  assert.equal(client.calls[0].messages[0].content, okPrompt);
});

test('읽을 수 없는 답·거절·속도 제한은 화면이 기본 순서로 돌아갈 코드로 알린다', async () => {
  const env = { ANTHROPIC_API_KEY: 'k' };
  assert.equal((await json(await handle(post({ prompt: okPrompt }), env, { client: fake('설명만') }))).body.code, 'parse');
  assert.equal((await json(await handle(post({ prompt: okPrompt }), env, { client: fake('', { stop_reason: 'refusal' }) }))).status, 502);
  const limited = { messages: { create: async () => { throw new Anthropic.RateLimitError(429, { error: {} }, 'rate', new Headers()); } } };
  const r = await json(await handle(post({ prompt: okPrompt }), env, { client: limited }));
  assert.deepEqual([r.status, r.body.code], [429, 'rate_limited']);
});

test('KV를 연결하면 하루 상한에서 멈춘다', async () => {
  const store = new Map();
  const kv = { get: async (k) => store.get(k) ?? null, put: async (k, v) => { store.set(k, v); } };
  const env = { ANTHROPIC_API_KEY: 'k', RANK_KV: kv, DAILY_LIMIT: '2' };
  const client = fake('{"ranking":[]}');
  const codes = [];
  for (let i = 0; i < 3; i++) codes.push((await handle(post({ prompt: okPrompt }), env, { client })).status);
  assert.deepEqual(codes, [200, 200, 429]);
  assert.equal(client.calls.length, 2);
});
