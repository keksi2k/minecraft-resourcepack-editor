@echo off
rem Starts the Minecraft Resource Pack Editor and opens it in the browser.
rem   Start.bat          -> port 8080
rem   Start.bat 3000     -> another port
rem Works in the extracted release (serve.mjs next to it) and in a cloned repository.
setlocal
cd /d "%~dp0"
title Minecraft Resource Pack Editor

set "PORT=8080"
if not "%~1"=="" set "PORT=%~1"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found.
  echo Install the LTS version from https://nodejs.org and run Start.bat again.
  goto :fail
)

if exist "serve.mjs" (
  set "SERVER=serve.mjs"
  goto :run
)

rem Source checkout: install and build when needed.
if not exist "node_modules" (
  echo Installing dependencies ...
  call npm ci
  if errorlevel 1 goto :fail
)
if not exist "dist\index.html" (
  echo Building the app ...
  call npm run build
  if errorlevel 1 goto :fail
)
set "SERVER=scripts\serve.mjs"

:run
echo.
echo Starting the editor at http://127.0.0.1:%PORT%
echo Close this window or press Ctrl+C to stop it.
echo.
if not defined NO_BROWSER start "" cmd /c "timeout /t 2 /nobreak >nul & start http://127.0.0.1:%PORT%"
node "%SERVER%" --port %PORT%
if errorlevel 1 goto :fail
exit /b 0

:fail
echo.
echo Start failed. Help: docs\INSTALLATION.md, section "Troubleshooting"
echo https://github.com/keksi2k/minecraft-resourcepack-editor/blob/main/docs/INSTALLATION.md#11-troubleshooting
pause
exit /b 1
