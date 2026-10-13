# 운영·복구 인수인계

기준일: 2026-10-13. 대상: 이 저장소의 개인판 앱과 초대 계정 서버. 프로젝트 소유자가 개발·운영을 이어갈 때 사용하는 절차다. 현재는 로컬 알파이며 공개 운영을 시작한 상태가 아니다.

이 문서는 실제 소스가 지원하는 실행 방법을 설명한다. 아래 기동·백업·복구 명령을 문서 작성 중 사용자 서버에 실행하지 않았다. 실행한 검증과 아직 실행하지 않은 절차는 마지막의 검증 표로 구분한다. 과거 README의 인증 없는 API 예시나 CORS `*` 설명보다 이 문서와 [현행 서버 계약](../server/OPERATIONS-BETA.md)을 우선한다.

설계 선택과 이유는 [시스템 설계](system-design-alpha.md), [설계 결정](architecture-decisions.md), 코드 변경 방법은 [개발 인수인계](developer-handover.md)를 함께 읽는다. 기본 비용은 0원이며 외부 AI·유료 저장소·상품 수집 서비스가 자동으로 연결되지 않는다.

## 1. 먼저 어느 환경을 다루는지 확인한다

| 환경 | 자료와 계정 | 실행·운영 경계 |
| --- | --- | --- |
| 개인판 HTML | 해당 브라우저의 옷·사진·추천 기록. 서버 로그인 없이 사용 가능 | 파일 또는 정적 사이트를 여는 것만으로 서버 자료가 생기지 않는다 |
| 공개 모바일 디자인 미리보기 | 빈 옷장으로 시작, 해당 브라우저에만 저장. `eoul.mobile-preview` 저장소 사용 | `build:mobile`은 계정 동기화를 제공하지 않는다. 로그인 서버의 배포나 PC 자동 동기화를 뜻하지 않는다 |
| 로컬 초대 계정 베타 | 로그인 계정별 브라우저 사본 + 별도 PostgreSQL + 비공개 사진 폴더 | `local-beta.mjs`가 loopback 주소로 실행. 보내기·받기를 직접 누를 때 서버와 교환 |
| staging | 별도 DB·사진 폴더·초대 코드·인증서·합성 계정 필요 | 구성 제안. 현재 staging 배포와 복구 훈련은 미실행 |
| production | staging과 분리한 DB·사진·비밀값·도메인 필요 | production 프로필은 구현되어 있으나 실제 서비스 배포·운영 검증은 미실행 |

운영 대상의 Git SHA, 브랜치, 앱 URL, DB 식별자, 사진 폴더, 백업 위치를 비공개 운영 기록에 적는다. 비밀번호·토큰·초대 코드·개인 사진·옷장 원본은 그 기록의 공개 사본에도 넣지 않는다. 새 checkout을 만드는 것은 기존 베타 DB를 옮기는 작업과 다르다. 런처의 설정은 생성 당시 프로젝트 경로에 연결되므로 다른 checkout에서 기존 `runtime.json`을 그대로 사용하면 거부한다.

```bash
# 프로젝트 루트에서 실행하는 읽기 명령
git -c core.fsmonitor=false -c core.untrackedCache=false status --short
git -c core.fsmonitor=false -c core.untrackedCache=false rev-parse HEAD
node --version
java -version
mvn --version
docker version
```

기대 결과: 작업 SHA를 식별하고 Node 22 이상, Java 21, Maven, 실행 중인 Docker를 확인한다. 저장된 변경이 있거나 다른 환경의 DB인지 확인할 수 없으면 update·restore를 진행하지 않는다. fsmonitor 옵션은 일부 로컬 환경의 Git 조회 지연을 피하기 위한 것이며 코드에 영향을 주지 않는다.

## 2. 처음 로컬 개발 환경을 준비한다

앱 의존성 설치, 테스트, 자산 생성은 `app/`에서 수행한다. `npm ci`는 커밋된 `package-lock.json`이 있는 기준으로 사용한다. 잠금 파일이 없는 과거 버전은 동일하게 재현되는 설치로 취급하지 않는다.

```bash
cd app
npm ci
npm test
npm run assets
npm run check:catalog
npm run build
npm run build:mobile
```

기대 결과: Node 테스트 실패 0, 자산 생성 성공, 카탈로그 검증 성공, `dist/index.html`과 `dist/mobile/index.html` 생성. `build`는 기본적으로 개인 `data/wardrobe.json`이 있으면 그것을 사용한다. 공개할 결과는 반드시 빈 자료를 명시하는 `build:mobile` 또는 `build:web`을 사용하고 생성 결과에 개인 자료가 없는지 확인한다. `dist/`는 Git 대상이 아니다.

빌드가 실패하면 이전 결과를 새 결과라고 배포하지 않는다. 빌드 스크립트는 대상의 오래된 출력 파일을 먼저 지운다. 카탈로그 유효기간 실패는 상품의 출처·가격·확인일을 실제로 재확인해야 한다. `ALLOW_STALE=1`은 개발용이며 그 결과를 출시 검증 통과로 기록하지 않는다.

서버 테스트는 `server/`에서 수행한다. Docker가 필요하며 테스트는 Testcontainers의 임시 PostgreSQL을 사용한다. 사용자의 기존 베타 DB를 테스트 DB로 지정하지 않는다.

