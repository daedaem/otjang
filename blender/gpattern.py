# 옷본(패턴) 방식으로 옷을 만든다 — 게임·영상 업계(Marvelous Designer, CLO)의 순서를 Blender로 따라 한다.
#   1) 실제 옷처럼 평면 조각(앞판, 뒤판, 소매 2장)을 표준 셔츠 제도 규칙으로 그린다.
#   2) 조각을 몸통 모형 둘레에 배치하고, 꿰맬 가장자리끼리 Blender 천 시뮬레이션의 꿰매기 스프링으로 붙인다(중력 없음).
#   3) 몸통을 빼고 옷걸이에 어깨를 걸어 중력으로 떨어뜨린다. 천의 쉬는 모양은 평면 조각 그대로라 원통 기억이 없다.
# 좌표: 옷 좌표 x 오른쪽, y 위, z 앞(m). Blender로는 B(p) = (x, -z, y). 원점은 옆목점(HPS) 높이의 목 가운데.
# 사용: python gpattern.py <출력 이름> [조각 간격 m] [꿰매기 프레임] [걸기 프레임]
import bpy, bmesh, math, pickle, sys, time
import numpy as np
from mathutils import Vector
from mathutils.geometry import delaunay_2d_cdt

B = lambda p: (p[0], -p[2], p[1])
UB = lambda q: (q[0], q[2], -q[1])


# ───────── 1) 옷본 ─────────
def bez(p0, p1, p2, p3, n=60):
    t = np.linspace(0, 1, n)[:, None]; p0, p1, p2, p3 = map(np.array, (p0, p1, p2, p3))
    return (1 - t) ** 3 * p0 + 3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t ** 2 * p2 + t ** 3 * p3


def curve(fn, a, b, n=60):
    return np.array([fn(t) for t in np.linspace(a, b, n)])


def length(P): return float(np.linalg.norm(np.diff(P, axis=0), axis=1).sum())


def mirror(P): P = np.array(P, float).copy(); P[:, 0] *= -1; return P


COLLAR = dict(h_back=0.033, h_front=0.026, gap=0.012, r_in=0.30, leaf_back=0.046, leaf_front=0.078, point=0.02)
SHIRT = dict(neck_w=0.075, neck_df=0.085, neck_db=0.02, sp=(0.232, -0.048), chest=0.28, ah_y=-0.27, waist=(0.268, -0.45),
             hem_side=(0.272, -0.68), hem_f=-0.77, hem_b=-0.80, sl_len=0.57, bicep=0.39, wrist=0.26, ease=0.01)
FIELD = dict(neck_w=0.085, neck_df=0.07, neck_db=0.025, sp=(0.25, -0.055), chest=0.31, ah_y=-0.29, waist=(0.302, -0.45),
             hem_side=(0.304, -0.785), hem_f=-0.80, hem_b=-0.81, sl_len=0.60, bicep=0.44, wrist=0.30, ease=0.012, placket=0.034)
SHIRT['placket'] = 0.02
# 트러커 재킷(코듀로이): 셔츠 옷본을 짧고 넓게, 밑단은 곧게(허리 밴드가 붙는다)
TRUCKER = dict(neck_w=0.08, neck_df=0.08, neck_db=0.02, sp=(0.245, -0.05), chest=0.295, ah_y=-0.28, waist=(0.29, -0.45), hem_side=(0.29, -0.6),
               hem_f=-0.6, hem_b=-0.6, sl_len=0.6, bicep=0.42, wrist=0.27, ease=0.015, placket=0.022)
BLAZER = dict(neck_w=0.08, neck_df=0.0, neck_db=0.022, sp=(0.24, -0.038), chest=0.27, ah_y=-0.26, waist=(0.252, -0.44), hem_side=(0.264, -0.74),
              hem_f=-0.765, hem_b=-0.74, cut_y=-0.64, sl_len=0.62, bicep=0.37, wrist=0.28, ease=0.03, placket=0.0,
              r1=(0.068, -0.016), break_y=-0.40, gorge_y=-0.105,
              lapel=[(0.10, -0.132), (0.128, -0.15), (0.127, -0.2), (0.106, -0.28), (0.066, -0.35), (0.024, -0.392)])
GARMENTS = {
    'shirt': dict(dims=SHIRT, collar=dict(COLLAR), cloth=dict(mass=0.3, tension=15, shear=5, bend=0.12), hanger=dict(half=0.19, ry=0.011, rz=0.02)),
    'blazer': dict(dims=BLAZER, collar=dict(h_back=0.03, h_side=0.026, h_v=0.006, leaf=0.044, point=0.018, blazer=True),
                   cloth=dict(mass=0.32, tension=40, shear=15, bend=1.4), hanger=dict(half=0.215, ry=0.014, rz=0.026)),
    'trucker': dict(dims=TRUCKER, collar=dict(h_back=0.03, h_front=0.025, gap=0.006, r_in=0.30, leaf_back=0.058, leaf_front=0.088, point=0.028, pieces=False),
                    cloth=dict(mass=0.4, tension=30, shear=10, bend=0.6), hanger=dict(half=0.205, ry=0.012, rz=0.022)),
    'field': dict(dims=FIELD, collar=dict(h_back=0.052, h_front=0.046, gap=0.0, leaf=False),
                  cloth=dict(mass=0.42, tension=30, shear=10, bend=0.3), hanger=dict(half=0.215, ry=0.013, rz=0.026)),
}
KIND = 'shirt'; CLOTH = GARMENTS['shirt']['cloth']; HANGER = GARMENTS['shirt']['hanger']


def use(kind):
    """옷 종류를 고른다 (치수, 깃, 원단 물성, 옷걸이)."""
    global SHIRT, COLLAR, CLOTH, HANGER, KIND
    g = GARMENTS[kind]; SHIRT, COLLAR, CLOTH, HANGER, KIND = g['dims'], g['collar'], g['cloth'], g['hanger'], kind


