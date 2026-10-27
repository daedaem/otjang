# 홈 질문·예시 본문 React 전환

기준 master는 #88을 병합한 `bc921ef7ea11687dcf4b49ddcc81b6f5d87261ad`다. #88 최종241fabe의 Node356개·CI11개·실제274개 두 실행(10.8분/10.5분)·미해결 검토0을 확인했다. 이번 단계는 홈 질문·예시·보유/선택 후보 preview 본문이며 전체 날씨/공통 UI 이전 완료가 아니다.

## 왜 바꿨는가

기존 홈은 날씨 응답/날짜 변경의 `K.refresh`가 입력 DOM을 다시 만들어 쓰던 질문을 지웠다. 보유 옷의 예시 상품을 그릴 때 `M.ask`도 호출해, 보기만 했는데 개인 최근 검색에 예시가 저장됐다. 실패 우선0281611의 기본6개 중4개가 이 두 문제로 실패했다. 옷장 없이 실제 검색을 시작하는2개는 이미 통과했다. 초기 첫 검사에서 ‘찾기’가 form/nav 두 버튼에 해당했던 선택자 문제는 form으로 한정해 기능 실패와 구분했다.

`src/home`는 header·질문·예시·보유/선택 후보를 실제 React 요소로 렌더링한다. 질문은 React 상태와 기존 라우터 params의 메모리만 사용한다. 날씨/코어 갱신 때 부모를 remount하지 않고, 결과에서 Back할 때도 질문을 돌려준다. 새 localStorage 키는 만들지 않는다. 바닐라 복귀 경로도 라우터 params와 passive refresh의 초점/선택 범위를 유지한다. 첫 홈에서 키보드를 강제로 열기 위한 autofocus는 추가하지 않았다.

공통 `homeProofModel`을 React와 바닐라가 함께 읽는다. 예시는 기존 `M.readSearch`로 만들어 최근 검색을 쓰지 않되 같은 판단 문맥을 유지한다. 실제 제출/예시 선택은 기존 결과 경로로 보내며 그때만 검색을 기록한다. 후보 ID·겹침/새 조합 사실·보유/체험용 수·예시 조건과 기존 비교/옷장/코디 진입을 유지한다. AI 응답을 새로 만들거나 엔진 후보를 AI 최종 순위로 표시하지 않는다.

## 남은 경계

`WeatherBridge`는 여전히 기존 `weatherHtml/wireWeather`를 사용한다. 코디의 `WeatherSlot`과 지역 선택 sheet까지 공유 React로 실제 이전해야 날씨 묶음이 완료다. 공급처 `RetailBridge`, renderStrip 후보 띠, 고정 bar/tabs, 메뉴·고지·색/확인/지역·토스트·복구/원문 받기 같은 공유 UI도 추적 표에 남긴다. 새 본문을 옮겼다는 이유로 fallback HTML을 지우거나 다시 구현하지 않는다.

상품 사진은 기존 `ProductPhoto`를 작은 공통 부품으로 추출했다. 동작을 바꾸지 않고 스타일 범위를 해당 부품으로 한정한다. 원본 원격 표시/사진 없음만 사용하며 개인 사진을 외부로 보내거나 판매처 사진을 가공하지 않는다. 코어·저장/BK·입력·사진/등록/구매 명령·인증/비용 한도는 그대로다.

## 실행 증거

- Node356개/fail0/skip0·빌드 통과. 기본 홈6개는 질문/초점·기록 보존과 Back을 포함해11.1초에 통과했다.
- 공유 사진 부품의 등록 검색과 홈을 합친 첫46개는44통과/비교 fixture2실패였다. ‘옥스퍼드’가 실제 한 상품만 반환했기 때문이라 실제 두 상품이 있는 조건으로 바꾸고 해당2개를6초에 통과시켰다. 두 후보/실제 비교 연결 assert는 유지했다.
- 홈의 바닐라/로더 실패, 보유/선택 ID, 본문 글자 두 배/키보드, 실제 origin 중단 뒤 React/로컬 보유 preview, 관련 등록 검색을 확인한다. 날씨 구형 bridge의 글자 확대를 native 본문 확대 검사로 대신하지 않는다. 전체 구성은290개이며 마지막 전수/CI 결과는 별도로 남긴다.
- [캡처/행동 원장](evidence/home/manifest.json)과 actions.json은 빈 옷장/합성3벌, 모바일390×844/PC1440×1000에 같은 질문 입력→합성 날씨 응답을 적용한다. 예전 화면은 질문이 사라지고 보유 상태에서는 main 원문도 바뀌지만 새 화면은 질문/원문을 유지한다. 캡처에서만 양쪽에 같은 reduced-motion/animation 비활성 규칙을 적용한다. 실제 API/위치·개인 자료·유료 호출·새 배포는 사용하지 않았다.

