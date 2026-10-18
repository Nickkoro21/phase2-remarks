@echo off
rem -- Phase 2 FDMS - starts BOTH servers: the app and the advisor proxy --
rem The proxy opens in its own window so its log stays readable and Ctrl+C
rem stops only it. The app server runs in this window.
cd /d D:\FDMS
python tools\build_index.py
start "FDMS advisor proxy" cmd /k python tools\advisor_proxy.py
start "" http://localhost:8123/app/
python tools\serve_app.py
