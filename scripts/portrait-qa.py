# 立繪影格的自動品管（2026-11-15 立繪大修，docs/portrait-design.md）：
# 讀角色的 card.json 與候選資料夾（tools/charwork/<id>/）裡選定的圖，每個影格（眨眼 e1／e2、嘴型 m1～m3）和它的表情底圖比較：
#   chg   眼睛／嘴巴範圍裡改了多少（太少＝沒閉眼、沒張嘴）
#   out   範圍外改了多少（應該是 0）
#   alien 改過的像素裡「原本的臉上沒有的顏色」比例（綠色愛心、條碼、色塊）
#   side  e2 的左右兩半改了多少的比例（一邊很少＝只閉一隻眼）
# 輸出 test-results/portrait-qa/<id>.json 與總表 <id>_<姿勢>.jpg（每行一個表情：底圖、e1、e2、m1、m2、m3）
#   python scripts/portrait-qa.py echo [mira …]   （用有 numpy、Pillow 的 Python）
import json, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
CH = os.path.join(ROOT, 'src', 'assets', 'characters')
WK = os.path.join(ROOT, 'tools', 'charwork')
OUT = os.path.join(ROOT, 'test-results', 'portrait-qa')
os.makedirs(OUT, exist_ok=True)
try:
    FONT = ImageFont.truetype(r'C:\Windows\Fonts\msjh.ttc', 13)
except Exception:
    FONT = ImageFont.load_default()
FR = ['e1', 'e2', 'm1', 'm2', 'm3']
_c = {}


def load(cid, f):
    k = (cid, f)
    if k not in _c:
        if len(_c) > 60:
            _c.clear()
        _c[k] = np.asarray(Image.open(os.path.join(WK, cid, f)).convert('RGB')).astype(np.float32) / 255
    return _c[k]


def palette(img, box, n=28):
    x, y, w, h = [int(v) for v in box]
    im = Image.fromarray((img[y:y + h, x:x + w] * 255).astype(np.uint8)).quantize(colors=n, method=Image.Quantize.MEDIANCUT)
    p = np.array(im.getpalette()[:n * 3], np.float32).reshape(-1, 3) / 255
    return p


MOUTH = np.array([[0.55, 0.12, 0.15], [0.85, 0.35, 0.40], [0.95, 0.6, 0.62], [0.35, 0.05, 0.08]], np.float32)


def hsv(a):
    mx, mn = a.max(-1), a.min(-1)
    d = mx - mn + 1e-6
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    h = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) / 6
    return h, d / (mx + 1e-6), mx


def metrics(base, cand, inner, pal, fid, mbox=None):
    H, W = base.shape[:2]
    x, y, w, h = [int(round(v)) for v in inner]
    x0, y0, x1, y1 = max(0, x), max(0, y), min(W, x + w), min(H, y + h)
    d = np.abs(cand - base).max(-1)
    ch = d > 0.07
    ins = np.zeros_like(ch)
    ins[max(0, y0 - 3):y1 + 3, max(0, x0 - 3):x1 + 3] = True
    r = {}
    r['out'] = float(ch[~ins].mean())
    ci = ch[y0:y1, x0:x1]
    r['chg'] = float(ci.mean())
    px = cand[y0:y1, x0:x1][ci]
    if len(px):
        # 外來的顏色：飽和、而且色相和臉上（＋嘴巴裡常見的紅、粉紅）任何飽和的顏色都差很遠（綠色愛心、青色斑點、黃色塊）
        P = np.vstack([pal, MOUTH]) if fid[0] == 'm' else pal
        hp, sp, _ = hsv(P)
        hp = hp[sp > 0.22]
        h, s, v = hsv(px)
        sat = (s > 0.35) & (v > 0.2)
        if len(hp):
            dh = np.abs(h[:, None] - hp[None])
            dh = np.minimum(dh, 1 - dh).min(1)
            far = dh > 30 / 360
        else:
            far = np.ones(len(px), bool)
        r['alien'] = float((sat & far).mean())
    else:
        r['alien'] = 0.0
    # 殘線：底圖在範圍裡的深色線條（原本的嘴、眼線）在影格裡沒被改到，而且離這一格改過的地方（新的嘴、閉眼線）超過 5 px
    # ——新的嘴比原本小時，原本嘴角的弧線常常留著（2026-11-15 使用者：再淡的殘留也不行）
    import scipy.ndimage as nd
    bi = base[y0:y1, x0:x1]
    Lb = bi @ np.array([0.299, 0.587, 0.114], np.float32)
    around = np.median(Lb)
    line = Lb < around - 0.18
    near = nd.binary_dilation(ci, iterations=5)
    r['resid'] = 0
    if fid[0] == 'm' and mbox is not None:
        # 只看「原本那張嘴」：和原本的小嘴框相交的深色線條
        lab, n = nd.label(nd.binary_dilation(line, iterations=1))
        mx, my, mw, mh = [int(round(v)) for v in mbox]
        cx0, cy0 = max(0, mx - x0), max(0, my - y0)
        hit = set(np.unique(lab[cy0:cy0 + mh, cx0:cx0 + mw])) - {0}
        mouth = np.isin(lab, list(hit)) & line
        left = mouth & ~ci & ~near
        r['resid'] = int(left.sum())
    if fid[0] == 'e':
        mid = (x1 - x0) // 2
        co = d[y0:y1, x0:x1] > 0.22  # 強烈的改變（線條、虹膜）
        a, b = co[:, :mid].mean(), co[:, mid:].mean()
        r['side'] = float(min(a, b) / max(1e-6, max(a, b)))
        # 留下的虹膜：虹膜色＝底圖裡「被大幅改掉而且飽和」的像素的中位數，閉眼之後框裡還剩多少那個顏色（和底圖比）
        bb = base[y0:y1, x0:x1]
        cc = cand[y0:y1, x0:x1]
        _, sb, vb = hsv(bb)
        src = co & (sb > 0.3) & (vb > 0.25)
        if src.sum() > 30:
            hb = hsv(bb)
            ih = np.median(hb[0][src])

            def near(im):
                h, s_, v = hsv(im) if im is not bb else hb
                dh = np.abs(h - ih)
                return (np.minimum(dh, 1 - dh) < 18 / 360) & (s_ > 0.3) & (v > 0.2)

            nb = near(bb).sum()
            r['iris'] = float(near(cc).sum() / max(1, nb))
    return r


