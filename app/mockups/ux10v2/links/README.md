# 링크로 보는 시안 5개 (2026-10-20)

2026-10-20 추가: 대표 승인에 따라 5안의 좋은 부분을 d6 하나로 합쳤다. 사진 기준은 `docs/photo-standard-20261020.md`.

주요 기능(찾기 → 결과 → 상세의 '내 옷과' 판단 → 비교 → 결정 → 기록, 옷장 채우기)만 담은 시안 5개다. 각각 claude.ai 링크 페이지로 게시했다(비공개, 소유자만 열림).

| 파일 | 방향 | 링크 |
|---|---|---|
| d1-showroom.html | 진열: 흑백 쇼룸(Aritzia·SSENSE식 사진 진열) | https://claude.ai/artifact/VCVWLgbSLMPgva3XSTK1t5 |
| d2-numbers.html | 숫자: 큰 숫자 중심의 친근한 생활 도구 | https://claude.ai/artifact/Dgvy3qUtEUNvvdwYcL5Ed7 |
| d3-collection.html | 도감: 가진 옷을 도감처럼 채우는 놀이형 | https://claude.ai/artifact/HZBQWph7BKX4iogKDmLvkg |
| d4-editorial.html | 매거진: 결과·상세를 잡지 기사처럼 | https://claude.ai/artifact/KXCDnAnhFng9m6SCemBdK4 |
| d5-passport.html | 여권: 옷장 통계와 안내판형 판정, 어두운 화면 우선 | https://claude.ai/artifact/XaaMoFZULukHx7Axgt7Zeo |
| **d6-merged.html** | **통합 시안(추천안)**: 진열 바탕 + 숫자 판정(숫자) + 기본 옷 24칸 채우기(도감) + 옷장 통계(여권), 사진 기준 적용 | https://claude.ai/artifact/5VejkndVXBtaV7xdNaMxRt |

- 페이지는 링크 페이지용 본문 조각이다(`<!doctype>`·`<head>` 없음). 게시할 때 뼈대가 씌워진다. 개발용으로는 `node wrap.mjs d1-showroom.html`로 감싼 `_dev_` 파일을 만들어 HTTP 서버로 연다.
- 링크 페이지는 외부 이미지 서버를 막으므로, 게시본에는 상품 사진 사본(480px, 419장)과 그 사진이 있는 상품만 남긴 코어를 함께 올렸다(`build-pub.mjs`). **사진·글꼴 파일은 저장소에 넣지 않았다.** 상품 사진은 무신사 상품 이미지이며 사용 권리를 확인하지 않았다. 링크를 외부에 공유하지 않는다.
- 필요한 공용 파일: `../shared/eoul-mock.js`(코어 빌드), `../design/cutouts.js`(흰 배경 사진 목록), `shared/kit.js`·`shared/photo-kinds.js`(이 폴더), Pretendard Variable(OFL)·Phosphor 아이콘(MIT) 글꼴 파일. 코어는 `window.EOUL_PHOTO_BASE`가 있으면 그 폴더의 `<상품 id>.jpg`를 읽는다.
- AI(Claude)가 디자인 수상작 조사(`docs/design-study-awards-20261020.md`)를 바탕으로 만든 시안이다. 수상 디자이너가 참여하지 않았고, 세계 최고 수준은 목표일 뿐 검증된 결과가 아니다.
- 알려진 한계: 흰 무지 티셔츠는 흰 배경 사진이 없어 모델 사진이 나온다. 흰 옷은 밝은 칸 위에서 윤곽이 약하다. 휴대폰 실기기에서는 아직 확인하지 않았다(PC Chrome 자동 조작으로만 확인).
