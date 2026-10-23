// 한 줄 요청을 조건으로 바꾼다. 예) "출근용 셔츠 10만원 이하", "청바지에 어울리는 신발", "겨울 데이트 코트"
// 이해한 조건은 terms로 돌려줘 화면에 칩으로 보여 준다(사용자가 해석을 확인하고 지울 수 있게).

const OCCASION_WORDS = [
  [/출근|회사|오피스|직장|사무실|미팅|비즈니스/, 'work', '출근'],
  [/하객|결혼식|격식|면접|상견례|돌잔치|정장/, 'formal', '격식'],
  [/데이트|소개팅|기념일|약속/, 'date', '데이트'],
  [/주말|여행|나들이|캠퍼스|학교|등교|캠핑|산책/, 'weekend', '주말'],
  [/데일리|평소|매일|일상|편하게|편한/, 'daily', '데일리'],
];

const SEASON_WORDS = [
  [/겨울|한겨울|추운/, 'winter', '겨울'],
  [/여름|더운|한여름/, 'summer', '여름'],
  [/(^|[\s,])(?:올)?봄(?=$|[\s,.!?]|철|용|옷|코디|룩|에|날씨|셔츠|니트|재킷|자켓|코트|바지|신발)/, 'spring', '봄'],
  [/가을|환절기|선선/, 'fall', '가을'],
];

const STYLE_WORDS = [
  [/아메카지|아메리칸\s*캐주얼|워크웨어|빈티지\s*데님|밀리터리/, 'amekaji', '아메카지'],
  [/아메리칸\s*클래식|클래식|아이비|프레피|트래디셔널|올드\s*머니|올드머니/, 'classic', '아메리칸 클래식'],
  [/시티\s*보이|시티보이|오버핏|넉넉/, 'cityboy', '시티보이'],
  [/미니멀|모노톤|심플|깔끔/, 'minimal', '미니멀'],
  [/댄디|비즈니스\s*캐주얼|비즈캐/, 'dandy', '댄디'],
  [/고프코어|아웃도어|등산|캠핑룩|기능성/, 'gorp', '고프코어'],
  [/프렌치|파리지앵/, 'french', '프렌치 시크'],
  [/캐주얼|스트릿/, 'casual', '캐주얼'],
];

const COLOR_WORDS = [
  [/흰|화이트|하얀|흰색/, 'white', '화이트'],
  [/검정|블랙|검은/, 'black', '블랙'],
  [/네이비|남색/, 'navy', '네이비'],
  [/회색|그레이|차콜/, 'grey', '그레이'],
  [/베이지|샌드|카멜/, 'beige', '베이지'],
  [/카키|올리브/, 'olive', '올리브'],
  [/갈색|브라운/, 'brown', '브라운'],
  [/하늘|파란|블루|청색/, 'blue', '블루'],
  [/아이보리|크림|오트밀/, 'ivory', '아이보리'],
  [/초록|그린/, 'green', '그린'],
  [/빨간|빨강|레드|버건디|와인색/, 'red', '레드·버건디'],
  [/핑크|분홍/, 'pink', '핑크'],
  [/노란|노랑|옐로/, 'yellow', '옐로'],
  [/보라|퍼플/, 'purple', '퍼플'],
  [/주황|오렌지/, 'orange', '오렌지'],
];

