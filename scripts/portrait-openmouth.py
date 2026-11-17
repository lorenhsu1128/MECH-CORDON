# 每個表情的底圖嘴巴是不是張開的（2026-11-16 立繪大修）：嘴巴框裡口腔的暗紅色（飽和、暗、偏紅）超過 6%＝張開，
# 寫進 card 的 pose.ex[表情].open（pipeline.js 的嘴型改用 OPEN_MOUTH_FRAMES：m1 不把嘴變小）
#   python scripts/portrait-openmouth.py <角色>…
import json, os, sys
import numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
for cid in sys.argv[1:]:
    path = os.path.join(ROOT, 'src', 'assets', 'characters', cid, 'card.json')
    card = json.load(open(path, encoding='utf-8'))
    out = []
    for P in card['poses']:
        B = P.get('boxes') or {}
        m0 = B.get('mouth0') or B.get('mouth')
        if not m0:
            continue
        for e, s in P['ex'].items():
            if '.' in e or not s.get('pick'):
                continue
            a = np.asarray(Image.open(os.path.join(ROOT, 'tools', 'charwork', cid, s['pick'])).convert('RGB')).astype(np.float32) / 255
            x, y, w, h = [int(v) for v in m0]
            r = a[y:y + h, x:x + w]
            L = r.mean(-1)
            sat = r.max(-1) - r.min(-1)
            inner = (sat > 0.25) & (L < 0.55) & (r[..., 0] > r[..., 2] + 0.08)
            o = bool(inner.mean() > 0.06)
            s['open'] = o
            if o:
                out.append(f"{P['id']}:{e}")
    open(path, 'w', encoding='utf-8', newline='\n').write(json.dumps(card, ensure_ascii=False, indent=2) + '\n')
    print(cid, '張嘴的表情', len(out), ' '.join(out[:12]))
