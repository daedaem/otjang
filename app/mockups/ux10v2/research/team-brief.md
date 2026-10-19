# 10팀 시안 2판 공통 지시서

경로 약속
- 저장소 작업 폴더: `/tmp/claude-0/-home-user-otjang/7071968e-c04f-5d63-9971-e08e4568088f/scratchpad/pr1` (아래 `PR1`)
- 2판 폴더: `PR1/app/mockups/ux10v2/` — README.md를 먼저 끝까지 읽는다(규칙·API·흐름 표시).
- 1판 시안(출발점, 고치지 말 것): `PR1/app/mockups/ux10/teams/NN-*.html`
- 동작 예시: `PR1/app/mockups/ux10v2/tools/starter.html` (흐름 검사 문제 0개. 주소 이동·사진 크게 보기·옷 넣고 복귀·비교함·보류·뒤로가기 구현을 참고. 디자인은 따라 하지 말 것)
- 조사 자료(생기는 대로 읽기): `/tmp/claude-0/-home-user-otjang/7071968e-c04f-5d63-9971-e08e4568088f/scratchpad/ux10v2/research/references.md`, `.../ux10v2/bench/same-task.md`

## 목표와 표현
- 목표·품질 기준은 **세계 최고 수준의 UX/UI**다. 목표일 뿐 달성 주장은 금지.
- 너는 AI가 맡은 디자인·프론트 팀 역할이다. 실제 수상 디자이너·빅테크 디자이너가 참여했다고 쓰지 않는다. 참고 근거(실제 수상작·공식 디자인 자료·실서비스)와 너의 판단을 구분해 적는다.
- 대표 피드백: 1판은 그림과 안내문 때문에 실제 서비스처럼 보이지 않았다. 1판 01은 상품 사진 칸이 PC 88px·모바일 76px이라 그림만 사진으로 바꾸면 여전히 '판정 문서'처럼 보인다. **상품을 충분히 볼 수 있는 사진, 상세 확대, 이름·가격·이유의 위계를 다시 설계하고, 검토자용 설명은 앱 체험 밖으로 옮기는 것이 P0다.**

