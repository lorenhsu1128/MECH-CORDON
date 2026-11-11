# 劇情角色的立繪（角色產生器）

2026-11-11 定案。所有劇情角色加動漫立繪：表情差分、眨眼、對口型、程式做的動作；**整個遊戲有對話的地方都出現**。素材由本機的 ComfyUI 產生，生產流程做成標題頁進得去的「角色產生器」，命令列（`scripts/chargen.js`）用同一套工作流程。

## 一、定案

- **畫風**：像《絕區零》的角色——乾淨的線條、賽璐璐平塗加柔和漸層、現代動畫的臉、機能街頭風的服裝、黑白為底＋每人一個強調色（對上陣營色：卡斯特隆橘、艾瑟立克藍、維爾威綠、聖域黃、ECHO 淡藍）。
- **遊戲不營利**，所以畫主圖可以用 Illustrious／NoobAI 系的模型（授權 fair-ai-public-license-1.0-sd：不營利）。改表情、姿勢用 Qwen-Image-Edit-2511（Apache 2.0）。`CREDITS.txt` 註明用到的模型。
- **工具放在專案裡**：`tools/comfyui/manifest.json` 固定 ComfyUI 的版本、外掛的 commit、模型的網址與 sha256；`npm run comfy:setup` 安裝到 `tools/comfyui/runtime/`（gitignore，模型約 37 GB 不能進 git），每台電腦 pull 之後跑一次，manifest 改了再跑一次；`npm run comfy` 啟動（127.0.0.1:8188）。
- **ECHO 是重點角色**，外觀依周目改變：第 1 周目完美得不真實（偶爾閃一格、露出軌道站的介面）→ 第 2 周目閃爍變多、局部線框 → 第 3 周目私人頻道是真實的樣子。表情最多、之後加分層動畫。
- **宿敵和主要角色一樣完整**。
- **每個角色開始量產之前都要和使用者確認外觀**：外觀設定卡 → 候選 → 角色設定圖 → 使用者確認 → 量產表情與姿勢。
- 參考圖是別人的作品，不進 git（放在專案外的 `mech-cordon-chargen/refs/`），只取方向、不照原圖複製；簽名、浮水印、文字一律拿掉。對應：②星空藍＝ECHO、①眼鏡長髮＝WHITEOUT、③駕駛服＝SIROCCO、④粉髮熊玩偶＝WREN、⑤警示黃＝派克。

## 二、角色

| 等級 | 角色 |
|---|---|
| 重點 | ECHO（約 900 句） |
| 主要 | 霍斯特、薩奇（中年女性）、派克、諾拉、米拉、教官、巴索、芮恩 WREN |
| 宿敵 | OXIDE、SIROCCO（女）、PROSPECTOR、STEVEDORE、SLUICE、MARSH、WHITEOUT（女）、SPECIMEN、SPIRE、COUNTDOWN、UNDERTOW、ZENITH、KESTREL、BRANT（女）、KILN、KEEL |
| 其他 | 敵兵三種（無線電喊話）；軌道站的機械語音用波形、不畫臉 |

性別與年紀照 `scripts/voice-gen.py` 的聲音設定。

## 三、素材規格

- **主圖**：一個姿勢一張，832×1216 全身。所有表情、眨眼、嘴型都從同一張主圖**只重畫臉的那一塊**再貼回去，所以身體一定一樣；遊戲存「主圖＋臉部小圖」。
- **每個角色**：姿勢 2 張（平常＋駕駛艙／通訊），表情 10 種（共用 8：平常、微笑、大笑、怒、驚、悲、思考、不屑；招牌 2）；ECHO 姿勢 3～4 張 × 周目外觀、表情 14～16 種。
- **每個表情的影格**：睜眼／半閉／閉眼 × 閉嘴／半開／張開。
- **動作由程式做**：滑入／退場、呼吸、點頭、搖頭、往前靠、轉開、被打中的晃動、通訊雜訊；口型照語音的音量。

## 四、遊戲裡的顯示

1. 通訊框（MGS 的 Codec、Star Fox）：胸像、掃描線、對口型；ECHO 的「干擾」句子加雜訊。
2. 對話立繪（Hades）：簡報、作戰室、全畫面劇情、結局。
3. 插入畫面（機戰）：宿敵登場與擊破、Boss 換型態、抉擇出口。
4. 小頭像：通訊紀錄、字幕條、敵兵喊話。

