# 自製音效盤點（一般部分：方法、武器、自機、介面、格納庫、過場、地圖）

- 調查日期：2026-11-22；只讀程式，沒有改任何檔案。範圍不含敵人、Boss、機獸、空戰（另有人調查）。
- 觸發處的路徑都是 `src/` 底下的相對路徑。`audio.js` 的行號是 `src/audio/audio.js`。
- 「目前的聲音」寫素材鍵（`assets/sfx`、`assets/sfx2` 的檔名）、合成音（`~` 開頭，`audio/synth.js`）或 `tone()`／`noise()`（即時產生的振盪器與雜訊）。
- **循環**＝需要可循環或分段的素材（音量／音高跟著遊戲狀態連續變化）。
- 鍵名以 `→` 開頭的列是「併入別的項目」或「只是對照」，不算在項目數裡。
- 變化數＝同一個事件要幾個候選輪流播（避免機槍式重複）。
- 提示詞的原則：實彈、爆炸、機體偏寫實厚重（giant mech scale、heavy、realistic）；能量武器、推進器、介面偏動漫科幻（anime sci-fi）。

---

## 1. `audio/audio.js` 的方法（戰鬥共用的高階音效）

### 1-A 方法對照（每一個方法用到的素材與去處）

| 方法 | 行 | 用到的素材／合成音 | 情況 | 對應的項目 |
|---|---|---|---|---|
| `noise(dur,freq,vol,type,bus,q,delay)` | 611 | 即時白雜訊＋濾波 | 格納庫、近戰的風切、無線電 | 不直接產生；各用途見 3、4、5 節 |
| `tone(f0,f1,dur,vol,type,bus,delay)` | 630 | 即時振盪器（滑音） | 心跳、擊破確認、BREAK 的叮、區域清除、無線電嗶、格納庫、黏附炸彈倒數 | 不直接產生；各用途見 3、4、5 節 |
| `loopSet` | 649 | 任意循環鍵 | 自機推進器、突擊推進、過場的引擎 | 3 節 `thrust_*`、6 節 |
| `loopAt` | 687 | `thrustLoop` | 附近 4 台機體的推進器（敵我都有） | 3 節 `thrust_loop`（共用，敵人另由敵人組決定） |
| `ambient`／`synthAmb` | 763／806 | `amb*` 循環檔＋合成的 wind／gust／sea | 地圖環境音 | 7 節 |
| `heartbeat` | 859 | `tone` 70→40 Hz 兩下 | 低 AP 心跳（AP 30% 以下，越低越快）＋變悶 | 3 節 `heartbeat` |
| `shot` | 875 | `recipes.js` 的配方各層；`blade` 種類用 `boostUp`＋`laser2`＋`thrBurst` | 所有槍聲 | 2 節 |
| `charge` | 922 | `charge`＋`phUp` | 雷射蓄力、蓄力射擊開始、敵人的蓄力招式 | 3 節 `charge_loop` |
| `empBlast` | 927 | `~emp`＋`overload`＋`wobble`／`zap2` | 電磁脈衝、EMP 光束命中 | 1-B `emp_blast_*` |
| `explode` | 933 | 小：`explode/2/3`＋`exMini`＋`crunch1-3`＋`~thB`；大：`explodeBig`＋`exA`＋`boom2`＋`~thC`＋`distant`＋`crunch`；huge：`explodeBig`＋`exHuge`＋`boom1`＋`~thC`＋`debris`＋`distant`＋`clatter`；大與 huge 加 `debrisRain` | 全部爆炸 | 1-B `exp_*` |
| `debrisRain` | 966 | `mHit1/3/5`、`impStone`、`clink1`、`iron3` 延遲 0.3～0.9 秒 | 爆炸、殘骸之後的碎屑落下 | 1-B `debris_fall` |
| `wreck` | 979 | `debris`＋`clatter1/2`＋`mHvy1`＋`debrisRain` | 擊破的殘骸、物件倒塌 | 1-B `wreck_collapse` |
| `hit` | 986 | 自己：`hit/2/3`＋`punch1/2`＋`thud1`＋`mHvy1-3`；物件：`rock1/2`＋`impStone`；其他：`hit/2/3`＋`armor1-3`＋`mHit1-4` | 子彈、近戰以外的命中 | 1-B `hit_*` |
| `hitWorld` | 1006 | 依地面：水 `splash/stepWet`、雪與沙 `stepSnow`、金屬 `mHit/clink2`、其他 `rock1/2`；硬地面 22% 跳彈 | 子彈打地形 | 1-B `hitw_*` |
| `ricochet` | 1018 | `~ric1-3` | 跳彈 | 1-B `ricochet` |
| `whiz` | 1024 | `~whizK1/2`、能量 `~whizE` | 敵彈從身邊飛過 | 1-B `whiz_*` |
| `casing` | 1034 | 小 `~tink1/2`＋`iron2/4`、大 `~tink3`＋`iron1/3`；沙雪變悶、水裡不播 | 彈殼落地 | 1-B `casing_*` |
| `hitShield` | 1052 | `plate1/2`＋`eHi2/3` | 盾牌 MT 的盾擋子彈 | 1-B `hit_shield` |
| `hitDome` | 1057 | `dome1/2`＋`eHi1/3` | 護盾產生器的護盾擋子彈 | 1-B `hit_dome` |
| `meleeSwing` | 1064 | 依武器音色＋派生種類（見 3 節）＋自機的 `noise` 風切 | 近戰揮擊 | 3 節 `melee_swing_*` |
| `meleeHit` | 1130 | 依音色、派生、重量（見 3 節）＋自機的 `~thB/~thC` | 近戰命中 | 3 節 `melee_hit_*` |
| `clash` | 1196 | `clashHvy/clash1-4`＋`plate2`＋`bing`／`bell` | **整個專案沒有人呼叫**（彈刀改用 `shield`） | 3 節 `parry_clash` |
| `qb` | 1203 | `~qbPre`＋`boostUp`＋`thrBurst`＋`~thB`＋`~jetTail` | QB、空中跳 | 3 節 |
| `jump` | 1211 | `boostUp`＋`thrBurst`＋`~thB`＋`~hiss`＋`~jetTail` | 起跳 | 3 節 |
| `land` | 1219 | `boostDown`＋`thud1/2`＋（重）`plate1/2`＋`~thC`＋`mStomp`＋`~hissL` | 落地（依落下速度 0～1） | 3 節 |
| `step` | 1228 | `thud1/2`＋`mStep1-4`／`qStomp`＋`~thD`＋地面層 | 腳步 | 3 節 |
| `servo` | 1263 | turn `~servoU`、start `~servoS`、stop `~servoD`＋`~hiss`、aim `~servoS`（aim 沒人用）；另疊 `servo1/2/4/5/6` | 自機轉身、起步、急停 | 3 節 |
| `ab`／`abEnd` | 1279／1286 | `~qbPre`＋`boostUp`＋`thrBurst`＋`~thC`；結束 `~jetTailL`＋`boostDown` | 突擊推進 | 3 節 |
| `stagger` | 1290 | `overload`＋`stagger`＋`wobble` | 失衡（敵我） | 1-B `stagger` |
| `reloadStart`／`empty`／`overheat` | 1296／1299／1303 | `~reload`／`~reloadH`、`~click`、`~hissL`＋`uiErr` | 自機裝填、空彈、EN 用完 | 3 節 |
| `breakFx`／`stinger`／`rangedBonus`／`reaction`／`hitConfirm`／`crit`／`killConfirm` | 1309～1358 | 見 3 節 | 自己打出的回饋 | 3 節 |
| `uiBtn`／`ui` | 1375／1380 | `uiBack`、`uiOk`、`uiErr`、`uiTog`、`uiTick`（hover）、`uiClick` | 按鈕 | 4 節 |
| `kit` | 1389 | `ui2`＋`uiOpen` | 修復套件、補給、隊友的拾取 | 3 節、7 節 |
| `alert` | 1393 | `ui2` | `flashAlert` 的警示、狀態異常 | 4 節 |
| `radio` | 1397 | `noise` 2400 Hz＋`glitch`＋`tone` 1320 Hz | 通訊開頭 | 4 節 |
| `waveAlert` | 1404 | `alarm`／`alarmBig`（依方向左右聲道）＋最後一波 `boom1` | 增援預告 | 7 節 |
| `cue(kind)` | 1423 | exit：`uiOpen`＋`dome1`（**沒人呼叫**）；cache：`doorOpen`＋`uiOk`；pickup：`uiOk`；phase：`alarmBig`＋`boom1`＋`stinger`；mod：`bong`＋`uiOpen`；clear：`tone` 523/784 | 事件提示 | 4、7 節 |
| `bomber`／`ally` | 1445／1449 | `engineHi`＋`door`；`door`＋`boostDown` | 消耗品：呼叫空襲、友軍 | 1-B |
| `bark`／`barkPlay` | 518／522 | 敵兵語音 | 敵兵喊話（語音，不在本盤點） | — |

### 1-B 產生項目

| 建議的音效鍵 | 事件的描述 | 目前的聲音 | 觸發處 | 長度（秒） | 變化數 | 給 AI 的英文提示詞草稿 |
|---|---|---|---|---|---|---|
| `exp_small` | 小型爆炸（榴彈、導彈、小物件、陷阱的小爆） | `explode/2/3`＋`exMini`＋`crunch`＋`~thB` | audio.js:956；entities/projectile.js:303、game/game.js:353、game/support.js:355、fx/effects.js:2929 | 1.5 | 4 | Small military explosion with a sharp crack, short fireball whoosh and metal fragments, realistic and punchy |
| `exp_big` | 大型爆炸（機體擊破、重砲、大物件） | `explodeBig`＋`exA`＋`boom2`＋`~thC`＋`distant`＋`crunch` | audio.js:947；entities/mech-entity.js:2722、fx/effects.js:2923 | 2.5 | 4 | Large heavy explosion of a giant war machine, deep boom, rolling fireball, metal debris scattering, realistic |
| `exp_huge` | Boss 等級的巨大爆炸 | `explodeBig`＋`exHuge`＋`boom1`＋`~thC`＋`debris`＋`distant`＋`clatter` | audio.js:937；entities/mech-entity.js:2722（Boss） | 4 | 3 | Massive cataclysmic explosion, ground-shaking sub-bass boom, long rumbling tail and raining debris, cinematic |
| `exp_far` | 遠距離的爆炸（60 m 以上只聽到悶的回響，延遲到達） | `distant` 層 | audio.js:943、953 | 3 | 3 | Distant explosion heard from far away, muffled low thud with long echoing rumble across open terrain |
| `exp_crunch` | 近距離爆炸的金屬撕裂瞬態 | `crunch1-3` | audio.js:948、960 | 0.4 | 3 | Close-up crunching metal rip transient, armor plates tearing apart, short and harsh |
| `debris_fall` | 爆炸後散在周圍的碎屑落地（0.3～0.9 秒後，多個） | `mHit1/3/5`、`impStone`、`clink1`、`iron3` | audio.js:966 | 0.6 | 4 | Single chunk of metal or concrete debris falling and bouncing on the ground, medium weight |
| `wreck_collapse` | 擊破後殘骸倒下散落、物件崩塌 | `debris`＋`clatter1/2`＋`mHvy1` | audio.js:979；entities/mech-entity.js:2723、fx/effects.js:2947、game/destruct.js:581 等 | 2 | 3 | Wreckage of a giant robot collapsing, heavy steel parts crashing and clattering to the ground, realistic |
| `hit_armor` | 子彈打中敵人／友軍機體 | `hit/2/3`＋`armor1-3`＋`mHit1-4` | audio.js:1000；entities/projectile.js:429 | 0.5 | 4 | Bullet impact on thick mech armor plate, sharp metallic clang with a dull heavy body, realistic |
| `hit_self` | 自己被打中（駕駛艙裡的悶響＋機殼共鳴） | `hit`＋`punch`＋`thud1`＋`mHvy1-3` | audio.js:987；entities/projectile.js:429、entities/mech-entity.js:1249 | 0.8 | 4 | Muffled impact heard from inside a mech cockpit, deep hull resonance and low metallic thump, claustrophobic |
| `hit_prop_stone` | 子彈打中可破壞物件（混凝土、岩石） | `rock1/2`＋`impStone` | audio.js:995 | 0.5 | 4 | Bullet hitting concrete wall, chips of stone cracking off, gritty dust |
| `hit_prop_metal` | 子彈打中金屬物件（貨櫃、油桶、車輛）——目前一律是石頭聲 | （沒有，用石頭聲） | audio.js:995 | 0.5 | 3 | Bullet hitting a hollow steel container, resonant tinny clang with rattle |
| `hitw_conc` | 子彈打地形：混凝土、土地 | `rock1/2` | audio.js:1014 | 0.4 | 4 | A single bullet striking a concrete wall, sharp cracking impact with chips of stone and gravel scattering, short dusty crumble tail |
| `hitw_metal` | 子彈打地形：金屬地板 | `mHit1/2/4`、`clink2` | audio.js:1011 | 0.4 | 4 | Bullet striking steel deck plating, bright metallic ping and clang |
| `hitw_water` | 子彈打水面 | `splash`、`stepWet1/2` | audio.js:1008 | 0.5 | 4 | Bullet plunging into water, sharp small splash and bubble |
| `hitw_snow` | 子彈打雪地 | `stepSnow1/2` | audio.js:1009 | 0.4 | 3 | Bullet thudding into deep snow, soft muffled puff |
| `hitw_sand` | 子彈打沙地 | `stepSnow1/2`（音高壓低） | audio.js:1010 | 0.4 | 3 | Bullet impact in loose sand, dry soft thump with sand spray hiss |
| `hitw_ice` | 子彈打冰面——目前和混凝土同一組 | `rock1/2` | audio.js:1014 | 0.4 | 3 | Bullet hitting thick ice, glassy crack and icy chips skittering |
| `ricochet` | 跳彈（硬地面 22%） | `~ric1-3` | audio.js:1018 | 0.5 | 4 | Bullet ricochet whine, high pitched descending zing off metal |
| `whiz_kin` | 敵人的實彈從身邊飛過 | `~whizK1/2` | audio.js:1024；game/feedback.js:177 | 0.4 | 4 | Large caliber bullet flying past the listener, fast doppler whoosh crack |
| `whiz_en` | 敵人的雷射／能量彈從身邊飛過 | `~whizE` | audio.js:1026；game/feedback.js:177 | 0.5 | 3 | Energy bolt zipping past, anime sci-fi plasma hum with doppler sweep |
| `casing_small` | 小口徑彈殼落地（步槍、機槍） | `~tink1/2`＋`iron2/4` | audio.js:1034；entities/mech-entity.js:884 | 0.6 | 4 | Oversized brass shell casing dropping onto concrete, low metallic tinkle and bounce |
| `casing_big` | 大口徑彈殼落地（霰彈、背部加特林） | `~tink3`＋`iron1/3` | audio.js:1038；entities/mech-entity.js:884、904 | 0.8 | 4 | Huge heavy artillery shell casing clanging onto the ground, deep metallic ring and roll |
| `casing_soft` | 彈殼落在沙、雪上（目前只是同一組變小聲） | 同上、音量與音高壓低 | audio.js:1037 | 0.4 | 3 | Heavy metal shell casing falling into snow or sand, soft muffled thud |
| `hit_shield` | 盾牌 MT 的實體盾擋子彈（大＝正面擋下） | `plate1/2`＋`eHi2/3` | audio.js:1052；entities/mech-special.js:197、203 | 0.5 | 3 | Bullet deflecting off a massive riot shield plate, heavy clang with electric shimmer |
| `hit_dome` | 子彈打在護盾產生器的護盾球上 | `dome1/2`＋`eHi1/3` | audio.js:1057；entities/mech-special.js:139 | 0.6 | 3 | Projectile hitting an energy barrier dome, anime sci-fi shield ripple with glassy hum |
| `stagger` | 失衡（ACS 過載：敵我都用，自機的同一個） | `overload`＋`stagger`＋`wobble` | audio.js:1290；entities/mech-entity.js:2487、2664、entities/mech-remote.js:167、entities/mech-weak.js:156 | 1.2 | 3 | Giant mech systems overloading and staggering, electric surge crackle with wobbling metal groan |
| `emp_blast_big` | 大型電磁脈衝爆發（EMP-L、EMP-S 肩武器的脈衝） | `~emp`＋`overload`＋`wobble`＋`laserBig` | audio.js:927；game/game.js:231、232 | 1.5 | 3 | Powerful electromagnetic pulse burst, anime sci-fi electric boom with crackling arcs and descending wobble |
| `emp_blast_small` | 小型 EMP 爆發（EMP 光束命中） | `~emp`＋`overload`＋`zap2` | audio.js:927 | 1.0 | 3 | Small EMP discharge, sharp electric zap with fizzling static |
| `bomber_call` | 呼叫空襲（消耗品）：轟炸機飛過投彈 | `engineHi`＋`door` | audio.js:1445；game/mission.js:115 | 4 | 2 | Jet bomber flying low overhead then bomb bay doors opening, powerful engine roar passing by |
| `ally_drop` | 呼叫友軍（消耗品）：友軍機體空降 | `door`＋`boostDown` | audio.js:1449；game/mission.js:244 | 2.5 | 2 | Allied mech dropping from a transport, hatch release clunk then thrusters braking for landing |

