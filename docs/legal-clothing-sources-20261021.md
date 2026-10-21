# Rakuten · Open Products Facts 적용 인계 (2026-10-21)

## 요청·완료 기준 / 이슈 초안

대표 요청: 기존 관심 브랜드에만 한정하지 않고 합법적으로 쓸 수 있는 상품을 적용한다. 두 공급원의 실제 의류를 확인하고, 가능한 기능을 앱에 연결한다. 대표는 Rakuten 키가 없으며 직접 발급하겠다고 했다. 이번 작업은 개발·로컬 검증이며 공개 출시·계정 생성·사진 외부 전송을 승인한 작업이 아니다. 별도 GitHub 이슈는 만들지 않았다.

완료 기준: 실제 데이터 증거, 공급원별 권리·제약 기록, 키 없이 가능한 공개 검색·선택·등록, 키를 서버에만 두는 Rakuten 검색 연결부, 0건/실패/미설정 표시, 기존 저장소·구매 기록 보존. 실제 Rakuten API 응답과 운영 반영은 키 입력·배포 후 별도 확인해야 한다.

## 실제로 확인한 상품

### Open Products Facts — API 실응답

`https://world.openproductsfacts.org/api/v2/search`에 `categories_tags_en=clothing`과 제한한 fields/page를 요청했다. 식별 가능한 앱 User-Agent를 사용했다. 공개 읽기, 인증키·개인 사진·옷장 전송 없음. 검색 분류의 응답 count는 **240건**이다. 이 수치는 OPF 전체 상품 수도, 패션 시장 전체 수량도 아니다.

유지보수 명령의 검색 3회로 해당 작은 분류를 받았다. 이름·브랜드·숫자 식별자 누락, unknown 브랜드, 로딩 문구, 기저귀 분류, 가격 기호가 섞인 이름 등을 제외해 **194건**, 제외 **46건**을 만들었다. 해당 기준은 자동 품질 필터이며 상품 진위·정확성 검수를 완료했다는 뜻이 아니다. 카테고리 오분류와 일반적인 이름이 여전히 있을 수 있다.

| 브랜드 | 실응답의 상품명 | 원본 코드 |
|---|---|---|
| Uniqlo | Dry Crew Neck Short Sleeve T-Shirt | 2000209608913 |
| Uniqlo | Dry-EX T-Shirt | 2000219055691 |
| Levi's | Jean 511 slim | 0195901304217 |
| Brandit | Flannel Shirt Long Sleeve | 4051773180884 |
| Brandit | Women M65 Pants | 4051773053607 |
| Guess | T-Shirt | 7623846231990 |
| Celio | Manteau long avec capuche | 3596655536614 |

원본은 `https://world.openproductsfacts.org/product/{코드}`. 받은 JSON은 `app/lite/data/open-products/clothing.json`에 분리했다. 이름은 번역·개명하지 않았다. 현재 가격·재고·구매 제안이 없어 구매 추천용 가격 카탈로그로 승격하지 않는다. 사진은 이번 데이터 파일에 포함하지 않는다.

### Rakuten — 판매 페이지 실물 확인, API 실호출과 구별

다음은 공식 판매 페이지를 읽어 존재를 확인한 예시다. HTML에서 가격·사진을 수집해 앱 DB로 만들지 않았다. 최신 API 검색의 노출·재고·가격·한국 구매 가능 여부를 검증한 목록은 아니다.

