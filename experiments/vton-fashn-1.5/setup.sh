#!/usr/bin/env bash
# FASHN VTON v1.5 로컬 CPU 시험 환경 설치 (macOS Apple Silicon 기준, Linux CPU에서도 동작)
#
# - 모든 파일을 $VTON_DIR(기본 ~/vton-test) 안에만 만든다. 시스템 Python과 다른 프로젝트는 건드리지 않는다.
# - 내려받는 것은 코드(GitHub), Python 패키지(PyPI), 가중치(Hugging Face)뿐이다. 사진은 쓰지 않는다.
# - 공식 README의 `pip install -e .` 뒤 `onnxruntime-gpu`를 빼는 순서는 macOS에서 쓸 수 없다
#   (onnxruntime-gpu는 macOS 배포판이 없어 첫 설치부터 실패). 그래서 같은 의존성 목록을
#   onnxruntime(CPU)으로 바꿔 먼저 받고, 패키지 자체는 --no-deps로 설치한다. 결과는 README의 CPU 안내와 같다.
#
# 사용: bash setup.sh            (용량 안내 후 y/N 확인)
#       bash setup.sh --yes      (확인 생략)
set -euo pipefail

VTON_DIR="${VTON_DIR:-$HOME/vton-test}"
REPO_URL="https://github.com/fashn-AI/fashn-vton-1.5.git"
REPO_COMMIT="7c0f10af3f91ad4048fe9729c470a13ef905d25a"  # 2026-02-01 main. 재현성을 위해 고정
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ASSUME_YES=0
[[ "${1:-}" == "--yes" ]] && ASSUME_YES=1

mkdir -p "$VTON_DIR/logs"
LOG="$VTON_DIR/logs/setup.log"
exec > >(tee -a "$LOG") 2>&1
echo "=== setup start: $(date '+%Y-%m-%d %H:%M:%S') ==="
echo "VTON_DIR=$VTON_DIR"
uname -a

# 1. Python 3.10+ 찾기. macOS 기본 /usr/bin/python3(3.9)는 쓰지 않는다.
PY=""
for c in python3.12 python3.11 python3.10 python3.13 python3; do
  if command -v "$c" >/dev/null 2>&1 && "$c" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)'; then
    PY="$(command -v "$c")"; break
  fi
done
if [[ -z "$PY" ]]; then
  echo "중단: Python 3.10 이상이 없습니다. 'brew install python@3.12' 후 다시 실행하세요." >&2
  exit 1
fi
echo "python: $PY ($("$PY" --version))"

# 2. 용량 안내와 확인
cat <<'MSG'

내려받을 용량 (2026-10-13 조회 기준, 추정치 포함)
  가중치 (Hugging Face)
    fashn-ai/fashn-vton-1.5  model.safetensors      1,944 MB
    fashn-ai/DWPose          yolox_l.onnx             217 MB
                             dw-ll_ucoco_384.onnx     134 MB
    fashn-ai/fashn-human-parser model.safetensors     256 MB
    소계                                            약 2.55 GB (2.37 GiB)
  Python 패키지 (PyPI, macOS arm64 wheel)            약 0.3 GB
  코드 (GitHub, 예제 이미지 포함)                       수 MB
  ------------------------------------------------------------
  합계 내려받기 약 2.9 GB, 설치 후 디스크 약 4 GB 필요
  (모델을 float32로 올리므로 실행 중 메모리는 따로 약 8 GB 안팎 예상)
MSG
FREE_GB=$(df -Pk "$VTON_DIR" | awk 'NR==2 {printf "%d", $4/1024/1024}')
echo "남은 디스크: ${FREE_GB} GB"
if (( FREE_GB < 6 )); then
  echo "중단: 디스크 여유가 6 GB 미만입니다." >&2; exit 1
fi
if (( ! ASSUME_YES )); then
  read -r -p "진행할까요? [y/N] " ans
  [[ "$ans" == "y" || "$ans" == "Y" ]] || { echo "취소했습니다."; exit 0; }
fi

T0=$(date +%s)

# 3. 코드
if [[ ! -d "$VTON_DIR/fashn-vton-1.5/.git" ]]; then
  git clone "$REPO_URL" "$VTON_DIR/fashn-vton-1.5"