```bash
cd server
mvn test
```

기대 결과: Maven `BUILD SUCCESS`, failures/errors/skipped 0. 최초 의존성 설치에는 네트워크가 필요하다. `-o`는 필요한 의존성이 모두 있는 경우에만 사용한다. Docker 접근 실패, 의존성 다운로드 실패, 테스트 건너뜀이 있으면 서버 검증 완료라고 기록하지 않는다. 검사 결과는 `target/surefire-reports/`에 있고 생성물은 Git에 넣지 않는다.

브라우저 검사는 별도 절차다. `npm run check`, `check:storage`, `check:import`, `check:web`, `check:a11y`, `check:perf`, `check:beta`는 Playwright·브라우저 실행 환경을 요구한다. `check:beta`의 서버 인증 검사에는 임시 QA DB와 명시적인 `BETA_QA_ALLOW_REGISTER=1`이 필요하다. 운영 계정·실제 사용자 브라우저로 이 스크립트를 실행하지 않는다. Node 테스트나 빌드 성공으로 브라우저 결과를 대신하지 않는다.

## 3. 로컬 계정 베타를 시작·종료한다

권장 진입점은 저장소 루트의 [로컬 런처](../release-tools/local-beta.mjs)다. 난수 DB 자격증명·초대 코드를 만들고, 프로젝트 라벨이 붙은 컨테이너·볼륨을 사용하며 DB 포트를 `127.0.0.1`에만 연다. `server/docker-compose.yml`은 별도 개발 예시이고 DB 포트를 모든 인터페이스에 publish하므로 로컬 베타 운영 절차와 섞어 쓰지 않는다.

```bash
node release-tools/local-beta.mjs prepare
node release-tools/local-beta.mjs start
node release-tools/local-beta.mjs status
curl --fail --silent --show-error http://127.0.0.1:18085/actuator/health
curl --fail --silent --show-error http://127.0.0.1:18085/api/meta
```

`prepare`는 빈 자료로 자체 포함 HTML을 만들고 `server/src/main/resources/static/index.html`에 놓는다. `start`는 PostgreSQL 준비를 확인한 뒤 서버를 실행하고 health `UP`까지 기다린다. 기본 앱 포트는 18085, DB 포트는 5844다. `/api/meta`의 기대값은 `contract: 2`, `wardrobeSchema: 2`, 반품·사이즈·사유 지원 어휘다. health `UP`은 기동 확인이며 구매 흐름·백업·실제 휴대폰 검증 결과가 아니다.

실행 파일을 찾지 못하면 아래 **경로 변수**를 해당 PC의 실제 설치 위치로 지정한다. 런처가 작성자가 쓰던 도구 경로도 후보로 가지고 있으므로 자동 발견을 이식성의 증거로 삼지 않는다.

| 변수 | 쓰임 |
| --- | --- |
| `OTJANG_JAVA_HOME` | Java 21 설치 폴더. 내부 `bin/java` 필요 |
| `OTJANG_MAVEN_BIN` | Maven 실행 파일의 전체 경로 |
| `OTJANG_DOCKER_BIN` | Docker CLI 실행 파일의 전체 경로 |
| `OTJANG_MAVEN_REPO` | 선택적인 Maven 의존성 캐시 경로 |
| `OTJANG_BETA_RUNTIME_DIR` | 비공개 베타 설정·로그·사진 폴더. 기본 `server/data/beta-runtime` |
| `OTJANG_BETA_APP_PORT`, `OTJANG_BETA_DB_PORT` | 설정 **최초 생성 때** 적용할 1024~65535 포트 |
| `OTJANG_BETA_START_TIMEOUT_MS` | 기동 대기 시간 60,000~600,000ms |

이미 생성한 `runtime.json`의 포트는 위 환경 변수를 바꿔도 자동 변경되지 않는다. `runtime.json`·`postgres.env`는 비밀값을 포함하므로 파일 권한 600, runtime 폴더 권한 700을 유지한다. 런처 출력은 파일 위치만 안내하며 초대 코드 원문을 출력하지 않는다. 가입할 때 그 파일을 비공개 편집기에서 확인하고 코드만 해당 입력 칸에 넣는다. 파일 전체를 채팅·이슈·스크린샷에 붙이지 않는다.

```bash
node release-tools/local-beta.mjs stop
node release-tools/local-beta.mjs status
```

기대 결과: 이 프로젝트의 Java 프로세스와 PostgreSQL 컨테이너가 정지하고 DB 볼륨·사진·설정은 보존된다. 다시 `start`하면 같은 자료를 사용한다. 다른 프로젝트의 같은 이름·라벨 불일치는 자동 삭제하지 않고 중단한다. 장애 대응에 `docker compose down -v`, `docker volume rm`, `rm -rf server/data`를 사용하지 않는다.

## 4. 로그인·보안 설정을 이해한다

현재 서버는 bearer 인증이고 세션 쿠키·Basic 인증을 사용하지 않는다. 새 계정은 새 owner를 만들며 이전 개인판 owner 1을 인수하지 않는다. DB에는 BCrypt 비밀번호 해시와 토큰의 SHA-256 해시만 저장한다. 앱 토큰은 현재 로그인 화면의 메모리에 있고 전체 백업에 포함되지 않는다.

