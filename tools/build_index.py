# -*- coding: utf-8 -*-
"""Χτίζει το data/observations/master_index.json — το ΠΡΩΤΟ αρχείο που φορτώνει
η εφαρμογή — από το bank που η εφαρμογή ΟΝΤΩΣ διαβάζει: data/observations2/.

    python tools/build_index.py

06/11/2026 — ΑΠΟ ΤΟ v1 ΣΤΟ v2, ΚΑΙ ΓΙΑΤΙ ΑΞΙΖΕ ΝΑ ΑΛΛΑΞΕΙ
  Μέχρι σήμερα αυτό το script διάβαζε το data/observations/<κατηγορία>/*.json —
  το bank **v1** — και από το v2 έπαιρνε μόνο το πλήθος των error modes. Αυτό
  έκανε το v1 ΑΟΡΑΤΗ ΠΡΩΤΗ ΥΛΗ: κανένα κείμενό του δεν έφτανε σε οθόνη (η
  app.js φορτώνει το v2 όποτε υπάρχει `v2_file`, και υπάρχει για κάθε item),
  αλλά η διαγραφή του θα έβγαζε **άδειο** ευρετήριο και θα σκότωνε την καρτέλα
  Remarks. Δύο σώματα της ίδιας αλήθειας, το ένα μισοαόρατο — και ήδη είχαν
  αρχίσει να αποκλίνουν: η απόφανση της 06/11 για το go-around εφαρμόστηκε
  κατά λάθος πρώτα στο v1 (29 κείμενα) και μετά σωστά στο v2 (103).

  ΤΙ ΑΛΛΑΖΕΙ ΣΤΟ ΠΕΡΙΕΧΟΜΕΝΟ ΤΟΥ ΕΥΡΕΤΗΡΙΟΥ, ΕΙΛΙΚΡΙΝΑ:
  Το πεδίο `observations` — που η app.js:112 το δείχνει ως το **σήμα δίπλα σε
  κάθε item** — μετρούσε τις εγγραφές του v1: **2.809** συνολικά, ~26 ανά item.
  Τώρα μετρά τα κείμενα του v2: **26.740**, ~230 ανά item. Ο αριθμός στην οθόνη
  ΑΛΛΑΖΕΙ, και αλλάζει προς το αληθινό — είναι πόσες παρατηρήσεις μπορεί όντως
  να δει ο εκπαιδευτής για το item, όχι το πλήθος ενός σώματος που δεν ανοίγει.

  ΤΙ ΦΕΥΓΕΙ: `file` (έδειχνε στο v1, που δεν υπάρχει πια), `desired_codes` και
  `achieved_codes` — **μηδέν** αναφορές σε όλη την εφαρμογή, μετρημένο πριν
  φύγουν. Ό,τι χρησιμοποιείται μένει: `item_id`, `item_name`, `mif_numbers`,
  `rows`, `v2_file`, `modes`, `observations`.

  ΜΟΡΦΗ: `indent=1`, όπως πριν — το αρχείο είναι παράγωγο αλλά είναι ΣΤΟ git,
  και μια αλλαγή εσοχής θα έκανε κάθε γραμμή του diff θόρυβο.
"""
import io
import json
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OBS = ROOT / "data" / "observations"          # ΕΔΩ γράφεται το ευρετήριο
OBS2 = ROOT / "data" / "observations2"        # ΑΠΟ ΕΔΩ διαβάζεται η αλήθεια
CATEGORIES = ["contact", "instrument", "formation", "vfr_navigation"]
TEXT_BLOCKS = ("texts", "texts_at", "texts_above")


def count_texts(d: dict) -> int:
    """Πόσες παρατηρήσεις κρατά όντως ένα item του v2.

    Τα τρία μπλοκ είναι οι τρεις θέσεις απέναντι στο MIF: `texts` (ο κωδικός
    όπως δόθηκε), `texts_at` (στο επίπεδο του MIF), `texts_above` (πάνω από
    αυτό). Και τα τρία είναι κείμενα που ο εκπαιδευτής μπορεί να διαλέξει, άρα
    και τα τρία μετριούνται."""
    n = 0
    for em in d.get("error_modes", []):
        for key in TEXT_BLOCKS:
            blk = em.get(key)
            if isinstance(blk, dict):
                n += sum(1 for v in blk.values() if isinstance(v, str) and v.strip())
    return n


def build() -> int:
    master = {"generated_at": datetime.now().isoformat(timespec="seconds"),
              "categories": {}, "totals": {"items": 0, "observations": 0}}
    bad = 0
    for cat in CATEGORIES:
        folder = OBS2 / cat
        entry = {"items": [], "observations": 0, "available": folder.is_dir()}
        if folder.is_dir():
            for f in sorted(folder.glob("*.json")):
                if f.name in ("index.json", "master_index.json"):
                    continue
                try:
                    d = json.loads(f.read_text(encoding="utf-8"))
                except Exception as e:                      # noqa: BLE001
                    print(f"  ! skip {cat}/{f.name}: {e}")
                    bad += 1
                    continue
                n = count_texts(d)
                entry["items"].append({
                    "v2_file": f"{cat}/{f.name}",
                    "modes": len(d.get("error_modes", [])),
                    "item_id": d.get("item_id", f.stem),
                    "item_name": d.get("item_name", f.stem),
                    "mif_numbers": d.get("mif_numbers", []),
                    "rows": d.get("mif_rows", []),
                    "observations": n,
                })
                entry["observations"] += n
        master["categories"][cat] = entry
        master["totals"]["items"] += len(entry["items"])
        master["totals"]["observations"] += entry["observations"]

    out = OBS / "master_index.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(master, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"master_index.json: {master['totals']['items']} items, "
          f"{master['totals']['observations']} remark texts "
          f"(read from {OBS2} — the bank the app loads)")
    for cat in CATEGORIES:
        e = master["categories"][cat]
        print(f"  {cat}: {len(e['items'])} items / {e['observations']} texts")
    if bad:
        print(f"  ! {bad} file(s) did not parse — the index is INCOMPLETE")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    raise SystemExit(build())
