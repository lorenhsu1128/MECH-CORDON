# 改名：MECH CORDON（機戰封鎖線）

> 狀態：5 期全部完成（2026-11-10）。原因：舊名 RUBICON PROTOCOL 與文案沿用太多《機戰傭兵6》的專有名詞（作品名、角色、Boss、零件型號、地名、系統縮寫），改成自己的名稱。
> 做法：分 5 期，每期測完各自提交。第 5 期（語音重產）最後處理：在那之前改過的台詞沒有語音（語音以台詞文字的雜湊找檔案）。

## 一、定案

| 項目                   | 舊                                                             | 新                                                                                        |
| ---------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 遊戲名稱               | RUBICON PROTOCOL                                               | **MECH CORDON**（中文：**機戰封鎖線**）                                                   |
| 程式與檔案裡的 rubicon | `rubicon_*`、`rubicon-*`、`RUBICON_*`                          | `mech_cordon_*`、`mech-cordon-*`、`MECH_CORDON_*`（全部改，舊資料用標題的「轉換舊存檔」） |
| 發佈檔                 | `rubicon-protocol.html`、`rubicon-server.exe`、`rubicon-cert/` | `mech-cordon.html`、`mech-cordon-server.exe`、`mech-cordon-cert/`                         |
| 分享檔的副檔名         | `.rubicon-set`、`.rubicon-level`                               | `.mech-cordon-set`、`.mech-cordon-level`（舊副檔名照樣能匯入）                            |
| 劇情的協定             | 盧比孔協定（Rubicon Protocol）                                 | 封鎖線協定（Cordon Protocol）                                                             |
| 核心資源               | Coral                                                          | 深脈（Deepvein）；顏色維持紅色                                                            |
| 主角                   | 編號 621 的強化人類                                            | 登錄號 R-07（強化人間計畫 → 鑰匙計畫）                                                    |
| AC                     | AC（具名 AC、敵對 AC）                                         | 機甲／MECH（具名機甲、敵對機甲、HOSTILE MECH、ALLY-MECH）；日文語音唸「機体」             |
| MT                     | MT                                                             | 步行機／WALKER（「重踏機甲」改成「重踏步行機」，避免和機甲混淆）                          |
| COAM                   | COAM                                                           | SP（結算點）                                                                              |
| ACS                    | ACS                                                            | BAL（平衡系統）                                                                           |
| 脈衝裝甲               | 脈衝裝甲                                                       | 斥力裝甲                                                                                  |
| 渲染風格               | 機戰傭兵 6                                                     | 重裝寫實（其他風格的名稱不改）                                                            |
| 追尾視角的說明         | 機戰傭兵6 式                                                   | 背後視角                                                                                  |

不改的通用詞：AP、EN、QB（快速推進）、突擊推進、失衡、FCS、發電機、委託、周目、傭兵、封鎖。

### 名稱對照

- 友軍的隨機名 `AC_NAMES`：HALYARD、CANTOR、OSPREY、LANTERN、MARROW、SEXTANT、TINDER、MERIDIAN、TALLOW、GANNET、PIKE、ROOK、SPARROW、CAIRN、THRUSH、CORVID（KESTREL、BRANT 給雙機 Boss 用）。宿敵的隨機呼號 `NEM_CALLS` 的 RUST 改成 SCRAP（避免和 OXIDE 混淆）。
- 具名機甲：NIGHTFALL → DUSKWARD；IGUAZU & VOLTA → KESTREL & BRANT（說話者 id `iguazu`／`volta` 不改）。
- 玩家預設機體名 RAVEN → KEYSTONE；宿敵 RUST → OXIDE；Doser → 掘骸者。
- Boss（只改名、不換招式）：JUGGERNAUT → MONOLITH、STRIDER → TETRARCH、BALTEUS → ARCHON、武裝直升機 HOUND → HARRIER。
- 零件：MELANDER（HD／BD／AR／LG-011）→ GRANITE（-100）、NACHTREIHER → WISP、LG-KASUAR → LG-JACKAL、BST-G1／G2／FLUEGEL → BST-100／200／PINION、GN-VP20／VE20B／DF-GA → GN-C20／C40H／QC、FCS-ABBOT／OCELLUS／TALBOT → FCS-LEDGER／SPYGLASS／CLINCH、RF-024 → RF-31、MG-014 → MG-18、SG-027 → SG-33、LR-036 → LR-40、PB-033 → PB-37、HG-020 → HG-22（零件 id 與 GLB 槽位不變）。
- 地名：洋上都市 Xylem → Reefhold、巨型構造體 Grid 086 → Lattice-9、地下技研都市 → 地下研究特區、多重水壩 → 階梯水壩、汙染水沒市街 → 汙染淹沒城區（主題 id 不變）。

## 二、分期

