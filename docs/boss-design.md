# Boss 改版：割草爽快、要有技術性、越後面越刁鑽

2026-10-29 使用者定案。目前的 Boss（第 14 期：血量 ×1.8、火力 ×1.4、三個型態、狂暴、最終型態的專屬招式）只是「數字變大」，打法沒變，所以太簡單。這次的方向：

- **割草爽快，但要有技術性**：多給積極打的人獎勵，少懲罰；慢慢打也一定過得了。
- **每一隻 Boss 都有全部 10 個方案**（A、C、D、E、I、J、K、L、M、O），差別在**刁鑽度**：越後面的 Boss 參數越緊、條件越多。
- **不做**：連段與假動作的招式改版、懲罰補給、Boss 專用的危險條款、雙 Boss／護衛（原提案的 B、F、G、H）。
- 血量與火力的倍率（`BOSS_HP_K`／`BOSS_DMG_K`）、三個型態的門檻與節奏、狂暴、失衡後保護 8 秒**照舊**；刁鑽度不再加血量與火力，變難只靠機制。

---

## 1. 刁鑽度（tier 1～8）

| 場合 | 刁鑽度 |
|---|---|
| 主線 | 出擊所在的章：第 1～6 章＝1～6 |
| 周目 | 第 2 周目 +1、第 3 周目 +2（上限 8） |
| ECHO 的殘響 Boss（`echo: true`） | 固定 8 |
| 自由出擊 | `BOSS_DEFS` 的索引 i：1＋⌊i×6／22⌋；繞完一輪之後固定 6 |
| 模擬器的 Boss 模擬戰 | 照遇到那一隻時的章（沒有紀錄時 3） |
| 作戰紀錄重打 | 照原本的章＋周目 |
| 多人 | 房主決定，隨生成紀錄（`bt`）同步給客機 |

同一隻 Boss 在不同的章出現（例如 HELIOS 在第 2 章與第 3 章的紫色委託）時，刁鑽度依出現的那一次決定。所有參數放在 `data/boss-tier.js` 的 `TIER[1..8]`，各方案讀 `this.bossTier()`。

---

## 2. 共用規則與各刁鑽度的參數

### A. 失衡越打越難（Monster Hunter 的硬直耐性、Sekiro 的軀幹值）

每打出一次失衡，下一次需要的 ACS 變多、失衡時間變短；**換型態時重置**（每個型態開頭都有一次爽快的爆發）。Boss 的 ACS 失衡目前是 1.5 秒（`mech-entity.js` 的 `takeDamage`），失衡後保護 8 秒（`BOSS_STAG_GUARD`）照舊。

| 刁鑽度 | 不變的次數 | 之後每次需要的 ACS | 之後每次的失衡時間 |
|---|---|---|---|
| 1～2 | 3 次 | +15% | 不縮短（1.5 秒） |
| 3～4 | 2 次 | +25% | −10%，最短 1.2 秒 |
| 5～6 | 1 次 | +30% | −15%，最短 1.0 秒 |
| 7～8 | 0 次 | +35% | −20%，最短 0.9 秒 |

累加有上限（最多 ×2）。I 的打斷、K 的破甲彈、各 Boss 自己的長硬直（撞牆、倒下、失速…）不算進次數，時間也不縮短。

### D. 破綻窗口（Doom Eternal、Zelda 的 Boss、AC6）

Boss 本體平時有減傷，只有**破綻**時受到加倍傷害；破綻時 Boss 身上出現金色光環、HUD 顯示「破綻！」與音效。每隻 Boss 的破綻是哪幾招寫在第 3 節。

| 刁鑽度 | 平時受到的傷害 | 破綻時 | 破綻持續 | 哪些招式有破綻 |
|---|---|---|---|---|
| 1～2 | 80% | ×1.6 | 4 秒 | 所有大招收招 |
| 3～4 | 65% | ×1.6 | 3 秒 | 指定的兩招 |
| 5～6 | 55% | ×1.6 | 2.2 秒 | 指定的一招，或連續兩招之後 |
| 7～8 | 50% | ×1.6 | 1.8 秒 | 同上，另有「假收招」（看起來像破綻、其實還沒收招，0.4 秒後接下一招） |

已經有弱點機制的 Boss（電磁砲台的散熱片、熔爐的爐口、推土要塞的背後、脈衝刃翼的過熱、衛星砲的冷卻、浮游砲的回收充能、高速突擊機的掉頭）：原本的「平時倍率」換成上表，原本的弱點變成這隻的破綻。用部位擋住本體的機制（發生器、砲台、引擎、斷腳）照舊，算在 J。

### I. 打斷大招（Monster Hunter 的拘束、FF14 的打斷詠唱）

每個型態有一個大招會先**蓄力**：Boss 名牌上方與畫面上方出現「打斷量表」。蓄力期間對它造成量表要求的傷害（部位也算）就打斷：長時間失衡（無視失衡後保護）、掉一個彈藥箱、跳出「打斷！」。打不斷就照常放出，用 QB 躲開即可。第三型態的大招＝原本的最終型態專屬招式（`mech-boss3.js` 的 `SPECIALS`）加上蓄力。

| 刁鑽度 | 蓄力時間 | 打斷要的傷害（Boss 最大 AP 的比例） | 打斷後失衡 | 刁鑽之處 |
|---|---|---|---|---|
| 1～2 | 3 秒 | 3% | 5 秒 | — |
| 3～4 | 2.4 秒 | 5% | 4.5 秒 | 蓄力時慢慢後退或升高 |
| 5～6 | 2 秒 | 6% | 4 秒 | 蓄力時有護盾或護衛擋住一個方向 |
| 7～8 | 1.8 秒 | 7% | 3.5 秒 | 連續蓄力兩次，兩次都打斷才失衡（只斷一次＝大招減半） |

### J. 部位破壞（Monster Hunter）

每隻 Boss 有 2～3 個可以打壞的部位（獨立的敵方實體，掛在模型節點上，和現有的部位相同：`ai: 'part'`、`partFollow`）。打壞時：

- 那個部位負責的招式**停用**，或變弱（第 3 節）。
- 掉落補給：彈藥箱＋AP 小回復（`PICKUP_DEFS` 新增 `bossPart`）。
- 結算時每個打壞的部位 COAM +8%。
- 部位的傷害也算進 I 的打斷量表。

| 刁鑽度 | 部位數 | 部位血量（本體的比例） | 刁鑽之處 |
|---|---|---|---|
| 1～2 | 2 | 8% | 位置明顯、有黃色標記 |
| 3～4 | 3 | 10% | 其中 1 個在背後或底下 |
| 5～6 | 3 | 11% | 其中 1 個只在出招時露出；打壞的部位 45 秒後重建 |
| 7～8 | 3 | 12% | 30 秒後重建；重建的部位換成另一種招式 |

已經有的部位（護盾發生器、長程砲台、腳部關節、引擎、浮游砲、列車車廂）照原本的規則，算在部位數裡。

