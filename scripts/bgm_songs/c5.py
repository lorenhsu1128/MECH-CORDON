"""第 5 章　洋上的抉擇（東岸洋上都市 Reefhold）：海、橋、浪、選擇自己的路（依抉擇 2 的路線）。

宿敵：UNDERTOW（推擊往外推）。ECHO 的訊號：「どこにいても聞こえるよ」。
"""

CH = 5
KEY = 'A minor'

SONGS = {
    'theme': {
        'title': '波間のこえ',
        'zh': '浪間之聲',
        'lyrics': """[Intro - waves and piano]

[Verse 1]
揺れる街に 潮風が吹く
海の底へ 光が届く
選んだ道を 波が引く
遠い岸辺で 誰かが泣く

[Pre-Chorus]
どちらを選んでも 間違いじゃない
その手で選べば 迷わない

[Chorus]
寄せては 返す 波のように
何度でも 君に 会いに来るよ
沈まない 船を 漕ぎ出そう
光の 海を 越えて行こう

[Verse 2]
橋の向こうで 手を振る君
海に映った 夜明けの夢

[Pre-Chorus]
どちらを選んでも 間違いじゃない
その手で選べば 迷わない

[Chorus]
寄せては 返す 波のように
何度でも 君に 会いに来るよ
沈まない 船を 漕ぎ出そう
光の 海を 越えて行こう

[Bridge - whispered]
どこにいても 聞こえるよ
波の向こうで 歌ってるよ

[Final Chorus - key change]
寄せては 返す 波のように
何度でも 君に 会いに来るよ
沈まない 船を 漕ぎ出そう
光の 海を 越えて行こう

[Outro]
海の向こうで 待ってる""",
    },
    'battle': {
        'title': 'ブルー・ライン',
        'zh': '藍色水平線',
        'lyrics': """[Intro - liquid breakbeat and waves]

[Verse 1]
水しぶき上げ 街を駆ける
沈む橋から 宙へ跳ねる
波のリズムで 狙いを定める
潮の匂いに 心が燃える

[Pre-Chorus]
落ちても 何度でも
這い上がれ どこまでも

[Chorus]
越えろ 越えろ 青い水平線
燃やせ 燃やせ 胸の導火線
潮が 満ちる 前に
勝利を この手に

[Instrumental Break - drum and bass drop]

[Chorus]
越えろ 越えろ 青い水平線
燃やせ 燃やせ 胸の導火線
潮が 満ちる 前に
勝利を この手に

[Outro]""",
    },
    'front': {
        'title': '海上戦線',
        'zh': '海上戰線',
        'lyrics': """[Intro - war drums and waves]

[Verse 1]
並んだ艦が 波を割る
橋の上で 旗が鳴る
仲間の声が 海を渡る
この戦線を 必ず守る

[Pre-Chorus]
潮風に 乗せて 叫ぼう
ひとつになって 進もう

[Chorus]
進め 進め 海の果てまで
繋げ 繋げ 島から島まで
波が 道を 塞いでも
私たちは 止まらない 何度でも

[Instrumental Break - choir]

[Chorus]
進め 進め 海の果てまで
繋げ 繋げ 島から島まで
波が 道を 塞いでも
私たちは 止まらない 何度でも

[Outro - drums]""",
    },
    'elite': {
        'title': '底流',
        'zh': '暗流',
        'lyrics': """[Intro - distorted guitar riff]

[Verse 1]
深い海から 這い上がる
冷たい腕が 私を縛る
見えない流れ 渦が唸る
落ちたら最後 闇に眠る

[Pre-Chorus]
引きずり込まれるか
引きずり出すか

[Chorus]
渦巻く 底流 断ち切って
深海の 闇ごと 突き抜けて
この海に 沈むのは 私じゃない
光を 掴むまで 諦めない

[Guitar Solo]

[Chorus]
渦巻く 底流 断ち切って
深海の 闇ごと 突き抜けて
この海に 沈むのは 私じゃない
光を 掴むまで 諦めない

[Outro - guitar]""",
    },
    'destroy': {
        'title': '防波堤破壊',
        'zh': '摧毀防波堤',
        'lyrics': """[Intro - heavy bass and waves]

[Verse 1]
巨大な壁が 海を塞ぐ
閉じた港で 誰かが泣く
支配の塔が 空を突く
その根元を 今暴く

[Pre-Chorus]
発破 用意

[Chorus - drop]
崩せ 崩せ 海の壁を
開け 開け 閉じた港を
潮よ 満ちて 流れ込め
自由の 波で 呑み込め

[Drop - heavy bass]

[Chorus - drop]
崩せ 崩せ 海の壁を
開け 開け 閉じた港を
潮よ 満ちて 流れ込め
自由の 波で 呑み込め

[Outro]""",
    },
    'colossus': {
        'title': '海神',
        'zh': '海神',
        'lyrics': """[Intro - choir and storm]

[Verse 1]
海を割って 現れる
鋼の巨神 目覚める
波が逆巻き 街が揺れる
空が暗く 閉ざされる

[Pre-Chorus]
怯むな 前を向け
心臓を 狙え

[Chorus]
沈め 沈め 鋼の海神
止まれ 止まれ 怒りの進軍
どれだけ 波が 荒れても
立ち向かう 何度でも

[Instrumental Break - choir and heavy bass]

[Chorus]
沈め 沈め 鋼の海神
止まれ 止まれ 怒りの進軍
どれだけ 波が 荒れても
立ち向かう 何度でも

[Outro - choir]""",
    },
    'defend': {
        'title': '灯台守',
        'zh': '燈塔守',
        'lyrics': """[Intro - piano and storm]

[Verse 1]
嵐の夜に 灯をともす
迷った船を 岸へ戻す
冷たい波が 足を濡らす
それでも光は 闇を照らす

[Pre-Chorus]
ここにいるよ 見えるでしょう
この光を 目指して 帰ろう

[Chorus]
守りたい 守りたい この灯り
照らしたい 照らしたい 君の帰り道
嵐が 全部 奪っても
私は ここで 灯すよ 何度でも

[Instrumental Break]

[Chorus]
守りたい 守りたい この灯り
照らしたい 照らしたい 君の帰り道
嵐が 全部 奪っても
私は ここで 灯すよ 何度でも

[Outro]""",
    },
    'escort': {
        'title': '渡し舟',
        'zh': '渡船',
        'lyrics': """[Intro - funky bass and waves]

[Verse 1]
島から島へ 舟を出して
小さな願いを 波に乗せて
揺れる橋の 下くぐって
向こうの岸を 目指して

[Pre-Chorus]
オールを 漕いで 歌おう
みんな 一緒に 渡ろう

[Chorus]
渡れ 渡れ 青い海を
運べ 運べ 小さな希望を
波が 高くても
最後まで 一緒だよ いつまでも

[Instrumental Break]

[Chorus]
渡れ 渡れ 青い海を
運べ 運べ 小さな希望を
波が 高くても
最後まで 一緒だよ いつまでも

[Outro]""",
    },
    'extract': {
        'title': '満ち潮',
        'zh': '漲潮',
        'lyrics': """[Intro - waves and ticking hi-hats]

[Verse 1]
潮が満ちて 道が消える
足元から 海が迫る
迎えの船 遠く見える
あと少しだけ 踏みとどまる

[Pre-Chorus]
沈む 沈む 前に

[Chorus]
早く 早く 迎えに来て
強く 強く 手を握って
海に 沈む 前に
光の 船に

[Instrumental Break]

[Chorus]
早く 早く 迎えに来て
強く 強く 手を握って
海に 沈む 前に
光の 船に

[Outro]""",
    },
    'breakthrough': {
        'title': '橋上突破',
        'zh': '橋上突破',
        'lyrics': """[Intro - fast drum and bass]

[Hook]
渡れ 渡れ 崩れる前に
跳べ 跳べ 海の上に

[Instrumental]

[Verse - chopped vocal]
ブースト 全開
振り向くな

[Hook]
渡れ 渡れ 崩れる前に
跳べ 跳べ 海の上に

[Drop]

[Hook]
渡れ 渡れ 崩れる前に
跳べ 跳べ 海の上に

[Outro]""",
    },
    'chase': {
        'title': '海原チェイス',
        'zh': '海原追逐',
        'lyrics': """[Intro - racing breakbeat]

[Hook]
逃がさない 波の果てまで
追いつけ 水平線まで

[Verse - chopped vocal]
水しぶき 上げて
狙いを つけて

[Instrumental]

[Hook]
逃がさない 波の果てまで
追いつけ 水平線まで

[Drop - funk guitar]

[Hook]
逃がさない 波の果てまで
追いつけ 水平線まで

[Outro]""",
    },
    'intel': {
        'title': '潮騒の暗号',
        'zh': '潮聲的暗號',
        'lyrics': """[Intro - rhodes piano and waves]

[Verse 1 - whispered]
海の底を 走るケーブル
誰かの声が 流れてる
波の音に 隠れてる
暗号の鍵 拾ってみる

[Chorus - breathy]
選んで 選んで 自分の手で
誰かの 言葉じゃ なくて
本当の 敵は 誰なの
海だけが 知っているの

[Instrumental]

[Chorus - breathy]
選んで 選んで 自分の手で
誰かの 言葉じゃ なくて
本当の 敵は 誰なの
海だけが 知っているの

[Outro - whispered]""",
    },
    'supply': {
        'title': '波止場の午後',
        'zh': '碼頭的午後',
        'lyrics': """[Intro - soft piano and seagulls]

[Verse 1 - soft]
波止場に座って 足を揺らす
カモメの声が 空を渡す
潮風の中 目を閉じる
少しだけ 夢を見る

[Chorus - humming]
ラララ 波の子守唄
ラララ 海が歌う歌

[Instrumental]

[Chorus - humming]
ラララ 波の子守唄
ラララ 海が歌う歌

[Outro - humming]""",
    },
    'boss': {
        'title': '深淵の王',
        'zh': '深淵之王',
        'lyrics': """[Intro - choir and deep sea]

[Verse 1]
海の底から 王が来る
暗い深淵 口を開ける
都市ごと飲み込む 渦が唸る
最後の選択 胸に抱える

[Pre-Chorus]
選んだ道を 信じて
ここで 決着を

[Chorus]
沈めてみせる 深淵の王
貫いてみせる 渦の中央
選んだ 未来を
この手で 守り抜こう

[Instrumental Break - choir and drum and bass]

[Chorus]
沈めてみせる 深淵の王
貫いてみせる 渦の中央
選んだ 未来を
この手で 守り抜こう

[Outro - choir]""",
    },
    'air': {
        'title': '蒼穹のデュエット',
        'zh': '蒼穹二重唱',
        'lyrics': """[Intro - soaring strings]

[Verse 1]
海と空の 境目を翔ける
二つの翼 光を分ける
雲の切れ間に 歌が溢れる
君と私で 風になれる

[Pre-Chorus]
響け 響け 蒼穹へ
重なれ 重なれ 二つの声

[Chorus]
舞い上がれ 青い空へ
歌い上げろ 遥か彼方へ
この歌が 届くなら
どこまでも 飛べるから

[Instrumental Break - soaring]

[Chorus]
舞い上がれ 青い空へ
歌い上げろ 遥か彼方へ
この歌が 届くなら
どこまでも 飛べるから

[Outro]""",
    },
}