// 아이템 단어 → 아이템 자리 판별 함수. 위에서부터 더 구체적인 단어를 먼저 본다.
const ITEM_WORDS = [
  [/트러커|청자켓|청재킷|데님\s*(재킷|자켓)/, (s) => ['m-trucker', 'f-jacket'].includes(s.id), '데님 재킷'],
  [/샴브레이|데님\s*셔츠|청\s*셔츠|웨스턴\s*셔츠|워크\s*셔츠/, (s) => s.id === 'm-chambray', '데님 셔츠'],
  [/옥스(포|퍼)드|버튼\s*다운/, (s) => s.id === 'm-oxford', '옥스퍼드 셔츠'],
  [/스트라이프|줄무늬/, (s) => ['m-stripe-shirt', 'm-rugby', 'f-stripe'].includes(s.id), '스트라이프'],
  [/플란넬|체크\s*셔츠|체크/, (s) => s.id === 'm-flannel', '체크 셔츠'],
  [/폴로\s*(?:셔츠|티(?:셔츠)?)|polo\s+(?:shirts?|tees?)|카라\s*티|\bpk\b|피케/, (s) => s.id === 'm-polo', '폴로 셔츠'],
  [/럭비/, (s) => s.id === 'm-rugby', '럭비 셔츠'],
  [/헨리/, (s) => s.id === 'm-henley', '헨리넥'],
  [/케이블|꽈배기/, (s) => s.id === 'm-cable', '케이블 니트'],
  [/(?:패딩|다운|푸퍼)\s*(?:베스트|조끼)/, (s) => s.id === 'm-downvest', '패딩 베스트'],
  [/베스트|조끼/, (s) => s.shape === 'vest', '베스트'],
  [/카디건|가디건/, (s) => s.shape === 'cardigan', '카디건'],
  [/니트|스웨터/, (s) => s.shape === 'knit', '니트'],
  [/후드\s*(?:티|집업)?|후디/, (s) => ['m-hoodie', 'f-sweat'].includes(s.id), '후드'],
  [/맨투맨|스웻|스웨트/, (s) => ['m-sweat', 'f-sweat'].includes(s.id), '맨투맨'],
  [/긴팔|롱슬리브/, (s) => s.shape === 'longtee', '긴팔 티'],
  // "꾸민 티 안 나게"의 '티'는 옷이 아니다.
  [/티셔츠|반팔|(^|\s)티(?!\s*(?:안|나게|나는|내|낼))(?=\s|$)/, (s) => s.shape === 'tee' || s.shape === 'longtee', '티셔츠'],
  [/블레이저|정장\s*재킷|수트\s*재킷|자켓\s*정장/, (s) => s.shape === 'blazer', '블레이저'],
  [/트렌치/, (s) => /trench/.test(s.id), '트렌치 코트'],
  [/발마칸/, (s) => s.id === 'm-balmacaan', '발마칸 코트'],
  [/피코트|더플/, (s) => s.id === 'm-peacoat', '피코트'],
  [/코트/, (s) => s.shape === 'coat', '코트'],
  [/패딩|다운|푸퍼/, (s) => s.shape === 'down', '패딩'],
  [/플리스|후리스/, (s) => s.id === 'm-fleece', '플리스'],
  [/바람막이|쉘|아노락|윈드브레이커/, (s) => s.id === 'm-shell', '바람막이'],
  [/왁스|바버|헌팅/, (s) => s.id === 'm-wax', '왁스 재킷'],
  [/해링턴|블루종|스윙탑/, (s) => s.id === 'm-harrington', '블루종'],
  [/바시티|야구\s*점퍼|스타디움/, (s) => s.id === 'm-varsity', '바시티 재킷'],
  [/덱\s*재킷|n-?1/i, (s) => s.id === 'm-deck', '덱 재킷'],
  [/필드|m-?65|밀리터리\s*재킷/i, (s) => s.id === 'm-field', '필드 재킷'],
  [/초어|커버올|워크\s*재킷/, (s) => ['m-chore', 'f-jacket'].includes(s.id), '워크 재킷'],
  [/재킷|자켓|점퍼/, (s) => s.cat === 'outer' && ['jacket', 'blazer'].includes(s.shape), '재킷'],
  [/아우터|겉옷/, (s) => s.cat === 'outer', '아우터'],
  [/셔츠|남방|블라우스/, (s) => s.shape === 'shirt', '셔츠'],
  [/생지|셀비지|로우\s*데님|리지드/, (s) => s.id === 'm-denim-raw', '생지 데님'],
  [/청바지|데님|(^|\s)진(?=\s|$)|\bjeans\b/, (s) => s.shape === 'jeans', '청바지'],
  [/치노|면바지/, (s) => s.id === 'm-chino', '치노'],
  [/코듀로이|골덴/, (s) => s.id === 'm-cords', '코듀로이'],
  [/슬랙스|정장\s*바지|트라우저/, (s) => /slacks/.test(s.id), '슬랙스'],
  [/퍼티그|베이커|페인터|카펜터|워크\s*팬츠|군복/, (s) => s.id === 'm-work-pants', '워크 팬츠'],
  [/카고/, (s) => s.id === 'm-cargo', '카고 팬츠'],
  // 상품 목록에 아직 없는 종류: 다른 바지로 채우지 않고 "없어요"로 알린다.
  [/반바지|숏\s*팬츠|쇼츠|하프\s*팬츠/, () => false, '반바지'],
  [/조거\s*(?:팬츠|바지)?|트레이닝\s*(?:팬츠|바지|복)?|츄리닝|추리닝|트랙\s*팬츠|스웨트\s*팬츠/, () => false, '트레이닝·조거 팬츠'],
  [/레깅스/, () => false, '레깅스'],
  [/수영복|래시\s*가드|비키니/, () => false, '수영복'],
  [/바지|팬츠|하의/, (s) => s.cat === 'bottom' && s.shape !== 'skirt', '바지'],
  [/스커트|치마/, (s) => s.shape === 'skirt', '스커트'],
  [/원피스|드레스/, (s) => s.cat === 'dress', '원피스'],
  [/상의|윗옷|탑/, (s) => s.cat === 'top', '상의'],
  [/로퍼/, (s) => /loafer/.test(s.id), '로퍼'],
  [/메리제인|플랫|발레/, (s) => s.id === 'f-flat', '플랫'],
  [/더비|구두/, (s) => s.cat === 'shoes' && s.shape === 'loafer', '구두'],
  [/워크\s*부츠|목토|레드윙|워커/, (s) => s.id === 'm-workboots' || s.id === 'f-boots', '워크부츠'],
  [/첼시/, (s) => s.id === 'm-chelsea' || s.id === 'f-boots', '첼시 부츠'],
  [/부츠/, (s) => s.shape === 'boot', '부츠'],
  [/트레일|등산화/, (s) => s.id === 'm-trail', '트레일 슈즈'],
  [/캔버스|컨버스|척\s*70/, (s) => s.id === 'm-canvas' || s.id === 'f-sneaker', '캔버스화'],
  [/스니커즈|운동화|뉴발/, (s) => s.shape === 'sneaker', '스니커즈'],
  [/신발|슈즈/, (s) => s.cat === 'shoes', '신발'],
  [/가방|(^|\s)백(?=\s|$)|숄더/, (s) => s.shape === 'bag', '가방'],
  [/비니|워치\s*캡/, (s) => s.shape === 'beanie', '비니'],
  [/모자|캡|볼캡/, (s) => s.shape === 'cap', '볼캡'],
  [/벨트/, (s) => s.shape === 'belt', '벨트'],
];

