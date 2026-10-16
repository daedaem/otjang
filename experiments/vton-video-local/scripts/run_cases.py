# 공개 예제 3조합을 차례로: 착용 사진 → ③ 살아 있는 사진 → (고객별 한 번) 기본 영상 → ① 움직임 재사용 → 비교판.
# 사용: python run_cases.py   (예제 사진은 VTON_WORK/examples, 결과는 VTON_WORK/results)
import json, subprocess, sys, time
from common import WORK

EX, OUT = WORK / 'examples', WORK / 'results'
OUT.mkdir(parents=True, exist_ok=True)
CASES = [
    ('A', 'person0.png', 'garment0.png', 'tops', 'model', '앉은 남성 + 로고 티'),
    ('B', 'person2.png', 'garment2.webp', 'tops', 'model', '집에서 선 남성 + 큰 그림 프린트 티'),
    ('C', 'person5.png', 'garment3.jpeg', 'tops', 'flat-lay', '휴대폰 든 거울 셀카 + 펀칭 크롭탑'),
]
py = sys.executable
def run(*args):
    print('>', *args, flush=True)
    subprocess.run([py, *map(str, args)], check=True)
for name, person, garment, cat, kind, title in CASES:
    tryon, live = OUT / f'{name}-tryon.png', OUT / f'{name}-live.mp4'
    base, reuse = OUT / f'{name}-base.mp4', OUT / f'{name}-reuse.mp4'
    if not tryon.exists():
        run('tryon.py', EX / person, EX / garment, cat, kind, tryon)
    run('live.py', tryon, live)
    if not base.exists():
        run('svd.py', EX / person, base)
    run('warp.py', base, tryon, reuse)
    run('sheet.py', OUT / f'{name}-sheet.jpg', f'{name}: {title}', EX / person, EX / garment, tryon, reuse)
print(json.dumps({n: json.load(open(OUT / f'{n}-tryon.png.json')) for n, *_ in CASES}, ensure_ascii=False, indent=1))
