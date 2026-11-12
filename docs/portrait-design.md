# 劇情角色的立繪（角色產生器）

2026-11-11 定案。所有劇情角色加動漫立繪：表情差分、眨眼、對口型、程式做的動作；**整個遊戲有對話的地方都出現**。素材由本機的 ComfyUI 產生，生產流程做成標題頁進得去的「角色產生器」，命令列（`scripts/chargen.js`）用同一套工作流程。

## 一、定案

- **畫風**：像《絕區零》的角色——乾淨的線條、賽璐璐平塗加柔和漸層、現代動畫的臉、機能街頭風的服裝、黑白為底＋每人一個強調色（對上陣營色：卡斯特隆橘、艾瑟立克藍、維爾威綠、聖域黃、ECHO 淡藍）。
- **遊戲不營利**，所以畫主圖可以用 Illustrious／NoobAI 系的模型（授權 fair-ai-public-license-1.0-sd：不營利）。改表情、姿勢用 Qwen-Image-Edit-2511（Apache 2.0）。`CREDITS.txt` 註明用到的模型。
- **工具放在專案裡**：`tools/comfyui/manifest.json` 固定 ComfyUI 的版本、外掛的 commit、模型的網址與 sha256；`npm run comfy:setup` 安裝到 `tools/comfyui/runtime/`（gitignore，模型約 37 GB 不能進 git），每台電腦 pull 之後跑一次，manifest 改了再跑一次；`npm run comfy` 啟動（127.0.0.1:8188）。
- **ECHO 是重點角色**，外觀依周目改變：第 1 周目完美得不真實（偶爾閃一格、露出軌道站的介面）→ 第 2 周目閃爍變多、局部線框 → 第 3 周目私人頻道是真實的樣子。表情最多、之後加分層動畫。
- **宿敵和主要角色一樣完整**。
- **每個角色開始量產之前都要和使用者確認外觀**：外觀設定卡 → 候選 → 角色設定圖 → 使用者確認 → 量產表情與姿勢。
- 參考圖在 `tools/charagen-refs/`（`<角色 id>_<編號>.jpg`，取的方向見那裡的 README.md）。它們是別人的作品：2026-11-11 使用者決定放進版本庫（版本庫是公開的，使用者知情）；只取方向、不照原圖複製，簽名、浮水印、文字一律拿掉。對應：星空藍＝ECHO（echo_1）、眼鏡長髮＝WHITEOUT、駕駛服＝SIROCCO、粉髮熊玩偶＝WREN、警示黃＝派克（veerwell_1）。

## 二、角色

| 等級 | 角色                                                                                                                                                       |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 重點 | ECHO（約 900 句）                                                                                                                                          |
| 主要 | 霍斯特、薩奇（中年女性）、派克、諾拉、米拉、教官、巴索、芮恩 WREN                                                                                          |
| 宿敵 | OXIDE、SIROCCO（女）、PROSPECTOR、STEVEDORE、SLUICE、MARSH、WHITEOUT（女）、SPECIMEN、SPIRE、COUNTDOWN、UNDERTOW、ZENITH、KESTREL、BRANT（女）、KILN、KEEL |
| 其他 | 敵兵三種（無線電喊話）；軌道站的機械語音用波形、不畫臉                                                                                                     |

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

| 期  | 內容                                                                                          |
| --- | --------------------------------------------------------------------------------------------- |
| 0   | 安裝與流程驗證（測試用的假角色：一致性、速度、檔案大小）                                      |
| 1   | 角色產生器（子專案 `mech_cordon_charagen/`、伺服器轉送 `/api/comfy`、命令列）、遊戲的立繪元件 |
| 2   | ECHO：外觀討論 → 定稿 → 全套素材，接上通訊框、簡報、全畫面劇情                                |
| 3   | 接上全部對話的地方，補每句台詞的表情與動作                                                    |
| 4   | 委託方 5 位、僚機 2 位、教官                                                                  |
| 5   | 宿敵 16 位＋插入畫面                                                                          |
| 6   | ECHO 的分層動畫（See-through）與周目外觀                                                      |
| 7   | 敵兵、軌道站的波形、收尾                                                                      |

