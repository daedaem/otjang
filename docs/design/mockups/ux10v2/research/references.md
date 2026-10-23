# 어울 UX/UI 근거 조사 — 2026-10-19

> 이 문서는 AI(Claude)가 공개 자료를 읽고 정리한 조사다. 수상 디자이너나 해당 회사가 참여하거나 검토하지 않았다. "세계 최고 수준의 UX/UI"는 목표이자 품질 기준이지, 이룬 결과가 아니다. 아래 근거는 그 기준에 가까워지기 위한 참고 자료다. 수상작이라는 사실만으로 그 서비스의 모든 화면이 좋다고 볼 수는 없다. 그래서 수상 페이지나 공식 문서에 적힌 내용만 근거로 쓴다.

- 확인 방법: 2026-10-19에 각 URL을 직접 불러와 본문을 읽었다(curl 또는 WebFetch). Material 3은 사이트가 화면을 그릴 때 받아 오는 콘텐츠 JSON을 읽었고, Apple HIG도 페이지가 쓰는 JSON을 읽었다. FTC 지침은 공식 PDF를 받아 텍스트로 읽었다.
- 표기: **[확인]** 원문에 적힌 내용, **[추론]** 원문을 어울에 옮긴 해석, **확인 못 함** 근거로 쓰지 않음.
- 기계용 목록: `refs.json`(근거 101개, 확인됨 94개, 확인 못 함 7개), `teams.json`(10개 팀 관점).

---

## 0. 수상 근거 다시 확인하기 (상 종류를 정확히 적기)

| 사례 | 정확한 수상 | 디자인 근거로 쓰는가 |
|---|---|---|
| Patagonia | Webby 2021 Fashion, Style & Beauty: **Webby Winner + People's Voice** / Webby 2022 Best Mobile UX: **People's Voice만**(심사위원 수상 아님), Shopping & Retail **Honoree** | 쓴다. 단 특징은 제작사 케이스 스터디(BASIC/DEPT)에서만 가져온다 |
| Gucci Ancora 2024 | Webby 2024 Best Mobile **UI: Webby Winner**(심사위원) + Best Mobile Visual Design–Function **People's Voice** | 쓴다(케이스 스터디) |
| DVF | Webby 2025 Shopping & Retail **People's Voice** | 수상 사실만 쓴다. 특징 설명은 확인 못 함 |
| lululemon | Webby 2026 Fashion, Style & Beauty·Shopping & Retail **People's Voice 2개** | 수상 사실만 쓴다. "활동 먼저 탐색"은 확인 못 함(케이스 스터디 404) |
| Polène | Awwwards **Honorable Mention**(2024-11-01, 태그 Clean·Minimal) | 보조로만 쓴다. 이전 문서의 "E-commerce Honors"를 정정한다 |
| 29CM | Red Dot 2014 Brands & Communication Design(**기본 Red Dot**, 모바일 앱) / iF 2017은 **브랜딩(CI) 부문** | Red Dot만 UI 근거로 쓴다. iF는 UI 수상이 아니다 |
| Coupang R.Lux | Red Dot **Design Concept** 2025, Interaction·UI·UX("Ready For Market") | 쓴다. 출시 제품이 아니라 콘셉트 부문임을 함께 적는다 |
| s.Oliver 앱 | Red Dot 2018 Brands & Communication Design(Shopping App) | 쓴다 |
| STYLISM | iF 2021 **User Interface** 부문(금상 아님) | 쓴다 |
| 신세계백화점 앱 *(신규)* | Red Dot 2017 Brands & Communication Design(Shopping App) | 쓴다 |
| HUGO BOSS iPhone App *(신규)* | iF communication design award **2011**, Mobile Applications | 쓴다(오래된 수상이라 "가치 검증" 용도로만) |
| Viktor&Rolf 웹사이트 *(신규)* | iF 2017 Websites | 쓴다(읽는 결과) |
| Taobao(Vision Pro) *(신규)* | **Apple Design Award 2025 Interaction 부문 Winner** | 쓴다(나란히 비교) |
| Crouton *(신규)* | **Apple Design Award 2024 Interaction 부문 Winner** | 쓴다(정보 위계) |
| Telfar, Apple Pay *(신규)* | Webby 2025 패션 People's Voice / Webby 2026 Shopping & Retail 앱 Webby+People's Voice | 수상 사실만 확인. 디자인 설명이 없어 근거로 쓰지 않는다 |

Webby Winner는 아카데미가 후보 5개 중 1개를 심사로 고르고, People's Voice는 공개 투표로 정한다 [확인] https://www.webbyawards.com/faq/ . 두 상을 섞어 "Webby 수상"으로 뭉뚱그려 쓰지 않는다.

---

## 1. 정보 구조(IA)·탐색

**1-1. 하단 탭은 3~5개로 두고, 화면이 바뀌어도 사라지지 않게 한다**
- 근거: Material 3 Navigation bar는 중요도가 같은 목적지 3~5개를 두고, 목적지는 화면마다 바뀌지 않는다고 한다 [확인] https://m3.material.io/components/navigation-bar/guidelines · Apple HIG Tab bars는 탭 바를 계속 보이게 하고, 내용이 없어도 탭을 숨기거나 비활성화하지 말고 빈 이유를 설명하며, 라벨은 한 단어로 쓰라고 한다 [확인] https://developer.apple.com/design/human-interface-guidelines/tab-bars
- 왜: 사용자가 지금 어디에 있는지 잃지 않는다.
- 어울 규칙: 휴대폰 하단 탭은 3~4개, 라벨은 2~3글자로 한다. 옷장이 비어도 탭은 그대로 두고 빈 상태 화면으로 안내한다.

