# start server detached (WMI)
$ws = 'C:\Users\LOREN\AppData\Local\Temp\claude\deb674574f2845b7\d2fd3704-2724-442d-8f7b-e0b21678e205\scratchpad'
$cmd = 'cmd.exe /c node server.js > "' + $ws + '\server.log" 2>&1'
$r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $cmd; CurrentDirectory = 'C:\Users\LOREN\Documents\_projects\MECH-CORDON' }
"server pid " + $r.ProcessId
