"""角色的語音：VoxCPM2（OpenBMB，Apache-2.0）以每個聲音的參考音檔克隆台詞 → src/assets/voice/<聲音>/<鍵>.mp3。

聲音與台詞：
- ECHO：gentle、ai（語音試聽選出來的溫柔知性 #2、AI 系統感 #3；參考音檔 src/assets/voice/ref/<聲音>.flac）
- 其他角色：資料夾＝說話者 id（data/voice.js 的 CAST_IDS），聲音依劇本的角色設定（下面的 CAST）
- 敵兵的喊話：grunt1～3（三個聲音唸同一組台詞 BARKS）
台詞＝scripts/voice-lines.js 收集的 src/assets/voice/lines.json（{ 說話者: { 鍵: { t 台詞, k 情境 } } }）。

流程（每個階段只載入一個模型，顯示卡 12 GB 放不下兩個）：
1. 沒有參考音檔的聲音：以 CAST 的描述（聲音設計）唸一句代表台詞，產生 4 個候選（性別都不對時再 4 個）
2. faster-whisper 轉寫＋音高（男女聲有沒有對上），挑一個存成 src/assets/voice/ref/<聲音>.flac（提交，之後重做同一個聲音）
3. 每句以參考音檔克隆 --takes 次（角色的說話方式＋情境的語氣指示）
4. faster-whisper 轉寫、和台詞比對，留最像的那一次；太不像的寫進 src/assets/voice/<聲音>/report.txt（--retry 重挑）

需要 Python 3.10～3.12、CUDA 版 PyTorch、triton-windows、
`pip install voxcpm soundfile imageio-ffmpeg opencc-python-reimplemented faster-whisper`；一定用顯示卡（沒有 CUDA 就停下）。
  node scripts/voice-lines.js                       # 先收集台詞
  python scripts/voice-gen.py                       # 全部聲音（已經有 mp3 的略過）
  python scripts/voice-gen.py --voice ai --force    # 只做一個聲音、全部重做
  python scripts/voice-gen.py --retry               # report.txt 裡的句子再產生 2 次重挑
  python scripts/voice-gen.py --voice rust --recast # 重新設計這個角色的聲音（刪掉參考音檔）並重做全部台詞
  python scripts/voice-gen.py --lang ja             # 日文語音：台詞＝src/assets/voice/lines-ja.json（鍵同 lines.json），
                                                    # 每個聲音（ECHO 也是）以日系的描述重新設計 → <聲音>_ja/、ref/<聲音>_ja.flac
之後 npm run build（建置成 dist/lib/voice-<聲音>.js）。
"""
import argparse
import difflib
import json
import os
import re
import subprocess
import sys
import tempfile
import zlib

import numpy as np
import soundfile as sf

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VDIR = os.path.join(ROOT, 'src', 'assets', 'voice')
TAKES = os.path.join(tempfile.gettempdir(), 'mech-cordon-voice-takes')
ACCENT = '帶台灣口音的國語，'
# 描述要明講性別（只寫「男性」常常產生女聲）：男＝前面加「男聲」、後面加「聲音低沉的男人」
GENDER = {'m': ('男聲，', '，聲音低沉的男人'), 'f': ('女聲，', ''), 'x': ('', '')}

