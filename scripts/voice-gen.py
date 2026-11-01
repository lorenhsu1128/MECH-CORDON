"""ECHO 的語音：VoxCPM2（OpenBMB，Apache-2.0）以每個聲音的參考音檔克隆全部台詞 → src/assets/voice/<聲音>/<鍵>.mp3。

聲音＝語音試聽選出來的候選（src/assets/voice/ref/<聲音>.flac：溫柔知性 #2、AI 系統感 #3 的第 1 句），
台詞＝scripts/voice-lines.js 收集的 src/assets/voice/lines.json（{ 鍵: { t 台詞, k 情境 } }），情境決定語氣指示。
每句產生 --takes 次（預設 2），再用 faster-whisper 轉寫、和台詞比對，留最像的那一次（少唸錯、少唸壞）。
相似度太低的句子寫進 src/assets/voice/<聲音>/report.txt，可以 --retry 再多產生幾次重挑。

需要 Python 3.10～3.12、CUDA 版 PyTorch、triton-windows、
`pip install voxcpm soundfile imageio-ffmpeg opencc-python-reimplemented faster-whisper`；一定用顯示卡（沒有 CUDA 就停下）。
  node scripts/voice-lines.js                       # 先收集台詞
  python scripts/voice-gen.py                       # 兩個聲音、全部台詞（已經有 mp3 的略過）
  python scripts/voice-gen.py --voice ai --force    # 只做一個聲音、全部重做
  python scripts/voice-gen.py --retry               # report.txt 裡的句子再產生 2 次重挑
之後 npm run build（建置成 dist/lib/voice-<聲音>.js）。
"""
import argparse
import difflib
import json
import os
import re
import subprocess
import sys
import tempfile
import zlib

import numpy as np
import soundfile as sf

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VDIR = os.path.join(ROOT, 'src', 'assets', 'voice')
VOICES = ['gentle', 'ai']
TAKES = os.path.join(tempfile.gettempdir(), 'rubicon-voice-takes')

# 情境 → 語氣指示（產生時轉簡體）；台詞有「！」時另外加
STYLE = {
    'alarm': '急促、緊張',
    'sys': '冷靜、清楚',
    'story': '平靜',
    'private': '輕聲、溫柔、帶著感情',
    'end': '平靜、帶著感情',
}
# 全大寫的英文字照字母唸（AP、AC…）；4 個字母以上的是名字（ECHO、RUST、SIROCCO…），改成一般的大小寫讓它照單字唸
SPELL = {'COAM', 'EMP', 'ACS', 'QB'}

CC = None


def to_simp(s):
    global CC
    if CC is None:
        import opencc
        CC = opencc.OpenCC('t2s')
    return CC.convert(s)


def say(text):
    s = text.replace('……', '，').replace('──', '，').replace('——', '，')
    s = s.replace('R-07', 'R零七')
    s = re.sub(r'[A-Z]{4,}', lambda m: m.group(0) if m.group(0) in SPELL else m.group(0).capitalize(), s)
    return to_simp(s)


def style_of(line):
    st = STYLE.get(line['k'], '')
    if '！' in line['t'] and line['k'] not in ('alarm', 'private'):
        st = st + '、語氣有力' if st else '語氣有力'
    return st


def seed(n):
    import random
    import torch
    random.seed(n)
    np.random.seed(n)
    torch.manual_seed(n)
    torch.cuda.manual_seed_all(n)


def trim(w, sr, th=0.012, pad=0.08):
    a = np.abs(w)
    idx = np.where(a > th * max(a.max(), 1e-6))[0]
    if not len(idx):
        return w
    return w[max(0, idx[0] - int(pad * sr)):min(len(w), idx[-1] + int(pad * 1.5 * sr))]


def write_mp3(w, sr, path):
    import imageio_ffmpeg
    # 響度一致：RMS 對齊 −20 dBFS，峰值不超過 −1 dB
    rms = np.sqrt(np.mean(w ** 2)) + 1e-9
    w = w * min(0.1 / rms, 0.89 / max(np.abs(w).max(), 1e-6))
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f:
        tmp = f.name
    sf.write(tmp, w, sr)
    subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), '-y', '-loglevel', 'error', '-i', tmp, '-ac', '1',
                    '-ar', '24000', '-b:a', '40k', path], check=True)
    os.unlink(tmp)


def generate(lines, todo, takes):
    """第 1 階段：VoxCPM2 克隆，每句 takes 次存成暫存的 wav"""
    import time
    import torch
    from voxcpm import VoxCPM
    if not torch.cuda.is_available():
        sys.exit('沒有 CUDA：要裝 CUDA 版的 PyTorch（pip install torch --index-url https://download.pytorch.org/whl/cu124）')
    torch.set_float32_matmul_precision('high')
    model = VoxCPM.from_pretrained('openbmb/VoxCPM2', load_denoiser=False, device='cuda')
    print('裝置', torch.cuda.get_device_name(0), flush=True)
    sr = model.tts_model.sample_rate
    n = sum(len(v) for v in todo.values()) * len(takes)
    i = 0
    t_all = time.time()
    for v, keys in todo.items():
        ref = os.path.join(VDIR, 'ref', v + '.flac')
        os.makedirs(os.path.join(TAKES, v), exist_ok=True)
        for k in keys:
            L = lines[k]
            st = style_of(L)
            text = (f'({to_simp(st)})' if st else '') + say(L['t'])
            for tk in takes:
                out = os.path.join(TAKES, v, f'{k}-{tk}.wav')
                i += 1
                if os.path.exists(out):
                    continue
                seed(1000 + tk * 7919 + (zlib.crc32(k.encode()) & 0xffff))
                w = model.generate(text=text, reference_wav_path=ref, cfg_value=2.0, inference_timesteps=10)
                sf.write(out, trim(np.asarray(w, dtype=np.float32), sr), sr)
                if i % 20 == 0:
                    el = time.time() - t_all
                    print(f'{i}/{n}　{el / 60:.1f} 分鐘', flush=True)
    del model
    torch.cuda.empty_cache()


