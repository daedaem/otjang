> 2026-10-25 보존: PR #59의 당시 브랜치 감사 명세다. 아래 삭제·보존 수와 SHA는 10-23 기록이며 이번 작업에서 브랜치를 다시 삭제하거나 현재 미머지 여부를 확정한 것이 아니다. #48은 닫혔고, 예산·백업·반품·MIME는 PR #66(`9826dac`)이 정본이다. 아래 추출 계획은 그 전 기록이다.

# 원격 브랜치 정리 (2026-10-23)

기준 master `7dd61e0`. 삭제 전에 `git log origin/master..branch`와 SHA를 확인했다. 미머지 커밋이 없는 24개만 SHA lease를 걸어 원격 삭제했다. 나머지 7개는 보존한다. 병합 PR이 닫혔다는 사실만으로 squash/rebase된 브랜치를 삭제하지 않는다.

## 삭제 대상

- `claude/account-recovery-20261015` (`b9e4bee`)
- `claude/account-sync-20261015` (`b51a46d`)
- `claude/background-removal-20261015` (`30fb888`)
- `claude/community-20261015` (`a04c930`)
- `claude/core-recommendation-20261015` (`4367999`)
- `claude/photo-registration-20261015` (`d35ae35`)
- `claude/result-feedback-20261015` (`08f1db7`)
- `claude/server-photo-mask-20261015` (`40d8a4b`)
- `codex/master-review-20261021` (`57b2725`)
- `codex/private-ai-connect-20261021` (`e918b2d`)
- `docs/adpick-live-complete-20261022` (`4f790a7`)
- `docs/current-project-handover-20261023` (`1543504`)
- `docs/rakuten-live-handover-20261021` (`e013f0a`)
- `docs/react-rollout-20261023` (`ef27165`)
- `feat/adpick-domestic-search-20261021` (`cb1c84f`)
- `feat/automatic-search-open-catalog-20261022` (`717063f`)
- `feat/codex-service-continuation-20261015` (`ceac321`)
- `feat/editorial-service-ux-20261015` (`37caa78`)
- `feat/instant-wardrobe-demo-20261014` (`6ca51db`)
- `feat/lite-input-drafts-20261023` (`42f9c4c`)
- `feat/lite-react-input-20261023` (`474b08b`)
- `feat/lite-registration-contract-20261023` (`a0c86f4`)
- `feat/open-clothing-sources-20261021` (`ed85131`)
- `feat/rakuten-korean-search-20261021` (`7a92a6b`)

## 보존: master에 없는 커밋

### claude/fashn-vton-m1-test-3ox240 (8개)

- `29e05e7 docs: owner-requirements 끝의 빈 줄 제거 (git diff --check)`
- `7ead658 기록 흐름 점검: 반품 사유 시트, 반품 사유 표시, 상세의 반품 주의`
- `9ab4b09 백업·복원: 기기 저장 개인 자료를 JSON 한 파일로 내보내고 보관본을 남기며 되돌린다`
- `7dd442f 상담 예산 대조: 서버가 후보 가격 판정을 붙이고 반대 서술에 가격 확인 줄을 단다`
- `a05a20c 설치 앱 화면은 d12 유지: d16 채택(SCREEN·검사 경로)을 되돌리고 d16은 PR #48 검토 대기 시안으로만 둔다`
- `b73f3d8 Merge origin/master (사업·개발·인수인계 문서 최신화, AI 403 수정) into claude/fashn-vton-m1-test-3ox240`
- `19a5eee d16: 빈 자리 버튼이 눌리게 무대 role을 group으로, 안 맞는 겉옷은 빈 자리로`
- `c7fff41 d16 옷장 렌즈: 모든 상품을 내 옷장을 통해 보는 화면, 설치 앱 화면으로 교체`

### codex/ai-outfit-test (3개)

- `fb9dee1 style: normalize local outfit trial text files to LF`
- `97828c9 chore: keep local outfit trial files on D drive`
- `d3a521f docs: record local Qwen outfit trial disk safety stop`

### docs/prd-v0.4 (2개)

- `6b2d26f docs: make photo wardrobe onboarding a core product requirement`
- `2b055c6 docs: define WearNext personalized wardrobe planning PRD`

### feat/beta-eoul (27개)

