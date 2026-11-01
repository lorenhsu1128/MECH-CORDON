# 音效改版（分層的槍聲、戰場的空氣、機甲的重量、駕駛艙語音、動態戰鬥配樂）

2026-11-01 使用者定案：原本的音效「太簡陋、沒有帶入感，槍聲很平、沒深度」。參考其他遊戲的作法、大量蒐集可以用的素材，**五期全部做**；可以用 CC-BY 的素材（要署名）；做任務中的戰鬥配樂；駕駛艙與通訊的語音用**繁體中文 TTS 的溫柔女聲**（給 ECHO）。

## 改版前的問題

- 83 個音檔共 1.3 MB（平均 16 KB），大多不到 1 秒：沒有尾音與空間感。
- 一發槍聲＝1 個主樣本＋1 個低頻樣本；步槍只在 2 個樣本裡輪流；音量從不隨機。
- 沒有發聲上限與優先順序（一群敵人一起開火就糊成一片），主輸出只有壓縮器沒有限幅。
- 殘響是雜訊產生的，峽谷、城市、洞窟聽起來差不多。
- 沒有的類別：伺服馬達與液壓、敵人的推進器、子彈掠過、跳彈、彈殼、裝填與過熱、駕駛艙語音、任務中的配樂。
- `swing`、`wreck` 有呼叫沒有檔案；雷射霰彈槍用火藥霰彈槍的聲音；MS-4／MS-8／電漿導彈同一個聲音。

## 參考的作法（出處見文末）

| 遊戲                            | 借用的作法                                                                                                     |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| CoD Modern Warfare 2019         | 一發＝主瞬態＋機械聲＋尾音＋超低頻，每把槍多個素材隨機組合；依周圍幾何的反射音（延遲照音速）；子彈掠過聲       |
| Battlefield 1                   | 同一把槍錄近、中、遠再交叉淡化（不靠濾波器模擬距離）；爆炸拆成破片、衝擊波、回響、碎屑四層；刻意減少同時發聲數 |
| Titanfall 2                     | 依「這個敵人是不是正在瞄準你」即時調大危險的聲音；BT 的語音分駕駛艙、機外、無線電三層依位置交叉淡化            |
| MechWarrior 5 Clans、War Robots | 自機的聲音永遠優先、大聲約 10%；敵人的槍只用近與遠兩層、不放低頻；同一台的多把相同武器只播一把                 |
| Overwatch                       | 正在攻擊你的敵人比較大聲，其他壓低                                                                             |
| Doom Eternal                    | 戰鬥配樂分四級強度                                                                                             |
| Ace Combat 7                    | 被鎖定時持續的導彈警報＋無線電                                                                                 |

## 檔案與載入

- `src/assets/sfx/*.mp3`：原本的 83 個，照舊內嵌在 HTML（介面音、載入前就要有的聲音）。
- `src/assets/sfx2/*.mp3`：新增的分層素材（單聲道、44.1 kHz、依用途 64～96 kbps），建置成 `dist/lib/sfx-assets.js`（`window.RUBICON_SFX2`），遊戲啟動後載入（`SFX.loadPack`）；**載到之前所有配方都退回原本的樣本**（配方的每一層找不到檔案就略過，主層有 `fb` 後備）。
- `src/assets/bgm/*.mp3`：任務中的配樂（立體聲 96 kbps），建置成 `dist/lib/bgm-assets.js`（`window.RUBICON_BGM`），第一次進任務才載入。
- `src/assets/voice/echo/*.mp3`＋`index.json`：ECHO 的語音（單聲道 24 kHz、32 kbps），建置成 `dist/lib/voice-assets.js`（`window.RUBICON_VOICE`＝{ 雜湊: base64 }），第一次播通訊時載入。
- 各資料夾的 `CREDITS.txt` 照 `src/assets/music/` 的格式寫來源與授權，建置時寫進產生的 js 檔頭。

## 第 1 期：混音管理