def draft_shirt(D=None):
    D = D or SHIRT
    """남성 셔츠 M 기준 (완성 가슴둘레 112, 어깨너비 46.4, 앞길이 77, 뒷길이 80, 소매 57+커프스). 반쪽을 그리고 좌우로 뒤집는다."""
    nw, sp, ch, ay = D['neck_w'], D['sp'], D['chest'], D['ah_y']
    neck_f = curve(lambda t: (nw * math.sin(t), -D['neck_df'] * math.cos(t)), 0, math.pi / 2)          # 앞 목둘레: 앞중심 → 옆목점
    neck_b = curve(lambda t: (nw * math.sin(t), -D['neck_db'] * math.cos(t)), 0, math.pi / 2)          # 뒤 목둘레
    shoulder = np.array([[nw, 0.0], list(sp)]); shoulder = np.linspace(shoulder[0], shoulder[1], 40)  # 옆목점 → 어깨끝
    arm_f = bez(sp, (sp[0] - 0.014, -0.12), (sp[0] - 0.007, ay + 0.015), (ch, ay))                     # 앞 진동: 가슴 쪽으로 더 파임
    arm_b = bez(sp, (sp[0] - 0.004, -0.13), (sp[0] + 0.003, ay + 0.015), (ch, ay))                     # 뒤 진동: 덜 파이고 김
    side = np.concatenate([bez((ch, ay), (ch - 0.004, ay - 0.08), (D['waist'][0], D['waist'][1] + 0.06), D['waist'], 30)[:-1],
                           bez(D['waist'], (D['waist'][0], D['waist'][1] - 0.08), (D['hem_side'][0], D['hem_side'][1] + 0.08), D['hem_side'], 30)])
    def hem(y0):                                                                                        # 셔츠 꼬리: 옆이 짧고 가운데가 긴 곡선
        hs = D['hem_side']; xs = np.linspace(hs[0], 0, 80)
        return np.stack([xs, y0 + (hs[1] - y0) * (xs / hs[0]) ** 2.2], 1)
    pieces = {}
    for name, nk, ah, y0 in (('front', neck_f, arm_f, D['hem_f']), ('back', neck_b, arm_b, D['hem_b'])):
        h = hem(y0)
        pieces[name] = [('neckR', nk), ('shoulderR', shoulder), ('armR', ah), ('sideR', side), ('hemR', h),
                        ('hemL', mirror(h)[::-1]), ('sideL', mirror(side)[::-1]), ('armL', mirror(ah)[::-1]), ('shoulderL', mirror(shoulder)[::-1]),
                        ('neckL', mirror(nk)[::-1])]
    # 소매: 소매산 길이 = 진동 둘레 + 여유분이 되도록 소매산 높이를 찾는다 (셔츠는 소매산이 낮다)
    ah_len = length(arm_f) + length(arm_b) + D['ease']; bw = D['bicep'] / 2; ww = D['wrist'] / 2; L = D['sl_len']
    def sleeve(cap):
        top = (0.008, 0.0); uf, ub = (bw, -cap), (-bw, -cap)
        cf = bez(top, (0.075, 0.0), (bw - 0.07, -cap * 0.72), uf)                                         # 앞 소매산
        cb = bez(ub, (-bw + 0.06, -cap * 0.62), (-0.08, 0.0), top)                                         # 뒤 소매산 (더 둥글게)
        return cf, cb, uf, ub
    lo, hi = 0.03, 0.25
    for _ in range(50):
        cap = (lo + hi) / 2; cf, cb, _, _ = sleeve(cap)
        if length(cf) + length(cb) < ah_len: lo = cap
        else: hi = cap
    cf, cb, uf, ub = sleeve(cap); wf, wb = (ww, -L), (-ww, -L)
    under_f = np.linspace(uf, wf, 40); wrist = np.linspace(wf, wb, 30); under_b = np.linspace(wb, ub, 40)
    for nm in ('sleeveR', 'sleeveL'):
        pieces[nm] = [('capF', cf), ('underF', under_f), ('wrist', wrist), ('underB', under_b), ('capB', cb)]
    seams = []
    for sd in 'RL':
        seams += [(('front', 'shoulder' + sd), ('back', 'shoulder' + sd)), (('front', 'side' + sd), ('back', 'side' + sd)),
                  (('front', 'arm' + sd), ('sleeve' + sd, 'capF')), (('back', 'arm' + sd), ('sleeve' + sd, 'capB')),
                  (('sleeve' + sd, 'underF'), ('sleeve' + sd, 'underB'))]
    # 깃: 밴드(스탠드)와 접히는 깃(리프)도 옷본 조각으로 만들어 목둘레에 꿰맨다 (업계 방식)
    Lf, Lb = length(neck_f), length(neck_b); Lt = 2 * (Lf + Lb); g = COLLAR['gap']
    hs = lambda u: COLLAR['h_back'] + (COLLAR['h_front'] - COLLAR['h_back']) * math.cos(math.pi * u / Lt) ** 2            # 밴드 높이: 뒤 3.3cm, 앞 2.6cm
    lo = [np.linspace((a, 0.0), (b, 0.0), 30) for a, b in ((0, Lf), (Lf, Lf + Lb), (Lf + Lb, Lf + 2 * Lb), (Lf + 2 * Lb, Lt))]
    top_pts = lambda a, b: np.array([(u, hs(u)) for u in np.linspace(a, b, 60)])
    pieces['stand'] = [('lo1', lo[0]), ('lo2', lo[1]), ('lo3', lo[2]), ('lo4', lo[3]), ('endL', np.linspace((Lt, 0.0), (Lt, hs(Lt)), 8)),
                       ('topL', top_pts(Lt, Lt - g)), ('topM', top_pts(Lt - g, g)), ('topR', top_pts(g, 0)), ('endR', np.linspace((0.0, hs(0)), (0.0, 0.0), 8))]
    seams += [(('front', 'neckR'), ('stand', 'lo1')), (('back', 'neckR'), ('stand', 'lo2')), (('back', 'neckL'), ('stand', 'lo3')), (('front', 'neckL'), ('stand', 'lo4')),
              (('stand', 'endR'), ('stand', 'endL'))]
    info = dict(cap_height=cap, armhole=ah_len - D['ease'], cap_len=length(cf) + length(cb), neck=Lt)
    if COLLAR.get('pieces') is False:                                                                  # 깃은 꿰매지 않고 나중에 얹는다(셔츠·트러커: 걸린 모양에서 깃을 만든다)
        for k in ('stand', 'leaf'): pieces.pop(k, None)
        seams = [sm for sm in seams if sm[0][0] not in ('stand', 'leaf') and sm[1][0] not in ('stand', 'leaf')]
        return pieces, seams, info
    if COLLAR.get('leaf') is False:                                                                    # 세운 깃(야상): 밴드만
        st = pieces['stand']; pieces['stand'] = [x for x in st if x[0] not in ('topL', 'topM', 'topR')] + []
        pieces['stand'].insert(5, ('topM', top_pts(Lt, 0)))
        return pieces, seams, info
    Ri = COLLAR['r_in']; A = (Lt - 2 * g) / Ri
    H = lambda th: COLLAR['leaf_back'] + (COLLAR['leaf_front'] - COLLAR['leaf_back']) * (abs(th) / (A / 2)) ** 3
    polar = lambda r, th: (r * math.sin(th), -r * math.cos(th))
    fold = np.array([polar(Ri, th) for th in np.linspace(-A / 2, A / 2, 120)])
    pe = lambda sd: polar(Ri + COLLAR['leaf_front'], sd * (A / 2 + COLLAR['point']))                  # 깃 끝 꼭짓점
    frontR = np.linspace(fold[-1], pe(1), 12)
    outer = np.array([polar(Ri + H(th), th) for th in np.linspace(A / 2, -A / 2, 120)]); outer[0] = pe(1); outer[-1] = pe(-1)
    frontL = np.linspace(pe(-1), fold[0], 12)
    pieces['leaf'] = [('fold', fold), ('frontR', frontR), ('outer', outer), ('frontL', frontL)]
    seams += [(('leaf', 'fold'), ('stand', 'topM'))]
    return pieces, seams, info


