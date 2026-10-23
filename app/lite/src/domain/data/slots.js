// 아이템 종류(slot): 옷장에서 한 역할을 맡는 옷의 종류. 색은 상품·내 옷의 속성으로 따로 둔다.
// style: 스타일별 중요도 0~3 (3 = 그 스타일 옷장의 기본). 점수와 설명은 편집자 판단이다.
// occ: daily 데일리 · work 출근 · date 데이트 · weekend 주말·여행 · formal 격식·하객
// colors: 내 옷을 넣을 때 먼저 보여 줄 색 (첫 번째가 기본값)

export const STYLES = {
  classic: { label: '아메리칸 클래식', short: '클래식', desc: { M: '옥스퍼드·치노·로퍼', F: '셔츠·트렌치·로퍼' }, g: ['M', 'F'] },
  amekaji: { label: '아메카지', short: '아메카지', desc: { M: '셀비지 데님·워크웨어·밀리터리', F: '빈티지 데님·워크 재킷' }, g: ['M', 'F'] },
  cityboy: { label: '시티보이', short: '시티보이', desc: { M: '넉넉한 셔츠·와이드 치노·볼캡' }, g: ['M'] },
  minimal: { label: '미니멀', short: '미니멀', desc: { M: '모노톤·깔끔한 핏', F: '모노톤·깔끔한 핏' }, g: ['M', 'F'] },
  dandy: { label: '댄디', short: '댄디', desc: { M: '셔츠·슬랙스·코트, 단정한 출근룩' }, g: ['M'] },
  gorp: { label: '고프코어', short: '고프코어', desc: { M: '플리스·바람막이·트레일 슈즈' }, g: ['M'] },
  french: { label: '프렌치 시크', short: '프렌치', desc: { F: '스트라이프·카디건·플랫' }, g: ['F'] },
  casual: { label: '데일리 캐주얼', short: '캐주얼', desc: { F: '티셔츠·데님·스니커즈' }, g: ['F'] },
};

export const OCCASIONS = {
  daily: '데일리',
  work: '출근',
  date: '데이트',
  weekend: '주말·여행',
  formal: '격식·하객',
};

export const CATS = {
  outer: '아우터',
  top: '상의',
  dress: '원피스',
  bottom: '하의',
  shoes: '신발',
  acc: '소품',
};

// light: 밝기 0~100, neutral: 다른 색과 두루 어울리는 기본색인지
export const COLORS = {
  white: { label: '화이트', hex: '#F6F5F0', light: 96, neutral: true },
  ivory: { label: '아이보리', hex: '#E9E1CF', light: 88, neutral: true },
  beige: { label: '베이지', hex: '#CDB894', light: 72, neutral: true },
  blue: { label: '라이트 블루', hex: '#9DB8DA', light: 70, neutral: true },
  grey: { label: '그레이', hex: '#A2A4A7', light: 62, neutral: true },
  olive: { label: '올리브', hex: '#5F6542', light: 38, neutral: true },
  brown: { label: '브라운', hex: '#6B4A33', light: 32, neutral: true },
  indigo: { label: '인디고', hex: '#2E4468', light: 26, neutral: true },
  charcoal: { label: '차콜', hex: '#3F4144', light: 24, neutral: true },
  navy: { label: '네이비', hex: '#1F2B46', light: 18, neutral: true },
  black: { label: '블랙', hex: '#1B1B1B', light: 8, neutral: true },
  green: { label: '그린', hex: '#2F5A43', light: 32, neutral: false },
  red: { label: '레드·버건디', hex: '#8E2A27', light: 34, neutral: false },
  pink: { label: '핑크', hex: '#E5AFBA', light: 76, neutral: false },
  yellow: { label: '옐로', hex: '#E0BF55', light: 78, neutral: false },
  purple: { label: '퍼플', hex: '#7B6BA8', light: 45, neutral: false },
  orange: { label: '오렌지', hex: '#D9793A', light: 58, neutral: false },
};

const ALL = ['spring', 'summer', 'fall', 'winter'];
const SFW = ['spring', 'fall', 'winter'];
const SF = ['spring', 'fall'];
const FW = ['fall', 'winter'];
const W = ['winter'];

// 스타일 점수 순서: M = [classic, amekaji, cityboy, minimal, dandy, gorp], F = [classic, amekaji, minimal, french, casual]
const M = (s) => ({ classic: s[0], amekaji: s[1], cityboy: s[2], minimal: s[3], dandy: s[4], gorp: s[5] });
const F = (s) => ({ classic: s[0], amekaji: s[1], minimal: s[2], french: s[3], casual: s[4] });