def pick(lines, todo, takes, force):
    """第 2 階段：faster-whisper 轉寫，留最像的那一次 → mp3；太不像的寫進 report.txt"""
    import torch
    os.add_dll_directory(os.path.join(os.path.dirname(torch.__file__), 'lib'))
    from faster_whisper import WhisperModel
    asr = WhisperModel('large-v3', device='cuda', compute_type='float16')

    def norm(s):
        return re.sub(r'[^一-鿿]', '', to_simp(s))  # 只比中文字（英文名字、數字的寫法不算）

    for v, keys in todo.items():
        rep = []
        for k in keys:
            best = None
            for tk in sorted(set(takes) | set(range(1, 9))):
                f = os.path.join(TAKES, v, f'{k}-{tk}.wav')
                if not os.path.exists(f):
                    continue
                w, sr = sf.read(f, dtype='float32')
                if w.ndim > 1:
                    w = w.mean(axis=1)
                # whisper 要 16 kHz
                w16 = np.interp(np.arange(0, len(w), sr / 16000), np.arange(len(w)), w).astype(np.float32)
                segs, _ = asr.transcribe(w16, language='zh', beam_size=5)
                got = ''.join(s.text for s in segs)
                r = difflib.SequenceMatcher(None, norm(lines[k]['t']), norm(got)).ratio()
                # 長度不合理（每秒少於 1.5 或多於 9 個字）的扣分
                cps = len(norm(lines[k]['t'])) / max(len(w) / sr, 0.1)
                if cps < 1.5 or cps > 9:
                    r -= 0.3
                if not best or r > best[0]:
                    best = (r, w, sr, got)
            if not best:
                continue
            write_mp3(best[1], best[2], os.path.join(VDIR, v, k + '.mp3'))
            if best[0] < 0.75:
                rep.append(f'{k}\t{best[0]:.2f}\t{lines[k]["t"]}\t{best[3]}')
        rp = os.path.join(VDIR, v, 'report.txt')
        old = []
        if not force and os.path.exists(rp):
            done = set(keys)
            old = [l for l in open(rp, encoding='utf-8').read().splitlines()
                   if l.split('\t')[0] not in done and l.split('\t')[0] in lines]
        with open(rp, 'w', encoding='utf-8', newline='\n') as f:
            f.write('\n'.join(old + rep) + ('\n' if old or rep else ''))
        print(v, '完成', len(keys), '句，相似度低的', len(rep), '句', flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--voice', default=','.join(VOICES))
    ap.add_argument('--takes', type=int, default=2)
    ap.add_argument('--force', action='store_true', help='已經有 mp3 的也重做')
    ap.add_argument('--retry', action='store_true', help='report.txt 裡的句子再多產生 2 次重挑')
    ap.add_argument('--only', default='', help='只做這些鍵（逗號分隔）')
    a = ap.parse_args()
    lines = json.load(open(os.path.join(VDIR, 'lines.json'), encoding='utf-8'))
    todo = {}
    takes = list(range(1, a.takes + 1))
    for v in a.voice.split(','):
        os.makedirs(os.path.join(VDIR, v), exist_ok=True)
        if a.retry:
            rp = os.path.join(VDIR, v, 'report.txt')
            keys = [l.split('\t')[0] for l in open(rp, encoding='utf-8').read().splitlines()] if os.path.exists(rp) else []
        elif a.only:
            keys = a.only.split(',')
        else:
            keys = [k for k in lines if a.force or not os.path.exists(os.path.join(VDIR, v, k + '.mp3'))]
        todo[v] = [k for k in keys if k in lines]
        if a.force:
            for k in todo[v]:
                for tk in range(1, 9):
                    f = os.path.join(TAKES, v, f'{k}-{tk}.wav')
                    if os.path.exists(f):
                        os.unlink(f)
        # 拿掉台詞已經不在的語音檔
        for f in os.listdir(os.path.join(VDIR, v)):
            if f.endswith('.mp3') and f[:-4] not in lines:
                os.unlink(os.path.join(VDIR, v, f))
    if a.retry:
        takes = [a.takes + 1, a.takes + 2]
    if not any(todo.values()):
        print('沒有要產生的句子')
        return
    print({v: len(k) for v, k in todo.items()}, '句，每句', len(takes), '次', flush=True)
    generate(lines, todo, takes)
    pick(lines, todo, takes if not a.retry else list(range(1, a.takes + 3)), a.force)


if __name__ == '__main__':
    sys.exit(main())
