---
name: portrait-studio
description: 用立繪工房（本機 ComfyUI）幫使用者產生角色立繪：外觀 → 全身主圖候選（給使用者挑）→ 標框、表情、眨眼與嘴型 → 量測與看圖品管（零容忍、兩個獨立複查）→ 發佈成 WebP → 打包成品。使用者說「做立繪」「做角色的表情」「用立繪工房產圖」「幫我做 XX 的立繪」時用。
---

# 立繪工房：Claude Code 操作手冊

使用者決定**全身主圖**，之後由你一路做到發佈，中間不再問使用者（除非環境壞掉）。
做完只回報結果、略過的格子與下載位置。全程用繁體中文。

- 設計：`docs/portrait-studio-design.md`
- 品管的標準與已知的修法：`docs/portrait-qa-workflow.md`，開始前先讀它的第一、五、六節。

所有指令都是 `node scripts/studio.js …`，加 `--project=<專案>`（遊戲本身的角色是 `mech_cordon`，可以省略）。資料和網頁的立繪工房是同一份；使用者可以同時開 `http://localhost/studio/` 看進度。

## 零、環境（每次開始先檢查）

1. `git pull`；`package.json` 有變就 `npm install`。
2. ComfyUI：
   - 檢查：`curl -s http://127.0.0.1:8188/system_stats`。
   - 第一次：`npm run comfy:setup`（模型約 37 GB）。
   - 啟動：`pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/comfy-restart.ps1`（隱藏視窗）。要用 PowerShell 7 的 `pwsh`：Windows 內建的 PowerShell 5.1 把這個沒有 BOM 的 UTF-8 檔當成 ANSI，中文註解會讓它解析失敗。
3. 伺服器：
   - 檢查：`curl -s http://127.0.0.1/health`。
   - 沒開：`npm run build` 後用 PowerShell 的 `Start-Process node server.js -WindowStyle Hidden`，輸出導到 `test-results/server.log`。不要用 Claude 的背景工作。
4. Python 不需要：量測與看圖都在 Node（sharp）。
5. 顯示卡記憶體：每 10 分鐘看一次 `nvidia-smi`。超過 31 GB（32 GB 的卡）或 20 分鐘沒進展，就重開 ComfyUI；**每個角色做完也重開一次**。

## 一、專案與角色

```bash
node scripts/studio.js projects                                     # 有哪些專案
node scripts/studio.js project new my_game --name="我的遊戲"          # 新專案
node scripts/studio.js project set my_game --style="畫風英文標籤" --w=832 --h=1216   # 畫風空白＝絕區零
node scripts/studio.js char alice new --project=my_game --name="愛麗絲" --sex=f --age=十七歲 --note="個性"
node scripts/studio.js char alice ref 參考圖.png … --project=my_game # 使用者給的參考圖
```

代號一律是英文小寫開頭，只能用英數與底線。使用者在網頁上傳的參考圖在角色卡的 `refs`，要看的話用 `char <id> show` 找檔名，再到工作資料夾讀圖：
- 遊戲的專案：`tools/charwork/<角色>/`
- 其他專案：`studio-data/<專案>/work/<角色>/`

## 二、外觀 → 主圖（唯一要使用者決定的地方）

1. 看參考圖與使用者的描述，寫外觀：
   ```bash
   char <id> look --zh="中文外觀設定卡" --prompt="英文標籤" --neg="不要的"
   ```
   - 標籤用 Danbooru 風格：`1girl, solo, …, cowboy shot`。
   - **提到的東西都會被畫出來**，角色沒有的不要寫。男角一律看起來年輕。
2. `char <id> cand --n=8` 產主圖候選，再用 `char <id> sheet masters` 拼成總表。
3. **把總表給使用者，請他挑一張**（給圖檔路徑，或請他到網頁的「主圖」分頁點選）。
   - 不滿意就照他的意見改標籤再產一輪。
4. 他選定後設成主圖：
   ```bash
   char <id> master --n=<編號>
   ```
   之後一路做完，不再問。

## 三、自動完成（主幹）

主圖選定之後：

```bash
node scripts/studio.js char <id> auto [--project=…]     # 約一個姿勢一小時多；中途停掉再跑會接著做
```

它會一路做到發佈：
1. 自動標框：動漫的臉與眼睛偵測，嘴巴讓 Qwen 塗綠來找。
2. 表情：每個 3 張，用量測挑。
3. 每個表情自己的嘴框。
4. 眨眼與嘴型：每格 3 張，用量測挑；都不合格就加強指示再一輪，還不行就略過。
5. 量測。
6. 發佈。

結尾會印出：
- 略過的格子。
- 「量測不理想的表情」。
- 放大總表的位置。

用 `run_in_background` 跑，每 10 分鐘看一次輸出與顯示卡記憶體。使用者在網頁按「自動完成」也是跑同一個指令（伺服器另開程序）；這時不要再對同一個角色下指令。

