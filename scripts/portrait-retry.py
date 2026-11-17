# 影格的「多試幾個種子、挑最好的」（2026-11-15 立繪大修，docs/portrait-design.md）：
#   python scripts/portrait-retry.py <角色> e1 [--tries=4] [--only=p1:smile,p2:angry]
#   python scripts/portrait-retry.py <角色> e2 [--tries=4] [--slots=p3:focus,p9:neutral]
# e1：挑虹膜剩下的比例最接近 0.4 的（0.15～0.65 才算合格）；一開始就合格的不重產
# e2：挑虹膜剩下最少、而且兩眼都改了的（iris ≤ 0.08、side ≥ 同姿勢中位數的一半）
# 每一輪呼叫 scripts/chargen.js char <角色> frames --only=…（伺服器與 ComfyUI 要開著），量 scripts/portrait-qa.py 的指標；
# 最後把最好的候選寫回 card 的 pick（候選都在 slot.cands 裡）。產圖批次正在處理同一個角色時不要用。
import json, os, subprocess, sys, importlib.util

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
spec = importlib.util.spec_from_file_location('qa', os.path.join(ROOT, 'scripts', 'portrait-qa.py'))
qa = importlib.util.module_from_spec(spec)
spec.loader.exec_module(qa)
import numpy as np

cid, fid = sys.argv[1], sys.argv[2]
opt = dict(a[2:].split('=', 1) for a in sys.argv[3:] if a.startswith('--') and '=' in a)
tries = int(opt.get('tries', 4))
only = set(opt['only'].split(',')) if 'only' in opt else None
path = os.path.join(ROOT, 'src', 'assets', 'characters', cid, 'card.json')


def card():
    return json.load(open(path, encoding='utf-8'))


import scipy.ndimage as nd
from PIL import Image
GP = os.path.join(ROOT, 'tools', 'comfyui', 'runtime', 'work', 'glassprobe')
_gm = {}


def frame_mask(c, pid):
    """戴眼鏡的姿勢的鏡框（主圖和「拿掉眼鏡」的探測圖比，細的深色、低飽和的線）；沒有探測圖＝None"""
    if pid in _gm:
        return _gm[pid]
    P = [p for p in c['poses'] if p['id'] == pid][0]
    pf = os.path.join(GP, f'{cid}_{pid}.png')
    if not os.path.exists(pf):
        _gm[pid] = None
        return None
    m = qa.load(cid, P['master'])
    g = np.asarray(Image.open(pf).convert('RGB').resize((m.shape[1], m.shape[0]))).astype(np.float32) / 255
    Y = lambda a: a @ np.array([0.299, 0.587, 0.114], np.float32)
    sat = m.max(-1) - m.min(-1)
    G = ((Y(g) - Y(m)) > 0.12) & (Y(m) < 0.5) & (sat < 0.25)
    G = nd.binary_opening(G, iterations=1)
    lab, k = nd.label(G)
    if k:
        sz = nd.sum(G, lab, range(1, k + 1))
        G = np.isin(lab, [i + 1 for i, s in enumerate(sz) if s >= 25])
    _gm[pid] = G if G.sum() > 50 else None
    return _gm[pid]


def measure(c, pid, e, f):
    P = [p for p in c['poses'] if p['id'] == pid][0]
    B = P['boxes']
    base = qa.load(cid, P['master'] if e == 'neutral' else P['ex'][e]['pick'])
    cand = qa.load(cid, f)
    pal = np.vstack([qa.palette(base, B['face']), qa.palette(base, B['eyes'], 16)])
    r = qa.metrics(base, cand, B['eyes'], pal, fid)
    G = frame_mask(c, pid)
    if G is not None:
        Y = lambda a: a @ np.array([0.299, 0.587, 0.114], np.float32)
        r['glass'] = float((Y(cand)[G] < Y(base)[G] + 0.12).mean())
    return r


