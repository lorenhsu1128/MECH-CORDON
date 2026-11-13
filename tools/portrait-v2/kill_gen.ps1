# stop chargen node and comfyui (matching from a file, so this script never matches itself)
$all = Get-CimInstance Win32_Process
$all | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -like '*chargen.js*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue; 'node ' + $_.ProcessId }
$all | Where-Object { ($_.Name -eq 'python.exe' -and $_.CommandLine -like '*main.py*--port 8188*') -or ($_.Name -eq 'node.exe' -and $_.CommandLine -like '*comfy-start.js*') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue; 'comfy ' + $_.ProcessId }
