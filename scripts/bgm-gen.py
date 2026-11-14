"""任務配樂的 AI 產生（本地 ACE-Step 1.5）：絕區零 × 尼爾 自動人形的融合曲風 → tools/acestep/out/

用法：npm run bgm:setup（每台電腦一次：固定版本的 ACE-Step 與模型裝到 gitignore 的 tools/acestep/），
  npm run bgm:gen -- [主題,…] [--n=每個主題的交戰版數] [--only=t2m|cover]
（＝用 ACE-Step 的環境跑這個檔案，再跑 scripts/bgm-ai-pack.py 轉成試聽片段放進 src/assets/bgm-audition/，
標題的「配樂試聽」聽）。--prep 只下載模型。顯示卡的記憶體不夠時設 BGM_DIT=acestep-v15-turbo、BGM_LM=acestep-5Hz-lm-0.6B。

做法：每個主題先以文字產生「交戰」版（text2music，n 個種子），再以它為來源（cover：保留旋律與結構、換編制）
做出同一主題的探索／警戒／Boss 版，讓動態配樂換強度時聽起來是同一首曲子在升溫；另外每一級也直接用文字產生一首，
和 cover 的版本比較。融合配方見 docs/audio-design.md 的「AI 配樂」：
尼爾的憂傷旋律、鋼琴與弦樂、懸掛和弦、自創語言的空靈女聲 × 絕區零的碎拍、Drum & Bass、放克 bass、都市夜晚的律動。
歌詞是自己編的「無意義語言」音節（不抄任何既有的歌詞）。
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

DIT = os.environ.get('BGM_DIT', 'acestep-v15-sft')
LM = os.environ.get('BGM_LM', 'acestep-5Hz-lm-1.7B')
DUR = 120

STYLE = (
    'melancholic ethereal female vocals singing in an invented language, felt piano and lush string ensemble '
    'with suspended chords, urban neon night, nostalgic and sorrowful yet driving, cinematic video game soundtrack'
)

# 每一級的編制（交戰是主版本；其他三級由交戰版 cover 或直接產生）
LEVELS = {
    'combat': 'liquid drum and bass, fast chopped amen breakbeats, deep rolling sub bass and funky slap bass, '
    'layered choir, energetic battle music, ' + STYLE,
    'explore': 'ambient downtempo, soft felt piano, warm analog synth pads, gentle airy wordless female humming, '
    'sparse soft lo-fi percussion, no heavy drums, quiet and spacious, melancholic exploration music, video game soundtrack',
    'alert': 'tense trip-hop, dusty lo-fi hip-hop breakbeat with crisp hi-hats and rimshots, funky bass groove, '
    'pulsing synth arpeggio, piano motif, chopped ethereal female vocal fragments, suspenseful, video game tension music',
    'boss': 'epic dark drum and bass, distorted reese bass, aggressive amen breaks, huge choir, orchestral strings and '
    'brass stabs, soaring female vocals in an invented language, intense climactic final boss battle music, '
    'video game soundtrack',
}
# cover 的強度：越小越自由（探索要拿掉鼓，所以放比較鬆）
COVER_K = {'explore': 0.35, 'alert': 0.5, 'boss': 0.6}

THEMES = [
    {
        'id': 'ash',
        'title': '灰燼的祈禱',
        'bpm': 172,
        'key': 'D minor',
        'lyrics': """[Intro - piano and pads]

[Verse - ethereal female vocal]
Ora venna, siel ka mirae
Tolu esse, nae rin soleia
Kaelu vi, anne fa lorae
Eshe tera, mio vel sae

[Pre-Chorus]
Lu ra, lu ra, en tiel mare

[Chorus - soaring choir]
Vae lumina, ost ka reni
Sora teia, fen dal eri
Vae lumina, ost ka reni
Ahh, ahh, nae soleia

[Instrumental Break - breakbeat drop]

[Bridge - whispered]
Nemi, nemi, sal ora
Kae ven, kae ven, tiel ora

[Chorus - soaring choir]
Vae lumina, ost ka reni
Sora teia, fen dal eri

[Outro - piano]""",
    },
    {
        'id': 'echo',
        'title': '殘響的街',
        'bpm': 140,
        'key': 'A minor',
        'lyrics': """[Intro - vinyl crackle and strings]

[Verse - breathy female vocal]
Mirei sa, onna fei ruma
Ketsu ra, vel ennai tora
Siro e, lan ka mieru
Hana sei, ost en ruma

