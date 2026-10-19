# 어울 UX/UI 개선 시안 10개 (목업)

**실제 전문가가 참여한 결과가 아닙니다.** AI가 UX/UI 디자이너와 프론트엔드 개발자 역할을 나눠 맡아 만든 시안입니다.
기존 앱(`app/src`, `app/dist`)과 저장 데이터는 바꾸지 않습니다. 이 폴더만으로 동작하는 별도 목업입니다.

- 비교 갤러리: `index.html` (휴대폰·PC 크기로 보기, 두 시안 나란히)
- 시안: `teams/01-*.html` ~ `teams/10-*.html` (각각 HTML 한 파일 + 공통 코어)
- 공통 코어: `shared/eoul-mock.js` (자동 생성, 직접 고치지 않음)
- 코어 원본: `src/core.mjs`, 묶기: `node app/mockups/ux10/tools/build-core.mjs`
- 흐름 검사: `node app/mockups/ux10/tools/flowcheck.mjs teams/<시안>.html --out <폴더>` (Playwright·Chromium 필요)
- 최소 사용 예: `tools/starter.html` (시안 아님)

## 원스톱 목표 (모든 시안 공통)
옷장 없이도 시작한다 → 대충 한 줄로 요청한다 → 실제 상품 후보(브랜드·상품명·수집일 가격·이유·판매처 링크) → 가진 옷이 있으면 선택으로 더해 비교 → 구매 판단(사기로 함·보류·안 살래) → 주문·받음·계속 입음·반품 기록.

## 공통 규칙
1. **판단은 코어가, 화면은 시안이.** 판정 문장·조건·안내는 `window.EoulMock`이 돌려준 것을 그대로 쓴다. 시안이 판정을 새로 만들거나 바꾸지 않는다.
2. **정직한 표시.** 목업 표시(`data-flow="mock-label"`), AI 역할 시안이라는 말, 상품 자료 안내(`EoulMock.note.catalog`), 가격은 "수집가"(현재가·최저가라고 쓰지 않음), 규칙 기반 해석(대화형 AI라고 하지 않음), 주문·수령은 직접 남긴 기록.
3. **외부 요청 0.** 외부 글꼴·이미지·스크립트를 쓰지 않는다. 사진 대신 `EoulMock.art()`의 종류·색 그림을 쓴다(상품 사진은 공개 권리 미확인).
4. **조건을 몰래 넓히지 않는다.** 0건이면 0건과 이유를 보여 주고, 조건 빼기는 사용자가 직접 한다.
5. **중고는 링크 연결만.** `EoulMock.usedSearch()`는 외부 사이트의 공개 검색 결과로 보내는 링크다. 앱이 매물·가격·재고를 확인한 것처럼 보이게 하지 않는다. 연동 전 자리에는 "연동 전"이라고 쓴다. 가짜 매물을 만들지 않는다.
6. **모바일 390px과 PC 1280px 모두.** 가로 넘침 0, 누르는 곳 44px 안팎(최소 40px), 읽는 글자 12px 이상, 버튼 이름(글자 또는 aria-label).
7. **색만 바꾼 안 금지.** 시안마다 정보 구조·상호작용·배치가 달라야 한다.

## 코어 API 요약 (`window.EoulMock`)
| 함수 | 돌려주는 것 |
|---|---|
| `ask(text, { drop, previous })` | `{ understood, title, conditions[{key,label,removable}], dropped, notices[{kind,text}], products[], offOccasion[], offOccasionTitle, total, outfit, outfitNote, listNote, examples }`. `previous`에 이전 결과를 넘기면 "더 싼 걸로"를 이어서 처리한다. 조건 빼기는 `ask(r.text, { drop: [...r.dropped, key] })` |
| 상품 카드(products[]) | `{ id, brand, name, priceText, priceNote, url, store, colorLabel, colorHex, kindName, slotName, reason, reasons, traitLine, offOccasion, owned{tone,label,text}, record }` |
| `product(id)` | 카드 + `{ why[], tip, popularity, colorNote, alternatives[], alternativesNote, outfit, outfitNote, verdict }` (검색에서 열면 검색 조건을 대안·코디에 그대로 씀) |
| `judge(id)` | 판정 `{ basis('none'|'trial'|'mine'|'mixed'), basisLabel, tone('none'|'stop'|'go'|'pair'|'think'|'info'|'own'), title, lean('buy'|'hold'|null), lines[], reasons[], owned[], looks[], newLookCount, companion, ask, addSuggestion, cautions[], record, fine }` |
| `setOwnership(id, 'absent'|'present'|'unknown')` | 판정의 "이미 있나요?" 답 |
| `decide(id, 'buy'|'hold'|'skip')`, `advance(id, 'ordered'|'received'|'kept'|'returned'|'worn', { reason })`, `removeRecord(id)` | 결정과 그 뒤 기록. 반품 사유는 `returnReasons` |
| `getState()` | `{ gender, closet[], closetCount, trialCount, mineCount, records[] }` |
| `kindChoices()`, `slotChoices(kind)`, `colorChoices()`, `addGarment({kind,color,slot})`, `removeGarment(id)`, `loadTrialCloset()`, `clearTrialCloset()` | 가진 옷 넣기(사진 없이 종류·색, 세부 종류는 선택) |
| `suggest()` | 요청 없이 옷장 기준 다음 한 벌(옷장 없으면 이번 계절 기본템이라고 밝힘) |
| `usedSearch(id)` | 국내(번개장터·당근·중고나라·후루츠패밀리)·해외(eBay·메루카리 일본) 검색 링크와 안내 문장 |
| `art(target, { size })` | 종류·색 SVG 문자열 |
| `subscribe(fn)`, `reset()`, `setGender()`, `examples()`, `edgeExamples()`, `note`, `boot.q` | |

주소 옵션: `?reset=1`(처음 상태), `?closet=trial`(체험용 옷 넣기), `?g=F`, `?q=요청`(열자마자 그 요청의 결과를 보여 줘야 함).
저장 키는 `eoul-mockup-ux10:v1`이고 같은 주소의 시안끼리 상태를 공유한다. 앱의 저장 키는 읽거나 쓰지 않는다.

## 흐름 표시 (흐름 검사가 누르는 곳)
| 표시 | 붙일 곳 |
|---|---|
| `data-flow="mock-label"` | 목업 표시 |
| `ask-input`, `ask-submit`, `example` | 요청 입력칸, 보내기 버튼, 예시 요청 |
| `next` | (단계형만) 다음 단계 |
| `result` + `data-product-id` | 상품 하나를 여는 곳 |
| `verdict` | 판정 제목 글자만 감싼 요소 |
| `decide-buy`, `decide-hold`, `decide-skip` | 결정 버튼 |
| `seller-link` | 판매처 링크 |
| `used-search` | 중고 링크 묶음 |
| `condition-remove` + `data-key` | 조건 빼기 |
| `nav-ask`, `nav-closet`, `nav-records` | 화면 이동(항상 보이는 화면이면 생략 가능) |
| `closet-add`, `kind-option`+`data-kind`, `color-option`+`data-color`, `slot-option`+`data-slot`, `closet-save` | 가진 옷 넣기 |
| `trial-closet`, `reset` | 체험용 옷, 처음부터 |
| `record` + `data-product-id`, `record-step` + `data-step` | 기록과 다음 단계 |