**1-2. 한 줄 요청을 어떻게 알아들었는지 칩으로 보여 준다**
- 근거: Baymard에 따르면 검색어 속 속성("$30 shampoo")은 결과 화면의 필터로 자동 적용하는 것이 이상적이다(Sephora는 $25–35 범위를 적용). 용도 검색("party dress")에도 필터를 미리 적용하면 사이트가 어떻게 해석했는지 보이고, 범위를 넓히거나 좁히기 쉽다. 의류는 용도 검색이 많다 [확인] https://baymard.com/blog/ecommerce-search-query-types · 적용된 필터를 지울 수 있는 칩으로 보여 주지 않는 사이트가 28%다 [확인] https://baymard.com/blog/product-listing-page-plp-ux · HIG Search fields는 토큰(고르고 고칠 수 있는 검색어 단위)을 쓰라고 한다 [확인] https://developer.apple.com/design/human-interface-guidelines/search-fields
- 왜: 규칙 기반 검색은 틀릴 수 있다. 해석이 보이면 사용자가 바로 고칠 수 있다.
- 어울 규칙: "출근용 셔츠 10만원 이하"를 결과 위 칩 [출근] [셔츠] [10만원 이하]로 보여 준다. 칩은 각각 ✕로 지울 수 있고, 터치 영역은 44px 이상이다. 칩을 지워도 스크롤 위치는 그대로 두고 결과 수만 바꾼다(NN/g https://www.nngroup.com/articles/applying-filters/).

**1-3. 묻는 흐름은 한 화면에 한 질문만 담는다**
- 근거: GOV.UK는 한 페이지에 한 가지(정보 하나, 결정 하나, 질문 하나)만 담으라고 한다. 이렇게 하면 모바일 사용과 오류 복구가 쉬워진다 [확인] https://www.gov.uk/service-manual/design/form-structure · 질문 페이지에는 뒤로 링크, 제목, 계속 버튼을 둔다. "잘 모르겠어요"가 유효한 답이면 허용하고, 같은 정보는 한 번만 묻는다 [확인] https://design-system.service.gov.uk/patterns/question-pages/
- 왜: 판단할 거리가 하나뿐이면 망설임이 줄어든다.
- 어울 규칙: 안내형 단계(무엇·언제·예산)는 한 화면에 한 질문씩 묻고, 질문마다 "상관없음"을 둔다. 이미 고른 답은 결과 칩으로 이어서 다시 묻지 않는다(WCAG 3.3.7).

**1-4. PC에서는 같은 기능을 더 넓게 보여 줄 뿐, 기능은 바꾸지 않는다**
- 근거: HIG Layout은 크기 클래스가 바뀌어도 기능은 같게 두고, 넓어지면 보이는 양만 늘리라고 한다(탭 바를 사이드바로) [확인] https://developer.apple.com/design/human-interface-guidelines/layout · Material 3의 정석 레이아웃은 list-detail(두 창)과 supporting pane(expanded에서 보조 창 360dp 고정)이다. 1200–1599dp는 large 구간이다 [확인] https://m3.material.io/foundations/layout/canonical-examples · Baymard는 큰 화면에만 새 콘텐츠를 넣지 말라고 한다 [확인] https://baymard.com/blog/responsive-upscaling
- 왜: 기기를 바꿔도 다시 배울 필요가 없다.
- 어울 규칙: 1280px 화면은 목록 | 상세(| 360px 보조 창)로 나눈다. 버튼 이름과 문구는 휴대폰과 똑같이 쓴다.

**1-5. 뒤로가기는 직전 상태를 그대로 되살린다**
- 근거: GOV.UK는 브라우저 뒤로가기를 깨지 말고, 사용자가 마지막으로 본 상태로 돌려보내라고 한다 [확인](1-3 URL) · Baymard는 상세 페이지에 갔다가 목록의 같은 자리로 돌아오지 못하면 비교가 번거로워진다고 한다 [확인] https://baymard.com/blog/provide-comparison-features · NN/g는 바텀시트를 뒤로가기로 닫을 수 있게 하라고 한다 [확인] https://www.nngroup.com/articles/bottom-sheet/
- 어울 규칙: 상세에서 뒤로 가면 목록의 스크롤 위치와 칩이 그대로다. 시트가 열려 있을 때 뒤로가기를 누르면 시트만 닫힌다.

**1-6. 가입이나 옷장 등록보다 가치를 먼저 준다**
- 근거: NN/g는 가치를 주기 전에 로그인 벽을 세우거나 정보를 요구하면 신뢰가 깎인다고 한다 [확인] https://www.nngroup.com/articles/trustworthy-design/ · Baymard 2026에 따르면, 찜(하트)을 누르자 가입을 요구한 Adidas 사례에 참가자가 강하게 반발했다 [확인] https://baymard.com/research-articles/current-state-ecommerce-product-page-ux
- 어울 규칙: 첫 검색, 찜, 비교, 결정은 가입 없이 기기에 저장한다. 내 옷과의 비교는 "1벌만 추가해도" 시작할 수 있다.

---

## 2. 실제 상품 사진 (비율·배경·크기·목록 밀도)

**2-1. 사진 비율과 배경은 하나로 맞춘다**
- 근거: Baymard에 따르면 타일끼리 이미지 스타일이 같으면 훑기 쉽고, 촬영 스타일과 배경이 섞이면 읽기 어렵다 [확인] https://baymard.com/blog/ecommerce-category-page · 썸네일 각도가 서로 다르면 같은 상품인지 헷갈린다 [확인] https://baymard.com/blog/combine-variations-one-list-item
- 왜: 사진끼리의 차이가 촬영 조건이 아니라 옷의 차이로 읽힌다.
- 어울 규칙: 목록 사진은 4:5 하나로 맞춘다. 판매처 정사각 사진은 자르지 않고(contain) 같은 밝은 배경 위에 둔다. 색만 다른 같은 상품은 타일 하나에 색 점으로 표시한다.

**2-2. 휴대폰은 2열로, 첫 화면에 상품이 4개 이상 보이게 한다**
- 근거: Baymard는 시각적으로 고르는 상품은 그리드를 쓰라고 한다 [확인](1-2 PLP URL). 모바일은 한 화면에 보통 2~4개가 보이므로 한 번에 15~30개를 불러오라고 하고, "더 보기" 버튼이 대체로 가장 낫다고 한다 [확인] https://baymard.com/blog/number-of-items-loaded-by-default · 큰 화면은 썸네일을 키우되 5~8열을 넘기지 말라고 한다 [확인] https://baymard.com/blog/responsive-upscaling
- 어울 규칙: 390px에서는 2열(좌우 여백 16, 간격 12, 사진 폭 약 173px)로 둔다. 답 카드가 없는 화면은 첫 화면에 상품 4개 이상을 보여 준다. 처음 24개를 불러오고 "더 보기"를 둔다. 1280px은 4열에 사진 폭 220px 이상이다.

**2-3. 목록 타일에는 판단에 꼭 필요한 정보만, 늘 같은 순서로 넣는다**
- 근거: Baymard는 사용자가 없으면 클릭을 피하는 필수 정보 5가지로 가격, 상품명·종류, 썸네일, 평점, 변형을 꼽는다. 가격은 늘 보여야 한다. 목록 정보가 부족한 사이트가 50%다 [확인] https://baymard.com/blog/product-listing-information
- 어울 규칙: 타일은 사진 → 브랜드 → 상품명(2줄 이하) → 수집가 순서다. 평점을 수집하지 않는다면 빈칸이나 가짜 별점을 넣지 말고 아예 표시하지 않는다.

**2-4. 착용 사진은 실제 판매처 사진만 쓰고, 없으면 없다고 쓴다**
- 근거: Baymard는 입는 상품은 착용 이미지가 있어야 길이와 핏을 판단할 수 있고, 최소 1장은 걷거나 넣어 입지 않은 사진이어야 한다고 한다 [확인] https://baymard.com/research-articles/human-model · 의류 사이트의 83%(데스크톱), 87%(모바일)가 사이즈 정보가 부족하다 [확인] https://baymard.com/research-articles/apparel-size-information
- 어울 규칙: 판매처에 착용 사진이 있으면 상세 두 번째 장으로 보여 준다. 없으면 "착용 사진 없음 · 판매처에서 확인"이라고 쓴다. 합성 착용샷은 만들지 않는다.

**2-5. 꾸밈용 이미지는 쓰지 않는다**
- 근거: NN/g 시선 추적 연구에 따르면 상품 사진과 실제 사람 사진은 자세히 보지만, 분위기용 장식 사진은 무시한다 [확인] https://www.nngroup.com/articles/photos-as-web-content/ · 29CM(Red Dot 2014)은 색과 선을 최소화해 콘텐츠 집중을 높였다 [확인] https://www.red-dot.org/project/29cm-21426 · 신세계백화점 앱(Red Dot 2017)은 글을 줄이고 여백과 고품질 이미지를 넉넉히 썼다 [확인] https://www.red-dot.org/project/shinsegae-department-store-16529-16526
- 어울 규칙: 화면에 나오는 이미지는 모두 실제 상품이나 내 옷 사진이다. 무드 배너, 히어로 이미지, 일러스트는 0개다.

**2-6. 글자는 사진 위에 올리지 않는다** [추론]
- 근거: 사진 위 글자는 사진마다 배경이 달라져 대비 4.5:1을 보장할 수 없다(WCAG 1.4.3) https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html
- 어울 규칙: 가격, 배지, 겹침 표시는 사진 아래에 둔다. 예외는 사진 모서리의 원형 아이콘 버튼(찜, ＋비교)뿐이며, 바탕을 깔고 터치 영역은 44px 이상이다.

---

## 3. 타이포·여백·색상

**3-1. 무채색 바탕에 강조색 하나만 쓴다**
- 근거: R.Lux(Red Dot Design Concept 2025)는 흑백 인터페이스 [확인] https://www.red-dot.org/project/rlux-the-branded-commerce-for-luxury-shopping-83186 · 신세계백화점 앱(Red Dot 2017)도 흑백 [확인] · Gucci Ancora는 진홍색 하나를 상징색으로 썼다 [확인] https://basicagency.com/case-studies/gucci-ancora · HIG는 콘텐츠가 화려하면 탭 바를 단색으로 두라고 한다 [확인](1-1 URL)
- 왜: 옷 사진의 색이 주인공이고, UI 색은 상태를 알리는 데만 쓴다.
- 어울 규칙: UI 색은 무채색에 강조색 1개다. 강조색은 화면당 주 행동 1곳과 선택 상태에만 쓴다. 겹침, 오류 같은 의미 색은 따로 정해 두고, 늘 아이콘과 문장을 함께 붙인다.

**3-2. 글자 크기 단계를 줄이고, 최소 크기를 지킨다**
- 근거: HIG Accessibility는 iOS 기본 17pt, 최소 11pt를 제시하고, 글자를 200%까지 키울 수 있게 하라고 한다 [확인] https://developer.apple.com/design/human-interface-guidelines/accessibility · Baymard는 가격이 잘 안 보이자 참가자들이 사이트 전체를 부정적으로 봤다고 보고한다 [확인] https://baymard.com/blog/product-page-price-discounts
- 어울 규칙: 본문은 15~16px, 상세의 수집가는 17px 이상 굵게, 가장 작은 글자는 12px로 한다. 200%로 확대해도 글자가 겹치거나 잘리지 않아야 한다.

**3-3. 대비는 숫자로 확인한다**
- 근거: WCAG 1.4.3은 글자 4.5:1, 큰 글자 3:1을 요구한다 [확인](2-6 URL). WCAG 1.4.11은 칩 테두리 같은 UI 구성 요소와 상태 표시에 3:1을 요구한다 [확인] https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html · Material 3은 버튼 컨테이너에도 3:1을 요구한다 [확인] https://m3.material.io/foundations/designing/structure
- 어울 규칙: 수집 날짜 같은 회색 보조 글자도 흰 바탕에서 4.5:1 이상으로 한다(예: #767676 이상 진하게). 칩과 입력칸 테두리는 3:1 이상, 다크 모드도 같은 기준이다.

**3-4. 카드를 남발하지 않고 여백과 구분선으로 묶는다**
- 근거: Material 3 Cards는 여백, 제목, 구분선으로 더 단순한 위계를 만들 수 있다면 내용을 억지로 카드에 넣지 말라고 한다 [확인] https://m3.material.io/components/cards/guidelines · Patagonia 디자인 시스템은 "Focus, clarity, simplicity"를 원칙으로 군더더기를 걷어 냈다 [확인] https://basicagency.com/case-studies/patagonia-ecommerce-website
- 어울 규칙: 목록 항목은 테두리 없는 타일이나 행으로 둔다. 테두리 있는 카드는 화면당 1~2개(답 카드, 결정 영역)까지만 쓴다.

**3-5. 소제목이 훑어보는 길이 되게 한다**
- 근거: NN/g의 레이어 케이크 패턴에 따르면, 설명적인 소제목이 눈에 띄면 사용자는 소제목 위주로 훑어 원하는 정보를 찾는다 [확인] https://www.nngroup.com/articles/layer-cake-pattern-scanning/ · Material 3은 제목을 시각 스타일이 아니라 내용 위계에 따라 매기고, 단계를 건너뛰지 말라고 한다 [확인](3-3 URL)
- 어울 규칙: 상세 화면은 "가격 근거 / 내 옷과 겹침 / 결정" 같은 소제목 3~5개로 나누고, 소제목은 12자 이내로 쓴다. h1은 화면당 1개다.

**3-6. 움직임은 작게 쓴다**
- 근거: R.Lux는 마이크로 애니메이션을 쓴다 [확인]. Baymard는 모바일에서 자동으로 넘어가는 캐러셀을 피하라고 한다 [확인] https://baymard.com/blog/ecommerce-ux-best-practices · HIG는 동작 줄이기 설정에 반응하라고 한다 [확인](3-2 URL)
- 어울 규칙: 자동으로 넘어가는 배너는 쓰지 않는다. 전환은 200ms 이하로 하고, prefers-reduced-motion이면 끈다.

---

## 4. 모바일 조작 (엄지 영역·시트·고정 버튼·뒤로가기)

**4-1. 강조는 하나만 하고, 결정 버튼 3개는 크기를 같게 한다**
- 근거: HIG Buttons는 강조 버튼을 화면당 1~2개로 두고, 여러 선택지 중 권장안은 "크기가 아니라 스타일로" 구분하라고 한다. 크기가 같아야 한 묶음의 선택지로 읽힌다 [확인] https://developer.apple.com/design/human-interface-guidelines/buttons · Material 3은 FAB를 한 화면에 여러 개 두지 말라고 한다 [확인] https://m3.material.io/components/floating-action-button/guidelines · Baymard는 하단에 고정한 장바구니 버튼을 화면 폭 전체로 늘리지 말고 여백을 두라고 한다 [확인] https://baymard.com/blog/ecommerce-ux-best-practices
- 어울 규칙: 사기로 함 / 보류 / 안 살래는 같은 높이(48px 이상), 같은 폭으로 둔다. 채움 스타일은 1개만 쓴다. 하단 고정 바는 좌우에 16px 여백을 둔다.

**4-2. 시트는 한 번에 한 장만 띄우고, ✕ 버튼과 뒤로가기로 닫히게 한다**
- 근거: HIG Sheets는 주 화면에서 시트를 한 번에 하나만 띄우라고 한다. 그래버는 탭으로 높이를 바꿀 수 있고 VoiceOver로도 조작된다 [확인] https://developer.apple.com/design/human-interface-guidelines/sheets · NN/g는 시트를 겹쳐 쌓지 말고, 보이는 닫기 버튼을 두고, 상품 상세 페이지를 시트로 띄우지 말라고 한다 [확인] https://www.nngroup.com/articles/bottom-sheet/ · Material 3은 modal 시트의 첫 높이를 화면의 50% 이하로 하고, 드래그 핸들의 터치 영역을 48dp로 하라고 한다 [확인] https://m3.material.io/components/bottom-sheets/guidelines
- 어울 규칙: 시트는 겹치지 않는다. 위쪽에 손잡이와 ✕(44px)를 두고, 처음 높이는 50% 이하다. 상품 상세는 시트가 아니라 페이지로 연다.

**4-3. 지도 앱 같은 비모달 시트는 목록과 맥락을 함께 볼 때만 쓴다**
- 근거: Material 3의 standard 시트는 주 화면과 함께 쓰고(지도 위 위치 정보), 미리보기부터 전체까지 높이를 미리 정해 둔다 [확인](4-2 M3 URL) · NN/g는 비모달 시트로 주 정보를 보면서 다른 일을 함께 하는 예로 Google Maps를 든다 [확인] · HIG는 iPhone에서 medium 디텐트(약 절반)로 점진적으로 보여 주라고 한다 [확인]
- 어울 규칙: 시트 높이는 3단(접힘 약 96px, 중간 50%, 전체)으로 둔다. 높이를 바꾸는 버튼을 따로 둬서 드래그 없이도 바꿀 수 있게 한다(WCAG 2.5.7).

**4-4. 하단 탭과 하단 행동 바를 동시에 보여 주지 않는다**
- 근거: Material 3 Toolbars는 툴바와 내비게이션 바가 모두 하단에 있으므로 동시에 보이면 안 된다고 한다. 1차 페이지에는 내비게이션 바를, 하위 페이지에는 툴바를 둔다 [확인] https://m3.material.io/components/toolbars/guidelines · HIG는 탭 바는 이동용이지 행동용이 아니라고 한다 [확인](1-1 URL)
- 어울 규칙: 목록 화면에는 하단 탭만, 상세·결정 화면에는 결정 바만 둔다.

**4-5. "하단이 무조건 누르기 쉽다"고 가정하지 않는다**
- 근거: NN/g는 사람마다 기기를 쥐는 방식이 달라 하단이 늘 가장 닿기 쉬운 곳은 아니며, 대체로 화면 중간이 가장 누르기 쉽다고 한다 [확인](4-2 NN/g URL) · 반면 HIG는 검색이 중요하면 검색창을 하단 툴바에 두라고 한다 [확인] https://developer.apple.com/design/human-interface-guidelines/search-fields
- 어울 규칙: 검색과 주 행동은 하단에 둘 수 있다. 자주 누르는 상품 사진은 화면 중간에 오게 한다. 되돌리기 어려운 행동(기록 삭제)은 하단 모서리에 두지 않는다.

**4-6. 스와이프는 보조 수단이다. 버튼을 늘 보여 주고 되돌리기를 둔다**
- 근거: NN/g는 스와이프에 단서가 없어 발견하기 어렵고, 실수로 실행되며, 가로 스와이프는 뒤로가기 제스처와 헷갈린다고 한다. 확인이나 되돌리기가 필요하다 [확인] https://www.nngroup.com/articles/contextual-swipe/ · s.Oliver 앱(Red Dot 2018)은 스와이프로 상품을 제안한다 [확인] https://www.red-dot.org/project/soliver-fashion-app-25907 · WCAG 2.5.7은 드래그 없이 단일 포인터로도 쓸 수 있어야 한다고 요구한다 [확인] https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html
- 어울 규칙: 스와이프로 결정해도 같은 기능의 버튼 3개를 늘 보여 준다. 결정 뒤 5초 동안 "되돌리기"를 띄운다. 화면 가장자리 20px에서 시작한 스와이프는 받지 않는다.

**4-7. 고정 영역은 작게 유지한다**
- 근거: NN/g는 고정 헤더를 작게 두고, 대비를 확보하고, 움직임을 최소로 하고, 부분 고정을 고려하고, 정말 필요한지 따져 보라고 한다 [확인] https://www.nngroup.com/articles/sticky-headers/ · Baymard에 따르면 모바일 비교 패널이 화면의 51%를 가린 사례가 있다 [확인](1-5 Baymard URL)
- 어울 규칙: 위아래 고정 영역을 합쳐 화면 높이의 25% 이하(844px 기준 211px 이하)로 둔다. 스크롤을 내리면 상단은 접힌다.

---

## 5. 접근성

**5-1. 터치 대상은 44~48px로 한다**
- 근거: HIG는 기본 44×44pt(최소 28)를 권하고, 베젤 있는 요소는 주변에 약 12pt, 베젤 없는 요소는 약 24pt 여백을 두라고 한다 [확인](3-2 URL) · Material 3은 48×48dp(약 9mm)를 권한다 [확인](3-3 URL) · WCAG 2.5.8(AA)의 최소선은 24×24 CSS px다 [확인] https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html · NN/g는 1cm×1cm를 권한다 [확인] https://www.nngroup.com/articles/touch-target-size/
- 어울 규칙: 모든 탭 대상은 44×44px 이상, 결정 버튼과 칩은 48px로 한다. 이웃한 대상 사이는 8px 이상 띄운다. 24px은 법적 최소선일 뿐 목표가 아니다.

**5-2. 색만으로 정보를 전달하지 않는다**
- 근거: WCAG 1.4.1 https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html · 1.4.11 [확인]
- 어울 규칙: 겹침 판정은 색, 아이콘, 문장("비슷한 옷 2벌 있어요")을 함께 쓴다. 상태 칩(주문, 수령, 보관, 반품)도 글자로 구분한다.

**5-3. 320px 폭에서도 가로 스크롤이 없게 한다**
- 근거: WCAG 1.4.10은 320 CSS px에서 두 방향 스크롤 없이 쓸 수 있어야 한다고 요구한다(1280px 화면을 400% 확대한 것과 같다). 데이터 표는 예외다 [확인] https://www.w3.org/WAI/WCAG22/Understanding/reflow.html
- 어울 규칙: 페이지 전체의 가로 스크롤은 0이다. 비교표 영역만 가로 스크롤을 허용하고, 첫 열(항목 이름)은 고정한다.

**5-4. 고정 바가 포커스를 가리지 않게 한다**
- 근거: WCAG 2.4.11은 포커스 받은 요소가 고정 바 같은 작성자 콘텐츠에 완전히 가려지면 안 된다고 요구한다 [확인] https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html. 이전 디자인 시스템 점검에서도 axe가 고정 저장 버튼이 마지막 줄을 가리는 문제를 찾았다.
- 어울 규칙: 하단 고정 바 높이만큼 `scroll-padding-bottom`과 본문 아래 여백을 준다.

**5-5. 상태 변화는 화면 낭독기가 읽게 한다**
- 근거: WCAG 4.1.3 https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html [확인]
- 어울 규칙: "비교함에 담음 2/3", "결과 12개", "되돌렸어요"는 `role="status"`로 알린다.

**5-6. 구조를 정확히 표시한다**
- 근거: Material 3은 랜드마크와 제목 구조를 내용 위계대로 매기고, 같은 역할의 랜드마크가 여럿이면 각각 이름을 붙이라고 한다 [확인](3-3 URL) · GOV.UK 오류 메시지는 화면 낭독기용으로 "Error:" 접두어를 숨겨서 붙인다 [확인] https://design-system.service.gov.uk/components/error-message/
- 어울 규칙: 화면마다 h1은 1개다. 하단 탭과 결정 바에는 각각 aria-label을 붙인다. 오류 문장 앞에는 낭독용 "오류:"를 숨겨서 넣는다.

---

## 6. 오류·빈 결과 처리

**6-1. 빈 결과에는 "왜 없는지"와 "다음에 무엇을 할지"를 함께 쓴다**
- 근거: Polaris는 왜 비었는지 말하고 그다음 할 일을 제시하라고 한다. 주 행동은 하나이고, "처음부터 비어 있음"과 "필터 결과 없음"은 다른 문구로 쓴다 [확인] https://shopify.dev/docs/api/app-home/latest/web-components/feedback-and-status-indicators/empty-state · Carbon은 빈 상태를 데이터 없음, 사용자 행동 결과(검색 결과 없음), 오류 관리로 나눈다 [확인] https://carbondesignsystem.com/patterns/empty-states-pattern/ · Atlassian은 사람들이 훑어 읽으므로 1~2문장으로 쓰라고 한다 [확인] https://atlassian.design/foundations/content/designing-messages/empty-state
- 어울 규칙: "‘출근용 셔츠 · 10만원 이하’에 맞는 상품을 못 찾았어요" 한 줄 뒤에 대안 버튼을 둔다. 빈 옷장, 빈 비교함, 검색 0건의 문구는 서로 다르게 쓴다.

**6-2. 검색 팁 대신 결과가 있는 대안을 숫자와 함께 보여 준다**
- 근거: Baymard에 따르면 약 50%의 사이트가 빈 결과에서 빠져나갈 길을 주지 못한다. "검색 팁"은 거의 읽히지 않는다. 단순화한 대체 검색어를 상위 3~5개 미리보기와 함께 보여 주고, 대체 검색어가 하나뿐이면 자동으로 적용한 뒤 그 사실을 알려야 한다. Gucci의 빈 결과 페이지는 아무 도움이 없는 사례로 나온다 [확인] https://baymard.com/research-articles/no-results-page
- 어울 규칙: 0건이면 칩을 하나씩 뺀 대안을 최대 3개 보여 준다(예: "예산을 12만원으로 → 8개"). 각 대안에 상품 3개를 미리 보여 준다. 대안이 1개뿐이면 자동으로 적용하고 "원래 조건으로는 0개라 예산을 넓혔어요"라고 알린다. 검색 팁 문단은 쓰지 않는다.

**6-3. 불러오는 중에 "없음"을 띄우지 않는다**
- 근거: NN/g는 처리가 끝나기 전에 "항목 없음"을 띄웠다가 나중에 내용으로 바꾸는 것이 더 나쁘다고 한다 [확인] https://www.nngroup.com/articles/empty-state-interface-design/
- 어울 규칙: 수집하는 동안은 사진 자리에 스켈레톤을 두고 "판매처에서 가져오는 중"이라고 쓴다. 0건 문구는 수집이 끝난 뒤에만 띄운다.

**6-4. 빈 상태는 원래 요소 자리를 대신한다**
- 근거: Carbon은 빈 표의 머리글과 푸터를 남기지 말라고 한다. 화면 낭독기가 빈 표를 끝까지 읽지 않게 하기 위해서다. 한 빈 상태에 여러 선택지를 두지 않는다 [확인](6-1 Carbon URL) · Atlassian은 일러스트를 선택 사항으로 본다 [확인] https://atlassian.design/components/empty-state/usage
- 어울 규칙: 빈 비교함이나 빈 장부에는 표 머리글 없이 한 줄 안내와 버튼 1개만 둔다. 일러스트는 쓰지 않는다.

**6-5. 오류 문장은 구체적으로 쓰고, 입력값은 지우지 않는다**
- 근거: GOV.UK는 오류 문구를 필드 옆과 오류 요약에 똑같이 쓰고, 입력값을 유지하라고 한다. "please, sorry, oops, invalid", 전문용어, "필수 항목입니다" 같은 일반 문구는 금지한다 [확인](5-6 URL) · NN/g는 원인 옆에 표시하고, 너무 일찍 띄우지 말고, 해결책을 주고, 사용자를 탓하지 말라고 한다 [확인] https://www.nngroup.com/articles/error-message-guidelines/ · WCAG 3.3.1은 오류를 글로 설명하라고 요구한다 [확인] https://www.w3.org/WAI/WCAG22/Understanding/error-identification.html
- 어울 규칙: 기록 입력(주문일, 반품일) 오류는 입력칸 바로 아래에 아이콘과 문장으로 표시하고 입력값은 그대로 둔다. "죄송", "앗", "잘못된"은 쓰지 않는다. 오류가 2개 이상이면 위쪽에 요약을 두고 각 칸으로 링크한다 https://design-system.service.gov.uk/components/error-summary/

**6-6. 사용자가 고칠 수 없는 문제는 오류가 아니라 안내로 다룬다**
- 근거: GOV.UK는 서비스 쪽 문제를 오류 메시지로 표시하지 말고 설명 페이지로 안내하라고 한다 [확인](5-6 URL) · Atlassian은 원인을 모르면 지어내지 말고 할 수 있는 일을 제시하라고 한다 [확인] https://atlassian.design/foundations/content/designing-messages/error-messages
- 어울 규칙: 판매처 링크가 끊겼거나 가격 수집에 실패하면 빨간 오류 대신 회색 한 줄("이 상품 정보를 다시 가져오지 못했어요")과 "다시 시도" 버튼을 둔다. 원인을 추측해서 쓰지 않는다.

---

## 7. 비교·결정 (어울의 차별점)

**7-1. 옷 비교의 중심은 스펙 표가 아니라 "내 옷과 겹치는지"다**
- 근거: NN/g는 옷과 액세서리처럼 외형으로 고르는 상품에는 비교표가 대개 필요 없다고 한다 [확인] https://www.nngroup.com/articles/comparison-tables/ · Baymard 모바일 테스트에서 비교 기능을 쓴 사람은 38명 중 3명뿐이었다. 그래서 새 모바일 비교 기능을 만드는 것은 근거가 부족하다고 본다 [확인](1-5 Baymard URL) · 반대로 HUGO BOSS 앱(iF 2011)은 "상품을 사용자의 옷과 색으로 맞춰 보는" 기능으로 수상했다 [확인] https://ifdesign.com/en/winner-ranking/project/hugo-boss-iphone-app/69554
- 왜: 사람들이 옷을 살 때 실제로 묻는 것은 "이게 저것보다 스펙이 좋은가"가 아니라 "이미 비슷한 옷이 있나"다. 어울만 답할 수 있는 질문이기도 하다.
- 어울 규칙: 상세 화면의 주 버튼은 "내 옷과 비교"다. 결과는 판정 한 문장("비슷한 옷이 이미 있어요"), 근거 사진(내 옷 썸네일), 판정 기준 한 줄 순서로 보여 준다. 후보끼리 비교하는 표는 보조 기능이다.

**7-2. 비교 개수는 휴대폰 2개, PC 3~4개로 하고 한도를 미리 알린다**
- 근거: NN/g는 동적 비교표에 보통 3~4개를, 모바일에는 2개를 담으라고 한다. 한도를 알리고 뺄 수 있게 해야 한다 [확인](7-1 NN/g URL) · Baymard는 3~5개 한도와 함께 "몇 개 더 담을 수 있는지"를 보여 주라고 한다 [확인]
- 어울 규칙: 비교함 바에는 "2/2 담음"을 표시한다. 한도를 넘기면 담기를 막지 말고 "하나를 빼면 담을 수 있어요"라는 안내와 빼기 버튼을 보여 준다.

**7-3. "＋비교" 버튼은 늘 보이게 하고, 담은 상품은 하단 바에 모아 둔다**
- 근거: Baymard는 비교 체크박스를 hover 때만 보여 주면 기능이 있는지 모른다며, 기본으로 보이게 하라고 예전 권고를 고쳤다. 하단에 계속 떠 있는 패널이 잘 작동했다 [확인] · Patagonia는 페이지를 옮기지 않는 "상품 비교 오버레이"로 상세 페이지를 오가는 번거로움을 없앴다 [확인] https://basicagency.com/case-studies/patagonia-ecommerce-website · Taobao(Apple Design Award 2025 Interaction)도 "상품을 나란히 비교하는 기능"을 높이 평가받았다 [확인] https://developer.apple.com/design/awards/2025/
- 어울 규칙: 타일 모서리에 "＋비교"(44px)를 늘 둔다. 담으면 하단에 72px 이하의 비교함 바(썸네일, 개수, "비교하기")가 나타난다. 비교 화면은 오버레이로 열고, 닫으면 원래 스크롤 위치로 돌아간다.

**7-4. 비교표의 행은 사람이 판단하는 말로 쓰고, 차이를 드러낸다**
- 근거: NN/g는 비교표의 가장 큰 문제가 디자인이 아니라 내용(빠지거나 서로 다른 값)이라고 한다. 열 머리글을 고정하고, "차이만 보기"를 두고, 속성을 사용자가 이해하는 말로 바꾸라고 한다 [확인](7-1 NN/g URL) · Polaris는 금액 열을 오른쪽 정렬하고, 열 수를 최소로 하며, 작은 화면에서는 목록으로 바꾸라고 한다 [확인] https://shopify.dev/docs/api/app-home/latest/web-components/layout-and-structure/table
- 어울 규칙: 행은 5개 이하다(사진, 수집가, 색과 소재, 내 옷과 겹침, 판매처). 사진 행은 위에 고정한다. 값이 없으면 "정보 없음"으로 통일한다. 수집가는 오른쪽 정렬, 숫자는 고정폭이다.

**7-5. 결정은 세 가지 중 하나로 하고, "보류"도 정식 선택지로 둔다**
- 근거: GOV.UK는 "잘 모르겠어요"가 유효한 답이면 허용하라고 한다 [확인](1-3 URL) · Material 3 segmented buttons는 2~5개의 단순한 선택에 쓴다 [확인] https://m3.material.io/components/segmented-buttons/overview · NN/g는 선택지가 많을수록 결정 피로가 커진다고 한다 [확인] https://www.nngroup.com/articles/simplicity-vs-choice/
- 어울 규칙: 사기로 함 / 보류 / 안 살래 세 가지만 둔다. 보류는 따로 모아서 나중에 다시 보게 한다. "가격 알림"처럼 수집가 구조로 지킬 수 없는 약속은 하지 않는다.

**7-6. 결정 뒤 기록은 영수증 같은 요약 목록으로 남기고, 언제든 고칠 수 있게 한다**
- 근거: GOV.UK Summary list와 Check answers는 핵심 사실을 키-값 목록으로 보여 주고, 확정 직전에 한 번 확인하게 한다 [확인] https://design-system.service.gov.uk/components/summary-list/ · Carbon은 열 제목을 1~2단어로 쓰고, 헤더와 행 높이를 같게 하라고 한다 [확인] https://carbondesignsystem.com/components/data-table/usage/ · Crouton(Apple Design Award 2024 Interaction)은 "다음 단계가 필요한 곳에 바로 있는" 정리와 정보 위계로 수상했다 [확인] https://developer.apple.com/design/awards/2024/
- 어울 규칙: 기록 한 행은 사진 48px, 이름, 수집가, 상태 칩, 날짜로 이룬다. 행을 누르면 영수증 화면(키-값)이 열리고, 줄마다 "변경" 링크가 있다. 다음 할 일("반품 마감 10/25")은 그 행에 바로 보인다.

**7-7. 추천 이유는 사용자 자신의 조건으로 설명한다**
- 근거: STYLISM(iF 2021 UI)은 체형, 피부색, 라이프스타일에 맞춰 옷을 골라 "최선의 구매 결정"을 돕는다 [확인] https://ifdesign.com/en/winner-ranking/project/stylism/313798 · s.Oliver는 사이즈와 선호 스타일에 맞춰 시작 화면을 바꾼다 [확인]
- 어울 규칙: 결과마다 이유를 한 줄로 단다. 이유는 사용자의 조건(용도, 예산, 내 옷)으로만 쓰고, "인기", "AI 추천"처럼 근거를 확인할 수 없는 말은 쓰지 않는다.

---

## 8. 신뢰 표기 (가격 근거·고지를 깔끔하게)

**8-1. 가격 근거는 가격 바로 옆에 한 줄로 쓴다**
- 근거: FTC .com Disclosures는 고지를 해당 주장에 최대한 가깝게, 구매 결정 전에 두라고 한다. 다른 온라인 판매처에서 사는 상품이면 그 판매처로 가기 전에 보여야 한다 [확인] https://www.ftc.gov/system/files/documents/plain-language/bus41-dot-com-disclosures-information-about-online-advertising.pdf · NN/g는 사전 공개와 최신 정보를 신뢰 요인으로 꼽는다 [확인] https://www.nngroup.com/articles/trustworthy-design/
- 어울 규칙: 가격 옆에 "수집가 · 10/18 수집"(12px, 대비 4.5:1)을 붙인다. "무신사에서 보기" 버튼 바로 위에 "가격과 재고는 판매처에서 달라질 수 있어요"를 1번만 쓴다. "현재가", "최저가"는 쓰지 않는다.

**8-2. 자세한 설명은 접어 두고, 링크 이름에 내용을 드러낸다**
- 근거: GOV.UK Details는 일부 사용자만 필요한 정보를 접어 두되, 대부분이 필요한 정보는 숨기지 말라고 한다 [확인] https://design-system.service.gov.uk/components/details/ · FTC는 링크로 고지할 때 링크를 분명히 하고, 내용과 중요도가 드러나게 이름을 붙이라고 한다 [확인]
- 어울 규칙: "가격은 어떻게 모았나요" 하나만 접기로 둔다. 가격과 날짜 자체는 접지 않는다.

**8-3. 같은 고지를 반복하지 않고, 배너로 띄우지 않는다**
- 근거: FTC는 필요하면 반복하되 "무시되거나 광고를 어지럽힐 만큼" 자주는 하지 말라고 한다 [확인] · GOV.UK는 알림 배너를 사람들이 자주 놓치니 아껴 쓰고, 지금 하는 일과 관련된 정보는 본문에 넣으라고 한다 [확인] https://design-system.service.gov.uk/components/notification-banner/ · GOV.UK는 인셋 텍스트도 복잡한 화면에서는 잘 안 보인다고 한다 [확인] https://design-system.service.gov.uk/components/inset-text/ · Baymard는 오버레이가 읽히지 않고 닫히는 "overlay blindness"를 보고한다 [확인](2-2 upscaling URL)
- 어울 규칙: 같은 고지 문구는 화면당 1번만 쓴다. 상단 고지 배너, 고지 팝업, 회색 안내 상자 여러 개는 쓰지 않는다.

**8-4. 규칙 기반 검색이라는 한계를 짧게 미리 알린다**
- 근거: HIG Generative AI는 기능이 할 수 있는 일과 없는 일의 기대를 분명히 하라고 한다. 검색창 같은 열린 입력은 큐레이션된 제안으로 시작을 돕고, 사람과 AI를 착각하게 만들지 말라고 한다 [확인] https://developer.apple.com/design/human-interface-guidelines/generative-ai [추론: 어울은 AI가 아니므로 반대로 AI처럼 보이지 않게 한다]
- 어울 규칙: 검색창 아래 예시 칩 3개("출근용 셔츠 10만원 이하" 등)를 둔다. 결과 칩이 해석을 보여 주므로 따로 설명하는 문단은 두지 않는다. "AI", "대화"라는 표현은 쓰지 않는다.

**8-5. 외부로 나가는 링크는 목적지를 밝힌다**
- 근거: FTC는 링크를 분명히 하고 일관된 스타일로 표시하라고 한다 [확인]
- 어울 규칙: "무신사에서 보기 ↗", "중고 검색(외부) ↗"처럼 목적지와 외부 아이콘을 함께 표시한다. 중고 검색은 "연동 아님, 외부 검색 결과로 이동"을 버튼 아래에 한 줄로 쓴다.

**8-6. 모르는 정보는 지어내지 않고 "정보 없음"이라고 쓴다**
- 근거: Atlassian은 원인을 모르면 지어내지 말라고 한다 [확인](6-6 URL) · NN/g는 비교표 값이 빠지거나 서로 다르면 표가 쓸모없어진다고 한다 [확인]
- 어울 규칙: 수집하지 못한 사이즈, 소재, 착용 사진은 빈칸이나 추정값 대신 "정보 없음 · 판매처에서 확인"으로 쓴다.

---

## 9. 10개 팀 관점별 참고 묶음

각 팀 관점에 맞는 근거 3개와 화면에 옮길 판단 3개다. 자세한 내용은 `teams.json`에 있다.

**01 답 먼저 (결과 맨 위 답 카드)**
- 근거: Baymard Query types(해석을 필터로 보여 주기) · HIG Search fields(가장 관련 높은 결과를 먼저) · Baymard 목록 필수 정보
- 판단: ① 답 카드는 1개, 높이는 화면의 40% 이하이고, 첫 화면에 아래 상품이 2개 이상 보여야 한다. ② 카드 위에 해석 칩을 두고, 이유는 칩과 같은 말로만 쓴다("AI 추천", "최적", "최저가" 금지). ③ 0건이면 답 카드 자리가 대안 카드(칩 하나를 뺀 결과 수와 미리보기 3개)로 바뀐다.

**02 세 번 탭 (무엇/언제/예산 타일)**
- 근거: GOV.UK Question pages("모르겠음" 허용, 뒤로 링크) · GOV.UK 한 페이지 한 가지 · WCAG 3.3.7 중복 입력
- 판단: ① 한 화면에 한 질문만 두고, 타일 4~6개에 "상관없음"을 더한다. 타일은 56px 이상이고 "1/3"을 표시한다. ② 답은 결과 칩으로 이어지고, 칩을 누르면 그 질문으로만 돌아간다. ③ 고르자마자 넘어가도 되지만, 뒤로 가면 선택이 남아 있어야 한다.

**03 비교함 (비교 트레이 + 표)**
- 근거: Baymard Comparison(늘 보이는 담기, 하단 패널, 모바일 사용률 낮음) · NN/g Comparison tables(휴대폰 2개, 옷은 표가 덜 필요) · Patagonia 비교 오버레이
- 판단: ① 휴대폰은 2개에 "내 옷" 행을 더하고, PC는 4개까지다. ② 비교함은 탭 목적지가 아니라 72px 이하의 하단 바이며, 오버레이로 연다. ③ 행은 5개 이하이고 첫 행은 "내 옷과 겹침"이다. "차이만 보기"를 두고, 값이 없으면 "정보 없음"으로 쓴다.

**04 한 장씩 (카드 한 장씩 결정)**
- 근거: s.Oliver(Red Dot 2018, 스와이프 제안) · NN/g Contextual swipe(단서 없음, 실수, 되돌리기) · HIG Buttons(같은 크기, 스타일로 구분)
- 판단: ① 버튼 3개를 늘 보여 주고, 스와이프는 카드 위에서만 받으며 가장자리 20px은 받지 않는다. ② 5초 되돌리기, "3/12" 진행 표시, 목록 보기 전환을 둔다. ③ 보류는 마지막에 다시 보는 묶음이다.

**05 코디 먼저 (코디·룩북 우선)**
- 근거: Baymard 대체/보완 추천 분리(원피스→신발) · HUGO BOSS 앱(iF 2011, 내 옷과 색 맞추기) · Baymard 착용 이미지
- 판단: ① 착용샷을 합성하지 않고 실제 상품 사진과 내 옷 사진을 4:5 타일로 나란히 두며, "규칙으로 조합한 예시"라고 표기한다. ② 각 아이템은 그 상품으로 연결하고, 합계는 "수집가 합계"로 쓴다. ③ "비슷한 다른 옷"과 "같이 입을 옷"은 다른 줄에 둔다.

**06 한 화면 (지도 앱형 시트, PC 3단)**
- 근거: NN/g Bottom sheets(쌓기 금지, 상세는 페이지) · Material 3 Bottom sheets(standard 시트, 미리 정한 높이, 데스크톱은 사이드 시트) · Material 3 Canonical layouts(list-detail, supporting pane 360dp)
- 판단: ① 시트를 겹쳐 쌓는 구상은 시트 1장과 높이 3단으로 바꾼다(HIG와 NN/g가 모두 반대). ② 상품 상세는 페이지로 열고, 높이 조절 버튼을 둔다. ③ PC는 목록 | 상세 | 보조 창 360px로 나누고, 휴대폰 시트와 같은 내용을 담는다.

**07 장부 (기록 행 + 영수증)**
- 근거: GOV.UK Summary list/Check answers · Polaris Table(모바일은 목록, 금액 오른쪽 정렬) · Carbon Data table(열 제목 1~2단어, 같은 행 높이)
- 판단: ① 행은 사진 48px, 이름, 수집가(오른쪽 정렬), 상태 칩(글자와 색), 날짜로 이루고, 카드 대신 구분선을 쓴다. ② 휴대폰은 행 목록, PC는 표로 보여 주고, 영수증 화면 줄마다 "변경"을 둔다. ③ 빈 장부는 한 문장과 버튼 1개만 두고, 표 머리글은 남기지 않는다.

**08 옷장 레일 (늘 보이는 내 옷 줄)**
- 근거: HUGO BOSS 앱(iF 2011, 내 옷과 맞춰 보기) · NN/g Sticky headers(작게, 부분 고정) · Polaris Empty state
- 판단: ① 레일은 88px 이하로 하고 스크롤하면 접는다. 고정 영역 합계는 25% 이하이며, 비교함 바와 동시에 펼치지 않는다. ② 옷장이 비면 "내 옷 1벌 추가" 한 칸만 둔다. ③ 겹침은 테두리, 아이콘, 문구로 함께 표시한다.

**09 읽는 결과 (기사형 결과)**
- 근거: Viktor&Rolf(iF 2017, 잡지 같은 쇼핑몰) · NN/g Layer-cake(소제목으로 훑기) · Baymard 목록 필수 정보
- 판단: ① 상품 2~3개마다 설명적인 소제목을 달고, 본문은 상품당 2줄 이내로 쓴다. ② 각 상품 블록에 사진, 브랜드, 수집가, 판매처 링크가 반드시 있어야 하고, 가격을 숨기지 않는다. ③ 사실(수집가, 날짜)과 규칙 판단을 글자 스타일로 구분하고, 장식 이미지는 쓰지 않는다.

**10 엄지 하나 (하단 명령 바 + 결정 서랍, 접근성)**
- 근거: NN/g Bottom sheets(하단이 늘 쉬운 건 아님, 닫기, 뒤로가기) · Material 3 Toolbars(내비게이션 바와 동시 표시 금지) · HIG Accessibility(44pt, 여백, 200%)
- 판단: ① 하단 바에는 검색과 주 행동 1개만 두고, 서랍은 처음에 50% 이하로 열며 ✕와 뒤로가기로 닫힌다. ② 상품 타일은 화면 중간에 두고, 기록 삭제처럼 되돌리기 어려운 행동은 하단 모서리에 두지 않는다. ③ 터치 대상은 48px, 간격은 8px로 하고, 고정 바만큼 scroll-padding을 주며(WCAG 2.4.11), 서랍 높이는 버튼으로도 바꿀 수 있게 한다(WCAG 2.5.7).

---

## 10. 과한 안내문 줄이기

좋은 서비스는 고지를 없애지 않는다. 필요한 고지를 필요한 자리에 한 번, 짧게 쓴다. 정직하게 알리는 것과 화면을 깔끔하게 두는 것은 함께 갈 수 있다.

근거 요약
- FTC .com Disclosures: 고지는 해당 주장 가까이, 구매 결정 전, 다른 판매처로 가기 전에 둔다. 링크는 내용이 드러나게 이름 붙인다. 반복은 필요할 때만 하고, 무시되거나 어지러울 만큼 하지 않는다. 약관에 묻지 않는다 [확인]
- GOV.UK: 일부만 필요한 정보는 Details로 접는다. 알림 배너는 자주 놓치므로 아껴 쓴다. 인셋 텍스트는 복잡한 화면에서 잘 안 보인다 [확인]
- NN/g: 처음에는 중요한 몇 가지만 보여 준다(점진적 공개) https://www.nngroup.com/articles/progressive-disclosure/. 사전 공개는 신뢰를 높인다 [확인]
- Atlassian: 사람들은 훑어 읽으므로 모든 단어가 제 몫을 해야 한다. 1~2문장으로 쓴다 [확인]
- Baymard: 반품 정책은 짧은 요약 목록에 전체 정책 링크를 붙인다. 오버레이는 읽히지 않고 닫힌다 [확인]

어울 고지 규칙
1. **자리**: 고지는 그것이 설명하는 요소 바로 옆에 둔다. 가격 근거는 가격 옆, 판매처 고지는 "무신사에서 보기" 버튼 바로 위다.
2. **길이**: 고지 한 문장은 25자 안팎, 빈 상태와 안내는 2문장 이내로 쓴다. 더 필요하면 접기("가격은 어떻게 모았나요") 1개로 처리한다.
3. **횟수**: 같은 문구는 화면당 1번만 쓴다. 목록 타일마다 "수집가"를 붙이지 않고, 가격 형식과 목록 위 한 줄("가격은 모두 수집가 · 10/18 기준")로 대신한다.
4. **형식**: 상단 고지 배너, 고지 팝업, 회색 안내 상자 여러 개는 쓰지 않는다. 결정에 꼭 필요한 고지만 본문 글자로 쓴다.
5. **단어**: "현재가", "최저가", "AI 추천", "실시간"은 쓰지 않는다. "수집가 · 날짜", "규칙으로 골랐어요"처럼 실제 동작을 그대로 설명한다.
6. **모름**: 수집하지 못한 정보는 "정보 없음 · 판매처에서 확인"으로 쓴다. 추정값이나 빈칸으로 두지 않는다.
7. **외부 링크**: 목적지 이름과 ↗를 붙인다. 중고 검색에는 "연동 아님(외부 검색)"을 버튼 아래 한 줄로 쓴다.
8. **제휴 관계**(생길 경우): 판매처 버튼 근처에 한 줄로 쓴다. 국내 기준(공정위 추천·보증 심사지침)은 원문을 확인하지 못했으므로 출시 전에 법무 확인이 필요하다.
9. **점검**: 화면마다 고지·안내 문장을 세어 3개를 넘으면 줄인다. 줄일 때는 접기, 위치 이동, 칩으로 해석 보여 주기 순서로 시도한다.

---

## 11. 확인 못 한 것 (근거로 쓰지 않음)

- lululemon의 "활동 먼저 탐색" 특징: BASIC/DEPT 케이스 스터디 URL이 404이고, 대체 출처도 없다. 수상(People's Voice 2개)만 확인했다.
- DVF 사이트 디자인 특징(사진 3:4, 서체 1종, 관습적인 커머스 흐름): 수상 페이지에 설명이 없고 제작사 자료도 없다. 사이트를 직접 관찰하는 것도 이번 환경에서는 차단됐다.
- Polène의 "사진 비율 일관, 서체 2종": 이전 관찰 결과로, 이번에 다시 확인하지 못했다.
- 공정위 "추천·보증 등에 관한 표시·광고 심사지침" 원문: law.go.kr에서 본문을 불러오지 못했다. 언론 보도만 확인했다.
- GOV.UK의 "검색 결과 없음" 지침: Design System에서 해당 패턴을 찾지 못했고, Service Manual 검색 페이지는 404다.
- Wirecutter 등 간결한 제휴 고지 사례: 사이트가 403으로 차단했다.
- 무신사, W컨셉, 지그재그, KREAM 앱의 UI 수상: 찾지 못했다.
- Webby 2024~2026 패션·쇼핑 부문 전체 수상 목록: 부문 목록 페이지가 렌더링되지 않았다. 개별 수상 페이지와 보도자료로 확인된 것만 썼다.
- Telfar의 "radical accessibility": 브랜드의 가격 철학을 뜻하며, 웹 접근성 근거가 아니다.

## 12. 이전 문서에서 바로잡을 점

- Patagonia 2022 "Best Mobile UX"는 People's Voice(일반 투표) 수상이다. 심사위원 수상은 2021 Fashion, Style & Beauty다.
- 29CM의 iF 2017 수상은 UI가 아니라 브랜딩(Corporate Identity) 부문이다.
- Polène은 "E-commerce Honors"가 아니라 Awwwards Honorable Mention(2024-11-01)이다.
- R.Lux는 출시 제품이 아니라 Red Dot Design Concept 부문 수상이다.