| 서버 변수 | 개발 기본값 또는 요구 조건 |
| --- | --- |
| `OTJANG_DB_URL`, `OTJANG_DB_USER`, `OTJANG_DB_PASSWORD` | PostgreSQL 연결. production은 모두 명시 필요 |
| `OTJANG_PORT`, `OTJANG_BIND_ADDRESS` | 기본 8080, `127.0.0.1`. 런처는 자체 설정의 앱 포트를 지정 |
| `OTJANG_PHOTO_DIR` | 기본 `./data/photos`. production은 전용 비공개 절대 경로 지정 |
| `OTJANG_INVITE_CODE` | 기본 빈 값이면 가입 닫힘. 런처는 자체 난수 초대 코드를 사용 |
| `OTJANG_SESSION_SECONDS` | 기본 43,200초(12시간), 허용 60초~604,800초 |
| `OTJANG_CORS_ORIGINS` | 명시적인 origin 목록. wildcard는 모든 환경에서 기동 거부 |
| `OTJANG_REQUIRE_HTTPS` | 기본 false는 loopback 개발용. production은 true |
| `OTJANG_TLS_KEY_STORE`, `OTJANG_TLS_KEY_STORE_PASSWORD` | production의 PKCS12 인증서 경로·비밀값 |

이 저장소에서 `.env`를 자동 읽는 서버 로더는 제공하지 않는다. 실행 프로세스에 환경 변수를 실제로 주입해야 한다. 로컬 런처는 DB·사진·초대·CORS 일부 값을 자체 설정으로 덮어쓴다. 런처에 가입 중지·초대 코드 회전 전용 명령은 아직 없다. 운영 정책을 바꿀 때 런처 동작과 서버 설정을 함께 검토한다.

아이디는 소문자 영문·숫자·점·밑줄·하이픈 3~40자, 비밀번호는 12자 이상이고 UTF-8 72바이트 이하. 가입·로그인은 실제 연결 IP 기준 분당 20회 제한하며 여러 서버의 공유 제한은 아직 없다. 로그아웃은 현재 토큰을 폐기한다. 계정 삭제는 비밀번호 재확인 뒤 실행하는 별도 사용자 동작이다.

외부 공개는 `SPRING_PROFILES_ACTIVE=production`과 위 필수값, 실제 TLS, HTTPS origin이 모두 준비된 환경에서 검토한다. loopback 이외 바인딩은 TLS+HTTPS 강제가 없으면 기동 거부된다. `X-Forwarded-Proto`만 넣은 HTTP 요청으로 이를 해결하지 않는다. production은 전달 헤더를 기본 신뢰하지 않는다. reverse proxy의 TLS 종료만으로 현재 서버의 `request.isSecure()` 요구가 충족된다고 가정하지 말고 staging에서 실제 구성을 검증한다. 사진 경로는 정적 공개 폴더 밖에 둔다.

공개 운영 전에는 도메인·인증서 갱신, 백업 보관·암호화, 장애 알림, 로그 회전, 용량 경보, 복구 목표를 별도로 확정해야 한다. 이 문서는 production 배포 완료나 그 비용 승인을 뜻하지 않는다.

## 5. 데이터 쓰기·동기화의 운영 계약

로그인 계정의 자료 쓰기는 `Authorization: Bearer …`와 `X-Eoul-Contract: 2`를 사용한다. 전체 `/api/wardrobe/import`, `/api/catalog/import`, `/api/backup/restore`에는 현재 조회 응답 `X-Wardrobe-Version`을 큰따옴표로 감싼 `If-Match: "<revision>"`가 필수다. 다른 자료 쓰기도 앱은 알고 있는 버전을 보낸다. header의 revision은 날짜나 앱 버전이 아니다.

재로그인에서 `syncStamp`가 누락·무효여도 같은 origin·인증 owner의 유효한 ack가 남으면 앱은 그 알려진 `serverVersion`을 유지한다. ack revision 7과 최신 서버 revision 8의 차이는 409로 보호할 충돌이다. 최신 번호를 다시 조회해 조건만 올리거나 ack를 지워 첫 보내기로 바꾸지 않는다. 양쪽 백업을 보관하고 받기 화면에서 실제 변경을 대조한다. 정상 stamp가 있는 재로그인은 기존에도 이 조건부 쓰기 보호가 동작했다.

서버는 owner 행의 잠금 안에서 버전 확인, 변경, 응답 버퍼링, 커밋을 처리한다. 실패 응답은 트랜잭션을 롤백한다. 서버 자료 쓰기 성공의 revision을 다음 요청의 기준으로 사용한다. 전체 보내기는 옷장 import와 카탈로그 import **두 요청**이므로 첫 요청 성공 뒤 두 번째 요청이 실패할 수 있다. 현재의 전체 보내기가 묶음 원자적 v2 sync는 아니다.