- [Levi's 공식 판매점 PREMIUM BLACK 501 LOOSE JEANS](https://item.rakuten.co.jp/levis/sv3972/)
- [Jalana Levi's 501-0000 리지드 진](https://item.rakuten.co.jp/jalana/levis_501/)
- [Being POLO Ralph Lauren 클래식핏 가먼트다이 옥스포드 셔츠 888705](https://item.rakuten.co.jp/globe-int/ing-rl-888705/)

검색어 동명이인 주의: 발견한 `Bronson Logo S/S Tee`는 NHS 브랜드여서 대표가 말한 Bronson Mfg 입점을 입증하지 않는다. WANNA의 `POTTERY SHIRTS`도 한국 POTTERY 브랜드 입점 근거로 세지 않는다. 실응답에서 브랜드가 별도 확정되지 않은 Rakuten 상품명에서 브랜드를 추정하지 않는다.

## 왜 이렇게 연결했나

OPF는 상업 재사용이 가능한 공개 데이터이며 출처·ODbL 조건을 유지해야 한다. 공급자가 게시한 [dataset 설명](https://www.data.gouv.fr/datasets/open-products-facts), [공식 라이선스 안내](https://openfoodfacts.github.io/openfoodfacts-server/api/tutorials/license-be-on-the-legal-side/), [다른 프로젝트 API 설명](https://openfoodfacts.github.io/openfoodfacts-server/api/tutorials/scanning-cosmetics-pet-food-and-other-products/)을 확인했다. 데이터베이스 ODbL·개별 내용 DbCL·사진 CC BY-SA를 구분한다. 이번에는 사진을 재사용하지 않는다.

소스·라이선스·수정 설명과 원본 링크를 공개 데이터 파일에 남기고 UI에 데이터 다운로드를 제공한다. 판매처 937건 DB, 서버 AI 후보와 합치지 않는다. 이 정도 크기는 파일 한 번을 받아 기기 안에서 찾을 수 있으므로 검색어마다 외부 API를 호출할 이유가 없다. 사용자가 선택한 사실만 개인 등록 폼에 미리 채우고, 종류·색·실제 보유를 확인한 뒤 등록한다. 출처를 `REG.items`의 선택적인 `source` 필드로 남기며 기존 저장 키·구매 기록은 바꾸지 않는다. 공개 DB를 3명의 독립된 사용자 확인으로 오해하지 않도록 OPF에서 시작한 등록은 공용 집계로 보내지 않는다.

라쿠텐은 [공식 FAQ](https://webservice.faq.rakuten.net/hc/en-us/articles/900001971983-Are-Rakuten-Webservice-APIs-free-to-use)에서 현재 API 무료라고 안내한다. [이용 용도 안내](https://webservice.faq.rakuten.net/hc/en-us/articles/900001974363-How-can-the-information-returned-by-the-Rakuten-Webservice-APIs-be-used)는 소프트웨어에서 상품을 소개하고 해당 라쿠텐 상품으로 연결하는 용도를 명시한다. 그래서 결과를 제공자 순서로 표시하고 원문 제목·JPY 가격·사진 주소·상점·원본 링크를 쓴다. AI 재정렬·외부 모델 전송·상품 DB 복제·사진 가공·다른 제휴 링크 전환은 이번 연결에 포함하지 않는다. 그런 확장은 명시된 용도를 벗어나는지 따로 확인할 일이며, 일반 API 표시 자체가 불법이라는 결론이 아니다. [브랜드 표시 공식 스니펫](https://webservice.rakuten.co.jp/guide/credit)을 성공 응답에 그대로 넣는다.

## 구현 위치와 흐름

- `app/lite/src/open-products.mjs`: 공개 상품 정규화, 한국어 브랜드 별칭, AND 검색, 미확인 필드를 비운 등록 초안. 빈 결과에 다른 상품을 대신 채우지 않는다.
- `app/lite/tools/refresh-open-products.mjs`: 명시적 유지보수 실행만 허용. 페이지 보기·빌드·CI에서 실행하지 않는다. 공식 검색 문서의 v2 endpoint를 사용한다(일반 상품 조회에는 v3 권장). 3회 이내, 6.1초 간격. 분류가 300건을 넘거나 불완전하면 기존 파일을 남기고 멈추며 공식 export 도입을 검토한다.
- `app/lite/data/open-products/`: 194건의 독립 ODbL JSON·라이선스/변경 안내. 빌드가 `/data/open-products/`로 복사한다.
- `app/mockups/ux10v2/links/d12-hang.html`: 옷장 → 옷 넣기 → 검색 → 공개 정보 선택 → 확인 등록. 조회·등록 상세의 원본 출처 표시. 검색 결과/추가 화면에 별도 라쿠텐 전체 검색 버튼·사이트 링크. 기존 앱의 조건을 라쿠텐 검색에 적용했다고 주장하지 않는다.
- `app/lite/src/lite.js`: 클릭 시 같은 origin의 `/api/rakuten?q=`만 호출한다. 개인 옷장·대화·사진·키를 보내지 않는다.
- `app/lite/functions/api/rakuten.js`: `20260701` 공식 endpoint로만 연결, Access Key는 헤더, App ID는 제공자 규격의 쿼리. 임의 호스트·URL은 입력받지 않는다. GET/길이/UTF-8 바이트 제한, 12개·1MB·8초 상한, 안전한 상품/이미지 호스트만 허용. raw 오류·키를 응답·로그에 남기지 않는다. DB에는 상품·검색어가 아닌 120초 만료 요청 카운터만 저장한다. 전역 초당 1회·분당 시도 10회(거절된 동시 시도도 분 한도에 포함). API 실패 시 가짜 상품을 반환하지 않는다.
- `app/lite/worker.js`: 기존 본인 인증 뒤에 `/api/rakuten` 경로를 둔다. Pages entry도 별도로 인증 실패 시 닫힌다. 새로운 외부 JS SDK나 유료 패키지를 추가하지 않았다.

## 대표가 키를 만들 때

1. [Rakuten Web Service](https://webservice.rakuten.co.jp/) 로그인 → 앱 등록. [등록 안내](https://webservice.rakuten.co.jp/guide).
2. Application URL / allowed website에는 실제 앱의 `https://otjang.tg8685.workers.dev`를 등록하고, 애플리케이션 타입은 서버에서 호출하는 실제 방식에 맞춘다. 사용 목적에는 ‘패션 상품 검색 후 라쿠텐 상품 원문·가격·상점·이미지·구매 링크 표시’를 사실대로 기재한다. API access scope는 Ichiba Item Search, 요청량은 초당 최대 1회·분당 최대 10회로 기재한다. 사이트/접근 허용 조건은 발급 화면의 실제 안내를 따른다.
3. 발급되는 Application ID와 Access Key는 애드픽·Anthropic 키와 별개다. **채팅·Git·브라우저 번들·빌드 변수에 넣지 않는다.**
4. Cloudflare → Workers & Pages → `otjang` → Settings → Variables and Secrets에서 **Secret** 두 개: `RAKUTEN_APPLICATION_ID`, `RAKUTEN_ACCESS_KEY`. 기존 `ANTHROPIC_API_KEY`, `PRIVATE_APP_ACCESS_KEY`, `PRIVATE_AUTH_MODE`는 그대로 둔다. 새 비밀값 입력·확인·제출은 대표가 직접 한다. 이 문서 작성 시에는 아직 입력하지 않았다.
5. 키를 넣는 것과 새 코드 배포는 별개다. 대표의 Git push/병합 지시에 맞춰 비공개 master 배포 후 실제 본인 로그인에서 1회 상품 검색, JPY·원본 링크·사진·출처·0건/실패를 확인한다. 등록한 allowed website/서버 방식에서 인증이 거절되면 공식 오류 문서와 허용 설정을 먼저 확인한다. 새 인증·운영 성공을 추정하지 않는다.

## 검증과 남은 일

- 공개 API 240건 실응답 및 받은 독립 JSON 194건: 확인.
- lite 자동 검사: **105/105 통과**. 서버 키/권한/입력/URL·응답 크기·시간·실제 SQLite 카운터 상한을 합성 데이터로 검사한다. 유료 AI나 Rakuten 실키는 사용하지 않는다.
- Chrome 로컬 실제 UI: 유니클로 3건 검색, Dry-EX 선택 시 이름·브랜드 미리 채움, 다른 브랜드 추천을 끼워 넣지 않음, 종류·색 미선택 시 등록 비활성, 선택 뒤 QA 옷장 1벌 저장·원본 출처 확인. 390×844 화면을 확인했다. 실제 본인 옷장·상담·구매 기록은 접근/변경하지 않았다.
- 새로고침 후 QA 등록·출처 유지 확인. 최종 생성물에서 공개 목록 0건, 관련 없는 상품 미노출, Rakuten 키 미설정 503의 실제 화면 안내를 확인했다. PC 기본 화면 크기도 확인하고 임시 viewport 설정을 해제했다. 로컬 정적 서버의 재빌드/캐시 혼선을 피하기 위해 절대 dist 경로·no-store를 쓰는 별도 loopback QA 서버(18932)에서 최종 확인했다. 이 서버에는 실제 키/DB가 없으며 제공자 인증 성공을 뜻하지 않는다.
- **미검증/미실행:** 실제 Rakuten API 키·허용 사이트/서버 환경·유효 응답, Cloudflare 새 운영 배포, 실물 iPhone, 최저가 보장, OPF 전체 품질 보증, 기존 937건의 출시 권리, Rakuten AI 가공 범위 확장.

### 실행 기록

구현 브랜치: `feat/open-clothing-sources-20261021` (분리된 작업 사본, 원래 작업 폴더의 미추적 파일 보존). 운영 배포·push·PR 병합은 하지 않았다. 생성 dist/·개인 사진·키를 Git에 넣지 않는다.

- `cd app/lite && npm test`: 105개 통과, 실패 0.
- `cd app/lite && npm run build`: 파일 24개, 자산 버전 `13e4bc73e808`.
- `WRANGLER_SEND_METRICS=false npx --yes wrangler@4.151.0 deploy --dry-run --outdir /private/tmp/otjang-open-sources-dryrun`: 성공. 실제 업로드/운영 Secret 변경 없음.
- `git diff --check`: 통과. GitHub CI·운영 배포 검사를 실행한 것으로 쓰지 않는다.

## 키 발급 이후 연결 작업 (같은 날, 진행 중)

대표가 ‘발급 완료했어요 이제 연결해주세요 그리고 무료가 맞는지’ 요청했다. 라쿠텐 공식 무료 FAQ를 다시 확인했다. API 무료와 기존 Claude API·Cloudflare 자원 비용은 별개이며, 라쿠텐 검색 경로는 Claude를 호출하지 않는다.

대표가 라쿠텐의 Web Application 등록·약관/CAPTCHA·발급을 직접 완료했다. 등록 사이트는 `otjang.tg8685.workers.dev`다. 서버 전용 타입은 고정 IP 목록을 요구하므로 현재 Workers 구성에서 해당 타입으로 인증된다고 주장하지 않는다. 실제 등록한 웹 앱의 고정 Origin/Referer를 서버에서 보내되, 사용자 요청의 Origin을 넘기거나 키를 프런트로 옮기지 않는다. 허용 여부는 실제 제공자 응답으로 확인한다.

대표가 Cloudflare 런타임 Secret 2개의 값 입력·저장·배포를 직접 완료했다. Codex는 입력 창이 닫힌 뒤 `RAKUTEN_APPLICATION_ID`, `RAKUTEN_ACCESS_KEY` 두 행의 ‘비밀 / 암호화된 값’ 표시만 확인했다. 새 비밀값을 읽거나 출력하지 않았다. 본인 로그인·기존 AI 키/한도·공개 차단을 유지한다. 제공자 인증 실패는 raw 본문 대신 안전한 `provider_auth`·HTTP 상태만 표시한다.

후속 검사: lite **106/106**, build 자산 버전 `13e4bc73e808`, diff 공백 검사 통과. 코드 push/PR·CI·master 비공개 배포·실제 검색 증거는 실행 뒤 추가한다. API 키 발급/기술 연결은 전체 상용 이용 권한 검토 완료와 다르다. 등록 화면 영문 약관의 비공개 환경 제한 등은 일본어 원문·공식 운영 해석에 맞춰 확인해야 하며, 일반 공개·AI 재가공·타 제휴 수익 사용을 승인받았다고 쓰지 않는다.

### 첫 운영 검사와 후속 수정

PR #31 head `ed85131`의 GitHub push/PR 검사 6개(3종 중복 실행)가 성공했고 master `9841ed1`로 병합했다. Cloudflare master 빌드 `bd89f5b2`에서 자산 `13e4bc73e808`을 만들었다. 별도 브랜치 preview 실패 `abe9d193`는 루트 `/opt/buildhome/repo/package.json` ENOENT로 확인했고 운영 master 설정(`app/lite`)과 구분한다.

운영 UI에서 `Levis 501`을 입력하고 Rakuten 조회를 실행했으나 일반 upstream 오류를 받았다. 직접 연 동일 앱 API JSON에서도 같은 안전한 오류를 확인했다. 이 시점에는 실제 연결 성공이 아니다. 원문/비밀값을 출력하지 않고 시간초과·비JSON·상품 구조 오류를 구분한다. 구조 오류에는 미리 정한 공개 스키마 필드 이름만 허용하며 공급자 원문 값·오류 설명을 싣지 않는다.

추가로 새 HTML과 기존 서비스워커의 캐시된 `lite.js`가 섞여 버튼이 없는 상태를 관찰했다(추가 새로고침 후 나타남). 기존 서비스워커가 쿼리를 무시하므로 `?v=`로 해결하지 않고 JS/mjs 파일 내용 해시를 경로에 넣는다. 예전 경로는 이전 화면 호환용으로 제공하되 새 설치 캐시는 해시 파일만 저장한다. 옷장·기록 localStorage는 변경/삭제하지 않는다.

공식 [20260701 문서의 formatVersion 설명](https://webservice.rakuten.co.jp/documentation/ichiba-item-search)에는 소문자 `items`/`item`, 버전 2의 평탄화 배열을 명시한다. 이전 Codex 코드가 대문자 `Items`에만 의존하고 합성 응답도 옛 형식을 사용한 것이 오류다. 현행 문서 형식을 먼저 읽도록 수정하고 `formatVersion=2`를 명시했다. 소문자 wrapper·평탄화 상품·문자열 이미지 배열·빈 결과를 검사한다. 실제 성공은 새 운영 버전에서 별도 확인한다.
