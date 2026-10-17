#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ΕΙΣΑΓΩΓΗ ΜΑΘΗΤΩΝ ΣΤΟΝ ΦΑΚΕΛΟ — casefile_import_students.py
════════════════════════════════════════════════════════════════════════════

ΤΙ ΚΑΝΕΙ. Διαβάζει το ΙΔΙΩΤΙΚΟ roster (`D:\\FDMS-roster\\roster.json`, ΕΚΤΟΣ
repo) και γράφει τους μαθητές στον πίνακα `students` του project `fdms-casefile`,
**με το OID τους**. Το OID είναι ο λόγος που αξίζει το script: δένει τον φάκελο
με το training log του FDMS **χωρίς να ταιριάξει ποτέ επώνυμο** — μια
αντιστοίχιση με όνομα μας έχει ήδη κοστίσει μία φορά (bridge-spec § F7: ένα
rename στο roster καταδίκασε 151 σωστές γραμμές).

ΤΙ ΔΕΝ ΚΑΝΕΙ. Δεν σβήνει, δεν ενεργοποιεί, δεν απενεργοποιεί. Γράφει μόνο
μέσα από τη `fn_upsert_student`, άρα κάθε πράξη του περνά από το ίδιο log με
όλες τις άλλες, με δράστη **`admin`** — τη τρέχει ο ιδιοκτήτης, όχι agent.

ΙΔΙΩΤΙΚΟΤΗΤΑ. Το roster ΔΕΝ μπαίνει ποτέ στο repo και αυτό το αρχείο δεν
περιέχει ούτε ένα όνομα — μόνο κώδικα που ξέρει πού να τα βρει. Τα ονόματα
τυπώνονται στην οθόνη του ιδιοκτήτη, στο μηχάνημά του, και πουθενά αλλού.
Το κλειδί διαβάζεται από το περιβάλλον, δεν τυπώνεται και δεν καταγράφεται.

ΤΡΕΞΙΜΟ:
    python tools/casefile_import_students.py                 # ΔΟΚΙΜΗ, δεν γράφει
    python tools/casefile_import_students.py --class "99A HAF" "18 ITAF"
    python tools/casefile_import_students.py --apply         # γράφει στ' αλήθεια
"""
from __future__ import annotations

import argparse
import json
import os
import pathlib
import sys
import urllib.error
import urllib.request

ROSTER = pathlib.Path(r"D:\FDMS-roster\roster.json")
ENV_URL = "FDMS_CASEFILE_URL"
ENV_KEY = "FDMS_CASEFILE_KEY"


def rpc(url: str, key: str, fn: str, payload: dict) -> object:
    req = urllib.request.Request(
        f"{url.rstrip('/')}/rest/v1/rpc/{fn}",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        body = r.read().decode("utf-8")
    return json.loads(body) if body.strip() else None


def main() -> int:
    ap = argparse.ArgumentParser(description="Εισάγει τους μαθητές του roster στον φάκελο.")
    ap.add_argument("--apply", action="store_true", help="γράψε στ' αλήθεια (αλλιώς μόνο δοκιμή)")
    ap.add_argument("--class", dest="classes", nargs="*", default=None,
                    help="φίλτρο σειράς, π.χ. --class \"99A HAF\" \"18 ITAF\" (προεπιλογή: όλες)")
    args = ap.parse_args()

    if not ROSTER.is_file():
        print(f"ΔΕΝ ΒΡΕΘΗΚΕ: {ROSTER}", file=sys.stderr)
        return 2
    roster = json.loads(ROSTER.read_text(encoding="utf-8"))
    students = roster.get("students", [])

    rows = [s for s in students if str(s.get("status", "")).lower() == "active"]
    if args.classes:
        want = {c.strip() for c in args.classes}
        rows = [s for s in rows if str(s.get("class", "")).strip() in want]
    rows.sort(key=lambda s: (str(s.get("class") or ""), str(s.get("last_name") or "")))

    from collections import Counter
    print(f"ΜΑΘΗΤΕΣ ΠΡΟΣ ΕΙΣΑΓΩΓΗ: {len(rows)}")
    for cls, n in sorted(Counter(str(s.get('class')) for s in rows).items()):
        print(f"  {cls}: {n}")
    missing = [s for s in rows if not s.get("oid")]
    if missing:
        # Χωρίς OID ο φάκελος δεν δένει με το training log — και μια εγγραφή που
        # δεν δένει είναι ακριβώς το είδος δεδομένου που αποκλίνει σιωπηλά.
        print(f"\nΠΡΟΣΟΧΗ: {len(missing)} χωρίς OID — θα μπουν, αλλά ΔΕΝ θα δένουν με το FDMS.")

    if not args.apply:
        print("\n— ΔΟΚΙΜΗ. Δεν γράφτηκε τίποτα. Ξανατρέξε με --apply όταν σε καλύπτει. —")
        for s in rows:
            print(f"  {s.get('class'):<10} {s.get('rank','') or '':<6} "
                  f"{s.get('last_name')} {s.get('first_name') or ''}".rstrip()
                  + (f"   oid={s.get('oid')}" if s.get("oid") else "   (ΧΩΡΙΣ OID)"))
        return 0

    url, key = os.environ.get(ENV_URL, ""), os.environ.get(ENV_KEY, "")
    if not url or not key:
        print(f"ΛΕΙΠΕΙ {ENV_URL} ή {ENV_KEY} από το περιβάλλον. Δες τις οδηγίες και άνοιξε ΝΕΟ τερματικό.",
              file=sys.stderr)
        return 2

    ok = fail = 0
    for s in rows:
        try:
            rpc(url, key, "fn_upsert_student", {
                "p_actor": "admin",
                "p_last_name": s.get("last_name"),
                "p_first_name": s.get("first_name"),
                "p_rank": s.get("rank"),
                "p_mn": None if s.get("mn") is None else str(s.get("mn")),
                "p_course": s.get("class"),
                "p_oid": s.get("oid"),
            })
            ok += 1
        except urllib.error.HTTPError as e:
            # ΠΟΤΕ το κλειδί στο μήνυμα λάθους: τυπώνεται μόνο το σώμα της
            # απάντησης του διακομιστή, που δεν το περιέχει.
            fail += 1
            print(f"  ΑΠΕΤΥΧΕ {s.get('last_name')}: {e.code} {e.read().decode('utf-8', 'replace')[:200]}",
                  file=sys.stderr)
        except Exception as e:  # noqa: BLE001 — θέλουμε να συνεχίσει με τους υπόλοιπους
            fail += 1
            print(f"  ΑΠΕΤΥΧΕ {s.get('last_name')}: {type(e).__name__}", file=sys.stderr)

    print(f"\nΓΡΑΦΤΗΚΑΝ: {ok} · ΑΠΕΤΥΧΑΝ: {fail}")
    print("Η fn_upsert_student είναι ΙΔΕΜΠΟΤΗ: ξανατρέξιμο ενημερώνει, δεν διπλογράφει.")
    return 1 if fail else 0


if __name__ == "__main__":
    sys.exit(main())
