# 실제 앱 화면 레퍼런스 (무료 수집, 2026-10-21)

대표 질문: "Mobbin에 꼭 돈을 써야 하나, 무료 사이트도 많을 텐데." → Mobbin MCP는 유료 플랜이 필요해서(연결은 됨, 검색 시 "requires a paid plan") 결제 없이 **앱스토어 공개 스크린샷**으로 대신했다.

## 방법 (누구나 다시 할 수 있음, 비용 0)
- Apple iTunes Search API(공개, 키 없음): `https://itunes.apple.com/search?term=<앱 이름>&country=kr&entity=software&limit=1` → `screenshotUrls`.
- 21개 앱, 약 150장. 이미지는 저장소에 넣지 않는다(각 회사 저작물). 내부 참고용으로만 보고, 아래에는 앱스토어 주소만 둔다.
- 한계: 앱스토어 스크린샷은 홍보용으로 다듬은 화면이라 실제 앱과 조금 다를 수 있다. 흐름(여러 화면 이어짐)은 볼 수 없다.

## 본 앱
- 한국 쇼핑: [무신사](https://apps.apple.com/kr/app/id1003139529), [29CM](https://apps.apple.com/kr/app/29cm/id789634744), [지그재그](https://apps.apple.com/kr/app/id976131101), [에이블리](https://apps.apple.com/kr/app/id1084960428), [W컨셉](https://apps.apple.com/kr/app/id968266068), [KREAM](https://apps.apple.com/kr/app/id1490580239)
- 중고·생활: [번개장터](https://apps.apple.com/kr/app/id395672275), [당근](https://apps.apple.com/kr/app/id1018769995), [오늘의집](https://apps.apple.com/kr/app/id1008236892), [토스](https://apps.apple.com/kr/app/id839333328)
- 옷장·코디: [에이클로젯](https://apps.apple.com/kr/app/id1542311809), [Whering](https://apps.apple.com/us/app/id1519461680), [Indyx](https://apps.apple.com/us/app/id1599179405), [Stylebook](https://apps.apple.com/us/app/stylebook/id335709058), [Smart Closet](https://apps.apple.com/us/app/id1263105601)
- 날씨 코디: [Weather Fit](https://apps.apple.com/us/app/id1194408342)
- 해외 쇼핑: [SSENSE](https://apps.apple.com/us/app/id1418754101), [ZARA](https://apps.apple.com/us/app/zara/id547951480), [Lyst](https://apps.apple.com/us/app/id597940518), [Pinterest](https://apps.apple.com/us/app/pinterest/id429047995)

## 공통점 (본 것만 적음)
1. **바탕은 흰색, 강조색은 거의 없다.** 무신사·29CM·지그재그·에이클로젯 모두 흰 바탕 + 검정 글자. 색은 할인율(빨강)·좋아요(하트) 정도. d12는 따뜻한 베이지 바탕 + 주황 강조라 "쇼핑앱"보다 "소개 페이지"처럼 보인다.
2. **상품은 촘촘한 격자.** 2~3열, 사진 사이 간격이 좁고(거의 붙음), 사진 위에 하트, 아래 작은 브랜드 → 품명 2줄 → 굵은 가격. 랭킹은 사진 왼쪽 위 숫자. d12는 카드 간격·여백이 커서 한 화면에 상품이 적다.
3. **맨 위 가로 탭.** 추천·랭킹·세일·브랜드 같은 탭을 상단에 두고 옆으로 넘긴다. 하단 탭은 아이콘 5개.
4. **옷장 앱은 누끼 사진 + 옅은 회색 칸.** 에이클로젯·Whering·Indyx 모두 배경을 지운 옷 사진을 같은 크기 칸에 놓고, 위에 종류 탭(전체·상의·바지·아우터·신발).
5. **코디는 '플랫레이'(옷을 겹쳐 놓은 한 장).** 에이클로젯·Whering은 코디를 옷 사진 4장을 줄 세우지 않고, 겉옷·상의·하의·신발·가방을 한 판 위에 겹쳐 배치한다. d12는 4칸 가로줄.
6. **날씨는 코디 위의 작은 한 줄.** 에이클로젯: "☀ 16°C / 22°C · 뉴욕" 한 줄 + 바로 아래 코디 한 장. Weather Fit만 날씨가 주인공(캐릭터·위젯·아침/저녁 알림 "Today's fit: … 반팔에 모자").
7. **옷장 숫자는 '통계' 화면에 모은다.** Whering·Indyx: 옷장 가치, 가장 많이 입은 옷, 입은 횟수당 가격. 에이클로젯: 데일리룩 수·가장 많이 입은 옷·지출.

## d12에 바로 쓸 것 (제안, 대표 확인 전)
| 우선 | 바꿀 것 | 근거 |
|---|---|---|
| 1 | 흰 바탕·검정 글자, 강조색은 버튼 하나와 순위 숫자에만 | 공통점 1 |
| 2 | 결과·옷장 격자를 촘촘하게(2열 간격 2~4px, 하트는 사진 위, 브랜드→품명→가격) | 공통점 2 |
| 3 | 날씨 코디를 '한 줄 날씨 + 플랫레이 한 장'으로(지금은 큰 카드 + 4칸) | 공통점 5·6 |
| 4 | 옷장 맨 위 종류 탭 + 누끼 3열 | 공통점 4 |
| 5 | 나중: 아침 알림 "오늘 코디"(설치 앱 알림 권한 필요) | Weather Fit |