// "밝은/어두운" 같은 색 톤. 특정 색 하나가 아니라 밝기로 고른다.
const TONE_WORDS = [
  [/밝은|화사한|연한|라이트/, 'light', '밝은 색'],
  [/어두운|짙은|진한|다크/, 'dark', '어두운 색'],
];

// 상품 자료에 없어 반영할 수 없는 조건. 조용히 무시하지 않고 "반영하지 못했어요"로 알린다.
const UNSUPPORTED_WORDS = [
  [/구김|링클|구겨지/, '구김 정도'],
  [/방수|발수|비\s*(?:올|와)|생활\s*방수/, '방수·발수'],
  [/기모|보온|따뜻한|안\s*추운/, '보온성'],
  [/시원한|통기|땀|쿨링/, '통기성'],
  [/린넨|리넨|캐시미어|코튼|면\s*100|울\s*(?:소재|100|함량)|가죽|레더|스웨이드|소재/, '소재'],
  [/슬림\s*핏|와이드|루즈\s*핏|크롭|기장|짧은|긴\s*(?:기장|길이)/, '핏·기장'],
  [/사이즈|체형|통통|마른|키\s*(?:큰|작은)|어깨|허벅지|뱃살|하체|상체/, '사이즈·체형'],
  [/얇은|두꺼운|두툼/, '두께'],
  [/스판|신축|늘어나/, '신축성'],
  [/세탁|물빨래|드라이/, '세탁 방법'],
];

