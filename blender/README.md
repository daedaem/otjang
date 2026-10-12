# 옷장 3D 자산 파이프라인 (Blender/bpy)

`app/assets/closet/`에 든 옷장·방·옷 4종의 형태(glb), 구운 빛과 그림자(webp), 원단 그림, `meta.json`을 만드는 스크립트다.
**기능 개발에는 필요 없다.** 앱은 이미 구운 자산을 바이트로 묶어 쓴다. 새 옷 종류를 더하거나 다시 구울 때만 쓴다.

지킬 것:
- 고객 사진마다 Blender를 돌리지 않는다. Blender는 옷 종류 자산과 옷장 장면을 만들 때만 쓴다. [사용자 결정] 사용자 맥에서는 돌리지 않는다.
- 종류로 그린 모습은 특정 상품의 재현이 아니다. 로고, 자수, 프린트, 패치를 그리지 않고 브랜드 모양을 추측하지 않는다.
- 사용자 사진을 자산이나 저장소에 넣지 않는다. `mine-*` 원단은 사진 속 색을 참고한 근사치 색 값만 담고 있다(사진 아님).

## 환경

```bash
python3.13 -m venv .venv && . .venv/bin/activate
pip install bpy==5.2.2 numpy pillow     # bpy = Blender를 파이썬 모듈로 쓴 것(무료, 수백 MB). 네트워크가 막힌 환경에서는 wheel을 따로 가져와야 한다
cd blender
```

리눅스(x86_64, CPU 2개 클라우드)에서만 돌려 봤다(2026-10-11~12). 맥·윈도는 확인하지 않았다.

## 명령

| 하는 일 | 명령 | 비고 |
|---|---|---|
| 원단 그림 | `python gfabric.py <출력폴더> mine-cord blazer-navy ...` → `<이름>.webp`, `<이름>-n.webp`(노멀). 반복 10.24cm | `PRESETS2`에 원단별 값 |
| 무채색 결 그림 | `python weaves.py <출력폴더>` → `weave-oxford/twill/hopsack/cord.webp` | 앱이 옷 색을 곱해 쓰는 회색 결. 아래 "결 그림" 참고 |
| 옷본 → 꿰매기 → 걸기 | `python gpattern.py <캐시이름> <해상도m> <꿰매기> <걸기> <다듬기> <종류>` 예: `python gpattern.py pcord-1 0.01 50 70 40 trucker` → `cache/pcord-1.pkl` | 1cm 한 벌 약 3~4분(CPU 2개) |
| 미리보기 렌더 | `python prender.py cache/pcord-1.pkl mine-cord out.png 0 360 450 16` | 240×300, 8샘플 약 19초 |
| 옷장 장면 미리보기 | `python gcloset.py out.png 1200 900 32` | |
| 굽기·내보내기 (전체) | `CLOSET_OUT=../app/assets/closet GSMP=40 python gcloset_export.py cache/pshirt-11.pkl cache/pblazer-2.pkl cache/pfield-1.pkl 2048 1024` | 옷장·방까지 굽기 때문에 오래 걸린다 |
| 굽기 (옷만, 기존 자산 폴더 갱신) | `ONLY=blazer,field SKIP_ROOM=1 GSMP=40 CLOSET_OUT=../app/assets/closet python gcloset_export.py cache/pshirt-11.pkl cache/pblazer-2.pkl cache/pfield-1.pkl 2048 1024` | `meta.json`이 있는 폴더만 |
| 사용자 원단 세트로 굽기 | `MINE=1 CACHES=shirt=cache/pshirt-11.pkl,field=cache/pfield-1.pkl,trucker=cache/pcord-1.pkl CLOSET_OUT=../app/assets/closet SKIP_ROOM=1 GSMP=40 python gcloset_export.py x x x 2048 1024` | 지금 `app/assets/closet`은 이 세트 + 블레이저 |
| glb 압축 | `cd ../app && cp assets/closet/*.glb assets/closet-src/ && npm run compress` | 내보낸 glb(원본)는 `assets/closet-src/`에, 압축본(meshopt)은 `assets/closet/`에 둔다 |
| 자산 묶기 | `cd ../app && npm run assets && npm run build` | `src/closet/assets.gen.js`(생성 파일, 저장소에 넣지 않음) → `dist/index.html` |

