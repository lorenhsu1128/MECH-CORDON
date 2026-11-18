# 立繪工房（Portrait Studio）

2026-11-18 定案（使用者選方案 B）：把遊戲的立繪產生與品管流程（`docs/portrait-design.md`、`docs/portrait-qa-workflow.md`）做成獨立的網頁工具，用來產生**其他遊戲**的立繪與各種表情。放在標題的「工具與其他」。

## 一、定案

- **方案 B**：獨立的子專案 `mech_cordon_studio/`（原本的角色產生器 `mech_cordon_charagen/` 改名、一般化），和遊戲共用核心（ComfyUI 客戶端、工作流程、生產流程、立繪播放器、ComfyUI 的專案節點）。MECH CORDON 是工房裡的一個「專案」（內建、連到遊戲的資料夾），遊戲照舊。
- **不營利**：照舊用 NoobAI-XL（fair-ai 授權）。不做可營利模型的選項。
- **不接 Claude API**。改成：**使用者可以讓自己的 Claude Code 操作整個流程**（產圖、品管、修正、發佈），所以每個網頁上的動作都有對應的命令列指令，看圖的總表輸出成圖檔，另附給 Claude Code 的操作說明（第五節）。
- **成品一律 WebP**。
- **工作資料可以從網頁下載**（zip）；也可以匯入。
- **使用者可以上傳參考圖**（角色的與專案的）。
- **使用者只決定全身主圖，之後全部自動做到發佈**（2026-11-18 使用者補充）：網頁的「自動完成」與命令列的 `char <id> auto`。只靠量測挑圖時品質會比人工複查低一點，所以另外有「交給 Claude Code」：一樣全自動，再由 Claude Code 看總表把關（第五節）。

## 二、資料

| 專案                       | 角色卡＋發佈的 WebP                 | 候選與參考圖                       | 專案設定                           |
| -------------------------- | ----------------------------------- | ---------------------------------- | ---------------------------------- |
| `mech_cordon`（內建）      | `src/assets/characters/<角色>/`     | `tools/charwork/<角色>/`           | 程式內建（遊戲的名單與畫風）       |
| 其他專案（使用者自己建的） | `<工房資料夾>/<專案>/chars/<角色>/` | `<工房資料夾>/<專案>/work/<角色>/` | `<工房資料夾>/<專案>/project.json` |

- 工房資料夾：開發模式＝`studio-data/`（gitignore，不進遊戲的版本庫），exe 版＝`server-models/studio/`；環境變數 `MECH_CORDON_STUDIO_DIR` 改位置。
- 專案的參考圖在 `<專案>/work/_project/`。
- 角色卡的格式和遊戲的一樣（`mech_cordon_studio/js/pipeline.js` 檔頭），所以同一套流程與播放器都能用。
- **下載**（`/api/studio/p/<專案>/zip`）：
  - 一個角色的工作資料（角色卡＋候選＋參考圖＋發佈）、只有成品，或整個專案。
  - 不壓縮的 zip，大的檔案用 zip64。
- **匯入**：同樣格式的 zip（也接受一般壓縮的 zip）。

## 三、專案設定（`project.json`）

| 欄位                 | 意思                                                                             |
| -------------------- | -------------------------------------------------------------------------------- |
| `id`、`name`、`note` | 專案                                                                             |
| `style`              | 畫風：`prompt`（加在每張主圖提示詞後面，空白＝絕區零）、`neg`、主圖大小 `w`／`h` |
| `pose`               | 新姿勢的預設標籤                                                                 |
| `base`               | 新角色要做的共用表情（id 的陣列；沒有＝全部 7 種＋平常）                         |
| `frames`             | 新角色要做的影格（e1、e2、m1、m2、m3 的陣列；沒有＝全部）                        |
| `extra`              | 新角色的招牌表情（`[{ id, name, prompt }]`；沒有＝常用的 43 種 `EXTRA_LIBRARY`） |
| `out.quality`        | 發佈的 WebP 品質（預設 88）                                                      |