앱은 먼저 `/api/meta`로 지원을 확인한다. 구 서버로 반품·사이즈·반품 사유를 보내려 하면 전체 보내기를 차단한다. 구 클라이언트가 새 서버에 쓰면 409 `CLIENT_UPGRADE_REQUIRED`로 차단한다. 서버가 지원 정보를 잘못 반환하거나 새 스키마 파일이 들어와도 자료를 정리해서 일부만 저장하는 대신 중단한다.

구매 후속 결과의 acknowledged baseline과 판정별 충돌 선택, 적용 직전 재검사, 저장 실패 취소, 원문 CAS 보호를 구현하고 Node 회귀를 실행했다. 실제 브라우저 UI·두 탭 검증은 남아 있다. IDB 읽기와 양쪽 원문 일치를 확인한 뒤 쓰기만 실패하면 Web Lock 안에서 LS로 복구한다. 읽기 실패·충돌과 Web Lock 없는 LS 쓰기는 중단한다. 구현·검증 결과는 [검증 기록](verification-2026-10-13.md)을 따른다. 다른 옷·상품·설정 전체의 자동 병합은 이 제한된 후속 기록 보호에 포함되지 않는다.

동기화가 막히면 먼저 **브라우저 전체 백업**과 **서버 계정 전체 백업**을 각각 보관한다. 버전 숫자를 수동으로 올리거나 `If-Match`를 생략해 덮어쓰지 않는다. 서버에서 받기 화면에서 바뀔 자료를 보고 선택한다. 서버 목록에 항목이 없다는 이유만으로 삭제 의도를 추정하지 않는다. 삭제 tombstone·outbox·서버 epoch는 후속 작업이다.

## 6. 백업 종류와 복원 범위

| 백업 | 포함 | 제외·한계 |
| --- | --- | --- |
| 기록의 일반 옷장 내보내기 | 보유 옷과 선택한 사진·체형·가격·후보·판정 기록 | 구매 후보·처분 옷과 앱 상태 전체를 보존하지 않는다. 공유 용도이며 재해 복구 백업이 아님 |
| 브라우저 `전체 백업 받기` | 현재 브라우저 state: 보유·후보·처분 옷, 사진, 판정, catalog, 비교 옷장, 3D 자리, 선호·추천 기록, 베타 상태·동기화 정보 | 다른 브라우저·계정 사본은 별도 백업. 인증 계정·비밀번호·토큰·DB는 제외. 복원 시 동기화 baseline은 무효화 |
| `계정 전체 백업 받기` / `GET /api/backup` | 로그인 owner의 서버 옷·모든 상태·판정·구매 후속 기록·주인 정보·사진·catalog | 계정/비밀번호/토큰, import 영수증, 브라우저의 pickLog·prefs·비교 옷장·3D 자리 제외. 한 사용자 API 백업이며 운영 DB 백업을 대체하지 않음 |
| PostgreSQL dump + 같은 시점의 사진 폴더 | 전체 DB: 계정·세션 해시·owner revision·영수증·Flyway 이력 포함, 실제 사진 파일 | 브라우저 전용 자료와 서버 환경·인증서 제외. 별도 비공개 설정 보관도 필요 |

백업 JSON에도 개인 사진이 data URL로 포함될 수 있다. 파일은 공개 Git·issue·PR·외부 AI에 올리지 않고 개인 접근권한·암호화가 있는 저장소에서 보관한다. 개별 브라우저에서 파일을 다운로드했다는 사실만으로 다른 기기의 자료가 보존된 것으로 간주하지 않는다. RPO(허용할 자료 손실 시간)와 RTO(복구 목표 시간)는 아직 확정하지 않았다.

### 브라우저 전체 복원

1. 바꾸려는 **브라우저와 현재 로그인 계정**을 확인하고 먼저 그 화면의 전체 백업을 받는다.
2. `백업으로 복원하기`로 `kind: otjang-backup`, `version: 1` 파일을 연다. 새 버전 스키마, 손상 자료, 지원 수 초과는 적용하지 않는다. 옷/판정/상품 각 500개, 비교 옷장 6개, 3D 자리 6개 제한을 확인한다.
3. 교체할 옷 수를 확인하고 복원 확인을 누른다. 저장 실패면 기존 state를 유지한다. 저장 성공 뒤 새로고침하여 옷 수·사진·후속 기록을 확인한다.
4. 로그인 토큰은 복원되지 않는다. 원격 보내기를 곧바로 누르지 말고 해당 계정의 서버 자료를 확인한다. 가져온 옛 동기화 기준점을 과거 자료 덮어쓰기 권한으로 사용하지 않는다.

이 사용자 절차의 실제 브라우저 복구 훈련은 미실행이다. IndexedDB/localStorage를 직접 삭제하는 방법은 복원 절차로 쓰지 않는다.

### 서버 계정 전체 복원

