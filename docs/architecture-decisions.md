# 설계 선택과 다시 검토할 조건

기준일: 2026-10-13. 실제 소스의 선택과 Claude Opus 5.5의 후속 설계 제안을 구분한다. `현재`와 `이번 구현`은 코드 구조, `제안`은 후속 설계다. 자동 검증 결과는 [검증 기록](verification-2026-10-13.md)을 따르며 실제로 하지 않은 토론·승인·측정을 합의로 기록하지 않는다.
읽기 연결: [개발자 인수인계](developer-handover.md), [알파 실행 순서](system-design-alpha.md), [서버 현재 계약](../server/OPERATIONS-BETA.md). 최초 Claude 검토는 `76eb156` 소스 기준이었으며 당시 실행 없는 점수는 현재 코드 평가로 재사용하지 않는다.

## ADR-01 · 기존 PWA와 Spring/PostgreSQL 유지

- **문제:** 제품 흐름을 확장하면서도 반품 손실·동기화 계약을 먼저 고쳐야 한다.
- **고른 것:** 현재 PWA/HTML·JS와 Spring Boot 4.1.1/Java 21/PostgreSQL 16 유지. identity/wardrobe/purchase/catalog/evidence/sync/ops의 모듈 경계 강화는 제안이다.
- **대안 보류:** React·네이티브 전면 재작성이나 마이크로서비스 분리는 데이터 계약 결함을 바로 해결하지 않고 배포·트랜잭션 경계를 늘린다.
- **비용·제약:** app.html에 상태·화면 책임이 모여 있다. 서버는 단일 프로세스 운영과 owner 단위 잠금의 한계를 갖는다.
- **코드 근거:** [build.mjs](../app/build.mjs), [pom.xml](../server/pom.xml), [OtjangApplication](../server/src/main/java/otjang/OtjangApplication.java).
- **검증 범위:** 서버 라이브러리 컴파일·PostgreSQL 테스트 확인. 실제 기기 성능·운영 확장성은 미검증이다.
- **재검토 조건:** 측정된 성능 병목, OS 공유 기능 요구, 독립 배포 필요가 생길 때 해당 경계만 비교한다.

## ADR-02 · 순수 규칙과 JS/Java 교차 검증

- **문제:** 서버 없는 계산과 서버 API 계산이 같은 입력에 다른 판단을 내릴 수 있다.
- **고른 것:** 현재 판정·코디·상품 순위의 핵심 규칙을 순수 모듈에 두고 골든 결과로 교차 비교한다.
- **대안 보류:** 모든 계산을 서버 호출로 옮기면 로컬 사용이 네트워크에 의존한다. 공통 WASM/별도 규칙 서비스를 도입할 근거는 아직 없다.
- **비용·제약:** 두 언어의 코드와 어휘를 함께 유지해야 한다. `needs.js`·편집 추천 `pick.js` 전체에 대응 Java가 있는 것은 아니다.
- **코드 근거:** [judge.js](../app/src/judge.js), [domain/](../server/src/main/java/otjang/domain/), [GoldenParityTest](../server/src/test/java/otjang/domain/GoldenParityTest.java).
- **검증 범위:** 골든 사례의 결과 일치는 확인한다. 그것이 추천 정확도나 사용자 취향 적합성을 증명하지는 않는다.
- **재검토 조건:** 언어 간 누락이 반복되거나 규칙 변경 비용이 실제 병목이 되면 공통 표현을 평가한다.

## ADR-03 · 모름·속성 초안·상품 동일성 분리

- **문제:** 대충 찍은 사진이나 비슷한 상품 이미지에서 브랜드·품명·속성을 확정하면 잘못된 비교가 된다.
- **고른 것:** 현재 모르는 값은 비워 두고 `assessment`로 보류/부분 판단한다. 색 초안과 사용자 확인, 상품 후보와 동일 상품 확인을 구분한다.
- **대안 보류:** 사진만으로 브랜드·상품명·핏을 자동 확정하는 기능은 근거와 검증이 없다. 기본 유료 AI 호출도 사용자 결정 없이 넣지 않는다.
- **비용·제약:** 사용자 확인 단계가 필요하고 초반 추천 범위가 좁아질 수 있다. 사진 품질 안내는 범용 상품 식별·블러 측정 모델이 아니다.
- **코드 근거:** [wardrobe.js](../app/src/wardrobe.js)의 `assessment`/사진 전이, [photo-intake.js](../app/src/photo-intake.js), [judge.js](../app/src/judge.js).
- **검증 범위:** `readiness`·`intake-integration`·`colorguess` 및 Java `UnknownAssessmentTest`가 계산 경계를 확인한다. 실제 사진 품질은 별도 확인이다.
- **재검토 조건:** 허용된 모델/상품 근거와 실사진 평가가 마련되면 동의·비용·실패 시 모름 처리를 포함해 제안한다.

