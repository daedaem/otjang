// 브랜드 목록 화면에서 읽은 상품(raw.json)을 아이템 종류·색으로 분류한다.
// 사용: node classify.mjs raw.json classified.json
// 이름에 쓰인 단어로만 판단하므로, 결과는 사진 검수(편집자)를 거쳐 curation에 반영한다.
import fs from 'node:fs';
import { productExclusionReason, productClassificationConflict } from '../../../../app/lite/src/domain/catalog-policy.js';

const isHood = (n) =>
  /후드|후디|hood|hoodie/i.test(n) &&
  !/패딩|다운|down\b|puffer|padded|재킷|자켓|jacket|parka|파카|코트|coat|아노락|anorak|바람막이|쉘/i.test(n);
const isPkPolo = (n) =>
  /\bpk\b/i.test(n) && /셔츠|shirt\b|TEETOP/i.test(n) && !/라운드|round|크루|crew/i.test(n);

// 앞에서부터 처음 맞는 규칙을 쓴다. g: 이 규칙을 적용할 성별
const RULES = [
  // 제외
  [/키즈|kids|아동|남아|여아|주니어|베이비|infant|toddler|토들러|보이즈|걸즈/i, null],
  [
    /그래픽|graphic|프린트|print|하와이안|hawaiian|아트웍|artwork|캐릭터|만화|디즈니|마블|슈프림|빈티지\s*페이스/i,
    null,
  ],
  [/버킷|bucket|\bhat\b|햇\b|헌팅\s*캡|베레|beret|바라클라바|이어\s*머프|넥\s*워머/i, null],
  [/조거|jogger|트레이닝\s*팬츠|트랙\s*팬츠|track\s*pants|스웻\s*팬츠|sweat\s*pants|파자마|잠옷|라운지/i, null],
  [/박서|팬티|양말|삭스|socks?\b|언더웨어|드로즈|트렁크|브리프|boxer|이너웨어|레깅스|스타킹/i, null],
  [/쇼츠|반바지|숏\s*팬츠|하프\s*팬츠|shorts?\b(?!\s*sleeve)|버뮤다|스윔|수영/i, null],
  [
    /더플\s*백|duffle\s*bag|보스턴\s*백|스터프\s*색|\bsack\b|색\s*\d팩|골프|golf|키링|지갑|wallet|카드\s*케이스|향수|퍼퓸|머플러|스카프|장갑|글러브|선글라스|안경|우산|파우치|쿠션|타월|머그|키체인|스티커|브로치|목걸이|반지|귀걸이|팔찌|시계/i,
    null,
  ],
  [/\bset\b|세트|셋업|set-?up|투피스/i, null],
  [
    /라이더|rider|무스탕|mustang|램스킨|lambskin|pleather|레더\s*(재킷|자켓|블루종|셔츠)|leather\s*(jacket|blouson|shirt)|sleeveless|슬리브리스|트랙\s*(재킷|자켓|탑)|track\s*(jacket|top)|퍼\s*후드|페이즐리|paisley|python|레오파드|leopard/i,
    null,
  ],
  [
    /스웨트\s*팬츠|드라이\s*핏|dri-?fit|러닝\s*팬츠|running\s*pants|트레이닝|training|윈드\s*팬츠|wind\s*pants|퀼티드\s*팬츠|파라슈트|parachute|벨로아|velour|트랙\s*팬츠/i,
    null,
    'M',
  ],
  [/크롭|crop/i, null, 'M'],

  // 부츠컷 청바지는 신발이 아니다
  [/부츠\s*(?:컷|진)|boot\s*(?:cut|jeans?)/i, 'm-denim', 'M'],
  [/부츠\s*(?:컷|진)|boot\s*(?:cut|jeans?)/i, 'f-denim', 'F'],

  // 신발
  [
    /트레일|trail|챌린저|challenger|마하|mach\s*\d|xt-?6|스피드크로스|speedcross|호카|hoka|본디|클리프턴|gore-?tex.*shoe|하이킹\s*슈즈/i,
    'm-trail',
    'M',
  ],
  [/로퍼|loafer|모카신/i, 'm-loafer', 'M'],
  [/로퍼|loafer/i, 'f-loafer', 'F'],
  [/메리제인|mary\s*jane|발레|ballet|플랫|flat\s/i, 'f-flat', 'F'],
  [
    /목토|moc\s*toe|아이리시\s*세터|irish\s*setter|엔지니어\s*부츠|워크\s*부츠|work\s*boots?|레이스\s*업\s*부츠|대너|danner|베크맨|beckman|아이언\s*레인저|iron\s*ranger|1460|8\s*홀|8\s*eye|워커/i,
    'm-workboots',
    'M',
  ],
  [/첼시|chelsea|사이드\s*고어/i, 'm-chelsea', 'M'],
  [/부츠|boots?\b|워커/i, 'f-boots', 'F'],
  [
    /더비|derby|위켄더\s*옥스(?:포|퍼)드|weekender\s*oxford|옥스퍼드\s*슈즈|oxford\s*shoe|구두|드레스\s*슈즈|플레인\s*토|윙팁|wingtip|브로그|brogue|단테|1461/i,
    'm-derby',
    'M',
  ],
  [
    /척\s*70|척\s*테일러|chuck|올스타|all\s*star|캔버스|canvas|반스\s*(올드|어센틱|에라)|authentic|old\s*skool|어센틱|올드\s*스쿨|에라\b/i,
    'm-canvas',
    'M',
  ],
  [
    /에어\s*포스|air\s*force|스탠\s*스미스|stan\s*smith|클럽\s*c|club\s*c|코트\s*스니커즈|레더\s*스니커즈|트레이너\s*스니커즈|클래식\s*트레이너|커먼\s*프로젝트|아키라|화이트\s*스니커즈/i,
    'm-white-sneaker',
    'M',
  ],
  [
    /뉴발란스|\b(990|991|992|993|2002|1906|530|327|574|860|9060)\b|러닝|running|조거|삼바|samba|가젤|gazelle|스페지알|spezial|코르테즈|cortez|보메로|vomero|페가수스|aerostreet|\bu740/i,
    'm-runner',
    'M',
  ],
  [/스니커즈|sneakers?|운동화|슈즈|shoes/i, 'm-runner', 'M'],
  [/스니커즈|sneakers?|운동화|컨버스|척\s*70|뉴발란스|삼바|가젤|에어\s*포스|슈즈|shoes/i, 'f-sneaker', 'F'],

  // 소품
  [/비니|beanie|워치\s*캡|watch\s*cap|니트\s*캡/i, 'm-beanie', 'M'],
  [/볼\s*캡|볼캡|ball\s*cap|baseball\s*cap|\bcap\b|캡\b|모자/i, 'm-cap', 'M'],
  [/벨트|belt/i, 'm-belt', 'M'],
  [/숄더\s*백|토트\s*백|크로스\s*백|백팩|가방|\bbag\b|호보|버킷\s*백/i, 'f-bag', 'F'],
  [/백팩|가방|\bbag\b|토트|크로스\s*백/i, null, 'M'],

  // 원피스·스커트 (여성)
  [/원피스|드레스|dress\b/i, 'f-dress', 'F'],
  [/스커트|skirt|치마/i, 'f-skirt', 'F'],

  // 이름이 분명한 상의
  [/SWEATTOP/, 'm-sweat', 'M'],
  [(n) => /SWEATTOP|후드|hood/i.test(n) && !/팬츠|pants|스커트|skirt/i.test(n), 'f-sweat', 'F'],
  [isHood, 'm-hoodie', 'M'],
  [isPkPolo, 'm-polo', 'M'],
  [(n) => /TEETOP/.test(n) && /헨리|henley/i.test(n), 'm-henley', 'M'],
  [(n) => /TEETOP/.test(n) && /폴로|polo|피케|pique|카라|collar/i.test(n), 'm-polo', 'M'],
  [(n) => /TEETOP/.test(n) && /럭비|rugby/i.test(n), 'm-rugby', 'M'],
  [(n) => /TEETOP/.test(n) && /니트|knit/i.test(n), 'm-knit', 'M'],
  [(n) => /TEETOP/.test(n) && /긴팔|긴소매|롱\s*슬리브|long\s*sleeve|\bl\/s\b|롱슬리브/i.test(n), 'm-longtee', 'M'],
  [/TEETOP/, 'm-tee', 'M'],
  [/TEETOP/, 'f-tee', 'F'],

  // 형태가 분명한 보온 조끼는 재킷·니트의 스타일 단어보다 먼저 판별한다.
  [
    (n) => /베스트|조끼|\bvests?\b/i.test(n) && !productExclusionReason({ name: n, slot: 'm-downvest', price: 1 }),
    'm-downvest',
    'M',
  ],

  // 아우터
  [/덱\s*(재킷|자켓)|deck\s*jacket|n-?1\b/i, 'm-deck', 'M'],
  [/바시티|varsity|스타디움|stadium|어워드\s*(재킷|자켓)|award\s*jacket|야구\s*점퍼/i, 'm-varsity', 'M'],
  [/인슐레이션|insulat|씬클라우드|thinsulate|프리마로프트|primaloft/i, 'm-down', 'M'],
  [
    (n) =>
      /윈드러너|windrunner|감마|gamma|퍼텍스|pertex|방수|러닝|running|acg|무브프리|후드\s*풀집|윈드|wind|라이트\s*거스트|트레킹|고어텍스|gore-?tex|마운틴|mountain|레인|rain/i.test(
        n,
      ) &&
      /재킷|자켓|jacket|파카|parka|아노락|anorak|바람막이|브레이커|breaker|쉘|shell/i.test(n) &&
      !/팬츠|pants/i.test(n),
    'm-shell',
    'M',
  ],
  [
    /(1st|2nd|3rd|first|second|third)\s*(type\s*)?jacket|데님.*(재킷|자켓)|denim.*jacket|셀비지.*(재킷|자켓)|selvedge.*jacket/i,
    'm-trucker',
    'M',
  ],
  [/정글|jungle|사파리|safari|퍼티그\s*(재킷|자켓)|fatigue\s*jacket|오피서\s*(재킷|자켓)/i, 'm-field', 'M'],
  [
    /카펜터\s*(재킷|자켓)|carpenter\s*jacket|셔츠\s*(재킷|자켓)|shirt\s*jacket|오버셔츠|overshirt|셔켓/i,
    'm-chore',
    'M',
  ],
  [
    /블레이저|blazer|스포츠\s*(재킷|자켓)|sports?\s*jacket|테일러드|tailored|싱글\s*(재킷|자켓)|더블\s*(브레스티드|재킷|자켓)|수트\s*(재킷|자켓)|3-?button/i,
    'm-blazer',
    'M',
  ],
  [/블레이저|blazer|테일러드|tailored|싱글\s*(재킷|자켓)|트위드|tweed|부클|boucle/i, 'f-blazer', 'F'],
  [/트렌치|trench/i, 'm-trench', 'M'],
  [/트렌치|trench/i, 'f-trench', 'F'],
  [
    /발마칸|balmacaan|맥\s*코트|mac\s*coat|싱글\s*코트|체스터|chester|롱\s*코트|울\s*코트|카\s*코트|car\s*coat|오버\s*코트|overcoat/i,
    'm-balmacaan',
    'M',
  ],
  [/피\s*코트|pea\s*coat|피코트|더플|duffle|더블\s*코트/i, 'm-peacoat', 'M'],
  [/코트|coat\b/i, 'f-coat', 'F'],
  [/왁스|wax|바버|비데일|bedale|뷰포트|beaufort|트랜스포트|헌팅|hunting|오일드|oiled/i, 'm-wax', 'M'],
  [
    /패딩\s*베스트|다운\s*베스트|down\s*vest|퍼퍼\s*베스트|puffer\s*vest|패디드\s*베스트|베스트.*패딩|insulated\s*vest/i,
    'm-downvest',
    'M',
  ],
  [
    /패딩|다운|down\b|푸퍼|puffer|눕시|nuptse|패디드|padded|퀼팅\s*(재킷|자켓)|프리마로프트|primaloft|헤비\s*아우터|구스/i,
    'm-down',
    'M',
  ],
  [/패딩|다운|down\b|푸퍼|puffer|눕시|nuptse|패디드|padded/i, 'f-padding', 'F'],
  [
    /(플리스|fleece|후리스).*(재킷|자켓|jacket|집업|zip|풀오버|pullover|카디건)|레트로\s*x|retro\s*x|신칠라|synchilla|보아\s*(재킷|자켓|플리스)|쉐르파|sherpa|다이나믹\s*플리스/i,
    'm-fleece',
    'M',
  ],
  [
    /바람막이|윈드\s*브레이커|windbreaker|쉘\s*(재킷|자켓)|shell|아노락|anorak|고어텍스|gore-?tex|마운틴\s*(재킷|자켓)|mountain\s*jacket|레인\s*(재킷|자켓)|베타|beta\s*(lt|ar|sl)|코스트|트레킹\s*(재킷|자켓)|하드\s*쉘|소프트\s*쉘/i,
    'm-shell',
    'M',
  ],
  [
    /m-?65|필드\s*(재킷|자켓)|field\s*jacket|퍼티그\s*(재킷|자켓)|오지\s*(재킷|자켓)|ma-?1|플라이트\s*(재킷|자켓)|봄버|bomber|밀리터리\s*(재킷|자켓)|유틸리티\s*(재킷|자켓)|정글\s*퍼티그/i,
    'm-field',
    'M',
  ],
  [
    /트러커|trucker|타입\s*(i|ii|iii|1|2|3)\b|type\s*(i|ii|iii|1|2|3)\b|데님\s*(재킷|자켓)|denim\s*jacket|청\s*(재킷|자켓)|청자켓|501.*(재킷|자켓)|557|507|506/i,
    'm-trucker',
    'M',
  ],
  [
    /데님\s*(재킷|자켓)|denim\s*jacket|트러커|trucker|청\s*자켓|워크\s*(재킷|자켓)|초어|chore|커버올|coverall|블루종|blouson/i,
    'f-jacket',
    'F',
  ],
  [
    /초어|chore|커버올|coverall|워크\s*(재킷|자켓)|work\s*jacket|레일로드|railroad|엔지니어\s*(재킷|자켓)|디트로이트|detroit|덕\s*(재킷|자켓)|active\s*jacket|파르티멘토.*자켓/i,
    'm-chore',
    'M',
  ],
  [
    /해링턴|헤링턴|harrington|스윙탑|swing\s*top|드리즐러|drizzler|블루종|blouson|코치\s*(재킷|자켓)|coach|\bg9\b|바라쿠타|집업\s*(재킷|자켓)|스포츠\s*점퍼|점퍼/i,
    'm-harrington',
    'M',
  ],
  [/카디건|가디건|cardigan/i, 'm-cardigan', 'M'],
  [/카디건|가디건|cardigan/i, 'f-cardigan', 'F'],
  [/(재킷|자켓|jacket)/i, 'm-harrington', 'M'],

  // 상의
  [/니트\s*베스트|스웨터\s*베스트|sweater\s*vest|knit\s*vest|브이넥\s*베스트|조끼/i, 'm-vest', 'M'],
  [/럭비|rugby/i, 'm-rugby', 'M'],
  [
    /폴로\s*셔츠|polo\s*shirt|피케|pique|카라\s*티|메시\s*폴로|mesh\s*polo|니티드\s*폴로|polo\b(?!.*랄프)/i,
    'm-polo',
    'M',
  ],
  [
    /샴브레이|chambray|데님\s*셔츠|denim\s*shirt|웨스턴\s*셔츠|western\s*shirt|워크\s*셔츠|work\s*shirt|인디고\s*셔츠/i,
    'm-chambray',
    'M',
  ],
  [
    /플란넬|flannel|체크\s*셔츠|check\s*shirt|타탄|tartan|깅엄|gingham|버팔로|buffalo|마드라스|madras|옴브레|ombre|태터솔|tattersall/i,
    'm-flannel',
    'M',
  ],
  [(n) => /옥스(포|퍼)드|oxford/i.test(n) && /팬츠|pants|바지/i.test(n), 'm-chino', 'M'],
  [/스트라이프.*셔츠|stripe.*shirt|줄무늬\s*셔츠|핀\s*스트라이프\s*셔츠|벵갈|bengal/i, 'm-stripe-shirt', 'M'],
  [/스트라이프|stripe|줄무늬|보더|border|마리니에르/i, 'f-stripe', 'F'],
  [
    /옥스(포|퍼)드|oxford|버튼\s*다운|button\s*down|bd\s*셔츠|드레스\s*셔츠|포플린\s*셔츠|poplin|셔츠|shirt\b/i,
    'm-oxford',
    'M',
  ],
  [/셔츠|shirt|블라우스|blouse/i, 'f-shirt', 'F'],
  [/케이블|cable|꽈배기|피셔맨|fisherman|아란|aran/i, 'm-cable', 'M'],
  [
    /니트|knit|스웨터|sweater|풀오버|pullover|램스울|lambswool|캐시미어|cashmere|메리노|merino|모헤어|mohair|알파카/i,
    'm-knit',
    'M',
  ],
  [/니트|knit|스웨터|sweater|풀오버|pullover|캐시미어|울\s*블렌드/i, 'f-knit', 'F'],
  [/후드|hood|후디|hoodie|파카\s*스웻/i, 'm-hoodie', 'M'],
  [
    /스웻\s*셔츠|스웨트\s*셔츠|스웨트셔츠|스웻셔츠|sweat\s*shirt|sweatshirt|맨투맨|크루넥\s*스웨트|리버스\s*위브|reverse\s*weave|하프\s*집|쿼터\s*집|half\s*zip|quarter\s*zip/i,
    'm-sweat',
    'M',
  ],
  [(n) => /스웻|스웨트|sweat|맨투맨|후드|hood/i.test(n) && !/팬츠|pants|스커트|skirt|쇼츠/i.test(n), 'f-sweat', 'F'],
  [/헨리|henley/i, 'm-henley', 'M'],
  [/긴팔|긴소매|롱\s*슬리브|long\s*sleeve|\bl\/s\b|롱슬리브/i, 'm-longtee', 'M'],
  [/티셔츠|t-?shirt|반팔|숏\s*슬리브|short\s*sleeve|\btee\b|포켓\s*티|크루\s*넥/i, 'm-tee', 'M'],
  [/티셔츠|t-?shirt|반팔|탑\b|\btee\b|크루\s*넥|롱\s*슬리브|긴팔/i, 'f-tee', 'F'],

  // 하의
  [/카고|cargo/i, 'm-cargo', 'M'],
  [/코듀로이|corduroy|골덴|cord\s*pants/i, 'm-cords', 'M'],
  [
    /생지|셀비지|selvedge|selvage|rigid|리지드|로우\s*데님|raw\s*denim|원\s*워시|one\s*wash|onewash|논\s*워시|non-?wash|언워시드|unwashed|논페이드|인디고\s*데님|딥\s*인디고|다크\s*인디고|501.*(rigid|리지드)|105\s*standard|\b107\b|\b5p\b/i,
    'm-denim-raw',
    'M',
  ],
  [/데님|denim|청바지|진\b|jeans?|501|505|550|568|\b5\s*pocket|파이브\s*포켓/i, 'm-denim', 'M'],
  [/데님|denim|청바지|진\b|jeans?/i, 'f-denim', 'F'],
  [
    /퍼티그|fatigue|베이커|baker|페인터|painter|카펜터|carpenter|워크\s*팬츠|work\s*pants|874|더블\s*니|double\s*knee|유틸리티\s*팬츠|퍼티그|military\s*pants|아미\s*팬츠|\barmy\b|아미\b|밀리터리\s*(팬츠|트라우저)/i,
    'm-work-pants',
    'M',
  ],
  [
    /슬랙스|slacks|트라우저|trousers?|울\s*팬츠|턱\s*팬츠|핀턱|pintuck|플리츠\s*팬츠|pleated\s*pants|정장\s*바지/i,
    'm-slacks',
    'M',
  ],
  [/슬랙스|slacks|트라우저|trousers?|와이드\s*팬츠|턱\s*팬츠|핀턱|팬츠|pants/i, 'f-slacks', 'F'],
  [/치노|chino|면바지|코튼\s*팬츠|cotton\s*pants|트윌\s*팬츠|twill\s*pants|카키\s*팬츠|khaki\s*pants/i, 'm-chino', 'M'],
  [/팬츠|pants|바지/i, 'm-chino', 'M'],
];

