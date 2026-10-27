# Codex 두 채팅 작업 → Claude 패션 구현 인수인계

## 기준과 보존된 작업

대표의 직접 지시로 구현 담당을 Claude ‘패션’ Opus5.5로 넘긴다. 기존 구현 채팅 ‘어울 개발’은 새 기능 수정/병합을 중단하고 이 checkpoint를 보존한다. ‘어울 React 전환 상태 확인’은 제품 코드/브랜치/PR/병합0인 읽기 전용 검토/격리 합성 QA·Claude 협의 담당이었다. 별도 두 번째 구현자는 확인되지 않았다.

- 원격 master: `bc921ef7ea11687dcf4b49ddcc81b6f5d87261ad` (#88 병합), 마지막 head241fabe의 CI11개·Node356개·실제274개 두 실행(10.8/10.5분)·미해결0을 확인했다.
- 미병합 홈 코드: `codex/react-home-baseline-20261027`. Codex는 변경을 지우거나 master에 덮지 않고 checkpoint 커밋/Draft PR로 보존한다. 이 문서와 [홈 인계](react-home-screen-20261027.md), 실제 PR의 마지막 SHA/CI를 함께 확인한다. 홈이 master에 있다고 가정하지 않는다.
- 로컬 보존 위치: `/private/tmp/otjang-layout-final-20261025`. 이 위치는 Mac의 현재 checkout이며 Claude 원격 환경에 같은 경로가 있다고 가정하지 않는다. 원격 Git 브랜치로 받아 최신 master를 대조한다. 기존 개인 프로젝트/13벌/사진 원본·생성 개인 HTML은 변경하거나 Git에 넣지 않았다.

## 완료되어 master에 있는 코드

저장소 정리 #69~#71/#73, 무손실 백업 #74, R22 도메인 #75, B1 등록/속성 계약 #76, 사진/묶음 복구 #77, 옷장 레일/조합대 #78, 보유 편집 #79~#80, 실측 #81, 수집/진열장 #82, 반응/AI 계약·화면 #83~#84, 거울 L0 #85~#86, 직접 검색 진입 보호 #87, 상품 검색 등록 본문/legacy metadata 보호 #88을 순서대로 병합했다. 각 단계의 Node·브라우저·CI/원문 대조는 날짜별 문서를 따른다. 코드 병합을 실기기·AI 품질/사업 효용·공개 출시로 표현하지 않는다.

## 홈 checkpoint의 정확한 상태

`src/home` 질문/header/예시/보유·선택 후보 preview를 실제 React로 옮겼다. 날씨·코어 갱신에도 질문/초점이 유지되고 Back은 기존 라우터 메모리로 복귀한다. 보유 예시의 `M.ask`를 공통 readonly model의 `M.readSearch`로 바꿔 passive 홈이 최근 검색을 쓰지 않는다. `ProductPhoto`는 공유 부품으로 추출했으며 기존 등록 검색도 함께 확인했다. Core/BK/Input/사진/등록·구매·인증/비용 한도는 그대로다.

- Node356개/fail0/skip0, 빌드 통과.
- 기본6개11.1초 통과. 홈/공유 등록46개 중 비교 fixture가 실제 한 상품인2개는 두 상품 조건으로 수정해 해당2개6초 통과.
- 마지막 전체290개: **289통과·WebKit context 종료1실패(10.7분)**. `outfits.spec.ts`의 질문 변경/AI 재비교 마지막 assert까지 trace상 오류 없이 끝난 뒤 context 종료가30초를 넘었다. 제품 기능 assertion 실패로 단정하지 않았다. 동일 코드/동일 timeout·retry 설정의 해당 WebKit 흐름은 **1개 통과·정상 종료(3.2초)**로 재확인했다. 이를 전체290개 성공으로 바꿔 쓰지 않는다.
- 현재 인계 시점의 홈 전체 CI/검토/병합은 미완료다. Claude가 같은 checkpoint head를 기준으로 확인하고 마무리한다. 기존1건 때문에 검사를 삭제하거나 timeout/skip을 늘리지 않는다.
- 빈/합성 보유3벌·모바일/PC의 전후 캡처8장, 질문/원문 불변 결과, [보존14경계](evidence/home/preserved.json)와 manifest를 남긴다. 캡처만 동일한 animation 비활성/reduced-motion 조건이다. 실물/실제 날씨·사진/실제 API/유료 호출은 아니다.

`WeatherBridge`·코디 `WeatherSlot`·지역 sheet는 아직 바닐라다. 공급처 `RetailBridge`, 전역 bar/tabs·후보 띠·공통 메뉴/고지/색/확인/토스트·복구 안내도 남는다. 실제 남은 일은 [WO-01~WO-10](claude-work-orders-20261027.md) 순서로 나눈다. 인계받은 구현 환경이 읽기만 가능하면 실제 코드 수정/push 가능 여부부터 명확히 답한다.

## 공통 확인 방법과 제한

먼저 AGENTS.md → docs/README.md → owner-requirements/business-plan/development-plan/system-handover를 읽는다. 한 영역은 한 구현 담당만 둔다. 진행 표시에서 담당 이전/수락과 코드·CI·실기기 대기를 구분한다. 바닐라를 실제 흐름/실물/기존 자료 복원 확인 전에 제거하지 않는다. Claude가 원격 코드를 읽은 검토와 Codex의 실제 테스트/CI는 서로 다른 근거다.

Node22·Playwright1.57 고정. `npm --prefix app/lite test`, `npm --prefix app/lite run build`, `npm --prefix app/lite run test:e2e`. Mac은 기존 Chrome/캐시 경로를 쓸 수 있지만 다른 환경에서는 적절한 실행 파일/설치 상태를 직접 확인한다. 동시에 한 브라우저 suite만 돌리고 실행 중 dist를 다시 빌드하지 않는다. 모델/서버는 QA에서 mock하며 실제 비용/사진 전송을 새로 승인한 것이 아니다.

실물 C1/C2·블라인드20·C4/L1, 실제 제공자/공급 권리·persistence/Files·옛 형식/교차 기기 복원·공개 출시가 완료된 것은 아니다. 기존 로그인 만료 이동을 보존하고 새 인증 설계로 범위를 넓히지 않는다. 새 비밀값/결제/계정·권한이 필요하면 사용자에게 필요한 단계만 알리고 값을 채팅에 요청하지 않는다.
