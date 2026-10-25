# 저장소 정리 재작업 — 2026-10-25

사용자 지시: PR #66(`9826dac`)의 예산·백업·반품·MIME를 정본으로 유지한다. 기준 master는 PR #67 문서까지 포함한 `c02ea9a`다. 새 기능·개인 자료 변경·직접 운영 배포는 이 작업 범위가 아니다. 새 PR은 순서대로 검사하고 병합 가능한 상태로 준비한다.

## 중복 PR과 검사 보존

#59~#62를 대조 근거와 테스트 보존 PR #69 링크를 남기고 닫았다. 기존 브랜치는 삭제하지 않았다. #61 검사별 대응·이식 제외 이유는 [백업 검사 대조](backup-tests-reconciliation-20261025.md)에 있다. #66 백업 11개를 그대로 두고 실패점·원문 보존 Node 5개, 정상 UI 왕복 1개를 추가했다. #69 CI 9개 통과. 로컬 Node22 기준 app688/lite179, Chromium12/WebKit12 통과(실물 기기 아님).

#65 ↔ master를 `git merge-tree --write-tree --messages`로 대조해 충돌 메시지 12개를 재현했다. file-location/modify-delete도 포함한 수치다. 기존 PR의 충돌을 수동 해결하거나 코드 전체를 가져오지 않았다.

| 충돌 경로 | 종류 |
|---|---|
| `app/lite/checks/ai-client.check.mjs` | content |
| `app/lite/checks/backup-client.check.mjs` | add/add |
| `app/lite/checks/rank.check.mjs` | content |
| `app/lite/functions/api/rank.js` | content |
| `app/lite/src/core.mjs` | content |
| `app/lite/src/screen.html` | content |
| `app/mockups/ux10v2/shared/eoul-mock.js` | modify/delete |
| `docs/README.md` | content |
| `docs/design/mockups/ux10v2/links/d16-lens.html` | file location: master에 새로 생긴 파일의 이동 제안 |
| `docs/development-plan.md` | content |
| `docs/owner-requirements.md` | content |
| `docs/system-handover.md` | content |

## B: 코드 위치 재적용

재실행 가능한 스크립트 [reapply-layout](../../../tools/repository-cleanup/reapply-layout-20261025.py)는 옛 PR의 이동 명세만 읽고 최신 체크아웃의 실제 파일을 `os.rename`으로 옮겼다. 이동 맵과 생성물 제외 목록은 [layout-map](../../../tools/repository-cleanup/layout-map.json)에 있다. 308개 이동, 경로 수정 91개, 생성 코어 번들 2개만 추적에서 제거했다. 실제 테스트·도메인 원본은 삭제하지 않았다.

- 운영 화면/코어/브라우저 보조/아이콘과 도메인 20파일을 `app/lite` 안에 배치했다. 시안은 `docs/design/mockups`, 이전 앱·서버·Docker 키트는 `legacy`다. 운영 빌드는 시안을 입력으로 쓰지 않는다.
- API 경로·저장 키·Worker 빌드 루트 `app/lite`는 유지한다. rank의 query 포함 import 3곳과 코어 import 경로만 바꾸고 #66 함수 본문은 보존했다. 생성 bundle의 #66 부팅 보호도 그대로다.
- #63에 있던 잘못된 legacy 서비스워커 아이콘 변경은 옮기지 않았다. 런타임 URL은 `./icons/...`이며 legacy builder가 그 위치로 복사한다.
- 기존 app 날씨 검사 5개를 lite로 이동했다. **app688 + lite179 = 867 → legacy683 + lite184 = 867**, 삭제 0개. 서버50(49통과·기존 실제 ONNX 모델/런타임 미설치 1skip)은 그대로다. TS·Vite·legacy HTML·주문 확장 빌드 통과. 이동 뒤에도 Chromium12/WebKit12=24개가 통과했다. 정본 보존 도구 12항목과 독립 대조를 통과했고 CI는 PR에서 확인한다.

## 정본 회귀 방지

`python3 tools/repository-cleanup/check-preserved.py`로 기준 `c02ea9a`와 현행 파일을 대조한다. rank/core는 import 경로만 정규화하고, query/구매여정/반품 도메인·dev MIME·기존 백업/예산 검사·BK 블록·상담 예산 블록·반품/구매 흐름·코어 부팅 구간은 원문이 같아야 한다. 새 입력 상태 변경이 예산·백업 코드를 되돌리면 이 검사가 실패한다.

## 재작업 순서

B 위치 정리 CI → C 입력 상태/지연 로딩 → 현행 5문서와 날짜 로그 분리. 각 단계에서 검사 통과·정본 보존을 다시 확인한다. 완료 전 다른 기능 PR은 시작하지 않으며, 완료하면 개발 계획 맨 위의 진행 중 표시를 지운다. 실제 병합/실물 기기/운영 API 검증은 관찰한 상태만 별도로 기록한다.

## C: 입력 상태 재적용

host 소유 입력 컨트롤러를 React와 vanilla가 공유하고 기존 `input-draft:v1`·draftId·출처를 유지한다. React CSS/JS는 진입 때 로드하고 실제 방문한 성공 응답만 서비스워커에 보관한다. 로그인 HTML 응답은 JS/CSS로 캐시하지 않는다. 기존 #64의 옛 `eoul-backup:transaction` 검사는 가져오지 않고 현행 #66 `eoul-backup:stash-next`의 미완료 복원 동안 초안 쓰기/삭제를 막는 검사로 적응했다. BK·예산·반품 코드는 변경하지 않는다.

