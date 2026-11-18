"""立繪的總檢查（docs/portrait-qa-workflow.md）：照遊戲的合成方式（mech_cordon_studio/js/portrait.js：分層、patchMasked）
拼出已發佈的每個表情 × 每一格（底圖、e1、e2、m1～m3），量去背與接縫，輸出總表給 Claude 或人看圖。

  python scripts/portrait-audit.py [<角色> …]                      全部表情的總表（每格 170 px）＋ report.json
  python scripts/portrait-audit.py --zoom <角色> <姿勢> [<表情>,…]  放大總表（每格 300 px，只裁臉）——縮圖看不出淡的殘線

輸出 test-results/portrait-qa/audit/：
  <角色>_poses.jpg      每個姿勢的主圖（深底＋洋紅底：看去背的白邊、殘塊、破洞）
  <角色>_<姿勢>_ex.jpg  每行一個表情：底圖｜e1｜e2｜m1｜m2｜m3（｜分層關掉時的 e2m2）
  zoom_<角色>_<姿勢>.jpg
  report_<角色…>.json   每個姿勢：alpha（strayN 殘塊、holes 破洞、haloWhite／rimWhite 白邊、cut 被畫面切到）、
                        layerDiff（四層疊起來和主圖不同的比例）、每個表情的 *Seam（小圖外框和底下的差）、
                        *Out（框在輪廓外的比例）、*Chg（這一格和睜眼／閉嘴的差，太小＝沒變化）
要 numpy、Pillow、scipy（語音的 conda 環境 rubicon-voice 就有）。看的是發佈後的檔案，所以先 publish --keep。
"""
import json, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage

PROJ = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
ROOT = os.path.join(PROJ, 'src', 'assets', 'characters')
OUT = os.path.join(PROJ, 'test-results', 'portrait-qa', 'audit')
SH = OUT
os.makedirs(SH, exist_ok=True)
try:
    FONT = ImageFont.truetype(r'C:\Windows\Fonts\msjh.ttc', 14)
except Exception:
    FONT = ImageFont.load_default()

cache = {}


def load(cid, name, mode='RGBA'):
    k = (cid, name)
    if k not in cache:
        cache[k] = np.asarray(Image.open(os.path.join(ROOT, cid, name)).convert('RGBA')).astype(np.float32) / 255
    return cache[k]


def over(dst, src, x=0, y=0, mask=None):
    """src（RGBA）以 alpha 疊到 dst（RGBA）的 (x, y)"""
    h, w = src.shape[:2]
    d = dst[y:y + h, x:x + w]
    a = src[..., 3:4] if mask is None else src[..., 3:4] * mask[..., None]
    outA = a + d[..., 3:4] * (1 - a)
    rgb = (src[..., :3] * a + d[..., :3] * d[..., 3:4] * (1 - a)) / np.maximum(outA, 1e-6)
    dst[y:y + h, x:x + w, :3] = rgb
    dst[y:y + h, x:x + w, 3:4] = outA


def resize(a, w, h):
    if a.shape[1] == w and a.shape[0] == h:
        return a
    im = Image.fromarray((a * 255).astype(np.uint8))
    return np.asarray(im.resize((w, h), Image.LANCZOS)).astype(np.float32) / 255


def compose(cid, P, ex, eye=None, mouth=None, layered=False):
    m = load(cid, P['img'])
    H, W = m.shape[:2]
    patches = [(ex.get('f'), P['boxes'].get('face')), (eye and ex.get(eye), P['boxes'].get('eyes')),
               (mouth and ex.get(mouth), P['boxes'].get('mouth'))]
    L = P.get('layers') if layered else None
    if L:
        out = np.zeros_like(m)
        for g in ('hairb', 'body', 'head'):
            over(out, load(cid, L[g]))
        head = load(cid, L['head'])[..., 3]
        hf = load(cid, L['hairf'])[..., 3]
        for name, box in patches:
            if not name or not box:
                continue
            x, y, w, h = [int(round(v)) for v in box]
            p = resize(load(cid, name), w, h).copy()
            msk = head[y:y + h, x:x + w] * (1 - hf[y:y + h, x:x + w])
            p[..., 3] = msk
            over(out, p, x, y)
        over(out, load(cid, L['hairf']))
        return out
    out = m.copy()
    for name, box in patches:
        if not name or not box:
            continue
        x, y, w, h = [int(round(v)) for v in box]
        over(out, resize(load(cid, name), w, h), x, y)
    return out


def flat(img, bg=(0.13, 0.15, 0.19)):
    a = img[..., 3:4]
    return img[..., :3] * a + np.array(bg) * (1 - a)