실제 기기/설치 PWA·persistence·Files/공유·옛 format1/교차 기기 복원과 C1/C2·블라인드20·C4는 별도다. 코드/CI 완료와 실기기/바닐라 제거 대기를 구분한다. Safari 저장소 삭제 기간 등 공식 확인하지 않은 조건은 사실로 쓰지 않는다. 기존 로그인 만료 이동은 보존하며 인증을 새로 구현하지 않는다.

검토 채팅에서 전달받은 [Claude 읽기 전용 검토](https://claude.ai/chat/e43aefa4-a283-4e4b-b0de-d98e32d5f8e6)와 코드 대조에 따라 전체 화면 표에서 #88·B4 병합 상태와 공유 UI/실기기 범위를 갱신했다. Claude는 원격 코드를 읽었고 CI를 실행하지 않았으며, 위 실행 결과는 Codex 측의 실제 로그다. 검토가 코딩/실기기 완료를 대신하지 않는다.

재현: `npm --prefix app/lite test`, `npm --prefix app/lite run build`, `npm --prefix app/lite run test:e2e -- e2e/home-weather.spec.ts e2e/add-search.spec.ts`. 전후 그림은 기준 커밋의 별도 빌드와 `CHROMIUM_PATH=... node app/lite/tools/capture-home.mjs BEFORE_DIST`를 사용한다.

## 구현 담당 이전 시점

대표의 최신 요청으로 새 구현/병합은 중단하고 [Claude 패션 인계](claude-implementation-handoff-20261027.md)·[WO-01~WO-10](claude-work-orders-20261027.md)으로 넘긴다. 마지막 전체290개는289통과/1실패(10.7분)다. 실패는 WebKit 코디의 마지막 기능 assert 이후 context 종료30초 초과였고, trace의 기능 오류는 없었다. 같은 코드/설정의 해당 흐름은1개 통과·정상 종료(3.2초)로 재확인했다. 전체290개 성공으로 바꿔 쓰지 않으며 최종 같은 head CI/리뷰/병합은 Claude가 마무리한다. 애니메이션 조건을 맞춰 캡처8장을 실제 다시 생성했다.

## Claude 인수 후 검증 (2026-10-27, WO-01)

- 접수 head `4b2eb9f`의 GitHub CI는 PR 실행(40448449453)과 push 실행(40448266854) 모두 11개 성공이며 `Lite input Chromium and WebKit`도 성공했다. Codex 로컬의 WebKit context 종료 1실패는 이 CI에서 재현되지 않았지만, 로컬 전체 290개 성공으로 바꿔 쓰지 않는다.
- Claude 클라우드 환경(Node 22.22, Playwright 1.57, 모바일 Chromium만 설치·WebKit 설치 불가)에서 같은 head를 다시 실행했다: Node 356 통과/0 실패/0 건너뜀, 빌드 통과, 모바일 Chromium 전체 145개 통과(6.3분).
- 코드 검토 중 회귀 1건: React 홈의 예시 칩이 `useMemo(..., [host])`로 고정돼 `M.examples()`가 따르는 코어 성별(예: `loadTrialCloset`) 변경을 반영하지 않았다. 바닐라는 다시 그려 반영했다. 실패 테스트 `ff25a50`(칩 3개가 이전 값)을 먼저 커밋하고 `b7636c9`에서 구독 version을 의존성에 넣어 고쳤다. 수정 뒤 home-weather 9개·Node 356개·타입 검사/빌드 통과. 새 head의 CI 결과는 PR에 따로 남긴다.
