"""AI 配樂的共用設定（scripts/bgm-gen.py 讀）：聲線、各類型的編曲、各章的音色。docs/audio-design.md 的「AI 配樂」。

曲風：絕區零（碎拍、Drum & Bass、放克 bass、都市夜晚）× 尼爾 自動人形（憂傷的鋼琴與弦樂、懸掛和弦、空靈人聲），
人聲是日文的空靈女聲，兩種聲線：歌姬型（有力、中低音帶點沙啞、能爆發的搖滾天后）與少女型（清亮、甜、高音、透明感）。
參考動漫歌曲的寫法（不模仿任何既有的旋律、歌手或錄音）：主歌 → 導歌 → 副歌、王道進行（IV–V–iii–vi）的苦甜感、
最後一次副歌前升調、副歌的記憶點重複兩次；人聲的混音乾淨、在前面。
歌詞是自己寫的日文，主歌每句句尾押同一個韻、副歌兩兩押韻；劇情上這些歌是 ECHO 從軌道站往地面送的「訊號」
（第 1 章的「荒野的訊號」是一首歌），所以各章的歌詞照劇情一章接一章。
"""

# 共同的曲風（每首都加）
BASE = (
    'Japanese anime song, J-pop royal road progression, bittersweet melancholic yet uplifting, '
    'sorrowful piano and strings fused with breakbeat groove, ethereal reverb, upfront vocal'
)

VOICE = {
    'girl': 'bright clear high-pitched young female vocal, sweet airy translucent tone, innocent yet ethereal, '
    'Japanese lyrics',
    'diva': 'powerful mature female alto rock diva vocal, low husky chest voice, strong belting, '
    'passionate and confident, Japanese lyrics',
    'duet': 'female duet, a powerful husky rock diva and a bright high sweet girl trading lines, Japanese lyrics',
}

# 各類型的編曲（交戰版）。calm＝平時版（由交戰版 cover：同一首、同速度，編制變輕、人聲變哼唱）
ARR = {
    'theme': 'full anime opening theme song, piano intro, soaring chorus, strings, breakbeat drums and bass',
    'battle': 'high-energy liquid drum and bass anime battle song, chopped amen breaks, rolling sub bass, slap bass',
    'front': 'epic marching battle anthem, big war drums, choir, strings ostinato over breakbeat, heroic',
    'elite': 'intense rock anime battle song, distorted electric guitar riffs, fast breakbeat drums, rival duel tension',
    'destroy': 'heavy half-time anime battle track, huge bass drops, metallic percussion, explosive impacts',
    'colossus': 'massive epic hybrid orchestral track, slow giant pulse, heavy bass, choir, taiko drums, colossal scale',
    'defend': 'determined mid-tempo breakbeat anthem, hopeful strings, warm protective feeling, steady drums',
    'escort': 'driving steady groove, road journey feeling, funky bass line, hopeful piano riff, light breakbeat',
    'extract': 'urgent countdown tension, ticking hi-hats, rising synth arpeggios, desperate yet hopeful, fast drums',
    'breakthrough': 'relentless fast neurofunk drum and bass, adrenaline rush, short chopped vocal hooks',
    'chase': 'frantic high speed chase, racing breakbeat, funk guitar cutting, rushing synth bass, vocal hooks',
    'intel': 'stealthy trip-hop, dusty slow breakbeat, mysterious rhodes piano, whispered breathy vocal, tension',
    'supply': 'calm lo-fi hip-hop, warm felt piano, soft vinyl texture, gentle humming vocal, rest and nostalgia',
    'boss': 'climactic boss battle anime song, hybrid orchestral electronic, choir, distorted bass, fast drum and bass',
    'air': 'soaring sky battle anime song, fast uplifting trance and drum and bass, wide strings, flight and freedom',
}
CALM = (
    'quiet ambient version, soft piano and warm pads, gentle humming vocal, sparse light percussion, '
    'no heavy drums, calm and spacious'
)

# 各章的音色（加在編曲後面）
PALETTE = {
    1: 'desert wind, dusty acoustic guitar, warm analog synth, ochre sunset wasteland',
    2: 'industrial metallic percussion, rain, city pop electric piano, funk, rusty factory',
    3: 'glassy bells, icy pads, crystalline piano, frozen silence, snowfield',
    4: 'glitch electronics, cyber arpeggios, digital textures, vertical megastructure',
    5: 'oceanic liquid pads, waves, wide stereo, sea breeze, floating city',
    6: 'space ambient, celestial choir, weightless starlight synths, orbit',
    7: 'aggressive industrial, taiko drums, roaring fire, distorted synths, volcano forge',
    8: 'grand finale, full orchestra and choir, hope after despair, all motifs return, giant ark',
}

# 各類型的聲線（章的設定可以覆寫）
VOICE_OF = {
    'theme': 'girl',
    'battle': 'duet',
    'front': 'duet',
    'elite': 'diva',
    'destroy': 'diva',
    'colossus': 'diva',
    'defend': 'girl',
    'escort': 'girl',
    'extract': 'girl',
    'breakthrough': 'diva',
    'chase': 'diva',
    'intel': 'girl',
    'supply': 'girl',
    'boss': 'diva',
    'air': 'duet',
}

# 各類型的速度（章的設定可以覆寫）
BPM_OF = {
    'theme': 150,
    'battle': 172,
    'front': 140,
    'elite': 168,
    'destroy': 140,
    'colossus': 120,
    'defend': 128,
    'escort': 124,
    'extract': 160,
    'breakthrough': 176,
    'chase': 174,
    'intel': 92,
    'supply': 84,
    'boss': 174,
    'air': 174,
}
