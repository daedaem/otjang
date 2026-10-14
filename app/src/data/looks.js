// 코디 공식(look): 스타일리스트가 권하는 조합을 역할별 아이템 종류와 권장 색으로 적어 둔 것.
// 역할: outer 아우터 · top 상의 · inner 이너(상의 안에 겹쳐 입는 옷) · dress 원피스 · bottom 하의 · shoes 신발 · acc 소품
// 역할 값: { s: [종류 id, 선호 순서], c: [권장 색] }. 엔진은 가진 옷을 먼저 쓰고 없는 역할만 실제 상품으로 채운다.

const L_SF = ['spring', 'fall'];
const L_FW = ['fall', 'winter'];
const L_SFW = ['spring', 'fall', 'winter'];

export const LOOKS = [
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

export const ROLE_ORDER = ['outer', 'top', 'inner', 'dress', 'bottom', 'shoes', 'acc'];
export const ROLE_LABEL = { outer: '아우터', top: '상의', inner: '이너', dress: '원피스', bottom: '하의', shoes: '신발', acc: '소품' };
