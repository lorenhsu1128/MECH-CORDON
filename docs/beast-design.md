# 獅型機獸（原創設計，之後當敵人／Boss）

2026-11-19 起。使用者定案：原創設計（不重製既有作品的機體），之後當 Boss（精英版挑幾招用）；模型與動作先放模型庫的「暫時」分類檢查。
還沒接進遊戲：AI、判定、血量、多人同步是另一份設計。

## 模型

- 格式和機甲的程式模型相同：基本形體清單（`render/proc-prims.js`）、色槽 main／sub／joint／acc＋固定色（眼睛與噴口自發光、牙爪亮鋼、槍鐵）。
- `render/proc/beast_kit.js`：手寫清單的建模工具（凸包 `hull`、放樣 `loft`／`tubeRings`、貼著放樣表面的裝甲板 `panel`、旋轉體 `lathe`、`box`、`cyl`…），純函式。
- `render/proc/beast_lion.js`：各區塊的清單 `lionDef()`。31 個區塊、原點在各自的轉軸、站姿＝旋轉全 0：
  胸（根）、腰臀、頸、鬃甲兩層（`mane_a`／`mane_b`）、頭、下顎、砲塔、砲、四肢各 4 節（前腳 upper／fore／meta／paw，後腳 thigh／shin／meta／paw）、尾 5 節＋尾端。
  左側（glTF +x）建模、右側＝鏡像。
- 大小照自然界的比例（機甲 9.72 m＝人 1.75 m，×5.55）：肩高約 6.7 m。
- 比例的調整集中在 `lionDef` 的 `tf`（使用者定案的數字）：後半身往前 `REAR`、頭往後 `HEADBACK`、整條腿以肩／髖為中心放大 `LEG_K`、往外移與往外張 `sh`。
- `render/beast-lion.js` 的 `buildLion(pal, scale, pose)`：組成關節群組的階層（遊戲座標 −Z 正面），回傳 `{ group, nodes, piv, eyeMat }`。
- 繞 X 的旋轉：正的＝往前的東西往上抬（頭抬起＝正、下顎張開＝負、尾巴揚起＝負）。

## 劍齒虎型機獸（`render/proc/beast_tiger.js` 的 `tigerDef()`、`buildTiger`）

2026-11-19。同樣是原創設計（參考同類機獸的風格與比例的大方向，不照抄既有機體的辨識特徵）。

- 和獅型的差別：沒有鬃甲、身形低伏而修長（腿壓低 8%、後半身較長）、頭是一塊一塊的重裝甲（使用者定案的方向，2026-11-19 第三版；豹頭的流線版被否決）：方正的顱與吻、壓在眼睛上方的厚額甲、兩頰的大片護甲與橫向散熱縫、眼睛是額甲與頰甲之間一條斜的細縫、楔形的耳、兩頰的鰭、長劍齒（兩段、齒座強調色）、
  背與頸的條紋（`stripe`：橫過背甲的強調色凸條）、肩上一對飛彈莢艙（`turret` 偏航、`guns` 俯仰）、臀部較大的噴嘴、尾端是上下兩片穩定翼、眼睛紅色。
- 四肢與尾巴的節沿用獅型的零件（`beast_lion.js` 的 `LION_PARTS`），以 `tf` 調比例（前肢特別粗壯）；組裝工具 `assembler()` 兩隻共用。
- 區塊名稱和獅型相同（沒有 `mane_a`／`mane_b`），動作 `animateBeast` 共用。
- 模型庫：`temp/tiger_stand`、`temp/tiger_stand_w`、`temp/tiger_anim_idle`／`walk`／`run`。

## 動作（`render/beast-anim.js` 的 `animateBeast(rig, st, dt)`）

使用者定案：厚重為主、只有撲擊是突然的爆發；撲擊時臀部的推進器會噴（特效還沒接）；攻擊片段先寫在程式裡。

- 輸入 `st`：`t`、`v` 前進速度、`w` 轉向速度、`act: { name, t }` 動作片段、`gy` 各腳的地面高度差、`aim` 砲塔的 [偏航, 俯仰]。
- 步伐：依相位算每隻腳的落點，腿用兩段骨頭的解析解（掌骨騰空時往後收）；走（四拍）／小跑（對角）／奔跑（前後各一組、脊椎伸縮），
  速度門檻 `TROT_V` 7.5、`RUN_V` 16 m/s（接成敵人時配合實際的移動速度調）；轉身時腳照所在位置相對地面的速度橫踏。
- 動作片段 `BEAST_CLIPS`（關鍵影格、頻道的說明在檔案裡；跳躍、撲擊、爪擊起手時前半身要明顯揚起，爪擊的腳掌先翹起約 45° 再往下扣：使用者定案）：`brake` 急停、`jump` 跳躍與落地、`pounce` 撲擊、`clawL`／`clawR` 爪擊、`bite` 咬、
  `tail` 甩尾、`roar` 咆哮、`hitL`／`hitR` 小受擊、`stagger` 失衡、`death` 擊破（停在最後一格）。每招的預備就是預警（鬃甲張開、眼睛變亮）。
- 片段要整隻移動的量在 `rig.rootY`／`rig.rootF`（遊戲的實體自己用；預覽 `st.root` 直接套在整隻上）。
- 貼地形：`st.gy` 的高度差 → 腳的落點、身體的高度、俯仰、側傾（腳掌還不會貼齊坡面的法線）。

## 在哪裡看

模型庫的「暫時」分類：`temp/lion_stand`、`temp/lion_roar`、`temp/lion_stand_w`（模型）與 `temp/lion_anim_*`（動作，原地播放；
`built.tick` 由檢視窗與格狀檢視每格呼叫）。連拍總表：`node scripts/beast-shots.js temp/lion_anim_walk …`。

## 還沒做

- 接成敵人／Boss（AI、判定、招式的傷害與預警圈、多人同步）、網格合併（現在約 170 次繪製）、推進器與落地的特效、音效。
- 身體大面的細節密度。
