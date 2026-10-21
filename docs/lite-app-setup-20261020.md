# 설치형 시험 앱 올리기 — 아이폰 홈 화면에서 쓰기 (2026-10-20)

쉬운 시안(토스식 d7)을 그대로 앱으로 묶었다(`app/lite`). 화면은 Cloudflare Pages(무료)에, AI 순위는 같은 곳의 서버 함수(`/api/rank`)에 올린다.
옷장·기록은 **아이폰 안 저장소에만** 있고 서버 DB는 없다. 사진 파일도 올리지 않는다(상품 사진은 판매처 이미지 서버 주소).

메뉴 이름은 Cloudflare 공식 문서(2026-10-20 확인)를 따랐다. 화면이 바뀌었으면 같은 뜻의 메뉴를 찾으면 된다.

## 대표님이 하실 일 (약 15분)

### 1. Cloudflare 무료 계정
https://dash.cloudflare.com/sign-up 에서 이메일로 가입한다. 결제 수단은 넣지 않아도 된다.

### 2. 저장소 연결 (Pages 프로젝트 만들기)
1. 대시보드 왼쪽 **Workers & Pages** → **Create application** → **Pages** → **Connect to Git**
2. **GitHub** 선택 → 로그인 → 저장소 `daedaem/otjang` 선택 → **Install & Authorize** → **Begin setup**
3. **Set up builds and deployments** 화면에서 아래처럼 넣는다.

| 칸 | 값 |
|---|---|
| Project name | 원하는 이름(주소가 `이름.pages.dev`가 됨). 짐작하기 어려운 이름 권장 |
| Production branch | `claude/fashn-vton-m1-test-3ox240` (master에 합친 뒤에는 master) |
| Framework preset | None |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory (advanced) → Path | `app/lite` |

4. **Save and Deploy**. 1~2분 뒤 `https://이름.pages.dev` 주소가 나온다. 이때는 AI 순위 자리에 "AI 순위가 아직 설정되지 않아 기본 순서로 보여 드려요"가 나오는 게 정상이다.

### 3. API 키 넣기 (채팅에 붙이지 않는다)
1. Anthropic 콘솔에서 새 API 키를 만든다(채팅에 붙였던 키는 삭제).
2. Cloudflare에서 방금 만든 프로젝트 → **Settings** → **Variables and Secrets** → **Add**
   - 이름 `ANTHROPIC_API_KEY`, 값에 키, **Encrypt** 선택 → **Save**
3. **Deployments** 탭에서 가장 최근 배포의 메뉴(⋯)에서 다시 배포(Retry deployment)를 누른다(메뉴 이름은 화면에 따라 다를 수 있다). 비밀 값은 다시 배포해야 반영된다.

### Workers로 만들어진 경우 (배포 명령이 `npx wrangler deploy`로 보일 때)
최근 Cloudflare 화면은 저장소를 연결하면 Pages 대신 Workers 프로젝트를 만들기도 한다. 이 경우에도 그대로 쓸 수 있게 `app/lite/wrangler.jsonc`와 `worker.js`를 넣어 두었다(2026-10-20).
1. **Settings → Build**: 분기(Branch)를 `claude/fashn-vton-m1-test-3ox240`로, 루트 디렉터리 `app/lite`, 빌드 명령 `npm run build`, 배포 명령 `npx wrangler deploy`
   - 분기가 `master`면 "root directory not found"로 실패한다(master에는 `app/lite`가 없다).
2. **API 키는 빌드 변수가 아니라 실행용 비밀 값으로**: 빌드 변수(Build variables)에 넣은 `ANTHROPIC_API_KEY`는 지우고, **Settings → Variables and Secrets → Add → 유형 Secret**으로 `ANTHROPIC_API_KEY`를 넣는다. 빌드 변수는 앱이 실행될 때 보이지 않는다.
3. **빌드 다시 시도**.
- Worker 이름은 Workers Builds가 대시보드 이름으로 덮어쓴다(설정 파일의 `otjang-lite`와 달라도 된다).
- Workers 쪽에서 하루 상한(KV)을 쓰려면 `wrangler.jsonc`에 KV 연결을 적어야 한다(대시보드에서만 연결하면 다음 배포 때 빠진다).

