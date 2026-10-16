# 시험 입력 받기(한 번만): 공개 예제 모델 사진과, 앱 예시 옷장의 '아이비 캠퍼스' 코디 상품 사진.
# Windows 기본 저장 위치는 저장소 밖 D:/ai-outfit/inputs. AI_OUTFIT_DIR로 변경 가능. 상품 사진은 판매처 사진이라 내부 시험으로만 보고 올리지 않는다.
import os, pathlib, urllib.request

DEFAULT_WORK = pathlib.Path('D:/ai-outfit') if os.name == 'nt' else pathlib.Path.home() / 'ai-outfit'
WORK = pathlib.Path(os.environ.get('AI_OUTFIT_DIR', str(DEFAULT_WORK))).expanduser().resolve()
if WORK.is_relative_to(pathlib.Path(__file__).resolve().parents[2]):
    raise ValueError('Keep trial pictures outside the repository')
OUT = WORK / 'inputs'
OUT.mkdir(parents=True, exist_ok=True)
KIT = {
    '1-model-public-example.png': 'https://huggingface.co/spaces/fashn-ai/fashn-vton-1.5/resolve/main/assets/examples/person2.png',
    '2-mine-bottom-wide-chino-beige.jpg': 'https://image.msscdn.net/images/goods_img/20241202/4645906/4645906_17630184287449_500.jpg',
    '3-mine-top-oxford-shirt-white.jpg': 'https://image.msscdn.net/images/goods_img/20180305/728000/728000_17286256542856_500.jpg',
    '4-candidate-outer-harrington-navy.jpg': 'https://image.msscdn.net/thumbnails/images/goods_img/20230525/3323583/3323583_16925736274076_big.jpg?w=600',
}
for name, url in KIT.items():
    path = OUT / name
    if not path.exists():
        req = urllib.request.Request(url, headers={'User-Agent': 'eoul-internal-test/0.1'})
        path.write_bytes(urllib.request.urlopen(req, timeout=60).read())
    print(path, path.stat().st_size, 'bytes')
