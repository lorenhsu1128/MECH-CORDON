# 眨眼影格補回鏡框（2026-11-16 立繪大修，docs/portrait-design.md）：Qwen 閉眼時常把眼鏡一起拿掉，指示擋不住。
# 鏡框＝主圖和「拿掉眼鏡」的探測圖（scripts/portrait-glassprobe.mjs）差很多、而且主圖比較暗的細線；
# 每個戴眼鏡的姿勢的 e1／e2 影格，鏡框的地方換回那個表情底圖的像素（新檔名加 _g，card 的 pick 改過去）。
#   python scripts/portrait-glasses.py <角色>… [--sheet=<jpg>]
import json, os, sys
import numpy as np
from PIL import Image, ImageDraw
import scipy.ndimage as nd

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
PROBE = os.path.join(ROOT, 'tools', 'comfyui', 'runtime', 'work', 'glassprobe')
sheet = [a.split('=', 1)[1] for a in sys.argv if a.startswith('--sheet=')]
dry = '--dry' in sys.argv
tiles = []


def load(cid, f):
    return np.asarray(Image.open(os.path.join(ROOT, 'tools', 'charwork', cid, f)).convert('RGB')).astype(np.float32) / 255


def run(cid):
    path = os.path.join(ROOT, 'src', 'assets', 'characters', cid, 'card.json')
    card = json.load(open(path, encoding='utf-8'))
    n = 0
    for P in card['poses']:
        pf = os.path.join(PROBE, f"{cid}_{P['id']}.png")
        if not P.get('master') or not os.path.exists(pf):
            continue
        m = load(cid, P['master'])
        g = np.asarray(Image.open(pf).convert('RGB').resize((m.shape[1], m.shape[0]))).astype(np.float32) / 255
        Y = lambda a: a @ np.array([0.299, 0.587, 0.114], np.float32)
        # 鏡框：拿掉眼鏡之後變亮很多（主圖比較暗）的地方，限制在眼睛框附近
        G = (Y(g) - Y(m)) > 0.12
        ex, ey, ew, eh = P['boxes']['eyes']
        reg = np.zeros_like(G)
        reg[max(0, int(ey - eh * 0.6)):int(ey + eh * 1.6), max(0, int(ex - ew * 0.3)):int(ex + ew * 1.3)] = True
        G &= reg
        G = nd.binary_opening(G, iterations=1)
        # 只留細線：主圖暗的地方扣掉「粗的暗塊」（虹膜、瞳孔、睫毛的團塊用半徑 3 的開運算留下來的部分）
        dark = Y(m) < 0.5
        disk = np.hypot(*np.mgrid[-3:4, -3:4]) <= 3
        blob = nd.binary_dilation(nd.binary_opening(dark, structure=disk), iterations=2)
        G &= dark & ~blob
        G = nd.binary_dilation(G, iterations=1) & ~blob
        lab, k = nd.label(G)
        if k == 0:
            continue
        sz = nd.sum(G, lab, range(1, k + 1))
        G = np.isin(lab, [i + 1 for i, s in enumerate(sz) if s >= 25])
        Gs = nd.gaussian_filter(nd.binary_dilation(G, iterations=1).astype(np.float32), 0.6)[..., None]
        for e in ([] if dry else ['neutral'] + [x for x in P['ex'] if '.' not in x]):
            bf = P['master'] if e == 'neutral' else (P['ex'].get(e) or {}).get('pick')
            if not bf:
                continue
            base = load(cid, bf)
            for fid in ('e1', 'e2'):
                s = P['ex'].get(f'{e}.{fid}')
                if not s or not s.get('pick') or s['pick'].endswith('_g.webp'):
                    continue
                fr = load(cid, s['pick'])
                out = fr * (1 - Gs) + base * Gs
                nf = s['pick'].rsplit('.', 1)[0] + '_g.webp'
                Image.fromarray((np.clip(out, 0, 1) * 255 + 0.5).astype(np.uint8)).save(os.path.join(ROOT, 'tools', 'charwork', cid, nf), lossless=True)
                s.setdefault('cands', []).append(nf)
                s['pick'] = nf
                n += 1
        if sheet:
            im = Image.fromarray((m * 255).astype(np.uint8)).convert('RGB')
            ov = np.asarray(im).copy()
            ov[G] = [255, 0, 0]
            t = Image.fromarray(ov).crop((int(ex - ew * 0.3), int(ey - eh * 0.8), int(ex + ew * 1.3), int(ey + eh * 1.8)))
            t = t.resize((300, int(300 * t.height / t.width)))
            ImageDraw.Draw(t).text((3, 3), f"{cid} {P['id']}", fill=(0, 0, 255))
            tiles.append(t)
    open(path, 'w', encoding='utf-8', newline='\n').write(json.dumps(card, ensure_ascii=False, indent=2) + '\n')
    print(cid, '補鏡框的影格', n)


for c in [a for a in sys.argv[1:] if not a.startswith('--')]:
    run(c)
if sheet and tiles:
    W = 300
    H = max(t.height for t in tiles)
    o = Image.new('RGB', (W * 5, H * ((len(tiles) + 4) // 5)), 'white')
    for i, t in enumerate(tiles):
        o.paste(t, (W * (i % 5), H * (i // 5)))
    o.save(sheet[0], quality=85)