// 조건을 덧붙이지 않는 말. 이해하지 못한 단어를 고를 때 빼고 본다.
const FILLER = /^(?:추천|추천해|추천해줘|해줘|해주세요|주세요|줘|좀|하나|한\s*벌|사고|살|싶어|싶은|싶다|찾아|찾는|찾고|입을|입기|입고|신을|옷|거|것|걸|용|할|수|있는|좋은|괜찮은|무난한|예쁜|이쁜|요즘|같은|느낌|스타일|룩|코디|뭐|어떤|입을만한|살만한|필요|필요해|사려고|고민|중|이번|새로|새|제|내|나|저|우리|그냥|대충|정도|쯤|약|요|도|안|가는|않는|없는|있게|되는|된|잘|딱|좀더|조금|많이|너무|아주|진짜|넣고|빼고|말고|아닌|아니고|대신|제외|제외하고|조건|가격|이하|이상|미만|초과|대|까지|부터|이내|원|만원)$/;

// 브랜드 이름의 다른 표기
const BRAND_ALIASES = {
  '폴로 랄프 로렌': [
    '폴로',
    '폴로랄프로렌',
    '폴로 랄프로렌',
    '랄프로렌',
    '랄프 로렌',
    'polo',
    'polo ralph lauren',
    'ralph',
  ],
  리바이스: ['levis', "levi's", '리바이스'],
  칼하트: ['carhartt', '칼하트'],
  오어슬로우: ['orslow', '오어슬로우'],
  '브룩스 브라더스': ['브룩스', 'brooks'],
  '무신사 스탠다드': ['무탠', '무신사스탠다드', '무신사 스탠다드'],
  노스페이스: ['north face', '노페', '노스페이스'],
  뉴발란스: ['new balance', '뉴발'],
  레드윙: ['red wing', '레드윙'],
  파타고니아: ['patagonia', '파타고니아'],
  아크테릭스: ['arcteryx', '아크'],
  닥터마틴: ['dr.martens', '닥마', '닥터마틴'],
  컨버스: ['converse', '컨버스'],
  디키즈: ['dickies', '디키즈'],
};

// "X에 어울리는 Y", "X랑 입을 Y", "X와 매치할 Y"
const ANCHOR_SPLIT =
  /(.+?)(?:에|랑|이랑|하고|와|과|이랑도|에도)\s*(?:잘\s*)?(?:어울리는|어울릴|맞는|입을|신을|매치할|매치하기\s*좋은|코디할|같이\s*입을|받쳐\s*입을)\s*(.*)/;

function itemMatchers(text) {
  const matched = [];
  for (const [re, fn, label] of ITEM_WORDS) {
    if (re.test(text)) {
      matched.push({ fn, label });
      text = text.replace(re, ' ');
    }
  }
  return matched;
}

function objectParticle(word) {
  const code = word.trim().slice(-1).charCodeAt(0) - 0xac00;
  if (code < 0 || code > 11171) return '를';
  return code % 28 ? '을' : '를';
}

function firstMatch(table, text) {
  for (const [re, value, label] of table) if (re.test(text)) return { value, label };
  return null;
}

