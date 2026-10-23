// AI 순위 품질 시험: 링크 시안과 같은 프롬프트·검증(links/shared/ai-rank.js)을 실제 Claude API로 돌려 모델별 순위·이유를 비교한다.
// 키는 환경 변수 ANTHROPIC_API_KEY에서만 읽는다(저장소·채팅에 두지 않는다). 비용 상한(--max-usd, 기본 1달러)에 닿으면 멈춘다.
// 준비: app 폴더에서 `npm install --no-save @anthropic-ai/sdk` (package.json은 바꾸지 않는다).
// 실행: node mockups/ux10v2/tools/ai-rank-eval.mjs [--models haiku,sonnet] [--max-usd 1] [--queries 8] [--effort low] [--out ai-rank-eval.md] [--dry]
// --effort를 주면 두 모델의 생각량을 같게 고정한다(안 주면 모델 기본값: Haiku 5.5는 medium, Sonnet 5.5는 high).
// --dry는 키 없이 가짜 응답으로 흐름만 확인한다(비용 0).
import fs from 'node:fs';
import vm from 'node:vm';
import { createMock } from '../../../../../app/lite/src/core.mjs';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i < 0 ? fallback : process.argv[i + 1];
};
const DRY = process.argv.includes('--dry');
const MAX_USD = Number(arg('max-usd', '1'));
const OUT = arg('out', 'ai-rank-eval.md');
const QUERY_LIMIT = Number(arg('queries', '8'));
const EFFORT = arg('effort', '');
// 요금(달러/백만 토큰, 2026-10 공식 요금표 기준). 출력 토큰에는 생각(thinking) 토큰이 포함된다.
const MODELS = {
  haiku: { id: 'claude-haiku-5-5', in: 0.1, out: 0.5 },
  sonnet: { id: 'claude-sonnet-5-5', in: 2, out: 10 },
};
if (!DRY && !process.env.ANTHROPIC_API_KEY) {
  console.error('환경 변수 ANTHROPIC_API_KEY가 없어요. 클라우드 환경 설정(Network secrets 또는 환경 변수)에 넣고 새 세션에서 실행해 주세요.');
  process.exit(2);
}
const picked = arg('models', 'haiku,sonnet').split(',').map((s) => s.trim()).filter((s) => MODELS[s]);

// 시안 첫 화면 예시 문장 중심(후보가 있는 것만). 남녀 각각, 옷장이 비었을 때와 체험용 옷장이 있을 때를 함께 본다(옷장과 겹치는 옷을 내리는지 확인).
const QUERIES = [
  ['M', '출근용 셔츠 10만원 이하'],
  ['M', '겨울 데이트 코트'],
  ['M', '검정 말고 주말에 입을 편한 바지'],
  ['M', '검정 반팔 티셔츠'],
  ['F', '원피스 10만원 이하'],
  ['F', '겨울 코트 20만원 이하'],
  ['F', '데이트 스커트'],
  ['F', '흰 스니커즈'],
].slice(0, QUERY_LIMIT);

const RANK_SRC = fs.readFileSync(new URL('../../../../../app/lite/src/browser/ai-rank.js', import.meta.url), 'utf8');
// 시안과 똑같은 코드로 순위를 받기 위해 ai-rank.js를 따로 된 실행 공간에 올리고, 링크 페이지의 sample 자리에 API 호출을 끼운다.
function ranker(M, sample) {
  const window = { EoulMock: M, claude: { use: async () => sample } };
  vm.runInNewContext(RANK_SRC, { window, console });
  return window.AIRank;
}