- **發聲上限**（`audio.js` 的 `voices`）：同時最多 `VOICE_MAX`（48）個；同一個鍵最多 `KEY_MAX`（預設 4，配方可以改）個。超過時搶走「優先度最低」的（優先度＝音量 × 距離衰減 × 類別權重：自機 3、威脅中的敵人 1.6、其他 1、環境 0.6），新的比最低的還低就不播。被搶走的 10 ms 內淡出（不會喀一聲）。
- **主輸出**：壓縮器之後加限幅器（threshold −3 dB、ratio 20、knee 0、attack 1 ms），不會爆音。
- **隨機化**：音量 ±1.5 dB、音高照舊（配方可以改），多個素材輪流（不連續選到同一個，`rr`）。
- **音量設定**（設定畫面「聲音」）：主音量、音效、配樂（過場＋任務）、語音、介面，`ctrl.vol = { m, s, b, v, u }`（0～1）；語音（`ctrl.voice` on／off）、戰鬥配樂（`ctrl.bgm` on／off）。
- **威脅導向**：主攻（攻擊權杖持有者）、預警中、正在鎖定玩家的敵人發出的聲音 +3 dB（優先度也提高），其他敵人 −2 dB（`SFX.threat(e)` 由呼叫端算好，傳 `pr`）。
- **多人的轉送**：以前每一個 `play()` 都轉送，分層之後會變成好幾倍。改成高階的呼叫（`SFX.at(名稱, 參數, 位置)`：shot、explode、hit…）整個轉送一次，客機依**自己的**距離決定播哪幾層（`{ t: 'sfx', f, a, p }`；舊的 `k` 格式照舊支援）。`NET_VERSION` 提高。
- **修正**：補上 `swing`、`wreck`；雷射霰彈槍、電漿導彈、MS-8 各自的聲音。

## 第 2 期：分層的槍聲與戰場的空氣

- **武器配方**（`audio/recipes.js`，純資料）：每種武器一份 `{ near, far, mech, low, tail, gap, rate, vol }`，每一層是素材清單（輪流）。
  - near：近距離的本體（槍械庫的 near distance 錄音、科幻包的能量武器）。
  - far：遠距離（槍械庫的 mid distance 錄音再低通、加長尾音）。
  - mech：機械聲（槍機、轉管、能量充填、導彈莢艙的艙蓋），自機才播。
  - low：超低頻的重擊（合成：50～70 Hz 正弦＋快速衰減），自機才播。
  - tail：尾音（依主題換，見下面的環境）。
- **距離**：0～`NEAR_D`（40 m×DS）只用 near，到 `FAR_D`（110 m×DS）交叉淡化成 far，更遠只用 far；敵人的槍一律濾掉 120 Hz 以下（MW5 的作法：低頻留給自己的槍與爆炸）。
- **自機**：near＋mech＋low＋tail，比敵人大聲約 10%（War Robots）；第三人稱時加一點點立體寬度（左右各延遲 6／9 ms 的兩份）。
- **環境的尾音**（`ENV[主題]`）：開闊（短、亮）、峽谷（長的 slap，延遲 0.25～0.45 s）、城市（多次短反射）、室內／岩頂（密、暗）、海上（幾乎沒有）。以 DelayNode＋低通＋回授做兩條反射線（不用多一個 Convolver），開火時依主題送出；遠的槍聲送出量較大。
- **子彈掠過**（`SFX.whiz`）：敵人的子彈從玩家 `WHIZ_R`（6 m×DS）內飛過時（投射物每格檢查最近距離，客機也算），播合成的掠過聲：帶通雜訊，音高與聲道照相對速度掃過；實彈＝撕裂聲，雷射＝電弧的嗡聲。同一時間最多 3 個。
- **跳彈**（`SFX.ricochet`）：實彈打到地形與金屬物件時 25% 播一次（合成：正弦往下掃頻＋短雜訊）。
- **彈殼**：已經有特效的地方（`mech-entity.js` 的彈殼）在 0.35～0.6 秒後播落地聲，依地面材質（金屬叮、混凝土、沙地悶、水裡沒有），機甲尺度的彈殼音高較低（模態合成：3 個不成倍數的衰減正弦）。只播 25 m 內。
- **命中依材質**：`hitWorld` 依 `surfAt`（金屬、混凝土、沙、雪、冰、水），水花、沙土各有自己的素材。
- **爆炸四層**：瞬態（近距離的劈啪）＋本體＋回響（依環境的尾音）＋碎屑落下（0.3～0.9 秒後的金屬與石塊，散在周圍幾個位置）；小爆炸也有短尾音。距離遠時只剩本體的低頻與回響。

