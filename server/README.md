# 서버 v0.1 (M5) — Spring Boot 4.1.1 · Java 21 · PostgreSQL 16

개인판 앱(`../app`)의 옷장 파일(스키마 2)과 상품 목록(스키마 1)을 그대로 저장하고, 같은 규칙(판정·코디·비교·상품 순위)을 서버에서도 낸다.
로컬 PC 에서 0원으로 돈다(Docker 의 PostgreSQL + 로컬 JVM). 외부 서비스에 요청하지 않고, 사진은 비공개 로컬 폴더에만 둔다. AI 를 쓰지 않는다.

## 검증 상태 (2026-10-12, 정직하게)

| 항목 | 상태 |
|---|---|
| `domain` 패키지(규칙·정리·상태 전이·내보내기, 의존성 없는 순수 Java) | **컴파일·실행 확인.** `GoldenParity`: 앱(JS)의 골든 스냅샷(`app/test/golden/sample-results.json`, 판정 12건·코디 10건·비교 5건)과 상품 순위 스냅샷(`src/test/resources/golden/catalog-rank.json`, 4종 순위·상품→후보 7건·재확인 판정)이 **모두 일치**. `DomainChecks` 25개 단언 통과. 규칙을 일부러 바꾸면(예: 밝기 문턱) 차이가 잡히는 것도 확인 |
| `V1__init.sql` 스키마 | **PostgreSQL 16.15 에 적용 확인.** 제약 시험: 확인 기록 없는 "확인됨" 거부, 내 사진 상태에 product 거부, 같은 client_id 중복 거부, 후보 6번째 자리 거부, 빈 후보 거부, 멱등 키 중복 거부 — 모두 기대대로. (item_id, position) 유일 제약은 Hibernate 플러시 순서(insert 가 delete 보다 먼저) 때문에 두지 않았다 |
| Spring 계층(`api`, `persistence`, `service`, `store`), `pom.xml`, `ApiFlowTest` | **컴파일·실행 미실행.** 작업 환경에서 Maven Central(repo.maven.apache.org)이 프록시에 막혀 의존성을 받을 수 없었다. 네트워크가 되는 곳에서 `mvn -q test` 를 먼저 돌려 컴파일 오류를 잡아야 한다(Spring Boot 4 의 바뀐 패키지·스타터 이름은 공식 문서로 확인해 썼다: `spring-boot-starter-webmvc`, `org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc`, Testcontainers 2.0.5 `org.testcontainers.postgresql.PostgreSQLContainer`) |

의존성 없이 지금 확인할 수 있는 것(JDK 21 + Maven 배포판의 gson):

```bash
cd server
B=/tmp/otjang-build; GSON=$(ls /opt/apache-maven-*/lib/gson-*.jar 2>/dev/null || ls ~/.m2/repository/com/google/code/gson/gson/*/gson-*.jar | head -1)
javac -nowarn -cp $GSON -d $B $(find src/main/java/otjang/domain -name "*.java") src/test/java/otjang/domain/GoldenParity.java src/test/java/otjang/domain/DomainChecks.java
java -Dstdout.encoding=UTF-8 -cp $GSON:$B otjang.domain.GoldenParity ..     # 앱과 규칙 결과가 같은지
java -Dstdout.encoding=UTF-8 -cp $B otjang.domain.DomainChecks               # 상태 전이·내보내기 규칙
psql -d otjang_test -f src/main/resources/db/migration/V1__init.sql          # 스키마
```

## 실행 (네트워크가 되는 PC)

```bash
cd server
docker compose up -d            # PostgreSQL 16 (otjang/otjang, DB otjang)
mvn -q test                     # 단위(골든 회귀·상태 전이) + ApiFlowTest(Testcontainers, Docker 필요)
mvn spring-boot:run             # http://localhost:8080  (Flyway 가 스키마를 만든다. JPA 는 validate 만)
curl -s http://localhost:8080/actuator/health
curl -s -X POST http://localhost:8080/api/wardrobe/import -H 'Content-Type: application/json' -H 'Idempotency-Key: first' --data-binary @../app/data/sample-wardrobe.json
curl -s http://localhost:8080/api/outfits | head -c 600
```

환경 변수: `OTJANG_DB_URL`, `OTJANG_DB_USER`, `OTJANG_DB_PASSWORD`, `OTJANG_PORT`, `OTJANG_PHOTO_DIR`(사진 폴더, 기본 `./data/photos`, 저장소에 넣지 않음), `OTJANG_CORS_ORIGINS`(기본 `*`, 로컬 전용. 공개 배포 시 좁힌다).

