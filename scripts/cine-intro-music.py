"""每章開場與章末過場動畫的配樂（純器樂，本地 ACE-Step 1.5；docs/cinematics.md 的「開場的配樂」）

使用者（2026-11-14）：「你仔細看一下每章開頭的過場動畫的內容，重新幫我搭配背景音樂」→ 選定用 AI 新做純配樂。
開場是「地點與局勢的旁白 → 委託方與 ECHO 的對話 → 收尾的一句 → 章名卡」，所以配樂：沒有人聲（對白時 game/cine.js
會壓低配樂）、前段稀疏壓得住旁白與對話、最後十幾秒推到章名卡的高潮、收在延長的和弦；音色與調沿用該章 AI 配樂
（scripts/bgm_songs/ 的 PALETTE 與 key），進任務之後的配樂接得起來；情緒照該章開場的內容（INTROS）。

  npm run cine:music -- gen [--ch=i1,o2] [--n=5]  產生候選 tools/acestep/out/cine/<鍵>__f<i>.wav（鍵：i<章>＝開場、
                                                  o<章>＝章末；只寫數字＝開場；ACE-Step 的環境）
  npm run cine:music -- score [--ch=…]          評分挑選：audiobox 的 PQ／CE、人聲比例（Demucs）→ picks.json（評分環境）
  npm run cine:music -- pack [--ch=…]           挑中的照能量曲線推拉音量 → src/assets/music/cine_<鍵>.mp3
                                                  （之後 python scripts/cine-beats.py cine_<鍵> 量拍點、npm run build）
已經有的候選略過（中斷後重跑接著做）；不滿意某章就刪掉那章的候選或改 INTROS 再跑。
"""
import json
import os
import re
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
OUT = os.path.join(ROOT, 'tools', 'acestep', 'out', 'cine')
DST = os.path.join(ROOT, 'src', 'assets', 'music')

