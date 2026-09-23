@echo off
REM Force-stop the program if the console window was lost.
title Stop AHR Inventory
echo Stopping AHR Maintenance Inventory (port 8770)...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr :8770 ^| findstr LISTENING') do taskkill /F /PID %%p >nul 2>&1
echo Done. You can close this window.
timeout /t 2 >nul
