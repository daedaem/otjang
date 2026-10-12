# 옷본 방식 셔츠에 디테일을 붙인다: 깃(스탠드 + 접힌 깃), 앞여밈 단, 가슴 주머니, 단추, 커프스, 솔기 음영, 옷걸이와 고리.
# 앞판 위 디테일은 옷본 좌표(평면, m)로 정하고, 같은 삼각형의 무게중심 좌표로 걸린 모양 위에 옮긴다(실제 옷에 덧대는 것과 같다).
# 깃은 몸통에 꿰맨 모양(P1)에서 목둘레를 따라 만들고, 가장 가까운 삼각형 기준으로 걸린 모양(P2)으로 옮긴다.
import bpy, math, pickle
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
import gscene, gpattern
from gsim import B, smooth, lerp
from gscene import mesh_obj, tag, cloth_mods, button_obj, simple_mat, link, TAU

ORDER = ['front', 'back', 'sleeveR', 'sleeveL', 'lapelR', 'lapelL', 'stand', 'leaf']


def vertex_normals(P, F):
    N = np.zeros_like(P)
    for f in F:
        a, b, c = P[f[0]], P[f[1]], P[f[2]]; n = np.cross(b - a, c - a); N[f] += n
    return N / (np.linalg.norm(N, axis=1, keepdims=True) + 1e-12)


class FlatMap:
    """한 조각의 옷본 좌표 → 걸린 모양 위 점(법선 방향 띄움 포함)."""
    def __init__(self, D, name, P, N):
        self.base = D['offs'][name]; v2 = np.asarray(D['uv'][name]); n = len(v2)
        self.tris = [[i - self.base for i in f] for f in D['faces'] if self.base <= f[0] < self.base + n]
        self.v2 = v2; self.P = P[self.base:self.base + n]; self.N = N[self.base:self.base + n]
        self.bvh = BVHTree.FromPolygons([Vector((x, y, 0)) for x, y in v2], self.tris)

    def __call__(self, x, y, off=0.0):
        loc, _, idx, _ = self.bvh.find_nearest(Vector((x, y, 0))); a, b, c = self.tris[idx]
        A, Bv, C = self.v2[a], self.v2[b], self.v2[c]; T = np.array([[Bv[0] - A[0], C[0] - A[0]], [Bv[1] - A[1], C[1] - A[1]]])
        try: u, v = np.linalg.solve(T, np.array([x - A[0], y - A[1]]))
        except np.linalg.LinAlgError: u, v = 0.0, 0.0
        w = np.array([1 - u - v, u, v]); p = w @ self.P[[a, b, c]]; n = w @ self.N[[a, b, c]]; n /= np.linalg.norm(n) + 1e-12
        return tuple(p + n * off), tuple(n)


def neck_loop(D):
    """목둘레 꼭짓점을 앞중심에서 시작해 오른쪽 → 뒤 → 왼쪽 → 앞중심 순서로."""
    s, o = D['seg'], D['offs']
    fR = [o['front'] + i for i in s['front']['neckR']]; fL = [o['front'] + i for i in s['front']['neckL']]
    bR = [o['back'] + i for i in s['back']['neckR']]; bL = [o['back'] + i for i in s['back']['neckL']]
    return fR + bR[::-1][1:] + bL[::-1][1:] + fL[1:]


