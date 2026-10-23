# lite 운영 코드 의존성·위치 정리 (2026-10-23)

이동 전 master `7dd61e0` 및 A 추출본을 기준으로 조사한 실제 import/build 의존성이다. 대표에게 목록을 보고한 뒤 B 이동을 진행했다. 기능 추가와 데이터/인증/공급자 변경을 포함하지 않는다.

## 단일 도메인 원본

`app/lite/src/domain/`에 다음 20개를 옮겼다. legacy 앱/서버도 이 원본을 import한다. `legacy-wardrobe.js`, `legacy-purchase-v4.js`는 현재 자료 마이그레이션의 활성 의존성이므로 legacy 디렉터리로 보내지 않았다.

- `data/looks.js`, `data/products.js`, `data/slots.js`
- `catalog-policy.js`, `engine.js`, `legacy-purchase-v4.js`, `legacy-wardrobe.js`, `lite-registration.js`
- `offer-store.js`, `offers.js`, `outfit-copy.js`
- `purchase-candidate.js`, `purchase-journey.js`, `purchase-plan-context.js`
- `query.js`, `related-returns.js`, `search-follow-up.js`, `wardrobe-plan.js`, `wardrobe.js`, `wear-log.js`

Worker의 rank는 products/slots, catalog는 wardrobe/slots를 직접 읽는다. lite에는 server import가 없다.

## 운영 입력 경로

- `app/mockups/ux10v2/links/d12-hang.html` → `app/lite/src/screen.html`
- `app/mockups/ux10v2/src/core.mjs` → `app/lite/src/core.mjs`
- `design/cutouts.js`, `links/shared/{kit,photo-kinds,ai-rank}.js` → `app/lite/src/browser/`
- 앱 아이콘 5개 → `app/lite/public/icons/`
- 코어 생성기 → `app/lite/tools/build-core.mjs`
- 추적한 `shared/eoul-mock.js` → 무시하는 `app/lite/.generated/core-bundle.js`, test/build 전에 생성

브라우저 호환 API 이름과 저장된 데이터 키는 유지한다. 생성 산출물을 소스로 취급하지 않으며 lite 빌드의 산출 자산 이름은 core-bundle이다. 시안은 `docs/design/mockups/`, 기존 단독 앱·Node서버·배포키트는 `legacy/{app,server,deploy}`로 이동했다. 예전 화면을 운영 빌드 입력으로 사용하지 않는다. 디자인 참고 HTML은 과거 상대 자산 문맥을 보존한 자료이며 현재 운영 경로가 아니다.

## 테스트 이전과 실행

코어 날씨 검사 5개를 이전 app 테스트 탐색에서 lite checks로 옮겼다. A 완료 상태 app688/lite170/server50에서 B는 legacy app683/lite175/server50이므로 **총908개로 동일**하다. app에서 줄어든 5개를 삭제한 것이 아니다. 서버의 실모델 1skip도 기존과 같다. Chromium E2E13개를 유지한다. CI는 lite와 legacy 앱/서버/이미지를 별도 job으로 실행한다.

로컬 Docker 검사는 상속 proxy와 세션 CA를 임시 Dockerfile에만 마운트해 실행했고 저장소에 환경 전용 CA 설정을 넣지 않았다. 비루트 uid1000, health·brotli HTML·manifest·SW·아이콘 응답을 확인했다. 실기기·운영 DB/배포 검사로 해석하지 않는다.
