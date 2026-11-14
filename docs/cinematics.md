# 過場動畫（劇情動畫）

> 狀態：已實作（序章＋各章開場／章末）。引擎在 `src/game/cine.js`，劇本資料在 `src/data/cine/`，太空場景與空降艙在 `src/render/cine-sets.js`，配樂在 `src/assets/music/`。

## 方針

- 運鏡、節奏、構圖參考《機戰傭兵6》的劇情預告片（`test-results/ACVI_storyboard_frames` 的影格分析），內容是本作的世界觀（訊號、R-07、ECHO、四家委託方、軌道站的回收程序），不照抄原作的台詞、造型與 Logo。
- 遊戲內即時演算：用遊戲的機甲（玩家的組裝與模型組）、地圖主題、渲染風格、特效與音效；不錄影片，HTML 不變大。
- 字幕＋無線電音效（不做語音），配樂用 CC-BY 的曲子（Gregor Quendel「Cinematic Trailer Music Collection」，`src/assets/music/CREDITS.txt`）。
- **開場、章末與第 8 章結尾的配樂**（2026-11-14）：照每段的畫面用 AI（ACE-Step）新做的純器樂 `cine_i1`～`cine_i8`（開場）、`cine_o1`～`cine_o7`（章末）、`cine_e1`～`cine_e4`（最後抉擇的開門／封印／彼岸與真結局短片），打包時照每段的能量曲線推拉音量；做法與分數見 `docs/audio-design.md` 的「過場動畫的開場、章末與結尾配樂」，產生 `scripts/cine-intro-music.py`（`npm run cine:music`）。序章與第 2、4 章抉擇的演出照舊用 CC-BY 的曲子。

## 播放流程

- 故事畫面（`game/story.js` 的 `storyNext`）：序章 `p<周目>`、章節開場 `i<周目>_<章>`、章末 `o<周目>_<章>` 有過場動畫時先播動畫，播完接下一則；**中途略過時改顯示這一則的文字畫面**（原本的全畫面逐字）。設定「劇情動畫」（`ctrl.cine`）關閉、多人時一律用文字畫面。作戰室的「章節回顧」也走同一條路。
- `state 'cine'`，主迴圈呼叫 `cineTick`。長按 Esc／Enter／空白鍵／手把 A、B、Start（觸控長按畫面）0.8 秒略過。
- 時間以配樂的 AudioContext 時間為準；沒有配樂時用實際經過的時間。晚了 0.6 秒以上的音效與特效事件不補播。
- **預先準備**（2026-11-14，`game/cine-prep.js`；使用者回報：過場當下才準備 3D、還出現「戰場準備中」）：以前換到新場景的鏡頭時才建地圖（0.4～1 秒），新地圖又觸發出擊用的著色器預熱（`renderMain` 顯示「戰場準備中」並停住主迴圈），畫面停住、配樂照走，之後畫面跳過去。現在：
  - 開頭的載入畫面（`#cineLoad`，顯示「第幾個／共幾個」）依劇本順序把每個 3D 場景（world、space，以及有演員的黑畫面）建好：地圖建在自己的群組 `set.root` 裡（`World` 的 scene 參數就是這個群組，`opt.noMerge`＝地圖物件不合併，記憶體少約四分之一），放上這個場景全部鏡頭的演員、呼叫各鏡頭掛勾的 enter／exit（掛勾才建的模型），連同半透明版、任務中記下的變體一起 `compileAsync`＋`warmPrime`，再用實際的算繪路徑畫兩格（水面的模擬與反射、後處理的程式只在真的畫時才建）。台詞的語音也先載入並解碼（`voicePreload`）。
  - 記憶體允許時場景常駐，換鏡頭只切換顯示（`cine.js` 的 `cineMakeSet`／`cineUseSet`，`c.sets`）；之後不會再用到的立刻釋放（`cineSetGc`；過場動畫劇場在開頭全部常駐得下時不釋放，往回跳、拖時間軸不用重建）。觸控裝置（`deviceMemory` 不到 8 GB 或不回報，例如 iPad）只限制地圖（`world`）最多 2 張，室內與太空不佔名額（`cineResOk(c, add)`；以前是「整個場景數」而且在加入之後才檢查，實際只常駐 1 個——2026-11-14 使用者回報平板上每次換到 3D 都頓、配樂與語音也停），其他在 JS 記憶體用到上限的 55% 時停止。常駐不下的只預熱，**播放中提前建**（`cineAheadTick`，每格：前面的場景用完被釋放、放得下時，挑接下來 1.5 秒沒有新台詞開始的時候建；離要用不到 2 秒就不挑；建好以 `cineUploadSet` 只畫這個場景一次上傳顯示卡，霧照場景的種類換成假的霧，程式的鍵才對得上；建地圖的那一格畫面會停 0.4～0.8 秒，但不暫停音訊）；來不及時才在換鏡頭時 `cineHoldBuild` 暫停 AudioContext（配樂、語音、時鐘一起停）建好再繼續。模擬平板（觸控、不回報記憶體）：各章的開場與章末全部常駐、不再暫停音訊；序章（12 個場景）提前建 8 次、不暫停音訊，但 0:53～1:02 每 3 秒換一張地圖，建地圖時畫面停 0.4～0.8 秒。
  - 播放中 `renderMain` 不再做出擊用的預熱（`this.cine` 時略過，不顯示「戰場準備中」）。
  - 量測（這台筆電的 AMD Radeon 880M、序章 11 個場景）：準備約 18 秒，常駐約 1.9～2.3 GB；播放中最大的卡頓從 1 秒以上（加上跳格）降到約 0.15～0.2 秒（水壩的動態物件、一個機甲材質變體第一次出現，之後再處理）。
  - **劇本與掛勾不要加 three.js 的點光源**：點光源一出現或消失，整個場景的著色器都要重新編譯（第 1 章的天線燈與營火以前就是，一次 0.9～1.2 秒）；照亮周圍用 `fx.glow`（特效點光）。