## ADR-04 · API 거부와 로컬 정규화의 경계

- **문제:** 서버 cleaner가 알 수 없는 반품 결과를 null로 정리하면 성공 응답 뒤 기록이 사라진다.
- **고른 것:** 이번 계약 2는 의미 있는 잘못된 값을 API에서 422로 거부한다. 오래된 로컬 자료의 빠진 키·해당하지 않는 enum은 정규화한다.
- **대안 보류:** 모두 조용히 정리하면 데이터 손실이 성공으로 보인다. 반대로 모든 옛 파일을 거부하면 정상 백업 호환성을 잃는다.
- **비용·제약:** 로컬 cleaner와 서버 validator의 차이를 명시해야 한다. 높은 파일 스키마는 cleaner 호출 전에 차단한다. 날짜는 실제 달력의 날짜 정밀도를 유지한다.
- **코드 근거:** [FollowupWriteValidator](../server/src/main/java/otjang/api/FollowupWriteValidator.java), [wardrobe.js](../app/src/wardrobe.js), [beta.js](../app/src/beta.js), [공유 fixture](../contracts/followup-contract.json).
- **검증 범위:** 88개 유효/정규화/거부 사례와 API 코드/path, 무변경 검사를 포함한다. 전체 동기화 UI 통과는 아직 별도다.
- **재검토 조건:** 새 outcome·enum·스키마 도입 시 서버 확장·클라이언트 이전·구버전 보호 순서를 다시 정한다.

## ADR-05 · 추가 전용 DB 확장과 DB 불변식

- **문제:** 앱/API 검사를 빠뜨려도 기존 기록과 후속 필드 조합을 DB가 지켜야 한다.
- **고른 것:** V8은 반품 outcome과 두 enum 열을 추가하고 기존 날짜·메모를 보존한다. enum 범위·조건·NULL 존재 관계를 check로 제한한다.
- **대안 보류:** 기존 날짜에 가짜 시각을 채우거나 실행된 V5를 편집하지 않는다. PurchaseCase 이전의 시간 정밀도 설계는 별도 변경이다.
- **비용·제약:** 새 필드 없는 기존 후속 기록은 `unknown`이다. 제약과 정리기를 함께 바꾸고 이전된 행의 무손실을 확인해야 한다.
- **코드 근거:** [V8](../server/src/main/resources/db/migration/V8__followup_contract_two.sql), [DecisionEntity](../server/src/main/java/otjang/persistence/DecisionEntity.java), [ItemMapper](../server/src/main/java/otjang/service/ItemMapper.java).
- **검증 범위:** PostgreSQL에서 V7→V8 이전과 잘못된 조합 거부를 검사했다. 운영 DB 이전·롤백·복구 실행은 별도다.
- **재검토 조건:** 새로운 계약을 추가할 때 먼저 expand와 이전 계획을 마련하고 기존 행·구버전의 동작을 확인한다.

## ADR-06 · 브라우저 저장의 현재 형태와 단계별 정본

- **문제:** 개인 사용은 서버 없이 가능해야 하고, 로그인 계정·저장 실패로 자료가 섞이거나 오래된 복사본이 올라오면 안 된다.
- **고른 것:** IndexedDB 상태 JSON을 계정별 마지막 성공 원문과 비교한 뒤 저장한다. 같은 탭은 직렬화하고, 다른 탭은 CAS와 Web Lock으로 비교한다. 검증된 읽기 뒤 쓰기만 실패한 경우 localStorage로 복구한다. 계정 키는 origin+인증 ownerId다. 알파는 브라우저 우선, 베타의 서버 정본/cache/outbox는 제안이다.
- **대안 보류:** 지금 모든 로컬 기록을 서버 정본이라고 선언하거나 DB 실패를 메모리 성공으로 숨기지 않는다. 사진/outbox의 별도 store 분리는 후속이다.
- **비용·제약:** 저장 시 전체 상태와 data URL을 다시 쓴다. revision만 비교하면 같은 번호의 다른 자료를 놓치므로 원문도 비교한다. 읽기 실패를 빈 값으로 낮추거나 충돌을 대체 저장으로 우회하지 않는다. Web Lock 없는 LS 쓰기는 중단하고 전체 파일 보관을 안내한다.
- **코드 근거:** [storage-cas.js](../app/src/storage-cas.js), [app.html](../app/src/app.html)의 `load`/`save`, [beta-ui.js](../app/src/beta-ui.js)의 `accountScope`/`enterAccount`.
- **검증 범위:** helper 14개와 실제 save/직전 저장 검사 함수 6개를 합성 어댑터로 검증했다. 실제 브라우저·물리적 두 탭 실행은 미검증이다.
- **재검토 조건:** 사진 크기·저장 지연·동시 수정이 측정되거나 비공개 베타를 시작할 때 별도 photos/outbox와 서버 정본 전환을 검증한다.

