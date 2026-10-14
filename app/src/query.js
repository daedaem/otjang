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
  [/봄/, 'spring', '봄'],
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
];

// 아이템 단어 → 아이템 자리 판별 함수. 위에서부터 더 구체적인 단어를 먼저 본다.
const ITEM_WORDS = [
  [/트러커|청자켓|청재킷|데님\s*(재킷|자켓)/, (s) => ['m-trucker', 'f-jacket'].includes(s.id), '데님 재킷'],
  [/샴브레이|데님\s*셔츠|청\s*셔츠|웨스턴\s*셔츠|워크\s*셔츠/, (s) => s.id === 'm-chambray', '데님 셔츠'],
  [/옥스(포|퍼)드|버튼\s*다운/, (s) => s.id === 'm-oxford', '옥스퍼드 셔츠'],
  [/스트라이프|줄무늬/, (s) => ['m-stripe-shirt', 'm-rugby', 'f-stripe'].includes(s.id), '스트라이프'],
  [/플란넬|체크\s*셔츠|체크/, (s) => s.id === 'm-flannel', '체크 셔츠'],
  [/폴로\s*셔츠|카라\s*티|pk|피케/, (s) => s.id === 'm-polo', '폴로 셔츠'],
  [/럭비/, (s) => s.id === 'm-rugby', '럭비 셔츠'],
  [/헨리/, (s) => s.id === 'm-henley', '헨리넥'],
  [/케이블|꽈배기/, (s) => s.id === 'm-cable', '케이블 니트'],
  [/(?:패딩|다운|푸퍼)\s*(?:베스트|조끼)/, (s) => s.id === 'm-downvest', '패딩 베스트'],
  [/베스트|조끼/, (s) => s.shape === 'vest', '베스트'],
  [/카디건|가디건/, (s) => s.shape === 'cardigan', '카디건'],
  [/니트|스웨터/, (s) => s.shape === 'knit', '니트'],
  [/후드|후디/, (s) => ['m-hoodie', 'f-sweat'].includes(s.id), '후드'],
  [/맨투맨|스웻|스웨트/, (s) => ['m-sweat', 'f-sweat'].includes(s.id), '맨투맨'],
  [/긴팔|롱슬리브/, (s) => s.shape === 'longtee', '긴팔 티'],
  [/티셔츠|반팔|(^|\s)티(\s|$)/, (s) => s.shape === 'tee' || s.shape === 'longtee', '티셔츠'],
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
  [/청바지|데님|진\b|jeans/, (s) => s.shape === 'jeans', '청바지'],
  [/치노|면바지/, (s) => s.id === 'm-chino', '치노'],
  [/코듀로이|골덴/, (s) => s.id === 'm-cords', '코듀로이'],
  [/슬랙스|정장\s*바지|트라우저/, (s) => /slacks/.test(s.id), '슬랙스'],
  [/퍼티그|베이커|페인터|카펜터|워크\s*팬츠|군복/, (s) => s.id === 'm-work-pants', '워크 팬츠'],
  [/카고/, (s) => s.id === 'm-cargo', '카고 팬츠'],
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
  [/가방|백\b|숄더/, (s) => s.shape === 'bag', '가방'],
  [/비니|워치\s*캡/, (s) => s.shape === 'beanie', '비니'],
  [/모자|캡|볼캡/, (s) => s.shape === 'cap', '볼캡'],
  [/벨트/, (s) => s.shape === 'belt', '벨트'],
];

// 브랜드 이름의 다른 표기
const BRAND_ALIASES = {
  '폴로 랄프 로렌': ['폴로', '랄프로렌', '랄프 로렌', 'polo', 'ralph'], '리바이스': ['levis', "levi's", '리바이스'], '칼하트': ['carhartt', '칼하트'],
  '오어슬로우': ['orslow', '오어슬로우'], '브룩스 브라더스': ['브룩스', 'brooks'], '무신사 스탠다드': ['무탠', '무신사스탠다드', '무신사 스탠다드'],
  '노스페이스': ['north face', '노페', '노스페이스'], '뉴발란스': ['new balance', '뉴발'], '레드윙': ['red wing', '레드윙'], '파타고니아': ['patagonia', '파타고니아'],
  '아크테릭스': ['arcteryx', '아크'], '닥터마틴': ['dr.martens', '닥마', '닥터마틴'], '컨버스': ['converse', '컨버스'], '디키즈': ['dickies', '디키즈'],
};