### K. 雜兵是燃料（Doom Eternal 的資源循環）

Boss 戰中擊破雜兵會累積**破甲充能**（每位玩家各自一條，HUD 在 EN 條旁）。充能滿了之後，下一次打中 Boss 是破甲彈：Boss 最大 AP 4% 的額外傷害，並直接打出失衡（失衡後保護中只有傷害）。為了有雜兵可以割，Boss 戰除了換型態的增援之外，**每 25 秒從邊緣進來一小隊雜兵**（場上的雜兵已經很多時不派）。

| 刁鑽度 | 充滿要擊破幾台 | 充能減少 | 雜兵 |
|---|---|---|---|
| 1～2 | 5 | 不會減少 | 每隊 3 台一般雜兵 |
| 3～4 | 6 | 10 秒沒擊破後開始減少 | 3～4 台 |
| 5～6 | 8 | 6 秒後開始減少 | 4 台，其中 1 台是精英 |
| 7～8 | 8 | 6 秒後開始減少 | 4 台，會閃避與躲掩體 |

### L. 風格評價影響傷害（Devil May Cry）

現有的風格評價（`mech-style.js`）在 Boss 戰中多一個效果：對 Boss 與部位的傷害加成 S 級 +20%、SS 級 +28%、SSS 級 +35%（A 以下沒有）。被打中掉級（不額外受傷）。

| 刁鑽度 | 被打中掉幾級 | 其他 |
|---|---|---|
| 1～4 | 1 級 | — |
| 5～6 | 2 級 | — |
| 7～8 | 2 級 | 重複同一招的加分再少一半 |

### M. 打回去（Furi、Metal Gear Rising）

- **可以打掉的彈體**：每隻 Boss 有 1～2 種大型彈體是可以打掉的投射物（現有的 `shootable`）。打掉時彈體**反轉飛回** Boss，打中造成 Boss 最大 AP 1.5% 的傷害與大量 ACS。
- **反擊點**：完美 QB 躲開 Boss 的攻擊時，Boss 身上出現一個藍色反擊點；在時間內打中它，那一發傷害 ×2，並累積 I 的打斷量表 ×2。

| 刁鑽度 | 可以打掉的彈體 | 反擊點 |
|---|---|---|
| 1～2 | 慢、大、一發就掉 | 2 秒 |
| 3～4 | 比較快、要 2～3 發 | 1.5 秒 |
| 5～6 | 混進打不掉的假彈（顏色不同） | 1.2 秒 |
| 7～8 | 飛回去的彈 Boss 會用 QB 躲開，要在 25 m 內打掉才躲不開 | 1 秒 |

### O. 擊破速度的評價（AC6 的評分、Hades 的獎勵）

Boss 擊破時依時間給 S／A／B（結算畫面與 Boss 擊破橫幅）：基準時間 `par` 寫在每隻 Boss 的定義裡（先抓 180 秒，之後依實際手感調整），S＝基準 × 下表、A＝基準 × 1.5。

| 刁鑽度 | S 級的時間 | S 的獎勵 | A 的獎勵 |
|---|---|---|---|
| 1～2 | 基準 × 1.3 | 主線：多一個戰術模組三選一；COAM ×1.5 | COAM ×1.2 |
| 3～4 | × 1.1 | 同上 | 同上 |
| 5～6 | × 0.9 | 同上 | 同上 |
| 7～8 | × 0.8 | 同上 | 同上 |

自由出擊只有 COAM 的加成。多人以房主的計時為準，每個人都拿到同樣的評價。

### C. Boss 會應對玩家（Furi、AC6 的 Ibis）

只做**提醒**、不加傷害：Boss 偵測玩家最近的習慣，換一種站位或招式逼玩家換打法，持續 12 秒；HUD 顯示「BOSS 正在應對：空中」。四種習慣（看過去 N 秒內的比例）：

| 習慣 | 判定 |
|---|---|
| 空中 | 離地 4 m 以上的時間超過 60% |
| 貼身 | 離 Boss 15 m 以內的時間超過 60% |
| 遠距 | 離 Boss 60 m 以外的時間超過 60% |
| 掩體 | Boss 看不到玩家（`losClear` 失敗）的時間超過 40% |

每隻 Boss 對這四種的反制寫在第 3 節。多人時看仇恨最高的那位玩家。

| 刁鑽度 | 偵測幾種 | 觀察時間 N | 同時應對 |
|---|---|---|---|
| 1～2 | 1 種（每隻指定一種） | 15 秒 | 1 種 |
| 3～4 | 2 種 | 10 秒 | 1 種 |
| 5～6 | 4 種 | 6 秒 | 1 種 |
| 7～8 | 4 種 | 4 秒 | 2 種 |

### E. 型態改變場地（Hades、Hollow Knight、MH 的換區）

換型態時改變戰場，用現有的工具：區域效果 `addZone`（煙霧、燃燒、電擊、緩速…）、臨時障礙物 `addTempWall`、燃燒地面 `addPool`、作戰區域縮小、彈藥箱與補給的掉落。

| 刁鑽度 | 什麼時候變 | 變的內容 |
|---|---|---|
| 1～2 | 只有第三型態 | 對玩家有利：多出掩體、彈藥箱 |
| 3～4 | 第二、三型態 | 一個有利、一個不利 |
| 5～6 | 每個型態 | 不利為主；作戰區域縮小到 75% |
| 7～8 | 每個型態 | 不利的區域效果會移動（跟著 Boss，或沿場地繞） |

每隻 Boss 的場地變化寫在第 3 節（有利＝綠、不利＝紅的區分只在設計，遊戲裡看效果本身）。

---

## 3. 各 Boss 的專屬內容

欄位：**出現**＝主線的章（刁鑽度）；**J**＝部位與打壞後停用的招式；**D**＝破綻；**I**＝每個型態可以打斷的大招；**M**＝可以打掉的彈體；**E**＝第二型態／第三型態的場地；**C**＝空中／貼身／遠距／掩體的反制（刁鑽度 1～2 只用標★的那一種）。

### 第 1 章

#### BASTILLE 砲兵陣地（artillery）
- 出現：第 1 章 c1s1（1）、ECHO c1y（8）
- J：長程砲台 ×4（現有；每壞一座砲擊密度下降，全毀才解除指揮所裝甲）、雷達天線（新；砲擊不再預判你的落點）、布雷器（新；不再補地雷）
- D：飽和砲擊之後砲管冷卻；指揮所升起天線修正彈著時
- I：一型 集中砲擊；二型 追蹤彈幕；三型 飽和砲擊
- M：重砲彈（落下前打掉 → 落回陣地）
- E：二型 地雷區擴大、壞掉的砲台變成掩體；三型 塵土煙霧、作戰區域縮到陣地周圍
- C：空中＝防空砲彈；★貼身＝指揮所周圍的噴射衝擊波；遠距＝砲擊改成追蹤落點；掩體＝曲射越過掩體

