@echo off
setlocal

title DoCode Dev

pushd %~dp0\..

:: Get electron, compile, built-in extensions
if "%DOCODE_SKIP_PRELAUNCH%"=="" (
	node build/lib/preLaunch.ts || (
		echo Failed to prepare VS Code for launch ^(build/lib/preLaunch.ts^). 1>&2
		goto :failed
	)
)
goto :prelaunch_complete

:failed
popd
endlocal
exit /b 1

:prelaunch_complete

set "NAMESHORT="
for /f "tokens=2 delims=:," %%a in ('findstr /R /C:"\"nameShort\":.*" product.json') do if not defined NAMESHORT set "NAMESHORT=%%~a"
set NAMESHORT=%NAMESHORT: "=%
set NAMESHORT=%NAMESHORT:"=%.exe
set CODE=".build\electron\%NAMESHORT%"

:: Manage built-in extensions
if "%~1"=="--builtin" goto builtin

:: Configuration
set NODE_ENV=development
set DOCODE_DEV=1
set DOCODE_CLI=1
set ELECTRON_ENABLE_LOGGING=1
set ELECTRON_ENABLE_STACK_DUMPING=1

set DISABLE_TEST_EXTENSION="--disable-extension=docode.docode-api-tests"
for %%A in (%*) do (
	if "%%~A"=="--extensionTestsPath" (
		set DISABLE_TEST_EXTENSION=""
	)
)

:: Launch Code
%CODE% . %DISABLE_TEST_EXTENSION% %*
goto end

:builtin
%CODE% build/builtin

:end

popd

endlocal