def collar(D, P1, P2, fab, inner, front_follow, tip=(0.05, 0.062)):
    """깃: 꿰맨 모양(P1)의 목둘레 고리를 따라 세운 밴드(스탠드)와, 밴드 위에서 바깥으로 접혀 내려오는 깃(리프). 걸린 모양(P2)으로 옮긴다."""
    P1 = P2                                                                                             # 2026-10-12: 걸린 모양(P2)에서 바로 만든다 (목둘레 주변 천이 P1과 달라 깃이 천 속에 묻혔다)
    L = np.array([P1[i] for i in neck_loop(D)]); L = np.vstack([L, L[:1]])
    s = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(L, axis=0), axis=1))]); NU = 120; u = np.linspace(0, s[-1], NU + 1)
    R = np.stack([np.interp(u, s, L[:, k]) for k in range(3)], 1); ctr = R.mean(0); up = np.array([0, 1.0, 0])
    surf = BVHTree.FromPolygons([Vector(p) for p in P1], [f for f in D['faces'] if D['piece_of'][f[0]] in ('front', 'back')])
    def outward(p): o = p - ctr; o[1] = 0; return o / (np.linalg.norm(o) + 1e-12)
    def push(pt, need):
        """바깥에서 안쪽으로 광선을 쏘아 가장 바깥 천 면보다 need만큼 밖에 둔다 (주름 속에 묻히지 않게)."""
        o = outward(pt); o = o + np.array([0, 0, 0.6]) * (1 if pt[2] > ctr[2] else 0); o /= np.linalg.norm(o)
        hit = surf.ray_cast(Vector(pt + o * 0.3), Vector(-o))
        if hit[0] is None: return pt
        h = np.array(hit[0]); dd = (pt - h) @ o
        return pt + o * (need - dd) if dd < need else pt
    def project(pt, off):
        hit = surf.ray_cast(Vector(pt + np.array([0, 0, 0.3])), Vector((0, 0, -1)))
        if hit[0] is None: loc, nrm, _, _ = surf.find_nearest(Vector(pt)); return np.array(loc) + np.array(nrm) * off
        return np.array(hit[0]) + np.array([0, 0, off])
    cf = R[0]; tips_target = {}
    for sx in (1, -1):                                                                                 # 깃 끝(버튼다운 점): 앞중심에서 옆으로 5cm, 아래로 6cm, 가슴 위에 붙게
        tips_target[sx] = project(cf + np.array([sx * tip[0], -tip[1], 0.015]), 0.0045)
    stV, stF, stU, lfV, lfF, lfU, tips = [], [], [], [], [], [], []; NQ = 10; sg = 0.028
    collar_stitch = []
    for i in range(NU + 1):
        sig = i / NU; p = R[i]; o = outward(p); ang = math.atan2(o[0], o[2]); fr = 1 - smooth(0.5, 1.9, abs(ang)); sx = 1 if sig < 0.5 else -1
        h = lerp(0.034, 0.026, fr)
        st_lo = p - up * 0.006 + o * 0.0008; st_hi = p + up * h - o * 0.003
        stV += [tuple(st_lo), tuple(st_hi)]; stU += [(u[i], -0.006), (u[i], h)]
        if i < NU: a_ = 2 * i; stF.append((a_, a_ + 2, a_ + 3, a_ + 1))
        if sig < sg or sig > 1 - sg: continue                                                          # 앞중심 양쪽: 깃 끝 사이 틈
        fold = st_hi + o * 0.0035 + up * 0.002
        back_edge = fold + o * 0.006 - up * (h + 0.011)
        ds = sig - sg if sig < 0.5 else (1 - sg) - sig                                                # 깃 끝에서 둘레 방향으로 떨어진 정도
        k = 1 - smooth(0.0, 0.17, ds); E = (1 - k) * back_edge + k * tips_target[sx]                 # 깃 끝 근처만 끝점으로 모인다
        row = []
        for j in range(NQ + 1):
            q = j / NQ; pt = fold + (E - fold) * q + o * 0.0045 * math.sin(math.pi * q)
            if q > 0.15: pt = push(pt, 0.003 + 0.002 * (1 - q))
            row.append(pt)
        base = len(lfV); lfV += [tuple(x) for x in row]; lfU += [(u[i], -j / NQ * np.linalg.norm(E - fold)) for j in range(NQ + 1)]
        if base > 0 and len(lfV) - base == NQ + 1 and getattr(collar, '_prev', None) == base - (NQ + 1):
            for j in range(NQ): a_ = base - (NQ + 1) + j; lfF.append((a_, a_ + 1, a_ + NQ + 2, a_ + NQ + 1))
        collar._prev = base
        if abs(sig - sg) < 1.0 / NU or abs(sig - (1 - sg)) < 1.0 / NU: tips.append(tuple(row[-2]))
        Lq = np.linalg.norm(row[-1] - row[0]); qq = max(0.0, 1 - 0.0055 / max(Lq, 1e-6)) * NQ; j0 = min(int(qq), NQ - 1); f_ = qq - j0
        sp = row[j0] * (1 - f_) + row[j0 + 1] * f_; nn = o + np.array([0, 0.25, 0]); nn /= np.linalg.norm(nn)
        collar_stitch.append((sp + nn * 0.0017, nn))
    collar._prev = None
    def orient(V, Fc, inward_ok=False):
        V_ = np.array(V); f = Fc[len(Fc) // 2]; n = np.cross(V_[f[1]] - V_[f[0]], V_[f[2]] - V_[f[0]]); c = V_[list(f)].mean(0)
        return Fc if n @ outward(c) > 0 else [tuple(q[::-1]) for q in Fc]
    stF = orient(stV, stF); lfF = orient(lfV, lfF)
    import os
    if os.environ.get('COLLAR_DEBUG'): pickle.dump(dict(stV=stV, lfV=lfV, lfF=lfF, R=R, tips=tips_target), open(os.environ['COLLAR_DEBUG'], 'wb'))
    mv = lambda V: [tuple(p) for p in V]
    uvf = lambda U, Fc: [[U[k] for k in q] for q in Fc]
    st = tag(mesh_obj('stand', mv(stV), stF, uvf(stU, stF), fab)); st.data.materials.append(inner); cloth_mods(st, 0.0016, 2, 0)
    lf = tag(mesh_obj('leaf', mv(lfV), lfF, uvf(lfU, lfF), fab)); lf.data.materials.append(inner); cloth_mods(lf, 0.0016, 2, 0)
    STITCHES.append(([p for p, _ in collar_stitch], [n for _, n in collar_stitch]))
    return [tuple(t) for t in tips[:2]]


def cuff(D, P2, sd_name, fab, inner, height=0.065, circ_target=0.245):
    """커프스: 소매 끝 둘레에 맞춘 타원 단면 띠(소매 끝에서 아래로 6.5cm, 1cm 겹침)."""
    o = D['offs'][sd_name]; v2 = np.asarray(D['uv'][sd_name]); L = gpattern.SHIRT['sl_len']
    wrist = [o + i for i in D['seg'][sd_name]['wrist']]
    upper = [o + i for i in np.where(np.abs(v2[:, 1] + L - 0.06) < 0.006)[0]]
    W = np.array([P2[i] for i in wrist]); U_ = np.array([P2[i] for i in upper]); cw = W.mean(0); cu = U_.mean(0)
    axis = cw - cu; axis /= np.linalg.norm(axis)
    proj = (W - cw) - np.outer((W - cw) @ axis, axis); _, _, Vt = np.linalg.svd(proj, full_matrices=False)
    e1 = Vt[0]; e2 = np.cross(axis, e1); e2 /= np.linalg.norm(e2)
    ra = max(np.abs(proj @ e1).max() + 0.004, 0.03); rb = max(np.abs(proj @ e2).max() + 0.004, 0.022)
    circ = math.pi * (3 * (ra + rb) - math.sqrt((3 * ra + rb) * (ra + 3 * rb)))
    if circ_target: k = min(1.0, circ_target / circ); ra, rb = ra * max(k, 0.85), rb * max(k, 0.85)        # 셔츠 커프스 둘레 약 24.5cm
    NK, NR = 36, 6; V, F, U = [], [], []; top, bot = cw - axis * 0.01, cw + axis * height
    for r in range(NR + 1):
        c = lerp(top, bot, r / NR)
        for kk in range(NK + 1):
            th = TAU * kk / NK; V.append(tuple(c + e1 * ra * math.cos(th) + e2 * rb * math.sin(th))); U.append((kk / NK * circ, -r / NR * (height + 0.01)))
    P0, P1_, P3 = (np.array(V[i]) for i in (0, 1, NK + 1)); out = np.dot(np.cross(P3 - P0, P1_ - P0), P0 - top) > 0
    for r in range(NR):
        for kk in range(NK):
            a = r * (NK + 1) + kk; q = (a, a + NK + 1, a + NK + 2, a + 1); F.append(q if out else q[::-1])
    cc = lerp(top, bot, 0.55); ci = len(V); V.append(tuple(cc)); U.append((0, 0)); r0 = len(V)
    for kk in range(NK):
        th = TAU * kk / NK; V.append(tuple(cc + e1 * ra * 0.97 * math.cos(th) + e2 * rb * 0.97 * math.sin(th))); U.append((ra * math.cos(th), rb * math.sin(th)))
    Q1, Q2 = np.array(V[r0]), np.array(V[r0 + 1]); oc = np.dot(np.cross(Q1 - cc, Q2 - cc), axis) > 0
    for kk in range(NK): t3 = (ci, r0 + kk, r0 + (kk + 1) % NK); F.append(t3 if oc else t3[::-1])
    ob = tag(mesh_obj('cuff' + sd_name[-1], V, F, [[U[k] for k in q] for q in F], fab)); ob.data.materials.append(inner); cloth_mods(ob, 0.0014, 2, 0)
    for t_ in (0.006, height + 0.01 - 0.006):                                                          # 커프스 위아래 가장자리 박음질 (5~6mm 안쪽)
        c = top + axis * t_; pts, nrm = [], []
        for kk in range(73):
            th = TAU * kk / 72; d = e1 * ra * math.cos(th) + e2 * rb * math.sin(th); nn = d / np.linalg.norm(d)
            pts.append(c + d + nn * 0.0016); nrm.append(nn)
        STITCHES.append((pts, nrm))
    sdir = e1 if (e1[0] * (1 if sd_name == 'sleeveR' else -1)) > 0 else -e1
    return tuple(lerp(top, bot, 0.55) + sdir * (ra + 0.0012)), tuple(sdir)


STITCHES = []                                                                                        # 박음질 선: [(점들, 법선들)]


def piece_poly(D, nm):
    v2 = np.asarray(D['uv'][nm]); idx = []
    for sname, ids in D['seg'][nm].items(): idx += list(ids[:-1])
    return v2[idx]


def inset(D, nm, seg, d, step=0.003, trim=0.0):
    """조각 가장자리(seg)를 안쪽으로 d만큼 옮긴 선 (옷본 좌표)."""
    v2 = np.asarray(D['uv'][nm]); P = v2[D['seg'][nm][seg]]
    L = float(np.linalg.norm(np.diff(P, axis=0), axis=1).sum()); n = max(2, int(L / step))
    Q = gpattern.resample(P, n); T = np.gradient(Q, axis=0); T /= np.linalg.norm(T, axis=1, keepdims=True) + 1e-12
    Nn = np.stack([-T[:, 1], T[:, 0]], 1); poly = piece_poly(D, nm)
    if gpattern.inside(poly, (Q + Nn * d)[len(Q) // 2:len(Q) // 2 + 1]).sum() == 0: Nn = -Nn
    Q = Q + Nn * d
    if trim > 0:
        s_ = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(Q, axis=0), axis=1))]); Q = Q[(s_ > trim) & (s_ < s_[-1] - trim)]
    keep = gpattern.inside(poly, Q); return Q[keep]


