"""任務配樂的試聽（標題的「配樂試聽」，game/bgm-lab.js）：把候選曲剪成 60 秒的試聽片段 → src/assets/bgm-audition/

用法：python scripts/bgm-audition.py <下載的曲子資料夾>
需要 numpy 與 imageio-ffmpeg（和 scripts/bgm-prep.py 相同）。

每一首依建議的用途挑一段（e＝目標的響度：交戰／Boss 挑接近最響的一段，探索挑平均的一段），頭尾各淡入淡出 1.5 秒，
立體聲 44.1 kHz、80 kbps；index.json 記曲名、作者、授權、來源與說明（遊戲的試聽畫面讀 '@index'）。
候選只收 CC0／CC-BY（docs/audio-design.md 的素材原則；CC-BY-SA／ND／NC 不收）。
"""
import json
import os
import subprocess
import sys

import numpy as np
import imageio_ffmpeg

FF = imageio_ffmpeg.get_ffmpeg_exe()
SR = 44100
LEN = 60
FADE = 1.5

SB = ('Scott Buckley', 'CC-BY 4.0', 'https://www.scottbuckley.com.au/library/')
AN = ('Alexander Nakarada', 'CC-BY 4.0', 'https://www.serpentsoundstudios.com/')
AP = ('Alex-Productions', 'CC-BY 3.0', 'https://www.free-stock-music.com/artist.alex-productions.html')
PD = ('Punch Deck', 'CC-BY 3.0', 'https://www.free-stock-music.com/artist.punch-deck.html')
OGA = 'https://opengameart.org/content/'

