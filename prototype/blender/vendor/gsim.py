# 옷을 천 시뮬레이션으로 만든다 (Blender, 무료).
# 1단계: 옷을 봉제된 한 장의 천으로 만든다 (앞판, 뒤판, 소매를 꿰맨 격자).
# 2단계: 옷걸이에 걸고 중력으로 늘어뜨린다. 목둘레는 깃이 잡아 주는 것으로 보고 고정한다.
# 결과: 꼭짓점 위치(npz). 디테일(깃, 여밈단, 주머니, 단추)과 렌더는 gscene.py에서 한다.
# 좌표: 옷 좌표는 x 오른쪽, y 위, z 앞(보는 쪽). Blender로는 (x, -z, y).
import bpy, bmesh, math, pickle, sys, time
import numpy as np
from pathlib import Path

# WearNext adaptation: only newly simulated caches go into generated work files.
CACHE_DIR = Path(__file__).resolve().parents[2] / 'scene' / 'work' / 'cache'

smooth = lambda a, b, x: (lambda t: t * t * (3 - 2 * t))(min(1.0, max(0.0, (x - a) / (b - a))))
lerp = lambda a, b, t: a + (b - a) * t
B = lambda p: (p[0], -p[2], p[1])

SPECS = {
    # 버튼다운 셔츠
    'shirt': dict(L=0.76, aS=0.228, dS=0.054, aN=0.072, nF=0.08, nB=-0.006, bNf=0.054, bNb=0.03, aC=0.266, aW=0.258, aH=0.264, tail=0.05, vneck=0,
                  dC=0.05, dCb=0.04, hd=0.024, NT=70, NS=48, ja=21, sl_len=0.6, sl_phi=13, sl_fwd=0.13, cuffC=0.235, wristC=0.30, cuff_rows=6,
                  cloth=dict(mass=0.25, tension=18, shear=5, bend=0.34), hanger=dict(half=0.205, ry=0.011, rz=0.022)),
}


def body_fn(S):
    L, aS, dS, aN = S['L'], S['aS'], S['dS'], S['aN']
    a_at = lambda t: aS + (S['aC'] - aS) * smooth(0.04, 0.3, t) + (S['aW'] - S['aC']) * smooth(0.3, 0.6, t) + (S['aH'] - S['aW']) * smooth(0.6, 1, t)
    sh_y = lambda ax: -dS * min(1.0, max(0.0, (ax - aN) / (aS - aN)))
    if S['vneck']:
        neck_f = lambda q: -S['vneck'] * (1 - q) ** 0.88
    else:
        neck_f = lambda q: -S['nF'] * (1 - q * q)
    top_f = lambda x: sh_y(abs(x)) if abs(x) >= aN else neck_f(abs(x) / aN)
    top_b = lambda x: sh_y(abs(x)) if abs(x) >= aN else -S['nB'] * (1 - (x / aN) ** 2)
    hem = lambda x, front: -L + S['tail'] * min(1.0, (x / S['aH']) ** 2) + (S.get('cut', 0) * math.exp(-((x / 0.05) ** 2)) if front else 0)
    n = 2.6
    P = lambda s: max(0.0, 1 - abs(s) ** n) ** (1 / n)
    hd, tb = S['hd'], S['hd'] * 1.4 / L

    def z_at(x, t, front):
        s = max(-1.0, min(1.0, x / a_at(t))); ax = abs(x)
        edge = (S['bNf'] if front else S['bNb']) * math.sqrt(max(0.0, 1 - (ax / aN) ** 2)) if ax < aN else 0.0
        rnd = hd * smooth(aN * 0.5, aN * 1.1, ax) * math.sqrt(1 - (1 - min(1.0, t / tb)) ** 2)
        core = (S['dC'] if front else S['dCb']) * P(s)
        z = lerp(edge + rnd, core, smooth(tb * 0.5, 0.16, t))
        return z if front else -z
    return dict(a_at=a_at, top_f=top_f, top_b=top_b, hem=hem, z_at=z_at, sh_y=sh_y, neck_f=neck_f)


