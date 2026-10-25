"""Put my photo, the garment, the AI result and the real worn photo side by side.

Runs offline with Pillow only. Inputs and output stay on this computer.
"""
import argparse
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps

LABELS = ["내 사진", "옷", "AI 결과", "실제로 입은 사진"]
PANEL_HEIGHT = 768
GAP = 16
CAPTION = 44


def load(path):
    image = Image.open(Path(path).expanduser())
    image = ImageOps.exif_transpose(image).convert("RGB")
    width = round(image.width * PANEL_HEIGHT / image.height)
    return image.resize((width, PANEL_HEIGHT), Image.LANCZOS)


def font():
    for name in ("malgun.ttf", "AppleSDGothicNeo.ttc", "NotoSansCJK-Regular.ttc"):
        try:
            return ImageFont.truetype(name, 26)
        except OSError:
            continue
    return ImageFont.load_default()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("me", "garment", "result", "real"):
        parser.add_argument(f"--{name}", required=name != "real")
    parser.add_argument("--out", required=True)
    args = parser.parse_args()

    paths = [args.me, args.garment, args.result, args.real]
    panels = [(label, load(path)) for label, path in zip(LABELS, paths) if path]
    width = sum(p.width for _, p in panels) + GAP * (len(panels) + 1)
    sheet = Image.new("RGB", (width, PANEL_HEIGHT + CAPTION + GAP * 2), "white")
    draw = ImageDraw.Draw(sheet)
    text_font = font()
    x = GAP
    for label, panel in panels:
        sheet.paste(panel, (x, GAP))
        draw.text((x, GAP + PANEL_HEIGHT + 8), label, fill="black", font=text_font)
        x += panel.width + GAP

    out = Path(args.out).expanduser()
    out.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out)
    print(out)


if __name__ == "__main__":
    main()