1. 동일 계정의 브라우저 백업과 현재 `계정 전체 백업 받기`를 모두 보관한다. 받은 파일의 옷·판정·상품 수, 사진 여부를 확인한다.
2. 계정 백업 복원 파일을 열고 사진 포함 선택을 확인한다. **사진 제외 복원은 서버 전체 교체에서 사진도 빠질 수 있는 선택**이다. 서버 자료와 사진을 온전히 되살리려면 사진 포함을 선택한다. 이전 사진 파일은 성공 커밋 뒤 미참조일 때 정리될 수 있다.
3. 현재 revision을 조회한 뒤 `이 계정 전체 복원`을 명시적으로 누른다. 서버 요청 본문은 정확히 `{backup, confirmReplace: true}`다. `confirmReplacement`는 현재 API 필드가 아니다.
4. 성공 뒤 서버 백업을 다시 받아 항목 수·후속 결과·사진을 확인한다. 브라우저 사본은 자동 교체되지 않으므로 `서버에서 받기`의 미리보기·충돌 처리를 거쳐 적용한다.
5. 400/409/422/428/500이면 현재 자료 보존 여부를 조회하고 원인을 해결한다. 형식을 맞추려고 파일 필드를 조용히 지우거나 전체 자료 일부만 복원하지 않는다.

API 작업이 필요한 경우의 템플릿이다. **문서 작성 중 미실행**이며 비밀값을 넣은 curl 설정 파일은 저장소 밖의 권한 600 파일로 만든다. 로그인 응답 token을 아래 placeholder 위치에 비공개로 넣고, 실제 값을 명령 인자·로그로 출력하지 않는다.

```text
# <PRIVATE_AUTH_CONFIG> 파일 내용의 형식. 실제 토큰을 Git에 넣지 않는다.
header = "Authorization: Bearer <LOGIN_RESPONSE_TOKEN>"
```

```bash
# 경로와 주소 변수는 실제 대상 환경의 값으로 지정한다.
OTJANG_BASE_URL='<TARGET_BASE_URL>'
OTJANG_API_CONFIG='<PRIVATE_AUTH_CONFIG>'
OTJANG_BACKUP_DIR='<PRIVATE_BACKUP_DIRECTORY>'
chmod 600 "$OTJANG_API_CONFIG"
curl --fail-with-body --silent --show-error --config "$OTJANG_API_CONFIG" \
  --dump-header "$OTJANG_BACKUP_DIR/backup.headers" \
  --output "$OTJANG_BACKUP_DIR/server-before.json" "$OTJANG_BASE_URL/api/backup"
```

`backup.headers`의 `X-Wardrobe-Version`과 JSON 형식을 확인한다. 그 사이 다른 쓰기가 있었다면 새 revision으로 내용을 다시 검토한다. 복원 대상 백업을 읽어 `{backup: <원본 객체>, confirmReplace: true}`로 감싼 요청 파일을 비공개로 준비한다.

```bash
OTJANG_RESTORE_REQUEST='<PRIVATE_RESTORE_REQUEST_JSON>'
OTJANG_EXPECTED_REVISION='<VERIFIED_NUMERIC_REVISION>'
curl --fail-with-body --silent --show-error --config "$OTJANG_API_CONFIG" \
  --request POST --header 'Content-Type: application/json' \
  --header 'X-Eoul-Contract: 2' --header "If-Match: \"$OTJANG_EXPECTED_REVISION\"" \
  --data-binary "@$OTJANG_RESTORE_REQUEST" \
  --dump-header "$OTJANG_BACKUP_DIR/restore.headers" \
  --output "$OTJANG_BACKUP_DIR/restore-result.json" "$OTJANG_BASE_URL/api/backup/restore"
```

기대 결과: 2xx, 항목 수 응답과 새 `X-Wardrobe-Version`. 백업을 복원해도 사용자·토큰을 다른 owner로 바꾸지 않는다. restore는 해당 owner의 import 영수증을 지우고 현재 자료를 교체하므로 일반 upsert import와 다르다.

### 전체 DB·사진 운영 백업과 격리 복구

아래는 **미실행 복구 훈련 절차**다. 운영자료에 바로 실행하지 말고 합성 자료가 있는 별도 환경에서 먼저 증거를 남긴다. 아래 변수는 비밀값 없는 DB/컨테이너 식별자와 전용 경로다. 런처의 `runtime.json`에서 정확한 컨테이너·DB 이름·DB 사용자·사진 경로를 확인한다. DB 비밀번호는 명령 인자에 넣지 않는다.

1. 모든 앱 쓰기를 중지하고 브라우저 전용 자료를 별도 백업한다. 로컬 런처는 `stop`으로 Java와 DB를 함께 정지한다. 백업을 위해 확인한 **그 DB 컨테이너만** 다시 시작하고 Java는 정지 상태로 둔다. 사진 참조 쓰기와 커밋 후 정리가 없는 동안 DB와 사진을 함께 보존한다.
2. 전용 비공개 백업 폴더를 만들고 DB dump와 사진 압축 파일을 저장한다. 파일 생성 성공, archive 조회 성공, 파일 크기를 확인한다. 사진 경로·DB 식별자·Git SHA·UTC 백업 시각·중지 기간을 비공개 목록에 기록한다.

