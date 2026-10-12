# 흔들림용 "물리 천"(거친 그물)을 만든다. 축구 게임 유니폼처럼, 보이는 옷은 그대로 두고 이 거친 천만 실시간으로 계산해 보이는 옷이 따라가게 한다.
# 같은 옷본을 2.5cm 간격으로 다시 나눠, 최종(반듯한) 모양 위의 같은 옷본 위치에 놓는다. 꿰맨 점은 하나로 합친다.
import math
import numpy as np
import gpattern, gpdetail


def make_proxy(D, h=0.026):
    kind = D['kind'].split('-')[0]; gpattern.use(kind)
    pieces, seams, info = gpattern.draft_blazer() if kind == 'blazer' else gpattern.draft_shirt()
    M = gpattern.mesh_pieces(pieces, seams, h)
    order = [nm for nm in gpdetail.ORDER if nm in M and nm in D['offs']]
    P = np.asarray(D['pos']); N = gpdetail.vertex_normals(P, D['faces'])
    X, T, piece_of, offs = [], [], [], {}
    for nm in order:
        fm = gpdetail.FlatMap(D, nm, P, N); offs[nm] = len(X)
        X += [fm(x, y, 0.0)[0] for x, y in M[nm]['v2']]; piece_of += [nm] * len(M[nm]['v2'])
        T += [[offs[nm] + i for i in f] for f in M[nm]['faces']]
    X = np.array(X)
    # 꿰맨 점 합치기 (같은 길이로 나눈 두 변을 순서대로 짝짓는다; 방향은 3D 거리로 고른다)
    parent = list(range(len(X)))
    def find(a):
        while parent[a] != a: parent[a] = parent[parent[a]]; a = parent[a]
        return a
    for (pa, sa), (pb, sb) in seams:
        if pa not in offs or pb not in offs: continue
        ia = [offs[pa] + i for i in M[pa]['seg'][sa]]; ib = [offs[pb] + i for i in M[pb]['seg'][sb]]
        if len(ia) != len(ib): continue
        d0 = np.linalg.norm(X[ia] - X[ib], axis=1).mean(); d1 = np.linalg.norm(X[ia] - X[ib[::-1]], axis=1).mean()
        if d1 < d0: ib = ib[::-1]
        for a, b in zip(ia, ib): parent[find(a)] = find(b)
    roots = sorted(set(find(i) for i in range(len(X)))); rid = {r: k for k, r in enumerate(roots)}
    acc = np.zeros((len(roots), 3)); cnt = np.zeros(len(roots))
    for i in range(len(X)): k = rid[find(i)]; acc[k] += X[i]; cnt[k] += 1
    Xp = acc / cnt[:, None]; rp = [rid[find(i)] for i in range(len(X))]
    tris = [[rp[i] for i in t] for t in T]; tris = [t for t in tris if len(set(t)) == 3]
    # 고정점: 옷걸이에 얹힌 어깨 띠와 깃 (옷걸이 폭 안, 어깨선에서 3cm 이내)
    H = gpattern.HANGER; pin = set()
    owner = {}
    for i in range(len(X)): owner.setdefault(rp[i], piece_of[i])
    for k in range(len(Xp)):
        x, y, z = Xp[k]; top = gpattern.top_line(x)
        if owner[k] in ('stand', 'leaf') and y > -0.06: pin.add(k)
        elif abs(x) < H['half'] - 0.01 and y > top - 0.035: pin.add(k)
    return dict(x=np.round(Xp, 4).ravel().tolist(), tri=np.array(tris).ravel().tolist(), pin=sorted(pin), n=len(Xp))


if __name__ == '__main__':
    import sys, pickle, bpy
    bpy.ops.wm.read_factory_settings(use_empty=True)
    gpdetail.build(sys.argv[1], sys.argv[2])
    pr = make_proxy(gpdetail.LAST); print('proxy n', pr['n'], 'tris', len(pr['tri']) // 3, 'pins', len(pr['pin']))
