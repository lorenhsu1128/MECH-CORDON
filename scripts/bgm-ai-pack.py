"""AI 配樂（scripts/bgm-gen.py 產生、scripts/bgm-score.py 挑好的）→ 遊戲用的 src/assets/bgm-ai/c<章>/

用法：npm run bgm:gen -- --ch=<章> 的最後一步會自動跑（或 python scripts/bgm-ai-pack.py --ch=<章>，要 numpy 與 imageio-ffmpeg）
每種類型：挑中的交戰版 → <類型>.mp3、輕快版 → <類型>_calm.mp3；index.json 記歌名、聲線、長度、副歌的時間（Boss 最終型態
切到主題歌的副歌用）、有沒有輕快版。響度照 RMS 正規化（每首差不多大聲）、峰值限制、頭尾 0.4 秒淡入淡出（循環的接縫）、
44.1 kHz 立體聲 96 kbps。建置時每章寫成一個 lib/bgm-c<章>.js（window.MECH_CORDON_BGM_C<章>），進到那一章的任務才載入。
"""
import json
import os
import subprocess
import sys

import numpy as np
import imageio_ffmpeg

FF = imageio_ffmpeg.get_ffmpeg_exe()
SR = 44100
FADE = 0.4
RMS = 0.13  # 目標響度
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
SRC = os.path.join(ROOT, 'tools', 'acestep', 'out')
DST = os.path.join(ROOT, 'src', 'assets', 'bgm-ai')


def load(p):
    out = subprocess.run([FF, '-v', 'quiet', '-i', p, '-ac', '2', '-ar', str(SR), '-f', 'f32le', '-'],
                         capture_output=True, check=True).stdout
    return np.frombuffer(out, dtype=np.float32).reshape(-1, 2).copy()


def write(x, path):
    nf = int(FADE * SR)
    ramp = np.linspace(0, 1, nf)[:, None]
    x[:nf] *= ramp
    x[-nf:] *= ramp[::-1]
    r = np.sqrt(np.mean(x**2)) + 1e-9
    x *= RMS / r
    # 峰值限制（柔性壓縮到 0.95）
    x = np.tanh(x / 0.95) * 0.95
    subprocess.run([FF, '-v', 'quiet', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', '-',
                    '-c:a', 'libmp3lame', '-b:a', '96k', path], input=x.astype(np.float32).tobytes(), check=True)
    return round(len(x) / SR, 2)


def main():
    opt = dict(a[2:].split('=', 1) if '=' in a else (a[2:], '1') for a in sys.argv[1:] if a.startswith('--'))
    chs = [int(opt['ch'])] if opt.get('ch') else sorted(int(d[1:]) for d in os.listdir(SRC) if d[:1] == 'c' and d[1:].isdigit())
    for ch in chs:
        src = os.path.join(SRC, f'c{ch}')
        pp = os.path.join(src, 'picks.json')
        if not os.path.exists(pp):
            print(f'第 {ch} 章還沒有挑選結果（npm run bgm:score -- --ch={ch}）')
            continue
        picks = json.load(open(pp, encoding='utf8'))
        scores = json.load(open(os.path.join(src, 'scores.json'), encoding='utf8'))
        dst = os.path.join(DST, f'c{ch}')
        os.makedirs(dst, exist_ok=True)
        idx = {}
        for typ, name in sorted(picks.items()):
            meta = json.load(open(os.path.join(src, name + '.json'), encoding='utf8'))
            dur = write(load(os.path.join(src, name + '.wav')), os.path.join(dst, typ + '.mp3'))
            calm = os.path.join(src, typ + '__calm.wav')
            has_calm = os.path.exists(calm)
            if has_calm:
                write(load(calm), os.path.join(dst, typ + '_calm.mp3'))
            s = scores.get(name, {})
            idx[typ] = {
                'title': meta['title'],
                'zh': meta['zh'],
                'voice': meta['voice'],
                'bpm': meta['bpm'],
                'key': meta['key'],
                'dur': dur,
                'chorus': s.get('chorus_at'),
                'calm': has_calm,
                'pick': name,
                'score': s.get('total'),
            }
            print(f'第 {ch} 章 {typ:13s} {meta["title"]}  {dur} 秒' + ('（含輕快版）' if has_calm else ''))
        with open(os.path.join(dst, 'index.json'), 'w', encoding='utf8', newline='\n') as fp:
            json.dump(idx, fp, ensure_ascii=False, indent=1)
        with open(os.path.join(dst, 'CREDITS.txt'), 'w', encoding='utf8', newline='\n') as fp:
            fp.write(f'Chapter {ch} mission music: generated locally with ACE-Step 1.5 (MIT) by scripts/bgm-gen.py; '
                     'original Japanese lyrics in scripts/bgm_songs/.\n')


main()
