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
- `src/assets/sfx2/*.mp3`：新增的分層素材（單聲道、44.1 kHz、依用途 64～96 kbps），建置成 `dist/lib/sfx-assets.js`（`window.MECH_CORDON_SFX2`），遊戲啟動後載入（`SFX.loadPack`）；**載到之前所有配方都退回原本的樣本**（配方的每一層找不到檔案就略過，主層有 `fb` 後備）。
- `src/assets/bgm/*.mp3`：任務中的配樂（立體聲 80 kbps，21 首、約 20 MB），建置成 `dist/lib/bgm-assets.js`（`window.MECH_CORDON_BGM`），第一次進任務才載入。
- `src/assets/voice/echo/*.mp3`＋`index.json`：ECHO 的語音（單聲道 24 kHz、32 kbps），建置成 `dist/lib/voice-assets.js`（`window.MECH_CORDON_VOICE`＝{ 雜湊: base64 }），第一次播通訊時載入。
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
- 曲目：2026-11-06 起是多種樂器合奏的混合交響／交響金屬／電子（Scott Buckley、Alexander Nakarada、Alex-Productions、OpenGameArt 的 Emma_MA 與 nene，CC-BY／CC0，見 `src/assets/bgm/CREDITS.txt`；以前是 Kevin MacLeod，使用者覺得太像 MIDI），剪成可以循環的段落（`scripts/bgm-prep.py`）；探索 3、警戒 4、交戰 6、Boss 5、空域 3 首。
- 設定「戰鬥配樂」關閉時照舊沒有配樂；暫停時壓低，結果畫面淡出。
- **空域**：擦身飛過的 Doppler（自己依徑向速度算 playbackRate，c＝343 m/s、夾在 0.7～1.4）＋blacklodge 的飛掠素材；超過音速的敵機音爆；導彈警報分三級（被鎖定＝慢的嗶、導彈發射＝快的嗶、接近＝連續音）。
- **程式合成**（`audio/synth.js`）：雷射（鋸齒波＋快速往下掃頻＋短雜訊）、EMP（低頻嗡聲＋電弧的雜訊）、能量環、蓄力（往上掃的和聲，依蓄力進度）、警報嗶聲；可以無限變化、不增加檔案大小。合成好的短音先算成 AudioBuffer 快取（`OfflineAudioContext`），之後和一般樣本一樣播放。

## 素材與授權（2026-11-01 查核；只收 CC0／CC-BY）

| 素材                                                                                     | 授權       | 用途                           |
| ---------------------------------------------------------------------------------------- | ---------- | ------------------------------ |
| Still North Media「The Free Firearm Sound Library」（OpenGameArt）                       | CC0        | 槍聲的近距離／中距離錄音       |
| Still North Media「Medieval sound effects - Weapon impacts」                             | CC0        | 近戰的刀刃交擊                 |
| blacklodgegames「50 Free SciFi SFX」「27 Metal Audio Samples」                           | CC0        | 飛掠、機械、能量場、警報、金屬 |
| rubberduck「50 CC0 sci-fi SFX」「25 CC0 bang SFX」                                       | CC0        | 雷射、砲聲                     |
| Kenney「63 Digital SFX」                                                                 | CC0        | 雷射、介面                     |
| qubodup「Mech stomp step」「Impact」                                                     | CC0        | 機甲腳步、撞擊                 |
| bart「33 metal clang sounds from cast iron pans」、「Metal Impact Sounds」               | CC0        | 彈殼、金屬撞擊                 |
| Michel Baradari「Chaingun, pistol, rifle, shotgun shots」「2 High Quality Explosions」   | CC-BY 3.0  | 槍聲、爆炸                     |
| Lee Barkovich「Robotic/mechanic step sounds」                                            | CC-BY 3.0  | 機甲腳步、伺服                 |
| Blender Foundation「Big Explosion」（DeathFlash）                                        | CC-BY 3.0  | 大爆炸                         |
| Scott Buckley、Alexander Nakarada、Alex-Productions、Emma_MA、nene（見 bgm/CREDITS.txt） | CC-BY／CC0 | 任務中的配樂                   |
| Kokoro-82M v1.1-zh（hexgrad）                                                            | Apache-2.0 | ECHO 的語音（產生的音檔）      |

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
- **試聽**：`scripts/voice-audition.py` → `src/assets/voice-audition/`（`<候選>-<台詞>.mp3`＋`index.json`；參考音檔在 gitignore 的 `ref/`）→ `dist/lib/voice-audition.js`（`MECH_CORDON_VOICE_AUD`，`'@index'` 是說明）。標題的「ECHO 語音試聽」（`game/voice-lab.js`，`state` 'voicelab'）：7 句試聽台詞 × 18 個候選的格子、同一句依序比較、音色（原音／駕駛艙／無線電）、評分與備註（localStorage `mech_cordon_voice_aud`）、複製評分。
- **選定**（2026-11-01 使用者）：溫柔知性 #2 與 AI 系統感 #3 兩個都配進遊戲，設定頁切換；範圍＝全部（通訊、序章與章節畫面、系統提示、增援預告）＋過場動畫裡 ECHO 的字幕；每句產生 2 次挑好的；試聽頁保留。

