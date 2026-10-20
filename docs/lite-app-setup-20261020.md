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
npm test            # 서버 함수 점검(가짜 Claude, 비용 0)
npm run build       # dist/ 생성
node dev.mjs --fake # http://localhost:8790, 가짜 AI 응답. --fake 없이 ANTHROPIC_API_KEY가 있으면 실제 호출
```
- 화면 원본은 `app/mockups/ux10v2/links/d7-simple.html`이고, 빌드가 링크 페이지 전용 줄만 빼서 감싼다. 화면을 고치면 d7을 고친다.
- 확인한 범위(2026-10-20): 서버 함수 점검 5개 통과, `wrangler pages dev`(Cloudflare 실행 환경)에서 키 없음 503·틀린 키 503 응답, 아이폰 크기(390×844) Chromium에서 검색→AI 순위(가짜 응답)→상세, 서비스 워커 등록과 연결 끊김 상태에서 다시 열기. **실제 아이폰 Safari와 실제 Claude 응답은 아직 확인하지 못했다.**
