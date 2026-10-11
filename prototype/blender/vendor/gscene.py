# 시뮬레이션한 옷에 디테일(깃, 여밈단, 단추, 주머니, 커프스)과 원단을 입히고 Cycles로 렌더한다.
# 사용: python gscene.py <cache.pkl> <preset> <out.png> [yaw] [w] [h] [samples]
import bpy, bmesh, math, pickle, sys, time, os
import numpy as np
from pathlib import Path
from mathutils import Vector
from PIL import Image
import gsim
from gsim import body_fn, smooth, lerp, B

# WearNext adaptation: portable output directory; the wrapper may override HERE.
HERE = str(Path(__file__).resolve().parents[2] / 'scene' / 'work')
clamp = lambda v, a, b: min(b, max(a, v))
TAU = 2 * math.pi

PRESETS = {
    'ocbd-white': dict(weave='oxford', c1='#f6f4ee', c2='#e6e3da'),
    'ocbd-blue': dict(weave='oxford', c1='#7fa3d6', c2='#d3e0f2'),
    'ocbd-navy': dict(weave='oxford', c1='#1c2a4d', c2='#3b4c78'),
    'stripe-blue': dict(weave='stripe', c1='#f6f4ee', c2='#e6e3da', s1='#4570b8', s2='#7d9fd8', pitch=0.0045),
}
hexrgb = lambda h: tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))
def lin(c): c = c / 255.0; return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


