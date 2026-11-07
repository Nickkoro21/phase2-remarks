#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""ΤΟ ΔΕΛΤΙΟ ΕΛΕΓΧΟΥ ΤΩΝ ΣΗΜΕΙΩΣΕΩΝ — μία κάρτα ανά σημείωση.

ΓΙΑΤΙ ΥΠΑΡΧΕΙ (απόφανση ιδιοκτήτη 07/11/2026)
──────────────────────────────────────────────────────────────────────────
«Θα τα εξετάσουμε ανά περίπτωση ένα-ένα. Θα μου φτιάξεις ένα τοπικό HTML…
θα έχω δίπλα αυτά τα κουμπάκια που ανοίγουν το PDF, να βλέπω ακριβώς τι λέει
το κείμενο στη μία περίπτωση, τι λέει στην άλλη. Και για ποιο λόγο
επισημάνθηκε… να μπορώ να βάλω και εγώ τη δική μου κατηγορία, ίσως και ένα
μικρό σχόλιο.»

Η αυτόματη ταξινόμηση (`mark_of`) διαβάζει ΜΟΝΟ το ρητό πρόθεμα κάθε
σημείωσης. Για τις υπόλοιπες βάζει ⚠ ΑΛΥΤΟ **από προεπιλογή, όχι από κρίση** —
και αυτό το αρχείο το λέει ΡΗΤΑ σε κάθε κάρτα, στο πεδίο `why`. Η κρίση είναι
του ιδιοκτήτη· εδώ του δίνουμε το τραπέζι.