def draft_blazer(D=None):
    """싱글 블레이저 (M, 완성 가슴둘레 108). 앞판 하나가 가운데에서 이어지고, 위는 V로 트이며(라펠이 접히는 선 = 꺾임선), 아래 가운데는 둥글게 잘려 나간다.
    라펠은 앞판의 꺾임선에 꿰매고, 다림질해 접힌 모양(앞판 위에 누운 모양)을 기억하게 한다. 깃은 목둘레와 V선 윗부분에 꿰맨다."""
    D = D or SHIRT; nw, sp, ch, ay = D['neck_w'], D['sp'], D['chest'], D['ah_y']
    HPS = np.array([nw, 0.0]); R1 = np.array(D['r1']); Bp = np.array([0.0, D['break_y']])
    t = (D['gorge_y'] - Bp[1]) / (R1[1] - Bp[1]); Q = Bp + t * (R1 - Bp)
    roll_lo = np.linspace(Bp, Q, 40)
    neck_f = np.concatenate([np.linspace(Q, R1, 30)[:-1], np.linspace(R1, HPS, 8)])
    neck_b = curve(lambda t: (nw * math.sin(t), -D['neck_db'] * math.cos(t)), 0, math.pi / 2)
    shoulder = np.linspace(HPS, np.array(sp), 40)
    arm_f = bez(sp, (sp[0] - 0.012, -0.11), (sp[0] - 0.006, ay + 0.015), (ch, ay))
    arm_b = bez(sp, (sp[0] - 0.003, -0.12), (sp[0] + 0.004, ay + 0.015), (ch, ay))
    side = np.concatenate([bez((ch, ay), (ch - 0.004, ay - 0.08), (D['waist'][0], D['waist'][1] + 0.06), D['waist'], 30)[:-1],
                           bez(D['waist'], (D['waist'][0], D['waist'][1] - 0.08), (D['hem_side'][0], D['hem_side'][1] + 0.08), D['hem_side'], 30)])
    hs_ = D['hem_side']; hf = D['hem_f']
    hem_front = np.concatenate([bez(hs_, (hs_[0] - 0.08, hf + 0.006), (0.12, hf), (0.06, hf - 0.002), 30)[:-1],
                                bez((0.06, hf - 0.002), (0.025, hf - 0.002), (0.0, hf + 0.06), (0.0, D['cut_y']), 30)])
    hem_back = np.stack([np.linspace(hs_[0], 0, 60), np.full(60, D['hem_b'])], 1)
    pieces = {}
    pieces['front'] = [('rollRlo', roll_lo), ('neckR', neck_f), ('shoulderR', shoulder), ('armR', arm_f), ('sideR', side), ('hemR', hem_front),
                       ('hemL', mirror(hem_front)[::-1]), ('sideL', mirror(side)[::-1]), ('armL', mirror(arm_f)[::-1]), ('shoulderL', mirror(shoulder)[::-1]),
                       ('neckL', mirror(neck_f)[::-1]), ('rollLlo', mirror(roll_lo)[::-1])]
    pieces['back'] = [('neckR', neck_b), ('shoulderR', shoulder), ('armR', arm_b), ('sideR', side), ('hemR', hem_back),
                      ('hemL', mirror(hem_back)[::-1]), ('sideL', mirror(side)[::-1]), ('armL', mirror(arm_b)[::-1]), ('shoulderL', mirror(shoulder)[::-1]),
                      ('neckL', mirror(neck_b)[::-1])]
    sl_pieces, sl_seams, sinfo = draft_sleeves(D, length(arm_f) + length(arm_b))
    pieces.update(sl_pieces)
    L = [np.array(p) for p in D['lapel']]
    gorge = np.linspace(Q, L[0], 12); tip = np.linspace(L[0], L[1], 6)
    edge = np.concatenate([bez(L[1], L[2], L[3], L[4], 30)[:-1], bez(L[4], L[5], (0.006, D['break_y'] - 0.002), Bp, 20)])
    pieces['lapelR'] = [('roll', roll_lo), ('gorge', gorge), ('tip', tip), ('edge', edge)]
    pieces['lapelL'] = [('edge', mirror(edge)[::-1]), ('tip', mirror(tip)[::-1]), ('gorge', mirror(gorge)[::-1]), ('roll', mirror(roll_lo)[::-1])]
    seams = []
    for sd in 'RL':
        seams += [(('front', 'shoulder' + sd), ('back', 'shoulder' + sd)), (('front', 'side' + sd), ('back', 'side' + sd))]
    seams += sl_seams
    seams += [(('front', 'rollRlo'), ('lapelR', 'roll')), (('front', 'rollLlo'), ('lapelL', 'roll'))]
    # 깃: 밴드(목둘레 + V선 윗부분에 꿰맴) + 접히는 깃. 둘 다 다림질한 모양을 기억한다
    C = COLLAR; Lf, Lb = length(neck_f), length(neck_b); Lt = 2 * (Lf + Lb); Lv = float(np.linalg.norm(R1 - Q))
    def hs(u):
        us = min(u, Lt - u); return lerp_(C['h_v'], C['h_side'], smooth_(0, Lv, us)) + (C['h_back'] - C['h_side']) * smooth_(Lv, Lt / 2, us)
    lo = [np.linspace((a, 0.0), (b, 0.0), 30) for a, b in ((0, Lf), (Lf, Lf + Lb), (Lf + Lb, Lf + 2 * Lb), (Lf + 2 * Lb, Lt))]
    pieces['stand'] = [('lo1', lo[0]), ('lo2', lo[1]), ('lo3', lo[2]), ('lo4', lo[3]), ('endL', np.linspace((Lt, 0.0), (Lt, hs(Lt)), 4)),
                       ('topM', np.array([(u, hs(u)) for u in np.linspace(Lt, 0, 120)])), ('endR', np.linspace((0.0, hs(0)), (0.0, 0.0), 4))]
    W, ext = C['leaf'], C['point']
    pieces['leaf'] = [('fold', np.linspace((0.0, 0.0), (Lt, 0.0), 120)), ('endL', np.linspace((Lt, 0.0), (Lt + ext, -W), 6)),
                      ('outer', np.linspace((Lt + ext, -W), (-ext, -W), 120)), ('endR', np.linspace((-ext, -W), (0.0, 0.0), 6))]
    seams += [(('front', 'neckR'), ('stand', 'lo1')), (('back', 'neckR'), ('stand', 'lo2')), (('back', 'neckL'), ('stand', 'lo3')), (('front', 'neckL'), ('stand', 'lo4')),
              (('leaf', 'fold'), ('stand', 'topM'))]
    BLZ.update(Lf=Lf, Lb=Lb, Lt=Lt, Lv=Lv, hs=hs, neck_f=neck_f, neck_b=neck_b, Q=Q, R1=R1, B=Bp)
    info = dict(sinfo, neck=Lt)
    return pieces, seams, info


BLZ = {}
smooth_ = lambda a, b, x: (lambda t: t * t * (3 - 2 * t))(min(1.0, max(0.0, (x - a) / (b - a))))
lerp_ = lambda a, b, t: a + (b - a) * t


def draft_sleeves(D, ah_len0):
    """한 장 소매 (셔츠·재킷 공통). 소매산 길이 = 진동 둘레 + 여유분이 되도록 소매산 높이를 찾는다."""
    ah_len = ah_len0 + D['ease']; bw = D['bicep'] / 2; ww = D['wrist'] / 2; L = D['sl_len']
    def sleeve(cap):
        top = (0.008, 0.0); uf, ub = (bw, -cap), (-bw, -cap)
        cf = bez(top, (0.075, 0.0), (bw - 0.07, -cap * 0.72), uf); cb = bez(ub, (-bw + 0.06, -cap * 0.62), (-0.08, 0.0), top)
        return cf, cb, uf, ub
    lo, hi = 0.03, 0.25
    for _ in range(50):
        cap = (lo + hi) / 2; cf, cb, _, _ = sleeve(cap)
        if length(cf) + length(cb) < ah_len: lo = cap
        else: hi = cap
    cf, cb, uf, ub = sleeve(cap); wf, wb = (ww, -L), (-ww, -L)
    under_f = np.linspace(uf, wf, 40); wrist = np.linspace(wf, wb, 30); under_b = np.linspace(wb, ub, 40)
    pieces = {nm: [('capF', cf), ('underF', under_f), ('wrist', wrist), ('underB', under_b), ('capB', cb)] for nm in ('sleeveR', 'sleeveL')}
    seams = []
    for sd in 'RL':
        seams += [(('front', 'arm' + sd), ('sleeve' + sd, 'capF')), (('back', 'arm' + sd), ('sleeve' + sd, 'capB')), (('sleeve' + sd, 'underF'), ('sleeve' + sd, 'underB'))]
    return pieces, seams, dict(cap_height=cap, armhole=ah_len0, cap_len=length(cf) + length(cb))