建立角色時 `base`／`frames`／`extra` 複製到角色卡的 `baseExprs`／`frames`／`extraExprs`，之後每個角色在「外觀」分頁自己改（`expr.js` 的 `exprList(card)`、`frameList(card)` 讀角色卡，所以流程不用另外帶專案）。

## 四、分期

2026-11-18 使用者補充「選好主圖之後全部自動」，原本的第 4 期（自動執行）提前和第 2 期一起做；給 Claude Code 的操作說明也提前（技能 `.claude/skills/portrait-studio/`）。

| 期  | 內容                                                                                                                                                                                              |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 改名成立繪工房、專案（建立、切換、設定的基本欄位）、角色的新增、參考圖上傳（拖曳、角色與專案）、下載與匯入 zip、命令列 `scripts/studio.js`（`--project`）、標題按鈕、`/charagen/` 轉到 `/studio/` |
| 2   | 品管搬進工房：量測（`js/qa.js`，網頁與命令列共用）、放大總表、候選表、逐格標記、選定與略過；命令列輸出同樣的總表圖檔；給 Claude Code 的技能與網頁的「交給 Claude Code」                           |
| 3   | 自動完成：自動標框（動漫的臉與眼睛偵測＋Qwen 塗綠找嘴）、表情與影格依量測挑選、不合格的加強指示再一輪、略過、發佈；伺服器另開程序跑，網頁看進度                                                   |
| 4   | （完成）修正工具：保留區（`keepOut`／`eyeKeepOut`）在網頁上畫框、修眼睛框、眼鏡與張嘴底圖的判斷、把一塊換回原圖、主圖的局部修正；顯示卡記憶體監看、每個角色重開 ComfyUI                           |
| 5   | （完成）一般化與輸出：專案設定的編輯畫面（畫風、表情組、影格組、大小）、成品輸出（遊戲格式＋每格合成好的整張 WebP＋精靈圖與 JSON）                                                                |
| 6   | （完成）文件、冒煙測試收尾；把 `portrait-*.py` 的 MECH CORDON 專用路徑換成工房的命令列                                                                                                            |

## 五、給 Claude Code 操作

- 每個網頁上的動作都有 `node scripts/studio.js --project=<專案> …` 的指令（和網頁同一份資料，透過伺服器）。
- 看圖的東西（候選表、放大總表、量測）輸出成 `test-results/studio/<專案>/…` 的圖檔與 JSON，Claude Code 用讀圖的方式看。
- 品管照 `docs/portrait-qa-workflow.md` 的流程：兩個獨立的複查用 Claude Code 自己的子代理人，只給圖與檢查清單。
- 操作手冊是專案內建的 Claude Code 技能 `.claude/skills/portrait-studio/SKILL.md`：在這個資料夾開 Claude Code、輸入 `/portrait-studio` 加上要做的角色。下載專案的工作資料時一起放進 zip（`CLAUDE-CODE.md`）。
- 網頁角色標題列的「交給 Claude Code」：說明怎麼開 Claude Code，並產生一段帶好專案、角色與外觀、可以直接貼上的指示。

## 六、實作紀錄

### 第 1 期（2026-11-18 完成）

- **改名**：`mech_cordon_charagen/` → `mech_cordon_studio/`，`server-chargen.js` → `server-studio.js`，`scripts/chargen.js` → `scripts/studio.js`（舊的檔名留一個轉過去的 `chargen.js`）。
  - 建置輸出 `dist/studio/`，伺服器在 `/studio/` 提供，舊的 `/charagen/` 301 轉過去。
  - 標題「工具與其他」的按鈕改成「立繪工房」（`btnStudio`，只在伺服器網址時顯示）。
  - 遊戲的 `render/portraits.js` 改 import `mech_cordon_studio/js/portrait.js`。
- **伺服器**（`server-studio.js`）：
  - `GET/POST /api/studio/projects`：清單、建立。
  - `GET/PUT/DELETE /api/studio/p/<專案>`：設定、刪除（要帶 `?confirm=<專案>`；遊戲的專案不能刪）。
  - `/api/studio/p/<專案>/chars/…`：角色，格式和舊的 `/api/chars/…` 一樣，多了 `DELETE` 刪整個角色（遊戲的角色不能刪）。
  - `/api/studio/p/<專案>/refs/…`：專案的參考圖。
  - `GET /api/studio/p/<專案>/zip?char=&what=all|out`：下載。
  - `POST /api/studio/import/<專案>`：匯入。
  - 舊的 `/api/chars/…` 照舊＝遊戲的專案。
  - 角色清單多帶 `info`（新增角色時填的性別、年紀、代表色、說明，存在 `card.info`）。
