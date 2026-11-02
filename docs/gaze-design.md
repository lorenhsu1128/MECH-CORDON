# 眼動追蹤（攝影機）

2026-11-02 定案：一般玩家用筆電的網路攝影機就能玩；功能是「看哪鎖哪」與「頭部延伸視角」，兩個各自獨立的開關；
區網伺服器加上自簽憑證的 https（攝影機只在安全環境可以用）；設定裡有總開關與校準。

## 為什麼是「看哪鎖哪」，不是眼睛當準星

網路攝影機的眼動追蹤準度約 2～4°（60 cm 外看 24 吋 1080p，誤差 100～150 px），而且一場下來會飄。
當準星太抖太飄；但這個遊戲本來就是鎖定制（火控預判 `leadPoint`、彈道修正 `bend`），命中靠鎖定＋輔助，
所以注視點只拿來「從畫面上幾台敵人裡挑一台」，100 px 的誤差足夠。頭部的轉向比眼球穩定得多，拿來轉鏡頭。

## 架構

- **素材**：`@mediapipe/tasks-vision`（devDependency，Apache-2.0）＋臉部模型 `src/assets/gaze/face_landmarker.task`
  （Apache-2.0，`CREDITS.txt`）。`scripts/build.js` 的 `writeGaze` 寫成 `dist/lib/gaze-assets.js`（約 25 MB）：
  打包後的 JS（`window.RUBICON_GAZE_LIB`＝{ FaceLandmarker, FilesetResolver }）＋`window.RUBICON_GAZE`＝
  { loader: wasm 載入程式（文字）, wasm: base64, model: base64 }。不內嵌在 HTML，打開眼動追蹤時才以 `<script>` 載入。
  直接開檔時不能 fetch 本地檔案，所以載入程式與 wasm 換成 **blob 網址**交給 `createFromOptions`（data 網址不行），
  模型用 `modelAssetBuffer`。顯示卡（GPU delegate）失敗時改用 CPU。MediaPipe 把 INFO／glog 的訊息印到
  console.error，`quietMediaPipe` 濾掉這兩種。
- **純函式** `src/core/gaze.js`：`gazeFeatures`（478 個特徵點＋blendshape＋轉換矩陣 → 13 個特徵：虹膜在眼睛裡的
  位置（扣掉翻滾、兩眼平均）、眼睛張開程度、eyeLook 的左右／上下、頭的 yaw／pitch／位置、幾個二次項；眨眼）、
  `headPose`（矩陣是 column-major，yaw＞0＝往自己的左邊轉頭，pitch＞0＝抬頭）、`gazeFit`（特徵標準化＋嶺迴歸 →
  畫面 0～1）、`gazePredict`、`OneEuro`（慢時壓抖、快時跟上）、`headRate`（死區＋到全速的範圍）。
