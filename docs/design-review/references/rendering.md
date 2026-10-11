# 렌더링 참고 자료

2026-10-11, 한국 시간. 공식 공개 GitHub 소스와 제작자 제공 화면을 확인했다. 라이브 쇼핑 사이트 실행이나 디자인 수상 이력 검증은 하지 않았다. 아래 모델·이미지를 제품 자산으로 가져오지 않았다.

| 자료·출처 | 직접 확인한 내용 | 적용할 원칙 |
| --- | --- | --- |
| [Three.js r160 GTAO 예제](https://github.com/mrdoob/three.js/blob/r160/examples/webgl_postprocessing_gtao.html), [GTAOPass](https://github.com/mrdoob/three.js/blob/r160/examples/jsm/postprocessing/GTAOPass.js), [OutputPass](https://github.com/mrdoob/three.js/blob/r160/examples/jsm/postprocessing/OutputPass.js) | 예제와 설치된 0.160.1 소스를 읽었다. `RenderPass → GTAOPass → OutputPass`로 합성하며 `OUTPUT.Default`가 장면과 AO를 함께 보여 준다. `Denoise`는 AO 확인 화면이다 | 선반·옷의 접점을 보강하되 AO를 조명·좋은 형상의 대체물로 삼지 않는다. 해상도·샘플을 조절하고 실제 기기 비용을 측정한다 |
| [Materials Variants Shoe](https://github.com/KhronosGroup/glTF-Sample-Assets/blob/edc7c9e67c639d230715049ee31f9a96a6babbbe/Models/MaterialsVariantsShoe/README.md), [공식 화면](https://github.com/KhronosGroup/glTF-Sample-Assets/blob/edc7c9e67c639d230715049ee31f9a96a6babbbe/Models/MaterialsVariantsShoe/screenshot/screenshot-large.png), [glTF](https://github.com/KhronosGroup/glTF-Sample-Assets/blob/edc7c9e67c639d230715049ee31f9a96a6babbbe/Models/MaterialsVariantsShoe/glTF/MaterialsVariantsShoe.gltf) | 화면에서 직물·끈·밑창의 차이를 확인했다. glTF의 세 색 변형은 법선·금속/거칠기·AO 정보를 공유하고 기본색 텍스처만 바꾼다 | 등록색을 바꿀 때 원단의 법선·거칠기·AO를 보존한다. 컬러 이미지를 그대로 요철로 쓰거나 모든 원단을 같은 단색 재질로 바꾸지 않는다 |
| [SheenChair](https://github.com/KhronosGroup/glTF-Sample-Assets/blob/edc7c9e67c639d230715049ee31f9a96a6babbbe/Models/SheenChair/README.md) | 제작자 화면과 설명을 확인했다. 천·나무·금속·라벨 재질을 분리하고 공유 AO는 별도 UV, 반복 표면 텍스처는 첫 UV에 둔다. 법선 강도를 줄여 과도한 요철을 피한다 | 고정 가구 AO와 움직이는 옷의 그림자를 분리한다. 옷이 사라진 자리의 그림자를 가구에 굽지 않는다. 벨벳 표현의 특수한 절충을 면·울에 그대로 적용하지 않는다 |

Three 공식 예제의 AO 값은 `radius=.25`, `samples=16`, `distanceExponent=1`, `thickness=1`, `scale=1`, `distanceFallOff=1`이다. 장면 단위와 형상에 종속된 예제 값이며 이 옷장의 검증된 최적값이 아니다. 화면 밖 물체·투명물·경계에 대한 화면 공간 AO의 한계도 실제 브라우저에서 확인해야 한다.

현재 옷장 구현은 고정 가구 AO 베이크, VSM 그림자, 지원 기기의 GTAO, **ACES 톤 매핑**을 사용한다. 원단의 색·법선·거칠기는 구분해 보존한다. 이는 구현 방식의 기록이며 실제 기기 성능이나 시각 품질 합격을 뜻하지 않는다.

## 출처와 라이선스

- Three.js: **Copyright © 2010–2023 three.js authors**, [MIT License](https://github.com/mrdoob/three.js/blob/r160/LICENSE). 현재 설치된 라이브러리의 추가 기능을 참고하며 별도 구현을 복사하지 않았다.
- Materials Variants Shoe: **© 2021 Shopify**, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/legalcode). 위 모델 README의 제작자·라이선스 표기를 확인했다.
- SheenChair: **© 2020 Wayfair, LLC**, 제작자 **Eric Chadwick**, [CC0](https://creativecommons.org/publicdomain/zero/1.0/legalcode). 위 모델 README의 제작자·라이선스 표기를 확인했다.

화면 확인과 소스 검토는 렌더링 방향의 근거다. 최신 구현의 품질 합격·실제 기기 성능·사용자 만족을 입증하지 않는다.
