# 把修正候選選定成表情或影格（key＝表情 id 或「表情.影格」）（2026-11-15 立繪大修）：複製進 tools/charwork/<角色>/、寫進 card.json 的 pick，
# 並清掉那個表情的影格的 v2（之後 scripts/chargen.js char <角色> frames 會重產）
#   python scripts/portrait-setpick.py <角色> <姿勢> <表情 id> <候選路徑> [<表情 id> <候選路徑> …]
# 角色的 card.json 直接改：產圖批次正在處理這個角色時不要用
import json, os, sys
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
cid, pid = sys.argv[1:3]
pairs = sys.argv[3:]
path = os.path.join(ROOT, 'src', 'assets', 'characters', cid, 'card.json')
card = json.load(open(path, encoding='utf-8'))
P = [p for p in card['poses'] if p['id'] == pid][0]
for i in range(0, len(pairs), 2):
    key, src = pairs[i], pairs[i + 1]
    name = f"{pid}_{key}_fix{os.path.splitext(os.path.basename(src))[0].split('_')[-1]}.webp"
    Image.open(src).convert('RGB').save(os.path.join(ROOT, 'tools', 'charwork', cid, name), lossless=True)
    slot = P['ex'].setdefault(key, {'cands': [], 'pick': None})
    slot.setdefault('cands', []).append(name)
    slot['pick'] = name
    if '.' in key:  # 影格（例如 focus.e2）：直接當成新版
        slot['v2'] = True
        slot.pop('skip', None)
    for f in ('e1', 'e2', 'm1', 'm2', 'm3'):
        s = P['ex'].get(f'{key}.{f}')
        if s:
            s.pop('v2', None)
    print(cid, pid, key, '→', name)
open(path, 'w', encoding='utf-8', newline='\n').write(json.dumps(card, ensure_ascii=False, indent=2) + '\n')