# 每章開場（2026-11-14 看過 node scripts/cine-shots.js i1_<章> 的逐鏡截圖）：長度（開場的總長＋幾秒，尾巴由劇本淡出）、
# 速度、情緒、起伏（arc：照畫面的段落寫給模型）、能量曲線（curve：[起, 迄, 0～1]，評分時和候選的音量起伏比對；
# 空景與旁白中低、衝擊畫格與「轟」的漫畫頁一記重拍、對話壓低、宿敵 PV 與章名卡推上去）
INTROS = {
    1: dict(dur=91, bpm=90,
            mood='lonely desert western tension, a rusted antenna waking up, artillery ambush on a convoy, '
            'cold mercenary contract at night, heroic resolve',
            arc='sparse desert wind intro, a sudden heavy percussive ambush hit after ten seconds, then a low tense '
            'underscore for a long night conversation, then driving action drums building to a big climax at the end',
            curve=[(0, 10, .3), (10, 24, .9), (24, 58, .25), (58, 62, .5), (62, 80, .9), (80, 88, 1)]),
    2: dict(dur=84, bpm=100,
            mood='cool corporate intrigue, two powers bidding for a mercenary, a railgun battery on a dam, '
            'curious and calculating scientist, a sense of price and contract',
            arc='measured pulsing intro under narration, a heavy hit at twenty seconds for the railgun, then a low '
            'sly underscore for dialogue, then mechs in action building to a strong finale',
            curve=[(0, 21, .35), (21, 32, .9), (32, 62, .25), (62, 75, .85), (75, 81, 1)]),
    3: dict(dur=74, bpm=72,
            mood='grey blizzard silence, an abandoned refugee camp, a roster of the missing, quiet guilt and '
            'reproach, mournful and restrained, fragile hope',
            arc='very quiet and sparse throughout, cold mournful melody under narration and dialogue, only a modest '
            'rise near the end, ends cold and still',
            curve=[(0, 19, .3), (19, 50, .2), (50, 65, .55), (65, 72, .65)]),
    4: dict(dur=77, bpm=96,
            mood='vast awe of a vertical megastructure and an old spaceport, the only road to orbit, a cheeky '
            'smirking merchant, everyone looking up, ascending pulse, wonder with unease',
            arc='wide atmospheric awe under narration, a playful sly groove for the cheeky dialogue, then rising '
            'arpeggios and drums into a bright climax at the end',
            curve=[(0, 31, .45), (31, 54, .35), (54, 61, .5), (61, 69, .85), (69, 75, 1)]),
    5: dict(dur=73, bpm=88,
            mood='every faction converging on a city built on the sea, a war fleet, civilians caught in between, '
            'political tension with an ominous undercurrent, why are you always chosen',
            arc='open sea intro, a big hit at eight seconds for the fleet, rolling tense underscore under narration '
            'and dialogue, ominous rise, then a strong climax at the end',
            curve=[(0, 7, .35), (7, 11, .9), (11, 26, .45), (26, 46, .25), (46, 57, .5), (57, 65, .85), (65, 71, .95)]),
    6: dict(dur=79, bpm=80,
            mood='a station above the sea of clouds counting down, four clients each answering why me, '
            'weightless melancholy, will you come back, tender and aching, bittersweet',
            arc='weightless ticking intro, a steady rhythmic pulse as four voices answer in turn, then tender sparse '
            'and aching under the emotional dialogue, a short rise, ending bittersweet and suspended, not triumphant',
            curve=[(0, 12, .35), (12, 32, .5), (32, 62, .25), (62, 69, .7), (69, 77, .5)]),
    7: dict(dur=70, bpm=84,
            mood='rivers of lava and a moving fortress the size of a city, heavy volcanic dread, '
            'a remorseful confession and apology, somber and grave',
            arc='smoldering intro, a huge hit at eight seconds for the fortress, vast heavy drone over the deck, '
            'then somber and quiet under the confession, then war drums and a fiery climax at the end',
            curve=[(0, 8, .5), (8, 13, .95), (13, 26, .55), (26, 54, .25), (54, 62, .9), (62, 68, 1)]),
    8: dict(dur=60, bpm=92,
            mood='the giant ark that only moves forward and leaves nothing behind, the final road, '
            'grave and resolute, quiet determination swelling to epic',
            arc='grand and vast from the start, then restrained resolve under the dialogue, then a short epic '
            'swell into the final climax',
            curve=[(0, 20, .6), (20, 44, .35), (44, 52, .85), (52, 58, 1)]),
}
# 每章章末（第 8 章沒有章末，接結局；2026-11-14 看過 cine-shots.js o1_<章> 與依抉擇的版本，第 2、4 章兩個版本的結構相同）
OUTROS = {
    1: dict(dur=79, bpm=76,
            mood='a job done and paid, warm dusk in an office, the antenna core resting on the sand, '
            'a quiet unease as four channels light up at night, a gentle unanswered question',
            arc='warm satisfied opening, calm and slightly uneasy under narration, a soft ominous swell at night, '
            'ends quiet and gentle on an unresolved chord',
            curve=[(0, 20, .35), (20, 27, .3), (27, 36, .5), (36, 62, .35), (62, 76, .3)]),
    2: dict(dur=61, bpm=70,
            mood='the price of a choice, closed floodgates and a dry river, refugees walking west into the snow '
            'at night, guilt and bitterness, a camp stops answering',
            arc='cold and heavy from the start, a mournful build as refugees walk into the snow, sparse and bitter '
            'under the last words, ending on an ominous silence',
            curve=[(0, 15, .35), (15, 27, .4), (27, 39, .55), (39, 49, .3), (49, 58, .35)]),
    3: dict(dur=76, bpm=78,
            mood='lights going out in a research facility, a redacted file, a network map lighting up toward an '
            'orbital station, conspiracy and suspicion, they already knew',
            arc='dark and quiet as lights go out, a tense reveal at twenty seconds, suspenseful pulsing under '
            'narration and dialogue, ends unresolved and suspicious',
            curve=[(0, 19, .3), (19, 26, .6), (26, 40, .45), (40, 58, .35), (58, 72, .45)]),
    4: dict(dur=59, bpm=72,
            mood='a hollow victory at a spaceport at night, burned settlements and people searching for names in '
            'the ash, a city on the east coast, a private warning letter, do not answer what calls from above',
            arc='hollow and somber, mourning under narration, a brief rise for the east coast city, then quiet and '
            'mysterious under a whispered warning',
            curve=[(0, 15, .35), (15, 33, .3), (33, 40, .5), (40, 52, .3), (52, 56, .35)]),
    5: dict(dur=70, bpm=84,
            mood='an orbital station speaks to the whole planet, a red KEY-07 message, a seventy-two hour '
            'countdown, an uneasy alliance of four powers, ends tender as ECHO speaks first',
            arc='dark intro, a stark hit at seven seconds for the message, a ticking countdown pulse, tense under '
            'the alliance dialogue, ends tender and intimate',
            curve=[(0, 6, .3), (6, 11, .85), (11, 30, .5), (30, 55, .3), (55, 67, .3)]),
    6: dict(dur=55, bpm=70,
            mood='the core is empty after the final battle, a red message saying the terminal is not here, a '
            'countdown that does not stop, every channel falls silent, shock and hollow dread',
            arc='dark hollow ambience, a shocking stark hit at fourteen seconds for the reveal, a ticking '
            'countdown, then near silence and sparse dread under the dialogue',
            curve=[(0, 13, .3), (13, 19, .8), (19, 24, .5), (24, 37, .2), (37, 52, .3)]),
    7: dict(dur=49, bpm=88,
            mood='the giant ark sets sail across rivers of lava, a frantic comic merchant shouting about her '
            'ticket, a quiet resolve to send the mercenary up, the last chapter',
            arc='a huge epic hit right at the start as the ark sets sail, grand for a few seconds, then lighter '
            'restrained underscore for the dialogue, ending on hopeful rising resolve',
            curve=[(0, 6, .9), (6, 12, .6), (12, 37, .35), (37, 46, .5)]),
}
# 第 8 章的結尾（第 8 章沒有一般的章末）：最後抉擇的選後演出 x_c6_open／seal／beyond 與第 3 周目真結局的短片 e_beyond；
# 音色與調沿用第 8 章
ENDS = {
    1: dict(ch=8, dur=24, bpm=70,
            mood='the four representatives walk into the core, the station confirms authentication and executes the '
            'protocol, cold inevitable fate, the cycle begins again',
            arc='cold hushed opening, a heavy fateful build as the station speaks, peaks as a red beam of signal '
            'strikes the planet, then a hollow empty ending',
            curve=[(0, 6, .4), (6, 12, .7), (12, 17, .9), (17, 22, .4)]),
    2: dict(ch=8, dur=33, bpm=72,
            mood='the station falls in flames toward the sea of clouds, relief that it is over, the protocol '
            'forcibly executed anyway, then the sky falls silent, tragic and bittersweet',
            arc='tense opening, a big tragic hit as the station falls burning like a meteor, tender relief, a dark '
            'swell for the forced protocol, then calm and fading into a silent sky',
            curve=[(0, 6, .4), (6, 12, .9), (12, 16, .4), (16, 22, .6), (22, 30, .3)]),
    3: dict(ch=8, dur=37, bpm=84,
            mood='four voices calling out to stop you, one lets you go, thrusters igniting one after another, the '
            'planet shrinking behind, liberation and hope, flying beyond',
            arc='restrained and tense under the voices, a gentle turn at the farewell, then soaring and liberating '
            'as the thrusters ignite, ends bright and open',
            curve=[(0, 15, .35), (15, 19, .55), (19, 30, .85), (30, 34, .9)]),
    4: dict(ch=8, dur=53, bpm=66,
            mood='a duotone memory film, a confession from the station controller, tender and fragile, thanks for '
            'gathering the records, the first time the loop does not restart, quiet release',
            arc='soft solo piano and warm pads, intimate and fragile under the confession, a gentle swell as the '
            'thrusters ignite, ends in quiet release and stillness',
            curve=[(0, 17, .35), (17, 29, .55), (29, 42, .4), (42, 49, .5)]),
}
# 合唱、人聲類的音色換掉（對白時會打架）
NO_VOX = [('celestial choir', 'airy celestial synth pads'), ('full orchestra and choir', 'full orchestra'),
          ('choir', 'airy pads')]