## API

모두 JSON. 옷·상품의 `id` 는 앱(파일)의 id 그대로다(`client_id`). 오류는 RFC 9457 ProblemDetail.

| 메서드·경로 | 하는 일 |
|---|---|
| `GET /api/wardrobe?photos=` | 저장된 상태 전체(보유·후보·처분, 판정 기록, 주인). 앱이 그대로 읽을 수 있는 모양 |
| `POST /api/wardrobe/import` (+ `Idempotency-Key`) | 옷장 파일(스키마 1·2) 가져오기. 같은 id 는 덮어쓴다. 같은 키+같은 내용 → 저장된 결과 재생(`Idempotent-Replayed: true`), 같은 키+다른 내용 → 409 |
| `GET /api/wardrobe/export?img&otherImg&cands&price&body&log` | 옷장 파일(스키마 2) 내보내기. 보유 옷만. 기본: 내 사진만 포함, 남의 상품 사진·후보·가격·체형·기록 제외(앱과 같은 기본값) |
| `GET/PUT /api/wardrobe/owner` | 주인(닉네임·키·사이즈) |
| `GET /api/items?photos=`, `GET/POST/PUT/DELETE /api/items/{id}` | 옷 한 벌. 본문은 옷장 파일의 옷 모양. 모르는 항목은 버리고 빠진 항목은 기본값(앱의 cleanItem 과 같다) |
| `PUT /api/items/{id}/photo/own` `{img}` | 내 사진 넣기·바꾸기 |
| `PUT /api/items/{id}/photo/product` `{kind: substitute\|candidate, img, sourceName, sourceUrl, brand, name, evidence, note}` | 상품 사진 임시 걸기. `confirmed` 는 여기서 만들 수 없다(400) |
| `DELETE /api/items/{id}/photo/product` | 상품 사진 떼기(내 사진으로 돌아감, product 삭제) |
| `POST /api/items/{id}/confirm` `{brand, name, code, img, sourceName, sourceUrl, at}` / `DELETE …/confirm` | 사용자가 "같은 상품"이라고 확인 / 취소 |
| `POST /api/items/{id}/candidates`, `DELETE …/candidates/{index}` | 미확인 후보 더하기·빼기 |
| `PUT /api/items/{id}/look3d` `{kind, fabric}`, `PUT …/attr-source` `{attrSource}` | 3D 형태, 속성 출처 |
| `POST /api/judge` `{candidate: {…} \| itemId, season}` | 살까 말까 판정(겹침·새 조합·대표 3개·걸리는 점·필요한 옷·초안 옷 표시) |
| `GET /api/outfits?season=&exclude=&n=` | 코디 추천 |
| `POST /api/compare` `{theirs: 옷장 파일 \| "template", season}` | 옷장 비교 |
| `GET /api/catalog`, `POST /api/catalog/import` | 상품 목록 파일(스키마 1) 내보내기·가져오기(멱등) |
| `GET/POST/PUT/DELETE /api/catalog/products[/{id}]` | 상품(사람이 직접 넣는다) |
| `GET /api/catalog/rank?season=&gaps=template\|none&staleDays=` | 목록 안 상품 순위(조합·겹침·빈틈, 재확인 필요 표시) |
| `POST /api/catalog/products/{id}/candidate` | 상품을 살까 말까 후보(옷)로 |
| `GET/POST/DELETE /api/decisions[/{id}]` | 판정 기록 |

## 설계와 판단 근거