# 角色：性別（m／f；x＝不檢查）、聲音設計的描述、說話方式（每句的語氣指示都加上）。依 docs/story-script.md 的角色設定
CAST = {
    'castron': ('m', '五十多歲的男性，礦工出身的公司主管，嗓音粗厚沙啞，豪爽、大嗓門', '粗聲、豪爽'),
    'aetheric': ('f', '中年女性研究員，有禮、溫柔，語調平穩理性，像在念觀察紀錄', '溫和、理性'),
    'veerwell': ('f', '年輕女性調度員，語速快、俏皮、愛開玩笑，精明幹練', '輕快、俏皮'),
    'sancta': ('f', '三十多歲的女性，前護理師，溫和但直接，聲音沉穩', '溫和、直接'),
    'mira': ('f', '年輕女性研究助理，緊張、怯生生，聲音偏輕', '緊張、小聲'),
    'station': ('x', '中性的機械合成廣播語音，平板、沒有感情，字字清楚', '平板、機械'),
    'instructor': ('m', '中年男性戰技教官，嚴厲、簡短有力，軍人口吻', '嚴厲、簡短有力'),
    'rust': ('m', '中年男性拾荒傭兵，吵鬧、粗魯、愛笑，市井口吻', '吵鬧、粗魯'),
    'sirocco': ('f', '年輕女性劍士傭兵，寡言、冷傲，聲音低而清冷', '冷淡、驕傲'),
    'prospector': ('m', '老年男性礦工，陰沉、沙啞，說話緩慢', '陰沉、緩慢'),
    'stevedore': ('m', '壯年男性碼頭工頭，粗獷、豪爽，大嗓門', '粗獷、大聲'),
    'sluice': ('m', '中年男性守備隊長，嚴肅、負責，語氣沉穩', '嚴肅、沉穩'),
    'marsh': ('m', '中年男性傭兵，陰陽怪氣、愛嘲諷，語調油滑', '嘲諷、油滑'),
    'whiteout': ('f', '年輕女性狙擊手，冷淡、平靜、話少', '冷淡、平靜'),
    'specimen': ('m', '年輕男性，情緒不穩，扭曲、嫉妒，時而低語時而激動', '不穩、扭曲'),
    'spire': ('m', '年輕男性，傲慢、愛炫耀，自信張揚', '傲慢、張揚'),
    'countdown': ('m', '男性爆破技師，亢奮、瘋狂，喜歡倒數和爆炸', '亢奮、瘋狂'),
    'undertow': ('m', '男性守衛，寡言、低沉、平靜', '低沉、平靜'),
    'zenith': ('m', '中年男性，疲憊、溫和而滄桑，像看透了一切', '疲憊、滄桑'),
    'iguazu': ('m', '年輕男性傭兵，輕佻、痞氣', '輕佻'),
    'volta': ('f', '年輕女性傭兵，輕佻、俏皮、愛挑釁', '輕佻、挑釁'),
    # 主線擴充（docs/campaign-expansion-design.md）：僚機 BASALT／WREN、第 7 章的宿敵 KILN、第 8 章的宿敵 KEEL
    'basalt': ('m', '五十歲左右的男人，老練的傭兵，嗓音低沉穩重、從容，偶爾帶點幽默', '沉穩、從容'),
    'wren': ('f', '十多歲的年輕女孩，新手傭兵，聲音清亮、緊張但努力打起精神', '緊張、認真'),
    'kiln': ('m', '四十多歲的男人，熔爐的守衛，嗓音粗啞低沉，冷硬、不多話', '冷硬、粗啞'),
    'keel': ('m', '中年男人，方舟的守衛，聲音低沉莊重、平靜，像在念誓詞', '莊重、平靜'),
    # 敵兵：「士兵」「無線電」這類字眼容易產生女聲，男聲用「大叔」「小伙子」「男低音」
    'grunt1': ('m', '四十多歲的大叔，軍人，低沉粗啞的男低音', ''),
    'grunt2': ('m', '二十多歲的年輕小伙子，有點緊張，語速快的男中音', ''),
    'grunt3': ('f', '年輕女性士兵，幹練、聲音清亮', ''),
}
ECHO = ['gentle', 'ai']
# 日文語音（--lang ja）：所有聲音都重新設計（日本動畫的聲優類型），ECHO 的兩個聲音也是
ACCENT_JA = '標準日語，日本動畫配音員的演技，'
ECHO_JA = {
    'gentle': ('f', '二十多歲的年輕女性，溫柔知性的大姊姊，聲音柔和清澈、語速從容，冷靜裡帶著體貼', '溫柔、冷靜'),
    'ai': ('f', '年輕女性，冷靜的人工智慧管制官，聲音清澈平穩、略帶機械感、感情很少、字字清楚', '冷靜、平板'),
}
# 日文版重新設計時男聲一直出不來的角色：描述再強調男聲
CAST_JA = {
    # COUNTDOWN：日文的聲音設計試了 3 種描述（24 個候選）都是 160 Hz 以上的高音，所以 ref/countdown_ja.flac 直接用
    # 中文版的參考音檔（跨語言克隆，122 Hz）；--recast 會刪掉它重新設計，不要對 countdown 用
    'countdown': ('m', '四十多歲的男人，聲音渾厚低沉的男低音，粗獷的爆破技師', '亢奮、瘋狂'),
    'spire': ('m', '二十多歲的男人，低沉的男中音，傲慢、愛炫耀的年輕男子，自信張揚', '傲慢、張揚'),
}
# 唸法（lines-ja.json 的 '@yomi'＝{ 詞: 假名 }）：短的漢字詞常被唸成中文的讀音，只在唸給 TTS 時換成假名（轉寫的比對照原文）
YOMI = []
SAMPLE_JA = {'grunt': '了解、指定位置へ移動中。隊形を維持する。', 'countdown': '今回の標的は船だ、お前じゃない。でもまあ、ついでにお前もいいぜ。'}
SUF = ''  # 資料夾的後綴（日文＝_ja）
JA = False
VOICES = ECHO + list(CAST)
# 聲音 → lines.json 的說話者
LINES_OF = {'gentle': 'echo', 'ai': 'echo', 'grunt1': 'grunt', 'grunt2': 'grunt', 'grunt3': 'grunt'}
# 設計聲音時唸的句子（敵兵沒有長句子；用平常的語氣：大喊時男聲的音高也會到 300 Hz，性別判斷不準）
SAMPLE = {'grunt': '收到，正在前往指定位置，保持隊形。'}

