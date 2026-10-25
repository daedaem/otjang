# 저장소 정리 재작업 — 2026-10-25

사용자 지시: PR #66(`9826dac`)의 예산·백업·반품·MIME를 정본으로 유지한다. 기준 master는 PR #67 문서까지 포함한 `c02ea9a`다. 새 기능·개인 자료 변경·직접 운영 배포는 이 작업 범위가 아니다. 새 PR은 순서대로 검사하고 병합 가능한 상태로 준비한다.

## 중복 PR과 검사 보존

#59~#62를 대조 근거와 테스트 보존 PR #69 링크를 남기고 닫았다. 기존 브랜치는 삭제하지 않았다. #61 검사별 대응·이식 제외 이유는 [백업 검사 대조](backup-tests-reconciliation-20261025.md)에 있다. #66 백업 11개를 그대로 두고 실패점·원문 보존 Node 5개, 정상 UI 왕복 1개를 추가했다. #69 CI 9개 통과. 로컬 Node22 기준 app688/lite179, Chromium12/WebKit12 통과(실물 기기 아님).

#65 ↔ master를 `git merge-tree --write-tree --messages`로 대조해 충돌 메시지 12개를 재현했다. file-location/modify-delete도 포함한 수치다. 기존 PR의 충돌을 수동 해결하거나 코드 전체를 가져오지 않았다.

## B: 코드 위치 재적용

재실행 가능한 스크립트 [reapply-layout](../tools/repository-cleanup/reapply-layout-20261025.py)는 옛 PR의 이동 명세만 읽고 최신 체크아웃의 실제 파일을 `os.rename`으로 옮겼다. 이동 맵과 생성물 제외 목록은 [layout-map](../tools/repository-cleanup/layout-map.json)에 있다. 308개 이동, 경로 수정 91개, 생성 코어 번들 2개만 추적에서 제거했다. 실제 테스트·도메인 원본은 삭제하지 않았다.

- 운영 화면/코어/브라우저 보조/아이콘과 도메인 20파일을 `app/lite` 안에 배치했다. 시안은 `docs/design/mockups`, 이전 앱·서버·Docker 키트는 `legacy`다. 운영 빌드는 시안을 입력으로 쓰지 않는다.
- API 경로·저장 키·Worker 빌드 루트 `app/lite`는 유지한다. rank의 query 포함 import 3곳과 코어 import 경로만 바꾸고 #66 함수 본문은 보존했다. 생성 bundle의 #66 부팅 보호도 그대로다.
- #63에 있던 잘못된 legacy 서비스워커 아이콘 변경은 옮기지 않았다. 런타임 URL은 `./icons/...`이며 legacy builder가 그 위치로 복사한다.
- 기존 app 날씨 검사 5개를 lite로 이동했다. **app688 + lite179 = 867 → legacy683 + lite184 = 867**, 삭제 0개. 서버50(49통과·기존 실제 ONNX 모델/런타임 미설치 1skip)은 그대로다. TS·Vite·legacy HTML·주문 확장 빌드 통과. 이동 뒤에도 Chromium12/WebKit12=24개가 통과했다. 정본 보존 도구 12항목과 독립 대조를 통과했고 CI는 PR에서 확인한다.

## 정본 회귀 방지

`python3 tools/repository-cleanup/check-preserved.py`로 기준 `c02ea9a`와 현행 파일을 대조한다. rank/core는 import 경로만 정규화하고, query/구매여정/반품 도메인·dev MIME·기존 백업/예산 검사·BK 블록·상담 예산 블록·반품/구매 흐름·코어 부팅 구간은 원문이 같아야 한다. 새 입력 상태 변경이 예산·백업 코드를 되돌리면 이 검사가 실패한다.

## 이어 할 순서

B 위치 정리 CI → C 입력 상태/지연 로딩 → 현행 5문서와 날짜 로그 분리. 각 단계에서 검사 통과·정본 보존을 다시 확인한다. 완료 전 다른 기능 PR은 시작하지 않으며, 완료하면 개발 계획 맨 위의 진행 중 표시를 지운다. 실제 병합/실물 기기/운영 API 검증은 관찰한 상태만 별도로 기록한다.
