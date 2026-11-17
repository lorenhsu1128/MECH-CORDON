"""立繪品管的比對總表（docs/portrait-qa-workflow.md）：把底圖和影格／候選並排、裁到眼睛或嘴巴放大，給 Claude 或人看圖挑選。
輸出到 test-results/portrait-qa/sheets/（gitignore）。

格子的寫法：<姿勢>:<表情>.<影格>，例如 p1:smile.e1、p3:neutral.m2（影格 e1 半閉、e2 全閉、m1～m3 嘴型）。
清單檔：每行（或空白分隔）一個格子。Windows 的 Python 寫出的清單會帶 \\r，這裡一律去掉。

  python scripts/portrait-sheet.py cands <角色> <清單檔> [--n=3] [--since=HH:MM|epoch]
      每行＝表情底圖｜最新的 n 個候選（標號 1..n）。之後用 portrait-pick.py 以同樣的 --n／--since 選。
  python scripts/portrait-sheet.py all <角色> <清單檔>
      每行＝底圖＋全部候選（最多 9 個，標號＝slot.cands 的索引，* 是目前選定的）
  python scripts/portrait-sheet.py pick <角色> <清單檔>
      選完之後的確認：每格＝底圖｜目前的 pick
  python scripts/portrait-sheet.py eyes <角色> [--since=HH:MM]
      每個姿勢、每個表情的眼睛特寫（底圖｜e1｜e2），只列 since 之後產的
  python scripts/portrait-sheet.py pairs <角色>:<格子> …
      臉放大的「底圖｜影格」對照（跨角色）
  python scripts/portrait-sheet.py heads <角色>:<姿勢> …
      各姿勢主圖的頭部放大（臉框 ×2），看設計是否一致
  python scripts/portrait-sheet.py grid <角色>:<姿勢> …
      主圖加 100 px 格線（決定 portrait-fix.mjs 的 --crop／--inner、keepOut 的座標）
  python scripts/portrait-sheet.py fix <角色>:<姿勢>:<tag> … [--k=1.4|x,y,w,h]
      portrait-fix.mjs 產的修正候選（tools/comfyui/runtime/work/fix/）和原主圖並排
"""
import glob
import json
import os
import sys
import time

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
CH = os.path.join(ROOT, 'src', 'assets', 'characters')
WK = os.path.join(ROOT, 'tools', 'charwork')
OUT = os.path.join(ROOT, 'test-results', 'portrait-qa', 'sheets')
os.makedirs(OUT, exist_ok=True)
try:
    FONT = ImageFont.truetype(r'C:\Windows\Fonts\msjh.ttc', 14)
except Exception:
    FONT = ImageFont.load_default()


def card(cid):
    return json.load(open(os.path.join(CH, cid, 'card.json'), encoding='utf-8'))


def pose(c, pid):
    return [p for p in c['poses'] if p['id'] == pid][0]


def img(cid, f):
    return Image.open(os.path.join(WK, cid, f)).convert('RGB')


def items(path):
    return open(path, encoding='utf-8').read().replace('\r', '').split()


def since_of(s):
    """--since：epoch 秒或今天的 HH:MM；沒給＝0"""
    if not s:
        return 0.0
    if ':' in s:
        h, m = map(int, s.split(':'))
        t = time.localtime()
        return time.mktime((t.tm_year, t.tm_mon, t.tm_mday, h, m, 0, 0, 0, -1))
    return float(s)


def frame_box(P, e, fid, pad=(0.1, 0.2)):
    """影格的放大範圍：眼睛框，或那個表情自己的嘴框 ex.mb（沒有時用姿勢的嘴框）"""
    B = P['boxes']
    x, y, w, h = B['eyes'] if fid[0] == 'e' else ((P['ex'].get(e) or {}).get('mb') or B['mouth'])
    return (int(x - w * pad[0]), int(y - h * pad[1]), int(x + w * (1 + pad[0])), int(y + h * (1 + pad[1])))


def base_of(P, e):
    return P['master'] if e == 'neutral' else P['ex'][e]['pick']


def recent(cid, slot, n, since):
    """slot 的候選裡、檔案存在而且 since 之後產的最新 n 個（portrait-pick.py 用同一個規則）"""
    fs = [f for f in slot.get('cands', []) if os.path.exists(os.path.join(WK, cid, f))
          and os.path.getmtime(os.path.join(WK, cid, f)) >= since]
    return fs[-n:]


def tag(im, text, color=(255, 60, 60)):
    ImageDraw.Draw(im).text((3, 2), text, fill=color, font=FONT)
    return im


def stack(rows, per, name, width=None, gap=0):
    outs = []
    for n in range(0, len(rows), per):
        ch = rows[n:n + per]
        o = Image.new('RGB', (width or max(r.width for r in ch), sum(r.height + gap for r in ch)), (30, 30, 30))
        y = 0
        for r in ch:
            o.paste(r, (0, y))
            y += r.height + gap
        p = os.path.join(OUT, f'{name}_{n // per}.jpg')
        o.save(p, quality=88)
        outs.append(p)
    print('\n'.join(outs))


