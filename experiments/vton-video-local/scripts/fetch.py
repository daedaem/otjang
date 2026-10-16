# 한 번만: 가중치·예제 사진을 VTON_WORK에 받는다. 이후 실행은 HF_HUB_OFFLINE=1로 외부 접속 없이 한다.
import subprocess, sys
from huggingface_hub import hf_hub_download, snapshot_download
from common import WORK

WORK.mkdir(parents=True, exist_ok=True)
for f in ['garment0.png', 'garment2.webp', 'garment3.jpeg', 'person0.png', 'person2.png', 'person5.png']:
    hf_hub_download('fashn-ai/fashn-vton-1.5', f'assets/examples/{f}', repo_type='space', local_dir=WORK / 'space')
(WORK / 'examples').mkdir(exist_ok=True)
for p in (WORK / 'space' / 'assets' / 'examples').iterdir():
    (WORK / 'examples' / p.name).write_bytes(p.read_bytes())
snapshot_download('stabilityai/stable-video-diffusion-img2vid-xt', local_dir=WORK / 'svd-xt',
                  allow_patterns=['*.json', '*.txt', '*fp16.safetensors'])
snapshot_download('depth-anything/Depth-Anything-V2-Small-hf')
print('FASHN 가중치는 fashn-vton-1.5 저장소의 scripts/download_weights.py --weights-dir', WORK / 'weights', '로 받으세요.')