HEAD = 'instrumental cinematic anime film score, no vocals'


# 段落的鍵：i<章>＝開場、o<章>＝章末（OUTROS）、e1～e4＝第 8 章的結尾（ENDS）；曲名 cine_<鍵>，候選 <鍵>__f<i>
SCENES = {**{f'i{k}': v for k, v in INTROS.items()}, **{f'o{k}': v for k, v in OUTROS.items()},
          **{f'e{k}': v for k, v in ENDS.items()}}


def caption(sid, pal):
    for a, b in NO_VOX:
        pal = pal.replace(a, b)
    return ', '.join([HEAD, SCENES[sid]['mood'], pal, SCENES[sid]['arc']])[:512]


def chapters(opt):
    # --ch=i1,o2（只寫數字＝開場）
    if not opt.get('ch'):
        return sorted(SCENES, key=lambda k: ('ioe'.index(k[0]), int(k[1:])))
    return [c if c[:1] in 'ioe' else 'i' + c for c in opt['ch'].split(',')]


def gen(opt):
    sys.path.insert(0, os.path.dirname(__file__))
    import importlib.util

    spec = importlib.util.spec_from_file_location('bgm_gen', os.path.join(os.path.dirname(__file__), 'bgm-gen.py'))
    G = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(G)
    os.makedirs(OUT, exist_ok=True)
    n = int(opt.get('n', 5))
    dit = lm = None
    for sid in chapters(opt):
        it = SCENES[sid]
        ch = it.get('ch', int(sid[1:]))
        key = G.bgm_songs.chapter(ch)['key']
        pal = G.C['PALETTE'][str(ch)] if str(ch) in G.C['PALETTE'] else G.C['PALETTE'][ch]
        cap = caption(sid, pal)
        for i in range(n):
            name = f'{sid}__f{i}'
            if os.path.exists(os.path.join(OUT, name + '.wav')):
                continue
            if dit is None:
                dit, lm = G.init()
            print(f'== 第 {ch} 章{ {"i": "開場", "o": "章末", "e": "結尾" + sid[1:]}[sid[0]]} 候選 {i}（{it["dur"]} 秒、{it["bpm"]} BPM、{key}）', flush=True)
            G.run(dit, lm, OUT, name, dict(ch=ch, type='cine_' + sid, cand=i, bpm=it['bpm'], key=key),
                  caption=cap, lyrics='[Instrumental]', instrumental=True, vocal_language='unknown',
                  bpm=it['bpm'], keyscale=key, timesignature='4', duration=it['dur'],
                  seed=ch * 1000 + 777 + i * 31 + 500 + {'i': 0, 'o': 300, 'e': 400 + int(sid[1:]) * 50}[sid[0]])


