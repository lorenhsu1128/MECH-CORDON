"""語音 v3：每個角色一個聲音＋一個 LoRA（docs/voice-casting.md）。同一個角色的聲音不再隨句子飄。

選角在 scripts/voice_cast.json（參考絕區零、超時空要塞F 的角色類型寫的聲音設計），中文與日文共用同一個聲音。
步驟（每個聲音依序；做過的步驟略過，--force 重做）：
  design  照選角的描述設計參考音（用日文的句子，日本動畫配音的質感）→ src/assets/voice/ref/v3/<聲音>.flac
  data    用參考音克隆角色自己的台詞（中文＋日文各約 50 句、含各種情緒，句子不夠時補通用句），每句 3 次，
          聲紋最像參考音（WavLM 說話者向量）而且唸對的留下 → tools/voxcpm/data/<聲音>/（目標 8 分鐘以上）
  train   VoxCPM 的 LoRA 微調（tools/voxcpm/src 的 train_voxcpm_finetune.py，r 32）→ tools/voxcpm/lora/<聲音>/
  eval    同一組句子有／沒有 LoRA 各產生一次，比聲紋相似度（平均、最低）→ tools/voxcpm/lora/<聲音>/eval.json
之後 python scripts/voice-gen.py --v3 [--lang ja] 用新聲音＋LoRA 產生全部台詞（挑 take 時同時看聲紋）。

  python scripts/voice-lora.py --voice=castron [--steps=design,data,train,eval] [--force]
要語音的 conda 環境（rubicon-voice）、TORCHINDUCTOR_USE_STATIC_CUDA_LAUNCHER=0。
"""
import argparse
import importlib.util
import json
import os
import random
import re
import subprocess
import sys
import time
import zlib

import numpy as np
import soundfile as sf

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
spec = importlib.util.spec_from_file_location('vg', os.path.join(ROOT, 'scripts', 'voice-gen.py'))
vg = importlib.util.module_from_spec(spec)
spec.loader.exec_module(vg)

VDIR = vg.VDIR
CAST3 = {k: v for k, v in json.load(open(os.path.join(ROOT, 'scripts', 'voice_cast.json'), encoding='utf-8')).items()
         if not k.startswith('_')}
REF3 = os.path.join(VDIR, 'ref', 'v3')
VX = os.path.join(ROOT, 'tools', 'voxcpm')
DATA = os.path.join(VX, 'data')
LORA = os.path.join(VX, 'lora')
LORA_R = 32
MAX_CLIP = 11.5
STABLE = False  # --stable：聲音設計時也看克隆穩定度
SIM_FLOOR = 0.85

