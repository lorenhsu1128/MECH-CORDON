# 自由出擊的作戰設定（所有關卡與所有模式）

2026-11-09 定案。讓自由出擊玩得到主線的所有地圖、區段類型、對手與主線出擊本身。

## 定案

- **全部一開始就開放**（不看主線進度、不看遇過沒有）。
- **等級與獎勵**：模式「戰鬥（依等級）」＝原本的自由出擊（`startMission`，打完推進 `save.level`）；
  其他模式可以手動選等級（1～目前等級），獎勵照模式給、**不推進等級**。
- **主線系統全帶**：戰術模組（從零開始，同作戰紀錄的重打 `camp.rmods`）、敵人詞綴、宿敵、僚機、委託板的規則、危險條款。
- **主線的出擊本身**也能玩（「主線出擊重現」：任何一個 `SORTIES`，不播劇情、不寫主線進度）。
- **介面**：獨立的「作戰設定」畫面（`state` 'freeops'，`#freeOps`），機甲庫只顯示一行摘要與「作戰設定」按鈕。
- 多人在第 5 期（大廳的房間模式「任務」）。

## 做法：沿用主線的區段流程

委託板已經把委託登記成 `SORTIES` 的不可列舉項目（`jb_<id>`）照用整套主線流程。自由出擊同樣把作戰設定組成
臨時的出擊 `fr`（`data/free-ops.js` 的 `freeSortie`，`SORTIES.fr` 不可列舉、每次出擊覆寫），`campBegin(sid, { free })`：

- `camp.free`＝作戰設定（`camp.replay` 同時為 true，沿用重打的隔離：模組從零開始、抉擇不寫進存檔、沒有章節卡）。
- 紀錄點不寫 `save.story.sortie`（主線進行中的出擊不受影響）：`campCkGet()`／`campCkSet()` 在自由出擊時改用記憶體的
  `this.freeCk`，關掉網頁就沒有。
- 不播通訊（`campComm` 回 null）、抉擇演出、章末、結局；不算完成次數、不寫 `story.recent`、不算整章完成、不回收記憶片段。
- 結果畫面的「確定」回機甲庫；失敗畫面的「回作戰室」換成「回機甲庫」（放棄這次出擊）。
- 獎勵：完成報酬＝`(2000＋2000×等級)×段數`（約等於主線同等級的出擊）×危險條款倍率；經驗照主線的算法。

## 作戰設定（localStorage `rubicon_freeops`，`data/free-ops.js` 的 `foSanitize`）

| 欄位                                   | 內容                                                                             |
| -------------------------------------- | -------------------------------------------------------------------------------- |
| `mode`                                 | `level` 戰鬥（依等級）／`seg` 單一區段／`chain` 連續出擊／`sortie` 主線出擊重現  |
| `type`                                 | 區段類型（`SEG_TYPES` 全部，補給只出現在連續出擊；空戰只有單人）                 |
| `theme`、`variant`                     | 主題（空＝隨機）、變體（空＝隨機、`base`＝標準，可以選交界變體）                 |
| `landmark`                             | 空＝隨機、`none`＝沒有、其餘＝地標 key                                           |
| `tod`、`weather`、`zone`、`depth`      | 時間、天候（空＝主題預設、`none`＝晴朗）、作戰區域形狀、深度（垂直主題）         |
| `boss`                                 | Boss 區段：空＝隨機，數字＝`BOSS_DEFS` 的索引（`'#<索引>'` 給 `bossOf`）；`echo` |
| `ace`                                  | 精英區段：空＝主題的專屬 AC，`a:<ACES>`＝專屬 AC，`r:<AC_ROSTER>`＝具名 AC       |
| `level`                                | 1～`save.level`                                                                  |
| `n`、`segs`                            | 連續出擊：段數 2～5、每段的設定（`chainRandom`＝隨機排程）                       |
| `sid`                                  | 主線出擊重現的出擊                                                               |
| `rule`、`heat`、`affix`、`nem`、`wing` | 委託板的規則、危險條款、詞綴（off／auto／all）、宿敵、僚機                       |