## 六、實作紀錄

### 第 0 期

- `tools/comfyui/manifest.json`、`scripts/comfy-setup.js`（uv 建 Python 3.12 環境、torch cu128、外掛照 commit、模型續傳與 sha256）、`scripts/comfy-start.js`。
- `mech_cordon_charagen/js/comfy.js`：ComfyUI 的 API 客戶端（`/prompt`、`/ws`、`/history`、`/view`、`/upload/image`），瀏覽器與 Node 24 共用（全域 fetch／WebSocket／FormData）。
- `mech_cordon_charagen/js/workflows.js`：`txt2img`（底模＋絕區零畫風 LoRA）、`inpaintBox`（裁一塊放大重畫再羽化貼回）、`qwenEdit`。
- `scripts/chargen.js`：命令列，輸出在 `tools/comfyui/runtime/work/`。
- `tools/comfyui/nodes/mech_cordon/`（進 git）：專案自己的 ComfyUI 節點，`npm run comfy` 以 `extra_model_paths.yaml` 的 `custom_nodes` 載入。`MCAlignPaste`：用框外（往外 60 px）以 OpenCV ECC 估計仿射變換，把改過的圖對齊回原圖，再只把框內羽化貼回。
- 安裝的坑：中文 Windows 的 cp950 讓某些套件的 setup.py 失敗 → 安裝一律 `PYTHONUTF8=1`；ComfyUI-RMBG 的 groundingdino-py 等用不到又難裝的相依套件以 manifest 的 `skipReqs` 略過；civitai 有些檔案要登入（`opt` 的模型失敗只警告，設 `CIVITAI_TOKEN` 才裝）。

**測試結果**（RTX 4070 12 GB；測試用的假角色，不是正式角色）：

| 項目             | 結論                                                                                                                                                                                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 畫風             | NoobAI-XL 1.1＋提示詞 `(zenless zone zero:0.6)` 最像絕區零、最乾淨（權重 1.0 會冒出標誌般的圖案）。WAI-Illustrious＋Illustrious 版的絕區零 LoRA 會把觸發詞畫成「zzz」睡覺符號，不用（已從 manifest 拿掉）。NoobAI 專用的絕區零 LoRA 要登入 civitai，列為選用 |
| 構圖             | 全身的臉太小、表情看不清楚：主圖用大腿以上的半身（cowboy shot），全身只給角色設定圖                                                                                                                                                                          |
| 表情             | SDXL 只重畫眼睛＋嘴巴（強度 0.85）表情出得來，但眼型會變、鼻子變深；**Qwen-Image-Edit 的表情明顯比較好**（鮮明、頭髮與臉型不變、畫風一致），但它整張會固定放大約 2%、往上偏 16 px（臉以外平均差 12）→ 對齊後只剩 2.9，貼回後看不到接縫                       |
| 眨眼             | SDXL 全強度重畫眼睛會破壞瀏海（半透明重疊，只保留有變化的像素也救不回來）；Qwen 用明確的提示詞（「兩眼閉上、畫成有睫毛的細弧線、看不到虹膜」）六張都乾淨，偶爾會整個抹掉或只閉一隻 → 量產時每格多產生幾個種子挑                                              |
| 嘴型             | SDXL 只重畫嘴巴（強度 1.0）或 Qwen 都可以；框要避開麥克風之類的配件                                                                                                                                                                                          |
| 分塊貼           | 閉眼圖只貼眼睛那一塊、嘴型只貼嘴巴那一塊到表情圖上：框外和表情圖的差異是 0，所以眨眼、說話時其他地方不會閃                                                                                                                                                   |
| 速度             | 主圖約 9 秒；SDXL 局部重畫約 8 秒；Qwen 改圖 30～45 秒（12 GB 放不下，部分放在記憶體）                                                                                                                                                                       |
| 大小（WebP q88） | 主圖 76 KB、臉 7 KB、眼 3 KB、嘴 1 KB → 每個姿勢約 240 KB（10 表情 × 2 閉眼 × 3 嘴型），每個角色約 0.5 MB                                                                                                                                                    |

