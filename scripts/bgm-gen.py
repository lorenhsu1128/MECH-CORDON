"""任務配樂的 AI 產生（本地 ACE-Step 1.5）：每章每種區段類型一首日文歌 → tools/acestep/out/c<章>/

用法：npm run bgm:setup（每台電腦一次：固定版本的 ACE-Step 與模型裝到 gitignore 的 tools/acestep/），
  npm run bgm:gen -- --ch=1 [--stage=fight|calm] [--songs=theme,battle] [--n=2]
  --stage=fight（預設）：每首用文字產生 n 個交戰版的候選 <類型>__f<i>.wav；刪掉的候選留下 <名稱>.dropped，
    之後跳過它、往後補一個新的編號（新的種子；同一個種子會產生一樣的歌）。--i0=<k>：候選從第 k 個開始
  --stage=calm：輕快版 <類型>__calm.wav（程式裡沿用 calm）：同樣的歌詞、速度、調，用 common.json 的 CALM（輕快的編曲、
    清楚唱歌詞）直接產生（不 cover 交戰版：cover 出來的音質很差）。--calmtry=<k> 換種子重做
  --prep 只下載模型。測試用：--tag=名稱（檔名加後綴）、--kana（歌詞換成全平假名）、--voice=girl|diva|duet、
  --ref=<音檔>（音色參考）。顯示卡的記憶體不夠時設 BGM_DIT=acestep-v15-turbo、BGM_LM=acestep-5Hz-lm-0.6B。
歌曲的設定在 scripts/bgm_songs/（common.json 的聲線、編曲、音色；c<章>.json 的歌名、調、歌詞），
標題的「配樂產生器」（伺服器的 /api/bgm）也是編輯這些檔案、呼叫這支程式。
已經有的檔案略過，所以中斷後重跑接著做。docs/audio-design.md 的「AI 配樂」。
"""
import json
import os
import sys
import time

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
ACE = os.path.join(ROOT, 'tools', 'acestep')
OUT = os.path.join(ACE, 'out')
os.environ.setdefault('ACESTEP_CHECKPOINTS_DIR', os.path.join(ACE, 'checkpoints'))
sys.path.insert(0, os.path.join(ACE, 'src'))
sys.path.insert(0, os.path.dirname(__file__))

import bgm_songs  # noqa: E402

C = bgm_songs.common()

DIT = os.environ.get('BGM_DIT', 'acestep-v15-sft')
LM = os.environ.get('BGM_LM', 'acestep-5Hz-lm-1.7B')
# 用不到的模型移回主記憶體（ACE-Step 的 gpu_config 對 16 GB 以下的顯示卡預設開）：不開時 12 GB 的卡擠不下、
# 溢出到共用記憶體，每首慢一倍（2026-11-14 RTX 4070：120 秒的歌 110 → 240 秒）。只搬位置，結果不變。BGM_OFFLOAD=0/1 強制
OFFLOAD = os.environ.get('BGM_OFFLOAD')
DUR = {'theme': 150}  # 其他 120 秒
# 輕快版（程式裡沿用 calm）的 cover 強度：0＝不 cover，直接用文字（common.json 的 CALM＋歌詞）產生。
# 2026-11-14 以前用交戰版 cover 0.4 出「平時版」（安靜、哼唱），使用者聽了像壞掉的檔案、人聲糊在一起：
# audiobox 的 CE 從交戰版的 7.5 掉到 3.5～4.7、Whisper 聽寫出幻覺；cover 0.55／0.7 一樣壞，不 cover 時 CE 7.5～7.8
COVER_CALM = 0


