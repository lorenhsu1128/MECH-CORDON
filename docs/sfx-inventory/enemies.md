# 敵人音效清單（AI 產生用；一般敵人 30 種＋專屬敵人 58 種＋專屬 AC 14 名＋詞綴與狀態效果）

調查日期：2026-11-22。只讀程式、沒有改任何檔案。路徑都相對於 `src/`。`ME`＝`entities/mech-entity.js`。

## 0. 先讀：目前的共用機制（每一種敵人都會碰到）

目前「每一種敵人自己的聲音」幾乎都不存在：大部分事件不是共用的武器配方，就是借用別的音效（`ui2`、`charge`、`door`、`bell`…改音高），或完全沒有聲音。下表是所有敵人共用的部分，後面各敵人的「目前的聲音」直接引用這裡的代號。

| 代號 | 共用的事件 | 目前的聲音 | 觸發處 |
|---|---|---|---|
| C-STEP | 腳步（每半個步伐） | `SFX.step(地面材質, 重量, 位置, 腳部種類)`；履帶腳 `l_tk`、飛行中沒有腳步聲 | `game/feedback.js:304`（`ME:3688` 的 ikGait 呼叫 `mechStep`） |
| C-THR | 推進器循環（推進、QB、懸浮、在空中） | `SFX.loopAt('th'+id, 'thrustLoop')`，只取最近 4 台、70 m 內 | `game/feedback.js:243` |
| C-QB | QB／跳躍／著地／突擊推進 | `SFX.qb`／`SFX.jump`／`SFX.land`／`SFX.ab` | `ME:3083`、`ME:3540`、`ME:3514`、`ME:3243`、`ME:3119` |
| C-DIE | 擊破 | `SFX.explode(true 或 'huge')`＋`SFX.wreck`；有 `explodeOnDeath` 的另外 `explodeAt` 再一次 `SFX.explode` | `ME:2722-2723`、`game/game.js:353` |
| C-STG | 失衡 | `SFX.stagger` | `ME:2487`、`ME:2664` |
| C-HIT | 被子彈／雷射打中 | `SFX.hit(位置, 目標)`（依目標分類，不分敵人） | `entities/projectile.js:429`、`ME:1249` |
| C-ALERT | 畫面警報文字（alertAll／flashAlert） | `SFX.alert()`（介面音） | `game/hud.js:152` |
| C-DODGE | 敵人閃避（側閃、後撤、跳躍、煙幕彈、熱焰彈、六角護盾） | **沒有聲音**（`entities/mech-dodge.js` 沒有任何 SFX） | `entities/mech-dodge.js` |
| W-BUL | 實彈（機槍、步槍、手槍、加特林）開火 | `SFX.shot('bullet', 武器id)`＋`SFX.casing`（配方依武器 id，`audio/recipes.js` 的 `GUN_OF_ID`，所有用同一把武器的敵人共用） | `ME:883-884` |
| W-SG | 霰彈開火 | `SFX.shot('shotgun', 武器id)` | `ME:903` |
| W-SHL | 火箭筒 | `SFX.shot('shell', 武器id)` | `ME:927` |
| W-GR | 榴彈 | `SFX.shot('grenade', 武器id)` | `ME:979` |
| W-MSL | 導彈 | `SFX.shot('missile', 武器id)` | `ME:1074` |
| W-LAS | 雷射 | `SFX.shot('laser'／'laserCharged', 武器id)` | `ME:1264` |
| W-EMP | 電磁脈衝 | `SFX.empBlast` | `game/game.js:231` |
| W-MEL | 近戰的揮擊／命中 | `SFX.meleeSwing`／`SFX.meleeHit`（依武器家族） | `ME:1879`、`ME:2036` |
| W-PJ | 投射物落地爆炸（榴彈、迫擊砲、貨櫃、魚雷、冰錐…） | `SFX.explode(splash>4m, 位置)` | `entities/projectile.js:303` |

**不在這份清單的**：玩家自己的武器聲（另一份清單）、敵兵的無線電喊話（`SFX.bark`，語音）、Boss 與機獸。
**建議**：機甲類（人形 AC、MT）的腳步、QB 可以「每種敵人一組」，但數量很大；下面每種敵人都列了自己的移動／推進項目，要省可以把同一種腳部的合併。

欄位說明：建議長度＝秒；變化＝要幾個不同的取樣（隨機輪流）；提示詞是給 MOSS 的英文草稿。

## 1. 一般敵人（data/enemies.js 的 ENEMY_TYPES，30 種）

預警招式（`data/ai.js` 的 `MOVES`，`entities/mech-moves.js`）：拿到攻擊權杖的主攻才放；`moveStart`（:107）開始預警。

### mt（輕型步行機）— ai mt，MG-18 機槍，二足 l_bp，招式 burst
| 鍵 | 事件 | 目前的聲音 | 觸發處 | 長度 | 變化 | 提示詞 |
|---|---|---|---|---|---|---|
| e_mt_step | 腳步 | C-STEP（二足） | game/feedback.js:304 | 0.5 | 3 | Light 8-meter walker mech footstep, hollow metal foot thudding on ground, servo whir |
| e_mt_thrust | 推進／跳躍時的推進器 | C-THR、C-QB | game/feedback.js:243 | 2.0 循環 | 1 | Small low-grade thruster burst loop on a cheap combat walker, rough gas hiss |
| e_mt_burst_warn | 點放的預警（槍口發光 0.45 秒） | 沒有聲音（只有 `mvGlow` 閃光） | entities/mech-moves.js:149-152 | 0.5 | 1 | Machine gun bolt racking and motor spin-up on a small walker, mechanical clack |
| e_mt_fire | 機槍連射 | W-BUL（w_mg） | ME:883 | 0.3 | 3 | Mid-caliber mech machine gun burst, dry punchy rattle, light recoil |
| e_mt_die | 擊破 | C-DIE | ME:2722 | 2.0 | 2 | Light walker mech exploding, thin armor bursting, small fireball and scattering scrap |

### mth（重型步行機）— ai mt，BZ-31 火箭筒＋MS-4 導彈，履帶 l_tk，招式 aimShot／volley
| 鍵 | 事件 | 目前的聲音 | 觸發處 | 長度 | 變化 | 提示詞 |
|---|---|---|---|---|---|---|
| e_mth_move | 履帶移動循環 | **沒有聲音**（履帶腳不走 `mechStep`、沒有引擎循環） | game/feedback.js:296 | 3.0 循環 | 1 | Heavy tracked walker idling and rolling, diesel rumble, clanking tread links |
| e_mth_aim_warn | 架砲（紅色瞄準線 0.7 秒） | 沒有聲音 | entities/mech-moves.js:160-163 | 0.8 | 1 | Heavy bazooka arm locking into firing position, hydraulic clunk and targeting beep |
| e_mth_bazooka | 火箭筒單發 | W-SHL（w_bz） | ME:927 | 1.2 | 2 | Heavy rocket launcher blast from a tracked mech, deep thump and whoosh |
| e_mth_volley_warn | 導彈齊射的鎖定（橘線 0.9 秒） | 沒有聲音（本機玩家另有 ECHO 語音 `voiceCue('lock')`） | entities/mech-moves.js:171-178 | 1.0 | 1 | Missile pod lock-on tone rising, fast electronic beeping from an enemy mech |
| e_mth_volley | 導彈齊射 | W-MSL（bw_ms） | ME:1074 | 1.5 | 2 | Salvo of shoulder missiles launching in rapid succession, hissing ignition |
| e_mth_die | 擊破 | C-DIE | ME:2722 | 2.5 | 2 | Heavy armored walker explosion, thick metal rupturing, ammunition cook-off |

### drone（偵察機）— ai drone，LR-40 雷射，飛行，招式 charge
| 鍵 | 事件 | 目前的聲音 | 觸發處 | 長度 | 變化 | 提示詞 |
|---|---|---|---|---|---|---|
| e_drone_hover | 飛行循環 | C-THR（在空中 0.35） | game/feedback.js:243 | 3.0 循環 | 1 | Recon drone hovering, high-pitched ducted fan whine with electric hum |
| e_drone_charge | 雷射蓄力（0.8 秒） | `SFX.play('charge')` | entities/mech-moves.js:129 | 0.9 | 2 | Small laser emitter charging up, rising electric whine, sci-fi |
| e_drone_fire | 雷射射擊 | W-LAS（w_lr） | ME:1264 | 0.6 | 2 | Thin red laser bolt from a drone, sharp zap with crackle |
| e_drone_die | 擊落 | C-DIE | ME:2722 | 1.5 | 2 | A small flying drone exploding, electric pop and crackling sparks, propeller motor sputtering and metal debris clattering on the ground |

### turret（固定砲台）— ai turret，RF-31 ×2＋MS-4，招式 sweep／volley
| 鍵 | 事件 | 目前的聲音 | 觸發處 | 長度 | 變化 | 提示詞 |
|---|---|---|---|---|---|---|
| e_turret_idle | 砲塔旋轉／待機 | **沒有聲音** | — | 2.0 循環 | 1 | Automated gun turret slowly traversing, motorized servo grind, ticking sensors |
| e_turret_sweep_warn | 掃射的架設（兩條預警線 0.8 秒） | 沒有聲音 | entities/mech-moves.js:226-233 | 0.9 | 1 | Twin rifle turret spinning up and locking, rapid mechanical clicks |
| e_turret_fire | 雙步槍連射／掃射 | W-BUL（w_rifle） | ME:883 | 0.4 | 3 | Twin heavy rifles firing from a fixed turret, sharp rhythmic cracks |
| e_turret_overheat | 掃射後過熱（破綻 2 秒，火花） | 沒有聲音（`fx.spark`） | entities/mech-moves.js:243-247 | 1.5 | 1 | Overheated gun barrels venting steam, metal ticking and hiss |
| e_turret_volley_warn | 導彈鎖定 | 沒有聲音 | entities/mech-moves.js:171 | 1.0 | 1 | Turret missile rack lock-on tone, electronic warning beeps |
| e_turret_volley | 導彈齊射 | W-MSL（bw_ms） | ME:1074 | 1.5 | 2 | Missile salvo from a static emplacement, rapid hissing launches |
| e_turret_die | 擊破 | C-DIE | ME:2722 | 2.0 | 2 | Gun turret destroyed, explosion with collapsing metal mount |

### mt_shot（突擊型步行機）— ai flank（四台包圍），SG-33 霰彈，輕二足 l_bp2，招式 dash
| 鍵 | 事件 | 目前的聲音 | 觸發處 | 長度 | 變化 | 提示詞 |
|---|---|---|---|---|---|---|
| e_mtshot_step | 腳步 | C-STEP | game/feedback.js:304 | 0.4 | 3 | Fast light-footed mech step, quick metallic patter |
| e_mtshot_qb | QB 靠近、跳躍 | C-QB | ME:3540 | 0.6 | 2 | Short sharp thruster dash from an assault walker, gas burst |
| e_mtshot_dash_warn | 衝刺的預警（路線 0.55 秒） | 沒有聲音（`fx.warnPath`） | entities/mech-moves.js:131-134 | 0.6 | 1 | Booster pre-ignition whine building up before a charge |
| e_mtshot_dash | 突擊推進衝過去 | C-QB 的 `SFX.ab` | ME:3119 | 1.2 | 1 | Assault booster roaring ignition, jet surge |
| e_mtshot_fire | 霰彈 | W-SG（w_sg） | ME:903 | 0.8 | 3 | Mech-scale combat shotgun blast, booming spread |
| e_mtshot_die | 擊破 | C-DIE | ME:2722 | 2.0 | 2 | Light assault walker exploding, sharp blast and debris |

### mt_gren（榴彈型步行機）— ai mt_gren（不移動），GL-90 榴彈砲，招式 lob
| 鍵 | 事件 | 目前的聲音 | 觸發處 | 長度 | 變化 | 提示詞 |
|---|---|---|---|---|---|---|
| e_mtgren_step | 腳步 | C-STEP | game/feedback.js:304 | 0.5 | 2 | Medium walker mech footstep, metal thud |
| e_mtgren_lob_warn | 落點圈預警 | 沒有聲音（`fx.warnCircle`） | entities/mech-moves.js:109-112 | 0.6 | 1 | Grenade launcher breech loading with heavy clunk |
| e_mtgren_fire | 榴彈拋射 | W-GR（bw_gr） | ME:979 | 0.8 | 2 | Hollow thump of a heavy grenade launcher lobbing a shell |
| e_mtgren_impact | 榴彈落地爆炸 | W-PJ | entities/projectile.js:303 | 1.5 | 2 | Grenade shell explosion, crisp blast with dirt spray |
| e_mtgren_die | 擊破 | C-DIE | ME:2722 | 2.0 | 2 | Grenadier walker explodes with secondary ammunition pops |

### kami（自爆型 KAMIKAZE）— ai kamikaze，無武器，explodeOnDeath，招式 beep
| 鍵 | 事件 | 目前的聲音 | 觸發處 | 長度 | 變化 | 提示詞 |
|---|---|---|---|---|---|---|
| e_kami_run | 衝過來的移動 | C-STEP（輕二足） | game/feedback.js:304 | 0.4 | 2 | Light suicide walker scuttling fast, clattering steps |
| e_kami_beep | 閃紅燈嗶聲（0.18 秒一次，0.75 秒） | `SFX.play('bell', 0.35, 1.9)` | entities/mech-moves.js:286 | 0.15 | 1 | Urgent self-destruct beep, sharp electronic chirp |
| e_kami_charge | 加速衝刺 | C-QB 的 `SFX.ab` | ME:3119 | 1.0 | 1 | Overdriven booster screaming as a kamikaze bot rushes in |
| e_kami_blast | 自爆（接觸時 die） | C-DIE＋`explodeAt` 的 `SFX.explode` | ME:4005、game/game.js:353 | 2.5 | 2 | Violent self-destruct explosion, high explosive crack and shockwave |

### tank（裝甲車）— ai mt，BZ-31＋GT-70 加特林，載具外形，招式 aimShot／sweep
| 鍵 | 事件 | 目前的聲音 | 觸發處 | 長度 | 變化 | 提示詞 |
|---|---|---|---|---|---|---|
| e_tank_engine | 引擎與履帶循環 | **沒有聲音** | — | 3.0 循環 | 1 | Armored tank engine idle and treads rolling, heavy diesel growl, squeaking track |
| e_tank_aim_warn | 架砲（紅線） | 沒有聲音 | entities/mech-moves.js:160 | 0.8 | 1 | Tank turret traversing and cannon locking, hydraulic whine |
| e_tank_cannon | 火箭筒主砲 | W-SHL（w_bz） | ME:927 | 1.5 | 2 | Tank main gun firing, deep booming report |
| e_tank_gat_spin | 加特林掃射的架設 | 沒有聲音 | entities/mech-moves.js:226 | 0.8 | 1 | A rotary gatling gun spinning up, electric motor whir rising quickly in pitch with rattling metal barrels |
| e_tank_gat | 加特林掃射 | W-BUL（bw_gat） | ME:883 | 0.5 | 2 | Rotary gatling gun roaring, continuous buzzsaw fire |
| e_tank_die | 擊破 | C-DIE | ME:2722 | 2.5 | 2 | Armored vehicle explosion, turret blown off, fuel fire whoosh |

### strider（步行砲台）— ai strider（佔高台），LCB-60 背雷射砲，四足 l_qd，招式 charge
| 鍵 | 事件 | 目前的聲音 | 觸發處 | 長度 | 變化 | 提示詞 |
|---|---|---|---|---|---|---|
| e_strider_step | 四足腳步 | C-STEP（四足） | game/feedback.js:304 | 0.5 | 3 | Four-legged artillery walker step, heavy hydraulic stomp with servo whine |
| e_strider_climb | 跳上高台（懸浮爬升） | C-THR、C-QB | ME:4043-4060 | 1.5 | 1 | Quadruped mech thrusters lifting it onto a platform, strained jet blast |
| e_strider_charge | 雷射蓄力（1.1 秒） | `SFX.play('charge')` | entities/mech-moves.js:129 | 1.2 | 2 | Large back-mounted laser cannon charging, deep rising hum |
| e_strider_fire | 雷射砲 | W-LAS（bw_lc） | ME:1264 | 1.0 | 2 | Heavy laser cannon discharge, thick energy blast with sizzle |
| e_strider_die | 擊破 | C-DIE | ME:2722 | 2.5 | 2 | A large metal walking robot collapsing, creaking and crunching steel legs buckling, then a heavy explosion and falling debris |

### heli（武裝直升機 HARRIER）— ai heli，MG-18＋BZ-31（extraWeapons），招式 strafeRun／aimShot
| 鍵 | 事件 | 目前的聲音 | 觸發處 | 長度 | 變化 | 提示詞 |
|---|---|---|---|---|---|---|
| e_heli_rotor | 旋翼循環 | **沒有聲音**（只有 C-THR 的推進器循環） | game/feedback.js:243 | 3.0 循環 | 1 | Attack helicopter rotor thumping overhead, turbine whine |
| e_heli_strafe_warn | 掃射航線預警（1.1 秒） | 沒有聲音（`fx.warnRect`） | entities/mech-moves.js:118-123 | 1.2 | 1 | Helicopter banking into attack run, rotor pitch rising, doppler |
| e_heli_strafe | 掃射（突擊推進沿航線） | W-BUL（w_mg）＋C-QB 的 `SFX.ab` | ME:883、ME:3119 | 2.0 | 2 | Gunship strafing run, chin gun hammering while flying past |
| e_heli_aim_warn | 架砲（紅線） | 沒有聲音 | entities/mech-moves.js:160 | 0.8 | 1 | Helicopter rocket pod arming click and targeting tone |
| e_heli_rocket | 火箭 | W-SHL（w_bz） | ME:927 | 1.0 | 2 | Helicopter rocket pod launch, quick whoosh and pop |
| e_heli_die | 擊落 | C-DIE | ME:2722 | 3.0 | 2 | Helicopter hit and crashing, rotor failing, spinning, explosion |