```bash
umask 077
OTJANG_DB_CONTAINER='<VERIFIED_SOURCE_CONTAINER>'
OTJANG_DB_USER_NAME='<SOURCE_DB_USER>'
OTJANG_DB_NAME='<SOURCE_DB_NAME>'
OTJANG_PHOTO_PATH='<VERIFIED_PRIVATE_PHOTO_DIRECTORY>'
OTJANG_BACKUP_DIR='<NEW_PRIVATE_BACKUP_DIRECTORY>'
mkdir -m 700 "$OTJANG_BACKUP_DIR"
# 로컬 런처 stop 완료와 대상 확인 뒤 수행
docker start "$OTJANG_DB_CONTAINER"
docker exec "$OTJANG_DB_CONTAINER" pg_isready -U "$OTJANG_DB_USER_NAME" -d "$OTJANG_DB_NAME"
docker exec "$OTJANG_DB_CONTAINER" pg_dump -U "$OTJANG_DB_USER_NAME" -d "$OTJANG_DB_NAME" -Fc > "$OTJANG_BACKUP_DIR/database.dump"
tar -C "$OTJANG_PHOTO_PATH" -czf "$OTJANG_BACKUP_DIR/photos.tgz" .
docker exec -i "$OTJANG_DB_CONTAINER" pg_restore --list < "$OTJANG_BACKUP_DIR/database.dump" > "$OTJANG_BACKUP_DIR/database.contents"
tar -tzf "$OTJANG_BACKUP_DIR/photos.tgz" > "$OTJANG_BACKUP_DIR/photos.contents"
```

명령 하나라도 실패하면 불완전한 백업으로 표시하고 다음 복구·배포로 넘어가지 않는다. DB dump는 사진 파일을 넣지 않는다. 사진만 복사하면 계정·옷·revision이 보존되지 않는다. `runtime.json`·인증서·필요한 환경 설정은 별도 암호화 보관하며 공개 archive에 섞지 않는다. 사진 폴더 권한과 소유권도 기록한다.

3. 별도 이름·볼륨·포트·자격증명으로 **빈 PostgreSQL 16 컨테이너**를 준비한다. 원본 DB/볼륨을 복구 대상으로 지정하지 않는다. 원본 사진 폴더와 다른 빈 복구 폴더를 만든다. 이 단계의 환경 구성은 아직 자동화되지 않았다.
4. 빈 DB에 dump를 복원하고 빈 폴더에 사진을 푼다. 아래의 `OTJANG_RESTORE_*` 값이 원본과 다른지 먼저 확인한다. 기존 자료를 지우는 `--clean` 옵션은 여기 사용하지 않는다.

```bash
OTJANG_RESTORE_CONTAINER='<SEPARATE_EMPTY_CONTAINER>'
OTJANG_RESTORE_DB_USER='<RESTORE_DB_USER>'
OTJANG_RESTORE_DB_NAME='<EMPTY_RESTORE_DB>'
OTJANG_RESTORE_PHOTO_PATH='<EMPTY_PRIVATE_RESTORE_PHOTO_DIRECTORY>'
docker exec -i "$OTJANG_RESTORE_CONTAINER" pg_restore \
  --exit-on-error --no-owner --no-privileges \
  -U "$OTJANG_RESTORE_DB_USER" -d "$OTJANG_RESTORE_DB_NAME" < "$OTJANG_BACKUP_DIR/database.dump"
tar -xzf "$OTJANG_BACKUP_DIR/photos.tgz" -C "$OTJANG_RESTORE_PHOTO_PATH"
chmod 700 "$OTJANG_RESTORE_PHOTO_PATH"
```

5. 복구용 서버를 복구 DB·사진 경로로만 연결하여 실행한다. Flyway 이력 성공, health `UP`, 계정 A/B 격리, 항목 수, 내 사진과 상품 사진, 반품·사이즈·메모·날짜, 백업 재내보내기를 검사한다. 비밀값·사진 대신 합성 입력과 검사 결과를 증거로 남긴다. 목표 복구 시간과 손실 여부를 실제로 측정한다.
6. **DB 복원 후 revision은 과거 값으로 돌아갈 수 있다. 서버 epoch가 아직 없으므로 같은 origin·owner·revision이 이전과 다른 상태를 뜻하는 상황을 클라이언트가 확실히 구분하지 못한다.** DB에 남은 세션도 과거 dump로 복원된다. 현재 구현에는 모든 세션 폐기·모든 기기 baseline 재설정·복원 epoch 전환을 수행하는 검증된 운영 명령이 없다. 이를 해결하고 전체 기기 사본과 미전송 변경을 보존·재대조한 기록이 없으면 같은 주소로 쓰기를 재개하지 않는다. 새 숫자만 강제로 넣어 안전해졌다고 판단하지 않는다.

사용자 단위 `/api/backup/restore`는 현재 트랜잭션에서 revision을 증가시키는 동작이며, DB dump로 서버 전체를 과거로 되돌리는 동작과 다르다. 둘을 같은 복구 증거로 사용하지 않는다.

## 7. 업데이트·마이그레이션·되돌리기

변경 전에는 Git SHA, 브라우저/서버 계정 백업, DB+사진 백업을 확보한다. 새 코드를 별도 개발/복구 환경에서 테스트·빌드한 뒤 현재 코드와 교체한다. 공개 배포 URL의 실제 SHA와 검사한 SHA가 일치하는지 별도 기록한다. 브랜치 push만으로 배포 성공을 표시하지 않는다.

스키마는 Flyway V1~V8이 변경하고 JPA는 `ddl-auto: validate`로 확인한다. V8은 두 새 enum 열·제약을 추가하고 기존 outcome·날짜·메모를 보존한다. 기존 후속 기록의 새 값은 `unknown`, 후속 기록이 없던 행은 NULL이다. 날짜를 시각으로 바꾸지 않는다.

