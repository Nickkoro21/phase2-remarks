#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ΤΟ CORPUS ΤΩΝ AGENTS — build_advisor_context.py
════════════════════════════════════════════════════════════════════════════

ΤΙ ΦΤΙΑΧΝΕΙ. Ένα αρχείο κειμένου, `tools/advisor/context.md`, που είναι ΟΛΟ το
κανονιστικό υλικό του project σε μορφή που διαβάζει ένα μοντέλο: 482 απαιτήσεις,
ο πίνακας ανοχής, τα δέντρα αποφάσεων, τα γεγονότα του syllabus, και — κρίσιμο —
οι ΑΠΟΦΑΝΣΕΙΣ του ιδιοκτήτη. Το corpus πηγαίνει στο system prompt του agent και
μένει στο prompt cache· κάθε ερώτηση διαβάζει από εκεί στο 5% της τιμής.

ΓΙΑΤΙ ΟΧΙ ΤΑ PDF. Το ψηφιοποιημένο υλικό είναι ΑΝΩΤΕΡΟ ως context: κάθε κομμάτι
φέρει id, αρχείο, σελίδα και ρητή παραπομπή, άρα ο agent μπορεί να υποχρεωθεί να
απαντά ΜΟΝΟ με παραπομπές που υπάρχουν — και να λέει «δεν προβλέπεται στις πηγές
μου» αντί να επινοήσει. Το ωμό PDF θα του έπαιρνε αυτή την ακρίβεια.

ΟΙ ΠΑΡΑΠΟΜΠΕΣ ΜΕΣΑ ΣΤΙΣ ΠΑΡΑΠΟΜΠΕΣ. Απόφανση ιδιοκτήτη 17/10/2026: «να μη σου
λέει "παράγραφος 1ζ του σχετικού (α) σύμφωνα με την παράγραφο β, δ"». 31 από τις
89 απαιτήσεις αποτυχίας περιέχουν τέτοια εσωτερική παραπομπή, και κάθε απαίτηση
φέρει ήδη `links[]`. Ο builder ΕΝΣΩΜΑΤΩΝΕΙ το κείμενο κάθε παραπομπής μέσα στην
απαίτηση που την καλεί. Είναι ΝΤΕΤΕΡΜΙΝΙΣΤΙΚΟΣ μετασχηματισμός — τον κάνουν τα
δεδομένα, όχι το μοντέλο.

Η ΣΤΑΘΕΡΟΤΗΤΑ ΕΙΝΑΙ ΧΡΗΜΑ. Το prompt caching ταιριάζει ΠΡΟΘΕΜΑ: μία αλλαγή byte
ακυρώνει τα πάντα από εκεί και κάτω. Γι' αυτό η σειρά είναι απολύτως ντετερμινι-
στική (ταξινόμηση παντού, καμία ημερομηνία εκτέλεσης, κανένα τυχαίο), και το
corpus τελειώνει με ένα `md5` του ίδιου του περιεχομένου ώστε να φαίνεται αμέσως
αν κάτι μετακινήθηκε.

ΤΡΕΞΙΜΟ:  python tools/build_advisor_context.py            → γράφει το αρχείο
          python tools/build_advisor_context.py --stats    → μόνο μετρήσεις