### swarm（導彈無人機）— ai swarm（俯衝接觸即爆），explodeOnDeath，招式 beep
| 鍵 | 事件 | 目前的聲音 | 觸發處 | 長度 | 變化 | 提示詞 |
|---|---|---|---|---|---|---|
| e_swarm_fly | 飛行循環 | C-THR | game/feedback.js:243 | 2.0 循環 | 1 | Small missile drone buzzing, rocket-motor hiss |
| e_swarm_beep | 俯衝前的嗶聲 | `SFX.play('bell', 0.35, 1.9)` | entities/mech-moves.js:286 | 0.15 | 1 | Rapid homing-drone warning chirp |
| e_swarm_dive | 俯衝 | C-QB 的 `SFX.ab` | ME:3119 | 1.0 | 1 | Drone diving, screaming rocket motor doppler |
| e_swarm_blast | 接觸爆炸 | C-DIE＋`explodeAt` | ME:4088、game/game.js:353 | 1.5 | 2 | Small warhead drone detonating on impact, sharp crack |

### mt_shield（盾牌步行機）— ai shield，MG-18，招式 burst
| 鍵 | 事件 | 目前的聲音 | 觸發處 | 長度 | 變化 | 提示詞 |
|---|---|---|---|---|---|---|
| e_mtshield_step | 腳步（舉著盾） | C-STEP | game/feedback.js:304 | 0.5 | 2 | Shielded walker footstep with heavy plate clanking |
| e_mtshield_block | 正面擋下射擊 | `SFX.play('shield', 0.5, 1.3)`＋`SFX.hitShield` | entities/mech-special.js:202-203 | 0.4 | 3 | Bullets ricocheting off a massive steel riot shield, ringing clang |
| e_mtshield_break | 近戰破盾（GUARD BREAK） | `SFX.play('shield', 1, 0.7)`＋`SFX.hitShield(p, true)` | entities/mech-special.js:196-197 | 1.0 | 2 | Heavy shield smashed aside by a melee blow, huge metal clang and stagger |
| e_mtshield_burst_warn | 點放的預警 | 沒有聲音 | entities/mech-moves.js:149 | 0.5 | 1 | Gun peeking over a shield, bolt racking clack |
| e_mtshield_fire | 機槍 | W-BUL（w_mg） | ME:883 | 0.3 | 2 | Machine gun firing from behind a shield, muffled rattle |
| e_mtshield_die | 擊破 | C-DIE | ME:2722 | 2.0 | 2 | Shield walker destroyed, shield plate clattering to ground |

### mt_mortar（迫擊砲步行機）— ai mortar，RF-31＋迫擊砲，四足 l_qd
| 鍵 | 事件 | 目前的聲音 | 觸發處 | 長度 | 變化 | 提示詞 |
|---|---|---|---|---|---|---|
| e_mtmortar_step | 四足腳步 | C-STEP（四足） | game/feedback.js:304 | 0.5 | 2 | Quadruped mortar walker step, heavy servo thud |
| e_mtmortar_fire | 迫擊砲發射（落點圈同時出現） | `SFX.shot('grenade')` | game/support.js:165 | 1.0 | 2 | A single mortar firing, hollow deep thoomp of a shell launched from a metal tube, short echo |
| e_mtmortar_incoming | 砲彈落下的呼嘯 | **沒有聲音** | game/support.js:134-166 | 1.2 | 2 | Incoming mortar shell whistle descending |
| e_mtmortar_impact | 落地爆炸 | W-PJ | entities/projectile.js:303 | 1.5 | 2 | Mortar shell impact explosion, earth-shaking thud |
| e_mtmortar_rifle | 近距離步槍 | W-BUL（w_rifle） | entities/mech-special.js:544 | 0.3 | 2 | Assault rifle burst from a walker, crisp cracks |
| e_mtmortar_die | 擊破 | C-DIE | ME:2722 | 2.0 | 2 | A heavy vehicle explosion followed by several smaller popping secondary explosions of ammunition cooking off |

### minelayer（布雷無人機）— ai minelayer，飛行
| 鍵 | 事件 | 目前的聲音 | 觸發處 | 長度 | 變化 | 提示詞 |
|---|---|---|---|---|---|---|
| e_minelayer_fly | 飛行循環 | C-THR | game/feedback.js:243 | 3.0 循環 | 1 | Mine-laying drone hovering, low buzzing rotors |
| e_minelayer_drop | 撒下地雷 | `SFX.play('ui2', 0.5, 1.6)` | game/support.js:323 | 0.5 | 2 | Mine canister ejected and thudding into dirt, arming click |
| e_minelayer_mine_trig | 地雷被踩到（0.3 秒後爆） | `SFX.play('ui2', 0.9, 2.2)` | game/support.js:428（空雷 :421） | 0.3 | 1 | Landmine trigger click and rapid beep |
| e_minelayer_mine_boom | 地雷爆炸 | `SFX.explode`（blastTeam） | game/support.js:355 | 1.5 | 2 | Landmine detonation, sharp upward blast |
| e_minelayer_die | 擊落 | C-DIE | ME:2722 | 1.5 | 2 | Drone shot down, electrical pop and crash |

### mt_stomp（重踏步行機）— ai stomper（近身踏地衝擊波），SG-33，重二足 l_hv
| 鍵 | 事件 | 目前的聲音 | 觸發處 | 長度 | 變化 | 提示詞 |
|---|---|---|---|---|---|---|
| e_mtstomp_step | 重腳步 | C-STEP（重二足） | game/feedback.js:304 | 0.7 | 3 | Very heavy walker footstep, ground-shaking boom, hydraulic hiss |
| e_mtstomp_windup | 踏地的預備（停 0.7 秒） | 沒有聲音（只有畫面警報 C-ALERT） | ME:4321-4328、game/shockwave.js:39 | 0.8 | 1 | Huge mech leg rising, hydraulics straining before a stomp |
| e_mtstomp_shock | 衝擊波 | `SFX.explode(true)`（fx.groundWave 放出時） | fx/effects.js:1817 | 1.5 | 2 | Massive ground stomp shockwave, deep boom and rolling rumble |
| e_mtstomp_fire | 霰彈 | W-SG（w_sg） | ME:903 | 0.8 | 2 | Heavy shotgun blast, booming |
| e_mtstomp_die | 擊破 | C-DIE | ME:2722 | 2.5 | 2 | Heavy walker crashing down and exploding |

### repair（修理無人機）— ai repair，飛行
| 鍵 | 事件 | 目前的聲音 | 觸發處 | 長度 | 變化 | 提示詞 |
|---|---|---|---|---|---|---|
| e_repair_fly | 飛行循環 | C-THR | game/feedback.js:243 | 3.0 循環 | 1 | Small support drone hovering, gentle whirring fans |
| e_repair_beam | 修理光束（連到友軍、持續回復） | **沒有聲音** | entities/mech-special.js:618 | 2.0 循環 | 1 | Repair beam humming, soft electric buzz with welding sparkle |
| e_repair_die | 擊落 | C-DIE | ME:2722 | 1.5 | 2 | Repair drone crashing, sparking and fizzling |

### mt_dome（護盾產生器）— ai dome，四足 l_qd
| 鍵 | 事件 | 目前的聲音 | 觸發處 | 長度 | 變化 | 提示詞 |
|---|---|---|---|---|---|---|
| e_dome_step | 四足移動 | C-STEP（四足） | game/feedback.js:304 | 0.5 | 2 | Shield generator walker shuffling, heavy servo steps |
| e_dome_hum | 護盾展開中的循環 | **沒有聲音** | entities/mech-special.js:264 起（specialFx） | 3.0 循環 | 1 | Energy dome generator humming, deep resonant force-field drone |
| e_dome_absorb | 護盾吸收攻擊 | `SFX.hitDome` | entities/mech-special.js:139 | 0.4 | 3 | Bullet striking an energy shield, crackling hex-field ripple |
| e_dome_break | 護盾被打破（產生器過載） | `SFX.play('overload', 0.9, 1.2)` | entities/mech-special.js:155 | 1.5 | 1 | Force field shattering, electrical overload burst and crackle |
| e_dome_restore | 12 秒後重新展開 | `SFX.play('charge', 0.8, 1.2)` | entities/mech-special.js:639 | 1.5 | 1 | A sci-fi energy shield powering up, electric hum rising in pitch and ending with a bright crackling snap |
| e_dome_die | 擊破 | C-DIE | ME:2722 | 2.0 | 2 | Shield generator exploding with an electrical discharge |

### dropship（運輸機）— ai dropship，飛行
| 鍵 | 事件 | 目前的聲音 | 觸發處 | 長度 | 變化 | 提示詞 |
|---|---|---|---|---|---|---|
| e_dropship_fly | 飛來、離開的引擎循環 | C-THR | game/feedback.js:243 | 4.0 循環 | 1 | VTOL dropship engines roaring overhead, heavy turbofans |
| e_dropship_hover | 投放時降低高度（2.2 秒） | 沒有聲音（C-ALERT） | entities/mech-special.js:669 | 2.5 | 1 | A large aircraft hovering overhead, loud jet engines roaring and throttling down, deep rumbling turbine whine |
| e_dropship_drop | 投放 | `SFX.play('door', 0.9, 0.8)` | game/support.js:445 | 1.2 | 2 | Heavy metal clamps releasing with a loud clank, then a giant robot slamming hard into the ground with a deep thud |
| e_dropship_depart | 飛走離場 | 沒有聲音 | entities/mech-special.js:687 | 3.0 | 1 | Dropship engines powering up and flying away, fading doppler |
| e_dropship_die | 擊落 | C-DIE | ME:2722 | 3.0 | 2 | Transport aircraft shot down, engine failure whine and crash explosion |

### mt_cmd（指揮官步行機）— ai commander，RF-31，招式 burst
| 鍵 | 事件 | 目前的聲音 | 觸發處 | 長度 | 變化 | 提示詞 |
|---|---|---|---|---|---|---|
| e_mtcmd_step | 腳步 | C-STEP | game/feedback.js:304 | 0.5 | 2 | Command walker footstep, solid metal step with antenna rattle |
| e_mtcmd_aura | 強化友軍的指揮信號（每格 buffT） | **沒有聲音** | entities/mech-special.js:438-462 | 2.0 循環 | 1 | Tactical command uplink pulse, low radio data chirps |
| e_mtcmd_burst_warn | 點放的預警 | 沒有聲音 | entities/mech-moves.js:149 | 0.5 | 1 | Rifle charging handle racked, crisp click |
| e_mtcmd_fire | 步槍點放 | W-BUL（w_rifle） | ME:883 | 0.3 | 2 | Precise rifle burst from a command mech |
| e_mtcmd_die | 擊破（附近敵機混亂 4 秒） | C-DIE（混亂沒有聲音；另有敵兵喊話 `barkSay('cmdDown')`） | entities/mech-special.js:211-226 | 2.5 | 2 | Command walker destroyed, radio static burst and explosion |

### ac_longshot（LONGSHOT，ai sniper）— LC-055 雷射砲＋HG-22 手槍
| 鍵 | 事件 | 目前的聲音 | 觸發處 | 長度 | 變化 | 提示詞 |
|---|---|---|---|---|---|---|
| ac_longshot_boost | 推進、QB 拉開距離 | C-THR、C-QB | ME:3960-3962 | 0.8 | 2 | Sleek sniper mech boosting backward, clean high thruster burst |
| ac_longshot_lc | 雷射砲 | W-LAS（w_lc） | ME:1264 | 1.2 | 2 | Long-range laser cannon shot, piercing beam crack with tail |
| ac_longshot_hg | 手槍 | W-BUL（w_hg） | ME:883 | 0.3 | 2 | Mech handgun single shot, sharp snap |
| ac_longshot_die | 擊破 | C-DIE | ME:2722 | 2.5 | 1 | Ace mech destroyed, big explosion and cockpit alarm cut off |

### ac_berserker（BERSERKER，ai rusher）— CR-9 破碎爪＋SG-33
| 鍵 | 事件 | 目前的聲音 | 觸發處 | 長度 | 變化 | 提示詞 |
|---|---|---|---|---|---|---|
| ac_berserker_ab | 突擊推進衝過來 | C-QB 的 `SFX.ab` | ME:3999 | 1.2 | 2 | Aggressive mech assault booster roar, raw jet surge |
| ac_berserker_claw | 破碎爪揮擊／命中 | W-MEL（w_claw） | ME:1879、ME:2036 | 0.8 | 3 | Hydraulic crushing claw slam, metal tearing crunch |
| ac_berserker_sg | 霰彈 | W-SG（w_sg） | ME:903 | 0.8 | 2 | Point-blank mech shotgun blast |
| ac_berserker_die | 擊破 | C-DIE | ME:2722 | 2.5 | 1 | Berserker mech exploding mid-charge |

### ac_rain（RAIN，ai rain）— RF-31＋HG-22＋MS-8 ×2
| 鍵 | 事件 | 目前的聲音 | 觸發處 | 長度 | 變化 | 提示詞 |
|---|---|---|---|---|---|---|
| ac_rain_qb | 看到子彈就 QB 閃 | C-QB | ME:4010-4019 | 0.6 | 2 | Quick evasive mech side-dash, sharp thruster pop |
| ac_rain_ms8 | 重導彈齊射 | W-MSL（bw_ms8） | ME:1074 | 2.0 | 2 | Heavy missile barrage, many rockets streaking out in succession |
| ac_rain_rifle | 步槍 | W-BUL（w_rifle） | ME:883 | 0.3 | 2 | Mech assault rifle burst |
| ac_rain_hg | 手槍 | W-BUL（w_hg） | ME:883 | 0.3 | 2 | Mech handgun shot |
| ac_rain_die | 擊破 | C-DIE | ME:2722 | 2.5 | 1 | Missile mech destroyed, remaining rockets cooking off |

### ac_bastion（BASTION，ai bastion）— MG-18＋BZ-31＋GT-70＋GL-90，近身地面衝擊波
| 鍵 | 事件 | 目前的聲音 | 觸發處 | 長度 | 變化 | 提示詞 |
|---|---|---|---|---|---|---|
| ac_bastion_step | 重裝腳步 | C-STEP | game/feedback.js:304 | 0.6 | 2 | Heavily armored mech step, weighty clank |
| ac_bastion_shock_windup | 衝擊波的預備（0.8 秒） | 沒有聲音（C-ALERT） | ME:4321 | 0.9 | 1 | Fortress mech bracing, servos locking, power building |
| ac_bastion_shock | 地面衝擊波 | `SFX.explode(true)` | fx/effects.js:1817 | 1.5 | 1 | Heavy ground pound shockwave from an armored mech |
| ac_bastion_mg | 機槍 | W-BUL（w_mg） | ME:883 | 0.3 | 2 | Mech machine gun burst |
| ac_bastion_bz | 火箭筒 | W-SHL（w_bz） | ME:927 | 1.2 | 2 | Bazooka round launched, heavy thump |
| ac_bastion_gat | 背部加特林 | W-BUL（bw_gat） | ME:883 | 0.5 | 2 | Back-mounted gatling roaring |
| ac_bastion_gr | 榴彈砲 | W-GR（bw_gr） | ME:979 | 0.8 | 2 | Shoulder grenade cannon thump |
| ac_bastion_die | 擊破 | C-DIE | ME:2722 | 3.0 | 1 | Fortress-class mech destroyed, layered heavy explosions |

### ac_duelist（DUELIST，ai duelist）— PB-37 脈衝刀 ×2
| 鍵 | 事件 | 目前的聲音 | 觸發處 | 長度 | 變化 | 提示詞 |
|---|---|---|---|---|---|---|
| ac_duelist_qb | 閃避與逼近的 QB | C-QB | ME:4028-4038 | 0.5 | 3 | Fast agile mech quick-boost, crisp energetic burst |
| ac_duelist_blade | 雙脈衝刀揮擊／命中 | W-MEL（w_blade） | ME:1879、ME:2036 | 0.6 | 3 | Pulse blade slash, humming energy edge whoosh and sizzle hit |
| ac_duelist_die | 擊破 | C-DIE | ME:2722 | 2.5 | 1 | Duelist mech cut down, energy blades fizzling out, explosion |

### ac_gravel（GRAVEL，ai ac）— SG-33 ×2＋MS-4 ×2
| 鍵 | 事件 | 目前的聲音 | 觸發處 | 長度 | 變化 | 提示詞 |
|---|---|---|---|---|---|---|
| ac_gravel_boost | 推進／QB | C-THR、C-QB | ME:4110 | 0.8 | 2 | Mid-weight mech boosting, gritty thruster blast |
| ac_gravel_sg | 雙霰彈 | W-SG（w_sg） | ME:903 | 0.8 | 2 | Double shotgun blast in quick succession |
| ac_gravel_ms | 導彈 | W-MSL（bw_ms） | ME:1074 | 1.5 | 2 | Shoulder missile pods firing |
| ac_gravel_die | 擊破 | C-DIE | ME:2722 | 2.5 | 1 | Mech destroyed, heavy explosion |

### ac_nightfall（DUSKWARD，ai ac）— LR-40 ×2＋LCB-60
| 鍵 | 事件 | 目前的聲音 | 觸發處 | 長度 | 變化 | 提示詞 |
|---|---|---|---|---|---|---|
| ac_duskward_boost | 推進／QB | C-THR、C-QB | ME:4110 | 0.8 | 2 | Stealthy dark mech boosting, smooth low-hiss thrusters |
| ac_duskward_lr | 雙雷射步槍 | W-LAS（w_lr） | ME:1264 | 0.6 | 3 | Twin laser rifle shots, cold electric zaps |
| ac_duskward_lc | 背雷射砲 | W-LAS（bw_lc） | ME:1264 | 1.0 | 2 | Shoulder laser cannon blast, deep energy thrum |
| ac_duskward_die | 擊破 | C-DIE | ME:2722 | 2.5 | 1 | Energy-armed mech exploding with electric discharge |

