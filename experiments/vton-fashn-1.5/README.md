# FASHN VTON v1.5 로컬 1장 시험 (M1 Pro 16GB, CPU)

무료 오픈소스 가상 착용 모델 [FASHN VTON v1.5](https://github.com/fashn-AI/fashn-vton-1.5)가 맥북에서 쓸 만한지 사진 1장으로 확인하는 시험 도구입니다. 결과 사진과 개인 사진은 이 저장소에 올리지 않습니다.

## 지키는 조건

| 조건 | 구현 |
|---|---|
| 별도 폴더·가상환경 | 모든 파일을 `~/vton-test` 안에 만듭니다. Hugging Face 캐시도 `~/vton-test/hf_home`으로 고정합니다. 지울 때는 `rm -rf ~/vton-test` 한 번이면 됩니다. |
| 시스템 Python 미사용 | Python 3.10 이상(Homebrew 등)으로 `~/vton-test/.venv`를 만듭니다. macOS 기본 `/usr/bin/python3`(3.9)는 쓰지 않습니다. |
| CPU판 onnxruntime | `onnxruntime-gpu`에는 macOS 배포판이 없습니다(2026-10-13 PyPI 확인: Linux x86_64/aarch64, Windows만 있음). |
| 사진 외부 전송 금지 | 실행 중에는 `HF_HUB_OFFLINE=1`로 Hugging Face 접근을 막습니다. 온라인 데모와 유료 API는 쓰지 않습니다. |
| 용량 확인 후 진행 | `setup.sh`가 용량을 보여 주고 `y`를 받아야 진행합니다. |
| 15분·메모리 제한 | 한 장 생성이 15분을 넘거나, 사용 가능 메모리가 0.5 GB 아래로 떨어지거나, 스왑이 3 GB 넘게 늘면 그 시점의 기록을 남기고 종료합니다. |

### 공식 README와 다른 점

README는 `pip install -e .`로 설치한 다음 `onnxruntime-gpu`를 지우고 `onnxruntime`을 설치하라고 안내합니다. 하지만 macOS에서는 첫 단계부터 `onnxruntime-gpu`를 찾지 못해 설치가 실패합니다. 그래서 `pyproject.toml`의 의존성 목록에서 그 항목만 `onnxruntime`으로 바꿔 먼저 설치하고, 패키지 자체는 `--no-deps`로 설치합니다. 결과는 README가 안내하는 CPU 환경과 같습니다. 그 밖의 설정(30단계, guidance 1.5, seed 42, category `tops`)은 README·예제의 기본값을 그대로 씁니다.

## 내려받는 용량

| 항목 | 용량 | 근거 |
|---|---|---|
| `fashn-vton-1.5/model.safetensors` | 1,944 MB | HF API 조회 |
| DWPose `yolox_l.onnx` + `dw-ll_ucoco_384.onnx` | 351 MB | HF API 조회 |
| `fashn-human-parser/model.safetensors` (SegFormer) | 256 MB | HF API 조회 |
| Python 패키지 (macOS arm64 wheel) | 약 300 MB | PyPI 주요 wheel 합산 추정 |
| 코드 | 약 1 MB | |
| **합계** | **약 2.9 GB** (설치 후 디스크 약 4 GB) | |

가중치 2,553 MB는 리허설에서 실제로 받은 양과 일치합니다. 패키지 용량은 맥에서 실제 값을 `setup_metrics.json`에 기록합니다. Linux 리허설에서는 torch가 CUDA판으로 깔려 3.2 GB였으므로 맥 값과 비교하지 않습니다.

## 실행 순서 (맥 터미널)

```bash
# 0) Python 3.10+ 확인. 없으면: brew install python@3.12
python3.12 --version

# 1) 이 저장소의 스크립트로 설치 (용량 안내 → y 입력)
bash experiments/vton-fashn-1.5/setup.sh

# 2) 아이폰 HEIC 사진이면 맥 안에서 JPG로 변환 (외부 전송 없음)
sips -s format jpeg ~/Desktop/me.heic --out ~/Desktop/me.jpg

# 3) 시험 실행 (전신 1장 + 자동 상반신 자르기 1장)
~/vton-test/.venv/bin/python ~/vton-test/run_tryon.py \
  --person ~/Desktop/me.jpg \
  --garment ~/Desktop/top.jpg \
  --garment-photo-type flat-lay   # 옷만 찍은 사진. 모델이 입은 상품 사진이면 model
```

시험 중에는 다른 무거운 앱(브라우저 탭 다수, Docker 등)을 닫아 두는 것이 좋습니다. 메모리 측정값이 덜 흔들립니다.

## 남는 기록

`~/vton-test/results/<실행시각>/`

- `metrics.json`: 모델 적재 시간, 이미지별 생성 시간, 최대 메모리(프로세스 RSS, getrusage), 최저 가용 메모리, 스왑 증가량. 실행 중에도 10초마다 갱신하므로 도중에 멈춰도 마지막 값이 남습니다.
- `compare.png`: 원본 | 옷 | 결과. 위는 전신, 아래는 상반신입니다.
- `report.md`: 설치 기록(`~/vton-test/logs/setup_metrics.json`)과 실행 기록을 모은 요약과 빈 판정표
- `result_full.png`, `result_upper.png`, `person_upper.png`

`~/vton-test/logs/`에는 `setup.log`, `setup_metrics.json`(설치 시간·내려받은 용량), `pip-freeze.txt`가 남습니다.

## 판정 방법

`report.md`의 판정표를 좋음/보통/나쁨과 이유 한 줄로 채웁니다. 판정 기준은 아래와 같습니다.

- **얼굴**: 같은 사람으로 보이면 좋음, 인상이 조금 달라지면 보통, 다른 사람 같으면 나쁨
- **체형**: 어깨선과 몸통 외곽선을 원본과 겹쳐 봤을 때 차이가 거의 없으면 좋음
- **색**: 옷 사진 옆에 두었을 때 같은 색 이름으로 부를 수 있으면 좋음, 톤만 다르면 보통
- **무늬·질감**: 줄무늬 간격과 방향, 체크 크기, 니트·데님 같은 원단 느낌이 남아 있는지 봅니다
- **로고·글자**: 위치, 철자, 없던 글자가 새로 생기지 않았는지 봅니다. 로고가 없는 옷이면 "해당 없음"으로 적습니다
- **구조**: 넥 모양(라운드·브이·칼라), 소매 길이, 밑단 길이와 마감을 봅니다
- **경계**: 목선, 손목, 허리에서 피부와 옷이 번지거나 끊기지 않는지 봅니다
- **배경**: 원본 배경과 다른 물체나 색 번짐이 생기지 않았는지 봅니다
- **종합**: 본인이 판단합니다

출력 해상도는 576×864로 고정이므로, 전신 사진에서는 옷 영역이 작아 로고와 무늬가 뭉개지기 쉽습니다. 상반신 결과를 함께 보는 이유입니다.

## 라이선스 메모

- FASHN VTON 코드·가중치, DWPose: Apache-2.0
- fashn-human-parser(SegFormer 기반): NVIDIA Source Code License를 따르며, 비상업 연구·평가 목적만 허용됩니다. 이번 시험은 개인 평가용입니다. 서비스에 쓰려면 이 부분을 대체하거나 라이선스를 따로 검토해야 합니다.

## 리허설 기록 (공식 예제 이미지, 클라우드 CPU)

사용자 사진 없이, 저장소에 들어 있는 `examples/data/model.webp`와 `garment.webp`로 스크립트 전체 흐름을 확인한 기록입니다. 맥(M1 Pro)이 아닌 클라우드 Linux x86_64(4 vCPU, RAM 15.7 GB, torch 2.14.1, float32)에서 실행했으므로 **시간은 맥 성능을 뜻하지 않습니다.** 메모리는 같은 float32 CPU 경로라 참고는 됩니다.

- 일시: 2026-10-13, 설정: 30단계, guidance 1.5, seed 42, `--garment-photo-type model`
- 가중치 다운로드: 2,553 MB (예상치와 일치). 패키지는 Linux에서 CUDA판 torch가 깔려 3,183 MB였으므로 맥 값과 다릅니다.
- 모델 적재 20초
- 생성 시간: 전신 2,673초(44.6분), 상반신 2,568초(42.8분). 단계당 약 85~95초
- 최대 메모리: 프로세스 RSS 7.25 GB, 최저 가용 메모리 8.47 GB, 스왑 증가 없음
- 15분 제한 중단 경로: `--timeout-min 0.5`로 따로 시험해, 상태 `aborted_timeout`과 그 시점의 메모리가 `report.md`에 남는 것을 확인했습니다.

품질 메모 (비교 이미지를 보고 Claude가 매긴 판정. 업체가 고른 예제라 결과가 좋게 나오기 쉬운 조건입니다)

| 항목 | 전신 | 상반신 | 이유 |
|---|---|---|---|
| 얼굴 | 좋음 | 좋음 | 같은 사람으로 보이고 모자·머리카락이 유지됨 |
| 체형 | 좋음 | 좋음 | 앉은 자세와 팔 위치가 같음 |
| 색 | 좋음 | 좋음 | 검정 유지 |
| 무늬·질감 | 해당 없음 | 해당 없음 | 무지 티셔츠 |
| 로고·글자 | 좋음 | 보통 | 둘 다 "FASHNAI"가 읽히지만, 상반신은 로고가 조금 기울고 커짐 |
| 구조 | 좋음 | 좋음 | 라운드넥과 반팔 길이가 같음 |
| 경계 | 보통 | 보통 | 원본 벨트가 셔츠에 덮여 사라짐. 상반신은 왼팔 문신이 일부 뭉개짐 |
| 배경 | 좋음 | 나쁨 | 상반신 결과의 오른쪽 뒤 난간 쪽에 원본에 없던 흰 물체가 생김 |

자동으로 자른 상반신이 해상도 면에서 유리할 거라고 예상했지만, 이 예제에서는 배경이 바뀌는 부작용이 있었습니다. 사진 한 쌍으로 얻은 결과라서 일반화할 수는 없습니다.