### ECHO 的語音（VoxCPM2，兩個聲音）

- **播放**：d32068a 的 `game/voice.js`／`data/voice.js` 放回來（通訊 `voiceSay`、系統提示 `voiceCue`、增援預告 `voiceSeq`、劇情畫面 `voiceStory`、說話時壓低音效與配樂、無線電／駕駛艙的音色），改成兩個聲音：設定「ECHO 的聲音」`ctrl.voice`＝gentle 溫柔知性（預設）／ai AI 系統感／off（舊設定的 on／comm 當成 gentle）；`data/voice.js` 的 `VOICE_IDS`。語音檔每個聲音一個 `lib/voice-<聲音>.js`（`MECH_CORDON_VOICE_<聲音>`），只載入選的那個，換聲音時清掉解碼過的。換聲音時試聽一句。
- **過場動畫**：`cineSub` 遇到 who 是 echo 的字幕就 `voiceSay`；跳時間、暫停、略過時停掉。
- **台詞**：`scripts/voice-lines.js` 收集 364 句（通訊、程式裡的 `commSay('echo', …)`、劇情畫面、系統提示、過場動畫（每個周目 × 抉擇的組合都產生一次劇本））→ `src/assets/voice/lines.json`＝{ 鍵: { t 台詞, k 情境 } }；情境（alarm 緊急的系統提示、sys、comm、story、cine、private 私人頻道、end 結局與記憶片段）決定語氣指示（`voice-gen.py` 的 `STYLE`，有「！」再加「語氣有力」）。
- **產生**（`scripts/voice-gen.py`）：參考音檔＝試聽那個候選的第 1 句（`src/assets/voice/ref/<聲音>.flac`），VoxCPM2 的 controllable cloning 每句 2 次 → faster-whisper（large-v3）轉寫、只比中文字的相似度（英文名字與數字的寫法不算），長度不合理的扣分，留最像的；太低的寫進 `src/assets/voice/<聲音>/report.txt`，`--retry` 再產生 2 次重挑。唸法：「ECHO」這類 4 個字母以上的全大寫名字改成一般大小寫照單字唸（試聽時全大寫被逐字母唸成「一差丑」），AP、AC、COAM 照字母；R-07 唸「R 零七」；「……」換成停頓。響度以 RMS 對齊，24 kHz 單聲道 40 kbps。暫存的每一次產生放在系統暫存的 `mech-cordon-voice-takes/`。

### 其他角色的語音與敵兵的喊話（2026-11-01）

使用者定案：ECHO 以外的角色也配音，**聲音照劇本的角色設定直接產生**（不經過試聽）；派克是女性；敵兵的無線電喊話一起做。