### ac_hornet（HORNET，ai duelist）— MG-18＋HG-22＋GT-70
| 鍵 | 事件 | 目前的聲音 | 觸發處 | 長度 | 變化 | 提示詞 |
|---|---|---|---|---|---|---|
| ac_hornet_qb | 高頻率 QB | C-QB | ME:4028 | 0.5 | 3 | Buzzing high-speed mech dash, insect-like whine |
| ac_hornet_mg | 機槍 | W-BUL（w_mg） | ME:883 | 0.3 | 2 | Rapid machine gun stream |
| ac_hornet_hg | 手槍 | W-BUL（w_hg） | ME:883 | 0.3 | 2 | Handgun snap |
| ac_hornet_gat | 背部加特林 | W-BUL（bw_gat） | ME:883 | 0.5 | 2 | Gatling buzz-saw fire |
| ac_hornet_die | 擊破 | C-DIE | ME:2722 | 2.5 | 1 | Light fast mech blowing apart |

### ac_piledriver（PILEDRIVER，ai rusher）— PB-X 打樁機＋SH-02 脈衝盾
| 鍵 | 事件 | 目前的聲音 | 觸發處 | 長度 | 變化 | 提示詞 |
|---|---|---|---|---|---|---|
| ac_piledriver_ab | 突擊推進 | C-QB 的 `SFX.ab` | ME:3999 | 1.2 | 2 | Heavy assault booster roaring |
| ac_piledriver_pile | 打樁機 | W-MEL（w_pile） | ME:1879、ME:2036 | 1.0 | 2 | Pile bunker firing, explosive piston slam and metal punch |
| ac_piledriver_shield | 脈衝盾擋下 | `SFX.play('shield', 0.9, 1.2)` | ME:2391 | 0.5 | 2 | Pulse shield blocking hits, bright electric clang |
| ac_piledriver_die | 擊破 | C-DIE | ME:2722 | 2.5 | 1 | Brawler mech destroyed, explosion |

### ac_volker（VOLKER，ai bastion）— LC-055＋BZ-31＋GL-90 ×2，近身地面衝擊波
| 鍵 | 事件 | 目前的聲音 | 觸發處 | 長度 | 變化 | 提示詞 |
|---|---|---|---|---|---|---|
| ac_volker_step | 重裝腳步 | C-STEP | game/feedback.js:304 | 0.6 | 2 | Heavy commander mech footstep |
| ac_volker_shock | 地面衝擊波（預備 0.8 秒＋放出） | 預備沒有聲音；放出 `SFX.explode(true)` | ME:4321、fx/effects.js:1817 | 1.8 | 1 | Armored mech slamming the ground, building whine then shockwave boom |
| ac_volker_lc | 雷射砲 | W-LAS（w_lc） | ME:1264 | 1.2 | 2 | Laser cannon discharge |
| ac_volker_bz | 火箭筒 | W-SHL（w_bz） | ME:927 | 1.2 | 2 | Bazooka shot |
| ac_volker_gr | 雙榴彈砲 | W-GR（bw_gr） | ME:979 | 0.8 | 2 | Twin grenade cannons firing |
| ac_volker_die | 擊破 | C-DIE | ME:2722 | 3.0 | 1 | Ace heavy mech destroyed in layered explosions |

### ac（敵對機甲，隨機組裝；表裡是預設組裝 LSG-06＋LR-40＋EMP-S＋PM-6）
| 鍵 | 事件 | 目前的聲音 | 觸發處 | 長度 | 變化 | 提示詞 |
|---|---|---|---|---|---|---|
| ac_generic_step | 腳步（依組裝的腳部） | C-STEP | game/feedback.js:304 | 0.5 | 3 | Hostile combat mech footstep, solid metal stomp |
| ac_generic_boost | 推進、QB、突擊推進 | C-THR、C-QB | ME:4110、ME:4136 | 0.8 | 3 | Enemy mech thrusters, aggressive boost burst |
| ac_generic_lsg | 雷射霰彈 | W-SG（w_lsg） | ME:903 | 0.8 | 2 | Laser shotgun spread, crackling multi-beam burst |
| ac_generic_lr | 雷射步槍 | W-LAS（w_lr） | ME:1264 | 0.6 | 2 | Laser rifle zap |
| ac_generic_emp | 小型電磁脈衝 | W-EMP | game/game.js:231 | 1.2 | 2 | Small EMP burst, electric whump and static crackle |
| ac_generic_pm | 電漿導彈 | W-MSL（bw_pm） | ME:1074 | 1.5 | 2 | Plasma missiles launching, humming energy projectiles |
| ac_generic_die | 擊破 | C-DIE | ME:2722 | 2.5 | 2 | Enemy mech destroyed, big explosion and wreckage |

（隨機組裝的武器可能是任何武器，建議沿用玩家武器清單的聲音，這裡只列預設組裝。10 名具名 AC（`AC_ROSTER`）也一樣：武器聲如果要「每台自己的」，就照上表各列；要省可以只做推進與擊破，武器沿用武器清單。）

## 2. 專屬敵人：原本的 26 種（data/foes.js，行為 entities/mech-foe.js）

這一組的「foe」行為都在 `entities/mech-foe.js`（`foeMove` :63、`foeFire` :202、`foeDefense` :1045、`foeFx` :945）。程式模型（`modelKind 'boss'`）沒有自己的引擎、旋翼、履帶聲；履帶腳 `l_tk` 也沒有腳步聲（`game/feedback.js:296`）。

### scav（拾荒步行機，荒野）— ai mt，MG-18，輕二足
| 鍵 | 事件 | 目前的聲音 | 觸發處 | 長度 | 變化 | 提示詞 |
|---|---|---|---|---|---|---|
| foe_scav_step | 腳步 | C-STEP | game/feedback.js:304 | 0.4 | 3 | Scrappy patched-together walker step, rattling loose panels |
| foe_scav_fire | 機槍 | W-BUL（w_mg） | ME:883 | 0.3 | 2 | Worn-out machine gun burst, gritty uneven rattle |
| foe_scav_salvage | 撿同伴零件強化（AP +30%、火力 +12%） | **沒有聲音**（只有 `fx.ring`；第一次 C-ALERT） | game/mission.js:981-994 | 1.2 | 1 | Metal being ripped and torn apart, harsh screeching steel, then a power wrench ratcheting bolts tight |
| foe_scav_die | 擊破 | C-DIE | ME:2722 | 2.0 | 2 | Junk-armored walker falling apart in an explosion |

### junk（廢鐵合成體，荒野）— ai junk，MG-18＋GL-90，外殼吸收傷害
| 鍵 | 事件 | 目前的聲音 | 觸發處 | 長度 | 變化 | 提示詞 |
|---|---|---|---|---|---|---|
| foe_junk_move | 移動循環（履帶） | **沒有聲音** | — | 3.0 循環 | 1 | Lumbering scrap-metal golem machine grinding forward, creaking junk |
| foe_junk_shell_hit | 外殼吸收子彈 | **沒有聲音**（只有一般的 C-HIT） | entities/mech-foe.js:1053-1062 | 0.4 | 3 | Bullets clanging into a pile of scrap armor, hollow junk impacts |
| foe_junk_absorb | 吸附附近的物件補外殼 | 物件破壞的聲音（`damageProp`）＋C-ALERT | entities/mech-foe.js:121-140 | 1.5 | 1 | Magnetic pull yanking debris onto a machine, crashing scrap and grinding metal |
| foe_junk_shell_break | 外殼剝落 | **沒有聲音**（`fx.explosion`＋C-ALERT） | entities/mech-foe.js:1055-1060 | 1.5 | 1 | Scrap armor shell bursting apart, large sheets of metal clattering down |
| foe_junk_mg | 機槍 | W-BUL（w_mg） | ME:883 | 0.3 | 2 | Rusty machine gun burst |
| foe_junk_gr | 榴彈 | W-GR（bw_gr） | ME:979 | 0.8 | 2 | Crude grenade cannon thump |
| foe_junk_die | 擊破 | C-DIE | ME:2722 | 2.5 | 2 | Scrap golem collapsing into a heap of junk with explosion |

### crane（起重機砲台，集散場）— ai crane（不移動）
| 鍵 | 事件 | 目前的聲音 | 觸發處 | 長度 | 變化 | 提示詞 |
|---|---|---|---|---|---|---|
| foe_crane_idle | 起重機轉動、吊著貨櫃 | **沒有聲音** | entities/mech-foe.js:85-89 | 3.0 循環 | 1 | Industrial gantry crane motor humming, cable creaking under load |
| foe_crane_warn | 快要丟出（模型預警 1.2 秒） | 沒有聲音 | entities/mech-foe.js:224 | 1.2 | 1 | Crane winch straining and swinging a container, chains rattling |
| foe_crane_throw | 拋出貨櫃（落點預警圈） | `SFX.shot('grenade')` | game/support.js:194 | 1.0 | 2 | Heavy cargo container released and flung, whoosh of a huge mass |
| foe_crane_land | 貨櫃落地 | W-PJ（`SFX.explode`） | entities/projectile.js:303 | 1.5 | 2 | Shipping container slamming into ground, enormous metallic crash |
| foe_crane_reload | 重新吊起貨櫃 | 沒有聲音 | entities/mech-foe.js:220 | 1.5 | 1 | Crane hook lowering and lifting a new container, winch whir and clank |
| foe_crane_die | 擊破 | C-DIE | ME:2722 | 3.0 | 1 | Crane tower collapsing, steel girders twisting and crashing |

### forklift（叉架步行機，集散場）— ai forklift，MG-18，舉貨櫃當盾
| 鍵 | 事件 | 目前的聲音 | 觸發處 | 長度 | 變化 | 提示詞 |
|---|---|---|---|---|---|---|
| foe_forklift_move | 移動循環 | **沒有聲音** | — | 2.0 循環 | 1 | An industrial forklift engine idling and puttering, diesel motor chugging with creaking hydraulic forks |
| foe_forklift_lift | 舉起新的貨櫃 | 沒有聲音（`fx.dust`） | entities/mech-foe.js:234-237 | 1.2 | 1 | Hydraulic forks hoisting a heavy container, pump whine and metal thunk |
| foe_forklift_guard | 貨櫃正面擋子彈 | 沒有聲音（`fx.spark`） | entities/mech-foe.js:1082 | 0.4 | 3 | Bullets pinging off a steel shipping container |
| foe_forklift_guardbreak | 近戰打掉貨櫃 | 沒有聲音（GUARD BREAK 文字） | entities/mech-foe.js:1074-1080 | 1.2 | 1 | Container knocked off forks, huge metallic crash and tumble |
| foe_forklift_throw | 20 m 內丟出貨櫃 | `SFX.shot('grenade')` | game/support.js:194 | 0.8 | 2 | Forklift mech hurling a container forward, hydraulic burst |
| foe_forklift_land | 貨櫃落地 | W-PJ | entities/projectile.js:303 | 1.2 | 2 | Container crashing down, heavy metal impact |
| foe_forklift_fire | 機槍 | W-BUL（w_mg） | ME:883 | 0.3 | 2 | Small machine gun burst |
| foe_forklift_die | 擊破 | C-DIE | ME:2722 | 2.0 | 2 | Forklift mech exploding, forks clattering |

### gategun（閘門砲台，水壩）— ai gategun，BZ-31
| 鍵 | 事件 | 目前的聲音 | 觸發處 | 長度 | 變化 | 提示詞 |
|---|---|---|---|---|---|---|
| foe_gategun_warn | 開閘預警（藍色區域 2 秒、捲揚輪轉） | `SFX.play('ui2', 0.7, 0.6)` | entities/mech-foe.js:308 | 2.0 | 1 | Dam floodgate klaxon and heavy winch wheel turning, rising pressure groan |
| foe_gategun_open | 開閘放水 | `SFX.play('door', 1, 0.6)` | entities/mech-foe.js:311 | 2.0 | 1 | Massive sluice gate opening, torrent of water bursting out |
| foe_gategun_flow | 水流 4.5 秒（推機體、造成傷害） | **沒有聲音** | game/support.js:231-300 | 4.5 循環 | 1 | Raging floodwater rushing through a channel, roaring white water |
| foe_gategun_fire | 火箭筒 | W-SHL（w_bz） | ME:927 | 1.2 | 2 | Bazooka round fired from a dam turret |
| foe_gategun_die | 擊破 | C-DIE | ME:2722 | 2.5 | 1 | Gate turret explosion, water spray and steel debris |

### patrol（壩頂巡邏砲車，水壩）— ai strider，BZ-31＋GL-90，生成在壩頂
| 鍵 | 事件 | 目前的聲音 | 觸發處 | 長度 | 變化 | 提示詞 |
|---|---|---|---|---|---|---|
| foe_patrol_move | 砲車移動循環 | **沒有聲音** | — | 3.0 循環 | 1 | Patrol gun cart engine rumbling along a dam top, rolling wheels |
| foe_patrol_climb | 跳上高處 | C-THR、C-QB | ME:4043-4060 | 1.2 | 1 | Cart thrusters hopping up, short jet blast |
| foe_patrol_bz | 火箭筒 | W-SHL（w_bz） | ME:927 | 1.2 | 2 | Elevated cannon firing down, booming shot |
| foe_patrol_gr | 榴彈 | W-GR（bw_gr） | ME:979 | 0.8 | 2 | Grenade lobbed from high ground, hollow thump |
| foe_patrol_die | 擊破 | C-DIE | ME:2722 | 2.0 | 2 | Gun cart destroyed and tumbling |

### gunboat（潛航砲艇，淹沒城區）— ai gunboat
| 鍵 | 事件 | 目前的聲音 | 觸發處 | 長度 | 變化 | 提示詞 |
|---|---|---|---|---|---|---|
| foe_gunboat_sub | 潛航移動（水下的氣泡） | **沒有聲音** | entities/mech-foe.js:329-342 | 3.0 循環 | 1 | Submerged boat propeller churning underwater, muffled bubbles |
| foe_gunboat_surface | 浮出水面 | **沒有聲音**（`fx.dust`） | entities/mech-foe.js:343-350 | 1.5 | 2 | Armored gunboat breaching the surface, water cascading off the hull |
| foe_gunboat_torpedo | 發射魚雷（3 枚） | `SFX.shot('missile')` | game/support.js:225 | 1.0 | 2 | Torpedo launched from a tube, pneumatic thump and water hiss |
| foe_gunboat_torp_hit | 魚雷命中爆炸 | W-PJ | entities/projectile.js:303 | 1.5 | 2 | Torpedo exploding, water geyser blast |
| foe_gunboat_dive | 潛回水中 | **沒有聲音** | entities/mech-foe.js:360-363 | 1.5 | 1 | Boat flooding ballast and sinking, gurgling water rush |
| foe_gunboat_die | 擊破 | C-DIE | ME:2722 | 2.0 | 2 | Gunboat explodes and sinks, steam hiss and splash |

### sprayer（汙染噴射步行機，淹沒城區）— ai sprayer，MG-18
| 鍵 | 事件 | 目前的聲音 | 觸發處 | 長度 | 變化 | 提示詞 |
|---|---|---|---|---|---|---|
| foe_sprayer_move | 移動循環 | **沒有聲音** | — | 2.0 循環 | 1 | Liquid sloshing inside metal tanks while a mechanical pump chugs rhythmically, wet industrial machine noise |
| foe_sprayer_warn | 快要噴（噴嘴抬起、1 秒前） | 沒有聲音 | entities/mech-foe.js:388 | 1.0 | 1 | Pressurized tank building pressure, valve hiss rising |
| foe_sprayer_spray | 噴出汙染液（落點圈） | **沒有聲音**（`fx.streaks`＋warn 事件） | entities/mech-foe.js:379-384 | 1.2 | 2 | Thick toxic liquid jetting out of a nozzle, gurgling spray |
| foe_sprayer_pool | 落地成腐蝕區（10 秒） | **沒有聲音**（`addPool` 沒有聲音） | entities/mech-foe.js:385 | 3.0 循環 | 1 | Corrosive acid puddle bubbling and sizzling on metal |
| foe_sprayer_fire | 機槍 | W-BUL（w_mg） | ME:883 | 0.3 | 2 | Small machine gun burst |
| foe_sprayer_die | 擊破 | C-DIE | ME:2722 | 2.0 | 2 | Chemical tank rupturing, explosion with liquid splatter |

### lurker（雪中潛伏步行機，冰原）— ai lurker，SG-33
| 鍵 | 事件 | 目前的聲音 | 觸發處 | 長度 | 變化 | 提示詞 |
|---|---|---|---|---|---|---|
| foe_lurker_hide | 埋在雪裡爬近（熱源白煙） | **沒有聲音** | entities/mech-foe.js:416-424 | 3.0 循環 | 1 | Machine crawling under snow, muffled crunching and faint steam hiss |
| foe_lurker_rise | 現身（雪噴起） | **沒有聲音**（`fx.dust`） | entities/mech-foe.js:437-443 | 1.2 | 2 | Mech bursting up out of deep snow, powder exploding, servo roar |
| foe_lurker_rehide | 再埋回雪裡 | **沒有聲音** | entities/mech-foe.js:428-431 | 1.2 | 1 | A heavy machine digging into deep snow, crunching and packing snow, settling with a soft muffled thump |
| foe_lurker_fire | 霰彈 | W-SG（w_sg） | ME:903 | 0.8 | 2 | Ambush shotgun blast at close range |
| foe_lurker_die | 擊破 | C-DIE | ME:2722 | 2.0 | 2 | Snow-camouflaged walker exploding, snow spray |

### skater（冰面滑行砲車，冰原）— ai skater，MG-18，風扇推進
| 鍵 | 事件 | 目前的聲音 | 觸發處 | 長度 | 變化 | 提示詞 |
|---|---|---|---|---|---|---|
| foe_skater_fan | 風扇推進＋滑行循環（冰面 ×1.4） | **沒有聲音**（風扇只轉動模型） | entities/mech-foe.js:446-465 | 3.0 循環 | 1 | Propeller-driven ice skimmer whirring, blades skating on ice |
| foe_skater_fire | 繞圈掃射 | W-BUL（w_mg） | ME:883 | 0.3 | 2 | Machine gun strafing from a fast-moving skimmer |
| foe_skater_die | 擊破 | C-DIE | ME:2722 | 2.0 | 2 | Ice skimmer crashing and exploding, ice shards scattering |

