"""自製音效的產生（docs/sfx-gen-design.md）

用法（環境由 npm run sfx:setup 裝在 tools/sfxgen/）：
  tools/sfxgen/venv/Scripts/python scripts/sfx-gen.py --trial [--model=moss|sao] [--n=3] [--only=rifle,laser]
第 0 期的試做：TRIAL 的 10 個聲音 × 兩個模型 × n 個候選（同一句英文提示詞），
修剪前後的靜音、淡出、峰值 −1 dB → tools/sfxgen/trial/<模型>/<鍵>_<n>.wav／.mp3，
最後寫 tools/sfxgen/trial/index.html（並排試聽，含目前遊戲裡對應的舊聲音）。
已經有的檔案不重做（--force 重做）。
"""
import html
import json
import os
import shutil
import subprocess
import sys
import time

os.environ.setdefault('TORCHDYNAMO_DISABLE', '1')  # Windows 沒有 Triton
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
TOOLS = os.path.join(ROOT, 'tools', 'sfxgen')
os.environ.setdefault('HF_HOME', os.path.join(TOOLS, 'hf'))
TRIAL_DIR = os.path.join(TOOLS, 'trial')

import numpy as np  # noqa: E402
import soundfile as sf  # noqa: E402

# 鍵、名稱、秒數、提示詞、目前遊戲裡對應的舊聲音（src/assets/sfx 或 sfx2）
TRIAL = [
    ('rifle', '步槍（實彈、機甲尺度）', 2.0,
     'A single gunshot from a giant mech-sized heavy assault rifle: punchy sharp transient, deep low-end thump, '
     'metallic mechanical bolt clank, short outdoor tail.', 'sfx2/rifleN1'),
    ('laser', '光束步槍（動漫科幻）', 2.0,
     'Anime sci-fi beam rifle shot, a bright powerful energy discharge with a sizzling electric whine, '
     'like a mobile suit firing a beam weapon.', 'sfx/laser2'),
    ('explode', '大爆炸（機甲擊破）', 4.0,
     'A giant robot explodes: deep heavy boom, crackling fire, metal debris and fragments raining down.', 'sfx2/exA'),
    ('step', '機甲腳步（混凝土）', 2.0,
     'A single footstep of a ten-meter tall robot on concrete: heavy metal stomp, ground thud, short hydraulic hiss.',
     'sfx2/mStep1'),
    ('qb', 'QB 推進器急衝（動漫）', 2.0,
     'Mech thruster quick boost dash: a sudden powerful jet engine blast that whooshes past, anime sci-fi style.',
     'sfx/thrBurst'),
    ('roar', '機獸吼叫', 3.0,
     'A giant mechanical beast roars: metallic distorted growl layered with grinding servo motors and hissing steam.',
     None),
    ('slash', '能量刀斬中裝甲', 2.0,
     'An energy blade slashes through thick metal armor: sharp electric hum swing, heavy metallic impact, '
     'crackling sparks.', 'sfx2/clash1'),
    ('charge', '能量武器蓄力', 3.0,
     'An energy weapon charging up: a rising electric whine building in pitch to full power, ending with a click.',
     'sfx/charge'),
    ('ui', '介面確定音', 1.0,
     'Futuristic user interface confirm sound, short clean digital beep with a soft synth chime.', 'sfx/uiOk'),
    ('amb', '工業荒野的環境音', 10.0,
     'Desolate windy industrial wasteland ambience, gusts of wind, distant heavy machinery humming and metal creaking.',
     'sfx/ambMach'),
]

MODELS = {'moss': 'MOSS-SoundEffect v2.0', 'sao': 'Stable Audio Open 1.0'}


def arg(k, d=None):
    for a in sys.argv[1:]:
        if a.startswith('--' + k + '='):
            return a.split('=', 1)[1]
    return d


def flag(k):
    return ('--' + k) in sys.argv


def ffmpeg():
    import imageio_ffmpeg

    return imageio_ffmpeg.get_ffmpeg_exe()