def crop_face(img, P, k=1.45, size=170):
    x, y, w, h = P['boxes']['face']
    cx, cy = x + w / 2, y + h / 2
    s = max(w, h) * k
    x0, y0 = int(cx - s / 2), int(cy - s / 2)
    H, W = img.shape[:2]
    pad = np.zeros((int(s), int(s), 3), np.float32) + np.array([0.13, 0.15, 0.19])
    xs0, ys0 = max(0, x0), max(0, y0)
    xs1, ys1 = min(W, x0 + int(s)), min(H, y0 + int(s))
    pad[ys0 - y0:ys1 - y0, xs0 - x0:xs1 - x0] = img[ys0:ys1, xs0:xs1]
    return Image.fromarray((np.clip(pad, 0, 1) * 255).astype(np.uint8)).resize((size, size), Image.LANCZOS)


def ring_diff(under, patch, box, wid=2):
    """小圖外框 wid px 與底下（合成前）的差；只算底下不透明的地方"""
    x, y, w, h = [int(round(v)) for v in box]
    p = resize(patch, w, h)
    u = under[y:y + h, x:x + w]
    rm = np.zeros((h, w), bool)
    rm[:wid] = rm[-wid:] = True
    rm[:, :wid] = rm[:, -wid:] = True
    rm &= u[..., 3] > 0.9
    if rm.sum() < 10:
        return 0.0
    return float(np.abs(p[..., :3][rm] - u[..., :3][rm]).mean() * 255)


def outside(m, box):
    """框內在輪廓外（主圖幾乎透明）的比例：沒有分層時小圖是不透明的方塊，會蓋到背景"""
    x, y, w, h = [int(round(v)) for v in box]
    a = m[y:y + h, x:x + w, 3]
    return float((a < 0.5).mean())


def alpha_stats(m):
    a = m[..., 3]
    semi = (a > 0.04) & (a < 0.96)
    solid = a > 0.5
    lab, n = ndimage.label(solid)
    sizes = ndimage.sum(solid, lab, range(1, n + 1)) if n else []
    big = max(sizes) if n else 0
    stray = [int(s) for s in sizes if s < big * 0.02 and s > 30]
    holes = ndimage.binary_fill_holes(solid) & ~solid
    hl, hn = ndimage.label(holes)
    hs = ndimage.sum(holes, hl, range(1, hn + 1)) if hn else []
    # 邊緣的光暈：半透明像素的亮度（白底去背殘留＝很亮）
    edge = semi & (a < 0.8)
    lum = (m[..., :3].mean(-1))[edge]
    # 輪廓外一圈 2 px 的不透明像素是否偏白
    er = solid & ~ndimage.binary_erosion(solid, iterations=2)
    elum = m[..., :3].mean(-1)[er]
    # 畫面邊緣被切到（圖的上／左／右邊有不透明像素）
    cut = {'top': float((a[0] > 0.5).mean()), 'left': float((a[:, 0] > 0.5).mean()), 'right': float((a[:, -1] > 0.5).mean())}
    return {
        'semi': float(semi.mean()),
        'stray': stray[:8],
        'strayN': len(stray),
        'holes': sorted([int(s) for s in hs if s > 40], reverse=True)[:6],
        'haloLum': float(lum.mean()) if lum.size else 0,
        'haloWhite': float((lum > 0.85).mean()) if lum.size else 0,
        'rimWhite': float((elum > 0.9).mean()) if elum.size else 0,
        'cut': cut,
    }


def label(img, text):
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, img.width, 18], fill=(0, 0, 0))
    d.text((3, 1), text, fill=(255, 230, 120), font=FONT)
    return img


