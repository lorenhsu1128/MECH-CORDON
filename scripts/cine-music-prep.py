"""過場動畫各章的配樂（docs/cinematics.md）：把下載的曲子剪成一段 → src/assets/music/cine_c<章>.mp3

用法：python scripts/cine-music-prep.py <曲子的資料夾>（檔名照 TRACKS；下載網址見 src/assets/bgm-audition/index.json）
需要 numpy 與 imageio-ffmpeg（和 scripts/bgm-prep.py 相同）。

2026-11-06：原本的 Kevin MacLeod 換成多種樂器合奏的曲子（使用者覺得像 MIDI）。每一首從 start 秒起剪 len 秒
（劇本的 off 從這一段的開頭算：第 2 章的抉擇演出用到 off 90＋18 秒），頭 0.3 秒淡入、尾 3 秒淡出，
立體聲 44.1 kHz、96 kbps；重寫 src/assets/music/CREDITS.txt（序章的 Gregor Quendel 保留）。
"""
import os
import subprocess
import sys

import numpy as np
import imageio_ffmpeg

FF = imageio_ffmpeg.get_ffmpeg_exe()
SR = 44100

SB = ('Scott Buckley', 'CC-BY 4.0', 'https://www.scottbuckley.com.au/library/')
AN = ('Alexander Nakarada', 'CC-BY 4.0', 'https://www.serpentsoundstudios.com/ (via free-stock-music.com)')
AP = ('Alex-Productions', 'CC-BY 3.0', 'https://www.free-stock-music.com/artist.alex-productions.html')
PD = ('Punch Deck', 'CC-BY 3.0', 'https://www.free-stock-music.com/artist.punch-deck.html')

# 名稱 → (來源檔, 起點秒（None＝依響度挑）, 長度秒, 曲名, 作者, 這一章的導演風格)
# 和任務中的配樂（scripts/bgm-prep.py）不重複
TRACKS = {
    'cine_c1': ('alex-productions-hearts-of-iron.mp3', None, 150, 'Hearts Of Iron', AP, '西部對決：激烈、戲劇性的管弦'),
    'cine_c2': ('alex-productions-epic-cinematic-gaming-cyberpunk-reset.mp3', None, 150, 'Reset', AP,
                '分割畫面：電子＋管弦'),
    'cine_c3': ('alexander-nakarada-curiosity.mp3', None, 150, 'Curiosity', AN, '恐怖片：神祕、懸疑'),
    'cine_c4': ('punch-deck-100-seconds.mp3', 0, 0, '100 Seconds', PD, '倒數：黑暗的動作電子，整首'),
    'cine_c5': ('scott-buckley-hyperion.mp3', None, 150, 'Hyperion', SB, '電視牆：史詩、昂揚的混合交響'),
    'cine_c6': ('scott-buckley-aphelion.mp3', None, 240, 'Aphelion', SB, '寂靜：慢慢堆疊到史詩高潮的混合交響'),
}
TARGET_E = {'cine_c3': 0.5, 'cine_c6': 0.55}

QUENDEL = '''Music: Gregor Quendel - "Cinematic Trailer Music Collection" (www.gregorquendel.com)
License: CC-BY 4.0 (https://creativecommons.org/licenses/by/4.0/)
Source: https://opengameart.org/content/cinematic-trailer-music-collection
Changes: trimmed, faded out and re-encoded to 96 kbps MP3 for the in-game cutscenes.
cine_suspense.mp3 = "Cinematic Suspense Trailer - Extended Percussion Version" (0:00-1:48)
cine_ident.mp3 = "Cinematic Piano Ident Logo Trailer" (0:00-0:25)
cine_drive.mp3 = "Cinematic Cello Ostinato Trailer" (0:00-1:06)
cine_tension.mp3 = "Cinematic Suspense Trailer" (0:00-1:00)
'''


def load(p):
    out = subprocess.run([FF, '-v', 'quiet', '-i', p, '-ac', '2', '-ar', str(SR), '-f', 'f32le', '-'],
                         capture_output=True, check=True).stdout
    return np.frombuffer(out, dtype=np.float32).reshape(-1, 2).copy()


def pick(x, L, e):
    """起點（秒）：開頭 15 秒的平均響度接近目標、整段沒有很安靜的洞（過場一開始就要有聲音）"""
    sec = len(x) // SR
    rms = np.array([np.sqrt(np.mean(x[i * SR:(i + 1) * SR] ** 2)) for i in range(sec)])
    lo, hi = np.percentile(rms, 10), np.percentile(rms, 95)
    tgt = lo + (hi - lo) * e
    best, bi = 1e9, 0
    for s in range(0, max(1, sec - int(L))):
        seg = rms[s:s + int(L)]
        score = abs(rms[s:s + 15].mean() - tgt) + abs(seg.mean() - tgt) * 0.5 + max(0, lo + (hi - lo) * 0.2 - seg.min())
        if score < best:
            best, bi = score, s
    return bi


def main():
    src = sys.argv[1]
    out = os.path.join(os.path.dirname(__file__), '..', 'src', 'assets', 'music')
    cr = [QUENDEL, 'Chapter cutscene music (scripts/cine-music-prep.py): trimmed, faded in/out, normalized and '
          're-encoded to 96 kbps MP3. Licenses: CC-BY 4.0 (https://creativecommons.org/licenses/by/4.0/), '
          'CC-BY 3.0 (https://creativecommons.org/licenses/by/3.0/).']
    for name, (f, start, L, title, (artist, lic, url), _) in TRACKS.items():
        x = load(os.path.join(src, f))
        dur = len(x) / SR
        if not L or L > dur:
            L = dur - (start or 0)
        if start is None:
            start = pick(x, L, TARGET_E.get(name, 0.7))
        seg = x[int(start * SR):int((start + L) * SR)].copy()
        fi, fo = int(0.3 * SR), int(3 * SR)
        seg[:fi] *= np.linspace(0, 1, fi)[:, None]
        seg[-fo:] *= np.linspace(1, 0, fo)[:, None]
        seg *= 0.89 / max(1e-6, np.abs(seg).max())
        p = os.path.join(out, name + '.mp3')
        subprocess.run([FF, '-v', 'quiet', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', '-',
                        '-c:a', 'libmp3lame', '-b:a', '96k', p], input=seg.astype(np.float32).tobytes(), check=True)
        a, b = int(start), int(start + L)
        cr.append(f'{name}.mp3 = "{title}" by {artist} - {lic} ({a // 60}:{a % 60:02d}-{b // 60}:{b % 60:02d}) {url}')
        print(f'{name}  {f[:44]:44s} {a // 60}:{a % 60:02d} ～ +{L:.0f}s  {os.path.getsize(p) // 1024} KB')
    with open(os.path.join(out, 'CREDITS.txt'), 'w', encoding='utf8') as fp:
        fp.write('\n'.join(cr) + '\n')


main()
