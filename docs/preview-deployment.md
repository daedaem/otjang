# 검토용 실행 페이지

**[실행 주소](https://daedaem.github.io/otjang/)** — 다운로드 없이 열고 **먼저 둘러보기**를 누른다. 무료 GitHub Pages의 정적 페이지이며 공개 사용자 모집이나 유료 서비스 운영을 시작한 것은 아니다.

2026-10-11에 `gh-pages` 브랜치를 처음 만들었다. 기존 Pages 사이트·배포·워크플로가 없음을 확인한 뒤, 제품 커밋 `8426a83598510bbf84274644ebd0cf987031b454`의 `prototype/WearNext.html`만 루트 `index.html`로 게시했다. `.nojekyll`과 원본 커밋·파일 해시를 담은 `build-info.json`을 함께 제공한다. 로컬 인계 폴더, 개인 사진, 실제 옷장 백업은 포함하지 않았다.

- 배포 커밋: `dc4cb9fa110beaf68fced616483f2f091904e679`
- Pages source: `gh-pages` / `/`
- [GitHub Pages 배포 결과](https://github.com/daedaem/otjang/actions/runs/38142149806): success
- HTTPS 응답: `200`, `Content-Type: text/html; charset=utf-8`, 다운로드 헤더 없음
- 실제 응답: 17,072,078 bytes, SHA256 `6646e1cdb244657e1eb4cb7dd30ab329e541421171a4eedc14fb5fe169e9556e` — 검증한 제품 HTML과 동일

Pages 생성 API는 integration 권한 403을 반환했으나, 이후 Pages 조회와 실제 배포 결과에서 위 브랜치·커밋의 게시를 확인했다. API 요청 성공으로 기록하지 않는다. 클라우드 Chromium은 프록시 인증서 신뢰 문제로 공개 URL을 직접 열지 못했으며, 영구 인증서 저장소 변경은 자동 승인 심사에서 거절돼 적용하지 않았다. HTTPS 파일은 환경의 기존 CA 신뢰를 사용하는 curl로 검증했다. 제품의 브라우저 기능 검증은 [검증 기록](../prototype/VALIDATION.md)을 참고한다.

## 갱신

실행 페이지는 `feat/wearnext-prototype` 브랜치와 자동 동기화되지 않는다. 새 HTML을 빌드·검증한 뒤 `gh-pages`의 `index.html`과 `build-info.json`을 함께 갱신하고 Pages 배포 완료 및 실제 HTTPS 응답을 확인한다. 게시용 브랜치에는 검토한 정적 산출물만 포함하고 개인 백업이나 미추적 인계 폴더를 넣지 않는다.

주소·기기·브라우저가 달라지면 저장 공간도 달라진다. 기존 로컬 HTML에서 사용한 기록을 옮기려면 앱에서 개인 백업을 내보내고 새 주소에서 복원한다. 백업 파일은 개인 보관용이며 저장소에 게시하지 않는다. 가상 피팅과 실제 상품 자동 검색은 여전히 미구현이다.
