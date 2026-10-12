# 옷장 장면을 웹용으로 굽는다.
#   옷장·벽·바닥: 형태(glb) + 조명(라이트맵, 색 없이 빛만) + 나무·벽 질감(반복 그림)
#   옷(종류마다): 형태(glb) + 위 칸/아래 칸 자리에서 구운 조명 2장 + 옷 그림자(뒤판·선반에 곱해 그리는 그림) 2장씩
# 옷끼리 서로 드리우는 그림자는 굽지 않는다: 웹에서 자리를 바꿔도 맞게 하려고, 옷은 한 벌씩 옷장 안에 걸어 놓고 굽는다.
# 사용: python gcloset_export.py <shirt.pkl> <blazer.pkl> <field.pkl> [closet_res] [garment_res] [quick]
import bpy, sys, os, math, time, json, pickle, shutil
import numpy as np
from PIL import Image, ImageFilter
import gscene, gsim, gcloset
from gsim import B

OUT = os.path.abspath(os.environ.get('CLOSET_OUT', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'web-closet'))); os.makedirs(OUT, exist_ok=True)
caches = dict(zip(('shirt', 'blazer', 'field'), sys.argv[1:4]))
if os.environ.get('CACHES'): caches = dict(kv.split('=') for kv in os.environ['CACHES'].split(','))   # 예: shirt=cache/a.pkl,trucker=cache/b.pkl
ONLY = os.environ.get('ONLY')                                                                       # 한 종류만 다시 구울 때 (나머지 결과는 그대로)
if ONLY: caches = {k: v for k, v in caches.items() if k in ONLY.split(',')}
CRES = int(sys.argv[4]) if len(sys.argv) > 4 else 2048
GRES = int(sys.argv[5]) if len(sys.argv) > 5 else 1536
QUICK = len(sys.argv) > 6 and sys.argv[6] == 'quick'
SMP = dict(closet=24 if QUICK else 40, room=16 if QUICK else 32, garment=16 if QUICK else int(os.environ.get('GSMP', 64)), decal=8 if QUICK else 32)
BAKE_PRESET = {'shirt': 'ocbd-white', 'blazer': 'blazer-navy', 'field': 'field-olive', 'trucker': 'mine-cord', 'sweat': 'sweat-gray'}
WEB_PRESETS = {'shirt': ['ocbd-white', 'ocbd-blue', 'ocbd-navy', 'stripe-blue'], 'blazer': ['blazer-navy'], 'field': ['field-olive'], 'trucker': ['mine-cord'], 'sweat': ['sweat-gray']}
if os.environ.get('MINE') == '1':                                                                   # 사용자 옷: 사진 색을 참고한 원단
    WEB_PRESETS = {'shirt': ['mine-stripe', 'mine-tartan'], 'field': ['mine-field'], 'trucker': ['mine-cord'], 'blazer': ['blazer-navy'], 'sweat': ['sweat-gray']}
    BAKE_PRESET['field'] = 'mine-field'
enc = lambda c: np.where(c <= 0.0031308, 12.92 * c, 1.055 * np.power(np.maximum(c, 0), 1 / 2.4) - 0.055)
LOG = []
def log(*a):
    s = ' '.join(str(x) for x in a); print(s, flush=True); LOG.append(s)


def select_only(obs):
    for o in bpy.context.scene.objects: o.select_set(False)
    for o in obs: o.select_set(True)
    bpy.context.view_layer.objects.active = obs[0]


def lightmap_uv(ob, margin=0.004):
    """조명용 두 번째 UV를 자동으로 펼친다 (상자 면마다 한 조각)."""
    ob.data.uv_layers.new(name='bake'); ob.data.uv_layers.active = ob.data.uv_layers['bake']
    select_only([ob]); bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=margin, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode='OBJECT')


def attach_image(ob, img):
    for slot in ob.material_slots:
        nt = slot.material.node_tree; n = nt.nodes.get('__bake__') or nt.nodes.new('ShaderNodeTexImage'); n.name = '__bake__'
        n.image = img; nt.nodes.active = n; n.select = True


def bake(obs, imgs, samples, color=False, margin=6):
    sc = bpy.context.scene; sc.cycles.samples = samples; sc.render.bake.margin = margin
    for ob, img in zip(obs, imgs): attach_image(ob, img)
    select_only(obs); t = time.time()
    bpy.ops.object.bake(type='DIFFUSE', pass_filter={'DIRECT', 'INDIRECT', 'COLOR'} if color else {'DIRECT', 'INDIRECT'}, margin=margin)
    return time.time() - t


