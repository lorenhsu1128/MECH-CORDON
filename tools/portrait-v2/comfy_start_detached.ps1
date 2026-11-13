# start comfyui detached (WMI)
# start comfyui detached (WMI)
$ws = 'C:\Users\LOREN\AppData\Local\Temp\claude\deb674574f2845b7\d2fd3704-2724-442d-8f7b-e0b21678e205\scratchpad'
$cmd = 'cmd.exe /c node scripts/comfy-start.js > "' + $ws + '\comfy.log" 2> "' + $ws + '\comfy.err"'
$r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $cmd; CurrentDirectory = 'C:\Users\LOREN\Documents\_projects\MECH-CORDON' }
"comfy pid " + $r.ProcessId