- **같은 규칙, 두 언어**: 규칙은 `domain` 패키지에 의존성 없는 순수 Java 로 두고, 앱(JS)의 골든 스냅샷과 교차 검증한다(`GoldenParityTest`). 규칙을 바꾸면 양쪽을 함께 바꾸고 `node app/tools/golden.mjs`, `node server/tools/gen-rank-golden.mjs` 로 스냅샷을 다시 만든다. [제안] 포트폴리오 원칙("핵심 도메인 규칙은 사용자가 직접 쓴다")을 지키려면 이 패키지를 사용자가 다시 쓰고, 골든 회귀로 같음을 보이면 된다 — 테스트가 안전망이다.
- **불변식을 DB 가 다시 지킨다**: 확인된 동일 제품 ↔ 확인 기록, 상품 사진 상태가 아니면 출처 없음, 후보 최대 5개, 같은 옷은 owner 당 하나(`client_id`). 정리 함수(`WardrobeCleaner`)가 올려 주지 않는 상태를 DB 도 받지 않는다.
- **사진은 DB 밖**: `PhotoStore` 인터페이스 뒤의 비공개 로컬 폴더(내용 해시 이름, 같은 사진은 한 번만). 클라우드 저장은 필요해진 뒤 같은 인터페이스 뒤에 붙인다(10-10 설계 결정). 외부로 보내지 않는다.
- **멱등 가져오기**: `(owner, Idempotency-Key)` 유일 영수증 + 요청 본문 해시. 같은 키·같은 내용은 재생, 다른 내용은 409. 키가 없어도 `(owner, client_id)` 유일 제약으로 중복이 생기지 않는다. 외부 서비스까지의 exactly-once 를 주장하지 않는다.
- **스키마는 Flyway 만**: `ddl-auto: validate`. 엔티티와 SQL 이 어긋나면 기동 때 실패한다.
- **한 사람(owner 1)**: 계정·로그인 없음(로컬 전용). 모든 표에 `owner_id` 가 있어 여러 사용자로 넓힐 때 스키마를 갈아엎지 않는다. 공개 배포 전에는 인증과 CORS 제한이 필요하다.
- **없는 것**: 상품 자동 수집·가격 조회(0원 원칙과 이용 조건 미확인 — `docs/data-sources-2026-10-12.md`), 생성 작업 표(job/lease/예산 예약 — 실사 착장 M6 가 열릴 때), 자연어·임베딩 검색(pgvector 는 필요가 생기면), 충돌 병합(지금 받기는 "서버 내용으로 바꾸기", 보내기는 "같은 id 덮어쓰기"이고 서버에서 지운 옷은 받기 전까지 앱에 남는다).

## 파일

| 경로 | 내용 |
|---|---|
| `src/main/java/otjang/domain/` | `Vocab`(어휘), `Garment`(규칙이 보는 필드), `Item`·`Wardrobe`·`CatalogProduct`(기록), `Sanitize`·`WardrobeCleaner`(정리·옮기기), `Recommend`·`Judge`·`CatalogRank`(규칙), `WardrobeOps`(상태 전이·내보내기) |
| `src/main/java/otjang/persistence/` | JPA 엔티티와 저장소(owner, item, item_match_candidate, decision, catalog_product, import_receipt) |
| `src/main/java/otjang/service/` | `WardrobeService`(가져오기·내보내기·상태 바꾸기), `CatalogService`, `TemplateService`(기본 옷장 초안), `ItemMapper`, `Json` |
| `src/main/java/otjang/api/` | 컨트롤러 5개, `ApiException`·`ApiExceptionHandler`(ProblemDetail), `WebConfig`(CORS), `Bodies` |
| `src/main/java/otjang/store/` | `PhotoStore`, `LocalDirPhotoStore` |
| `src/main/resources/db/migration/V1__init.sql` | 스키마 (주석에 불변식) |
| `src/main/resources/data/template-ivy.json` | 기본 옷장 초안(`app/data/template-ivy.json` 의 복사본. 바꿀 때 함께) |
| `src/test/java/otjang/domain/` | `GoldenParity`(main 으로도 돈다), `DomainChecks`, `GoldenParityTest` |
| `src/test/java/otjang/ApiFlowTest.java` | 끝까지 흐름(Testcontainers) — 미실행 |
| `tools/gen-rank-golden.mjs` | 상품 순위 스냅샷 생성(앱 코드로) |
| `docker-compose.yml` | 로컬 PostgreSQL 16 |

## 다음

1. 네트워크가 되는 PC 에서 `mvn -q test` → 컴파일 오류·테스트 실패를 고친다(가장 먼저).
2. 앱 쪽 "내 서버와 맞추기"(기록 탭, v0.4.3)는 만들었다: 보내기 = `POST /api/wardrobe/import`·`/api/catalog/import`(내용 해시 Idempotency-Key), 받기 = `GET /api/wardrobe?photos=true`·`GET /api/catalog`. 흉내 서버로만 확인했으므로 **실제 서버를 켜고 앱에서 보내기·받기를 한 번 해 보는 것**이 1번 다음 할 일이다(CORS: 파일로 연 앱의 origin 은 "null" — `otjang.cors-origins=*` 로 허용되는지 확인).
3. 사용자가 `domain` 규칙을 직접 다시 쓰기(포트폴리오 원칙) — 골든 회귀가 같음을 보여 준다.
4. M6(실사 착장)이 열리면 작업 표(상태 전이·lease·재시작 복구·예산 예약)와 Python 워커 어댑터.
