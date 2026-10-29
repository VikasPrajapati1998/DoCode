@echo off
setlocal
SET DOCODE_PATH=%~dp0..\..\..\..
SET DOCODE_DEV=1
FOR /F "tokens=* USEBACKQ" %%g IN (`where /r "%DOCODE_PATH%\.build\node" node.exe`) do (SET "NODE=%%g")
call "%NODE%" "%DOCODE_PATH%\out\server-cli.js" "Code Server - Dev" "" "" "code.cmd" %*
endlocal