### blob（實驗體，研究特區）— ai blob，咬
| 鍵 | 事件 | 目前的聲音 | 觸發處 | 長度 | 變化 | 提示詞 |
|---|---|---|---|---|---|---|
| foe_blob_move | 蠕動前進 | 二足 C-STEP（l_bp2） | game/feedback.js:304 | 0.4 | 3 | Wet fleshy bio-mechanical creature squelching forward |
| foe_blob_lunge | 撲過來（QB） | C-QB | ME:3540 | 0.6 | 2 | Bio-creature lunging with a wet hiss and snarl |
| foe_blob_bite | 啃咬 | **沒有聲音**（只有 `fx.meleeHit`） | entities/mech-foe.js:498-510 | 0.5 | 3 | Biting jaws clamping on metal, crunching and slimy snap |
| foe_blob_merge | 三隻融合成大型個體 | **沒有聲音**（`fx.explosion`、`shockwave`＋C-ALERT） | entities/mech-foe.js:525-536 | 2.0 | 1 | Organic masses fusing together, grotesque wet squelching and rising roar |
| foe_blob_die | 擊破 | C-DIE | ME:2722 | 1.5 | 2 | Bio-creature bursting, wet splatter with mechanical pop |

### chimera（融合實驗體，研究特區）— ai blob（大型）
| 鍵 | 事件 | 目前的聲音 | 觸發處 | 長度 | 變化 | 提示詞 |
|---|---|---|---|---|---|---|
| foe_chimera_move | 沉重的移動（履帶腳＝沒有腳步聲） | **沒有聲音** | — | 3.0 循環 | 1 | Huge fused bio-mech creature dragging itself, heavy wet thuds and growling |
| foe_chimera_bite | 重咬（衝擊大） | **沒有聲音** | entities/mech-foe.js:498-510 | 0.8 | 2 | Massive monstrous jaws crushing armor, bone-deep crunch |
| foe_chimera_die | 擊破 | C-DIE | ME:2722 | 2.5 | 1 | Giant bio-creature dying, guttural roar fading into wet explosion |

### laserpost（保全雷射網，研究特區）— ai laserpost（不移動、旋轉柵欄）
| 鍵 | 事件 | 目前的聲音 | 觸發處 | 長度 | 變化 | 提示詞 |
|---|---|---|---|---|---|---|
| foe_laserpost_hum | 雷射柵欄旋轉、閃爍的循環 | **沒有聲音** | entities/mech-foe.js:538-552、:950 | 3.0 循環 | 1 | Rotating security laser grid humming, buzzing energy bar |
| foe_laserpost_touch | 碰到柵欄受傷 | **沒有聲音**（`fx.spark`） | entities/mech-foe.js:560-571 | 0.4 | 2 | Laser beam searing metal, sharp sizzle zap |
| foe_laserpost_alarm | 保全警報＋叫增援（15 秒一次） | `SFX.play('ui2', 1, 0.5)`＋C-ALERT | entities/mech-foe.js:578 | 2.0 | 1 | Facility security alarm siren blaring, intruder alert |
| foe_laserpost_die | 擊破 | C-DIE | ME:2722 | 1.5 | 1 | Laser post short-circuiting and exploding, electric fizz |

### crawler（構造體爬行機，Lattice-9）— ai crawler，SG-33，沿柱子爬上平台
| 鍵 | 事件 | 目前的聲音 | 觸發處 | 長度 | 變化 | 提示詞 |
|---|---|---|---|---|---|---|
| foe_crawler_step | 腳步 | C-STEP | game/feedback.js:304 | 0.4 | 3 | Spidery crawler machine skittering, sharp metal claw taps |
| foe_crawler_climb | 垂直爬牆（火花） | **沒有聲音**（`fx.spark`） | entities/mech-foe.js:637-643 | 2.0 循環 | 1 | Metal claws scraping and gripping a steel pillar, grinding screech with sparks and quick servo motor clicks |
| foe_crawler_fire | 霰彈 | W-SG（w_sg） | ME:903 | 0.8 | 2 | Shotgun blast from a crawler |
| foe_crawler_die | 擊破 | C-DIE | ME:2722 | 1.5 | 2 | Crawler machine bursting, legs clattering |

### underturret（平台底部砲塔，Lattice-9）— ai underturret，MG-18，吊在平台底面
| 鍵 | 事件 | 目前的聲音 | 觸發處 | 長度 | 變化 | 提示詞 |
|---|---|---|---|---|---|---|
| foe_underturret_idle | 吊掛砲塔的轉動 | **沒有聲音** | entities/mech-foe.js:651-683 | 2.0 循環 | 1 | A mechanical gun turret slowly rotating, servo motor whine with creaking metal mount |
| foe_underturret_fire | 往下機槍掃射 | W-BUL（w_mg） | ME:883 | 0.3 | 2 | Machine gun firing downward from an overhead turret, echoing |
| foe_underturret_die | 擊破（掉下來） | C-DIE | ME:2722 | 2.0 | 1 | Overhead turret blown off its mount, falling and crashing |

### testrig（推進器試車台，宇宙港）— ai testrig（不移動）
| 鍵 | 事件 | 目前的聲音 | 觸發處 | 長度 | 變化 | 提示詞 |
|---|---|---|---|---|---|---|
| foe_testrig_warn | 預警 1.5 秒（地上的長方形） | **沒有聲音** | entities/mech-foe.js:725-731 | 1.5 | 1 | Rocket engine test stand spooling up, turbopump whine rising |
| foe_testrig_ignite | 噴火開始 | `SFX.play('overload', 0.8, 0.6)` | entities/mech-foe.js:735 | 1.0 | 1 | Rocket engine ignition, explosive roar kick-in |
| foe_testrig_flame | 噴火 2.5 秒（橫掃） | **沒有聲音**（`fx.flameCone`） | entities/mech-foe.js:737-765 | 2.5 循環 | 1 | Sustained rocket exhaust blast, deafening roaring flame |
| foe_testrig_shutdown | 噴完停機 | 沒有聲音 | entities/mech-foe.js:766-769 | 1.5 | 1 | A large rocket engine shutting down, roaring flame dying out, followed by hot metal ticking as it cools |
| foe_testrig_die | 擊破 | C-DIE | ME:2722 | 2.5 | 1 | Test stand exploding, fuel lines bursting into fire |

### spacemt（舊式宇宙用步行機，宇宙港）— ai hopper，RF-31，長時間滯空
| 鍵 | 事件 | 目前的聲音 | 觸發處 | 長度 | 變化 | 提示詞 |
|---|---|---|---|---|---|---|
| foe_spacemt_step | 腳步 | C-STEP | game/feedback.js:304 | 0.5 | 2 | Old space-rated walker step, light bouncy metal thud |
| foe_spacemt_hop | 高跳、滯空推進 | C-THR、C-QB | entities/mech-foe.js:775-789 | 2.0 | 2 | Retro space mech maneuvering jets puffing, cold-gas thruster bursts |
| foe_spacemt_fire | 步槍 | W-BUL（w_rifle） | ME:883 | 0.3 | 2 | Old-model rifle burst |
| foe_spacemt_die | 擊破 | C-DIE | ME:2722 | 2.0 | 2 | Vintage space walker exploding, pressurized tank burst |

### rammer（衝撞無人機，洋上都市）— ai rammer，飛行
| 鍵 | 事件 | 目前的聲音 | 觸發處 | 長度 | 變化 | 提示詞 |
|---|---|---|---|---|---|---|
| foe_rammer_fly | 飛行循環 | C-THR | game/feedback.js:243 | 3.0 循環 | 1 | Armored ram drone droning, heavy rotor buzz |
| foe_rammer_warn | 預警線 0.8 秒 | **沒有聲音**（`fx.warnLine`） | entities/mech-foe.js:811-816 | 0.8 | 1 | A small jet engine revving up to full power, whine rising quickly in pitch, aggressive and building |
| foe_rammer_charge | 高速衝撞（1.2 秒） | **沒有聲音** | entities/mech-foe.js:825-830 | 1.2 | 2 | Drone rocketing forward at high speed, screaming doppler |
| foe_rammer_hit | 撞上（往外推） | **沒有聲音**（`fx.meleeHit`） | entities/mech-foe.js:830-833 | 0.8 | 2 | Heavy drone slamming into mech armor, crunching metal impact |
| foe_rammer_die | 擊落 | C-DIE | ME:2722 | 1.5 | 2 | Ram drone shot down, crashing explosion |

### flak（艦載防空砲，洋上都市）— ai flak（不移動），MG-18 對地、空炸彈對空
| 鍵 | 事件 | 目前的聲音 | 觸發處 | 長度 | 變化 | 提示詞 |
|---|---|---|---|---|---|---|
| foe_flak_fire | 對空射出空炸彈（0.35 秒一發） | **沒有聲音**（直接建 Projectile，沒有 `SFX.shot`） | entities/mech-foe.js:858-877 | 0.6 | 3 | Anti-aircraft flak cannon thumping rapidly, sharp heavy reports |
| foe_flak_burst | 空炸彈爆炸 | W-PJ | entities/projectile.js:303 | 1.0 | 3 | Flak shell airburst, sharp crack with shrapnel crackle |
| foe_flak_mg | 對地機槍 | W-BUL（w_mg） | ME:883 | 0.3 | 2 | Deck machine gun burst |
| foe_flak_die | 擊破 | C-DIE | ME:2722 | 2.0 | 1 | AA gun emplacement exploding, ammo cooking off |

### vacuum（真空作業機，高空軌道）— ai vacuum，LR-40，全程懸浮
| 鍵 | 事件 | 目前的聲音 | 觸發處 | 長度 | 變化 | 提示詞 |
|---|---|---|---|---|---|---|
| foe_vacuum_hover | 懸浮循環 | C-THR | game/feedback.js:243 | 3.0 循環 | 1 | Vacuum work pod hovering, soft RCS puffs and electric hum |
| foe_vacuum_shift | 每 2 秒換高度 | 沒有聲音 | entities/mech-foe.js:903-906 | 0.6 | 2 | Short bursts of compressed gas thrusters, quick sharp hissing puffs of air, sci-fi spacecraft maneuvering |
| foe_vacuum_fire | 雷射 | W-LAS（w_lr） | ME:1264 | 0.6 | 2 | Industrial cutting laser repurposed as a weapon, bright zap |
| foe_vacuum_die | 擊破 | C-DIE | ME:2722 | 1.5 | 2 | Work pod breaching, decompression hiss and explosion |

### marker（軌道標定衛星，高空軌道）— ai marker，飛行
| 鍵 | 事件 | 目前的聲音 | 觸發處 | 長度 | 變化 | 提示詞 |
|---|---|---|---|---|---|---|
| foe_marker_hover | 衛星飛行循環 | C-THR | game/feedback.js:243 | 3.0 循環 | 1 | Small satellite humming, faint electronic telemetry tones |
| foe_marker_mark | 光束標定目標（5 秒、受傷 ×1.3） | **沒有聲音**（`fx.beam`、`fx.ring`＋C-ALERT） | entities/mech-foe.js:920-927 | 1.0 | 2 | Targeting laser locking on, piercing high tone and data chirp |
| foe_marker_die | 擊落 | C-DIE | ME:2722 | 1.5 | 1 | A small satellite breaking apart, electric pop with crackling sparks and shattering metal and glass pieces |

### burrow（沙中伏擊者，沙丘）— ai burrow，SG-33
| 鍵 | 事件 | 目前的聲音 | 觸發處 | 長度 | 變化 | 提示詞 |
|---|---|---|---|---|---|---|
| foe_burrow_under | 在沙下快速接近 | **沒有聲音**（`fx.dust`） | entities/mech-foe.js:157-167 | 3.0 循環 | 1 | Machine tunneling through sand, deep rumbling and shifting grains |
| foe_burrow_warn | 腳下的預警圈（0.9 秒） | **沒有聲音** | entities/mech-foe.js:163-167 | 0.9 | 1 | Ground trembling, sand hissing and rising rumble beneath feet |
| foe_burrow_erupt | 從腳下鑽出（頂起目標） | **沒有聲音** | entities/mech-foe.js:170-188 | 1.2 | 2 | Machine erupting out of sand, explosive burst of earth and roaring drill |
| foe_burrow_dive | 再鑽回沙裡 | **沒有聲音** | entities/mech-foe.js:191-196 | 1.2 | 1 | Machine diving back into sand, whooshing grains and fading rumble |
| foe_burrow_fire | 霰彈 | W-SG（w_sg） | ME:903 | 0.8 | 2 | Shotgun blast from an ambush machine |
| foe_burrow_die | 擊破 | C-DIE | ME:2722 | 2.0 | 2 | Burrowing machine destroyed, sand blasting outward |

### jammer（沙暴干擾機，沙丘）— ai drone，HG-22，25 m 內鎖定距離減半
| 鍵 | 事件 | 目前的聲音 | 觸發處 | 長度 | 變化 | 提示詞 |
|---|---|---|---|---|---|---|
| foe_jammer_hum | 干擾電波＋天線旋轉的循環 | **沒有聲音** | entities/mech-foe.js:953 | 3.0 循環 | 1 | Electronic jammer emitting warbling static, radar dish whirring |
| foe_jammer_jam | 玩家進入干擾範圍（鎖定變短） | **沒有聲音** | （lockReach 判定） | 1.0 | 1 | Radio interference crackle, targeting system glitching |
| foe_jammer_fire | 手槍 | W-BUL（w_hg） | ME:883 | 0.3 | 2 | Small sidearm shot from a drone |
| foe_jammer_die | 擊落 | C-DIE | ME:2722 | 1.5 | 1 | Jammer drone exploding, static cutting off abruptly |

### drill（鑽頭採礦機，礦坑）— ai drill，貼身鑽擊
| 鍵 | 事件 | 目前的聲音 | 觸發處 | 長度 | 變化 | 提示詞 |
|---|---|---|---|---|---|---|
| foe_drill_idle | 鑽頭空轉循環 | **沒有聲音**（只有模型旋轉） | entities/mech-foe.js:79 | 3.0 循環 | 1 | Mining drill spinning, grinding motor whine |
| foe_drill_rush | QB 衝過來 | C-QB | entities/mech-foe.js:69 | 0.6 | 2 | Heavy mining machine lurching forward on thrusters |
| foe_drill_hit | 鑽擊命中 | `SFX.meleeHit(true)` | entities/mech-foe.js:76 | 1.0 | 3 | Industrial drill biting into armor, shrieking metal grind and sparks |
| foe_drill_die | 擊破 | C-DIE | ME:2722 | 2.0 | 2 | Mining machine exploding, drill bit flying off |

### cart（炸藥礦車，礦坑）— ai kamikaze，explodeOnDeath（800）
| 鍵 | 事件 | 目前的聲音 | 觸發處 | 長度 | 變化 | 提示詞 |
|---|---|---|---|---|---|---|
| foe_cart_roll | 礦車滾過來 | **沒有聲音** | ME:3989-4007 | 3.0 循環 | 1 | A mine cart rolling on steel rails, rattling wheels clacking over rail joints with metal squeals |
| foe_cart_blast | 自爆（接觸或被打爆） | C-DIE＋`explodeAt` | ME:4005、game/game.js:353 | 3.0 | 2 | Massive dynamite cart explosion in a mine, deep blast and rock debris |

### crystal（結晶寄生無人機，礦坑）— ai drone，HG-22，explodeOnDeath（碎裂四射）
| 鍵 | 事件 | 目前的聲音 | 觸發處 | 長度 | 變化 | 提示詞 |
|---|---|---|---|---|---|---|
| foe_crystal_hover | 飛行循環 | C-THR | game/feedback.js:243 | 3.0 循環 | 1 | Crystal-infested drone humming, faint glassy resonance |
| foe_crystal_fire | 手槍 | W-BUL（w_hg） | ME:883 | 0.3 | 2 | Small drone gun shot with crystalline ping |
| foe_crystal_shatter | 擊破時碎裂四射 | C-DIE＋`explodeAt` | ME:2718-2723 | 1.5 | 2 | Crystal drone shattering, glass explosion with ringing shards |

## 3. 專屬敵人擴充 B1（第 1 章：荒野、沙丘、礦坑；data/foes-b1.js，行為 entities/mech-foe-b1.js）

### harpoon（魚叉拖車，荒野）— ai harpoon，MG-18；鉤住＝狀態效果 hook
| 鍵 | 事件 | 目前的聲音 | 觸發處 | 長度 | 變化 | 提示詞 |
|---|---|---|---|---|---|---|
| foe_harpoon_move | 拖車移動循環 | **沒有聲音** | — | 3.0 循環 | 1 | Armored tow truck engine grumbling, chains rattling in the bed |
| foe_harpoon_warn | 鉤頭發紅光＋瞄準線（預警） | `SFX.play('charge', 0.7, 1.4)` | entities/mech-foe-b1.js:164 | 0.8 | 1 | Harpoon gun winding tension, ratcheting click and hum |
| foe_harpoon_fire | 射出魚叉（鉤頭可以被擊落） | `SFX.shot('missile')` | entities/mech-foe-b1.js:200 | 0.8 | 2 | Heavy harpoon launched by compressed air, sharp thunk and cable whizzing out |
| foe_harpoon_cable | 鉤頭飛行中拉出纜索 | **沒有聲音** | entities/mech-foe-b1.js:202-217 | 1.0 循環 | 1 | Steel cable spooling out at high speed, whirring reel |
| foe_harpoon_hook | 鉤住目標（hook） | 狀態效果 hook 的聲音（見第 10 節 st_hook_on） | entities/mech-foe-b1.js:210 | 0.8 | 2 | Harpoon barb clamping onto armor, heavy metallic bite |
| foe_harpoon_reel | 撐地捲回（拖著目標） | **沒有聲音** | entities/mech-foe-b1.js:218-232 | 3.0 循環 | 1 | Powerful winch reeling in, cable straining and groaning under load |
| foe_harpoon_cut | 纜索被打斷（CABLE CUT） | `SFX.play('clatter1', 0.9, 1)` | entities/mech-foe-b1.js:229 | 0.8 | 2 | Tensioned steel cable snapping, whiplash twang and clatter |
| foe_harpoon_mg | 機槍 | W-BUL（w_mg） | ME:883 | 0.3 | 2 | Truck-mounted machine gun burst |
| foe_harpoon_die | 擊破 | C-DIE | ME:2722 | 2.0 | 2 | Tow truck exploding, cable whipping loose |