# 台詞很少的聲音補的通用句（各種情緒；中文／日文）
GENERIC = [
    ('收到，馬上過去。', '了解、すぐ向かう。', ''),
    ('這裡交給我，你先走。', 'ここは任せろ、先に行け。', 'resolve'),
    ('哈，就這點本事嗎？', 'はっ、その程度か？', 'smug'),
    ('等一下……這不對勁。', '待て……何かおかしい。', 'think'),
    ('快躲開！上面有東西！', '避けろ！上に何かいる！', 'surprised'),
    ('我不會原諒你的。', 'お前を絶対に許さない。', 'angry'),
    ('沒關係，慢慢來就好。', '大丈夫、ゆっくりでいい。', 'tender'),
    ('真是的，又是這種工作。', 'まったく、またこんな仕事か。', 'weary'),
    ('你以為我會就這樣放手嗎？', '俺がこのまま手を引くと思うか？', 'scorn'),
    ('那天的事，我一直記得。', 'あの日のことは、ずっと覚えている。', 'sad'),
    ('好，開始吧。照計畫來。', 'よし、始めるぞ。計画通りに。', 'focus'),
    ('哈哈哈！這下有意思了！', 'はははっ！面白くなってきた！', 'laugh'),
    ('別擋路，不然我連你一起打。', '邪魔するな、さもないとお前ごと撃つ。', 'cold'),
    ('……對不起。我做不到。', '……ごめん。できない。', 'guilt'),
    ('這裡的風景，其實還不錯。', 'ここの景色、案外悪くないな。', 'smile'),
    ('目標確認，距離八百。', '目標確認、距離八百。', ''),
    ('你到底是誰？', 'お前は一体、何者だ？', 'puzzled'),
    ('撐住！援軍馬上就到！', '持ちこたえろ！援軍はすぐ来る！', 'shout'),
    ('我早就知道會變成這樣。', 'こうなることは、最初からわかっていた。', ''),
    ('下次見面，就是敵人了。', '次に会う時は、敵同士だ。', 'cold'),
    # 台詞少的角色（宿敵、敵兵、僚機）資料不到 4 分鐘時 LoRA 反而變差（巴索、芮恩、OXIDE），所以通用句多一些、長一些
    ('這片荒野我跑了十年，哪裡有坑、哪裡有雷，我閉著眼睛都知道。', 'この荒野を十年走ってきた。どこに穴があって、どこに地雷があるか、目をつぶってもわかる。', 'smug'),
    ('補給線被切斷了，剩下的彈藥最多再撐十分鐘。', '補給線が切られた。残りの弾薬じゃ、もって十分だ。', 'focus'),
    ('你知道嗎，我一開始也只是為了錢才接這種工作的。', '知ってるか。俺も最初は、金のためだけにこんな仕事を始めたんだ。', 'wry'),
    ('別看了，那邊已經沒有活人了。往前走吧。', '見るな、あっちにはもう誰もいない。前に進め。', 'sad'),
    ('左邊兩台、右邊一台，我數到三就一起衝。', '左に二機、右に一機。三つ数えたら一斉に突っ込む。', 'focus'),
    ('哎呀，這不是老朋友嗎？還活著啊，真是命大。', 'おやおや、昔馴染みじゃないか。まだ生きてたのか、しぶといな。', 'smile'),
    ('我說過了，不要再靠近這裡。這是最後一次警告。', '言ったはずだ、ここには近づくなと。これが最後の警告だ。', 'cold'),
    ('就算整座城市都沉進海裡，我也會守住這條線。', 'この街が丸ごと海に沈んでも、俺はこの線を守る。', 'resolve'),
    ('引擎溫度太高了，再這樣下去會爆的！', 'エンジンの温度が高すぎる！このままじゃ爆発するぞ！', 'panic'),
    ('呵，你的機體還真是破破爛爛的。修理費很貴吧？', 'ふっ、ずいぶんボロボロな機体だな。修理代、高くつくだろう？', 'scorn'),
    ('那個人……最後一句話是什麼，我到現在都想不起來。', 'あの人の……最後の言葉が何だったか、今でも思い出せない。', 'mourn'),
    ('喂，聽得到嗎？訊號斷斷續續的，再說一次。', 'おい、聞こえるか？通信が途切れ途切れだ、もう一度言ってくれ。', 'puzzled'),
    ('好啦好啦，我知道了，不用一直重複。', 'はいはい、わかったって。何度も言わなくていい。', 'weary'),
    ('這一發，是替我的部下打的。', 'この一発は、俺の部下の分だ。', 'angry'),
    ('天快亮了。撐過今晚，我們就能回家。', 'もうすぐ夜が明ける。今夜を乗り切れば、家に帰れる。', 'tender'),
    ('數據不會說謊。你的動作，已經被我看穿了。', 'データは嘘をつかない。お前の動きは、もう見切った。', 'clinical'),
    ('我不是來跟你講道理的，我是來拿回屬於我的東西。', '理屈を言いに来たんじゃない。俺のものを取り返しに来たんだ。', 'resolve'),
    ('前方發現敵方部隊，數量不明，請求指示。', '前方に敵部隊を発見、数は不明。指示を求む。', ''),
    ('真是的……你每次都這樣亂來，我的心臟受不了。', 'まったく……毎回こんな無茶をされたら、心臓がもたないよ。', 'smile'),
    ('等等，那個訊號……難道是他？不可能，他早就死了。', '待て、あの信号……まさか、あいつか？ありえない、とっくに死んだはずだ。', 'surprised'),
    ('我們不是英雄，只是剛好還活著的人而已。', '俺たちは英雄じゃない。たまたままだ生きてるだけの人間だ。', 'wry'),
    ('想從這裡過去？先打倒我再說。', 'ここを通りたいなら、まず俺を倒してからにしろ。', 'smug'),
    ('第三小隊，跟上！不要脫隊！', '第三小隊、続け！列を乱すな！', 'shout'),
    ('……這樣就好。你走吧，別回頭。', '……これでいい。行け、振り返るな。', 'sad'),
    ('有趣，真有趣。再讓我多看一點你的本事吧。', '面白い、実に面白い。もっとお前の力を見せてくれ。', 'intrigued'),
    ('別緊張，深呼吸。照訓練時那樣做就好。', '落ち着け、深呼吸だ。訓練通りにやればいい。', 'tender'),
    ('你搶走的不只是我的工作，還有我的一切。', 'お前が奪ったのは仕事だけじゃない。俺のすべてだ。', 'angry'),
    ('雷達上什麼都沒有……可是我總覺得有人在看著我們。', 'レーダーには何も映ってない……なのに、誰かに見られてる気がする。', 'wary'),
    ('哈！看到沒？這就是我的實力！', 'はっ！見たか？これが俺の実力だ！', 'laugh'),
    ('任務完成。回收地點在東邊兩公里。', '任務完了。回収地点は東に二キロ。', ''),
    ('我欠你一次。下次換我掩護你。', '借りができたな。次は俺が援護する。', 'smile'),
    ('風太大了，瞄準會偏。再靠近一點。', '風が強すぎる、照準がずれる。もう少し近づくぞ。', 'focus'),
    ('如果當時我早一點趕到，他們就不會死了。', 'あの時もう少し早く着いていれば、あいつらは死なずに済んだんだ。', 'guilt'),
    ('嗯……這個報價，我得再考慮一下。', 'うーん……この見積もり、もう少し考えさせてくれ。', 'think'),
    ('全部給我閉嘴！聽我的命令行動！', '全員黙れ！俺の命令に従って動け！', 'shout'),
    ('你走的這條路，我也走過。前面什麼都沒有。', 'お前が歩いてる道は、俺も通った。その先には何もない。', 'weary'),
    ('看好了，這才叫做真正的機甲駕駛。', 'よく見ておけ。これが本物の操縦ってやつだ。', 'smug'),
    ('對不起，讓你久等了。我們回去吧。', '待たせてごめん。帰ろうか。', 'tender'),
    ('砲擊來了！所有人找掩護！', '砲撃が来るぞ！全員、遮蔽物に隠れろ！', 'panic'),
    ('真可惜。如果是別的時候遇見你，說不定能當朋友。', '残念だな。別の時に出会っていたら、友達になれたかもしれないのに。', 'hesitate'),
]
GENERIC_N = 60  # 每種語言湊到幾句（台詞少的用通用句補）


