"""AI 配樂的歌曲設定（JSON，scripts/bgm-gen.py 與伺服器的配樂產生器 /api/bgm 共用）。

common.json：共同曲風、聲線、各類型的編曲、平時版、各章的音色、各類型的預設聲線與速度。
c<章>.json：{ ch, key（這一章的調）, songs: { 類型: { title 日文歌名, zh 中文名, lyrics 歌詞（[段落] 標記）,
  可以覆寫 voice／bpm／key／arr／dur } } }。歌詞寫日文漢字（主歌每句句尾押同一個韻、副歌兩兩押韻）。
"""
import json
import os

DIR = os.path.dirname(os.path.abspath(__file__))


def common():
    with open(os.path.join(DIR, 'common.json'), encoding='utf8') as fp:
        c = json.load(fp)
    c['PALETTE'] = {int(k): v for k, v in c['PALETTE'].items()}
    return c


def chapter(ch):
    with open(os.path.join(DIR, f'c{ch}.json'), encoding='utf8') as fp:
        return json.load(fp)


def chapters():
    return sorted(int(f[1:-5]) for f in os.listdir(DIR) if f.startswith('c') and f.endswith('.json') and f[1:-5].isdigit())