- **過場動畫劇場**（`game/cine-lib.js`，標題的「過場動畫」，`state 'cinelib'`）：依周目與三個抉擇的選擇列出全部過場動畫（序章、各章開場／章末、抉擇的選前與選後），不寫存檔、不看「劇情動畫」設定。播放時（`cine.lib`）上方有控制列：暫停（空白鍵／P；暫停時時間與模擬都不動、配樂停止，繼續時從那一秒重新排配樂）、±5 秒（←／→）、上一鏡／下一鏡（Shift＋←／→、[ ]）、時間軸拖曳、H 隱藏、「返回清單」或長按 Esc；勾「連續播放」時播完接下一段。抉擇的選前演出原本在目前的戰場上播（`k: 'live'`），劇場改在那個抉擇的地圖（c2 水壩、c4 宇宙港、c6 荒野）上由 `cineStandIn` 擺主角與出口（`set.exits`，`cinePt` 的 `ex` 先看它）。
- 配樂不內嵌在遊戲的 HTML：建置產生 `dist/lib/cine-music.js`（`window.MECH_CORDON_MUSIC`，約 37 MB），第一次播過場動畫時以 `<script>` 載入（`cineMusicLoad`），最多等 6 秒，載不到也照樣播。

## 劇本格式（`data/cine/*.js`）

- **3D 動畫化**（2026-11-14，docs/cine-redesign-design.md 第十節）：鏡頭的 `koma`（一拍二：每個姿勢停幾格，以 24 格／秒算，演員與特效一格一格跳、鏡頭照常）；場景 `room`（指揮室模型當室內，`echo`／`signs` 為 false 時藏全像與招牌）；`lines` 的 `kind: 'reticle'`（瞄準鏡）；立繪演員 `noBub`（對白用字幕條）、`par`（跟著鏡頭的視差倍率，疊在 3D 上預設 0.12）；`room` 的 `kind: 'castron'`＝霍斯特的辦公室（`render/cine-office.js`）；機甲演員的小動作 `look`／`scan`／`lower`／`chk`。逐鏡截圖 `node scripts/cine-shots.js <鍵>`。

產生器 `(ctx: { cycle, choices }) => { title, dur, lb, music, shots }`，目錄在 `data/cine/index.js`（鍵和故事畫面相同）。

