@echo off
rem Rebuilds the Publish folder (Steam Workshop copy + CivFanatics zip) from the mod source.
rem Usage: "Prepare Publish.bat" [skiptests] [force] [nopause]
setlocal
rem Capture the script folder before SHIFT, which also shifts %0.
set "HERE=%~dp0"
set "ARGS="
set "NOPAUSE="
:parse
if "%~1"=="" goto run
if /i "%~1"=="skiptests" set "ARGS=%ARGS% -SkipTests"
if /i "%~1"=="force" set "ARGS=%ARGS% -Force"
if /i "%~1"=="nopause" set "NOPAUSE=1"
shift
goto parse

:run
powershell -NoProfile -ExecutionPolicy Bypass -File "%HERE%prepare-publish.ps1" %ARGS%
set "RC=%ERRORLEVEL%"
if not defined NOPAUSE pause
exit /b %RC%