# ───────── 2) 조각 → 삼각형 그물 ─────────
def inside(poly, pts):
    x, y = pts[:, 0], pts[:, 1]; res = np.zeros(len(pts), bool); n = len(poly)
    for i in range(n):
        x1, y1 = poly[i]; x2, y2 = poly[(i + 1) % n]
        c = ((y1 > y) != (y2 > y)) & (x < (x2 - x1) * (y - y1) / (y2 - y1 + 1e-12) + x1); res ^= c
    return res


def seg_dist(poly, pts):
    d = np.full(len(pts), 1e9); n = len(poly)
    for i in range(n):
        a, b = poly[i], poly[(i + 1) % n]; ab = b - a; t = np.clip(((pts - a) @ ab) / (ab @ ab + 1e-12), 0, 1)
        d = np.minimum(d, np.linalg.norm(pts - (a + t[:, None] * ab), axis=1))
    return d


def resample(P, n):
    """곡선 P를 길이 기준 n등분 (점 n+1개)."""
    s = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(P, axis=0), axis=1))]); u = np.linspace(0, s[-1], n + 1)
    return np.stack([np.interp(u, s, P[:, 0]), np.interp(u, s, P[:, 1])], 1)


def mesh_pieces(pieces, seams, h):
    """조각마다 경계를 일정 간격으로 나누고(꿰맬 두 변은 같은 개수로) 안쪽을 삼각형으로 채운다."""
    count = {}
    for (pa, sa), (pb, sb) in seams:
        A = dict(pieces[pa])[sa]; Bc = dict(pieces[pb])[sb]; n = max(2, int(math.ceil(max(length(A), length(Bc)) / h)))
        count[(pa, sa)] = count[(pb, sb)] = n
    out = {}
    for name, segs in pieces.items():
        bnd, seg_idx = [], {}
        for sname, P in segs:
            n = count.get((name, sname), max(2, int(math.ceil(length(P) / h))))
            Q = resample(np.asarray(P, float), n); start = len(bnd); bnd.extend(Q[:-1].tolist())
            seg_idx[sname] = [start + k for k in range(n)] + [None]                                # 끝점은 다음 변의 첫 점 (아래에서 채움)
        nb = len(bnd); names = [s for s, _ in segs]
        for i, sname in enumerate(names):
            seg_idx[sname][-1] = seg_idx[names[(i + 1) % len(names)]][0]
        poly = np.array(bnd)
        if np.sum(poly[:, 0] * np.roll(poly[:, 1], -1) - np.roll(poly[:, 0], -1) * poly[:, 1]) < 0: pass   # 방향은 나중에 면 법선으로 맞춘다
        lo, hi = poly.min(0), poly.max(0); dy = h * math.sqrt(3) / 2
        ys = np.arange(lo[1] + dy / 2, hi[1], dy); grid = []
        for k, y in enumerate(ys):
            xs = np.arange(lo[0] + (h / 2 if k % 2 else 0), hi[0], h); grid += [(x, y) for x in xs]
        grid = np.array(grid); keep = inside(poly, grid) & (seg_dist(poly, grid) > 0.55 * h); grid = grid[keep]
        allp = [Vector(p) for p in bnd] + [Vector(p) for p in grid]
        vco, _, faces, orig, _, _ = delaunay_2d_cdt(allp, [], [list(range(nb))], 1, 1e-7)
        remap = {}
        for i, o in enumerate(orig):
            if o: remap[i] = o[0]
        V2 = np.array([[allp[i].x, allp[i].y] for i in range(len(allp))])
        F = [[remap[i] for i in f] for f in faces if all(i in remap for i in f)]
        out[name] = dict(v2=V2, faces=F, seg=seg_idx, nb=nb)
    return out


# ───────── 3) 몸통 모형에 둘러 배치 ─────────
RINGS = [(0.07, 0.05, 0.05), (0.0, 0.053, 0.053), (-0.02, 0.11, 0.058), (-0.042, 0.19, 0.06), (-0.09, 0.195, 0.07), (-0.14, 0.19, 0.095),
         (-0.25, 0.175, 0.115), (-0.45, 0.155, 0.10), (-0.75, 0.17, 0.11), (-0.88, 0.165, 0.105)]
PIN_SETTLE = False
ARM = dict(joint=0.205, jy=-0.075, angle=40, r0=0.05, r1=0.028, length=0.62)


def body_proxy():
    bm = bmesh.new(); N = 48; rings = []
    TILT = {0.07: 0.06, 0.0: 0.065, -0.02: 0.06, -0.042: 0.04, -0.09: 0.02}                            # 목 밑동은 앞이 낮다 (목 앞은 쇄골 사이까지 내려간다)
    for y, a, b in RINGS:
        T = TILT.get(y, 0.0)
        rings.append([bm.verts.new(B((a * math.cos(2 * math.pi * k / N), y - T * 0.8 * max(0.0, math.sin(2 * math.pi * k / N)), b * math.sin(2 * math.pi * k / N)))) for k in range(N)])
    for r in range(len(rings) - 1):
        for k in range(N): bm.faces.new((rings[r][k], rings[r][(k + 1) % N], rings[r + 1][(k + 1) % N], rings[r + 1][k]))
    bm.faces.new(rings[0]); bm.faces.new(rings[-1][::-1])
    for sd in (-1, 1):                                                                                 # 팔: 살짝 벌린 원통
        al = math.radians(ARM['angle']); d = np.array([sd * math.sin(al), -math.cos(al), 0]); e1 = np.array([sd * math.cos(al), math.sin(al), 0]); e2 = np.array([0, 0, 1.0])
        J = np.array([sd * ARM['joint'], ARM['jy'], 0]); ar = []
        for i in range(13):
            t = i / 12; c = J + d * (t * ARM['length'] - 0.02); r = ARM['r0'] + (ARM['r1'] - ARM['r0']) * t
            ar.append([bm.verts.new(B(c + r * (math.cos(2 * math.pi * k / 24) * e1 + math.sin(2 * math.pi * k / 24) * e2))) for k in range(24)])
        for i in range(12):
            for k in range(24): bm.faces.new((ar[i][k], ar[i][(k + 1) % 24], ar[i + 1][(k + 1) % 24], ar[i + 1][k]))
        bm.faces.new(ar[0][::-1]); bm.faces.new(ar[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new('body'); bm.to_mesh(me); bm.free(); ob = bpy.data.objects.new('body', me); bpy.context.scene.collection.objects.link(ob)
    ob.modifiers.new('col', 'COLLISION'); ob.collision.thickness_outer = 0.006; ob.collision.cloth_friction = 2
    return ob


NECK = dict(a=0.064, bf=0.07, bb=0.055, y_cf=-0.083, y_cb=-0.014, lift=0.046)


def neck_ring(n=400):
    """목 밑동을 도는 기운 고리 (앞중심에서 오른쪽으로 돌아 뒤중심까지, 반 바퀴). 길이를 옷본 목둘레에 맞춘다."""
    ph = np.linspace(0, math.pi, n); c = np.cos(ph)
    b = np.where(c > 0, NECK['bf'], NECK['bb'])
    P = np.stack([NECK['a'] * np.sin(ph), NECK['y_cf'] + (NECK['y_cb'] - NECK['y_cf']) * (1 - c) / 2 + NECK['lift'] * np.sin(ph) ** 2, b * c], 1)
    return P


def neck_target(name, v2, half_len):
    """목둘레 점의 목표 위치. 옷본 목둘레의 길이 비율대로 고리 위에 놓는다(늘이거나 줄이지 않게)."""
    R = neck_ring(); sR = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(R, axis=0), axis=1))])
    k = half_len / sR[-1]; R = R * np.array([k, 1, k]); sR = sR * k                                   # 수평 크기를 맞춰 반 바퀴 길이 = 옷본 반쪽 목둘레
    out = []
    nkf = np.array([(SHIRT['neck_w'] * math.sin(t), -SHIRT['neck_df'] * math.cos(t)) for t in np.linspace(0, math.pi / 2, 200)])
    nkb = np.array([(SHIRT['neck_w'] * math.sin(t), -SHIRT['neck_db'] * math.cos(t)) for t in np.linspace(0, math.pi / 2, 200)])
    sf = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(nkf, axis=0), axis=1))]); sb = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(nkb, axis=0), axis=1))])
    for x, y in v2:
        sd = 1 if x >= 0 else -1
        if name == 'front': i = np.argmin(np.linalg.norm(nkf - (abs(x), y), axis=1)); s_ = sf[i]
        else: i = np.argmin(np.linalg.norm(nkb - (abs(x), y), axis=1)); s_ = sf[-1] + (sb[-1] - sb[i])
        p = np.array([np.interp(s_, sR, R[:, j]) for j in range(3)]); p[0] *= sd; out.append(p)
    return np.array(out)


