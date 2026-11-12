# 地圖預覽器（標題的「地圖預覽」）

2026-11-12 使用者定案。用途：檢視各地圖主題的地圖、地圖物件、敵人（含 Boss）的外觀、建模與特效搭不搭，同時看畫面的渲染效能，方便一起找效能問題。

## 定案

- **方案二：獨立的地圖預覽器**（不塞進渲染風格實驗室）。標題頁一個按鈕進入，`state` 'play'＋`this.mapv`（`game/map-view*.js`），不寫存檔、不給經驗與掉落。
- 敵人預設**實戰編成**（照真的任務抽），可以切換**圖鑑排列**（這個主題會出現的每一種一台，排成一排、AI 停住）。
- **Boss** 做到可以切換型態、觸發大招、打出失衡（連部位、場地效果、刁鑽度）。
- 效能面板做到**場景分類＋可以隱藏某一類**（找出拖慢的是哪一類）。
- **平板與手機橫式也要能完整操作**（觸控：單指拖曳旋轉、雙指縮放與平移、面板可收起；手把照 `pad-ui.js` 的規則）。
- 方案三的自動巡檢（全部主題 × 變體截圖＋效能報告）等前四期做完再決定。

## 畫面

- 左側面板 `#mvPanel`（可收起，手機橫式預設收起）：地圖、敵人、Boss、畫面設定、效能分類，分頁切換（`data-padtabs`）。
- 上方列 `#mvBar`：鏡頭、暫停、速度、重新產生、收起面板、返回標題。
- 效能 `#mvStat`：右上角，FPS、每格毫秒、走勢圖、繪製次數、三角形…（第 4 期加分段與卡頓）。

## 地圖

主題（15 種；空域另外）、變體（`VARIANTS`）、地標（`LANDMARKS`）、種子（輸入／上一個／下一個／亂數）、時間（`tod`：白天／黃昏／夜間／黎明）、天候（主題預設／無／雪／沙／塵／雨／灰／珊瑚）、大小（大地圖＝一般戰鬥 `big`＋`edge`、標準 230 m、Boss 關的開闊 `open`）。參數改了停手 0.4 秒重新產生（建地圖前先畫一格「生成中…」）。看過的地圖留縮圖歷史（第 4 期）。重現主線出擊：選出擊與第幾段，照 `planSortie` 產生同一張地圖（第 4 期）。

## 敵人

- **實戰編成**：`rollComp`＋`foeMix`＋`spawnComp`（等級可選），連據點守衛、地圖裝置、小人、運輸車輛；增援波次照常派出。
- **圖鑑排列**：這個主題的專屬敵人（`FOES` 的 `theme`）＋一般敵人類型（`ENEMY_TYPES`）＋這個主題的專屬 AC（`THEME_ACE`），每種一台排成一排，AI 停住、無敵。
- 開關：AI 開／停、敵人無敵、遊戲速度、下一台（鏡頭對準）、點選看資訊（名稱、類型、模型槽、三角形與網格數、材質數）。
- **Boss 擂台**：任選一隻（`BOSS_DEFS`，刁鑽度可選），換成 Boss 關的開闊地圖；按鈕：下一型態、觸發大招（`tierTick` 的蓄力／`boss3Tick` 的專屬招式）、打出失衡、打壞部位、回滿。
- **交戰**：友軍一隊（藍隊）或自己操作的機體和敵人打，看子彈、爆炸、特效。

## 視野

自由飛行（WASD／拖曳／滾輪；觸控單指旋轉、雙指縮放平移）、環繞目標、全圖俯視、電影（自動環繞與切換目標）、遊戲的三種視角（俯視、追尾、第一人稱：操作一台無敵的玩家機體）。俯視全圖與自由鏡頭拉遠時霧往外推（`camExtra`）、鏡頭的 far 加大。渲染風格可以切換與左右比較；畫面設定（解析度、陰影、水面、砲火特效、SSAO…）當場切換。

## 效能

- 基本：FPS、每格毫秒（平均、最差）、最近 10 秒走勢、繪製次數、三角形、著色器程式、幾何、貼圖、JS 記憶體、實體數、粒子數。
- 分段：主迴圈各段的耗時（AI、投射物、特效、算繪…）。
- 卡頓紀錄：兩格間隔 50 ms 以上，附原因（著色器編譯、GC、生成）。
- **場景分類**：依類別拆繪製次數與三角形（地形、地圖物件、地標、遠景、水面、敵人、Boss、玩家與友軍、小人、特效、天氣），每一類可以隱藏，看 FPS 差多少。
- 顯示卡時間（`EXT_disjoint_timer_query_webgl2`，不支援時不顯示）。
- 匯出：地圖參數＋效能數字複製成文字／下載 JSON。

## 分期

