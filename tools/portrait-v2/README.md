# 立繪 v2 的輔助腳本（過場改版第 0.5 期）

原本放在 Claude 的暫存資料夾，交接時（2026-11-13）原樣搬進來。**腳本裡寫死的路徑**都是原本那台電腦的暫存資料夾
（`C:/Users/LOREN/AppData/Local/Temp/claude/…/scratchpad`）與專案路徑 `C:/Users/LOREN/Documents/_projects/MECH-CORDON`，
在別台電腦用之前要改成這個資料夾（`tools/portrait-v2/`）與自己的專案路徑。交接的完整說明在
`docs/cine-redesign-design.md` 第九節「第 0.5 期」。

| 檔案 | 用途 |
| --- | --- |
| `poses_all.sh`／`poses_fix.sh`／`wren_fix.sh` | 從 p1 以 Qwen-Image-Edit 改姿勢（`chargen.js edit`），輸出 `tools/comfyui/runtime/work/v2/<角色或重畫資料夾>/<姿勢>/edit_<種子>.png`；KEEP＝各角色的外觀描述 |
| `picks.json` | 每個姿勢選的種子（`"資料夾:種子"`＝重畫的，例如 `echo_r:22`） |
| `B.json` | 每個姿勢的臉／眼／嘴框（原圖座標 832×1216） |
| `names.json` | 姿勢的中文名 |
| `addposes.mjs` | 把選好的姿勢登記進設定卡（轉 WebP、`newPose`、主圖與框） |
| `expr_run.mjs` | 新姿勢的表情、眨眼、嘴型（3/4 側＝全部表情＋影格，其他＝只有平常的影格；`NO_MOUTH` 不做嘴型；可重跑接續；失敗先確認 ComfyUI 還在、重開後重試，連續 3 批失敗就停；ComfyUI 超過 21 GB 卸下模型、超過 24 GB 或每 40 批重啟） |
| `publish_all.sh` | 打開拆層（`layers: true`）並 `chargen.js char <id> publish`，每位開始前重啟 ComfyUI，失敗就停 |
| `comfy_restart.sh`／`comfy_start_detached.ps1` | 重啟 ComfyUI（等佇列空 → 關 → 用 WMI 開 → 等它可用）。**注意：用 WMI 開的 ComfyUI 拆層（See-through）會卡住，見交接說明** |
| `run_detached.ps1`／`server_start_detached.ps1` | 用 WMI 開 bash 腳本／區網伺服器（脫離 Claude Code 的程序樹，背景工作被系統停掉時不會連帶停） |
| `kill_gen.ps1` | 停掉 chargen 的 node 與 ComfyUI（比對字串寫在檔案裡，不會比對到下指令的 shell 自己） |
| `sheet.js`／`grid.js`／`zoom.js`／`z.sh`／`v.sh`／`setb.js` | 候選比較圖、標框用的格線圖與放大圖（`ZS` 環境變數改放大範圍）、寫框、畫框檢查 |
| `qc.js` | 表情抽查：裁臉框，主圖＋指定的表情並排 |
