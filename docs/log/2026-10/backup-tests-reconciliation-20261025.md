# PR #61 백업 검사 보존 비교

기준: `origin/master=c02ea9a2f0b38d7cdb6bcf0fb53c2b649db64839`(#66 포함), #61 head `bfc353e6a973d4e714a8082bfe6c954be1d1ea39`. #61의 독립 범위는 `origin/pr60..origin/pr61`로 대조했다. 기존 브랜치나 제품 소스는 변경하지 않았다.

## 결론

- #61의 백업 Node 검사는 12개, master는 11개다. 단순 12→11을 검사 유실로 해석하면 안 된다. 앞의 공통 3개를 제외하면 거래 저널 방식과 `STASH/NEXT` 방식의 계약이 다르다.
- **복원 중간 실패·되돌리기 중간 실패·되돌림까지 막힌 partial 복구는 master에도 있다.** master는 앞선 보관본을 보존하는 두 칸, 승격 실패, 미완료 복원의 새 복원 차단까지 별도로 검사한다.
- master 제품 코드를 그대로 둔 채 추가 가능한 누락 시나리오 **Node 5개**를 `app/lite/checks/backup-gap.check.mjs`에 준비했다. 각 검사는 현재 화면의 BK 블록 원문만 읽으며 제품 구현은 수정하지 않는다. 기존 master 11개 + 추가 5개 = **16/16 통과**, 스킵·삭제 0개.
- 별도 UI 정상 왕복 검사 1개는 #66의 기존 selector·UI로 `app/lite/e2e/input.spec.ts`에 이식했다. 최초 대조 때는 미실행이었고, 후속 #69에서 Chromium·WebKit 각 1회 실행해 통과했다. 저널 복구 화면 E2E는 master에 구현이 없어 이식 제외한다.

## #61의 12개 검사 대응표

원문: `app/lite/checks/backup-client.check.mjs`(각 ref의 행 번호).

| #61 검사/행 | master 대응 | 판정·보존 방안 |
|---|---|---|
| 1. 내보내기 원문 왕복, 캐시/타 앱 제외(49) | 48 | 중복. master 유지 |
| 2. 현재 값 보관→복원→undo/타 앱 보존(70) | 69 | 중복. master 유지 |
| 3. 잘못된 파일/형식/엔진/크기/보관본 저장 실패(87) | 86 + 엔진 규칙 161 | 중복. master의 `canReadSaved` 경로 유지 |
| 4. restore의 모든 변경 실패점 보상, 쓰기 우선·저널 정리(108) | 109의 일부 set 실패 + 173/202/232의 두 칸 계약 | 부분 중복. 모든 개인 set/**remove** 실패점과 빈 문자열/기존 보관본 보존·재시도만 새 검사 1로 보강. **쓰기 우선 순서·저널 정리 계약은 이식 안 함**(master는 삭제 우선 보상 방식) |
| 5. undo 모든 변경 실패점 보상·보관본 재시도(129) | 133의 두 set 실패 | 부분 중복. remove 포함 모든 개인 변경점과 새 BK 클라이언트 재시도만 새 검사 2로 보강 |
| 6. 보상 실패 시 영구 transaction 저널·core 쓰기 잠금·재접속 recover(143) | 121의 partial→보관본 undo + 232의 pending 보호 | partial과 복구 지점 보존은 중복. **TXN/recover/core 잠금/alertdialog/inert는 #61 추가 구현에만 있으므로 이식 안 함**. #66으로 되돌아간 버그라고 기록하지 않음 |
| 7. undo 보상도 실패 시 저널 보존·재접속 recover(168) | 133은 한 번 실패만 검사; partial undo 뒤 재시도 명시 검사 없음 | 새 검사 3으로 **undo+보상 동시 실패→기존 stash 원문 유지→새 BK의 undo 성공**만 보강. TXN과 recover는 요구하지 않음 |
| 8. 등록 영수증·입력 초안 왕복 + 미래/손상 입력 거절(181) | 공통 왕복 48, 엔진 위임 161, `registration.check.mjs:20`(미래 등록 스키마 쓰기 차단), `storage.check.mjs:233`(손상 메타데이터 보호) | 왕복의 구체 대상은 빠져 있어 새 검사 4로 영수증·초안·모르는 속성 **원문** 보존 추가. **직접 BK.restore(data) 검증/초안·reg의 별도 import 검증은 master 계약에 없어 이식 안 함**. 엔진 read의 미래 형식 거절은 기존 위임/코어 검사 유지 |
| 9. 손상/미래 기존 원문에 복원→undo→core 쓰기 보호(201) | `storage.check.mjs:129`(손상/미래 자료 쓰기 차단)·161 백업 엔진 위임 | 복원 전 손상 원문을 정확히 다시 되돌리는 조합은 없어 새 검사 5 추가. 코어 보호 자체는 기존 검사 유지 |
| 10. 읽지 못한 transaction 저널 별도 보관·실패 닫힘(213) | 없음 | #61의 저널/아카이브 신규 API 요구. master 정본을 바꾸지 않고는 이식 불가. 이번 테스트 전용 범위 제외 |
| 11. 상담/등록 링크의 active content·마크업 ID 거절/escape(225) | 백업의 형식/엔진 검사 86·161은 있으나 동일 상담/reg 세부 import 검사 없음 | #61의 추가 validator·escape 구현에 의존. 단순 시험 이식은 master 실패를 의도적으로 만들므로 제외. **기존 master의 import 검증 경계 차이로 명시**, 완료로 보고하지 않음 |
| 12. preview의 atomic receipt 집계/중복 제거(242) | master count는 `REG.items` 수만 센다 | #61의 새 집계 동작이 필요. 데이터 원문 보존 검사 4와 구분하고 preview 개선 완료로 쓰지 않음. 이번 구현 불변 테스트 이식 제외 |

## #66에만 있는 보호 검사(반드시 유지)

- master 146: `:unreadable:`와 모르는 eoul 키, 기기 ID를 삭제하지 않는다.
- master 173: 두 번째 복원이 깨끗이 실패하면 첫 번째 복원의 undo 지점을 유지하고, partial이면 새 복구 지점을 남긴다.
- master 202: 복원 성공 전 STASH를 덮지 않는다. NEXT→STASH 승격 실패도 NEXT로 undo 가능하다.
- master 232: NEXT가 남은 partial/승격 실패 상태에서는 새 restore를 거절하고, undo 후 restore를 다시 허용한다.
- #61의 journal 방식을 cherry-pick하면 위 두 칸 계약 자체가 사라지므로 이식하지 않는다.

## 테스트 수 기록 기준

- 백업 Node: 현행 11개 **모두 보존**, 독립 추가 5개 → 16개.
- #61의 12개 파일을 그대로 복사하지 않는다. 공통 3개 중복, 실패점/원문 조합은 master 방식에 맞춰 보존하며, 저널·추가 validator·집계 계약은 새 기능 코드에 묶여 이식 제외한다. 이를 기존 master 검사 감소로 쓰지 않는다.
- #61 E2E 추가 2개 중 정상 파일 미리보기/복원/새로고침/undo 1개를 이식해 Chromium/WebKit 각1회 통과했다. 저널 복구 dialog 1개는 미구현 계약이어서 제외한다.
- #61의 기존 E2E 드라이버 변경(가짜 Storage adapter·duplicate suggestion 대기)은 백업 신규 시나리오가 아니므로 테스트 전용 PR의 자동 이식에 포함하지 않는다. 이후 재작업 중 실제 실패가 재현되면 원인 별도로 판단한다.

## 실행 증거

`node --test /tmp/otjang-backup-master-run.check.mjs /tmp/otjang-backup-gap-tests-run.check.mjs`: 16 tests, pass 16, fail/skip 0. master BK 원문을 `git show origin/master:.../d12-hang.html`로 추출해 사용했다. 제품 코드·기존 검사 파일·Git branch/index는 변경하지 않았다. 테스트는 가짜 localStorage와 합성 텍스트만 쓰며 외부 호출이 없다.

## #65 충돌 재현

`git merge-tree --write-tree --messages c02ea9a2f0b38d7cdb6bcf0fb53c2b649db64839 c8a332f75f4f869390503ec37fb7a20b89fd2a66`로 작업 트리를 바꾸지 않고 재현: 충돌 메시지 12개. ai-client, backup-client, rank 검사, API rank, core, screen, 생성 eoul-mock.js 삭제/수정, d16 디렉터리 이동 위치, docs/README·development-plan·owner-requirements·system-handover다. 마지막 d16은 내용 충돌이 아닌 file-location 충돌이며 충돌 메시지 12개를 파일 내용 충돌 12개로 표현하지 않는다. 기존 브랜치는 병합·수동 충돌 해결하지 않았다.

- 루트 재검사: Node 22.23.2, master lite 174/174, app 688/688. 추가 후 lite 179/179와 TypeScript·Vite 빌드 통과. 이전 실행의 vite 미설치·loopback EPERM은 의존성 설치 및 허용된 격리 loopback 실행으로 해결했고 검사를 삭제/스킵하지 않았다. API rank·core·query·screen·dev.mjs의 제품 diff는 0이다.