## ADR-07 · exact ack와 followup 3방향 비교

- **문제:** 손실 가능한 pull을 항상 막으면 정상 정정을 받지 못한다. meta 지원만 믿고 교체하면 미전송 로컬 수정을 잃는다.
- **고른 것:** baseline은 정확히 성공한 전송 본문/받은 스냅샷으로 만든다. 판정별 followup의 base/local/remote를 비교하고 진짜 충돌과 명시적 null 정정은 사용자가 직접 선택한다. 완전한 pull만 원격 부재를 증명한다. 기준점 없는 복구는 이 기기 값 유지 선택만 허용한다. 재로그인 후 `syncStamp`가 누락·무효여도 같은 origin·인증 owner의 유효한 ack가 있으면 그 `serverVersion`을 보내기 기준으로 복구한다.
- **대안 보류:** 자동 LWW와 기기 날짜 순서, 무조건 교체, 무조건 차단을 선택하지 않는다. 첫 변경에서 일반 필드 병합·outbox까지 확장하지 않는다.
- **비용·제약:** 적용 직전 재검사·정규형 fingerprint·저장 실패·baseline 무효화를 처리해야 한다. 알려진 ack revision 7을 최신 조회 revision 8로 바꾸면 다른 기기의 정정을 덮어쓸 수 있어 이전 기준을 유지하고 409로 멈춘다. 다른 계정·출처·손상 ack는 기준으로 사용하지 않는다. 서버 복원 epoch는 후속이며 누락을 삭제로 추정하지 않는다.
- **코드 근거:** [sync.js](../app/src/sync.js)의 ack/merge 함수, [app.html](../app/src/app.html)의 sync/확인 화면, [sync.test.cjs](../app/test/sync.test.cjs).
- **검증 범위:** 계약/병합과 실제 sync 함수의 합성 HTTP 회귀를 전체 Node 테스트에 포함했다. 실제 상태 정리·계정 진입을 거치는 재로그인 회귀를 더해 `sync-flow.test.cjs` 7개와 전체 188개를 확인했다. 정상 stamp는 기존에도 보호했고 누락·무효 stamp 예외를 수정했다. 실제 충돌 UI·두 기기 E2E 통과를 주장하지 않는다.
- **재검토 조건:** tombstone/변경 피드가 준비되면 이 임시 경계를 엔티티별 변경 적용으로 이전한다.

## ADR-08 · 조건부 쓰기·멱등과 동기화 원자성

- **문제:** 오래된 전체 상태의 덮어쓰기와 같은 import 재시도가 중복 데이터를 만들 수 있다.
- **고른 것:** 현재 owner 행 잠금/트랜잭션, If-Match, 응답 revision, owner+멱등 키/본문 해시 영수증을 쓴다. 계약 헤더 검사는 업무 변경·영수증 처리보다 먼저 한다.
- **대안 보류:** 무조건 덮어쓰기는 손실을 만든다. 현재 두 import를 v2 원자 묶음이라고 부르지 않는다. 후속 v2는 전부 성공/전부 롤백과 성공 시만 영수증을 제안한다.
- **비용·제약:** 서로 다른 엔티티의 수정도 owner 버전 충돌이 날 수 있다. wardrobe 성공 후 catalog 실패 가능성과 타임아웃 후 결과 불확실성이 남는다. 외부 exactly-once는 보장하지 않는다.
- **코드 근거:** [AuthenticatedRevisionFilter](../server/src/main/java/otjang/security/AuthenticatedRevisionFilter.java), [RevisionService](../server/src/main/java/otjang/service/RevisionService.java), [WardrobeService](../server/src/main/java/otjang/service/WardrobeService.java).
- **검증 범위:** API·동시성·오류 롤백·영수증 검사를 서버 테스트에서 확인했다. v2 sync/outbox/삭제 전파는 미구현이다.
- **재검토 조건:** 기기간 사용을 확대하기 전에 엔티티 version, op/batch 영수증, tombstone과 오프라인 재시도를 함께 검증한다.