#### SANDWORM 巨型鑽地蟲（worm）
- 出現：第 1 章 c1s3（1）
- J：頭部感測器（鑽出點不再追著你）、鑽頭顎（沒有咬合突進）、背部排氣孔（沒有地表崩塌的落石）
- D：鑽出後撲空，身體卡在地面
- I：一型 噴砂吐息；二型 連續鑽出；三型 地表崩塌
- M：噴出的岩塊
- E：二型 流沙區（緩速）、碎掉的岩柱成為高台；三型 地面塌陷出坑洞、作戰區域縮小
- C：★空中＝從地下撲向空中；貼身＝鑽出時周圍的衝擊波；遠距＝地下高速移動到你腳下；掩體＝從掩體下方鑽出

#### JUGGERNAUT 戰略級移動要塞
- 出現：第 1 章 c1x（第 2 周目起，2）
- J：肩上飛彈莢艙（沒有齊射）、主砲（沒有砲擊連段）、履帶（移動與衝撞變慢）
- D：衝撞撞空後的滑停；齊射之後
- I：一型 主砲蓄力；二型 齊射；三型 砲擊連段
- M：齊射的飛彈
- E：二型 彈坑（掩體）；三型 燃燒地面帶
- C：空中＝對空機槍；★貼身＝履帶輾壓衝撞；遠距＝長程砲；掩體＝曲射榴彈

### 第 2 章

#### HALBERD 超長程電磁砲台（railgun）
- 出現：第 2 章 c2s1（2）、c4x（4～5）、ECHO c2y（8）
- J：左右散熱片（冷卻時間變長＝破綻更長）、電容器組（充能變慢）、瞄準感測器（瞄準線跟得慢）
- D：貫穿砲擊後散熱片打開（現有）
- I：一型 貫穿砲擊的充能（擋住射線照舊也能中斷）；二型 連射；三型 散射砲
- M：散射砲的電漿彈
- E：二型 被貫穿的掩體碎掉、新的臨時掩體牆升起；三型 煙霧、作戰區域縮小
- C：空中＝散射對空；貼身＝近防電弧；遠距＝充能加速；★掩體＝穿甲彈打穿掩體

#### HELIOS 重武裝母艦直升機（heli）
- 出現：第 2 章 c2s2（2）、c3x（4）
- J：主旋翼（飛行高度下降，近戰打得到）、側邊機槍莢艙（沒有掃射）、炸彈艙（沒有地毯轟炸）
- D：地毯轟炸後拉高；投放空降兵時艙門打開
- I：一型 投放空降兵；二型 火箭齊射；三型 地毯轟炸
- M：火箭彈
- E：二型 燃燒地面帶；三型 煙霧
- C：空中＝機槍掃射上方；★貼身（在正下方）＝下洗氣流推開＋燃燒彈；遠距＝飛彈；掩體＝轟炸掩體

#### BEHEMOTH 衝撞推土要塞（rampart）
- 出現：第 2 章 c2s3a（2）
- J：推土鏟（不再撞碎掩體、衝撞傷害下降）、左右砲塔（沒有側面射擊）、排氣管（連續衝撞的次數變少）
- D：撞牆硬直（現有）；衝撞落空的滑停
- I：一型 衝撞前的引擎蓄力（排氣變紅）；二型 連續衝撞；三型 碎石雨
- M：碎石雨的大石塊
- E：二型 多出可以打碎的混凝土牆（誘它撞）；三型 作戰區域縮小
- C：空中＝散彈對空；貼身（側面）＝原地旋轉甩尾；★遠距＝連續衝撞；掩體＝衝撞撞碎掩體

#### IRON CITADEL 武裝列車（train）
- 出現：第 2 章 c2s3b（2）
- J：四節車廂（現有：各停用一種攻擊）、煙囪閥（鍋爐過熱的時間變長）
- D：衝撞後鍋爐過熱（現有）
- I：一型 停車的雷射舷砲；二型 飛彈齊射；三型 全車廂砲擊（列車停下）
- M：飛彈車廂的飛彈
- E：二型 鐵路旁升起掩體；三型 列車加速、軌道兩側燃燒
- C：空中＝防空車廂集中射擊；★貼身（站在軌道上）＝加速衝撞；遠距＝雷射舷砲；掩體＝布雷

#### CINDER 熔爐清掃機（furnace）
- 出現：第 2 章 c2x（第 2 周目起，3）
- J：熔渣砲（沒有熔渣）、噴火口（沒有近身火焰）、爐門鉸鏈（爐口打開的時間變長）
- D：爐口打開（現有）
- I：一型 熔渣連射；二型 火牆；三型 火海
- M：熔渣彈（打掉的熔渣落在 Boss 腳下變成燃燒地面）
- E：二型 燃燒地面擴大；三型 冷卻水管破裂：蒸氣煙霧＋熄火的安全區
- C：★空中＝熱浪（現有）；貼身＝近身火焰；遠距＝熔渣砲；掩體＝火牆繞過掩體

### 第 3 章

#### STRIDER 巡邏用超大型四足
- 出現：第 3 章 c3s1（3）
- J：背部雷射砲（沒有十字雷射）、左前腳、右前腳（兩隻都壞了＝跪下 6 秒，之後重新站起）
- D：十字雷射後砲管過熱；跳躍落地
- I：一型 雷射蓄力；二型 跳躍踩踏；三型 十字雷射
- M：飛彈
- E：二型 冰面（滑動）；三型 暴風雪（煙霧）、作戰區域縮小
- C：空中＝對空雷射；貼身（腹下）＝踩踏衝擊波；遠距＝雷射；掩體＝榴彈

#### MIRAGE 光學迷彩電戰機（phantom）
- 出現：第 3 章 c3s2（3）、ECHO c3y（8）
- J：迷彩發生器（迷彩時間變短）、分身投影器（分身變少）、干擾天線（沒有鎖定干擾）
- D：現形開火之後；分身突襲收招
- I：一型 鎖定干擾；二型 分身展開；三型 分身突襲
- M：分身打中時引爆的 EMP 彈
- E：二型 煙霧區；三型 全場變暗、分身增加
- C：空中＝分身從上方突襲；貼身＝迷彩後退；遠距＝分身突襲；掩體＝繞到背後

#### PULSAR 脈衝刃翼（ibis）
- 出現：第 3 章 c3s3（3）、c6x（7）
- J：左翼刃、右翼刃（各少一種斬擊）、環發生器（能量環變慢）
- D：過熱（現有）
- I：一型 雷射扇形；二型 直線突刺；三型 雙環
- M：翼刃射出的能量彈；（穿過能量環的完美 QB 一定給反擊點）
- E：二型 能量殘留區（電擊）；三型 作戰區域縮小
- C：空中＝向上的能量環；貼身＝翼刃迴旋；遠距＝直線突刺；掩體＝雷射扇形掃過掩體

### 第 4 章