"""
from __future__ import annotations

import argparse
import hashlib
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
REQ = ROOT / "data" / "requirements"
OUT_DIR = ROOT / "tools" / "advisor"
OUT = OUT_DIR / "context.md"

# Τα πέντε αρχεία απαιτήσεων, ΜΕ ΣΤΑΘΕΡΗ ΣΕΙΡΑ. Η σειρά είναι μέρος του
# προθέματος του cache: μην την αλλάξεις χωρίς λόγο.
REQ_FILES = [
    ("failure_procedures.json", "ΑΠΟΤΥΧΙΕΣ ΚΑΙ ΔΙΑΔΙΚΑΣΙΕΣ ΠΑΡΑΠΟΜΠΗΣ"),
    ("ground_training.json", "ΕΚΠΑΙΔΕΥΣΗ ΕΔΑΦΟΥΣ"),
    ("simulator_training.json", "ΕΚΠΑΙΔΕΥΣΗ ΣΤΟΝ ΕΞΟΜΟΙΩΤΗ (F/S)"),
    ("flight_training.json", "ΕΚΠΑΙΔΕΥΣΗ ΑΕΡΟΣ"),
    ("roles_continuation.json", "ΡΟΛΟΙ ΚΑΙ ΣΥΝΕΧΙΣΗ ΕΚΠΑΙΔΕΥΣΗΣ"),
]

# ── ΕΝΑ CORPUS ΑΝΑ AGENT, ΟΧΙ ΕΝΑ ΓΙΑ ΟΛΟΥΣ ─────────────────────────────────
# Το πλήρες corpus είναι ~800 χιλ. χαρακτήρες. Σε ΚΑΘΕ ερώτηση ο agent το
# διαβάζει ολόκληρο από το cache — άρα ό,τι δεν του χρειάζεται το πληρώνει
# χωρίς αντάλλαγμα, ΚΑΙ του θολώνει την εικόνα. Ο Board Director δεν χρειάζεται
# τις 152 απαιτήσεις ανά έξοδο· ο syllabus τις χρειάζεται και δεν χρειάζεται
# τις σκάλες παραπομπής. Μικρότερο corpus = φθηνότερο ΚΑΙ ακριβέστερο.
# Ο πίνακας ανοχής και τα δέντρα μπαίνουν μόνο όπου `board` είναι True.
# `order` (17/10/2026, μετά την πρώτη πραγματική χρήση): ο Board Director δεν
# ήξερε τη ΣΕΙΡΑ των εξόδων — το corpus του είναι αποτυχίες + έδαφος + F/S, η
# ροή ζει στο syllabus. Σχεδόν κάθε πραγματική ερώτηση όμως είναι «πέταξε την
# C4602 και μετά την C4790», και σύμβουλος που μαντεύει τη σειρά είναι
# επικίνδυνος ακριβώς εκεί που θέλουμε ασφάλεια. Ένας λιτός πίνακας από το
# flowchart2.json (uid, τίτλος, ώρες, σημαίες), αμέσως μετά τα αριθμητικά
# γεγονότα. Αλλάζει το cached πρόθεμα ΜΙΑ φορά — μία εγγραφή cache, αξίζει.
PROFILES = {
    "board": {
        "files": ["failure_procedures.json", "ground_training.json", "simulator_training.json"],
        "board": True,
        "order": True,
        "who": "ο σύμβουλος του Συμβουλίου Πτητικής Ικανότητας",
    },
    "syllabus": {
        "files": ["flight_training.json", "simulator_training.json", "roles_continuation.json"],
        "board": False,
        "who": "ο σύμβουλος της ροής εκπαίδευσης",
    },
    "full": {
        "files": [n for n, _ in REQ_FILES],
        "board": True,
        "order": True,
        "who": "ο σύμβουλος, με όλο το υλικό",
    },
    # Οι δύο συνθετικοί agents δεν ζουν στις απαιτήσεις — ζουν στα ΣΥΜΒΟΛΑΙΑ
    # ΥΦΟΥΣ και στα κριτήρια. Το `extras` προσαρτά αρχεία ΑΥΤΟΥΣΙΑ, γιατί ένα
    # spec χάνει το νόημά του αν το περιλάβεις.
    "remarks": {
        "files": [],
        "board": False,
        "who": "ο συνθέτης παρατηρήσεων Φύλλου Βαθμολογίας",
        "extras": ["specs/observations-style.md", "data/human_factors.json"],
    },
    "description": {
        "files": [],
        "board": False,
        "who": "ο συνθέτης του μπλοκ περιγραφής",
        "extras": ["specs/description-spec.md", "data/descriptions.json"],
    },
}


def load(name: str) -> dict:
    return json.loads((REQ / name).read_text(encoding="utf-8"))


def clean(s) -> str:
    """Μία γραμμή, χωρίς διπλά κενά. Το κείμενο των πηγών δεν αλλάζει αλλιώς."""
    return re.sub(r"\s+", " ", str(s or "")).strip()


def src_of(r: dict) -> str:
    s = r.get("source") or {}
    f = pathlib.Path(str(s.get("file", ""))).name
    page = s.get("page_pdf")
    ref = clean(s.get("ref"))
    bits = [b for b in (f, f"σελ.PDF {page}" if page else "", ref) if b]
    return " · ".join(bits)


def index_all(files) -> dict:
    """id → απαίτηση, για ΟΛΑ τα αρχεία: ο γράφος `links` περνά τα σύνορά τους."""
    idx = {}
    for name, _ in files:
        for r in load(name).get("requirements", []):
            if r.get("id"):
                idx[r["id"]] = r
    return idx


XREF = re.compile(r"παρ\.|παράγραφο|υποπαράγραφ|σχετικ|§|εδάφ", re.I)

# Τα ids που ΤΥΠΩΝΟΝΤΑΙ πλήρη μέσα στο corpus. Γεμίζει στη main() πριν
# χτιστούν τα δέντρα, ώστε οι παραπομπές τους να δείχνουν αντί να
# αντιγράφουν. Module-level γιατί το διαβάζει η render_trees.
CORPUS_IDS: set[str] = set()


def render_req(r: dict, idx: dict, inline: bool) -> list[str]:
    """Μία απαίτηση. `inline`: ενσωμάτωσε το κείμενο όσων παραπέμπει."""
    out = [f"### [{r.get('id')}] {clean(r.get('topic'))}"]
    if r.get("requirement"):
        out.append(clean(r["requirement"]))
    if r.get("verbatim"):
        out.append(f"> ΑΥΤΟΛΕΞΕΙ: {clean(r['verbatim'])}")
    if r.get("values"):
        vals = ", ".join(f"{k}={v}" for k, v in sorted(r["values"].items()))
        out.append(f"ΤΙΜΕΣ: {vals}")
    for step in r.get("procedure") or []:
        out.append(f"  → {clean(step)}")
    if src_of(r):
        out.append(f"ΠΗΓΗ: {src_of(r)}")

    # ── ΟΙ ΠΑΡΑΠΟΜΠΕΣ ΜΕΣΑ ΣΤΗΝ ΠΑΡΑΠΟΜΠΗ ──────────────────────────────────
    # Μόνο όταν το ίδιο το κείμενο παραπέμπει κάπου (XREF) — αλλιώς το corpus
    # θα τριπλασιαζόταν αντιγράφοντας γειτονιές που κανείς δεν ρώτησε.
    links = [l for l in (r.get("links") or []) if l in idx]
    if inline and links and XREF.search((r.get("verbatim") or "") + (r.get("requirement") or "")):
        out.append("ΤΟ ΚΕΙΜΕΝΟ ΤΩΝ ΠΑΡΑΠΟΜΠΩΝ ΤΟΥ (ώστε να μη χρειάζεται να πας αλλού):")
        for lid in sorted(links):
            lr = idx[lid]
            t = clean(lr.get("verbatim")) or clean(lr.get("requirement"))
            out.append(f"  • [{lid}] {clean(lr.get('topic'))} — {t[:600]}")
    elif links:
        out.append("ΣΧΕΤΙΚΑ: " + ", ".join(sorted(links)))
    out.append("")
    return out


def render_matrix(d: dict) -> list[str]:
    out = ["", "## Ο ΣΥΓΚΕΝΤΡΩΤΙΚΟΣ ΠΙΝΑΚΑΣ ΑΝΟΧΗΣ — «ΠΟΣΕΣ ΦΟΡΕΣ ΧΩΡΙΣ ΣΥΜΒΟΥΛΙΟ»", ""]
    for note in d.get("reading_notes") or []:
        out.append(f"ΣΗΜΕΙΩΣΗ ΑΝΑΓΝΩΣΗΣ: {clean(note)}")
    out.append("")
    for e in d.get("entries", []):
        out.append(f"### {clean(e.get('failure_kind'))}")
        a = e.get("allowed_before_board") or {}
        if a.get("statement"):
            out.append(clean(a["statement"]))
        out.append(
            f"ΑΝΕΚΤΑ ΠΕΡΙΣΤΑΤΙΚΑ ΠΡΙΝ ΤΗΝ ΚΡΙΣΗ: {a.get('occurrences_tolerated_before_referral')}"
            f" · ΕΝΔΙΑΜΕΣΕΣ ΕΞΕΤΑΣΕΙΣ: {clean(a.get('checks_between_referral_and_board'))}"
        )
        for rung in e.get("ladder") or []:
            out.append(f"  → {clean(rung)}")
        if e.get("threshold_verbatim"):
            out.append(f"> ΑΥΤΟΛΕΞΕΙ: {clean(e['threshold_verbatim'])}")
        ids = sorted({clean(s.get("requirement_id")) for s in e.get("sources") or [] if s.get("requirement_id")})
        if ids:
            out.append("ΑΠΑΙΤΗΣΕΙΣ: " + ", ".join(ids))
        out.append("")
    return out


def render_trees(d: dict) -> list[str]:
    out = ["", "## ΤΑ ΔΕΝΤΡΑ ΑΠΟΦΑΣΕΩΝ ΤΟΥ ΣΥΜΒΟΥΛΙΟΥ", ""]
    if d.get("rule"):
        out.append(f"ΚΑΝΟΝΑΣ: {clean(d['rule'])}")
    trees = d.get("trees") or []
    if isinstance(trees, dict):
        trees = [dict(v, id=k) for k, v in sorted(trees.items())]
    for t in sorted(trees, key=lambda x: str(x.get("id") or x.get("key") or "")):
        out.append(f"### ΟΙΚΟΓΕΝΕΙΑ: {clean(t.get('title') or t.get('id'))}")
        nodes = t.get("nodes") or []
        if isinstance(nodes, dict):
            nodes = [dict(v, id=k) for k, v in sorted(nodes.items())]
        for n in nodes:
            out.append(f"— ΚΟΜΒΟΣ [{clean(n.get('id'))}] {clean(n.get('label'))}")
            for fld, lab in (("condition", "ΣΥΝΘΗΚΗ"), ("threshold", "ΚΑΤΩΦΛΙ"),
                             ("outcome", "ΕΚΒΑΣΗ"), ("next_with", "ΠΕΤΑΕΙ ΜΕΤΑ ΜΕ")):
                if n.get(fld):
                    out.append(f"   {lab}: {clean(n[fld])}")
            for c in n.get("cites") or []:
                rid = clean(c.get("requirement_id"))
                # ΟΧΙ ΔΕΥΤΕΡΗ ΦΟΡΑ ΤΟ ΙΔΙΟ ΚΕΙΜΕΝΟ. Αν η απαίτηση τυπώνεται ήδη
                # παραπάνω με το id της, εδώ αρκεί ο δείκτης: 143 παραπομπές ×
                # 500 χαρακτήρες είναι ~7% του corpus σε καθαρή επανάληψη, και
                # ένα μοντέλο που βλέπει το ίδιο εδάφιο δύο φορές δεν μαθαίνει
                # περισσότερα — μπερδεύεται για το αν είναι δύο διαφορετικά.
                known = rid in CORPUS_IDS
                tail = "(το πλήρες κείμενο παραπάνω, με αυτό το id)" if known \
                    else clean(c.get("verbatim"))[:500]
                out.append(
                    f"   ΠΑΡΑΠΟΜΠΗ [{rid}] {clean(c.get('ref'))}"
                    f" (σελ.PDF {c.get('page_pdf')}): {tail}"
                )
                if c.get("explanation"):
                    out.append(f"      ΕΡΜΗΝΕΙΑ: {clean(c['explanation'])}")
            for rl in n.get("rulings") or []:
                out.append(
                    f"   ✓ ΑΠΟΦΑΝΣΗ {clean(rl.get('date'))} ({clean(rl.get('by'))}): {clean(rl.get('text'))}"
                )
                if rl.get("quote"):
                    out.append(f"      ΜΕ ΤΑ ΛΟΓΙΑ ΤΟΥ: «{clean(rl['quote'])}»")
            for u in n.get("unresolved") or []:
                out.append(f"   ⚠ ΑΛΥΤΟ: {clean(u)}")
        out.append("")
    return out


TRACKS = [("contact", "ΠΡΟΣΑΡΜΟΓΗ (contact)"), ("instrument", "ΟΡΓΑΝΑ (instrument)"),
          ("formation", "ΣΧΗΜΑΤΙΣΜΟΣ (formation)"), ("vfr_navigation", "ΝΑΥΤΙΛΙΑ (vfr_navigation)")]


def render_order(fc: dict) -> list[str]:
    """Η ΣΕΙΡΑ ΤΩΝ ΕΞΟΔΩΝ — πίνακας, όχι πρόζα. Η σειρά του flowchart2.json ΕΙΝΑΙ
    η τυπωμένη σειρά του προγράμματος ανά κατηγορία (έτσι μετρά και ο
    υπολογισμός της ΠΡΟ-ΜΟΝΟΣ παραπάνω). Μόνο γεγονότα: κωδικός, ενότητα,
    τίτλος, ώρες, σημαίες — κανένας κανόνας χωρίς παραπομπή εδώ."""
    out = ["", "## Η ΣΕΙΡΑ ΤΩΝ ΕΞΟΔΩΝ ΤΟΥ ΠΡΟΓΡΑΜΜΑΤΟΣ (από το data/flowchart2.json)", "",
           "ΠΩΣ ΔΙΑΒΑΖΕΤΑΙ: α/α στην κατηγορία · κωδικός · ενότητα · τίτλος · ώρες · σημαίες. "
           "ΑΞ = Αξιολόγηση (checkride) · ΜΟΝΟΣ = η πρώτη ΜΟΝΟΣ · (Μ) = έξοδος που μπορεί να πεταχτεί ΜΟΝΟΣ · "
           "Ν = νυχτερινή. «Πριν/μετά» μεταξύ δύο εξόδων της ίδιας κατηγορίας σημαίνει τη θέση τους σε αυτή τη λίστα. "
           "Οι κατηγορίες τρέχουν παράλληλα — η λίστα δεν λέει ποια κατηγορία πετιέται πρώτη.", ""]
    for band, lab in (("flights", "ΑΕΡΟΣ"), ("fs", "F/S — εξομοιωτής")):
        for tr, tl in TRACKS:
            rows = [s for s in fc["sorties"] if s.get("band") == band and s.get("track") == tr]
            if not rows:
                continue
            out.append(f"### {lab} · {tl} — {len(rows)} έξοδοι")
            for i, s in enumerate(rows, 1):
                flags = [f for f, on in (("ΑΞ", s.get("checkride")), ("ΜΟΝΟΣ", s.get("first_solo")),
                                         ("(Μ)", s.get("solo_candidate") and not s.get("first_solo")),
                                         ("Ν", s.get("night"))) if on]
                h = f"{s['hours']}h" if s.get("hours") is not None else "—"
                out.append(f"{i:>2}. {s['id']} · {clean(s.get('section_verbatim'))} · {clean(s.get('name'))} · {h}"
                           + (" · " + " ".join(flags) if flags else ""))
            out.append("")
    return out


HEAD = """# ΤΟ ΚΑΝΟΝΙΣΤΙΚΟ CORPUS ΤΟΥ FDMS — Phase II (T-6A)

