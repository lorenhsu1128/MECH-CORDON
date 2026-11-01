"""ECHO 的語音試聽：用 VoxCPM2（OpenBMB，Apache-2.0）產生候選聲音 → src/assets/voice-audition/。

每個候選＝一種聲音類型的描述＋一個種子：先以「聲音設計」（描述放在句首的括號）產生第 1 句，
其他句子用那一句當參考音檔克隆（controllable cloning，可以再加語氣指示），所以同一個候選的音色一致。
聲音類型參考二次元遊戲（絕區零、異環）的女角選角類型，只用文字描述，不用任何配音員的錄音。

需要 Python 3.10～3.12、CUDA 版 PyTorch、triton-windows（torch.compile，沒有它慢約 8 倍）、`pip install voxcpm soundfile imageio-ffmpeg opencc-python-reimplemented`
（顯示卡記憶體約 8 GB）。用法：
  python scripts/voice-audition.py                 # 全部候選
  python scripts/voice-audition.py --only calm     # 只產生某一種類型
  python scripts/voice-audition.py --n 3 --keep    # 每類幾個候選；--keep 已經有的不重新產生
  （唸壞的句子：刪掉那個 mp3，--only <類型> --keep --salt 1 換種子重新產生）
產生後 npm run build（建置成 dist/lib/voice-audition.js），標題的「ECHO 語音試聽」播放。
"""
import argparse
import json
import os
import subprocess
import sys
import tempfile

import numpy as np
import soundfile as sf

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'src', 'assets', 'voice-audition')

# 聲音類型（描述用簡體：模型的訓練資料以簡體為主）
TYPES = [
    ('calm', '冷靜管制官', '中低音、咬字乾脆、短句，帶一點乾冷的幽默（最貼近劇本的 ECHO）',
     '年轻女性，带台湾口音的国语，冷静、干脆利落，中低音，语速适中，像军事作战管制官在无线电里说话，语气克制，带一点冷淡的幽默'),
    ('gentle', '溫柔知性', '溫暖的大姊型，柔和、語速稍慢',
     '年轻女性，带台湾口音的国语，温柔知性的大姐姐，声音温暖柔和，语速稍慢，让人安心'),
    ('ai', 'AI 系統感', '精準、平穩、略帶合成感的系統語音（ECHO 其實是軌道站的管制系統）',
     '年轻女性声音的人工智能系统，带台湾口音的国语，精准、平稳、略带机械感，语调起伏小，冷静而礼貌'),
    ('lazy', '慵懶酷系', '聲音偏低、起伏小、有點漫不經心',
     '年轻女性，带台湾口音的国语，慵懒、酷，声音偏低带一点气声，语调起伏小，漫不经心但很可靠'),
    ('mature', '成熟低音', '低沉的女中音，沉穩、有威嚴的長官型',
     '成熟女性，带台湾口音的国语，低沉有磁性的女中音，沉稳、有威严，像经验丰富的指挥官'),
    ('cute', '可愛活潑', '明亮清脆的少女聲，元氣、語速稍快',
     '少女，带台湾口音的国语，可爱活泼、元气满满，声音明亮清脆，语速稍快，充满精神'),
]
# 試聽台詞：第 1 句是參考（聲音設計），之後的克隆；style＝克隆時加在句首的語氣指示（產生時轉簡體）
LINES = [
    ('l1', '開場', '醒了？我是 ECHO，你的作戰管制官。第一份委託已經在等你了。', None),
    ('l2', '簡報', '空降完成。這次作戰由我管制。先清掉降落區附近的敵人，再選一個出口往前推進。', None),
    ('l3', '警報', '導彈接近，左後方！快閃開！', '急促、緊張'),
    ('l4', '關心', 'AP 低於百分之二十五。……別逞強，傭兵。', '擔心，壓低聲音'),
    ('l5', '情報', '具名 AC「RUST」。拾荒傭兵，每次遇到的裝備都不一樣。', None),
    ('l6', '乾冷', '抱歉，干擾。……繼續。', '平淡，若無其事'),
    ('l7', '私人頻道', 'R-07。這是私人頻道，委託方聽不到。我知道你記得。我也記得。這一次，照我們的節奏來。', '輕聲、溫柔、帶著感情'),
]
SEEDS = [11, 23, 37, 41, 53]


def to_simp(s):
    try:
        import opencc
        return opencc.OpenCC('t2s').convert(s)
    except ImportError:
        return s


def say(text):
    # 讀法：AP 唸成英文字母；「……」換成停頓
    return to_simp(text).replace('……', '，')