- `music`：`[{ at, track, vol, off, fadeIn, fadeOut: [開始秒, 長度] }]`，曲名＝`src/assets/music/<曲名>.mp3`。
- `shots`：依 `at`（秒）排序的鏡頭，每個鏡頭：
  - `set`：`{ k: 'black' }`／`{ k: 'space', coral }`／`{ k: 'world', theme, variant, seed, tod, rail, road, clear, anchor, align: 'rail', light }`。和上一鏡相同（JSON 相同）就沿用同一張地圖與演員；不同就重建（所以換場景放在黑畫面或閃白後）。`clear`＝原點附近要多大的空地（`cineSpot`）；`align: 'rail'`＝原點在鐵路上、局部 +X 沿著鐵路。
  - `actors`：`{ id, k, ... }`：`hero`（玩家的組裝）、`ace`（`ACES` 的宿敵）、`roster`（具名 AC）、`type`（`ENEMY_TYPES`／`FOES`）＝遊戲的機甲實體；`model`（Boss 模型 `key`）、`pod`（空降艙）、`crash`（墜落現場）、`worm`（鑽地蟲，身體沿頭的軌跡）、`train`（武裝列車）＝照關鍵影格 `keys: [{ t, p, r, s, thrust, heat, lin }]` 移動的模型。`parent: 'station'` 掛在軌道站上（p 是軌道站的局部座標）。機甲的 `s`＝時間軸上的動作。`drop`：這一鏡移除的演員。
  - **人物**（`game/cine-people.js`，第三版分鏡）：`human`＝一個人、`people`＝一群人，GLB 骨架動畫（`who`：`src/assets/people/` 的 biz、suitw、mansuit、hoodie、farmer、casual、hooded、pilot、man、woman、womanc 與格納庫的 worker、crew、soldier；`people` 可以給陣列隨機挑）。一律真實尺寸（約 1.75 m，`scale` 微調），不跟著劇本座標的倍率放大。`anim`（Idle、Idle_Neutral、Walk、Run、Interact、Wave、Death、HitRecieve、Idle_Gun_Pointing；低面數的 man／woman／womanc／mansuit 是 Idle、Walk、Run、Sitting、Standing、Clapping、Death，沒有的動作改用 Idle；`people` 可以給陣列各自挑）、`s` 的 `{ t, go: [x, z], run }`（從那一刻的位置走過去）、`{ t, anim }`、`{ t, face: 演員 id 或 [x, z] }`；`people` 另有 `n`、`r`（半徑）或 `box: [寬, 深]`、`go: [dx, dz]`（整群的位移）、`goT`、`stagger`（各自晚幾秒出發）、`speed`、`face: 'rnd'`、`yawRnd`、`seed`、`far: true`（遠景改用程式的小人 `CrowdMesh`）、`ground: false`（照劇本的高度，不貼地：掛勾自己建的場景）；掛勾可以設演員的 `turn`（轉身）與 `headTurn`（轉頭，繞 `Head` 骨頭）。外觀 `tint: { 材質名稱: 顏色 }`（例：`suitw` 的 `Suit` 換白色＝白袍）、`dark`（0～1，剪影：委託方的臉不露，`docs/cinematics-storyboard.md` 的 P2）。位置與動作由鏡頭時間直接算出（暫停、跳時間一致），貼地用 `World.groundAt`。素材 `dist/lib/people-assets.js`（約 9 MB，`window.MECH_CORDON_PEOPLE`）和配樂一起在第一次播放時載入（`render/hangar-assets.js` 的 `loadPeopleAssets`，解析進 `HA.glb`，身高由骨頭量），沒載到時改用程式的小人。鏡頭的 `{ a: 人物 id }` 對準第一個人的頭（`at: 'base'`＝腳下）。
  - 演員的動作（`s` 或事件的 `a`）：`go`（走到）、`stop`、`aim`（演員 id 或點）、`fire`（武器槽或 `'all'`＋`dur`、`at`）、`qb`（[x, z] 方向的快速推進）、`ab`（突擊推進）、`hover`、`jump`、`melee`、`ai`（交給遊戲的 AI）、`warp`、`die`、`rise`（從坑裡站起來）、`hide`。演員的 AP 不會歸零，要倒下的用 `die`。
  - `cam`：`{ keys: [{ t, p, l, fov, roll }], ease: 'lin'|'in'|'out', follow, hand（手持晃動）, shake, dof（景深強度）, focus, range, fog（霧往外推）, snap, free }`。
  - **尺度**（機甲三倍高改版，`docs/world-scale.md` 第 9 節）：劇本照舊尺度寫（機甲 3.24 m 時的數字），播放時場景的 `set.k`（戰場與太空＝DS，黑幕＝1）把座標、鏡頭的晃動與景深、模型演員、軌道站放大；機甲演員是遊戲實體，本來就是 9.7 m。
  - 點的寫法：`[x, y, z]`（相對場景原點）、`{ g: [x, z], h }`（貼地）、`{ a: 演員, o: [x, y, z], loc（依演員朝向）, at: 'head'|'base' }`、`{ st: [x, y, z] }`（軌道站的局部座標）。
  - `ev`：`{ t, ... }`：`sfx`（`at` 有位置）、`loop`、`boom`（爆炸，`big`、`kill`）、`fx`（flash、killBurst、shockwave、beam、dust、smoke、streaks、pillar、ring、warnLine、pulse、fire、flame、muzzle）、`shake`、`slow`（慢動作，只影響模擬）、`flash`（閃白／閃色）、`sub`＋`who`（字幕；`who`＝SPEAKERS 的鍵，有說話者時播無線電音效）、`card`＋`s`＋`style`（字卡：card 黑底電影字距、logo、chapter、name 宿敵名牌、loc 地點）、`sys`（左下的機器文字，系統日誌逐字）、`call`（函式）。
  - `grade`：這一鏡的調色（渲染風格的參數，疊在玩家選的風格＋過場的基本調色 `CINE_GRADE` 上；景深 `dof` 也在這裡）。
  - `fi`／`fo`：淡入／淡出秒數，`fc` 顏色，`fade`：整鏡蓋黑（後面在建地圖）。`ov`：疊加畫面（signal 訊號波形、boot 駕駛艙開機、speed 突入的速度線、scan 監視器掃描線、lock 機戰傭兵6 式的戰鬥 HUD：準星、鎖定框套住鏡頭的 `lock` 指定的演員、目標的 AP／ACS、彈數與 EN）。`lb: false` 不要遮幅。`sun`：太空場景的太陽方向。