## 第 3 期：機甲的重量與推進器

- **伺服馬達與液壓**（`SFX.servo`）：玩家機體轉身、起步、急停、手臂舉槍時播短的伺服聲（合成：鋸齒波經帶通，音高照速度往上滑；液壓＝低通雜訊的「嘶」）＋素材（blacklodge 的 robo）。敵人的只在 20 m 內、而且降低頻率。
- **腳步**：素材換成機甲的踩踏（Barkovich robotic、qubodup stomp）＋合成的超低頻（45～60 Hz，重的腳更低更長）＋地面材質層（原本的）；依腳部類型：二足、輕二足（快、輕）、重二足（沉）、逆關節（尖、彈）、四足（四聲錯開）。戰車：履帶的循環音（依速度）。
- **推進器**：
  - 自機：原本的循環音分兩層（低沉的轟＋高頻的嘶），依推力與速度交叉淡化。
  - 敵人：最近的 4 台正在推進的機體各掛一個有位置的循環音（`SFX.loopAt`，離開或停下就淡出），可以「用耳朵找高速的敵人」。
- **QB 三段**：預備（50 ms 的吸氣）→ 噴發（原本的＋低頻重擊）→ 收尾（0.4 秒的嘶）。突擊推進：點火的轟＋持續的引擎＋解除時的降頻。
- **落地**：依落下速度加超低頻與液壓的「嘶」。

## 第 4 期：回饋、駕駛艙與 ECHO 的語音（語音已移除，見實作紀錄）

- **三段回饋**：命中（短、清脆，照舊依武器）→ 打出失衡（低音重擊＋玻璃碎裂＋上升的「叮」）→ 擊破（重的「咚」＋殘響長的鐘聲，連殺往上升）；Boss 的 BREAK 另外有一段短的配樂重音（stinger），Boss 擊破＝長的重音＋配樂收尾。
- **武器的狀態音**：裝填開始與完成（依種類：彈匣、彈鏈、導彈莢艙、能量）、能量武器過熱、彈藥打空（空扳機的「喀」）、主動裝填成功（已有）。
- **語音**（`audio/voice.js`）：
  - TTS：Kokoro-82M v1.1-zh（Apache-2.0，中文資料由 LongMaoData 授權提供），女聲；產生腳本 `scripts/voice-gen.py`（要 Python 3.10～3.12 與 kokoro、misaki[zh]，產生後轉成 mp3），文字以 `scripts/voice-lines.js` 從 `data/story-comms.js` 與各處的 `commSay('echo', …)` 收集，鍵＝文字的雜湊（改了台詞就要重新產生，沒有語音的台詞照舊只有文字）。
  - 通訊：`commSay`／通訊佇列播到 ECHO 的句子時播語音，通訊框的逐字速度配合語音長度；說話時世界的聲音壓低（原本的 duck）。
  - 駕駛艙的系統語音（ECHO）：鎖定被敵人導彈鎖定、導彈接近、AP 低下（50％／25％）、彈藥不足、彈藥耗盡、增援接近、Boss 出現、失衡、任務完成、撤退……（`VOICE_CUES`，每種有冷卻，同時只說一句、優先度高的打斷低的）。
  - 音色：俯視與追尾＝無線電（帶通 300～3400 Hz、輕微失真、開頭結尾的雜訊）；第一人稱＝駕駛艙內（較完整、小空間的殘響）（Titanfall 2 的 BT）。
- 多人：語音各端自己播（台詞與事件本來就各自顯示）。

## 第 5 期：動態戰鬥配樂、空域、程式合成

