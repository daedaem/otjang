# 사업·개발·인수인계 최신 문서 목차

갱신: **2026-10-23**. Claude와 Codex가 대화가 바뀌어도 먼저 읽을 시작점이다. 운영 코드 기준은 정리 시작 시 master `7dd61e0677ff4fe6c738eea2b597cce1f2e6c785`이며 마지막 실운영 확인은 **2026-10-22**다. 문서 변경 커밋을 앱 기능 변경·새 실기기 검증·새로운 사업 승인으로 해석하지 않는다.

최신 검토본은 저장소 정리 PR [#59](https://github.com/daedaem/otjang/pull/59)~[#64](https://github.com/daedaem/otjang/pull/64)다. 브랜치 감사·#48 분리, lite 운영/legacy 경계 정리, 입력 초안 상태 통합·React 진입 로딩을 순서대로 검토한다. 이 정리 PR들은 **미병합·미배포**이며 운영 반영된 #52~#57과 구분한다. 현행 문서는 이 목차와 [대표 요구사항](owner-requirements.md)·[사업 계획](business-plan.md)·[개발 계획](development-plan.md)·[시스템 인수인계](system-handover.md) 다섯 파일이다. 날짜별 근거는 `log/YYYY-MM/`, 디자인 참고는 `design/`에서 보존한다.

기존 [입력 전환·저장 계약·D1·추천 계획](log/2026-10/react-storage-plan-20261022.md)은 작성 당시 근거다. 최신 검사와 남은 범위는 아래 현행 개발 계획·인수인계를 따른다.

## 무엇부터 읽을까

| 순서 | 문서 | 역할 |
|---|---|---|
| 1 | [대표 요구사항](owner-requirements.md) | 대표 결정의 기준. 원스톱 범위·옷장 선택·비용/개인정보 경계·변경 이력 |
| 2 | [현재 사업 계획](business-plan.md) | 해결할 문제·고객 흐름·수익 방향·차별화 가설·미확정 사항 |
| 3 | [현재 개발 계획](development-plan.md) | 현재 구현과 남은 간극·우선순위 제안·의존성·완료 증거 |
| 4 | [시스템·운영 인수인계](system-handover.md) | 앱 경계·저장소/DB·공급처·인증·최종 배포 기록·장애 확인·복구 주의 |
| 5 | [누락 검토 근거 회수](log/2026-10/reference-recovery-20261023.md) | 로컬에 남았던 16개 자료의 처리 명세·선별한 결정 근거·원본 해시 |
| 필요할 때 | [디자인 참고 원장](log/2026-10/research/design-reference-ledger-20261020.md) | 당시 AI 관찰 241개를 공개 가능한 형태로 보존. 새 수상작 검증이나 실제 디자이너 참여가 아님 |

현재 사용자 지시가 우선이다. 저장소에서는 대표 요구사항의 최신 명시 결정을 우선하고, 사업/개발/운영 문서는 그 결정을 구체화한다. 과거 제안·미검증 가설이 새 대표 결정을 대신하지 않는다. 코드와 실행 결과는 구현 상태의 근거지만 사업 목표를 축소하는 권한은 아니다. 충돌은 날짜·근거와 함께 정정하고 원래 판단 이력은 보존한다.

## 현재 합의와 확인 상태

- **목표:** 대충 말해도 나에게 맞는 실제 상품을 고르고, 내 옷과 비교해 새 상품·중고 구매 및 구매 후 기록으로 이어지는 원스톱 서비스. 옷장 등록은 선택이다. 커뮤니티·사진 식별·가상 착용·정확한 가격/옵션 비교·확인된 주문은 장기 목표에서 삭제하지 않는다.
- **지금:** 본인 전용 비공개 시험판과 포트폴리오다. 정리 검토본의 운영 입력은 `app/lite/src/screen.html`·`core.mjs`이며 활성 도메인은 `src/domain/`에 있다. 이전 앱·자체 서버·배포 묶음은 `legacy/`, 시안은 `docs/design/mockups/`에 격리했다. 검토본 경로를 현재 운영 배포 완료로 해석하지 않는다.
- **실행 증거:** PR #47의 실제 AI 5회·제공자 로그 대조·미인증 401·배포/검사 기록은 [인수인계](system-handover.md)에 옮겼다. 장기 무장애·추천 정확도·실물 아이폰 검증은 아니다.
- **남은 핵심:** 예산 설명 오류, lite 개인 백업/복원·자료 보존, 실물 아이폰 왕복, 후보/옵션/기록 연결, 출시 권리가 확인된 공급, 중고 실제 매물 경로. 우선순위는 [개발 계획](development-plan.md)의 제안으로 관리한다.
- **공급:** 과거 카탈로그 937건은 공개 권리 미확인. 애드픽/Rakuten 키워드 검색은 예산·핏 적용이나 상품별 AI 재정렬과 다르다. OPF 194건은 별도 ODbL DB와 AI 후보 비교가 있으나 가격·재고·구매처는 없다.
- **PR #48:** 2026-10-23에 **CLOSED·미병합**으로 정리했다. 예산 대조는 [#60](https://github.com/daedaem/otjang/pull/60), JSON 백업 저장 계약은 [#61](https://github.com/daedaem/otjang/pull/61), 개발 서버 MIME은 [#62](https://github.com/daedaem/otjang/pull/62)로 분리했다. d16은 [디자인 참고](design/README.md)로만 보존한다. 원본 브랜치의 미머지 커밋은 삭제하지 않았다.

## Claude·Codex가 매번 남길 것

[AGENTS.md](../AGENTS.md)와 [CLAUDE.md](../CLAUDE.md)가 이 목차로 연결한다. 작업 시작 시 현재 브랜치/HEAD/원격·관련 PR을 확인하고, 작업 종료 시 새 결정은 요구사항, 진행·완료 기준은 개발 계획, 배포·설정은 시스템 인수인계에 반영한다. PR 댓글만 읽어야 알 수 있는 최종 상태를 남기지 않는다. 병합 후에 생긴 결과는 문서 후속 커밋으로 옮긴다.

“사용자 결정 / 인계 요구 / 제안 / 검증 사실 / 미검증 가설”은 [CONTRIBUTING.md](../CONTRIBUTING.md)의 뜻으로 사용한다. 실제 인간 전문가·이용자·거래·수익을 만들거나 AI 역할 검토로 대체하지 않는다. 요구사항이 저장돼 있다는 사실과 제품이 완성됐다는 판단도 구분한다.

## Git에 남기는 것과 따로 보존하는 것

저장소는 기준일에 **공개(Public)**다. 이 정리는 대표가 요청한 공개 가능한 사업·설계·선별 근거의 보존이며, 개인 사진·옷장 원본·실제 구매내역·대화 원문·키·쿠키·실제 DB를 일괄 공개하는 승인이 아니다. 원본 인수 자료와 개인 실행 HTML·운영 DB는 기존 제외 규칙을 유지한다. [회수 명세](log/2026-10/reference-recovery-20261023.md)에 공개 요약/이미 반영/역사 보존/제외 사유를 구분했다. 로컬 Git 추적과 GitHub master 포함 여부도 구분한다.

복구한 요약과 원장은 빠졌던 **결정 근거**를 보존한 것이다. 과거 실험 코드·전체 대화·개인 자료까지 전부 master로 병합한 작업이 아니며, 원본 파일은 변경하지 않았다. 원문 전체가 필요하면 로컬 보존 원본과 해시를 대조한다.

## 날짜별 기록 찾아보기

아래 자료는 해당 날짜의 원래 검토·구현·운영 근거다. 문서 안의 “현재·완료·다음”을 오늘 상태로 그대로 복사하지 않는다. 최신 기준과 다르면 위 현행 문서와 후속 정정을 먼저 읽는다. 제목의 ‘완료·최종’만으로 출시 완료를 판정하지 않는다.

| 기록 | 당시 주제 |
|---|---|
| [account-sync-20261015.md](log/2026-10/account-sync-20261015.md) | 계정과 옷장 동기화 (2026-10-15, Claude) |
| [acloset-comparison-20261014.md](log/2026-10/acloset-comparison-20261014.md) | 에이클로젯 vs 어울 비교 시험 (사용자 1인, 약 40분) |
| [adpick-domestic-search-20261021.md](log/2026-10/adpick-domestic-search-20261021.md) | 애드픽 국내 상품 연결 인계 — 2026-10-21 |
| [ai-provider-403-20261022.md](log/2026-10/ai-provider-403-20261022.md) | 비공개 AI 403 진단 및 수정 — 2026-10-22 |
| [ask-first-20261017.md](log/2026-10/ask-first-20261017.md) | 한 줄로 묻기 먼저, 옷장은 선택 (2026-10-17) |
| [automatic-search-open-catalog-20261022.md](log/2026-10/automatic-search-open-catalog-20261022.md) | 한 번 검색 · 공개 상품 DB · AI 후보 비교 (2026-10-22) |
| [background-removal-20261015.md](log/2026-10/background-removal-20261015.md) | 배경 지우기 시험과 적용 (2026-10-15, Claude) |
| [branch-reconciliation-20261016.md](log/2026-10/branch-reconciliation-20261016.md) | 갈라진 줄기 정리와 합칠 목록 (2026-10-16) |
| [business-roadmap-20261015.md](log/2026-10/business-roadmap-20261015.md) | 어울 사업 로드맵 — 2026-10-15 |
| [claude-codex-integration-20261014.md](log/2026-10/claude-codex-integration-20261014.md) | Claude·Codex 통합 기록 — 2026-10-14 |
| [claude-instant-handoff-20261014.md](log/2026-10/claude-instant-handoff-20261014.md) | Claude 새 앱 검토와 즉시 체험 변경 인계 |
| [closet-consistency-20261018.md](log/2026-10/closet-consistency-20261018.md) | 옷장 판정이 화면마다 같은 말을 하게 (2026-10-18) |
| [closet-first-20261017.md](log/2026-10/closet-first-20261017.md) | 옷장에서 시작하는 첫 경험 (2026-10-17) |
| [codex-continuation-20261015.md](log/2026-10/codex-continuation-20261015.md) | Claude → Codex 구현 인수인계 — 2026-10-15 |
| [community-20261015.md](log/2026-10/community-20261015.md) | 회원 코디 (커뮤니티) — 2026-10-15 |
| [compare-first-20261015.md](log/2026-10/compare-first-20261015.md) | 비교 우선 동선·가벼운 첫 화면 — 2026-10-15 |
| [compare-flow-20261018.md](log/2026-10/compare-flow-20261018.md) | 비교 → 구매처 → 기록 흐름 손질 (2026-10-18) |
| [concept-prototypes-20261015.md](log/2026-10/concept-prototypes-20261015.md) | 콘셉트 시안 4개: 이름·화면 구조·디자인을 처음부터 따로 (2026-10-15) |
| [condition-keep-20261018.md](log/2026-10/condition-keep-20261018.md) | 요청한 조건을 끝까지 지키기 (2026-10-18) |
| [consistent-guidance-20261018.md](log/2026-10/consistent-guidance-20261018.md) | 검색 후속 요청·코디 설명·등록 종류 일치 — 2026-10-18 |
| [continuous-integration-20261015.md](log/2026-10/continuous-integration-20261015.md) | 자동 검사 범위 |
| [criteria-outfit-20261018.md](log/2026-10/criteria-outfit-20261018.md) | 검색의 제외 조건·상황을 상세와 코디까지 (2026-10-18) |
| [deploy-kit-20261015.md](log/2026-10/deploy-kit-20261015.md) | 운영 묶음(Docker) 검증 — 2026-10-15 |
| [design-study-awards-20261020.md](log/2026-10/design-study-awards-20261020.md) | 디자인 수상작 학습 노트: 무엇이 '고급스러워 보이게' 만드나 (2026-10-20) |
| [design-system-20261015.md](log/2026-10/design-system-20261015.md) | 어울 디자인 시스템 1차 — 2026-10-15 |
| [design-versions-20261015.md](log/2026-10/design-versions-20261015.md) | 디자인 시안: 같은 앱, 다른 이름·모습 (2026-10-15) |
| [expert-eval-20261018.md](log/2026-10/expert-eval-20261018.md) | 어울(가칭) 웹앱 자문 통합 보고서 |
| [external-prereqs-20261019.md](log/2026-10/external-prereqs-20261019.md) | 미연결 네 영역의 최소 실행 순서 (2026-10-19) |
| [focus-plan-20261014.md](log/2026-10/focus-plan-20261014.md) | 집중 계획: 서비스부터 제대로 (2026-10-14) |
| [goal-completion-20261019.md](log/2026-10/goal-completion-20261019.md) | 원스톱 목표 완성 판정 (2026-10-19, 기준 커밋 080c47f) |
| [independent-review-20261014.md](log/2026-10/independent-review-20261014.md) | 독립 검토와 출시 전 검증 — 2026-10-14 |
| [installable-app-20261015.md](log/2026-10/installable-app-20261015.md) | 설치형 앱(홈 화면에 추가) — 2026-10-15 |
| [instant-garments-handoff-20261014.md](log/2026-10/instant-garments-handoff-20261014.md) | 실제 옷·사진 등록 인수인계 — 2026-10-14 |
| [integration-20261019.md](log/2026-10/integration-20261019.md) | Claude·Codex 로컬 통합 — 2026-10-19 |
| [legal-clothing-sources-20261021.md](log/2026-10/legal-clothing-sources-20261021.md) | Rakuten · Open Products Facts 적용 인계 (2026-10-21) |
| [lite-app-setup-20261020.md](log/2026-10/lite-app-setup-20261020.md) | 설치형 시험 앱 운영 안내 |
| [master-review-20261021.md](log/2026-10/master-review-20261021.md) | master 병합 검토·운영 인수 기록 (2026-10-21) |
| [merge-guide-20261019.md](log/2026-10/merge-guide-20261019.md) | Codex 로컬 0572caa 와 이 브랜치 병합 안내 (2026-10-19) |
| [onestop-implementation-20261019.md](log/2026-10/onestop-implementation-20261019.md) | 원스톱 전체 목표를 유지한 후속 구현 — 2026-10-19 |
| [onestop-product-contract-20261014.md](log/2026-10/onestop-product-contract-20261014.md) | 원스톱 패션 플랫폼 제품·개발 계약 — 2026-10-14 |
| [onestop-status-20261015.md](log/2026-10/onestop-status-20261015.md) | 원스톱 전체 목표 상태표 — 2026-10-15 |
| [order-import-20261018.md](log/2026-10/order-import-20261018.md) | 쇼핑몰 구매내역 가져오기 · 로컬 시험판 |
| [persona-walkthrough-20261017.md](log/2026-10/persona-walkthrough-20261017.md) | 가상 인물 12명으로 실제 앱 점검 (2026-10-17) |
| [photo-recognition-20261014.md](log/2026-10/photo-recognition-20261014.md) | 사진에서 옷 종류·라벨 후보를 찾는 기능 — 2026-10-14 |
| [photo-standard-20261020.md](log/2026-10/photo-standard-20261020.md) | 사진 기준 (2026-10-20, 초안) |
| [pilot-kit-20261014.md](log/2026-10/pilot-kit-20261014.md) | 파일럿 진행 자료 (5명, 1인당 약 20분) |
| [prelaunch-evaluation-20261014.md](log/2026-10/prelaunch-evaluation-20261014.md) | 출시 전 평가와 파일럿 계획 — 2026-10-14 |
| [price-offers-20261015.md](log/2026-10/price-offers-20261015.md) | 판매처·총액 비교와 가격 출처 (2026-10-15, Claude) |
| [privacy-policy-draft-20261015.md](log/2026-10/privacy-policy-draft-20261015.md) | 개인정보 처리방침 초안 (2026-10-15, Claude 작성) |
| [private-ai-connect-20261021.md](log/2026-10/private-ai-connect-20261021.md) | 본인 전용 AI 연결·운영 기록 (2026-10-21) |
| [product-data-plan-20261019.md](log/2026-10/product-data-plan-20261019.md) | 상품 정보·이미지 확보 대책 (2026-10-19) |
| [product-traits-20261018.md](log/2026-10/product-traits-20261018.md) | 추천 근거 보강: 상품명에서 읽은 것만 (2026-10-18) |
| [real-photo-options-20261019.md](log/2026-10/real-photo-options-20261019.md) | 시안에 실제 상품 사진 넣기 검토 (2026-10-19) |
| [redesign-spec-20261017.md](log/2026-10/redesign-spec-20261017.md) | 어울 최종 설계 v2 "한 줄로 묻고, 한 벌로 답하고, 내 옷 옆에 걸어 본다" (2026-10-17) |
| [reference-apps-20261021.md](log/2026-10/reference-apps-20261021.md) | 실제 앱 화면 레퍼런스 (무료 수집, 2026-10-21) |
| [registration-photo-20261015.md](log/2026-10/registration-photo-20261015.md) | 사진 등록·이 기기 보관 1차 구현 (2026-10-15, Claude) |
| [registration-resume-20261015.md](log/2026-10/registration-resume-20261015.md) | 등록 개선과 개발 재개 기록 — 2026-10-15 |
| [release-gate-20261019.md](log/2026-10/release-gate-20261019.md) | 개인 모바일 테스트 출시 판정 (2026-10-19) |
| [salmal-mockup-20261019.md](log/2026-10/salmal-mockup-20261019.md) | 살까말까(salmal) 목업 (2026-10-19) |
| [server-photo-mask-20261015.md](log/2026-10/server-photo-mask-20261015.md) | 서버에서 하는 배경 지우기와 영역 정리 (2026-10-15, Claude) |
| [service-release-review-20261014.md](log/2026-10/service-release-review-20261014.md) | 실제 서비스 출시 검토 — 2026-10-14 |
| [service-ux-redesign-20261015.md](log/2026-10/service-ux-redesign-20261015.md) | 서비스 UX/UI 재설계 인수인계 — 2026-10-15 |
| [team-design-20261017.md](log/2026-10/team-design-20261017.md) | 어울(가칭) 최종 설계안: 대표 보고용 |
| [toolkit-20261014.md](log/2026-10/toolkit-20261014.md) | 개발 도구 정리 (2026-10-14) |
| [used-market-review-20261019.md](log/2026-10/used-market-review-20261019.md) | 국내외 중고 매물 추가 목표 검토 (2026-10-19) |
| [ux10-review-20261019.md](log/2026-10/ux10-review-20261019.md) | UX/UI 개선 시안 10개 검토와 추천 (2026-10-19) |
| [ux10v2-design-spec-20261019.md](log/2026-10/ux10v2-design-spec-20261019.md) | 시안 2판 디자인 명세 — 10개 시안 화면 설계 (2026-10-19) |
| [ux10v2-review-20261019.md](log/2026-10/ux10v2-review-20261019.md) | 시안 2판 검토와 구현 기준 (2026-10-19) |
| [validation-kit-20261017.md](log/2026-10/validation-kit-20261017.md) | 검증 자료: 모집 글 · 구매 사례 인터뷰 · 측정 이벤트 명세 (2026-10-17) |
| [wardrobe-first-comparison-20261014.md](log/2026-10/wardrobe-first-comparison-20261014.md) | 옷 등록·옷장 사용 경험 비교와 보정 — 2026-10-14 |
| [wear-diary-20261015.md](log/2026-10/wear-diary-20261015.md) | 착용 기록과 결과 반영 — 2026-10-15 |

- [원격 브랜치 정리 목록·미머지 커밋](log/2026-10/branch-cleanup-20261023.md)

- [lite 이동 전 의존성·운영/legacy 경계·검사 이전](log/2026-10/lite-code-layout-20261023.md)
