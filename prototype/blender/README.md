# Blender 옷장 공간 제작

`wardrobe.py`는 폭 약 3.9m, 높이 2.49m의 월넛 수납장·회벽·창 개구부·방향성 자연광과 의류 열 자리를 실제 Blender 장면으로 만든다. 의류가 프레임을 더 많이 차지하도록 수납장 높이와 선반 폭을 줄였고, 거울·벤치·식물 장식은 제거했다. `garments.py`는 의류 모델을 만드는 공용 함수다. 브라우저에서는 생성된 GLB를 Three.js로 표시하므로 **사용자는 Blender나 Python을 설치할 필요가 없다.** 사용자 사진을 올릴 때마다 Blender를 실행하는 구조가 아니다.

## 재현 환경

확인한 환경은 Linux x86-64, Python **3.13.16**, `bpy==5.2.2`, `numpy==2.3.3`, `Pillow==11.3.0`이다. `bpy`는 Blender 5.2.2 LTS Python 배포본이다. 다른 운영체제에서는 해당 Python 버전용 `bpy` 휠 제공 여부를 먼저 확인한다. 아래 명령은 저장소 루트에서 실행한다.

현재 클라우드 환경의 설치된 인터프리터:

```bash
WEARNEXT_PYTHON=/workspace/.otjang-env/venv/bin/python
"$WEARNEXT_PYTHON" -c "import bpy; print(bpy.app.version_string)"
```

별도 개발 환경에 준비하는 경우:

```bash
python3.13 -m venv prototype/blender/.venv
prototype/blender/.venv/bin/python -m pip install bpy==5.2.2 numpy==2.3.3 Pillow==11.3.0
WEARNEXT_PYTHON=prototype/blender/.venv/bin/python
```

설치 명령은 최초 준비용이다. 이미 준비된 환경에서 다시 설치하거나 천 시뮬레이션을 다시 계산할 필요는 없다.

## 공간 생성과 렌더

```bash
# 검토용: CPU 4스레드, 960×640, Cycles 24 samples
"$WEARNEXT_PYTHON" prototype/blender/wardrobe.py --draft

# 최종 정지 화면: CPU 4스레드, 1600×1050, Cycles 64 samples
"$WEARNEXT_PYTHON" prototype/blender/wardrobe.py --final

# 장면·GLB·메타데이터를 갱신하고 Cycles 이미지 렌더만 생략
"$WEARNEXT_PYTHON" prototype/blender/wardrobe.py --final --skip-render
```

현재 코드의 **무옵션 기본값은 draft**다. `--final`을 지정해야 최종 해상도로 렌더한다. `--draft`와 `--final`을 동시에 주지 않는다. `--skip-render`도 장면 생성과 GLB 내보내기를 수행하며, 기존 정지 화면을 최신 장면으로 바꾸지는 않는다. 카메라·공간·의류 배치가 바뀌었다면 배포 전에 `--final` 렌더로 정지 화면도 맞춘다.

생성 파일은 `prototype/scene/assets/`에 모인다.

| 파일 | 용도 |
| --- | --- |
| `WearNext-wardrobe.blend` | 장면·카메라·조명을 포함한 편집 가능한 원본 |
| `wardrobe.glb` | 브라우저에서 읽는 메시·소재·의류 슬롯 구조 |
| `scene-meta.json` | 카메라, 슬롯 식별자, 경계, 화면 좌표, 품질 모드 |
| `room-static-ao.png` | 움직이는 의류를 제외하고 베이크한 1024px 정적 환경 차폐 맵 |
| `room-preview.png`, `room-preview.webp` | draft 렌더 |
| `room-front.png`, `room-front.webp` | final 렌더 |
| `oak-grain.png`, `smoked-oak-grain.png`, `floor-grain.png`와 각각의 `-normal`, `-roughness` 이미지 | 비주기 섬유·도관 무늬로 생성한 목재 색·법선·거칠기 맵 |