### smoker（煙幕投射車，荒野）— ai smoker，MG-18
| 鍵 | 事件 | 目前的聲音 | 觸發處 | 長度 | 變化 | 提示詞 |
|---|---|---|---|---|---|---|
| foe_smoker_move | 移動循環 | **沒有聲音** | — | 3.0 循環 | 1 | Light utility truck engine, bouncing suspension |
| foe_smoker_warn | 抬起發射架並發光（1 秒） | `SFX.play('door', 0.6, 1.3)` | entities/mech-foe-b1.js:282 | 1.0 | 1 | Launcher rack hydraulically raising, clunk and lock |
| foe_smoker_fire | 拋射煙幕彈 | `SFX.shot('grenade')` | entities/mech-foe-b1.js:314 | 0.8 | 2 | Smoke canister mortar pop, hollow thump |
| foe_smoker_cloud | 煙幕彈落地展開（10 秒） | **沒有聲音**（`fx.dust`＋`addZone('smoke')`） | entities/mech-foe-b1.js:318-322 | 2.0 | 2 | Smoke grenade bursting open, loud hissing gas billowing out |
| foe_smoker_mg | 機槍 | W-BUL（w_mg） | ME:883 | 0.3 | 2 | Light machine gun burst |
| foe_smoker_die | 擊破 | C-DIE | ME:2722 | 2.0 | 2 | Smoke truck exploding, smoke canisters popping |

### ridgesniper（沙脊狙擊機，沙丘）— ai ridgesniper（找稜線趴下）
| 鍵 | 事件 | 目前的聲音 | 觸發處 | 長度 | 變化 | 提示詞 |
|---|---|---|---|---|---|---|
| foe_ridgesniper_step | 移動腳步 | C-STEP（l_bp2） | game/feedback.js:304 | 0.4 | 2 | Light four-legged sniper walker steps on sand |
| foe_ridgesniper_prone | 趴下架槍／起身換稜線 | **沒有聲音** | entities/mech-foe-b1.js:340-352 | 1.0 | 1 | A heavy robot lowering itself to the ground, servo motor whine descending, then a solid metal clank |
| foe_ridgesniper_aim | 開始瞄準（藍色瞄準線 1.5 秒） | `SFX.play('charge', 0.8, 0.8)` | entities/mech-foe-b1.js:396 | 1.5 | 1 | Long-range energy rifle charging, rising high-pitched hum with scope beep |
| foe_ridgesniper_fire | 一發高傷害能量彈 | `SFX.play('laserBig', 1, 0.85)` | entities/mech-foe-b1.js:471 | 1.2 | 2 | Powerful sniper energy shot, cracking beam with long echoing tail |
| foe_ridgesniper_die | 擊破 | C-DIE | ME:2722 | 2.0 | 1 | Sniper walker destroyed, rifle capacitor bursting |

### twister（旋風產生機，沙丘）— ai twister；旋風＝addZone('suction')
| 鍵 | 事件 | 目前的聲音 | 觸發處 | 長度 | 變化 | 提示詞 |
|---|---|---|---|---|---|---|
| foe_twister_warn | 預警 1.2 秒（葉片打開、噴出環發光） | `SFX.play('engineHi', 0.7, 0.8)` | entities/mech-foe-b1.js:531 | 1.2 | 1 | Giant turbine blades spinning up, rising whoosh and roar |
| foe_twister_spawn | 放出旋風 | `SFX.play('thrBurst', 1, 0.7)` | entities/mech-foe-b1.js:525 | 1.0 | 2 | Sand vortex bursting into existence, violent gust |
| foe_twister_vortex | 追蹤的旋風 8 秒（捲進去受傷、被帶著走） | **沒有聲音** | entities/mech-foe-b1.js:495-512 | 4.0 循環 | 1 | Swirling sand tornado, howling wind with grinding grit |
| foe_twister_end | 旋風消散 | **沒有聲音** | entities/mech-foe-b1.js:537-545 | 1.5 | 1 | Dust devil dissipating, wind dying down |
| foe_twister_die | 擊破 | C-DIE | ME:2722 | 2.0 | 1 | Wind generator exploding, blades shearing off |

### blaster（坍方爆破手，礦坑）— ai blaster，HG-22；炸岩頂落石、留下岩塊
| 鍵 | 事件 | 目前的聲音 | 觸發處 | 長度 | 變化 | 提示詞 |
|---|---|---|---|---|---|---|
| foe_blaster_step | 腳步 | C-STEP（l_bp2） | game/feedback.js:304 | 0.4 | 2 | Demolition walker footstep, rattling explosive packs |
| foe_blaster_shoot | 射出炸藥到岩頂（裂紋圈） | `SFX.play('pistol', 0.7, 0.7)` | entities/mech-foe-b1.js:579 | 0.6 | 2 | Charge launcher firing an explosive into rock, thunk and clank |
| foe_blaster_beep | 炸藥閃燈倒數（越來越快） | `SFX.play('ui2', 0.5, 1.6)` | entities/mech-foe-b1.js:559 | 0.15 | 1 | Demolition charge timer beep, sharp electronic tick |
| foe_blaster_collapse | 引爆、落石 | `SFX.explode(true)` | entities/mech-foe-b1.js:595 | 3.0 | 2 | Ceiling blasted, rocks collapsing and crashing down, cave-in rumble |
| foe_blaster_rock | 落石留下岩塊（臨時障礙物） | `SFX.wreck`（tempWallBuild） | game/hazards2.js:415 | 1.0 | 1 | Boulders settling into a pile, heavy stone thuds |
| foe_blaster_hg | 手槍 | W-BUL（w_hg） | ME:883 | 0.3 | 2 | Sidearm shot |
| foe_blaster_die | 擊破 | C-DIE | ME:2722 | 2.0 | 2 | Demolition walker exploding with extra charges going off |

### lamp（礦燈哨兵，礦坑）— ai lamp，MG-18；照到的套 spotted；燈頭是弱點
| 鍵 | 事件 | 目前的聲音 | 觸發處 | 長度 | 變化 | 提示詞 |
|---|---|---|---|---|---|---|
| foe_lamp_sweep | 探照燈來回掃描的循環 | **沒有聲音** | entities/mech-foe-b1.js:643-660 | 3.0 循環 | 1 | Motorized searchlight panning, electric buzz of a high-power lamp |
| foe_lamp_spot | 照到目標（警報） | `SFX.play('alarm', 0.5, 1.3)` | entities/mech-foe-b1.js:672 | 1.0 | 1 | Searchlight sentry alarm, intruder detected chime |
| foe_lamp_break | 燈頭被打壞熄燈（8 秒） | `SFX.play('glass', 1, 1)` | entities/mech-foe-b1.js:714 | 0.8 | 2 | Large lamp glass shattering, bulb popping and fizzling out |
| foe_lamp_relight | 8 秒後燈重新亮起 | **沒有聲音** | entities/mech-foe-b1.js:617-640 | 0.8 | 1 | Lamp flickering back on, electrical buzz rising |
| foe_lamp_mg | 機槍 | W-BUL（w_mg） | ME:883 | 0.3 | 2 | Sentry machine gun burst |
| foe_lamp_die | 擊破 | C-DIE | ME:2722 | 2.0 | 1 | Sentry machine exploding, lamp shattering |

## 4. 專屬敵人擴充 B2（第 2 章：集散場、水壩、淹沒城區；data/foes-b2.js，行為 entities/mech-foe-b2.js）

### riveter（鉚釘槍步行機，集散場）— ai riveter；鉚釘命中＝狀態效果 stick
| 鍵 | 事件 | 目前的聲音 | 觸發處 | 長度 | 變化 | 提示詞 |
|---|---|---|---|---|---|---|
| foe_riveter_move | 移動循環 | **沒有聲音** | — | 2.0 循環 | 1 | Industrial riveting mech chugging along, pneumatic hiss |
| foe_riveter_warn | 槍口橘光＋瞄準線（0.7 秒） | `SFX.play('charge', 0.6, 1.4)` | entities/mech-foe-b2.js:113 | 0.7 | 1 | Pneumatic rivet gun pressurizing, rising hiss |
| foe_riveter_fire | 射出黏性鉚釘 | `SFX.play('pistol', 0.8, 0.7)` | entities/mech-foe-b2.js:163 | 0.5 | 3 | Heavy pneumatic rivet gun firing, sharp air-powered bang |
| foe_riveter_stick | 鉚釘黏上機體（3 秒後爆） | 狀態效果 stick（第 10 節） | entities/mech-foe-b2.js:156 | 0.5 | 2 | Explosive rivet punching into armor, metallic clank and arming beep |
| foe_riveter_die | 擊破 | C-DIE | ME:2722 | 2.0 | 2 | Riveting mech exploding, air tanks bursting |

### welder（電焊步行機，集散場）— ai welder；電弧＝狀態效果 drain＋能量傷害
| 鍵 | 事件 | 目前的聲音 | 觸發處 | 長度 | 變化 | 提示詞 |
|---|---|---|---|---|---|---|
| foe_welder_move | 移動循環 | **沒有聲音** | — | 2.0 循環 | 1 | Heavy machine walking with mechanical clanks, steady electrical transformer hum and buzzing current |
| foe_welder_warn | 焊槍藍光預警（面罩拉下） | `SFX.play('charge', 0.6, 1.8)` | entities/mech-foe-b2.js:181 | 0.8 | 1 | Arc welder powering up, transformer buzz and mask visor clank |
| foe_welder_arc_start | 電弧連到目標 | `SFX.play('laser2', 0.7, 0.8)` | entities/mech-foe-b2.js:194 | 0.5 | 2 | Electric arc snapping onto metal, loud crackling zap |
| foe_welder_arc_loop | 電弧持續 3 秒（吸取 EN） | **沒有聲音** | entities/mech-foe-b2.js:200-226 | 3.0 循環 | 1 | Continuous welding arc buzzing and sizzling, crackling electricity |
| foe_welder_arc_break | 拉開 12 m 電弧斷開 | **沒有聲音**（`fx.spark`） | entities/mech-foe-b2.js:203 | 0.4 | 2 | Electric arc snapping off with a pop |
| foe_welder_die | 擊破 | C-DIE | ME:2722 | 2.0 | 2 | Welding mech short-circuiting and exploding |

### watercannon（高壓水砲車，水壩）— ai watercannon
| 鍵 | 事件 | 目前的聲音 | 觸發處 | 長度 | 變化 | 提示詞 |
|---|---|---|---|---|---|---|
| foe_watercannon_move | 移動循環 | **沒有聲音** | — | 3.0 循環 | 1 | Water cannon truck engine and sloshing tank |
| foe_watercannon_charge | 蓄水 1.2 秒（砲口白霧） | `SFX.play('splash', 0.7, 0.6)` | entities/mech-foe-b2.js:250 | 1.2 | 1 | High-pressure pump building up, water hammer and hiss |
| foe_watercannon_blast | 水柱（衝擊極高） | `SFX.play('splash', 1, 1.1)` | entities/mech-foe-b2.js:322 | 1.5 | 2 | Riot water cannon blast, powerful roaring jet of water |
| foe_watercannon_hit | 水柱打中機體 | **沒有聲音** | entities/mech-foe-b2.js:277-320 | 0.8 | 2 | High-pressure water slamming against armor, heavy splash impact |
| foe_watercannon_die | 擊破 | C-DIE | ME:2722 | 2.0 | 1 | Water truck exploding, tank bursting in a gush |

### turbine（渦輪吸入機，水壩）— ai turbine，MG-18；吸入＝addZone('suction')
| 鍵 | 事件 | 目前的聲音 | 觸發處 | 長度 | 變化 | 提示詞 |
|---|---|---|---|---|---|---|
| foe_turbine_idle | 待機的渦輪 | **沒有聲音** | — | 3.0 循環 | 1 | Hydro turbine idling, low resonant hum and water flow |
| foe_turbine_warn | 預警 1.5 秒（虹彩蓋半開） | `SFX.play('engineHi', 0.8, 0.7)` | entities/mech-foe-b2.js:358 | 1.5 | 1 | Turbine iris opening, blades spinning up with rising whine |
| foe_turbine_suck | 吸入開始 | `SFX.play('engineHi', 1, 1.1)` | entities/mech-foe-b2.js:372 | 1.0 | 1 | Massive intake roaring to life, violent suction |
| foe_turbine_suck_loop | 吸入 6 秒（漩渦、葉片近身傷害） | **沒有聲音** | entities/mech-foe-b2.js:375-400 | 4.0 循環 | 1 | A powerful whirlpool of rushing water, roaring swirling flow being sucked into a giant spinning turbine |
| foe_turbine_mg | 哨戒機槍 | W-BUL（w_mg） | ME:883 | 0.3 | 2 | Sentry machine gun burst |
| foe_turbine_die | 擊破 | C-DIE | ME:2722 | 2.5 | 1 | Turbine shattering, blades flying off, steam explosion |

### eel（電鰻無人機，淹沒城區）— ai eel；放電＝addZone('electro')
| 鍵 | 事件 | 目前的聲音 | 觸發處 | 長度 | 變化 | 提示詞 |
|---|---|---|---|---|---|---|
| foe_eel_swim | 貼水面游的循環 | C-THR（飛行） | game/feedback.js:243 | 3.0 循環 | 1 | Eel drone skimming water, electric motor hum and wake splash |
| foe_eel_charge | 充電 1.5 秒（水面的電流紋） | `SFX.play('charge', 0.8, 1.2)` | entities/mech-foe-b2.js:454 | 1.5 | 1 | Electric eel drone charging, crackling build-up with water fizz |
| foe_eel_discharge | 放電開始 | `SFX.play('laser2', 1, 0.6)` | entities/mech-foe-b2.js:469 | 0.8 | 2 | Massive electrical discharge into water, loud crack and sizzle |
| foe_eel_field | 電流區 4 秒 | **沒有聲音** | game/hazards2.js:293 | 4.0 循環 | 1 | Electrified water buzzing and popping |
| foe_eel_die | 擊落 | C-DIE | ME:2722 | 1.5 | 1 | Eel drone shorting out and exploding with a splash |

### buoy（漂流水雷浮標，淹沒城區）— ai buoy，explodeOnDeath（敵我都炸）
| 鍵 | 事件 | 目前的聲音 | 觸發處 | 長度 | 變化 | 提示詞 |
|---|---|---|---|---|---|---|
| foe_buoy_drift | 漂流與閃燈（靠近時變快） | **沒有聲音** | entities/mech-foe-b2.js:482-499 | 3.0 循環 | 1 | Gentle water waves lapping against a floating metal buoy, with slow repeating electronic warning beeps |
| foe_buoy_fuse | 引信（0.4 秒後爆炸） | `SFX.play('bell', 0.9, 1.6)` | entities/mech-foe-b2.js:496 | 0.4 | 1 | Naval mine proximity fuse triggering, rapid alarm chirp |
| foe_buoy_blast | 爆炸 | C-DIE＋`explodeAt` | ME:2718-2723 | 2.5 | 2 | Naval mine detonating, huge water explosion geyser |

## 5. 專屬敵人擴充 C1（冰原、研究特區、Lattice-9；data/foes-c1.js，行為 entities/mech-foe-c1.js）

### cryo（冷凍噴霧機，冰原）— ai cryo；噴霧命中＝狀態效果 slow
| 鍵 | 事件 | 目前的聲音 | 觸發處 | 長度 | 變化 | 提示詞 |
|---|---|---|---|---|---|---|
| foe_cryo_move | 移動循環 | **沒有聲音** | — | 3.0 循環 | 1 | Cryogenic unit trundling, compressor humming and frost crackle |
| foe_cryo_warn | 噴嘴結霜白光（0.8 秒） | `SFX.play('charge', 0.7, 1.5)` | entities/mech-foe-c1.js:123 | 0.8 | 1 | Cryo nozzle frosting over, freezing crackle and rising pressure hiss |
| foe_cryo_spray | 冷凍霧噴出（開始） | `SFX.play('thrBurst', 0.9, 0.7)` | entities/mech-foe-c1.js:133 | 0.6 | 2 | Blast of liquid nitrogen spray, sharp freezing hiss |
| foe_cryo_spray_loop | 噴霧持續 1.4 秒 | **沒有聲音** | entities/mech-foe-c1.js:134-150 | 1.4 循環 | 1 | Continuous freezing mist jet, icy roaring hiss with crystals forming |
| foe_cryo_die | 擊破 | C-DIE | ME:2722 | 2.0 | 1 | Cryo tank rupturing, explosive frosty vapor burst |

### icemortar（冰錐迫擊砲，冰原）— ai icemortar，MG-18；落點長出冰牆
| 鍵 | 事件 | 目前的聲音 | 觸發處 | 長度 | 變化 | 提示詞 |
|---|---|---|---|---|---|---|
| foe_icemortar_warn | 架砲預警（0.6 秒） | `SFX.play('charge', 0.6, 0.8)` | entities/mech-foe-c1.js:193 | 0.6 | 1 | A heavy metal tube slowly tilting upward, creaking frozen hinges and grinding gears, cracking ice |
| foe_icemortar_fire | 拋射冰錐 | `SFX.shot('grenade')` | entities/mech-foe-c1.js:239 | 0.8 | 2 | Ice spike mortar launch, hollow thump with crystalline ring |
| foe_icemortar_land | 冰錐落地 | `SFX.play('glass', 0.9, 0.8)`＋W-PJ | entities/mech-foe-c1.js:251 | 1.2 | 2 | Giant ice spike shattering on impact, glassy crash and crunch |
| foe_icemortar_wall | 長出冰牆 | `SFX.play('shield', 0.6, 1.6)`（tempWallBuild 的冰） | game/hazards2.js:414 | 1.2 | 2 | Ice wall rapidly forming, cracking and crystallizing groan |
| foe_icemortar_wall_break | 冰牆被打碎 | `SFX.explode(false)` | game/hazards2.js:582 | 1.0 | 2 | Ice wall shattering into chunks, crisp glassy explosion |
| foe_icemortar_mg | 機槍 | W-BUL（w_mg） | ME:883 | 0.3 | 2 | Machine gun burst |
| foe_icemortar_die | 擊破 | C-DIE | ME:2722 | 2.0 | 1 | Ice mortar destroyed, frost shards scattering |