def main(only=None):
    rep = {}
    for cid in sorted(os.listdir(ROOT)):
        if only and cid not in only:
            continue
        card = json.load(open(os.path.join(ROOT, cid, 'card.json'), encoding='utf-8'))
        pub = card.get('pub')
        if not pub:
            continue
        R = rep[cid] = {'name': card.get('name'), 'poses': {}}
        # 去背總表：每個姿勢的主圖，深底與亮洋紅底各一
        tiles = []
        for P in pub['poses']:
            m = load(cid, P['img'])
            st = alpha_stats(m)
            R['poses'][P['id']] = {'alpha': st, 'ex': {}}
            dark = Image.fromarray((flat(m) * 255).astype(np.uint8)).resize((277, 405))
            mag = Image.fromarray((flat(m, (1, 0, 1)) * 255).astype(np.uint8)).resize((277, 405))
            row = Image.new('RGB', (554, 405))
            row.paste(dark, (0, 0))
            row.paste(mag, (277, 0))
            tiles.append(label(row, f"{P['id']} {P.get('name','')} stray{st['strayN']} holes{len(st['holes'])} halo{st['haloWhite']:.2f}"))
            # 分層：四層疊起來應該＝主圖
            if P.get('layers'):
                comp = compose(cid, P, {}, layered=True)
                d = np.abs(flat(comp) - flat(m)).mean(-1)
                R['poses'][P['id']]['layerDiff'] = float((d > 0.08).mean())
            # 表情
            exprs = list(P['ex'].keys())
            rows = []
            for e in exprs:
                ex = P['ex'][e]
                info = {}
                base = load(cid, P['img'])
                if ex.get('f') and P['boxes'].get('face'):
                    info['faceSeam'] = ring_diff(base, load(cid, ex['f']), P['boxes']['face'])
                    info['faceOut'] = outside(base, P['boxes']['face'])
                F = compose(cid, P, ex)
                for k, bk in (('e1', 'eyes'), ('e2', 'eyes'), ('m1', 'mouth'), ('m2', 'mouth'), ('m3', 'mouth')):
                    if ex.get(k) and P['boxes'].get(bk):
                        info[k + 'Seam'] = ring_diff(F, load(cid, ex[k]), P['boxes'][bk])
                        info[k + 'Out'] = outside(base, P['boxes'][bk])
                        # 這一格和睜眼／閉嘴的差（太小＝沒變化）
                        x, y, w, h = [int(round(v)) for v in P['boxes'][bk]]
                        pp = resize(load(cid, ex[k]), w, h)
                        info[k + 'Chg'] = float(np.abs(pp[..., :3] - F[y:y + h, x:x + w, :3]).mean() * 255)
                R['poses'][P['id']]['ex'][e] = info
                lay = bool(P.get('layers'))
                cells = [label(crop_face(flat(compose(cid, P, ex, layered=lay)), P), e)]
                for k in ('e1', 'e2', 'm1', 'm2', 'm3'):
                    if k[0] == 'e':
                        c = compose(cid, P, ex, eye=k, layered=lay)
                    else:
                        c = compose(cid, P, ex, mouth=k, layered=lay)
                    cells.append(label(crop_face(flat(c), P), k))
                if lay:  # 沒有分層的畫法（關掉分層時）
                    cells.append(label(crop_face(flat(compose(cid, P, ex, eye='e2', mouth='m2')), P), 'noL e2m2'))
                r = Image.new('RGB', (170 * len(cells), 170))
                for i, c in enumerate(cells):
                    r.paste(c, (170 * i, 0))
                rows.append(r)
            if len(exprs) > 1:
                sheet = Image.new('RGB', (max(r.width for r in rows), 170 * len(rows)))
                for i, r in enumerate(rows):
                    sheet.paste(r, (0, 170 * i))
                sheet.save(os.path.join(SH, f'{cid}_{P["id"]}_ex.jpg'), quality=88)
            else:
                tiles[-1].paste(rows[0].resize((rows[0].width * 2 // 3, 113)), (0, 405 - 113))
        # 去背總表：每行 2 個姿勢
        n = len(tiles)
        cols = 2
        sheet = Image.new('RGB', (554 * cols, 405 * ((n + cols - 1) // cols)))
        for i, t in enumerate(tiles):
            sheet.paste(t, (554 * (i % cols), 405 * (i // cols)))
        sheet.save(os.path.join(SH, f'{cid}_poses.jpg'), quality=85)
        print(cid, 'done', flush=True)
    json.dump(rep, open(os.path.join(OUT, 'report_' + '_'.join(sorted(rep))[:40] + '.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)


def zoom(cid, pid, exs=None):
    card = json.load(open(os.path.join(ROOT, cid, 'card.json'), encoding='utf-8'))
    P = [p for p in card['pub']['poses'] if p['id'] == pid][0]
    lay = bool(P.get('layers'))
    rows = []
    for e in exs or list(P['ex']):
        ex = P['ex'][e]
        cells = []
        for k in [None, 'e1', 'e2', 'm1', 'm2', 'm3']:
            c = compose(cid, P, ex, eye=k if k and k[0] == 'e' else None, mouth=k if k and k[0] == 'm' else None,
                        layered=lay)
            cells.append(label(crop_face(flat(c), P, k=1.0, size=300), f'{e} {k or "base"}'))
        r = Image.new('RGB', (300 * 6, 300))
        for i, c in enumerate(cells):
            r.paste(c, (300 * i, 0))
        rows.append(r)
    s = Image.new('RGB', (1800, 300 * len(rows)))
    for i, r in enumerate(rows):
        s.paste(r, (0, 300 * i))
    p = os.path.join(SH, f'zoom_{cid}_{pid}.jpg')
    s.save(p, quality=90)
    print(p)


if __name__ == '__main__':
    a = sys.argv[1:]
    if a and a[0] == '--zoom':
        zoom(a[1], a[2], a[3].split(',') if len(a) > 3 else None)
    else:
        main(a or None)