def tot(s):
    # 總分：美感為主；人聲（Demucs 分出來的比例）越少越好；起伏吻合的權重低（打包時會照能量曲線推拉音量）
    return (s['PQ'] + s['CE']) / 20 + 0.15 * s['fit'] - max(0.0, s['voc'] - 0.12) * 1.5


def score(opt):
    import numpy as np
    import importlib.util

    spec = importlib.util.spec_from_file_location('bgm_score', os.path.join(os.path.dirname(__file__), 'bgm-score.py'))
    src = open(spec.origin, encoding='utf8').read().replace('\nmain()\n', '\n')
    S = {'__file__': spec.origin, '__name__': 'bgm_score'}
    exec(compile(src, spec.origin, 'exec'), S)
    sp, pp = os.path.join(OUT, 'scores.json'), os.path.join(OUT, 'picks.json')
    scores = json.load(open(sp, encoding='utf8')) if os.path.exists(sp) else {}
    names = sorted(f[:-4] for f in os.listdir(OUT) if re.fullmatch(r'[ioe]\d+__f\d+\.wav', f))
    names = [n for n in names if n.split('__')[0] in chapters(opt)]
    M = None
    for n in names:
        if n in scores:
            continue
        M = M or S['Models']()
        x = S['load'](os.path.join(OUT, n + '.wav'))
        v = M.vocals(x)
        mono = x.mean(1)
        rms = float(np.sqrt(np.mean(mono**2)))
        voc = float(np.sqrt(np.mean(v.mean(1) ** 2)) / (rms + 1e-9))
        a = M.aesthetics(os.path.join(OUT, n + '.wav')) or {'PQ': 0, 'CE': 0}
        # 尾段（最後 20 秒）比前段（開頭 30 秒）大聲多少：章名卡要推上去
        sec = len(mono) // S['SR']
        db = [20 * np.log10(np.sqrt(np.mean(mono[i * S['SR']:(i + 1) * S['SR']] ** 2)) + 1e-6) for i in range(sec)]
        # 能量曲線的吻合度：每秒的響度（平滑 3 秒）和 INTROS 的 curve 的相關係數
        sid = n.split('__')[0]
        want = np.zeros(sec)
        for t0, t1, v in SCENES[sid]['curve']:
            want[t0:min(t1, sec)] = v
        m = min(sec, SCENES[sid]['curve'][-1][1])
        got = np.convolve(np.array(db[:m]), np.ones(3) / 3, mode='same')
        fit = float(np.corrcoef(got[1:m - 1], want[1:m - 1])[0, 1])
        # 總分：美感＋起伏吻合；人聲（Demucs 分出來的比例）越少越好
        total = tot(dict(PQ=a['PQ'], CE=a['CE'], voc=voc, fit=fit))
        scores[n] = dict(total=round(total, 3), PQ=a['PQ'], CE=a['CE'], voc=round(voc, 3), fit=round(fit, 3))
        print(f'{n:10s} 總分 {total:.3f}  PQ {a["PQ"]}  CE {a["CE"]}  人聲比 {voc:.2f}  起伏吻合 {fit:+.2f}', flush=True)
        json.dump(scores, open(sp, 'w', encoding='utf8', newline='\n'), ensure_ascii=False, indent=1)
    picks = json.load(open(pp, encoding='utf8')) if os.path.exists(pp) else {}
    for n, s in scores.items():
        s['total'] = round(tot(s), 3)
        sid = n.split('__')[0]
        if sid not in picks or s['total'] > scores[picks[sid]]['total']:
            picks[sid] = n
    json.dump(picks, open(pp, 'w', encoding='utf8', newline='\n'), ensure_ascii=False, indent=1)
    print('挑選：', picks)


