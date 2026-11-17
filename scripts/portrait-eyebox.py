# 從眼睛的探測圖（scripts/portrait-eyeprobe.mjs）算眼睛框（2026-11-15 立繪大修）：
# 探測圖和主圖在臉框上半部亮度大幅改變的地方＝眼睛；外框＋留白（寬 12%、高 35%，至少 8 px）。
# 新框沒有完全包住、或明顯小於舊框以外的地方，就換成新框（舊的存 boxes.eyes0），並清掉那個姿勢眨眼影格的 v2（之後重產）。
#   python scripts/portrait-eyebox.py <角色>… [--dry] [--sheet=輸出 jpg]
import json, os, sys
import numpy as np
from PIL import Image, ImageDraw
import scipy.ndimage as nd

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
PROBE = os.path.join(ROOT, 'tools', 'comfyui', 'runtime', 'work', 'eyeprobe')
dry = '--dry' in sys.argv
sheet_out = [a.split('=', 1)[1] for a in sys.argv if a.startswith('--sheet=')]
tiles = []


def run(cid):
    path = os.path.join(ROOT, 'src', 'assets', 'characters', cid, 'card.json')
    card = json.load(open(path, encoding='utf-8'))
    ch = 0
    for P in card['poses']:
        B = P.get('boxes') or {}
        pf = os.path.join(PROBE, f"{cid}_{P['id']}.png")
        if not P.get('master') or 'face' not in B or not os.path.exists(pf):
            continue
        m = np.asarray(Image.open(os.path.join(ROOT, 'tools', 'charwork', cid, P['master'])).convert('RGB')).astype(np.float32) / 255
        p = np.asarray(Image.open(pf).convert('RGB').resize((m.shape[1], m.shape[0]))).astype(np.float32) / 255
        Y = lambda a: a @ np.array([0.299, 0.587, 0.114], np.float32)
        d = np.abs(Y(p) - Y(m)) > 0.2
        fx, fy, fw, fh = B['face']
        reg = np.zeros_like(d)
        # 眼睛在臉框的上 70%（嘴巴的改變不算）
        reg[int(fy):int(fy + fh * 0.7), int(fx - fw * 0.1):int(fx + fw * 1.1)] = True
        d &= reg
        d = nd.binary_opening(d, iterations=1)
        lab, n = nd.label(nd.binary_dilation(d, iterations=4))
        if n == 0:
            print(cid, P['id'], '探測圖沒有改到眼睛，略過')
            continue
        sizes = nd.sum(d, lab, range(1, n + 1))
        keep = [i + 1 for i, s in enumerate(sizes) if s >= max(sizes) * 0.15]
        ys, xs = np.nonzero(np.isin(lab, keep) & d)
        x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
        w, h = x1 - x0, y1 - y0
        px, py = max(8, w * 0.12), max(8, h * 0.35)
        nb = [int(x0 - px), int(y0 - py), int(w + 2 * px), int(h + 2 * py)]
        ob = B['eyes']
        # 舊框有沒有包住新框（眼睛）
        # 眼睛（探測到改變的像素）有多少落在舊框外（扣掉舊框內縮 2 px 的邊）
        eye = np.isin(lab, keep) & d
        inbox = np.zeros_like(eye)
        inbox[max(0, ob[1] + 2):ob[1] + ob[3] - 2, max(0, ob[0] + 2):ob[0] + ob[2] - 2] = True
        outf = float((eye & ~inbox).sum() / max(1, eye.sum()))
        inside = outf <= 0.03
        # 新框比舊框小很多（舊框太大，框到頭髮、鼻子）也換
        # 一律換成「舊框∪新框」往外 8 px（表情的眼睛常比主圖偏一點；框大一點不用重產，影格是整張圖、只有發佈時裁切），
        # 眼睛落在舊框外的姿勢（框外 > 3%）才清掉眨眼影格的 v2 重產
        e0 = B.get('eyes0', ob)
        ux0, uy0 = min(e0[0], nb[0]) - 8, min(e0[1], nb[1]) - 8
        ux1, uy1 = max(e0[0] + e0[2], nb[0] + nb[2]) + 8, max(e0[1] + e0[3], nb[1] + nb[3]) + 8
        # 不要往下蓋到原本的嘴巴
        m0 = B.get('mouth0') or B.get('mouth')
        if m0:
            uy1 = min(uy1, m0[1] - 2)
        ub = [int(ux0), int(uy0), int(ux1 - ux0), int(uy1 - uy0)]
        tag = 'OK' if inside else '換'
        if not dry:
            B.setdefault('eyes0', ob)
            B['eyes'] = ub
            if not inside:
                for k, s in P['ex'].items():
                    if k.endswith(('.e1', '.e2')):
                        s.pop('v2', None)
                ch += 1
        nb = ub
        print(cid, P['id'], tag, f'框外 {outf:.0%}', ob, '→', nb)
        if sheet_out:
            im = Image.fromarray((m * 255).astype(np.uint8))
            dr = ImageDraw.Draw(im)
            dr.rectangle([ob[0], ob[1], ob[0] + ob[2], ob[1] + ob[3]], outline=(255, 0, 0), width=2)
            dr.rectangle([nb[0], nb[1], nb[0] + nb[2], nb[1] + nb[3]], outline=(0, 160, 255), width=2)
            s = max(fw, fh) * 1.3
            cx, cy = fx + fw / 2, fy + fh / 2
            t = im.crop((int(cx - s / 2), int(cy - s / 2), int(cx + s / 2), int(cy + s / 2))).resize((230, 230))
            ImageDraw.Draw(t).text((3, 3), f"{cid} {P['id']} {tag}", fill=(0, 0, 0))
            tiles.append(t)
    if not dry:
        open(path, 'w', encoding='utf-8', newline='\n').write(json.dumps(card, ensure_ascii=False, indent=2) + '\n')
    print(cid, '換框', ch)


for c in [a for a in sys.argv[1:] if not a.startswith('--')]:
    run(c)
if sheet_out and tiles:
    o = Image.new('RGB', (230 * 6, 230 * ((len(tiles) + 5) // 6)), 'white')
    for i, t in enumerate(tiles):
        o.paste(t, (230 * (i % 6), 230 * (i // 6)))
    o.save(sheet_out[0], quality=85)
