# 인수 메모 — ux10v2 (실제 사진 웹앱 시안 10개)

Claude 사용량 소진 대비 저장(2026-10-19). Codex는 이 상태에서 이어간다. 새 설계부터 다시 시작하지 않는다.
목표·품질 기준: 세계 최고 수준의 UX/UI(목표, 달성 검증 아님). AI 역할 시안이며 실제 수상 디자이너 참여 없음.
브랜치: `claude/fashn-vton-m1-test-3ox240`. 기존 앱(`app/src`)·1판(`app/mockups/ux10`)·개인 자료는 바꾸지 않음.

## 완성 (검증됨)
| 파일 | 내용 | 검증 |
|---|---|---|
| `src/core.mjs` → `shared/eoul-mock.js` | 공통 코어 2판: 사진(`photoHtml`), 비슷한 상품 사진, 색 카드 대체, `route`(해시 주소·뒤로가기 위치 복원), `searchSuggestions`, 비교함(`compareAdd/Rows`), `newVsUsed`, `relax`(빈 결과 대안, 자동 적용 안 함), `openDisclosure`, `?preview=1` | Node 스모크, starter 흐름 검사 |
| `tools/flowcheck.mjs` | 같은 과업 검사: 빈 옷장 검색 → 상세(#/p/id) → 사진 크게 보기 → 옷 추가 후 같은 상품 복귀 → 후보 둘 비교 → 보류 → 뒤로가기(위치 복원), 조건 위반·수집가 표기·중고 정직·안내문 줄 수·사진 크기·접근성. `--offline`은 사진 서버 차단 | starter로 문제 0개(온라인) 확인 |
| `tools/starter.html` | 동작 예시(시안 아님, 디자인 기준 아님) | 흐름 검사 문제 0개 |
| `tools/build-core.mjs` | 묶기: `node app/mockups/ux10v2/tools/build-core.mjs` | 608 KB, 사진 주소 891 |
| `README.md` | 규칙 12개(P0), API, 흐름 표시 표, 사진 범위·권리 | — |
| `research/references.md`, `refs.json`(101개, 확인 94), `teams.json` | 근거 조사·팀별 근거·정정 사항 | 각 URL 직접 확인(확인 못 한 7개는 표시) |
| `research/team-brief.md` | 10팀 공통 지시서(완료 기준 포함) | — |

## 미완성
| 파일 | 상태 | 다음 할 일 |
|---|---|---|
| `teams/03-compare.html`, `teams/08-rail.html`, `teams/09-editorial.html` | 팀 작업 도중 중단(사용량). 끝까지 쓰인 파일이지만 자체 검사·수정 전 | 흐름 검사 결과(아래) 문제 고치기 → `--offline` → 360px → 팀 카드 |
| `teams/01, 02, 04, 05, 06, 07, 10` | 파일 없음(시작 전 중단) | `research/team-brief.md` + 각 팀 방향(아래)으로 제작 |
| `index.html` + `tools/make-gallery-data.mjs` | 갤러리 틀(실시간 미리보기 iframe, 스크린샷 저장 안 함). `data/teams.json`·`data/bench.json`·`data/refs.json`·`data/notes.json` 아직 없음 → `gallery-data.js` 미생성 | 팀 카드 모아 `data/` 작성 → `node tools/make-gallery-data.mjs --flow <흐름 결과 폴더>` |
| `wip/bench-reference-sites.mjs` | 무신사·29CM·Zalando·SSENSE 같은 과업 측정 스크립트(중간 저장, 결과 없음). 헤드리스 Chromium + iPhone UA로 네 곳 접속 가능, curl은 403 | 측정 → `data/bench.json`(숫자만). 타사 스크린샷은 커밋하지 않음 |
| 비교 검토·수정, 추천 순위, `docs/` 보고서 | 시작 전 | 10개 완성 후 같은 과업 숫자로 참고 서비스와 비교 → 수정 |

## 팀별 방향 (조사 반영 확정분)
- 01 답 먼저: 답 카드 ≤ 화면 40%, 사진은 2열 카드 이상(≈170px, 4:5), 아래 후보 2개 이상 첫 화면. 큰 사진은 상세에서. 0건이면 답 카드 자리에 `relax()` 대안.
- 02 세 번 탭: 한 화면 한 질문(GOV.UK), 실제 사진 타일 4~6개 + 상관없음, 고르면 바로 다음, 뒤로 가면 선택 유지, 답은 결과 칩으로.
- 03 비교함: ‘내 옷과’ 첫 줄, 주요 5줄, 휴대폰 2개·PC 4개, 72px 이하 비교 바, 자동 담기 금지.
- 04 한 장씩: 카드 1장 + 같은 크기 결정 버튼 3개, 스와이프는 보조, 5초 되돌리기, 목록 보기 전환.
- 05 코디 먼저: 합성 금지, 실제 사진 4:5 타일 2×2, ‘규칙으로 조합한 예시’, 대체/보완 줄 분리.
- 06 한 화면: 상세는 페이지(#/p/id), 시트는 한 번에 1장·3단 높이·버튼으로 높이 변경, PC 목록|상세|보조 창.
- 07 장부: 기록 장부만 촘촘한 48~64px 행, 후보 고르는 화면·상세는 사진 크게.
- 08 옷장 레일: 레일 ≤ 88px, 스크롤 시 접힘, 빈 옷장은 한 칸 안내, 겹침은 테두리+아이콘+글자.
- 09 읽는 결과: 2~3개마다 소제목, 상품당 2줄, 가격·판매처 숨기지 않음, 사실과 규칙 판단 글자 구분.
- 10 엄지 하나: ‘아래가 무조건 쉽다’ 근거 없음(NN/g) → 자주 누르는 타일은 가운데, 아래 바는 검색+주 행동 1개, 탭바와 동시 표시 금지, 48px·간격 8px, WCAG 2.4.11·2.5.7.

## 근거 표기 주의(정정)
Patagonia 2022 모바일 UX는 People's Voice(일반 투표). 29CM iF 2017은 브랜딩 부문. Polène은 Awwwards Honorable Mention(2024-11-01). R.Lux는 Red Dot Design Concept. Webby 2023 Patagonia(Best Practices, Features & Design)·Google Store(Best Mobile User Experience)는 공식 발표문으로 확인. Taobao ADA 2025는 Apple Vision Pro 앱.

## 사진·권리
상품 891개 사진은 무신사 이미지 서버 주소를 브라우저가 불러옴(저장소에 이미지 파일 없음). 권리 미확인. 개인 시험 링크·`?photos=`·noindex는 접근 통제가 아니다. 공개 배포 전 권리 확보 필요.

## 실행
- 열기: `app/mockups/ux10v2/tools/starter.html?reset=1` (file:// 가능). 옵션 `?q=`, `?closet=trial`, `?photos=0`, `?preview=1`.
- 검사: `cd app/mockups/ux10v2 && node tools/flowcheck.mjs teams/<파일>.html --out <폴더>` (Playwright·Chromium, 사진 서버 접속 필요. `--offline`은 사진 없이).