def prep():
    """下載需要的模型（已經有的略過），回傳 checkpoints 資料夾"""
    from acestep.model_downloader import (
        ensure_main_model,
        ensure_dit_model,
        ensure_lm_model,
        check_main_model_exists,
        check_model_exists,
        get_checkpoints_dir,
    )

    ck = get_checkpoints_dir()
    if not check_main_model_exists(ck):
        print('下載主模型…', ensure_main_model(ck)[1], flush=True)
    if not check_model_exists(DIT, ck):
        print('下載', DIT, ensure_dit_model(DIT, ck)[1], flush=True)
    if not check_model_exists(LM, ck):
        print('下載', LM, ensure_lm_model(LM, checkpoints_dir=ck)[1], flush=True)
    return ck


def init():
    from acestep.handler import AceStepHandler
    from acestep.llm_inference import LLMHandler

    import torch

    ck = prep()
    off = OFFLOAD == '1' if OFFLOAD in ('0', '1') else torch.cuda.get_device_properties(0).total_memory < 16 * 1024**3
    print('模型移回主記憶體：', off, flush=True)
    dit = AceStepHandler()
    msg, ok = dit.initialize_service(project_root=os.path.join(ACE, 'src'), config_path=DIT, device='cuda',
                                     offload_to_cpu=off)
    print('DiT：', ok, msg[:200], flush=True)
    lm = LLMHandler()
    msg, ok = lm.initialize(checkpoint_dir=str(ck), lm_model_path=LM, backend='pt', device='cuda', offload_to_cpu=off)
    print('LM：', ok, msg[:200], flush=True)
    return dit, lm


def run(dit, lm, out, name, meta, **kw):
    """產生一首，存成 <out>/<name>.wav 與 .json；已經有的略過"""
    from acestep.inference import GenerationParams, GenerationConfig, generate_music

    wav = os.path.join(out, name + '.wav')
    if os.path.exists(wav):
        return wav
    if os.path.exists(os.path.join(out, name + '.dropped')):
        return None  # 低分刪掉的候選：同一個種子會產生一樣的歌，不重做（重做用新的編號 --i0）
    seed = kw.pop('seed')
    sft = 'turbo' not in DIT
    p = GenerationParams(
        inference_steps=50 if sft else 8,
        guidance_scale=7.0,
        shift=1.0 if sft else 3.0,
        seed=seed,
        **kw,
    )
    cfg = GenerationConfig(batch_size=1, use_random_seed=False, seeds=[seed], audio_format='wav')
    t = time.time()
    tmp = os.path.join(OUT, '_tmp')
    os.makedirs(tmp, exist_ok=True)
    r = generate_music(dit, lm, p, cfg, save_dir=tmp)
    if not r.success or not r.audios:
        print('  失敗', name, r.error, flush=True)
        return None
    os.replace(r.audios[0]['path'], wav)
    m = dict(meta, seed=seed, sec=round(time.time() - t), caption=kw.get('caption', ''), lyrics=kw.get('lyrics', ''))
    with open(os.path.join(out, name + '.json'), 'w', encoding='utf8', newline='\n') as fp:
        json.dump(m, fp, ensure_ascii=False, indent=1)
    print(f'  {name}  {m["sec"]} 秒', flush=True)
    return wav


def to_kana(text):
    """歌詞的漢字換成平假名（段落標記照舊；測試日文發音用）"""
    import pykakasi

    kk = pykakasi.kakasi()
    out = []
    for line in text.split('\n'):
        if line.startswith('['):
            out.append(line)
        else:
            out.append(''.join(x['hira'] for x in kk.convert(line)))
    return '\n'.join(out)


def song_spec(ch, mod, typ):
    """一首歌的產生參數：描述（編曲＋章的音色＋聲線＋共同曲風）、速度、調、歌詞"""
    s = mod['songs'][typ]
    voice = s.get('voice') or C['VOICE_OF'][typ]
    return dict(
        title=s['title'],
        zh=s['zh'],
        voice=voice,
        bpm=int(s.get('bpm') or C['BPM_OF'][typ]),
        key=s.get('key') or mod['key'],
        arr=s.get('arr') or C['ARR'][typ],
        lyrics=s['lyrics'],
        dur=s.get('dur', DUR.get(typ, 120)),
    )