**定案的流程**：主圖（NoobAI）→ 表情（Qwen、對齊、貼臉）→ 每個表情的半閉／閉眼（Qwen、只貼眼睛）與三種嘴型（Qwen 或 SDXL、只貼嘴巴）。遊戲裡疊三層：表情底圖＋眼睛小圖＋嘴巴小圖。第 1 期的調整：表情多一步 SDXL 重描臉部（0.25），嘴型改用 SDXL（見下面）。

### 第 1 期

**角色產生器**（子專案 `mech_cordon_charagen/`，原生 ES modules，建置時複製到 `dist/charagen/`，伺服器在 `/charagen/` 提供；標題畫面的「角色產生器」只在伺服器網址時顯示；網址 `#<角色 id>` 直接開那個角色）：

- 7 個分頁：外觀（中文的外觀設定卡、給模型的英文標籤、不要出現的、招牌表情、參考圖）→ 主圖（姿勢的標籤、產生候選、點一張設成主圖；換主圖會清掉這個姿勢的表情與影格）→ 標框（拖曳畫臉、眼睛、嘴巴三個框）→ 表情 → 眨眼與嘴型 → 預覽 → 發佈。可以有多個姿勢。工作一次只跑一件、可以停止。
- 狀態：外觀討論中（draft）→ 外觀已確認（look，才可以量產）→ 完成（done）。
- 名單（`js/roster.js`）＝遊戲的說話者 id（`SPEAKERS`）；名單以外已經有資料的角色列在「其他」（測試用）。

**資料**（`js/pipeline.js` 檔頭有 card 的完整格式）：

- `card.json`＋發佈的 WebP 在定稿資料夾：開發模式（從專案執行 server.js、沒設 `MECH_CORDON_MODELS_DIR`）＝`src/assets/characters/<id>/`（進 git），否則 `server-models/characters/<id>/`。
- 候選、選定的圖與參考圖在 `tools/charwork/<id>/`（開發模式；2026-11-12 使用者決定用一般 git 提交，否則別台電腦的角色產生器是破圖；以前的 `server-models/charwork/` 在伺服器啟動時自動搬過去）。exe 版照舊在 `server-models/charwork/`。**一律存 WebP**（2026-11-12 使用者定案）：開發模式的伺服器在存進候選資料夾時以 `sharp`（devDependency）把 PNG／JPG 轉成 WebP（品質 92、透明度無損），網頁與命令列產生的候選、上傳的參考圖檔名都是 `.webp`；啟動時把候選資料夾裡舊的 PNG／JPG 轉掉並改 card.json 裡的檔名（轉換中 `/api/chars` 回 503）。送給 ComfyUI 的圖照舊改名 .png 上傳（ComfyUI 依內容讀）。產生新的候選後要 commit＋push。
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

### 第 2 期（完成：ECHO 的素材，接上通訊框、簡報、全畫面劇情）

**外觀**（2026-11-11 使用者確認；完整的設定卡在 `src/assets/characters/echo/card.json` 的 `look.zh`）：軌道站管制系統投射出來的「操作員」，二十多歲；黑色短髮到下巴、斜瀏海、內層挑染淡藍、髮尾微光；淡藍眼、虹膜有刻度環；左邊瀏海夾資料埠形狀的髮夾（銀色細長金屬條＋一排淡藍接點）；**右耳單耳耳機**（不是罩耳式）；白灰寬大管制外套從肩膀滑下（背面有帽子）、淡藍線條；黑色無袖高領上衣、淡淡的星座線印花；黑色工裝褲＋淡藍織帶。招牌表情 6 個：淺笑 wry、干擾 glitch、專注 focus、溫柔 tender、猶豫 hesitate、困惑 puzzled（共 14 種）。

**做法與結果**（RTX 5090：主圖 8 張約 30 秒；Qwen 改圖每張約 20～25 秒；一個姿勢的 13 個表情 × 3 候選約 15 分鐘、70 個影格 × 2 候選約 15 分鐘；發佈約 2 分鐘）：

