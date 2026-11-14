"""第 6 章　軌道（高空軌道）：沒有聲音的天空、回不去的星、ECHO 的坦白（「ずっと騙してた」）、中樞是空的。

宿敵：ZENITH（離地就爬升）。Boss：ARCHON。ECHO 的訊號：「ここで待ってた」。
"""

CH = 6
KEY = 'B minor'

SONGS = {
    'theme': {
        'title': '星屑のレクイエム',
        'zh': '星塵安魂曲',
        'lyrics': """[Intro - celestial choir and piano]

[Verse 1]
音のない空 星が降る
重さを失くし 心が揺れる
地上の灯り 遠くなる
帰れない場所 胸に残る

[Pre-Chorus]
軌道の上で 待っていた
ずっと君を 呼んでいた

[Chorus]
星屑の 海で やっと会えた
長い 夜を 越えて来た
ここが 終わりじゃ ないのなら
もう一度 始めよう 二人なら

[Verse 2]
窓の向こうに 青い星
抱きしめたいほど 小さな星

[Pre-Chorus]
軌道の上で 待っていた
ずっと君を 呼んでいた

[Chorus]
星屑の 海で やっと会えた
長い 夜を 越えて来た
ここが 終わりじゃ ないのなら
もう一度 始めよう 二人なら

[Bridge - whispered]
ごめんね ずっと 騙してた
それでも 君に 会いたかった

[Final Chorus - key change]
星屑の 海で やっと会えた
長い 夜を 越えて来た
ここが 終わりじゃ ないのなら
もう一度 始めよう 二人なら

[Outro]
ここで 待ってた""",
    },
    'battle': {
        'title': 'ゼログラビティ',
        'zh': '零重力',
        'lyrics': """[Intro - spacey breakbeat]

[Verse 1]
無重力の中 くるりと回る
上も下も ない世界で踊る
星の光を 弾丸が切る
宇宙の闇に 火花が散る

[Pre-Chorus]
浮かんで 沈んで
重力を 忘れて

[Chorus]
回れ 回れ 星の渦の中
撃て 撃て 光の真ん中
落ちることさえ 怖くない
この空で 止まらない

[Instrumental Break - drum and bass drop]

[Chorus]
回れ 回れ 星の渦の中
撃て 撃て 光の真ん中
落ちることさえ 怖くない
この空で 止まらない

[Outro]""",
    },
    'front': {
        'title': '軌道防衛線',
        'zh': '軌道防衛線',
        'lyrics': """[Intro - war drums and choir]

[Verse 1]
ステーションの前 翼が並ぶ
仲間の機体 星に光る
最後の線を ここで守る
地球の青が 背中を見守る

[Pre-Chorus]
声を 重ねて 叫ぼう
星の 果てまで 届こう

[Chorus]
守れ 守れ 最後の防衛線
繋げ 繋げ 光の生命線
宇宙の 果てでも
私たちは ひとつ いつまでも

[Instrumental Break - choir]

[Chorus]
守れ 守れ 最後の防衛線
繋げ 繋げ 光の生命線
宇宙の 果てでも
私たちは ひとつ いつまでも

[Outro - drums]""",
    },
    'elite': {
        'title': '天頂',
        'zh': '天頂',
        'lyrics': """[Intro - distorted guitar riff]

[Verse 1]
誰よりも高い 場所に昇る
天頂の影 冷たく光る
地上を捨てた 翼が唸る
星の刃が 私を斬る

[Pre-Chorus]
落ちてこい 落ちてこい
ここまで 降りてこい

[Chorus]
撃ち落とせ 天頂の翼
見せてやれ 地上の強さ
星より 高くても
引きずり下ろす 何度でも

[Guitar Solo]

[Chorus]
撃ち落とせ 天頂の翼
見せてやれ 地上の強さ
星より 高くても
引きずり下ろす 何度でも

[Outro - guitar]""",
    },
    'destroy': {
        'title': '中枢遮断',
        'zh': '切斷中樞',
        'lyrics': """[Intro - heavy bass and alarms]

[Verse 1]
星を見下ろす 冷たい回路
すべてを戻す 機械の心
消されていった 記憶の声
その仕組みごと 壊すため

[Pre-Chorus]
中枢 遮断

[Chorus - drop]
壊せ 壊せ 永遠の檻を
断ち切れ 断ち切れ 運命の糸を
もう二度と 戻らない
この世界を 終わらせない

[Drop - heavy bass]

[Chorus - drop]
壊せ 壊せ 永遠の檻を
断ち切れ 断ち切れ 運命の糸を
もう二度と 戻らない
この世界を 終わらせない

[Outro]""",
    },
    'colossus': {
        'title': '軌道の巨像',
        'zh': '軌道巨像',
        'lyrics': """[Intro - choir and deep space]

[Verse 1]
星の海から 巨体が昇る
ステーションより 大きく光る
鋼の腕が 空をえぐる
地球の影が 静かに揺れる

[Pre-Chorus]
怯まないで 進もう
星の果てまで 行こう

[Chorus]
倒れろ 倒れろ 軌道の巨像
止まれ 止まれ 星の兵装
どんなに 宇宙が 広くても
諦めないよ 何度でも

[Instrumental Break - choir and heavy bass]

[Chorus]
倒れろ 倒れろ 軌道の巨像
止まれ 止まれ 星の兵装
どんなに 宇宙が 広くても
諦めないよ 何度でも

[Outro - choir]""",
    },
    'defend': {
        'title': '最後の砦',
        'zh': '最後的堡壘',
        'lyrics': """[Intro - piano and silence of space]

[Verse 1]
真空の中で 扉を閉めて
酸素の灯りを 見つめて
外の嵐を 感じて
それでもここを 守っていて

[Pre-Chorus]
大丈夫 そばにいる
星になるまで ここにいる

[Chorus]
守りたい 守りたい この砦
離さない 離さない 繋いだ手
宇宙が 闇でも
光は 消えない いつまでも

[Instrumental Break]

[Chorus]
守りたい 守りたい この砦
離さない 離さない 繋いだ手
宇宙が 闇でも
光は 消えない いつまでも

[Outro]""",
    },
    'escort': {
        'title': '星の運び屋',
        'zh': '星之運送人',
        'lyrics': """[Intro - funky bass and starlight synths]

[Verse 1]
星の海を 静かに進む
大事な荷物 胸に包む
宇宙の風を 帆に孕む
遠い港に 夢を運ぶ

[Pre-Chorus]
迷わないで 星を見て
離れないで 手を繋いで

[Chorus]
運べ 運べ 星の向こうへ
届け 届け 光の速さで
誰も 置いていかない
最後の 星まで 離れない

[Instrumental Break]

[Chorus]
運べ 運べ 星の向こうへ
届け 届け 光の速さで
誰も 置いていかない
最後の 星まで 離れない

[Outro]""",
    },
    'extract': {
        'title': '脱出軌道',
        'zh': '脫離軌道',
        'lyrics': """[Intro - alarms and ticking hi-hats]

[Verse 1]
ステーションが 軋み始める
酸素の残り 刻々と減る
窓の外に 青い星が見える
帰りたい場所 胸に抱える

[Pre-Chorus]
降下まで あと少し

[Chorus]
帰ろう 帰ろう あの青い星へ
落ちよう 落ちよう 光の中へ
燃え尽きる 前に
君の そばに

[Instrumental Break]

[Chorus]
帰ろう 帰ろう あの青い星へ
落ちよう 落ちよう 光の中へ
燃え尽きる 前に
君の そばに

[Outro]""",
    },
    'breakthrough': {
        'title': '大気圏突破',
        'zh': '突破大氣層',
        'lyrics': """[Intro - fast drum and bass]

[Hook]
突き抜けろ 大気の壁
燃え尽きるな 星の先へ

[Instrumental]

[Verse - chopped vocal]
推力 最大
振り切れ 今

[Hook]
突き抜けろ 大気の壁
燃え尽きるな 星の先へ

[Drop]

[Hook]
突き抜けろ 大気の壁
燃え尽きるな 星の先へ

[Outro]""",
    },
    'chase': {
        'title': '流星を追え',
        'zh': '追逐流星',
        'lyrics': """[Intro - racing breakbeat]

[Hook]
追いかけろ 流れ星を
撃ち落とせ 光の尾を

[Verse - chopped vocal]
ロックオン
逃がさない

[Instrumental]

[Hook]
追いかけろ 流れ星を
撃ち落とせ 光の尾を

[Drop - funk guitar]

[Hook]
追いかけろ 流れ星を
撃ち落とせ 光の尾を

[Outro]""",
    },
    'intel': {
        'title': 'アーカイブ',
        'zh': '檔案庫',
        'lyrics': """[Intro - rhodes piano and data noise]

[Verse 1 - whispered]
星の記録庫 扉を開く
並んだ記憶 眠りにつく
同じ名前が 何度も続く
巻き戻された 時間に気づく

[Chorus - breathy]
ごめんね ごめんね 黙ってた
何度も 何度も 見送った
今度こそ 本当のこと
伝えたいの 君のこと

[Instrumental]

[Chorus - breathy]
ごめんね ごめんね 黙ってた
何度も 何度も 見送った
今度こそ 本当のこと
伝えたいの 君のこと

[Outro - whispered]""",
    },
    'supply': {
        'title': '地球の見える窓',
        'zh': '看得見地球的窗',
        'lyrics': """[Intro - soft piano]

[Verse 1 - soft]
丸い窓に 額を寄せて
青い星を 見下ろして
ゆっくり回る 雲を数えて
少しだけ 目を閉じて

[Chorus - humming]
ラララ 星の子守唄
ラララ 遠い地球の歌

[Instrumental]

[Chorus - humming]
ラララ 星の子守唄
ラララ 遠い地球の歌

[Outro - humming]""",
    },
    'boss': {
        'title': '星の王座',
        'zh': '星之王座',
        'lyrics': """[Intro - choir and cosmic drones]

[Verse 1]
軌道の王座で 星を揺らす
支配の光 空を焦がす
永遠の檻 誰が許す
この手で今 終わりを示す

[Pre-Chorus]
これが 最後の 戦い
星の果てで 決着を

[Chorus]
撃ち落とせ 偽りの王座
解き放て 星の涙
この空の 向こうに
本当の 明日を 掴みに

[Instrumental Break - choir and drum and bass]

[Chorus]
撃ち落とせ 偽りの王座
解き放て 星の涙
この空の 向こうに
本当の 明日を 掴みに

[Outro - choir]""",
    },
    'air': {
        'title': '星屑ドッグファイト',
        'zh': '星塵纏鬥',
        'lyrics': """[Intro - soaring strings]

[Verse 1]
星屑の中 翼を広げ
ブースター全開 闇を抜け
二つの光 螺旋描いて
歌いながら 舞い上がって

[Pre-Chorus]
聞こえる 二人の声
重なる 星の果て

[Chorus]
飛べ 飛べ 銀河の果てまで
歌え 歌え 声が枯れるまで
星を越えて 届けよう
この歌で 世界を 変えよう

[Instrumental Break - soaring]

[Chorus]
飛べ 飛べ 銀河の果てまで
歌え 歌え 声が枯れるまで
星を越えて 届けよう
この歌で 世界を 変えよう

[Outro]""",
    },
}