목재 UV는 결을 가로지르는 방향 0.5m, 결 방향 2m의 실제 크기를 기준으로 배치한다. 문짝·가로 부재·세로 부재의 결 방향을 구분하며, 색·법선·거칠기 맵을 GLB에 함께 내보낸다. 원단도 각 소재의 중성 색상 맵과 법선·거칠기 맵을 유지한다. 원단 색 변경은 맵을 없애는 대신 기본 색 계수에 적용한다. 현재 Blender glTF exporter의 sheen 강도 전달 차이는 낮은 `Sheen Tint`로 보정하므로, 공간 생성기에서 원단 shader를 다시 덮어쓰지 않는다. 이미지 텍스처는 `.blend`에 패킹하고 GLB에도 포함한다. 원본 Blender 장면과 브라우저의 조명·색상 처리·탐색 카메라가 달라 두 화면이 픽셀 단위로 같지는 않다. 가구 안쪽의 깊이를 위해 정적 공간만 `CabinetAO` UV에 0.55m 거리의 차폐를 베이크한다. 의류·행거·신발은 베이크 동안 숨기고 이후 복원하므로 옷을 꺼낸 자리에 그림자가 남지 않는다. GLB의 occlusionTexture는 UV1과 강도 0.8을 사용하고, 목재 색·법선·거칠기는 기존 UV0를 유지한다. 이는 고정된 그림자 사진을 입히는 방식이 아니며 실시간 방향광과 동적 차폐를 보완한다. 공간의 동작은 실제 브라우저 화면에서도 확인한다.

모바일 전체 시점에서는 기존 실내 앞끝보다 뒤에서 가구를 바라본다. 바닥과 천장만 별도 `room_continuation` 메시로 24m까지 이어 공간의 앞단이 드러나지 않게 했다. 이 두 메시(74삼각형)는 기존 캐비닛 AO 아틀라스에 포함하지 않으며 판재의 UV 밀도와 방향을 유지한다. 천장 연장부는 Cycles 그림자와 웹 `shadowCaster`를 꺼 기존 창빛을 막지 않는다. 캐비닛 크기와 옷 슬롯을 확대한 것은 아니다.

## 의류 함수와 독립 자산 검토

```python
from garments import make_garment

shirt = make_garment('shirt', 'blue', 'slot_02')
blazer = make_garment('blazer', 'navy', 'slot_03')
field = make_garment('fieldjacket', 'olive', 'slot_04')
folded = make_garment('knit', 'cream', 'slot_07', variant='folded')
```

함수는 독립된 Empty 부모를 반환하며 기존 장면을 지우지 않는다. 매달린 옷은 깃이 원점, Z축이 위, 앞면이 -Y 방향이다. 접은 옷은 바닥 중앙이 원점이다. 부모에 위치·회전·크기를 적용해 공간에 놓는다.

- 행거형: `shirt`, `knit`, `blazer`, `fieldjacket`, `trousers`, `denim`. 셔츠는 `variant='stripe'`도 지원한다.
- 선반형: `variant='folded'`와 `shirt`, `knit`, `tshirt`, `trousers`, `denim`을 함께 사용한다. `chino`는 `trousers`의 별칭이다.
- 옷 부모의 `kind`, `color`, `variant` 속성과 `cloth*` 소재 이름을 유지한다. 신발 두 종류는 `wardrobe.py`의 별도 모델 함수에서 만든다.

의류만 비교할 때는 다음 명령을 사용한다. 공간 전체 빌드에는 이 명령을 먼저 실행할 필요가 없다.

```bash
"$WEARNEXT_PYTHON" prototype/blender/garments.py
"$WEARNEXT_PYTHON" prototype/blender/garments.py --preview
```

첫 명령은 `garments.blend`를 만든다. 두 번째는 같은 파일과 2100×720, 24 samples의 `garment-preview.png`를 만든다. 의류 라이브러리 렌더는 CPU 8스레드를 사용한다. API의 부모 관계·기존 장면 객체 보존·텍스처 패킹을 확인했고, 실제 Cycles 프리뷰에서 모델 형태를 검토했다. 이는 실물 의류 치수나 사용자 착용 핏의 검증을 뜻하지 않는다.

## 출처와 자산의 의미