# 情境 → 語氣指示（產生時轉簡體）；台詞有「！」時另外加
STYLE = {
    'alarm': '急促、緊張',
    'sys': '冷靜、清楚',
    'story': '平靜',
    'private': '輕聲、溫柔、帶著感情',
    'end': '平靜、帶著感情',
    'shout': '大聲喊叫、急促',
    'low': '警戒、壓低聲音',
}
# 表情 → 語氣指示（語音 v2：docs/cine-redesign-design.md，2026-11-12 使用者定案照表情的語氣）。表情是 lines.json 的 e
# （voice-lines.js 以 data/line-expr.js 的 lineExpr 標上；平常 neutral 沒有 e、不加）；角色的招牌表情也在這裡
EXPR_STYLE = {
    'smile': '帶著笑意、輕鬆',
    'laugh': '放聲大笑著說',
    'angry': '憤怒、咬牙切齒',
    'surprised': '吃驚、急促、提高音量',
    'sad': '沉重、低聲、說得很慢',
    'think': '思考中、慢慢說、停頓',
    'smug': '得意、帶點不屑',
    'scorn': '不屑、冷笑',
    'guilt': '心虛、低聲、斷斷續續、不敢直說',
    'scheme': '壓低聲音、得意、帶著算計的笑',
    'intrigued': '感興趣、語調上揚、著迷',
    'clinical': '冷靜、平板、像在念觀察紀錄',
    'wink': '俏皮、輕快',
    'cold': '冰冷、沒有感情、語速放慢',
    'wary': '戒備、不信任、語氣冷淡',
    'mourn': '哀傷、低聲、說得很慢',
    'nervous': '緊張、聲音發抖、小聲',
    'panic': '慌張、急促、聲音發抖',
    'wry': '淡淡的乾笑、冷幽默',
    'glitch': '斷斷續續、平板',
    'focus': '專注、簡潔、冷靜',
    'tender': '溫柔、輕聲、帶著感情',
    'hesitate': '猶豫、欲言又止、說得很慢',
    'puzzled': '困惑、語調上揚',
    'shout': '大聲喝令',
    'approve': '平靜、帶一點認可',
    'easy': '從容、悠閒',
    'weary': '疲倦、嘆氣',
    'resolve': '堅定、有力',
}

# 全大寫的英文字照字母唸（AP、AC…）；4 個字母以上的是名字（ECHO、OXIDE、SIROCCO…），改成一般的大小寫讓它照單字唸
SPELL = {'COAM', 'EMP', 'ACS', 'QB'}
WORDS = {'KEY': 'Key'}

CC = None


def fold(v):
    return v + SUF


def to_simp(s):
    global CC
    if CC is None:
        import opencc
        CC = opencc.OpenCC('t2s')
    return CC.convert(s)


