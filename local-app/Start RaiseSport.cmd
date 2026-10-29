@echo off
setlocal
cd /d "%~dp0"
title RaiseSport Server
set "RAISESPORT_PY="
where py >nul 2>nul
if not errorlevel 1 (
    py -3 -c "import sys; sys.exit(0 if sys.version_info >= (3,10) else 1)" >nul 2>nul
    if not errorlevel 1 set "RAISESPORT_PY=py -3"
)
if defined RAISESPORT_PY goto ready
where python >nul 2>nul
if not errorlevel 1 (
    python -c "import sys; sys.exit(0 if sys.version_info >= (3,10) else 1)" >nul 2>nul
    if not errorlevel 1 set "RAISESPORT_PY=python"
)
if defined RAISESPORT_PY goto ready
echo Install Python 3 from https://www.python.org/downloads/
echo Select Add Python to PATH during installation.
goto finished
:ready
echo Checking RaiseSport before starting...
echo.
%RAISESPORT_PY% tests\check_all.py
if errorlevel 1 (
    echo.
    echo App checks failed. The server was not started.
    echo See data\startup-checks.log for the details.
    goto finished
)
%RAISESPORT_PY% run.py --open-all %*
:finished
echo.
echo The server has stopped. You can close this window.
pause