- 主圖：第一輪 8 張的問題（胸部太大、深色背景、冒出大字、藍色太鮮豔、沒有星圖、腰間掛飾變成吉祥物）以標籤修正（拿掉 `mature female`、加 `medium breasts`、`pale blue`、`constellation print`；不要的加 `large breasts, dark background, gradient background, halo, text, letters, mascot, (cyan:1.2)`）。使用者選第二輪的 7 號（種子 72782376）。
- 髮夾是字母形狀 → `chargen.js edit --paste`（Qwen 只貼回髮夾那一塊）重畫；**框要比髮夾大一圈**（96×88 時新的髮夾超出框、邊緣糊掉，150×130 才乾淨）。p2 的髮夾用 p1 改好的圖當第二張參考圖（「和 image 2 一樣的髮夾」），兩個姿勢的髮夾一致。
- p2（通訊：一手按耳機、側頭聽回報）不用文生圖，**從 p1 的主圖以 Qwen 改姿勢**，臉與服裝和 p1 一致。角色設定圖（正面／側面／背面全身）也同樣從主圖改，但 Qwen 會把耳機畫成罩耳式、外套背面多帽子（使用者決定帽子留著）；不要的已加進 `neg`。
- 表情：Qwen 對「empty eyes」會把眼睛整個抹掉，干擾改寫成「眼睛照樣睜開、虹膜失焦沒有反光、面無表情，兩眼要清楚」。大笑三張都是閉眼＋臉紅＋大張嘴（比較誇張，使用者可以要求重做）。悲傷挑沒有眼淚的。
- 半閉眼的候選多半接近全閉。挑影格時避開：嘴型的虎牙、睫毛變藍、嘴裡的黑線。
- 發佈：2 個姿勢 × 14 表情 × 5 影格，`src/assets/characters/echo/` 共約 0.9 MB。播放器在瀏覽器合成（表情＋眼睛＋嘴巴三層）沒有接縫，去背乾淨。
- 檢查用的比較圖（候選並排、合成後的每個影格）是暫時的腳本，沒有放進專案；角色產生器的網頁也看得到同樣的東西。

**接上遊戲**（`game/portrait-ui.js`，只改外觀、各端自己顯示，不動協定）：

- `ptView(容器, 說話者, { w, h, fit, pose, expr, talk, still, replace, cls })`：說話者有立繪（`Portraits.get`）時把字母徽章換成畫布，沒有＝null、徽章照舊。畫布由自己的 requestAnimationFrame 更新（選單畫面也要動），不在 DOM 裡就拿掉、隱藏的畫面不畫；`still`＝只畫一次（小頭像）。徽章（`speakerBadge`）多了 `data-sp`，`ptBadges(容器)` 把裡面的徽章換成臉。
- **對口型**：`voicePlay` 多接一個 AnalyserNode（`voiceCur.an`、說話者 `voiceCur.sp`），`voiceLevel(sp)` 是正在說的音量；`ptTalk(sp, 說話中)`＝這個人的語音在播時照音量，否則「說話中」時模擬說話（播放器的 `talkSim`）。
- **通訊框**（`commNext`）：胸像、通訊姿勢 p2，任務中 76×88、選單畫面與矮螢幕 52×60；說話中＝語音或逐字的期間（`commTalkEnd`，點一下整句顯示就停）；台詞的第 4 個元素＝表情（第 3 期補）。框＋掃描線（`.ptComm`）。
- **簡報**（`openBrief`）：說話的人（`B.speaker` 或委託方）有立繪時，徽章換成 112×132 的胸像，簡報逐字的期間對口型。
- **全畫面劇情**（`storyText` → `storyPortrait`）：台詞裡第一個有立繪的角色（`storyQuote`）整張站在左邊（高＝畫面的 78%、最多 460 px）；逐字到那個人的第一句台詞才滑進來（`.pre`），逐字到他的台詞時對口型，其他時候變暗（`.idle`）。
- **小頭像**：通訊紀錄（`hubLog`）、失敗畫面的通訊（單人與多人的客機）。
- ECHO 的「完美得不真實」：每 3～8 秒閃一格（幾條橫向錯位），「干擾」表情時一直有。
- 冒煙測試 `testPortraits`（第 2、3、6 期的部分共 18 項）。