- **遊戲** `src/game/gaze.js`（mixin，`this.gz`）：
  - `gazeStart`（載入、`gazeLandmarker`、開攝影機（640×480、前鏡頭））、`gazeStop`；總開關打開時不在載入遊戲時
    就開攝影機，進任務（`state` 'play'）或在設定裡打開、校準時才開。影像元素 `#gazeVideo` 平時是 2 px、
    透明（不能 display: none，有的瀏覽器會停播）。
  - `gazeTick`（主迴圈每格，實際偵測約 30 Hz、影像有新的一格才做；約 4 ms）：特徵 → 校準模型 → One-Euro →
    `gz.x／gz.y`（CSS px）；看不到臉或眨眼超過 0.4 秒注視點失效。頭的中心＝開始後前 15 次的中位數，之後頭擺正
    （死區內）時慢慢跟上坐姿；校準完成時以校準期間的頭部姿勢為中心。
  - **看哪鎖哪** `gazeLockTick`（`player.js` 的 `autoLock` 開頭，單機、房主與客機共用）：攻擊距離內、畫面上的
    敵人（不含可以打掉的投射物、煙霧裡的），離注視點的距離扣掉目標在畫面上的大小，在半徑 max(60 px, 畫面高 10%)
    內最近的是候選；目前鎖定的目標有遲滯。候選連續停留 `dwell` 秒（0.15／0.25／0.4）才換鎖定。看沒有敵人的地方、
    找不到臉時不解除也不換。追尾視角看著鎖定的目標時，目標離開鎖定框也不換（`gazeHolds` → `chaseAutoLock`）。
    切換鍵與點擊鎖定照常。多人時客機本來就把鎖定目標的 id 送給房主，不改協定。
  - **頭部延伸視角** `gazeHeadRate`（`chase.js` 的 `camAimInput`）：追尾與第一人稱，頭往左右（上下）轉超過
    死區（約 6°，上下 7°）時鏡頭往那邊轉，轉越多越快（最快 1.8／1.0 弧度／秒 × 靈敏度 × 設定的倍率），
    頭擺正就停。俯視、空域、目標輔助正在帶鏡頭時不作用。
  - HUD `gazeHud`：停留中的候選目標外面畫一圈依停留時間畫滿、注視點（設定「顯示注視點」）、狀態提示
    （載入中、找不到臉、尚未校準）。
  - 設定（`#gazeBox`，`renderGazeSettings`）：總開關、狀態（偵測到臉、校準的誤差與日期）、看哪鎖哪＋停留時間、
    頭部延伸視角＋速度、顯示注視點、「開始校準…」。不是安全環境時顯示說明與伺服器的 https 網址。
  - 校準畫面（`#gazeCal`，`gazeCalOpen`）：攝影機預覽（鏡像）與是否偵測到臉 → 9 點（每點 1.6 秒：0.6 秒移動與穩定、
    之後每個新的偵測結果算一筆）→ 擬合 → 驗證 5 點（每點取中位數，報平均誤差 px 與畫面高的比例：6% 以下很好、
    11% 以下可以用）→ 驗證的資料加進去重新擬合 → 藍點即時顯示注視點。Esc／取消還原原本的校準；手把照選單規則操作。
- **設定與存檔**：`ctrl.gaze`＝{ on, lock, head, dwell, headK, dot }（`rubicon_ctrl`）；校準結果
  `rubicon_gaze`＝{ v, M: { mu, sd, w }, err, t }（和裝置與坐姿有關，不放進設定）。

## 安全環境與伺服器的 https

瀏覽器只在 https、localhost、file:// 提供 `getUserMedia`，別台電腦用 `http://192.168.x.x` 連進來時拿不到攝影機。
`server.js` 在遊戲 port 之外開 https（`cfg.httpsPort`，預設 443，控制台可以改，0＝不開；被佔用時只記日誌）：
同一個處理函式、WebSocket 中繼改成 `noServer` 讓 http 與 https 的 upgrade 都交給同一個 `wss`。
憑證是 `rubicon-cert/cert.json`（`selfsigned` 產生，RSA 2048／SHA-256，10 年，主體別名 localhost、電腦名稱、
127.0.0.1、產生時的區網 IP）：**提交進 git**，建置時複製到 `dist/rubicon-cert/`（exe 版讀 exe 旁的），所以別台電腦
pull 下來就是同一張；只有沒有或快過期時才重新產生（IP 不同不重產——自簽的憑證一律會警告一次，名稱不符也一樣可以
「繼續前往」）。私鑰在版本庫裡，只適合區網遊戲，不是真正的安全保護。遊戲頁注入 `window.RUBICON_HTTPS`（port），
設定畫面據此給出 https 網址；控制台在每個區網位址旁列出 https 網址。`RUBICON_CERT_DIR` 可改憑證的位置
（冒煙測試指到暫存資料夾）。

## 測試

`testGaze`：真的 MediaPipe 從 `lib/gaze-assets.js` 初始化並偵測 `scripts/fixtures/face.jpg`（478 點、13 個特徵、
正臉）；其他用 `window.__gazeSim(秒, game)`（不開攝影機，由測試提供特徵）：設定的開關、校準流程與誤差、注視點、
看哪鎖哪（停留、開關、找不到臉）、頭部延伸視角（左右、上下、擺正就停、開關）。`server` 另外檢查 https 的 /health、
`RUBICON_HTTPS` 的注入與 wss 中繼。真的攝影機只能由人實際試。

## 之後可以做

- 空域的 MS-4／MS-8 多目標鎖定用眼睛掃過去標記。
- 校準的漂移修正（例如鎖定成功時用目標的位置微調偏移）。
- Tobii 等專用眼動儀：本機的橋接程式以 WebSocket 送注視點，接在同一個 `gz.x／gz.y` 介面。
