# 시험 폴더와 장치. 모든 결과는 저장소 밖 VTON_WORK(기본 ~/vton-video)에만 남는다.
import os
from pathlib import Path

import torch

WORK = Path(os.environ.get('VTON_WORK', Path.home() / 'vton-video')).expanduser()
DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'


def peak_gpu_gb():
    return round(torch.cuda.max_memory_allocated() / 1024**3, 2) if DEVICE == 'cuda' else None
