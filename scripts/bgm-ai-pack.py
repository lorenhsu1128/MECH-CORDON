"""AI 產生的配樂（scripts/bgm-gen.py 的 tools/acestep/out/*.wav）→ 試聽片段 src/assets/bgm-audition/ai_*.mp3

用法：python scripts/bgm-ai-pack.py
整首照用（頭尾淡入淡出、音量正規化、44.1 kHz 立體聲 80 kbps），index.json 裡 id 以 ai_ 開頭的項目整批換掉，
其他候選曲保留。需要 numpy 與 imageio-ffmpeg（和 scripts/bgm-audition.py 相同）。
"""
import glob
import json
import os
import subprocess

import numpy as np
import imageio_ffmpeg

FF = imageio_ffmpeg.get_ffmpeg_exe()
SR = 44100
FADE = 1.5
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
SRC = os.path.join(ROOT, 'tools', 'acestep', 'out')
OUT = os.path.join(ROOT, 'src', 'assets', 'bgm-audition')

LV = {'explore': '探索', 'alert': '警戒', 'combat': '交戰', 'boss': 'Boss'}
VIA = {'t2m': '文字直接產生', 'cover': '由交戰版改編'}


def load(p):
    out = subprocess.run([FF, '-v', 'quiet', '-i', p, '-ac', '2', '-ar', str(SR), '-f', 'f32le', '-'],
                         capture_output=True, check=True).stdout
    return np.frombuffer(out, dtype=np.float32).reshape(-1, 2).copy()


def main():
    idx_p = os.path.join(OUT, 'index.json')
    with open(idx_p, encoding='utf8') as fp:
        idx = [c for c in json.load(fp) if not c['id'].startswith('ai_')]
    for f in glob.glob(os.path.join(OUT, 'ai_*.mp3')):
        os.remove(f)
    add = []
    for w in sorted(glob.glob(os.path.join(SRC, '*.wav'))):
        name = os.path.splitext(os.path.basename(w))[0]
        mp = w[:-4] + '.json'
        if not os.path.exists(mp):
            continue
        with open(mp, encoding='utf8') as fp:
            m = json.load(fp)
        x = load(w)
        nf = int(FADE * SR)
        ramp = np.linspace(0, 1, nf)[:, None]
        x[:nf] *= ramp
        x[-nf:] *= ramp[::-1]
        x *= 0.89 / max(1e-6, np.abs(x).max())
        cid = 'ai_' + name
        subprocess.run([FF, '-v', 'quiet', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', '-',
                        '-c:a', 'libmp3lame', '-b:a', '80k', os.path.join(OUT, cid + '.mp3')],
                       input=x.astype(np.float32).tobytes(), check=True)
        lv = m['level']
        via = VIA.get(m.get('via'), '')
        if m.get('via') == 'cover':
            via += f'（交戰版 {m["src"] + 1}，強度 {m["k"]}）'
        add.append({
            'id': cid,
            'title': f'【AI】{m["title"]}・{LV[lv]}' + (f' {name[-1]}' if name[-1].isdigit() else ''),
            'artist': 'ACE-Step 1.5（本地產生）',
            'lic': 'AI 產生（模型 MIT）',
            'url': 'https://github.com/ace-step/ACE-Step-1.5',
            'use': [lv],
            'desc': f'絕區零 × 尼爾 的融合：{via}，{m["bpm"]} BPM、{m["key"]}，種子 {m["seed"]}',
            'dur': round(len(x) / SR),
            'at': 0,
        })
        print(cid, round(len(x) / SR), '秒')
    with open(idx_p, 'w', encoding='utf8', newline='\n') as fp:
        json.dump(add + idx, fp, ensure_ascii=False, indent=1)
    print('加入', len(add), '首')


main()
