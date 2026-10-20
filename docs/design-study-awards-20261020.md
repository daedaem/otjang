# 디자인 수상작 학습 노트: 무엇이 '고급스러워 보이게' 만드나 (2026-10-20)

> 이 노트는 AI(Claude)가 2026-10-20에 공개 자료와 앱스토어 공식 스크린샷을 보고 정리한 조사다. 수상 디자이너나 해당 회사가 참여하거나 검토하지 않았다.
> 여기서 '학습'은 이번 작업에서 조사·분석해 디자인 규칙으로 옮긴다는 뜻이다. 모델을 다시 훈련한 것도 아니고, 세계 최고 수준에 이르렀다는 증거도 아니다.
> 서비스 이름은 정하지 않았다('이름 미정'). '어울'은 상표 문제로 쓰지 않는다.
> 이전 조사(`app/mockups/ux10v2/research/references.md`)는 사용성 규칙(탐색, 검색, 접근성) 중심이었다. 이번 노트는 **눈에 보이는 완성도**(사진, 글자, 색, 여백, 움직임)만 다룬다.

## 0. 방법과 한계

- 수상 사실은 시상식 사이트에서 직접 확인했다. 확인한 곳은 다음과 같다.
  - Apple: developer.apple.com/design/awards/2023·2024·2025와 /design/awards(2026)
  - Webby: 갤러리 데이터를 직접 조회해 Winner, People's Voice, Honoree, Nominee를 구분했다.
  - Awwwards: awwwards.com/sites/…
  - Red Dot: red-dot.org/project/…
  - iF: ifdesign.com 프로젝트 페이지. 일부는 403으로 막혀 검색 결과로만 확인했다.
- 화면은 Mobbin을 쓰려 했지만 유료 플랜이 필요해 쓰지 못했다. 대신 각 앱의 **앱스토어 공식 스크린샷**(가로 1179~1290px) 약 330장을 받아 직접 봤다.
  - 스크린샷은 홍보용 틀 안에 실제 화면을 넣은 것이다. 아래 숫자(pt)는 그 화면을 재서 짐작한 값이다.
  - 움직임, 소리, 진동은 스크린샷으로 볼 수 없다. 그래서 공식 글에 적힌 것만 [확인]으로 쓰고, 나머지는 [추론]으로 표시한다.
- 남의 스크린샷은 저장소에 넣지 않았다. 작업 폴더에서만 봤다.
- 표기: **[확인]** 원문·공식 페이지, **[관찰]** 앱스토어 스크린샷을 직접 봄, **[추론]** 우리 앱에 옮긴 해석.

## 1. 확인한 수상 목록 (이번 노트의 근거)