def flat_stitch(fm, pts, off):
    if len(pts) < 2: return
    out = [fm(x, y, off) for x, y in pts]; STITCHES.append(([np.array(p) for p, _ in out], [np.array(n) for _, n in out]))


def line(a, b, step=0.003):
    a, b = np.array(a, float), np.array(b, float); n = max(2, int(np.linalg.norm(b - a) / step)); return np.linspace(a, b, n + 1)


def body_stitches(D, P2, N2, fm, segs_front, segs_back, sleeve=True, d=0.006):
    """몸판·소매 솔기 옆 박음질 (밑단, 옆선, 진동, 어깨, 소매 밑선)."""
    bm_ = FlatMap(D, 'back', P2, N2)
    for sg_ in segs_front:
        if sg_ in D['seg']['front']: flat_stitch(fm, inset(D, 'front', sg_, d, trim=0.006), 0.0012)
    for sg_ in segs_back:
        if sg_ in D['seg']['back']: flat_stitch(bm_, inset(D, 'back', sg_, d, trim=0.006), 0.0012)
    if sleeve:
        for nm in ('sleeveR', 'sleeveL'): flat_stitch(FlatMap(D, nm, P2, N2), inset(D, nm, 'underF', d, trim=0.03), 0.0012)
    return bm_


def rect_stitch(fm, corners, off, inset_=0.003, warp=None, sides='LBR'):
    """네모 조각(주머니·뚜껑·견장) 가장자리 안쪽 박음질. corners: 왼위, 오른위, 오른아래, 왼아래."""
    tl, tr, br, bl = [np.array(c, float) for c in corners]
    def at(u, v):
        p = (1 - v) * (tl + (tr - tl) * u) + v * (bl + (br - bl) * u)
        if warp: dx, dy = warp(u, v); p = p + np.array([dx, dy])
        return p
    wv = np.linalg.norm(tr - tl); hv = np.linalg.norm(bl - tl); eu, ev = inset_ / max(wv, 1e-6), inset_ / max(hv, 1e-6)
    path = []
    if 'L' in sides: path += [at(eu, v) for v in np.linspace(ev if 'T' in sides else 0.0, 1 - ev, 24)]
    if 'B' in sides: path += [at(u, 1 - ev) for u in np.linspace(eu, 1 - eu, 30)]
    if 'R' in sides: path += [at(1 - eu, v) for v in np.linspace(1 - ev, ev if 'T' in sides else 0.0, 24)]
    if 'T' in sides: path += [at(u, ev) for u in np.linspace(1 - eu, eu, 30)]
    out = [fm(x, y, off(u_, v_) if callable(off) else off) for (x, y), (u_, v_) in zip(path, [(0.5, 0.5)] * len(path))]
    STITCHES.append(([np.array(a) for a, _ in out], [np.array(b) for _, b in out]))


def stitch_mesh(name, color, w=0.0008, lift=0.0004):
    """박음질 선을 가는 띠로. UV: u = 길이(m), v = 0~1 (웹에서 점선 그림을 입힌다)."""
    V, F, U = [], [], []
    for P, N in STITCHES:
        P = np.array(P); N = np.array(N)
        if len(P) < 2: continue
        T = np.gradient(P, axis=0); T /= np.linalg.norm(T, axis=1, keepdims=True) + 1e-12
        S = np.cross(N, T); S /= np.linalg.norm(S, axis=1, keepdims=True) + 1e-12
        sL = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(P, axis=0), axis=1))]); base = len(V)
        for k in range(len(P)):
            c = P[k] + N[k] * lift; V += [tuple(c - S[k] * w / 2), tuple(c + S[k] * w / 2)]; U += [(sL[k], 0.0), (sL[k], 1.0)]
        for k in range(len(P) - 1):
            a = base + 2 * k; q = (a, a + 2, a + 3, a + 1)
            n_ = np.cross(np.array(V[q[1]]) - np.array(V[q[0]]), np.array(V[q[3]]) - np.array(V[q[0]]))
            F.append(q if n_ @ N[k] > 0 else q[::-1])
    if not F: return None
    ob = mesh_obj(name, V, F, [[U[k] for k in q] for q in F], simple_mat('stitch', color, 0.7)); return ob


def button_obj2(name, centers, normals, r, mat, hole_mat):
    """단추: 가장자리가 도톰하고 가운데가 오목하며 구멍 4개."""
    import bmesh
    from mathutils import Vector
    bm = bmesh.new(); S = 28
    prof = [(0.0, 0.0011), (0.5, 0.00105), (0.68, 0.0013), (0.82, 0.0019), (0.94, 0.0021), (1.0, 0.0016), (1.0, 0.0003), (0.92, 0.0)]
    for c, n in zip(centers, normals):
        nb = Vector(B(n)).normalized(); rot = Vector((0, 0, 1)).rotation_difference(nb); C = Vector(B(c)); rings = []
        for rr, hh in prof:
            if rr == 0: rings.append([bm.verts.new(rot @ Vector((0, 0, hh)) + C)] * S); continue
            rings.append([bm.verts.new(rot @ Vector((rr * r * math.cos(TAU * k / S), rr * r * math.sin(TAU * k / S), hh)) + C) for k in range(S)])
        for a, b in zip(rings[:-1], rings[1:]):
            for k in range(S):
                vs = [a[k], b[k], b[(k + 1) % S], a[(k + 1) % S]]; vs = list(dict.fromkeys(vs))
                if len(vs) >= 3: bm.faces.new(vs)
        bm.faces.new(rings[-1][::-1])
        for k in range(4):                                                                             # 구멍 4개 (어두운 작은 원)
            ang = math.pi / 4 + k * math.pi / 2; cx, cy = 0.27 * r * math.cos(ang), 0.27 * r * math.sin(ang)
            ring = [bm.verts.new(rot @ Vector((cx + 0.11 * r * math.cos(TAU * j / 10), cy + 0.11 * r * math.sin(TAU * j / 10), 0.00113)) + C) for j in range(10)]
            f = bm.faces.new(ring); f.material_index = 1
    bmesh.ops.recalc_face_normals(bm, faces=[f for f in bm.faces if f.material_index == 0])
    for f in bm.faces:
        if f.material_index == 1 and f.normal.dot(f.calc_center_median() - f.verts[0].co) < 2: pass
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for p_ in me.polygons: p_.use_smooth = p_.material_index == 0
    ob = link(bpy.data.objects.new(name, me)); ob.data.materials.append(mat); ob.data.materials.append(hole_mat)
    return ob


