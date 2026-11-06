# -*- coding: utf-8 -*-
"""Η ΧΕΙΡΟΚΙΝΗΤΗ ΕΠΑΛΗΘΕΥΣΗ ΤΗΣ ΟΥΣΙΑΣ — το μισό του QA που ΔΕΝ αυτοματοποιείται.

Ο βαθμολογητής του `qa_advisor.py` κρίνει **ΜΟΡΦΗ**: σήμανση, εφεύρεση id,
αυτολεξεί, πιστότητα παραπομπής. ΔΕΝ μπορεί να κρίνει αν η απάντηση είναι
**ΣΩΣΤΗ** — δεν υπάρχει γραμμένη «σωστή απάντηση» δίπλα σε ανοιχτή ερώτηση,
και δεν θα υπάρξει.

Αυτό το εργαλείο κάνει τη δουλειά που ΜΠΟΡΕΙ να γίνει: βάζει στην ίδια οθόνη
την ερώτηση, την απάντηση, και **τα μπλοκ του corpus που η απάντηση
επικαλείται** — ώστε η κρίση να γίνεται σε ένα βλέμμα, χωρίς να ψάχνει κανείς
σε 1,2 MB κειμένου. Χωρίς αυτό, η επαλήθευση ουσίας δεν γίνεται ποτέ δεύτερη
φορά, και ένας έλεγχος που γίνεται μία φορά δεν είναι έλεγχος.

    python tools/qa_review.py                     # όλες οι `qa` ερωτήσεις
    python tools/qa_review.py E02,E04 --full      # συγκεκριμένες, πλήρες κείμενο
    python tools/qa_review.py --run <αρχείο.json> # άλλη παρτίδα

Προεπιλογή: η **πιο πρόσφατη** παρτίδα στο `tools/fixtures/qa-runs/`. Ο
φάκελος είναι σκοπίμως εκτός git (κουβαλά κείμενο εγχειριδίων αυτολεξεί) —
άρα το εργαλείο δουλεύει μόνο όπου έχει τρέξει ο έλεγχος. Τεκμηρίωση:
`specs/qa-spec.md` § 6.
"""
from __future__ import annotations

import argparse
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
RUNS = ROOT / "tools" / "fixtures" / "qa-runs"
ADV = ROOT / "tools" / "advisor"

# Κάθε agent έχει ΔΙΚΟ του corpus (specs/advisor-spec.md § 2.1). Το `full`
# υπάρχει ως δίχτυ: κρατά ΟΛΑ τα μπλοκ, άρα βρίσκει και id που ο agent τα
# είδε μέσω `fetch_source`, όχι μέσα στο δικό του corpus.
CORPORA = {
    "board-director": "context-board.md",
    "syllabus": "context-syllabus.md",
    "remarks": "context-remarks.md",
    "description": "context-description.md",
}
FALLBACK = "context-full.md"

RE_BLOCK = re.compile(r"^### \[([a-z0-9-]+)\][^\n]*\n(.*?)(?=^### |\Z)", re.M | re.S)
RE_ID = re.compile(r"\b([a-z]{2,12}-\d{1,3})\b")
# Ο χώρος ονομάτων των ΑΠΑΙΤΗΣΕΩΝ. Τα `instrument-05` / `contact-05` είναι id
# ΘΕΜΑΤΩΝ φύλλου βαθμολογίας — άλλος χώρος, δεν τα ψάχνουμε στο corpus.
PREFIXES = ("cont", "fail", "ft", "gt", "role", "st")


def blocks(name: str) -> dict:
    p = ADV / name
    if not p.exists():
        return {}
    t = p.read_text(encoding="utf-8")
    return {m.group(1): m.group(2) for m in RE_BLOCK.finditer(t)}


def compact(body: str, cap: int = 700) -> str:
    """Οι ΧΡΗΣΙΜΕΣ γραμμές ενός μπλοκ: η πηγή, οι τιμές, το αυτολεξεί."""
    keep = []
    for line in body.splitlines():
        if line.startswith("> ΑΥΤΟΛΕΞΕΙ:"):
            body_txt = line[13:]
            keep.append("  ΑΥΤΟΛΕΞΕΙ: " + body_txt[:300] + ("…" if len(body_txt) > 300 else ""))
        elif line.startswith(("ΤΙΜΕΣ:", "ΠΗΓΗ:")):
            keep.append("  " + line[:300])
        elif line.strip() and not line.startswith(("ΣΧΕΤΙΚΑ:", "⚠")):
            keep.append("  " + line[:cap])
    return "\n".join(keep[:8]) or "  (κενό μπλοκ)"