# id: (檔案, 曲名, (作者, 授權, 來源), 建議用途, 說明（中文，依來源的介紹整理）, 目標響度, 個別來源網址)
# 用途：explore 探索、alert 警戒、combat 交戰、boss Boss、air 空域
CANDS = [
    # ---- Scott Buckley（混合交響：管弦＋合成器＋鼓組，品質最高的一批）----
    ('sb_simulacra', 'scott-buckley-simulacra.mp3', 'Simulacra', SB, ['combat', 'boss'],
     '混合交響動作曲：琶音合成器、電吉他悶音、節奏弦樂、混亂的銅管，作者寫明適合追逐與 Boss 戰', 0.95, ''),
    ('sb_goliath', 'scott-buckley-goliath.mp3', 'Goliath', SB, ['boss'],
     '史詩戰鬥曲：打擊感的合成器、厚重銅管、合唱、高昂弦樂，約 6 分鐘，作者寫明為 Boss 戰而寫', 1.0, ''),
    ('sb_vanguard', 'scott-buckley-vanguard.mp3', 'Vanguard', SB, ['boss', 'combat'],
     '電影預告片風格的混合交響：重低音打擊、銅管、合成器脈衝', 1.0, ''),
    ('sb_terminus', 'scott-buckley-terminus.mp3', 'Terminus', SB, ['combat', 'air'],
     '推進感的英雄動作冒險曲：完整管弦、鼓組、合成器、合唱', 0.95, ''),
    ('sb_escape', 'scott-buckley-escape-velocity.mp3', 'Escape Velocity', SB, ['alert', 'combat'],
     '高能量：大量合成器、史詩打擊與管弦，中間有懸疑段落（間諜驚悚感）', 0.75, ''),
    ('sb_aphelion', 'scott-buckley-aphelion.mp3', 'Aphelion', SB, ['boss', 'explore'],
     '電影感混合曲：慢慢堆疊到合成器＋完整管弦的史詩高潮', 0.9, ''),
    ('sb_hyperion', 'scott-buckley-hyperion.mp3', 'Hyperion', SB, ['air', 'boss'],
     '史詩、昂揚的混合交響：銅管與人聲', 0.9, ''),
    ('sb_sentinel', 'scott-buckley-sentinel.mp3', 'Sentinel', SB, ['air', 'combat'],
     '英雄冒險的混合交響：史詩人聲、大膽的銅管、翱翔的弦樂', 0.9, ''),
    ('sb_starfire', 'scott-buckley-starfire.mp3', 'Starfire', SB, ['air'],
     '充滿希望的史詩科幻管弦', 0.85, ''),
    ('sb_born', 'scott-buckley-born-of-the-sky.mp3', 'Born Of The Sky', SB, ['air'],
     '短而昂揚的英雄曲，後段加入有力的鼓與吉他', 0.9, ''),
    ('sb_chasing', 'scott-buckley-chasing-daylight.mp3', 'Chasing Daylight', SB, ['alert', 'combat'],
     '戲劇性、緊張的管弦（free-stock-music 標為 dramatic／suspenseful）', 0.8, ''),
    ('sb_eyes', 'scott-buckley-eyes-in-the-void.mp3', 'Eyes In The Void', SB, ['alert', 'explore'],
     '黑暗、混亂的管弦：帶故障感的高度懸疑，之後轉成哥德式進行曲（宇宙恐怖）', 0.6, ''),
    ('sb_signal', 'scott-buckley-signal-to-noise.mp3', 'Signal To Noise', SB, ['explore'],
     '神祕、黑暗的氛圍曲（合成器＋弦樂）', 0.5, ''),
    ('sb_longdark', 'scott-buckley-the-long-dark.mp3', 'The Long Dark', SB, ['explore'],
     '神祕、低沉的氛圍曲', 0.45, ''),
    ('sb_penumbra', 'scott-buckley-penumbra.mp3', 'Penumbra', SB, ['explore'],
     '冰冷、空曠的弦樂＋合成器氛圍曲', 0.45, ''),
    # ---- Alexander Nakarada（交響＋金屬／電子）----
    ('an_electro', 'alexander-nakarada-electrorchestra.mp3', 'Electrorchestra', AN, ['alert', 'combat'],
     '電子＋管弦：酷、黑暗、帶威脅感', 0.75, ''),
    ('an_chase', 'alexander-nakarada-chase.mp3', 'Chase', AN, ['combat'],
     '史詩追逐動作曲：緊張、有攻擊性（管弦＋鼓組）', 0.95, ''),
    ('an_hellfire', 'alexander-nakarada-hellfire.mp3', 'Hellfire', AN, ['boss'],
     '史詩金屬：重吉他、鼓組與管弦，強烈有攻擊性', 1.0, ''),
    ('an_offtowar', 'alexander-nakarada-off-to-war.mp3', 'Off To War', AN, ['combat', 'boss'],
     '史詩、激烈的戰爭曲（金屬＋管弦）', 0.95, ''),
    ('an_battle', 'alexander-nakarada-the-great-battle.mp3', 'The Great Battle', AN, ['boss'],
     '史詩戰鬥管弦：戲劇性、黑暗、有力', 1.0, ''),
    ('an_shadow', 'alexander-nakarada-shadowreign.mp3', 'Shadowreign', AN, ['boss', 'combat'],
     '旋律性的奇幻金屬：粗獷、有力', 0.95, ''),
    ('an_curiosity', 'alexander-nakarada-curiosity.mp3', 'Curiosity', AN, ['explore', 'alert'],
     '神祕、懸疑的電影感氛圍曲', 0.5, ''),
    # ---- Alex-Productions（電子＋搖滾／電影感，偏賽博龐克）----
    ('ap_cyber', 'alex-productions-epic-cyberpunk.mp3', 'Epic Cyberpunk', AP, ['combat'],
     '黑暗、有力的賽博龐克：電子節拍＋失真合成器＋電影打擊', 0.95, ''),
    ('ap_hidden', 'alex-productions-aggressive-electro-cyberpunk-midtempo-hidden.mp3', 'Hidden（Aggressive Electro Cyberpunk）', AP,
     ['alert', 'combat'], '中板、有攻擊性的電子賽博龐克（驅動感）', 0.8, ''),
    ('ap_reset', 'alex-productions-epic-cinematic-gaming-cyberpunk-reset.mp3', 'Reset（Epic Cinematic Gaming Cyberpunk）', AP,
     ['combat', 'boss'], '史詩電影感遊戲配樂：賽博龐克電子＋管弦', 0.95, ''),
    ('ap_steel', 'alex-productions-hard-as-steel.mp3', 'Hard As Steel', AP, ['combat'],
     '有力的動作搖滾：吉他、鼓組', 0.95, ''),
    ('ap_titan', 'alex-productions-titan.mp3', 'Titan', AP, ['air', 'boss'],
     '史詩、昂揚、有驅動感的電影曲', 0.9, ''),
    ('ap_enemy', 'alex-productions-enemy.mp3', 'Enemy', AP, ['alert', 'combat'],
     '史詩、戲劇性、帶黑暗感的電影曲', 0.8, ''),
    ('ap_iron', 'alex-productions-hearts-of-iron.mp3', 'Hearts Of Iron', AP, ['alert', 'boss'],
     '激烈、戲劇性的電影管弦', 0.85, ''),
    ('ap_ascend', 'alex-productions-ascend.mp3', 'Ascend', AP, ['air', 'combat'],
     '酷、有力的動作電子（帶神祕感）', 0.9, ''),
    ('ap_voyager', 'alex-productions-voyager.mp3', 'Voyager', AP, ['air'],
     '史詩、昂揚、有冒險感的電影曲', 0.85, ''),
    # ---- Punch Deck ----
    ('pd_100', 'punch-deck-100-seconds.mp3', '100 Seconds', PD, ['alert', 'combat'],
     '黑暗、帶威脅感的史詩動作電子', 0.85, ''),
    # ---- OpenGameArt（CC0 / CC-BY）----
    ('oga_metal', 'boss_battle_#2_metal_loop.wav', 'Boss Battle #2 [Symphonic Metal]', ('nene', 'CC0', OGA),
     ['boss'], '交響金屬（沒有人聲），原本就做成循環段（可以直接無縫循環）', 1.0, OGA + 'boss-battle-2-symphonic-metal'),
    ('oga_pursuit', 'oga-determined-pursuit.wav', 'Determined Pursuit（Epic Orchestra Loop）', ('Emma_MA', 'CC0', OGA),
     ['combat'], '狂亂的弦樂、堅定的法國號、忙碌的鼓，作者建議用在戰鬥或 Boss，原本就是循環', 0.95,
     OGA + 'determined-pursuit-epic-orchestra-loop'),
    ('oga_qazi', 'oga-qazijamjam.wav', 'QaziJamJam（Orchestral Battle Theme）', ('Emma_MA', 'CC0', OGA),
     ['combat', 'boss'], '4 分鐘的管弦戰鬥曲：弦樂、銅管、吉他、木管、史詩鼓，循環時旋律與配器有變化', 0.95,
     OGA + 'qazijamjam-orchestral-battle-theme'),
    ('oga_warmachine', 'oga-war-machine.mp3', 'War Machine', ('Fato_Shadow_Music', 'CC-BY 4.0', OGA),
     ['combat', 'boss'], '科幻戰爭曲（作者標了 sci-fi）', 0.95, OGA + 'war-machine-soundtrack'),
]