def say(text):
    if JA:
        # 日文：不轉簡體（會改掉漢字）；停頓與被遮蔽的字換成「、」
        for a, b in YOMI:
            text = text.replace(a, b)
        s = text.replace('……', '、').replace('――', '、').replace('──', '、')
        return re.sub('█+', '、', s)
    s = text.replace('……', '，').replace('──', '，').replace('——', '，')
    s = s.replace('R-07', 'R零七')
    s = re.sub('█+', '，', s)  # 軌道站被遮蔽的字：停頓
    s = re.sub(r'[A-Z]{4,}', lambda m: m.group(0) if m.group(0) in SPELL else m.group(0).capitalize(), s)
    s = re.sub(r'\b[A-Z]{3}\b', lambda m: WORDS.get(m.group(0), m.group(0)), s)
    return to_simp(s)


def style_of(v, line):
    parts = []
    if v in CAST and CAST[v][2]:
        parts.append(CAST[v][2])
    st = STYLE.get(line['k'], '')
    if st:
        parts.append(st)
    # 機械語音與敵兵不加表情的語氣
    ex = EXPR_STYLE.get(line.get('e', ''), '') if v != 'station' and not v.startswith('grunt') else ''
    if ex:
        parts.append(ex)
    if '！' in line['t'] and line['k'] not in ('alarm', 'private', 'shout'):
        parts.append('語氣有力')
    return '、'.join(parts)


def seed(n):
    import random
    import torch
    random.seed(n)
    np.random.seed(n)
    torch.manual_seed(n)
    torch.cuda.manual_seed_all(n)


def trim(w, sr, th=0.012, pad=0.08):
    a = np.abs(w)
    idx = np.where(a > th * max(a.max(), 1e-6))[0]
    if not len(idx):
        return w
    return w[max(0, idx[0] - int(pad * sr)):min(len(w), idx[-1] + int(pad * 1.5 * sr))]


def robot(w, sr):
    """軌道站的機械語音：環形調變＋短的金屬共鳴"""
    t = np.arange(len(w)) / sr
    y = w * (0.72 + 0.28 * np.sin(2 * np.pi * 55 * t))
    d = int(0.007 * sr)
    out = y.copy()
    for i in range(d, len(out)):
        out[i] += 0.45 * out[i - d]
    return out


def write_mp3(w, sr, path, post=None):
    import imageio_ffmpeg
    if post == 'robot':
        w = robot(w, sr)
    # 響度一致：RMS 對齊 −20 dBFS，峰值不超過 −1 dB
    rms = np.sqrt(np.mean(w ** 2)) + 1e-9
    w = w * min(0.1 / rms, 0.89 / max(np.abs(w).max(), 1e-6))
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f:
        tmp = f.name
    sf.write(tmp, w, sr)
    subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), '-y', '-loglevel', 'error', '-i', tmp, '-ac', '1',
                    '-ar', '24000', '-b:a', '40k', path], check=True)
    os.unlink(tmp)


def f0_median(w, sr):
    """音高的中位數（Hz，自相關；有聲的音框）"""
    n = int(0.04 * sr)
    hop = int(0.02 * sr)
    lo, hi = int(sr / 400), int(sr / 70)
    f = []
    for i in range(0, len(w) - n, hop):
        x = w[i:i + n] - np.mean(w[i:i + n])
        if np.sqrt(np.mean(x ** 2)) < 0.02 * (np.abs(w).max() + 1e-9):
            continue
        ac = np.correlate(x, x, 'full')[n - 1:]
        if ac[0] <= 0:
            continue
        k = lo + int(np.argmax(ac[lo:hi]))
        if ac[k] / ac[0] > 0.4:
            f.append(sr / k)
    return float(np.median(f)) if f else 0.0


def sample_line(lines, sp):
    """設計聲音時唸的代表台詞：長度最接近 26 字、沒有英文的那一句"""
    smp = SAMPLE_JA if JA else SAMPLE
    if sp in smp:
        return smp[sp]
    cand = [l['t'] for l in lines[sp].values() if not re.search('[A-Za-z]', l['t'])] or [l['t'] for l in lines[sp].values()]
    n = 34 if JA else 26  # 日文同樣長度的句子字數比較多
    return min(cand, key=lambda t: (abs(len(t) - n), t))


