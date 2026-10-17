# 어울 디자인 시스템 1차 — 2026-10-15

수상 경력이 확인된 패션 웹사이트·앱을 조사하고, 거기서 공통으로 나타나는 규칙을 어울의 화면 체계에 적용했다. 이 문서는 무엇을 근거로 무엇을 바꿨고 무엇을 남겼는지 기록한다.

## 근거로 삼은 수상작

수상 사실은 각 시상 기관의 페이지에서 확인했다. 아래에서 [확인]은 수상 페이지나 케이스 스터디에 적힌 내용, [관찰]은 사이트에서 직접 본 것, [추론]은 해석이다.

| 사례 | 수상 | 어울과 관련된 특징 |
|---|---|---|
| Patagonia | Webby 2021 Fashion, Style & Beauty 수상작·People's Voice, 2022 Best Mobile UX People's Voice | 맥락에 따라 바뀌는 떠 있는 주 행동 버튼, 페이지를 바꾸지 않는 상품 비교 오버레이, 모바일 우선의 작은 컴포넌트 시스템 [확인] |
| lululemon | Webby 2026 People's Voice 2개 부문 | 카테고리보다 활동을 먼저 탐색 [확인] |
| DVF | Webby 2025 Shopping & Retail People's Voice | 커머스 흐름은 관습대로 두고 개성은 사진으로 표현 [확인], 상품 사진 3:4 통일·서체 1종 [관찰] |
| Gucci Ancora 2024 | Webby 2024 Best Mobile UI | 풀스크린 이미지, 강조색 하나 [확인] |
| Polène | Awwwards E-commerce Honors 2024 | 흑백 팔레트, Clean·Minimal [확인], 사진 비율 일관·서체 2종 [관찰] |
| 29CM | Red Dot 2014(모바일 앱), iF 2017 | 색과 선을 최소화해 콘텐츠에 집중 [확인] |
| Coupang R.Lux | Red Dot Design Concept 2025 (UI·UX) | 흑백 인터페이스, 마이크로 애니메이션, 개인화 추천 [확인] |
| s.Oliver 앱 | Red Dot 2018 | 사이즈·취향에 맞춰 바뀌는 홈 [확인] |
| Alle | Google Play Best of 2024(인도) Best App | 상황·체형에 맞춘 조언, 구매 전 가상 착용 [확인] |

확인하지 못한 것도 있다. Webby 앱 부문의 패션 앱 수상, 옷장 앱(Whering·Acloset·Indyx·Stylebook·Cladwell)의 디자인 수상, 무신사·W컨셉·지그재그·KREAM의 앱 UI 수상은 찾지 못했다. 그래서 근거로 쓰지 않았다.

## 공통 규칙과 어울의 현재 상태

| 규칙 | 근거 | 어울 |
|---|---|---|
| 사진 비율은 하나 | DVF 3:4, Polène 약 5:7 | **4:5 하나**(`--photo-ratio`)로 통일했다. 판매처 사진이 정사각형(500×500)이고 옷을 자르지 않고 통째로 보여 주므로(contain) 3:4보다 4:5가 사진을 크게 쓴다. "세로 비율 하나"라는 원칙은 같다 |
| 글자는 사진 밖에 | 29CM, Patagonia [추론] | 옷장 타일의 "색 확인" 표시를 사진 위에서 이름 아래로 옮겼다. "비슷한 상품 사진" 안내는 이미 사진 아래에 있다 |
| 무채색에 강조색 하나 | Polène, R.Lux, Gucci | 이미 그렇다(초록 강조색 하나). 하트의 빨강은 "찜"을 뜻하는 의미 색으로만 쓴다 |
| 서체 1–2종, 크기와 굵기 절제 | Polène, DVF | 서체는 시스템 서체 1종이다. 글자 크기 24종을 토큰 11개로 줄였고(읽는 글자는 8단계), 굵기는 8종에서 3종으로 줄였다 |
| 화면마다 주 행동 하나, 하단 고정 | Patagonia | 상품 상세의 주 버튼을 "내 옷과 비교하기"로 바꿨다(이전 커밋). 구매 판단에는 결정 버튼이 고정돼 있다 |
| 비교는 오버레이로 | Patagonia, Alle | 이미 바텀시트로 연다 |
| 추천 이유를 사용자 데이터로 | s.Oliver, STYLISM, Alle | 이미 "내 옷 n벌과 ○○ 코디"로 보여 준다 |
| 모션은 작게 | R.Lux, Gucci | 자동 배너·커서 효과 없음. 유지한다 |
| 토큰 기반 작은 컴포넌트 | Patagonia | 이번 작업의 핵심이다(아래) |

## 토큰

`app/styles.css`의 `:root`에 있다.

- **글자 크기**: micro 11(사진 캡션·숫자 배지 전용), caption 12, label 13, body-s 14, body 15, input 16(입력칸 전용. iOS는 16px보다 작은 입력칸을 확대한다), title-s 17, title 20, headline 24, display 32, hero 40(첫 화면 큰 제목 전용).
  - 어울 글자 로고만 27·30px을 그대로 둔다.
