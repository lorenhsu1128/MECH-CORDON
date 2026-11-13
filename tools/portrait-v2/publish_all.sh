# 拆層＋發佈：bash publish_all.sh <角色 …>；每位開始前重啟 ComfyUI，失敗就停下
S=/c/Users/LOREN/AppData/Local/Temp/claude/deb674574f2845b7/d2fd3704-2724-442d-8f7b-e0b21678e205/scratchpad
cd /c/Users/LOREN/Documents/_projects/MECH-CORDON
for c in "$@"; do
  echo "$c 開始 $(date +%H:%M:%S)"
  bash $S/comfy_restart.sh > $S/comfy_restart.log 2>&1; tail -1 $S/comfy_restart.log
  node --input-type=module -e "
import { pathToFileURL } from 'url';
const { CharStore } = await import(pathToFileURL('mech_cordon_charagen/js/store.js').href);
const st = new CharStore('http://127.0.0.1');
const k = await st.getCard('$c');
if (!k.layers) { k.layers = true; await st.putCard(k); console.log('  打開拆層'); }
" || { echo "$c 打開拆層失敗，停下"; exit 1; }
  t0=$(date +%s)
  if node scripts/chargen.js char $c publish > $S/pub_$c.log 2>&1; then
    echo "$c 發佈完成 $(date +%H:%M:%S)（$(( ($(date +%s) - t0) / 60 )) 分）"
  else
    echo "$c 發佈失敗，停下：$(tail -2 $S/pub_$c.log | tr '\n' ' ')"; exit 1
  fi
done
echo PUBDONE
