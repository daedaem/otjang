// AI 순위: 조건에 맞는 후보(엔진이 고른 상품)를 Claude가 다시 줄 세우고, 순위마다 이유를 쓴다.
// 링크 페이지에서는 sample 기능(보는 사람의 Claude 계정, 처음 한 번 허용을 묻는다)을, 설치형 앱(app/lite)에서는
// 구조화된 요청을 받는 서버 함수(/api/rank)를 쓴다. 서버 요청에는 상품 id·옷장 비교만 보낸다.
// 원칙: 후보는 엔진이 조건으로 거른 상품만, 이유는 넘겨준 자료(상품 정보·평점·후기·옷장 비교)에 있는 사실만.
// 돌아온 id는 후보 안에 있는 것만 받고, 빠진 후보는 엔진 순서로 뒤에 붙인다. 쓸 수 없으면 엔진 순서를 그대로 보여 준다.
(() => {
  const M = window.EoulMock;
  let samplerP = null;
  const sampler = () => (samplerP ||= (window.claude?.use ? window.claude.use('sample').catch(() => null) : Promise.resolve(null)));
  const memo = new Map();

  function facts(result, limit) {
    const st = M.getState();
    const closet = st.closet.slice(0, 200).map((g) => `${g.colorLabel} ${g.kindName}${g.trial ? '(체험용)' : ''}`.slice(0, 80));
    const items = result.products.slice(0, limit).map((p) => {
      const v = M.judge(p.id);
      const same = (v?.owned || []).filter((o) => ['same-product', 'same-color'].includes(o.relation)).slice(0, 50).map((o) => `${o.colorLabel} ${o.kindName}`.slice(0, 80));
      const sameKind = (v?.owned || []).filter((o) => o.relation === 'other-color').slice(0, 50).map((o) => `${o.colorLabel} ${o.kindName}`.slice(0, 80));
      return {
        id: p.id, brand: p.brand, name: p.name, price: p.price, color: p.colorLabel, kind: p.kindName,
        rating: p.rating, reviews: p.reviews,
        closet: v?.basis === 'none' ? '옷장 정보 없음' : { 같은종류같은색: same, 같은종류다른색: sameKind, 새로생기는조합수: Math.min(100000, Math.max(0, Math.floor(Number(v?.newLookCount) || 0))), 판정: String(v?.title || '').slice(0, 120) },
      };
    });
    return { closet, items };
  }

  function prompt(text, result, data) {
    const cond = (result.conditions || []).map((c) => c.label).join(', ');
    return `당신은 패션 쇼핑 도우미입니다. 사용자의 요청과 옷장을 보고, 아래 후보 상품을 사용자에게 맞는 순서로 다시 줄 세우고 순위마다 이유를 한 문장으로 쓰세요.

규칙
- 후보 목록에 있는 id만 쓰고, 모든 후보를 한 번씩 넣으세요.
- 이유에는 아래 자료에 있는 사실만 쓰세요(상품명, 색, 종류, 가격, 평점, 후기 수, 옷장 비교). 소재·핏·착용감처럼 자료에 없는 것은 상품명에 적혀 있을 때만 "상품명 기준"이라고 쓰세요.
- 옷장에 같은 종류·같은 색 옷이 있으면 사지 않아도 될 수 있다는 점을 순위에 반영하세요(체험용 옷도 사용자의 옷장으로 봅니다).
- 이유는 해요체, 45자 이내. 다른 후보와 무엇이 다른지가 드러나게 쓰세요.
- fit은 "추천", "괜찮아요", "겹쳐요" 중 하나.

사용자 요청: ${text}
알아들은 조건: ${cond || '없음'}
사용자 옷장(${data.closet.length}벌): ${data.closet.join(', ') || '비어 있음'}
후보(엔진 순서): ${JSON.stringify(data.items)}

JSON 하나로만 답하세요. 예: {"summary":"한 문장 총평","ranking":[{"id":"ms-1","reason":"…","fit":"추천"}]}`;
  }

  // 결과: { ok, order:[{id, rank, reason, fit}], summary, why? }
  async function rank(text, result, { limit = 12, onStage } = {}) {
    if (!result?.products?.length) return { ok: false, why: 'empty' };
    const query = String(text || '').trim();
    if (!query || query.length > 300) return { ok: false, why: 'bad_request' };
    limit = Math.max(1, Math.min(12, Number.isFinite(limit) ? Math.floor(limit) : 12));
    const data = facts(result, limit);
    const request = { task: 'rank', query, items: data.items.map(({ id, closet }) => ({ id, closet })), closet: data.closet, conditions: (result.conditions || []).slice(0, 12).map((c) => String(c.label || '').slice(0, 80)) };
    const key = JSON.stringify(request);
    if (memo.has(key)) return memo.get(key);
    const server = typeof window.EOUL_SERVER_AI === 'function' ? window.EOUL_SERVER_AI : null;
    const sample = server ? null : await sampler();
    if (!server && !sample) return { ok: false, why: 'unavailable' };
    onStage?.('asking');
    try {
      const out = server ? await server(request) : await sample.json(prompt(query, result, data), { modelTier: 'quick' });
      const ids = new Set(data.items.map((x) => x.id));
      const seen = new Set();
      const order = (Array.isArray(out?.ranking) ? out.ranking : [])
        .filter((r) => r && ids.has(String(r.id)) && !seen.has(String(r.id)) && seen.add(String(r.id)))
        .map((r) => ({ id: String(r.id), reason: String(r.reason || '').slice(0, 80), fit: ['추천', '괜찮아요', '겹쳐요'].includes(r.fit) ? r.fit : '' }));
      if (!order.length) return { ok: false, why: 'parse' };
      data.items.forEach((x) => { if (!seen.has(x.id)) order.push({ id: x.id, reason: '', fit: '' }); });
      order.forEach((r, i) => { r.rank = i + 1; });
      const res = { ok: true, order, summary: String(out?.summary || '').slice(0, 120) };
      memo.set(key, res);
      return res;
    } catch (e) {
      return { ok: false, why: e?.code || 'error' };
    }
  }

  // 화면 문구: 실패 이유를 짧게.
  const whyText = (why) => ({
    unavailable: 'AI 순위는 claude.ai에서 열었을 때만 보여요. 지금은 기본 순서예요.',
    not_granted: 'AI 사용을 허용하지 않아서 기본 순서로 보여 드려요.',
    rate_limited: 'AI 요청이 많아 잠시 뒤에 다시 시도해 주세요. 지금은 기본 순서예요.',
    sampling_disabled: '이 계정에서는 AI를 쓸 수 없어서 기본 순서예요.',
    not_configured: 'AI 순위가 아직 설정되지 않아 기본 순서로 보여 드려요.',
    daily_limit: '오늘 AI 순위 사용량을 다 써서 기본 순서로 보여 드려요.',
    member_daily_limit: '오늘 쓸 수 있는 AI 10번을 다 써서 기본 순서로 보여 드려요.',
    monthly_limit: '이번 달 AI 사용 한도에 도달해 기본 순서로 보여 드려요.',
    budget_unavailable: 'AI 사용량을 확인할 수 없어 기본 순서로 보여 드려요.',
    unauthorized: 'AI 사용 권한을 확인할 수 없어 기본 순서로 보여 드려요.',
    bad_request: 'AI 요청을 처리할 수 없어 기본 순서로 보여 드려요. 질문을 300자 안으로 줄여 보세요.',
    timeout: 'AI 응답이 늦어 기본 순서로 보여 드려요.',
    offline: '연결이 없어 기본 순서로 보여 드려요.',
  }[why] || 'AI 순위를 받지 못해 기본 순서로 보여 드려요.');

  window.AIRank = { rank, whyText, available: async () => typeof window.EOUL_SERVER_AI === 'function' || !!(await sampler()) };
})();
