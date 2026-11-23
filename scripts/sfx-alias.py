"""舊素材（src/assets/sfx、sfx2、synth.js 的 ~ 鍵）→ 自製 AI 音效的對照表（docs/sfx-gen-design.md 第 8 節）

依 docs/sfx-inventory 每一項「目前的聲音」欄裡的舊鍵（展開 rifleN1-4、mHit1/2/4 這類寫法），
寫成 src/audio/sfx-alias.js：audio.js 的 play 收到舊鍵、而對應的 AI 音效已經載入時改播 AI 音效。
用法：tools/sfxgen/venv/Scripts/python scripts/sfx-alias.py [--report]
"""
import collections
import glob
import importlib.util
import json
import os
import re
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))


def expand(tok):
    m = re.match(r'^(~?[A-Za-z]+)(\d+)((?:[-/]\d+)*)$', tok)
    if not m:
        return [tok]
    base, first, rest = m.group(1), int(m.group(2)), m.group(3)
    out = [first]
    for sep, n in re.findall(r'([-/])(\d+)', rest):
        n = int(n)
        if sep == '-':
            out += list(range(out[-1] + 1, n + 1))
        else:
            out.append(n)
    return [f'{base}{i}' for i in out]


def main():
    sys.argv = [sys.argv[0]] + [a for a in sys.argv[1:]]
    spec = importlib.util.spec_from_file_location('m', os.path.join(ROOT, 'scripts', 'sfx-make.py'))
    m = importlib.util.module_from_spec(spec)
    argv = sys.argv
    sys.argv = ['x']
    spec.loader.exec_module(m)
    sys.argv = argv
    have = set(re.sub(r'_\d+\.mp3$', '', os.path.basename(f)) for f in glob.glob(os.path.join(ROOT, 'src/assets/sfx3/*.mp3')))
    old = set(os.path.basename(f)[:-4] for d in ('sfx', 'sfx2') for f in glob.glob(os.path.join(ROOT, f'src/assets/{d}/*.mp3')))
    alias = collections.OrderedDict()
    for it in m.parse():
        if it['key'] not in have:
            continue
        for tok in re.findall(r'`?(~?[A-Za-z][A-Za-z0-9]*(?:[-/]\d+)*)`?', it['cur']):
            for k in expand(tok):
                if (k in old or k.startswith('~')) and k not in alias:
                    alias[k] = it['key']
    # 清單的「目前的聲音」欄沒寫到的（後備、共用的）手動補上
    MANUAL = {'bing': 'parry_clash', 'clash1': 'parry_clash', 'clash2': 'parry_clash', 'clash3': 'parry_clash',
              'clash4': 'parry_clash', 'clashHvy': 'parry_clash', 'fly1': 'air_flyby', 'fly2': 'air_flyby',
              'fly3': 'air_flyby', 'fly4': 'air_flyby', 'fly5': 'air_flyby', 'hit2': 'hit_armor',
              'hvyN1': 'gun_cannon_near', 'hvyN2': 'gun_cannon_near', 'rifle': 'gun_rifle_near',
              'rifle2': 'gun_rifle_near', 'shotgun': 'gun_sg_near'}
    for k, v in MANUAL.items():
        alias.setdefault(k, v)
    out = os.path.join(ROOT, 'src', 'audio', 'sfx-alias.js')
    with open(out, 'w', encoding='utf-8', newline='\n') as f:
        f.write('// 舊素材 → 自製 AI 音效的對照表（scripts/sfx-alias.py 產生，不要手改；docs/sfx-gen-design.md）\n')
        f.write('export const SFX_ALIAS = ' + json.dumps(alias, ensure_ascii=False, indent=2) + ';\n')
    if '--report' in sys.argv:
        src = ''
        for f in glob.glob(os.path.join(ROOT, 'src/**/*.js'), recursive=True):
            if f.endswith('sfx-data.js') or f.endswith('sfx-alias.js'):
                continue
            src += open(f, encoding='utf-8').read()
        used = [k for k in sorted(old) if re.search(r"['\"]" + re.escape(k) + r"['\"]", src)]
        miss = [k for k in used if k not in alias]
        print(f'舊素材 {len(old)}、程式裡用到 {len(used)}、有對應 {len(used) - len(miss)}、沒有對應 {len(miss)}')
        print(' '.join(miss))
    print(f'對照表 {len(alias)} 項 → src/audio/sfx-alias.js')


if __name__ == '__main__':
    main()