- **zip**（`server-studio-zip.js`）：
  - 寫：不壓縮、一個檔案一個檔案串流（背壓），超過 4 GB 的檔案、位置或 65535 個檔案時用 zip64。
  - 讀：中央目錄、zip64、deflate。上傳先存成暫存檔（`<工房資料夾>/.tmp/`），不放記憶體，上限 16 GB。
  - 驗證：Windows 的 .NET 讀得出一般與 zip64 的版本（zip64 是把門檻用 `_lim` 調小測的）；也讀得了 Windows 壓縮的 deflate zip。
  - zip 的結構：
    - 角色：`<角色>/card.json`、`<角色>/out/<發佈的檔案>`、`<角色>/work/<候選與參考圖>`。
    - 專案：`project.json`、`refs/`、`chars/<角色>/…`。
    - 成品：`<角色>/portrait.json`（`{ v, id, name, pub }`＝播放器要的）＋發佈的 WebP。
- **網頁**：
  - 上方的專案選單＋「專案…」對話框：目前專案的設定（名稱、說明、畫風提示詞、不要的、主圖大小；遊戲的專案唯讀）、專案的參考圖、下載工作資料／成品、匯入 zip、刪除專案、新增專案、從 zip 匯入成新專案。
  - 使用者的專案：左側是自己的角色＋「＋ 新增角色」（代號、名稱、性別、年紀、代表色、說明）。
  - 角色的標題列：下載工作資料、下載成品、刪除角色。
  - 參考圖：拖曳或點框選檔案，一次多張；PNG／JPG／WebP 原樣上傳（伺服器轉 WebP），其他格式在瀏覽器轉 PNG。
  - 網址 `#專案/角色`（遊戲的專案照舊 `#角色`）；記住上次的專案（localStorage `mech_cordon_studio_proj`）。
  - 場景插畫分頁只在遊戲的專案顯示。
- **生產流程**（`pipeline.js`）：
  - `Pipeline.project`＝專案設定：主圖的畫風提示詞、不要的、大小（遊戲的專案是 null，照舊絕區零 832×1216）。
  - `imageSize` 改讀 WebP 的檔頭（以前 WebP 一律當成 832×1216）。
  - 上傳到 ComfyUI 的快取鍵加上專案。
- **命令列**（`scripts/studio.js`）：`projects`、`project new|show|set|ref|zip|import`、`char <id> new|ref` 與原本的角色指令（`--project=`）。專案、新增角色、參考圖、外觀、標框、選定不用 ComfyUI。
- **冒煙測試** `testStudio`（伺服器段）：
  - 網址、轉址、API 的檢查、遊戲的專案不能刪、成品 zip。
  - 網頁：新增角色、拖曳上傳參考圖、專案的參考圖、下載專案的 zip → 匯入成新專案、刪除專案、預覽播放器。

### 第 2 期：品管搬進工房、給 Claude Code 的技能（2026-11-18）

- **量測**（`mech_cordon_studio/js/qa.js`，網頁與命令列共用）：`scripts/portrait-qa.py` 的量測移植成 JS。
  - 量的項目：`chg`、`out`、`alien`、`side`、`iris`、`resid`；判斷 `qaJudge`；姿勢的「只閉一隻眼」和中位數比。
  - 原本的中位切割色盤改成「臉上飽和顏色的色相直方圖」。在 grunt1 的 46 格上和 Python 版逐格比較，數值與判斷完全一樣。
  - 另有每個表情的嘴框 `exprMouthBox`（從 `portrait-mouthbox.py` 移植）、看圖的範圍 `viewBox`、一格的狀態 `qaState`。
