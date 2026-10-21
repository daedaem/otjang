# Open Products Facts 의류 데이터

이 디렉터리의 `clothing.json`은 **Open Products Facts 및 기여자**의 공개 데이터에서 추출한 별도의 의류 데이터베이스다. 앱 소스·판매처 카탈로그·개인 옷장과 구분해 제공한다.

- 데이터베이스: [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/).
- 개별 내용: [Database Contents License 1.0](https://opendatacommons.org/licenses/dbcl/1-0/).
- 원본: <https://world.openproductsfacts.org>.
- 공급자가 게시한 상업 재사용 안내: <https://www.data.gouv.fr/datasets/open-products-facts>.
- 이 파일 및 JSON의 attribution·원본 링크·라이선스·변경 설명을 함께 제공한다. 수정한 파생 데이터베이스를 공개 사용·배포할 때도 ODbL에 따라 제공한다. 앱 UI에서 이 JSON을 내려받을 수 있다. 이 안내가 별도 소스 코드나 개인 자료의 공개 동의라는 뜻은 아니다.

변경: `en:clothing` 분류에서 이름·브랜드·숫자 식별자가 있는 항목만 남기고 필요한 필드를 선택·정리했다. 브랜드 unknown, 이름 loading/chargement, 유아 기저귀 분류, 가격 기호가 든 이름도 제외했다. 분류·이름의 정확성은 커뮤니티 원본을 보증하지 않는다. 상품 사진·실시간 가격·재고·판매 제안은 포함하지 않는다. 원본의 색·성별·판매처·소유 여부를 추정하지 않는다. 앱의 유료 AI 상품 후보 목록에 합치지 않는다.

갱신은 `cd app/lite && node tools/refresh-open-products.mjs`로 명시적으로 실행한다. 빌드·페이지 열기·CI에서 자동 수집하지 않는다. 현행 공식 문서가 검색용으로 제시하는 v2 검색 API를 사용하며, 일반 상품 조회는 v3 권장이다. 현재 분류가 300건을 넘거나 응답이 불완전하면 기존 파일을 보존하고 중단한다. 더 커지면 공식 일괄 export로 전환한다. 검색은 갱신 시 최대 3회, 6.1초 간격으로만 요청한다. 사용자의 검색어·사진·옷장·계정은 공급자에게 전송하지 않는다.
