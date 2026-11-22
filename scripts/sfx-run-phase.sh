#!/bin/bash
# 一期的產生：gen 中斷（例外、被停掉）就接著重跑，最多 20 次；之後評分、打包、試聽頁
cd "$(dirname "$0")/.."
PH=$1
PY=tools/sfxgen/venv/Scripts/python.exe
export HF_HOME=tools/sfxgen/hf PYTHONUTF8=1
for i in $(seq 1 20); do
  $PY scripts/sfx-make.py gen --phase=$PH >> tools/sfxgen/gen-p$PH.log 2>&1 && break
  echo "gen 中斷（第 $i 次），30 秒後接著做" >> tools/sfxgen/gen-p$PH.log
  sleep 30
done
$PY scripts/sfx-make.py score --phase=$PH >> tools/sfxgen/gen-p$PH.log 2>&1 && \
$PY scripts/sfx-make.py pack --phase=$PH >> tools/sfxgen/gen-p$PH.log 2>&1 && \
$PY scripts/sfx-make.py page --phase=$PH >> tools/sfxgen/gen-p$PH.log 2>&1
echo "第 $PH 期結束：$?"