// "X에 어울리는 Y", "X랑 입을 Y", "X와 매치할 Y"
const ANCHOR_SPLIT = /(.+?)(?:에|랑|이랑|하고|와|과|이랑도|에도)\s*(?:잘\s*)?(?:어울리는|어울릴|맞는|입을|신을|매치할|매치하기\s*좋은|코디할|같이\s*입을|받쳐\s*입을)\s*(.*)/;

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

export function parseQuery(raw = '', { brands = [] } = {}) {
  let text = ` ${raw.trim().toLowerCase()} `;
  const terms = [];

  // 브랜드: 긴 이름부터 찾고, 찾은 글자는 아이템 단어 해석에서 뺀다
  let brand = null;
  const candidates = brands.flatMap((b) => [b, ...(BRAND_ALIASES[b] || [])].map((alias) => [alias.toLowerCase(), b]))
    .sort((a, b) => b[0].length - a[0].length);
  for (const [alias, name] of candidates) {
    if (alias.length < 2) continue;
    if (text.includes(alias)) {
      brand = name;
      text = text.replace(alias, ' ');
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

  let gender = null;
  if (/여자|여성|여친|여자친구/.test(text)) gender = 'F';
  else if (/남자|남성|남친|남자친구/.test(text)) gender = 'M';

  let maxPrice = null;
  const won = text.match(/(\d+(?:\.\d+)?)\s*만\s*(?:원)?\s*(대)?/);
  const plain = text.match(/(\d{1,3}(?:,\d{3})+|\d{4,7})\s*원/);
  if (won) {
    const n = parseFloat(won[1]);
    maxPrice = Math.round(n * 10000) + (won[2] ? (n < 10 ? 9999 : 99999) : 0);
  } else if (plain) {
    maxPrice = parseInt(plain[1].replaceAll(',', ''), 10);
  }
  const ascendingPrice = /최저\s*가|낮은\s*가격\s*순|가격\s*낮은\s*순|가격\s*오름차순/.test(text);
  const plainPriceOrder = /가격\s*순/.test(text) && !/높은\s*가격\s*순/.test(text);
  const priceSort = ascendingPrice || plainPriceOrder ? 'asc' : null;
  const cheap = /저렴|가성비|싼|저가|부담\s*없/.test(text);
  const premium = /고급|명품|비싸도|좋은\s*거|퀄리티|오래\s*입을/.test(text);
  if (!maxPrice && cheap && !priceSort) maxPrice = 60000;
  if (maxPrice) terms.push(`${Math.round(maxPrice / 10000)}만원 이하`);
  if (premium) terms.push('품질 우선');
  if (priceSort) terms.push('낮은 가격순');

  const occLabel = { work: '출근', formal: '격식 있는 자리', date: '데이트', weekend: '주말', daily: '데일리' }[occ?.value] || '';
  const what = targets.map((t) => t.label).join('·') || (anchors.length ? '함께 입을 아이템' : '');
  const brandLabel = brand ? `${brand} ` : '';
  let summary = '';
  if (what || occLabel || brand || style) {
    const noun = `${brandLabel}${what || '아이템'}`;
    const head = [
      anchors.length ? `${anchors.map((a) => a.label).join('·')}에 어울리는` : '',
      season ? season.label : '',
      style && !what.includes(style.label) ? style.label : '',
      occLabel ? `${occLabel}용` : '',
      color ? color.label : '',
      noun,
    ].filter(Boolean).join(' ');
    summary = `${head}${objectParticle(noun)} ${maxPrice ? `${Math.round(maxPrice / 10000)}만원 이하로 ` : ''}${priceSort ? '낮은 가격순으로 ' : ''}골랐어요`;
  }

  return {
    raw,
    summary,
    terms,
    occasion: occ?.value || null,
    season: season?.value || null,
    style: style?.value || null,
    color: color?.value || null,
    gender,
    maxPrice,
    priceSort,
    premium,
    brand,
    slotNamed: targets.length > 0,
    anchorMatch: (slot) => anchors.some((a) => a.fn(slot)),
    targetMatch: (slot) => targets.some((t) => t.fn(slot)),
  };
}
