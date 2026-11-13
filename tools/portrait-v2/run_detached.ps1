# 用 WMI 開一個不在 Claude Code 程序樹裡的 bash 腳本：run_detached.ps1 <腳本> <輸出檔>
param([string]$script, [string]$log)
$cmd = '"C:\Program Files\Git\bin\bash.exe" -c "bash ''' + $script + ''' > ''' + $log + ''' 2>&1"'
$r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $cmd; CurrentDirectory = 'C:\Users\LOREN\Documents\_projects\MECH-CORDON' }
"PID " + $r.ProcessId
