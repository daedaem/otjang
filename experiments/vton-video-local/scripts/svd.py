# 고객별 기본 영상(한 번만): 원래 사진을 Stable Video Diffusion XT로 짧은 영상으로 만든다.
# 이 영상은 움직임(흐름)만 쓰고, 화면은 쓰지 않는다. GPU면 fp16 + CPU 오프로딩으로 8GB에 맞춘다.
# 사용: python svd.py <원래 사진> <결과 mp4> [프레임=12] [단계=20] [움직임=25]
import json, sys, time
import torch
from PIL import Image
from diffusers import StableVideoDiffusionPipeline
from diffusers.utils import export_to_video
from common import WORK, DEVICE, peak_gpu_gb

src, out = sys.argv[1:3]
frames = int(sys.argv[3]) if len(sys.argv) > 3 else 12
steps = int(sys.argv[4]) if len(sys.argv) > 4 else 20
motion = int(sys.argv[5]) if len(sys.argv) > 5 else 25
t0 = time.time()
dtype = torch.float16 if DEVICE == 'cuda' else torch.float32
pipe = StableVideoDiffusionPipeline.from_pretrained(str(WORK / 'svd-xt'), variant='fp16', torch_dtype=dtype)
if DEVICE == 'cuda':
    pipe.enable_model_cpu_offload()
else:
    torch.set_num_threads(max(1, torch.get_num_threads()))
pipe.unet.enable_forward_chunking(chunk_size=1, dim=1)
t1 = time.time()
W, H = 384, 576
image = Image.open(src).convert('RGB').resize((W, H))
result = pipe(image, height=H, width=W, min_guidance_scale=1.0, max_guidance_scale=1.0, num_frames=frames,
              num_inference_steps=steps, motion_bucket_id=motion, noise_aug_strength=0.02, decode_chunk_size=1,
              fps=7, generator=torch.Generator().manual_seed(42))
t2 = time.time()
export_to_video(result.frames[0], out, fps=7)
info = {'device': DEVICE, 'frames': frames, 'steps': steps, 'motion_bucket_id': motion, 'size': [W, H],
        'load_s': round(t1 - t0, 1), 'generate_s': round(t2 - t1, 1), 'peak_gpu_gb': peak_gpu_gb()}
json.dump(info, open(out + '.json', 'w'), ensure_ascii=False)
print(json.dumps(info, ensure_ascii=False), flush=True)