def pack(opt):
    import numpy as np
    import importlib.util

    spec = importlib.util.spec_from_file_location('bgm_pack', os.path.join(os.path.dirname(__file__), 'bgm-ai-pack.py'))
    P = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(P)
    P.RMS = 0.11  # 和其他過場配樂差不多大聲（cine_c1～c6 約 −18～−20 dB）
    picks = json.load(open(os.path.join(OUT, 'picks.json'), encoding='utf8'))
    for sid in chapters(opt):
        n = picks.get(sid)
        if not n:
            print(f'{sid} 還沒有挑選')
            continue
        x = P.load(os.path.join(OUT, n + '.wav'))
        # 照畫面推拉音量（模型照不到秒數的起伏）：能量曲線 1＝原音量，低的段落最多降 RIDE dB，平滑 1.5 秒；
        # 對白時遊戲另外會壓低配樂（game/cine.js 的 musicDuck），所以只降一點
        RIDE = 7.0
        sec = len(x) / P.SR
        lv = np.full(int(sec * 10) + 1, SCENES[sid]['curve'][-1][2])
        for t0, t1, v in SCENES[sid]['curve']:
            lv[t0 * 10:t1 * 10] = v
        k = np.ones(15) / 15
        db = np.convolve(np.pad(-RIDE * (1 - lv / max(lv)), 7, mode='edge'), k, mode='valid')
        g = 10 ** (np.interp(np.arange(len(x)) / P.SR, np.arange(len(db)) / 10, db) / 20)
        x = x * g[:, None]
        # 尾巴 1.5 秒淡出（劇本自己也會淡出）
        nf = int(1.5 * P.SR)
        x[-nf:] *= np.linspace(1, 0, nf)[:, None]
        d = P.write(x, os.path.join(DST, f'cine_{sid}.mp3'))
        print(f'{sid}：{n} → src/assets/music/cine_{sid}.mp3（{d} 秒）', flush=True)


if __name__ == '__main__':
    opt = dict(a[2:].split('=', 1) if '=' in a else (a[2:], '1') for a in sys.argv[1:] if a.startswith('--'))
    cmd = next((a for a in sys.argv[1:] if not a.startswith('--')), '')
    {'gen': gen, 'score': score, 'pack': pack}.get(cmd, lambda o: print(__doc__))(opt)
