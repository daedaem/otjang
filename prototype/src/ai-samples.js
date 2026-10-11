import { demoItems } from './model.js';

// Authored by Codex during prototype preparation, not generated on the user's
// computer. These six examples describe only the supplied sample wardrobe.
const sourceLabel = '미리 준비한 AI 추천 · 샘플 옷 기준';
const fitLimit = '실제 소재·두께·실측과 체형은 확인하지 않았어요. 아래 비율과 겹쳐 입기는 직접 입어 보며 조절해 주세요.';
const samples = [
  {
    id: 'prepared-ai-ivy-office', title: '너무 차려입지 않은 아이비 출근', occasion: 'work',
    styleTags: ['american', 'minimal'],
    items: ['demo-shirt-blue', 'demo-chino-beige', 'demo-loafer-brown'],
    reasons: [
      '셔츠의 칼라와 로퍼가 단정함을 맡고, 치노가 정장 바지보다 편한 인상을 더하는 조합이에요. 셔츠와 치노의 기본 형태를 살려 아메리칸 클래식의 출근복을 시작하기 좋습니다.',
      '셔츠는 바지 안에 넣고 허리에서 살짝 여유를 빼 보세요. 허리선이 드러나 상·하의 경계가 정리되고, 바짓단은 로퍼 위에서 많이 쌓이지 않는 길이부터 비교하면 좋아요.',
      '셔츠와 치노가 모두 뻣뻣하거나 두꺼우면 각이 강해질 수 있어요. 실제 원단을 확인해 소매를 한두 번 걷는 정도로 힘을 빼 보세요.',
    ],
    feedbackPrompt: '셔츠를 넣었을 때의 허리 여유와 로퍼 위 바짓단 길이가 편안한가요?',
  },
  {
    id: 'prepared-ai-campus-knit', title: '니트 안에 셔츠를 한 겹', occasion: 'daily',
    styleTags: ['american', 'casual'],
    items: ['demo-shirt-white', 'demo-knit-navy', 'demo-denim-blue', 'demo-loafer-brown'],
    reasons: [
      '화이트 셔츠 위에 크루넥 니트를 겹치고 데님과 로퍼로 마무리하는 조합이에요. 목 주변의 셔츠 칼라가 시선을 정리하고, 데님이 교복처럼 지나치게 반듯해지는 것을 덜어 줍니다.',
      '이 코디는 색보다 두께의 궁합이 중요해요. 니트의 암홀과 가슴에 셔츠 한 겹이 들어갈 여유가 있는지 확인하고, 어깨나 겨드랑이가 당기면 니트 단독으로 먼저 입어 보세요.',
      '니트 밑단은 허리 부근에 자연스럽게 두고 셔츠 밑단이 길게 늘어지지 않도록 정리해 보세요. 데님은 무조건 가늘게 고르기보다 상체의 겹침과 균형이 맞는 일자 실루엣부터 비교하면 좋아요.',
    ],
    feedbackPrompt: '두 겹을 입었을 때 목과 겨드랑이가 답답한가요, 아니면 셔츠 단독보다 안정적으로 느껴지나요?',
  },
  {
    id: 'prepared-ai-field-weekend', title: '필드 재킷으로 가볍게 떠나는 주말', occasion: 'weekend',
    styleTags: ['american', 'workwear', 'casual'],
    items: ['demo-tee-white', 'demo-denim-blue', 'demo-field-olive', 'demo-sneaker-white'],
    reasons: [
      '포켓이 많은 필드 재킷을 중심에 두고 안쪽은 기본 티셔츠로 단순하게 잡았어요. 재킷의 실용적인 디테일과 데님의 캐주얼한 성격이 이어지고, 스니커즈가 일상적인 마무리를 맡습니다.',
      '재킷 앞을 열면 티셔츠가 세로로 보여 상체가 하나의 큰 덩어리처럼 보이는 것을 줄일 수 있어요. 티셔츠 밑단이 재킷 아래로 길게 나오지 않는지 먼저 확인해 보세요.',
      '재킷과 데님이 둘 다 무겁고 두꺼운 원단이면 활동할 때 부담스러울 수 있어요. 보온성이나 통기성을 추정하지 말고, 실제 무게와 팔의 움직임을 확인해 계절에 맞춰 입어 보세요.',
    ],
    feedbackPrompt: '재킷을 열었을 때와 잠갔을 때 중 어떤 실루엣이 더 자연스럽고 움직이기 편한가요?',
  },
  {
    id: 'prepared-ai-jacket-denim', title: '재킷과 데님 사이의 적당한 격식', occasion: 'work',
    styleTags: ['american'],
    items: ['demo-shirt-white', 'demo-denim-blue', 'demo-jacket-brown', 'demo-loafer-brown'],
    reasons: [
      '셔츠와 로퍼로 단정한 축을 만들고 데님으로 일상의 느낌을 남겼어요. 재킷의 라펠이 있는 상체와 곧게 내려오는 데님을 연결하는 아메리칸 클래식 조합입니다.',
      '재킷의 어깨가 과하게 뜨지 않는지, 셔츠 소매가 손을 덮지 않는지부터 확인해 보세요. 재킷 길이에 비해 바지를 너무 가늘게 입으면 상체만 무거워 보일 수 있어 일자 데님부터 비교하면 좋아요.',
      '재킷 원단의 표면과 데님의 질감은 실물을 보고 판단해야 해요. 매끈하고 격식 높은 재킷이라면 데님과 대비가 강할 수 있으니, 이질감이 느껴지는지 사진으로 한 번 확인해 보세요.',
    ],
    feedbackPrompt: '직장이나 약속 자리에서 원하는 격식에 맞나요? 데님 대신 치노가 필요한 날인지도 함께 기록해 보세요.',
  },
  {
    id: 'prepared-ai-easy-knit', title: '칼라 없이 편안한 클래식', occasion: 'daily',
    styleTags: ['american', 'minimal', 'casual'],
    items: ['demo-knit-navy', 'demo-chino-beige', 'demo-sneaker-white'],
    reasons: [
      '니트와 치노의 기본적인 형태만 남기고 스니커즈로 힘을 뺀 조합이에요. 셔츠나 재킷을 더하지 않아 목과 어깨 주변이 간결하고, 클래식한 옷을 편하게 입고 싶은 날 비교하기 좋습니다.',
      '니트 밑단이 엉덩이를 길게 덮는지, 허리 위로 많이 말려 올라가는지 확인해 보세요. 치노의 허리선 근처에서 자연스럽게 멈추는 위치부터 상·하의 비율을 비교하면 좋아요.',
      '니트가 두껍고 치노가 아주 얇다면 계절감이 어긋나 보일 수 있어요. 실제 두께와 촉감을 확인해 서로 비슷한 계절에 입는 옷인지 점검해 보세요.',
    ],
    feedbackPrompt: '편하지만 너무 평범하게 느껴지나요? 그렇다면 새 옷보다 소매와 바짓단의 정리부터 바꿔 보세요.',
  },
  {
    id: 'prepared-ai-open-oxford', title: '옥스퍼드 셔츠를 가벼운 겉옷처럼', occasion: 'weekend',
    styleTags: ['american', 'casual'],
    items: ['demo-tee-white', 'demo-shirt-blue', 'demo-chino-beige', 'demo-loafer-brown'],
    reasons: [
      '기본 티셔츠 위에 셔츠를 열어 입고 치노와 로퍼로 마무리해 보세요. 같은 옥스퍼드 셔츠도 단추를 잠가 넣어 입는 출근 코디와 다른 역할을 만들 수 있어요.',
      '셔츠가 두 번째 겹으로 들어갈 만큼 품과 팔에 여유가 있는지 확인하세요. 셔츠 밑단이 너무 길면 가벼운 겉옷보다 늘어진 인상이 날 수 있어, 티셔츠를 살짝 넣은 모습과 꺼낸 모습을 비교해 보세요.',
      '두 겹 모두 두꺼우면 셔츠가 부풀 수 있어요. 실제 원단을 확인하고, 소매를 한두 번 걷을 때 팔꿈치가 조이거나 티셔츠 소매가 겹쳐 뭉치지 않는지 확인해 보세요.',
    ],
    feedbackPrompt: '셔츠를 열어 입는 방식이 취향에 맞나요? 단정함이 더 필요하면 첫 번째 출근 조합과 비교해 보세요.',
  },
];

export function getPreparedAIOutfits(state, { anchorId = null } = {}) {
  if (state?.mode !== 'demo' || !Array.isArray(state.items)) return [];
  const expected = new Map(demoItems.map(item => [item.id, item]));
  const available = new Map(state.items.filter(item => item.source === 'demo' && item.confirmed === true
    && item.available !== false && expected.has(item.id)
    && ['category', 'kind', 'color'].every(key => item[key] === expected.get(item.id)[key]))
    .map(item => [item.id, item]));
  return samples.filter(outfit => outfit.items.every(id => available.has(id))
    && (!anchorId || outfit.items.includes(anchorId)))
    .map(outfit => ({ ...outfit, items: [...outfit.items], reasons: [...outfit.reasons], styleTags: [...outfit.styleTags],
      source: 'prepared-ai-sample', sourceLabel, preparedBy: 'Codex', preparedAt: '2026-10-11',
      limitations: [fitLimit], context: '아메리칸 클래식 샘플 옷장으로 미리 작성한 추천입니다.',
    }));
}
