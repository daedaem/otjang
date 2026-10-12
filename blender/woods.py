# 옷장과 바닥에 쓰는 나무·벽 질감을 만든다 (반복해서 붙이는 작은 그림). Blender 렌더와 웹이 같은 그림을 쓴다.
import numpy as np
from PIL import Image, ImageFilter


def _periodic_noise(rng, H, W, cu, cv, amp):
    """가로 cu, 세로 cv 주기 안에서 반복되는 부드러운 잡음 (타일 경계가 이어진다)."""
    u = np.arange(W)[None, :] / W; v = np.arange(H)[:, None] / H; out = np.zeros((H, W))
    for i in range(1, cu + 1):
        for j in range(0, cv + 1):
            a = rng.normal(0, amp / (i + j))
            out += a * np.sin(2 * np.pi * (i * u + j * v) + rng.uniform(0, 2 * np.pi))
    return out


def grain(rng, H, W, Lv, rings_per_m=320, streak=0.5):
    """나뭇결 무늬 0~1 (가로 방향이 결 방향). 거의 곧은 나이테 띠 + 결 방향으로 긴 물관 자국."""
    v = np.arange(H)[:, None] / H
    vv = v + _periodic_noise(rng, H, W, 4, 2, 0.006)                                    # 아주 조금 휜다
    n = max(8, int(round(rings_per_m * Lv)))
    s = np.sin(2 * np.pi * n * vv + _periodic_noise(rng, H, W, 2, 6, 1.6))              # 나이테 간격이 고르지 않게
    amp = np.clip(0.55 + _periodic_noise(rng, H, W, 1, 9, 0.9), 0.15, 1)                # 띠마다 진하기가 다르게
    band = np.clip((s - 0.1) / 0.9, 0, 1) ** 2 * amp
    pores = rng.normal(0, 1, (H, W)); k = 41                                              # 결 방향으로 길게 번진 잡음
    c = np.cumsum(np.concatenate([pores, pores[:, :k]], 1), 1); pores = (c[:, k:] - c[:, :-k])[:, :W] / k
    pores = (pores - pores.min()) / (pores.max() - pores.min())
    return np.clip(0.6 * band + 0.5 * band * (pores - 0.5) + streak * 0.35 * (pores - 0.5), 0, 1)


def oak(path, W=2048, H=512, Lu=1.2, Lv=0.3, seed=3, base=(206, 174, 130), dark=(166, 128, 86)):
    """밝은 참나무 무늬목. 세로로 3장 이어 붙인 판(색이 조금씩 다름)."""
    rng = np.random.default_rng(seed)
    g = grain(rng, H, W, Lv)
    strip = np.zeros((H, 1)); edges = np.linspace(0, H, 4).astype(int)
    for a, b in zip(edges[:-1], edges[1:]): strip[a:b] = rng.normal(0, 0.035)
    ker = np.exp(-np.linspace(-2, 2, 25) ** 2); ker /= ker.sum()                          # 판 경계를 부드럽게
    strip = np.convolve(np.concatenate([strip[-12:, 0], strip[:, 0], strip[:12, 0]]), ker, 'valid')[:, None]
    low = _periodic_noise(rng, H, W, 3, 2, 0.05)
    b, d = np.array(base, float), np.array(dark, float)
    img = b[None, None] * (1 + strip[..., None] + low[..., None]) * (1 - g[..., None]) + d[None, None] * g[..., None] * (1 + low[..., None])
    for _ in range(int(W * H / 9000)):                                                     # 참나무 특유의 밝은 반점 (방사조직)
        y, x = rng.integers(0, H), rng.integers(0, W); L = rng.integers(6, 26)
        img[y:y + 2, x:x + L] *= 1.06
    Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).save(path)
    return Lu, Lv


def planks(path, W=2048, H=1024, Lu=2.4, Lv=1.08, seed=5, base=(170, 132, 92), dark=(134, 98, 64)):
    """마루: 폭 18cm 판 6줄, 줄마다 이음매 위치가 다르다."""
    rng = np.random.default_rng(seed); n = 6; ph = H // n
    img = np.zeros((H, W, 3))
    for r in range(n):
        y0 = r * ph; joints = sorted(rng.uniform(0, W, rng.integers(1, 3)).astype(int))
        cuts = [0] + joints + [W]
        g = grain(rng, ph, W, Lv / n, rings_per_m=260)
        row = np.zeros((ph, W, 3))
        for a, bnd in zip(cuts[:-1], cuts[1:]):
            k = 1 + rng.normal(0, 0.035); hue = np.array([1, 1 + rng.normal(0, 0.008), 1 + rng.normal(0, 0.015)])
            seg = slice(a, bnd)
            row[:, seg] = (np.array(base) * k * hue)[None, None] * (1 - g[:, seg, None]) + (np.array(dark) * k)[None, None] * g[:, seg, None]
            row[:, max(a - 1, 0):a + 1] *= 0.74                                            # 끝 이음매
        if joints and cuts[-2] < W: pass
        row[:1] *= 0.7; row[-1:] *= 0.8                                                   # 옆 이음매
        img[y0:y0 + ph] = row
    Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).save(path)
    return Lu, Lv


def plaster(path, W=512, H=512, L=0.8, seed=9, base=(234, 229, 220)):
    rng = np.random.default_rng(seed)
    n = _periodic_noise(rng, H, W, 8, 8, 0.012) + rng.normal(0, 0.006, (H, W))
    img = np.array(base, float)[None, None] * (1 + n[..., None])
    Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).save(path)
    return L, L


if __name__ == '__main__':
    import os; T = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'closet', 'tex'); os.makedirs(T, exist_ok=True)
    print(oak(f'{T}/oak.png'), planks(f'{T}/floor.png'), plaster(f'{T}/wall.png'))