**自動完成只靠量測挑圖**，抓不到「表情跑掉」「淡淡的殘線」「配件不見」。所以接下來的第四、五節（看圖複查與修正）一定要做，品質才會和遊戲的角色一樣。

框不對（表情或影格整批歪掉）時：
1. `char <id> sheet grid` 看 `_boxes.png`。
2. 用 `char <id> box --face=… --eyes=… --mouth=…` 改。
3. 清掉那個姿勢的影格再跑 `auto`。

## 四、表情的複查

1. `char <id> sheet cands p1:smile p1:laugh … --n=6`：拼出每個表情全部的候選。
2. 看自動選的（標 *）是否「表情對、臉形與配件（疤、耳環、頭盔、眼鏡）沒變、沒有接縫」。
3. 不對就 `char <id> pick p1:smile=<編號>`。
4. 都不行：`char <id> regen p1:smile --n=3` 再一輪，還不行就挑最接近的，在回報裡寫出來。
5. **換了表情，它的影格會被清掉**。改完再跑一次 `char <id> auto` 補做那些影格。
6. 本來就閉眼的表情（大笑 ^^、閉眼）不會眨眼；若是招牌表情、底圖閉眼，在角色卡的 `poses[].noBlink` 加上它。

## 五、眨眼與嘴型的複查

1. （自動完成已經產好、選好）
2. `char <id> qa`：量測全部影格，輸出：
   - `test-results/studio/<專案>/<角色>/<姿勢>_zoom.jpg`（放大總表）。
   - `qa.json`。
   - 不合格的列成 `BAD` 那一行。
3. **兩個獨立的複查**：開兩個子代理人（Agent），只給它們：
   - 放大總表的路徑。
   - `docs/portrait-qa-workflow.md` 第五節的檢查清單。

   **不要給自己的判斷**。一個從第一行往下看，一個從最後一行往上看，各自回報不合格的格子（`p1:smile.e1`）與原因。
4. 決定要重做的格子：
   - 兩份都列的，直接重做。
   - 只有一份列的，自己看放大總表決定。
   - 量測的 `BAD` 一律重做。
5. 同一種瑕疵出現在很多格（系統性）：回 `docs/portrait-qa-workflow.md` 第六節找根源（框、`keepOut`、`noBlink`、`card.glasses`、`ex[表情].smile`），改了之後整批重產，不要一格一格補。
6. 個別的格子：
   1. 把格子寫進清單檔（每行一格）。
   2. `char <id> regen --list=清單檔 --n=3` 產新候選。
   3. `char <id> sheet cands --list=清單檔 --n=3` 拼候選表。
   4. 看完候選表，`char <id> pick p1:smile.e1=2 p1:angry.m3=0` 選定（0＝略過：不發佈，那個表情就不眨眼或不動嘴）。
7. **不要無限重試**：同一個方法只試一輪。三張都不合格就換方法（框、保留區、指示），最多再一輪，還不行就略過（`=0`）。
8. 看過的格子可以 `char <id> mark p1:smile.e1=ok`（或 `=ng --why=ghost,expr`）記下來，網頁會顯示。原因的代號在 `mech_cordon_studio/js/qa.js` 的 `QA_CHECKS`。
9. `char <id> status` 隨時看進度：缺幾格、略過、量測抓到、標成不合格、還沒看。

## 六、發佈與交付

1. `char <id> publish`：主圖去背、裁出表情與影格的 WebP，寫進定稿資料夾。之後只重做影格時用 `publish --keep`。
2. 再跑一次 `char <id> qa`，看改過的格子；不再開新的複查輪次。
3. 成品打包給使用者：
   ```bash
   node scripts/studio.js project zip <專案> --char=<id> --what=out --out=<檔案>.zip
   ```
   內容是 `portrait.json`（播放器要的資料）＋WebP。網頁的「下載成品」是同一份。
4. **遊戲本身的角色**（`mech_cordon`）：照 CLAUDE.md 跑 `npm run build`、lint、`npm test`，commit 並 push `src/assets/characters/`、`tools/charwork/`、`dist/`。
   **使用者自己的專案**：資料在 gitignore 的 `studio-data/`，不用 commit。
5. 回報：
   - 做了哪些表情與影格。
   - 略過的格子與原因。
   - 主觀上比較弱的地方。
   - 成品 zip 的路徑。

## 坑

- 同一個角色同時只能跑一個產圖指令（角色卡會互相覆蓋）。產圖時也不要對同一個角色跑 `pick`、`mark`。
- `frames` 產的新圖會直接成為選定的圖；`regen` 只加候選、不改選擇，看完候選表一定要 `pick`。
- 清單檔是 Windows 產的時候，每行的 `\r` 已經自動去掉。
- 換主圖會清掉那個姿勢的表情與影格。