---

## 2. 武器：`audio/recipes.js` 的 17 個配方與 `audio/synth.js` 的 41 個合成音

配方每一層＝near 近距離本體、far 遠距離、body 自機的厚度、mech 自機的機械聲、low 自機的超低頻、fb 素材沒載入時的後備。
AI 產生時建議每把武器做「近距離（含 body 的厚度）」「遠距離」兩組，機械聲另做；超低頻（`~thA～D`）照舊共用（2-B）。
開火的觸發處：實彈 entities/mech-entity.js:883、霰彈 903、砲彈 927、榴彈 979、導彈 1074、雷射 1264（全部經過 audio.js:875 `shot`）。

### 2-A 武器的槍聲

| 建議的音效鍵 | 事件的描述 | 目前的聲音 | 觸發處 | 長度（秒） | 變化數 | 給 AI 的英文提示詞草稿 |
|---|---|---|---|---|---|---|
| `gun_rifle_near` | RF-31 突擊步槍（w_rifle）近距離＋自機厚度；也是 `bullet` 種類的預設（敵人、固定砲台） | near `rifleN1-4`、body `bRifle`、low `~thA` | recipes.js:13；mech-entity.js:883 | 0.6 | 4 | Single shot of a giant mech-sized assault rifle, loud punchy crack with heavy low-end body, realistic |
| `gun_rifle_far` | 步槍遠距離 | `rifleF1/2` | recipes.js:15 | 1.2 | 2 | Distant large caliber rifle shot echoing across terrain, thin crack with rolling tail |
| `gun_rifle_mech` | 步槍的槍機聲（自機才有） | `clink1/2` | recipes.js:17 | 0.2 | 3 | Heavy rifle bolt cycling, short mechanical clack of a giant gun |
| `gun_pistol_near` | HG-22 手槍 | near `pistolN1/2`、body `bPistol`、low `~thA` | recipes.js:21 | 0.5 | 4 | A single loud handgun gunshot fired close up, sharp powerful bang with a short metallic snap and quick fading echo, realistic |
| `gun_pistol_far` | 手槍遠距離 | `pistolF1` | recipes.js:23 | 1.0 | 2 | Distant heavy handgun shot, small crack with echo |
| `gun_mg_near` | MG-18 手持格林機槍（每一發，連射；音高隨連射升高 `mgHeat`） | near `smgN1-3`、body `bChain`、low `~thD` | recipes.js:30；audio.js:889 | 0.15 | 4 | Single round of a rapid-fire mech gatling gun, short tight burst transient, heavy and mechanical |
| `gun_mg_far` | 格林機槍遠距離 | `smgF1` | recipes.js:32 | 0.6 | 2 | Distant rapid machine gun burst, crackling rattle echoing |
| `gun_mg_spin` | 格林轉管的起轉／運轉／停轉（**目前沒有**；配方註解寫了「轉管在 spin 層」但 audio.js 沒實作）**循環** | 沒有聲音 | entities/mech-entity.js:883（`d.spin`） | 2（循環）＋起轉 1、停轉 1.5 | 1 | Electric motor spinning up a rotary gatling barrel, rising whir then steady loop, anime sci-fi mechanical |
| `gun_gat_hvy_near` | GT-70 背部加特林（更低更重） | near `smgN1-3`（音高 0.6）、body `bChain`、low `~thD` | recipes.js:41 | 0.18 | 4 | Single round from a heavy shoulder-mounted gatling cannon, deep thumping report, realistic |
| `gun_gat_hvy_far` | 背部加特林遠距離 | `smgF1` | recipes.js:43 | 0.7 | 2 | Distant heavy autocannon burst rumbling |
| `gun_gat_hvy_spin` | 背部加特林轉管（**目前沒有**）**循環** | 沒有聲音 | entities/mech-entity.js:883 | 2（循環） | 1 | Large rotary cannon barrel spinning, heavy motor whine loop |
| `gun_sg_near` | SG-33 霰彈槍 | near `sgN1-3`、body `bShotgun`、low `~thB` | recipes.js:51 | 0.9 | 4 | Giant mech shotgun blast, massive booming crack with wide spray, realistic |
| `gun_sg_far` | 霰彈槍遠距離 | `sgF1/2` | recipes.js:53 | 1.4 | 2 | A single distant shotgun blast heard from far away, muffled deep boom followed by a long rolling echo across open terrain |
| `gun_sg_mech` | 霰彈槍的泵動 | `iron2/4` | recipes.js:55 | 0.3 | 3 | Heavy pump-action shotgun racking, two-stage metal clack |
| `gun_lsg_near` | LSG-06 雷射霰彈槍（能量的散射） | near `beam2`／`rLaser`、body `~zapC`、mech `eHi2`、low `~thB` | recipes.js:61 | 0.7 | 4 | Laser shotgun blast, anime sci-fi scattered energy burst with crackling buzz |
| `gun_lsg_far` | 雷射霰彈槍遠距離 | `lzB1/2` | recipes.js:63 | 1.0 | 2 | A distant sci-fi laser blast heard from far away, thin electric zap with a faint crackling burst and a soft fading echo |
| `gun_bz_near` | BZ-31 火箭筒／一般砲彈（`shell` 預設） | near `cannon1-3`、body `rocket`、low `~thB` | recipes.js:71；mech-entity.js:927 | 1.0 | 4 | Mech bazooka firing, heavy cannon boom with rocket backblast whoosh, realistic |
| `gun_bz_far` | 火箭筒遠距離 | `hvyF1/2` | recipes.js:73 | 1.5 | 2 | Distant heavy cannon shot, deep boom rolling across terrain |
| `gun_bz_mech` | 火箭筒裝填的機械聲 | `iron1/3` | recipes.js:75 | 0.3 | 2 | A single heavy metal clunk of a large shell sliding into a launcher breech, solid mechanical latch click, short and dry |
| `gun_gl_near` | GL-12 手持榴彈槍（`grenade` 預設，也用於敵人的迫擊砲） | near `cannon3`／`boomLow`、body `bang1`、low `~thB` | recipes.js:80；mech-entity.js:979 | 0.8 | 4 | Grenade launcher firing, hollow deep thoomp with metallic tube ring |
| `gun_gl_far` | 榴彈槍遠距離 | `hvyF2` | recipes.js:82 | 1.2 | 2 | Distant grenade launcher thump |
| `gun_glh_near` | GL-90 肩上榴彈砲 | near `cannon2`／`boomLow`、body `bang2`、low `~thC` | recipes.js:88 | 1.2 | 3 | Shoulder howitzer firing, huge deep artillery boom with long tail, realistic |
| `gun_glh_far` | 榴彈砲遠距離 | `hvyF1` | recipes.js:90 | 1.8 | 2 | Distant artillery cannon firing, low rumble |
| `gun_lr_near` | LR-40 雷射步槍（`laser` 預設） | near `lzA1-3`、body `~zapA`、mech `eHi3`、low `~thA` | recipes.js:96；mech-entity.js:1264 | 0.6 | 4 | Laser rifle shot, anime sci-fi beam zap with bright crackle |
| `gun_lr_far` | 雷射步槍遠距離 | `lzB1/2` | recipes.js:98 | 0.9 | 2 | Distant laser rifle shot, thin sci-fi zap with soft echo |
| `gun_lc_near` | LC-055 雷射砲、LCB-60 背雷射砲 | near `beam1/3`、body `~zapB`、mech `eLow1`、low `~thB` | recipes.js:105 | 1.0 | 3 | Heavy laser cannon blast, anime sci-fi powerful beam discharge with deep hum |
| `gun_lc_far` | 雷射砲遠距離 | `lzA1/2` | recipes.js:107 | 1.4 | 2 | Distant laser cannon firing, low sci-fi boom |
| `gun_lc_charged_near` | 蓄滿的雷射（`laserCharged`） | near `beam1/3`、body `laserCharged`、mech `eLow3`、low `~thC` | recipes.js:114；mech-entity.js:1264 | 1.8 | 3 | Fully charged mega laser blast, anime sci-fi thunderous beam release with sub-bass |
| `gun_lc_charged_far` | 蓄滿雷射遠距離 | `sciBoom` | recipes.js:116 | 2.0 | 2 | Distant giant sci-fi energy cannon boom |
| `gun_ms_launch` | MS-4 導彈莢艙發射（每發輪流；`missile` 預設） | near `rocket`、body `missile`、mech `mHit5/2`、low `~thA` | recipes.js:124；mech-entity.js:1074 | 0.8 | 4 | Missile launching from a pod, hatch clunk then ignition hiss and rocket whoosh |
| `gun_ms_far` | 導彈發射遠距離 | `rocket` | recipes.js:126 | 1.0 | 2 | Distant missile launch whoosh |
| `gun_ms8_launch` | MS-8 重導彈發射 | near `rocket`、body `cannon3`、mech `mHvy2`、low `~thB` | recipes.js:135 | 1.2 | 3 | Heavy missile launch, deep ignition roar and thunderous rocket lift-off |
| `gun_ms8_far` | 重導彈遠距離 | `rocket` | recipes.js:137 | 1.4 | 2 | Distant heavy rocket launch rumble |
| `gun_pm_launch` | PM-6 電漿導彈發射 | near `eMid1/2`、body `rocket`、mech `phUp`、low `~thA` | recipes.js:146 | 1.0 | 3 | Plasma missile launch, anime sci-fi energy hum with ignition burst |
| `gun_pm_far` | 電漿導彈遠距離 | `eLow2` | recipes.js:148 | 1.2 | 2 | Distant plasma launch, low energy throb |
| `missile_fly_loop` | 導彈飛行中的推進聲（**目前沒有**；房主與客機都只有發射與爆炸）**循環**，3D 跟著彈體 | 沒有聲音 | entities/projectile.js（每格） | 1.5（循環） | 2 | Missile in flight, continuous rocket motor roar loop |
| `gun_emp_beam` | EMP-9 電磁槍（光束） | near `zap2/1`、body `~empS`、low `~thA` | recipes.js:157 | 0.8 | 3 | Electromagnetic beam rifle shot, anime sci-fi crackling electric zap |
| `gun_emp_beam_far` | 電磁槍遠距離 | `eHi1` | recipes.js:159 | 1.0 | 2 | Distant electric zap |
| `emp_beam_loop` | 電磁光束持續照射（目前每隔 `sndT` 重播 `laser2`＋`~empS`）**循環** | `laser2`＋`~empS` 重複 | entities/mech-entity.js:1165 | 1.5（循環） | 1 | Continuous electromagnetic beam, anime sci-fi buzzing electric hum loop with crackles |
| `emp_overload` | 電磁槍過載（EN 回滿前不能發射） | `overload` | entities/mech-entity.js:1103 | 1.2 | 1 | Weapon overload shutdown, electric fizzle and power-down whine |
| `gun_cannon_near` | 空域機首的機砲（`air_cannon`）——**空戰組** | near `hvyN1/2`、low `~thA` | recipes.js:166 | 0.4 | 3 | （空戰組負責） |
| `gun_cannon_far` | 機砲遠距離——**空戰組** | `hvyF1/2` | recipes.js:168 | 0.8 | 2 | （空戰組負責） |
| `→ shot('blade')` | `shot` 的 `blade` 種類沒有配方：`boostUp`＋`laser2`＋`thrBurst`（只有敵人的迴旋刃等用） | — | audio.js:880 | — | — | 敵人組 |

### 2-B 合成音 41 個（`audio/synth.js`）的實際用處與取代

| 建議的音效鍵 | 事件的描述 | 目前的聲音 | 觸發處 | 長度（秒） | 變化數 | 給 AI 的英文提示詞草稿 |
|---|---|---|---|---|---|---|
| `sub_thump_light` | `~thA`：步槍、手槍、雷射、導彈的超低頻層 | `~thA`（72→40 Hz、0.22 秒） | recipes.js:18,26,102,130,152,162,170 | 0.3 | 2 | Short deep sub-bass punch, tight low thump for weapon recoil |
| `sub_thump_mid` | `~thB`：霰彈、重武器、QB、起跳、近戰命中、擊破確認、小爆炸 | `~thB`（58→32 Hz、0.38 秒） | recipes.js 多處；audio.js:961,1207,1214,1364 | 0.45 | 2 | Deep sub-bass impact thump, heavy body hit felt in the chest |
| `sub_thump_heavy` | `~thC`：爆炸、落地、BREAK、突擊推進、stinger | `~thC`（48→24 Hz、0.7 秒） | audio.js:941,952,1223,1283,1313,1319,1368 | 0.8 | 2 | Very low cinematic sub boom, long earth-shaking thump |
| `sub_thump_step` | `~thD`：腳步、機槍 | `~thD`（95→50 Hz、0.12 秒） | audio.js:1252；recipes.js:35,46 | 0.15 | 3 | Very short low thud, heavy footfall body |
| `→ ~whizK1/2、~whizE` | 子彈掠過 | | audio.js:1025 | | | 併入 `whiz_kin`／`whiz_en` |
| `→ ~ric1-3` | 跳彈 | | audio.js:1020 | | | 併入 `ricochet` |
| `→ ~tink1-3` | 彈殼 | | audio.js:1038 | | | 併入 `casing_*`（機獸組也用 `~tink3`） |
| `→ ~servoU/D/S` | 伺服馬達 | | audio.js:1267-1272 | | | 併入 3 節 `servo_*` |
| `→ ~hiss`、`~hissL` | 液壓的嘶（起跳、急停、落地、EN 用完） | | audio.js:1215,1225,1268,1304 | | | 併入 3 節 `hydraulic_hiss`、`en_overheat` |
| `→ ~qbPre` | QB 與突擊推進的吸氣預備 | | audio.js:1204,1280 | | | 併入 `qb_dash`、`ab_start` |
| `→ ~jetTail`、`~jetTailL` | 推進器收尾（QB、起跳、突擊推進結束；地圖載具的直升機起飛） | | audio.js:1208,1216,1287；world/map-veh.js:626 | | | 併入 `jet_tail`、`ab_end`、7 節 `mveh_heli_takeoff` |
| `→ ~jetLoop` | 推進器高頻嘶的循環 | | game/game.js:166,173；game/style-lab.js:368 | | | 併入 3 節 `thrust_hiss_loop` |
| `→ ~zapA/B/C` | 雷射的 body 層（機獸組也用 `~zapC`） | | recipes.js:65,100,109 | | | 併入各雷射武器的 near |
| `→ ~emp`、`~empS` | EMP 爆發、電磁槍 body、電磁光束 | | audio.js:928；recipes.js:161；mech-entity.js:1166 | | | 併入 `emp_blast_*`、`gun_emp_beam`、`emp_beam_loop` |
| `→ ~click` | 空扳機 | | audio.js:1300 | | | 併入 3 節 `dry_fire` |
| `→ ~reload`、`~reloadH` | 裝填開始 | | audio.js:1297 | | | 併入 3 節 `reload_*` |
| `→ ~sting`、`~stingL` | 配樂的重音（Boss 的 BREAK、擊破） | | audio.js:1318 | | | 併入 3 節 `stinger_*` |
| `→ ~horn` | 地圖載具受驚的喇叭 | | world/map-veh.js:724 | | | 併入 7 節 `mveh_horn` |
| `→ ~roarL/H、~rumble、~growl、~screech、~chitter、~claw、~flap、~bstep` | 機獸（9 個） | | entities/mech-beast-fx.js | | | 機獸組 |