## ADR-09 · 인증 owner 격리와 비공개 사진 수명

- **문제:** 계정 자료·개인 사진은 다른 계정에서 읽을 수 없어야 하고 실패한 저장 뒤 파일만 남을 수 있다.
- **고른 것:** 현재 초대 가입, BCrypt, 해시 bearer 세션, 인증 owner 조회, 비공개 `PhotoStore`를 사용한다. `PhotoLifecycle`이 잠금·참조·할당량·커밋/롤백 뒤 수거를 조정한다.
- **대안 보류:** 공개 사진 URL·클라이언트 ownerId 신뢰·평문 세션 저장을 사용하지 않는다. 객체 저장소와 다중 인스턴스 제한은 베타 이후 제안이다.
- **비용·제약:** DB와 파일을 함께 백업해야 한다. 강제 종료 고아 파일의 주기적 수거, 비밀번호 복구·기기 세션 관리·공유 rate limit은 남아 있다.
- **코드 근거:** [OwnerScope](../server/src/main/java/otjang/security/OwnerScope.java), [AuthService](../server/src/main/java/otjang/security/AuthService.java), [PhotoLifecycle](../server/src/main/java/otjang/store/PhotoLifecycle.java).
- **검증 범위:** 합성 계정 격리와 사진/API 테스트를 실행했다. 외부 보안 검토·실제 운영 장애·복구 검증은 수행 완료로 표시하지 않는다.
- **재검토 조건:** 비공개 베타 운영·복수 서버·스토리지 이동 전에 격리/삭제/복구 계약을 다시 검증한다.

## ADR-10 · 백업 범위를 구분하고 엄격히 복원

