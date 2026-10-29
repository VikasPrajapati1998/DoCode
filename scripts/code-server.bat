@echo off
setlocal

title DoCode Server

set ROOT_DIR=%~dp0..

pushd %ROOT_DIR%

:: Configuration
set NODE_ENV=development
set DOCODE_DEV=1

:: Get electron, compile, built-in extensions
if "%DOCODE_SKIP_PRELAUNCH%"=="" (
	node build/lib/preLaunch.ts
)

:: Node executable
FOR /F "tokens=*" %%g IN ('node build/lib/node.ts') do (SET NODE=%%g)

if not exist "%NODE%" (
	:: Download nodejs executable for remote
	call npm run gulp node
)

popd

:: Launch Server
call "%NODE%" %ROOT_DIR%\scripts\code-server.js %*


endlocal