- **角色**（`data/voice.js` 的 `CAST_IDS`，資料夾＝說話者 id）：委託方代表（霍斯特、薩奇、派克、諾拉、米拉）、軌道站（機械語音：產生後加環形調變與短的金屬共鳴，`voice-gen.py` 的 `robot`）、教官（通訊、課程的開場／結業、`data/tutorial*.js` 的提示 `say`、「第 n 課」）、宿敵 13 位＋KESTREL／BRANT。聲音設計的描述與說話方式在 `voice-gen.py` 的 `CAST`（性別：劇本寫明的 SIROCCO、WHITEOUT 是女性，BRANT 為了和 KESTREL 對比設成女性，其他宿敵男性）。
- **聲音怎麼決定**：沒有參考音檔的聲音，以描述唸一句代表台詞（長度最接近 26 字、沒有英文）產生 3 個候選，faster-whisper 的相似度＋音高（男聲 165 Hz 以下、女聲以上，不對的扣分）挑一個存成 `src/assets/voice/ref/<聲音>.flac`（提交；`--recast` 重新設計）。之後和 ECHO 一樣以參考音檔克隆、每句 2 次挑最像的；語氣指示＝角色的說話方式＋情境。
- **播放**：`voiceSay(text, 說話者)`（通訊、過場字幕）、`voiceStory` 以 `storyQuote` 認出「霍斯特：「…」」「諾拉在頻道裡哭了：「…」」的說話者；`voiceFolder(說話者)`＝聲音資料夾（ECHO＝設定選的、其他角色在設定「其他角色的語音」`ctrl.voiceCast` 沒關時）。每個角色一個 `lib/voice-<id>.js`，用到時才載入；解碼過的最多留 80 句。
- **敵兵的喊話**（`BARKS`：察覺 spot、搜索 search、拿到攻擊權杖 attack、一次受到 12% 以上的傷害 hurt、同伴被擊毀 allyDown、指揮官倒下 cmdDown，各 3 句；三個敵兵的聲音 grunt1～3 依實體 id 分配）：房主／單機在 AI 的事件呼叫 `barkSay`（有腳的一般敵人，不含 Boss、精英、宿敵、飛行的；離玩家 70 m 內；全體 3.5 秒、各事件 `BARK_CD`、同一台 6 秒的冷卻）→ `SFX.bark`（`NET_FNS` 的高階呼叫，客機照自己的距離重播，`NET_VERSION` 11.17）→ `SFX.barkSrc`＝`barkPlay`（設定「敵兵的無線電喊話」`ctrl.barks`）載入、解碼 → `SFX.barkPlay` 在位置上播（高通 280 Hz、同時最多 2 句）。

### 日文語音（2026-11-01）

使用者定案：全部角色（含敵兵的喊話）都有日文版；**聲音重新設計成日系**（日本動畫的聲優類型，和中文版不是同一個聲音，ECHO 的兩個聲音也重新設計）；翻譯直接做、不先審。

- **設定**：「語音的語言」`ctrl.voiceLang`＝zh 中文（預設）／ja 日本語，和「ECHO 的聲音」分開（例如 AI 系統感＋日文）。字幕照舊是中文（日文語音＋中文字幕）。
- **台詞**：`src/assets/voice/lines-ja.json`＝{ 說話者: { 鍵: 日文 } }，鍵和 `lines.json` 相同（中文台詞的 `vkey`），所以遊戲找語音的方式不變，只是資料夾加 `_ja`（`voiceSuf`／`voiceFolder`；敵兵 `barkPlay` 也加，`SFX.bark` 轉送的鍵不變，各端照自己的設定）。日文的聲音沒有那一句時改唸中文（`voiceBuf`）。改了中文台詞要補 `lines-ja.json`（`voice-gen.py --lang ja` 會列出少了幾句）。
- **翻譯的寫法**：唸給 TTS 的文字全是假名／漢字（沒有英文字母，不然會逐字母唸）：ECHO＝エコー、R-07＝アール・ゼロナナ、KEY-07＝キー・ゼロナナ、AC＝エーシー、AP＝エーピー、ACS＝エーシーエス、EMP＝イーエムピー、QB＝クイックブースト、Lattice-9＝グリッド・ゼロハチロク、Reefhold＝ザイレム、深脈＝コーラル；委託方 キャストロン／エセリック／ヴィアウェル／聖域，代表 ホルスト／サキ博士／パイク／ノーラ／ミラ；宿敵與 Boss 名稱用片假名（ラスト、シロッコ、ジャガーノート…）。
- **產生**：`python scripts/voice-gen.py --lang ja`：資料夾 `<聲音>_ja/`、參考音檔 `ref/<聲音>_ja.flac`；描述加「標準日語，日本動畫配音員的演技」（ECHO 的兩個聲音在 `ECHO_JA`），其他角色的描述、性別、說話方式沿用 `CAST`；日文不轉簡體（會改掉漢字），「……」「――」與 ███ 換成「、」；faster-whisper 以日文轉寫，只比假名＋漢字（片假名統一成平假名），每秒字數的上限放寬到 15。
- **唸法**：短的漢字詞（降下完了、増援接近、受領完了、第四課…）常被唸成中文的讀音，所以 `lines-ja.json` 的 `'@yomi'`＝{ 詞: 假名 } 只在唸給 TTS 時換成假名（長的詞先換；轉寫的比對照原文）。第一次產生後相似度低的 54 句加上唸法、每句 3 次重做；COUNTDOWN 與 SPIRE 的日文聲音設計 8 個候選都是女聲的音高，改用 `CAST_JA` 更強調男聲的描述重新設計。

