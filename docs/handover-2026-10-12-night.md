# 인수인계 · 2026-10-12 밤 (Claude → Codex)

기준 시각 2026-10-12 23시경(한국 시간). 이 문서가 16시 「Codex 인수인계서」와 그 18:30·19:00 덧붙임보다 나중이다. 둘이 다르면 **이 문서가 기준**이다.
표기: **[사용자 원문]** / **[사용자 결정]** / **[Codex 전달]**(사용자 대화로 Codex가 전한 내용) / **[검증 사실]**(명령·결과·날짜 있음) / **[미검증]** / **[제안]**.

## 1. 지금 어디에 무엇이 있나

| 항목 | 값 |
|---|---|
| 저장소 | https://github.com/daedaem/otjang (공개) |
| 작업 브랜치 | `feat/personal-app-v0.4` |
| 최신 HEAD | `b96616ec391dfd87e0d7ede6c23aca408edcf3a4` (v0.4.4 카디건) — 이 문서를 넣는 커밋이 그 위에 하나 더 있다 |
| PR | #7 → master, 열림, 병합 안 함, `mergeable: true` (10-12 23시 기준 커밋 10개, 파일 177개) |
| 미커밋 파일 | **없음** (`git status` 깨끗, 모두 push 함) |
| 다른 브랜치 | master `b1bb7d7`, docs/prd-v0.4 `6b2d26f`(PR #1), feat/wearnext-prototype `8ec8dc5`(PR #6), gh-pages `dc4cb9f` — 건드리지 않았다 |
| Codex 클라우드 M1 `da1bcb7`(217파일) | GitHub 브랜치 목록에 없다. Claude는 내용을 본 적이 없다 [미검증]. 이 PR의 `app/`(M1~M4 포함)과 겹치는 작업이다 |

### 저장소에 없는 것 (Claude 작업 환경에만 있음, 일부러 넣지 않음)

- 사용자 본인 옷장 13벌 자료와 사진: `/home/claude/otjang4/data/wardrobe.json`, `wardrobe-with-photos.json` — **공개 저장소 규칙(CONTRIBUTING.md) 때문에 넣지 않는다.** 필요하면 사용자 PC의 `app/data/wardrobe.json`(.gitignore)에 둔다.
- Blender 시뮬레이션 캐시: `blender/cache/psweat-2.pkl`(스웻셔츠), `pcardigan-1.pkl`(카디건), 시험용 `*-t.pkl`. 셔츠·필드·블레이저·트러커 캐시는 16시 ZIP(`03-옷장-3D/pipeline/cache/`)에 있다. .gitignore 대상.
- 빌드 결과 `app/dist/`, `node_modules`, 로컬 PostgreSQL 시험 DB `otjang_test`. 모두 다시 만들 수 있다.

## 2. 16시 인계 이후 바뀐 것

| 시각 | 내용 | 근거 |
|---|---|---|
| 16:51 | **[사용자 원문]** "계속해서 이 사업을 하기위한 플랫폼을 완성해주세요" → Claude가 M1~M4를 개인판 v0.4로 구현 | 커밋 `e694083` |
| 17:58, 18:01 | **[사용자 원문]** "파일을주지말고 깃허브 저장소에 최신화를 해요" / 저장소 daedaem/otjang → PR #7 | |
| 18:37 | **[사용자 원문]** "목표를 모두 마칠때까지 진행해주세요" (+ Fable 사용량이 끝나면 Opus 5.5로) | |
| 18:38, 18:43 | **[사용자 원문]** 토큰이 끊기기 전에 GitHub 최신화와 인수인계 파일 / "인수인계 문서는 지금 하지말고 전체 토큰 2퍼남으면 해요" → 이번에는 Codex 요청(22:42)으로 지금 쓴다 | |
| 19:40 | M5 서버 1차 `server/` | `b82f9b9`, `7e8f7c4` |
| 20:20 | 앱 v0.4.1 사진에서 색·밝기 초안, 상품 데이터 경로 조사 | `c6d8f42` |
| 20:25 | 3D 크루넥 스웻셔츠(v0.4.2) | `b86075d` |
| 20:45 | 앱 v0.4.3 내 서버와 맞추기 | `e1dc655`, `2010108` |
| 22:50 | 3D V넥 카디건(v0.4.4) | `b96616e` |
| 22:42 | **[Codex 전달]** 이름: "옷장들이"는 **거부**, "의롱"은 임시, "어울/EOUL"은 긍정 평가한 미확정 후보. 서비스 정의: 나에게 어울리면서 기존 옷장을 가장 잘 보완하는 최상의 아이템을 구매 전에 비교·선택. 특정 장르·옷장 보관 도구로 제한하지 않음 | 이 대화 |

화면 문구·문서에는 아직 "옷장들이(가칭)"가 남아 있다. **이름 변경은 하지 않았다**(요청 범위 밖, 사용자 결정 전).

## 3. 실행 명령

```bash
git clone https://github.com/daedaem/otjang && cd otjang && git checkout feat/personal-app-v0.4
# 앱
cd app && npm install && npm test && npm run assets && npm run build      # dist/index.html 약 11.3MB
npx playwright install chromium && npm run check                          # QUICK=1 한 환경, NO3D=1 3D 생략
# 서버 (네트워크 되는 PC)
cd ../server && docker compose up -d && mvn -q test && mvn spring-boot:run
# 서버 규칙만 의존성 없이 (JDK 21 + gson jar 하나)
javac -nowarn -cp $GSON -d /tmp/ob $(find src/main/java/otjang/domain -name "*.java") src/test/java/otjang/domain/GoldenParity.java src/test/java/otjang/domain/DomainChecks.java
java -cp $GSON:/tmp/ob otjang.domain.GoldenParity ..  &&  java -cp /tmp/ob otjang.domain.DomainChecks
# Blender 자산 (리눅스, bpy 5.2.2) — blender/README.md
```

## 4. 검증 상태 (2026-10-12, 리눅스 클라우드, Node 22.22, JDK 21, PostgreSQL 16.15, 헤드리스 Chromium + SwiftShader)

**성공 [검증 사실]**
- `app`: `npm test` 52개 통과. `npm run check` 환경당 72항목 × 2환경(1280×900 밝음, 390×844 어두움) 통과 — 외부 요청 0(흉내 서버 요청 제외), 콘솔 오류 0. 빌드 결과에 사진 데이터 없음.
- 3D 스웻셔츠·카디건: 앱 3D 탭에서 걸고 골라 화면 캡처로 확인.
- `server/domain`: GoldenParity — 앱(JS) 골든 스냅샷과 판정 12·코디 10·비교 5, 상품 순위 4종·상품→후보 7·재확인 판정 **모두 일치**. 규칙 문턱을 일부러 바꾸면 차이가 잡힘. DomainChecks 25개 통과.
- `server` 스키마: V1·V2·V3를 PostgreSQL 16.15에 적용, 제약 시험 6건 기대대로.
- `server` Spring 계층: 손으로 만든 API 흉내 껍데기(약 45개 기호)에 맞춰 javac 컴파일 — 내 코드끼리 타입·이름 오류 없음.

**실패·막힘**
- 이 작업 환경에서 Maven Central 등 Maven 저장소가 모두 프록시에서 403 → **실제 Spring Boot 4.1.1 라이브러리로 컴파일·`mvn test`·`ApiFlowTest`(Testcontainers) 미실행.** Codex PC에서 지금 확인 중이라고 들었다 — 그 결과가 이 표를 대신한다.

**미검증**
- 앱 ↔ 실제 서버 연결(흉내 서버로만 확인). 파일로 연 앱의 origin `null`이 `otjang.cors-origins=*`로 허용되는지.
- 실제 휴대폰·Safari·맥, 3D 체감 성능, 11.3MB 로딩.
- 사용자가 직접 써 본 기록(살까 말까 실제 판정 0건).
- 상품 데이터: 네이버 쇼핑 검색 API 종료는 2차 출처 2건뿐(1차 공지 미확인) — `docs/data-sources-2026-10-12.md`.

## 5. 알려진 결함 (고치지 않음 — 10-12 12:53 사용자가 품질 개선을 미룸)

- 3D: 따뜻한 조명 때문에 흰색이 크림색, 그레이가 베이지처럼 보인다. 카디건 밑단 가운데 검은 얼룩. 스웻셔츠 리브 커프스가 굵어 보임. 나머지는 `blender/README.md` "보이는 결함".
- 파일 크기가 옷 종류마다 약 1.4MB씩 늘어 11.3MB.

## 6. 다음 작업 (순서는 [제안])

1. **Codex PC**: `server/`에서 `mvn -q test` → 컴파일 오류·실패 수정(Spring Boot 4의 Jackson 3 직렬화, Hibernate 배열·jsonb 매핑, `ddl-auto: validate`가 가장 의심되는 곳). 그다음 서버를 켜고 앱 기록 탭 "내 서버와 맞추기"로 보내기·받기 한 번.
2. **기준 코드 결정(사용자)**: 이 PR의 `app/`·`server/` vs Codex `prototype/`(PR #6)·클라우드 M1 `da1bcb7`. 두 갈래를 계속 키우지 않는다.
3. **이름(사용자)**: Claude 독립 후보 200개 파일(이 문서와 함께 전달, 저장소에는 넣지 않음) → Codex 200개와 교차 비평 → 8~12개 → 사용자 결정. 결정 전에는 화면·저장소 이름을 바꾸지 않는다. 상표·도메인은 아무것도 검색하지 않았다.
4. 사용자가 실제 고민 중인 옷 1건으로 살까 말까 끝까지(PRD 0단계 문턱 3건 중 1).
5. 미룬 것: 3D 품질, 블루종, 바지(거는 방식 결정 필요), 신발, 실사 착장(M6, GPU·비용 결정), 상품 자동 수집(이용 조건).

## 7. Codex에게 하지 말 것

유료 API·결제·자동 충전, 개인 사진 외부 전송·공개 저장소 커밋, 크롤링, 공개 배포, 이름 변경, PRD v0.1 수정, PR 병합(사용자 확인 전), 확인하지 않은 가격·재고·상표 사실 기록.