def wav_len(p):
    return sf.info(p).duration


# ---------- 聲紋（WavLM 說話者向量）----------
_SV = None


def sv_emb(w, sr):
    global _SV
    import torch
    import librosa
    from transformers import AutoFeatureExtractor, WavLMForXVector
    if _SV is None:
        fe = AutoFeatureExtractor.from_pretrained('microsoft/wavlm-base-plus-sv')
        m = WavLMForXVector.from_pretrained('microsoft/wavlm-base-plus-sv').cuda().eval()
        _SV = (fe, m)
    fe, m = _SV
    if sr != 16000:
        w = librosa.resample(w.astype(np.float32), orig_sr=sr, target_sr=16000)
    if len(w) < 8000:
        # 短於 0.5 秒（剪掉靜音後幾乎是空的）：WavLM 的卷積算不了，當成完全不像（相似度 0）
        return np.zeros(512, dtype=np.float32)
    x = fe(w, sampling_rate=16000, return_tensors='pt').to('cuda')
    with torch.no_grad():
        e = m(**x).embeddings
    return torch.nn.functional.normalize(e, dim=-1)[0].cpu().numpy()


def ref_emb(v):
    w, sr = sf.read(os.path.join(REF3, v + '.flac'), dtype='float32')
    return sv_emb(w, sr)