#### ARACHNE 多足要塞（spider）
- 出現：第 4 章 c4s1（4）
- J：腳部關節 ×6（現有：斷三條倒下）、背部砲塔（沒有布雷與砲擊）
- D：倒下（現有）；跳躍落地
- I：一型 砲塔齊射；二型 跳躍；三型 震地
- M：布下的空雷
- E：二型 平台崩落一部分；三型 煙霧、作戰區域縮小
- C：空中＝跳躍撲擊；貼身＝震地；遠距＝砲塔；掩體＝曲射

#### CERBERUS 三機合體（trinity）
- 出現：第 4 章 c4s2（4）
- J：α 的刃、β 的狙擊砲、γ 的修理臂（打壞的那一台分離後變弱：α 沒有近戰突進、β 沒有狙擊、γ 不能修理）
- D：合體動作中（現有）；分離的瞬間
- I：一型 三連射；二型 分離前的集結；三型 三重衝擊
- M：β 的狙擊彈
- E：二型 機庫的吊掛貨櫃落下（掩體）；三型 作戰區域縮小
- C：空中＝β 對空狙擊；貼身＝α 突進；遠距＝β 狙擊；掩體＝γ 布雷

#### NULLIFIER 電磁狩獵機（hunter）
- 出現：第 4 章 c4s3a（4）、c5x（6）
- J：EMP 線圈（EMP 範圍變小）、牽引錨（沒有牽引）、背部電容（電磁風暴變弱）
- D：EMP 放完的散熱
- I：一型 EMP 充能（藍圈）；二型 牽引；三型 電磁風暴
- M：電磁彈
- E：二型 電擊地面；三型 作戰區域縮小
- C：空中＝牽引拉下來；貼身＝近身 EMP；遠距＝電磁彈；掩體＝牽引把你拉出掩體

#### JUDGEMENT 衛星砲導引塔（orbital）
- 出現：第 4 章 c4s3b（4）、ECHO c4y（8）
- J：導引天線 ×2（光柱追蹤變慢）、中繼碟（沒有格子砲擊）
- D：冷卻（現有）
- I：一型 追蹤光柱；二型 格子砲擊；三型 雙重光柱
- M：防衛砲的能量彈
- E：二型 光柱打過的地面變成燃燒地面；三型 作戰區域縮小
- C：空中＝光柱往上掃；貼身＝塔基的放電；遠距＝格子砲擊；掩體＝光柱打穿掩體

### 第 5 章

#### AEGIS 護盾指揮艦（flagship）
- 出現：第 5 章 c5s1（5）、ECHO c5y（8）
- J：護盾發生器（現有：全毀才打得動本體、25 秒後重建）、艦砲（沒有艦砲齊射）
- D：艦砲齊射之後；發生器重建中
- I：一型 護盾強化；二型 艦砲連射；三型 艦砲齊射
- M：艦砲彈
- E：二型 甲板邊緣崩落（虛空變多）；三型 煙霧、作戰區域縮小
- C：空中＝防空砲；貼身＝護盾衝擊；遠距＝艦砲；掩體＝曲射

#### LEVIATHAN 空中要塞（fortress）
- 出現：第 5 章 c5s2a（5）
- J：引擎 ×4（現有：全毀降到 10 m）、下方砲台（沒有全彈發射的散射）
- D：引擎全毀降下後；全彈發射之後
- I：一型 轟炸；二型 飛彈雨；三型 全彈發射
- M：飛彈
- E：二型 燃燒地面；三型 作戰區域縮小
- C：空中＝機槍掃射；貼身（下方）＝轟炸；遠距＝飛彈雨；掩體＝轟炸掩體

#### VIPER 高速突擊機（interceptor）
- 出現：第 5 章 c5s2b（5）
- J：左右機翼（掃射後掉頭更慢＝破綻更長）、機砲（掃射變短）
- D：掉頭減速（現有）
- I：一型 進場掃射；二型 音爆；三型 空雷封鎖
- M：空雷
- E：二型 空雷殘留區；三型 作戰區域縮小
- C：空中＝空雷；貼身＝貼近時的音爆；遠距＝遠距掃射；掩體＝俯衝轟炸

#### IGUAZU & VOLTA 雙 AC 小隊（duo）
- 出現：第 5 章 c5s3（5）
- J：IGUAZU 的肩上飛彈、VOLTA 的肩上榴彈（各停用齊射的一半）
- D：連攜齊射之後；一台被打出失衡時另一台會來救（救的路上是破綻）
- I：一型 夾擊；二型 交叉火線；三型 連攜齊射（兩台靠在一起）
- M：飛彈
- E：二型 掩體被打碎；三型 作戰區域縮小
- C：空中＝兩台同時對空；貼身＝另一台從背後；遠距＝一台突進一台狙擊；掩體＝分頭包夾

### 第 6 章

#### SERAPHIM 浮游砲指揮機（funnel）
- 出現：第 6 章 c6s1（6）
- J：浮游砲（現有）、浮游砲艙（回收後補充變慢）
- D：回收充能（現有）
- I：一型 包圍；二型 全方位開火；三型 光束牢籠
- M：浮游砲的光彈
- E：二型 浮游砲殘骸變成電擊區；三型 作戰區域縮小
- C：空中＝浮游砲從上方；貼身＝本體近身光劍；遠距＝浮游砲追擊；掩體＝浮游砲繞到掩體後

#### DOPPEL 複製 AC（mirror）
- 出現：第 6 章 c6s2（6）、ECHO c6y（8）
- J：右手武器、左手武器、肩上武器（複製你的裝備：打壞的那一把不能用）
- D：適應過載之後
- I：一型 照你的武器連射；二型 適應裝甲強化；三型 適應過載
- M：飛彈（你有裝飛彈時）
- E：二型 布雷區；三型 作戰區域縮小
- C：複製你的習慣：空中＝跟著你飛；貼身＝改用近戰；遠距＝突進；掩體＝繞到側面

#### BALTEUS 自律型艦載機動兵器
- 出現：第 6 章 c6s3（6）
- J：左右飛彈莢艙（導彈牆變一半）、火焰噴射器（沒有近身火焰）、脈衝裝甲發生器（沒有脈衝裝甲）
- D：脈衝裝甲被打破之後；導彈牆之後
- I：一型 脈衝裝甲展開；二型 脈衝爆發；三型 導彈牆
- M：導彈
- E：二型 燃燒地面；三型 作戰區域縮小、移動的燃燒帶
- C：空中＝導彈追擊；貼身＝火焰噴射；遠距＝突進；掩體＝導彈從上方

---

## 4. 顯示、同步與其他

- **HUD**：打斷量表（Boss 名牌上方＋畫面上方的 Boss 血條下）、破綻的金色光環與「破綻！」、部位的黃色標記與「部位破壞」、破甲充能條、風格評價旁的傷害加成、反擊點的藍色光點、「BOSS 正在應對：…」、擊破時的 S／A／B。
- **說明**：第一次遇到每種機制時跳一次說明（像 `intro`）；Boss 的 `intro` 多寫一句這隻的破綻與部位。
- **多人**：全部只在房主判定。快照帶 Boss 的打斷量表、破綻、反擊點（`bx` 擴充或新欄位）、應對中的習慣；部位照舊是實體；破甲充能每位玩家一份（`mpStats`）；評價在 `end` 訊息。要提高 `NET_VERSION`。
- **靶場與實驗室**：不套用。模擬器的 Boss 模擬戰套用。
- **設定**：不加開關（難度是設計的一部分）。

