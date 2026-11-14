"""AI 配樂產生中的即時試聽：tools/acestep/out/c<章>/*.wav（每產生一首）→ dist/lib/bgm-cand-c<章>.js

用法：python scripts/bgm-preview.py [--loop]（評分環境 tools/acestep/score-venv 的 python；npm run bgm:all 會在背景一起跑）
每一首候選（<類型>__f<i>、輕快版 <類型>__calm）轉成 64 kbps 的 mp3（tools/acestep/preview/，已轉過的略過），
寫成 dist/lib/bgm-cand-c<章>.js（window.MECH_CORDON_BGM_CAND_C<章>＝{ '@index': [...], id: base64 }）與章節清單
dist/lib/bgm-cand.js，標題的「AI 配樂試聽」的「產生中的曲子」區讀它們（網址帶時間，不吃快取）。不用重新建置；
這些檔案不進 git（.gitignore），正式的配樂是 bgm-ai-pack.py 打包、建置的 lib/bgm-c<章>.js。
--loop：每 60 秒檢查一次，直到 tools/acestep/out/ 有 done 檔。
"""
import base64
import json
import os
import re
import subprocess
import sys
import time

import imageio_ffmpeg

FF = imageio_ffmpeg.get_ffmpeg_exe()
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
OUT = os.path.join(ROOT, 'tools', 'acestep', 'out')
PRE = os.path.join(ROOT, 'tools', 'acestep', 'preview')
LIB = os.path.join(ROOT, 'dist', 'lib')


def once():
    chs = {}
    for d in sorted(os.listdir(OUT)):
        m = re.fullmatch(r'c(\d+)', d)
        if not m:
            continue
        ch = int(m.group(1))
        src = os.path.join(OUT, d)
        pre = os.path.join(PRE, d)
        os.makedirs(pre, exist_ok=True)
        scores = {}
        picks = {}
        try:
            scores = json.load(open(os.path.join(src, 'scores.json'), encoding='utf8'))
        except Exception:
            pass
        try:
            picks = json.load(open(os.path.join(src, 'picks.json'), encoding='utf8'))
        except Exception:
            pass
        idx, data = [], {}
        for f in sorted(os.listdir(src)):
            mm = re.fullmatch(r'([a-z]+)__(f\d+|calm)\.wav', f)
            if not mm:
                continue
            name = f[:-4]
            try:
                meta = json.load(open(os.path.join(src, name + '.json'), encoding='utf8'))
            except Exception:
                continue  # 還在寫
            mp = os.path.join(pre, name + '.mp3')
            if not os.path.exists(mp) or os.path.getmtime(mp) < os.path.getmtime(os.path.join(src, f)):
                subprocess.run([FF, '-v', 'quiet', '-y', '-i', os.path.join(src, f), '-ac', '2', '-ar', '44100',
                                '-c:a', 'libmp3lame', '-b:a', '64k', mp], check=True)
            data[name] = base64.b64encode(open(mp, 'rb').read()).decode()
            s = scores.get(name, {})
            idx.append({
                'id': name,
                'type': mm.group(1),
                'ver': 'calm' if mm.group(2) == 'calm' else 'fight',
                'cand': mm.group(2),
                'title': meta.get('title'),
                'zh': meta.get('zh'),
                'voice': meta.get('voice'),
                'bpm': meta.get('bpm'),
                'score': s.get('total'),
                'lyric': s.get('lyric'),
                'picked': picks.get(mm.group(1)) == name,
                't': int(os.path.getmtime(os.path.join(src, f))),
            })
        if not idx:
            continue
        data['@index'] = idx
        tmp = os.path.join(LIB, f'bgm-cand-c{ch}.js.tmp')
        with open(tmp, 'w', encoding='utf8', newline='\n') as fp:
            fp.write(f'// AI 配樂產生中的候選（scripts/bgm-preview.py）\nwindow.MECH_CORDON_BGM_CAND_C{ch} = ')
            json.dump(data, fp, ensure_ascii=False)
            fp.write(';\n')
        os.replace(tmp, os.path.join(LIB, f'bgm-cand-c{ch}.js'))
        chs[ch] = len(idx)
    with open(os.path.join(LIB, 'bgm-cand.js'), 'w', encoding='utf8', newline='\n') as fp:
        fp.write(f'// AI 配樂產生中的候選有哪些章（scripts/bgm-preview.py）\nwindow.MECH_CORDON_BGM_CAND = {json.dumps(chs)};\n')
    return chs


def main():
    if '--loop' not in sys.argv:
        print(once())
        return
    last = None
    while True:
        try:
            chs = once()
            if chs != last:
                print(time.strftime('%H:%M'), '試聽更新：', chs, flush=True)
                last = chs
        except Exception as e:
            print('試聽更新失敗：', e, flush=True)
        if os.path.exists(os.path.join(OUT, 'done')):
            return
        time.sleep(60)


main()
