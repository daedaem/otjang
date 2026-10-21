# 어울 UX/UI 시안 2판 — 실제 웹앱 형태 · 실제 상품 사진

- **목표와 품질 기준: 세계 최고 수준의 UX/UI.** 목표이지 달성했다는 뜻이 아닙니다. 실제 사용자 관찰과 실기기 확인 전에는 검증되지 않았습니다.
- **누가 만들었나:** AI가 디자이너·프론트엔드 개발자 10팀 역할로 만든 시안입니다. 실제 수상 디자이너나 빅테크·패션 기업 디자이너가 참여하지 않았습니다.
- **근거:** 실제 수상 이력·공식 디자인 자료·실서비스 화면을 이번 작업에서 조사·분석해 적용했습니다(모델 재훈련이 아닙니다). 근거와 AI 역할 판단은 갤러리와 문서에서 구분해 적습니다. 시안 화면 안에는 넣지 않습니다.
- 1판(`app/mockups/ux10/`)과 기존 앱(`app/src`, `app/dist`)·저장 데이터는 바꾸지 않습니다. 이 폴더만으로 동작합니다.

## 실행
- 비교 갤러리: `index.html`
- 시안: `teams/01-*.html` ~ `teams/10-*.html` (HTML 한 파일 + 공통 코어 `shared/eoul-mock.js`)
- 공통 코어 원본: `src/core.mjs` → 묶기: `node app/mockups/ux10v2/tools/build-core.mjs`
- 흐름 검사: `node app/mockups/ux10v2/tools/flowcheck.mjs teams/<시안>.html [--out 폴더] [--offline]`
- 동작 예시(시안 아님, 디자인 기준 아님): `tools/starter.html`
- 주소 옵션: `?reset=1`(처음 상태), `?closet=trial`(체험용 옷장), `?g=F`, `?q=요청`, `?photos=0`(사진 없이 색 카드). 화면 주소는 `#/search?q=…` 같은 해시라 file://에서도 동작합니다.

## 같은 과업 (모든 시안·참고 서비스를 같은 순서로 비교)
빈 옷장으로 "출근용 셔츠 10만원 이하" 검색 → 실제 상품 상세 → (선택) 가진 옷 한 벌 넣고 **같은 상품으로 복귀** → 후보 둘 비교 → 보류 기록 → 뒤로가기.
누르는 횟수만 보지 않고 **조건 위반**(10만원 초과·셔츠 아님), **가격·상태 오해**(수집가 표기, 중고 가격·상태를 지어내지 않음), **복귀 오류**(옷 넣은 뒤 다른 화면으로 감, 뒤로가기 위치)를 함께 봅니다. 흐름 검사가 이 과업을 그대로 누릅니다.

## 공통 규칙 (P0: Codex·대표 지시와 조사 근거)
1. **검토자용 설명은 앱 체험 밖으로.** 시안 화면에는 팀 설명·근거·검토 메모를 넣지 않습니다. 시안 표시(`data-flow="mock-label"`, 16자 이하)를 누르면 `EoulMock.openDisclosure()`가 고지를 한 곳에 보여 줍니다. 화면 안 고지는 짧은 말(`EoulMock.note.short`)을 필요한 곳에 한 번만 씁니다. 결과·상세 첫 화면 안내문 3줄 이하.
2. **상품을 충분히 보는 사진.** 휴대폰 결과는 2열 이상 + 사진 비율 하나(카드 사진이 화면 폭의 40% 안팎, 76~88px 썸네일 목록 금지). 상세 사진은 화면 폭 85% 이상이고 누르면 크게 보기(`#/p/<id>?view=photo`, 뒤로가기·Esc로 닫힘). 사진은 `EoulMock.photoHtml()`만 씁니다(못 불러오면 색 카드).
3. **이름·가격·이유의 위계(29CM 상세 참고, 배너·혜택은 복제하지 않음).** 브랜드(작고 굵게) → 품명 → 가격(가장 크게) + `M/D 수집가`. 이유는 한 줄. 할인율·쿠폰·특가·최저가 같은 표시는 쓰지 않습니다.
4. **검색(Apple HIG Searching).** 검색은 주 위치 한 곳, 결과에서 현재 범위(조건 칩)를 보여 주고, 입력 중 제안(`searchSuggestions`: 최근·예시·종류)을 줍니다.
5. **입력 줄이기(토스 최소 입력).** 상세에서 옷 넣기는 이 상품의 종류를 미리 고르고 색만 묻습니다. 단순 선택에는 확인창을 띄우지 않습니다. 단, **구매·삭제는 자동으로 확정하지 않습니다**(사용자가 누른 결정만 기록, 되돌리기는 허용).
6. **빈 결과(Baymard no-results).** 막다른 길 대신 이유와 다음 선택(조건 빼기·예시 요청·다른 종류)을 줍니다. **자동 대체는 하지 않습니다**(대표 원칙: 조건 보존, 대체는 사용자가 고름).
7. **새 상품/중고는 같은 맥락(Patagonia Worn Wear 참고).** 상세 안에서 `newVsUsed()`로 새 상품(수집가·판매처 대표 사진)과 중고(외부 검색, 매물·상태·가격 확인 안 함)를 나란히 둡니다. 판매처 대표 사진을 중고 매물 사진처럼 보이게 하지 않고, 중고 가격·상태 등급을 지어내지 않습니다.
8. **주소와 뒤로가기.** `EoulMock.route`로 `#/search?q=`, `#/p/<id>`, `#/p/<id>?view=photo`, `#/p/<id>?add=1`, `#/compare`, `#/records`, `#/closet`을 씁니다. 옷을 넣으면 같은 상품(`#/p/<id>`)으로 돌아오고, 뒤로가기로 결과에 오면 보던 위치가 복원됩니다.
9. **후보 비교.** 비교함은 사용자가 담습니다(자동 담기 금지, 2~4개). 표 값은 `compareRows()`를 씁니다(같은 값 줄은 흐리게, 차액은 가장 낮은 수집가 기준).
10. **접근성.** 누르는 곳 44px 목표(최소 24px, WCAG 2.5.8), 읽는 글자 12px 이상(본문 15px 안팎), 글자 대비 4.5:1, 버튼 이름, 사진 alt, Esc로 겹친 화면 닫기, 360px에서 가로 넘침 0.
11. **기존 정직성 규칙 유지(짧게).** 수집가(현재가·최저가 아님), 규칙 기반 해석(대화형 AI라고 하지 않음), 체험용 옷과 비슷한 상품 사진 표시, 기록은 직접 남긴 것.
12. **색만 바꾼 안 금지.** 시안마다 정보 구조·조작·배치가 달라야 합니다.