- **角色卡的欄位**：
  - `slot.qm`：最近一次量測，記下量的是哪一張 `pick`。
  - `slot.qa`：看過的結果 `{ st: ok|ng, why: [QA_CHECKS], note, pick, by, t }`。
  - 選定的圖換過之後，之前的量測與標記都不算。
- **網頁的「品管」分頁**：
  - 放大總表：每行一個表情，左眼睛、右嘴巴，依狀態上框色；可以篩出有問題的、還沒看的。
  - 「量測」：在瀏覽器裡算。
  - 點一格：放大的底圖與這一格、量測數字、檢查清單打勾、備註、合格／不合格／略過、產生 3 張新候選、點候選選定。
- **命令列**：
  - `status`：進度與品管的摘要。
  - `qa`：量測＋放大總表＋`qa.json`。
  - `sheet masters|grid|cands`：主圖候選、座標格線與框、候選表。
  - `mark`、`pick <格>=<編號>`（0＝略過；換表情時清掉它的影格與嘴框）、`regen`（只加候選）、`master --n=`。
  - 圖用 sharp 拼，輸出在 `test-results/studio/<專案>/<角色>/`（`scripts/studio-qa.js`）。
- **技能** `.claude/skills/portrait-studio/SKILL.md`：
  - 流程：環境檢查、專案與角色、外觀與主圖（唯一要使用者決定的）、自動完成、表情與影格的看圖複查（兩個獨立的子代理人）、發佈與交付、坑。
- **網頁的「交給 Claude Code」**：在角色的標題列。說明在專案資料夾執行 `claude`，並產生帶好專案、角色、外觀、參考圖張數的 `/portrait-studio …` 指示，可以一鍵複製（區網的 http 網址不能直接寫剪貼簿時改成選取文字）。
- 下載專案的工作資料時附上技能檔（`CLAUDE-CODE.md`，匯入時略過）。

### 第 3 期：自動完成（2026-11-18）

- **自動標框**（ComfyUI 節點 `tools/comfyui/nodes/mech_cordon/detect.py`）：
  - `MCFaceBoxes`：deepghs 的動漫臉部偵測 `face_detect_v1.4_s`（MIT）與眼睛偵測 `eye_detect_v1.0_s`（OpenRAIL），ONNX，第一次用時下載到 ComfyUI 的 `models/mc_detect/`。
  - 校準：用現有 29 個角色 133 個姿勢手標的框。
    - 臉：133 個全部找到，臉框＝偵測框的 7%～93%、13%～95%，和手標的重疊度中位數 0.78。
    - 眼睛：兩隻都找到的有 125 個，眼睛框＝兩眼的聯集往外（左右各約 0.22 個寬、往上 0.94 個高含眉毛、往下 0.62），中位數 0.76。
  - 嘴：照比例推算只有 0.40，用影像規則找嘴的線條只找對 72／133，都不採用。改成 `MCGreenBox`：臉的裁切給 Qwen「把嘴唇塗成純綠色」，比對前後找最大的綠色塊。
    - 嘴框＝綠色塊的中心、寬 max(1.5 倍, 臉寬 0.22)、高 max(1.8 倍, 臉高 0.12)；最難的 14 個姿勢裡中心落在手標框內 12 個（沒找對的 1 個是嘴被平板擋住），每個姿勢約 17 秒。
    - 沒找到或位置不合理時照比例推算。
  - 工作流程 `workflows.js` 的 `faceBoxes`、`mouthGreen`；Comfy 客戶端多了 `runText`（讀節點的 `ui.text`）。
- **流程**（`mech_cordon_studio/js/auto.js` 的 `autoRun`，網頁與命令列共用）：
  1. 標框。
  2. 表情：每個 3 張，挑「臉框外沒改、沒有外來的顏色、有改到」的裡面改得居中的那張（太多＝換了一個人）。
  3. 嘴框放大（`widenMouth`）＋每個表情自己的嘴框。
  4. 影格：每格 3 張，排除量測不合格的；e1 挑虹膜剩約四成、e2 挑虹膜剩最少、m1 改最少、m2 改最多、m3 居中。
     - 全部不合格就加強指示（`RETRY_EXTRA`）再 3 張，還不行就略過（不無限重試）。
  5. 整個姿勢量測。
  6. 發佈。
  - 每一格記 `slot.auto`。做好的會沿用，所以停掉再跑會接著做。