const COLOR_WORDS = [
  [/오프\s*화이트|\boff\s*white\b|화이트|\bwhite\b|흰/i, 'white'],
  [
    /아이보리|\bivory\b|크림|\bcream\b|에크루|\becru\b|내추럴|\bnatural\b|오트밀|\boatmeal\b|버터|파치먼트|\bparchment\b|본\b|\bbone\b/i,
    'ivory',
  ],
  [
    /라이트\s*블루|\blight\s*blue\b|스카이|\bsky\b|하늘|사틴\s*블루|삭스\s*블루|소프트\s*블루|페일\s*블루|헤더\s*블루|클라우디\s*블루/i,
    'blue',
  ],
  [/네이비|\bnavy\b|남색|다크\s*네이비|미드나잇/i, 'navy'],
  [/인디고|\bindigo\b|로우\s*데님|\brigid\b|리지드|생지|원\s*워시|\bone\s*wash\b|데님/i, 'indigo'],
  [/차콜|\bcharcoal\b|다크\s*그레이|dark\s*gr[ae]y|건메탈|\banthracite\b|앤트러사이트/i, 'charcoal'],
  [/그레이|gr[ae]y|회색|멜란지|\bmelange\b|헤더|\bheather\b|애쉬|\bash\b|실버|\bsilver\b/i, 'grey'],
  [/블랙|\bblack\b|검정|흑|제트|\bjet\b|밴타/i, 'black'],
  [
    /베이지|\bbeige\b|샌드|\bsand\b|카멜|\bcamel\b|탄\b|\btan\b\b|토프|\btaupe\b|스톤|\bstone\b|카키\s*베이지|라이트\s*카키|\bkhaki\s*beige\b/i,
    'beige',
  ],
  [
    /브라운|\bbrown\b|갈색|초코|\bchoco\b|모카|\bmocha\b|코코아|\bcocoa\b|커피|\bcoffee\b|카푸치노|월넛|\bwalnut\b|코냑|\bcognac\b|러셋|더스티\s*브라운|딥\s*브라운|다크\s*브라운|우드|\bwood\b/i,
    'brown',
  ],
  [/올리브|\bolive\b|카키|\bkhaki\b|세이지|\bsage\b|밀리터리\s*그린|\barmy\b|아미/i, 'olive'],
  [/그린|\bgreen\b|초록|포레스트|\bforest\b|헌터|\bhunter\b|에메랄드|민트|\bmint\b/i, 'green'],
  [/레드|\bred\b|버건디|\bburgundy\b|와인|\bwine\b|마룬|\bmaroon\b|브릭|\bbrick\b|크림슨/i, 'red'],
  [/핑크|\bpink\b|로즈|\brose\b/i, 'pink'],
  [/옐로|옐로우|\byellow\b|머스타드|\bmustard\b|골드|\bgold\b/i, 'yellow'],
  [/퍼플|\bpurple\b|라벤더|\blavender\b|바이올렛/i, 'purple'],
  [/오렌지|\borange\b/i, 'orange'],
  [/블루|\bblue\b|파랑|코발트|로열/i, 'blue'],
];