- **配樂的強度**（`game/bgm.js`）：0 探索（沒有交戰中的敵人）、1 警戒（有起疑／搜索中的敵人、增援預告）、2 交戰、3 Boss；依 `ai-director` 的狀態與 Boss 關決定，往上切換快（1 秒）、往下慢（交戰結束 8 秒後才降），每一級一首循環曲，交叉淡化 2～4 秒；探索時低通＋小聲，警戒時打開。Boss 換型態時插重音並換成更激烈的曲子；空域有自己的曲子。
- 曲目：Kevin MacLeod（CC-BY 4.0）的曲子，剪成可以循環的段落（`scripts/bgm-prep.py`）；各主題可以指定不同的探索曲。
- 設定「戰鬥配樂」關閉時照舊沒有配樂；暫停時壓低，結果畫面淡出。
- **空域**：擦身飛過的 Doppler（自己依徑向速度算 playbackRate，c＝343 m/s、夾在 0.7～1.4）＋blacklodge 的飛掠素材；超過音速的敵機音爆；導彈警報分三級（被鎖定＝慢的嗶、導彈發射＝快的嗶、接近＝連續音）。
- **程式合成**（`audio/synth.js`）：雷射（鋸齒波＋快速往下掃頻＋短雜訊）、EMP（低頻嗡聲＋電弧的雜訊）、能量環、蓄力（往上掃的和聲，依蓄力進度）、警報嗶聲；可以無限變化、不增加檔案大小。合成好的短音先算成 AudioBuffer 快取（`OfflineAudioContext`），之後和一般樣本一樣播放。

## 素材與授權（2026-11-01 查核；只收 CC0／CC-BY）

| 素材                                                                                   | 授權       | 用途                           |
| -------------------------------------------------------------------------------------- | ---------- | ------------------------------ |
| Still North Media「The Free Firearm Sound Library」（OpenGameArt）                     | CC0        | 槍聲的近距離／中距離錄音       |
| Still North Media「Medieval sound effects - Weapon impacts」                           | CC0        | 近戰的刀刃交擊                 |
| blacklodgegames「50 Free SciFi SFX」「27 Metal Audio Samples」                         | CC0        | 飛掠、機械、能量場、警報、金屬 |
| rubberduck「50 CC0 sci-fi SFX」「25 CC0 bang SFX」                                     | CC0        | 雷射、砲聲                     |
| Kenney「63 Digital SFX」                                                               | CC0        | 雷射、介面                     |
| qubodup「Mech stomp step」「Impact」                                                   | CC0        | 機甲腳步、撞擊                 |
| bart「33 metal clang sounds from cast iron pans」、「Metal Impact Sounds」             | CC0        | 彈殼、金屬撞擊                 |
| Michel Baradari「Chaingun, pistol, rifle, shotgun shots」「2 High Quality Explosions」 | CC-BY 3.0  | 槍聲、爆炸                     |
| Lee Barkovich「Robotic/mechanic step sounds」                                          | CC-BY 3.0  | 機甲腳步、伺服                 |
| Blender Foundation「Big Explosion」（DeathFlash）                                      | CC-BY 3.0  | 大爆炸                         |
| Kevin MacLeod（incompetech.com）                                                       | CC-BY 4.0  | 任務中的配樂                   |
| Kokoro-82M v1.1-zh（hexgrad）                                                          | Apache-2.0 | ECHO 的語音（產生的音檔）      |

**不能用的**：Sonniss GDC 包、Pixabay、Mixkit、ZapSplat、99Sounds、Voxengo 的脈衝響應（自訂授權，禁止散布原檔——我們的 HTML 以 base64 內嵌，解得回原檔）；BBC 音效庫（非商用）；Freesound 上 CC-BY-NC 的檔案；OpenGameArt 上 CC-BY-SA、GPL 的包；授權沒寫的 TTS 模型（MediaTek Breeze2-VITS）。

## 出處

