"""語音 v2 的試驗（docs/cine-redesign-design.md 的「立繪與語音重新產生」）：
同一個角色、同一句台詞，比較「現在的固定語氣」與「照表情的語氣」（VoxCPM2 的語氣指示＋角色的參考音檔）。
輸出 tools/voicelab/<角色>/<方式>_<句>_<次>.mp3 與 index.json（試聽頁讀）。tools/voicelab/ 不進 git。

  conda 的 rubicon-voice 環境：python scripts/voice-emo-trial.py --voice castron [--takes 2] [--lang zh|ja]
"""
import argparse
import importlib.util
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = importlib.util.spec_from_file_location('vg', os.path.join(ROOT, 'scripts', 'voice-gen.py'))
vg = importlib.util.module_from_spec(spec)
sys.argv_saved = sys.argv
sys.argv = [sys.argv[0]]
spec.loader.exec_module(vg)
sys.argv = sys.argv_saved

# 表情 → 語氣指示（中文；產生時轉簡體）。表情的鍵同 data/line-expr.js
EXPR_STYLE = {
    'neutral': '平穩、像在談生意',
    'smile': '帶著笑意、輕鬆',
    'laugh': '放聲大笑著說、豪邁',
    'angry': '憤怒、拍桌大吼、咬牙切齒',
    'surprised': '吃驚、急促、提高音量',
    'sad': '沉重、低聲、說得很慢',
    'think': '思考中、慢慢說、停頓',
    'scorn': '不屑、冷笑',
    'guilt': '心虛、低聲、斷斷續續、不敢直說',
    'scheme': '壓低聲音、得意、帶著算計的笑',
}

# 試驗台詞（擴寫後劇本的語氣示範）：(鍵, 表情, 台詞)
TRIAL = {
    'castron': [
        ('n1', 'neutral', '合約上寫得很清楚：水壩完整交回，尾款一毛不少。'),
        ('s1', 'scheme', '放心，價錢好商量……只要你肯幫我們把那份資料「弄丟」。'),
        ('a1', 'angry', '你知道那一炸，公司要賠多少嗎？給我說清楚！'),
        ('g1', 'guilt', '……那些礦工的名字，我一個都沒忘。我只是……回不了頭了。'),
        ('l1', 'laugh', '哈哈哈！好樣的！這一仗打得漂亮，今晚的酒我請！'),
        ('x1', 'surprised', '什麼？北段的閘門……是誰打開的？'),
    ],
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--voice', default='castron')
    ap.add_argument('--takes', type=int, default=2)
    a = ap.parse_args()
    v = a.voice
    lines = TRIAL[v]
    out = os.path.join(ROOT, 'tools', 'voicelab', v)
    os.makedirs(out, exist_ok=True)
    ref = os.path.join(vg.VDIR, 'ref', v + '.flac')
    if not os.path.exists(ref):
        sys.exit('沒有參考音檔：' + ref)
    model = vg.load_vox()
    sr = model.tts_model.sample_rate
    base = vg.CAST[v][2]
    idx = []
    for key, expr, text in lines:
        for mode, st in (('old', base + ('、語氣有力' if '！' in text else '')), ('emo', base + '、' + EXPR_STYLE[expr])):
            for tk in range(a.takes):
                f = f'{mode}_{key}_{tk}.mp3'
                vg.seed(1000 + tk * 7919 + (vg.zlib.crc32(key.encode()) & 0xffff))
                w = model.generate(text=f'({vg.to_simp(st)})' + vg.say(text), reference_wav_path=ref,
                                   cfg_value=2.0, inference_timesteps=10)
                w = vg.trim(vg.np.asarray(w, dtype=vg.np.float32), sr)
                vg.write_mp3(w, sr, os.path.join(out, f))
                idx.append({'file': f, 'mode': mode, 'key': key, 'expr': expr, 'text': text, 'style': st, 'take': tk})
                print(f, flush=True)
    json.dump(idx, open(os.path.join(out, 'index.json'), 'w', encoding='utf8'), ensure_ascii=False, indent=1)
    print('完成', len(idx))


if __name__ == '__main__':
    main()