def pick_run(want: set) -> pathlib.Path | None:
    """Η πιο πρόσφατη παρτίδα — ή, αν ζητήθηκαν ids, η πιο πρόσφατη που ΤΑ ΕΧΕΙ.
    (Αλλιώς «qa_review E02» έπεφτε σε μια παρτίδα υποδομής και δεν έδειχνε τίποτα.)"""
    files = sorted(RUNS.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True)
    if want:
        for p in files:
            try:
                d = json.loads(p.read_text(encoding="utf-8"))
            except Exception:
                continue
            if want & {r["case"]["id"] for r in d.get("rows", []) if "case" in r}:
                return p
    return files[0] if files else None


def main() -> int:
    ap = argparse.ArgumentParser(description="Δίπλα-δίπλα απάντηση και corpus.")
    ap.add_argument("ids", nargs="?", default="", help="ids ερωτήσεων, χωρισμένα με κόμμα")
    ap.add_argument("--run", default="", help="αρχείο παρτίδας (default: το πιο πρόσφατο)")
    ap.add_argument("--full", action="store_true", help="πλήρες κείμενο απάντησης")
    ap.add_argument("--kinds", default="qa", help="είδη προς ανάγνωση (default: qa)")
    ap.add_argument("--cited", action="store_true",
                    help="δείξε ΟΛΑ τα id που επικαλείται, όχι μόνο τα αναμενόμενα")
    a = ap.parse_args()

    want = {x.strip() for x in a.ids.split(",") if x.strip()}
    path = pathlib.Path(a.run) if a.run else pick_run(want)
    if not path or not path.exists():
        print(f"Δεν βρέθηκε παρτίδα στο {RUNS}. Τρέξε πρώτα: python tools/qa_advisor.py",
              file=sys.stderr)
        return 2

    d = json.loads(path.read_text(encoding="utf-8"))
    kinds = {x.strip() for x in a.kinds.split(",") if x.strip()}
    B = {k: blocks(v) for k, v in CORPORA.items()}
    B["_full"] = blocks(FALLBACK)
    if not any(B.values()):
        print(f"⚠ Κανένα corpus στο {ADV} — τρέξε: python tools/build_advisor_context.py --all",
              file=sys.stderr)

    print(f"ΠΑΡΤΙΔΑ {d.get('batch') or '—'}  ·  {path.name}")
    shown = 0
    for r in d.get("rows", []):
        c = r["case"]
        if (kinds and c.get("kind") not in kinds) or (want and c["id"] not in want):
            continue
        shown += 1
        sc = r.get("grade", {}).get("scores", {}) if isinstance(r.get("grade"), dict) else {}
        print("=" * 78)
        head = f"{c['id']} · {c['agent']}"
        if c.get("expect_ids"):
            head += f" · αναμενόμενα {c['expect_ids']}"
        print(head)
        if sc:
            bad = [k for k, v in sc.items() if v is False]
            print("ΒΑΘΜΟΣ: " + ("καθαρό" if not bad else "✖ " + ", ".join(bad)))
        print(f"Q: {c['q']}")
        print("-" * 78)
        print(r["text"] if a.full else r["text"][:1500])
        print("-" * 78)

        ids = list(c.get("expect_ids") or [])
        if a.cited:
            for i in RE_ID.findall(r["text"]):
                if i.split("-")[0] in PREFIXES and i not in ids:
                    ids.append(i)
        for i in ids[:8]:
            body = (B.get(c["agent"], {}).get(i) or B["_full"].get(i)
                    or next((bb[i] for bb in B.values() if i in bb), None))
            print(f"ΠΗΓΗ [{i}]:")
            print(compact(body) if body else "  (δεν υπάρχει σε κανένα corpus)")
        print()

    if not shown:
        print("Καμία ερώτηση δεν ταίριαξε. Έλεγξε τα ids ή το --kinds.", file=sys.stderr)
        return 1
    word = "ερώτηση" if shown == 1 else "ερωτήσεις"
    print(f"{shown} {word}. Η κρίση της ουσίας είναι ανθρώπου — ο κώδικας κρίνει μορφή.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
