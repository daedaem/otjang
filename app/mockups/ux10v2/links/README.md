# 링크로 보는 시안 (2026-10-20)

2026-10-20 추가: 대표 승인에 따라 5안의 좋은 부분을 d6 하나로 합쳤다. 사진 기준은 `docs/photo-standard-20261020.md`.

주요 기능(찾기 → 결과 → 상세의 '내 옷과' 판단 → 비교 → 결정 → 기록, 옷장 채우기)만 담은 시안 5개다. 각각 claude.ai 링크 페이지로 게시했다(비공개, 소유자만 열림).

| 파일 | 방향 | 링크 |
|---|---|---|
| d1-showroom.html | 진열: 흑백 쇼룸(Aritzia·SSENSE식 사진 진열) | https://claude.ai/artifact/VCVWLgbSLMPgva3XSTK1t5 |
| d2-numbers.html | 숫자: 큰 숫자 중심의 친근한 생활 도구 | https://claude.ai/artifact/Dgvy3qUtEUNvvdwYcL5Ed7 |
| d3-collection.html | 도감: 가진 옷을 도감처럼 채우는 놀이형 | https://claude.ai/artifact/HZBQWph7BKX4iogKDmLvkg |
| d4-editorial.html | 매거진: 결과·상세를 잡지 기사처럼 | https://claude.ai/artifact/KXCDnAnhFng9m6SCemBdK4 |
| d5-passport.html | 여권: 옷장 통계와 안내판형 판정, 어두운 화면 우선 | https://claude.ai/artifact/XaaMoFZULukHx7Axgt7Zeo |
| **d7-simple.html** | **쉬운 시안(현재 추천안)**: 대표 피드백("토스처럼 직관적이거나 애플처럼 심플")에 맞춰 다시 만든 안. 한 화면 한 가지, 글자 28·22·17·15·13, 주 버튼 하나, 안내 문장 최소 | https://claude.ai/artifact/BoQDPhoN8H9xqnwS2etqH1 |
| d8-apple.html | 애플식: 큰 제목, 묶음 목록, 순위 목록/사진 전환. AI 순위 | https://claude.ai/artifact/5h4UAJEwq3WK598VmaHLhy |
| d9-shop.html | 쇼핑앱식: 둘러보기 먼저, AI추천순·낮은가격순·후기순 정렬, 옷장과 겹치는 옷 빼기, 2·3열 전환. AI 순위 | https://claude.ai/artifact/EKw5tiSgn9DCMqJRunj3wG |
| d10-deck.html | 한 장씩: AI 순서대로 한 장씩 보며 살게요·고민·안 살래요, 되돌리기. AI 순위 | https://claude.ai/artifact/TugSNNjxCNdRNGv6TyZBZd |
| d6-merged.html | 통합 시안(대표 피드백: 별로): 진열 바탕 + 숫자 판정(숫자) + 기본 옷 24칸 채우기(도감) + 옷장 통계(여권), 사진 기준 적용 | https://claude.ai/artifact/5VejkndVXBtaV7xdNaMxRt |

- 페이지는 링크 페이지용 본문 조각이다(`<!doctype>`·`<head>` 없음). 게시할 때 뼈대가 씌워진다. 개발용으로는 `node wrap.mjs d1-showroom.html`로 감싼 `_dev_` 파일을 만들어 HTTP 서버로 연다.
- 링크 페이지는 외부 이미지 서버를 막으므로, 게시본에는 상품 사진 사본(480px, 419장)과 그 사진이 있는 상품만 남긴 코어를 함께 올렸다(`build-pub.mjs`). **사진·글꼴 파일은 저장소에 넣지 않았다.** 상품 사진은 무신사 상품 이미지이며 사용 권리를 확인하지 않았다. 링크를 외부에 공유하지 않는다.
- 필요한 공용 파일: `../shared/eoul-mock.js`(코어 빌드), `../design/cutouts.js`(흰 배경 사진 목록), `shared/kit.js`·`shared/photo-kinds.js`·`shared/ai-rank.js`(이 폴더), Pretendard Variable(OFL)·Phosphor 아이콘(MIT) 글꼴 파일. 코어는 `window.EOUL_PHOTO_BASE`가 있으면 그 폴더의 `<상품 id>.jpg`를 읽는다.
- **AI 순위(d7~d10)**: 후보는 엔진이 조건으로 거른 상품이고, 순위와 이유는 Claude가 상품 정보·평점·후기 수·옷장 비교만 보고 정한다(`shared/ai-rank.js`). 링크 페이지의 sample 기능을 써서 보는 사람의 Claude 계정으로 호출하며, 처음 한 번 허용을 묻는다. 우리 쪽 비용·API 키는 없다. 쓸 수 없거나 거절하면 엔진 순서를 그대로 보여 준다. 실제 서비스에서는 서버에서 Claude API를 불러야 하며(키·결제·월 한도는 대표 결정 대기), 실제 응답 품질은 아직 확인하지 않았다(가짜 응답으로만 화면 확인).
- AI(Claude)가 디자인 수상작 조사(`docs/design-study-awards-20261020.md`)를 바탕으로 만든 시안이다. 수상 디자이너가 참여하지 않았고, 세계 최고 수준은 목표일 뿐 검증된 결과가 아니다.
- 알려진 한계: 흰 무지 티셔츠는 흰 배경 사진이 없어 모델 사진이 나온다. 흰 옷은 밝은 칸 위에서 윤곽이 약하다. 휴대폰 실기기에서는 아직 확인하지 않았다(PC Chrome 자동 조작으로만 확인).

## AI 순위 품질 시험 (실제 Claude API)

새 세션에서 "AI 순위 품질 시험 돌려줘"라고 하면 아래를 실행한다. 키는 클라우드 환경 설정의 `ANTHROPIC_API_KEY`에서만 읽는다(채팅·저장소에 두지 않는다).

```bash
cd app
npm install --no-save @anthropic-ai/sdk   # package.json·lock은 바꾸지 않는다
node mockups/ux10v2/tools/ai-rank-eval.mjs --models haiku,sonnet --max-usd 1 --out <스크래치 폴더>/ai-rank-eval.md
```

- 시안과 같은 프롬프트·검증(`shared/ai-rank.js`)을 그대로 쓴다. 검색 8개 × (빈 옷장, 체험용 옷장) × 모델 2개 = 32번 호출, 예상 비용 1달러 미만(추정). `--max-usd`에 닿으면 멈춘다.
- 결과 파일: 모델별 성공 수·응답 시간·토큰·비용, 검색마다 순위·판단·이유 표, 자동 점검(이유 45자 초과, 자료에 없는 소재·핏 등 언급, 빠뜨린 후보, 옷장과 같은 옷의 평균 순위와 '겹쳐요' 표시).
- 키 없이 흐름만 볼 때: `--dry`(가짜 응답, 비용 0).
- 대표의 API 크레딧(무료 US$100)은 2026-10-23에 만료된다. 결제 수단이 없어 크레딧을 넘는 청구는 없다(콘솔 화면 기준).