def adjust_neck_blazer(name, v2, P3, seg, reach=0.09):
    """블레이저: 뒤 목둘레와 앞 목둘레(꺾임선 꼭대기 → 옆목점)는 목 고리로, V선 아랫부분(Q까지)은 가슴 위 제자리에서 고리 쪽으로 이어지게."""
    R = neck_ring(); sR = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(R, axis=0), axis=1))]); Lr = 0.21; k = Lr / sR[-1]
    R = R * np.array([k, 1, k]); sR = sR * k
    ring = lambda s_: np.array([np.interp(s_, sR, R[:, j]) for j in range(3)])
    Lb = BLZ['Lb']; idx = seg['neckR'] + seg['neckL']; T = []
    if name == 'back':
        for i in idx:
            x, y = v2[i]; t = math.asin(max(-1, min(1, abs(x) / SHIRT['neck_w']))); s_ = Lr - Lb * (1 - t / (math.pi / 2)) if False else None
            # 뒤 목둘레 곡선 위 길이 → 고리 위 길이 (뒤중심 = Lr)
            nb = BLZ['neck_b']; sb = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(nb, axis=0), axis=1))])
            j = np.argmin(np.linalg.norm(nb - (abs(x), y), axis=1)); p = ring(Lr - sb[j]); p[0] *= 1 if x >= 0 else -1; T.append(p)
    else:
        nf = BLZ['neck_f']; sf = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(nf, axis=0), axis=1))]); Lf = sf[-1]; Lv = BLZ['Lv']
        for i in idx:
            x, y = v2[i]; j = np.argmin(np.linalg.norm(nf - (abs(x), y), axis=1)); s_ = sf[j]; sd = 1 if x >= 0 else -1
            pr = ring(Lr - Lb - (Lf - s_)) if s_ >= Lv else ring(Lr - Lb - (Lf - Lv)); pr[0] *= sd
            if s_ >= Lv: T.append(pr)
            else:                                                                                       # V선: 제자리(가슴)에서 꺾임선 꼭대기(고리)로
                w = s_ / Lv; T.append((1 - w ** 2) * P3[i] + (w ** 2) * pr)
    T = np.array(T); delta = T - P3[idx]
    d = np.linalg.norm(v2[:, None, :] - v2[idx][None, :, :], axis=2); kk = d.argmin(1); dm = d.min(1)
    w = np.clip(1 - dm / reach, 0, 1); w = w * w * (3 - 2 * w)
    return P3 + w[:, None] * delta[kk]


def adjust_neck(name, v2, P3, neck_idx, reach=0.09):
    """조각 윗부분을 목둘레 목표 위치 쪽으로 부드럽게 옮긴다 (목에서 멀수록 덜)."""
    nk = lambda d: length(np.array([(SHIRT['neck_w'] * math.sin(t), -d * math.cos(t)) for t in np.linspace(0, math.pi / 2, 200)]))
    T = neck_target(name, v2[neck_idx], nk(SHIRT['neck_df']) + nk(SHIRT['neck_db'])); delta = T - P3[neck_idx]
    d = np.linalg.norm(v2[:, None, :] - v2[neck_idx][None, :, :], axis=2); k = d.argmin(1); dm = d.min(1)
    w = np.clip(1 - dm / reach, 0, 1) ** 2 * (3 - 2 * np.clip(1 - dm / reach, 0, 1))
    return P3 + w[:, None] * delta[k]


def ring_at(u, Lt):
    """목둘레 고리 위의 점(앞중심에서 오른쪽으로 돌아 둘레 길이 u)과 바깥 방향."""
    R = neck_ring(); sR = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(R, axis=0), axis=1))]); k = (Lt / 2) / sR[-1]
    R = R * np.array([k, 1, k]); sR = sR * k; left = u > Lt / 2; s_ = Lt - u if left else u
    p = np.array([np.interp(s_, sR, R[:, j]) for j in range(3)])
    if left: p[0] *= -1
    o = np.array([p[0], 0, p[2]]); o /= np.linalg.norm(o) + 1e-12
    return p, o


def place_collar(name, v2):
    nk = lambda d: length(np.array([(SHIRT['neck_w'] * math.sin(t), -d * math.cos(t)) for t in np.linspace(0, math.pi / 2, 200)]))
    Lt = 2 * (nk(SHIRT['neck_df']) + nk(SHIRT['neck_db'])); g = COLLAR['gap']; up = np.array([0, 1.0, 0])
    hs = lambda u: COLLAR['h_back'] + (COLLAR['h_front'] - COLLAR['h_back']) * math.cos(math.pi * u / Lt) ** 2
    out = []
    if name == 'stand':
        for u, v in v2:
            p, o = ring_at(min(max(u, 0), Lt), Lt); out.append(p + up * v - o * 0.003 * v / hs(u))
        return np.array(out)
    Ri = COLLAR['r_in']; A = (Lt - 2 * g) / Ri
    for x, y in v2:
        r = math.hypot(x, y); th = math.atan2(x, -y); f = min(max((th + A / 2) / A, 0), 1); u = g + f * (Lt - 2 * g)
        p, o = ring_at(u, Lt); fold = p + up * (hs(u) + 0.002) + o * 0.0005; vo = max(r - Ri, 0)
        out.append(fold + o * (0.004 + 0.2 * vo) - up * (0.96 * vo))
    return np.array(out)


PLACED = {}