ΤΙ ΔΕΝ ΚΑΝΕΙ. Δεν πειράζει καμία σημείωση. Δεν γράφει στα `data/requirements`.
Δεν ξέρει τίποτα για δίκτυο, bridge ή export. Παράγει ΕΝΑ json που το σερβίρει
ο ήδη υπάρχων τοπικός server (`data/*.json` είναι στη λίστα του serve_app).
"""
from __future__ import annotations

import hashlib
import io
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))

from build_advisor_context import mark_why  # noqa: E402  (ΜΙΑ πηγή αλήθειας)

OUT = ROOT / "data" / "flag-review-items.json"
SRC_DIRS = [ROOT / "data" / "requirements", ROOT / "data"]
RE_ID = re.compile(r"\b([a-z][a-z_]{1,22}-\d{1,3})\b")

SCHEMA = "fdms-flag-review-v1"


def short(s: str, n: int = 260) -> str:
    s = " ".join(str(s or "").split())
    return s if len(s) <= n else s[: n - 1] + "…"


def collect(obj, file_name: str, domain: str, out: list, ids: set,
            chain: tuple = (), topic: str = "", req: str = "", src=None):
    """Κατεβαίνει το δέντρο κρατώντας ΟΛΗ την αλυσίδα των id ως τη σημείωση.

    ΓΙΑΤΙ ΑΛΥΣΙΔΑ ΚΑΙ ΟΧΙ ΕΝΑΣ ΙΔΙΟΚΤΗΤΗΣ. Στα δέντρα απόφασης το κοντινότερο
    `id` είναι ο ΚΟΜΒΟΣ (`b_ckr`), που ΔΕΝ έχει σελίδα στο ευρετήριο — το
    κομμάτι με τη σελίδα είναι ο πρόγονός του. Κρατάμε και τα δύο και αφήνουμε
    τον θεατή να διαλέξει το πρώτο που όντως ανοίγει PDF."""
    if isinstance(obj, dict):
        oid = str(obj.get("id") or "")
        ch = chain + (oid,) if oid and (not chain or chain[-1] != oid) else chain
        if obj.get("id"):
            ids.add(str(obj["id"]))
        otopic = str(obj.get("topic") or "") or topic
        oreq = str(obj.get("requirement") or obj.get("text") or "") or req
        osrc = obj.get("source") or obj.get("ref") or src
        own = ch[-1] if ch else ""
        for kind in ("flags", "unresolved"):
            for t in obj.get(kind) or []:
                if not isinstance(t, str) or not t.strip():
                    continue
                mark, prefix, why = mark_why(t)
                out.append({
                    "key": hashlib.sha1((own + "|" + t).encode("utf-8")).hexdigest()[:10],
                    "owner": own, "chain": [c for c in ch if c], "kind": kind, "file": file_name, "domain": domain,
                    "topic": short(otopic, 120), "requirement": short(oreq),
                    "source": short(json.dumps(osrc, ensure_ascii=False)
                                    if isinstance(osrc, (dict, list)) else osrc, 200),
                    "mark": mark, "prefix": prefix, "why": why, "text": t.strip(),
                })
        for k, v in obj.items():
            if k not in ("flags", "unresolved"):
                collect(v, file_name, domain, out, ids, ch, otopic, oreq, osrc)
    elif isinstance(obj, list):
        for v in obj:
            collect(v, file_name, domain, out, ids, chain, topic, req, src)


def main() -> int:
    items: list[dict] = []
    ids: set[str] = set()
    seen: set[pathlib.Path] = set()
    for d in SRC_DIRS:
        if not d.is_dir():
            continue
        for p in sorted(d.glob("*.json")):
            if p in seen or p.name.startswith("flag-review"):
                continue
            seen.add(p)
            try:
                j = json.loads(p.read_text(encoding="utf-8"))
            except Exception:
                continue
            collect(j, p.name, str(j.get("domain") or p.stem) if isinstance(j, dict) else p.stem,
                    items, ids)

    # ΟΙ ΠΑΡΑΠΟΜΠΕΣ ΜΕΣΑ ΣΤΟ ΚΕΙΜΕΝΟ. Πολλές σημειώσεις γράφουν «Βλ. fail-38» ή
    # ονομάζουν το άλλο σκέλος της απόκλισης. Τις βγάζουμε ΕΔΩ ώστε ο θεατής να
    # δίνει κουμπί ⌖ και για ΤΗΝ ΑΛΛΗ πλευρά: ο ιδιοκτήτης ζήτησε να βλέπει «τι
    # λέει το κείμενο στη μία περίπτωση, τι λέει στην άλλη».
    for it in items:
        refs = [m for m in RE_ID.findall(it["text"]) if m in ids and m != it["owner"]]
        it["refs"] = sorted(set(refs))

    # Σταθερή σειρά: πρώτα όσα θέλουν κρίση, μετά τα υπόλοιπα· μέσα σε κάθε
    # ομάδα κατά αρχείο και id, ώστε δύο τρεξίματα να δίνουν ΤΟ ΙΔΙΟ αρχείο.
    order = {"⚠ ΑΛΥΤΟ": 0, "± ΑΠΟΚΛΙΣΗ": 1, "✓ ΣΥΜΦΩΝΟΥΝ": 2,
             "○ ΣΙΩΠΗ": 3, "◇ ΑΛΛΟ ΠΕΔΙΟ": 4, "· ΨΗΦΙΟΠΟΙΗΣΗ": 5}
    items.sort(key=lambda i: (order.get(i["mark"], 9), i["file"], i["owner"], i["key"]))

    counts: dict[str, int] = {}
    for it in items:
        counts[it["mark"]] = counts.get(it["mark"], 0) + 1
    tagged = sum(1 for i in items if i["prefix"])

    doc = {
        "schema": SCHEMA,
        "note": ("Δελτίο ελέγχου σημειώσεων. Η σήμανση είναι ΑΥΤΟΜΑΤΗ και βγαίνει "
                 "ΜΟΝΟ από το ρητό πρόθεμα κάθε σημείωσης· όπου δεν υπάρχει "
                 "πρόθεμα, το ⚠ ΑΛΥΤΟ είναι ΠΡΟΕΠΙΛΟΓΗ, όχι κρίση. Η κρίση είναι "
                 "του ιδιοκτήτη και καταγράφεται χωριστά."),
        "total": len(items), "with_prefix": tagged, "counts": counts,
        "items": items,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with io.open(OUT, "w", encoding="utf-8", newline="\n") as f:
        json.dump(doc, f, ensure_ascii=False, indent=1)
        f.write("\n")

    print(f"σημειώσεις: {len(items)}  ·  με ρητό πρόθεμα: {tagged}  ·  "
          f"με παραπομπή σε άλλο id: {sum(1 for i in items if i['refs'])}")
    for k in sorted(counts, key=lambda x: order.get(x, 9)):
        print(f"  {k:<16} {counts[k]:>5}")
    print(f"→ {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
