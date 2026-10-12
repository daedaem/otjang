# 원단 그림 2판: 실 한 올 단위로 짠 조직을 그려 색(albedo)과 결의 높낮이(노멀맵)를 만든다.
# 옥스퍼드: 색 날실 2올이 굵은 흰(밝은) 씨실 1올 위아래를 함께 지나가는 바스켓 조직. 멀리서 보면 잔잔한 얼룩(헤더)처럼 보인다.
# 반복 크기를 크게(약 10cm) 해서 같은 무늬가 되풀이되는 티를 줄인다. 1px = 0.1mm.
import numpy as np
from PIL import Image, ImageFilter

hexrgb = lambda h: np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)], float)


def _blur_periodic(a, r):
    if r <= 0: return a
    k = np.exp(-np.linspace(-2.5, 2.5, 2 * r + 1) ** 2); k /= k.sum()
    for ax in (0, 1):
        a = sum(np.roll(a, s - r, axis=ax) * k[s] for s in range(2 * r + 1))
    return a


def _streaks(rng, n, length, amp, smooth=6):
    """실 굵기 차이: 실마다(행 또는 열마다) 굵기가 조금씩, 길이 방향으로 천천히 변한다."""
    base = rng.normal(0, 1, (n, length // smooth + 1))
    x = np.linspace(0, base.shape[1] - 1, length)
    out = np.stack([np.interp(x, np.arange(base.shape[1]), row) for row in base])
    out = _blur_periodic(out, 1)
    return out * amp


def oxford(warp='#18213a', weft='#3e4b6e', fleck='#c9cfdc', px=0.0001, W=1024, H=1024, seed=11, weave='oxford', stripe=None, fuzz=0.0, nstrength=0.35, blotk=0.035):
    """반환: albedo(uint8 HxWx3), normal(uint8 HxWx3), 실제 크기(m)."""
    rng = np.random.default_rng(seed)
    cw = 2 if weave != 'twill' else 2                                                  # 날실 한 올 폭(px) = 0.2mm
    yy, xx = np.mgrid[0:H, 0:W]
    # 조직: 날실 2올이 짝을 지어 씨실 1올(굵음: 3px) 위/아래를 번갈아 지난다
    wy = 3 if weave == 'oxford' else 2                                                 # 씨실 폭(px): 옥스퍼드는 굵은 씨실
    if weave == 'hopsack': cw = wy = 3                                                 # 홉색: 굵은 실 2올씩 바둑판(울 재킷)
    col = xx // cw; row = yy // wy
    pair = col // 2
    over = ((pair + row) % 2 == 0)                                                     # True: 날실이 위
    if weave == 'twill': over = ((col + row) % 4 < 3)                                  # 3/1 능직: 사선 결(면 치노·야상)
    if weave == 'hopsack': over = ((col // 2 + row // 2) % 2 == 0)
    # 실 단면 모양(가운데 높고 가장자리 낮음)
    u = (xx % cw + 0.5) / cw; v = (yy % wy + 0.5) / wy
    warp_h = np.sin(np.pi * u) ** 0.7; weft_h = np.sin(np.pi * v) ** 0.7
    # 날실이 위일 때 씨실 쪽으로 휘는 굴곡
    h = np.where(over, 0.55 + 0.45 * warp_h * (0.6 + 0.4 * np.sin(np.pi * v)), 0.45 * weft_h * (0.6 + 0.4 * np.sin(np.pi * u)))
    # 실마다 굵기·색 차이
    warp_var = _streaks(rng, W // cw + 1, H, 1.0, 24)[np.minimum(col, W // cw), yy]        # 날실: 세로로 긴 굵기 변화
    weft_var = _streaks(rng, H // wy + 1, W, 1.0, 40)[np.minimum(row, H // wy), xx]        # 씨실: 가로로 긴 굵기 변화
    c_warp = hexrgb(warp); c_weft = hexrgb(weft); c_fl = hexrgb(fleck)
    if stripe is not None:                                                             # 줄무늬: 날실 색이 띠마다 바뀐다
        period, colors = stripe; band = (xx * px // period).astype(int) % len(colors)
        pal = np.stack([hexrgb(c) for c in colors]); c_warp_px = pal[band]
    else:
        c_warp_px = np.broadcast_to(c_warp, (H, W, 3))
    warp_rgb = c_warp_px * (1 + 0.09 * warp_var[..., None])
    weft_rgb = c_weft * (1 + 0.12 * weft_var[..., None])
    if stripe is not None:                                                             # 줄무늬 띠 안에서는 씨실 사이로 비치는 색이 섞여, 멀리서 띠가 더 또렷이 보인다
        smask = (band == 0)[..., None].astype(float); weft_rgb = weft_rgb * (1 - 0.4 * smask) + pal[0][None, None] * 0.4 * smask
    # 씨실의 흰 섬유가 섞여 보이는 점(헤더)과 굵은 마디(슬럽)
    fl = (rng.random((H // wy + 1, W // 6 + 1)) < 0.02)[np.minimum(row, H // wy), np.minimum(xx // 6, W // 6)]
    weft_rgb = np.where(fl[..., None], weft_rgb * 0.75 + c_fl * 0.25, weft_rgb)
    rgb = np.where(over[..., None], warp_rgb, weft_rgb)
    for _ in range(int(W * H / 42000)):                                                 # 슬럽: 씨실 한 올이 2~5mm 길이로 굵고 밝다
        r0 = rng.integers(0, H // wy); x0 = rng.integers(0, W); L = rng.integers(20, 50)
        ys = slice(r0 * wy, r0 * wy + wy); xs = (np.arange(x0, x0 + L)) % W
        rgb[ys, xs] = rgb[ys, xs] * 0.84 + c_fl * 0.16; h[ys, xs] += 0.2
    # 조직 사이 그늘(실이 겹치는 골)
    ao = 0.82 + 0.18 * h
    rgb = rgb * ao[..., None]
    # 천천히 변하는 염색 얼룩 (1~3cm)
    blot = _blur_periodic(rng.normal(0, 1, (H // 32, W // 32)), 2); blot = np.kron(blot, np.ones((32, 32)))[:H, :W]
    blot = _blur_periodic(blot, 6); rgb = rgb * (1 + blotk * blot / (np.abs(blot).max() + 1e-9))[..., None]
    if fuzz > 0:                                                                       # 울: 잔털이 결을 덮어 부드럽게 흐려지고, 털 끝이 조금 밝게 뜬다
        soft = np.stack([_blur_periodic(rgb[..., k], 3) for k in range(3)], -1)
        hair = _blur_periodic(rng.normal(0, 1, (H, W)), 1); hair = (hair - hair.min()) / (hair.max() - hair.min())
        rgb = rgb * (1 - fuzz) + soft * fuzz; rgb = rgb * (0.96 + 0.08 * hair[..., None])
        h = h * (1 - 0.6 * fuzz) + 0.6 * fuzz * _blur_periodic(h, 3)
    alb = np.clip(rgb, 0, 255).astype(np.uint8)
    # 노멀맵 (높이 → 기울기). 결이 너무 날카롭지 않게 살짝 흐린다
    hs = _blur_periodic(h, 1) * nstrength
    gx = (np.roll(hs, -1, 1) - np.roll(hs, 1, 1)) / 2; gy = (np.roll(hs, -1, 0) - np.roll(hs, 1, 0)) / 2
    n = np.stack([-gx, gy, np.ones_like(hs)], -1); n /= np.linalg.norm(n, axis=-1, keepdims=True)
    nrm = ((n * 0.5 + 0.5) * 255 + 0.5).astype(np.uint8)
    return alb, nrm, (W * px, H * px)


def _normal(h, k):
    hs = _blur_periodic(h, 1) * k
    gx = (np.roll(hs, -1, 1) - np.roll(hs, 1, 1)) / 2; gy = (np.roll(hs, -1, 0) - np.roll(hs, 1, 0)) / 2
    n = np.stack([-gx, gy, np.ones_like(hs)], -1); n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return ((n * 0.5 + 0.5) * 255 + 0.5).astype(np.uint8)


def tartan(sett, colors, px=0.0001, W=1024, H=1024, seed=21, t=3, fuzz=0.25, nstrength=0.4):
    """타탄 체크: 같은 색 줄 순서(sett)를 날실·씨실에 똑같이 쓰고 2/2 능직으로 엮는다. sett: [(색 이름, 실 수), ...] 반쪽(거울로 이어 붙임)."""
    rng = np.random.default_rng(seed)
    seq = sett + sett[::-1]; cols = []
    for c, n in seq: cols += [c] * n
    rep = len(cols) * t                                                               # 반복 길이(px)
    k = max(1, round(W / rep)); scale = W / (k * rep)                                  # 타일 안에 정수 번 반복되게 실 굵기를 살짝 맞춘다
    xs = (np.arange(W) / scale / t).astype(int) % len(cols)
    pal = {c: hexrgb(v) for c, v in colors.items()}
    cx = np.stack([pal[cols[i]] for i in xs]); cy = cx.copy()
    yy, xx = np.mgrid[0:H, 0:W]
    over = (((xx // t) + (yy // t)) % 4 < 2)
    rgb = np.where(over[..., None], cx[None, :, :], cy[:, None, :]).astype(float)
    u = (xx % t + 0.5) / t; v = (yy % t + 0.5) / t
    h = np.where(over, 0.55 + 0.45 * np.sin(np.pi * u) ** 0.7, 0.45 * np.sin(np.pi * v) ** 0.7)
    rgb *= (0.86 + 0.14 * h)[..., None]
    var = _streaks(rng, W // t + 1, H, 1.0, 30)[np.minimum(xx // t, W // t), yy]; rgb *= (1 + 0.05 * var)[..., None]
    if fuzz > 0:                                                                       # 기모(플란넬): 경계가 살짝 번진다
        soft = np.stack([_blur_periodic(rgb[..., c], 2) for c in range(3)], -1); rgb = rgb * (1 - fuzz) + soft * fuzz
        h = h * (1 - 0.5 * fuzz) + 0.5 * fuzz * _blur_periodic(h, 2)
    return np.clip(rgb, 0, 255).astype(np.uint8), _normal(h, nstrength), (W * px, H * px)


def corduroy(base='#3b2022', dark='#1a0d0e', px=0.0001, W=1024, H=1024, wale=0.0032, seed=31):
    """코듀로이: 세로 골(이랑)이 일정 간격으로. 이랑 꼭대기는 털이 서서 밝고, 골은 어둡다."""
    rng = np.random.default_rng(seed); n = round(W * px / wale); per = W / n
    yy, xx = np.mgrid[0:H, 0:W]; f = (xx % per) / per
    ridge = np.clip(np.sin(np.pi * f), 0, 1) ** 0.6; ridge = np.where((f < 0.08) | (f > 0.92), 0.0, ridge)
    pile = _blur_periodic(rng.normal(0, 1, (H, W)), 1); pile = (pile - pile.min()) / (pile.max() - pile.min())
    row = _streaks(rng, n + 1, H, 1.0, 50)[np.minimum((xx / per).astype(int), n), yy]
    b, d = hexrgb(base), hexrgb(dark)
    t = (0.25 + 0.75 * ridge) * (0.9 + 0.2 * pile) * (1 + 0.05 * row)
    rgb = d[None, None] + (b - d)[None, None] * np.clip(t, 0, 1.3)[..., None]
    blot = _blur_periodic(rng.normal(0, 1, (H // 32, W // 32)), 2); blot = np.kron(blot, np.ones((32, 32)))[:H, :W]; blot = _blur_periodic(blot, 6)
    rgb *= (1 + 0.04 * blot / (np.abs(blot).max() + 1e-9))[..., None]
    h = ridge * 0.9 + 0.1 * pile
    return np.clip(rgb, 0, 255).astype(np.uint8), _normal(h, 1.1), (W * px, H * px)


PRESETS2 = {
    'ocbd-navy': dict(warp='#161e36', weft='#2f3b58', fleck='#9aa4ba'),
    'ocbd-white': dict(warp='#f5f4f0', weft='#fcfcfa', fleck='#ffffff', blotk=0.012),
    'ocbd-blue': dict(warp='#6d93c9', weft='#e3e8f0', fleck='#ffffff', blotk=0.018),
    'stripe-blue': dict(warp='#f2f0ea', weft='#fbfaf6', fleck='#ffffff', blotk=0.012, stripe=(0.1024 / 23, ['#4570b8', '#f2f0ea'])),
    'field-olive': dict(warp='#5a6140', weft='#454b2f', fleck='#7d8360', weave='twill', nstrength=0.5),
    'blazer-navy': dict(warp='#1b2442', weft='#222c4b', fleck='#3b4769', weave='hopsack', fuzz=0.45, nstrength=0.4),
    # 사용자 옷 (2026-10-12, 사진 속 색을 참고한 근사치)
    'mine-stripe': dict(warp='#eef1f8', weft='#f7f9fd', fleck='#ffffff', blotk=0.012, stripe=(0.1024 / 26, ['#5277c6', '#eef1f8'])),
    'mine-field': dict(warp='#7c785e', weft='#6a6650', fleck='#99957c', weave='twill', nstrength=0.5),
    'mine-tartan': dict(fn='tartan', sett=[('B', 16), ('K', 3), ('B', 3), ('K', 3), ('B', 3), ('K', 14), ('G', 22), ('K', 3), ('G', 10)],
                        colors=dict(B='#25324a', K='#141918', G='#365c4c')),
    'mine-cord': dict(fn='corduroy', base='#33211d', dark='#120a09'),
}
SHEEN = {'ocbd': dict(k=0.3, rough=0.5), 'stripe': dict(k=0.3, rough=0.5), 'field': dict(k=0.35, rough=0.55), 'blazer': dict(k=0.6, rough=0.75)}


def save(name, out_dir, W=1024):
    P = dict(PRESETS2[name]); fn = {'tartan': tartan, 'corduroy': corduroy}.get(P.pop('fn', None), oxford)
    alb, nrm, (wm, hm) = fn(**P, W=W, H=W)
    Image.fromarray(alb).save(f'{out_dir}/{name}.webp', quality=92)
    Image.fromarray(nrm).save(f'{out_dir}/{name}-n.webp', quality=88)
    return [wm, hm]


if __name__ == '__main__':
    import sys
    out = sys.argv[1] if len(sys.argv) > 1 else '/tmp'
    for k in (sys.argv[2:] or ['ocbd-navy']): print(k, save(k, out))