## 5. 實作的說明（2026-10，和上面的定案有出入或補充的地方）

- **破綻**：「破綻時 ×1.6」是對原本傷害的 ×1.6（不是平時倍率的 1.6 倍）；平時倍率與破綻**只改傷害，不改衝擊**（失衡由 A 處理）。
- **打斷量表**：以 Boss 自己的裝甲（砲台、引擎、斷腳的倍率）之前的傷害累積，否則有部位擋住本體的 Boss 打不斷；部位的傷害照設計也算。
- **部位數**：原本就有的部位「一種算一個」（四座砲台＝1、六條腳＝1、四節車廂＝1、浮游砲整群＝1），不夠的才補設計裡的新部位；刁鑽度 3 起最後一個在背後或底下、5 起最後一個只在出招時露出。Boss 本體藏起來（鑽地蟲在地下、迷彩中、分離中、隧道裡）時部位也一起藏。每個部位有自己的造型（`render/boss-models.js` 的 `BP`：雷達天線、飛彈莢艙、散熱片、EMP 線圈…43 種，`BOSS_KIT` 的 `parts[].model`），模型庫的「Boss 部位・…」可以預覽。
- **大招**：第一、二型態的大招用最終型態招式的共用零件（迫擊砲雨、直線砲擊、衝擊波、能量環、光束…）組成，名稱照第 3 節；第三型態＝原本的 `SPECIALS`。
- **場地**：全部是新設計的效果（`game/boss-field.js`）：流沙（緩速＋往中心吸）、冰面（滑）、電擊地面（預警後放電、扣 EN）、地面塌陷（裂縫預警 → 坑洞）、熔岩裂地、移動的燃燒帶、地雷區（地面或空中）、煙霧／沙塵／暴風雪（擋視線、鎖定距離 ×0.6）、蒸氣（安全區：燃燒地面熄滅）、全場變暗（鎖定距離 ×0.75），掩體是彈坑土堤、碎石、落下的貨櫃、岩柱高台、混凝土牆；「甲板崩落」是作戰區域縮小＋塌陷。刁鑽度 7～8 會移動的不利效果是跟著 Boss 的煙霧與掃過戰場的燃燒帶。
- **應對玩家**：看的是 Boss 目前的目標（最近的敵人），沒有另外算仇恨。
- **擊破評價 S 的三選一**：只有單人與多人的房主（客機只有 COAM 的加成）。基準時間 `par` 先一律 180 秒。
- **說明**：每隻 Boss 的破綻與部位寫進原本的開場介紹（`BOSS_DEFS` 的 `intro`，作戰室簡報的敵情也用它）；原本沒有開場介紹的五隻補上。
- **地圖比較開闊**（2026-10-30 使用者定案）：Boss 關（自由出擊、主線的 Boss 區段、模擬器）的地圖物件只留約兩成當掩體、地圖中央一圈全部拿掉（`World.openArena`），Boss 的攻擊不會一直被物件擋住；需要掩體的打法（電磁砲台、推土要塞）靠留下的物件、地形特徵與場地變化的新掩體。

## 6. 分期

1. **共用架構**：刁鑽度、A、D（減傷與破綻框架）、I（打斷量表）、K（破甲充能與 Boss 戰的雜兵小隊）、L、O、HUD、多人同步、說明文字。
2. **部位、打回去、應對、場地的工具**：J（部位停用招式、重建、掉落）、M（打回去的彈體、反擊點）、C（四種習慣的偵測）、E（換型態的場地變化）。
3. **第 1、2 章的 Boss**（BASTILLE、SANDWORM、JUGGERNAUT、HALBERD、HELIOS、BEHEMOTH、CITADEL、CINDER）：各自的專屬內容與截圖。
4. **第 3、4 章的 Boss**（STRIDER、MIRAGE、PULSAR、ARACHNE、CERBERUS、NULLIFIER、JUDGEMENT）。
5. **第 5、6 章的 Boss**（AEGIS、LEVIATHAN、VIPER、DUO、SERAPHIM、DOPPEL、BALTEUS），以及周目與殘響 Boss 的檢查。
6. **收尾**：CLAUDE.md 同步、冒煙測試（每隻 Boss 的部位、打斷、破綻、打回去都觸發一次）。

每期做完測完就 build、commit、push，直接接下一期。

## 7. 實作紀錄（原 boss-handoff.md，2026-10-30 全部完成）

### 相關的程式

| 東西 | 位置 |
|---|---|
| Boss 定義、強度常數、`BOSS_DEFS`（22 隻的順序）、`PART_DEFS`、`bossForLevel` | `src/data/enemies.js`（約 26～720 行） |
| 主線哪一章打哪一隻 | `src/data/campaign.js` 的 `SORTIES`（區段的 `boss:`，`echo: true`＝殘響） |
| Boss 生成（`spawnBossDef`） | `src/game/mission.js` |
| 新 Boss 的生成、部位、`bossPhaseTick`（換型態、狂暴、增援） | `src/game/bosses.js` |
| 第三批 Boss 的場上判定（`later`、`addPool`、`pulseRing`、`beamAttack`） | `src/game/bosses2.js` |
| 型態、節奏、`bossTick`（不用 move 的實體）、失衡後保護、`partBreak`、`bossDefense` | `src/entities/mech-boss.js` |
| 第三批 Boss 的行為、`boss2Defense` | `src/entities/mech-boss2.js` |
| 最終型態的專屬招式 `SPECIALS`／`boss3Tick` 與共用零件 `b3*` | `src/entities/mech-boss3.js` |
| 一般大型 Boss（JUGGERNAUT、STRIDER、BALTEUS；HELIOS 是 kind heli）的 `bossAI` | `src/entities/mech-entity.js` |
| 受傷、ACS、失衡（Boss 1.5 秒）、`stagGuardT` | `mech-entity.js` 的 `takeDamage`（約 1860～2100 行） |
| 防禦掛勾的順序 | `specialDefense`（`mech-special.js`）→ `bossDefense` → `boss2Defense` |
| 完美 QB、反擊提示 | `mech-entity.js` 的 `pqbCheck`、`cueTick` |
| 風格評價 | `src/entities/mech-style.js`（`syAdd`…）、HUD `src/game/style-meter.js` |
| 可以打掉的投射物 | `src/entities/projectile.js` 的 `shootable`、`src/game/hazards2.js` |
| 區域效果、臨時障礙物 | `src/game/hazards2.js` 的 `addZone`、`addTempWall` |
| 掉落物 | `src/world/map-extras.js` 的 `PICKUP_DEFS`、`dropAmmo` |
| 橫幅、傷害數字、BREAK | `src/game/juice.js`、`src/game/textfx.js` |
| 主線結算、三選一 | `src/game/campaign.js` 的 `campEnd`、`src/game/tactics.js` |
| Boss 的程式模型（部位要掛的節點 `mounts`） | `src/render/boss-models.js`、機甲型 Boss 用 `buildMech` |
| 快照、事件、房主遷移 | `net/snapshot.js`、`game/mp-host.js`（`hostTick`、`promoteToHost`）、`game/mp-client.js` |