def seed(n):
    import random
    import torch
    random.seed(n)
    np.random.seed(n)
    torch.manual_seed(n)
    torch.cuda.manual_seed_all(n)


def ffmpeg():
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


def trim(w, sr, th=0.012, pad=0.08):
    a = np.abs(w)
    idx = np.where(a > th * max(a.max(), 1e-6))[0]
    if not len(idx):
        return w
    s = max(0, idx[0] - int(pad * sr))
    e = min(len(w), idx[-1] + int(pad * 1.5 * sr))
    return w[s:e]


def write_mp3(w, sr, path):
    w = w / max(np.abs(w).max(), 1e-6) * 0.89
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f:
        tmp = f.name
    sf.write(tmp, w, sr)
    subprocess.run([ffmpeg(), '-y', '-loglevel', 'error', '-i', tmp, '-ac', '1', '-ar', '32000',
                    '-b:a', '56k', path], check=True)
    os.unlink(tmp)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', default='')
    ap.add_argument('--n', type=int, default=3)
    ap.add_argument('--keep', action='store_true')
    ap.add_argument('--model', default='openbmb/VoxCPM2')
    ap.add_argument('--salt', type=int, default=0, help='換種子（刪掉唸壞的那一句後配合 --keep 重新產生）')
    a = ap.parse_args()
    import time
    import torch
    from voxcpm import VoxCPM
    # 一定要用顯示卡（CPU 慢幾十倍）：沒有 CUDA 就停下
    if not torch.cuda.is_available():
        sys.exit('沒有 CUDA：要裝 CUDA 版的 PyTorch（pip install torch --index-url https://download.pytorch.org/whl/cu124）')
    torch.set_float32_matmul_precision('high')
    model = VoxCPM.from_pretrained(a.model, load_denoiser=False, device='cuda')
    dev = next(model.tts_model.parameters()).device
    print('裝置', dev, torch.cuda.get_device_name(0), flush=True)
    if dev.type != 'cuda':
        sys.exit('模型不在顯示卡上')
    sr = model.tts_model.sample_rate
    os.makedirs(os.path.join(OUT, 'ref'), exist_ok=True)
    cands = []
    for tid, name, desc, prompt in TYPES:
        for n in range(1, a.n + 1):
            cid = f'{tid}{n}'
            cands.append({'id': cid, 'type': tid, 'n': n, 'seed': SEEDS[n - 1]})
            if a.only and tid not in a.only.split(','):
                continue
            ref = os.path.join(OUT, 'ref', f'{cid}.wav')
            for i, (lid, tag, text, style) in enumerate(LINES):
                mp3 = os.path.join(OUT, f'{cid}-{lid}.mp3')
                if a.keep and os.path.exists(mp3) and (i or os.path.exists(ref)):
                    continue
                seed(SEEDS[n - 1] * 100 + i + a.salt * 7919)
                t0 = time.time()
                if i == 0:
                    w = model.generate(text=f'({prompt}){say(text)}', cfg_value=2.0, inference_timesteps=10)
                    w = trim(np.asarray(w, dtype=np.float32), sr)
                    sf.write(ref, w, sr)
                else:
                    t = f'({to_simp(style)}){say(text)}' if style else say(text)
                    w = model.generate(text=t, reference_wav_path=ref, cfg_value=2.0, inference_timesteps=10)
                    w = trim(np.asarray(w, dtype=np.float32), sr)
                write_mp3(w, sr, mp3)
                d = len(w) / sr
                print(cid, lid, f'{d:.1f}s', f'速度比 {(time.time() - t0) / max(d, 0.1):.2f}', flush=True)
    idx = {
        'model': 'VoxCPM2（OpenBMB，Apache-2.0）',
        'types': [{'id': t[0], 'name': t[1], 'desc': t[2], 'prompt': t[3]} for t in TYPES],
        'lines': [{'id': l[0], 'tag': l[1], 'text': l[2], 'style': l[3] or ''} for l in LINES],
        'cands': cands,
    }
    with open(os.path.join(OUT, 'index.json'), 'w', encoding='utf-8', newline='\n') as f:
        json.dump(idx, f, ensure_ascii=False, indent=1)
        f.write('\n')
    with open(os.path.join(OUT, 'CREDITS.txt'), 'w', encoding='utf-8', newline='\n') as f:
        f.write('ECHO 的語音試聽：VoxCPM2（OpenBMB，https://github.com/OpenBMB/VoxCPM，Apache-2.0）的聲音設計產生，'
                'scripts/voice-audition.py。AI 合成語音，不是任何配音員的聲音。\n')


if __name__ == '__main__':
    sys.exit(main())
