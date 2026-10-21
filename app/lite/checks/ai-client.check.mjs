// 설치 앱의 구조화된 AI 요청 점검. 실제 브라우저·외부 API·개인 자료 없이 가짜 window/fetch만 쓴다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const lite = fs.readFileSync(new URL('../src/lite.js', import.meta.url), 'utf8');
const rank = fs.readFileSync(new URL('../../mockups/ux10v2/links/shared/ai-rank.js', import.meta.url), 'utf8');
const page = fs.readFileSync(new URL('../../mockups/ux10v2/links/d12-hang.html', import.meta.url), 'utf8');
const consult = page.slice(page.indexOf('  const REFUSE ='), page.indexOf('  const recCard ='));
const plain = (value) => JSON.parse(JSON.stringify(value));
const storage = () => {
  const data = new Map();
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: (key) => data.delete(key) };
};
const product = (id) => ({ id, brand: '브랜드', name: '셔츠', price: 10000, image: 'https://invalid.test/not-sent.jpg', colorLabel: '흰색', kindName: '셔츠' });
const engine = (closet = []) => ({ getState: () => ({ closet }), judge: () => ({ basis: 'none' }), ask: () => ({ understood: true, products: [product('ms-1')] }) });
const runRank = (window) => { vm.runInNewContext(rank, { window }); return window.AIRank; };
const runLite = (fetcher, extra = {}) => {
  const window = extra.window || {};
  vm.runInNewContext(lite, { window, fetch: fetcher, AbortController, setTimeout, clearTimeout, localStorage: storage(), navigator: {}, ...extra });
  return window;
};
const runConsult = (window) => {
  const context = { window, M: engine(), K: { refresh() {} }, $: () => null, localStorage: storage(), curView: 'consult' };
  vm.runInNewContext(`${consult}\nglobalThis.chatTest = { C, askConsult, CHAT_ERR };`, context);
  return context.chatTest;
};

test('설치 앱은 sample을 덮어쓰지 않고 구조화된 본문만 /api/rank로 보낸다', async () => {
  let sent;
  const existing = { use: () => 'original sample' };
  const window = { claude: existing };
  const fetcher = async (url, options) => {
    sent = { url, options };
    return new Response('{"ranking":[]}');
  };
  vm.runInNewContext(lite, { window, fetch: fetcher, AbortController, setTimeout, clearTimeout, localStorage: storage(), navigator: {} });
  const request = { task: 'rank', query: '흰 셔츠', items: [{ id: 'ms-1', closet: '옷장 정보 없음' }], closet: [] };
  await window.EOUL_SERVER_AI(request);
  assert.equal(window.claude, existing);
  assert.equal(sent.url, '/api/rank');
  assert.deepEqual(JSON.parse(sent.options.body), request);
  assert.equal(sent.options.method, 'POST');
  assert.ok(sent.options.signal instanceof AbortSignal);
  assert.ok(!sent.options.body.includes('prompt'));
});

test('서버의 권한·월 한도·예산 오류 코드를 보존하고 20초 후 요청을 취소한다', async () => {
  for (const code of ['unauthorized', 'monthly_limit', 'budget_unavailable']) {
    const window = runLite(async () => new Response(JSON.stringify({ code, message: '정해진 오류' }), { status: code === 'unauthorized' ? 401 : 503 }));
    await assert.rejects(window.EOUL_SERVER_AI({ task: 'rank' }), (error) => error.code === code);
  }
  let delay;
  let aborted = false;
  const window = runLite(async (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => { aborted = true; reject(new Error('abort')); }, { once: true });
  }), { setTimeout: (callback, ms) => { delay = ms; return setTimeout(callback, 5); } });
  await assert.rejects(window.EOUL_SERVER_AI({ task: 'rank' }), (error) => error.code === 'timeout');
  assert.equal(delay, 20000);
  assert.equal(aborted, true);
});

test('세션 만료는 고정 로그인 경로로 돌아가며 옷장 자료를 지우거나 외부 주소로 이동하지 않는다', async () => {
  const redirects = [];
  const local = storage();
  local.setItem('wardrobe', 'preserved');
  for (const login of ['/_private/login', 'https://invalid.test/login', null]) {
    const window = runLite(async () => new Response(JSON.stringify({ code: 'unauthorized', login }), { status: 401 }), {
      window: { location: { replace: (path) => redirects.push(path) } }, localStorage: local,
    });
    await assert.rejects(window.EOUL_SERVER_AI({ task: 'rank' }), (error) => error.code === 'unauthorized');
    await window.EOUL_CROWD.search('셔츠');
    await window.EOUL_WEATHER();
  }
  assert.deepEqual(redirects, Array(3).fill('/_private/login'));
  assert.equal(local.getItem('wardrobe'), 'preserved');
});

