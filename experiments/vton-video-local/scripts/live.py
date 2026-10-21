# ③ 살아 있는 사진: 착용 사진 한 장의 깊이를 추정해, 가까운 사람이 배경보다 더 움직이는 시차와
# 숨쉬듯 아주 작은 확대·축소로 2초 반복 영상을 만든다. 자세는 바뀌지 않는다.
# 사용: python live.py <착용 사진> <결과 mp4>
import json, sys, time
import numpy as np, cv2, imageio.v2 as iio2, torch
from PIL import Image
from transformers import pipeline

src, out = sys.argv[1:3]
torch.set_num_threads(max(1, torch.get_num_threads()))
t0 = time.time()
est = pipeline('depth-estimation', model='depth-anything/Depth-Anything-V2-Small-hf', device='cpu')
img = Image.open(src).convert('RGB')
t1 = time.time()
d = np.array(est(img)['depth'].resize(img.size), dtype=np.float32)
d = (d - d.min()) / (d.max() - d.min() + 1e-6)  # 1에 가까울수록 가까움
a = np.array(img); H, W = a.shape[:2]
ys, xs = np.mgrid[0:H, 0:W].astype(np.float32)
frames, N = [], 48
for i in range(N):
    ph = 2 * np.pi * i / N
    dx, dy = 6.0 * np.sin(ph) * d, 2.0 * np.sin(2 * ph) * d
    s, cx, cy = 1 + 0.008 * np.sin(ph), W / 2, H * 0.45
    mx = ((xs - cx) / s + cx - dx).astype(np.float32)
    my = ((ys - cy) / s + cy - dy).astype(np.float32)
    frames.append(cv2.remap(a, mx, my, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT))
t2 = time.time()
iio2.mimwrite(out, frames, fps=24, quality=8, macro_block_size=8)
info = {'input': src, 'model_load_s': round(t1 - t0, 1), 'per_image_s': round(t2 - t1, 1), 'frames': N, 'size': [W, H]}
json.dump(info, open(out + '.json', 'w'), ensure_ascii=False)
print(json.dumps(info, ensure_ascii=False), flush=True)
