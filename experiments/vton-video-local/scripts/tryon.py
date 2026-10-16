# 착용 사진: FASHN VTON v1.5 한 장. 시간과 최대 메모리를 기록한다.
# 사용: python tryon.py <사람> <옷> <tops|bottoms|one-pieces> <model|flat-lay> <결과 png> [단계=30]
import json, sys, time
import torch
from PIL import Image
from fashn_vton import TryOnPipeline
from common import WORK, DEVICE, peak_gpu_gb

person, garment, category, photo_type, out = sys.argv[1:6]
steps = int(sys.argv[6]) if len(sys.argv) > 6 else 30
t0 = time.time()
pipe = TryOnPipeline(weights_dir=str(WORK / 'weights'))
t1 = time.time()
res = pipe(person_image=Image.open(person).convert('RGB'), garment_image=Image.open(garment).convert('RGB'),
           category=category, garment_photo_type=photo_type, num_timesteps=steps, seed=42)
t2 = time.time()
res.images[0].save(out)
info = {'device': DEVICE, 'steps': steps, 'load_s': round(t1 - t0, 1), 'generate_s': round(t2 - t1, 1),
        'peak_gpu_gb': peak_gpu_gb(), 'size': res.images[0].size}
try:  # 리눅스·맥만(Windows에는 resource 모듈이 없다)
    import resource
    info['peak_rss_gb'] = round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024 / 1024, 2)
except Exception:
    pass
json.dump(info, open(out + '.json', 'w'), ensure_ascii=False)
print(json.dumps(info, ensure_ascii=False), flush=True)