### 4. 아이폰에 설치
1. **Safari**로 `https://이름.pages.dev`를 연다(다른 브라우저 말고 Safari).
2. 아래 **공유** 버튼 → **홈 화면에 추가** → **추가**
3. 이후에는 홈 화면 아이콘으로 연다. 홈 화면 앱은 Safari와 저장 공간이 따로라서, Safari에서 넣은 옷은 앱에 보이지 않는다.

## 선택: 하루 AI 호출 상한
Anthropic 콘솔의 월 지출 한도(예: US$10)만으로도 돈이 넘게 나가지 않는다. 하루 상한을 더 걸고 싶으면:
1. 대시보드에서 **KV**(Workers 아래, 위치는 화면에 따라 다를 수 있다) → 이름공간 만들기(예: `rank-count`)
2. 프로젝트 → **Settings** → **Bindings** → **Add** → **KV namespace** → Variable name `RANK_KV`, 방금 만든 이름공간 선택
3. (선택) **Variables and Secrets**에 `DAILY_LIMIT` = 원하는 숫자(기본 300)
4. 다시 배포

## 선택: 사용자 등록 공유 DB (R15, 2026-10-21)
목록에 없는 옷을 직접 등록하면, 같은 옷을 서로 다른 기기 3곳 이상이 등록했을 때 모두의 검색에 나온다. 서버 코드는 `functions/api/catalog.js`(Cloudflare D1, 무료 등급)이고, **DB를 연결하기 전에는 등록이 그 기기에만 저장된다**(화면은 "서버 연결 전에는 이 기기에만"이라고 알린다).

연결 방법(둘 중 하나, Claude가 `wrangler.jsonc`에 한 줄을 넣어야 한다):
- **A. 자동 생성 승인(추천, 대표님 작업 0):** 대표님이 "D1 자동 생성 승인"이라고 말하면 Claude가 `wrangler.jsonc`에 `"d1_databases": [{ "binding": "CROWD_DB" }]`(id 없이)를 넣는다. 다음 배포 때 Wrangler가 대표님 계정에 무료 D1을 만든다(Wrangler 4.151의 자동 생성 기능 기준, 실제 Workers Builds에서 되는지는 첫 배포로 확인 필요). 실패하면 배포만 실패하고 지금 앱은 그대로 돌아간다 → Claude가 되돌린다.
- **B. 직접 만들기(약 2분):** 대시보드 → **Storage & Databases → D1** → **Create** → 이름 `otjang-crowd` → 만든 뒤 보이는 **Database ID**를 Claude에게 알려 준다(비밀 값이 아니다).

표는 첫 요청 때 서버가 만든다(따로 SQL을 돌릴 필요 없음). 선택 값(Variables and Secrets):
- `CROWD_MIN`: 검색에 올리는 기준 기기 수(기본 3). 혼자 시험할 때는 1로 두면 바로 검색된다.
- `CROWD_SALT`(Secret): 넣으면 IP를 소금 친 해시로만 남겨 같은 망에서 하루 60건 상한을 건다. 없으면 IP를 남기지 않고 기기당 하루 20건 상한만 쓴다.

알아 둘 점:
- 기기 id는 브라우저가 만든 무작위 값이라 마음먹으면 부풀릴 수 있다. 혼자 시험·포트폴리오 단계용이며, 여러 사람에게 열기 전에 계정 확인으로 바꾼다.
- 판매처 링크는 저장만 하고 남의 검색 결과에는 보내지 않는다(모르는 사람이 넣은 주소를 퍼뜨리지 않기). 사진은 받지 않는다.
- 나쁜 등록 지우기(운영자): `npx wrangler d1 execute <DB 이름> --remote --command "DELETE FROM crowd_items WHERE key = '…'"`.
- 같은 옷 판단은 브랜드·품명의 띄어쓰기·대소문자·기호를 지운 뒤 비교한다. "무신사 스탠다드"와 "MUSINSA STANDARD"처럼 다른 말로 쓴 것은 아직 다른 옷으로 센다(브랜드 별칭 표는 후속).