기동 로그에서 migration 성공과 validate 통과를 확인한다. 권한 오류, checksum 불일치, 제약 위반, 엔티티/DB 불일치면 기동을 중단하고 원인·실패 버전을 기록한다. 이미 적용한 SQL 파일을 수정하거나 Flyway `repair`로 덮어 해결하지 않는다. 이유가 있는 새 forward migration을 만들고 별도 DB에서 검증한다.

**코드 rollback과 DB rollback은 다르다.** V8을 적용한 DB에서 이전 서버는 반품·사이즈 필드를 이해하지 못할 수 있으므로 단순 이전 commit 실행을 안전한 되돌리기로 취급하지 않는다. 이전 클라이언트의 새 서버 쓰기는 contract header로 막지만, 구 서버로 바꾸면 이 보호도 없어진다. 현재 자동 down migration은 없다. 오류가 있으면 먼저 읽기/쓰기 중단·백업·수정 migration을 검토한다. 전체 DB 복원은 앞의 revision/epoch·세션 문제까지 해결하는 별도 장애 작업이다.

## 8. 장애가 나면 이 순서로 좁힌다

먼저 장애 시각, 실행 SHA, 환경, 재현 동작, HTTP status와 `code/path`, affected item의 합성 재현 ID, health 결과를 적는다. 원문 요청 본문·Authorization·계정 비밀번호·사진 data URL·개인 이름은 수집하지 않는다. 앱이 저장되지 않으면 새로고침 전에 전체 백업부터 받는다.

```bash
# 로컬 루트. 원문 로그는 비공개로만 확인하고 필요한 오류 종류만 정리한다.
node release-tools/local-beta.mjs status
curl --fail --silent --show-error http://127.0.0.1:18085/actuator/health
curl --fail --silent --show-error http://127.0.0.1:18085/api/meta
# 실제 runtime 폴더를 별도로 지정한 경우 해당 경로 사용
tail -n 80 server/data/beta-runtime/server.log
```

로그에는 의존성·기동·DB 오류가 남을 수 있다. 전체 로그를 Git·외부 AI에 붙이지 않는다. 현재 자동 장애 알림·로그 회전·정기 사진 수거·원격 관리 센터는 없다. 앱이 안 열린다는 신고 없이 이상을 자동 발견하는 운영까지 완료됐다고 표시하지 않는다.

| 증상/응답 | 확인과 다음 동작 | 중단 조건 |
| --- | --- | --- |
| 앱/health에 닿지 않음 | 런처 status, 앱 포트, Docker 상태, Java 종료·DB 준비 로그 확인 | 대상 프로세스/볼륨을 확인 못하면 삭제·재생성 금지 |
| health UP, 로그인 실패 401 | 아이디 규칙·비밀번호, token 만료/폐기, 서버 주소 확인. 재로그인 | 계정 사본을 지워서 해결하지 않기 |
| 가입 403 | 초대 가입 닫힘 또는 코드 불일치. HTTPS 강제에 HTTP로 접근했는지도 확인 | 운영 TLS를 끄거나 자료를 타 계정 owner에 연결하지 않기 |
| 429 | 연결 IP 제한. 잠시 뒤 재시도, proxy에서 모든 고객이 한 IP인지 확인 | 연속 자동 재시도 금지; 공유 rate limit은 미구현 |
| 409 `CLIENT_UPGRADE_REQUIRED` | 브라우저 앱/서버 버전을 맞추고 contract 2 지원 확인 | `If-Match` 충돌과 다르다. 헤더만 임의로 붙여 구 클라이언트 통과시키지 않기 |
| 409, 해당 code 없음 | 오래된 revision, import 멱등 키 내용 변경, 가입 아이디 중복 등 detail와 요청 경로로 구분 | 전체 백업 없이 받기/교체 금지. 수정 본문에 옛 멱등 키 재사용 금지 |
| 428 / If-Match 400 | 현재 서버 version을 조회하고 올바른 `"정수"` 형식 확인 | 임의 revision/강제 덮어쓰기 금지 |
| 422 `FOLLOWUP_VOCAB` / `FOLLOWUP_DATE` / `FOLLOWUP_WITHOUT_DECISION` / `FOLLOWUP_INVALID_DECISION` | path의 어휘·달력 날짜·판정 존재·id를 확인. 합성 재현을 만들어 계약 fixture에 추가 | 오류 필드만 삭제해 성공처럼 보이게 처리하지 않기 |
| 422 `WARDROBE_LIMIT` 또는 restore 400 | 목록 상한·스키마·필수/추가 키 확인. 원본 보관 후 분할/수용 정책 개발 | 501번째 기록 등을 조용히 잘라 저장하지 않기 |
| CORS, 브라우저 네트워크 오류 | 앱 origin과 `OTJANG_CORS_ORIGINS`, scheme·포트, split 빌드 CSP 확인. 모바일 미리보기는 계정 동기화 없음 | wildcard 추가, HTTPS에서 임의 HTTP 로그인 허용 금지 |
| `저장할 수 없는 상태` / 저장 충돌 | IndexedDB/localStorage 사용 가능·용량·다른 탭 여부 확인. 현재 화면을 전체 파일로 보관 | 저장소 초기화/새로고침으로 아직 저장 안 된 자료 잃지 않기; CAS 검증 상태 확인 |
| 구매 기록과 복구 사본을 저장하지 못함 | 현재 브라우저 전체 백업을 먼저 보관하고 마지막 성공 사본·대기 중 편집·계정을 대조. 구매 저장은 실패한 시도만 되돌리며 뒤 큐의 잠정 구매에는 보상 저장을 시도함 | 보상 저장도 실패하면 저장소에 잠정 구매가 남을 수 있음. 완전 복구나 구매 완료로 취급하지 않기 |
| 사진 400 / 413 | 실제 webp/png/jpeg 디코딩·MIME, 각 변 4096 이하/400만 픽셀 이하, 앱 data URL 600,000자 상한, 사용자 참조 64MiB 확인 | 저장 제한만 풀어 손상 사진 수용하지 않기 |
| 사진 누락 / cleanup 운영 오류 | 설정된 비공개 사진 경로·권한·DB 참조·같은 시점 백업 확인. 참조가 남은 파일은 보존 | 파일 해시가 같아도 타 owner가 사용할 수 있다. DB 참조 확인 없는 수동 파일 삭제 금지 |
| 보내기 중 두 번째 요청 실패 | 옷장 성공 여부와 카탈로그 실패를 각각 조회·기록. 현재 서버/브라우저 사본 보존 | 전체 두 요청이 전부 rollback됐다고 가정하지 않기 |
| 서버에서 받기가 손실 위험으로 차단 | 양쪽 백업, 계약·계정·origin·revision·baseline·원격 완전성 확인 | baseline 수동 조작이나 서버 누락=삭제 추정 금지 |
| 500 / DB·디스크 용량 부족 | 기동/transaction/사진 I/O 로그와 DB·사진 디스크 여유 확인 | 성공 응답이 없는데 데이터가 없다고 가정하지 말고 조회. 자동 유료 전환 없음 |
| 3D만 실패 | 3D 자산 생성 여부, 종류 지원, 브라우저 WebGL·WebAssembly 확인. 일반 옷장 자료 백업 | 3D 캐시와 사용자 저장소를 함께 지우지 않기 |

