"""自製音效的共用部分（docs/sfx-gen-design.md）：載入 MOSS、後處理、存檔、CLAP 評分

環境由 npm run sfx:setup 裝在 tools/sfxgen/（venv、HF_HOME、clap/）。
"""
import os
import subprocess

os.environ.setdefault('TORCHDYNAMO_DISABLE', '1')  # Windows 沒有 Triton
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
TOOLS = os.path.join(ROOT, 'tools', 'sfxgen')
os.environ.setdefault('HF_HOME', os.path.join(TOOLS, 'hf'))

import numpy as np  # noqa: E402
import soundfile as sf  # noqa: E402

MOSS_ID = 'OpenMOSS-Team/MOSS-SoundEffect-v2.0'


def ffmpeg():
    import imageio_ffmpeg

    return imageio_ffmpeg.get_ffmpeg_exe()


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


def load_moss():
    """載入 MOSS：權重逐一讀成 bf16、DiT 直接以 bf16 建立（原本的載入法讓系統記憶體不足而被停掉）"""
    import gc

    import torch
    from moss_soundeffect_v2 import MossSoundEffectPipeline
    import moss_soundeffect_v2.diffsynth.pipelines.wan_audio as wa
    from safetensors import safe_open

    def load_bf16(path):
        sd = {}
        with safe_open(path, framework='pt') as f:
            for k in f.keys():
                t = f.get_tensor(k)
                sd[k] = t.to(torch.bfloat16) if t.is_floating_point() else t
        return sd

    Dit = wa.WanAudioModel

    def dit_bf16(*a, **k):
        old = torch.get_default_dtype()
        torch.set_default_dtype(torch.bfloat16)  # 位置編碼明確用 float64 算，不受預設型別影響
        try:
            return Dit(*a, **k)
        finally:
            torch.set_default_dtype(old)

    wa.load_file = load_bf16
    wa.WanAudioModel = dit_bf16
    pipe = MossSoundEffectPipeline.from_pretrained(MOSS_ID, torch_dtype=torch.bfloat16, device='cuda')
    bf16(pipe.engine.dit)
    gc.collect()
    torch.cuda.empty_cache()
    return pipe


def moss_gen(pipe, prompt, secs, seed, maxs=None, steps=100, cfg=4.0, neg=''):
    """產生一個聲音，回傳 (單聲道 float32, 取樣率)；maxs＝去噪的潛在空間長度（秒，None＝模型預設 30）"""
    kw = dict(prompt=prompt, seconds=max(1.0, secs), num_inference_steps=steps, cfg_scale=cfg, seed=seed)
    if maxs:
        kw['max_inference_seconds'] = int(maxs)
    if neg:
        kw['negative_prompt'] = neg
    a = pipe(**kw)
    y = a[0].float().cpu().numpy()
    if y.ndim > 1:
        y = y.mean(axis=0)
    return y.astype(np.float32), pipe.sample_rate


def post(y, sr, secs, fade_out=0.08, trim_db=-45):
    """單聲道、去直流、修剪前後的靜音、淡入淡出、峰值 −1 dB"""
    y = np.asarray(y, dtype=np.float32)
    if y.ndim > 1:
        y = y.mean(axis=0)
    y = y - float(np.mean(y))
    env = np.abs(y)
    pk = float(env.max()) or 1.0
    idx = np.where(env > pk * 10 ** (trim_db / 20))[0]
    if len(idx):
        y = y[max(0, idx[0] - int(0.005 * sr)) : min(len(y), idx[-1] + int(0.05 * sr))]
    y = y[: int(secs * sr)].copy()
    fi = min(len(y), int(0.003 * sr))
    if fi:
        y[:fi] *= np.linspace(0, 1, fi)
    fo = min(len(y), int(fade_out * sr))
    if fo:
        y[-fo:] *= np.linspace(1, 0, fo)
    pk = float(np.abs(y).max()) or 1.0
    return y * (10 ** (-1 / 20) / pk)


def loopify(y, sr, xf=1.0):
    """循環音：尾端 xf 秒和開頭交叉淡化（等功率），接起來沒有接縫"""
    n = int(xf * sr)
    if len(y) < n * 3:
        return y
    a = np.linspace(0, np.pi / 2, n)
    head, tail = y[:n], y[-n:]
    out = y[n:].copy()
    out[-n:] = tail * np.cos(a) + head * np.sin(a)
    pk = float(np.abs(out).max()) or 1.0
    return out * (10 ** (-1 / 20) / pk)


def save_wav(y, sr, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    sf.write(path, y, sr, subtype='PCM_16')


def to_mp3(wav, mp3, kbps=96):
    os.makedirs(os.path.dirname(mp3), exist_ok=True)
    subprocess.run([ffmpeg(), '-y', '-loglevel', 'error', '-i', wav, '-ac', '1', '-ar', '44100', '-b:a', f'{kbps}k', mp3],
                   check=True)


class Clap:
    """CLAP（laion/larger_clap_general，tools/sfxgen/clap/）：提示詞與聲音的相似度"""

    def __init__(self, device='cuda'):
        import torch
        from transformers import ClapModel, ClapProcessor

        d = os.path.join(TOOLS, 'clap')
        self.torch = torch
        self.proc = ClapProcessor.from_pretrained(d)
        self.model = ClapModel.from_pretrained(d).to(device).eval()
        self.device = device
        self.cache = {}

    def text(self, t):
        if t not in self.cache:
            with self.torch.no_grad():
                inp = self.proc(text=[t], return_tensors='pt', padding=True).to(self.device)
                e = self.model.get_text_features(**inp)
                self.cache[t] = (e / e.norm(dim=-1, keepdim=True))[0]
        return self.cache[t]

    def score(self, y, sr, prompt):
        import librosa

        torch = self.torch
        y48 = librosa.resample(np.asarray(y, dtype=np.float32), orig_sr=sr, target_sr=48000) if sr != 48000 else y
        with torch.no_grad():
            inp = self.proc(audios=[y48], sampling_rate=48000, return_tensors='pt').to(self.device)
            a = self.model.get_audio_features(**inp)
            a = a / a.norm(dim=-1, keepdim=True)
        return float((a[0] * self.text(prompt)).sum())


def quality(y, sr):
    """CLAP 以外的品質量測：削波比例、開頭的起音（前 30 ms 的峰值／整體峰值）、有聲音的長度、雜訊（頻譜平坦度）"""
    import librosa

    y = np.asarray(y, dtype=np.float32)
    pk = float(np.abs(y).max()) or 1e-9
    clip = float(np.mean(np.abs(y) > 0.999 * pk))
    head = float(np.abs(y[: int(0.03 * sr)]).max()) / pk if len(y) else 0
    env = np.abs(y)
    active = float(np.mean(env > pk * 0.05)) * len(y) / sr
    flat = float(np.mean(librosa.feature.spectral_flatness(y=y + 1e-9)))
    return {'clip': clip, 'attack': head, 'active': active, 'flat': flat, 'len': len(y) / sr}