def build(S):
    """봉제된 옷 격자를 만든다. 반환: 꼭짓점 좌표(옷 좌표), 면, 꼭짓점 찾기표."""
    F = body_fn(S); NT, NS, ja = S['NT'], S['NS'], S['ja']
    V, key = [], {}

    def add(k, p):
        if k not in key: key[k] = len(V); V.append(p)
        return key[k]
    grid = {'F': [[0] * (NS + 1) for _ in range(NT + 1)], 'B': [[0] * (NS + 1) for _ in range(NT + 1)]}
    for j in range(NT + 1):
        t = j / NT; a = F['a_at'](t)
        for i in range(NS + 1):
            s = -1 + 2 * i / NS; x = s * a
            for side in 'FB':
                front = side == 'F'
                y = lerp((F['top_f'] if front else F['top_b'])(x), F['hem'](x, front), t)
                z = F['z_at'](x, t, front)
                if 0 < j < ja and i in (0, NS): z += (1 if front else -1) * 0.012 * math.sin(math.pi * j / ja)      # 진동(소매 구멍)을 조금 벌려 둔다
                if j == 0 and abs(x) >= S['aN']: k = ('T', i)                                                         # 어깨선: 앞뒤가 만난다
                elif i in (0, NS) and j >= ja: k = ('S', i, j)                                                        # 옆선: 겨드랑이 아래로 앞뒤가 만난다
                else: k = (side, i, j)
                grid[side][j][i] = add(k, (x, y, z if k[0] in 'FB' else 0.0))
    faces, fuv, fcls = [], [], []
    for side in 'FB':
        g = grid[side]
        for j in range(NT):
            for i in range(NS):
                q = (g[j][i], g[j + 1][i], g[j + 1][i + 1], g[j][i + 1])
                f = q if side == 'F' else q[::-1]
                if len(set(q)) == 3: f = tuple(dict.fromkeys(f))
                if len(set(q)) >= 3: faces.append(f); fuv.append([V[v][:2] for v in f]); fcls.append(side)                            # 몸판 UV = 제자리 좌표(m)
    # 소매: 진동 둘레에서 시작하는 통
    NK = 2 * ja; phi = math.radians(S['sl_phi']); sleeves = {}
    for sd in (-1, 1):
        ie = 0 if sd < 0 else NS
        ring0 = [grid['F'][0][ie]] + [grid['F'][j][ie] for j in range(1, ja)] + [grid['F'][ja][ie]] + [grid['B'][j][ie] for j in range(ja - 1, 0, -1)]
        p0 = [np.array(V[v]) for v in ring0]
        C0 = sum(np.linalg.norm(p0[k] - p0[(k + 1) % NK]) for k in range(NK))
        A = (p0[0] + p0[ja]) / 2; d = np.array([sd * math.sin(phi), -math.cos(phi), 0.0]); u = np.array([sd * math.cos(phi), math.sin(phi), 0.0]); zax = np.array([0, 0, 1.0])
        ds = C0 / NK; NR = int(round(S['sl_len'] / ds)); rings = [ring0]; cr = S['cuff_rows']
        for r in range(1, NR + 1):
            tau = r / NR
            C = lerp(C0, S['wristC'], smooth(0, 1, tau))
            if r > NR - cr - 3: C = lerp(C, S['cuffC'], smooth(NR - cr - 3, NR - cr, r))
            ru = C / 5.18; rz = 0.6 * ru; ctr = A + d * (r * ds) + zax * (S.get('sl_fwd', 0) * r * ds * smooth(0, 10, r)); ring = []; w = smooth(0, 6, r)
            for k in range(NK):
                th = 2 * math.pi * k / NK
                pe = ctr + u * ru * math.cos(th) + zax * rz * math.sin(th)
                p = lerp(p0[k] + d * (r * ds), pe, w)
                ring.append(add(('L' if sd < 0 else 'R', r, k), tuple(p)))
            rings.append(ring)
        Cr = [sum(np.linalg.norm(np.array(V[rg[k]]) - np.array(V[rg[(k + 1) % NK]])) for k in range(NK)) for rg in rings]
        uvr = lambda r, k: (k / NK * Cr[r], -r * ds)                                                              # 소매 UV: 둘레 방향(m), 길이 방향(m)
        for r in range(NR):
            for k in range(NK):
                q = (rings[r][k], rings[r][(k + 1) % NK], rings[r + 1][(k + 1) % NK], rings[r + 1][k])
                uq = [uvr(r, k), uvr(r, k + 1), uvr(r + 1, k + 1), uvr(r + 1, k)]
                faces.append(q if sd > 0 else q[::-1]); fuv.append(uq if sd > 0 else uq[::-1]); fcls.append('R' if sd > 0 else 'L')
        sleeves[sd] = rings
    return np.array(V, dtype=np.float64), faces, dict(grid=grid, sleeves=sleeves, NK=NK, fuv=fuv, fcls=fcls)