# ───────── 원단 무늬 (작은 조각을 실제 크기로 반복) ─────────
def fabric_tile(name, P):
    """옥스퍼드: 색실과 흰 실이 2올씩 엮인 바스켓 조직 + 굵은 실(슬럽). 한 칸 0.4mm."""
    rng = np.random.default_rng(7); px = 0.0002                                                               # 1px = 0.2mm
    if P['weave'] == 'stripe': Wm = P['pitch'] * 2; W = int(round(Wm / px)); W -= W % 4
    else: W = 256
    H = 256; Wm, Hm = W * px, H * px
    yy, xx = np.mgrid[0:H, 0:W]
    cell = ((xx // 2) + (yy // 2)) % 2                                                                        # 2px 칸이 번갈아
    c1, c2 = np.array(hexrgb(P['c1']), float), np.array(hexrgb(P['c2']), float)
    img = np.where(cell[..., None] == 1, c1, c2)
    if P['weave'] == 'stripe':
        band = (xx < W // 2)[..., None]; s1, s2 = np.array(hexrgb(P['s1']), float), np.array(hexrgb(P['s2']), float)
        img = np.where(band, np.where(cell[..., None] == 1, s1, s2), img)
    noise = rng.normal(0, 1, (H, 1)) * 0.025 + rng.normal(0, 1, (1, W)) * 0.02 + rng.normal(0, 1, (H, W)) * 0.02   # 실 굵기 차이
    img = img * (1 + noise[..., None])
    for _ in range(int(W * H / 900)):                                                                          # 슬럽: 가로로 길게 밝거나 어두운 실
        y, x, L = rng.integers(0, H), rng.integers(0, W), rng.integers(8, 40); k = rng.choice([1.06, 0.95])
        xs = (np.arange(x, x + L)) % W; img[y, xs] *= k
    img = np.clip(img, 0, 255).astype(np.uint8)
    path = f'{HERE}/tex/{name}.png'; os.makedirs(f'{HERE}/tex', exist_ok=True); Image.fromarray(img).save(path)
    return path, Wm, Hm


def cloth_material(name, P):
    path, Wm, Hm = fabric_tile(name, P)
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; N = nt.nodes; bsdf = N['Principled BSDF']
    uv = N.new('ShaderNodeUVMap'); uv.uv_map = 'UVMap'; mp = N.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (1 / Wm, 1 / Hm, 1)
    tx = N.new('ShaderNodeTexImage'); tx.image = bpy.data.images.load(path); tx.interpolation = 'Cubic'
    nt.links.new(uv.outputs['UV'], mp.inputs['Vector']); nt.links.new(mp.outputs['Vector'], tx.inputs['Vector'])
    ao = N.new('ShaderNodeAttribute'); ao.attribute_name = 'seam'                                              # 바느질 선 음영
    mul = N.new('ShaderNodeMixRGB'); mul.blend_type = 'MULTIPLY'; mul.inputs['Fac'].default_value = 1
    nt.links.new(tx.outputs['Color'], mul.inputs['Color1']); nt.links.new(ao.outputs['Color'], mul.inputs['Color2'])
    nt.links.new(mul.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.82
    for k, v in (('Sheen Weight', 0.35), ('Sheen Roughness', 0.45), ('Subsurface Weight', 0.0)):
        if k in bsdf.inputs: bsdf.inputs[k].default_value = v
    bump = N.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.08; bump.inputs['Distance'].default_value = 0.0004
    bw = N.new('ShaderNodeRGBToBW'); nt.links.new(tx.outputs['Color'], bw.inputs['Color']); nt.links.new(bw.outputs['Val'], bump.inputs['Height']); nt.links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    return m


def simple_mat(name, color, rough=0.5, metal=0.0, coat=0.0, sheen=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True; b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*color, 1); b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    if coat and 'Coat Weight' in b.inputs: b.inputs['Coat Weight'].default_value = coat
    if sheen and 'Sheen Weight' in b.inputs: b.inputs['Sheen Weight'].default_value = sheen
    return m


def link(ob):
    bpy.context.scene.collection.objects.link(ob); return ob


def mesh_obj(name, verts, faces, uvs=None, mat=None, smooth_shade=True):
    me = bpy.data.meshes.new(name); me.from_pydata([B(p) for p in verts], [], faces); me.update()
    if uvs is not None:
        uvl = me.uv_layers.new(name='UVMap'); li = 0
        for f, fu in zip(me.polygons, uvs):
            for k, l in enumerate(f.loop_indices): uvl.data[l].uv = fu[k]
    if smooth_shade:
        for p in me.polygons: p.use_smooth = True
    ob = link(bpy.data.objects.new(name, me))
    if mat: ob.data.materials.append(mat)
    ca = me.color_attributes.new('seam', 'FLOAT_COLOR', 'POINT')
    for d in ca.data: d.color = (1, 1, 1, 1)
    return ob


def follower(rest, pos, faces, front_set):
    """제자리 앞판 위의 점을 시뮬레이션 뒤 위치로 옮긴다 (가장 가까운 삼각형 기준)."""
    from mathutils.bvhtree import BVHTree
    from mathutils.geometry import barycentric_transform
    tris = []
    for f in faces:
        if all(v in front_set for v in f):
            for k in range(1, len(f) - 1): tris.append((f[0], f[k], f[k + 1]))
    R = [Vector(p) for p in rest]; Q = [Vector(p) for p in pos]
    bvh = BVHTree.FromPolygons(R, tris)
    def go(p):
        loc, nrm, idx, dist = bvh.find_nearest(Vector(p)); a, b, c = tris[idx]
        return tuple(barycentric_transform(Vector(p), R[a], R[b], R[c], Q[a], Q[b], Q[c]))
    return go


def grid_patch(F, corners, nu, nv, off, warp=None, flip=False, zf=None):
    """앞판 위에 얹는 조각. corners: 왼위, 오른위, 오른아래, 왼아래 [x, y] (옷 좌표)."""
    tl, tr, br, bl = corners; V, Fc, U = [], [], []
    for j in range(nv + 1):
        for i in range(nu + 1):
            u, v = i / nu, j / nv
            x = (1 - v) * lerp(tl[0], tr[0], u) + v * lerp(bl[0], br[0], u); y = (1 - v) * lerp(tl[1], tr[1], u) + v * lerp(bl[1], br[1], u)
            if warp: dx, dy = warp(u, v); x += dx; y += dy
            o = off(u, v) if callable(off) else off
            V.append((x, y, zf(x, y) + o)); U.append((x, y))
    for j in range(nv):
        for i in range(nu):
            a = j * (nu + 1) + i; q = (a, a + nu + 1, a + nu + 2, a + 1)
            Fc.append(q[::-1] if flip else q)
    return V, Fc, [[U[k] for k in q] for q in Fc]


def make_zf(S, F):
    def zF(x, y):
        yt, yb = F['top_f'](x), F['hem'](x, True); t = clamp((yt - y) / (yt - yb), 0, 1); return F['z_at'](x, t, True)
    return zF


def collar_geo(S, F, zF, C):
    """목둘레를 따라 세운 밴드(스탠드)와, 그 위에서 접혀 내려오는 깃(리프)."""
    aN = S['aN']; NU, NQ = 80, 12
    def loop(psi):
        sn, cs = math.sin(psi), math.cos(psi); fr = sn > 0
        x = aN * cs; y = F['neck_f'](abs(cs)) if fr else -S['nB'] * (1 - cs * cs)
        bn = S['bNf'] if fr else S['bNb']; z = (1 if fr else -1) * bn * abs(sn)
        ox, oz = cs / aN, sn / bn; n = math.hypot(ox, oz); return x, y, z, ox / n, oz / n
    stV, stF, stU, lfV, lfF, lfU, tips = [], [], [], [], [], [], []; arc = 0; prev = None
    for i in range(NU + 1):
        psi = lerp(C['from'], C['to'], i / NU); x, y, z, ox, oz = loop(psi)
        if prev: arc += math.dist((x, y, z), prev)
        prev = (x, y, z)
        d = abs(((psi - math.pi / 2 + math.pi) % TAU + TAU) % TAU - math.pi); fr = 1 - smooth(C.get('frA', 0.25), C.get('frB', 1.5), d); sx = 1 if math.cos(psi) >= 0 else -1
        hS = lerp(C['hS'], C.get('hSf', C['hS']), fr); lean = C.get('lean', -0.003)
        stV += [(x + ox * 0.0005, y - 0.006, z + oz * 0.0005), (x + ox * lean, y + hS, z + oz * lean)]; stU += [(arc, 0), (arc, hS)]
        if i < NU: a = 2 * i; stF.append((a, a + 2, a + 3, a + 1))
        L = lerp(C['lenB'], C['lenF'], fr ** C.get('pow', 1.3))
        for j in range(NQ + 1):
            q = j / NQ; out = lean + C.get('roll', 0.008) * smooth(0, 0.3, q) + C.get('flare', 0.012) * q
            px = x + ox * out + sx * C['spread'] * q * fr; py = y + hS + 0.003 * math.sin(math.pi * q) - L * q; pz = z + oz * out
            if z > 0:
                zb = zF(px, py) + 0.0035 + 0.005 * (1 - q); pz = max(lerp(pz, zb, smooth(0.2, 0.9, q)), zb)
            lfV.append((px, py, pz)); lfU.append((arc, -q * L))
            if i < NU and j < NQ: a = i * (NQ + 1) + j; lfF.append((a, a + 1, a + NQ + 2, a + NQ + 1))
            if (i == 0 or i == NU) and j == NQ - 1: tips.append((px - sx * 0.008, py + 0.004, pz))
    uvf = lambda U, Fc: [[U[k] for k in q] for q in Fc]
    return (stV, stF, uvf(stU, stF)), (lfV, lfF, uvf(lfU, lfF)), tips


def button_obj(name, centers, normals, r, mat, holes=True):
    bm = bmesh.new()
    for c, n in zip(centers, normals):
        res = bmesh.ops.create_cone(bm, cap_ends=True, segments=24, radius1=r, radius2=r * 0.92, depth=0.0022)
        vs = res['verts']; nb = Vector(B(n)).normalized(); rot = Vector((0, 0, 1)).rotation_difference(nb)
        for v in vs: v.co = rot @ v.co + Vector(B(c)) + nb * 0.0011
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = link(bpy.data.objects.new(name, me)); ob.data.materials.append(mat)
    bv = ob.modifiers.new('bv', 'BEVEL'); bv.width = 0.0005; bv.segments = 2
    return ob


def surface_bind(det, body):
    md = det.modifiers.new('sd', 'SURFACE_DEFORM'); md.target = body; md.falloff = 4
    bpy.context.view_layer.objects.active = det; det.select_set(True)
    with bpy.context.temp_override(object=det, active_object=det): bpy.ops.object.surfacedeform_bind(modifier='sd')
    det.select_set(False); return md


def build_shirt(cache, preset, ws_hook=True):
    D = pickle.load(open(cache, 'rb')); S = D['S']; F = body_fn(S); zF = make_zf(S, F)
    _, faces, info = gsim.build(S)
    fab = cloth_material('cloth-' + preset, PRESETS[preset])
    # 몸판: 제자리 모양 + 시뮬레이션 모양(셰이프 키)
    body = mesh_obj('body', D['pos'], faces, info['fuv'], fab)
    rest = D['rest']; g = info['grid']
    front_set = {g['F'][j][i] for j in range(S['NT'] + 1) for i in range(S['NS'] + 1)}
    go = follower(rest, D['pos'], faces, front_set)
    on_body = lambda V: [go(p) for p in V]
    # 바느질 선 음영 (꼭짓점 색): 어깨선, 소매 이음, 커프스 위, 밑단
    col = body.data.color_attributes['seam']
    shade = np.ones(len(rest))
    NT, NS, ja = S['NT'], S['NS'], S['ja']
    for side in 'FB':
        for j in range(NT + 1):
            for i in range(NS + 1):
                v = g[side][j][i]; k = 1.0
                if j <= 1 and abs(rest[v][0]) >= S['aN']: k = min(k, 0.88)                          # 어깨선
                if j >= NT - 1: k = min(k, 0.9)                                                      # 밑단 접힘
                shade[v] = min(shade[v], k)
    for sd in (-1, 1):
        rings = info['sleeves'][sd]; NR = len(rings) - 1; cr = S['cuff_rows']
        for r, ring in enumerate(rings):
            k = 0.86 if r in (0, 1) else 0.9 if r in (NR - cr, NR - cr + 1) else 0.93 if r == NR else 1.0
            for v in ring: shade[v] = min(shade[v], k)
    for i, k in enumerate(shade): col.data[i].color = (k, k, k, 1)
    sol = body.modifiers.new('sol', 'SOLIDIFY'); sol.thickness = 0.0011; sol.offset = -1; sol.use_rim = True
    ss = body.modifiers.new('ss', 'SUBSURF'); ss.levels = 1; ss.render_levels = 2
    parts = [body]
    # 여밈단
    pl = grid_patch(F, [[-0.0175, -S['nF'] + 0.002], [0.0175, -S['nF'] + 0.002], [0.0175, -S['L'] + 0.003], [-0.0175, -S['L'] + 0.003]], 6, 90, 0.0016, zf=zF)
    placket = mesh_obj('placket', on_body(pl[0]), pl[1], pl[2], mat=fab); parts.append(placket)
    # 가슴 주머니 (입는 사람의 왼쪽 가슴 = 보는 쪽에서 오른쪽)
    pk = grid_patch(F, [[0.058, -0.222], [0.162, -0.222], [0.162, -0.34], [0.058, -0.34]], 14, 16, lambda u, v: 0.0016 + 0.0015 * math.sin(math.pi * u) * math.sin(math.pi * v),
                    warp=lambda u, v: (0, -0.014 * v * (1 - abs(2 * u - 1))), zf=zF)
    pocket = mesh_obj('pocket', on_body(pk[0]), pk[1], pk[2], mat=fab); parts.append(pocket)
    # 단추 (여밈단 7개)
    ys = [-S['nF'] - 0.058 - i * 0.091 for i in range(7)]
    pearl = simple_mat('pearl', (0.86, 0.84, 0.8), 0.25, coat=0.6)
    bc = on_body([(0, y, zF(0, y) + 0.0018) for y in ys]); bn = on_body([(0, y, zF(0, y) + 0.0118) for y in ys])
    btn = button_obj('buttons', bc, [tuple(np.subtract(b2, a2)) for a2, b2 in zip(bc, bn)], 0.0056, pearl); parts.append(btn)
    for p in parts[1:]:
        for m in (('sol', 0.0009),):
            if p is not btn: s_ = p.modifiers.new('sol', 'SOLIDIFY'); s_.thickness = m[1]; s_.offset = -1
    for p in (placket, pocket):
        s2 = p.modifiers.new('ss', 'SUBSURF'); s2.levels = 1; s2.render_levels = 1
    # 깃 (목둘레는 고정이라 시뮬레이션과 상관없이 제자리 모양 그대로)
    st, lf, tips = collar_geo(S, F, zF, dict(**{'from': math.pi / 2 - 0.12, 'to': math.pi / 2 + 0.12 - TAU}, hS=0.032, hSf=0.026, lean=-0.004, lenB=0.044, lenF=0.086, spread=0.03, roll=0.006, flare=0.011, frA=0.12, frB=1.1, pow=2.4))
    stand = mesh_obj('stand', *st, mat=fab); leaf = mesh_obj('leaf', *lf, mat=fab)
    for p in (stand, leaf):
        s_ = p.modifiers.new('sol', 'SOLIDIFY'); s_.thickness = 0.0016; s_.offset = 0; s2 = p.modifiers.new('ss', 'SUBSURF'); s2.levels = 1; s2.render_levels = 2
    button_obj('collar-buttons', [(t[0], t[1], t[2] + 0.0012) for t in tips] + [(0, -S['nF'] + 0.014, S['bNf'] + 0.004)], [(0, 0.3, 1)] * 2 + [(0, 0, 1)], 0.0046, pearl)
    # 커프스: 시뮬레이션된 소매 끝 둘레를 조금 키워 띠를 두른다
    P = D['pos']; cr = S['cuff_rows']
    for sd in (-1, 1):
        rings = info['sleeves'][sd][-cr - 1:]; NK = len(rings[0]); V2, F2, U2 = [], [], []
        for r, ring in enumerate(rings):
            pts = np.array([P[v] for v in ring]); c = pts.mean(0)
            for k, p in enumerate(pts):
                dvec = p - c; dvec[1] *= 0.2; n = dvec / (np.linalg.norm(dvec) + 1e-9)
                V2.append(tuple(p + n * 0.0016)); U2.append((k / NK * 0.24, -r * 0.011))
        for r in range(len(rings) - 1):
            for k in range(NK):
                a, b2 = r * NK + k, r * NK + (k + 1) % NK; q = (a, b2, b2 + NK, a + NK); F2.append(q if sd > 0 else q[::-1])
        cuff = mesh_obj(f'cuff{sd}', V2, F2, [[U2[k] for k in q] for q in F2], fab)
        s_ = cuff.modifiers.new('sol', 'SOLIDIFY'); s_.thickness = 0.0012; s_.offset = 0; s2 = cuff.modifiers.new('ss', 'SUBSURF'); s2.levels = 1; s2.render_levels = 2
        cr_ring = np.array([P[v] for v in info['sleeves'][sd][-3]]); c = cr_ring.mean(0); outer = cr_ring[np.argmin(cr_ring[:, 2] * -1 + 0 * cr_ring[:, 0])]
        front = cr_ring[np.argmax(cr_ring[:, 2])]; nrm = front - c; nrm /= np.linalg.norm(nrm)
        button_obj(f'cuff-btn{sd}', [tuple(front + nrm * 0.0028 + np.array([sd * 0.012, 0, 0]))], [tuple(nrm)], 0.005, pearl)
    # 옷걸이 (나무) + 고리
    hg = gsim.hanger_obj(S, 'hanger-wood'); hg.data.materials.append(simple_mat('wood', (0.42, 0.25, 0.12), 0.38, coat=0.4))
    hook = bpy.data.curves.new('hook', 'CURVE'); hook.dimensions = '3D'; hook.bevel_depth = 0.0028; hook.bevel_resolution = 4
    sp = hook.splines.new('BEZIER'); pts = [(0, 0.004, 0), (0, 0.075, 0), (0.0, 0.104, 0.0), (0.022, 0.12, 0), (0.0, 0.142, 0), (-0.02, 0.124, 0)]
    sp.bezier_points.add(len(pts) - 1)
    for bp, p in zip(sp.bezier_points, pts): bp.co = B(p); bp.handle_left_type = bp.handle_right_type = 'AUTO'
    ho = link(bpy.data.objects.new('hook', hook)); ho.data.materials.append(simple_mat('steel', (0.75, 0.75, 0.76), 0.22, 1.0))
    root = bpy.data.objects.new('garment', None); link(root)
    for o in bpy.context.scene.objects:
        if o is not root and o.parent is None and o.type in ('MESH', 'CURVE'): o.parent = root
    return root, S


# ───────── 장면과 렌더 ─────────
def setup(w, h, samples):
    sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.samples = samples; sc.cycles.use_denoising = True
    sc.cycles.use_adaptive_sampling = True; sc.cycles.adaptive_threshold = 0.02
    sc.render.resolution_x, sc.render.resolution_y = w, h; sc.render.film_transparent = False
    try:
        sc.view_settings.view_transform = 'AgX'
        for look in ('AgX - Medium High Contrast', 'Medium High Contrast', 'AgX - Base Contrast'):
            try: sc.view_settings.look = look; break
            except Exception: pass
    except Exception: pass
    world = bpy.data.worlds.new('w'); sc.world = world; world.use_nodes = True
    bg = world.node_tree.nodes['Background']; bg.inputs[0].default_value = (0.92, 0.88, 0.82, 1); bg.inputs[1].default_value = 0.1
    return sc


def area(loc, size, energy, target, color=(1, 1, 1), shape='RECTANGLE', sx=None):
    L = bpy.data.lights.new('a', 'AREA'); L.shape = shape; L.size = size; L.energy = energy; L.color = color
    if sx: L.size_y = sx
    o = link(bpy.data.objects.new('a', L)); o.location = loc
    o.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler(); return o


def camera(loc, target, lens):
    c = bpy.data.cameras.new('c'); c.lens = lens; o = link(bpy.data.objects.new('c', c)); o.location = loc
    o.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler(); bpy.context.scene.camera = o; return o


def studio(top=1.75):
    wall = simple_mat('wall', (0.6, 0.55, 0.48), 0.92)
    bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 0.42, 1.4), rotation=(math.pi / 2, 0, 0)); w = bpy.context.object; w.scale = (6, 4, 1); w.data.materials.append(wall)
    area((-1.5, -2.0, 2.6), 1.2, 300, (0, 0, top - 0.35), (1.0, 0.96, 0.9))
    area((1.9, -1.6, 1.5), 2.4, 45, (0, 0, top - 0.4), (0.92, 0.95, 1.0))
    area((0.7, 0.3, 2.8), 0.7, 110, (0, 0, top - 0.1), (1.0, 0.95, 0.88))


if __name__ == '__main__':
    cache, preset, out = sys.argv[1], sys.argv[2], sys.argv[3]
    yaw = float(sys.argv[4]) if len(sys.argv) > 4 else 0.0
    w, h, smp = (int(sys.argv[5]) if len(sys.argv) > 5 else 800), (int(sys.argv[6]) if len(sys.argv) > 6 else 1000), (int(sys.argv[7]) if len(sys.argv) > 7 else 96)
    bpy.ops.wm.read_factory_settings(use_empty=True); sc = setup(w, h, smp)
    root, S = build_shirt(cache, preset); top = 1.75; root.location = (0, 0, top); root.rotation_euler = (0, 0, yaw)
    studio(top)
    camera((0, -2.45, top - 0.37), (0, 0, top - 0.39), 85)
    sc.render.filepath = out; t = time.time(); bpy.ops.render.render(write_still=True); print('render', round(time.time() - t, 1), 's')