1. **程式內部改名＋舊存檔轉換工具**：所有 rubicon 的識別字、存檔鍵、IndexedDB 名稱、全域變數、檔名、資料夾（`mech_cordon_apng_gen/`、`mech_cordon_paint/`、`mech-cordon-cert/`）、伺服器設定檔與環境變數、副檔名；畫面上的遊戲名稱。標題的「轉換舊存檔」（`game/legacy.js`）。
2. **系統用語**：AC／MT／ACS／COAM、脈衝裝甲、渲染風格與追尾視角的說明。
3. **名稱**：名單、Boss、零件、地名、RAVEN／RUST／Doser。
4. **劇情**：封鎖線協定、深脈、R-07 與鑰匙計畫（`story.js`、`story-comms.js`、`data/cine/`、`docs/story-script.md`、標題的說明）。
5. **語音**：`node scripts/voice-lines.js && python scripts/voice-gen.py`（中文與日文；日文「AC」唸「機体」）。

## 三、相容

- 舊的資料（localStorage 的 `rubicon_*`、IndexedDB 的 `rubicon-*`）不會自動搬：標題畫面的「轉換舊存檔」列出找到的舊存檔（三個槽位與更早的單一存檔），各自轉存到新的槽位（覆蓋前確認），並可以一次轉換設定與資料庫（模型庫、自訂關卡、參考圖、貼圖繪製的自動存檔：照舊資料庫的版本與結構建立新資料庫後複製每一筆）；也可以讀舊版匯出的存檔檔案。舊資料保留，轉換後可以刪除。
- 檔案格式：GLB 的原點節點 `rubicon_origin`、貼花 `extras.rubicon_decal` 照樣讀得到（新寫入的是 `mech_cordon_origin`、`mech_cordon_decal`）；匯入存檔、模型組、關卡、風格、眼動追蹤設定組合時舊格式照樣接受。
- 伺服器：找不到 `mech-cordon-server.json`、`mech-cordon-cert/` 時讀舊的 `rubicon-server.json`、`rubicon-cert/`；環境變數 `MECH_CORDON_*` 沒設時看舊的 `RUBICON_*`；舊網址 `/rubicon-protocol.html` 照樣開遊戲。
- 多人協定版本提高（新舊版本不互連）。

## 四、實作紀錄

- **第 1 期**（`93514dff`）：依序取代 `rubicon-protocol.html` → `mech-cordon.html`、`RUBICON PROTOCOL` → `MECH CORDON`、`RUBICON_` → `MECH_CORDON_`、`rubicon_` → `mech_cordon_`、`rubicon-` → `mech-cordon-`（外部版本庫網址 `lorenhsu1128/rubicon-*` 與劇情的「Rubicon Protocol」除外）；GLB 素材裡的產生器名稱一起改寫（改 JSON 區塊、重新補齊 4 的倍數）。之後加回的舊名稱（相容與 `game/legacy.js`）是刻意的，**不要再做一次全域取代**。協定 11.41。
- **第 2 期**（`af26da2c`）：只改字串字面值（acorn 斷詞，正規表示式與巢狀模板字串才不會誤判）與 HTML 文字；新詞和中文相鄰時拿掉中間的空白。HTML 裡被換行拆開的句子（「組裝你的 AC」）要另外接起來，否則換行變成空格。字串整個就是 `'AC'` 的另外處理：機體的預設名稱 `MECH`、格納庫的貼圖 `MC-01`。通訊條件 `killedBy` 用「包含」比對，所以 `'步行機'` 一樣對得到「輕型步行機」。
- **第 3 期**（`b1c13cb9`）：Boss 名稱的開頭在很多地方當鍵（專屬招式 `SPECIALS`、`BOSS_KIT`、部位、`gear-loot`、主線的 `boss`、`killedBy`），整個字一起取代；模型庫的 Boss 機甲槽位從名稱算（`boss_monolith`、`boss_kestrel`…）。內部 id（`nightfall`、`rust`、`iguazu`、主題 id）不變，存檔不用遷移。
- **第 4 期**（`ca7fc135`）：「重新長滿」改成「重新湧回地表」；序章 Logo 的副標＝機戰封鎖線。
- **第 5 期**：中文與日文各重產 ECHO 兩個聲音 76 句與其他角色 13 句（VoxCPM2，conda 環境 rubicon-voice）。語音以台詞文字的雜湊（`vkey`）找檔案，改過的台詞是新的鍵；固定鍵（`s_aceDown`、`s_waveAc`、`b_spot1`…）台詞改了鍵不變，要刪掉舊的 mp3 才會重產；建置會把資料夾裡全部的 mp3 打包，所以不再用到的鍵的 mp3 也刪掉。日文台詞（`lines-ja.json`）以「改名前的句子套同一組規則＝新句子」找回原本的翻譯，再換日文的名稱：機体、歩行機、ビーエーエル（BAL）、ラティス・ナイン、リーフホールド、深脈（しんみゃく）、封鎖線協定、改造パイロット、ケストレル、ブラント、オキサイド、モノリス、テトラーク、アルコン、残骸掘り；`@yomi` 補上新詞的讀音，`JA_DISP` 換成新的片假名。