[Chorus - layered vocals]
Ae ri ya, sorae no lumi
Ae ri ya, fen ka tomi
Ae ri ya, sorae no lumi
Ohh, ohh, ennai tora

[Instrumental Break - breakbeat and slap bass]

[Bridge - vocal chops]
Ri ya, ri ya, ri ya, sa

[Chorus - layered vocals]
Ae ri ya, sorae no lumi
Ae ri ya, fen ka tomi

[Outro - strings fade]""",
    },
    {
        'id': 'iron',
        'title': '鐵與雨',
        'bpm': 128,
        'key': 'F# minor',
        'lyrics': """[Intro - rain and pads]

[Verse - distant female vocal]
Delu ma, sei ora fenne
Vasha ri, tol en kaelle
Iru sa, mennai lo vae
Kesse ra, ost en kaelle

[Chorus - choir and lead vocal]
Lo vaelin, sora ke tesse
Lo vaelin, fen dal resse
Lo vaelin, sora ke tesse
Ahh, ahh, en kaelle

[Instrumental Break - heavy breaks and bass]

[Bridge - solo vocal]
Tesse, tesse, vae lo ra

[Chorus - choir and lead vocal]
Lo vaelin, sora ke tesse
Lo vaelin, fen dal resse

[Outro]""",
    },
]


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

    ck = prep()
    dit = AceStepHandler()
    msg, ok = dit.initialize_service(project_root=os.path.join(ACE, 'src'), config_path=DIT, device='cuda')
    print('DiT：', ok, msg[:200], flush=True)
    lm = LLMHandler()
    msg, ok = lm.initialize(checkpoint_dir=str(ck), lm_model_path=LM, backend='pt', device='cuda')
    print('LM：', ok, msg[:200], flush=True)
    return dit, lm


def run(dit, lm, name, meta, **kw):
    """產生一首，存成 out/<name>.wav 與 .json；已經有的略過"""
    from acestep.inference import GenerationParams, GenerationConfig, generate_music

    wav = os.path.join(OUT, name + '.wav')
    if os.path.exists(wav):
        return wav
    seed = kw.pop('seed')
    sft = 'turbo' not in DIT
    p = GenerationParams(
        duration=DUR,
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
    m = dict(meta, seed=seed, sec=round(time.time() - t), caption=kw.get('caption', ''))
    lmmeta = (r.extra_outputs or {}).get('lm_metadata')
    if isinstance(lmmeta, dict):
        m['lm'] = {k: v for k, v in lmmeta.items() if isinstance(v, (str, int, float))}
    with open(os.path.join(OUT, name + '.json'), 'w', encoding='utf8') as fp:
        json.dump(m, fp, ensure_ascii=False, indent=1)
    print(f'  {name}  {m["sec"]} 秒', flush=True)
    return wav


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    opt = dict(a[2:].split('=', 1) for a in sys.argv[1:] if a.startswith('--') and '=' in a)
    n = int(opt.get('n', 2))
    only = opt.get('only')
    pick = set(args[0].split(',')) if args else None
    os.makedirs(OUT, exist_ok=True)
    if '--prep' in sys.argv:
        prep()
        return
    dit, lm = init()
    for T in THEMES:
        if pick and T['id'] not in pick:
            continue
        print(f'== {T["id"]} {T["title"]}', flush=True)
        base = dict(theme=T['id'], title=T['title'], bpm=T['bpm'], key=T['key'])
        common = dict(lyrics=T['lyrics'], bpm=T['bpm'], keyscale=T['key'], timesignature='4', vocal_language='unknown')
        # 1. 交戰版（主版本）
        srcs = []
        for i in range(n):
            w = run(dit, lm, f'{T["id"]}_combat_{i}', dict(base, level='combat', via='t2m'),
                    caption=LEVELS['combat'], seed=1000 + i * 37, **common)
            if w:
                srcs.append((i, w))
        # 2. 同一主題的其他三級：cover 交戰版
        if only != 't2m':
            for i, w in srcs:
                for lv, k in COVER_K.items():
                    run(dit, lm, f'{T["id"]}_{lv}_c{i}', dict(base, level=lv, via='cover', src=i, k=k),
                        task_type='cover', src_audio=w, audio_cover_strength=k, caption=LEVELS[lv],
                        seed=2000 + i, **common)
        # 3. 每一級直接用文字產生一首（比較用）
        if only != 'cover':
            for lv in ('explore', 'alert', 'boss'):
                run(dit, lm, f'{T["id"]}_{lv}_t', dict(base, level=lv, via='t2m'),
                    caption=LEVELS[lv], seed=3000, **common)


main()
