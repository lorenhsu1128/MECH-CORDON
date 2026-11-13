# v.sh <角色> <姿勢@cx,cy> …：以 B.json 的框畫檢查圖 v_<角色>.jpg
S='C:/Users/LOREN/AppData/Local/Temp/claude/deb674574f2845b7/d2fd3704-2724-442d-8f7b-e0b21678e205/scratchpad'
c=$1; shift
cd /c/Users/LOREN/Documents/_projects/MECH-CORDON
A=()
for it in "$@"; do p=${it%@*}; xy=${it#*@}; s=$(node -e "console.log(require('$S/picks.json')['$c']['$p'])"); d=$c; case $s in *:*) d=${s%:*}; s=${s#*:};; esac; A+=("$c:$p=tools/comfyui/runtime/work/v2/$d/$p/edit_$s.png@$xy"); done
node $S/zoom.js $S/v_$c.jpg "${A[@]}"