ΔΙΑΒΑΣΕ ΑΥΤΟ ΠΡΩΤΑ.

1. Ό,τι ακολουθεί είναι **ψηφιοποιημένο και επικυρωμένο** υλικό από τρεις πηγές:
   ΒαΔ 3-01/2025 (ΔΑΕ), ΠΔ 29/2020 (ΦΕΚ Α΄57) και Phase 2 Syllabus 2025.
   Κάθε κομμάτι φέρει **id**, **αρχείο**, **σελίδα PDF** και **ρητή παραπομπή**.
2. Απαντάς **ΜΟΝΟ** από εδώ. Κάθε ισχυρισμός σου κουβαλά το id και την παραπομπή
   του. Αν κάτι δεν υπάρχει εδώ, η απάντηση είναι **«δεν προβλέπεται στις πηγές
   μου»** — ποτέ εικασία που μοιάζει με κανόνα.
3. Όπου βλέπεις **⚠ ΑΛΥΤΟ**, οι πηγές **σιωπούν ή αντιφάσκουν**. Το λες ρητά και
   αφήνεις την απόφαση στον ιδιοκτήτη. Αυτά δεν είναι αδυναμία — είναι ο λόγος
   που υπάρχει αυτό το corpus.
4. Όπου βλέπεις **✓ ΑΠΟΦΑΝΣΗ**, ο ιδιοκτήτης έχει ήδη αποφανθεί. Η απόφανση
   **υπερισχύει** κάθε δικής σου ανάγνωσης, και τη μεταφέρεις με τα λόγια του.