const SHOE_HINT =
  /스니커즈|sneakers?|운동화|슈즈|shoes?\b|부츠|boots?\b|로퍼|loafer|구두|더비|derby|첼시|워커|메리제인|플랫|모카신|척\s*70|척\s*테일러|올스타|에어\s*포스|삼바|가젤|클럽\s*c|목토|moc\s*toe|\b(990|991|992|993|2002|1906|530|327|574|860|9060)\b|1460|1461|xt-?6|스피드크로스|본디|클리프턴|위켄더|weekender|왈라비|wallabee|데저트\s*부츠|desert|페가수스|pegasus|챌린저|challenger|루퍼스|마하\s*\d|vomero|보메로|젤\s*카야노|gel-/i;
const SHOE_SLOTS = new Set([
  'm-trail',
  'm-loafer',
  'f-loafer',
  'f-flat',
  'm-workboots',
  'm-chelsea',
  'f-boots',
  'm-derby',
  'm-canvas',
  'm-white-sneaker',
  'm-runner',
  'f-sneaker',
]);

// 같은 글자가 여러 옷에 들어가는 이름("티셔츠" 안의 "셔츠")을 먼저 구분해 둔다
export function normalize(name) {
  return ` ${name} `
    .replace(/(?=[A-Za-z0-9-]*\d)(?=[A-Za-z0-9-]*[A-Za-z])[A-Za-z0-9-]{6,}/g, ' ')
    .replace(/스웨트\s*셔츠|스웻\s*셔츠|스웨트셔츠|스웻셔츠|sweat\s*shirts?|sweatshirts?|맨투맨/gi, ' SWEATTOP ')
    .replace(/티\s*셔츠|티셔츠|t-?shirts?|tee\s*shirts?/gi, ' TEETOP ')
    .replace(/폴로\s*랄프\s*로렌|polo\s*ralph\s*lauren|랄프\s*로렌|ralph\s*lauren/gi, ' RL ')
    .replace(/골든\s*플리스|golden\s*fleece/gi, ' GF ');
}

