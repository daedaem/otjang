# 무손실 백업 후속 수정 — 2026-10-25

현재 후보는 [PR #74](https://github.com/daedaem/otjang/pull/74), 브랜치 `fix/backup-validation-20261025`다. 정리 #69/#70/#71/#73은 순차 머지했고 기준 master는 `d26a69a`다. 대표는 이 채팅의 구현·검증·커밋·push를 직접 허용했으며 **#74 머지·배포는 제외**했다. 아래 초기 강경 거절 구현은 무손실 계약으로 대체된 이력이다.

## 현재 계약과 실패 재현

- `ea3a425`: 무손실13개 중12실패·1통과를 구현 전 커밋했다. `ee82d22`에는 실제 #66의 format1 반례와 format2 기대를 추가했다. 이후 새 왕복·경계·보고서 충돌 검사를 보강했다.
- 손상/미래 active 문자열은 원래 source를 가진 unreadable archive로 보존하며 활성화하지 않는다. 정상 active·opaque archive 분류와 read/미리보기는 쓰기0이다. 파일 내부/기존 archive 충돌은 다른 문자열 둘 다 남기고 같은 출처/문자열 반복 수입은 증식하지 않는다.
- 격리 수입 source의 기존 정상/손상 active는 정상 수입 active가 없는 경우만 유지한다. 그 외 전체 복원 의미는 유지한다. 명시적으로 교체/제거할 기존 손상 값은 같은 거래의 보관 원문으로 남기며 미리보기에 ‘보관 후 활성에서 교체/제거’를 표시한다.
- 금지 키/소유권/문자열 값/중복 봉투 멤버는 거절한다. archive의 첫 원래키도 다시 검사하되 뒤 suffix는 opaque로 읽는다. UTF-8 전체 봉투5MB를 make/read/direct restore/복원 후 남는 archive·unknown 값까지 일관되게 적용한다.
- #66 apply·보상·STASH/NEXT·undo 본문은 유지한다. 쓰기 전 계획과 메모리 보고서만 restore 경계에 추가했다. archive 쓰기 실패, 보상까지 실패, promotion 실패 뒤 undo와 재시도도 검사한다. NEXT 잔류는 완전 성공 표시·자동 재시작 대신 복구 안내를 한다.

## 형식 선택의 실제 근거

`checks/fixtures/backup66-block.txt`는 #66 `9826dacf5d2766691d8b3509d7d03c436254d300`의 실제 BK 소스다. fixture SHA256은 `3a679efff0dae874f86d0249cfacd29f3cc88472a3d106e90532b7440086227d`이며 테스트가 확인한다. 원본 read/restore/make로 정상 format1 왕복과 손상 자료의 새 reader 수입을 실행한다.

원본 #66에 archive-only format1을 복원하면 기존 정상 source가 active에서 삭제돼 STASH에만 남는다. 새 보존 의도를 구 reader가 알지 못하므로 새 내보내기는 **format2**로 올려 구 #66이 쓰기 전에 거절하게 했다. 새 reader는 기존 format1과 새 format2를 받고 손상 원문을 분류한다. 완전 양방향 format1 호환이라고 쓰지 않는다.

## 검사 수와 결과

코드 후보 `3b4a51fd7434cec5db6f2812d4db8492960de718`에서 다음을 확인했다(2026-10-25).

- 로컬: lite217개, 그중 백업42개(원문 보존18·기존11·보존5·상세 경계8), TypeScript/Vite 빌드 통과.
- 로컬 전체 Chromium21/WebKit21=42개 통과. 이전38개 통과 후 새 검사 fixture의 없는 메서드 호출을 실제 `M.ask`로 고쳤고 최종42개 전체를 다시 실행했다. 실제 화면의 기존 부팅 검색/저장과 백업 원문 검사를 구분하려고 같은 정상 이력을 먼저 만든다. 원문 문자열 일치·미리보기 쓰기0·실패 복구 assertion은 유지했다.
- 독립 CI [40175753414](https://github.com/daedaem/otjang/actions/runs/40175753414)·[40175763684](https://github.com/daedaem/otjang/actions/runs/40175763684)가 재실행 없이 모두 성공했다. 각 브라우저42개이며 PR check11개가 모두 성공이다.
- CI 로그에서 legacy app683/683, lite217/217, server50개 중49통과·기존 선택 실모델1skip을 직접 확인했다. 합계 Node950개(949통과·기존1skip). Docker 서버 응답/이미지 빌드도 통과했다. 검사 수를 사용자 효용이나 실제 기기 검증으로 바꾸지 않는다.
- 보존 대조15항목, 내부 문서101개/연결483개/anchor12개, 공백 검사를 통과했다. 읽기 전용 두 코드 검토에서 보고서 키 충돌과 건수 누락을 찾아 고친 뒤 재검토했으며 새 차단 문제는 발견하지 못했다. 실제 인간 전문가나 Claude의 최종 승인으로 쓰지 않는다.

기존199/40·Node932는 초기 strict 후보 이력이며 현재 무손실 후보 수치가 아니다.  기존 백업11개·보존5개·상세 경계8개는 삭제하지 않았다. 상세 손상 사례의 기대는 거절에서 격리/기존 active 유지로 바뀌었다. 손상 로컬 undo 검사는 기존 active 원문 일치와 새 archive 보존을 함께 확인한다. 거래 실패 카운터(`sets===3`)는 그대로다.

## WebKit 검사 수정의 증거

최종 서버 단절 방식 `b06d2eb`는 앱 origin8792를 실제로 멈추고 별도 loopback 제어8793으로 다시 켠다. 브라우저 networking/offline 플래그는 건드리지 않고 SW 재진입 전 catch-all route를 제거했다. uncached 요청 전/후 실패, 새 Document, SW response/controller, 초안/React 복원을 유지했다. 검사 retry0·timeout·skip·CI 설정을 완화하지 않았다.

이 head의 독립 CI 두 실행 `40173545572`, `40173549096` 모두 재실행 없이 성공했고 각 Chromium20/WebKit20=40개를 통과했다. 이것은 아래 중간 실패 가설과 다르며 전역 WebKit 버그 원인을 확정한 증거는 아니다. 새 무손실 UI 검사가 든 최종 head는 별도로 CI를 확인한다.

## 남은 경계

코드 head의 CI와 읽기 전용 검토는 완료했으며, Claude의 최종 PR 검토·master 병합·실제 배포는 별개다. 진행 중 표시는 구현·검증·인수인계 완료에 따라 이 PR에서 제거하며 master에는 #74가 실제 병합될 때 반영된다. 최종 문서 커밋의 CI/head는 PR 댓글에서 다시 확인한다. 실제 iPhone/Galaxy의 파일 앱·공유·PWA 저장 영역·재설치·비행기 모드 왕복은 미검증이다. 공개 개인 원문이나 실제 API/DB는 사용하지 않았다. 전체 React 전환은 대표의 다음 개발 결정이며 #74 마무리 후 진행한다.

---

# 초기 후보 이력 — 현재 계약으로 대체됨

# 백업 사전 검증 후속 수정 — 2026-10-25

대표가 전달한 Claude 승인에 따라 정리 #69 → #70 → #71 → #73을 모두 머지한 master `d26a69a52750cbd1734e6266e7c28b52ac28fc71`에서 시작했다. 브랜치는 `fix/backup-validation-20261025`다. #72는 이 스레드에서 추가 변경하지 않았다.

## 실패를 먼저 보존

`0187697`은 구현 전 실패 테스트 커밋이다. 새 검사8개 중7개 실패·1개 통과를 확인했다. 손상/미래 초안·REG·상담 ID/상품 ID 컨테이너·등록 URL·직접 restore의 쓰기 전 거절·React 영수증 집계가 빠져 있었다. 테스트는 합성 자료와 가짜 저장소를 사용한다. 실제 개인 파일·DB·API를 사용하지 않았다.

## 변경과 보존

- BK의 make/read/restore가 같은 `validate(data)`로 대상 자료를 먼저 검사한다. 복원에서는 pending NEXT 확인 뒤, 어떤 NEXT/STASH 쓰기보다 먼저 대상만 검증한다.
- 초안은 실제 입력 reader의 v1·단계·ID·문자열 길이·출처·시각 계약을 따른다. 작성 중인 미완성 URL은 정상 초안으로 허용한다.
- REG는 기존 무버전·v1, 생략된 필드·`color:null`·추가 속성을 보존한다. 객체 형태·명시된 미래 버전·등록 URL 타입/HTTP(S)를 검사한다.
- 상담은 과거 ID와 현재 카탈로그에 없는 정상 상품 ID를 허용하며 따옴표/마크업 ID와 잘못된 ids 컨테이너를 거절한다. 앱이 AI 오류·질문 길이 안내에 쓰는 `role:'note'`도 정상 이력이다. 이를 거절하던 중간 구현은 note fixture의 실제 실패를 확인한 뒤 고쳤다.
- 선택 링크의 객체·숫자가 빈 문자열로 처리되던 등록 입력의 URL 타입도 거절한다.
- 미리보기 등록 건수는 legacy REG.items의 옷 ID와 원자 등록 영수증 garmentId의 합집합이다. 같은 옷은 한 번, 삭제된 옷에 남은 등록 영수증도 기존 기록으로 센다.
- 내보내기 검증 실패는 파일 공유·다운로드·클립보드 호출 전에 화면에 알린다. 원문·추가 속성·알 수 없는 eoul 키·`:unreadable:` 보관 원문을 자동 변환하거나 삭제하지 않는다.

#66의 apply 보상·stash/undo 본문은 동일하다. restore에는 대상 사전 검증 한 줄만 더했으며 현재 before 원문은 검증하지 않는다. 현재 자료가 손상됐어도 정상 자료로 복원한 뒤 undo로 그 손상 원문까지 정확히 되돌릴 수 있어야 하기 때문이다. BK.snapshot과 STASH/NEXT 순서를 바꾸거나 옛 transaction 저널을 되살리지 않았다. 예산·반품·MIME·코어 부팅도 그대로다.

## 기존 검사 의미 유지

기존 11개 백업 검사를 삭제하지 않았다. 정상 복구 대상으로 쓰던 불완전한 초안2개를 실제 reader가 읽을 수 있게 고쳤다. 상담 filler `'x'.repeat(50)`도 정상 상담 JSON으로 바꾸었다. 이전 filler는 새 검증에서 먼저 거절돼 기존 오류 정규식만 만족할 수 있었으므로 `sets===3`을 추가해 NEXT 저장·대상 쓰기 실패·보상 쓰기까지 실제 실행됨을 확인한다. 기존 assertion의 삭제·조건 완화는 없다.

보존 도구의 `--backup-validation`은 새 경계 검증을 승인 범위로 구분하되 복원/undo 거래와 기존 assertion을 원문 대조한다. fixture 허용은 정확한 치환 문자열3개와 새 카운터 assertion으로 제한하며 fixture 줄 전체를 숨기지 않는다.

## 검증과 남은 상태

- 추가8개: 7실패/1통과 → 8통과. note 호환성도 별도 실패 재현 후 통과.
- 백업·등록·저장 범위44개, lite 전체199개, TypeScript/Vite 빌드 통과.
- Chromium20·WebKit20=40개 로컬 통과. 새 UI 검사는 내보내기 두 경로의 가시적 오류·실제 다운로드/복사 미실행·부적절한 상담 파일 거절·원문 보존과 등록 건수를 확인한다.
- 보존 도구15항목·공백·내부 문서 링크 검사를 사용한다. legacy683/server50(49통과·기존 실모델1skip)을 포함한 최종 CI는 PR에서 확인한다. 자동 검사 수를 실제 사용자·보안 인증·실물 복구 훈련으로 쓰지 않는다.

후속 수정 PR의 번호·head를 Claude 검토에 전달한다. 이 문서의 로컬 구현·검증을 master 반영·운영 배포로 쓰지 않는다. 실제 iPhone/Galaxy의 파일 공유·재설치·PWA 저장 영역·복구 왕복은 남았다. 진행 중 표시 삭제는 후속 PR에 포함하며 실제 master에서는 PR 머지 후 반영된다.

## WebKit 단절 주입 후속 확인

#74의 `a00eb93`에서 한 CI 실행은40개 성공했으나 다른 실행과 동일 조건 재실행은 기존 오프라인 재진입 한 곳의 `WebKit encountered an internal error`로39/40이었다. 새 백업 사례의 실패가 아니며, 재진입 방식 변경만으로 이 내부 오류를 없앴다고 쓰지 않는다.

테스트 서버의 전송 단절을 HTTP 응답 없이 소켓을 종료하는 `end()`로 바꾸고, 기존 두 uncached 요청 실패·새 Document·SW 응답·controller·초안/React 복원 검증을 유지했다. 제품 SW·검사 retry/skip/timeout·CI 설정은 바꾸지 않는다. 조정 후 로컬 Chromium/WebKit 대상2개가 통과했으며 Linux 효과는 해당 head의 CI로 확인한다.

참고로 [Playwright의 별도 offline-emulation 보고](https://github.com/microsoft/playwright/issues/42775)는 service-worker 탐색의 같은 내부 오류를 다루며 origin 중지와 offline 플래그를 구분한다. 그 보고는1.63이고 현재 앱은1.56.1·전송 단절 방식을 쓰므로 같은 원인이라고 단정하지 않는다.

`ee68d8d`에서도 한 실행만 성공하고 다른 실행은 같은 내부 오류로 실패했다. 연결 종료 방식만으로 해결된 것은 아니다. 이후 실제 SW 재진입 직전에 catch-all page.route 중개를 제거하고, 시험 서버의 정상 응답에 no-store를 붙여 HTTP 캐시를 통한 통과도 막았다. [Playwright 요청 중개 문서](https://playwright.dev/docs/network#how-request-interception-works)에서 중개가 네트워크 스택 앞에서 동작한다는 경계를 확인했으며 현재 앱의 내부 원인 확정과 구분한다. 기존 네트워크 실패 두 번·새 문서·SW 응답·초안/React 복원 조건을 모두 유지한 로컬 대상2개가 통과했다. 제품의 요청/캐시 정책·retry/skip/검사 수는 변경하지 않았다.
