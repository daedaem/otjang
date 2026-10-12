# 브라우저에서 색을 곱해 쓰는 무채색 결 그림 4종(weave-oxford, weave-twill, weave-hopsack, weave-cord)을 만든다.
# 앱(app/src/closet/fabric.js)은 이 회색 결에 옷의 색 계열·밝기를 곱해 원단을 만든다(근사). 원단 고유의 색은 들어 있지 않다.
# 사용: python weaves.py <출력폴더>     → <출력폴더>/weave-*.webp (1024px, 실제 10.24cm 반복)
# app/assets/closet/의 결 그림 4장은 2026-10-12에 gfabric의 같은 함수로 만든 것이지만 그때 쓴 값은 기록이 남지 않았다. 이 스크립트는 같은 방식으로 비슷한 결을 다시 만든다(기존 그림과 바이트 단위로 같지 않다).
import sys, os
import numpy as np
from PIL import Image
import gfabric

GRAY = dict(warp='#b2b2b2', weft='#d6d6d6', fleck='#ffffff', blotk=0.02)
WEAVES = {
    'oxford': dict(GRAY, weave='oxford'),                                    # 셔츠 (옥스퍼드)
    'twill': dict(GRAY, weave='twill', nstrength=0.5),                       # 치노·필드 재킷 (능직)
    'hopsack': dict(GRAY, weave='hopsack', fuzz=0.45, nstrength=0.4),       # 블레이저 (홉색)
}

def main(out):
    os.makedirs(out, exist_ok=True)
    for name, P in WEAVES.items():
        alb, _n, _size = gfabric.oxford(**P)
        Image.fromarray(alb).convert('L').convert('RGB').save(f'{out}/weave-{name}.webp', quality=90)
        print('weave-' + name, alb.mean().round(1))
    alb, _n, _size = gfabric.corduroy(base='#c4c4c4', dark='#4a4a4a')      # 트러커 (코듀로이)
    Image.fromarray(alb).convert('L').convert('RGB').save(f'{out}/weave-cord.webp', quality=90)
    print('weave-cord', alb.mean().round(1))

if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'out')
