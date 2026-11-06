"""任務中的配樂（docs/audio-design.md 第 5 期）：把下載的曲子剪成可以循環的段落 → src/assets/bgm/<名稱>.mp3

用法：python scripts/bgm-prep.py <曲子的資料夾>（檔名照 TRACKS 的來源；來源與授權見 TRACKS，下載網址見 src/assets/bgm-audition/index.json）
需要 numpy 與 imageio-ffmpeg。

每一首：依 1 秒的響度挑一段 len 秒（e＝目標的能量：高＝交戰、Boss 挑最響的一段；低＝探索挑平均的一段，跳過開頭），
結尾後面的 XF 秒以等功率交叉淡化疊到開頭，所以從結尾接回開頭是連續的（AudioBufferSourceNode 的 loop）。
立體聲 44.1 kHz、80 kbps。
"""
import os
import subprocess
import sys

import numpy as np
import imageio_ffmpeg

FF = imageio_ffmpeg.get_ffmpeg_exe()
SR = 44100
XF = 3.0

SB = ('Scott Buckley', 'CC-BY 4.0', 'https://www.scottbuckley.com.au/library/')
AN = ('Alexander Nakarada', 'CC-BY 4.0', 'https://www.serpentsoundstudios.com/ (via free-stock-music.com)')
AP = ('Alex-Productions', 'CC-BY 3.0', 'https://www.free-stock-music.com/artist.alex-productions.html')
OGA = 'https://opengameart.org/content/'

# 名稱 → (來源檔, 長度秒, 目標能量 0～1, 曲名, (作者, 授權, 來源), raw)
# raw＝原本就做成循環的檔案：整首照用、不交叉淡化（nene 的 zip 裡檔名是反的：*_opening.wav 才是循環段，改名成 oga-symphonic-metal-loop.wav）
# 2026-11-06 配樂重選（docs/audio-design.md）：換成多種樂器合奏的混合交響／交響金屬／電子，每一級 3～6 首
TRACKS = {
    'explore1': ('scott-buckley-signal-to-noise.mp3', 100, 0.45, 'Signal To Noise', SB, False),
    'explore2': ('scott-buckley-penumbra.mp3', 100, 0.45, 'Penumbra', SB, False),
    'explore3': ('scott-buckley-the-long-dark.mp3', 100, 0.45, 'The Long Dark', SB, False),
    'alert1': ('scott-buckley-eyes-in-the-void.mp3', 90, 0.6, 'Eyes In The Void', SB, False),
    'alert2': ('alexander-nakarada-electrorchestra.mp3', 90, 0.65, 'Electrorchestra', AN, False),
    'alert3': ('scott-buckley-escape-velocity.mp3', 90, 0.65, 'Escape Velocity', SB, False),
    'alert4': ('alex-productions-aggressive-electro-cyberpunk-midtempo-hidden.mp3', 90, 0.65,
               'Hidden (Aggressive Electro Cyberpunk)', AP, False),
    'combat1': ('scott-buckley-simulacra.mp3', 100, 0.95, 'Simulacra', SB, False),
    'combat2': ('scott-buckley-terminus.mp3', 100, 0.95, 'Terminus', SB, False),
    'combat3': ('alexander-nakarada-chase.mp3', 100, 0.95, 'Chase', AN, False),
    'combat4': ('alex-productions-epic-cyberpunk.mp3', 100, 0.95, 'Epic Cyberpunk', AP, False),
    'combat5': ('oga-determined-pursuit.wav', 0, 0.95, 'Determined Pursuit (Epic Orchestra Loop)',
                ('Emma_MA', 'CC0', OGA + 'determined-pursuit-epic-orchestra-loop'), True),
    'combat6': ('oga-qazijamjam.wav', 110, 0.95, 'QaziJamJam (Orchestral Battle Theme)',
                ('Emma_MA', 'CC0', OGA + 'qazijamjam-orchestral-battle-theme'), False),
    'boss1': ('scott-buckley-goliath.mp3', 110, 1.0, 'Goliath', SB, False),
    'boss2': ('scott-buckley-vanguard.mp3', 110, 1.0, 'Vanguard', SB, False),
    'boss3': ('alexander-nakarada-hellfire.mp3', 110, 1.0, 'Hellfire', AN, False),
    'boss4': ('alexander-nakarada-the-great-battle.mp3', 110, 1.0, 'The Great Battle', AN, False),
    'boss5': ('oga-symphonic-metal-loop.wav', 0, 1.0, 'Boss Battle #2 [Symphonic Metal]',
              ('nene', 'CC0', OGA + 'boss-battle-2-symphonic-metal'), True),
    'air1': ('scott-buckley-sentinel.mp3', 100, 0.9, 'Sentinel', SB, False),
    'air2': ('scott-buckley-born-of-the-sky.mp3', 100, 0.9, 'Born Of The Sky', SB, False),
    'air3': ('scott-buckley-starfire.mp3', 100, 0.9, 'Starfire', SB, False),
}


