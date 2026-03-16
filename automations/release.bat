@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%.."

if "%~1"=="" (
  node .\scripts\release-version.mjs --interactive
  exit /b %errorlevel%
)

set "TARGET=%~1"
shift

if /I "%TARGET%"=="patch" (
  node .\scripts\release-version.mjs --bump patch --commit --push %*
  exit /b %errorlevel%
)

if /I "%TARGET%"=="minor" (
  node .\scripts\release-version.mjs --bump minor --commit --push %*
  exit /b %errorlevel%
)

if /I "%TARGET%"=="major" (
  node .\scripts\release-version.mjs --bump major --commit --push %*
  exit /b %errorlevel%
)

node .\scripts\release-version.mjs --version %TARGET% --commit --push %*
exit /b %errorlevel%