# ---------- 文字（照 voice-gen.py：中文轉簡體、日文換唸法；語氣指示在括號裡）----------
def set_lang(ja):
    vg.JA = ja
    vg.SUF = '_ja' if ja else ''


def style3(v, line):
    """每句的語氣：選角的說話方式＋情境＋表情（同 voice-gen.py 的 style_of，但說話方式用 v3 的）"""
    parts = []
    c = CAST3[v]
    if c.get('style'):
        parts.append(c['style'])
    st = vg.STYLE.get(line.get('k', ''), '')
    if st:
        parts.append(st)
    ex = vg.EXPR_STYLE.get(line.get('e', ''), '') if v != 'station' else ''
    if ex:
        parts.append(ex)
    if '！' in line['t'] and line.get('k') not in ('alarm', 'private', 'shout'):
        parts.append('語氣有力')
    return '、'.join(parts)


def gen_text(v, line):
    st = style3(v, line)
    return (f'({vg.to_simp(st)})' if st else '') + vg.say(line['t'])


def load_lines():
    lines = json.load(open(os.path.join(VDIR, 'lines.json'), encoding='utf-8'))
    ja = json.load(open(os.path.join(VDIR, 'lines-ja.json'), encoding='utf-8'))
    vg.YOMI.clear()
    vg.YOMI.extend(sorted(ja.get('@yomi', {}).items(), key=lambda x: -len(x[0])))
    return lines, ja


# ---------- design ----------
def step_design(model, asr, v, lines, ja):
    os.makedirs(REF3, exist_ok=True)
    out = os.path.join(REF3, v + '.flac')
    c = CAST3[v]
    sp = vg.LINES_OF.get(v, v)
    # 日文的代表句（長度最接近 34 字）；沒有日文台詞的用通用句
    set_lang(True)
    cand = [t for t in ja.get(sp, {}).values() if isinstance(t, str) and not re.search('[A-Za-z]', t)]
    text = min(cand, key=lambda t: (abs(len(t) - 34), t)) if cand else '了解、指定位置へ移動中。隊形を維持する。'
    pre, post = vg.GENDER[c['g']]
    prompt = vg.to_simp(pre + c['desc'] + post)
    sr = model.tts_model.sample_rate
    best = None
    for k in range(18):
        # 6 個一輪；性別對的已經有了就停，否則再多試（最多 3 輪）
        if k and k % 6 == 0 and best and best[2]:
            break
        vg.seed(91 + k * 131 + (zlib.crc32(v.encode()) & 0xfff))
        w = vg.trim(np.asarray(model.generate(text=f'({prompt}){vg.say(text)}', cfg_value=2.0, inference_timesteps=10),
                               dtype=np.float32), sr)
        r, got = vg.asr_score(asr, w, sr, text)
        f0 = vg.f0_median(w, sr)
        bad = (c['g'] == 'm' and f0 > 150) or (c['g'] == 'f' and 0 < f0 < 175)
        if bad:
            r -= 0.6
        stab = ''
        if STABLE and not bad and r > 0.7:
            # 克隆穩定度（--stable）：用這個候選當參考音克隆 2 句（中、日各 1），聲紋和候選本身的平均相似度。
            # 芮恩的參考音克隆出來就會飄，LoRA 學到的是「平均」而偏成另一個人，所以挑克隆得穩的
            tmp = os.path.join(REF3, f'_{v}_cand.wav')
            sf.write(tmp, w, sr)
            ce = sv_emb(w, sr)
            ss = []
            for i, (zt, jt, _) in enumerate(GENERIC[:2]):
                set_lang(i == 1)
                vg.seed(7 + i * 977 + k)
                cw = vg.trim(np.asarray(model.generate(text=vg.say(jt if i == 1 else zt), reference_wav_path=tmp,
                                                       cfg_value=2.0, inference_timesteps=10), dtype=np.float32), sr)
                ss.append(float(np.dot(ce, sv_emb(cw, sr))))
            set_lang(True)
            os.unlink(tmp)
            r += 2.0 * (float(np.mean(ss)) - 0.9)
            stab = f' 克隆穩定 {np.mean(ss):.3f}'
        print(f'  設計 {v}#{k} 唸對 {r:.2f} 音高 {f0:.0f} Hz{stab}', flush=True)
        if not best or r > best[0]:
            best = (r, w, not bad)
    sf.write(out, best[1], sr)
    print(f'{v} 參考音 → {out}（{len(best[1]) / sr:.1f} 秒）', flush=True)


