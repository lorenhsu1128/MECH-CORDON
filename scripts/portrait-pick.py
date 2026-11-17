"""看完 portrait-sheet.py cands 的候選表之後選定（docs/portrait-qa-workflow.md）：
  python scripts/portrait-pick.py <角色> [--n=3] [--since=HH:MM|epoch] <姿勢>:<表情>.<影格>=<編號> …
編號＝候選表上的 1..n（和 cands 用同樣的 --n／--since，才會對到同一張）；0＝略過（skip：不發佈，播放器就不眨眼或不動嘴）。
例：python scripts/portrait-pick.py marsh p1:smile.e1=2 p1:smile.e2=0
直接改 card.json：chargen.js 正在產生同一個角色時不要用（會互相覆蓋）。
"""
import importlib.util
import json
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
spec = importlib.util.spec_from_file_location('sheet', os.path.join(ROOT, 'scripts', 'portrait-sheet.py'))
sh = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sh)

a = sys.argv[1:]
if not a:
    sys.exit(__doc__)
opt = dict(x[2:].split('=', 1) for x in a if x.startswith('--'))
pos = [x for x in a if not x.startswith('--')]
cid = pos[0]
n = int(opt.get('n', 3))
since = sh.since_of(opt.get('since'))
p = os.path.join(sh.CH, cid, 'card.json')
c = json.load(open(p, encoding='utf-8'))
for arg in pos[1:]:
    it, k = arg.split('=')
    pid, key = it.split(':')
    s = sh.pose(c, pid)['ex'][key]
    k = int(k)
    if k == 0:
        s['skip'] = True
        s['v2'] = True
        print(it, 'skip')
        continue
    cs = sh.recent(cid, s, n, since)
    s['pick'] = cs[k - 1]
    s['v2'] = True
    s.pop('skip', None)
    print(it, s['pick'])
open(p, 'w', encoding='utf-8', newline='\n').write(json.dumps(c, ensure_ascii=False, indent=2) + '\n')
