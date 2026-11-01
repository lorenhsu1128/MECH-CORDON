"""ECHO 的語音產生（docs/audio-design.md 第 4 期）：python scripts/voice-gen.py [--voice zf_042] [--all] [--only 鍵,…]

讀 src/assets/voice/lines.json（scripts/voice-lines.js 產生）→ 每一句用 Kokoro-82M v1.1-zh（Apache-2.0）合成，
寫成 src/assets/voice/echo/<鍵>.mp3（單聲道 24 kHz、32 kbps）；已經有的不重做（--all 全部重做），lines.json 裡沒有的刪掉。
需要 Python 3.10～3.12：pip install "kokoro>=0.8.2" "misaki[zh]>=0.8.2" soundfile opencc-python-reimplemented imageio-ffmpeg torch

台詞是繁體中文：先照下面的規則改寫成好唸的文字（數字、縮寫、名字、標點），再轉成簡體給 misaki 的拼音（只影響發音，
字幕照舊是原文）。改了規則要 --all 重做。
"""
import argparse
import json
import os
import re
import subprocess
import sys

import numpy as np

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
LINES = os.path.join(ROOT, 'src', 'assets', 'voice', 'lines.json')
OUT = os.path.join(ROOT, 'src', 'assets', 'voice', 'echo')
REPO = 'hexgrad/Kokoro-82M-v1.1-zh'
SR = 24000

DIG = '零一二三四五六七八九'


def num_zh(n):
    """整數 → 中文念法（0～9999）"""
    n = int(n)
    if n < 10:
        return DIG[n]
    if n < 20:
        return '十' + (DIG[n % 10] if n % 10 else '')
    if n < 100:
        return DIG[n // 10] + '十' + (DIG[n % 10] if n % 10 else '')
    if n < 1000:
        r = n % 100
        return DIG[n // 100] + '百' + ('' if r == 0 else ('零' + DIG[r] if r < 10 else num_zh(r) if r >= 20 else '一' + num_zh(r)))
    return ''.join(DIG[int(c)] for c in str(n))


def speakable(t):
    t = t.replace(' ███ ', '，').replace('███', '，')  # 遮蔽的字（「第 ███ 次」）念成停頓
    t = re.sub(r'[「」『』]', ' ', t)
    t = t.replace('——', '，').replace('—', '，')
    t = re.sub(r'^(……)+', '', t)
    t = re.sub(r'([。！？，])\s*(……)+', lambda m: m.group(1), t)
    t = re.sub(r'(……)+', '，', t)
    t = re.sub(r'[，、]{2,}', '，', t)
    t = re.sub(r'\s*，\s*', '，', t)
    # 編號：R-07、KEY-0、Grid 086（逐字念）
    t = re.sub(r'R-0?(\d+)', lambda m: 'R ' + ''.join(DIG[int(c)] for c in m.group(0)[2:]), t)
    t = t.replace('KEY-0', 'Key 零')
    t = re.sub(r'\b0(\d{2})\b', lambda m: ''.join(DIG[int(c)] for c in m.group(0)), t)
    # 單位
    t = re.sub(r'(\d+)\s*m\b', lambda m: num_zh(m.group(1)) + '公尺', t)
    t = re.sub(r'(\d+)\s*秒', lambda m: ('兩' if m.group(1) == '2' else num_zh(m.group(1))) + '秒', t)
    t = re.sub(r'\d+', lambda m: num_zh(m.group(0)), t)
    # 英文：三個字母以內的縮寫照字母念（AC → A C），較長的全大寫名字當成一般的字（SPECIMEN → Specimen）
    def eng(m):
        w = m.group(0)
        if w.isupper() and len(w) <= 3:
            return ' '.join(w)
        if w.isupper():
            return w.capitalize()
        return w
    t = re.sub(r'[A-Za-z]+', eng, t)
    return t.strip('，').strip()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--voice', default='zf_042')
    ap.add_argument('--speed', type=float, default=0.95)
    ap.add_argument('--all', action='store_true')
    ap.add_argument('--only', default='')
    ap.add_argument('--dry', action='store_true', help='只印出改寫後的文字')
    a = ap.parse_args()
    lines = json.load(open(LINES, encoding='utf8'))
    os.makedirs(OUT, exist_ok=True)
    for f in os.listdir(OUT):
        if f.endswith('.mp3') and f[:-4] not in lines:
            os.remove(os.path.join(OUT, f))
    keys = [k for k in lines if (a.all or not os.path.exists(os.path.join(OUT, k + '.mp3')))]
    if a.only:
        keys = [k for k in a.only.split(',') if k in lines]
    if a.dry:
        for k in keys:
            print(k, '|', speakable(lines[k]))
        return
    import opencc
    import torch
    import imageio_ffmpeg
    from kokoro import KModel, KPipeline

    ff = imageio_ffmpeg.get_ffmpeg_exe()
    cc = opencc.OpenCC('t2s')
    dev = 'cuda' if torch.cuda.is_available() else 'cpu'
    model = KModel(repo_id=REPO).to(dev).eval()
    en = KPipeline(lang_code='a', repo_id=REPO, model=False)
    pipe = KPipeline(lang_code='z', repo_id=REPO, model=model, en_callable=lambda w: next(en(w)).phonemes)
    total = 0
    for i, k in enumerate(keys):
        txt = speakable(lines[k])
        if not re.search(r'[一-鿿A-Za-z]', txt):
            continue  # 只有標點（例如「……」）：不產生
        # 系統提示（s_）唸快一點：戰鬥中要聽得及
        sp = a.speed * (1.15 if k.startswith('s_') else 1)
        parts = [r.audio.numpy() for r in pipe(cc.convert(txt), voice=a.voice, speed=sp)]
        if not parts:
            print('（沒有輸出）', k, txt)
            continue
        y = np.concatenate(parts).astype(np.float32)
        # 前後的靜音裁掉（Kokoro 的輸出前面約 0.4 秒、後面約 0.7 秒），前留 40 ms、後留 120 ms
        pk = np.abs(y).max() or 1
        idx = np.where(np.abs(y) > pk * 0.02)[0]
        if len(idx):
            y = y[max(0, idx[0] - int(SR * 0.04)): idx[-1] + int(SR * 0.12)]
        # 音量：RMS 對齊 -20 dBFS、峰值不超過 -1 dBFS
        rms = float(np.sqrt(np.mean(y ** 2))) or 1e-6
        y *= min(0.1 / rms, 0.89 / (np.abs(y).max() or 1))
        p = os.path.join(OUT, k + '.mp3')
        subprocess.run([ff, '-v', 'quiet', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', '-',
                        '-c:a', 'libmp3lame', '-b:a', '32k', p], input=y.tobytes(), check=True)
        total += len(y) / SR
        print(f'[{i + 1}/{len(keys)}] {k} {len(y) / SR:.1f}s {lines[k]}', flush=True)
    print(f'完成：{len(keys)} 句、{total / 60:.1f} 分鐘')


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    main()
