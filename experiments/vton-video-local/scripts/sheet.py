# 비교판: 사람 | 옷 | 착용 결과 (+ 영상이 있으면 처음·중간·끝 장면)
# 사용: python sheet.py <결과 jpg> <제목> <사람> <옷> <착용 결과> [영상 mp4]
import sys
import imageio.v3 as iio
from PIL import Image, ImageDraw, ImageFont

out, title, *paths = sys.argv[1:]
video = paths[3] if len(paths) > 3 else None
H = 520
def fit(im):
    im = im.convert('RGB')
    return im.resize((max(1, int(im.width * H / im.height)), H))
cols = [(n, fit(Image.open(p))) for n, p in zip(['사람', '옷', '착용 결과'], paths[:3])]
if video:
    frames = iio.imread(video)
    for n, i in [('영상 처음', 0), ('영상 중간', len(frames) // 2), ('영상 끝', len(frames) - 1)]:
        cols.append((n, fit(Image.fromarray(frames[i]))))
try:
    from common import WORK
    font = ImageFont.truetype(str(WORK / 'NanumGothic-Regular.ttf'), 22)  # 한글 글꼴(선택). 없으면 기본 글꼴
except Exception:
    font = ImageFont.load_default()
W = sum(im.width for _, im in cols) + 12 * (len(cols) + 1)
sheet = Image.new('RGB', (W, H + 80), 'white')
d = ImageDraw.Draw(sheet)
d.text((12, 8), title, fill='black', font=font)
x = 12
for name, im in cols:
    d.text((x, 42), name, fill='#444', font=font)
    sheet.paste(im, (x, 72))
    x += im.width + 12
sheet.save(out, quality=88)
print(out, sheet.size)