# ---------- data ----------
def pick_lines(v, lines, ja, n=GENERIC_N):
    """角色自己的台詞挑 n 句（中文、日文各自）：長度 6～40 字、情緒盡量分散；不夠的補通用句"""
    sp = vg.LINES_OF.get(v, v)
    L = lines.get(sp, {})
    rnd = random.Random(zlib.crc32(v.encode()))
    keys = [k for k in L if 6 <= len(L[k]['t']) <= 40 and not re.search('[A-Za-z]{2,}', L[k]['t'])]
    rnd.shuffle(keys)
    # 情緒分散：每種表情輪流拿
    by = {}
    for k in keys:
        by.setdefault(L[k].get('e', ''), []).append(k)
    order = []
    while len(order) < n and any(by.values()):
        for e in list(by):
            if by[e]:
                order.append(by[e].pop())
    zh = [(f'zh_{k}', dict(L[k])) for k in order[:n]]
    jl = []
    for k in order:
        t = ja.get(sp, {}).get(k)
        if t and len(jl) < n:
            jl.append((f'ja_{k}', {**L[k], 't': t}))
    # 通用句補足
    for i, (a, b, e) in enumerate(GENERIC):
        if len(zh) < n:
            zh.append((f'zh_g{i}', {'t': a, 'k': 'comm', **({'e': e} if e else {})}))
        if len(jl) < n:
            jl.append((f'ja_g{i}', {'t': b, 'k': 'comm', **({'e': e} if e else {})}))
    return zh, jl


def step_data(model, asr, v, lines, ja, takes=3, use_lora=False):
    d = os.path.join(DATA, v)
    os.makedirs(d, exist_ok=True)
    zh, jl = pick_lines(v, lines, ja)
    ref = os.path.join(REF3, v + '.flac')
    re_ = ref_emb(v)
    sr = model.tts_model.sample_rate
    man = []
    total = 0.0
    sims = []
    for lang, items in (('zh', zh), ('ja', jl)):
        set_lang(lang == 'ja')
        for key, line in items:
            text = gen_text(v, line)
            best = None
            for tk in range(takes):
                vg.seed(500 + tk * 7919 + (zlib.crc32(key.encode()) & 0xffff))
                w = vg.trim(np.asarray(model.generate(text=text, reference_wav_path=ref, cfg_value=2.0,
                                                      inference_timesteps=10), dtype=np.float32), sr)
                r, _ = vg.asr_score(asr, w, sr, line['t'])
                s = float(np.dot(re_, sv_emb(w, sr)))
                score = r + 1.5 * s
                if r >= 0.8 and (not best or score > best[0]):
                    best = (score, w, s, r)
            if not best:
                continue
            f = os.path.join(d, key + '.wav')
            sf.write(f, best[1], sr)
            man.append({'audio': f.replace('\\', '/'), 'text': text, 'sim': round(best[2], 4), 'asr': round(best[3], 3)})
            sims.append(best[2])
            total += len(best[1]) / sr
        print(f'  {v} {lang} 完成：累計 {len(man)} 句、{total / 60:.1f} 分鐘', flush=True)
    # 聲紋最不像的 20% 不要、低於 SIM_FLOOR 的也不要（訓練資料只留最一致的：不一致的資料讓 LoRA 學成另一個聲音）
    cut = max(np.quantile(sims, 0.2), SIM_FLOOR) if sims else 0
    keep = [m for m in man if m['sim'] >= cut]
    with open(os.path.join(d, 'train.jsonl'), 'w', encoding='utf-8', newline='\n') as f:
        for m in keep:
            f.write(json.dumps({'audio': m['audio'], 'text': m['text']}, ensure_ascii=False) + '\n')
    mins = sum(wav_len(m['audio']) for m in keep) / 60
    json.dump({'n': len(keep), 'minutes': round(mins, 2), 'sim_mean': round(float(np.mean([m['sim'] for m in keep])), 4),
               'sim_cut': round(float(cut), 4)}, open(os.path.join(d, 'stats.json'), 'w', encoding='utf-8'), indent=1)
    print(f'{v} 訓練資料：{len(keep)} 句、{mins:.1f} 分鐘（聲紋平均 {np.mean([m["sim"] for m in keep]):.3f}）', flush=True)


