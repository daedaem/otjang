# 내 PC에서 AI 코디 사진 시험 (무료 오픈소스, 사진 외부 전송 없음)

대표 PC에서 실행하는 Claude 세션(또는 대표)이 그대로 따라 하는 안내서다.

**목표**: 고민 중인 상품 + 내 옷장 옷을 함께 입은 "쇼핑몰 착용샷 같은" 사진을 무료 모델로 만들 수 있는지 확인한다.

## 지키는 조건

- **무료·로컬만 쓴다.** 유료 API, 무료 체험 크레딧, 온라인 데모는 쓰지 않는다. 가중치를 받은 뒤 실행할 때는 외부 접속 없이 돌린다.
- 첫 회차에는 개인 사진을 쓰지 않는다. 사람은 FASHN 공개 예제 인물을 쓰거나, 사람 사진 없이 AI 모델을 새로 그린다.
- 입력과 결과는 저장소 밖 `D:/ai-outfit/`에만 둔다.
  - 상품 사진은 판매처 사진이라 결과물을 외부에 올리지 않는다.
- 결과는 "코디 분위기"다. 핏·사이즈 근거로 쓰지 않는다.

## 모델과 장비

- **모델**: Qwen-Image-Edit-2509(Apache-2.0)를 Nunchaku 4비트 Lightning(4·8단계)으로 돌린다.
  - 입력 사진 1~3장을 함께 받는다. 공식 예시는 "사람 + 상품" 조합이다.
- **알려진 최소 사양(2차 출처)**: VRAM 8GB + RAM 16GB.
  - 대표 노트북 MSI GP66(RTX 3070 Laptop 8GB, RAM 16GB)이 딱 이 선이다.
  - 느리면 `num_blocks_on_gpu`, `use_pin_memory`를 조절한다.
- **설치**: ComfyUI(0.3.60 이상)와 ComfyUI-nunchaku 노드를 쓴다.
  - 가중치는 Hugging Face `nunchaku-tech`의 Qwen-Image-Edit-2509 4비트 Lightning, 그리고 그 워크플로가 요구하는 텍스트 인코더·VAE다.
  - 정확한 파일 이름과 연결은 ComfyUI-nunchaku 저장소의 Qwen-Image-Edit-2509 예제 워크플로를 따른다. 버전이 자주 바뀌니 받기 전에 확인한다.
- **이전에 버린 것**: 무료 FASHN VTON v1.5는 대표가 실제 사진으로 보고 품질 미달로 보류했다(`../vton-video-local/README.md`).

## 시험 입력

`python fetch_kit.py`로 `D:/ai-outfit/inputs`에 받는다. 앱 예시 옷장의 '아이비 캠퍼스' 코디다.

2026-10-16 대표 요청으로 Windows 기본 저장 위치를 D 드라이브로 바꿨다. `AI_OUTFIT_DIR` 환경 변수로 다른 저장소 밖 경로를 지정할 수 있다. macOS/Linux 기본값은 `~/ai-outfit/`이다. 이 PC의 런타임·캐시는 `D:/ai-outfit-runtime/`, 저장소는 `D:/otjang-ai-outfit-test/`에 둔다.

| 파일 | 내용 |
| --- | --- |
| 1-model-public-example.png | FASHN 공개 예제 인물(집에서 선 남성) |
| 2-mine-bottom-wide-chino-beige.jpg | 내 옷: 베이지 와이드 치노 |
| 3-mine-top-oxford-shirt-white.jpg | 내 옷: 화이트 옥스퍼드 셔츠 |
| 4-candidate-outer-harrington-navy.jpg | 고민 중: 네이비 해링턴 재킷 |

## 시험 케이스 (케이스마다 시드 2개)

1. **사람 사진에 입히기 (입력 3장)**: 1 + 4 + (2와 3을 나란히 붙인 한 장).
   - 프롬프트 예: "The man in image 1 wears the navy harrington jacket from image 2, worn open over the white oxford shirt, with the beige wide chinos from image 3. Keep his face, pose and the room. Full-body photo."
2. **AI 모델 착용샷 (사람 사진 없음, 입력 3장)**: 4 + 3 + 2.
   - 프롬프트 예: "A full-body fashion lookbook photo of a male model wearing the navy jacket from image 1 open over the white shirt from image 2 and the beige wide chinos from image 3. Plain light studio background, natural standing pose."
3. **한 벌씩 차례로**: 1에 3을 입히고, 그 결과에 2, 다시 그 결과에 4를 입힌다. 겹쳐 입히기가 무너지는지 본다.

## 기록표

| 케이스 | 시드 | 시간(장당) | 최대 VRAM | 재킷 모양·색·디테일(카라·지퍼·주머니) | 셔츠가 재킷 안에 남음 | 치노 모양·색 | 얼굴·손 | 쇼핑몰 착용샷처럼 보임(1~5) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | | | | | | | | |
| 2 | | | | | | | | |
| 3 | | | | | | | | |

**통과 기준(제안)**
- 6장 중 4장 이상이 옷 모양·색 검사를 통과한다.
- 자연스러움 4점 이상이 절반을 넘는다.
- 장당 시간은 기록만 한다. 서비스에서는 미리 만들어 두는 방식으로 대기를 숨긴다.

**대표 결정 연결**: 통과하면 앱의 "이 옷과 내 옷으로 되는 코디"에 붙이는 방식을 정한다. 통과하지 못하면 AI 사진은 보류하고 코디 보드로 간다.