模式與地圖不合時（護送、追擊要公路；武裝列車要鐵路；主題的 `bossBan`；空戰換成空域）由 `foResolveSeg` 換成合適的地圖並提示。

## 分期

1. 骨架：作戰設定畫面、`fr` 臨時出擊與隔離、基本類型（戰鬥、精英、破壞、防衛、護送、突破、情報、Boss）、主題與變體、等級。
2. 擴充類型（潛入、撤離、追擊、戰線、巨兵、空戰）、指定 Boss（28 隻＋殘響化）與精英的 AC。
3. 地圖細項：地標、時間、天候、深度、作戰區域形狀、交界變體。
4. 連續出擊（2～5 段，出口、轉場、整備）、規則類（委託板規則、危險條款、詞綴、宿敵、僚機）、主線出擊重現。
5. 多人：大廳的房間模式「任務」，房主的作戰設定隨大廳同步，房主出擊時 `foBegin`，臨時出擊的定義隨紀錄點送給客機。
6. 冒煙測試 `testFreeOps`（單人）與 `testFreeOpsMp`（`?lan=local` 兩分頁）。

## 實作紀錄

- 第 1～4 期一次做完（2026-11-09）：
  - `data/free-ops.js`：選項表、`foSanitize`、`freeSortie`（臨時出擊與排程）、`foReward`、`foChapter`（等級 → 章，詞綴機率與 Boss 刁鑽度用）。
  - `game/free-ops.js`：畫面（`renderFreeOps`、`foSegHtml` 等）、機甲庫的摘要 `garageOpsUi`（單人時機甲庫設定頁的地圖選單隱藏，
    「依等級」的地圖與變體改在作戰設定裡選，仍寫 `rubicon_map`／`rubicon_variant`）、決定區段 `foResolveSeg`、`foBegin`。
    機甲庫的「出擊」經過 `freeGo`。
  - 主線端的改動：`campBegin` 的 `o.free`／`o.plan`／`o.types`；紀錄點 `campCkGet`／`campCkSet`；
    `campEnd`、`campFail`（`campFailBtns`）、`campQuitAsk`、`campChoiceCine`、`campComm` 的自由出擊分支；
    精英的 `seg.acr`（具名 AC）；`campRule` 也看 `camp.free.rule`；借用的機體在主線出擊重現時用 `camp.free.asm`；
    宿敵 `nemOn` 在作戰設定開了時才有；據點的模組箱自由出擊也有；詞綴 `afApply` 看 `camp.free.affix`。
  - 危險條款 `HEAT` 從 `game/sim.js` 搬到 `game/constants.js`。
  - 連續出擊的隨機排程：第一段戰鬥、中間的段由出口在一般類型裡選（區段的 `pool`）、最後一段 Boss／精英／巨兵。
  - 完成時沒有結果畫面的模組三選一與傳說模組（`replay` 的規則），模組只在出擊中有效。
- 2026-11-09 使用者回報作戰設定的按鈕不顯眼：機甲庫的摘要改成「作戰卡」（`#btnFreeOps`，出擊鍵正上方、同寬 `min(300px, 44vw)`、
  左邊橘色邊條，上行模式、下行內容、右邊「⚙ 變更」，整張可以點）。
- 第 5 期（多人）：大廳的房間模式 `ops`「任務（房主的作戰設定）」：房主按「作戰設定」開同一個畫面（`openFreeOps('lobby')`：
  沒有「依等級」、空戰、僚機與宿敵，按鈕回大廳），摘要 `pvpSet.foSum` 隨大廳同步；`startMission` 轉給 `foBegin`。
  紀錄點的 `cck` 多帶 `free` 與 `fr`（臨時出擊的定義），客機登記成 `SORTIES.fr`，房主遷移時 `campPromote` 接手。`NET_VERSION` 11.37。