過場動畫裡無線電的台詞跳出通訊小窗。全部只改外觀、各端自己顯示，不動協定。每句台詞加 `e`（表情）、`a`（動作）。

## 五、分期

| 期 | 內容 |
|---|---|
| 0 | 安裝與流程驗證（測試用的假角色：一致性、速度、檔案大小） |
| 1 | 角色產生器（子專案 `mech_cordon_charagen/`、伺服器轉送 `/api/comfy`、命令列）、遊戲的立繪元件 |
| 2 | ECHO：外觀討論 → 定稿 → 全套素材，接上通訊框、簡報、全畫面劇情 |
| 3 | 接上全部對話的地方，補每句台詞的表情與動作 |
| 4 | 委託方 5 位、僚機 2 位、教官 |
| 5 | 宿敵 16 位＋插入畫面 |
| 6 | ECHO 的分層動畫（See-through）與周目外觀 |
| 7 | 敵兵、軌道站的波形、收尾 |

## 六、實作紀錄

### 第 0 期

- `tools/comfyui/manifest.json`、`scripts/comfy-setup.js`（uv 建 Python 3.12 環境、torch cu128、外掛照 commit、模型續傳與 sha256）、`scripts/comfy-start.js`。
- `mech_cordon_charagen/js/comfy.js`：ComfyUI 的 API 客戶端（`/prompt`、`/ws`、`/history`、`/view`、`/upload/image`），瀏覽器與 Node 24 共用（全域 fetch／WebSocket／FormData）。
- `mech_cordon_charagen/js/workflows.js`：`txt2img`（底模＋絕區零畫風 LoRA）、`inpaintBox`（裁一塊放大重畫再羽化貼回）、`qwenEdit`。
- `scripts/chargen.js`：命令列，輸出在 `tools/comfyui/runtime/work/`。
- `tools/comfyui/nodes/mech_cordon/`（進 git）：專案自己的 ComfyUI 節點，`npm run comfy` 以 `extra_model_paths.yaml` 的 `custom_nodes` 載入。`MCAlignPaste`：用框外（往外 60 px）以 OpenCV ECC 估計仿射變換，把改過的圖對齊回原圖，再只把框內羽化貼回。
- 安裝的坑：中文 Windows 的 cp950 讓某些套件的 setup.py 失敗 → 安裝一律 `PYTHONUTF8=1`；ComfyUI-RMBG 的 groundingdino-py 等用不到又難裝的相依套件以 manifest 的 `skipReqs` 略過；civitai 有些檔案要登入（`opt` 的模型失敗只警告，設 `CIVITAI_TOKEN` 才裝）。

**測試結果**（RTX 4070 12 GB；測試用的假角色，不是正式角色）：

| 項目 | 結論 |
|---|---|
| 畫風 | NoobAI-XL 1.1＋提示詞 `(zenless zone zero:0.6)` 最像絕區零、最乾淨（權重 1.0 會冒出標誌般的圖案）。WAI-Illustrious＋Illustrious 版的絕區零 LoRA 會把觸發詞畫成「zzz」睡覺符號，不用（已從 manifest 拿掉）。NoobAI 專用的絕區零 LoRA 要登入 civitai，列為選用 |
| 構圖 | 全身的臉太小、表情看不清楚：主圖用大腿以上的半身（cowboy shot），全身只給角色設定圖 |
| 表情 | SDXL 只重畫眼睛＋嘴巴（強度 0.85）表情出得來，但眼型會變、鼻子變深；**Qwen-Image-Edit 的表情明顯比較好**（鮮明、頭髮與臉型不變、畫風一致），但它整張會固定放大約 2%、往上偏 16 px（臉以外平均差 12）→ 對齊後只剩 2.9，貼回後看不到接縫 |
| 眨眼 | SDXL 全強度重畫眼睛會破壞瀏海（半透明重疊，只保留有變化的像素也救不回來）；Qwen 用明確的提示詞（「兩眼閉上、畫成有睫毛的細弧線、看不到虹膜」）六張都乾淨，偶爾會整個抹掉或只閉一隻 → 量產時每格多產生幾個種子挑 |
| 嘴型 | SDXL 只重畫嘴巴（強度 1.0）或 Qwen 都可以；框要避開麥克風之類的配件 |
| 分塊貼 | 閉眼圖只貼眼睛那一塊、嘴型只貼嘴巴那一塊到表情圖上：框外和表情圖的差異是 0，所以眨眼、說話時其他地方不會閃 |
| 速度 | 主圖約 9 秒；SDXL 局部重畫約 8 秒；Qwen 改圖 30～45 秒（12 GB 放不下，部分放在記憶體） |
| 大小（WebP q88） | 主圖 76 KB、臉 7 KB、眼 3 KB、嘴 1 KB → 每個姿勢約 240 KB（10 表情 × 2 閉眼 × 3 嘴型），每個角色約 0.5 MB |

