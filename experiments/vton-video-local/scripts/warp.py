# ① 움직임 재사용: 고객 원래 사진으로 한 번 만든 기본 영상에서 움직임(광학 흐름)만 뽑아 저장하고,
# 상품마다는 착용 사진 한 장을 그 움직임대로 옮겨 영상을 만든다. 얼굴·로고는 착용 사진 그대로 옮겨진다.
# 사용: python warp.py <기본 영상 mp4> <착용 사진> <결과 mp4> [앞에서 쓸 장면 수] [왕복 1/0]
# 기본 영상 뒤쪽이 흐려지면 앞의 안정된 장면만 쓰고 왕복(앞→뒤→앞)으로 이어 반복 영상을 만든다.
import json, sys, time
import numpy as np, cv2, imageio.v2 as iio2, imageio.v3 as iio

base, tryon, out = sys.argv[1:4]
keep = int(sys.argv[4]) if len(sys.argv) > 4 else 0
pingpong = len(sys.argv) > 5 and sys.argv[5] == '1'
B = iio.imread(base)
if keep:
    B = B[:keep]
R = np.array(cv2.cvtColor(cv2.imread(tryon), cv2.COLOR_BGR2RGB))
Hr, Wr = R.shape[:2]; Hb, Wb = B.shape[1:3]
gray = lambda f: cv2.cvtColor(f, cv2.COLOR_RGB2GRAY)
# 고객별로 한 번: 각 장면 → 첫 장면 위치로 가는 흐름(역방향 매핑용)
t0 = time.time()
dis = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM)
g0 = gray(B[0])
flows = [np.zeros((Hb, Wb, 2), np.float32)] + [dis.calc(gray(B[t]), g0, None) for t in range(1, len(B))]
t1 = time.time()
# 상품마다: 흐름을 착용 사진 크기로 키워 옮기고, 장면 사이는 흐름을 섞어 4배 부드럽게
ys, xs = np.mgrid[0:Hr, 0:Wr].astype(np.float32)
sx, sy = Wr / Wb, Hr / Hb
def up(f):
    u = cv2.resize(f, (Wr, Hr)); u[..., 0] *= sx; u[..., 1] *= sy; return u
U = [up(f) for f in flows]
frames = []
for k in range(len(U) - 1):
    for a in (0, 0.25, 0.5, 0.75):
        f = (1 - a) * U[k] + a * U[k + 1]
        frames.append(cv2.remap(R, (xs + f[..., 0]).astype(np.float32), (ys + f[..., 1]).astype(np.float32), cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT))
frames.append(cv2.remap(R, (xs + U[-1][..., 0]).astype(np.float32), (ys + U[-1][..., 1]).astype(np.float32), cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT))
if pingpong:
    frames = frames + frames[-2:0:-1]
t2 = time.time()
iio2.mimwrite(out, frames, fps=24, quality=8, macro_block_size=8)
info = {'base': base, 'tryon': tryon, 'per_user_flow_s': round(t1 - t0, 2), 'per_product_warp_s': round(t2 - t1, 2), 'frames': len(frames), 'base_frames_used': len(B), 'pingpong': pingpong, 'size': [Wr, Hr]}
json.dump(info, open(out + '.json', 'w'), ensure_ascii=False)
print(json.dumps(info, ensure_ascii=False), flush=True)
