# 초대 베타 서버 운영 기준

이 변경은 로컬에서 검증하는 초대 베타 기반이다. 공개 배포·실제 고객 모집·유료 서비스 연결은 별도 결정이다. 이전 개인판 owner 1과 그 자료는 V4/V5 마이그레이션에서 보존되며, 어떤 신규 계정에도 자동 연결하지 않는다.

## 인증과 사용자 자료

- 가입은 `OTJANG_INVITE_CODE`가 비어 있으면 닫힌다. 가입은 새로운 owner를 만들며 기존 owner 1을 인수하지 않는다.
- `POST /api/auth/register {username,password,inviteCode}`, `POST /api/auth/login {username,password}` → `{token,expiresAt,user:{username,ownerId}}`.
- 모든 사용자 API는 `Authorization: Bearer <token>`을 요구한다. 공개 `GET /api/meta`는 계약 버전·지원 어휘만 반환하며 사용자 자료를 포함하지 않는다. 앱은 자동 인증 쿠키·Basic 인증을 사용하지 않는다. 서버는 세션을 만들지 않으므로 이 계약의 CSRF는 자동 쿠키 인증과 분리된다.
- 토큰은 32바이트 암호학 난수다. 원문은 발급 응답에만 나오고 DB에는 SHA256 해시만 둔다. 기본 만료 12시간, `OTJANG_SESSION_SECONDS`는 60초~7일 범위다. `POST /api/auth/logout`은 현재 토큰을 폐기하고 `GET /api/auth/me`는 사용자 이름과 ownerId만 돌려준다.
- 비밀번호는 BCrypt cost 12로 저장한다. 12자 이상, UTF-8 72바이트 이하. 계정/세션 원문을 실행 명령·로그·Git·스크린샷에 기록하지 않는다.
- 가입/로그인 시도는 서버 인스턴스의 실제 연결 IP마다 분당 20회 제한한다. 여러 인스턴스의 공유 제한은 아직 없다. 임의 X-Forwarded-For는 신뢰하지 않는다.
- 요청자 owner 밖의 항목 조회·변경·삭제는 404다. 클라이언트가 보내는 ownerId는 권한으로 사용하지 않는다.

## 사진

사진은 기존 비공개 로컬 폴더에 저장하며 임의 public 파일 라우트를 만들지 않는다. API가 인증된 owner의 DB 참조를 조회한 뒤 필요한 이미지 바이트만 응답한다. ImageIO(TwelveMonkeys WebP 읽기 포함)로 실제 디코딩하고 MIME 일치, 가로·세로 각각 4096 이하, 400만 픽셀 이하를 확인한다. 앱의 기존 600,000자 data URL 상한도 유지한다. 사용자당 새 사진 참조의 실제 바이트 합계는 64MiB로 제한한다.

옷/상품 사진을 교체·삭제하거나 계정을 지울 때 성공한 DB 커밋 뒤 이전 사진 참조를 검사한다. 다른 사용자나 다른 항목이 참조하는 같은 내용 해시 파일은 지우지 않는다. 사진 참조를 쓰는 작업과 수거는 같은 PostgreSQL advisory lock을 사용한다. 수거 실패는 저장 성공을 취소하지 않으며 비밀값 없는 운영 오류를 남긴다. 실패한 트랜잭션이 새로 만든 사진은 rollback 완료 후 같은 참조 검사와 잠금 아래 즉시 수거한다. 서버가 강제 종료된 경우나 과거 버전이 남긴 고아 파일의 정기 수거 작업은 추가 운영 작업이다. 사진과 DB를 반드시 함께 백업한다.

## 전체 백업과 계정 삭제

`GET /api/backup`은 인증된 사용자의 서버 자료 전체를 반환한다.

```json
{
  "schema": 1,
  "kind": "otjang-server-backup",
  "exportedAt": "ISO 날짜",
  "wardrobe": {"schema": 2, "kind": "wardrobe", "owner": {}, "items": [], "decisions": []},
  "catalog": {"schema": 1, "kind": "catalog", "name": "", "note": "", "products": []}
}
```

보유·후보·처분 상태, 내 사진/상품 사진, 판정의 비교 기록과 후속 구매 기록을 포함한다. 로그인 계정·비밀번호·토큰·멱등 영수증은 포함하지 않는다. 앱의 다른 옷장·3D 위치는 서버에 저장하지 않으므로 브라우저 전체 백업이 별도로 필요하다. 백업 파일도 개인정보이며 공개 저장소에 넣지 않는다.

`POST /api/backup/restore {backup,confirmReplace:true}`는 현재 로그인 사용자 자료만 원자적으로 교체한다. 필드 누락·알 수 없는 필드·500개를 넘는 목록·자동 보정될 손상 데이터는 400으로 거부한다. 후속 기록의 선택 enum 누락·해당하지 않는 값은 아래 계약 2 기본값으로 정규화한다. 파일의 ownerId나 계정을 다른 사용자의 권한으로 쓰지 않는다. 실패하면 기존 DB 자료는 롤백한다. `DELETE /api/account {password}`는 비밀번호를 다시 확인한 뒤 사용자 자료와 토큰을 삭제하고 더 이상 참조되지 않는 사진을 정리한다.

## 구매 후속 기록 계약 2