def post(y, sr, secs):
    """單聲道、修剪前後的靜音、淡入淡出、峰值 −1 dB"""
    y = np.asarray(y, dtype=np.float32)
    if y.ndim > 1:
        y = y.mean(axis=0)
    y = y - float(np.mean(y))  # 直流
    env = np.abs(y)
    pk = float(env.max()) or 1.0
    thr = pk * 10 ** (-45 / 20)
    idx = np.where(env > thr)[0]
    if len(idx):
        a = max(0, idx[0] - int(0.005 * sr))
        b = min(len(y), idx[-1] + int(0.05 * sr))
        y = y[a:b]
    y = y[: int(secs * sr)]
    fi = min(len(y), int(0.003 * sr))
    if fi:
        y[:fi] *= np.linspace(0, 1, fi)
    fo = min(len(y), int(0.08 * sr))
    if fo:
        y[-fo:] *= np.linspace(1, 0, fo)
    pk = float(np.abs(y).max()) or 1.0
    return y * (10 ** (-1 / 20) / pk)


def save(y, sr, base):
    sf.write(base + '.wav', y, sr, subtype='PCM_16')
    subprocess.run([ffmpeg(), '-y', '-loglevel', 'error', '-i', base + '.wav', '-ac', '1', '-b:a', '128k',
                    base + '.mp3'], check=True)


def bf16(m):
    """一般的浮點權重轉 bf16（複數的位置編碼 freqs 保留，.to(dtype) 會把它變成實數）"""
    import torch

    for mod in m.modules():
        for k, v in list(mod._parameters.items()):
            if v is not None and v.is_floating_point():
                mod._parameters[k] = torch.nn.Parameter(v.data.to(torch.bfloat16), requires_grad=False)
        for k, v in list(mod._buffers.items()):
            if v is not None and v.is_floating_point():
                mod._buffers[k] = v.to(torch.bfloat16)


def gen_moss(items, n, force):
    import torch
    from moss_soundeffect_v2 import MossSoundEffectPipeline
    import moss_soundeffect_v2.diffsynth.pipelines.wan_audio as wa
    from safetensors import safe_open

    def load_bf16(path):
        # 原本的 load_file 讀進 5.6 GB 的 fp32，再複製幾份，系統記憶體會被停掉：逐一讀、轉成 bf16（2.8 GB）
        sd = {}
        with safe_open(path, framework='pt') as f:
            for k in f.keys():
                t = f.get_tensor(k)
                sd[k] = t.to(torch.bfloat16) if t.is_floating_point() else t
        return sd

    wa.load_file = load_bf16
    Dit = wa.WanAudioModel

    def dit_bf16(*a, **k):
        # 直接以 bf16 建立 DiT（原本先建 5.6 GB 的 fp32）；位置編碼明確用 float64 算，不受預設型別影響
        old = torch.get_default_dtype()
        torch.set_default_dtype(torch.bfloat16)
        try:
            return Dit(*a, **k)
        finally:
            torch.set_default_dtype(old)

    wa.WanAudioModel = dit_bf16
    pipe = None
    for key, _, secs, prompt, _ in items:
        for i in range(n):
            base = os.path.join(TRIAL_DIR, 'moss', f'{key}_{i}')
            if os.path.exists(base + '.mp3') and not force:
                continue
            if pipe is None:
                t = time.time()
                pipe = MossSoundEffectPipeline.from_pretrained('OpenMOSS-Team/MOSS-SoundEffect-v2.0',
                                                               torch_dtype=torch.bfloat16, device='cuda')
                bf16(pipe.engine.dit)  # 載入後 DiT 還是 fp32（14.5 GB 超出 12 GB 的顯示卡，慢 10 倍）
                import gc

                gc.collect()
                torch.cuda.empty_cache()
                print(f'MOSS 載入 {time.time() - t:.0f} 秒', flush=True)
            t = time.time()
            a = pipe(prompt=prompt, seconds=max(1.0, secs), num_inference_steps=100, cfg_scale=4.0, seed=1000 + i)
            y = a[0].float().cpu().numpy()
            save(post(y, pipe.sample_rate, secs), pipe.sample_rate, base)
            print(f'moss {key}_{i} {time.time() - t:.1f} 秒  最多 {torch.cuda.max_memory_allocated() / 2**30:.1f} GB',
                  flush=True)
    del pipe
    torch.cuda.empty_cache()


