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
  [/클래식|아이비|프레피|댄디|트래디셔널|올드머니/, 'classic', '클래식'],
  [/미니멀|모노톤|심플|깔끔/, 'minimal', '미니멀'],
  [/캐주얼|스트릿|워크웨어|아메카지|편한 옷/, 'casual', '캐주얼'],
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
  [/옥스(포|퍼)드/, (s) => /oxford/.test(s.id), '옥스퍼드 셔츠'],
  [/스트라이프|줄무늬/, (s) => /stripe|rugby/.test(s.id), '스트라이프'],
  [/플란넬|체크/, (s) => s.id === 'm-flannel', '체크 셔츠'],
  [/폴로|카라\s*티|pk|피케/, (s) => s.id === 'm-polo', '폴로 셔츠'],
  [/럭비/, (s) => s.id === 'm-rugby', '럭비 셔츠'],
  [/케이블|꽈배기/, (s) => s.id === 'm-knit-cable', '케이블 니트'],
  [/카디건|가디건/, (s) => s.shape === 'cardigan', '카디건'],
  [/니트|스웨터/, (s) => s.shape === 'knit', '니트'],
  [/맨투맨|스웻/, (s) => s.shape === 'sweat', '맨투맨'],
  [/긴팔|롱슬리브/, (s) => s.shape === 'longtee', '긴팔 티'],
  [/티셔츠|반팔|\b티\b|티\s/, (s) => s.shape === 'tee' || s.shape === 'longtee', '티셔츠'],
  [/블레이저|정장\s*재킷|수트\s*재킷/, (s) => s.shape === 'blazer', '블레이저'],
  [/트렌치/, (s) => /trench/.test(s.id), '트렌치 코트'],
  [/발마칸/, (s) => s.id === 'm-balmacaan', '발마칸 코트'],
  [/코트/, (s) => s.shape === 'coat', '코트'],
  [/패딩|다운/, (s) => s.shape === 'down', '패딩'],
  [/왁스|바버/, (s) => s.id === 'm-barbour', '왁스 재킷'],
  [/해링턴/, (s) => s.id === 'm-harrington', '해링턴 재킷'],
  [/필드/, (s) => s.id === 'm-field', '필드 재킷'],
  [/초어|워크\s*재킷/, (s) => s.id === 'm-chore', '초어 재킷'],
  [/재킷|자켓|점퍼|블루종/, (s) => s.cat === 'outer' && ['jacket', 'blazer'].includes(s.shape), '재킷'],
  [/아우터|겉옷/, (s) => s.cat === 'outer', '아우터'],
  [/셔츠|남방/, (s) => s.shape === 'shirt', '셔츠'],
  [/청바지|데님|진\b|jeans/, (s) => s.shape === 'jeans', '청바지'],
  [/치노|면바지/, (s) => s.id === 'm-chino', '치노'],
  [/슬랙스|정장\s*바지/, (s) => /slacks/.test(s.id), '슬랙스'],
  [/퍼티그|카고|군복/, (s) => s.id === 'm-fatigue', '퍼티그 팬츠'],
  [/바지|팬츠|하의/, (s) => s.cat === 'bottom' && s.shape !== 'skirt', '바지'],
  [/스커트|치마/, (s) => s.shape === 'skirt', '스커트'],
  [/원피스|드레스/, (s) => s.cat === 'dress', '원피스'],
  [/상의|윗옷|탑/, (s) => s.cat === 'top', '상의'],
  [/로퍼/, (s) => /loafer/.test(s.id), '로퍼'],
  [/메리제인/, (s) => s.id === 'f-maryjane', '메리제인'],
  [/더비|구두/, (s) => s.cat === 'shoes' && s.shape === 'loafer', '구두'],
  [/부츠/, (s) => s.shape === 'boot', '부츠'],
  [/스니커즈|운동화|컨버스|뉴발/, (s) => s.shape === 'sneaker', '스니커즈'],
  [/신발|슈즈/, (s) => s.cat === 'shoes', '신발'],
  [/가방|백\b|숄더/, (s) => s.shape === 'bag', '가방'],
  [/모자|캡|볼캡/, (s) => s.shape === 'cap', '모자'],
  [/벨트/, (s) => s.shape === 'belt', '벨트'],
];

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

export function parseQuery(raw = '') {
  const text = ` ${raw.trim().toLowerCase()} `;
  const terms = [];

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
  const plain = text.match(/(\d{4,7})\s*원/);
  if (won) {
    const n = parseFloat(won[1]);
    maxPrice = Math.round(n * 10000) + (won[2] ? (n < 10 ? 9999 : 99999) : 0);
  } else if (plain) {
    maxPrice = parseInt(plain[1], 10);
  }
  const cheap = /저렴|가성비|싼|저가|부담\s*없/.test(text);
  const premium = /고급|명품|비싸도|좋은\s*거|퀄리티|오래\s*입을/.test(text);
  if (!maxPrice && cheap) maxPrice = 60000;
  if (maxPrice) terms.push(`${Math.round(maxPrice / 10000)}만원 이하`);
  if (premium) terms.push('품질 우선');

  const occLabel = { work: '출근', formal: '격식 있는 자리', date: '데이트', weekend: '주말', daily: '데일리' }[occ?.value] || '';
  const what = targets.map((t) => t.label).join('·') || (anchors.length ? '함께 입을 아이템' : '');
  let summary = '';
  if (what || occLabel) {
    const noun = what || '아이템';
    const head = [
      anchors.length ? `${anchors.map((a) => a.label).join('·')}에 어울리는` : '',
      season ? season.label : '',
      occLabel ? `${occLabel}용` : '',
      color ? color.label : '',
      noun,
    ].filter(Boolean).join(' ');
    summary = `${head}${objectParticle(noun)} ${maxPrice ? `${Math.round(maxPrice / 10000)}만원 이하로 ` : ''}골랐어요`;
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
    premium,
    slotNamed: targets.length > 0,
    anchorMatch: (slot) => anchors.some((a) => a.fn(slot)),
    targetMatch: (slot) => targets.some((t) => t.fn(slot)),
  };
}
