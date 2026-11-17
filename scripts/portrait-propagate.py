# 主圖修正的傳播（2026-11-15 立繪大修，docs/portrait-design.md）：主圖局部改過（去背殘留、配件統一、手套…）之後，
# 把「新主圖和舊主圖不一樣的地方」貼進這個姿勢的每一張表情與影格（避開表情自己改過的臉部），不用重產表情。
#   python scripts/portrait-propagate.py <角色> <姿勢> <修正過的主圖…（候選資料夾的檔名或路徑，可以好幾張）> [--dry]
# 寫入：新的表情／影格圖（原檔名加 _u）、card.json 的 master／pick，並標 pose.rebase（發佈時重新去背與拆層）。
# 角色的 card.json 在伺服器的開發模式下直接讀檔，所以改之前要確定沒有別的程式正在寫這個角色（產圖批次）。
import json, os, sys
import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
CH = os.path.join(ROOT, 'src', 'assets', 'characters')
WK = os.path.join(ROOT, 'tools', 'charwork')


def load(cid, f):
    p = f if os.path.isabs(f) or os.path.exists(f) else os.path.join(WK, cid, f)
    return np.asarray(Image.open(p).convert('RGB')).astype(np.float32) / 255


def soft(mask, grow, blur):
    im = Image.fromarray((mask * 255).astype(np.uint8))
    if grow:
        im = im.filter(ImageFilter.MaxFilter(grow * 2 + 1))
    if blur:
        im = im.filter(ImageFilter.GaussianBlur(blur))
    return np.asarray(im).astype(np.float32) / 255


def main():
    a = [x for x in sys.argv[1:] if not x.startswith('--')]
    cid, pid, newfs = a[0], a[1], a[2:]
    newf = os.path.basename(newfs[0])
    dry = '--dry' in sys.argv
    path = os.path.join(CH, cid, 'card.json')
    card = json.load(open(path, encoding='utf-8'))
    P = [p for p in card['poses'] if p['id'] == pid][0]
    # --from=<舊主圖>：已經傳播過一次、要以更早的主圖為基準重來（例如換了 E 的門檻）
    frm = [x.split('=', 1)[1] for x in sys.argv if x.startswith('--from=')]
    old = load(cid, frm[0] if frm else P['master'])
    # 表情自己改過的地方：和舊主圖差超過 ethr（表情重畫整個臉框，框裡到處都有 0.05 左右的小差異，
    # 門檻太低會把整個臉框當成表情的，臉框裡的修正（耳機、OK 繃、疤）就傳不進去）
    eth = [float(x.split('=', 1)[1]) for x in sys.argv if x.startswith('--ethr=')]
    ethr = eth[0] if eth else 0.15
    # 好幾個修正（各自從同一張舊主圖改的）：依序把各自改的地方疊上去
    new = old.copy()
    for f in newfs:
        fx = load(cid, f)
        m = soft((np.abs(fx - old).max(-1) > 0.06).astype(np.float32), 2, 1)[..., None]
        new = new * (1 - m) + fx * m
    d = np.abs(new - old).max(-1)
    M0 = (d > 0.06).astype(np.float32)
    # 眼睛、嘴巴的範圍是每個表情各自的：主圖修正不碰（Qwen 順手改了眼睛也不採用）
    # 嘴巴用原本的小嘴框（放大過的嘴框包到臉頰，耳機的麥克風桿、OK 繃常常在那裡）
    # --eyes：修正的就是眼睛（異色瞳）→ 不排除眼睛的框（這個姿勢的表情要另外重做）
    # --mouth：修正碰到嘴邊（舊的麥克風桿尖端）→ 只排除眼睛的框
    keys = () if '--eyes' in sys.argv else ('eyes',) if '--mouth' in sys.argv else ('eyes', 'mouth0' if 'mouth0' in P['boxes'] else 'mouth')
    for k in keys:
        b = P['boxes'].get(k)
        if b:
            x, y, w, h = [int(round(v)) for v in b]
            M0[max(0, y - 6):y + h + 6, max(0, x - 6):x + w + 6] = 0
    force = '--force' in sys.argv
    gr = [int(x.split('=', 1)[1]) for x in sys.argv if x.startswith('--grow=')]
    M = soft(M0, gr[0] if gr else 8 if force else 4, 2)
    print('主圖改變的面積', round(float(M0.mean()), 4))
    # 新主圖＝舊主圖＋只有修正的地方（和表情、影格用同一個遮罩）
    new = old * (1 - M[..., None]) + new * M[..., None]
    newf = newf.rsplit('.', 1)[0] + '_p.webp'
    if not dry:
        Image.fromarray((np.clip(new, 0, 1) * 255 + 0.5).astype(np.uint8)).save(os.path.join(WK, cid, newf), lossless=True)
    n = 0
    for key, slot in P['ex'].items():
        f = slot.get('pick')
        if not f:
            continue
        pk = load(cid, f)
        Eh = (np.abs(pk - old).max(-1) > ethr).astype(np.float32)
        if force:
            # --force：只有眼睛、嘴巴框裡的差異算表情自己的（表情重畫過臉框，臉框裡的配件位置會偏，用差異判斷擋不住）
            keep = np.zeros_like(Eh)
            for k in ('eyes', 'mouth'):
                b = P['boxes'].get(k)
                if b:
                    x, y, w, h = [int(round(v)) for v in b]
                    keep[max(0, y - 4):y + h + 4, max(0, x - 4):x + w + 4] = 1
            Eh *= keep
        E = soft(Eh, 4, 2)
        W = (M * (1 - E))[..., None]
        if float(W.max()) < 0.01:
            continue
        out = pk * (1 - W) + new * W
        nf = f.replace('.webp', '_u.webp')
        while os.path.exists(os.path.join(WK, cid, nf)):
            nf = nf.replace('.webp', 'u.webp')
        if not dry:
            Image.fromarray((np.clip(out, 0, 1) * 255 + 0.5).astype(np.uint8)).save(os.path.join(WK, cid, nf), lossless=True)
            slot.setdefault('cands', []).append(nf)
            slot['pick'] = nf
        n += 1
    if not dry:
        P.setdefault('cands', []).append({'file': newf, 'seed': 0})
        P['master'] = newf
        P['rebase'] = True
        open(path, 'w', encoding='utf-8', newline='\n').write(json.dumps(card, ensure_ascii=False, indent=2) + '\n')
    print(cid, pid, '更新', n, '張', '（試算）' if dry else '')


if __name__ == '__main__':
    main()
