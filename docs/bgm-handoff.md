# AI 配樂的交接（2026-11-14）——已完成

**狀態：已完成（2026-11-14）。** 8 章 112 首全部產生、評分挑選、打包並 push；每章的平均分數、低分重做了哪些、過程中修正的問題，見 `docs/audio-design.md` 的「AI 配樂」→「結果」。這份文件留著當紀錄，以及之後要重做某幾首時的參考。

## 經過

- 原本那台（RTX 5070 Ti Laptop，12 GB）做到第 1 章的 7 個候選（主題歌 2、戰鬥 2、精英 2、破壞 1）就暫停，交給 RTX 4070（12 GB）接著做；那 7 個候選經 `tools/bgm-work/` 同步過來，沒有重做。
- RTX 4070 從第 1 章做到第 8 章，每章做完照下面的步驟 pull → 建置 → 冒煙測試 → commit＋push。

## 之後要重做某幾首

裝好環境（每台電腦一次）：

```bash
git pull
npm install
npm run bgm:setup      # 約 15 GB：ACE-Step（固定版本）＋Python 3.12＋PyTorch cu128、模型（主模型、2B sft、1.7B 語言模型）、評分環境
npm run bgm:sync -- import   # 把 tools/bgm-work/ 的候選、分數、挑選、刪除標記解回 tools/acestep/out/
```

- 需要 git 與 NVIDIA 顯示卡（驅動要支援 CUDA 12.8）；`uv` 沒有時腳本自己下載。評分用的 Whisper large-v3-turbo、Demucs、audiobox-aesthetics 第一次評分時才從 Hugging Face 下載（約 2 GB）。`npm run bgm:setup -- --check` 看安裝狀態。
- 最方便的是**配樂產生器**：`npm start` 開伺服器 → 瀏覽器開這台的遊戲網址 → 標題「工具與其他」→「配樂產生器」。可以試聽、改挑選、刪掉重做、編輯歌詞。命令列是 `npm run bgm:all -- --from=<章> --to=<章>`（已經有的檔案略過，中斷後重跑接著做）。

| 想做的事 | 做法 |
| --- | --- |
| 某一首換一個版本 | 配樂產生器裡「刪除」那個候選（留下 `.dropped`，之後不會用同一個種子產生回一樣的歌）→「只產生這首」補一個新的種子 →「評分挑選」→「產生平時版」→「打包」 |
| 自己改挑選 | 配樂產生器的「設為挑選」（會刪掉舊的平時版）→「產生平時版」→「打包」 |
| 改歌詞 | 配樂產生器的「編輯」（寫 `scripts/bgm_songs/c<章>.json`，要 commit）→ 刪掉舊的候選 → 重新產生 |

做完之後：

```bash
npm run bgm:sync -- export --ch=<章>
git pull                                       # push 前一律先 pull（另一台同時在開發）
npm run build                                  # lib/bgm-c<章>.js 與章節清單 lib/bgm-ai.js
SMOKE_ONLY=testBgmLab,testAudio2 node scripts/smoke-test.js
git add src/assets/bgm-ai tools/bgm-work dist && git commit -m "AI 配樂：第 N 章（…）" && git pull && git push
```

（Node 不在 PATH 時：Git Bash 先 `export PATH="/c/Program Files/nodejs:$PATH"`。`.git/index.lock` 卡住時刪掉它。）

## 顯示卡與問題

| 狀況 | 處理 |
| --- | --- |
| 很慢（120 秒的歌超過 3 分鐘）、顯示卡耗電很低 | 顯示卡記憶體溢出到共用記憶體。`bgm-gen.py` 對 16 GB 以下的顯示卡預設打開 `offload_to_cpu`（記錄開頭印「模型移回主記憶體：True」）；還是慢就關掉其他吃顯示卡的程式 |
| 顯示卡記憶體不夠（CUDA out of memory） | 設 `BGM_DIT=acestep-v15-turbo`、`BGM_LM=acestep-5Hz-lm-0.6B` 再跑（品質會差一點；turbo 要另外下載，`npm run bgm:gen -- --prep` 先下載） |
| 系統記憶體不足、程式被停掉 | 產生中主記憶體會用掉 20 GB 以上：不要同時跑完整的冒煙測試或產圖。被停掉的常常只有外層的 shell，產生程式還在跑——先查清楚、不要重複啟動兩份（兩份同時寫 `scores.json` 會互相蓋掉） |
| `UnicodeEncodeError: 'cp950'` | 執行腳本已經設 `PYTHONIOENCODING=utf-8`；自己直接跑 python 時也要設 |
| 評分環境的 PyTorch 變成 CPU 版 | 不要用 `uv run --with` 加評分套件；用 `tools/acestep/score-venv`（`bgm:setup` 建的，PyTorch 固定 2.7.1+cu128） |
| Hugging Face 的 symlink／hf_xet 警告 | 可以忽略 |

## 自動挑選怎麼算

`scripts/bgm-score.py`：Demucs 分出人聲 → Whisper 日文聽寫和歌詞比對（歌詞吻合度）、副歌第一句的時間（給 Boss 最終型態）、人聲音高（聲線）、audiobox-aesthetics 的 PQ／CE（音樂美感）、削波與靜音；總分＝0.4 歌詞＋0.4 美感＋0.2 聲線（突破、追擊的歌詞權重降低）。這次的規則：挑中的候選歌詞吻合度低於 0.6 就刪掉、換新的種子重做（每首最多 2 次）。
