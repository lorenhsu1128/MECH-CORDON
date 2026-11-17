# 去背失敗的主圖修正的最後一步（scripts/portrait-fix.mjs bg 之後）：新主圖＝遮罩裡用原主圖的像素、外面純白
#   python scripts/portrait-bgfix.py <角色> <姿勢> <遮罩 png> <輸出檔名（寫進 tools/charwork/<角色>/）>
import json, os, sys
import numpy as np
from PIL import Image, ImageFilter
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
cid, pid, mpath, outn = sys.argv[1:5]
card = json.load(open(os.path.join(ROOT, 'src/assets/characters', cid, 'card.json'), encoding='utf-8'))
P = [p for p in card['poses'] if p['id'] == pid][0]
old = Image.open(os.path.join(ROOT, 'tools/charwork', cid, P['master'])).convert('RGB')
m = Image.open(mpath).convert('L').resize(old.size)
# 遮罩往外 2 px、羽化 1 px：角色邊緣用原圖（BiRefNet 之後會再去背一次）
m = m.point(lambda v: 255 if v > 100 else 0).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
a = np.asarray(m).astype(np.float32)[..., None] / 255
o = np.asarray(old).astype(np.float32)
res = o * a + 255 * (1 - a)
Image.fromarray(res.astype(np.uint8)).save(os.path.join(ROOT, 'tools/charwork', cid, outn), lossless=True)
print('ok', outn)