| 제품 | 수상 (연도·부문·등급) | 우리에게 주는 것 |
|---|---|---|
| **Aritzia 앱** (패션) | Webby 2026 Shopping & Retail 앱 **Honoree**, Best User Interface **Honoree** | '옷장(Closet)' 화면: 산 옷을 같은 회색 칸에 납작하게 진열 |
| **SKIMS 앱** (패션) | Webby 2025 Shopping & Retail 앱 **Honoree**(웹사이트도 패션 부문 Honoree) | 모델 사진과 상품 사진을 바꿔 보는 스위치, 자간 넓힌 대문자 |
| **Polène** (패션 쇼핑몰) | Awwwards **Honorable Mention** + **E-commerce Honors** 2024-11 | 흑백 두 색, 확대 단계가 둘인 상품 격자 |
| Permian | Awwwards **SOTD** 2025-11-13 (E-commerce, Fashion) | 절제된 화면 전환 |
| DICH™ Fashion | Webby 2026 Best User Interface(웹) **Webby Winner**, Awwwards SOTD 2025-06 | 두 색 팔레트 |
| Gucci.com | Webby 2024 Best Visual Design–Function **People's Voice**(공개 투표) | 참고만 |
| **Coupang R.LUX** | Red Dot **Design Concept** 2025 Interaction·UI·UX(기본 Red Dot, 콘셉트 부문), iF Design Award 2025 UX(Retail) | 흑백 화면, 국내 명품 커머스 |
| Toss **Tossface**(이모지 글꼴) | Red Dot 2023 Brands & Communication Design | 토스 앱 화면 자체는 국제 디자인상 확인 못 함 |
| **Flighty** | Apple Design Award(ADA) 2023 Interaction **Winner** | 핵심 숫자를 크게, 색은 의미에만 |
| **Any Distance** | ADA 2023 Visuals & Graphics **Winner** | 모으는 메달을 한 모양의 틀에 |
| **Duolingo** | ADA 2023 Delight & Fun **Winner** | 연속 기록 축하 화면 |
| **Crouton** | ADA 2024 Interaction **Winner** | "무엇을 뺄지 오래 고민했다" |
| **Bears Gratitude** | ADA 2024 Delight & Fun **Winner** | 보상 스티커, 한 화면 한 색 계열 |
| **Rooms** | ADA 2024 Visuals & Graphics **Winner** | 단색 무대 위 물건 하나 |
| Gentler Streak | ADA 2023 V&G Finalist, 2024 Social Impact **Winner** | 큰 숫자 + 작은 단위, 점 행렬 요약 |
| **CapWords** | ADA 2025 Delight & Fun **Winner** | 찍으면 배경을 지운 스티커로 모음, 처리 중 짧은 움직임, 효과음 |
| Denim / Vocabulary / Mela | ADA 2025 Finalist(Delight / V&G / Interaction) | 묶음을 겹친 더미로, 한 테두리 체계, 세리프 + 작은 산세리프 |
| Tide Guide / grug | ADA 2026 V&G **Winner** / Delight & Fun **Winner** | 한 색조 팔레트 / 화면당 두 색 |
| Pokémon Sleep | Google Play Best of 2023 | '도감 12/80' 수집 진행률 |

**쓰지 않는 것**
- 토스 앱 화면의 국제 디자인상: 찾지 못했다.
- R.LUX 'Red Dot 대상(Grand Prix)': 보도만 있고 Red Dot 페이지에는 기본 Red Dot으로 적혀 있다.
- SSENSE, COS, Aesop의 2022~2026 수상: 찾지 못했다.

**참고만 하는 것**
- SSENSE, Farfetch, 29CM, 무신사, W컨셉, 당근: 수상작이 아니라 업계에서 잘 만들었다고 보는 화면이라 그렇게 적는다.
- Whering, Acloset, Indyx, Alta: 옷장 앱 분야 참고이며, 확인된 수상은 없다.
- 토스 TDS, 당근 SEED, 정부 KRDS: 상이 아니라 **공개 디자인 시스템 수치**라서 근거로 쓴다.

## 2. 수상작들이 공통으로 한 일 10가지 (숫자로)

