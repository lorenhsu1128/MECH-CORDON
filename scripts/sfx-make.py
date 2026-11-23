"""自製音效的產生流程（docs/sfx-gen-design.md 第 6～7 節）

項目表就是 docs/sfx-inventory/*.md 的表格（建議的鍵、事件、目前的聲音、觸發處、長度、變化數、英文提示詞）：
改提示詞、長度、變化數直接改那三份文件。分期見 PHASE_OF。

用法（環境由 npm run sfx:setup 裝在 tools/sfxgen/）：
  tools/sfxgen/venv/Scripts/python scripts/sfx-make.py list  --phase=2         列出這一期的項目與產生次數
  tools/sfxgen/venv/Scripts/python scripts/sfx-make.py gen   --phase=2 [--only=鍵,…]   產生候選（變化數 × 3）→ tools/sfxgen/cand/<鍵>/<n>.wav
  tools/sfxgen/venv/Scripts/python scripts/sfx-make.py score --phase=2         CLAP＋品質量測 → 每個鍵挑出變化數個 → tools/sfxgen/picks.json
  tools/sfxgen/venv/Scripts/python scripts/sfx-make.py pack  --phase=2         挑中的修剪、淡出、統一響度、循環音接縫 → src/assets/sfx3/<鍵>_<n>.mp3
  tools/sfxgen/venv/Scripts/python scripts/sfx-make.py page  --phase=2         試聽頁 tools/sfx-trial/p<期>.html（挑中的與舊的並排）
  tools/sfxgen/venv/Scripts/python scripts/sfx-make.py all   --phase=2         gen → score → pack → page
已經有的候選不重做（中斷之後重跑就接著做）；進度寫在 tools/sfxgen/status.txt。
"""
import glob
import html
import json
import os
import re
import sys
import time

sys.path.insert(0, os.path.dirname(__file__))
import sfx_lib as L  # noqa: E402

ROOT = L.ROOT
INV = os.path.join(ROOT, 'docs', 'sfx-inventory')
CAND = os.path.join(L.TOOLS, 'cand')
OUT = os.path.join(ROOT, 'src', 'assets', 'sfx3')
TRIAL = os.path.join(ROOT, 'tools', 'sfx-trial')
STATUS = os.path.join(L.TOOLS, 'status.txt')
PICKS = os.path.join(L.TOOLS, 'picks.json')
SCORES = os.path.join(L.TOOLS, 'scores.json')
NCAND = 3  # 每個變化 3 個候選（使用者定案）
STEPS = 40  # 去噪步數：30 步的 CLAP 分數和 100 步相同、快 4 倍（docs 第 7 節），保險起見用 40
MAXS = 30  # 潛在空間一律 30 秒：算短的（4～10 秒）CLAP 分數掉很多

# 共同的風格描述（使用者定案：實彈、爆炸、機體寫實厚重；能量、推進器、介面動漫科幻），接在每句提示詞後面
NEG = 'music, melody, speech, voice, singing, low quality, distorted, clipping'

# 第 3 節（自機）裡屬於第 2 期（武器、命中、近戰）的鍵
P2_SELF = re.compile(
    r'^(melee_|parry|pqb|counter_start|hitconf|crit$|reload|dry_fire|weapon_drop|charge_|power_shot|missile_|emp_|ar_)'
)


def phase_of(fname, section, key):
    if fname == 'general':
        if section.startswith('1') or section.startswith('2'):
            return 3 if key == 'stagger' else 2
        if section.startswith('3'):
            return 2 if P2_SELF.match(key) else 3
        return 5
    return 4