class Map3:
    """조각의 평면 좌표 → 배치된 3D 위치 (같은 삼각형 안 무게중심 좌표)."""
    def __init__(self, v2, faces, P3):
        from mathutils.bvhtree import BVHTree
        self.v2, self.faces, self.P3 = np.asarray(v2), faces, np.asarray(P3)
        self.bvh = BVHTree.FromPolygons([Vector((x, y, 0)) for x, y in self.v2], faces)

    def __call__(self, x, y):
        loc, _, idx, _ = self.bvh.find_nearest(Vector((x, y, 0))); a, b, c = self.faces[idx]
        A, Bv, C = self.v2[a], self.v2[b], self.v2[c]; T = np.array([[Bv[0] - A[0], C[0] - A[0]], [Bv[1] - A[1], C[1] - A[1]]])
        try: u, v = np.linalg.solve(T, np.array([x - A[0], y - A[1]]))
        except np.linalg.LinAlgError: u, v = 0.0, 0.0
        w = np.array([1 - u - v, u, v]); p = w @ self.P3[[a, b, c]]
        n = np.cross(self.P3[b] - self.P3[a], self.P3[c] - self.P3[a]); n /= np.linalg.norm(n) + 1e-12
        if n @ np.array([p[0], 0, p[2]]) < 0: n = -n                                                   # 바깥쪽
        return p, n


def blazer_path():
    """깃이 붙는 선(오른쪽 V선 윗부분 → 목둘레 → 왼쪽)을 3D 곡선으로. 평면 길이 기준 매개변수."""
    fm, bm = PLACED['front'], PLACED['back']
    nf, nb = BLZ['neck_f'], BLZ['neck_b']
    seq = [(fm, p) for p in nf] + [(bm, p) for p in nb[::-1]][1:] + [(bm, (-p[0], p[1])) for p in nb][1:] + [(fm, (-p[0], p[1])) for p in nf[::-1]][1:]
    pn = [m_(*p) for m_, p in seq]; pts = [a for a, _ in pn]; nrm = np.array([b for _, b in pn])
    flat = np.concatenate([nf, nb[::-1][1:] * [1, 1], (nb * [-1, 1])[1:], (nf[::-1] * [-1, 1])[1:]])
    sF = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(flat, axis=0), axis=1))]); sF *= BLZ['Lt'] / sF[-1]
    P = np.array(pts)
    def at(u):
        uc = min(max(u, 0.0), BLZ['Lt']); p = np.array([np.interp(uc, sF, P[:, j]) for j in range(3)])
        e = 0.004; a = np.array([np.interp(max(uc - e, 0), sF, P[:, j]) for j in range(3)]); b = np.array([np.interp(min(uc + e, BLZ['Lt']), sF, P[:, j]) for j in range(3)])
        t = b - a; t /= np.linalg.norm(t) + 1e-12
        if u != uc: p = p + t * (u - uc)
        n = np.array([np.interp(uc, sF, nrm[:, j]) for j in range(3)]); n /= np.linalg.norm(n) + 1e-12
        return p, t, n
    return at


def place_blazer(name, v2):
    up = np.array([0, 1.0, 0])
    if name.startswith('lapel'):                                                                    # 앞판 위에 접혀 누운 모양
        fm = PLACED['front']; out = []
        B_, Q_ = BLZ['B'], BLZ['Q']; sd = 1 if name == 'lapelR' else -1; Bq = np.array([sd * Q_[0], Q_[1]]); d = Bq - B_; d /= np.linalg.norm(d)
        for x, y in v2:
            p, n = fm(x, y); dist = abs((x - B_[0]) * d[1] - (y - B_[1]) * d[0])                           # 꺾임선에서 떨어진 거리
            k = min(max((y - B_[1]) / (Q_[1] - B_[1]), 0), 1)                                          # 위로 갈수록 더 들뜬다(롤)
            out.append(p + n * (0.004 + 0.009 * k * math.exp(-dist / 0.018)))
        return np.array(out)
    at = blazer_path(); hs = BLZ['hs']; Lt = BLZ['Lt']; out = []
    def frame(u):
        p, t, n = at(u); o = np.array([p[0], 0, p[2]]); o /= np.linalg.norm(o) + 1e-12
        upp = up - (up @ t) * t; upp /= np.linalg.norm(upp) + 1e-12
        wv = smooth_(BLZ['Lv'] * 0.75, BLZ['Lv'] * 1.25, min(u, Lt - u)); wv = 1 - wv                     # 1: V선(가슴 위), 0: 목둘레
        sd = 1 if p[0] >= 0 else -1; lap = np.cross(n, t); lap = lap if lap[0] * sd > 0 else -lap; lap /= np.linalg.norm(lap) + 1e-12   # 가슴 면을 따라 V선 바깥쪽
        d_st = (1 - wv) * (upp - 0.12 * o) + wv * n; d_st /= np.linalg.norm(d_st) + 1e-12
        hang = (1 - wv) * (-up + 0.3 * o) + wv * (lap - 0.25 * up + 0.08 * n); hang /= np.linalg.norm(hang) + 1e-12
        return p, (1 - wv) * o + wv * n, d_st, hang
    for u, v in v2:
        p, o, d_st, hang = frame(u)
        if name == 'stand': out.append(p + d_st * v)
        else:
            fold = p + d_st * hs(min(max(u, 0), Lt)) + o * 0.003; out.append(fold + hang * (-v) + o * 0.006 * (-v) / 0.044)
    return np.array(out)


def place(name, v2):
    """평면 좌표 → 처음 3D 위치. 앞뒤판은 몸통을 감싸는 원통, 소매는 팔을 감싸는 통으로 만다(원통 기억은 쉬는 모양에 남지 않는다)."""
    if KIND == 'blazer' and (name in ('stand', 'leaf') or name.startswith('lapel')): return place_blazer(name, v2)
    if name in ('stand', 'leaf'): return place_collar(name, v2)
    if KIND == 'blazer' and name in ('front', 'back'):                                               # 재킷: 몸에 가까운 타원 통 (조각을 둘레 길이대로 감는다)
        a_, b_ = 0.215, 0.11; th = np.linspace(-math.pi, math.pi, 2001); ex, ez = a_ * np.sin(th), b_ * np.cos(th)
        sA = np.concatenate([[0], np.cumsum(np.hypot(np.diff(ex), np.diff(ez)))]); sA -= np.interp(0, th, sA)
        t_ = np.interp(v2[:, 0], sA, th); s = 1 if name == 'front' else -1
        return np.stack([a_ * np.sin(t_), v2[:, 1], s * b_ * np.cos(t_)], 1)
    if name in ('front', 'back'):
        R, z0 = 0.2, -0.035; th = v2[:, 0] / R; s = 1 if name == 'front' else -1
        return np.stack([R * np.sin(th), v2[:, 1], s * (z0 + R * np.cos(th))], 1)
    sd = 1 if name == 'sleeveR' else -1; al = math.radians(ARM['angle']); Rs = 0.086
    d = np.array([sd * math.sin(al), -math.cos(al), 0]); e1 = np.array([sd * math.cos(al), math.sin(al), 0]); e2 = np.array([0, 0, 1.0])
    J = np.array([sd * ARM['joint'], ARM['jy'], 0]); phi = v2[:, 0] / Rs
    return J + np.outer(-0.035 - v2[:, 1], d) + Rs * (np.outer(np.cos(phi), e1) + np.outer(np.sin(phi), e2))


