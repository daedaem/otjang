// AI 순위 서버 함수(Cloudflare Pages Functions, POST /api/rank).
// 화면의 ai-rank.js가 만든 프롬프트를 받아 Claude에 묻고, 받은 JSON을 그대로 돌려준다. 순위 검증(후보 id만 받기)은 화면 쪽 ai-rank.js가 한다.
// API 키는 Cloudflare의 비밀 값 ANTHROPIC_API_KEY에만 둔다(저장소·화면에 없음).
// 아무 질문이나 대신 묻는 통로가 되지 않게: 정해진 첫 문장으로 시작하는 프롬프트만, 길이 상한, 모델·출력 길이 고정.
// 하루 호출 상한: KV 이름공간을 RANK_KV로 연결하면 DAILY_LIMIT(기본 300)까지 센다. 연결하지 않으면 콘솔의 월 지출 한도에 맡긴다.
import Anthropic from '@anthropic-ai/sdk';

export const PROMPT_HEAD = '당신은 패션 쇼핑 도우미입니다.';
export const MAX_PROMPT = 12000;
export const MODEL = 'claude-haiku-5-5';

const reply = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});
const fail = (status, code, message) => reply(status, { code, message });

function parseJson(text) {
  const s = text.replace(/```(?:json)?/g, '');
  const a = s.indexOf('{');
  const b = s.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(s.slice(a, b + 1)); } catch { return null; }
}

async function overDailyLimit(env) {
  if (!env.RANK_KV) return false;
  const key = `rank:${new Date().toISOString().slice(0, 10)}`;
  const used = Number(await env.RANK_KV.get(key)) || 0;
  if (used >= (Number(env.DAILY_LIMIT) || 300)) return true;
  await env.RANK_KV.put(key, String(used + 1), { expirationTtl: 60 * 60 * 48 });
  return false;
}

// options.client: 시험에서 가짜 클라이언트를 넣을 때만 쓴다.
export async function handle(request, env, { client } = {}) {
  if (!env.ANTHROPIC_API_KEY && !client) return fail(503, 'not_configured', 'ANTHROPIC_API_KEY가 설정되지 않았어요.');
  let prompt;
  try { ({ prompt } = await request.json()); } catch { return fail(400, 'bad_request', 'JSON 본문이 필요해요.'); }
  if (typeof prompt !== 'string' || !prompt.startsWith(PROMPT_HEAD) || prompt.length > MAX_PROMPT) {
    return fail(400, 'bad_request', '순위 요청 형식이 아니에요.');
  }
  if (await overDailyLimit(env)) return fail(429, 'daily_limit', '오늘 사용량을 다 썼어요.');
  const claude = client || new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  let res;
  try {
    res = await claude.messages.create({
      model: MODEL,
      max_tokens: 4000,
      output_config: { effort: 'low' },
      messages: [{ role: 'user', content: prompt }],
    });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return fail(429, 'rate_limited', '요청이 많아요.');
    if (e instanceof Anthropic.AuthenticationError) return fail(503, 'not_configured', 'API 키가 거절됐어요.');
    return fail(502, 'error', 'AI 응답을 받지 못했어요.');
  }
  if (res.stop_reason === 'refusal') return fail(502, 'error', 'AI가 답하지 않았어요.');
  const out = parseJson(res.content.filter((b) => b.type === 'text').map((b) => b.text).join(''));
  if (!out) return fail(502, 'parse', 'AI 응답을 읽지 못했어요.');
  return reply(200, out);
}

export const onRequestPost = ({ request, env }) => handle(request, env);