- `a8e45fb feat(app): 5회차 — 보던 상품 흐름·비교 정직성·대안 규칙·산 뒤 상태 (0.9.0-beta)`
- `63f585a docs: 웹판 크기 숫자 맞춤`
- `da1be1a fix(app): 보던 상품 이름·같은 사이즈 치수 차이 — 실제 배포 주소에서 찾은 것`
- `20e3f81 feat(app): 추천 4회차 — 보던 상품 두 칸 비교·조건 경계·결정 고리 상태·추천 먼저 (0.8.0-beta)`
- `f6e63c3 feat(app): 추천 3회차 — 정직한 결론·1순위 문턱·근거 세기, 결정 고리, 보던 상품 견주기 (0.7.0-beta)`
- `668cf65 feat(app): 추천 2회차 — 조건·출처 등급·고정 기준선, 결정 고리, 카탈로그 검사 (0.6.0-beta)`
- `0284f0e feat(app): 기준으로 딱 하나 추천 — 검증 카탈로그(흰 크루넥 티 13개)와 추천 탭`
- `1e14555 fix(app): 삭제를 바로 되게(카드·기록 창·후보) + 7초 되돌리기`
- `d7f6002 docs: 재배포(사진 여러 장·끊겨도 열리기)와 실제 주소 확인 기록`
- `f7b03f3 feat(beta): 옷 사진 여러 장으로 넣기(색 초안)·인터넷이 끊겨도 열리기(서비스 워커)`
- `7d094b4 docs: 지인 베타 배포·실제 주소 확인·새 한계를 상태 문서에 기록`
- `d88d86d chore: 이 작업 환경에 묶인 package-lock.json 을 빼기 (다른 PC 의 npm install 이 새로 만든다)`
- `d2d58e1 feat(beta): 친구에게 물어보기·쇼핑 링크·공유 받기·만족도 질문·운영자 지표·보안 정책·접근성`
- `c44e69a feat(server): 원피스·새 종류·새 색·결정 2주 뒤 물음을 앱과 맞춤 (V4)`
- `dc33905 feat(app): 빠른 시작·원피스 등 분류 확장·결정 2주 뒤 물음 (0.5.0-beta)`
- `dcbfeea feat(beta): 지인 비공개 베타 웹판 0.5.0-beta (화면 이름 어울 임시)`
- `8490330 docs: 밤 인수인계(HEAD·미푸시 없음·16시 이후 변경·실행 명령·검증 성공/실패/미검증·다음 작업)`
- `b96616e feat(3d): V넥 카디건 형태 추가(v0.4.4)`
- `2010108 docs(server): 흉내 API 껍데기에 맞춘 javac 컴파일 결과 기록, 앱 맞추기 연결 상태`
- `e1dc655 feat(app): 내 서버와 맞추기(v0.4.3) — 보내기·받기, 멱등 키, 사진은 이 컴퓨터 주소일 때만 기본 포함`
- `b86075d feat(3d): 크루넥 스웻셔츠 형태 추가(v0.4.2) — 옷본·디테일·굽기·앱·서버 어휘`
- `c6d8f42 feat(app): 사진에서 색 계열·밝기 초안 뽑기(v0.4.1) + docs: 상품 데이터 경로 조사`
- `7e8f7c4 fix(server): 후보 표의 (item_id, position) 유일 제약 제거 — JPA 컬렉션 교체 시 플러시 순서와 충돌`
- `b82f9b9 feat(server): M5 서버 v0.1 — Spring Boot 4.1.1 + PostgreSQL, 옷장 스키마 2 API, 규칙 Java 이식과 골든 교차 검증`
- `3fa370d docs: 진행 상태 2026-10-12와 저장소 구성 안내`
- `ae54a40 chore(blender): 3D 옷장 자산 파이프라인 스크립트 추가`
- `e694083 feat(app): 개인판 v0.4 — 스키마 2, 등록 단계, 3D 옷장 탭, 상품 목록·구매 추천`

### feat/editorial-mobile-20261013 (36개)