test('sample 없이 서버 순위를 사용하고 후보 id·옷장 비교 외 상품 사실은 보내지 않는다', async () => {
  let request;
  let sampleCalls = 0;
  const window = {
    EoulMock: engine(),
    claude: { use: async () => { sampleCalls++; return null; } },
    EOUL_SERVER_AI: async (body) => { request = plain(body); return { ranking: [{ id: 'ms-2', reason: '요청에 맞는 셔츠예요.', fit: '추천' }], summary: '두 번째 후보부터 보세요.' }; },
  };
  const ai = runRank(window);
  assert.equal(await ai.available(), true);
  const result = await ai.rank('흰 셔츠', { products: [product('ms-1'), product('ms-2')], conditions: [{ label: '셔츠' }] });
  assert.equal(sampleCalls, 0);
  assert.deepEqual(request, { task: 'rank', query: '흰 셔츠', items: [{ id: 'ms-1', closet: '옷장 정보 없음' }, { id: 'ms-2', closet: '옷장 정보 없음' }], closet: [], conditions: ['셔츠'] });
  assert.deepEqual(plain(result.order).map((item) => item.id), ['ms-2', 'ms-1']);
});

test('유효한 AI 후보가 없으면 성공으로 꾸미거나 캐시하지 않는다', async () => {
  let calls = 0;
  const ai = runRank({ EoulMock: engine(), EOUL_SERVER_AI: async () => { calls++; return calls === 1 ? { ranking: [{ id: 'unknown', reason: '잘못된 후보' }] } : { ranking: [{ id: 'ms-1', reason: '확인된 후보' }] }; } });
  const result = { products: [product('ms-1')] };
  assert.deepEqual(plain(await ai.rank('셔츠', result)), { ok: false, why: 'parse' });
  assert.equal((await ai.rank('셔츠', result)).ok, true);
  assert.equal(calls, 2);
});

test('링크 페이지는 기존 Claude sample 경로를 보존하고 긴 질문은 자동 절단하지 않는다', async () => {
  let prompt;
  let calls = 0;
  const ai = runRank({ EoulMock: engine(), claude: { use: async () => ({ json: async (text) => { calls++; prompt = text; return { ranking: [{ id: 'ms-1', reason: '후보예요.' }] }; } }) } });
  assert.equal(await ai.available(), true);
  assert.equal((await ai.rank('셔츠', { products: [product('ms-1')] })).ok, true);
  assert.ok(prompt.startsWith('당신은 패션 쇼핑 도우미입니다.'));
  assert.equal((await ai.rank('가'.repeat(301), { products: [product('ms-1')] })).why, 'bad_request');
  assert.equal(calls, 1);
  for (const code of ['unauthorized', 'monthly_limit', 'budget_unavailable', 'timeout']) assert.match(ai.whyText(code), /[가-힣]/);
});

test('상담은 이전 6턴만 보내고 현재 질문·상품 사실을 중복 전송하지 않는다', async () => {
  let sent;
  const chat = runConsult({ EOUL_SERVER_AI: async (body) => { sent = plain(body); return { on_topic: true, answer: '이 후보를 살펴보세요.', product_ids: ['ms-1', 'unknown'] }; } });
  chat.C.threads = [{ id: 'old', turns: Array.from({ length: 8 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', text: `이전 대화 ${i} ${'가'.repeat(710)}` })) }];
  chat.C.cur = 'old';
  await chat.askConsult('새 질문 전용 문장');
  assert.equal(sent.task, 'consult');
  assert.equal(sent.query, '새 질문 전용 문장');
  assert.equal(sent.history.length, 6);
  assert.ok(sent.history.every((turn) => turn.content.length <= 700 && !turn.content.includes(sent.query)));
  assert.deepEqual(sent.items, [{ id: 'ms-1', closet: '' }]);
  assert.ok(!JSON.stringify(sent).includes('not-sent.jpg'));
  assert.deepEqual(plain(chat.C.turns.at(-1).ids), ['ms-1']);
  assert.equal(chat.C.busy, false);
});

test('링크 상담도 현재 질문을 sample 메시지에 한 번만 포함한다', async () => {
  let messages;
  const chat = runConsult({ claude: { use: async () => ({ json: async (body) => { messages = plain(body); return { on_topic: false }; } }) } });
  const query = '이번 질문만의 고유한 문장';
  await chat.askConsult(query);
  assert.equal(JSON.stringify(messages).split(query).length - 1, 1);
  assert.equal(chat.C.turns.at(-1).refused, true);
});
