"""把訓練好的語音 LoRA 收進專案（docs/voice-casting.md）：tools/voxcpm/（gitignore 的訓練目錄）→ tools/voice-lora/（Git LFS）。

  ja／<聲音>：共用聲音的 LoRA（tools/voxcpm/lora/，日文語音用；中文有專用聲音之前中文也用它）
  zh／<聲音>：中文專用聲音的 LoRA（tools/voxcpm/lora_zh/，scripts/voice-lora.py --zh）
每個資料夾只放最後的權重（float16，原本 float32 的一半；模型以 bfloat16 推論，不影響結果）、lora_config.json、eval.json。
voice-gen.py 在本機沒有訓練目錄時從這裡讀，所以別台電腦 pull 之後不用重新訓練就能產生語音。

  python scripts/voice-lora-pack.py [--voice=castron,…]
"""
import argparse
import json
import os
import shutil
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
VX = os.path.join(ROOT, 'tools', 'voxcpm')
OUT = os.path.join(ROOT, 'tools', 'voice-lora')
CAST = [k for k in json.load(open(os.path.join(ROOT, 'scripts', 'voice_cast.json'), encoding='utf-8')) if not k.startswith('_')]


def newest(v, src):
    base = os.path.join(VX, src, v, 'ckpt')
    if not os.path.isdir(base):
        return None
    c = [r for r, _, fs in os.walk(base) if 'lora_weights.safetensors' in fs]
    return max(c, key=os.path.getmtime) if c else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--voice', default='')
    a = ap.parse_args()
    import torch
    from safetensors.torch import load_file, save_file
    voices = a.voice.split(',') if a.voice else CAST
    n = 0
    for lang, src in (('ja', 'lora'), ('zh', 'lora_zh')):
        for v in voices:
            p = newest(v, src)
            if not p:
                print(f'{lang}/{v}：沒有 LoRA，略過', flush=True)
                continue
            d = os.path.join(OUT, lang, v)
            os.makedirs(d, exist_ok=True)
            w = load_file(os.path.join(p, 'lora_weights.safetensors'))
            save_file({k: t.to(torch.float16).contiguous() for k, t in w.items()}, os.path.join(d, 'lora_weights.safetensors'))
            shutil.copy(os.path.join(p, 'lora_config.json'), os.path.join(d, 'lora_config.json'))
            ev = os.path.join(VX, src, v, 'eval.json')
            if os.path.exists(ev):
                shutil.copy(ev, os.path.join(d, 'eval.json'))
            n += 1
            print(f'{lang}/{v} ← {os.path.relpath(p, ROOT)}', flush=True)
    print(f'共 {n} 個 → {OUT}')


if __name__ == '__main__':
    sys.exit(main())
