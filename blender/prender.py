# 옷본 방식 옷 미리보기 렌더. 사용: python prender.py <cache.pkl> <preset> <out.png> [yaw] [w] [h] [samples] [stage: pos|P1]
import bpy, sys, math, pickle, time, os
import numpy as np
import gscene
from gsim import B
cache, preset, out = sys.argv[1], sys.argv[2], os.path.abspath(sys.argv[3])   # Blender는 상대 경로를 .blend 기준으로 보므로 절대 경로로 바꾼다
yaw = float(sys.argv[4]) if len(sys.argv) > 4 else 0.0
w, h, smp = (int(sys.argv[5]) if len(sys.argv) > 5 else 360), (int(sys.argv[6]) if len(sys.argv) > 6 else 450), (int(sys.argv[7]) if len(sys.argv) > 7 else 16)
stage = sys.argv[8] if len(sys.argv) > 8 else 'pos'
D = pickle.load(open(cache, 'rb'))
bpy.ops.wm.read_factory_settings(use_empty=True); sc = gscene.setup(w, h, smp)
import gpdetail
if stage != 'pos': D['pos'] = D[stage]; D['P1'] = D[stage]; pickle.dump(D, open(os.path.join(__import__('tempfile').gettempdir(), 'p1.pkl'), 'wb')); cache = os.path.join(__import__('tempfile').gettempdir(), 'p1.pkl')
root, S, kind = gpdetail.build(cache, preset)
if os.environ.get('LEAFRED') if (os := __import__('os')) else False:
    red = gscene.simple_mat('red', (0.8, 0.05, 0.05), 0.5); grn = gscene.simple_mat('grn', (0.05, 0.6, 0.1), 0.5)
    for o in root.children:
        if o.name.startswith(('leaf', 'p-leaf')): o.data.materials[0] = red; o.data.materials[1] = red
        if o.name.startswith(('stand', 'p-stand')): o.data.materials[0] = grn; o.data.materials[1] = grn
top = 1.75; root.location = (0, 0, top); root.rotation_euler = (0, 0, yaw)
gscene.studio(top)
import os
if os.environ.get('CLOSE'): gscene.camera((0, -1.0, top - 0.06), (0, 0, top - 0.1), 85)          # 목·깃 가까이
else: gscene.camera((0, -2.45, top - 0.37), (0, 0, top - 0.39), 85)
sc.render.filepath = out; t = time.time(); bpy.ops.render.render(write_still=True); print('render', round(time.time() - t, 1), 's')