def patch(fm, name, corners, nu, nv, off, fab, inner, warp=None, thick=0.0009):
    """앞판 옷본 좌표의 네모 조각(앞여밈 단, 주머니)을 걸린 모양 위에 얹는다."""
    tl, tr, br, bl = corners; V, F, U = [], [], []
    for j in range(nv + 1):
        for i in range(nu + 1):
            u, v = i / nu, j / nv
            x = (1 - v) * lerp(tl[0], tr[0], u) + v * lerp(bl[0], br[0], u); y = (1 - v) * lerp(tl[1], tr[1], u) + v * lerp(bl[1], br[1], u)
            if warp: dx, dy = warp(u, v); x += dx; y += dy
            o = off(u, v) if callable(off) else off; p, _ = fm(x, y, o); V.append(p); U.append((x, y))
    for j in range(nv):
        for i in range(nu):
            a = j * (nu + 1) + i; F.append((a, a + nu + 1, a + nu + 2, a + 1))                          # 면이 바깥(보는 쪽)을 향하게 (안쪽을 향하면 빛이 어둡게 구워진다)
    ob = tag(mesh_obj(name, V, F, [[U[k] for k in q] for q in F], fab)); ob.data.materials.append(inner); cloth_mods(ob, thick, 1, -1)
    return ob


def seam_shade(D):
    """솔기·밑단 가까운 곳을 조금 어둡게 (실제 박음질 자리의 그늘). 꼭짓점별 밝기 배열."""
    n = len(D['pos']); shade = np.ones(n); seam_ix = set(i for pair in D['sew'] for i in pair)
    for nm in [x for x in ORDER if x in D['offs']]:
        o = D['offs'][nm]; v2 = np.asarray(D['uv'][nm]); segs = D['seg'][nm]
        for sname, idx in segs.items():
            k = 0.86 if any((o + i) in seam_ix for i in idx) else (0.9 if sname.startswith('hem') or sname == 'wrist' else 1.0)
            if k >= 1: continue
            B2 = v2[idx]; d = np.min(np.linalg.norm(v2[:, None, :] - B2[None, :, :], axis=2), axis=1)
            for i in np.where(d < 0.006)[0]: shade[o + i] = min(shade[o + i], k + (1 - k) * d[i] / 0.006)
    return shade


def relax_neck(D, P, reach=0.09, its=40):
    """목둘레 주변(옷본 거리 reach 안)의 잔주름·뭉침을 펴 준다. 목둘레 가장자리는 그대로 둔다."""
    P = P.copy(); n = len(P); nb = [set() for _ in range(n)]
    for f in D['faces']:
        for a in range(len(f)): u, v = f[a], f[(a + 1) % len(f)]; nb[u].add(v); nb[v].add(u)
    w = np.zeros(n); fixed = set()
    for nm in ('front', 'back'):
        o = D['offs'][nm]; v2 = np.asarray(D['uv'][nm]); idx = D['seg'][nm]['neckR'] + D['seg'][nm]['neckL']
        d = np.min(np.linalg.norm(v2[:, None, :] - v2[idx][None, :, :], axis=2), axis=1)
        t = np.clip(1 - d / reach, 0, 1); w[o:o + len(v2)] = t * t * (3 - 2 * t); fixed |= set(o + i for i in idx)
    sel = [i for i in np.where(w > 0.01)[0] if i not in fixed]; nbl = {i: list(nb[i]) for i in sel}
    for _ in range(its):
        Q = P.copy()
        for i in sel: Q[i] = P[i] + 0.5 * w[i] * (P[nbl[i]].mean(0) - P[i])
        P = Q
    return P


SMOOTH = {'shirt': 4, 'field': 10, 'blazer': 8, 'sweat': 6}
TIDY = True
LAST = None
PRESS = {'shirt': 0.3, 'field': 0.35, 'blazer': 0.25, 'sweat': 0.3}
MIRROR_OF = {'sleeveR': 'sleeveL', 'sleeveL': 'sleeveR', 'lapelR': 'lapelL', 'lapelL': 'lapelR'}


def symmetrize(D, P):
    """좌우 대칭으로 맞춘다. 각 점의 거울 짝(같은 옷본 위치의 반대쪽)을 찾아 좌우를 뒤집은 위치와 평균한다.
    앞판·뒤판·깃은 같은 조각 안에서 x를 뒤집은 자리, 소매는 다른 쪽 소매의 같은 자리, 라펠은 다른 쪽 라펠의 x를 뒤집은 자리."""
    N = vertex_normals(P, D['faces']); Q = P.copy(); maps = {}
    for nm in [x for x in ORDER if x in D['offs']]:
        o = D['offs'][nm]; v2 = np.asarray(D['uv'][nm]); tgt = MIRROR_OF.get(nm, nm)
        if tgt not in D['offs']: continue
        if tgt not in maps: maps[tgt] = FlatMap(D, tgt, P, N)
        if nm.startswith('sleeve'): mx = v2[:, 0]
        elif nm.startswith('lapel'): mx = -v2[:, 0]
        else: mx = v2[:, 0].min() + v2[:, 0].max() - v2[:, 0]
        for i in range(len(v2)):
            pm, _ = maps[tgt](mx[i], v2[i, 1], 0.0); pm = np.array(pm); pm[0] = -pm[0]
            Q[o + i] = (P[o + i] + pm) / 2
    return Q


def press(D, P, k, its=40):
    """다림질: 많이 매끄럽게 한 모양을 기준으로 주름 높이를 k배로 줄인다 (큰 흐름은 남고 잔주름이 사라진다)."""
    if k >= 1: return P
    Ps = taubin(D, P, its); return Ps + k * (P - Ps)