- **굵기**: regular 400, medium 600, bold 700. 어울 글자 로고만 800.
- **모서리**: xs 4(칩·태그), sm 8(카드·버튼), md 12(입력칸·패널), full(알약 모양), round(원).
- **쌓임 순서**: raised 1 < sticky 4 < nav 30 < scrim 40 < sheet 41 < onboard 50 < toast 60 < skip 100.
- **간격**: 4px 단위 8단계(`--space-1`~`--space-10`). 이번에는 새로 쓰는 곳(유틸리티 클래스, 새 규칙)에만 썼다. 기존 여백 값 27종은 그대로 두었다(아래 "남긴 것").
- **사진 비율**: `--photo-ratio: 4 / 5`.

함께 고친 것
- 제목은 `text-wrap: balance`로 줄을 고르게 나눈다. 예: "예시 옷장으로 보는 다음 한 / 벌" → "예시 옷장으로 / 보는 다음 한 벌".
- 시트 안의 안내 상자가 오른쪽만 짧던 것을 다른 패널과 같은 너비로 맞췄다.
- `main.js`의 고정 인라인 여백 10곳을 유틸리티 클래스로 바꿨다. 색 견본, 자르기 위치처럼 값이 계산되는 인라인 스타일은 그대로 둔다.

## 검증

- 앱 테스트 525개, 서버 테스트 35개 통과(1개 생략).
- 같은 걸음(17개 화면 × 밝은·어두운 모드)으로 바꾸기 전후 스크린샷을 비교했다.
  - 바뀐 화소 비율: 구매 판단 약 17%(제목이 한 줄로 줄어 아래 내용이 위로 올라옴), 판매처 가격 비교 약 9~14%(안내 상자 너비), 나머지 0~7%.
  - 깨진 배치, 가로 넘침, 페이지 오류는 없다.
- axe 위반은 이전과 같다. 색 고르기 마지막 줄이 첫 위치에서 고정 저장 버튼에 가려지는 것인데, 끝까지 내리면 보인다.

## 남긴 것

- **간격 값 정리**: 27종이 있고, 4px 단위로 바꾸면 거의 모든 화면이 조금씩 움직인다. 화면별로 확인하며 따로 진행한다.
- **글자 크기 단계를 더 줄이기**: 수상작은 크기를 5단계 안팎으로 쓴다[추론]. 지금은 읽는 글자가 8단계다. 13·14와 17·20을 합치는 것은 실제 휴대폰에서 읽어 보고 정한다.
- **컴포넌트 문서화**: 버튼·칩·카드·안내 상자·시트를 한곳에 모은 견본 페이지.
- **설치형 앱(아이콘·favicon 포함), 옷장 분석 화면 줄이기, 찜과 구매 여정 합치기.**

## 출처

- Webby: winners.webbyawards.com — [Patagonia 2021](https://winners.webbyawards.com/2021/websites-and-mobile-sites/general-desktop-mobile-sites/fashion-style-beauty/179247/patagonia), [Patagonia 2022](https://winners.webbyawards.com/2022/websites-and-mobile-sites/mobile-features-design/best-mobile-user-experience-mobile-features/206202/patagonia), [lululemon 2026](https://winners.webbyawards.com/2026/websites-mobile-sites/general-desktop-mobile-sites/fashion-style-beauty/378592/lululemon), [DVF 2025](https://winners.webbyawards.com/2025/websites-and-mobile-sites/general-desktop-mobile-sites/shopping-retail/339499/seamless-chic-the-user-friendly-dvf-shopping-journey), [Gucci Ancora 2024](https://winners.webbyawards.com/2024/websites-and-mobile-sites/mobile-features-design/best-mobile-user-interface-mobile-features/290028/gucci-ancora-fashion-show-2024)
- 케이스 스터디: [Patagonia(BASIC/DEPT®)](https://basicagency.com/case-studies/patagonia-ecommerce-website), [Gucci Ancora](https://basicagency.com/case-studies/gucci-ancora)
- Awwwards: [Polène](https://www.awwwards.com/sites/polene), [E-commerce 수상 목록](https://www.awwwards.com/websites/winner_category_ecommerce/)
- Red Dot: [29CM](https://www.red-dot.org/project/29cm-21426), [R.Lux](https://www.red-dot.org/project/rlux-the-branded-commerce-for-luxury-shopping-83186), [s.Oliver](https://www.red-dot.org/project/soliver-fashion-app-25907)
- iF: [29CM](https://ifdesign.com/en/winner-ranking/project/29cm/205334), [STYLISM](https://ifdesign.com/en/winner-ranking/project/stylism/313798)
- Google Play: [Best of 2024 India](https://blog.google/intl/en-in/products/platforms/google-plays-best-apps-games-of-2024-in-india/)