---

## 3. 自機的行為（移動、射擊狀態、近戰、回饋）

| 建議的音效鍵 | 事件的描述 | 目前的聲音 | 觸發處 | 長度（秒） | 變化數 | 給 AI 的英文提示詞草稿 |
|---|---|---|---|---|---|---|
| `thrust_loop` | 推進器的低沉轟（滑行、懸浮、空中、移動；音量依狀態 0.25～0.9、音高依推進 1.0／1.25）**循環**；敵人的推進器也用同一個（`loopAt`） | `thrustLoop` | game/game.js:172；game/feedback.js:243 | 4（循環） | 1 | Mech booster thruster steady roar loop, anime sci-fi jet with deep rumble, seamless |
| `thrust_hiss_loop` | 推進器高頻的嘶（推得越用力越多）**循環** | `~jetLoop` | game/game.js:173 | 3（循環） | 1 | High-frequency jet exhaust hiss loop, anime sci-fi afterburner sizzle, seamless |
| `ab_engine_loop` | 突擊推進中的引擎尖嘯 **循環** | `engineHi` | game/game.js:174 | 3（循環） | 1 | Overdriven assault boost engine scream loop, anime sci-fi jet afterburner at full power |
| `boost_skid_loop` | 推進滑行時腳底擦地（**目前沒有**）**循環**，依速度與地面 | 沒有聲音 | game/game.js:169（`p.boost`） | 2（循環） | 2 | Giant mech feet skidding across concrete while boosting, grinding scrape loop |
| `qb_dash` | QB（快速推進）：吸氣→噴發→低頻 | `~qbPre`＋`boostUp`＋`thrBurst`＋`~thB` | audio.js:1203；entities/mech-entity.js:3083 | 0.8 | 4 | Quick boost dash, short sharp thruster burst with intake whoosh, anime sci-fi mecha |
| `jet_tail` | 推進器噴發後的收尾嘶聲（QB、起跳共用） | `~jetTail` | audio.js:1209、1217 | 0.6 | 3 | Thruster burst fading tail, hissing jet exhaust winding down |
| `air_jump` | 空中跳（向上的 QB；目前和 QB 同一個） | `qb` | entities/mech-entity.js:3540 | 0.8 | 3 | Mech mid-air double jump, upward thruster kick burst, anime sci-fi |
| `jump` | 起跳（推進器往下蹬） | `boostUp`＋`thrBurst`＋`~thB`＋`~hiss`＋`~jetTail` | audio.js:1211；entities/mech-entity.js:3514 | 1.0 | 3 | Giant mech jump take-off, hydraulic leg push and downward thruster blast |
| `hover_engage` | 懸浮開始／爬升切換（**目前沒有**，只有推進器循環變大） | 沒有聲音 | entities/mech-entity.js（`hoverMode`） | 0.5 | 2 | Thrusters stabilizing into hover, quick pitch-up whoosh then steady |
| `land_light` | 落地（輕，落下速度低） | `boostDown`＋`thud`＋`~thC`＋`~hissL` | audio.js:1219；entities/mech-entity.js:3243 | 0.8 | 3 | A large heavy robot landing softly on the ground, short thruster whoosh fading out followed by a dull heavy thud and hydraulic hiss |
| `land_heavy` | 落地（重，從高處；加 `plate`、`mStomp`） | 同上＋`plate1/2`＋`mStomp` | audio.js:1222-1224 | 1.2 | 3 | Heavy mech crashing down onto ground from height, huge metal stomp with ground shake |
| `ab_start` | 突擊推進開始 | `~qbPre`＋`boostUp`＋`thrBurst`＋`~thC` | audio.js:1279；entities/mech-entity.js:3119 | 1.0 | 2 | Assault boost ignition, powerful jet afterburner kick with intake roar, anime sci-fi |
| `ab_end` | 突擊推進結束：降頻收尾 | `~jetTailL`＋`boostDown` | audio.js:1286；game/feedback.js:211 | 1.2 | 2 | A jet engine shutting down, high turbine whine descending in pitch and fading out with a soft airy exhaust hiss |
| `step_biped` | 二足的腳步（機甲的踩踏層） | `thud1/2`＋`mStep1-3`＋`~thD` | audio.js:1228；game/feedback.js:304（`ikGait` entities/mech-entity.js:3688） | 0.5 | 4 | Giant bipedal robot footstep, heavy metal foot stomping with servo whir, realistic |
| `step_biped_heavy` | 重型二足（重量 > 0.7 或 Boss） | `mStep1/2`＋`qStomp` | audio.js:1238 | 0.6 | 4 | Very heavy armored mech footstep, massive stomp with deep impact |
| `step_reverse` | 逆關節的腳步（輕快、音高較高） | `mStep3/4` | audio.js:1236 | 0.4 | 4 | A single quick footstep of a giant robot on steel ground, light springy metal clank with a short hydraulic click |
| `step_quad` | 四足的腳步（目前用二足的） | `mStep1-3` | audio.js:1238 | 0.5 | 4 | A single footstep of a giant mechanical spider, sharp pointed metal leg stabbing into the ground with a short hydraulic hiss |
| `tank_tread_loop` | 戰車腳的履帶（**目前沒有**：`mechStep` 跳過 tank）**循環**，依速度 | 沒有聲音 | game/feedback.js:295 | 3（循環） | 1 | Heavy tank treads rolling and clanking, track links rattling loop |
| `tank_engine_loop` | 戰車腳的引擎（**目前沒有**）**循環**，依油門 | 沒有聲音 | game/feedback.js:295 | 3（循環） | 1 | Diesel tank engine idle to drive rumble loop, deep and mechanical |
| `surf_conc` | 腳步的地面層：混凝土、土地 | `stepConc1-3` | audio.js:1260 | 0.4 | 3 | A single heavy footstep of a giant robot on concrete, deep thud with gritty crunch of gravel and dust |
| `surf_metal` | 腳步的地面層：金屬地板、高台 | `armor1-3` | audio.js:1256 | 0.4 | 3 | A single heavy footstep of a giant robot on a steel floor, deep resonant metal boom with a ringing clang |
| `surf_water` | 腳步的地面層：涉水 | `stepWet1/2`、`splash` | audio.js:1253 | 0.6 | 3 | Giant foot stepping into shallow water, big splash and slosh |
| `surf_snow` | 腳步的地面層：雪 | `stepSnow1/2` | audio.js:1254 | 0.5 | 3 | Heavy footstep crunching into deep snow |
| `surf_sand` | 腳步的地面層：沙（目前用雪的音高壓低） | `stepSnow1/2` | audio.js:1255 | 0.5 | 3 | Heavy footstep sinking into loose sand, dry soft crunch |
| `surf_ice` | 腳步的地面層：冰（目前用混凝土） | `stepConc1-3` | audio.js:1259 | 0.4 | 3 | Heavy footstep on thick ice, cracking crunch with glassy squeak |
| `servo_turn` | 原地轉身的伺服馬達（強度依轉速） | `~servoU`＋`servo1-6` | audio.js:1272；game/feedback.js:197 | 0.4 | 3 | Large robot servo motor whir turning, rising mechanical hum, anime sci-fi |
| `servo_start` | 起步 | `~servoS`＋`servo1-6` | game/feedback.js:201 | 0.3 | 3 | Robot actuator engaging, short servo whir |
| `servo_stop` | 急停（煞車） | `~servoD`＋`~hiss` | audio.js:1267；game/feedback.js:204 | 0.4 | 3 | Mech braking hard, descending servo whine with hydraulic hiss |
| `servo_aim` | 舉槍（`servo('aim')` 定義了但**沒有人呼叫**） | `~servoS` | audio.js:1270 | 0.2 | 2 | Quick servo twitch of a robot arm raising a weapon |
| `hydraulic_hiss` | 液壓洩壓的嘶（起跳、急停、落地共用） | `~hiss`／`~hissL` | audio.js:1215、1225、1268 | 0.6 | 3 | Hydraulic pressure release hiss, short pneumatic burst |
| `en_overheat` | EN 用完（推進器過熱） | `~hissL`＋`uiErr` | audio.js:1303；game/feedback.js:230 | 1.0 | 1 | Thruster overheating warning, steam venting hiss with an error buzzer, anime sci-fi |
| `en_recover` | EN 回滿（**目前沒有**） | 沒有聲音 | game/feedback.js:227 附近 | 0.5 | 1 | Short clean digital sci-fi sound, soft rising electronic chime with a gentle power-up hum, energy fully recharged |
| `heartbeat` | 低 AP 心跳（AP 30% 以下，越低越快：間隔 1.05→0.55 秒）**分段**：單一下心跳由程式依速率排程 | `tone` 70→40 Hz 兩下 | audio.js:859；game/feedback.js:258 | 0.4 | 3 | Single deep heartbeat thump (lub-dub), low and tense |
| `reload_light` | 裝填開始（輕武器） | `~reload` | audio.js:1296；entities/mech-entity.js:721、1358 | 1.0 | 3 | Mech rifle magazine reload, heavy mag release and insert clunk, realistic |
| `reload_heavy` | 裝填開始（導彈、砲彈、榴彈） | `~reloadH` | 同上 | 1.4 | 3 | Heavy launcher reloading, large shell sliding in and locking with a deep clank |
| `reload_done` | 裝填完成（**目前沒有**） | 沒有聲音 | entities/mech-entity.js（`reloadT` 歸零） | 0.3 | 2 | Weapon ready, crisp locking click with a short electronic tick |
| `dry_fire` | 彈藥用完的空扳機 | `~click` | audio.js:1299；entities/mech-entity.js:714 | 0.2 | 2 | Empty weapon dry fire click, hollow metallic trigger snap |
| `weapon_drop` | 彈藥耗盡丟棄武器、改用拳頭 | `hit3` | entities/mech-entity.js:1442 | 0.8 | 2 | Giant gun being dropped and hitting the ground, heavy metal clatter |
| `charge_loop` | 雷射蓄力／蓄力射擊的充能（目前只有開始播一次 `charge`＋`phUp`）**循環或分段**：音高跟充能比例上升 | `charge`＋`phUp` | audio.js:922；game/player.js:240、entities/mech-charge.js:38 | 2（循環）＋起音 0.5 | 1 | Energy weapon charging up, rising anime sci-fi whine with building electric hum, loopable |
| `charge_ready` | 蓄力完成 | `uiOk`＋`bell` | game/ranged.js:29-30 | 0.6 | 2 | Charge complete ping, bright anime sci-fi chime with energy sparkle |
| `power_shot` | 強力彈的第一發 | `boom2` | entities/mech-charge.js:130 | 1.0 | 2 | Overcharged power shot release, booming energy blast with shockwave |
| `melee_swing_blade` | 近戰揮擊：脈衝刀（預設音色） | `boostUp`＋`laser2` | audio.js:1085；entities/mech-entity.js:1879 | 0.5 | 4 | Energy blade swing, fast anime sci-fi whoosh with a sharp electric edge |
| `melee_swing_saber` | 光束大劍 | `laserBig2`＋`boostUp`＋`eMid1` | audio.js:1067 | 0.7 | 4 | Huge beam saber swing, heavy humming anime sci-fi whoosh |
| `melee_swing_claw` | 破碎爪 | `boostUp`＋`crunch1` | audio.js:1072 | 0.5 | 3 | Mechanical claw swipe, fast whoosh with metal joints snapping |
| `melee_swing_pile` | 打樁機（蓄力衝刺） | `thrBurst`＋`heavy`＋`servo3` | audio.js:1076 | 0.7 | 3 | A heavy hydraulic piston charging up, pressurized hiss and mechanical clunk, then a powerful forward thrust whoosh |
| `melee_swing_fist` | 拳頭（空手） | `boostUp` | audio.js:1081 | 0.4 | 3 | Giant robot punch swing, heavy air whoosh |
| `melee_acc_f` | 前派生（突刺）的疊加 | `laser`＋`thrBurst`＋自機 `noise` 3400 Hz | audio.js:1090 | 0.3 | 2 | Quick forward thrust, sharp piercing whoosh |
| `melee_acc_s` | 側派生（迴旋）的疊加 | `boostUp`＋`thrBurst`＋`noise` 900 Hz 0.42 秒 | audio.js:1095 | 0.6 | 2 | Spinning slash, long circular wind whoosh |
| `melee_acc_b` | 後派生（上挑）的疊加 | `charge`＋`boostUp` | audio.js:1100 | 0.5 | 2 | Upward rising slash, ascending whoosh pitch-up |
| `melee_acc_a` | 空中連段的疊加 | `thrBurst`＋`laser2` | audio.js:1104 | 0.4 | 2 | Aerial slash with a short thruster puff |
| `melee_acc_d` | 下劈的疊加 | `boostDown`＋`thrBurst` | audio.js:1108 | 0.5 | 2 | Downward plunging slash, diving whoosh |
| `melee_acc_x` | 衝刺斬的疊加 | `boostUp`＋`thrBurst`＋`noise` 600 Hz | audio.js:1112 | 0.6 | 2 | Dash slash, thruster burst rushing forward |
| `melee_acc_e` | 處決的起手 | `charge`＋`overload` | audio.js:1117；entities/mech-entity.js:1706 | 0.8 | 2 | A sci-fi energy weapon charging up, deep electric hum rising in pitch with crackling static, ominous and powerful |
| `melee_acc_h` | 盾擊 | `shield`＋`thud1` | audio.js:1121 | 0.5 | 2 | Shield bash shove, heavy energy shield thump |
| `melee_hit_blade` | 近戰命中：脈衝刀（預設） | `hit`＋`punch`＋`armor1`＋`mHit` | audio.js:1153；entities/mech-entity.js:2036 | 0.6 | 4 | Energy blade slicing into mech armor, sizzling cut with metal shriek |
| `melee_hit_saber` | 光束大劍命中 | `laserBig`＋`armor1`＋`eLow1` | audio.js:1135 | 0.8 | 4 | Beam saber cleaving armor, heavy anime sci-fi burn slash with deep impact |
| `melee_hit_claw` | 破碎爪命中 | `crunch1-3`＋`grit` | audio.js:1140 | 0.6 | 3 | Mechanical claw crushing armor, grinding metal crunch |
| `melee_hit_pile` | 打樁機命中 | `heavy`＋`armor3`＋`clashHvy` | audio.js:1144 | 1.0 | 3 | Pile bunker firing into armor, explosive piston slam with huge metallic bang |
| `melee_hit_fist` | 拳頭命中 | `punch1/2`＋`thud2` | audio.js:1149 | 0.5 | 3 | Giant robot fist punching armor, heavy metallic thud |
| `melee_hit_w_light` | 命中的重量層：輕（w 0～1） | `explode3` | audio.js:1185-1186 | 0.4 | 2 | Light impact burst, small crack of force |
| `melee_hit_w_heavy` | 命中的重量層：重（w 2，終結技） | `explode2`＋`boom2` | audio.js:1188-1189 | 0.9 | 2 | Heavy finishing blow impact, powerful bang with shockwave |
| `melee_hit_w_max` | 命中的重量層：極重（w 3，處決） | `explode2`＋`boom2`＋`explodeBig` | audio.js:1190 | 1.4 | 2 | Devastating crushing impact, massive boom with metal shattering |
| `melee_hitacc_pierce` | 突刺貫穿的疊加 | `armor2` | audio.js:1161 | 0.3 | 2 | A single sharp metal spike piercing through thick steel armor plate, harsh metallic puncture crunch with a short ringing tail |
| `melee_hitacc_scrape` | 迴旋刮過裝甲 | `plate1`＋`grit` | audio.js:1164 | 0.4 | 2 | Blade scraping along armor plates, grinding screech |
| `melee_hitacc_launch` | 上挑把對手打飛 | `plate2`＋`boostUp` | audio.js:1168 | 0.5 | 2 | A heavy metal clang impact immediately followed by a rising upward whoosh of air, sci-fi action hit |
| `melee_hitacc_ground` | 下劈砸進地面 | `rock1`＋`boom1`＋`debris` | audio.js:1172 | 1.0 | 2 | Slam into the ground, rock cracking and dirt exploding |
| `parry_clash` | 彈刀（反擊成功：對方的近戰被彈開；`clash` 方法現在沒人用，彈刀播的是 `shield`） | `shield` | entities/mech-entity.js:1631 | 0.9 | 3 | Two giant blades clashing in a parry, bright ringing metallic clang with spark burst, anime sci-fi |
| `pqb_dodge` | 完美 QB（完美迴避） | `thrBurst`（ui） | game/feedback.js:377 | 0.8 | 2 | Perfect dodge, slick anime sci-fi time-slow whoosh with a shimmering chime |
| `counter_start` | 完美 QB 後的反擊射擊開始（慢動作） | `bell`＋`thrBurst` | game/ranged.js:21-22 | 1.0 | 2 | Counterattack trigger, anime sci-fi slow-motion swell with bright bell hit |
| `atk_cue` | 敵人這一擊之前的紅色「!」（反擊提示） | `alarm`（位置） | entities/mech-entity.js:1544 | 0.4 | 2 | Quick danger telegraph ping, sharp alert blip, anime style |
| `hitconf_kin` | 命中確認：實彈（自己打中，依武器種類） | `uiTick`（音高 1.25） | audio.js:1336；game/feel.js:24 | 0.12 | 3 | Tiny crisp hit marker tick, sharp metallic click |
| `hitconf_shotgun` | 命中確認：霰彈 | `uiTick`（0.85） | 同上 | 0.15 | 2 | Chunky hit marker click, short low tick |
| `hitconf_en` | 命中確認：雷射 | `uiTick`（1.6） | 同上 | 0.12 | 2 | Bright anime sci-fi hit marker blip |
| `hitconf_exp` | 命中確認：砲彈、榴彈 | `uiTick`（0.7） | 同上 | 0.15 | 2 | Deep hit marker thock |
| `hitconf_heavy` | 命中確認的重擊層 | `thud1`＋`mHit2/4` | audio.js:1346 | 0.3 | 2 | A single heavy low metallic thunk, deep solid impact of a hammer hitting thick steel, short and punchy |
| `crit` | 打在弱點（CRITICAL） | `glass`＋`plate2` | audio.js:1353；entities/mech-weak.js:119、219；game/feedback.js:358 | 0.5 | 3 | Critical weak-point hit, sharp shattering armor crack with bright ring |
| `break_fx` | 打出敵人失衡（BREAK） | `bell`＋`glass`＋`boom2`＋`~thC`＋`tone` 880→1760 | audio.js:1309；game/feedback.js:332、347 | 1.0 | 2 | Enemy posture break, heavy impact with shattering glass and rising anime chime |
| `kill_confirm` | 擊破確認（連殺時音高一級級往上，10 級）**分段**：一個基準音由程式移調，或做 10 個上升音 | `tone` 660 Hz×2^(n/6)＋`uiTick`＋`~thB` | audio.js:1358；game/feedback.js:324 | 0.4 | 1（或 10 段） | Short clean digital UI sound, a single bright satisfying confirmation chime with a soft low thump underneath, sci-fi game |
| `kill_confirm_big` | 擊破精英／AC 的加重 | `bell`＋`boom1`＋`~thC` | audio.js:1365 | 1.2 | 2 | Major enemy destroyed, deep gong-like bell with heavy boom |
| `stinger_short` | Boss 的 BREAK：短的配樂重音 | `~sting` | audio.js:1317；game/feedback.js:336 | 1.5 | 2 | Short orchestral hit stinger, dramatic brass and drum accent |
| `stinger_long` | Boss 擊破：長的配樂重音 | `~stingL` | audio.js:1317；entities/mech-entity.js:2762 | 3 | 2 | Triumphant cinematic stinger, big orchestral hit with long ringing tail |
| `reaction_hot` | 屬性反應：過熱裝甲 | `heavy`＋`uiTick` | audio.js:1330；entities/mech-react.js:41 | 0.8 | 2 | A deep fiery whoosh of metal superheating, burning roar followed by sizzling and crackling hot steel |
| `reaction_burst` | 屬性反應：破甲爆裂 | `bell`＋`uiTick` | audio.js:1331 | 0.8 | 2 | Armor bursting reaction, metallic ring and crack |
| `reaction_jam` | 屬性反應：EMP 干擾 | `glitch`＋`uiTick` | audio.js:1332 | 0.6 | 2 | Electronic jamming glitch, stuttering digital static |
| `ranged_bonus` | 邊閃邊打的加成打中 | `uiTick`＋`plate1` | audio.js:1323；entities/mech-ranged.js:122 | 0.3 | 3 | Bonus hit ping, crisp metallic tick with sparkle |
| `ranged_bonus_ctr` | 加成是「反擊」時多一聲鐘 | `bell` | audio.js:1326 | 0.5 | 1 | Small bright bell accent |
| `ar_ok` | 主動裝填成功 | `uiOk`＋`plate1` | game/feel.js:32-33 | 0.4 | 2 | Perfect reload, satisfying mechanical clack with success chime |
| `ar_fail` | 主動裝填失敗 | `uiErr` | game/feel.js:34 | 0.4 | 1 | A single dull mechanical clunk of a jammed gun, followed by a short low digital error buzz |
| `style_rank_up` | 風格評價升級（D→C→…→S）（**目前沒有**） | 沒有聲音 | game/style-meter.js | 0.6 | 3 | Style rank up, punchy anime announcer-style whoosh swell |
| `style_rank_down` | 風格評價掉級（**目前沒有**） | 沒有聲音 | game/style-meter.js | 0.5 | 1 | Short clean digital UI sound, a quick descending two-note tone, deflating and disappointed, sci-fi game interface |
| `lock_switch` | 換鎖定目標（按鍵、甩動、俯視游標吸附、眼動追蹤） | `uiClick` | game/player.js:107、game/chase.js:422、game/top-aim.js:184、game/gaze.js:451 | 0.15 | 2 | Short clean digital UI sound, a single quick high-pitched electronic beep of a targeting system switching target |
| `lock_acquire` | 自動鎖定到新目標（**目前沒有**） | 沒有聲音 | game/player.js（`autoLock`） | 0.2 | 2 | Short clean digital UI sound, a crisp double electronic beep, targeting system locking on, sci-fi |
| `missile_lock_tick` | 導彈鎖定累積（地面的「導彈鎖定 n／N」，**目前沒有**；空域另有）**分段** | 沒有聲音 | entities/mech-entity.js:2264（`missileN`） | 0.1 | 1 | Missile lock tone tick, short high beep |
| `missile_lock_full` | 導彈全部鎖滿（**目前沒有**） | 沒有聲音 | 同上 | 0.4 | 1 | Full missile lock, steady high-pitched solid tone |
| `missile_incoming` | 敵人導彈朝自己飛來的警報（地面，**目前沒有**；空域另有） | 沒有聲音 | entities/projectile.js | 1.0（可循環） | 1 | Incoming missile warning alarm, rapid urgent cockpit beeping |
| `assist_toggle` | 目標輔助的開關 | `uiClick` | game/chase.js:125 | 0.2 | 2 | Targeting assist toggled, soft electronic switch click |
| `view_switch` | 切換視角（俯視／追尾／第一人稱，**目前沒有**） | 沒有聲音 | game/view-tr.js | 0.4 | 2 | Camera mode switch, quick anime sci-fi HUD swoosh |
| `repair_kit` | 使用修復套件（也用於補給完成、隊友撿東西、救援） | `ui2`＋`uiOpen` | audio.js:1389；game/mission.js:56、game/mp-host.js:295、325 | 1.2 | 2 | Mech repair kit deploying, nanomachine repair hum with mechanical clicks, anime sci-fi |
| `consumable_use` | 使用消耗品（按鍵） | `uiClick` | game/mission.js:102 | 0.3 | 1 | Cockpit consumable button press, confirming electronic beep |
| `revive_done` | 重生／整備後回滿（`door`） | `door` | entities/mech-entity.js:2818 | 1.0 | 1 | A machine powering back on, electric hum rising in pitch with startup beeps and a heavy metal hatch clunk |
| `self_destroyed` | 自機被擊破（**目前只有一般的爆炸**；駕駛艙警報、系統斷電） | `explode`＋`wreck` | entities/mech-entity.js:2722 | 2.5 | 2 | Cockpit critical failure, alarms cutting out into a power-down groan and explosion |
| `status_hook` | 狀態：被鉤住 | `plate1`＋`clatter1` | entities/mech-status.js:361 | 0.6 | 2 | Steel harpoon hook latching onto armor, heavy clank and chain rattle |
| `status_stick` | 狀態：黏附炸彈 | `crunch1`＋`uiTick` | entities/mech-status.js:364 | 0.5 | 2 | Sticky bomb attaching, wet magnetic clamp with arming click |
| `status_stick_beep` | 黏附炸彈的倒數（越近越快）**分段** | `tone` 2200/1700 Hz 方波 | entities/mech-status.js:501 | 0.06 | 1 | Bomb countdown beep, short sharp electronic blip |
| `status_latch` | 狀態：被纏附 | `crunch2`＋`splash` | entities/mech-status.js:367 | 0.6 | 2 | Organic parasite latching on, wet squelch and grip |
| `status_slow` | 狀態：緩速（冷凍） | `glass`＋`stepSnow1` | entities/mech-status.js:370 | 0.6 | 2 | Freezing frost spreading over armor, crackling ice crust |
| `status_nojump` | 狀態：禁止跳躍（重力場） | `overload` | entities/mech-status.js:373 | 0.7 | 1 | Gravity lock field, deep warping hum, anime sci-fi |
| `status_net` | 狀態：捕獲網 | `clatter2`＋`door` | entities/mech-status.js:375 | 0.6 | 2 | Capture net wrapping around a mech, cables snapping tight |
| `status_spotted` | 狀態：被標定 | `charge` | entities/mech-status.js:378 | 0.6 | 1 | Targeting laser lock on you, rising anime sci-fi scanning tone |
| `status_drain` | 狀態：吸取 EN | `dome1` | entities/mech-status.js:380 | 0.7 | 1 | Energy being siphoned, draining anime sci-fi whir |
| `status_escape` | 掙脫狀態（QB 甩掉） | `plate2`＋`uiOk` | entities/mech-status.js:412-413 | 0.5 | 2 | Breaking free, metal snap release with relief chime |
| `status_cut` | 近戰割開（捕獲網、纏附） | `glass`＋`uiOk` | entities/mech-status.js:411 | 0.5 | 2 | Cutting through restraints, sharp slice and snap |
| `status_end` | 狀態自然結束 | `clatter1` | entities/mech-status.js:436 | 0.4 | 1 | A light metal clatter, small loose steel pieces dropping onto a hard floor and rattling briefly |
| `wing_command` | 對僚機下指令（Z 鍵） | `uiClick` | game/wing.js:86 | 0.3 | 2 | Squad command issued, short radio chirp |
| `wing_revive` | 救起倒地的僚機 | `ui2`＋`uiOpen`（kit） | game/wing.js:112 | 1.2 | 1 | Ally mech revived, power restore hum |
| `gear_proc_affix` | 零件的紫／金詞條觸發（**目前沒有聲音**，例如觸發型詞條） | 沒有聲音 | entities/mech-gear-fx.js、mech-gear-gold.js | 0.5 | 3 | Special perk triggers, shimmering anime sci-fi power-up chime |
| `legend_proc` | 傳說模組的效果觸發（繞背、殘影誘餌、護盾轉化…，**目前沒有**） | 沒有聲音 | entities/mech-legend.js | 0.7 | 3 | A powerful sci-fi energy surge, bright shimmering whoosh with rising electric hum and sparkling magical chime |
| `shield_absorb` | 脈衝盾擋下傷害（**目前沒有專屬聲音**，只有一般命中） | 沒有聲音 | entities/mech-entity.js:2547-2553 | 0.5 | 3 | Pulse shield absorbing a hit, anime sci-fi hexagonal barrier ping with hum |

