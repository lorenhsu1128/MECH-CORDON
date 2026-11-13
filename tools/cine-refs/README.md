# 過場改版的參考截圖（《絕區零》的過場、PV、對話場景）

2026-11-11～12 寫過場改版提案（`docs/cine-redesign-design.md` 第一～五節）時抓的參考畫面，原本放在 Claude 的暫存資料夾，
交接時（2026-11-13）搬進來。只當作內部的參考，不放進遊戲。

| 資料夾／檔案 | 內容 |
| --- | --- |
| `frames/<影片 ID>_<秒數>.jpg` | 從 YouTube 的實況影片每隔一段時間抓一格（`grab.py`：yt-dlp 取串流網址＋ffmpeg 抓單格），124 張 |
| `video-sheets/` | 下載下來的官方影片各拼成幾張總表（`ellen_demo_*`、`ellen_teaser_*`、`jane_*`、`ps_*`、`story_*`、`storyT_*`），`motion_comic.jpg`／`motion_dialog.jpg` 是動態漫畫與對話分格的代表畫面 |
| `sheets/` | 寫提案時拼的其他總表與截圖 |
| `proposal/` | 提案成果頁的原始檔（`prep.js`＋`tpl.html` → `cine-proposal.html`，`assets.json` 是內嵌的圖） |

**frames 的來源影片**（YouTube ID｜長度秒｜標題）

- `292dNYf-jN4`｜3356｜Special Train | Zenless Zone Zero - Part 9 [4K/Longplay/No Commentary]
- `5_cfHFC_FbU`｜180｜Zenless Zone Zero 2.0 - New Character Trial Run (PS5 Gameplay)
- `aLZWndeF0TM`｜7464｜Zenless Zone Zero Gameplay Walkthrough Full Game (4K 60FPS) No Commentary
- `CuBcf2RnCEM`｜1924｜Zenless Zone Zero: Limited Event Shadow Riptide Clash - Playthrough No Commentary
- `D3rRBFLJKTk`｜1741｜Zenless Zone Zero - Chapter 0 - PS5 4k 60FPS - Walkthrough Gameplay
- `G3POwd_VEA4`｜2322｜Zenless Zone Zero Gameplay Walkthrough Part 4 [4K 60FPS] - No Commentary
- `iV2DxiVy4ls`｜1374｜Zenless Zone Zero - Gameplay Walkthrough Part 1 (No Commentary 4K)
- `oHLlUCqN8mE`｜2812｜Zenless Zone Zero Gameplay (PS5, 4K, No Commentary)
- `q5x9Pscw9q0`｜7426｜ZENLESS ZONE ZERO Gameplay Walkthrough FULL GAME {4K 60FPS PS5} - No Commentary
- `tGtx2Yg_Mt0`｜8609｜Zenless Zone Zero [ No Commentary ] 4K 60FPS ZZZ Gameplay Walkthrough 007

**video-sheets 的來源影片**（下載的 mp4 約 300 MB，不放進 git，要再看就用 yt-dlp 重新下載）

- `ellen_demo`：`loVwUjniVW8`
- `ellen_teaser`：`Mfxj_EQvM6I`
- `jane`：`wwKD0yZQC3g`
- `story`：`Yy_rlkz4BLQ`（只下載前 25 分鐘）
- `ps`（ps_trailer）：來源 ID 沒有留下紀錄
