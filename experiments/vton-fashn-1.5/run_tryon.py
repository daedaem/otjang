#!/usr/bin/env python3
"""FASHN VTON v1.5 한 장 시험: 생성 시간, 최대 메모리, 비교 이미지, 판정표 초안을 남긴다.

- 모델과 사진은 모두 로컬에서만 다룬다. 실행 중에는 HF_HUB_OFFLINE=1로 네트워크 접근을 막는다.
- 전신 사진 1장과, 그 사진을 포즈 기준으로 상반신만 자른 사진 1장을 차례로 생성한다.
- 한 장 생성이 제한 시간(기본 15분)을 넘거나 메모리가 부족하면 그 시점까지 기록을 쓰고 중단한다.

사용:
  ~/vton-test/.venv/bin/python ~/vton-test/run_tryon.py --person me.jpg --garment top.jpg
"""

import argparse
import json
import os
import platform
import resource
import sys
import threading
import time
from datetime import datetime
from pathlib import Path

VTON_DIR = Path(os.environ.get("VTON_DIR", Path.home() / "vton-test"))
os.environ.setdefault("HF_HOME", str(VTON_DIR / "hf_home"))
os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"

import numpy as np  # noqa: E402
import psutil  # noqa: E402
from PIL import Image, ImageDraw, ImageFont, ImageOps  # noqa: E402

GB = 1024**3


class Recorder:
    """메트릭을 모으고, 상태가 바뀔 때마다 metrics.json을 다시 쓴다."""

    def __init__(self, out_dir: Path, args):
        self.path = out_dir / "metrics.json"
        self.data = {
            "started_at": datetime.now().isoformat(timespec="seconds"),
            "status": "running",
            "platform": platform.platform(),
            "machine": platform.machine(),
            "python": platform.python_version(),
            "total_ram_gb": round(psutil.virtual_memory().total / GB, 1),
            "settings": {
                "num_timesteps": args.num_timesteps,
                "guidance_scale": args.guidance_scale,
                "seed": args.seed,
                "garment_photo_type": args.garment_photo_type,
                "category": "tops",
                "device": "cpu",
                "timeout_min_per_image": args.timeout_min,
            },
            "load_seconds": None,
            "runs": {},
            "peak": {},
            "events": [],
        }
        self.lock = threading.Lock()
        self.write()

    def event(self, msg: str):
        line = f"[{datetime.now().strftime('%H:%M:%S')}] {msg}"
        print(line, flush=True)
        with self.lock:
            self.data["events"].append(line)
        self.write()

    def write(self):
        with self.lock:
            tmp = self.path.with_suffix(".tmp")
            tmp.write_text(json.dumps(self.data, indent=2, ensure_ascii=False))
            tmp.replace(self.path)


class Monitor(threading.Thread):
    """0.5초마다 메모리를 재고, 제한을 넘으면 기록 후 프로세스를 끝낸다."""

    def __init__(self, rec: Recorder, timeout_s: float, min_avail_gb: float, max_swap_growth_gb: float):
        super().__init__(daemon=True)
        self.rec = rec
        self.proc = psutil.Process()
        self.timeout_s = timeout_s
        self.min_avail = min_avail_gb * GB
        self.max_swap_growth = max_swap_growth_gb * GB
        self.swap0 = psutil.swap_memory().used
        self.peak_rss = 0
        self.min_avail_seen = float("inf")
        self.max_swap_growth_seen = 0
        self.phase = "load"
        self.phase_start = time.time()

    def set_phase(self, name: str):
        self.phase, self.phase_start = name, time.time()

    def snapshot(self) -> dict:
        ru = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
        ru_bytes = ru if sys.platform == "darwin" else ru * 1024  # macOS는 byte, Linux는 KB
        return {
            "process_peak_rss_gb": round(self.peak_rss / GB, 2),
            "process_maxrss_gb_getrusage": round(ru_bytes / GB, 2),
            "system_min_available_gb": round(self.min_avail_seen / GB, 2),
            "swap_growth_max_gb": round(self.max_swap_growth_seen / GB, 2),
        }

    def abort(self, status: str, reason: str):
        self.rec.data["status"] = status
        self.rec.data["peak"] = self.snapshot()
        self.rec.event(f"중단 ({self.phase}): {reason}")
        write_report(self.rec.path.parent, self.rec)
        os._exit(3)

    def run(self):
        tick = 0
        while True:
            rss = self.proc.memory_info().rss
            vm, sw = psutil.virtual_memory(), psutil.swap_memory()
            self.peak_rss = max(self.peak_rss, rss)
            self.min_avail_seen = min(self.min_avail_seen, vm.available)
            self.max_swap_growth_seen = max(self.max_swap_growth_seen, sw.used - self.swap0)
            elapsed = time.time() - self.phase_start
            if vm.available < self.min_avail:
                self.abort("aborted_memory", f"사용 가능 메모리 {vm.available / GB:.2f} GB")
            if sw.used - self.swap0 > self.max_swap_growth:
                self.abort("aborted_memory", f"스왑 증가 {(sw.used - self.swap0) / GB:.2f} GB")
            if self.phase.startswith("infer") and elapsed > self.timeout_s:
                self.abort("aborted_timeout", f"{elapsed / 60:.1f}분 경과")
            tick += 1
            if tick % 20 == 0:  # 10초마다 중간 기록 (강제 종료돼도 최대 메모리가 남도록)
                with self.rec.lock:
                    self.rec.data["peak"] = self.snapshot()
                    self.rec.data["last_heartbeat"] = f"{self.phase} {elapsed:.0f}s"
                self.rec.write()
            time.sleep(0.5)