def score(r):
    """越小越好；None＝不合格"""
    ir = r.get('iris')
    if r['out'] > 0.002 or r['alien'] > 0.03:
        return None
    if r.get('glass', 1) < 0.92:  # 鏡框被改掉
        return None
    if fid == 'e1':
        if ir is None:
            return abs(r['chg'] - 0.3) if 0.15 < r['chg'] < 0.6 else None
        return abs(ir - 0.4) if 0.15 <= ir <= 0.65 else None
    if ir is not None and ir > 0.08:
        return None
    return (ir or 0) - r.get('side', 1) * 0.1


def targets(c):
    out = []
    for P in c['poses']:
        nb = ['laugh', 'wink'] + (P.get('noBlink') or [])
        for k, s in P['ex'].items():
            if not k.endswith('.' + fid) or not s.get('pick'):
                continue
            e = k.split('.')[0]
            if e in nb:
                continue
            tag = f"{P['id']}:{e}"
            if only and tag not in only:
                continue
            out.append((P['id'], e, s))
    return out


import time
# 只比新流程的候選：--since（epoch 秒）之後寫的檔案；預設＝2026-11-15 這次改 e1 指示之後（舊流程的候選有殘影）
SINCE = float(opt.get('since', time.mktime((2026, 11, 15, 21, 15, 0, 0, 0, -1))))
WK = os.path.join(ROOT, 'tools', 'charwork', cid)
fresh = lambda f: os.path.exists(os.path.join(WK, f)) and os.path.getmtime(os.path.join(WK, f)) >= SINCE
c = card()
best = {}
todo = []
for pid, e, s in targets(c):
    for f in [x for x in dict.fromkeys([s['pick']] + s.get('cands', [])) if fresh(x)]:
        try:
            sc = score(measure(c, pid, e, f))
        except Exception:
            continue
        if sc is not None and (f'{pid}:{e}' not in best or sc < best[f'{pid}:{e}'][0]):
            best[f'{pid}:{e}'] = (sc, f)
    if f'{pid}:{e}' not in best or (fid == 'e1' and best[f'{pid}:{e}'][0] > 0.15):
        todo.append(f'{pid}:{e}')
print(cid, fid, '要重試', len(todo), '格', flush=True)
import urllib.request


def comfy_up():
    try:
        urllib.request.urlopen('http://127.0.0.1:8188/system_stats', timeout=3)
        return True
    except Exception:
        return False


t = 0
fails = 0
while t < tries and todo and fails < 30:
    # ComfyUI 被產圖批次重開時：等它回來，這一輪不算
    while not comfy_up():
        time.sleep(10)
    arg = ','.join(f'{x}.{fid}' for x in todo)
    r = subprocess.run(['node', 'scripts/chargen.js', 'char', cid, 'frames', '--only=' + arg], cwd=ROOT,
                       capture_output=True, text=True, encoding='utf-8', errors='replace')
    if r.returncode != 0:
        fails += 1
        print('  chargen 中斷（不算一輪），等 ComfyUI', r.stderr[-200:].strip(), flush=True)
        time.sleep(20)
        # 中斷前已經產好的格子照樣量
    else:
        t += 1
    c = card()
    nxt = []
    for x in todo:
        pid, e = x.split(':')
        P = [p for p in c['poses'] if p['id'] == pid][0]
        f = P['ex'][f'{e}.{fid}']['pick']
        sc = score(measure(c, pid, e, f))
        if sc is not None and (x not in best or sc < best[x][0]):
            best[x] = (sc, f)
        if x not in best or (fid == 'e1' and best[x][0] > 0.15):
            nxt.append(x)
    print(f'  第 {t} 輪後還有 {len(nxt)} 格', flush=True)
    todo = nxt
# 寫回最好的
c = card()
fail = []
for pid, e, s in targets(c):
    x = f'{pid}:{e}'
    if x in best:
        s['pick'] = best[x][1]
        s['v2'] = True
        s.pop('skip', None)
    else:
        fail.append(x)
open(path, 'w', encoding='utf-8', newline='\n').write(json.dumps(c, ensure_ascii=False, indent=2) + '\n')
print(cid, fid, '完成；還是不合格：', ','.join(fail) or '無', flush=True)