# ───────── 4) Blender 천 시뮬레이션 ─────────
def build_mesh(M, seams, pieces_order):
    V3, V2, F, vid, piece_of = [], [], [], {}, []
    offs = {}; ox = 0.0
    for name in pieces_order:
        m = M[name]; base = len(V3); offs[name] = base
        P3 = place(name, m['v2'])
        if name in ('front', 'back'):
            if KIND == 'blazer': P3 = adjust_neck_blazer(name, m['v2'], P3, m['seg'])
            else: P3 = adjust_neck(name, m['v2'], P3, m['seg']['neckR'] + m['seg']['neckL'])
        PLACED[name] = Map3(m['v2'], m['faces'], P3)
        V3 += P3.tolist()
        flat = m['v2'].copy(); flat[:, 0] += ox - flat[:, 0].min(); ox = flat[:, 0].max() + 0.1; V2 += flat.tolist()   # 쉬는 모양: 조각을 평면에 나란히
        F += [[base + i for i in f] for f in m['faces']]; piece_of += [name] * len(m['v2'])
    sew = []
    for (pa, sa), (pb, sb) in seams:
        ia = [offs[pa] + i for i in M[pa]['seg'][sa]]; ib = [offs[pb] + i for i in M[pb]['seg'][sb]]
        if pb.startswith('sleeve') and sb.startswith('cap'):                                       # 진동 ↔ 소매산: 어깨끝이 소매산 꼭대기로
            flip = (pa == 'front') == (sb == 'capB') if sa.endswith('R') else (pa == 'front') == (sb == 'capF')
            flip = (sa.endswith('R') and sb == 'capB') or (sa.endswith('L') and sb == 'capF')
        elif sa == 'underF': flip = True                                                            # 소매 밑선: 겨드랑이끼리, 손목끼리
        elif pb == 'stand' and sb.startswith('lo'): flip = sb in ('lo2', 'lo3')                       # 목둘레 ↔ 밴드 아래선 (뒤판 목둘레는 거꾸로 그렸다)
        elif sa == 'endR': flip = True                                                              # 밴드 양 끝(앞중심)끼리
        elif sa == 'fold': flip = True                                                              # 깃 접힘선 ↔ 밴드 윗선
        else:                                                                                        # 어깨선·옆선: 같은 좌표로 그렸다
            pa0 = M[pa]['v2'][M[pa]['seg'][sa][0]]; pb0 = M[pb]['v2'][M[pb]['seg'][sb][0]]; pb1 = M[pb]['v2'][M[pb]['seg'][sb][-1]]
            flip = np.linalg.norm(pa0 - pb1) < np.linalg.norm(pa0 - pb0)
        if flip: ib = ib[::-1]
        sew += list(zip(ia, ib))
    return np.array(V3), np.array(V2), F, sew, piece_of, offs


PRESSED = ('stand', 'leaf', 'lapelR', 'lapelL')                                                                          # 다림질로 모양이 잡힌 조각: 쉬는 모양 = 처음 만든 3D 모양


def make_object(name, V3, V2, F, sew, rest3=None):
    me = bpy.data.meshes.new(name); edges = [(a, b) for a, b in sew if a != b]
    base = [(p[0], p[1], 0.0) for p in V2]                                                            # 기본 모양 = 평면 옷본 (쉬는 모양)
    if rest3 is not None:
        for i, q in rest3.items(): base[i] = B(q)                                                       # 깃은 접힌 모양을 기억한다
    me.from_pydata(base, edges, F); me.update()
    ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob)
    ob.shape_key_add(name='flat'); k = ob.shape_key_add(name='start'); k.value = 1.0                    # 시작 모양 = 몸에 두른 위치
    for i, p in enumerate(V3): k.data[i].co = B(p)
    return ob


def cloth(ob, frames, pins=None, gravity=True, sew_force=6.0, C=None, stiff=None):
    C = C or CLOTH
    m = ob.modifiers.new('cloth', 'CLOTH'); cs, cc = m.settings, m.collision_settings
    cs.quality = 10; cs.mass = C['mass']; cs.air_damping = C.get('air', 3)
    cs.tension_stiffness = cs.compression_stiffness = C['tension']; cs.shear_stiffness = C['shear']; cs.bending_stiffness = C['bend']
    cs.tension_damping = cs.compression_damping = 6; cs.shear_damping = 6; cs.bending_damping = 0.5
    cs.use_sewing_springs = True; cs.sewing_force_max = sew_force; cs.rest_shape_key = ob.data.shape_keys.key_blocks['flat']
    cs.effector_weights.gravity = 1.0 if gravity else 0.0
    if pins:
        g = ob.vertex_groups.new(name='pin'); g.add(pins, 1.0, 'REPLACE'); cs.vertex_group_mass = 'pin'; cs.pin_stiffness = 1.0
    if stiff:                                                                                            # 심지 든 곳(앞여밈, 목둘레, 소매 끝): 잘 안 접히게
        g = ob.vertex_groups.new(name='stiff')
        for i, wgt in stiff.items(): g.add([i], wgt, 'REPLACE')
        cs.vertex_group_bending = 'stiff'; cs.bending_stiffness_max = C['bend'] * 120
    cc.use_collision = True; cc.distance_min = 0.004; cc.collision_quality = 3; cc.friction = 5
    cc.use_self_collision = True; cc.self_distance_min = 0.003; cc.self_friction = 5
    m.point_cache.frame_start = 1; m.point_cache.frame_end = frames
    return m


def run(ob, frames, label):
    sc = bpy.context.scene; sc.frame_start = 1; sc.frame_end = frames; t0 = time.time()
    for f in range(1, frames + 1):
        sc.frame_set(f)
        if f % 10 == 0: print(f'  {label} {f}/{frames} {time.time() - t0:.0f}s', flush=True)
    dg = bpy.context.evaluated_depsgraph_get(); ev = ob.evaluated_get(dg); n = len(ev.data.vertices)
    co = np.empty(n * 3); ev.data.vertices.foreach_get('co', co); co = co.reshape(n, 3)
    return np.stack([co[:, 0], co[:, 2], -co[:, 1]], 1)


def top_line(x):
    """몸통 어깨 윗선 높이 (옷걸이를 이 아래에 둔다)."""
    xs = [0.0, 0.055, 0.11, 0.19, 0.24]; ys = [0.0, 0.0, -0.02, -0.042, -0.058]                    # 몸통 모형 어깨 윗선 (셔츠 어깨선 기울기와 맞춤)
    return np.interp(abs(x), xs, ys)


def hanger(half=None, ry=None, rz=None, name='hanger'):
    half = half or HANGER['half']; ry = ry or HANGER['ry']; rz = rz or HANGER['rz']
    bm = bmesh.new(); N, Mr = 40, 12; rings = []
    for a in range(N + 1):
        x = -half + 2 * half * a / N; y = top_line(x) - ry - 0.006; k = 1 - 0.3 * (abs(x) / half) ** 4
        rings.append([bm.verts.new(B((x, y + ry * k * math.sin(2 * math.pi * m / Mr), rz * k * math.cos(2 * math.pi * m / Mr)))) for m in range(Mr)])
    for a in range(N):
        for m in range(Mr): bm.faces.new((rings[a][m], rings[a][(m + 1) % Mr], rings[a + 1][(m + 1) % Mr], rings[a + 1][m]))
    bm.faces.new(rings[0][::-1]); bm.faces.new(rings[N]); bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free(); ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob)
    for p in me.polygons: p.use_smooth = True
    return ob


def orient_faces(P, F, piece_of):
    """면 방향을 바깥(몸통 축에서 멀어지는 쪽)으로 맞춘다. 조각마다 다수결."""
    F = [list(f) for f in F]; byp = {}
    for fi, f in enumerate(F): byp.setdefault(piece_of[f[0]], []).append(fi)
    for name, fis in byp.items():
        votes = 0
        for fi in fis:
            a, b, c = (P[i] for i in F[fi][:3]); n = np.cross(b - a, c - a); ctr = (a + b + c) / 3
            if not name.startswith('sleeve'): out = np.array([ctr[0], 0, ctr[2]])
            else:
                sd = 1 if name == 'sleeveR' else -1; al = math.radians(ARM['angle']); d = np.array([sd * math.sin(al), -math.cos(al), 0])
                J = np.array([sd * ARM['joint'], ARM['jy'], 0]); w = ctr - J; out = w - d * (w @ d)
            votes += 1 if n @ out > 0 else -1
        if votes < 0:
            for fi in fis: F[fi] = F[fi][::-1]
    return F