- **문제:** 공유 파일·브라우저 백업·서버 백업의 범위가 달라 복원 후 일부 기록이 없을 수 있다.
- **고른 것:** 현재 형식을 구분하고 높은 스키마는 사전 거부한다. 정상 옛 필드 누락은 알려진 기본값만 채우며 손상 자료를 조용히 일부 복원하지 않는다. 서버 restore는 확인·If-Match·트랜잭션을 요구한다.
- **대안 보류:** 공유 export를 전체 백업으로 쓰거나 복원 범위가 같다고 주장하지 않는다. 복원 전 snapshot/되돌리기와 통합 백업은 후속이다.
- **비용·제약:** 서버에는 pickLog/prefs/rack/others가 없어 브라우저 백업도 필요하다. 사용자 백업은 인증·세션·영수증이나 운영 DB/파일 복구를 대체하지 않는다.
- **코드 근거:** [beta.js](../app/src/beta.js), [TenantDataService](../server/src/main/java/otjang/service/TenantDataService.java), [백업 계약](../server/OPERATIONS-BETA.md#전체-백업과-계정-삭제).
- **검증 범위:** 옛 schema 2와 API backup/restore·거부 검사가 있다. 운영 덤프·사진의 빈 환경 복구, 복구 목표 시간은 미확인이다.
- **재검토 조건:** PurchaseCase/outbox/사진 저장소 변경 때 백업 범위·이전·되돌리기를 함께 갱신한다.

## ADR-11 · 실제 상품과 가격 근거를 입력 데이터에 한정

- **문제:** 사용자는 구체적인 브랜드·상품명·가격·추천 이유·구매 링크를 원하지만 자동 수집과 전체 시장 최저가는 미완료다.
- **고른 것:** 현재 편집/사용자 입력 상품의 출처·확인일·가격·사이즈 근거를 사용한다. 빌드가 카탈로그 구조/만료를 검사하고 재확인 실패 시 확인일을 갱신하지 않는다.
- **대안 보류:** 이름 유사성으로 동일 상품 확정, 없는 상품 생성, 검증 범위 밖 최저가 표현을 하지 않는다. 공식/제휴 수집의 현재 조건은 별도 확인한다.
- **비용·제약:** 목록 범위와 수동 확인에 추천이 제한된다. 후속 Product/Variant/Offer/Snapshot 구조와 판매처 조건 검증이 필요하다. 예전 공급자 조사 결과를 현재 정책으로 확정하지 않는다.
- **코드 근거:** [picks.json](../app/data/picks.json), [pick.js](../app/src/pick.js), [validate-catalog.mjs](../app/tools/validate-catalog.mjs), [recheck.mjs](../app/tools/recheck.mjs).
- **검증 범위:** 구조·만료·실패 날짜 보존은 자동 검사 대상이다. 상품 원문의 사실성, 결제 가능 재고/최종 가격은 판매처와 실사용 확인이 필요하다.
- **재검토 조건:** 허용된 공급 데이터·가격 조건·재확인 운영이 마련되면 상품 동일성과 offer별 출처를 분리해 도입한다.

## ADR-12 · 3D 경험 유지와 실사 핏 주장 제한

- **문제:** 공간에서 옷을 보고 싶은 비전과 현재 형태 자산의 표현 수준 사이에 차이가 있다.
- **고른 것:** 현재 Blender로 구운 방·옷 형태/빛/원단과 Three.js 표시를 유지한다. 종류로 그린 모습과 실제 상품·실사 착장을 구분한다.
- **대안 보류:** 데이터 계약 우선 작업을 3D 비전 폐기로 해석하지 않는다. 사진 한 장에서 실제 상품 형태·소재·정확한 핏을 재현한다고 주장하지 않는다.
- **비용·제약:** 지원 형태·자리·자산 크기가 제한되고 구운 빛은 천 흔들림에 따라 변하지 않는다. 시각 품질과 실제 모바일 성능은 별도 개선·측정 대상이다.
- **코드 근거:** [closet/index.js](../app/src/closet/index.js), [cloth.js](../app/src/closet/cloth.js), [Blender 제작 안내](../blender/README.md), [build.mjs](../app/build.mjs).
- **검증 범위:** 자산 포함/분리 빌드와 코드 검사는 표현의 설득력·핏 정확도를 입증하지 않는다. 실제 기기와 사용자 시각 평가가 남아 있다.
- **재검토 조건:** 품질 목표·비교 장면·기기 성능 기준을 정한 뒤 자산 개선, 2D 착장, 3D 표현의 역할을 사용자와 평가한다.

## ADR-13 · 구매 저장의 완료와 보상

- **문제:** 비동기 저장 실패를 기다리지 않고 완료를 알리면 구매 기록·보유 옷·화면이 실제 저장소와 달라진다. 기다리는 동안 다른 편집과 계정 전환도 일어날 수 있다.
- **고른 것:** 구매 버튼이 `saveBought`를 await하고 같은 계정·state의 중복 요청을 막는다. 저장 성공 뒤 해당 구매와 UI가 아직 유효할 때만 완료·초점 이동을 적용한다. 실패는 시도한 값과 동일한 구매 필드·객체만 되돌린다.
- **대안 보류:** 전체 이전 snapshot을 덮어쓰면 대기 중 다른 편집·새 계정·받은 자료를 잃는다. UI를 먼저 완료하거나 실패를 성공 토스트로 숨기지 않는다.
- **비용·제약:** 뒤의 고정 저장 큐가 잠정 구매를 포함하면 같은 계정의 수정된 사본을 마지막에 보상 저장한다. import-add가 배열을 바꾸며 같은 잠정 객체를 공유한 경우도 그 객체만 복구한다. 보상 저장까지 실패하면 저장소에 잠정 구매가 남을 수 있어 전체 백업·상태 확인을 안내한다. 이 동작을 원자적 저장이나 일반 outbox로 부르지 않는다.
- **코드 근거:** [app.html](../app/src/app.html)의 `saveBought`/구매 버튼/`save`, [purchase-persistence.test.cjs](../app/test/purchase-persistence.test.cjs).
- **검증 범위:** 실제 함수와 버튼·저장 큐를 합성 환경에서 실행한 회귀 15개, 최신 전체 Node 203개와 기본·모바일 빌드를 확인했다. 실제 브라우저·물리적 두 탭은 미검증이다.
- **재검토 조건:** 실패·다중 동작의 실제 브라우저 재현을 확인하고 구매 상태를 PurchaseCase로 통합할 때 작업 단위와 영속 보상/outbox를 함께 검토한다.

## 구현 주체와 다음 설계

사용자가 사업·제품·시스템 검토를 Claude Opus 5.5에, 기능 구현을 Codex에 맡겼다. 위 코드와 문서는 AI가 작성·검토한 부분을 포함한다. 자동 테스트의 통과와 사용자 효용·사업 가설 검증은 구분한다.
PurchaseCase의 현재 상태 행+append-only 이벤트, 상태 변경의 `expectedCaseVersion`, 서버 `server_seq` 순서, 날짜 정밀도 보존은 후속 제안이다. 지금의 pickLog/decisions를 이미 통합했다고 기록하지 않는다.
선택을 바꿀 때는 이 파일에 문제를 바꾼 사실·대안·측정/검증·이전 계획을 남긴다. 새 테스트·CI·배포·실사용의 증거가 없으면 점수나 출시 준비도를 높여 적지 않는다.
