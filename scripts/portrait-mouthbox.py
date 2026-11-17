# 每個表情的嘴型框 mb（2026-11-15 立繪大修，docs/portrait-design.md）：
# 姿勢共用一個嘴巴框時，大笑、得意這類大嘴超出框，框外原本的嘴不會被改到，說話時留下殘線。
# 這裡量「這個表情和主圖不一樣、而且和原本小嘴框相連」的範圍（眼睛以下），外框＋8 px 留白，再和姿勢的嘴巴框合併，
# 寫進 card 的 pose.ex[表情].mb（產生嘴型、發佈裁切、播放器都用它）。
#   python scripts/portrait-mouthbox.py <角色>… [--clear]   （--clear：同時清掉那些表情的嘴型的 v2，讓 frames 重產）
import json, os, sys
import numpy as np
from PIL import Image
import scipy.ndimage as nd

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')


def load(cid, f):
    return np.asarray(Image.open(os.path.join(ROOT, 'tools', 'charwork', cid, f)).convert('RGB')).astype(np.float32) / 255


def run(cid, clear):
    path = os.path.join(ROOT, 'src', 'assets', 'characters', cid, 'card.json')
    card = json.load(open(path, encoding='utf-8'))
    n = 0
    for P in card['poses']:
        B = P.get('boxes') or {}
        if not P.get('master') or not B.get('face') or not B.get('mouth'):
            continue
        m = load(cid, P['master'])
        H, W = m.shape[:2]
        fx, fy, fw, fh = B['face']
        ey = B['eyes'][1] + B['eyes'][3] + 2 if B.get('eyes') else fy + fh * 0.5
        m0 = B.get('mouth0') or B['mouth']
        for e, slot in P['ex'].items():
            if '.' in e or not slot.get('pick'):
                continue
            pk = load(cid, slot['pick'])
            d = np.abs(pk - m).max(-1) > 0.08
            reg = np.zeros_like(d)
            y0, y1 = int(ey), int(min(H, fy + fh * 1.15))
            x0, x1 = int(max(0, fx - fw * 0.1)), int(min(W, fx + fw * 1.1))
            reg[y0:y1, x0:x1] = True
            d &= reg
            lab, k = nd.label(nd.binary_dilation(d, iterations=3))
            mx, my, mw, mh = [int(round(v)) for v in m0]
            hit = set(np.unique(lab[max(0, my - 10):my + mh + 10, max(0, mx - 10):mx + mw + 10])) - {0}
            bx = list(B['mouth'])
            if hit:
                ys, xs = np.nonzero(np.isin(lab, list(hit)) & d)
                if len(xs):
                    # 太大（整個下巴的陰影都變了）就只取到臉寬的 0.8
                    ax0, ax1 = xs.min() - 8, xs.max() + 8
                    if ax1 - ax0 > fw * 0.8:
                        c = (mx + mw / 2)
                        ax0, ax1 = c - fw * 0.4, c + fw * 0.4
                    bx0 = min(bx[0], ax0)
                    by0 = min(bx[1], ys.min() - 8)
                    bx1 = max(bx[0] + bx[2], ax1)
                    by1 = max(bx[1] + bx[3], ys.max() + 8)
                    by0 = max(by0, ey)
                    bx = [int(max(0, bx0)), int(by0), int(min(W, bx1) - max(0, bx0)), int(min(H, by1) - by0)]
            if bx != list(B['mouth']):
                slot['mb'] = bx
                n += 1
            else:
                slot.pop('mb', None)
            if clear:
                for f in ('m1', 'm2', 'm3'):
                    s = P['ex'].get(f'{e}.{f}')
                    if s:
                        s.pop('v2', None)
        if clear:
            for f in ('m1', 'm2', 'm3'):
                s = P['ex'].get(f'neutral.{f}')
                if s:
                    s.pop('v2', None)
    open(path, 'w', encoding='utf-8', newline='\n').write(json.dumps(card, ensure_ascii=False, indent=2) + '\n')
    print(cid, '加大嘴型框的表情', n)


if __name__ == '__main__':
    clear = '--clear' in sys.argv
    for c in [a for a in sys.argv[1:] if not a.startswith('--')]:
        run(c, clear)