## 상품 사진: 범위·출처·권리
- 범위: 상품 자료 891개 전부의 사진 주소. 저장소에 사진 파일은 없고, 브라우저가 무신사 이미지 서버(`image.msscdn.net`)에서 직접 불러옵니다(referrer 보내지 않음).
- 사진 종류: 판매처 대표 사진(상품), 비슷한 상품 사진(종류·색만 넣은 옷과 체험용 옷 — 표시 붙음). 중고 매물 사진은 없습니다.
- 권리: **확인되지 않았습니다**(`CATALOG.rights: 'unverified'`). 개인 시험 링크라는 이유로 권리 문제가 해결되지 않습니다. `?photos=` 옵션은 표시 방식일 뿐 접근 통제가 아닙니다. 검색 엔진 제외 표시(`noindex`)도 접근 통제가 아닙니다. 공개 배포 전에는 제휴 프로그램·브랜드 허락 등으로 권리를 확보해야 합니다(`docs/real-photo-options-20261019.md`).

## 코어 2판 API에서 달라진 것 (`window.EoulMock`, 1판 API는 그대로)
| 함수 | 내용 |
|---|---|
| `photoHtml(target, { fit, caption, eager })` | 상품·옷·코디 칸·기록 무엇이든 사진 HTML. 상품은 판매처 사진, 종류·색만 아는 옷은 '비슷한 상품 사진' 표시, 그 밖에는 색 카드. 칸 높이가 없으면 4:5(`--eo-ratio`로 바꿈) |
| `photo(target)` | `{ src, similar, alt, caption }` 또는 `null` |
| `art(target)` | 1판 호환. 이제 사진을 돌려줌 |
| 카드 `priceShort`, `photo` | `10/13 수집가`, 사진 정보 |
| `searchSuggestions(text)`, `clearRecent()` | 최근·예시·종류 제안 |
| `compareAdd(id)`, `compareRemove(id)`, `compareList()`, `compareHas(id)`, `compareClear()`, `compareRows(ids)` | 비교함(최대 4개, 저장됨)과 비교 표 값 |
| `newVsUsed(id)` | 새 상품/중고를 같은 자리에서 보여 줄 값(중고 가격·상태는 '확인 안 함') |
| `route.current()`, `route.href(path, params)`, `route.go(path, params, { replace })`, `route.on(fn)`, `route.remember/recall` | 해시 주소 이동과 뒤로가기 위치 복원 |
| `disclosure()`, `openDisclosure()` | 고지 한 곳 |
| `photos` | `{ on, count, source, rights, note }` |

## 흐름 표시 (흐름 검사가 누르는 곳)
| 표시 | 붙일 곳 |
|---|---|
| `mock-label` | 시안 표시(누르면 `openDisclosure()`) |
| `ask-input`, `ask-submit`, `example`, `empty-action` | 검색칸, 찾기, 예시·제안 요청, 빈 결과의 다음 행동 |
| `result` + `data-product-id` | 검색 결과 상품(누르면 `#/p/<id>`) |
| `condition-remove` + `data-key` | 현재 범위 조건 칩(빼기) |
| `pdp`, `pdp-brand`, `pdp-name`, `pdp-price` | 상품 상세와 그 안의 브랜드·품명·가격 |
| `photo-zoom`, `photo-viewer` | 사진 크게 보기 버튼, 열린 큰 사진 |
| `verdict` | 판정 제목 글자만 감싼 요소 |
| `closet-add`, `kind-option`+`data-kind`, `color-option`+`data-color`, `slot-option`+`data-slot`, `closet-save` | 가진 옷 넣기(상세 안에서 바로) |
| `compare-add` + `data-product-id`, `compare-open`, `compare-view`, `compare-item` + `data-product-id` | 비교함 담기·열기·비교 화면·비교 후보 |
| `decide-buy`, `decide-hold`, `decide-skip` | 결정 버튼 |
| `used-search` | 중고 영역(새 상품 가격은 이 밖에) |
| `seller-link` | 판매처 링크("무신사에서 보기") |
| `nav-ask`, `nav-closet`, `nav-records` | 화면 이동 |
| `record` + `data-product-id`, `record-step` + `data-step` | 기록과 다음 단계 |
| `trial-closet`, `reset` | 체험용 옷, 처음부터 |

저장 키는 `eoul-mockup-ux10v2:v1`입니다(1판·앱과 섞이지 않음).
