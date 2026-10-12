# 시뮬레이션한 옷에 디테일(깃, 여밈단, 단추, 주머니, 커프스)과 원단을 입히고 Cycles로 렌더한다.
# 사용: python gscene.py <cache.pkl> <preset> <out.png> [yaw] [w] [h] [samples]
import bpy, bmesh, math, pickle, sys, time, os
import numpy as np
from mathutils import Vector
from PIL import Image
import gsim
from gsim import body_fn, smooth, lerp, B

HERE = os.path.dirname(os.path.abspath(__file__))
clamp = lambda v, a, b: min(b, max(a, v))
TAU = 2 * math.pi

PRESETS = {
    'ocbd-white': dict(weave='oxford', c1='#f6f4ee', c2='#e6e3da'),
    'ocbd-blue': dict(weave='oxford', c1='#7fa3d6', c2='#d3e0f2'),
    'ocbd-navy': dict(weave='oxford', c1='#151f38', c2='#2a3858'),
    'stripe-blue': dict(weave='stripe', c1='#f6f4ee', c2='#e6e3da', s1='#4570b8', s2='#7d9fd8', pitch=0.0045),
    'blazer-navy': dict(weave='hopsack', c1='#18223c', c2='#27324e', rough=0.9, sheen=0.25, buttons='gold', lining=(0.22, 0.2, 0.28)),
    'field-olive': dict(weave='twill', c1='#5d6340', c2='#4f5536', rough=0.85, sheen=0.2, buttons='snap'),
    # 사용자 옷 (색은 사진 참고 근사치; 굽기에서는 빛만 쓰고 웹에서 gfabric 원단을 입힌다)
    'mine-stripe': dict(weave='stripe', c1='#f6f4ee', c2='#e6e3da', s1='#6c8dcf', s2='#9fb4e0', pitch=0.0045),
    'mine-tartan': dict(weave='oxford', c1='#365c4c', c2='#25324a'),
    'mine-field': dict(weave='twill', c1='#7c785e', c2='#6a6650', rough=0.85, sheen=0.2, buttons='snap'),
    'mine-cord': dict(weave='twill', c1='#3d2722', c2='#170e0c', rough=0.9, sheen=0.4, buttons='horn'),
    'cardigan-gray': dict(weave='hopsack', c1='#7d7f83', c2='#6a6c70', rough=0.95, sheen=0.4, buttons='horn'),     # 울 니트 카디건. 2026-10-12
    'sweat-gray': dict(weave='twill', c1='#8b8d90', c2='#74767a', rough=0.95, sheen=0.35),                   # 기모 스웻셔츠(헤더 그레이). 2026-10-12
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
    cs_ = 3 if P['weave'] == 'hopsack' else 2
    cell = ((xx // cs_) + (yy // cs_)) % 2                                                                    # 바스켓 조직: 칸이 번갈아
    if P['weave'] == 'twill': cell = (((xx + yy) // 2) % 3 == 0).astype(int)                                 # 능직: 사선
    c1, c2 = np.array(hexrgb(P['c1']), float), np.array(hexrgb(P['c2']), float)
    img = np.where(cell[..., None] == 1, c1, c2)
    if P['weave'] == 'stripe':
        band = (xx < W // 2)[..., None]; s1, s2 = np.array(hexrgb(P['s1']), float), np.array(hexrgb(P['s2']), float)
        img = np.where(band, np.where(cell[..., None] == 1, s1, s2), img)
    noise = rng.normal(0, 1, (H, 1)) * 0.008 + rng.normal(0, 1, (1, W)) * 0.006 + rng.normal(0, 1, (H, W)) * 0.018   # 실 굵기 차이
    img = img * (1 + noise[..., None])
    for _ in range(int(W * H / 900) if P['weave'] in ('oxford', 'stripe') else 0):                                                                          # 슬럽: 가로로 길게 밝거나 어두운 실
        y, x, L = rng.integers(0, H), rng.integers(0, W), rng.integers(8, 40); k = rng.choice([1.03, 0.975])
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
    bsdf.inputs['Roughness'].default_value = P.get('rough', 0.82)
    for k, v in (('Sheen Weight', P.get('sheen', 0.35)), ('Sheen Roughness', 0.45), ('Subsurface Weight', 0.0)):
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


def follower_idw(rest, pos, idx, k=10):
    """제자리 점을 가까운 몸판 꼭짓점들의 평균 이동만큼 옮긴다(회전 없음). 몸판 밖으로 튀어나온 조각(라펠 등)이 흔들리지 않는다."""
    from mathutils.kdtree import KDTree
    idx = list(idx); kd = KDTree(len(idx))
    for n, v in enumerate(idx): kd.insert(Vector(rest[v]), n)
    kd.balance(); disp = np.asarray(pos)[idx] - np.asarray(rest)[idx]
    def go(p):
        hits = kd.find_n(Vector(p), k); w = np.array([1 / (d * d + 1e-6) for _, _, d in hits]); w /= w.sum()
        return tuple(np.asarray(p) + (disp[[n for _, n, _ in hits]] * w[:, None]).sum(0))
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


def tag(ob, cloth=True):
    ob['cloth'] = cloth; return ob


def cloth_mods(ob, thick=0.0011, sub=2, offset=-1):
    s_ = ob.modifiers.new('sol', 'SOLIDIFY'); s_.thickness = thick; s_.offset = offset; s_.use_rim = True; s_.material_offset = 1
    s2 = ob.modifiers.new('ss', 'SUBSURF'); s2.levels = 1; s2.render_levels = sub
    return ob


def cuff_band(P, rings, sd, extra, mat, inner, name, h_extra=0.0):
    """소매 끝 둘레를 감싸는 반듯한 띠. 시뮬레이션된 끝 둘레들에 맞춘 타원 단면을 곧게 이어 붙인다."""
    pts = [np.array([P[v] for v in ring]) for ring in rings]
    c_top, c_bot = pts[0].mean(0), pts[-1].mean(0)
    allp = np.concatenate([p - p.mean(0) for p in pts])
    axis = c_bot - c_top; axis /= np.linalg.norm(axis)
    proj = allp - np.outer(allp @ axis, axis)
    U_, Sv, Vt = np.linalg.svd(proj, full_matrices=False)
    e1, e2 = Vt[0], Vt[1]; e2 = np.cross(axis, e1); e2 /= np.linalg.norm(e2)
    ra = np.abs(proj @ e1).max() + extra; rb = np.abs(proj @ e2).max() + extra
    NK, NR = 36, 6; V2, F2, U2 = [], [], []
    top = c_top - axis * h_extra
    for r in range(NR + 1):
        c = lerp(top, c_bot + axis * 0.002, r / NR)
        for k in range(NK + 1):
            th = TAU * k / NK
            V2.append(tuple(c + e1 * ra * math.cos(th) + e2 * rb * math.sin(th))); U2.append((k / NK * TAU * math.sqrt((ra * ra + rb * rb) / 2), -r / NR * np.linalg.norm(c_bot - top)))
    # 면 방향을 바깥으로 맞춘다 (굽기는 면이 향한 쪽의 빛을 담는다. 안쪽을 향하면 띠가 어둡게 구워진다)
    P0, P1, P3 = (np.array(V2[i]) for i in (0, 1, NK + 1))
    out_band = np.dot(np.cross(P3 - P0, P1 - P0), P0 - top) > 0
    for r in range(NR):
        for k in range(NK):
            a = r * (NK + 1) + k; q = (a, a + NK + 1, a + NK + 2, a + 1); F2.append(q if out_band else q[::-1])
    # 안쪽 막음: 띠 중간 높이에 원판을 둔다. 소매 안이 어둡게 보이고, 통 안쪽 면이 들여다보이지 않는다. 면은 소매 끝(열린 쪽)을 향한다
    cc = lerp(top, c_bot, 0.5); ci = len(V2); V2.append(tuple(cc)); U2.append((0.0, 0.0)); ring0 = len(V2)
    for k in range(NK):
        th = TAU * k / NK; V2.append(tuple(cc + e1 * ra * 0.97 * math.cos(th) + e2 * rb * 0.97 * math.sin(th))); U2.append((ra * math.cos(th), rb * math.sin(th)))
    Q1, Q2 = np.array(V2[ring0]), np.array(V2[ring0 + 1])
    out_cap = np.dot(np.cross(Q1 - cc, Q2 - cc), axis) > 0
    for k in range(NK):
        t3 = (ci, ring0 + k, ring0 + (k + 1) % NK); F2.append(t3 if out_cap else t3[::-1])
    ob = tag(mesh_obj(name, V2, F2, [[U2[k] for k in q] for q in F2], mat)); ob.data.materials.append(inner)
    cloth_mods(ob, 0.0014, 2, 0)
    # 단추 자리: 바깥쪽 아래
    side_dir = e1 if (e1[0] * sd) > 0 else -e1
    cpos = c_bot - axis * (np.linalg.norm(c_bot - top) * 0.45) + side_dir * (ra + 0.0012)
    return ob, cpos, side_dir


def seam_shading(body, S, info, rest, kind):
    col = body.data.color_attributes['seam']; shade = np.ones(len(rest)); g = info['grid']
    NT, NS, ja = S['NT'], S['NS'], S['ja']
    F = body_fn(S)
    for side in 'FB':
        for j in range(NT + 1):
            t = j / NT
            for i in range(NS + 1):
                v = g[side][j][i]; k = 1.0; x = rest[v][0]; y = rest[v][1]
                if j <= 1 and abs(x) >= S['aN']: k = min(k, 0.88)                                    # 어깨선
                if j >= NT - 1: k = min(k, 0.9)                                                      # 밑단 접힘
                if kind == 'field' and abs(y + 0.44) < 0.006: k = min(k, 0.86)                        # 허리 조임끈 줄
                if kind == 'shirt' and side == 'B' and abs(y + 0.13) < 0.005: k = min(k, 0.9)         # 등 요크 선
                shade[v] = min(shade[v], k)
    for sd in (-1, 1):
        rings = info['sleeves'][sd]; NR = len(rings) - 1; cr = S['cuff_rows']
        for r, ring in enumerate(rings):
            k = 0.86 if r in (0, 1) else 0.93 if r == NR else 1.0
            for v in ring: shade[v] = min(shade[v], k)
    for i, k in enumerate(shade): col.data[i].color = (k, k, k, 1)


def hardware(kind):
    if kind == 'gold': return simple_mat('gold', (0.86, 0.66, 0.3), 0.3, 1.0)
    if kind == 'snap': return simple_mat('snap', (0.28, 0.26, 0.21), 0.42, 0.85)
    if kind == 'horn': return simple_mat('horn', (0.06, 0.05, 0.05), 0.35, coat=0.5)
    return simple_mat('pearl', (0.86, 0.84, 0.8), 0.25, coat=0.6)


def build_garment(cache, preset):
    D = pickle.load(open(cache, 'rb')); S = D['S']; kind = D['kind']; F = body_fn(S); zF = make_zf(S, F)
    _, faces, info = gsim.build(S)
    P_ = PRESETS[preset]; fab = cloth_material('cloth-' + preset, P_)
    inner = simple_mat('lining', P_.get('lining', (0.5, 0.5, 0.5)), 0.6) if kind == 'blazer' else fab
    body = tag(mesh_obj('body', D['pos'], faces, info['fuv'], fab)); body.data.materials.append(inner)
    rest = D['rest']; g = info['grid']; P = D['pos']
    front_set = {g['F'][j][i] for j in range(S['NT'] + 1) for i in range(S['NS'] + 1)}
    go = follower_idw(rest, P, front_set) if kind == 'blazer' else follower(rest, P, faces, front_set)
    on_body = lambda V: [go(p) for p in V]
    def normals_at(pts, off=0.01):
        a = on_body([(x, y, zF(x, y) + 0.002) for x, y in pts]); b = on_body([(x, y, zF(x, y) + 0.002 + off) for x, y in pts])
        return a, [tuple(np.subtract(q, p)) for p, q in zip(a, b)]
    def patch(name, corners, nu, nv, off, warp=None, flip=False, thick=0.0009, sub=1):
        V, Fc, U = grid_patch(F, corners, nu, nv, off, warp=warp, flip=flip, zf=zF)
        ob = tag(mesh_obj(name, on_body(V), Fc, U, fab)); ob.data.materials.append(inner); cloth_mods(ob, thick, sub, -1); return ob
    seam_shading(body, S, info, rest, kind)
    cloth_mods(body, 0.0011 if kind == 'shirt' else 0.0018, 2, -1)
    hw = hardware(P_.get('buttons', 'pearl'))

    if kind == 'shirt':
        patch('placket', [[-0.0175, -S['nF'] + 0.002], [0.0175, -S['nF'] + 0.002], [0.0175, -S['L'] + 0.003], [-0.0175, -S['L'] + 0.003]], 6, 90, 0.0016)
        patch('pocket', [[0.058, -0.222], [0.162, -0.222], [0.162, -0.34], [0.058, -0.34]], 14, 16, lambda u, v: 0.0016 + 0.0015 * math.sin(math.pi * u) * math.sin(math.pi * v),
              warp=lambda u, v: (0, -0.014 * v * (1 - abs(2 * u - 1))))
        ys = [-S['nF'] - 0.058 - i * 0.091 for i in range(7)]
        c, n = normals_at([(0, y) for y in ys]); button_obj('buttons', c, n, 0.0056, hw)
        st, lf, tips = collar_geo(S, F, zF, dict(**{'from': math.pi / 2 - 0.12, 'to': math.pi / 2 + 0.12 - TAU}, hS=0.032, hSf=0.026, lean=-0.004, lenB=0.044, lenF=0.086, spread=0.03, roll=0.006, flare=0.011, frA=0.12, frB=1.1, pow=2.4))
        for nm, geo, th in (('stand', st, 0.0016), ('leaf', lf, 0.0016)):
            ob = tag(mesh_obj(nm, *geo, mat=fab)); ob.data.materials.append(inner); cloth_mods(ob, th, 2, 0)
        button_obj('collar-buttons', [(t[0], t[1], t[2] + 0.0012) for t in tips] + [(0, -S['nF'] + 0.014, S['bNf'] + 0.004)], [(0, 0.3, 1)] * 2 + [(0, 0, 1)], 0.0046, hw)
        for sd in (-1, 1):
            rings = info['sleeves'][sd][-S['cuff_rows'] - 1:]
            ob, cpos, sdir = cuff_band(P, rings, sd, 0.0035, fab, inner, f'cuff{sd}', 0.004)
            button_obj(f'cuff-btn{sd}', [tuple(cpos + sdir * 0.0008)], [tuple(sdir)], 0.005, hw)

    elif kind == 'blazer':
        vD, aN = S['vneck'], S['aN']
        xV = lambda y: aN * (1 - clamp(-y / vD, 0, 1) ** (1 / 0.88))
        st, lf, _ = collar_geo(S, F, zF, dict(**{'from': 0.42, 'to': -math.pi - 0.42}, hS=0.034, hSf=0.008, lean=-0.003, lenB=0.048, lenF=0.03, spread=0.012, roll=0.008, flare=0.012, frA=1.0, frB=2.4, pow=1))
        for nm, geo in (('stand', st), ('leaf', lf)):
            ob = tag(mesh_obj(nm, *geo, mat=fab)); ob.data.materials.append(inner); cloth_mods(ob, 0.002, 2, 0)
        yG, lw = -0.08, 0.082
        for sd in (-1, 1):
            gIn = [sd * (xV(yG) - 0.004), yG]; npnt = [gIn[0] + sd * lw, yG - lw * 0.6]; ct = [gIn[0] + sd * lw * 0.86, yG - lw * 0.17]
            K = ((npnt[1] - gIn[1]) * (ct[0] - gIn[0])) / (npnt[0] - gIn[0]) - (ct[1] - gIn[1]); u0 = 0.58
            # 라펠: 고지선에서 첫 단추(V 바닥)까지 접혀 가슴에 얹힌다
            lc = [gIn, npnt, [sd * 0.014, -vD - 0.008], [sd * 0.004, -vD + 0.004]]
            warpL = lambda u, v, sd=sd: (sd * 0.016 * u * math.sin(math.pi * clamp(v, 0, 1) ** 0.8), 0)
            offL = lambda u, v: 0.004 + 0.013 * (1 - u) ** 1.4 * math.sin(math.pi * clamp(0.15 + v * 0.95, 0, 1))
            patch(f'lapel{sd}', lc, 16, 30, offL, warp=warpL, flip=sd < 0, thick=0.002, sub=2)
            # 윗깃 앞부분: 어깨 쪽에서 고지선까지. 끝에 노치(V자 틈)가 생긴다
            cc = [[sd * (aN - 0.008), 0.012], [sd * (aN + 0.05), -0.006], ct, gIn]
            warpC = lambda u, v, K=K: (0, (K * u if u <= u0 else K * u0 * (1 - u) / (1 - u0)) * v * v)
            offC = lambda u, v: 0.008 + 0.006 * (1 - u)
            patch(f'collarF{sd}', cc, 14, 14, offC, warp=warpC, flip=sd < 0, thick=0.002, sub=2)
            # 뚜껑 주머니
            x0, x1 = sd * 0.074, sd * 0.222
            fc = [[x0, -0.468], [x1, -0.472], [x1, -0.528], [x0, -0.524]] if sd > 0 else [[x1, -0.472], [x0, -0.468], [x0, -0.524], [x1, -0.528]]
            patch(f'flap{sd}', fc, 14, 6, lambda u, v: 0.003 + 0.004 * v, thick=0.0018)
        patch('welt', [[0.104, -0.205], [0.188, -0.196], [0.188, -0.217], [0.104, -0.226]], 10, 3, 0.0022, thick=0.0018)
        # 앞 여밈선(단추 아래로 벌어지는 앞단)과 단추 2개
        ob = patch('frontedge', [[0.0, -vD - 0.004], [0.006, -vD - 0.004], [0.022, -S['L'] + S['cut'] - 0.004], [0.012, -S['L'] + S['cut'] - 0.002]], 2, 40, 0.0012, thick=0.0008, sub=1)
        for d in ob.data.color_attributes['seam'].data: d.color = (0.45, 0.45, 0.45, 1)
        c, n = normals_at([(0.016, -vD - 0.018), (0.018, -vD - 0.124)]); button_obj('buttons', c, n, 0.0105, hw)
        # 소매 단추 3개: 소매 끝 바깥 뒤쪽
        cs_, ns_ = [], []
        for sd in (-1, 1):
            rings = info['sleeves'][sd]
            for r in (-3, -5, -7):
                pts = np.array([P[v] for v in rings[r]]); c0 = pts.mean(0)
                k = np.argmax(sd * (pts[:, 0] - c0[0]) * 0.8 - (pts[:, 2] - c0[2]) * 0.6); nrm = pts[k] - c0; nrm /= np.linalg.norm(nrm)
                cs_.append(tuple(pts[k] + nrm * 0.002)); ns_.append(tuple(nrm))
        button_obj('sleeve-buttons', cs_, ns_, 0.0075, hw)

    elif kind == 'field':
        st, lf, _ = collar_geo(S, F, zF, dict(**{'from': math.pi / 2 - 0.16, 'to': math.pi / 2 + 0.16 - TAU}, hS=0.056, hSf=0.05, lean=0.007, lenB=0.012, lenF=0.012, spread=0, roll=0.004, flare=0.002))
        for nm, geo in (('stand', st), ('leaf', lf)):
            ob = tag(mesh_obj(nm, *geo, mat=fab)); ob.data.materials.append(inner); cloth_mods(ob, 0.0024, 2, 0)
        patch('placket', [[-0.036, -S['nF'] + 0.012], [0.036, -S['nF'] + 0.012], [0.036, -S['L'] + 0.004], [-0.036, -S['L'] + 0.004]], 6, 80, 0.0035, thick=0.0018)
        snaps = [(0, -0.105 - i * 0.151) for i in range(5)]
        for sd in (-1, 1):
            ec = [[0.106, -0.02], [0.232, -0.062], [0.228, -0.102], [0.102, -0.06]] if sd > 0 else [[-0.232, -0.062], [-0.106, -0.02], [-0.102, -0.06], [-0.228, -0.102]]
            patch(f'epaulet{sd}', ec, 10, 4, 0.0035, thick=0.0018); snaps.append((sd * 0.12, -0.044))
            for xa, xb, y0, y1, fh, bulge in ((0.064, 0.2, -0.2, -0.36, 0.062, 0.004), (0.058, 0.226, -0.505, -0.705, 0.07, 0.007)):
                x0, x1 = sd * xa, sd * xb
                pc = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] if sd > 0 else [[x1, y0], [x0, y0], [x0, y1], [x1, y1]]
                patch(f'pocket{sd}{y0}', pc, 14, 14, lambda u, v, b=bulge: 0.0035 + b * math.sin(math.pi * u) * math.sin(math.pi * v), thick=0.0018)
                fl = [[x + (0.004 if (x - (x0 + x1) / 2) * 1 > 0 else -0.004), (y0 + 0.014 if i < 2 else y0 - fh)] for i, (x, y) in enumerate(pc)]
                patch(f'flap{sd}{y0}', fl, 14, 6, lambda u, v: 0.0075 + 0.003 * v, warp=lambda u, v: (0, -0.012 * v * (1 - abs(2 * u - 1))), thick=0.0018)
                snaps.append(((x0 + x1) / 2, y0 - fh + 0.012))
        sz = []
        for x, y in snaps:
            base = 0.0055 if abs(x) < 0.05 else 0.012 if y < -0.15 else 0.0055
            sz.append((x, y, base))
        a = on_body([(x, y, zF(x, y) + o) for x, y, o in sz]); b = on_body([(x, y, zF(x, y) + o + 0.01) for x, y, o in sz])
        button_obj('snaps', a, [tuple(np.subtract(q, p)) for p, q in zip(a, b)], 0.0068, hw)
        for sd in (-1, 1):
            rings = info['sleeves'][sd][-S['cuff_rows'] - 1:]
            ob, cpos, sdir = cuff_band(P, rings, sd, 0.004, fab, inner, f'cuff{sd}', 0.004)
            button_obj(f'cuff-btn{sd}', [tuple(cpos + sdir * 0.001)], [tuple(sdir)], 0.006, hw)

    # 옷걸이 (나무) + 고리
    SH = dict(S); SH['hanger'] = dict(S['hanger'], half=S['hanger']['half'] * 0.9)                         # 보이는 옷걸이는 조금 짧게 (어깨 끝으로 삐져나오지 않게)
    hg = gsim.hanger_obj(SH, 'hanger-wood'); hg.data.materials.append(simple_mat('wood', (0.42, 0.25, 0.12), 0.38, coat=0.4))
    hook = bpy.data.curves.new('hook', 'CURVE'); hook.dimensions = '3D'; hook.bevel_depth = 0.0028; hook.bevel_resolution = 4
    sp = hook.splines.new('BEZIER'); pts = [(0, 0.004, 0), (0, 0.075, 0), (0.0, 0.104, 0.0), (0.022, 0.12, 0), (0.0, 0.142, 0), (-0.02, 0.124, 0)]
    sp.bezier_points.add(len(pts) - 1)
    for bp, p in zip(sp.bezier_points, pts): bp.co = B(p); bp.handle_left_type = bp.handle_right_type = 'AUTO'
    ho = link(bpy.data.objects.new('hook', hook)); ho.data.materials.append(simple_mat('steel', (0.75, 0.75, 0.76), 0.22, 1.0))
    root = bpy.data.objects.new('garment', None); link(root)
    for o in bpy.context.scene.objects:
        if o is not root and o.parent is None and o.type in ('MESH', 'CURVE'): o.parent = root
    return root, S, kind


build_shirt = lambda cache, preset: build_garment(cache, preset)[:2]


# ───────── 장면과 렌더 ─────────
LIGHT = 1 / 3.5                                                                                            # 2026-10-11: 이전 조명이 약 3.5배 밝았다


def setup(w, h, samples):
    sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.samples = samples; sc.cycles.use_denoising = True
    sc.cycles.use_adaptive_sampling = True; sc.cycles.adaptive_threshold = 0.02
    sc.render.resolution_x, sc.render.resolution_y = w, h; sc.render.film_transparent = False
    try: sc.view_settings.view_transform = 'Standard'; sc.view_settings.look = 'None'                    # 웹과 같은 색 (톤매핑 없음)
    except Exception: pass
    world = bpy.data.worlds.new('w'); sc.world = world; world.use_nodes = True
    bg = world.node_tree.nodes['Background']; bg.inputs[0].default_value = (0.92, 0.88, 0.82, 1); bg.inputs[1].default_value = 0.1 * LIGHT
    return sc


def area(loc, size, energy, target, color=(1, 1, 1), shape='RECTANGLE', sx=None):
    L = bpy.data.lights.new('a', 'AREA'); L.shape = shape; L.size = size; L.energy = energy; L.color = color
    if sx: L.size_y = sx
    o = link(bpy.data.objects.new('a', L)); o.location = loc
    o.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler(); return o


def camera(loc, target, lens):
    c = bpy.data.cameras.new('c'); c.lens = lens; o = link(bpy.data.objects.new('c', c)); o.location = loc
    o.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler(); bpy.context.scene.camera = o; return o


WALL = dict(w=3.0, h=2.4, y=0.42, color=(0.6, 0.55, 0.48))


def studio(top=1.75):
    wall = simple_mat('wall', WALL['color'], 0.92)
    bpy.ops.mesh.primitive_plane_add(size=1, location=(0, WALL['y'], top - 0.5), rotation=(math.pi / 2, 0, 0)); w = bpy.context.object; w.name = 'wall'
    w.scale = (WALL['w'], WALL['h'], 1); w.data.materials.append(wall)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    area((-1.5, -2.0, 2.6), 1.2, 300 * LIGHT, (0, 0, top - 0.35), (1.0, 0.96, 0.9))
    area((1.9, -1.6, 1.5), 2.4, 45 * LIGHT, (0, 0, top - 0.4), (0.92, 0.95, 1.0))
    area((0.7, 0.3, 2.8), 0.7, 110 * LIGHT, (0, 0, top - 0.1), (1.0, 0.95, 0.88))
    return w


if __name__ == '__main__':
    cache, preset, out = sys.argv[1], sys.argv[2], os.path.abspath(sys.argv[3])
    yaw = float(sys.argv[4]) if len(sys.argv) > 4 else 0.0
    w, h, smp = (int(sys.argv[5]) if len(sys.argv) > 5 else 800), (int(sys.argv[6]) if len(sys.argv) > 6 else 1000), (int(sys.argv[7]) if len(sys.argv) > 7 else 96)
    bpy.ops.wm.read_factory_settings(use_empty=True); sc = setup(w, h, smp)
    root, S, kind = build_garment(cache, preset); top = 1.75; root.location = (0, 0, top); root.rotation_euler = (0, 0, yaw)
    studio(top)
    camera((0, -2.45, top - 0.37), (0, 0, top - 0.39), 85)
    sc.render.filepath = out; t = time.time(); bpy.ops.render.render(write_still=True); print('render', round(time.time() - t, 1), 's')