- **命令列** `char <id> auto [--pose=] [--n=3] [--no-publish]`：輸出 `PROGRESS n% 文字` 給伺服器解析；結尾跑 `qa` 出放大總表，列出略過的格子與量測不理想的表情。
- **伺服器**：
  - `POST|GET|DELETE /api/studio/p/<專案>/chars/<角色>/auto`：另開 Node 程序跑上面的指令（只在開發模式）。
  - 同時只跑一個角色（顯示卡）；停止時也送 ComfyUI 的 `/interrupt`。
  - 保留最近 400 行輸出與進度。
- **網頁**：角色上方的「自動完成」列。
  - 沒有主圖時提示先選主圖。
  - 跑的期間顯示進度條、目前在做的、經過時間、輸出，可以停止；每 20 秒重新讀角色卡，各分頁看得到新圖。
  - 跑的期間網頁上的產圖按鈕停用（角色卡會互相覆蓋）。

### 第 4 期：修正工具、顯示卡記憶體（2026-11-18）

- **標框分頁**：
  - 拖曳畫框多了「保留區」（`pose.keepOut`，疤、OK 繃）與「只在眨眼保留」（`pose.eyeKeepOut`），右邊列出、可以刪除。
  - 「自動偵測臉、眼睛、嘴」（`auto.js` 的 `detectBoxes`）；手改嘴框時清掉 `mouth0`／`fv`，影格用的放大重算。
  - 旗標：眼鏡（`card.glasses`：照標籤判斷／有／沒有）、每個表情的不眨眼（`pose.noBlink`；大笑、眨眼一律不眨）、說話帶笑（`ex.smile`：自動／是／否）、底圖張嘴（`ex.open`）。
  - 只有旗標、還沒有候選的表情槽位（沒有 `cands`）：`variant` 與畫面都容許。
- **把一塊換回底圖**（取代只認紅色疤的 `portrait-scarfix.py`）：品管對話框在「這一格」上拖曳框出範圍 →「把框裡換回底圖」；命令列 `restore <格> --box=`（邊緣 2 px 漸變）。存成新的候選並選定（檔名加 `_r<時間>`）。
- **主圖的局部修正**（`Pipeline.fixMaster`；網頁「主圖」分頁的「局部修正目前的主圖」、命令列 `fixmaster --box= --prompt=`）：
  - 照 `portrait-fix.mjs edit` 的做法：框往外 60%（至少 192 px）裁出來放大給 Qwen（`qwenEditCrop`），只貼回框裡真的改了的像素，存成新的主圖候選（`cands[].fix`）。
  - 一開始用整張圖給 Qwen＋框貼回，小東西（夾克的口袋）照不到指示、幾乎沒改，改成裁切放大之後就改得到。
- **顯示卡記憶體**（`server-studio-gpu.js`，伺服器與命令列共用）：
  - 找 `nvidia-smi`（PATH 或 Windows 的 DriverStore）。
  - 網頁上方的標籤每 10 秒更新（`/api/studio/gpu`，超過九成變紅）。
  - `auto --restart-comfy`（網頁的自動完成一律加）：開始前重開 ComfyUI；每次產圖前（最多一分鐘一次）看記憶體，超過 95% 就重開。
  - 呼叫重開腳本時不能接輸出管線（`stdio: 'ignore'`）：重開的 ComfyUI 繼承了管線，程式會一直等到 ComfyUI 結束（第一次實測卡在「重開 ComfyUI」）。
  - `comfy-restart.ps1` 用 PowerShell 7 的 `pwsh`：內建的 5.1 把沒有 BOM 的 UTF-8 腳本當成 ANSI，中文註解讓它解析失敗。
- **自動標框的修正**：
  - 頭歪的角色兩眼高低差很多，聯集變高，原本乘聯集高度的上下留白把眼睛框撐得比臉還大；改成乘單眼的平均高度（頭正的時候一樣）。
  - 嘴框放大（`widenMouth`）的上緣最多只推到原本嘴框的上緣，否則嘴被擠到框的上緣。
  - 偵測固定用 CPU（這台的 onnxruntime 開不了 CUDA，每次先失敗印一堆警告）；模型在本機就不再連 Hugging Face。