def simulate(name, h=0.012, sew_frames=45, hang_frames=70, settle_frames=40, kind='shirt'):
    use(kind)
    pieces, seams, dinfo = (draft_blazer() if KIND == 'blazer' else draft_shirt()); print('draft', {k: round(v, 4) for k, v in dinfo.items()})
    M = mesh_pieces(pieces, seams, h); order = [nm for nm in ['front', 'back', 'sleeveR', 'sleeveL', 'lapelR', 'lapelL', 'stand', 'leaf'] if nm in pieces]
    V3, V2, F, sew, piece_of, offs = build_mesh(M, seams, order)
    F = orient_faces(V3, F, piece_of)
    print('verts', len(V3), 'faces', len(F), 'sew pairs', len(sew))
    stiff = {}
    fv2 = M['front']['v2']
    for i, (x, y) in enumerate(fv2):
        if abs(x) < SHIRT['placket'] and y < -SHIRT['neck_df'] + 0.01: stiff[offs['front'] + i] = 0.33    # 앞여밈(단추 단)
    # 목둘레는 뻣뻣하게 하지 않는다: 평평한 옷본의 목둘레가 목을 감싸려면 원뿔처럼 휘어야 하는데, 뻣뻣하면 깔때기처럼 선다(2026-10-12 확인)
    for nm in ('sleeveR', 'sleeveL'):                                                                  # 소매 끝(커프스가 붙는 곳)
        v2 = M[nm]['v2']
        for i in np.where(v2[:, 1] < -SHIRT['sl_len'] + 0.025)[0]: stiff[offs[nm] + int(i)] = 0.33
    for nm in [x for x in ('stand', 'leaf', 'lapelR', 'lapelL') if x in M]:                            # 깃·라펠: 심지가 들어 가장 뻣뻣하다
        for i in range(len(M[nm]['v2'])): stiff[offs[nm] + i] = 1.0
    if KIND == 'blazer':                                                                               # 재킷: 앞판 전체에 심지(캔버스), 어깨에 패드
        for nm, base_w in (('front', 0.5), ('back', 0.2)):
            v2 = M[nm]['v2']; sl = np.interp(np.abs(v2[:, 0]), [0, SHIRT['neck_w'], SHIRT['sp'][0]], [0, 0, SHIRT['sp'][1]])
            for i, (x, y) in enumerate(v2):
                w = base_w + (1 - base_w) * smooth_(0.07, 0.0, sl[i] - y) * smooth_(0.06, 0.14, abs(x))
                stiff[offs[nm] + i] = max(stiff.get(offs[nm] + i, 0), w)
        for nm in ('sleeveR', 'sleeveL'):                                                              # 소매산 둥근 모양(슬리브 헤드)
            v2 = M[nm]['v2']
            for i in np.where(v2[:, 1] > -0.06)[0]: stiff[offs[nm] + int(i)] = max(stiff.get(offs[nm] + int(i), 0), 0.6)
    # 2-1) 몸통에 둘러 꿰매기 (중력 없음)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    rest3 = {i: V3[i] for i, nm in enumerate(piece_of) if nm in PRESSED}
    neck_pins = sorted(set(offs[nm] + i for nm in ('front', 'back') for s_ in ('neckR', 'neckL') for i in M[nm]['seg'][s_]))
    collar_pins = sorted(set(offs['stand'] + i for s_ in ('topL', 'topM', 'topR') if s_ in M['stand']['seg'] for i in M['stand']['seg'][s_])) if 'stand' in M else []
    hang_neck = [] if 'stand' in M else neck_pins[:]                                                    # 깃 조각이 없으면 옷걸이에서는 목둘레를 잡는다 (셔츠 pshirt-11과 같은 방식)
    neck_pins = sorted(set(neck_pins) | set(collar_pins))
    body = body_proxy(); ob = make_object('shirt', V3, V2, F, sew, rest3)
    cloth(ob, sew_frames, gravity=False, sew_force=12.0, stiff=stiff, pins=neck_pins)
    P1 = run(ob, sew_frames, 'sew')
    gap = np.array([np.linalg.norm(P1[a] - P1[b]) for a, b in sew]); print('seam gap mean/max mm', round(gap.mean() * 1000, 1), round(gap.max() * 1000, 1))
    # 2-1b) 중력을 켜고 몸통 위에 내려앉힌다 (어깨에 얹히고 목둘레가 제자리로 내려온다)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    body = body_proxy(); ob = make_object('shirt', P1, V2, F, sew, rest3)
    cloth(ob, settle_frames, gravity=True, sew_force=12.0, stiff=stiff, pins=neck_pins if PIN_SETTLE else collar_pins)   # 깃 밴드 윗선만 잡고 내려앉힌다
    P1sew = P1; P1 = run(ob, settle_frames, 'settle')
    # 2-2) 몸통을 빼고 옷걸이에 건다 (중력 있음). 어깨선 가까이(옷걸이 폭 안)와 목둘레를 고정
    bpy.ops.wm.read_factory_settings(use_empty=True)
    hg = hanger(); hg.modifiers.new('col', 'COLLISION'); hg.collision.thickness_outer = 0.004; hg.collision.cloth_friction = 10
    ob = make_object('shirt', P1, V2, F, sew, rest3)
    pins = []
    for nm in ('front', 'back'):
        m = M[nm]; base = offs[nm]; v2 = m['v2']
        sl = np.interp(np.abs(v2[:, 0]), [0, SHIRT['neck_w'], SHIRT['sp'][0]], [0, 0, SHIRT['sp'][1]])          # 그 x에서 어깨선 높이
        for i, (x, y) in enumerate(v2):
            if abs(x) < HANGER['half'] - 0.012 and (sl[i] - y) < 0.022 and abs(x) > 0.03: pins.append(base + i)
    pins = sorted(set(pins) | set(collar_pins) | set(hang_neck))                                   # 옷걸이에서는 깃 밴드 윗선(또는 목둘레)과 어깨선이 받친다
    cloth(ob, hang_frames, pins=pins, gravity=True, sew_force=12.0, stiff=stiff)
    P2 = run(ob, hang_frames, 'hang')
    seg = {nm: M[nm]['seg'] for nm in order}
    D = dict(kind=KIND + '-pattern', dims=dict(SHIRT), collar=dict(COLLAR), hanger=dict(HANGER), V2=V2, P1=P1, P1sew=P1sew, pos=P2, faces=F, sew=sew, piece_of=piece_of, offs=offs, seg=seg, pins=pins, draft=dinfo,
             uv={nm: M[nm]['v2'] for nm in order}, h=h, stiff=stiff)
    import os; os.makedirs(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'cache'), exist_ok=True); out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'cache', f'{name}.pkl'); pickle.dump(D, open(out, 'wb')); print('saved', out)
    return out


if __name__ == '__main__':
    name = sys.argv[1] if len(sys.argv) > 1 else 'pshirt-1'
    a = sys.argv
    simulate(name, float(a[2]) if len(a) > 2 else 0.012, int(a[3]) if len(a) > 3 else 45, int(a[4]) if len(a) > 4 else 70,
             int(a[5]) if len(a) > 5 else 40, a[6] if len(a) > 6 else ('field' if name.startswith('pfield') else 'blazer' if name.startswith('pblazer') else 'shirt'))
