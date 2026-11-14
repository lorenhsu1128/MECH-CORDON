"""過場配樂的拍點表（docs/cine-redesign-design.md 第 3 期：卡點）。

每首 src/assets/music/<曲名>.mp3 量一次節拍（librosa 的 beat_track）與每一拍的時間，寫成
src/data/cine/beats.js（{ 曲名: { bpm, beats: [秒…] } }）；劇本用 data/cine/beats.js 的 beatAt(曲名, 第幾拍, 曲子的 off)
把「第幾拍」換成秒數（例如漫畫的格子落在拍點上）。

  python scripts/cine-beats.py            # 全部的曲子
  python scripts/cine-beats.py cine_c1    # 只量一首

要 librosa（語音的 conda 環境 rubicon-voice 有）。曲子換了要重跑。
"""
import json
import os
import sys

import librosa

ROOT = os.path.join(os.path.dirname(__file__), '..')
MUSIC = os.path.join(ROOT, 'src', 'assets', 'music')
OUT = os.path.join(ROOT, 'src', 'data', 'cine', 'beats.js')


def measure(name):
    y, sr = librosa.load(os.path.join(MUSIC, name + '.mp3'), sr=22050, mono=True)
    tempo, frames = librosa.beat.beat_track(y=y, sr=sr, units='frames')
    times = librosa.frames_to_time(frames, sr=sr)
    bpm = float(tempo[0] if hasattr(tempo, '__len__') else tempo)
    return {'bpm': round(bpm, 2), 'beats': [round(float(t), 3) for t in times]}


def main():
    names = sys.argv[1:] or sorted(f[:-4] for f in os.listdir(MUSIC) if f.endswith('.mp3'))
    data = {}
    if os.path.exists(OUT):
        # 保留沒有重量的曲子
        txt = open(OUT, encoding='utf-8').read()
        s = txt.index('= ') + 2
        data = json.loads(txt[s:txt.rindex(';')])
    for n in names:
        data[n] = measure(n)
        print(f"{n}：{data[n]['bpm']} BPM、{len(data[n]['beats'])} 拍", flush=True)
    with open(OUT, 'w', encoding='utf-8', newline='\n') as f:
        f.write('// 過場配樂的拍點表（scripts/cine-beats.py 產生，不要手改）：{ 曲名: { bpm, beats: [秒…] } }\n')
        f.write('// 劇本用 beatAt(曲名, 第幾拍, off) 把拍子換成過場的秒數（docs/cine-redesign-design.md 第 3 期）\n')
        f.write('export const BEATS = ' + json.dumps(data, separators=(',', ':')) + ';\n')
        f.write(
            '// 第 n 拍（從 0 算，可以有小數＝拍子之間）在過場裡的秒數；off＝劇本的配樂從曲子的第幾秒開始、at＝配樂在過場的第幾秒進來\n'
            'export function beatAt(track, n, off = 0, at = 0) {\n'
            '  const B = BEATS[track];\n'
            '  if (!B) return at + n * 0.5;\n'
            '  const b = B.beats.filter((t) => t >= off);\n'
            '  const i = Math.floor(n),\n'
            '    k = n - i;\n'
            '  const t0 = b[i] ?? b[b.length - 1] + (i - b.length + 1) * (60 / B.bpm);\n'
            '  const t1 = b[i + 1] ?? t0 + 60 / B.bpm;\n'
            '  return at + t0 + (t1 - t0) * k - off;\n'
            '}\n'
            '// t 秒之後最近的拍點（過場的秒數）\n'
            'export function snapBeat(track, t, off = 0, at = 0) {\n'
            '  const B = BEATS[track];\n'
            '  if (!B) return t;\n'
            '  const x = t - at + off;\n'
            '  const b = B.beats.find((v) => v >= x);\n'
            '  return b == null ? t : at + b - off;\n'
            '}\n'
        )
    print(OUT)


if __name__ == '__main__':
    main()
