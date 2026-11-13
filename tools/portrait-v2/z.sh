# z.sh <角色> <輸出名> <姿勢@cx,cy> …：p1 一律放第一格並畫出現有的框
S='C:/Users/LOREN/AppData/Local/Temp/claude/deb674574f2845b7/d2fd3704-2724-442d-8f7b-e0b21678e205/scratchpad'
c=$1; o=$2; shift 2
cd /c/Users/LOREN/Documents/_projects/MECH-CORDON
A=()
for it in "$@"; do p=${it%@*}; xy=${it#*@}; s=$(node -e "console.log(require('$S/picks.json')['$c']['$p'])"); d=$c; case $s in *:*) d=${s%:*}; s=${s#*:};; esac; A+=("$c:$p=tools/comfyui/runtime/work/v2/$d/$p/edit_$s.png@$xy"); done
node $S/zoom.js $S/$o.jpg "${A[@]}"