## 날씨 코디 (R17, 2026-10-21)
- 앱 화면은 d12 v3 "걸어 보고 사기"다(예전 d7에서 바뀜). 예전 앱에 넣은 옷장은 처음 열 때 한 번 옮긴다.
- 처음에는 '현재 위치' 방식이라 **위치 허용**을 묻는다. 허용하면 현재 위치, 거절하면 서울 기준 날씨를 보여 준다.
- 날씨 카드의 지역 이름(또는 ⋯ > 날씨 지역)을 누르면 **내 지역**을 고정할 수 있다: 19개 도시 중 고르기, 또는 '지금 있는 곳을 내 지역으로'(약 10km 단위로 줄여 이 기기에만 저장). 고정하면 위치를 다시 묻지 않는다.
- 날씨는 `/api/weather`가 Open-Meteo 예보를 대신 받아 온다(키·가입 없음). 좌표는 0.1°(약 10km)로 줄여 보내고 저장하지 않는다. 아이폰 IP는 날씨 서비스로 가지 않는다.
- Open-Meteo 무료 이용은 비상업 용도다. 사업으로 공개하기 전에 상업 조건을 확인하거나 기상청 단기예보 API로 바꾼다(확인 필요).
- 확인한 범위: 점검 3개(좌표 줄이기·비 판정·실패 502), `wrangler dev`에서 실제 Open-Meteo 응답, 390px Chromium에서 위치 허용 → "날씨 코디 · 내 위치 근처" → 체험용 옷장 → 날씨 코디·코트 부족 시 실제 상품. **실제 아이폰 Safari의 위치 허용 화면은 확인하지 못했다.**

## 알아 둘 점
- **주소를 아는 사람은 열 수 있다.** 검색 엔진 제외 표시(noindex)는 있지만 접근 통제가 아니다. Cloudflare에 있는 간단한 접근 제한(Settings → General → Enable access policy)은 미리보기 배포만 막고 `pages.dev` 본 주소는 막지 않는다(공식 문서). 본 주소까지 막으려면 Zero Trust(Access) 설정이 따로 필요하다.
- **상품 사진 권리는 확인되지 않았다.** 혼자 쓰는 범위에서만 쓰고, 공개 포트폴리오에는 화면 녹화 영상을 쓰는 게 안전하다.
- **AI 순위 비용:** 검색 한 번에 Claude Haiku 5.5 한 번(추정 1원 미만). 서버 함수는 정해진 순위 요청 형식만 받고, 모델·출력 길이를 고정해 다른 용도로 못 쓰게 했다.
- **옷장 자료는 아이폰에만 있다.** 앱을 지우거나 Safari 방문 기록·웹사이트 데이터를 지우면 함께 지워진다.
- 무료 등급의 요청 수·용량 한도는 Cloudflare 요금 정책에 따른다(혼자 쓰는 양으로는 넘지 않을 것으로 본다, 확인 필요).

## 개발자용
```bash
cd app/lite
npm ci
npm test            # 서버 함수 점검(가짜 Claude·Node 내장 SQLite, 비용 0)
npm run build       # dist/ 생성
node dev.mjs --fake # http://localhost:8790, 가짜 AI 응답. --fake 없이 ANTHROPIC_API_KEY가 있으면 실제 호출
```
- 화면 원본은 `app/mockups/ux10v2/links/d7-simple.html`이고, 빌드가 링크 페이지 전용 줄만 빼서 감싼다. 화면을 고치면 d7을 고친다.
- 확인한 범위(2026-10-20): 서버 함수 점검 5개 통과, `wrangler pages dev`(Cloudflare 실행 환경)에서 키 없음 503·틀린 키 503 응답, 아이폰 크기(390×844) Chromium에서 검색→AI 순위(가짜 응답)→상세, 서비스 워커 등록과 연결 끊김 상태에서 다시 열기. **실제 아이폰 Safari와 실제 Claude 응답은 아직 확인하지 못했다.**
- 확인한 범위(2026-10-21, 사용자 등록 DB): 점검 9개 통과(같은 옷 표기 차이, 기기 3곳 기준, 같은 기기 반복 1회, 철회, 형식 거절, 하루 상한, IP 원문 미저장, 링크 비공개). `wrangler dev`(로컬 D1)에서 등록 → 2곳 기준 도달 → 검색 노출 확인. **실제 Cloudflare D1 연결은 아직 하지 않았다.**