- CoD MW：https://www.asoundeffect.com/call-of-duty-modern-warfare-sound/ 、Warzone：https://www.asoundeffect.com/call-of-duty-warzone-sound
- Battlefield 1：https://asoundeffect.com/battlefield-1-sound/ 、Frostbite HDR：https://www.slideshare.net/slideshow/adaptive-mixing-in-frostbite/3128152
- Titanfall 2：https://asoundeffect.com/titanfall-2-sound/
- MechWarrior 5 Clans：https://mw5mercs.com/news/2025/04/147-flash-storm-frequencies-audio-in-mechwarrior-5-clans
- War Robots：https://gamedeveloper.com/audio/how-to-record-a-giant-mech-recording-sound-design-with-war-robots
- Overwatch：https://pcgamer.com/how-overwatch-uses-sound-to-pinpoint-threats-you-cant-see
- Doom Eternal：https://sifter.com.au/post/the-ingredients-of-doom-composer-mick-gordon-on-the-soundtrack-of-doom-eternal
- Ace Combat 7：https://kotaku.com/ace-combat-7s-sound-design-is-amazing-1831879843
- Web Audio 效能：https://www.abratabia.com/web-game-audio/audio-performance.php

## 實作紀錄

2026-11-01：五期一起完成（冒煙測試 `testAudio`、`testAudio2`）。

- **第 1 期**：`audio.js` 的發聲上限（`voiceAdmit`／`voiceKill`）、限幅器、音量隨機、`pickKey` 輪流；設定畫面的「聲音」（`settings.js` 的 `renderVolSettings`，音量用下拉選單，手把的左右就能改）；多人改成高階呼叫的轉送（`NET_FNS` 的包裝、`ser`／`netPlay`，`NET_VERSION` 11.16），開火一律傳射手（`shot(種類, id, 發射點, 實體)`），所以客機也聽得到房主自己的槍、收到自己的那一槍照自機播。修正 `swing`（迴旋刃 → `meleeSwing`）、`wreck`（岩牆碎裂 → `SFX.wreck`）。
- **第 2 期**：`recipes.js` 的 17 種配方（每把武器 id 對應一種），槍械庫切成單發（`scripts/sfx-prep.py`：近距離的 near、中距離錄音當 far，`loud`／`free` 處理夾在錄音裡的上膛聲與回音）。反射用兩條延遲線（不多開 Convolver）。子彈掠過在 `projectile.js` 每格呼叫 `projWhiz`（最近點在線段內、沒有打中才播，房主與客機各自算；空域照舊 `airWhiz`，多一層合成的掠過聲）。彈殼在 `fx.casing` 旁邊呼叫 `SFX.casing`（會轉送）。
- **第 3 期**：伺服、液壓、QB 的吸氣與收尾、推進器的高頻層都是合成的（`synth.js`），伺服另疊 blacklodge 的 robo 素材；腳步加機甲的踩踏（Barkovich、qubodup）與超低頻，依腳部類型挑素材；敵人的推進器只給有腳的機體（`stats.parts.legs`），最近 4 台。
- **第 4 期**：BREAK／擊破的配樂重音、裝填、空扳機、EN 用完。**ECHO 的語音已移除**（2026-11-01 使用者：「太難聽了」）：做過的版本是 Kokoro-82M v1.1-zh 的中文女聲 zf_042（58 個聲音以音高、起伏、頻譜重心篩選）唸 360 句（通訊、序章與章節畫面、系統提示、增援預告的片段組合），輕微的無線電音色；問題在 TTS 本身（普通話口音、語氣平板），不是混音。程式（`game/voice.js`、`data/voice.js`、`scripts/voice-lines.js`、`voice-gen.py`）與語音檔都拿掉了，要找回參考 commit d32068a。
- **第 5 期**：配樂 10 首（探索 2、警戒 2、交戰 3、Boss 2、空域 1），每首約 100 秒的循環。Boss 的 BREAK、換型態與擊破有合成的重音（`~sting`／`~stingL`）。空域的敵機飛掠（`airFlybyTick`：相對位置與相對速度的內積由負轉正）、導彈快打中時的第三級警報（`warnB`）。

### 語音重做：VoxCPM2 與試聽（2026-11-01，進行中）