- 환경 변수: `GSMP`(옷 굽기 샘플, 기본 64), `DENOISE`(기본 1, Blender에 든 OpenImageDenoise), `RIM`(가장자리 두께, 기본 1), `MINE=1`(사용자 옷 원단 세트), `CACHES`(종류=캐시 목록), `OIDN_LIB`(잡티 제거 라이브러리 경로를 직접 줄 때), `CLOSET_OUT`(출력 폴더, 기본 `blender/web-closet`).
- 출력에는 웹이 쓰지 않는 `*-raw.npy`, `*.png`도 생긴다. 웹은 `*.webp`, `*.glb`, `meta.json`만 쓴다.
- **시뮬레이션 캐시(`cache/*.pkl`)는 저장소에 넣지 않았다**(.gitignore). 지금 자산을 만든 캐시 4벌(`pshirt-11`, `pfield-1`, `pblazer-2`, `pcord-1`, 모두 해상도 1cm, 약 7.4MB)은 2026-10-12 인수인계 묶음(`03-옷장-3D/pipeline/cache/`)에 있다. 다시 굽기만 하려면 그 캐시를 `blender/cache/`에 두고, 없으면 `gpattern.py`로 다시 만든다(셔츠·필드·블레이저 캐시를 만든 정확한 프레임 수는 기록이 없다).

## 단계별 파일

| 파일 | 하는 일 |
|---|---|
| `gpattern.py` | 옷본 그리기(앞판·뒤판·한 장 소매·깃·라펠, 소매산 길이 = 진동 둘레 + 여유분을 이분법으로 맞춤), 평면 조각 메시, 몸통 대용 형태 위에서 꿰매기(바느질 스프링), 옷걸이에 걸어 떨어뜨리기. `GARMENTS`에 `shirt`, `blazer`, `trucker`, `field`. 치수는 M 기준 일반 범위이고 실측이 아니다 |
| `gpdetail.py` | 걸린 형태 다듬기(좌우 대칭, 다림질, 이음매 붙이기, Taubin 매끄럽게), 깃·커프스·주머니·여밈단, 박음질 점선, 단추(구멍 4개, 뿔). 종류별 `build_*` |
| `gproxy.py` | 흔들림용 거친 천(2.6cm, 이음매 합침, 옷걸이·깃에 고정점) |
| `gfabric.py` | 실 한 올 단위 원단 그림: 옥스퍼드, 능직, 홉색, 줄무늬, 타탄(2/2 능직), 코듀로이 + 노멀맵. `PRESETS2`에 원단별 값 |
| `weaves.py` | 무채색 결 그림 4종(브라우저에서 색을 곱해 쓰는 것) |
| `gscene.py`, `gsim.py` | Blender 장면 기본(재질, 조명, 카메라, 단추), 좌표 변환 `B(p)`. `gscene.PRESETS`는 원단별 안감·단추 |
| `gcloset.py`, `woods.py` | 참나무 옷장(위 긴 봉 / 아래 왼쪽 셔츠 봉 / 아래 오른쪽 서랍), 벽·바닥, 나무·벽 질감 |
| `gcloset_export.py` | 굽기(확산광 직접+간접, 색 없이 빛만)와 내보내기(glb, 라이트맵, 그림자 그림, 원단, 거친 천, `meta.json`) |
| `oidn.py` | 구운 라이트맵 잡티 제거(OpenImageDenoise, ctypes) |
| `prender.py` | 한 벌 미리보기 렌더 |

### 결 그림 (weave-*.webp)

앱의 `src/closet/fabric.js`는 옷의 색 계열·밝기로 만든 색에 이 회색 결을 곱하고, 줄무늬·체크는 캔버스에 그려 원단을 만든다(근사). `app/assets/closet/`의 결 그림 4장은 2026-10-12에 `gfabric`의 같은 함수로 만들었지만 그때 쓴 값은 기록이 남지 않았다. `weaves.py`는 같은 방식으로 비슷한 결을 다시 만드는 스크립트이고 기존 그림과 바이트 단위로 같지는 않다.

## 새 옷을 더하는 길

