# 반품 계약·동기화 보호 검증 기록

기준일: 2026-10-13. 브랜치: `feat/editorial-mobile-20261013`, 시작 소스: `76eb15680baa125acbc526312b89fd91151fa0c6`. 관련 이슈: [#9](https://github.com/daedaem/otjang/issues/9).
이 문서와 함께 기록되는 변경을 검증했다. 실제 검사 대상 커밋은 PR와 Git 이력에서 확인한다. 코드·테스트·빌드·브랜치 push·배포를 같은 상태로 취급하지 않는다.

## 실행한 검사

| 환경·명령 | 실제 결과 | 검증하는 범위 |
| --- | --- | --- |
| Node 22.23.2, 새 lock으로 분리된 폴더에서 `npm ci --ignore-scripts --no-audit --no-fund` | 27개 패키지 설치, 직접 의존성 8개 고정 버전 일치 | 설치 재현. 설치 스크립트·브라우저 다운로드는 실행하지 않음 |
| `app/`에서 `npm test` | **184개 통과**, 실패·건너뜀 0 | 규칙·사진 입력 경계·백업·후속 계약·병합·저장·동기화 회귀 |
| Java 21, Maven 3.9.11, 실제 PostgreSQL 16 Testcontainers에서 `server/`의 `mvn test` | **130개 통과**, 실패·오류·건너뜀 0 | 실제 Spring 라이브러리 컴파일, DB/Flyway/API/인증/계정 격리/동시성 |
| `npm run check:catalog` | 오류 0, 주의 16건 | 목록 형식·확인일·근거 구조. 모르는 두께·목/치수 재확인은 남음 |
| `npm run build` | `dist/index.html` 생성, 3D 포함 12.22 MB | 최종 소스 조각과 실제 3D 자산의 빌드 |
| `npm run build:mobile` | 빈 자료의 `dist/mobile/index.html` 1.07 MB, 3D 분리 11.14 MB | 모바일 빌드·개인 자료 제외 조건. 파일 크기이며 로딩 시간 측정 아님 |
| 생성 HTML의 inline JS와 모바일 service worker 구문 검사 | 각 HTML inline script 13개, SW 파싱 성공, StorageCas 포함·미확장 마커 없음 | 생성물 구문·모듈 주입 |
| 모바일 아이콘 두 파일 원본/산출물 비교 | 각각 6,135·16,070 bytes, 바이트 일치 | 정적 자산 누락·변형 없음 |

공유 [followup-contract.json](../contracts/followup-contract.json)은 88개 입력 사례다. 유효·정규화·거부 사례를 양쪽에서 확인하며 이 숫자는 테스트 runner의 테스트 수와 다르다. 서버 API 계약 8개에는 import→조회/export→백업→restore, 오류 후 자료·revision·영수증 보존, V7→V8 이전과 DB 제약 위반 거부가 들어 있다.

저장 CAS 14개, 실제 앱 save/저장 직전 검사 함수 6개, 실제 sync 함수의 HTTP 회귀 3개도 전체 Node 검사에 포함된다. 브라우저 API와 HTTP는 합성 어댑터를 사용하므로 실제 브라우저·네트워크 E2E의 통과를 뜻하지 않는다.

## 검토로 찾고 고친 예외

- 미전송 반품 기록을 구매·보류·null로 정정할 때 보호 대상에서 빠지던 문제.
- 확인한 서버 스냅샷에 없던 새 로컬 기록 때문에 보내기/받기가 모두 막히던 문제.
- 같은 revision의 다른 저장 내용과 계정 전환 중 저장 큐가 섞일 위험.
- IDB의 최신 값을 읽지 못한 상태에서 오래된 LS 복사본을 성공 처리하던 문제. 읽기를 검증한 뒤 쓰기만 실패한 경우에만 대체 저장한다.
- 초기화에서 충돌 검사 전에 저장소를 지우던 경로. 초기 상태를 CAS 저장하고 실패 시 원상태를 유지한다.
- 유효한 원격 null 정정은 명시적으로 선택할 수 있게 하고 키 누락과 구분했다.
- 모바일 빌드의 플랫폼 `copyfile` 시간 초과. 원본 바이트를 읽어 산출물에 쓰며 manifest가 참조하는 두 아이콘이 없으면 빌드를 실패시킨다.

독립 소스 검토와 집중 Node 회귀에서 이 수정들의 추가 확정 P0/P1을 찾지 못했다. 모든 검사의 입력은 합성이며 개인 옷장·사진 원문은 커밋하지 않는다.

## 남은 검증과 기능

현재 실행 환경에서 브라우저 검사 스크립트는 구문만 확인했다. 실제 브라우저의 확인 화면·다중 탭·두 기기, 실제 휴대폰/Safari, production TLS/CORS/proxy, 배포 확인, DB+사진 복구 훈련과 실제 상품 가격·재고는 확인하지 않았다.
삭제 전파, 로컬 기록 상한 손실, 일반 outbox/v2 sync, PurchaseCase 이전, 복원 epoch와 CI는 후속 작업이다. 현재 결과로 플랫폼 출시 완료나 사업성 점수를 확정하지 않는다.

이어받을 때는 [개발 인계](developer-handover.md), [설계 결정](architecture-decisions.md), [운영 절차](operations-runbook.md), [다음 구현 순서](system-design-alpha.md)를 함께 읽는다.