### holo（全像投影器，研究特區）— ai holoproj；投出最多 3 台假敵人 holofake
| 鍵 | 事件 | 目前的聲音 | 觸發處 | 長度 | 變化 | 提示詞 |
|---|---|---|---|---|---|---|
| foe_holo_hum | 投影器的循環 | **沒有聲音** | — | 3.0 循環 | 1 | Hologram projector humming, soft digital whir |
| foe_holo_warn | 投影頭張開預警（0.7 秒） | `SFX.play('glitch', 0.8, 0.8)` | entities/mech-foe-c1.js:278 | 0.7 | 1 | Hologram emitter powering up, digital glitch and rising tone |
| foe_holo_project | 投出假敵人 | **沒有聲音**（C-ALERT） | entities/mech-foe-c1.js:299-344 | 1.0 | 2 | Holograms materializing, shimmering digital crackle |
| foe_holo_fake_fire | 假敵人開槍（沒有傷害） | `SFX.play('mg', 0.35, 1.3)` | entities/mech-foe-c1.js:364 | 0.3 | 2 | Thin hollow imitation gunfire with digital artifacting |
| foe_holo_fake_vanish | 假敵人被打一下就消失 | `SFX.play('glitch', 0.7, 1.4)` | entities/mech-foe-c1.js:374 | 0.5 | 3 | Hologram dissolving, digital glitch burst and static fade |
| foe_holo_die | 擊破（假敵人全部消失） | C-DIE | ME:2722 | 2.0 | 1 | Projector exploding, all holograms collapsing in a static burst |

### parasite（寄生纏附體，研究特區）— ai parasite；纏附＝狀態效果 latch
| 鍵 | 事件 | 目前的聲音 | 觸發處 | 長度 | 變化 | 提示詞 |
|---|---|---|---|---|---|---|
| foe_parasite_move | 爬行接近 | **沒有聲音**（履帶腳） | — | 3.0 循環 | 1 | Parasitic bio-machine skittering, wet clicking limbs |
| foe_parasite_crouch | 蹲伏 0.7 秒（紅線預警） | `SFX.play('charge', 0.5, 2.2)` | entities/mech-foe-c1.js:405 | 0.7 | 1 | Creature coiling to pounce, hissing and tensing tendons |
| foe_parasite_pounce | 撲擊 | `SFX.play('punch1', 0.6, 1.6)` | entities/mech-foe-c1.js:418 | 0.6 | 2 | Parasite leaping through the air, wet shriek and whoosh |
| foe_parasite_latch | 纏上機體 | `SFX.play('crunch1', 0.9, 1.2)`＋狀態效果 latch | entities/mech-foe-c1.js:479 | 0.8 | 2 | Tendrils wrapping and clamping onto armor, squelching crunch |
| foe_parasite_miss | 撲空落地（破綻） | **沒有聲音**（`fx.dust`） | entities/mech-foe-c1.js:429-437 | 0.6 | 1 | A small creature landing hard on the ground with a soft thud, followed by a short shrill alien screech |
| foe_parasite_shaken | 被甩掉、彈開硬直 | `SFX.play('thud1', 0.8, 1.3)` | entities/mech-foe-c1.js:497 | 0.8 | 2 | Parasite flung off and slamming into the ground, wet thud |
| foe_parasite_die | 擊破 | C-DIE | ME:2722 | 1.5 | 2 | Parasite bursting, organic splatter and death squeal |

### anchor（重力錨，Lattice-9）— ai anchor，MG-18；重力圈＝addZone('gravity')（套 nojump）
| 鍵 | 事件 | 目前的聲音 | 觸發處 | 長度 | 變化 | 提示詞 |
|---|---|---|---|---|---|---|
| foe_anchor_warn | 錨樁預警（紫圈 1.2 秒） | `SFX.play('charge', 0.8, 0.6)` | entities/mech-foe-c1.js:526 | 1.2 | 1 | Gravity anchor charging, deep warbling bass hum rising |
| foe_anchor_impact | 錨樁打進地面 | `SFX.play('heavy', 1, 0.7)` | entities/mech-foe-c1.js:535 | 1.0 | 2 | Heavy gravity spike slamming into the deck, deep impact boom |
| foe_anchor_field | 重力圈 8 秒 | **沒有聲音** | game/hazards2.js:286-292 | 4.0 循環 | 1 | Distorted gravity field throbbing, low oppressive drone |
| foe_anchor_mg | 機槍 | W-BUL（w_mg） | ME:883 | 0.3 | 2 | Machine gun burst |
| foe_anchor_die | 擊破 | C-DIE | ME:2722 | 2.0 | 1 | Gravity anchor imploding then exploding, warped bass whump |

### zipline（滑索突擊兵，Lattice-9）— ai zipline，SG-33
| 鍵 | 事件 | 目前的聲音 | 觸發處 | 長度 | 變化 | 提示詞 |
|---|---|---|---|---|---|---|
| foe_zipline_step | 腳步 | C-STEP（l_bp2） | game/feedback.js:304 | 0.4 | 2 | Light assault trooper mech step |
| foe_zipline_cable | 射出纜索（鉤爪閃光，預警 0.9 秒） | `SFX.play('clatter1', 0.9, 1.6)` | entities/mech-foe-c1.js:664 | 0.8 | 2 | Grappling hook fired, cable zinging out and claw biting steel |
| foe_zipline_zip | 開始滑行 | `SFX.play('boostUp', 0.8, 1.5)` | entities/mech-foe-c1.js:581 | 0.6 | 1 | A metal pulley racing along a steel cable, sharp rising zipping whir of a zipline |
| foe_zipline_slide | 沿纜索滑行（火花） | **沒有聲音** | entities/mech-foe-c1.js:583-610 | 2.0 循環 | 1 | Trolley screaming down a steel cable, grinding sparks |
| foe_zipline_land | 落地（0.8 秒破綻） | `SFX.play('thud2', 1, 1)` | entities/mech-foe-c1.js:600 | 0.8 | 2 | A giant robot dropping onto a steel deck, single loud heavy metal thud with a ringing clang |
| foe_zipline_fire | 近距離霰彈 | W-SG（w_sg） | ME:903 | 0.8 | 2 | Close-range shotgun blast |
| foe_zipline_die | 擊破 | C-DIE | ME:2722 | 2.0 | 1 | Assault trooper mech exploding |

## 6. 專屬敵人擴充 C2（宇宙港、洋上都市、高空軌道；data/foes-c2.js，行為 entities/mech-foe-c2.js）

### fueler（燃料洩漏車，宇宙港）— ai fueler，MG-18，explodeOnDeath＋原地大範圍燃燒
| 鍵 | 事件 | 目前的聲音 | 觸發處 | 長度 | 變化 | 提示詞 |
|---|---|---|---|---|---|---|
| foe_fueler_move | 移動循環 | **沒有聲音** | — | 3.0 循環 | 1 | Fuel tanker truck engine, liquid sloshing in tanks |
| foe_fueler_spill | 灑燃料（油漬） | `SFX.play('door', 0.6, 1.4)` | entities/mech-foe-c2.js:164 | 1.5 | 2 | Fuel valve opening, liquid gushing and splattering on the ground |
| foe_fueler_ignite | 油漬點火成燃燒地面 | `SFX.explode(false)` | game/hazards2.js:221 | 1.5 | 2 | Spilled fuel igniting, whoosh of flames spreading |
| foe_fueler_burn | 燃燒地面（`addPool`） | **沒有聲音** | game/bosses2.js（addPool） | 4.0 循環 | 1 | Burning fuel pool, crackling roaring flames |
| foe_fueler_mg | 機槍 | W-BUL（w_mg） | ME:883 | 0.3 | 2 | Truck-mounted machine gun burst |
| foe_fueler_die | 擊破（大爆炸＋大範圍燃燒） | C-DIE＋`explodeAt`；燃燒沒有聲音 | ME:2718-2723、entities/mech-foe-c2.js:582 | 3.0 | 2 | Fuel tanker detonating in a massive fireball, roaring flames |

### missilerack（誘導飛彈架，宇宙港）— ai missilerack；大型追蹤飛彈可以擊落（shootable）
| 鍵 | 事件 | 目前的聲音 | 觸發處 | 長度 | 變化 | 提示詞 |
|---|---|---|---|---|---|---|
| foe_missilerack_warn | 預警線 | `SFX.play('ui2', 0.8, 0.7)` | entities/mech-foe-c2.js:188 | 1.0 | 1 | Missile rack lock-on klaxon, launch tube doors opening |
| foe_missilerack_launch | 發射大型追蹤飛彈 | `SFX.shot('missile')` | entities/mech-foe-c2.js:258 | 1.5 | 2 | Large guided missile launching, heavy rocket ignition roar |
| foe_missilerack_flight | 飛彈飛行（慢速追蹤） | **沒有聲音** | entities/projectile.js（missile） | 3.0 循環 | 1 | Slow heavy missile rocket motor roaring past, doppler |
| foe_missilerack_downed | 飛彈被擊落 | `SFX.explode(false)` | game/hazards2.js:681 | 1.5 | 2 | Missile shot down midair, explosive burst |
| foe_missilerack_hit | 飛彈命中爆炸 | W-PJ | entities/projectile.js:303 | 2.0 | 2 | Heavy missile impact explosion |
| foe_missilerack_die | 擊破 | C-DIE | ME:2722 | 2.0 | 1 | Missile rack exploding, remaining rockets popping |

### netter（拋網無人機，洋上都市）— ai netter，飛行；網＝狀態效果 net
| 鍵 | 事件 | 目前的聲音 | 觸發處 | 長度 | 變化 | 提示詞 |
|---|---|---|---|---|---|---|
| foe_netter_fly | 飛行循環 | C-THR | game/feedback.js:243 | 3.0 循環 | 1 | Net-launcher drone hovering, buzzing rotors |
| foe_netter_warn | 預警線 0.8 秒 | `SFX.play('ui2', 0.6, 1.3)` | entities/mech-foe-c2.js:281 | 0.8 | 1 | A pneumatic launcher priming, hiss of compressed air building up and a sharp mechanical click |
| foe_netter_fire | 射出捕獲網 | `SFX.shot('grenade')` | entities/mech-foe-c2.js:342 | 0.8 | 2 | Capture net launched, pneumatic whump and unfurling mesh |
| foe_netter_hit | 網套住目標 | 狀態效果 net（第 10 節） | entities/mech-foe-c2.js:312 | 0.8 | 2 | Steel net wrapping around a mech, clanking weights and mesh snapping tight |
| foe_netter_die | 擊落 | C-DIE | ME:2722 | 1.5 | 1 | Drone shot down, crash and splash |

### boomer（迴旋刃無人機，洋上都市）— ai boomer，飛行
| 鍵 | 事件 | 目前的聲音 | 觸發處 | 長度 | 變化 | 提示詞 |
|---|---|---|---|---|---|---|
| foe_boomer_fly | 飛行循環 | C-THR | game/feedback.js:243 | 3.0 循環 | 1 | Blade drone hovering, whirring rotors |
| foe_boomer_warn | 預警 | `SFX.play('ui2', 0.7, 1.6)` | entities/mech-foe-c2.js:365 | 0.6 | 1 | Spinning blade spooling up, rising metallic whine |
| foe_boomer_throw | 擲出迴旋刃 | `SFX.meleeSwing('blade', 's')` | entities/mech-foe-c2.js:381 | 0.6 | 2 | Saw blade disc launched, sharp spinning whoosh |
| foe_boomer_spin | 刃在飛（去程、回程） | **沒有聲音** | entities/mech-foe-c2.js:395-438 | 2.0 循環 | 1 | Spinning buzzsaw blade flying through the air, whirring doppler |
| foe_boomer_hit | 刃打中機體 | **沒有聲音**（只有 takeDamage） | entities/mech-foe-c2.js:412-425 | 0.5 | 3 | Spinning blade slicing across armor, screeching metal cut |
| foe_boomer_catch | 刃飛回來接住 | **沒有聲音** | entities/mech-foe-c2.js:426-438 | 0.4 | 1 | Blade snapping back into a drone's clamp, metallic clack |
| foe_boomer_die | 擊落 | C-DIE | ME:2722 | 1.5 | 1 | Blade drone destroyed, blade clattering |

### mirror（反射鏡衛星，高空軌道）— ai mirror，飛行，雷射只有 30%
| 鍵 | 事件 | 目前的聲音 | 觸發處 | 長度 | 變化 | 提示詞 |
|---|---|---|---|---|---|---|
| foe_mirror_hover | 衛星飛行循環 | C-THR | game/feedback.js:243 | 3.0 循環 | 1 | Mirror satellite gliding, soft crystalline hum |
| foe_mirror_charge | 聚光蓄力 | `SFX.play('charge', 0.6, 1.4)` | entities/mech-foe-c2.js:460 | 1.5 | 1 | Solar mirror focusing light, shimmering rising tone |
| foe_mirror_fire | 射出聚光光束（beamAttack） | **沒有聲音**（`beamAttack` 不播聲音） | entities/mech-foe-c2.js:474-482 | 1.0 | 2 | Concentrated solar beam firing, bright searing zap |
| foe_mirror_deflect | 雷射打它只剩 30%（反射） | **沒有聲音**（只有 C-HIT） | （laserK，`spawnType`） | 0.4 | 2 | A laser beam glancing off a mirror, short high glassy ping with a bright electric zing |
| foe_mirror_die | 擊落 | C-DIE | ME:2722 | 1.5 | 1 | Mirror satellite shattering, glass and metal fragments |

### focus（聚光鏡陣列，高空軌道）— ai focus；追蹤光束＝addZone('beam')
| 鍵 | 事件 | 目前的聲音 | 觸發處 | 長度 | 變化 | 提示詞 |
|---|---|---|---|---|---|---|
| foe_focus_warn | 預警（俯仰架對準目標） | `SFX.play('charge', 0.8, 0.8)` | entities/mech-foe-c2.js:515 | 1.2 | 1 | Array of mirrors aligning, mechanical clicks and rising energy hum |
| foe_focus_fire | 照射開始 | `SFX.play('laserBig', 0.7, 0.9)` | entities/mech-foe-c2.js:538 | 0.8 | 1 | A powerful sci-fi laser beam firing, sharp searing electric blast with a sustained burning hum |
| foe_focus_beam | 追蹤光束（照越久越痛） | **沒有聲音** | game/hazards2.js:323-345 | 4.0 循環 | 1 | Sustained concentrated light beam, intensifying buzzing sizzle |
| foe_focus_break | 視線被擋住斷開 | **沒有聲音** | entities/mech-foe-c2.js:545-570 | 0.5 | 1 | Beam cutting off abruptly, power-down zap |
| foe_focus_die | 擊破 | C-DIE | ME:2722 | 2.0 | 1 | Mirror array exploding, shattering panels |

## 7. 專屬敵人擴充 E1（火山熔爐帶；data/foes-e1.js，行為 entities/mech-foe-e1.js）

### slagger（熔渣投擲機）— ai slagger；落點爆炸＋燃燒地面
| 鍵 | 事件 | 目前的聲音 | 觸發處 | 長度 | 變化 | 提示詞 |
|---|---|---|---|---|---|---|
| foe_slagger_move | 移動循環（轉身慢） | **沒有聲音** | — | 3.0 循環 | 1 | A heavy industrial machine grinding and clanking, with the deep roar of a furnace burning inside |
| foe_slagger_warn | 預警圈 1.2 秒（投擲） | `SFX.play('ui2', 0.6, 0.8)` | entities/mech-foe-e1.js:91 | 1.2 | 1 | Molten lava bubbling and hissing in a large metal bucket, heavy metal creaking as it swings back |
| foe_slagger_lob | 熔渣在空中（目前沒有投射物，時間到直接落地） | **沒有聲音** | entities/mech-foe-e1.js:93-99 | 1.0 | 1 | Glob of molten slag whooshing through the air, crackling heat |
| foe_slagger_impact | 熔渣落地爆炸 | `SFX.explode(false)` | entities/mech-foe-e1.js:111 | 1.5 | 2 | Molten slag splashing and exploding on impact, sizzling lava splatter |
| foe_slagger_pool | 燃燒地面 | **沒有聲音**（`addPool`） | entities/mech-foe-e1.js:113 | 4.0 循環 | 1 | Pool of molten slag bubbling and hissing |
| foe_slagger_die | 擊破 | C-DIE | ME:2722 | 2.0 | 1 | Slag machine bursting, molten metal spilling out |

### heatguard（耐熱重裝步行機）— ai heatguard，MG-18，火焰噴射器
| 鍵 | 事件 | 目前的聲音 | 觸發處 | 長度 | 變化 | 提示詞 |
|---|---|---|---|---|---|---|
| foe_heatguard_step | 腳步（踩熔岩不受傷） | C-STEP（二足 l_bp） | game/feedback.js:304 | 0.6 | 3 | Heat-armored walker stomping, heavy plating with sizzling contact |
| foe_heatguard_ignite | 火焰噴射開始 | `SFX.play('ab', 0.8, 0.8)` | entities/mech-foe-e1.js:131 | 0.6 | 1 | A flamethrower igniting, sudden loud whoomp of fire bursting into a roaring flame |
| foe_heatguard_flame | 火焰噴射 2 秒 | **沒有聲音**（`fx.flameCone`） | entities/mech-foe-e1.js:133-150 | 2.0 循環 | 1 | Roaring flamethrower stream, intense rushing fire |
| foe_heatguard_overheat | 過熱（受傷 ×1.5） | **沒有聲音** | entities/mech-foe-e1.js:151-157 | 1.5 | 1 | Overheated armor venting steam, metal ticking and hissing |
| foe_heatguard_mg | 機槍 | W-BUL（w_mg） | ME:883 | 0.3 | 2 | Heavy walker machine gun burst |
| foe_heatguard_die | 擊破 | C-DIE | ME:2722 | 2.5 | 1 | Heat-armored mech exploding, fuel tanks igniting |