fi
git -C "$VTON_DIR/fashn-vton-1.5" checkout -q "$REPO_COMMIT"
T_CODE=$(date +%s)

# 4. 가상환경 + 패키지 (wheel을 먼저 받아 용량을 정확히 잰다)
"$PY" -m venv "$VTON_DIR/.venv"
VPY="$VTON_DIR/.venv/bin/python"
"$VPY" -m pip install -q --upgrade pip
# pyproject.toml의 dependencies에서 onnxruntime-gpu만 onnxruntime으로 바꾼 목록 + 측정용 psutil
DEPS=(
  "torch>=2.0.0" "torchvision>=0.15.0" "safetensors>=0.3.0" "huggingface_hub>=0.20.0"
  "pillow>=9.0.0" "numpy>=1.21.0" "opencv-python>=4.5.0" "tqdm>=4.65.0" "einops>=0.6.0"
  "onnxruntime>=1.14.0" "matplotlib>=3.5.0" "fashn-human-parser>=0.1.1"
  "setuptools>=61.0" "wheel" "psutil"
)
rm -rf "$VTON_DIR/wheels"
"$VPY" -m pip download -q -d "$VTON_DIR/wheels" "${DEPS[@]}"
PIP_BYTES=$(du -sk "$VTON_DIR/wheels" | awk '{print $1*1024}')
"$VPY" -m pip install -q --no-index --find-links "$VTON_DIR/wheels" "${DEPS[@]}"
"$VPY" -m pip install -q --no-deps --no-build-isolation -e "$VTON_DIR/fashn-vton-1.5"
"$VPY" -m pip freeze > "$VTON_DIR/logs/pip-freeze.txt"
if "$VPY" -m pip show onnxruntime-gpu >/dev/null 2>&1; then
  echo "경고: onnxruntime-gpu가 설치되어 있습니다." >&2
fi
T_PIP=$(date +%s)

# 5. 가중치. 사람 영역 분할 가중치도 $VTON_DIR 안(hf_home)에 받도록 HF_HOME을 고정한다.
export HF_HOME="$VTON_DIR/hf_home"
export HF_HUB_DISABLE_TELEMETRY=1
(cd "$VTON_DIR/fashn-vton-1.5" && "$VPY" scripts/download_weights.py --weights-dir "$VTON_DIR/weights")
T_W=$(date +%s)
W_BYTES=$(du -sk "$VTON_DIR/weights" "$HF_HOME" | awk '{s+=$1} END {print s*1024}')

# 6. 다운로드가 끝난 wheel 묶음은 지운다 (설치본은 .venv에 있음)
rm -rf "$VTON_DIR/wheels"
VENV_BYTES=$(du -sk "$VTON_DIR/.venv" | awk '{print $1*1024}')
CODE_BYTES=$(du -sk "$VTON_DIR/fashn-vton-1.5" | awk '{print $1*1024}')

"$VPY" - "$VTON_DIR/logs/setup_metrics.json" <<PYEOF
import json, sys, platform
m = {
  "date": "$(date '+%Y-%m-%d %H:%M:%S')",
  "platform": platform.platform(), "machine": platform.machine(),
  "repo_commit": "$REPO_COMMIT",
  "seconds": {"code": $T_CODE - $T0, "pip": $T_PIP - $T_CODE, "weights": $T_W - $T_PIP, "total": $T_W - $T0},
  "download_mb": {"pip_wheels": round($PIP_BYTES / 1e6), "weights": round($W_BYTES / 1e6), "code_repo": round($CODE_BYTES / 1e6)},
  "disk_after_mb": {"venv": round($VENV_BYTES / 1e6), "weights_and_hf_cache": round($W_BYTES / 1e6), "code_repo": round($CODE_BYTES / 1e6)},
}
m["download_mb"]["total"] = sum(m["download_mb"].values())
json.dump(m, open(sys.argv[1], "w"), indent=2, ensure_ascii=False)
print(json.dumps(m, indent=2, ensure_ascii=False))
PYEOF

cp "$HERE/run_tryon.py" "$VTON_DIR/run_tryon.py"
echo "=== setup done: $(date '+%Y-%m-%d %H:%M:%S'), 총 $((T_W - T0))초 ==="
echo "다음: $VTON_DIR/.venv/bin/python $VTON_DIR/run_tryon.py --person <사람 사진> --garment <옷 사진>"