def load_vox():
    import torch
    from voxcpm import VoxCPM
    if not torch.cuda.is_available():
        sys.exit('沒有 CUDA：要裝 CUDA 版的 PyTorch（pip install torch --index-url https://download.pytorch.org/whl/cu124）')
    torch.set_float32_matmul_precision('high')
    model = VoxCPM.from_pretrained('openbmb/VoxCPM2', load_denoiser=False, device='cuda')
    print('裝置', torch.cuda.get_device_name(0), flush=True)
    return model


def load_asr():
    import torch
    os.add_dll_directory(os.path.join(os.path.dirname(torch.__file__), 'lib'))
    from faster_whisper import WhisperModel
    return WhisperModel('large-v3', device='cuda', compute_type='float16')


def free(m):
    import gc
    import torch
    del m
    gc.collect()
    torch.cuda.empty_cache()


def norm(s):
    if JA:
        # 日文：只比假名＋漢字（片假名統一成平假名：轉寫有時把外來語寫成平假名）
        s = re.sub(r'[^\u3041-\u3096\u30a1-\u30fa\u30fc\u4e00-\u9fff]', '', s)
        return ''.join(chr(ord(c) - 0x60) if '\u30a1' <= c <= '\u30f6' else c for c in s)
    return re.sub(r'[^一-鿿]', '', to_simp(s))  # 只比中文字（英文名字、數字的寫法不算）


def asr_score(asr, w, sr, text):
    w16 = np.interp(np.arange(0, len(w), sr / 16000), np.arange(len(w)), w).astype(np.float32)
    segs, _ = asr.transcribe(w16, language='ja' if JA else 'zh', beam_size=5)
    got = ''.join(s.text for s in segs)
    r = difflib.SequenceMatcher(None, norm(text), norm(got)).ratio()
    # 長度不合理（每秒少於 1.5 或多於 9 個字）的扣分
    cps = len(norm(text)) / max(len(w) / sr, 0.1)
    if cps < 1.5 or cps > (15 if JA else 9):
        r -= 0.3
    return r, got


def design(lines, need):
    """沒有參考音檔的聲音：聲音設計 3 個候選 → 挑一個存成 ref/<聲音>.flac"""
    if not need:
        return
    os.makedirs(os.path.join(VDIR, 'ref'), exist_ok=True)
    tmp = os.path.join(TAKES, '_design')
    os.makedirs(tmp, exist_ok=True)
    model = load_vox()
    sr = model.tts_model.sample_rate

    def ok_gender(g, w):
        f0 = f0_median(w, sr)
        return not ((g == 'm' and f0 > 150) or (g == 'f' and 0 < f0 < 175)), f0

    nc = {}
    for v in need:
        g, desc, _ = CAST[v]
        pre, post = GENDER[g]
        text = sample_line(lines, LINES_OF.get(v, v))
        prompt = to_simp(pre + (ACCENT_JA if JA else ACCENT) + desc + post)
        n = 0
        for rnd in range(2):
            good = 0
            for c in range(n, n + 4):
                seed(77 + c * 131 + (zlib.crc32(v.encode()) & 0xfff))
                w = trim(np.asarray(model.generate(text=f'({prompt}){say(text)}', cfg_value=2.0,
                                                    inference_timesteps=10), dtype=np.float32), sr)
                sf.write(os.path.join(tmp, f'{fold(v)}-{c}.wav'), w, sr)
                good += ok_gender(g, w)[0]
            n += 4
            if good:
                break
        nc[v] = n
        print('設計', v, text, flush=True)
    free(model)
    asr = load_asr()
    for v in need:
        g = CAST[v][0]
        text = sample_line(lines, LINES_OF.get(v, v))
        best = None
        for c in range(nc[v]):
            w, sr = sf.read(os.path.join(tmp, f'{fold(v)}-{c}.wav'), dtype='float32')
            r, got = asr_score(asr, w, sr, text)
            good, f0 = ok_gender(g, w)
            # 性別不對（男聲的音高在 150 Hz 以下、女聲在 175 Hz 以上；邊緣的常常聽起來是中性）的大幅扣分
            if not good:
                r -= 0.6
            print(f'  {v}#{c} 相似度 {r:.2f} 音高 {f0:.0f} Hz　{got}', flush=True)
            if not best or r > best[0]:
                best = (r, w, sr)
        sf.write(os.path.join(VDIR, 'ref', fold(v) + '.flac'), best[1], best[2])
    free(asr)


