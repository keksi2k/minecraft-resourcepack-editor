@echo off
rem Starts the Minecraft Resource Pack Editor and opens it in the browser.
rem   Start.bat          -> port 8080
rem   Start.bat 3000     -> another port
rem Works in the extracted release (serve.mjs next to it) and in a cloned repository.
rem If Node.js is missing or too old, it offers to install the current LTS version.
setlocal
cd /d "%~dp0"
title Minecraft Resource Pack Editor

set "PORT=8080"
if not "%~1"=="" set "PORT=%~1"

call :findnode
if errorlevel 1 goto :nonode
call :checkversion
if errorlevel 1 goto :oldnode
goto :start

:nonode
call :language
echo.
call :say "Node.js was not found. The editor needs it to run." "Node.js wurde nicht gefunden. Der Editor braucht es zum Laufen."
goto :offer

:oldnode
call :language
for /f "delims=" %%v in ('node -v') do set "NODEVER=%%v"
echo.
call :say "Node.js %NODEVER% is too old, the editor needs 18.18 or newer." "Node.js %NODEVER% ist zu alt, der Editor braucht 18.18 oder neuer."

:offer
call :say "It can be installed now: the current LTS version, from winget or nodejs.org." "Es kann jetzt installiert werden: die aktuelle LTS-Version, ueber winget oder nodejs.org."
call :say "This accepts the Node.js licence. Windows may ask for permission." "Damit akzeptierst du die Lizenz von Node.js. Windows fragt eventuell nach Erlaubnis."
echo.
call :ask "Install Node.js now" "Node.js jetzt installieren"
if errorlevel 1 goto :declined
echo.
set "INSTALLER=install-node.ps1"
if not exist "%INSTALLER%" set "INSTALLER=scripts\install-node.ps1"
powershell -NoProfile -ExecutionPolicy Bypass -File "%INSTALLER%"
if errorlevel 1 goto :fail
rem The new PATH only reaches new windows; look in the install folders directly.
call :findnode
if errorlevel 1 goto :reopen
call :checkversion
if errorlevel 1 goto :reopen
echo.
call :say "Node.js is installed." "Node.js ist installiert."

:start
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

:declined
echo.
call :say "Install the LTS version from https://nodejs.org and run Start.bat again." "Installiere die LTS-Version von https://nodejs.org und starte Start.bat erneut."
pause
exit /b 1

:reopen
echo.
call :say "Node.js was installed, but this window can't see it yet. Please run Start.bat again." "Node.js wurde installiert, aber dieses Fenster sieht es noch nicht. Bitte Start.bat erneut starten."
pause
exit /b 1

:fail
echo.
echo Start failed. Help: docs\INSTALLATION.md, section "Troubleshooting"
echo https://github.com/keksi2k/minecraft-resourcepack-editor/blob/main/docs/INSTALLATION.md#11-troubleshooting
pause
exit /b 1

rem ---- helpers -------------------------------------------------------------

rem Finds node.exe on PATH or in the usual install folders (adding them to PATH for this window).
:findnode
where node >nul 2>nul && exit /b 0
for %%d in ("%ProgramFiles%\nodejs" "%ProgramFiles(x86)%\nodejs" "%LocalAppData%\Programs\nodejs") do (
  if exist "%%~d\node.exe" (
    set "PATH=%%~d;%PATH%"
    exit /b 0
  )
)
exit /b 1

rem Succeeds when the found Node.js is 18.18 or newer ("call": node may be a .cmd shim from a version manager).
:checkversion
call node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>18||(a===18&&b>=18)?0:1)" >nul 2>nul
exit /b %errorlevel%

rem Picks German or English for the messages below, from the Windows display language.
:language
if defined UILANG exit /b 0
set "UILANG=en"
for /f "delims=" %%l in ('powershell -NoProfile -Command "(Get-UICulture).TwoLetterISOLanguageName" 2^>nul') do set "UILANG=%%l"
exit /b 0

rem :say "english" "deutsch" - prints the message in the user's language.
:say
if /i "%UILANG%"=="de" goto :say_de
echo(%~1
exit /b 0
:say_de
echo(%~2
exit /b 0

rem :ask "english" "deutsch" - yes/no question; errorlevel 0 = yes.
:ask
if /i "%UILANG%"=="de" goto :ask_de
choice /c YN /m "%~1"
if errorlevel 2 exit /b 1
exit /b 0
:ask_de
choice /c JN /m "%~2"
if errorlevel 2 exit /b 1
exit /b 0