使用者要求：調查 VoxCPM、整合成遊戲的 TTS，參考絕區零、異環的女角配音做 ECHO 的聲音，標題頁做試聽。定案：

- **引擎**：VoxCPM2（OpenBMB，2B、48 kHz、Apache-2.0；聲音設計＝句首括號裡的描述，不用參考音檔；controllable cloning＝參考音檔＋語氣指示）。顯示卡記憶體約 8 GB（RTX 4070 可以）。
- **整合方式**：方案 A，先產生再內建（和 Kokoro 版相同：產生音檔 → `lib/*.js`，直接開檔、多人都能用）。沒選的：伺服器即時產生（要 Python＋顯示卡，exe 帶不了）、瀏覽器內執行（社群的 WebGPU ONNX 移植約 1.9 GB、實驗性質、file:// 讀不到）。
- **聲音**：只參考二次元遊戲的**選角類型**，用文字描述產生，**不克隆任何遊戲的原聲**（配音員的聲音與錄音都有權利，克隆後散布不行）。6 種類型（冷靜管制官、溫柔知性、AI 系統感、慵懶酷系、成熟低音、可愛活潑）× 3 個候選（種子）。聲音設計每次的音色不同，所以每個候選先用描述產生第 1 句，其他句子拿那一句當參考音檔克隆，音色才一致；正式產生全部台詞時也這樣做。
- **口音**：先只在描述裡寫「台灣口音」試（VoxCPM2 的方言清單沒有台灣口音）；不夠時再考慮克隆有授權的台灣口音參考錄音或 LoRA 微調（5～10 分鐘的錄音）。
- **試聽**：`scripts/voice-audition.py` → `src/assets/voice-audition/`（`<候選>-<台詞>.mp3`＋`index.json`；參考音檔在 gitignore 的 `ref/`）→ `dist/lib/voice-audition.js`（`RUBICON_VOICE_AUD`，`'@index'` 是說明）。標題的「ECHO 語音試聽」（`game/voice-lab.js`，`state` 'voicelab'）：7 句試聽台詞 × 18 個候選的格子、同一句依序比較、音色（原音／駕駛艙／無線電）、評分與備註（localStorage `rubicon_voice_aud`）、複製評分。
- **選定**（2026-11-01 使用者）：溫柔知性 #2 與 AI 系統感 #3 兩個都配進遊戲，設定頁切換；範圍＝全部（通訊、序章與章節畫面、系統提示、增援預告）＋過場動畫裡 ECHO 的字幕；每句產生 2 次挑好的；試聽頁保留。

### ECHO 的語音（VoxCPM2，兩個聲音）

- **播放**：d32068a 的 `game/voice.js`／`data/voice.js` 放回來（通訊 `voiceSay`、系統提示 `voiceCue`、增援預告 `voiceSeq`、劇情畫面 `voiceStory`、說話時壓低音效與配樂、無線電／駕駛艙的音色），改成兩個聲音：設定「ECHO 的聲音」`ctrl.voice`＝gentle 溫柔知性（預設）／ai AI 系統感／off（舊設定的 on／comm 當成 gentle）；`data/voice.js` 的 `VOICE_IDS`。語音檔每個聲音一個 `lib/voice-<聲音>.js`（`RUBICON_VOICE_<聲音>`），只載入選的那個，換聲音時清掉解碼過的。換聲音時試聽一句。
- **過場動畫**：`cineSub` 遇到 who 是 echo 的字幕就 `voiceSay`；跳時間、暫停、略過時停掉。
- **台詞**：`scripts/voice-lines.js` 收集 364 句（通訊、程式裡的 `commSay('echo', …)`、劇情畫面、系統提示、過場動畫（每個周目 × 抉擇的組合都產生一次劇本））→ `src/assets/voice/lines.json`＝{ 鍵: { t 台詞, k 情境 } }；情境（alarm 緊急的系統提示、sys、comm、story、cine、private 私人頻道、end 結局與記憶片段）決定語氣指示（`voice-gen.py` 的 `STYLE`，有「！」再加「語氣有力」）。
- **產生**（`scripts/voice-gen.py`）：參考音檔＝試聽那個候選的第 1 句（`src/assets/voice/ref/<聲音>.flac`），VoxCPM2 的 controllable cloning 每句 2 次 → faster-whisper（large-v3）轉寫、只比中文字的相似度（英文名字與數字的寫法不算），長度不合理的扣分，留最像的；太低的寫進 `src/assets/voice/<聲音>/report.txt`，`--retry` 再產生 2 次重挑。唸法：「ECHO」這類 4 個字母以上的全大寫名字改成一般大小寫照單字唸（試聽時全大寫被逐字母唸成「一差丑」），AP、AC、COAM 照字母；R-07 唸「R 零七」；「……」換成停頓。響度以 RMS 對齊，24 kHz 單聲道 40 kbps。暫存的每一次產生放在系統暫存的 `rubicon-voice-takes/`。