### 同步字幕（2026-11-02）

使用者要求：遊戲內的同步字幕，可以選繁體中文、日文或不顯示。定案：

- **設定**：「字幕」`ctrl.sub`＝zh 繁體中文（預設）／ja 日本語／off 不顯示，和「語音的語言」分開（日文語音＋中文字幕、中文語音＋日文字幕都可以）；「字幕大小」`ctrl.subSize`＝s／m／l（body 的 `data-sub` → CSS 的 `--subK`：0.85／1／1.3，通訊框、過場字幕、字幕條）。
- **跟著語音**（`game/voice.js` 的 `subLang`／`subText`／`subName`）：通訊框（`commNext`）在這句有語音時先藏住文字，語音開始播時才逐字顯示、逐字花唸的時間的 80%，顯示到唸完；語音包第一次載入超過 1.5 秒就先顯示文字。過場字幕（`cineSub`）唸得比劇本的時間長時顯示到唸完。劇情畫面正在唸的那一行亮起來（`#stLines p.speaking`）。
- **日文字幕的文字**：`lines-ja.json` 打包進遊戲（約 60 KB，語音關閉或中文語音時也能顯示），以中文台詞的 `vkey` 查；唸給 TTS 的寫法在顯示時換回來（`data/voice.js` 的 `JA_DISP`：アール・ゼロナナ → R-07、エーシー → AC…）；說話者名稱 `SPEAKER_JA`（ECHO 與宿敵是代號，照原文）。沒有翻譯的照中文。增援預告的句子有動態的數字，日文另外組（`waves.js`）。通訊紀錄（作戰室）也照字幕的語言。
- **旁白與字卡**（使用者定案）：劇情畫面與過場動畫的旁白、標題、字卡一律繁體中文，只有角色的台詞依字幕的語言（劇情畫面換「名字：「…」」引號裡的句子）。
- **不顯示**：通訊框只留說話者（頭像與名字，`#comm.subOff`）；這句唸不出來（語音關閉、沒有語音檔）時照樣顯示文字。過場動畫的角色台詞同樣只有唸不出來時才顯示，旁白照常。
- **字幕條** `#subBar`（`subBar(文字, 說話者, 秒)`，最多兩行、各自顯示到唸完）：系統提示（`voiceCue`，語音開始播時）與敵兵的喊話（`barkPlay`，40 m 內，標「敵兵」）。位置：電腦在畫面下方中央、邊緣的敵人指示之上；觸控在通訊框的上面。
- 冒煙測試 `testAudio2` 的字幕檢查；同時修正它兩個不穩定的檢查（敵兵喊話的對象要符合 `barkSay` 的條件、動態配樂要先清掉「最近被打」）。

### 配樂重選：候選曲的試聽（2026-11-06）

- 使用者回報目前的任務配樂（Kevin MacLeod）聽起來很 MIDI、單調，要多種樂器合奏的曲子。候選只收 CC0／CC-BY（不收 SA／ND／NC，也不收 Pixabay 授權）：
  Scott Buckley（CC-BY 4.0，混合交響，scottbuckley.com.au）15 首、Alexander Nakarada（CC-BY 4.0，交響＋金屬／電子）7 首、Alex-Productions（CC-BY 3.0，賽博龐克電子＋電影感）9 首、Punch Deck（CC-BY 3.0）1 首、OpenGameArt 的 nene「Boss Battle #2 [Symphonic Metal]」、Emma_MA「Determined Pursuit」「QaziJamJam」（CC0）、Fato_Shadow_Music「War Machine」（CC-BY 4.0），共 36 首；Nakarada、Alex-Productions、Punch Deck 從 free-stock-music.com 下載（每首的頁面都確認過授權）。
