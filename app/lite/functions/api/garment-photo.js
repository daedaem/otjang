// 사진으로 옷 넣기(대표 10-28 16:46): 옷 사진 한 장을 Claude에게 보여 주고 종류·색·이름을 추천받는다.
// 사용자가 화면에서 동의한 사진만 온다(이 기기에서 긴 변 512px JPEG로 줄임). 서버는 사진을 저장·기록하지 않는다.
// 추천은 앱의 종류·색 목록 안에서만 받고, 사용자가 고친 뒤 이 기기에 저장한다(서버 저장 없음).
// AI 한도는 상담·순위와 같은 원장을 쓴다(본인은 전체 한도, 초대 회원은 하루 MEMBER_AI_DAILY).
import Anthropic from '@anthropic-ai/sdk';
import { GARMENT_KINDS } from '../../src/domain/wardrobe.js';
import { COLORS } from '../../src/domain/data/slots.js';
import { authorizePrivateRequest } from '../lib/private-access.js';
import { reserveRankBudget } from '../lib/rank-budget.js';
import { MODEL, CLIENT_OPTIONS, providerMetadata, providerFailureCode } from './rank.js';

const MAX_IMAGE = 300 * 1024;
const MAX_BODY = Math.ceil(MAX_IMAGE / 3) * 4 + 256;
const KINDS = new Map(GARMENT_KINDS.map((k) => [k.id, k.name]));
const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const fail = (status, code, message = '사진을 알아보지 못했어요. 종류와 색을 직접 골라 주세요.') => reply(status, { code, message });

export const SYSTEM = `옷 사진 한 장을 보고 그 옷을 앱 목록으로 분류합니다. 사진에 여러 벌이 있으면 가장 크게 보이는 한 벌만 봅니다.
종류(kind)는 다음 id 중 하나: ${[...KINDS].map(([id, name]) => `${id}(${name})`).join(', ')}.
색(color)은 다음 id 중 하나: ${Object.entries(COLORS).map(([id, c]) => `${id}(${c.label})`).join(', ')}.
label은 사람이 옷장에서 알아볼 짧은 한국어 이름(30자 이내, 예: "네이비 울 블레이저")이고 브랜드는 확실히 보일 때만 넣습니다.
맞는 id가 없거나 확실하지 않으면 null로 두고 confidence를 낮춥니다. 옷이 아니면 clothing을 false로 둡니다.
사람의 얼굴·몸·배경은 설명하지 않습니다. JSON만 답합니다: {"clothing":true,"kind":"...","color":"...","label":"...","confidence":"high|medium|low"}`;

function isJpeg(b64) {
  if (typeof b64 !== 'string' || !b64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return null;
  let bin;
  try { bin = atob(b64); } catch { return null; }
  const n = bin.length;
  if (n < 4) return null;
  if (n > MAX_IMAGE) return 'too_large';
  const c = (i) => bin.charCodeAt(i);
  return c(0) === 0xff && c(1) === 0xd8 && c(2) === 0xff && c(n - 2) === 0xff && c(n - 1) === 0xd9 ? 'ok' : null;
}
function parse(text) {
  const m = /\{[\s\S]*\}/.exec(String(text || ''));
  if (!m) return null;
  try { const v = JSON.parse(m[0]); return v && typeof v === 'object' && !Array.isArray(v) ? v : null; } catch { return null; }
}
const tidy = (s) => (typeof s === 'string' ? s.normalize('NFKC').replace(/[<>{}\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 30) : '');

export async function handleGarmentPhoto(request, env, { client, authorize = authorizePrivateRequest, reserve = reserveRankBudget } = {}) {
  if (request.method !== 'POST') return fail(405, 'bad_request');
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return fail(415, 'bad_request');
  if (!env.ANTHROPIC_API_KEY && !client) return fail(503, 'not_configured');
  let access;
  try { access = await authorize(request, env); } catch { return fail(503, 'not_configured'); }
  if (!access?.ok) return fail(access?.status || 401, access?.code || 'unauthorized');
  const length = Number(request.headers.get('content-length') || 0);
  if (length > MAX_BODY) return fail(413, 'too_large', '사진이 너무 커요. 다시 골라 주세요.');
  let body;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY) return fail(413, 'too_large', '사진이 너무 커요. 다시 골라 주세요.');
    body = JSON.parse(text);
  } catch { return fail(400, 'bad_request'); }
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).join(',') !== 'image') return fail(400, 'bad_request');
  const check = isJpeg(body.image);
  if (check === 'too_large') return fail(413, 'too_large', '사진이 너무 커요. 다시 골라 주세요.');
  if (check !== 'ok') return fail(400, 'bad_request', '사진을 읽지 못했어요. 다시 골라 주세요.');
  let budget;
  try { budget = await reserve(env); } catch { return fail(503, 'budget_unavailable'); }
  if (!budget?.ok) return fail(budget?.status || 503, budget?.code || 'budget_unavailable');
  const claude = client || new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, ...CLIENT_OPTIONS });
  let res;
  try {
    res = await claude.messages.create({
      model: MODEL, max_tokens: 300, output_config: { effort: 'low' }, system: SYSTEM,
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: body.image } },
        { type: 'text', text: '이 옷을 분류해 주세요.' },
      ] }],
    }, { signal: request.signal });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return fail(429, 'rate_limited');
    if (e instanceof Anthropic.AuthenticationError) return fail(503, 'not_configured');
    return fail(502, providerFailureCode(e));
  }
  if (res?.stop_reason !== 'end_turn' || !Array.isArray(res?.content)) return fail(502, 'error');
  const out = parse(res.content.filter((b) => b.type === 'text').map((b) => b.text).join(''));
  if (!out || typeof out.clothing !== 'boolean') return fail(502, 'parse');
  const kind = KINDS.has(out.kind) ? out.kind : null;
  const color = typeof out.color === 'string' && Object.hasOwn(COLORS, out.color) ? out.color : null;
  const confidence = ['high', 'medium', 'low'].includes(out.confidence) && kind && color ? out.confidence : 'low';
  const ai = providerMetadata(res, env.ANTHROPIC_API_KEY);
  return reply(200, { clothing: out.clothing, kind: out.clothing ? kind : null, color: out.clothing ? color : null, label: out.clothing ? tidy(out.label) : '', confidence, ...(ai ? { ai } : {}) });
}
