# R22 화면 연결 명세 — 옷장 레일·실측 비교·수집 가치 (2026-10-25, Claude → React 전환 담당)

> 문서 시점: 2026-10-25. 대표가 R22 설계의 추천안 6개를 채택했다([설계](wardrobe-rail-tryon-design-20261025.md) 8절, [요구사항](../../owner-requirements.md) R22). 같은 날 "전체 화면 React 전환은 Codex '어울 개발' 한 곳에서, 다른 채팅은 중복 구현하지 않는다"는 결정도 있다. 그래서 Claude는 화면·코어 저장·백업을 건드리지 않는 **새 도메인 모듈과 검사**만 만들었고, 이 문서는 그 모듈을 화면에 붙일 담당에게 넘기는 명세다. 대표가 담당을 바꾸면 그 지시를 따른다.
>
> 이 문서의 모듈은 PR #75 브랜치에 있고, 어느 화면에서도 아직 호출하지 않는다. 운영 배포·실기기 검증과 무관하다.

## 1. 이미 만든 것 (새 파일, 기존 코드 변경 없음)

| 모듈 (`app/lite/src/domain/`) | 하는 일 | 주요 함수 |
|---|---|---|
| `garment-profile.js` | 옷 한 벌의 실측·실루엣·소재·두께·표면·무늬·디테일·목적·컬렉션·기준 옷 표시. 값마다 출처(판매처 표기/직접 잼/직접 고름/AI 추정·확인 전). 없는 값은 모름. **cm는 판매처 표기나 직접 잰 값만**(AI 추정 불가) | `validateProfile`, `profileFromForm`, `profileFacts`, `profileFactLines`, `confirmEstimate`, `measureFieldsFor` |
| `measure-compare.js` | 기준 옷과 후보의 실측 차이 문장, 사이즈 옵션 중 가장 가까운 것, 같은 축척의 평면 도식(SVG path, cm 단위) | `compareMeasures`, `closestSize`, `flatSketch`, `overlaySketches`, `NOTE` |
| `size-chart.js` | 사용자가 붙여 넣은 사이즈표 글자를 cm로 읽기(행·열·한 줄씩 세 형식, 둘레→단면, 인치→cm 경고) | `parseSizeChart`, `sizeChartOptions` |
| `collection-value.js` | 활용 축(새 조합 수·비슷한 옷)과 수집 축(목적·컬렉션 순번·다른 점)을 **따로** 계산. 소장 목적이면 중복 경고 없음. 진열장 빈칸은 사용자가 정한 목표만 | `valueAxes`, `similarOwned`, `detailDiff`, `seriesShelves`, `wearExpectation`, `costPerWear` |
| `outfit-facts.js` | 조합의 차원별 사실(색·격식·실루엣·계절·스타일, 모두 편집 규칙 표시), 조합 반응 검증·실제 집계, 답변 속 속성 주장 대조 | `outfitFacts`, `outfitFactLines`, `validateReactions`, `tasteSummary`, `attributeClaimCheck`, `REACTION_REASONS` |
| `rail-layout.js` | 아우터·상의(원피스 포함)·하의 레일 배치와 실측 총장 비례 높이, 실측 없음 표시, 신발·소품 선반, 정렬 5가지 | `railLayout`, `RAILS`, `SORTS` |
| `collage.js` | L0 거울 콜라주: 키와 사진 속 머리·발 위치로 축척을 잡고, 옷 사진을 실측 총장 비율로 놓을 위치·크기·층 | `bodyScale`, `placeGarment`, `BODY_LINES` |

검사: `app/lite/checks/garment-profile.check.mjs`, `measure-compare.check.mjs`, `collection-outfit.check.mjs`(20개). lite 전체 191 → 211 통과. 화면이 없으므로 화면 동작은 검증하지 않았다.

## 2. 화면 연결 작업 (React 전환 담당)

순서는 설계 6절과 같다. B2a를 B2b보다 먼저 한다(Codex 검토 반영).

### B1. 옷 정보 저장 이전