**定案的流程**：主圖（NoobAI）→ 表情（Qwen、對齊、貼臉）→ 每個表情的半閉／閉眼（Qwen、只貼眼睛）與三種嘴型（Qwen 或 SDXL、只貼嘴巴）。遊戲裡疊三層：表情底圖＋眼睛小圖＋嘴巴小圖。第 1 期的調整：表情多一步 SDXL 重描臉部（0.25），嘴型改用 SDXL（見下面）。

### 第 1 期

**角色產生器**（子專案 `mech_cordon_charagen/`，原生 ES modules，建置時複製到 `dist/charagen/`，伺服器在 `/charagen/` 提供；標題畫面的「角色產生器」只在伺服器網址時顯示；網址 `#<角色 id>` 直接開那個角色）：
- 7 個分頁：外觀（中文的外觀設定卡、給模型的英文標籤、不要出現的、招牌表情、參考圖）→ 主圖（姿勢的標籤、產生候選、點一張設成主圖；換主圖會清掉這個姿勢的表情與影格）→ 標框（拖曳畫臉、眼睛、嘴巴三個框）→ 表情 → 眨眼與嘴型 → 預覽 → 發佈。可以有多個姿勢。工作一次只跑一件、可以停止。
- 狀態：外觀討論中（draft）→ 外觀已確認（look，才可以量產）→ 完成（done）。
- 名單（`js/roster.js`）＝遊戲的說話者 id（`SPEAKERS`）；名單以外已經有資料的角色列在「其他」（測試用）。

**資料**（`js/pipeline.js` 檔頭有 card 的完整格式）：
- `card.json`＋發佈的 WebP 在定稿資料夾：開發模式（從專案執行 server.js、沒設 `MECH_CORDON_MODELS_DIR`）＝`src/assets/characters/<id>/`（進 git），否則 `server-models/characters/<id>/`。
- 候選、選定的圖與參考圖在 `server-models/charwork/<id>/`（不進 git；參考圖是別人的作品）。換電腦時候選不會跟著走，定稿與 card（含種子）會。
- 伺服器（`server-chargen.js`，server.js 載入）：`/api/comfy/…`＝轉送到本機的 ComfyUI（`MECH_CORDON_COMFY` 改網址，`/api/comfy/ws` 是 WebSocket），`/api/comfy-status`＝ComfyUI 有沒有在執行（一律 200），`/api/chars`、`/api/chars/<id>`（card）、`/api/chars/<id>/file/<檔名>`（定稿）、`/api/chars/<id>/work/<檔名>`（候選）。

**生產流程**（網頁與命令列共用 `js/pipeline.js`）：
- 主圖：NoobAI，提示詞＝外觀標籤＋姿勢標籤＋`STYLE`。
- 表情：Qwen 對齊後貼臉，再以 SDXL **重描臉部**（`pose.refine`，預設 0.25：線條和主圖一致；0.35 以上會擦掉麥克風桿之類細的配件）。
- 眨眼（e1 半閉、e2 閉眼）：Qwen 對齊後只貼眼睛。
- 嘴型（m1 微開、m2 張開、m3 圓口）：**改用 SDXL**——嘴巴在整張圖上只有 30 px 左右，Qwen 改出來會糊、像一團顏色；SDXL 把嘴巴附近（嘴框的 4 倍）裁出來放大重畫、只貼回嘴巴，提示詞帶表情的標籤（`EXPRS[].tags`），所以微笑的張嘴還是笑的形狀。
- 發佈：ComfyUI 裡一次做完——主圖用 BiRefNet 的動漫專用版（`BiRefNet_toonout`，ComfyUI-RMBG 的 `BiRefNetRMBG`，選用參數要全部給）去背成透明的 WebP，臉／眼／嘴裁成小圖（專案節點 `MCCropSave`，可以接遮罩），寫進定稿資料夾，`card.pub` 記下每個姿勢的尺寸、框與每個表情的小圖；定稿資料夾裡這一版沒有的舊檔刪掉。測試角色（1 姿勢、3 表情、9 個影格）共 185 KB。