### 第 3 期（ECHO 的部分完成；第 4 期的角色也補上了，宿敵等第 5 期）

**台詞的表情與動作**（`data/line-expr.js` 的 `lineExpr(台詞, { ev, cue })` → `{ e 表情, a 動作 }`）：

- 查的順序：逐句指定 `LINE_EXPR`（以台詞文字為鍵，**改了台詞就退回預設**，要重新指定）→ 系統提示的 `CUE_EXPR`（增援預告一律 focus）→ 通訊事件的 `EVENT_EXPR`（segStart／bossHalf＝focus、choice＝hesitate、fail＝think、任務中的即時插播 `live`＝focus…）→ neutral。動作沒寫時依表情（`ACT_OF_EXPR`：smile／tender 點頭、surprised 往後縮、angry／focus 往前靠、glitch 被打中的抖動、hesitate／puzzled 轉開）。
- ECHO 的 902 句（通訊 409、系統提示 430、劇情與結局 23、教學評語與空戰 40）：劇情相關的約 200 句逐句指定（干擾、溫柔、猶豫、困惑、悲傷、生氣…），其他依事件與提示的種類。新增 ECHO 的劇情台詞時在 `LINE_EXPR` 補一行。
- 用到的地方：通訊框（`campComm` 依事件、`commSay`＝即時插播）、字幕條的系統提示（`subBar` 第 4 個參數）、劇情畫面（跟著正在唸的那一行：語音的 `.speaking` ＞ 逐字到的行 ＞ 最後一句）、結局畫面（ECHO 的第一句）、過場的通訊分割（`cineSub` 記下表情）。

**接上的地方**（第 2 期之外）：

- 字幕條 `#subBar`：名字前面的小頭像（`ptFaceUrl`：靜態的臉，依說話者＋表情＋大小快取成 data URL，畫好時 `ptFaceReady` 重畫）。
- 過場動畫的通訊分割（`cineCommOv`）：字母換成通訊姿勢的胸像（`ptPlayer` 快取的播放器，畫在 `ptCineCv` 再貼進覆蓋層），對口型、表情與動作。
- 結局畫面 `#epPort`：ECHO 整張站在左邊。
- 作戰室「ECHO 的紀錄」：開頭的胸像（記憶片段全部回收時微笑）。
- 還沒做（其他角色要先有立繪）：插入畫面（宿敵登場與擊破、Boss 換型態、抉擇出口）、敵兵喊話的頭像。

### 第 4 期（完成：委託方 5 位、僚機 2 位、教官）

**外觀**（2026-11-12）：設定卡在各角色的 `src/assets/characters/<id>/card.json`（`look.zh`）。使用者看過第一輪候選後交給 Claude 挑、一路做完（不再逐一確認）。**男角一律看起來年輕**（使用者定案，參考 `tools/charagen-refs/male_1～12.jpg`）：二十到三十出頭的動漫臉、修長、機能街頭風；劇本上五十多歲的霍斯特、巴索也一樣，年紀只表現在銀灰的頭髮、傷疤、服裝與神情（標籤 young man＋mature male，neg 放 old man, elderly, wrinkles, beard）。第 5 期的宿敵也照做。

