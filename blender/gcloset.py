# 옷장 장면 (Blender): 참나무 옷장(위 긴 봉 / 아래 왼쪽 셔츠 봉 / 아래 오른쪽 서랍) + 벽·바닥 + 조명.
# 좌표는 웹과 같다 (x 오른쪽, y 위, z 앞). Blender로 넣을 때 B(p) = (x, -z, y).
# 사용(미리보기): python gcloset.py <out.png> <w> <h> <samples> [kind:cache:preset:slot ...]
import bpy, bmesh, math, os, sys, time
import numpy as np
from mathutils import Vector
import gscene, woods
from gsim import B

HERE = os.path.dirname(os.path.abspath(__file__)); TEX = f'{HERE}/closet/tex'
W, H, D, T = 2.0, 2.24, 0.58, 0.022
yB, SHELF, DIV = 0.1, 1.1, 0.21
RAIL_Z = -0.27; RAIL_HI = 2.07; RAIL_LO = SHELF - T - 0.035
IN = W / 2 - T; WALL_Z = -D - 0.012
LO_X0, LO_X1 = -IN, DIV - T / 2; LO_C = (LO_X0 + LO_X1) / 2
DR_X0, DR_X1 = DIV + T / 2, IN; DR_C = (DR_X0 + DR_X1) / 2
HOOK = 0.127                                                                                  # 봉 중심 ~ 옷 원점(어깨선) 높이 차
HANG = 0.6                                                                                    # 옷이 봉에 비스듬히 걸린 각도 (앞면이 보이게)
SLOTS = [dict(x=-0.69, rail='hi'), dict(x=-0.23, rail='hi'), dict(x=0.23, rail='hi'), dict(x=0.69, rail='hi'),
         dict(x=LO_C - 0.23, rail='lo'), dict(x=LO_C + 0.23, rail='lo')]
REF = {'hi': 0.23, 'lo': LO_C}                                                                # 조명을 구울 때 옷을 두는 기준 자리
RAIL_Y = {'hi': RAIL_HI, 'lo': RAIL_LO}
LIGHT = gscene.LIGHT


def slot_pose(x, rail, yaw=HANG):
    """옷 원점 위치(웹 좌표)와 회전."""
    return (x, RAIL_Y[rail] - HOOK, RAIL_Z), yaw