def generate(lines, todo, takes):
    """每句以參考音檔克隆 takes 次，存成暫存的 wav"""
    import time
    model = load_vox()
    sr = model.tts_model.sample_rate
    n = sum(len(v) for v in todo.values()) * len(takes)
    i = 0
    t_all = time.time()
    for v, keys in todo.items():
        ref = os.path.join(VDIR, 'ref', fold(v) + '.flac')
        L0 = lines[LINES_OF.get(v, v)]
        os.makedirs(os.path.join(TAKES, fold(v)), exist_ok=True)
        for k in keys:
            st = style_of(v, L0[k])
            text = (f'({to_simp(st)})' if st else '') + say(L0[k]['t'])
            for tk in takes:
                out = os.path.join(TAKES, fold(v), f'{k}-{tk}.wav')
                i += 1
                if os.path.exists(out):
                    continue
                seed(1000 + tk * 7919 + (zlib.crc32(k.encode()) & 0xffff))
                w = model.generate(text=text, reference_wav_path=ref, cfg_value=2.0, inference_timesteps=10)
                sf.write(out, trim(np.asarray(w, dtype=np.float32), sr), sr)
                if i % 20 == 0:
                    print(f'{i}/{n}　{(time.time() - t_all) / 60:.1f} 分鐘', flush=True)
    free(model)


def pick(lines, todo, force):
    """faster-whisper 轉寫，留最像的那一次 → mp3；太不像的寫進 report.txt"""
    asr = load_asr()
    for v, keys in todo.items():
        L0 = lines[LINES_OF.get(v, v)]
        rep = []
        for k in keys:
            best = None
            for tk in range(1, 9):
                f = os.path.join(TAKES, fold(v), f'{k}-{tk}.wav')
                if not os.path.exists(f):
                    continue
                w, sr = sf.read(f, dtype='float32')
                if w.ndim > 1:
                    w = w.mean(axis=1)
                r, got = asr_score(asr, w, sr, L0[k]['t'])
                # 音高偏離角色的性別（克隆後激動的句子會往上飄）：男聲高於 200 Hz（大喊 260）、女聲低於 150 Hz 的扣分
                g = CAST[v][0] if v in CAST else 'x'
                if g != 'x':
                    f0 = f0_median(w, sr)
                    hi = 260 if L0[k]['k'] in ('shout', 'alarm') or '！' in L0[k]['t'] else 200
                    if (g == 'm' and f0 > hi) or (g == 'f' and 0 < f0 < 150):
                        r -= 0.25
                if not best or r > best[0]:
                    best = (r, w, sr, got)
            if not best:
                continue
            write_mp3(best[1], best[2], os.path.join(VDIR, fold(v), k + '.mp3'), 'robot' if v == 'station' else None)
            if best[0] < 0.75:
                rep.append(f'{k}\t{best[0]:.2f}\t{L0[k]["t"]}\t{best[3]}')
        rp = os.path.join(VDIR, fold(v), 'report.txt')
        old = []
        if not force and os.path.exists(rp):
            done = set(keys)
            old = [l for l in open(rp, encoding='utf-8').read().splitlines()
                   if l.split('\t')[0] not in done and l.split('\t')[0] in L0]
        with open(rp, 'w', encoding='utf-8', newline='\n') as f:
            f.write('\n'.join(old + rep) + ('\n' if old or rep else ''))
        print(v, '完成', len(keys), '句，相似度低的', len(rep), '句', flush=True)
    free(asr)