## 2D 舞台（過場改版第 1 期，`game/cine-2d.js`，docs/cine-redesign-design.md）

鏡頭多一個欄位 `st`：畫在 `#cine2d`（3D 畫面之上、淡入淡出的黑幕與遮幅之下），座標是 1600×900 的舞台（cover 對齊畫面：寬螢幕裁上下、窄螢幕裁左右）。每一格只由鏡頭的時間決定（暫停、跳時間一致），立繪自己的眨眼與呼吸用 dt。在 `renderMain` 之後畫，所以 live 的格子拿得到這一格的 3D 畫面。2D 的鏡頭通常寫 `lb: false`（漫畫頁要滿版）。

- `st`：`{ page, bg, pg, shake, els }`
  - `page`：同一頁的名字。連續幾鏡的 `st.page` 相同時共用舞台（定格的格子、立繪演員都留著），元素的時間從這一頁的第一鏡算——一頁三格就是三個鏡頭（各拍各的 3D）共用同一個 `st` 物件。
  - `bg`：顏色／`{ grad: [上, 下] }`／`{ art: 程式插畫, ...參數 }`；沒有＝透明（看得到 3D）。
  - `pg.keys`：`[{ t, x, y, z, r }]` 整頁的鏡頭（在格子之間平移、推近；x、y 是舞台座標的中心）。`shake`：`[[t, 強度, 秒], …]`。
