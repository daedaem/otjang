# 자동 검사 범위

> 문서 시점: 2026-10-15. 당시의 검토·구현 기록을 보존한 자료입니다. 현재 결정·우선순위·운영 상태는 [최신 문서 목차](../../README.md)를 확인합니다. 아래의 “지금·완료·다음”은 별도 갱신 표시가 없으면 당시 기준입니다.

PR과 소스 브랜치 push에 `.github/workflows/ci.yml`이 실행됩니다. `gh-pages` push는 제외하고, 필요하면 Actions 화면에서 수동 실행할 수 있습니다. 앱과 서버를 별도 작업으로 나눠 실패 위치를 구분합니다. 배포는 하지 않습니다.

두 작업은 Ubuntu 24.04·Node 22를 사용합니다. 서버의 내장 `node:sqlite` 요구 사항(Node 22.13 이상)에 맞추고, 각 lockfile을 `npm ci`로 설치합니다. 같은 브랜치에 새 커밋이 올라오면 이전 검사를 취소합니다. 저장소 권한은 읽기만 주고 checkout 자격 증명은 남기지 않습니다.

| 작업 | 명령 | 확인하는 범위 |
|---|---|---|
| 앱 | `cd app` → `npm ci` → `npm test` → `npm run build` | 앱 계약·번들 콜백·IndexedDB 대역·로컬 HTTP 통합 및 단일 HTML 빌드 |
| 서버 | `cd server` → `npm ci --omit=optional` → `npm test` | 계정·동기화·이메일·상품 제안·커뮤니티 API 및 주입된 런타임 시험 |

서버는 기본 기능 검사에서 수백 MB인 선택 ONNX 런타임과 모델을 받지 않습니다. 기존 실제 U-2-Net 추론 시험은 `model or runtime not installed`라는 사유로 **skip**됩니다. 실행 요약에도 이 범위를 남깁니다. 실제 모델은 [서버 안내](../../../legacy/server/README.md)의 고정 해시 설치 절차로 따로 검증해야 합니다. CI 성공을 배경 제거 품질 검증으로 해석하면 안 됩니다.

실제 휴대폰의 배치·앨범·카메라·HEIC, 상품 인식 정확도, 추천 효용, 공개 서비스 운영은 이 워크플로의 검증 대상이 아닙니다. CI 파일 추가와 GitHub에서 해당 커밋의 실행 성공도 별개입니다. 브랜치 보호의 필수 검사 설정은 저장소 설정에서 별도로 관리합니다.

워크플로 구성은 공식 [checkout v4](https://github.com/actions/checkout/tree/v4)와 [setup-node v4](https://github.com/actions/setup-node/tree/v4)의 입력을 사용합니다.

공식 checkout/setup-node v4는 GitHub 태그에서 확인한 커밋 SHA로 고정했다. 체크아웃은 depth 2로 받아 `git diff --check HEAD^ HEAD`가 실제 PR 병합 차이/최근 push 차이의 공백 오류를 검사한다. CI가 없는 이전 PR 자체의 검사 상태를 자동으로 바꾸지는 않으며, 이 후속 브랜치에 포함된 통합 코드를 검증한다.