### 要注意的坑

- **多人是房主權威**：判定只在房主；新的狀態（打斷量表、破綻、反擊點、應對中的習慣、刁鑽度、評價、破甲充能）要進快照或事件，客機只顯示；房主遷移時狀態機從頭開始也要能接手。改了協定要提高 `net/transports.js` 的 `NET_VERSION`。
- **ACS 失衡的時間**：Boss 的 ACS 失衡只有 1.5 秒，A 的表是在這個基礎上縮短；各 Boss 自己的長硬直（撞牆 5 秒、倒下 7 秒…）不受 A 影響。
- **既有的弱點倍率**（`bossDefense`／`boss2Defense` 裡的 ×0.3、×1.7…）：有刁鑽度時改成 D 的「平時倍率＋破綻 ×1.6」；用部位擋住本體的（發生器、砲台、引擎、斷腳）照舊。
- **部位的模型**：新的部位要掛在 Boss 模型的節點（`mounts`）上；`render/boss-models.js` 的模型如果經過網格合併，會動或會被拆的節點必須掛在 rig 上（見 CLAUDE.md 的「網格合併」規則），`visible` 一律給布林。
- `bossVis` 是位元旗標，讀寫都用位元運算，不要用 ===。
- 鎖定、HUD 略過 `noLock` 的目標；新部位要能被鎖定。
- 版面：新的 HUD 要用三種大小截圖（1920×1080、1180×820、844×390 觸控）。

### 測試

- 現有的 Boss 測試：`testBosses`、`testBosses2`、`testBossPower`、`testBoss3`、`testMpBosses`（`:halberd`／`:citadel`／`:mirage`／`:cerberus`），都在 `scripts/smoke-test.js`；`SMOKE_ONLY=testBossPower npm test` 只跑一項。改了 Boss 的數值後這些測試的預期值可能要跟著改（例如防禦倍率）。
- 改版的測試：`testBossTier`（刁鑽度的換算、A／D／I／K／L／O）、`testBossTier2`（部位、打回去、應對、場地的共用框架，`g.bossKit = () => null`）、`testBossKit12`／`testBossKit34`／`testBossKit56`（各章 Boss 的部位與機能、三個大招都打斷、打回去、場地、四種反制，截圖 `test-results/boss-<種類>-kit.png`）、`testBossField`（場地效果，截圖 `boss-field-<種類>.png`）；舊的 Boss 測試以 `g.tierTestOff = true` 檢查原本的機制。

### 各期的實作

第 1～6 期（ab0c28f、ecef294、1ba92c8、09d3d82、93c456e、0cf2391）＋使用者 2026-10-30 追加的第 7 期部位造型（be19cbc）、第 8 期場地效果（536a5dd）、第 9 期開場介紹（9fa204e）。

#### 第 1 期的實作

- **檔案**：`src/data/boss-tier.js`（`TIER[1..8]` 的全部數字、`campaignTier`／`freeTier`／`aNeedK`／`aStagT`／`oRank`／`kSquad`）、`src/entities/mech-boss-tier.js`（A、D、I、K 的破甲彈、L 的加成、同步 `serTier`／`tierView`、破綻光環 `tierFx`）、`src/game/boss-tier.js`（K 的雜兵小隊與充能、O 的評價與獎勵、`tierIntro`、HUD `tierHud`）。網路版本 `11.8`。
- **刁鑽度的來源**：`spawnBossDef(bd, sh, sd, tier)` 的第 4 個參數（沒給時照自由出擊的索引；`0`＝不套用，靶場傳 0）→ `this.spawnTier` → `spawnEnemy` 給 `isBoss` 的實體設 `opts.tier` → 生成紀錄 `bt`。主線在 `campSpawnType`（`campaignTier`），模擬器照 `simSeen().bossT[kind]`（主線第一次遇到時 `simMark('bosses', kind, tier)` 記下），自訂關卡照 BOSS_DEFS 的索引。`g.tierTestOff = true` 時生成的 Boss 不套用（舊的 testBosses／testBosses2 用它檢查各 Boss 原本的機制）。
- **A**：`takeDamage` 的過載門檻乘 `tierAcsK()`，失衡秒數 `tierStagT(1.5)`（計入 `bt.stagN`）；`bossPhaseShift` 呼叫 `tierPhaseReset`。打斷與破甲彈直接設 `staggerT`，不算次數。
- **D**：`bossDefense` 最後乘 `tierDmgK()`（破綻 1.6、平時 `dBase`），**只改傷害、不改衝擊**。破綻＝`bt.openT`（`bossOpen(秒)`）或 `boss2Open()`（第三批 Boss 原本的弱點時機：散熱、爐口、冷卻、回收充能、過熱、撞牆、掉頭／失速、鍋爐過熱）。這 8 隻的 `boss2Defense` 在有刁鑽度時回傳 1（推土要塞保留正面 0.6／背後 1.3），原本的倍率只在沒有刁鑽度時用。大招收招 `tierMoveEnd(id)` 依 `dWhich` 決定（'two'／'one' 的招式清單先用 `OPEN_DEF`，第 3～5 期由 `BOSS_KIT` 的 `open2`／`open1` 覆寫；`game.bossKit(key)` 還沒有實作，`tierKit()` 回傳空物件）。
- **I**：`updateAI` 有刁鑽度時改呼叫 `tierTick`（第三型態的專屬招式也走這裡，沒有刁鑽度時照舊 `boss3Tick`）。每個型態先等 `I_CD[0]` 秒、之後每 `I_CD[1]` 秒蓄力一次；第一、二型態的大招先放在 `mech-boss-tier.js` 的 `BIG`（名稱照設計文件，內容是共用零件組成的暫代版本），第三型態＝`boss3Spec()`。**第 3～5 期把 `BIG` 換成每隻的專屬招式**（`BOSS_KIT[key].big`）。量表：本體與部位的 `takeDamage` → `tierGauge`；刁鑽度 3～4 後退／升高、5～6 正面護盾（`tierGuardK`，傷害與量表 ×0.25）、7～8 連續兩次（只斷一次＝`halfT` 讓 `b3Dm` 減半）。
- **K**：`onEnemyKilled` → `tierOnKill` → 玩家實體的 `bkAdd`（`this.bk`，快照 `bk` 給客機）；破甲彈在 `tierHitMods`（只打本體）。小隊在 `bossPhaseTick` → `bossTierTick`（`spawnType(..., null, 1)` 一台一台）。
- **L**：`tierHitMods` 依風格評價等級加成（本體與部位）；`syHurt` 在 Boss 戰中掉 `lDrop` 級、`syAdd` 重複的加分乘 `lRepeat`。
- **O**：最後一個 Boss 的 `die` → `tierBossRank`（`bossRank`），橫幅與 `bossDown` 事件帶評價；擊破獎金乘 `tierBountyK`；結算畫面多一列「Boss 擊破評價」；主線評價 S＝`camp.bossS` → `campEnd` 多一個三選一（`modPickQ` 排在 `endPick` 之後；**只有單人與房主**，客機沒有）。
- **第 1 期當時還沒做的**（J、M、C、E、每隻 Boss 的 `intro` 多一句、`BOSS_KIT`、每隻的 `par`）：已在第 2～9 期完成，見下面各期。

