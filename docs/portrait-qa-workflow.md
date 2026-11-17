# 立繪的品管流程（零容忍）

2026-11-15～17 立繪品質大修用的方法與工具（設計與歷史見 `docs/portrait-design.md` 第 8 期）。29 個角色的眨眼（e1 半閉、e2 全閉）與嘴型（m1～m3）全部照這個流程重新品管，使用者確認品質很好，**之後新增角色、重產表情或影格、換主圖時一律照這份做**，換電腦的 Claude Code 也一樣。

## 一、品質標準

- **零容忍**：再淡的殘線、色塊、白圈、接縫都不能放行。要用放大總表看，縮圖看不出來。
- **一個角色就是一個人**：表情與影格不能改掉配件（疤、OK 繃、頭盔、耳環、眼鏡）、異色瞳、髮型、年紀（男角一律看起來年輕）。
- **影格只改它該改的**：眨眼只動眼皮，眉毛與表情（生氣的眉、笑眼）不變；嘴型配合表情（驚訝的說話不能變笑臉）。
- **不要無限重試**：同一個方法（重產候選、同樣的參數）試過一輪不行，就換根本的做法或略過（`skip`）。略過的格子不發佈，播放器在那個表情就不眨眼或不動嘴，比放一張有瑕疵的好。

## 二、環境

1. `git pull`，看 `package.json` 與 `CLAUDE.md` 有沒有變（有就 `npm install`）。
2. ComfyUI：第一次 `npm run comfy:setup`（裝到 gitignore 的 `tools/comfyui/runtime/`，模型很大）。
   - 啟動：`npm run comfy`，或用隱藏視窗 `powershell -ExecutionPolicy Bypass -File scripts/comfy-restart.ps1`。
   - **長時間產圖每個角色重開一次**，避免顯示卡記憶體越吃越多。
3. 伺服器：`chargen.js` 透過伺服器寫 card。用隱藏的獨立程序啟動：`Start-Process node server.js -WindowStyle Hidden`＋記錄檔。不要用 Claude 的背景工作，不要留視窗。
4. Python：
   - **Git Bash 的 `python` 是 Windows 商店的空殼，執行了不會有任何動作也不報錯**，一律用完整路徑。
   - 看圖的腳本（numpy、Pillow、scipy）用 conda 環境 `rubicon-voice`：`C:/Users/<使用者>/miniconda3/envs/rubicon-voice/python.exe`。
   - 用 opencv 的（`portrait-scarfix.py`）用 ComfyUI 的 `tools/comfyui/runtime/.venv/Scripts/python.exe`。
5. 監看：產圖時每 10 分鐘看一次進度與顯示卡記憶體（`nvidia-smi`，Windows 在 `C:\Windows\System32\DriverStore\FileRepository\nv_dispig.inf_*\nvidia-smi.exe`）。
   - 超過 31 GB（32 GB 的卡）會溢到共用記憶體、慢好幾倍，要重開 ComfyUI。
   - 20 分鐘沒進展就查原因。

## 三、資料在哪裡

- `src/assets/characters/<角色>/card.json`：角色卡。發佈的圖也在這個資料夾，`card.pub` 是發佈的版本。
- `tools/charwork/<角色>/`：全部的候選圖。不進 git，換電腦要從原本那台複製。
- card 的重要欄位：

| 欄位                                  | 意思                                                                                              |
| ------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `poses[].master`                      | 姿勢的主圖                                                                                        |
| `poses[].boxes.face`／`eyes`／`mouth` | 臉、眼睛、嘴巴框（整張圖的座標 x, y, w, h）                                                       |
| `poses[].ex[<表情>].pick`             | 表情的底圖                                                                                        |
| `poses[].ex[<表情>.<影格>]`           | 影格的槽位：`cands`（候選，舊到新）、`pick`（選定）、`skip`（不發佈）、`v2`（新流程產的）         |
| `ex[<表情>].mb`                       | 這個表情自己的嘴框（`scripts/portrait-mouthbox.py` 量）；大嘴的表情一定要有，否則框外留下原本的嘴 |
| `ex[<表情>].smile`／`open`            | 手動標「帶笑的平常表情」／「張嘴的底圖」，會改嘴型的指示（板著臉的不能標 smile）                  |
| `ex[<表情>].keepOut`、`pose.keepOut`  | 一律保留原圖的矩形（臉上的疤、OK 繃）。表情讓臉移位時，在那個表情另外指定                         |
| `pose.eyeKeepOut`                     | 只在眨眼影格保留的矩形。**不要放在頭髮上**，會變成方塊接縫                                        |
| `pose.noBlink`                        | 不眨眼的表情（底圖本來就閉眼：大笑、閉眼的姿勢）                                                  |
| `card.glasses`                        | 有沒有眼鏡。只有真的有才在指示裡要求保留眼鏡                                                      |

## 四、流程

### 1. 總檢查（看全部）

