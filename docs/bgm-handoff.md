# AI 配樂的交接（2026-11-14）

給接手產生配樂的電腦（RTX 4070）。設計與定案見 `docs/audio-design.md` 的「AI 配樂」與「配樂產生器」；這份只寫怎麼接著做。

## 現況

- **完成**：112 首的規劃與日文歌詞（`scripts/bgm_songs/c1.json`～`c8.json`，共用設定 `common.json`）、產生／評分／平時版／打包的工具、遊戲端的選曲（`game/bgm.js`）、AI 配樂試聽（依章、產生中的曲子）、配樂產生器（標題「工具與其他」）。全部已 push。
- **還沒做**：音樂本身。原本那台（RTX 5070 Ti Laptop，12 GB）做到第 1 章的 7 個候選（主題歌 2、戰鬥 2、精英 2、破壞 1）就暫停了。
- **跨電腦同步**：產生的候選（wav，在 gitignore 的 `tools/acestep/out/`）以 320 kbps mp3 放進**會 commit 的 `tools/bgm-work/`**（`scripts/bgm-sync.py`、`npm run bgm:sync -- export|import`）。`npm run bgm:all` 開始時先匯入（別台做過的不重做）、每一步之後匯出；伺服器（`npm start`）啟動時也自動匯入一次，配樂產生器的「同步」按鈕是 git pull 之後手動匯入。所以那 7 首 pull 下來之後就看得到、也不會重做。**每做完一章 commit 時把 `tools/bgm-work` 一起加進去**。
- 遊戲現在沒有 AI 配樂的章就用舊的配樂（`lib/bgm-assets.js`），所以中途 commit 不會壞。

## 第一次在這台電腦上

```bash
git pull
npm install
npm run bgm:setup      # 約 15 GB：ACE-Step（固定版本）＋Python 3.12＋PyTorch cu128、模型（主模型、2B sft、1.7B 語言模型）、評分環境
```

- 需要 git 與 NVIDIA 顯示卡（驅動要支援 CUDA 12.8）；`uv` 沒有時腳本自己下載。
- 評分用的 Whisper large-v3-turbo、Demucs、audiobox-aesthetics 第一次評分時才從 Hugging Face 下載（約 2 GB）。
- `npm run bgm:setup -- --check` 看安裝狀態。

## 產生

兩種方式，結果一樣（都是 `scripts/bgm-gen-run.js`）：

1. **配樂產生器（建議）**：`npm start` 開伺服器 → 瀏覽器開這台的遊戲網址 → 標題「工具與其他」→「配樂產生器」→ 章選第 1 章 →「從這章跑到第 8 章」。畫面上看得到顯示卡、進度記錄、每首的候選與分數，可以試聽、改挑選、刪掉重做、編輯歌詞；「停止」隨時暫停。區網裡的平板也能用這個網址看。
2. **命令列**：`npm run bgm:all -- --from=1 --to=8`（`--n=2` 每首的候選數）。

每章依序：產生交戰版候選（每首 2 個）→ 自動評分挑選 → 平時版（cover）→ 打包到 `src/assets/bgm-ai/c<章>/`。**中斷後重跑會接著做**（已經有的檔案略過）。產生中的每一首在一分鐘內出現在「AI 配樂試聽」的「產生中的曲子」（`scripts/bgm-preview.py` 寫 `dist/lib/bgm-cand-c<章>.js`，不進 git）。

**時間**（RTX 5070 Ti Laptop 量的）：主題歌（150 秒）每首約 5 分鐘、其他（120 秒）約 2 分鐘；加上評分與平時版，每章約 1.4 小時，8 章約 11 小時。RTX 4070（12 GB）應該差不多。

## 每做完一章

使用者的規則：建置並把 `dist/` 一起 commit、commit 之前先 pull、只跑相關的冒煙測試、測試過了就 commit＋push。

```bash
git pull
npm run build                                  # lib/bgm-c<章>.js 與章節清單 lib/bgm-ai.js
SMOKE_ONLY=testBgmLab,testAudio2 node scripts/smoke-test.js
git add src/assets/bgm-ai tools/bgm-work dist && git commit -m "AI 配樂：第 N 章（…）" && git push
```

（Node 不在 PATH 時：Git Bash 先 `export PATH="/c/Program Files/nodejs:$PATH"`。`.git/index.lock` 卡住時刪掉它。）

- `testBgmLab` 會檢查「AI 配樂試聽」列出第 1 章的全部歌、交戰版與平時版可以播放。
- 在遊戲裡聽：主線出擊（那一章的委託）時，探索／警戒＝平時版、交戰＝交戰版、Boss＝Boss 曲、Boss 最終型態＝主題歌的副歌。

## 顯示卡與問題

| 狀況 | 處理 |
|---|---|
| 顯示卡記憶體不夠（CUDA out of memory） | 設 `BGM_DIT=acestep-v15-turbo`、`BGM_LM=acestep-5Hz-lm-0.6B` 再跑（品質會差一點；turbo 要另外下載，`npm run bgm:gen -- --prep` 先下載） |
| `UnicodeEncodeError: 'cp950'` | 執行腳本已經設 `PYTHONIOENCODING=utf-8`；自己直接跑 python 時也要設 |
| 評分環境的 PyTorch 變成 CPU 版 | 不要用 `uv run --with` 加評分套件；用 `tools/acestep/score-venv`（`bgm:setup` 建的，PyTorch 固定 2.7.1+cu128） |
| Hugging Face 的 symlink／hf_xet 警告 | 可以忽略 |
| 某一首的分數很低（歌詞吻合度 < 0.6） | 配樂產生器裡刪掉那個候選 →「只產生這首」補一個新的 →「評分挑選」→「產生平時版」→「打包」 |
| 想自己改挑選 | 配樂產生器的「設為挑選」（會刪掉舊的平時版）→「產生平時版」→「打包」 |
| 改歌詞 | 配樂產生器的「編輯」（寫 `scripts/bgm_songs/c<章>.json`，要 commit）→ 刪掉舊的候選 → 重新產生 |

## 自動挑選怎麼算

`scripts/bgm-score.py`：Demucs 分出人聲 → Whisper 日文聽寫和歌詞比對（歌詞吻合度）、副歌第一句的時間（給 Boss 最終型態）、人聲音高（聲線）、audiobox-aesthetics 的 PQ／CE（音樂美感）、削波與靜音；總分＝0.4 歌詞＋0.4 美感＋0.2 聲線。第 0 期的測試：主題歌的歌詞吻合度 0.93、CE 7.4、PQ 8.3。

## 給接手的 Claude

- 回覆、文件、註解、commit 訊息一律繁體中文；使用者要求長工作每 10 分鐘回報顯示卡記憶體、系統記憶體與進度，有問題直接處理、不要問。
- 不要用子代理（subagent）或 Workflow。
- 一章做完就照上面的步驟 commit＋push，再接下一章；全部 8 章做完後在 `docs/audio-design.md` 的「AI 配樂」補上結果（每章的平均分數、低分重做了哪些），刪掉這份交接文件或改成「已完成」。