# 第 4 期的合併規則（2026-11-22 使用者定案）：
# 1. Boss 的提示訊號（玩家要學會的：被打斷、失衡、破綻、裝甲殼、換型態、狂暴、最終型態、部位破壞、打回去、防禦、閃避、
#    大招蓄力開始）所有 Boss 共用一個；登場、移動、大招的蓄力循環與放出、各招式、擊破各自一個
# 2. 敵人的開火聲照武器分（第 2 期的槍聲）；腳步、推進器、QB 照機體（第 3 期）——清單裡這類的列不產生
BOSS_SHARED = {
    'interrupt': 'Heavy machine power failure: a charging energy weapon abruptly cut off, electric crackle and descending whine, metallic clank',
    'stagger': 'Giant war machine systems overloaded and stunned: deep metallic groan, sparking electrical failure, servo motors whining down',
    'open': 'Armor plates sliding open to expose a glowing weak point: heavy mechanical unlatching, hydraulic hiss, bright energy hum swelling',
    'shell_on': 'Heavy armor shell slamming shut around a giant machine: thick metal plates locking with a deep clang and hydraulic hiss',
    'shell_break': 'Thick armor shell shattering: huge metal crack, plates bursting apart, debris clatter, satisfying heavy impact',
    'phase': 'Giant boss machine transforming into its next form: deep rising mechanical roar, energy surge, heavy shockwave boom',
    'enrage': 'Giant machine going berserk: distorted alarm-like mechanical howl, reactor overdrive surge, aggressive rising whine',
    'final_call': 'Final form awakening of a giant war machine: massive reactor ignition, deep ominous rumble building to a roaring energy burst',
    'part_break': 'A weapon part blown off a giant machine: sharp metal rupture, small explosion, sparking cables, debris falling',
    'body_break': 'A large armor section torn off a giant robot body: tearing steel, heavy crunch, fire burst, plates clattering on the ground',
    'reflect': 'Projectile knocked back and deflected: sharp energy parry ping with a metallic ricochet whoosh',
    'guard_up': 'Massive hexagonal energy shield deploying: anime sci-fi barrier activation, rising electric hum and shimmering chime',
    'guard_hit': 'Bullets and blasts hitting a huge energy barrier: rippling sci-fi shield impact with glassy resonant hum',
    'dodge': 'Heavy boss mech evading with a sudden thruster sidestep: sharp jet burst whoosh, metallic servo snap',
    'charge_start': 'Warning: a giant machine begins charging its ultimate attack, ominous rising energy hum with a low pulsing alarm tone',
}
WEAPON_RE = re.compile(r'(GT-70|BZ-31|MS-4|MS-8|LC-055|LCB|LR-40|GL-90|GL-12|SG-33|RF-31|MG-18|HG-22|PM-6|EMP-9|機槍|機砲|霰彈|雷射步槍|榴彈砲|火箭筒|導彈|飛彈|榴彈|狙擊|步槍|手槍|加特林)')
AC_SKIP = re.compile(r'^(ac|ace)_[a-z0-9]+_(boost|qb|ab|step|die|shield|lc|hg|sg|ms8|ms|rifle|mg|bz|gat|gr|blade|lr|claw|pile|saber|lsg|emp|pm)$')


def p4_rule(key, desc, cur):
    """回傳 None＝不產生、字串＝改用這個鍵（共用的）、True＝照原樣"""
    if AC_SKIP.match(key):
        return None
    if re.match(r'^(W-|C-STEP|C-THR|C-QB)', cur):
        return None
    if re.search(r'shot\(', cur) and WEAPON_RE.search(desc) and '最終型態' not in desc:
        return None
    m = re.match(r'^boss_[a-z0-9]+_(.+)$', key)
    if m and m.group(1) in BOSS_SHARED and not key.startswith('boss_common'):
        return 'boss_common_' + m.group(1)
    return True