### magmadrone（熔岩潛行無人機）— ai magmadrone，MG-18；潛在地下
| 鍵 | 事件 | 目前的聲音 | 觸發處 | 長度 | 變化 | 提示詞 |
|---|---|---|---|---|---|---|
| foe_magmadrone_under | 地下潛行 | **沒有聲音** | entities/mech-foe-e1.js:171-182 | 3.0 循環 | 1 | Drone tunneling through magma, deep bubbling rumble |
| foe_magmadrone_warn | 地面冒火光（預警圈） | **沒有聲音** | entities/mech-foe-e1.js:177-180 | 1.0 | 1 | Ground glowing and cracking, lava hissing and rising rumble |
| foe_magmadrone_emerge | 浮出（火光爆開） | **沒有聲音**（`fx.explosion`） | entities/mech-foe-e1.js:186-192 | 1.0 | 2 | Drone bursting out of lava, molten splash and steam blast |
| foe_magmadrone_shot | 熔岩彈（4 發） | **沒有聲音**（直接建 Projectile） | entities/mech-foe-e1.js:196-216 | 0.5 | 3 | Lava glob spat out, wet fiery thump |
| foe_magmadrone_shot_hit | 熔岩彈落地 | W-PJ | entities/projectile.js:303 | 1.0 | 2 | Lava ball splattering and exploding |
| foe_magmadrone_dive | 潛回地下 | **沒有聲音** | entities/mech-foe-e1.js:217-221 | 1.0 | 1 | Drone sinking back into magma, gurgling hiss |
| foe_magmadrone_die | 擊破 | C-DIE | ME:2722 | 1.5 | 1 | Magma drone exploding in a fiery splash |

### bellows（熱風鼓風機）— ai bellows；前方 ±40° 熱風往外吹
| 鍵 | 事件 | 目前的聲音 | 觸發處 | 長度 | 變化 | 提示詞 |
|---|---|---|---|---|---|---|
| foe_bellows_idle | 扇葉轉動 | **沒有聲音** | — | 3.0 循環 | 1 | Industrial bellows fan turning, deep whooshing air |
| foe_bellows_charge | 蓄氣 1.4 秒（扇葉加速） | `SFX.play('charge', 0.6, 0.6)` | entities/mech-foe-e1.js:238 | 1.4 | 1 | Giant fan spinning up, building roar of compressed hot air |
| foe_bellows_blow | 噴出熱風 | `SFX.play('explode', 0.5, 0.6)` | entities/mech-foe-e1.js:260 | 1.5 | 2 | Blast of scorching wind, roaring furnace gust |
| foe_bellows_die | 擊破 | C-DIE | ME:2722 | 2.0 | 1 | Bellows machine exploding, fan blades shearing |

## 8. 專屬敵人擴充 E2（移動要塞「方舟」；data/foes-e2.js，行為 entities/mech-foe-e2.js）

### popturret（甲板升降砲塔）— ai popturret
| 鍵 | 事件 | 目前的聲音 | 觸發處 | 長度 | 變化 | 提示詞 |
|---|---|---|---|---|---|---|
| foe_popturret_warn | 井框的燈亮（0.9 秒） | `SFX.play('ui2', 0.5, 0.6)` | entities/mech-foe-e2.js:96 | 0.9 | 1 | Deck hatch warning light buzzer, hydraulic unlocking clank |
| foe_popturret_rise | 升起 | **沒有聲音** | entities/mech-foe-e2.js:100-106 | 1.0 | 1 | Turret rising out of the deck on a hydraulic lift, heavy mechanical whir |
| foe_popturret_fire | 砲擊（爆發屬性） | `SFX.play('heavy', 0.5, 1.1)` | entities/mech-foe-e2.js:132 | 0.6 | 3 | A single heavy cannon shot, sharp loud bang with a deep booming tail |
| foe_popturret_lower | 降回甲板 | **沒有聲音** | entities/mech-foe-e2.js:134-138 | 1.0 | 1 | A mechanical turret retracting into the floor, motor whir descending, then a heavy metal hatch sliding shut with a clunk |
| foe_popturret_die | 擊破 | C-DIE | ME:2722 | 2.0 | 1 | Deck turret exploding |

### boarder（登艦突擊兵）— ai boarder，SG-33，逆足 l_rj
| 鍵 | 事件 | 目前的聲音 | 觸發處 | 長度 | 變化 | 提示詞 |
|---|---|---|---|---|---|---|
| foe_boarder_step | 腳步 | C-STEP（逆足） | game/feedback.js:304 | 0.4 | 3 | Reverse-jointed boarding mech step, springy metal clank |
| foe_boarder_warn | 目標腳下預警圈（0.9 秒） | `SFX.play('charge', 0.5, 1.2)` | entities/mech-foe-e2.js:156 | 0.9 | 1 | Thrusters charging up before a jump, electric whine rising quickly in pitch, sci-fi |
| foe_boarder_leap | 突擊推進撲過去 | C-QB 的 `SFX.ab` | entities/mech-foe-e2.js:165-176 | 1.0 | 2 | Mech launching into a pouncing leap, jet roar |
| foe_boarder_slam | 落點爆炸 | `SFX.explode(false)` | entities/mech-foe-e2.js:180 | 1.5 | 2 | Mech crash-landing with an explosive slam |
| foe_boarder_sg | 霰彈 | W-SG（w_sg） | ME:903 | 0.8 | 2 | Boarding shotgun blast |
| foe_boarder_die | 擊破 | C-DIE | ME:2722 | 2.0 | 2 | Boarding mech exploding |

### railgunner（甲板軌道砲兵）— ai railgunner，LR-40，重二足 l_hv
| 鍵 | 事件 | 目前的聲音 | 觸發處 | 長度 | 變化 | 提示詞 |
|---|---|---|---|---|---|---|
| foe_railgunner_step | 腳步 | C-STEP（重二足） | game/feedback.js:304 | 0.6 | 2 | Heavy artillery mech step |
| foe_railgunner_charge | 充能 1.8 秒（瞄準線跟著目標，最後 0.35 秒停住） | `SFX.play('charge', 0.6, 0.7)` | entities/mech-foe-e2.js:208 | 1.8 | 1 | Railgun capacitors charging, rising electric whine to a shrill peak |
| foe_railgunner_fire | 貫穿光束 | `SFX.play('laserBig', 0.7, 0.8)` | entities/mech-foe-e2.js:235 | 1.2 | 2 | Railgun firing, supersonic crack and electric thunderclap |
| foe_railgunner_cool | 散熱（受傷變重） | **沒有聲音** | entities/mech-foe-e2.js:222-244 | 1.5 | 1 | Railgun rails venting heat, hissing steam and ticking metal |
| foe_railgunner_lr | 雷射步槍 | W-LAS（w_lr） | ME:1264 | 0.6 | 2 | Laser rifle zap |
| foe_railgunner_die | 擊破 | C-DIE | ME:2722 | 2.5 | 1 | Railgun mech exploding, capacitor discharge |

### spotter（艦橋觀測無人機）— ai spotter，飛行；標定＝狀態效果 spotted＋引導 3 發砲擊
| 鍵 | 事件 | 目前的聲音 | 觸發處 | 長度 | 變化 | 提示詞 |
|---|---|---|---|---|---|---|
| foe_spotter_fly | 飛行循環 | C-THR | game/feedback.js:243 | 3.0 循環 | 1 | Observation drone hovering, smooth electric whir |
| foe_spotter_light | 探照燈照目標 1.4 秒 | `SFX.play('ui2', 0.5, 1.4)` | entities/mech-foe-e2.js:259 | 1.4 | 1 | A powerful searchlight switching on with a loud electric clunk, followed by a steady electrical buzz |
| foe_spotter_mark | 標定（spotted）＋呼叫砲擊 | 狀態效果 spotted（第 10 節）；呼叫沒有聲音 | entities/mech-foe-e2.js:279 | 1.0 | 1 | Target designated, radio call for fire, rapid confirmation beeps |
| foe_spotter_incoming | 砲擊的預警圈（3 個，間隔 0.25 秒） | **沒有聲音** | entities/mech-foe-e2.js:284-288 | 1.2 | 2 | Incoming artillery shell whistle |
| foe_spotter_strike | 砲擊落下爆炸 | `SFX.explode(false)` | entities/mech-foe-e2.js:292 | 1.5 | 3 | Naval artillery shell impact, heavy explosive blast |
| foe_spotter_die | 擊落 | C-DIE | ME:2722 | 1.5 | 1 | A small flying drone shot down, electric sparks crackling, then a crash of metal hitting the ground |

## 9. 專屬 AC（data/foes.js 的 ACES，14 名；主線精英區段）

專屬 AC 是機甲模型，武器聲照共用配方。專屬的行為在 `entities/mech-foe.js`（marsh、whiteout、specimen、spire、undertow、zenith），其他照 ACE 的 ai（bastion 有地面衝擊波 `ME:4303`）。

| 鍵 | 敵人 | 事件 | 目前的聲音 | 觸發處 | 長度 | 變化 | 提示詞 |
|---|---|---|---|---|---|---|---|
| ace_oxide_boost | rust（OXIDE，ai ac，每次組裝不同） | 推進／QB | C-THR、C-QB | ME:4110 | 0.8 | 2 | Scavenger ace mech boosting, rough patched thrusters |
| ace_oxide_die | rust（OXIDE） | 擊破 | C-DIE | ME:2722 | 2.5 | 1 | Rival ace mech destroyed, big explosion |
| ace_stevedore_shock | stevedore（STEVEDORE，ai bastion） | 地面衝擊波（預備沒有聲音） | `SFX.explode(true)` | ME:4321、fx/effects.js:1817 | 1.5 | 1 | Dockworker heavy mech ground slam shockwave |
| ace_stevedore_bz | stevedore | 火箭筒 | W-SHL（w_bz） | ME:927 | 1.2 | 2 | Heavy bazooka shot |
| ace_stevedore_mg | stevedore | 機槍 | W-BUL（w_mg） | ME:883 | 0.3 | 2 | Machine gun burst |
| ace_stevedore_gr | stevedore | 雙肩榴彈 | W-GR（bw_gr） | ME:979 | 0.8 | 2 | Twin shoulder grenade launchers thumping |
| ace_stevedore_die | stevedore | 擊破 | C-DIE | ME:2722 | 3.0 | 1 | Heavy ace mech destroyed |
| ace_sluice_perch | sluice（SLUICE，ai strider） | 跳上壩頂（懸浮爬升） | C-THR、C-QB | ME:4043-4060 | 1.5 | 1 | Heavy mech thrusters lifting onto high ground |
| ace_sluice_lc | sluice | 雷射砲 | W-LAS（w_lc） | ME:1264 | 1.2 | 2 | Laser cannon blast from above |
| ace_sluice_bz | sluice | 火箭筒 | W-SHL（w_bz） | ME:927 | 1.2 | 2 | Bazooka shot |
| ace_sluice_gat | sluice | 背部加特林 | W-BUL（bw_gat） | ME:883 | 0.5 | 2 | Gatling barrage |
| ace_sluice_ms8 | sluice | 重導彈 | W-MSL（bw_ms8） | ME:1074 | 2.0 | 2 | Heavy missile barrage |
| ace_sluice_die | sluice | 擊破 | C-DIE | ME:2722 | 3.0 | 1 | Dam captain mech destroyed |
| ace_marsh_submerge | marsh（MARSH，ai marsh） | 在水裡潛行（隱藏、不能鎖定） | **沒有聲音**（`fx.dust`） | entities/mech-foe.js:392-410 | 3.0 循環 | 1 | Amphibious mech gliding underwater, muffled propulsion and bubbles |
| ace_marsh_ambush | marsh | 從水裡 QB 突襲（浮出） | C-QB | entities/mech-foe.js:403-406 | 1.0 | 2 | A giant robot bursting up out of deep water, huge splash with water pouring off, roaring jet thrusters |
| ace_marsh_sg | marsh | 霰彈 | W-SG（w_sg） | ME:903 | 0.8 | 2 | Close shotgun blast |
| ace_marsh_claw | marsh | 破碎爪 | W-MEL（w_claw） | ME:1879、ME:2036 | 0.8 | 2 | Crushing claw slam |
| ace_marsh_ms | marsh | 導彈 | W-MSL（bw_ms） | ME:1074 | 1.5 | 2 | Missile pod salvo |
| ace_marsh_die | marsh | 擊破 | C-DIE | ME:2722 | 2.5 | 1 | Amphibious ace mech exploding with water spray |
| ace_whiteout_cloak | whiteout（WHITEOUT，ai whiteout） | 沒開火時隱形／開火現形 | **沒有聲音** | entities/mech-foe.js:467-488 | 1.0 | 2 | Optical camouflage engaging and disengaging, shimmering electric hiss |
| ace_whiteout_lr | whiteout | 雷射步槍 | W-LAS（w_lr） | ME:1264 | 0.6 | 2 | Laser rifle zap out of a blizzard |
| ace_whiteout_rifle | whiteout | 步槍 | W-BUL（w_rifle） | ME:883 | 0.3 | 2 | Rifle burst |
| ace_whiteout_lc | whiteout | 背雷射砲 | W-LAS（bw_lc） | ME:1264 | 1.0 | 2 | Shoulder laser cannon blast |
| ace_whiteout_die | whiteout | 擊破 | C-DIE | ME:2722 | 2.5 | 1 | Snow ace mech destroyed |
| ace_specimen_overload | specimen（SPECIMEN，ai specimen） | 每 12 秒過載 5 秒（衝擊波） | **沒有聲音**（`fx.shockwave`＋C-ALERT） | entities/mech-foe.js:605-610 | 2.0 | 1 | Experimental mech overloading, howling power surge and bio-electric shriek |
| ace_specimen_tired | specimen | 過載結束、硬直 3 秒 | **沒有聲音**（C-ALERT） | entities/mech-foe.js:611-616 | 1.5 | 1 | Systems crashing, power whine dying, exhausted servos |
| ace_specimen_lc | specimen | 雷射砲 | W-LAS（w_lc） | ME:1264 | 1.2 | 2 | Laser cannon discharge |
| ace_specimen_saber | specimen | 光束大劍 | W-MEL（w_saber） | ME:1879、ME:2036 | 0.8 | 3 | Beam greatsword swing, heavy humming energy slash |
| ace_specimen_ms | specimen | 導彈 | W-MSL（bw_ms） | ME:1074 | 1.5 | 2 | Missile salvo |
| ace_specimen_die | specimen | 擊破 | C-DIE | ME:2722 | 2.5 | 1 | Experimental mech exploding with energy discharge |
| ace_spire_perch | spire（SPIRE，ai spire） | 爬上最高的平台 | C-THR、C-QB | entities/mech-foe.js:685-710 | 1.5 | 1 | A jet thruster blasting upward, loud rising roar, then a heavy metal clank of landing on a steel platform |
| ace_spire_bz | spire | 火箭筒 | W-SHL（w_bz） | ME:927 | 1.2 | 2 | Bazooka shot from above |
| ace_spire_rifle | spire | 步槍 | W-BUL（w_rifle） | ME:883 | 0.3 | 2 | Rifle burst |
| ace_spire_gr | spire | 榴彈 | W-GR（bw_gr） | ME:979 | 0.8 | 2 | Grenade lobbed from a height |
| ace_spire_die | spire | 擊破 | C-DIE | ME:2722 | 2.5 | 1 | Ace mech falling from a platform in an explosion |
| ace_countdown_qb | countdown（COUNTDOWN，ai rain） | QB 閃避 | C-QB | ME:4010-4019 | 0.6 | 2 | Evasive mech dash |
| ace_countdown_ms | countdown | 導彈（MS-8＋MS-4） | W-MSL | ME:1074 | 2.0 | 2 | Massive missile volley, launch countdown beeps then roar |
| ace_countdown_rifle | countdown | 步槍 | W-BUL（w_rifle） | ME:883 | 0.3 | 2 | Rifle burst |
| ace_countdown_mg | countdown | 機槍 | W-BUL（w_mg） | ME:883 | 0.3 | 2 | Machine gun burst |
| ace_countdown_die | countdown | 擊破 | C-DIE | ME:2722 | 2.5 | 1 | Missile ace destroyed, rockets cooking off |
| ace_undertow_shove | undertow（UNDERTOW，ai undertow） | 貼身推擊往外推 | **沒有聲音**（`fx.shockwave`、`fx.meleeHit`） | entities/mech-foe.js:887-894 | 1.0 | 2 | Powerful hydraulic shove, crushing impact with water surge |
| ace_undertow_sg | undertow | 霰彈 | W-SG（w_sg） | ME:903 | 0.8 | 2 | Shotgun blast |
| ace_undertow_pile | undertow | 打樁機 | W-MEL（w_pile） | ME:1879、ME:2036 | 1.0 | 2 | Pile bunker slam |
| ace_undertow_gr | undertow | 榴彈 | W-GR（bw_gr） | ME:979 | 0.8 | 2 | Grenade thump |
| ace_undertow_die | undertow | 擊破 | C-DIE | ME:2722 | 2.5 | 1 | Ace mech exploding at sea |
| ace_keel_shock | keel（KEEL，ai bastion） | 地面衝擊波 | `SFX.explode(true)` | ME:4321、fx/effects.js:1817 | 1.5 | 1 | Armored ace ground slam on a ship deck |
| ace_keel_lc | keel | 雷射砲 | W-LAS（w_lc） | ME:1264 | 1.2 | 2 | Laser cannon discharge |
| ace_keel_rifle | keel | 步槍 | W-BUL（w_rifle） | ME:883 | 0.3 | 2 | Rifle burst |
| ace_keel_ms | keel | 導彈 | W-MSL（bw_ms） | ME:1074 | 1.5 | 2 | Missile salvo |
| ace_keel_shield | keel | 脈衝盾擋下 | `SFX.play('shield', 0.9, 1.2)` | ME:2391 | 0.5 | 2 | Pulse shield deflecting fire |
| ace_keel_die | keel | 擊破 | C-DIE | ME:2722 | 3.0 | 1 | Ark guardian mech destroyed |
| ace_kiln_ab | kiln（KILN，ai rusher） | 突擊推進衝過來 | C-QB 的 `SFX.ab` | ME:3999 | 1.2 | 2 | Blazing assault booster roar |
| ace_kiln_sg | kiln | 霰彈 | W-SG（w_sg） | ME:903 | 0.8 | 2 | Shotgun blast |
| ace_kiln_mg | kiln | 機槍 | W-BUL（w_mg） | ME:883 | 0.3 | 2 | Machine gun burst |
| ace_kiln_gr | kiln | 榴彈 | W-GR（bw_gr） | ME:979 | 0.8 | 2 | Grenade thump |
| ace_kiln_die | kiln | 擊破 | C-DIE | ME:2722 | 2.5 | 1 | Volcano ace mech exploding in flames |
| ace_zenith_hover | zenith（ZENITH，ai zenith） | 一直懸浮、低於 10 m 就爬升 | C-THR | entities/mech-foe.js:932-943 | 3.0 循環 | 1 | Orbital ace mech hovering on powerful vectored thrusters |
| ace_zenith_lr | zenith | 雷射步槍 | W-LAS（w_lr） | ME:1264 | 0.6 | 2 | Laser rifle zap |
| ace_zenith_hg | zenith | 手槍 | W-BUL（w_hg） | ME:883 | 0.3 | 2 | Handgun shot |
| ace_zenith_ms | zenith | 雙導彈莢艙 | W-MSL（bw_ms） | ME:1074 | 1.5 | 2 | Twin missile pods firing |
| ace_zenith_die | zenith | 擊破 | C-DIE | ME:2722 | 2.5 | 1 | Orbital ace destroyed, falling in flames |
| ace_sirocco_qb | sirocco（SIROCCO，ai duelist） | 閃避與逼近的 QB | C-QB | ME:4028-4038 | 0.5 | 3 | Desert duelist quick-boost, sandy thruster burst |
| ace_sirocco_blade | sirocco | 脈衝刀 | W-MEL（w_blade） | ME:1879、ME:2036 | 0.6 | 3 | Pulse blade slash |
| ace_sirocco_sg | sirocco | 霰彈 | W-SG（w_sg） | ME:903 | 0.8 | 2 | Shotgun blast |
| ace_sirocco_die | sirocco | 擊破 | C-DIE | ME:2722 | 2.5 | 1 | Duelist ace mech cut down |
| ace_prospector_ab | prospector（PROSPECTOR，ai rusher） | 突擊推進 | C-QB 的 `SFX.ab` | ME:3999 | 1.2 | 2 | Mining ace booster charge |
| ace_prospector_pile | prospector | 打樁機 | W-MEL（w_pile） | ME:1879、ME:2036 | 1.0 | 2 | Pile bunker impact |
| ace_prospector_sg | prospector | 霰彈 | W-SG（w_sg） | ME:903 | 0.8 | 2 | Shotgun blast |
| ace_prospector_shield | prospector | 脈衝盾擋下 | `SFX.play('shield', 0.9, 1.2)` | ME:2391 | 0.5 | 2 | Pulse shield blocking |
| ace_prospector_die | prospector | 擊破 | C-DIE | ME:2722 | 2.5 | 1 | Mining ace destroyed |

