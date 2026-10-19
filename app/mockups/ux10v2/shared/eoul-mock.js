/* 자동 생성 파일: app/mockups/ux10v2/tools/build-core.mjs 로 다시 만든다. 직접 고치지 않는다.
   내용: 어울 앱 엔진(app/src, 커밋 1af0f8e) 19개 모듈 + 목업 코어 2판(app/mockups/ux10v2/src/core.mjs).
   상품 사진 891개는 파일이 아니라 무신사 이미지 서버 주소다(사용 권리 미확인). ?photos=0이면 사진 없이 본다.
   window.EoulMock 하나만 내보낸다. */
(function () {
'use strict';
// ── src/data/slots.js
// 아이템 종류(slot): 옷장에서 한 역할을 맡는 옷의 종류. 색은 상품·내 옷의 속성으로 따로 둔다.
// style: 스타일별 중요도 0~3 (3 = 그 스타일 옷장의 기본). 점수와 설명은 편집자 판단이다.
// occ: daily 데일리 · work 출근 · date 데이트 · weekend 주말·여행 · formal 격식·하객
// colors: 내 옷을 넣을 때 먼저 보여 줄 색 (첫 번째가 기본값)

const STYLES = {
  classic: { label: '아메리칸 클래식', short: '클래식', desc: { M: '옥스퍼드·치노·로퍼', F: '셔츠·트렌치·로퍼' }, g: ['M', 'F'] },
  amekaji: { label: '아메카지', short: '아메카지', desc: { M: '셀비지 데님·워크웨어·밀리터리', F: '빈티지 데님·워크 재킷' }, g: ['M', 'F'] },
  cityboy: { label: '시티보이', short: '시티보이', desc: { M: '넉넉한 셔츠·와이드 치노·볼캡' }, g: ['M'] },
  minimal: { label: '미니멀', short: '미니멀', desc: { M: '모노톤·깔끔한 핏', F: '모노톤·깔끔한 핏' }, g: ['M', 'F'] },
  dandy: { label: '댄디', short: '댄디', desc: { M: '셔츠·슬랙스·코트, 단정한 출근룩' }, g: ['M'] },
  gorp: { label: '고프코어', short: '고프코어', desc: { M: '플리스·바람막이·트레일 슈즈' }, g: ['M'] },
  french: { label: '프렌치 시크', short: '프렌치', desc: { F: '스트라이프·카디건·플랫' }, g: ['F'] },
  casual: { label: '데일리 캐주얼', short: '캐주얼', desc: { F: '티셔츠·데님·스니커즈' }, g: ['F'] },
};

const OCCASIONS = {
  daily: '데일리',
  work: '출근',
  date: '데이트',
  weekend: '주말·여행',
  formal: '격식·하객',
};

const CATS = {
  outer: '아우터',
  top: '상의',
  dress: '원피스',
  bottom: '하의',
  shoes: '신발',
  acc: '소품',
};

// light: 밝기 0~100, neutral: 다른 색과 두루 어울리는 기본색인지
const COLORS = {
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

const SLOTS = [
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

const SLOT_BY_ID = Object.fromEntries(SLOTS.map((s) => [s.id, s]));
const stylesFor = (g) => Object.entries(STYLES).filter(([, s]) => s.g.includes(g)).map(([k]) => k);

// ── src/data/looks.js
// 코디 공식(look): 스타일리스트가 권하는 조합을 역할별 아이템 종류와 권장 색으로 적어 둔 것.
// 역할: outer 아우터 · top 상의 · inner 이너(상의 안에 겹쳐 입는 옷) · dress 원피스 · bottom 하의 · shoes 신발 · acc 소품
// 역할 값: { s: [종류 id, 선호 순서], c: [권장 색] }. 엔진은 가진 옷을 먼저 쓰고 없는 역할만 실제 상품으로 채운다.

const L_SF = ['spring', 'fall'];
const L_FW = ['fall', 'winter'];
const L_SFW = ['spring', 'fall', 'winter'];

const LOOKS = [
  // ── 남성 · 아메리칸 클래식
  { id: 'm-ivy-campus', g: 'M', title: '아이비 캠퍼스', styles: ['classic', 'cityboy'], occ: ['daily', 'weekend', 'date'], seasons: L_SF,
    note: '짧은 재킷에 옥스퍼드 셔츠와 치노, 로퍼로 마무리하는 기본 아이비 룩이에요.',
    roles: { outer: { s: ['m-harrington', 'm-varsity'], c: ['navy', 'beige'] }, top: { s: ['m-oxford', 'm-stripe-shirt'], c: ['white', 'blue'] }, bottom: { s: ['m-chino', 'm-cords'], c: ['beige', 'olive'] }, shoes: { s: ['m-loafer', 'm-canvas'], c: ['brown', 'ivory'] } } },
  { id: 'm-navy-blazer', g: 'M', title: '네이비 블레이저 출근', styles: ['classic', 'dandy'], occ: ['work', 'formal', 'date'], seasons: L_SFW,
    note: '네이비 블레이저·흰 셔츠·그레이 슬랙스는 가장 실패 없는 출근 공식이에요.',
    roles: { outer: { s: ['m-blazer'], c: ['navy'] }, top: { s: ['m-oxford', 'm-stripe-shirt'], c: ['white', 'blue'] }, bottom: { s: ['m-slacks', 'm-chino'], c: ['grey', 'charcoal', 'beige'] }, shoes: { s: ['m-loafer', 'm-derby'], c: ['brown', 'black'] }, acc: { s: ['m-belt'], c: ['brown'] } } },
  { id: 'm-knit-layer', g: 'M', title: '셔츠 위 니트 레이어드', styles: ['classic', 'dandy', 'cityboy'], occ: ['work', 'date', 'daily'], seasons: L_FW,
    note: '니트 안에 셔츠 깃을 꺼내 입으면 출근과 데이트에 모두 맞아요.',
    roles: { outer: { s: ['m-balmacaan', 'm-peacoat'], c: ['beige', 'navy', 'charcoal'] }, top: { s: ['m-knit', 'm-cable'], c: ['navy', 'grey', 'ivory'] }, inner: { s: ['m-oxford', 'm-stripe-shirt'], c: ['white', 'blue'] }, bottom: { s: ['m-chino', 'm-cords', 'm-slacks'], c: ['beige', 'brown', 'grey'] }, shoes: { s: ['m-loafer', 'm-chelsea'], c: ['brown'] } } },
  { id: 'm-rugby-weekend', g: 'M', title: '럭비 셔츠 주말', styles: ['classic', 'cityboy'], occ: ['weekend', 'daily'], seasons: L_SF,
    note: '줄무늬 하나에 치노와 캔버스 운동화만 더하면 끝나는 주말 코디예요.',
    roles: { top: { s: ['m-rugby', 'm-sweat'], c: ['navy', 'green', 'grey'] }, bottom: { s: ['m-chino', 'm-denim-raw'], c: ['beige', 'indigo'] }, shoes: { s: ['m-canvas', 'm-loafer'], c: ['ivory', 'brown'] }, acc: { s: ['m-cap'], c: ['navy', 'beige'] } } },
  { id: 'm-country', g: 'M', title: '왁스 재킷 컨트리', styles: ['classic', 'amekaji'], occ: ['weekend', 'daily'], seasons: L_FW,
    note: '왁스 재킷 안에 케이블 니트나 플란넬, 코듀로이 바지로 따뜻하게 맞춰요.',
    roles: { outer: { s: ['m-wax'], c: ['olive', 'brown'] }, top: { s: ['m-cable', 'm-flannel'], c: ['ivory', 'red', 'green'] }, bottom: { s: ['m-cords', 'm-denim-raw'], c: ['brown', 'beige', 'indigo'] }, shoes: { s: ['m-chelsea', 'm-workboots'], c: ['brown'] } } },
  { id: 'm-polo-summer', g: 'M', title: '폴로 셔츠 여름', styles: ['classic', 'dandy'], occ: ['work', 'daily', 'date'], seasons: ['summer', 'spring'],
    note: '깃 있는 폴로를 치노에 넣어 입으면 더운 날에도 단정해요.',
    roles: { top: { s: ['m-polo', 'm-oxford'], c: ['navy', 'white'] }, bottom: { s: ['m-chino', 'm-slacks'], c: ['beige', 'grey'] }, shoes: { s: ['m-loafer', 'm-white-sneaker'], c: ['brown', 'white'] }, acc: { s: ['m-belt'], c: ['brown'] } } },

  // ── 남성 · 아메카지
  { id: 'm-workwear', g: 'M', title: '워크 재킷과 셀비지 데님', styles: ['amekaji'], occ: ['daily', 'weekend'], seasons: L_SF,
    note: '커버올이나 데님 재킷 안에 헨리넥, 생지 데님과 워크부츠로 정석대로 입어요.',
    roles: { outer: { s: ['m-chore', 'm-trucker'], c: ['navy', 'indigo', 'beige'] }, top: { s: ['m-henley', 'm-tee', 'm-chambray'], c: ['ivory', 'white', 'grey'] }, bottom: { s: ['m-denim-raw', 'm-work-pants'], c: ['indigo', 'olive'] }, shoes: { s: ['m-workboots', 'm-canvas'], c: ['brown', 'ivory'] } } },
  { id: 'm-military', g: 'M', title: 'M-65 밀리터리 캐주얼', styles: ['amekaji', 'cityboy'], occ: ['daily', 'weekend'], seasons: L_SF,
    note: '올리브 필드 재킷에 샴브레이 셔츠나 흰 티, 데님으로 색을 나눠요.',
    roles: { outer: { s: ['m-field'], c: ['olive'] }, top: { s: ['m-chambray', 'm-tee', 'm-sweat'], c: ['blue', 'white', 'grey'] }, bottom: { s: ['m-denim-raw', 'm-chino', 'm-work-pants'], c: ['indigo', 'beige'] }, shoes: { s: ['m-workboots', 'm-canvas', 'm-runner'], c: ['brown', 'ivory'] } } },
  { id: 'm-flannel-vest', g: 'M', title: '플란넬과 패딩 베스트', styles: ['amekaji', 'gorp'], occ: ['daily', 'weekend'], seasons: L_FW,
    note: '체크 셔츠 위에 패딩 베스트, 생지 데님과 워크부츠면 늦가을 아메카지 완성이에요.',
    roles: { outer: { s: ['m-downvest', 'm-trucker'], c: ['navy', 'olive'] }, top: { s: ['m-flannel'], c: ['red', 'green'] }, inner: { s: ['m-tee', 'm-henley'], c: ['white', 'ivory'] }, bottom: { s: ['m-denim-raw', 'm-work-pants'], c: ['indigo', 'beige'] }, shoes: { s: ['m-workboots'], c: ['brown'] }, acc: { s: ['m-beanie'], c: ['navy', 'olive'] } } },
  { id: 'm-deck-winter', g: 'M', title: '덱 재킷 겨울 아메카지', styles: ['amekaji'], occ: ['daily', 'weekend'], seasons: ['winter'],
    note: '두툼한 덱 재킷에 스웻셔츠, 생지 데님과 워크부츠, 짧게 접은 비니로 마무리해요.',
    roles: { outer: { s: ['m-deck', 'm-peacoat', 'm-down'], c: ['navy', 'olive'] }, top: { s: ['m-sweat', 'm-flannel', 'm-henley'], c: ['grey', 'ivory'] }, bottom: { s: ['m-denim-raw', 'm-work-pants'], c: ['indigo', 'olive'] }, shoes: { s: ['m-workboots'], c: ['brown', 'black'] }, acc: { s: ['m-beanie'], c: ['navy', 'grey'] } } },
  { id: 'm-denim-daily', g: 'M', title: '데님 재킷 데일리', styles: ['amekaji', 'cityboy'], occ: ['daily', 'weekend'], seasons: L_SF,
    note: '데님 재킷에 스웻셔츠와 치노, 편한 운동화로 위아래 톤을 나눠요.',
    roles: { outer: { s: ['m-trucker'], c: ['indigo', 'blue'] }, top: { s: ['m-sweat', 'm-tee', 'm-hoodie'], c: ['grey', 'white'] }, bottom: { s: ['m-chino', 'm-work-pants'], c: ['beige', 'olive'] }, shoes: { s: ['m-runner', 'm-canvas'], c: ['grey', 'ivory'] }, acc: { s: ['m-cap'], c: ['navy'] } } },

  // ── 남성 · 시티보이
  { id: 'm-city-shirt', g: 'M', title: '넉넉한 셔츠와 와이드 치노', styles: ['cityboy'], occ: ['daily', 'weekend', 'date'], seasons: ['spring', 'summer', 'fall'],
    note: '한 치수 큰 셔츠 안에 흰 티, 와이드 치노와 러닝화로 힘을 빼요.',
    roles: { top: { s: ['m-oxford', 'm-stripe-shirt'], c: ['blue', 'white'] }, inner: { s: ['m-tee'], c: ['white'] }, bottom: { s: ['m-chino', 'm-work-pants'], c: ['beige', 'olive'] }, shoes: { s: ['m-runner', 'm-canvas'], c: ['grey', 'ivory'] }, acc: { s: ['m-cap'], c: ['navy', 'beige'] } } },
  { id: 'm-city-vest', g: 'M', title: '니트 베스트 레이어드', styles: ['cityboy', 'classic'], occ: ['daily', 'date', 'work'], seasons: L_SF,
    note: '셔츠 위에 니트 베스트를 얹고 치노로 마무리하는 프레피한 시티보이 룩이에요.',
    roles: { top: { s: ['m-vest'], c: ['beige', 'navy', 'green'] }, inner: { s: ['m-oxford', 'm-stripe-shirt'], c: ['white', 'blue'] }, bottom: { s: ['m-chino', 'm-denim'], c: ['beige', 'blue'] }, shoes: { s: ['m-loafer', 'm-runner'], c: ['brown', 'grey'] } } },
  { id: 'm-city-winter', g: 'M', title: '후드와 패딩', styles: ['cityboy', 'gorp'], occ: ['daily', 'weekend'], seasons: ['winter'],
    note: '패딩 안에 후드를 넉넉하게, 하의는 치노나 데님으로 편하게 맞춰요.',
    roles: { outer: { s: ['m-down', 'm-fleece'], c: ['black', 'navy', 'ivory'] }, top: { s: ['m-hoodie', 'm-sweat'], c: ['grey', 'navy'] }, bottom: { s: ['m-chino', 'm-denim', 'm-work-pants'], c: ['beige', 'blue', 'olive'] }, shoes: { s: ['m-runner'], c: ['grey', 'white'] }, acc: { s: ['m-beanie', 'm-cap'], c: ['grey', 'navy'] } } },
  { id: 'm-city-cardigan', g: 'M', title: '카디건 시티 캐주얼', styles: ['cityboy', 'minimal'], occ: ['daily', 'date'], seasons: L_SF,
    note: '긴팔 티 위에 카디건을 걸치고 넉넉한 치노와 운동화로 편하게.',
    roles: { outer: { s: ['m-cardigan'], c: ['brown', 'grey', 'navy'] }, top: { s: ['m-longtee', 'm-tee'], c: ['white', 'grey'] }, bottom: { s: ['m-chino', 'm-denim'], c: ['beige', 'blue'] }, shoes: { s: ['m-runner', 'm-canvas'], c: ['grey', 'ivory'] } } },

  // ── 남성 · 미니멀
  { id: 'm-mono-coat', g: 'M', title: '모노톤 코트', styles: ['minimal', 'dandy'], occ: ['work', 'date', 'daily'], seasons: L_FW,
    note: '코트·니트·슬랙스를 비슷한 어두운 톤으로 맞추면 차분하고 길어 보여요.',
    roles: { outer: { s: ['m-balmacaan', 'm-trench'], c: ['charcoal', 'black', 'navy'] }, top: { s: ['m-knit', 'm-longtee'], c: ['black', 'charcoal', 'grey'] }, bottom: { s: ['m-slacks'], c: ['black', 'charcoal'] }, shoes: { s: ['m-derby', 'm-chelsea'], c: ['black'] } } },
  { id: 'm-mono-daily', g: 'M', title: '흰 티와 슬랙스', styles: ['minimal'], occ: ['daily', 'date', 'weekend'], seasons: ['spring', 'summer', 'fall'],
    note: '좋은 무지 티 한 장과 슬랙스, 흰 스니커즈면 군더더기 없는 데일리예요.',
    roles: { outer: { s: ['m-cardigan', 'm-trench'], c: ['black', 'grey'] }, top: { s: ['m-tee', 'm-longtee'], c: ['white', 'black'] }, bottom: { s: ['m-slacks', 'm-denim-raw'], c: ['black', 'charcoal', 'indigo'] }, shoes: { s: ['m-white-sneaker', 'm-derby'], c: ['white', 'black'] } } },

  // ── 남성 · 댄디
  { id: 'm-dandy-work', g: 'M', title: '셔츠·슬랙스 출근', styles: ['dandy', 'minimal'], occ: ['work', 'formal'], seasons: L_SFW,
    note: '셔츠를 넣어 입고 벨트와 구두 색을 맞추면 정장 없이도 단정해요.',
    roles: { outer: { s: ['m-trench', 'm-balmacaan', 'm-blazer'], c: ['beige', 'navy', 'charcoal'] }, top: { s: ['m-oxford', 'm-knit'], c: ['white', 'blue', 'navy'] }, bottom: { s: ['m-slacks'], c: ['grey', 'navy', 'charcoal'] }, shoes: { s: ['m-derby', 'm-loafer'], c: ['black', 'brown'] }, acc: { s: ['m-belt'], c: ['black', 'brown'] } } },
  { id: 'm-dandy-date', g: 'M', title: '니트와 코트 데이트', styles: ['dandy', 'classic'], occ: ['date', 'daily'], seasons: L_FW,
    note: '부드러운 니트에 코트, 생지 데님이나 슬랙스와 첼시 부츠로 마무리해요.',
    roles: { outer: { s: ['m-balmacaan', 'm-peacoat'], c: ['beige', 'navy'] }, top: { s: ['m-knit', 'm-cable'], c: ['ivory', 'grey', 'navy'] }, bottom: { s: ['m-denim-raw', 'm-slacks'], c: ['indigo', 'grey'] }, shoes: { s: ['m-chelsea', 'm-loafer'], c: ['brown', 'black'] } } },

  // ── 남성 · 고프코어
  { id: 'm-gorp-shell', g: 'M', title: '바람막이와 카고', styles: ['gorp'], occ: ['daily', 'weekend'], seasons: L_SF,
    note: '가벼운 쉘 재킷에 카고 팬츠와 트레일 슈즈, 기능성 톤으로 통일해요.',
    roles: { outer: { s: ['m-shell', 'm-fleece'], c: ['black', 'olive', 'navy'] }, top: { s: ['m-longtee', 'm-tee', 'm-hoodie'], c: ['grey', 'white', 'black'] }, bottom: { s: ['m-cargo', 'm-work-pants'], c: ['olive', 'black', 'beige'] }, shoes: { s: ['m-trail', 'm-runner'], c: ['black', 'grey'] }, acc: { s: ['m-cap'], c: ['black', 'olive'] } } },
  { id: 'm-gorp-winter', g: 'M', title: '플리스·패딩 겨울 아웃도어', styles: ['gorp'], occ: ['daily', 'weekend'], seasons: L_FW,
    note: '플리스나 패딩 안에 후드, 카고 팬츠와 트레일 슈즈로 따뜻하고 실용적으로.',
    roles: { outer: { s: ['m-down', 'm-fleece', 'm-downvest'], c: ['black', 'ivory', 'olive'] }, top: { s: ['m-hoodie', 'm-sweat'], c: ['grey', 'black'] }, bottom: { s: ['m-cargo', 'm-denim'], c: ['olive', 'black', 'blue'] }, shoes: { s: ['m-trail', 'm-runner'], c: ['black', 'grey'] }, acc: { s: ['m-beanie'], c: ['black', 'olive'] } } },

  // ── 여성
  { id: 'f-blazer-work', g: 'F', title: '블레이저 셔츠 출근', styles: ['classic', 'minimal', 'french'], occ: ['work', 'formal', 'date'], seasons: L_SFW,
    note: '블레이저·셔츠·슬랙스에 로퍼면 회의 날에도 안심이에요.',
    roles: { outer: { s: ['f-blazer'], c: ['black', 'navy', 'beige'] }, top: { s: ['f-shirt', 'f-knit', 'f-stripe'], c: ['white', 'ivory', 'blue'] }, bottom: { s: ['f-slacks', 'f-skirt'], c: ['black', 'beige', 'grey'] }, shoes: { s: ['f-loafer', 'f-flat'], c: ['black'] }, acc: { s: ['f-bag'], c: ['black', 'brown'] } } },
  { id: 'f-trench-stripe', g: 'F', title: '트렌치와 스트라이프', styles: ['french', 'classic'], occ: ['daily', 'date', 'work'], seasons: L_SF,
    note: '트렌치 안에 줄무늬와 데님, 플랫으로 마무리하는 프렌치 공식이에요.',
    roles: { outer: { s: ['f-trench'], c: ['beige'] }, top: { s: ['f-stripe', 'f-shirt', 'f-knit'], c: ['navy', 'blue', 'white'] }, bottom: { s: ['f-denim', 'f-slacks'], c: ['indigo', 'blue', 'black'] }, shoes: { s: ['f-flat', 'f-loafer', 'f-sneaker'], c: ['black', 'brown'] }, acc: { s: ['f-bag'], c: ['brown'] } } },
  { id: 'f-coat-skirt', g: 'F', title: '울 코트와 롱 스커트', styles: ['classic', 'minimal', 'french'], occ: ['date', 'work'], seasons: L_FW,
    note: '코트·니트·롱 스커트는 겨울에 가장 우아한 조합이에요.',
    roles: { outer: { s: ['f-coat'], c: ['beige', 'charcoal', 'brown'] }, top: { s: ['f-knit'], c: ['ivory', 'grey'] }, bottom: { s: ['f-skirt', 'f-slacks'], c: ['black', 'brown'] }, shoes: { s: ['f-boots', 'f-loafer', 'f-flat'], c: ['black', 'brown'] }, acc: { s: ['f-bag'], c: ['brown', 'black'] } } },
  { id: 'f-cardigan-french', g: 'F', title: '카디건 프렌치 데일리', styles: ['french', 'classic', 'casual'], occ: ['daily', 'weekend', 'date'], seasons: L_SF,
    note: '줄무늬 티 위에 카디건, 스트레이트 데님과 플랫이면 힘 뺀 프렌치 룩이에요.',
    roles: { outer: { s: ['f-cardigan'], c: ['navy', 'ivory', 'grey'] }, top: { s: ['f-stripe', 'f-tee', 'f-shirt'], c: ['navy', 'white'] }, bottom: { s: ['f-denim', 'f-skirt'], c: ['indigo', 'blue', 'black'] }, shoes: { s: ['f-flat', 'f-loafer', 'f-sneaker'], c: ['black', 'brown'] } } },
  { id: 'f-dress-date', g: 'F', title: '원피스 데이트', styles: ['classic', 'french', 'minimal'], occ: ['date', 'formal', 'work'], seasons: ['spring', 'summer', 'fall'],
    note: '원피스 하나에 카디건이나 트렌치를 걸치면 날씨 걱정이 없어요.',
    roles: { dress: { s: ['f-dress'], c: ['navy', 'black', 'blue'] }, outer: { s: ['f-cardigan', 'f-trench'], c: ['ivory', 'beige', 'navy'] }, shoes: { s: ['f-flat', 'f-loafer'], c: ['black', 'brown'] }, acc: { s: ['f-bag'], c: ['brown', 'black'] } } },
  { id: 'f-denim-weekend', g: 'F', title: '데님 재킷 주말', styles: ['casual', 'amekaji'], occ: ['weekend', 'daily'], seasons: L_SF,
    note: '데님 재킷에 롱 스커트나 슬랙스를 매치하면 캐주얼하지만 단정해요.',
    roles: { outer: { s: ['f-jacket'], c: ['indigo', 'blue'] }, top: { s: ['f-tee', 'f-sweat'], c: ['white', 'grey'] }, bottom: { s: ['f-skirt', 'f-slacks'], c: ['black', 'beige'] }, shoes: { s: ['f-sneaker'], c: ['white', 'grey'] } } },
  { id: 'f-workwear', g: 'F', title: '워크 재킷과 빈티지 데님', styles: ['amekaji', 'casual'], occ: ['daily', 'weekend'], seasons: L_SF,
    note: '워크 재킷 안에 셔츠나 티, 빈티지 데님과 부츠로 투박한 멋을 살려요.',
    roles: { outer: { s: ['f-jacket'], c: ['beige', 'indigo'] }, top: { s: ['f-shirt', 'f-tee', 'f-stripe'], c: ['white', 'blue'] }, bottom: { s: ['f-denim'], c: ['indigo', 'blue'] }, shoes: { s: ['f-boots', 'f-sneaker', 'f-loafer'], c: ['brown', 'black'] } } },
  { id: 'f-boots-fall', g: 'F', title: '니트와 부츠 가을', styles: ['casual', 'amekaji', 'classic'], occ: ['daily', 'date'], seasons: L_FW,
    note: '니트에 롱 스커트나 데님, 부츠로 가을 분위기를 내요.',
    roles: { outer: { s: ['f-trench', 'f-jacket', 'f-coat'], c: ['beige', 'brown'] }, top: { s: ['f-knit', 'f-sweat'], c: ['ivory', 'grey', 'beige'] }, bottom: { s: ['f-skirt', 'f-denim'], c: ['brown', 'black', 'indigo'] }, shoes: { s: ['f-boots'], c: ['brown', 'black'] } } },
  { id: 'f-padding-daily', g: 'F', title: '패딩 겨울 데일리', styles: ['casual', 'minimal', 'amekaji'], occ: ['daily', 'weekend'], seasons: ['winter'],
    note: '패딩에 니트와 데님으로 비율을 살리고 신발은 편하게.',
    roles: { outer: { s: ['f-padding'], c: ['black', 'ivory'] }, top: { s: ['f-knit', 'f-sweat'], c: ['ivory', 'grey'] }, bottom: { s: ['f-denim', 'f-slacks'], c: ['indigo', 'black'] }, shoes: { s: ['f-sneaker', 'f-boots'], c: ['white', 'black'] } } },
  { id: 'f-mono', g: 'F', title: '모노톤 미니멀', styles: ['minimal'], occ: ['work', 'daily', 'date'], seasons: L_SFW,
    note: '니트·슬랙스·로퍼를 같은 톤으로 맞추면 깔끔하고 길어 보여요.',
    roles: { outer: { s: ['f-coat', 'f-trench', 'f-cardigan'], c: ['charcoal', 'black', 'beige'] }, top: { s: ['f-knit', 'f-tee'], c: ['black', 'grey', 'ivory'] }, bottom: { s: ['f-slacks'], c: ['black', 'grey'] }, shoes: { s: ['f-loafer', 'f-boots'], c: ['black'] } } },
  { id: 'f-summer', g: 'F', title: '셔츠·스커트 여름', styles: ['classic', 'casual', 'minimal', 'french'], occ: ['daily', 'date', 'work'], seasons: ['summer'],
    note: '얇은 셔츠나 티에 스커트, 플랫으로 시원하게.',
    roles: { top: { s: ['f-shirt', 'f-tee', 'f-stripe'], c: ['white', 'blue'] }, bottom: { s: ['f-skirt', 'f-denim', 'f-slacks'], c: ['beige', 'blue', 'black'] }, shoes: { s: ['f-flat', 'f-sneaker'], c: ['black', 'white'] }, acc: { s: ['f-bag'], c: ['brown'] } } },
  // 여름에도 아메카지·고프코어 코디가 비지 않게 (계절별 코디 공식 검사에서 빠져 있던 조합)
  { id: 'm-amekaji-summer', g: 'M', title: '아메카지 여름', styles: ['amekaji', 'cityboy'], occ: ['weekend', 'daily'], seasons: ['summer'],
    note: '두툼한 무지 티 하나에 청바지나 치노, 캔버스 운동화와 볼캡으로 마무리해요.',
    roles: { top: { s: ['m-tee'], c: ['white', 'olive', 'navy'] }, bottom: { s: ['m-denim', 'm-chino'], c: ['indigo', 'beige'] }, shoes: { s: ['m-canvas'], c: ['ivory', 'black'] }, acc: { s: ['m-cap'], c: ['navy', 'olive'] } } },
  { id: 'm-gorp-summer', g: 'M', title: '고프코어 여름', styles: ['gorp'], occ: ['weekend', 'daily'], seasons: ['summer'],
    note: '티셔츠에 카고 팬츠와 트레일 러너를 맞추고, 볼캡으로 햇빛을 가려요.',
    roles: { top: { s: ['m-tee'], c: ['grey', 'black', 'olive'] }, bottom: { s: ['m-cargo'], c: ['black', 'olive', 'charcoal'] }, shoes: { s: ['m-trail', 'm-runner'], c: ['grey', 'black'] }, acc: { s: ['m-cap'], c: ['olive', 'black'] } } },
  { id: 'f-amekaji-summer', g: 'F', title: '아메카지 여름', styles: ['amekaji', 'casual'], occ: ['weekend', 'daily'], seasons: ['summer'],
    note: '무지나 줄무늬 티에 넉넉한 바지나 롱 스커트, 스니커즈와 큰 가방으로 편하게 입어요.',
    roles: { top: { s: ['f-tee', 'f-stripe'], c: ['white', 'navy', 'blue'] }, bottom: { s: ['f-slacks', 'f-skirt'], c: ['beige', 'olive', 'black'] }, shoes: { s: ['f-sneaker'], c: ['white', 'ivory'] }, acc: { s: ['f-bag'], c: ['beige', 'brown'] } } },
];

const ROLE_ORDER = ['outer', 'top', 'inner', 'dress', 'bottom', 'shoes', 'acc'];
const ROLE_LABEL = { outer: '아우터', top: '상의', inner: '이너', dress: '원피스', bottom: '하의', shoes: '신발', acc: '소품' };

// ── src/data/products.js
// 자동 생성 파일: app/tools/catalog/make-products.mjs 로 다시 만든다. 직접 고치지 않는다.
// 상품명·브랜드·가격·평점·후기 수·이미지는 무신사 상품 페이지와 브랜드 목록 화면에서 읽은 값이다.
// 가격은 확인 시점의 판매가이며 쿠폰·회원 할인·배송비는 반영하지 않는다. 색 일부는 상품 사진에서 짐작한 값이다.
const CATALOG = {"store":"무신사","rights":"unverified","rightsEvidence":null,"checkedAt":"2026-10-14","checkedLabel":"2026년 10월 13일~10월 14일","count":891};

const PRODUCTS = [{"id":"ms-404474","slot":"m-longtee","color":"black","colorSource":"curation","classification":"curated","brand":"브렌슨","name":"베이직 긴팔티셔츠 4종","price":19900,"img":"https://image.msscdn.net/images/goods_img/20160902/404474/404474_17917686145790_500.jpg","url":"https://www.musinsa.com/products/404474","rating":4.7,"reviews":56125,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-728000","slot":"m-oxford","color":"white","colorSource":"curation","classification":"curated","brand":"무신사 스탠다드","name":"베이식 옥스포드 셔츠 [화이트]","price":33890,"img":"https://image.msscdn.net/images/goods_img/20180305/728000/728000_17286256542856_500.jpg","url":"https://www.musinsa.com/products/728000","rating":4.7,"reviews":21040,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-854339","slot":"m-oxford","color":"blue","colorSource":"curation","classification":"curated","brand":"무신사 스탠다드","name":"릴렉스 핏 옥스포드 셔츠 [블루]","price":33890,"img":"https://image.msscdn.net/images/goods_img/20180910/854339/854339_17829578371552_500.jpg","url":"https://www.musinsa.com/products/854339","rating":4.8,"reviews":7929,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-1026638","slot":"m-chelsea","color":"brown","colorSource":"curation","classification":"curated","brand":"라반타노","name":"첼시 부츠 - 딥 브라운","price":240000,"img":"https://image.msscdn.net/images/goods_img/20190425/1026638/1026638_1_500.jpg","url":"https://www.musinsa.com/products/1026638","rating":4.5,"reviews":4,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-1115031","slot":"f-sneaker","color":"white","colorSource":"curation","classification":"curated","brand":"닥터마틴","name":"단테 - 화이트","price":84990,"img":"https://image.msscdn.net/images/goods_img/20190809/1115031/1115031_3_500.jpg","url":"https://www.musinsa.com/products/1115031","rating":4.8,"reviews":1844,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-1191521","slot":"m-knit","color":"beige","colorSource":"curation","classification":"curated","brand":"테이크이지","name":"램스울 크루넥 오버 니트 (베이지)","price":27000,"img":"https://image.msscdn.net/images/goods_img/20191017/1191521/1191521_17634466116629_500.jpg","url":"https://www.musinsa.com/products/1191521","rating":4.6,"reviews":2113,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-1387956","slot":"m-polo","color":"navy","colorSource":"curation","classification":"curated","brand":"무신사 스탠다드","name":"롱 슬리브 피케 폴로 셔츠 [네이비]","price":37890,"img":"https://image.msscdn.net/images/goods_img/20200407/1387956/1387956_1_500.jpg","url":"https://www.musinsa.com/products/1387956","rating":4.8,"reviews":622,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-1387960","slot":"m-polo","color":"black","colorSource":"curation","classification":"curated","brand":"무신사 스탠다드","name":"베이식 피케 폴로 셔츠 [블랙]","price":29900,"img":"https://image.msscdn.net/images/goods_img/20200407/1387960/1387960_17507503016609_500.jpg","url":"https://www.musinsa.com/products/1387960","rating":4.8,"reviews":6607,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-1498093","slot":"m-polo","color":"blue","colorSource":"curation","classification":"curated","brand":"폴로 랄프 로렌","name":"커스텀 슬림핏 메시 폴로 셔츠 - 블루","price":199000,"img":"https://image.msscdn.net/images/goods_img/20200626/1498093/1498093_1_500.jpg","url":"https://www.musinsa.com/products/1498093","rating":4.9,"reviews":620,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-1498103","slot":"m-oxford","color":"blue","colorSource":"curation","classification":"curated","brand":"폴로 랄프 로렌","name":"커스텀핏 버튼다운 옥스포드 셔츠 - 블루","price":259000,"img":"https://image.msscdn.net/images/goods_img/20200626/1498103/1498103_2_500.jpg","url":"https://www.musinsa.com/products/1498103","rating":4.8,"reviews":1522,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-1599217","slot":"m-knit","color":"grey","colorSource":"curation","classification":"curated","brand":"테이크이지","name":"램스울 크루넥 오버 니트 (연차콜)","price":27000,"img":"https://image.msscdn.net/images/goods_img/20200912/1599217/1599217_17634473347084_500.jpg","url":"https://www.musinsa.com/products/1599217","rating":4.7,"reviews":13419,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-1633322","slot":"m-rugby","color":"navy","colorSource":"curation","classification":"curated","brand":"무신사 스탠다드","name":"스트라이프 럭비 셔츠 [네이비/그린]","price":27890,"img":"https://image.msscdn.net/images/goods_img/20201005/1633322/1633322_1_500.jpg","url":"https://www.musinsa.com/products/1633322","rating":4.8,"reviews":1114,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-1736058","slot":"m-knit","color":"blue","colorSource":"curation","classification":"curated","brand":"테이크이지","name":"램스울 크루넥 오버 니트 (헤더블루)","price":27000,"img":"https://image.msscdn.net/images/goods_img/20210105/1736058/1736058_17634476794439_500.jpg","url":"https://www.musinsa.com/products/1736058","rating":4.8,"reviews":6259,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-1792946","slot":"m-denim-raw","color":"indigo","colorSource":"curation","classification":"curated","brand":"랩원오원","name":"생지 스트레이트 데님 팬츠 (DARK BLUE)","price":49500,"img":"https://image.msscdn.net/images/goods_img/20210215/1792946/1792946_17168804192600_500.jpg","url":"https://www.musinsa.com/products/1792946","rating":4.8,"reviews":965,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-1797622","slot":"f-blazer","color":"beige","colorSource":"curation","classification":"curated","brand":"무신사 스탠다드 우먼","name":"우먼즈 오버사이즈 블레이저 [더스티 베이지]","price":79890,"img":"https://image.msscdn.net/images/goods_img/20210217/1797622/1797622_17536902767703_500.jpg","url":"https://www.musinsa.com/products/1797622","rating":4.9,"reviews":2268,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-1836799","slot":"m-chino","color":"beige","colorSource":"curation","classification":"curated","brand":"폴로 랄프 로렌","name":"스트레치 슬림핏 치노 팬츠 - 라이트 베이지","price":199000,"img":"https://image.msscdn.net/images/goods_img/20210310/1836799/1836799_1_500.jpg","url":"https://www.musinsa.com/products/1836799","rating":4.9,"reviews":34,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-1841337","slot":"m-tee","color":"white","colorSource":"curation","classification":"curated","brand":"무신사 스탠다드","name":"헤비웨이트 릴렉스드 크루 넥 티셔츠 [화이트]","price":25900,"img":"https://image.msscdn.net/images/goods_img/20210312/1841337/1841337_2_500.jpg","url":"https://www.musinsa.com/products/1841337","rating":4.9,"reviews":2422,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-1848778","slot":"m-sweat","color":"grey","colorSource":"curation","classification":"curated","brand":"폴로 랄프 로렌","name":"플리스 크루넥 스웨트셔츠 - 그레이","price":259000,"img":"https://image.msscdn.net/images/goods_img/20210317/1848778/1848778_2_500.jpg","url":"https://www.musinsa.com/products/1848778","rating":4.9,"reviews":534,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-2086102","slot":"m-belt","color":"brown","colorSource":"curation","classification":"curated","brand":"도프제이슨","name":"미니멀 스퀘어 하드레더 벨트 (다크브라운)","price":34000,"img":"https://image.msscdn.net/images/goods_img/20210825/2086102/2086102_17171302045719_500.jpg","url":"https://www.musinsa.com/products/2086102","rating":4.8,"reviews":1156,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-2149254","slot":"m-longtee","color":"black","colorSource":"curation","classification":"curated","brand":"무신사 스탠다드","name":"베이식 긴소매 티셔츠 2팩","price":37790,"img":"https://image.msscdn.net/images/goods_img/20210928/2149254/2149254_17138588137724_500.jpg","url":"https://www.musinsa.com/products/2149254","rating":4.9,"reviews":80728,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-2321890","slot":"f-tee","color":"grey","colorSource":"curation","classification":"curated","brand":"무신사 스탠다드 우먼","name":"[쿨탠다드] 우먼즈 베이식 크루 넥 티셔츠 [미디엄 그레이]","price":15890,"img":"https://image.msscdn.net/images/goods_img/20220124/2321890/2321890_17833980710169_500.jpg","url":"https://www.musinsa.com/products/2321890","rating":4.8,"reviews":897,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-2325572","slot":"m-wax","color":"beige","colorSource":"curation","classification":"curated","brand":"론트","name":"007 Beige Wax","price":177000,"img":"https://image.msscdn.net/images/goods_img/20220125/2325572/2325572_16788446035386_500.jpg","url":"https://www.musinsa.com/products/2325572","rating":4.8,"reviews":79,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-2406919","slot":"m-oxford","color":"white","colorSource":"curation","classification":"curated","brand":"폴로 랄프 로렌","name":"[White Collection] 커스텀핏 클래식 옥스포드 셔츠 - 화이트","price":199000,"img":"https://image.msscdn.net/images/goods_img/20220308/2406919/2406919_4_500.jpg","url":"https://www.musinsa.com/products/2406919","rating":4.9,"reviews":2749,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-2422238","slot":"m-slacks","color":"black","colorSource":"curation","classification":"curated","brand":"드로우핏","name":"밴딩 와이드 슬랙스 [BLACK]","price":49800,"img":"https://image.msscdn.net/images/goods_img/20220316/2422238/2422238_17567927110795_500.jpg","url":"https://www.musinsa.com/products/2422238","rating":4.8,"reviews":5564,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-2578996","slot":"m-slacks","color":"black","colorSource":"curation","classification":"curated","brand":"시그니처","name":"더블턱 와이드 슬랙스[블랙]","price":39990,"img":"https://image.msscdn.net/images/goods_img/20220524/2578996/2578996_17870331293023_500.jpg","url":"https://www.musinsa.com/products/2578996","rating":4.8,"reviews":18706,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-2725428","slot":"f-denim","color":"indigo","colorSource":"curation","classification":"curated","brand":"무신사 스탠다드 우먼","name":"우먼즈 스트레이트 데님 팬츠 [딥 인디고]","price":34930,"img":"https://image.msscdn.net/images/goods_img/20220818/2725428/2725428_17678589908559_500.jpg","url":"https://www.musinsa.com/products/2725428","rating":4.8,"reviews":863,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-2727694","slot":"m-longtee","color":"black","colorSource":"curation","classification":"curated","brand":"크림소다랩","name":"솔리드 베이직 롱슬리브 블랙","price":18880,"img":"https://image.msscdn.net/images/goods_img/20220818/2727694/2727694_1_500.jpg","url":"https://www.musinsa.com/products/2727694","rating":4.7,"reviews":55,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-2897238","slot":"m-white-sneaker","color":"white","colorSource":"curation","classification":"curated","brand":"리복","name":"클럽 C 85 - 화이트:그린","price":44500,"img":"https://image.msscdn.net/images/goods_img/20221027/2897238/2897238_16847302834143_500.jpg","url":"https://www.musinsa.com/products/2897238","rating":4.8,"reviews":468,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-3084874","slot":"m-trucker","color":"blue","colorSource":"curation","classification":"curated","brand":"리바이스","name":"타입 I 트러커 자켓","price":149000,"img":"https://image.msscdn.net/images/goods_img/20230215/3084874/3084874_17790691437470_500.jpg","url":"https://www.musinsa.com/products/3084874","rating":4.9,"reviews":207,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-3097193","slot":"f-knit","color":"ivory","colorSource":"curation","classification":"curated","brand":"폴로 랄프 로렌","name":"W 케이블 니트 코튼 크루넥 스웨터 - 아이보리","price":279000,"img":"https://image.msscdn.net/images/goods_img/20230221/3097193/3097193_16808335747127_500.jpg","url":"https://www.musinsa.com/products/3097193","rating":4.9,"reviews":336,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-3612506","slot":"f-jacket","color":"blue","colorSource":"curation","classification":"curated","brand":"민더리","name":"BIG POCKET DENIM JACKET - INDIGO","price":226800,"img":"https://image.msscdn.net/images/goods_img/20231008/3612506/3612506_16967750511755_500.jpg","url":"https://www.musinsa.com/products/3612506","rating":null,"reviews":0,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-3665190","slot":"m-slacks","color":"grey","colorSource":"curation","classification":"curated","brand":"솔티","name":"Reve Pleats Wool Trousers (Gray)","price":168000,"img":"https://image.msscdn.net/images/goods_img/20231027/3665190/3665190_16993409859865_500.jpg","url":"https://www.musinsa.com/products/3665190","rating":4.7,"reviews":51,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-3693497","slot":"m-stripe-shirt","color":"blue","colorSource":"curation","classification":"curated","brand":"매너그램","name":"옥스포드 코튼다운 스탠다드 셔츠 스트라이프","price":144000,"img":"https://image.msscdn.net/images/goods_img/20231108/3693497/3693497_16994015235516_500.jpg","url":"https://www.musinsa.com/products/3693497","rating":null,"reviews":0,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-3731476","slot":"f-loafer","color":"black","colorSource":"curation","classification":"curated","brand":"커스텀에이드 우먼","name":"4.5cm 라운드토 청키 페니로퍼 몬드","price":41360,"img":"https://image.msscdn.net/images/goods_img/20231124/3731476/3731476_17664702504222_500.jpg","url":"https://www.musinsa.com/products/3731476","rating":4.6,"reviews":48,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-3757147","slot":"m-work-pants","color":"olive","colorSource":"curation","classification":"curated","brand":"무신사 스탠다드","name":"레플리카 퍼티그 팬츠 [올리브]","price":43890,"img":"https://image.msscdn.net/images/goods_img/20231215/3757147/3757147_17827087342061_500.jpg","url":"https://www.musinsa.com/products/3757147","rating":4.9,"reviews":2007,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-3779117","slot":"m-denim-raw","color":"indigo","colorSource":"curation","classification":"curated","brand":"무신사 스탠다드","name":"셀비지 스트레이트 데님 팬츠 [딥 인디고]","price":62890,"img":"https://image.msscdn.net/images/goods_img/20240105/3779117/3779117_17421805923099_500.jpg","url":"https://www.musinsa.com/products/3779117","rating":4.7,"reviews":266,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-3792520","slot":"m-work-pants","color":"olive","colorSource":"curation","classification":"curated","brand":"아웃스탠딩","name":"BACK SATIN FATIGUE PANTS(ORIGINAL FIT) OLIVE GREEN","price":97200,"img":"https://image.msscdn.net/images/goods_img/20240112/3792520/3792520_17691436496368_500.jpg","url":"https://www.musinsa.com/products/3792520","rating":4.9,"reviews":357,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-3821705","slot":"f-cardigan","color":"grey","colorSource":"curation","classification":"curated","brand":"로라로라","name":"V NECK BASIC CARDIGAN GRAY","price":62100,"img":"https://image.msscdn.net/images/goods_img/20240125/3821705/3821705_17086551793917_500.jpg","url":"https://www.musinsa.com/products/3821705","rating":4.9,"reviews":1171,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-3830417","slot":"m-belt","color":"brown","colorSource":"curation","classification":"curated","brand":"미나브","name":"미니멀 리얼 레더 벨트 [브라운]","price":31200,"img":"https://image.msscdn.net/images/goods_img/20240129/3830417/3830417_17194485746743_500.jpg","url":"https://www.musinsa.com/products/3830417","rating":4.8,"reviews":894,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-3879282","slot":"m-oxford","color":"blue","colorSource":"curation","classification":"curated","brand":"토마스모어","name":"옥스포드 버튼다운 셔츠","price":50960,"img":"https://image.msscdn.net/images/goods_img/20240219/3879282/3879282_17439950180780_500.jpg","url":"https://www.musinsa.com/products/3879282","rating":4.9,"reviews":783,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-3911166","slot":"f-loafer","color":"black","colorSource":"curation","classification":"curated","brand":"솔트앤초콜릿","name":"라운드 토 페니 로퍼 (3.7cm)","price":66750,"img":"https://image.msscdn.net/images/goods_img/20240228/3911166/3911166_17726009232219_500.png","url":"https://www.musinsa.com/products/3911166","rating":4.7,"reviews":168,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-3976350","slot":"m-white-sneaker","color":"white","colorSource":"curation","classification":"curated","brand":"나이키","name":"에어 포스 1 07 M - 화이트","price":149000,"img":"https://image.msscdn.net/images/goods_img/20240321/3976350/3976350_17115804993997_500.jpg","url":"https://www.musinsa.com/products/3976350","rating":4.9,"reviews":11054,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-3998376","slot":"m-derby","color":"black","colorSource":"curation","classification":"curated","brand":"조셉트","name":"VINCENT BLACK [VIBRAM]","price":136000,"img":"https://image.msscdn.net/images/goods_img/20240327/3998376/3998376_17133408545190_500.jpg","url":"https://www.musinsa.com/products/3998376","rating":4.9,"reviews":122,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-4100432","slot":"m-loafer","color":"brown","colorSource":"curation","classification":"curated","brand":"락포트","name":"클래식 로퍼 페니 CLASSIC LOAFER PENNY","price":157500,"img":"https://image.msscdn.net/images/goods_img/20240502/4100432/4100432_17291216752295_500.jpg","url":"https://www.musinsa.com/products/4100432","rating":4.9,"reviews":46,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-4209292","slot":"m-balmacaan","color":"beige","colorSource":"curation","classification":"curated","brand":"무신사 스탠다드","name":"캐시미어 블렌드 오버사이즈 미니멀 발마칸 코트 [토프]","price":218390,"img":"https://image.msscdn.net/images/goods_img/20240620/4209292/4209292_17364968941519_500.jpg","url":"https://www.musinsa.com/products/4209292","rating":4.9,"reviews":181,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-4299742","slot":"f-jacket","color":"blue","colorSource":"curation","classification":"curated","brand":"리","name":"우먼 데님 자켓 인디고 미듐","price":45000,"img":"https://image.msscdn.net/images/goods_img/20240806/4299742/4299742_17285443843873_500.jpg","url":"https://www.musinsa.com/products/4299742","rating":5,"reviews":11,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-4299875","slot":"f-dress","color":"navy","colorSource":"curation","classification":"curated","brand":"리","name":"셔츠 롱 원피스 인디고 로우","price":35000,"img":"https://image.msscdn.net/images/goods_img/20240806/4299875/4299875_17261035787160_500.jpg","url":"https://www.musinsa.com/products/4299875","rating":5,"reviews":9,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-4305642","slot":"m-chore","color":"navy","colorSource":"curation","classification":"curated","brand":"드로우핏","name":"가르니 포켓 초어 자켓 [NAVY]","price":118400,"img":"https://image.msscdn.net/images/goods_img/20240807/4305642/4305642_17235239854033_500.jpg","url":"https://www.musinsa.com/products/4305642","rating":4.7,"reviews":30,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-4333594","slot":"m-tee","color":"white","colorSource":"curation","classification":"curated","brand":"유나이티드 애슬","name":"9.1oz 헤비 듀티 반팔 티셔츠 화이트","price":22900,"img":"https://image.msscdn.net/images/goods_img/20240815/4333594/4333594_17846157967516_500.png","url":"https://www.musinsa.com/products/4333594","rating":4.9,"reviews":28,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-4350295","slot":"m-cardigan","color":"black","colorSource":"curation","classification":"curated","brand":"쿠어","name":"탑필 울 V넥 가디건 (블랙)","price":93600,"img":"https://image.msscdn.net/images/goods_img/20240820/4350295/4350295_17242418596924_500.jpg","url":"https://www.musinsa.com/products/4350295","rating":4.9,"reviews":118,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-4373644","slot":"m-slacks","color":"grey","colorSource":"curation","classification":"curated","brand":"넌블랭크","name":"울 플란넬 세미 와이드 핏 슬랙스 DARK GREY","price":81000,"img":"https://image.msscdn.net/images/goods_img/20240827/4373644/4373644_17249329636328_500.png","url":"https://www.musinsa.com/products/4373644","rating":4.8,"reviews":52,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-4386834","slot":"f-stripe","color":"blue","colorSource":"curation","classification":"curated","brand":"미드나잇 무브","name":"st shirt [blue]","price":28200,"img":"https://image.msscdn.net/images/goods_img/20240829/4386834/4386834_17249281786829_500.jpg","url":"https://www.musinsa.com/products/4386834","rating":4.8,"reviews":38,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-4400132","slot":"m-cap","color":"beige","colorSource":"curation","classification":"curated","brand":"비버리힐스 폴로클럽","name":"남여 공용 코튼 치노 베이스 볼캡","price":23910,"img":"https://image.msscdn.net/images/goods_img/20240903/4400132/4400132_17434819960424_500.jpg","url":"https://www.musinsa.com/products/4400132","rating":4.8,"reviews":348,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-4404223","slot":"m-denim-raw","color":"indigo","colorSource":"curation","classification":"curated","brand":"리바이스","name":"501® 오리지널 RIGID 진","price":99000,"img":"https://image.msscdn.net/images/goods_img/20240904/4404223/4404223_17254355347324_500.jpg","url":"https://www.musinsa.com/products/4404223","rating":4.8,"reviews":551,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-4462506","slot":"m-derby","color":"black","colorSource":"curation","classification":"curated","brand":"금강","name":"리차드 남성 플레인토 더비 구두","price":87000,"img":"https://image.msscdn.net/images/goods_img/20240925/4462506/4462506_17760634728669_500.jpg","url":"https://www.musinsa.com/products/4462506","rating":5,"reviews":16,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-4468621","slot":"m-rugby","color":"red","colorSource":"curation","classification":"curated","brand":"챔피온","name":"리버스위브 럭비 스웨트셔츠 Normal Red","price":58000,"img":"https://image.msscdn.net/images/goods_img/20240926/4468621/4468621_17472061469597_500.jpg","url":"https://www.musinsa.com/products/4468621","rating":5,"reviews":2,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-4511861","slot":"m-slacks","color":"grey","colorSource":"curation","classification":"curated","brand":"시그니처","name":"울 라이크 노턱 와이드핏 슬랙스[그레이]","price":41900,"img":"https://image.msscdn.net/images/goods_img/20241014/4511861/4511861_17297729267359_500.jpg","url":"https://www.musinsa.com/products/4511861","rating":4.9,"reviews":27,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-4537762","slot":"m-white-sneaker","color":"white","colorSource":"curation","classification":"curated","brand":"무신사 스탠다드","name":"클래식 트레이너 스니커즈 [화이트]","price":79900,"img":"https://image.msscdn.net/images/goods_img/20241021/4537762/4537762_17326065570562_500.jpg","url":"https://www.musinsa.com/products/4537762","rating":5,"reviews":44,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-4593967","slot":"f-trench","color":"beige","colorSource":"curation","classification":"curated","brand":"무신사 스탠다드 우먼","name":"우먼즈 오버사이즈 싱글 트렌치 코트 [라이트 베이지]","price":97930,"img":"https://image.msscdn.net/images/goods_img/20241106/4593967/4593967_17368476607026_500.jpg","url":"https://www.musinsa.com/products/4593967","rating":4.7,"reviews":64,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-4594017","slot":"m-trench","color":"black","colorSource":"curation","classification":"curated","brand":"무신사 스탠다드","name":"오버사이즈 발마칸 트렌치 코트 [블랙]","price":139900,"img":"https://image.msscdn.net/images/goods_img/20241106/4594017/4594017_17369119667186_500.jpg","url":"https://www.musinsa.com/products/4594017","rating":4.9,"reviews":130,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-4619956","slot":"f-blazer","color":"black","colorSource":"curation","classification":"curated","brand":"무신사 스탠다드 우먼","name":"우먼즈 레귤러 핏 3버튼 블레이저 [블랙]","price":99900,"img":"https://image.msscdn.net/images/goods_img/20241118/4619956/4619956_17836670737424_500.jpg","url":"https://www.musinsa.com/products/4619956","rating":4.9,"reviews":106,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-4645906","slot":"m-chino","color":"beige","colorSource":"curation","classification":"curated","brand":"메르고","name":"노스트 와이드 치노 팬츠 [베이지]","price":39200,"img":"https://image.msscdn.net/images/goods_img/20241202/4645906/4645906_17630184287449_500.jpg","url":"https://www.musinsa.com/products/4645906","rating":4.7,"reviews":121,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-4672683","slot":"f-stripe","color":"grey","colorSource":"curation","classification":"curated","brand":"무신사 스탠다드 우먼","name":"우먼즈 스트라이프 슬림 핏 셔츠 [그레이]","price":35890,"img":"https://image.msscdn.net/images/goods_img/20241219/4672683/4672683_17467725059023_500.jpg","url":"https://www.musinsa.com/products/4672683","rating":4.8,"reviews":135,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-4681684","slot":"f-loafer","color":"black","colorSource":"curation","classification":"curated","brand":"질바이질스튜어트","name":"[알렌] 슬림 라운드 베이직 로퍼","price":54000,"img":"https://image.msscdn.net/images/goods_img/20241226/4681684/4681684_17358807539230_500.jpg","url":"https://www.musinsa.com/products/4681684","rating":4.5,"reviews":18,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-4705635","slot":"m-flannel","color":"green","colorSource":"curation","classification":"curated","brand":"리메인세컨드","name":"레트로 오버핏 코튼 플란넬 포켓 체크 셔츠 [그린]","price":32500,"img":"https://image.msscdn.net/images/goods_img/20250108/4705635/4705635_17670774272725_500.jpg","url":"https://www.musinsa.com/products/4705635","rating":4.8,"reviews":1261,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-4727091","slot":"m-runner","color":"grey","colorSource":"curation","classification":"curated","brand":"뉴발란스","name":"530 스니커즈 (실버)","price":129000,"img":"https://image.msscdn.net/images/goods_img/20250117/4727091/4727091_17593636262078_500.jpg","url":"https://www.musinsa.com/products/4727091","rating":4.9,"reviews":794,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-4727100","slot":"m-runner","color":"grey","colorSource":"curation","classification":"curated","brand":"뉴발란스","name":"530 스니커즈 (그레이)","price":139000,"img":"https://image.msscdn.net/images/goods_img/20250117/4727100/4727100_17593635377879_500.jpg","url":"https://www.musinsa.com/products/4727100","rating":4.9,"reviews":545,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-4740635","slot":"m-trench","color":"beige","colorSource":"curation","classification":"curated","brand":"지오다노","name":"트렌치코트","price":95000,"img":"https://image.msscdn.net/images/goods_img/20250123/4740635/4740635_17376198970143_500.jpg","url":"https://www.musinsa.com/products/4740635","rating":4.8,"reviews":40,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-4751649","slot":"m-trucker","color":"blue","colorSource":"curation","classification":"curated","brand":"리바이스","name":"타입 II 트러커 자켓","price":144000,"img":"https://image.msscdn.net/images/goods_img/20250203/4751649/4751649_17581573633050_500.jpg","url":"https://www.musinsa.com/products/4751649","rating":4.4,"reviews":38,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-4766707","slot":"f-tee","color":"white","colorSource":"curation","classification":"curated","brand":"라이크더모스트","name":"U 라운드 베이직 롱 슬리브 티셔츠 화이트","price":16720,"img":"https://image.msscdn.net/images/goods_img/20250207/4766707/4766707_17394074036533_500.jpg","url":"https://www.musinsa.com/products/4766707","rating":4.4,"reviews":119,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-4789185","slot":"f-blazer","color":"black","colorSource":"curation","classification":"curated","brand":"탑텐","name":"오버핏 테일러드 재킷","price":35900,"img":"https://image.msscdn.net/images/goods_img/20250214/4789185/4789185_17395063416272_500.jpg","url":"https://www.musinsa.com/products/4789185","rating":4.9,"reviews":19,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-4791368","slot":"m-chore","color":"blue","colorSource":"curation","classification":"curated","brand":"무신사 스탠다드","name":"백 사틴 쇼트 초어 재킷 [프렌치 블루]","price":53890,"img":"https://image.msscdn.net/images/goods_img/20250214/4791368/4791368_17411643727029_500.jpg","url":"https://www.musinsa.com/products/4791368","rating":4.6,"reviews":31,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-4797720","slot":"f-sneaker","color":"white","colorSource":"curation","classification":"curated","brand":"뉴발란스","name":"740 스니커즈 (화이트·네이비)","price":149000,"img":"https://image.msscdn.net/images/goods_img/20250218/4797720/4797720_17411596402542_500.jpg","url":"https://www.musinsa.com/products/4797720","rating":4.9,"reviews":694,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-4893307","slot":"f-tee","color":"white","colorSource":"curation","classification":"curated","brand":"비버리힐스 폴로클럽","name":"베이직 코튼 반팔티","price":24900,"img":"https://image.msscdn.net/images/goods_img/20250313/4893307/4893307_17471996325851_500.jpg","url":"https://www.musinsa.com/products/4893307","rating":4.8,"reviews":67,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-4982765","slot":"m-stripe-shirt","color":"blue","colorSource":"curation","classification":"curated","brand":"에잇세컨즈","name":"클린 스트라이프 버튼다운 셔츠 스카이 블루","price":29900,"img":"https://image.msscdn.net/images/goods_img/20250403/4982765/4982765_17436548618271_500.jpg","url":"https://www.musinsa.com/products/4982765","rating":4.9,"reviews":14,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-5065864","slot":"f-dress","color":"blue","colorSource":"curation","classification":"curated","brand":"제로스트릿","name":"소프트 셔츠 원피스","price":78000,"img":"https://image.msscdn.net/images/goods_img/20250425/5065864/5065864_17876439513226_500.jpg","url":"https://www.musinsa.com/products/5065864","rating":4.9,"reviews":84,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-5260947","slot":"m-stripe-shirt","color":"blue","colorSource":"curation","classification":"curated","brand":"유니폼브릿지","name":"button down oxford shirt blue stripe","price":69900,"img":"https://image.msscdn.net/images/goods_img/20250721/5260947/5260947_17530970184336_500.jpg","url":"https://www.musinsa.com/products/5260947","rating":5,"reviews":8,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-5310832","slot":"m-chore","color":"navy","colorSource":"curation","classification":"curated","brand":"프리즘웍스","name":"COMBINE CHORE JACKET NAVY","price":82800,"img":"https://image.msscdn.net/images/goods_img/20250811/5310832/5310832_17556798223193_500.jpg","url":"https://www.musinsa.com/products/5310832","rating":4.9,"reviews":21,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-5316168","slot":"m-blazer","color":"navy","colorSource":"curation","classification":"curated","brand":"아웃스탠딩","name":"HIGH DENSITY COTTON CLASSIC 3-BUTTON JACKET NAVY","price":133200,"img":"https://image.msscdn.net/images/goods_img/20250812/5316168/5316168_17688037123838_500.jpg","url":"https://www.musinsa.com/products/5316168","rating":4.8,"reviews":85,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-5316898","slot":"m-trench","color":"navy","colorSource":"curation","classification":"curated","brand":"엘무드","name":"레이븐 오버사이즈 트렌치 코트 다크 네이비","price":180000,"img":"https://image.msscdn.net/images/goods_img/20250812/5316898/5316898_17706376947547_500.png","url":"https://www.musinsa.com/products/5316898","rating":4.9,"reviews":11,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-5321121","slot":"f-sneaker","color":"brown","colorSource":"curation","classification":"curated","brand":"아디다스","name":"가젤 로우 프로 - 다크브라운:크림화이트","price":75990,"img":"https://image.msscdn.net/images/goods_img/20250813/5321121/5321121_17555052123912_500.jpg","url":"https://www.musinsa.com/products/5321121","rating":4.9,"reviews":283,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-5335741","slot":"m-flannel","color":"black","colorSource":"curation","classification":"curated","brand":"무신사 스탠다드","name":"릴렉스드 플란넬 옴브레 체크 셔츠 [블랙/아이보리]","price":56890,"img":"https://image.msscdn.net/images/goods_img/20250819/5335741/5335741_17574816540164_500.jpg","url":"https://www.musinsa.com/products/5335741","rating":4.9,"reviews":336,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-5380360","slot":"m-sweat","color":"grey","colorSource":"curation","classification":"curated","brand":"챔피온","name":"리버스위브 루즈핏 기모 크루넥 스웨트셔츠 Light Grey","price":76300,"img":"https://image.msscdn.net/images/goods_img/20250829/5380360/5380360_17567098167411_500.jpg","url":"https://www.musinsa.com/products/5380360","rating":5,"reviews":7,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-5402401","slot":"f-cardigan","color":"ivory","colorSource":"curation","classification":"curated","brand":"커스텀어클락 우먼","name":"베이직 브이넥 가디건","price":44800,"img":"https://image.msscdn.net/images/goods_img/20250904/5402401/5402401_17896994534510_500.jpg","url":"https://www.musinsa.com/products/5402401","rating":4.6,"reviews":41,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-5596303","slot":"m-balmacaan","color":"beige","colorSource":"curation","classification":"curated","brand":"무드인사이드","name":"오버핏 울 발마칸 코트","price":89900,"img":"https://image.msscdn.net/images/goods_img/20251015/5596303/5596303_17605142526875_500.jpg","url":"https://www.musinsa.com/products/5596303","rating":4.6,"reviews":15,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-5657916","slot":"f-stripe","color":"blue","colorSource":"curation","classification":"curated","brand":"무신사 스탠다드 우먼","name":"우먼즈 스트라이프 릴렉스드 포플린 셔츠 [스카이 블루]","price":39900,"img":"https://image.msscdn.net/images/goods_img/20251029/5657916/5657916_17718885510368_500.jpg","url":"https://www.musinsa.com/products/5657916","rating":4.8,"reviews":95,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-5676361","slot":"m-cable","color":"ivory","colorSource":"curation","classification":"curated","brand":"유라이프지","name":"베이직 꽈배기 케이블 라운드넥 니트","price":27300,"img":"https://image.msscdn.net/images/goods_img/20251103/5676361/5676361_17894508833494_500.jpg","url":"https://www.musinsa.com/products/5676361","rating":4.8,"reviews":11,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-5721297","slot":"f-trench","color":"ivory","colorSource":"curation","classification":"curated","brand":"무신사 스탠다드 우먼","name":"우먼즈 싱글 하프 트렌치 코트 [크림]","price":110390,"img":"https://image.msscdn.net/images/goods_img/20251112/5721297/5721297_17683717856571_500.jpg","url":"https://www.musinsa.com/products/5721297","rating":4.8,"reviews":39,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-5759484","slot":"m-cable","color":"navy","colorSource":"curation","classification":"curated","brand":"오리지널데이","name":"오버핏 라운드 케이블 니트 Navy","price":35900,"img":"https://image.msscdn.net/images/goods_img/20251120/5759484/5759484_17652518707229_500.jpg","url":"https://www.musinsa.com/products/5759484","rating":null,"reviews":0,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-5797030","slot":"f-denim","color":"indigo","colorSource":"curation","classification":"curated","brand":"로우그","name":"로우 스탠다드 데님 팬츠 인디고","price":44800,"img":"https://image.msscdn.net/images/goods_img/20251202/5797030/5797030_17678521713507_500.jpg","url":"https://www.musinsa.com/products/5797030","rating":4.8,"reviews":18,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-5803563","slot":"m-canvas","color":"ivory","colorSource":"curation","classification":"curated","brand":"컨버스","name":"척 70 헤이 데이","price":47500,"img":"https://image.msscdn.net/images/goods_img/20251204/5803563/5803563_17652623372667_500.jpg","url":"https://www.musinsa.com/products/5803563","rating":4.9,"reviews":24,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-5803578","slot":"m-canvas","color":"ivory","colorSource":"curation","classification":"curated","brand":"컨버스","name":"척 70 타임 어게인","price":47500,"img":"https://image.msscdn.net/images/goods_img/20251204/5803578/5803578_17652624179585_500.jpg","url":"https://www.musinsa.com/products/5803578","rating":4.8,"reviews":28,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-5828029","slot":"f-denim","color":"blue","colorSource":"curation","classification":"curated","brand":"스파오","name":"스트레이트 진","price":24900,"img":"https://image.msscdn.net/images/goods_img/20251215/5828029/5828029_17725111490909_500.jpg","url":"https://www.musinsa.com/products/5828029","rating":4.8,"reviews":77,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-5862870","slot":"m-loafer","color":"brown","colorSource":"curation","classification":"curated","brand":"무신사 스탠다드","name":"스웨이드 클래식 페니 로퍼 [다크 브라운]","price":109900,"img":"https://image.msscdn.net/images/goods_img/20251231/5862870/5862870_17701040143553_500.jpg","url":"https://www.musinsa.com/products/5862870","rating":4.7,"reviews":34,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-5880911","slot":"f-stripe","color":"blue","colorSource":"curation","classification":"curated","brand":"제너럴아이디어","name":"클래식 스트라이프 리벳 셔츠 [BLUE]","price":40000,"img":"https://image.msscdn.net/images/goods_img/20260109/5880911/5880911_17679286650554_500.jpg","url":"https://www.musinsa.com/products/5880911","rating":4.8,"reviews":26,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-5897707","slot":"m-blazer","color":"navy","colorSource":"curation","classification":"curated","brand":"포터리","name":"Washed Sports Jacket","price":298000,"img":"https://image.msscdn.net/images/goods_img/20260115/5897707/5897707_17688169806581_500.jpg","url":"https://www.musinsa.com/products/5897707","rating":4.9,"reviews":20,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-5921050","slot":"f-shirt","color":"white","colorSource":"curation","classification":"curated","brand":"수아레 우먼","name":"퓨어 코튼 스탠다드 셔츠","price":29900,"img":"https://image.msscdn.net/images/goods_img/20260121/5921050/5921050_17702555304736_500.jpg","url":"https://www.musinsa.com/products/5921050","rating":null,"reviews":0,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-5977410","slot":"m-harrington","color":"olive","colorSource":"curation","classification":"curated","brand":"무븐","name":"2WAY 코튼 해링턴 자켓 카키","price":67800,"img":"https://image.msscdn.net/images/goods_img/20260204/5977410/5977410_17715691533916_500.jpg","url":"https://www.musinsa.com/products/5977410","rating":5,"reviews":3,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-5977417","slot":"m-loafer","color":"brown","colorSource":"curation","classification":"curated","brand":"슈펜","name":"[올데이] 베이직 캐주얼 페니 로퍼","price":44910,"img":"https://image.msscdn.net/images/goods_img/20260204/5977417/5977417_17701628965625_500.jpg","url":"https://www.musinsa.com/products/5977417","rating":5,"reviews":13,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-5977558","slot":"m-chelsea","color":"brown","colorSource":"curation","classification":"curated","brand":"비에스큐티바이클래시","name":"모티 스플릿 스웨이드 첼시 부츠","price":110200,"img":"https://image.msscdn.net/images/goods_img/20260204/5977558/5977558_17701665377221_500.jpg","url":"https://www.musinsa.com/products/5977558","rating":null,"reviews":0,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-6101998","slot":"m-blazer","color":"navy","colorSource":"curation","classification":"curated","brand":"수아레","name":"린넨 싱글 블레이저 셋업 네이비","price":79900,"img":"https://image.msscdn.net/images/goods_img/20260309/6101998/6101998_17739852939208_500.jpg","url":"https://www.musinsa.com/products/6101998","rating":4.9,"reviews":21,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-6102472","slot":"m-chelsea","color":"brown","colorSource":"curation","classification":"curated","brand":"에렌","name":"폴 첼시 부츠 (딥브라운 스웨이드)","price":167700,"img":"https://image.msscdn.net/images/goods_img/20260309/6102472/6102472_17730964164054_500.jpg","url":"https://www.musinsa.com/products/6102472","rating":null,"reviews":0,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-6116333","slot":"m-cap","color":"beige","colorSource":"curation","classification":"curated","brand":"폴로 랄프 로렌","name":"스트레치 코튼 트윌 볼 캡-라이트 베이지","price":69300,"img":"https://image.msscdn.net/images/goods_img/20260311/6116333/6116333_17762338142995_500.jpg","url":"https://www.musinsa.com/products/6116333","rating":4.9,"reviews":51,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-6191112","slot":"m-chino","color":"brown","colorSource":"curation","classification":"curated","brand":"디키즈","name":"오리지널 874 워크팬츠 Khaki Brown","price":50200,"img":"https://image.msscdn.net/images/goods_img/20260325/6191112/6191112_17751957878882_500.jpg","url":"https://www.musinsa.com/products/6191112","rating":4.8,"reviews":47,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-6257542","slot":"m-oxford","color":"blue","colorSource":"curation","classification":"curated","brand":"폴로 랄프 로렌","name":"커스텀핏 가먼트 다이 옥스포드 셔츠-블루","price":219000,"img":"https://image.msscdn.net/images/goods_img/20260406/6257542/6257542_17767340522278_500.jpg","url":"https://www.musinsa.com/products/6257542","rating":4.9,"reviews":13,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-6341386","slot":"f-knit","color":"ivory","colorSource":"curation","classification":"curated","brand":"무신사 스탠다드 우먼","name":"우먼즈 에센셜 라운드 넥 니트 [버터 크림]","price":39900,"img":"https://image.msscdn.net/images/goods_img/20260420/6341386/6341386_17912723115878_500.jpg","url":"https://www.musinsa.com/products/6341386","rating":4.9,"reviews":42,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-6365296","slot":"m-chino","color":"beige","colorSource":"curation","classification":"curated","brand":"애습","name":"에센셜 와이드 치노 팬츠 - 워시드 베이지","price":69300,"img":"https://image.msscdn.net/images/goods_img/20260423/6365296/6365296_17769256748759_500.jpg","url":"https://www.musinsa.com/products/6365296","rating":4.8,"reviews":93,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-6397616","slot":"f-slacks","color":"black","colorSource":"curation","classification":"curated","brand":"스파오","name":"와이드 핀턱 팬츠","price":24900,"img":"https://image.msscdn.net/images/goods_img/20260429/6397616/6397616_17774278485947_500.jpg","url":"https://www.musinsa.com/products/6397616","rating":5,"reviews":1,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-6433549","slot":"f-tee","color":"white","colorSource":"curation","classification":"curated","brand":"누아트 스튜디오","name":"우먼 솔리드 반팔 티셔츠","price":19880,"img":"https://image.msscdn.net/images/goods_img/20260507/6433549/6433549_17803848151818_500.jpg","url":"https://www.musinsa.com/products/6433549","rating":4.7,"reviews":73,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-6450015","slot":"f-denim","color":"blue","colorSource":"curation","classification":"curated","brand":"무신사 스탠다드 우먼","name":"우먼즈 에센셜 스트레이트 데님 팬츠 [미디엄 인디고]","price":42390,"img":"https://image.msscdn.net/images/goods_img/20260511/6450015/6450015_17847017970466_500.jpg","url":"https://www.musinsa.com/products/6450015","rating":4.8,"reviews":67,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-6604456","slot":"f-knit","color":"grey","colorSource":"curation","classification":"curated","brand":"무신사 스탠다드 우먼","name":"우먼즈 레이어드 크루 넥 니트 [미디엄 그레이]","price":45900,"img":"https://image.msscdn.net/images/goods_img/20260604/6604456/6604456_17888514551185_500.jpg","url":"https://www.musinsa.com/products/6604456","rating":4.9,"reviews":40,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-6617040","slot":"m-polo","color":"black","colorSource":"curation","classification":"curated","brand":"폴로 랄프 로렌","name":"커스텀 슬림핏 메시 폴로 셔츠-블랙","price":199000,"img":"https://image.msscdn.net/images/goods_img/20260605/6617040/6617040_17809723322197_500.jpg","url":"https://www.musinsa.com/products/6617040","rating":4.9,"reviews":107,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-6625270","slot":"m-canvas","color":"ivory","colorSource":"curation","classification":"curated","brand":"컨버스","name":"척 70 X 파치먼트","price":105000,"img":"https://image.msscdn.net/images/goods_img/20260608/6625270/6625270_17823660925027_500.jpg","url":"https://www.musinsa.com/products/6625270","rating":5,"reviews":14,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-6625301","slot":"m-canvas","color":"ivory","colorSource":"curation","classification":"curated","brand":"컨버스","name":"척 70 X 파치먼트","price":99000,"img":"https://image.msscdn.net/images/goods_img/20260608/6625301/6625301_17827819149323_500.jpg","url":"https://www.musinsa.com/products/6625301","rating":4.8,"reviews":18,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-6710477","slot":"m-sweat","color":"grey","colorSource":"curation","classification":"curated","brand":"무신사 스탠다드","name":"오버사이즈 스웨트셔츠 [미디엄 그레이]","price":39900,"img":"https://image.msscdn.net/images/goods_img/20260622/6710477/6710477_17852886369999_500.jpg","url":"https://www.musinsa.com/products/6710477","rating":4.9,"reviews":28,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-6769967","slot":"f-skirt","color":"ivory","colorSource":"curation","classification":"curated","brand":"미쏘","name":"셔링밴딩 롱 스커트","price":41930,"img":"https://image.msscdn.net/images/goods_img/20260702/6769967/6769967_17858948019524_500.jpg","url":"https://www.musinsa.com/products/6769967","rating":4.7,"reviews":6,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-6849481","slot":"f-slacks","color":"beige","colorSource":"curation","classification":"curated","brand":"무신사 스탠다드 우먼","name":"우먼즈 브러쉬드 딥 턱 와이드 슬랙스 [토프]","price":59900,"img":"https://image.msscdn.net/images/goods_img/20260715/6849481/6849481_17907490179255_500.jpg","url":"https://www.musinsa.com/products/6849481","rating":5,"reviews":1,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-6967992","slot":"m-field","color":"olive","colorSource":"curation","classification":"curated","brand":"디키즈","name":"워시드 M-65 필드 재킷 Olive","price":189000,"img":"https://image.msscdn.net/images/goods_img/20260731/6967992/6967992_17888558736598_500.jpg","url":"https://www.musinsa.com/products/6967992","rating":5,"reviews":1,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-6969017","slot":"f-padding","color":"white","colorSource":"curation","classification":"curated","brand":"스파오","name":"후드 푸퍼","price":79900,"img":"https://image.msscdn.net/images/goods_img/20260731/6969017/6969017_17865164599493_500.jpg","url":"https://www.musinsa.com/products/6969017","rating":null,"reviews":0,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-7008627","slot":"m-wax","color":"black","colorSource":"curation","classification":"curated","brand":"후브스","name":"디파이언트 왁스 자켓[브라운]","price":129600,"img":"https://image.msscdn.net/images/goods_img/20260806/7008627/7008627_17878192040292_500.jpg","url":"https://www.musinsa.com/products/7008627","rating":null,"reviews":0,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-7061876","slot":"f-cardigan","color":"blue","colorSource":"curation","classification":"curated","brand":"세터","name":"로렌 울 블렌드 크루넥 니트 가디건 블루","price":179000,"img":"https://image.msscdn.net/images/goods_img/20260812/7061876/7061876_17877321027169_500.jpg","url":"https://www.musinsa.com/products/7061876","rating":null,"reviews":0,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-7078618","slot":"m-cable","color":"grey","colorSource":"curation","classification":"curated","brand":"폴로 랄프 로렌","name":"케이블 니트 코튼 스웨터-그레이","price":299000,"img":"https://image.msscdn.net/images/goods_img/20260814/7078618/7078618_17884143498889_500.jpg","url":"https://www.musinsa.com/products/7078618","rating":5,"reviews":5,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-7082725","slot":"f-dress","color":"black","colorSource":"curation","classification":"curated","brand":"어반드레스","name":"세렌 포그 카라 롱 슬리브 원피스 BLACK","price":65600,"img":"https://image.msscdn.net/images/goods_img/20260814/7082725/7082725_17873006929377_500.jpg","url":"https://www.musinsa.com/products/7082725","rating":null,"reviews":0,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-7094069","slot":"f-coat","color":"grey","colorSource":"curation","classification":"curated","brand":"스파오","name":"[울블렌드] 하프 코트","price":99900,"img":"https://image.msscdn.net/images/goods_img/20260818/7094069/7094069_17890196443828_500.jpg","url":"https://www.musinsa.com/products/7094069","rating":5,"reviews":3,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-7122764","slot":"m-balmacaan","color":"beige","colorSource":"curation","classification":"curated","brand":"트릴리온","name":"캐시미어 울 발마칸 롱 코트","price":179000,"img":"https://image.msscdn.net/images/goods_img/20260820/7122764/7122764_17896282370611_500.jpg","url":"https://www.musinsa.com/products/7122764","rating":null,"reviews":0,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-7144756","slot":"f-stripe","color":"blue","colorSource":"curation","classification":"curated","brand":"어반드레스","name":"듄 스트라이프 슬림핏 셔츠","price":49600,"img":"https://image.msscdn.net/images/goods_img/20260824/7144756/7144756_17875505583851_500.jpg","url":"https://www.musinsa.com/products/7144756","rating":5,"reviews":3,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-7147517","slot":"m-work-pants","color":"olive","colorSource":"curation","classification":"curated","brand":"오어슬로우","name":"SUMMER FATIGUE PANTS (GREEN M16)","price":279000,"img":"https://image.msscdn.net/images/goods_img/20260824/7147517/7147517_17883364399108_500.jpg","url":"https://www.musinsa.com/products/7147517","rating":5,"reviews":2,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-7156511","slot":"f-coat","color":"grey","colorSource":"curation","classification":"curated","brand":"애즈온","name":"MARLOW HIGH NECK COAT / CHARCOAL","price":215000,"img":"https://image.msscdn.net/images/goods_img/20260825/7156511/7156511_17909098274334_500.jpg","url":"https://www.musinsa.com/products/7156511","rating":null,"reviews":0,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-7178856","slot":"f-shirt","color":"white","colorSource":"curation","classification":"curated","brand":"더바넷","name":"Dain Cotton Shirt White","price":98100,"img":"https://image.msscdn.net/images/goods_img/20260827/7178856/7178856_17884259602341_500.jpg","url":"https://www.musinsa.com/products/7178856","rating":null,"reviews":0,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-7219229","slot":"f-padding","color":"grey","colorSource":"curation","classification":"curated","brand":"타입서비스","name":"Stand Collar Padded Jacket [Charcoal]","price":170100,"img":"https://image.msscdn.net/images/goods_img/20260901/7219229/7219229_17899792974839_500.jpg","url":"https://www.musinsa.com/products/7219229","rating":null,"reviews":0,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-7225460","slot":"m-slacks","color":"black","colorSource":"curation","classification":"curated","brand":"커스텀어클락","name":"원턱 와이드 슬랙스 블랙","price":55200,"img":"https://image.msscdn.net/images/goods_img/20260902/7225460/7225460_17893739821732_500.jpg","url":"https://www.musinsa.com/products/7225460","rating":4.9,"reviews":29,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-7226766","slot":"f-skirt","color":"brown","colorSource":"curation","classification":"curated","brand":"커스텀어클락 우먼","name":"포멀 슬릿 H라인 맥시 스커트 스웨이드 브라운","price":49600,"img":"https://image.msscdn.net/images/goods_img/20260902/7226766/7226766_17897244868060_500.jpg","url":"https://www.musinsa.com/products/7226766","rating":5,"reviews":2,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-7260535","slot":"m-field","color":"olive","colorSource":"curation","classification":"curated","brand":"파르티멘토","name":"코튼 트윌 필드 자켓 올리브","price":99900,"img":"https://image.msscdn.net/images/goods_img/20260907/7260535/7260535_17887585091944_500.jpg","url":"https://www.musinsa.com/products/7260535","rating":null,"reviews":0,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-7260601","slot":"m-tee","color":"white","colorSource":"curation","classification":"curated","brand":"샤카웨어","name":"7.5oz 맥스 헤비웨이트 티셔츠 White","price":16800,"img":"https://image.msscdn.net/images/goods_img/20260907/7260601/7260601_17897205898125_500.jpg","url":"https://www.musinsa.com/products/7260601","rating":4.8,"reviews":2564,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-7266977","slot":"f-flat","color":"black","colorSource":"curation","classification":"curated","brand":"식스핏","name":"[+5cm] HI MOLLY MARYJANE (BLACK)","price":54900,"img":"https://image.msscdn.net/images/prd_img/20260907/7266977/detail_7266977_17896097324498_500.jpg","url":"https://www.musinsa.com/products/7266977","rating":null,"reviews":0,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-7275813","slot":"m-harrington","color":"grey","colorSource":"curation","classification":"curated","brand":"스파오","name":"[울블렌드] 헤링턴 집업 재킷","price":89900,"img":"https://image.msscdn.net/images/goods_img/20260908/7275813/7275813_17905778571537_500.jpg","url":"https://www.musinsa.com/products/7275813","rating":null,"reviews":0,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-7280804","slot":"f-bag","color":"brown","colorSource":"curation","classification":"curated","brand":"돈키","name":"아렌 숄더백","price":100300,"img":"https://image.msscdn.net/images/goods_img/20260908/7280804/7280804_17900559535973_500.jpg","url":"https://www.musinsa.com/products/7280804","rating":5,"reviews":1,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-7283010","slot":"m-flannel","color":"blue","colorSource":"curation","classification":"curated","brand":"쿠어","name":"옴브레 플란넬 원 포켓 체크 셔츠 V.2 (블루그레이)","price":225000,"img":"https://image.msscdn.net/images/goods_img/20260909/7283010/7283010_17896080430850_500.jpg","url":"https://www.musinsa.com/products/7283010","rating":5,"reviews":5,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-7285124","slot":"f-bag","color":"brown","colorSource":"curation","classification":"curated","brand":"벵디","name":"Cleo Shoulder Bag Dusty Brown","price":68640,"img":"https://image.msscdn.net/images/goods_img/20260909/7285124/7285124_17889244096995_500.jpg","url":"https://www.musinsa.com/products/7285124","rating":null,"reviews":0,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-7285541","slot":"m-down","color":"black","colorSource":"curation","classification":"curated","brand":"컬럼비아","name":"호프 파인스 포레스트 III 옴니히트 패딩 자켓","price":259000,"img":"https://image.msscdn.net/images/goods_img/20260909/7285541/7285541_17909220033726_500.jpg","url":"https://www.musinsa.com/products/7285541","rating":null,"reviews":0,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-7290261","slot":"f-flat","color":"black","colorSource":"curation","classification":"curated","brand":"에잇세컨즈","name":"플랫폼 메리제인(FW) 블랙","price":69900,"img":"https://image.msscdn.net/images/goods_img/20260909/7290261/7290261_17889438316656_500.jpg","url":"https://www.musinsa.com/products/7290261","rating":5,"reviews":1,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-7291670","slot":"f-slacks","color":"black","colorSource":"curation","classification":"curated","brand":"유젠","name":"어드저스트 와이드 밴딩 슬랙스 블랙","price":39900,"img":"https://image.msscdn.net/images/goods_img/20260909/7291670/7291670_17891134621092_500.jpg","url":"https://www.musinsa.com/products/7291670","rating":4,"reviews":1,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-7304486","slot":"f-cardigan","color":"grey","colorSource":"curation","classification":"curated","brand":"퍼머넌트 아카이브","name":"[우먼] 에어 플렉스 라운드 넥 가디건 (딥그레이)","price":39200,"img":"https://image.msscdn.net/images/goods_img/20260910/7304486/7304486_17900493566145_500.jpg","url":"https://www.musinsa.com/products/7304486","rating":4.9,"reviews":8,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-7310999","slot":"f-coat","color":"brown","colorSource":"curation","classification":"curated","brand":"미레코","name":"TULIP DOUBLE HALF WOOL COAT BROWN","price":178200,"img":"https://image.msscdn.net/images/goods_img/20260911/7310999/7310999_17895227317419_500.jpg","url":"https://www.musinsa.com/products/7310999","rating":4.7,"reviews":3,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-7311615","slot":"m-cardigan","color":"navy","colorSource":"curation","classification":"curated","brand":"유니온블루","name":"HARU CASHMERE WOOL CROP COLLAR CARDIGAN [DARK NAVY]","price":133200,"img":"https://image.msscdn.net/images/goods_img/20260911/7311615/7311615_17893503593798_500.jpg","url":"https://www.musinsa.com/products/7311615","rating":5,"reviews":1,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-7312027","slot":"m-harrington","color":"grey","colorSource":"curation","classification":"curated","brand":"드로우핏","name":"울 블렌드 해링턴 자켓 [M.CHARCOAL]","price":155200,"img":"https://image.msscdn.net/images/goods_img/20260911/7312027/7312027_17912492965521_500.jpg","url":"https://www.musinsa.com/products/7312027","rating":5,"reviews":1,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-7323129","slot":"f-bag","color":"black","colorSource":"curation","classification":"curated","brand":"코치","name":"첼시 숄더 백 26 B4/BK","price":450000,"img":"https://image.msscdn.net/images/goods_img/20260914/7323129/7323129_17893696946045_500.jpg","url":"https://www.musinsa.com/products/7323129","rating":null,"reviews":0,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-7325355","slot":"m-trucker","color":"blue","colorSource":"curation","classification":"curated","brand":"리바이스","name":"타입 II 셀비지 트러커 재킷","price":219000,"img":"https://image.msscdn.net/images/goods_img/20260914/7325355/7325355_17893759109073_500.jpg","url":"https://www.musinsa.com/products/7325355","rating":null,"reviews":0,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-7332146","slot":"m-sweat","color":"grey","colorSource":"curation","classification":"curated","brand":"뉴발란스","name":"올데이 맨투맨 (그레이)","price":89900,"img":"https://image.msscdn.net/images/goods_img/20260915/7332146/7332146_17894525844388_500.jpg","url":"https://www.musinsa.com/products/7332146","rating":null,"reviews":0,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-7335885","slot":"m-down","color":"grey","colorSource":"curation","classification":"curated","brand":"커버낫","name":"레이크 패딩 후드 자켓 라이트그레이","price":152100,"img":"https://image.msscdn.net/images/goods_img/20260915/7335885/7335885_17897056042009_500.jpg","url":"https://www.musinsa.com/products/7335885","rating":null,"reviews":0,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-7341165","slot":"m-down","color":"grey","colorSource":"curation","classification":"curated","brand":"커스텀어클락","name":"라이트웨이트 후드 덕다운 패딩 자켓 쉘그레이","price":104250,"img":"https://image.msscdn.net/images/goods_img/20260916/7341165/7341165_17901243453196_500.jpg","url":"https://www.musinsa.com/products/7341165","rating":null,"reviews":0,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-7367133","slot":"f-trench","color":"beige","colorSource":"curation","classification":"curated","brand":"프렌치시크","name":"펠로우 하이넥 롱 트렌치코트","price":151200,"img":"https://image.msscdn.net/images/goods_img/20260918/7367133/7367133_17897146851133_500.jpg","url":"https://www.musinsa.com/products/7367133","rating":null,"reviews":0,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-7367139","slot":"f-trench","color":"beige","colorSource":"curation","classification":"curated","brand":"프렌치시크","name":"크레마 하프 트렌치 코트","price":115200,"img":"https://image.msscdn.net/images/goods_img/20260918/7367139/7367139_17897146991209_500.jpg","url":"https://www.musinsa.com/products/7367139","rating":null,"reviews":0,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-7389182","slot":"f-padding","color":"beige","colorSource":"curation","classification":"curated","brand":"노스페이스","name":"여성 노벨티 눕시 다운 자켓 (RDS) CREAM BEIGE","price":388000,"img":"https://image.msscdn.net/images/goods_img/20260922/7389182/7389182_17900419690156_500.jpg","url":"https://www.musinsa.com/products/7389182","rating":null,"reviews":0,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-7397459","slot":"m-derby","color":"black","colorSource":"curation","classification":"curated","brand":"포컬트","name":"플루이드 더비슈즈","price":98700,"img":"https://image.msscdn.net/images/goods_img/20260922/7397459/7397459_17900852944853_500.jpg","url":"https://www.musinsa.com/products/7397459","rating":null,"reviews":0,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-7400935","slot":"m-cardigan","color":"grey","colorSource":"curation","classification":"curated","brand":"트릴리온","name":"워셔블 토글 울 니트 가디건","price":39990,"img":"https://image.msscdn.net/images/goods_img/20260923/7400935/7400935_17907510379337_500.jpg","url":"https://www.musinsa.com/products/7400935","rating":null,"reviews":0,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-7444092","slot":"m-sweat","color":"grey","colorSource":"curation","classification":"curated","brand":"모더먼트","name":"썸홀 래글런 스웨트셔츠 [블루그레이]","price":40600,"img":"https://image.msscdn.net/images/goods_img/20261002/7444092/7444092_17909067659051_500.jpg","url":"https://www.musinsa.com/products/7444092","rating":null,"reviews":0,"likes":0,"store":"무신사","checkedAt":"2026-10-13"},{"id":"ms-5101728","slot":"m-harrington","color":"blue","colorSource":"image","classification":"name-rules","brand":"폴로 랄프 로렌","name":"리버시블 코튼 옥스포드 재킷-멀티 컬러","price":299000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250512/5101728/5101728_17495409288374_big.jpg?w=600","url":"https://www.musinsa.com/products/5101728","rating":5,"reviews":2,"likes":771,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4915934","slot":"m-harrington","color":"brown","colorSource":"name","classification":"name-rules","brand":"폴로 랄프 로렌","name":"[WORKWEAR CAPSULE] 캔버스 보머 재킷-브라운","price":819000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250319/4915934/4915934_17443364280889_big.jpg?w=600","url":"https://www.musinsa.com/products/4915934","rating":5,"reviews":87,"likes":2,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4312891","slot":"m-harrington","color":"navy","colorSource":"name","classification":"name-rules","brand":"폴로 랄프 로렌","name":"P윙 새티인 코치 재킷-네이비410","price":559300,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20240809/4312891/4312891_17253542427219_big.jpg?w=600","url":"https://www.musinsa.com/products/4312891","rating":5,"reviews":3,"likes":186,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-3039153","slot":"m-cable","color":"black","colorSource":"name","classification":"name-rules","brand":"폴로 랄프 로렌","name":"케이블 니트 코튼 스웨터 - 블랙","price":299000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20230126/3039153/3039153_16764213820086_big.jpg?w=600","url":"https://www.musinsa.com/products/3039153","rating":4.8,"reviews":368,"likes":8,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-1620273","slot":"m-polo","color":"black","colorSource":"name","classification":"name-rules","brand":"폴로 랄프 로렌","name":"커스텀 슬림핏 롱 슬리브 메시 폴로 - 블랙","price":209000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20200923/1620273/1620273_2_big.jpg?w=600","url":"https://www.musinsa.com/products/1620273","rating":4.9,"reviews":349,"likes":3,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-1620268","slot":"m-polo","color":"white","colorSource":"name","classification":"name-rules","brand":"폴로 랄프 로렌","name":"커스텀 슬림핏 롱 슬리브 메시 폴로 - 화이트","price":209000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20200923/1620268/1620268_2_big.jpg?w=600","url":"https://www.musinsa.com/products/1620268","rating":4.8,"reviews":202,"likes":1,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-1620270","slot":"m-polo","color":"grey","colorSource":"name","classification":"correction","brand":"폴로 랄프 로렌","name":"커스텀 슬림 핏 롱 슬리브 폴로 - 그레이","price":209000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20200923/1620270/1620270_2_big.jpg?w=600","url":"https://www.musinsa.com/products/1620270","rating":4.8,"reviews":182,"likes":1,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5038353","slot":"m-rugby","color":"navy","colorSource":"name","classification":"name-rules","brand":"폴로 랄프 로렌","name":"클래식핏 폴로 스포츠 럭비 셔츠-네이비","price":181300,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250417/5038353/5038353_17471916262926_big.jpg?w=600","url":"https://www.musinsa.com/products/5038353","rating":4.8,"reviews":10,"likes":982,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6257529","slot":"m-tee","color":"blue","colorSource":"name","classification":"name-rules","brand":"폴로 랄프 로렌","name":"폴로 랄프 로렌 양키스 티셔츠-블루","price":189000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260406/6257529/6257529_17761330067129_big.jpg?w=600","url":"https://www.musinsa.com/products/6257529","rating":5,"reviews":2,"likes":73,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5101752","slot":"m-tee","color":"grey","colorSource":"name","classification":"name-rules","brand":"폴로 랄프 로렌","name":"폴로 랄프 로렌 양키스 저지 티셔츠-그레이","price":189000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250512/5101752/5101752_17484167826349_big.jpg?w=600","url":"https://www.musinsa.com/products/5101752","rating":null,"reviews":0,"likes":122,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6257514","slot":"m-tee","color":"green","colorSource":"name","classification":"name-rules","brand":"폴로 랄프 로렌","name":"커스텀 슬림핏 웨스턴 로고 티셔츠-그린","price":118300,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260406/6257514/6257514_17763039378342_big.jpg?w=600","url":"https://www.musinsa.com/products/6257514","rating":5,"reviews":1,"likes":49,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-1620291","slot":"m-chino","color":"beige","colorSource":"name","classification":"name-rules","brand":"폴로 랄프 로렌","name":"스트레치 슬림핏 치노 팬츠 - 라이트 베이지","price":239000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20200923/1620291/1620291_1_big.jpg?w=600","url":"https://www.musinsa.com/products/1620291","rating":4.9,"reviews":21,"likes":136,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-2110566","slot":"m-cap","color":"green","colorSource":"name","classification":"name-rules","brand":"폴로 랄프 로렌","name":"코튼 치노 베이스볼 캡 - 그린","price":99000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20210906/2110566/2110566_16923461169471_big.jpg?w=600","url":"https://www.musinsa.com/products/2110566","rating":4.9,"reviews":384,"likes":2,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-2088483","slot":"m-cap","color":"white","colorSource":"name","classification":"name-rules","brand":"폴로 랄프 로렌","name":"코튼 치노 베이스볼 캡 - 화이트","price":69000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20210825/2088483/2088483_4_big.jpg?w=600","url":"https://www.musinsa.com/products/2088483","rating":4.8,"reviews":111,"likes":1,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5101721","slot":"m-cap","color":"orange","colorSource":"name","classification":"name-rules","brand":"폴로 랄프 로렌","name":"코튼 치노 볼 캡-오렌지","price":69000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250512/5101721/5101721_17495408549634_big.jpg?w=600","url":"https://www.musinsa.com/products/5101721","rating":4.7,"reviews":3,"likes":144,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-3945981","slot":"m-field","color":"navy","colorSource":"name","classification":"name-rules","brand":"폴로 랄프 로렌","name":"새티인 유틸리티 재킷 - 네이비","price":559300,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20240313/3945981/3945981_17114440713721_big.jpg?w=600","url":"https://www.musinsa.com/products/3945981","rating":5,"reviews":11,"likes":558,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4312893","slot":"m-field","color":"navy","colorSource":"name","classification":"name-rules","brand":"폴로 랄프 로렌","name":"[YACHT CLUB]드리즐러 포플린 봄버-네이비","price":499000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20240809/4312893/4312893_17252671216224_big.jpg?w=600","url":"https://www.musinsa.com/products/4312893","rating":4.8,"reviews":4,"likes":686,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7078630","slot":"m-knit","color":"navy","colorSource":"name","classification":"name-rules","brand":"폴로 랄프 로렌","name":"럭셔리 저지 쿼터 지퍼 풀오버-네이비","price":259000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260814/7078630/7078630_17884142760163_big.jpg?w=600","url":"https://www.musinsa.com/products/7078630","rating":5,"reviews":1,"likes":284,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5043771","slot":"m-knit","color":"blue","colorSource":"name","classification":"name-rules","brand":"폴로 랄프 로렌","name":"폴로 랄프 로렌 양키스 스웨터-블루","price":499000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250418/5043771/5043771_17465821194535_big.jpg?w=600","url":"https://www.musinsa.com/products/5043771","rating":null,"reviews":0,"likes":27,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6024310","slot":"m-hoodie","color":"white","colorSource":"name","classification":"name-rules","brand":"폴로 랄프 로렌","name":"로고 플리스 후디-화이트","price":132300,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260213/6024310/6024310_17731916655192_big.jpg?w=600","url":"https://www.musinsa.com/products/6024310","rating":null,"reviews":0,"likes":628,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5038387","slot":"m-hoodie","color":"black","colorSource":"name","classification":"name-rules","brand":"폴로 랄프 로렌","name":"로고 컬러블록 더블니트 후디-블랙","price":181300,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250417/5038387/5038387_17471917760752_big.jpg?w=600","url":"https://www.musinsa.com/products/5038387","rating":5,"reviews":2,"likes":197,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5918900","slot":"m-hoodie","color":"white","colorSource":"name","classification":"name-rules","brand":"폴로 랄프 로렌","name":"플래그 플리스 후디-화이트","price":230300,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260121/5918900/5918900_17699907719209_big.jpg?w=600","url":"https://www.musinsa.com/products/5918900","rating":5,"reviews":1,"likes":173,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6040805","slot":"m-chino","color":"black","colorSource":"name","classification":"name-rules","brand":"브룩스 브라더스","name":"구르카 팬츠 (블랙)","price":209300,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260223/6040805/6040805_17906398832376_big.jpg?w=600","url":"https://www.musinsa.com/products/6040805","rating":null,"reviews":0,"likes":47,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4371356","slot":"m-cords","color":"charcoal","colorSource":"name","classification":"name-rules","brand":"브룩스 브라더스","name":"슬림핏 15W 코듀로이 5포켓 팬츠 (차콜)","price":119400,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20240826/4371356/4371356_17839993252746_big.jpg?w=600","url":"https://www.musinsa.com/products/4371356","rating":null,"reviews":0,"likes":2,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6040144","slot":"m-hoodie","color":"grey","colorSource":"name","classification":"name-rules","brand":"브룩스 브라더스","name":"B심볼 후드티셔츠 (그레이)","price":153300,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260223/6040144/6040144_17827960207594_big.jpg?w=600","url":"https://www.musinsa.com/products/6040144","rating":4,"reviews":1,"likes":9,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4832838","slot":"m-cable","color":"grey","colorSource":"name","classification":"name-rules","brand":"브룩스 브라더스","name":"코튼 케이블 폴로 반팔 스웨터 (그레이)","price":139300,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250225/4832838/4832838_17840906404013_big.jpg?w=600","url":"https://www.musinsa.com/products/4832838","rating":4.9,"reviews":36,"likes":417,"summer":true,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5589298","slot":"m-cable","color":"navy","colorSource":"name","classification":"name-rules","brand":"브룩스 브라더스","name":"울 케이블 스웨터 (네이비)","price":233100,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20251014/5589298/5589298_17830512524330_big.jpg?w=600","url":"https://www.musinsa.com/products/5589298","rating":5,"reviews":4,"likes":59,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5435709","slot":"m-cable","color":"ivory","colorSource":"name","classification":"name-rules","brand":"브룩스 브라더스","name":"울 테니스 케이블 브이넥 스웨터 (아이보리)","price":209300,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250910/5435709/5435709_17833025854756_big.jpg?w=600","url":"https://www.musinsa.com/products/5435709","rating":null,"reviews":0,"likes":37,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5076703","slot":"m-tee","color":"black","colorSource":"name","classification":"name-rules","brand":"브룩스 브라더스","name":"수피마 골든플리스 로고 티셔츠 (블랙)","price":69300,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250429/5076703/5076703_17841664788119_big.jpg?w=600","url":"https://www.musinsa.com/products/5076703","rating":4,"reviews":1,"likes":39,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6099208","slot":"m-tee","color":"charcoal","colorSource":"name","classification":"name-rules","brand":"브룩스 브라더스","name":"[Heritage] BB 레터링 반팔티셔츠 (차콜)","price":111200,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260309/6099208/6099208_17828001683461_big.jpg?w=600","url":"https://www.musinsa.com/products/6099208","rating":null,"reviews":0,"likes":5,"summer":true,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6361667","slot":"m-cap","color":"red","colorSource":"name","classification":"name-rules","brand":"브룩스 브라더스","name":"[BB x KT WIZ] 볼캡 (버건디)","price":49000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260423/6361667/6361667_17827956446536_big.jpg?w=600","url":"https://www.musinsa.com/products/6361667","rating":null,"reviews":0,"likes":46,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7055559","slot":"m-denim","color":"indigo","colorSource":"name","classification":"name-rules","brand":"타미힐피거","name":"[Slim fit] 덴톤 코튼 블렌드 데님 팬츠","price":219000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260812/7055559/7055559_17865115958791_big.jpg?w=600","url":"https://www.musinsa.com/products/7055559","rating":null,"reviews":0,"likes":2,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7055573","slot":"m-denim","color":"indigo","colorSource":"name","classification":"name-rules","brand":"타미힐피거","name":"[Straight fit] 도버 코튼 데님 팬츠","price":239000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260812/7055573/7055573_17865116362294_big.jpg?w=600","url":"https://www.musinsa.com/products/7055573","rating":null,"reviews":0,"likes":1,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6996956","slot":"m-cap","color":"indigo","colorSource":"name","classification":"name-rules","brand":"타미힐피거","name":"스크립트 데님 6패널 볼캡","price":89000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260805/6996956/6996956_17858954287589_big.jpg?w=600","url":"https://www.musinsa.com/products/6996956","rating":null,"reviews":0,"likes":1,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6996876","slot":"m-chino","color":"grey","colorSource":"image","classification":"name-rules","brand":"타미힐피거","name":"[Slim straight fit] 덴톤 코튼 블렌드 스트럭처 팬츠","price":219000,"img":"https://image.msscdn.net/thumbnails/images/prd_img/20260805/6996876/detail_6996876_17858950639832_big.jpg?w=600","url":"https://www.musinsa.com/products/6996876","rating":null,"reviews":0,"likes":1,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7291493","slot":"m-chino","color":"black","colorSource":"image","classification":"name-rules","brand":"타미힐피거","name":"[Slim straight fit] 덴톤 사이드 밴딩 브러쉬드 팬츠","price":259000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260909/7291493/7291493_17893538581478_big.jpg?w=600","url":"https://www.musinsa.com/products/7291493","rating":null,"reviews":0,"likes":0,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7458284","slot":"m-cardigan","color":"navy","colorSource":"image","classification":"name-rules","brand":"타미힐피거","name":"알파카 블렌드 아가일 가디건","price":379000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20261006/7458284/7458284_17912578180864_big.jpg?w=600","url":"https://www.musinsa.com/products/7458284","rating":null,"reviews":0,"likes":0,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7101232","slot":"m-oxford","color":"navy","colorSource":"image","classification":"name-rules","brand":"타미힐피거","name":"[Asian fit] 헤리티지 옥스포드 솔리드 셔츠","price":199000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260819/7101232/7101232_17871023190456_big.jpg?w=600","url":"https://www.musinsa.com/products/7101232","rating":null,"reviews":0,"likes":5,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7458261","slot":"m-cable","color":"navy","colorSource":"image","classification":"name-rules","brand":"타미힐피거","name":"램스울 케이블 집업 모크넥 스웨터","price":299000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20261006/7458261/7458261_17912573456666_big.jpg?w=600","url":"https://www.musinsa.com/products/7458261","rating":null,"reviews":0,"likes":0,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7219077","slot":"m-runner","color":"olive","colorSource":"image","classification":"name-rules","brand":"타미힐피거","name":"트라이베카 믹스 스니커즈","price":199000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260901/7219077/7219077_17882529023845_big.jpg?w=600","url":"https://www.musinsa.com/products/7219077","rating":null,"reviews":0,"likes":1,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7458356","slot":"m-slacks","color":"black","colorSource":"image","classification":"name-rules","brand":"타미힐피거","name":"[Slim straight fit] 덴톤 클래식 슬랙스","price":239000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20261006/7458356/7458356_17912594059416_big.jpg?w=600","url":"https://www.musinsa.com/products/7458356","rating":null,"reviews":0,"likes":0,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7330426","slot":"m-harrington","color":"charcoal","colorSource":"image","classification":"name-rules","brand":"타미힐피거","name":"울 블렌드 카라 재킷","price":499000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260915/7330426/7330426_17912712921182_big.jpg?w=600","url":"https://www.musinsa.com/products/7330426","rating":null,"reviews":0,"likes":1,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7084841","slot":"m-sweat","color":"grey","colorSource":"image","classification":"name-rules","brand":"라코스테","name":"카라 스웻셔츠 CCA","price":219000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260814/7084841/7084841_17894654890458_big.jpg?w=600","url":"https://www.musinsa.com/products/7084841","rating":5,"reviews":1,"likes":22,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7329043","slot":"m-sweat","color":"black","colorSource":"image","classification":"name-rules","brand":"라코스테","name":"워싱 크루넥 스웻셔츠 031","price":219000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260915/7329043/7329043_17900717265724_big.jpg?w=600","url":"https://www.musinsa.com/products/7329043","rating":null,"reviews":0,"likes":6,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7291400","slot":"m-sweat","color":"black","colorSource":"image","classification":"name-rules","brand":"라코스테","name":"테니스 헤리티지 스웻셔츠 HHW","price":229000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260909/7291400/7291400_17889508698632_big.jpg?w=600","url":"https://www.musinsa.com/products/7291400","rating":null,"reviews":0,"likes":0,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7451366","slot":"m-cap","color":"beige","colorSource":"image","classification":"name-rules","brand":"라코스테","name":"경량 나일론 볼캡 S69","price":79000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20261002/7451366/7451366_17909366843693_big.jpg?w=600","url":"https://www.musinsa.com/products/7451366","rating":null,"reviews":0,"likes":2,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7328889","slot":"m-hoodie","color":"black","colorSource":"image","classification":"name-rules","brand":"라코스테","name":"워싱 버튼 후드 풀오버 031","price":239000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260915/7328889/7328889_17901337754893_big.jpg?w=600","url":"https://www.musinsa.com/products/7328889","rating":5,"reviews":1,"likes":5,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7084920","slot":"m-hoodie","color":"navy","colorSource":"image","classification":"name-rules","brand":"라코스테","name":"베이직 후드 집업 166","price":239000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260814/7084920/7084920_17866965145559_big.jpg?w=600","url":"https://www.musinsa.com/products/7084920","rating":null,"reviews":0,"likes":10,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6293558","slot":"m-tee","color":"black","colorSource":"image","classification":"name-rules","brand":"라코스테","name":"강연 우븐 절개 반팔 티셔츠 3LA","price":90300,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260410/6293558/6293558_17785766467419_big.jpg?w=600","url":"https://www.musinsa.com/products/6293558","rating":null,"reviews":0,"likes":11,"summer":true,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5756472","slot":"m-tee","color":"ivory","colorSource":"image","classification":"name-rules","brand":"라코스테","name":"소프트브랜딩 스몰 크록 반팔 티셔츠 107","price":69300,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20251120/5756472/5756472_17636084622480_big.jpg?w=600","url":"https://www.musinsa.com/products/5756472","rating":null,"reviews":0,"likes":9,"summer":true,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7330014","slot":"m-tee","color":"navy","colorSource":"image","classification":"name-rules","brand":"라코스테","name":"테니스 롤렉스 티셔츠 166","price":129000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260915/7330014/7330014_17899728983436_big.jpg?w=600","url":"https://www.musinsa.com/products/7330014","rating":null,"reviews":0,"likes":0,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7290835","slot":"m-longtee","color":"black","colorSource":"image","classification":"name-rules","brand":"라코스테","name":"멀티 스트라이프 긴팔 티셔츠 3종 택1","price":159000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260909/7290835/7290835_17901283248248_big.jpg?w=600","url":"https://www.musinsa.com/products/7290835","rating":5,"reviews":7,"likes":20,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7121643","slot":"m-oxford","color":"charcoal","colorSource":"image","classification":"name-rules","brand":"라코스테","name":"옥스포드 가먼트워싱 셔츠 HDE","price":219000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260820/7121643/7121643_17872188145755_big.jpg?w=600","url":"https://www.musinsa.com/products/7121643","rating":null,"reviews":0,"likes":14,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5741080","slot":"m-slacks","color":"pink","colorSource":"image","classification":"name-rules","brand":"라코스테","name":"가을 슬랙스 02S","price":143400,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20251117/5741080/5741080_17633520323864_big.jpg?w=600","url":"https://www.musinsa.com/products/5741080","rating":5,"reviews":2,"likes":2,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5741087","slot":"m-slacks","color":"grey","colorSource":"image","classification":"name-rules","brand":"라코스테","name":"울라이크 헤링본 슬랙스 CCA","price":167400,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20251117/5741087/5741087_17633522166944_big.jpg?w=600","url":"https://www.musinsa.com/products/5741087","rating":null,"reviews":0,"likes":3,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6037026","slot":"m-denim","color":"indigo","colorSource":"name","classification":"name-rules","brand":"라코스테","name":"스트레이트 핏 데님 팬츠 MK9","price":153300,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260220/6037026/6037026_17715722450510_big.jpg?w=600","url":"https://www.musinsa.com/products/6037026","rating":null,"reviews":0,"likes":6,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6037047","slot":"m-denim","color":"indigo","colorSource":"name","classification":"name-rules","brand":"라코스테","name":"[카이 착용] 남성 루즈 핏 데님 팬츠 MKU","price":167300,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260220/6037047/6037047_17757175671008_big.jpg?w=600","url":"https://www.musinsa.com/products/6037047","rating":null,"reviews":0,"likes":5,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5738723","slot":"m-knit","color":"black","colorSource":"image","classification":"name-rules","brand":"라코스테","name":"캐시미어 크루넥 스웨터 031","price":299400,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20251114/5738723/5738723_17738965214615_big.jpg?w=600","url":"https://www.musinsa.com/products/5738723","rating":5,"reviews":1,"likes":38,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7381970","slot":"m-knit","color":"red","colorSource":"image","classification":"name-rules","brand":"라코스테","name":"볼드 스트라이프 크루넥 풀오버 240","price":319000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260921/7381970/7381970_17899720943274_big.jpg?w=600","url":"https://www.musinsa.com/products/7381970","rating":5,"reviews":1,"likes":3,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5738721","slot":"m-knit","color":"charcoal","colorSource":"image","classification":"name-rules","brand":"라코스테","name":"방모 반집업 스웨터 E9F","price":167400,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20251114/5738721/5738721_17738942577675_big.jpg?w=600","url":"https://www.musinsa.com/products/5738721","rating":null,"reviews":0,"likes":36,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6959687","slot":"m-runner","color":"black","colorSource":"image","classification":"name-rules","brand":"라코스테","name":"BASESHOT PRO 스니커즈 02H","price":149000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260730/6959687/6959687_17853963258459_big.jpg?w=600","url":"https://www.musinsa.com/products/6959687","rating":null,"reviews":0,"likes":34,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7230331","slot":"m-harrington","color":"black","colorSource":"image","classification":"name-rules","brand":"라코스테","name":"헤링턴 자켓 HDE","price":399000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260902/7230331/7230331_17883372353165_big.jpg?w=600","url":"https://www.musinsa.com/products/7230331","rating":5,"reviews":1,"likes":31,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7128867","slot":"m-harrington","color":"black","colorSource":"image","classification":"name-rules","brand":"라코스테","name":"버튼 하이넥 니트 자켓 166","price":379000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260821/7128867/7128867_17908466957700_big.jpg?w=600","url":"https://www.musinsa.com/products/7128867","rating":null,"reviews":0,"likes":4,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5738922","slot":"m-varsity","color":"black","colorSource":"image","classification":"name-rules","brand":"라코스테","name":"더블페이스 스타디움 가디건 166","price":244300,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20251114/5738922/5738922_17738991030042_big.jpg?w=600","url":"https://www.musinsa.com/products/5738922","rating":5,"reviews":3,"likes":24,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7230376","slot":"m-downvest","color":"black","colorSource":"image","classification":"name-rules","brand":"라코스테","name":"핫멜트 구스 다운 베스트 031","price":399000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260902/7230376/7230376_17883373995453_big.jpg?w=600","url":"https://www.musinsa.com/products/7230376","rating":null,"reviews":0,"likes":4,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7356656","slot":"m-chore","color":"navy","colorSource":"image","classification":"name-rules","brand":"라코스테","name":"플란넬 체크 셔켓 M5C","price":319000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260917/7356656/7356656_17896263749572_big.jpg?w=600","url":"https://www.musinsa.com/products/7356656","rating":null,"reviews":0,"likes":1,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5514243","slot":"m-chambray","color":"blue","colorSource":"name","classification":"name-rules","brand":"헤지스","name":"[HIS]라이트블루 샴브레이 셔츠","price":118300,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250923/5514243/5514243_17592185331338_big.jpg?w=600","url":"https://www.musinsa.com/products/5514243","rating":null,"reviews":0,"likes":10,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5514206","slot":"m-trucker","color":"brown","colorSource":"correction","classification":"name-rules","brand":"헤지스","name":"[HIS]라이트브라운 데님자켓","price":181300,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250923/5514206/5514206_17591258050239_big.jpg?w=600","url":"https://www.musinsa.com/products/5514206","rating":5,"reviews":1,"likes":27,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5514115","slot":"m-harrington","color":"beige","colorSource":"name","classification":"name-rules","brand":"헤지스","name":"[HIS]스톤 코듀로이 파이어맨 클립 자켓","price":209300,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250923/5514115/5514115_17592099701256_big.jpg?w=600","url":"https://www.musinsa.com/products/5514115","rating":5,"reviews":4,"likes":101,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5513964","slot":"m-chore","color":"beige","colorSource":"name","classification":"name-rules","brand":"헤지스","name":"[HIS]스톤 가죽카라 워크자켓","price":251300,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250923/5513964/5513964_17592180882906_big.jpg?w=600","url":"https://www.musinsa.com/products/5513964","rating":null,"reviews":0,"likes":44,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7222927","slot":"m-down","color":"grey","colorSource":"name","classification":"name-rules","brand":"헤지스","name":"[HIS] 라이트 그레이 경량 구스 다운","price":237150,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260902/7222927/7222927_17905824311281_big.jpg?w=600","url":"https://www.musinsa.com/products/7222927","rating":5,"reviews":6,"likes":148,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5504326","slot":"m-down","color":"charcoal","colorSource":"name","classification":"name-rules","brand":"헤지스","name":"[HIS]차콜 경량패딩","price":181300,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250922/5504326/5504326_17591993121487_big.jpg?w=600","url":"https://www.musinsa.com/products/5504326","rating":5,"reviews":1,"likes":40,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7222931","slot":"m-down","color":"blue","colorSource":"name","classification":"name-rules","brand":"헤지스","name":"[HIS] 틸 블루 경량 구스 다운","price":237150,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260902/7222931/7222931_17893702122389_big.jpg?w=600","url":"https://www.musinsa.com/products/7222931","rating":5,"reviews":1,"likes":25,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6259026","slot":"m-chino","color":"olive","colorSource":"name","classification":"name-rules","brand":"헤지스","name":"[HIS] 카키 워시드 캔버스 팬츠","price":103200,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260406/6259026/6259026_17754492672397_big.jpg?w=600","url":"https://www.musinsa.com/products/6259026","rating":4.9,"reviews":15,"likes":126,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6259025","slot":"m-chino","color":"charcoal","colorSource":"name","classification":"name-rules","brand":"헤지스","name":"[HIS] 차콜 워시드 캔버스 팬츠","price":103200,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260406/6259025/6259025_17754491626810_big.jpg?w=600","url":"https://www.musinsa.com/products/6259025","rating":5,"reviews":9,"likes":74,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6259024","slot":"m-chino","color":"blue","colorSource":"correction","classification":"name-rules","brand":"헤지스","name":"[HIS] 스톤 블루 워시드 캔버스 팬츠","price":103200,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260406/6259024/6259024_17754478293164_big.jpg?w=600","url":"https://www.musinsa.com/products/6259024","rating":5,"reviews":5,"likes":40,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7473394","slot":"m-henley","color":"ivory","colorSource":"correction","classification":"name-rules","brand":"토마스모어","name":"헨리넥 롱슬리브 티셔츠","price":37500,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20261007/7473394/7473394_17914345539167_big.jpg?w=600","url":"https://www.musinsa.com/products/7473394","rating":null,"reviews":0,"likes":12,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7473387","slot":"m-slacks","color":"charcoal","colorSource":"name","classification":"name-rules","brand":"토마스모어","name":"투턱 울 팬츠 - 차콜","price":137000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20261007/7473387/7473387_17914350953882_big.jpg?w=600","url":"https://www.musinsa.com/products/7473387","rating":null,"reviews":0,"likes":9,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7473337","slot":"m-knit","color":"blue","colorSource":"name","classification":"name-rules","brand":"토마스모어","name":"피치 메리노울 브이넥 니트 - 로얄블루","price":65700,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20261007/7473337/7473337_17914383833151_big.jpg?w=600","url":"https://www.musinsa.com/products/7473337","rating":null,"reviews":0,"likes":31,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7473326","slot":"m-knit","color":"black","colorSource":"name","classification":"name-rules","brand":"토마스모어","name":"피치 메리노울 브이넥 니트 - 블랙","price":65700,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20261007/7473326/7473326_17914390863151_big.jpg?w=600","url":"https://www.musinsa.com/products/7473326","rating":null,"reviews":0,"likes":24,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7473330","slot":"m-knit","color":"grey","colorSource":"name","classification":"name-rules","brand":"토마스모어","name":"피치 메리노울 브이넥 니트 - 그레이","price":65700,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20261007/7473330/7473330_17914388826097_big.jpg?w=600","url":"https://www.musinsa.com/products/7473330","rating":null,"reviews":0,"likes":21,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7171207","slot":"m-knit","color":"navy","colorSource":"name","classification":"name-rules","brand":"유니폼브릿지","name":"stripe hairy knit navy","price":116100,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260826/7171207/7171207_17877300219965_big.jpg?w=600","url":"https://www.musinsa.com/products/7171207","rating":null,"reviews":0,"likes":24,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4423147","slot":"m-work-pants","color":"brown","colorSource":"name","classification":"name-rules","brand":"유니폼브릿지","name":"double knee stud pants coffee","price":44800,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20240910/4423147/4423147_17268149175201_big.jpg?w=600","url":"https://www.musinsa.com/products/4423147","rating":4.6,"reviews":25,"likes":286,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5965780","slot":"m-blazer","color":"black","colorSource":"name","classification":"name-rules","brand":"유니폼브릿지","name":"refined tailored jacket relaxed fit black","price":131400,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260202/5965780/5965780_17757959506304_big.jpg?w=600","url":"https://www.musinsa.com/products/5965780","rating":5,"reviews":2,"likes":87,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4817759","slot":"m-denim","color":"blue","colorSource":"correction","classification":"correction","brand":"유니폼브릿지","name":"selvedge denim pants 12oz indigo washed","price":89500,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250221/4817759/4817759_17417141902936_big.jpg?w=600","url":"https://www.musinsa.com/products/4817759","rating":4.7,"reviews":10,"likes":371,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7021031","slot":"m-denim","color":"grey","colorSource":"name","classification":"name-rules","brand":"유니폼브릿지","name":"002 regular denim pants 12.5oz grey","price":107100,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260807/7021031/7021031_17860785911195_big.jpg?w=600","url":"https://www.musinsa.com/products/7021031","rating":null,"reviews":0,"likes":39,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4687296","slot":"m-sweat","color":"charcoal","colorSource":"name","classification":"name-rules","brand":"유니폼브릿지","name":"jungle air force sweatshirt pigment charcoal","price":54500,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20241231/4687296/4687296_17370410780420_big.jpg?w=600","url":"https://www.musinsa.com/products/4687296","rating":4.8,"reviews":9,"likes":241,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5923813","slot":"m-flannel","color":"blue","colorSource":"name","classification":"name-rules","brand":"유니폼브릿지","name":"band collar check shirt blue","price":69500,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260122/5923813/5923813_17690570313345_big.jpg?w=600","url":"https://www.musinsa.com/products/5923813","rating":5,"reviews":1,"likes":48,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5310768","slot":"m-harrington","color":"black","colorSource":"name","classification":"name-rules","brand":"유니폼브릿지","name":"washed herrington jacket black","price":179250,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250811/5310768/5310768_17550770514412_big.jpg?w=600","url":"https://www.musinsa.com/products/5310768","rating":4.8,"reviews":4,"likes":190,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7020977","slot":"m-field","color":"black","colorSource":"name","classification":"name-rules","brand":"유니폼브릿지","name":"nylon field jacket black","price":191200,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260807/7020977/7020977_17860787480813_big.jpg?w=600","url":"https://www.musinsa.com/products/7020977","rating":5,"reviews":2,"likes":49,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4414594","slot":"m-shell","color":"olive","colorSource":"name","classification":"name-rules","brand":"유니폼브릿지","name":"ae mountain jacket olive green","price":119700,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20240906/4414594/4414594_17268175778490_big.jpg?w=600","url":"https://www.musinsa.com/products/4414594","rating":null,"reviews":0,"likes":105,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6081645","slot":"m-trucker","color":"blue","colorSource":"name","classification":"name-rules","brand":"유니폼브릿지","name":"type-3 trucker jacket blue","price":89500,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260304/6081645/6081645_17737254388861_big.jpg?w=600","url":"https://www.musinsa.com/products/6081645","rating":5,"reviews":2,"likes":56,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4190525","slot":"m-cap","color":"green","colorSource":"name","classification":"name-rules","brand":"반츠","name":"앵커 로고 코튼 트윌 빈티지 베이스볼 캡 - 그린","price":48000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20240612/4190525/4190525_17181542543673_big.jpg?w=600","url":"https://www.musinsa.com/products/4190525","rating":5,"reviews":1,"likes":62,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5852715","slot":"m-cap","color":"navy","colorSource":"name","classification":"name-rules","brand":"반츠","name":"앵커 로고 울 플란넬 빈티지 베이스볼 캡 - 네이비","price":88000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20251224/5852715/5852715_17667218406270_big.jpg?w=600","url":"https://www.musinsa.com/products/5852715","rating":null,"reviews":0,"likes":41,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4652547","slot":"m-rugby","color":"red","colorSource":"name","classification":"name-rules","brand":"반츠","name":"SDS 스트라이프 코튼 럭비 티셔츠 - 레드","price":158000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20241206/4652547/4652547_17355439367727_big.jpg?w=600","url":"https://www.musinsa.com/products/4652547","rating":5,"reviews":13,"likes":97,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4598401","slot":"m-down","color":"navy","colorSource":"name","classification":"name-rules","brand":"반츠","name":"SDS 카라코람 다운 파카 with 코요테 퍼 - 네이비","price":798000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20241108/4598401/4598401_17310285153434_big.jpg?w=600","url":"https://www.musinsa.com/products/4598401","rating":5,"reviews":17,"likes":264,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-2700775","slot":"m-tee","color":"olive","colorSource":"name","classification":"name-rules","brand":"반츠","name":"BTB 코튼 라운드 넥 링거 반팔 티셔츠 파일럿 시걸 - 올리브","price":78000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20220805/2700775/2700775_1_big.jpg?w=600","url":"https://www.musinsa.com/products/2700775","rating":5,"reviews":7,"likes":179,"summer":true,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5220917","slot":"m-tee","color":"charcoal","colorSource":"name","classification":"name-rules","brand":"반츠","name":"HDR 슬러브 코튼 티셔츠 반팔 밀러 피쉬 샵 - 차콜","price":78000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250702/5220917/5220917_17514345673048_big.jpg?w=600","url":"https://www.musinsa.com/products/5220917","rating":5,"reviews":6,"likes":32,"summer":true,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5220675","slot":"m-tee","color":"black","colorSource":"name","classification":"name-rules","brand":"반츠","name":"HDR 슬러브 코튼 티셔츠 반팔 밀러 피쉬 샵 - 블랙","price":78000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250702/5220675/5220675_17514343166274_big.jpg?w=600","url":"https://www.musinsa.com/products/5220675","rating":4.5,"reviews":2,"likes":32,"summer":true,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5660842","slot":"m-knit","color":"ivory","colorSource":"name","classification":"name-rules","brand":"반츠","name":"BGS 메리노 울 터틀넥 스웨터 - 아이보리","price":168000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20251029/5660842/5660842_17621468019605_big.jpg?w=600","url":"https://www.musinsa.com/products/5660842","rating":null,"reviews":0,"likes":26,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-3144186","slot":"m-harrington","color":"indigo","colorSource":"name","classification":"name-rules","brand":"리","name":"린넨 데님 블루종 점퍼 인디고 라이트","price":49000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20230313/3144186/3144186_16787788209323_big.jpg?w=600","url":"https://www.musinsa.com/products/3144186","rating":4.8,"reviews":8,"likes":729,"summer":true,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4759431","slot":"m-harrington","color":"beige","colorSource":"name","classification":"name-rules","brand":"리","name":"피그먼트 코튼 자켓 베이지","price":95000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250205/4759431/4759431_17394287898308_big.jpg?w=600","url":"https://www.musinsa.com/products/4759431","rating":5,"reviews":5,"likes":154,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4341034","slot":"m-varsity","color":"navy","colorSource":"name","classification":"name-rules","brand":"리","name":"코듀로이 바시티 자켓 네이비","price":69000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20240819/4341034/4341034_17890213147099_big.jpg?w=600","url":"https://www.musinsa.com/products/4341034","rating":4.9,"reviews":23,"likes":392,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4759432","slot":"m-varsity","color":"indigo","colorSource":"name","classification":"name-rules","brand":"리","name":"바시티 데님 자켓 인디고 미듐","price":99000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250205/4759432/4759432_17387246761710_big.jpg?w=600","url":"https://www.musinsa.com/products/4759432","rating":4.9,"reviews":14,"likes":316,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5512886","slot":"m-varsity","color":"black","colorSource":"name","classification":"name-rules","brand":"리","name":"테디 바시티 자켓 블랙","price":129000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250923/5512886/5512886_17586043590835_big.jpg?w=600","url":"https://www.musinsa.com/products/5512886","rating":5,"reviews":4,"likes":84,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-2792963","slot":"m-hoodie","color":"black","colorSource":"image","classification":"name-rules","brand":"리","name":"캔자스 타이포 스트링 후드티셔츠 다크 파인","price":25000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20220915/2792963/2792963_2_big.jpg?w=600","url":"https://www.musinsa.com/products/2792963","rating":4.6,"reviews":5,"likes":268,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7389917","slot":"m-hoodie","color":"grey","colorSource":"name","classification":"name-rules","brand":"리","name":"스몰 트위치 로고 기모 후드 집업 그레이","price":99000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260922/7389917/7389917_17900451166652_big.jpg?w=600","url":"https://www.musinsa.com/products/7389917","rating":5,"reviews":1,"likes":130,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6461334","slot":"m-belt","color":"black","colorSource":"name","classification":"name-rules","brand":"리","name":"유니 베이직 레더 벨트 블랙","price":45000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260512/6461334/6461334_17803888053281_big.jpg?w=600","url":"https://www.musinsa.com/products/6461334","rating":5,"reviews":1,"likes":46,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-3529489","slot":"m-cap","color":"ivory","colorSource":"name","classification":"name-rules","brand":"리","name":"코듀로이 볼캡 아이보리","price":19000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20230905/3529489/3529489_16938807581079_big.jpg?w=600","url":"https://www.musinsa.com/products/3529489","rating":4.7,"reviews":28,"likes":692,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7389344","slot":"m-cap","color":"blue","colorSource":"name","classification":"name-rules","brand":"리","name":"스몰 트위치 로고 코튼 볼캡 블루","price":39000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260922/7389344/7389344_17900428466139_big.jpg?w=600","url":"https://www.musinsa.com/products/7389344","rating":null,"reviews":0,"likes":19,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-3832226","slot":"m-cargo","color":"charcoal","colorSource":"name","classification":"name-rules","brand":"리","name":"립스탑 밀리터리 카고 팬츠 차콜","price":35000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20240130/3832226/3832226_17071944856721_big.jpg?w=600","url":"https://www.musinsa.com/products/3832226","rating":4.8,"reviews":12,"likes":137,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4343739","slot":"m-denim","color":"black","colorSource":"correction","classification":"name-rules","brand":"리","name":"데님 이지 팬츠 블랙 워시드","price":39000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20240819/4343739/4343739_17241464492336_big.jpg?w=600","url":"https://www.musinsa.com/products/4343739","rating":5,"reviews":5,"likes":83,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4343737","slot":"m-denim","color":"indigo","colorSource":"name","classification":"name-rules","brand":"리","name":"데님 이지 팬츠 인디고 미듐","price":39000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20240819/4343737/4343737_17241464581952_big.jpg?w=600","url":"https://www.musinsa.com/products/4343737","rating":5,"reviews":2,"likes":57,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5463387","slot":"m-knit","color":"blue","colorSource":"name","classification":"name-rules","brand":"리","name":"보카시 라운드 니트 블루","price":69000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250915/5463387/5463387_17579293784487_big.jpg?w=600","url":"https://www.musinsa.com/products/5463387","rating":5,"reviews":6,"likes":332,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-3036719","slot":"m-knit","color":"blue","colorSource":"name","classification":"name-rules","brand":"리","name":"스카시 풀오버 니트 블루","price":25000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20230125/3036719/3036719_16766159322296_big.jpg?w=600","url":"https://www.musinsa.com/products/3036719","rating":null,"reviews":0,"likes":76,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-3864943","slot":"m-trucker","color":"beige","colorSource":"name","classification":"name-rules","brand":"리","name":"나일론 트러커 자켓 베이지","price":59000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20240213/3864943/3864943_17078183952925_big.jpg?w=600","url":"https://www.musinsa.com/products/3864943","rating":4.8,"reviews":5,"likes":158,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6003709","slot":"m-trucker","color":"indigo","colorSource":"name","classification":"name-rules","brand":"리","name":"[101st] 카우보이 쿠로키 데님 자켓 인디고 미듐","price":223200,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260210/6003709/6003709_17709720560091_big.jpg?w=600","url":"https://www.musinsa.com/products/6003709","rating":null,"reviews":0,"likes":149,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-3029401","slot":"m-chino","color":"black","colorSource":"name","classification":"name-rules","brand":"리","name":"코튼 테이퍼드 치노 팬츠 블랙","price":25000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20230117/3029401/3029401_16750529823997_big.jpg?w=600","url":"https://www.musinsa.com/products/3029401","rating":4.9,"reviews":46,"likes":140,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4299845","slot":"m-chino","color":"olive","colorSource":"name","classification":"name-rules","brand":"리","name":"옥스포드 웨빙 팬츠 올리브","price":35000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20240806/4299845/4299845_17261036132678_big.jpg?w=600","url":"https://www.musinsa.com/products/4299845","rating":4.8,"reviews":5,"likes":73,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4773556","slot":"m-chino","color":"beige","colorSource":"name","classification":"name-rules","brand":"리","name":"코튼 이지 스트링 팬츠 베이지","price":29000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250210/4773556/4773556_17393358105330_big.jpg?w=600","url":"https://www.musinsa.com/products/4773556","rating":5,"reviews":1,"likes":28,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7024989","slot":"m-longtee","color":"grey","colorSource":"name","classification":"name-rules","brand":"리","name":"멀티 스트라이프 긴팔 티셔츠 그레이","price":69000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260807/7024989/7024989_17864401374021_big.jpg?w=600","url":"https://www.musinsa.com/products/7024989","rating":5,"reviews":1,"likes":73,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4737283","slot":"m-tee","color":"grey","colorSource":"name","classification":"name-rules","brand":"리","name":"빈티지 로고 티셔츠 라이트 그레이","price":25000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250122/4737283/4737283_17375294079932_big.jpg?w=600","url":"https://www.musinsa.com/products/4737283","rating":4.7,"reviews":6,"likes":169,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5553525","slot":"m-down","color":"ivory","colorSource":"name","classification":"name-rules","brand":"리","name":"어센틱 다운 아이보리","price":159000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250930/5553525/5553525_17683835354296_big.jpg?w=600","url":"https://www.musinsa.com/products/5553525","rating":4.9,"reviews":16,"likes":625,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5553526","slot":"m-down","color":"black","colorSource":"name","classification":"name-rules","brand":"리","name":"어센틱 다운 블랙","price":159000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250930/5553526/5553526_17683835244922_big.jpg?w=600","url":"https://www.musinsa.com/products/5553526","rating":4.8,"reviews":92,"likes":2,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4479813","slot":"m-down","color":"ivory","colorSource":"name","classification":"name-rules","brand":"리","name":"다이아 다운 아이보리","price":95000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20241002/4479813/4479813_17322436324202_big.jpg?w=600","url":"https://www.musinsa.com/products/4479813","rating":4.9,"reviews":19,"likes":483,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-3879920","slot":"m-cardigan","color":"black","colorSource":"name","classification":"name-rules","brand":"리","name":"스카시 반팔 가디건 블랙","price":29000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20240219/3879920/3879920_17083980649504_big.jpg?w=600","url":"https://www.musinsa.com/products/3879920","rating":4.7,"reviews":26,"likes":374,"summer":true,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4343807","slot":"m-cardigan","color":"brown","colorSource":"name","classification":"name-rules","brand":"리","name":"하이넥 집업 가디건 브라운","price":55000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20240819/4343807/4343807_17241461268842_big.jpg?w=600","url":"https://www.musinsa.com/products/4343807","rating":4.5,"reviews":6,"likes":151,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5327314","slot":"m-cable","color":"navy","colorSource":"name","classification":"name-rules","brand":"리","name":"케이블 라운드 니트 네이비","price":99000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250814/5327314/5327314_17562579310080_big.jpg?w=600","url":"https://www.musinsa.com/products/5327314","rating":5,"reviews":5,"likes":121,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4315008","slot":"m-tee","color":"black","colorSource":"name","classification":"name-rules","brand":"챔피온","name":"베이직 반팔 티셔츠 2팩 Black/Black","price":29400,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20240809/4315008/4315008_17472063823626_big.jpg?w=600","url":"https://www.musinsa.com/products/4315008","rating":4.7,"reviews":53,"likes":667,"summer":true,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6475721","slot":"m-tee","color":"black","colorSource":"name","classification":"name-rules","brand":"챔피온","name":"챔피온 X 루니툰즈 반팔 티셔츠 마빈 Black","price":44000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260514/6475721/6475721_17830670918741_big.jpg?w=600","url":"https://www.musinsa.com/products/6475721","rating":4.8,"reviews":10,"likes":332,"summer":true,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4319913","slot":"m-tee","color":"charcoal","colorSource":"name","classification":"name-rules","brand":"챔피온","name":"브이넥 웜업 나일론 풀오버 티셔츠 Charcoal Grey","price":70900,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20240812/4319913/4319913_17471130859587_big.jpg?w=600","url":"https://www.musinsa.com/products/4319913","rating":5,"reviews":3,"likes":93,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4468625","slot":"m-sweat","color":"navy","colorSource":"name","classification":"name-rules","brand":"챔피온","name":"리버스위브 럭비 스웨트셔츠 Normal Navy","price":122500,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20240926/4468625/4468625_17471136933462_big.jpg?w=600","url":"https://www.musinsa.com/products/4468625","rating":4.7,"reviews":9,"likes":669,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5607668","slot":"m-denim","color":"blue","colorSource":"correction","classification":"name-rules","brand":"챔피온","name":"헤리티지 릴렉스핏 데님 팬츠 Blue","price":83400,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20251017/5607668/5607668_17610197079982_big.jpg?w=600","url":"https://www.musinsa.com/products/5607668","rating":4.7,"reviews":6,"likes":157,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6192515","slot":"m-runner","color":"red","colorSource":"name","classification":"correction","brand":"챔피온","name":"T 트레이너 스니커즈 Red","price":76300,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260325/6192515/6192515_17750343664506_big.jpg?w=600","url":"https://www.musinsa.com/products/6192515","rating":null,"reviews":0,"likes":159,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6015173","slot":"m-cap","color":"navy","colorSource":"name","classification":"name-rules","brand":"챔피온","name":"헤리티지 R 아플리케 볼캡 Navy","price":41300,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260212/6015173/6015173_17738181723951_big.jpg?w=600","url":"https://www.musinsa.com/products/6015173","rating":4.5,"reviews":8,"likes":157,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7180889","slot":"m-down","color":"grey","colorSource":"name","classification":"name-rules","brand":"챔피온","name":"헤리티지 프리마로프트 몬스터파카 Grey","price":269100,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260827/7180889/7180889_17900393998866_big.jpg?w=600","url":"https://www.musinsa.com/products/7180889","rating":null,"reviews":0,"likes":11,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-3105989","slot":"m-cargo","color":"black","colorSource":"name","classification":"name-rules","brand":"챔피온","name":"우븐 립스탑 카고 팬츠 Black","price":52100,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20230224/3105989/3105989_17467645651531_big.jpg?w=600","url":"https://www.musinsa.com/products/3105989","rating":5,"reviews":5,"likes":149,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-3653584","slot":"m-workboots","color":"black","colorSource":"name","classification":"name-rules","brand":"레드윙","name":"레드윙 X 올리버 6인치 목토 - 이누이트 블랙","price":748000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20231024/3653584/3653584_17017574909368_big.jpg?w=600","url":"https://www.musinsa.com/products/3653584","rating":null,"reviews":0,"likes":42,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6379348","slot":"m-workboots","color":"beige","colorSource":"name","classification":"name-rules","brand":"레드윙","name":"6인치 목토 8838 - 샌드스톤 모하비","price":520200,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260427/6379348/6379348_17772527192355_big.jpg?w=600","url":"https://www.musinsa.com/products/6379348","rating":null,"reviews":0,"likes":40,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4865846","slot":"m-workboots","color":"grey","colorSource":"correction","classification":"name-rules","brand":"레드윙","name":"6인치 목토 8800 - 더스티 블루 애빌린","price":520200,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250306/4865846/4865846_17412430116207_big.jpg?w=600","url":"https://www.musinsa.com/products/4865846","rating":4,"reviews":1,"likes":69,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5449884","slot":"m-derby","color":"brown","colorSource":"image","classification":"correction","brand":"레드윙","name":"위켄더 옥스포드 3606 - 초콜렛 뮬스키너","price":430200,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250912/5449884/5449884_17576479289356_big.jpg?w=600","url":"https://www.musinsa.com/products/5449884","rating":null,"reviews":0,"likes":53,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6379376","slot":"m-derby","color":"beige","colorSource":"name","classification":"correction","brand":"레드윙","name":"위켄더 옥스포드 3318 - 샌드스톤 모하비","price":430200,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260427/6379376/6379376_17772528539233_big.jpg?w=600","url":"https://www.musinsa.com/products/6379376","rating":null,"reviews":0,"likes":13,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-3654689","slot":"m-belt","color":"beige","colorSource":"correction","classification":"name-rules","brand":"레드윙","name":"가죽벨트 96518 - 호손 뮬스키너","price":173000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20231024/3654689/3654689_16981377780245_big.jpg?w=600","url":"https://www.musinsa.com/products/3654689","rating":5,"reviews":13,"likes":118,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6584868","slot":"m-tee","color":"red","colorSource":"name","classification":"name-rules","brand":"파르티멘토","name":"로우 엣지 포켓 티 버건디","price":39900,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260601/6584868/6584868_17805367068519_big.jpg?w=600","url":"https://www.musinsa.com/products/6584868","rating":5,"reviews":3,"likes":58,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6030125","slot":"m-henley","color":"black","colorSource":"name","classification":"name-rules","brand":"파르티멘토","name":"와플 헨리 롱 슬리브 블랙","price":64900,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260219/6030125/6030125_17717722346891_big.jpg?w=600","url":"https://www.musinsa.com/products/6030125","rating":5,"reviews":3,"likes":220,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6030124","slot":"m-henley","color":"charcoal","colorSource":"name","classification":"name-rules","brand":"파르티멘토","name":"와플 헨리 롱 슬리브 차콜","price":64900,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260219/6030124/6030124_17717722434115_big.jpg?w=600","url":"https://www.musinsa.com/products/6030124","rating":null,"reviews":0,"likes":257,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5627496","slot":"m-harrington","color":"ivory","colorSource":"name","classification":"name-rules","brand":"파르티멘토","name":"100% 울 니트 집업 자켓 아이보리","price":129900,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20251022/5627496/5627496_17612335234501_big.jpg?w=600","url":"https://www.musinsa.com/products/5627496","rating":2,"reviews":3,"likes":716,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7260531","slot":"m-rugby","color":"beige","colorSource":"name","classification":"name-rules","brand":"파르티멘토","name":"블록 스트라이프 럭비 롱슬리브 토프","price":39900,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260907/7260531/7260531_17887586005267_big.jpg?w=600","url":"https://www.musinsa.com/products/7260531","rating":null,"reviews":0,"likes":61,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7156751","slot":"m-work-pants","color":"purple","colorSource":"name","classification":"name-rules","brand":"파르티멘토","name":"덕 캔버스 카펜터 팬츠 더스트 퍼플","price":99900,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260825/7156751/7156751_17877908293743_big.jpg?w=600","url":"https://www.musinsa.com/products/7156751","rating":null,"reviews":0,"likes":59,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6476064","slot":"m-cap","color":"navy","colorSource":"name","classification":"name-rules","brand":"파르티멘토","name":"VTG 워시드 리뉴얼 INP 볼 캡 네이비","price":29900,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260514/6476064/6476064_17787643316011_big.jpg?w=600","url":"https://www.musinsa.com/products/6476064","rating":4.9,"reviews":33,"likes":442,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6030076","slot":"m-cap","color":"black","colorSource":"name","classification":"name-rules","brand":"파르티멘토","name":"VTG 워시드 스테인 볼 캡 블랙","price":29900,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260219/6030076/6030076_17717722841683_big.jpg?w=600","url":"https://www.musinsa.com/products/6030076","rating":4.9,"reviews":28,"likes":403,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6030073","slot":"m-cap","color":"brown","colorSource":"name","classification":"name-rules","brand":"파르티멘토","name":"VTG 워시드 스테인 볼 캡 브라운 카키","price":29900,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260219/6030073/6030073_17717723121593_big.jpg?w=600","url":"https://www.musinsa.com/products/6030073","rating":5,"reviews":8,"likes":180,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-3321759","slot":"m-denim","color":"blue","colorSource":"correction","classification":"name-rules","brand":"파르티멘토","name":"디스트로이드 와이드 스트레이트 데님 팬츠 딤 블루","price":104100,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20230524/3321759/3321759_16850633381171_big.jpg?w=600","url":"https://www.musinsa.com/products/3321759","rating":4.7,"reviews":6,"likes":423,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5967370","slot":"m-denim","color":"black","colorSource":"correction","classification":"name-rules","brand":"파르티멘토","name":"[13oz] 스트레이트 플레어 데님 팬츠 솔리드 블랙","price":85900,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260202/5967370/5967370_17702533273618_big.jpg?w=600","url":"https://www.musinsa.com/products/5967370","rating":5,"reviews":2,"likes":87,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5967371","slot":"m-denim","color":"black","colorSource":"correction","classification":"name-rules","brand":"파르티멘토","name":"[14oz] 스트레이트 플레어 데님 팬츠 페이디드 블랙","price":85900,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260202/5967371/5967371_17702533092446_big.jpg?w=600","url":"https://www.musinsa.com/products/5967371","rating":5,"reviews":3,"likes":66,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7156740","slot":"m-stripe-shirt","color":"brown","colorSource":"name","classification":"name-rules","brand":"파르티멘토","name":"패널 스트라이프 숏 카라 셔츠 브라운","price":64900,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260825/7156740/7156740_17877923310816_big.jpg?w=600","url":"https://www.musinsa.com/products/7156740","rating":null,"reviews":0,"likes":43,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6005792","slot":"m-hoodie","color":"charcoal","colorSource":"name","classification":"name-rules","brand":"파르티멘토","name":"와플 레이어드 후디 차콜","price":55900,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260210/6005792/6005792_17708544162759_big.jpg?w=600","url":"https://www.musinsa.com/products/6005792","rating":4.5,"reviews":2,"likes":158,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6005105","slot":"m-hoodie","color":"black","colorSource":"name","classification":"name-rules","brand":"파르티멘토","name":"애프터 디스트레스드 후디 블랙","price":104900,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260210/6005105/6005105_17708551474435_big.jpg?w=600","url":"https://www.musinsa.com/products/6005105","rating":5,"reviews":1,"likes":64,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6005104","slot":"m-hoodie","color":"grey","colorSource":"name","classification":"name-rules","brand":"파르티멘토","name":"애프터 디스트레스드 후디 그레이","price":104900,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260210/6005104/6005104_17708551576429_big.jpg?w=600","url":"https://www.musinsa.com/products/6005104","rating":null,"reviews":0,"likes":80,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7059293","slot":"m-longtee","color":"black","colorSource":"name","classification":"name-rules","brand":"파르티멘토","name":"로우 엣지 포켓 롱 슬리브 블랙","price":32900,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260812/7059293/7059293_17865177758139_big.jpg?w=600","url":"https://www.musinsa.com/products/7059293","rating":4.8,"reviews":12,"likes":201,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7156746","slot":"m-longtee","color":"charcoal","colorSource":"name","classification":"name-rules","brand":"파르티멘토","name":"트리플 스트라이프 롱 슬리브 차콜 브라운","price":39900,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260825/7156746/7156746_17877916800330_big.jpg?w=600","url":"https://www.musinsa.com/products/7156746","rating":null,"reviews":0,"likes":53,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6426735","slot":"m-shell","color":"pink","colorSource":"name","classification":"name-rules","brand":"파르티멘토","name":"[여름] 에어 쉘 자켓 더스티 핑크","price":85900,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260506/6426735/6426735_17781553218801_big.jpg?w=600","url":"https://www.musinsa.com/products/6426735","rating":null,"reviews":0,"likes":53,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6426729","slot":"m-shell","color":"grey","colorSource":"name","classification":"name-rules","brand":"파르티멘토","name":"[여름] 에어 쉘 자켓 애쉬 그레이","price":85900,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260506/6426729/6426729_17781553399992_big.jpg?w=600","url":"https://www.musinsa.com/products/6426729","rating":null,"reviews":0,"likes":42,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6005154","slot":"m-sweat","color":"black","colorSource":"name","classification":"name-rules","brand":"파르티멘토","name":"컷 오프 후드 스웨트셔츠 블랙","price":89900,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260210/6005154/6005154_17708551114706_big.jpg?w=600","url":"https://www.musinsa.com/products/6005154","rating":5,"reviews":1,"likes":86,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6029986","slot":"m-cardigan","color":"purple","colorSource":"name","classification":"name-rules","brand":"파르티멘토","name":"V 넥 니트 가디건 퍼플","price":54900,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260219/6029986/6029986_17717724120451_big.jpg?w=600","url":"https://www.musinsa.com/products/6029986","rating":5,"reviews":1,"likes":78,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6111015","slot":"m-cap","color":"navy","colorSource":"name","classification":"name-rules","brand":"프리즘웍스","name":"FIGHTER SQ BALL CAP NAVY","price":29400,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260310/6111015/6111015_17733195593967_big.jpg?w=600","url":"https://www.musinsa.com/products/6111015","rating":4.8,"reviews":4,"likes":526,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6075591","slot":"m-shell","color":"red","colorSource":"name","classification":"name-rules","brand":"프리즘웍스","name":"MICRO RIPSTOP ANORAK BRICK","price":96600,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260303/6075591/6075591_17727677459605_big.jpg?w=600","url":"https://www.musinsa.com/products/6075591","rating":5,"reviews":8,"likes":333,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7309424","slot":"m-shell","color":"beige","colorSource":"name","classification":"name-rules","brand":"프리즘웍스","name":"MOCK NECK FLEECE ANORAK PARKA BEIGE","price":86000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260911/7309424/7309424_17897149528203_big.jpg?w=600","url":"https://www.musinsa.com/products/7309424","rating":null,"reviews":0,"likes":28,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-2387339","slot":"m-sweat","color":"navy","colorSource":"name","classification":"name-rules","brand":"프리즘웍스","name":"OG HEAVYWEIGHT SWEATSHIRT 002 NAVY","price":62000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20220227/2387339/2387339_16771360967395_big.jpg?w=600","url":"https://www.musinsa.com/products/2387339","rating":4.8,"reviews":217,"likes":2,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-3081513","slot":"m-sweat","color":"purple","colorSource":"name","classification":"name-rules","brand":"프리즘웍스","name":"OG PIGMENT DYEING SWEATSHIRT 003 PURPLE","price":69000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20230214/3081513/3081513_16771305116129_big.jpg?w=600","url":"https://www.musinsa.com/products/3081513","rating":5,"reviews":37,"likes":218,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-3612718","slot":"m-sweat","color":"navy","colorSource":"name","classification":"name-rules","brand":"프리즘웍스","name":"COLLAR LAYERED SWEATSHIRT NAVY","price":34500,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20231009/3612718/3612718_16975565780803_big.jpg?w=600","url":"https://www.musinsa.com/products/3612718","rating":4.9,"reviews":16,"likes":269,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4478766","slot":"m-down","color":"green","colorSource":"name","classification":"name-rules","brand":"프리즘웍스","name":"SMOCK PUFFER DOWN PARKA DARK GREEN","price":173400,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20240930/4478766/4478766_17291566315486_big.jpg?w=600","url":"https://www.musinsa.com/products/4478766","rating":4.8,"reviews":84,"likes":941,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7309631","slot":"m-down","color":"black","colorSource":"name","classification":"name-rules","brand":"프리즘웍스","name":"BREEZE GOOSE DOWN PARKA BLACK","price":268000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260911/7309631/7309631_17897144374762_big.jpg?w=600","url":"https://www.musinsa.com/products/7309631","rating":null,"reviews":0,"likes":40,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-2871111","slot":"m-knit","color":"brown","colorSource":"name","classification":"name-rules","brand":"프리즘웍스","name":"ALPACA BOUCLE KNIT BROWN","price":65400,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20221018/2871111/2871111_1_big.jpg?w=600","url":"https://www.musinsa.com/products/2871111","rating":4.9,"reviews":47,"likes":839,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7202132","slot":"m-knit","color":"brown","colorSource":"image","classification":"name-rules","brand":"프리즘웍스","name":"GRADATION BOUCLE KNIT SUNSET","price":138000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260831/7202132/7202132_17884353936894_big.jpg?w=600","url":"https://www.musinsa.com/products/7202132","rating":5,"reviews":1,"likes":40,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4849119","slot":"m-work-pants","color":"black","colorSource":"name","classification":"name-rules","brand":"프리즘웍스","name":"CANVAS FRENCH WORK PANTS BLACK","price":65400,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250228/4849119/4849119_17411540687957_big.jpg?w=600","url":"https://www.musinsa.com/products/4849119","rating":4.9,"reviews":10,"likes":137,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-1811198","slot":"m-chino","color":"olive","colorSource":"name","classification":"name-rules","brand":"프리즘웍스","name":"TWILL BALLOON PANTS OLIVE","price":65000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20210223/1811198/1811198_1_big.jpg?w=600","url":"https://www.musinsa.com/products/1811198","rating":null,"reviews":0,"likes":3,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-2164234","slot":"m-hoodie","color":"green","colorSource":"name","classification":"name-rules","brand":"프리즘웍스","name":"SPLASH PAINTING HOODY DARK GREEN","price":44500,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20211006/2164234/2164234_1_big.jpg?w=600","url":"https://www.musinsa.com/products/2164234","rating":4.7,"reviews":34,"likes":715,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4422924","slot":"m-hoodie","color":"brown","colorSource":"name","classification":"name-rules","brand":"프리즘웍스","name":"OG BOCACI HEAVYWEIGHT HOOD ZIP UP PARKA DARK BROWN","price":98000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20240909/4422924/4422924_17261094429029_big.jpg?w=600","url":"https://www.musinsa.com/products/4422924","rating":4.6,"reviews":5,"likes":511,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6111052","slot":"m-hoodie","color":"beige","colorSource":"name","classification":"name-rules","brand":"프리즘웍스","name":"WAFFLE HOOD ZIP UP PARKA BEIGE","price":68600,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260310/6111052/6111052_17733189070623_big.jpg?w=600","url":"https://www.musinsa.com/products/6111052","rating":5,"reviews":6,"likes":72,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5381348","slot":"m-balmacaan","color":"beige","colorSource":"name","classification":"name-rules","brand":"프리즘웍스","name":"SUEDE FRENCH CAR COAT CAMEL","price":272300,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250830/5381348/5381348_17568034314503_big.jpg?w=600","url":"https://www.musinsa.com/products/5381348","rating":4.8,"reviews":6,"likes":290,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-3863339","slot":"m-cardigan","color":"navy","colorSource":"name","classification":"name-rules","brand":"프리즘웍스","name":"PIGMENT DYEING HEAVYWEIGHT CARDIGAN NAVY","price":49000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20240213/3863339/3863339_17079295173233_big.jpg?w=600","url":"https://www.musinsa.com/products/3863339","rating":4.9,"reviews":75,"likes":632,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6044971","slot":"m-cardigan","color":"grey","colorSource":"name","classification":"name-rules","brand":"프리즘웍스","name":"ULTRA HEAVYWEIGHT ZIP UP CARDIGAN LIGHT GRAY","price":134400,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260223/6044971/6044971_17720090778453_big.jpg?w=600","url":"https://www.musinsa.com/products/6044971","rating":5,"reviews":1,"likes":409,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7148370","slot":"m-trucker","color":"grey","colorSource":"image","classification":"name-rules","brand":"프리즘웍스","name":"HEAVY CANVAS STORM TRUCKER JACKET MUD","price":179000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260824/7148370/7148370_17878919243840_big.jpg?w=600","url":"https://www.musinsa.com/products/7148370","rating":5,"reviews":1,"likes":139,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5381316","slot":"m-longtee","color":"charcoal","colorSource":"name","classification":"name-rules","brand":"프리즘웍스","name":"RN LONG SLEEVE TEE DARK GRAY","price":32400,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250830/5381316/5381316_17568047968910_big.jpg?w=600","url":"https://www.musinsa.com/products/5381316","rating":5,"reviews":13,"likes":251,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5097925","slot":"m-tee","color":"charcoal","colorSource":"name","classification":"name-rules","brand":"프리즘웍스","name":"CIGARETTE POCKET PIGMENT DYEING TEE CHARCOAL","price":27000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250509/5097925/5097925_17472729934705_big.jpg?w=600","url":"https://www.musinsa.com/products/5097925","rating":4.9,"reviews":18,"likes":258,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5381320","slot":"m-tee","color":"brown","colorSource":"name","classification":"name-rules","brand":"프리즘웍스","name":"LOOP PATCH STRIPE TEE MOCHA","price":41400,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250830/5381320/5381320_17568046881817_big.jpg?w=600","url":"https://www.musinsa.com/products/5381320","rating":5,"reviews":2,"likes":154,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5082677","slot":"m-tee","color":"black","colorSource":"name","classification":"name-rules","brand":"프리즘웍스","name":"RAGLAN SWEAT HALF TEE VINTAGE BLACK","price":32400,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250430/5082677/5082677_17461229924188_big.jpg?w=600","url":"https://www.musinsa.com/products/5082677","rating":5,"reviews":2,"likes":54,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-3870109","slot":"m-chambray","color":"white","colorSource":"name","classification":"name-rules","brand":"프리즘웍스","name":"CIGARETTE POCKET CHAMBRAY SHIRT WHITE","price":89000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20240215/3870109/3870109_17090023319761_big.jpg?w=600","url":"https://www.musinsa.com/products/3870109","rating":4.8,"reviews":49,"likes":470,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7201737","slot":"m-rugby","color":"grey","colorSource":"name","classification":"name-rules","brand":"프리즘웍스","name":"NATIONAL AIR MAIL WEEK RUGBY TEE GRAY","price":58000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260831/7201737/7201737_17884357181826_big.jpg?w=600","url":"https://www.musinsa.com/products/7201737","rating":5,"reviews":1,"likes":54,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-1582137","slot":"m-denim-raw","color":"blue","colorSource":"name","classification":"name-rules","brand":"프리즘웍스","name":"OG SELVEDGE REGULAR DENIM PANTS LIGHT BLUE","price":98000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20200903/1582137/1582137_17192821865309_big.jpg?w=600","url":"https://www.musinsa.com/products/1582137","rating":4.7,"reviews":235,"likes":1,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-983196","slot":"m-cargo","color":"black","colorSource":"name","classification":"name-rules","brand":"프리즘웍스","name":"CARGO STRING PANTS BLACK","price":62000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20190314/983196/983196_2_big.jpg?w=600","url":"https://www.musinsa.com/products/983196","rating":null,"reviews":0,"likes":0,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6044926","slot":"m-henley","color":"ivory","colorSource":"name","classification":"name-rules","brand":"프리즘웍스","name":"HENLEY NECK HALF TEE OATMEAL","price":34000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260223/6044926/6044926_17724378985191_big.jpg?w=600","url":"https://www.musinsa.com/products/6044926","rating":4.5,"reviews":26,"likes":225,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5381329","slot":"m-chore","color":"black","colorSource":"name","classification":"name-rules","brand":"프리즘웍스","name":"COATED WORK SHIRT JACKET BLACK","price":76800,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250830/5381329/5381329_17568044049138_big.jpg?w=600","url":"https://www.musinsa.com/products/5381329","rating":5,"reviews":6,"likes":203,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5283211","slot":"m-denim-raw","color":"black","colorSource":"name","classification":"name-rules","brand":"아웃스탠딩","name":"40S SELVEDGE STRAIGHT PANTS BLACK","price":125100,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250731/5283211/5283211_17657597082916_big.jpg?w=600","url":"https://www.musinsa.com/products/5283211","rating":4.9,"reviews":220,"likes":3,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6941702","slot":"m-denim-raw","color":"blue","colorSource":"name","classification":"name-rules","brand":"아웃스탠딩","name":"30S CINCH BACK SELVEDGE WIDE PANTS MEDIUM BLUE","price":143100,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260728/6941702/6941702_17860688444016_big.jpg?w=600","url":"https://www.musinsa.com/products/6941702","rating":4.9,"reviews":35,"likes":945,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4261761","slot":"m-denim-raw","color":"indigo","colorSource":"name","classification":"name-rules","brand":"아웃스탠딩","name":"W.W. II SELVEDGE STRAIGHT PANTS INDIGO","price":125100,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20240719/4261761/4261761_17682658838869_big.jpg?w=600","url":"https://www.musinsa.com/products/4261761","rating":null,"reviews":0,"likes":1,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5312507","slot":"m-longtee","color":"black","colorSource":"name","classification":"name-rules","brand":"아웃스탠딩","name":"MIL SERIES LONG SLEEVE(MID WAY) BLACK","price":58500,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250812/5312507/5312507_17718465280450_big.jpg?w=600","url":"https://www.musinsa.com/products/5312507","rating":4.8,"reviews":83,"likes":858,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4261906","slot":"m-longtee","color":"navy","colorSource":"name","classification":"name-rules","brand":"아웃스탠딩","name":"STRIPE CREW NECK LONG SLEEVE TEE OLIVE/NAVY","price":55800,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20240719/4261906/4261906_17688066936253_big.jpg?w=600","url":"https://www.musinsa.com/products/4261906","rating":4.8,"reviews":158,"likes":1,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6989123","slot":"m-longtee","color":"charcoal","colorSource":"name","classification":"name-rules","brand":"아웃스탠딩","name":"MIL SERIES LONG SLEEVE(BOMBING CAT) PIGMENT CHARCOAL","price":66600,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260804/6989123/6989123_17866733353664_big.jpg?w=600","url":"https://www.musinsa.com/products/6989123","rating":5,"reviews":5,"likes":323,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4736344","slot":"m-field","color":"olive","colorSource":"name","classification":"name-rules","brand":"아웃스탠딩","name":"2ND POPLIN JUNGLE FATIGUE JACKET OLIVE","price":120600,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250122/4736344/4736344_17870178124670_big.jpg?w=600","url":"https://www.musinsa.com/products/4736344","rating":4.8,"reviews":369,"likes":3,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5392231","slot":"m-field","color":"olive","colorSource":"name","classification":"name-rules","brand":"아웃스탠딩","name":"1ST TYPE M-65 FIELD JACKET OLIVE","price":205200,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250902/5392231/5392231_17870153176881_big.jpg?w=600","url":"https://www.musinsa.com/products/5392231","rating":4.7,"reviews":117,"likes":3,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5441522","slot":"m-field","color":"black","colorSource":"name","classification":"name-rules","brand":"아웃스탠딩","name":"M-65 FISHTAIL PARKA BLACK","price":250200,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250911/5441522/5441522_17892996275099_big.jpg?w=600","url":"https://www.musinsa.com/products/5441522","rating":4.6,"reviews":24,"likes":1,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4693591","slot":"m-trucker","color":"indigo","colorSource":"name","classification":"name-rules","brand":"아웃스탠딩","name":"SELVEDGE DENIM 1ST JACKET INDIGO","price":152100,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250102/4693591/4693591_17860676827501_big.jpg?w=600","url":"https://www.musinsa.com/products/4693591","rating":null,"reviews":0,"likes":9,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4423404","slot":"m-hoodie","color":"black","colorSource":"name","classification":"name-rules","brand":"아웃스탠딩","name":"AUTHENTIC COMFORT HOOD SWEAT BLACK","price":75600,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20240910/4423404/4423404_17709461791327_big.jpg?w=600","url":"https://www.musinsa.com/products/4423404","rating":4.8,"reviews":69,"likes":725,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4721704","slot":"m-hoodie","color":"grey","colorSource":"name","classification":"name-rules","brand":"아웃스탠딩","name":"MIGHTY TIGER LOGO HOOD SWEAT 3%MELANGE GRAY","price":84600,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250115/4721704/4721704_17709472035509_big.jpg?w=600","url":"https://www.musinsa.com/products/4721704","rating":4.9,"reviews":84,"likes":3,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-3060023","slot":"m-chino","color":"olive","colorSource":"name","classification":"name-rules","brand":"아웃스탠딩","name":"OFFICER CHINO PANTS OLIVE GREEN","price":97200,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20230203/3060023/3060023_17706044099732_big.jpg?w=600","url":"https://www.musinsa.com/products/3060023","rating":4.8,"reviews":236,"likes":1,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5441768","slot":"m-chore","color":"blue","colorSource":"name","classification":"name-rules","brand":"아웃스탠딩","name":"MOLESKIN FRENCH WORK JACKET WASHED BLUE","price":151200,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250911/5441768/5441768_17708709973646_big.jpg?w=600","url":"https://www.musinsa.com/products/5441768","rating":4.9,"reviews":290,"likes":2,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7219236","slot":"m-slacks","color":"brown","colorSource":"name","classification":"name-rules","brand":"아웃스탠딩","name":"WOOL HERRINGBONE OFFICER TROUSERS D.BROWN","price":111600,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260901/7219236/7219236_17893506952662_big.jpg?w=600","url":"https://www.musinsa.com/products/7219236","rating":null,"reviews":0,"likes":127,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7219297","slot":"m-knit","color":"brown","colorSource":"name","classification":"name-rules","brand":"아웃스탠딩","name":"HALF ZIP-UP KNIT SWEATER BROWN","price":80100,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260901/7219297/7219297_17893493443780_big.jpg?w=600","url":"https://www.musinsa.com/products/7219297","rating":null,"reviews":0,"likes":70,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7219447","slot":"m-knit","color":"charcoal","colorSource":"name","classification":"name-rules","brand":"아웃스탠딩","name":"SOFT YARN MOCK NECK KNIT SWEATER CHARCOAL","price":97200,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260901/7219447/7219447_17893487639511_big.jpg?w=600","url":"https://www.musinsa.com/products/7219447","rating":null,"reviews":0,"likes":59,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4641446","slot":"m-belt","color":"black","colorSource":"name","classification":"name-rules","brand":"아웃스탠딩","name":"OSTD BRAIDED BELT BLACK","price":52200,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20241128/4641446/4641446_17688054890829_big.jpg?w=600","url":"https://www.musinsa.com/products/4641446","rating":4.9,"reviews":61,"likes":509,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5014917","slot":"m-henley","color":"white","colorSource":"name","classification":"name-rules","brand":"아웃스탠딩","name":"HENLEY NECK HALF SLEEVE TEE OFF WHITE","price":36000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250411/5014917/5014917_17708724290017_big.jpg?w=600","url":"https://www.musinsa.com/products/5014917","rating":4.9,"reviews":81,"likes":537,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6132064","slot":"m-henley","color":"black","colorSource":"name","classification":"name-rules","brand":"아웃스탠딩","name":"VINTAGE HENLEY NECK HALF SLEEVE TEE BLACK","price":33600,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260313/6132064/6132064_17742332169458_big.jpg?w=600","url":"https://www.musinsa.com/products/6132064","rating":4.7,"reviews":65,"likes":734,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5407447","slot":"m-beanie","color":"black","colorSource":"name","classification":"name-rules","brand":"아웃스탠딩","name":"A-4 TYPE MILITARY WATCH CAP BLACK","price":35100,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250905/5407447/5407447_17893476119995_big.jpg?w=600","url":"https://www.musinsa.com/products/5407447","rating":5,"reviews":6,"likes":142,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5369786","slot":"m-cap","color":"navy","colorSource":"name","classification":"name-rules","brand":"아웃스탠딩","name":"VINTAGE COTTON CAP(OST) NAVY","price":48600,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250827/5369786/5369786_17706851856036_big.jpg?w=600","url":"https://www.musinsa.com/products/5369786","rating":5,"reviews":3,"likes":276,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-1437851","slot":"m-tee","color":"black","colorSource":"name","classification":"name-rules","brand":"브론슨","name":"10.5 oz USA Cotton Tubular Gusset Tee Black","price":35700,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20200508/1437851/1437851_17761472855962_big.jpg?w=600","url":"https://www.musinsa.com/products/1437851","rating":4.9,"reviews":421,"likes":1,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-1437850","slot":"m-tee","color":"indigo","colorSource":"name","classification":"name-rules","brand":"브론슨","name":"10.5 oz USA Cotton Tubular Gusset Tee Indigo","price":35700,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20200508/1437850/1437850_17761473712710_big.jpg?w=600","url":"https://www.musinsa.com/products/1437850","rating":4.8,"reviews":378,"likes":1,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4241120","slot":"m-tee","color":"yellow","colorSource":"name","classification":"name-rules","brand":"브론슨","name":"1970s US Marine Tee Yellow","price":35700,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20240709/4241120/4241120_17780467277896_big.jpg?w=600","url":"https://www.musinsa.com/products/4241120","rating":4.9,"reviews":258,"likes":1,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6131586","slot":"m-sweat","color":"ivory","colorSource":"name","classification":"name-rules","brand":"브론슨","name":"17.5oz Basic Sweatshirt KR Ver. Oatmeal","price":69300,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260313/6131586/6131586_17772602529216_big.jpg?w=600","url":"https://www.musinsa.com/products/6131586","rating":4.8,"reviews":11,"likes":323,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-3668994","slot":"m-knit","color":"navy","colorSource":"name","classification":"name-rules","brand":"브론슨","name":"Pre-War Model USN Woolen Sweater Navy","price":116100,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20231030/3668994/3668994_17887621039062_big.jpg?w=600","url":"https://www.musinsa.com/products/3668994","rating":4.4,"reviews":48,"likes":697,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5922490","slot":"m-henley","color":"black","colorSource":"name","classification":"name-rules","brand":"브론슨","name":"10.6 oz Cotton Short Sleeve Henley Tee Black","price":42400,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260121/5922490/5922490_17761452585244_big.jpg?w=600","url":"https://www.musinsa.com/products/5922490","rating":4.9,"reviews":602,"likes":3,"summer":true,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4670583","slot":"m-tee","color":"ivory","colorSource":"image","classification":"name-rules","brand":"바버","name":"바버샵 크루넥 티셔츠","price":39000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20241217/4670583/4670583_17811465871732_big.jpg?w=600","url":"https://www.musinsa.com/products/4670583","rating":null,"reviews":0,"likes":9,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4667810","slot":"m-cap","color":"navy","colorSource":"image","classification":"name-rules","brand":"바버","name":"바버샵 볼캡","price":39000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20241216/4667810/4667810_17343261381381_big.jpg?w=600","url":"https://www.musinsa.com/products/4667810","rating":null,"reviews":0,"likes":14,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4667750","slot":"m-cap","color":"charcoal","colorSource":"image","classification":"name-rules","brand":"바버","name":"바버샵 투톤 볼캡","price":39000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20241216/4667750/4667750_17343253570274_big.jpg?w=600","url":"https://www.musinsa.com/products/4667750","rating":null,"reviews":0,"likes":13,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4670664","slot":"m-hoodie","color":"ivory","colorSource":"image","classification":"name-rules","brand":"바버","name":"바버샵 후드 집업","price":79000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20241217/4670664/4670664_17344247996081_big.jpg?w=600","url":"https://www.musinsa.com/products/4670664","rating":null,"reviews":0,"likes":9,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-3918529","slot":"m-chambray","color":"indigo","colorSource":"name","classification":"name-rules","brand":"무신사 스탠다드","name":"릴렉스드 데님 셔츠 [딥 인디고]","price":44890,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20240304/3918529/3918529_17217967274477_big.jpg?w=600","url":"https://www.musinsa.com/products/3918529","rating":4.9,"reviews":711,"likes":2,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4696017","slot":"m-chambray","color":"blue","colorSource":"name","classification":"name-rules","brand":"무신사 스탠다드","name":"오버사이즈 샴브레이 유틸리티 워크 셔츠 [라이트 블루]","price":29890,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250103/4696017/4696017_17567693170084_big.jpg?w=600","url":"https://www.musinsa.com/products/4696017","rating":4.8,"reviews":46,"likes":440,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4719505","slot":"m-work-pants","color":"olive","colorSource":"name","classification":"name-rules","brand":"무신사 스탠다드","name":"코튼 헤링본 레플리카 퍼티그 팬츠 [카키]","price":33890,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250114/4719505/4719505_17440971626445_big.jpg?w=600","url":"https://www.musinsa.com/products/4719505","rating":4.9,"reviews":175,"likes":2,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5210221","slot":"m-work-pants","color":"olive","colorSource":"name","classification":"name-rules","brand":"무신사 스탠다드","name":"백 사틴 베이커 팬츠 [카키]","price":40690,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250627/5210221/5210221_17568908978039_big.jpg?w=600","url":"https://www.musinsa.com/products/5210221","rating":4.9,"reviews":86,"likes":1,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4717529","slot":"m-oxford","color":"grey","colorSource":"name","classification":"name-rules","brand":"무신사 스탠다드","name":"릴렉스드 코튼 텐셀 피그먼트 셔츠 [블루 그레이]","price":29890,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250114/4717529/4717529_17428917807298_big.jpg?w=600","url":"https://www.musinsa.com/products/4717529","rating":4.8,"reviews":44,"likes":392,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-3758351","slot":"m-cargo","color":"black","colorSource":"name","classification":"name-rules","brand":"무신사 스탠다드","name":"[시티 레저] NP 와이드 벨티드 카고 팬츠 [블랙]","price":67090,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20231215/3758351/3758351_17101196663105_big.jpg?w=600","url":"https://www.musinsa.com/products/3758351","rating":null,"reviews":0,"likes":9,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-2725419","slot":"m-trucker","color":"indigo","colorSource":"name","classification":"name-rules","brand":"무신사 스탠다드","name":"릴렉스드 데님 트러커 재킷 [딥 인디고]","price":79900,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20220818/2725419/2725419_17286368040892_big.jpg?w=600","url":"https://www.musinsa.com/products/2725419","rating":4.8,"reviews":751,"likes":6,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4572250","slot":"m-trucker","color":"blue","colorSource":"name","classification":"name-rules","brand":"무신사 스탠다드","name":"릴렉스드 데님 트러커 재킷 [스카이 블루]","price":55890,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20241030/4572250/4572250_17375112813997_big.jpg?w=600","url":"https://www.musinsa.com/products/4572250","rating":4.9,"reviews":74,"likes":695,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-3947938","slot":"m-slacks","color":"black","colorSource":"name","classification":"name-rules","brand":"무신사 스탠다드","name":"스포티브 스트레이트 슬랙스 [블랙]","price":21890,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20240313/3947938/3947938_17140305672019_big.jpg?w=600","url":"https://www.musinsa.com/products/3947938","rating":4.8,"reviews":418,"likes":3,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6659258","slot":"m-slacks","color":"brown","colorSource":"name","classification":"name-rules","brand":"무신사 스탠다드","name":"휩코드 커브드 히든 밴딩 슬랙스 [다크 브라운]","price":59900,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260612/6659258/6659258_17865142848795_big.jpg?w=600","url":"https://www.musinsa.com/products/6659258","rating":5,"reviews":68,"likes":527,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6908822","slot":"m-down","color":"grey","colorSource":"name","classification":"name-rules","brand":"무신사 스탠다드","name":"[시티 레저] 더블 포켓 후디드 라이트 다운 재킷 [웜 그레이]","price":159900,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260723/6908822/6908822_17901481241540_big.jpg?w=600","url":"https://www.musinsa.com/products/6908822","rating":null,"reviews":0,"likes":126,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-2100438","slot":"m-cardigan","color":"black","colorSource":"name","classification":"name-rules","brand":"무신사 스탠다드","name":"미니멀 가디건 [블랙]","price":79900,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20210831/2100438/2100438_17513583754983_big.jpg?w=600","url":"https://www.musinsa.com/products/2100438","rating":null,"reviews":0,"likes":1,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5205791","slot":"m-blazer","color":"brown","colorSource":"name","classification":"name-rules","brand":"무신사 스탠다드","name":"울 블렌드 헤링본 릴렉스드 블레이저 [브라운]","price":118890,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250625/5205791/5205791_17605073883862_big.jpg?w=600","url":"https://www.musinsa.com/products/5205791","rating":4.8,"reviews":62,"likes":1,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-2375909","slot":"m-blazer","color":"black","colorSource":"name","classification":"name-rules","brand":"무신사 스탠다드","name":"빅 대디 오버사이즈 블레이저 [블랙]","price":98890,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20220222/2375909/2375909_17790837176470_big.jpg?w=600","url":"https://www.musinsa.com/products/2375909","rating":null,"reviews":0,"likes":1,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-3323583","slot":"m-harrington","color":"navy","colorSource":"name","classification":"name-rules","brand":"무신사 스탠다드","name":"코튼 해링턴 재킷 [네이비]","price":94890,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20230525/3323583/3323583_16925736274076_big.jpg?w=600","url":"https://www.musinsa.com/products/3323583","rating":4.9,"reviews":346,"likes":2,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4652845","slot":"m-harrington","color":"black","colorSource":"name","classification":"name-rules","brand":"무신사 스탠다드","name":"[시티 레저] 라이트웨이트 블루종 재킷 [블랙]","price":41890,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20241206/4652845/4652845_17429461458819_big.jpg?w=600","url":"https://www.musinsa.com/products/4652845","rating":4.9,"reviews":177,"likes":1,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6912053","slot":"m-field","color":"olive","colorSource":"name","classification":"name-rules","brand":"무신사 스탠다드","name":"G-8 웹 플라이트 재킷 [올리브]","price":159900,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260723/6912053/6912053_17883101596586_big.jpg?w=600","url":"https://www.musinsa.com/products/6912053","rating":5,"reviews":2,"likes":134,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4644604","slot":"m-vest","color":"black","colorSource":"name","classification":"name-rules","brand":"무신사 스탠다드","name":"코튼 케이블 브이 넥 니트 베스트 [블랙]","price":34890,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20241202/4644604/4644604_17423714174767_big.jpg?w=600","url":"https://www.musinsa.com/products/4644604","rating":4.6,"reviews":31,"likes":266,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4719510","slot":"m-chino","color":"ivory","colorSource":"name","classification":"name-rules","brand":"무신사 스탠다드","name":"코튼 루즈 테이퍼드 밴딩 팬츠 [크림]","price":27090,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250114/4719510/4719510_17455366384249_big.jpg?w=600","url":"https://www.musinsa.com/products/4719510","rating":4.7,"reviews":56,"likes":557,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7049155","slot":"m-chino","color":"grey","colorSource":"name","classification":"name-rules","brand":"무신사 스탠다드","name":"[시티 레저] 벨티드 커브드 팬츠 [그레이쉬 베이지]","price":89900,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260811/7049155/7049155_17889282151291_big.jpg?w=600","url":"https://www.musinsa.com/products/7049155","rating":5,"reviews":5,"likes":164,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5662175","slot":"m-knit","color":"grey","colorSource":"name","classification":"name-rules","brand":"무신사 스탠다드","name":"워셔블 수피마 코튼 헨리 넥 니트 [미디엄 그레이]","price":59900,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20251029/5662175/5662175_17682913181289_big.jpg?w=600","url":"https://www.musinsa.com/products/5662175","rating":4.9,"reviews":173,"likes":1,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-3435636","slot":"m-knit","color":"purple","colorSource":"name","classification":"name-rules","brand":"무신사 스탠다드","name":"코튼 리브드 크루 넥 니트 [퍼플]","price":34890,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20230731/3435636/3435636_16932105191272_big.jpg?w=600","url":"https://www.musinsa.com/products/3435636","rating":4.8,"reviews":185,"likes":1,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6970756","slot":"m-knit","color":"grey","colorSource":"name","classification":"name-rules","brand":"무신사 스탠다드","name":"레귤러 크루 넥 긴소매 니트 티셔츠 [미디엄 그레이]","price":25900,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260731/6970756/6970756_17858924062984_big.jpg?w=600","url":"https://www.musinsa.com/products/6970756","rating":4.9,"reviews":27,"likes":252,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4644792","slot":"m-denim","color":"indigo","colorSource":"name","classification":"name-rules","brand":"무신사 스탠다드","name":"커먼 브러쉬 와이드 데님 팬츠 [미디엄 인디고]","price":49900,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20241202/4644792/4644792_17376881465162_big.jpg?w=600","url":"https://www.musinsa.com/products/4644792","rating":4.8,"reviews":383,"likes":4,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6556869","slot":"m-flannel","color":"brown","colorSource":"name","classification":"name-rules","brand":"무신사 스탠다드","name":"오버사이즈 플란넬 옴브레 체크 셔츠 [브라운]","price":53890,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260527/6556869/6556869_17871022893714_big.jpg?w=600","url":"https://www.musinsa.com/products/6556869","rating":5,"reviews":56,"likes":193,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-2705775","slot":"m-hoodie","color":"grey","colorSource":"name","classification":"name-rules","brand":"무신사 스탠다드","name":"엑스트라 오버사이즈 후디드 스웨트 집업 [미디엄 그레이]","price":37690,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20220809/2705775/2705775_17026287166490_big.jpg?w=600","url":"https://www.musinsa.com/products/2705775","rating":null,"reviews":0,"likes":6,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4026542","slot":"m-derby","color":"black","colorSource":"name","classification":"name-rules","brand":"무신사 스탠다드","name":"키높이 플레인 더비 슈즈 [블랙]","price":119900,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20240404/4026542/4026542_17152980966575_big.jpg?w=600","url":"https://www.musinsa.com/products/4026542","rating":4.7,"reviews":304,"likes":2,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7140447","slot":"m-harrington","color":"black","colorSource":"image","classification":"name-rules","brand":"드로우핏","name":"몰스킨 코튼 블루종 자켓","price":139200,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260824/7140447/7140447_17883950783764_big.jpg?w=600","url":"https://www.musinsa.com/products/7140447","rating":4.9,"reviews":210,"likes":3,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5363206","slot":"m-harrington","color":"brown","colorSource":"name","classification":"name-rules","brand":"드로우핏","name":"도브 울 하이드 블루종 자켓 [CHESTNUT BROWN]","price":139200,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250826/5363206/5363206_17561929730576_big.jpg?w=600","url":"https://www.musinsa.com/products/5363206","rating":4.9,"reviews":17,"likes":686,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7140448","slot":"m-harrington","color":"charcoal","colorSource":"image","classification":"name-rules","brand":"드로우핏","name":"몰스킨 코튼 해링턴 자켓","price":139200,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260824/7140448/7140448_17917704761542_big.jpg?w=600","url":"https://www.musinsa.com/products/7140448","rating":4.8,"reviews":97,"likes":2,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6981388","slot":"m-henley","color":"black","colorSource":"image","classification":"name-rules","brand":"드로우핏","name":"코튼 헨리넥 롱슬리브 티셔츠","price":33300,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260803/6981388/6981388_17866754920466_big.jpg?w=600","url":"https://www.musinsa.com/products/6981388","rating":4.9,"reviews":21,"likes":925,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6981563","slot":"m-henley","color":"navy","colorSource":"name","classification":"name-rules","brand":"드로우핏","name":"[인플루언서 Pick] 레이어드 헨리넥 롱슬리브 티셔츠 [NAVY]","price":44100,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260803/6981563/6981563_17866765250950_big.jpg?w=600","url":"https://www.musinsa.com/products/6981563","rating":4.9,"reviews":39,"likes":1,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6981288","slot":"m-cords","color":"black","colorSource":"name","classification":"name-rules","brand":"드로우핏","name":"베이커 코듀로이 레귤러 스트레이트 팬츠 [BLACK]","price":54000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260803/6981288/6981288_17906447990984_big.jpg?w=600","url":"https://www.musinsa.com/products/6981288","rating":4.5,"reviews":2,"likes":337,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4327191","slot":"m-longtee","color":"white","colorSource":"name","classification":"name-rules","brand":"드로우핏","name":"실켓 코튼 U넥 롱슬리브 티셔츠 [WHITE]","price":29750,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20240813/4327191/4327191_17697520124684_big.jpg?w=600","url":"https://www.musinsa.com/products/4327191","rating":4.8,"reviews":283,"likes":3,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6981672","slot":"m-longtee","color":"black","colorSource":"name","classification":"name-rules","brand":"드로우핏","name":"[인플루언서 Pick] 레이어드 롱슬리브 티셔츠 [BLACK]","price":42300,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260803/6981672/6981672_17866766966421_big.jpg?w=600","url":"https://www.musinsa.com/products/6981672","rating":4.8,"reviews":38,"likes":1,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-2098326","slot":"m-balmacaan","color":"brown","colorSource":"name","classification":"name-rules","brand":"드로우핏","name":"프리미어 퓨어 캐시미어 발마칸 코트 [CHESTNUT BROWN]","price":246400,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20210830/2098326/2098326_17914442324762_big.jpg?w=600","url":"https://www.musinsa.com/products/2098326","rating":4.9,"reviews":940,"likes":6,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7312161","slot":"m-balmacaan","color":"navy","colorSource":"name","classification":"name-rules","brand":"드로우핏","name":"프리미어 퓨어 캐시미어 시티 하프 발마칸 코트 [D.NAVY]","price":212000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260911/7312161/7312161_17909270459043_big.jpg?w=600","url":"https://www.musinsa.com/products/7312161","rating":5,"reviews":4,"likes":189,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-1649144","slot":"m-balmacaan","color":"brown","colorSource":"name","classification":"name-rules","brand":"드로우핏","name":"프리미어 퓨어 캐시미어 히든 싱글 코트 [CHESTNUT BROWN]","price":222400,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20201015/1649144/1649144_17914518855686_big.jpg?w=600","url":"https://www.musinsa.com/products/1649144","rating":null,"reviews":0,"likes":7,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-3052069","slot":"m-knit","color":"red","colorSource":"name","classification":"name-rules","brand":"드로우핏","name":"리버릭 리브드 니트 티셔츠 [BRICK]","price":22000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20230201/3052069/3052069_16753910664194_big.jpg?w=600","url":"https://www.musinsa.com/products/3052069","rating":4.9,"reviews":469,"likes":1,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-2139143","slot":"m-knit","color":"black","colorSource":"image","classification":"name-rules","brand":"드로우핏","name":"터틀넥 니트 티셔츠 [9COLORS]","price":24000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20210917/2139143/2139143_17567927826682_big.jpg?w=600","url":"https://www.musinsa.com/products/2139143","rating":null,"reviews":0,"likes":1,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-3489622","slot":"m-belt","color":"brown","colorSource":"name","classification":"name-rules","brand":"드로우핏","name":"데이 레더 벨트 [BROWN]","price":33600,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20230823/3489622/3489622_17863280940555_big.jpg?w=600","url":"https://www.musinsa.com/products/3489622","rating":4.7,"reviews":700,"likes":2,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5385026","slot":"m-belt","color":"brown","colorSource":"name","classification":"name-rules","brand":"드로우핏","name":"카우 스터드 스웨이드 레더 벨트 [BROWN]","price":37800,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250901/5385026/5385026_17567143767793_big.jpg?w=600","url":"https://www.musinsa.com/products/5385026","rating":5,"reviews":22,"likes":346,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5947868","slot":"m-belt","color":"brown","colorSource":"name","classification":"name-rules","brand":"드로우핏","name":"카우 위빙 레더 벨트 [BROWN]","price":37800,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260128/5947868/5947868_17696680338156_big.jpg?w=600","url":"https://www.musinsa.com/products/5947868","rating":5,"reviews":4,"likes":194,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6980781","slot":"m-loafer","color":"black","colorSource":"name","classification":"name-rules","brand":"드로우핏","name":"리안 카우 레더 드레이프 로퍼 [BLACK]","price":133200,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260803/6980781/6980781_17878940313958_big.jpg?w=600","url":"https://www.musinsa.com/products/6980781","rating":5,"reviews":1,"likes":388,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-2085823","slot":"m-peacoat","color":"brown","colorSource":"name","classification":"name-rules","brand":"드로우핏","name":"프리미어 퓨어 캐시미어 로브 더블 코트 [CHESTNUT BROWN]","price":246400,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20210825/2085823/2085823_17914457326542_big.jpg?w=600","url":"https://www.musinsa.com/products/2085823","rating":4.9,"reviews":875,"likes":5,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-3554998","slot":"m-knit","color":"olive","colorSource":"name","classification":"name-rules","brand":"커버낫","name":"그라데이션 크루넥 니트 카키","price":35000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20230913/3554998/3554998_16947541029695_big.png?w=600","url":"https://www.musinsa.com/products/3554998","rating":4.9,"reviews":22,"likes":811,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7148082","slot":"m-knit","color":"grey","colorSource":"name","classification":"name-rules","brand":"커버낫","name":"[수빈 착용] 스트라이프 카라 니트 애쉬 블루","price":129000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260824/7148082/7148082_17888596647535_big.jpg?w=600","url":"https://www.musinsa.com/products/7148082","rating":null,"reviews":0,"likes":122,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5320719","slot":"m-shell","color":"black","colorSource":"name","classification":"name-rules","brand":"커버낫","name":"퍼텍스 윈드브레이커 Black","price":89000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250813/5320719/5320719_17772717849893_big.jpg?w=600","url":"https://www.musinsa.com/products/5320719","rating":5,"reviews":3,"likes":109,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-3571733","slot":"m-down","color":"charcoal","colorSource":"name","classification":"name-rules","brand":"커버낫","name":"RDS 빌로우 다운 숏 푸퍼 차콜","price":89000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20230919/3571733/3571733_16953677856701_big.png?w=600","url":"https://www.musinsa.com/products/3571733","rating":4.9,"reviews":76,"likes":1,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-3773908","slot":"m-cardigan","color":"navy","colorSource":"name","classification":"name-rules","brand":"커버낫","name":"C 로고 가디건 네이비","price":36900,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20240103/3773908/3773908_17050392187422_big.png?w=600","url":"https://www.musinsa.com/products/3773908","rating":4.3,"reviews":22,"likes":162,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4483821","slot":"m-varsity","color":"black","colorSource":"name","classification":"name-rules","brand":"커버낫","name":"컬리지 C 울 바시티 블랙","price":107700,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20241002/4483821/4483821_17321677250632_big.jpg?w=600","url":"https://www.musinsa.com/products/4483821","rating":5,"reviews":12,"likes":460,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4322620","slot":"m-oxford","color":"beige","colorSource":"name","classification":"name-rules","brand":"커버낫","name":"세미 오버핏 코듀로이 셔츠 카멜","price":39000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20240812/4322620/4322620_17244005383163_big.jpg?w=600","url":"https://www.musinsa.com/products/4322620","rating":5,"reviews":15,"likes":199,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5913832","slot":"m-field","color":"charcoal","colorSource":"name","classification":"name-rules","brand":"커버낫","name":"MA-1 자켓 차콜","price":129000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260120/5913832/5913832_17749221553304_big.jpg?w=600","url":"https://www.musinsa.com/products/5913832","rating":5,"reviews":1,"likes":53,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5320695","slot":"m-longtee","color":"white","colorSource":"name","classification":"name-rules","brand":"커버낫","name":"베이직 포켓 롱슬리브 Off White","price":29000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250813/5320695/5320695_17772718466360_big.jpg?w=600","url":"https://www.musinsa.com/products/5320695","rating":4.5,"reviews":4,"likes":71,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5305353","slot":"m-sweat","color":"ivory","colorSource":"name","classification":"name-rules","brand":"커버낫","name":"럭키 씨리얼 맨투맨 Oatmeal","price":69000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250808/5305353/5305353_17561827356802_big.jpg?w=600","url":"https://www.musinsa.com/products/5305353","rating":5,"reviews":6,"likes":357,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4735429","slot":"m-shell","color":"beige","colorSource":"name","classification":"name-rules","brand":"디스이즈네버댓","name":"Nylon Mountain Jacket Beige","price":99500,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250122/4735429/4735429_17386440744980_big.jpg?w=600","url":"https://www.musinsa.com/products/4735429","rating":5,"reviews":3,"likes":398,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5350058","slot":"m-shell","color":"blue","colorSource":"name","classification":"name-rules","brand":"디스이즈네버댓","name":"Anorak Jacket Washed Blue","price":143200,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250821/5350058/5350058_17562592858181_big.jpg?w=600","url":"https://www.musinsa.com/products/5350058","rating":5,"reviews":4,"likes":389,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4403529","slot":"m-shell","color":"olive","colorSource":"image","classification":"name-rules","brand":"디스이즈네버댓","name":"PERTEX® UL Wind Parka Slate","price":104500,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20240904/4403529/4403529_17260210525108_big.jpg?w=600","url":"https://www.musinsa.com/products/4403529","rating":5,"reviews":7,"likes":359,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4735351","slot":"m-denim","color":"blue","colorSource":"name","classification":"name-rules","brand":"디스이즈네버댓","name":"Denim Carpenter Pant Washed Blue","price":79500,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250122/4735351/4735351_17386547692279_big.jpg?w=600","url":"https://www.musinsa.com/products/4735351","rating":4.8,"reviews":12,"likes":447,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4735350","slot":"m-denim","color":"blue","colorSource":"correction","classification":"name-rules","brand":"디스이즈네버댓","name":"Denim Carpenter Pant Ice","price":79500,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250122/4735350/4735350_17386548235178_big.jpg?w=600","url":"https://www.musinsa.com/products/4735350","rating":5,"reviews":2,"likes":208,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4854832","slot":"m-denim","color":"brown","colorSource":"name","classification":"name-rules","brand":"디스이즈네버댓","name":"Originals Denim Pant Dark Brown","price":79500,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250304/4854832/4854832_17411559620114_big.jpg?w=600","url":"https://www.musinsa.com/products/4854832","rating":5,"reviews":3,"likes":146,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4854778","slot":"m-cap","color":"navy","colorSource":"name","classification":"name-rules","brand":"디스이즈네버댓","name":"Overdyed NEVER Cap Navy","price":27500,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250304/4854778/4854778_17411582769558_big.jpg?w=600","url":"https://www.musinsa.com/products/4854778","rating":5,"reviews":19,"likes":634,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4854770","slot":"m-cap","color":"blue","colorSource":"name","classification":"name-rules","brand":"디스이즈네버댓","name":"Canvas Patch Cap Dusty Blue","price":26000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250304/4854770/4854770_17411579627959_big.jpg?w=600","url":"https://www.musinsa.com/products/4854770","rating":4.8,"reviews":12,"likes":273,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4854769","slot":"m-cap","color":"white","colorSource":"name","classification":"name-rules","brand":"디스이즈네버댓","name":"Canvas Patch Cap Off White","price":26000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250304/4854769/4854769_17411579665080_big.jpg?w=600","url":"https://www.musinsa.com/products/4854769","rating":5,"reviews":1,"likes":108,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4854909","slot":"m-varsity","color":"black","colorSource":"name","classification":"name-rules","brand":"디스이즈네버댓","name":"Faded Stadium Jacket Black","price":104500,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250304/4854909/4854909_17411492086229_big.jpg?w=600","url":"https://www.musinsa.com/products/4854909","rating":5,"reviews":6,"likes":525,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4854855","slot":"m-tee","color":"black","colorSource":"name","classification":"name-rules","brand":"디스이즈네버댓","name":"INTL. Logo Tee Black","price":35400,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250304/4854855/4854855_17411547075606_big.jpg?w=600","url":"https://www.musinsa.com/products/4854855","rating":4.9,"reviews":43,"likes":830,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-3903816","slot":"m-tee","color":"beige","colorSource":"name","classification":"name-rules","brand":"디스이즈네버댓","name":"Gradient OL-Logo Tee Stone","price":19600,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20240227/3903816/3903816_17090956108131_big.jpg?w=600","url":"https://www.musinsa.com/products/3903816","rating":4.8,"reviews":66,"likes":586,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4905782","slot":"m-tee","color":"white","colorSource":"name","classification":"name-rules","brand":"디스이즈네버댓","name":"Motorcycle Tee White","price":29500,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250317/4905782/4905782_17423512159389_big.jpg?w=600","url":"https://www.musinsa.com/products/4905782","rating":5,"reviews":7,"likes":285,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-3861704","slot":"m-cargo","color":"black","colorSource":"name","classification":"name-rules","brand":"디스이즈네버댓","name":"Flight Cargo Pant Black","price":84500,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20240213/3861704/3861704_17078179702567_big.jpg?w=600","url":"https://www.musinsa.com/products/3861704","rating":5,"reviews":40,"likes":506,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4460645","slot":"m-knit","color":"olive","colorSource":"name","classification":"name-rules","brand":"디스이즈네버댓","name":"Fortuna N-Logo Sweater Olive","price":64500,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20240925/4460645/4460645_17272506101163_big.jpg?w=600","url":"https://www.musinsa.com/products/4460645","rating":5,"reviews":6,"likes":294,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4735362","slot":"m-knit","color":"navy","colorSource":"name","classification":"name-rules","brand":"디스이즈네버댓","name":"Striped Knit L/S Top Navy","price":69500,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250122/4735362/4735362_17386552226609_big.jpg?w=600","url":"https://www.musinsa.com/products/4735362","rating":4.3,"reviews":3,"likes":468,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4403479","slot":"m-knit","color":"ivory","colorSource":"name","classification":"name-rules","brand":"디스이즈네버댓","name":"Washed Block Knit Sweater Ivory","price":69500,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20240904/4403479/4403479_17260278492414_big.jpg?w=600","url":"https://www.musinsa.com/products/4403479","rating":5,"reviews":3,"likes":204,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4403478","slot":"m-chambray","color":"purple","colorSource":"image","classification":"name-rules","brand":"디스이즈네버댓","name":"Big Flannel Work Shirt Slate","price":69500,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20240904/4403478/4403478_17260278721247_big.jpg?w=600","url":"https://www.musinsa.com/products/4403478","rating":4.9,"reviews":9,"likes":446,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4735477","slot":"m-harrington","color":"black","colorSource":"name","classification":"name-rules","brand":"디스이즈네버댓","name":"INTL. Team Jacket Black","price":119200,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250122/4735477/4735477_17386437701624_big.jpg?w=600","url":"https://www.musinsa.com/products/4735477","rating":4.9,"reviews":24,"likes":1,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5992470","slot":"m-harrington","color":"grey","colorSource":"name","classification":"name-rules","brand":"디스이즈네버댓","name":"T-Light Jacket Grey","price":97300,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260206/5992470/5992470_17706971987354_big.jpg?w=600","url":"https://www.musinsa.com/products/5992470","rating":4.7,"reviews":7,"likes":3,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5573859","slot":"m-hoodie","color":"black","colorSource":"name","classification":"name-rules","brand":"디스이즈네버댓","name":"GD Dancing Bears Hoodie Washed Black","price":111300,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20251010/5573859/5573859_17604927113844_big.jpg?w=600","url":"https://www.musinsa.com/products/5573859","rating":5,"reviews":8,"likes":863,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4345024","slot":"m-hoodie","color":"grey","colorSource":"name","classification":"name-rules","brand":"디스이즈네버댓","name":"Solar System Hoodie Heather Grey","price":54500,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20240820/4345024/4345024_17248941339441_big.jpg?w=600","url":"https://www.musinsa.com/products/4345024","rating":5,"reviews":16,"likes":556,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4813644","slot":"m-hoodie","color":"brown","colorSource":"name","classification":"name-rules","brand":"디스이즈네버댓","name":"Dunk Hoop Hoodie Brown","price":59500,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250220/4813644/4813644_17400440327520_big.jpg?w=600","url":"https://www.musinsa.com/products/4813644","rating":4.8,"reviews":4,"likes":436,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4345013","slot":"m-oxford","color":"green","colorSource":"name","classification":"name-rules","brand":"디스이즈네버댓","name":"Overdyed T-Logo Oxford Shirt Green","price":54500,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20240820/4345013/4345013_17248231670635_big.jpg?w=600","url":"https://www.musinsa.com/products/4345013","rating":4.9,"reviews":12,"likes":418,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4302964","slot":"m-oxford","color":"ivory","colorSource":"name","classification":"name-rules","brand":"디스이즈네버댓","name":"Half Zip Shirt Ivory","price":59500,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20240807/4302964/4302964_17235333483776_big.jpg?w=600","url":"https://www.musinsa.com/products/4302964","rating":4.5,"reviews":2,"likes":305,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7285921","slot":"m-longtee","color":"navy","colorSource":"name","classification":"name-rules","brand":"디스이즈네버댓","name":"Striped L/S Tee Navy","price":79000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260909/7285921/7285921_17889670944553_big.jpg?w=600","url":"https://www.musinsa.com/products/7285921","rating":5,"reviews":1,"likes":429,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4813616","slot":"m-longtee","color":"navy","colorSource":"name","classification":"name-rules","brand":"디스이즈네버댓","name":"Monogram L/S Tee Light Navy","price":41400,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250220/4813616/4813616_17400439992327_big.jpg?w=600","url":"https://www.musinsa.com/products/4813616","rating":4,"reviews":1,"likes":287,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4403489","slot":"m-sweat","color":"olive","colorSource":"name","classification":"name-rules","brand":"디스이즈네버댓","name":"Damaged Half Zip Polo Sweatshirt Light Olive","price":54500,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20240904/4403489/4403489_17260220873664_big.jpg?w=600","url":"https://www.musinsa.com/products/4403489","rating":4,"reviews":1,"likes":197,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4813666","slot":"m-chore","color":"charcoal","colorSource":"image","classification":"name-rules","brand":"디스이즈네버댓","name":"Washed Carpenter Jacket Mud","price":114500,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250220/4813666/4813666_17400437269052_big.jpg?w=600","url":"https://www.musinsa.com/products/4813666","rating":4.9,"reviews":10,"likes":888,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4905910","slot":"m-polo","color":"black","colorSource":"name","classification":"name-rules","brand":"디스이즈네버댓","name":"T-Logo S/S Jersey Polo Black","price":63200,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250317/4905910/4905910_17423499918533_big.jpg?w=600","url":"https://www.musinsa.com/products/4905910","rating":4.9,"reviews":24,"likes":919,"summer":true,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4905903","slot":"m-polo","color":"yellow","colorSource":"name","classification":"name-rules","brand":"디스이즈네버댓","name":"Stacked TNT S/S Knit Polo Yellow","price":59500,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250317/4905903/4905903_17423500485127_big.jpg?w=600","url":"https://www.musinsa.com/products/4905903","rating":5,"reviews":2,"likes":139,"summer":true,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4854759","slot":"m-beanie","color":"green","colorSource":"name","classification":"name-rules","brand":"디스이즈네버댓","name":"Multicolor Crochet Beanie Green","price":26000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250304/4854759/4854759_17411562315562_big.jpg?w=600","url":"https://www.musinsa.com/products/4854759","rating":null,"reviews":0,"likes":215,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5573870","slot":"m-down","color":"blue","colorSource":"name","classification":"name-rules","brand":"디스이즈네버댓","name":"GD Light Down Jacket Light Blue","price":181300,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20251010/5573870/5573870_17604922564463_big.jpg?w=600","url":"https://www.musinsa.com/products/5573870","rating":5,"reviews":12,"likes":2,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7323573","slot":"m-down","color":"black","colorSource":"name","classification":"name-rules","brand":"디스이즈네버댓","name":"Skogar Hooded MID Down Jacket Off Black","price":269000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260914/7323573/7323573_17894674659634_big.jpg?w=600","url":"https://www.musinsa.com/products/7323573","rating":null,"reviews":0,"likes":182,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4403463","slot":"m-cords","color":"black","colorSource":"name","classification":"name-rules","brand":"디스이즈네버댓","name":"Corduroy Field Pant Black","price":111200,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20240904/4403463/4403463_17260284435328_big.jpg?w=600","url":"https://www.musinsa.com/products/4403463","rating":5,"reviews":6,"likes":147,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7282708","slot":"m-chore","color":"ivory","colorSource":"name","classification":"name-rules","brand":"해브해드","name":"트윌 코튼 초어 자켓 (에크루)","price":169000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260909/7282708/7282708_17891099948026_big.jpg?w=600","url":"https://www.musinsa.com/products/7282708","rating":null,"reviews":0,"likes":7,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5997793","slot":"m-cargo","color":"black","colorSource":"name","classification":"name-rules","brand":"해브해드","name":"투웨이 유틸리티 카고 팬츠 (블랙)","price":136000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260209/5997793/5997793_17717497694091_big.jpg?w=600","url":"https://www.musinsa.com/products/5997793","rating":4.7,"reviews":3,"likes":57,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6768223","slot":"m-tee","color":"blue","colorSource":"name","classification":"name-rules","brand":"해브해드","name":"웨더 인 웨이브 티셔츠 (빈티지 블루)","price":48000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260702/6768223/6768223_17829586193652_big.jpg?w=600","url":"https://www.musinsa.com/products/6768223","rating":5,"reviews":5,"likes":104,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5177804","slot":"m-tee","color":"grey","colorSource":"name","classification":"name-rules","brand":"해브해드","name":"포켓 볼륨 스트링 하프 티셔츠(베이지 그레이)","price":75050,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250611/5177804/5177804_17496232439185_big.jpg?w=600","url":"https://www.musinsa.com/products/5177804","rating":null,"reviews":0,"likes":37,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5142559","slot":"m-oxford","color":"pink","colorSource":"image","classification":"name-rules","brand":"해브해드","name":"hvhd 로고 컴포트 하프 셔츠 25ss","price":65550,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250523/5142559/5142559_17484116100452_big.jpg?w=600","url":"https://www.musinsa.com/products/5142559","rating":4.6,"reviews":28,"likes":434,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5997224","slot":"m-oxford","color":"grey","colorSource":"name","classification":"name-rules","brand":"해브해드","name":"에브리데이 컴포트 셔츠 (라이트 그레이)","price":65550,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260209/5997224/5997224_17717508462164_big.jpg?w=600","url":"https://www.musinsa.com/products/5997224","rating":4.8,"reviews":8,"likes":236,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5159891","slot":"m-oxford","color":"navy","colorSource":"name","classification":"name-rules","brand":"해브해드","name":"시티 서머 라이트 하프 셔츠(네이비)","price":84000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250530/5159891/5159891_17485863575680_big.jpg?w=600","url":"https://www.musinsa.com/products/5159891","rating":4.6,"reviews":13,"likes":150,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7288696","slot":"m-cardigan","color":"green","colorSource":"name","classification":"name-rules","brand":"해브해드","name":"소프트 울 라운드 가디건 (블루 그린)","price":108000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260909/7288696/7288696_17891021307086_big.jpg?w=600","url":"https://www.musinsa.com/products/7288696","rating":null,"reviews":0,"likes":3,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7288434","slot":"m-cardigan","color":"red","colorSource":"name","classification":"name-rules","brand":"해브해드","name":"소프트 울 라운드 가디건 (레드)","price":108000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260909/7288434/7288434_17891025986197_big.jpg?w=600","url":"https://www.musinsa.com/products/7288434","rating":null,"reviews":0,"likes":0,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7288366","slot":"m-cardigan","color":"ivory","colorSource":"name","classification":"name-rules","brand":"해브해드","name":"소프트 울 라운드 가디건 (크림)","price":108000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260909/7288366/7288366_17891024350661_big.jpg?w=600","url":"https://www.musinsa.com/products/7288366","rating":null,"reviews":0,"likes":0,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7102139","slot":"m-longtee","color":"charcoal","colorSource":"name","classification":"name-rules","brand":"해브해드","name":"멜로우 슬림 롱 슬리브 티셔츠 (차콜)","price":69000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260819/7102139/7102139_17875464109273_big.jpg?w=600","url":"https://www.musinsa.com/products/7102139","rating":null,"reviews":0,"likes":17,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7102045","slot":"m-longtee","color":"beige","colorSource":"name","classification":"name-rules","brand":"해브해드","name":"멜로우 슬림 롱 슬리브 티셔츠 (베이지)","price":69000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260819/7102045/7102045_17875465413412_big.jpg?w=600","url":"https://www.musinsa.com/products/7102045","rating":null,"reviews":0,"likes":9,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5998428","slot":"m-harrington","color":"blue","colorSource":"name","classification":"name-rules","brand":"해브해드","name":"필드 포켓 스트라이프 자켓 (스트라이프 블루)","price":134000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260209/5998428/5998428_17717501965542_big.jpg?w=600","url":"https://www.musinsa.com/products/5998428","rating":5,"reviews":1,"likes":69,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5177962","slot":"m-shell","color":"white","colorSource":"name","classification":"name-rules","brand":"해브해드","name":"프레시 라이트 윈드 재킷(화이트)","price":112100,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250611/5177962/5177962_17496247027689_big.jpg?w=600","url":"https://www.musinsa.com/products/5177962","rating":5,"reviews":1,"likes":45,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5177840","slot":"m-shell","color":"navy","colorSource":"name","classification":"name-rules","brand":"해브해드","name":"프레시 라이트 윈드 재킷(네이비)","price":112100,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250611/5177840/5177840_17496236086053_big.jpg?w=600","url":"https://www.musinsa.com/products/5177840","rating":3.8,"reviews":6,"likes":36,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4819300","slot":"m-denim","color":"blue","colorSource":"name","classification":"name-rules","brand":"노운","name":"wide denim pants (mid blue)","price":100800,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250221/4819300/4819300_17406265711897_big.jpg?w=600","url":"https://www.musinsa.com/products/4819300","rating":4.8,"reviews":97,"likes":2,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5978471","slot":"m-denim","color":"black","colorSource":"name","classification":"name-rules","brand":"노운","name":"balanced denim pants (black)","price":127800,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260204/5978471/5978471_17739816347589_big.jpg?w=600","url":"https://www.musinsa.com/products/5978471","rating":5,"reviews":13,"likes":356,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7069034","slot":"m-cap","color":"brown","colorSource":"name","classification":"name-rules","brand":"노운","name":"[노운x임지혁] 엔유 볼캡 (브라운)","price":60800,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260813/7069034/7069034_17877035374362_big.jpg?w=600","url":"https://www.musinsa.com/products/7069034","rating":4.8,"reviews":8,"likes":50,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4733978","slot":"m-harrington","color":"charcoal","colorSource":"name","classification":"name-rules","brand":"노운","name":"hooded jacket (charcoal)","price":118800,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250121/4733978/4733978_17376220711445_big.jpg?w=600","url":"https://www.musinsa.com/products/4733978","rating":4.3,"reviews":4,"likes":170,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5351875","slot":"m-henley","color":"charcoal","colorSource":"name","classification":"name-rules","brand":"노운","name":"pique henley t-shirts (charcoal)","price":64600,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250821/5351875/5351875_17561995460642_big.jpg?w=600","url":"https://www.musinsa.com/products/5351875","rating":4.9,"reviews":107,"likes":2,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6373230","slot":"m-henley","color":"charcoal","colorSource":"name","classification":"name-rules","brand":"노운","name":"헨리넥 티셔츠 (차콜)","price":61200,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260424/6373230/6373230_17775143205301_big.jpg?w=600","url":"https://www.musinsa.com/products/6373230","rating":4.7,"reviews":23,"likes":594,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6530398","slot":"m-chino","color":"beige","colorSource":"name","classification":"name-rules","brand":"노운","name":"워시드 스트링 팬츠 (베이지)","price":111600,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260521/6530398/6530398_17793632563077_big.jpg?w=600","url":"https://www.musinsa.com/products/6530398","rating":5,"reviews":8,"likes":180,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7177795","slot":"m-chino","color":"grey","colorSource":"name","classification":"name-rules","brand":"노운","name":"드라이 플리츠드 팬츠 (애쉬 블랙)","price":112100,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260827/7177795/7177795_17890195828827_big.jpg?w=600","url":"https://www.musinsa.com/products/7177795","rating":5,"reviews":2,"likes":140,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5352025","slot":"m-hoodie","color":"olive","colorSource":"image","classification":"name-rules","brand":"노운","name":"와플 후디드 티셔츠 (아보카도)","price":70300,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250821/5352025/5352025_17881365528545_big.jpg?w=600","url":"https://www.musinsa.com/products/5352025","rating":4.9,"reviews":33,"likes":705,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-2748132","slot":"m-chino","color":"black","colorSource":"name","classification":"name-rules","brand":"쿠어","name":"벨티드 트윌 플리츠 와이드 팬츠 (블랙)","price":168300,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20220828/2748132/2748132_1_big.jpg?w=600","url":"https://www.musinsa.com/products/2748132","rating":4.9,"reviews":34,"likes":1,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5350510","slot":"m-chino","color":"black","colorSource":"name","classification":"name-rules","brand":"쿠어","name":"딥 커브드 워시드 코튼 팬츠 (블랙)","price":189000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250821/5350510/5350510_17562766608665_big.png?w=600","url":"https://www.musinsa.com/products/5350510","rating":4.9,"reviews":16,"likes":1,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7033265","slot":"m-chino","color":"black","colorSource":"name","classification":"name-rules","brand":"쿠어","name":"신치 백 엠보 워시드 커브드 팬츠 (워시드블랙)","price":171000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260810/7033265/7033265_17863291160548_big.jpg?w=600","url":"https://www.musinsa.com/products/7033265","rating":null,"reviews":0,"likes":215,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-3583652","slot":"m-peacoat","color":"charcoal","colorSource":"name","classification":"name-rules","brand":"쿠어","name":"오버사이즈 알파카 블렌드 더플 코트 (다크그레이멜란지)","price":386100,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20230921/3583652/3583652_17271827812816_big.jpg?w=600","url":"https://www.musinsa.com/products/3583652","rating":4.9,"reviews":435,"likes":3,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7033372","slot":"m-polo","color":"brown","colorSource":"name","classification":"name-rules","brand":"쿠어","name":"멀티 핀 피케 폴로 롱 슬리브 (브라운)","price":89100,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260810/7033372/7033372_17866877971879_big.jpg?w=600","url":"https://www.musinsa.com/products/7033372","rating":5,"reviews":2,"likes":78,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7033378","slot":"m-polo","color":"olive","colorSource":"name","classification":"name-rules","brand":"쿠어","name":"멀티 핀 피케 폴로 롱 슬리브 (카키)","price":89100,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260810/7033378/7033378_17863295706372_big.jpg?w=600","url":"https://www.musinsa.com/products/7033378","rating":null,"reviews":0,"likes":33,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-2479873","slot":"m-tee","color":"black","colorSource":"name","classification":"name-rules","brand":"쿠어","name":"수피마 코튼 세미오버핏 U넥 티셔츠 (블랙)","price":36000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20220411/2479873/2479873_17731079377511_big.jpg?w=600","url":"https://www.musinsa.com/products/2479873","rating":4.9,"reviews":865,"likes":1,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-3165127","slot":"m-tee","color":"black","colorSource":"image","classification":"name-rules","brand":"쿠어","name":"[2PACK] 파이니스트 실켓 오버핏 티셔츠","price":44000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20230321/3165127/3165127_17153033644679_big.jpg?w=600","url":"https://www.musinsa.com/products/3165127","rating":4.8,"reviews":443,"likes":3,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5036538","slot":"m-tee","color":"grey","colorSource":"name","classification":"name-rules","brand":"쿠어","name":"코튼 링거 티셔츠 (멜란지그레이)","price":54000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250417/5036538/5036538_17763015621404_big.jpg?w=600","url":"https://www.musinsa.com/products/5036538","rating":4.9,"reviews":278,"likes":3,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7102671","slot":"m-derby","color":"black","colorSource":"name","classification":"name-rules","brand":"쿠어","name":"스퀘어토 링클 더비 슈즈 (블랙)","price":360000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260819/7102671/7102671_17871080882645_big.jpg?w=600","url":"https://www.musinsa.com/products/7102671","rating":null,"reviews":0,"likes":118,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5937510","slot":"m-hoodie","color":"grey","colorSource":"name","classification":"name-rules","brand":"쿠어","name":"데미지 포인트 내추럴 후드집업 (멜란지그레이)","price":144000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260126/5937510/5937510_17696616154857_big.jpg?w=600","url":"https://www.musinsa.com/products/5937510","rating":4.8,"reviews":6,"likes":225,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7102756","slot":"m-hoodie","color":"black","colorSource":"name","classification":"name-rules","brand":"쿠어","name":"워시드 래글런 후디 스웻 집업 (워시드블랙)","price":166500,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260819/7102756/7102756_17871083607250_big.jpg?w=600","url":"https://www.musinsa.com/products/7102756","rating":null,"reviews":0,"likes":107,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-3082751","slot":"m-cargo","color":"black","colorSource":"name","classification":"name-rules","brand":"쿠어","name":"테크니컬 카고 울 팬츠 (블랙)","price":175500,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20230214/3082751/3082751_16771180975552_big.jpg?w=600","url":"https://www.musinsa.com/products/3082751","rating":4.9,"reviews":15,"likes":636,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5350760","slot":"m-trucker","color":"beige","colorSource":"name","classification":"name-rules","brand":"쿠어","name":"타입1 코듀로이 워시드 트러커 자켓 (워시드베이지)","price":261000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250821/5350760/5350760_17562764113662_big.png?w=600","url":"https://www.musinsa.com/products/5350760","rating":5,"reviews":4,"likes":713,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7104711","slot":"m-chore","color":"pink","colorSource":"name","classification":"name-rules","brand":"쿠어","name":"코듀로이 멀티 포켓 셔츠 자켓 (인디핑크)","price":162000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260819/7104711/7104711_17871177043341_big.jpg?w=600","url":"https://www.musinsa.com/products/7104711","rating":5,"reviews":9,"likes":259,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7033620","slot":"m-field","color":"olive","colorSource":"name","classification":"name-rules","brand":"쿠어","name":"워시드 코튼 M-51 필드 자켓 (카키)","price":324000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260810/7033620/7033620_17863303956250_big.jpg?w=600","url":"https://www.musinsa.com/products/7033620","rating":5,"reviews":1,"likes":410,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4350316","slot":"m-sweat","color":"charcoal","colorSource":"name","classification":"name-rules","brand":"쿠어","name":"가먼트 다잉 에센셜 후드 스웻셔츠 (워시드차콜)","price":89100,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20240820/4350316/4350316_17242418188807_big.jpg?w=600","url":"https://www.musinsa.com/products/4350316","rating":4.9,"reviews":52,"likes":960,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5350476","slot":"m-sweat","color":"grey","colorSource":"name","classification":"name-rules","brand":"쿠어","name":"에센셜 후디 스웻셔츠 (멜란지그레이)","price":117000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250821/5350476/5350476_17562766988842_big.png?w=600","url":"https://www.musinsa.com/products/5350476","rating":5,"reviews":1,"likes":248,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-1548435","slot":"m-knit","color":"black","colorSource":"name","classification":"name-rules","brand":"쿠어","name":"탑필 울 라운드 니트 (블랙)","price":72900,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20200813/1548435/1548435_17242901841332_big.jpg?w=600","url":"https://www.musinsa.com/products/1548435","rating":null,"reviews":0,"likes":1,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7033461","slot":"m-blazer","color":"black","colorSource":"name","classification":"name-rules","brand":"쿠어","name":"엠보 워시드 블레이저 (워시드블랙)","price":252000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260810/7033461/7033461_17863299020721_big.jpg?w=600","url":"https://www.musinsa.com/products/7033461","rating":5,"reviews":1,"likes":209,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7033480","slot":"m-blazer","color":"beige","colorSource":"name","classification":"name-rules","brand":"쿠어","name":"엠보 워시드 블레이저 (워시드베이지)","price":252000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260810/7033480/7033480_17863299508538_big.jpg?w=600","url":"https://www.musinsa.com/products/7033480","rating":4.7,"reviews":3,"likes":81,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5365533","slot":"m-oxford","color":"green","colorSource":"name","classification":"name-rules","brand":"쿠어","name":"핀 코듀로이 원 포켓 셔츠 (그린)","price":144000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250826/5365533/5365533_17564389407783_big.png?w=600","url":"https://www.musinsa.com/products/5365533","rating":5,"reviews":1,"likes":0,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-3833538","slot":"m-shell","color":"black","colorSource":"name","classification":"name-rules","brand":"쿠어","name":"테일 드로스트링 윈드브레이커 (블랙)","price":162000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20240130/3833538/3833538_17067539981523_big.jpg?w=600","url":"https://www.musinsa.com/products/3833538","rating":4.9,"reviews":148,"likes":1,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7033432","slot":"m-flannel","color":"beige","colorSource":"name","classification":"name-rules","brand":"쿠어","name":"건클럽 체크 셔츠 (샌드그린)","price":162000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260810/7033432/7033432_17863298176506_big.jpg?w=600","url":"https://www.musinsa.com/products/7033432","rating":5,"reviews":3,"likes":92,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7033210","slot":"m-denim-raw","color":"indigo","colorSource":"name","classification":"name-rules","brand":"쿠어","name":"리지드 세미 플레어 진스 (인디고)","price":148500,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260810/7033210/7033210_17863289078482_big.jpg?w=600","url":"https://www.musinsa.com/products/7033210","rating":4.7,"reviews":3,"likes":290,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-1799137","slot":"m-chore","color":"grey","colorSource":"name","classification":"name-rules","brand":"인사일런스","name":"울 린넨 워크 자켓 GREY BEIGE","price":116200,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20210217/1799137/1799137_2_big.jpg?w=600","url":"https://www.musinsa.com/products/1799137","rating":4.9,"reviews":29,"likes":159,"summer":true,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7218792","slot":"m-chino","color":"black","colorSource":"name","classification":"name-rules","brand":"인사일런스","name":"커브드 치노 팬츠 BLACK","price":149000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260901/7218792/7218792_17888478468156_big.jpg?w=600","url":"https://www.musinsa.com/products/7218792","rating":null,"reviews":0,"likes":38,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7084212","slot":"m-deck","color":"charcoal","colorSource":"name","classification":"name-rules","brand":"인사일런스","name":"빈티지 워시드 덱 자켓 v2 DARK GREY","price":239000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260814/7084212/7084212_17875460874482_big.jpg?w=600","url":"https://www.musinsa.com/products/7084212","rating":null,"reviews":0,"likes":52,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-1581892","slot":"m-knit","color":"green","colorSource":"name","classification":"name-rules","brand":"인사일런스","name":"그라데이션 니트 LIGHT GREEN","price":65400,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20200903/1581892/1581892_2_big.jpg?w=600","url":"https://www.musinsa.com/products/1581892","rating":4.8,"reviews":32,"likes":347,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-2100588","slot":"m-knit","color":"beige","colorSource":"name","classification":"name-rules","brand":"인사일런스","name":"믹스드 패턴 라운드 니트 BEIGE","price":85400,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20210831/2100588/2100588_2_big.jpg?w=600","url":"https://www.musinsa.com/products/2100588","rating":4.8,"reviews":32,"likes":281,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7023657","slot":"m-knit","color":"navy","colorSource":"name","classification":"name-rules","brand":"인사일런스","name":"코튼 캐시 리브드 브이넥 니트 NAVY","price":149000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260807/7023657/7023657_17866794768964_big.jpg?w=600","url":"https://www.musinsa.com/products/7023657","rating":5,"reviews":1,"likes":205,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-3487341","slot":"m-hoodie","color":"grey","colorSource":"name","classification":"name-rules","brand":"인사일런스","name":"백로고 스쿠바 후드 집업 MELANGE GREY","price":93100,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20230822/3487341/3487341_16940719488680_big.jpg?w=600","url":"https://www.musinsa.com/products/3487341","rating":4.9,"reviews":19,"likes":123,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-2151129","slot":"m-down","color":"grey","colorSource":"name","classification":"name-rules","brand":"인사일런스","name":"에센셜 다운 자켓 DIM GREY","price":141600,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20210928/2151129/2151129_17593093837699_big.jpg?w=600","url":"https://www.musinsa.com/products/2151129","rating":4.9,"reviews":787,"likes":2,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4466461","slot":"m-down","color":"grey","colorSource":"name","classification":"name-rules","brand":"인사일런스","name":"부클 울 집업 푸퍼 점퍼 ASH BROWN","price":221600,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20240926/4466461/4466461_17274235446985_big.jpg?w=600","url":"https://www.musinsa.com/products/4466461","rating":5,"reviews":2,"likes":214,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-3136602","slot":"m-cardigan","color":"brown","colorSource":"name","classification":"name-rules","brand":"인사일런스","name":"크래프트 스카시 카디건 ORANGE BROWN","price":85400,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20230309/3136602/3136602_16792873899129_big.jpg?w=600","url":"https://www.musinsa.com/products/3136602","rating":4.9,"reviews":36,"likes":287,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-2720016","slot":"m-cardigan","color":"beige","colorSource":"name","classification":"name-rules","brand":"인사일런스","name":"라쿤 칼라 니트 카디건 SAND BEIGE","price":108500,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20220816/2720016/2720016_2_big.jpg?w=600","url":"https://www.musinsa.com/products/2720016","rating":4.6,"reviews":40,"likes":468,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-1812568","slot":"m-oxford","color":"beige","colorSource":"name","classification":"name-rules","brand":"인사일런스","name":"드레이프 그랜대드 셔츠 KHAKI BEIGE","price":61600,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20210224/1812568/1812568_2_big.jpg?w=600","url":"https://www.musinsa.com/products/1812568","rating":4.8,"reviews":24,"likes":146,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-2766753","slot":"m-oxford","color":"beige","colorSource":"name","classification":"name-rules","brand":"인사일런스","name":"워시드 코튼 셔츠 SAND BEIGE","price":69300,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20220902/2766753/2766753_2_big.jpg?w=600","url":"https://www.musinsa.com/products/2766753","rating":5,"reviews":6,"likes":168,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-2062386","slot":"m-sweat","color":"grey","colorSource":"name","classification":"name-rules","brand":"인사일런스","name":"히든 포켓 스웨트셔츠 GREY","price":46200,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20210813/2062386/2062386_2_big.jpg?w=600","url":"https://www.musinsa.com/products/2062386","rating":4.8,"reviews":24,"likes":84,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-2344380","slot":"m-sweat","color":"ivory","colorSource":"image","classification":"name-rules","brand":"인사일런스","name":"라이트웨이트 패치 스웨트셔츠 VANILLA","price":46200,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20220207/2344380/2344380_2_big.jpg?w=600","url":"https://www.musinsa.com/products/2344380","rating":4.9,"reviews":14,"likes":121,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-2703946","slot":"m-sweat","color":"ivory","colorSource":"name","classification":"name-rules","brand":"인사일런스","name":"다트 포인트 오버핏 스웨트셔츠 CREAM","price":69300,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20220808/2703946/2703946_2_big.jpg?w=600","url":"https://www.musinsa.com/products/2703946","rating":4.6,"reviews":20,"likes":141,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7219096","slot":"m-flannel","color":"grey","colorSource":"name","classification":"name-rules","brand":"인사일런스","name":"피치 체크 셔츠 ASH BLUE","price":129000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260901/7219096/7219096_17888485456237_big.jpg?w=600","url":"https://www.musinsa.com/products/7219096","rating":null,"reviews":0,"likes":32,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7084187","slot":"m-flannel","color":"grey","colorSource":"name","classification":"name-rules","brand":"인사일런스","name":"오버사이즈 체크 셔츠 GREY","price":119000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260814/7084187/7084187_17875511264635_big.jpg?w=600","url":"https://www.musinsa.com/products/7084187","rating":null,"reviews":0,"likes":26,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-3889704","slot":"m-harrington","color":"beige","colorSource":"name","classification":"name-rules","brand":"인사일런스","name":"플리츠 체크 자켓 BEIGE","price":139300,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20240221/3889704/3889704_17089104488549_big.jpg?w=600","url":"https://www.musinsa.com/products/3889704","rating":4.9,"reviews":11,"likes":227,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-2347642","slot":"m-harrington","color":"beige","colorSource":"name","classification":"name-rules","brand":"인사일런스","name":"오버사이즈 울 블루종 BEIGE","price":139300,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20220208/2347642/2347642_2_big.jpg?w=600","url":"https://www.musinsa.com/products/2347642","rating":4.8,"reviews":16,"likes":210,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7219210","slot":"m-field","color":"beige","colorSource":"name","classification":"name-rules","brand":"인사일런스","name":"사파리 자켓 BEIGE","price":279000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260901/7219210/7219210_17888454213532_big.jpg?w=600","url":"https://www.musinsa.com/products/7219210","rating":null,"reviews":0,"likes":12,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6318190","slot":"m-tee","color":"charcoal","colorSource":"name","classification":"name-rules","brand":"인사일런스","name":"스트라이프 티셔츠 CHARCOAL","price":53000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260415/6318190/6318190_17769108520299_big.jpg?w=600","url":"https://www.musinsa.com/products/6318190","rating":4.9,"reviews":19,"likes":419,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-2146805","slot":"m-trucker","color":"brown","colorSource":"correction","classification":"name-rules","brand":"인사일런스","name":"박시핏 데님 자켓 BROWN","price":104300,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20210927/2146805/2146805_2_big.jpg?w=600","url":"https://www.musinsa.com/products/2146805","rating":4.9,"reviews":17,"likes":494,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-2457076","slot":"m-vest","color":"brown","colorSource":"name","classification":"name-rules","brand":"인사일런스","name":"튜브얀 니트 베스트 DARK BROWN","price":69300,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20220330/2457076/2457076_2_big.jpg?w=600","url":"https://www.musinsa.com/products/2457076","rating":5,"reviews":3,"likes":148,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-3579082","slot":"m-varsity","color":"black","colorSource":"name","classification":"name-rules","brand":"인사일런스","name":"엠브로이더리 바시티 자켓 BLACK","price":209300,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20230920/3579082/3579082_16958092593220_big.jpg?w=600","url":"https://www.musinsa.com/products/3579082","rating":5,"reviews":20,"likes":458,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7219165","slot":"m-fleece","color":"grey","colorSource":"name","classification":"name-rules","brand":"인사일런스","name":"플리스 풀 집업 점퍼 MELANGE GREY","price":169000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260901/7219165/7219165_17888465956228_big.jpg?w=600","url":"https://www.musinsa.com/products/7219165","rating":null,"reviews":0,"likes":28,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7084154","slot":"m-henley","color":"navy","colorSource":"name","classification":"name-rules","brand":"인사일런스","name":"슬림핏 리브드 헨리넥 NAVY","price":69000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260814/7084154/7084154_17875515210826_big.jpg?w=600","url":"https://www.musinsa.com/products/7084154","rating":4.5,"reviews":2,"likes":92,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5304743","slot":"m-rugby","color":"brown","colorSource":"name","classification":"name-rules","brand":"인사일런스","name":"스트라이프 럭비 폴로 BROWN","price":88000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250808/5304743/5304743_17549856711157_big.jpg?w=600","url":"https://www.musinsa.com/products/5304743","rating":4.8,"reviews":4,"likes":119,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5993354","slot":"m-denim","color":"black","colorSource":"correction","classification":"name-rules","brand":"인사일런스","name":"엔지니어핏 데님 팬츠 BLACK","price":149000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260206/5993354/5993354_17875485478382_big.jpg?w=600","url":"https://www.musinsa.com/products/5993354","rating":5,"reviews":7,"likes":314,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-3136441","slot":"m-oxford","color":"beige","colorSource":"name","classification":"name-rules","brand":"엘무드","name":"프렌치 린넨 셔츠 샌드 베이지","price":35400,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20230309/3136441/3136441_17787309677220_big.jpg?w=600","url":"https://www.musinsa.com/products/3136441","rating":4.9,"reviews":46,"likes":355,"summer":true,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7033956","slot":"m-oxford","color":"indigo","colorSource":"name","classification":"name-rules","brand":"엘무드","name":"에르고 데님 스트랩 셔츠 블랙 스파이크","price":143100,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260810/7033956/7033956_17884184690590_big.jpg?w=600","url":"https://www.musinsa.com/products/7033956","rating":5,"reviews":1,"likes":49,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4278935","slot":"m-knit","color":"olive","colorSource":"image","classification":"name-rules","brand":"엘무드","name":"밀라노 울 코튼 라운드넥 풀오버 니트","price":63000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20240729/4278935/4278935_17283569219323_big.jpg?w=600","url":"https://www.musinsa.com/products/4278935","rating":4.9,"reviews":766,"likes":3,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6034109","slot":"m-knit","color":"ivory","colorSource":"image","classification":"name-rules","brand":"엘무드","name":"디온 비스코스 헨리넥 롱 슬리브 니트","price":74400,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260220/6034109/6034109_17718255980912_big.png?w=600","url":"https://www.musinsa.com/products/6034109","rating":4.9,"reviews":58,"likes":962,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-3843009","slot":"m-knit","color":"white","colorSource":"name","classification":"name-rules","brand":"엘무드","name":"베이 스카시 하프 니트 오프화이트","price":17600,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20240202/3843009/3843009_17147179185180_big.jpg?w=600","url":"https://www.musinsa.com/products/3843009","rating":4.9,"reviews":32,"likes":465,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7033970","slot":"m-fleece","color":"black","colorSource":"name","classification":"name-rules","brand":"엘무드","name":"로아 오버사이즈 플리스 집업 자켓 블랙","price":115200,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260810/7033970/7033970_17887629375785_big.jpg?w=600","url":"https://www.musinsa.com/products/7033970","rating":null,"reviews":0,"likes":63,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5316867","slot":"m-balmacaan","color":"grey","colorSource":"name","classification":"name-rules","brand":"엘무드","name":"그레이웨일 싱글 코트 펠트로 블랙","price":358200,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250812/5316867/5316867_17645590924042_big.png?w=600","url":"https://www.musinsa.com/products/5316867","rating":4.9,"reviews":35,"likes":1,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7034049","slot":"m-balmacaan","color":"charcoal","colorSource":"name","classification":"name-rules","brand":"엘무드","name":"카브 발마칸 맥코트 차콜","price":432000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260810/7034049/7034049_17909322915363_big.jpg?w=600","url":"https://www.musinsa.com/products/7034049","rating":null,"reviews":0,"likes":68,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5316868","slot":"m-peacoat","color":"navy","colorSource":"name","classification":"name-rules","brand":"엘무드","name":"마르코 핸드메이드 더블코트 미드나잇 블랙","price":301000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250812/5316868/5316868_17648308120373_big.png?w=600","url":"https://www.musinsa.com/products/5316868","rating":4.9,"reviews":8,"likes":574,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-3788307","slot":"m-cardigan","color":"black","colorSource":"name","classification":"name-rules","brand":"엘무드","name":"유틸리티 니트 베스트 가디건 블랙","price":38000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20240111/3788307/3788307_17792695508380_big.jpg?w=600","url":"https://www.musinsa.com/products/3788307","rating":4.8,"reviews":13,"likes":315,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5316780","slot":"m-cardigan","color":"brown","colorSource":"name","classification":"name-rules","brand":"엘무드","name":"빈티지 스파클링 울 트위드 가디건 브라운","price":74000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250812/5316780/5316780_17649213963756_big.png?w=600","url":"https://www.musinsa.com/products/5316780","rating":5,"reviews":2,"likes":123,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7033881","slot":"m-stripe-shirt","color":"ivory","colorSource":"name","classification":"name-rules","brand":"엘무드","name":"라미 스트라이프 셔츠 아이보리","price":134100,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260810/7033881/7033881_17884184172754_big.jpg?w=600","url":"https://www.musinsa.com/products/7033881","rating":null,"reviews":0,"likes":103,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5973743","slot":"m-slacks","color":"black","colorSource":"name","classification":"name-rules","brand":"엘무드","name":"키아라 울 헤링본 슬랙스 블랙","price":108500,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260203/5973743/5973743_17709518302044_big.png?w=600","url":"https://www.musinsa.com/products/5973743","rating":4.8,"reviews":18,"likes":738,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5316742","slot":"m-slacks","color":"brown","colorSource":"name","classification":"name-rules","brand":"엘무드","name":"새틴 와이드 슬랙스 브라운","price":77500,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250812/5316742/5316742_17573893761448_big.png?w=600","url":"https://www.musinsa.com/products/5316742","rating":null,"reviews":0,"likes":141,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4705561","slot":"m-denim","color":"blue","colorSource":"correction","classification":"name-rules","brand":"엘무드","name":"빅보이 와이드 데님 스모킹블루","price":101500,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250108/4705561/4705561_17376855113343_big.jpg?w=600","url":"https://www.musinsa.com/products/4705561","rating":5,"reviews":65,"likes":1,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5316737","slot":"m-denim","color":"navy","colorSource":"name","classification":"name-rules","brand":"엘무드","name":"크루져 와이드 플레어 데님 미드나잇블루","price":101500,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250812/5316737/5316737_17573897814933_big.png?w=600","url":"https://www.musinsa.com/products/5316737","rating":4.9,"reviews":48,"likes":1,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-3788312","slot":"m-cargo","color":"charcoal","colorSource":"name","classification":"name-rules","brand":"엘무드","name":"디핀 가먼트 워시드 카고 팬츠 차콜 그레이","price":79200,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20240111/3788312/3788312_17791842813485_big.jpg?w=600","url":"https://www.musinsa.com/products/3788312","rating":4.3,"reviews":4,"likes":174,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-3019679","slot":"m-harrington","color":"beige","colorSource":"name","classification":"name-rules","brand":"엘무드","name":"햄튼 치노 블루종 자켓 베이지","price":223200,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20230111/3019679/3019679_17791814658087_big.jpg?w=600","url":"https://www.musinsa.com/products/3019679","rating":4.9,"reviews":285,"likes":2,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4705476","slot":"m-harrington","color":"black","colorSource":"name","classification":"name-rules","brand":"엘무드","name":"트위스트 코튼 블루종 자켓 블랙","price":144000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250108/4705476/4705476_17624093762961_big.png?w=600","url":"https://www.musinsa.com/products/4705476","rating":4.9,"reviews":7,"likes":697,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-3788371","slot":"m-chambray","color":"blue","colorSource":"name","classification":"name-rules","brand":"엘무드","name":"세인트 웨스턴 셔츠 블루 스트라이프","price":75600,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20240111/3788371/3788371_17587851434231_big.png?w=600","url":"https://www.musinsa.com/products/3788371","rating":4.9,"reviews":378,"likes":2,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7033929","slot":"m-down","color":"charcoal","colorSource":"image","classification":"name-rules","brand":"엘무드","name":"베이퍼 라이트 덕 다운 푸퍼 자켓","price":223200,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260810/7033929/7033929_17872039464948_big.png?w=600","url":"https://www.musinsa.com/products/7033929","rating":5,"reviews":105,"likes":750,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7033981","slot":"m-belt","color":"black","colorSource":"name","classification":"name-rules","brand":"엘무드","name":"헥스 크로커 엠보 레더 벨트 블랙","price":83700,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260810/7033981/7033981_17885144523424_big.jpg?w=600","url":"https://www.musinsa.com/products/7033981","rating":null,"reviews":0,"likes":26,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4553044","slot":"m-denim","color":"grey","colorSource":"name","classification":"name-rules","brand":"시그니처","name":"기모 와이드 플레어 부츠컷 슬랙스[그레이]","price":34900,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20241024/4553044/4553044_17316614463797_big.jpg?w=600","url":"https://www.musinsa.com/products/4553044","rating":4.7,"reviews":30,"likes":277,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-2097128","slot":"m-slacks","color":"black","colorSource":"image","classification":"name-rules","brand":"시그니처","name":"[2PACK]와이드핏 슬랙스","price":69900,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20210830/2097128/2097128_17280145311594_big.jpg?w=600","url":"https://www.musinsa.com/products/2097128","rating":4.8,"reviews":186,"likes":855,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4511859","slot":"m-slacks","color":"brown","colorSource":"name","classification":"name-rules","brand":"시그니처","name":"[WITH 유호진] 울 라이크 노턱 와이드핏 슬랙스[브라운]","price":41900,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20241014/4511859/4511859_17297729351893_big.jpg?w=600","url":"https://www.musinsa.com/products/4511859","rating":4.9,"reviews":49,"likes":981,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7242251","slot":"m-slacks","color":"olive","colorSource":"image","classification":"name-rules","brand":"시그니처","name":"원턱 라인 슬랙스[스트라이프]","price":49900,"img":"https://image.msscdn.net/thumbnails/images/prd_img/20260903/7242251/detail_7242251_17895273706046_big.jpg?w=600","url":"https://www.musinsa.com/products/7242251","rating":null,"reviews":0,"likes":0,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4299048","slot":"m-chino","color":"olive","colorSource":"name","classification":"name-rules","brand":"시그니처","name":"하프밴딩 와이드 치노 팬츠[카키]","price":39900,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20240806/4299048/4299048_17237007820734_big.jpg?w=600","url":"https://www.musinsa.com/products/4299048","rating":4.9,"reviews":41,"likes":424,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7083007","slot":"m-cargo","color":"charcoal","colorSource":"name","classification":"name-rules","brand":"시그니처","name":"하프밴딩 커브드 카고 팬츠[차콜]","price":37900,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260814/7083007/7083007_17908206896209_big.jpg?w=600","url":"https://www.musinsa.com/products/7083007","rating":4.9,"reviews":14,"likes":342,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7326135","slot":"m-beanie","color":"black","colorSource":"name","classification":"name-rules","brand":"시그니처","name":"와플 소잉 비니[블랙]","price":19900,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260914/7326135/7326135_17895260896402_big.jpg?w=600","url":"https://www.musinsa.com/products/7326135","rating":5,"reviews":1,"likes":177,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7326137","slot":"m-beanie","color":"charcoal","colorSource":"name","classification":"name-rules","brand":"시그니처","name":"와플 소잉 비니[차콜]","price":16900,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260914/7326137/7326137_17895259057897_big.jpg?w=600","url":"https://www.musinsa.com/products/7326137","rating":5,"reviews":1,"likes":74,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7326136","slot":"m-beanie","color":"olive","colorSource":"name","classification":"name-rules","brand":"시그니처","name":"와플 소잉 비니[카키]","price":16900,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260914/7326136/7326136_17895259936075_big.jpg?w=600","url":"https://www.musinsa.com/products/7326136","rating":null,"reviews":0,"likes":39,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7378050","slot":"m-blazer","color":"black","colorSource":"name","classification":"name-rules","brand":"시그니처","name":"다잉 코튼 싱글 블레이저[블랙]","price":119000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260921/7378050/7378050_17901333747293_big.jpg?w=600","url":"https://www.musinsa.com/products/7378050","rating":null,"reviews":0,"likes":23,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5898076","slot":"m-blazer","color":"navy","colorSource":"name","classification":"name-rules","brand":"수아레","name":"컴포트 코튼 더블 블레이저 나이트 네이비","price":139150,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260115/5898076/5898076_17685277369922_big.jpg?w=600","url":"https://www.musinsa.com/products/5898076","rating":5,"reviews":2,"likes":0,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4313053","slot":"m-flannel","color":"charcoal","colorSource":"image","classification":"name-rules","brand":"수아레","name":"유로피안 피치 체크 셔츠","price":37400,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20240809/4313053/4313053_17258603543735_big.jpg?w=600","url":"https://www.musinsa.com/products/4313053","rating":4.7,"reviews":112,"likes":1,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6101954","slot":"m-slacks","color":"navy","colorSource":"name","classification":"name-rules","brand":"수아레","name":"린넨 플리츠 팬츠 네이비","price":49900,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260309/6101954/6101954_17739851758253_big.jpg?w=600","url":"https://www.musinsa.com/products/6101954","rating":4.7,"reviews":39,"likes":827,"summer":true,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4703081","slot":"m-harrington","color":"grey","colorSource":"name","classification":"name-rules","brand":"수아레","name":"런던 브릿지 코튼 후드 자켓 라이트 그레이","price":92950,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250107/4703081/4703081_17368279737061_big.jpg?w=600","url":"https://www.musinsa.com/products/4703081","rating":4.9,"reviews":12,"likes":252,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6102155","slot":"m-harrington","color":"navy","colorSource":"name","classification":"name-rules","brand":"수아레","name":"워시드 코듀로이 자켓 네이비","price":74150,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260309/6102155/6102155_17739855143222_big.jpg?w=600","url":"https://www.musinsa.com/products/6102155","rating":null,"reviews":0,"likes":0,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6102161","slot":"m-harrington","color":"beige","colorSource":"name","classification":"name-rules","brand":"수아레","name":"워시드 코듀로이 자켓 베이지","price":74150,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260309/6102161/6102161_17739855828410_big.jpg?w=600","url":"https://www.musinsa.com/products/6102161","rating":null,"reviews":0,"likes":0,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4748630","slot":"m-cardigan","color":"black","colorSource":"image","classification":"name-rules","brand":"수아레","name":"레인 드롭 니트 가디건","price":46450,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250131/4748630/4748630_17435709906376_big.jpg?w=600","url":"https://www.musinsa.com/products/4748630","rating":4.8,"reviews":243,"likes":2,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4252493","slot":"m-trucker","color":"blue","colorSource":"correction","classification":"name-rules","brand":"수아레","name":"맥시핏 데님 트러커 자켓 미드블루","price":39600,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20240716/4252493/4252493_17249803404777_big.jpg?w=600","url":"https://www.musinsa.com/products/4252493","rating":4.8,"reviews":8,"likes":210,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6679275","slot":"m-runner","color":"pink","colorSource":"image","classification":"name-rules","brand":"락포트","name":"틸만 스니커즈 TM TILMAN SNEAKER","price":320000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260616/6679275/6679275_17852192358623_big.jpg?w=600","url":"https://www.musinsa.com/products/6679275","rating":null,"reviews":0,"likes":2,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6274878","slot":"m-loafer","color":"ivory","colorSource":"image","classification":"name-rules","brand":"락포트","name":"로랜드 로퍼 ROLAND LOAFER","price":196000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260408/6274878/6274878_17756181994989_big.jpg?w=600","url":"https://www.musinsa.com/products/6274878","rating":5,"reviews":2,"likes":28,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6055189","slot":"m-loafer","color":"beige","colorSource":"image","classification":"name-rules","brand":"락포트","name":"크레이븐 로퍼 CRAVEN LOAFER","price":196000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260225/6055189/6055189_17720035702146_big.jpg?w=600","url":"https://www.musinsa.com/products/6055189","rating":5,"reviews":1,"likes":12,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6134685","slot":"m-harrington","color":"white","colorSource":"name","classification":"name-rules","brand":"노스페이스","name":"화이트라벨 루벤 자켓 WHITE","price":178200,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260316/6134685/6134685_17736210149861_big.jpg?w=600","url":"https://www.musinsa.com/products/6134685","rating":4.9,"reviews":64,"likes":1,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6076159","slot":"m-harrington","color":"white","colorSource":"name","classification":"name-rules","brand":"노스페이스","name":"화이트라벨 베이든 자켓 NAVY","price":166600,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260304/6076159/6076159_17828772365014_big.jpg?w=600","url":"https://www.musinsa.com/products/6076159","rating":5,"reviews":5,"likes":341,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5552092","slot":"m-harrington","color":"grey","colorSource":"name","classification":"name-rules","brand":"노스페이스","name":"남성 르위스 T 자켓 DARK GRAY","price":119000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250930/5552092/5552092_17828869613497_big.jpg?w=600","url":"https://www.musinsa.com/products/5552092","rating":5,"reviews":6,"likes":302,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5736291","slot":"m-shell","color":"black","colorSource":"name","classification":"name-rules","brand":"노스페이스","name":"남성 무브프리 자켓 BLACK","price":79000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20251114/5736291/5736291_17828005147239_big.jpg?w=600","url":"https://www.musinsa.com/products/5736291","rating":5,"reviews":15,"likes":188,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5994639","slot":"m-shell","color":"black","colorSource":"name","classification":"name-rules","brand":"노스페이스","name":"남성 고어텍스 앵커 자켓 BLACK","price":303200,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260209/5994639/5994639_17828746310017_big.jpg?w=600","url":"https://www.musinsa.com/products/5994639","rating":5,"reviews":7,"likes":182,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7263957","slot":"m-down","color":"black","colorSource":"name","classification":"name-rules","brand":"노스페이스","name":"남성 히말라얀 라이트 다운 파카 (RDS) BLACK","price":750000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260907/7263957/7263957_17887612528406_big.jpg?w=600","url":"https://www.musinsa.com/products/7263957","rating":null,"reviews":0,"likes":75,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7423435","slot":"m-down","color":"grey","colorSource":"name","classification":"name-rules","brand":"노스페이스","name":"프리무브 다운 자켓 (RDS) STEEL GRAY","price":348000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260930/7423435/7423435_17913330767232_big.jpg?w=600","url":"https://www.musinsa.com/products/7423435","rating":null,"reviews":0,"likes":24,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7364250","slot":"m-polo","color":"black","colorSource":"name","classification":"name-rules","brand":"노스페이스","name":"이지데이 긴팔 폴로 티셔츠 BLACK","price":108000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260918/7364250/7364250_17899561625575_big.jpg?w=600","url":"https://www.musinsa.com/products/7364250","rating":5,"reviews":1,"likes":20,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6990744","slot":"m-cap","color":"olive","colorSource":"image","classification":"name-rules","brand":"살로몬","name":"링크 그리드 볼 캡","price":75000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260804/6990744/6990744_17884120282108_big.jpg?w=600","url":"https://www.musinsa.com/products/6990744","rating":5,"reviews":5,"likes":95,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5360724","slot":"m-down","color":"olive","colorSource":"image","classification":"name-rules","brand":"살로몬","name":"모디세이 인슐레이션 자켓","price":320000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250825/5360724/5360724_17899799454514_big.jpg?w=600","url":"https://www.musinsa.com/products/5360724","rating":5,"reviews":12,"likes":436,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6991174","slot":"m-down","color":"grey","colorSource":"image","classification":"name-rules","brand":"살로몬","name":"모디세이 인슐레이션 자켓","price":320000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260804/6991174/6991174_17899796070724_big.jpg?w=600","url":"https://www.musinsa.com/products/6991174","rating":5,"reviews":1,"likes":84,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6990683","slot":"m-sweat","color":"purple","colorSource":"image","classification":"name-rules","brand":"살로몬","name":"헤이카 플리스 쿼터 집","price":270000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260804/6990683/6990683_17917826682041_big.jpg?w=600","url":"https://www.musinsa.com/products/6990683","rating":5,"reviews":1,"likes":30,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6990828","slot":"m-knit","color":"charcoal","colorSource":"image","classification":"name-rules","brand":"살로몬","name":"녹티스 풀오버","price":190000,"img":"https://image.msscdn.net/thumbnails/images/prd_img/20260804/6990828/detail_6990828_17876264065359_big.jpg?w=600","url":"https://www.musinsa.com/products/6990828","rating":null,"reviews":0,"likes":29,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6917513","slot":"m-hoodie","color":"navy","colorSource":"image","classification":"name-rules","brand":"살로몬","name":"슬레이트 프로스트라이드 후디","price":190000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260724/6917513/6917513_17870183104434_big.jpg?w=600","url":"https://www.musinsa.com/products/6917513","rating":null,"reviews":0,"likes":26,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6899190","slot":"m-shell","color":"ivory","colorSource":"image","classification":"name-rules","brand":"살로몬","name":"템포스 러닝 자켓","price":240000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260722/6899190/6899190_17909085713463_big.jpg?w=600","url":"https://www.musinsa.com/products/6899190","rating":5,"reviews":3,"likes":55,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6991439","slot":"m-longtee","color":"charcoal","colorSource":"image","classification":"name-rules","brand":"살로몬","name":"스팀플로우 롱 슬리브","price":130000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260804/6991439/6991439_17909076168138_big.jpg?w=600","url":"https://www.musinsa.com/products/6991439","rating":5,"reviews":4,"likes":105,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6916949","slot":"m-longtee","color":"purple","colorSource":"image","classification":"name-rules","brand":"살로몬","name":"슬레이트 프로스트라이드 롱 슬리브","price":150000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260724/6916949/6916949_17917834362021_big.jpg?w=600","url":"https://www.musinsa.com/products/6916949","rating":null,"reviews":0,"likes":51,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6899427","slot":"m-tee","color":"ivory","colorSource":"image","classification":"name-rules","brand":"살로몬","name":"펄스웨이브 숏 슬리브","price":100000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260722/6899427/6899427_17909083016084_big.jpg?w=600","url":"https://www.musinsa.com/products/6899427","rating":5,"reviews":1,"likes":76,"summer":true,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5299359","slot":"m-shell","color":"navy","colorSource":"image","classification":"correction","brand":"파타고니아","name":"멘즈 후디니 스태쉬 1/2 집 풀오버","price":153300,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250807/5299359/5299359_17545337660267_big.jpg?w=600","url":"https://www.musinsa.com/products/5299359","rating":5,"reviews":5,"likes":65,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5377762","slot":"m-shell","color":"grey","colorSource":"image","classification":"name-rules","brand":"파타고니아","name":"멘즈 라이트 거스트 셔츠 재킷","price":279300,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250829/5377762/5377762_17573093404344_big.jpg?w=600","url":"https://www.musinsa.com/products/5377762","rating":null,"reviews":0,"likes":54,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6839150","slot":"m-shell","color":"charcoal","colorSource":"image","classification":"name-rules","brand":"파타고니아","name":"멘즈 그래니트 크레스트 레인 재킷","price":519000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260714/6839150/6839150_17840049051457_big.jpg?w=600","url":"https://www.musinsa.com/products/6839150","rating":null,"reviews":0,"likes":8,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6029779","slot":"m-tee","color":"charcoal","colorSource":"image","classification":"name-rules","brand":"파타고니아","name":"멘즈 ’95 오벌 로고 티셔츠","price":66400,"img":"https://image.msscdn.net/thumbnails/images/prd_img/20260219/6029779/detail_6029779_17715485401675_big.jpg?w=600","url":"https://www.musinsa.com/products/6029779","rating":4.7,"reviews":15,"likes":182,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7046980","slot":"m-fleece","color":"grey","colorSource":"image","classification":"name-rules","brand":"파타고니아","name":"멘즈 라이트웨이트 신칠라 스냅-티 풀오버","price":239000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260811/7046980/7046980_17864980218955_big.jpg?w=600","url":"https://www.musinsa.com/products/7046980","rating":4.9,"reviews":307,"likes":5,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6883772","slot":"m-fleece","color":"beige","colorSource":"image","classification":"correction","brand":"파타고니아","name":"멘즈 레트로 파일 재킷","price":249000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260721/6883772/6883772_17878099924647_big.jpg?w=600","url":"https://www.musinsa.com/products/6883772","rating":5,"reviews":6,"likes":727,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7066761","slot":"m-fleece","color":"black","colorSource":"image","classification":"correction","brand":"파타고니아","name":"멘즈 클래식 레트로-X 재킷","price":389000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260813/7066761/7066761_17865795224818_big.jpg?w=600","url":"https://www.musinsa.com/products/7066761","rating":4.8,"reviews":14,"likes":806,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5586697","slot":"m-hoodie","color":"charcoal","colorSource":"name","classification":"name-rules","brand":"스노우피크 어패럴","name":"써밋그리드 후드 집업 Charcoal Gray","price":104300,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20251014/5586697/5586697_17611165984458_big.jpg?w=600","url":"https://www.musinsa.com/products/5586697","rating":null,"reviews":0,"likes":25,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5472960","slot":"m-down","color":"black","colorSource":"image","classification":"name-rules","brand":"스노우피크 어패럴","name":"2L 티타닉 경량 후드 다운 자켓 Dark Turquoise","price":207200,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250916/5472960/5472960_17611164995726_big.jpg?w=600","url":"https://www.musinsa.com/products/5472960","rating":4.5,"reviews":2,"likes":138,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7282837","slot":"m-down","color":"black","colorSource":"name","classification":"name-rules","brand":"스노우피크 어패럴","name":"에어노바 퍼텍스 퀀텀 씬클라우드 자켓 Black","price":227050,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260909/7282837/7282837_17889158161049_big.jpg?w=600","url":"https://www.musinsa.com/products/7282837","rating":null,"reviews":0,"likes":26,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7067434","slot":"m-shell","color":"olive","colorSource":"name","classification":"name-rules","brand":"스노우피크 어패럴","name":"캠프 드라이 바람막이 Yellow Khaki","price":179550,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260813/7067434/7067434_17890946183458_big.jpg?w=600","url":"https://www.musinsa.com/products/7067434","rating":5,"reviews":4,"likes":33,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7102621","slot":"m-shell","color":"olive","colorSource":"name","classification":"name-rules","brand":"스노우피크 어패럴","name":"루트 스탠드넥 바람막이 Chocolate Khaki","price":160550,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260819/7102621/7102621_17890932403486_big.jpg?w=600","url":"https://www.musinsa.com/products/7102621","rating":5,"reviews":2,"likes":8,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5621169","slot":"m-down","color":"brown","colorSource":"image","classification":"correction","brand":"아크테릭스","name":"아톰 SL 후디 남성 - MARS","price":344000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20251021/5621169/5621169_17616153865679_big.jpg?w=600","url":"https://www.musinsa.com/products/5621169","rating":4.8,"reviews":4,"likes":117,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4772400","slot":"m-down","color":"indigo","colorSource":"image","classification":"correction","brand":"아크테릭스","name":"아톰 자켓 남성 - SOULSONIC","price":312000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250210/4772400/4772400_17397755683890_big.jpg?w=600","url":"https://www.musinsa.com/products/4772400","rating":5,"reviews":2,"likes":36,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6036343","slot":"m-down","color":"ivory","colorSource":"image","classification":"correction","brand":"아크테릭스","name":"프로톤 후디 남성 - SEA SALT / HABITAT","price":521550,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260220/6036343/6036343_17720811574058_big.jpg?w=600","url":"https://www.musinsa.com/products/6036343","rating":4.5,"reviews":2,"likes":55,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7490283","slot":"m-hoodie","color":"black","colorSource":"image","classification":"name-rules","brand":"아크테릭스","name":"크로닌 AR 후디 남성","price":499000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20261012/7490283/7490283_17917813345254_big.jpg?w=600","url":"https://www.musinsa.com/products/7490283","rating":null,"reviews":0,"likes":1,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5047734","slot":"m-shell","color":"ivory","colorSource":"image","classification":"name-rules","brand":"아크테릭스","name":"베타 자켓 남성 - TRAIL MAGIC","price":520000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250421/5047734/5047734_17458039056419_big.jpg?w=600","url":"https://www.musinsa.com/products/5047734","rating":5,"reviews":8,"likes":75,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4186173","slot":"m-shell","color":"black","colorSource":"name","classification":"name-rules","brand":"아크테릭스","name":"노반 쉘 자켓 남성 - VITALITY/BLACK SAPPHIRE","price":414000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20240610/4186173/4186173_17193815076906_big.jpg?w=600","url":"https://www.musinsa.com/products/4186173","rating":5,"reviews":3,"likes":88,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6514578","slot":"m-shell","color":"charcoal","colorSource":"image","classification":"correction","brand":"아크테릭스","name":"감마 MX 후디 남성 - SPOTLIGHT","price":598500,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260520/6514578/6514578_17809016435282_big.jpg?w=600","url":"https://www.musinsa.com/products/6514578","rating":null,"reviews":0,"likes":27,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6737745","slot":"m-tee","color":"black","colorSource":"image","classification":"name-rules","brand":"컬럼비아","name":"돈 보울 퀵드라이 반팔 티셔츠 패키지(2pack)","price":69000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260626/6737745/6737745_17824551327753_big.jpg?w=600","url":"https://www.musinsa.com/products/6737745","rating":null,"reviews":0,"likes":5,"summer":true,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7134000","slot":"m-sweat","color":"charcoal","colorSource":"image","classification":"name-rules","brand":"컬럼비아","name":"사코 힐 하프 집업","price":119000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260821/7134000/7134000_17873015662750_big.jpg?w=600","url":"https://www.musinsa.com/products/7134000","rating":null,"reviews":0,"likes":1,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7460183","slot":"m-fleece","color":"grey","colorSource":"correction","classification":"name-rules","brand":"컬럼비아","name":"스웨터 웨더 풀집 플리스 자켓","price":139000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20261006/7460183/7460183_17912684647762_big.jpg?w=600","url":"https://www.musinsa.com/products/7460183","rating":null,"reviews":0,"likes":2,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5609530","slot":"m-chore","color":"black","colorSource":"image","classification":"name-rules","brand":"컬럼비아","name":"하이 캐스케이드 셔츠 자켓","price":95000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20251017/5609530/5609530_17909249108352_big.jpg?w=600","url":"https://www.musinsa.com/products/5609530","rating":null,"reviews":0,"likes":13,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5999445","slot":"m-shell","color":"orange","colorSource":"image","classification":"name-rules","brand":"컬럼비아","name":"소우덴 프로 3L 방수 자켓","price":499000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260209/5999445/5999445_17706260758885_big.jpg?w=600","url":"https://www.musinsa.com/products/5999445","rating":null,"reviews":0,"likes":9,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7154213","slot":"m-shell","color":"black","colorSource":"image","classification":"name-rules","brand":"컬럼비아","name":"아틱 크레스트 II 후드 풀집 자켓","price":199000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260825/7154213/7154213_17876284559310_big.jpg?w=600","url":"https://www.musinsa.com/products/7154213","rating":null,"reviews":0,"likes":3,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7134003","slot":"m-longtee","color":"orange","colorSource":"image","classification":"name-rules","brand":"컬럼비아","name":"365 트랙 II 긴팔 라운드 티셔츠","price":109000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260821/7134003/7134003_17909225817850_big.jpg?w=600","url":"https://www.musinsa.com/products/7134003","rating":null,"reviews":0,"likes":0,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-3553909","slot":"m-trail","color":"green","colorSource":"name","classification":"name-rules","brand":"호카","name":"챌린저 ATR 7 고어텍스 - 블루그린 / 1134501-OMDL","price":219000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20230912/3553909/3553909_16969250965205_big.jpg?w=600","url":"https://www.musinsa.com/products/3553909","rating":4.9,"reviews":46,"likes":223,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-3417946","slot":"m-trail","color":"yellow","colorSource":"name","classification":"name-rules","brand":"호카","name":"챌린저 ATR 7 - 딥블루:네온 옐로우 / 1134497-DBEPR","price":189000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20230720/3417946/3417946_16902478894575_big.jpg?w=600","url":"https://www.musinsa.com/products/3417946","rating":4.9,"reviews":35,"likes":198,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5868741","slot":"m-trail","color":"beige","colorSource":"image","classification":"name-rules","brand":"호카","name":"본디 9 - 프로스트:페일 탠저린 / 1162011-FSTP","price":229000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260105/5868741/5868741_17701840855100_big.jpg?w=600","url":"https://www.musinsa.com/products/5868741","rating":null,"reviews":0,"likes":106,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-389452","slot":"m-canvas","color":"pink","colorSource":"name","classification":"name-rules","brand":"컨버스","name":"척테일러 올스타 클래식 핑크","price":48300,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20160726/389452/389452_17742482451144_big.jpg?w=600","url":"https://www.musinsa.com/products/389452","rating":4.8,"reviews":400,"likes":1,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-389451","slot":"m-canvas","color":"pink","colorSource":"name","classification":"name-rules","brand":"컨버스","name":"척테일러 올스타 클래식 핑크","price":75000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20160726/389451/389451_17742480203800_big.jpg?w=600","url":"https://www.musinsa.com/products/389451","rating":4.9,"reviews":67,"likes":286,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6106617","slot":"m-canvas","color":"grey","colorSource":"name","classification":"name-rules","brand":"컨버스","name":"척테일러 스로우백 클래식 그레이","price":71400,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260310/6106617/6106617_17732172823810_big.jpg?w=600","url":"https://www.musinsa.com/products/6106617","rating":4.9,"reviews":11,"likes":228,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7467408","slot":"m-down","color":"ivory","colorSource":"image","classification":"name-rules","brand":"컨버스","name":"퍼피 스타 아이콘 다운 재킷 에그렛","price":299000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20261007/7467408/7467408_17918593771575_big.jpg?w=600","url":"https://www.musinsa.com/products/7467408","rating":null,"reviews":0,"likes":0,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7467357","slot":"m-down","color":"charcoal","colorSource":"image","classification":"name-rules","brand":"컨버스","name":"퍼피 스타 아이콘 다운 재킷 다크 매터","price":299000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20261007/7467357/7467357_17918597631932_big.jpg?w=600","url":"https://www.musinsa.com/products/7467357","rating":null,"reviews":0,"likes":0,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6714325","slot":"m-varsity","color":"black","colorSource":"name","classification":"name-rules","brand":"뉴발란스","name":"UNI NB 바시티 후디드 패딩 (BLACK)","price":199000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260623/6714325/6714325_17821784421405_big.jpg?w=600","url":"https://www.musinsa.com/products/6714325","rating":4.9,"reviews":9,"likes":284,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6714323","slot":"m-varsity","color":"navy","colorSource":"name","classification":"name-rules","brand":"뉴발란스","name":"UNI NB 바시티 후디드 패딩 (NAVY)","price":199000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260623/6714323/6714323_17821783802782_big.jpg?w=600","url":"https://www.musinsa.com/products/6714323","rating":5,"reviews":11,"likes":188,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7010693","slot":"m-longtee","color":"ivory","colorSource":"image","classification":"name-rules","brand":"뉴발란스","name":"UNI NB ESSENTIAL 2PACK 긴팔티 (MIX)","price":79900,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260806/7010693/7010693_17859957163134_big.jpg?w=600","url":"https://www.musinsa.com/products/7010693","rating":null,"reviews":0,"likes":28,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6947406","slot":"m-longtee","color":"ivory","colorSource":"name","classification":"name-rules","brand":"뉴발란스","name":"UNI ESCAPE 다잉 긴팔티 (IVORY)","price":79900,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260729/6947406/6947406_17852999943874_big.jpg?w=600","url":"https://www.musinsa.com/products/6947406","rating":null,"reviews":0,"likes":21,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6947404","slot":"m-longtee","color":"grey","colorSource":"name","classification":"name-rules","brand":"뉴발란스","name":"UNI ESCAPE 다잉 긴팔티 (B/GRAY)","price":79900,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260729/6947404/6947404_17853002682301_big.jpg?w=600","url":"https://www.musinsa.com/products/6947404","rating":null,"reviews":0,"likes":19,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5883012","slot":"m-sweat","color":"black","colorSource":"name","classification":"name-rules","brand":"뉴발란스","name":"UNI 에센셜 스몰로고 맨투맨 (BLACK)","price":79900,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260109/5883012/5883012_17688939203085_big.jpg?w=600","url":"https://www.musinsa.com/products/5883012","rating":5,"reviews":5,"likes":171,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7143032","slot":"m-sweat","color":"brown","colorSource":"name","classification":"name-rules","brand":"뉴발란스","name":"UNI 에센셜 클래식 맨투맨 (COCOA)","price":79900,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260824/7143032/7143032_17875439598378_big.jpg?w=600","url":"https://www.musinsa.com/products/7143032","rating":5,"reviews":1,"likes":34,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7045898","slot":"m-cargo","color":"black","colorSource":"name","classification":"name-rules","brand":"뉴발란스","name":"UN 에센셜 카고 와이드 팬츠 (BLACK)","price":129000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260811/7045898/7045898_17864219359803_big.jpg?w=600","url":"https://www.musinsa.com/products/7045898","rating":null,"reviews":0,"likes":19,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6433223","slot":"m-cap","color":"black","colorSource":"name","classification":"name-rules","brand":"뉴발란스","name":"FROZEN 차양 볼캡 (BLACK)","price":59900,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260507/6433223/6433223_17781301173883_big.jpg?w=600","url":"https://www.musinsa.com/products/6433223","rating":5,"reviews":1,"likes":117,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5834926","slot":"m-cap","color":"green","colorSource":"name","classification":"name-rules","brand":"뉴발란스","name":"플라잉 로고 코튼 볼캡(+SIZE) (HUNTER)","price":49900,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20251217/5834926/5834926_17845215314112_big.jpg?w=600","url":"https://www.musinsa.com/products/5834926","rating":5,"reviews":3,"likes":65,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5892559","slot":"m-cap","color":"beige","colorSource":"name","classification":"name-rules","brand":"뉴발란스","name":"플라잉 로고 코튼 볼캡(+SIZE) (BEIGE)","price":49900,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260114/5892559/5892559_17845214472719_big.jpg?w=600","url":"https://www.musinsa.com/products/5892559","rating":4.4,"reviews":5,"likes":50,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5116486","slot":"m-tee","color":"brown","colorSource":"name","classification":"name-rules","brand":"뉴발란스","name":"UNI 썸머 트래블 보스턴 반팔티 (BROWN)","price":49900,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250515/5116486/5116486_17858265163184_big.jpg?w=600","url":"https://www.musinsa.com/products/5116486","rating":4.8,"reviews":34,"likes":179,"summer":true,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4978744","slot":"m-tee","color":"white","colorSource":"name","classification":"name-rules","brand":"뉴발란스","name":"UNI 플라워 일러스트 반팔티 (WHITE)","price":49900,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250402/4978744/4978744_17814854148901_big.jpg?w=600","url":"https://www.musinsa.com/products/4978744","rating":5,"reviews":12,"likes":171,"summer":true,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4967551","slot":"m-tee","color":"brown","colorSource":"name","classification":"name-rules","brand":"뉴발란스","name":"UNI NB BOY 피크닉 페스티벌 반팔티 (BROWN)","price":59900,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250331/4967551/4967551_17858257554021_big.jpg?w=600","url":"https://www.musinsa.com/products/4967551","rating":4.8,"reviews":14,"likes":152,"summer":true,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7102002","slot":"m-chino","color":"brown","colorSource":"name","classification":"name-rules","brand":"뉴발란스","name":"UNI 에센셜 클래식 와이드 팬츠 (COCOA)","price":89900,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260819/7102002/7102002_17871212761788_big.jpg?w=600","url":"https://www.musinsa.com/products/7102002","rating":null,"reviews":0,"likes":23,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7102004","slot":"m-chino","color":"grey","colorSource":"name","classification":"name-rules","brand":"뉴발란스","name":"UNI 에센셜 클래식 와이드 팬츠 (M/GRAY)","price":89900,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260819/7102004/7102004_17871209825503_big.jpg?w=600","url":"https://www.musinsa.com/products/7102004","rating":null,"reviews":0,"likes":21,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7101994","slot":"m-chino","color":"grey","colorSource":"name","classification":"name-rules","brand":"뉴발란스","name":"UNI 에센셜 클래식 사이드턱 오버와이드 팬츠 (M/GRAY)","price":99900,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260819/7101994/7101994_17871230880824_big.jpg?w=600","url":"https://www.musinsa.com/products/7101994","rating":null,"reviews":0,"likes":17,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5934934","slot":"m-harrington","color":"black","colorSource":"name","classification":"name-rules","brand":"뉴발란스","name":"UNI 2002 아카이브 후드 포켓 자켓 (BLACK)","price":179000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260126/5934934/5934934_17693944459434_big.jpg?w=600","url":"https://www.musinsa.com/products/5934934","rating":4.9,"reviews":14,"likes":540,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5882904","slot":"m-hoodie","color":"grey","colorSource":"name","classification":"name-rules","brand":"뉴발란스","name":"UNI 에센셜 스몰로고 후드티 (LIGHT GRAY)","price":89900,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260109/5882904/5882904_17689555114987_big.jpg?w=600","url":"https://www.musinsa.com/products/5882904","rating":null,"reviews":0,"likes":115,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6947419","slot":"m-hoodie","color":"grey","colorSource":"name","classification":"name-rules","brand":"뉴발란스","name":"UNI 모닝레이브 오버핏 후드집업 (A/GRAY)","price":129000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260729/6947419/6947419_17852987653326_big.jpg?w=600","url":"https://www.musinsa.com/products/6947419","rating":null,"reviews":0,"likes":22,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7166226","slot":"m-trucker","color":"indigo","colorSource":"name","classification":"name-rules","brand":"뉴발란스","name":"UNI NB 데님 후드 포켓 자켓 (L/INDIGO)","price":179000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260826/7166226/7166226_17890023993885_big.jpg?w=600","url":"https://www.musinsa.com/products/7166226","rating":5,"reviews":3,"likes":103,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6064090","slot":"m-runner","color":"grey","colorSource":"name","classification":"name-rules","brand":"뉴발란스","name":"860 V15 (남성, 2E) (안정화) (L/GRAY)","price":189000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260227/6064090/6064090_17721677853603_big.jpg?w=600","url":"https://www.musinsa.com/products/6064090","rating":4.9,"reviews":15,"likes":116,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-1590036","slot":"m-workboots","color":"brown","colorSource":"name","classification":"name-rules","brand":"닥터마틴","name":"1460 8홀 가우초 브라운","price":260000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20200908/1590036/1590036_2_big.jpg?w=600","url":"https://www.musinsa.com/products/1590036","rating":4.9,"reviews":465,"likes":5,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5484357","slot":"m-workboots","color":"black","colorSource":"name","classification":"name-rules","brand":"닥터마틴","name":"1460 파스칼 모노 - 블랙 버지니아","price":220990,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250918/5484357/5484357_17593738460396_big.jpg?w=600","url":"https://www.musinsa.com/products/5484357","rating":5,"reviews":17,"likes":1,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5527912","slot":"m-workboots","color":"ivory","colorSource":"image","classification":"name-rules","brand":"닥터마틴","name":"1460 Carrara - GRN","price":260000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250925/5527912/5527912_17587662821473_big.jpg?w=600","url":"https://www.musinsa.com/products/5527912","rating":4.3,"reviews":4,"likes":159,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-698290","slot":"m-derby","color":"red","colorSource":"name","classification":"name-rules","brand":"닥터마틴","name":"1461 3홀 체리레드","price":229000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20180112/698290/698290_1_big.jpg?w=600","url":"https://www.musinsa.com/products/698290","rating":4.9,"reviews":144,"likes":3,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-1262092","slot":"m-derby","color":"black","colorSource":"name","classification":"name-rules","brand":"닥터마틴","name":"1461 쿼드 블랙 폴리시드 스무스","price":269000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20200103/1262092/1262092_3_big.jpg?w=600","url":"https://www.musinsa.com/products/1262092","rating":null,"reviews":0,"likes":4,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-3689104","slot":"m-derby","color":"black","colorSource":"name","classification":"name-rules","brand":"닥터마틴","name":"1461 3홀 벡스 블랙 스무스","price":249000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20231107/3689104/3689104_16993159462364_big.jpg?w=600","url":"https://www.musinsa.com/products/3689104","rating":null,"reviews":0,"likes":2,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4706725","slot":"m-hoodie","color":"black","colorSource":"name","classification":"name-rules","brand":"반스","name":"솔 워시 후디 - 블랙","price":70990,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250109/4706725/4706725_17374476051376_big.jpg?w=600","url":"https://www.musinsa.com/products/4706725","rating":5,"reviews":1,"likes":121,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6487968","slot":"m-tee","color":"black","colorSource":"name","classification":"name-rules","brand":"반스","name":"다운사이드 반소매 티셔츠 - 블랙","price":33990,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260515/6487968/6487968_17799550721373_big.jpg?w=600","url":"https://www.musinsa.com/products/6487968","rating":4.8,"reviews":12,"likes":109,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7314171","slot":"m-runner","color":"charcoal","colorSource":"name","classification":"name-rules","brand":"나이키","name":"페가수스 42 GORE-TEX M - 블랙:오프 누아르:다크 그레이:블랙","price":209000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260911/7314171/7314171_17893693727858_big.jpg?w=600","url":"https://www.musinsa.com/products/7314171","rating":null,"reviews":0,"likes":65,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4371012","slot":"m-runner","color":"black","colorSource":"name","classification":"correction","brand":"나이키","name":"에어 포스 1 07 WB M - 플랙스:검 라이트 브라운:블랙:위트","price":169000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20240826/4371012/4371012_17255868621694_big.jpg?w=600","url":"https://www.musinsa.com/products/4371012","rating":null,"reviews":0,"likes":2,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5243539","slot":"m-work-pants","color":"black","colorSource":"name","classification":"name-rules","brand":"나이키","name":"조던 플라이트 유틸리티 팬츠 M - 블랙","price":125000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250711/5243539/5243539_17525378892047_big.jpg?w=600","url":"https://www.musinsa.com/products/5243539","rating":4.8,"reviews":19,"likes":492,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6686138","slot":"m-tee","color":"black","colorSource":"name","classification":"name-rules","brand":"나이키","name":"N.A.C. 티셔츠 M - 블랙","price":55000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260617/6686138/6686138_17833913531510_big.jpg?w=600","url":"https://www.musinsa.com/products/6686138","rating":4.3,"reviews":4,"likes":185,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6089003","slot":"m-shell","color":"white","colorSource":"name","classification":"name-rules","brand":"나이키","name":"ACG 파이브 타워스 UV 프로텍션 재킷 M - 씨 글래스:블랙 스프루스:미네랄 슬레이트:서밋 화이트","price":161100,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260305/6089003/6089003_17742567426944_big.jpg?w=600","url":"https://www.musinsa.com/products/6089003","rating":4.9,"reviews":19,"likes":534,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6313137","slot":"m-shell","color":"white","colorSource":"name","classification":"name-rules","brand":"나이키","name":"ACG 스미스 서밋 UV 재킷 M - 코트 블루:워크 블루:서밋 화이트","price":209250,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260415/6313137/6313137_17768253447266_big.jpg?w=600","url":"https://www.musinsa.com/products/6313137","rating":5,"reviews":6,"likes":204,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6686096","slot":"m-shell","color":"white","colorSource":"name","classification":"name-rules","brand":"나이키","name":"윈드러너 경량 하프집 재킷 M - 서밋 화이트:블루 보이드:라이트 크림슨","price":108000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260617/6686096/6686096_17833296207398_big.jpg?w=600","url":"https://www.musinsa.com/products/6686096","rating":5,"reviews":1,"likes":46,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7231055","slot":"m-longtee","color":"black","colorSource":"name","classification":"name-rules","brand":"나이키","name":"조던 플라이트 마운틴사이드 긴소매 티셔츠 M - 블랙","price":55000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260902/7231055/7231055_17888487051884_big.jpg?w=600","url":"https://www.musinsa.com/products/7231055","rating":null,"reviews":0,"likes":35,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5301799","slot":"m-longtee","color":"red","colorSource":"image","classification":"name-rules","brand":"아디다스","name":"리버풀 FC 25/26 롱 슬리브 홈 저지","price":90300,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250807/5301799/5301799_17545599111511_big.jpg?w=600","url":"https://www.musinsa.com/products/5301799","rating":4.9,"reviews":99,"likes":1,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6852820","slot":"m-tee","color":"white","colorSource":"name","classification":"name-rules","brand":"아디다스","name":"케어베어 TI 티셔츠 - 화이트","price":49990,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260715/6852820/6852820_17846307428626_big.jpg?w=600","url":"https://www.musinsa.com/products/6852820","rating":null,"reviews":0,"likes":122,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6131015","slot":"m-cargo","color":"black","colorSource":"image","classification":"name-rules","brand":"아디다스","name":"루즈 핏 라이트 우븐 카고 포켓 스트레이트 레그 팬츠","price":83300,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260313/6131015/6131015_17733843577702_big.jpg?w=600","url":"https://www.musinsa.com/products/6131015","rating":5,"reviews":1,"likes":101,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-2551389","slot":"f-slacks","color":"grey","colorSource":"name","classification":"name-rules","brand":"무신사 스탠다드 우먼","name":"우먼즈 스트레이트 히든 밴딩 슬랙스 [미디엄 그레이]","price":49900,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20220511/2551389/2551389_17676662014272_big.jpg?w=600","url":"https://www.musinsa.com/products/2551389","rating":4.9,"reviews":356,"likes":2,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6501164","slot":"f-slacks","color":"brown","colorSource":"name","classification":"name-rules","brand":"무신사 스탠다드 우먼","name":"[오헤시오 컬래버] 코튼 커브드 팬츠 [브라운]","price":71890,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260518/6501164/6501164_17883943280794_big.jpg?w=600","url":"https://www.musinsa.com/products/6501164","rating":5,"reviews":32,"likes":836,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5745829","slot":"f-slacks","color":"grey","colorSource":"name","classification":"correction","brand":"무신사 스탠다드 우먼","name":"우먼즈 핀 스트라이프 딥 턱 와이드 슬랙스 [그레이]","price":55690,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20251118/5745829/5745829_17683663470831_big.jpg?w=600","url":"https://www.musinsa.com/products/5745829","rating":4.9,"reviews":72,"likes":8,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4651485","slot":"f-stripe","color":"red","colorSource":"name","classification":"name-rules","brand":"무신사 스탠다드 우먼","name":"우먼즈 릴렉스드 멀티 스트라이프 럭비 셔츠 [버건디]","price":49900,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20241205/4651485/4651485_17524695773917_big.jpg?w=600","url":"https://www.musinsa.com/products/4651485","rating":4.8,"reviews":204,"likes":4,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4651413","slot":"f-sweat","color":"charcoal","colorSource":"name","classification":"name-rules","brand":"무신사 스탠다드 우먼","name":"우먼즈 패널드 볼륨 스웨트셔츠 [다크 그레이]","price":37090,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20241205/4651413/4651413_17374428894600_big.jpg?w=600","url":"https://www.musinsa.com/products/4651413","rating":4.8,"reviews":55,"likes":805,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5626720","slot":"f-sweat","color":"white","colorSource":"name","classification":"name-rules","brand":"무신사 스탠다드 우먼","name":"우먼즈 오버사이즈 후디드 스웨트 집업 [화이트]","price":59900,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20251022/5626720/5626720_17701107612150_big.jpg?w=600","url":"https://www.musinsa.com/products/5626720","rating":4.8,"reviews":30,"likes":5,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5175164","slot":"f-bag","color":"brown","colorSource":"name","classification":"name-rules","brand":"무신사 스탠다드 우먼","name":"우먼즈 신세틱 스웨이드 필로우 숄더 백 [다크 브라운]","price":67890,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250610/5175164/5175164_17554864714660_big.jpg?w=600","url":"https://www.musinsa.com/products/5175164","rating":4.8,"reviews":51,"likes":3,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6655757","slot":"f-bag","color":"black","colorSource":"name","classification":"name-rules","brand":"무신사 스탠다드 우먼","name":"우먼즈 버클 슬라우치 숄더백 [블랙]","price":63890,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260611/6655757/6655757_17872118550826_big.jpg?w=600","url":"https://www.musinsa.com/products/6655757","rating":4.9,"reviews":31,"likes":2,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6450037","slot":"f-denim","color":"indigo","colorSource":"name","classification":"name-rules","brand":"무신사 스탠다드 우먼","name":"우먼즈 에센셜 커브드 데님 팬츠 [라이트 인디고]","price":44910,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260511/6450037/6450037_17912701864533_big.jpg?w=600","url":"https://www.musinsa.com/products/6450037","rating":4.9,"reviews":215,"likes":4,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6450020","slot":"f-denim","color":"indigo","colorSource":"name","classification":"name-rules","brand":"무신사 스탠다드 우먼","name":"우먼즈 에센셜 루즈 스트레이트 데님 팬츠 [미디엄 인디고]","price":49900,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260511/6450020/6450020_17846879671272_big.jpg?w=600","url":"https://www.musinsa.com/products/6450020","rating":4.9,"reviews":97,"likes":1,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4576891","slot":"f-jacket","color":"pink","colorSource":"name","classification":"name-rules","brand":"무신사 스탠다드 우먼","name":"우먼즈 피그먼트 옥스포드 블루종 재킷 [핑크]","price":93390,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20241031/4576891/4576891_17392651120710_big.jpg?w=600","url":"https://www.musinsa.com/products/4576891","rating":4.7,"reviews":35,"likes":860,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5795909","slot":"f-tee","color":"black","colorSource":"name","classification":"name-rules","brand":"무신사 스탠다드 우먼","name":"우먼즈 슬림 스쿱 넥 캡 슬리브 티셔츠 [블랙]","price":15900,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20251202/5795909/5795909_17744253035652_big.jpg?w=600","url":"https://www.musinsa.com/products/5795909","rating":4.8,"reviews":468,"likes":1,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4651446","slot":"f-tee","color":"black","colorSource":"name","classification":"name-rules","brand":"무신사 스탠다드 우먼","name":"우먼즈 버티컬 텍스처 헨리 넥 긴소매 티셔츠 [블랙]","price":20930,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20241205/4651446/4651446_17423524550225_big.jpg?w=600","url":"https://www.musinsa.com/products/4651446","rating":4.6,"reviews":122,"likes":1,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-3730385","slot":"f-tee","color":"white","colorSource":"name","classification":"name-rules","brand":"무신사 스탠다드 우먼","name":"우먼즈 슬림 크롭 래글런 긴팔 티셔츠 [화이트/블랙]","price":13930,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20231123/3730385/3730385_17080529350674_big.jpg?w=600","url":"https://www.musinsa.com/products/3730385","rating":4.7,"reviews":53,"likes":1,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6796665","slot":"f-padding","color":"green","colorSource":"name","classification":"name-rules","brand":"무신사 스탠다드 우먼","name":"[시티 레저] 우먼즈 시어 후디드 라이트 다운 재킷 [옐로우 그린]","price":139900,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260707/6796665/6796665_17876230671236_big.jpg?w=600","url":"https://www.musinsa.com/products/6796665","rating":4.9,"reviews":47,"likes":2,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-2731596","slot":"f-cardigan","color":"black","colorSource":"name","classification":"name-rules","brand":"무신사 스탠다드 우먼","name":"우먼즈 램스울 가디건 [블랙]","price":42390,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20220822/2731596/2731596_17625000499234_big.jpg?w=600","url":"https://www.musinsa.com/products/2731596","rating":4.7,"reviews":715,"likes":8,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6595038","slot":"f-cardigan","color":"grey","colorSource":"name","classification":"name-rules","brand":"무신사 스탠다드 우먼","name":"우먼즈 소프트 리브드 저지 가디건 [미디엄 그레이]","price":29900,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260602/6595038/6595038_17852934476439_big.jpg?w=600","url":"https://www.musinsa.com/products/6595038","rating":4.8,"reviews":162,"likes":3,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6796419","slot":"f-skirt","color":"black","colorSource":"name","classification":"name-rules","brand":"무신사 스탠다드 우먼","name":"우먼즈 저지 티어드 니 렝스 스커트 [블랙]","price":49900,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260707/6796419/6796419_17864401325439_big.jpg?w=600","url":"https://www.musinsa.com/products/6796419","rating":4.6,"reviews":13,"likes":811,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5290317","slot":"f-skirt","color":"brown","colorSource":"name","classification":"name-rules","brand":"무신사 스탠다드 우먼","name":"우먼즈 신세틱 스웨이드 미니 스커트 [라이트 브라운]","price":31890,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250804/5290317/5290317_17562000505863_big.jpg?w=600","url":"https://www.musinsa.com/products/5290317","rating":4.8,"reviews":56,"likes":2,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-2117253","slot":"f-skirt","color":"black","colorSource":"name","classification":"name-rules","brand":"무신사 스탠다드 우먼","name":"우먼즈 플리츠 미디 스커트 [블랙]","price":39890,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20210908/2117253/2117253_17467823245909_big.jpg?w=600","url":"https://www.musinsa.com/products/2117253","rating":null,"reviews":0,"likes":1,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6517881","slot":"f-dress","color":"grey","colorSource":"name","classification":"name-rules","brand":"무신사 스탠다드 우먼","name":"우먼즈 플리츠 미디 드레스 [그레이]","price":79900,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260520/6517881/6517881_17865086672068_big.jpg?w=600","url":"https://www.musinsa.com/products/6517881","rating":4.9,"reviews":16,"likes":902,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5698178","slot":"f-dress","color":"navy","colorSource":"name","classification":"name-rules","brand":"무신사 스탠다드 우먼","name":"우먼즈 슬림 플리츠 미니 드레스 [네이비]","price":69900,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20251107/5698178/5698178_17725250642933_big.jpg?w=600","url":"https://www.musinsa.com/products/5698178","rating":4.6,"reviews":15,"likes":6,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6755942","slot":"f-coat","color":"charcoal","colorSource":"name","classification":"name-rules","brand":"무신사 스탠다드 우먼","name":"우먼즈 캐시미어 블렌드 하프 발마칸 코트 [차콜 그레이]","price":199900,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260630/6755942/6755942_17878999905340_big.jpg?w=600","url":"https://www.musinsa.com/products/6755942","rating":4.9,"reviews":8,"likes":847,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5444275","slot":"f-coat","color":"beige","colorSource":"name","classification":"name-rules","brand":"무신사 스탠다드 우먼","name":"우먼즈 캐시미어 블렌드 핸드메이드 하프 발마칸 로브 코트 [토프]","price":199900,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250911/5444275/5444275_17587004740023_big.jpg?w=600","url":"https://www.musinsa.com/products/5444275","rating":5,"reviews":59,"likes":3,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4053810","slot":"f-shirt","color":"green","colorSource":"name","classification":"name-rules","brand":"무신사 스탠다드 우먼","name":"우먼즈 오버사이즈 워시드 포플린 셔츠 [그린]","price":27930,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20240415/4053810/4053810_17510107810094_big.jpg?w=600","url":"https://www.musinsa.com/products/4053810","rating":4.8,"reviews":104,"likes":1,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4672682","slot":"f-shirt","color":"charcoal","colorSource":"name","classification":"name-rules","brand":"무신사 스탠다드 우먼","name":"우먼즈 오버사이즈 워시드 포플린 셔츠 [건메탈]","price":37090,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20241219/4672682/4672682_17524697305464_big.jpg?w=600","url":"https://www.musinsa.com/products/4672682","rating":4.8,"reviews":102,"likes":2,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4061694","slot":"f-shirt","color":"navy","colorSource":"name","classification":"name-rules","brand":"폴로 랄프 로렌","name":"W 숏슬리브 폴로 메시 셔츠 - 네이비","price":239000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20240417/4061694/4061694_17151582663014_big.jpg?w=600","url":"https://www.musinsa.com/products/4061694","rating":5,"reviews":2,"likes":434,"summer":true,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-3097186","slot":"f-shirt","color":"pink","colorSource":"name","classification":"name-rules","brand":"폴로 랄프 로렌","name":"W 클래식핏 옥스포드 셔츠 - 핑크","price":259000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20230221/3097186/3097186_16780729197377_big.jpg?w=600","url":"https://www.musinsa.com/products/3097186","rating":5,"reviews":28,"likes":3,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4061687","slot":"f-shirt","color":"green","colorSource":"name","classification":"name-rules","brand":"폴로 랄프 로렌","name":"W 크롭 테리 럭비 셔츠 - 그린","price":299000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20240417/4061687/4061687_17152994330917_big.jpg?w=600","url":"https://www.musinsa.com/products/4061687","rating":null,"reviews":0,"likes":171,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-3097198","slot":"f-knit","color":"black","colorSource":"name","classification":"name-rules","brand":"폴로 랄프 로렌","name":"W 케이블 니트 코튼 V넥 스웨터 - 블랙","price":279000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20230221/3097198/3097198_16780733645133_big.jpg?w=600","url":"https://www.musinsa.com/products/3097198","rating":4.9,"reviews":133,"likes":2,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-3010401","slot":"f-knit","color":"black","colorSource":"name","classification":"name-rules","brand":"폴로 랄프 로렌","name":"W 코튼 블렌드 숏 슬리브 스웨터 - 블랙","price":239000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20230109/3010401/3010401_16752404649062_big.jpg?w=600","url":"https://www.musinsa.com/products/3010401","rating":4.9,"reviews":112,"likes":1,"summer":true,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4188034","slot":"f-knit","color":"white","colorSource":"name","classification":"correction","brand":"폴로 랄프 로렌","name":"W 스트라이프 케이블 니트 숏 슬리브 코튼 스웨터 - 블루 요트/화이트","price":195300,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20240611/4188034/4188034_17193012543182_big.jpg?w=600","url":"https://www.musinsa.com/products/4188034","rating":4.8,"reviews":14,"likes":638,"summer":true,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-3772665","slot":"f-slacks","color":"grey","colorSource":"name","classification":"name-rules","brand":"리","name":"우먼 스웻 파라슈트 팬츠 라이트 그레이","price":25000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20240103/3772665/3772665_17083964878743_big.jpg?w=600","url":"https://www.musinsa.com/products/3772665","rating":4.9,"reviews":15,"likes":214,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4343715","slot":"f-bag","color":"beige","colorSource":"name","classification":"name-rules","brand":"리","name":"투웨이 퀼팅 호보백 베이지","price":47400,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20240819/4343715/4343715_17241465578672_big.jpg?w=600","url":"https://www.musinsa.com/products/4343715","rating":5,"reviews":7,"likes":334,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4405584","slot":"f-bag","color":"indigo","colorSource":"name","classification":"name-rules","brand":"리","name":"코듀로이 스퀘어 투웨이 토트백 인디고 다크","price":25000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20240904/4405584/4405584_17254409274553_big.jpg?w=600","url":"https://www.musinsa.com/products/4405584","rating":4.8,"reviews":13,"likes":332,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5327454","slot":"f-bag","color":"green","colorSource":"name","classification":"name-rules","brand":"리","name":"미니 올데이 백팩 다크 그린","price":39000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250814/5327454/5327454_17574672749635_big.jpg?w=600","url":"https://www.musinsa.com/products/5327454","rating":5,"reviews":5,"likes":234,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4457909","slot":"f-sweat","color":"grey","colorSource":"name","classification":"name-rules","brand":"리","name":"우먼 플리스 하프 집업 맨투맨 그레이","price":29000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20240924/4457909/4457909_17304281177366_big.jpg?w=600","url":"https://www.musinsa.com/products/4457909","rating":5,"reviews":3,"likes":193,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-3079510","slot":"f-denim","color":"indigo","colorSource":"name","classification":"name-rules","brand":"리","name":"우먼 스트레이트 데님팬츠 인디고 라이트","price":35000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20230213/3079510/3079510_16763559577231_big.jpg?w=600","url":"https://www.musinsa.com/products/3079510","rating":5,"reviews":25,"likes":174,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-3836732","slot":"f-denim","color":"indigo","colorSource":"name","classification":"name-rules","brand":"리","name":"우먼 세미 베기핏 데님 팬츠 인디고 미듐","price":29000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20240131/3836732/3836732_17073579202363_big.jpg?w=600","url":"https://www.musinsa.com/products/3836732","rating":3.9,"reviews":7,"likes":151,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-3836733","slot":"f-denim","color":"indigo","colorSource":"name","classification":"name-rules","brand":"리","name":"우먼 세미 베기핏 데님 팬츠 인디고 라이트","price":29000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20240131/3836733/3836733_17116060836919_big.jpg?w=600","url":"https://www.musinsa.com/products/3836733","rating":null,"reviews":0,"likes":59,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4486599","slot":"f-padding","color":"ivory","colorSource":"name","classification":"name-rules","brand":"리","name":"우먼 니트 숏 다운 아이보리","price":99000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20241004/4486599/4486599_17304277315242_big.jpg?w=600","url":"https://www.musinsa.com/products/4486599","rating":5,"reviews":3,"likes":779,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-3080548","slot":"f-slacks","color":"black","colorSource":"name","classification":"name-rules","brand":"로라로라","name":"SLIM HALF SLACKS BLACK","price":71100,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20230214/3080548/3080548_16771195758187_big.jpg?w=600","url":"https://www.musinsa.com/products/3080548","rating":null,"reviews":0,"likes":109,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-2870538","slot":"f-slacks","color":"yellow","colorSource":"name","classification":"name-rules","brand":"로라로라","name":"CORDUROY COLOR PANTS MUSTARD","price":80100,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20221017/2870538/2870538_17062347638097_big.jpg?w=600","url":"https://www.musinsa.com/products/2870538","rating":null,"reviews":0,"likes":61,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6986880","slot":"f-slacks","color":"navy","colorSource":"name","classification":"name-rules","brand":"로라로라","name":"CURVED CARGO PANTS NAVY","price":125100,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260804/6986880/6986880_17865250542113_big.jpg?w=600","url":"https://www.musinsa.com/products/6986880","rating":null,"reviews":0,"likes":34,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4987285","slot":"f-tee","color":"white","colorSource":"name","classification":"name-rules","brand":"로라로라","name":"MAISON DE ROLA EMBROIDERY LOOSE FIT T-SHIRT WHITE","price":45000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250404/4987285/4987285_17442499616833_big.jpg?w=600","url":"https://www.musinsa.com/products/4987285","rating":4.8,"reviews":39,"likes":884,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6155564","slot":"f-tee","color":"charcoal","colorSource":"name","classification":"name-rules","brand":"로라로라","name":"MAISON DE ROLA EMBROIDERY PIGMENT LOOSE FIT T-SHIRT CHARCOAL","price":55000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260318/6155564/6155564_17744881236180_big.jpg?w=600","url":"https://www.musinsa.com/products/6155564","rating":4.9,"reviews":54,"likes":2,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4313811","slot":"f-skirt","color":"brown","colorSource":"name","classification":"name-rules","brand":"로라로라","name":"FLOWER LONG SKIRT BROWN","price":83700,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20240809/4313811/4313811_17241987856568_big.jpg?w=600","url":"https://www.musinsa.com/products/4313811","rating":4.9,"reviews":7,"likes":201,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-3823564","slot":"f-skirt","color":"white","colorSource":"name","classification":"name-rules","brand":"로라로라","name":"PINTUCK MINI FLARE SKIRT WHITE","price":80100,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20240125/3823564/3823564_17174672578863_big.jpg?w=600","url":"https://www.musinsa.com/products/3823564","rating":4.9,"reviews":25,"likes":0,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4050170","slot":"f-skirt","color":"charcoal","colorSource":"name","classification":"name-rules","brand":"로라로라","name":"LACE MINI SKIRT CHARCOAL","price":38500,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20240412/4050170/4050170_17134023548087_big.jpg?w=600","url":"https://www.musinsa.com/products/4050170","rating":5,"reviews":1,"likes":126,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4313823","slot":"f-dress","color":"brown","colorSource":"name","classification":"name-rules","brand":"로라로라","name":"FLOWER PINTUCK LONG DRESS BROWN","price":161100,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20240809/4313823/4313823_17241986344185_big.jpg?w=600","url":"https://www.musinsa.com/products/4313823","rating":null,"reviews":0,"likes":69,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4313837","slot":"f-sweat","color":"black","colorSource":"name","classification":"name-rules","brand":"로라로라","name":"[장원영 Pick] ROLA BEANIE PUPPY SWEATSHIRT BLACK","price":71100,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20240809/4313837/4313837_17242954719124_big.jpg?w=600","url":"https://www.musinsa.com/products/4313837","rating":4.7,"reviews":22,"likes":0,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4784625","slot":"f-denim","color":"blue","colorSource":"name","classification":"name-rules","brand":"로라로라","name":"NUBASIC CLASSIC FIT DENIM PANTS BLUE","price":80100,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250213/4784625/4784625_17399424478106_big.jpg?w=600","url":"https://www.musinsa.com/products/4784625","rating":5,"reviews":2,"likes":24,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5367452","slot":"f-denim","color":"blue","colorSource":"name","classification":"name-rules","brand":"로라로라","name":"DAMAGE WIDE DENIM PANTS BLUE","price":98100,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250827/5367452/5367452_17566897781909_big.jpg?w=600","url":"https://www.musinsa.com/products/5367452","rating":null,"reviews":0,"likes":87,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6000611","slot":"f-bag","color":"ivory","colorSource":"name","classification":"name-rules","brand":"로라로라","name":"DOT SATIN MINI TOTE BAG IVORY","price":58500,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260210/6000611/6000611_17715486603084_big.jpg?w=600","url":"https://www.musinsa.com/products/6000611","rating":4.7,"reviews":3,"likes":3,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6336150","slot":"f-shirt","color":"blue","colorSource":"name","classification":"name-rules","brand":"로라로라","name":"OFF SHOULDER TIE BLOUSE SKY","price":98000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260420/6336150/6336150_17797720738529_big.jpg?w=600","url":"https://www.musinsa.com/products/6336150","rating":4.9,"reviews":31,"likes":2,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4002401","slot":"f-cardigan","color":"pink","colorSource":"name","classification":"name-rules","brand":"로라로라","name":"VOLUME SLEEVE HALF CARDIGAN PINK","price":51100,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20240328/4002401/4002401_17122089347371_big.jpg?w=600","url":"https://www.musinsa.com/products/4002401","rating":4.4,"reviews":52,"likes":0,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-3610381","slot":"f-coat","color":"beige","colorSource":"name","classification":"name-rules","brand":"로라로라","name":"COLLAR SINGLE COAT BEIGE","price":268200,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20231006/3610381/3610381_16975927753205_big.jpg?w=600","url":"https://www.musinsa.com/products/3610381","rating":4.5,"reviews":4,"likes":55,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6986918","slot":"f-jacket","color":"beige","colorSource":"name","classification":"name-rules","brand":"로라로라","name":"COTTON BLOUSON JUMPER BEIGE","price":224100,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260804/6986918/6986918_17865248930996_big.jpg?w=600","url":"https://www.musinsa.com/products/6986918","rating":null,"reviews":0,"likes":235,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-2745027","slot":"f-skirt","color":"brown","colorSource":"name","classification":"name-rules","brand":"마르디 메크르디","name":"신세틱 레더 아코디언 플리츠 스커트 브라운","price":109000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20220826/2745027/2745027_1_big.jpg?w=600","url":"https://www.musinsa.com/products/2745027","rating":5,"reviews":9,"likes":327,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-2399162","slot":"f-skirt","color":"black","colorSource":"name","classification":"name-rules","brand":"마르디 메크르디","name":"레이스 플리츠 스커트 블랙","price":151200,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20220304/2399162/2399162_1_big.jpg?w=600","url":"https://www.musinsa.com/products/2399162","rating":4,"reviews":2,"likes":129,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-2103304","slot":"f-bag","color":"white","colorSource":"name","classification":"name-rules","brand":"마르디 메크르디","name":"토트백 화이트","price":258000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20210901/2103304/2103304_2_big.jpg?w=600","url":"https://www.musinsa.com/products/2103304","rating":null,"reviews":0,"likes":419,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6473243","slot":"f-tee","color":"blue","colorSource":"name","classification":"name-rules","brand":"시엔느","name":"Paloma Pique T-shirt (Blue)","price":85000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260513/6473243/6473243_17786736056959_big.jpg?w=600","url":"https://www.musinsa.com/products/6473243","rating":5,"reviews":6,"likes":26,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6117680","slot":"f-sweat","color":"brown","colorSource":"name","classification":"name-rules","brand":"시엔느","name":"Organic Sweatshirt (Brown)","price":101200,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260311/6117680/6117680_17732174781580_big.jpg?w=600","url":"https://www.musinsa.com/products/6117680","rating":null,"reviews":0,"likes":18,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6036542","slot":"f-denim","color":"blue","colorSource":"name","classification":"name-rules","brand":"시엔느","name":"Legacy Denim Pants (Middle Blue)","price":139040,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260220/6036542/6036542_17715694602922_big.jpg?w=600","url":"https://www.musinsa.com/products/6036542","rating":null,"reviews":0,"likes":23,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4187977","slot":"f-bag","color":"ivory","colorSource":"name","classification":"name-rules","brand":"시엔느","name":"Gypsy Rose Big Bag (Cream)","price":188000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20240611/4187977/4187977_17180686011439_big.jpg?w=600","url":"https://www.musinsa.com/products/4187977","rating":4.7,"reviews":3,"likes":265,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-3587737","slot":"f-slacks","color":"brown","colorSource":"name","classification":"name-rules","brand":"시엔느","name":"Ben Slacks (Brown)","price":83700,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20230922/3587737/3587737_16953653344448_big.jpg?w=600","url":"https://www.musinsa.com/products/3587737","rating":4.5,"reviews":2,"likes":55,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5135363","slot":"f-slacks","color":"ivory","colorSource":"name","classification":"name-rules","brand":"시엔느","name":"City Pleated Pants (Ivory)","price":148000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250521/5135363/5135363_17478130045004_big.jpg?w=600","url":"https://www.musinsa.com/products/5135363","rating":null,"reviews":0,"likes":13,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4571444","slot":"f-shirt","color":"ivory","colorSource":"name","classification":"name-rules","brand":"시엔느","name":"Jane Cotton Shirt (Cream)","price":79360,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20241029/4571444/4571444_17302125152492_big.jpg?w=600","url":"https://www.musinsa.com/products/4571444","rating":null,"reviews":0,"likes":39,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5078110","slot":"f-shirt","color":"yellow","colorSource":"name","classification":"name-rules","brand":"시엔느","name":"Fia Terry Shirt (Yellow)","price":89000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250429/5078110/5078110_17459122624088_big.jpg?w=600","url":"https://www.musinsa.com/products/5078110","rating":null,"reviews":0,"likes":19,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7161888","slot":"f-cardigan","color":"purple","colorSource":"name","classification":"name-rules","brand":"시엔느","name":"Helene Wool Cardigan (Purple)","price":140620,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260825/7161888/7161888_17876587319061_big.jpg?w=600","url":"https://www.musinsa.com/products/7161888","rating":null,"reviews":0,"likes":19,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6307945","slot":"f-slacks","color":"black","colorSource":"image","classification":"name-rules","brand":"루에브르","name":"Wide Two-Tuck Pants","price":159000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260414/6307945/6307945_17761495143023_big.jpg?w=600","url":"https://www.musinsa.com/products/6307945","rating":4,"reviews":1,"likes":98,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-3549816","slot":"f-slacks","color":"grey","colorSource":"image","classification":"name-rules","brand":"루에브르","name":"Bio Cotton Wide Cargo Pants","price":159000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20230911/3549816/3549816_16944156428071_big.jpg?w=600","url":"https://www.musinsa.com/products/3549816","rating":null,"reviews":0,"likes":42,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7264825","slot":"f-slacks","color":"grey","colorSource":"image","classification":"name-rules","brand":"루에브르","name":"Slim Fit Capri Pants (Fall ver.)","price":129000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260907/7264825/7264825_17887648660045_big.jpg?w=600","url":"https://www.musinsa.com/products/7264825","rating":null,"reviews":0,"likes":11,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-3550096","slot":"f-shirt","color":"grey","colorSource":"image","classification":"name-rules","brand":"루에브르","name":"Tie Puff Sleeve Blouse","price":159000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20230911/3550096/3550096_16944190174312_big.jpg?w=600","url":"https://www.musinsa.com/products/3550096","rating":4.8,"reviews":73,"likes":1,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5052242","slot":"f-tee","color":"black","colorSource":"image","classification":"name-rules","brand":"루에브르","name":"Asymmetric Hem Short Sleeved T-Shirt","price":89000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250422/5052242/5052242_17453044374425_big.jpg?w=600","url":"https://www.musinsa.com/products/5052242","rating":5,"reviews":7,"likes":248,"summer":true,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-1530605","slot":"f-tee","color":"ivory","colorSource":"image","classification":"name-rules","brand":"루에브르","name":"Basic symbol T-shirt","price":49000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20200729/1530605/1530605_16824864407422_big.jpg?w=600","url":"https://www.musinsa.com/products/1530605","rating":4.7,"reviews":7,"likes":82,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4523567","slot":"f-skirt","color":"black","colorSource":"image","classification":"name-rules","brand":"루에브르","name":"A-line Wool Mini Skirt","price":139000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20241016/4523567/4523567_17290572085194_big.jpg?w=600","url":"https://www.musinsa.com/products/4523567","rating":4.7,"reviews":13,"likes":381,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6308131","slot":"f-skirt","color":"black","colorSource":"image","classification":"name-rules","brand":"루에브르","name":"H-Line Maxi Jersey Skirt","price":89000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260414/6308131/6308131_17833070469675_big.jpg?w=600","url":"https://www.musinsa.com/products/6308131","rating":5,"reviews":3,"likes":169,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6308126","slot":"f-skirt","color":"grey","colorSource":"image","classification":"name-rules","brand":"루에브르","name":"Panel Volume Flare Skirt","price":219000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260414/6308126/6308126_17761504048531_big.jpg?w=600","url":"https://www.musinsa.com/products/6308126","rating":5,"reviews":1,"likes":101,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5162348","slot":"f-dress","color":"ivory","colorSource":"image","classification":"name-rules","brand":"루에브르","name":"Flower Pattern Bustier Layered Maxi Dress","price":189000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250602/5162348/5162348_17515206431901_big.jpg?w=600","url":"https://www.musinsa.com/products/5162348","rating":5,"reviews":1,"likes":173,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6308223","slot":"f-dress","color":"grey","colorSource":"image","classification":"name-rules","brand":"루에브르","name":"String Point H-Line Long Dress","price":179000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260414/6308223/6308223_17761508895835_big.jpg?w=600","url":"https://www.musinsa.com/products/6308223","rating":5,"reviews":1,"likes":21,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4799488","slot":"f-denim","color":"ivory","colorSource":"image","classification":"name-rules","brand":"루에브르","name":"Semi-wide Denim Pants","price":149000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250218/4799488/4799488_17398590327781_big.jpg?w=600","url":"https://www.musinsa.com/products/4799488","rating":null,"reviews":0,"likes":77,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6518366","slot":"f-denim","color":"blue","colorSource":"image","classification":"name-rules","brand":"루에브르","name":"Flared Denim Pants","price":139000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260520/6518366/6518366_17792632889125_big.jpg?w=600","url":"https://www.musinsa.com/products/6518366","rating":null,"reviews":0,"likes":39,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4799855","slot":"f-cardigan","color":"pink","colorSource":"image","classification":"name-rules","brand":"루에브르","name":"Wool Blended Button Cardigan","price":139000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250218/4799855/4799855_17398621528152_big.jpg?w=600","url":"https://www.musinsa.com/products/4799855","rating":null,"reviews":0,"likes":60,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5481158","slot":"f-cardigan","color":"olive","colorSource":"image","classification":"name-rules","brand":"루에브르","name":"Asymmetric Front Knit Cardigan","price":179000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250917/5481158/5481158_17580997491172_big.jpg?w=600","url":"https://www.musinsa.com/products/5481158","rating":null,"reviews":0,"likes":33,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7288606","slot":"f-denim","color":"grey","colorSource":"image","classification":"name-rules","brand":"레이브","name":"Tin Washing Semi Bootcut Denim","price":158000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260909/7288606/7288606_17889386126091_big.jpg?w=600","url":"https://www.musinsa.com/products/7288606","rating":null,"reviews":0,"likes":25,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6042558","slot":"f-denim","color":"indigo","colorSource":"image","classification":"name-rules","brand":"레이브","name":"Lesick Curved Denim Pants","price":138000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260223/6042558/6042558_17718303553786_big.jpg?w=600","url":"https://www.musinsa.com/products/6042558","rating":null,"reviews":0,"likes":19,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5394457","slot":"f-skirt","color":"black","colorSource":"image","classification":"name-rules","brand":"레이브","name":"Flap-Pocket Mini Skirt","price":128000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250903/5394457/5394457_17568616565131_big.jpg?w=600","url":"https://www.musinsa.com/products/5394457","rating":5,"reviews":3,"likes":173,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5504528","slot":"f-skirt","color":"indigo","colorSource":"image","classification":"name-rules","brand":"레이브","name":"Check Tutu Skirt","price":58000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250922/5504528/5504528_17585202366965_big.jpg?w=600","url":"https://www.musinsa.com/products/5504528","rating":null,"reviews":0,"likes":51,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6401826","slot":"f-tee","color":"navy","colorSource":"image","classification":"name-rules","brand":"커스텀어클락","name":"[캡내장] 컴포트 U넥 하프 티셔츠","price":33600,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260429/6401826/6401826_17830396081595_big.jpg?w=600","url":"https://www.musinsa.com/products/6401826","rating":4.4,"reviews":47,"likes":1,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6401859","slot":"f-cardigan","color":"grey","colorSource":"image","classification":"name-rules","brand":"커스텀어클락","name":"린넨 시스루 골지 슬림 라운드 가디건","price":49600,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260429/6401859/6401859_17784604946412_big.jpg?w=600","url":"https://www.musinsa.com/products/6401859","rating":4.9,"reviews":22,"likes":755,"summer":true,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5366282","slot":"f-skirt","color":"charcoal","colorSource":"name","classification":"name-rules","brand":"커스텀어클락","name":"포멀 플리츠 미디 스커트 차콜","price":55200,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250826/5366282/5366282_17847753489001_big.jpg?w=600","url":"https://www.musinsa.com/products/5366282","rating":4.7,"reviews":15,"likes":1,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7226773","slot":"f-skirt","color":"black","colorSource":"image","classification":"name-rules","brand":"커스텀어클락","name":"포멀 슬릿 H라인 맥시 스커트 신세틱 레더","price":49600,"img":"https://image.msscdn.net/thumbnails/images/prd_img/20260902/7226773/detail_7226773_17897244071389_big.jpg?w=600","url":"https://www.musinsa.com/products/7226773","rating":null,"reviews":0,"likes":34,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6227011","slot":"f-knit","color":"grey","colorSource":"image","classification":"name-rules","brand":"커스텀어클락","name":"[ITALY] 베이직 라운드 PK 하프 니트","price":49600,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260331/6227011/6227011_17751134099211_big.jpg?w=600","url":"https://www.musinsa.com/products/6227011","rating":4.8,"reviews":17,"likes":573,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6401850","slot":"f-knit","color":"olive","colorSource":"image","classification":"name-rules","brand":"커스텀어클락","name":"린넨 시스루 라운드 니트","price":44800,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260429/6401850/6401850_17847743282500_big.jpg?w=600","url":"https://www.musinsa.com/products/6401850","rating":4.3,"reviews":8,"likes":833,"summer":true,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5401976","slot":"f-knit","color":"black","colorSource":"image","classification":"name-rules","brand":"커스텀어클락","name":"슬림 터틀넥 골지 니트","price":39200,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250904/5401976/5401976_17872974564512_big.jpg?w=600","url":"https://www.musinsa.com/products/5401976","rating":4.6,"reviews":37,"likes":1,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7226983","slot":"f-coat","color":"brown","colorSource":"name","classification":"name-rules","brand":"커스텀어클락","name":"벨티드 발마칸 롱 코트 브라운","price":159200,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260902/7226983/7226983_17897235692021_big.jpg?w=600","url":"https://www.musinsa.com/products/7226983","rating":5,"reviews":1,"likes":135,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6226809","slot":"f-shirt","color":"purple","colorSource":"image","classification":"name-rules","brand":"커스텀어클락","name":"프릴 브이넥 시스루 블라우스","price":49600,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260331/6226809/6226809_17828685370960_big.jpg?w=600","url":"https://www.musinsa.com/products/6226809","rating":4.6,"reviews":49,"likes":4,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5946669","slot":"f-slacks","color":"black","colorSource":"image","classification":"name-rules","brand":"커스텀어클락","name":"포멀 카프리 팬츠","price":49600,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260128/5946669/5946669_17875448343319_big.jpg?w=600","url":"https://www.musinsa.com/products/5946669","rating":4.7,"reviews":43,"likes":921,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5562598","slot":"f-coat","color":"brown","colorSource":"name","classification":"name-rules","brand":"인사일런스 우먼","name":"소프트 하프 발마칸 코트 BROWN","price":299250,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20251001/5562598/5562598_17593813243887_big.jpg?w=600","url":"https://www.musinsa.com/products/5562598","rating":5,"reviews":3,"likes":537,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7094695","slot":"f-tee","color":"grey","colorSource":"name","classification":"name-rules","brand":"인사일런스 우먼","name":"드레이핑 보트넥 롱슬리브 MELANGE GREY","price":79800,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260818/7094695/7094695_17872987169611_big.jpg?w=600","url":"https://www.musinsa.com/products/7094695","rating":null,"reviews":0,"likes":171,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-3942687","slot":"f-bag","color":"beige","colorSource":"name","classification":"name-rules","brand":"인사일런스 우먼","name":"빅 토트 백 BEIGE","price":104300,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20240312/3942687/3942687_17240340655072_big.jpg?w=600","url":"https://www.musinsa.com/products/3942687","rating":5,"reviews":7,"likes":164,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5391855","slot":"f-skirt","color":"charcoal","colorSource":"name","classification":"name-rules","brand":"인사일런스 우먼","name":"로우 디테일 울 스커트 CHARCOAL","price":117600,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250902/5391855/5391855_17611064288826_big.jpg?w=600","url":"https://www.musinsa.com/products/5391855","rating":null,"reviews":0,"likes":94,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6333979","slot":"f-dress","color":"beige","colorSource":"name","classification":"name-rules","brand":"인사일런스 우먼","name":"체크 미니 원피스 BEIGE","price":148500,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260417/6333979/6333979_17773589221670_big.jpg?w=600","url":"https://www.musinsa.com/products/6333979","rating":4,"reviews":1,"likes":0,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-3901968","slot":"f-denim","color":"black","colorSource":"correction","classification":"name-rules","brand":"인사일런스 우먼","name":"라이트 오버사이즈 데님 BLACK","price":102200,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20240226/3901968/3901968_17090280036820_big.jpg?w=600","url":"https://www.musinsa.com/products/3901968","rating":4.5,"reviews":2,"likes":123,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5378047","slot":"f-boots","color":"grey","colorSource":"name","classification":"name-rules","brand":"닥터마틴","name":"레이븐 폴더블 버클 부츠 그레이","price":128700,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250829/5378047/5378047_17566240193392_big.jpg?w=600","url":"https://www.musinsa.com/products/5378047","rating":4.8,"reviews":475,"likes":2,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5378044","slot":"f-boots","color":"black","colorSource":"name","classification":"name-rules","brand":"닥터마틴","name":"레이븐 폴더블 버클 부츠 블랙","price":128700,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250829/5378044/5378044_17566239080274_big.jpg?w=600","url":"https://www.musinsa.com/products/5378044","rating":4.9,"reviews":409,"likes":2,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7010712","slot":"f-boots","color":"black","colorSource":"name","classification":"name-rules","brand":"닥터마틴","name":"베린 멀티 버클 롱 부츠 블랙","price":168300,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260806/7010712/7010712_17864362905967_big.jpg?w=600","url":"https://www.musinsa.com/products/7010712","rating":5,"reviews":9,"likes":930,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6625383","slot":"f-sneaker","color":"red","colorSource":"name","classification":"name-rules","brand":"컨버스","name":"척 70 X 에나멜 레드","price":105000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260608/6625383/6625383_17823711387402_big.jpg?w=600","url":"https://www.musinsa.com/products/6625383","rating":4.9,"reviews":29,"likes":591,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6625466","slot":"f-sneaker","color":"charcoal","colorSource":"image","classification":"name-rules","brand":"컨버스","name":"척 70 X 보그 다운","price":105000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260608/6625466/6625466_17827824242136_big.jpg?w=600","url":"https://www.musinsa.com/products/6625466","rating":5,"reviews":11,"likes":524,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6409922","slot":"f-slacks","color":"navy","colorSource":"name","classification":"name-rules","brand":"뉴발란스","name":"WOMEN FROZEN 에어 스트레치 오버 와이드팬츠 (NAVY)","price":109000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260430/6409922/6409922_17775318859173_big.jpg?w=600","url":"https://www.musinsa.com/products/6409922","rating":5,"reviews":2,"likes":92,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6304226","slot":"f-slacks","color":"blue","colorSource":"name","classification":"name-rules","brand":"뉴발란스","name":"WOMEN 핏티드 폴디드 플레어 팬츠 (DYEING BLUE)","price":79900,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260414/6304226/6304226_17761444393945_big.jpg?w=600","url":"https://www.musinsa.com/products/6304226","rating":5,"reviews":1,"likes":77,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7043647","slot":"f-slacks","color":"brown","colorSource":"name","classification":"name-rules","brand":"뉴발란스","name":"WOMEN 에센셜 웜업 우븐 와이드팬츠 (BROWN)","price":109000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260811/7043647/7043647_17864128927278_big.jpg?w=600","url":"https://www.musinsa.com/products/7043647","rating":5,"reviews":2,"likes":42,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6925853","slot":"f-sweat","color":"brown","colorSource":"name","classification":"name-rules","brand":"뉴발란스","name":"WOMEN AIRY 와플 후드집업 (BROWN)","price":109000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260727/6925853/6925853_17851159506119_big.jpg?w=600","url":"https://www.musinsa.com/products/6925853","rating":5,"reviews":6,"likes":354,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7263018","slot":"f-sweat","color":"charcoal","colorSource":"name","classification":"name-rules","brand":"뉴발란스","name":"WOMEN 에센셜 다잉 후드집업 (D/CHARCOAL)","price":109000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260907/7263018/7263018_17887589972406_big.jpg?w=600","url":"https://www.musinsa.com/products/7263018","rating":5,"reviews":1,"likes":161,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5988932","slot":"f-sweat","color":"black","colorSource":"name","classification":"name-rules","brand":"뉴발란스","name":"WOMEN 경량 이중직 후드집업 (BLACK)","price":99900,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260206/5988932/5988932_17703409722673_big.jpg?w=600","url":"https://www.musinsa.com/products/5988932","rating":5,"reviews":2,"likes":94,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7210730","slot":"f-denim","color":"blue","colorSource":"name","classification":"name-rules","brand":"뉴발란스","name":"WOMEN 데님 커브드 오버와이드 팬츠 (L/BLUE)","price":129000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260901/7210730/7210730_17882481284113_big.jpg?w=600","url":"https://www.musinsa.com/products/7210730","rating":null,"reviews":0,"likes":11,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6064416","slot":"f-tee","color":"black","colorSource":"name","classification":"name-rules","brand":"뉴발란스","name":"WOMEN 에센셜 베이직 반팔티 (BLACK)","price":39900,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260227/6064416/6064416_17721638070226_big.jpg?w=600","url":"https://www.musinsa.com/products/6064416","rating":4.8,"reviews":6,"likes":153,"summer":true,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6382248","slot":"f-dress","color":"white","colorSource":"name","classification":"name-rules","brand":"뉴발란스","name":"WOMEN FROZEN 우븐 스트레치 카라형 원피스 (WHITE)","price":129000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260427/6382248/6382248_17772703378768_big.jpg?w=600","url":"https://www.musinsa.com/products/6382248","rating":4.4,"reviews":5,"likes":0,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5634387","slot":"f-skirt","color":"black","colorSource":"name","classification":"name-rules","brand":"노스페이스","name":"여성 코브 V 스커트 BLACK","price":89000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20251023/5634387/5634387_17828899061645_big.jpg?w=600","url":"https://www.musinsa.com/products/5634387","rating":4.6,"reviews":5,"likes":110,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5683426","slot":"f-padding","color":"black","colorSource":"name","classification":"name-rules","brand":"노스페이스","name":"여성 다이아몬드 다운 자켓 (RDS) BLACK","price":220800,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20251104/5683426/5683426_17828093710696_big.jpg?w=600","url":"https://www.musinsa.com/products/5683426","rating":4.3,"reviews":14,"likes":492,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4745009","slot":"f-padding","color":"black","colorSource":"name","classification":"name-rules","brand":"노스페이스","name":"화이트라벨 여성 노벨티 눕시 다운 A-FIT (RDS) BLACK","price":349000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250124/4745009/4745009_17828674672869_big.jpg?w=600","url":"https://www.musinsa.com/products/4745009","rating":5,"reviews":6,"likes":225,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5683402","slot":"f-padding","color":"ivory","colorSource":"name","classification":"name-rules","brand":"노스페이스","name":"여성 다이아몬드 다운 자켓 (RDS) CREAM","price":220800,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20251104/5683402/5683402_17828094864568_big.jpg?w=600","url":"https://www.musinsa.com/products/5683402","rating":5,"reviews":1,"likes":207,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5693544","slot":"f-slacks","color":"purple","colorSource":"name","classification":"name-rules","brand":"노스페이스","name":"여성 누베 와이드팬츠 DEEP PURPLE","price":69000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20251106/5693544/5693544_17828061757991_big.jpg?w=600","url":"https://www.musinsa.com/products/5693544","rating":null,"reviews":0,"likes":70,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5871904","slot":"m-denim","color":"indigo","colorSource":"correction","classification":"name-rules","brand":"리바이스","name":"501® 릴랙스 진 0057V-0007","price":99000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260106/5871904/5871904_17676807048224_big.jpg?w=600","url":"https://www.musinsa.com/products/5871904","rating":4.9,"reviews":46,"likes":365,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5871916","slot":"m-denim","color":"indigo","colorSource":"correction","classification":"name-rules","brand":"리바이스","name":"501® 오리지널 진","price":159000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260106/5871916/5871916_17676808150047_big.jpg?w=600","url":"https://www.musinsa.com/products/5871916","rating":4.8,"reviews":25,"likes":460,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5871906","slot":"m-denim","color":"indigo","colorSource":"correction","classification":"name-rules","brand":"리바이스","name":"501® 릴랙스 진 0057V-0005","price":99000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260106/5871906/5871906_17676807597630_big.jpg?w=600","url":"https://www.musinsa.com/products/5871906","rating":4.9,"reviews":10,"likes":382,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-3188934","slot":"m-denim-raw","color":"indigo","colorSource":"name","classification":"name-rules","brand":"리바이스","name":"LVC 1947 501® 진 RIGID","price":349000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20230329/3188934/3188934_16998483455293_big.jpg?w=600","url":"https://www.musinsa.com/products/3188934","rating":5,"reviews":81,"likes":1,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-3132175","slot":"m-denim-raw","color":"indigo","colorSource":"name","classification":"name-rules","brand":"리바이스","name":"LVC 1954 501® 진 RIGID","price":349000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20230308/3132175/3132175_17630000720583_big.jpg?w=600","url":"https://www.musinsa.com/products/3132175","rating":4.9,"reviews":24,"likes":424,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7427721","slot":"m-denim-raw","color":"indigo","colorSource":"correction","classification":"name-rules","brand":"리바이스","name":"505™ 레귤러 셀비지 진","price":249000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260930/7427721/7427721_17907513058543_big.jpg?w=600","url":"https://www.musinsa.com/products/7427721","rating":null,"reviews":0,"likes":42,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4896105","slot":"m-chambray","color":"blue","colorSource":"image","classification":"name-rules","brand":"리바이스","name":"BLUETAB™ 워크 셔츠 001LH-0000","price":219000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250313/4896105/4896105_17418564859448_big.jpg?w=600","url":"https://www.musinsa.com/products/4896105","rating":5,"reviews":3,"likes":198,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4795202","slot":"m-trucker","color":"black","colorSource":"image","classification":"name-rules","brand":"리바이스","name":"타입 II 트러커 자켓","price":144000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250217/4795202/4795202_17397769060801_big.jpg?w=600","url":"https://www.musinsa.com/products/4795202","rating":4.9,"reviews":271,"likes":2,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7325364","slot":"m-trucker","color":"black","colorSource":"image","classification":"name-rules","brand":"리바이스","name":"타입 II 셀비지 트러커 재킷","price":219000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260914/7325364/7325364_17893759707759_big.jpg?w=600","url":"https://www.musinsa.com/products/7325364","rating":null,"reviews":0,"likes":70,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6435851","slot":"m-trucker","color":"indigo","colorSource":"name","classification":"name-rules","brand":"오어슬로우","name":"TYPE1 PLEATED FRONT DENIM BLOUSE - ONE WASH","price":522000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260507/6435851/6435851_17781393536336_big.jpg?w=600","url":"https://www.musinsa.com/products/6435851","rating":null,"reviews":0,"likes":29,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6436024","slot":"m-trucker","color":"indigo","colorSource":"image","classification":"name-rules","brand":"오어슬로우","name":"TYPE1 PLEATED FRONT DENIM BLOUSE - 2 YEAR WASH","price":609000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260507/6436024/6436024_17781397298383_big.jpg?w=600","url":"https://www.musinsa.com/products/6436024","rating":null,"reviews":0,"likes":18,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6432117","slot":"m-trucker","color":"indigo","colorSource":"name","classification":"name-rules","brand":"오어슬로우","name":"타입2 데님 재킷 - 원 워시","price":819000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260507/6432117/6432117_17791527095003_big.jpg?w=600","url":"https://www.musinsa.com/products/6432117","rating":null,"reviews":0,"likes":0,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6435734","slot":"m-denim-raw","color":"indigo","colorSource":"name","classification":"name-rules","brand":"오어슬로우","name":"105 STANDARD SELVEDGE DENIM - ONE WASH","price":425000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260507/6435734/6435734_17781386414591_big.jpg?w=600","url":"https://www.musinsa.com/products/6435734","rating":null,"reviews":0,"likes":27,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6172972","slot":"m-denim-raw","color":"indigo","colorSource":"name","classification":"name-rules","brand":"오어슬로우","name":"슈퍼 대드 데님 팬츠 - 원 워시","price":360000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260323/6172972/6172972_17751931128246_big.jpg?w=600","url":"https://www.musinsa.com/products/6172972","rating":null,"reviews":0,"likes":0,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6432116","slot":"m-denim","color":"indigo","colorSource":"name","classification":"name-rules","brand":"오어슬로우","name":"슈퍼 대드 데님 팬츠 - 유즈드 데님","price":525000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260507/6432116/6432116_17791526425335_big.jpg?w=600","url":"https://www.musinsa.com/products/6432116","rating":5,"reviews":1,"likes":23,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5655601","slot":"m-denim","color":"blue","colorSource":"name","classification":"name-rules","brand":"오어슬로우","name":"90S STANDARD DENIM 105 - SKY BLUE","price":406000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20251028/5655601/5655601_17616430810417_big.jpg?w=600","url":"https://www.musinsa.com/products/5655601","rating":null,"reviews":0,"likes":77,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6432113","slot":"m-denim","color":"black","colorSource":"correction","classification":"name-rules","brand":"오어슬로우","name":"슈퍼 대드 데님 팬츠 - 스톤 워시 블랙","price":525000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260507/6432113/6432113_17791524075778_big.jpg?w=600","url":"https://www.musinsa.com/products/6432113","rating":null,"reviews":0,"likes":13,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5374160","slot":"m-work-pants","color":"green","colorSource":"name","classification":"name-rules","brand":"오어슬로우","name":"US ARMY FATIGUE PANTS (REGULAR FIT) - GREEN","price":329000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250828/5374160/5374160_17563615626923_big.jpg?w=600","url":"https://www.musinsa.com/products/5374160","rating":4.9,"reviews":12,"likes":668,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5735985","slot":"m-work-pants","color":"brown","colorSource":"name","classification":"name-rules","brand":"오어슬로우","name":"DADS FIT PAINTER PANTS - BROWN","price":406000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20251114/5735985/5735985_17631001311289_big.jpg?w=600","url":"https://www.musinsa.com/products/5735985","rating":null,"reviews":0,"likes":29,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5345377","slot":"m-chambray","color":"blue","colorSource":"name","classification":"name-rules","brand":"오어슬로우","name":"CHAMBRAY WORK SHIRT - BLUE","price":357000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250820/5345377/5345377_17556828957757_big.png?w=600","url":"https://www.musinsa.com/products/5345377","rating":5,"reviews":5,"likes":473,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7192584","slot":"m-chambray","color":"blue","colorSource":"image","classification":"name-rules","brand":"오어슬로우","name":"RELAX FIT CHAMBRAY WORK SHIRT (CHAMBRAY BLEACHED 99)","price":333000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260828/7192584/7192584_17883358509984_big.jpg?w=600","url":"https://www.musinsa.com/products/7192584","rating":5,"reviews":1,"likes":12,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6172971","slot":"m-chambray","color":"indigo","colorSource":"image","classification":"name-rules","brand":"오어슬로우","name":"릴랙스 핏 워크 셔츠 - 샴브레이","price":357000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260323/6172971/6172971_17751930406441_big.jpg?w=600","url":"https://www.musinsa.com/products/6172971","rating":null,"reviews":0,"likes":33,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7147505","slot":"m-chore","color":"olive","colorSource":"name","classification":"name-rules","brand":"오어슬로우","name":"UTILITY SHORT SLEEVE SHIRT JACKET (ARMY GREEN 76)","price":370000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260824/7147505/7147505_17883367956140_big.jpg?w=600","url":"https://www.musinsa.com/products/7147505","rating":null,"reviews":0,"likes":4,"summer":true,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-3043297","slot":"m-oxford","color":"pink","colorSource":"name","classification":"name-rules","brand":"포터리","name":"Comfort Shirt 01 (Light Pink)","price":189000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20230127/3043297/3043297_16750472322984_big.jpg?w=600","url":"https://www.musinsa.com/products/3043297","rating":4.9,"reviews":68,"likes":448,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6324254","slot":"m-oxford","color":"charcoal","colorSource":"image","classification":"name-rules","brand":"포터리","name":"Short Sleeve Comfort Shirt","price":159000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260416/6324254/6324254_17763241124172_big.jpg?w=600","url":"https://www.musinsa.com/products/6324254","rating":5,"reviews":3,"likes":124,"summer":true,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5837525","slot":"m-oxford","color":"beige","colorSource":"image","classification":"name-rules","brand":"포터리","name":"Regular Shirt","price":189000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20251217/5837525/5837525_17663971983968_big.jpg?w=600","url":"https://www.musinsa.com/products/5837525","rating":4,"reviews":4,"likes":68,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-3782418","slot":"m-chambray","color":"blue","colorSource":"name","classification":"name-rules","brand":"포터리","name":"Light Denim Shirt - Light Blue","price":219000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20240109/3782418/3782418_17047657225547_big.jpg?w=600","url":"https://www.musinsa.com/products/3782418","rating":null,"reviews":0,"likes":25,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7402249","slot":"m-sweat","color":"black","colorSource":"image","classification":"name-rules","brand":"포터리","name":"Relaxed Half Zip-up Sweat Shirt","price":329000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260927/7402249/7402249_17913528097177_big.jpg?w=600","url":"https://www.musinsa.com/products/7402249","rating":null,"reviews":0,"likes":1,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7402248","slot":"m-sweat","color":"navy","colorSource":"image","classification":"name-rules","brand":"포터리","name":"Relaxed Sweat Shirt","price":298000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260927/7402248/7402248_17913529364414_big.jpg?w=600","url":"https://www.musinsa.com/products/7402248","rating":null,"reviews":0,"likes":0,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-3222390","slot":"m-rugby","color":"grey","colorSource":"name","classification":"name-rules","brand":"포터리","name":"Short Sleeve Rugby Polo Knit (Light Gray)","price":89500,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20230411/3222390/3222390_16814668420278_big.jpg?w=600","url":"https://www.musinsa.com/products/3222390","rating":5,"reviews":2,"likes":128,"summer":true,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5249775","slot":"m-rugby","color":"black","colorSource":"image","classification":"name-rules","brand":"포터리","name":"Short Sleeve Rugby Polo Knit","price":179000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250716/5249775/5249775_17527295646998_big.jpg?w=600","url":"https://www.musinsa.com/products/5249775","rating":5,"reviews":1,"likes":50,"summer":true,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5249781","slot":"m-rugby","color":"olive","colorSource":"image","classification":"name-rules","brand":"포터리","name":"Short Sleeve Rugby T-Shirt","price":98000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250716/5249781/5249781_17527290918835_big.jpg?w=600","url":"https://www.musinsa.com/products/5249781","rating":4.5,"reviews":4,"likes":33,"summer":true,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7133628","slot":"m-harrington","color":"navy","colorSource":"image","classification":"name-rules","brand":"포터리","name":"Cotton High Neck Blouson","price":389000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260821/7133628/7133628_17880173482005_big.jpg?w=600","url":"https://www.musinsa.com/products/7133628","rating":5,"reviews":1,"likes":101,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-3812374","slot":"m-harrington","color":"charcoal","colorSource":"name","classification":"name-rules","brand":"포터리","name":"Travel Jacket - Charcoal","price":349000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20240122/3812374/3812374_17059026882256_big.jpg?w=600","url":"https://www.musinsa.com/products/3812374","rating":5,"reviews":1,"likes":51,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-3507995","slot":"m-harrington","color":"navy","colorSource":"name","classification":"name-rules","brand":"포터리","name":"Nylon Blouson - Dark Navy","price":289000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20230829/3507995/3507995_16932718822406_big.jpg?w=600","url":"https://www.musinsa.com/products/3507995","rating":null,"reviews":0,"likes":61,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-3561801","slot":"m-blazer","color":"grey","colorSource":"name","classification":"name-rules","brand":"포터리","name":"Fine Wool Sports Jacket - Mid Gray","price":389000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20230914/3561801/3561801_16946777235790_big.jpg?w=600","url":"https://www.musinsa.com/products/3561801","rating":4.8,"reviews":12,"likes":326,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-3541956","slot":"m-trucker","color":"blue","colorSource":"name","classification":"name-rules","brand":"포터리","name":"Denim Work Jacket - Light Blue","price":329000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20230907/3541956/3541956_16940761405552_big.jpg?w=600","url":"https://www.musinsa.com/products/3541956","rating":null,"reviews":0,"likes":13,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6355541","slot":"m-stripe-shirt","color":"pink","colorSource":"name","classification":"name-rules","brand":"브룩스 브라더스","name":"논아이론 옥스포드 스트라이프 셔츠 (핑크)","price":143200,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260422/6355541/6355541_17827951377801_big.jpg?w=600","url":"https://www.musinsa.com/products/6355541","rating":5,"reviews":1,"likes":18,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6039934","slot":"m-stripe-shirt","color":"blue","colorSource":"name","classification":"name-rules","brand":"브룩스 브라더스","name":"논아이론 옥스포드 스트라이프 반팔 셔츠 (블루)","price":134100,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260223/6039934/6039934_17827980735313_big.jpg?w=600","url":"https://www.musinsa.com/products/6039934","rating":5,"reviews":1,"likes":7,"summer":true,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5722285","slot":"m-stripe-shirt","color":"blue","colorSource":"name","classification":"name-rules","brand":"브룩스 브라더스","name":"프라이데이 옥스포드 캔디 스트라이프 셔츠 (블루)","price":161100,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20251112/5722285/5722285_17830520190779_big.jpg?w=600","url":"https://www.musinsa.com/products/5722285","rating":null,"reviews":0,"likes":20,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4817376","slot":"m-oxford","color":"yellow","colorSource":"name","classification":"name-rules","brand":"브룩스 브라더스","name":"프라이데이 옥스포드 셔츠 (옐로우)","price":161100,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250221/4817376/4817376_17840897744609_big.jpg?w=600","url":"https://www.musinsa.com/products/4817376","rating":5,"reviews":1,"likes":27,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4360966","slot":"m-oxford","color":"pink","colorSource":"name","classification":"name-rules","brand":"브룩스 브라더스","name":"프라이데이 옥스포드 셔츠 (핑크)","price":152100,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20240822/4360966/4360966_17839986135067_big.jpg?w=600","url":"https://www.musinsa.com/products/4360966","rating":null,"reviews":0,"likes":30,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5179088","slot":"m-oxford","color":"blue","colorSource":"name","classification":"name-rules","brand":"브룩스 브라더스","name":"프라이데이 옥스포드 스포츠셔츠 (블루)","price":161100,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250612/5179088/5179088_17841678745606_big.jpg?w=600","url":"https://www.musinsa.com/products/5179088","rating":null,"reviews":0,"likes":25,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4125164","slot":"m-polo","color":"navy","colorSource":"name","classification":"name-rules","brand":"브룩스 브라더스","name":"옥스포드 칼라 빈티지 폴로 셔츠 (네이비)","price":75000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20240513/4125164/4125164_17847774415852_big.jpg?w=600","url":"https://www.musinsa.com/products/4125164","rating":5,"reviews":4,"likes":44,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6252903","slot":"m-knit","color":"black","colorSource":"name","classification":"name-rules","brand":"브룩스 브라더스","name":"코튼 폴로 반팔 스웨터 (블랙)","price":125300,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260403/6252903/6252903_17827947628157_big.jpg?w=600","url":"https://www.musinsa.com/products/6252903","rating":4.8,"reviews":17,"likes":156,"summer":true,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5524277","slot":"m-knit","color":"navy","colorSource":"name","classification":"name-rules","brand":"브룩스 브라더스","name":"울 솔리드 풀오버 (네이비)","price":167300,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250924/5524277/5524277_17833019604208_big.jpg?w=600","url":"https://www.musinsa.com/products/5524277","rating":5,"reviews":14,"likes":92,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4485101","slot":"m-knit","color":"navy","colorSource":"name","classification":"name-rules","brand":"브룩스 브라더스","name":"램스울 로고 스웨터 (네이비)","price":119400,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20241004/4485101/4485101_17840859365513_big.jpg?w=600","url":"https://www.musinsa.com/products/4485101","rating":5,"reviews":3,"likes":78,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4817101","slot":"m-rugby","color":"yellow","colorSource":"name","classification":"name-rules","brand":"브룩스 브라더스","name":"럭비 폴로스웨터 (옐로우)","price":179400,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250221/4817101/4817101_17840886564210_big.jpg?w=600","url":"https://www.musinsa.com/products/4817101","rating":null,"reviews":0,"likes":17,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4028274","slot":"m-blazer","color":"navy","colorSource":"name","classification":"name-rules","brand":"브룩스 브라더스","name":"트레디셔널핏 시어서커 3버튼 블레이저 (네이비)","price":395000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20240405/4028274/4028274_17122759460399_big.jpg?w=600","url":"https://www.musinsa.com/products/4028274","rating":5,"reviews":1,"likes":32,"summer":true,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4093400","slot":"m-blazer","color":"olive","colorSource":"name","classification":"name-rules","brand":"브룩스 브라더스","name":"리젠트핏 3버튼 색 수트 자켓 (올리브)","price":245000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20240429/4093400/4093400_17143651845939_big.jpg?w=600","url":"https://www.musinsa.com/products/4093400","rating":5,"reviews":2,"likes":16,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4093399","slot":"m-blazer","color":"black","colorSource":"name","classification":"name-rules","brand":"브룩스 브라더스","name":"리젠트핏 3버튼 색 수트 자켓 (블랙)","price":245000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20240429/4093399/4093399_17143651761332_big.jpg?w=600","url":"https://www.musinsa.com/products/4093399","rating":null,"reviews":0,"likes":48,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5918928","slot":"m-cardigan","color":"blue","colorSource":"name","classification":"name-rules","brand":"폴로 랄프 로렌","name":"케이블 니트 코튼 크루넥 카디건-블루","price":379000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260121/5918928/5918928_17703660805941_big.jpg?w=600","url":"https://www.musinsa.com/products/5918928","rating":null,"reviews":0,"likes":240,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6024477","slot":"m-cardigan","color":"pink","colorSource":"name","classification":"name-rules","brand":"폴로 랄프 로렌","name":"케이블 니트 코튼 크루넥 카디건-핑크","price":379000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260213/6024477/6024477_17721560925709_big.jpg?w=600","url":"https://www.musinsa.com/products/6024477","rating":null,"reviews":0,"likes":153,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-1848777","slot":"m-sweat","color":"navy","colorSource":"name","classification":"name-rules","brand":"폴로 랄프 로렌","name":"플리스 크루넥 스웨트셔츠 - 네이비","price":259000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20210317/1848777/1848777_2_big.jpg?w=600","url":"https://www.musinsa.com/products/1848777","rating":4.9,"reviews":264,"likes":2,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5915900","slot":"m-sweat","color":"white","colorSource":"name","classification":"name-rules","brand":"폴로 랄프 로렌","name":"폴로 베어 플리스 스웨트셔츠-화이트","price":139000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260120/5915900/5915900_17702499277093_big.jpg?w=600","url":"https://www.musinsa.com/products/5915900","rating":null,"reviews":0,"likes":19,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5915902","slot":"m-fleece","color":"navy","colorSource":"name","classification":"name-rules","brand":"폴로 랄프 로렌","name":"트리플 포니 플리스 베이스볼 재킷-네이비","price":146300,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260120/5915902/5915902_17702499755229_big.jpg?w=600","url":"https://www.musinsa.com/products/5915902","rating":null,"reviews":0,"likes":22,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6317638","slot":"m-oxford","color":"green","colorSource":"name","classification":"name-rules","brand":"폴로 랄프 로렌","name":"아이코닉 옥스포드 셔츠-그린","price":111300,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260415/6317638/6317638_17790629073400_big.jpg?w=600","url":"https://www.musinsa.com/products/6317638","rating":4.4,"reviews":5,"likes":69,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5915909","slot":"m-oxford","color":"red","colorSource":"name","classification":"name-rules","brand":"폴로 랄프 로렌","name":"코튼 옥스퍼드 캠프 셔츠-레드","price":179000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260120/5915909/5915909_17702502138460_big.jpg?w=600","url":"https://www.musinsa.com/products/5915909","rating":null,"reviews":0,"likes":34,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5340631","slot":"m-oxford","color":"blue","colorSource":"name","classification":"name-rules","brand":"폴로 랄프 로렌","name":"폴로 베어 코튼 옥스포드 셔츠-블루","price":139000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250820/5340631/5340631_17573758325461_big.jpg?w=600","url":"https://www.musinsa.com/products/5340631","rating":null,"reviews":0,"likes":19,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5262943","slot":"m-stripe-shirt","color":"ivory","colorSource":"image","classification":"name-rules","brand":"폴로 랄프 로렌","name":"스트라이프 코튼 옥스포드 셔츠-멀티 컬러","price":111300,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250722/5262943/5262943_17544418651702_big.jpg?w=600","url":"https://www.musinsa.com/products/5262943","rating":4.6,"reviews":8,"likes":134,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6317639","slot":"m-stripe-shirt","color":"pink","colorSource":"name","classification":"name-rules","brand":"폴로 랄프 로렌","name":"스트라이프 코튼 옥스포드 셔츠-핑크","price":159000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260415/6317639/6317639_17791537365306_big.jpg?w=600","url":"https://www.musinsa.com/products/6317639","rating":5,"reviews":4,"likes":94,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5047743","slot":"m-harrington","color":"beige","colorSource":"name","classification":"name-rules","brand":"아크테릭스","name":"아크로플 자켓 남성 - STONE GREEN","price":304000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250421/5047743/5047743_17466823712114_big.jpg?w=600","url":"https://www.musinsa.com/products/5047743","rating":null,"reviews":0,"likes":136,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-6627552","slot":"m-fleece","color":"black","colorSource":"name","classification":"correction","brand":"아크테릭스","name":"델타 자켓 남성 - BLACK SAPPHIRE","price":313500,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260608/6627552/6627552_17821790452139_big.jpg?w=600","url":"https://www.musinsa.com/products/6627552","rating":null,"reviews":0,"likes":24,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7193991","slot":"m-cardigan","color":"black","colorSource":"image","classification":"name-rules","brand":"라코스테","name":"방모 C넥 가디건 031","price":349000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260828/7193991/7193991_17879006375927_big.jpg?w=600","url":"https://www.musinsa.com/products/7193991","rating":5,"reviews":1,"likes":99,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5738906","slot":"m-cardigan","color":"black","colorSource":"image","classification":"name-rules","brand":"라코스테","name":"립조직 풀집업 가디건 031","price":244300,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20251114/5738906/5738906_17738988401654_big.jpg?w=600","url":"https://www.musinsa.com/products/5738906","rating":5,"reviews":3,"likes":81,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5740186","slot":"m-cardigan","color":"black","colorSource":"image","classification":"name-rules","brand":"라코스테","name":"브이넥 방모 가디건 YZP","price":191400,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20251117/5740186/5740186_17633417828345_big.jpg?w=600","url":"https://www.musinsa.com/products/5740186","rating":5,"reviews":2,"likes":29,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5738958","slot":"m-field","color":"black","colorSource":"image","classification":"name-rules","brand":"라코스테","name":"PARIS PACK 집업 봄버 가디건 166","price":179400,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20251114/5738958/5738958_17738995533693_big.jpg?w=600","url":"https://www.musinsa.com/products/5738958","rating":null,"reviews":0,"likes":18,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7177432","slot":"m-polo","color":"ivory","colorSource":"image","classification":"name-rules","brand":"라코스테","name":"케이블 긴팔 스웨터 폴로셔츠 02S","price":309000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260827/7177432/7177432_17877972655956_big.jpg?w=600","url":"https://www.musinsa.com/products/7177432","rating":null,"reviews":0,"likes":22,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5410515","slot":"m-chore","color":"navy","colorSource":"name","classification":"name-rules","brand":"토마스모어","name":"플란넬 셔켓 - 네이비","price":65700,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250905/5410515/5410515_17570643113940_big.jpg?w=600","url":"https://www.musinsa.com/products/5410515","rating":3.8,"reviews":4,"likes":256,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-3961536","slot":"m-oxford","color":"blue","colorSource":"name","classification":"name-rules","brand":"토마스모어","name":"피마 트윌 셔츠-라이첸블루","price":73500,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20240318/3961536/3961536_17107266388658_big.jpg?w=600","url":"https://www.musinsa.com/products/3961536","rating":4.9,"reviews":30,"likes":520,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5078349","slot":"m-oxford","color":"navy","colorSource":"name","classification":"name-rules","brand":"토마스모어","name":"마리누스 엠블럼 셔츠 - 네이비","price":63700,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250429/5078349/5078349_17461662117108_big.jpg?w=600","url":"https://www.musinsa.com/products/5078349","rating":4.3,"reviews":15,"likes":245,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5899699","slot":"m-sweat","color":"navy","colorSource":"name","classification":"name-rules","brand":"토마스모어","name":"마일드 크루 스웻셔츠 - 네이비","price":59700,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260115/5899699/5899699_17685417415796_big.jpg?w=600","url":"https://www.musinsa.com/products/5899699","rating":4.7,"reviews":24,"likes":679,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5899700","slot":"m-sweat","color":"grey","colorSource":"name","classification":"name-rules","brand":"토마스모어","name":"마일드 크루 스웻셔츠 - 소니멜란지","price":59700,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260115/5899700/5899700_17685420750000_big.jpg?w=600","url":"https://www.musinsa.com/products/5899700","rating":4.6,"reviews":14,"likes":593,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-7184979","slot":"m-sweat","color":"grey","colorSource":"name","classification":"name-rules","brand":"토마스모어","name":"선 페이디드 스웻셔츠 - 프룬그레이","price":67000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260827/7184979/7184979_17879011538977_big.jpg?w=600","url":"https://www.musinsa.com/products/7184979","rating":5,"reviews":4,"likes":315,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-5995098","slot":"f-denim","color":"indigo","colorSource":"correction","classification":"correction","brand":"리바이스","name":"루즈 부츠 진 005DO-0004","price":159000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20260209/5995098/5995098_17706007823536_big.jpg?w=600","url":"https://www.musinsa.com/products/5995098","rating":5,"reviews":1,"likes":205,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4061685","slot":"f-dress","color":"blue","colorSource":"name","classification":"name-rules","brand":"폴로 랄프 로렌","name":"W 코튼 샴브레이 셔츠 드레스 - 블루","price":279300,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20240417/4061685/4061685_17151581931130_big.jpg?w=600","url":"https://www.musinsa.com/products/4061685","rating":5,"reviews":8,"likes":938,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-3010402","slot":"f-cardigan","color":"white","colorSource":"name","classification":"name-rules","brand":"폴로 랄프 로렌","name":"W 케이블 니트 코튼 크루넥 카디건 - 화이트","price":379000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20230109/3010402/3010402_16772072249633_big.jpg?w=600","url":"https://www.musinsa.com/products/3010402","rating":4.9,"reviews":202,"likes":5,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-3836740","slot":"f-skirt","color":"black","colorSource":"correction","classification":"name-rules","brand":"리","name":"우먼 카고 데님 미니 스커트 블랙","price":39000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20240131/3836740/3836740_17882451359482_big.jpg?w=600","url":"https://www.musinsa.com/products/3836740","rating":5,"reviews":6,"likes":140,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-3941358","slot":"f-skirt","color":"indigo","colorSource":"name","classification":"name-rules","brand":"리","name":"우먼 로우 데님 미니 스커트 인디고 미듐","price":35000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20240312/3941358/3941358_17881710966767_big.jpg?w=600","url":"https://www.musinsa.com/products/3941358","rating":null,"reviews":0,"likes":196,"store":"무신사","checkedAt":"2026-10-14"},{"id":"ms-4893369","slot":"f-shirt","color":"indigo","colorSource":"name","classification":"name-rules","brand":"리","name":"우먼 숏 크롭 데님 반팔 셔츠 인디고 다크","price":35000,"img":"https://image.msscdn.net/thumbnails/images/goods_img/20250313/4893369/4893369_17418338248762_big.jpg?w=600","url":"https://www.musinsa.com/products/4893369","rating":5,"reviews":26,"likes":363,"summer":true,"store":"무신사","checkedAt":"2026-10-14"}];

// ── src/catalog-policy.js
// Runtime and generation share the same conservative exclusions. This is not visual recognition.

function productClassificationConflict(product) {
  const slot = SLOT_BY_ID[product?.slot];
  if (!slot) return null;
  const name = String(product.name || '').replace(/베스트\s*셀러/gi, ' ');
  const pants = /팬츠|바지|트라우저|슬랙스|(?:^|\s)진(?:\s|$)|\b(?:pants?|trousers?|slacks|jeans?)\b/i.test(name);
  // 신발 이름(위켄더 옥스포드 등)이 옷 종류에, 코트·기능성 아우터 이름이 상의·후드 종류에 들어가지 않게 한다
  const shoe = /위켄더|weekender|왈라비|wallabee|스니커즈|sneakers?|슈즈|\bshoes?\b|로퍼|loafer|구두|부츠(?!\s*(?:컷|진|팬츠))|\bboots?\b(?!\s*-?(?:cut|jeans?|pants?)\b)/i.test(name);
  const technical = /아톰|\batom\b|프로톤|proton|감마|gamma|후디니|houdini|\br1\b|마이크로\s*d\b|micro\s*d\b|알파\s*(재킷|자켓|sv|ar)|\balpha\s*(jacket|sv|ar)\b|델타\s*(재킷|자켓)|레트로\s*(파일|-?\s*x)|retro\s*(pile|-?\s*x)/i.test(name);
  const vest = /베스트|조끼|\bvests?\b/i.test(name);
  const shirt = /셔츠|\bshirts?\b/i.test(
    name.replace(/티\s*셔츠|t-?shirts?|스웨트\s*셔츠|스웻\s*셔츠|sweat\s*shirts?/gi, ' '),
  );
  const outer = /재킷|자켓|jacket|코트|coat|오버셔츠|overshirt|셔켓|shacket|파카|parka|블루종|blouson|점퍼/i.test(name);
  const insulated = /패딩|다운|구스|푸퍼|프리마로프트|\b(?:down|puffer|padded)\b|insulat|primaloft/i.test(
    name.replace(/버튼\s*다운|button\s*down/gi, ' '),
  );
  const fleece = /플리스|후리스|fleece|베터\s*스웨터|better\s*sweater/i.test(name);
  const sweater = /니트|스웨터|knit|sweater/i.test(name);
  const coat = /코트|\bcoats?\b/i.test(name);

  if (pants && slot.cat !== 'bottom') return 'category-conflict';
  if (shoe && slot.cat !== 'shoes') return 'category-conflict';
  if (coat && !shoe && slot.cat !== 'outer') return 'category-conflict';
  // A hood does not turn a parka into a sweatshirt. The explicit hooded sweatshirt
  // name HOOD ZIP UP PARKA remains allowed; technical model names are checked below.
  if (slot.cat === 'top' && /파카|\bparka\b/i.test(name) && !/\bHOOD ZIP UP PARKA\b/i.test(name)) return 'category-conflict';
  if (technical && ['m-hoodie', 'm-harrington', 'm-knit', 'm-sweat'].includes(slot.id)) return 'shape-conflict';
  if (slot.id === 'm-harrington' && /색\s*(재킷|자켓)|sack\s*jacket|[23]\s*-?\s*(버튼|button)|해리스\s*트위드|harris\s*tweed/i.test(name)) return 'shape-conflict';
  if (['tee', 'longtee'].includes(slot.shape) && /폴로(?!\s*(랄프|베어|bear|클럽|스포츠))|\bpolo\b(?!\s*ralph)/i.test(name)) return 'shape-conflict';
  if (slot.shape === 'shirt' && /스웨터|sweater/i.test(name)) return 'shape-conflict';
  // Technical trousers conflict with chino/tailored/denim shapes, but cargo is
  // explicitly a functional-trouser slot in this catalog.
  if (['m-chino', 'm-slacks', 'm-cords', 'm-denim', 'm-denim-raw', 'f-slacks', 'f-denim', 'f-skirt'].includes(slot.id) && /감마|gamma|타슬란|taslan|트레킹|trekking|하이킹|hiking|등산/i.test(name)) return 'shape-conflict';
  if (vest && slot.shape !== 'vest' && !(slot.shape === 'cardigan' && /가디건|카디건|cardigan/i.test(name)))
    return 'shape-conflict';
  if (shirt && slot.cat === 'outer' && !outer) return 'shape-conflict';
  if (slot.shape === 'shirt' && /\bpk\b|피케|pique|카라\s*티|폴로\s*셔츠|polo\s*shirt/i.test(name))
    return 'shape-conflict';
  // A generic or fleece vest must not be presented as a padded/down vest.
  if (slot.id === 'm-downvest' && !insulated) return 'insulation-unverified';
  if (slot.id === 'm-vest' && (insulated || fleece)) return 'shape-conflict';
  // "Down Sweater" and knitted-shell down jackets have insulation evidence.
  if (slot.shape === 'down' && (fleece || sweater) && !insulated) return 'shape-conflict';
  return null;
}

function productExclusionReason(product) {
  const name = String(product?.name || '');
  if (
    /구두\s*주걱|슈혼|shoe\s*horn|슈\s*트리|shoe\s*tree|슈즈?\s*클리너|구두\s*약|가죽\s*클리너|가죽\s*크림|슈\s*케어|신발\s*관리|shoe\s*care|슈\s*레이스|신발\s*끈|깔창|인솔|insole|방수\s*스프레이/i.test(
      name,
    )
  )
    return 'care-tool';
  if (
    /키즈|아동|남아|여아|주니어|베이비|토들러|보이즈|걸즈|쇼트올|쇼트\s*올|\b(kids?|junior|baby|infant|toddler|shortall)\b/i.test(
      name,
    )
  )
    return 'childrenswear';
  if (/swim|수영|스윔|래쉬\s*가드/i.test(name)) return 'swimwear';
  if (/장갑|글러브|\bgloves?\b|\bmittens?\b/i.test(name)) return 'not-garment';
  if (
    /쇼츠|반바지|숏\s*팬츠|하프\s*팬츠|\bshorts?\b(?!\s*sleeve)|버뮤다|bermuda|(치노|드로스트링|코튼|데님|카고|트윌)\s*쇼트(?!\s*(재킷|자켓|코트|초어|블루종|푸퍼|패딩|다운))/i.test(name)
  )
    return 'shorts';
  if (!name || !Number.isFinite(product.price) || product.price <= 0) return 'incomplete';
  const conflict = productClassificationConflict(product);
  if (conflict) return conflict;
  const requiredColors = SLOT_BY_ID[product.slot]?.requiredColors;
  if (requiredColors && !requiredColors.includes(evidenceColor(product))) return 'required-color-unverified';
  return null;
}
function productEligible(product) {
  return !productExclusionReason(product);
}
function evidenceColor(product) {
  return product.colorSource === 'image' ? null : product.color;
}

// 상품명에서 읽을 수 있는 것만 읽는다(핏·소재·기장·소매·기능성 표기). 상품명에 없는 속성은 만들지 않는다.
// 결과는 "상품명 기준" 근거 줄에 쓰고, 종류별 고정 설명과 어긋날 때(짧은 코트 자리의 롱 코트) 고정 설명을 대신한다.
const TRAITS = [
  ['fit', /오버사이즈|오버\s*핏|over\s*size/i, '오버사이즈'],
  ['fit', /릴렉스드?|relax/i, '릴렉스 핏'],
  ['fit', /와이드|wide/i, '와이드'],
  ['fit', /슬림|slim/i, '슬림'],
  ['length', /크롭|crop/i, '크롭'],
  ['length', /(^|[\s\[(])(롱|로브)(?![\s]*슬리브)|long(?!\s*sleeve)|maxi|맥시/i, '롱'],
  ['length', /하프\s*(코트|팬츠)|half/i, '하프'],
  ['length', /(^|[\s\[(])숏(?!\s*슬리브)|short(?!\s*sleeve)|미니(?!멀)/i, '숏'],
  ['sleeve', /반팔|숏\s*슬리브|short\s*sleeve|half\s*sleeve/i, '반팔'],
  ['sleeve', /긴팔|롱\s*슬리브|long\s*sleeve/i, '긴팔'],
  ['material', /캐시미어|cashmere/i, '캐시미어'],
  ['material', /알파카/i, '알파카'],
  ['material', /램스울|메리노|울\s*블렌드|울\s*라이크|(^|[\s\[(])울(?=\s|$|[\])])|wool/i, '울'],
  ['material', /린넨|리넨|linen/i, '린넨'],
  ['material', /코듀로이|corduroy/i, '코듀로이'],
  ['material', /플란넬|flannel/i, '플란넬'],
  ['material', /스웨이드|suede/i, '스웨이드'],
  ['material', /레더|가죽|leather/i, '레더'],
  ['material', /데님|denim/i, '데님'],
  ['material', /코튼|cotton|면/i, '코튼'],
  ['material', /헤비웨이트|heavy/i, '헤비웨이트'],
  ['material', /테리|terry/i, '테리'],
  ['functional', /러닝|running|안정화|트레일|trail|키높이|고어텍스|gore/i, '기능성 표기'],
];
function productTraits(product) {
  const name = product?.name || '';
  const seen = new Set();
  const out = [];
  for (const [kind, re, label] of TRAITS) {
    if (seen.has(kind) && kind !== 'material') continue;
    if (!re.test(name)) continue;
    seen.add(kind);
    out.push({ kind, label });
  }
  return out;
}
// 종류별 고정 설명이 이 상품에 틀리는지(기장만 본다: 짧은 코트 자리에 롱 코트, 긴 기장 설명에 숏 상품).
function whyConflicts(why, traits) {
  const len = traits.find((t) => t.kind === 'length')?.label;
  if (!len || !why) return false;
  return (len === '롱' && /짧|숏|크롭/.test(why)) || ((len === '숏' || len === '크롭') && /롱|긴 기장/.test(why));
}

// ── src/legacy-wardrobe.js
// Frozen schema 2 reader. Kept for lossless conversion and backup compatibility.
const legacyWardrobeV2 = (() => {
const SLOTS=[{"id":"m-oxford-white","g":"M","shape":"shirt","name":"화이트 옥스퍼드 셔츠"},{"id":"m-oxford-blue","g":"M","shape":"shirt","name":"블루 옥스퍼드 셔츠"},{"id":"m-stripe-shirt","g":"M","shape":"shirt","name":"스트라이프 셔츠"},{"id":"m-flannel","g":"M","shape":"shirt","name":"플란넬 체크 셔츠"},{"id":"m-tee-white","g":"M","shape":"tee","name":"화이트 티셔츠"},{"id":"m-longtee","g":"M","shape":"longtee","name":"무지 긴팔 티셔츠"},{"id":"m-knit-crew","g":"M","shape":"knit","name":"크루넥 울 니트"},{"id":"m-knit-cable","g":"M","shape":"knit","name":"케이블 니트"},{"id":"m-cardigan","g":"M","shape":"cardigan","name":"울 카디건"},{"id":"m-sweat","g":"M","shape":"sweat","name":"그레이 스웻셔츠"},{"id":"m-polo","g":"M","shape":"polo","name":"피케 폴로 셔츠"},{"id":"m-rugby","g":"M","shape":"polo","name":"럭비 셔츠"},{"id":"m-blazer","g":"M","shape":"blazer","name":"네이비 블레이저"},{"id":"m-trucker","g":"M","shape":"jacket","name":"데님 트러커 재킷"},{"id":"m-chore","g":"M","shape":"jacket","name":"초어 재킷"},{"id":"m-field","g":"M","shape":"jacket","name":"필드 재킷"},{"id":"m-harrington","g":"M","shape":"jacket","name":"해링턴 재킷"},{"id":"m-balmacaan","g":"M","shape":"coat","name":"발마칸 코트"},{"id":"m-trench","g":"M","shape":"coat","name":"트렌치 코트"},{"id":"m-down","g":"M","shape":"down","name":"패딩 재킷"},{"id":"m-barbour","g":"M","shape":"jacket","name":"왁스 재킷"},{"id":"m-chino","g":"M","shape":"pants","name":"베이지 치노 팬츠"},{"id":"m-denim","g":"M","shape":"jeans","name":"생지 데님 스트레이트"},{"id":"m-slacks-grey","g":"M","shape":"pants","name":"그레이 울 슬랙스"},{"id":"m-slacks-wide","g":"M","shape":"pants","name":"블랙 와이드 슬랙스"},{"id":"m-fatigue","g":"M","shape":"pants","name":"퍼티그 팬츠"},{"id":"m-loafer","g":"M","shape":"loafer","name":"페니 로퍼"},{"id":"m-derby","g":"M","shape":"loafer","name":"블랙 더비 슈즈"},{"id":"m-sneaker-leather","g":"M","shape":"sneaker","name":"화이트 레더 스니커즈"},{"id":"m-chuck","g":"M","shape":"sneaker","name":"캔버스 스니커즈"},{"id":"m-nb","g":"M","shape":"sneaker","name":"그레이 러닝 스니커즈"},{"id":"m-boots","g":"M","shape":"boot","name":"스웨이드 첼시 부츠"},{"id":"m-cap","g":"M","shape":"cap","name":"코튼 볼캡"},{"id":"m-belt","g":"M","shape":"belt","name":"가죽 벨트"},{"id":"f-shirt-white","g":"F","shape":"shirt","name":"화이트 코튼 셔츠"},{"id":"f-shirt-stripe","g":"F","shape":"shirt","name":"스트라이프 셔츠"},{"id":"f-tee","g":"F","shape":"tee","name":"베이직 티셔츠"},{"id":"f-knit","g":"F","shape":"knit","name":"크루넥 니트"},{"id":"f-cardigan","g":"F","shape":"cardigan","name":"카디건"},{"id":"f-blazer","g":"F","shape":"blazer","name":"블레이저"},{"id":"f-trench","g":"F","shape":"coat","name":"트렌치 코트"},{"id":"f-coat","g":"F","shape":"coat","name":"울 코트"},{"id":"f-jacket","g":"F","shape":"jacket","name":"데님 재킷"},{"id":"f-padding","g":"F","shape":"down","name":"숏패딩"},{"id":"f-denim","g":"F","shape":"jeans","name":"스트레이트 데님"},{"id":"f-slacks","g":"F","shape":"pants","name":"와이드 슬랙스"},{"id":"f-skirt","g":"F","shape":"skirt","name":"롱 스커트"},{"id":"f-dress","g":"F","shape":"dress","name":"셔츠 원피스"},{"id":"f-loafer","g":"F","shape":"loafer","name":"로퍼"},{"id":"f-maryjane","g":"F","shape":"loafer","name":"메리제인"},{"id":"f-sneaker","g":"F","shape":"sneaker","name":"스니커즈"},{"id":"f-bag","g":"F","shape":"bag","name":"숄더백"}];
const SLOT_BY_ID=Object.fromEntries(SLOTS.map(s=>[s.id,s]));
const STYLES={"classic":{"label":"클래식","desc":"셔츠 · 치노 · 로퍼"},"minimal":{"label":"미니멀","desc":"모노톤 · 깔끔한 핏"},"casual":{"label":"캐주얼","desc":"편한 데일리 · 워크웨어"}}, OCCASIONS={"daily":"데일리","work":"출근","date":"데이트","weekend":"주말·여행","formal":"격식·하객"};

const GARMENT_KINDS = [
  ['shirt', '셔츠'], ['tee', '티셔츠'], ['knit', '니트'], ['pants', '바지'],
  ['jeans', '청바지'], ['jacket', '재킷'], ['sneaker', '운동화'], ['cardigan', '카디건'],
  ['longtee', '긴팔 티'], ['sweat', '맨투맨'], ['polo', '폴로 셔츠'], ['blazer', '블레이저'],
  ['coat', '코트'], ['down', '패딩'], ['dress', '원피스'], ['skirt', '스커트'],
  ['loafer', '구두·로퍼'], ['boot', '부츠'], ['bag', '가방'], ['cap', '모자'], ['belt', '벨트'],
].map(([id, name]) => ({ id, name }));
const GARMENT_KIND_IDS = new Set(GARMENT_KINDS.map((kind) => kind.id));
const DEMO_SLOTS = {
  M: ['m-oxford-white', 'm-oxford-blue', 'm-tee-white', 'm-denim', 'm-chino', 'm-sneaker-leather'],
  F: ['f-shirt-white', 'f-tee', 'f-knit', 'f-denim', 'f-slacks', 'f-sneaker'],
};

function garmentKindName(kind) {
  return GARMENT_KINDS.find((row) => row.id === kind)?.name || '옷';
}

function garmentLabel(garment) {
  return garment.label || SLOT_BY_ID[garment.slotId]?.name || garmentKindName(garment.kind);
}

function garmentMatchesSlot(garment, slot) {
  return garment.gender === slot.g && (garment.slotId ? garment.slotId === slot.id : garment.kind === slot.shape);
}

function newWardrobeState() {
  return { schema: 2, onboarded: true, gender: 'M', style: 'classic', occasion: null, budget: null,
    demo: true, demoSelected: [...DEMO_SLOTS.M], garments: [], saved: [], hidden: [], legacyFingerprint: null,
    legacyBaseline: null, legacyDismissed: { owned: [], saved: [] } };
}

function virtualGarment(slotId, source) {
  const slot = SLOT_BY_ID[slotId];
  return { id: `${source}_${slotId}`, kind: slot.shape, gender: slot.g, slotId, source,
    photoId: null, label: '', attrs: null, createdAt: '2026-10-14T00:00:00.000Z' };
}

function ownedGarments(state) {
  if (state.demo) return (state.demoSelected || state.owned || DEMO_SLOTS[state.gender || 'M']).filter((id) => SLOT_BY_ID[id]).map((id) => virtualGarment(id, 'demo'));
  if (Array.isArray(state.garments)) return state.garments;
  return (state.owned || []).filter((id) => SLOT_BY_ID[id]).map((id) => virtualGarment(id, 'legacy'));
}

function ownedSlotIds(state) {
  const garments = ownedGarments(state);
  return SLOTS.filter((slot) => garments.some((garment) => garmentMatchesSlot(garment, slot))).map((slot) => slot.id);
}

function wardrobeView(record, tab = 'home') {
  return { ...record, legacyBaseline: record.legacyBaseline ?? null, legacyDismissed: record.legacyDismissed ?? { owned: [], saved: [] }, owned: ownedSlotIds(record), tab };
}

function storedWardrobe(state) {
  const { schema, onboarded, gender, style, occasion, budget, demo, demoSelected, garments, saved, hidden, legacyFingerprint, legacyBaseline = null, legacyDismissed = { owned: [], saved: [] } } = state;
  const record = { schema, onboarded, gender, style, occasion, budget, demo, demoSelected, garments, saved, hidden, legacyFingerprint, legacyBaseline, legacyDismissed };
  validateWardrobe(record);
  return structuredClone(record);
}

function assertRecordKeys(value, allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some((key) => !allowed.includes(key))) throw new Error('저장된 자료의 형식을 확인할 수 없습니다. 원본을 보존했습니다.');
}

function validateWardrobe(record) {
  assertRecordKeys(record, ['schema', 'onboarded', 'gender', 'style', 'occasion', 'budget', 'demo', 'demoSelected', 'garments', 'saved', 'hidden', 'legacyFingerprint', 'legacyBaseline', 'legacyDismissed']);
  if (!(record.legacyFingerprint === null || typeof record.legacyFingerprint === 'string' && /^[a-f0-9]{64}$/.test(record.legacyFingerprint))) throw new Error('이전 옷장 확인 기록이 올바르지 않습니다.');
  for (const value of [record.legacyBaseline, record.legacyDismissed]) if (value != null) {
    assertRecordKeys(value, ['owned', 'saved']);
    if (!Array.isArray(value.owned) || value.owned.some((id) => !SLOT_BY_ID[id]) || !Array.isArray(value.saved) || value.saved.some((id) => typeof id !== 'string' || !/^ms-\d+$/.test(id))) throw new Error('이전 기록의 비교 기준이 올바르지 않습니다.');
  }
  if (record.schema !== 2 || typeof record.onboarded !== 'boolean' || typeof record.demo !== 'boolean') throw new Error('지원하지 않는 옷장 형식입니다. 원본을 보존했습니다.');
  if (![null, 'M', 'F'].includes(record.gender) || !(record.style === null || Object.hasOwn(STYLES, record.style)) || !(record.occasion === null || Object.hasOwn(OCCASIONS, record.occasion))) throw new Error('저장된 취향을 읽지 못했습니다.');
  if (record.onboarded && (!record.gender || !record.style)) throw new Error('저장된 시작 정보가 올바르지 않습니다.');
  if (!(record.budget === null || Number.isFinite(record.budget) && record.budget >= 0)) throw new Error('저장된 예산이 올바르지 않습니다.');
  for (const key of ['saved', 'hidden']) if (!Array.isArray(record[key]) || record[key].some((id) => typeof id !== 'string' || !/^ms-\d+$/.test(id))) throw new Error('저장된 상품 목록이 올바르지 않습니다.');
  if (!Array.isArray(record.demoSelected) || record.demoSelected.some((id) => !SLOT_BY_ID[id]) || new Set(record.demoSelected).size !== record.demoSelected.length) throw new Error('예시 옷장 정보가 올바르지 않습니다.');
  if (!Array.isArray(record.garments) || record.demo && record.garments.length) throw new Error('옷장 자료를 안전하게 읽을 수 없습니다.');
  if (record.garments.length > 200) throw new Error('현재 옷장은 최대 200벌까지 보관할 수 있어요. 백업 후 필요 없는 옷을 정리해 주세요.');
  const ids = new Set();
  for (const garment of record.garments) {
    assertRecordKeys(garment, ['id', 'kind', 'gender', 'slotId', 'source', 'photoId', 'label', 'attrs', 'createdAt']);
    if (typeof garment.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(garment.id) || ids.has(garment.id)) throw new Error('옷의 식별 정보가 올바르지 않습니다.');
    ids.add(garment.id);
    if (!GARMENT_KIND_IDS.has(garment.kind) || !['M', 'F'].includes(garment.gender) || !['user', 'legacy'].includes(garment.source)) throw new Error('옷 종류 또는 출처를 읽을 수 없습니다.');
    if (!(garment.slotId === null || SLOT_BY_ID[garment.slotId]?.g === garment.gender && SLOT_BY_ID[garment.slotId]?.shape === garment.kind)) throw new Error('옷 종류 연결이 올바르지 않습니다.');
    if (!(garment.photoId === null || typeof garment.photoId === 'string' && /^p_[a-f0-9]{64}$/.test(garment.photoId))) throw new Error('사진 참조가 올바르지 않습니다.');
    if (typeof garment.label !== 'string' || garment.label.length > 80 || garment.attrs !== null || typeof garment.createdAt !== 'string' || !Number.isFinite(Date.parse(garment.createdAt))) throw new Error('옷의 상세 정보를 읽을 수 없습니다.');
  }
  return record;
}

function migrateLegacyWardrobe(raw) {
  if (raw === null) return newWardrobeState();
  const legacy = JSON.parse(raw);
  assertRecordKeys(legacy, ['onboarded', 'gender', 'style', 'occasion', 'budget', 'owned', 'saved', 'hidden', 'tab', 'demo']);
  if (Object.hasOwn(legacy, 'demo') && typeof legacy.demo !== 'boolean') throw new Error('이전 예시 옷장 상태를 읽지 못했습니다. 원본을 보존했습니다.');
  if (!Array.isArray(legacy.owned) || legacy.owned.some((id) => !SLOT_BY_ID[id])) throw new Error('이전 옷장 종류를 읽지 못했습니다. 원본을 보존했습니다.');
  const ids = [...new Set(legacy.owned)];
  const record = { ...newWardrobeState(), onboarded: legacy.onboarded ?? false, gender: legacy.gender ?? null,
    style: legacy.style ?? null, occasion: legacy.occasion ?? null, budget: legacy.budget ?? null,
    demo: legacy.demo === true, demoSelected: legacy.demo ? ids : [],
    garments: legacy.demo ? [] : ids.map((id) => virtualGarment(id, 'legacy')),
    saved: legacy.saved ?? [], hidden: legacy.hidden ?? [],
    legacyBaseline: { owned: legacy.demo ? [] : ids, saved: legacy.saved ?? [] } };
  return validateWardrobe(record);
}

function makeGarment({ kind, gender, slotId = null, photoId = null, label = '', id = `g_${crypto.randomUUID()}`, createdAt = new Date().toISOString() }) {
  return { id, kind, gender, slotId, source: 'user', photoId, label: label.trim().slice(0, 80), attrs: null, createdAt };
}

return { validateWardrobe, newWardrobeState, makeGarment, migrateLegacyWardrobe, storedWardrobe, SLOTS };
})();

// ── src/legacy-purchase-v4.js
// Frozen actual e51f118 schema 4 purchase validator and classification tables.
// Do not loosen it when changing the current schema: unknown legacy fields must fail closed.
const legacyPurchaseV4 = (() => {
const SLOTS = [{"id":"m-oxford","g":"M","shape":"shirt"},{"id":"m-stripe-shirt","g":"M","shape":"shirt"},{"id":"m-chambray","g":"M","shape":"shirt"},{"id":"m-flannel","g":"M","shape":"shirt"},{"id":"m-tee","g":"M","shape":"tee"},{"id":"m-longtee","g":"M","shape":"longtee"},{"id":"m-henley","g":"M","shape":"longtee"},{"id":"m-polo","g":"M","shape":"polo"},{"id":"m-rugby","g":"M","shape":"polo"},{"id":"m-sweat","g":"M","shape":"sweat"},{"id":"m-hoodie","g":"M","shape":"sweat"},{"id":"m-knit","g":"M","shape":"knit"},{"id":"m-cable","g":"M","shape":"knit"},{"id":"m-vest","g":"M","shape":"vest"},{"id":"m-cardigan","g":"M","shape":"cardigan"},{"id":"m-blazer","g":"M","shape":"blazer"},{"id":"m-trucker","g":"M","shape":"jacket"},{"id":"m-chore","g":"M","shape":"jacket"},{"id":"m-field","g":"M","shape":"jacket"},{"id":"m-harrington","g":"M","shape":"jacket"},{"id":"m-varsity","g":"M","shape":"jacket"},{"id":"m-deck","g":"M","shape":"jacket"},{"id":"m-wax","g":"M","shape":"jacket"},{"id":"m-fleece","g":"M","shape":"jacket"},{"id":"m-shell","g":"M","shape":"jacket"},{"id":"m-down","g":"M","shape":"down"},{"id":"m-downvest","g":"M","shape":"vest"},{"id":"m-balmacaan","g":"M","shape":"coat"},{"id":"m-trench","g":"M","shape":"coat"},{"id":"m-peacoat","g":"M","shape":"coat"},{"id":"m-chino","g":"M","shape":"pants"},{"id":"m-denim-raw","g":"M","shape":"jeans"},{"id":"m-denim","g":"M","shape":"jeans"},{"id":"m-slacks","g":"M","shape":"pants"},{"id":"m-work-pants","g":"M","shape":"pants"},{"id":"m-cargo","g":"M","shape":"pants"},{"id":"m-cords","g":"M","shape":"pants"},{"id":"m-loafer","g":"M","shape":"loafer"},{"id":"m-derby","g":"M","shape":"loafer"},{"id":"m-workboots","g":"M","shape":"boot"},{"id":"m-chelsea","g":"M","shape":"boot"},{"id":"m-white-sneaker","g":"M","shape":"sneaker"},{"id":"m-canvas","g":"M","shape":"sneaker"},{"id":"m-runner","g":"M","shape":"sneaker"},{"id":"m-trail","g":"M","shape":"sneaker"},{"id":"m-cap","g":"M","shape":"cap"},{"id":"m-beanie","g":"M","shape":"beanie"},{"id":"m-belt","g":"M","shape":"belt"},{"id":"f-shirt","g":"F","shape":"shirt"},{"id":"f-stripe","g":"F","shape":"shirt"},{"id":"f-tee","g":"F","shape":"tee"},{"id":"f-knit","g":"F","shape":"knit"},{"id":"f-sweat","g":"F","shape":"sweat"},{"id":"f-cardigan","g":"F","shape":"cardigan"},{"id":"f-blazer","g":"F","shape":"blazer"},{"id":"f-trench","g":"F","shape":"coat"},{"id":"f-coat","g":"F","shape":"coat"},{"id":"f-jacket","g":"F","shape":"jacket"},{"id":"f-padding","g":"F","shape":"down"},{"id":"f-denim","g":"F","shape":"jeans"},{"id":"f-slacks","g":"F","shape":"pants"},{"id":"f-skirt","g":"F","shape":"skirt"},{"id":"f-dress","g":"F","shape":"dress"},{"id":"f-loafer","g":"F","shape":"loafer"},{"id":"f-flat","g":"F","shape":"loafer"},{"id":"f-sneaker","g":"F","shape":"sneaker"},{"id":"f-boots","g":"F","shape":"boot"},{"id":"f-bag","g":"F","shape":"bag"}];
const SLOT_BY_ID = Object.fromEntries(SLOTS.map((slot) => [slot.id, slot]));
const COLORS = {"white":true,"ivory":true,"beige":true,"blue":true,"grey":true,"olive":true,"brown":true,"indigo":true,"charcoal":true,"navy":true,"black":true,"green":true,"red":true,"pink":true,"yellow":true,"purple":true,"orange":true};
const JOURNEY_DECISIONS = ['buy', 'hold', 'skip'];
const JOURNEY_STAGES = ['candidate', 'ordered', 'received', 'kept', 'returned'];
const JOURNEY_ACTIONS = [...JOURNEY_DECISIONS, 'ordered', 'received', 'kept', 'returned', 'worn'];
const MAX_PURCHASE_JOURNEYS = 200;
const MAX_JOURNEY_HISTORY = 512;
const MAX_WARDROBE_STATE_BYTES = 850000;

const purchaseKinds = new Set(SLOTS.map((slot) => slot.shape));
const purchaseCandidateKeys = [
  'productId', 'url', 'originalUrl', 'slot', 'kind', 'gender', 'color', 'colorSource',
  'brand', 'name', 'price', 'priceSource', 'checkedAt', 'source', 'classificationConfirmed',
];
const purchaseJourneyKeys = [
  'id', 'candidate', 'decision', 'stage', 'absence', 'intent', 'option',
  'reason', 'garmentId', 'wearCount', 'history', 'relatedGarmentIds',
  'replacementGarmentId', 'replacementConfirmed', 'forkedFrom',
];
function purchaseKeys(value, allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).length !== allowed.length ||
      Object.keys(value).some((key) => !allowed.includes(key)))
    throw new Error('지원하지 않는 구매 기록 형식입니다. 원본을 보존했습니다.');
}
function purchaseText(value, max) {
  return typeof value === 'string' && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value);
}
function purchaseInstant(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}
function purchaseCheckedDate(value) {
  if (value === null) return true;
  if (purchaseInstant(value)) return true;
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
// These are saved outbound links, not fetched pages. Reject local/private URLs
// and credentials before they can reach the UI; this is not DNS verification.
function isPublicPurchaseUrl(value) {
  if (!purchaseText(value, 2048) || !/^https:\/\//i.test(value) || value.trim() !== value || /[\s\\]/.test(value)) return false;
  let parsed;
  try { parsed = new URL(value); } catch { return false; }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port && parsed.port !== '443') return false;
  const host = parsed.hostname.toLowerCase().replace(/\.$/, '');
  if (!host || host === 'localhost' || /\.(?:localhost|local|internal|lan|home|test|invalid)$/.test(host)) return false;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    const [a, b, c] = host.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
      a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 ||
      a === 192 && b === 168 || a === 100 && b >= 64 && b <= 127 ||
      a === 192 && b === 0 && (c === 0 || c === 2) ||
      a === 198 && (b === 18 || b === 19 || b === 51 && c === 100) ||
      a === 203 && b === 0 && c === 113);
  }
  if (host.startsWith('['))
    return /^\[[23][a-f0-9]{0,3}:/.test(host) && !/^\[2001:db8(?::|\])/.test(host);
  return host.length <= 253 && host.includes('.') && host.split('.').every((part) =>
    /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(part));
}
function validatePurchaseCandidate(candidate) {
  purchaseKeys(candidate, purchaseCandidateKeys);
  if (!(candidate.productId === null || typeof candidate.productId === 'string' && /^ms-\d+$/.test(candidate.productId)) ||
      !isPublicPurchaseUrl(candidate.url) || !isPublicPurchaseUrl(candidate.originalUrl) || !['m', 'f'].includes(candidate.gender) ||
      !(candidate.kind === null || purchaseKinds.has(candidate.kind)) ||
      !(candidate.slot === null || SLOT_BY_ID[candidate.slot]?.g === candidate.gender.toUpperCase() &&
        SLOT_BY_ID[candidate.slot]?.shape === candidate.kind))
    throw new Error('구매 후보의 링크·종류·상품 정보를 확인해 주세요.');
  if (!(candidate.color === null || Object.hasOwn(COLORS, candidate.color)) ||
      ![null, 'user', 'name', 'curation', 'image'].includes(candidate.colorSource) ||
      (candidate.color === null) !== (candidate.colorSource === null) ||
      !purchaseText(candidate.brand, 120) || !purchaseText(candidate.name, 160) ||
      !(candidate.price === null || Number.isSafeInteger(candidate.price) && candidate.price >= 0 && candidate.price <= 1000000000) ||
      ![null, 'catalog', 'user'].includes(candidate.priceSource) ||
      (candidate.price === null) !== (candidate.priceSource === null) ||
      !purchaseCheckedDate(candidate.checkedAt) || !['catalog', 'user'].includes(candidate.source) ||
      typeof candidate.classificationConfirmed !== 'boolean' ||
      candidate.classificationConfirmed && candidate.kind === null)
    throw new Error('구매 후보의 확인 정보가 올바르지 않습니다.');
  return candidate;
}
function validatePurchaseJourney(journey) {
  purchaseKeys(journey, purchaseJourneyKeys);
  validatePurchaseCandidate(journey.candidate);
  if (typeof journey.id !== 'string' || !/^[-\w]{1,100}$/.test(journey.id) ||
      ![null, ...JOURNEY_DECISIONS].includes(journey.decision) || !JOURNEY_STAGES.includes(journey.stage) ||
      !['unknown', 'absent', 'present'].includes(journey.absence) || !['add', 'replace'].includes(journey.intent) ||
      !purchaseText(journey.option, 160) || !purchaseText(journey.reason, 500) ||
      !(journey.garmentId === null || typeof journey.garmentId === 'string' && /^[-\w]{1,100}$/.test(journey.garmentId)) ||
      !Number.isSafeInteger(journey.wearCount) || journey.wearCount < 0 || journey.wearCount > 1000000 ||
      !Array.isArray(journey.history) || !journey.history.length || journey.history.length > MAX_JOURNEY_HISTORY ||
      !(journey.forkedFrom === null || typeof journey.forkedFrom === 'string' && /^[-\w]{1,100}$/.test(journey.forkedFrom)) ||
      journey.forkedFrom === journey.id ||
      !Array.isArray(journey.relatedGarmentIds) || journey.relatedGarmentIds.length > 200 ||
      journey.relatedGarmentIds.some((id) => typeof id !== 'string' || !/^[-\w]{1,100}$/.test(id)) ||
      new Set(journey.relatedGarmentIds).size !== journey.relatedGarmentIds.length ||
      !(journey.replacementGarmentId === null || typeof journey.replacementGarmentId === 'string' && /^[-\w]{1,100}$/.test(journey.replacementGarmentId)) ||
      typeof journey.replacementConfirmed !== 'boolean' ||
      journey.replacementConfirmed && !journey.replacementGarmentId ||
      journey.replacementGarmentId !== null && journey.replacementGarmentId === journey.garmentId)
    throw new Error('구매 진행 기록을 읽지 못했습니다. 원본을 보존했습니다.');
  let previous = '', stage = 'candidate', decision = null, worn = 0, everKept = false;
  journey.history.forEach((entry, index) => {
    purchaseKeys(entry, ['action', 'at']);
    if (!purchaseInstant(entry.at) || entry.at < previous ||
        !['created', ...JOURNEY_ACTIONS].includes(entry.action) ||
        (index === 0 ? entry.action !== 'created' : entry.action === 'created'))
      throw new Error('구매 기록의 날짜나 순서를 확인해 주세요.');
    previous = entry.at;
    if (JOURNEY_DECISIONS.includes(entry.action)) decision = entry.action;
    else if (entry.action === 'ordered') {
      if (stage !== 'candidate') throw new Error('구매 진행 순서가 올바르지 않습니다.');
      stage = 'ordered';
    } else if (entry.action === 'received') {
      if (!['ordered', 'returned'].includes(stage)) throw new Error('수령 확인 전에 주문 기록을 확인해 주세요.');
      stage = 'received';
    } else if (entry.action === 'kept') {
      if (stage !== 'received') throw new Error('보관 결정 전에 수령 기록을 확인해 주세요.');
      stage = 'kept';
      everKept = true;
    } else if (entry.action === 'returned') {
      if (!['received', 'kept'].includes(stage)) throw new Error('반품 확인 전에 수령 기록을 확인해 주세요.');
      stage = 'returned';
    } else if (entry.action === 'worn') {
      if (stage !== 'kept') throw new Error('계속 보관하기로 결정한 옷만 착용을 기록할 수 있어요.');
      worn++;
    }
  });
  if (stage !== journey.stage || decision !== journey.decision || worn !== journey.wearCount ||
      journey.garmentId !== null && !['received', 'kept', 'returned'].includes(stage) ||
      journey.replacementConfirmed && !everKept)
    throw new Error('구매 상태와 기록이 다릅니다. 원본을 보존했습니다.');
  return journey;
}
return { validatePurchaseCandidate, validatePurchaseJourney };
})();

// ── src/purchase-journey.js


const JOURNEY_DECISIONS = ['buy', 'hold', 'skip'];
const JOURNEY_STAGES = ['candidate', 'ordered', 'received', 'kept', 'returned'];
const JOURNEY_DETAIL_ACTIONS = ['note', 'candidate-edit', 'details-change', 'garment-confirmed', 'correction', 'imported'];
const JOURNEY_ACTIONS = [...JOURNEY_DECISIONS, 'ordered', 'received', 'kept', 'returned', 'worn', ...JOURNEY_DETAIL_ACTIONS];
const JOURNEY_FITS = ['small', 'right', 'large'];
const JOURNEY_RETURN_REASONS = ['size', 'color', 'quality', 'change-of-mind', 'other'];
const MAX_PURCHASE_JOURNEYS = 200;
const MAX_JOURNEY_HISTORY = 512;
// Schema 7's empty seller-note field adds exactly 18 UTF-8 JSON bytes. Reserve
// only that metadata overhead so a valid full schema 6 snapshot still upgrades.
const MAX_WARDROBE_STATE_BYTES = 850018;

const purchaseKinds = new Set(SLOTS.map((slot) => slot.shape));
const purchaseCandidateKeys = [
  'productId', 'url', 'originalUrl', 'slot', 'kind', 'gender', 'color', 'colorSource',
  'brand', 'name', 'price', 'priceSource', 'checkedAt', 'source', 'classificationConfirmed',
];
const purchaseJourneyKeys = [
  'id', 'candidate', 'decision', 'stage', 'absence', 'intent', 'option',
  'reason', 'garmentId', 'wearCount', 'history', 'relatedGarmentIds',
  'replacementGarmentId', 'replacementConfirmed', 'forkedFrom', 'feedback',
];
const purchaseDetailKeys = [
  'candidate', 'option', 'reason', 'feedback', 'absence', 'intent',
  'relatedGarmentIds', 'replacementGarmentId', 'replacementConfirmed', 'garmentId',
];
function purchaseKeys(value, allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).length !== allowed.length ||
      Object.keys(value).some((key) => !allowed.includes(key)))
    throw new Error('지원하지 않는 구매 기록 형식입니다. 원본을 보존했습니다.');
}
function purchaseText(value, max) {
  return typeof value === 'string' && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value);
}
function purchaseInstant(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}
function purchaseCheckedDate(value) {
  if (value === null) return true;
  if (purchaseInstant(value)) return true;
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
// These are saved outbound links, not fetched pages. Reject local/private URLs
// and credentials before they can reach the UI; this is not DNS verification.
function isPublicPurchaseUrl(value) {
  if (!purchaseText(value, 2048) || !/^https:\/\//i.test(value) || value.trim() !== value || /[\s\\]/.test(value)) return false;
  let parsed;
  try { parsed = new URL(value); } catch { return false; }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port && parsed.port !== '443') return false;
  const host = parsed.hostname.toLowerCase().replace(/\.$/, '');
  if (!host || host === 'localhost' || /\.(?:localhost|local|internal|lan|home|test|invalid)$/.test(host)) return false;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    const [a, b, c] = host.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
      a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 ||
      a === 192 && b === 168 || a === 100 && b >= 64 && b <= 127 ||
      a === 192 && b === 0 && (c === 0 || c === 2) ||
      a === 198 && (b === 18 || b === 19 || b === 51 && c === 100) ||
      a === 203 && b === 0 && c === 113);
  }
  if (host.startsWith('['))
    return /^\[[23][a-f0-9]{0,3}:/.test(host) && !/^\[2001:db8(?::|\])/.test(host);
  return host.length <= 253 && host.includes('.') && host.split('.').every((part) =>
    /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(part));
}
function validatePurchaseCandidate(candidate) {
  purchaseKeys(candidate, purchaseCandidateKeys);
  if (!(candidate.productId === null || typeof candidate.productId === 'string' && /^ms-\d+$/.test(candidate.productId)) ||
      !isPublicPurchaseUrl(candidate.url) || !isPublicPurchaseUrl(candidate.originalUrl) || !['m', 'f'].includes(candidate.gender) ||
      !(candidate.kind === null || purchaseKinds.has(candidate.kind)) ||
      !(candidate.slot === null || SLOT_BY_ID[candidate.slot]?.g === candidate.gender.toUpperCase() &&
        SLOT_BY_ID[candidate.slot]?.shape === candidate.kind))
    throw new Error('구매 후보의 링크·종류·상품 정보를 확인해 주세요.');
  if (!(candidate.color === null || Object.hasOwn(COLORS, candidate.color)) ||
      ![null, 'user', 'name', 'curation', 'image'].includes(candidate.colorSource) ||
      (candidate.color === null) !== (candidate.colorSource === null) ||
      !purchaseText(candidate.brand, 120) || !purchaseText(candidate.name, 160) ||
      !(candidate.price === null || Number.isSafeInteger(candidate.price) && candidate.price >= 0 && candidate.price <= 1000000000) ||
      ![null, 'catalog', 'user'].includes(candidate.priceSource) ||
      (candidate.price === null) !== (candidate.priceSource === null) ||
      !purchaseCheckedDate(candidate.checkedAt) || !['catalog', 'user'].includes(candidate.source) ||
      typeof candidate.classificationConfirmed !== 'boolean' ||
      candidate.classificationConfirmed && candidate.kind === null)
    throw new Error('구매 후보의 확인 정보가 올바르지 않습니다.');
  return candidate;
}
function validatePurchaseFeedback(feedback) {
  purchaseKeys(feedback, ['fit', 'returnReason']);
  if (![null, ...JOURNEY_FITS].includes(feedback.fit) ||
      ![null, ...JOURNEY_RETURN_REASONS].includes(feedback.returnReason))
    throw new Error('착용·반품의 확인 정보가 올바르지 않습니다.');
  return feedback;
}
function validatePurchaseDetails(details) {
  purchaseKeys(details, purchaseDetailKeys);
  validatePurchaseCandidate(details.candidate);
  validatePurchaseFeedback(details.feedback);
  if (!['unknown', 'absent', 'present'].includes(details.absence) || !['add', 'replace'].includes(details.intent) ||
      !purchaseText(details.option, 160) || !purchaseText(details.reason, 500) ||
      !(details.garmentId === null || typeof details.garmentId === 'string' && /^[-\w]{1,100}$/.test(details.garmentId)) ||
      !Array.isArray(details.relatedGarmentIds) || details.relatedGarmentIds.length > 200 ||
      details.relatedGarmentIds.some((id) => typeof id !== 'string' || !/^[-\w]{1,100}$/.test(id)) ||
      new Set(details.relatedGarmentIds).size !== details.relatedGarmentIds.length ||
      !(details.replacementGarmentId === null || typeof details.replacementGarmentId === 'string' && /^[-\w]{1,100}$/.test(details.replacementGarmentId)) ||
      typeof details.replacementConfirmed !== 'boolean' ||
      details.replacementConfirmed && !details.replacementGarmentId ||
      details.replacementGarmentId !== null && details.replacementGarmentId === details.garmentId)
    throw new Error('구매 진행 기록을 읽지 못했습니다. 원본을 보존했습니다.');
  return details;
}
// Event values are copies of what the user had actually recorded at this point.
// They never borrow later candidate edits, options or return feedback.
function purchaseJourneyDetails(journey) {
  const details = Object.fromEntries(purchaseDetailKeys.map((key) => [key, structuredClone(journey[key])]));
  return validatePurchaseDetails(details);
}
function validatePurchaseJourney(journey) {
  purchaseKeys(journey, purchaseJourneyKeys);
  purchaseJourneyDetails(journey);
  if (typeof journey.id !== 'string' || !/^[-\w]{1,100}$/.test(journey.id) ||
      ![null, ...JOURNEY_DECISIONS].includes(journey.decision) || !JOURNEY_STAGES.includes(journey.stage) ||
      !Number.isSafeInteger(journey.wearCount) || journey.wearCount < 0 || journey.wearCount > 1000000 ||
      !Array.isArray(journey.history) || !journey.history.length || journey.history.length > MAX_JOURNEY_HISTORY ||
      !(journey.forkedFrom === null || typeof journey.forkedFrom === 'string' && /^[-\w]{1,100}$/.test(journey.forkedFrom)) ||
      journey.forkedFrom === journey.id)
    throw new Error('구매 진행 기록을 읽지 못했습니다. 원본을 보존했습니다.');
  let previous = '', stage = 'candidate', decision = null, worn = 0, everKept = false, detailsStarted = false;
  journey.history.forEach((entry, index) => {
    purchaseKeys(entry, ['action', 'at', 'details']);
    if (!purchaseInstant(entry.at) || entry.at < previous ||
        !['created', ...JOURNEY_ACTIONS].includes(entry.action) ||
        (index === 0 ? entry.action !== 'created' : entry.action === 'created'))
      throw new Error('구매 기록의 날짜나 순서를 확인해 주세요.');
    if (entry.details === null) {
      // Only the contiguous legacy prefix may lack past values. New metadata
      // actions cannot masquerade as events migrated from schema 4.
      if (detailsStarted || JOURNEY_DETAIL_ACTIONS.includes(entry.action))
        throw new Error('구매 기록의 당시 확인 정보가 빠졌습니다. 원본을 보존했습니다.');
    } else {
      validatePurchaseDetails(entry.details);
      detailsStarted = true;
    }
    previous = entry.at;
    if (JOURNEY_DECISIONS.includes(entry.action)) decision = entry.action;
    else if (entry.action === 'ordered') {
      if (stage !== 'candidate') throw new Error('구매 진행 순서가 올바르지 않습니다.');
      stage = 'ordered';
    } else if (entry.action === 'received') {
      if (!['ordered', 'returned'].includes(stage)) throw new Error('수령 확인 전에 주문 기록을 확인해 주세요.');
      stage = 'received';
    } else if (entry.action === 'kept') {
      if (stage !== 'received') throw new Error('보관 결정 전에 수령 기록을 확인해 주세요.');
      stage = 'kept';
      everKept = true;
    } else if (entry.action === 'returned') {
      if (!['received', 'kept'].includes(stage)) throw new Error('반품 확인 전에 수령 기록을 확인해 주세요.');
      stage = 'returned';
    } else if (entry.action === 'worn') {
      if (stage !== 'kept') throw new Error('계속 보관하기로 결정한 옷만 착용을 기록할 수 있어요.');
      worn++;
    }
  });
  if (stage !== journey.stage || decision !== journey.decision || worn !== journey.wearCount ||
      journey.garmentId !== null && !['received', 'kept', 'returned'].includes(stage) ||
      journey.replacementConfirmed && !everKept)
    throw new Error('구매 상태와 기록이 다릅니다. 원본을 보존했습니다.');
  return journey;
}
function createPurchaseJourney(candidate, { id = `j_${crypto.randomUUID()}`, at = new Date().toISOString() } = {}) {
  validatePurchaseCandidate(candidate);
  const journey = {
    id, candidate: structuredClone(candidate), decision: null, stage: 'candidate',
    absence: 'unknown', intent: 'add', option: '', reason: '', garmentId: null,
    feedback: { fit: null, returnReason: null },
    relatedGarmentIds: [], replacementGarmentId: null, replacementConfirmed: false,
    forkedFrom: null,
    wearCount: 0, history: [],
  };
  journey.history.push({ action: 'created', at, details: purchaseJourneyDetails(journey) });
  return validatePurchaseJourney(journey);
}
// Pure transitions. A seller visit and an intention to buy never imply payment.
// The UI commits receipt plus garment creation together in the same transaction.
function transitionPurchaseJourney(journey, action, { at = new Date().toISOString(), changes = {} } = {}) {
  validatePurchaseJourney(journey);
  if (!JOURNEY_ACTIONS.includes(action)) throw new Error('지원하지 않는 구매 동작입니다.');
  if (!changes || typeof changes !== 'object' || Array.isArray(changes) ||
      Object.keys(changes).some((key) => !purchaseDetailKeys.includes(key)))
    throw new Error('지원하지 않는 구매 기록 변경입니다. 원본을 보존했습니다.');
  if (journey.history.length >= MAX_JOURNEY_HISTORY)
    throw new Error('이 구매 기록의 변경이 너무 많아요. 백업한 뒤 새 구매 기록을 만들어 주세요.');
  const next = { ...structuredClone(journey), ...structuredClone(changes) };
  if (JOURNEY_DECISIONS.includes(action)) next.decision = action;
  else if (action === 'worn') next.wearCount++;
  else if (!JOURNEY_DETAIL_ACTIONS.includes(action)) next.stage = action;
  next.history.push({ action, at, details: purchaseJourneyDetails(next) });
  return validatePurchaseJourney(next);
}

function upgradePurchaseJourneyV4(journey, { at = new Date().toISOString() } = {}) {
  legacyPurchaseV4.validatePurchaseJourney(journey);
  if (!purchaseInstant(at)) throw new Error('구매 기록의 이전 날짜를 확인해 주세요.');
  const next = {
    ...structuredClone(journey),
    feedback: { fit: null, returnReason: null },
    history: journey.history.map((entry) => ({ ...entry, details: null })),
  };
  // Existing current values are known at import, never at the old action dates.
  // A full log or a future-dated legacy event keeps every value without adding
  // an invented timestamp or discarding a real old event.
  if (next.history.length < MAX_JOURNEY_HISTORY && at >= next.history.at(-1).at)
    next.history.push({ action: 'imported', at, details: purchaseJourneyDetails(next) });
  return validatePurchaseJourney(next);
}

// Receipt stays provisional until the customer explicitly chooses to keep it.
// Inactive records/photos remain intact; a re-receipt reuses the same unit ID.
function inactivePurchaseGarmentIds(state) {
  const journeys = state.journeys || [];
  const active = new Set(journeys.filter((journey) => journey.stage === 'kept').map((journey) => journey.garmentId).filter(Boolean));
  const inactive = new Set(journeys.filter((journey) => ['received', 'returned'].includes(journey.stage) && journey.garmentId && !active.has(journey.garmentId)).map((journey) => journey.garmentId));
  for (const journey of journeys)
    if (journey.replacementConfirmed && journey.replacementGarmentId && journey.history.some((entry) => entry.action === 'kept'))
      inactive.add(journey.replacementGarmentId);
  return inactive;
}
// Existing callers keep the broader inactive-item policy through this alias.
function returnedGarmentIds(state) {
  return inactivePurchaseGarmentIds(state);
}

// ── src/wear-log.js
// What I wore, by date: the user's own record.
//
// One entry is one outfit on one day: the garments worn together, optionally
// the outfit formula it came from and a short note. A garment with no entries
// has no record yet; it is never called "not worn". Entries are kept until the
// user removes them; nothing here deletes history on its own.
const MAX_WEAR_ENTRIES = 1000;
const MAX_WEAR_GARMENTS = 12;
const WEAR_RECENT_DAYS = 7;

const WEAR_KEYS = ['id', 'date', 'garmentIds', 'lookId', 'note', 'at'];

function wearInstant(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}
function wearDateOK(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && value >= '2000-01-01' &&
    Number.isFinite(Date.parse(value)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

function validateWearEntry(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry) ||
      Object.keys(entry).length !== WEAR_KEYS.length || Object.keys(entry).some((key) => !WEAR_KEYS.includes(key)))
    throw new Error('착용 기록 형식을 읽지 못했어요. 원본을 보존했습니다.');
  if (typeof entry.id !== 'string' || !/^w_[A-Za-z0-9_-]{1,64}$/.test(entry.id) ||
      !wearDateOK(entry.date) || !wearInstant(entry.at) ||
      !(entry.lookId === null || (typeof entry.lookId === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(entry.lookId))) ||
      typeof entry.note !== 'string' || entry.note.length > 200 || /[\u0000-\u001f\u007f]/.test(entry.note))
    throw new Error('착용 기록 정보를 확인해 주세요.');
  if (!Array.isArray(entry.garmentIds) || !entry.garmentIds.length || entry.garmentIds.length > MAX_WEAR_GARMENTS ||
      entry.garmentIds.some((id) => typeof id !== 'string' || !id || id.length > 100) ||
      new Set(entry.garmentIds).size !== entry.garmentIds.length)
    throw new Error('착용 기록의 옷 목록을 확인해 주세요.');
  return entry;
}

function validateWears(wears) {
  if (!Array.isArray(wears) || wears.length > MAX_WEAR_ENTRIES)
    throw new Error(`착용 기록은 ${MAX_WEAR_ENTRIES}개까지 보관할 수 있어요. 오래된 기록을 정리해 주세요.`);
  const ids = new Set();
  for (const entry of wears) {
    validateWearEntry(entry);
    if (ids.has(entry.id)) throw new Error('착용 기록 ID가 중복됩니다.');
    ids.add(entry.id);
  }
  return wears;
}

/** This device's calendar date (the wearer's day, not UTC). */
function localDate(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function newWearId() {
  return `w_${crypto.randomUUID()}`;
}
function wearFullError() {
  const error = new Error(`착용 기록이 ${MAX_WEAR_ENTRIES}개라 더 남길 수 없어요. 정리에서 오래된 기록을 지운 뒤 다시 남겨 주세요.`);
  error.code = 'wear-full';
  return error;
}

/**
 * Adds one outfit. The same garments on the same day are recorded once, so a
 * double tap or a retry never creates a second entry.
 */
function addWear(wears, { date, garmentIds, lookId = null, note = '', at = new Date().toISOString(), id = newWearId() }) {
  const ids = [...new Set(garmentIds)];
  const key = [...ids].sort().join('|');
  const same = wears.find((entry) => entry.date === date && [...entry.garmentIds].sort().join('|') === key);
  if (same) return { wears, entry: same, added: false };
  if (wears.length >= MAX_WEAR_ENTRIES) throw wearFullError();
  const entry = validateWearEntry({ id, date, garmentIds: ids, lookId, note: note.trim(), at });
  return { wears: [...wears, entry], entry, added: true };
}

/**
 * "Wore it today" on one garment: adds it to that day's latest outfit, or takes
 * it out again when it is already there (an empty outfit is removed).
 */
function toggleWornOn(wears, garmentId, { date, at = new Date().toISOString(), id = newWearId() }) {
  const holding = wears.filter((entry) => entry.date === date && entry.garmentIds.includes(garmentId));
  if (holding.length) {
    const drop = new Set(holding.map((entry) => entry.id));
    const next = wears.flatMap((entry) => {
      if (!drop.has(entry.id)) return [entry];
      const left = entry.garmentIds.filter((x) => x !== garmentId);
      return left.length ? [{ ...entry, garmentIds: left }] : [];
    });
    return { wears: next, worn: false };
  }
  const sameDay = wears.filter((entry) => entry.date === date && entry.garmentIds.length < MAX_WEAR_GARMENTS);
  if (sameDay.length) {
    const latest = sameDay.reduce((a, b) => (b.at > a.at ? b : a));
    return { wears: wears.map((entry) => entry.id === latest.id ? { ...entry, garmentIds: [...entry.garmentIds, garmentId] } : entry), worn: true };
  }
  return { wears: addWear(wears, { date, garmentIds: [garmentId], at, id }).wears, worn: true };
}

function deleteWear(wears, id) {
  return wears.filter((entry) => entry.id !== id);
}

/** Per garment: how many recorded days and the latest one. */
function wearStats(wears) {
  const stats = new Map();
  for (const entry of wears)
    for (const id of entry.garmentIds) {
      const row = stats.get(id) || { count: 0, last: null, days: new Set() };
      if (!row.days.has(entry.date)) {
        row.days.add(entry.date);
        row.count++;
      }
      if (!row.last || entry.date > row.last) row.last = entry.date;
      stats.set(id, row);
    }
  return new Map([...stats].map(([id, row]) => [id, { count: row.count, last: row.last }]));
}

/** The latest day these garments were all recorded in one outfit, or null. */
function lastWornTogether(wears, garmentIds) {
  if (!garmentIds.length) return null;
  let last = null;
  for (const entry of wears)
    if (garmentIds.every((id) => entry.garmentIds.includes(id)) && (!last || entry.date > last)) last = entry.date;
  return last;
}

function daysBetween(fromDate, toDate) {
  return Math.round((Date.parse(`${toDate}T00:00:00Z`) - Date.parse(`${fromDate}T00:00:00Z`)) / 86400000);
}

/**
 * Ready outfits not recorded together in the last WEAR_RECENT_DAYS come first;
 * the order is otherwise unchanged. Each result says when it was last recorded.
 */
function orderByRecentWear(results, wears, today) {
  const rows = results.map((result, index) => {
    const ids = result.items.filter((row) => row.owned && row.item).map((row) => row.item.id);
    const last = lastWornTogether(wears, ids);
    const recent = !!last && daysBetween(last, today) >= 0 && daysBetween(last, today) < WEAR_RECENT_DAYS;
    return { result: { ...result, lastWorn: last, recentlyWorn: recent }, index, recent };
  });
  return rows.sort((a, b) => Number(a.recent) - Number(b.recent) || a.index - b.index).map((row) => row.result);
}

/** Entries grouped by month, oldest first, for cleanup. */
function wearMonths(wears) {
  const months = new Map();
  for (const entry of wears) {
    const month = entry.date.slice(0, 7);
    const row = months.get(month) || { month, count: 0, ids: [] };
    row.count++;
    row.ids.push(entry.id);
    months.set(month, row);
  }
  return [...months.values()].sort((a, b) => a.month.localeCompare(b.month));
}

// ── src/wardrobe.js






// Schema 7 puts seller notes in the same snapshot as the wardrobe. Older
// snapshots upgrade with an empty list; older apps refuse the new schema so
// they cannot silently discard notes when saving or replacing an account.
const WARDROBE_SCHEMA = 7;

const LEGACY_SLOT_MAP = {
  'm-oxford-white': ['m-oxford', 'white'],
  'm-oxford-blue': ['m-oxford', 'blue'],
  'm-tee-white': ['m-tee', 'white'],
  'm-knit-crew': ['m-knit', 'navy'],
  'm-knit-cable': ['m-cable', 'ivory'],
  'm-denim': ['m-denim-raw', 'indigo'],
  'm-slacks-grey': ['m-slacks', 'grey'],
  'm-slacks-wide': ['m-slacks', 'black'],
  'm-fatigue': ['m-work-pants', 'olive'],
  'm-sneaker-leather': ['m-white-sneaker', 'white'],
  'm-chuck': ['m-canvas', 'ivory'],
  'm-nb': ['m-runner', 'grey'],
  'm-boots': ['m-chelsea', 'brown'],
  'm-barbour': ['m-wax', 'olive'],
  'f-shirt-white': ['f-shirt', 'white'],
  'f-shirt-stripe': ['f-stripe', 'blue'],
  'f-maryjane': ['f-flat', 'black'],
};
const GARMENT_KINDS = [
  ['shirt', '셔츠'],
  ['tee', '티셔츠'],
  ['knit', '니트'],
  ['vest', '베스트·조끼'],
  ['pants', '바지'],
  ['jeans', '청바지'],
  ['jacket', '재킷'],
  ['sneaker', '운동화'],
  ['cardigan', '카디건'],
  ['longtee', '긴팔 티'],
  ['sweat', '맨투맨·후드'],
  ['polo', '폴로 셔츠'],
  ['blazer', '블레이저'],
  ['coat', '코트'],
  ['down', '패딩'],
  ['dress', '원피스'],
  ['skirt', '스커트'],
  ['loafer', '구두·로퍼'],
  ['boot', '부츠'],
  ['bag', '가방'],
  ['cap', '모자'],
  ['beanie', '비니'],
  ['belt', '벨트'],
].map(([id, name]) => ({ id, name }));
// Owning a garment does not depend on whether our shopping catalog carries it.
// All registration paths share these kinds. Gender only changes their display order.
function garmentKindChoices(gender = 'M') {
  const first = gender === 'F' ? ['shirt', 'tee', 'knit', 'dress', 'skirt', 'pants', 'jeans', 'cardigan'] : [];
  return [...GARMENT_KINDS].sort((a, b) => (first.indexOf(a.id) + 1 || 99) - (first.indexOf(b.id) + 1 || 99));
}
function garmentKindName(kind) {
  return GARMENT_KINDS.find((k) => k.id === kind)?.name || '옷';
}
function garmentLabel(item) {
  return item.label || slotForItem(item).name || '내 옷';
}
// A generic garment must not inherit a specific material, pattern or styling tip.
function slotForItem(item) {
  if (SLOT_BY_ID[item.slot] && garmentSlotStatus(item, SLOT_BY_ID[item.slot]) !== 'missing') return SLOT_BY_ID[item.slot];
  const kind = item.kind || 'tee';
  const cat = ['pants', 'jeans', 'skirt'].includes(kind)
    ? 'bottom'
    : ['jacket', 'blazer', 'coat', 'down', 'cardigan'].includes(kind)
      ? 'outer'
      : ['sneaker', 'loafer', 'boot'].includes(kind)
        ? 'shoes'
        : ['bag', 'cap', 'belt', 'beanie'].includes(kind)
          ? 'acc'
          : kind === 'dress'
            ? 'dress'
            : 'top';
  return {
    id: `generic-${item.gender}-${kind}`,
    g: item.gender,
    shape: kind,
    cat,
    name: garmentKindName(kind),
    colors: [],
    tip: '종류를 기준으로 연결했어요. 소재·무늬·핏은 직접 확인해 주세요.',
  };
}
function garmentMatchesSlot(item, slot) {
  return garmentSlotStatus(item, slot) !== 'missing';
}

// A real garment may be owned while its recipe-specific material/type is unknown.
function garmentSlotStatus(item, slot) {
  if (item.gender !== slot.g || (item.slot ? item.slot !== slot.id : item.kind !== slot.shape)) return 'missing';
  // A named color-specific essential needs actual color evidence, even for an explicit legacy slot.
  if (slot.requiredColors) {
    if (!item.color) return 'uncertain';
    if (!slot.requiredColors.includes(item.color)) return 'missing';
  }
  return item.slot ? 'confirmed' : 'uncertain';
}
function wardrobeSlotStatus(items, slot) {
  if (items.some((item) => garmentSlotStatus(item, slot) === 'confirmed')) return 'confirmed';
  return items.some((item) => garmentSlotStatus(item, slot) === 'uncertain') ? 'uncertain' : 'missing';
}
// 기본 예시(클래식)는 engine.exampleCloset 결과를 고정한 것이다. 이 옷만으로 "오늘 뭐 입지?" 코디가 나온다.
// 스타일·성별을 바꾸면 main.js에서 exampleCloset으로 다시 만든다.
const DEMO_SLOTS = {
  M: [
    ['m-rugby', 'navy'],
    ['m-chino', 'beige'],
    ['m-canvas', 'ivory'],
    ['m-vest', 'black'],
    ['m-oxford', 'white'],
    ['m-runner', 'grey'],
  ],
  F: [
    ['f-cardigan', 'grey'],
    ['f-tee', 'white'],
    ['f-denim', 'indigo'],
    ['f-loafer', 'black'],
    ['f-trench', 'beige'],
    ['f-stripe', 'blue'],
  ],
};
function demoGarments(gender = 'M') {
  return DEMO_SLOTS[gender].map(([slot, color], i) =>
    makeGarment({ id: `demo_${gender}_${i}`, slot, color, gender, source: 'demo' }),
  );
}
function newWardrobeState() {
  return {
    schema: WARDROBE_SCHEMA,
    onboarded: true,
    gender: 'M',
    styles: ['classic'],
    brands: [],
    brandOnly: false,
    occasion: null,
    budget: null,
    demo: true,
    demoSelected: demoGarments(),
    garments: [],
    journeys: [],
    wears: [],
    offerRecords: [],
    saved: [],
    hidden: [],
    legacyFingerprint: null,
    legacyBaseline: null,
    legacyDismissed: { owned: [], saved: [] },
  };
}
function makeGarment({
  id = `g_${crypto.randomUUID()}`,
  slot = null,
  kind,
  gender = 'M',
  color = null,
  brand = null,
  productId = null,
  photoId = null,
  label = '',
  source = 'user',
  photoMissing = false,
  createdAt = new Date().toISOString(),
}) {
  return {
    id,
    slot,
    kind: kind || SLOT_BY_ID[slot]?.shape,
    gender,
    color,
    brand,
    productId,
    photoId,
    label: label.trim().slice(0, 80),
    source,
    photoMissing,
    createdAt,
  };
}
function wardrobeView(record, tab = 'home') {
  const state = upgradeWardrobe(record);
  const returned = returnedGarmentIds(state);
  return { ...state, closet: state.demo ? state.demoSelected : state.garments.filter((garment) => !returned.has(garment.id)), tab };
}
function storedWardrobe(state) {
  const { closet, tab, ...rest } = state;
  const record = structuredClone(rest);
  validateWardrobe(record);
  return record;
}
function assertWardrobeKeys(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some((k) => !keys.includes(k)))
    throw new Error('지원하지 않는 옷장 형식입니다. 원본을 보존했습니다.');
}
const productIdOK = (id) => typeof id === 'string' && /^ms-\d+$/.test(id);
function validateGarment(item, demo = false) {
  assertWardrobeKeys(item, [
    'id',
    'slot',
    'kind',
    'gender',
    'color',
    'brand',
    'productId',
    'photoId',
    'label',
    'source',
    'photoMissing',
    'createdAt',
  ]);
  if (
    typeof item.id !== 'string' ||
    !/^[-\w]{1,100}$/.test(item.id) ||
    !['M', 'F'].includes(item.gender) ||
    (!GARMENT_KINDS.some((k) => k.id === item.kind) && !SLOTS.some((s) => s.shape === item.kind))
  )
    throw new Error('옷 식별 정보가 올바르지 않습니다.');
  if (!(item.slot === null || (SLOT_BY_ID[item.slot]?.g === item.gender && SLOT_BY_ID[item.slot]?.shape === item.kind)))
    throw new Error('알 수 없는 옷 종류입니다. 원본을 보존했습니다.');
  if (typeof item.photoMissing !== 'boolean') throw new Error('사진 상태가 올바르지 않습니다.');
  if (
    !(item.color === null || Object.hasOwn(COLORS, item.color)) ||
    !(item.brand === null || (typeof item.brand === 'string' && item.brand.length <= 120)) ||
    !(item.productId === null || productIdOK(item.productId))
  )
    throw new Error('옷 색·브랜드·상품 정보를 확인해 주세요.');
  if (
    !(item.photoId === null || (typeof item.photoId === 'string' && /^p_[a-f0-9]{64}$/.test(item.photoId))) ||
    typeof item.label !== 'string' ||
    item.label.length > 80 ||
    !['user', 'legacy', ...(demo ? ['demo'] : [])].includes(item.source) ||
    typeof item.createdAt !== 'string' ||
    !Number.isFinite(Date.parse(item.createdAt))
  )
    throw new Error('옷 상세 정보를 확인해 주세요.');
}
function validateWardrobe(record) {
  if (record?.schema === 2) return legacyWardrobeV2.validateWardrobe(record);
  assertWardrobeKeys(record, [
    'schema',
    'onboarded',
    'gender',
    'styles',
    'brands',
    'brandOnly',
    'occasion',
    'budget',
    'demo',
    'demoSelected',
    'garments',
    'saved',
    'hidden',
    'legacyFingerprint',
    'legacyBaseline',
    'legacyDismissed',
    ...([4, 5, 6, 7].includes(record?.schema) ? ['journeys'] : []),
    ...([6, 7].includes(record?.schema) ? ['wears'] : []),
    ...(record?.schema === 7 ? ['offerRecords'] : []),
  ]);
  if (
    ![3, 4, 5, 6, 7].includes(record.schema) ||
    typeof record.onboarded !== 'boolean' ||
    !['M', 'F', null].includes(record.gender) ||
    typeof record.demo !== 'boolean' ||
    typeof record.brandOnly !== 'boolean'
  )
    throw new Error('옷장 버전을 읽지 못했습니다. 원본을 보존했습니다.');
  if (
    !Array.isArray(record.styles) ||
    record.styles.length > 3 ||
    record.styles.some((k) => !STYLES[k]) ||
    (record.onboarded && (!record.gender || !record.styles.length))
  )
    throw new Error('스타일을 읽지 못했습니다.');
  if (
    !Array.isArray(record.brands) ||
    record.brands.some((b) => typeof b !== 'string' || b.length > 120) ||
    !(record.occasion === null || OCCASIONS[record.occasion]) ||
    !(record.budget === null || (Number.isFinite(record.budget) && record.budget >= 0))
  )
    throw new Error('취향을 읽지 못했습니다.');
  for (const key of ['saved', 'hidden'])
    if (!Array.isArray(record[key]) || record[key].some((id) => !productIdOK(id)))
      throw new Error('저장된 상품 목록이 올바르지 않습니다.');
  if (
    !(
      record.legacyFingerprint === null ||
      (typeof record.legacyFingerprint === 'string' && /^[a-f0-9]{64}$/.test(record.legacyFingerprint))
    )
  )
    throw new Error('이전 기록의 확인 정보가 올바르지 않습니다.');
  for (const value of [record.legacyBaseline, record.legacyDismissed])
    if (value !== null) {
      assertWardrobeKeys(value, ['owned', 'saved']);
      if (
        !Array.isArray(value.owned) ||
        value.owned.some((id) => typeof id !== 'string' || id.length > 100) ||
        !Array.isArray(value.saved) ||
        value.saved.some((id) => !productIdOK(id))
      )
        throw new Error('이전 기록 비교 기준이 올바르지 않습니다.');
    }
  if (!record.legacyDismissed) throw new Error('삭제 보존 기록이 빠졌습니다.');
  for (const key of ['garments', 'demoSelected']) {
    if (!Array.isArray(record[key]) || record[key].length > 200)
      throw new Error('옷장은 최대 200벌까지 보관할 수 있어요.');
    const ids = new Set();
    for (const item of record[key]) {
      validateGarment(item, key === 'demoSelected');
      if (ids.has(item.id)) throw new Error('옷 ID가 중복됩니다.');
      ids.add(item.id);
    }
  }
  if (record.demo && record.garments.length) throw new Error('예시와 개인 옷을 섞을 수 없습니다.');
  if ([6, 7].includes(record.schema)) {
    validateWears(record.wears);
    if (record.demo && record.wears.length) throw new Error('예시 옷에는 착용 기록을 남기지 않아요.');
  }
  if (record.schema === 7) validateOfferRecords(record.offerRecords);
  if ([4, 5, 6, 7].includes(record.schema)) {
    if (!Array.isArray(record.journeys) || record.journeys.length > MAX_PURCHASE_JOURNEYS)
      throw new Error('구매 기록은 최대 200개까지 보관할 수 있어요.');
    const ids = new Set();
    for (const journey of record.journeys) {
      if (record.schema === 4) legacyPurchaseV4.validatePurchaseJourney(journey);
      else validatePurchaseJourney(journey);
      if (ids.has(journey.id)) throw new Error('구매 기록 ID가 중복됩니다.');
      ids.add(journey.id);
    }
    // Older formats retain their published limit; the extra 18 bytes are only
    // for schema 7's required empty seller-note list during a lossless upgrade.
    const byteLimit = record.schema < 7 ? 850000 : MAX_WARDROBE_STATE_BYTES;
    if (new TextEncoder().encode(JSON.stringify(record)).length > byteLimit)
      throw new Error('기록 정보가 너무 큽니다. 백업 후 필요 없는 기록을 정리해 주세요. 원본을 보존했습니다.');
  }
  return record;
}
function upgradeWardrobe(record, { at = new Date().toISOString() } = {}) {
  validateWardrobe(record);
  if (record.schema === 7) return structuredClone(record);
  if (record.schema === 6) return validateWardrobe({ ...structuredClone(record), schema: 7, offerRecords: [] });
  if (record.schema === 5) return validateWardrobe({ ...structuredClone(record), schema: 7, wears: [], offerRecords: [] });
  if (record.schema === 4)
    return validateWardrobe({ ...structuredClone(record), schema: 7,
      journeys: record.journeys.map((journey) => upgradePurchaseJourneyV4(journey, { at })), wears: [], offerRecords: [] });
  if (record.schema === 3)
    return validateWardrobe({ ...structuredClone(record), schema: 7, journeys: [], wears: [], offerRecords: [] });
  const mapItem = (g) => {
    const [slot, color] = g.slotId ? LEGACY_SLOT_MAP[g.slotId] || [g.slotId, null] : [null, null];
    return makeGarment({
      id: g.id,
      slot,
      kind: slot ? SLOT_BY_ID[slot]?.shape : g.kind,
      gender: g.gender,
      color,
      photoId: g.photoId,
      label: g.label,
      source: g.source === 'demo' ? 'demo' : g.source,
      createdAt: g.createdAt,
    });
  };
  const oldDemo = record.demoSelected.map((id) => {
    const s = legacyWardrobeV2.SLOTS.find((s) => s.id === id);
    return mapItem({
      id: `demo_${id}`,
      slotId: id,
      kind: s?.shape,
      gender: s?.g,
      photoId: null,
      label: '',
      source: 'demo',
      createdAt: '2026-10-14T00:00:00.000Z',
    });
  });
  const ownedIds = (ids) => ids.map((id) => (id.startsWith('legacy_') ? id : `legacy_${id}`));
  const result = {
    ...newWardrobeState(),
    onboarded: record.onboarded,
    gender: record.gender,
    styles: record.style ? [record.style === 'casual' && record.gender === 'M' ? 'cityboy' : record.style] : [],
    occasion: record.occasion,
    budget: record.budget,
    demo: record.demo,
    demoSelected: oldDemo,
    garments: record.garments.map(mapItem),
    saved: record.saved,
    hidden: record.hidden,
    legacyFingerprint: record.legacyFingerprint,
    legacyBaseline: record.legacyBaseline
      ? { owned: ownedIds(record.legacyBaseline.owned), saved: record.legacyBaseline.saved }
      : null,
    legacyDismissed: {
      owned: ownedIds(record.legacyDismissed?.owned || []),
      saved: record.legacyDismissed?.saved || [],
    },
  };
  return validateWardrobe(result);
}
// Conversion is pure. Photo data is read separately and attached before a single commit.
function migrateLegacyWardrobe(raw) {
  if (raw === null) return newWardrobeState();
  const old = JSON.parse(raw);
  if (old?.v !== 2) return upgradeWardrobe(legacyWardrobeV2.migrateLegacyWardrobe(raw));
  assertWardrobeKeys(old, [
    'v',
    'onboarded',
    'gender',
    'styles',
    'brands',
    'brandOnly',
    'occasion',
    'budget',
    'closet',
    'saved',
    'hidden',
    'tab',
    'demo',
  ]);
  if (!Array.isArray(old.closet)) throw new Error('이전 옷장을 읽지 못했습니다.');
  const garments = old.closet.map((item) => {
    assertWardrobeKeys(item, ['id', 'slot', 'color', 'brand', 'productId', 'photo', 'addedAt']);
    if (Object.hasOwn(item, 'photo') && typeof item.photo !== 'boolean')
      throw new Error('이전 사진 상태를 읽지 못했습니다.');
    if (!SLOT_BY_ID[item.slot]) throw new Error('이전 옷 종류를 확인할 수 없습니다. 원본을 보존했습니다.');
    return makeGarment({
      id: item.id,
      slot: item.slot,
      gender: SLOT_BY_ID[item.slot].g,
      color: item.color ?? null,
      brand: item.brand ?? null,
      productId: item.productId ?? null,
      photoMissing: !!item.photo,
      source: 'legacy',
      createdAt: Number.isFinite(item.addedAt) ? new Date(item.addedAt).toISOString() : '2026-10-14T00:00:00.000Z',
    });
  });
  const result = {
    ...newWardrobeState(),
    onboarded: old.onboarded ?? false,
    gender: old.gender ?? null,
    styles: old.styles ?? [],
    brands: old.brands ?? [],
    brandOnly: old.brandOnly ?? false,
    occasion: old.occasion ?? null,
    budget: old.budget ?? null,
    demo: false,
    demoSelected: [],
    garments,
    saved: old.saved ?? [],
    hidden: old.hidden ?? [],
    legacyBaseline: { owned: garments.map((i) => i.id), saved: old.saved ?? [] },
  };
  return validateWardrobe(result);
}

// ── src/outfit-copy.js


// Recipe names describe an example. The visible copy describes the garments actually selected.
function outfitCopy(result, { demo = false } = {}) {
  const rows = (result?.items || []).filter((row) => row && (row.slot || row.item));
  const kind = (row) => garmentKindName(row.item?.kind || row.slot?.shape);
  const main = rows.filter((row) => !['acc', 'inner'].includes(row.role));
  const title = result?.basic ? result.look.title
    : [...new Set((main.length ? main : rows).map(kind))].join(' · ') || '옷 조합';
  const labels = rows.map((row) => {
    // The engine leaves unverified photo colours empty. Do not recover them from the product.
    const color = row.certainty !== 'uncertain' && row.color && COLORS[row.color]?.label;
    const name = row.item?.label || kind(row);
    const owner = row.owned ? (demo ? '예시' : '내') : '후보';
    return `${owner} ${[color, name].filter(Boolean).join(' ')}${row.certainty === 'uncertain' ? '(종류 확인 필요)' : ''}`;
  });
  return { title, note: labels.length ? `${labels.join(' · ')} 조합이에요.` : '구성 옷을 확인해 주세요.' };
}

// ── src/search-follow-up.js
// Follow-ups keep the original request. A higher price is never evidence of quality.
function resolveSearchFollowUp(previousQuery, text) {
  if (typeof previousQuery !== 'string' || !previousQuery.trim() || typeof text !== 'string') return null;
  const match = text.match(/^\s*(?:좀\s*)?더\s*(싼|저렴한|저렴하게|싸게|비싼|비싸게|좋은|나은|괜찮은)\s*(?:걸로|거|것|거로|걸|건)?\s*(?:없어|있어|보여\s*줘|줘|요)?[?.!]*\s*$/);
  if (!match) return null;
  const said = text.trim();
  if (['좋은', '나은', '괜찮은'].includes(match[1])) {
    return { query: previousQuery, follow: {
      said, clarification: '소재·마감·착용감을 비교할 자료가 부족해 어느 상품이 더 좋은지 판단하지 못했어요. 기존 조건과 순서는 유지했어요.',
    } };
  }
  const order = /비싼|비싸게/.test(match[1]) ? '높은 가격순' : '낮은 가격순';
  const base = previousQuery.replace(/\s*(?:낮은 가격순|높은 가격순)\s*$/, '').trim();
  return { query: `${base} ${order}`, follow: { said, order } };
}

// ── src/query.js
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

function priceBounds(text) {
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
      `${AMOUNT}\\s*(넘지\\s*않는|안\\s*넘는|넘(?:는|어|을|으면|게)?|이상|이하|미만|초과|대|까지|부터|이내)?`,
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

function parseQuery(raw = '', { brands = [] } = {}) {
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

// ── src/engine.js
// 추천 엔진: 스타일·상황·계절·예산·선호 브랜드·내 옷장으로 실제 상품과 코디를 고른다.
// 같은 입력이면 같은 결과가 나오는 규칙 기반 계산이며, 개인 정보는 이 기기 밖으로 나가지 않는다.








const SAFE_PRODUCTS = PRODUCTS.filter(productEligible);

const SEASON_LABEL = { spring: '봄', summer: '여름', fall: '가을', winter: '겨울' };

function seasonOf(date = new Date()) {
  const m = date.getMonth() + 1;
  if (m >= 3 && m <= 5) return 'spring';
  if (m >= 6 && m <= 8) return 'summer';
  if (m >= 9 && m <= 11) return 'fall';
  return 'winter';
}

// 받침 여부로 조사를 고른다: 치노와 / 재킷과
function josa(word, withFinal, withoutFinal) {
  const ch = String(word).trim().slice(-1);
  const code = ch.charCodeAt(0) - 0xac00;
  if (code < 0 || code > 11171) return withoutFinal;
  return code % 28 ? withFinal : withoutFinal;
}

function formatPrice(n) {
  return `${n.toLocaleString('ko-KR')}원`;
}

const PRODUCTS_BY_SLOT = SAFE_PRODUCTS.reduce((acc, p) => {
  (acc[p.slot] ||= []).push(p);
  return acc;
}, {});
const PRODUCT_BY_ID = Object.fromEntries(PRODUCTS.map((p) => [p.id, p]));

// 브랜드 목록: 성별마다 상품 수가 많은 순서
function brandsFor(gender) {
  const counts = {};
  for (const p of SAFE_PRODUCTS) if (SLOT_BY_ID[p.slot].g === gender) counts[p.brand] = (counts[p.brand] || 0) + 1;
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));
}

// 브랜드가 어떤 스타일에 가까운지: 그 브랜드 상품들이 속한 아이템 종류의 스타일 점수 평균
function brandStyleAffinity(brand, gender, style) {
  const list = SAFE_PRODUCTS.filter((p) => p.brand === brand && SLOT_BY_ID[p.slot].g === gender);
  if (!list.length) return 0;
  return list.reduce((s, p) => s + (SLOT_BY_ID[p.slot].style[style] || 0), 0) / list.length;
}

function quality(p) {
  const rating = p.rating ?? 4.4;
  return rating * Math.log10((p.reviews || 0) + (p.likes || 0) / 8 + 10);
}

const light = (c) => COLORS[c]?.light ?? 50;

// 색 조화: 포인트 색은 하나까지, 상·하의는 밝기 차이가 있을 때 정돈돼 보인다
function harmony(entries, { tonal = false } = {}) {
  const colors = entries.map((e) => e.color).filter(Boolean);
  let score = 0;
  const accents = colors.filter((c) => COLORS[c] && !COLORS[c].neutral).length;
  score -= Math.max(0, accents - 1) * 2;
  const top = entries.find((e) => e.cat === 'top' || e.cat === 'dress');
  const bottom = entries.find((e) => e.cat === 'bottom');
  if (top?.color && bottom?.color) {
    const d = Math.abs(light(top.color) - light(bottom.color));
    if (!tonal && d >= 25) score += 1;
    if (!tonal && top.color === bottom.color && top.color !== 'indigo') score -= 1;
    if (tonal && d < 25) score += 0.5;
  }
  return score;
}

function ctx(state) {
  const gender = state.gender || 'M';
  const inactivePurchaseItems = inactivePurchaseGarmentIds(state);
  const styles = (state.styles?.length ? state.styles : [state.style || 'classic']).filter((s) =>
    STYLES[s]?.g.includes(gender),
  );
  const closet = (state.closet || [])
    .map((i) => ({ ...i, gender: i.gender || SLOT_BY_ID[i.slot]?.g }))
    .filter((i) => i.gender === gender && !inactivePurchaseItems.has(i.id));
  const activeGarmentIds = new Set(closet
    .filter((item) => ['user', 'legacy'].includes(item.source) && !String(item.id).startsWith('demo_'))
    .map((item) => item.id));
  // An order/receipt is a reason to pause another purchase of the same type,
  // not proof of an owned garment. It never enters closet or fills a look.
  const pendingSlots = new Set((state.journeys || [])
    .filter((journey) => ['ordered', 'received'].includes(journey.stage) &&
      journey.candidate?.gender?.toUpperCase() === gender)
    .flatMap((journey) => {
      const candidate = journey.candidate;
      const knownColor = evidenceColor(candidate);
      return SLOTS.filter((slot) => slot.g === gender &&
        slot.shape === candidate.kind &&
        (!slot.requiredColors || slot.requiredColors.includes(knownColor)))
        .map((slot) => slot.id);
    }));
  // An unlinked "I have something similar" answer belongs to that candidate's
  // comparison. Only an active actual garment link can affect other home or
  // automatic outfit purchases; the answer itself never creates an owned role.
  const ownershipCheckSlots = new Set((state.journeys || [])
    .filter((journey) => {
      if (journey.absence !== 'present' || journey.candidate?.gender?.toUpperCase() !== gender) return false;
      const linkedIds = new Set([
        ...(journey.relatedGarmentIds || []),
        ...(journey.replacementGarmentId ? [journey.replacementGarmentId] : []),
      ]);
      // Missing, demo, retired and returned records cannot establish current
      // ownership for another candidate. Keep the journey answer unchanged.
      return [...linkedIds].some((id) => activeGarmentIds.has(id));
    })
    .flatMap((journey) => {
      const candidate = journey.candidate;
      const knownColor = evidenceColor(candidate);
      return SLOTS.filter((slot) => slot.g === gender && slot.shape === candidate.kind &&
        (!slot.requiredColors || slot.requiredColors.includes(knownColor)) &&
        wardrobeSlotStatus(closet, slot) !== 'confirmed').map((slot) => slot.id);
    }));
  return {
    gender,
    styles: styles.length ? styles : [gender === 'F' ? 'classic' : 'classic'],
    occasion: state.occasion || null,
    season: state.season || seasonOf(state.now ? new Date(state.now) : new Date()),
    maxPrice: state.budget ?? null,
    minPrice: state.minPrice ?? null,
    minPriceExclusive: !!state.minPriceExclusive,
    maxPriceExclusive: !!state.maxPriceExclusive,
    closet,
    pendingSlots,
    ownershipCheckSlots,
    ownedSlots: new Set([
      ...SLOTS.filter((s) => wardrobeSlotStatus(closet, s) === 'confirmed').map((s) => s.id),
      ...(state.owned || []),
    ]),
    brands: new Set(state.brands || []),
    brandOnly: !!state.brandOnly && (state.brands || []).length > 0,
    hidden: new Set(state.hidden || []),
  };
}

function styleScore(slot, styles) {
  let best = 0;
  styles.forEach((s, i) => {
    best = Math.max(best, (slot.style[s] || 0) * (i === 0 ? 1 : 0.85));
  });
  return best;
}

function productsFor(
  slotId,
  {
    maxPrice = null,
    minPrice = null,
    minPriceExclusive = false,
    maxPriceExclusive = false,
    hidden = new Set(),
    color = null,
    brands = new Set(),
    brandOnly = false,
    season = null,
    brand = null,
  } = {},
) {
  const hide = hidden instanceof Set ? hidden : new Set(hidden);
  return (PRODUCTS_BY_SLOT[slotId] || [])
    .filter(
      (p) =>
        !hide.has(p.id) &&
        (maxPrice === null || (maxPriceExclusive ? p.price < maxPrice : p.price <= maxPrice)) &&
        (minPrice === null || (minPriceExclusive ? p.price > minPrice : p.price >= minPrice)) &&
        (!color || evidenceColor(p) === color) &&
        (!brand || p.brand === brand) &&
        (!brandOnly || brands.has(p.brand)) &&
        (!season || season === 'summer' || !p.summer),
    )
    .sort((a, b) => brands.has(b.brand) - brands.has(a.brand) || functional(a) - functional(b) || quality(b) - quality(a) || a.price - b.price);
}
// 러닝 안정화·키높이처럼 기능성 표기가 있는 상품은 스타일 추천에서 뒤로 보낸다(제외하지는 않는다).
const functional = (p) => (productTraits(p).some((t) => t.kind === 'functional') ? 1 : 0);
// 카드 이유: 종류 고정 설명이 상품명과 어긋나면(짧은 코트 자리의 롱 코트) 상품명 기준 줄로 바꾼다.
function productReasons(product, slot, reasons) {
  const traits = productTraits(product);
  const traitLine = traits.length ? `상품명 기준: ${traits.map((t) => t.label).join(' · ')}` : '';
  const fixed = reasons.map((r) => (r === slot.why && whyConflicts(slot.why, traits) ? traitLine : r)).filter(Boolean);
  return { reasons: [...new Set(fixed)], traitLine, traits };
}

// 상품명에 편하게 입는 표기가 있으면 1, 뻣뻣하다는 표기면 -1. 착용감을 보장하지 않는다.
function comfortMark(p) {
  const name = `${p.name}`;
  if (/생지|리지드|rigid|셀비지|selvedge|raw/i.test(name)) return -1;
  return /밴딩|이지|easy|조거|스웨트|릴렉스|relax|와이드|wide|원턱/i.test(name) ? 1 : 0;
}

// 검색 조건(search().criteria)에 상품이 맞는지. 종류는 보지 않는다(상세의 같은 종류 대안에 쓴다).
function meetsCriteria(p, cr) {
  if (!cr) return true;
  const { maxPrice = null, minPrice = null, minPriceExclusive = false, maxPriceExclusive = false } = cr;
  if (maxPrice !== null && maxPrice !== undefined && (maxPriceExclusive ? p.price >= maxPrice : p.price > maxPrice)) return false;
  if (minPrice !== null && minPrice !== undefined && (minPriceExclusive ? p.price <= minPrice : p.price < minPrice)) return false;
  if (cr.color && evidenceColor(p) !== cr.color) return false;
  if (cr.brand && p.brand !== cr.brand) return false;
  if (cr.hoodOnly && !/후드|후디|hood/i.test(p.name)) return false;
  if ((cr.excludeColors || []).includes(p.color)) return false;
  if (cr.tone) {
    const l = COLORS[p.color]?.light;
    if (!Number.isFinite(l) || (cr.tone === 'light' ? l < 60 : l > 40)) return false;
  }
  return true;
}

const wonLabel = (n) => (n % 10000 === 0 ? `${n / 10000}만원` : `${n.toLocaleString('ko-KR')}원`);
// 검색 조건을 한 줄로: "10만원 이하 · 블랙 제외 · 밝은 색"
// 상품 하나에 거는 조건만(가격·색·뺀 색·브랜드). 같은 종류의 대안을 걸러낼 때 쓴다.
function productCriteria(cr) {
  if (!cr) return null;
  const { occasion, occasionFromQuery, season, style, styles, excludedItems, excludeSlot, slotIds, ...rest } = cr;
  return rest;
}
function criteriaLine(cr) {
  if (!cr) return '';
  const SEASONS = { spring: '봄', summer: '여름', fall: '가을', winter: '겨울' };
  return [
    cr.occasion ? OCCASIONS[cr.occasion] || '' : '',
    cr.season ? SEASONS[cr.season] || '' : '',
    cr.style ? STYLES[cr.style]?.label || '' : '',
    ...(cr.excludedItems || []).map((x) => `${x} 제외`),
    cr.minPrice != null ? `${wonLabel(cr.minPrice)} ${cr.minPriceExclusive ? '초과' : '이상'}` : '',
    cr.maxPrice != null ? `${wonLabel(cr.maxPrice)} ${cr.maxPriceExclusive ? '미만' : '이하'}` : '',
    cr.color ? COLORS[cr.color]?.label || '' : '',
    ...(cr.excludeColors || []).map((c) => `${COLORS[c]?.label || c} 제외`),
    cr.tone ? (cr.tone === 'light' ? '밝은 색' : '어두운 색') : '',
    cr.brand || '',
  ].filter(Boolean).join(' · ');
}

function productOpts(c, extra = {}) {
  return {
    maxPrice: c.maxPrice,
    minPrice: c.minPrice,
    minPriceExclusive: c.minPriceExclusive,
    maxPriceExclusive: c.maxPriceExclusive,
    hidden: c.hidden,
    brands: c.brands,
    brandOnly: c.brandOnly,
    season: c.season,
    ...extra,
  };
}

function roleOf(look, role) {
  const r = look.roles[role];
  if (!r) return null;
  return Array.isArray(r) ? { s: r, c: [] } : r;
}

function slotsInLook(look) {
  return ROLE_ORDER.flatMap((r) => roleOf(look, r)?.s || []);
}
// The wardrobe plan reuses the same formula slots and purchase exclusions as recommendations.
function formulaSlots(look) {
  return slotsInLook(look);
}
function recommendationContext(state) {
  return ctx(state);
}

function matchingLooks(c, { occasion = c.occasion, anySeason = false } = {}) {
  return LOOKS.filter(
    (l) =>
      l.g === c.gender &&
      l.styles.some((s) => c.styles.includes(s)) &&
      (anySeason || l.seasons.includes(c.season)) &&
      (!occasion || l.occ.includes(occasion)),
  );
}

const SHORT = {
  'm-oxford': '옥스퍼드 셔츠',
  'm-chambray': '데님 셔츠',
  'm-flannel': '체크 셔츠',
  'm-tee': '티셔츠',
  'm-longtee': '긴팔 티',
  'm-denim-raw': '생지 데님',
  'm-denim': '청바지',
  'm-chino': '치노',
  'm-slacks': '슬랙스',
  'm-work-pants': '워크 팬츠',
  'm-knit': '니트',
  'm-cable': '케이블 니트',
  'm-loafer': '로퍼',
  'm-derby': '구두',
  'm-workboots': '워크부츠',
  'm-chelsea': '첼시 부츠',
  'm-white-sneaker': '흰 스니커즈',
  'm-canvas': '캔버스화',
  'm-runner': '운동화',
  'm-trail': '트레일 슈즈',
  'm-trucker': '데님 재킷',
  'm-chore': '워크 재킷',
  'm-field': '필드 재킷',
  'm-harrington': '블루종',
  'm-sweat': '맨투맨',
  'm-hoodie': '후드',
  'f-shirt': '셔츠',
  'f-denim': '청바지',
  'f-slacks': '슬랙스',
  'f-knit': '니트',
  'f-jacket': '데님 재킷',
  'f-flat': '플랫',
};
function shortName(slot) {
  return SHORT[slot.id] || slot.name.split('·')[0];
}

// 한 아이템 종류의 점수와 이유
function scoreSlot(slot, c, looks = matchingLooks(c)) {
  const st = styleScore(slot, c.styles);
  let score = st * 2;
  const reasons = [];
  const inSeason = slot.seasons.includes(c.season);
  score += inSeason ? 2 : -6;
  if (c.occasion) score += slot.occ.includes(c.occasion) ? 2.5 : -2;

  const pairs = new Map();
  let lookCount = 0;
  for (const look of looks) {
    const ids = slotsInLook(look);
    if (!ids.includes(slot.id)) continue;
    lookCount += 1;
    for (const item of c.closet)
      if (
        ids.some((id) => id !== slot.id && SLOT_BY_ID[id].cat !== slot.cat && garmentMatchesSlot(item, SLOT_BY_ID[id]))
      )
        pairs.set(item.id, item);
  }
  score += Math.min(lookCount, 3);
  score += Math.min(pairs.size, 4) * 1.5;

  if (pairs.size) {
    const names = [...pairs.values()].slice(0, 2).map(garmentLabel);
    const last = names[names.length - 1];
    reasons.push(`가진 ${names.join('·')}${josa(last, '과', '와')} 함께 쓰는 코디 공식이 있어요`);
  }
  const top = c.styles.find((s) => slot.style[s] === 3);
  if (top) reasons.push(`${STYLES[top].label} 옷장의 기본이에요`);
  if (c.occasion && slot.occ.includes(c.occasion)) reasons.push(`${OCCASIONS[c.occasion]}에 잘 맞아요`);
  return { score, reasons, pairs: [...pairs.keys()], inSeason };
}

const CAT_LIMIT = { acc: 1 };

// 지금 사면 좋은 아이템
function recommendItems(state, { limit = 8 } = {}) {
  const c = ctx(state);
  const looks = matchingLooks(c);
  const purchaseExcludedSlots = new Set([...c.ownedSlots, ...c.pendingSlots, ...c.ownershipCheckSlots,
    ...c.closet.filter((i) => realOwned(i) && i.slot).flatMap((i) => nearSame(i.slot))]);
  const ranked = SLOTS.filter((s) => s.g === c.gender && !purchaseExcludedSlots.has(s.id))
    .map((slot) => ({ slot, ...scoreSlot(slot, c, looks) }))
    .filter((r) => r.inSeason && r.score > 3)
    .sort((a, b) => b.score - a.score);

  const out = [];
  const perCat = {};
  const perBrand = {};
  for (const r of ranked) {
    const products = productsFor(r.slot.id, productOpts(c));
    if (!products.length) continue;
    if ((perCat[r.slot.cat] || 0) >= (CAT_LIMIT[r.slot.cat] ?? 2)) continue;
    perCat[r.slot.cat] = (perCat[r.slot.cat] || 0) + 1;
    // 선호 브랜드가 없으면 한 브랜드가 목록을 채우지 않도록 두 번까지만 먼저 고른다
    const product = c.brands.size ? products[0] : products.find((p) => (perBrand[p.brand] || 0) < 2) || products[0];
    perBrand[product.brand] = (perBrand[product.brand] || 0) + 1;
    const pair = r.reasons.find((x) => x.startsWith('가진 '));
    const reasons = pair ? [pair, r.slot.why] : [r.slot.why, ...r.reasons];
    const ownership = wardrobeSlotStatus(c.closet, r.slot);
    out.push({
      slot: r.slot,
      product,
      alternatives: products.filter((p) => p !== product).slice(0, 6),
      score: r.score,
      ownership,
      reasons:
        ownership === 'uncertain'
          ? [`비슷한 종류가 있어요. ${shortName(r.slot)}인지 먼저 확인해요`, ...reasons].slice(0, 2)
          : reasons.slice(0, 2),
    });
    if (out.length >= limit) break;
  }
  return out;
}

// 세부 종류만 다르고 사실상 같은 옷(예: 생지 데님과 워시드 데님). 하나를 가졌으면 다른 하나를 사라고 하지 않고 가진 옷으로 채운다.
const NEAR_SAME = [['m-denim', 'm-denim-raw']];
const nearSame = (slotId) => NEAR_SAME.find((group) => group.includes(slotId))?.filter((id) => id !== slotId) || [];
const realOwned = (i) => ['user', 'legacy'].includes(i.source) && !String(i.id).startsWith('demo_');

// 코디 공식의 역할을 가진 옷과 상품으로 채운다
// ownedOnly: 가진 옷만으로, maxBuy: 새로 살 아이템 수 한도.
// Search anchors only select formulas; they never create an owned garment.
function fillLook(
  look,
  c,
  {
    forceOwned = new Set(),
    ownedOnly = false,
    maxBuy = Infinity,
    anchorItem = null,
    pinnedProduct = null,
    anchorColor = null,
    allowPendingPurchases = false,
    requestedPurchaseSlots = null,
    excludeSlot = null,
  } = {},
) {
  const items = [],
    used = new Set();
  const tonal = c.styles[0] === 'minimal' || look.styles[0] === 'minimal';
  let buys = 0;
  for (const role of ROLE_ORDER) {
    const r = roleOf(look, role);
    if (!r) continue;
    const optional = role === 'acc' || (role === 'inner' && ownedOnly);
    const anchorChoices = r.s.filter((id) => forceOwned.has(id));
    let candidates =
      anchorChoices.length && !items.some((i) => anchorChoices.includes(i.slot.id)) ? anchorChoices : r.s;
    // 검색에서 뺀 종류는 이 역할의 후보에서도 뺀다. 그 역할을 채울 종류가 없으면 이 공식은 쓰지 않는다.
    if (excludeSlot) {
      candidates = candidates.filter((id) => !excludeSlot(SLOT_BY_ID[id]));
      if (!candidates.length && !optional) return null;
      if (!candidates.length) continue;
    }
    const inSeason = candidates.filter((id) => SLOT_BY_ID[id].seasons.includes(c.season));
    const current = items.map((i) => ({ color: i.color, cat: i.slot.cat }));

    // 1) 기준 아이템 · 가진 옷
    if (pinnedProduct && candidates.includes(pinnedProduct.slot)) {
      const ownedPin = c.closet.find(
        (i) => i.productId === pinnedProduct.id && (!anchorColor || i.color === anchorColor),
      );
      if (ownedPin) {
        const slot = SLOT_BY_ID[pinnedProduct.slot];
        const certainty = garmentSlotStatus(ownedPin, slot);
        if (used.has(ownedPin.id) || certainty === 'missing' || (ownedOnly && certainty !== 'confirmed')) return null;
        items.push({ role, slot, owned: true, item: ownedPin, color: ownedPin.color, certainty });
        used.add(ownedPin.id);
        continue;
      }
      if (ownedOnly || buys >= maxBuy) return null;
      items.push({
        role,
        slot: SLOT_BY_ID[pinnedProduct.slot],
        owned: false,
        product: pinnedProduct,
        color: evidenceColor(pinnedProduct),
      });
      buys++;
      continue;
    }
    if (
      anchorItem &&
      !used.has(anchorItem.id) &&
      candidates.some((id) => garmentMatchesSlot(anchorItem, SLOT_BY_ID[id]))
    ) {
      const id = candidates.find((id) => garmentMatchesSlot(anchorItem, SLOT_BY_ID[id]));
      const certainty = garmentSlotStatus(anchorItem, SLOT_BY_ID[id]);
      if (ownedOnly && certainty !== 'confirmed') return null;
      items.push({ role, slot: SLOT_BY_ID[id], owned: true, item: anchorItem, color: anchorItem.color, certainty });
      used.add(anchorItem.id);
      continue;
    }
    const ownedItems = c.closet
      .filter(
        (i) =>
          !used.has(i.id) &&
          candidates.some(
            (id) =>
              garmentMatchesSlot(i, SLOT_BY_ID[id]) &&
              (!ownedOnly || garmentSlotStatus(i, SLOT_BY_ID[id]) === 'confirmed'),
          ),
      )
      .map((i) => ({ ...i, matchedSlot: i.slot || candidates.find((id) => garmentMatchesSlot(i, SLOT_BY_ID[id])) }));
    if (ownedItems.length) {
      const best = ownedItems
        .map((i) => ({
          i,
          s:
            harmony([...current, { color: i.color, cat: SLOT_BY_ID[i.matchedSlot].cat }], { tonal }) +
            (r.c.includes(i.color) ? 1 : 0) +
            (i.slot ? 3 : 0) -
            r.s.indexOf(i.matchedSlot) * 0.3,
        }))
        .sort((a, b) => b.s - a.s)[0].i;
      items.push({
        role,
        slot: SLOT_BY_ID[best.matchedSlot],
        owned: true,
        item: best,
        color: best.color,
        certainty: garmentSlotStatus(best, SLOT_BY_ID[best.matchedSlot]),
      });
      used.add(best.id);
      continue;
    }
    // 비슷한 세부 종류를 가졌으면 그 옷으로 채운다(같은 옷을 또 사라고 하지 않는다).
    const twin = c.closet.find((i) => !used.has(i.id) && realOwned(i) && i.slot &&
      candidates.some((id) => nearSame(id).includes(i.slot)) &&
      (!ownedOnly || garmentSlotStatus(i, SLOT_BY_ID[i.slot]) === 'confirmed'));
    if (twin) {
      items.push({ role, slot: SLOT_BY_ID[twin.slot], owned: true, item: twin, color: twin.color, certainty: garmentSlotStatus(twin, SLOT_BY_ID[twin.slot]) });
      used.add(twin.id);
      continue;
    }
    if (!inSeason.length) continue; // 이 계절엔 필요 없는 역할(예: 여름 아우터)
    if (ownedOnly || buys >= maxBuy) {
      if (optional) continue;
      return null;
    }

    // 2) 상품: 품질·권장 색·색 조화·선호 브랜드를 함께 본다
    let best = null;
    inSeason.forEach((id, order) => {
      const explicitlyRequested = allowPendingPurchases && (!requestedPurchaseSlots || requestedPurchaseSlots.has(id));
      if (!explicitlyRequested && (c.pendingSlots?.has(id) || c.ownershipCheckSlots?.has(id))) return;
      for (const p of productsFor(id, productOpts(c)).slice(0, 10)) {
        const s =
          quality(p) / 5 -
          functional(p) * 2 +
          (r.c.includes(evidenceColor(p)) ? 1.5 : 0) +
          harmony([...current, { color: evidenceColor(p), cat: SLOT_BY_ID[id].cat }], { tonal }) +
          (c.brands.has(p.brand) ? 2 : 0) -
          order * 0.4;
        if (!best || s > best.s) best = { s, p, id };
      }
    });
    if (best) {
      items.push({ role, slot: SLOT_BY_ID[best.id], owned: false, product: best.p, color: evidenceColor(best.p) });
      buys += 1;
    } else if (!optional) return null;
  }
  const buy = items.filter((i) => !i.owned);
  if (pinnedProduct && !items.some((i) => i.product?.id === pinnedProduct.id || i.item?.productId === pinnedProduct.id))
    return null;
  if (anchorItem && !items.some((i) => i.owned && i.item?.id === anchorItem.id)) return null;
  const requiredCats = [...new Set([...forceOwned].map((id) => SLOT_BY_ID[id]?.cat))];
  if (requiredCats.some((cat) => !items.some((i) => i.slot.cat === cat && forceOwned.has(i.slot.id)))) return null;
  return {
    look,
    items,
    ownedCount: items.length - buy.length,
    uncertainCount: items.filter((i) => i.owned && i.certainty === 'uncertain').length,
    buyCount: buy.length,
    buyTotal: buy.reduce((sum, i) => sum + i.product.price, 0),
    harmony: harmony(
      items.map((i) => ({ color: i.color, cat: i.slot.cat })),
      { tonal },
    ),
  };
}

function rankLooks(results, c) {
  return results
    .filter(Boolean)
    .map((r) => {
      const styleScoreLook = c.styles.indexOf(r.look.styles.find((s) => c.styles.includes(s)));
      const styleBonus = styleScoreLook === 0 ? 2 : 1;
      const occBonus = c.occasion && r.look.occ[0] === c.occasion ? 1.5 : 0;
      const ownedBonus = (r.ownedCount / r.items.length) * 4;
      return { ...r, score: styleBonus + occBonus + ownedBonus + r.harmony * 0.5 };
    })
    .sort((a, b) => b.score - a.score || a.buyTotal - b.buyTotal);
}

// 오늘의 코디 (사야 할 상품 포함)
function recommendLooks(
  state,
  { limit = 3, forceOwned = [], occasion, anchorItem = null, pinnedProduct = null, anchorColor = null,
    allowPendingPurchases = false, requestedPurchaseSlots = null, anySeason = false, anyStyle = false,
    // strictOccasion: 상황에 맞는 공식이 없어도 상황 없는 공식으로 바꾸지 않는다(검색 조건을 몰래 풀지 않기).
    // excludeSlot: 검색에서 뺀 종류("셔츠 말고")는 코디의 다른 자리에도 쓰지 않는다.
    strictOccasion = false, excludeSlot = null } = {},
) {
  if (pinnedProduct && !productEligible(pinnedProduct)) return [];
  const base = ctx(state);
  // A widened search (every season and style of this gender) is for "what can I wear with what I own",
  // never for buying advice; callers label those looks as outside the current season/style.
  const c = anyStyle ? { ...base, styles: Object.keys(STYLES).filter((k) => STYLES[k].g.includes(base.gender)) } : base;
  const force = new Set(forceOwned);
  let looks = matchingLooks(c, { occasion: occasion ?? c.occasion, anySeason });
  if (!looks.length && !strictOccasion) looks = matchingLooks(c, { occasion: null, anySeason });
  if (force.size) {
    const cats = [...new Set([...force].map((id) => SLOT_BY_ID[id]?.cat))];
    looks = looks.filter((l) =>
      cats.every((cat) => slotsInLook(l).some((id) => force.has(id) && SLOT_BY_ID[id].cat === cat)),
    );
  }
  if (anchorItem)
    looks = looks.filter((l) => slotsInLook(l).some((id) => garmentMatchesSlot(anchorItem, SLOT_BY_ID[id])));
  if (pinnedProduct) looks = looks.filter((l) => slotsInLook(l).includes(pinnedProduct.slot));
  return rankLooks(
    looks.map((look) => fillLook(look, c, { forceOwned: force, anchorItem, pinnedProduct, anchorColor, excludeSlot,
      allowPendingPurchases: allowPendingPurchases || !!pinnedProduct,
      requestedPurchaseSlots: requestedPurchaseSlots || (pinnedProduct ? new Set([pinnedProduct.slot]) : null) })),
    c,
  ).slice(0, limit);
}

// 내 옷장: 가진 옷만으로 되는 코디와, 하나만 사면 되는 코디
function closetLooks(state, { limit = 3 } = {}) {
  const c = ctx(state);
  const looks = matchingLooks(c, { occasion: null });
  const ready = rankLooks(
    looks.map((l) => fillLook(l, c, { ownedOnly: true })),
    c,
  ).slice(0, limit);
  const readyIds = new Set(ready.map((r) => r.look.id));
  const almost = rankLooks(
    looks.filter((l) => !readyIds.has(l.id)).map((l) => fillLook(l, c, { maxBuy: 1 })),
    c,
  )
    .filter((r) => r.buyCount === 1 && r.ownedCount >= 2 && r.uncertainCount === 0)
    .slice(0, limit);
  return { ready, almost };
}

// 가진 옷 기본 조합: 코디 공식(LOOKS)에 없어도 가진 옷으로 입을 수 있는 상의+하의+신발(또는 원피스+신발),
// 겉옷이 있으면 하나 더한다. 종류와 색 조화만 본 조합이라 구매 추천·부족한 옷 판단에는 쓰지 않는다.
function basicOutfits(state, { anchorItem = null, limit = 2 } = {}) {
  const c = ctx(state);
  const owned = c.closet.filter((i) => ['user', 'legacy'].includes(i.source) && !String(i.id).startsWith('demo_'));
  const cat = (i) => slotForItem(i).cat;
  const pick = (k) => (anchorItem && cat(anchorItem) === k ? [anchorItem] : owned.filter((i) => cat(i) === k)).slice(0, 8);
  const shoes = pick('shoes'), outers = [null, ...pick('outer')];
  const bases = anchorItem && cat(anchorItem) === 'dress'
    ? [[anchorItem]]
    : [...pick('top').flatMap((t) => pick('bottom').map((b) => [t, b])),
       ...(anchorItem && !['top', 'bottom'].includes(cat(anchorItem)) ? pick('dress').map((d) => [d]) : [])];
  const out = [];
  for (const base of bases) for (const shoe of shoes) for (const outer of outers) {
    const items = [outer, ...base, shoe].filter(Boolean);
    if (anchorItem && !items.includes(anchorItem)) continue;
    const entries = items.map((i) => ({ color: i.color, cat: cat(i) }));
    out.push({ items, score: harmony(entries) + (outer ? 0.2 : 0) - items.filter((i) => !i.color).length * 0.5 });
  }
  out.sort((a, b) => b.score - a.score);
  const seen = new Set();
  return out.filter(({ items }) => {
    const key = items.filter((i) => cat(i) !== 'outer').map((i) => i.id).join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, limit).map(({ items }, n) => ({
    look: { id: `basic-${n}`, title: `가진 옷 기본 조합 ${n + 1}`, note: '코디 공식이 아니라 종류와 색이 어울리는 기본 조합이에요.' },
    items: items.map((i) => ({ role: cat(i) === 'dress' ? 'top' : cat(i), slot: slotForItem(i), owned: true, item: i, color: i.color, certainty: 'confirmed' })),
    ownedCount: items.length, buyCount: 0, buyTotal: 0, uncertainCount: 0, basic: true,
  }));
}

// 고른 스타일의 기본 아이템을 가졌는지
function essentials(state) {
  const c = ctx(state);
  return SLOTS.filter((s) => s.g === c.gender && styleScore(s, c.styles) >= 3 && s.cat !== 'acc').map((slot) => ({
    slot,
    owned: wardrobeSlotStatus(c.closet, slot) === 'confirmed',
    needsCheck: wardrobeSlotStatus(c.closet, slot) === 'uncertain' || c.pendingSlots.has(slot.id) || c.ownershipCheckSlots.has(slot.id),
    pending: c.pendingSlots.has(slot.id),
    ownershipCheck: c.ownershipCheckSlots.has(slot.id),
  }));
}

// 한 줄 검색: "출근용 셔츠 10만원 이하", "청바지에 어울리는 신발", "폴로 니트"
// drop: 사용자가 칩의 ×로 직접 뺀 조건 키(occasion·season·style·color·price·exclude·tone·brand).
// 자동으로 빼지 않는다. 뺀 조건은 결과의 dropped로 돌려줘 화면에 보인다.
function search(state, text, { anchorItemId = null, drop = [] } = {}) {
  const brandNames = [...new Set(SAFE_PRODUCTS.map((p) => p.brand))];
  const dropped = new Set(drop);
  const q = { ...parseQuery(text, { brands: brandNames }) };
  if (dropped.has('occasion')) q.occasion = null;
  if (dropped.has('season')) q.season = null;
  if (dropped.has('style')) q.style = null;
  if (dropped.has('color')) q.color = null;
  if (dropped.has('tone')) q.tone = null;
  if (dropped.has('brand')) q.brand = null;
  if (dropped.has('comfort')) q.comfort = false;
  if (dropped.has('exclude')) {
    q.excludeColors = [];
    q.excludedItems = [];
    q.excludeMatch = () => false;
  }
  if (dropped.has('price')) {
    q.maxPrice = null;
    q.minPrice = null;
    q.minPriceExclusive = false;
    q.maxPriceExclusive = false;
  }
  // 말한 종류가 성별 기본값보다 먼저다. 성별을 말하지 않았고 그 종류가 다른 성별에만 있으면
  // 그 성별에서 찾고 화면에 알린다(종류를 바꿔 채우지 않는다).
  const baseGender = q.gender || state.gender || 'M';
  const kindIn = (g) => SLOTS.some((s) => s.g === g && q.targetMatch(s) && !q.excludeMatch(s));
  const otherGender = baseGender === 'M' ? 'F' : 'M';
  const genderFromKind = q.slotNamed && !q.gender && !kindIn(baseGender) && kindIn(otherGender) ? otherGender : null;
  const c = ctx({
    ...state,
    // 예시 옷은 실제 보유 근거가 아니다: 검색에서는 옷장이 없는 것으로 본다.
    closet: state.demo ? [] : state.closet,
    gender: genderFromKind || baseGender,
    // 이번 요청에서 말한 스타일이 저장된 취향보다 먼저다.
    styles: q.style ? [q.style] : state.styles,
    occasion: q.occasion || (dropped.has('occasion') ? null : state.occasion) || null,
    season: q.season || state.season,
    budget: q.maxPrice ?? (dropped.has('price') ? null : state.budget),
    minPrice: q.minPrice,
    minPriceExclusive: q.minPriceExclusive,
    maxPriceExclusive: q.maxPriceExclusive,
    brandOnly: q.brand ? false : state.brandOnly,
  });

  const genderSlots = SLOTS.filter((s) => s.g === c.gender);
  const selectedAnchor = anchorItemId !== null;
  let anchorUnavailable = null;
  let anchorItem = null;
  let anchorProduct = null;
  let anchors = genderSlots.filter((s) => q.anchorMatch(s));
  if (selectedAnchor) {
    anchorItem = !state.demo
      ? c.closet.find((i) => i.id === anchorItemId && i.source !== 'demo' && !i.id.startsWith('demo_')) || null
      : null;
    if (anchorItem) anchors = genderSlots.filter((s) => garmentMatchesSlot(anchorItem, s));
    if (!anchorItem || !anchors.length) {
      anchorItem = null;
      anchors = [];
      anchorUnavailable = '선택한 옷을 현재 옷장에서 확인할 수 없어요. 옷장에서 다시 선택해 주세요.';
    }
  } else if (anchors.length) {
    anchorItem =
      c.closet
        .filter(
          (i) => anchors.some((slot) => garmentMatchesSlot(i, slot)) && (!q.anchorColor || i.color === q.anchorColor),
        )
        .sort((a, b) => Number(!!b.slot) - Number(!!a.slot) || a.id.localeCompare(b.id))[0] || null;
    if (q.anchorColor && !anchorItem) {
      anchorProduct =
        anchors.flatMap((slot) =>
          productsFor(slot.id, {
            ...productOpts(c),
            color: q.anchorColor,
            season: q.season || null,
          }),
        )[0] || null;
      if (anchorProduct) anchors = anchors.filter((slot) => slot.id === anchorProduct.slot);
      else anchorUnavailable = '요청한 기준 옷의 색을 확인할 수 있는 옷장 기록이나 상품이 없어요.';
    }
  }
  let targets = genderSlots.filter((s) => q.targetMatch(s) && !q.excludeMatch(s));
  // 종류를 말했는데 이 성별 상품에 그 종류가 없으면 다른 종류로 채우지 않고 0건으로 둔다.
  const kindUnavailable = q.slotNamed && !targets.length ? q.targetLabels.join('·') : null;
  const kindNowhere = !!kindUnavailable && !kindIn(otherGender);
  if (!q.slotNamed && !targets.length && anchors.length)
    targets = genderSlots.filter((s) => !anchors.some((a) => a.cat === s.cat));
  const understood = q.terms.length > 0 || !!anchorItem;
  if (!q.slotNamed && !targets.length) targets = genderSlots.filter((s) => !q.excludeMatch(s));
  // 말한 스타일에 맞는 자리만 남긴다(맞는 자리가 하나도 없으면 그대로 둔다).
  if (q.style) {
    const styled = targets.filter((s) => (s.style[q.style] || 0) >= 2);
    if (styled.length) targets = styled;
  }
  // 색을 빼거나 밝기를 말했으면 그 조건에 맞는 상품만 남긴다(맞는 게 없으면 조건을 풀지 않고 0건으로 둔다).
  const toneOK = (p) => {
    if (q.excludeColors.includes(p.color)) return false;
    if (!q.tone) return true;
    const l = COLORS[p.color]?.light;
    return Number.isFinite(l) && (q.tone === 'light' ? l >= 60 : l <= 40);
  };

  const looks = LOOKS.filter((l) => l.g === c.gender);
  const anchorIds = new Set(anchors.map((a) => a.id));
  // 카드 이유의 첫 줄은 이 요청에서 실제로 맞춘 조건이다(종류별 고정 문구는 둘째 줄).
  const SEASONS = { spring: '봄', summer: '여름', fall: '가을', winter: '겨울' };
  const matched = [
    q.style ? STYLES[q.style]?.label : '',
    c.occasion ? OCCASIONS[c.occasion] : '',
    q.season ? SEASONS[q.season] : '',
    criteriaLine({ maxPrice: c.maxPrice, minPrice: c.minPrice, minPriceExclusive: c.minPriceExclusive,
      maxPriceExclusive: c.maxPriceExclusive, color: q.color, excludeColors: q.excludeColors, tone: q.tone, brand: q.brand }),
  ].filter(Boolean).join(' · ');
  const results = [];
  for (const slot of targets) {
    if (anchorIds.has(slot.id)) continue;
    const base = scoreSlot(slot, { ...c, ownedSlots: c.ownedSlots }, matchingLooks(c, { occasion: null }));
    let score = base.score;
    // "편한": 생지·리지드처럼 뻣뻣하다고 알려진 종류는 뒤로.
    if (q.comfort && slot.id === 'm-denim-raw') score -= 4;
    // 요청한 상황에 맞지 않는 종류는 따로 묶는다(섞어서 같은 줄에 보이지 않게).
    const offOccasion = !!c.occasion && !slot.occ.includes(c.occasion);
    let reasons = matched ? [`${matched}에 맞춰 골랐어요`, slot.why] : [slot.why, ...base.reasons].slice(0, 2);
    if (offOccasion) reasons = [`${OCCASIONS[c.occasion]}보다 캐주얼한 종류예요`, slot.why];
    // 요청에서 말한 스타일에 더 가까운 아이템이 앞선다.
    if (q.style) {
      score += (slot.style[q.style] || 0) * 1.5;
      if (!matched) reasons = [`${STYLES[q.style].label} 코디에 쓰는 ${shortName(slot)}`, slot.why];
    }
    if (anchors.length) {
      const a = anchorItem
        ? garmentLabel(anchorItem)
        : `${q.anchorColor ? `${COLORS[q.anchorColor]?.label || q.anchorColor} ` : ''}${anchorProduct ? shortName(SLOT_BY_ID[anchorProduct.slot]) : q.anchorLabels[0] || shortName(anchors[0])}`;
      reasons = [`${a}${josa(a, '과', '와')} 잘 어울려요`, ...base.reasons.filter((r) => !r.startsWith('가진 '))].slice(
        0,
        2,
      );
      const together = looks.filter(
        (l) => slotsInLook(l).includes(slot.id) && slotsInLook(l).some((id) => anchorIds.has(id)),
      ).length;
      score += together * 3;
      if (!together) score -= 4;
    }
    // 계절을 말했으면 그 계절 옷만, 아이템을 콕 집었으면 계절이 지나도 보여 준다
    if (!base.inSeason && (q.season || !q.slotNamed)) continue;
    let products = productsFor(slot.id, {
      ...productOpts(c),
      color: q.color,
      brand: q.brand,
      season: q.season || (q.slotNamed ? null : c.season),
    });
    products = products.filter(toneOK);
    // The women's sweatshirt slot also contains hoodless garments.
    if (q.targetLabels.includes('후드')) products = products.filter((p) => /후드|후디|hood/i.test(p.name));
    if (q.comfort) products = [...products].sort((a, b) => comfortMark(b) - comfortMark(a));
    const selected = q.priceSort ? products : products.slice(0, q.brand ? 6 : 3);
    selected.forEach((product, i) => {
      const easy = q.comfort ? comfortMark(product) : 0;
      const fixed = productReasons(product, slot, reasons);
      results.push({ slot, product, score: score - i * 1.2 + quality(product) * 0.3 + easy * 2 - functional(product) * 3, reasons: fixed.reasons, traitLine: fixed.traitLine, offOccasion });
    });
  }
  results.sort(
    q.priceSort
      ? (a, b) =>
          (q.priceSort === 'desc' ? b.product.price - a.product.price : a.product.price - b.product.price) ||
          a.product.id.localeCompare(b.product.id)
      : (a, b) => b.score - a.score,
  );

  const items = understood ? results.slice(0, 16) : [];
  const outfitTried = understood && !anchorUnavailable && !kindUnavailable && (anchors.length || c.occasion);
  const outfit =
    outfitTried && !q.excludeColors.includes(anchorItem?.color)
      ? recommendLooks(
          {
            ...state,
            closet: state.demo ? [] : (state.closet || []).filter((item) => !q.excludeColors.includes(item.color)),
            hidden: [...(state.hidden || []), ...SAFE_PRODUCTS.filter((product) => q.excludeColors.includes(product.color)).map((product) => product.id)],
            gender: c.gender,
            styles: c.styles,
            season: c.season,
            budget: c.maxPrice,
            minPrice: c.minPrice,
            minPriceExclusive: c.minPriceExclusive,
            maxPriceExclusive: c.maxPriceExclusive,
            occasion: c.occasion,
          },
          {
            limit: 1,
            forceOwned: [...anchorIds, ...(q.slotNamed ? targets.map((slot) => slot.id) : [])],
            anchorItem,
            pinnedProduct: anchorProduct,
            anchorColor: q.anchorColor,
            allowPendingPurchases: q.slotNamed || !!anchorProduct,
            strictOccasion: !!q.occasion,
            excludeSlot: q.excludedItems.length ? q.excludeMatch : null,
            requestedPurchaseSlots: new Set([
              ...(q.slotNamed ? targets.map((slot) => slot.id) : []),
              ...(anchorProduct ? [anchorProduct.slot] : []),
            ]),
          },
        )[0] || null
      : null;
  if (!anchorProduct && !anchorItem && outfit && anchors.length)
    anchorProduct = outfit.items.find((i) => anchorIds.has(i.slot.id) && !i.owned)?.product || null;
  // 검색에서 상세·코디로 넘어가도 같은 조건을 쓴다.
  // 상품 조건(종류·색·가격·브랜드·뺀 색)과 코디 전체 조건(상황·계절·스타일·뺀 종류)을 함께 담는다.
  // 상세 화면은 같은 종류의 대안에 상품 조건을, 코디에 두 조건을 모두 쓴다.
  const criteria = {
    gender: c.gender,
    slotIds: q.slotNamed ? targets.map((s) => s.id) : null,
    occasion: c.occasion,
    occasionFromQuery: !!q.occasion,
    season: q.season,
    style: q.style,
    styles: c.styles,
    excludedItems: q.excludedItems,
    excludeSlot: q.excludedItems.length ? q.excludeMatch : null,
    maxPrice: c.maxPrice,
    minPrice: c.minPrice,
    minPriceExclusive: c.minPriceExclusive,
    maxPriceExclusive: c.maxPriceExclusive,
    color: q.color,
    brand: q.brand,
    hoodOnly: q.targetLabels.includes('후드'),
    excludeColors: q.excludeColors,
    tone: q.tone,
  };
  // 화면 칩: 실제로 적용한 조건만, 한 곳에서 만든다.
  const priceLine = criteriaLine({ maxPrice: criteria.maxPrice, minPrice: criteria.minPrice, minPriceExclusive: criteria.minPriceExclusive, maxPriceExclusive: criteria.maxPriceExclusive });
  const conds = [
    q.slotNamed ? { key: 'kind', label: q.targetLabels.join('·') } : null,
    c.occasion ? { key: 'occasion', label: OCCASIONS[c.occasion] || c.occasion, saved: !q.occasion } : null,
    q.season ? { key: 'season', label: SEASONS[q.season] } : null,
    q.style ? { key: 'style', label: STYLES[q.style]?.label || q.style } : null,
    q.color ? { key: 'color', label: COLORS[q.color]?.label || q.color } : null,
    q.tone ? { key: 'tone', label: q.tone === 'light' ? '밝은 색' : '어두운 색' } : null,
    q.excludeColors.length || q.excludedItems.length
      ? { key: 'exclude', label: [...q.excludeColors.map((x) => COLORS[x]?.label || x), ...q.excludedItems].map((x) => `${x} 제외`).join(' · ') }
      : null,
    priceLine ? { key: 'price', label: priceLine, saved: q.maxPrice == null && q.minPrice == null } : null,
    q.brand ? { key: 'brand', label: q.brand } : null,
    q.comfort ? { key: 'comfort', label: '편한 표기 먼저' } : null,
  ].filter(Boolean);
  return {
    query: q,
    criteria,
    conds,
    dropped: [...dropped],
    kindUnavailable,
    kindNowhere,
    outfitTried: !!outfitTried,
    genderFromKind,
    understood,
    items,
    outfit,
    anchorItem,
    anchorProduct,
    anchorUnavailable,
    season: c.season,
    gender: c.gender,
  };
}

// 사진이 없는 옷을 보여 줄 같은 종류의 상품 사진. 같은 색, 없으면 아주 가까운 색까지만 쓴다.
// 상품명·편집으로 확인한 색을 사진 추정 색보다 먼저, 고른 브랜드 → 사계절 상품 → 인기 순서로 고른다.
const NEAR_COLORS = {
  white: ['ivory'], ivory: ['white', 'beige'], beige: ['ivory'], navy: ['indigo'], indigo: ['navy'], blue: ['indigo'],
  charcoal: ['grey', 'black'], grey: ['charcoal'], black: ['charcoal'], olive: ['green'], green: ['olive'], red: ['pink'], pink: ['red'],
};
function lookalike(slotId, color, { brand = null } = {}) {
  if (!color) return null;
  const list = (PRODUCTS_BY_SLOT[slotId] || []).filter((p) => p.img);
  const key = (p) => [p.brand === brand ? 1 : 0, p.colorSource === 'image' ? 0 : 1, p.summer ? 0 : 1, quality(p)];
  const better = (a, b) => {
    const x = key(a), y = key(b);
    return x[0] - y[0] || x[1] - y[1] || x[2] - y[2] || x[3] - y[3];
  };
  for (const c of [color, ...(NEAR_COLORS[color] || [])]) {
    const same = list.filter((p) => p.color === c);
    if (same.length) return same.reduce((best, p) => (better(p, best) > 0 ? p : best));
  }
  return null;
}

// 예시 옷장: 고른 스타일의 대표 코디에서 겹치지 않게 몇 벌을 고른다. 그 옷만으로 "오늘 뭐 입지?" 코디가 나오도록
// 첫 코디를 통째로 넣는다. 색은 그 종류의 대표 색으로 둔다(코디에 뽑힌 상품이 튀는 색일 수 있다).
function exampleCloset(state, { size = 6 } = {}) {
  const looks = recommendLooks(
    { ...state, closet: [], demo: false, demoSelected: [], occasion: null, budget: null, brandOnly: false },
    { limit: 3, occasion: null },
  );
  const out = [];
  for (const r of looks) {
    for (const i of r.items) {
      if (i.role === 'acc' || out.length >= size || out.some((x) => x.slot === i.slot.id)) continue;
      const shown = (c) => c && lookalike(i.slot.id, c);
      const color = (i.slot.colors.includes(i.color) && shown(i.color) && i.color) || i.slot.colors.find(shown) || i.color || i.slot.colors[0];
      out.push({ slot: i.slot.id, color });
    }
  }
  return out;
}

// ── src/purchase-candidate.js
// Local, explicit metadata comparison. A pasted link does not fetch or recognize a garment.






const CANDIDATE_ABSENCE = new Set(['unknown', 'absent', 'present']);
const CANDIDATE_INTENTS = new Set(['add', 'replace']);
const CANDIDATE_COLOR_SOURCES = new Set(['user', 'name', 'curation', 'image']);

// 쇼핑 앱의 '공유' 글은 "상품명 + 링크" 모양이다. 글 속 첫 http(s) 링크만 꺼내고, 나머지 글은
// 상품 정보로 쓰지 않는다(이름·색을 글에서 짐작해 확정하지 않는다). 주소로 시작하는 글은
// 주소 전체로 본다: 중간에 줄바꿈·공백이 낀 주소를 잘라 다른 주소로 만들지 않기 위해서다.
function extractPurchaseLink(raw) {
  const text = String(raw ?? '').trim();
  if (!/\s/.test(text) || /^https?:\/\//i.test(text)) return text;
  const found = text.match(/https?:\/\/[^\s<>"'`]+/i);
  return found ? found[0].replace(/[)\]}>.,!?…。、」』"'”’]+$/u, '') : text;
}

function parseCandidateLink(raw, { catalog = PRODUCTS } = {}) {
  const invalid = (error) => ({ ok: false, kind: null, originalUrl: null, canonicalUrl: null, productId: null, product: null, error });
  if (typeof raw !== 'string' || raw.length > 4096) return invalid('상품 링크를 확인해 주세요.');
  const link = extractPurchaseLink(raw);
  if (link.length > 2048 || /[\u0000-\u001f\u007f\\]/.test(link)) return invalid('상품 링크를 확인해 주세요.');
  let url;
  try { url = new URL(link); } catch { return invalid('https 상품 링크를 붙여 넣어 주세요.'); }
  if (!isPublicPurchaseUrl(url.href))
    return invalid('공개 판매처의 https 링크를 사용해 주세요.');
  if (url.port && url.port !== '443') return invalid('판매처의 기본 https 링크를 사용해 주세요.');
  const knownStore = /^(?:www\.|m\.)?musinsa\.com$/.test(url.hostname);
  const path = knownStore && url.pathname.match(/^\/(?:products|app\/goods)\/(\d{1,16})\/?$/);
  if (path && !/^0+$/.test(path[1])) {
    const number = path[1].replace(/^0+(?=\d)/, '');
    const productId = `ms-${number}`;
    const canonicalUrl = `https://www.musinsa.com/products/${number}`;
    const product = catalog.find((p) => p.id === productId) || null;
    return { ok: true, kind: product ? 'catalog' : 'external', originalUrl: url.href, canonicalUrl, productId, product, error: null };
  }
  const originalUrl = url.href;
  url.hash = '';
  return { ok: true, kind: 'external', originalUrl, canonicalUrl: url.href, productId: null, product: null, error: null };
}

function candidateFromProduct(product) {
  const parsed = parseCandidateLink(product?.url || '');
  if (!parsed.ok || parsed.productId !== product?.id || !SLOT_BY_ID[product?.slot])
    throw new Error('상품의 정확한 링크와 종류를 확인해 주세요.');
  const exclusion = productExclusionReason(product);
  if (exclusion) throw new Error('현재 코디 비교에 사용할 수 없는 상품입니다.');
  const slot = SLOT_BY_ID[product.slot];
  return {
    productId: product.id,
    originalUrl: product.url,
    url: parsed.canonicalUrl,
    slot: slot.id,
    kind: slot.shape,
    gender: slot.g.toLowerCase(),
    color: Object.hasOwn(COLORS, product.color) ? product.color : null,
    colorSource: Object.hasOwn(COLORS, product.color)
      ? CANDIDATE_COLOR_SOURCES.has(product.colorSource) ? product.colorSource : 'curation'
      : null,
    brand: product.brand || '',
    name: product.name || '',
    price: Number.isFinite(product.price) && product.price > 0 ? product.price : null,
    priceSource: Number.isFinite(product.price) && product.price > 0 ? 'catalog' : null,
    checkedAt: product.checkedAt || null,
    source: 'catalog',
    classificationConfirmed: true,
  };
}

function candidateFromLink(raw, { gender = 'm' } = {}) {
  const parsed = parseCandidateLink(raw);
  if (!parsed.ok) throw new Error(parsed.error);
  if (parsed.product) return { ...candidateFromProduct(parsed.product), originalUrl: parsed.originalUrl };
  return {
    productId: parsed.productId,
    originalUrl: parsed.originalUrl,
    url: parsed.canonicalUrl,
    slot: null,
    kind: null,
    gender: gender === 'f' || gender === 'F' ? 'f' : 'm',
    color: null,
    colorSource: null,
    brand: '',
    name: '',
    price: null,
    priceSource: null,
    checkedAt: null,
    source: 'user',
    classificationConfirmed: false,
  };
}

function candidateContext(state, closet, gender) {
  const styles = (state.styles?.length ? state.styles : [state.style || 'classic'])
    .filter((style) => STYLES[style]?.g.includes(gender));
  return {
    gender,
    styles: styles.length ? styles : ['classic'],
    occasion: state.occasion || null,
    season: state.season || seasonOf(state.now ? new Date(state.now) : new Date()),
    closet,
    brands: new Set(),
    hidden: new Set(),
    maxPrice: null,
    minPrice: null,
    brandOnly: false,
  };
}

function quickCompare(state, { kind, color = null, gender = 'M' } = {}) {
  const g = gender === 'F' || gender === 'f' ? 'F' : 'M';
  const inactiveIds = inactivePurchaseGarmentIds(state);
  const actual = (Array.isArray(state.garments) ? state.garments : state.demo ? [] : state.closet || [])
    .filter((item) => ['user', 'legacy'].includes(item.source) && !String(item.id).startsWith('demo_') &&
      item.gender === g && !inactiveIds.has(item.id));
  const sameKind = kind ? actual.filter((item) => item.kind === kind) : [];
  const known = (value) => !!value && Object.hasOwn(COLORS, value);
  // A color nobody has confirmed (candidate or owned) is "unknown", never "different".
  return {
    actualCount: actual.length,
    sameColor: known(color) ? sameKind.filter((item) => item.color === color) : [],
    otherColor: known(color) ? sameKind.filter((item) => known(item.color) && item.color !== color) : [],
    unknownColor: sameKind.filter((item) => !known(color) || !known(item.color)),
  };
}

function compareCandidate(state, candidate, { absence = 'unknown', intent = 'add', replacementGarmentId = null } = {}) {
  const resultCandidate = { ...candidate };
  const gender = candidate?.gender === 'f' || candidate?.gender === 'F' ? 'F' : 'M';
  const inactiveIds = inactivePurchaseGarmentIds(state);
  const actual = (Array.isArray(state.garments) ? state.garments : state.demo ? [] : state.closet || [])
    .filter((item) => ['user', 'legacy'].includes(item.source) && !String(item.id).startsWith('demo_') &&
      item.gender === gender && !inactiveIds.has(item.id));
  const slot = SLOT_BY_ID[candidate?.slot];
  const candidateColor = candidate?.colorSource === 'image' ? null : candidate?.color;
  const hasColor = !!candidateColor && Object.hasOwn(COLORS, candidateColor);
  const candidateExclusion = productExclusionReason(candidate);
  const excludedCandidate = candidateExclusion && candidateExclusion !== 'incomplete';
  const classificationValid = !!slot && slot.g === gender && candidate.kind === slot.shape &&
    candidate.classificationConfirmed === true && !productClassificationConflict(candidate) && !excludedCandidate;
  const acceptedAbsence = CANDIDATE_ABSENCE.has(absence) ? absence : 'unknown';
  const acceptedIntent = CANDIDATE_INTENTS.has(intent) ? intent : 'add';
  const sameProduct = actual.filter((item) => candidate?.productId && item.productId === candidate.productId);
  const exactOwned = sameProduct.filter((item) => hasColor && item.color === candidateColor &&
    classificationValid && garmentSlotStatus(item, slot) === 'confirmed');
  const similarOwned = classificationValid ? actual.filter((item) => !sameProduct.includes(item) &&
    garmentSlotStatus(item, slot) === 'confirmed' && hasColor && item.color === candidateColor) : [];
  const sameTypeOwned = classificationValid ? actual.filter((item) => garmentSlotStatus(item, slot) === 'confirmed') : [];
  const uncertainOwned = actual.filter((item) =>
    !SLOT_BY_ID[item.slot] || !Object.hasOwn(COLORS, item.color) ||
    (slot && garmentSlotStatus(item, slot) === 'uncertain') ||
    (classificationValid && garmentSlotStatus(item, slot) === 'confirmed' && !item.color) ||
    (sameProduct.includes(item) && !exactOwned.includes(item)));
  // Kind+color match needs no subtype, so the sheet can lead with a conclusion
  // ("a similar one is already in your closet") before details are confirmed.
  const candidateKind = candidate?.kind || slot?.shape || null;
  const kindMatch = {
    kind: candidateKind,
    sameColor: candidateKind && hasColor ? actual.filter((item) => item.kind === candidateKind &&
      item.color === candidateColor && !exactOwned.includes(item)) : [],
    otherColor: candidateKind && hasColor ? actual.filter((item) => item.kind === candidateKind &&
      Object.hasOwn(COLORS, item.color) && item.color !== candidateColor) : [],
    unknownColor: candidateKind ? actual.filter((item) => item.kind === candidateKind &&
      (!hasColor || !Object.hasOwn(COLORS, item.color))) : [],
  };
  const checks = [];
  const check = (code, message, garmentIds) => checks.push({ code, message, ...(garmentIds ? { garmentIds } : {}) });
  const parsed = parseCandidateLink(candidate?.url || '');
  if (!parsed.ok) check('invalid-link', parsed.error);
  else if (candidate.productId !== parsed.productId)
    check('product-id-mismatch', '상품 링크와 상품 번호가 달라요. 원래 링크를 다시 확인해 주세요.');
  if (!classificationValid) check('candidate-classification', '비교할 상품의 세부 종류를 먼저 확인해 주세요.');
  if (!hasColor) check('candidate-color', '상품의 색을 확인해야 내 옷과 색을 비교할 수 있어요.');
  if (slot?.requiredColors && hasColor && !slot.requiredColors.includes(candidateColor))
    check('candidate-color-conflict', '고른 종류에 필요한 색과 상품 색이 달라요. 종류를 다시 확인해 주세요.');
  if (uncertainOwned.length)
    check('owned-details', '일부 내 옷의 세부 종류·색을 확인하면 비교에 포함할 수 있어요.', uncertainOwned.map((item) => item.id));
  if (!actual.length) check('actual-wardrobe', '예시 옷이 아닌 실제 가진 옷을 등록하면 비교할 수 있어요.');
  if (acceptedIntent === 'add' && !sameProduct.length && !sameTypeOwned.length && acceptedAbsence === 'unknown')
    check('ownership-unknown', '등록되지 않은 옷이 있을 수 있어요. 비슷한 옷을 실제로 가지고 있는지 확인해 주세요.');
  if (sameTypeOwned.length && acceptedAbsence === 'absent')
    check('ownership-conflict', '등록한 같은 세부 종류의 옷이 있어요. 추가 구매인지 기존 옷 교체인지 확인해 주세요.', sameTypeOwned.map((item) => item.id));
  if (sameProduct.some((item) => !exactOwned.includes(item)))
    check('product-variant', '같은 상품 페이지의 옷이 있어요. 색·옵션이 같은지 확인해 주세요.', sameProduct.map((item) => item.id));

  // Unknown type/color never counts as a complete formula. These are recipe counts,
  // not photorealistic fit, independent outfit permutations, or wearability predictions.
  const confirmed = actual.filter((item) => SLOT_BY_ID[item.slot] && Object.hasOwn(COLORS, item.color) &&
    garmentSlotStatus(item, SLOT_BY_ID[item.slot]) === 'confirmed');
  const context = candidateContext(state, confirmed, gender);
  const formulas = matchingLooks(context);
  const existing = new Map(formulas.map((look) => [look.id, fillLook(look, context, { ownedOnly: true })])
    .filter(([, filled]) => filled));
  const completeCandidate = classificationValid && hasColor &&
    (!slot.requiredColors || slot.requiredColors.includes(candidateColor)) &&
    parsed.ok && candidate.productId === parsed.productId;
  const requestedReplacement = acceptedIntent === 'replace'
    ? actual.find((item) => item.id === replacementGarmentId) || null : null;
  const replacementTarget = completeCandidate && requestedReplacement &&
    requestedReplacement.kind === candidate.kind && SLOT_BY_ID[requestedReplacement.slot] &&
    Object.hasOwn(COLORS, requestedReplacement.color) &&
    garmentSlotStatus(requestedReplacement, SLOT_BY_ID[requestedReplacement.slot]) === 'confirmed'
    ? requestedReplacement : null;
  const replacement = { target: replacementTarget, beforeFormulaCount: 0, retainedFormulaCount: 0,
    lostFormulaCount: 0, newFormulaCount: 0 };
  if (acceptedIntent === 'replace' && !replacementTarget)
    check('replacement-target', requestedReplacement
      ? '교체할 내 옷과 후보의 종류·색을 먼저 확인해 주세요.'
      : '교체할 실제 보유 옷 한 벌을 골라 주세요.');
  const looks = [];
  if (completeCandidate) {
    let anchorId = '__purchase_candidate__';
    while (actual.some((item) => item.id === anchorId)) anchorId += '_';
    const anchor = {
      id: anchorId,
      slot: slot.id,
      kind: slot.shape,
      gender,
      color: candidateColor,
      brand: candidate.brand || null,
      label: candidate.name || slot.name,
      productId: candidate.productId,
      photoId: null,
      source: 'candidate',
    };
    const withCandidate = { ...context, closet: [...confirmed.filter((item) => item.id !== replacementTarget?.id), anchor] };
    if (replacementTarget) {
      const beforeTarget = new Set(formulas.filter((look) =>
        fillLook(look, context, { ownedOnly: true, anchorItem: replacementTarget })).map((look) => look.id));
      const afterReplacement = new Set(formulas.filter((look) =>
        fillLook(look, withCandidate, { ownedOnly: true })).map((look) => look.id));
      replacement.beforeFormulaCount = beforeTarget.size;
      replacement.retainedFormulaCount = [...beforeTarget].filter((id) => afterReplacement.has(id)).length;
      replacement.lostFormulaCount = beforeTarget.size - replacement.retainedFormulaCount;
    }
    for (const look of formulas) {
      const filled = fillLook(look, withCandidate, { ownedOnly: true, anchorItem: anchor });
      if (!filled || filled.uncertainCount) continue;
      const wasExisting = existing.has(look.id);
      looks.push({
        look,
        items: filled.items.map((row) => row.item?.id === anchorId
          ? { ...row, owned: false, item: null, candidate: resultCandidate, source: 'candidate' }
          : { ...row, source: 'wardrobe' }),
        existing: wasExisting,
        new: !wasExisting,
        unknownColorCount: 0,
      });
    }
  }
  const newFormulaCount = looks.filter((look) => look.new).length;
  if (replacementTarget) replacement.newFormulaCount = newFormulaCount;
  const priceAmount = Number.isSafeInteger(candidate.price) && candidate.price >= 0 ? candidate.price : null;
  const budgetExceeded = Number.isFinite(state.budget) && priceAmount !== null && priceAmount > state.budget;
  if (budgetExceeded) check('budget', '입력한 상품 가격이 현재 예산을 넘어요. 판매처의 실제 결제 금액도 확인해 주세요.');
  let decision;
  if (completeCandidate && exactOwned.length && acceptedIntent === 'add') {
    decision = { kind: 'skip', reasons: ['이미 등록한 같은 상품·색의 옷을 먼저 활용해 보세요.', '추가 구매가 필요한 용도가 있는지 확인해 주세요.'] };
  } else if (!completeCandidate || !actual.length || budgetExceeded ||
    acceptedIntent === 'replace' && (!replacementTarget || !replacement.retainedFormulaCount && !replacement.newFormulaCount) ||
    acceptedIntent === 'add' && !newFormulaCount ||
    acceptedIntent === 'add' && ['unknown', 'present'].includes(acceptedAbsence) && !sameProduct.length && !sameTypeOwned.length) {
    decision = { kind: 'hold', reasons: replacementTarget && !budgetExceeded
      ? [`${garmentLabel(replacementTarget)} 교체 후 유지되는 코디 공식을 찾지 못했어요. 기존 공식 ${replacement.lostFormulaCount}개가 빠지고 새로 완성되는 공식은 ${replacement.newFormulaCount}개예요.`,
        '교체할 용도와 다른 계절·소재·핏을 직접 확인한 뒤 결정해 주세요.']
      : checks.length
      ? checks.slice(0, 3).map((entry) => entry.message)
      : ['현재 등록한 옷에서는 이 상품만 더해 새로 완성되는 코디 공식을 찾지 못했어요.', '등록하지 않은 옷·교체 목적·다른 계절을 확인한 뒤 결정해 주세요.'] };
  } else if (acceptedIntent === 'replace') {
    decision = { kind: 'consider', reasons: [
      `${garmentLabel(replacementTarget)} 대신 이 후보를 넣으면 코디 공식 ${replacement.retainedFormulaCount}개가 유지되고 ${replacement.lostFormulaCount}개가 빠져요. 새로 완성되는 공식은 ${replacement.newFormulaCount}개예요.`,
      '종류·색으로 만든 공식의 변화예요. 교체 필요성과 소재·핏·사이즈·현재 가격을 직접 확인해 주세요.',
    ] };
  } else {
    decision = { kind: 'consider', reasons: [
      `확인한 내 옷에 이 상품 하나를 더하면 코디 공식 ${newFormulaCount}개가 새로 완성돼요.`,
      similarOwned.length ? '비슷한 종류·색의 내 옷이 있어요. 소재·핏·추가 용도를 직접 비교해 주세요.' : '상품의 소재·핏·사이즈와 현재 가격은 판매처에서 확인해 주세요.',
    ] };
  }
  return {
    candidate: resultCandidate,
    actualGarmentIds: actual.map((item) => item.id),
    sameProduct,
    exactOwned,
    similarOwned,
    sameTypeOwned,
    uncertainOwned,
    kindMatch,
    existingFormulaCount: existing.size,
    newFormulaCount,
    looks,
    replacement,
    missingChecks: checks,
    price: { amount: priceAmount, source: candidate.priceSource || null, checkedAt: candidate.checkedAt || null, live: false },
    decision,
    scope: 'formula-comparison',
    absence: acceptedAbsence,
    intent: acceptedIntent,
    limitations: ['종류·색과 코디 공식으로 비교했어요. 사진 인식·소재·핏·사이즈 검증은 하지 않았어요.',
      '새 코디 수는 등록한 실제 옷으로 완성되는 코디 공식 수예요. 전체 옷장의 미보유를 뜻하지 않아요.'],
  };
}

// ── src/related-returns.js
// Historical evidence for a different product, never a size prediction or ranking input.

const brandKey = (value) => typeof value === 'string' ? value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase() : '';
const kindKey = (candidate) => candidate?.kind || SLOT_BY_ID[candidate?.slot]?.shape || null;

function relatedReturnRecords(journeys, candidate, excludeId = null) {
  const brand = brandKey(candidate?.brand), kind = kindKey(candidate);
  if (!brand || !kind) return [];
  return journeys.flatMap((journey) => {
    if (journey.id === excludeId) return [];
    const event = [...journey.history].reverse().find((entry) => entry.action === 'returned');
    // A later edit cannot rewrite the product, option or feedback at return time.
    const details = event?.details, past = details?.candidate;
    if (!past || brandKey(past.brand) !== brand || kindKey(past) !== kind) return [];
    if ((candidate.productId && past.productId === candidate.productId) || (past.url && past.url === candidate.url)) return [];
    return [{ journeyId: journey.id, at: event.at, name: past.name || '상품명 미기록',
      option: details.option || null, fit: details.feedback?.fit || null,
      returnReason: details.feedback?.returnReason || null }];
  }).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 3);
}

// ── src/wardrobe-plan.js
// Wardrobe plan: from the clothes actually owned to the next real product.
//
// One pass over the active owned garments (never returned or retired ones):
// 1. which garments can be analysed (type and colour confirmed) and which need a check
// 2. duplicates: confirmed garments of the same detailed type and colour
// 3. gaps: a detailed type that, added once, completes outfit formulas with the
//    confirmed garments — counted by the same compareCandidate rules the purchase
//    comparison uses, so both screens give the same number
// 4. real catalog products for each gap: brand, exact name, the price as
//    collected with its date and store, and the product link
//
// Nothing is invented: products whose colour is only guessed from the photo are
// listed with "colour unconfirmed" and do not count; prices are the catalog's
// collected price on its date, never a current or lowest price.
//
// What happened last time with the same product (returned for size, decided
// not to buy, kept) is shown next to it. It does not reorder or hide anything:
// a free-text reason or a return never quietly lowers a product. Only "do not
// recommend again" hides one.






function confirmedGarment(item) {
  const slot = SLOT_BY_ID[item.slot];
  return !!slot && Object.hasOwn(COLORS, item.color) && garmentSlotStatus(item, slot) === 'confirmed';
}

function productColorConfirmed(product) {
  const slot = SLOT_BY_ID[product.slot];
  const color = evidenceColor(product);
  return !!color && Object.hasOwn(COLORS, color) && (!slot?.requiredColors || slot.requiredColors.includes(color));
}

/** The latest purchase record of exactly this product, or null. */
function productRecord(state, productId) {
  const journeys = (state.journeys || []).filter((journey) => journey.candidate?.productId === productId);
  if (!journeys.length) return null;
  const lastAt = (journey) => journey.history.at(-1)?.at || '';
  const latest = journeys.reduce((a, b) => (lastAt(b) > lastAt(a) ? b : a));
  return {
    journeyId: latest.id,
    count: journeys.length,
    stage: latest.stage,
    decision: latest.decision,
    at: lastAt(latest),
    option: latest.option || '',
    fit: latest.feedback?.fit || null,
    returnReason: latest.feedback?.returnReason || null,
    wearCount: latest.wearCount || 0,
  };
}

function gapProducts(slot, state, season, limit) {
  const products = productsFor(slot.id, {
    maxPrice: state.budget ?? null, hidden: new Set(state.hidden || []),
    brands: new Set(state.brands || []), brandOnly: !!state.brandOnly && (state.brands || []).length > 0,
    season,
  }).filter(productEligible);
  // Products with a confirmed colour come first; the others stay visible but marked.
  const ordered = [...products.filter(productColorConfirmed), ...products.filter((p) => !productColorConfirmed(p))];
  return {
    representative: ordered.find(productColorConfirmed) || null,
    total: products.length,
    list: ordered.slice(0, limit).map((product) => ({
      product,
      colorConfirmed: productColorConfirmed(product),
      price: { amount: product.price, store: product.store, collectedOn: product.checkedAt, kind: 'collected' },
      record: productRecord(state, product.id),
    })),
  };
}

function describeGarment(item) {
  return [COLORS[item.color]?.label, item.brand, garmentLabel(item)].filter(Boolean).join(' ');
}

/**
 * basis.kind: 'actual' (the user's own clothes), 'example' (the example closet,
 * analysed only for display and never mixed with real clothes) or 'empty'.
 */
function wardrobePlan(state, { gapLimit = 3, productsPerGap = 3 } = {}) {
  const gender = state.gender || 'M';
  const example = !!state.demo;
  const inactive = inactivePurchaseGarmentIds(state);
  const source = example ? state.demoSelected || [] : state.garments || [];
  const owned = source.filter((item) => item.gender === gender && !inactive.has(item.id) &&
    (example || ['user', 'legacy'].includes(item.source)));
  const otherGender = example ? 0 : (state.garments || []).filter((item) =>
    item.gender !== gender && ['user', 'legacy'].includes(item.source) && !inactive.has(item.id)).length;
  const retired = example ? 0 : (state.garments || []).filter((item) => inactive.has(item.id)).length;
  const basis = { kind: owned.length ? (example ? 'example' : 'actual') : 'empty', garmentCount: owned.length, otherGender, retired };

  const confirmed = owned.filter(confirmedGarment);
  const needsCheck = owned.filter((item) => !confirmedGarment(item)).map((item) => ({
    item,
    reason: !SLOT_BY_ID[item.slot] || garmentSlotStatus(item, SLOT_BY_ID[item.slot]) !== 'confirmed'
      ? (Object.hasOwn(COLORS, item.color) ? 'type' : 'type-and-color')
      : 'color',
  }));

  const groups = new Map();
  for (const item of confirmed) {
    const key = `${item.slot}|${item.color}`;
    groups.set(key, [...(groups.get(key) || []), item]);
  }
  const duplicates = [...groups.values()].filter((items) => items.length > 1)
    .map((items) => ({ slot: SLOT_BY_ID[items[0].slot], color: items[0].color, items }));

  // The example closet is analysed through an in-memory copy marked as wardrobe
  // clothes; it is never saved and every label says it is the example.
  const analysisState = example
    ? { ...state, demo: false, demoSelected: [], journeys: [],
        garments: owned.map((item) => ({ ...item, id: `example-${item.id}`, source: 'user', exampleOf: item.id })) }
    : state;
  const context = recommendationContext({ ...analysisState, closet: analysisState.garments });
  const formulas = matchingLooks(context, { occasion: null });
  const formulaSlotIds = new Set(formulas.flatMap(formulaSlots));
  const ownedSlotIds = new Set(confirmed.map((item) => item.slot));
  const paused = [];
  const gaps = [];
  if (confirmed.length) {
    for (const slot of SLOTS) {
      if (slot.g !== gender || !formulaSlotIds.has(slot.id) || ownedSlotIds.has(slot.id)) continue;
      // An order or a "similar one at home" answer pauses buying the same type.
      if (context.pendingSlots.has(slot.id) || context.ownershipCheckSlots.has(slot.id)) {
        paused.push({ slot, reason: context.pendingSlots.has(slot.id) ? 'ordered' : 'similar-owned' });
        continue;
      }
      const products = gapProducts(slot, state, context.season, productsPerGap);
      const representative = products.representative;
      if (!representative) continue;
      let comparison;
      try {
        comparison = compareCandidate(analysisState, candidateFromProduct(representative), { absence: 'unknown' });
      } catch {
        // A product that cannot form an exact candidate (link or type unclear) is
        // skipped rather than letting one row stop the whole plan.
        continue;
      }
      if (!comparison.newFormulaCount) continue;
      const looks = comparison.looks.filter((look) => look.new);
      const used = new Map();
      for (const look of looks)
        for (const row of look.items) if (row.source === 'wardrobe' && row.item) used.set(row.item.id, row.item);
      gaps.push({
        slot,
        newFormulaCount: comparison.newFormulaCount,
        looks: looks.slice(0, 3).map((look) => ({ title: look.look.title, note: look.look.note,
          items: look.items.map((row) => row.source === 'wardrobe'
            ? { role: row.role, owned: true, item: row.item, label: describeGarment(row.item) }
            : { role: row.role, owned: false, slot }) })),
        usesOwned: [...used.values()],
        styleFit: styleScore(slot, context.styles),
        products: products.list,
        moreProducts: Math.max(0, products.total - products.list.length),
      });
    }
  }
  gaps.sort((a, b) => b.newFormulaCount - a.newFormulaCount || b.styleFit - a.styleFit);
  // When no single garment completes a formula, show formulas two garments away,
  // built only from confirmed clothes (never from unconfirmed ones).
  const pairs = [];
  if (confirmed.length >= 2) {
    const confirmedAnalysis = (analysisState.garments || []).filter((item) =>
      confirmedGarment(item) && owned.some((o) => o.id === (item.exampleOf || item.id)));
    const pairContext = recommendationContext({ ...analysisState, closet: confirmedAnalysis });
    const seen = new Set(gaps.map((gap) => gap.slot.id));
    for (const look of matchingLooks(pairContext, { occasion: null })) {
      const filled = fillLook(look, pairContext, { maxBuy: 2 });
      if (!filled || filled.buyCount !== 2 || filled.uncertainCount || filled.ownedCount < 2) continue;
      const buys = filled.items.filter((row) => !row.owned).map((row) => row.slot);
      const key = buys.map((slot) => slot.id).sort().join('+');
      if (seen.has(key) || buys.some((slot) => seen.has(slot.id))) continue;
      seen.add(key);
      // 두 조합이 같은 종류(같은 상품)를 또 권하지 않는다. 상품 하나가 두 조합에 걸리면 비교 화면이 어느 조합인지 모호해진다.
      buys.forEach((slot) => seen.add(slot.id));
      pairs.push({
        slots: buys,
        look: { title: look.title, note: look.note,
          items: filled.items.map((row) => row.owned
            ? { role: row.role, owned: true, item: row.item, label: describeGarment(row.item) }
            : { role: row.role, owned: false, slot: row.slot }) },
        usesOwned: filled.items.filter((row) => row.owned).map((row) => row.item),
        products: Object.fromEntries(buys.map((slot) => [slot.id, gapProducts(slot, state, context.season, 2).list])),
      });
      if (pairs.length >= 2) break;
    }
  }
  return {
    basis,
    analysed: confirmed,
    needsCheck,
    duplicates,
    gaps: gaps.slice(0, gapLimit),
    moreGaps: Math.max(0, gaps.length - gapLimit),
    pairs: gaps.length >= gapLimit ? [] : pairs,
    paused,
    season: context.season,
    limitations: [
      '종류와 색을 확인한 옷만 셌어요. 소재·핏·사이즈는 비교하지 않았어요.',
      '코디 수는 편집자가 만든 코디 공식 중 이 옷 하나를 더해 완성되는 수예요.',
      '가격은 수집한 날의 판매처 표시가예요. 지금 가격·쿠폰·배송비는 판매처에서 확인해 주세요.',
    ],
  };
}

// ── src/purchase-plan-context.js
// A two-product outfit remains context, never a decision to buy one product.


const PLAN_CANDIDATE_FIELDS = [
  'productId', 'url', 'slot', 'kind', 'gender', 'color', 'colorSource',
  'brand', 'name', 'price', 'priceSource', 'checkedAt', 'source', 'classificationConfirmed',
];

function matchesPlanProduct(candidate, product) {
  try {
    const expected = candidateFromProduct(product);
    if (!PLAN_CANDIDATE_FIELDS.every((field) => candidate[field] === expected[field])) return false;
    // A copied tracking link is fine; an original link to another item is not.
    const original = parseCandidateLink(candidate.originalUrl);
    return original.ok && original.productId === expected.productId && original.canonicalUrl === expected.url;
  } catch {
    return false;
  }
}

/** Current actual-wardrobe context for an unchanged catalog purchase candidate. */
function purchasePlanContext(state, candidate, { intent = 'add' } = {}) {
  if (!state || state.demo || intent !== 'add' || !candidate || typeof candidate.productId !== 'string') return null;
  const plan = wardrobePlan(state);
  if (plan.basis.kind !== 'actual') return null;
  for (const pair of plan.pairs) {
    if (pair.slots.length !== 2) continue;
    for (const slot of pair.slots) {
      const selected = pair.products[slot.id]?.find((entry) => entry.product.id === candidate.productId);
      if (!selected || !matchesPlanProduct(candidate, selected.product)) continue;
      const companionSlot = pair.slots.find((other) => other.id !== slot.id);
      const companion = pair.products[companionSlot?.id]?.[0];
      if (!companion) continue;
      try { candidateFromProduct(companion.product); } catch { continue; }
      // Keep the entry's colour evidence and collected-price metadata intact.
      return { pair, companionSlot, companion, selected };
    }
  }
  return null;
}

// ── src/offers.js
// Seller offers for one product and the total cost to compare them.
//
// An offer is one seller's price for one product page, with the option (colour,
// size) it was seen for, the shipping fee if known, stock and when it was checked.
// Offers are compared only when they are the same product (confirmed), the same
// option the user wants (both colour and size chosen), confirmed in stock,
// recent, and their shipping fee is known.
// Everything else stays visible with the reason it is not compared. The result
// is "the lowest total among the sellers checked", never "the current lowest price".

const OFFER_STALE_DAYS = 3;
const MAX_OFFERS_PER_PRODUCT = 12;
const OFFER_SOURCE_LABEL = {
  catalog: '목록 수집가',
  user: '직접 기록',
  'naver-shopping': '네이버 쇼핑 검색',
};
const OFFER_FLAG_LABEL = {
  'sold-out': '품절',
  'stock-unknown': '재고 미확인',
  'request-incomplete': '원하는 색·사이즈 미정',
  stale: '오래된 가격',
  'option-mismatch': '옵션 다름',
  'option-unknown': '옵션 미확인',
  'shipping-unknown': '배송비 미확인',
  'product-unconfirmed': '같은 상품인지 미확인',
};
const STOCK = new Set(['in-stock', 'sold-out', 'unknown']);
const SAME = new Set(['confirmed', 'unconfirmed']);

function httpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}
function wholeWon(value) {
  return Number.isSafeInteger(value) && value >= 0 && value <= 100000000 ? value : null;
}

/** Normalize an offer or throw with a user message. */
function validateOffer(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('판매처 가격 정보를 확인해 주세요.');
  const seller = typeof raw.seller === 'string' ? raw.seller.trim().slice(0, 60) : '';
  const url = httpsUrl(raw.url);
  const price = wholeWon(raw.price);
  if (!seller) throw new Error('판매처 이름을 입력해 주세요.');
  if (!url) throw new Error('판매처 상품의 https 링크를 입력해 주세요.');
  if (price === null) throw new Error('가격을 원 단위 숫자로 입력해 주세요.');
  const shipping = raw.shipping === null || raw.shipping === undefined || raw.shipping === '' ? null : wholeWon(raw.shipping);
  if (raw.shipping !== null && raw.shipping !== undefined && raw.shipping !== '' && shipping === null)
    throw new Error('배송비를 원 단위 숫자로 입력해 주세요. 모르면 비워 두세요.');
  const checkedAt = typeof raw.checkedAt === 'string' && Number.isFinite(Date.parse(raw.checkedAt)) ? new Date(raw.checkedAt).toISOString() : null;
  if (!checkedAt) throw new Error('확인 시각이 없어요.');
  const source = Object.hasOwn(OFFER_SOURCE_LABEL, raw.source) ? raw.source : null;
  if (!source) throw new Error('가격 출처를 알 수 없어요.');
  return {
    id: typeof raw.id === 'string' && /^[-\w:]{1,80}$/.test(raw.id) ? raw.id : `o_${crypto.randomUUID()}`,
    seller,
    url,
    price,
    shipping,
    color: raw.color && Object.hasOwn(COLORS, raw.color) ? raw.color : null,
    size: typeof raw.size === 'string' && raw.size.trim() ? raw.size.trim().slice(0, 20) : null,
    stock: STOCK.has(raw.stock) ? raw.stock : 'unknown',
    sameProduct: SAME.has(raw.sameProduct) ? raw.sameProduct : 'unconfirmed',
    source,
    checkedAt,
    title: typeof raw.title === 'string' ? raw.title.slice(0, 200) : null,
  };
}

/** Why an offer can or cannot be compared for the requested option. */
function offerStatus(offer, { requested = {}, now = new Date() } = {}) {
  const flags = [];
  // Only confirmed stock takes part; "unknown" is the default for new and fetched offers.
  if (offer.stock === 'sold-out') flags.push('sold-out');
  else if (offer.stock !== 'in-stock') flags.push('stock-unknown');
  if (now - new Date(offer.checkedAt) > OFFER_STALE_DAYS * 86400000) flags.push('stale');
  const wantColor = requested.color || null, wantSize = requested.size || null;
  // Without the option the user means to buy, no price is known to apply to it.
  if (!wantColor || !wantSize) flags.push('request-incomplete');
  else if ((wantColor && offer.color && offer.color !== wantColor) || (wantSize && offer.size && offer.size !== wantSize)) flags.push('option-mismatch');
  else if ((wantColor && !offer.color) || (wantSize && !offer.size)) flags.push('option-unknown');
  if (offer.shipping === null) flags.push('shipping-unknown');
  if (offer.sameProduct !== 'confirmed') flags.push('product-unconfirmed');
  return {
    flags,
    comparable: flags.length === 0,
    total: offer.shipping === null ? null : offer.price + offer.shipping,
  };
}

/**
 * Comparable offers sorted by total (price + shipping), and the rest with their
 * reasons. requested.color/size are what the user wants to buy.
 */
function compareOffers(offers, { requested = {}, now = new Date() } = {}) {
  const rows = offers.map((offer) => ({ offer, ...offerStatus(offer, { requested, now }) }));
  const comparable = rows.filter((row) => row.comparable).sort((a, b) => a.total - b.total || a.offer.checkedAt.localeCompare(b.offer.checkedAt));
  const others = rows.filter((row) => !row.comparable);
  const reasons = {};
  for (const row of others) for (const flag of row.flags) reasons[flag] = (reasons[flag] || 0) + 1;
  return {
    comparable,
    others,
    best: comparable[0] || null,
    reasons,
    requestedComplete: !!(requested.color && requested.size),
  };
}

/**
 * Offers from a refresh replace that source's earlier offers. The user's own
 * records always stay; when over the cap, the oldest other records go first.
 */
function mergeRefreshed(existing, refreshed, source) {
  const kept = existing.filter((offer) => offer.source !== source);
  // A user's confirmation of a search result survives a refresh of the same link.
  const confirmed = new Map(existing.filter((offer) => offer.source === source).map((offer) => [offer.url, offer]));
  const next = refreshed.map((offer) => {
    const before = confirmed.get(offer.url);
    return before ? { ...offer, sameProduct: before.sameProduct, color: offer.color ?? before.color, size: offer.size ?? before.size, shipping: offer.shipping ?? before.shipping } : offer;
  });
  const all = [...kept, ...next];
  if (all.length <= MAX_OFFERS_PER_PRODUCT) return all;
  const others = all.filter((offer) => offer.source !== 'user');
  const room = Math.max(0, MAX_OFFERS_PER_PRODUCT - (all.length - others.length));
  const keep = new Set(others.slice(others.length - room));
  return all.filter((offer) => offer.source === 'user' || keep.has(offer));
}

// ── src/offer-store.js
// Seller notes are wardrobe data in schema 7: they share the snapshot's atomic
// save, backup and account choice. The localStorage API below remains only for
// reading/importing versions published before schema 7.


const OFFER_STORE_KEY = 'eoul:offers:v1';
const MAX_PRODUCTS = 100;
const MAX_OFFER_RECORDS = MAX_PRODUCTS;
const MAX_OFFER_STATE_BYTES = 200 * 1024;
const RECORD_KEYS = ['ref', 'requested', 'offers', 'refresh', 'touchedAt'];
const OFFER_KEYS = ['id', 'seller', 'url', 'price', 'shipping', 'color', 'size', 'stock', 'sameProduct', 'source', 'checkedAt', 'title'];

function shape(value, keys) {
  return !!value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}
function instant(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}
function referenceOK(ref) {
  if (typeof ref !== 'string' || !ref || ref.length > 2000) return false;
  if (/^ms-\d+$/.test(ref)) return true;
  try {
    const url = new URL(ref);
    return url.protocol === 'https:' && !url.username && !url.password && url.href === ref;
  } catch { return false; }
}
function offerStateError(message, code = 'invalid-offer-records') {
  return Object.assign(new Error(message), { code });
}
function validateRequested(value) {
  if (!shape(value, ['color', 'size']) ||
      !(value.color === null || (typeof value.color === 'string' && Object.hasOwn(COLORS, value.color))) ||
      !(value.size === null || (typeof value.size === 'string' && value.size.length > 0 && value.size.length <= 20 &&
        value.size === value.size.trim() && !/[\u0000-\u001f\u007f]/.test(value.size))))
    throw offerStateError('사려는 색·사이즈 기록을 읽지 못했어요. 원본을 보존했습니다.');
}

/** Persistence is strict: a damaged backup must never be silently normalized. */
function validateOfferRecords(records) {
  if (!Array.isArray(records) || records.length > MAX_OFFER_RECORDS)
    throw offerStateError(`판매처 가격은 상품 ${MAX_OFFER_RECORDS}개까지 보관할 수 있어요. 필요 없는 상품의 가격 기록을 지워 주세요.`, 'offer-full');
  const refs = new Set();
  for (const record of records) {
    if (!shape(record, RECORD_KEYS) || !referenceOK(record.ref) || !instant(record.touchedAt))
      throw offerStateError('판매처 가격 기록 형식을 읽지 못했어요. 원본을 보존했습니다.');
    if (refs.has(record.ref)) throw offerStateError('판매처 가격의 상품이 중복됩니다.');
    refs.add(record.ref);
    validateRequested(record.requested);
    if (record.refresh !== null && (!shape(record.refresh, ['at', 'ok', 'message']) ||
        !instant(record.refresh.at) || typeof record.refresh.ok !== 'boolean' ||
        typeof record.refresh.message !== 'string' || record.refresh.message.length > 1000 ||
        /[\u0000-\u001f\u007f]/.test(record.refresh.message)))
      throw offerStateError('가격 갱신 기록을 읽지 못했어요. 원본을 보존했습니다.');
    if (!Array.isArray(record.offers) || record.offers.length > MAX_OFFERS_PER_PRODUCT)
      throw offerStateError(`한 상품에는 판매처 ${MAX_OFFERS_PER_PRODUCT}곳까지 기록할 수 있어요. 필요 없는 판매처를 지워 주세요.`, 'offer-full');
    const ids = new Set();
    for (const offer of record.offers) {
      if (!shape(offer, OFFER_KEYS)) throw offerStateError('판매처 가격의 상세 형식을 읽지 못했어요. 원본을 보존했습니다.');
      const normalized = validateOffer(offer);
      if (OFFER_KEYS.some((key) => normalized[key] !== offer[key]))
        throw offerStateError('판매처 가격의 상세 정보가 올바르지 않아요. 원본을 보존했습니다.');
      if (ids.has(offer.id)) throw offerStateError('한 상품의 판매처 기록 ID가 중복됩니다.');
      ids.add(offer.id);
    }
  }
  if (new TextEncoder().encode(JSON.stringify(records)).length > MAX_OFFER_STATE_BYTES)
    throw offerStateError('판매처 가격 기록이 너무 커요. 백업 후 필요 없는 상품의 가격 기록을 지워 주세요. 기존 기록은 유지했습니다.', 'offer-budget');
  return records;
}

/** Read an independent copy so unsaved form edits cannot mutate the snapshot. */
function readOfferRecord(records, ref) {
  const record = records.find((entry) => entry.ref === ref);
  return structuredClone(record ? { requested: record.requested, offers: record.offers, refresh: record.refresh } :
    { requested: { color: null, size: null }, offers: [], refresh: null });
}

/** Pure replacement; only the caller's successful wardrobe commit saves it. */
function setOfferRecord(records, ref, { requested, offers, refresh }, now = new Date()) {
  validateOfferRecords(records);
  const record = { ref, requested: { color: requested?.color ?? null, size: requested?.size ?? null },
    offers: structuredClone(offers), refresh: structuredClone(refresh ?? null), touchedAt: now.toISOString() };
  const next = records.some((entry) => entry.ref === ref)
    ? records.map((entry) => structuredClone(entry.ref === ref ? record : entry))
    : [...structuredClone(records), record];
  return validateOfferRecords(next);
}

/** Explicit user deletion, also used to free the bounded record capacity. */
function removeOfferRecord(records, ref) {
  validateOfferRecords(records);
  return structuredClone(records.filter((entry) => entry.ref !== ref));
}

/** Lossless legacy import. Failure leaves the raw localStorage source intact. */
function legacyOfferRecords(raw) {
  if (raw === null) return [];
  let value;
  try { value = JSON.parse(raw); } catch { throw offerStateError('이전 판매처 가격 기록을 읽지 못했어요. 원본을 보존했습니다.'); }
  if (!shape(value, ['v', 'products']) || value.v !== 1 || !value.products ||
      typeof value.products !== 'object' || Array.isArray(value.products))
    throw offerStateError('이전 판매처 가격 기록 형식을 읽지 못했어요. 원본을 보존했습니다.');
  const records = Object.entries(value.products).map(([ref, entry]) => {
    if (!shape(entry, ['requested', 'offers', 'refresh', 'touchedAt']))
      throw offerStateError('이전 판매처 가격 상세 기록을 읽지 못했어요. 원본을 보존했습니다.');
    return { ref, ...structuredClone(entry) };
  });
  return validateOfferRecords(records);
}

function readAll(storage) {
  try {
    const value = JSON.parse(storage?.getItem(OFFER_STORE_KEY) || 'null');
    return value && value.v === 1 && value.products && typeof value.products === 'object' ? value : { v: 1, products: {} };
  } catch {
    return { v: 1, products: {} };
  }
}
function writeAll(storage, value) {
  const keys = Object.keys(value.products);
  // Oldest touched products go first when the cap is reached.
  if (keys.length > MAX_PRODUCTS)
    for (const key of keys.sort((a, b) => (value.products[a].touchedAt || '').localeCompare(value.products[b].touchedAt || '')).slice(0, keys.length - MAX_PRODUCTS))
      delete value.products[key];
  try {
    storage?.setItem(OFFER_STORE_KEY, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function offerRef({ productId = null, url = null } = {}) {
  if (typeof productId === 'string' && /^ms-\d+$/.test(productId)) return productId;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password && parsed.href.length <= 2000 ? parsed.href : null;
  } catch { return null; }
}

function readOffers(storage, ref) {
  const entry = ref ? readAll(storage).products[ref] : null;
  const offers = [];
  for (const raw of entry?.offers || []) {
    try { offers.push(validateOffer(raw)); } catch {}
  }
  return {
    requested: {
      color: entry?.requested?.color && Object.hasOwn(COLORS, entry.requested.color) ? entry.requested.color : null,
      size: typeof entry?.requested?.size === 'string' && entry.requested.size ? entry.requested.size.slice(0, 20) : null,
    },
    offers,
    refresh: entry?.refresh || null,
  };
}

/** Returns false when the browser refused to store (full or blocked); the caller keeps the input. */
function writeOffers(storage, ref, { requested, offers, refresh }, now = new Date()) {
  if (!ref) return false;
  const all = readAll(storage);
  all.products[ref] = {
    requested: { color: requested?.color || null, size: requested?.size || null },
    offers: offers.slice(-MAX_OFFERS_PER_PRODUCT),
    refresh: refresh || null,
    touchedAt: now.toISOString(),
  };
  return writeAll(storage, all);
}

function clearOffers(storage) {
  try { storage?.removeItem(OFFER_STORE_KEY); } catch {}
}

// ── mockups/ux10v2/src/core.mjs
// UX 시안 10개 2판(실제 웹앱 형태)이 함께 쓰는 목업 코어. 1판(app/mockups/ux10/src/core.mjs)을 바탕으로 했다.
// 실제 앱의 엔진(검색·비교·코디·구매 기록)을 화면과 무관한 API로 감싼다.
// 시안은 화면만 다르게 만들고, 판단 문장과 규칙은 모두 여기서 온다(현재 앱의 구매 비교 화면과 같은 순서).
// 2판에서 바뀐 것: 상품·옷장·코디를 그림 대신 사진으로 보여 준다(실제 앱과 같은 규칙: 상품은 판매처 사진,
// 종류·색만 아는 옷은 '비슷한 상품 사진'), 안내문은 짧게 줄이고 자세한 고지는 한 곳(disclosure)에 모은다,
// 주소(#/...)로 화면을 옮겨 브라우저 뒤로가기가 동작하게 하는 route를 둔다.
// 저장은 이 브라우저에만, 앱과 다른 키로 한다. 앱 저장소·서버는 건드리지 않는다.











const MOCK_API_VERSION = 2;

function createMock({ storage = null, key = 'eoul-mockup-ux10v2:v1', clock = () => new Date(), reset = false, photos = true } = {}) {
  const DECISION_LABEL = { buy: '사기로 함', hold: '보류', skip: '안 사기로 함' };
  const RETURN_LABEL = { size: '사이즈', color: '색', quality: '품질', 'change-of-mind': '마음이 바뀜', other: '기타' };
  const FINE = '종류·색과 코디 공식으로 비교했어요. 소재·핏·사이즈·현재 가격은 판매처에서 확인해요.';
  // 화면에는 짧은 문구(short)만 한 번씩 쓰고, 자세한 고지는 disclosure 한 곳에 모은다.
  const NOTE = {
    mock: '시안',
    ai: 'AI가 디자이너·프론트엔드 개발자 10팀 역할로 만든 시안이에요. 실제 수상 디자이너나 빅테크 디자이너가 참여하지 않았어요.',
    catalog: `상품 이름·가격·사진은 ${CATALOG.checkedLabel} ${CATALOG.store} 상품 페이지에서 수집한 개인 시험용 자료예요.`,
    price: '수집일 가격이에요. 현재가·최저가가 아니고 쿠폰·배송비는 빠져 있어요.',
    rules: '대화형 AI가 아니라 정해진 규칙으로 요청을 읽어요. 못 읽은 말은 못 읽었다고 알려요.',
    records: '주문·수령·반품은 직접 남긴 기록이에요. 확인된 거래가 아니에요.',
    photos: '상품 사진은 무신사 이미지 서버의 주소를 그대로 불러와요(저장소에 사진 파일 없음). 사용 권리는 확인되지 않았어요.',
    similar: '사진 없이 종류·색으로 넣은 옷은 같은 종류·색의 비슷한 상품 사진으로 보여 줘요. 실제 옷과 다를 수 있어요.',
    short: { price: '수집가', records: '직접 남긴 기록', similar: '비슷한 상품 사진', used: '외부 검색 · 매물 확인 안 함', rules: '규칙으로 읽었어요', trial: '체험용' },
  };
  // 체험용 옷장: 같은 요청 안에서도 "겹쳐요·색만 달라요"가 갈리고, 코트처럼 없는 종류에서는 새 코디가 생기도록 고른 구성.
  const TRIAL = {
    M: [['m-oxford', 'white', '흰 옥스퍼드 셔츠'], ['m-tee', 'white', '흰 무지 티셔츠'], ['m-knit', 'navy', '네이비 크루넥 니트'], ['m-blazer', 'navy', '네이비 블레이저'],
      ['m-chino', 'beige', '베이지 치노 팬츠'], ['m-denim', 'indigo', '인디고 워시드 데님'], ['m-loafer', 'brown', '브라운 로퍼'], ['m-white-sneaker', 'white', '흰 스니커즈']],
    F: [['f-tee', 'white', '흰 티셔츠'], ['f-knit', 'beige', '베이지 니트'], ['f-trench', 'beige', '베이지 트렌치 코트'], ['f-slacks', 'black', '블랙 슬랙스'],
      ['f-denim', 'blue', '라이트 블루 데님'], ['f-loafer', 'black', '블랙 로퍼'], ['f-sneaker', 'white', '흰 스니커즈']],
  };
  const EXAMPLES = {
    M: ['출근용 셔츠 10만원 이하', '겨울 데이트 코트', '검정 말고 주말에 입을 편한 바지', '흰 스니커즈 10만원 이하', '하객룩 셔츠', '아메카지 재킷'],
    F: ['출근용 셔츠 10만원 이하', '원피스 10만원 이하', '겨울 코트 20만원 이하', '데이트 스커트', '가성비 니트', '흰 스니커즈'],
  };
  // 정직한 답을 보여 주는 요청: 없는 종류, 성별과 맞지 않는 종류, 못 읽는 말, 이어서 묻기.
  const EDGE_EXAMPLES = ['반바지', '남자 원피스', '꾸안꾸 느낌으로', '더 싼 걸로'];

  const listeners = new Set();
  const blank = () => ({ v: 1, gender: 'M', garments: [], journeys: [], trialIds: [], absences: {}, compare: [], recent: [], seq: 0 });
  let S = blank();
  let version = 0;
  let cache = { version: -1, state: null, judge: new Map() };
  let lastAsk = null;
  const scrollMemo = new Map();

  const iso = () => clock().toISOString();
  const today = () => {
    const d = clock();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const nextId = (prefix) => `${prefix}_mock_${Date.now().toString(36)}_${(S.seq++).toString(36)}`;
  const uniq = (rows) => [...new Map(rows.map((row) => [row.id, row])).values()];
  const colorLabel = (c) => COLORS[c]?.label || '색 미확인';
  const colorHex = (c) => COLORS[c]?.hex || null;

  function buildState(record) {
    const base = {
      ...newWardrobeState(), demo: false, demoSelected: [], gender: record.gender,
      garments: record.garments, journeys: record.journeys,
    };
    return { ...wardrobeView(base), now: today() };
  }
  function load() {
    try {
      const raw = storage?.getItem(key);
      if (!raw) return blank();
      const v = JSON.parse(raw);
      if (v?.v !== 1 || !Array.isArray(v.garments) || !Array.isArray(v.journeys)) return blank();
      const next = { ...blank(), ...v, trialIds: Array.isArray(v.trialIds) ? v.trialIds : [], absences: v.absences && typeof v.absences === 'object' ? v.absences : {},
        compare: Array.isArray(v.compare) ? v.compare.filter((id) => PRODUCT_BY_ID[id]).slice(0, 4) : [], recent: Array.isArray(v.recent) ? v.recent.filter((x) => typeof x === 'string').slice(0, 5) : [] };
      next.gender = next.gender === 'F' ? 'F' : 'M';
      buildState(next); // 읽을 수 없는 기록이면 처음 상태로 시작한다.
      return next;
    } catch {
      return blank();
    }
  }
  function save() {
    try { storage?.setItem(key, JSON.stringify(S)); } catch { /* 저장이 막힌 브라우저에서도 화면은 동작한다. */ }
  }
  function notify() {
    for (const fn of [...listeners]) {
      try { fn(api.getState()); } catch (error) { console.error(error); }
    }
  }
  function commit(change) {
    const before = structuredClone(S);
    try {
      change();
      buildState(S); // 엔진 검증을 통과해야만 저장한다.
    } catch (error) {
      S = before;
      throw error;
    }
    version++;
    save();
    notify();
  }
  function engineState() {
    if (cache.version !== version || !cache.state) cache = { version, state: buildState(S), judge: new Map() };
    return cache.state;
  }
  const isTrial = (id) => S.trialIds.includes(id);
  const journeyFor = (productId) => S.journeys.find((j) => j.candidate.productId === productId) || null;
  const replaceJourney = (next) => { S.journeys = [...S.journeys.filter((j) => j.id !== next.id), next]; };

  // ── 보이는 모양
  function garmentView(g) {
    const slot = SLOT_BY_ID[g.slot];
    const bought = !!g.productId;
    return {
      id: g.id, kind: g.kind, kindName: garmentKindName(g.kind), slot: g.slot || null, slotName: slot?.name || null,
      label: g.label || garmentLabel(g), gender: g.gender, color: g.color, colorLabel: colorLabel(g.color), colorHex: colorHex(g.color),
      trial: isTrial(g.id), bought, productId: g.productId || null,
      sourceLabel: isTrial(g.id) ? '체험용' : bought ? '기록에서 산 옷' : '내 옷',
      detailMissing: !g.slot ? '세부 종류 미확인' : !g.color ? '색 미확인' : null,
      photo: garmentPhoto(g),
    };
  }
  // ── 사진 (실제 앱 main.js의 picture/slotPicture와 같은 규칙)
  // 상품: 판매처 사진. 산 옷: 그 상품 사진. 종류·색만 아는 옷: 같은 세부 종류·색의 비슷한 상품 사진(표시 필수).
  // 세부 종류나 색을 모르는 옷: 특정 상품처럼 보이지 않게 사진 없이 색 카드.
  const PHOTO_HOST = /^https:\/\/image\.msscdn\.net\//;
  const productPhoto = (p) => (photos && p?.img && PHOTO_HOST.test(p.img) ? { src: p.img, similar: false, alt: `${p.brand} ${p.name}`, caption: '' } : null);
  function garmentPhoto(g) {
    if (!photos) return null;
    if (g.productId && PRODUCT_BY_ID[g.productId]) return productPhoto(PRODUCT_BY_ID[g.productId]);
    if (!g.slot || !g.color) return null;
    const like = lookalike(g.slot, g.color, { brand: g.brand || null });
    const ph = productPhoto(like);
    return ph ? { ...ph, similar: true, alt: `비슷한 상품 사진 · ${colorLabel(g.color)} ${SLOT_BY_ID[g.slot]?.name || ''}`.trim(), caption: NOTE.short.similar } : null;
  }
  // 카드·옷·코디 칸·기록 무엇을 받아도 사진을 찾는다(코어가 돌려준 값에는 photo가 이미 들어 있다).
  function photoOf(target) {
    if (!target) return null;
    if ('photo' in target) return target.photo;
    const pid = PRODUCT_BY_ID[target.id] ? target.id : PRODUCT_BY_ID[target.productId] ? target.productId : PRODUCT_BY_ID[target.product?.id] ? target.product.id : null;
    if (pid) return productPhoto(PRODUCT_BY_ID[pid]);
    const g = S.garments.find((x) => x.id === target.id);
    if (g) return garmentPhoto(g);
    if (target.slot && target.color) return garmentPhoto({ slot: target.slot, color: target.color });
    return null;
  }
  const escAttr = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // 사진이 없거나 못 불러올 때 보이는 색 카드(그림 아님): 색 바탕 + 종류 이름.
  function tileHtml(target) {
    const slot = SLOT_BY_ID[target?.slot];
    const hex = target?.colorHex || colorHex(target?.color) || '#e9e9e9';
    const light = COLORS[target?.color]?.light ?? 80;
    const name = target?.kindName || slot?.name || garmentKindName(target?.kind) || '옷';
    return `<span class="eo-tile" data-photo="none" style="display:flex;align-items:flex-end;justify-content:flex-start;width:100%;height:100%;aspect-ratio:var(--eo-ratio,4/5);background:${hex};color:${light < 55 ? '#fff' : '#222'};font:600 12px/1.3 system-ui,sans-serif;padding:8px;box-sizing:border-box;border-radius:inherit">${escAttr(name)}</span>`;
  }
  function photoHtml(target, { fit = 'cover', caption = true, alt = null, eager = false } = {}) {
    const ph = photoOf(target);
    if (!ph) return tileHtml(target);
    const fallback = tileHtml(target).replace(/"/g, '&quot;');
    const cap = ph.similar && caption ? `<span class="eo-cap" style="position:absolute;left:6px;bottom:6px;max-width:calc(100% - 12px);padding:2px 6px;border-radius:4px;background:rgba(255,255,255,.92);color:#333;font:600 11px/1.4 system-ui,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${NOTE.short.similar}</span>` : '';
    return `<span class="eo-ph" data-photo="${ph.similar ? 'similar' : 'product'}" style="position:relative;display:block;width:100%;height:100%;aspect-ratio:var(--eo-ratio,4/5);background:#f3f3f1;border-radius:inherit;overflow:hidden"><img src="${escAttr(ph.src)}" alt="${escAttr(alt ?? ph.alt)}" referrerpolicy="no-referrer"${eager ? '' : ' loading="lazy"'} decoding="async" onerror="this.parentNode.outerHTML='${fallback.replace(/'/g, '&#39;')}'" style="display:block;width:100%;height:100%;object-fit:${fit === 'contain' ? 'contain' : 'cover'};border-radius:inherit">${cap}</span>`;
  }

  function card(product, { slot = SLOT_BY_ID[product.slot], reasons = null, offOccasion = false } = {}) {
    const fixed = productReasons(product, slot, reasons || [slot.why]);
    const st = engineState();
    return {
      id: product.id, brand: product.brand, name: product.name,
      price: product.price, priceText: formatPrice(product.price),
      priceNote: `${Number(product.checkedAt.slice(5, 7))}월 ${Number(product.checkedAt.slice(8, 10))}일 수집가`,
      priceShort: `${Number(product.checkedAt.slice(5, 7))}/${Number(product.checkedAt.slice(8, 10))} 수집가`,
      photo: productPhoto(product),
      checkedAt: product.checkedAt, store: product.store, url: product.url,
      color: product.color, colorLabel: colorLabel(product.color), colorHex: colorHex(product.color),
      colorFromPhoto: product.colorSource === 'image',
      kind: slot.shape, kindName: garmentKindName(slot.shape), slot: slot.id, slotName: slot.name, gender: slot.g,
      rating: product.rating ?? null, reviews: product.reviews ?? null,
      reason: fixed.reasons[0] || slot.why, reasons: fixed.reasons, traitLine: fixed.traitLine && fixed.traitLine !== fixed.reasons[0] ? fixed.traitLine : null,
      offOccasion: !!offOccasion,
      owned: ownedQuick(product, slot, st),
      record: recordView(journeyFor(product.id)),
    };
  }
  // 목록용 빠른 보유 판정: 앱의 카드 문장(ownedLine)과 같은 규칙.
  function ownedQuick(product, slot, st) {
    const mine = st.closet.filter((i) => i.gender === slot.g && ['user', 'legacy'].includes(i.source));
    if (!mine.length) return { tone: 'none', label: '옷장 없이', text: '' };
    const kind = garmentKindName(slot.shape);
    const same = mine.filter((i) => i.productId === product.id);
    if (same.length) return { tone: 'stop', label: '이미 있어요', text: '옷장에 있는 상품이에요' };
    const qc = quickCompare(st, { kind: slot.shape, color: product.colorSource === 'image' ? null : product.color, gender: slot.g });
    // 겹친 옷이 모두 체험용이면 '내 옷장'이 아니라 체험용 옷장이라고 쓴다.
    const where = (rows) => rows.every((g) => isTrial(g.id)) ? '체험용 옷장에' : '옷장에';
    const tag = (rows) => rows.every((g) => isTrial(g.id)) ? ' · 체험용' : '';
    if (qc.sameColor.length) return { tone: 'stop', label: `겹쳐요${tag(qc.sameColor)}`, text: `${where(qc.sameColor)} 같은 종류·색 ${kind} ${qc.sameColor.length}벌`, trial: qc.sameColor.every((g) => isTrial(g.id)) };
    if (qc.otherColor.length) return { tone: 'info', label: `색만 달라요${tag(qc.otherColor)}`, text: `${where(qc.otherColor)} ${kind} ${qc.otherColor.length}벌 · 색은 달라요`, trial: qc.otherColor.every((g) => isTrial(g.id)) };
    if (qc.unknownColor.length) return { tone: 'info', label: `색 확인${tag(qc.unknownColor)}`, text: `${where(qc.unknownColor)} ${kind} ${qc.unknownColor.length}벌 · 색 확인 필요`, trial: qc.unknownColor.every((g) => isTrial(g.id)) };
    return { tone: 'new', label: '없는 종류', text: `${mine.every((g) => isTrial(g.id)) ? '체험용 옷' : '등록한 옷'} 중 ${kind}${josa(kind, '은', '는')} 아직 없어요` };
  }
  function outfitView(result, { candidateId = null, focusId = null } = {}) {
    if (!result) return null;
    const copy = outfitCopy(result);
    const pieces = [...result.items]
      .sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role))
      .map((row) => {
        const isCandidate = row.source === 'candidate' || (!row.owned && row.candidate);
        const product = row.product || (isCandidate && candidateId ? PRODUCT_BY_ID[candidateId] : null);
        const slot = row.slot || (row.item ? SLOT_BY_ID[row.item.slot] : null) || (product ? SLOT_BY_ID[product.slot] : null);
        const color = row.owned ? row.item?.color ?? row.color : product?.color ?? row.color;
        return {
          role: row.role, roleLabel: ROLE_LABEL[row.role] || '',
          garmentId: row.owned ? row.item?.id ?? null : null,
          owned: !!row.owned, trial: !!(row.owned && row.item && isTrial(row.item.id)),
          candidate: !!isCandidate || (!!product && product.id === candidateId),
          focus: !!product && product.id === focusId,
          label: row.owned ? (row.item?.label || garmentLabel(row.item || { kind: slot?.shape })) : product ? `${product.brand} ${product.name}` : slot?.name || '',
          kindName: garmentKindName(slot?.shape || row.item?.kind), slot: slot?.id || null,
          color, colorLabel: colorLabel(color), colorHex: colorHex(color),
          uncertain: row.certainty === 'uncertain',
          photo: row.owned ? (row.item ? garmentPhoto(row.item) : null) : product ? productPhoto(product) : (slot && color ? garmentPhoto({ slot: slot.id, color }) : null),
          product: product && !row.owned ? { id: product.id, brand: product.brand, name: product.name, price: product.price, priceText: formatPrice(product.price), url: product.url } : null,
        };
      });
    const buy = pieces.filter((p) => !p.owned && p.product && !p.candidate);
    return {
      id: result.look?.id || null, formula: result.look?.title || '', title: copy.title, note: copy.note,
      pieces, ownedCount: pieces.filter((p) => p.owned).length, buyCount: buy.length,
      buyTotal: buy.reduce((sum, p) => sum + (p.product?.price || 0), 0),
      buyTotalText: buy.length ? formatPrice(buy.reduce((sum, p) => sum + (p.product?.price || 0), 0)) : '',
      uncertainCount: result.uncertainCount || 0,
    };
  }
  function recordView(j) {
    if (!j) return null;
    const p = PRODUCT_BY_ID[j.candidate.productId];
    const stageLabel = {
      candidate: j.decision === 'buy' ? '사기로 함 · 주문 전' : j.decision ? DECISION_LABEL[j.decision] : '비교 중',
      ordered: '주문했다고 기록함', received: '받음 · 계속 입을지 결정 전', kept: '계속 입는 내 옷', returned: '반품했다고 기록함',
    }[j.stage];
    const next = {
      candidate: [{ step: 'ordered', label: '주문했어요' }],
      ordered: [{ step: 'received', label: '받았어요' }],
      received: [{ step: 'kept', label: '계속 입을게요' }, { step: 'returned', label: '반품했어요', needsReason: true }],
      kept: [{ step: 'worn', label: '오늘 입었어요' }, { step: 'returned', label: '반품했어요', needsReason: true }],
      returned: [],
    }[j.stage];
    const last = j.history[j.history.length - 1];
    return {
      id: j.id, productId: j.candidate.productId,
      product: p ? { id: p.id, brand: p.brand, name: p.name, price: p.price, priceText: formatPrice(p.price), url: p.url, photo: productPhoto(p), color: p.color, colorHex: colorHex(p.color), colorLabel: colorLabel(p.color), slot: p.slot, kind: SLOT_BY_ID[p.slot]?.shape, kindName: garmentKindName(SLOT_BY_ID[p.slot]?.shape) } : null,
      decision: j.decision, decisionLabel: j.decision ? DECISION_LABEL[j.decision] : '결정 전',
      stage: j.stage, stageLabel, next, wearCount: j.wearCount,
      returnReason: j.feedback?.returnReason || null, returnReasonLabel: RETURN_LABEL[j.feedback?.returnReason] || null,
      updatedAt: last?.at || null,
    };
  }

  // ── API
  const api = {
    apiVersion: MOCK_API_VERSION,
    note: NOTE,
    catalog: { store: CATALOG.store, checkedLabel: CATALOG.checkedLabel, count: CATALOG.count, rights: CATALOG.rights },
    returnReasons: JOURNEY_RETURN_REASONS.map((id) => ({ id, label: RETURN_LABEL[id] })),
    version: () => version,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    getState() {
      const st = engineState();
      const closet = st.closet.map(garmentView);
      return {
        gender: S.gender,
        closet,
        closetCount: closet.length,
        trialCount: closet.filter((g) => g.trial).length,
        mineCount: closet.filter((g) => !g.trial).length,
        records: S.journeys.map(recordView).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))),
      };
    },
    setGender(g) { commit(() => { S.gender = g === 'F' ? 'F' : 'M'; }); },
    reset() { commit(() => { S = blank(); }); lastAsk = null; },
    examples: (gender = S.gender) => [...EXAMPLES[gender === 'F' ? 'F' : 'M']],
    edgeExamples: () => [...EDGE_EXAMPLES],
    kindChoices: (gender = S.gender) => garmentKindChoices(gender === 'F' ? 'F' : 'M').map((k) => ({ id: k.id, name: k.name })),
    slotChoices: (kind, gender = S.gender) => SLOTS.filter((s) => s.g === (gender === 'F' ? 'F' : 'M') && s.shape === kind).map((s) => ({ id: s.id, name: s.name })),
    colorChoices: () => Object.entries(COLORS).map(([id, c]) => ({ id, label: c.label, hex: c.hex, light: c.light ?? 50 })),
    formatPrice,

    addGarment({ kind, color = null, slot = null, gender = S.gender, label = '', trial = false } = {}) {
      const g = gender === 'F' ? 'F' : 'M';
      if (!GARMENT_KINDS.some((k) => k.id === kind)) throw new Error('옷 종류를 골라 주세요.');
      const s = slot && SLOT_BY_ID[slot]?.shape === kind && SLOT_BY_ID[slot]?.g === g ? slot : null;
      const garment = makeGarment({ id: nextId('g'), slot: s, kind, gender: g, color: COLORS[color] ? color : null, label: String(label || ''), source: 'user', createdAt: iso() });
      commit(() => {
        S.garments = [...S.garments, garment];
        if (trial) S.trialIds = [...S.trialIds, garment.id];
      });
      return garmentView(garment);
    },
    updateGarment(id, { color, slot } = {}) {
      commit(() => {
        S.garments = S.garments.map((g) => {
          if (g.id !== id) return g;
          const next = { ...g };
          if (color !== undefined) next.color = COLORS[color] ? color : null;
          if (slot !== undefined) next.slot = slot && SLOT_BY_ID[slot]?.shape === g.kind && SLOT_BY_ID[slot]?.g === g.gender ? slot : null;
          return next;
        });
      });
    },
    removeGarment(id) {
      const linked = S.journeys.some((j) => j.garmentId === id);
      if (linked) throw new Error('구매 기록과 연결된 옷이에요. 기록에서 반품으로 정리해 주세요.');
      commit(() => {
        S.garments = S.garments.filter((g) => g.id !== id);
        S.trialIds = S.trialIds.filter((x) => x !== id);
      });
    },
    loadTrialCloset(gender = S.gender) {
      const g = gender === 'F' ? 'F' : 'M';
      commit(() => {
        const old = new Set(S.trialIds);
        S.garments = S.garments.filter((x) => !old.has(x.id));
        const rows = TRIAL[g].map(([slot, color, label]) => makeGarment({ id: nextId('g'), slot, kind: SLOT_BY_ID[slot].shape, gender: g, color, label, source: 'user', createdAt: iso() }));
        S.garments = [...S.garments, ...rows];
        S.trialIds = rows.map((x) => x.id);
        S.gender = g;
      });
    },
    clearTrialCloset() {
      commit(() => {
        const old = new Set(S.trialIds);
        S.garments = S.garments.filter((x) => !old.has(x.id));
        S.trialIds = [];
      });
    },

    // 한 줄 요청 → 실제 상품과 조건·안내. 조건을 몰래 넓히지 않는다(검색 엔진 규칙 그대로).
    ask(text, { drop = [], previous = null } = {}) {
      const said = String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
      const base = { said, text: said, understood: false, title: '', conditions: [], dropped: [], notices: [], products: [], offOccasion: [], total: 0, outfit: null, outfitNote: null, listNote: '', criteria: null, gender: S.gender, season: null, seasonLabel: '', examples: api.examples() };
      if (!said) return { ...base, title: '찾고 싶은 옷을 적어 주세요', notices: [{ kind: 'empty-input', text: '예: 출근용 셔츠 10만원 이하' }] };
      let query = said, follow = null;
      const prev = typeof previous === 'string' ? previous : previous?.text;
      if (prev) {
        const resolved = resolveSearchFollowUp(prev, said);
        if (resolved) { query = resolved.query; follow = resolved.follow; }
      }
      let r;
      try {
        r = search(engineState(), query, { drop });
      } catch (error) {
        return { ...base, text: query, title: '요청을 읽지 못했어요', notices: [{ kind: 'error', text: '다른 말로 다시 적어 주세요.' }] };
      }
      const conditions = r.conds.map((c) => ({ key: c.key, label: c.saved ? `${c.label} (내 설정)` : c.label, removable: c.key !== 'kind' }));
      const notices = [];
      if (follow) notices.push({ kind: 'follow', text: follow.clarification ? `‘${follow.said}’: ${follow.clarification}` : `‘${follow.said}’는 이전 조건을 그대로 두고 ${follow.order}으로 다시 찾았어요. 새로 찾으려면 종류까지 적어 주세요.` });
      else if (/^\s*(?:좀\s*)?더\s*(싼|저렴한|비싼|좋은|나은|괜찮은)/.test(said) && !prev)
        notices.push({ kind: 'follow-missing', text: '이어서 물을 이전 요청이 없어요. 찾을 옷 종류부터 적어 주세요.' });
      if (!r.understood) {
        lastAsk = null;
        return { ...base, text: query, title: `‘${said}’는 아직 찾을 수 없어요`, notices: [...notices, { kind: 'not-understood', text: '이 말에 맞는 조건을 찾지 못해서 상품을 고르지 않았어요. 옷 종류·상황·예산으로 다시 적어 주세요.' }], examples: api.examples(r.gender) };
      }
      const kindLabel = r.conds.find((x) => x.key === 'kind')?.label || '이 종류';
      if (r.genderFromKind) notices.push({ kind: 'gender', text: `${kindLabel}${josa(kindLabel, '은', '는')} ${r.genderFromKind === 'F' ? '여성' : '남성'} 상품에만 있어서 ${r.genderFromKind === 'F' ? '여성' : '남성'} 상품에서 찾았어요.` });
      if (r.query.unsupported?.length) notices.push({ kind: 'unsupported', text: `반영하지 못한 조건: ${r.query.unsupported.join(', ')}. 상품 자료에 이 정보가 없어서 이 조건 없이 골랐어요.` });
      if (r.query.unknown?.length) notices.push({ kind: 'unknown', text: `이해하지 못한 말: ${r.query.unknown.join(', ')}. 이 말은 빼고 골랐어요.` });
      if (r.query.comfort) notices.push({ kind: 'comfort', text: '착용감 자료는 없어요. 상품명에 ‘밴딩·이지·와이드’ 같은 표기가 있는 상품을 앞에 뒀어요.' });
      if (r.query.qualityUnavailable) notices.push({ kind: 'quality', text: '품질을 비교할 자료는 없어요. 가격으로 품질을 판단하지 않았어요.' });
      const none = !r.items.length;
      if (none) {
        notices.push(r.kindUnavailable
          ? { kind: 'kind-unavailable', text: `${r.kindNowhere ? '상품 목록에 아직' : `${r.gender === 'F' ? '여성' : '남성'} 상품에는`} ${r.kindUnavailable}${josa(r.kindUnavailable, '이', '가')} 없어요. 다른 종류로 바꿔 채우지 않았어요.` }
          : { kind: 'empty', text: `조건에 맞는 상품이 없어요. 조건을 자동으로 넓히지 않았어요.${conditions.some((c) => c.removable) ? ' 조건을 직접 빼고 다시 찾을 수 있어요.' : ''}` });
      }
      const fit = r.items.filter((x) => !x.offOccasion).map((x) => card(x.product, { slot: x.slot, reasons: x.reasons, offOccasion: false }));
      const off = r.items.filter((x) => x.offOccasion).map((x) => card(x.product, { slot: x.slot, reasons: x.reasons, offOccasion: true }));
      const occLabel = r.conds.find((x) => x.key === 'occasion')?.label || '';
      const outfit = r.outfit && !none ? outfitView(r.outfit) : null;
      const outfitNote = outfit
        ? (r.criteria.maxPrice != null ? '예산은 상품 한 벌 기준이에요(코디 합계 아님).' : null)
        : r.outfitTried && !none && (r.criteria.occasionFromQuery || r.criteria.excludedItems.length)
          ? `검색 조건(${criteriaLine({ occasion: r.criteria.occasion, season: r.criteria.season, style: r.criteria.style, excludedItems: r.criteria.excludedItems })})을 지키는 코디 공식은 없어요. 조건을 풀지 않았어요.`
          : null;
      const result = {
        ...base,
        text: query, understood: true,
        title: none ? '맞는 상품이 없어요' : r.dropped.length ? `${r.conds.map((x) => x.label).join(' · ') || '조건 없이'} 조건으로 다시 골랐어요` : (r.query.summary || `‘${said}’ 결과`),
        conditions, dropped: r.dropped, notices,
        products: fit, offOccasion: off, offOccasionTitle: off.length ? `${occLabel}에는 덜 맞는 대안 ${off.length}개` : '',
        total: r.items.length,
        outfit, outfitNote,
        listNote: r.query.priceSort ? `수집일 가격이 ${r.query.priceSort === 'desc' ? '높은' : '낮은'} 순서예요` : `${SEASON_LABEL[r.season]} 기준 · 평점과 후기 수를 함께 봤어요`,
        criteria: r.criteria, gender: r.gender, season: r.season, seasonLabel: SEASON_LABEL[r.season],
        examples: api.examples(r.gender),
      };
      lastAsk = { ids: new Set(r.items.map((x) => x.product.id)), criteria: r.criteria };
      if (!drop.length && said !== S.recent[0]) { S.recent = [said, ...S.recent.filter((x) => x !== said)].slice(0, 5); save(); }
      return result;
    },

    // 상품 자세히: 이유, 같은 조건의 다른 선택, 이 상품으로 만든 코디, 판정.
    product(id, { criteria = 'auto' } = {}) {
      const p = PRODUCT_BY_ID[id];
      if (!p) return null;
      const slot = SLOT_BY_ID[p.slot];
      const st = engineState();
      const cr = criteria === 'auto' ? (lastAsk?.ids.has(id) ? lastAsk.criteria : null) : criteria;
      const g = slot.g;
      const styles = st.styles.filter((k) => STYLES[k]?.g.includes(g));
      const closet = st.closet.filter((i) => i.gender === g);
      const c = { gender: g, styles: styles.length ? styles : ['classic'], occasion: st.occasion, season: seasonOf(new Date(st.now)), closet, ownedSlots: new Set(closet.map((i) => i.slot)) };
      const { reasons } = scoreSlot(slot, c);
      const allowed = (text) => !(cr?.excludedItems || []).some((kind) => text.includes(kind));
      const fixed = productReasons(p, slot, [slot.why, ...reasons]);
      const why = [...new Set([...(fixed.traitLine ? [fixed.traitLine] : []), ...fixed.reasons])].filter(allowed).slice(0, 4);
      const sameKind = productsFor(slot.id).filter((x) => x.id !== p.id);
      const alts = sameKind.filter((x) => meetsCriteria(x, cr));
      const outside = sameKind.length - alts.length;
      const look = recommendLooks(
        { ...st, closet: st.closet.filter((item) => !(cr?.excludeColors || []).includes(item.color)), gender: g,
          styles: cr?.style ? [cr.style] : c.styles, season: cr?.season || undefined,
          budget: cr ? cr.maxPrice : null, minPrice: cr?.minPrice ?? null,
          minPriceExclusive: !!cr?.minPriceExclusive, maxPriceExclusive: !!cr?.maxPriceExclusive,
          hidden: [...(st.hidden || []), ...(cr?.excludeColors?.length ? SAFE_PRODUCTS.filter((x) => cr.excludeColors.includes(x.color)).map((x) => x.id) : [])] },
        { limit: 1, occasion: cr?.occasion || null, strictOccasion: !!cr?.occasionFromQuery, excludeSlot: cr?.excludeSlot || null, pinnedProduct: p },
      )[0] || null;
      const kept = cr ? criteriaLine({ ...cr, color: null, tone: null, brand: null }) : '';
      return {
        ...card(p, { slot }),
        why, tip: allowed(slot.tip) ? `이렇게 입어요: ${slot.tip}` : null,
        popularity: p.rating ? `평점 ${p.rating} · 후기 ${Number(p.reviews || 0).toLocaleString('ko-KR')}개 (인기 정보예요. 색·사이즈·핏을 보장하지 않아요.)` : null,
        colorNote: p.colorSource === 'image' ? '색은 상품 사진에서 추정했어요' : '색은 상품명·편집 분류 기준이에요',
        alternatives: alts.slice(0, 8).map((x) => card(x, { slot })),
        alternativesNote: cr && outside ? `검색 조건(${criteriaLine(productCriteria(cr))})에 맞지 않는 같은 종류 ${outside}개는 뺐어요.` : null,
        outfit: outfitView(look, { focusId: p.id }),
        outfitNote: look ? (kept ? `검색 조건(${kept})을 코디의 다른 옷에도 그대로 적용했어요. 예산은 옷 한 벌마다 같은 기준이에요.` : null)
          : kept ? `검색 조건(${kept})을 지키면서 만들 수 있는 코디가 없어요. 조건을 풀지 않았어요.` : null,
        keptConditions: kept || null,
        verdict: api.judge(id),
      };
    },

    // 내 옷 기준 판정. 현재 앱의 구매 비교 화면과 같은 순서로 결론을 고른다.
    judge(id) {
      const st = engineState();
      if (cache.judge.has(id)) return cache.judge.get(id);
      const p = PRODUCT_BY_ID[id];
      if (!p) return null;
      const slot = SLOT_BY_ID[p.slot];
      const j = journeyFor(id);
      const mine = st.closet.filter((g) => g.gender === slot.g && ['user', 'legacy'].includes(g.source));
      const trialN = mine.filter((g) => isTrial(g.id)).length, ownN = mine.length - trialN;
      const basis = !mine.length ? 'none' : !ownN ? 'trial' : !trialN ? 'mine' : 'mixed';
      const basisLabel = basis === 'none' ? '옷장 없이 판단했어요' : basis === 'trial' ? `체험용 옷 ${trialN}벌 기준` : basis === 'mine' ? `내 옷 ${ownN}벌 기준` : `내 옷 ${ownN}벌 · 체험용 ${trialN}벌 기준`;
      const kindName = garmentKindName(slot.shape);
      let candidate;
      try { candidate = candidateFromProduct(p); } catch (error) {
        const v = { basis, basisLabel, tone: 'info', title: '이 상품은 비교에 쓸 수 없어요', lines: [error.message], lean: null, owned: [], looks: [], newLookCount: 0, existingLookCount: 0, companion: null, ask: null, addSuggestion: null, cautions: [], record: recordView(j), fine: FINE };
        cache.judge.set(id, v);
        return v;
      }
      const cautions = relatedReturnRecords(S.journeys, candidate, j?.id)
        .map((r) => `같은 브랜드의 ${kindName}${josa(kindName, '을', '를')} 반품한 적 있어요 · ${r.name}${r.returnReason ? ` (${RETURN_LABEL[r.returnReason]})` : ''}`);
      if (j?.stage === 'returned') cautions.unshift(`이 상품을 반품했다고 기록했어요${j.feedback?.returnReason ? ` (${RETURN_LABEL[j.feedback.returnReason]})` : ''}`);
      const addSuggestion = { kind: slot.shape, kindName, slot: slot.id, slotName: slot.name, gender: slot.g, color: p.colorSource === 'image' ? null : p.color };
      if (basis === 'none') {
        const v = {
          basis, basisLabel, tone: 'none', title: '옷장 없이 고른 후보예요',
          lines: ['요청한 조건에는 맞아요. 가진 옷과 겹치는지는 아직 몰라요.', `가진 ${kindName}${josa(kindName, '을', '를')} 한 벌만 넣어도 겹치는지 바로 알려 드려요.`],
          lean: null, owned: [], looks: [], newLookCount: 0, existingLookCount: 0, companion: null, ask: null, addSuggestion, cautions, record: recordView(j), fine: FINE,
        };
        cache.judge.set(id, v);
        return v;
      }
      const self = j && ['received', 'kept'].includes(j.stage) && j.garmentId;
      const others = self ? { ...st, garments: st.garments.filter((g) => g.id !== j.garmentId), closet: st.closet.filter((g) => g.id !== j.garmentId) } : st;
      const absence = S.absences[id] || 'unknown';
      const cmp = compareCandidate(others, candidate, { absence, intent: 'add' });
      const ownershipCheck = cmp.missingChecks.find((x) => x.code === 'ownership-unknown');
      const needsOwnership = !cmp.sameTypeOwned.length && !cmp.sameProduct.length;
      const similarHeld = cmp.decision.kind !== 'skip' ? uniq([...cmp.similarOwned, ...(cmp.kindMatch?.sameColor || [])]) : [];
      const pair = cmp.newFormulaCount || cmp.decision.kind === 'skip' || similarHeld.length ? null : purchasePlanContext(others, candidate, { intent: 'add' });
      const firstLook = cmp.looks.find((l) => l.new) || cmp.looks[0];
      const otherKind = cmp.kindMatch?.otherColor || [], unsureKind = cmp.kindMatch?.unknownColor || [];
      const roughOnly = !cmp.newFormulaCount && cmp.decision.kind === 'hold' && cmp.actualGarmentIds.length;
      const title = j?.stage === 'kept' ? '계속 입는 내 옷이에요'
        : j?.stage === 'received' ? '받은 옷이에요 · 계속 입을지 정해 주세요'
        : cmp.decision.kind === 'skip' ? '같은 상품이 이미 있어요'
        : similarHeld.length ? '비슷한 옷이 이미 있어요'
        : firstLook && cmp.newFormulaCount ? `${firstLook.look.title} 코디가 새로 연결돼요`
        : pair ? '이 옷 하나로는 새 코디가 생기지 않아요'
        : cmp.decision.kind === 'consider' ? '가진 옷과 활용해볼 수 있어요'
        : roughOnly && unsureKind.length ? `${kindName}${josa(kindName, '은', '는')} 이미 ${otherKind.length + unsureKind.length}벌 있어요 · 색은 확인이 필요해요`
        : roughOnly && otherKind.length ? `${kindName}${josa(kindName, '은', '는')} 이미 ${otherKind.length}벌 있어요 · 색은 달라요`
        : roughOnly ? `등록한 옷 중 ${kindName}${josa(kindName, '은', '는')} 아직 없어요`
        : '결정 전에 조금 더 확인해요';
      const tone = j?.stage === 'kept' ? 'own' : j?.stage === 'received' ? 'info'
        : cmp.decision.kind === 'skip' || similarHeld.length ? 'stop'
        : cmp.newFormulaCount ? 'go' : pair ? 'pair' : cmp.decision.kind === 'consider' ? 'think' : roughOnly ? 'info' : 'think';
      const lean = cmp.decision.kind === 'skip' || similarHeld.length ? 'hold' : cmp.newFormulaCount ? 'buy' : null;
      const name = (g) => `${colorLabel(g.color)} ${garmentLabel(g)}`.trim();
      const lines = [];
      if (similarHeld.length) lines.push(`${similarHeld.slice(0, 3).map(name).join(', ')}${similarHeld.length > 3 ? ` 외 ${similarHeld.length - 3}벌` : ''} · 같은 종류·색이에요. 새로 더할 이유가 있는지 먼저 확인해 주세요.`);
      if (roughOnly && !similarHeld.length && !pair) lines.push('종류·색으로 먼저 비교했어요. 내 옷의 세부 종류·색을 채우면 어떤 코디가 생기는지도 알려 드려요.');
      if (pair) lines.push(`${pair.companionSlot.name}${josa(pair.companionSlot.name, '을', '를')} 함께 더해야 ${pair.pair.look.title} 조합이 돼요.`);
      if (firstLook && cmp.newFormulaCount) lines.push(`등록한 옷 기준으로 새 코디 공식 ${cmp.newFormulaCount}개. 실제 핏·사이즈는 따로 확인이 필요해요.`);
      if (ownershipCheck) lines.push(`${firstLook ? '어울리는 조합은 찾았어요. ' : ''}구매가 필요한지는 가진 옷을 한 번 더 확인해요.`);
      const reasons = [...new Set(pair || similarHeld.length ? cmp.missingChecks.map((x) => x.message) : cmp.decision.reasons)]
        .filter((x) => x !== ownershipCheck?.message && !lines.includes(x));
      const rel = new Map();
      const put = (rows, relation, label) => rows.forEach((g) => { if (!rel.has(g.id)) rel.set(g.id, { g, relation, label }); });
      put(cmp.exactOwned, 'same-product', '같은 상품·색');
      put(cmp.sameProduct, 'same-product', '같은 상품 · 옵션 확인 필요');
      put(cmp.similarOwned, 'same-color', '같은 세부 종류·색');
      put(cmp.kindMatch?.sameColor || [], 'same-color', '같은 종류·색');
      put(otherKind, 'other-color', '같은 종류 · 색 다름');
      put(unsureKind, 'unknown-color', '같은 종류 · 색 확인 필요');
      const looks = [...cmp.looks].sort((a, b) => Number(b.new) - Number(a.new)).slice(0, 3)
        .map((l) => ({ ...outfitView({ ...l, items: l.items }, { candidateId: id, focusId: id }), new: !!l.new }));
      const v = {
        basis, basisLabel, tone, title, lean, lines, reasons,
        owned: [...rel.values()].map(({ g, relation, label }) => ({ ...garmentView(g), relation, relationLabel: label })),
        looks, newLookCount: cmp.newFormulaCount, existingLookCount: cmp.existingFormulaCount,
        companion: pair ? { ...card(pair.companion.product), pairTitle: pair.pair.look.title, slotName: pair.companionSlot.name } : null,
        ask: needsOwnership && (!j || j.stage === 'candidate') ? {
          question: `${slot.name}${josa(slot.name, '이', '가')} 이미 있나요?`, value: absence,
          choices: [{ id: 'absent', label: '없어요' }, { id: 'present', label: '있어요' }, { id: 'unknown', label: '아직 몰라요' }],
          hint: absence === 'present' ? '가진 옷을 넣으면 겹치는지 정확히 비교해요.' : null,
        } : null,
        addSuggestion, cautions, record: recordView(j), fine: FINE,
      };
      cache.judge.set(id, v);
      return v;
    },
    setOwnership(productId, value) {
      if (!['absent', 'present', 'unknown'].includes(value)) throw new Error('있는지 여부를 골라 주세요.');
      commit(() => { S.absences = { ...S.absences, [productId]: value }; });
    },

    // 결정과 그 뒤의 기록(주문 → 받음 → 계속 입음 또는 반품).
    decide(productId, decision) {
      if (!['buy', 'hold', 'skip'].includes(decision)) throw new Error('결정을 골라 주세요.');
      const p = PRODUCT_BY_ID[productId];
      if (!p) throw new Error('상품을 다시 확인해 주세요.');
      const candidate = candidateFromProduct(p);
      commit(() => {
        let j = journeyFor(productId);
        if (!j) { j = createPurchaseJourney(candidate, { id: nextId('j'), at: iso() }); S.journeys = [...S.journeys, j]; }
        replaceJourney(transitionPurchaseJourney(j, decision, { at: iso() }));
      });
      return recordView(journeyFor(productId));
    },
    advance(productId, step, { reason = null } = {}) {
      const p = PRODUCT_BY_ID[productId];
      if (!p) throw new Error('상품을 다시 확인해 주세요.');
      const slot = SLOT_BY_ID[p.slot];
      commit(() => {
        let j = journeyFor(productId);
        if (!j) { j = createPurchaseJourney(candidateFromProduct(p), { id: nextId('j'), at: iso() }); S.journeys = [...S.journeys, j]; }
        if (step === 'received') {
          const garment = makeGarment({ id: nextId('g'), slot: slot.id, kind: slot.shape, gender: slot.g, color: p.colorSource === 'image' ? null : p.color, brand: p.brand, productId: p.id, label: p.name.slice(0, 80), source: 'user', createdAt: iso() });
          S.garments = [...S.garments, garment];
          replaceJourney(transitionPurchaseJourney(j, 'received', { at: iso(), changes: { garmentId: garment.id } }));
        } else if (step === 'returned') {
          if (!JOURNEY_RETURN_REASONS.includes(reason)) throw new Error('반품 사유를 골라 주세요.');
          replaceJourney(transitionPurchaseJourney(j, 'returned', { at: iso(), changes: { feedback: { fit: null, returnReason: reason } } }));
        } else if (['ordered', 'kept', 'worn'].includes(step)) {
          replaceJourney(transitionPurchaseJourney(j, step, { at: iso() }));
        } else throw new Error('지원하지 않는 기록이에요.');
      });
      return recordView(journeyFor(productId));
    },
    removeRecord(productId) {
      const j = journeyFor(productId);
      if (!j) return;
      if (j.stage !== 'candidate') throw new Error('주문 뒤의 기록은 지우지 않아요. 반품으로 정리해 주세요.');
      commit(() => { S.journeys = S.journeys.filter((x) => x.id !== j.id); const { [productId]: _, ...rest } = S.absences; S.absences = rest; });
    },
    records() { return api.getState().records; },

    // 옷장 기준 다음 한 벌(요청 없이). 옷장이 없으면 이번 계절 기본템이라고 밝힌다.
    suggest({ limit = 3 } = {}) {
      const st = engineState();
      const mine = st.closet.filter((g) => g.gender === S.gender && ['user', 'legacy'].includes(g.source));
      const rows = recommendItems(st, { limit });
      return {
        basis: mine.length ? 'closet' : 'none',
        title: mine.length ? '옷장 기준 다음 한 벌' : `옷장 없이 고른 ${SEASON_LABEL[seasonOf(new Date(st.now))]} 기본템`,
        items: rows.map((r) => ({ ...card(r.product, { slot: r.slot, reasons: r.reasons }), why: r.reasons[0] })),
      };
    },

    // 검색 제안(규칙 기반): 최근 요청 → 입력과 이어지는 예시 → 옷 종류. 누르면 바로 그 요청으로 찾는다.
    searchSuggestions(text = '', { limit = 6 } = {}) {
      const t = String(text).replace(/\s+/g, ' ').trim();
      const has = (x) => !t || x.includes(t) || t.split(' ').every((w) => x.includes(w));
      const rows = [
        ...S.recent.filter(has).map((q) => ({ q, kind: 'recent', label: '최근' })),
        ...api.examples().filter(has).map((q) => ({ q, kind: 'example', label: '예시' })),
        ...(t ? api.kindChoices().filter((k) => k.name.includes(t) || t.includes(k.name)).map((k) => ({ q: k.name, kind: 'kind', label: '종류' })) : []),
      ];
      const seen = new Set();
      return rows.filter((r) => !seen.has(r.q) && seen.add(r.q)).slice(0, limit);
    },
    clearRecent() { commit(() => { S.recent = []; }); },

    // 가진 옷만으로 입을 수 있는 조합 수(코디 공식 + 종류·색 기본 조합). 옷장을 채우는 재미의 보상 숫자.
    // 구매 추천이 아니다. 체험용 옷도 포함하므로 화면에서 '체험용 포함'을 밝힌다.
    // detail: true면 조합 목록(list)도 준다. key는 조합에 든 옷 id를 이은 값, baseKey는 겉옷을 뺀 값이다.
    // 기본 조합은 겉옷만 다른 조합을 하나로 묶으므로 '새로 생긴 조합'은 baseKey로 가린다.
    closetOutfits({ limit = 60, detail = false } = {}) {
      const st = engineState();
      const ready = closetLooks(st, { limit }).ready;
      const basics = basicOutfits(st, { limit });
      const out = { formulas: ready.length, basic: basics.length, total: ready.length + basics.length, note: '가진 옷으로 입을 수 있는 조합 수예요(종류·색 기준, 핏·소재는 따지지 않았어요).' };
      if (detail) {
        out.list = [...ready, ...basics].map((r) => {
          const v = outfitView(r);
          const ids = (pieces) => pieces.map((p) => p.garmentId).filter(Boolean).sort().join('|');
          return { ...v, formulaLook: !r.basic, key: ids(v.pieces), baseKey: ids(v.pieces.filter((p) => p.role !== 'outer')) };
        });
      }
      return out;
    },

    // 빈 결과·좁은 결과의 다음 선택: 조건을 하나씩 뺐을 때의 결과 수와 사진 미리보기.
    // 자동으로 적용하지 않는다(대표 원칙: 조건 보존. 대안이 하나뿐이어도 사용자가 고른다).
    relax(result, { limit = 3, preview = 3 } = {}) {
      if (!result?.understood) return [];
      const out = [];
      for (const c of result.conditions.filter((x) => x.removable)) {
        const r = api.ask(result.text, { drop: [...(result.dropped || []), c.key] });
        if (r.total) out.push({ key: c.key, label: c.label, drop: [...(result.dropped || []), c.key], total: r.total, title: `‘${c.label}’ 빼고 ${r.total}개`, preview: r.products.slice(0, preview) });
      }
      // relax가 마지막 검색 맥락을 바꾸지 않게 원래 결과의 맥락으로 되돌린다.
      lastAsk = { ids: new Set([...result.products, ...result.offOccasion].map((p) => p.id)), criteria: result.criteria };
      return out.sort((a, b) => b.total - a.total).slice(0, limit);
    },

    // 후보 비교함(최대 4개). 브라우저에 저장되어 화면을 오가도(뒤로가기 포함) 유지된다. 자동으로 담지 않는다.
    compareList: () => [...S.compare],
    compareHas: (id) => S.compare.includes(id),
    compareAdd(id) {
      if (!PRODUCT_BY_ID[id]) throw new Error('상품을 다시 확인해 주세요.');
      if (S.compare.includes(id)) return [...S.compare];
      if (S.compare.length >= 4) throw new Error('비교함에는 4개까지 담을 수 있어요. 하나를 빼고 담아 주세요.');
      commit(() => { S.compare = [...S.compare, id]; });
      return [...S.compare];
    },
    compareRemove(id) { commit(() => { S.compare = S.compare.filter((x) => x !== id); }); return [...S.compare]; },
    compareClear() { commit(() => { S.compare = []; }); },
    // 비교 표에 쓸 같은 축의 값. 판정은 judge()와 같고, 값이 모두 같은 줄은 same: true.
    compareRows(ids = S.compare) {
      const items = ids.map((id) => PRODUCT_BY_ID[id]).filter(Boolean).map((p) => ({ card: card(p), verdict: api.judge(p.id) }));
      const low = Math.min(...items.map((x) => x.card.price));
      const row = (key, label, value) => { const values = items.map(value); return { key, label, values, same: values.every((v) => v === values[0]) }; };
      return {
        items: items.map((x) => x.card),
        // 옷은 외형으로 고르는 상품이라 스펙 표보다 '내 옷과 겹치는지'가 중심이다(NN/g·Baymard 조사). primary 5줄을 먼저, 나머지는 접어 둔다.
        rows: items.length ? [
          { ...row('verdict', '내 옷과', (x) => x.verdict.title), primary: true },
          { ...row('price', '수집가', (x) => `${x.card.priceText}${items.length > 1 && x.card.price > low ? ` (+${formatPrice(x.card.price - low)})` : ''}`), primary: true },
          { ...row('color', '색', (x) => x.card.colorLabel), primary: true },
          { ...row('looks', '새 코디', (x) => (x.verdict.basis === 'none' ? '옷장을 넣으면 알 수 있어요' : `${x.verdict.newLookCount}개`)), primary: true },
          { ...row('store', '판매처', (x) => x.card.store), primary: true },
          { ...row('owned', '옷장', (x) => x.card.owned.label || '옷장 없이'), primary: false },
          { ...row('kind', '종류', (x) => x.card.slotName), primary: false },
          { ...row('reason', '고른 이유', (x) => x.card.reason), primary: false },
          { ...row('popularity', '평점·후기', (x) => (x.card.rating ? `${x.card.rating} · ${Number(x.card.reviews || 0).toLocaleString('ko-KR')}개` : '정보 없음')), primary: false },
        ] : [],
        note: '수집가는 수집일 기준이에요. 차액은 가장 낮은 수집가와의 차이예요.',
      };
    },

    // 같은 상품의 새 상품/중고를 같은 자리에서(Patagonia Worn Wear처럼 한 맥락에서 보되, 중고 매물 자료는 없으니 지어내지 않는다).
    newVsUsed(id) {
      const p = PRODUCT_BY_ID[id];
      if (!p) return null;
      const used = api.usedSearch(id);
      return {
        fresh: { label: '새 상품', priceText: formatPrice(p.price), priceNote: card(p).priceShort, store: p.store, url: p.url, condition: '새 상품', photoNote: '판매처 대표 사진' },
        used: { label: '중고', priceText: null, priceNote: '매물마다 달라요', condition: '매물마다 달라요 · 상태 등급 없음', photoNote: '매물 사진은 각 사이트에서', note: used.note, groups: used.groups },
        diff: ['가격: 새 상품은 수집가가 있어요. 중고 가격은 어울이 확인하지 않았어요.', '상태: 중고는 매물마다 달라요. 판매자 설명과 사진을 확인해 주세요.', '사진: 위 사진은 판매처 대표 사진이에요. 중고 매물의 실제 사진이 아니에요.'],
      };
    },

    // 중고 매물: 앱 안 통합이 아니라 외부 사이트의 공개 검색 결과로 보내는 링크다.
    // 어울은 매물·가격·재고·판매 상태를 읽거나 저장하지 않는다(공식 연동 전).
    usedSearch(target) {
      const p = typeof target === 'string' ? PRODUCT_BY_ID[target] : target?.id ? PRODUCT_BY_ID[target.id] : null;
      const text = typeof target === 'object' && target?.text ? String(target.text).slice(0, 80) : null;
      if (!p && !text) return null;
      const slot = p ? SLOT_BY_ID[p.slot] : null;
      const clean = (name) => name.replace(/\[[^\]]*\]|\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
      const ko = p ? `${p.brand} ${clean(p.name)}`.slice(0, 60) : text;
      const EN = { shirt: 'shirt', tee: 't-shirt', longtee: 'long sleeve t-shirt', polo: 'polo shirt', knit: 'sweater', sweat: 'sweatshirt', cardigan: 'cardigan', vest: 'vest', blazer: 'blazer', jacket: 'jacket', coat: 'coat', down: 'down jacket', pants: 'pants', jeans: 'jeans', skirt: 'skirt', dress: 'dress', sneaker: 'sneakers', loafer: 'loafers', boot: 'boots', bag: 'bag', cap: 'cap', beanie: 'beanie', belt: 'belt' };
      const JA = { shirt: 'シャツ', tee: 'Tシャツ', longtee: 'ロンT', polo: 'ポロシャツ', knit: 'ニット', sweat: 'スウェット', cardigan: 'カーディガン', vest: 'ベスト', blazer: 'ブレザー', jacket: 'ジャケット', coat: 'コート', down: 'ダウン', pants: 'パンツ', jeans: 'デニム', skirt: 'スカート', dress: 'ワンピース', sneaker: 'スニーカー', loafer: 'ローファー', boot: 'ブーツ', bag: 'バッグ', cap: 'キャップ', beanie: 'ニット帽', belt: 'ベルト' };
      const CEN = { white: 'white', ivory: 'ivory', beige: 'beige', blue: 'light blue', grey: 'grey', olive: 'olive', brown: 'brown', indigo: 'indigo', charcoal: 'charcoal', navy: 'navy', black: 'black', green: 'green', red: 'burgundy', pink: 'pink', yellow: 'yellow', purple: 'purple', orange: 'orange' };
      const CJA = { white: '白', ivory: 'アイボリー', beige: 'ベージュ', blue: 'ライトブルー', grey: 'グレー', olive: 'オリーブ', brown: 'ブラウン', indigo: 'インディゴ', charcoal: 'チャコール', navy: 'ネイビー', black: '黒', green: 'グリーン', red: 'ボルドー', pink: 'ピンク', yellow: 'イエロー', purple: 'パープル', orange: 'オレンジ' };
      const latin = p && /[A-Za-z]{3,}/.test(p.name) ? clean(p.name).replace(/[^A-Za-z0-9 \-]/g, ' ').replace(/\s+/g, ' ').trim() : '';
      const en = p ? (latin || [CEN[p.color], EN[slot.shape]].filter(Boolean).join(' ')) : '';
      const ja = p ? [CJA[p.color], JA[slot.shape]].filter(Boolean).join(' ') : '';
      const e = encodeURIComponent;
      const domestic = [
        { id: 'bunjang', label: '번개장터', url: `https://m.bunjang.co.kr/search/products?q=${e(ko)}`, query: ko },
        { id: 'daangn', label: '당근', url: `https://www.daangn.com/kr/search/buy-sell/?q=${e(ko)}`, query: ko, note: '동네 기준 검색' },
        { id: 'joongna', label: '중고나라', url: `https://web.joongna.com/search/${e(ko)}`, query: ko },
        { id: 'fruits', label: '후루츠패밀리', url: `https://fruitsfamily.com/search/${e(ko)}`, query: ko, note: '패션 중고' },
      ];
      const abroad = p ? [
        { id: 'ebay', label: 'eBay', url: `https://www.ebay.com/sch/i.html?_nkw=${e(en)}&LH_ItemCondition=3000`, query: en, note: '영어로 비슷한 종류·색 검색' },
        { id: 'mercari-jp', label: '메루카리(일본)', url: `https://jp.mercari.com/search?keyword=${e(ja)}&status=on_sale`, query: ja, note: '일본어로 비슷한 종류·색 검색' },
      ] : [];
      return {
        kind: 'search-links',
        note: '외부 사이트의 검색 결과로 이동해요. 어울은 매물·가격·재고·상태를 확인하지 않았어요.',
        exactNote: p ? `국내는 ‘${ko}’로 같은 상품을, 해외는 비슷한 종류·색을 찾아요.` : `‘${ko}’로 찾아요.`,
        abroadNote: '해외 매물은 배송대행·관세·반품 조건이 따로 있어요. 결제 전 판매처에서 확인해 주세요.',
        groups: [{ region: '국내 중고', links: domestic }, ...(abroad.length ? [{ region: '해외 중고', links: abroad }] : [])],
      };
    },

    // ── 사진. 상품은 판매처 사진, 종류·색만 아는 옷은 '비슷한 상품 사진'(표시 붙음), 그 밖에는 색 카드.
    // 사진을 못 불러오면 색 카드로 바뀐다. 크기는 감싸는 칸이 정한다(칸 높이가 없으면 4:5, CSS 변수 --eo-ratio로 바꿈).
    photo: (target) => photoOf(target),
    photoHtml: (target, opts) => photoHtml(target, opts),
    // 1판 호환: art()도 이제 사진을 돌려준다. size를 주면 그 크기의 칸으로 감싼다.
    art(target, { size = '100%', fit = 'cover', caption = true } = {}) {
      const html = photoHtml(target, { fit, caption });
      return size === '100%' ? html : `<span style="display:block;width:${escAttr(size)};height:${escAttr(size)}">${html}</span>`;
    },
    photos: {
      on: !!photos,
      count: PRODUCTS.filter((p) => p.img && PHOTO_HOST.test(p.img)).length,
      source: `${CATALOG.store} 상품 이미지 서버(image.msscdn.net) 주소를 그대로 불러옴 · 저장소에 사진 파일 없음`,
      rights: CATALOG.rights,
      note: NOTE.photos,
    },

    // ── 화면 주소. #/경로?키=값 형식이라 file://에서도 동작하고 브라우저 뒤로가기가 그대로 쓰인다.
    route: {
      current() {
        const raw = typeof location !== 'undefined' ? location.hash.replace(/^#/, '') : '';
        const [path, qs = ''] = raw.split('?');
        return { path: path || '/', params: Object.fromEntries(new URLSearchParams(qs)) };
      },
      href(path, params = {}) {
        const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== '')).toString();
        return `#${path}${qs ? `?${qs}` : ''}`;
      },
      go(path, params = {}, { replace = false } = {}) {
        const next = api.route.href(path, params);
        if (typeof location === 'undefined') return;
        if (location.hash === next) { window.dispatchEvent(new HashChangeEvent('hashchange')); return; }
        if (replace) { history.replaceState(history.state, '', next); window.dispatchEvent(new HashChangeEvent('hashchange')); }
        else location.hash = next;
      },
      // fn(현재 화면)을 주소가 바뀔 때마다 부른다. 처음 한 번도 부른다.
      // restoreScroll: 떠나는 화면의 스크롤 위치를 기억했다가, 뒤로가기 등으로 같은 주소에 오면 그 위치로 돌려 놓는다.
      on(fn, { restoreScroll = true, immediate = true } = {}) {
        if (restoreScroll && 'scrollRestoration' in history) history.scrollRestoration = 'manual';
        let last = location.hash;
        const run = () => {
          if (restoreScroll) scrollMemo.set(last, window.scrollY);
          last = location.hash;
          fn(api.route.current());
          if (restoreScroll) {
            const y = scrollMemo.get(location.hash) ?? 0;
            requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, y)));
          }
        };
        window.addEventListener('hashchange', run);
        if (immediate) fn(api.route.current());
        return () => window.removeEventListener('hashchange', run);
      },
      // 스크롤 칸이 window가 아닌 화면(PC 여러 칸)은 직접 기억·복원한다.
      remember: (key, y) => scrollMemo.set(key, y),
      recall: (key) => scrollMemo.get(key) ?? 0,
    },

    // ── 고지는 한 곳에. 화면에는 짧은 문구(note.short)만 쓰고, 시안 표시(data-flow="mock-label")를 누르면 이 내용을 연다.
    disclosure() {
      return {
        title: '이 시안에 대해',
        sections: [
          { h: '누가 만들었나', lines: [NOTE.ai, '목표와 품질 기준은 ‘세계 최고 수준의 UX/UI’예요. 이 시안이 그 수준에 이르렀다고 검증된 것은 아니에요.'] },
          { h: '상품 자료와 사진', lines: [NOTE.catalog, NOTE.photos, NOTE.similar, NOTE.price] },
          { h: '판단과 기록', lines: [NOTE.rules, FINE, NOTE.records, '중고 링크는 외부 사이트의 검색 결과로 이동할 뿐이에요. 매물·가격·재고는 확인하지 않았어요.'] },
          { h: '저장', lines: ['기록은 이 브라우저에만 저장돼요. 실제 앱의 저장 자료와 섞이지 않아요.'] },
        ],
      };
    },
    openDisclosure() {
      if (typeof document === 'undefined') return;
      let d = document.getElementById('eo-disclosure');
      if (!d) {
        const info = api.disclosure();
        d = document.createElement('dialog');
        d.id = 'eo-disclosure';
        d.setAttribute('aria-labelledby', 'eo-disclosure-title');
        d.style.cssText = 'max-width:520px;width:calc(100% - 32px);max-height:80vh;border:0;border-radius:16px;padding:0;color:#1a1a1a;background:#fff;box-shadow:0 12px 40px rgba(0,0,0,.25);font:15px/1.6 system-ui,-apple-system,sans-serif';
        d.innerHTML = `<div style="padding:20px 20px 8px"><h2 id="eo-disclosure-title" style="margin:0 0 8px;font-size:18px">${info.title}</h2>${info.sections.map((x) => `<h3 style="margin:16px 0 4px;font-size:14px;color:#555">${x.h}</h3>${x.lines.map((l) => `<p style="margin:0 0 6px">${escAttr(l)}</p>`).join('')}`).join('')}</div><form method="dialog" style="position:sticky;bottom:0;padding:12px 20px 20px;background:#fff"><button style="width:100%;min-height:48px;border:0;border-radius:10px;background:#111;color:#fff;font:600 15px system-ui,sans-serif">닫기</button></form>`;
        document.body.appendChild(d);
      }
      if (typeof d.showModal === 'function') d.showModal(); else d.setAttribute('open', '');
    },
  };

  if (reset) { S = blank(); save(); } else S = load();
  if (typeof window !== 'undefined' && window.addEventListener)
    window.addEventListener('storage', (event) => {
      if (event.key !== key) return;
      S = load();
      version++;
      lastAsk = null;
      notify();
    });
  return api;
}

const bootParams = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
let bootStorage = null;
try { bootStorage = window.localStorage; bootStorage.getItem('eoul-mockup-ux10v2:probe'); } catch { bootStorage = null; }
const bootPhotos = bootParams.get('photos') !== '0';
// ?preview=1: 갤러리 미리보기. 저장하지 않고 메모리에서만 동작해 다른 창의 기록과 섞이지 않는다.
const bootPreview = bootParams.get('preview') === '1';
const mock = createMock({ storage: bootPreview ? null : bootStorage, reset: bootParams.get('reset') === '1' || bootPreview, photos: bootPhotos });
// 검색 엔진에 실리지 않게 한다(접근 통제는 아니다. 링크를 아는 사람은 열 수 있다).
if (typeof document !== 'undefined' && document.head && !document.querySelector('meta[name="robots"]')) {
  const meta = document.createElement('meta');
  meta.name = 'robots';
  meta.content = 'noindex, nofollow, noimageindex';
  document.head.appendChild(meta);
}
const bootGender = bootParams.get('g');
if (bootGender === 'M' || bootGender === 'F') mock.setGender(bootGender);
if (bootParams.get('closet') === 'trial') mock.loadTrialCloset(bootGender || undefined);
mock.boot = { q: bootParams.get('q') || '', photos: bootPhotos, preview: bootPreview, reset: bootParams.get('reset') === '1', closet: bootParams.get('closet') || '', engineCommit: "1af0f8e" };
window.EoulMock = mock;
})();