- **實測**（新角色、8 種表情、每格 2 張）：15 分鐘跑完並發佈。
  - 表情都對、閉眼乾淨。
  - 只靠量測挑的弱點：半閉眼有幾格太閉；嘴型有幾格變化太小，或張開比底圖小。

- **第二次實測**（新角色、臉上有疤、8 種表情、正式的每格 3 張、網頁按鈕的同一條路含開始前重開 ComfyUI）：23.7 分鐘跑完並發佈，量測 38 格都通過。
  - 嘴都完整在框裡、張開比微開大，疤在各格都保留，閉眼乾淨。
  - 還有的弱點：「怒」的半閉幾乎沒閉、「驚」的微開比張開大（量測量不出大小對不對）。

- **依第二次實測改的挑法**（`auto.js`）：
  - 半閉眼的虹膜剩超過七成（`E1_MAX_IRIS`）不算合格，會觸發第二輪加強指示，還不行就略過半閉（播放器眨眼時只用全閉）。
  - 嘴型三格做完後，把這次產生的合格候選放在一起照改變量重新分配（微開＝最小、張開＝最大、圓口＝中間；記 `slot.auto.reorder`），不會再「微開比張開大」。

### 第 5 期：表情組與影格組、成品輸出（2026-11-18）

- **表情組與影格組**：
  - 專案設定（第三節）＋角色卡的 `baseExprs`／`frames`；網頁的專案對話框與「外觀」分頁用勾選框改（全部勾選時存成沒有設定）。
  - `pipeline.publish`、`auto.js`、品管、命令列都改用 `frameList(card)`。
  - 命令列 `project set --base= --frames= --quality=`；`char new` 照專案的預設。
- **成品輸出**（`server-studio-export.js`，要 sharp：從專案執行的伺服器都有，exe 版沒有）：
  - 照播放器沒有分層的疊法合成（主圖 → 表情的臉 → 眼睛 → 嘴巴，小圖只貼主圖不透明的地方）。
  - `what=full`：每個姿勢 × 表情 × 眼睛（open／e1／e2）× 嘴巴（closed／m1／m2／m3）一張整張的 WebP（有透明），`full/index.json` 列出全部。
  - `what=atlas`：每個姿勢一張精靈圖（臉框、眼睛框、各表情嘴框的聯集那一塊，每行一個表情、每格一種眼睛×嘴巴）＋ `atlas/<姿勢>.json`（`region`、`tile`、`frames`：「表情/眼睛/嘴巴」→ [x, y, 第幾張]）＋身體 `atlas/<姿勢>_body.webp`。超過 16000 px 時分頁。
  - zip 的項目可以是 `make()`（寫到那一項才合成），所以下載邊合成邊進來。
  - 網頁：角色標題列的「其他格式…」、專案對話框的「全部的整張圖／精靈圖」；命令列 `project zip --what=full|atlas`。
  - 實測：8 種表情的角色，整張圖 89 張 8.3 MB（約 8 秒）；ECHO 的 10 個姿勢的精靈圖 7.2 MB。
- 伺服器有裝 sharp 就用（以前只在開發模式），所以冒煙測試的伺服器也測得到輸出。

### 第 6 期：文件與測試（2026-11-18）

- 冒煙測試 `testStudio2`（伺服器段，接在 `testStudio` 後面，ComfyUI 不用開）：
  - 整張圖與精靈圖的 zip、顯示卡與自動完成的 API。
  - 專案的預設套到新角色、品管分頁的量測（範圍外的改變抓得到）與標記不合格。
  - 標框分頁的表情旗標、拖曳畫保留區與說話帶笑的旗標。
- `docs/portrait-qa-workflow.md` 第九節：舊的 Python 腳本與立繪工房指令的對照（Python 腳本只認得遊戲本身的資料夾，留著給遊戲用）。
- 技能 `.claude/skills/portrait-studio/SKILL.md` 補上修正指令與輸出格式。