#### 第 2 期的實作

- **每隻 Boss 的資料**：`src/data/boss-kit.js` 的 `BOSS_KIT[key]`（現在是空的，第 3～5 期逐隻補）＋`C_STAR`（刁鑽度 1～2 偵測的那一種習慣，已照設計文件的★填好）。`MechEntity.tierKit()` → `game.bossKit(key)`。欄位說明寫在檔頭（`parts`、`reflect`、`open2`／`open1`、`big`、`field`、`counter`、`star`、`habits`）。
- **J 部位**：`tierSetupParts(b)`（spawnBossDef 的最後）補到 `jParts` 個；原本就有部位的 Boss（`J_KINDS`：砲台、引擎、發生器、腳部關節、懸吊砲塔、列車車廂；浮游砲整群算一個）只補不夠的。還沒有 `BOSS_KIT.parts` 的用 `GENERIC_PARTS`（左肩／右肩／背部，各停用 p1／p2／p3）。部位是 `partKind 'bpart'` 的實體（模型暫用腳部關節），`opts.off`＝Boss 座標的偏移（Boss 身高的倍數，+Z 往前，`partFollowOff`）、`opts.hpAbs`＝血量（Boss 的 `jHp`）；生成紀錄帶 `off`／`ha`。`tierExpose` 的部位在 Boss 沒蓄力、沒破綻時 `bossVis` 1（隱藏、`noLock`、打不到）。打壞：`onEnemyKilled` → `tierPartDown`（`bt.lost` 停用 `stops` 的招式、掉 `bossPart`、`tierPartsBroken` → 結算 `tierPartsK()`），刁鑽度 5 起 `tierReb` 重建（7～8 換招）。刁鑽度 1～2 的部位在 HUD 有黃色菱形與名稱。
- **M**：Boss 與部位的 `foeShotOpt(dmg, kind)` → `tierShotOpt`（金色、`reflect`＝Boss id、`hitsNeed`；刁鑽度 5 起 35% 是紅色的假彈、不能打）。`damageProp`／`shotDamage` 多了第 5 個參數 `from`（射擊、雷射、近戰、投射物都有傳）；打掉時 `tierReflect` 生成一顆追著 Boss 的彈（最大 AP 1.5%、ACS 上限 60% 的衝擊）。刁鑽度 7～8 離 Boss 25 m×DS 以外打掉的，Boss 在快到時 `tierDodgeTick` 躲開。反擊點：`pqbCheck` → `from.tierCounterOn(玩家)` → `bt.cp`；那個玩家下一次打中＝傷害 ×2、打斷量表 ×2（`cpHitK`），HUD 是 Boss 頭上的藍字、Boss 身上的藍光。
- **C**：`tierHabitTick`（在 `tierTick` 裡）每 0.25 秒取樣目標玩家：離地 4 m×DS、15 m×DS 內、60 m×DS 外、`losBlocked`；超過 `C_THR` 就應對 12 秒，期間每 4 秒 `tierCounterMove`（`BOSS_KIT.counter[習慣]` 或共用的：對空掃射、衝擊波、砲擊、曲射）。HUD `#bossHabit`。同步在 `bt` 的第 7 格（位元）。
- **E**：`bossPhaseShift` → `tierFieldShift(b, ph)`（`BOSS_KIT.field[ph]` 是函式時用它）：有利＝3 道岩牆＋2 個彈藥箱；不利＝3 處燃燒地面＋（第三型態或刁鑽度 7～8）煙霧，7～8 的煙霧跟著 Boss（`bt.fzone`）；刁鑽度 5 起第二型態作戰區域縮到 75%（`world.zoneGoal`，客機收到 `tzone` 直接套用）。`tierFieldTick` 在 `bossTierTick` 裡（重建、移動的區域、`tickZone`）。**縮小的修正**（2026-11-07 使用者回報：洋上都市「海底電纜塔」的雙 AC 關作戰區域超小、敵人在區域外打不到）：`tierShrinkZone` 一律以縮小前的區域（`world.zoneBase`，`setZone` 清掉）計算、同一場只縮到最小的那一次（雙 AC 兩台各換型態以前會疊成 0.7×0.7），中心＝活著的 Boss 與玩家的中間（以前是地圖中心）；縮小後在區域外卡住 2 秒以上的敵人由 `tierZoneRescue` 移到區域內最近的實地——虛空地圖上電腦機體被 `collide` 夾進區域會落到海面，`voidCheck` 又拉回區域外的平台，每格來回卡住。冒煙測試 `testBossZone`。
- 測試：`testBossTier2`。

#### 第 3 期的實作

- **`BOSS_KIT` 已填**：artillery、worm、JUGGERNAUT、railgun、heli、rampart、train、furnace（`src/data/boss-kit.js` 的 `K1`）。每隻有 `tip`（開打 5 秒後的說明）、`parts`、`open2`／`open1`、`big`（第一、二型態的大招，取代 `mech-boss-tier.js` 的暫代 `BIG`）、`reflect`、`field[2]`／`field[3]`（函式 `(g, b, T)`）、`counter`（四種）、需要時 `canCharge`（鑽地蟲只在鑽出來時、列車不在隧道時）。
- **部位的機能**（`parts[]`）：`stops`（停用大招）、`flag`（各 Boss 的 AI 用 `b.tierFlag(flag)` 看）、`slots`（停用武器：`fire()` 看 `w.tierOff`）、`speedK`、`hoverK`；`tierPartLost(sp, on)` 統一處理，重建時（`tierSpawnPart(..., true)`）才恢復。部位數的計算改成「原本就有的部位一種算一個」（四座砲台＝1、四節車廂＝1）。
- **接到各 Boss 的 AI 的機能**：BASTILLE 的 `lead`（砲台與 `b3Rain` 不預判）／`mines`（不補布雷無人機）；SANDWORM 的 `track`（鑽出點不追）／`bite`（沒有地下衝刺）、鑽出撲空＝停留 +2 秒＋破綻；JUGGERNAUT 衝撞撞空＝破綻；HALBERD 的 `aim`／`cap`／`vent`；BEHEMOTH 的 `blade`／`side`／`exhaust`、衝撞落空＝破綻；CITADEL 的 `valve`；CINDER 的 `slag`／`flame`／`hinge`。`b.tierRush()`＝一般大型 Boss 的突進或推土要塞的衝撞（大招與應對用）。
- **打回去**：`tierReflects(kind)`（`reflect` 沒寫時：飛彈、榴彈、砲彈；迫擊砲彈 `'mortar'` 要寫明）；`mortarShot` 也會帶 `tierShotOpt`。CINDER 的 `reflectPool`：打掉的熔渣落在它腳下變成燃燒地面。
- **打斷量表**：本體被自己的裝甲（`bossDefense` 的 k，例如 BASTILLE 砲台在時 ×0.12）擋掉的部分也算（`tkArmor`），否則有部位擋住本體的 Boss 打不斷。
- 場地的小工具：`g.tierWalls(b, n, o)`、`g.tierPools(b, n, 'player'|'boss'|'line', R)`、`g.tierSmoke(b, R, follow)`、`g.tierShrinkZone(k, at)`。
- 測試：`testBossKit12`（`testBossKit(browser, base, [[等級, 標籤], …], 名稱)`：部位與機能、三個大招都打斷、打回去、場地、四種反制、截圖 `test-results/boss-<種類>-kit.png`）；`testBossTier2` 以 `g.bossKit = () => null` 只測共用的框架。