const APPAREL =
  /자켓|재킷|jacket|팬츠|pants|TEETOP|SWEATTOP|후드|hood|셔츠|shirt|니트|knit|코트|coat|베스트|vest|캡\b|cap\b|모자/i;
export function classify(name, g) {
  if (productExclusionReason({ name, price: 1 })) return null;
  const n = normalize(name);
  const apparelName = n.replace(/코트(?=\s*스니커즈)|\bcoat(?=\s*sneakers?\b)/gi, ' ');
  const shoe = SHOE_HINT.test(n) && !APPAREL.test(apparelName);
  for (const [re, slot, only] of RULES) {
    if (only && only !== g) continue;
    if (slot && SHOE_SLOTS.has(slot) && !shoe) continue;
    const hit = typeof re === 'function' ? re(n) : re.test(n);
    if (hit) {
      // 스타일 단어(jungle, hunting 등)가 상품의 실제 형태와 충돌하면 다음 규칙을 본다.
      if (slot && productClassificationConflict({ name, slot })) continue;
      return slot;
    }
  }
  return null;
}

export function colorOf(name) {
  // 이름 뒤쪽(대괄호·괄호·하이픈 뒤)에 붙은 색 표기를 먼저 본다
  const tail = (name.match(/[\[(]([^\])]+)[\])]\s*$/) || name.match(/[-–_\/]\s*([^-–_\/]+)$/) || [])[1] || '';
  for (const text of [tail, name]) {
    if (!text) continue;
    if (/\d+\s*(color|colors|컬러|색)/i.test(text) && text === name) return null;
    for (const [re, c] of COLOR_WORDS) if (re.test(text)) return c;
  }
  return null;
}

