# -*- coding: utf-8 -*-
"""Builds data/observations/master_index.json from the per-item observation files.
Run after every observation generation pass:  python tools/build_index.py
"""
import json, sys, io
from pathlib import Path
from datetime import datetime

ROOT = Path(__file__).resolve().parent.parent
OBS = ROOT / "data" / "observations"
CATEGORIES = ["contact", "instrument", "formation", "vfr_navigation"]

def build():
    master = {"generated_at": datetime.now().isoformat(timespec="seconds"),
              "categories": {}, "totals": {"items": 0, "observations": 0}}
    for cat in CATEGORIES:
        folder = OBS / cat
        entry = {"items": [], "observations": 0, "available": folder.is_dir()}
        if folder.is_dir():
            for f in sorted(folder.glob("*.json")):
                if f.name in ("index.json", "master_index.json"):
                    continue
                try:
                    d = json.loads(f.read_text(encoding="utf-8"))
                except Exception as e:
                    print(f"  ! skip {f.name}: {e}")
                    continue
                obs = d.get("observations", [])
                combos = {}
                for o in obs:
                    key = f"{o.get('mif_row') or ''}|{o.get('desired')}|{o.get('achieved')}"
                    combos[key] = combos.get(key, 0) + 1
                desired = sorted({o.get("desired") for o in obs if o.get("desired") is not None})
                achieved = sorted({o.get("achieved") for o in obs if o.get("achieved") is not None})
                v2_path = OBS.parent / "observations2" / cat / f.name
                v2_modes = 0
                if v2_path.is_file():
                    try:
                        v2 = json.loads(v2_path.read_text(encoding="utf-8"))
                        v2_modes = len(v2.get("error_modes", []))
                    except Exception:
                        v2_modes = 0
                entry["items"].append({
                    **({"v2_file": f"{cat}/{f.name}", "modes": v2_modes} if v2_modes else {}),
                    "item_id": d.get("item_id", f.stem),
                    "item_name": d.get("item_name", f.stem),
                    "file": f"{cat}/{f.name}",
                    "mif_numbers": d.get("mif_numbers", []),
                    "rows": d.get("mif_rows", []),
                    "desired_codes": desired,
                    "achieved_codes": achieved,
                    "observations": len(obs),
                })
                entry["observations"] += len(obs)
        master["categories"][cat] = entry
        master["totals"]["items"] += len(entry["items"])
        master["totals"]["observations"] += entry["observations"]
    out = OBS / "master_index.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(master, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"master_index.json: {master['totals']['items']} items, "
          f"{master['totals']['observations']} observations")
    for cat in CATEGORIES:
        e = master["categories"][cat]
        print(f"  {cat}: {len(e['items'])} items / {e['observations']} obs")

if __name__ == "__main__":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    build()
