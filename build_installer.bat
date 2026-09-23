@echo off
REM ================================================================
REM  Build a Windows installer for AHR Maintenance Inventory.
REM  Run this ON A WINDOWS PC that has Python 3.11-3.13 installed.
REM  Produces:  dist\AHR-Inventory\AHR-Inventory.exe  (portable app)
REM  Then (optional) compile installer\AHR-Inventory.iss with Inno Setup
REM  to get a one-click Setup.exe.
REM ================================================================
setlocal
cd /d "%~dp0"

echo === Creating build environment ===
py -3 -m venv .buildenv 2>nul || python -m venv .buildenv
call .buildenv\Scripts\activate.bat
python -m pip install --no-cache-dir -r requirements.txt
python -m pip install --no-cache-dir pyinstaller

echo === Ensuring database is seeded ===
if not exist "data\inventory.db" python -m scripts.import_excel --dir source

echo === Building EXE with PyInstaller ===
pyinstaller --noconfirm AHR-Inventory.spec

echo.
echo ================================================================
echo  DONE. Portable app is in:  dist\AHR-Inventory\
echo  Run it by double-clicking:  dist\AHR-Inventory\AHR-Inventory.exe
echo.
echo  To make a one-click Setup.exe:
echo   1) Install Inno Setup (https://jrsoftware.org/isdl.php)
echo   2) Open installer\AHR-Inventory.iss and click Compile
echo ================================================================
pause
