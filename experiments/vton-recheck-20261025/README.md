# 가상 착용 재시험 (C4) — 대표 노트북, 무료·로컬, 사진 외부 전송 없음

> 2026-10-25 대표 결정(요구사항 R22): 가상 착용은 **대표 노트북 로컬 재시험**과 **공개 예제로 상용 서비스 비교**까지 한다. 개인 사진의 클라우드 전송 예외는 없다. 영상은 정지 사진 검증 뒤에 한다.
>
> 이 안내는 Claude가 2026-10-25에 공개 문서를 보고 썼으며 **직접 실행하지 않았다.** 파일 이름·노드 이름·VRAM은 실행 전에 아래 링크에서 다시 확인한다. 버전이 자주 바뀐다.

## 왜 다시 하나

- 2026-10-16 대표가 FASHN VTON v1.5 결과를 실제 사진으로 보고 착용 사진·영상을 보류했다([기록](../vton-video-local/README.md)).
- 다시 볼 조건은 "착용 사진 품질이 눈에 띄게 좋은 무료·로컬 모델"이었다. 그 뒤 여러 장을 함께 받는 편집 모델 두 개가 나와 이 조건에 맞는지 확인한다.

| 모델 | 라이선스 | 이 시험에서 쓰는 형태 | 메모 |
|---|---|---|---|
| FLUX.2 [klein] 4B (distilled) | Apache-2.0(4B). 9B는 비상업 | ComfyUI 공식 템플릿 "Flux.2 Klein 4B image edit distilled" | 공식 VRAM 안내는 약 13GB, GitHub README는 약 8GB로 서로 다르다. 8GB에서는 오프로딩으로 느릴 수 있다. Hugging Face에서 라이선스 동의가 필요할 수 있다 |
| Qwen-Image-Edit-2511 | Apache-2.0(실행 전 모델 카드에서 확인) | Unsloth GGUF Q4_K_M + ComfyUI-GGUF | 8GB용 커뮤니티 워크플로가 있으나 실측값은 없다. 여러 장 입력은 "image 1, image 2"처럼 번호로 가리킨다 |

## 지키는 조건

- **무료·로컬만.** 온라인 데모, 유료 API, 무료 체험 크레딧을 쓰지 않는다. 가중치를 받은 뒤에는 `HF_HUB_OFFLINE=1`로 실행하고, 실행 중에는 인터넷을 꺼도 된다.
- **사진은 이 PC 밖으로 나가지 않는다.** 모든 입력·결과는 저장소 밖 `~/vton-recheck/`에만 둔다. Git·채팅·PR에 올리지 않는다. Claude에게는 아래 기록표의 글자만 알려 준다.
- **판매처 상품 사진을 쓰지 않는다**(R20, 공급자별 가공·AI 처리 허용이 확인되지 않음). 옷은 **대표가 가진 옷을 직접 찍은 사진**으로 한다.
- 결과는 "분위기 미리보기"다. 사이즈·핏 근거로 쓰지 않는다.

## 장비 확인

이전 기록(2026-10-13)의 주 장비는 Windows 노트북 MSI GP66(RTX 3070 Laptop GPU, RAM 16GB)이다. 맥북 M1 Pro는 NVIDIA GPU가 없어 이 시험에서 뺀다.

```powershell
nvidia-smi   # GPU 이름과 VRAM(보통 8GB)을 기록표에 적는다
```

디스크 여유는 40GB 이상을 권장한다(두 모델과 텍스트 인코더, ComfyUI).

## 1. 사진 준비 (가장 중요)

같은 날, 같은 장소에서 찍는다. 이 시험의 장점은 **실제로 입은 사진과 AI 결과를 나란히 비교**할 수 있다는 것이다.

| 파일 | 찍는 법 |
|---|---|
| `me.jpg` | 정면 전신, 밝은 곳, 단색 벽. 몸에 붙는 무지 티셔츠와 얇은 바지(원래 옷 흔적이 결과에 덜 남는다). 모자 쓰지 않기 |
| `top.jpg` | 셔츠 한 벌을 바닥에 평평하게 펴서 위에서. 무늬·로고가 있는 옷이면 더 좋다 |
| `outer.jpg` | 재킷 한 벌, 같은 방식 |
| `bottom.jpg` | 바지 한 벌, 같은 방식 |
| `real-top.jpg` | `me.jpg`와 같은 자세로 그 셔츠를 실제로 입은 사진 |
| `real-layer.jpg` | 그 셔츠 위에 재킷을 열어 입은 사진 |
| `real-bottom.jpg` | 그 바지를 실제로 입은 사진 |

아이폰 HEIC는 PC에서 JPG로 바꾼다. 긴 변은 1024~1536px 정도로 줄이면 8GB에서 덜 느리다.

## 2. 설치