- 元素（`els`，依序畫；共通的 `t0` 出現、`t1` 收掉、`in`：drop 落下／up／left／right 滑入／stamp 蓋章／pop／fade、`ind` 出場秒數、`a` 透明度、`gco` 混合模式）：
  - `panel`：`q`＝[x, y, w, h] 或點陣列（斜切的格子），`bd` 白邊寬（0＝沒有框）、`fill`、`art`＋`ao`＋`kb`（程式插畫與推近）、`live`（即時的 3D：渲染器的畫布 cover 對齊格子，`focus` 對準哪一點、`lz`、`zoom`；`snap`＝這個時間定格，之後 3D 鏡頭可以去拍別的格子；`cam`＝這一格自己的鏡頭（和鏡頭的 `cam` 同樣的寫法，keys 的時間＝這一頁的時間）：每一格換成自己的鏡頭各畫一次 3D 再複製進格子，所以一頁好幾格可以同時是即時的——一格多畫一次整個場景，同時即時的格子以 2～3 格為限）、`flt`（canvas 濾鏡：`grayscale(1) contrast(6) invert(1)`＝反白線稿的衝擊畫格）、`tone`（單色：保留亮度換成這個顏色）、`dots`（網點）、`vig`（暗角）、`kids`（裁在格子裡的子元素）。
  - `actor`：立繪演員（`render/portraits.js`，分層動畫、眨眼、對口型）。`who`、`sp`（說話者，預設＝who；例：echo_true 的立繪接 echo 的台詞）、`pose`、`expr`、`at`＝[中心 x, 主圖底部 y]、`h`＝主圖高度（832×1216 的比例）、`mirror`、`dim`（沒說話的人變暗）、`tone`、`holo`（全像：加色、掃描線、閃爍）、`s`＝`[{ t, pose, expr, act, at, h, dim, mv }]`。換姿勢＝保持＋兩格模糊的過渡格（各 1/12 秒），之後依角色個性表（`data/cine/persona.js`：heavy 先頓一下、light 彈一下）到位。3/4 側的姿勢（p3／p4）有全部表情，其他姿勢只有平常的臉（姿勢本身就是演技）。
  - 氣泡：字幕（`ev` 的 `sub`＋`who`）的說話者是舞台上的演員時，字幕條不顯示、改成他頭旁邊的氣泡（語音、字幕語言、「字幕不顯示」照舊；`bub`＝相對臉的位移、`bubW` 寬、`bubSide`、`noBub`）；說話的演員對口型（語音的音量，沒有語音時模擬）。`bubble` 元素＝沒有語音的氣泡（`s`、`name`、`color`、`at`、`tail`、`w`）。
  - `text`：狀聲詞與大字（`s`、`at`、`size`、`color`、`stroke`（null＝不描邊）、`font` sfx／title／mono、`al`、`rot`、`ls` 字距、`sub`）；`in: 'stamp'` 之後抖一下。
  - `block`：PV 的色塊（`q`、`color`、`in: 'wipe'` 由左往右展開；`live` 也可以，例：`gco: 'multiply'`＋`flt: 'grayscale(1) contrast(14) brightness(1.5)'`＝把 3D 變成剪影乘上底色）。
  - **場景插畫** `img: '<章>/<id>'`（第 2 期，`scripts/cine-art.js` 或角色產生器的「場景插畫」分頁產生，`src/assets/cine-art/<章>/<id>.webp` → `dist/lib/cine-art-<章>.js`，`cinePlay` 時和立繪一起載入）：`panel`、`art` 元素與 `bg` 都可以寫，cover 對齊（`focus`＝圖的哪一點對準中心，`kb` 推近）。插畫優先：有圖時不畫同一格的 `art` 與 `live`（它們是沒有圖時的代替）；立繪演員的 `unless: '<章>/<id>'`＝那張插畫載入了就不畫（插畫裡已經有這個角色）。
  - `art`：程式插畫（`render/cine-art.js`：office 夜裡的辦公室、desk 辦公桌與舊合照、cockpit 駕駛艙（擋風窗挖空透出 3D）、focus 集中線、speed 速度線）；第 2 期的場景插畫完成後換成產生的圖。
  - `lines`：集中線／速度線（`kind`、`q`、`color`、`n`、`r`）。
- **卡點**：`data/cine/beats.js`（`python scripts/cine-beats.py` 以 librosa 量每首配樂的拍點，曲子換了要重跑）的 `beatAt(曲名, 第幾拍, off, at)`／`snapBeat(曲名, 秒, off, at)`：劇本把格子落下、蓋章、爆炸對齊拍點（例：第 1 章開場的 `pb(t)`＝漫畫頁第 t 秒之後最近的拍點）。
- 立繪在 `cinePlay` 等配樂時一起載入（`cine2dPreload`）。第 1 章開場（`data/cine/ch1-intro.js`）是第一段用它的劇本。

