@echo off
setlocal enableextensions
title AHR Maintenance Inventory
cd /d "%~dp0"

set "PORT=8770"
set "PYEXE=.venv\Scripts\python.exe"

REM ---- create the Python environment on first run ----
if not exist "%PYEXE%" (
  if exist ".venv" rmdir /s /q ".venv"
  echo First-time setup, please wait a few minutes...
  where py >nul 2>nul && ( py -3 -m venv ".venv" ) || ( python -m venv ".venv" )
  if not exist "%PYEXE%" (
    echo.
    echo [ERROR] Python not found. Install Python 3.12 from https://www.python.org/downloads/
    echo and tick "Add Python to PATH", then run this file again.
    echo.
    pause & exit /b 1
  )
)

if not exist "data" mkdir "data"

REM ---- install/update packages ONLY when requirements.txt changed ----
fc /b "requirements.txt" "data\.req.stamp" >nul 2>nul
if errorlevel 1 (
  echo Installing/updating packages...
  "%PYEXE%" -m pip install --no-cache-dir -r requirements.txt
  if errorlevel 1 (
    echo.
    echo [ERROR] Package installation failed. Check the internet connection and run again.
    echo.
    pause & exit /b 1
  )
  copy /y "requirements.txt" "data\.req.stamp" >nul
)

REM ---- import initial data ONLY if there is no database yet ----
REM (your database in the data folder is kept intact when you update the program)
if not exist "data\inventory.db" (
  echo Importing initial data...
  "%PYEXE%" -m scripts.import_excel --dir source
)

if not exist ".env" copy ".env.example" ".env" >nul

echo.
echo ================================================
echo   AHR Maintenance Inventory is starting...
echo   Open your browser at:  http://localhost:%PORT%
echo   To STOP: click "close program" in the app,
echo   close this window, or run stop.bat.
echo ================================================
echo.
start "" http://localhost:%PORT%
"%PYEXE%" -m uvicorn app.main:app --host 0.0.0.0 --port %PORT%
echo.
echo The program has stopped.
pause