---

## 4. 介面（各畫面）

全域：`game/input.js:1378-1392` 對所有 `button` 的點擊播 `uiBtn`（文字含「返回／回標題／取消／關閉／離開／放棄」＝back、`.primary`＝ok、其他＝click），滑過按鈕（任務中除外）播 `hover`；各按鈕自己的 `SFX.ui()` 在 0.1 秒內不重複。所以「有按鈕就有聲音」，下表主要列「該有專屬聲音的事件」。

| 建議的音效鍵 | 事件的描述 | 目前的聲音 | 觸發處 | 長度（秒） | 變化數 | 給 AI 的英文提示詞草稿 |
|---|---|---|---|---|---|---|
| `ui_click` | 一般按鈕 | `uiClick` | audio.js:1388；game/input.js:1382 | 0.1 | 3 | Clean futuristic UI button click, crisp anime sci-fi tap |
| `ui_ok` | 確定（primary 按鈕、音量測試） | `uiOk` | audio.js:1384；game/settings.js:473 | 0.25 | 2 | UI confirm sound, bright anime sci-fi two-tone affirm |
| `ui_back` | 返回、取消、關閉 | `uiBack` | audio.js:1383 | 0.2 | 2 | UI cancel back sound, soft descending anime sci-fi blip |
| `ui_err` | 錯誤、不能操作（作戰室戰略桌點到鎖住的節點等） | `uiErr` | audio.js:1385；game/hub-holo.js:631 | 0.3 | 2 | UI error denied buzz, short low double beep |
| `ui_hover` | 滑鼠移到按鈕上 | `uiTick` | audio.js:1387；game/input.js:1391 | 0.05 | 3 | Very subtle UI hover tick, tiny soft click |
| `ui_tog` | 切換開關（`ui('tog')` 定義了但**沒有人呼叫**；設定的開關現在是一般點擊） | `uiTog` | audio.js:1386 | 0.15 | 2 | UI toggle switch flip, snappy mechanical click |
| `ui_focus` | 手把移動焦點 | `uiClick` | game/pad-ui.js:114 | 0.08 | 2 | Gamepad menu cursor move, light anime sci-fi tick |
| `ui_adjust` | 手把左右改下拉選單、滑桿 | `uiClick` | game/pad-ui.js:198 | 0.08 | 2 | Slider value step, tiny digital notch click |
| `ui_tab` | LB／RB 換分頁（**目前沒有專屬**） | 按鈕音 | game/pad-ui.js | 0.15 | 2 | Tab switch swoosh, quick anime sci-fi panel slide |
| `ui_panel_open` | 開啟面板、疊加視窗、確認視窗（**目前沒有專屬**） | 按鈕音 | game/pad-ui.js（`uiConfirm`） | 0.3 | 2 | Holographic panel opening, soft rising anime sci-fi whoosh |
| `hud_alert` | `flashAlert` 的警示（電磁槍過載、熔岩、多人轉送的 alert）與狀態異常 | `ui2` | audio.js:1393；game/hud.js:152、entities/mech-status.js:389 | 0.5 | 2 | Cockpit caution alert, two-tone warning chime, anime sci-fi |
| `radio_open` | 通訊開頭（主線的通訊、過場的對白） | `noise` 2400 Hz＋`glitch`＋`tone` 1320 Hz | audio.js:1397；game/comms.js:132、game/cine.js:1463 | 0.3 | 3 | Radio transmission open, burst of static then short beep |
| `radio_close` | 通訊結束（**目前沒有**） | 沒有聲音 | game/comms.js | 0.2 | 2 | Radio transmission close, static click off |
| `radio_station` | 軌道站的機械語音段落 | `glitch` | game/cine.js:1487 | 0.4 | 2 | Corrupted digital transmission, eerie glitchy data stutter |
| `text_type_tick` | 簡報、劇情、結局、通訊框的逐字顯示（**目前沒有**） | 沒有聲音 | render/textfx.js（`revealDom`） | 0.04 | 3 | Soft text typing tick, tiny digital character blip |
| `banner_in` | 文字演出的橫幅、中央訊息（作戰開始、WARNING…，**目前沒有**） | 沒有聲音 | game/textfx.js | 0.6 | 3 | Bold title banner slam in, punchy anime UI whoosh with hit |
| `mod_pick_open` | 戰術模組三選一開啟、補給站商店開啟 | `bong`＋`uiOpen` | audio.js:1437；game/tactics.js:136、220 | 0.8 | 2 | Upgrade selection screen appears, resonant anime sci-fi chime with panel whoosh |
| `mod_take` | 選定模組 | `uiClick` | game/tactics.js:178、260 | 0.5 | 2 | Upgrade acquired, satisfying power-up chime |
| `choice_card` | 陣營抉擇說明卡出現 | `cue('phase')`＝`alarmBig`＋`boom1`＋`stinger`＋壓低 | game/guide.js:79 | 2 | 1 | Dramatic decision moment, deep ominous hit with tension swell |
| `area_clear` | 區段清除、全部清除、Boss 評價出來 | `tone` 523＋784 Hz | audio.js:1440；game/campaign.js:681、game/boss-tier.js:565 | 0.8 | 2 | Area cleared jingle, short triumphant anime sci-fi two-note fanfare |
| `garage_part_select` | 機甲庫：選部位、選零件、換配色（換裝的實體演出另見 5 節） | `uiClick` | game/garage-ui.js:92、198、game/garage.js:253 | 0.2 | 2 | Selecting a mech part, mechanical latch click with hologram blip |
| `garage_buy` | 機甲庫：購買零件（扣 COAM，**目前是一般點擊**） | `uiClick` | game/garage-ui.js:214 | 0.6 | 2 | Purchase complete, cash register style digital coin chime, anime sci-fi |
| `garage_equip` | 裝備零件、從倉庫裝備 | `uiClick` | game/gear-ui.js:253、game/local-lib.js:365 | 0.3 | 2 | Part equipped, heavy mechanical lock clunk |
| `gear_get_green` | 拿到綠色零件（目前所有品級都是 `cue('pickup')`＝`uiOk`） | `uiOk` | game/gear-loot.js:165、184 | 0.5 | 1 | Common loot pickup, simple bright chime |
| `gear_get_blue` | 拿到藍色零件 | `uiOk` | 同上 | 0.7 | 1 | Rare loot pickup, sparkling two-note chime |
| `gear_get_purple` | 拿到紫色零件 | `uiOk` | 同上 | 1.0 | 1 | Epic loot pickup, magical rising shimmer chime |
| `gear_get_gold` | 拿到金色零件（**最需要專屬聲音**） | `uiOk` | 同上 | 1.5 | 1 | Legendary loot drop, grand golden fanfare shimmer with deep resonant hit |
| `gear_inv_full` | 倉庫滿了撿不起來（**目前沒有**） | 沒有聲音 | game/gear-loot.js:174 附近 | 0.4 | 1 | Inventory full denied buzz |
| `forge_ascend` | 升階成功 | `uiOk` | game/gear-forge.js:121 | 1.2 | 2 | Item upgrade success, forging hammer strike with rising magical chime |
| `forge_reroll` | 重骰詞條 | `uiOk` | game/gear-forge.js:212 | 0.8 | 2 | Reroll stats, spinning digital slot roll ending with a click |
| `forge_dismantle` | 分解零件 | `uiOk` | game/gear-ui.js:417 | 0.8 | 2 | Dismantling a mech part, metal breaking down into scrap with clinks |
| `tune_up` | 零件調校升級 | `uiOk` | game/tune-ui.js:340 | 0.6 | 2 | Tuning upgrade applied, precise mechanical wrench click with chime |
| `tune_break` | 限界突破（調校上限 +1） | `uiOk` | game/tune-ui.js:359 | 1.2 | 1 | Limit break, powerful energy surge with breaking seal |
| `pilot_point_add` | 駕駛員：投一點技能（按住連續投點） | `uiClick` | game/pilot-ui.js:371 | 0.2 | 3 | Skill point invested, crisp ascending node activation blip |
| `pilot_point_remove` | 退一點 | `uiClick` | game/pilot-ui.js:386 | 0.2 | 2 | Skill point removed, descending soft blip |
| `pilot_hold_fill` | 按住投點的進度（**目前沒有**）**循環**，音高上升 | 沒有聲音 | game/pilot-ui.js | 1（循環） | 1 | Charging hold progress, rising soft hum |
| `pilot_preset` | 預設組的儲存／載入／清除 | `uiClick` | game/pilot-ui.js:606、628、635 | 0.4 | 2 | Loadout saved, data write chirp |
| `level_up` | 駕駛員升級、解鎖新的分支（**目前沒有**） | 沒有聲音 | game/pilot.js（`pilotGrant`） | 1.5 | 1 | Level up fanfare, bright triumphant anime sci-fi chime |
| `result_show` | 結果畫面出現（**目前沒有**） | 沒有聲音 | game/mission.js（`showScreen('result')`） | 1.0 | 2 | Mission result screen reveal, dramatic UI whoosh with low hit |
| `result_rank` | 結果的評價蓋章（S／A／B…，**目前沒有**） | 沒有聲音 | game/textfx.js（`tfxResult`） | 0.8 | 3 | Rank stamp slam, heavy impact with sparkle |
| `result_count` | 獎金、經驗跳數字（**目前沒有**）**循環** | 沒有聲音 | 結果畫面 | 1（循環） | 1 | Score counting up, rapid digital ticking loop |
| `mission_fail` | 任務失敗／主線陣亡畫面（**目前沒有**） | 沒有聲音 | game/campaign.js（`campFail`） | 2 | 1 | Mission failed, somber low descending synth drone |
| `save_done` | 存檔完成、存檔終端的存入／讀取／刪除（**目前只有按鈕音**） | 按鈕音 | game/save.js:357 | 0.6 | 2 | Data saved, clean digital write confirmation chirp |
| `title_start` | 標題畫面：按下開始、LOGO 出現（**目前只有按鈕音**） | 按鈕音 | game/input.js | 1.5 | 1 | Game title start, powerful anime sci-fi mech power-up whoosh |
| `brief_open` | 打開簡報、作戰室進出、設施 | `uiClick` | game/hub.js:199、283、382、388、396、473 | 0.5 | 2 | Briefing hologram opening, data projection hum |
| `sortie_go` | 出擊（簡報的「出擊」、轉場畫面的直接出擊） | `uiClick` | game/hub.js:382、game/campaign.js:1290 | 1.0 | 1 | Sortie launch confirm, determined anime sci-fi power surge |
| `tut_goal` | 教學：練習目標達成一次 | `uiOk` | game/tutorial.js:829、930、950 | 0.3 | 2 | Small success ding, bright and quick |
| `tut_pass` | 教學：一個練習過關 | `bell` | game/tutorial.js:850 | 0.8 | 1 | Lesson stage cleared, pleasant bell chime |
| `tut_cue` | 教學的時機提示（敵人出招的時機） | `alarm` | game/tutorial.js:1101 | 0.3 | 2 | Timing cue blip, sharp attention ping |
| `tut_lesson_done` | 一課完成（**目前是一般點擊**） | `uiClick` | game/tutorial.js:1191 | 1.5 | 1 | Lesson complete fanfare, short anime training success jingle |
| `editor_place` | 關卡編輯器：放置物件、單位（**編輯器完全沒有聲音**） | 沒有聲音 | game/editor.js | 0.2 | 3 | Placing an object in an editor, soft solid snap click |
| `editor_delete` | 編輯器：刪除 | 沒有聲音 | game/editor.js | 0.2 | 2 | Deleting an object, quick soft pop |
| `editor_undo` | 編輯器：復原／重做 | 沒有聲音 | game/editor.js | 0.15 | 2 | Undo action, short reverse swoosh |
| `editor_brush_loop` | 編輯器：地形筆刷拖曳中 **循環** | 沒有聲音 | game/editor.js | 1（循環） | 1 | Terrain sculpting, soft earthy rumble loop |
| `gaze_cal_point` | 眼動追蹤校準：每一個點完成（**目前只有開關與存檔的點擊**） | `uiClick` | game/gaze.js:763、995 | 0.2 | 2 | Calibration point captured, soft confirm blip |
| `lobby_join` | 多人大廳：有人加入、訊號 | `uiClick` | game/mp-lobby.js:406 | 0.4 | 2 | Player joined lobby, friendly connect chime |
| `lobby_countdown` | 多人出擊前倒數、出口投票倒數（**目前沒有**） | 沒有聲音 | game/campaign-mp.js（`campVoteTick`） | 0.15 | 1 | Countdown tick, clean digital beep |
| `→ 其他畫面` | 自由出擊、靶場選單、模擬器、作戰紀錄、過場劇場、配樂／語音試聽、地圖預覽、實驗室、節奏調整室、人物實驗、立繪：只有按鈕音（`ui_click`／`ui_back`） | 按鈕音 | game/free-ops.js、range.js、sim.js、cine-lib.js、bgm-lab.js、voice-lab.js、pace-lab.js、people-lab.js… | | | 用 `ui_*` |