def parse():
    items = []
    seen = set()
    for fname in ('general', 'enemies', 'bosses'):
        path = os.path.join(INV, fname + '.md')
        sec = ''
        for line in open(path, encoding='utf-8'):
            m = re.match(r'^#+\s*(\S+)', line)
            if m:
                sec = m.group(1)
                continue
            if not line.startswith('|') or '---' in line:
                continue
            c = [x.strip() for x in line.strip().strip('|').split('|')]
            if len(c) < 7:
                continue
            key = c[0].strip('`').strip()
            if not re.match(r'^[a-zA-Z][a-zA-Z0-9_]*$', key) or key in ('鍵',):
                continue
            key = key.lower()
            prompt = c[-1].strip()
            if not prompt or '負責' in prompt or prompt.startswith('（'):
                continue
            ln = re.search(r'[\d.]+', c[-3])
            secs = float(ln.group()) if ln else 1.5
            vm = re.search(r'\d+', c[-2])
            var = int(vm.group()) if vm else 1
            loop = '循環' in line
            ph = phase_of(fname, sec, key)
            if ph == 4:
                r = p4_rule(key, c[1], c[2])
                if r is None:
                    continue
                if isinstance(r, str):
                    key = r
                    prompt = BOSS_SHARED[r[len('boss_common_'):]]
                    var = 3
            if key in seen:
                continue
            seen.add(key)
            items.append(
                dict(key=key, desc=c[1], cur=c[2], secs=max(0.2, secs), var=max(1, var), prompt=prompt, loop=loop,
                     src=fname, sec=sec, phase=ph)
            )
    return items


def maxs_for(it):
    """去噪的潛在空間長度（秒）：短的聲音不必算滿 30 秒（docs 第 7 節的量測）"""
    need = it['secs'] + (1.5 if it['loop'] else 1.0)
    if it['loop']:
        need = max(need, it['secs'] * 1.5 + 2)
    for m in (4, 6, 8, 10, 15, 20, 30):
        if m >= need:
            return m
    return 30


def gen_secs(it):
    """要模型產生的長度：循環音多產生一些給接縫的交叉淡化"""
    s = it['secs'] * 1.5 + 2 if it['loop'] else it['secs'] + 0.5
    return min(s, MAXS - 0.5)  # 不能超過潛在空間的長度（30 秒）


def arg(k, d=None):
    for a in sys.argv[2:]:
        if a.startswith('--' + k + '='):
            return a.split('=', 1)[1]
    return d


def status(s):
    with open(STATUS, 'w', encoding='utf-8') as f:
        f.write(time.strftime('%H:%M ') + s)
    print(s, flush=True)


def sel():
    # --keys=<檔案>：補做（一行一個鍵，不分期）；試聽頁叫 redo
    kf = arg('keys')
    if kf:
        ks = set(x.strip() for x in open(kf, encoding='utf-8') if x.strip())
        return 'redo', [i for i in parse() if i['key'] in ks]
    ph = int(arg('phase', '2'))
    only = arg('only')
    its = [i for i in parse() if i['phase'] == ph and (not only or i['key'] in only.split(','))]
    return ph, its


def n_cand(it):
    """這一項要有幾個候選：變化數 × 3；補做（--extra=N）時在已有的之外再多 變化數 × N 個"""
    n = it['var'] * NCAND
    ex = int(arg('extra', '0'))
    if ex:
        have = len(glob.glob(os.path.join(CAND, it['key'], '*.wav')))
        n = max(n, have) + it['var'] * ex
    return n


def cmd_list():
    ph, its = sel()
    n = sum(i['var'] * NCAND for i in its)
    for i in its:
        print(f"{i['key']:32s} {i['secs']:5.1f}s ×{i['var']} {'循環' if i['loop'] else ''} max{maxs_for(i)}")
    print(f'第 {ph} 期：{len(its)} 項、產生 {n} 次')


def cmd_gen():
    import torch

    ph, its = sel()
    want = {i['key']: n_cand(i) for i in its}
    todo = [(i, v) for i in its for v in range(want[i['key']])
            if not os.path.exists(os.path.join(CAND, i['key'], f'{v}.wav'))]
    total = sum(want.values())
    done0 = total - len(todo)
    if not todo:
        status(f'第 {ph} 期的候選已經全部產生（{total} 個）')
        return
    t0 = time.time()
    pipe = L.load_moss()
    for n, (it, v) in enumerate(todo):
        t = time.time()
        y, sr = L.moss_gen(pipe, it['prompt'], gen_secs(it), seed=hash_seed(it['key'], v), maxs=MAXS, steps=STEPS, neg=NEG)
        L.save_wav(y, sr, os.path.join(CAND, it['key'], f'{v}.wav'))
        el = time.time() - t0
        left = el / (n + 1) * (len(todo) - n - 1)
        status(f"第 {ph} 期產生 {done0 + n + 1}／{total}（{it['key']} #{v} {time.time() - t:.0f} 秒；"
               f"剩約 {left / 3600:.1f} 小時；顯示卡最多 {torch.cuda.max_memory_allocated() / 2**30:.1f} GB）")
    del pipe
    import gc

    gc.collect()
    torch.cuda.empty_cache()


