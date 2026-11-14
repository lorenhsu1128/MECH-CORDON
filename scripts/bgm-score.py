"""AI 配樂的自動評分與挑選（scripts/bgm-gen.py 的候選 → picks.json）：開發者聽不到，用數據挑

用法：npm run bgm:score -- --ch=1 [--files=theme__f0,theme__f0_kana]
每個候選：
- 人聲分離（Demucs htdemucs）→ 人聲的音量比例
- 日文聽寫（Whisper large-v3-turbo，transformers）→ 和歌詞比對：每一句歌詞在聽寫裡找最像的片段，平均相似度＝歌詞吻合度；
  副歌第一句第一次出現的時間 chorus_at（Boss 最終型態切到主題歌的副歌用）
- 音高（人聲的中位數）→ 聲線對不對：少女型要高、歌姬型中音
- 音樂美感（Meta audiobox-aesthetics：PQ 製作品質、CE 好聽程度；裝不起來就略過）
- 削波、靜音段
總分＝0.4 歌詞＋0.4 美感＋0.2 聲線；每種類型挑總分最高的寫進 tools/acestep/out/c<章>/picks.json，
全部的分數寫進 scores.json（同一個檔案不重算）。
"""
import difflib
import json
import os
import re
import sys

import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
OUT = os.path.join(ROOT, 'tools', 'acestep', 'out')
SR = 44100

_kk = None


def hira(t):
    """漢字與片假名 → 平假名，去掉標點與空白（比對用）"""
    global _kk
    import pykakasi

    if _kk is None:
        _kk = pykakasi.kakasi()
    t = ''.join(x['hira'] for x in _kk.convert(t))
    return re.sub(r'[\s、。，,.!！?？「」『』…・〜~ー\-]', '', t)


def lyric_lines(lyrics):
    seen, out = set(), []
    for line in lyrics.split('\n'):
        line = line.strip()
        if not line or line.startswith('['):
            continue
        if line not in seen:
            seen.add(line)
            out.append(line)
    return out


class Models:
    def __init__(self):
        import torch

        self.torch = torch
        self.dev = 'cuda' if torch.cuda.is_available() else 'cpu'
        from demucs.pretrained import get_model

        self.sep = get_model('htdemucs').to(self.dev).eval()
        from transformers import pipeline

        self.asr = pipeline(
            'automatic-speech-recognition',
            model='openai/whisper-large-v3-turbo',
            torch_dtype=torch.float16 if self.dev == 'cuda' else torch.float32,
            device=self.dev,
        )
        try:
            from audiobox_aesthetics.infer import initialize_predictor

            self.aes = initialize_predictor()
        except Exception as e:  # 美感模型裝不起來：略過
            print('（略過音樂美感評分：', str(e)[:120], '）', flush=True)
            self.aes = None

    def vocals(self, x):
        from demucs.apply import apply_model

        t = self.torch.tensor(x.T, dtype=self.torch.float32, device=self.dev)[None]
        with self.torch.no_grad():
            s = apply_model(self.sep, t, split=True, overlap=0.1, progress=False)[0]
        names = self.sep.sources
        return s[names.index('vocals')].cpu().numpy().T

    def transcribe(self, v16):
        r = self.asr(
            {'raw': v16, 'sampling_rate': 16000},
            return_timestamps=True,
            generate_kwargs={'language': 'japanese', 'task': 'transcribe'},
            chunk_length_s=30,
            batch_size=4,
        )
        out = []
        for c in r.get('chunks', []):
            a, b = c['timestamp']
            out.append((a or 0.0, b if b is not None else (a or 0.0) + 5, c['text']))
        return out or [(0.0, 0.0, r['text'])]

    def aesthetics(self, path):
        if not self.aes:
            return None
        r = self.aes.forward([{'path': path}])[0]
        return {k: round(float(v), 2) for k, v in r.items()}


def load(path):
    import soundfile as sf

    x, sr = sf.read(path, dtype='float32', always_2d=True)
    if x.shape[1] == 1:
        x = np.repeat(x, 2, 1)
    if sr != SR:
        import librosa

        x = librosa.resample(x.T, orig_sr=sr, target_sr=SR).T
    return x