# ---------- train ----------
def model_dir():
    from huggingface_hub import snapshot_download
    return snapshot_download('openbmb/VoxCPM2')


def step_train(v, iters):
    d = os.path.join(DATA, v)
    out = os.path.join(LORA, v)
    os.makedirs(out, exist_ok=True)
    cfg = os.path.join(out, 'train.yaml')
    # 超過 MAX_CLIP 秒的句子不拿來訓練：一批 4 句時長句會讓顯示卡記憶體溢出（32 GB 的卡，派克的 12.8 秒那句慢了 2.5 倍）
    import soundfile as sf
    man = os.path.join(d, 'train-cap.jsonl')
    rows = [l for l in open(os.path.join(d, 'train.jsonl'), encoding='utf-8') if l.strip()]
    keep = [l for l in rows if sf.info(json.loads(l)['audio']).duration <= MAX_CLIP]
    with open(man, 'w', encoding='utf-8', newline='\n') as f:
        f.writelines(keep)
    if len(keep) < len(rows):
        print(f'  {v} 訓練略過 {len(rows) - len(keep)} 句超過 {MAX_CLIP} 秒的', flush=True)
    yaml = f"""pretrained_path: {model_dir().replace(chr(92), '/')}
train_manifest: {man.replace(chr(92), '/')}
val_manifest: ""
sample_rate: 16000
out_sample_rate: 48000
batch_size: 4
grad_accum_steps: 4
num_workers: 0
num_iters: {iters}
log_interval: 20
valid_interval: 100000
save_interval: {iters}
learning_rate: 0.0001
weight_decay: 0.01
warmup_steps: 50
max_steps: {iters}
max_batch_tokens: 8192
max_grad_norm: 1.0
save_path: {os.path.join(out, 'ckpt').replace(chr(92), '/')}
tensorboard: {os.path.join(out, 'tb').replace(chr(92), '/')}
lambdas:
  loss/diff: 1.0
  loss/stop: 1.0
lora:
  enable_lm: true
  enable_dit: true
  enable_proj: false
  r: {LORA_R}
  alpha: {LORA_R}
  dropout: 0.0
"""
    open(cfg, 'w', encoding='utf-8', newline='\n').write(yaml)
    t0 = time.time()
    env = {**os.environ, 'PYTHONIOENCODING': 'utf-8', 'PYTHONUTF8': '1'}
    log = open(os.path.join(out, 'train.log'), 'w', encoding='utf-8')
    r = subprocess.run([sys.executable, os.path.join(VX, 'src', 'scripts', 'train_voxcpm_finetune.py'), '--config_path', cfg],
                       cwd=os.path.join(VX, 'src'), env=env, stdout=log, stderr=subprocess.STDOUT)
    log.close()
    if r.returncode != 0:
        sys.exit(f'{v} 訓練失敗（看 {os.path.join(out, "train.log")}）')
    print(f'{v} LoRA 訓練完成（{(time.time() - t0) / 60:.1f} 分鐘）', flush=True)


def lora_path(v):
    """訓練完的 LoRA：ckpt 底下最新的那一個（有 lora_weights 的資料夾）"""
    base = os.path.join(LORA, v, 'ckpt')
    if not os.path.isdir(base):
        return None
    cands = []
    for root, _, files in os.walk(base):
        if any(f.startswith('lora_weights') for f in files):
            cands.append(root)
    return max(cands, key=os.path.getmtime) if cands else None


def load_model():
    import torch
    from voxcpm import VoxCPM
    from voxcpm.model.voxcpm2 import LoRAConfig
    torch.set_float32_matmul_precision('high')
    return VoxCPM.from_pretrained('openbmb/VoxCPM2', load_denoiser=False, device='cuda',
                                  lora_config=LoRAConfig(enable_lm=True, enable_dit=True, enable_proj=False,
                                                         r=LORA_R, alpha=LORA_R))