def hash_seed(key, v):
    h = 0
    for ch in key:
        h = (h * 131 + ord(ch)) & 0x7FFFFFF
    return h + v * 7919


def cmd_score():
    import soundfile as sf

    ph, its = sel()
    C = L.Clap()
    scores = json.load(open(SCORES, encoding='utf-8')) if os.path.exists(SCORES) else {}
    picks = json.load(open(PICKS, encoding='utf-8')) if os.path.exists(PICKS) else {}
    for k, it in enumerate(its):
        files = sorted(glob.glob(os.path.join(CAND, it['key'], '*.wav')), key=lambda p: int(os.path.basename(p)[:-4]))
        if not files:
            continue
        res = []
        for f in files:
            y, sr = sf.read(f, dtype='float32')
            y = L.post(y, sr, it['secs'] if not it['loop'] else gen_secs(it))
            q = L.quality(y, sr)
            s = C.score(y, sr, it['prompt'])
            # 總分：CLAP 為主；削波、幾乎沒聲音、太短扣分（循環音不看起音）
            tot = s
            tot -= 0.5 * q['clip'] * 100
            if q['active'] < min(0.15, it['secs'] * 0.3):
                tot -= 0.3
            if q['len'] < it['secs'] * 0.4 and not it['loop']:
                tot -= 0.1
            res.append(dict(f=os.path.basename(f), clap=round(s, 4), tot=round(tot, 4), **{a: round(b, 4) for a, b in q.items()}))
        res.sort(key=lambda r: -r['tot'])
        scores[it['key']] = res
        picks[it['key']] = [r['f'] for r in res[: it['var']]]
        status(f"第 {ph} 期評分 {k + 1}／{len(its)}（{it['key']}：最高 {res[0]['clap']:.3f}）")
    save_json(SCORES, scores)
    save_json(PICKS, picks)


def save_json(path, obj):
    """先寫暫存檔再改名（直接覆寫時被中斷或同時寫，會留下殘缺的 JSON）"""
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)
    os.replace(tmp, path)


_LU = {}


def old_loudness(it):
    """這一項取代的舊素材（「目前的聲音」欄裡的鍵，src/assets/sfx、sfx2）的平均響度；配方的音量是照舊素材調的，
    新素材對齊它就不用重調混音。找不到時回傳 None"""
    import librosa
    import pyloudnorm as pyln

    vals = []
    for k in re.findall(r'`([A-Za-z][A-Za-z0-9]*)`', it['cur']):
        for d in ('sfx', 'sfx2'):
            f = os.path.join(ROOT, 'src', 'assets', d, k + '.mp3')
            if not os.path.exists(f):
                continue
            if f not in _LU:
                y, sr = librosa.load(f, sr=None, mono=True)
                try:
                    _LU[f] = pyln.Meter(sr, block_size=min(0.4, len(y) / sr * 0.9)).integrated_loudness(y)
                except Exception:
                    _LU[f] = None
            if _LU[f] is not None and _LU[f] > -70:
                vals.append(_LU[f])
    return sum(vals) / len(vals) if vals else None