def pixels(img):
    w, h = img.size; return np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)[::-1, :, :3]


DENOISE = os.environ.get('DENOISE', '1') == '1'


def save_light(px, path, k=None, close=7, blur=1.0):
    """빛 세기를 정규화해 sRGB 8비트로. 빈 곳(조각 밖)은 그대로.
    2026-10-11 밤: 잡티는 OpenImageDenoise로 지운다. 예전 방식(밝은 값으로 메우기)은 얼룩과 10~15% 밝기 상승을 만들었다."""
    np.save(path + '-raw.npy', px.astype(np.float16))                                             # 다시 후처리할 수 있게 원본을 남긴다
    if DENOISE:
        import oidn; px = np.maximum(oidn.denoise(px), 0); close = 0; blur = min(blur, 0.6)
    if k is None: k = float(np.percentile(px[px.max(2) > 0.001].max(1), 99.7)) / 0.97
    im = Image.fromarray((np.clip(enc(px / k), 0, 1) * 255 + 0.5).astype(np.uint8))
    if close: im = im.filter(ImageFilter.MaxFilter(close)).filter(ImageFilter.MinFilter(close))      # 점 같은 얼룩을 메운다
    if blur: im = im.filter(ImageFilter.GaussianBlur(blur))
    im.save(path + '.png'); im.save(path + '.webp', quality=90); return k


# ───────── 1) 옷장·벽·바닥 ─────────
sc, obs, L = gcloset.scene(400, 400, 64)
bpy.context.view_layer.update()
meta = dict(closet=dict(W=gcloset.W, H=gcloset.H, D=gcloset.D, T=gcloset.T, yB=gcloset.yB, SHELF=gcloset.SHELF, DIV=gcloset.DIV, RAIL_Z=gcloset.RAIL_Z,
                         RAIL=dict(hi=gcloset.RAIL_HI, lo=gcloset.RAIL_LO), HOOK=gcloset.HOOK, HANG=gcloset.HANG, WALL_Z=gcloset.WALL_Z,
                         LO=[gcloset.LO_X0, gcloset.LO_X1], SLOTS=gcloset.SLOTS, REF=gcloset.REF),
            tiles=dict(oak=L['oak'], floor=L['floor'], wall=L['wall']), light={}, garments={})
SKIP_ROOM = os.environ.get('SKIP_ROOM') == '1'                                                  # 옷만 다시 구울 때: 옷장·벽·바닥 결과는 그대로 쓴다
if SKIP_ROOM:
    old_meta = json.load(open(f'{OUT}/meta.json')); meta['light'] = old_meta['light']; meta['garments'] = old_meta.get('garments', {})
