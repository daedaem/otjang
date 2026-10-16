# 내 PC에서 착용 사진 → 5초 영상 시험 (무료, 사진 외부 전송 없음)

이 문서는 대표 PC에서 실행하는 Claude 세션(또는 대표)이 그대로 따라 하는 시험 안내서다.
목적은 두 가지를 숫자로 확인하는 것이다.
- 무료 모델로 "착용 분위기 미리보기"가 쓸 만한 품질인지
- 고객이 기다릴 수 있는 시간 안에 나오는지

## 지키는 조건

- **사진은 이 PC 밖으로 보내지 않는다.**
  - 모델 가중치를 받은 뒤 실행할 때는 `HF_HUB_OFFLINE=1`로 둔다.
  - 온라인 데모, 유료 API(FASHN API, Higgsfield 등)는 쓰지 않는다.
- 결과 사진·영상과 개인 사진은 저장소에 올리지 않는다. 모두 `~/vton-video/` 한 폴더에 둔다. 지울 때는 그 폴더 하나만 지우면 된다.
- 첫 회차는 FASHN이 공개한 예제 사진만 쓴다. 대표 본인 사진은 둘째 회차에서 이 PC 안에서만 쓴다.
- 결과는 "착용 분위기 미리보기"다. 사이즈·핏을 판단하는 근거로 쓰지 않는다.

## 0. 먼저 확인할 것

- **운영체제**: Windows면 WSL2(우분투)에서 하는 것을 권장한다.
  - Wan2.2 공식 코드는 리눅스 기준이다(flash-attn 등).
  - 막히면 ComfyUI(Windows 포터블, Wan2.2 기본 지원)를 대안으로 쓴다.
- **그래픽카드**: `nvidia-smi`로 모델과 VRAM을 기록한다.
  - Wan2.2 TI2V-5B 공식 기준: 24GB(RTX 4090급)에서 `--offload_model True --convert_model_dtype --t5_cpu`.
  - VRAM이 그보다 작으면 ComfyUI의 오프로딩 설정을 시험한다(확인 필요).
- **디스크**: 여유 60GB 이상. Wan2.2 5B 체크포인트, FASHN 2.5GB, 파이썬 환경이 들어간다.

## 1. 시험 입력 (첫 회차, 공개 예제)

FASHN 공개 데모의 예제 사진이다. Space 저장소 `fashn-ai/fashn-vton-1.5`의 `assets/examples/`에 있다.
파일만 받고 온라인 데모는 실행하지 않는다.

| 조합 | 사람 | 옷 | 보려는 것 |
| --- | --- | --- | --- |
| A | person0 (앉은 남성) | garment0 (로고 티, 모델 착용) | 기준선. CPU 시험에서 로고·자세가 잘 유지됐다 |
| B | person2 (집에서 선 남성) | garment2 (큰 그림 프린트 오버핏 티) | 복잡한 프린트가 유지되는지 |
| C | person5 (휴대폰 든 거울 셀카) | garment3 (펀칭 크롭탑, 옷만 찍은 사진) | 손에 든 휴대폰(가림), 구멍 무늬 |

## 2. 착용 사진: FASHN VTON v1.5 (Apache-2.0)

- 코드: `github.com/fashn-AI/fashn-vton-1.5`
- 설치 순서는 `experiments/vton-fashn-1.5/setup.sh`를 참고한다. GPU면 `onnxruntime-gpu`를 그대로 쓴다.
- 기본 30단계로 실행하고, 한 장 생성 시간과 최대 VRAM을 기록한다(`torch.cuda.max_memory_allocated`).
- 옷 사진이 모델 착용 사진이면 `garment_photo_type="model"`, 옷만 찍은 사진이면 `"flat-lay"`.
- 참고(이 클라우드 CPU, 2026-10-13): 832×1248 한 장에 2,673초, 최대 메모리 7.25GB, 출력 576×864.

## 3. 5초 영상: Wan2.2 TI2V-5B (Apache-2.0)

- 코드: `github.com/Wan-Video/Wan2.2`, 가중치: `Wan-AI/Wan2.2-TI2V-5B`
- 공식 CLI로 착용 사진을 넣는다. 세로 사진이므로 `--size 704*1280`.

```bash
python generate.py --task ti2v-5B --size 704*1280 --ckpt_dir ./Wan2.2-TI2V-5B \
  --offload_model True --convert_model_dtype --t5_cpu \
  --image ~/vton-video/results/A/tryon.png \
  --prompt "The person stands naturally and shifts weight slightly, turning the shoulders a little. Subtle natural movement, fixed camera, clothing and face unchanged."
```

- 공식 문서: 24GB에서 5초 720p 한 편이 9분 안쪽이다.
- **빠른 설정도 같이 잰다.** 단계 수와 프레임 수를 줄여 같은 조합을 다시 만든다.
  - `--sample_steps`, `--frame_num` 옵션이 있는지 `python generate.py --help`로 먼저 확인한다.
  - 고객 대기시간 판단에 필요한 숫자다.

## 4. 기록표

| 조합 | 착용 사진 시간 | 영상 시간(기본) | 영상 시간(빠름) | 최대 VRAM | 같은 사람으로 보임 | 옷 형태(기장·소매) | 무늬·로고·글자 | 손·얼굴 일그러짐 | 가림 물건 유지 | 자연스러움(1~5) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A | | | | | | | | | | |
| B | | | | | | | | | | |
| C | | | | | | | | | | |

**통과 기준(제안)**
- 3조합 중 2개 이상이 옷 형태·색 검사를 통과한다.
- 영상의 얼굴·손 일그러짐이 눈에 띄지 않는다.
- 빠른 설정의 영상 시간이 3분 이하다.
  - 3분이면 고객에게 "준비되면 알려드려요"로 보여 줄 수 있는 범위로 본다(가정).

## 5. 둘째 회차 (첫 회차를 통과한 뒤)

- 대표 본인 전신 사진 1장과 같은 옷을 실제로 입은 사진으로 같은 표를 채운다.
- 실제로 입은 사진과 비교해 "분위기"와 "실제 핏"이 얼마나 다른지 적는다.
- 사진·결과는 PC 안에만 둔다.

## 이 클라우드에서 해 본 것 (2026-10-16, 참고)

- 그래픽카드가 없는 CPU 4코어·메모리 15GB 환경이다. Wan2.2는 디스크·메모리 한도로 돌릴 수 없었다.
- 대신 메모리에 들어가는 Stable Video Diffusion XT(Stability AI Community License, 평가용)로 조합 A의 착용 사진을 영상으로 만들었다.
  - 첫 시도는 15GB 한도를 넘어 중단됐다.
  - 384×576, 12프레임, 지침 1.0, 앞먹임 층 나눠 계산 설정으로 다시 돌렸고 한 단계에 약 60초였다.
- 이 숫자는 서비스 판단에 쓰지 않는다. 서비스 판단은 이 문서의 PC 시험으로 한다.