## 序章（`data/cine/prologue.js`，約 2 分 12 秒）

| 時間 | 段落   | 內容                                                                                                                                                                                                                                                                                       |
| ---- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0:00 | 訊號   | 黑畫面、紅色波形、三張字卡                                                                                                                                                                                                                                                                 |
| 0:13 | 軌道   | 行星（夜側的深脈紅色脈絡）、碎片帶、太陽能環、斜插的軌道電纜；機器文字「CYCLE ████ TERMINATED」                                                                                                                                                                                            |
| 0:22 | 軌道站 | 外殼的推軌、艙口的燈轉紅；軌道站語音「第 ██ 週期，終了」「投放程序，開始」                                                                                                                                                                                                                 |
| 0:30 | 投放   | 夾爪鬆開、推進器點火；「投放座標：南部荒野」                                                                                                                                                                                                                                               |
| 0:34 | 墜落   | 從上方看空降艙墜向雲層                                                                                                                                                                                                                                                                     |
| 0:38 | 突入   | 電漿外殼、速度線、震動；0:45.8 配合配樂最強的一擊閃白                                                                                                                                                                                                                                      |
| 0:46 | 世界   | CORAL 字卡 → 四家委託方與軌道站的空景（每 3 秒，對齊配樂的脈動）：卡斯特隆的 MT 縱隊、戰車、重型 MT 砲擊、直升機、起重機砲台；艾瑟立克的無人機、雷射網、護盾產生器、實驗體；維爾威的運輸機、直升機編隊、宇宙用 MT、試車台噴火；聖域的盾牌 MT、修理無人機、友軍；軌道的真空作業機、標定衛星 |
| 1:05 | 傭兵   | 「他們都需要同一種東西。不問理由的傭兵。」                                                                                                                                                                                                                                                 |
| 1:09 | 甦醒   | 駕駛艙開機（HUD 逐塊亮起）→ 墜落現場、機體站起來；ECHO 第一次通訊                                                                                                                                                                                                                          |
| 1:18 | 蒙太奇 | 水壩（MT 部隊、SLUICE）→ 夜間鐵路（武裝列車 IRON CITADEL）→ 冰原（巨型鑽地蟲；SPECIMEN 的追尾視角對射：右肩後方的鏡頭、鎖定框與 HUD、快速推進閃避、導彈命中的慢動作與失衡）；越剪越快、閃白轉場                                                                                            |
| 1:45 | ZENITH | 黑畫面後紅色天空下的 ZENITH 特寫（配樂換成鋼琴的 ident）                                                                                                                                                                                                                                   |
| 1:59 | 收尾   | 紅色天空下的剪影、Logo「MECH CORDON」、ECHO「照你的節奏來」                                                                                                                                                                                                                                |

過場改版第 4 期（2D 舞台）：0:50 的世界觀改成 PV 式（每張空景一側是委託方的色塊、代表人的剪影與大字，`pvStage`），1:12 的 ECHO 第一次通訊改成駕駛艙裡的全像立繪＋氣泡（第 3 周目是 echo_true）。

周目差別（`TXT`）：字卡、機器文字、開機的登錄號、ECHO 與 ZENITH 的台詞、最後一句（第 2 周目沒有「照你的節奏來」，改成旁白；第 3 周目「這一次，照我們的節奏來」）。

## 各章開場／章末與抉擇演出（過場改版，docs/cine-redesign-design.md）

**全部重製成新格式**（2026-11-14 使用者：「這專案是重製過場動畫」——舊的第二版 3D 演出（每章一種導演風格，`ch2.js`～`ch7.js`、`game/cine-c2.js`～`cine-c6.js`、模板 `BEATS`）都已刪掉，不在舊演出前後加東西）：