def cmd_cands(cid, lst, n=3, since=0.0):
    c = card(cid)
    rows = []
    W = 260
    for it in items(lst):
        pid, k = it.split(':')
        e, fid = k.split('.')
        P = pose(c, pid)
        b = frame_box(P, e, fid)
        H = int(W * (b[3] - b[1]) / (b[2] - b[0]))
        r = Image.new('RGB', (W * (n + 1), H), (30, 30, 30))
        for i, f in enumerate([base_of(P, e)] + recent(cid, P['ex'][k], n, since)):
            r.paste(tag(img(cid, f).crop(b).resize((W, H)), it if i == 0 else str(i)), (W * i, 0))
        rows.append(r)
    stack(rows, 10, f'{cid}_cands')


def cmd_all(cid, lst):
    c = card(cid)
    rows = []
    W = 200
    for it in items(lst):
        pid, k = it.split(':')
        e, fid = k.split('.')
        P = pose(c, pid)
        b = frame_box(P, e, fid)
        H = int(W * (b[3] - b[1]) / (b[2] - b[0]))
        s = P['ex'][k]
        cs = [(i, f) for i, f in enumerate(s.get('cands', [])) if os.path.exists(os.path.join(WK, cid, f))][-9:]
        r = Image.new('RGB', (W * 10, H), (30, 30, 30))
        for j, (i, f) in enumerate([(-1, base_of(P, e))] + cs):
            t = img(cid, f).crop(b).resize((W, H))
            r.paste(tag(t, it if i < 0 else str(i) + ('*' if f == s.get('pick') else '')), (W * j, 0))
        rows.append(r)
    stack(rows, 6, f'{cid}_all', width=2000)


def cmd_pick(cid, lst):
    c = card(cid)
    tiles = []
    W = 240
    for it in items(lst):
        pid, k = it.split(':')
        e, fid = k.split('.')
        P = pose(c, pid)
        b = frame_box(P, e, fid)
        H = int(W * (b[3] - b[1]) / (b[2] - b[0]))
        t = Image.new('RGB', (W * 2 + 8, H), (200, 0, 0))
        s = P['ex'][k]
        for j, f in enumerate([base_of(P, e), s.get('pick')]):
            if not f or s.get('skip') and j:
                t.paste(tag(Image.new('RGB', (W, H), (60, 60, 60)), 'skip'), (j * (W + 8), 0))
                continue
            im = img(cid, f).crop(b).resize((W, H))
            t.paste(tag(im, it) if j == 0 else im, (j * (W + 8), 0))
        tiles.append(t)
    rows = []
    for n in range(0, len(tiles), 3):
        ch = tiles[n:n + 3]
        r = Image.new('RGB', (3 * (W * 2 + 18), max(t.height for t in ch)), (30, 30, 30))
        for i, t in enumerate(ch):
            r.paste(t, (i * (W * 2 + 18), 0))
        rows.append(r)
    stack(rows, 8, f'{cid}_pick', gap=6)


