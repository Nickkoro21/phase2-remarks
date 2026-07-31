@echo off
rem ── Phase 2 Remarks · local launcher ──
cd /d D:\FDMS
python tools\build_index.py
start "" http://localhost:8123/app/
python -m http.server 8123
