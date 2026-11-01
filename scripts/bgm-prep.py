"""任務中的配樂（docs/audio-design.md 第 5 期）：把下載的曲子剪成可以循環的段落 → src/assets/bgm/<名稱>.mp3

用法：python scripts/bgm-prep.py <曲子的資料夾>（檔名照 TRACKS 的來源；Kevin MacLeod 的 incompetech.com，CC-BY 4.0）
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

# 名稱 → (來源檔, 長度秒, 目標能量 0～1)
TRACKS = {
    'explore1': ('Lightless_Dawn.mp3', 100, 0.45),
    'explore2': ('Hiding_Your_Reality.mp3', 100, 0.5),
    'alert1': ('Crypto.mp3', 90, 0.6),
    'alert2': ('Interloper.mp3', 90, 0.6),
    'combat1': ('Cyborg_Ninja.mp3', 100, 0.95),
    'combat2': ('Volatile_Reaction.mp3', 100, 0.95),
    'combat3': ('Movement_Proposition.mp3', 100, 0.95),
    'boss1': ('Clash_Defiant.mp3', 110, 1.0),
    'boss2': ('Five_Armies.mp3', 110, 1.0),
    'air1': ('Heroic_Age.mp3', 100, 0.9),
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
    for name, (f, L, e) in TRACKS.items():
        x = load(os.path.join(src, f))
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
        print(f'{name:9s} {f:28s} {s // 60}:{s % 60:02d} ～ +{L:.0f}s  {os.path.getsize(p) // 1024} KB')


main()