def taubin(D, P, its):
    """줄어들지 않는 매끄럽게 하기(λ/μ 번갈아). 조각 가장자리는 그대로 둔다."""
    if its <= 0: return P
    n = len(P); nb = [set() for _ in range(n)]; edge_count = {}
    for f in D['faces']:
        for a in range(len(f)):
            u, v = f[a], f[(a + 1) % len(f)]; nb[u].add(v); nb[v].add(u); k = (min(u, v), max(u, v)); edge_count[k] = edge_count.get(k, 0) + 1
    border = set(i for (u, v), c in edge_count.items() if c == 1 for i in (u, v))
    idx = [i for i in range(n) if i not in border and nb[i]]; nbl = [list(nb[i]) for i in idx]
    P = P.copy()
    for _ in range(its):
        for lam in (0.5, -0.53):
            Q = P.copy()
            for i, l in zip(idx, nbl): Q[i] = P[i] + lam * (P[l].mean(0) - P[i])
            P = Q
    return P


def weld_seams(D, P, its=3, reach=4):
    """꿰맨 점 쌍을 가운데로 모으고, 주변 몇 칸을 함께 끌어와 꺾이지 않게 한다."""
    P = P.copy(); n = len(P); nb = [set() for _ in range(n)]
    for f in D['faces']:
        for a in range(len(f)): u, v = f[a], f[(a + 1) % len(f)]; nb[u].add(v); nb[v].add(u)
    disp = np.zeros_like(P); hit = np.zeros(n, bool)
    for _ in range(its):
        for a, b in D['sew']:
            m = (P[a] + P[b]) / 2; disp[a] += m - P[a]; disp[b] += m - P[b]; P[a] = m; P[b] = m; hit[a] = hit[b] = True
    # 이동량을 이웃으로 퍼뜨린다 (솔기 옆 천이 함께 따라온다)
    D0 = disp.copy(); front = set(np.where(hit)[0]); seen = set(front)
    for r in range(1, reach + 1):
        nxt = set()
        for i in front:
            for j in nb[i]:
                if j not in seen: nxt.add(j)
        w = (1 - r / (reach + 1)) ** 2
        for j in nxt:
            src = [k for k in nb[j] if k in seen]; P[j] += w * np.mean([D0[k] for k in src], axis=0); D0[j] = np.mean([D0[k] for k in src], axis=0) * w
        seen |= nxt; front = nxt
    return P


def pieces_and_hanger(D, P2, F, fab, inner):
    seam = seam_shade(D)
    for nm in [x for x in ORDER if x in D['offs']]:
        o = D['offs'][nm]; n = len(D['uv'][nm]); Fl = [[i - o for i in f] for f in F if o <= f[0] < o + n]
        ob = tag(mesh_obj('p-' + nm, P2[o:o + n], Fl, [[tuple(D['uv'][nm][i]) for i in f] for f in Fl], fab)); ob.data.materials.append(inner)
        col = ob.data.color_attributes['seam']
        for i in range(n): k = seam[o + i]; col.data[i].color = (k, k, k, 1)
        cloth_mods(ob, 0.0011 if D['kind'].startswith('shirt') else 0.0016, 2, -1)


def finish(kind):
    """옷걸이(보이는 것은 조금 짧게)와 고리, 묶음."""
    H = gpattern.HANGER
    hg = gpattern.hanger(H['half'] * 0.92, name='hanger-wood'); hg.data.materials.append(simple_mat('wood', (0.42, 0.25, 0.12), 0.38, coat=0.4))
    hook = bpy.data.curves.new('hook', 'CURVE'); hook.dimensions = '3D'; hook.bevel_depth = 0.0028; hook.bevel_resolution = 4
    sp = hook.splines.new('BEZIER'); pts = [(0, -0.01, 0), (0, 0.075, 0), (0.0, 0.104, 0.0), (0.022, 0.12, 0), (0.0, 0.142, 0), (-0.02, 0.124, 0)]
    sp.bezier_points.add(len(pts) - 1)
    for bp, p in zip(sp.bezier_points, pts): bp.co = B(p); bp.handle_left_type = bp.handle_right_type = 'AUTO'
    ho = link(bpy.data.objects.new('hook', hook)); ho.data.materials.append(simple_mat('steel', (0.75, 0.75, 0.76), 0.22, 1.0))
    root = bpy.data.objects.new('garment', None); link(root)
    for ob in bpy.context.scene.objects:
        if ob is not root and ob.parent is None and ob.type in ('MESH', 'CURVE'): ob.parent = root
    return root, dict(hanger=dict(H), L=0.8, pattern=True), kind


