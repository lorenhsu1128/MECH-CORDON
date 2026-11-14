"""第 8 章　方舟（移動要塞）：終點與起點、最後的抉擇、兩個聲音的二重唱（主題歌與 Boss 都是二重唱）。

ECHO 的訊號唱完整首：「忘れても何度でも」到這裡變成「もう忘れない」。宿敵：KEEL。
"""

CH = 8
KEY = 'D minor'

SONGS = {
    'theme': {
        'title': 'カノン・オブ・アーク',
        'zh': '方舟的卡農',
        'voice': 'duet',
        'lyrics': """[Intro - full orchestra and piano]

[Verse 1]
巡る時の 終わりの場所で
同じ空を 見上げていた
砂も雨も 雪も星も
全部ここへ 繋がっていた

[Pre-Chorus]
何度 君を 失くしても
何度 名前を 忘れても

[Chorus]
歌え 歌え 二つの声で
届け 届け 最後の空へ
もう忘れない 君のこと
ここから始まる 本当の明日

[Verse 2]
鋼の船が 海を渡る
長い旅路の 終わりが見える

[Pre-Chorus]
何度 君を 失くしても
何度 名前を 忘れても

[Chorus]
歌え 歌え 二つの声で
届け 届け 最後の空へ
もう忘れない 君のこと
ここから始まる 本当の明日

[Bridge - duet harmony]
ありがとう 見つけてくれて
ありがとう 呼び続けてくれて

[Final Chorus - key change]
歌え 歌え 二つの声で
届け 届け 最後の空へ
もう忘れない 君のこと
ここから始まる 本当の明日

[Outro]
ただいま おかえり""",
    },
    'battle': {
        'title': 'アーク・ブレイカー',
        'zh': '方舟破壞者',
        'lyrics': """[Intro - full breakbeat and orchestra]

[Verse 1]
巨大な甲板 風が吠える
砲火の雨が 空を焦がす
すべての旅が ここに集まる
最後の戦い 幕が上がる

[Pre-Chorus]
迷わない もう二度と
止まらない この先も

[Chorus]
撃ち抜け 方舟の 心臓まで
燃やせ 燃やせ 運命の 果てまで
繰り返しは もういらない
この一瞬を 生き抜きたい

[Instrumental Break - drum and bass drop]

[Chorus]
撃ち抜け 方舟の 心臓まで
燃やせ 燃やせ 運命の 果てまで
繰り返しは もういらない
この一瞬を 生き抜きたい

[Outro]""",
    },
    'front': {
        'title': '最後の戦線',
        'zh': '最後的戰線',
        'lyrics': """[Intro - war drums and full choir]

[Verse 1]
すべての仲間 ここに並ぶ
砂も海も 越えて来た
旗を掲げて 甲板を進む
最後の線を 今越える

[Pre-Chorus]
声を ひとつに 叫ぼう
明日を この手で 掴もう

[Chorus]
進め 進め 方舟の先へ
響け 響け 鬨の声高く
倒れた旗も もう一度
掲げて行こう 何度でも

[Instrumental Break - choir]

[Chorus]
進め 進め 方舟の先へ
響け 響け 鬨の声高く
倒れた旗も もう一度
掲げて行こう 何度でも

[Outro - drums]""",
    },
    'elite': {
        'title': '竜骨',
        'zh': '龍骨',
        'lyrics': """[Intro - distorted guitar riff]

[Verse 1]
方舟の底 竜骨が軋む
最後の番人 静かに笑む
長い旅路の 意味を問う
刃と刃で 答えを語る

[Pre-Chorus]
譲れない 最後の夢
退けない 最後の道

[Chorus]
来いよ 最後の ライバル
燃やし尽くせ 魂の ファイナル
勝者だけが 明日へ行ける
負けた夢まで 背負って駆ける

[Guitar Solo]

[Chorus]
来いよ 最後の ライバル
燃やし尽くせ 魂の ファイナル
勝者だけが 明日へ行ける
負けた夢まで 背負って駆ける

[Outro - guitar]""",
    },
    'destroy': {
        'title': '動力炉停止',
        'zh': '動力爐停止',
        'lyrics': """[Intro - heavy bass and engines]

[Verse 1]
方舟の奥 炉が脈打つ
巻き戻しの 歯車が回る
永遠の檻 ここで終わる
最後の鍵を この手で握る

[Pre-Chorus]
動力 停止 三 二 一

[Chorus - drop]
止めろ 止めろ 循環の炉を
壊せ 壊せ 永遠の檻を
もう二度と 戻さない
この世界を 終わらせない

[Drop - heavy bass]

[Chorus - drop]
止めろ 止めろ 循環の炉を
壊せ 壊せ 永遠の檻を
もう二度と 戻さない
この世界を 終わらせない

[Outro]""",
    },
    'colossus': {
        'title': '方舟の守護神',
        'zh': '方舟守護神',
        'lyrics': """[Intro - choir and taiko]

[Verse 1]
甲板を割って 巨神が立つ
最後の扉 その身で塞ぐ
鋼の拳 空を打つ
世界の終わり 告げる鐘が鳴る

[Pre-Chorus]
怯むな ここまで来た
心臓を 撃ち抜け

[Chorus]
倒れろ 倒れろ 最後の巨神
止まれ 止まれ 運命の進軍
どんなに 高い 壁だって
この手で 越えて 見せるって

[Instrumental Break - choir and heavy bass]

[Chorus]
倒れろ 倒れろ 最後の巨神
止まれ 止まれ 運命の進軍
どんなに 高い 壁だって
この手で 越えて 見せるって

[Outro - choir]""",
    },
    'defend': {
        'title': '帰る場所',
        'zh': '歸處',
        'lyrics': """[Intro - piano]

[Verse 1]
長い旅の 終わりの部屋で
みんなの声を 数えて
揺れる甲板 足で感じて
それでもここを 守っていて

[Pre-Chorus]
大丈夫 帰ってくる
ここが みんなの 帰る場所

[Chorus]
守りたい 守りたい この場所を
離さない 離さない 繋いだ手を
どんなに 遠く 離れても
必ず 帰るよ 何度でも

[Instrumental Break]

[Chorus]
守りたい 守りたい この場所を
離さない 離さない 繋いだ手を
どんなに 遠く 離れても
必ず 帰るよ 何度でも

[Outro]""",
    },
    'escort': {
        'title': '最後の積荷',
        'zh': '最後的貨物',
        'lyrics': """[Intro - funky bass]

[Verse 1]
最後の荷物 大事に抱いて
甲板の上 ゆっくり歩いて
砂も海も 思い出にして
新しい朝へ 運んで

[Pre-Chorus]
歌いながら 行こう
みんな一緒に 帰ろう

[Chorus]
運べ 運べ 未来の種を
繋げ 繋げ 約束の糸を
誰も 置いて 行かないで
最後の 一歩まで 一緒にいて

[Instrumental Break]

[Chorus]
運べ 運べ 未来の種を
繋げ 繋げ 約束の糸を
誰も 置いて 行かないで
最後の 一歩まで 一緒にいて

[Outro]""",
    },
    'extract': {
        'title': '離艦',
        'zh': '離艦',
        'lyrics': """[Intro - alarms and ticking hi-hats]

[Verse 1]
方舟が 傾き始める
甲板の端 炎が迫る
迎えの翼 空に見える
あと少しだけ 踏みとどまる

[Pre-Chorus]
離艦まで あと少し

[Chorus]
跳んで 跳んで 光の中へ
帰ろう 帰ろう みんなの空へ
沈む 前に
君の そばに

[Instrumental Break]

[Chorus]
跳んで 跳んで 光の中へ
帰ろう 帰ろう みんなの空へ
沈む 前に
君の そばに

[Outro]""",
    },
    'breakthrough': {
        'title': '最終突破',
        'zh': '最終突破',
        'lyrics': """[Intro - fast drum and bass]

[Hook]
抜けろ 抜けろ 最後の扉
走れ 走れ 明日の方へ

[Instrumental]

[Verse - chopped vocal]
リミット 解除
迷わず 行け

[Hook]
抜けろ 抜けろ 最後の扉
走れ 走れ 明日の方へ

[Drop]

[Hook]
抜けろ 抜けろ 最後の扉
走れ 走れ 明日の方へ

[Outro]""",
    },
    'chase': {
        'title': '終わりを追え',
        'zh': '追向終點',
        'lyrics': """[Intro - racing breakbeat]

[Hook]
逃がさない 最後の鍵を
追いかけろ 終わりの先を

[Verse - chopped vocal]
全速 前進
振り向くな

[Instrumental]

[Hook]
逃がさない 最後の鍵を
追いかけろ 終わりの先を

[Drop - funk guitar]

[Hook]
逃がさない 最後の鍵を
追いかけろ 終わりの先を

[Outro]""",
    },
    'intel': {
        'title': '認証',
        'zh': '認證',
        'lyrics': """[Intro - rhodes piano and soft data noise]

[Verse 1 - whispered]
最後の端末 光が灯る
君の名前を 静かに呼ぶ
鍵はずっと 君だった
私はずっと 待っていた

[Chorus - breathy]
選んで 選んで 最後の答え
終わらせても 始めても
どちらでも 君の味方
最後まで そばにいるから

[Instrumental]

[Chorus - breathy]
選んで 選んで 最後の答え
終わらせても 始めても
どちらでも 君の味方
最後まで そばにいるから

[Outro - whispered]""",
    },
    'supply': {
        'title': '旅の終わりの子守唄',
        'zh': '旅途終點的搖籃曲',
        'lyrics': """[Intro - soft piano]

[Verse 1 - soft]
甲板の上 寝転んで
長い旅を 振り返って
砂も雨も 雪も星も
全部胸に しまって

[Chorus - humming]
ラララ 旅の子守唄
ラララ 君と私の歌

[Instrumental]

[Chorus - humming]
ラララ 旅の子守唄
ラララ 君と私の歌

[Outro - humming]""",
    },
    'boss': {
        'title': '終焉と開闢',
        'zh': '終焉與開闢',
        'voice': 'duet',
        'lyrics': """[Intro - full choir and orchestra]

[Verse 1]
すべての始まり すべての終わり
巡る輪の 中心で
最後の王が 待っている
時の鎖を 握っている

[Pre-Chorus]
二つの声を 重ねて
最後の空へ 歌って

[Chorus]
断ち切れ 断ち切れ 時の鎖を
解き放て 解き放て 囚われた夢を
終わりの先に 光がある
二人なら 何度でも 歩いて行ける

[Instrumental Break - choir and drum and bass]

[Chorus]
断ち切れ 断ち切れ 時の鎖を
解き放て 解き放て 囚われた夢を
終わりの先に 光がある
二人なら 何度でも 歩いて行ける

[Outro - choir]""",
    },
}