### 其他角色的語音與敵兵的喊話（2026-11-01）

使用者定案：ECHO 以外的角色也配音，**聲音照劇本的角色設定直接產生**（不經過試聽）；派克是女性；敵兵的無線電喊話一起做。

- **角色**（`data/voice.js` 的 `CAST_IDS`，資料夾＝說話者 id）：委託方代表（霍斯特、薩奇、派克、諾拉、米拉）、軌道站（機械語音：產生後加環形調變與短的金屬共鳴，`voice-gen.py` 的 `robot`）、教官（通訊、課程的開場／結業、`data/tutorial*.js` 的提示 `say`、「第 n 課」）、宿敵 13 位＋IGUAZU／VOLTA。聲音設計的描述與說話方式在 `voice-gen.py` 的 `CAST`（性別：劇本寫明的 SIROCCO、WHITEOUT 是女性，VOLTA 為了和 IGUAZU 對比設成女性，其他宿敵男性）。
- **聲音怎麼決定**：沒有參考音檔的聲音，以描述唸一句代表台詞（長度最接近 26 字、沒有英文）產生 3 個候選，faster-whisper 的相似度＋音高（男聲 165 Hz 以下、女聲以上，不對的扣分）挑一個存成 `src/assets/voice/ref/<聲音>.flac`（提交；`--recast` 重新設計）。之後和 ECHO 一樣以參考音檔克隆、每句 2 次挑最像的；語氣指示＝角色的說話方式＋情境。
- **播放**：`voiceSay(text, 說話者)`（通訊、過場字幕）、`voiceStory` 以 `storyQuote` 認出「霍斯特：「…」」「諾拉在頻道裡哭了：「…」」的說話者；`voiceFolder(說話者)`＝聲音資料夾（ECHO＝設定選的、其他角色在設定「其他角色的語音」`ctrl.voiceCast` 沒關時）。每個角色一個 `lib/voice-<id>.js`，用到時才載入；解碼過的最多留 80 句。
- **敵兵的喊話**（`BARKS`：察覺 spot、搜索 search、拿到攻擊權杖 attack、一次受到 12% 以上的傷害 hurt、同伴被擊毀 allyDown、指揮官倒下 cmdDown，各 3 句；三個敵兵的聲音 grunt1～3 依實體 id 分配）：房主／單機在 AI 的事件呼叫 `barkSay`（有腳的一般敵人，不含 Boss、精英、宿敵、飛行的；離玩家 70 m 內；全體 3.5 秒、各事件 `BARK_CD`、同一台 6 秒的冷卻）→ `SFX.bark`（`NET_FNS` 的高階呼叫，客機照自己的距離重播，`NET_VERSION` 11.17）→ `SFX.barkSrc`＝`barkPlay`（設定「敵兵的無線電喊話」`ctrl.barks`）載入、解碼 → `SFX.barkPlay` 在位置上播（高通 280 Hz、同時最多 2 句）。

### 之後可以再做

- 依武器的「近距離」再多錄幾種（目前霰彈、步槍各 3～4 個素材，機槍 3 個）；同一台的多把相同武器只播一把（War Robots 的作法）。
- 過場動畫的字幕裡 ECHO 的台詞也唸（要和鏡頭的時間軸對齊）。
