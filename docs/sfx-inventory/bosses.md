# 自製音效清單：Boss、機獸、專屬 AC、宿敵、大型兵器、空戰、僚機

調查日期 2026-11-22（main 212805ec8）。只調查、沒有改程式。

## 讀法

- 「目前的聲音」：`SFX.play` 的鍵、`SFX` 的方法，或 `~` 開頭的合成音（`src/audio/synth.js`）；「沒有聲音」＝目前完全沒播。
- 「觸發處」是相對於 `src/` 的路徑:行號。
- 每隻 Boss 都有一組**共用事件**（登場、循環、大招蓄力／放出／打斷、失衡、破綻、裝甲殼、換型態、狂暴、最終型態宣告、部位破壞、身體部位破壞、打回去、閃避或防禦、擊破）：目前這些事件全部 Boss 共用同一個聲音，使用者要求每隻都有自己的，所以每隻各列一份。
- 招式的零件（`entities/mech-boss3.js`）目前的聲音：
  - 迫擊砲雨 b3Rain／直線砲擊 b3Line／燃燒地面 b3Pools：發射 SFX.shot('grenade')（game/support.js:165）＋落地 SFX.explode（entities/projectile.js:303）；預警圈無聲
  - 地面衝擊波 b3Shock／噴發 b3Erupt：預警無聲；擴散開始時 SFX.explode(true)（fx/effects.js:1817）
  - 能量環 b3Ring：SFX.play('laserBig', 0.8, 1.4)（game/bosses2.js:216）
  - 光束 b3Beam（十字 b3Cross、扇形 b3Fan、牢籠 b3Cage）：預警線無聲；發射 SFX.play('laserBig', 0.8, 0.9)（entities/mech-boss3.js:242）
  - 地雷 b3Mines：布雷 SFX.play('ui2', 0.5, 1.6)（game/support.js:323）、觸發 ui2（:421／:428）、爆炸 SFX.explode（:474）
  - 光柱 b3Pillars：預警圈與落雷無聲；爆炸 SFX.explode（game/support.js:355 blastTeam）
  - 武器連射 b3Volley：各武器的 SFX.shot（entities/mech-entity.js:883 實彈／:927 砲彈／:979 榴彈／:1074 導彈／:1264 雷射）
- 一般武器開火（MechEntity.fire）一律是 `SFX.shot(種類, 武器 id)`；表裡「主武器」那一列是建議給 Boss 專屬的槍聲（覆蓋一般武器的聲音）。
- 提示詞是草稿，統一風格：機甲尺度（機體約 10 m、機獸 15～30 m）、厚重寫實為主，能量武器偏動漫科幻。

## 一、Boss（28 隻，`data/enemies.js` 的 BOSS_DEFS 順序）

### MONOLITH 戰略級移動要塞（沒有 kind；一般大型 Boss 的 bossAI，鍵 MONOLITH）

| 建議的音效鍵 | 事件 | 目前的聲音 | 觸發處 | 長度（秒） | 變化數 | AI 提示詞草稿 |
|---|---|---|---|---|---|---|
| `boss_monolith_intro` | 登場（第一次出現在場上：WARNING 橫幅） | 沒有聲音（只有橫幅與 ECHO 的語音） | game/juice.js:546、:547 | 3.5 | 1 | A towering tracked mobile fortress powers up and announces itself, deep mechanical boot-up roar, heavy servo whine rising into a booming impact, sci-fi mecha scale |
| `boss_monolith_loop` | 履帶行進與引擎的循環 | 沒有聲音（只有推進時的 thrustLoop，game/feedback.js:243） | entities/mech-entity.js:4377（bossAI） | 6 | 1 | Seamless loop of a gigantic tracked war machine rolling, grinding steel treads, diesel-turbine roar, ground rumble |
| `boss_monolith_charge_start` | 大招開始蓄力（Boss 改版的打斷量表出現） | SFX.play('alarm', 0.45, 0.7) | entities/mech-boss-tier.js:451 | 2 | 2 | Tracked mobile fortress begins charging a super attack, rising electrical whine and deep reactor surge, ominous build-up |
| `boss_monolith_charge_loop` | 大招蓄力中（量表累積，循環） | 沒有聲音（只有 gather 特效） | entities/mech-boss-tier.js:395 | 4 | 1 | Seamless loop of a giant machine charging energy, pulsing hum with crackling arcs, tension building |
| `boss_monolith_big_release` | 大招放出（招式名稱的訊息） | SFX.play('alarm', 0.5, 0.9)＋招式各自的聲音 | entities/mech-boss-tier.js:417 | 1.5 | 2 | Tracked mobile fortress unleashes its ultimate attack, sharp release blast with a deep sub-bass whoomp, mecha anime style |
| `boss_monolith_interrupt` | 大招被打斷（長時間失衡） | SFX.stagger | entities/mech-boss-tier.js:511 | 2.5 | 2 | Overloaded tracked mobile fortress short-circuits and lurches, power-down whine, sparking crackle and heavy metal clank |
| `boss_monolith_stagger` | 失衡（BREAK） | SFX.stagger＋打出者的 SFX.breakFx／stinger | entities/mech-entity.js:1732、game/feedback.js:332、:336 | 1.8 | 3 | Tracked mobile fortress staggers off balance, groaning metal, hydraulic hiss and a heavy clunk |
| `boss_monolith_open` | 破綻（金色光環、傷害加倍） | SFX.play('bell', 0.6, 1.3) | entities/mech-boss-tier.js:328 | 1.2 | 1 | Exposed weak point on a tracked mobile fortress, armor plates unlatching with a hiss and a bright metallic ping |
| `boss_monolith_shell_on` | 裝甲殼長出（刁鑽度 5 起的型態閘門） | SFX.play('bell', 0.5, 0.7) | entities/mech-boss-tier.js:219 | 1.5 | 1 | Heavy armor shell clamps over a tracked mobile fortress, interlocking plates slamming shut with a resonant clang |
| `boss_monolith_shell_break` | 裝甲殼打開（部位破壞、打斷、破綻、時間到） | SFX.stagger | entities/mech-boss-tier.js:246 | 1.5 | 1 | Armor shell bursts open on a tracked mobile fortress, explosive bolts popping and plates crashing to the ground |
| `boss_monolith_phase` | 換型態（第二、第三型態：短暫無敵＋衝擊波） | SFX.cue('phase')＋衝擊波的 SFX.explode(true) | game/feedback.js:265、game/bosses.js:237（→ fx/effects.js:1817） | 3 | 2 | Tracked mobile fortress transforms into a more dangerous form, mechanical reconfiguration, power surge and a booming shockwave |
| `boss_monolith_enrage` | 狂暴化（開打 6 分鐘、雙機的一台倒下） | 沒有聲音 | game/bosses.js:194、:206 | 2.5 | 1 | Tracked mobile fortress goes berserk, reactor overdrive scream, red alert warble and violent engine roar |
| `boss_monolith_final_call` | 最終型態專屬招式「砲擊連段」的宣告（沒有刁鑽度時） | SFX.play('alarm', 0.5, 0.9) | entities/mech-boss3.js:104 | 1.5 | 1 | Short ominous warning call before a tracked mobile fortress's final special move, low siren with mechanical chatter |
| `boss_monolith_part_break` | Boss 改版的部位被打壞（肩上飛彈莢艙、主砲、履帶） | SFX.explode(true)＋SFX.wreck（部位本身被擊破；tierPartDown 沒有額外聲音） | entities/mech-entity.js:2722、:2723；game/boss-tier.js:252 | 2 | 3 | A mounted component on a tracked mobile fortress is blown off, sharp explosion, tearing metal and scattering debris |
| `boss_monolith_body_break` | 身體部位破壞（頭部、右臂、左臂、履帶；之後冒煙起火） | SFX.explode(false)（之後的冒煙與火無聲） | entities/mech-body.js:147、:266 | 2 | 3 | Armor section of a tracked mobile fortress shatters, crunchy metal rupture with a burst of flame and sparks |
| `boss_monolith_reflect` | 打回去（玩家打掉金色彈體、飛回去） | SFX.play('shield', 0.9, 1.4) | entities/mech-boss-tier.js:821 | 0.8 | 2 | Projectile deflected back toward a tracked mobile fortress, bright energy ricochet ping with a whoosh |
| `boss_monolith_guard_up` | 防禦反應（架起六角護盾） | 沒有聲音 | entities/mech-dodge.js:479 | 1 | 1 | A tracked mobile fortress raises a hexagonal energy barrier, electric hum swelling into a shield shimmer |
| `boss_monolith_guard_hit` | 防禦中被打中（護盾亮起） | 沒有聲音（只有一般的命中音） | entities/mech-dodge.js:757 | 0.5 | 3 | Bullets impacting a hexagonal energy shield, crisp energy deflection crackle |
| `boss_monolith_gatling` | 背部加特林（GT-70）掃射 | SFX.shot('bullet', 'bw_gat')＋SFX.casing | entities/mech-entity.js:883、:884 | 1.5 | 2 | Massive rotary cannon spinning up and firing a continuous heavy burst, deep mechanical roar with shell casings raining |
| `boss_monolith_rocket` | 火箭筒（BZ-31）砲擊 | SFX.shot（火箭筒的種類） | entities/mech-entity.js:927 | 1.5 | 2 | Huge bazooka launch from a mecha, thunderous backblast and whooshing rocket |
| `boss_monolith_missile` | MS-8 重導彈齊射（bossAI 的模式 1／2） | SFX.shot('missile') | entities/mech-entity.js:1074 | 2 | 2 | Salvo of heavy missiles launching from a shoulder pod, rapid thumps and hissing rocket trails |
| `boss_monolith_rush` | 突進衝撞（模式 3：突擊推進衝向目標） | SFX.ab（突擊推進）＋撞到時的一般命中音 | entities/mech-entity.js:3119、:4419 | 2 | 2 | Fortress-sized machine charging forward with roaring boosters, then a crushing steel collision |
| `boss_monolith_stomp` | 踏地衝擊波（aiShock） | 預警無聲；擴散開始時 SFX.explode(true)（fx/effects.js:1817） | entities/mech-entity.js:4321 | 2 | 2 | Colossal machine slams the ground, booming seismic thud and expanding dirt shockwave |
| `boss_monolith_final_barrage` | 最終型態「砲擊連段」（衝擊波＋迫擊砲雨） | 預警無聲；擴散開始時 SFX.explode(true)（fx/effects.js:1817）；發射 SFX.shot('grenade')（game/support.js:165）＋落地 SFX.explode（entities/projectile.js:303）；預警圈無聲 | entities/mech-boss3.js:45 | 3 | 2 | Rolling artillery barrage, multiple mortars thumping out and whistling down into explosions |
| `boss_monolith_death` | 擊破（大爆炸、殘骸） | SFX.explode('huge')＋SFX.wreck＋SFX.stinger(true)（配樂的重音） | entities/mech-entity.js:2722、:2723、:2762 | 5 | 2 | Colossal tracked mobile fortress destroyed, chain of internal explosions, collapsing steel and a long rumbling tail |

### DOPPEL 複製機甲（kind mirror）

| 建議的音效鍵 | 事件 | 目前的聲音 | 觸發處 | 長度（秒） | 變化數 | AI 提示詞草稿 |
|---|---|---|---|---|---|---|
| `boss_doppel_intro` | 登場（第一次出現在場上：WARNING 橫幅） | 沒有聲音（只有橫幅與 ECHO 的語音） | game/juice.js:546、:547 | 3.5 | 1 | A towering mirror-copy combat mech powers up and announces itself, deep mechanical boot-up roar, heavy servo whine rising into a booming impact, sci-fi mecha scale |
| `boss_doppel_loop` | 移動／待機的循環音 | 沒有聲音（一般 AC：腳步 SFX.step game/feedback.js:304、推進／懸浮時共用 thrustLoop（game/feedback.js:243）） | entities/mech-entity.js:3688（ikGait） | 6 | 1 | Seamless loop of an agile humanoid mech, servo whir, footfalls and booster idle with a glitchy digital undertone |
| `boss_doppel_charge_start` | 大招開始蓄力（Boss 改版的打斷量表出現） | SFX.play('alarm', 0.45, 0.7) | entities/mech-boss-tier.js:451 | 2 | 2 | Mirror-copy combat mech begins charging a super attack, rising electrical whine and deep reactor surge, ominous build-up |
| `boss_doppel_charge_loop` | 大招蓄力中（量表累積，循環） | 沒有聲音（只有 gather 特效） | entities/mech-boss-tier.js:395 | 4 | 1 | Seamless loop of a giant machine charging energy, pulsing hum with crackling arcs, tension building |
| `boss_doppel_big_release` | 大招放出（招式名稱的訊息） | SFX.play('alarm', 0.5, 0.9)＋招式各自的聲音 | entities/mech-boss-tier.js:417 | 1.5 | 2 | Mirror-copy combat mech unleashes its ultimate attack, sharp release blast with a deep sub-bass whoomp, mecha anime style |
| `boss_doppel_interrupt` | 大招被打斷（長時間失衡） | SFX.stagger | entities/mech-boss-tier.js:511 | 2.5 | 2 | Overloaded mirror-copy combat mech short-circuits and lurches, power-down whine, sparking crackle and heavy metal clank |
| `boss_doppel_stagger` | 失衡（BREAK） | SFX.stagger＋打出者的 SFX.breakFx／stinger | entities/mech-entity.js:1732、game/feedback.js:332、:336 | 1.8 | 3 | Mirror-copy combat mech staggers off balance, groaning metal, hydraulic hiss and a heavy clunk |
| `boss_doppel_open` | 破綻（金色光環、傷害加倍） | SFX.play('bell', 0.6, 1.3) | entities/mech-boss-tier.js:328 | 1.2 | 1 | Exposed weak point on a mirror-copy combat mech, armor plates unlatching with a hiss and a bright metallic ping |
| `boss_doppel_shell_on` | 裝甲殼長出（刁鑽度 5 起的型態閘門） | SFX.play('bell', 0.5, 0.7) | entities/mech-boss-tier.js:219 | 1.5 | 1 | Heavy armor shell clamps over a mirror-copy combat mech, interlocking plates slamming shut with a resonant clang |
| `boss_doppel_shell_break` | 裝甲殼打開（部位破壞、打斷、破綻、時間到） | SFX.stagger | entities/mech-boss-tier.js:246 | 1.5 | 1 | Armor shell bursts open on a mirror-copy combat mech, explosive bolts popping and plates crashing to the ground |
| `boss_doppel_phase` | 換型態（第二、第三型態：短暫無敵＋衝擊波） | SFX.cue('phase')＋衝擊波的 SFX.explode(true) | game/feedback.js:265、game/bosses.js:237（→ fx/effects.js:1817） | 3 | 2 | Mirror-copy combat mech transforms into a more dangerous form, mechanical reconfiguration, power surge and a booming shockwave |
| `boss_doppel_enrage` | 狂暴化（開打 6 分鐘、雙機的一台倒下） | 沒有聲音 | game/bosses.js:194、:206 | 2.5 | 1 | Mirror-copy combat mech goes berserk, reactor overdrive scream, red alert warble and violent engine roar |
| `boss_doppel_final_call` | 最終型態專屬招式「適應過載」的宣告（沒有刁鑽度時） | SFX.play('alarm', 0.5, 0.9) | entities/mech-boss3.js:104 | 1.5 | 1 | Short ominous warning call before a mirror-copy combat mech's final special move, low siren with mechanical chatter |
| `boss_doppel_part_break` | Boss 改版的部位被打壞（右手武器、左手武器、肩上武器） | SFX.explode(true)＋SFX.wreck（部位本身被擊破；tierPartDown 沒有額外聲音） | entities/mech-entity.js:2722、:2723；game/boss-tier.js:252 | 2 | 3 | A mounted component on a mirror-copy combat mech is blown off, sharp explosion, tearing metal and scattering debris |
| `boss_doppel_body_break` | 身體部位破壞（頭部、右臂、左臂、腿部；之後冒煙起火） | SFX.explode(false)（之後的冒煙與火無聲） | entities/mech-body.js:147、:266 | 2 | 3 | Armor section of a mirror-copy combat mech shatters, crunchy metal rupture with a burst of flame and sparks |
| `boss_doppel_reflect` | 打回去（玩家打掉金色彈體、飛回去） | SFX.play('shield', 0.9, 1.4) | entities/mech-boss-tier.js:821 | 0.8 | 2 | Projectile deflected back toward a mirror-copy combat mech, bright energy ricochet ping with a whoosh |
| `boss_doppel_dodge` | 閃避（QB 側閃／後撤／跳躍，機甲型連續閃避） | SFX.qb（一般的 QB 音；閃避本身沒有額外聲音） | entities/mech-entity.js:3083、entities/mech-dodge.js:299 | 0.8 | 3 | Quick evasive thruster burst of a mirror-copy mech, sharp jet blast with a mechanical whoosh |
| `boss_doppel_mimic` | 出擊時換成玩家的組裝（複製完成） | 沒有聲音 | game/bosses.js（spawnBossKind 的 mirror） | 2 | 1 | Digital scan and replication, glitchy data sweep resolving into a solid mechanical clunk |
| `boss_doppel_adapt` | 適應裝甲累積到一種武器（發光變色） | 沒有聲音（mirrorFx 只有外觀） | entities/mech-boss2.js:1609、:1905 | 1.5 | 3 | Adaptive armor recalibrating, shimmering energy hum shifting pitch with a soft lock click |
| `boss_doppel_resist_hit` | 被已適應的武器打中（抗性生效） | 沒有聲音（一般命中音） | entities/mech-boss2.js:1609 | 0.5 | 3 | Muted dull impact on reinforced adaptive armor, energy dampening thud |
| `boss_doppel_final` | 最終型態「適應過載」（武器連射＋地雷） | 各武器的 SFX.shot（entities/mech-entity.js:883 實彈／:927 砲彈／:979 榴彈／:1074 導彈／:1264 雷射）；布雷 SFX.play('ui2', 0.5, 1.6)（game/support.js:323）、觸發 ui2（:421／:428）、爆炸 SFX.explode（:474） | entities/mech-boss3.js:46 | 3 | 2 | Overloaded mech firing every weapon in a frantic burst, distorted copied gunfire with digital glitches |
| `boss_doppel_death` | 擊破（大爆炸、殘骸） | SFX.explode('huge')＋SFX.wreck＋SFX.stinger(true)（配樂的重音） | entities/mech-entity.js:2722、:2723、:2762 | 5 | 2 | Colossal mirror-copy combat mech destroyed, chain of internal explosions, collapsing steel and a long rumbling tail |

### AEGIS 護盾指揮艦（kind flagship）

| 建議的音效鍵 | 事件 | 目前的聲音 | 觸發處 | 長度（秒） | 變化數 | AI 提示詞草稿 |
|---|---|---|---|---|---|---|
| `boss_aegis_intro` | 登場（第一次出現在場上：WARNING 橫幅） | 沒有聲音（只有橫幅與 ECHO 的語音） | game/juice.js:546、:547 | 3.5 | 1 | A towering shield command flagship powers up and announces itself, deep mechanical boot-up roar, heavy servo whine rising into a booming impact, sci-fi mecha scale |
| `boss_aegis_loop` | 護盾罩住本體與附近友軍的循環 | 沒有聲音（推進／懸浮時共用 thrustLoop（game/feedback.js:243）） | entities/mech-boss.js:505（flagshipAI） | 6 | 1 | Seamless loop of a huge energy dome shield, deep resonant hum with slow pulsing shimmer |
| `boss_aegis_charge_start` | 大招開始蓄力（Boss 改版的打斷量表出現） | SFX.play('alarm', 0.45, 0.7) | entities/mech-boss-tier.js:451 | 2 | 2 | Shield command flagship begins charging a super attack, rising electrical whine and deep reactor surge, ominous build-up |
| `boss_aegis_charge_loop` | 大招蓄力中（量表累積，循環） | 沒有聲音（只有 gather 特效） | entities/mech-boss-tier.js:395 | 4 | 1 | Seamless loop of a giant machine charging energy, pulsing hum with crackling arcs, tension building |
| `boss_aegis_big_release` | 大招放出（招式名稱的訊息） | SFX.play('alarm', 0.5, 0.9)＋招式各自的聲音 | entities/mech-boss-tier.js:417 | 1.5 | 2 | Shield command flagship unleashes its ultimate attack, sharp release blast with a deep sub-bass whoomp, mecha anime style |
| `boss_aegis_interrupt` | 大招被打斷（長時間失衡） | SFX.stagger | entities/mech-boss-tier.js:511 | 2.5 | 2 | Overloaded shield command flagship short-circuits and lurches, power-down whine, sparking crackle and heavy metal clank |
| `boss_aegis_stagger` | 失衡（BREAK） | SFX.stagger＋打出者的 SFX.breakFx／stinger | entities/mech-entity.js:1732、game/feedback.js:332、:336 | 1.8 | 3 | Shield command flagship staggers off balance, groaning metal, hydraulic hiss and a heavy clunk |
| `boss_aegis_open` | 破綻（金色光環、傷害加倍） | SFX.play('bell', 0.6, 1.3) | entities/mech-boss-tier.js:328 | 1.2 | 1 | Exposed weak point on a shield command flagship, armor plates unlatching with a hiss and a bright metallic ping |
| `boss_aegis_shell_on` | 裝甲殼長出（刁鑽度 5 起的型態閘門） | SFX.play('bell', 0.5, 0.7) | entities/mech-boss-tier.js:219 | 1.5 | 1 | Heavy armor shell clamps over a shield command flagship, interlocking plates slamming shut with a resonant clang |
| `boss_aegis_shell_break` | 裝甲殼打開（部位破壞、打斷、破綻、時間到） | SFX.stagger | entities/mech-boss-tier.js:246 | 1.5 | 1 | Armor shell bursts open on a shield command flagship, explosive bolts popping and plates crashing to the ground |
| `boss_aegis_phase` | 換型態（第二、第三型態：短暫無敵＋衝擊波） | SFX.cue('phase')＋衝擊波的 SFX.explode(true) | game/feedback.js:265、game/bosses.js:237（→ fx/effects.js:1817） | 3 | 2 | Shield command flagship transforms into a more dangerous form, mechanical reconfiguration, power surge and a booming shockwave |
| `boss_aegis_enrage` | 狂暴化（開打 6 分鐘、雙機的一台倒下） | 沒有聲音 | game/bosses.js:194、:206 | 2.5 | 1 | Shield command flagship goes berserk, reactor overdrive scream, red alert warble and violent engine roar |
| `boss_aegis_final_call` | 最終型態專屬招式「艦砲齊射」的宣告（沒有刁鑽度時） | SFX.play('alarm', 0.5, 0.9) | entities/mech-boss3.js:104 | 1.5 | 1 | Short ominous warning call before a shield command flagship's final special move, low siren with mechanical chatter |
| `boss_aegis_part_break` | Boss 改版的部位被打壞（艦砲） | SFX.explode(true)＋SFX.wreck（部位本身被擊破；tierPartDown 沒有額外聲音） | entities/mech-entity.js:2722、:2723；game/boss-tier.js:252 | 2 | 3 | A mounted component on a shield command flagship is blown off, sharp explosion, tearing metal and scattering debris |
| `boss_aegis_body_break` | 身體部位破壞（頭部、右臂、左臂、腿部；之後冒煙起火） | SFX.explode(false)（之後的冒煙與火無聲） | entities/mech-body.js:147、:266 | 2 | 3 | Armor section of a shield command flagship shatters, crunchy metal rupture with a burst of flame and sparks |
| `boss_aegis_reflect` | 打回去（玩家打掉金色彈體、飛回去） | SFX.play('shield', 0.9, 1.4) | entities/mech-boss-tier.js:821 | 0.8 | 2 | Projectile deflected back toward a shield command flagship, bright energy ricochet ping with a whoosh |
| `boss_aegis_guard_up` | 防禦反應（架起六角護盾） | 沒有聲音 | entities/mech-dodge.js:479 | 1 | 1 | A shield command flagship raises a hexagonal energy barrier, electric hum swelling into a shield shimmer |
| `boss_aegis_guard_hit` | 防禦中被打中（護盾亮起） | 沒有聲音（只有一般的命中音） | entities/mech-dodge.js:757 | 0.5 | 3 | Bullets impacting a hexagonal energy shield, crisp energy deflection crackle |
| `boss_aegis_dome_hit` | 護盾吸收子彈 | SFX.hitDome | entities/mech-special.js:139 | 0.5 | 3 | Projectile absorbed by a huge energy dome, deep wobbling energy thud |
| `boss_aegis_dome_down` | 發生器全毀、護盾消失 | SFX.play('overload', 0.9, 1.2)（發生器本身被擊破另有爆炸） | entities/mech-special.js:155、entities/mech-boss.js:505 | 2.5 | 1 | Massive energy shield collapsing, descending electronic whine and shattering glass-like burst |
| `boss_aegis_pylon_rebuild` | 25 秒後重建發生器（破綻） | 沒有聲音 | entities/mech-boss.js:519（spawnPylons，game/bosses.js:118） | 2 | 1 | Shield pylons deploying from the ground, hydraulic thump and rising generator hum |
| `boss_aegis_dropship` | 呼叫運輸機、投放雜兵 | SFX.play('door', 0.9, 0.8)＋SFX.alert | game/support.js:445、:446 | 2.5 | 1 | Dropship hatch opening mid-air, heavy hydraulic door and engines roaring overhead |
| `boss_aegis_buff` | 強化附近友軍 | 沒有聲音 | entities/mech-boss.js:534 | 1.5 | 1 | Command uplink broadcast, rising digital chirp and power-up hum |
| `boss_aegis_cannon` | 主砲 LC-055 雷射砲與艦砲（b3Line） | 各武器的 SFX.shot（entities/mech-entity.js:883 實彈／:927 砲彈／:979 榴彈／:1074 導彈／:1264 雷射）；發射 SFX.shot('grenade')（game/support.js:165）＋落地 SFX.explode（entities/projectile.js:303）；預警圈無聲 | entities/mech-entity.js:1264、entities/mech-boss3.js:47 | 2 | 2 | Naval-grade laser cannon firing, heavy capacitor discharge with a long energy roar |
| `boss_aegis_death` | 擊破（大爆炸、殘骸） | SFX.explode('huge')＋SFX.wreck＋SFX.stinger(true)（配樂的重音） | entities/mech-entity.js:2722、:2723、:2762 | 5 | 2 | Colossal shield command flagship destroyed, chain of internal explosions, collapsing steel and a long rumbling tail |

### VIPER 高速突擊機（kind interceptor）

| 建議的音效鍵 | 事件 | 目前的聲音 | 觸發處 | 長度（秒） | 變化數 | AI 提示詞草稿 |
|---|---|---|---|---|---|---|
| `boss_viper_intro` | 登場（第一次出現在場上：WARNING 橫幅） | 沒有聲音（只有橫幅與 ECHO 的語音） | game/juice.js:546、:547 | 3.5 | 1 | A towering high-speed assault jet powers up and announces itself, deep mechanical boot-up roar, heavy servo whine rising into a booming impact, sci-fi mecha scale |
| `boss_viper_loop` | 盤旋的噴射引擎循環 | 沒有聲音（推進／懸浮時共用 thrustLoop（game/feedback.js:243）） | entities/mech-boss2.js:946（interceptorAI） | 6 | 1 | Seamless loop of a fighter jet circling overhead, roaring turbine with doppler swells |
| `boss_viper_charge_start` | 大招開始蓄力（Boss 改版的打斷量表出現） | SFX.play('alarm', 0.45, 0.7) | entities/mech-boss-tier.js:451 | 2 | 2 | High-speed assault jet begins charging a super attack, rising electrical whine and deep reactor surge, ominous build-up |
| `boss_viper_charge_loop` | 大招蓄力中（量表累積，循環） | 沒有聲音（只有 gather 特效） | entities/mech-boss-tier.js:395 | 4 | 1 | Seamless loop of a giant machine charging energy, pulsing hum with crackling arcs, tension building |
| `boss_viper_big_release` | 大招放出（招式名稱的訊息） | SFX.play('alarm', 0.5, 0.9)＋招式各自的聲音 | entities/mech-boss-tier.js:417 | 1.5 | 2 | High-speed assault jet unleashes its ultimate attack, sharp release blast with a deep sub-bass whoomp, mecha anime style |
| `boss_viper_interrupt` | 大招被打斷（長時間失衡） | SFX.stagger | entities/mech-boss-tier.js:511 | 2.5 | 2 | Overloaded high-speed assault jet short-circuits and lurches, power-down whine, sparking crackle and heavy metal clank |
| `boss_viper_stagger` | 失衡（BREAK） | SFX.stagger＋打出者的 SFX.breakFx／stinger | entities/mech-entity.js:1732、game/feedback.js:332、:336 | 1.8 | 3 | High-speed assault jet staggers off balance, groaning metal, hydraulic hiss and a heavy clunk |
| `boss_viper_open` | 破綻（金色光環、傷害加倍） | SFX.play('bell', 0.6, 1.3) | entities/mech-boss-tier.js:328 | 1.2 | 1 | Exposed weak point on a high-speed assault jet, armor plates unlatching with a hiss and a bright metallic ping |
| `boss_viper_shell_on` | 裝甲殼長出（刁鑽度 5 起的型態閘門） | SFX.play('bell', 0.5, 0.7) | entities/mech-boss-tier.js:219 | 1.5 | 1 | Heavy armor shell clamps over a high-speed assault jet, interlocking plates slamming shut with a resonant clang |
| `boss_viper_shell_break` | 裝甲殼打開（部位破壞、打斷、破綻、時間到） | SFX.stagger | entities/mech-boss-tier.js:246 | 1.5 | 1 | Armor shell bursts open on a high-speed assault jet, explosive bolts popping and plates crashing to the ground |
| `boss_viper_phase` | 換型態（第二、第三型態：短暫無敵＋衝擊波） | SFX.cue('phase')＋衝擊波的 SFX.explode(true) | game/feedback.js:265、game/bosses.js:237（→ fx/effects.js:1817） | 3 | 2 | High-speed assault jet transforms into a more dangerous form, mechanical reconfiguration, power surge and a booming shockwave |
| `boss_viper_enrage` | 狂暴化（開打 6 分鐘、雙機的一台倒下） | 沒有聲音 | game/bosses.js:194、:206 | 2.5 | 1 | High-speed assault jet goes berserk, reactor overdrive scream, red alert warble and violent engine roar |
| `boss_viper_final_call` | 最終型態專屬招式「空雷封鎖」的宣告（沒有刁鑽度時） | SFX.play('alarm', 0.5, 0.9) | entities/mech-boss3.js:104 | 1.5 | 1 | Short ominous warning call before a high-speed assault jet's final special move, low siren with mechanical chatter |
| `boss_viper_part_break` | Boss 改版的部位被打壞（左右機翼、機砲） | SFX.explode(true)＋SFX.wreck（部位本身被擊破；tierPartDown 沒有額外聲音） | entities/mech-entity.js:2722、:2723；game/boss-tier.js:252 | 2 | 3 | A mounted component on a high-speed assault jet is blown off, sharp explosion, tearing metal and scattering debris |
| `boss_viper_body_break` | 身體部位破壞（機鼻、尾噴口；之後冒煙起火） | SFX.explode(false)（之後的冒煙與火無聲） | entities/mech-body.js:147、:266 | 2 | 3 | Armor section of a high-speed assault jet shatters, crunchy metal rupture with a burst of flame and sparks |
| `boss_viper_reflect` | 打回去（玩家打掉金色彈體、飛回去） | SFX.play('shield', 0.9, 1.4) | entities/mech-boss-tier.js:821 | 0.8 | 2 | Projectile deflected back toward a high-speed assault jet, bright energy ricochet ping with a whoosh |
| `boss_viper_dodge` | 閃避（橫滾） | SFX.qb（一般的 QB 音） | entities/mech-entity.js:3083、data/dodge.js:101 | 1 | 2 | Fighter jet barrel roll, rapid thrust flare and wind whoosh |
| `boss_viper_flare` | 導彈反制：熱焰彈 | 沒有聲音 | entities/mech-dodge.js:534 | 1 | 1 | Flares popping out of an aircraft, quick pyrotechnic pops and hiss |
| `boss_viper_approach_warn` | 從場外進場的警示線（往側邊閃開） | SFX.play('missile', 1, 0.5)＋SFX.alert | entities/mech-boss2.js:994、:995 | 2 | 1 | Distant jet engine screaming toward you, rising doppler roar with a warning tone |
| `boss_viper_strafe` | 貼著航線的高速掃射 | SFX.shot('bullet')（機砲） | entities/mech-boss2.js:1018～1043、entities/mech-entity.js:883 | 2 | 2 | Low-altitude strafing run, rapid autocannon fire with a roaring jet passing |
| `boss_viper_sonic_boom` | 音爆 | SFX.explode(true) | entities/mech-boss2.js:1060 | 2 | 2 | Sharp sonic boom cracking overhead, double thunderclap with rushing air |
| `boss_viper_airmine` | 第二型態：沿路撒空中地雷 | 沒有聲音（layMine 用 quiet） | entities/mech-boss2.js:1067 | 1 | 1 | Small mines ejected from a speeding jet, rapid mechanical clicks and beeps |
| `boss_viper_turn` | 掉頭減速（低空、破綻） | 沒有聲音 | entities/mech-boss2.js:1075～1082 | 2 | 1 | Jet decelerating hard, engine spooling down with air brakes roaring |
| `boss_viper_stall` | 硬直時失速 | 沒有聲音（只有訊息） | entities/mech-boss2.js:977 | 2 | 1 | Jet engine stalling, sputtering turbine and coughing exhaust |
| `boss_viper_death` | 擊破（大爆炸、殘骸） | SFX.explode('huge')＋SFX.wreck＋SFX.stinger(true)（配樂的重音） | entities/mech-entity.js:2722、:2723、:2762 | 5 | 2 | Colossal high-speed assault jet destroyed, chain of internal explosions, collapsing steel and a long rumbling tail |

### TETRARCH 巡邏用超大型四足（沒有 kind；bossAI，鍵 TETRARCH）

| 建議的音效鍵 | 事件 | 目前的聲音 | 觸發處 | 長度（秒） | 變化數 | AI 提示詞草稿 |
|---|---|---|---|---|---|---|
| `boss_tetrarch_intro` | 登場（第一次出現在場上：WARNING 橫幅） | 沒有聲音（只有橫幅與 ECHO 的語音） | game/juice.js:546、:547 | 3.5 | 1 | A towering giant quadruped walker powers up and announces itself, deep mechanical boot-up roar, heavy servo whine rising into a booming impact, sci-fi mecha scale |
| `boss_tetrarch_loop` | 四足行走的腳步與液壓 | 沒有聲音（腳步 SFX.step game/feedback.js:304、推進／懸浮時共用 thrustLoop（game/feedback.js:243）） | entities/mech-entity.js:3688 | 6 | 1 | Seamless loop of a giant four-legged walker striding, heavy stomps, hydraulic pistons and creaking joints |
| `boss_tetrarch_charge_start` | 大招開始蓄力（Boss 改版的打斷量表出現） | SFX.play('alarm', 0.45, 0.7) | entities/mech-boss-tier.js:451 | 2 | 2 | Giant quadruped walker begins charging a super attack, rising electrical whine and deep reactor surge, ominous build-up |
| `boss_tetrarch_charge_loop` | 大招蓄力中（量表累積，循環） | 沒有聲音（只有 gather 特效） | entities/mech-boss-tier.js:395 | 4 | 1 | Seamless loop of a giant machine charging energy, pulsing hum with crackling arcs, tension building |
| `boss_tetrarch_big_release` | 大招放出（招式名稱的訊息） | SFX.play('alarm', 0.5, 0.9)＋招式各自的聲音 | entities/mech-boss-tier.js:417 | 1.5 | 2 | Giant quadruped walker unleashes its ultimate attack, sharp release blast with a deep sub-bass whoomp, mecha anime style |
| `boss_tetrarch_interrupt` | 大招被打斷（長時間失衡） | SFX.stagger | entities/mech-boss-tier.js:511 | 2.5 | 2 | Overloaded giant quadruped walker short-circuits and lurches, power-down whine, sparking crackle and heavy metal clank |
| `boss_tetrarch_stagger` | 失衡（BREAK） | SFX.stagger＋打出者的 SFX.breakFx／stinger | entities/mech-entity.js:1732、game/feedback.js:332、:336 | 1.8 | 3 | Giant quadruped walker staggers off balance, groaning metal, hydraulic hiss and a heavy clunk |
| `boss_tetrarch_open` | 破綻（金色光環、傷害加倍） | SFX.play('bell', 0.6, 1.3) | entities/mech-boss-tier.js:328 | 1.2 | 1 | Exposed weak point on a giant quadruped walker, armor plates unlatching with a hiss and a bright metallic ping |
| `boss_tetrarch_shell_on` | 裝甲殼長出（刁鑽度 5 起的型態閘門） | SFX.play('bell', 0.5, 0.7) | entities/mech-boss-tier.js:219 | 1.5 | 1 | Heavy armor shell clamps over a giant quadruped walker, interlocking plates slamming shut with a resonant clang |
| `boss_tetrarch_shell_break` | 裝甲殼打開（部位破壞、打斷、破綻、時間到） | SFX.stagger | entities/mech-boss-tier.js:246 | 1.5 | 1 | Armor shell bursts open on a giant quadruped walker, explosive bolts popping and plates crashing to the ground |
| `boss_tetrarch_phase` | 換型態（第二、第三型態：短暫無敵＋衝擊波） | SFX.cue('phase')＋衝擊波的 SFX.explode(true) | game/feedback.js:265、game/bosses.js:237（→ fx/effects.js:1817） | 3 | 2 | Giant quadruped walker transforms into a more dangerous form, mechanical reconfiguration, power surge and a booming shockwave |
| `boss_tetrarch_enrage` | 狂暴化（開打 6 分鐘、雙機的一台倒下） | 沒有聲音 | game/bosses.js:194、:206 | 2.5 | 1 | Giant quadruped walker goes berserk, reactor overdrive scream, red alert warble and violent engine roar |
| `boss_tetrarch_final_call` | 最終型態專屬招式「十字雷射」的宣告（沒有刁鑽度時） | SFX.play('alarm', 0.5, 0.9) | entities/mech-boss3.js:104 | 1.5 | 1 | Short ominous warning call before a giant quadruped walker's final special move, low siren with mechanical chatter |
| `boss_tetrarch_part_break` | Boss 改版的部位被打壞（背部雷射砲、左前腳、右前腳） | SFX.explode(true)＋SFX.wreck（部位本身被擊破；tierPartDown 沒有額外聲音） | entities/mech-entity.js:2722、:2723；game/boss-tier.js:252 | 2 | 3 | A mounted component on a giant quadruped walker is blown off, sharp explosion, tearing metal and scattering debris |
| `boss_tetrarch_body_break` | 身體部位破壞（頭部、右臂、左臂、腳部；之後冒煙起火） | SFX.explode(false)（之後的冒煙與火無聲） | entities/mech-body.js:147、:266 | 2 | 3 | Armor section of a giant quadruped walker shatters, crunchy metal rupture with a burst of flame and sparks |
| `boss_tetrarch_reflect` | 打回去（玩家打掉金色彈體、飛回去） | SFX.play('shield', 0.9, 1.4) | entities/mech-boss-tier.js:821 | 0.8 | 2 | Projectile deflected back toward a giant quadruped walker, bright energy ricochet ping with a whoosh |
| `boss_tetrarch_guard_up` | 防禦反應（架起六角護盾） | 沒有聲音 | entities/mech-dodge.js:479 | 1 | 1 | A giant quadruped walker raises a hexagonal energy barrier, electric hum swelling into a shield shimmer |
| `boss_tetrarch_guard_hit` | 防禦中被打中（護盾亮起） | 沒有聲音（只有一般的命中音） | entities/mech-dodge.js:757 | 0.5 | 3 | Bullets impacting a hexagonal energy shield, crisp energy deflection crackle |
| `boss_tetrarch_laser_charge` | 雷射：紅線預警後蓄力（第一型態） | 沒有聲音（預警線無聲） | entities/mech-entity.js:4467 | 1.5 | 1 | Large laser cannon charging up, rising high-pitched energy whine |
| `boss_tetrarch_laser_fire` | 雷射發射（蓄力彈） | SFX.shot('laserCharged') | entities/mech-entity.js:1264 | 1.5 | 2 | Heavy laser cannon discharge, crackling energy blast with a deep tail |
| `boss_tetrarch_sweep` | 第二型態：雷射橫掃 | SFX.shot('laser')（連射） | entities/mech-entity.js:4434、:1264 | 2.5 | 1 | Sustained sweeping laser beam, searing continuous energy hum with crackling |
| `boss_tetrarch_shotgun` | 霰彈槍 | SFX.shot('shotgun') | entities/mech-entity.js:903 | 1 | 2 | Huge mecha shotgun blast, punchy boom with metal pellets spray |
| `boss_tetrarch_grenade` | 肩上榴彈砲 GL-90 | SFX.shot('grenade') | entities/mech-entity.js:979 | 1.5 | 2 | Shoulder-mounted grenade cannon thump and whistling shell |
| `boss_tetrarch_kneel` | 兩隻前腳都壞了跪下（kit.onLost） | 沒有聲音 | data/boss-kit.js（TETRARCH 的 onLost） | 2.5 | 1 | Giant quadruped collapsing to its knees, groaning joints and a massive ground impact |
| `boss_tetrarch_death` | 擊破（大爆炸、殘骸） | SFX.explode('huge')＋SFX.wreck＋SFX.stinger(true)（配樂的重音） | entities/mech-entity.js:2722、:2723、:2762 | 5 | 2 | Colossal giant quadruped walker destroyed, chain of internal explosions, collapsing steel and a long rumbling tail |

### HALBERD 超長程電磁砲台（kind railgun）

| 建議的音效鍵 | 事件 | 目前的聲音 | 觸發處 | 長度（秒） | 變化數 | AI 提示詞草稿 |
|---|---|---|---|---|---|---|
| `boss_halberd_intro` | 登場（第一次出現在場上：WARNING 橫幅） | 沒有聲音（只有橫幅與 ECHO 的語音） | game/juice.js:546、:547 | 3.5 | 1 | A towering long-range railgun battery powers up and announces itself, deep mechanical boot-up roar, heavy servo whine rising into a booming impact, sci-fi mecha scale |
| `boss_halberd_loop` | 砲台待機與砲身轉動 | 沒有聲音（推進／懸浮時共用 thrustLoop（game/feedback.js:243）） | entities/mech-boss2.js:155（railgunAI） | 6 | 1 | Seamless loop of a giant railgun turret idling, electrical hum with slow heavy traverse motor |
| `boss_halberd_charge_start` | 大招開始蓄力（Boss 改版的打斷量表出現） | SFX.play('alarm', 0.45, 0.7) | entities/mech-boss-tier.js:451 | 2 | 2 | Long-range railgun battery begins charging a super attack, rising electrical whine and deep reactor surge, ominous build-up |
| `boss_halberd_charge_loop` | 大招蓄力中（量表累積，循環） | 沒有聲音（只有 gather 特效） | entities/mech-boss-tier.js:395 | 4 | 1 | Seamless loop of a giant machine charging energy, pulsing hum with crackling arcs, tension building |
| `boss_halberd_big_release` | 大招放出（招式名稱的訊息） | SFX.play('alarm', 0.5, 0.9)＋招式各自的聲音 | entities/mech-boss-tier.js:417 | 1.5 | 2 | Long-range railgun battery unleashes its ultimate attack, sharp release blast with a deep sub-bass whoomp, mecha anime style |
| `boss_halberd_interrupt` | 大招被打斷（長時間失衡） | SFX.stagger | entities/mech-boss-tier.js:511 | 2.5 | 2 | Overloaded long-range railgun battery short-circuits and lurches, power-down whine, sparking crackle and heavy metal clank |
| `boss_halberd_stagger` | 失衡（BREAK） | SFX.stagger＋打出者的 SFX.breakFx／stinger | entities/mech-entity.js:1732、game/feedback.js:332、:336 | 1.8 | 3 | Long-range railgun battery staggers off balance, groaning metal, hydraulic hiss and a heavy clunk |
| `boss_halberd_open` | 破綻（金色光環、傷害加倍） | SFX.play('bell', 0.6, 1.3) | entities/mech-boss-tier.js:328 | 1.2 | 1 | Exposed weak point on a long-range railgun battery, armor plates unlatching with a hiss and a bright metallic ping |
| `boss_halberd_shell_on` | 裝甲殼長出（刁鑽度 5 起的型態閘門） | SFX.play('bell', 0.5, 0.7) | entities/mech-boss-tier.js:219 | 1.5 | 1 | Heavy armor shell clamps over a long-range railgun battery, interlocking plates slamming shut with a resonant clang |
| `boss_halberd_shell_break` | 裝甲殼打開（部位破壞、打斷、破綻、時間到） | SFX.stagger | entities/mech-boss-tier.js:246 | 1.5 | 1 | Armor shell bursts open on a long-range railgun battery, explosive bolts popping and plates crashing to the ground |
| `boss_halberd_phase` | 換型態（第二、第三型態：短暫無敵＋衝擊波） | SFX.cue('phase')＋衝擊波的 SFX.explode(true) | game/feedback.js:265、game/bosses.js:237（→ fx/effects.js:1817） | 3 | 2 | Long-range railgun battery transforms into a more dangerous form, mechanical reconfiguration, power surge and a booming shockwave |
| `boss_halberd_enrage` | 狂暴化（開打 6 分鐘、雙機的一台倒下） | 沒有聲音 | game/bosses.js:194、:206 | 2.5 | 1 | Long-range railgun battery goes berserk, reactor overdrive scream, red alert warble and violent engine roar |
| `boss_halberd_final_call` | 最終型態專屬招式「散射砲」的宣告（沒有刁鑽度時） | SFX.play('alarm', 0.5, 0.9) | entities/mech-boss3.js:104 | 1.5 | 1 | Short ominous warning call before a long-range railgun battery's final special move, low siren with mechanical chatter |
| `boss_halberd_part_break` | Boss 改版的部位被打壞（電容器組、瞄準感測器、散熱片） | SFX.explode(true)＋SFX.wreck（部位本身被擊破；tierPartDown 沒有額外聲音） | entities/mech-entity.js:2722、:2723；game/boss-tier.js:252 | 2 | 3 | A mounted component on a long-range railgun battery is blown off, sharp explosion, tearing metal and scattering debris |
| `boss_halberd_body_break` | 身體部位破壞（砲管護套、基座；之後冒煙起火） | SFX.explode(false)（之後的冒煙與火無聲） | entities/mech-body.js:147、:266 | 2 | 3 | Armor section of a long-range railgun battery shatters, crunchy metal rupture with a burst of flame and sparks |
| `boss_halberd_reflect` | 打回去（玩家打掉金色彈體、飛回去） | SFX.play('shield', 0.9, 1.4) | entities/mech-boss-tier.js:821 | 0.8 | 2 | Projectile deflected back toward a long-range railgun battery, bright energy ricochet ping with a whoosh |
| `boss_halberd_guard_up` | 防禦反應（架起六角護盾） | 沒有聲音 | entities/mech-dodge.js:479 | 1 | 1 | A railgun battery raises a hexagonal energy barrier, electric hum swelling into a shield shimmer |
| `boss_halberd_guard_hit` | 防禦中被打中（護盾亮起） | 沒有聲音（只有一般的命中音） | entities/mech-dodge.js:757 | 0.5 | 3 | Bullets impacting a hexagonal energy shield, crisp energy deflection crackle |
| `boss_halberd_lock` | 瞄準線鎖定、開始充能 | SFX.play('charge', 1, 0.6)＋SFX.alert | entities/mech-boss2.js:182、:183 | 2 | 1 | Railgun target lock acquired, sharp beeps then a rising capacitor charge |
| `boss_halberd_charge_loop` | 充能中（聚集的光粒越來越多，循環） | 沒有聲音 | entities/mech-boss2.js:199 | 4 | 1 | Seamless loop of electromagnetic coils building charge, intensifying hum and arcing crackles |
| `boss_halberd_lost` | 射線被擋住、充能中斷 | 沒有聲音（只有訊息） | entities/mech-boss2.js:205 | 1.5 | 1 | Charge aborted, electrical power dropping off with a fizzle and clunk |
| `boss_halberd_fire` | 貫穿砲擊 | SFX.play('laserBig', 1, 0.5) | entities/mech-boss2.js:220 | 3 | 2 | Colossal railgun firing, supersonic crack with an earth-shaking boom and electric snap |
| `boss_halberd_vent` | 散熱片展開（弱點） | 沒有聲音（只有 SFX.alert） | entities/mech-boss2.js:233 | 2 | 1 | Cooling fins unfolding with a loud steam vent hiss and metallic clanks |
| `boss_halberd_death` | 擊破（大爆炸、殘骸） | SFX.explode('huge')＋SFX.wreck＋SFX.stinger(true)（配樂的重音） | entities/mech-entity.js:2722、:2723、:2762 | 5 | 2 | Colossal long-range railgun battery destroyed, chain of internal explosions, collapsing steel and a long rumbling tail |

### SANDWORM 巨型鑽地蟲（kind worm）

| 建議的音效鍵 | 事件 | 目前的聲音 | 觸發處 | 長度（秒） | 變化數 | AI 提示詞草稿 |
|---|---|---|---|---|---|---|
| `boss_sandworm_intro` | 登場（第一次出現在場上：WARNING 橫幅） | 沒有聲音（只有橫幅與 ECHO 的語音） | game/juice.js:546、:547 | 3.5 | 1 | A towering giant burrowing worm machine powers up and announces itself, deep mechanical boot-up roar, heavy servo whine rising into a booming impact, sci-fi mecha scale |
| `boss_sandworm_loop` | 地下鑽行的循環（地面揚塵） | 沒有聲音（推進／懸浮時共用 thrustLoop（game/feedback.js:243）） | entities/mech-boss.js:249（wormAI burrow） | 6 | 1 | Seamless loop of a giant drill machine tunneling underground, muffled grinding rumble and shifting earth |
| `boss_sandworm_charge_start` | 大招開始蓄力（Boss 改版的打斷量表出現） | SFX.play('alarm', 0.45, 0.7) | entities/mech-boss-tier.js:451 | 2 | 2 | Giant burrowing worm machine begins charging a super attack, rising electrical whine and deep reactor surge, ominous build-up |
| `boss_sandworm_charge_loop` | 大招蓄力中（量表累積，循環） | 沒有聲音（只有 gather 特效） | entities/mech-boss-tier.js:395 | 4 | 1 | Seamless loop of a giant machine charging energy, pulsing hum with crackling arcs, tension building |
| `boss_sandworm_big_release` | 大招放出（招式名稱的訊息） | SFX.play('alarm', 0.5, 0.9)＋招式各自的聲音 | entities/mech-boss-tier.js:417 | 1.5 | 2 | Giant burrowing worm machine unleashes its ultimate attack, sharp release blast with a deep sub-bass whoomp, mecha anime style |
| `boss_sandworm_interrupt` | 大招被打斷（長時間失衡） | SFX.stagger | entities/mech-boss-tier.js:511 | 2.5 | 2 | Overloaded giant burrowing worm machine short-circuits and lurches, power-down whine, sparking crackle and heavy metal clank |
| `boss_sandworm_stagger` | 失衡（BREAK） | SFX.stagger＋打出者的 SFX.breakFx／stinger | entities/mech-entity.js:1732、game/feedback.js:332、:336 | 1.8 | 3 | Giant burrowing worm machine staggers off balance, groaning metal, hydraulic hiss and a heavy clunk |
| `boss_sandworm_open` | 破綻（金色光環、傷害加倍） | SFX.play('bell', 0.6, 1.3) | entities/mech-boss-tier.js:328 | 1.2 | 1 | Exposed weak point on a giant burrowing worm machine, armor plates unlatching with a hiss and a bright metallic ping |
| `boss_sandworm_shell_on` | 裝甲殼長出（刁鑽度 5 起的型態閘門） | SFX.play('bell', 0.5, 0.7) | entities/mech-boss-tier.js:219 | 1.5 | 1 | Heavy armor shell clamps over a giant burrowing worm machine, interlocking plates slamming shut with a resonant clang |
| `boss_sandworm_shell_break` | 裝甲殼打開（部位破壞、打斷、破綻、時間到） | SFX.stagger | entities/mech-boss-tier.js:246 | 1.5 | 1 | Armor shell bursts open on a giant burrowing worm machine, explosive bolts popping and plates crashing to the ground |
| `boss_sandworm_phase` | 換型態（第二、第三型態：短暫無敵＋衝擊波） | SFX.cue('phase')＋衝擊波的 SFX.explode(true) | game/feedback.js:265、game/bosses.js:237（→ fx/effects.js:1817） | 3 | 2 | Giant burrowing worm machine transforms into a more dangerous form, mechanical reconfiguration, power surge and a booming shockwave |
| `boss_sandworm_enrage` | 狂暴化（開打 6 分鐘、雙機的一台倒下） | 沒有聲音 | game/bosses.js:194、:206 | 2.5 | 1 | Giant burrowing worm machine goes berserk, reactor overdrive scream, red alert warble and violent engine roar |
| `boss_sandworm_final_call` | 最終型態專屬招式「地表崩塌」的宣告（沒有刁鑽度時） | SFX.play('alarm', 0.5, 0.9) | entities/mech-boss3.js:104 | 1.5 | 1 | Short ominous warning call before a giant burrowing worm machine's final special move, low siren with mechanical chatter |
| `boss_sandworm_part_break` | Boss 改版的部位被打壞（頭部感測器、鑽頭顎、背部排氣孔） | SFX.explode(true)＋SFX.wreck（部位本身被擊破；tierPartDown 沒有額外聲音） | entities/mech-entity.js:2722、:2723；game/boss-tier.js:252 | 2 | 3 | A mounted component on a giant burrowing worm machine is blown off, sharp explosion, tearing metal and scattering debris |
| `boss_sandworm_body_break` | 身體部位破壞（前段體節、後段體節；之後冒煙起火） | SFX.explode(false)（之後的冒煙與火無聲） | entities/mech-body.js:147、:266 | 2 | 3 | Armor section of a giant burrowing worm machine shatters, crunchy metal rupture with a burst of flame and sparks |
| `boss_sandworm_reflect` | 打回去（玩家打掉金色彈體、飛回去） | SFX.play('shield', 0.9, 1.4) | entities/mech-boss-tier.js:821 | 0.8 | 2 | Projectile deflected back toward a giant burrowing worm machine, bright energy ricochet ping with a whoosh |
| `boss_sandworm_dive_early` | 閃避：提早下潛 | 沒有聲音（同下潛的衝擊波） | data/dodge.js:103、entities/mech-dodge.js:558 | 1.5 | 1 | Giant worm machine diving back into sand, rushing earth and grinding drill |
| `boss_sandworm_warn` | 鑽出前的預警圈（地面震動） | SFX.play('heavy', 0.9, 0.6) | entities/mech-boss.js:290 | 1.5 | 1 | Ground trembling before an eruption, deep rumble with cracking earth |
| `boss_sandworm_emerge` | 鑽出（範圍傷害＋外圍衝擊波） | 預警無聲；擴散開始時 SFX.explode(true)（fx/effects.js:1817）（fx.explosion 本身無聲） | entities/mech-boss.js:317 | 2.5 | 2 | Giant drill worm bursting out of the ground, explosive earth eruption and screeching drill |
| `boss_sandworm_hover` | 停在空中（弱點暴露） | 沒有聲音 | entities/mech-boss.js:336 | 3 | 1 | Massive segmented machine looming, whirring drill head and hissing exhaust vents |
| `boss_sandworm_dive` | 鑽回地下（衝擊波） | 預警無聲；擴散開始時 SFX.explode(true)（fx/effects.js:1817） | entities/mech-boss.js:362 | 2 | 2 | Giant worm machine plunging into the ground, heavy impact and churning sand |
| `boss_sandworm_sweep` | 第二型態：從玩家身邊掠過沿路噴發 | 預警無聲；擴散開始時 SFX.explode(true)（fx/effects.js:1817） | entities/mech-boss.js:264 | 2 | 2 | Series of small ground eruptions racing past, rapid thuds and sand bursts |
| `boss_sandworm_death` | 擊破（大爆炸、殘骸） | SFX.explode('huge')＋SFX.wreck＋SFX.stinger(true)（配樂的重音） | entities/mech-entity.js:2722、:2723、:2762 | 5 | 2 | Colossal giant burrowing worm machine destroyed, chain of internal explosions, collapsing steel and a long rumbling tail |

### SERAPHIM 浮游砲指揮機（kind funnel）

| 建議的音效鍵 | 事件 | 目前的聲音 | 觸發處 | 長度（秒） | 變化數 | AI 提示詞草稿 |
|---|---|---|---|---|---|---|
| `boss_seraphim_intro` | 登場（第一次出現在場上：WARNING 橫幅） | 沒有聲音（只有橫幅與 ECHO 的語音） | game/juice.js:546、:547 | 3.5 | 1 | A towering funnel-bit command mech powers up and announces itself, deep mechanical boot-up roar, heavy servo whine rising into a booming impact, sci-fi mecha scale |
| `boss_seraphim_loop` | 移動／待機的循環音 | 沒有聲音（一般 AC 的腳步與推進） | entities/mech-boss2.js:265（funnelAI） | 6 | 1 | Seamless loop of an elegant hovering mech with floating drones, soft anti-grav hum and faint chimes |
| `boss_seraphim_charge_start` | 大招開始蓄力（Boss 改版的打斷量表出現） | SFX.play('alarm', 0.45, 0.7) | entities/mech-boss-tier.js:451 | 2 | 2 | Funnel-bit command mech begins charging a super attack, rising electrical whine and deep reactor surge, ominous build-up |
| `boss_seraphim_charge_loop` | 大招蓄力中（量表累積，循環） | 沒有聲音（只有 gather 特效） | entities/mech-boss-tier.js:395 | 4 | 1 | Seamless loop of a giant machine charging energy, pulsing hum with crackling arcs, tension building |
| `boss_seraphim_big_release` | 大招放出（招式名稱的訊息） | SFX.play('alarm', 0.5, 0.9)＋招式各自的聲音 | entities/mech-boss-tier.js:417 | 1.5 | 2 | Funnel-bit command mech unleashes its ultimate attack, sharp release blast with a deep sub-bass whoomp, mecha anime style |
| `boss_seraphim_interrupt` | 大招被打斷（長時間失衡） | SFX.stagger | entities/mech-boss-tier.js:511 | 2.5 | 2 | Overloaded funnel-bit command mech short-circuits and lurches, power-down whine, sparking crackle and heavy metal clank |
| `boss_seraphim_stagger` | 失衡（BREAK） | SFX.stagger＋打出者的 SFX.breakFx／stinger | entities/mech-entity.js:1732、game/feedback.js:332、:336 | 1.8 | 3 | Funnel-bit command mech staggers off balance, groaning metal, hydraulic hiss and a heavy clunk |
| `boss_seraphim_open` | 破綻（金色光環、傷害加倍） | SFX.play('bell', 0.6, 1.3) | entities/mech-boss-tier.js:328 | 1.2 | 1 | Exposed weak point on a funnel-bit command mech, armor plates unlatching with a hiss and a bright metallic ping |
| `boss_seraphim_shell_on` | 裝甲殼長出（刁鑽度 5 起的型態閘門） | SFX.play('bell', 0.5, 0.7) | entities/mech-boss-tier.js:219 | 1.5 | 1 | Heavy armor shell clamps over a funnel-bit command mech, interlocking plates slamming shut with a resonant clang |
| `boss_seraphim_shell_break` | 裝甲殼打開（部位破壞、打斷、破綻、時間到） | SFX.stagger | entities/mech-boss-tier.js:246 | 1.5 | 1 | Armor shell bursts open on a funnel-bit command mech, explosive bolts popping and plates crashing to the ground |
| `boss_seraphim_phase` | 換型態（第二、第三型態：短暫無敵＋衝擊波） | SFX.cue('phase')＋衝擊波的 SFX.explode(true) | game/feedback.js:265、game/bosses.js:237（→ fx/effects.js:1817） | 3 | 2 | Funnel-bit command mech transforms into a more dangerous form, mechanical reconfiguration, power surge and a booming shockwave |
| `boss_seraphim_enrage` | 狂暴化（開打 6 分鐘、雙機的一台倒下） | 沒有聲音 | game/bosses.js:194、:206 | 2.5 | 1 | Funnel-bit command mech goes berserk, reactor overdrive scream, red alert warble and violent engine roar |
| `boss_seraphim_final_call` | 最終型態專屬招式「光束牢籠」的宣告（沒有刁鑽度時） | SFX.play('alarm', 0.5, 0.9) | entities/mech-boss3.js:104 | 1.5 | 1 | Short ominous warning call before a funnel-bit command mech's final special move, low siren with mechanical chatter |
| `boss_seraphim_part_break` | Boss 改版的部位被打壞（浮游砲艙） | SFX.explode(true)＋SFX.wreck（部位本身被擊破；tierPartDown 沒有額外聲音） | entities/mech-entity.js:2722、:2723；game/boss-tier.js:252 | 2 | 3 | A mounted component on a funnel-bit command mech is blown off, sharp explosion, tearing metal and scattering debris |
| `boss_seraphim_body_break` | 身體部位破壞（頭部、右臂、左臂、腿部；之後冒煙起火） | SFX.explode(false)（之後的冒煙與火無聲） | entities/mech-body.js:147、:266 | 2 | 3 | Armor section of a funnel-bit command mech shatters, crunchy metal rupture with a burst of flame and sparks |
| `boss_seraphim_reflect` | 打回去（玩家打掉金色彈體、飛回去） | SFX.play('shield', 0.9, 1.4) | entities/mech-boss-tier.js:821 | 0.8 | 2 | Projectile deflected back toward a funnel-bit command mech, bright energy ricochet ping with a whoosh |
| `boss_seraphim_dodge` | 閃避（QB 側閃／後撤／跳躍，機甲型連續閃避） | SFX.qb（一般的 QB 音；閃避本身沒有額外聲音） | entities/mech-entity.js:3083、entities/mech-dodge.js:299 | 0.8 | 3 | Quick evasive thruster burst of a funnel command mech, sharp jet blast with a mechanical whoosh |
| `boss_seraphim_deploy` | 浮游砲展開 | 沒有聲音（只有 SFX.alert） | entities/mech-boss2.js:283、:291 | 2 | 1 | Swarm of remote gun pods launching, multiple whooshing drones and electronic chirps |
| `boss_seraphim_bit_loop` | 浮游砲飛行（每顆的循環） | 沒有聲音 | entities/mech-boss2.js:1451（bitAI） | 3 | 1 | Seamless loop of a small hovering drone, high-pitched whir with a light energy hum |
| `boss_seraphim_bit_fire` | 浮游砲開火 | SFX.play('laser', 0.5, 1.3) | entities/mech-boss2.js:1499 | 0.6 | 3 | Small remote drone firing a quick laser shot, sharp sci-fi zap |
| `boss_seraphim_bit_down` | 浮游砲被 EMP 打落墜毀 | 沒有聲音（die 的一般爆炸） | entities/mech-boss2.js:1460 | 1 | 2 | Small drone sparking and crashing, fizzling electronics and a light metal clatter |
| `boss_seraphim_recall` | 回收充能（本體防禦下降） | 沒有聲音（只有訊息） | entities/mech-boss2.js:312 | 2 | 1 | Drones docking back into a mech, rapid magnetic clicks and recharge hum |
| `boss_seraphim_death` | 擊破（大爆炸、殘骸） | SFX.explode('huge')＋SFX.wreck＋SFX.stinger(true)（配樂的重音） | entities/mech-entity.js:2722、:2723、:2762 | 5 | 2 | Colossal funnel-bit command mech destroyed, chain of internal explosions, collapsing steel and a long rumbling tail |

### HELIOS 重武裝母艦直升機（kind heli）

| 建議的音效鍵 | 事件 | 目前的聲音 | 觸發處 | 長度（秒） | 變化數 | AI 提示詞草稿 |
|---|---|---|---|---|---|---|
| `boss_helios_intro` | 登場（第一次出現在場上：WARNING 橫幅） | 沒有聲音（只有橫幅與 ECHO 的語音） | game/juice.js:546、:547 | 3.5 | 1 | A towering heavy gunship helicopter powers up and announces itself, deep mechanical boot-up roar, heavy servo whine rising into a booming impact, sci-fi mecha scale |
| `boss_helios_loop` | 旋翼與引擎的循環 | 沒有聲音（推進／懸浮時共用 thrustLoop（game/feedback.js:243）） | entities/mech-entity.js:4329（heliBossAI） | 6 | 1 | Seamless loop of a huge heavy-lift gunship helicopter, thumping rotor blades and turbine whine |
| `boss_helios_charge_start` | 大招開始蓄力（Boss 改版的打斷量表出現） | SFX.play('alarm', 0.45, 0.7) | entities/mech-boss-tier.js:451 | 2 | 2 | Heavy gunship helicopter begins charging a super attack, rising electrical whine and deep reactor surge, ominous build-up |
| `boss_helios_charge_loop` | 大招蓄力中（量表累積，循環） | 沒有聲音（只有 gather 特效） | entities/mech-boss-tier.js:395 | 4 | 1 | Seamless loop of a giant machine charging energy, pulsing hum with crackling arcs, tension building |
| `boss_helios_big_release` | 大招放出（招式名稱的訊息） | SFX.play('alarm', 0.5, 0.9)＋招式各自的聲音 | entities/mech-boss-tier.js:417 | 1.5 | 2 | Heavy gunship helicopter unleashes its ultimate attack, sharp release blast with a deep sub-bass whoomp, mecha anime style |
| `boss_helios_interrupt` | 大招被打斷（長時間失衡） | SFX.stagger | entities/mech-boss-tier.js:511 | 2.5 | 2 | Overloaded heavy gunship helicopter short-circuits and lurches, power-down whine, sparking crackle and heavy metal clank |
| `boss_helios_stagger` | 失衡（BREAK） | SFX.stagger＋打出者的 SFX.breakFx／stinger | entities/mech-entity.js:1732、game/feedback.js:332、:336 | 1.8 | 3 | Heavy gunship helicopter staggers off balance, groaning metal, hydraulic hiss and a heavy clunk |
| `boss_helios_open` | 破綻（金色光環、傷害加倍） | SFX.play('bell', 0.6, 1.3) | entities/mech-boss-tier.js:328 | 1.2 | 1 | Exposed weak point on a heavy gunship helicopter, armor plates unlatching with a hiss and a bright metallic ping |
| `boss_helios_shell_on` | 裝甲殼長出（刁鑽度 5 起的型態閘門） | SFX.play('bell', 0.5, 0.7) | entities/mech-boss-tier.js:219 | 1.5 | 1 | Heavy armor shell clamps over a heavy gunship helicopter, interlocking plates slamming shut with a resonant clang |
| `boss_helios_shell_break` | 裝甲殼打開（部位破壞、打斷、破綻、時間到） | SFX.stagger | entities/mech-boss-tier.js:246 | 1.5 | 1 | Armor shell bursts open on a heavy gunship helicopter, explosive bolts popping and plates crashing to the ground |
| `boss_helios_phase` | 換型態（第二、第三型態：短暫無敵＋衝擊波） | SFX.cue('phase')＋衝擊波的 SFX.explode(true) | game/feedback.js:265、game/bosses.js:237（→ fx/effects.js:1817） | 3 | 2 | Heavy gunship helicopter transforms into a more dangerous form, mechanical reconfiguration, power surge and a booming shockwave |
| `boss_helios_enrage` | 狂暴化（開打 6 分鐘、雙機的一台倒下） | 沒有聲音 | game/bosses.js:194、:206 | 2.5 | 1 | Heavy gunship helicopter goes berserk, reactor overdrive scream, red alert warble and violent engine roar |
| `boss_helios_final_call` | 最終型態專屬招式「地毯轟炸」的宣告（沒有刁鑽度時） | SFX.play('alarm', 0.5, 0.9) | entities/mech-boss3.js:104 | 1.5 | 1 | Short ominous warning call before a heavy gunship helicopter's final special move, low siren with mechanical chatter |
| `boss_helios_part_break` | Boss 改版的部位被打壞（側邊機槍莢艙、主旋翼、炸彈艙） | SFX.explode(true)＋SFX.wreck（部位本身被擊破；tierPartDown 沒有額外聲音） | entities/mech-entity.js:2722、:2723；game/boss-tier.js:252 | 2 | 3 | A mounted component on a heavy gunship helicopter is blown off, sharp explosion, tearing metal and scattering debris |
| `boss_helios_body_break` | 身體部位破壞（座艙、尾桁；之後冒煙起火） | SFX.explode(false)（之後的冒煙與火無聲） | entities/mech-body.js:147、:266 | 2 | 3 | Armor section of a heavy gunship helicopter shatters, crunchy metal rupture with a burst of flame and sparks |
| `boss_helios_reflect` | 打回去（玩家打掉金色彈體、飛回去） | SFX.play('shield', 0.9, 1.4) | entities/mech-boss-tier.js:821 | 0.8 | 2 | Projectile deflected back toward a heavy gunship helicopter, bright energy ricochet ping with a whoosh |
| `boss_helios_dodge` | 閃避（傾斜／橫移） | SFX.qb | entities/mech-entity.js:3083、data/dodge.js:100 | 1 | 2 | Gunship banking hard, rotor wash surge and turbine strain |
| `boss_helios_engine_l` | 左引擎被打爆、高度下降 | 沒有聲音（fx.explosion 無聲） | entities/mech-entity.js:4335 | 2.5 | 1 | Helicopter engine exploding, sputtering turbine and rotor wobble |
| `boss_helios_engine_r` | 雙引擎失效、迫降 | 沒有聲音（fx.explosion 無聲） | entities/mech-entity.js:4342 | 3 | 1 | Gunship crash-landing, failing rotors, screeching metal and heavy ground impact |
| `boss_helios_overload` | 迫降後週期性的系統過載（硬直） | SFX.alert | entities/mech-entity.js:4355 | 1.5 | 1 | Damaged aircraft systems overloading, electrical sparking and alarm beeps |
| `boss_helios_gun` | 機槍掃射 | SFX.shot('bullet') | entities/mech-entity.js:4363、:883 | 1.5 | 2 | Door-mounted heavy machine gun firing in long bursts from a helicopter |
| `boss_helios_rockets` | MS-8 導彈／火箭齊射 | SFX.shot('missile') | entities/mech-entity.js:1074 | 2 | 2 | Rocket pods firing a rapid salvo from a gunship, whooshing rockets |
| `boss_helios_drop` | 大招「投放空降兵」 | 沒有聲音 | data/boss-kit.js:161（tierDrop，game/boss-tier.js:94） | 2 | 1 | Troops rappelling from a helicopter, cargo hatch opening and cables whirring |
| `boss_helios_death` | 擊破（大爆炸、殘骸） | SFX.explode('huge')＋SFX.wreck＋SFX.stinger(true)（配樂的重音） | entities/mech-entity.js:2722、:2723、:2762 | 5 | 2 | Colossal heavy gunship helicopter destroyed, chain of internal explosions, collapsing steel and a long rumbling tail |

### CINDER 熔爐清掃機（kind furnace）

| 建議的音效鍵 | 事件 | 目前的聲音 | 觸發處 | 長度（秒） | 變化數 | AI 提示詞草稿 |
|---|---|---|---|---|---|---|
| `boss_cinder_intro` | 登場（第一次出現在場上：WARNING 橫幅） | 沒有聲音（只有橫幅與 ECHO 的語音） | game/juice.js:546、:547 | 3.5 | 1 | A towering furnace cleaning machine powers up and announces itself, deep mechanical boot-up roar, heavy servo whine rising into a booming impact, sci-fi mecha scale |
| `boss_cinder_loop` | 熔爐燃燒與履帶的循環 | 沒有聲音（推進／懸浮時共用 thrustLoop（game/feedback.js:243）） | entities/mech-boss2.js:545（furnaceAI） | 6 | 1 | Seamless loop of a giant industrial furnace machine, roaring internal fire, bubbling molten metal and grinding treads |
| `boss_cinder_charge_start` | 大招開始蓄力（Boss 改版的打斷量表出現） | SFX.play('alarm', 0.45, 0.7) | entities/mech-boss-tier.js:451 | 2 | 2 | Furnace cleaning machine begins charging a super attack, rising electrical whine and deep reactor surge, ominous build-up |
| `boss_cinder_charge_loop` | 大招蓄力中（量表累積，循環） | 沒有聲音（只有 gather 特效） | entities/mech-boss-tier.js:395 | 4 | 1 | Seamless loop of a giant machine charging energy, pulsing hum with crackling arcs, tension building |
| `boss_cinder_big_release` | 大招放出（招式名稱的訊息） | SFX.play('alarm', 0.5, 0.9)＋招式各自的聲音 | entities/mech-boss-tier.js:417 | 1.5 | 2 | Furnace cleaning machine unleashes its ultimate attack, sharp release blast with a deep sub-bass whoomp, mecha anime style |
| `boss_cinder_interrupt` | 大招被打斷（長時間失衡） | SFX.stagger | entities/mech-boss-tier.js:511 | 2.5 | 2 | Overloaded furnace cleaning machine short-circuits and lurches, power-down whine, sparking crackle and heavy metal clank |
| `boss_cinder_stagger` | 失衡（BREAK） | SFX.stagger＋打出者的 SFX.breakFx／stinger | entities/mech-entity.js:1732、game/feedback.js:332、:336 | 1.8 | 3 | Furnace cleaning machine staggers off balance, groaning metal, hydraulic hiss and a heavy clunk |
| `boss_cinder_open` | 破綻（金色光環、傷害加倍） | SFX.play('bell', 0.6, 1.3) | entities/mech-boss-tier.js:328 | 1.2 | 1 | Exposed weak point on a furnace cleaning machine, armor plates unlatching with a hiss and a bright metallic ping |
| `boss_cinder_shell_on` | 裝甲殼長出（刁鑽度 5 起的型態閘門） | SFX.play('bell', 0.5, 0.7) | entities/mech-boss-tier.js:219 | 1.5 | 1 | Heavy armor shell clamps over a furnace cleaning machine, interlocking plates slamming shut with a resonant clang |
| `boss_cinder_shell_break` | 裝甲殼打開（部位破壞、打斷、破綻、時間到） | SFX.stagger | entities/mech-boss-tier.js:246 | 1.5 | 1 | Armor shell bursts open on a furnace cleaning machine, explosive bolts popping and plates crashing to the ground |
| `boss_cinder_phase` | 換型態（第二、第三型態：短暫無敵＋衝擊波） | SFX.cue('phase')＋衝擊波的 SFX.explode(true) | game/feedback.js:265、game/bosses.js:237（→ fx/effects.js:1817） | 3 | 2 | Furnace cleaning machine transforms into a more dangerous form, mechanical reconfiguration, power surge and a booming shockwave |
| `boss_cinder_enrage` | 狂暴化（開打 6 分鐘、雙機的一台倒下） | 沒有聲音 | game/bosses.js:194、:206 | 2.5 | 1 | Furnace cleaning machine goes berserk, reactor overdrive scream, red alert warble and violent engine roar |
| `boss_cinder_final_call` | 最終型態專屬招式「火海」的宣告（沒有刁鑽度時） | SFX.play('alarm', 0.5, 0.9) | entities/mech-boss3.js:104 | 1.5 | 1 | Short ominous warning call before a furnace cleaning machine's final special move, low siren with mechanical chatter |
| `boss_cinder_part_break` | Boss 改版的部位被打壞（熔渣砲、噴火口、爐門鉸鏈） | SFX.explode(true)＋SFX.wreck（部位本身被擊破；tierPartDown 沒有額外聲音） | entities/mech-entity.js:2722、:2723；game/boss-tier.js:252 | 2 | 3 | A mounted component on a furnace cleaning machine is blown off, sharp explosion, tearing metal and scattering debris |
| `boss_cinder_body_break` | 身體部位破壞（爐頂、左履帶裙、右履帶裙；之後冒煙起火） | SFX.explode(false)（之後的冒煙與火無聲） | entities/mech-body.js:147、:266 | 2 | 3 | Armor section of a furnace cleaning machine shatters, crunchy metal rupture with a burst of flame and sparks |
| `boss_cinder_reflect` | 打回去（玩家打掉金色彈體、飛回去） | SFX.play('shield', 0.9, 1.4) | entities/mech-boss-tier.js:821 | 0.8 | 2 | Projectile deflected back toward a furnace cleaning machine, bright energy ricochet ping with a whoosh |
| `boss_cinder_guard_up` | 防禦反應（架起六角護盾） | 沒有聲音 | entities/mech-dodge.js:479 | 1 | 1 | A furnace machine raises a hexagonal energy barrier, electric hum swelling into a shield shimmer |
| `boss_cinder_guard_hit` | 防禦中被打中（護盾亮起） | 沒有聲音（只有一般的命中音） | entities/mech-dodge.js:757 | 0.5 | 3 | Bullets impacting a hexagonal energy shield, crisp energy deflection crackle |
| `boss_cinder_mouth_open` | 熔爐口打開（弱點） | SFX.play('charge', 0.9, 0.5)＋SFX.alert | entities/mech-boss2.js:574、:577 | 2 | 1 | Heavy furnace door grinding open, blast of roaring fire and heat |
| `boss_cinder_slag` | 熔渣高拋（落地爆炸留下燃燒地面） | 發射 SFX.shot('grenade')（game/support.js:165）＋落地 SFX.explode（entities/projectile.js:303）；預警圈無聲 | entities/mech-boss2.js:601（game/bosses2.js:199 slagShot） | 2 | 2 | Molten slag lobbed from a cannon, wet sizzling launch and splattering molten impact |
| `boss_cinder_firewall` | 火牆（把場地分開） | 沒有聲音（預警路線與燃燒地面無聲） | entities/mech-boss2.js:625、:628 | 3 | 1 | Wall of fire igniting in a line, whooshing flames spreading with crackling |
| `boss_cinder_flame` | 近身火焰噴射 | 沒有聲音（flameCone 無聲） | entities/mech-boss2.js:630、:640 | 2.5 | 2 | Industrial flamethrower roaring, pressurized fire jet with hissing fuel |
| `boss_cinder_heatwave` | 對空熱浪（預警後往上噴） | 沒有聲音（只有 SFX.alert） | entities/mech-boss2.js:662～668 | 2 | 1 | Pillar of superheated air erupting upward, rushing roar of flame |
| `boss_cinder_death` | 擊破（大爆炸、殘骸） | SFX.explode('huge')＋SFX.wreck＋SFX.stinger(true)（配樂的重音） | entities/mech-entity.js:2722、:2723、:2762 | 5 | 2 | Colossal furnace cleaning machine destroyed, chain of internal explosions, collapsing steel and a long rumbling tail |

### BASTILLE 砲兵陣地（kind artillery）

| 建議的音效鍵 | 事件 | 目前的聲音 | 觸發處 | 長度（秒） | 變化數 | AI 提示詞草稿 |
|---|---|---|---|---|---|---|
| `boss_bastille_intro` | 登場（第一次出現在場上：WARNING 橫幅） | 沒有聲音（只有橫幅與 ECHO 的語音） | game/juice.js:546、:547 | 3.5 | 1 | A towering fortified artillery emplacement powers up and announces itself, deep mechanical boot-up roar, heavy servo whine rising into a booming impact, sci-fi mecha scale |
| `boss_bastille_loop` | 陣地的運轉（雷達旋轉、發電機） | 沒有聲音（推進／懸浮時共用 thrustLoop（game/feedback.js:243）） | entities/mech-boss.js:551（artilleryAI） | 6 | 1 | Seamless loop of a fortified artillery base, humming generators, rotating radar and distant clanks |
| `boss_bastille_charge_start` | 大招開始蓄力（Boss 改版的打斷量表出現） | SFX.play('alarm', 0.45, 0.7) | entities/mech-boss-tier.js:451 | 2 | 2 | Fortified artillery emplacement begins charging a super attack, rising electrical whine and deep reactor surge, ominous build-up |
| `boss_bastille_charge_loop` | 大招蓄力中（量表累積，循環） | 沒有聲音（只有 gather 特效） | entities/mech-boss-tier.js:395 | 4 | 1 | Seamless loop of a giant machine charging energy, pulsing hum with crackling arcs, tension building |
| `boss_bastille_big_release` | 大招放出（招式名稱的訊息） | SFX.play('alarm', 0.5, 0.9)＋招式各自的聲音 | entities/mech-boss-tier.js:417 | 1.5 | 2 | Fortified artillery emplacement unleashes its ultimate attack, sharp release blast with a deep sub-bass whoomp, mecha anime style |
| `boss_bastille_interrupt` | 大招被打斷（長時間失衡） | SFX.stagger | entities/mech-boss-tier.js:511 | 2.5 | 2 | Overloaded fortified artillery emplacement short-circuits and lurches, power-down whine, sparking crackle and heavy metal clank |
| `boss_bastille_stagger` | 失衡（BREAK） | SFX.stagger＋打出者的 SFX.breakFx／stinger | entities/mech-entity.js:1732、game/feedback.js:332、:336 | 1.8 | 3 | Fortified artillery emplacement staggers off balance, groaning metal, hydraulic hiss and a heavy clunk |
| `boss_bastille_open` | 破綻（金色光環、傷害加倍） | SFX.play('bell', 0.6, 1.3) | entities/mech-boss-tier.js:328 | 1.2 | 1 | Exposed weak point on a fortified artillery emplacement, armor plates unlatching with a hiss and a bright metallic ping |
| `boss_bastille_shell_on` | 裝甲殼長出（刁鑽度 5 起的型態閘門） | SFX.play('bell', 0.5, 0.7) | entities/mech-boss-tier.js:219 | 1.5 | 1 | Heavy armor shell clamps over a fortified artillery emplacement, interlocking plates slamming shut with a resonant clang |
| `boss_bastille_shell_break` | 裝甲殼打開（部位破壞、打斷、破綻、時間到） | SFX.stagger | entities/mech-boss-tier.js:246 | 1.5 | 1 | Armor shell bursts open on a fortified artillery emplacement, explosive bolts popping and plates crashing to the ground |
| `boss_bastille_phase` | 換型態（第二、第三型態：短暫無敵＋衝擊波） | SFX.cue('phase')＋衝擊波的 SFX.explode(true) | game/feedback.js:265、game/bosses.js:237（→ fx/effects.js:1817） | 3 | 2 | Fortified artillery emplacement transforms into a more dangerous form, mechanical reconfiguration, power surge and a booming shockwave |
| `boss_bastille_enrage` | 狂暴化（開打 6 分鐘、雙機的一台倒下） | 沒有聲音 | game/bosses.js:194、:206 | 2.5 | 1 | Fortified artillery emplacement goes berserk, reactor overdrive scream, red alert warble and violent engine roar |
| `boss_bastille_final_call` | 最終型態專屬招式「飽和砲擊」的宣告（沒有刁鑽度時） | SFX.play('alarm', 0.5, 0.9) | entities/mech-boss3.js:104 | 1.5 | 1 | Short ominous warning call before a fortified artillery emplacement's final special move, low siren with mechanical chatter |
| `boss_bastille_part_break` | Boss 改版的部位被打壞（雷達天線、布雷器） | SFX.explode(true)＋SFX.wreck（部位本身被擊破；tierPartDown 沒有額外聲音） | entities/mech-entity.js:2722、:2723；game/boss-tier.js:252 | 2 | 3 | A mounted component on a fortified artillery emplacement is blown off, sharp explosion, tearing metal and scattering debris |
| `boss_bastille_body_break` | 身體部位破壞（指揮塔、彈藥庫；之後冒煙起火） | SFX.explode(false)（之後的冒煙與火無聲） | entities/mech-body.js:147、:266 | 2 | 3 | Armor section of a fortified artillery emplacement shatters, crunchy metal rupture with a burst of flame and sparks |
| `boss_bastille_reflect` | 打回去（玩家打掉金色彈體、飛回去） | SFX.play('shield', 0.9, 1.4) | entities/mech-boss-tier.js:821 | 0.8 | 2 | Projectile deflected back toward a fortified artillery emplacement, bright energy ricochet ping with a whoosh |
| `boss_bastille_guard_up` | 防禦反應（架起六角護盾） | 沒有聲音 | entities/mech-dodge.js:479 | 1 | 1 | A artillery emplacement raises a hexagonal energy barrier, electric hum swelling into a shield shimmer |
| `boss_bastille_guard_hit` | 防禦中被打中（護盾亮起） | 沒有聲音（只有一般的命中音） | entities/mech-dodge.js:757 | 0.5 | 3 | Bullets impacting a hexagonal energy shield, crisp energy deflection crackle |
| `boss_bastille_cannon` | 砲台（部位）三發一組的砲擊 | 發射 SFX.shot('grenade')（game/support.js:165）＋落地 SFX.explode（entities/projectile.js:303）；預警圈無聲 | entities/mech-boss.js:184～204（partAI cannon） | 2 | 3 | Heavy artillery cannon firing a three-round salvo, deep booms and whistling shells |
| `boss_bastille_barrage` | 砲擊彈幕（8 發） | 發射 SFX.shot('grenade')（game/support.js:165）＋落地 SFX.explode（entities/projectile.js:303）；預警圈無聲；開始時 SFX.alert | entities/mech-boss.js:557～583 | 3 | 2 | Massive artillery barrage, rapid thunderous launches and incoming shell whistles |
| `boss_bastille_minelayer` | 補布雷無人機 | 沒有聲音 | entities/mech-boss.js:586 | 1.5 | 1 | Small drone launching from a bunker, mechanical catapult and buzzing rotor |
| `boss_bastille_unarmored` | 砲台全滅、指揮所裝甲解除 | 沒有聲音（只有訊息） | entities/mech-boss.js:556 | 2 | 1 | Bunker armor plating releasing, hydraulic hiss and heavy plates dropping |
| `boss_bastille_death` | 擊破（大爆炸、殘骸） | SFX.explode('huge')＋SFX.wreck＋SFX.stinger(true)（配樂的重音） | entities/mech-entity.js:2722、:2723、:2762 | 5 | 2 | Colossal fortified artillery emplacement destroyed, chain of internal explosions, collapsing steel and a long rumbling tail |

### BEHEMOTH 衝撞推土要塞（kind rampart）

| 建議的音效鍵 | 事件 | 目前的聲音 | 觸發處 | 長度（秒） | 變化數 | AI 提示詞草稿 |
|---|---|---|---|---|---|---|
| `boss_behemoth_intro` | 登場（第一次出現在場上：WARNING 橫幅） | 沒有聲音（只有橫幅與 ECHO 的語音） | game/juice.js:546、:547 | 3.5 | 1 | A towering ramming bulldozer fortress powers up and announces itself, deep mechanical boot-up roar, heavy servo whine rising into a booming impact, sci-fi mecha scale |
| `boss_behemoth_loop` | 兩側絞碎滾筒與履帶的循環 | 沒有聲音（推進／懸浮時共用 thrustLoop（game/feedback.js:243）） | entities/mech-boss2.js:1149 | 6 | 1 | Seamless loop of a colossal bulldozer with spinning grinder drums, roaring diesel and crushing gravel |
| `boss_behemoth_charge_start` | 大招開始蓄力（Boss 改版的打斷量表出現） | SFX.play('alarm', 0.45, 0.7) | entities/mech-boss-tier.js:451 | 2 | 2 | Ramming bulldozer fortress begins charging a super attack, rising electrical whine and deep reactor surge, ominous build-up |
| `boss_behemoth_charge_loop` | 大招蓄力中（量表累積，循環） | 沒有聲音（只有 gather 特效） | entities/mech-boss-tier.js:395 | 4 | 1 | Seamless loop of a giant machine charging energy, pulsing hum with crackling arcs, tension building |
| `boss_behemoth_big_release` | 大招放出（招式名稱的訊息） | SFX.play('alarm', 0.5, 0.9)＋招式各自的聲音 | entities/mech-boss-tier.js:417 | 1.5 | 2 | Ramming bulldozer fortress unleashes its ultimate attack, sharp release blast with a deep sub-bass whoomp, mecha anime style |
| `boss_behemoth_interrupt` | 大招被打斷（長時間失衡） | SFX.stagger | entities/mech-boss-tier.js:511 | 2.5 | 2 | Overloaded ramming bulldozer fortress short-circuits and lurches, power-down whine, sparking crackle and heavy metal clank |
| `boss_behemoth_stagger` | 失衡（BREAK） | SFX.stagger＋打出者的 SFX.breakFx／stinger | entities/mech-entity.js:1732、game/feedback.js:332、:336 | 1.8 | 3 | Ramming bulldozer fortress staggers off balance, groaning metal, hydraulic hiss and a heavy clunk |
| `boss_behemoth_open` | 破綻（金色光環、傷害加倍） | SFX.play('bell', 0.6, 1.3) | entities/mech-boss-tier.js:328 | 1.2 | 1 | Exposed weak point on a ramming bulldozer fortress, armor plates unlatching with a hiss and a bright metallic ping |
| `boss_behemoth_shell_on` | 裝甲殼長出（刁鑽度 5 起的型態閘門） | SFX.play('bell', 0.5, 0.7) | entities/mech-boss-tier.js:219 | 1.5 | 1 | Heavy armor shell clamps over a ramming bulldozer fortress, interlocking plates slamming shut with a resonant clang |
| `boss_behemoth_shell_break` | 裝甲殼打開（部位破壞、打斷、破綻、時間到） | SFX.stagger | entities/mech-boss-tier.js:246 | 1.5 | 1 | Armor shell bursts open on a ramming bulldozer fortress, explosive bolts popping and plates crashing to the ground |
| `boss_behemoth_phase` | 換型態（第二、第三型態：短暫無敵＋衝擊波） | SFX.cue('phase')＋衝擊波的 SFX.explode(true) | game/feedback.js:265、game/bosses.js:237（→ fx/effects.js:1817） | 3 | 2 | Ramming bulldozer fortress transforms into a more dangerous form, mechanical reconfiguration, power surge and a booming shockwave |
| `boss_behemoth_enrage` | 狂暴化（開打 6 分鐘、雙機的一台倒下） | 沒有聲音 | game/bosses.js:194、:206 | 2.5 | 1 | Ramming bulldozer fortress goes berserk, reactor overdrive scream, red alert warble and violent engine roar |
| `boss_behemoth_final_call` | 最終型態專屬招式「碎石雨」的宣告（沒有刁鑽度時） | SFX.play('alarm', 0.5, 0.9) | entities/mech-boss3.js:104 | 1.5 | 1 | Short ominous warning call before a ramming bulldozer fortress's final special move, low siren with mechanical chatter |
| `boss_behemoth_part_break` | Boss 改版的部位被打壞（推土鏟、側面砲塔、排氣管） | SFX.explode(true)＋SFX.wreck（部位本身被擊破；tierPartDown 沒有額外聲音） | entities/mech-entity.js:2722、:2723；game/boss-tier.js:252 | 2 | 3 | A mounted component on a ramming bulldozer fortress is blown off, sharp explosion, tearing metal and scattering debris |
| `boss_behemoth_body_break` | 身體部位破壞（左履帶護甲、右履帶護甲、背部引擎蓋；之後冒煙起火） | SFX.explode(false)（之後的冒煙與火無聲） | entities/mech-body.js:147、:266 | 2 | 3 | Armor section of a ramming bulldozer fortress shatters, crunchy metal rupture with a burst of flame and sparks |
| `boss_behemoth_reflect` | 打回去（玩家打掉金色彈體、飛回去） | SFX.play('shield', 0.9, 1.4) | entities/mech-boss-tier.js:821 | 0.8 | 2 | Projectile deflected back toward a ramming bulldozer fortress, bright energy ricochet ping with a whoosh |
| `boss_behemoth_guard_up` | 防禦反應（架起六角護盾） | 沒有聲音 | entities/mech-dodge.js:479 | 1 | 1 | A bulldozer fortress raises a hexagonal energy barrier, electric hum swelling into a shield shimmer |
| `boss_behemoth_guard_hit` | 防禦中被打中（護盾亮起） | 沒有聲音（只有一般的命中音） | entities/mech-dodge.js:757 | 0.5 | 3 | Bullets impacting a hexagonal energy shield, crisp energy deflection crackle |
| `boss_behemoth_aim` | 衝撞預警線 | SFX.play('heavy', 1, 0.6)＋SFX.alert | entities/mech-boss2.js:1287、:1288 | 1.5 | 1 | Giant engine revving up before a charge, deep diesel roar and tread clatter |
| `boss_behemoth_charge` | 直線衝撞（循環） | 沒有聲音 | entities/mech-boss2.js:1190～1210 | 3 | 1 | Seamless loop of a massive bulldozer charging at full speed, thunderous engine and crushing ground |
| `boss_behemoth_crash` | 撞上高台或邊界、硬直（背後散熱口打開） | 沒有聲音（fx 無聲，只有訊息） | entities/mech-boss2.js:1215～1226 | 2.5 | 2 | Bulldozer slamming into a concrete wall, enormous crash, crumbling debris and engine stall |
| `boss_behemoth_crush` | 撞碎地圖物件 | 物件的崩落聲（SFX.wreck／explode） | fx/effects.js:2923～2947 | 1.5 | 3 | Concrete and steel being crushed under a giant blade, crunching rubble |
| `boss_behemoth_slide` | 衝撞落空的滑停（破綻） | 沒有聲音 | entities/mech-boss2.js:1241 | 2 | 1 | Heavy treads skidding to a stop, screeching metal and scraping gravel |
| `boss_behemoth_death` | 擊破（大爆炸、殘骸） | SFX.explode('huge')＋SFX.wreck＋SFX.stinger(true)（配樂的重音） | entities/mech-entity.js:2722、:2723、:2762 | 5 | 2 | Colossal ramming bulldozer fortress destroyed, chain of internal explosions, collapsing steel and a long rumbling tail |

### KESTREL & BRANT 雙機小隊（kind duo）

| 建議的音效鍵 | 事件 | 目前的聲音 | 觸發處 | 長度（秒） | 變化數 | AI 提示詞草稿 |
|---|---|---|---|---|---|---|
| `boss_duo_intro` | 登場（第一次出現在場上：WARNING 橫幅） | 沒有聲音（只有橫幅與 ECHO 的語音） | game/juice.js:546、:547 | 3.5 | 1 | A towering twin ace mech squad powers up and announces itself, deep mechanical boot-up roar, heavy servo whine rising into a booming impact, sci-fi mecha scale |
| `boss_duo_loop` | 移動／待機的循環音 | 沒有聲音（一般 AC 的腳步與推進） | game/bosses2.js:19（兩台的定義） | 6 | 1 | Seamless loop of a massive twin ace mech squad idling and moving, low engine hum, heavy hydraulic creaks, distant metal stress |
| `boss_duo_charge_start` | 大招開始蓄力（Boss 改版的打斷量表出現） | SFX.play('alarm', 0.45, 0.7) | entities/mech-boss-tier.js:451 | 2 | 2 | Twin ace mech squad begins charging a super attack, rising electrical whine and deep reactor surge, ominous build-up |
| `boss_duo_charge_loop` | 大招蓄力中（量表累積，循環） | 沒有聲音（只有 gather 特效） | entities/mech-boss-tier.js:395 | 4 | 1 | Seamless loop of a giant machine charging energy, pulsing hum with crackling arcs, tension building |
| `boss_duo_big_release` | 大招放出（招式名稱的訊息） | SFX.play('alarm', 0.5, 0.9)＋招式各自的聲音 | entities/mech-boss-tier.js:417 | 1.5 | 2 | Twin ace mech squad unleashes its ultimate attack, sharp release blast with a deep sub-bass whoomp, mecha anime style |
| `boss_duo_interrupt` | 大招被打斷（長時間失衡） | SFX.stagger | entities/mech-boss-tier.js:511 | 2.5 | 2 | Overloaded twin ace mech squad short-circuits and lurches, power-down whine, sparking crackle and heavy metal clank |
| `boss_duo_stagger` | 失衡（BREAK） | SFX.stagger＋打出者的 SFX.breakFx／stinger | entities/mech-entity.js:1732、game/feedback.js:332、:336 | 1.8 | 3 | Twin ace mech squad staggers off balance, groaning metal, hydraulic hiss and a heavy clunk |
| `boss_duo_open` | 破綻（金色光環、傷害加倍） | SFX.play('bell', 0.6, 1.3) | entities/mech-boss-tier.js:328 | 1.2 | 1 | Exposed weak point on a twin ace mech squad, armor plates unlatching with a hiss and a bright metallic ping |
| `boss_duo_shell_on` | 裝甲殼長出（刁鑽度 5 起的型態閘門） | SFX.play('bell', 0.5, 0.7) | entities/mech-boss-tier.js:219 | 1.5 | 1 | Heavy armor shell clamps over a twin ace mech squad, interlocking plates slamming shut with a resonant clang |
| `boss_duo_shell_break` | 裝甲殼打開（部位破壞、打斷、破綻、時間到） | SFX.stagger | entities/mech-boss-tier.js:246 | 1.5 | 1 | Armor shell bursts open on a twin ace mech squad, explosive bolts popping and plates crashing to the ground |
| `boss_duo_phase` | 換型態（第二、第三型態：短暫無敵＋衝擊波） | SFX.cue('phase')＋衝擊波的 SFX.explode(true) | game/feedback.js:265、game/bosses.js:237（→ fx/effects.js:1817） | 3 | 2 | Twin ace mech squad transforms into a more dangerous form, mechanical reconfiguration, power surge and a booming shockwave |
| `boss_duo_enrage` | 狂暴化（開打 6 分鐘、雙機的一台倒下） | 沒有聲音 | game/bosses.js:194、:206 | 2.5 | 1 | Twin ace mech squad goes berserk, reactor overdrive scream, red alert warble and violent engine roar |
| `boss_duo_final_call` | 最終型態專屬招式「連攜齊射」的宣告（沒有刁鑽度時） | SFX.play('alarm', 0.5, 0.9) | entities/mech-boss3.js:104 | 1.5 | 1 | Short ominous warning call before a twin ace mech squad's final special move, low siren with mechanical chatter |
| `boss_duo_part_break` | Boss 改版的部位被打壞（KESTREL 的肩上飛彈、BRANT 的肩上榴彈） | SFX.explode(true)＋SFX.wreck（部位本身被擊破；tierPartDown 沒有額外聲音） | entities/mech-entity.js:2722、:2723；game/boss-tier.js:252 | 2 | 3 | A mounted component on a twin ace mech squad is blown off, sharp explosion, tearing metal and scattering debris |
| `boss_duo_body_break` | 身體部位破壞（頭部、右臂、左臂、腿部（兩台各自）；之後冒煙起火） | SFX.explode(false)（之後的冒煙與火無聲） | entities/mech-body.js:147、:266 | 2 | 3 | Armor section of a twin ace mech squad shatters, crunchy metal rupture with a burst of flame and sparks |
| `boss_duo_reflect` | 打回去（玩家打掉金色彈體、飛回去） | SFX.play('shield', 0.9, 1.4) | entities/mech-boss-tier.js:821 | 0.8 | 2 | Projectile deflected back toward a twin ace mech squad, bright energy ricochet ping with a whoosh |
| `boss_duo_kestrel_dodge` | 閃避（QB 側閃／後撤／跳躍，機甲型連續閃避） | SFX.qb（一般的 QB 音；閃避本身沒有額外聲音） | entities/mech-entity.js:3083、entities/mech-dodge.js:299 | 0.8 | 3 | Quick evasive thruster burst of a nimble ace mech, sharp jet blast with a mechanical whoosh |
| `boss_duo_brant_dodge` | 閃避（QB 側閃／後撤／跳躍，機甲型連續閃避） | SFX.qb（一般的 QB 音；閃避本身沒有額外聲音） | entities/mech-entity.js:3083、entities/mech-dodge.js:299 | 0.8 | 3 | Quick evasive thruster burst of a heavy ace mech, sharp jet blast with a mechanical whoosh |
| `boss_duo_kestrel_missile` | KESTREL 的肩上飛彈 | SFX.shot('missile') | entities/mech-entity.js:1074 | 1.5 | 2 | Quick shoulder missile volley, crisp launch thumps and hissing trails |
| `boss_duo_brant_grenade` | BRANT 的肩上榴彈 | SFX.shot('grenade') | entities/mech-entity.js:979 | 1.5 | 2 | Heavy shoulder grenade launcher thump with whistling arc |
| `boss_duo_rescue` | 一台失衡時另一台來救 | 沒有聲音 | game/bosses2.js（duo 的救援） | 1.5 | 1 | Mech boosting in to cover its partner, urgent thruster roar and radio chirp |
| `boss_duo_rage` | 一台倒下、另一台狂暴 | 沒有聲音（只有訊息） | game/bosses.js:197～206 | 2.5 | 1 | Surviving mech goes berserk, furious reactor surge and engine scream |
| `boss_duo_final` | 最終型態「連攜齊射」 | 各武器的 SFX.shot（entities/mech-entity.js:883 實彈／:927 砲彈／:979 榴彈／:1074 導彈／:1264 雷射） | entities/mech-boss3.js:63 | 2.5 | 2 | Two mechs firing in perfect sync, layered heavy gunfire and missile launches |
| `boss_duo_death` | 擊破（大爆炸、殘骸） | SFX.explode('huge')＋SFX.wreck＋SFX.stinger(true)（配樂的重音） | entities/mech-entity.js:2722、:2723、:2762 | 5 | 2 | Colossal twin ace mech squad destroyed, chain of internal explosions, collapsing steel and a long rumbling tail |

### MIRAGE 光學迷彩電戰機（kind phantom）

| 建議的音效鍵 | 事件 | 目前的聲音 | 觸發處 | 長度（秒） | 變化數 | AI 提示詞草稿 |
|---|---|---|---|---|---|---|
| `boss_mirage_intro` | 登場（第一次出現在場上：WARNING 橫幅） | 沒有聲音（只有橫幅與 ECHO 的語音） | game/juice.js:546、:547 | 3.5 | 1 | A towering optical camouflage electronic warfare mech powers up and announces itself, deep mechanical boot-up roar, heavy servo whine rising into a booming impact, sci-fi mecha scale |
| `boss_mirage_loop` | 迷彩中的循環（半透明、不能鎖定） | 沒有聲音（推進／懸浮時共用 thrustLoop（game/feedback.js:243）） | entities/mech-boss2.js:683、:1878（applyCloak） | 6 | 1 | Seamless loop of an active camouflage field, faint shimmering hiss and wavering electronic hum |
| `boss_mirage_charge_start` | 大招開始蓄力（Boss 改版的打斷量表出現） | SFX.play('alarm', 0.45, 0.7) | entities/mech-boss-tier.js:451 | 2 | 2 | Optical camouflage electronic warfare mech begins charging a super attack, rising electrical whine and deep reactor surge, ominous build-up |
| `boss_mirage_charge_loop` | 大招蓄力中（量表累積，循環） | 沒有聲音（只有 gather 特效） | entities/mech-boss-tier.js:395 | 4 | 1 | Seamless loop of a giant machine charging energy, pulsing hum with crackling arcs, tension building |
| `boss_mirage_big_release` | 大招放出（招式名稱的訊息） | SFX.play('alarm', 0.5, 0.9)＋招式各自的聲音 | entities/mech-boss-tier.js:417 | 1.5 | 2 | Optical camouflage electronic warfare mech unleashes its ultimate attack, sharp release blast with a deep sub-bass whoomp, mecha anime style |
| `boss_mirage_interrupt` | 大招被打斷（長時間失衡） | SFX.stagger | entities/mech-boss-tier.js:511 | 2.5 | 2 | Overloaded optical camouflage electronic warfare mech short-circuits and lurches, power-down whine, sparking crackle and heavy metal clank |
| `boss_mirage_stagger` | 失衡（BREAK） | SFX.stagger＋打出者的 SFX.breakFx／stinger | entities/mech-entity.js:1732、game/feedback.js:332、:336 | 1.8 | 3 | Optical camouflage electronic warfare mech staggers off balance, groaning metal, hydraulic hiss and a heavy clunk |
| `boss_mirage_open` | 破綻（金色光環、傷害加倍） | SFX.play('bell', 0.6, 1.3) | entities/mech-boss-tier.js:328 | 1.2 | 1 | Exposed weak point on a optical camouflage electronic warfare mech, armor plates unlatching with a hiss and a bright metallic ping |
| `boss_mirage_shell_on` | 裝甲殼長出（刁鑽度 5 起的型態閘門） | SFX.play('bell', 0.5, 0.7) | entities/mech-boss-tier.js:219 | 1.5 | 1 | Heavy armor shell clamps over a optical camouflage electronic warfare mech, interlocking plates slamming shut with a resonant clang |
| `boss_mirage_shell_break` | 裝甲殼打開（部位破壞、打斷、破綻、時間到） | SFX.stagger | entities/mech-boss-tier.js:246 | 1.5 | 1 | Armor shell bursts open on a optical camouflage electronic warfare mech, explosive bolts popping and plates crashing to the ground |
| `boss_mirage_phase` | 換型態（第二、第三型態：短暫無敵＋衝擊波） | SFX.cue('phase')＋衝擊波的 SFX.explode(true) | game/feedback.js:265、game/bosses.js:237（→ fx/effects.js:1817） | 3 | 2 | Optical camouflage electronic warfare mech transforms into a more dangerous form, mechanical reconfiguration, power surge and a booming shockwave |
| `boss_mirage_enrage` | 狂暴化（開打 6 分鐘、雙機的一台倒下） | 沒有聲音 | game/bosses.js:194、:206 | 2.5 | 1 | Optical camouflage electronic warfare mech goes berserk, reactor overdrive scream, red alert warble and violent engine roar |
| `boss_mirage_final_call` | 最終型態專屬招式「分身突襲」的宣告（沒有刁鑽度時） | SFX.play('alarm', 0.5, 0.9) | entities/mech-boss3.js:104 | 1.5 | 1 | Short ominous warning call before a optical camouflage electronic warfare mech's final special move, low siren with mechanical chatter |
| `boss_mirage_part_break` | Boss 改版的部位被打壞（迷彩發生器、分身投影器、干擾天線） | SFX.explode(true)＋SFX.wreck（部位本身被擊破；tierPartDown 沒有額外聲音） | entities/mech-entity.js:2722、:2723；game/boss-tier.js:252 | 2 | 3 | A mounted component on a optical camouflage electronic warfare mech is blown off, sharp explosion, tearing metal and scattering debris |
| `boss_mirage_body_break` | 身體部位破壞（頭部、右臂、左臂、腿部；之後冒煙起火） | SFX.explode(false)（之後的冒煙與火無聲） | entities/mech-body.js:147、:266 | 2 | 3 | Armor section of a optical camouflage electronic warfare mech shatters, crunchy metal rupture with a burst of flame and sparks |
| `boss_mirage_reflect` | 打回去（玩家打掉金色彈體、飛回去） | SFX.play('shield', 0.9, 1.4) | entities/mech-boss-tier.js:821 | 0.8 | 2 | Projectile deflected back toward a optical camouflage electronic warfare mech, bright energy ricochet ping with a whoosh |
| `boss_mirage_dodge` | 閃避（QB 側閃／後撤／跳躍，機甲型連續閃避） | SFX.qb（一般的 QB 音；閃避本身沒有額外聲音） | entities/mech-entity.js:3083、entities/mech-dodge.js:299 | 0.8 | 3 | Quick evasive thruster burst of a stealth mech, sharp jet blast with a mechanical whoosh |
| `boss_mirage_cloak` | 進入迷彩 | 沒有聲音 | entities/mech-boss2.js:683 | 1.5 | 1 | Optical camouflage engaging, shimmering sweep fading into silence |
| `boss_mirage_decloak` | 現形（開火、中彈、硬直） | 沒有聲音 | entities/mech-boss2.js:707、:714 | 1.2 | 2 | Stealth field collapsing, glitchy crackle as a machine becomes visible |
| `boss_mirage_holo_spawn` | 展開全息分身 | 沒有聲音（只有 SFX.alert） | entities/mech-boss2.js:699、:700（game/bosses2.js:294） | 1.5 | 1 | Holographic decoys projecting, layered digital shimmer and electronic chirps |
| `boss_mirage_holo_pop` | 分身被打中引爆小型 EMP | 沒有聲音（fx 無聲） | entities/mech-boss2.js:1641 | 1 | 3 | Hologram bursting into a small EMP pulse, electric pop and fizzle |
| `boss_mirage_reveal_volley` | 現形齊射 | 各武器的 SFX.shot（entities/mech-entity.js:883 實彈／:927 砲彈／:979 榴彈／:1074 導彈／:1264 雷射）；SFX.alert | entities/mech-boss2.js:707 | 2 | 2 | Burst of laser and rifle fire from a decloaking mech, sharp energy shots |
| `boss_mirage_death` | 擊破（大爆炸、殘骸） | SFX.explode('huge')＋SFX.wreck＋SFX.stinger(true)（配樂的重音） | entities/mech-entity.js:2722、:2723、:2762 | 5 | 2 | Colossal optical camouflage electronic warfare mech destroyed, chain of internal explosions, collapsing steel and a long rumbling tail |

### ARACHNE 多足要塞（kind spider）

| 建議的音效鍵 | 事件 | 目前的聲音 | 觸發處 | 長度（秒） | 變化數 | AI 提示詞草稿 |
|---|---|---|---|---|---|---|
| `boss_arachne_intro` | 登場（第一次出現在場上：WARNING 橫幅） | 沒有聲音（只有橫幅與 ECHO 的語音） | game/juice.js:546、:547 | 3.5 | 1 | A towering multi-legged spider fortress powers up and announces itself, deep mechanical boot-up roar, heavy servo whine rising into a booming impact, sci-fi mecha scale |
| `boss_arachne_loop` | 多足行走（三腳步態） | 沒有聲音（推進／懸浮時共用 thrustLoop（game/feedback.js:243）） | entities/mech-boss.js:786（spiderFx） | 6 | 1 | Seamless loop of a giant mechanical spider walking, many clanking legs, skittering metal and hydraulic hiss |
| `boss_arachne_charge_start` | 大招開始蓄力（Boss 改版的打斷量表出現） | SFX.play('alarm', 0.45, 0.7) | entities/mech-boss-tier.js:451 | 2 | 2 | Multi-legged spider fortress begins charging a super attack, rising electrical whine and deep reactor surge, ominous build-up |
| `boss_arachne_charge_loop` | 大招蓄力中（量表累積，循環） | 沒有聲音（只有 gather 特效） | entities/mech-boss-tier.js:395 | 4 | 1 | Seamless loop of a giant machine charging energy, pulsing hum with crackling arcs, tension building |
| `boss_arachne_big_release` | 大招放出（招式名稱的訊息） | SFX.play('alarm', 0.5, 0.9)＋招式各自的聲音 | entities/mech-boss-tier.js:417 | 1.5 | 2 | Multi-legged spider fortress unleashes its ultimate attack, sharp release blast with a deep sub-bass whoomp, mecha anime style |
| `boss_arachne_interrupt` | 大招被打斷（長時間失衡） | SFX.stagger | entities/mech-boss-tier.js:511 | 2.5 | 2 | Overloaded multi-legged spider fortress short-circuits and lurches, power-down whine, sparking crackle and heavy metal clank |
| `boss_arachne_stagger` | 失衡（BREAK） | SFX.stagger＋打出者的 SFX.breakFx／stinger | entities/mech-entity.js:1732、game/feedback.js:332、:336 | 1.8 | 3 | Multi-legged spider fortress staggers off balance, groaning metal, hydraulic hiss and a heavy clunk |
| `boss_arachne_open` | 破綻（金色光環、傷害加倍） | SFX.play('bell', 0.6, 1.3) | entities/mech-boss-tier.js:328 | 1.2 | 1 | Exposed weak point on a multi-legged spider fortress, armor plates unlatching with a hiss and a bright metallic ping |
| `boss_arachne_shell_on` | 裝甲殼長出（刁鑽度 5 起的型態閘門） | SFX.play('bell', 0.5, 0.7) | entities/mech-boss-tier.js:219 | 1.5 | 1 | Heavy armor shell clamps over a multi-legged spider fortress, interlocking plates slamming shut with a resonant clang |
| `boss_arachne_shell_break` | 裝甲殼打開（部位破壞、打斷、破綻、時間到） | SFX.stagger | entities/mech-boss-tier.js:246 | 1.5 | 1 | Armor shell bursts open on a multi-legged spider fortress, explosive bolts popping and plates crashing to the ground |
| `boss_arachne_phase` | 換型態（第二、第三型態：短暫無敵＋衝擊波） | SFX.cue('phase')＋衝擊波的 SFX.explode(true) | game/feedback.js:265、game/bosses.js:237（→ fx/effects.js:1817） | 3 | 2 | Multi-legged spider fortress transforms into a more dangerous form, mechanical reconfiguration, power surge and a booming shockwave |
| `boss_arachne_enrage` | 狂暴化（開打 6 分鐘、雙機的一台倒下） | 沒有聲音 | game/bosses.js:194、:206 | 2.5 | 1 | Multi-legged spider fortress goes berserk, reactor overdrive scream, red alert warble and violent engine roar |
| `boss_arachne_final_call` | 最終型態專屬招式「震地」的宣告（沒有刁鑽度時） | SFX.play('alarm', 0.5, 0.9) | entities/mech-boss3.js:104 | 1.5 | 1 | Short ominous warning call before a multi-legged spider fortress's final special move, low siren with mechanical chatter |
| `boss_arachne_part_break` | Boss 改版的部位被打壞（背部砲塔） | SFX.explode(true)＋SFX.wreck（部位本身被擊破；tierPartDown 沒有額外聲音） | entities/mech-entity.js:2722、:2723；game/boss-tier.js:252 | 2 | 3 | A mounted component on a multi-legged spider fortress is blown off, sharp explosion, tearing metal and scattering debris |
| `boss_arachne_body_break` | 身體部位破壞（前裝甲、腹部裝甲；之後冒煙起火） | SFX.explode(false)（之後的冒煙與火無聲） | entities/mech-body.js:147、:266 | 2 | 3 | Armor section of a multi-legged spider fortress shatters, crunchy metal rupture with a burst of flame and sparks |
| `boss_arachne_reflect` | 打回去（玩家打掉金色彈體、飛回去） | SFX.play('shield', 0.9, 1.4) | entities/mech-boss-tier.js:821 | 0.8 | 2 | Projectile deflected back toward a multi-legged spider fortress, bright energy ricochet ping with a whoosh |
| `boss_arachne_guard_up` | 防禦反應（架起六角護盾） | 沒有聲音 | entities/mech-dodge.js:479 | 1 | 1 | A spider fortress raises a hexagonal energy barrier, electric hum swelling into a shield shimmer |
| `boss_arachne_guard_hit` | 防禦中被打中（護盾亮起） | 沒有聲音（只有一般的命中音） | entities/mech-dodge.js:757 | 0.5 | 3 | Bullets impacting a hexagonal energy shield, crisp energy deflection crackle |
| `boss_arachne_leap` | 躍起（準備跳躍閃避） | 沒有聲音（只有 SFX.alert） | entities/mech-boss.js:420～425 | 1.5 | 1 | Giant spider machine launching into the air, hydraulic legs firing and thrusters roaring |
| `boss_arachne_slam` | 落地砸地（衝擊波、破綻） | 預警無聲；擴散開始時 SFX.explode(true)（fx/effects.js:1817） | entities/mech-boss.js:430 | 2.5 | 2 | Spider fortress landing with an earth-shaking slam, shockwave boom and debris |
| `boss_arachne_leg_break` | 腳部關節被打斷 | SFX.explode(true)＋SFX.wreck（部位擊破） | entities/mech-entity.js:2722 | 1.5 | 3 | Mechanical leg joint snapping off, sharp explosion and screeching metal |
| `boss_arachne_collapse` | 斷三條腿倒下（核心暴露） | 沒有聲音（fx 無聲） | entities/mech-boss.js:405～408 | 3 | 1 | Giant spider machine collapsing onto its belly, crashing hull and groaning metal |
| `boss_arachne_death` | 擊破（大爆炸、殘骸） | SFX.explode('huge')＋SFX.wreck＋SFX.stinger(true)（配樂的重音） | entities/mech-entity.js:2722、:2723、:2762 | 5 | 2 | Colossal multi-legged spider fortress destroyed, chain of internal explosions, collapsing steel and a long rumbling tail |

### JUDGEMENT 衛星砲導引塔（kind orbital）

| 建議的音效鍵 | 事件 | 目前的聲音 | 觸發處 | 長度（秒） | 變化數 | AI 提示詞草稿 |
|---|---|---|---|---|---|---|
| `boss_judgement_intro` | 登場（第一次出現在場上：WARNING 橫幅） | 沒有聲音（只有橫幅與 ECHO 的語音） | game/juice.js:546、:547 | 3.5 | 1 | A towering satellite cannon guidance tower powers up and announces itself, deep mechanical boot-up roar, heavy servo whine rising into a booming impact, sci-fi mecha scale |
| `boss_judgement_loop` | 導引塔運轉的循環 | 沒有聲音（推進／懸浮時共用 thrustLoop（game/feedback.js:243）） | entities/mech-boss2.js:739（orbitalAI） | 6 | 1 | Seamless loop of a tall uplink tower, electronic transmission hum and data chatter |
| `boss_judgement_charge_start` | 大招開始蓄力（Boss 改版的打斷量表出現） | SFX.play('alarm', 0.45, 0.7) | entities/mech-boss-tier.js:451 | 2 | 2 | Satellite cannon guidance tower begins charging a super attack, rising electrical whine and deep reactor surge, ominous build-up |
| `boss_judgement_charge_loop` | 大招蓄力中（量表累積，循環） | 沒有聲音（只有 gather 特效） | entities/mech-boss-tier.js:395 | 4 | 1 | Seamless loop of a giant machine charging energy, pulsing hum with crackling arcs, tension building |
| `boss_judgement_big_release` | 大招放出（招式名稱的訊息） | SFX.play('alarm', 0.5, 0.9)＋招式各自的聲音 | entities/mech-boss-tier.js:417 | 1.5 | 2 | Satellite cannon guidance tower unleashes its ultimate attack, sharp release blast with a deep sub-bass whoomp, mecha anime style |
| `boss_judgement_interrupt` | 大招被打斷（長時間失衡） | SFX.stagger | entities/mech-boss-tier.js:511 | 2.5 | 2 | Overloaded satellite cannon guidance tower short-circuits and lurches, power-down whine, sparking crackle and heavy metal clank |
| `boss_judgement_stagger` | 失衡（BREAK） | SFX.stagger＋打出者的 SFX.breakFx／stinger | entities/mech-entity.js:1732、game/feedback.js:332、:336 | 1.8 | 3 | Satellite cannon guidance tower staggers off balance, groaning metal, hydraulic hiss and a heavy clunk |
| `boss_judgement_open` | 破綻（金色光環、傷害加倍） | SFX.play('bell', 0.6, 1.3) | entities/mech-boss-tier.js:328 | 1.2 | 1 | Exposed weak point on a satellite cannon guidance tower, armor plates unlatching with a hiss and a bright metallic ping |
| `boss_judgement_shell_on` | 裝甲殼長出（刁鑽度 5 起的型態閘門） | SFX.play('bell', 0.5, 0.7) | entities/mech-boss-tier.js:219 | 1.5 | 1 | Heavy armor shell clamps over a satellite cannon guidance tower, interlocking plates slamming shut with a resonant clang |
| `boss_judgement_shell_break` | 裝甲殼打開（部位破壞、打斷、破綻、時間到） | SFX.stagger | entities/mech-boss-tier.js:246 | 1.5 | 1 | Armor shell bursts open on a satellite cannon guidance tower, explosive bolts popping and plates crashing to the ground |
| `boss_judgement_phase` | 換型態（第二、第三型態：短暫無敵＋衝擊波） | SFX.cue('phase')＋衝擊波的 SFX.explode(true) | game/feedback.js:265、game/bosses.js:237（→ fx/effects.js:1817） | 3 | 2 | Satellite cannon guidance tower transforms into a more dangerous form, mechanical reconfiguration, power surge and a booming shockwave |
| `boss_judgement_enrage` | 狂暴化（開打 6 分鐘、雙機的一台倒下） | 沒有聲音 | game/bosses.js:194、:206 | 2.5 | 1 | Satellite cannon guidance tower goes berserk, reactor overdrive scream, red alert warble and violent engine roar |
| `boss_judgement_final_call` | 最終型態專屬招式「雙重光柱」的宣告（沒有刁鑽度時） | SFX.play('alarm', 0.5, 0.9) | entities/mech-boss3.js:104 | 1.5 | 1 | Short ominous warning call before a satellite cannon guidance tower's final special move, low siren with mechanical chatter |
| `boss_judgement_part_break` | Boss 改版的部位被打壞（導引天線、中繼碟、導引天線（副）） | SFX.explode(true)＋SFX.wreck（部位本身被擊破；tierPartDown 沒有額外聲音） | entities/mech-entity.js:2722、:2723；game/boss-tier.js:252 | 2 | 3 | A mounted component on a satellite cannon guidance tower is blown off, sharp explosion, tearing metal and scattering debris |
| `boss_judgement_body_break` | 身體部位破壞（塔身中段、基座冷卻器；之後冒煙起火） | SFX.explode(false)（之後的冒煙與火無聲） | entities/mech-body.js:147、:266 | 2 | 3 | Armor section of a satellite cannon guidance tower shatters, crunchy metal rupture with a burst of flame and sparks |
| `boss_judgement_reflect` | 打回去（玩家打掉金色彈體、飛回去） | SFX.play('shield', 0.9, 1.4) | entities/mech-boss-tier.js:821 | 0.8 | 2 | Projectile deflected back toward a satellite cannon guidance tower, bright energy ricochet ping with a whoosh |
| `boss_judgement_guard_up` | 防禦反應（架起六角護盾） | 沒有聲音 | entities/mech-dodge.js:479 | 1 | 1 | A guidance tower raises a hexagonal energy barrier, electric hum swelling into a shield shimmer |
| `boss_judgement_guard_hit` | 防禦中被打中（護盾亮起） | 沒有聲音（只有一般的命中音） | entities/mech-dodge.js:757 | 0.5 | 3 | Bullets impacting a hexagonal energy shield, crisp energy deflection crackle |
| `boss_judgement_beam_start` | 衛星砲照射開始 | SFX.play('charge', 1, 0.4)＋SFX.alert | entities/mech-boss2.js:763、:764 | 2 | 1 | Orbital strike beam locking on, sky-splitting rising tone and crackle |
| `boss_judgement_beam_loop` | 追蹤光柱（越追越快，循環） | 沒有聲音 | entities/mech-boss2.js:770～795 | 5 | 1 | Seamless loop of a searing orbital laser pillar, roaring plasma column and crackling ground |
| `boss_judgement_cooldown` | 導引鏡冷卻（破綻） | 沒有聲音（只有訊息） | entities/mech-boss2.js:797、:803 | 2 | 1 | Large mirror array cooling down, venting steam and ticking metal |
| `boss_judgement_grid_warn` | 格子砲擊預警 | 沒有聲音（只有 SFX.alert） | entities/mech-boss2.js:822、:835 | 1.5 | 1 | Targeting grid projected onto the ground, electronic sweep and rising tones |
| `boss_judgement_grid_strike` | 格子砲擊落下 | SFX.play('laserBig', 0.9, 0.6) | entities/mech-boss2.js:840 | 2 | 2 | Multiple orbital beams striking the ground at once, thunderous energy impacts |
| `boss_judgement_death` | 擊破（大爆炸、殘骸） | SFX.explode('huge')＋SFX.wreck＋SFX.stinger(true)（配樂的重音） | entities/mech-entity.js:2722、:2723、:2762 | 5 | 2 | Colossal satellite cannon guidance tower destroyed, chain of internal explosions, collapsing steel and a long rumbling tail |

### ARCHON 自律型艦載機動兵器（沒有 kind；bossAI，鍵 ARCHON）

| 建議的音效鍵 | 事件 | 目前的聲音 | 觸發處 | 長度（秒） | 變化數 | AI 提示詞草稿 |
|---|---|---|---|---|---|---|
| `boss_archon_intro` | 登場（第一次出現在場上：WARNING 橫幅） | 沒有聲音（只有橫幅與 ECHO 的語音） | game/juice.js:546、:547 | 3.5 | 1 | A towering autonomous shipborne combat mech powers up and announces itself, deep mechanical boot-up roar, heavy servo whine rising into a booming impact, sci-fi mecha scale |
| `boss_archon_loop` | 移動／待機的循環音 | 沒有聲音（逆關節腳的腳步與推進） | entities/mech-entity.js:3688 | 6 | 1 | Seamless loop of a massive autonomous shipborne combat mech idling and moving, low engine hum, heavy hydraulic creaks, distant metal stress |
| `boss_archon_charge_start` | 大招開始蓄力（Boss 改版的打斷量表出現） | SFX.play('alarm', 0.45, 0.7) | entities/mech-boss-tier.js:451 | 2 | 2 | Autonomous shipborne combat mech begins charging a super attack, rising electrical whine and deep reactor surge, ominous build-up |
| `boss_archon_charge_loop` | 大招蓄力中（量表累積，循環） | 沒有聲音（只有 gather 特效） | entities/mech-boss-tier.js:395 | 4 | 1 | Seamless loop of a giant machine charging energy, pulsing hum with crackling arcs, tension building |
| `boss_archon_big_release` | 大招放出（招式名稱的訊息） | SFX.play('alarm', 0.5, 0.9)＋招式各自的聲音 | entities/mech-boss-tier.js:417 | 1.5 | 2 | Autonomous shipborne combat mech unleashes its ultimate attack, sharp release blast with a deep sub-bass whoomp, mecha anime style |
| `boss_archon_interrupt` | 大招被打斷（長時間失衡） | SFX.stagger | entities/mech-boss-tier.js:511 | 2.5 | 2 | Overloaded autonomous shipborne combat mech short-circuits and lurches, power-down whine, sparking crackle and heavy metal clank |
| `boss_archon_stagger` | 失衡（BREAK） | SFX.stagger＋打出者的 SFX.breakFx／stinger | entities/mech-entity.js:1732、game/feedback.js:332、:336 | 1.8 | 3 | Autonomous shipborne combat mech staggers off balance, groaning metal, hydraulic hiss and a heavy clunk |
| `boss_archon_open` | 破綻（金色光環、傷害加倍） | SFX.play('bell', 0.6, 1.3) | entities/mech-boss-tier.js:328 | 1.2 | 1 | Exposed weak point on a autonomous shipborne combat mech, armor plates unlatching with a hiss and a bright metallic ping |
| `boss_archon_shell_on` | 裝甲殼長出（刁鑽度 5 起的型態閘門） | SFX.play('bell', 0.5, 0.7) | entities/mech-boss-tier.js:219 | 1.5 | 1 | Heavy armor shell clamps over a autonomous shipborne combat mech, interlocking plates slamming shut with a resonant clang |
| `boss_archon_shell_break` | 裝甲殼打開（部位破壞、打斷、破綻、時間到） | SFX.stagger | entities/mech-boss-tier.js:246 | 1.5 | 1 | Armor shell bursts open on a autonomous shipborne combat mech, explosive bolts popping and plates crashing to the ground |
| `boss_archon_phase` | 換型態（第二、第三型態：短暫無敵＋衝擊波） | SFX.cue('phase')＋衝擊波的 SFX.explode(true) | game/feedback.js:265、game/bosses.js:237（→ fx/effects.js:1817） | 3 | 2 | Autonomous shipborne combat mech transforms into a more dangerous form, mechanical reconfiguration, power surge and a booming shockwave |
| `boss_archon_enrage` | 狂暴化（開打 6 分鐘、雙機的一台倒下） | 沒有聲音 | game/bosses.js:194、:206 | 2.5 | 1 | Autonomous shipborne combat mech goes berserk, reactor overdrive scream, red alert warble and violent engine roar |
| `boss_archon_final_call` | 最終型態專屬招式「導彈牆」的宣告（沒有刁鑽度時） | SFX.play('alarm', 0.5, 0.9) | entities/mech-boss3.js:104 | 1.5 | 1 | Short ominous warning call before a autonomous shipborne combat mech's final special move, low siren with mechanical chatter |
| `boss_archon_part_break` | Boss 改版的部位被打壞（左右飛彈莢艙、火焰噴射器、斥力裝甲發生器） | SFX.explode(true)＋SFX.wreck（部位本身被擊破；tierPartDown 沒有額外聲音） | entities/mech-entity.js:2722、:2723；game/boss-tier.js:252 | 2 | 3 | A mounted component on a autonomous shipborne combat mech is blown off, sharp explosion, tearing metal and scattering debris |
| `boss_archon_body_break` | 身體部位破壞（頭部、右臂、左臂、腿部；之後冒煙起火） | SFX.explode(false)（之後的冒煙與火無聲） | entities/mech-body.js:147、:266 | 2 | 3 | Armor section of a autonomous shipborne combat mech shatters, crunchy metal rupture with a burst of flame and sparks |
| `boss_archon_reflect` | 打回去（玩家打掉金色彈體、飛回去） | SFX.play('shield', 0.9, 1.4) | entities/mech-boss-tier.js:821 | 0.8 | 2 | Projectile deflected back toward a autonomous shipborne combat mech, bright energy ricochet ping with a whoosh |
| `boss_archon_dodge` | 閃避（QB 側閃／後撤／跳躍，機甲型連續閃避） | SFX.qb（一般的 QB 音；閃避本身沒有額外聲音） | entities/mech-entity.js:3083、entities/mech-dodge.js:299 | 0.8 | 3 | Quick evasive thruster burst of a autonomous combat mech, sharp jet blast with a mechanical whoosh |
| `boss_archon_saber_swing` | 光束大劍揮擊 | SFX.meleeSwing（一般的近戰揮擊） | entities/mech-entity.js:1879 | 1 | 3 | Massive beam saber swing, humming plasma blade whoosh |
| `boss_archon_saber_hit` | 光束大劍命中 | SFX.meleeHit | entities/mech-entity.js:2036 | 1 | 3 | Beam saber slicing armor, searing energy impact with sizzle |
| `boss_archon_rush` | 突進（突擊推進） | SFX.ab | entities/mech-entity.js:3119、:4419 | 1.5 | 2 | Combat mech blasting forward on afterburners, roaring thrust |
| `boss_archon_laser` | 雷射步槍（蓄力／橫掃） | SFX.shot('laser'／'laserCharged') | entities/mech-entity.js:1264、:4462 | 1.5 | 2 | Laser rifle firing charged shots, sharp energy cracks |
| `boss_archon_pa_up` | 大招「斥力裝甲展開」（脈衝裝甲吸收傷害） | SFX.play('laserBig', 0.8, 1.4)（game/bosses2.js:216）（展開本身無聲） | data/boss-kit.js:581、entities/mech-boss-tier.js:532 | 2 | 1 | Repulsor armor field snapping on, deep energy whoom with crackling shell |
| `boss_archon_pa_hit` | 斥力裝甲吸收子彈 | 沒有聲音（energyHit 只有外觀） | entities/mech-boss-tier.js:543 | 0.5 | 3 | Bullets absorbed by a pulsing energy armor layer, muffled electric thuds |
| `boss_archon_pa_break` | 斥力裝甲被打破（破綻） | SFX.stagger | entities/mech-boss-tier.js:551 | 1.5 | 1 | Energy armor shattering, glassy electric burst and power drop |
| `boss_archon_flame` | 火焰噴射器（部位） | 沒有聲音（fx 無聲） | data/boss-kit.js:575 | 2 | 2 | Mech flamethrower roaring, pressurized fire jet |
| `boss_archon_missile_wall` | 最終型態「導彈牆」（肩上連射＋能量環） | 各武器的 SFX.shot（entities/mech-entity.js:883 實彈／:927 砲彈／:979 榴彈／:1074 導彈／:1264 雷射）；SFX.play('laserBig', 0.8, 1.4)（game/bosses2.js:216） | entities/mech-boss3.js:74 | 3 | 2 | Wall of missiles launched in waves, overlapping launch thumps and roaring trails |
| `boss_archon_death` | 擊破（大爆炸、殘骸） | SFX.explode('huge')＋SFX.wreck＋SFX.stinger(true)（配樂的重音） | entities/mech-entity.js:2722、:2723、:2762 | 5 | 2 | Colossal autonomous shipborne combat mech destroyed, chain of internal explosions, collapsing steel and a long rumbling tail |

### CERBERUS 三機合體（kind trinity）

| 建議的音效鍵 | 事件 | 目前的聲音 | 觸發處 | 長度（秒） | 變化數 | AI 提示詞草稿 |
|---|---|---|---|---|---|---|
| `boss_cerberus_intro` | 登場（第一次出現在場上：WARNING 橫幅） | 沒有聲音（只有橫幅與 ECHO 的語音） | game/juice.js:546、:547 | 3.5 | 1 | A towering three-in-one combining mech powers up and announces itself, deep mechanical boot-up roar, heavy servo whine rising into a booming impact, sci-fi mecha scale |
| `boss_cerberus_loop` | 移動／待機的循環音 | 沒有聲音（一般 AC 的腳步與推進） | entities/mech-boss2.js:856（trinityAI） | 6 | 1 | Seamless loop of a massive three-in-one combining mech idling and moving, low engine hum, heavy hydraulic creaks, distant metal stress |
| `boss_cerberus_charge_start` | 大招開始蓄力（Boss 改版的打斷量表出現） | SFX.play('alarm', 0.45, 0.7) | entities/mech-boss-tier.js:451 | 2 | 2 | Three-in-one combining mech begins charging a super attack, rising electrical whine and deep reactor surge, ominous build-up |
| `boss_cerberus_charge_loop` | 大招蓄力中（量表累積，循環） | 沒有聲音（只有 gather 特效） | entities/mech-boss-tier.js:395 | 4 | 1 | Seamless loop of a giant machine charging energy, pulsing hum with crackling arcs, tension building |
| `boss_cerberus_big_release` | 大招放出（招式名稱的訊息） | SFX.play('alarm', 0.5, 0.9)＋招式各自的聲音 | entities/mech-boss-tier.js:417 | 1.5 | 2 | Three-in-one combining mech unleashes its ultimate attack, sharp release blast with a deep sub-bass whoomp, mecha anime style |
| `boss_cerberus_interrupt` | 大招被打斷（長時間失衡） | SFX.stagger | entities/mech-boss-tier.js:511 | 2.5 | 2 | Overloaded three-in-one combining mech short-circuits and lurches, power-down whine, sparking crackle and heavy metal clank |
| `boss_cerberus_stagger` | 失衡（BREAK） | SFX.stagger＋打出者的 SFX.breakFx／stinger | entities/mech-entity.js:1732、game/feedback.js:332、:336 | 1.8 | 3 | Three-in-one combining mech staggers off balance, groaning metal, hydraulic hiss and a heavy clunk |
| `boss_cerberus_open` | 破綻（金色光環、傷害加倍） | SFX.play('bell', 0.6, 1.3) | entities/mech-boss-tier.js:328 | 1.2 | 1 | Exposed weak point on a three-in-one combining mech, armor plates unlatching with a hiss and a bright metallic ping |
| `boss_cerberus_shell_on` | 裝甲殼長出（刁鑽度 5 起的型態閘門） | SFX.play('bell', 0.5, 0.7) | entities/mech-boss-tier.js:219 | 1.5 | 1 | Heavy armor shell clamps over a three-in-one combining mech, interlocking plates slamming shut with a resonant clang |
| `boss_cerberus_shell_break` | 裝甲殼打開（部位破壞、打斷、破綻、時間到） | SFX.stagger | entities/mech-boss-tier.js:246 | 1.5 | 1 | Armor shell bursts open on a three-in-one combining mech, explosive bolts popping and plates crashing to the ground |
| `boss_cerberus_phase` | 換型態（第二、第三型態：短暫無敵＋衝擊波） | SFX.cue('phase')＋衝擊波的 SFX.explode(true) | game/feedback.js:265、game/bosses.js:237（→ fx/effects.js:1817） | 3 | 2 | Three-in-one combining mech transforms into a more dangerous form, mechanical reconfiguration, power surge and a booming shockwave |
| `boss_cerberus_enrage` | 狂暴化（開打 6 分鐘、雙機的一台倒下） | 沒有聲音 | game/bosses.js:194、:206 | 2.5 | 1 | Three-in-one combining mech goes berserk, reactor overdrive scream, red alert warble and violent engine roar |
| `boss_cerberus_final_call` | 最終型態專屬招式「三重衝擊」的宣告（沒有刁鑽度時） | SFX.play('alarm', 0.5, 0.9) | entities/mech-boss3.js:104 | 1.5 | 1 | Short ominous warning call before a three-in-one combining mech's final special move, low siren with mechanical chatter |
| `boss_cerberus_part_break` | Boss 改版的部位被打壞（α 的刃、β 的狙擊砲、γ 的修理臂） | SFX.explode(true)＋SFX.wreck（部位本身被擊破；tierPartDown 沒有額外聲音） | entities/mech-entity.js:2722、:2723；game/boss-tier.js:252 | 2 | 3 | A mounted component on a three-in-one combining mech is blown off, sharp explosion, tearing metal and scattering debris |
| `boss_cerberus_body_break` | 身體部位破壞（頭部、右臂、左臂、腿部；之後冒煙起火） | SFX.explode(false)（之後的冒煙與火無聲） | entities/mech-body.js:147、:266 | 2 | 3 | Armor section of a three-in-one combining mech shatters, crunchy metal rupture with a burst of flame and sparks |
| `boss_cerberus_reflect` | 打回去（玩家打掉金色彈體、飛回去） | SFX.play('shield', 0.9, 1.4) | entities/mech-boss-tier.js:821 | 0.8 | 2 | Projectile deflected back toward a three-in-one combining mech, bright energy ricochet ping with a whoosh |
| `boss_cerberus_dodge` | 閃避（QB 側閃／後撤／跳躍，機甲型連續閃避） | SFX.qb（一般的 QB 音；閃避本身沒有額外聲音） | entities/mech-entity.js:3083、entities/mech-dodge.js:299 | 0.8 | 3 | Quick evasive thruster burst of a combining mech, sharp jet blast with a mechanical whoosh |
| `boss_cerberus_split` | 分離成三台（本體藏到地下） | 沒有聲音 | entities/mech-boss2.js:870（game/bosses2.js:320） | 2.5 | 1 | Giant mech separating into three units, explosive bolts, whirring transformation and thrusters |
| `boss_cerberus_alpha` | α 近戰機的刃 | SFX.meleeSwing／meleeHit | entities/mech-entity.js:1879、:2036 | 1 | 2 | Fast blade slash from a light mech, sharp steel whoosh |
| `boss_cerberus_beta` | β 狙擊機的狙擊 | SFX.shot（狙擊槍種類） | entities/mech-entity.js:927 | 1.5 | 2 | Long-range sniper cannon shot, sharp crack with long echo |
| `boss_cerberus_gamma` | γ 修理機的修理光束 | 沒有聲音 | entities/mech-special.js（repair） | 2 | 1 | Repair beam humming, gentle electric buzz with welding sparkle |
| `boss_cerberus_countdown` | 合體倒數（30 秒） | 沒有聲音（只有訊息） | entities/mech-boss2.js:929 | 1 | 1 | Mechanical countdown tick with rising tension, synthetic beep |
| `boss_cerberus_merge_start` | 開始合體（合體中無防備） | 沒有聲音（只有 SFX.alert） | entities/mech-boss2.js:936 | 2 | 1 | Three mechs converging, magnetic locking clanks and rising power hum |
| `boss_cerberus_merge` | 重新合體並回復 AP | 沒有聲音（fx 無聲） | entities/mech-boss2.js:921～923 | 2.5 | 1 | Combining mech locking together with a huge clamp, energy burst and power-up roar |
| `boss_cerberus_death` | 擊破（大爆炸、殘骸） | SFX.explode('huge')＋SFX.wreck＋SFX.stinger(true)（配樂的重音） | entities/mech-entity.js:2722、:2723、:2762 | 5 | 2 | Colossal three-in-one combining mech destroyed, chain of internal explosions, collapsing steel and a long rumbling tail |

### NULLIFIER 電磁狩獵機（kind hunter）

| 建議的音效鍵 | 事件 | 目前的聲音 | 觸發處 | 長度（秒） | 變化數 | AI 提示詞草稿 |
|---|---|---|---|---|---|---|
| `boss_nullifier_intro` | 登場（第一次出現在場上：WARNING 橫幅） | 沒有聲音（只有橫幅與 ECHO 的語音） | game/juice.js:546、:547 | 3.5 | 1 | A towering electromagnetic hunter mech powers up and announces itself, deep mechanical boot-up roar, heavy servo whine rising into a booming impact, sci-fi mecha scale |
| `boss_nullifier_loop` | 移動／待機的循環音 | 沒有聲音（一般 AC 的腳步與推進） | entities/mech-boss.js:591（hunterAI） | 6 | 1 | Seamless loop of a massive electromagnetic hunter mech idling and moving, low engine hum, heavy hydraulic creaks, distant metal stress |
| `boss_nullifier_charge_start` | 大招開始蓄力（Boss 改版的打斷量表出現） | SFX.play('alarm', 0.45, 0.7) | entities/mech-boss-tier.js:451 | 2 | 2 | Electromagnetic hunter mech begins charging a super attack, rising electrical whine and deep reactor surge, ominous build-up |
| `boss_nullifier_charge_loop` | 大招蓄力中（量表累積，循環） | 沒有聲音（只有 gather 特效） | entities/mech-boss-tier.js:395 | 4 | 1 | Seamless loop of a giant machine charging energy, pulsing hum with crackling arcs, tension building |
| `boss_nullifier_big_release` | 大招放出（招式名稱的訊息） | SFX.play('alarm', 0.5, 0.9)＋招式各自的聲音 | entities/mech-boss-tier.js:417 | 1.5 | 2 | Electromagnetic hunter mech unleashes its ultimate attack, sharp release blast with a deep sub-bass whoomp, mecha anime style |
| `boss_nullifier_interrupt` | 大招被打斷（長時間失衡） | SFX.stagger | entities/mech-boss-tier.js:511 | 2.5 | 2 | Overloaded electromagnetic hunter mech short-circuits and lurches, power-down whine, sparking crackle and heavy metal clank |
| `boss_nullifier_stagger` | 失衡（BREAK） | SFX.stagger＋打出者的 SFX.breakFx／stinger | entities/mech-entity.js:1732、game/feedback.js:332、:336 | 1.8 | 3 | Electromagnetic hunter mech staggers off balance, groaning metal, hydraulic hiss and a heavy clunk |
| `boss_nullifier_open` | 破綻（金色光環、傷害加倍） | SFX.play('bell', 0.6, 1.3) | entities/mech-boss-tier.js:328 | 1.2 | 1 | Exposed weak point on a electromagnetic hunter mech, armor plates unlatching with a hiss and a bright metallic ping |
| `boss_nullifier_shell_on` | 裝甲殼長出（刁鑽度 5 起的型態閘門） | SFX.play('bell', 0.5, 0.7) | entities/mech-boss-tier.js:219 | 1.5 | 1 | Heavy armor shell clamps over a electromagnetic hunter mech, interlocking plates slamming shut with a resonant clang |
| `boss_nullifier_shell_break` | 裝甲殼打開（部位破壞、打斷、破綻、時間到） | SFX.stagger | entities/mech-boss-tier.js:246 | 1.5 | 1 | Armor shell bursts open on a electromagnetic hunter mech, explosive bolts popping and plates crashing to the ground |
| `boss_nullifier_phase` | 換型態（第二、第三型態：短暫無敵＋衝擊波） | SFX.cue('phase')＋衝擊波的 SFX.explode(true) | game/feedback.js:265、game/bosses.js:237（→ fx/effects.js:1817） | 3 | 2 | Electromagnetic hunter mech transforms into a more dangerous form, mechanical reconfiguration, power surge and a booming shockwave |
| `boss_nullifier_enrage` | 狂暴化（開打 6 分鐘、雙機的一台倒下） | 沒有聲音 | game/bosses.js:194、:206 | 2.5 | 1 | Electromagnetic hunter mech goes berserk, reactor overdrive scream, red alert warble and violent engine roar |
| `boss_nullifier_final_call` | 最終型態專屬招式「電磁風暴」的宣告（沒有刁鑽度時） | SFX.play('alarm', 0.5, 0.9) | entities/mech-boss3.js:104 | 1.5 | 1 | Short ominous warning call before a electromagnetic hunter mech's final special move, low siren with mechanical chatter |
| `boss_nullifier_part_break` | Boss 改版的部位被打壞（EMP 線圈、牽引錨、背部電容） | SFX.explode(true)＋SFX.wreck（部位本身被擊破；tierPartDown 沒有額外聲音） | entities/mech-entity.js:2722、:2723；game/boss-tier.js:252 | 2 | 3 | A mounted component on a electromagnetic hunter mech is blown off, sharp explosion, tearing metal and scattering debris |
| `boss_nullifier_body_break` | 身體部位破壞（頭部、右臂、左臂、腿部；之後冒煙起火） | SFX.explode(false)（之後的冒煙與火無聲） | entities/mech-body.js:147、:266 | 2 | 3 | Armor section of a electromagnetic hunter mech shatters, crunchy metal rupture with a burst of flame and sparks |
| `boss_nullifier_reflect` | 打回去（玩家打掉金色彈體、飛回去） | SFX.play('shield', 0.9, 1.4) | entities/mech-boss-tier.js:821 | 0.8 | 2 | Projectile deflected back toward a electromagnetic hunter mech, bright energy ricochet ping with a whoosh |
| `boss_nullifier_dodge` | 閃避（QB 側閃／後撤／跳躍，機甲型連續閃避） | SFX.qb（一般的 QB 音；閃避本身沒有額外聲音） | entities/mech-entity.js:3083、entities/mech-dodge.js:299 | 0.8 | 3 | Quick evasive thruster burst of a electromagnetic hunter mech, sharp jet blast with a mechanical whoosh |
| `boss_nullifier_emp_charge` | EMP 充能（停下、藍色預警圈） | SFX.play('charge', 1, 0.8) | entities/mech-boss.js:613 | 1.5 | 1 | Electromagnetic pulse charging, deep rising hum with crackling static |
| `boss_nullifier_emp` | EMP 爆發（封鎖 QB 與懸浮） | SFX.play('overload', 1, 0.8)＋SFX.play('laserBig', 0.7, 0.5) | game/bosses.js:137、:138 | 2 | 2 | Massive EMP blast, electric thunderclap with a wave of static and systems shutting down |
| `boss_nullifier_pull` | 電磁牽引（把目標拉過來） | SFX.play('laser2', 0.8, 0.5) | entities/mech-boss.js:634 | 2 | 1 | Electromagnetic tractor beam locking on, strained magnetic hum pulling metal |
| `boss_nullifier_claw` | 破碎爪近戰 | SFX.meleeSwing／meleeHit | entities/mech-entity.js:1879、:2036 | 1 | 2 | Giant crushing claw snapping shut, heavy hydraulic crunch |
| `boss_nullifier_death` | 擊破（大爆炸、殘骸） | SFX.explode('huge')＋SFX.wreck＋SFX.stinger(true)（配樂的重音） | entities/mech-entity.js:2722、:2723、:2762 | 5 | 2 | Colossal electromagnetic hunter mech destroyed, chain of internal explosions, collapsing steel and a long rumbling tail |

### IRON CITADEL 武裝列車（kind train）

| 建議的音效鍵 | 事件 | 目前的聲音 | 觸發處 | 長度（秒） | 變化數 | AI 提示詞草稿 |
|---|---|---|---|---|---|---|
| `boss_citadel_intro` | 登場（第一次出現在場上：WARNING 橫幅） | 沒有聲音（只有橫幅與 ECHO 的語音） | game/juice.js:546、:547 | 3.5 | 1 | A towering armored war train powers up and announces itself, deep mechanical boot-up roar, heavy servo whine rising into a booming impact, sci-fi mecha scale |
| `boss_citadel_loop` | 列車行駛（鐵軌、蒸汽） | 沒有聲音（推進／懸浮時共用 thrustLoop（game/feedback.js:243）） | entities/mech-boss2.js:324（trainAI） | 6 | 1 | Seamless loop of a massive armored train rolling on rails, rhythmic wheel clacks, steam chuffs and engine roar |
| `boss_citadel_charge_start` | 大招開始蓄力（Boss 改版的打斷量表出現） | SFX.play('alarm', 0.45, 0.7) | entities/mech-boss-tier.js:451 | 2 | 2 | Armored war train begins charging a super attack, rising electrical whine and deep reactor surge, ominous build-up |
| `boss_citadel_charge_loop` | 大招蓄力中（量表累積，循環） | 沒有聲音（只有 gather 特效） | entities/mech-boss-tier.js:395 | 4 | 1 | Seamless loop of a giant machine charging energy, pulsing hum with crackling arcs, tension building |
| `boss_citadel_big_release` | 大招放出（招式名稱的訊息） | SFX.play('alarm', 0.5, 0.9)＋招式各自的聲音 | entities/mech-boss-tier.js:417 | 1.5 | 2 | Armored war train unleashes its ultimate attack, sharp release blast with a deep sub-bass whoomp, mecha anime style |
| `boss_citadel_interrupt` | 大招被打斷（長時間失衡） | SFX.stagger | entities/mech-boss-tier.js:511 | 2.5 | 2 | Overloaded armored war train short-circuits and lurches, power-down whine, sparking crackle and heavy metal clank |
| `boss_citadel_stagger` | 失衡（BREAK） | SFX.stagger＋打出者的 SFX.breakFx／stinger | entities/mech-entity.js:1732、game/feedback.js:332、:336 | 1.8 | 3 | Armored war train staggers off balance, groaning metal, hydraulic hiss and a heavy clunk |
| `boss_citadel_open` | 破綻（金色光環、傷害加倍） | SFX.play('bell', 0.6, 1.3) | entities/mech-boss-tier.js:328 | 1.2 | 1 | Exposed weak point on a armored war train, armor plates unlatching with a hiss and a bright metallic ping |
| `boss_citadel_shell_on` | 裝甲殼長出（刁鑽度 5 起的型態閘門） | SFX.play('bell', 0.5, 0.7) | entities/mech-boss-tier.js:219 | 1.5 | 1 | Heavy armor shell clamps over a armored war train, interlocking plates slamming shut with a resonant clang |
| `boss_citadel_shell_break` | 裝甲殼打開（部位破壞、打斷、破綻、時間到） | SFX.stagger | entities/mech-boss-tier.js:246 | 1.5 | 1 | Armor shell bursts open on a armored war train, explosive bolts popping and plates crashing to the ground |
| `boss_citadel_phase` | 換型態（第二、第三型態：短暫無敵＋衝擊波） | SFX.cue('phase')＋衝擊波的 SFX.explode(true) | game/feedback.js:265、game/bosses.js:237（→ fx/effects.js:1817） | 3 | 2 | Armored war train transforms into a more dangerous form, mechanical reconfiguration, power surge and a booming shockwave |
| `boss_citadel_enrage` | 狂暴化（開打 6 分鐘、雙機的一台倒下） | 沒有聲音 | game/bosses.js:194、:206 | 2.5 | 1 | Armored war train goes berserk, reactor overdrive scream, red alert warble and violent engine roar |
| `boss_citadel_final_call` | 最終型態專屬招式「全車廂砲擊」的宣告（沒有刁鑽度時） | SFX.play('alarm', 0.5, 0.9) | entities/mech-boss3.js:104 | 1.5 | 1 | Short ominous warning call before a armored war train's final special move, low siren with mechanical chatter |
| `boss_citadel_part_break` | Boss 改版的部位被打壞（煙囪閥） | SFX.explode(true)＋SFX.wreck（部位本身被擊破；tierPartDown 沒有額外聲音） | entities/mech-entity.js:2722、:2723；game/boss-tier.js:252 | 2 | 3 | A mounted component on a armored war train is blown off, sharp explosion, tearing metal and scattering debris |
| `boss_citadel_body_break` | 身體部位破壞（排障器、鍋爐外殼；之後冒煙起火） | SFX.explode(false)（之後的冒煙與火無聲） | entities/mech-body.js:147、:266 | 2 | 3 | Armor section of a armored war train shatters, crunchy metal rupture with a burst of flame and sparks |
| `boss_citadel_reflect` | 打回去（玩家打掉金色彈體、飛回去） | SFX.play('shield', 0.9, 1.4) | entities/mech-boss-tier.js:821 | 0.8 | 2 | Projectile deflected back toward a armored war train, bright energy ricochet ping with a whoosh |
| `boss_citadel_guard_up` | 防禦反應（架起六角護盾） | 沒有聲音 | entities/mech-dodge.js:479 | 1 | 1 | A armored train raises a hexagonal energy barrier, electric hum swelling into a shield shimmer |
| `boss_citadel_guard_hit` | 防禦中被打中（護盾亮起） | 沒有聲音（只有一般的命中音） | entities/mech-dodge.js:757 | 0.5 | 3 | Bullets impacting a hexagonal energy shield, crisp energy deflection crackle |
| `boss_citadel_tunnel` | 進出隧道（看不到、打不到） | 沒有聲音 | entities/mech-boss2.js:1601（inTunnel） | 3 | 1 | Train roaring out of a tunnel, echoing rumble bursting into open air |
| `boss_citadel_horn` | 衝撞預警 | SFX.play('heavy', 1, 0.5)＋SFX.alert | entities/mech-boss2.js:368、:369 | 2.5 | 1 | Deafening train horn blast, deep and menacing |
| `boss_citadel_ram` | 全速衝撞 | 沒有聲音 | entities/mech-boss2.js:379 | 3 | 1 | Armored train charging at full speed, thunderous wheels and screaming engine |
| `boss_citadel_overheat` | 鍋爐過熱、減速（弱點） | 沒有聲音（只有訊息） | entities/mech-boss2.js:387～389 | 2.5 | 1 | Locomotive boiler overheating, violent steam release and hissing valves |
| `boss_citadel_car_aa` | 防空車廂（機槍＋高射砲） | SFX.shot('bullet') | entities/mech-boss2.js:476 | 1.5 | 2 | Anti-aircraft flak guns firing from a train car, rapid pops and bursts |
| `boss_citadel_car_missile` | 飛彈車廂 | SFX.shot('missile') | entities/mech-boss2.js:490 | 1.5 | 2 | Missile launcher car firing, rocket whoosh |
| `boss_citadel_car_laser` | 雷射舷砲（預警 0.9 秒後橫向射擊） | SFX.play('laserBig', 0.8, 0.8) | entities/mech-boss2.js:506、:523 | 1.5 | 2 | Broadside laser cannon on a train firing a heavy beam |
| `boss_citadel_car_mine` | 布雷車廂 | 布雷 SFX.play('ui2', 0.5, 1.6)（game/support.js:323）、觸發 ui2（:421／:428）、爆炸 SFX.explode（:474） | entities/mech-boss2.js:528 | 1 | 1 | Mines dropped from a train car onto the tracks, metallic clunks and beeps |
| `boss_citadel_death` | 擊破（大爆炸、殘骸） | SFX.explode('huge')＋SFX.wreck＋SFX.stinger(true)（配樂的重音） | entities/mech-entity.js:2722、:2723、:2762 | 5 | 2 | Colossal armored war train destroyed, chain of internal explosions, collapsing steel and a long rumbling tail |

### LEVIATHAN 空中要塞（kind fortress）

| 建議的音效鍵 | 事件 | 目前的聲音 | 觸發處 | 長度（秒） | 變化數 | AI 提示詞草稿 |
|---|---|---|---|---|---|---|
| `boss_leviathan_intro` | 登場（第一次出現在場上：WARNING 橫幅） | 沒有聲音（只有橫幅與 ECHO 的語音） | game/juice.js:546、:547 | 3.5 | 1 | A towering flying fortress airship powers up and announces itself, deep mechanical boot-up roar, heavy servo whine rising into a booming impact, sci-fi mecha scale |
| `boss_leviathan_loop` | 巨大飛行要塞的引擎循環 | 沒有聲音（推進／懸浮時共用 thrustLoop（game/feedback.js:243）） | entities/mech-boss.js:438（fortressAI） | 6 | 1 | Seamless loop of a gigantic flying fortress overhead, deep droning engines and wind |
| `boss_leviathan_charge_start` | 大招開始蓄力（Boss 改版的打斷量表出現） | SFX.play('alarm', 0.45, 0.7) | entities/mech-boss-tier.js:451 | 2 | 2 | Flying fortress airship begins charging a super attack, rising electrical whine and deep reactor surge, ominous build-up |
| `boss_leviathan_charge_loop` | 大招蓄力中（量表累積，循環） | 沒有聲音（只有 gather 特效） | entities/mech-boss-tier.js:395 | 4 | 1 | Seamless loop of a giant machine charging energy, pulsing hum with crackling arcs, tension building |
| `boss_leviathan_big_release` | 大招放出（招式名稱的訊息） | SFX.play('alarm', 0.5, 0.9)＋招式各自的聲音 | entities/mech-boss-tier.js:417 | 1.5 | 2 | Flying fortress airship unleashes its ultimate attack, sharp release blast with a deep sub-bass whoomp, mecha anime style |
| `boss_leviathan_interrupt` | 大招被打斷（長時間失衡） | SFX.stagger | entities/mech-boss-tier.js:511 | 2.5 | 2 | Overloaded flying fortress airship short-circuits and lurches, power-down whine, sparking crackle and heavy metal clank |
| `boss_leviathan_stagger` | 失衡（BREAK） | SFX.stagger＋打出者的 SFX.breakFx／stinger | entities/mech-entity.js:1732、game/feedback.js:332、:336 | 1.8 | 3 | Flying fortress airship staggers off balance, groaning metal, hydraulic hiss and a heavy clunk |
| `boss_leviathan_open` | 破綻（金色光環、傷害加倍） | SFX.play('bell', 0.6, 1.3) | entities/mech-boss-tier.js:328 | 1.2 | 1 | Exposed weak point on a flying fortress airship, armor plates unlatching with a hiss and a bright metallic ping |
| `boss_leviathan_shell_on` | 裝甲殼長出（刁鑽度 5 起的型態閘門） | SFX.play('bell', 0.5, 0.7) | entities/mech-boss-tier.js:219 | 1.5 | 1 | Heavy armor shell clamps over a flying fortress airship, interlocking plates slamming shut with a resonant clang |
| `boss_leviathan_shell_break` | 裝甲殼打開（部位破壞、打斷、破綻、時間到） | SFX.stagger | entities/mech-boss-tier.js:246 | 1.5 | 1 | Armor shell bursts open on a flying fortress airship, explosive bolts popping and plates crashing to the ground |
| `boss_leviathan_phase` | 換型態（第二、第三型態：短暫無敵＋衝擊波） | SFX.cue('phase')＋衝擊波的 SFX.explode(true) | game/feedback.js:265、game/bosses.js:237（→ fx/effects.js:1817） | 3 | 2 | Flying fortress airship transforms into a more dangerous form, mechanical reconfiguration, power surge and a booming shockwave |
| `boss_leviathan_enrage` | 狂暴化（開打 6 分鐘、雙機的一台倒下） | 沒有聲音 | game/bosses.js:194、:206 | 2.5 | 1 | Flying fortress airship goes berserk, reactor overdrive scream, red alert warble and violent engine roar |
| `boss_leviathan_final_call` | 最終型態專屬招式「全彈發射」的宣告（沒有刁鑽度時） | SFX.play('alarm', 0.5, 0.9) | entities/mech-boss3.js:104 | 1.5 | 1 | Short ominous warning call before a flying fortress airship's final special move, low siren with mechanical chatter |
| `boss_leviathan_part_break` | Boss 改版的部位被打壞（下方砲台） | SFX.explode(true)＋SFX.wreck（部位本身被擊破；tierPartDown 沒有額外聲音） | entities/mech-entity.js:2722、:2723；game/boss-tier.js:252 | 2 | 3 | A mounted component on a flying fortress airship is blown off, sharp explosion, tearing metal and scattering debris |
| `boss_leviathan_body_break` | 身體部位破壞（機腹裝甲、尾翼；之後冒煙起火） | SFX.explode(false)（之後的冒煙與火無聲） | entities/mech-body.js:147、:266 | 2 | 3 | Armor section of a flying fortress airship shatters, crunchy metal rupture with a burst of flame and sparks |
| `boss_leviathan_reflect` | 打回去（玩家打掉金色彈體、飛回去） | SFX.play('shield', 0.9, 1.4) | entities/mech-boss-tier.js:821 | 0.8 | 2 | Projectile deflected back toward a flying fortress airship, bright energy ricochet ping with a whoosh |
| `boss_leviathan_guard_up` | 防禦反應（架起六角護盾） | 沒有聲音 | entities/mech-dodge.js:479 | 1 | 1 | A flying fortress raises a hexagonal energy barrier, electric hum swelling into a shield shimmer |
| `boss_leviathan_guard_hit` | 防禦中被打中（護盾亮起） | 沒有聲音（只有一般的命中音） | entities/mech-dodge.js:757 | 0.5 | 3 | Bullets impacting a hexagonal energy shield, crisp energy deflection crackle |
| `boss_leviathan_turret` | 懸吊砲塔開火 | SFX.shot('bullet') | entities/mech-boss.js:187（partAI fturret） | 1.5 | 2 | Hanging gun turret firing from a flying fortress, rapid autocannon bursts |
| `boss_leviathan_drop` | 投放運輸機與無人機群 | 沒有聲音（運輸機自己的聲音另計） | entities/mech-boss.js:461、:475 | 2 | 1 | Hangar bay opening in an airship, drones launching with buzzing rotors |
| `boss_leviathan_bomb` | 投彈（一排落點） | 發射 SFX.shot('grenade')（game/support.js:165）＋落地 SFX.explode（entities/projectile.js:303）；預警圈無聲；開始時 SFX.alert | entities/mech-boss.js:479～500 | 3 | 2 | Bomb bay doors opening and a string of bombs whistling down into explosions |
| `boss_leviathan_engine_lost` | 引擎全毀、下降到 10 m（破綻） | 沒有聲音 | entities/mech-boss.js:445～449 | 3.5 | 1 | Airship engines failing, groaning hull and sinking rumble |
| `boss_leviathan_air_main_charge` | 空域：主砲預警線 | 沒有聲音 | entities/mech-air.js:712 | 1.5 | 1 | Main cannon of a flying fortress charging, deep rising energy tone |
| `boss_leviathan_air_main_fire` | 空域：主砲光束 | SFX.play('laser2', 1, 0.5) | entities/mech-air.js:700 | 2.5 | 2 | Enormous beam cannon firing from an airship, thunderous energy blast |
| `boss_leviathan_air_barrage` | 空域：慢速大顆彈幕 | SFX.shot('shell', 'air_cannon') | entities/mech-air.js:753 | 1 | 2 | Heavy flak cannon firing large slow shells, deep thumps |
| `boss_leviathan_air_sam` | 空域：空戰導彈 | SFX.shot('missile') | entities/mech-air.js:362、:677 | 1.5 | 2 | Air-to-air missile launch from a fortress, sharp whoosh |
| `boss_leviathan_death` | 擊破（大爆炸、殘骸） | SFX.explode('huge')＋SFX.wreck＋SFX.stinger(true)（配樂的重音） | entities/mech-entity.js:2722、:2723、:2762 | 5 | 2 | Colossal flying fortress airship destroyed, chain of internal explosions, collapsing steel and a long rumbling tail |

### PULSAR 脈衝刃翼（kind ibis）

| 建議的音效鍵 | 事件 | 目前的聲音 | 觸發處 | 長度（秒） | 變化數 | AI 提示詞草稿 |
|---|---|---|---|---|---|---|
| `boss_pulsar_intro` | 登場（第一次出現在場上：WARNING 橫幅） | 沒有聲音（只有橫幅與 ECHO 的語音） | game/juice.js:546、:547 | 3.5 | 1 | A towering pulse blade-wing mech powers up and announces itself, deep mechanical boot-up roar, heavy servo whine rising into a booming impact, sci-fi mecha scale |
| `boss_pulsar_loop` | 刃翼的振動與推進循環 | 沒有聲音（推進／懸浮時共用 thrustLoop（game/feedback.js:243）） | entities/mech-boss2.js:1291（ibisAI） | 6 | 1 | Seamless loop of a hovering mech with vibrating energy wings, high resonant hum and soft thruster |
| `boss_pulsar_charge_start` | 大招開始蓄力（Boss 改版的打斷量表出現） | SFX.play('alarm', 0.45, 0.7) | entities/mech-boss-tier.js:451 | 2 | 2 | Pulse blade-wing mech begins charging a super attack, rising electrical whine and deep reactor surge, ominous build-up |
| `boss_pulsar_charge_loop` | 大招蓄力中（量表累積，循環） | 沒有聲音（只有 gather 特效） | entities/mech-boss-tier.js:395 | 4 | 1 | Seamless loop of a giant machine charging energy, pulsing hum with crackling arcs, tension building |
| `boss_pulsar_big_release` | 大招放出（招式名稱的訊息） | SFX.play('alarm', 0.5, 0.9)＋招式各自的聲音 | entities/mech-boss-tier.js:417 | 1.5 | 2 | Pulse blade-wing mech unleashes its ultimate attack, sharp release blast with a deep sub-bass whoomp, mecha anime style |
| `boss_pulsar_interrupt` | 大招被打斷（長時間失衡） | SFX.stagger | entities/mech-boss-tier.js:511 | 2.5 | 2 | Overloaded pulse blade-wing mech short-circuits and lurches, power-down whine, sparking crackle and heavy metal clank |
| `boss_pulsar_stagger` | 失衡（BREAK） | SFX.stagger＋打出者的 SFX.breakFx／stinger | entities/mech-entity.js:1732、game/feedback.js:332、:336 | 1.8 | 3 | Pulse blade-wing mech staggers off balance, groaning metal, hydraulic hiss and a heavy clunk |
| `boss_pulsar_open` | 破綻（金色光環、傷害加倍） | SFX.play('bell', 0.6, 1.3) | entities/mech-boss-tier.js:328 | 1.2 | 1 | Exposed weak point on a pulse blade-wing mech, armor plates unlatching with a hiss and a bright metallic ping |
| `boss_pulsar_shell_on` | 裝甲殼長出（刁鑽度 5 起的型態閘門） | SFX.play('bell', 0.5, 0.7) | entities/mech-boss-tier.js:219 | 1.5 | 1 | Heavy armor shell clamps over a pulse blade-wing mech, interlocking plates slamming shut with a resonant clang |
| `boss_pulsar_shell_break` | 裝甲殼打開（部位破壞、打斷、破綻、時間到） | SFX.stagger | entities/mech-boss-tier.js:246 | 1.5 | 1 | Armor shell bursts open on a pulse blade-wing mech, explosive bolts popping and plates crashing to the ground |
| `boss_pulsar_phase` | 換型態（第二、第三型態：短暫無敵＋衝擊波） | SFX.cue('phase')＋衝擊波的 SFX.explode(true) | game/feedback.js:265、game/bosses.js:237（→ fx/effects.js:1817） | 3 | 2 | Pulse blade-wing mech transforms into a more dangerous form, mechanical reconfiguration, power surge and a booming shockwave |
| `boss_pulsar_enrage` | 狂暴化（開打 6 分鐘、雙機的一台倒下） | 沒有聲音 | game/bosses.js:194、:206 | 2.5 | 1 | Pulse blade-wing mech goes berserk, reactor overdrive scream, red alert warble and violent engine roar |
| `boss_pulsar_final_call` | 最終型態專屬招式「雙環」的宣告（沒有刁鑽度時） | SFX.play('alarm', 0.5, 0.9) | entities/mech-boss3.js:104 | 1.5 | 1 | Short ominous warning call before a pulse blade-wing mech's final special move, low siren with mechanical chatter |
| `boss_pulsar_part_break` | Boss 改版的部位被打壞（左翼刃、右翼刃、環發生器） | SFX.explode(true)＋SFX.wreck（部位本身被擊破；tierPartDown 沒有額外聲音） | entities/mech-entity.js:2722、:2723；game/boss-tier.js:252 | 2 | 3 | A mounted component on a pulse blade-wing mech is blown off, sharp explosion, tearing metal and scattering debris |
| `boss_pulsar_body_break` | 身體部位破壞（背部推進器、頭部；之後冒煙起火） | SFX.explode(false)（之後的冒煙與火無聲） | entities/mech-body.js:147、:266 | 2 | 3 | Armor section of a pulse blade-wing mech shatters, crunchy metal rupture with a burst of flame and sparks |
| `boss_pulsar_reflect` | 打回去（玩家打掉金色彈體、飛回去） | SFX.play('shield', 0.9, 1.4) | entities/mech-boss-tier.js:821 | 0.8 | 2 | Projectile deflected back toward a pulse blade-wing mech, bright energy ricochet ping with a whoosh |
| `boss_pulsar_dodge` | 閃避（傾斜／橫滾） | SFX.qb | entities/mech-entity.js:3083、data/dodge.js:100 | 0.8 | 2 | Agile winged mech banking quickly, energy wing flutter and thrust |
| `boss_pulsar_ring_charge` | 脈衝環充能 | SFX.play('charge', 1, 0.9)＋SFX.alert | entities/mech-boss2.js:1322、:1325 | 1.5 | 1 | Pulse ring charging, oscillating energy rising in pitch |
| `boss_pulsar_ring` | 擴散能量環 | SFX.play('laserBig', 0.8, 1.4)（game/bosses2.js:216） | entities/mech-boss2.js:1342（game/bosses2.js:216） | 2 | 2 | Expanding energy ring pulse, resonant whoom spreading outward |
| `boss_pulsar_fan` | 雷射扇形 | SFX.play('laserBig', 0.8, 1.1) | entities/mech-boss2.js:1363、:1377 | 1.5 | 2 | Fan of lasers firing from wings, rapid layered energy beams |
| `boss_pulsar_dash` | 直線突刺 | 沒有聲音（預警路線無聲） | entities/mech-boss2.js:1393 | 1.5 | 2 | Blade-wing mech dashing in a straight line, piercing whoosh and energy streak |
| `boss_pulsar_overheat` | 突刺之後過熱（破綻） | 沒有聲音 | entities/mech-boss2.js:1401～1430（dashing 之後） | 2 | 1 | Overheated energy wings sizzling and venting, crackle and hiss |
| `boss_pulsar_death` | 擊破（大爆炸、殘骸） | SFX.explode('huge')＋SFX.wreck＋SFX.stinger(true)（配樂的重音） | entities/mech-entity.js:2722、:2723、:2762 | 5 | 2 | Colossal pulse blade-wing mech destroyed, chain of internal explosions, collapsing steel and a long rumbling tail |

### ANVIL 鍛造巨人（kind anvil）

| 建議的音效鍵 | 事件 | 目前的聲音 | 觸發處 | 長度（秒） | 變化數 | AI 提示詞草稿 |
|---|---|---|---|---|---|---|
| `boss_anvil_intro` | 登場（第一次出現在場上：WARNING 橫幅） | 沒有聲音（只有橫幅與 ECHO 的語音） | game/juice.js:546、:547 | 3.5 | 1 | A towering giant forge hammer titan powers up and announces itself, deep mechanical boot-up roar, heavy servo whine rising into a booming impact, sci-fi mecha scale |
| `boss_anvil_loop` | 鼓風爐與沉重的腳步 | 沒有聲音（推進／懸浮時共用 thrustLoop（game/feedback.js:243）） | entities/mech-boss4.js:140（anvilAI） | 6 | 1 | Seamless loop of a giant forge titan, roaring bellows furnace, heavy stomps and clinking metal |
| `boss_anvil_charge_start` | 大招開始蓄力（Boss 改版的打斷量表出現） | SFX.play('alarm', 0.45, 0.7) | entities/mech-boss-tier.js:451 | 2 | 2 | Giant forge hammer titan begins charging a super attack, rising electrical whine and deep reactor surge, ominous build-up |
| `boss_anvil_charge_loop` | 大招蓄力中（量表累積，循環） | 沒有聲音（只有 gather 特效） | entities/mech-boss-tier.js:395 | 4 | 1 | Seamless loop of a giant machine charging energy, pulsing hum with crackling arcs, tension building |
| `boss_anvil_big_release` | 大招放出（招式名稱的訊息） | SFX.play('alarm', 0.5, 0.9)＋招式各自的聲音 | entities/mech-boss-tier.js:417 | 1.5 | 2 | Giant forge hammer titan unleashes its ultimate attack, sharp release blast with a deep sub-bass whoomp, mecha anime style |
| `boss_anvil_interrupt` | 大招被打斷（長時間失衡） | SFX.stagger | entities/mech-boss-tier.js:511 | 2.5 | 2 | Overloaded giant forge hammer titan short-circuits and lurches, power-down whine, sparking crackle and heavy metal clank |
| `boss_anvil_stagger` | 失衡（BREAK） | SFX.stagger＋打出者的 SFX.breakFx／stinger | entities/mech-entity.js:1732、game/feedback.js:332、:336 | 1.8 | 3 | Giant forge hammer titan staggers off balance, groaning metal, hydraulic hiss and a heavy clunk |
| `boss_anvil_open` | 破綻（金色光環、傷害加倍） | SFX.play('bell', 0.6, 1.3) | entities/mech-boss-tier.js:328 | 1.2 | 1 | Exposed weak point on a giant forge hammer titan, armor plates unlatching with a hiss and a bright metallic ping |
| `boss_anvil_shell_on` | 裝甲殼長出（刁鑽度 5 起的型態閘門） | SFX.play('bell', 0.5, 0.7) | entities/mech-boss-tier.js:219 | 1.5 | 1 | Heavy armor shell clamps over a giant forge hammer titan, interlocking plates slamming shut with a resonant clang |
| `boss_anvil_shell_break` | 裝甲殼打開（部位破壞、打斷、破綻、時間到） | SFX.stagger | entities/mech-boss-tier.js:246 | 1.5 | 1 | Armor shell bursts open on a giant forge hammer titan, explosive bolts popping and plates crashing to the ground |
| `boss_anvil_phase` | 換型態（第二、第三型態：短暫無敵＋衝擊波） | SFX.cue('phase')＋衝擊波的 SFX.explode(true) | game/feedback.js:265、game/bosses.js:237（→ fx/effects.js:1817） | 3 | 2 | Giant forge hammer titan transforms into a more dangerous form, mechanical reconfiguration, power surge and a booming shockwave |
| `boss_anvil_enrage` | 狂暴化（開打 6 分鐘、雙機的一台倒下） | 沒有聲音 | game/bosses.js:194、:206 | 2.5 | 1 | Giant forge hammer titan goes berserk, reactor overdrive scream, red alert warble and violent engine roar |
| `boss_anvil_final_call` | 最終型態專屬招式「鍛造連打」的宣告（沒有刁鑽度時） | SFX.play('alarm', 0.5, 0.9) | entities/mech-boss3.js:104 | 1.5 | 1 | Short ominous warning call before a giant forge hammer titan's final special move, low siren with mechanical chatter |
| `boss_anvil_part_break` | Boss 改版的部位被打壞（冷卻槽、鼓風爐） | SFX.explode(true)＋SFX.wreck（部位本身被擊破；tierPartDown 沒有額外聲音） | entities/mech-entity.js:2722、:2723；game/boss-tier.js:252 | 2 | 3 | A mounted component on a giant forge hammer titan is blown off, sharp explosion, tearing metal and scattering debris |
| `boss_anvil_body_break` | 身體部位破壞（上身裝甲、下身裝甲；之後冒煙起火） | SFX.explode(false)（之後的冒煙與火無聲） | entities/mech-body.js:147、:266 | 2 | 3 | Armor section of a giant forge hammer titan shatters, crunchy metal rupture with a burst of flame and sparks |
| `boss_anvil_reflect` | 打回去（玩家打掉金色彈體、飛回去） | SFX.play('shield', 0.9, 1.4) | entities/mech-boss-tier.js:821 | 0.8 | 2 | Projectile deflected back toward a giant forge hammer titan, bright energy ricochet ping with a whoosh |
| `boss_anvil_guard_up` | 防禦反應（架起六角護盾） | 沒有聲音 | entities/mech-dodge.js:479 | 1 | 1 | A forge titan raises a hexagonal energy barrier, electric hum swelling into a shield shimmer |
| `boss_anvil_guard_hit` | 防禦中被打中（護盾亮起） | 沒有聲音（只有一般的命中音） | entities/mech-dodge.js:757 | 0.5 | 3 | Bullets impacting a hexagonal energy shield, crisp energy deflection crackle |
| `boss_anvil_raise` | 舉鎚預警 | SFX.play('heavy', 0.9, 0.6) | entities/mech-boss4.js:188 | 1.5 | 1 | Massive hammer being raised, straining hydraulics and chains |
| `boss_anvil_slam` | 鎚擊落地（爆炸＋衝擊波） | SFX.explode(true) | entities/mech-boss4.js:273 | 2.5 | 3 | Gigantic forge hammer smashing the ground, metallic clang with explosive impact and sparks |
| `boss_anvil_fissure` | 熔岩裂地（本體到落點之間） | 沒有聲音（addPool 無聲） | entities/mech-boss4.js:196 | 2 | 1 | Ground cracking open with lava, sizzling magma and crumbling rock |
| `boss_anvil_chain` | 第三型態：連續鎚擊沿直線推進 | SFX.alert（每一下 SFX.explode） | entities/mech-boss4.js:213～220 | 3 | 1 | Rapid sequence of hammer strikes marching forward, repeating clangs |
| `boss_anvil_molten_rain` | 熔鐵雨 | SFX.play('heavy', 0.8, 0.8)＋發射 SFX.shot('grenade')（game/support.js:165）＋落地 SFX.explode（entities/projectile.js:303）；預警圈無聲 | entities/mech-boss4.js:239、:241 | 2.5 | 2 | Molten metal flung into the air and splattering down, sizzling impacts |
| `boss_anvil_quench` | 淬火（減傷） | SFX.play('heavy', 0.9, 0.8)＋SFX.alert | entities/mech-boss4.js:257、:258 | 2.5 | 1 | Red-hot metal being quenched, explosive steam hiss and crackling |
| `boss_anvil_stuck` | 鎚子卡在地上（破綻） | 沒有聲音 | entities/mech-boss4.js:277～283 | 2 | 1 | Huge hammer stuck in the ground, grinding struggle and creaking metal |
| `boss_anvil_death` | 擊破（大爆炸、殘骸） | SFX.explode('huge')＋SFX.wreck＋SFX.stinger(true)（配樂的重音） | entities/mech-entity.js:2722、:2723、:2762 | 5 | 2 | Colossal giant forge hammer titan destroyed, chain of internal explosions, collapsing steel and a long rumbling tail |

### SALAMANDER 熔岩潛龍（kind salamander）

| 建議的音效鍵 | 事件 | 目前的聲音 | 觸發處 | 長度（秒） | 變化數 | AI 提示詞草稿 |
|---|---|---|---|---|---|---|
| `boss_salamander_intro` | 登場（第一次出現在場上：WARNING 橫幅） | 沒有聲音（只有橫幅與 ECHO 的語音） | game/juice.js:546、:547 | 3.5 | 1 | A towering lava-diving dragon machine powers up and announces itself, deep mechanical boot-up roar, heavy servo whine rising into a booming impact, sci-fi mecha scale |
| `boss_salamander_loop` | 潛在熔岩裡移動的循環 | 沒有聲音（推進／懸浮時共用 thrustLoop（game/feedback.js:243）） | entities/mech-boss4.js:302 | 6 | 1 | Seamless loop of a creature swimming through magma, bubbling lava and low churning rumble |
| `boss_salamander_charge_start` | 大招開始蓄力（Boss 改版的打斷量表出現） | SFX.play('alarm', 0.45, 0.7) | entities/mech-boss-tier.js:451 | 2 | 2 | Lava-diving dragon machine begins charging a super attack, rising electrical whine and deep reactor surge, ominous build-up |
| `boss_salamander_charge_loop` | 大招蓄力中（量表累積，循環） | 沒有聲音（只有 gather 特效） | entities/mech-boss-tier.js:395 | 4 | 1 | Seamless loop of a giant machine charging energy, pulsing hum with crackling arcs, tension building |
| `boss_salamander_big_release` | 大招放出（招式名稱的訊息） | SFX.play('alarm', 0.5, 0.9)＋招式各自的聲音 | entities/mech-boss-tier.js:417 | 1.5 | 2 | Lava-diving dragon machine unleashes its ultimate attack, sharp release blast with a deep sub-bass whoomp, mecha anime style |
| `boss_salamander_interrupt` | 大招被打斷（長時間失衡） | SFX.stagger | entities/mech-boss-tier.js:511 | 2.5 | 2 | Overloaded lava-diving dragon machine short-circuits and lurches, power-down whine, sparking crackle and heavy metal clank |
| `boss_salamander_stagger` | 失衡（BREAK） | SFX.stagger＋打出者的 SFX.breakFx／stinger | entities/mech-entity.js:1732、game/feedback.js:332、:336 | 1.8 | 3 | Lava-diving dragon machine staggers off balance, groaning metal, hydraulic hiss and a heavy clunk |
| `boss_salamander_open` | 破綻（金色光環、傷害加倍） | SFX.play('bell', 0.6, 1.3) | entities/mech-boss-tier.js:328 | 1.2 | 1 | Exposed weak point on a lava-diving dragon machine, armor plates unlatching with a hiss and a bright metallic ping |
| `boss_salamander_shell_on` | 裝甲殼長出（刁鑽度 5 起的型態閘門） | SFX.play('bell', 0.5, 0.7) | entities/mech-boss-tier.js:219 | 1.5 | 1 | Heavy armor shell clamps over a lava-diving dragon machine, interlocking plates slamming shut with a resonant clang |
| `boss_salamander_shell_break` | 裝甲殼打開（部位破壞、打斷、破綻、時間到） | SFX.stagger | entities/mech-boss-tier.js:246 | 1.5 | 1 | Armor shell bursts open on a lava-diving dragon machine, explosive bolts popping and plates crashing to the ground |
| `boss_salamander_phase` | 換型態（第二、第三型態：短暫無敵＋衝擊波） | SFX.cue('phase')＋衝擊波的 SFX.explode(true) | game/feedback.js:265、game/bosses.js:237（→ fx/effects.js:1817） | 3 | 2 | Lava-diving dragon machine transforms into a more dangerous form, mechanical reconfiguration, power surge and a booming shockwave |
| `boss_salamander_enrage` | 狂暴化（開打 6 分鐘、雙機的一台倒下） | 沒有聲音 | game/bosses.js:194、:206 | 2.5 | 1 | Lava-diving dragon machine goes berserk, reactor overdrive scream, red alert warble and violent engine roar |
| `boss_salamander_final_call` | 最終型態專屬招式「熔岩奔流」的宣告（沒有刁鑽度時） | SFX.play('alarm', 0.5, 0.9) | entities/mech-boss3.js:104 | 1.5 | 1 | Short ominous warning call before a lava-diving dragon machine's final special move, low siren with mechanical chatter |
| `boss_salamander_part_break` | Boss 改版的部位被打壞（噴火口、背鰭散熱片） | SFX.explode(true)＋SFX.wreck（部位本身被擊破；tierPartDown 沒有額外聲音） | entities/mech-entity.js:2722、:2723；game/boss-tier.js:252 | 2 | 3 | A mounted component on a lava-diving dragon machine is blown off, sharp explosion, tearing metal and scattering debris |
| `boss_salamander_body_break` | 身體部位破壞（頭部、尾巴；之後冒煙起火） | SFX.explode(false)（之後的冒煙與火無聲） | entities/mech-body.js:147、:266 | 2 | 3 | Armor section of a lava-diving dragon machine shatters, crunchy metal rupture with a burst of flame and sparks |
| `boss_salamander_reflect` | 打回去（玩家打掉金色彈體、飛回去） | SFX.play('shield', 0.9, 1.4) | entities/mech-boss-tier.js:821 | 0.8 | 2 | Projectile deflected back toward a lava-diving dragon machine, bright energy ricochet ping with a whoosh |
| `boss_salamander_guard_up` | 防禦反應（架起六角護盾） | 沒有聲音 | entities/mech-dodge.js:479 | 1 | 1 | A lava dragon machine raises a hexagonal energy barrier, electric hum swelling into a shield shimmer |
| `boss_salamander_guard_hit` | 防禦中被打中（護盾亮起） | 沒有聲音（只有一般的命中音） | entities/mech-dodge.js:757 | 0.5 | 3 | Bullets impacting a hexagonal energy shield, crisp energy deflection crackle |
| `boss_salamander_emerge_warn` | 鑽出前的火光 | SFX.play('heavy', 0.9, 0.7) | entities/mech-boss4.js:314、:315 | 1.5 | 1 | Glowing lava bubbling up before an eruption, deep rumble |
| `boss_salamander_emerge` | 鑽出（爆炸＋燃燒地面） | SFX.explode(true) | entities/mech-boss4.js:329、:330 | 2.5 | 2 | Mechanical dragon bursting out of lava, explosive magma splash and roar |
| `boss_salamander_roar` | 浮出時的吼聲（機械龍） | 沒有聲音 | entities/mech-boss4.js:336 | 2 | 2 | Metallic dragon roar, grinding mechanical growl with fiery breath |
| `boss_salamander_tail` | 甩尾（衝擊波） | 預警無聲；擴散開始時 SFX.explode(true)（fx/effects.js:1817） | entities/mech-boss4.js:352 | 1.5 | 2 | Heavy tail sweep, whooshing swing and ground impact |
| `boss_salamander_breath` | 噴火 | 沒有聲音（flameCone 無聲） | entities/mech-boss4.js:378 | 2.5 | 2 | Dragon machine breathing fire, roaring flame jet |
| `boss_salamander_strand` | 擱淺（失衡、破綻） | 沒有聲音 | entities/mech-boss4.js:336～340 | 2 | 1 | Cooling dragon machine thrashing on the ground, crackling cooling rock and hiss |
| `boss_salamander_dive` | 潛回熔岩 | SFX.play('heavy', 0.8, 0.9) | entities/mech-boss4.js:395、:396 | 1.5 | 1 | Dragon diving back into lava, heavy molten splash |
| `boss_salamander_death` | 擊破（大爆炸、殘骸） | SFX.explode('huge')＋SFX.wreck＋SFX.stinger(true)（配樂的重音） | entities/mech-entity.js:2722、:2723、:2762 | 5 | 2 | Colossal lava-diving dragon machine destroyed, chain of internal explosions, collapsing steel and a long rumbling tail |

### GANTRY 船塢起重要塞（kind gantry）

| 建議的音效鍵 | 事件 | 目前的聲音 | 觸發處 | 長度（秒） | 變化數 | AI 提示詞草稿 |
|---|---|---|---|---|---|---|
| `boss_gantry_intro` | 登場（第一次出現在場上：WARNING 橫幅） | 沒有聲音（只有橫幅與 ECHO 的語音） | game/juice.js:546、:547 | 3.5 | 1 | A towering dockyard gantry crane fortress powers up and announces itself, deep mechanical boot-up roar, heavy servo whine rising into a booming impact, sci-fi mecha scale |
| `boss_gantry_loop` | 橫梁與吊車沿軌道移動 | 沒有聲音（推進／懸浮時共用 thrustLoop（game/feedback.js:243）） | entities/mech-boss4.js:416 | 6 | 1 | Seamless loop of a giant gantry crane moving on rails, rumbling wheels, creaking steel and motor hum |
| `boss_gantry_charge_start` | 大招開始蓄力（Boss 改版的打斷量表出現） | SFX.play('alarm', 0.45, 0.7) | entities/mech-boss-tier.js:451 | 2 | 2 | Dockyard gantry crane fortress begins charging a super attack, rising electrical whine and deep reactor surge, ominous build-up |
| `boss_gantry_charge_loop` | 大招蓄力中（量表累積，循環） | 沒有聲音（只有 gather 特效） | entities/mech-boss-tier.js:395 | 4 | 1 | Seamless loop of a giant machine charging energy, pulsing hum with crackling arcs, tension building |
| `boss_gantry_big_release` | 大招放出（招式名稱的訊息） | SFX.play('alarm', 0.5, 0.9)＋招式各自的聲音 | entities/mech-boss-tier.js:417 | 1.5 | 2 | Dockyard gantry crane fortress unleashes its ultimate attack, sharp release blast with a deep sub-bass whoomp, mecha anime style |
| `boss_gantry_interrupt` | 大招被打斷（長時間失衡） | SFX.stagger | entities/mech-boss-tier.js:511 | 2.5 | 2 | Overloaded dockyard gantry crane fortress short-circuits and lurches, power-down whine, sparking crackle and heavy metal clank |
| `boss_gantry_stagger` | 失衡（BREAK） | SFX.stagger＋打出者的 SFX.breakFx／stinger | entities/mech-entity.js:1732、game/feedback.js:332、:336 | 1.8 | 3 | Dockyard gantry crane fortress staggers off balance, groaning metal, hydraulic hiss and a heavy clunk |
| `boss_gantry_open` | 破綻（金色光環、傷害加倍） | SFX.play('bell', 0.6, 1.3) | entities/mech-boss-tier.js:328 | 1.2 | 1 | Exposed weak point on a dockyard gantry crane fortress, armor plates unlatching with a hiss and a bright metallic ping |
| `boss_gantry_shell_on` | 裝甲殼長出（刁鑽度 5 起的型態閘門） | SFX.play('bell', 0.5, 0.7) | entities/mech-boss-tier.js:219 | 1.5 | 1 | Heavy armor shell clamps over a dockyard gantry crane fortress, interlocking plates slamming shut with a resonant clang |
| `boss_gantry_shell_break` | 裝甲殼打開（部位破壞、打斷、破綻、時間到） | SFX.stagger | entities/mech-boss-tier.js:246 | 1.5 | 1 | Armor shell bursts open on a dockyard gantry crane fortress, explosive bolts popping and plates crashing to the ground |
| `boss_gantry_phase` | 換型態（第二、第三型態：短暫無敵＋衝擊波） | SFX.cue('phase')＋衝擊波的 SFX.explode(true) | game/feedback.js:265、game/bosses.js:237（→ fx/effects.js:1817） | 3 | 2 | Dockyard gantry crane fortress transforms into a more dangerous form, mechanical reconfiguration, power surge and a booming shockwave |
| `boss_gantry_enrage` | 狂暴化（開打 6 分鐘、雙機的一台倒下） | 沒有聲音 | game/bosses.js:194、:206 | 2.5 | 1 | Dockyard gantry crane fortress goes berserk, reactor overdrive scream, red alert warble and violent engine roar |
| `boss_gantry_final_call` | 最終型態專屬招式「全面卸貨」的宣告（沒有刁鑽度時） | SFX.play('alarm', 0.5, 0.9) | entities/mech-boss3.js:104 | 1.5 | 1 | Short ominous warning call before a dockyard gantry crane fortress's final special move, low siren with mechanical chatter |
| `boss_gantry_part_break` | Boss 改版的部位被打壞（左腳輪、右腳輪、電磁鐵） | SFX.explode(true)＋SFX.wreck（部位本身被擊破；tierPartDown 沒有額外聲音） | entities/mech-entity.js:2722、:2723；game/boss-tier.js:252 | 2 | 3 | A mounted component on a dockyard gantry crane fortress is blown off, sharp explosion, tearing metal and scattering debris |
| `boss_gantry_body_break` | 身體部位破壞（橫樑、左門架、右門架；之後冒煙起火） | SFX.explode(false)（之後的冒煙與火無聲） | entities/mech-body.js:147、:266 | 2 | 3 | Armor section of a dockyard gantry crane fortress shatters, crunchy metal rupture with a burst of flame and sparks |
| `boss_gantry_reflect` | 打回去（玩家打掉金色彈體、飛回去） | SFX.play('shield', 0.9, 1.4) | entities/mech-boss-tier.js:821 | 0.8 | 2 | Projectile deflected back toward a dockyard gantry crane fortress, bright energy ricochet ping with a whoosh |
| `boss_gantry_guard_up` | 防禦反應（架起六角護盾） | 沒有聲音 | entities/mech-dodge.js:479 | 1 | 1 | A gantry crane fortress raises a hexagonal energy barrier, electric hum swelling into a shield shimmer |
| `boss_gantry_guard_hit` | 防禦中被打中（護盾亮起） | 沒有聲音（只有一般的命中音） | entities/mech-dodge.js:757 | 0.5 | 3 | Bullets impacting a hexagonal energy shield, crisp energy deflection crackle |
| `boss_gantry_drop_warn` | 貨櫃落下預警 | SFX.play('heavy', 0.9, 0.5) | entities/mech-boss4.js:451、:452 | 1.5 | 1 | Crane releasing its load, magnetic clamp unlatching with a heavy clunk |
| `boss_gantry_crate_impact` | 貨櫃落地（爆炸、留下掩體） | SFX.explode(true) | entities/mech-boss4.js:457、:458 | 2 | 3 | Shipping container slamming onto concrete, huge metallic crash |
| `boss_gantry_rehoist` | 貨櫃重新吊上來 | 沒有聲音 | entities/mech-boss4.js:429 | 2.5 | 1 | Crane hoisting a container, winch motors whining and chains rattling |
| `boss_gantry_magnet_pull` | 電磁鐵吸引 | SFX.play('charge', 0.8, 0.6)＋SFX.alert | entities/mech-boss4.js:492、:494 | 2 | 1 | Powerful electromagnet activating, deep magnetic hum pulling metal |
| `boss_gantry_magnet_shock` | 電磁衝擊 | SFX.explode(true) | entities/mech-boss4.js:517～523 | 1.5 | 2 | Electromagnetic shockwave, electric boom and crackle |
| `boss_gantry_overheat` | 電磁鐵過熱（破綻） | 沒有聲音（火花無聲） | entities/mech-boss4.js:474、:479 | 2 | 1 | Overheated electromagnet sparking and buzzing erratically |
| `boss_gantry_death` | 擊破（大爆炸、殘骸） | SFX.explode('huge')＋SFX.wreck＋SFX.stinger(true)（配樂的重音） | entities/mech-entity.js:2722、:2723、:2762 | 5 | 2 | Colossal dockyard gantry crane fortress destroyed, chain of internal explosions, collapsing steel and a long rumbling tail |

### COLOSSUS 主砲塔（kind deckgun）

| 建議的音效鍵 | 事件 | 目前的聲音 | 觸發處 | 長度（秒） | 變化數 | AI 提示詞草稿 |
|---|---|---|---|---|---|---|
| `boss_colossus_intro` | 登場（第一次出現在場上：WARNING 橫幅） | 沒有聲音（只有橫幅與 ECHO 的語音） | game/juice.js:546、:547 | 3.5 | 1 | A towering battleship main gun turret powers up and announces itself, deep mechanical boot-up roar, heavy servo whine rising into a booming impact, sci-fi mecha scale |
| `boss_colossus_loop` | 砲塔慢慢轉向目標 | 沒有聲音（推進／懸浮時共用 thrustLoop（game/feedback.js:243）） | entities/mech-boss4.js:620 | 6 | 1 | Seamless loop of a huge naval turret traversing, grinding gear ring and heavy motor drone |
| `boss_colossus_charge_start` | 大招開始蓄力（Boss 改版的打斷量表出現） | SFX.play('alarm', 0.45, 0.7) | entities/mech-boss-tier.js:451 | 2 | 2 | Battleship main gun turret begins charging a super attack, rising electrical whine and deep reactor surge, ominous build-up |
| `boss_colossus_charge_loop` | 大招蓄力中（量表累積，循環） | 沒有聲音（只有 gather 特效） | entities/mech-boss-tier.js:395 | 4 | 1 | Seamless loop of a giant machine charging energy, pulsing hum with crackling arcs, tension building |
| `boss_colossus_big_release` | 大招放出（招式名稱的訊息） | SFX.play('alarm', 0.5, 0.9)＋招式各自的聲音 | entities/mech-boss-tier.js:417 | 1.5 | 2 | Battleship main gun turret unleashes its ultimate attack, sharp release blast with a deep sub-bass whoomp, mecha anime style |
| `boss_colossus_interrupt` | 大招被打斷（長時間失衡） | SFX.stagger | entities/mech-boss-tier.js:511 | 2.5 | 2 | Overloaded battleship main gun turret short-circuits and lurches, power-down whine, sparking crackle and heavy metal clank |
| `boss_colossus_stagger` | 失衡（BREAK） | SFX.stagger＋打出者的 SFX.breakFx／stinger | entities/mech-entity.js:1732、game/feedback.js:332、:336 | 1.8 | 3 | Battleship main gun turret staggers off balance, groaning metal, hydraulic hiss and a heavy clunk |
| `boss_colossus_open` | 破綻（金色光環、傷害加倍） | SFX.play('bell', 0.6, 1.3) | entities/mech-boss-tier.js:328 | 1.2 | 1 | Exposed weak point on a battleship main gun turret, armor plates unlatching with a hiss and a bright metallic ping |
| `boss_colossus_shell_on` | 裝甲殼長出（刁鑽度 5 起的型態閘門） | SFX.play('bell', 0.5, 0.7) | entities/mech-boss-tier.js:219 | 1.5 | 1 | Heavy armor shell clamps over a battleship main gun turret, interlocking plates slamming shut with a resonant clang |
| `boss_colossus_shell_break` | 裝甲殼打開（部位破壞、打斷、破綻、時間到） | SFX.stagger | entities/mech-boss-tier.js:246 | 1.5 | 1 | Armor shell bursts open on a battleship main gun turret, explosive bolts popping and plates crashing to the ground |
| `boss_colossus_phase` | 換型態（第二、第三型態：短暫無敵＋衝擊波） | SFX.cue('phase')＋衝擊波的 SFX.explode(true) | game/feedback.js:265、game/bosses.js:237（→ fx/effects.js:1817） | 3 | 2 | Battleship main gun turret transforms into a more dangerous form, mechanical reconfiguration, power surge and a booming shockwave |
| `boss_colossus_enrage` | 狂暴化（開打 6 分鐘、雙機的一台倒下） | 沒有聲音 | game/bosses.js:194、:206 | 2.5 | 1 | Battleship main gun turret goes berserk, reactor overdrive scream, red alert warble and violent engine roar |
| `boss_colossus_final_call` | 最終型態專屬招式「全門齊射」的宣告（沒有刁鑽度時） | SFX.play('alarm', 0.5, 0.9) | entities/mech-boss3.js:104 | 1.5 | 1 | Short ominous warning call before a battleship main gun turret's final special move, low siren with mechanical chatter |
| `boss_colossus_part_break` | Boss 改版的部位被打壞（測距儀、副砲、彈藥升降機） | SFX.explode(true)＋SFX.wreck（部位本身被擊破；tierPartDown 沒有額外聲音） | entities/mech-entity.js:2722、:2723；game/boss-tier.js:252 | 2 | 3 | A mounted component on a battleship main gun turret is blown off, sharp explosion, tearing metal and scattering debris |
| `boss_colossus_body_break` | 身體部位破壞（主砲防盾、砲座環；之後冒煙起火） | SFX.explode(false)（之後的冒煙與火無聲） | entities/mech-body.js:147、:266 | 2 | 3 | Armor section of a battleship main gun turret shatters, crunchy metal rupture with a burst of flame and sparks |
| `boss_colossus_reflect` | 打回去（玩家打掉金色彈體、飛回去） | SFX.play('shield', 0.9, 1.4) | entities/mech-boss-tier.js:821 | 0.8 | 2 | Projectile deflected back toward a battleship main gun turret, bright energy ricochet ping with a whoosh |
| `boss_colossus_guard_up` | 防禦反應（架起六角護盾） | 沒有聲音 | entities/mech-dodge.js:479 | 1 | 1 | A main gun turret raises a hexagonal energy barrier, electric hum swelling into a shield shimmer |
| `boss_colossus_guard_hit` | 防禦中被打中（護盾亮起） | 沒有聲音（只有一般的命中音） | entities/mech-dodge.js:757 | 0.5 | 3 | Bullets impacting a hexagonal energy shield, crisp energy deflection crackle |
| `boss_colossus_salvo_warn` | 主砲齊射預警（正前方長方形） | SFX.play('charge', 1, 0.5)＋SFX.alert | entities/mech-boss4.js:641～646 | 2 | 1 | Battleship guns loading, shell rams and breech locks clanking |
| `boss_colossus_salvo` | 主砲齊射 | SFX.explode(true)（各彈的 fx.explosion 無聲） | entities/mech-boss4.js:656、:660 | 3 | 2 | Battleship main guns firing a full broadside, earth-shattering booms |
| `boss_colossus_cool` | 齊射後散熱（破綻、冒煙） | 沒有聲音 | entities/mech-boss4.js:669、:673 | 2.5 | 1 | Hot gun barrels venting smoke and ticking as they cool |
| `boss_colossus_secondary` | 副砲（只打前方 ±60°） | SFX.shot('bullet') | entities/mech-boss4.js:63 | 1.5 | 2 | Secondary autocannon firing rapid bursts |
| `boss_colossus_popturret` | 升起兩座甲板升降砲塔 | 沒有聲音 | entities/mech-boss4.js:681～687 | 2 | 1 | Deck turrets rising from hatches, hydraulic lift and locking clank |
| `boss_colossus_death` | 擊破（大爆炸、殘骸） | SFX.explode('huge')＋SFX.wreck＋SFX.stinger(true)（配樂的重音） | entities/mech-entity.js:2722、:2723、:2762 | 5 | 2 | Colossal battleship main gun turret destroyed, chain of internal explosions, collapsing steel and a long rumbling tail |

### HEARTH 機關心臟（kind reactor）

| 建議的音效鍵 | 事件 | 目前的聲音 | 觸發處 | 長度（秒） | 變化數 | AI 提示詞草稿 |
|---|---|---|---|---|---|---|
| `boss_hearth_intro` | 登場（第一次出現在場上：WARNING 橫幅） | 沒有聲音（只有橫幅與 ECHO 的語音） | game/juice.js:546、:547 | 3.5 | 1 | A towering engine-room reactor core powers up and announces itself, deep mechanical boot-up roar, heavy servo whine rising into a booming impact, sci-fi mecha scale |
| `boss_hearth_loop` | 反應爐脈動與護盾板旋轉 | 沒有聲音（推進／懸浮時共用 thrustLoop（game/feedback.js:243）） | entities/mech-boss4.js:716（reactorAI） | 6 | 1 | Seamless loop of a massive reactor core pulsing, deep heartbeat-like thrum and rotating shield plates |
| `boss_hearth_charge_start` | 大招開始蓄力（Boss 改版的打斷量表出現） | SFX.play('alarm', 0.45, 0.7) | entities/mech-boss-tier.js:451 | 2 | 2 | Engine-room reactor core begins charging a super attack, rising electrical whine and deep reactor surge, ominous build-up |
| `boss_hearth_charge_loop` | 大招蓄力中（量表累積，循環） | 沒有聲音（只有 gather 特效） | entities/mech-boss-tier.js:395 | 4 | 1 | Seamless loop of a giant machine charging energy, pulsing hum with crackling arcs, tension building |
| `boss_hearth_big_release` | 大招放出（招式名稱的訊息） | SFX.play('alarm', 0.5, 0.9)＋招式各自的聲音 | entities/mech-boss-tier.js:417 | 1.5 | 2 | Engine-room reactor core unleashes its ultimate attack, sharp release blast with a deep sub-bass whoomp, mecha anime style |
| `boss_hearth_interrupt` | 大招被打斷（長時間失衡） | SFX.stagger | entities/mech-boss-tier.js:511 | 2.5 | 2 | Overloaded engine-room reactor core short-circuits and lurches, power-down whine, sparking crackle and heavy metal clank |
| `boss_hearth_stagger` | 失衡（BREAK） | SFX.stagger＋打出者的 SFX.breakFx／stinger | entities/mech-entity.js:1732、game/feedback.js:332、:336 | 1.8 | 3 | Engine-room reactor core staggers off balance, groaning metal, hydraulic hiss and a heavy clunk |
| `boss_hearth_open` | 破綻（金色光環、傷害加倍） | SFX.play('bell', 0.6, 1.3) | entities/mech-boss-tier.js:328 | 1.2 | 1 | Exposed weak point on a engine-room reactor core, armor plates unlatching with a hiss and a bright metallic ping |
| `boss_hearth_shell_on` | 裝甲殼長出（刁鑽度 5 起的型態閘門） | SFX.play('bell', 0.5, 0.7) | entities/mech-boss-tier.js:219 | 1.5 | 1 | Heavy armor shell clamps over a engine-room reactor core, interlocking plates slamming shut with a resonant clang |
| `boss_hearth_shell_break` | 裝甲殼打開（部位破壞、打斷、破綻、時間到） | SFX.stagger | entities/mech-boss-tier.js:246 | 1.5 | 1 | Armor shell bursts open on a engine-room reactor core, explosive bolts popping and plates crashing to the ground |
| `boss_hearth_phase` | 換型態（第二、第三型態：短暫無敵＋衝擊波） | SFX.cue('phase')＋衝擊波的 SFX.explode(true) | game/feedback.js:265、game/bosses.js:237（→ fx/effects.js:1817） | 3 | 2 | Engine-room reactor core transforms into a more dangerous form, mechanical reconfiguration, power surge and a booming shockwave |
| `boss_hearth_enrage` | 狂暴化（開打 6 分鐘、雙機的一台倒下） | 沒有聲音 | game/bosses.js:194、:206 | 2.5 | 1 | Engine-room reactor core goes berserk, reactor overdrive scream, red alert warble and violent engine roar |
| `boss_hearth_final_call` | 最終型態專屬招式「臨界放電」的宣告（沒有刁鑽度時） | SFX.play('alarm', 0.5, 0.9) | entities/mech-boss3.js:104 | 1.5 | 1 | Short ominous warning call before a engine-room reactor core's final special move, low siren with mechanical chatter |
| `boss_hearth_part_break` | Boss 改版的部位被打壞（冷卻柱、護盾板發生器） | SFX.explode(true)＋SFX.wreck（部位本身被擊破；tierPartDown 沒有額外聲音） | entities/mech-entity.js:2722、:2723；game/boss-tier.js:252 | 2 | 3 | A mounted component on a engine-room reactor core is blown off, sharp explosion, tearing metal and scattering debris |
| `boss_hearth_body_break` | 身體部位破壞（外殼上段、外殼下段；之後冒煙起火） | SFX.explode(false)（之後的冒煙與火無聲） | entities/mech-body.js:147、:266 | 2 | 3 | Armor section of a engine-room reactor core shatters, crunchy metal rupture with a burst of flame and sparks |
| `boss_hearth_reflect` | 打回去（玩家打掉金色彈體、飛回去） | SFX.play('shield', 0.9, 1.4) | entities/mech-boss-tier.js:821 | 0.8 | 2 | Projectile deflected back toward a engine-room reactor core, bright energy ricochet ping with a whoosh |
| `boss_hearth_guard_up` | 防禦反應（架起六角護盾） | 沒有聲音 | entities/mech-dodge.js:479 | 1 | 1 | A reactor core raises a hexagonal energy barrier, electric hum swelling into a shield shimmer |
| `boss_hearth_guard_hit` | 防禦中被打中（護盾亮起） | 沒有聲音（只有一般的命中音） | entities/mech-dodge.js:757 | 0.5 | 3 | Bullets impacting a hexagonal energy shield, crisp energy deflection crackle |
| `boss_hearth_plate_block` | 子彈被護盾板擋下 | 沒有聲音（一般命中音） | entities/mech-boss4.js:809（reactorBlocked_） | 0.5 | 3 | Bullet ricocheting off a thick rotating shield plate, heavy metallic ping |
| `boss_hearth_pulse` | 脈衝環 | SFX.play('laserBig', 0.8, 1.4)（game/bosses2.js:216） | entities/mech-boss4.js:746 | 2 | 2 | Reactor emitting an expanding energy pulse, deep resonant whoom |
| `boss_hearth_mortar` | 彈雨 | SFX.play('heavy', 0.8, 1.2)＋發射 SFX.shot('grenade')（game/support.js:165）＋落地 SFX.explode（entities/projectile.js:303）；預警圈無聲 | entities/mech-boss4.js:759、:765 | 2 | 2 | Reactor vents launching burning debris, thumps and incoming whistles |
| `boss_hearth_overload` | 過載（板收起、核心外露、四道光束） | SFX.play('laserBig', 1, 0.6)＋SFX.alert | entities/mech-boss4.js:775～793 | 3 | 1 | Reactor overload, shield plates retracting, blinding energy beams and alarms |
| `boss_hearth_core_loop` | 核心外露中（火花，循環） | 沒有聲音 | entities/mech-boss4.js:796 | 4 | 1 | Seamless loop of an exposed unstable reactor core, crackling electricity and humming |
| `boss_hearth_death` | 擊破（大爆炸、殘骸） | SFX.explode('huge')＋SFX.wreck＋SFX.stinger(true)（配樂的重音） | entities/mech-entity.js:2722、:2723、:2762 | 5 | 2 | Colossal engine-room reactor core destroyed, chain of internal explosions, collapsing steel and a long rumbling tail |

### SOVEREIGN 方舟的主權者（kind sovereign）

| 建議的音效鍵 | 事件 | 目前的聲音 | 觸發處 | 長度（秒） | 變化數 | AI 提示詞草稿 |
|---|---|---|---|---|---|---|
| `boss_sovereign_intro` | 登場（第一次出現在場上：WARNING 橫幅） | 沒有聲音（只有橫幅與 ECHO 的語音） | game/juice.js:546、:547 | 3.5 | 1 | A towering sovereign of the ark, regal final-boss mech powers up and announces itself, deep mechanical boot-up roar, heavy servo whine rising into a booming impact, sci-fi mecha scale |
| `boss_sovereign_loop` | 移動／待機的循環音 | 沒有聲音（一般 AC 的腳步與推進） | entities/mech-boss4.js:821（sovereignAI） | 6 | 1 | Seamless loop of a regal final-boss mech hovering, choral-like synth hum and soft thruster |
| `boss_sovereign_charge_start` | 大招開始蓄力（Boss 改版的打斷量表出現） | SFX.play('alarm', 0.45, 0.7) | entities/mech-boss-tier.js:451 | 2 | 2 | Sovereign of the ark, regal final-boss mech begins charging a super attack, rising electrical whine and deep reactor surge, ominous build-up |
| `boss_sovereign_charge_loop` | 大招蓄力中（量表累積，循環） | 沒有聲音（只有 gather 特效） | entities/mech-boss-tier.js:395 | 4 | 1 | Seamless loop of a giant machine charging energy, pulsing hum with crackling arcs, tension building |
| `boss_sovereign_big_release` | 大招放出（招式名稱的訊息） | SFX.play('alarm', 0.5, 0.9)＋招式各自的聲音 | entities/mech-boss-tier.js:417 | 1.5 | 2 | Sovereign of the ark, regal final-boss mech unleashes its ultimate attack, sharp release blast with a deep sub-bass whoomp, mecha anime style |
| `boss_sovereign_interrupt` | 大招被打斷（長時間失衡） | SFX.stagger | entities/mech-boss-tier.js:511 | 2.5 | 2 | Overloaded sovereign of the ark, regal final-boss mech short-circuits and lurches, power-down whine, sparking crackle and heavy metal clank |
| `boss_sovereign_stagger` | 失衡（BREAK） | SFX.stagger＋打出者的 SFX.breakFx／stinger | entities/mech-entity.js:1732、game/feedback.js:332、:336 | 1.8 | 3 | Sovereign of the ark, regal final-boss mech staggers off balance, groaning metal, hydraulic hiss and a heavy clunk |
| `boss_sovereign_open` | 破綻（金色光環、傷害加倍） | SFX.play('bell', 0.6, 1.3) | entities/mech-boss-tier.js:328 | 1.2 | 1 | Exposed weak point on a sovereign of the ark, regal final-boss mech, armor plates unlatching with a hiss and a bright metallic ping |
| `boss_sovereign_shell_on` | 裝甲殼長出（刁鑽度 5 起的型態閘門） | SFX.play('bell', 0.5, 0.7) | entities/mech-boss-tier.js:219 | 1.5 | 1 | Heavy armor shell clamps over a sovereign of the ark, regal final-boss mech, interlocking plates slamming shut with a resonant clang |
| `boss_sovereign_shell_break` | 裝甲殼打開（部位破壞、打斷、破綻、時間到） | SFX.stagger | entities/mech-boss-tier.js:246 | 1.5 | 1 | Armor shell bursts open on a sovereign of the ark, regal final-boss mech, explosive bolts popping and plates crashing to the ground |
| `boss_sovereign_phase` | 換型態（第二、第三型態：短暫無敵＋衝擊波） | SFX.cue('phase')＋衝擊波的 SFX.explode(true) | game/feedback.js:265、game/bosses.js:237（→ fx/effects.js:1817） | 3 | 2 | Sovereign of the ark, regal final-boss mech transforms into a more dangerous form, mechanical reconfiguration, power surge and a booming shockwave |
| `boss_sovereign_enrage` | 狂暴化（開打 6 分鐘、雙機的一台倒下） | 沒有聲音 | game/bosses.js:194、:206 | 2.5 | 1 | Sovereign of the ark, regal final-boss mech goes berserk, reactor overdrive scream, red alert warble and violent engine roar |
| `boss_sovereign_final_call` | 最終型態專屬招式「終端認證」的宣告（沒有刁鑽度時） | SFX.play('alarm', 0.5, 0.9) | entities/mech-boss3.js:104 | 1.5 | 1 | Short ominous warning call before a sovereign of the ark, regal final-boss mech's final special move, low siren with mechanical chatter |
| `boss_sovereign_part_break` | Boss 改版的部位被打壞（浮游刃發射器、認證天線） | SFX.explode(true)＋SFX.wreck（部位本身被擊破；tierPartDown 沒有額外聲音） | entities/mech-entity.js:2722、:2723；game/boss-tier.js:252 | 2 | 3 | A mounted component on a sovereign of the ark, regal final-boss mech is blown off, sharp explosion, tearing metal and scattering debris |
| `boss_sovereign_body_break` | 身體部位破壞（頭部、右臂、左臂、下身；之後冒煙起火） | SFX.explode(false)（之後的冒煙與火無聲） | entities/mech-body.js:147、:266 | 2 | 3 | Armor section of a sovereign of the ark, regal final-boss mech shatters, crunchy metal rupture with a burst of flame and sparks |
| `boss_sovereign_reflect` | 打回去（玩家打掉金色彈體、飛回去） | SFX.play('shield', 0.9, 1.4) | entities/mech-boss-tier.js:821 | 0.8 | 2 | Projectile deflected back toward a sovereign of the ark, regal final-boss mech, bright energy ricochet ping with a whoosh |
| `boss_sovereign_dodge` | 閃避（QB 側閃／後撤／跳躍，機甲型連續閃避） | SFX.qb（一般的 QB 音；閃避本身沒有額外聲音） | entities/mech-entity.js:3083、entities/mech-dodge.js:299 | 0.8 | 3 | Quick evasive thruster burst of a regal final-boss mech, sharp jet blast with a mechanical whoosh |
| `boss_sovereign_rush` | 突進＋近距離齊射 | SFX.ab＋各武器的 SFX.shot（entities/mech-entity.js:883 實彈／:927 砲彈／:979 榴彈／:1074 導彈／:1264 雷射） | entities/mech-boss4.js:851～856 | 1.5 | 2 | Elite mech boosting in and unleashing a point-blank volley |
| `boss_sovereign_pillars` | 第二型態：甲板主砲的光柱 | SFX.alert＋預警圈與落雷無聲；爆炸 SFX.explode（game/support.js:355 blastTeam） | entities/mech-boss4.js:863～866 | 2.5 | 2 | Pillars of light crashing down from above, booming energy impacts |
| `boss_sovereign_blades` | 第二型態：浮游刃 | 預警線無聲；發射 SFX.play('laserBig', 0.8, 0.9)（entities/mech-boss3.js:242） | entities/mech-boss4.js:875 | 1.5 | 2 | Floating energy blades launching, whirring slicing sounds |
| `boss_sovereign_auth_start` | 第三型態「認證」開始 | SFX.alert | entities/mech-boss4.js:889 | 2 | 1 | Ominous authentication sequence starting, cold digital voice-like tones |
| `boss_sovereign_auth_strike` | 認證：光帶落下（每波） | 光帶無聲；爆炸 explodeAt 的 SFX.explode | entities/mech-boss4.js:899～906 | 2.5 | 2 | Rows of energy beams sweeping down in sequence, rhythmic heavy blasts |
| `boss_sovereign_echo` | 召喚上一位鑰匙的殘影 | SFX.alert | entities/mech-boss4.js:922～926（game/bosses4.js:8） | 3 | 1 | Ghostly echo of a past mech materializing, reverberating spectral synth |
| `boss_sovereign_down` | 停機（最大的破綻） | 沒有聲音 | entities/mech-boss4.js:929～933 | 3 | 1 | Final boss mech powering down, descending whine and heavy settling |
| `boss_sovereign_death` | 擊破（大爆炸、殘骸） | SFX.explode('huge')＋SFX.wreck＋SFX.stinger(true)（配樂的重音） | entities/mech-entity.js:2722、:2723、:2762 | 5 | 2 | Colossal sovereign of the ark, regal final-boss mech destroyed, chain of internal explosions, collapsing steel and a long rumbling tail |

### Boss 戰的場地效果（`game/boss-field.js`；各 Boss 用哪幾種見 `data/boss-kit.js` 的 FIELD）

使用者要求每隻 Boss 自己的聲音；場地效果是 Boss 改版加的機制，建議依種類各做一個（不分 Boss），若也要分 Boss 再依 FIELD 展開。



| 建議的音效鍵 | 事件 | 目前的聲音 | 觸發處 | 長度（秒） | 變化數 | AI 提示詞草稿 |
|---|---|---|---|---|---|---|
| `field_shock` | 電擊地面：預警後放電（hunter、ibis、funnel、reactor） | SFX.play('laser2', 0.8, 0.7)（預警無聲） | game/boss-field.js:173 | 1.5 | 3 | Electrified ground discharging, sharp crackling arcs with a thunder snap |
| `field_shock_warn` | 電擊地面的預警（1 秒） | 沒有聲音 | game/boss-field.js:168 | 1 | 1 | Rising electrical buzz before a discharge, crackling static |
| `field_collapse` | 塌陷（地面陷落、往外推） | SFX.play('explode2', 0.8, 0.6) | game/boss-field.js:199 | 2 | 2 | Ground collapsing into a pit, crumbling rock and heavy rumble |
| `field_magma_loop` | 熔岩裂地（循環） | 沒有聲音 | game/boss-field.js:219 | 5 | 1 | Seamless loop of bubbling lava cracks, sizzling and popping |
| `field_belt_loop` | 燃燒帶（移動，循環） | 沒有聲音 | game/boss-field.js:220、:274 | 5 | 1 | Seamless loop of a moving band of fire, roaring flames |
| `field_minefield` | 地雷區（踩到預警後爆炸） | 預警無聲；SFX.explode（blastTeam） | game/boss-field.js:238～255、game/support.js:355 | 1.5 | 2 | Landmine triggering with a click then exploding |
| `field_steam_loop` | 蒸氣（熄滅燃燒地面，循環） | 沒有聲音 | game/boss-field.js:258 | 4 | 1 | Seamless loop of venting steam clouds, continuous hiss |
| `field_quicksand_loop` | 流沙（循環） | 沒有聲音 | game/boss-field.js:101（bfMove） | 4 | 1 | Seamless loop of sinking quicksand, shifting gritty sand |
| `field_ice_loop` | 冰面（滑行，循環） | 沒有聲音 | game/boss-field.js:101（bfMove） | 4 | 1 | Seamless loop of metal skidding on ice, creaking ice sheet |
| `field_haze_loop` | 煙霧（不能鎖定，循環） | 沒有聲音 | game/boss-field.js:403 | 5 | 1 | Seamless loop of drifting thick smoke, low wind |
| `field_darkness` | 全場變暗 | 沒有聲音 | game/boss-field.js:134 | 2 | 1 | Power blackout, lights shutting down with descending hum |
| `field_cover_rise` | 新掩體升起（berm／rubble／crate／pillar／slab） | 沒有聲音 | game/boss-field.js:362 | 1.5 | 3 | Concrete barrier rising from the ground, grinding stone |

## 二、機獸（8 隻，`data/beasts.js`）

機獸的聲音集中在 `entities/mech-beast-fx.js`：每隻的吼聲是 VOICE 表（`~roarL`／`~roarH`／`~rumble`／`~screech`／`~chitter` 加不同音高），出手的聲音依招式名稱分五種（爪 claw：`~claw`＋`~thB`；迴旋 spin：`~claw`＋`~thC`；咬 bite：`~tink3`＋`~thB`；刺 sting：`~zapC`＋`~thB`；砸地／衝撞 slam：`~thC`＋`heavy`），都是合成音、八隻共用。

### 獅型 REGENT（beast_lion，第 2～7 章的隨機亂入、模擬器）

| 建議的音效鍵 | 事件 | 目前的聲音 | 觸發處 | 長度（秒） | 變化數 | AI 提示詞草稿 |
|---|---|---|---|---|---|---|
| `beast_lion_roar_intro` | 登場的吼聲 | ~roarL（音高 ×1） | entities/mech-beast-fx.js:219 | 3.5 | 2 | Colossal mechanical lion roar, metallic resonance over a deep bestial growl, servo whine |
| `beast_lion_roar_phase` | 換型態的吼聲（點綴色的爆發） | ~roarL（音高 ×1） ×0.86＋SFX.cue('phase') | entities/mech-beast-fx.js:227、game/feedback.js:265 | 3 | 2 | Colossal mechanical lion roar, metallic resonance over a deep bestial growl, servo whine, angrier and longer |
| `beast_lion_roar_clip` | 威嚇／吼叫的片段（roar） | ~roarL（音高 ×1） | entities/mech-beast-fx.js:244 | 2.5 | 2 | Colossal mechanical lion roar, metallic resonance over a deep bestial growl, servo whine, short threatening display |
| `beast_lion_growl` | 出招前的低吼（每一招開始） | ~growl（音高 ×1） | entities/mech-beast-fx.js:242 | 1.2 | 3 | Low rumbling mechanical lion growl, vibrating metal throat |
| `beast_lion_hurt` | 受傷（hit 片段） | 沒有聲音（只有一般的命中音 SFX.hit） | entities/mech-beast-fx.js:235（片段開始時沒有對應） | 0.8 | 3 | Pained mechanical lion snarl, sharp metallic yelp |
| `beast_lion_stagger` | 失衡的叫聲 | ~roarL（音高 ×1） ×1.35＋SFX.stagger | entities/mech-beast-fx.js:239、entities/mech-entity.js:1732 | 1.5 | 2 | Pained mechanical lion snarl, sharp metallic yelp, dazed and stumbling |
| `beast_lion_death` | 倒下（death 片段的叫聲） | ~roarL（音高 ×1） ×0.7 | entities/mech-beast-fx.js:237 | 3.5 | 1 | Dying mechanical lion roar fading into failing servos and electrical crackle |
| `beast_lion_collapse` | 倒下後的碎裂、爆炸 | 火花無聲（mech-beast.js:131）；最後 SFX.explode('huge')＋SFX.wreck＋SFX.stinger(true) | entities/mech-beast.js:131、entities/mech-entity.js:2722、:2762 | 5 | 1 | Giant robotic lion collapsing, crashing metal body, sparks and final explosion |
| `beast_lion_step` | 腳步（每一步） | ~bstep（依體重：音量、音高） | entities/mech-beast-fx.js:300 | 0.6 | 3 | Heavy padded footfall of a giant robotic lion, metal paw thud on ground |
| `beast_lion_land` | 落地（撲擊、跳躍、躍過障礙、降落、鑽出） | ~thC＋~bstep | entities/mech-beast-fx.js:269、:270 | 1.2 | 2 | Giant robotic lion landing from a pounce, heavy thud and dust |
| `beast_lion_dodge` | 閃避（側跳 dgSideL／R、後跳 dgBack、伏低 dgDuck） | 沒有聲音 | entities/mech-dodge.js:668 | 1 | 2 | Giant robotic lion leaping sideways, quick paw scrape and servo burst |
| `beast_lion_clawL` | 近戰「clawL」：左爪 | ~claw＋~thB | entities/mech-beast-fx.js:140、:141 | 1 | 2 | Giant metal claw slash, three razor swipes with sparks and steel shriek |
| `beast_lion_clawR` | 近戰「clawR」：右爪 | ~claw＋~thB | entities/mech-beast-fx.js:140、:141 | 1 | 2 | Giant metal claw slash from the right, sharp ripping swipe |
| `beast_lion_bite` | 近戰「bite」：咬 | ~tink3＋~thB | entities/mech-beast-fx.js:155、:156 | 1 | 2 | Massive mechanical jaws snapping shut, crushing metallic chomp |
| `beast_lion_tail` | 近戰「tail」：甩尾 | ~claw＋~thC | entities/mech-beast-fx.js:147、:148 | 1.2 | 2 | Heavy metal tail whipping around, whoosh and impact |
| `beast_lion_pounce` | 近戰「pounce」：撲擊（招牌技） | ~thC＋heavy | entities/mech-beast-fx.js:177、:178 | 1.5 | 2 | Giant robotic lion pouncing and crashing down, explosive impact |
| `beast_lion_rail_lock` | 背上磁軌砲：鎖定方向、預警線 | SFX.play('charge', 0.6, 1.2) | entities/mech-beast.js:270 | 1 | 1 | Back-mounted railgun locking on, quick capacitor whine |
| `beast_lion_rail_fire` | 背上磁軌砲：貫穿 | SFX.play('heavy', 0.9, 1.3) | entities/mech-beast.js:282 | 2 | 2 | Twin railgun firing from a beast, supersonic crack and heavy boom |
| `beast_lion_pods` | 肩上導彈莢艙（2 輪） | SFX.shot('missile') | entities/mech-beast.js:357（b3Volley）、entities/mech-entity.js:1074 | 1.5 | 2 | Shoulder missile pods launching a salvo |
| `beast_lion_mane` | 鬃甲的雷射陣列（咆哮時張開，5 道） | 預警線無聲；發射 SFX.play('laserBig', 0.8, 0.9)（entities/mech-boss3.js:242） | entities/mech-beast.js:360～385 | 2 | 2 | Fan of lasers fired from an opening mane, layered energy beams with a roar |
| `beast_lion_charge_start` | 大招開始蓄力（Boss 改版） | SFX.play('alarm', 0.45, 0.7) | entities/mech-boss-tier.js:451 | 2 | 1 | Colossal mechanical lion roar, metallic resonance over a deep bestial growl, servo whine, charging power, building up |
| `beast_lion_big_release` | 大招放出（導彈彈幕、雷射牢籠） | SFX.play('alarm', 0.5, 0.9)＋招式的聲音 | entities/mech-boss-tier.js:417 | 1.5 | 2 | Colossal mechanical lion roar, metallic resonance over a deep bestial growl, servo whine, unleashing a devastating attack |
| `beast_lion_interrupt` | 大招被打斷 | SFX.stagger | entities/mech-boss-tier.js:511 | 2 | 1 | Pained mechanical lion snarl, sharp metallic yelp, power surge cut off with sparks |
| `beast_lion_open` | 破綻 | SFX.play('bell', 0.6, 1.3) | entities/mech-boss-tier.js:328 | 1.2 | 1 | Exposed weak spot on a robotic lion, armor plates loosening with a hiss and ping |
| `beast_lion_final_call` | 最終型態專屬招式「獸王咆哮」的宣告 | SFX.play('alarm', 0.5, 0.9) | entities/mech-boss3.js:104 | 2 | 1 | Colossal mechanical lion roar, metallic resonance over a deep bestial growl, servo whine, ultimate battle cry |
| `beast_lion_part_break` | 外掛武器被打壞（磁軌砲、左導彈莢艙、右導彈莢艙） | SFX.explode(true)＋SFX.wreck | entities/mech-entity.js:2722、game/boss-tier.js:252 | 2 | 2 | Weapon pod torn off a robotic lion, explosion and tearing metal |
| `beast_lion_body_break` | 身體部位破壞（鬃甲、前爪、後腿、尾巴） | SFX.explode(false) | entities/mech-body.js:147 | 2 | 3 | Armored limb of a robotic lion shattering, crunching metal and sparks |
| `beast_lion_repair` | 修復被打壞的武器 | SFX.alert | entities/mech-beast.js:110、game/hud.js:152 | 2 | 1 | Robotic creature self-repairing, whirring nanotech and welding crackle |
| `beast_lion_reflect` | 打回去 | SFX.play('shield', 0.9, 1.4) | entities/mech-boss-tier.js:821 | 0.8 | 1 | Projectile deflected back toward a giant robotic beast, bright ricochet ping |
| `beast_lion_raid_in` | 獅型亂入：警告與進場（全速衝向原本的機獸） | SFX.stinger(false)（配樂的重音） | game/beast-raid.js:193～198、entities/mech-beast.js:460 | 3 | 1 | Distant mechanical lion roar approaching fast, thundering footsteps |
| `beast_lion_raid_bite` | 獅型亂入：撲上去咬死原本的機獸 | 沿用 pounce／bite 的聲音（mech-beast-fx.js 依片段判斷） | entities/mech-beast.js:510～525 | 2 | 1 | Giant robotic lion savagely biting another machine beast, crushing metal and death screech |
| `beast_lion_raid_roar` | 獅型亂入：咬完的勝利吼聲 | 同 roar 片段 | entities/mech-beast.js:530～540 | 3 | 1 | Triumphant mechanical lion roar after a kill |
| `beast_lion_raid_won` | 隱藏目標達成（擊退獅型） | 沒有聲音（只有訊息） | game/beast-raid.js:204 | 2 | 1 | Victory stinger, rising heroic brass hit |

### 劍齒虎型 RIME（beast_tiger，第 3 章：冰原、研究特區）

| 建議的音效鍵 | 事件 | 目前的聲音 | 觸發處 | 長度（秒） | 變化數 | AI 提示詞草稿 |
|---|---|---|---|---|---|---|
| `beast_tiger_roar_intro` | 登場的吼聲 | ~roarL（音高 ×1.22） | entities/mech-beast-fx.js:219 | 3.5 | 2 | Fierce mechanical sabertooth roar, higher metallic snarl with icy hiss |
| `beast_tiger_roar_phase` | 換型態的吼聲（點綴色的爆發） | ~roarL（音高 ×1.22） ×0.86＋SFX.cue('phase') | entities/mech-beast-fx.js:227、game/feedback.js:265 | 3 | 2 | Fierce mechanical sabertooth roar, higher metallic snarl with icy hiss, angrier and longer |
| `beast_tiger_roar_clip` | 威嚇／吼叫的片段（tSnarl） | ~roarL（音高 ×1.22） | entities/mech-beast-fx.js:244 | 2.5 | 2 | Fierce mechanical sabertooth roar, higher metallic snarl with icy hiss, short threatening display |
| `beast_tiger_growl` | 出招前的低吼（每一招開始） | ~growl（音高 ×1.22） | entities/mech-beast-fx.js:242 | 1.2 | 3 | Low hissing sabertooth growl, frosty metallic rattle |
| `beast_tiger_hurt` | 受傷（hit 片段） | 沒有聲音（只有一般的命中音 SFX.hit） | entities/mech-beast-fx.js:235（片段開始時沒有對應） | 0.8 | 3 | Sharp mechanical tiger yowl |
| `beast_tiger_stagger` | 失衡的叫聲 | ~roarL（音高 ×1.22） ×1.35＋SFX.stagger | entities/mech-beast-fx.js:239、entities/mech-entity.js:1732 | 1.5 | 2 | Sharp mechanical tiger yowl, dazed and stumbling |
| `beast_tiger_death` | 倒下（death 片段的叫聲） | ~roarL（音高 ×1.22） ×0.7 | entities/mech-beast-fx.js:237 | 3.5 | 1 | Mechanical sabertooth dying howl fading into frozen crackle |
| `beast_tiger_collapse` | 倒下後的碎裂、爆炸 | 火花無聲（mech-beast.js:131）；最後 SFX.explode('huge')＋SFX.wreck＋SFX.stinger(true) | entities/mech-beast.js:131、entities/mech-entity.js:2722、:2762 | 5 | 1 | Robotic sabertooth collapsing, shattering ice-coated armor and explosion |
| `beast_tiger_step` | 腳步（每一步） | ~bstep（依體重：音量、音高） | entities/mech-beast-fx.js:300 | 0.6 | 3 | Quick heavy paw step of a robotic tiger on snow and metal |
| `beast_tiger_land` | 落地（撲擊、跳躍、躍過障礙、降落、鑽出） | ~thC＋~bstep | entities/mech-beast-fx.js:269、:270 | 1.2 | 2 | Robotic tiger landing lightly but heavily, crunching snow |
| `beast_tiger_dodge` | 閃避（側跳 dgSideL／R、後跳 dgBack、伏低 dgDuck） | 沒有聲音 | entities/mech-dodge.js:668 | 1 | 2 | Robotic tiger darting sideways, fast scrape and servo snap |
| `beast_tiger_tFang` | 近戰「tFang」：劍齒咬 | ~claw＋~thB | entities/mech-beast-fx.js:140、:141 | 1 | 2 | Huge saber fangs stabbing, piercing metallic crunch |
| `beast_tiger_tDodgeClawL` | 近戰「tDodgeClawL」：側閃後左爪 | ~claw＋~thB | entities/mech-beast-fx.js:140、:141 | 1 | 2 | Sidestep then claw swipe, quick scrape and slash |
| `beast_tiger_tDodgeClawR` | 近戰「tDodgeClawR」：側閃後右爪 | ~claw＋~thB | entities/mech-beast-fx.js:140、:141 | 1 | 2 | Sidestep then claw swipe from the right |
| `beast_tiger_tSpinL` | 近戰「tSpinL」：原地迴旋甩尾（左） | ~claw＋~thC | entities/mech-beast-fx.js:147、:148 | 1.2 | 2 | Spinning tail sweep, whirling whoosh |
| `beast_tiger_tSpinR` | 近戰「tSpinR」：原地迴旋甩尾（右） | ~claw＋~thC | entities/mech-beast-fx.js:147、:148 | 1.2 | 2 | Spinning tail sweep to the other side |
| `beast_tiger_tLunge` | 近戰「tLunge」：撲咬 | ~thC＋heavy | entities/mech-beast-fx.js:177、:178 | 1.2 | 2 | Lunging robotic tiger crashing into target |
| `beast_tiger_mg` | 背上電磁機砲（繞著跑時點放） | SFX.shot('bullet') | entities/mech-beast.js:285（burst）、entities/mech-entity.js:883 | 1.5 | 2 | Back-mounted electromagnetic machine cannon firing bursts |
| `beast_tiger_pods` | 肩上電漿導彈 | SFX.shot('missile') | entities/mech-beast.js:357、entities/mech-entity.js:1074 | 1.5 | 2 | Plasma missiles launching with crackling energy trails |
| `beast_tiger_freeze` | 冷凍光束（低吼、預警後一道，打中緩速） | 預警線無聲；發射 SFX.play('laserBig', 0.8, 0.9)（entities/mech-boss3.js:242） | entities/mech-beast.js:388～415 | 2 | 2 | Freezing beam fired from fangs, icy crackling ray |
| `beast_tiger_charge_start` | 大招開始蓄力（Boss 改版） | SFX.play('alarm', 0.45, 0.7) | entities/mech-boss-tier.js:451 | 2 | 1 | Fierce mechanical sabertooth roar, higher metallic snarl with icy hiss, charging power, building up |
| `beast_tiger_big_release` | 大招放出（冰錐彈幕、寒光掃射） | SFX.play('alarm', 0.5, 0.9)＋招式的聲音 | entities/mech-boss-tier.js:417 | 1.5 | 2 | Fierce mechanical sabertooth roar, higher metallic snarl with icy hiss, unleashing a devastating attack |
| `beast_tiger_interrupt` | 大招被打斷 | SFX.stagger | entities/mech-boss-tier.js:511 | 2 | 1 | Sharp mechanical tiger yowl, power surge cut off with sparks |
| `beast_tiger_open` | 破綻 | SFX.play('bell', 0.6, 1.3) | entities/mech-boss-tier.js:328 | 1.2 | 1 | Exposed weak spot on a robotic sabertooth tiger, armor plates loosening with a hiss and ping |
| `beast_tiger_final_call` | 最終型態專屬招式「絕對零度」的宣告 | SFX.play('alarm', 0.5, 0.9) | entities/mech-boss3.js:104 | 2 | 1 | Fierce mechanical sabertooth roar, higher metallic snarl with icy hiss, ultimate battle cry |
| `beast_tiger_part_break` | 外掛武器被打壞（電磁機砲、電漿導彈莢艙） | SFX.explode(true)＋SFX.wreck | entities/mech-entity.js:2722、game/boss-tier.js:252 | 2 | 2 | Weapon pod torn off a robotic sabertooth tiger, explosion and tearing metal |
| `beast_tiger_body_break` | 身體部位破壞（劍齒、前肢、後腿、尾巴） | SFX.explode(false) | entities/mech-body.js:147 | 2 | 3 | Armored limb of a robotic sabertooth tiger shattering, crunching metal and sparks |
| `beast_tiger_repair` | 修復被打壞的武器 | SFX.alert | entities/mech-beast.js:110、game/hud.js:152 | 2 | 1 | Robotic creature self-repairing, whirring nanotech and welding crackle |
| `beast_tiger_reflect` | 打回去 | SFX.play('shield', 0.9, 1.4) | entities/mech-boss-tier.js:821 | 0.8 | 1 | Projectile deflected back toward a giant robotic beast, bright ricochet ping |

### 熊型 SCORIA（beast_bear，第 7 章：火山熔爐帶）

| 建議的音效鍵 | 事件 | 目前的聲音 | 觸發處 | 長度（秒） | 變化數 | AI 提示詞草稿 |
|---|---|---|---|---|---|---|
| `beast_bear_roar_intro` | 登場的吼聲 | ~roarH（音高 ×0.92） | entities/mech-beast-fx.js:219 | 3.5 | 2 | Massive mechanical bear roar, booming deep growl with furnace rumble |
| `beast_bear_roar_phase` | 換型態的吼聲（點綴色的爆發） | ~roarH（音高 ×0.92） ×0.86＋SFX.cue('phase') | entities/mech-beast-fx.js:227、game/feedback.js:265 | 3 | 2 | Massive mechanical bear roar, booming deep growl with furnace rumble, angrier and longer |
| `beast_bear_roar_clip` | 威嚇／吼叫的片段（bRoar、bStand） | ~roarH（音高 ×0.92） | entities/mech-beast-fx.js:244 | 2.5 | 2 | Massive mechanical bear roar, booming deep growl with furnace rumble, short threatening display |
| `beast_bear_growl` | 出招前的低吼（每一招開始） | ~growl（音高 ×0.92） | entities/mech-beast-fx.js:242 | 1.2 | 3 | Deep rumbling mechanical bear growl |
| `beast_bear_hurt` | 受傷（hit 片段） | 沒有聲音（只有一般的命中音 SFX.hit） | entities/mech-beast-fx.js:235（片段開始時沒有對應） | 0.8 | 3 | Angry mechanical bear grunt |
| `beast_bear_stagger` | 失衡的叫聲 | ~roarH（音高 ×0.92） ×1.35＋SFX.stagger | entities/mech-beast-fx.js:239、entities/mech-entity.js:1732 | 1.5 | 2 | Angry mechanical bear grunt, dazed and stumbling |
| `beast_bear_death` | 倒下（death 片段的叫聲） | ~roarH（音高 ×0.92） ×0.7 | entities/mech-beast-fx.js:237 | 3.5 | 1 | Dying mechanical bear groan, collapsing furnace hiss |
| `beast_bear_collapse` | 倒下後的碎裂、爆炸 | 火花無聲（mech-beast.js:131）；最後 SFX.explode('huge')＋SFX.wreck＋SFX.stinger(true) | entities/mech-beast.js:131、entities/mech-entity.js:2722、:2762 | 5 | 1 | Giant robotic bear falling, heavy crash and furnace explosion |
| `beast_bear_step` | 腳步（每一步） | ~bstep（依體重：音量、音高） | entities/mech-beast-fx.js:300 | 0.6 | 3 | Very heavy robotic bear footfall, ground-shaking thud |
| `beast_bear_land` | 落地（撲擊、跳躍、躍過障礙、降落、鑽出） | ~thC＋~bstep | entities/mech-beast-fx.js:269、:270 | 1.2 | 2 | Giant robotic bear landing, massive thud |
| `beast_bear_dodge` | 閃避（側跳 dgSideL／R、後跳 dgBack、伏低 dgDuck） | 沒有聲音 | entities/mech-dodge.js:668 | 1 | 2 | Heavy robotic bear lumbering sidestep, scraping claws |
| `beast_bear_bSlam3` | 近戰「bSlam3」：站起來掌擊連打三下 | ~thC＋heavy | entities/mech-beast-fx.js:177、:178 | 1 | 2 | Three heavy paw slams in sequence, booming impacts |
| `beast_bear_bGround` | 近戰「bGround」：雙掌拍地 | ~thC＋heavy | entities/mech-beast-fx.js:177、:178 | 1.5 | 2 | Both paws smashing the ground, huge shockwave thud |
| `beast_bear_bHug` | 近戰「bHug」：熊抱 | ~tink3＋~thB | entities/mech-beast-fx.js:155、:156 | 1.2 | 2 | Crushing bear hug, grinding metal compression |
| `beast_bear_bCharge` | 近戰「bCharge」：衝撞 | ~thC＋heavy | entities/mech-beast-fx.js:177、:178 | 1.5 | 2 | Robotic bear charging and ramming, thunderous impact |
| `beast_bear_how` | 背上重榴彈砲（一發大的） | 發射 SFX.shot('grenade')（game/support.js:165）＋落地 SFX.explode（entities/projectile.js:303）；預警圈無聲 | entities/mech-beast.js:432（lob） | 2 | 2 | Heavy howitzer firing a single huge shell, deep boom and whistle |
| `beast_bear_heat` | 肩峰熱熔光束砲（左右各一道） | 預警線無聲；發射 SFX.play('laserBig', 0.8, 0.9)（entities/mech-boss3.js:242） | entities/mech-beast.js:388 | 2 | 2 | Heat ray cannons firing searing beams |
| `beast_bear_lava` | 丟熔岩塊（落地留燃燒地面） | 發射 SFX.shot('grenade')（game/support.js:165）＋落地 SFX.explode（entities/projectile.js:303）；預警圈無聲；燃燒地面無聲 | entities/mech-beast.js:432～445 | 2 | 2 | Molten rock hurled and splattering, sizzling impact |
| `beast_bear_flame` | 口的爐火（近距離火焰錐） | 沒有聲音（flameCone 無聲） | entities/mech-beast.js:290～312 | 2.5 | 2 | Furnace fire breath roaring from a robotic bear mouth |
| `beast_bear_charge_start` | 大招開始蓄力（Boss 改版） | SFX.play('alarm', 0.45, 0.7) | entities/mech-boss-tier.js:451 | 2 | 1 | Massive mechanical bear roar, booming deep growl with furnace rumble, charging power, building up |
| `beast_bear_big_release` | 大招放出（熔岩暴雨、震地連擊） | SFX.play('alarm', 0.5, 0.9)＋招式的聲音 | entities/mech-boss-tier.js:417 | 1.5 | 2 | Massive mechanical bear roar, booming deep growl with furnace rumble, unleashing a devastating attack |
| `beast_bear_interrupt` | 大招被打斷 | SFX.stagger | entities/mech-boss-tier.js:511 | 2 | 1 | Angry mechanical bear grunt, power surge cut off with sparks |
| `beast_bear_open` | 破綻 | SFX.play('bell', 0.6, 1.3) | entities/mech-boss-tier.js:328 | 1.2 | 1 | Exposed weak spot on a robotic bear, armor plates loosening with a hiss and ping |
| `beast_bear_final_call` | 最終型態專屬招式「熔爐爆發」的宣告 | SFX.play('alarm', 0.5, 0.9) | entities/mech-boss3.js:104 | 2 | 1 | Massive mechanical bear roar, booming deep growl with furnace rumble, ultimate battle cry |
| `beast_bear_part_break` | 外掛武器被打壞（重榴彈砲、左熱熔砲、右熱熔砲） | SFX.explode(true)＋SFX.wreck | entities/mech-entity.js:2722、game/boss-tier.js:252 | 2 | 2 | Weapon pod torn off a robotic bear, explosion and tearing metal |
| `beast_bear_body_break` | 身體部位破壞（頭甲、前掌、後腿） | SFX.explode(false) | entities/mech-body.js:147 | 2 | 3 | Armored limb of a robotic bear shattering, crunching metal and sparks |
| `beast_bear_repair` | 修復被打壞的武器 | SFX.alert | entities/mech-beast.js:110、game/hud.js:152 | 2 | 1 | Robotic creature self-repairing, whirring nanotech and welding crackle |
| `beast_bear_reflect` | 打回去 | SFX.play('shield', 0.9, 1.4) | entities/mech-boss-tier.js:821 | 0.8 | 1 | Projectile deflected back toward a giant robotic beast, bright ricochet ping |

### 鱷龜型 SILT（beast_turtle，第 2 章：集散場、水壩、淹沒城區）

| 建議的音效鍵 | 事件 | 目前的聲音 | 觸發處 | 長度（秒） | 變化數 | AI 提示詞草稿 |
|---|---|---|---|---|---|---|
| `beast_turtle_roar_intro` | 登場的吼聲 | ~rumble（音高 ×1） | entities/mech-beast-fx.js:219 | 3.5 | 2 | Deep rumbling mechanical turtle bellow, low resonant hiss |
| `beast_turtle_roar_phase` | 換型態的吼聲（點綴色的爆發） | ~rumble（音高 ×1） ×0.86＋SFX.cue('phase') | entities/mech-beast-fx.js:227、game/feedback.js:265 | 3 | 2 | Deep rumbling mechanical turtle bellow, low resonant hiss, angrier and longer |
| `beast_turtle_roar_clip` | 威嚇／吼叫的片段（uShake） | ~rumble（音高 ×1） | entities/mech-beast-fx.js:244 | 2.5 | 2 | Deep rumbling mechanical turtle bellow, low resonant hiss, short threatening display |
| `beast_turtle_growl` | 出招前的低吼（每一招開始） | ~growl（音高 ×1） | entities/mech-beast-fx.js:242 | 1.2 | 3 | Low gurgling mechanical hiss |
| `beast_turtle_hurt` | 受傷（hit 片段） | 沒有聲音（只有一般的命中音 SFX.hit） | entities/mech-beast-fx.js:235（片段開始時沒有對應） | 0.8 | 3 | Grumbling mechanical turtle grunt |
| `beast_turtle_stagger` | 失衡的叫聲 | ~rumble（音高 ×1） ×1.35＋SFX.stagger | entities/mech-beast-fx.js:239、entities/mech-entity.js:1732 | 1.5 | 2 | Grumbling mechanical turtle grunt, dazed and stumbling |
| `beast_turtle_death` | 倒下（death 片段的叫聲） | ~rumble（音高 ×1） ×0.7 | entities/mech-beast-fx.js:237 | 3.5 | 1 | Mechanical turtle dying groan, long low rumble |
| `beast_turtle_collapse` | 倒下後的碎裂、爆炸 | 火花無聲（mech-beast.js:131）；最後 SFX.explode('huge')＋SFX.wreck＋SFX.stinger(true) | entities/mech-beast.js:131、entities/mech-entity.js:2722、:2762 | 5 | 1 | Giant robotic turtle collapsing, shell crashing and explosion |
| `beast_turtle_step` | 腳步（每一步） | ~bstep（依體重：音量、音高） | entities/mech-beast-fx.js:300 | 0.6 | 3 | Slow heavy robotic turtle step, wet thud |
| `beast_turtle_land` | 落地（撲擊、跳躍、躍過障礙、降落、鑽出） | ~thC＋~bstep | entities/mech-beast-fx.js:269、:270 | 1.2 | 2 | Giant robotic turtle landing, heavy shell thud |
| `beast_turtle_dodge` | 閃避（側跳 dgSideL／R、後跳 dgBack、伏低 dgDuck） | 沒有聲音 | entities/mech-dodge.js:668 | 1 | 2 | Robotic turtle shifting its bulk sideways, scraping shell |
| `beast_turtle_uSnap` | 近戰「uSnap」：瞬間咬合（招牌技） | ~tink3＋~thB | entities/mech-beast-fx.js:155、:156 | 0.8 | 2 | Lightning-fast mechanical jaw snap, sharp crushing clack |
| `beast_turtle_uTail` | 近戰「uTail」：甩尾 | ~claw＋~thC | entities/mech-beast-fx.js:147、:148 | 1.2 | 2 | Heavy armored tail sweep |
| `beast_turtle_uStomp` | 近戰「uStomp」：踩踏 | ~thC＋heavy | entities/mech-beast-fx.js:177、:178 | 1.2 | 2 | Massive turtle stomp, ground-shaking thud |
| `beast_turtle_uSpin` | 近戰「uSpin」：縮殼旋轉（滑出去再橫掃） | ~claw＋~thC | entities/mech-beast-fx.js:147、:148 | 2 | 2 | Spinning armored shell sliding and grinding across ground |
| `beast_turtle_cannon` | 背甲砲塔的雙管重機砲 | SFX.shot('bullet') | entities/mech-beast.js:285、entities/mech-entity.js:883 | 1.5 | 2 | Twin heavy machine gun turret firing |
| `beast_turtle_torp` | 兩側的魚雷 | SFX.shot('missile') | entities/mech-beast.js:357、entities/mech-entity.js:1074 | 1.5 | 2 | Torpedoes launching with a whoosh and splash |
| `beast_turtle_dc` | 深水炸彈（三發拋射） | 發射 SFX.shot('grenade')（game/support.js:165）＋落地 SFX.explode（entities/projectile.js:303）；預警圈無聲 | entities/mech-beast.js:432 | 2 | 2 | Depth charges lobbed, thumps and splashing explosions |
| `beast_turtle_spikes` | 背甲稜刺的四射刺彈（一整圈） | 預警線無聲；發射 SFX.play('laserBig', 0.8, 0.9)（entities/mech-boss3.js:242） | entities/mech-beast.js:360～385 | 1.5 | 2 | Spikes fired in all directions from a shell, metallic shooting thwacks |
| `beast_turtle_charge_start` | 大招開始蓄力（Boss 改版） | SFX.play('alarm', 0.45, 0.7) | entities/mech-boss-tier.js:451 | 2 | 1 | Deep rumbling mechanical turtle bellow, low resonant hiss, charging power, building up |
| `beast_turtle_big_release` | 大招放出（深水炸彈雨、稜刺風暴） | SFX.play('alarm', 0.5, 0.9)＋招式的聲音 | entities/mech-boss-tier.js:417 | 1.5 | 2 | Deep rumbling mechanical turtle bellow, low resonant hiss, unleashing a devastating attack |
| `beast_turtle_interrupt` | 大招被打斷 | SFX.stagger | entities/mech-boss-tier.js:511 | 2 | 1 | Grumbling mechanical turtle grunt, power surge cut off with sparks |
| `beast_turtle_open` | 破綻 | SFX.play('bell', 0.6, 1.3) | entities/mech-boss-tier.js:328 | 1.2 | 1 | Exposed weak spot on a robotic alligator snapping turtle, armor plates loosening with a hiss and ping |
| `beast_turtle_final_call` | 最終型態專屬招式「怒濤旋殼」的宣告 | SFX.play('alarm', 0.5, 0.9) | entities/mech-boss3.js:104 | 2 | 1 | Deep rumbling mechanical turtle bellow, low resonant hiss, ultimate battle cry |
| `beast_turtle_part_break` | 外掛武器被打壞（重機砲塔、左魚雷架、右魚雷架） | SFX.explode(true)＋SFX.wreck | entities/mech-entity.js:2722、game/boss-tier.js:252 | 2 | 2 | Weapon pod torn off a robotic alligator snapping turtle, explosion and tearing metal |
| `beast_turtle_body_break` | 身體部位破壞（頭頸、前肢、後肢、尾巴） | SFX.explode(false) | entities/mech-body.js:147 | 2 | 3 | Armored limb of a robotic alligator snapping turtle shattering, crunching metal and sparks |
| `beast_turtle_repair` | 修復被打壞的武器 | SFX.alert | entities/mech-beast.js:110、game/hud.js:152 | 2 | 1 | Robotic creature self-repairing, whirring nanotech and welding crackle |
| `beast_turtle_reflect` | 打回去 | SFX.play('shield', 0.9, 1.4) | entities/mech-boss-tier.js:821 | 0.8 | 1 | Projectile deflected back toward a giant robotic beast, bright ricochet ping |
| `beast_turtle_flip` | 失衡時翻倒（uFlip） | 同失衡的叫聲 | data/beasts.js:416 | 2 | 1 | Giant turtle flipping onto its back, crashing shell and flailing |

### 猩猩型 WRECKER（beast_gorilla，第 4 章：Lattice-9、舊宇宙港）

| 建議的音效鍵 | 事件 | 目前的聲音 | 觸發處 | 長度（秒） | 變化數 | AI 提示詞草稿 |
|---|---|---|---|---|---|---|
| `beast_gorilla_roar_intro` | 登場的吼聲 | ~roarH（音高 ×1.12） | entities/mech-beast-fx.js:219 | 3.5 | 2 | Furious mechanical gorilla roar with chest-drumming metal booms |
| `beast_gorilla_roar_phase` | 換型態的吼聲（點綴色的爆發） | ~roarH（音高 ×1.12） ×0.86＋SFX.cue('phase') | entities/mech-beast-fx.js:227、game/feedback.js:265 | 3 | 2 | Furious mechanical gorilla roar with chest-drumming metal booms, angrier and longer |
| `beast_gorilla_roar_clip` | 威嚇／吼叫的片段（gDrum、gStand） | ~roarH（音高 ×1.12） | entities/mech-beast-fx.js:244 | 2.5 | 2 | Furious mechanical gorilla roar with chest-drumming metal booms, short threatening display |
| `beast_gorilla_growl` | 出招前的低吼（每一招開始） | ~growl（音高 ×1.12） | entities/mech-beast-fx.js:242 | 1.2 | 3 | Low huffing mechanical gorilla grunt |
| `beast_gorilla_hurt` | 受傷（hit 片段） | 沒有聲音（只有一般的命中音 SFX.hit） | entities/mech-beast-fx.js:235（片段開始時沒有對應） | 0.8 | 3 | Angry mechanical ape bark |
| `beast_gorilla_stagger` | 失衡的叫聲 | ~roarH（音高 ×1.12） ×1.35＋SFX.stagger | entities/mech-beast-fx.js:239、entities/mech-entity.js:1732 | 1.5 | 2 | Angry mechanical ape bark, dazed and stumbling |
| `beast_gorilla_death` | 倒下（death 片段的叫聲） | ~roarH（音高 ×1.12） ×0.7 | entities/mech-beast-fx.js:237 | 3.5 | 1 | Dying mechanical gorilla groan |
| `beast_gorilla_collapse` | 倒下後的碎裂、爆炸 | 火花無聲（mech-beast.js:131）；最後 SFX.explode('huge')＋SFX.wreck＋SFX.stinger(true) | entities/mech-beast.js:131、entities/mech-entity.js:2722、:2762 | 5 | 1 | Giant robotic gorilla toppling, heavy crash and explosion |
| `beast_gorilla_step` | 腳步（每一步） | ~bstep（依體重：音量、音高） | entities/mech-beast-fx.js:300 | 0.6 | 3 | Robotic gorilla knuckle-walk thud |
| `beast_gorilla_land` | 落地（撲擊、跳躍、躍過障礙、降落、鑽出） | ~thC＋~bstep | entities/mech-beast-fx.js:269、:270 | 1.2 | 2 | Robotic gorilla landing from a leap, huge thud |
| `beast_gorilla_dodge` | 閃避（側跳 dgSideL／R、後跳 dgBack、伏低 dgDuck） | 沒有聲音 | entities/mech-dodge.js:668 | 1 | 2 | Robotic gorilla hopping sideways, knuckle scrape |
| `beast_gorilla_gSlam` | 近戰「gSlam」：雙拳搥地 | ~thC＋heavy | entities/mech-beast-fx.js:177、:178 | 1.5 | 2 | Two giant metal fists smashing the ground |
| `beast_gorilla_gSweepL` | 近戰「gSweepL」：左手橫掃 | ~claw＋~thC | entities/mech-beast-fx.js:147、:148 | 1.2 | 2 | Massive arm sweep, whooshing swing |
| `beast_gorilla_gSweepR` | 近戰「gSweepR」：右手橫掃 | ~claw＋~thC | entities/mech-beast-fx.js:147、:148 | 1.2 | 2 | Massive arm sweep from the right |
| `beast_gorilla_gLeap` | 近戰「gLeap」：跳躍搥擊 | ~thC＋heavy | entities/mech-beast-fx.js:177、:178 | 1.5 | 2 | Leaping ground pound, explosive impact |
| `beast_gorilla_gSwing` | 近戰「gSwing」：擺盪飛踢 | ~claw＋~thC | entities/mech-beast-fx.js:147、:148 | 1.5 | 2 | Swinging flying kick, rushing whoosh and impact |
| `beast_gorilla_rotary` | 前臂的轉管機砲（兩隻手一起掃） | SFX.shot('bullet') | entities/mech-beast.js:285、entities/mech-entity.js:883 | 2 | 2 | Arm-mounted rotary cannons spinning and firing |
| `beast_gorilla_harpoon` | 絞盤魚叉砲（預警線後射出、鉤住拉過來） | 預警線無聲；發射 SFX.play('laserBig', 0.8, 0.9)（entities/mech-boss3.js:242）（鉤住本身無聲） | entities/mech-beast.js:388～415 | 2 | 2 | Harpoon cannon firing and winch reeling chain |
| `beast_gorilla_chest` | 胸口反應爐胸砲（搥胸蓄力後） | 預警線無聲；發射 SFX.play('laserBig', 0.8, 0.9)（entities/mech-boss3.js:242） | entities/mech-beast.js:388 | 2.5 | 2 | Chest reactor beam cannon firing a thick energy blast |
| `beast_gorilla_charge_start` | 大招開始蓄力（Boss 改版） | SFX.play('alarm', 0.45, 0.7) | entities/mech-boss-tier.js:451 | 2 | 1 | Furious mechanical gorilla roar with chest-drumming metal booms, charging power, building up |
| `beast_gorilla_big_release` | 大招放出（搥地震波、彈雨掃射） | SFX.play('alarm', 0.5, 0.9)＋招式的聲音 | entities/mech-boss-tier.js:417 | 1.5 | 2 | Furious mechanical gorilla roar with chest-drumming metal booms, unleashing a devastating attack |
| `beast_gorilla_interrupt` | 大招被打斷 | SFX.stagger | entities/mech-boss-tier.js:511 | 2 | 1 | Angry mechanical ape bark, power surge cut off with sparks |
| `beast_gorilla_open` | 破綻 | SFX.play('bell', 0.6, 1.3) | entities/mech-boss-tier.js:328 | 1.2 | 1 | Exposed weak spot on a robotic gorilla, armor plates loosening with a hiss and ping |
| `beast_gorilla_final_call` | 最終型態專屬招式「狂暴連擊」的宣告 | SFX.play('alarm', 0.5, 0.9) | entities/mech-boss3.js:104 | 2 | 1 | Furious mechanical gorilla roar with chest-drumming metal booms, ultimate battle cry |
| `beast_gorilla_part_break` | 外掛武器被打壞（左臂機砲、右臂機砲、左魚叉砲、右魚叉砲） | SFX.explode(true)＋SFX.wreck | entities/mech-entity.js:2722、game/boss-tier.js:252 | 2 | 2 | Weapon pod torn off a robotic gorilla, explosion and tearing metal |
| `beast_gorilla_body_break` | 身體部位破壞（左拳、右拳、頭部、後腿） | SFX.explode(false) | entities/mech-body.js:147 | 2 | 3 | Armored limb of a robotic gorilla shattering, crunching metal and sparks |
| `beast_gorilla_repair` | 修復被打壞的武器 | SFX.alert | entities/mech-beast.js:110、game/hud.js:152 | 2 | 1 | Robotic creature self-repairing, whirring nanotech and welding crackle |
| `beast_gorilla_reflect` | 打回去 | SFX.play('shield', 0.9, 1.4) | entities/mech-boss-tier.js:821 | 0.8 | 1 | Projectile deflected back toward a giant robotic beast, bright ricochet ping |
| `beast_gorilla_throw` | 丟東西（gThrow） | 沒有聲音 | data/beasts.js:648 | 1.5 | 1 | Robotic gorilla hurling a heavy object, grunt and whoosh |

### 蠍型 UNDERTAKER（beast_scorpion，第 1 章：荒野、沙丘、礦坑）

| 建議的音效鍵 | 事件 | 目前的聲音 | 觸發處 | 長度（秒） | 變化數 | AI 提示詞草稿 |
|---|---|---|---|---|---|---|
| `beast_scorpion_roar_intro` | 登場的吼聲 | ~chitter（音高 ×0.82） | entities/mech-beast-fx.js:219 | 3.5 | 2 | Mechanical scorpion threat display, rapid metallic chittering and hiss |
| `beast_scorpion_roar_phase` | 換型態的吼聲（點綴色的爆發） | ~chitter（音高 ×0.82） ×0.86＋SFX.cue('phase') | entities/mech-beast-fx.js:227、game/feedback.js:265 | 3 | 2 | Mechanical scorpion threat display, rapid metallic chittering and hiss, angrier and longer |
| `beast_scorpion_roar_clip` | 威嚇／吼叫的片段（sThreat） | ~chitter（音高 ×0.82） | entities/mech-beast-fx.js:244 | 2.5 | 2 | Mechanical scorpion threat display, rapid metallic chittering and hiss, short threatening display |
| `beast_scorpion_growl` | 出招前的低吼（每一招開始） | ~growl（音高 ×0.82） | entities/mech-beast-fx.js:242 | 1.2 | 3 | Low clicking mechanical chitter |
| `beast_scorpion_hurt` | 受傷（hit 片段） | 沒有聲音（只有一般的命中音 SFX.hit） | entities/mech-beast-fx.js:235（片段開始時沒有對應） | 0.8 | 3 | Shrill mechanical insect screech |
| `beast_scorpion_stagger` | 失衡的叫聲 | ~chitter（音高 ×0.82） ×1.35＋SFX.stagger | entities/mech-beast-fx.js:239、entities/mech-entity.js:1732 | 1.5 | 2 | Shrill mechanical insect screech, dazed and stumbling |
| `beast_scorpion_death` | 倒下（death 片段的叫聲） | ~chitter（音高 ×0.82） ×0.7 | entities/mech-beast-fx.js:237 | 3.5 | 1 | Dying mechanical scorpion screech fading into twitching clicks |
| `beast_scorpion_collapse` | 倒下後的碎裂、爆炸 | 火花無聲（mech-beast.js:131）；最後 SFX.explode('huge')＋SFX.wreck＋SFX.stinger(true) | entities/mech-beast.js:131、entities/mech-entity.js:2722、:2762 | 5 | 1 | Giant robotic scorpion collapsing, legs clattering and explosion |
| `beast_scorpion_step` | 腳步（每一步） | ~bstep（依體重：音量、音高） | entities/mech-beast-fx.js:300 | 0.6 | 3 | Skittering metallic legs of a giant scorpion, rapid clicks |
| `beast_scorpion_land` | 落地（撲擊、跳躍、躍過障礙、降落、鑽出） | ~thC＋~bstep | entities/mech-beast-fx.js:269、:270 | 1.2 | 2 | Robotic scorpion emerging and landing, sand burst |
| `beast_scorpion_dodge` | 閃避（側跳 dgSideL／R、後跳 dgBack、伏低 dgDuck） | 沒有聲音 | entities/mech-dodge.js:668 | 1 | 2 | Robotic scorpion scuttling sideways, rapid leg clatter |
| `beast_scorpion_sSting` | 近戰「sSting」：尾刺 | ~zapC＋~thB | entities/mech-beast-fx.js:164、:165 | 1 | 2 | Giant stinger striking down, piercing electric stab |
| `beast_scorpion_sPinchL` | 近戰「sPinchL」：左螯夾 | ~tink3＋~thB | entities/mech-beast-fx.js:155、:156 | 0.8 | 2 | Giant pincer snapping shut, metallic clamp |
| `beast_scorpion_sPinchR` | 近戰「sPinchR」：右螯夾 | ~tink3＋~thB | entities/mech-beast-fx.js:155、:156 | 0.8 | 2 | Giant pincer snapping shut from the right |
| `beast_scorpion_sGrab` | 近戰「sGrab」：抓 | ~tink3＋~thB | entities/mech-beast-fx.js:155、:156 | 1.2 | 2 | Pincers grabbing and crushing |
| `beast_scorpion_sTailSweep` | 近戰「sTailSweep」：甩尾橫掃（一整圈） | ~claw＋~thC | entities/mech-beast-fx.js:147、:148 | 1.5 | 2 | Scorpion tail sweeping in a full circle |
| `beast_scorpion_sEmerge` | 近戰「sEmerge」：鑽地突襲（從腳下鑽出） | ~thC＋heavy | entities/mech-beast-fx.js:177、:178 | 2 | 2 | Robotic scorpion bursting out of the sand |
| `beast_scorpion_cutter` | 螯臂的電漿切割砲（兩道光束） | 預警線無聲；發射 SFX.play('laserBig', 0.8, 0.9)（entities/mech-boss3.js:242） | entities/mech-beast.js:388 | 2 | 2 | Plasma cutter beams firing from claws |
| `beast_scorpion_mortar` | 背上的爆破迫擊筒（六發） | 發射 SFX.shot('grenade')（game/support.js:165）＋落地 SFX.explode（entities/projectile.js:303）；預警圈無聲 | entities/mech-beast.js:432 | 2.5 | 2 | Mining mortar tubes firing six rounds |
| `beast_scorpion_venom` | 尾針的毒液彈（落地留腐蝕區） | 發射 SFX.shot('grenade')（game/support.js:165）＋落地 SFX.explode（entities/projectile.js:303）；預警圈無聲；腐蝕區無聲 | entities/mech-beast.js:432～445 | 1.5 | 2 | Venom glob spat from a stinger, wet splash and acid sizzle |
| `beast_scorpion_charge_start` | 大招開始蓄力（Boss 改版） | SFX.play('alarm', 0.45, 0.7) | entities/mech-boss-tier.js:451 | 2 | 1 | Mechanical scorpion threat display, rapid metallic chittering and hiss, charging power, building up |
| `beast_scorpion_big_release` | 大招放出（爆破砲雨、毒霧噴發） | SFX.play('alarm', 0.5, 0.9)＋招式的聲音 | entities/mech-boss-tier.js:417 | 1.5 | 2 | Mechanical scorpion threat display, rapid metallic chittering and hiss, unleashing a devastating attack |
| `beast_scorpion_interrupt` | 大招被打斷 | SFX.stagger | entities/mech-boss-tier.js:511 | 2 | 1 | Shrill mechanical insect screech, power surge cut off with sparks |
| `beast_scorpion_open` | 破綻 | SFX.play('bell', 0.6, 1.3) | entities/mech-boss-tier.js:328 | 1.2 | 1 | Exposed weak spot on a robotic scorpion, armor plates loosening with a hiss and ping |
| `beast_scorpion_final_call` | 最終型態專屬招式「毒沙風暴」的宣告 | SFX.play('alarm', 0.5, 0.9) | entities/mech-boss3.js:104 | 2 | 1 | Mechanical scorpion threat display, rapid metallic chittering and hiss, ultimate battle cry |
| `beast_scorpion_part_break` | 外掛武器被打壞（左切割砲、右切割砲、爆破迫擊筒） | SFX.explode(true)＋SFX.wreck | entities/mech-entity.js:2722、game/boss-tier.js:252 | 2 | 2 | Weapon pod torn off a robotic scorpion, explosion and tearing metal |
| `beast_scorpion_body_break` | 身體部位破壞（左螯、右螯、尾針、步足） | SFX.explode(false) | entities/mech-body.js:147 | 2 | 3 | Armored limb of a robotic scorpion shattering, crunching metal and sparks |
| `beast_scorpion_repair` | 修復被打壞的武器 | SFX.alert | entities/mech-beast.js:110、game/hud.js:152 | 2 | 1 | Robotic creature self-repairing, whirring nanotech and welding crackle |
| `beast_scorpion_reflect` | 打回去 | SFX.play('shield', 0.9, 1.4) | entities/mech-boss-tier.js:821 | 0.8 | 1 | Projectile deflected back toward a giant robotic beast, bright ricochet ping |
| `beast_scorpion_burrow_loop` | 鑽在地下移動（sBurrow，循環） | 沒有聲音 | data/beasts.js:795 | 4 | 1 | Seamless loop of something large burrowing under sand, gritty rumble |

### 螳螂型 VESPER（beast_mantis，第 6 章：高空軌道）

| 建議的音效鍵 | 事件 | 目前的聲音 | 觸發處 | 長度（秒） | 變化數 | AI 提示詞草稿 |
|---|---|---|---|---|---|---|
| `beast_mantis_roar_intro` | 登場的吼聲 | ~chitter（音高 ×1.2） | entities/mech-beast-fx.js:219 | 3.5 | 2 | Mechanical mantis threat screech, high metallic rasping and wing buzz |
| `beast_mantis_roar_phase` | 換型態的吼聲（點綴色的爆發） | ~chitter（音高 ×1.2） ×0.86＋SFX.cue('phase') | entities/mech-beast-fx.js:227、game/feedback.js:265 | 3 | 2 | Mechanical mantis threat screech, high metallic rasping and wing buzz, angrier and longer |
| `beast_mantis_roar_clip` | 威嚇／吼叫的片段（mThreat） | ~chitter（音高 ×1.2） | entities/mech-beast-fx.js:244 | 2.5 | 2 | Mechanical mantis threat screech, high metallic rasping and wing buzz, short threatening display |
| `beast_mantis_growl` | 出招前的低吼（每一招開始） | ~growl（音高 ×1.2） | entities/mech-beast-fx.js:242 | 1.2 | 3 | Low clicking mantis chitter |
| `beast_mantis_hurt` | 受傷（hit 片段） | 沒有聲音（只有一般的命中音 SFX.hit） | entities/mech-beast-fx.js:235（片段開始時沒有對應） | 0.8 | 3 | Sharp mechanical insect shriek |
| `beast_mantis_stagger` | 失衡的叫聲 | ~chitter（音高 ×1.2） ×1.35＋SFX.stagger | entities/mech-beast-fx.js:239、entities/mech-entity.js:1732 | 1.5 | 2 | Sharp mechanical insect shriek, dazed and stumbling |
| `beast_mantis_death` | 倒下（death 片段的叫聲） | ~chitter（音高 ×1.2） ×0.7 | entities/mech-beast-fx.js:237 | 3.5 | 1 | Dying mechanical mantis shriek fading out |
| `beast_mantis_collapse` | 倒下後的碎裂、爆炸 | 火花無聲（mech-beast.js:131）；最後 SFX.explode('huge')＋SFX.wreck＋SFX.stinger(true) | entities/mech-beast.js:131、entities/mech-entity.js:2722、:2762 | 5 | 1 | Giant robotic mantis collapsing, thin limbs clattering and explosion |
| `beast_mantis_step` | 腳步（每一步） | ~bstep（依體重：音量、音高） | entities/mech-beast-fx.js:300 | 0.6 | 3 | Light sharp metallic step of a giant mantis |
| `beast_mantis_land` | 落地（撲擊、跳躍、躍過障礙、降落、鑽出） | ~thC＋~bstep | entities/mech-beast-fx.js:269、:270 | 1.2 | 2 | Robotic mantis landing from a hover, sharp thud |
| `beast_mantis_dodge` | 閃避（側跳 dgSideL／R、後跳 dgBack、伏低 dgDuck） | 沒有聲音 | entities/mech-dodge.js:668 | 1 | 2 | Robotic mantis flitting sideways, quick wing buzz |
| `beast_mantis_mSlashL` | 近戰「mSlashL」：左鐮 | ~claw＋~thB | entities/mech-beast-fx.js:140、:141 | 0.8 | 2 | Razor scythe slash, fast steel swish |
| `beast_mantis_mSlashR` | 近戰「mSlashR」：右鐮 | ~claw＋~thB | entities/mech-beast-fx.js:140、:141 | 0.8 | 2 | Razor scythe slash from the right |
| `beast_mantis_mCross` | 近戰「mCross」：雙鐮交叉斬 | ~claw＋~thB | entities/mech-beast-fx.js:140、:141 | 1 | 2 | Double scythe cross slash, ringing steel |
| `beast_mantis_mGrab` | 近戰「mGrab」：捕捉 | ~tink3＋~thB | entities/mech-beast-fx.js:155、:156 | 1.2 | 2 | Mantis grabbing prey with spiked forelegs |
| `beast_mantis_mDive` | 近戰「mDive」：飛起來俯衝斬 | ~thC＋heavy | entities/mech-beast-fx.js:177、:178 | 1.5 | 2 | Mantis diving from the air and slashing |
| `beast_mantis_pulse` | 前胸的脈衝雷射機砲 | SFX.shot('laser') | entities/mech-beast.js:285、entities/mech-entity.js:1264 | 1.5 | 2 | Pulse laser guns firing rapid shots |
| `beast_mantis_ooth` | 腹下的卵鞘空雷（目標周圍一群） | 布雷 SFX.play('ui2', 0.5, 1.6)（game/support.js:323）、觸發 ui2（:421／:428）、爆炸 SFX.explode（:474） | entities/mech-beast.js:416～431 | 1.5 | 1 | Floating mines ejected from an egg sac, popping and beeping |
| `beast_mantis_wave` | 鐮的斬擊波 | 預警線無聲；發射 SFX.play('laserBig', 0.8, 0.9)（entities/mech-boss3.js:242） | entities/mech-beast.js:388 | 1.5 | 2 | Energy slash wave flying from a scythe |
| `beast_mantis_charge_start` | 大招開始蓄力（Boss 改版） | SFX.play('alarm', 0.45, 0.7) | entities/mech-boss-tier.js:451 | 2 | 1 | Mechanical mantis threat screech, high metallic rasping and wing buzz, charging power, building up |
| `beast_mantis_big_release` | 大招放出（空雷封鎖、刃光十字） | SFX.play('alarm', 0.5, 0.9)＋招式的聲音 | entities/mech-boss-tier.js:417 | 1.5 | 2 | Mechanical mantis threat screech, high metallic rasping and wing buzz, unleashing a devastating attack |
| `beast_mantis_interrupt` | 大招被打斷 | SFX.stagger | entities/mech-boss-tier.js:511 | 2 | 1 | Sharp mechanical insect shriek, power surge cut off with sparks |
| `beast_mantis_open` | 破綻 | SFX.play('bell', 0.6, 1.3) | entities/mech-boss-tier.js:328 | 1.2 | 1 | Exposed weak spot on a robotic praying mantis, armor plates loosening with a hiss and ping |
| `beast_mantis_final_call` | 最終型態專屬招式「千刃亂舞」的宣告 | SFX.play('alarm', 0.5, 0.9) | entities/mech-boss3.js:104 | 2 | 1 | Mechanical mantis threat screech, high metallic rasping and wing buzz, ultimate battle cry |
| `beast_mantis_part_break` | 外掛武器被打壞（左雷射機砲、右雷射機砲、空雷發射器） | SFX.explode(true)＋SFX.wreck | entities/mech-entity.js:2722、game/boss-tier.js:252 | 2 | 2 | Weapon pod torn off a robotic praying mantis, explosion and tearing metal |
| `beast_mantis_body_break` | 身體部位破壞（左鐮、右鐮、翅、腹部） | SFX.explode(false) | entities/mech-body.js:147 | 2 | 3 | Armored limb of a robotic praying mantis shattering, crunching metal and sparks |
| `beast_mantis_repair` | 修復被打壞的武器 | SFX.alert | entities/mech-beast.js:110、game/hud.js:152 | 2 | 1 | Robotic creature self-repairing, whirring nanotech and welding crackle |
| `beast_mantis_reflect` | 打回去 | SFX.play('shield', 0.9, 1.4) | entities/mech-boss-tier.js:821 | 0.8 | 1 | Projectile deflected back toward a giant robotic beast, bright ricochet ping |
| `beast_mantis_hover` | 飛起來（mHover，翅膀振動） | 沒有聲音 | data/beasts.js:789 | 3 | 1 | Seamless loop of large insect wings buzzing, mechanical vibration |

### 猛禽型 SHRIKE（beast_raptor，第 5 章：洋上都市）

| 建議的音效鍵 | 事件 | 目前的聲音 | 觸發處 | 長度（秒） | 變化數 | AI 提示詞草稿 |
|---|---|---|---|---|---|---|
| `beast_raptor_roar_intro` | 登場的吼聲 | ~screech（音高 ×1） | entities/mech-beast-fx.js:219 | 3.5 | 2 | Piercing mechanical bird of prey screech, metallic and echoing |
| `beast_raptor_roar_phase` | 換型態的吼聲（點綴色的爆發） | ~screech（音高 ×1） ×0.86＋SFX.cue('phase') | entities/mech-beast-fx.js:227、game/feedback.js:265 | 3 | 2 | Piercing mechanical bird of prey screech, metallic and echoing, angrier and longer |
| `beast_raptor_roar_clip` | 威嚇／吼叫的片段（rScreech） | ~screech（音高 ×1） | entities/mech-beast-fx.js:244 | 2.5 | 2 | Piercing mechanical bird of prey screech, metallic and echoing, short threatening display |
| `beast_raptor_growl` | 出招前的低吼（每一招開始） | ~growl（音高 ×1） | entities/mech-beast-fx.js:242 | 1.2 | 3 | Low clicking mechanical bird trill |
| `beast_raptor_hurt` | 受傷（hit 片段） | 沒有聲音（只有一般的命中音 SFX.hit） | entities/mech-beast-fx.js:235（片段開始時沒有對應） | 0.8 | 3 | Sharp mechanical bird squawk |
| `beast_raptor_stagger` | 失衡的叫聲 | ~screech（音高 ×1） ×1.35＋SFX.stagger | entities/mech-beast-fx.js:239、entities/mech-entity.js:1732 | 1.5 | 2 | Sharp mechanical bird squawk, dazed and stumbling |
| `beast_raptor_death` | 倒下（death 片段的叫聲） | ~screech（音高 ×1） ×0.7 | entities/mech-beast-fx.js:237 | 3.5 | 1 | Dying mechanical raptor screech fading as it falls |
| `beast_raptor_collapse` | 倒下後的碎裂、爆炸 | 火花無聲（mech-beast.js:131）；最後 SFX.explode('huge')＋SFX.wreck＋SFX.stinger(true) | entities/mech-beast.js:131、entities/mech-entity.js:2722、:2762 | 5 | 1 | Giant robotic bird crashing down, wings breaking and explosion |
| `beast_raptor_step` | 腳步（每一步） | ~bstep（依體重：音量、音高） | entities/mech-beast-fx.js:300 | 0.6 | 3 | Heavy taloned step of a giant robotic bird |
| `beast_raptor_land` | 落地（撲擊、跳躍、躍過障礙、降落、鑽出） | ~thC＋~bstep | entities/mech-beast-fx.js:269、:270 | 1.2 | 2 | Giant robotic bird landing, wings flaring and talons striking |
| `beast_raptor_dodge` | 閃避（側跳 dgSideL／R、後跳 dgBack、伏低 dgDuck） | 沒有聲音 | entities/mech-dodge.js:668 | 1 | 2 | Robotic raptor banking aside, wing whoosh |
| `beast_raptor_rPeck` | 近戰「rPeck」：啄 | ~tink3＋~thB | entities/mech-beast-fx.js:155、:156 | 0.8 | 2 | Giant metal beak pecking, sharp strike |
| `beast_raptor_rWingSlashL` | 近戰「rWingSlashL」：左翼刃 | ~claw＋~thB | entities/mech-beast-fx.js:140、:141 | 1 | 2 | Bladed wing slash |
| `beast_raptor_rWingSlashR` | 近戰「rWingSlashR」：右翼刃 | ~claw＋~thB | entities/mech-beast-fx.js:140、:141 | 1 | 2 | Bladed wing slash from the right |
| `beast_raptor_rKick` | 近戰「rKick」：踢 | ~claw＋~thB | entities/mech-beast-fx.js:140、:141 | 1 | 2 | Talon kick, ripping strike |
| `beast_raptor_rDive` | 近戰「rDive」：俯衝爪擊（招牌技，只在空中） | ~thC＋heavy | entities/mech-beast-fx.js:177、:178 | 2 | 2 | Raptor diving from the sky, screaming air and talon impact |
| `beast_raptor_msl` | 翼下的空對地導彈 | SFX.shot('missile') | entities/mech-beast.js:357、entities/mech-entity.js:1074 | 1.5 | 2 | Underwing missiles launching |
| `beast_raptor_bay` | 腹下的集束炸彈（落地留燃燒帶） | 發射 SFX.shot('grenade')（game/support.js:165）＋落地 SFX.explode（entities/projectile.js:303）；預警圈無聲 | entities/mech-beast.js:432 | 2.5 | 2 | Cluster bombs dropping and exploding in a line |
| `beast_raptor_feather` | 羽刃齊射（地面、扇形的鋼羽） | 預警線無聲；發射 SFX.play('laserBig', 0.8, 0.9)（entities/mech-boss3.js:242） | entities/mech-beast.js:360～385 | 1.5 | 2 | Steel feather blades fired in a fan |
| `beast_raptor_gust` | 振翅強風（把前方往外推） | 沒有聲音（cone 的 noFx） | entities/mech-beast.js:290～312 | 2 | 1 | Powerful wing flap creating a gust of wind |
| `beast_raptor_charge_start` | 大招開始蓄力（Boss 改版） | SFX.play('alarm', 0.45, 0.7) | entities/mech-boss-tier.js:451 | 2 | 1 | Piercing mechanical bird of prey screech, metallic and echoing, charging power, building up |
| `beast_raptor_big_release` | 大招放出（地毯轟炸、羽刃風暴） | SFX.play('alarm', 0.5, 0.9)＋招式的聲音 | entities/mech-boss-tier.js:417 | 1.5 | 2 | Piercing mechanical bird of prey screech, metallic and echoing, unleashing a devastating attack |
| `beast_raptor_interrupt` | 大招被打斷 | SFX.stagger | entities/mech-boss-tier.js:511 | 2 | 1 | Sharp mechanical bird squawk, power surge cut off with sparks |
| `beast_raptor_open` | 破綻 | SFX.play('bell', 0.6, 1.3) | entities/mech-boss-tier.js:328 | 1.2 | 1 | Exposed weak spot on a robotic raptor bird, armor plates loosening with a hiss and ping |
| `beast_raptor_final_call` | 最終型態專屬招式「天降轟炸」的宣告 | SFX.play('alarm', 0.5, 0.9) | entities/mech-boss3.js:104 | 2 | 1 | Piercing mechanical bird of prey screech, metallic and echoing, ultimate battle cry |
| `beast_raptor_part_break` | 外掛武器被打壞（左翼導彈、右翼導彈、炸彈艙） | SFX.explode(true)＋SFX.wreck | entities/mech-entity.js:2722、game/boss-tier.js:252 | 2 | 2 | Weapon pod torn off a robotic raptor bird, explosion and tearing metal |
| `beast_raptor_body_break` | 身體部位破壞（左翼、右翼、尾舵、腳爪） | SFX.explode(false) | entities/mech-body.js:147 | 2 | 3 | Armored limb of a robotic raptor bird shattering, crunching metal and sparks |
| `beast_raptor_repair` | 修復被打壞的武器 | SFX.alert | entities/mech-beast.js:110、game/hud.js:152 | 2 | 1 | Robotic creature self-repairing, whirring nanotech and welding crackle |
| `beast_raptor_reflect` | 打回去 | SFX.play('shield', 0.9, 1.4) | entities/mech-boss-tier.js:821 | 0.8 | 1 | Projectile deflected back toward a giant robotic beast, bright ricochet ping |
| `beast_raptor_flap` | 在空中拍翼（每 0.58 秒） | ~flap | entities/mech-beast-fx.js:278 | 0.6 | 3 | Single heavy mechanical wing flap, whooshing air and metal creak |
| `beast_raptor_takeoff` | 起飛（rTakeoff） | 沒有聲音 | data/beasts.js:953 | 2 | 1 | Giant robotic bird taking off, wings beating hard |
| `beast_raptor_glide_loop` | 在空中盤旋（循環） | 沒有聲音 | entities/mech-beast.js:550（beastMove 的 fly） | 5 | 1 | Seamless loop of a huge mechanical bird gliding, wind rush |

## 三、專屬 AC（data/foes.js 的 ACES，15 台）與宿敵（game/nemesis.js）

專屬 AC 都是機甲，開火、QB、腳步、推進、失衡、擊破照一般 AC（`SFX.shot`、`SFX.qb`、`SFX.step`、`SFX.stagger`、`SFX.explode(true)`＋`SFX.wreck`）。下面列每台建議專屬的事件。



| 建議的音效鍵 | 事件 | 目前的聲音 | 觸發處 | 長度（秒） | 變化數 | AI 提示詞草稿 |
|---|---|---|---|---|---|---|
| `ace_oxide_intro` | OXIDE（荒野，ai ac；每次組裝不同）：介入（名牌與介紹） | SFX.alert（flashAlert） | game/mission.js:684～688 | 2.5 | 1 | Rival ace mech arriving, signature engine roar and a menacing radio crackle |
| `ace_oxide_down` | OXIDE（荒野，ai ac；每次組裝不同）：擊破（aceDown） | SFX.explode(true)＋SFX.wreck | entities/mech-entity.js:2722、:2723 | 3 | 1 | Ace mech destroyed, big explosion and dying engine |
| `ace_stevedore_intro` | STEVEDORE（集散場，ai bastion）：介入（名牌與介紹） | SFX.alert（flashAlert） | game/mission.js:684～688 | 2.5 | 1 | Rival ace mech arriving, signature engine roar and a menacing radio crackle |
| `ace_stevedore_stomp` | STEVEDORE（集散場，ai bastion）：踏地衝擊波 | 預警無聲；擴散開始時 SFX.explode(true)（fx/effects.js:1817） | entities/mech-entity.js:4321 | 2 | 2 | Heavy mech stomping, seismic thud and shockwave |
| `ace_stevedore_down` | STEVEDORE（集散場，ai bastion）：擊破（aceDown） | SFX.explode(true)＋SFX.wreck | entities/mech-entity.js:2722、:2723 | 3 | 1 | Ace mech destroyed, big explosion and dying engine |
| `ace_sluice_intro` | SLUICE（水壩，ai strider）：介入（名牌與介紹） | SFX.alert（flashAlert） | game/mission.js:684～688 | 2.5 | 1 | Rival ace mech arriving, signature engine roar and a menacing radio crackle |
| `ace_sluice_dash` | SLUICE（水壩，ai strider）：衝刺預警（預警招式 charge） | SFX.play('charge', 0.5, 1.2) | entities/mech-moves.js:129 | 1.5 | 2 | Four-legged gun platform revving before a dash |
| `ace_sluice_down` | SLUICE（水壩，ai strider）：擊破（aceDown） | SFX.explode(true)＋SFX.wreck | entities/mech-entity.js:2722、:2723 | 3 | 1 | Ace mech destroyed, big explosion and dying engine |
| `ace_marsh_intro` | MARSH（淹沒城區，ai marsh）：介入（名牌與介紹） | SFX.alert（flashAlert） | game/mission.js:684～688 | 2.5 | 1 | Rival ace mech arriving, signature engine roar and a menacing radio crackle |
| `ace_marsh_submerge` | MARSH（淹沒城區，ai marsh）：潛入水中（潛行） | 沒有聲音 | entities/mech-foe.js:392～400 | 1.5 | 2 | Mech submerging into murky water, bubbling splash |
| `ace_marsh_surface` | MARSH（淹沒城區，ai marsh）：浮出水面 | 沒有聲音 | entities/mech-foe.js:392～400 | 1.5 | 2 | Mech bursting out of water, splash and draining |
| `ace_marsh_down` | MARSH（淹沒城區，ai marsh）：擊破（aceDown） | SFX.explode(true)＋SFX.wreck | entities/mech-entity.js:2722、:2723 | 3 | 1 | Ace mech destroyed, big explosion and dying engine |
| `ace_whiteout_intro` | WHITEOUT（冰原，ai whiteout）：介入（名牌與介紹） | SFX.alert（flashAlert） | game/mission.js:684～688 | 2.5 | 1 | Rival ace mech arriving, signature engine roar and a menacing radio crackle |
| `ace_whiteout_cloak` | WHITEOUT（冰原，ai whiteout）：隱形 | 沒有聲音 | entities/mech-foe.js:485 | 1.2 | 2 | Stealth mech vanishing into snowstorm, icy shimmer |
| `ace_whiteout_decloak` | WHITEOUT（冰原，ai whiteout）：開火時現形 | 沒有聲音 | entities/mech-foe.js:485 | 1 | 2 | Stealth field breaking, icy crackle |
| `ace_whiteout_down` | WHITEOUT（冰原，ai whiteout）：擊破（aceDown） | SFX.explode(true)＋SFX.wreck | entities/mech-entity.js:2722、:2723 | 3 | 1 | Ace mech destroyed, big explosion and dying engine |
| `ace_specimen_intro` | SPECIMEN（研究特區，ai specimen）：介入（名牌與介紹） | SFX.alert（flashAlert） | game/mission.js:684～688 | 2.5 | 1 | Rival ace mech arriving, signature engine roar and a menacing radio crackle |
| `ace_specimen_overload` | SPECIMEN（研究特區，ai specimen）：過載開始（5 秒） | SFX.alert | entities/mech-foe.js:608 | 2 | 2 | Bio-mech overload, surging electric roar and alarm |
| `ace_specimen_overload_loop` | SPECIMEN（研究特區，ai specimen）：過載中（循環） | 沒有聲音 | entities/mech-foe.js:955 | 4 | 2 | Seamless loop of an overloaded mech crackling with energy |
| `ace_specimen_tired` | SPECIMEN（研究特區，ai specimen）：過載結束、硬直 | SFX.alert | entities/mech-foe.js:615 | 2 | 2 | Overheated mech shutting down, steam vent and power drop |
| `ace_specimen_down` | SPECIMEN（研究特區，ai specimen）：擊破（aceDown） | SFX.explode(true)＋SFX.wreck | entities/mech-entity.js:2722、:2723 | 3 | 1 | Ace mech destroyed, big explosion and dying engine |
| `ace_spire_intro` | SPIRE（Lattice-9，ai spire）：介入（名牌與介紹） | SFX.alert（flashAlert） | game/mission.js:684～688 | 2.5 | 1 | Rival ace mech arriving, signature engine roar and a menacing radio crackle |
| `ace_spire_climb` | SPIRE（Lattice-9，ai spire）：爬上最高的平台 | 沒有聲音 | entities/mech-foe.js:685 | 2 | 2 | Mech climbing a steel structure, clanking grips and thrusters |
| `ace_spire_down` | SPIRE（Lattice-9，ai spire）：擊破（aceDown） | SFX.explode(true)＋SFX.wreck | entities/mech-entity.js:2722、:2723 | 3 | 1 | Ace mech destroyed, big explosion and dying engine |
| `ace_countdown_intro` | COUNTDOWN（舊宇宙港，ai rain）：介入（名牌與介紹） | SFX.alert（flashAlert） | game/mission.js:684～688 | 2.5 | 1 | Rival ace mech arriving, signature engine roar and a menacing radio crackle |
| `ace_countdown_missile_rain` | COUNTDOWN（舊宇宙港，ai rain）：飛彈雨 | SFX.shot('missile') | entities/mech-entity.js:4008、:1074 | 2 | 2 | Missile rain salvo, multiple launches |
| `ace_countdown_down` | COUNTDOWN（舊宇宙港，ai rain）：擊破（aceDown） | SFX.explode(true)＋SFX.wreck | entities/mech-entity.js:2722、:2723 | 3 | 1 | Ace mech destroyed, big explosion and dying engine |
| `ace_undertow_intro` | UNDERTOW（洋上都市，ai undertow）：介入（名牌與介紹） | SFX.alert（flashAlert） | game/mission.js:684～688 | 2.5 | 1 | Rival ace mech arriving, signature engine roar and a menacing radio crackle |
| `ace_undertow_push` | UNDERTOW（洋上都市，ai undertow）：貼身推擊（往外推） | 沒有聲音（fx.meleeHit 只有外觀） | entities/mech-foe.js:892、:893 | 1 | 2 | Hydraulic ram punch with a water-pressure blast |
| `ace_undertow_down` | UNDERTOW（洋上都市，ai undertow）：擊破（aceDown） | SFX.explode(true)＋SFX.wreck | entities/mech-entity.js:2722、:2723 | 3 | 1 | Ace mech destroyed, big explosion and dying engine |
| `ace_keel_intro` | KEEL（方舟，ai bastion）：介入（名牌與介紹） | SFX.alert（flashAlert） | game/mission.js:684～688 | 2.5 | 1 | Rival ace mech arriving, signature engine roar and a menacing radio crackle |
| `ace_keel_stomp` | KEEL（方舟，ai bastion）：踏地衝擊波 | 預警無聲；擴散開始時 SFX.explode(true)（fx/effects.js:1817） | entities/mech-entity.js:4321 | 2 | 2 | Heavy mech stomp on a steel deck, clanging shockwave |
| `ace_keel_down` | KEEL（方舟，ai bastion）：擊破（aceDown） | SFX.explode(true)＋SFX.wreck | entities/mech-entity.js:2722、:2723 | 3 | 1 | Ace mech destroyed, big explosion and dying engine |
| `ace_kiln_intro` | KILN（火山熔爐帶，ai rusher）：介入（名牌與介紹） | SFX.alert（flashAlert） | game/mission.js:684～688 | 2.5 | 1 | Rival ace mech arriving, signature engine roar and a menacing radio crackle |
| `ace_kiln_rush` | KILN（火山熔爐帶，ai rusher）：突進 | SFX.ab | entities/mech-entity.js:3989、:3119 | 1.5 | 2 | Mech charging with roaring heat-blasted boosters |
| `ace_kiln_down` | KILN（火山熔爐帶，ai rusher）：擊破（aceDown） | SFX.explode(true)＋SFX.wreck | entities/mech-entity.js:2722、:2723 | 3 | 1 | Ace mech destroyed, big explosion and dying engine |
| `ace_zenith_intro` | ZENITH（高空軌道，ai zenith）：介入（名牌與介紹） | SFX.alert（flashAlert） | game/mission.js:684～688 | 2.5 | 1 | Rival ace mech arriving, signature engine roar and a menacing radio crackle |
| `ace_zenith_climb` | ZENITH（高空軌道，ai zenith）：離地 10 m 以下就爬升 | 推進／懸浮時共用 thrustLoop（game/feedback.js:243） | entities/mech-foe.js:932 | 2 | 2 | Mech boosting upward in thin air, strained thrusters |
| `ace_zenith_down` | ZENITH（高空軌道，ai zenith）：擊破（aceDown） | SFX.explode(true)＋SFX.wreck | entities/mech-entity.js:2722、:2723 | 3 | 1 | Ace mech destroyed, big explosion and dying engine |
| `ace_sirocco_intro` | SIROCCO（沙丘，ai duelist）：介入（名牌與介紹） | SFX.alert（flashAlert） | game/mission.js:684～688 | 2.5 | 1 | Rival ace mech arriving, signature engine roar and a menacing radio crackle |
| `ace_sirocco_duel` | SIROCCO（沙丘，ai duelist）：決鬥（近距離連續 QB） | SFX.qb | entities/mech-entity.js:4026、:3083 | 1 | 2 | Duelist mech rapid dodges, sand-blasted thrusts |
| `ace_sirocco_down` | SIROCCO（沙丘，ai duelist）：擊破（aceDown） | SFX.explode(true)＋SFX.wreck | entities/mech-entity.js:2722、:2723 | 3 | 1 | Ace mech destroyed, big explosion and dying engine |
| `ace_prospector_intro` | PROSPECTOR（礦坑，ai rusher）：介入（名牌與介紹） | SFX.alert（flashAlert） | game/mission.js:684～688 | 2.5 | 1 | Rival ace mech arriving, signature engine roar and a menacing radio crackle |
| `ace_prospector_rush` | PROSPECTOR（礦坑，ai rusher）：突進 | SFX.ab | entities/mech-entity.js:3989、:3119 | 1.5 | 2 | Mining mech charging, rattling drill and boosters |
| `ace_prospector_down` | PROSPECTOR（礦坑，ai rusher）：擊破（aceDown） | SFX.explode(true)＋SFX.wreck | entities/mech-entity.js:2722、:2723 | 3 | 1 | Ace mech destroyed, big explosion and dying engine |
| `nemesis_intrude` | 宿敵闖入（之後的區段） | SFX.play('alarm', 0.7, 0.9) | game/nemesis.js:119 | 2.5 | 1 | Nemesis mech crashing into the battle, alarm blare and aggressive engine roar |
| `nemesis_levelup` | 宿敵升級（擊倒玩家後記下） | 沒有聲音 | game/nemesis.js:29（nemRecord） | 1.5 | 1 | Ominous low sting as a rival grows stronger |
| `nemesis_down` | 宿敵擊破（SP 獎勵） | 沒有聲音（只有訊息；擊破本身是一般爆炸） | game/nemesis.js:131 | 2.5 | 1 | Triumphant sting after defeating a nemesis, heroic hit |

## 四、大型兵器區段（game/seg-colossus.js、entities/mech-colossus.js）



| 建議的音效鍵 | 事件 | 目前的聲音 | 觸發處 | 長度（秒） | 變化數 | AI 提示詞草稿 |
|---|---|---|---|---|---|---|
| `colossus_walker_step` | 多足巨兵行走（腳步） | 沒有聲音 | entities/mech-colossus.js:16～37 | 1.5 | 3 | Gigantic multi-legged war machine footstep, earth-shaking boom |
| `colossus_ship_loop` | 陸上戰艦行進（循環） | 沒有聲音 | entities/mech-colossus.js:16～37 | 6 | 1 | Seamless loop of a land battleship crawling, colossal engines and grinding treads |
| `colossus_approach` | 大型兵器接近（警告） | SFX.alert | game/seg-colossus.js:119、:120 | 3 | 1 | Distant colossal machine approaching, deep foghorn and rumbling |
| `colossus_joint_break` | 腳部關節／引擎被打斷 | SFX.explode(true)＋SFX.wreck（部位擊破） | entities/mech-entity.js:2722 | 2 | 3 | Giant joint blowing apart, massive explosion and metal snap |
| `colossus_turret` | 砲塔與主砲（部位） | SFX.shot('bullet')；主砲 發射 SFX.shot('grenade')（game/support.js:165）＋落地 SFX.explode（entities/projectile.js:303）；預警圈無聲 | entities/mech-boss.js:184～204 | 2 | 2 | Battleship deck guns firing |
| `colossus_shutdown` | 停機（倒下、露出動力核心） | SFX.explode(true) | game/seg-colossus.js:176～178 | 4 | 1 | Colossal machine shutting down and collapsing, power-down whine and crash |
| `colossus_core_loop` | 動力核心外露（循環） | 沒有聲音 | game/seg-colossus.js:181 | 4 | 1 | Seamless loop of an exposed power core humming unstably |
| `colossus_reboot` | 時限到重新啟動 | 沒有聲音（只有訊息） | game/seg-colossus.js:221 | 3 | 1 | Colossal machine rebooting, rising power surge and grinding |
| `colossus_breach` | 陸上戰艦突破防衛線（失敗） | 沒有聲音 | game/seg-colossus.js:187 | 3 | 1 | Defensive line overrun, crashing barricades and ominous horn |
| `colossus_destroyed` | 擊破 | SFX.explode(true) | game/seg-colossus.js:197～199 | 6 | 1 | Colossal war machine exploding, chain of massive blasts and long collapse |

## 五、空戰（entities/mech-air.js、game/air.js）



| 建議的音效鍵 | 事件 | 目前的聲音 | 觸發處 | 長度（秒） | 變化數 | AI 提示詞草稿 |
|---|---|---|---|---|---|---|
| `air_roll` | 前後滾翻／側滾翻（機動） | SFX.qb | entities/mech-air.js:124 | 1 | 2 | Mech performing an aerial roll, thruster burst and wind whoosh |
| `air_afterburner` | 後燃器（推進） | SFX.ab | entities/mech-air.js:138 | 2 | 1 | Afterburner kicking in, roaring jet thrust |
| `air_crash` | 撞海面／撞地 | SFX.land | entities/mech-air.js:271 | 1.5 | 2 | Mech slamming into the sea surface, huge splash |
| `air_aam_launch` | 空戰導彈發射 | SFX.shot('missile') | entities/mech-air.js:362 | 1.5 | 3 | Air-to-air missile launching, sharp whoosh |
| `air_lock_on` | 空戰導彈鎖定完成 | SFX.tone(1760) | game/air.js:503 | 0.3 | 1 | Fighter jet missile lock tone, steady high beep |
| `air_multilock` | MS-4／MS-8 多目標鎖定（每多一台） | SFX.tone(1320) | game/air.js:704 | 0.2 | 1 | Short targeting chirp for each additional lock |
| `air_msl_warn` | 導彈接近的警報（越近越快） | SFX.tone(1180) | game/air.js:519 | 0.2 | 1 | Missile warning beep, cockpit alert |
| `air_msl_warn_hi` | 導彈快打中（第三級） | SFX.play('warnB', 0.5, 1.1) | game/air.js:523 | 1.2 | 1 | Urgent incoming missile alarm, rapid tones |
| `air_tail` | 被咬尾（背後被敵機追） | SFX.tone(560→470) | game/air.js:660 | 0.3 | 1 | Enemy on your tail warning tone |
| `air_whiz` | 子彈擦身而過 | SFX.tone(1500→380)＋SFX.whiz | game/air.js:678、:679 | 0.4 | 3 | Bullet zipping past at high speed |
| `air_flyby` | 敵機從身邊飛過 | fly1～fly5／flyHi1、flyHi2（素材） | game/air.js:549～556 | 2 | 3 | Jet fly-by with doppler shift |
| `air_bomber_loop` | 轟炸機飛行（循環） | 沒有聲音 | entities/mech-air.js:566（airBomberAI） | 6 | 1 | Seamless loop of a heavy bomber droning overhead |
| `air_bomber_warn` | 轟炸機飛向友軍雷達站 | SFX.alert | game/air.js:279 | 1.5 | 1 | Warning alert, bomber inbound |
| `air_bomber_drop` | 轟炸機投彈 | 落地爆炸 SFX.explode（projectile.js:303）；投下無聲 | entities/mech-air.js:590～610 | 2 | 2 | Bomb bay opening and bombs whistling down |
| `air_sam` | 防空砲的空戰導彈 | SFX.shot('missile') | entities/mech-air.js:622、:362 | 1.5 | 2 | Surface-to-air missile launching from the ground |
| `air_flak_dome` | 進入防空區（紅色網格圓頂） | 沒有聲音 | entities/mech-air.js:644 | 1 | 1 | Radar warning chirp entering hostile airspace |
| `air_beam_warn` | 雷射預警（airBeamGate） | 沒有聲音 | entities/mech-air.js:541 | 1 | 1 | Laser targeting warning tone |
| `air_wake` | 敵機編隊開始交戰 | SFX.alert | game/air.js:639 | 1.5 | 1 | Enemy squadron engaging alert |
| `air_chain` | 殘骸連鎖 | 沒有聲音（只有訊息；擊墜各自爆炸） | game/air.js:448 | 1.5 | 1 | Chain reaction of aircraft wreckage exploding |
| `air_radar_lost` | 友軍雷達站被摧毀（失敗） | 沒有聲音 | game/air.js:483 | 2.5 | 1 | Allied radar station destroyed, big explosion and failure tone |
| `air_supply` | 補給 | 沒有聲音 | game/air.js:723 | 1.5 | 1 | Resupply complete chime with mechanical reload |
| `air_cloud_loop` | 在雲裡（不能鎖定，循環） | 沒有聲音 | game/air.js:791、:797 | 5 | 1 | Seamless loop of flying through dense clouds, muffled wind |

## 六、僚機（game/wing.js、entities/mech-wing.js）



| 建議的音效鍵 | 事件 | 目前的聲音 | 觸發處 | 長度（秒） | 變化數 | AI 提示詞草稿 |
|---|---|---|---|---|---|---|
| `wing_command` | 僚機指令切換（Z 鍵） | SFX.ui | game/wing.js:86 | 0.4 | 2 | Radio command acknowledgement chirp |
| `wing_downed` | 僚機倒地（跪著等救援） | 沒有聲音 | entities/mech-wing.js:50～56 | 2 | 1 | Allied mech collapsing to its knees, power failure and radio static |
| `wing_revive_loop` | 救援中（站在綠色圈裡累積，循環） | 沒有聲音 | game/wing.js:92～108 | 3 | 1 | Seamless loop of repair in progress, welding and servo whir |
| `wing_revived` | 救援完成 | SFX.kit | game/wing.js:112 | 1.5 | 1 | Allied mech rebooting and standing up, power-up surge |

## 七、彙總

- 總項目數：**1017**（Boss 28 隻、機獸 8 隻、場地效果、專屬 AC 15 台＋宿敵、大型兵器、空戰、僚機）。
- 每隻 Boss 的共用事件 17～18 項（登場、循環、蓄力開始、蓄力循環、大招放出、打斷、失衡、破綻、裝甲殼長出／打開、換型態、狂暴、最終型態宣告、部位破壞、身體部位破壞、打回去、閃避或防禦、擊破）＋各自的招式。
- 機獸每隻 20 項共用（吼聲 3 種、低吼、受傷、失衡、倒下、碎裂、腳步、落地、閃避、大招與破綻等 Boss 改版事件、外掛武器與身體部位破壞、修復、打回去）＋近戰招式＋武器。
- 目前**完全沒有聲音**的事件：269 項。

### 目前完全沒有聲音的事件

- boss_monolith_intro（登場（第一次出現在場上：WARNING 橫幅））
- boss_monolith_loop（履帶行進與引擎的循環）
- boss_monolith_charge_loop（大招蓄力中（量表累積，循環））
- boss_monolith_enrage（狂暴化（開打 6 分鐘、雙機的一台倒下））
- boss_monolith_guard_up（防禦反應（架起六角護盾））
- boss_monolith_guard_hit（防禦中被打中（護盾亮起））
- boss_doppel_intro（登場（第一次出現在場上：WARNING 橫幅））
- boss_doppel_loop（移動／待機的循環音）
- boss_doppel_charge_loop（大招蓄力中（量表累積，循環））
- boss_doppel_enrage（狂暴化（開打 6 分鐘、雙機的一台倒下））
- boss_doppel_mimic（出擊時換成玩家的組裝（複製完成））
- boss_doppel_adapt（適應裝甲累積到一種武器（發光變色））
- boss_doppel_resist_hit（被已適應的武器打中（抗性生效））
- boss_aegis_intro（登場（第一次出現在場上：WARNING 橫幅））
- boss_aegis_loop（護盾罩住本體與附近友軍的循環）
- boss_aegis_charge_loop（大招蓄力中（量表累積，循環））
- boss_aegis_enrage（狂暴化（開打 6 分鐘、雙機的一台倒下））
- boss_aegis_guard_up（防禦反應（架起六角護盾））
- boss_aegis_guard_hit（防禦中被打中（護盾亮起））
- boss_aegis_pylon_rebuild（25 秒後重建發生器（破綻））
- boss_aegis_buff（強化附近友軍）
- boss_viper_intro（登場（第一次出現在場上：WARNING 橫幅））
- boss_viper_loop（盤旋的噴射引擎循環）
- boss_viper_charge_loop（大招蓄力中（量表累積，循環））
- boss_viper_enrage（狂暴化（開打 6 分鐘、雙機的一台倒下））
- boss_viper_flare（導彈反制：熱焰彈）
- boss_viper_airmine（第二型態：沿路撒空中地雷）
- boss_viper_turn（掉頭減速（低空、破綻））
- boss_viper_stall（硬直時失速）
- boss_tetrarch_intro（登場（第一次出現在場上：WARNING 橫幅））
- boss_tetrarch_loop（四足行走的腳步與液壓）
- boss_tetrarch_charge_loop（大招蓄力中（量表累積，循環））
- boss_tetrarch_enrage（狂暴化（開打 6 分鐘、雙機的一台倒下））
- boss_tetrarch_guard_up（防禦反應（架起六角護盾））
- boss_tetrarch_guard_hit（防禦中被打中（護盾亮起））
- boss_tetrarch_laser_charge（雷射：紅線預警後蓄力（第一型態））
- boss_tetrarch_kneel（兩隻前腳都壞了跪下（kit.onLost））
- boss_halberd_intro（登場（第一次出現在場上：WARNING 橫幅））
- boss_halberd_loop（砲台待機與砲身轉動）
- boss_halberd_charge_loop（大招蓄力中（量表累積，循環））
- boss_halberd_enrage（狂暴化（開打 6 分鐘、雙機的一台倒下））
- boss_halberd_guard_up（防禦反應（架起六角護盾））
- boss_halberd_guard_hit（防禦中被打中（護盾亮起））
- boss_halberd_charge_loop（充能中（聚集的光粒越來越多，循環））
- boss_halberd_lost（射線被擋住、充能中斷）
- boss_halberd_vent（散熱片展開（弱點））
- boss_sandworm_intro（登場（第一次出現在場上：WARNING 橫幅））
- boss_sandworm_loop（地下鑽行的循環（地面揚塵））
- boss_sandworm_charge_loop（大招蓄力中（量表累積，循環））
- boss_sandworm_enrage（狂暴化（開打 6 分鐘、雙機的一台倒下））
- boss_sandworm_dive_early（閃避：提早下潛）
- boss_sandworm_hover（停在空中（弱點暴露））
- boss_seraphim_intro（登場（第一次出現在場上：WARNING 橫幅））
- boss_seraphim_loop（移動／待機的循環音）
- boss_seraphim_charge_loop（大招蓄力中（量表累積，循環））
- boss_seraphim_enrage（狂暴化（開打 6 分鐘、雙機的一台倒下））
- boss_seraphim_deploy（浮游砲展開）
- boss_seraphim_bit_loop（浮游砲飛行（每顆的循環））
- boss_seraphim_bit_down（浮游砲被 EMP 打落墜毀）
- boss_seraphim_recall（回收充能（本體防禦下降））
- boss_helios_intro（登場（第一次出現在場上：WARNING 橫幅））
- boss_helios_loop（旋翼與引擎的循環）
- boss_helios_charge_loop（大招蓄力中（量表累積，循環））
- boss_helios_enrage（狂暴化（開打 6 分鐘、雙機的一台倒下））
- boss_helios_engine_l（左引擎被打爆、高度下降）
- boss_helios_engine_r（雙引擎失效、迫降）
- boss_helios_drop（大招「投放空降兵」）
- boss_cinder_intro（登場（第一次出現在場上：WARNING 橫幅））
- boss_cinder_loop（熔爐燃燒與履帶的循環）
- boss_cinder_charge_loop（大招蓄力中（量表累積，循環））
- boss_cinder_enrage（狂暴化（開打 6 分鐘、雙機的一台倒下））
- boss_cinder_guard_up（防禦反應（架起六角護盾））
- boss_cinder_guard_hit（防禦中被打中（護盾亮起））
- boss_cinder_firewall（火牆（把場地分開））
- boss_cinder_flame（近身火焰噴射）
- boss_cinder_heatwave（對空熱浪（預警後往上噴））
- boss_bastille_intro（登場（第一次出現在場上：WARNING 橫幅））
- boss_bastille_loop（陣地的運轉（雷達旋轉、發電機））
- boss_bastille_charge_loop（大招蓄力中（量表累積，循環））
- boss_bastille_enrage（狂暴化（開打 6 分鐘、雙機的一台倒下））
- boss_bastille_guard_up（防禦反應（架起六角護盾））
- boss_bastille_guard_hit（防禦中被打中（護盾亮起））
- boss_bastille_minelayer（補布雷無人機）
- boss_bastille_unarmored（砲台全滅、指揮所裝甲解除）
- boss_behemoth_intro（登場（第一次出現在場上：WARNING 橫幅））
- boss_behemoth_loop（兩側絞碎滾筒與履帶的循環）
- boss_behemoth_charge_loop（大招蓄力中（量表累積，循環））
- boss_behemoth_enrage（狂暴化（開打 6 分鐘、雙機的一台倒下））
- boss_behemoth_guard_up（防禦反應（架起六角護盾））
- boss_behemoth_guard_hit（防禦中被打中（護盾亮起））
- boss_behemoth_charge（直線衝撞（循環））
- boss_behemoth_crash（撞上高台或邊界、硬直（背後散熱口打開））
- boss_behemoth_slide（衝撞落空的滑停（破綻））
- boss_duo_intro（登場（第一次出現在場上：WARNING 橫幅））
- boss_duo_loop（移動／待機的循環音）
- boss_duo_charge_loop（大招蓄力中（量表累積，循環））
- boss_duo_enrage（狂暴化（開打 6 分鐘、雙機的一台倒下））
- boss_duo_rescue（一台失衡時另一台來救）
- boss_duo_rage（一台倒下、另一台狂暴）
- boss_mirage_intro（登場（第一次出現在場上：WARNING 橫幅））
- boss_mirage_loop（迷彩中的循環（半透明、不能鎖定））
- boss_mirage_charge_loop（大招蓄力中（量表累積，循環））
- boss_mirage_enrage（狂暴化（開打 6 分鐘、雙機的一台倒下））
- boss_mirage_cloak（進入迷彩）
- boss_mirage_decloak（現形（開火、中彈、硬直））
- boss_mirage_holo_spawn（展開全息分身）
- boss_mirage_holo_pop（分身被打中引爆小型 EMP）
- boss_arachne_intro（登場（第一次出現在場上：WARNING 橫幅））
- boss_arachne_loop（多足行走（三腳步態））
- boss_arachne_charge_loop（大招蓄力中（量表累積，循環））
- boss_arachne_enrage（狂暴化（開打 6 分鐘、雙機的一台倒下））
- boss_arachne_guard_up（防禦反應（架起六角護盾））
- boss_arachne_guard_hit（防禦中被打中（護盾亮起））
- boss_arachne_leap（躍起（準備跳躍閃避））
- boss_arachne_collapse（斷三條腿倒下（核心暴露））
- boss_judgement_intro（登場（第一次出現在場上：WARNING 橫幅））
- boss_judgement_loop（導引塔運轉的循環）
- boss_judgement_charge_loop（大招蓄力中（量表累積，循環））
- boss_judgement_enrage（狂暴化（開打 6 分鐘、雙機的一台倒下））
- boss_judgement_guard_up（防禦反應（架起六角護盾））
- boss_judgement_guard_hit（防禦中被打中（護盾亮起））
- boss_judgement_beam_loop（追蹤光柱（越追越快，循環））
- boss_judgement_cooldown（導引鏡冷卻（破綻））
- boss_judgement_grid_warn（格子砲擊預警）
- boss_archon_intro（登場（第一次出現在場上：WARNING 橫幅））
- boss_archon_loop（移動／待機的循環音）
- boss_archon_charge_loop（大招蓄力中（量表累積，循環））
- boss_archon_enrage（狂暴化（開打 6 分鐘、雙機的一台倒下））
- boss_archon_pa_hit（斥力裝甲吸收子彈）
- boss_archon_flame（火焰噴射器（部位））
- boss_cerberus_intro（登場（第一次出現在場上：WARNING 橫幅））
- boss_cerberus_loop（移動／待機的循環音）
- boss_cerberus_charge_loop（大招蓄力中（量表累積，循環））
- boss_cerberus_enrage（狂暴化（開打 6 分鐘、雙機的一台倒下））
- boss_cerberus_split（分離成三台（本體藏到地下））
- boss_cerberus_gamma（γ 修理機的修理光束）
- boss_cerberus_countdown（合體倒數（30 秒））
- boss_cerberus_merge_start（開始合體（合體中無防備））
- boss_cerberus_merge（重新合體並回復 AP）
- boss_nullifier_intro（登場（第一次出現在場上：WARNING 橫幅））
- boss_nullifier_loop（移動／待機的循環音）
- boss_nullifier_charge_loop（大招蓄力中（量表累積，循環））
- boss_nullifier_enrage（狂暴化（開打 6 分鐘、雙機的一台倒下））
- boss_citadel_intro（登場（第一次出現在場上：WARNING 橫幅））
- boss_citadel_loop（列車行駛（鐵軌、蒸汽））
- boss_citadel_charge_loop（大招蓄力中（量表累積，循環））
- boss_citadel_enrage（狂暴化（開打 6 分鐘、雙機的一台倒下））
- boss_citadel_guard_up（防禦反應（架起六角護盾））
- boss_citadel_guard_hit（防禦中被打中（護盾亮起））
- boss_citadel_tunnel（進出隧道（看不到、打不到））
- boss_citadel_ram（全速衝撞）
- boss_citadel_overheat（鍋爐過熱、減速（弱點））
- boss_leviathan_intro（登場（第一次出現在場上：WARNING 橫幅））
- boss_leviathan_loop（巨大飛行要塞的引擎循環）
- boss_leviathan_charge_loop（大招蓄力中（量表累積，循環））
- boss_leviathan_enrage（狂暴化（開打 6 分鐘、雙機的一台倒下））
- boss_leviathan_guard_up（防禦反應（架起六角護盾））
- boss_leviathan_guard_hit（防禦中被打中（護盾亮起））
- boss_leviathan_drop（投放運輸機與無人機群）
- boss_leviathan_engine_lost（引擎全毀、下降到 10 m（破綻））
- boss_leviathan_air_main_charge（空域：主砲預警線）
- boss_pulsar_intro（登場（第一次出現在場上：WARNING 橫幅））
- boss_pulsar_loop（刃翼的振動與推進循環）
- boss_pulsar_charge_loop（大招蓄力中（量表累積，循環））
- boss_pulsar_enrage（狂暴化（開打 6 分鐘、雙機的一台倒下））
- boss_pulsar_dash（直線突刺）
- boss_pulsar_overheat（突刺之後過熱（破綻））
- boss_anvil_intro（登場（第一次出現在場上：WARNING 橫幅））
- boss_anvil_loop（鼓風爐與沉重的腳步）
- boss_anvil_charge_loop（大招蓄力中（量表累積，循環））
- boss_anvil_enrage（狂暴化（開打 6 分鐘、雙機的一台倒下））
- boss_anvil_guard_up（防禦反應（架起六角護盾））
- boss_anvil_guard_hit（防禦中被打中（護盾亮起））
- boss_anvil_fissure（熔岩裂地（本體到落點之間））
- boss_anvil_stuck（鎚子卡在地上（破綻））
- boss_salamander_intro（登場（第一次出現在場上：WARNING 橫幅））
- boss_salamander_loop（潛在熔岩裡移動的循環）
- boss_salamander_charge_loop（大招蓄力中（量表累積，循環））
- boss_salamander_enrage（狂暴化（開打 6 分鐘、雙機的一台倒下））
- boss_salamander_guard_up（防禦反應（架起六角護盾））
- boss_salamander_guard_hit（防禦中被打中（護盾亮起））
- boss_salamander_roar（浮出時的吼聲（機械龍））
- boss_salamander_breath（噴火）
- boss_salamander_strand（擱淺（失衡、破綻））
- boss_gantry_intro（登場（第一次出現在場上：WARNING 橫幅））
- boss_gantry_loop（橫梁與吊車沿軌道移動）
- boss_gantry_charge_loop（大招蓄力中（量表累積，循環））
- boss_gantry_enrage（狂暴化（開打 6 分鐘、雙機的一台倒下））
- boss_gantry_guard_up（防禦反應（架起六角護盾））
- boss_gantry_guard_hit（防禦中被打中（護盾亮起））
- boss_gantry_rehoist（貨櫃重新吊上來）
- boss_gantry_overheat（電磁鐵過熱（破綻））
- boss_colossus_intro（登場（第一次出現在場上：WARNING 橫幅））
- boss_colossus_loop（砲塔慢慢轉向目標）
- boss_colossus_charge_loop（大招蓄力中（量表累積，循環））
- boss_colossus_enrage（狂暴化（開打 6 分鐘、雙機的一台倒下））
- boss_colossus_guard_up（防禦反應（架起六角護盾））
- boss_colossus_guard_hit（防禦中被打中（護盾亮起））
- boss_colossus_cool（齊射後散熱（破綻、冒煙））
- boss_colossus_popturret（升起兩座甲板升降砲塔）
- boss_hearth_intro（登場（第一次出現在場上：WARNING 橫幅））
- boss_hearth_loop（反應爐脈動與護盾板旋轉）
- boss_hearth_charge_loop（大招蓄力中（量表累積，循環））
- boss_hearth_enrage（狂暴化（開打 6 分鐘、雙機的一台倒下））
- boss_hearth_guard_up（防禦反應（架起六角護盾））
- boss_hearth_guard_hit（防禦中被打中（護盾亮起））
- boss_hearth_plate_block（子彈被護盾板擋下）
- boss_hearth_core_loop（核心外露中（火花，循環））
- boss_sovereign_intro（登場（第一次出現在場上：WARNING 橫幅））
- boss_sovereign_loop（移動／待機的循環音）
- boss_sovereign_charge_loop（大招蓄力中（量表累積，循環））
- boss_sovereign_enrage（狂暴化（開打 6 分鐘、雙機的一台倒下））
- boss_sovereign_down（停機（最大的破綻））
- field_shock_warn（電擊地面的預警（1 秒））
- field_magma_loop（熔岩裂地（循環））
- field_belt_loop（燃燒帶（移動，循環））
- field_steam_loop（蒸氣（熄滅燃燒地面，循環））
- field_quicksand_loop（流沙（循環））
- field_ice_loop（冰面（滑行，循環））
- field_haze_loop（煙霧（不能鎖定，循環））
- field_darkness（全場變暗）
- field_cover_rise（新掩體升起（berm／rubble／crate／pillar／slab））
- beast_lion_hurt（受傷（hit 片段））
- beast_lion_dodge（閃避（側跳 dgSideL／R、後跳 dgBack、伏低 dgDuck））
- beast_lion_raid_won（隱藏目標達成（擊退獅型））
- beast_tiger_hurt（受傷（hit 片段））
- beast_tiger_dodge（閃避（側跳 dgSideL／R、後跳 dgBack、伏低 dgDuck））
- beast_bear_hurt（受傷（hit 片段））
- beast_bear_dodge（閃避（側跳 dgSideL／R、後跳 dgBack、伏低 dgDuck））
- beast_bear_flame（口的爐火（近距離火焰錐））
- beast_turtle_hurt（受傷（hit 片段））
- beast_turtle_dodge（閃避（側跳 dgSideL／R、後跳 dgBack、伏低 dgDuck））
- beast_gorilla_hurt（受傷（hit 片段））
- beast_gorilla_dodge（閃避（側跳 dgSideL／R、後跳 dgBack、伏低 dgDuck））
- beast_gorilla_throw（丟東西（gThrow））
- beast_scorpion_hurt（受傷（hit 片段））
- beast_scorpion_dodge（閃避（側跳 dgSideL／R、後跳 dgBack、伏低 dgDuck））
- beast_scorpion_burrow_loop（鑽在地下移動（sBurrow，循環））
- beast_mantis_hurt（受傷（hit 片段））
- beast_mantis_dodge（閃避（側跳 dgSideL／R、後跳 dgBack、伏低 dgDuck））
- beast_mantis_hover（飛起來（mHover，翅膀振動））
- beast_raptor_hurt（受傷（hit 片段））
- beast_raptor_dodge（閃避（側跳 dgSideL／R、後跳 dgBack、伏低 dgDuck））
- beast_raptor_gust（振翅強風（把前方往外推））
- beast_raptor_takeoff（起飛（rTakeoff））
- beast_raptor_glide_loop（在空中盤旋（循環））
- ace_marsh_submerge（MARSH（淹沒城區，ai marsh）：潛入水中（潛行））
- ace_marsh_surface（MARSH（淹沒城區，ai marsh）：浮出水面）
- ace_whiteout_cloak（WHITEOUT（冰原，ai whiteout）：隱形）
- ace_whiteout_decloak（WHITEOUT（冰原，ai whiteout）：開火時現形）
- ace_specimen_overload_loop（SPECIMEN（研究特區，ai specimen）：過載中（循環））
- ace_spire_climb（SPIRE（Lattice-9，ai spire）：爬上最高的平台）
- ace_undertow_push（UNDERTOW（洋上都市，ai undertow）：貼身推擊（往外推））
- nemesis_levelup（宿敵升級（擊倒玩家後記下））
- nemesis_down（宿敵擊破（SP 獎勵））
- colossus_walker_step（多足巨兵行走（腳步））
- colossus_ship_loop（陸上戰艦行進（循環））
- colossus_core_loop（動力核心外露（循環））
- colossus_reboot（時限到重新啟動）
- colossus_breach（陸上戰艦突破防衛線（失敗））
- air_bomber_loop（轟炸機飛行（循環））
- air_flak_dome（進入防空區（紅色網格圓頂））
- air_beam_warn（雷射預警（airBeamGate））
- air_chain（殘骸連鎖）
- air_radar_lost（友軍雷達站被摧毀（失敗））
- air_supply（補給）
- air_cloud_loop（在雲裡（不能鎖定，循環））
- wing_downed（僚機倒地（跪著等救援））
- wing_revive_loop（救援中（站在綠色圈裡累積，循環））

### 共用聲音最集中的地方（換成每隻專屬時要改的呼叫點）

- `SFX.play('alarm')`：大招蓄力 mech-boss-tier.js:451、放出 :417、最終型態宣告 mech-boss3.js:104、宿敵 nemesis.js:119。
- `SFX.play('bell')`：破綻 mech-boss-tier.js:328、裝甲殼 :219。
- `SFX.stagger`：失衡 mech-entity.js:1732、打斷 mech-boss-tier.js:511、裝甲殼打開 :246。
- `SFX.cue('phase')`：換型態 game/feedback.js:265（所有 Boss 與機獸）。
- `SFX.play('laserBig')`：b3Beam mech-boss3.js:242、pulseRing game/bosses2.js:216（所有光束與能量環）。
- 迫擊砲（mortarShot → `SFX.shot('grenade')` game/support.js:165、落地 projectile.js:303）：b3Rain／b3Line／b3Pools、砲台、熔渣、機獸的拋射。
- 擊破：`SFX.explode('huge')`＋`SFX.wreck` mech-entity.js:2722～2723、`SFX.stinger(true)` :2762。
- 機獸：`mech-beast-fx.js` 的 VOICE 表與 kindOf（五種出手聲），八隻共用合成音。
- 沒有 `SFX` 呼叫、要新增掛勾的：登場橫幅（juice.js:546）、狂暴（bosses.js:194）、防禦護盾（mech-dodge.js:479）、閃避的動作片段（mech-dodge.js:668）、`fx.flameCone`／`fx.firePool`／`fx.warn*`／`fx.pillarStrike`（全部無聲）、迷彩與分身、列車與巨兵的行進循環。
