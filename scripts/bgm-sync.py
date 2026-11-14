"""AI 配樂的跨電腦同步：tools/acestep/out/（gitignore，wav）⇄ tools/bgm-work/（進 git，320 kbps mp3）

用法：python scripts/bgm-sync.py export|import [--ch=<章>]（評分環境 tools/acestep/score-venv；npm run bgm:sync -- export|import）
- export：out/c<章>/ 的每個候選與輕快版（<類型>__f<i>、<類型>__calm 的 wav＋json）轉成 320 kbps mp3 放進 bgm-work/c<章>/，
  scores.json、picks.json 一起複製。commit 之後別台電腦 pull 就有（產生很久，換電腦接著做時不用重做）。
- 低分刪掉的候選留下的 <名稱>.dropped（scripts/bgm-gen.py 看到就不用同一個種子重做）兩邊都照抄。
- import：bgm-work/ 有、out/ 沒有的解回 wav（48 kHz 立體聲），json 照抄；scores.json、picks.json 合併（out/ 已經有的不蓋掉）。
  之後 bgm-gen.py 看到檔案已經有就略過，AI 配樂試聽的「產生中的曲子」也列得出來。
npm run bgm:all 開始時 import、每一步之後 export。
"""
import json
import os
import re
import shutil
import subprocess
import sys

import imageio_ffmpeg

FF = imageio_ffmpeg.get_ffmpeg_exe()
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
OUT = os.path.join(ROOT, 'tools', 'acestep', 'out')
WORK = os.path.join(ROOT, 'tools', 'bgm-work')
NAME = re.compile(r'([a-z]+)__(f\d+|calm)')


def chapters(base, opt):
    if opt.get('ch'):
        return [int(opt['ch'])]
    if not os.path.isdir(base):
        return []
    return sorted(int(d[1:]) for d in os.listdir(base) if re.fullmatch(r'c\d+', d))


def load(p):
    try:
        with open(p, encoding='utf8') as fp:
            return json.load(fp)
    except Exception:
        return None


def save(p, o):
    with open(p, 'w', encoding='utf8', newline='\n') as fp:
        json.dump(o, fp, ensure_ascii=False, indent=1)


def export(opt):
    n = 0
    for ch in chapters(OUT, opt):
        src, dst = os.path.join(OUT, f'c{ch}'), os.path.join(WORK, f'c{ch}')
        os.makedirs(dst, exist_ok=True)
        for f in sorted(os.listdir(src)):
            m = NAME.fullmatch(f[:-4]) if f.endswith('.wav') else None
            if not m or not os.path.exists(os.path.join(src, f[:-4] + '.json')):
                continue
            mp = os.path.join(dst, f[:-4] + '.mp3')
            if not os.path.exists(mp) or os.path.getmtime(mp) < os.path.getmtime(os.path.join(src, f)):
                subprocess.run([FF, '-v', 'quiet', '-y', '-i', os.path.join(src, f), '-c:a', 'libmp3lame', '-b:a', '320k', mp],
                               check=True)
                n += 1
            shutil.copy2(os.path.join(src, f[:-4] + '.json'), os.path.join(dst, f[:-4] + '.json'))
        # 刪掉的候選（配樂產生器的「刪除」）也從 bgm-work 拿掉
        for f in os.listdir(dst):
            if f.endswith('.mp3') and not os.path.exists(os.path.join(src, f[:-4] + '.wav')):
                for x in ('.mp3', '.json'):
                    p = os.path.join(dst, f[:-4] + x)
                    if os.path.exists(p):
                        os.remove(p)
        for j in ('scores.json', 'picks.json'):
            if os.path.exists(os.path.join(src, j)):
                shutil.copy2(os.path.join(src, j), os.path.join(dst, j))
        # 低分刪掉的候選的標記（bgm-gen.py 看到就不用同一個種子重做）：別台重跑時才不會產生回同一首低分的歌
        for f in os.listdir(src):
            if f.endswith('.dropped'):
                shutil.copy2(os.path.join(src, f), os.path.join(dst, f))
    print(f'同步匯出：{n} 首轉成 mp3（tools/bgm-work/）')


def imp(opt):
    n = 0
    for ch in chapters(WORK, opt):
        src, dst = os.path.join(WORK, f'c{ch}'), os.path.join(OUT, f'c{ch}')
        if not os.path.isdir(src):
            continue  # 這一章別台還沒做過（--ch 指定時 chapters() 不檢查資料夾在不在）
        os.makedirs(dst, exist_ok=True)
        for f in sorted(os.listdir(src)):
            if not f.endswith('.mp3') or not NAME.fullmatch(f[:-4]):
                continue
            wav = os.path.join(dst, f[:-4] + '.wav')
            if os.path.exists(wav):
                continue
            subprocess.run([FF, '-v', 'quiet', '-y', '-i', os.path.join(src, f), '-ar', '48000', '-ac', '2', wav],
                           check=True)
            # 解回的 wav 沿用 mp3 的時間：否則 export 以為 wav 比較新，把同一首再轉一次 mp3（每轉一次音質掉一點）
            t = os.path.getmtime(os.path.join(src, f))
            os.utime(wav, (t, t))
            shutil.copy2(os.path.join(src, f[:-4] + '.json'), os.path.join(dst, f[:-4] + '.json'))
            n += 1
        for f in os.listdir(src):
            if f.endswith('.dropped') and not os.path.exists(os.path.join(dst, f)):
                shutil.copy2(os.path.join(src, f), os.path.join(dst, f))
        for j in ('scores.json', 'picks.json'):
            a = load(os.path.join(src, j))
            if not a:
                continue
            b = load(os.path.join(dst, j)) or {}
            for k, v in a.items():
                b.setdefault(k, v)
            save(os.path.join(dst, j), b)
    print(f'同步匯入：{n} 首從 tools/bgm-work/ 還原')


def main():
    opt = dict(a[2:].split('=', 1) if '=' in a else (a[2:], '1') for a in sys.argv[1:] if a.startswith('--'))
    cmd = next((a for a in sys.argv[1:] if not a.startswith('--')), '')
    if cmd == 'export':
        export(opt)
    elif cmd == 'import':
        imp(opt)
    else:
        print(__doc__)


main()