def cmd_pack():
    import pyloudnorm as pyln
    import soundfile as sf

    ph, its = sel()
    picks = json.load(open(PICKS, encoding='utf-8'))
    tmp = os.path.join(L.TOOLS, 'packtmp')
    for it in its:
        for old in glob.glob(os.path.join(OUT, it['key'] + '_*.mp3')):
            os.remove(old)
        for n, fn in enumerate(picks.get(it['key'], [])):
            y, sr = sf.read(os.path.join(CAND, it['key'], fn), dtype='float32')
            if it['loop']:
                y = L.post(y, sr, gen_secs(it), fade_out=0.0, trim_db=-60)
                y = L.loopify(y, sr, xf=min(1.0, len(y) / sr / 4))
            else:
                y = L.post(y, sr, it['secs'])
            # 響度：對齊取代的舊素材；沒有舊素材時循環音 −23 LUFS、其他 −16 LUFS；峰值不超過 −1 dB
            meter = pyln.Meter(sr, block_size=min(0.4, len(y) / sr * 0.9))
            try:
                lu = meter.integrated_loudness(y)
                tgt = old_loudness(it)
                if tgt is None:
                    tgt = -23.0 if it['loop'] else -16.0
                if lu > -70:
                    y = y * 10 ** ((tgt - lu) / 20)
            except Exception:
                pass
            pk = float(abs(y).max()) or 1.0
            if pk > 0.891:
                y = y * (0.891 / pk)
            w = os.path.join(tmp, f"{it['key']}_{n}.wav")
            L.save_wav(y, sr, w)
            L.to_mp3(w, os.path.join(OUT, f"{it['key']}_{n}.mp3"), kbps=96)
        status(f"第 {ph} 期打包：{it['key']}")
    status(f'第 {ph} 期打包完成 → src/assets/sfx3/')


def cmd_page():
    ph, its = sel()
    scores = json.load(open(SCORES, encoding='utf-8')) if os.path.exists(SCORES) else {}
    d = os.path.join(TRIAL, f'p{ph}')
    os.makedirs(d, exist_ok=True)
    rows = []
    import shutil

    for it in its:
        cells = []
        for f in sorted(glob.glob(os.path.join(OUT, it['key'] + '_*.mp3'))):
            shutil.copy(f, os.path.join(d, os.path.basename(f)))
            b = os.path.basename(f)
            cells.append(f'<div class="c"><b>{b[:-4]}</b><audio controls preload="none" src="p{ph}/{b}"></audio></div>')
        sc = scores.get(it['key'], [])
        info = f"CLAP 最高 {sc[0]['clap']:.2f}" if sc else ''
        rows.append(f"<section><h2>{html.escape(it['key'])}　<small>{html.escape(it['desc'])}</small></h2>"
                    f"<p class=p>{html.escape(it['prompt'])}　<i>{info}{'　循環' if it['loop'] else ''}</i></p>"
                    f"<div class=g>{''.join(cells)}</div></section>")
    doc = f'''<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><title>音效第 {ph} 期</title>
<style>body{{font-family:"Noto Sans TC",system-ui,sans-serif;background:#16181c;color:#e8e8e8;margin:0;padding:24px;max-width:1200px}}
h1{{font-size:22px}} h2{{font-size:16px;margin:0 0 4px}} small{{color:#9aa3ad;font-weight:normal}} section{{background:#20242a;border-radius:10px;padding:12px 14px;margin:12px 0}}
.p{{color:#9aa3ad;font-size:12px;margin:0 0 8px}} .g{{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:8px}}
.c{{background:#2a2f37;border-radius:8px;padding:8px;font-size:12px;border-left:4px solid #d7ff3c}} .c b{{display:block;margin-bottom:4px}} .c audio{{width:100%;height:30px}}</style></head>
<body><h1>音效第 {ph} 期（MOSS，自動挑選）</h1><p>{len(its)} 項。每項是挑中的變化版本，已修剪、淡出、統一響度。不好的告訴我鍵名。</p>{"".join(rows)}</body></html>'''
    with open(os.path.join(TRIAL, f'p{ph}.html'), 'w', encoding='utf-8') as f:
        f.write(doc)
    status(f'第 {ph} 期試聽頁：tools/sfx-trial/p{ph}.html')


def main():
    c = sys.argv[1] if len(sys.argv) > 1 else ''
    if c == 'list':
        cmd_list()
    elif c == 'gen':
        cmd_gen()
    elif c == 'score':
        cmd_score()
    elif c == 'pack':
        cmd_pack()
    elif c == 'page':
        cmd_page()
    elif c == 'all':
        cmd_gen()
        cmd_score()
        cmd_pack()
        cmd_page()
    else:
        print(__doc__)


if __name__ == '__main__':
    main()