# ───────── 재질 ─────────
def tex_mat(name, path, Lu, Lv, rough=0.6, coat=0.0, spec=0.5):
    m = bpy.data.materials.new(name); m.use_nodes = True; N = m.node_tree.nodes; b = N['Principled BSDF']
    uv = N.new('ShaderNodeUVMap'); uv.uv_map = 'UVMap'; mp = N.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (1 / Lu, 1 / Lv, 1)
    tx = N.new('ShaderNodeTexImage'); tx.image = bpy.data.images.load(path)
    m.node_tree.links.new(uv.outputs['UV'], mp.inputs['Vector']); m.node_tree.links.new(mp.outputs['Vector'], tx.inputs['Vector'])
    m.node_tree.links.new(tx.outputs['Color'], b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = rough
    if coat and 'Coat Weight' in b.inputs: b.inputs['Coat Weight'].default_value = coat
    return m


def materials():
    os.makedirs(TEX, exist_ok=True)
    Lo = woods.oak(f'{TEX}/oak.png'); Lf = woods.planks(f'{TEX}/floor.png'); Lw = woods.plaster(f'{TEX}/wall.png')
    M = dict(oak=tex_mat('oak', f'{TEX}/oak.png', *Lo, rough=0.55, coat=0.15), floor=tex_mat('floor', f'{TEX}/floor.png', *Lf, rough=0.4, coat=0.3),
             wall=tex_mat('wall', f'{TEX}/wall.png', *Lw, rough=0.92), skirt=gscene.simple_mat('skirt', (0.82, 0.8, 0.76), 0.45),
             steel=gscene.simple_mat('steel', (0.78, 0.78, 0.79), 0.22, 1.0), handle=gscene.simple_mat('handle', (0.08, 0.07, 0.06), 0.35, 0.8))
    led = bpy.data.materials.new('led'); led.use_nodes = True; N = led.node_tree.nodes; N.remove(N['Principled BSDF'])
    e = N.new('ShaderNodeEmission'); e.inputs['Color'].default_value = (1.0, 0.82, 0.62, 1); e.inputs['Strength'].default_value = 6.0
    led.node_tree.links.new(e.outputs['Emission'], N['Material Output'].inputs['Surface']); M['led'] = led
    return M, dict(oak=Lo, floor=Lf, wall=Lw)


# ───────── 형태 ─────────
class Builder:
    """여러 상자를 한 메시로 모은다. 면마다 미터 단위 UV(나뭇결 방향 지정)."""
    def __init__(self, name, mats):
        self.name, self.mats, self.bm = name, mats, bmesh.new(); self.uv = self.bm.loops.layers.uv.new('UVMap'); self.slot = {}
        self.rng = np.random.default_rng(len(name)); self.islands = []; self.group = None                     # 조명 UV용 조각: [(면, [미터 UV...]), ...]

    def mi(self, m):
        if m not in self.slot: self.slot[m] = len(self.slot)
        return self.slot[m]

    def quad(self, pts, mat, axes, off=(0, 0)):
        vs = [self.bm.verts.new(B(p)) for p in pts]; f = self.bm.faces.new(vs); f.material_index = self.mi(mat); f.smooth = False
        for l, p in zip(f.loops, pts): l[self.uv].uv = (p[axes[0]] + off[0], p[axes[1]] + off[1])
        isl = [(f, [(p[axes[0]], p[axes[1]]) for p in pts])]
        if self.group is not None: self.group.extend(isl)
        else: self.islands.append(isl)
        return f

    def box(self, x0, x1, y0, y1, z0, z1, mat='oak', grain='y'):
        X, Y, Z = (x0, x1), (y0, y1), (z0, z1); off = tuple(self.rng.uniform(0, 3, 2))
        dims = {0: x1 - x0, 1: y1 - y0, 2: z1 - z0}; g = 'xyz'.index(grain)
        for ax in range(3):
            o = [a for a in range(3) if a != ax]
            # 결 방향: 면 안에 grain 축이 있으면 그것을, 없으면 긴 쪽을 가로(u)로
            u = g if g in o else max(o, key=lambda a: dims[a]); v = [a for a in o if a != u][0]
            for s in (0, 1):
                c = []
                for a, b in ((0, 0), (1, 0), (1, 1), (0, 1)):
                    p = [0, 0, 0]; p[ax] = (X, Y, Z)[ax][s]; p[o[0]] = (X, Y, Z)[o[0]][a]; p[o[1]] = (X, Y, Z)[o[1]][b]; c.append(tuple(p))
                n = [0, 0, 0]; n[ax] = 1 if s else -1
                e1 = np.subtract(c[1], c[0]); e2 = np.subtract(c[2], c[0])
                if np.dot(np.cross(e1, e2), n) < 0: c = c[::-1]
                self.quad(c, mat, (u, v), off)

    def cyl(self, p0, p1, r, mat='steel', seg=24):
        p0, p1 = np.array(p0, float), np.array(p1, float); d = p1 - p0; L = np.linalg.norm(d); d /= L
        a = np.cross(d, [0, 1, 0] if abs(d[1]) < 0.9 else [1, 0, 0]); a /= np.linalg.norm(a); b = np.cross(d, a)
        ring = lambda c: [c + r * (math.cos(2 * math.pi * k / seg) * a + math.sin(2 * math.pi * k / seg) * b) for k in range(seg)]
        r0, r1 = ring(p0), ring(p1); self.group = []
        for k in range(seg):
            k2 = (k + 1) % seg; q = [r0[k], r0[k2], r1[k2], r1[k]]
            f = self.quad([tuple(x) for x in q], mat, (0, 1)); f.smooth = True
            q2 = ((k / seg, 0), ((k + 1) / seg, 0), ((k + 1) / seg, L), (k / seg, L))
            for l, (uu, vv) in zip(f.loops, q2): l[self.uv].uv = (uu * 2 * math.pi * r, vv)
            self.group[-1] = (f, [(uu * 2 * math.pi * r, vv) for uu, vv in q2])
        self.islands.append(self.group); self.group = None
        for rr, rev in ((r0, True), (r1, False)):
            pts = [tuple(x) for x in (rr[::-1] if rev else rr)]
            vs = [self.bm.verts.new(B(p)) for p in pts]; f = self.bm.faces.new(vs); f.material_index = self.mi(mat)
            loc = [(float(np.dot(np.subtract(p, pts[0]), a)), float(np.dot(np.subtract(p, pts[0]), b))) for p in pts]
            for l, p in zip(f.loops, loc): l[self.uv].uv = p
            self.islands.append([(f, loc)])

    def pack(self, margin=0.012):
        """조명 UV: 조각(면)을 펼친 크기 그대로 겹치지 않게 선반식으로 배치. 긴 조각은 눕힌다."""
        bl = self.bm.loops.layers.uv.new('bake'); items = []
        for isl in self.islands:
            us = [u for _, uv in isl for u, _ in uv]; vs = [v for _, uv in isl for _, v in uv]
            w, h = max(us) - min(us), max(vs) - min(vs); rot = h > w
            items.append((isl, min(us), min(vs), (h, w) if rot else (w, h), rot))
        area = sum((w + margin) * (h + margin) for *_, (w, h), _ in items)
        Wl = max(max(w for *_, (w, h), _ in items) + margin, math.sqrt(area * 1.12))
        items.sort(key=lambda it: -it[3][1]); x = y = rowh = 0.0; place = []
        for it in items:
            w, h = it[3]
            if x + w > Wl and x > 0: x = 0; y += rowh + margin; rowh = 0
            place.append((it, x, y)); x += w + margin; rowh = max(rowh, h)
        SC = 1 / max(Wl, y + rowh)
        for (isl, u0, v0, _, rot), X, Y in place:
            for f, uv in isl:
                for l, (u, v) in zip(f.loops, uv):
                    du, dv = u - u0, v - v0
                    l[bl].uv = (((dv if rot else du) + X) * SC, ((du if rot else dv) + Y) * SC)
        self.texel = 1 / SC                                                                                # 아틀라스 한 변의 실제 길이(m)

    def finish(self, pack=True):
        if pack and self.islands: self.pack()
        me = bpy.data.meshes.new(self.name); self.bm.normal_update(); self.bm.to_mesh(me); self.bm.free()
        ob = bpy.data.objects.new(self.name, me); bpy.context.scene.collection.objects.link(ob)
        for m, i in sorted(self.slot.items(), key=lambda kv: kv[1]): me.materials.append(self.mats[m])
        return ob


def build_closet(M):
    c = Builder('closet', M); bx = c.box
    bx(-W / 2, -W / 2 + T, 0, H, -D, 0, 'oak', 'y'); bx(W / 2 - T, W / 2, 0, H, -D, 0, 'oak', 'y')                   # 옆판
    bx(-IN, IN, H - T, H, -D, 0, 'oak', 'x')                                                                          # 천판
    bx(-IN, IN, yB - T, yB, -D, 0, 'oak', 'x')                                                                        # 바닥판
    bx(-IN, IN, 0, yB - T, -0.058, -0.04, 'oak', 'x')                                                                 # 걸레받이(들어감)
    bx(-IN, IN, SHELF - T, SHELF, -D + 0.009, 0, 'oak', 'x')                                                          # 선반
    bx(DIV - T / 2, DIV + T / 2, yB, SHELF - T, -D + 0.009, 0, 'oak', 'y')                                            # 칸막이
    bx(-IN, IN, yB, H - T, -D, -D + 0.009, 'oak', 'y')                                                                # 뒤판
    n, gap = 4, 0.004; hh = (SHELF - T - yB - gap * (n + 1)) / n                                                      # 서랍 4단
    for i in range(n):
        y0 = yB + gap + i * (hh + gap)
        bx(DR_X0 + 0.003, DR_X1 - 0.003, y0, y0 + hh, -0.02, 0, 'oak', 'x')
        bx(DR_C - 0.08, DR_C + 0.08, y0 + hh - 0.046, y0 + hh - 0.034, 0, 0.012, 'handle', 'x')
    bx(DR_X0, DR_X1, yB, SHELF - T, -D + 0.009, -0.02, 'oak', 'y')                                                    # 서랍 몸통 (뒤가 비어 보이지 않게)
    for y, x0, x1 in ((RAIL_HI, -IN, IN), (RAIL_LO, LO_X0, LO_X1)):                                                   # 옷봉 + 양끝 받침
        c.cyl((x0, y, RAIL_Z), (x1, y, RAIL_Z), 0.0125)
        for x in (x0, x1): c.cyl((x, y, RAIL_Z), (x + (0.008 if x == x0 else -0.008), y, RAIL_Z), 0.024)
    c.cyl((0, RAIL_HI, RAIL_Z), (0, H - T, RAIL_Z), 0.006)                                                            # 긴 봉 가운데 받침
    led = Builder('led', M)
    led.box(-IN + 0.04, IN - 0.04, H - T - 0.006, H - T, -0.062, -0.046, 'led', 'x')
    led.box(LO_X0 + 0.04, LO_X1 - 0.04, SHELF - T - 0.006, SHELF - T, -0.062, -0.046, 'led', 'x')
    return c.finish(), led.finish()


def build_room(M):
    X, Z, Y = 3.8, 4.6, 3.8                                                                       # 세로 화면에서도 방 끝이 보이지 않게 넉넉히
    f = Builder('floor', M); f.quad([(-X, 0, WALL_Z), (-X, 0, Z), (X, 0, Z), (X, 0, WALL_Z)], 'floor', (0, 2))
    w = Builder('wall', M); w.quad([(-X, 0, WALL_Z), (X, 0, WALL_Z), (X, Y, WALL_Z), (-X, Y, WALL_Z)], 'wall', (0, 1))
    w.box(-X, -W / 2 - 0.001, 0, 0.08, WALL_Z, WALL_Z + 0.012, 'skirt', 'x'); w.box(W / 2 + 0.001, X, 0, 0.08, WALL_Z, WALL_Z + 0.012, 'skirt', 'x')
    return f.finish(), w.finish()


def lights():
    g = gscene.area
    win = g(B((-2.8, 1.8, 2.4)), 1.8, 360 * LIGHT, B((0.0, 1.15, -0.3)), (1.0, 0.97, 0.92), sx=2.2)                 # 왼쪽 창
    ceil = g(B((0.6, 2.9, 1.7)), 2.2, 200 * LIGHT, B((0.0, 0.9, -0.2)), (1.0, 0.93, 0.84))                            # 천장
    up = g(B((0, H - T - 0.009, -0.054)), 1.8, 17 * LIGHT, B((0, H - 1.0, -0.12)), (1.0, 0.8, 0.6), sx=0.014)          # 옷장 안 위 조명 (줄)
    lo = g(B((LO_C, SHELF - T - 0.009, -0.054)), 1.1, 12 * LIGHT, B((LO_C, SHELF - 1.0, -0.12)), (1.0, 0.8, 0.6), sx=0.014)
    for o in (up, lo): o.data.shape = 'RECTANGLE'
    return [win, ceil, up, lo]


def scene(w=960, h=600, samples=64):
    bpy.ops.wm.read_factory_settings(use_empty=True); sc = gscene.setup(w, h, samples)
    sc.world.node_tree.nodes['Background'].inputs[0].default_value = (0.9, 0.86, 0.8, 1); sc.world.node_tree.nodes['Background'].inputs[1].default_value = 0.15 * LIGHT
    M, L = materials(); closet, led = build_closet(M); floor, wall = build_room(M)
    led.visible_diffuse = False; led.visible_glossy = False                                                           # 줄 조명은 보이기만 (빛은 면광원이 낸다)
    lights()
    st = bpy.data.objects.new('static', None); sc.collection.objects.link(st)                                        # 옷을 만들 때 옷장이 옷에 딸려 가지 않게 묶어 둔다
    for o in (closet, led, floor, wall): o.parent = st
    return sc, dict(closet=closet, led=led, floor=floor, wall=wall), L


def add_garment(cache, preset, x, rail, yaw=HANG):
    root, S, kind = gscene.build_garment(cache, preset)
    (px, py, pz), yaw = slot_pose(x, rail, yaw)
    root.location = B((px, py, pz)); root.rotation_euler = (0, 0, yaw)
    return root, S, kind


def camera_web(loc, target, fov_deg, aspect):
    """웹 카메라(세로 시야각)와 같은 Blender 카메라."""
    c = gscene.camera(B(loc), B(target), 50); cam = c.data; cam.sensor_fit = 'VERTICAL'; cam.angle_y = math.radians(fov_deg)
    return c


if __name__ == '__main__':
    out, w, h, smp = os.path.abspath(sys.argv[1]), int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4])
    sc, obs, _ = scene(w, h, smp)
    for spec in sys.argv[5:]:
        cache, preset, slot = spec.split(':'); s = SLOTS[int(slot)]
        root, S, kind = add_garment(cache, preset, s['x'], s['rail'])
        for o in [root] + list(root.children_recursive): pass
    cam = [float(v) for v in os.environ.get('CAM', '0.3,1.2,4.3,0.02,1.1,-0.25,34').split(',')]               # 웹과 같은 시점으로 비교할 때
    camera_web(tuple(cam[:3]), tuple(cam[3:6]), cam[6], w / h)
    sc.render.filepath = out; t = time.time(); bpy.ops.render.render(write_still=True); print('render', round(time.time() - t, 1), 's')