## 확인된 근거 (화면 품질로 옮길 것. 화면 안에 출처를 쓰지 말 것)
- Webby 2023 공식 발표: Patagonia — Best Practices, Features & Design / Google Store — Best Mobile User Experience. (수상 이력과 현재 페이지의 개별 기능을 혼동하지 말 것) https://www.webbyawards.com/press/press-releases/27th-annual-webby-award-winners-announced/
- 기존 확인(docs/design-system-20261015.md, 2026-10-19 조사로 정정): Patagonia Webby 2021 Fashion, Style & Beauty(Webby Winner + People's Voice)·2022 Best Mobile UX(**People's Voice, 일반 투표**), DVF Webby 2025 Shopping & Retail(People's Voice), Gucci Ancora Webby 2024 Best Mobile UI, Polène **Awwwards Honorable Mention(2024-11-01)**, 29CM Red Dot 2014(모바일 앱)·**iF 2017(브랜딩 부문)**, Coupang R.Lux **Red Dot Design Concept 2025(출시 제품 아닌 콘셉트)**, s.Oliver 앱 Red Dot 2018. 새로 확인: iF 2011 HUGO BOSS 앱(내 옷과 색 맞추기), iF 2017 Viktor&Rolf(잡지형 쇼핑몰), Apple Design Award(2025 Taobao·2024 Crouton — 부문·지위는 research/refs.json 확인 후 인용). DVF·Polène의 사진 비율·서체 관찰은 다시 확인하지 못했으니 근거로 쓰지 않는다. 조사 전체: research/references.md
- Patagonia Worn Wear(Codex가 PC Chrome으로 직접 조작): 같은 상품에서 Shop New/Shop Used, 사이즈, 상태 등급, 사진이 있는 Condition Guide가 이어진다 → 우리는 같은 상품 상세 안에서 새 상품/중고를 나란히, 상태·옵션·비용 차이를 먼저. 단 우리는 중고 매물 자료가 없으므로 중고 가격·상태·매물 사진을 **지어내지 않고** "매물마다 달라요 · 어울은 확인 안 함"으로 쓴다. 대표 사진(판매처)과 매물 사진을 구분한다(`EoulMock.newVsUsed(id)`).
- 29CM 상세(Codex 직접 확인): 큰 상품 사진, 브랜드·품명·가격 위계는 참고. 큰 기획 배너·복잡한 혜택은 복제하지 않는다.
- Apple HIG Searching: 중요한 검색은 주 위치에 한 곳, 현재 검색 범위 표시, 검색 제안. https://developer.apple.com/design/human-interface-guidelines/searching
- 토스 "2초만에 불필요한 클릭 없애는 4가지 방법": 단순 선택의 불필요한 확인·반복 입력을 줄인다 → 등록 없이 시작, 비교 맥락으로 복귀. **구매·삭제는 자동 확정 금지.** https://toss.tech/article/4-ways-for-minimum-input
- Baymard 의류 5가지·0건 페이지: 실제 착용 사진·사이즈 같은 판단 자료가 중요(우리 자료엔 착용 사진·사이즈가 없다 → "사이즈·실착은 판매처에서 확인"으로 정직하게), 0건은 막다른 길 대신 다음 선택. **자동 대체는 하지 않고 사용자가 고르게.** https://baymard.com/research-articles/apparel-5-best-practices · https://baymard.com/research-articles/no-results-page
- 공식 디자인 시스템(필요하면 인용): Apple HIG(sheets, tab bars, accessibility 44pt), Material 3(bottom sheets, navigation bar, list-detail), GOV.UK Design System(question pages, one thing per page, error message), WCAG 2.2(2.5.8 target size, 1.4.3 contrast).

## 실제 웹앱처럼 (밀도·배치·탐색)
- 실서비스의 뼈대를 쓴다: 위 머리글(로고·검색·비교·옷장·기록), 휴대폰은 아래 탭바 또는 시안 개념에 맞는 고정 바, PC는 위 내비 + 넓은 그리드/여러 칸.
- 결과: 휴대폰 2열(시안 개념상 1열이면 사진이 화면 폭 85% 이상인 큰 카드), PC 4~5열 또는 목록+상세 두 칸. 사진 비율 하나. 카드에는 사진 → 브랜드 → 품명(2줄) → 가격(+`priceShort`) → 옷장 표시(있을 때만) 순.
- 상세(`#/p/<id>`): 큰 사진(화면 폭 85% 이상, PC는 왼쪽 반) → 브랜드·품명·가격·수집가 → 이유 한 줄 → 내 옷과 비교(판정·옷 넣기) → 결정(사기로 함·보류·안 살래) → 새 상품/중고 → 같은 조건 다른 선택(사진 카드) → 코디(사진).
- 안내문은 줄인다: "사람이 쓴 글 아님", "AI 역할", "판정 쪽" 같은 검토자용 문구, 팀 설명 패널, 긴 고지 문단을 화면에서 뺀다. 고지는 시안 표시(`data-flow="mock-label"`, 16자 이하, 예: "시안 03") → `EoulMock.openDisclosure()` 한 곳. 화면 안에는 `EoulMock.note.short`의 짧은 말만 필요한 곳에 한 번.
- 사진은 모두 `EoulMock.photoHtml(...)`. 그림(SVG 옷 그림) 금지. 아이콘(24px 안팎)은 괜찮다.

## 반드시 지킬 정직성
수집가(현재가·최저가·할인·특가 금지), 규칙 기반 해석(대화형 AI라고 하지 않음), 체험용 옷·비슷한 상품 사진 표시, 기록은 직접 남긴 것, 조건을 몰래 넓히지 않음(0건이면 이유 + 사용자가 고르는 다음 행동), 중고는 외부 검색 링크만(가짜 매물·가격·상태 금지), 비교함 자동 담기 금지, 구매·삭제 자동 확정 금지, 판매처 링크 문구는 "무신사에서 보기".

## 완료 기준 (모두 확인하고 끝낼 것)
1. `PR1/app/mockups/ux10v2/teams/NN-<이름>.html` 한 파일(+ `../shared/eoul-mock.js`). 외부 글꼴·스크립트 금지(사진 서버만).
2. 흐름 검사 문제 0개: `cd PR1/app/mockups/ux10v2 && node tools/flowcheck.mjs teams/NN-<이름>.html --out /tmp/claude-0/-home-user-otjang/7071968e-c04f-5d63-9971-e08e4568088f/scratchpad/ux10v2/flow/NN`
   그리고 `--offline`으로 돌려 깨진 사진·오류 0개(사진 대신 색 카드).
3. 360×667에서 가로 넘침 0, 결정 버튼이 상세에서 쉽게 닿음(고정 바 또는 첫 화면 근처).
4. 흐름 검사 화면(`.../flow/NN/*.png`)을 직접 열어 보고, 실서비스 수준으로 보이는지 스스로 비판한 뒤 고친다(사진 크기, 정렬, 여백, 글자 위계, 빈 칸, 겹침).
5. 팀 카드 `/tmp/claude-0/-home-user-otjang/7071968e-c04f-5d63-9971-e08e4568088f/scratchpad/ux10v2/cards/NN.json`:
   `{ "n": NN, "file": "NN-....html", "name": "...", "roles": "...(AI 역할)", "tagline": "한 문장", "refs": [{ "name": "...", "kind": "award|design-system|research|service", "url": "...", "evidence": "무엇이 확인됐나(수상 부문 정확히)", "applied": "우리 화면에 무엇을 어떻게 적용했나" }], "judgments": ["구체적 UX 판단 3~5개(근거 이름과 함께)"], "risks": ["2~3개"], "port": "현재 앱에 옮길 조각과 난이도" }`
   refs는 위 '확인된 근거'나 조사 자료에서 확인된 것만. 확인 못 한 수상은 쓰지 않는다.
6. 끝나면 짧게 보고: 파일, 흐름 검사 요약 줄, 남은 위험.