1. ComfyUI를 최신으로 설치하거나 업데이트한다(Windows 포터블 권장). 템플릿 목록에 Flux.2 Klein이 안 보이면 버전이 낮은 것이다.
2. **FLUX.2 klein 4B** — [ComfyUI 공식 안내](https://docs.comfy.org/tutorials/flux/flux-2-klein)의 파일을 받는다.
   - `models/text_encoders/qwen_3_4b.safetensors`
   - `models/diffusion_models/flux-2-klein-4b-fp8.safetensors` (distilled)
   - `models/vae/flux2-vae.safetensors`
3. **Qwen-Image-Edit-2511** — [ComfyUI 공식 안내](https://docs.comfy.org/tutorials/image/qwen/qwen-image-edit-2511)와 Unsloth의 GGUF 안내를 함께 본다.
   - ComfyUI-GGUF 사용자 노드를 설치한다.
   - Unsloth의 `Qwen-Image-Edit-2511` GGUF(Q4_K_M)와 워크플로(`unsloth_qwen_image_edit_2511.json`)를 받는다.
   - 텍스트 인코더(Qwen2.5-VL 7B)와 mmproj 파일은 **같은 접두어**여야 한다는 Unsloth 주의사항을 따른다.
   - 빠른 시험은 Lightning LoRA(4·8단계)를 쓴다. 품질 비교용으로 LoRA 없이 한 번 더 돌린다.
4. 받은 뒤 ComfyUI를 끄고, 실행할 때는 환경 변수 `HF_HUB_OFFLINE=1`을 둔다.

## 3. 시험 케이스 (모델마다, 케이스마다 시드 2개)

| # | 입력 | 프롬프트 예(영어가 더 안정적일 수 있음) | 비교할 실제 사진 |
|---|---|---|---|
| 1 상의 | me + top | "The person in image 1 wears the shirt from image 2. Keep the face, hair, body shape, pose and background unchanged. Keep the shirt's color, pattern, collar, buttons and logo exactly." | real-top |
| 2 겹쳐 입기 | me + top + outer | "...wears the shirt from image 2 with the jacket from image 3 worn open over it..." | real-layer |
| 3 하의 | me + bottom | "...wears the trousers from image 2, same length and leg width as shown..." | real-bottom |
| 4 차례로 | 1의 결과 + outer | 1의 결과에 재킷만 다시 입힌다(겹침이 무너지는지) | real-layer |

모델 2개 × 케이스 4개 × 시드 2개 = 16장. 한 장 시간과 최대 VRAM을 같이 적는다(작업 관리자 GPU 메모리 또는 `nvidia-smi`).

## 4. 비교판 만들기 (선택)

`compare_sheet.py`가 `내 사진 | 옷 | AI 결과 | 실제로 입은 사진`을 한 장으로 붙인다. 외부 접속 없이 Pillow만 쓴다.

```powershell
py -3 -m pip install pillow
py -3 experiments\vton-recheck-20261025\compare_sheet.py --me ~/vton-recheck/me.jpg --garment ~/vton-recheck/top.jpg --result ~/vton-recheck/out/klein-1-seed1.png --real ~/vton-recheck/real-top.jpg --out ~/vton-recheck/sheets/klein-1-seed1.png
```

## 5. 기록표

판정 기준은 [FASHN 시험](../vton-fashn-1.5/README.md)과 같다(좋음/보통/나쁨 + 이유 한 줄). 마지막 칸만 새로 더했다.

| 모델 | 케이스 | 시드 | 시간(장) | 최대 VRAM | 얼굴 | 체형 | 색 | 무늬·질감 | 로고·글자 | 구조(넥·소매·기장) | 경계 | 배경 | 실제 사진과 분위기 비슷함(1~5) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| klein | 1 | 1 | | | | | | | | | | | |

## 6. 통과 기준 (제안, 대표 확정)

- 모델 하나라도 케이스 1~3의 6장 중 4장 이상이 **색·구조**에서 '좋음'이고 **얼굴**이 과반 '좋음'이다.
- "실제 사진과 분위기 비슷함"의 평균이 3.5 이상이다.
- 무엇보다 대표가 10-16의 FASHN v1.5 결과보다 **눈에 띄게 좋다**고 판단한다.
- 시간은 기록만 한다. 서비스에서는 미리 만들어 두는 방식으로 대기를 숨긴다.

## 7. 상용 서비스 비교 (사진 업로드 없이)

FASHN Try-On Max, Google Doppl 같은 상용 결과는 **업체가 공개한 예제 결과만** 본다. 개인 사진을 올리지 않는다. 업체가 고른 예제라 실제보다 좋아 보이기 쉽다는 점을 함께 적는다. 로컬 결과가 이보다 크게 못 미치고 대표가 영상을 강하게 원할 때만 클라우드 예외를 다시 논의한다(현재 결정은 예외 없음).

## 8. 결과에 따른 다음 단계

| 결과 | 다음 |
|---|---|
| 통과 | L1: PC에서 만든 결과 파일을 앱에 가져와 원본 상품 사진·실측 비교와 나란히 보여 준다(서버 경유 없음). 그다음 L2(작은 움직임) 재시험을 설계한다 |
| 불합격 | 앱에는 L0 거울 콜라주만 둔다. 모델 이름·날짜·실패 항목을 이 폴더에 글로 남기고 다음 재시험 조건을 적는다 |

Claude에게 알려 줄 것: 기록표(글자), GPU·VRAM, 설치에서 막힌 단계. 사진과 결과 이미지는 보내지 않는다.
