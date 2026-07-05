@echo off
setlocal
cd /d "%~dp0"
title WF-RivenTrader

echo Starting WF-RivenTrader...

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22 or newer is required, but node was not found.
  echo Install Node.js from https://nodejs.org/ and run this file again.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo npm is required, but it was not found.
  echo Reinstall Node.js with npm included and run this file again.
  pause
  exit /b 1
)

for /f "delims=" %%A in ('node -p "process.versions.node.split('.')[0]" 2^>nul') do set "NODE_MAJOR=%%A"
if not defined NODE_MAJOR set "NODE_MAJOR=0"
if %NODE_MAJOR% LSS 22 (
  echo Node.js 22 or newer is required. Detected Node.js:
  node --version
  echo Install the current LTS from https://nodejs.org/ and run this file again.
  pause
  exit /b 1
)

echo Installing or updating dependencies...
call npm install
if errorlevel 1 (
  echo Dependency installation failed.
  pause
  exit /b 1
)

echo Starting the trader dashboard...
call npm run start -- %*
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" echo Trader exited with code %EXIT_CODE%.
pause
exit /b %EXIT_CODE%