def caption_of(sp, ch, calm=False):
    parts = [(calm if isinstance(calm, str) else C['CALM']) if calm else sp['arr'], C['PALETTE'][ch], C['VOICE'][sp['voice']],
             C['BASE']]
    return ', '.join(parts)[:512]


def main():
    opt = dict(a[2:].split('=', 1) if '=' in a else (a[2:], '1') for a in sys.argv[1:] if a.startswith('--'))
    if 'prep' in opt:
        prep()
        return
    ch = int(opt['ch'])
    stage = opt.get('stage', 'fight')
    n = int(opt.get('n', 2))
    tag = ('_' + opt['tag']) if opt.get('tag') else ''
    mod = bgm_songs.chapter(ch)
    want = opt['songs'].split(',') if opt.get('songs') else list(mod['songs'])
    out = os.path.join(OUT, f'c{ch}')
    os.makedirs(out, exist_ok=True)
    picks = {}
    if stage == 'calm':
        with open(os.path.join(out, 'picks.json'), encoding='utf8') as fp:
            picks = json.load(fp)
    dit, lm = init()
    for typ in want:
        sp = song_spec(ch, mod, typ)
        if opt.get('voice'):
            sp['voice'] = opt['voice']
        lyr = to_kana(sp['lyrics']) if 'kana' in opt else sp['lyrics']
        common = dict(
            lyrics=lyr,
            bpm=sp['bpm'],
            keyscale=sp['key'],
            timesignature='4',
            vocal_language='ja',
            duration=sp['dur'],
        )
        meta = dict(ch=ch, type=typ, title=sp['title'], zh=sp['zh'], voice=sp['voice'], bpm=sp['bpm'], key=sp['key'])
        print(f'== 第 {ch} 章 {typ} {sp["title"]}（{sp["voice"]}）', flush=True)
        if stage == 'fight':
            # 補給只有一個版本：直接用平靜的編曲產生
            # 每首補到 n 個候選（--i0 起算）：刪掉的候選（<名稱>.dropped，低分重做或配樂產生器的「刪除」）跳過、
            # 往後換下一個編號＝新的種子，同一個種子會產生一樣的歌
            i, k, i0 = int(opt.get('i0', 0)), 0, int(opt.get('i0', 0))
            while k < n - i0:
                name = f'{typ}__f{i}{tag}'
                if os.path.exists(os.path.join(out, name + '.dropped')):
                    i += 1
                    continue
                kw = dict(caption=caption_of(sp, ch), seed=ch * 100000 + hash_typ(typ) * 100 + i * 7, **common)
                if opt.get('ref'):
                    kw['reference_audio'] = opt['ref']
                run(dit, lm, out, name, dict(meta, ver='fight', cand=i), **kw)
                i += 1
                k += 1
        elif stage == 'calm':
            src = picks.get(typ)
            if not src or typ in ('supply', 'boss', 'theme'):
                continue  # 補給本身就是平靜的編曲、Boss 與主題歌只有一個版本
            # --cover=<強度>（0＝不 cover，直接用文字產生）、--calmcap=<描述>（取代 common.json 的 CALM）、--tag、
            # --calmtry=<k>（換種子重做：分數太低的輕快版）
            cov = float(opt.get('cover', COVER_CALM))
            cap = caption_of(sp, ch, calm=opt.get('calmcap') or True)
            kw = dict(task_type='cover', src_audio=os.path.join(out, src + '.wav'), audio_cover_strength=cov) if cov else {}
            run(dit, lm, out, f'{typ}__calm{tag}', dict(meta, ver='calm', src=src, cover=cov),
                caption=cap, seed=ch * 100000 + hash_typ(typ) * 100 + 99 + int(opt.get('calmtry', 0)) * 13, **kw, **common)


def hash_typ(t):
    return sum(ord(c) * (i + 1) for i, c in enumerate(t)) % 997


if __name__ == '__main__':  # scripts/cine-intro-music.py 會引用這裡的 init／run
    main()