- `6c06009 핵심 등록·상품 추천 설계와 운영 검증 인계 기록`
- `b359d60 구매 의향 입력 없이 추천 상품 비교 결과 보기`
- `296eaf2 상품 결과와 사진 색 확인을 먼저 보여주기`
- `3f80f6a 사진 등록과 실제 상품 추천을 한 흐름으로 연결`
- `b30d29a Document pull repair provenance and verified release scope`
- `2cef233 Preserve edits and account state when pull persistence fails`
- `86c5bae docs: record capacity rules product flow and VTON quality hold`
- `d7dfa70 fix: preserve legacy records and connect exact product comparisons`
- `e508ecb fix: wait for purchase persistence and compensate failed snapshots`
- `b7584e9 fix: keep the known revision when the sync stamp is missing`
- `d81e2a1 docs: record system decisions and developer operations handover`
- `cf53388 fix: preserve purchase follow-up across sync and storage`
- `76eb156 fix: link legacy purchase records`
- `de48315 feat: connect product import and purchase follow-up flow`
- `acf663a fix: validate inline scripts during build`
- `b7b540d fix: preserve pasted candidate details without a title`
- `858cad1 fix: unify candidate intake and follow-up records`
- `a746f60 feat: record purchase fit and return outcomes`
- `31e38f0 fix: surface purchase follow-up and draft review`
- `a9385bb fix: apply wardrobe improvements under app source`
- `d07e989 fix: improve wardrobe confirmation and purchase follow-up`
- `779cc1b feat: streamline wardrobe confirmation and purchase follow-up`
- `69d35fb feat: connect wardrobe purchase journey`
- `e651994 feat: show exact products in wardrobe recommendations`
- `c5e545f feat: integrate wardrobe recommendations and editorial mobile preview`
- `8490330 docs: 밤 인수인계(HEAD·미푸시 없음·16시 이후 변경·실행 명령·검증 성공/실패/미검증·다음 작업)`
- `b96616e feat(3d): V넥 카디건 형태 추가(v0.4.4)`
- `2010108 docs(server): 흉내 API 껍데기에 맞춘 javac 컴파일 결과 기록, 앱 맞추기 연결 상태`
- `e1dc655 feat(app): 내 서버와 맞추기(v0.4.3) — 보내기·받기, 멱등 키, 사진은 이 컴퓨터 주소일 때만 기본 포함`
- `b86075d feat(3d): 크루넥 스웻셔츠 형태 추가(v0.4.2) — 옷본·디테일·굽기·앱·서버 어휘`
- `c6d8f42 feat(app): 사진에서 색 계열·밝기 초안 뽑기(v0.4.1) + docs: 상품 데이터 경로 조사`
- `7e8f7c4 fix(server): 후보 표의 (item_id, position) 유일 제약 제거 — JPA 컬렉션 교체 시 플러시 순서와 충돌`
- `b82f9b9 feat(server): M5 서버 v0.1 — Spring Boot 4.1.1 + PostgreSQL, 옷장 스키마 2 API, 규칙 Java 이식과 골든 교차 검증`
- `3fa370d docs: 진행 상태 2026-10-12와 저장소 구성 안내`
- `ae54a40 chore(blender): 3D 옷장 자산 파이프라인 스크립트 추가`
- `e694083 feat(app): 개인판 v0.4 — 스키마 2, 등록 단계, 3D 옷장 탭, 상품 목록·구매 추천`

### feat/personal-app-v0.4 (11개)

- `8490330 docs: 밤 인수인계(HEAD·미푸시 없음·16시 이후 변경·실행 명령·검증 성공/실패/미검증·다음 작업)`
- `b96616e feat(3d): V넥 카디건 형태 추가(v0.4.4)`
- `2010108 docs(server): 흉내 API 껍데기에 맞춘 javac 컴파일 결과 기록, 앱 맞추기 연결 상태`
- `e1dc655 feat(app): 내 서버와 맞추기(v0.4.3) — 보내기·받기, 멱등 키, 사진은 이 컴퓨터 주소일 때만 기본 포함`
- `b86075d feat(3d): 크루넥 스웻셔츠 형태 추가(v0.4.2) — 옷본·디테일·굽기·앱·서버 어휘`
- `c6d8f42 feat(app): 사진에서 색 계열·밝기 초안 뽑기(v0.4.1) + docs: 상품 데이터 경로 조사`
- `7e8f7c4 fix(server): 후보 표의 (item_id, position) 유일 제약 제거 — JPA 컬렉션 교체 시 플러시 순서와 충돌`
- `b82f9b9 feat(server): M5 서버 v0.1 — Spring Boot 4.1.1 + PostgreSQL, 옷장 스키마 2 API, 규칙 Java 이식과 골든 교차 검증`
- `3fa370d docs: 진행 상태 2026-10-12와 저장소 구성 안내`
- `ae54a40 chore(blender): 3D 옷장 자산 파이프라인 스크립트 추가`
- `e694083 feat(app): 개인판 v0.4 — 스키마 2, 등록 단계, 3D 옷장 탭, 상품 목록·구매 추천`

### feat/wearnext-prototype (9개)

- `8ec8dc5 docs: link the live GitHub Pages wardrobe preview`
- `8426a83 feat: preserve wardrobe scenes and refine mobile inspection`
- `9a20a72 docs: compare Claude wardrobe with current prototype and prioritize improvements`
- `8c20afa feat: refine wardrobe visuals and persist confirmed AI recommendations`
- `049d5d7 docs: compare Claude original and record wardrobe visual redesign criteria`
- `be6366e feat: build Blender wardrobe room and connect garment selection`
- `64c6f1a feat: deliver local WearNext wardrobe prototype from photos to purchase decisions`
- `6b2d26f docs: make photo wardrobe onboarding a core product requirement`
- `2b055c6 docs: define WearNext personalized wardrobe planning PRD`

## PR #48 처리

PR은 CLOSED이며 원본 브랜치는 미머지 커밋 보존 대상으로 남겼다. 예산 파서/판정 대조, JSON 백업/복원, dev MIME는 별도 PR로 추출한다. 추가 구매/반품 UX는 추출하지 않는다. d16은 [디자인 참고](../../design/README.md)로만 보존했다.

## 기준 검사

변경 전후 app 688 통과, lite 155 통과, server 50개 중 49 통과·1 skip(실제 ONNX 모델/런타임 없음)이다. 이 준비 PR에는 운영 코드 변경이 없고 테스트 삭제도 없다. 모바일 Chromium 공통 E2E 11개는 별도 실행한다. WebKit은 기존 CI 프로젝트를 유지한다.
