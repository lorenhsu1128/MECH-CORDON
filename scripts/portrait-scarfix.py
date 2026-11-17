"""閉眼影格把臉上的疤換回原圖（docs/portrait-qa-workflow.md；2026-11-17 用在 KILN 的燙傷疤）：
Qwen 閉眼時常把眼睛旁邊的疤一起改掉或染色。這裡把「原圖是疤、又不在眼睛開口裡」的像素換回表情底圖，存成新檔並改 pick。

  python scripts/portrait-scarfix.py <角色> [<姿勢>:<表情>.<影格> …] [--dry]
--dry 只輸出前 4 格的預覽（底圖｜原本｜修正後）到 test-results/portrait-qa/sheets/<角色>_scar.jpg。
疤的顏色門檻（SCAR）照 KILN 的紅色燙疤寫，別的角色先用 --dry 看，不對就改門檻。
要 numpy、Pillow、opencv：用 ComfyUI 的 Python（tools/comfyui/runtime/.venv/Scripts/python.exe）。直接改 card.json：產圖中的角色不要用。
"""
import json
import os
import sys

import cv2
import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
a = sys.argv[1:]
if not a:
    sys.exit(__doc__)
cid = a[0]
dry = '--dry' in a
only = [x for x in a[1:] if not x.startswith('--')]
W = os.path.join(ROOT, 'tools', 'charwork', cid)
p = os.path.join(ROOT, 'src', 'assets', 'characters', cid, 'card.json')
c = json.load(open(p, encoding='utf-8'))


def masks(b):
    r, g, bb = [b[..., i].astype(int) for i in range(3)]
    Y = (0.299 * r + 0.587 * g + 0.114 * bb) / 255
    # SCAR：KILN 的紅色燙疤；iris：橘紅的虹膜（不能當成疤）
    scar = (r > 150) & (r - g > 40) & (g < 175) & (bb > 60) & (r - bb < 140)
    iris = (r > 170) & (bb < 70) & (r - bb > 130)
    eye = ((Y < 0.3) | ((Y > 0.88) & (np.abs(r - bb) < 25)) | iris).astype(np.uint8)
    return scar, eye


prev = []
for P in c['poses']:
    x, y, w, h = [int(v) for v in P['boxes']['eyes']]
    for k, s in P['ex'].items():
        if not k.endswith(('.e1', '.e2')) or s.get('skip') or not s.get('pick'):
            continue
        if only and P['id'] + ':' + k not in only:
            continue
        e0 = k.split('.')[0]
        bf = P['master'] if e0 == 'neutral' else P['ex'][e0]['pick']
        b = np.asarray(Image.open(os.path.join(W, bf)).convert('RGB'))
        f = np.asarray(Image.open(os.path.join(W, s['pick'])).convert('RGB'))
        scar, eye = masks(b)
        reg = np.zeros(eye.shape, np.uint8)
        reg[y:y + h, x:x + w] = 1
        eye *= reg
        # 眼睛開口（深色線條、眼白、虹膜）連起來填滿再外擴：裡面的不換
        eye = cv2.morphologyEx(eye, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
        cnt, _ = cv2.findContours(eye, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        fill = np.zeros_like(eye)
        cv2.drawContours(fill, [q for q in cnt if cv2.contourArea(q) > 150], -1, 1, -1)
        fill = cv2.dilate(fill, np.ones((7, 7), np.uint8))
        m = (scar & (fill == 0) & (reg > 0)).astype(np.float32)
        m = cv2.GaussianBlur(m, (0, 0), 1.2)[..., None]
        out = (b * m + f * (1 - m)).round().astype(np.uint8)
        if dry:
            sl = (slice(max(0, y - 10), y + h + 10), slice(max(0, x - 10), x + w + 10))
            prev.append(np.concatenate([b[sl], f[sl], out[sl]], 1))
            continue
        nf = s['pick'].replace('.webp', '_s.webp')
        Image.fromarray(out).save(os.path.join(W, nf), lossless=True)
        s.setdefault('cands', []).append(nf)
        s['pick'] = nf
        print(P['id'] + ':' + k, '→', nf)
if dry:
    if prev:
        mw = max(q.shape[1] for q in prev[:4])
        o = os.path.join(ROOT, 'test-results', 'portrait-qa', 'sheets', f'{cid}_scar.jpg')
        os.makedirs(os.path.dirname(o), exist_ok=True)
        Image.fromarray(np.concatenate([np.pad(q, ((0, 0), (0, mw - q.shape[1]), (0, 0))) for q in prev[:4]], 0)).save(o)
        print(o)
else:
    open(p, 'w', encoding='utf-8', newline='\n').write(json.dumps(c, ensure_ascii=False, indent=2) + '\n')