def build(cache, preset):
    D = pickle.load(open(cache, 'rb')); kind = D['kind'].split('-')[0]; gpattern.use(kind); STITCHES.clear()
    P2 = np.asarray(D['pos']); P1 = np.asarray(D['P1']); F = D['faces']
    if TIDY: P2 = symmetrize(D, P2)                                                                   # 2026-10-12 사용자: "흔들다 멈춘 장면 같다" → 진열한 옷처럼 좌우 대칭으로
    P2 = weld_seams(D, P2)
    if TIDY: P2 = press(D, P2, PRESS.get(kind, 0.35))                                                  # 다림질: 큰 주름은 두고 잔주름만 줄인다
    P2 = taubin(D, P2, SMOOTH.get(kind, 0)); D['pos'] = P2                                             # 솔기 틈을 닫고 잔주름(구김 뭉침)을 편다
    global LAST; LAST = D                                                                              # 최종 모양 (흔들림용 물리 천을 만들 때 쓴다)
    if 'stand' not in D['offs']: P2 = relax_neck(D, P2); D['pos'] = P2                                # 깃을 나중에 얹는 경우: 목둘레 뭉침을 먼저 편다
    P_ = gscene.PRESETS[preset]; fab = gscene.cloth_material('cloth-' + preset, P_)
    inner = simple_mat('lining', P_['lining'], 0.6) if kind == 'blazer' else fab
    N2 = vertex_normals(P2, F); pieces_and_hanger(D, P2, F, fab, inner)
    fm = FlatMap(D, 'front', P2, N2); S = gpattern.SHIRT; hw = gscene.hardware(P_.get('buttons', 'pearl'))
    if kind == 'field': return build_field(D, P2, N2, fm, S, fab, inner, hw)
    if kind == 'trucker': return build_trucker(D, P1, P2, N2, fm, S, fab, inner, hw)
    if kind == 'blazer': return build_blazer(D, P2, N2, fm, S, fab, inner, hw)
    if kind == 'sweat': return build_sweat(D, P2, N2, fm, S, fab, inner)
    front_follow = gscene.follower(P1, P2, F, set(i for i, nm in enumerate(D['piece_of']) if nm in ('front', 'back')))
    patch(fm, 'placket', [[-0.0175, -S['neck_df'] + 0.004], [0.0175, -S['neck_df'] + 0.004], [0.0175, S['hem_f'] + 0.003], [-0.0175, S['hem_f'] + 0.003]], 6, 90, 0.0016, fab, inner)
    patch(fm, 'pocket', [[0.058, -0.222], [0.162, -0.222], [0.162, -0.34], [0.058, -0.34]], 14, 16, lambda u, v: 0.0018 + 0.0015 * math.sin(math.pi * u) * math.sin(math.pi * v), fab, inner,
          warp=lambda u, v: (0, -0.014 * v * (1 - abs(2 * u - 1))))
    ys = [-S['neck_df'] - 0.058 - i * 0.092 for i in range(7)]
    hole = simple_mat('hole', (0.05, 0.05, 0.06), 0.6)
    cs = [fm(0.0, y, 0.0024) for y in ys]; button_obj2('buttons', [c for c, _ in cs], [n for _, n in cs], 0.0057, hw, hole)
    # 박음질: 앞여밈 단 양쪽, 주머니(옆·아래 2mm, 위 단 1.5cm), 밑단, 옆선, 진동, 어깨, 소매 밑선, 등 요크
    for x in (-0.0135, 0.0135): flat_stitch(fm, line((x, -S['neck_df'] - 0.004), (x, S['hem_f'] + 0.012)), 0.0018)
    pk = lambda u, v: (0.058 + 0.104 * u, -0.222 - 0.118 * v - 0.014 * v * (1 - abs(2 * u - 1)))
    po = lambda u, v: 0.0019 + 0.0015 * math.sin(math.pi * u) * math.sin(math.pi * v)
    side_l = [pk(0.02, v) for v in np.linspace(0.02, 0.985, 30)]; side_r = [pk(0.98, v) for v in np.linspace(0.02, 0.985, 30)]
    bottom = [pk(u, 0.985) for u in np.linspace(0.02, 0.98, 30)]; top_ = [pk(u, 0.125) for u in np.linspace(0.0, 1.0, 30)]
    for path in (side_l + bottom + side_r[::-1], top_):
        out = [fm(x, y, po(min(max((x - 0.058) / 0.104, 0), 1), min(max((-0.222 - y) / 0.13, 0), 1)) + 0.0004) for x, y in path]
        STITCHES.append(([np.array(a) for a, _ in out], [np.array(b) for _, b in out]))
    bm_ = FlatMap(D, 'back', P2, N2); sm = {nm: FlatMap(D, nm, P2, N2) for nm in ('sleeveR', 'sleeveL')}
    for nm, m_ in (('front', fm), ('back', bm_)):
        for sg_ in ('hemR', 'hemL'): flat_stitch(m_, inset(D, nm, sg_, 0.006, trim=0.004), 0.0012)
    for sg_ in ('sideR', 'sideL', 'armR', 'armL', 'shoulderR', 'shoulderL'): flat_stitch(fm, inset(D, 'front', sg_, 0.006, trim=0.008), 0.0012)
    for sg_ in ('armR', 'armL'): flat_stitch(bm_, inset(D, 'back', sg_, 0.006, trim=0.008), 0.0012)
    yk = [p_ for p_ in line((-0.24, -0.13), (0.24, -0.13)) if gpattern.inside(piece_poly(D, 'back'), p_[None])[0]]; flat_stitch(bm_, yk, 0.0012)
    for nm in ('sleeveR', 'sleeveL'): flat_stitch(sm[nm], inset(D, nm, 'underF', 0.006, trim=0.03), 0.0012)
    if 'leaf' in D['offs']:                                                                          # 깃을 함께 꿰매 시뮬레이션한 경우: 깃 끝 꼭짓점에 단추
        o = D['offs']['leaf']; sg = D['seg']['leaf']; tipi = [o + sg['frontR'][-2], o + sg['frontL'][1]]
        tips = [tuple(P2[i] + N2[i] * 0.002) for i in tipi]; tn = [tuple(N2[i]) for i in tipi]
        os_ = D['offs']['stand']; e = D['seg']['stand']['endR']; ti = os_ + e[len(e) // 2]
        button_obj('collar-buttons', tips + [tuple(P2[ti] + N2[ti] * 0.003)], tn + [tuple(N2[ti])], 0.0046, hw)
    else:
        tips = collar(D, P1, P2, fab, inner, front_follow)
        top_c, top_n = fm(0.0, -S['neck_df'] + 0.016, 0.004)
        button_obj2('collar-buttons', [(t[0], t[1], t[2] + 0.0006) for t in tips] + [top_c], [(0, 0.3, 1)] * 2 + [top_n], 0.0046, hw, hole)
    for nm in ('sleeveR', 'sleeveL'):
        c, d = cuff(D, P2, nm, fab, inner); button_obj2('cuff-btn' + nm[-1], [c], [d], 0.0058, hw, hole)
    stitch_mesh('stitch', (0.22, 0.25, 0.33))
    return finish('shirt')


def build_field(D, P2, N2, fm, S, fab, inner, hw):
    """필드 재킷: 가운데 덧단(스톰 플랩)과 똑딱단추, 뚜껑 달린 주머니 4개, 견장, 소매 끝단."""
    w = S['placket']; top = -S['neck_df'] + 0.004; bot = S['hem_f'] + 0.004
    patch(fm, 'placket', [[-w, top], [w, top], [w, bot], [-w, bot]], 8, 100, 0.0024, fab, inner, thick=0.0016)
    snaps = [fm(w * 0.62, top - 0.05 - i * 0.135, 0.0045) for i in range(6)]
    pockets = [([0.072, -0.225], [0.212, -0.37], [0.066, -0.205], [0.218, -0.258]), ([0.062, -0.485], [0.252, -0.705], [0.056, -0.468], [0.258, -0.53])]
    for sx in (1, -1):
        for k, ((x0, y0), (x1, y1), (fx0, fy0), (fx1, fy1)) in enumerate(pockets):
            X = lambda x: x * sx; c = sorted([X(x0), X(x1)]); fc = sorted([X(fx0), X(fx1)])
            patch(fm, f'pocket{k}{"R" if sx > 0 else "L"}', [[c[0], y0], [c[1], y0], [c[1], y1], [c[0], y1]], 14, 18,
                  lambda u, v: 0.0045 + 0.003 * math.sin(math.pi * u) * math.sin(math.pi * min(1, v * 1.2)), fab, inner, thick=0.0014)
            patch(fm, f'flap{k}{"R" if sx > 0 else "L"}', [[fc[0], fy0], [fc[1], fy0], [fc[1], fy1], [fc[0], fy1]], 14, 6,
                  lambda u, v: 0.0088 + 0.0012 * math.sin(math.pi * u), fab, inner, warp=lambda u, v: (0, -0.008 * v * (1 - abs(2 * u - 1)) ** 0.5), thick=0.0016)
            snaps.append(fm(sx * (fx0 + fx1) / 2, fy1 + 0.012, 0.009))
        # 견장: 어깨선 바로 아래(앞판이 어깨 위로 넘어가는 자리)
        sp = S['sp']; a0, a1 = (0.10, -0.012), (sp[0] - 0.015, sp[1] + 0.002)
        q = [[sx * a0[0], a0[1]], [sx * a1[0], a1[1]], [sx * a1[0], a1[1] - 0.042], [sx * a0[0], a0[1] - 0.042]]
        if sx < 0: q = [q[1], q[0], q[3], q[2]]
        patch(fm, f'epaulet{"R" if sx > 0 else "L"}', q, 12, 4, 0.0035, fab, inner, thick=0.0016)
        snaps.append(fm(sx * (a0[0] + 0.012), a0[1] - 0.021, 0.006))
    button_obj('snaps', [c for c, _ in snaps], [n for _, n in snaps], 0.0068, hw)
    # 박음질: 덧단 양쪽, 주머니(옆·아래), 뚜껑(옆·아래), 견장 둘레, 몸판·소매 솔기
    for x in (-w + 0.005, w - 0.005): flat_stitch(fm, line((x, top - 0.004), (x, bot + 0.006)), 0.0024 + 0.0016 + 0.0004)
    for sx in (1, -1):
        for k, ((x0, y0), (x1, y1), (fx0, fy0), (fx1, fy1)) in enumerate(pockets):
            c = sorted([x0 * sx, x1 * sx]); fc = sorted([fx0 * sx, fx1 * sx])
            rect_stitch(fm, [[c[0], y0], [c[1], y0], [c[1], y1], [c[0], y1]], 0.0045 + 0.0014 + 0.0004, 0.004)
            rect_stitch(fm, [[fc[0], fy0], [fc[1], fy0], [fc[1], fy1], [fc[0], fy1]], 0.0088 + 0.0016 + 0.0004, 0.005,
                        warp=lambda u, v: (0, -0.008 * v * (1 - abs(2 * u - 1)) ** 0.5))
        a0, a1 = (0.10, -0.012), (S['sp'][0] - 0.015, S['sp'][1] + 0.002)
        q = [[sx * a0[0], a0[1]], [sx * a1[0], a1[1]], [sx * a1[0], a1[1] - 0.042], [sx * a0[0], a0[1] - 0.042]]
        if sx < 0: q = [q[1], q[0], q[3], q[2]]
        rect_stitch(fm, q, 0.0035 + 0.0016 + 0.0004, 0.004, sides='LBRT')
    body_stitches(D, P2, N2, fm, ('hemR', 'hemL', 'sideR', 'sideL', 'armR', 'armL', 'shoulderR', 'shoulderL'), ('hemR', 'hemL', 'armR', 'armL'))
    stitch_mesh('stitch', (0.3, 0.32, 0.22))
    return finish('field')                                                                         # 소매 끝은 접어 박은 단 (띠를 따로 두르면 안쪽 틈이 어둡게 보였다)


def build_blazer(D, P2, N2, fm, S, fab, inner, hw):
    """싱글 블레이저: 금장 단추 2개, 뚜껑 주머니 2개, 가슴 웰트 주머니, 소매 단추 3개씩, 앞 여밈 가장자리 선."""
    cs = [fm(0.0, y, 0.0045) for y in (S['break_y'] - 0.022, S['break_y'] - 0.122)]
    button_obj('buttons', [c for c, _ in cs], [n for _, n in cs], 0.0095, hw)
    for sx in (1, -1):
        x0, x1 = sorted([sx * 0.092, sx * 0.248])
        patch(fm, 'flap' + ('R' if sx > 0 else 'L'), [[x0, -0.52], [x1, -0.52], [x1, -0.575], [x0, -0.575]], 16, 6,
              lambda u, v: 0.0035 + 0.0015 * math.sin(math.pi * u), fab, inner, thick=0.0016)
    patch(fm, 'welt', [[0.085, -0.236], [0.188, -0.226], [0.188, -0.250], [0.085, -0.260]], 12, 3, 0.0022, fab, inner, thick=0.0014)
    # 앞 여밈 가장자리: 아래 단추 밑에서 둥글게 잘린 자리까지 가는 선(겹친 앞판 끝)
    edge = patch(fm, 'frontedge', [[-0.003, S['break_y'] - 0.004], [0.003, S['break_y'] - 0.004], [0.003, S['cut_y'] + 0.004], [-0.003, S['cut_y'] + 0.004]], 2, 40, 0.0016, fab, inner, thick=0.0008)
    col = edge.data.color_attributes['seam']
    for d in col.data: d.color = (0.55, 0.55, 0.55, 1)
    for nm in ('sleeveR', 'sleeveL'):                                                                  # 소매 단추: 뒤쪽 밑선 옆, 소매 끝에서 3~7cm
        sm = FlatMap(D, nm, P2, N2); ww = S['wrist'] / 2; L = S['sl_len']
        bs = [sm(-ww + 0.022, -L + 0.032 + 0.018 * k, 0.003) for k in range(3)]
        button_obj('sleeve-btn' + nm[-1], [c for c, _ in bs], [n for _, n in bs], 0.0068, hw)
    # 손바느질 느낌의 가장자리 박음질(픽 스티치): 라펠 가장자리 6mm 안쪽, 깃 가장자리 5mm 안쪽
    for nm in ('lapelR', 'lapelL'):
        if nm not in D['offs']: continue
        lm = FlatMap(D, nm, P2, N2)
        for sg_ in ('gorge', 'tip', 'edge'): flat_stitch(lm, inset(D, nm, sg_, 0.006, trim=0.004), 0.0014)
    if 'leaf' in D['offs']: flat_stitch(FlatMap(D, 'leaf', P2, N2), inset(D, 'leaf', 'outer', 0.005, trim=0.006), 0.0014)
    stitch_mesh('stitch', (0.16, 0.19, 0.28), w=0.0006)
    return finish('blazer')


def build_sweat(D, P2, N2, fm, S, fab, inner):
    """스웻셔츠(크루넥, 기모): 리브 넥밴드(꿰맨 세운 조각), 리브 밑단 밴드(앞·뒤), 리브 커프스(단추 없음), 박음질(진동·어깨·옆선·밑단 두 줄). 로고·프린트는 그리지 않는다. 2026-10-12"""
    hem = S['hem_f']; band = 0.06
    bm_ = FlatMap(D, 'back', P2, N2)
    for m_, nm in ((fm, 'front'), (bm_, 'back')):                                                      # 밑단 리브 밴드 6cm: 조금 두껍게 얹고 위·아래 가장자리 박음질
        poly = piece_poly(D, nm); xs = poly[:, 0]; x0, x1 = xs.min() + 0.002, xs.max() - 0.002
        patch(m_, 'rib-' + nm, [[x0, hem + band], [x1, hem + band], [x1, hem + 0.002], [x0, hem + 0.002]], 60, 5, 0.0024, fab, inner, thick=0.0018)
        flat_stitch(m_, line((x0 + 0.004, hem + band - 0.004), (x1 - 0.004, hem + band - 0.004)), 0.0024 + 0.0018 + 0.0004)
        flat_stitch(m_, line((x0 + 0.004, hem + 0.006), (x1 - 0.004, hem + 0.006)), 0.0024 + 0.0018 + 0.0004)
        for sg_ in ('armR', 'armL', 'shoulderR', 'shoulderL'): flat_stitch(m_, inset(D, nm, sg_, 0.006, trim=0.008), 0.0012)
    for sg_ in ('sideR', 'sideL'): flat_stitch(fm, inset(D, 'front', sg_, 0.006, trim=0.008), 0.0012)
    if 'stand' in D['offs']:                                                                          # 넥밴드(꿰맨 조각) 아래 가장자리 박음질: 넥밴드 조각의 아랫선을 따라
        o = D['offs']['stand']; sg = D['seg']['stand']
        for key in ('lo1', 'lo2', 'lo3', 'lo4'):
            idx = [o + i for i in sg[key]]; pts = [P2[i] + N2[i] * 0.0016 for i in idx]; nrm = [N2[i] for i in idx]
            STITCHES.append((pts, nrm))
    sm = {nm: FlatMap(D, nm, P2, N2) for nm in ('sleeveR', 'sleeveL')}
    for nm in ('sleeveR', 'sleeveL'):
        flat_stitch(sm[nm], inset(D, nm, 'underF', 0.006, trim=0.03), 0.0012)
        cuff(D, P2, nm, fab, inner, height=0.06, circ_target=0.21)                                      # 리브 커프스 6cm, 둘레 약 21cm, 단추 없음
    stitch_mesh('stitch', (0.52, 0.53, 0.56))
    return finish('sweat')


def build_trucker(D, P1, P2, N2, fm, S, fab, inner, hw):
    """트러커 재킷(코듀로이): 뾰족 깃, 앞여밈 단 + 단추 6개, 가슴 뚜껑 주머니 2개, 앞 요크와 세로 절개선 박음질, 허리 밴드, 소매 커프스."""
    hole = simple_mat('hole', (0.05, 0.05, 0.06), 0.6)
    w = S['placket']; top = -S['neck_df'] + 0.004; hem = S['hem_f']; band = 0.045
    patch(fm, 'placket', [[-w, top], [w, top], [w, hem + 0.003], [-w, hem + 0.003]], 6, 80, 0.0022, fab, inner, thick=0.0016)
    bm_ = FlatMap(D, 'back', P2, N2)
    for m_, nm in ((fm, 'front'), (bm_, 'back')):                                                      # 허리 밴드
        poly = piece_poly(D, nm); xs = poly[:, 0]; x0, x1 = xs.min() + 0.002, xs.max() - 0.002
        patch(m_, 'band-' + nm, [[x0, hem + band], [x1, hem + band], [x1, hem + 0.002], [x0, hem + 0.002]], 60, 4, 0.0026, fab, inner, thick=0.0018)
        flat_stitch(m_, line((x0 + 0.004, hem + band - 0.004), (x1 - 0.004, hem + band - 0.004)), 0.0026 + 0.0018 + 0.0004)
        flat_stitch(m_, line((x0 + 0.004, hem + band + 0.006), (x1 - 0.004, hem + band + 0.006)), 0.0012)
    ys = [top - 0.03 - i * ((top - 0.03 - (hem + band * 0.5)) / 5) for i in range(6)]
    cs = [fm(0.0, y, 0.0022 + 0.0016) for y in ys]; button_obj2('buttons', [c for c, _ in cs], [n for _, n in cs], 0.0075, hw, hole)
    for x in (-w + 0.004, w - 0.004): flat_stitch(fm, line((x, top - 0.004), (x, hem + band + 0.004)), 0.0022 + 0.0016 + 0.0004)
    yk = -0.165                                                                                        # 앞 요크 선과, 그 아래 세로 절개선(트러커 특유)
    for sx in (1, -1):
        flat_stitch(fm, [p_ for p_ in line((sx * (w + 0.002), yk), (sx * 0.24, yk - 0.01)) if gpattern.inside(piece_poly(D, 'front'), p_[None])[0]], 0.0012)
        for xv in (0.11, 0.122): flat_stitch(fm, line((sx * xv, yk - 0.004), (sx * xv, hem + band + 0.004)), 0.0012)
        x0, x1 = sorted([sx * 0.045, sx * 0.165]); fy0, fy1 = yk - 0.012, yk - 0.062                        # 가슴 뚜껑 주머니 (뾰족한 뚜껑 + 단추)
        flap_warp = lambda u, v: (0, -0.014 * v * (1 - abs(2 * u - 1)))
        patch(fm, 'pocket' + ('R' if sx > 0 else 'L'), [[x0, fy0 - 0.02], [x1, fy0 - 0.02], [x1, fy0 - 0.13], [x0, fy0 - 0.13]], 14, 16,
              lambda u, v: 0.0022 + 0.0016 * math.sin(math.pi * u) * math.sin(math.pi * v), fab, inner, thick=0.0014)
        patch(fm, 'flap' + ('R' if sx > 0 else 'L'), [[x0 - 0.003, fy0], [x1 + 0.003, fy0], [x1 + 0.003, fy1], [x0 - 0.003, fy1]], 14, 6,
              lambda u, v: 0.0062 + 0.001 * math.sin(math.pi * u), fab, inner, warp=flap_warp, thick=0.0016)
        rect_stitch(fm, [[x0 - 0.003, fy0], [x1 + 0.003, fy0], [x1 + 0.003, fy1], [x0 - 0.003, fy1]], 0.0062 + 0.0016 + 0.0004, 0.005, warp=flap_warp)
        rect_stitch(fm, [[x0, fy0 - 0.02], [x1, fy0 - 0.02], [x1, fy0 - 0.13], [x0, fy0 - 0.13]], 0.0022 + 0.0014 + 0.0004, 0.004)
        c, n = fm((x0 + x1) / 2, fy1 - 0.008, 0.0062 + 0.0016 + 0.0012); button_obj2('flap-btn' + ('R' if sx > 0 else 'L'), [c], [n], 0.0065, hw, hole)
    front_follow = gscene.follower(P1, P2, D['faces'], set(i for i, nm in enumerate(D['piece_of']) if nm in ('front', 'back')))
    collar(D, P1, P2, fab, inner, front_follow, tip=(0.062, 0.07))
    for nm in ('sleeveR', 'sleeveL'):
        c, d = cuff(D, P2, nm, fab, inner, height=0.05, circ_target=0.27); button_obj2('cuff-btn' + nm[-1], [c], [d], 0.0065, hw, hole)
    body_stitches(D, P2, N2, fm, ('sideR', 'sideL', 'armR', 'armL', 'shoulderR', 'shoulderL'), ('armR', 'armL'))
    stitch_mesh('stitch', (0.32, 0.24, 0.2))
    return finish('trucker')