1. **사진이 곧 화면이다.** 상세는 사진이 화면의 50~60%, 격자 칸은 사진이 75~80%다. 버튼, 글자 같은 장식은 15% 안팎이다. [관찰: Aritzia, SSENSE]
2. **모든 물건을 한 배경, 한 비율, 한 크기로 맞춘다.**
   - Aritzia 옷장은 4열이고, 연회색(#EEE 안팎) 칸 가운데에 납작하게 찍은 옷을 칸 높이의 약 70%로 둔다. 칸 아래 글자는 없다. [관찰]
   - CapWords는 찍은 물건마다 배경을 지운다. 흰 테두리(물건 폭의 약 4%)와 부드러운 그림자를 붙여 스티커로 만든다. [확인: Apple Behind the Design, 관찰]
   - Any Distance는 전혀 다른 그림의 메달도 같은 알약 틀에 넣어 한 세트로 보이게 한다. [관찰]
   - 반대로 싸 보이는 옷장 앱(Pureple, Stylebook)은 배경이 섞인 사진을 그대로 쓴다. [관찰]
3. **비율 하나, 모서리 하나.** 패션 쇼핑 앱의 사진 칸은 3:4(또는 2:3), 모서리 0~4pt다. 둥근 큰 카드는 쓰지 않는다. 누르는 버튼만 알약 모양이다(Aritzia). 또는 버튼까지 각진 사각형이다(SSENSE, Farfetch). [관찰]
4. **글꼴은 한 가족, 굵기는 아낀다.**
   - Aritzia는 상품명과 가격이 모두 보통 굵기 14pt 안팎이고 굵은 글자가 거의 없다. [관찰]
   - 계층은 크기, 대소문자, 회색 농도로 만든다. 목소리를 하나 더 낸다면 자간을 넓힌 대문자(SKIMS, SSENSE)나 세리프(Mr Porter, Mela, Tiimo) 중 하나만 쓴다. [관찰]
5. **글자 순서가 늘 같다.** 브랜드 → 상품명(2줄) → 가격 → 회색 보조 정보, 왼쪽 정렬, 줄 사이 2~4pt. [관찰: Farfetch, 무신사, W컨셉]
6. **색은 사진에서만 나온다.** 화면은 흑·백·회색 하나로 둔다. 색은 상태(재고 초록 점, 지연 빨강)에만 쓴다. Flighty는 파랑을 주 행동 하나에만 남겼다. [관찰]
7. **주 행동은 화면에 하나, 검정이다.** 높이 약 48pt. Aritzia는 버튼 안에 가격을 넣는다('Add to Bag $78'). 보조 행동은 테두리 버튼이나 글자 링크다. [관찰]
8. **숫자를 주인공으로.**
   - Flighty는 출발 시각 약 34pt 옆에 15pt 회색 설명을 둔다.
   - Gentler Streak는 '8h 19m'을 숫자 28pt, 단위 14pt로 쓴다.
   - 토스는 금액을 굵게 쓰고 원을 붙이며 쉼표로 끊는다.
   - 개수는 위첨자('All Clothing¹⁶⁵³')나 0을 채운 번호('BAG 03')로 '고른 것'처럼 보이게 한다. [관찰]
9. **모으는 재미에는 정해진 장치가 있다.**
   - 진행률 분수: 포켓몬 슬립 '12/80'
   - 여권형 통계 페이지: Flighty Passport의 큰 숫자 + 지도
   - 이정표 축하 화면: 듀오링고
   - 스티커 보상: Bears
   - 겹친 더미 표지: Denim, 아래에 '4 Covers'
   - 새로 얻은 것만 색, 나머지는 회색: CapWords [관찰]
   - 애플 수상 설명은 "작은 움직임으로 기다림을 못 느끼게"(CapWords), "실제 소리"(CapWords 카드 넘김)를 짚는다. [확인]
10. **빼는 것이 디자인이다.** Crouton: "무엇을 뺄지 오래 고민했다." 요리 모드는 지금 단계, 재료, 분량만 보여 준다. [확인] grug는 화면당 두 색만 쓴다. [관찰]

## 3. 한글 화면 규칙 (공개 디자인 시스템 수치)

- **토스 TDS 글자 단계** [확인: tossmini-docs TDS typography]
  - 크기/줄 높이: T1 30/40, T2 26/35, T3 22/31, T4 20/29, T5 17/25.5(본문), T6 15/22.5, T7 13/19.5, 11/16.5(최소)
  - 줄 높이 비율은 작은 글자 1.5배에서 큰 글자 1.33배로 줄어든다.
  - 값은 토큰으로만 쓴다. 휴대폰의 큰 글씨 설정을 따라 커져야 하기 때문이다.
- **당근 SEED** [확인: seed-design.io]
  - 굵기는 400/500/700 셋만 쓴다. 500은 안드로이드에서 한글이 고르지 않다고 경고한다.
  - 화면 제목 26/35 Bold, 본문 16/24.
- **정부 KRDS** [확인: krds.go.kr]: 줄 높이 150% 이상, 본문 16px 이상.
- **자간**: 큰 제목에서 한글 자간을 줄이라는 공식 근거는 없다. Pretendard는 본문에서 자간을 조정할 필요가 없게 맞춰져 있다. 20px 이상에서 −0.01~−0.02em은 관행일 뿐이다. [추론]
- **숫자**
  - 목록, 비교, 기록의 숫자는 자릿수를 맞춘다(`tabular-nums`). 큰 숫자 하나는 비례 숫자로 쓴다. [확인: 토스 Product Sans 글]
  - 표기는 '159,000원'처럼 원을 붙여 쓴다.
- **문장**: 토스 UX 라이팅. [확인: toss.tech 8 writing principles, 앱인토스 가이드]
  - 해요체로 짧고 능동형으로 쓴다.
  - 대화창 왼쪽 버튼은 '취소'가 아니라 '닫기'다.
  - 버튼 이름은 다음 화면을 예측할 수 있게 쓴다.
- **움직임**: 토스는 곡선을 두 가족(bezier, spring)으로만 두고 이름을 붙여 쓴다. 한 대상에는 한 움직임만 준다. 누르면 살짝 작아지는 반응을 준다. [확인: toss.tech/article/interaction]

## 4. 우리 시안을 이 기준에 대 보면 (솔직한 진단)

| 기준 | 현재(옷장 채우기 2판 포함) | 판정 |
|---|---|---|
| 모든 물건 한 배경 | 흰 배경 사진을 골라 맞췄다. 흰 티셔츠 등 일부는 모델 사진이 섞인다 | **미달**. 한 장만 섞여도 싸 보인다(2-2) |
| 비율·모서리 하나 | 칸 20px, 카드 24px, 시트 28px로 둥근 정도가 셋이다. 사진 칸이 둥글다 | **미달**. 패션 앱은 사진 칸 0~4pt다 |
| 굵기 절제 | 굵은 글자(700~800)가 거의 모든 제목과 이름에 있다 | **미달** |
| 글자 단계 | 11, 12, 13, 14, 15, 17, 19, 20, 30, 96px를 섞어 쓴다 | **미달**. TDS 단계 6~7개로 줄여야 한다 |
| 색은 사진에서만 | 코발트 강조, 회색, 검정. 강조를 '새로 생김'에만 쓴다 | 대체로 맞다 |
| 숫자 주인공 | 조합 수를 96px로 크게 썼다 | 맞다. 다만 숫자가 하나뿐이다 |
| 모으는 장치 | 조합 수, '+6' 미리 보기 | **부족**. 진행률, 여권형 통계, 이정표, 더미 표지가 없다 |
| 빼기 | 안내문 한 줄씩이 여전히 많다(사진 고지, 기준 설명, 사라는 뜻 아님) | **미달**. 고지는 한 곳에 모아야 한다 |
| 옷장 진열 밀도 | 3열, 간격 10~12, 굵은 이름표 | **미달**. Aritzia는 4열, 이름표 없이 진열한다 |

요약하면 2판은 1판보다 낫지만, 수상작과 나란히 두면 **둥근 카드와 굵은 글자가 많은 '앱 템플릿' 느낌**이 남는다. 패션 수상작은 사진 칸이 각지고, 굵은 글자가 거의 없고, 진열이 촘촘하다.

## 5. 다시 만들 때의 규칙 초안 (v0, 대표 확인 전)

**바탕**
- 흑(#111), 백(#FFF), 사진 칸 회색 하나(#EFEFEF 안팎), 글자 회색 둘(#6B6B6B 본문 보조, #9A9A9A 캡션)을 쓴다.
- 강조색은 쓰지 않거나, 쓴다면 '내 옷과 겹쳐요 / 새로 생겨요' 상태 표시에만 쓴다.
- 어두운 화면은 반전하되, 사진 칸은 밝게 유지한다.

**모양**
- 사진 칸은 3:4, 모서리 0이다.
- 누르는 것은 알약 모양(높이 48, 작은 것 36)이다.
- 시트는 위 모서리만 16이다.
- 그림자는 쓰지 않거나, 시트에 한 종류만 쓴다.

**글자**
- Pretendard, 굵기 400·500·700 셋만 쓴다.
- 크기/줄 높이: 30/40(큰 숫자는 예외로 크게), 22/31, 17/25.5, 15/22.5, 13/19.5, 11/16.5.
- 굵은 글자는 화면 제목, 가격, 큰 숫자에만 쓴다.

**사진**
- 옷장과 조합은 모두 납작하게 찍은 상품 사진(평평하게 놓고 찍은 사진)을 회색 칸 가운데 높이 70%로 둔다.
- 모델 사진은 상품 상세의 큰 사진에만 쓴다(SKIMS식 모델·상품 전환).
- 맞는 납작 사진이 없는 종류·색은 사진 대신 **색 칸 + 종류 글자**로 둔다. 모델 사진을 섞지 않는다.

**옷장**
- 4열, 간격 8, 칸 아래 글자 없음(눌러야 이름이 나온다).
- 분류 탭에 개수를 붙인다(상의 12).
- 맨 위에는 '여권'처럼 큰 숫자를 둔다: 옷 수, 조합 수, 색 분포 막대.

**재미**
- 넣을 때: 사진이 칸으로 날아가 앉고, 숫자가 굴러간다.
- 이정표: 첫 조합, 10벌, 조합 10개에서 한 번씩만 화면 전체로 축하한다.
- 새로 생긴 조합만 색으로, 나머지는 흐리게 둔다.
- 사라는 말은 하지 않는다. 진행률은 '가진 옷 확인' 기준으로 센다.

**문장**
- 고지는 화면마다 한 줄 이하로 쓰고, 자세한 건 '정보' 한 곳에 모은다.
- 해요체, 버튼은 다음 행동 이름으로 쓴다.

## 6. 다음 순서 (추천)

1. 위 규칙을 **디자인 토큰 한 장**(글자, 색, 모서리, 칸, 버튼, 움직임)으로 만들어 대표 확인을 받는다.
2. 같은 규칙으로 **옷장 → 검색 결과 → 상품 상세 → 비교·결정 → 기록** 순서로 한 화면씩 다시 만든다. 열 개를 한꺼번에 손대지 않는다.
3. 매 화면을 Aritzia 옷장, SSENSE 목록, 토스 숫자 화면과 **나란히 놓고** 스크린샷으로 비교한 뒤 넘긴다.
4. 납작 사진이 없는 종류·색(흰 티셔츠 등)은 카탈로그를 수집할 때 납작 사진을 따로 모으거나, 내 옷 사진은 앱에 있는 배경 지우기(U-2-Netp)로 같은 칸에 넣는다.

## 참고 링크 (확인한 페이지)

- Apple Design Awards: https://developer.apple.com/design/awards/2023/ · /2024/ · /2025/ · https://developer.apple.com/design/awards/
- CapWords Behind the Design: https://developer.apple.com/articles/capwords
- Crouton: https://developer.apple.com/news/?id=9x75y43e · Flighty: https://developer.apple.com/news/?id=970ncww4 · Bears: https://developer.apple.com/news/?id=i74v3f4r
- Webby 갤러리(항목 번호): Aritzia 376708, SKIMS 327642·328202, Gucci 289967, DICH 363972
- Awwwards: https://www.awwwards.com/sites/polene · https://www.awwwards.com/sites/permian · https://www.awwwards.com/sites/dichtm-fashion
- Red Dot: https://www.red-dot.org/project/rlux-the-branded-commerce-for-luxury-shopping-83186 · https://www.red-dot.org/project/tossface-66414
- iF: https://ifdesign.com/en/winner-ranking/project/ (R.LUX 708093)
- 토스 TDS 글자: https://tossmini-docs.toss.im/tds-react-native/foundation/typography · 색: …/foundation/colors
- 토스 글: https://toss.tech/article/8-writing-principles-of-toss · https://toss.tech/article/interaction · https://toss.im/tossfeed/article/beginning-of-tps · https://toss.tech/article/value-first-cost-later
- 당근 SEED: https://seed-design.io/foundations/typography · KRDS: https://www.krds.go.kr
- Pretendard: https://github.com/orioncactus/pretendard
