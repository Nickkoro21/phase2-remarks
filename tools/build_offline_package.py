# -*- coding: utf-8 -*-
"""Builds the offline package for the unit's closed network.

Output: dist/Phase2Remarks_offline_<date>.zip containing:
  app/ + data/ + tools/build_index.py + START_PHASE2_REMARKS.bat + README_OFFLINE.txt

The package needs NO internet and NO installation. It runs with any local
Python 3 (python -m http.server). If Python is unavailable on the closed
network, any static file server pointed at the folder root works the same.

Run:  python tools/build_offline_package.py
"""
import io, os, sys, zipfile
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"

LAUNCHER = """@echo off
rem  Phase 2 Remarks - offline launcher (closed network, no internet needed)
cd /d %~dp0
start "" http://localhost:8123/app/
python -m http.server 8123
"""

README = """PHASE 2 REMARKS - OFFLINE PACKAGE
==================================

T-6A Gradesheet Observations - BD 3-1 par.41 / Phase 2 Syllabus MIF
Developed by Koro - with Claude riding the right seat - Kalamata

RUN
---
1. Unzip this package anywhere (e.g. C:\\Phase2Remarks).
2. Double-click START_PHASE2_REMARKS.bat
   (requires any Python 3 on the machine - no packages, no internet).
3. The browser opens at http://localhost:8123/app/

If Python is not available: serve the unzipped folder with any static
file server and open /app/ - the application is plain HTML/CSS/JS.

NOTES
-----
- Feedback buttons link to GitHub and will not work on a closed network;
  note corrections manually and pass them to the maintainer.
- To refresh indexes after a data change: python tools\\build_index.py
"""


def build():
    DIST.mkdir(exist_ok=True)
    out = DIST / f"Phase2Remarks_offline_{date.today().isoformat()}.zip"
    include_dirs = ["app", "data", "tools"]
    skip_parts = {"raw"}  # data/raw is extraction archive, not needed offline
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for d in include_dirs:
            for p in (ROOT / d).rglob("*"):
                if p.is_dir():
                    continue
                rel = p.relative_to(ROOT)
                if skip_parts.intersection(rel.parts):
                    continue
                z.write(p, str(rel))
        z.writestr("START_PHASE2_REMARKS.bat", LAUNCHER)
        z.writestr("README_OFFLINE.txt", README)
        z.writestr("index.html", (ROOT / "index.html").read_text(encoding="utf-8"))
    size_mb = out.stat().st_size / 1024 / 1024
    print(f"{out} ({size_mb:.1f} MB)")


if __name__ == "__main__":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    build()