- **있는 종류에 새 원단**: `gfabric.PRESETS2`와 `gscene.PRESETS`에 원단 추가 → `gcloset_export.WEB_PRESETS[종류]`에 이름 추가 → 원단 그림만 새로 만들면 되고 형태와 빛은 그대로 쓴다 → 앱 `src/closet/index.js`의 `TILES`에 추가 → 빌드. 다만 v0.4부터 색만 다른 옷은 브라우저에서 만든 원단으로 그릴 수 있어, 미리 만든 원단은 결이 특별한 경우(코듀로이, 타탄)에만 더하면 된다.
- **새 종류**(카디건, 블루종, 바지, 신발. 스웻셔츠는 2026-10-12에 이 길로 더했다 — 아래 "스웻셔츠를 더한 기록"): 옷본(`gpattern.GARMENTS`), 디테일(`gpdetail.build_*`), 굽기 기본 원단(`BAKE_PRESET`), 앱의 `KIND`가 모두 필요하다. 바지는 옷장에 거는 방식(집게 옷걸이 / 봉에 반 접기 / 선반에 개기)을 사용자가 먼저 정해야 한다. 신발은 천이 아니라 따로 모델링한다.

## 스웻셔츠를 더한 기록 (2026-10-12)

새 종류를 더하는 실제 예다. 바꾼 곳:
1. `gpattern.py`: `SWEAT` 치수(넓고 짧은 몸판, 떨어진 어깨, 곧은 밑단, 좁은 소매 끝)와 `GARMENTS['sweat']`(넥밴드 = 낮은 세운 깃 조각 1.8cm, 기모 물성). 넥밴드는 리브라 부드럽게(심지 1.0 대신 0.3) — 1.0이면 차이나 깃처럼 섰다(첫 시도 `psweat-1`).
2. `gpdetail.py`: `build_sweat`(리브 밑단 밴드 6cm, 리브 커프스 6cm·둘레 21cm, 진동·어깨·옆선·밑단 박음질, 단추 없음, 그래픽 없음), `SMOOTH`/`PRESS` 값.
3. `gscene.PRESETS['sweat-gray']`, `gfabric.PRESETS2['sweat-gray']`(헤더 그레이 기모: 능직 결 + 보풀), `gcloset_export` 의 `BAKE_PRESET`/`WEB_PRESETS`.
4. 명령: `python gpattern.py psweat-2 0.01 50 70 40 sweat`(약 3분) → `python prender.py cache/psweat-2.pkl sweat-gray out.png` 로 확인 → 앱 자산 복사본에 `CACHES=sweat=cache/psweat-2.pkl SKIP_ROOM=1 GSMP=40 CLOSET_OUT=<복사본> python gcloset_export.py x x x 2048 1024`(굽기 약 3분) → `sweat*.webp`·`meta.json` 의 `garments.sweat` 를 `app/assets/closet/` 에, `sweat.glb` 를 `app/assets/closet-src/` 에 → `npm run compress && npm run assets && npm run build`.
5. 앱: `src/closet/index.js` 의 `KIND.sweat`·`TILES['sweat-gray']`·`LOOK.sweat`, `src/wardrobe.js` 의 `LOOK_KINDS.sweat`. 서버: `Vocab.LOOK_KINDS`, `V2__look3d_sweat.sql`.

주의: `gcloset_export` 는 `meta.json` 을 새로 쓰면서 `weaves`·`note` 키를 버린다. 복사본에서 굽고 `garments.<종류>` 만 앱의 `meta.json` 에 합친다.

## 보이는 결함 (2026-10-12 기준, 사용자 결정으로 고치기 미룸)

- 흔들릴 때 옆 이음매 근처에 어두운 줄이 잠깐 보인다.
- 필드 재킷: 옆판이 앞판보다 어둡고, 주머니가 두툼한 상자처럼 보인다.
- 겨드랑이 안쪽에 밝은 점이 보일 때가 있다.
- 블레이저 뒷깃이 조금 높이 앉는다.
- 흰 셔츠가 따뜻한 조명에서 크림색으로 보인다. 코듀로이는 약간 붉게 보인다.
- 스트라이프 셔츠는 멀리서 흰 셔츠에 가깝게 보일 수 있다.
- 스웻셔츠: 리브 커프스가 소매보다 조금 굵은 원통처럼 보인다. 리브 골(세로 결)은 그리지 않았다.