| 角色            | 外觀                                                                                         | 強調色     | 招牌表情                      | p2                     |
| --------------- | -------------------------------------------------------------------------------------------- | ---------- | ----------------------------- | ---------------------- |
| 霍斯特 castron  | 銀灰短髮往後抓、鼻樑傷疤、橘色工作外套、識別證、機械錶，雙手抱胸                             | 卡斯特隆橘 | 愧疚 guilt、算計 scheme       | 通訊：手持無線電       |
| 薩奇 aetheric   | 深藍黑長髮盤髻、細框眼鏡、白研究袍＋藍線、樣本瓶胸針、平板                                   | 艾瑟立克藍 | 好奇 intrigued、觀察 clinical | 通訊：低頭看平板       |
| 派克 veerwell   | 金色短鮑伯、虎牙、螢光綠物流外套與條碼貼紙、掛耳機、碼錶（參考圖的警示黃改綠，避開聖域的黃） | 維爾威綠   | 眨眼 wink、冷酷 cold          | 通訊：按耳機舉碼錶     |
| 諾拉 sancta     | 棕髮低馬尾、雀斑、黃色野戰醫護外套、手腕纏著死者的識別牌、筆記本                             | 聖域黃     | 戒備 wary、哀悼 mourn         | 通訊：低頭寫筆記本     |
| 米拉 mira       | 灰棕捲髮＋呆毛、大圓框眼鏡、太大的研究袍、淡藍背心                                           | 淡藍       | 緊張 nervous、慌張 panic      | 通訊：抱平板回頭看     |
| 教官 instructor | 黑髮、眉骨傷疤、黑大衣紫內裡披肩、深灰立領制服、耳麥                                         | 紫         | 喝令 shout、認可 approve      | 通訊：按耳麥指向前方   |
| 巴索 basalt     | 銀白長髮低馬尾、沙色羊毛領飛行夾克、識別牌、咖啡杯                                           | 沙色       | 從容 easy、疲倦 weary         | 駕駛艙：戴耳麥坐駕駛座 |
| 芮恩 wren       | 粉色側馬尾、薄荷綠髮圈、臉頰 OK 繃、黑色連帽外套、小熊護身符                                 | 薄荷綠     | 緊張 nervous、振作 resolve    | 駕駛艙：戴耳麥握拳     |

**做法**：主圖每人 8 張候選，有問題的重畫一輪（米拉太像小孩、芮恩的駕駛服太貼身又冒出防毒面具、教官瀏海遮眼像少年、巴索戴頭盔、薩奇胸部太大，以標籤修正）；p2 從 p1 以 Qwen 改姿勢（每人 3 個種子）。表情與影格先各產生 2 張、自動選第一張，再看比較圖換掉有問題的：薩奇的「觀察」會把眼鏡拿掉（指示改成「戴著同一副眼鏡」）、芮恩有幾個表情掉了 OK 繃（`extra` 加「OK 繃留在原位」重產）、有幾張的眼淚或多出來的手、頭髮改掉的換另一張。命令列的 `var` 一次只跑一個角色（同一個角色同時跑兩個指令 card 會互相覆蓋）。

**台詞的表情**：8 位角色的 323 句（`src/assets/voice/lines.json`）逐句指定在 `LINE_EXPR` 的第二個產生區塊（`@gen4-start`～`@gen4-end`，ECHO 的在第一個），用各自的招牌表情（教官的評語＝認可、課名＝喝令；芮恩被打倒＝慌張…）。教學的 30 句評語 ECHO 也會說：同一句不同人說、表情不同時鍵寫成「說話者:台詞」，`lineExpr` 的 `sp`（通訊、劇情畫面、過場的通訊分割都會傳說話者）先查它，再查只有台詞的鍵。

**遊戲**：顯示的地方都是通用的（說話者有立繪就換），所以不用改程式：通訊框、簡報的委託方、全畫面劇情（台詞裡第一個有立繪的角色）、通訊紀錄與失敗畫面的小頭像、字幕條、過場的通訊分割。冒煙測試 `testPortraits` 加上教官的通訊（胸像、通訊姿勢、招牌表情），「沒有立繪的角色」改用軌道站。

### 第 6 期（完成：ECHO 的周目外觀、p3／p4、分層動畫）

`ptGlitch`（只有 ECHO）：

- 第 1 周目：每 3～8 秒閃一格（2～4 條橫向錯位，6%）。
- 第 2 周目：每 0.8～3 秒、錯位更大（3～7 條，11%），35% 的閃格變成全像線框（`source-atop` 只蓋在人物上的淡藍＋流動的掃描線）。
- 第 3 周目的私人頻道（`priv`：ECHO 的私人委託出擊中 `ptPriv`、ECHO 的簡報、第 3 周目的劇情畫面、真結局、作戰室的 ECHO 的紀錄）：不閃，「真實的樣子」。
- 「干擾」表情一律一直閃。