const priceLabel = (amount) => (amount % 10000 === 0 ? `${amount / 10000}만원` : `${amount.toLocaleString('ko-KR')}원`);
const AMOUNT =
  '(\\d{1,3}(?:,\\d{3})+|\\d+(?:\\.\\d+)?)\\s*(만\\s*원|만(?=\\s*(?:이상|이하|미만|초과|넘|안\\s*넘|대|까지|부터|이내|[~〜～-]|$))|원)';

// 서버(app/lite/functions/api/rank.js)도 같은 해석을 쓰도록 내보낸다.
export function priceBounds(text) {
  let minPrice = null,
    maxPrice = null,
    minPriceExclusive = false,
    maxPriceExclusive = false;
  const setMin = (value, exclusive = false) => {
    if (minPrice === null || value > minPrice || (value === minPrice && exclusive)) {
      minPrice = value;
      minPriceExclusive = exclusive;
    }
  };
  const setMax = (value, exclusive = false) => {
    if (maxPrice === null || value < maxPrice || (value === maxPrice && exclusive)) {
      maxPrice = value;
      maxPriceExclusive = exclusive;
    }
  };
  const amount = (number, unit) => Math.round(Number(number.replaceAll(',', '')) * (unit.startsWith('만') ? 10000 : 1));
  // A shared currency suffix also covers "5~10만원"; step counts such as "1만보" have no currency suffix.
  const sharedRange = text.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*[~〜～-]\\s*${AMOUNT}`));
  if (sharedRange) {
    setMin(amount(sharedRange[1], sharedRange[3]));
    setMax(amount(sharedRange[2], sharedRange[3]));
    text = text.replace(sharedRange[0], ' ');
  }
  const fullRange = text.match(new RegExp(`${AMOUNT}\\s*(?:[~〜～-]|에서)\\s*${AMOUNT}(?:\\s*까지)?`));
  if (fullRange) {
    setMin(amount(fullRange[1], fullRange[2]));
    setMax(amount(fullRange[3], fullRange[4]));
    text = text.replace(fullRange[0], ' ');
  }
  for (const match of text.matchAll(
    new RegExp(
      `${AMOUNT}\\s*(넘지\\s*(?:않|말)[가-힣]*|안\\s*넘[가-힣]*|넘(?:는|어|을|으면|게)?|이상|이하|미만|초과|대|까지|부터|이내)?`,
      'g',
    ),
  )) {
    const value = amount(match[1], match[2]);
    const qualifier = match[3];
    if (qualifier === '이상' || qualifier === '부터' || (!qualifier && /최소\s*$/.test(text.slice(0, match.index))))
      setMin(value);
    else if (qualifier === '초과' || (qualifier?.startsWith('넘') && !qualifier.startsWith('넘지')))
      setMin(value, true);
    else if (qualifier === '대') {
      setMin(value);
      setMax(value + (value % 100000 === 0 ? 100000 : 10000) - 1);
    } else setMax(value, qualifier === '미만');
  }
  return { minPrice, maxPrice, minPriceExclusive, maxPriceExclusive };
}

const NEGATION = /([^\s,]+)\s*(?:은|는|이|가|색|색은|색깔)?\s*(?:말고|빼고|제외하고|제외|아닌|아니고|대신|싫고|싫어|없이)(?=$|[\s,.])/g;

export function parseQuery(raw = '', { brands = [] } = {}) {
  let text = ` ${raw.trim().toLowerCase()} `;
  const terms = [];

  // "검정 말고", "셔츠 빼고": 앞 단어는 원하는 조건이 아니라 뺄 조건이다.
  const excludeColors = [], excludeItems = [];
  text = text.replace(NEGATION, (whole, word) => {
    const color = firstMatch(COLOR_WORDS, word);
    if (color) { excludeColors.push(color); return ' '; }
    const item = ITEM_WORDS.find(([re]) => re.test(word));
    if (item) { excludeItems.push({ fn: item[1], label: item[2] }); return ' '; }
    return whole;
  });

  // 브랜드: 긴 이름부터 찾고, 찾은 글자는 아이템 단어 해석에서 뺀다
  let brand = null;
  const candidates = brands
    .flatMap((b) => [b, ...(BRAND_ALIASES[b] || [])].map((alias) => [alias.toLowerCase(), b]))
    .sort((a, b) => b[0].length - a[0].length);
  const brandText = text.replace(/폴로\s*(?:셔츠|티(?:셔츠)?)|polo\s+(?:shirts?|tees?)/g, (word) =>
    ' '.repeat(word.length),
  );
  for (const [alias, name] of candidates) {
    if (alias.length < 2) continue;
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = brandText.match(new RegExp(`(^|[^a-z0-9가-힣])(${escaped})(?=$|[^a-z0-9가-힣])`));
    if (match) {
      brand = name;
      const index = match.index + match[1].length;
      text = `${text.slice(0, index)} ${text.slice(index + alias.length)}`;
      terms.push(name);
      break;
    }
  }

  let anchorText = '';
  let targetText = text;
  const split = text.match(ANCHOR_SPLIT);
  if (split) {
    anchorText = split[1];
    targetText = split[2] || '';
  }

  const anchors = itemMatchers(anchorText);
  const targets = itemMatchers(targetText);
  for (const a of anchors) terms.push(`${a.label}와 함께`);
  for (const t of targets) terms.push(t.label);

  const occ = firstMatch(OCCASION_WORDS, text);
  if (occ) terms.push(occ.label);
  const season = firstMatch(SEASON_WORDS, text);
  if (season) terms.push(season.label);
  const style = firstMatch(STYLE_WORDS, text);
  if (style) terms.push(style.label);
  const color = firstMatch(COLOR_WORDS, targetText);
  if (color) terms.push(color.label);
  const tone = color ? null : firstMatch(TONE_WORDS, targetText);
  if (tone) terms.push(tone.label);
  for (const c of excludeColors) terms.push(`${c.label} 제외`);
  for (const i of excludeItems) terms.push(`${i.label} 제외`);
  const unsupported = UNSUPPORTED_WORDS.filter(([re]) => re.test(text)).map(([, label]) => label);
  // "편한": 착용감 자료는 없다. 상품명의 밴딩·이지 같은 표기로 순서만 바꾸고 그렇게 알린다.
  const comfort = /편한|편하게|편안|편히/.test(text);
  if (comfort) terms.push('편한 표기 먼저');
  const anchorColor = firstMatch(COLOR_WORDS, anchorText);
  if (anchorColor) terms.push(`기준 색: ${anchorColor.label}`);

  let gender = null;
  if (/여자|여성|여친|여자친구/.test(text)) gender = 'F';
  else if (/남자|남성|남친|남자친구/.test(text)) gender = 'M';

  let { minPrice, maxPrice, minPriceExclusive, maxPriceExclusive } = priceBounds(text);
  const ascendingPrice = /최저\s*가|낮은\s*가격\s*순|가격\s*낮은\s*순|가격\s*오름차순/.test(text);
  const descendingPrice =
    /최고\s*가|높은\s*가격\s*순|가격\s*높은\s*순|가격\s*내림차순|비싼\s*순|(^|[\s,])비싼(?=\s|$|[,.!?])/.test(text);
  const plainPriceOrder = /가격\s*순/.test(text) && !descendingPrice;
  const priceSort = descendingPrice ? 'desc' : ascendingPrice || plainPriceOrder ? 'asc' : null;
  const cheap = /저렴|가성비|(^|[\s,])싼(?=\s|$|[,.!?])|저가|부담\s*없/.test(text);
  const premium = /고급|명품|비싸도|좋은\s*거|퀄리티|품질|오래\s*입을/.test(text);
  if (maxPrice === null && minPrice === null && cheap && !priceSort) maxPrice = 60000;
  const priceTerms = [
    minPrice !== null ? `${priceLabel(minPrice)} ${minPriceExclusive ? '초과' : '이상'}` : '',
    maxPrice !== null ? `${priceLabel(maxPrice)} ${maxPriceExclusive ? '미만' : '이하'}` : '',
  ].filter(Boolean);
  terms.push(...priceTerms);
  if (premium) terms.push('품질 정보 미확인');
  const sortLabel = priceSort === 'desc' ? '높은 가격순' : '낮은 가격순';
  if (priceSort) terms.push(sortLabel);

  const occLabel =
    { work: '출근', formal: '격식 있는 자리', date: '데이트', weekend: '주말', daily: '데일리' }[occ?.value] || '';
  const what = targets.map((t) => t.label).join('·') || (anchors.length ? '함께 입을 아이템' : '');
  const brandLabel = brand ? `${brand} ` : '';
  let summary = '';
  if (what || occLabel || brand || style) {
    const noun = `${brandLabel}${what || '아이템'}`;
    const head = [
      anchors.length
        ? `${anchorColor ? `${anchorColor.label} ` : ''}${anchors.map((a) => a.label).join('·')}에 어울리는`
        : '',
      season ? season.label : '',
      style && !what.includes(style.label) ? style.label : '',
      occLabel ? `${occLabel}용` : '',
      color ? color.label : '',
      noun,
    ]
      .filter(Boolean)
      .join(' ');
    summary = `${head}${objectParticle(noun)} ${priceTerms.length ? `${priceTerms.join(' · ')} 조건으로 ` : ''}${priceSort ? `${sortLabel}으로 ` : ''}골랐어요`;
  }

  // 표에 없는 단어: 조사를 떼고 어느 표에도, 채움말에도 맞지 않는 단어만 고른다(부분 이해를 알리기 위해).
  const known = [OCCASION_WORDS, SEASON_WORDS, STYLE_WORDS, COLOR_WORDS, TONE_WORDS, UNSUPPORTED_WORDS, ITEM_WORDS].flat();
  const brandWords = new Set(brands.flatMap((b) => [b, ...(BRAND_ALIASES[b] || [])]).flatMap((w) => w.toLowerCase().split(/\s+/)));
  const unknown = raw.toLowerCase().split(/[\s,.!?~]+/).map((w) => w.replace(/(?:으로|에서|에게|이랑|랑|하고|까지|부터|처럼|보다|이나|은|는|이|가|을|를|에|의|로|와|과|도|만|요)$/, ''))
    .filter((w) => w.length >= 2 && /[가-힣a-z]/.test(w) && !/\d/.test(w) && !FILLER.test(w) && !brandWords.has(w) &&
      !known.some(([re]) => re.test(` ${w} `)) && !raw.toLowerCase().split(/[\s,.!?~]+/).some((o) => o.startsWith(w) && known.some(([re]) => re.test(` ${o} `))) && !/여자|여성|남자|남성|여친|남친|저렴|가성비|싼|비싼|고급|명품|퀄리티|품질|최저|최고|순서|순|이하|이상|어울|맞는|매치|코디|받쳐|같이|함께/.test(w));

  return {
    raw,
    summary,
    terms,
    tone: tone?.value || null,
    comfort,
    excludeColors: excludeColors.map((c) => c.value),
    excludeMatch: (slot) => excludeItems.some((i) => i.fn(slot)),
    excludedItems: excludeItems.map((i) => i.label),
    unsupported,
    unknown: [...new Set(unknown)],
    occasion: occ?.value || null,
    season: season?.value || null,
    style: style?.value || null,
    color: color?.value || null,
    anchorColor: anchorColor?.value || null,
    gender,
    maxPrice,
    minPrice,
    minPriceExclusive,
    maxPriceExclusive,
    priceSort,
    premium,
    qualityUnavailable: premium,
    brand,
    slotNamed: targets.length > 0,
    targetLabels: targets.map((t) => t.label),
    anchorLabels: anchors.map((a) => a.label),
    anchorMatch: (slot) => anchors.some((a) => a.fn(slot)),
    targetMatch: (slot) => targets.some((t) => t.fn(slot)),
  };
}