def load_image(path: str) -> Image.Image:
    img = Image.open(path)
    img = ImageOps.exif_transpose(img)  # 휴대폰 사진의 회전 정보 반영
    return img.convert("RGB")


def upper_body_crop(img: Image.Image, pose_model, rec: Recorder) -> Image.Image:
    """목·엉덩이 키포인트로 허벅지 위까지 자르고, 모델 입력 비율(2:3)에 맞춰 폭을 줄인다."""
    W, H = img.size
    pose = pose_model(np.array(img)[..., ::-1])
    body = pose["bodies"]["candidate"]  # OpenPose 18점, 0~1 정규화, 안 보이면 -1
    neck, rhip, lhip = body[1], body[8], body[11]
    hips = [p for p in (rhip, lhip) if p[1] > 0]
    if neck[1] > 0 and hips:
        neck_y = neck[1] * H
        hip_y = np.mean([p[1] for p in hips]) * H
        bottom = int(min(H, hip_y + 0.45 * (hip_y - neck_y)))
        cx = float(np.mean([neck[0]] + [p[0] for p in hips])) * W
        method = "pose"
    else:
        bottom, cx, method = int(H * 0.55), W / 2, "ratio_0.55"
    crop_w = min(W, int(bottom * 2 / 3))
    left = int(min(max(0, cx - crop_w / 2), W - crop_w))
    box = (left, 0, left + crop_w, bottom)
    rec.data["upper_crop"] = {"method": method, "box": box, "source_size": (W, H)}
    rec.event(f"상반신 자르기: {method}, box={box}")
    return img.crop(box)


def labeled_row(images, labels, height=864) -> Image.Image:
    tiles = []
    for im in images:
        w = round(im.width * height / im.height)
        tiles.append(im.resize((w, height), Image.LANCZOS))
    bar, gap = 40, 8
    row = Image.new("RGB", (sum(t.width for t in tiles) + gap * (len(tiles) - 1), height + bar), "white")
    draw = ImageDraw.Draw(row)
    try:
        font = ImageFont.load_default(size=24)
    except TypeError:
        font = ImageFont.load_default()
    x = 0
    for t, lab in zip(tiles, labels):
        row.paste(t, (x, bar))
        draw.text((x + 8, 8), lab, fill="black", font=font)
        x += t.width + gap
    return row


def stack_rows(rows) -> Image.Image:
    W = max(r.width for r in rows)
    out = Image.new("RGB", (W, sum(r.height for r in rows) + 16 * (len(rows) - 1)), "white")
    y = 0
    for r in rows:
        out.paste(r, (0, y))
        y += r.height + 16
    return out


JUDGE_ITEMS = [
    ("얼굴", "원본과 같은 사람으로 보이는가"),
    ("체형", "어깨 너비, 몸통 굵기, 자세가 원본과 같은가"),
    ("색", "옷 사진과 같은 색인가"),
    ("무늬·질감", "원단 느낌과 줄무늬·체크가 유지되는가"),
    ("로고·글자", "제 위치에 있고 읽히는가, 없던 글자가 생기지 않았는가"),
    ("구조", "넥, 소매, 밑단이 그 옷과 같은가"),
    ("경계", "목, 손목, 허리가 자연스러운가"),
    ("배경", "배경이 바뀌지 않았는가"),
    ("종합", "내가 실제로 그 옷을 입은 것 같은가 (본인 판단)"),
]