def load(p):
    out = subprocess.run([FF, '-v', 'quiet', '-i', p, '-ac', '2', '-ar', str(SR), '-f', 'f32le', '-'],
                         capture_output=True, check=True).stdout
    return np.frombuffer(out, dtype=np.float32).reshape(-1, 2).copy()


def pick(x, L, e):
    """挑起點（秒）：段落的平均響度最接近目標（以整首的響度範圍換算）"""
    sec = len(x) // SR
    rms = np.array([np.sqrt(np.mean(x[i * SR:(i + 1) * SR] ** 2)) for i in range(sec)])
    lo, hi = np.percentile(rms, 10), np.percentile(rms, 95)
    tgt = lo + (hi - lo) * e
    best, bi = 1e9, 0
    need = int(L + XF + 1)
    for s in range(min(8, max(0, sec - need)), max(1, sec - need)):
        seg = rms[s:s + int(L)]
        # 平均接近目標、段落內不要有很安靜的洞
        score = abs(seg.mean() - tgt) + max(0, lo + (hi - lo) * 0.3 * e - seg.min()) * 2
        if score < best:
            best, bi = score, s
    return bi


def main():
    src = sys.argv[1]
    out = os.path.join(os.path.dirname(__file__), '..', 'src', 'assets', 'bgm')
    os.makedirs(out, exist_ok=True)
    for f in os.listdir(out):
        if f.endswith('.mp3'):
            os.remove(os.path.join(out, f))
    credits = ['Music for the in-mission dynamic BGM (docs/audio-design.md). Licenses: CC-BY 4.0 '
               '(https://creativecommons.org/licenses/by/4.0/), CC-BY 3.0 (https://creativecommons.org/licenses/by/3.0/), '
               'CC0 (https://creativecommons.org/publicdomain/zero/1.0/).',
               'Changes: a section of each track was cut into a seamless loop (3 s equal-power crossfade; tracks marked '
               '"loop" were released as loops and used whole), normalized and re-encoded to 80 kbps MP3 by scripts/bgm-prep.py.']
    for name, (f, L, e, title, (artist, lic, url), raw) in TRACKS.items():
        x = load(os.path.join(src, f))
        if raw:
            seg, s, L = x.copy(), 0, len(x) / SR
        else:
            L = min(L, len(x) / SR - XF - 1)
            s = pick(x, L, e)
            a = s * SR
            n, xf = int(L * SR), int(XF * SR)
            seg = x[a:a + n].copy()
            tail = x[a + n:a + n + xf]
            t = np.linspace(0, 1, xf)[:, None]
            seg[:xf] = seg[:xf] * np.sin(t * np.pi / 2) + tail * np.cos(t * np.pi / 2)
        seg *= 0.89 / max(1e-6, np.abs(seg).max())
        p = os.path.join(out, name + '.mp3')
        subprocess.run([FF, '-v', 'quiet', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', '-',
                        '-c:a', 'libmp3lame', '-b:a', '80k', p], input=seg.astype(np.float32).tobytes(), check=True)
        credits.append(f'{name}.mp3 = "{title}" by {artist} - {lic} - {url}' + (' (loop)' if raw else ''))
        print(f'{name:9s} {f[:40]:40s} {s // 60}:{s % 60:02d} ～ +{L:.0f}s  {os.path.getsize(p) // 1024} KB')
    with open(os.path.join(out, 'CREDITS.txt'), 'w', encoding='utf8') as fp:
        fp.write('\n'.join(credits) + '\n')


main()