`vendor/gscene.py`, `vendor/gsim.py`, `vendor/shirt-3.pkl`은 사용자가 전달한 `otjang-handoff-2026-10-11.zip`에서 복원한 기존 `blender/scripts/` 코드와 `blender/cache/`의 복사본이다. 기존 파일은 보존했다. 복사본에서는 과거 개발 환경의 절대 경로를 이 프로젝트의 `scene/work/` 기준으로 바꿨다. 원 작성자나 별도 외부 배포 라이선스를 증명하는 문서는 확인하지 않았으며, 공개 라이선스가 검증된 외부 에셋으로 소개하지 않는다.

셔츠는 제공된 시뮬레이션 꼭짓점 캐시와 깃·단추·커프스 구성을 재사용했다. v3는 봉제 기준 메시의 작은 위치 흔들림을 제거하고, 시뮬레이션 변위를 부드럽게 처리해 겨드랑이·소매 끝·밑단에 약한 접힘을 남긴다. 원본 캐시는 덮어쓰지 않으며 목·어깨 고정점 58개의 위치와 메시 연결·UV는 유지한다. 깃의 두께도 줄였다. 파생 캐시 `scene/work/pressed-shirt-v3.pkl`은 필요하면 자동으로 다시 생성한다. 니트는 셔츠 디테일을 제거하고 크루넥·골지 부분을 추가한다. `tailoring.py`는 몸통·소매·라펠·주머니를 곡면 메시로 구성하고, `textiles.py`는 소재별 중성 색상·법선·거칠기 맵을 만든다. 블레이저·야상·접은 옷과 공간·신발은 이번 프로토타입의 절차적 모델이다. 신발은 좌우 라스트, 실제 발 입구와 안감, 겹친 밑창, 곡면 스트랩 또는 혀·끈을 구분한다. 원단과 목재 무늬는 코드로 만들며, 개인 사진·쇼핑몰 상품 사진·외부 모델 다운로드를 재료로 사용하지 않는다. 참고 이미지는 공간 방향을 설명하는 자료이며 모델을 그대로 복제한 것이 아니다.

모두 **일반적인 의류 유형의 시각화**다. 로고·브랜드 고유 디자인, 특정 판매 상품의 정확한 재현, 사진에서 복원한 사용자 소유 의류, 실제 신체의 핏 시뮬레이션을 주장하지 않는다. 런타임에서 색이나 유형을 대응시켜도 이 경계는 유지한다.

## 반복 작업과 비용

기존 `vendor/shirt-3.pkl`을 사용하므로 기본 빌드에서 옷의 물리 시뮬레이션을 다시 계산하지 않는다. `vendor/gsim.py`의 직접 실행은 새로운 천 캐시가 정말 필요할 때만 한다. 텍스처 중간 파일과 새 시뮬레이션 출력의 기본 위치는 `prototype/scene/work/`이며 사용자 홈 경로에 의존하지 않는다.

화면 문구·CSS·선택 동작·로컬 저장 기능만 바꾸면 기존 GLB와 렌더를 재사용하고 웹 빌드만 수행한다. 의류 형태·방 구조·카메라를 바꿀 때 장면을 다시 만들고, 먼저 draft로 검토한 뒤 final을 렌더한다. Blender 생성·렌더를 여러 프로세스로 동시에 돌리면 출력 파일이 덮어써지므로 동일 `scene/assets/`를 대상으로는 한 번에 하나만 실행한다.

장면 생성기는 의류의 Subdivision 뷰포트와 렌더 단계를 모두 0으로 맞춘다. 새 의류의 충분히 촘촘한 기본 메시를 두 출력에 공통으로 사용해 Cycles에서만 실루엣이 매끈해지는 차이를 줄인다. 옷걸이·솔기 등 곡선 객체는 GLB 내보내기 전에 메시로 바꾸고 의류마다 같은 소재끼리 묶는다. 창을 통한 Cycles 조명은 브라우저에 자동 전달되지 않으며, 실제 WebGL의 방향광·접촉 음영·원단 맵을 별도로 검토한다. 폴리곤·메시 수는 생성된 `scene-meta.json`과 실제 GLB를 확인한다. 속도나 메모리 소비는 실행 기기에 따라 달라지며, 정지 화면 렌더 성공만으로 브라우저 성능을 통과 처리하지 않는다.