def gen_sao(items, n, force):
    import torch
    from diffusers import StableAudioPipeline

    pipe = None
    for key, _, secs, prompt, _ in items:
        bases = [os.path.join(TRIAL_DIR, 'sao', f'{key}_{i}') for i in range(n)]
        if all(os.path.exists(b + '.mp3') for b in bases) and not force:
            continue
        if pipe is None:
            t = time.time()
            pipe = StableAudioPipeline.from_pretrained('stabilityai/stable-audio-open-1.0',
                                                       torch_dtype=torch.float16).to('cuda')
            print(f'SAO 載入 {time.time() - t:.0f} 秒', flush=True)
        t = time.time()
        g = torch.Generator('cuda').manual_seed(1000)
        out = pipe(prompt, negative_prompt='Low quality, music, speech.', num_inference_steps=150,
                   audio_end_in_s=max(2.0, secs + 0.5), num_waveforms_per_prompt=n, generator=g).audios
        sr = pipe.vae.sampling_rate
        for i, b in enumerate(bases):
            save(post(out[i].float().cpu().numpy(), sr, secs), sr, b)
        print(f'sao {key} ×{n} {time.time() - t:.1f} 秒  最多 {torch.cuda.max_memory_allocated() / 2**30:.1f} GB',
              flush=True)
    del pipe
    torch.cuda.empty_cache()


def page(n):
    """並排試聽頁：每個聲音一列，舊聲音＋兩個模型各 n 個候選"""
    old_dir = os.path.join(TRIAL_DIR, 'old')
    os.makedirs(old_dir, exist_ok=True)
    rows = []
    for key, name, secs, prompt, old in TRIAL:
        cells = []
        if old:
            src = os.path.join(ROOT, 'src', 'assets', old + '.mp3')
            if os.path.exists(src):
                shutil.copy(src, os.path.join(old_dir, key + '.mp3'))
                cells.append(f'<div class="c old"><b>現在的</b><audio controls preload="none" src="old/{key}.mp3"></audio></div>')
        else:
            cells.append('<div class="c old"><b>現在的</b><i>（程式合成，沒有檔案）</i></div>')
        for m in MODELS:
            for i in range(n):
                f = f'{m}/{key}_{i}.mp3'
                if os.path.exists(os.path.join(TRIAL_DIR, f)):
                    cells.append(f'<div class="c {m}"><b>{"MOSS" if m == "moss" else "SAO"} {i + 1}</b>'
                                 f'<audio controls preload="none" src="{f}"></audio></div>')
        rows.append(f'<section><h2>{html.escape(name)}</h2><p class="p">{html.escape(prompt)}</p>'
                    f'<div class="g">{"".join(cells)}</div></section>')
    doc = f'''<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><title>音效試做</title>
<style>
body{{font-family:"Noto Sans TC",system-ui,sans-serif;background:#16181c;color:#e8e8e8;margin:0;padding:24px;max-width:1200px}}
h1{{font-size:22px}} h2{{font-size:17px;margin:0 0 4px}} section{{background:#20242a;border-radius:10px;padding:14px 16px;margin:14px 0}}
.p{{color:#9aa3ad;font-size:12px;margin:0 0 10px}} .g{{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:8px}}
.c{{background:#2a2f37;border-radius:8px;padding:8px;font-size:13px}} .c b{{display:block;margin-bottom:4px}}
.c audio{{width:100%;height:32px}} .old{{border-left:4px solid #888}} .moss{{border-left:4px solid #d7ff3c}} .sao{{border-left:4px solid #4cc3ff}}
.k span{{display:inline-block;margin-right:14px}}
</style></head><body><h1>音效試做（第 0 期）</h1>
<p class="k"><span style="color:#888">■ 現在遊戲裡的</span><span style="color:#d7ff3c">■ MOSS-SoundEffect v2.0</span><span style="color:#4cc3ff">■ Stable Audio Open 1.0</span></p>
<p>同一句英文提示詞、各 {n} 個候選，只做了修剪與音量統一（還沒有分層與混音）。</p>
{"".join(rows)}</body></html>'''
    with open(os.path.join(TRIAL_DIR, 'index.html'), 'w', encoding='utf-8') as f:
        f.write(doc)
    print('試聽頁：' + os.path.join(TRIAL_DIR, 'index.html'))


def main():
    if not flag('trial'):
        print(__doc__)
        return
    n = int(arg('n', '3'))
    only = arg('only')
    items = [t for t in TRIAL if not only or t[0] in only.split(',')]
    which = arg('model')
    for m in MODELS:
        os.makedirs(os.path.join(TRIAL_DIR, m), exist_ok=True)
    if which in (None, 'moss'):
        gen_moss(items, n, flag('force'))
    if which in (None, 'sao'):
        try:
            gen_sao(items, n, flag('force'))
        except Exception as e:  # 沒同意條款、沒下載
            print('Stable Audio Open 失敗：', e)
    page(n)


if __name__ == '__main__':
    main()