- `scripts/bgm-audition.py <資料夾>` 依建議用途挑 60 秒片段 → `src/assets/bgm-audition/`（`index.json` 曲名、作者、授權、來源、說明；`CREDITS.txt`）→ 建置成 `dist/lib/bgm-audition.js`（`window.MECH_CORDON_BGM_AUD`，約 28 MB，打開試聽頁才載入）。
- 標題的「配樂試聽」（`game/bgm-lab.js`，`state` 'bgmlab'）：播放／停止、進度條點一下跳轉、依建議用途篩選、每首勾選用在探索／警戒／交戰／Boss／空域、評分、備註（localStorage `mech_cordon_bgm_aud`），「複製勾選結果」依用途整理成文字；最下面可以播目前的配樂比較。冒煙測試 `testBgmLab`。
- 使用者請開發者直接選：探索＝Signal To Noise／Penumbra／The Long Dark；警戒＝Eyes In The Void／Electrorchestra／Escape Velocity／Hidden；交戰＝Simulacra／Terminus／Chase／Epic Cyberpunk／Determined Pursuit／QaziJamJam；Boss＝Goliath／Vanguard／Hellfire／The Great Battle／Boss Battle #2；空域＝Sentinel／Born Of The Sky／Starfire。`scripts/bgm-prep.py` 的 `TRACKS` 記來源檔與授權，`raw` 是原本就做成循環的（整首照用），執行時重寫 `src/assets/bgm/CREDITS.txt`；`game/bgm.js` 的 `SETS`／`AIR_SET`。nene 的 zip 裡檔名是反的（`*_opening.wav` 才能無縫循環，量過接縫）。
- 之後要換曲：在試聽頁聽、改 `TRACKS` 與 `SETS`，重跑 `bgm-prep.py`。

### 重複台詞的變體（2026-11-06）

使用者要求：常聽到的重複語音不能只有一種台詞，每種 10 句、台灣口語（「喔」「囉」「欸」、飛彈，不用中國用語）。聲音照舊（VoxCPM2 的兩個 ECHO 聲音與其他角色，`voice-gen.py`），日文也有。

- **台灣口音的試驗（否決）**：同一天試過 BlueMagpie-TTS（OpenFormosa，臺灣口音模型）以現在的參考音檔克隆／語者向量、VoxCPM2 不轉簡體、BlueMagpie 唸的段落當 VoxCPM2 的參考、Common Voice 台灣中文（CC0）的真人女聲當參考，做成標題的比較頁讓使用者試聽。使用者：「全都不好，不用再試，暫時維持現狀」，程式全部還原、環境與模型刪除。之後再提台灣口音時先問方向（付費服務或真人配音），不要重跑這些。
- **輪流**：`game/voice.js` 的 `bagPick`（洗牌：整輪播完才重複，新的一輪第一句不會和上一句相同）。
- **系統提示** `VOICE_CUES` 的 `t` 是 10 句的陣列，語音鍵 `cueKey(id, n)`（第 0 句 `s_<id>`、之後 `s_<id>_<n>`）；`cueSay` 遇到沒有語音檔的說法改唸第 0 句。增援預告 12 個方向 × 10 種說法全部事先產生（`WAVE_IN`／`WAVE_DROP` 的樣板；接起來的語調會斷），敵對 AC、最後一波各 10 句。
- **敵兵的喊話** `BARKS` 每個事件 10 句（鍵 `b_<事件><0～9>`）；修正喊話的字幕從來沒顯示過（`barkPlay` 的正規表示式少了 `\d` 的反斜線）。
- **程式裡重複的台詞** `LINE_POOLS`（訓練課程依星等的評語、空域的轟炸機提示）：`poolLine(id)` 挑一句交給 `commSay`，`voice-lines.js` 另外收集。
- **主線的通用通訊**（各區段類型的開場、陣亡的通用台詞）：`story-comms.js` 的 `variants` 寫 10 則同條件的，`commPick` 在同分的候選裡隨機挑。
- **接上原本有語音、沒播的三種**：被鎖定 `lock`（一般敵人的導彈齊射預警瞄準本機的玩家，`mv_volley`）、出口開啟 `exits`（主線的區段清除、沒有專屬的通訊時）、區域清除 `clear`（自訂關卡的多段出擊）。
- 台詞從 766 句變成 1301 句（ECHO 363 → 822），日文翻譯同步補進 `lines-ja.json`（寫法照「翻譯的寫法」）。
- **產生**：`voice-gen.py` 照舊每句 2 次挑最準的；新句子裡相似度偏低的（中文 21、日文 71）再 `--only <鍵> --more` 多 2 次重挑。日文剩下的低分大多是同音字（降下／効果、二時の方向／虹の咆哮）與數字寫法，不是唸錯；「上！○時の方向に降下！」的「上」被唸成じょう，`@yomi` 加「上！→うえ！」重做。

