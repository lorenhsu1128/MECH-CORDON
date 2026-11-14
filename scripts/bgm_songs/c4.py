"""第 4 章　構造體（北部：巨型構造體 Lattice-9、舊宇宙港）：往上爬的塔、發射台、抉擇 2、空戰從這章開始。

宿敵：SPIRE（找最高的平台）、COUNTDOWN（秒讀）。ECHO 的訊號：「空の上で待ってる」（她在軌道站上）。
"""

CH = 4
KEY = 'G minor'

SONGS = {
    'theme': {
        'title': '天へ昇る塔',
        'zh': '昇天之塔',
        'lyrics': """[Intro - glitch arpeggio and piano]

[Verse 1]
錆びた階段 空へ続く
鉄の迷路を ひとり歩く
見上げるほどに 星が遠く
それでも足は 上へ向く

[Pre-Chorus]
誰かが 空を 目指してる
私は ここで 待っている

[Chorus]
昇れ 昇れ 天への塔を
越えろ 越えろ 星の海を
重力なんて 振り切って
君のもとへ 届くまで

[Verse 2]
カウントダウン 誰かの声
発射台には 消えた夢

[Pre-Chorus]
誰かが 空を 目指してる
私は ここで 待っている

[Chorus]
昇れ 昇れ 天への塔を
越えろ 越えろ 星の海を
重力なんて 振り切って
君のもとへ 届くまで

[Bridge - whispered]
もう少しだよ 待っててね
あと少しで 会えるね

[Final Chorus - key change]
昇れ 昇れ 天への塔を
越えろ 越えろ 星の海を
重力なんて 振り切って
君のもとへ 届くまで

[Outro]
空の上で 待ってる""",
    },
    'battle': {
        'title': 'グリッチ・ストーム',
        'zh': '故障風暴',
        'lyrics': """[Intro - glitch breakbeat]

[Verse 1]
データの雨が 降りそそぐ
ノイズの中で 標的を追う
回路が焼ける 匂いがする
それでも指は 止まらず撃つ

[Pre-Chorus]
エラーの嵐 振り切って
バグごと全部 撃ち抜いて

[Chorus]
バグらせて 世界ごと 塗り替えて
加速して 限界を 振り切って
光より速く 跳ぶんだ
この手で 未来を 掴むんだ

[Instrumental Break - drum and bass drop]

[Chorus]
バグらせて 世界ごと 塗り替えて
加速して 限界を 振り切って
光より速く 跳ぶんだ
この手で 未来を 掴むんだ

[Outro]""",
    },
    'front': {
        'title': '塔の攻防',
        'zh': '高塔攻防',
        'lyrics': """[Intro - war drums]

[Verse 1]
階層ごとに 旗を立てる
一つ一つ 道を開ける
上から下から 弾が降る
仲間を信じて 背中を預ける

[Pre-Chorus]
上へ 上へ 登ろう
みんなで 頂上へ 行こう

[Chorus]
攻めろ 攻めろ 塔のてっぺん
守れ 守れ 仲間の陣
一歩ずつでも 構わない
必ず 届く 諦めない

[Instrumental Break - choir]

[Chorus]
攻めろ 攻めろ 塔のてっぺん
守れ 守れ 仲間の陣
一歩ずつでも 構わない
必ず 届く 諦めない

[Outro - drums]""",
    },
    'elite': {
        'title': '頂の王',
        'zh': '頂峰之王',
        'lyrics': """[Intro - distorted guitar riff]

[Verse 1]
一番高い 場所で嗤う
鉄の王座で 私を呼ぶ
カウントダウンが 静かに進む
秒読みの中 刃が光る

[Pre-Chorus]
三 二 一 で
始めよう 決着を

[Chorus]
引きずり下ろせ 頂の王
撃ち落とせ 秒読みの砲
高さなんて 関係ない
私の空は 誰にも渡さない

[Guitar Solo]

[Chorus]
引きずり下ろせ 頂の王
撃ち落とせ 秒読みの砲
高さなんて 関係ない
私の空は 誰にも渡さない

[Outro - guitar]""",
    },
    'destroy': {
        'title': '発射台崩壊',
        'zh': '發射台崩毀',
        'lyrics': """[Intro - heavy bass and rocket engines]

[Verse 1]
錆びた発射台 空を睨む
最後のロケット 炎を孕む
誰かの欲が 天を望む
この手で今 夢ごと阻む

[Pre-Chorus]
リフトオフ 中止

[Chorus - drop]
落とせ 落とせ 鋼の塔を
燃やせ 燃やせ 欲望の火を
空は 誰の ものでもない
奪わせない 渡さない

[Drop - heavy bass]

[Chorus - drop]
落とせ 落とせ 鋼の塔を
燃やせ 燃やせ 欲望の火を
空は 誰の ものでもない
奪わせない 渡さない

[Outro]""",
    },
    'colossus': {
        'title': '構造体の心臓',
        'zh': '構造體之心',
        'lyrics': """[Intro - choir and giant gears]

[Verse 1]
巨大な歯車 唸りを上げる
構造体ごと 立ち上がる
空を塞いで 影が広がる
古い心臓 再び鳴る

[Pre-Chorus]
止めてみせる この手で
鼓動を 撃ち抜いて

[Chorus]
止まれ 止まれ 鋼の心臓
崩れろ 崩れろ 古代の巨像
どんなに 高く そびえても
倒してみせる 何度でも

[Instrumental Break - choir and heavy bass]

[Chorus]
止まれ 止まれ 鋼の心臓
崩れろ 崩れろ 古代の巨像
どんなに 高く そびえても
倒してみせる 何度でも

[Outro - choir]""",
    },
    'defend': {
        'title': '最上階の灯',
        'zh': '頂樓的燈',
        'lyrics': """[Intro - piano and distant gunfire]

[Verse 1]
高い塔の 小さな部屋で
みんなの寝顔 見守って
遠い砲火が 窓を叩いて
それでも私は 歌っていて

[Pre-Chorus]
ここだけは 渡さない
誰ひとり 失くさない

[Chorus]
守りたい 守りたい この塔を
灯したい 灯したい 希望の火を
夜が どんなに 長くても
朝を 待とう いつまでも

[Instrumental Break]

[Chorus]
守りたい 守りたい この塔を
灯したい 灯したい 希望の火を
夜が どんなに 長くても
朝を 待とう いつまでも

[Outro]""",
    },
    'escort': {
        'title': 'エレベーター・ライド',
        'zh': '電梯之旅',
        'lyrics': """[Intro - funky bass]

[Verse 1]
ゆっくり昇る エレベーター
窓の外には 星のシャワー
大事な荷物 抱きしめて
頂上目指して 揺られて

[Pre-Chorus]
落とさないように 歌おう
離さないように 繋ごう

[Chorus]
上がれ 上がれ 星の近くへ
運べ 運べ 夢の続きへ
誰も 置いて 行かないで
最後の 階まで 一緒にいて

[Instrumental Break]

[Chorus]
上がれ 上がれ 星の近くへ
運べ 運べ 夢の続きへ
誰も 置いて 行かないで
最後の 階まで 一緒にいて

[Outro]""",
    },
    'extract': {
        'title': '最終便',
        'zh': '最後一班',
        'lyrics': """[Intro - engines and ticking hi-hats]

[Verse 1]
最後のシャトル エンジンが鳴る
滑走路の先 光が揺れる
カウントダウンが 胸を締める
乗り遅れたら 夢が消える

[Pre-Chorus]
十 九 八

[Chorus]
飛び乗れ 飛び乗れ 最後の翼
離れる 地上に さよならさ
振り返らず 空へ
新しい 世界へ

[Instrumental Break]

[Chorus]
飛び乗れ 飛び乗れ 最後の翼
離れる 地上に さよならさ
振り返らず 空へ
新しい 世界へ

[Outro]""",
    },
    'breakthrough': {
        'title': '垂直突破',
        'zh': '垂直突破',
        'lyrics': """[Intro - fast drum and bass]

[Hook]
上へ 上へ 突き抜けろ
空へ 空へ 駆け上がれ

[Instrumental]

[Verse - chopped vocal]
高度 上昇
リミット 解除

[Hook]
上へ 上へ 突き抜けろ
空へ 空へ 駆け上がれ

[Drop]

[Hook]
上へ 上へ 突き抜けろ
空へ 空へ 駆け上がれ

[Outro]""",
    },
    'chase': {
        'title': 'シグナル追跡',
        'zh': '追蹤訊號',
        'lyrics': """[Intro - racing breakbeat]

[Hook]
追いかけろ 消える信号
捕まえろ 光の速度

[Verse - chopped vocal]
ロックオン 完了
逃がすな 今

[Instrumental]

[Hook]
追いかけろ 消える信号
捕まえろ 光の速度

[Drop - funk guitar]

[Hook]
追いかけろ 消える信号
捕まえろ 光の速度

[Outro]""",
    },
    'intel': {
        'title': 'ブラックボックス',
        'zh': '黑盒子',
        'lyrics': """[Intro - rhodes piano and data noise]

[Verse 1 - whispered]
構造体の 奥に潜って
黒い箱の 鍵を探って
開いちゃいけない 記録を辿って
それでも真実 知りたくて

[Chorus - breathy]
聞かないで 聞かないで まだ言えない
教えたい 教えたい でも言えない
この塔の 上に 何があるの
私の 本当の 居場所なの

[Instrumental]

[Chorus - breathy]
聞かないで 聞かないで まだ言えない
教えたい 教えたい でも言えない
この塔の 上に 何があるの
私の 本当の 居場所なの

[Outro - whispered]""",
    },
    'supply': {
        'title': '屋上の星',
        'zh': '屋頂的星星',
        'lyrics': """[Intro - soft piano]

[Verse 1 - soft]
屋上で 寝転んで
近くなった 星を数えて
鉄の匂い 風に乗って
少しだけ 休んで

[Chorus - humming]
ラララ 星のささやき
ラララ 夜空のきらめき

[Instrumental]

[Chorus - humming]
ラララ 星のささやき
ラララ 夜空のきらめき

[Outro - humming]""",
    },
    'boss': {
        'title': '天を衝く',
        'zh': '直衝天際',
        'lyrics': """[Intro - choir and alarms]

[Verse 1]
雲を貫く 鋼の塔
空を支配する 巨大な砲
見下ろす瞳 嘲笑って
私たちを 試して

[Pre-Chorus]
届かないなんて 言わせない
ここで 終わらせる

[Chorus]
撃ち抜け 天を衝く塔を
引き裂け 支配の雲を
この空だけは 渡さない
星まで 届く 叫びを 消させない

[Instrumental Break - choir and drum and bass]

[Chorus]
撃ち抜け 天を衝く塔を
引き裂け 支配の雲を
この空だけは 渡さない
星まで 届く 叫びを 消させない

[Outro - choir]""",
    },
    'air': {
        'title': '星間飛翔',
        'zh': '星間飛翔',
        'lyrics': """[Intro - soaring strings]

[Verse 1]
翼を広げ 雲を抜ける
風を切り裂き 星へ駆ける
ミサイルの雨 くるりと避ける
君の声が 道を開ける

[Pre-Chorus]
高く 高く 舞い上がれ
遠く 遠く 響き渡れ

[Chorus]
飛べ 飛べ 星の海へ
歌え 歌え 空の果てへ
重力も 涙も 振り払って
二人の歌で 未来を描いて

[Instrumental Break - soaring]

[Chorus]
飛べ 飛べ 星の海へ
歌え 歌え 空の果てへ
重力も 涙も 振り払って
二人の歌で 未来を描いて

[Outro]""",
    },
}