---

## 5. 格納庫演出（`game/hangar.js`，現在全部是 `tone`／`noise`，走 ui 匯流排）

| 建議的音效鍵 | 事件的描述 | 目前的聲音 | 觸發處 | 長度（秒） | 變化數 | 給 AI 的英文提示詞草稿 |
|---|---|---|---|---|---|---|
| `hg_holo_scan` | 掃描換裝：全像掃描帶掃過機體（長度＝掃描時間） | `tone` 380→1500 Hz 正弦 | game/hangar.js:493 | 1.2 | 2 | Holographic scanner sweeping over a mech, rising anime sci-fi scan hum |
| `hg_swap_done` | 換裝完成、掃描帶消失 | `noise` 900 Hz 帶通 0.12 秒 | game/hangar.js:727 | 0.4 | 2 | Part swap complete, short pneumatic lock hiss |
| `hg_rig_start` | 實體換裝開始（吊車、機械臂、升降口、後方軌道開始動） | `tone` 110→170 Hz 鋸齒 | game/hangar.js:585 | 0.6 | 2 | Heavy industrial machinery starting up, motor whine and clunk |
| `hg_rig_out` | 舊零件被拿走（吊車拉上去、機械臂收回、沉進地板）**循環**（長度依動作時間） | `tone` 140→220 Hz | game/hangar.js:670 | 1.5（可循環） | 2 | Overhead crane hoist lifting heavy parts, motor whir and chain rattle |
| `hg_rig_in` | 新零件送進來 **循環** | `tone` 220→140 Hz | game/hangar.js:671 | 1.5（可循環） | 2 | Robotic arm lowering a heavy part into place, hydraulic motor descending |
| `hg_clamp_grab` | 夾具抓住舊零件（火花） | `noise` 900 Hz 0.12 秒 | game/hangar.js:667（`grab`） | 0.4 | 2 | Mechanical clamp gripping metal, sharp clank with sparks |
| `hg_clamp_lock` | 新零件鎖上（大火花、蒸氣） | `noise` 500 Hz 0.22 秒 | game/hangar.js:667（`lock`） | 0.7 | 2 | Heavy mech part locking into its joint, powerful bolt slam with steam release |
| `hg_floor_hatch` | 地板升降口開關（**目前沒有專屬**） | 沒有聲音 | game/hangar.js:589（`hangarRigPath`） | 1.2 | 2 | Heavy floor hatch sliding open, grinding metal doors with hydraulic hiss |
| `hg_drone_fly` | 維修無人機飛過來 **循環** | `noise` 2400 Hz 高通 0.7 秒 | game/hangar.js:852 | 2（循環） | 1 | Small repair drone hovering, buzzing propeller hum loop |
| `hg_drone_weld` | 無人機修理中（焊接火花，**目前沒有**）**循環** | 沒有聲音 | game/hangar.js:806（`hangarRepairTick`） | 2（循環） | 1 | Welding torch repairing armor, crackling arc welder loop |
| `hg_repair_done` | 修理完成 | `noise` 900 Hz 0.1 秒 | game/hangar.js:871 | 0.6 | 1 | Repair finished, tool click and satisfied power hum |
| `hg_supply_truck` | 補給車（彈藥車、修復套件車）開到機體前（**目前只有按鈕音**） | `uiClick` | game/hangar.js:889 | 3 | 2 | Small electric utility truck driving in and stopping, motor hum and brake squeak |
| `hg_launch_alarm` | 出擊演出開始的警報（閃燈） | `alert`（`ui2`） | game/hangar.js:938 | 1.5（可循環） | 1 | Hangar launch alarm, rotating klaxon warning |
| `hg_launch_rumble` | 出擊前的低鳴（長度＝演出時間） | `noise` 110 Hz 低通 | game/hangar.js:939 | 3（循環） | 1 | Deep hangar machinery rumble building up |
| `hg_lift_rise` | 出擊：升降台把機體送上天花板開口 | `tone` 70→140 Hz 2 秒 | game/hangar.js:967 | 2.5 | 1 | Massive elevator platform rising, heavy hydraulic lift groan |
| `hg_catapult` | 出擊：彈射器（閘門） | `tone` 120→60 Hz 1.6 秒 | game/hangar.js:978 | 2 | 1 | Electromagnetic catapult launching a mech, charging whine then explosive release, anime sci-fi |
| `hg_tent_launch` | 出擊：野戰帳篷往前衝出再爬升（**目前只有警報與低鳴**） | 沒有專屬 | game/hangar.js:941 之後的第三種 | 2 | 1 | Mech boosting out of a field tent, thruster roar rushing forward |
| `hg_ambience` | 格納庫的環境音（技師、工具、遠方的機械，**目前沒有**）**循環**，依場景（基地格納庫、野戰帳篷、作戰室窗外） | 沒有聲音 | render/hangar.js（`tickHangar`） | 20（循環） | 2 | Busy mech hangar ambience, distant tools clanking, air compressors, muffled announcements |
| `hg_tech_steps` | 技師走動、工具聲（**目前沒有**） | 沒有聲音 | render/hangar.js | 0.4 | 3 | Mechanic footsteps on metal floor with tool clinks |