export const SLOTS = [
  // ── 남성 상의
  { id: 'm-oxford', g: 'M', cat: 'top', shape: 'shirt', name: '옥스퍼드·베이직 셔츠', colors: ['white', 'blue', 'grey'], style: M([3, 1, 2, 1, 2, 0]), occ: ['work', 'date', 'formal', 'daily'], seasons: ALL, formal: 4,
    why: '블레이저·니트·치노 어디에나 붙는 셔츠', tip: '단추 하나 풀고 소매를 두 번 접으면 덜 딱딱해 보여요' },
  { id: 'm-stripe-shirt', g: 'M', cat: 'top', shape: 'shirt', pattern: 'stripe', name: '스트라이프 셔츠', colors: ['blue', 'white'], style: M([3, 1, 2, 0, 2, 0]), occ: ['daily', 'work', 'weekend'], seasons: ALL, formal: 3,
    why: '무지 옷만 있는 옷장에 리듬을 주는 줄무늬', tip: '하의는 무지(치노·데님)로 두세요' },
  { id: 'm-chambray', g: 'M', cat: 'top', shape: 'shirt', name: '샴브레이·데님 셔츠', colors: ['blue', 'indigo'], style: M([1, 3, 1, 0, 0, 0]), occ: ['daily', 'weekend', 'work'], seasons: SFW, formal: 2,
    why: '워크웨어의 기본, 치노·퍼티그 팬츠와 바로 맞는 셔츠', tip: '단추를 끝까지 잠그고 소매를 걷으면 아메카지답게 떨어져요' },
  { id: 'm-flannel', g: 'M', cat: 'top', shape: 'shirt', pattern: 'check', name: '체크·플란넬 셔츠', colors: ['red', 'green', 'navy'], style: M([1, 3, 1, 0, 0, 1]), occ: ['daily', 'weekend'], seasons: FW, formal: 2,
    why: '가을·겨울 캐주얼에 온기와 색을 더하는 셔츠', tip: '흰 티 위에 단추를 풀고 재킷처럼 걸쳐도 돼요' },
  { id: 'm-tee', g: 'M', cat: 'top', shape: 'tee', name: '무지 티셔츠', colors: ['white', 'black', 'grey', 'navy'], style: M([1, 2, 3, 3, 1, 1]), occ: ['daily', 'weekend', 'date'], seasons: ALL, formal: 1,
    why: '여름엔 단독, 나머지 계절엔 이너로 쓰는 기본', tip: '목이 늘어지지 않는 도톰한 원단을 고르세요' },
  { id: 'm-longtee', g: 'M', cat: 'top', shape: 'longtee', name: '긴팔 티셔츠', colors: ['white', 'black', 'grey'], style: M([0, 2, 3, 3, 0, 1]), occ: ['daily', 'weekend'], seasons: SF, formal: 1,
    why: '환절기에 셔츠보다 편하게 입는 한 장', tip: '슬랙스와 입으면 미니멀, 데님과 입으면 캐주얼이 돼요' },
  { id: 'm-henley', g: 'M', cat: 'top', shape: 'longtee', name: '헨리넥 티셔츠', colors: ['ivory', 'grey', 'navy'], style: M([0, 3, 1, 0, 0, 0]), occ: ['daily', 'weekend'], seasons: SFW, formal: 1,
    why: '단추 몇 개로 무지 티보다 빈티지한 느낌', tip: '데님 재킷이나 워크 재킷 안에 받쳐 입으세요' },
  { id: 'm-polo', g: 'M', cat: 'top', shape: 'polo', name: '폴로 셔츠', colors: ['navy', 'white', 'black'], style: M([3, 0, 1, 1, 2, 0]), occ: ['daily', 'work', 'date'], seasons: ['spring', 'summer', 'fall'], formal: 2,
    why: '티셔츠 대신 입는 깃 달린 상의', tip: '치노 안에 넣어 입고 벨트를 보이게 하세요' },
  { id: 'm-rugby', g: 'M', cat: 'top', shape: 'polo', pattern: 'stripe', name: '럭비 셔츠', colors: ['navy', 'green', 'red'], style: M([3, 1, 2, 0, 0, 0]), occ: ['weekend', 'daily'], seasons: SF, formal: 1,
    why: '굵은 줄무늬로 주말 코디에 포인트', tip: '하의는 베이지 치노가 가장 안전해요' },
  { id: 'm-sweat', g: 'M', cat: 'top', shape: 'sweat', name: '스웻셔츠', colors: ['grey', 'navy', 'ivory'], style: M([2, 3, 3, 1, 0, 1]), occ: ['daily', 'weekend'], seasons: SFW, formal: 1,
    why: '주말 옷차림을 가장 빨리 끝내 주는 맨투맨', tip: '셔츠 깃을 꺼내면 아이비, 워크 재킷 안이면 아메카지예요' },
  { id: 'm-hoodie', g: 'M', cat: 'top', shape: 'sweat', name: '후드 스웻셔츠', colors: ['grey', 'black', 'navy'], style: M([0, 2, 3, 1, 0, 2]), occ: ['daily', 'weekend'], seasons: SFW, formal: 1,
    why: '재킷 안에 겹쳐 입기 좋은 후드', tip: '블레이저나 코트 안에 입어도 의외로 잘 맞아요' },
  { id: 'm-knit', g: 'M', cat: 'top', shape: 'knit', name: '크루넥 니트', colors: ['navy', 'grey', 'beige', 'ivory'], style: M([3, 1, 2, 3, 3, 0]), occ: ['work', 'date', 'daily'], seasons: SFW, formal: 3,
    why: '셔츠 위에 겹쳐 입는 가을·겨울 출근의 기본', tip: '셔츠 깃과 밑단을 살짝 보이게 입어 보세요' },
  { id: 'm-cable', g: 'M', cat: 'top', shape: 'knit', name: '케이블 니트', colors: ['ivory', 'navy', 'grey'], style: M([3, 2, 1, 0, 1, 0]), occ: ['date', 'daily', 'weekend'], seasons: FW, formal: 2,
    why: '꽈배기 짜임 하나로 코디가 완성되는 겨울 니트', tip: '하의는 생지 데님이나 그레이 슬랙스가 잘 받아요' },
  { id: 'm-vest', g: 'M', cat: 'top', shape: 'vest', name: '니트 베스트', colors: ['beige', 'navy', 'green'], style: M([2, 0, 3, 1, 1, 0]), occ: ['daily', 'work', 'date'], seasons: SF, formal: 2,
    why: '셔츠 위에 얹기만 해도 프레피해지는 조끼', tip: '옥스퍼드 셔츠 위에 입고 치노로 마무리하세요' },

  // ── 남성 아우터
  { id: 'm-cardigan', g: 'M', cat: 'outer', shape: 'cardigan', name: '카디건', colors: ['grey', 'navy', 'brown'], style: M([2, 1, 3, 3, 2, 0]), occ: ['daily', 'work', 'date'], seasons: SF, formal: 2,
    why: '재킷 대신 걸치는 가벼운 아우터', tip: '티셔츠 위에 단추를 잠가 니트처럼 입어도 좋아요' },
  { id: 'm-blazer', g: 'M', cat: 'outer', shape: 'blazer', name: '블레이저', colors: ['navy', 'charcoal', 'beige'], style: M([3, 0, 1, 2, 3, 0]), occ: ['work', 'formal', 'date'], seasons: SFW, formal: 5,
    why: '청바지에도 슬랙스에도 맞는 가장 활용도 높은 재킷', tip: '면접·하객부터 데님 데이트까지 한 벌로 돼요' },
  { id: 'm-trucker', g: 'M', cat: 'outer', shape: 'jacket', name: '데님 재킷', colors: ['indigo', 'blue'], style: M([2, 3, 2, 0, 0, 0]), occ: ['daily', 'weekend'], seasons: SF, formal: 1,
    why: '봄·가을 내내 걸치는 캐주얼 아우터', tip: '하의는 데님 말고 치노나 퍼티그 팬츠로 톤을 나누세요' },
  { id: 'm-chore', g: 'M', cat: 'outer', shape: 'jacket', name: '초어·커버올 재킷', colors: ['navy', 'indigo', 'beige'], style: M([1, 3, 2, 2, 1, 0]), occ: ['daily', 'weekend', 'work'], seasons: SF, formal: 2,
    why: '셔츠처럼 가볍고 재킷처럼 단정한 워크웨어', tip: '니트 위에 걸치면 늦가을까지 입어요' },
  { id: 'm-field', g: 'M', cat: 'outer', shape: 'jacket', name: '필드·M-65 재킷', colors: ['olive', 'beige'], style: M([1, 3, 2, 0, 0, 1]), occ: ['daily', 'weekend'], seasons: SF, formal: 2,
    why: '주머니 많은 밀리터리 재킷, 가을 캐주얼의 정석', tip: '안에는 흰 티나 옥스퍼드 셔츠가 잘 맞아요' },
  { id: 'm-harrington', g: 'M', cat: 'outer', shape: 'jacket', name: '블루종·캐주얼 재킷', colors: ['beige', 'navy', 'olive'], style: M([3, 1, 2, 2, 2, 0]), occ: ['daily', 'date', 'weekend'], seasons: SF, formal: 2,
    why: '짧고 깔끔해서 셔츠·치노와 잘 맞는 캐주얼 재킷', tip: '지퍼를 반쯤 올려 셔츠 깃을 보여 주세요' },
  { id: 'm-varsity', g: 'M', cat: 'outer', shape: 'jacket', name: '바시티 재킷', colors: ['navy', 'green', 'black'], style: M([3, 2, 2, 0, 0, 0]), occ: ['daily', 'weekend'], seasons: SF, formal: 1,
    why: '아이비 캠퍼스 룩을 한 번에 만드는 재킷', tip: '안은 옥스퍼드 셔츠, 하의는 치노로 단정하게' },
  { id: 'm-deck', g: 'M', cat: 'outer', shape: 'jacket', name: '덱 재킷(N-1)', colors: ['navy', 'olive'], style: M([0, 3, 1, 0, 0, 0]), occ: ['daily', 'weekend'], seasons: W, formal: 1,
    why: '안감이 두툼한 해군 작업복, 아메카지의 겨울 아우터', tip: '생지 데님과 워크부츠로 정석대로 입어 보세요' },
  { id: 'm-wax', g: 'M', cat: 'outer', shape: 'jacket', name: '왁스·헌팅 재킷', colors: ['olive', 'brown', 'navy'], style: M([3, 2, 0, 0, 1, 1]), occ: ['daily', 'weekend'], seasons: FW, formal: 2,
    why: '입을수록 멋이 드는 영국식 아웃도어 재킷', tip: '케이블 니트나 플란넬 셔츠와 가장 잘 어울려요' },
  { id: 'm-fleece', g: 'M', cat: 'outer', shape: 'jacket', name: '플리스', colors: ['ivory', 'black', 'navy'], style: M([0, 1, 2, 0, 0, 3]), occ: ['daily', 'weekend'], seasons: FW, formal: 1,
    why: '가볍고 따뜻한 아웃도어 기본 레이어', tip: '쉘 재킷 안에 겹쳐 입으면 한겨울까지 버텨요' },
  { id: 'm-shell', g: 'M', cat: 'outer', shape: 'jacket', name: '쉘·바람막이', colors: ['black', 'navy', 'olive'], style: M([0, 0, 2, 1, 0, 3]), occ: ['daily', 'weekend'], seasons: SF, formal: 1,
    why: '비바람 막는 기능성 아우터', tip: '와이드 팬츠와 트레일 슈즈로 고프코어 톤을 맞추세요' },
  { id: 'm-down', g: 'M', cat: 'outer', shape: 'down', name: '패딩', colors: ['black', 'navy', 'grey'], style: M([1, 1, 2, 2, 1, 3]), occ: ['daily', 'weekend', 'work'], seasons: W, formal: 1,
    why: '한겨울 출퇴근의 현실적인 선택', tip: '하의를 슬랙스로 두면 패딩도 단정해 보여요' },
  { id: 'm-downvest', g: 'M', cat: 'outer', shape: 'vest', name: '패딩 베스트', colors: ['navy', 'olive', 'black'], style: M([1, 2, 2, 0, 0, 3]), occ: ['daily', 'weekend'], seasons: FW, formal: 1,
    why: '셔츠·스웻 위에 걸쳐 체온을 지키는 조끼', tip: '플란넬 셔츠 위에 입으면 아메카지, 후드 위면 고프코어예요' },
  { id: 'm-balmacaan', g: 'M', cat: 'outer', shape: 'coat', name: '발마칸 코트', colors: ['beige', 'charcoal', 'navy'], style: M([3, 0, 2, 3, 3, 0]), occ: ['work', 'date', 'daily'], seasons: FW, formal: 4,
    why: '정장에도 니트에도 맞는 둥근 깃의 롱코트', tip: '무릎 근처 기장이 키와 상관없이 무난해요' },
  { id: 'm-trench', g: 'M', cat: 'outer', shape: 'coat', name: '트렌치 코트', colors: ['beige', 'navy', 'black'], style: M([2, 0, 1, 3, 3, 0]), occ: ['work', 'date'], seasons: SF, formal: 4,
    why: '환절기 출근과 데이트를 한 번에 해결하는 코트', tip: '벨트는 뒤로 돌려 묶으면 편해 보여요' },
  { id: 'm-peacoat', g: 'M', cat: 'outer', shape: 'coat', name: '피코트·더플코트', colors: ['navy', 'charcoal', 'beige'], style: M([3, 2, 0, 1, 2, 0]), occ: ['daily', 'date', 'work'], seasons: W, formal: 3,
    why: '짧고 묵직한 클래식 겨울 코트', tip: '하의는 생지 데님이나 그레이 슬랙스로' },

  // ── 남성 하의
  { id: 'm-chino', g: 'M', cat: 'bottom', shape: 'pants', name: '치노 팬츠', colors: ['beige', 'navy', 'olive'], style: M([3, 2, 3, 1, 2, 0]), occ: ['daily', 'work', 'date', 'weekend'], seasons: ALL, formal: 3,
    why: '네이비·화이트·블루 상의와 모두 맞는 바지', tip: '밑단을 한 번 접어 발목을 살짝 보이면 가벼워 보여요' },
  { id: 'm-denim-raw', g: 'M', cat: 'bottom', shape: 'jeans', name: '생지·셀비지 데님', colors: ['indigo'], style: M([3, 3, 1, 2, 1, 0]), occ: ['daily', 'date', 'weekend'], seasons: SFW, formal: 2,
    why: '진한 인디고 데님은 블레이저와도 어울리는 만능 바지', tip: '입을수록 몸에 맞게 색이 빠지는 걸 즐겨 보세요' },
  { id: 'm-denim', g: 'M', cat: 'bottom', shape: 'jeans', name: '워시드 데님', colors: ['blue', 'indigo', 'black'], style: M([1, 2, 3, 1, 0, 1]), occ: ['daily', 'weekend'], seasons: ALL, formal: 1,
    why: '편하게 막 입는 연한 색 청바지', tip: '상의를 진한 색으로 두면 균형이 맞아요' },
  { id: 'm-slacks', g: 'M', cat: 'bottom', shape: 'pants', name: '슬랙스', colors: ['grey', 'charcoal', 'black', 'navy'], style: M([2, 0, 2, 3, 3, 0]), occ: ['work', 'formal', 'date', 'daily'], seasons: ALL, formal: 4,
    why: '블레이저·니트·코트와 짝을 이루는 출근 바지', tip: '구두는 브라운 로퍼면 클래식, 블랙 더비면 미니멀이에요' },
  { id: 'm-work-pants', g: 'M', cat: 'bottom', shape: 'pants', name: '워크·퍼티그 팬츠', colors: ['olive', 'beige', 'black'], style: M([1, 3, 2, 0, 0, 1]), occ: ['daily', 'weekend'], seasons: SFW, formal: 1,
    why: '베이커·퍼티그·페인터 팬츠, 아메카지 하의의 기본', tip: '상의는 흰색·네이비·그레이로 차분하게' },
  { id: 'm-cargo', g: 'M', cat: 'bottom', shape: 'pants', name: '카고 팬츠', colors: ['olive', 'black', 'beige'], style: M([0, 2, 2, 0, 0, 3]), occ: ['daily', 'weekend'], seasons: ALL, formal: 1,
    why: '주머니 많은 기능성 바지', tip: '상의는 단색으로 두고 신발은 트레일 슈즈로' },
  { id: 'm-cords', g: 'M', cat: 'bottom', shape: 'pants', name: '코듀로이 팬츠', colors: ['brown', 'beige', 'olive'], style: M([3, 2, 2, 0, 1, 0]), occ: ['daily', 'date', 'weekend'], seasons: FW, formal: 2,
    why: '골이 있는 원단으로 가을·겨울에 따뜻해 보이는 바지', tip: '케이블 니트나 옥스퍼드 셔츠와 입어 보세요' },

  // ── 남성 신발·소품
  { id: 'm-loafer', g: 'M', cat: 'shoes', shape: 'loafer', name: '로퍼', colors: ['brown', 'black'], style: M([3, 1, 1, 2, 3, 0]), occ: ['work', 'date', 'formal', 'daily'], seasons: ALL, formal: 4,
    why: '치노·슬랙스·데님 모두 정리해 주는 구두', tip: '양말은 바지 색이나 흰색으로 맞추세요' },
  { id: 'm-derby', g: 'M', cat: 'shoes', shape: 'loafer', name: '더비·구두', colors: ['black', 'brown'], style: M([2, 1, 0, 3, 3, 0]), occ: ['work', 'formal', 'date'], seasons: ALL, formal: 5,
    why: '하객·면접까지 가능한 끈 구두', tip: '와이드 슬랙스와 신으면 미니멀 출근룩이 돼요' },
  { id: 'm-workboots', g: 'M', cat: 'shoes', shape: 'boot', name: '워크부츠', colors: ['brown', 'black'], style: M([1, 3, 0, 0, 0, 1]), occ: ['daily', 'weekend'], seasons: SFW, formal: 2,
    why: '생지 데님과 짝을 이루는 아메카지 신발', tip: '바지 밑단을 한 번 접어 부츠 목을 보여 주세요' },
  { id: 'm-chelsea', g: 'M', cat: 'shoes', shape: 'boot', name: '첼시 부츠', colors: ['brown', 'black'], style: M([2, 1, 1, 3, 2, 0]), occ: ['date', 'daily', 'work'], seasons: FW, formal: 3,
    why: '가을·겨울 코디를 한 단계 올려 주는 부츠', tip: '바지 밑단이 부츠에 살짝 걸치는 길이가 좋아요' },
  { id: 'm-white-sneaker', g: 'M', cat: 'shoes', shape: 'sneaker', name: '화이트 스니커즈', colors: ['white'], requiredColors: ['white'], style: M([1, 0, 2, 3, 1, 0]), occ: ['daily', 'date', 'weekend'], seasons: ALL, formal: 2,
    why: '슬랙스와 신어도 어색하지 않은 깔끔한 운동화', tip: '깨끗하게 관리하는 것만으로 코디가 살아요' },
  { id: 'm-canvas', g: 'M', cat: 'shoes', shape: 'sneaker', name: '캔버스 스니커즈', colors: ['ivory', 'black', 'white'], style: M([2, 2, 2, 1, 0, 0]), occ: ['daily', 'weekend'], seasons: ['spring', 'summer', 'fall'], formal: 1,
    why: '치노·데님과 신는 캐주얼 운동화', tip: '아이보리 색은 흰색보다 덜 튀어요' },
  { id: 'm-runner', g: 'M', cat: 'shoes', shape: 'sneaker', name: '러닝 스니커즈', colors: ['grey', 'white', 'black'], style: M([0, 1, 3, 1, 0, 2]), occ: ['daily', 'weekend'], seasons: ALL, formal: 1,
    why: '오래 걸어도 편한 운동화', tip: '회색은 거의 모든 바지 색과 부딪히지 않아요' },
  { id: 'm-trail', g: 'M', cat: 'shoes', shape: 'sneaker', name: '트레일 슈즈', colors: ['black', 'grey', 'olive'], style: M([0, 0, 1, 0, 0, 3]), occ: ['daily', 'weekend'], seasons: ALL, formal: 1,
    why: '접지력 좋은 아웃도어 운동화, 고프코어의 마침표', tip: '바지는 와이드·카고로 신발 볼륨과 맞추세요' },
  { id: 'm-cap', g: 'M', cat: 'acc', shape: 'cap', name: '볼캡', colors: ['navy', 'beige', 'black'], style: M([1, 2, 3, 0, 0, 2]), occ: ['weekend', 'daily'], seasons: ALL, formal: 1,
    why: '주말 코디를 마무리하는 가장 쉬운 소품', tip: '로고가 작은 것을 고르면 오래 써요' },
  { id: 'm-beanie', g: 'M', cat: 'acc', shape: 'beanie', name: '비니', colors: ['navy', 'grey', 'olive'], style: M([0, 3, 2, 1, 0, 2]), occ: ['weekend', 'daily'], seasons: FW, formal: 1,
    why: '겨울 캐주얼의 완성, 짧게 접어 쓰는 워치캡', tip: '귀 위로 짧게 접어 써야 아메카지다워요' },
  { id: 'm-belt', g: 'M', cat: 'acc', shape: 'belt', name: '가죽 벨트', colors: ['brown', 'black'], style: M([3, 2, 0, 2, 3, 0]), occ: ['work', 'formal', 'date'], seasons: ALL, formal: 4,
    why: '셔츠를 넣어 입을 때 완성도를 정하는 소품', tip: '신발 색과 맞추면 실패가 없어요' },

  // ── 여성
  { id: 'f-shirt', g: 'F', cat: 'top', shape: 'shirt', name: '셔츠·블라우스', colors: ['white', 'blue', 'ivory'], style: F([3, 1, 3, 3, 2]), occ: ['work', 'date', 'formal', 'daily'], seasons: ALL, formal: 4,
    why: '슬랙스·스커트·데님 어디에나 맞는 셔츠', tip: '앞자락만 살짝 넣어 입으면 다리가 길어 보여요' },
  { id: 'f-stripe', g: 'F', cat: 'top', shape: 'shirt', pattern: 'stripe', name: '스트라이프 셔츠·티', colors: ['blue', 'navy'], style: F([3, 1, 1, 3, 2]), occ: ['daily', 'work', 'weekend'], seasons: ALL, formal: 3,
    why: '트렌치·데님과 짝을 이루는 줄무늬', tip: '하의는 무지로 두세요' },
  { id: 'f-tee', g: 'F', cat: 'top', shape: 'tee', name: '티셔츠', colors: ['white', 'black', 'grey'], style: F([1, 2, 3, 2, 3]), occ: ['daily', 'weekend'], seasons: ALL, formal: 1,
    why: '모든 레이어드의 시작이 되는 티셔츠', tip: '흰색과 검정 하나씩이면 충분해요' },
  { id: 'f-knit', g: 'F', cat: 'top', shape: 'knit', name: '니트', colors: ['ivory', 'grey', 'navy', 'beige'], style: F([3, 1, 3, 3, 2]), occ: ['work', 'date', 'daily'], seasons: SFW, formal: 3,
    why: '가을·겨울 출근과 데이트에 두루 쓰는 니트', tip: '어깨에 다른 니트를 둘러 포인트를 줘도 좋아요' },
  { id: 'f-sweat', g: 'F', cat: 'top', shape: 'sweat', name: '스웻셔츠·후드', colors: ['grey', 'ivory', 'navy'], style: F([1, 2, 1, 0, 3]), occ: ['daily', 'weekend'], seasons: SFW, formal: 1,
    why: '편한 날의 기본 상의', tip: '롱 스커트와 입으면 의외로 단정해요' },
  { id: 'f-cardigan', g: 'F', cat: 'outer', shape: 'cardigan', name: '카디건', colors: ['navy', 'grey', 'ivory'], style: F([3, 1, 2, 3, 2]), occ: ['daily', 'work', 'date'], seasons: SF, formal: 2,
    why: '원피스와 셔츠 위에 걸치는 가벼운 아우터', tip: '단추를 잠가 상의처럼 입어도 돼요' },
  { id: 'f-blazer', g: 'F', cat: 'outer', shape: 'blazer', name: '블레이저', colors: ['black', 'navy', 'beige'], style: F([3, 0, 3, 3, 1]), occ: ['work', 'formal', 'date'], seasons: SFW, formal: 5,
    why: '티셔츠와 데님도 출근복으로 바꿔 주는 재킷', tip: '소매를 살짝 걷어 손목을 보이면 가벼워져요' },
  { id: 'f-trench', g: 'F', cat: 'outer', shape: 'coat', name: '트렌치 코트', colors: ['beige', 'ivory', 'black'], style: F([3, 0, 3, 3, 1]), occ: ['work', 'date', 'daily'], seasons: SF, formal: 4,
    why: '봄·가을 어떤 옷 위에도 맞는 코트', tip: '벨트를 뒤로 묶으면 실루엣이 편해 보여요' },
  { id: 'f-coat', g: 'F', cat: 'outer', shape: 'coat', name: '울 코트', colors: ['beige', 'charcoal', 'brown'], style: F([3, 0, 3, 3, 1]), occ: ['work', 'date', 'formal'], seasons: FW, formal: 4,
    why: '겨울 내내 입는 가장 중요한 한 벌', tip: '가진 옷과 맞는 색 하나만 고르세요' },
  { id: 'f-jacket', g: 'F', cat: 'outer', shape: 'jacket', name: '데님·워크 재킷', colors: ['indigo', 'blue', 'beige'], style: F([1, 3, 0, 1, 3]), occ: ['daily', 'weekend'], seasons: SF, formal: 1,
    why: '원피스·스커트에 캐주얼을 더하는 재킷', tip: '하의는 데님 말고 다른 소재로 고르세요' },
  { id: 'f-padding', g: 'F', cat: 'outer', shape: 'down', name: '패딩', colors: ['black', 'ivory', 'beige'], style: F([1, 1, 2, 1, 3]), occ: ['daily', 'weekend'], seasons: W, formal: 1,
    why: '한겨울 데일리를 책임지는 패딩', tip: '와이드 바지와 입으면 비율이 좋아요' },
  { id: 'f-denim', g: 'F', cat: 'bottom', shape: 'jeans', name: '데님 팬츠', colors: ['indigo', 'blue'], style: F([2, 3, 2, 3, 3]), occ: ['daily', 'date', 'weekend'], seasons: SFW, formal: 2,
    why: '셔츠·니트·블레이저 모두 받쳐 주는 청바지', tip: '발목이 보이는 기장이 가장 가볍게 떨어져요' },
  { id: 'f-slacks', g: 'F', cat: 'bottom', shape: 'pants', name: '슬랙스', colors: ['black', 'beige', 'grey'], style: F([2, 0, 3, 2, 2]), occ: ['work', 'daily', 'date'], seasons: ALL, formal: 4,
    why: '편하면서 단정한 출근 바지', tip: '앞코가 둥근 로퍼나 플랫과 신어 보세요' },
  { id: 'f-skirt', g: 'F', cat: 'bottom', shape: 'skirt', name: '스커트', colors: ['black', 'brown', 'beige'], style: F([3, 0, 2, 3, 2]), occ: ['date', 'work', 'daily'], seasons: ALL, formal: 3,
    why: '니트·셔츠와 함께 단정한 분위기를 내는 스커트', tip: '상의를 짧게 넣어 허리선을 보여 주세요' },
  { id: 'f-dress', g: 'F', cat: 'dress', shape: 'dress', name: '원피스', colors: ['navy', 'black', 'blue'], style: F([3, 0, 2, 3, 2]), occ: ['date', 'work', 'formal'], seasons: ['spring', 'summer', 'fall'], formal: 3,
    why: '한 벌로 끝나는 출근·데이트 옷', tip: '카디건이나 트렌치를 걸치면 가을까지 입어요' },
  { id: 'f-loafer', g: 'F', cat: 'shoes', shape: 'loafer', name: '로퍼', colors: ['black', 'brown'], style: F([3, 1, 3, 3, 1]), occ: ['work', 'date', 'daily', 'formal'], seasons: ALL, formal: 4,
    why: '슬랙스·스커트·데님 모두 정리해 주는 구두', tip: '흰 양말을 신으면 캐주얼하게 바뀌어요' },
  { id: 'f-flat', g: 'F', cat: 'shoes', shape: 'loafer', name: '플랫·메리제인', colors: ['black', 'brown', 'ivory'], style: F([2, 0, 2, 3, 1]), occ: ['date', 'work', 'formal'], seasons: ALL, formal: 3,
    why: '스커트·원피스를 사랑스럽게 마무리하는 구두', tip: '발목 양말과 함께 신어도 좋아요' },
  { id: 'f-sneaker', g: 'F', cat: 'shoes', shape: 'sneaker', name: '스니커즈', colors: ['white', 'grey', 'black'], style: F([1, 2, 2, 2, 3]), occ: ['daily', 'weekend'], seasons: ALL, formal: 1,
    why: '어떤 하의에도 무난한 데일리 운동화', tip: '흰색이나 회색이면 실패가 적어요' },
  { id: 'f-boots', g: 'F', cat: 'shoes', shape: 'boot', name: '부츠', colors: ['black', 'brown'], style: F([2, 2, 2, 2, 2]), occ: ['daily', 'date', 'work'], seasons: FW, formal: 3,
    why: '가을·겨울 스커트와 데님을 모두 받쳐 주는 신발', tip: '롱 스커트에는 앵클, 데님에는 워커가 잘 맞아요' },
  { id: 'f-bag', g: 'F', cat: 'acc', shape: 'bag', name: '가방', colors: ['brown', 'black', 'beige'], style: F([3, 1, 3, 3, 2]), occ: ['work', 'date', 'daily'], seasons: ALL, formal: 3,
    why: '매일 드는 가방 하나가 코디의 마무리', tip: '신발 색과 맞추면 정돈돼 보여요' },
];

export const SLOT_BY_ID = Object.fromEntries(SLOTS.map((s) => [s.id, s]));
export const stylesFor = (g) => Object.entries(STYLES).filter(([, s]) => s.g.includes(g)).map(([k]) => k);