def credits(v):
    who = {'gentle': 'ECHO（溫柔知性）', 'ai': 'ECHO（AI 系統感）'}.get(v, v) + ('（日文）' if JA else '')
    with open(os.path.join(VDIR, fold(v), 'CREDITS.txt'), 'w', encoding='utf-8', newline='\n') as f:
        f.write(f'{who} 的語音：VoxCPM2（OpenBMB，https://github.com/OpenBMB/VoxCPM，Apache-2.0）以 '
                f'src/assets/voice/ref/{fold(v)}.flac 克隆，scripts/voice-gen.py 產生。AI 合成語音，不是任何配音員的聲音。\n')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--voice', default=','.join(VOICES))
    ap.add_argument('--takes', type=int, default=2)
    ap.add_argument('--force', action='store_true', help='已經有 mp3 的也重做')
    ap.add_argument('--recast', action='store_true', help='重新設計聲音（刪掉參考音檔，ECHO 除外）並重做全部台詞')
    ap.add_argument('--retry', action='store_true', help='report.txt 裡的句子再多產生 2 次重挑')
    ap.add_argument('--only', default='', help='只做這些鍵（逗號分隔）')
    ap.add_argument('--more', action='store_true', help='每句再多產生 2 次（第 takes+1、+2 次），和原本的一起重挑')
    ap.add_argument('--lang', default='zh', choices=['zh', 'ja'], help='ja＝日文語音（lines-ja.json，資料夾 <聲音>_ja）')
    a = ap.parse_args()
    lines = json.load(open(os.path.join(VDIR, 'lines.json'), encoding='utf-8'))
    if a.lang == 'ja':
        global JA, SUF
        JA, SUF = True, '_ja'
        CAST.update(ECHO_JA)
        CAST.update(CAST_JA)
        # 日文的台詞（鍵同 lines.json，情境照中文的）；還沒翻譯的句子不產生
        ja = json.load(open(os.path.join(VDIR, 'lines-ja.json'), encoding='utf-8'))
        YOMI.extend(sorted(ja.get('@yomi', {}).items(), key=lambda x: -len(x[0])))
        miss = 0
        for sp, L in lines.items():
            for k in list(L):
                t = ja.get(sp, {}).get(k)
                if t:
                    L[k] = {**L[k], 't': t}
                else:
                    del L[k]
                    miss += 1
        if miss:
            print(f'lines-ja.json 少了 {miss} 句的翻譯（略過；先補翻譯）', flush=True)
    voices = [v for v in a.voice.split(',') if v in VOICES]
    if a.recast:
        a.force = True
        for v in voices:
            p = os.path.join(VDIR, 'ref', fold(v) + '.flac')
            if v in CAST and os.path.exists(p):
                os.unlink(p)
    need = [v for v in voices if not os.path.exists(os.path.join(VDIR, 'ref', fold(v) + '.flac'))]
    bad = [v for v in need if v not in CAST]
    if bad:
        sys.exit(f'沒有參考音檔：{bad}')
    design(lines, need)
    todo = {}
    takes = list(range(1, a.takes + 1))
    for v in voices:
        L0 = lines.get(LINES_OF.get(v, v), {})
        os.makedirs(os.path.join(VDIR, fold(v)), exist_ok=True)
        if a.retry:
            rp = os.path.join(VDIR, fold(v), 'report.txt')
            keys = [l.split('\t')[0] for l in open(rp, encoding='utf-8').read().splitlines()] if os.path.exists(rp) else []
        elif a.only:
            keys = a.only.split(',')
        elif a.more:
            keys = list(L0)
        else:
            keys = [k for k in L0 if a.force or not os.path.exists(os.path.join(VDIR, fold(v), k + '.mp3'))]
        todo[v] = [k for k in keys if k in L0]
        if a.force:
            for k in todo[v]:
                for tk in range(1, 9):
                    f = os.path.join(TAKES, fold(v), f'{k}-{tk}.wav')
                    if os.path.exists(f):
                        os.unlink(f)
        # 拿掉台詞已經不在的語音檔
        for f in os.listdir(os.path.join(VDIR, fold(v))):
            if f.endswith('.mp3') and f[:-4] not in L0:
                os.unlink(os.path.join(VDIR, fold(v), f))
        credits(v)
    if a.retry or a.more:
        takes = [a.takes + 1, a.takes + 2]
    todo = {v: k for v, k in todo.items() if k}
    if not todo:
        print('沒有要產生的句子')
        return
    print({v: len(k) for v, k in todo.items()}, '句，每句', len(takes), '次', flush=True)
    generate(lines, todo, takes)
    pick(lines, todo, a.force)


if __name__ == '__main__':
    sys.exit(main())