def load(p):
    out = subprocess.run([FF, '-v', 'quiet', '-i', p, '-ac', '2', '-ar', str(SR), '-f', 'f32le', '-'],
                         capture_output=True, check=True).stdout
    return np.frombuffer(out, dtype=np.float32).reshape(-1, 2).copy()


def pick(x, L, e):
    """挑起點（秒）：段落的平均響度最接近目標（scripts/bgm-prep.py 的作法）"""
    sec = len(x) // SR
    rms = np.array([np.sqrt(np.mean(x[i * SR:(i + 1) * SR] ** 2)) for i in range(sec)])
    lo, hi = np.percentile(rms, 10), np.percentile(rms, 95)
    tgt = lo + (hi - lo) * e
    best, bi = 1e9, 0
    need = int(L + 1)
    for s in range(min(8, max(0, sec - need)), max(1, sec - need)):
        seg = rms[s:s + int(L)]
        score = abs(seg.mean() - tgt) + max(0, lo + (hi - lo) * 0.3 * e - seg.min()) * 2
        if score < best:
            best, bi = score, s
    return bi


def main():
    src = sys.argv[1]
    out = os.path.join(os.path.dirname(__file__), '..', 'src', 'assets', 'bgm-audition')
    os.makedirs(out, exist_ok=True)
    idx = []
    credits = ['Candidate music for the in-mission BGM audition (title screen > 配樂試聽).',
               'Each file is a 60 s excerpt (1.5 s fades, normalized, 80 kbps MP3) made by scripts/bgm-audition.py.']
    for cid, f, title, (artist, lic, home), use, desc, e, url in CANDS:
        p = os.path.join(src, f)
        if not os.path.exists(p):
            print('缺少', f)
            continue
        x = load(p)
        dur = len(x) / SR
        L = min(LEN, dur - 1)
        s = pick(x, L, e)
        seg = x[s * SR:s * SR + int(L * SR)].copy()
        nf = int(FADE * SR)
        ramp = np.linspace(0, 1, nf)[:, None]
        seg[:nf] *= ramp
        seg[-nf:] *= ramp[::-1]
        seg *= 0.89 / max(1e-6, np.abs(seg).max())
        op = os.path.join(out, cid + '.mp3')
        subprocess.run([FF, '-v', 'quiet', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', '-',
                        '-c:a', 'libmp3lame', '-b:a', '80k', op], input=seg.astype(np.float32).tobytes(), check=True)
        idx.append({'id': cid, 'title': title, 'artist': artist, 'lic': lic, 'url': url or home, 'use': use,
                    'desc': desc, 'dur': round(dur), 'at': s})
        credits.append(f'{cid}.mp3 = "{title}" by {artist} - {lic} - {url or home}')
        print(f'{cid:15s} {dur / 60:4.1f} 分  從 {s // 60}:{s % 60:02d}  {os.path.getsize(op) // 1024} KB')
    with open(os.path.join(out, 'index.json'), 'w', encoding='utf8') as fp:
        json.dump(idx, fp, ensure_ascii=False, indent=1)
    with open(os.path.join(out, 'CREDITS.txt'), 'w', encoding='utf8') as fp:
        fp.write('\n'.join(credits) + '\n')


main()