**第 3 周目「真實的樣子」**（2026-11-11 使用者選定「卸下管制官」）：另一個角色 `echo_true`（`src/assets/characters/echo_true/`，名單 `roster.js`），外觀設定卡在它的 `look.zh`：同一張臉與髮型、髮夾，拿掉耳機與刻度環、外套穿好、淡藍針織高領毛衣（胸前一顆白色星星）、髮尾暖白。p1 從 ECHO 的 p1 主圖以 Qwen 改服裝（種子 22，使用者選 2 號），沿用 ECHO p1 的框。遊戲裡 `ptView` 的 `priv` 為真時先找 `echo_true`（沒有＝照舊 echo）；說話者、語音、閃格照 echo。

**p3、p4**（使用者選定）：

- ECHO 的 p4「管制台」：從 p1 以 Qwen 改姿勢（種子 14，4 號），側身操作淡藍的全像面板。
- echo_true 的 p3「坦白」：從 echo_true 的 p1 改姿勢（種子 41，第二輪 B 組 1 號）：一手抓著另一隻手臂、側身、眼睛往上看。第一輪寫「雙手抱著自己的手臂」出來的是抱胸（看起來不耐煩），改寫成「右手抓著自己的左上臂、肩膀縮著」才對。
- 依表情換姿勢（`ptPose`／`ptSetExpr`）：ECHO 的專注（focus，包含任務中的即時插播）＝p4；echo_true 的悲傷、猶豫、困惑＝p3；其他＝指定的姿勢（通訊框 p2）或 p1。播放器沒有那個姿勢時退回第一個。
- **同一個角色不能同時跑兩個產圖指令**（`var`／`missing` 各自讀寫整張 card，後寫的會蓋掉前一個的候選與選取）。這次 p1 與 p3 同時跑時 p3 的選取被蓋掉，p3 的工作就以為表情還沒選、又重產了一輪；候選的圖都還在候選資料夾，依檔案時間重建。

**分層動畫**（See-through，Apache-2.0；ComfyUI 外掛 `ComfyUI-See-through`（MIT）固定在 manifest，`bitsandbytes` 不裝（只有小顯示卡的 nf4 要））：

- 發佈時 card 的 `layers` 為真就拆層：`SeeThrough_LoadLayerDiffModel`／`LoadDepthModel`（模型第一次從 Hugging Face 下載，約 10 GB）→ `GenerateLayers`（1280、30 步、種子 42）→ `GenerateDepth` → `PostProcess`（左右拆開、LaMa 補頭髮）→ 專案節點 `MCLayerGroups`：約 20 層依名稱分成**後髮 hairb／身體 body／頭 head（臉、眼、眉、睫毛、耳、鼻、嘴、頭飾、耳飾、眼鏡）／前髮 hairf**，換算回原圖座標（See-through 的畫面＝原圖置中補成正方形再縮到 1280），**看得到的像素一律用原圖的顏色**（每個像素歸最上面那一層），只有被遮住的地方用補畫的內容，透明度一律不超出去背的輪廓，所以四層疊起來＝主圖。層的名稱要精確比對（`topwear`、`handwear` 也含 `ear`，第一版用「包含」把整個身體分進了頭）。後髮常被補畫成垂到腰的長髮，被輪廓裁掉、壓在身體後面，看不到。
- 發佈的 pub 多 `layers: { hairb, body, head, hairf }`（WebP，ECHO 3 個姿勢共約 0.56 MB），建置一起打包。拆層一個姿勢約 1～2 分鐘，發佈的等待上限是 1 小時（第一次下載模型）。
- 播放器（`portrait.js` 的 `drawLayers`）：後髮 → 身體 → 頭（＋表情／眼／嘴的小圖）→ 前髮；頭與頭髮繞脖子微轉（兩個慢的正弦＋說話的音量），頭髮由上往下越來越晃（每 4 px 一條、在原尺寸的暫存畫布上位移再整張畫上去：直接在縮放過的畫布上一條條畫，條的邊緣會有細縫）。小圖只留「不動時看得到臉」的部分（頭那一層 − 前髮，`patchIn` 快取），前髮晃開時下面是補畫的額頭。`Portrait.layersOn` 關掉＝原本的畫法。
- 冒煙測試 `testPortraits` 加上：專注的句子用 p4、四層有載入、私人頻道換成 echo_true。