재적용 검토에서 **새 vanilla 영속 초안의 중복 회귀**를 발견했다. 저장 성공→초안 삭제 실패→새로고침→vanilla/React에서 이어 쓰기 재시도를 하면 기존 `M.addGarment` 경로는 같은 옷을 두 벌 만든다. 실제 Chromium 두 경우 모두 실패(2벌)를 확인했고, vanilla UI adapter도 기존 `M.registerGarment` 원자 저장·draftId 영수증을 쓰도록 고쳤다. 코어/스키마를 새로 만들거나 #66 구현을 바꾸지 않았다. 두 재시도 경로의 E2E를 추가해 재현을 보존한다.

Node 검사: lite184→189(+5), legacy683/server50 유지, 전체922(기존 모델1skip 포함). B보다 줄어든 검사는 없고 기존11개 백업도 그대로다. 브라우저는 기존24 + 교차 입력/지연 로딩/방문 뒤 오프라인8 + 중복 재시도4 = 36개다. 옛 #61의 저널 복구 전용 E2E 2실행은 정본에 없는 계약이어서 이식하지 않았고 그 이유는 백업 대조표에 적었다. 정본 보존 12항목과 TS/Vite 빌드, Chromium18/WebKit18 총36개가 통과했다. 원자 저장 후 보조 REG 목록 쓰기가 실패해도 브랜드·링크는 receipt에 남는다. 보조 목록 재시도 안내는 원자 자료 유실을 뜻하지 않는다.

`?input=vanilla` 제거는 보류한다. 실제 iPhone/Galaxy 설치 앱에서 입력/한글 키보드/뒤로가기/재접속·초안 복원/저장 실패/방문 뒤 오프라인과 두 화면의 동등성을 확인한 뒤 제거한다. 자동 모바일 뷰포트 검사로 실물 기기 확인을 대신하지 않는다.

브라우저 재검사 중 WebKit 1건은 비동기 중복 후보가 선택 칸 위에 삽입되는 동안 색 클릭이 빗나가 실패했다(저장 버튼 비활성). 실제 후보 행 표시와 종류·색의 aria-pressed를 기다리는 드라이버로 보완하고 같은 36개를 전부 재실행해 통과했다. 조건 완화·재시도 횟수 증가·검사 삭제는 하지 않았다.

PR #71 검토에서 vanilla의 무제한 입력이 기존 초안 읽기 한도(브랜드·상품명80, URL2000)를 넘겨 저장하는 결함이 확인됐다. 경계 초과 편집·검색 초기값 두 Node 검사로 실패를 먼저 재현했다. 두 화면의 길이 한도를 맞추고 공통 읽기/쓰기 길이 검사로 잘못된 새 저장을 막았다. 화면 입력과 마지막 정상 원문은 자동 자르기·삭제 없이 보존하며, 줄여 고치면 다시 저장된다. 이미 저장된 초과 길이 원문은 계속 보호한다. Node2개·경계값 vanilla→React 브라우저2실행을 더해 **최종 legacy683 + lite191 + server50 = 924개(923통과·기존1skip)**, Chromium19/WebKit19=38개가 통과했다. 빌드·정본 보존12항목도 다시 통과했다.

## D: 현행 문서와 날짜 기록 재적용

최신 master에서 이어진 파일을 [문서 이동 스크립트](../../../tools/repository-cleanup/reapply-docs-20261025.py)로 옮겼다. 이동 맵은 [docs-map](../../../tools/repository-cleanup/docs-map.json)이다. 날짜 루트78개(정리 직전 개발 계획·인수인계 스냅샷2개 포함)와 research/validation2개, 합계80개다. 상대 링크316개를 다시 연결하고 기존에 깨져 있던 실제 파일 링크58개도 고쳤다. 버튼·절 참조 예시28개는 파일 링크로 오인해 바꾸지 않았다.

현재 기준은 docs 루트의 목차·대표 요구사항·사업 계획·개발 계획·시스템 인수인계 5개다. #66 예산·백업·반품 구현과 남은 정확성/실물 검증을 구분하고, #48은 닫힘·d16은 미채택 참고로 정리했다. 원스톱 목표·R1~R21·비용/사진/공급원 권리 경계를 유지한다. 옛 날짜 문서는 당시 기록이며 현재 지시로 적용하지 않는다는 안내와 [월별 목차](../README.md)를 붙였다.

입력 최종 검사 수정 `81a10fe` 이후 D 고유 범위에서 앱·테스트·CI 코드는 변경하지 않는다. 이동 원본78개 중76개는 링크 목적지 외 본문을 그대로 유지했고, 나머지 백업 대조표와 이 재작업 로그2개에는 후속 실행 결과를 갱신했다. 디자인 원장 외부 URL242개와 validation JSON SHA256도 보존했다. 스냅샷2개는 별도 추가 보존본이다. [내부 링크 검사](../../../tools/repository-cleanup/check-doc-links.py)의 파일474곳·앵커10곳에서 누락0, 정본 보존12항목·공백 검사도 통과했다. 최종 PR CI와 기존 PR 종료는 GitHub 상태로 별도 확인한다.

길이 검사 첫 CI 실패는 테스트가 정상 복원의 `updatedAt` 갱신 전 원문을 잡은 탓이었다. 복원 직후의 원문을 비교 기준으로 고쳐, 이후 초과 입력이 마지막 정상 원문을 한 바이트도 바꾸지 않는 검사를 유지했다. Node191개 재검사 통과. 코드 조건·검사 수·CI 정책을 완화하지 않았다.

#70 CI11개 성공 뒤 #71을 열었고, 최종 `81a10fe`에서도 CI11개 성공을 확인한 다음 문서 PR을 준비했다. 문서/이동/정본 대조를 마쳐 개발 계획의 진행 중 표시를 지웠다. 다른 기능 PR은 시작하지 않았다. 병합 준비를 실제 master 병합·활성 운영 버전으로 기록하지 않는다.