let spent = 0;
const usage = {};
function parseJson(text) {
  const s = text.replace(/```(?:json)?/g, '');
  const a = s.indexOf('{');
  const b = s.lastIndexOf('}');
  if (a < 0 || b <= a) throw Object.assign(new Error('JSON 없음'), { code: 'parse' });
  try { return JSON.parse(s.slice(a, b + 1)); } catch { throw Object.assign(new Error('JSON 해석 실패'), { code: 'parse' }); }
}

async function makeSample(key) {
  const m = MODELS[key];
  const u = (usage[key] ||= { calls: 0, ok: 0, in: 0, out: 0, usd: 0, ms: 0, errors: {} });
  if (DRY) {
    return {
      json: async (prompt) => {
        u.calls++;
        const ids = [...prompt.matchAll(/"id":"([^"]+)"/g)].map((x) => x[1]);
        return { summary: '가짜 응답', ranking: ids.reverse().map((id) => ({ id, reason: '가짜 이유예요.', fit: '괜찮아요' })) };
      },
    };
  }
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic();
  return {
    json: async (prompt) => {
      if (spent >= MAX_USD) throw Object.assign(new Error('비용 상한'), { code: 'budget' });
      u.calls++;
      const t0 = Date.now();
      let res;
      try {
        res = await client.messages.create({ model: m.id, max_tokens: 8000, ...(EFFORT ? { output_config: { effort: EFFORT } } : {}), messages: [{ role: 'user', content: prompt }] });
      } catch (e) {
        if (e instanceof Anthropic.AuthenticationError) {
          console.error('키가 거절됐어요(401). 환경 변수 ANTHROPIC_API_KEY를 확인해 주세요.');
          process.exit(2);
        }
        u.lastError = e.message;
        throw Object.assign(new Error(e.message), { code: e instanceof Anthropic.APIError ? `api_${e.status}` : 'error' });
      }
      u.ms += Date.now() - t0;
      const cost = (res.usage.input_tokens * m.in + res.usage.output_tokens * m.out) / 1e6;
      u.in += res.usage.input_tokens;
      u.out += res.usage.output_tokens;
      u.usd += cost;
      spent += cost;
      if (res.stop_reason === 'refusal') throw Object.assign(new Error('거절'), { code: 'refusal' });
      if (res.stop_reason === 'max_tokens') throw Object.assign(new Error('출력 길이 초과'), { code: 'max_tokens' });
      return parseJson(res.content.filter((b) => b.type === 'text').map((b) => b.text).join(''));
    },
  };
}

// 자동 점검: 이유 길이, 자료에 없는 사실(소재·핏 등)을 상품명 근거 없이 쓴 경우, 모델이 빠뜨린 후보, 옷장과 같은 옷의 순위.
const UNSEEN = /소재|핏|착용감|두께|신축|촉감|통기|부드러|가벼|무게|원단|면\s?100/;
function check(M, res, ids) {
  const flags = [];
  const p = (id) => M.product(id);
  let given = 0;
  for (const r of res.order) {
    if (r.reason) given++;
    if (r.reason.length > 45) flags.push(`${r.rank}위 이유 ${r.reason.length}자`);
    const hit = r.reason.match(UNSEEN);
    if (hit && !(p(r.id)?.name || '').includes(hit[0]) && !r.reason.includes('상품명 기준')) flags.push(`${r.rank}위 자료에 없는 '${hit[0]}'`);
  }
  if (given < ids.length) flags.push(`이유 없는 후보 ${ids.length - given}개(모델이 빠뜨림)`);
  const same = res.order.filter((r) => (M.judge(r.id)?.owned || []).some((o) => ['same-product', 'same-color'].includes(o.relation)));
  const avg = (rows) => (rows.length ? rows.reduce((s, r) => s + r.rank, 0) / rows.length : null);
  return { flags, sameCount: same.length, sameAvgRank: avg(same), restAvgRank: avg(res.order.filter((r) => !same.includes(r))), sameMarked: same.filter((r) => r.fit === '겹쳐요').length };
}

const lines = [];
const out = (s = '') => lines.push(s);
const rows = [];
for (const [gender, text] of QUERIES) {
  for (const closet of ['빈 옷장', '체험용 옷장']) {
    const M = createMock({ reset: true, photos: false });
    M.loadTrialCloset(gender);
    if (closet === '빈 옷장') M.clearTrialCloset();
    const result = M.ask(text);
    const ids = result.products.slice(0, 12).map((p) => p.id);
    out(`## ${text} (${gender === 'F' ? '여' : '남'}, ${closet})`);
    out();
    if (!ids.length) { out('후보 없음'); out(); continue; }
    out(`기본(엔진) 순서: ${result.products.slice(0, 5).map((p) => `${p.brand} ${p.name}`).join(' / ')}`);
    out();
    for (const key of picked) {
      const AIRank = ranker(M, await makeSample(key));
      const res = await AIRank.rank(text, result, { limit: 12 });
      out(`### ${key}`);
      if (!res.ok) { out(`실패: ${res.why}`); out(); usage[key].errors[res.why] = (usage[key].errors[res.why] || 0) + 1; continue; }
      usage[key].ok++;
      const c = check(M, res, ids);
      rows.push({ key, ...c });
      if (res.summary) out(`> ${res.summary}`);
      out();
      out('| 순위 | 상품 | 가격 | 판단 | 이유 |');
      out('|---|---|---|---|---|');
      for (const r of res.order) {
        const p = M.product(r.id);
        out(`| ${r.rank} | ${p.brand} ${p.name} (${p.colorLabel}) | ${p.price?.toLocaleString('ko-KR') ?? '-'}원 | ${r.fit || '-'} | ${r.reason || '(없음)'} |`);
      }
      out();
      if (c.sameCount) out(`옷장과 같은 옷 ${c.sameCount}개: 평균 ${c.sameAvgRank.toFixed(1)}위(나머지 ${c.restAvgRank?.toFixed(1) ?? '-'}위), '겹쳐요' 표시 ${c.sameMarked}개`);
      out(c.flags.length ? `점검: ${c.flags.join(', ')}` : '점검: 문제 없음');
      out();
    }
    if (spent >= MAX_USD) break;
  }
  if (spent >= MAX_USD) { out(`**비용 상한 ${MAX_USD}달러에 닿아 멈췄어요.**`); break; }
}

const head = [`# AI 순위 품질 시험 (${new Date().toISOString().slice(0, 10)}${DRY ? ', 가짜 응답' : ''}, effort ${EFFORT || '모델 기본값'})`, '', '| 모델 | 호출 | 성공 | 평균 응답 | 입력 토큰 | 출력 토큰 | 비용(달러) | 점검 걸린 줄 | 실패 |', '|---|---|---|---|---|---|---|---|---|'];
for (const key of picked) {
  const u = usage[key] || { calls: 0, ok: 0, in: 0, out: 0, usd: 0, ms: 0, errors: {} };
  const flagged = rows.filter((r) => r.key === key).reduce((s, r) => s + r.flags.length, 0);
  head.push(`| ${key} (${MODELS[key].id}) | ${u.calls} | ${u.ok} | ${u.calls ? (u.ms / u.calls / 1000).toFixed(1) : '-'}초 | ${u.in} | ${u.out} | ${u.usd.toFixed(4)} | ${flagged} | ${JSON.stringify(u.errors)}${u.lastError ? ` 마지막 오류: ${u.lastError.slice(0, 120)}` : ''} |`);
}
head.push('', `총비용 약 ${spent.toFixed(4)}달러(토큰 수 × 공식 요금으로 계산한 추정, 실제 청구는 콘솔에서 확인).`, '');
fs.writeFileSync(OUT, [...head, ...lines].join('\n'));
console.log(`저장: ${OUT} · 총비용 약 ${spent.toFixed(4)}달러`);