#### 第 4 期的實作

- `BOSS_KIT` 加上 STRIDER、phantom、ibis、spider、trinity、hunter、orbital（`K2`）。新的欄位：部位的 `weak`（負責的大招放出時減半：`bt.lostW` → `halfT`）、`kit.onLost(g, b, sp)`（STRIDER 兩隻前腳都壞了跪下 6 秒＋破綻）。
- 接到 AI 的機能：ARACHNE 倒下與跳躍落地＝破綻、背部砲塔 `mines`（`b3Mines` 都看這個旗標）；NULLIFIER 的 `coil`（EMP 範圍 20 → 12）／`anchor`（沒有牽引）、EMP 放完＝破綻；JUDGEMENT 的 `antenna`（光柱追得慢）／`relay`（沒有格子砲擊）；MIRAGE 的 `cloak`（迷彩時間 ×0.55）／`holo`（分身最多 1 台）、現形開火結束＝破綻；PULSAR 的 `wingL`／`wingR`（各少一種招式）／`ring`（能量環變慢），能量環被 QB 的無敵時間穿過＝反擊點（`bosses2.js` 的能量環判定）；CERBERUS 分離的瞬間＝破綻，`alpha`／`beta`／`gamma` 讓分離後那一台變弱（武器 `tierOff`、`repairOff`）。
- `canCharge`：ARACHNE 要在地上、CERBERUS 分離中（本體藏起來）不蓄力。
- 測試：`testBossKit34`。另外修正 testBosses 的 NULLIFIER 牽引檢查（玩家放在距離下限上，時有時無）。

#### 第 5 期的實作

- `BOSS_KIT` 加上 flagship、fortress、interceptor、duo、funnel、mirror、BALTEUS（`K3`），22 隻都有了。新的欄位：部位的 `on`（雙 AC：名稱開頭符合的那一台才有這個部位）、`kit.onStag(b)`（Boss 被 ACS 打出失衡時；雙 AC＝另一台 2.5 秒破綻）。
- 接到 AI 的機能：AEGIS 發生器重建中＝破綻；LEVIATHAN 引擎全毀降下＝6 秒破綻、下方砲台 `weak`（全彈發射減半）；VIPER 的 `wing`（掉頭 2.6 → 4 秒）／`gun`（掃射 3.2 → 1.8 秒）；SERAPHIM 的 `bay`（浮游砲少 3 座）；BALTEUS 的脈衝裝甲（第一型態的大招 `tierArmor(比例, 秒)`：打破之前只有 30% 打得進去，打破＝破綻；`bossDefense` 的 `tierArmorK`）。
- 周目與殘響 Boss：`testCycle3` 檢查殘響 Boss 是 8、同一區段不殘響化時是章 +2（第 3 周目）。
- 測試：`testBossKit56`；`testBossKit` 的打斷在本體被護盾或裝甲擋住時改打部位（部位的傷害也算進量表）。

#### 第 7～8 期的實作（使用者 2026-10-30 的回覆：部位的模型、場地效果都要全新設計）

- **部位的造型**：`render/boss-models.js` 最後的 `BP`（43 種）＋`BP_CATALOG`，登記成 `BUILDERS['bp_<種類>']`；`BOSS_KIT` 的 `parts[].model` → `tierSpawnPart` 給 `spawnPart` 的 `vehKey`（`size`＝模型倍率）。會轉的節點掛在 rig 的 `rotor`，`bossFx` 裡各端自己轉。模型庫的 `vehicle/bpart_<種類>`。
- **場地效果**：`game/boss-field.js`（判定與同步）＋`render/boss-field-models.js`（外觀）。`bfAdd(種類, 位置, 半徑（世界）, 秒, o)` 只在房主，客機收 `bfadd`／`bfst`／`bfmv`／`bfrm`／`bfdark`；房主每格 `bfTick`（在 `updateHazards` 開頭），外觀 `bfVis`（`renderMain`，各端）。移動的效果在 `MechEntity.move` 的 `bfMove`（客機的自身預測也算）、鎖定距離 `bfLockK`（`player.js` 的 `lockReach`）、視線 `World.losHook2`、燃燒地面的安全區 `bfSafe`（`bosses2.js` 的燃燒地面判定）。不會移動的圓盤用 `conformField` 貼著地形（只貼附近高度的表面，不爬上高物件）。掩體的新種類（berm／rubble／crate／pillar／slab）走 `addTempWall`（碰撞、血量、同步照舊，外觀 `buildCover`）。`clearMission` → `bfClear`。
- `BOSS_KIT` 的 `field` 統一寫在 `data/boss-kit.js` 後面的 `FIELD`；共用的 `tierWalls`／`tierPools`／`tierSmoke`／`tierFieldGood`／`tierFieldBad` 都改用新效果。
- 測試：`testBossField`（每種效果的判定、客機的事件、清除、截圖 `boss-field-<種類>.png`）；`testBossKit` 的場地計數改看 `g.bfs`。

#### 第 9 期的實作

- 每隻 Boss 的破綻與部位寫進 `data/enemies.js` 的 `BOSS_DEFS` 的 `intro`（原本的打法說明保留，22 隻都有；JUGGERNAUT、HELIOS、STRIDER、BALTEUS、雙 AC 原本沒有，補上）。開場顯示：新 Boss 照舊在 `spawnBossKind`，一般大型 Boss、直升機、雙 AC 在 `spawnBossDef` 的最後。拿掉開打 5 秒後的 `tierTip` 與 `BOSS_KIT` 的 `tip`；作戰室簡報的敵情也用 `intro`，所以一起更新了。
