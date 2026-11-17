# 重開 ComfyUI（隱藏視窗；docs/portrait-qa-workflow.md）：長時間產圖時每個角色重開一次，避免顯示卡記憶體越吃越多。
# 只關掉執行 ComfyUI main.py 的 python 與 scripts/comfy-start.js，不碰其他 python（例如語音的程序）。
#   powershell -ExecutionPolicy Bypass -File scripts/comfy-restart.ps1
$proj = Split-Path -Parent $PSScriptRoot
Get-CimInstance Win32_Process | Where-Object { $_.Name -like 'python*' -and $_.CommandLine -like '*ComfyUI*main.py*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -like '*comfy-start.js*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
for ($i = 0; $i -lt 60; $i++) {
  try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 http://127.0.0.1:8188/system_stats | Out-Null; Start-Sleep -Seconds 1 } catch { break }
}
Start-Process node -ArgumentList 'scripts/comfy-start.js' -WorkingDirectory $proj -WindowStyle Hidden -RedirectStandardOutput "$env:TEMP\comfy.log" -RedirectStandardError "$env:TEMP\comfy.err.log"
for ($i = 0; $i -lt 180; $i++) {
  Start-Sleep -Seconds 2
  try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 http://127.0.0.1:8188/system_stats | Out-Null; Write-Output 'ComfyUI 已啟動'; exit 0 } catch { }
}
Write-Output 'ComfyUI 啟動失敗（看 %TEMP%\comfy.err.log）'
exit 1
