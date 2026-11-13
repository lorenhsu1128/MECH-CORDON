# 重啟 ComfyUI（釋放累積的記憶體）：等目前的佇列空了才關，關掉後重開並等它可以用
S='C:/Users/LOREN/AppData/Local/Temp/claude/deb674574f2845b7/d2fd3704-2724-442d-8f7b-e0b21678e205/scratchpad'
cd /c/Users/LOREN/Documents/_projects/MECH-CORDON
for i in $(seq 1 120); do q=$(curl -s -m 3 http://127.0.0.1:8188/queue); case "$q" in *'"queue_running": []'*'"queue_pending": []'*|'') break;; esac; sleep 5; done
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { (\$_.Name -eq 'python.exe' -and \$_.CommandLine -like '*main.py*--port 8188*') -or (\$_.Name -eq 'node.exe' -and \$_.CommandLine -like '*comfy-start.js*') } | ForEach-Object { Stop-Process -Id \$_.ProcessId -Force -ErrorAction SilentlyContinue }; exit 0"
sleep 3
powershell -NoProfile -ExecutionPolicy Bypass -File "$S/comfy_start_detached.ps1"
for i in $(seq 1 120); do curl -s -m 2 http://127.0.0.1:8188/system_stats >/dev/null && { echo "ComfyUI 已重啟 $(date +%H:%M)"; exit 0; }; sleep 3; done
echo "ComfyUI 重啟失敗"; exit 1