for name, res, smp in (() if SKIP_ROOM else (('closet', CRES, SMP['closet']), ('floor', CRES // 2, SMP['room']), ('wall', CRES // 2, SMP['room']))):
    img = bpy.data.images.new('L-' + name, res, res, float_buffer=True); obs[name].data.uv_layers.active = obs[name].data.uv_layers['bake']
    t = bake([obs[name]], [img], smp); k = save_light(pixels(img), f'{OUT}/light-{name}', blur=1.6 if name == 'closet' else 2.4)
    meta['light'][name] = k; log('bake', name, res, round(t), 's scale', round(k, 3))
meta['denoise'] = DENOISE
for name in ('oak', 'floor', 'wall'): Image.open(f'{gcloset.TEX}/{name}.png').save(f'{OUT}/tile-{name}.webp', quality=90)
# 옷장 형태 내보내기 (조명 UV를 두 번째로)
for name in ('closet', 'floor', 'wall', 'led'):
    ob = obs[name]
    if 'bake' in ob.data.uv_layers: ob.data.uv_layers.active = ob.data.uv_layers['UVMap']
select_only([obs[n] for n in ('closet', 'floor', 'wall', 'led')])
kw = dict(filepath=f'{OUT}/closet.glb' if not SKIP_ROOM else os.path.join(__import__('tempfile').gettempdir(), 'closet-skip.glb'), export_format='GLB', use_selection=True, export_texcoords=True, export_normals=True,
          export_materials='EXPORT', export_image_format='NONE', export_apply=True, export_yup=True)
try: bpy.ops.export_scene.gltf(**kw, export_vertex_color='NONE')
except TypeError: bpy.ops.export_scene.gltf(**kw)
log('closet.glb', os.path.getsize(f'{OUT}/closet.glb'))

# ───────── 2) 옷 그림자를 받을 판 (뒤판 앞, 칸 바닥 위) ─────────
DW = 0.95                                                                                         # 그림자 판 폭 (옷 하나 둘레)
def decal_planes(rail):
    x = gcloset.REF[rail]; y0 = gcloset.SHELF if rail == 'hi' else gcloset.yB; y1 = gcloset.H - gcloset.T if rail == 'hi' else gcloset.SHELF - gcloset.T
    zb = -gcloset.D + 0.0095
    b = gcloset.Builder(f'decal-back-{rail}', {'oak': bpy.data.materials['oak'].copy()})
    b.quad([(x - DW / 2, y0, zb), (x + DW / 2, y0, zb), (x + DW / 2, y1, zb), (x - DW / 2, y1, zb)], 'oak', (0, 1))
    f = gcloset.Builder(f'decal-floor-{rail}', {'oak': bpy.data.materials['oak'].copy()})
    f.quad([(x - DW / 2, y0 + 0.0006, zb), (x - DW / 2, y0 + 0.0006, 0), (x + DW / 2, y0 + 0.0006, 0), (x + DW / 2, y0 + 0.0006, zb)], 'oak', (0, 2))
    out = []
    for bl, (w0, h0) in ((b, (DW, y1 - y0)), (f, (DW, -zb))):
        ob = bl.finish(pack=False); ob.data.uv_layers.new(name='bake')
        u0 = ob.data.uv_layers['UVMap']; u1 = ob.data.uv_layers['bake']
        us = [d.uv[0] for d in u0.data]; vs = [d.uv[1] for d in u0.data]
        for d0, d1 in zip(u0.data, u1.data): d1.uv = ((d0.uv[0] - min(us)) / (max(us) - min(us)), (d0.uv[1] - min(vs)) / (max(vs) - min(vs)))
        ob.data.uv_layers.active = u1; ob.parent = bpy.data.objects['static']; out.append((ob, (w0, h0)))                # 옷을 만들 때 옷에 딸려 가지 않게
    return out, dict(x=x, y0=y0, y1=y1, zb=zb)


DRES = {'back': (192, 256), 'floor': (192, 64)}
planes = {r: decal_planes(r) for r in ('hi', 'lo')}
empty = {}
for r, (pl, geo) in planes.items():
    imgs = [bpy.data.images.new(f'E-{r}-{i}', *DRES['back' if i == 0 else 'floor'], float_buffer=True) for i in range(2)]
    t = bake([p for p, _ in pl], imgs, SMP['decal'], margin=2); empty[r] = [pixels(im) for im in imgs]; log('decal empty', r, round(t), 's')
    meta['closet'].setdefault('decal', {})[r] = dict(geo, w=DW)


# ───────── 3) 옷 한 벌씩: 기준 자리(위/아래)에 걸고 굽는다 ─────────
RIM = os.environ.get('RIM', '1') == '1'; PATTERN = False


def borrow_bake_uv(C, ob):
    from mathutils.bvhtree import BVHTree
    from mathutils.geometry import barycentric_transform
    from mathutils import Vector
    me = C.data; me.calc_loop_triangles(); uv = me.uv_layers['bake'].data
    tris = [lt for lt in me.loop_triangles]; verts = [v.co.copy() for v in me.vertices]
    bvh = BVHTree.FromPolygons(verts, [tuple(lt.vertices) for lt in tris])
    M = C.matrix_world.inverted() @ ob.matrix_world
    if 'UVMap' not in ob.data.uv_layers: ob.data.uv_layers.new(name='UVMap')                       # 순서 중요: 첫째 UV = 무늬, 둘째 UV = 조명 (웹에서 channel 1)
    if 'bake' not in ob.data.uv_layers: ob.data.uv_layers.new(name='bake')
    dst = ob.data.uv_layers['bake'].data
    for poly in ob.data.polygons:
        for li in poly.loop_indices:
            p = M @ ob.data.vertices[ob.data.loops[li].vertex_index].co
            loc, _, ti, _ = bvh.find_nearest(p)
            if ti is None: continue
            lt = tris[ti]; a, b, c = (verts[i] for i in lt.vertices); ua, ub, uc = (Vector((*uv[l].uv, 0)) for l in lt.loops)
            q = barycentric_transform(loc, a, b, c, ua, ub, uc); dst[li].uv = (q.x, q.y)


def prep_garment(cache, kind):
    """gexport와 같은 손질: 두께 빼기, 작은 조각만 매끄럽게, 조명 UV 배치, 천 조각 합치기."""
    global PATTERN
    PATTERN = pickle.load(open(cache, 'rb'))['kind'].endswith('pattern')
    if PATTERN:                                                                                        # 2026-10-12: 옷본(패턴)으로 꿰매 만든 옷
        import gpdetail; root, S, kind = gpdetail.build(cache, BAKE_PRESET[kind])
    else:
        root, S, kind = gscene.build_garment(cache, BAKE_PRESET[kind])
    parts = list(root.children_recursive)
    cloth = [o for o in parts if o.get('cloth')]
    SMALL = ('stand', 'leaf', 'cuff', 'lapel', 'collarF')
    for o in cloth:
        for m in list(o.modifiers):
            if m.type == 'SOLIDIFY':
                if PATTERN and RIM: m.use_rim_only = True; m.thickness = min(m.thickness, 0.0014)        # 2026-10-12: 가장자리만 두께(밑단·커프스·주머니 끝이 종이처럼 얇아 보이지 않게)
                else: o.modifiers.remove(m)
            elif m.type == 'SUBSURF': m.levels = 1 if o.name.startswith(SMALL) else 0
    fcls = gsim.build(S)[2]['fcls'] if any(o.name.startswith('body') for o in cloth) else None; islands = []   # 옷본 옷은 조각(객체)마다 한 섬
    for o in cloth:
        uv = o.data.uv_layers['UVMap']; groups = {}
        for pi, poly in enumerate(o.data.polygons): groups.setdefault(fcls[pi] if o.name.startswith('body') else o.name, []).append(pi)
        for key, polys in groups.items():
            us = [uv.data[li].uv[0] for pi in polys for li in o.data.polygons[pi].loop_indices]
            vs = [uv.data[li].uv[1] for pi in polys for li in o.data.polygons[pi].loop_indices]
            islands.append([o, polys, min(us), min(vs), max(us) - min(us), max(vs) - min(vs)])
    M = 0.014; area_ = sum((w + M) * (h + M) for *_, w, h in islands); Wlim = max(max(i[4] for i in islands) + M, math.sqrt(area_ * 1.25))
    islands.sort(key=lambda i: -i[5]); x = y = rowh = 0.0; place = []
    for isl in islands:
        w, h = isl[4], isl[5]
        if x + w > Wlim and x > 0: x = 0; y += rowh + M; rowh = 0
        place.append((isl, x, y)); x += w + M; rowh = max(rowh, h)
    total = max(Wlim, y + rowh); SC = 1 / total
    for o in cloth: o.data.uv_layers.new(name='bake')
    for (o, polys, u0, v0, w, h), X, Y in place:
        src, dst = o.data.uv_layers['UVMap'], o.data.uv_layers['bake']
        for pi in polys:
            for li in o.data.polygons[pi].loop_indices:
                u, v = src.data[li].uv; dst.data[li].uv = ((u - u0 + X) * SC, (v - v0 + Y) * SC)
    select_only(cloth); bpy.ops.object.convert(target='MESH'); bpy.ops.object.join(); C = bpy.context.view_layer.objects.active; C.name = f'cloth-{kind}'
    others = [o for o in root.children if o is not C and o.type in ('MESH', 'CURVE')]
    select_only(others); bpy.ops.object.convert(target='MESH')
    for o in others:                                                                                   # 단추·박음질도 옷의 구운 빛을 받게: 가장 가까운 옷 표면의 조명 UV를 빌려 쓴다
        if o.type == 'MESH' and o.data.materials and o.data.materials[0].name.split('.')[0] not in ('wood', 'steel'): borrow_bake_uv(C, o)
    hook = [o for o in root.children if o.name.startswith('hook')]
    return root, C, others, hook, S


def pose(root, hook, rail, yaw=gcloset.HANG):
    (px, py, pz), yaw = gcloset.slot_pose(gcloset.REF[rail], rail, yaw)
    root.location = B((px, py, pz)); root.rotation_euler = (0, 0, yaw)
    for h in hook: h.rotation_euler = (0, 0, math.pi / 2 - yaw)                                    # 고리는 봉을 감싸는 방향으로
    bpy.context.view_layer.update()


def delete_tree(root):
    obs_ = [root] + list(root.children_recursive)
    for o in obs_: bpy.data.objects.remove(o, do_unlink=True)


for kind, cache in caches.items():
    D_ = pickle.load(open(cache, 'rb')); assert D_['kind'].split('-')[0] == kind, (kind, D_['kind'])
    root, C, others, hook, S = prep_garment(cache, kind)
    gm = dict(light={}, decal={}, lining=gscene.PRESETS[BAKE_PRESET[kind]].get('lining'))
    if D_['kind'].endswith('pattern'):                                                                # 흔들림용 물리 천 (거친 그물, 반듯한 최종 모양 기준)
        import gproxy, gpdetail; gm['proxy'] = gproxy.make_proxy(gpdetail.LAST); log(kind, 'proxy', gm['proxy']['n'], 'pins', len(gm['proxy']['pin']))
    for rail in ('hi', 'lo'):
        pose(root, hook, rail)
        C.data.uv_layers.active = C.data.uv_layers['bake']
        img = bpy.data.images.new(f'G-{kind}-{rail}', GRES, GRES, float_buffer=True)
        t = bake([C], [img], SMP['garment'], margin=10)
        gm['light'][rail] = save_light(pixels(img), f'{OUT}/{kind}-light-{rail}', close=9, blur=1.2)
        log('bake', kind, rail, round(t), 's')
        pl, geo = planes[rail]
        imgs = [bpy.data.images.new(f'D-{kind}-{rail}-{i}', *DRES['back' if i == 0 else 'floor'], float_buffer=True) for i in range(2)]
        t = bake([p for p, _ in pl], imgs, SMP['decal'], margin=2)
        for i, (im, nm) in enumerate(zip(imgs, ('back', 'floor'))):
            a = pixels(im).mean(2); e = empty[rail][i].mean(2)
            ratio = np.clip(a / np.maximum(e, 1e-4), 0, 1)
            hh, ww = ratio.shape; fx = np.minimum(np.arange(ww) / (ww * 0.12), 1); fx = np.minimum(fx, fx[::-1])     # 판 가장자리는 1(그림자 없음)로
            fy = np.minimum(np.arange(hh) / (hh * 0.08), 1); fy = np.minimum(fy, fy[::-1]) if nm == 'back' else np.ones(hh)
            ratio = 1 - (1 - ratio) * fx[None, :] * fy[:, None]
            im8 = Image.fromarray((ratio * 255 + 0.5).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.5))
            im8.save(f'{OUT}/{kind}-shadow-{nm}-{rail}.png'); im8.save(f'{OUT}/{kind}-shadow-{nm}-{rail}.webp', quality=92)
        log('decal', kind, rail, round(t), 's')
    # 내보내기: 원점·회전 없이 (웹에서 자리마다 놓는다)
    root.location = (0, 0, 0); root.rotation_euler = (0, 0, 0)
    for h in hook: h.rotation_euler = (0, 0, 0)
    bpy.context.view_layer.update()
    C.data.uv_layers.active = C.data.uv_layers['UVMap']; C.data.color_attributes.active_color = C.data.color_attributes['seam']
    select_only([C] + others)
    kw = dict(filepath=f'{OUT}/{kind}.glb', export_format='GLB', use_selection=True, export_texcoords=True, export_normals=True,
              export_materials='EXPORT', export_image_format='NONE', export_apply=True, export_yup=True)
    try: bpy.ops.export_scene.gltf(**kw, export_vertex_color='ACTIVE')
    except TypeError: bpy.ops.export_scene.gltf(**kw, export_colors=True)
    tiles, normals = {}, []
    import gfabric
    for p in WEB_PRESETS[kind]:
        if p in gfabric.PRESETS2: tiles[p] = gfabric.save(p, OUT); normals.append(p)                      # 2026-10-12: 실 한 올 단위 원단 그림 + 결 노멀맵
        else: path, Wm, Hm = gscene.fabric_tile(p, gscene.PRESETS[p]); Image.open(path).save(f'{OUT}/{p}.webp', quality=92); tiles[p] = [Wm, Hm]
    gm['tiles'] = tiles; gm['normals'] = normals; meta['garments'][kind] = gm
    log(kind, 'glb', os.path.getsize(f'{OUT}/{kind}.glb'))
    delete_tree(root)
    for o in list(bpy.data.objects):
        if o.name.startswith(('cloth-', 'body', 'hanger', 'hook', 'buttons')) and o.parent is None and o.name not in ('static',): bpy.data.objects.remove(o, do_unlink=True)

json.dump(meta, open(f'{OUT}/meta.json', 'w'), indent=1, ensure_ascii=False)
open(f'{OUT}/export.log', 'w').write('\n'.join(LOG)); log('ALL DONE')