def score(M, path, meta):
    import librosa

    x = load(path)
    v = M.vocals(x)
    mono = x.mean(1)
    vm = v.mean(1)
    voc_ratio = float(np.sqrt(np.mean(vm**2)) / (np.sqrt(np.mean(mono**2)) + 1e-9))
    v16 = librosa.resample(vm, orig_sr=SR, target_sr=16000)
    chunks = M.transcribe(v16)
    heard = hira(''.join(t for _, _, t in chunks))
    lines = lyric_lines(meta.get('lyrics', ''))
    sims = []
    for line in lines:
        h = hira(line)
        if not h or not heard:
            sims.append(0.0)
            continue
        L = len(h)
        best = 0.0
        step = max(1, L // 3)
        for i in range(0, max(1, len(heard) - L + 1), step):
            best = max(best, difflib.SequenceMatcher(None, h, heard[i : i + L + 2]).ratio())
        sims.append(best)
    lyric = float(np.mean(sims)) if sims else 0.0
    # 副歌第一句第一次出現的時間：在每一段聽寫裡滑動比對，時間照字在那一段裡的位置內插
    chorus_at = None
    m = re.search(r'\[(Chorus|Final Chorus)[^\]]*\]\n([^\n]+)', meta.get('lyrics', ''))
    if m:
        h = hira(m.group(2))
        for a, b, txt in chunks:
            ht = hira(txt)
            best, bi = 0.0, 0
            for i in range(0, max(1, len(ht) - len(h) + 1)):
                r = difflib.SequenceMatcher(None, h, ht[i : i + len(h)]).ratio()
                if r > best:
                    best, bi = r, i
            if best >= 0.6:
                chorus_at = round(max(0.0, a + (b - a) * bi / max(1, len(ht)) - 0.3), 1)
                break
    # 人聲的音高（有聲的格的中位數）
    f0, vf, _ = librosa.pyin(v16[: 16000 * 90], fmin=120, fmax=1100, sr=16000, frame_length=1024, hop_length=320)
    f0 = f0[vf & ~np.isnan(f0)] if f0 is not None else np.array([])
    pitch = float(np.median(f0)) if len(f0) > 50 else 0.0
    want = {'girl': (330, 700), 'diva': (220, 480), 'duet': (250, 650)}.get(meta.get('voice'), (200, 700))
    voice_fit = 1.0 if want[0] <= pitch <= want[1] else max(0.0, 1 - min(abs(pitch - want[0]), abs(pitch - want[1])) / 150)
    aes = M.aesthetics(path)
    aes_n = ((aes['PQ'] + aes['CE']) / 20) if aes else 0.6
    clip = float(np.mean(np.abs(x) > 0.995))
    sec = len(mono) / SR
    rms = np.array([np.sqrt(np.mean(mono[int(i * SR) : int((i + 1) * SR)] ** 2)) for i in range(int(sec))])
    silent = int(np.sum(rms[3:-3] < 0.005)) if len(rms) > 6 else 0
    total = 0.4 * lyric + 0.4 * aes_n + 0.2 * voice_fit - 0.05 * silent - (0.2 if clip > 0.001 else 0)
    if meta.get('type') in ('breakthrough', 'chase'):  # 人聲只有切片：歌詞吻合度權重降低
        total = 0.15 * lyric + 0.65 * aes_n + 0.2 * voice_fit - 0.05 * silent
    return dict(
        total=round(total, 3),
        lyric=round(lyric, 3),
        aes=aes,
        pitch=round(pitch),
        voice_fit=round(voice_fit, 2),
        voc_ratio=round(voc_ratio, 2),
        chorus_at=chorus_at,
        silent=silent,
        clip=round(clip, 5),
        heard=''.join(t for _, _, t in chunks)[:300],
    )


def main():
    opt = dict(a[2:].split('=', 1) if '=' in a else (a[2:], '1') for a in sys.argv[1:] if a.startswith('--'))
    ch = int(opt['ch'])
    out = os.path.join(OUT, f'c{ch}')
    sp = os.path.join(out, 'scores.json')
    scores = json.load(open(sp, encoding='utf8')) if os.path.exists(sp) else {}
    names = (
        opt['files'].split(',')
        if opt.get('files')
        else sorted(f[:-4] for f in os.listdir(out) if f.endswith('.wav') and '__f' in f)
    )
    todo = [n for n in names if n not in scores or 'redo' in opt]
    if todo:
        M = Models()
        for n in todo:
            with open(os.path.join(out, n + '.json'), encoding='utf8') as fp:
                meta = json.load(fp)
            s = score(M, os.path.join(out, n + '.wav'), meta)
            scores[n] = s
            print(f'{n:28s} 總分 {s["total"]:.3f}  歌詞 {s["lyric"]:.2f}  美感 {s["aes"]}  音高 {s["pitch"]}  '
                  f'人聲 {s["voc_ratio"]}  副歌 {s["chorus_at"]}', flush=True)
            print('   聽寫：', s['heard'][:120], flush=True)
            with open(sp, 'w', encoding='utf8', newline='\n') as fp:
                json.dump(scores, fp, ensure_ascii=False, indent=1)
    # 每種類型挑總分最高的（只看正式候選 <類型>__f<i>，測試用的 _tag 不算）
    picks = {}
    for n, s in scores.items():
        m = re.fullmatch(r'([a-z]+)__f\d+', n)
        if not m:
            continue
        t = m.group(1)
        if t not in picks or s['total'] > scores[picks[t]]['total']:
            picks[t] = n
    with open(os.path.join(out, 'picks.json'), 'w', encoding='utf8', newline='\n') as fp:
        json.dump(picks, fp, ensure_ascii=False, indent=1)
    print('挑選：', picks)


main()