- **第 1 章開場**：`data/cine/ch1-intro.js`（第 1 期的試做，約 86 秒）：赭紅單色的天線插畫 → 一頁三格的動態漫畫（3D 進格子、各格自己的鏡頭）→ 夜裡辦公室的對話分格（霍斯特與 ECHO）→ 霍斯特一個人的插畫 → 3D 機甲（突擊推進、砲擊預警、駕駛艙裡 ECHO 的全像、反白的衝擊畫格）→ PV 式章名卡。場景與調色在 `ch1.js`，效果在 `game/cine-c1.js`。
- **其他章的開場與章末**：`data/cine/chfilm.js` 的 `FILMS`（`chapters.js` 的 `chapterCine` 分派），用 `data/cine/film.js` 的段落組成：開場＝B（地點的固定插畫＋地名 → 局勢的漫畫頁 → 委託方與 ECHO 的對話分格 → 宿敵登場的 PV → PV 章名卡），章末＝A＋C（對話分格 → 後果的漫畫頁 → ECHO 的通訊）。台詞＝`data/story.js` 的 `CHAPTER_TEXT`（依抉擇 `pickLines`；還沒抉擇時用第一個選項），旁白是 narr 的語音、角色的台詞是立繪＋氣泡；插畫在 `src/assets/cine-art/c<章>/`（第 2 期的流程產生）。
- **film.js 的段落**：`page`（漫畫頁：2～4 格，格子落在配樂的拍點上，頁面鏡頭跟著說話的格子；格＝插畫或立繪＋一句，`out` 說完就斷訊變黑）、`still`（整張的固定插畫＋旁白，`loc` 地名）、`talk`（talks.js 的對話分格）、`echo`（ECHO 的通訊，第 3 周目是 echo_true）、`rival`（宿敵的 PV 名牌）、`title`（PV 章名卡）、`card`（黑底大字卡）、`live`（照原樣的 3D 鏡頭）。新增一段過場時照這個寫。
- **抉擇演出**：選前 `x_<抉擇>_pre`＝`choice-anime.js` 的 `choicePreAnime`：兩邊委託方的立繪從左右撞進來 → 各自在自己的室內正反打（`talks.js` 的 `pre_c2`／`pre_c4`／`pre_c6`；ZENITH 在方舟的甲板）→ 目前的戰場上從主角身後看向出口的光柱與倒數（`cinePlay(..., { live: true })`：場景 `{ k: 'live' }`、演員 `player`、`{ ex: i }`＝第 i 個出口、`ov: 'choice'`；過場劇場在代替的地圖上由 `cineStandIn` 擺主角與出口）。選後 `x_<抉擇>_<選項>`＝`choice-anime.js` 的代價蒙太奇（3D 的地點或委託方的室內＋插畫格，一鏡一句）＋大字卡，播完到轉場畫面（選後要先建 3D 的地點，在任務中播也一樣預先準備）。接在 `campaign.js` 的 `campChoiceCine`；多人、劇情動畫關閉時不播。
- **記憶片段與真結局**：`data/cine/memory-anime.js`：每一片一個相關的 3D 地點（荒野的天線、水壩、研究所、宇宙港、辦公室、中樞、熔爐帶、方舟；真結局＝高空軌道），3D 一拍三；舞台以 `LIVE` 把 3D 拷貝進來、灰階後乘上亮色（舞台底色）、再以暗色濾色＝雙色調；ECHO 真實的樣子（echo_true）的雙色調立繪與單色的插畫格疊在上面。
- 章節回顧（`storyUnlocked`）：看過的＋依進度開放的（序章、到目前章節的開場、完成的章的章末、以前周目的全部）。改台詞改 `data/story.js`（文字畫面與過場動畫共用；句數改了要一起看 `chfilm.js` 用到第幾句）。
- `kit.js` 只剩小工具（`W`、`timeline`、`lineDur`、`parseLine`）。

## 測試與調整

- 冒煙測試 `testCine`：36 段劇本都產生得出來、序章播到結束、各段落的截圖（`test-results/cine-*.png`）、長按略過、作戰室的接續（略過 → 文字畫面）、設定關閉、手機橫式、過場動畫劇場（清單、代替的戰場、暫停、下一鏡、返回清單）。
- 臨時劇本：`?test` 時 `window.__CINES` 是目錄，可以放一個臨時的鍵再 `cinePlay`。
- 調運鏡（或直接用標題的「過場動畫」劇場）：`?test` 開啟後在主控台 `__game.cineTest = 1; __game.cinePlay('p1')`，`__game.cineSeek(秒)` 跳到指定時間；`cineTest` 是沒有配樂時的倍速。