`GET /api/meta`는 `{contract:2,wardrobeSchema:2,followup:{outcomes,sizeResults,returnReasons}}`를 반환한다. 옷장·옷·판정·상품 목록·백업 복원 쓰기는 **`X-Eoul-Contract: 2`**를 요구한다. 누락되거나 다른 버전이면 409 `CLIENT_UPGRADE_REQUIRED`로 거부하며 데이터, 버전, 가져오기 영수증을 만들거나 재사용하지 않는다. 읽기·회원가입·로그인·로그아웃·계정 삭제에는 이 헤더가 필요하지 않다. HTTPS·인증·owner 격리 규칙은 그대로 적용된다.

판정 `followup`은 `outcome`, `worn`, `regret`, `sizeResult`, `returnReason`, `note`, `at`를 왕복 보존한다. outcome은 `purchased|not-purchased|pending|returned`, sizeResult는 `right|small|large|unknown`, returnReason은 `size|fit|color|material|quality|changed|price|other|unknown`이다. worn·regret은 `yes|no|unknown`이다. 사이즈는 구매·반품에만, 반품 사유는 반품에만 의미가 있다. 그 밖의 경우와 선택 enum 키 누락은 `unknown`으로 정리한다. 구매로 정정해도 사이즈를 보존하며 반품 사유만 `unknown`이 된다.

유효한 결정(after) 없는 후속 기록은 422 `FOLLOWUP_WITHOUT_DECISION`, 유효한 `before.lean`이나 id 없는 후속 기록은 422 `FOLLOWUP_INVALID_DECISION`, 지원하지 않는 outcome이나 해당 outcome에 의미가 있는 enum 값은 422 `FOLLOWUP_VOCAB`를 반환한다. 응답 `path`는 문제 필드를 가리킨다(예: `decisions[1].followup.sizeResult`; 백업 복원은 `wardrobe.decisions[1].followup.sizeResult`). 옷이나 판정 500개를 초과하는 import는 422 `WARDROBE_LIMIT`로 전체 거부하며 뒤쪽 항목을 잘라 저장하지 않는다. 저장 전에 전체 묶음을 검사하므로 다른 옷·판정·주인 정보와 멱등 영수증도 변경되지 않는다. 로컬 파일 정리기는 기존처럼 알 수 없는 값을 보수적으로 정리한다. 이 차이는 손실 없는 서버 쓰기 경계를 위한 의도된 계약이다.

V8은 새 enum 열 2개와 제약만 추가하고 기존 outcome·날짜·메모는 보존한다. 이전 후속 기록의 새 enum 열은 `unknown`, 후속 기록이 없던 행은 NULL이다. 날짜 열은 기존 `date`를 유지한다. 공통 합성 사례는 `../contracts/followup-contract.json`이며 앱과 서버가 같은 입력·기대값으로 검증한다.

후속 기록이 있는 판정의 `before.at`, `after.at`, `followup.at`은 실제 달력 날짜(연도 1~9999의 `YYYY-MM-DD`)이거나 빈 값이어야 한다. 잘못된 날짜는 422 `FOLLOWUP_DATE`와 필드 경로로 거부한다. 클라이언트·도메인 정리기의 `safeDate`도 실제 날짜를 확인해 잘못된 후속 날짜를 빈 값으로 정리한다. 시간으로 바꾸거나 과거 날짜에 시각을 만들어 넣지 않는다.

사용자별 백업 API는 PostgreSQL 운영 백업을 대체하지 않는다. 출시 전 실제 DB 덤프와 사진 폴더를 동시에 보존하고 새로운 빈 DB/폴더에 복구한 증거를 남겨야 한다. 복구 허용 손실 시간과 복구 목표 시간은 아직 정하지 않았다.

## 환경과 공개 운영 전 조건

서버 기본 바인딩은 127.0.0.1이다. loopback 이외의 주소를 사용하면 실제 TLS와 HTTPS 강제가 모두 설정되어야 시작된다. 로컬 기본값은 파일 앱 origin `null`, localhost/127.0.0.1의 3000·18085만 허용한다. CORS wildcard는 모든 프로필에서 서버 시작 시 거부한다. 임의 로컬 포트는 명시적으로 `OTJANG_CORS_ORIGINS`에 추가한다.

`production` 프로필은 DB 주소/사용자/비밀번호, 사진 폴더, 명시적 origin, PKCS12 TLS 인증서를 환경 변수로 요구한다. 실제 TLS가 없는 `/api/**` 요청은 403이다. 외부 proxy의 전달 헤더를 기본 신뢰하지 않는다. 개발 DB 기본 비밀번호와 origin `null`은 공개 운영 설정으로 쓰지 않는다. 상위 proxy에서도 요청 본문 최대 크기를 제한해야 하며, 현재 필터는 Content-Length가 있는 인증 요청 8KiB, 그 밖의 요청 64MiB를 검사한다.

공개 운영 전에 실제 기기 성능/접근성, 백업 복구, 장애 알림·모니터링, 부하, 외부 보안 검토가 남아 있다. 전체 옷장·상품 목록 가져오기와 서버 전체 복원은 If-Match 버전 확인을 요구한다. 버전이 빠지면 428, 오래되면 409로 쓰기를 거부한다. X-Wardrobe-Version 헤더로 현재 버전을 읽는다. 이 검사는 오래된 전체 상태 덮어쓰기를 막는 조건부 쓰기이며 자동 병합·삭제 전파 동기화 완료를 뜻하지 않는다. 시뮬레이션 캐시 보관 여부와 고객 계정 격리는 별개다.

공식 참고: [Spring Security 요청 권한](https://docs.spring.io/spring-security/reference/servlet/authorization/authorize-http-requests.html), [비밀번호 저장](https://docs.spring.io/spring-security/reference/features/authentication/password-storage.html), [TwelveMonkeys ImageIO](https://github.com/haraldk/TwelveMonkeys).