def crop(img, box, k=1.25, size=210):
    x, y, w, h = box
    cx, cy = x + w / 2, y + h / 2
    s = max(w, h) * k
    x0, y0 = int(cx - s / 2), int(cy - s / 2)
    im = Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8))
    return im.crop((x0, y0, x0 + int(s), y0 + int(s))).resize((size, size), Image.LANCZOS)


def judge(fid, r, closed):
    """回傳失敗的原因（空的＝通過）"""
    bad = []
    if r['out'] > 0.002:
        bad.append('out')
    if r['alien'] > 0.03:
        bad.append('alien')
    if fid == 'e2' and not closed:
        if r['chg'] < 0.10:
            bad.append('nochg')
        if r.get('side', 1) < min(0.35, r.get('sideMed', 1) * 0.5):
            bad.append('oneeye')
    if fid == 'e1' and not closed and r['chg'] < 0.03:
        bad.append('nochg')
    if fid[0] == 'm' and r['chg'] < 0.015:
        bad.append('nochg')
    return bad


def run(cid, only_v2=True):
    card = json.load(open(os.path.join(CH, cid, 'card.json'), encoding='utf-8'))
    exprs = ['neutral'] + [e['id'] for e in _exprs(card)]
    rep = {}
    for P in card['poses']:
        if not P.get('master') or not P.get('boxes', {}).get('face'):
            continue
        B = P['boxes']
        rows = []
        for e in exprs:
            bf = P['master'] if e == 'neutral' else (P['ex'].get(e) or {}).get('pick')
            if not bf:
                continue
            base = load(cid, bf)
            pal = palette(base, B['face'])
            cells = [label(crop(base, B['face']), e)]
            closed = e in ['laugh', 'wink'] + (P.get('noBlink') or [])  # 不眨眼的表情（pipeline.js 的 noBlink）
            for fid in FR:
                if closed and fid[0] == 'e':
                    cells.append(label(Image.new('RGB', (210, 210), (40, 40, 40)), fid + ' 不眨眼'))
                    continue
                s = P['ex'].get(e + '.' + fid) or {}
                if s.get('skip'):  # 放棄的格子：不發佈，播放器用另一格代替
                    cells.append(label(Image.new('RGB', (210, 210), (40, 40, 40)), fid + ' 略過'))
                    continue
                if not s.get('pick') or (only_v2 and not s.get('v2')):
                    cells.append(label(Image.new('RGB', (210, 210), (40, 40, 40)), fid + ' -'))
                    continue
                cand = load(cid, s['pick'])
                inner = B['eyes'] if fid[0] == 'e' else (P['ex'].get(e) or {}).get('mb') or B['mouth']
                # 臉上的顏色＋這個範圍自己的顏色（眼睛的虹膜很小，整張臉取的色盤常常沒有它）
                r = metrics(base, cand, inner, np.vstack([pal, palette(base, inner, 16)]), fid, B.get('mouth0') or B.get('mouth'))
                r['bad'] = judge(fid, r, closed)
                r['pick'] = s['pick']
                rep[f"{P['id']}:{e}.{fid}"] = r
                t = f"{fid} c{r['chg']:.2f} a{r['alien']:.2f}" + (f" s{r['side']:.2f}" if 'side' in r else '')
                cells.append(label(crop(cand, B['face']), t, bad=bool(r['bad'])))
            row = Image.new('RGB', (210 * 6, 210))
            for i, c in enumerate(cells):
                row.paste(c, (210 * i, 0))
            rows.append(row)
        # 側臉的姿勢有一隻眼睛被頭髮擋住，左右比本來就低：「只閉一隻眼」和同一個姿勢的中位數比
        sides = [v['side'] for k, v in rep.items() if k.startswith(P['id'] + ':') and k.endswith('.e2') and 'side' in v]
        if sides:
            med = float(np.median(sides))
            for k, v in rep.items():
                if k.startswith(P['id'] + ':') and k.endswith('.e2'):
                    v['sideMed'] = med
                    v['bad'] = judge('e2', v, False)
        if rows:
            sh = Image.new('RGB', (210 * 6, 210 * len(rows)))
            for i, r in enumerate(rows):
                sh.paste(r, (0, 210 * i))
            sh.save(os.path.join(OUT, f"{cid}_{P['id']}.jpg"), quality=88)
    zoom_sheet(cid, card, OUT)
    json.dump(rep, open(os.path.join(OUT, cid + '.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
    bad = {k: v['bad'] for k, v in rep.items() if v['bad']}
    print(cid, '格數', len(rep), '不合格', len(bad))
    for k, v in bad.items():
        print('  BAD', k, ','.join(v))


def zoom_sheet(cid, card, out):
    """放大總表（給視覺複查）：每行一個表情，左＝眼睛範圍（底圖、e1、e2），右＝嘴巴範圍（底圖、m1、m2、m3），各放大到寬 260"""
    exprs = ['neutral'] + [e['id'] for e in _exprs(card)]
    for P in card['poses']:
        if not P.get('master') or not P.get('boxes', {}).get('face'):
            continue
        B = P['boxes']
        rows = []
        for e in exprs:
            bf = P['master'] if e == 'neutral' else (P['ex'].get(e) or {}).get('pick')
            if not bf:
                continue
            base = load(cid, bf)
            cells = []
            for kind, frames in (('eyes', ('e1', 'e2')), ('mouth', ('m1', 'm2', 'm3'))):
                x, y, w, h = (P['ex'].get(e) or {}).get('mb') if kind == 'mouth' and (P['ex'].get(e) or {}).get('mb') else B[kind]
                px, py = w * 0.15, h * 0.25
                box = (int(x - px), int(y - py), int(x + w + px), int(y + h + py))
                sz = (260, int(260 * (box[3] - box[1]) / (box[2] - box[0])))
                im = Image.fromarray((base * 255).astype(np.uint8)).crop(box).resize(sz, Image.LANCZOS)
                cells.append(label(im, f'{e} 底圖'))
                for fid in frames:
                    s = P['ex'].get(e + '.' + fid) or {}
                    closed = fid[0] == 'e' and e in ['laugh', 'wink'] + (P.get('noBlink') or [])
                    if closed or s.get('skip') or not s.get('pick'):
                        cells.append(label(Image.new('RGB', sz, (40, 40, 40)), fid + (' 不眨眼' if closed else ' 略過' if s.get('skip') else ' -')))
                        continue
                    im = Image.fromarray((load(cid, s['pick']) * 255).astype(np.uint8)).crop(box).resize(sz, Image.LANCZOS)
                    cells.append(label(im, fid))
            hh = max(c.height for c in cells)
            row = Image.new('RGB', (sum(c.width for c in cells) + 12, hh), (90, 90, 90))
            xx = 0
            for i, c in enumerate(cells):
                row.paste(c, (xx, 0))
                xx += c.width + (12 if i == 2 else 0)
            rows.append(row)
        if rows:
            sh = Image.new('RGB', (max(r.width for r in rows), sum(r.height + 4 for r in rows)), (20, 20, 20))
            yy = 0
            for r in rows:
                sh.paste(r, (0, yy))
                yy += r.height + 4
            sh.save(os.path.join(out, f"{cid}_{P['id']}_zoom.jpg"), quality=90)


def _exprs(card):
    base = ['smile', 'laugh', 'angry', 'surprised', 'sad', 'think', 'smug']
    return [{'id': i} for i in base] + (card.get('extraExprs') or [])


def label(img, text, bad=False):
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, img.width, 16], fill=(150, 0, 0) if bad else (0, 0, 0))
    d.text((3, 1), text, fill=(255, 230, 120), font=FONT)
    return img


if __name__ == '__main__':
    for c in sys.argv[1:]:
        run(c)
