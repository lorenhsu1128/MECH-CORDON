#!/bin/bash
# 立繪影格的候選（docs/portrait-qa-workflow.md）：清單裡的每一格產生 n 輪新候選（每輪一張，最新的一張自動成為 pick），
# 之後用 scripts/portrait-sheet.py cands 看候選表、scripts/portrait-pick.py 選定。
#   bash scripts/portrait-cands.sh <角色> <清單檔> [輪數=3]
#   bash scripts/portrait-cands.sh --frames <角色> …   只補產還沒完成的格子（chargen.js char <角色> frames）
# 要開著伺服器（npm start 或 node server.js）與 ComfyUI（npm run comfy 或 scripts/comfy-restart.ps1）。
# chargen.js 偶爾因為 ComfyUI 斷線失敗：每次最多重試 5 次、間隔 40 秒。
# 同一個角色同時只能跑一個（card.json 會互相覆蓋）；跑的時候不要對這個角色用 portrait-pick.py。
cd "$(dirname "$0")/.."
run() { for i in 1 2 3 4 5; do node scripts/chargen.js char "$@" > "${TMPDIR:-/tmp}/pc_$1.txt" 2>&1 && return 0; tail -n 2 "${TMPDIR:-/tmp}/pc_$1.txt"; sleep 40; done; echo "失敗：$*"; return 1; }
if [ "$1" = "--frames" ]; then
  shift
  for c in "$@"; do run "$c" frames; echo "FRAMES $c"; done
  exit 0
fi
cid=$1; lst=$2; rounds=${3:-3}
# Windows 的 Python 寫的清單帶 \r：一定要去掉，否則只有最後一格（或一格都沒有）會產生
L=$(tr -d '\r' < "$lst" | tr -s ' \n' ',,' | sed 's/^,//; s/,$//')
[ -z "$L" ] && { echo "清單是空的：$lst"; exit 1; }
echo "$cid：$(echo "$L" | tr ',' '\n' | wc -l) 格 × $rounds 輪"
for r in $(seq "$rounds"); do run "$cid" frames --only="$L" || exit 1; echo "第 $r 輪完成"; done
echo "CANDS $cid"