## 七、交接（2026-11-11，換到另一台有顯示卡的電腦繼續，之後都在那台做）

**2026-11-11 更新**：已經在新電腦（RTX 5090）上。完整 `npm test` 2583 項全過（ComfyUI 沒開；交接時的 4 項失敗沒有重現）。`scripts/comfy-setup.js` 修正：從 Git Bash 執行時 PATH 上的 GNU tar 把「C:」當成遠端主機、也解不開 zip，Windows 改用系統的 `System32\tar.exe`。ECHO 的素材完成並接上通訊框、簡報、全畫面劇情（第六節第 2 期），**之後 ECHO 也接上字幕條、過場的通訊分割、結局、作戰室，補了每句台詞的表情與動作（第 3 期的 ECHO 部分），周目的閃格與線框、第 3 周目「真實的樣子」（echo_true）、p3 坦白與 p4 管制台、See-through 的分層動畫（第 6 期）。2026-11-12 第 4 期（委託方 5 位、僚機 2 位、教官）完成。下一步**：第 5 期（宿敵 16 位＋插入畫面）。

以下是當時的交接內容：

**進度**：第 0、1 期完成（commit 883993a3）。第 1 期的完整 `npm test` 跑到 2092 項通過時，原本那台電腦記憶體不足被系統停掉（ComfyUI 同時佔著記憶體），當時 4 項失敗、都在這期沒改到的地方（水波、HEARTH 打斷大招、方舟的甲板升降砲塔與甲板軌道砲兵），還沒重跑確認；伺服器段（含 `testCharagen`）單獨跑 30 項全過。

**還沒有任何正式角色**：`src/assets/characters/` 是空的（測試角色 test_op 只在原本那台的暫存資料夾）。

**新電腦的準備（照順序）**：

1. `git pull`、`git lfs pull`、`npm install`。
2. `npm run comfy:setup`：安裝 ComfyUI、Python 環境與模型（約 30 GB，要 NVIDIA 顯示卡；中斷重跑會續傳）。裝完 `npm run comfy:setup -- --check` 全部是「完成」（`zzz_noob` 是選用的，「未下載」沒關係）。顯示記憶體小於 12 GB 時 Qwen-Image-Edit 會更慢（模型一部分放在記憶體），可以在 manifest 換成比較小的量化版（Q3_K_M 約 9.9 GB）。
3. **跑一次完整的 `npm test`，跑的時候不要開 ComfyUI**（原本那台 32 GB 記憶體，兩個一起跑就不夠）。有失敗先看是不是那 4 項、重跑確認。
4. 產圖時：`npm run comfy`（ComfyUI），另一個終端機 `npm start`（伺服器；從專案執行＝開發模式，定稿直接寫進 `src/assets/characters/`）。角色產生器在伺服器網址的 `/charagen/`（標題畫面的「角色產生器」），命令列 `scripts/chargen.js char …`（`--server` 預設讀 `mech-cordon-server.json` 的 port）。第一次發佈時去背的 `BiRefNet_toonout` 由 ComfyUI-RMBG 自動從 Hugging Face 下載。
5. 參考圖在 `tools/charagen-refs/`（pull 就有）；做某個角色時在角色產生器「外觀」分頁上傳，或用 API 寫進候選資料夾（`PUT /api/chars/<id>/work/ref_1.jpg`，再把檔名加進 card 的 `refs`）。

**下一步＝第 2 期 ECHO**：先寫外觀設定卡給使用者確認（參考圖 `tools/charagen-refs/echo_1.jpg`：黑短髮挑染藍、藍眼、星空印花、行星掛飾、寬大外套；改成 ECHO 自己的設計，代表色淡藍 #7fc8ff；第 1 周目的「完美得不真實」外觀），使用者確認後才產生候選 → 角色設定圖 → 再確認 → 量產 → 接上通訊框、簡報、全畫面劇情。

**注意**：

- 每個角色量產前都要和使用者確認外觀（第一節）。
- 產圖與測試不要同時跑（記憶體）。ComfyUI 不用時關掉。
- 候選圖在 `tools/charwork/`，跟著 git 走（產生之後記得 commit＋push）。