def cmd_eyes(cid, since=0.0):
    c = card(cid)
    rows = []
    W = 240
    for P in c['poses']:
        B = P.get('boxes') or {}
        if 'eyes' not in B:
            continue
        x, y, w, h = [int(v) for v in B['eyes']]
        b = (x - 8, y - 8, x + w + 8, y + h + 8)
        H = int(W * (b[3] - b[1]) / (b[2] - b[0]))
        for e in ['neutral'] + [k for k in P['ex'] if '.' not in k]:
            fs = [(P['ex'].get(f'{e}.{f}') or {}).get('pick') for f in ('e1', 'e2')]
            if not [f for f in fs if f and os.path.getmtime(os.path.join(WK, cid, f)) >= since]:
                continue
            r = Image.new('RGB', (W * 3, H), (40, 40, 40))
            for i, f in enumerate([base_of(P, e)] + fs):
                if f:
                    t = img(cid, f).crop(b).resize((W, H))
                    r.paste(tag(t, f"{P['id']}:{e}") if i == 0 else t, (W * i, 0))
            rows.append(r)
    if not rows:
        return print('沒有符合的格子')
    rh = max(r.height for r in rows)
    o = Image.new('RGB', (730 * 2, rh * ((len(rows) + 1) // 2)))
    for i, r in enumerate(rows):
        o.paste(r, (730 * (i % 2), rh * (i // 2)))
    p = os.path.join(OUT, f'{cid}_eyes.jpg')
    o.save(p, quality=88)
    print(p)


def cmd_pairs(args):
    rows = []
    for t in args:
        cid, pid, k = t.split(':')
        e, _ = k.split('.')
        P = pose(card(cid), pid)
        fx, fy, fw, fh = P['boxes']['face']
        s = max(fw, fh) * 1.1
        cx, cy = fx + fw / 2, fy + fh / 2
        box = (int(cx - s / 2), int(cy - s / 2), int(cx + s / 2), int(cy + s / 2))
        r = Image.new('RGB', (720, 360))
        for i, f in enumerate((base_of(P, e), P['ex'][k]['pick'])):
            r.paste(img(cid, f).crop(box).resize((360, 360), Image.LANCZOS), (360 * i, 0))
        rows.append(tag(r, t, (255, 255, 0)))
    o = Image.new('RGB', (1440, 360 * ((len(rows) + 1) // 2)))
    for i, r in enumerate(rows):
        o.paste(r, (720 * (i % 2), 360 * (i // 2)))
    p = os.path.join(OUT, 'pairs.jpg')
    o.save(p, quality=88)
    print(p)


def cmd_heads(args):
    tiles = []
    for it in args:
        cid, pid = it.split(':')
        P = pose(card(cid), pid)
        x, y, w, h = P['boxes']['face']
        s = max(w, h) * 2.0
        cx, cy = x + w / 2, y + h / 2
        b = (int(cx - s / 2), int(cy - s / 2), int(cx + s / 2), int(cy + s / 2))
        tiles.append(tag(img(cid, P['master']).crop(b).resize((340, 340)), f'{it} {b[0]},{b[1]} s{int(s)}'))
    o = Image.new('RGB', (340 * 5, 340 * ((len(tiles) + 4) // 5)), 'white')
    for i, t in enumerate(tiles):
        o.paste(t, (340 * (i % 5), 340 * (i // 5)))
    p = os.path.join(OUT, 'heads.jpg')
    o.save(p, quality=88)
    print(p)


def cmd_grid(args):
    tiles = []
    for it in args:
        cid, pid = it.split(':')
        im = img(cid, pose(card(cid), pid)['master'])
        d = ImageDraw.Draw(im)
        for x in range(0, im.width, 100):
            d.line([(x, 0), (x, im.height)], fill=(255, 0, 0), width=2)
            d.text((x + 3, 3), str(x), fill=(255, 0, 0), font=FONT)
        for y in range(0, im.height, 100):
            d.line([(0, y), (im.width, y)], fill=(0, 0, 255), width=2)
            d.text((3, y + 3), str(y), fill=(0, 0, 255), font=FONT)
        tiles.append(tag(im.resize((im.width // 2, im.height // 2)), it, (255, 0, 255)))
    o = Image.new('RGB', (sum(t.width for t in tiles), max(t.height for t in tiles)))
    x = 0
    for t in tiles:
        o.paste(t, (x, 0))
        x += t.width
    p = os.path.join(OUT, 'grid.jpg')
    o.save(p, quality=88)
    print(p)


def cmd_fix(args, k='1.4'):
    rows = []
    for it in args:
        cid, pid, tg = it.split(':')
        P = pose(card(cid), pid)
        if ',' in k:
            x0, y0, w, h = map(int, k.split(','))
            b = (x0, y0, x0 + w, y0 + h)
        else:
            x, y, w, h = P['boxes']['face']
            s = max(w, h) * float(k)
            cx, cy = x + w / 2, y + h / 2
            b = (int(cx - s / 2), int(cy - s / 2), int(cx + s / 2), int(cy + s / 2))
        fs = [os.path.join(WK, cid, P['master'])] + sorted(
            glob.glob(os.path.join(ROOT, 'tools', 'comfyui', 'runtime', 'work', 'fix', cid, f'{pid}_fix_{tg}_*[0-9].png')))
        ims = []
        for f in fs:
            t = Image.open(f).convert('RGB').crop(b)
            ims.append(tag(t.resize((300, int(300 * t.height / t.width))), os.path.basename(f)[-22:]))
        r = Image.new('RGB', (300 * len(ims), ims[0].height), 'white')
        for i, t in enumerate(ims):
            r.paste(t, (300 * i, 0))
        rows.append(r)
    stack(rows, 8, 'fix')


def main():
    a = sys.argv[1:]
    if not a:
        sys.exit(__doc__)
    opt = dict(x[2:].split('=', 1) for x in a if x.startswith('--') and '=' in x)
    pos = [x for x in a if not x.startswith('--')]
    cmd, rest = pos[0], pos[1:]
    if cmd == 'cands':
        cmd_cands(rest[0], rest[1], int(opt.get('n', 3)), since_of(opt.get('since')))
    elif cmd == 'all':
        cmd_all(rest[0], rest[1])
    elif cmd == 'pick':
        cmd_pick(rest[0], rest[1])
    elif cmd == 'eyes':
        cmd_eyes(rest[0], since_of(opt.get('since')))
    elif cmd == 'pairs':
        cmd_pairs(rest)
    elif cmd == 'heads':
        cmd_heads(rest)
    elif cmd == 'grid':
        cmd_grid(rest)
    elif cmd == 'fix':
        cmd_fix(rest, opt.get('k', '1.4'))
    else:
        sys.exit(__doc__)


if __name__ == '__main__':
    main()