def hanger_obj(S, name='hanger'):
    """옷걸이 (충돌용). 어깨를 따라 내려가는 납작한 막대."""
    H = S['hanger']; F = body_fn(S); bm = bmesh.new(); N, M = 40, 12; rings = []
    for a in range(N + 1):
        x = lerp(-H['half'], H['half'], a / N); y = F['sh_y'](abs(x)) - H['ry'] - 0.005
        k = 1 - 0.3 * (abs(x) / H['half']) ** 4
        rings.append([bm.verts.new(B((x, y + H['ry'] * k * math.sin(2 * math.pi * m / M), H['rz'] * k * math.cos(2 * math.pi * m / M)))) for m in range(M)])
    for a in range(N):
        for m in range(M): bm.faces.new((rings[a][m], rings[a][(m + 1) % M], rings[a + 1][(m + 1) % M], rings[a + 1][m]))
    bm.faces.new(rings[0][::-1]); bm.faces.new(rings[N])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free(); ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob)
    for p in me.polygons: p.use_smooth = True
    return ob


def simulate(kind, frames=70, seed=0, out=None, spec_over=None):
    S = dict(SPECS[kind]); S.update(spec_over or {})
    bpy.ops.wm.read_factory_settings(use_empty=True); sc = bpy.context.scene
    V, faces, info = build(S)
    rnd = np.random.default_rng(seed); V = V + rnd.normal(0, 0.0009, V.shape) * np.array([1, 0.2, 1])       # 벌마다 주름이 다르게
    me = bpy.data.meshes.new(kind); me.from_pydata([B(p) for p in V], [], faces); me.update()
    ob = bpy.data.objects.new(kind, me); sc.collection.objects.link(ob)
    g = info['grid']; aN = S['aN']; F = body_fn(S)
    pin = ob.vertex_groups.new(name='pin')
    pins = sorted({g[sd][0][i] for sd in 'FB' for i in range(S['NS'] + 1) if abs((-1 + 2 * i / S['NS']) * S['aS']) < S['hanger']['half'] - 0.004})   # 목둘레와, 옷걸이에 얹힌 어깨선
    pin.add(pins, 1.0, 'REPLACE')
    stiff = ob.vertex_groups.new(name='stiff')
    cuffs = [v for sd in (-1, 1) for ring in info['sleeves'][sd][-S['cuff_rows']:] for v in ring]
    stiff.add(cuffs, 1.0, 'REPLACE')
    hg = hanger_obj(S); col = hg.modifiers.new('col', 'COLLISION'); hg.collision.thickness_outer = 0.004; hg.collision.thickness_inner = 0.02; hg.collision.cloth_friction = 12
    m = ob.modifiers.new('cloth', 'CLOTH'); cs, cc, C = m.settings, m.collision_settings, S['cloth']
    cs.quality = 10; cs.mass = C['mass']; cs.air_damping = 6
    cs.tension_stiffness = cs.compression_stiffness = C['tension']; cs.shear_stiffness = C['shear']; cs.bending_stiffness = C['bend']
    cs.tension_damping = cs.compression_damping = 8; cs.shear_damping = 8; cs.bending_damping = 0.6
    cs.vertex_group_mass = 'pin'; cs.pin_stiffness = 1.0
    cs.vertex_group_bending = 'stiff'; cs.bending_stiffness_max = C['bend'] * 30
    cc.use_collision = True; cc.distance_min = 0.004; cc.collision_quality = 4; cc.friction = 12
    cc.use_self_collision = True; cc.self_distance_min = 0.0035; cc.self_friction = 8
    m.point_cache.frame_start = 1; m.point_cache.frame_end = frames
    sc.frame_start = 1; sc.frame_end = frames; t0 = time.time()
    for f in range(1, frames + 1):
        sc.frame_set(f)
        if f % 10 == 0: print(f'  frame {f}/{frames}  {time.time() - t0:.0f}s', flush=True)
    dg = bpy.context.evaluated_depsgraph_get(); ev = ob.evaluated_get(dg); n = len(ev.data.vertices)
    co = np.empty(n * 3); ev.data.vertices.foreach_get('co', co); co = co.reshape(n, 3)
    P = np.stack([co[:, 0], co[:, 2], -co[:, 1]], axis=1)                                                    # 옷 좌표로 되돌린다
    if out is None:
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        out = str(CACHE_DIR / f'{kind}-{seed}.pkl')
    pickle.dump(dict(kind=kind, S=S, rest=V, pos=P, faces=faces, info=info, pins=pins), open(out, 'wb'))
    print('saved', out, 'verts', n, 'faces', len(faces), f'{time.time() - t0:.0f}s')
    return out


if __name__ == '__main__':
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    kind = sys.argv[1] if len(sys.argv) > 1 else 'shirt'
    simulate(kind, frames=int(sys.argv[2]) if len(sys.argv) > 2 else 70, seed=int(sys.argv[3]) if len(sys.argv) > 3 else 0)