### 之後可以再做

- 依武器的「近距離」再多錄幾種（目前霰彈、步槍各 3～4 個素材，機槍 3 個）；同一台的多把相同武器只播一把（War Robots 的作法）。
- 過場動畫的字幕裡 ECHO 的台詞也唸（要和鏡頭的時間軸對齊）。

### 主線擴充的語音（2026-11-08）

- 新角色的聲音（`scripts/voice-gen.py` 的 `CAST`，`data/voice.js` 的 `CAST_IDS`）：僚機 BASALT（老練的男性傭兵）、WREN（年輕的女性新人）、第 7 章的宿敵 KILN、第 8 章的宿敵 KEEL；中文與日文各自設計（`ref/<聲音>.flac`、`ref/<聲音>_ja.flac`）。
- 第 6～8 章、新區段類型、僚機、宿敵的新台詞（約 150 句）的中文與日文語音；日文台詞在 `lines-ja.json`（人名照舊譯法：ホルスト、サキ、パイク、ミラ）。

### AI 配樂（2026-11-14）

- 使用者要用本地 AI 模型自己產生配樂，曲風是**絕區零 × 尼爾 自動人形的融合**：尼爾的憂傷旋律、鋼琴與弦樂、懸掛和弦、自創語言的空靈女聲 × 絕區零的碎拍、Drum & Bass、放克 bass、都市夜晚的律動。
- 模型：**ACE-Step 1.5**（MIT，模型說明寫明產出可以商用；會唱歌詞，所以做得出尼爾式的人聲；12 GB 顯示卡跑 2B 的 sft＋1.7B 語言模型）。比較過 Stable Audio 3（純配樂、不會唱）、Magenta RealTime 2（即時伴奏）、YuE／DiffRhythm（流行歌）、MusicGen／LeVo 2（不能商用）。不拿這兩款的原聲帶訓練 LoRA（侵權疑慮），只用曲風描述；歌詞是自己編的無意義音節。
- 安裝：`npm run bgm:setup`（`scripts/bgm-setup.js`：ACE-Step 固定在 `REF` 這個 commit，clone 到 `tools/acestep/src/`、`uv sync --frozen`、模型下載到 `tools/acestep/checkpoints/`；整個 `tools/acestep/` 在 gitignore，其他電腦 pull 之後跑一次就能產生）。
- 產生：`npm run bgm:gen -- [主題,…] [--n=2] [--only=t2m|cover]`（`scripts/bgm-gen-run.js` → `scripts/bgm-gen.py`）：每個主題（`THEMES`：曲名、BPM、調、歌詞）先以文字產生交戰版（`n` 個種子），再以它為來源 cover 出同一主題的探索／警戒／Boss 版（`COVER_K` 的強度），另外每一級直接用文字產生一首比較；已經有的檔案略過，所以中斷後重跑接著做。結果經 `scripts/bgm-ai-pack.py` 轉成 `src/assets/bgm-audition/ai_*.mp3`（index.json 的 ai_ 項目整批換掉），在標題「工具與其他」的「AI 配樂試聽」聽（`openBgmLab(true)`：同一個試聽頁只列 ai_ 的曲子；原本的「配樂試聽」只列外部的候選曲）。顯示卡記憶體不夠時設 `BGM_DIT=acestep-v15-turbo`、`BGM_LM=acestep-5Hz-lm-0.6B`。
- 選定的曲子之後照原本的流程：`scripts/bgm-prep.py` 的 `TRACKS` 剪成循環、`game/bgm.js` 的 `SETS`。

- **過場的旁白**（2026-11-14，docs/cine-redesign-design.md 第 11 期）：過場裡沒有說話者的字幕由另一個聲音 `narr`（四十多歲的男性、紀錄片的口吻）唸，中文與日文；`data/voice.js` 的 `CAST_IDS`、`voice-gen.py` 的 `CAST`、`voice-lines.js` 收集時沒有說話者的過場字幕＝narr，遊戲 `game/cine.js` 的 `cineSub`。