```bash
node scripts/chargen.js char <角色> publish --keep        # 發佈（主圖與分層沿用，只重裁表情與影格）
python scripts/portrait-audit.py <角色> …                  # 照遊戲的合成方式拼出每一格 → test-results/portrait-qa/audit/
python scripts/portrait-audit.py --zoom <角色> <姿勢>       # 放大總表（每格只裁臉、300 px）
python scripts/portrait-qa.py <角色> …                     # 量測：範圍外的改變、外來顏色、改變量太少、只閉一隻眼
```

先看 `report_*.json` 與 `portrait-qa.py` 的數字，挑出可疑的。**但一定要看完每個姿勢的放大總表**：數字抓不到淡的殘線與表情跑掉。

### 2. 兩個獨立的複查

Claude 開兩個子代理人（Agent），各自看同一個角色的全部放大總表：一個從第一個姿勢往後看，一個從最後一個往前看。

- **只給圖的路徑與下面第五節的檢查清單，不給自己的判斷**，否則複查只會附和。
- 每個人回報不合格的格子（`<姿勢>:<表情>.<影格>`）與原因。
- 兩份都列的直接重做；只有一份列的，自己再看一次放大總表決定。

### 3. 先分系統性與個別

同一種瑕疵出現在好幾個角色或姿勢，就是**系統性**的：回到根源改（ComfyUI 節點、指示、框、card 的旗標），再重產整個角色。不要一格一格補。已知的根源與修法見第六節。

### 4. 個別的格子：產候選、看、選

```bash
# 清單檔：每行一格，例如 p1:smile.e1
bash scripts/portrait-cands.sh <角色> <清單檔> 3            # 每格 3 輪新候選
python scripts/portrait-sheet.py cands <角色> <清單檔>       # 候選表：底圖｜1｜2｜3（放大到眼睛或嘴）
python scripts/portrait-pick.py <角色> p1:smile.e1=2 p1:angry.m3=0   # 選第 2 張；0＝skip
python scripts/portrait-sheet.py pick <角色> <清單檔>        # 確認選到的
```

- 三張都不合格：**最多再一輪，而且換方法**：
  - 半閉不夠閉：`portrait-retry.py <角色> e1`，多試幾個種子、量虹膜剩下的比例。
  - 臉上的記號被改掉：加 `keepOut`。
  - 疤被染色：`portrait-scarfix.py`。
  - 表情底圖本身有問題：`portrait-fix.mjs edit` 重做表情。
- 還是不行就 `=0` 略過。
- 一次看全部候選（含舊的）：`portrait-sheet.py all <角色> <清單檔>`，標號是 `slot.cands` 的索引。
- 主圖要局部修正（配件、手、去背）：
  1. `node scripts/portrait-fix.mjs edit <角色> <姿勢> --crop=… --inner=… --prompt=…` 產生候選。座標用 `portrait-sheet.py grid` 的格線量。
  2. `portrait-sheet.py fix <角色>:<姿勢>:<tag>` 看候選。
  3. `portrait-setpick.py` 選定，`portrait-propagate.py` 套到整個姿勢。

### 5. 收尾

1. `node scripts/chargen.js char <角色> publish --keep`，再跑一次 `portrait-audit.py`，看放大總表。只看改過的格子，不再開新的複查輪次。
2. `npm run build`、`npm run lint`、`npm run format:check`、`npm test`。
3. commit 並 push：`src/assets/characters/` 與 `dist/`。

## 五、看圖的檢查清單

**眼睛（e1／e2）**

- e1 的上眼皮蓋住虹膜的上半（剩約四成），e2 兩眼都完全閉上；只閉一隻不行。
- 眉毛、眉間的皺紋、表情（生氣、笑眼、哭）和底圖一樣。
- 沒有殘影（兩雙眼疊在一起）、沒有白圈（舊眼白留著）、沒有補錯顏色（頭髮色、粉紅、灰色的眼睛周圍）。
- 虹膜顏色沒變，異色瞳沒有互換。
- 眼鏡：有的要留著，沒有的不能長出來。
- 頭髮蓋住的眼睛沒有糊成一團。

**嘴（m1～m3）**

- 嘴型配合表情：生氣、驚訝說話不會變成笑。m1 到 m3 越張越大。
- 框外沒有留下原本的嘴（唇線、牙齒、嘴角）。
- 沒有異物：愛心、條碼、色塊、多出來的牙。
- 下巴線、麥克風、手沒有被改到。

**整體**

- 疤、OK 繃、頭盔、耳環、刺青都還在，位置不變；沒有多出新的記號。
- 沒有方塊接縫、亮度不同的補丁。
- 分層的角色：前髮蓋住眼睛的地方正確，沒有分層的角色臉旁沒有白色方塊。

## 六、已知的根源與修法