## 10. 狀態效果（entities/mech-status.js，data/status.js）— 依施加的敵人

聲音是依狀態種類（`statusOnAdd` :346、`statusOnRemove` :400、`statusShake` :430），不分敵人。建議依施加的敵人改成專屬的聲音時，用敵人的鍵（例如 harpoon 的 hook 用 `foe_harpoon_hook`）；下面是「被施加的一方」的聲音。另外本機玩家中招時還有 `SFX.alert()`（:389，spotted 與 drain 除外）。

| 鍵 | 狀態（施加的敵人） | 事件 | 目前的聲音 | 觸發處 | 長度 | 變化 | 提示詞 |
|---|---|---|---|---|---|---|---|
| st_hook_on | hook（harpoon；Boss ANVIL 也用） | 被鉤住 | `plate1`＋`clatter1` | entities/mech-status.js:361-362 | 0.8 | 2 | Steel hook latching onto armor, heavy clank and taut cable |
| st_hook_pull | hook | 被拉過去（持續） | **沒有聲音** | entities/mech-status.js（move 裡） | 2.0 循環 | 1 | Heavy metal being dragged across rough ground, harsh scraping and grinding with a taut steel cable straining and creaking |
| st_stick_on | stick（riveter；金色詞條也用） | 黏附炸彈黏上 | `crunch1`＋`uiTick` | entities/mech-status.js:364-365 | 0.5 | 2 | Sticky bomb slapping onto armor, magnetic clunk and arming chirp |
| st_stick_beep | stick | 倒數嗶聲（越來越快） | `SFX.tone(1700→2200 Hz, square)` | entities/mech-status.js:501-508 | 0.08 | 1 | Bomb countdown beep, sharp electronic tick |
| st_stick_blast | stick | 3 秒後爆炸 | `SFX.explode(false)` | entities/mech-status.js:251 | 1.5 | 2 | Sticky bomb detonating on armor plating |
| st_latch_on | latch（parasite） | 纏附 | `crunch2`＋`splash` | entities/mech-status.js:367-368 | 0.8 | 2 | Slimy tendrils clamping onto metal, wet crunch |
| st_latch_tick | latch | 每秒損傷 | **沒有聲音** | entities/mech-status.js | 1.0 循環 | 1 | Organic creature gnawing at armor, wet chewing and metal scraping |
| st_slow_on | slow（cryo；陷阱也用） | 緩速 | `glass`＋`stepSnow1` | entities/mech-status.js:370-371 | 0.8 | 2 | Frost crusting over joints, crackling ice forming |
| st_nojump_on | nojump（anchor 的重力圈） | 禁止跳躍 | `overload` | entities/mech-status.js:373 | 0.8 | 1 | Gravity clamp engaging, heavy bass thrum and servo strain |
| st_net_on | net（netter） | 捕獲網 | `clatter2`＋`door` | entities/mech-status.js:375-376 | 0.8 | 2 | Weighted steel net entangling a mech, clanking mesh |
| st_spotted_on | spotted（lamp、spotter） | 被標定 | `charge` | entities/mech-status.js:378 | 0.8 | 1 | Target lock warning tone, enemy designation beep |
| st_drain_on | drain（welder） | 吸取 EN | `dome1` | entities/mech-status.js:380 | 0.8 | 1 | Sci-fi energy being drained, descending electric whine with crackling static, power fading down |
| st_shake | 全部（QB 次數還不夠） | 甩動 | `clatter1` | entities/mech-status.js:436 | 0.4 | 2 | Mech jerking against restraints, rattling metal |
| st_escape | 全部（QB／近戰掙脫） | 掙脫 | `plate2`＋`uiOk` | entities/mech-status.js:412-413 | 0.6 | 2 | Breaking free from restraint, metal snapping loose with a release whoosh |
| st_cut | net、latch（近戰割開） | 割開 | `glass`＋`uiOk` | entities/mech-status.js:411-413 | 0.6 | 2 | Blade slicing through net or tendrils, sharp tearing snap |

## 11. 場上機制的共用部分（game/hazards2.js，依建立的敵人）

| 鍵 | 機制（建立的敵人） | 事件 | 目前的聲音 | 觸發處 | 長度 | 變化 | 提示詞 |
|---|---|---|---|---|---|---|---|
| hz_smoke_loop | smoke（smoker；敵人閃避的煙幕彈也用） | 煙幕持續 | **沒有聲音** | game/hazards2.js:38 | 4.0 循環 | 1 | Thick smoke screen hissing softly, drifting gas |
| hz_suction_loop | suction（twister、turbine） | 吸入持續 | **沒有聲音** | game/hazards2.js:194-206 | 4.0 循環 | 1 | Powerful vortex suction, howling wind |
| hz_spot_loop | spot（lamp） | 探照區 | **沒有聲音** | game/hazards2.js:309-321 | 3.0 循環 | 1 | Searchlight electric hum |
| hz_wall_rock_break | 岩牆被打碎（blaster；Boss 掩體也用） | 碎裂 | `SFX.explode(false)` | game/hazards2.js:582 | 1.0 | 2 | Rock barrier crumbling into rubble |
| hz_shot_down | 可以打掉的投射物被擊落（missilerack 等） | 擊落 | `SFX.explode(false)` | game/hazards2.js:681 | 1.0 | 2 | A small missile exploding in midair, short sharp blast with a crackling pop and debris |

（gravity、electro、fuel、beam 已列在 anchor、eel、fueler、focus 底下。）

## 12. 敵人詞綴（data/affix.js，判定 entities/mech-affix.js、game/affix.js；任何一般敵人都可能帶）

| 鍵 | 詞綴 | 事件 | 目前的聲音 | 觸發處 | 長度 | 變化 | 提示詞 |
|---|---|---|---|---|---|---|---|
| af_shield_hit | shield 護盾 | 正面的護盾擋下遠程攻擊 | **沒有聲音**（六角格漣漪） | entities/mech-affix.js:62-73 | 0.4 | 3 | A bullet hitting a sci-fi energy shield, crisp electric zap with a shimmering wobbling ripple |
| af_split | split 分裂 | 擊破時分成兩台小的 | **沒有聲音**（`fx.shockwave`＋C-ALERT） | game/affix.js:84-98 | 1.2 | 1 | Machine splitting into two, mechanical separation clank and energy pop |
| af_cloak_on | cloak 隱形 | 停火後隱形 | **沒有聲音** | entities/mech-affix.js:90-93 | 0.8 | 1 | Cloaking field engaging, fading shimmer hiss |
| af_cloak_off | cloak 隱形 | 開火／被打現形 | **沒有聲音** | entities/mech-affix.js:90-93 | 0.6 | 1 | Cloak dropping, electric crackle as the machine reappears |
| af_berserk | berserk 狂暴 | AP 剩一半時狂暴 | `SFX.play('alarm', 0.4, 1.2)` | entities/mech-affix.js:100 | 1.2 | 1 | A machine engine revving to the redline, aggressive mechanical roar with a loud blaring alarm siren |
| af_reflect | reflect 反射 | 反射中彈開實彈 | `SFX.play('shield', 0.6, 1.5)` | entities/mech-affix.js:44 | 0.4 | 3 | Bullet deflected by a reflective barrier, bright ricochet ping |
| af_regen | regen 再生 | 幾秒沒被打就回復 AP | **沒有聲音** | entities/mech-affix.js:109 | 1.5 循環 | 1 | Nanomachine repair humming, soft regenerating shimmer |
| af_volatile_warn | volatile 殉爆 | 擊破後的預警圈 | `SFX.play('alarm', 0.5, 1.6)` | game/affix.js:103 | 1.0 | 1 | Reactor going critical, rapid rising alarm beeps |
| af_volatile_blast | volatile 殉爆 | 大爆炸 | `SFX.explode(true)` | game/affix.js:108 | 2.5 | 2 | Reactor core detonation, massive explosion |
| af_swift | swift 疾風 | 移動很快 | **沒有聲音** | data/affix.js:14 | 1.0 循環 | 1 | Overclocked servos whining at high speed |
| af_magnet | magnet 磁力 | 把附近的導彈吸過去 | **沒有聲音** | entities/mech-affix.js:118 | 2.0 循環 | 1 | A strong magnetic field humming, deep pulsing electric hum with a wobbling metallic warble |
| af_leader | leader 指揮 | 附近的敵人減傷 | **沒有聲音** | entities/mech-affix.js:30-35 | 2.0 循環 | 1 | Command aura pulse, low radio harmonic |
| af_adapt | adapt 適應（只有 Boss） | 抗性提高（跳字） | **沒有聲音** | entities/mech-affix.js:50-58 | 0.8 | 1 | Metal armor plates shifting and sliding into place, mechanical clicks with a rising electric hum |


## 13. 彙總

**項目數**：共 **559** 項（表格的每一列一項；每項再依「變化」欄產生 1～3 個取樣，取樣總數 904；其中 82 項是循環音）。
- 一般敵人 19 種（`e_`）：99 項；敵對 AC 11 種（`ac_`：10 名具名 AC＋隨機組裝的 ac）：54 項 → 一般敵人 30 種合計 153 項
- 專屬敵人 58 種（`foe_`）：303 項
- 專屬 AC 14 名（`ace_`）：70 項
- 狀態效果（`st_`）15 項、場上機制（`hz_`）5 項、詞綴（`af_`）13 項

**目前完全沒有聲音的事件**（152 列提到「沒有聲音」，其中 6 列只有一部分沒有：e_mtcmd_die 的混亂、ac_volker_shock 與 ace_stevedore_shock 的預備、foe_fueler_die 的燃燒、foe_spotter_mark 的呼叫砲擊、e_mth_volley_warn 有語音但沒有音效）。依種類：
1. **移動與待機的循環音幾乎全部沒有**：程式模型的敵人（`modelKind 'boss'`）與履帶腳 `l_tk` 沒有引擎、履帶、旋翼、風扇的聲音（mth、tank、heli 旋翼、turret、junk、crane、forklift、patrol、gunboat、sprayer、skater、chimera、laserpost、underturret、cart、drill 空轉、harpoon、smoker、riveter、welder、watercannon、turbine、cryo、holo、parasite、fueler、slagger、bellows…）；飛行的只有共用的 `thrustLoop`。
2. **大部分預警沒有聲音**（只有畫面上的線、圈、閃光）：MOVES 的 burst、aimShot、volley、sweep、dash、lob、strafeRun；burrow、rammer、testrig、sprayer、crane、magmadrone 的預警；stomper／bastion 的衝擊波預備；mortar 與 spotter 砲擊的落下呼嘯。
3. **持續型的攻擊沒有循環音**：testrig 與 heatguard 的火焰、welder 的電弧、turbine 的吸入、twister 的旋風、focus 的光束、anchor 的重力圈、eel 的電流區、gategun 的水流、各種燃燒地面／腐蝕區（`addPool`）、煙幕、探照區、修理光束、護盾的嗡鳴、指揮官的信號。
4. **出手沒有聲音**：flak 的空炸彈、magmadrone 的熔岩彈（直接建 Projectile、沒有 `SFX.shot`）、sprayer 的噴射、mirror 的光束（`beamAttack` 不播聲音）、marker 的標定光束。
5. **近身攻擊的命中沒有聲音**（只有 takeDamage，沒有命中音）：blob／chimera 的咬、rammer 的衝撞、undertow 的推擊、burrow 的鑽出、laserpost 的柵欄、boomer 的迴旋刃、watercannon 的水柱。
6. **特殊機能沒有聲音**：潛航／浮出／潛回（gunboat、magmadrone、marsh）、現身／埋回（lurker、burrow）、隱形（whiteout、詞綴 cloak）、融合（blob）、撿零件（scav）、外殼剝落（junk）、貨櫃盾的擋下與打掉（forklift）、升降（popturret）、過載與硬直（specimen）、過熱（heatguard、railgunner）、運輸機的降低高度與離場、全像投影的出現。
7. **詞綴**：只有狂暴、反射、殉爆有聲音，其他 8 種都沒有。
8. **敵人的閃避**（`entities/mech-dodge.js`：側閃、後撤、跳躍、煙幕彈、熱焰彈、架起六角護盾）完全沒有聲音，沒有逐一列進各敵人；要做的話建議依「人形／載具／飛行／固定」各做一組。

**目前借用的聲音**（改成專屬時要替換的呼叫）：`ui2`（gategun、laserpost、minelayer、blaster、slagger、popturret、spotter、missilerack、netter、boomer 的預警）、`charge`（大部分蓄力）、`door`（gategun、smoker、fueler、dropship）、`bell`（kami、swarm、buoy 的嗶聲）、`overload`、`engineHi`、`thrBurst`、`pistol`、`laserBig`、`laser2`、`splash`、`glitch`、`heavy`、`clatter1`、`glass`、`thud1/2`、`punch1`、`crunch1`、`boostUp`、`alarm`、`explode`；武器聲全部經過 `SFX.shot`（`audio/recipes.js` 的 `GUN_OF_ID`，同一把武器的敵人共用）。

**不確定的地方**
- 敵人的武器聲（W-*）照「每種敵人自己的」列了，但程式是依武器 id 播配方；如果要每種敵人不同，`SFX.shot` 要多帶敵人種類（目前只帶武器 id 與射手）。具名 AC 與專屬 AC 的武器各列一項，數量可以視需要合併。
- 腳步（C-STEP）是依腳部種類與地面材質合成的分層聲音；表裡每種有腳的敵人列一項「腳步」，實際上還會乘上 6 種地面材質，建議只做「機體本身的踏地層」，地面材質層沿用。
- 行號是 2026-11-22 的 main（212805ec8）；`ME:4043-4060`、`ME:4110` 這類 AI 段落的行號是範圍的大概位置。
- 第 10、11 節的狀態效果與場上機制是共用的，有幾種也被 Boss、機獸、地圖陷阱用（hook、slow、smoke、岩牆），換成某個敵人專屬的聲音時要注意其他使用者。
- patrol 用 ai strider 但不是 etype strider，所以沒有雷射蓄力的預警招式；cart 與 crystal 也沒有 MOVES（只有 `ENEMY_TYPES` 的鍵才有）。