서비스 워커는 정적 앱 파일을 캐시하며 IndexedDB의 옷·사진을 백업하지 않는다. 오래된 UI를 갱신할 때도 사용자 사이트 데이터 전체 삭제를 첫 조치로 쓰지 않는다. 3D 파일 캐시를 지우는 것과 계정 사본/옷장을 지우는 것은 다른 작업이다.

## 9. 실행 증거와 다음 운영 인계

| 항목 | 2026-10-13 확인 상태 |
| --- | --- |
| Java 21 / Maven 3.9.11, 실제 PostgreSQL 16 Testcontainers의 `mvn test` | **검증 사실: 130개 통과, 실패/오류/건너뜀 0.** 로컬 surefire XML 합계도 확인. 계약 fixture 88건, API 계약 테스트 8건, V7→V8/DB 제약·인증·계정 격리·revision 포함 |
| Node 22.23.2, 새 `package-lock.json`의 분리된 의존성 설치 | **검증 사실: 임시 분리 폴더의 `npm ci --ignore-scripts --no-audit --no-fund` 성공, 27개 패키지와 최상위 고정 의존성 8개 일치.** 설치 스크립트는 실행하지 않은 검사이며 그 설치본의 빌드 검증은 진행 중 |
| 최신 앱 테스트·빌드·CAS·baseline·구매 저장 | 최초 전체 Node 184개, 재로그인 수정 후 188개, 구매 저장 회귀 15개를 더한 최신 **203개 통과**. 최신 기본 3D 포함·모바일 빌드 성공. 앞선 분리 웹 빌드와 생성 JS 구문 검사도 성공. 실제 함수·버튼·저장 큐는 합성 어댑터 회귀이며 실제 브라우저는 별도. 자세한 결과는 [검증 기록](verification-2026-10-13.md) |
| 최신 브라우저 전체 흐름·실제 휴대폰/Safari·3D 체감 성능 | 미실행. 해당 환경에서 별도 확인 필요 |
| production 기동·공개 배포·TLS/proxy/CORS 실구성 | 미실행 |
| 사용자 브라우저/서버 백업 실제 복원, 전체 DB+사진 복구 훈련 | 미실행. API 자동 테스트 성공과 운영 복구 성공은 별도 증거 |
| 정기 백업·알림·로그 회전·복원 epoch·사진 고아 정기 수거 | 후속 운영·개발 작업 |

다음 변경에서는 코드와 함께 이 문서를 갱신한다. 필요한 최소 기록은 **문제 → 선택한 해결 방법과 이유 → 바뀐 계약/설정 → 실행 명령·SHA·결과 → 미실행 범위 → 배포/복구 영향 → 다음 담당자가 할 일**이다. 기능만 추가하고 운영상 변화는 인계하지 않은 상태를 완료로 처리하지 않는다. 검증 없이 실패 횟수·응답 시간·서비스 점수·사용자 성과를 채우지 않는다.
