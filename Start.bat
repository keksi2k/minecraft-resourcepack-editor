@echo off
rem Startet den Minecraft Resource Pack Editor und oeffnet ihn im Browser.
rem   Start.bat          -> Port 8080
rem   Start.bat 3000     -> anderer Port
rem Funktioniert im entpackten Release (serve.mjs daneben) und im geklonten Repository.
setlocal
cd /d "%~dp0"
title Minecraft Resource Pack Editor

set "PORT=8080"
if not "%~1"=="" set "PORT=%~1"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js wurde nicht gefunden.
  echo Bitte die LTS-Version von https://nodejs.org installieren und Start.bat danach erneut ausfuehren.
  goto :fail
)

if exist "serve.mjs" (
  set "SERVER=serve.mjs"
  goto :run
)

rem Quellcode-Variante: bei Bedarf installieren und bauen.
if not exist "node_modules" (
  echo Installiere Abhaengigkeiten ...
  call npm ci
  if errorlevel 1 goto :fail
)
if not exist "dist\index.html" (
  echo Baue die App ...
  call npm run build
  if errorlevel 1 goto :fail
)
set "SERVER=scripts\serve.mjs"

:run
echo.
echo Editor startet auf http://127.0.0.1:%PORT%
echo Zum Beenden dieses Fenster schliessen oder Strg+C druecken.
echo.
if not defined NO_BROWSER start "" cmd /c "timeout /t 2 /nobreak >nul & start http://127.0.0.1:%PORT%"
node "%SERVER%" --port %PORT%
if errorlevel 1 goto :fail
exit /b 0

:fail
echo.
echo Start fehlgeschlagen. Hilfe: docs\INSTALLATION.md, Abschnitt "Fehlerbehebung"
echo https://github.com/keksi2k/minecraft-resourcepack-editor/blob/main/docs/INSTALLATION.md#11-fehlerbehebung
pause
exit /b 1