- `garment.profile`(선택 필드)을 코어 snapshot에 추가한다. 현재 저장 형식은 `core.mjs`의 `{v:1, garments, journeys, registrations, …}`이고 `readSaved()` → `buildState()`가 옷 배열을 `newWardrobeState()`에 그대로 얹는다. **도메인 `WARDROBE_SCHEMA` 이전만으로는 부족하다.**
- 요구사항
  - 코어 snapshot 버전 올림과 이전 함수. v1의 옷은 `profile` 없음 = 모름으로 읽는다.
  - 읽을 때 `validateProfile(profile, garment)`. 실패하면 기존 unreadable 보호(#74의 원문 격리)를 따르고 자동으로 지우지 않는다.
  - `M.canReadSaved()`와 #66/#74 백업 사전 검증이 새 형식을 이해해야 한다. 미래 버전 원문은 보호한다.
  - 등록 화면에서 새 속성을 받으면 `input-session.js`의 `clean()`·`read()`와 `lite-registration.js`의 `registrationInput()`, `core.mjs`의 `registerGarment()`에 호환 버전을 두고, 같은 draftId 재시도의 충돌 판정에 새 속성을 넣는다. 옷·메타데이터는 같은 snapshot 쓰기로 원자 저장한다.
- 완료 기준: 기존 v1 읽기, 미래 버전 보호, 백업 복원 후 재시작, 새 속성이 들어간 초안 재개·재시도, 기존 검사 전부 통과.

### B2a. 사진 저장과 사진 포함 백업 (개인 사진을 넣기 전에)

- 현재 `BK`는 localStorage 문자열만 담고 가져오기는 5MB로 제한된다. IndexedDB 사진은 백업·되돌리기에 들어가지 않는다.
- 요구사항
  - 사진 저장소(IndexedDB 등)와 옷↔사진 참조(`garment.photoId` 같은 것).
  - 사진을 포함하는 묶음 백업 형식. 기존 JSON 백업과 별도 파일이어도 된다.
  - 참조 무결성: 사진 없는 참조, 참조 없는 사진을 모두 알린다.
  - 복원 중간 실패와 재시작 복구. 앞선 사진을 되돌릴 수 있어야 한다.
  - 사진 없는 기존 JSON 백업을 복원해도 기기 사진을 지우지 않는다.
  - `navigator.storage.persist()` 요청.
- 사진은 기기 밖으로 보내지 않는다. 서버·AI 요청에 넣지 않는다.

### B2b. 레일·조합대

- `railLayout(garments, { sort, wearCounts })`의 결과를 그린다. `heightPx`는 실측 비례, `measured: false`면 "실측 없음"을 작게 표시한다.
- 배경 지우기는 **내가 찍은 내 옷 사진**만. iPhone '피사체 들어올리기' PNG를 그대로 받는 경로를 1순위로 두고, 기존 U-2-Netp 기기 내 모델([시험 기록](background-removal-20261015.md))을 2순위로 둔다.
- 구매 후보 상품 사진은 **원본 그대로 원격 표시**만 한다. 배경 지우기·합성은 R20 공급자 허용 확인 전 금지.
- 조합대: 아우터를 상의 위에 겹쳐 그린다. 사진 수백 장에서는 썸네일만 올리고 화면 밖은 그리지 않는다. 실기기 성능을 잰다.
- 옷장 0벌이면 빈 레일과 '체험용 옷(가진 옷 아님)'으로 시작한다(R3).

### B3. 실측 비교 화면

- 종류별 **기준 옷 1벌**만 필수(대표 결정). `profile.reference: true`가 붙은 같은 종류 옷을 기준으로 쓴다.
- 후보 실측 입력 세 가지: 숫자 칸, 사이즈표 붙여넣기(`parseSizeChart` → `sizeChartOptions`), iPhone 라이브 텍스트로 복사한 글자 붙여넣기. 자동 수집은 하지 않는다.
- 결과에 `factLine`, `sentence`, `NOTE`("실측 숫자를 비교한 결과예요. 착용감이나 핏을 보장하지는 않아요.")를 함께 보여 준다. `closestSize`가 `best: null`이면 이유를 그대로 보여 주고 사이즈를 고르지 않는다.
- 도식: `overlaySketches(item, candidate, reference)`의 `viewBox`와 두 path를 SVG로 그린다(기준 옷 채움, 후보 점선 등). `assumed`에 값이 있으면 "그림용 가정: 어깨" 같은 문구를 붙인다.

### B4. 수집 축·진열장

- 후보 상세에 목적(착용/소장/둘 다) 선택을 두고 `valueAxes({ candidate, owned, purpose, newOutfits })`의 `summary`를 보여 준다. `newOutfits`는 기존 코디 엔진에서 계산하고, 계산 전이면 `null`을 넘긴다(문구가 그렇게 바뀐다).
- 활용과 수집을 한 점수로 합치지 않는다. 희소성(단종·한정)은 판매처·브랜드 표기가 있을 때만 쓴다.
- 진열장: `seriesShelves(owned, goals)`. 빈칸은 사용자가 정한 `target`만. 숫자는 실제 보유·착용·조합 수만(R5).
- 구매 기록(#66)과 연결: `wearExpectation('collect')`이면 '안 입음'을 실패로 세지 않는다.

### B5. 조합 반응과 AI 이유 (R2 유지)

- 조합 카드에 좋아요/별로 + 이유 칩(`REACTION_REASONS`). 저장 전 `validateReactions`.
- `/api/rank` consult(또는 조합 전용 task)에 텍스트만 더한다: 후보 조합마다 `outfitFactLines(outfitFacts(...), tasteSummary(...))`, 옷마다 `profileFactLines`. 사진은 보내지 않는다.
- **최종 순위와 이유는 AI가 정한다.** 엔진 차원 점수는 입력 사실이다. 엔진만으로 순위를 정하려면 대표의 R2 예외 결정이 필요하다.
- 답이 온 뒤 서버가 `attributeClaimCheck(answer, candidates)`로 확인 줄을 만들어 `price_check`처럼 답 아래에 붙인다. 답을 고쳐 쓰거나 다시 묻지 않는다.
- 검증: 대표가 20개 상황에서 이유를 보지 않고 두 조합 중 하나를 고르고, 최종(AI) 1위 일치와 이유 납득도(1~5)를 기록한다. 엔진 점수 1위도 함께 적는다.

### B6. L0 거울 콜라주

- 내 전신 사진(기기 저장) → 키 입력 → 머리 끝·발끝 두 번 누르기 → `bodyScale`.
- 내 옷 누끼를 `placeGarment`로 놓고 사용자가 끌어 맞춘다. `assumedLength`면 "총장 모름 · 보통 길이로 놓았어요"를 표시한다.
- 구매 후보는 원본 상품 사진을 **옆에** 둔다(가공 금지, R20). 결과에 "분위기 미리보기 · 핏 근거 아님"을 고정 표시한다.

### B7. L1 이후

- C4 재시험([안내](../../../experiments/vton-recheck-20261025/README.md))을 통과한 뒤에만 시작한다. PC에서 만든 결과 파일을 앱에 가져와 원본 상품 사진·실측 비교와 나란히 보여 준다. 서버를 거치지 않는다.

## 3. 공통 문구 규칙

| 상황 | 문구 |
|---|---|
| 실측 비교 결과 | `NOTE`를 항상 함께 |
| 실측 없는 레일 옷 | 실측 없음 |
| AI 추정 속성 | AI 추정 · 확인 전 (사용자가 확인하면 `confirmEstimate`) |
| 편집 규칙(격식·실루엣·색) | 편집 규칙 |
| 콜라주·가상 착용 | 분위기 미리보기 · 핏 근거 아님 |
| 모르는 속성 | 모름 (지어내지 않음) |

## 4. 대표 확인 기록지 (C1·C2)

대표가 직접 하는 확인이다. 결과는 글로만 알려 주면 되고, 사진은 보내지 않는다.

**C1. 옷 10벌 등록 시간**

| # | 종류 | 사진 찍고 배경 지우기(분) | 실측 재기(분) | 메모(어려웠던 점) |
|---|---|---|---|---|
| 1 | | | | |

실측 재는 곳: 상의·아우터는 총장·어깨·가슴단면(겨드랑이 바로 아래 좌우)·소매, 하의는 총장·허리단면·허벅지단면·밑단단면·밑위. 옷을 바닥에 평평하게 펴고 잰다. 마지막에 "계속할 만한가요?"에 한 줄로 답한다.

**C2. 사고 싶은 옷 10개의 정보 위치**

| # | 상품 | 판매처 | 실측표(글/이미지/없음) | 소재 표기 | 디테일 설명 | 메모 |
|---|---|---|---|---|---|---|
| 1 | | | | | | |

실측표가 이미지로만 있으면 iPhone 사진 앱의 라이브 텍스트로 글자가 복사되는지도 한 번 확인한다.