**立繪播放器**（`js/portrait.js`，角色產生器的預覽與遊戲共用）：`PortraitPack.load(pub, 檔名→網址)`、`new Portrait(pack, 姿勢)`；`setExpr`、`act`（點頭、搖頭、往前靠、往後縮、轉開、跳一下、被打中）、`update(dt, 音量)`（眨眼 2～6 秒一次、偶爾連眨；音量 → 嘴型，每個嘴型至少 0.07 秒）、`talkSim`（沒有語音時模擬說話）、`draw(ctx, 寬, 高, { fit })`：`full` 整張、`bust` 胸像（臉框寬的 1.7 倍、臉的中心在 36% 高）、`face` 臉（1.15 倍、置中；很扁的插入畫面以臉框的高度為準）。

**遊戲**：建置的 `writePortraits` 把 `src/assets/characters/` 有發佈的角色打包成 `dist/lib/portraits/<id>.js`（`window.MECH_CORDON_PORTRAITS[id] = { name, pub, img: { 檔名: data URL } }`，直接開檔也能用）與 `index.js`（有哪些角色）；`src/render/portraits.js` 的 `Portraits.get(id)` 第一次用到時才載入（沒有＝null，照舊顯示字母徽章），播放器直接 import 角色產生器的 `portrait.js`（和文字演出直接用 APNG 產生器一樣）。接上對話是第 3 期。

**命令列**（`scripts/chargen.js char <id> <指令>`：show／look／cand／master／box／var（`--autopick`）／pick／missing／publish；要執行中的 ComfyUI 與 mech-cordon-server，`--server` 預設讀 `mech-cordon-server.json` 的 port）。

**冒煙測試**：伺服器段的 `testCharagen`（`/charagen/`、ComfyUI 沒開時 `/api/comfy` 回 502、角色資料 API 與檔名檢查、標題按鈕、名單、預覽的播放器畫出主圖與表情的臉）；測試伺服器的 `MECH_CORDON_COMFY` 指到沒人聽的 port。

## 七、交接（2026-11-11，換到另一台電腦繼續）

**進度**：第 0、1 期完成。第 1 期的完整 `npm test` 跑到 2092 項通過時，這台電腦記憶體不足被系統停掉（ComfyUI 同時佔著記憶體），當時有 4 項失敗、都在這期沒改到的地方（水波、HEARTH 打斷大招、方舟的甲板升降砲塔與甲板軌道砲兵），還沒重跑確認；伺服器段（含 `testCharagen`）單獨跑 30 項全過。**下一台電腦第一件事：跑一次完整的 `npm test` 確認。**

**還沒有任何正式角色**：測試角色 test_op 只在這台的暫存資料夾，沒有進 git。`src/assets/characters/` 目前是空的。

**下一步＝第 2 期 ECHO**：先寫外觀設定卡給使用者確認（參考圖②星空藍：黑短髮挑染藍、藍眼、星空印花、行星掛飾、寬大外套；改成 ECHO 自己的設計，代表色淡藍 #7fc8ff），確認後才產生候選。

**沒有產圖環境的電腦能做的**：
- 第 3 期的大部分：每句台詞補表情 `e` 與動作 `a`、把立繪接上各個對話畫面。可以先用假的角色資料開發（像冒煙測試的 `testCharagen` 用純色的 PNG 做一個 card.pub 放進 `src/assets/characters/<id>/`，但**不要提交假資料**）。
- 外觀設定卡的討論與撰寫（`look.zh`／`look.prompt`）。
- 第 7 期的軌道站波形、版面檢查。

**要產圖時**有兩種做法：
1. 那台電腦也裝：`npm run comfy:setup`（要 NVIDIA 顯示卡、約 30 GB），`npm run comfy` 啟動。
2. 借用有顯示卡的電腦：那台執行 `npm run comfy -- --lan`（ComfyUI 聽區網），這台以環境變數 `MECH_CORDON_COMFY=http://<那台的 IP>:8188` 啟動伺服器（`npm start`），角色產生器與命令列（`--comfy=http://<那台的 IP>:8188`）就用那台的顯示卡，定稿照樣寫進這台的 `src/assets/characters/`。

**不在 git 裡、要另外搬的**：參考圖（這台的 `C:\Users\LOREN\Documents\_projects\mech-cordon-chargen\refs\_inbox\`，5 張，對應見第一節）；候選圖（`server-models/charwork/`，還沒有正式角色的，不用搬）。