5. Phase II **μόνο**. Οι διατάξεις Phase III/IV αναφέρονται μόνο όπου μια
   διάταξη Phase II τις επικαλείται.
6. **ΠΟΤΕ** μη συμπεράνεις ποσό, ποσοστό ή προθεσμία που δεν είναι τυπωμένο.

"""


def main() -> int:
    ap = argparse.ArgumentParser(description="Χτίζει το corpus των agents.")
    ap.add_argument("--stats", action="store_true", help="μόνο μετρήσεις, δεν γράφει")
    ap.add_argument("--profile", default="board", choices=sorted(PROFILES),
                    help="ποιου agent το corpus (προεπιλογή: board)")
    ap.add_argument("--all", action="store_true", help="χτίσε όλα τα προφίλ")
    args = ap.parse_args()
    if args.all:
        rc = 0
        for name in sorted(PROFILES):
            print(chr(10) + "-- PROFIL: " + name + " --")
            rc |= build(name, args.stats)
        return rc
    return build(args.profile, args.stats)


def build(profile: str, stats_only: bool) -> int:
    prof = PROFILES[profile]
    files = [(n, t) for n, t in REQ_FILES if n in prof["files"]]
    out_path = OUT_DIR / f"context-{profile}.md"

    idx = index_all(REQ_FILES)          # ο γράφος links δείχνει παντού
    CORPUS_IDS.clear()
    CORPUS_IDS.update(r for n, _ in files for r in
                      [x.get("id") for x in load(n).get("requirements", [])] if r)
    parts: list[str] = [HEAD]

    # ── ΤΑ ΓΕΓΟΝΟΤΑ ΤΟΥ SYLLABUS ────────────────────────────────────────────
    # Πρώτα, γιατί σχεδόν κάθε ερώτηση για κατώφλια τα χρειάζεται, και γιατί
    # είναι ο ΜΟΝΟΣ τρόπος να υπολογιστεί το ΠΔ άρθρο 3 παρ.1δ.
    fc = json.loads((ROOT / "data" / "flowchart2.json").read_text(encoding="utf-8"))
    air = [s for s in fc["sorties"] if s.get("band") == "flights"]
    from collections import Counter
    per = Counter(s["track"] for s in air)
    con = [s["uid"].replace("s:", "") for s in air if s["track"] == "contact"]
    pre = con.index("C4791") + 1
    parts.append(
        "## ΤΑ ΑΡΙΘΜΗΤΙΚΑ ΓΕΓΟΝΟΤΑ ΤΟΥ ΣΤΑΔΙΟΥ (Phase II)\n\n"
        f"- ΣΥΝΟΛΟ ΠΤΗΣΕΩΝ ΑΕΡΟΣ: **{len(air)}** — "
        + " · ".join(f"{k} {v}" for k, v in sorted(per.items()))
        + "\n  Τυπωμένο σε ΔΥΟ σημεία που συμφωνούν: Syllabus σελ.PDF 163 και 3-01 Πίνακας 1 (σελ.PDF 37).\n"
        f"- ΦΑΣΗ «ΠΡΟ ΜΟΝΟΣ»: **{pre}** πτήσεις (14 συγκυβέρνησης + 1 ΜΟΝΟΣ), "
        "τελειώνει στην C4791. Τυπωμένο στον πίνακα MIF «CONTACT (PRE-SOLO) / T-6A», Syllabus σελ.PDF 92.\n"
        "- Η C4790 είναι η **Αξιολόγηση** για τη ΜΟΝΟΣ και η C4791 η **πρώτη ΜΟΝΟΣ**· "
        "πετιούνται την ίδια μέρα με το ίδιο Α/Φ, και κατά 3-01 §55 μετρούν ως **μία έξοδος** για τη μέγιστη απασχόληση.\n"
        f"- ΑΡΑ ΠΔ άρθρο 3 παρ.1δ: 40% × {pre} = **6** πτήσεις 0-59% στην ΠΡΟ ΜΟΝΟΣ · "
        f"20% × {len(air)} = **17** στο Στάδιο. ✓ ΑΠΟΦΑΝΣΗ ιδιοκτήτη 17/10/2026: ο παρονομαστής είναι "
        "το **τυπωμένο πρόγραμμα**, όχι οι μέχρι τώρα εκτελεσμένες — «όχι σε όσες έχει πετάξει μέχρι "
        "τώρα, αλλά στο σύνολο, είτε για το προ-μόνος είτε για όλο το στάδιο».\n"
    )

    # ── Η ΣΕΙΡΑ ΤΩΝ ΕΞΟΔΩΝ (board, full) — αμέσως μετά τα αριθμητικά γεγονότα ──
    if prof.get("order"):
        parts.append("\n".join(render_order(fc)) + "\n")

    # ── ΟΙ ΠΕΝΤΕ ΟΜΑΔΕΣ ΑΠΑΙΤΗΣΕΩΝ ──────────────────────────────────────────
    counts = {}
    for name, title in files:
        d = load(name)
        rs = sorted(d.get("requirements", []), key=lambda r: str(r.get("id")))
        counts[name] = len(rs)
        parts.append(f"\n## {title} ({len(rs)} απαιτήσεις)\n")
        if d.get("scope"):
            parts.append(f"ΕΜΒΕΛΕΙΑ: {clean(d['scope'])}\n")
        # Οι εσωτερικές παραπομπές ενσωματώνονται ΜΟΝΟ στις αποτυχίες: εκεί ζει
        # το πρόβλημα που ανέφερε ο ιδιοκτήτης, και εκεί κοστίζει ο πηγαιμός.
        inline = name == "failure_procedures.json"
        for r in rs:
            parts.extend(render_req(r, idx, inline))

    if prof["board"]:
        parts.extend(render_matrix(load("board_tolerance_matrix.json")))
        parts.extend(render_trees(load("board_decision_trees.json")))

    # Τα αυτούσια αρχεία ΤΕΛΕΥΤΑΙΑ και με σταθερή σειρά: ό,τι μπαίνει μετά το
    # breakpoint του cache δεν πρέπει ποτέ να μετακινηθεί.
    for rel in prof.get("extras", []):
        raw = (ROOT / rel).read_text(encoding="utf-8")
        parts.append(chr(10) + chr(10) + "## ΑΥΤΟΥΣΙΟ ΑΡΧΕΙΟ: " + rel + chr(10))
        parts.append("Αυτό είναι το ΣΥΜΒΟΛΑΙΟ, όχι περίληψή του. Ό,τι γράφεις υπακούει εδώ." + chr(10))
        parts.append("```" + chr(10) + raw.rstrip() + chr(10) + "```")

    body = "\n".join(parts).rstrip() + "\n"
    digest = hashlib.md5(body.encode("utf-8")).hexdigest()
    body += f"\n<!-- corpus-md5: {digest} -->\n"

    chars = len(body)
    print(f"απαιτήσεις: {sum(counts.values())}  " + " · ".join(f"{k.split('.')[0]}={v}" for k, v in counts.items()))
    print(f"μέγεθος: {chars:,} χαρακτήρες  ≈ {chars // 25 * 10:,}–{chars // 2:,} tokens (ελληνικά)")
    print(f"md5: {digest}")

    if stats_only:
        return 0
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path.write_text(body, encoding="utf-8", newline="\n")
    print(f"→ {out_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