---

## 6. 過場動畫（`game/cine.js` 與 `src/data/cine/`）

### 6-A 播放機制

- `cineEvent` 的 `sfx`（game/cine.js:1312-1323）：沒有 `at` 時走 ui 匯流排（不分位置）；`loop`／`loopKey`（cine.js:1325）用 `loopSet('cine', …)`，預設 `engineLoop`；`boom`（cine.js:1337）呼叫 `explode`；演員是真正的 `MechEntity`，開火、QB、腳步照 2、3 節的聲音自動出現。
- 字幕：有說話者時 `radio`（cine.js:1463）；軌道站 `glitch`（cine.js:1487）。
- 進場景 `cineUseSet` 停環境音（cine.js:439、452、488），所以過場沒有環境音，只靠配樂。
- `chfilm.js`、`choice-anime.js` 的 `sfx: '轟'`／`'鏗'`／`'——'` 是 2D 舞台的漫畫狀聲詞文字，**不是聲音**。

### 6-B 各劇本用到的鍵

| 劇本 | 用到的鍵（次數） | 用途 |
|---|---|---|
| `prologue.js` 序章 | boostUp×9、glitch×3、heavy×4、distant×2、alarm×2、door×2、boostDown×2、charge×2、thrBurst×2、ui2×2、debris、explodeBig、boom2、missile、rock1、rock2、stepConc1、engineHi、uiOpen、thud1／thud2（世界觀空景的脈動）；loop：thrustLoop（空降艙推進器 prologue.js:430）、engineLoop（大氣層突入 488） | 0:00 訊號（glitch）、軌道站外殼與艙口（alarm、heavy、door）、投放（heavy、door、thrBurst、boostUp、推進器循環）、墜落（boostDown）、突入（engineLoop、debris、distant、撞擊 explodeBig＋boom2）、空景的脈動（thud1/2）、駕駛艙開機（ui2、uiOpen、charge）、站起來（heavy、boostDown、stepConc1）、蒙太奇（列車 engineHi＋heavy、鑽地蟲 rock1/2、SPECIMEN 對射 alarm＋boostUp＋missile、ZENITH charge＋boostUp） |
| `ch1-intro.js` 第 1 章開場 | thud1×8、distant×4、heavy×3、boostUp×3、alarm×2、bell×2、boom1×2、glitch×2、debris、door | 天線（bell 低音、distant）、砲擊（heavy、thud1、alarm、boom1）、霍斯特（door、glitch 通訊）、R-07（boostUp、alarm、heavy、boom1、glitch、debris）、章名卡（heavy＋thud1） |
| `ch2-anime.js` | thud1×7、distant×4、glitch×4、heavy×3、boostUp×2、alarm、boom1 | 開場、薩奇、「兩家都要你」、章名卡、章末（依抉擇） |
| `ch3-anime.js` | thud1×6、glitch×4、heavy×2、boostUp×2、distant、door | 同上的結構 |
| `ch4-anime.js` | glitch×2、heavy×2、thud1×2、boostUp、distant | 同上 |
| `ch5-anime.js` | thud1×4、glitch×3、heavy×2、alarm、boom1、boostUp、distant | 同上 |
| `ch6-anime.js` | glitch×5、thud1×5、heavy×3、alarm、boostUp、distant | 同上 |
| `ch7-anime.js` | heavy×4、glitch×3、boom1×2、thud1×2、boostUp、distant | 同上 |
| `choice-anime.js` 抉擇的選前／選後 | thud1×2、heavy×2、alarmBig、boom1、glitch | 選前的重音、警報；選後的爆炸、收尾的 glitch |
| `film.js` | thud1／thud2（每段切換）、heavy×3、glitch | 段落切換的節拍、章名的重音 |
| `memory-anime.js`、`talks.js` | glitch | 記憶片段、對話的開頭 |

### 6-C 過場要產生的項目