| 症狀                                       | 根源                                         | 修法（已在程式裡）                                                               |
| ------------------------------------------ | -------------------------------------------- | -------------------------------------------------------------------------------- |
| 眨眼的殘影、閉不起來                       | 整張圖給 Qwen、整個框羽化貼回                | `qwenEditCrop`：臉放大到 1024 給 Qwen 改；`MCPatchPaste` 只貼框裡真的改了的像素  |
| 眼睛周圍變青色、留下粉紅的舊眼睛、灰色眼白 | 補膚色時從眼睛框估膚色，估成頭髮或頭盔的顏色 | `no_recolor`＋`skin_box`＝臉框裡最多的顏色，偏暖的優先                           |
| 閉眼後留下白圈                             | 舊眼白不在貼回範圍裡                         | 補膚色的範圍往外 15 px，不碰到框邊的眼白連通塊                                   |
| 眨眼時表情跑掉                             | 指示沒要求保留眉毛與表情                     | 指示代入表情的描述、要求眉毛不動；底圖閉眼的設 `noBlink`                         |
| 說話變笑臉、大嘴被切掉                     | 共用一個小嘴框、SDXL 重畫                    | 嘴型也用 `qwenEditCrop`；每個表情自己的 `mb`                                     |
| 嘴角留下舊牙齒（臉移位）                   | 姿勢的 `keepOut` 剛好蓋在嘴角                | 那個表情另外指定 `ex[表情].keepOut`                                              |
| 眨眼時長出眼鏡、淚滴、OK 繃上的字          | 指示提到的東西都會被畫出來                   | 只有角色真的有才寫（`card.glasses`）                                             |
| 帶笑的平常表情說話變僵、板著臉說話變笑     | `smile` 標錯                                 | 照底圖手動標 `ex.smile`                                                          |
| 疤被閉眼改掉或染色                         | Qwen 一起改了                                | `keepOut`，或 `portrait-scarfix.py` 換回原圖（`keep_tone` 會把眼皮染色，不要用） |
| 手或東西擋在嘴邊（托下巴）                 | 嘴型一定會改到手                             | 直接略過                                                                         |

## 七、坑

- **清單檔的 `\r`**：Windows 的 Python `print` 寫出的檔案每行帶 `\r`，`--only=` 收到的格子名稱不對，只產了最後一格或一格都沒有。`portrait-cands.sh` 與 `portrait-sheet.py` 會自己去掉；自己組指令時要 `tr -d '\r'`。
- **同一個角色同時只能跑一個產圖指令**：兩個 `chargen.js` 會互相覆蓋 card.json。
- **產圖時不能對那個角色用 `portrait-pick.py`**、`portrait-setpick.py`、`portrait-scarfix.py`：選定會被產圖指令寫回去的舊 card 蓋掉。
- `chargen.js frames --only` 產的新候選會自動成為 pick。看完候選表一定要用 `portrait-pick.py` 明確選定或略過，不要留著「最新的那張」。
- `publish --keep` 沿用上次的去背與拆層；改過主圖的姿勢（`portrait-propagate.py` 標的 `pose.rebase`）照樣會重新去背、拆層。
- `tools/charwork/` 不進 git：換電腦要從原本那台複製這個資料夾，否則只剩發佈的圖、不能重產或重選。

## 八、腳本一覽

| 腳本                                                                              | 用途                                                                                   |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `scripts/chargen.js`                                                              | 角色產生器的命令列：`char <角色> frames [--only=…]`、`char <角色> publish [--keep]`    |
| `scripts/portrait-audit.py`                                                       | 照遊戲的合成方式拼總表、量去背與接縫；`--zoom` 放大總表                                |
| `scripts/portrait-qa.py`                                                          | 影格的量測（範圍外的改變、外來顏色、改變量、單眼）                                     |
| `scripts/portrait-sheet.py`                                                       | 看圖用的總表：`cands`、`all`、`pick`、`eyes`、`pairs`、`heads`、`grid`、`fix`          |
| `scripts/portrait-cands.sh`                                                       | 清單裡的格子產 n 輪候選（自動重試）；`--frames` 補產還沒完成的                         |
| `scripts/portrait-pick.py`                                                        | 依候選表的編號選定或略過                                                               |
| `scripts/portrait-retry.py`                                                       | 半閉／全閉眼多試幾個種子，依虹膜比例挑                                                 |
| `scripts/portrait-scarfix.py`                                                     | 閉眼影格把疤換回原圖                                                                   |
| `scripts/portrait-fix.mjs`                                                        | 主圖或表情的局部修正（`edit`）、去背失敗的重做（`bg`）                                 |
| `scripts/portrait-setpick.py`、`portrait-propagate.py`、`portrait-bgfix.py`       | 修正候選的選定、套到整個姿勢、去背的合成                                               |
| `scripts/portrait-mouthbox.py`、`portrait-eyebox.py`、`portrait-eyeprobe.mjs`     | 量每個表情的嘴框、修正沒框到眼睛的眼睛框                                               |
| `scripts/portrait-glasses.py`、`portrait-glassprobe.mjs`、`portrait-openmouth.py` | 眼鏡與張嘴底圖的判斷                                                                   |
| `scripts/comfy-restart.ps1`                                                       | 隱藏視窗重開 ComfyUI                                                                   |
| ComfyUI 節點 `tools/comfyui/nodes/mech_cordon/__init__.py` 的 `MCPatchPaste`      | 只貼回真的改了的像素：`exclude`、`protect_edges`、`no_recolor`＋`skin_box`、`tone_fix` |
| `mech_cordon_charagen/js/workflows.js` 的 `qwenEditCrop`、`pipeline.js`           | 影格的工作流程與指示                                                                   |