| 期 | 內容 |
|---|---|
| 1 | 標題按鈕、畫面骨架、選地圖（主題／變體／地標／種子／時間／天候／大小）、自由飛行／環繞／全圖俯視、基本效能面板、觸控操作 |
| 2 | 敵人：實戰編成、圖鑑排列、AI 開關、無敵、下一台、點選資訊；遊戲的三種視角 |
| 3 | Boss 擂台（型態、大招、失衡、部位）；交戰；渲染風格切換與左右比較；畫面設定即時切換 |
| 4 | 效能的分段、卡頓紀錄、場景分類與隱藏、顯示卡時間、匯出；縮圖歷史；重現主線出擊 |

每期：三種畫面大小（1920×1080、1180×820 觸控、844×390 觸控）截圖、冒煙測試 `testMapView`、build＋commit＋push。

## 實作紀錄

- **第 1 期（完成）**：`game/map-view.js`。標題的「地圖預覽」（`#btnMapView`）→ `openMapView`（`srvGate` 之後）：`this.mapv`＝{ `p` 地圖參數（記在 localStorage `mech_cordon_mapview`）、`cam`、`F` 鏡頭的球座標（中心點、yaw、pitch、距離）、`st` 效能取樣 }，主迴圈在 `this.lab` 之後呼叫 `mapvTick`（`renderer.info.autoReset` 關掉、每格開頭 reset，所以多次算繪的繪製次數都算進來）。`mapvBuild` 照自由出擊的參數建 World（大地圖＝`big`＋`edge`、Boss 關＝`open`）＋一台無敵的玩家機體（尺寸參考）；參數改了停手 0.4 秒、先顯示 `#mvBusy` 再建。鏡頭三種：自由（WASD、Q／E 轉、Shift 加速）、環繞、全圖（正上方、距離＝地圖大小），霧以 `camExtra` 往外推、`camera.far` 900×DS（離開時還原 400×DS）、陰影範圍跟著距離。輸入：canvas 的 pointer events（滑鼠與觸控同一套：單指／左鍵旋轉、右鍵或雙指平移、滾輪或雙指縮放；`setPointerCapture`），`input.js` 的 mousedown 在 `this.mapv` 時不處理，鍵盤先問 `mapvKey`（H 面板、P 暫停、G 重新產生、[ ] 種子；Esc 照常開暫停選單，`btnAbort`＝「離開地圖預覽」）。效能 `#mvStat`：FPS（綠／黃／紅）、每格與 CPU 的平均與最差、走勢圖（約 4 秒）、繪製、三角形、著色器、幾何／貼圖、JS 記憶體、實體、粒子、解析度；`body.mapv` 隱藏任務的 HUD 與 `#fps`。手機橫式預設收起面板。冒煙測試 `testMapView`。
- **第 2 期（完成）**：`game/map-view-foes.js`。`mapv.f`＝{ mode real／gallery／none、lv 等級、ai、god 無敵、extras 據點／裝置／小人／車輛、all 全部生成、waves 增援、kinds 圖鑑的種類 }，改了就整張重新產生（同一個種子）。實戰編成＝`rollComp`＋`foeMix(…, onlySeen false)`（主題的專屬敵人全部算）＋`spawnComp`，`all` 時 `mapvWakeAll` 把遠處的敵群（`encWake`）與據點守衛排進生成佇列；圖鑑排列＝`mapvGalleryList`（主題專屬＋專屬 AC＋一般敵人類型，每種一台、`spawnType(t, 1, 1, at, 1)`）排成 6 欄的格子、面向出生點、AI 預設停住（`mapvIdle`：照常 `move` 零向量播待機動作，部位不動）。`mapvSim` 是任務中那一段的精簡版（玩家與無敵的敵人每格補滿 AP；AI 開著時才跑攻擊權杖、遠處敵群、增援、地圖裝置；沒有勝敗）。生成時 `introSeen` 先填滿（不跳新類型的提示）、`spawnType` 的 `simMark` 在預覽器不記（不寫遇過的專屬敵人）。目標：上方列的 ◀ 名稱 ▶（B／N）、敵人分頁的分組按鈕、點畫面上的敵人（射線找所屬實體，沒打到網格時取畫面上 40 px 內最近的）；有目標時中心點跟著它，自由鏡頭按 WASD 放掉；資訊＝名稱、類型、AI、模型（`opts.modelKind`／`vehKey`）、網格／三角形／材質（`mapvMeshStats`）、AP、弱點。新鏡頭「電影」（環繞目標、8 秒換下一台）。「操作」（`mapvSetGame`）：`body.mvGame` 顯示任務的 HUD 與觸控按鈕、`updatePlayer`＋`updateCamera`＋`drawHud`，V 照常切換視角，指標與按鍵（H 以外）交回任務的輸入；進入時面板自動收起，矮螢幕的效能只留 FPS。離開操作時恢復進入前的面板狀態。
- **第 3 期（完成）**：`game/map-view-boss.js`。敵人模式多一個「Boss 擂台」：`f.boss`（`BOSS_DEFS` 的索引）、`f.tier`（'auto'＝依自由出擊的 `freeTier`、0＝不套用、1～8），`mapvBuild` 換成 Boss 關的開闊地圖（`open`、武裝列車 `rail`），這隻 Boss 不排在選的主題（`bossBan`、要鐵路）時用 `mapvBossTheme` 換一個並在面板註明；`spawnBossDef` 生成、`#bossBar` 給操作模式的 HUD。`mapvSim` 在 AI 開著時跑 `bossPhaseTick`（換型態的演出與增援）；「敵人無敵」對 Boss 不補 AP（要看型態），只保留 2% 不會被擊破。按鈕（`mapvBossAct`）：下一型態（這個型態的大招算放過、拿掉裝甲殼、AP 落到下一個門檻底下）、大招（`bt.cdI = 0` 馬上蓄力；蓄力中＝`ch.t = ch.T` 立刻放出）、打斷大招（`tierInterrupt`）、打出失衡（直接過載：`acs`、`tierStagT`，不經過 takeDamage，否則護盾與部位減傷會擋掉）、打壞部位（`opts.parent` 是這隻的第一個部位）、回滿（`phDone`、`bossAdds`、`bt` 的閘門紀錄歸零）；面板 `#mvBossInfo` 每 16 格更新型態、AP、失衡、蓄力的進度、裝甲殼、部位數、刁鑽度。友軍 `f.allies`（0～4 台藍隊的具名 AC，無敵）。分頁「畫面」：渲染風格（`mapv.style`，只在預覽器：`mapvApplyStyle` 改 `this.styleP`，`mapvBuild` 用它取代 `styleRefresh`，離開時 `styleRefresh` 還原）、左右比較（`mapv.cmp`，`renderMain` 的比較參數也接受預覽器的）、解析度（`StyleStore.setRes`，遊戲的設定）、「完整的畫面設定…」（`state` 改成 'pause' 後 `openSettings('pause', 'gfx')`，關掉回暫停選單、繼續回預覽器）。**預覽器不寫存檔**：消耗品不能用、素材與 COAM 的掉落不產生（彈藥箱照常）、主線通訊 `campComm` 不播、Boss 改版的第一次說明 `tierIntro` 只記在 `mapv.intro`（以前會寫 `save.tierSeen`）；冒煙測試比對離開前後的存檔。
- **第 4 期（完成）**：`game/map-view-perf.js`，分頁「效能」。`mapv.pf`＝{ acc 分段的累計、seg 平均（模擬、其中的 AI 與特效、算繪、HUD）、hitches 卡頓、hide 隱藏的類別、cats 分類統計、gpu 顯示卡查詢 }（`mapvPerfReset`）。`mapvTick` 在 `mapvSim`、`renderMain`、HUD 前後記時間，`mapvSim` 另記 AI 迴圈與 `fx.update`。**場景分類**（`mapvCatOf`）：場景頂層的物件 → 類別：敵人與部位（`opts.parent` 是 Boss 的算 Boss）、玩家與友軍、車輛（`v.mesh`）、小人（`crowd.mesh.group`）、地形（`terrainMesh`、`decorG`、`roofMesh`）、水面（`waterMesh`）、天氣（`weather.points`）、地圖物件（`props` 的 `ob.group`，合併池 `poolG`／`pillarG`）、地標、遠景（World 生成時在這些群組加 `userData.cat`：'prop'／'lm'／'far'）、其他的 `world.meshes`＝大型結構、剩下的＝特效與其他；`mapvCatStats` 每秒走訪一次（`traverseVisible`，以鏡頭的視錐判斷畫面內，網格數≈繪製次數、三角形含 InstancedMesh 的數量）。**隱藏**：`mapvHideBegin`／`mapvHideEnd` 只在 `renderMain` 前後把那一類的頂層物件設成不顯示再還原（遊戲邏輯與 `visible` 的狀態不受影響）。**顯示卡時間**：`EXT_disjoint_timer_query_webgl2` 的 TIME_ELAPSED 包住 `renderMain`，同時只有一個查詢，結果出來才發下一個（不支援時顯示「不支援」）。**卡頓**：兩格間隔 50 ms 以上，和上一格比較著色器程式數、JS heap（GC）、實體數（生成）、幾何與貼圖（建模），產生地圖後 6 秒內的標「新地圖（預熱與第一次畫）」；最多 30 筆。**匯出**：`mapvReport`（地圖參數、敵人、畫面、FPS、分段、顯示卡、繪製與三角形、分類、隱藏、卡頓、UA）→「複製報告」（文字）／「下載 JSON」。**縮圖歷史**：產生地圖後畫面穩定（預熱完、20 格）從 canvas 拍 160×90 的 JPEG，最多 8 張、同參數只留一張，點一下套回參數並重新產生。**重現主線出擊**：地圖分頁的「主線出擊」（`SORTIES`，不含自由出擊的 `fr`）、第幾段、區段類型（`seg.pool`，不含空戰）：`planSortie(so, makeRng(種子))` 排出整次出擊、取那一段的排程，`campSegWorld` 換成 World 的參數（作戰區域、變體、地標、時間、天候、深度、大地圖、Boss 的開闊），區段的種子＝種子＋段×7919；Boss 區段在實戰編成時生成 `sortieBoss` 的那一隻（`mapv.sBoss`）。