const MEN_FIRST = new Set([
  '폴로 랄프 로렌',
  '리',
  '리바이스',
  '칼하트',
  '노스페이스',
  '뉴발란스',
  '컨버스',
  '닥터마틴',
]);

export function parseCard(c, g) {
  const t = c.text;
  const rating = t.match(/(\d\.\d)\s*\(([\d,]+)\)/);
  const nameAt = t.indexOf(c.name.slice(0, 8));
  const brand = (
    nameAt > 0
      ? t
          .slice(0, nameAt)
          .replace(/\d+%.*$/, '')
          .trim()
      : ''
  ).replace(/^온\s*&\s*오프\s*/, '');
  const tag = (t.match(/(남성|여성|공용)\s*$/) || t.match(/(남성|여성|공용)/) || [])[1] || '';
  const after = t.slice(t.indexOf('원') + 1);
  const likes = parseInt((after.match(/^\s*([\d,.]+)(천|만)?/) || [])[1]?.replace(/,/g, '') || '0', 10);
  return {
    id: c.id,
    slugBrand: c.slug,
    brand,
    name: c.name,
    price: c.price,
    orig: c.orig,
    img: c.img.replace(/\?w=\d+/, '?w=600'),
    used: /판매완료|등급|USED|중고/.test(t.slice(0, Math.max(nameAt, 0))),
    summer: /반팔|숏\s*슬리브|short\s*sleeve|\bs\/s\b|린넨|linen|시어서커|seersucker/i.test(c.name),
    rating: rating ? Number(rating[1]) : null,
    reviews: rating ? Number(rating[2].replace(/,/g, '')) : 0,
    likes: Number.isFinite(likes) ? likes : 0,
    tag,
    g,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const raw = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const out = [];
  const seen = new Set();
  for (const [key, cards] of Object.entries(raw)) {
    const [g, rest] = key.split(':');
    const brandName = rest.split('|')[0];
    // 검색 결과에 섞인 다른 브랜드를 빼기 위해 가장 많이 나온 브랜드만 남긴다
    const counts = {};
    for (const c of cards.slice(0, 15)) counts[c.slug] = (counts[c.slug] || 0) + 1;
    const main = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
    for (const c of cards) {
      if (c.slug !== main || seen.has(c.id) || !/image.msscdn.net/.test(c.img)) continue;
      const p = { ...parseCard(c, g), brand: brandName };
      if (
        (g === 'M' && p.tag === '여성') ||
        (g === 'F' && p.tag === '남성') ||
        p.used ||
        /키즈|kids/i.test(c.text.slice(0, 20))
      )
        continue;
      const slot = classify(p.name, g);
      if (!slot) continue;
      // 남성 위주 브랜드의 공용 상품은 이름에 여성용 표시가 있을 때만 여성 목록에 넣는다
      if (
        g === 'F' &&
        MEN_FIRST.has(brandName) &&
        !/^f-(sneaker|boots|flat|loafer|bag)$/.test(slot) &&
        !/우먼|여성|women|우먼즈|lady|레이디|\(w\)|\bw\s/i.test(p.name)
      )
        continue;
      seen.add(c.id);
      out.push({ ...p, slot, color: colorOf(p.name) });
    }
  }
  fs.writeFileSync(process.argv[3], JSON.stringify(out, null, 1));
  const bySlot = {};
  for (const p of out) bySlot[p.slot] = (bySlot[p.slot] || 0) + 1;
  console.log(out.length, 'products;', out.filter((p) => !p.color).length, 'without color');
  console.log(
    Object.entries(bySlot)
      .sort()
      .map(([k, v]) => `${k}:${v}`)
      .join(' '),
  );
}