def write_report(out_dir: Path, rec: Recorder):
    d = rec.data
    setup = {}
    sp = VTON_DIR / "logs" / "setup_metrics.json"
    if sp.exists():
        setup = json.loads(sp.read_text())
    lines = ["# FASHN VTON v1.5 시험 기록", "", f"- 실행: {d['started_at']}, 상태: `{d['status']}`"]
    lines.append(f"- 기기: {d['platform']} / RAM {d['total_ram_gb']} GB / Python {d['python']}")
    if setup:
        lines.append(
            f"- 설치 시간: {setup['seconds']['total'] / 60:.1f}분 "
            f"(코드 {setup['seconds']['code']}초, 패키지 {setup['seconds']['pip']}초, 가중치 {setup['seconds']['weights']}초)"
        )
        lines.append(
            f"- 내려받은 용량: {setup['download_mb']['total']:,} MB "
            f"(패키지 {setup['download_mb']['pip_wheels']:,}, 가중치 {setup['download_mb']['weights']:,}, 코드 {setup['download_mb']['code_repo']:,})"
        )
    lines.append(f"- 모델 적재: {d['load_seconds']}초")
    for name, r in d["runs"].items():
        lines.append(f"- 생성 시간 [{name}]: {r.get('seconds')}초 ({r.get('seconds', 0) / 60:.1f}분), 입력 {r.get('input_size')}")
    p = d["peak"]
    lines.append(
        f"- 최대 메모리: 프로세스 RSS {p.get('process_peak_rss_gb')} GB "
        f"(getrusage {p.get('process_maxrss_gb_getrusage')} GB), 최저 가용 {p.get('system_min_available_gb')} GB, "
        f"스왑 증가 최대 {p.get('swap_growth_max_gb')} GB"
    )
    s = d["settings"]
    lines += [
        f"- 설정: steps {s['num_timesteps']}, guidance {s['guidance_scale']}, seed {s['seed']}, "
        f"garment_photo_type {s['garment_photo_type']}, device {s['device']}",
        "",
        "비교 이미지: `compare.png` (위: 전신, 아래: 상반신)",
        "",
        "## 판정표 (좋음/보통/나쁨, 이유 한 줄)",
        "",
        "| 항목 | 기준 | 전신 | 상반신 | 이유 |",
        "|---|---|---|---|---|",
    ]
    lines += [f"| {k} | {q} |  |  |  |" for k, q in JUDGE_ITEMS]
    (out_dir / "report.md").write_text("\n".join(lines) + "\n")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--person", required=True, help="정면 전신 사진")
    ap.add_argument("--garment", required=True, help="상의 사진")
    ap.add_argument("--garment-photo-type", choices=["flat-lay", "model"], default="flat-lay",
                    help="옷만 찍은 상품·평면 사진은 flat-lay, 모델이 입은 사진은 model")
    ap.add_argument("--weights-dir", default=str(VTON_DIR / "weights"))
    ap.add_argument("--out", default=None, help="결과 폴더 (기본 ~/vton-test/results/<시각>)")
    ap.add_argument("--num-timesteps", type=int, default=30)  # README 기본값
    ap.add_argument("--guidance-scale", type=float, default=1.5)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--timeout-min", type=float, default=15.0)
    ap.add_argument("--min-available-gb", type=float, default=0.5)
    ap.add_argument("--max-swap-growth-gb", type=float, default=3.0)
    ap.add_argument("--skip-upper", action="store_true", help="상반신 시도 생략")
    args = ap.parse_args()

    out_dir = Path(args.out or VTON_DIR / "results" / datetime.now().strftime("%Y%m%d-%H%M%S"))
    out_dir.mkdir(parents=True, exist_ok=True)
    rec = Recorder(out_dir, args)
    mon = Monitor(rec, args.timeout_min * 60, args.min_available_gb, args.max_swap_growth_gb)
    mon.start()

    person = load_image(args.person)
    garment = load_image(args.garment)
    rec.event(f"입력: 사람 {person.size}, 옷 {garment.size}")

    import torch
    from fashn_vton import TryOnPipeline

    rec.data["versions"] = {"torch": torch.__version__, "threads": torch.get_num_threads()}
    t = time.time()
    pipe = TryOnPipeline(weights_dir=args.weights_dir, device="cpu")
    rec.data["load_seconds"] = round(time.time() - t, 1)
    rec.event(f"모델 적재 {rec.data['load_seconds']}초")

    inputs = [("full", person)]
    if not args.skip_upper:
        upper = upper_body_crop(person, pipe.pose_model, rec)
        upper.save(out_dir / "person_upper.png")
        inputs.append(("upper", upper))

    rows = []
    for name, img in inputs:
        mon.set_phase(f"infer:{name}")
        rec.data["runs"][name] = {"input_size": img.size}
        rec.event(f"생성 시작 [{name}]")
        t = time.time()
        result = pipe(
            person_image=img,
            garment_image=garment,
            category="tops",
            garment_photo_type=args.garment_photo_type,
            num_samples=1,
            num_timesteps=args.num_timesteps,
            guidance_scale=args.guidance_scale,
            seed=args.seed,
        )
        sec = round(time.time() - t, 1)
        out_img = result.images[0]
        out_img.save(out_dir / f"result_{name}.png")
        rec.data["runs"][name].update(seconds=sec, output_size=out_img.size)
        rec.data["peak"] = mon.snapshot()
        rec.event(f"생성 완료 [{name}] {sec}초, 출력 {out_img.size}")
        label = "전신" if name == "full" else "상반신"
        rows.append(labeled_row([img, garment, out_img], [f"original ({label})", "garment", "result"]))
        stack_rows(rows).save(out_dir / "compare.png")

    mon.set_phase("done")
    rec.data["status"] = "ok"
    rec.data["peak"] = mon.snapshot()
    rec.event("완료")
    write_report(out_dir, rec)
    print(f"\n결과 폴더: {out_dir}")


if __name__ == "__main__":
    main()
