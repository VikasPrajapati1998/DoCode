@echo off
rem Builds the Windows installers locally and places them in installer\windows.
rem macOS and Linux installers can only be built on those systems (see .github/workflows/release.yml).
setlocal
cd /d "%~dp0.."

rem Windows SDK tools (used while patching native binaries), same as the upstream pipeline.
if exist "%ProgramFiles(x86)%\Windows Kits\10\bin\10.0.26100.0\x64" set "PATH=%ProgramFiles(x86)%\Windows Kits\10\bin\10.0.26100.0\x64;%PATH%"

call npm run gulp core-ci || goto :fail
call npm run gulp docode-win32-x64-min-ci || goto :fail
call npm run gulp docode-win32-x64-inno-updater || goto :fail
call npm run gulp docode-win32-x64-user-setup || goto :fail
call npm run gulp docode-win32-x64-system-setup || goto :fail

if not exist installer\windows mkdir installer\windows
copy /y ".build\win32-x64\user-setup\DoCodeSetup.exe" "installer\windows\DoCode-UserSetup-x64.exe" || goto :fail
copy /y ".build\win32-x64\system-setup\DoCodeSetup.exe" "installer\windows\DoCode-Setup-x64.exe" || goto :fail

echo.
echo Done. Installers are in %cd%\installer\windows
exit /b 0

:fail
echo.
echo Build failed with error level %errorlevel%.
exit /b 1
