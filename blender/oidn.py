# Blender에 들어 있는 OpenImageDenoise(무료)를 직접 불러 구운 라이트맵의 잡티를 지운다.
import ctypes, numpy as np
import os, glob, site, sys
# Blender(bpy) 패키지 안의 OpenImageDenoise 라이브러리를 찾는다. 못 찾으면 OIDN_LIB 환경 변수로 지정한다 (리눅스에서 확인, 맥·윈도는 미확인)
_dirs = [d for d in (site.getsitepackages() + [site.getusersitepackages()] + sys.path) if d and os.path.isdir(d)]
_c = sorted(set(f for d in _dirs for pat in ('bpy/lib/libOpenImageDenoise.so*', 'bpy/lib/libOpenImageDenoise*.dylib', 'bpy/*OpenImageDenoise*.dll', 'bpy/lib/*OpenImageDenoise*.dll')
                for f in glob.glob(os.path.join(d, pat)) if 'core' not in os.path.basename(f) and 'device' not in os.path.basename(f)))
LIB = os.environ.get('OIDN_LIB') or (_c[0] if _c else 'libOpenImageDenoise.so.2')
_l = None


def lib():
    global _l
    if _l is None:
        L = ctypes.CDLL(LIB, mode=ctypes.RTLD_GLOBAL); P, S = ctypes.c_void_p, ctypes.c_size_t
        L.oidnNewDevice.restype = P; L.oidnNewDevice.argtypes = [ctypes.c_int]
        L.oidnCommitDevice.argtypes = [P]
        L.oidnNewFilter.restype = P; L.oidnNewFilter.argtypes = [P, ctypes.c_char_p]
        L.oidnSetSharedFilterImage.argtypes = [P, ctypes.c_char_p, P, ctypes.c_int, S, S, S, S, S]
        L.oidnSetFilterBool.argtypes = [P, ctypes.c_char_p, ctypes.c_bool]
        L.oidnCommitFilter.argtypes = [P]; L.oidnExecuteFilter.argtypes = [P]
        L.oidnGetDeviceError.restype = ctypes.c_int; L.oidnGetDeviceError.argtypes = [P, ctypes.POINTER(ctypes.c_char_p)]
        L.oidnReleaseFilter.argtypes = [P]; L.oidnReleaseDevice.argtypes = [P]
        _l = L
    return _l


def denoise(img, hdr=True):
    """img: float32 (H, W, 3) → 같은 크기의 잡티 지운 그림."""
    L = lib(); a = np.ascontiguousarray(img[..., :3], dtype=np.float32); out = np.zeros_like(a); H, W = a.shape[:2]
    dev = L.oidnNewDevice(1); L.oidnCommitDevice(dev)                                       # 1 = CPU
    f = L.oidnNewFilter(dev, b'RT')
    L.oidnSetSharedFilterImage(f, b'color', a.ctypes.data, 3, W, H, 0, 0, 0)                 # 3 = FLOAT3
    L.oidnSetSharedFilterImage(f, b'output', out.ctypes.data, 3, W, H, 0, 0, 0)
    L.oidnSetFilterBool(f, b'hdr', hdr); L.oidnCommitFilter(f); L.oidnExecuteFilter(f)
    msg = ctypes.c_char_p(); err = L.oidnGetDeviceError(dev, ctypes.byref(msg))
    L.oidnReleaseFilter(f); L.oidnReleaseDevice(dev)
    if err: raise RuntimeError((msg.value or b'').decode())
    return out


if __name__ == '__main__':
    rng = np.random.default_rng(0); y, x = np.mgrid[0:256, 0:256] / 256
    clean = np.stack([0.5 + 0.4 * np.sin(6 * x) * np.cos(4 * y)] * 3, -1).astype(np.float32)
    noisy = clean * rng.gamma(4, 0.25, clean.shape[:2])[..., None].astype(np.float32)
    d = denoise(noisy); print('noisy err', float(np.abs(noisy - clean).mean()), 'denoised err', float(np.abs(d - clean).mean()))