# ---------- eval ----------
def step_eval(model, asr, v, lines, ja):
    zh, jl = pick_lines(v, lines, ja, n=8)
    ref = os.path.join(REF3, v + '.flac')
    re_ = ref_emb(v)
    sr = model.tts_model.sample_rate
    res = {}
    for mode in ('base', 'lora'):
        if mode == 'lora':
            p = lora_path(v)
            if not p:
                # 不寫 eval.json：排程以它判斷這個角色完成了沒有
                sys.exit(f'{v} 沒有 LoRA（訓練沒有完成），不寫比較結果')
            model.tts_model.load_lora_weights(p)
            model.tts_model.set_lora_enabled(True)
        else:
            model.tts_model.set_lora_enabled(False)
        sims, asrs = [], []
        for lang, items in (('zh', zh[-4:]), ('ja', jl[-4:])):
            set_lang(lang == 'ja')
            for key, line in items:
                for tk in range(2):
                    vg.seed(9000 + tk * 31 + (zlib.crc32(key.encode()) & 0xffff))
                    w = vg.trim(np.asarray(model.generate(text=gen_text(v, line), reference_wav_path=ref, cfg_value=2.0,
                                                          inference_timesteps=10), dtype=np.float32), sr)
                    sims.append(float(np.dot(re_, sv_emb(w, sr))))
                    asrs.append(vg.asr_score(asr, w, sr, line['t'])[0])
        res[mode] = {'sim_mean': round(float(np.mean(sims)), 4), 'sim_min': round(float(np.min(sims)), 4),
                     'asr_mean': round(float(np.mean(asrs)), 3)}
        print(f'  {v} {mode}：聲紋平均 {res[mode]["sim_mean"]}、最低 {res[mode]["sim_min"]}、唸對 {res[mode]["asr_mean"]}',
              flush=True)
    model.tts_model.set_lora_enabled(False)
    os.makedirs(os.path.join(LORA, v), exist_ok=True)
    json.dump(res, open(os.path.join(LORA, v, 'eval.json'), 'w', encoding='utf-8'), indent=1)


def release():
    import gc
    import torch
    global _SV
    _SV = None
    gc.collect()
    torch.cuda.empty_cache()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--voice', required=True, help='逗號分隔；all＝全部')
    ap.add_argument('--steps', default='design,data,train,eval')
    ap.add_argument('--iters', type=int, default=600)
    ap.add_argument('--force', action='store_true')
    ap.add_argument('--stable', action='store_true', help='聲音設計時另外量每個候選的克隆穩定度（比較慢）')
    a = ap.parse_args()
    global STABLE
    STABLE = a.stable
    voices = list(CAST3) if a.voice == 'all' else a.voice.split(',')
    steps = a.steps.split(',')
    lines, ja = load_lines()
    for v in voices:
        if v not in CAST3:
            sys.exit('選角表沒有：' + v)
        t0 = time.time()
        print(f'===== {v} =====', flush=True)
        need_model = [s for s in steps if s in ('design', 'data', 'eval')]
        need_design = 'design' in steps and (a.force or not os.path.exists(os.path.join(REF3, v + '.flac')))
        need_data = 'data' in steps and (a.force or not os.path.exists(os.path.join(DATA, v, 'train.jsonl')))
        need_train = 'train' in steps and (a.force or not lora_path(v))
        need_eval = 'eval' in steps and (a.force or not os.path.exists(os.path.join(LORA, v, 'eval.json')))
        if need_model and (need_design or need_data):
            model = load_model()
            asr = vg.load_asr()
            if need_design:
                step_design(model, asr, v, lines, ja)
            if need_data:
                step_data(model, asr, v, lines, ja)
            del model, asr
            release()
        if need_train:
            step_train(v, a.iters)
        if need_eval:
            model = load_model()
            asr = vg.load_asr()
            step_eval(model, asr, v, lines, ja)
            del model, asr
            release()
        print(f'{v} 完成（{(time.time() - t0) / 60:.1f} 分鐘）', flush=True)


if __name__ == '__main__':
    sys.exit(main())