| 建議的音效鍵 | 事件的描述 | 目前的聲音 | 觸發處 | 長度（秒） | 變化數 | 給 AI 的英文提示詞草稿 |
|---|---|---|---|---|---|---|
| `cine_hit` | 剪接的重音（切鏡、章名卡、脈動；全部劇本最常用） | `thud1`／`thud2` | data/cine/*.js（約 45 處）、film.js:173 | 0.8 | 4 | Cinematic trailer hit, deep punchy impact with short reverb tail |
| `cine_heavy` | 預告片式的大重音（章名、投放、撞擊） | `heavy` | data/cine/*.js（約 25 處） | 2 | 3 | Massive cinematic boom hit, heavy metallic slam with long rumbling tail |
| `cine_glitch` | 通訊、全像、訊號的數位雜訊 | `glitch` | data/cine/*.js（約 30 處） | 0.6 | 4 | Digital transmission glitch, stuttering data corruption burst, anime sci-fi |
| `cine_distant_war` | 遠方的戰火、砲擊 | `distant` | data/cine/*.js（約 15 處） | 3 | 3 | Distant battlefield rumble, faraway artillery booms echoing |
| `cine_alarm` | 基地、艙口的警報 | `alarm`、`alarmBig` | prologue.js:389、ch1-intro.js:233 等 | 1.5 | 2 | Military base alarm klaxon echoing in a large hall |
| `cine_bell` | 天線場景的低沉鐘聲 | `bell`（音高 0.35） | ch1-intro.js:161-162 | 3 | 1 | Low distant bell toll, melancholic and resonant |
| `cine_hatch` | 艙口、閘門開關 | `door` | prologue.js:393、425、ch1-intro.js:472 | 1.5 | 2 | Heavy airlock hatch opening, mechanical unlock and pneumatic hiss |
| `cine_mech_boost` | 機體推進衝出（鏡頭裡的演員） | `boostUp`、`thrBurst` | prologue.js 多處、ch*-anime.js | 1 | 3 | Mech thrusters igniting and rushing past, anime sci-fi jet whoosh |
| `cine_explosion` | 爆炸的 `boom` 事件（照 `explode`） | `explode` | game/cine.js:1337 | — | — | 用 `exp_big`／`exp_huge` |
| `pod_clamp_release` | 空降艙的夾爪鬆開（目前用 heavy＋door 湊） | `heavy`＋`door` | prologue.js:424-425 | 1.2 | 1 | Drop pod docking clamps releasing, heavy mechanical unlatch with metal groan |
| `pod_thruster_loop` | 空降艙推進器 **循環** | `thrustLoop`（音高 0.7） | prologue.js:430 | 4（循環） | 1 | Drop pod retro thrusters firing continuously, roaring jet loop |
| `pod_fall_wind` | 空降艙往雲層墜落的風切（**目前只有 boostDown**）**循環** | `boostDown` | prologue.js:458 | 4（循環） | 1 | Object plummeting through the sky, howling wind rush loop |
| `pod_reentry_loop` | 大氣層突入：熱罩燃燒、震動 **循環** | `engineLoop`（音高 0.6） | prologue.js:488 | 6（循環） | 1 | Atmospheric reentry, roaring fire and violent shaking rumble loop |
| `pod_impact` | 空降艙撞擊地面（閃白） | `explodeBig`＋`boom2` | prologue.js:493-494 | 3 | 1 | Drop pod slamming into the ground, colossal impact boom with debris |
| `cockpit_boot` | 駕駛艙開機（待機燈、系統啟動） | `ui2`＋`uiOpen`＋`charge` | prologue.js:555、588-591 | 3 | 1 | Mech cockpit powering on, systems booting with rising hum and HUD beeps, anime sci-fi |
| `mech_standup` | 機體從坑裡站起來（液壓、金屬摩擦） | `heavy`＋`boostDown` | prologue.js:632、637 | 2.5 | 1 | Giant mech rising from rubble, hydraulic groan, metal scraping and debris falling |
| `train_pass` | 武裝列車衝出隧道擦過鏡頭 | `engineHi`（音高 0.45）＋`heavy` | prologue.js:836、841 | 4 | 1 | Armored train rushing past at speed, thunderous rail clatter and engine roar doppler |
| `worm_burst` | 鑽地蟲破土 | `rock1`＋`rock2` | prologue.js:908、913 | 3 | 1 | Giant burrowing machine erupting from ice, rock and ice shattering rumble |
| `transport_flyby` | 運輸機、直升機編隊飛過（序章的委託方空景，**目前沒有**） | 沒有聲音（只有 thrBurst 一聲） | prologue.js:176 | 4 | 2 | Heavy VTOL transport flying overhead, deep turbine roar passing by |
| `heli_flyby` | 直升機低空掠過（**目前沒有**） | 沒有聲音 | prologue.js:52 之後（卡斯特隆） | 3 | 1 | Attack helicopter flying low past camera, chopping rotor doppler |
| `crowd_camp_amb` | 難民營、礦工的人聲背景（**目前沒有**）**循環** | 沒有聲音 | prologue.js:83、205 | 10（循環） | 1 | Distant crowd murmur at a refugee camp, wind and faint voices |
| `cine_onomatopoeia` | 2D 舞台的狀聲詞（轟、鏗）出現時（**目前只有文字**） | 沒有聲音 | data/cine/chfilm.js、choice-anime.js:563、657、677、725 | 0.8 | 2 | Comic panel impact hit, stylized manga slam sound |

---

## 7. 地圖（環境音、天候、水、熔岩、破壞、載具、小人、裝置、據點、拾取、增援、邊界、主線設施、結局、作戰室）

環境音的機制：`game/feedback.js:126` `audioScene` 依主題疊循環層（`AMB`，feedback.js:15-123），有岩頂時拿掉風、加 `ambCave`，天候是雨時加 `ambRain`；殘響（`setReverb`）與反射（`setEnv`，recipes.js 的 `ENV`）是參數不是素材。合成的 wind／gust／sea 是 `synthAmb`（audio.js:806，帶通雜訊＋LFO）。

| 建議的音效鍵 | 事件的描述 | 目前的聲音 | 觸發處 | 長度（秒） | 變化數 | 給 AI 的英文提示詞草稿 |
|---|---|---|---|---|---|---|
| `amb_industrial` | 貨運集散場 **循環** | `ambMach` 0.3＋合成 wind 0.18 | game/feedback.js:16 | 30（循環） | 1 | Busy cargo port ambience, distant machinery, cranes creaking, light wind, seamless loop |
| `amb_grid` | 模擬訓練場 **循環** | `ambHum` 0.35 | feedback.js:23 | 30（循環） | 1 | Virtual training simulator ambience, steady electronic hum with faint digital pulses, anime sci-fi loop |
| `amb_desert` | 礦坑遺跡 **循環** | `ambLow`＋wind | feedback.js:24 | 30（循環） | 1 | Abandoned mine canyon ambience, low rumble and dry wind through rocks, loop |
| `amb_snow` | 冰原 **循環** | 合成 gust 0.45＋wind 0.3 | feedback.js:31 | 30（循環） | 1 | Frozen tundra blizzard ambience, howling icy wind gusts, loop |
| `amb_wasteland` | 荒涼工業荒野 **循環** | wind＋`ambLow` | feedback.js:38 | 30（循環） | 1 | Desolate industrial wasteland, empty wind and distant metal groans, loop |
| `amb_dunes` | 沙丘地帶 **循環** | wind 0.45＋gust 0.15 | feedback.js:45 | 30（循環） | 1 | Open desert dunes ambience, hot wind with blowing sand hiss, loop |
| `amb_flooded` | 汙染淹沒城區 **循環** | `ambRain`＋`ambLow` | feedback.js:52 | 30（循環） | 1 | Flooded ruined city ambience, rain on water, dripping, low drone, loop |
| `amb_dam` | 階梯水壩 **循環** | `ambWater` 0.45＋wind | feedback.js:59 | 30（循環） | 1 | Giant hydroelectric dam ambience, roaring rushing water and wind, loop |
| `amb_spaceport` | 舊宇宙港 **循環** | `ambMach`＋`ambHum` | feedback.js:66 | 30（循環） | 1 | Derelict spaceport ambience, humming generators and distant machinery, loop |
| `amb_grid086` | 巨型構造體 Lattice-9 **循環** | `ambHum` 0.4＋`ambMach` 0.15 | feedback.js:73 | 30（循環） | 1 | Colossal megastructure interior, deep resonant hum and echoing metal creaks, loop |
| `amb_xylem` | 洋上都市 **循環** | 合成 sea 0.5＋wind 0.2 | feedback.js:80 | 30（循環） | 1 | Floating ocean city ambience, waves crashing below and sea wind, loop |
| `amb_orbit` | 高空軌道 **循環** | `ambHum`（音高 0.7） | feedback.js:87 | 30（循環） | 1 | High orbit platform ambience, thin air whistle and low station hum, anime sci-fi loop |
| `amb_institute` | 地下研究特區 **循環** | `ambCave`＋`ambMach` | feedback.js:95 | 30（循環） | 1 | Underground research facility ambience, ventilation hum, lab machinery, echoes, loop |
| `amb_ark` | 移動要塞「方舟」 **循環** | `ambHum`＋`ambLow`＋wind | feedback.js:103 | 30（循環） | 1 | On the deck of a giant moving land battleship, deep engine drone, high wind, loop |
| `amb_volcano` | 火山熔爐帶 **循環** | `ambLow`＋`ambMach`＋wind | feedback.js:112 | 30（循環） | 1 | Volcanic foundry ambience, deep earth rumble, bubbling lava, furnace roar, loop |
| `amb_airspace` | 空域——**空戰組** | wind＋gust | feedback.js:88 | — | — | （空戰組負責） |
| `amb_underground` | 有岩頂的地下（取代風的洞窟低鳴，任何主題的地下變體） **循環** | `ambCave` | feedback.js:135 | 30（循環） | 1 | Deep underground cave ambience, low droning resonance and distant drips, loop |
| `amb_night_layer` | 夜間變體的疊加層（蟲鳴、更安靜，**目前沒有**）**循環** | 沒有聲音 | world/variants.js（`nightV`） | 20（循環） | 1 | Quiet night ambience layer, sparse insects and distant hum, loop |
| `weather_rain` | 天候：雨 **循環** | `ambRain` | feedback.js:140 | 20（循環） | 1 | Steady rain falling on metal and concrete, seamless loop |
| `weather_thunder` | 雨天的遠雷（**目前沒有**） | 沒有聲音 | world/weather.js | 5 | 3 | Distant thunder rumble rolling across the sky |
| `weather_snowfall` | 天候：降雪（**目前沒有疊加**）**循環** | 沒有聲音 | world/weather.js | 20（循環） | 1 | Soft snowfall ambience, muffled quiet wind, loop |
| `weather_sandstorm` | 天候：沙塵（sand／dust，**目前沒有**）**循環** | 沒有聲音 | world/weather.js | 20（循環） | 1 | Sandstorm ambience, abrasive wind with sand grains hissing, loop |
| `weather_ash` | 天候：火山灰（**目前沒有**）**循環** | 沒有聲音 | world/weather.js | 20（循環） | 1 | Falling volcanic ash, low muffled wind and soft crackle, loop |
| `weather_coral` | 天候：發光的深脈粒子（coral，**目前沒有**）**循環** | 沒有聲音 | world/weather.js | 20（循環） | 1 | Eerie glowing spores drifting, faint shimmering anime sci-fi tinkles, loop |
| `water_wade_loop` | 機體涉水移動（**目前只有腳步**）**循環**，依速度 | 沒有聲音 | fx/water/、game/water.js（`waterTick`） | 3（循環） | 1 | Giant mech wading through water, heavy sloshing and wake, loop |
| `water_enter` | 從空中落進水裡、高速衝進水面（**目前沒有**） | 沒有聲音 | game/water.js | 1.5 | 2 | Huge object crashing into water, big splash and churning |
| `water_explosion` | 爆炸在水面上／水裡（**目前和陸上一樣**） | `explode` | game/water.js（推水） | 2 | 2 | Explosion on water surface, deep boom with massive water geyser splash |
| `water_bullet_cross` | 子彈穿過水面（`waterCross`，**目前沒有**；打到水面才有 `hitw_water`） | 沒有聲音 | game/water.js | 0.3 | 3 | Bullet piercing water surface, quick plunk |
| `lava_bubble_loop` | 熔岩的冒泡與流動（3D 位置，**目前沒有**）**循環** | 沒有聲音 | game/lava.js | 8（循環） | 1 | Molten lava bubbling and popping, thick viscous gurgle loop |
| `lava_burn` | 機體站在熔岩裡受傷（**目前只有第一次的 alarm**）**循環** | `alarm`（一次） | game/lava.js:30 | 2（循環） | 1 | Metal sizzling and burning in lava, hissing steam loop |
| `prop_stage_break` | 地圖物件的受損階段（零件分批脫落、變矮，**目前沒有**） | 沒有聲音 | game/destruct.js:244（`propTier`） | 1 | 3 | Structure partially breaking, chunks cracking off and falling |
| `prop_break_fire` | 可燃物件被打壞（燃料、車輛：爆） | `explode` | fx/effects.js:2923 | — | — | 用 `exp_*` |
| `prop_break_arc` | 電器物件被打壞（電弧） | `explode` 小 | fx/effects.js:2929 | 1.2 | 2 | Electrical equipment destroyed, sparking short-circuit burst |
| `prop_break_coral` | 深脈結晶被打壞 | `explode` 小 | fx/effects.js:2934 | 1.2 | 2 | Glowing crystal shattering, anime sci-fi resonant crack and chime |
| `prop_break_rubble` | 混凝土、岩石、冰、金屬的崩落（粉塵） | `wreck` | fx/effects.js:2947 | 2 | 3 | Concrete structure crumbling apart, cascading rubble and dust |
| `prop_break_metal` | 金屬物件崩落（目前同上） | `wreck` | fx/effects.js:2947 | 2 | 2 | Steel structure buckling and collapsing, screeching metal |
| `prop_break_ice` | 冰的崩落（目前同上） | `wreck` | fx/effects.js:2947 | 1.5 | 2 | Ice block shattering into pieces, glassy crunch |
| `prop_crush` | 機體踩平雜物（高 5 m 以下，**目前沒有**） | 沒有聲音 | game/destruct.js:1462（`propCrushTick`） | 0.8 | 3 | Giant mech foot crushing a small object, crunching metal and plastic |
| `prop_fire_loop` | 可燃物件燃燒中（3D，**目前沒有**）**循環** | 沒有聲音 | game/destruct.js:483（`propEmit`） | 6（循環） | 1 | Burning wreckage, crackling fire with occasional pops, loop |
| `prop_spark_loop` | 損壞的電器冒電弧（**目前沒有**）**循環** | 沒有聲音 | game/destruct.js:483 | 3（循環） | 1 | Damaged electrical equipment sparking intermittently, buzzing arc loop |
| `pillar_collapse` | 承重柱倒下、平台與橋倒塌 | `explode` 大＋`wreck` | game/destruct.js:750-751、581 | 4 | 2 | Massive pillar toppling over, deep groaning collapse and earth-shaking crash |
| `structure_sink` | 大型結構沉下去 | `explode` 大＋`wreck` | game/destruct.js:817-818 | 5 | 1 | Huge structure sinking and crumbling, long grinding rumble |
| `bridge_drop` | 橋面、甲板掉下 | `explode` 大＋`wreck` | game/destruct.js:1056-1057 | 4 | 2 | Bridge deck breaking and falling, steel snapping and massive crash |
| `segment_down` | 巨型結構被局部打穿 | `explode` 大＋`wreck` | game/destruct.js:1316-1317 | 3 | 2 | Section of a megastructure blown apart, metal tearing and debris rain |
| `roof_break` | 岩頂崩落 | `explode` 大＋`wreck` | game/destruct.js:1411-1412 | 4 | 2 | Cave ceiling collapsing, rocks crashing down in a thunderous roar |
| `creak_warning` | 結構快倒前的吱嘎（**目前沒有**） | 沒有聲音 | game/destruct.js:555 | 2 | 2 | Overstressed steel structure creaking and groaning before collapse |
| `mveh_car_loop` | 地圖載具：小車引擎（轎車、皮卡、吉普、警車、救護車、轉播車、雪地車…，**目前沒有**）**循環**，3D | 沒有聲音 | world/map-veh.js | 3（循環） | 1 | Civilian car engine driving by, gentle motor hum loop |
| `mveh_truck_loop` | 卡車、巴士、聯結車、攪拌車、油罐車、礦用卡車 **循環** | 沒有聲音 | world/map-veh.js | 3（循環） | 1 | Heavy diesel truck engine rumbling, loop |
| `mveh_heavy_loop` | 推土機、堆高機、運兵車、熔岩運輸車（履帶、工程機械）**循環** | 沒有聲音 | world/map-veh.js | 3（循環） | 1 | Construction machinery engine with clanking tracks, loop |
| `mveh_boat_loop` | 巡邏小艇、登陸艇、貨輪 **循環** | 沒有聲音 | world/map-veh.js | 4（循環） | 1 | Boat engine chugging with water wake splashing, loop |
| `mveh_hover_loop` | 氣墊船 **循環** | 沒有聲音 | world/map-veh.js | 3（循環） | 1 | Hovercraft fan roar with spray, loop |
| `mveh_shuttle_loop` | 穿梭機、太空作業艇的推進器 **循環** | 沒有聲音 | world/map-veh.js | 3（循環） | 1 | Small spacecraft maneuvering thrusters hissing, anime sci-fi loop |
| `mveh_heli_takeoff` | 停機坪的載具起飛 | `~jetTailL` | world/map-veh.js:626 | 3 | 1 | VTOL aircraft lifting off a pad, rising turbine roar |
| `mveh_horn` | 受驚的喇叭（小車音高較高、大車較低） | `~horn` | world/map-veh.js:724 | 0.6 | 3 | Car horn honking in panic, short repeated beeps |
| `mveh_siren` | 消防車、警車的警笛（資料有 `siren: true`，**沒有聲音**）**循環** | 沒有聲音 | data/map-veh.js:31-32 | 4（循環） | 1 | Emergency vehicle siren wailing, loop |
| `mveh_skid` | 逃跑時急轉、急煞（**目前沒有**） | 沒有聲音 | world/map-veh.js（`fleeTo`） | 1 | 2 | Tires screeching as a car swerves away |
| `mveh_crush` | 被機體踩扁 | `crunch1-3` | world/map-veh.js:839 | 1 | 3 | Giant robot foot crushing a car, metal crumpling and glass shattering |
| `mveh_explode` | 被打壞爆炸（油罐車與大型的大爆） | `explode` | world/map-veh.js:849 | — | — | 用 `exp_small`／`exp_big` |
| `crowd_murmur_loop` | 地圖上的小人：平民、工人圍著物件做事（**小人完全沒有聲音**）**循環**，3D | 沒有聲音 | game/crowd.js:915（`crowdTick`） | 10（循環） | 2 | Distant small crowd of workers chatting and moving, muffled murmur loop |
| `crowd_scream` | 小人受驚尖叫逃跑 | 沒有聲音 | game/crowd.js:356（`crowdScareOne`）、379 | 1.5 | 4 | Distant panicked human screams, people fleeing |
| `crowd_run_loop` | 一群人奔跑的腳步 **循環** | 沒有聲音 | game/crowd.js:379 | 3（循環） | 1 | Crowd of people running away on pavement, hurried footsteps loop |
| `crowd_stomp` | 小人被機體踩死 | 沒有聲音 | game/crowd.js:807（`crowdKill`） | 0.6 | 3 | Wet squelching crunch under a giant metal foot, short and gruesome |
| `crowd_blast` | 小人被炸死 | 沒有聲音 | game/crowd.js:797（`crowdBlast`） | 0.5 | 3 | Short scream cut off by an explosion |
| `crowd_blood` | 血跡濺出 | 沒有聲音 | game/crowd.js:894（`crowdBlood`） | 0.4 | 3 | Liquid splatter on concrete, wet splash |
| `crew_eject` | 乘員逃出（彈射座椅點火） | 沒有聲音 | game/crowd.js:440、502（`crowdCrew`） | 1.2 | 2 | Ejection seat firing, canopy pop and rocket burst |
| `chute_open` | 降落傘打開 | 沒有聲音 | game/crowd.js:440 之後 | 0.8 | 2 | Parachute snapping open, fabric whoosh |
| `chute_flutter_loop` | 降落傘下降中 **循環** | 沒有聲音 | game/crowd.js:789（`crowdChuteOff`） | 3（循環） | 1 | Parachute fabric fluttering in the wind, loop |
| `crowd_rifle` | 敵方步兵、敵對 AC 的駕駛員開槍（人用的步槍，小） | 沒有聲音（只有閃光） | game/crowd.js:547（`crowdShoot`） | 0.4 | 3 | Infantry assault rifle shot, small human-scale gun crack from a distance |
| `crowd_rocket` | 步兵的火箭筒發射 | 沒有聲音（只有閃光） | game/crowd.js:562（`crowdRocket`） | 1.0 | 2 | Shoulder-fired rocket launcher, whoosh and backblast |
| `crowd_rocket_hit` | 步兵的火箭彈爆炸 | 沒有聲音（只有特效） | game/crowd.js:596 | 1.0 | 2 | Small rocket warhead exploding against armor |
| `dev_interact_hold` | 互動鍵按住的進度（上砲台、控制台、回復站，**目前沒有**）**循環** | 沒有聲音 | game/devices.js:227（`devTick`） | 1（循環） | 1 | Interaction progress, rising soft electronic hum loop |
| `dev_recharge_loop` | 回復站回復中（**目前沒有**，說明還寫了「回復時的聲音會把敵人引過來」）**循環** | 沒有聲音 | game/devices.js:256（`devRechargeTick`） | 3（循環） | 1 | Repair station energizing a mech, soothing anime sci-fi recharge hum loop |
| `dev_recharge_empty` | 回復站總量用完（**目前沒有**） | 沒有聲音 | game/devices.js:256 | 0.8 | 1 | Recharge station depleted, power down whine |
| `trap_warn` | 環境陷阱的預警圈出現（波出發前，**目前沒有**） | 沒有聲音 | game/devices-traps.js:184（`devTrigger`）、391（`trapWaveVisStart`） | 1.5 | 2 | Hazard about to trigger, rising mechanical warning hum |
| `trap_weakpoint_hit` | 打中陷阱的弱點 | `hit`（一般命中） | game/devices-traps.js:174 | 0.4 | 2 | Bullet striking a fragile mechanism, metallic ping with crack |
| `trap_crane` | 陷阱：吊掛的貨櫃掉落（集散場） | `explode` | game/devices-traps.js:196、250 | 2 | 1 | Shipping container falling from a crane, cable snap and huge metal crash |
| `trap_mine` | 陷阱：坍方點（礦坑） | `explode` | 同上 | 3 | 1 | Mine tunnel cave-in, rock collapse rumble |
| `trap_ice` | 陷阱：冰面裂縫（冰原） | `explode` | 同上 | 2 | 1 | Ice sheet cracking and breaking apart, deep groaning crack |
| `trap_gas` | 陷阱：天然氣井點燃（荒野） | `explode` | 同上 | 2.5 | 1 | Gas well igniting, roaring fireball burst |
| `trap_cable` | 陷阱：斷掉的電纜（電擊） | `explode` | 同上 | 2 | 1 | Severed high voltage cable whipping and arcing, loud electric crackle |
| `trap_scrap` | 陷阱：吊掛的廢料掉落 | `explode` | 同上 | 2 | 1 | Pile of scrap metal crashing down, clattering junk |
| `trap_coral` | 陷阱：深脈收容槽破裂 | `explode` | 同上 | 2.5 | 1 | Containment tank rupturing, glass burst and eerie energy release, anime sci-fi |
| `trap_testrig` | 陷阱：垂直試車台噴火 | `explode` | 同上 | 3 | 1 | Rocket engine test stand firing, deafening jet blast |
| `trap_valve` | 陷阱：高壓海水閥 | `explode` | 同上 | 2.5 | 1 | High pressure water valve bursting, violent water jet blast |
| `trap_pulse` | 陷阱：脈衝發生器 | `explode` | 同上 | 2 | 1 | Energy pulse generator discharging, anime sci-fi shockwave boom |
| `trap_substation` | 陷阱：廢棄變電站爆炸 | `explode` | 同上 | 2.5 | 1 | Electrical substation exploding, huge arc flash and transformer boom |
| `trap_watertower` | 陷阱：壩頂蓄水塔倒水 | `explode` | 同上 | 3 | 1 | Water tower collapsing, massive water flood rushing |
| `trap_o2tank` | 陷阱：高壓氣瓶組爆炸 | `explode` | 同上 | 2 | 1 | Pressurized gas cylinders exploding in a chain, sharp bangs and hiss |
| `trap_slagpot` | 陷阱：熔渣釜傾倒 | `explode` | 同上 | 3 | 1 | Giant crucible tipping molten slag, heavy pour with fiery sizzle |
| `trap_ammorack` | 陷阱：甲板彈藥架殉爆 | `explode` | 同上 | 3 | 1 | Ammunition rack cooking off, chain of popping explosions |
| `trap_wave` | 陷阱的波擴散（圓形的衝擊波走過地面） | `explode`（每圈） | game/devices-traps.js:349（`trapWaveTick`） | 1.5 | 2 | Expanding ground shockwave rushing outward, low whooshing rumble |
| `trap_zone_loop` | 陷阱之後的持續區域（電、火、水、煙）**循環** | 沒有聲音 | game/devices-traps.js:457（`trapZoneTick`） | 4（循環） | 1 | Lingering hazard zone, crackling and hissing loop |
| `event_*`（13 個大型地形事件） | 龍門吊、場地重組、坑道、冰崖雪崩、大煙囪、抽沙機、抽水站、主壩洩洪、火箭發射架、吊橋、防波閘、對接艙、防爆門——觸發時**只有共用的爆炸** | `explode` | game/devices-traps.js（`devTrigger`）；data/devices.js:364-655 | 3～5 | 各 1 | 例：`event_avalanche` Avalanche of ice and snow crashing down a cliff；`event_spillway` Dam spillway gates opening, roaring torrent；`event_blastdoor` Massive blast door grinding open（每個事件一句，共 13 項） |
| `gun_mount` | 上固定砲台 | `uiClick` | game/devices-guns.js:177（`gunMount`） | 1 | 1 | Climbing into a turret seat, hatch clunk and systems online beep |
| `gun_dismount` | 離開砲台（**目前沒有**） | 沒有聲音 | game/devices-guns.js | 0.6 | 1 | Turret powering down, hatch release |
| `gun_turret_traverse` | 砲台轉動（**目前沒有**）**循環** | 沒有聲音 | game/devices-guns.js | 2（循環） | 1 | Heavy turret rotating, servo motor grinding loop |
| `gun_hmg_shot` | 重機砲台開火（用 `bullet` 配方） | `shot('bullet')` | game/devices-guns.js:312 | 0.15 | 3 | Emplaced heavy machine gun firing, booming automatic report |
| `gun_rail_shot` | 電磁砲台開火（用 `shell` 配方） | `shot('shell')` | 同上 | 1.5 | 2 | Railgun turret firing, electric charge snap and supersonic crack, anime sci-fi |
| `gun_msl_shot` | 導彈砲台開火 | `shot('missile')` | 同上 | 0.8 | 2 | Missile turret launch, rocket whoosh |
| `gun_flak_shot` | 防空砲台開火 | `shot('shell')` | 同上 | 0.8 | 2 | Flak cannon firing, heavy thump with airburst crack |
| `gun_overheat` | 砲台過熱（**目前沒有**） | 沒有聲音 | game/devices-guns.js（`OVERHEAT_T`） | 1.2 | 1 | Turret barrel overheating, steam hiss and warning buzz |
| `gun_destroy` | 砲台被打壞 | `explode` 大 | game/devices-guns.js:147 | — | — | 用 `exp_big` |
| `hw_pickup` | 撿起重武器 | `uiClick` | game/devices-guns.js:356 | 0.8 | 1 | Heavy weapon picked up and locked onto mech arm, mechanical clamp |
| `hw_cannon_shot` | 重武器：巨型加農砲 | `shot('shell')` | game/devices-guns.js:416 | 1.5 | 2 | Giant cannon firing, colossal boom |
| `hw_flame_loop` | 重武器：火焰放射器（**目前用 `shell`**）**循環** | `shot('shell')` | 同上 | 3（循環） | 1 | Flamethrower spraying fire, roaring whoosh loop |
| `hw_pod_shot` | 重武器：導彈莢艙 | `shot('missile')` | 同上 | 0.8 | 2 | Missile pod salvo launch |
| `hw_discard` | 重武器打完丟掉（**目前沒有**） | 沒有聲音 | game/devices-guns.js:1634（`hwTick`） | 0.8 | 1 | Empty heavy weapon detaching and thudding to the ground |
| `cache_open` | 據點的補給箱打開 | `doorOpen`＋`uiOk` | audio.js:1427；game/outposts.js:152 | 1.2 | 2 | Supply crate unlocking and lid swinging open, mechanical latch with reward chime |
| `cache_progress` | 站在箱子旁 1.2 秒的開箱進度（**目前沒有**）**循環** | 沒有聲音 | game/outposts.js | 1.2 | 1 | Lock hacking progress, rising digital beeps |
| `guard_alerted` | 據點守衛整隊出動（**目前沒有**） | 沒有聲音 | game/outposts.js（`guardIdle`） | 1 | 1 | Enemy guards alerted, sharp alarm blip |
| `extract_tick` | 自由出擊的撤離倒數（**目前沒有**） | 沒有聲音 | game/outposts.js（`extract`） | 0.2 | 1 | Extraction countdown tick |
| `pickup_repair` | 撿到修補包 | `uiOk`（自己）／`kit`（隊友） | game/map-extras.js:107、123 | 0.6 | 2 | Repair pack collected, bright healing chime |
| `pickup_ammo` | 撿到彈藥箱 | `uiOk` | game/map-extras.js:123 | 0.6 | 2 | Ammo box collected, metal clatter with confirming beep |
| `pickup_material` | 撿到素材（合金、電子零件、能量核心、傳說殘片） | `uiOk` | game/map-extras.js:123 | 0.5 | 2 | Crafting material collected, small sparkling pickup chime |
| `pickup_consumable` | 撿到空襲、友軍的消耗品 | `uiOk` | 同上 | 0.6 | 1 | Support item acquired, radio confirmation chirp |
| `gear_drop_beam` | 零件掉在地上（光柱，依品級；**目前沒有**）**循環**，3D | 沒有聲音 | game/gear-loot.js:196（`gearDropAt`） | 3（循環）＋落地 1 | 4（綠藍紫金） | Loot beam hum, magical glowing resonance loop, anime style |
| `wave_alarm` | 增援預告（依方向左右聲道） | `alarm` | audio.js:1404；game/waves.js:238、game/level-play.js:1249 | 1.5 | 2 | Incoming enemy reinforcements alert, two-tone military warning |
| `wave_alarm_last` | 最後一波（加 `boom1`） | `alarmBig`＋`boom1` | audio.js:1412、1420 | 2.5 | 1 | Final wave warning, urgent loud klaxon with heavy boom |
| `wave_dropin` | 增援空降、從邊緣進入（**目前沒有專屬**；落地有 `land`） | 沒有聲音 | game/waves.js（`waveSpawn`） | 2 | 2 | Enemy dropship releasing mechs, hatch clang and thruster roar |
| `zone_edge_warn` | 靠近作戰區域邊界、離開作戰區域（**目前沒有**）**循環** | 沒有聲音 | game/hud.js（`zoneEdgeHud`）、entities/mech-entity.js（`oobPush`） | 1（循環） | 1 | Out of bounds warning, repeating urgent electronic beep |
| `zone_expand` | 分段開放的作戰區域擴大（**目前沒有**） | 沒有聲音 | game/campaign.js:700（`expandZone`） | 1.5 | 1 | Area unlocked, opening gate rumble with confirming chime |
| `exit_open` | 主線：出口開啟（目前用一般 `ui()`；`cue('exit')` 定義了沒人用） | `uiClick` | game/campaign.js:709 | 1.2 | 1 | Extraction route opened, resonant anime sci-fi beacon chime |
| `exit_ring_loop` | 出口光環的持續聲（3D，**目前沒有**）**循環** | 沒有聲音 | game/campaign.js（`campRing`） | 4（循環） | 1 | Glowing waypoint beacon hum, soft pulsing anime sci-fi loop |
| `exit_enter` | 走進出口、離開這一段 | `uiClick` | game/campaign.js:1126（`campLeave`） | 1.5 | 1 | Leaving area, thruster lift-off whoosh with transition swell |
| `supply_pad_progress` | 補給台站著補給中（**目前沒有**）**循環** | 沒有聲音 | game/campaign.js:1020 | 1.5（循環） | 1 | Resupply in progress, mechanical loading hum loop |
| `supply_pad_done` | 補給台完成 | `kit` | game/campaign.js:1032 | 1.2 | 1 | Resupply complete, ammo loading clunks and chime |
| `intel_download_loop` | 資料終端下載中（站滿 4 秒，**目前沒有**）**循環** | 沒有聲音 | game/campaign.js:1041 | 2（循環） | 1 | Data downloading, rapid digital chatter loop, anime sci-fi |
| `intel_done` | 情報下載完成（**目前沒有**） | 沒有聲音 | game/campaign.js:1049 | 0.8 | 1 | Download complete, satisfying data confirm tone |
| `checkpoint_saved` | 紀錄點記下（**目前沒有**） | 沒有聲音 | game/campaign.js（`campLeave` 記紀錄點） | 0.8 | 1 | Checkpoint reached, soft save chime |
| `objective_alarm` | 防衛目標、護送車隊受到攻擊（**目前沒有**） | 沒有聲音 | entities/mech-objective.js | 1 | 1 | Protected asset under attack, urgent warning beep |
| `convoy_arrive` | 護送車隊抵達（**目前沒有**） | 沒有聲音 | entities/mech-objective.js | 1 | 1 | Convoy arrived safely, confirmation chime with engines idling |
| `convoy_engine_loop` | 護送車隊、運輸車輛的引擎（**目前沒有**）**循環** | 沒有聲音 | entities/mech-objective.js、world/map-extras.js | 3（循環） | 1 | Armored convoy trucks driving, heavy diesel rumble loop |
| `seg_transition` | 主線的轉場演出（空降、接力、升降梯下降，**目前沒有**） | 沒有聲音 | game/campaign.js（`camptrans` 畫面） | 4 | 3 | Mech transport transition, aircraft engine roar and descending elevator rumble |
| `sortie_complete` | 整個出擊完成（**目前沒有專屬**，結果畫面也沒有聲音） | 沒有聲音 | game/campaign.js（`campEnd`） | 2.5 | 1 | Mission accomplished fanfare, triumphant anime sci-fi jingle |
| `lv_text_cue` | 自訂關卡：觸發器的通訊文字 | `uiClick` | game/level-play.js:925 | — | — | 用 `radio_open` |
| `lv_countdown` | 自訂關卡：倒數（**目前沒有**） | 沒有聲音 | game/level-play.js | 0.2 | 1 | Countdown timer tick |
| `epilogue_open` | 結局畫面（**目前只有按鈕音**） | `uiClick` | game/hub.js:396 | 3 | 1 | Ending sequence begins, gentle emotional swell with soft chime |
| `hub_ambience` | 作戰室（玻璃指揮塔、窗外的格納庫）的氣氛音（**目前沒有**）**循環** | 沒有聲音 | game/hub-holo.js（`hubTick`） | 30（循環） | 1 | Command center ambience, low computer hum, distant hangar activity behind glass, soft radio chatter |
| `hub_holo_hover` | 作戰室：游標停在設施熱點、全像戰略桌的節點（**目前沒有**） | 沒有聲音 | game/hub-holo.js（`hubOutline`） | 0.15 | 2 | Hologram highlight, soft shimmering anime sci-fi blip |
| `hub_holo_select` | 點全像戰略桌的委託節點 | `uiClick` | game/hub-holo.js | 0.4 | 2 | Holographic map node selected, projection zoom hum |
| `title_ambience` | 標題畫面的氣氛（**目前沒有**；配樂另算）**循環** | 沒有聲音 | game/input.js（title） | 20（循環） | 1 | Quiet dark hangar ambience with a powered-down mech humming, loop |

---

## 8. 彙總

### 8-A 項目數（不含 `→` 開頭的對照列，也不含標註「空戰組／敵人組／機獸組負責」的列）

| 節 | 項目數 |
|---|---|
| 1. 通用戰鬥方法 | 30 |
| 2. 武器（槍聲 40 項，不含空戰的機砲 2 項；超低頻 4 項） | 44 |
| 3. 自機 | 118 |
| 4. 介面 | 57 |
| 5. 格納庫 | 19 |
| 6. 過場動畫（6-C，不含併入爆炸的 1 項） | 21 |
| 7. 地圖（大型地形事件 13 個算 13 項；不含 5 列「用 xxx」的對照與空域 1 項） | 148 |
| **合計** | **437 項** |

以變化數加權（同一個事件要產生的候選數），大約 870 個素材（不含擊破確認做成 10 段的情況）；每個素材照試做的做法產生 3 個候選再挑，總產生量約 2,600 次。

### 8-B 目前完全沒有聲音的事件

**自機與戰鬥**：格林／背部加特林的轉管、導彈飛行中、裝填完成、EN 回滿、懸浮開始、推進滑行的擦地、戰車腳的履帶與引擎（`mechStep` 跳過 tank，戰車移動完全沒有聲音）、地面的導彈鎖定累積與鎖滿、敵人導彈來襲的警報（只有空域有）、自動鎖定到新目標、切換視角、風格評價的升降級、零件紫金詞條與傳說模組的觸發、脈衝盾擋下傷害、自機被擊破的專屬聲音。

**介面**：逐字顯示、文字演出的橫幅、通訊結束、分頁切換、面板開啟、倉庫滿了、駕駛員升級、按住投點的進度、結果畫面出現與評價蓋章與跳數字、任務失敗、存檔完成、標題的開始、教學一課完成（只有一般點擊）、關卡編輯器（**整個編輯器沒有任何聲音**）、眼動追蹤校準點、多人與出口投票的倒數；拿到零件不分品級（金色和綠色同一個 `uiOk`）。

**格納庫**：地板升降口、無人機焊接、補給車的引擎、野戰帳篷的出擊、格納庫環境音、技師與工具。

**過場**：過場沒有環境音（進場景就停掉）、空降艙墜落的風切、運輸機／直升機飛過、難民營與礦工的人聲、2D 狀聲詞。

**地圖**：夜間的環境層、雷、降雪／沙塵／火山灰／深脈粒子的天候聲（只有雨有）、涉水的連續聲、落水、水上爆炸、子彈穿過水面、熔岩冒泡與燃燒、物件的受損階段、踩平雜物、燃燒與電弧的持續聲、結構倒塌前的吱嘎、**地圖載具的引擎、警笛、急煞**（只有喇叭、起飛、踩扁、爆炸）、**小人全部**（人聲、尖叫、奔跑、被踩死、炸死、血跡、乘員彈射、降落傘、步兵開槍、火箭筒）、互動鍵的進度、**回復站**（說明寫了「回復時的聲音會把敵人引過來」但沒有聲音）、陷阱的預警與持續區域、15 種陷阱與 13 個大型事件沒有各自的聲音（全部是共用的爆炸）、砲台的離開／轉動／過熱、重武器丟掉、火焰放射器（目前播砲彈的聲音）、開箱的進度、守衛出動、撤離倒數、零件掉落的光柱、增援的空降、**作戰區域邊界的警告**、作戰區域擴大、出口光環、補給台與資料終端的進度、情報下載完成、紀錄點、防衛目標受攻擊、護送車隊（抵達、引擎）、主線的轉場演出、出擊完成、自訂關卡的倒數、作戰室與標題的氣氛音、作戰室全像熱點的滑過。

### 8-C 定義了但沒人用的聲音（換新素材時可以順便接上或刪掉）

- `SFX.clash`（audio.js:1196）：刀刃互擊；彈刀目前播 `shield`（entities/mech-entity.js:1631）。
- `SFX.cue('exit')`（audio.js:1424）：出口開啟目前播一般的 `ui()`（game/campaign.js:709）。
- `SFX.ui('tog')`（audio.js:1386）：沒有人傳 tog。
- `SFX.servo('aim')`（audio.js:1270）：舉槍的伺服。
- 配方註解說格林的轉管在「spin 層」，`shot` 裡沒有實作（recipes.js:29）。
