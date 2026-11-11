# 渲染風格「絕區零」的參考圖

`docs/zzz-style-design.md` 的比對用。2026-11-11 使用者決定放進版本庫（換電腦直接 pull 就有）。
這些是《絕區零》（HoYoverse）的遊戲畫面，**只用來比對光影、配色與畫面的感覺**，不放進遊戲、不照抄 UI 與素材。

`scripts/style-shots.js` 產生的比較頁（`test-results/style-shots/<tag>/index.html`）最上面會列出這個資料夾的圖。

## 檔名

| 開頭 | 內容 |
|---|---|
| `combat_*` | 戰鬥中的畫面（第三人稱的鏡頭、敵人、特效、HUD） |
| `explore_*` | 街道、室內的探索畫面（場景的著色與配色） |
| `scene_*` | 場景的截圖（沒有戰鬥：光影、天空、大氣透視） |
| `enemy_*` | 敵人（以骸、機械類、人型）的配色 |
| `fx_*` | 衝擊畫格、連攜、斬擊的特效 |
| `comic_*` | 官方活動插圖（網點、漫畫風的演出參考） |
| `cutin_*` | 劇情對話的分格（立繪計畫也可以參考） |

## 來源

- 影片畫格（YouTube 的無解說實況，1080p 抽格）：
  - `CuBcf2RnCEM`（限時活動）：combat_street_*、fx_chain_attack、fx_slash_white
  - `tGtx2Yg_Mt0`（4K 實況 007）：combat_hollow_ethereal_purple、combat_dark_*、explore_street_night
  - `5_cfHFC_FbU`（2.0 新角色試玩）：combat_vr_room_*、fx_impact_frame
  - `oHLlUCqN8mE`（PS5 4K）：combat_railway
  - `aLZWndeF0TM`、`D3rRBFLJKTk`、`G3POwd_VEA4`、`iV2DxiVy4ls`、`q5x9Pscw9q0`（主線實況）：其他的 combat_*、explore_*、cutin_*
  - 網址：`https://www.youtube.com/watch?v=<上面的 id>`
- 維基（https://zenless-zone-zero.fandom.com/ 的圖片）：scene_*（Hollow Construction Site Screenshot、Area Sixth Street、Scott Outpost Outpost Area、Area Brant Street Construction Site）、enemy_*（Mushussu In-Game 01、Autonomous Assault Unit - Airspace Sentinel、Hollow Thug - Pyromaniac）、comic_*（Combat Footage Review 活動圖）

## 量化的目標（中央區域，避開 HUD；`docs/zzz-style-design.md` 第二節）

戰鬥與街景 8 張的平均：亮度 0.41、亮度標準差 0.13、飽和度 0.28；暗部（最暗 25%）亮度 0.27、略偏冷（R−B −0.03）；亮部（最亮 25%）亮度 0.58、略偏暖（R−B +0.05）。
