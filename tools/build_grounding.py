# -*- coding: utf-8 -*-
"""ΤΟ ΕΥΡΕΤΗΡΙΟ ΤΗΣ ΠΡΟΣΓΕΙΩΣΗΣ — από το corpus πίσω στη σελίδα του PDF.
═══════════════════════════════════════════════════════════════════════════
ΤΙ ΛΥΝΕΙ. Ο Σύμβουλος σήμερα **κουβαλά το αυτολεξεί** μέσα στην απάντηση: ο
αναγνώστης διαβάζει αντιγραμμένο κείμενο και πρέπει να μας πιστέψει. Με το
ευρετήριο αυτό, η παραπομπή γίνεται **τοποθεσία**: άνοιγμα του ίδιου του
εγχειριδίου, στη σωστή σελίδα, με το εδάφιο πλαισιωμένο — και από εκεί ο
αναγνώστης περιηγείται μόνος του.

ΤΟ ΕΥΡΗΜΑ ΠΟΥ ΤΟ ΕΚΑΝΕ ΦΘΗΝΟ (μέτρηση 05/11/2026). Το corpus **ήδη** γράφει
σε κάθε μπλοκ αρχείο, σελίδα PDF και το αυτολεξεί κείμενο:

    ### [fail-03] Τι ΔΕΝ αποτελεί οπισθοδρόμηση
    > ΑΥΤΟΛΕΞΕΙ: Δεν αποτελεί οπισθοδρόμηση όταν ο μαθητής επιτύχει…
    ΠΗΓΗ: 3-01_2025_ΔΑΕ.pdf · σελ.PDF 52 · ΚΕΦ.2 §30γ (τυπ. σελ. 34)

Δηλαδή ξέρουμε ΠΟΥ είναι και ΤΙ λέει. Λείπει μόνο το **κουτί** — κι αυτό τα
PDF μας το δίνουν μόνα τους, γιατί έχουν αληθινό text layer. Μετρήθηκε στο
`context-board.md`: **82,4%** των κουτιών βρέθηκαν με σκέτη αναζήτηση και
**87,7%** αφού αφαιρεθεί ο συντακτικός πρόλογος. Μηδέν κόστος, καμία
εξωτερική υπηρεσία, καμία ανάλυση ανά σελίδα.

ΟΙ ΕΞΙ ΑΠΟΠΕΙΡΕΣ, ΜΕ ΤΗ ΣΕΙΡΑ — και καθεμιά υπάρχει επειδή ΑΠΕΤΥΧΕ κάτι
συγκεκριμένο στη μέτρηση, όχι επειδή «μπορεί να χρειαστεί»:
  1. ΣΚΕΤΗ — το αυτολεξεί όπως είναι. Πιάνει τα 4 στα 5.
  2. ΧΩΡΙΣ ΠΡΟΛΟΓΟ — πολλά μπλοκ γράφουν «ΠΔ 29/2020, Άρθρο 3, παρ.1β: «…»».
     Ο πρόλογος είναι ΔΙΚΟΣ ΜΑΣ, δεν υπάρχει στο PDF. (+12 μπλοκ)
  3. ΠΡΙΝ ΤΑ ΑΠΟΣΙΩΠΗΤΙΚΑ — «α... β... γ...»: η ψηφιοποίηση έκοψε τη μέση.
     Ψάχνουμε το ΠΡΩΤΟ κομμάτι, που υπάρχει αυτούσιο.
  4. ΑΠΟ-ΤΥΠΟΓΡΑΦΗΜΕΝΟ — το «haven’t» του corpus είναι «haven't» στο PDF
     (ή το αντίστροφο)· δοκιμάζονται και οι δύο γραφές.
  5. ΚΟΝΤΥΤΕΡΟ ΑΓΚΙΣΤΡΟ — 180 → 120 → 90 → 60 → 40 χαρακτήρες. Μια αλλαγή
     στίξης στο τέλος δεν πρέπει να χαλά ολόκληρο το ταίριασμα.
  6. ΓΕΙΤΟΝΙΚΗ ΣΕΛΙΔΑ (±1) — ένα εδάφιο ΚΑΒΑΛΑΕΙ αλλαγή σελίδας και η ΠΗΓΗ
     δηλώνει εκείνη όπου ΑΡΧΙΖΕΙ. Η σελίδα που βρέθηκε καταγράφεται.

ΔΕΝ ΜΑΝΤΕΥΕΙ ΠΟΤΕ. Αν καμία απόπειρα δεν πιάσει, το μπλοκ γράφεται στο
`misses` **με τον λόγο** και ΧΩΡΙΣ κουτί — ο viewer τότε ανοίγει τη σωστή
σελίδα χωρίς πλαίσιο, που είναι ήδη ασύγκριτα καλύτερο από το αυτολεξεί.
Ένα κουτί σε λάθος σημείο θα ήταν χειρότερο από κανένα: θα έδειχνε με
βεβαιότητα αλλού.

ΤΑ ΚΟΥΤΙΑ ΕΙΝΑΙ ΚΛΑΣΜΑΤΑ ΣΕΛΙΔΑΣ ΜΕ ΑΡΧΗ ΠΑΝΩ-ΑΡΙΣΤΕΡΑ (0..1), όπως τα
παράγει το ADE και όπως τα περιμένει ο viewer του T-6A — ώστε ο κώδικας
απόδοσης να μεταφέρεται αυτούσιος και να κλιμακώνεται με το **αποδοθέν CSS
μέγεθος**, ποτέ με PDF points.

ΤΟ sha256 ΚΑΘΕ PDF ΜΠΑΙΝΕΙ ΣΤΟ ΕΥΡΕΤΗΡΙΟ. Αν αλλάξει έκδοση εγχειριδίου, οι
σελίδες μετακινούνται και ΚΑΘΕ κουτί γίνεται ψέμα — σιωπηλά. Με τη σφραγίδα,
ο viewer μπορεί να το δει και να αρνηθεί να δείξει κουτί.

    python tools/build_grounding.py            # γράφει data/grounding.json
    python tools/build_grounding.py --report   # μόνο μέτρηση, καμία εγγραφή
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import pathlib
import re
import sys
import unicodedata

try:
    import fitz  # PyMuPDF
except ImportError:                                            # pragma: no cover
    sys.exit("Λείπει το PyMuPDF.  pip install pymupdf")

ROOT = pathlib.Path(__file__).resolve().parent.parent
CORPUS_DIR = ROOT / "tools" / "advisor"
OUT = ROOT / "data" / "grounding.json"

# ΤΟ ΚΛΕΙΔΙ URL ΚΑΘΕ ΕΓΓΡΑΦΟΥ — ΕΝΑ ΑΝΤΙΓΡΑΦΟ ΤΟΥ `PDFS` ΤΟΥ serve_app.py.
# Δύο αρχεία, ένας χάρτης: αν προστεθεί τέταρτο εγχειρίδιο πρέπει να μπει ΚΑΙ
# στα δύο, αλλιώς το ευρετήριο θα δείχνει σε διεύθυνση που ο server αρνείται.
# Δεν εισάγεται ο ένας τον άλλο επίτηδες — ο builder τρέχει εκτός εφαρμογής και
# δεν πρέπει να σέρνει μαζί του τον διακομιστή· η διπλοεγγραφή είναι τριών
# γραμμών και ο έλεγχος παρακάτω φωνάζει όταν ξεσυγχρονιστούν.
PDF_IDS = {
    "3-01_2025_ΔΑΕ.pdf": "3-01",
    "Phase_2_Syllabus_2025.pdf": "syllabus",
    "fek_a_57_2020.pdf": "fek",
}

# ΠΗΓΗ: <αρχείο>.pdf · σελ.PDF <n> · <παραπομπή> (… τυπ. σελ. <x> …)
RE_SRC = re.compile(r"^ΠΗΓΗ:\s*(?P<pdf>\S+\.pdf)\s*·\s*σελ\.PDF\s*(?P<page>\d+)\s*·?\s*(?P<ref>[^\n]*)", re.M)
RE_QUOTE = re.compile(r"^>\s*ΑΥΤΟΛΕΞΕΙ:\s*(?P<q>.+)$", re.M)
RE_PRINTED = re.compile(r"τυπ\.\s*σελ\.\s*([0-9A-Za-z\-–\s&]+?)\s*[)\]]")

HOOKS = (180, 120, 90, 60, 40)
MIN_HOOK = 30
WORD_HOOK = 12          # πόσες λέξεις αρκούν για μοναδικό ταίριασμα

TYPO = {"’": "'", "‘": "'", "“": '"', "”": '"',
        "–": "-", "—": "-", " ": " ", "­": ""}

# ══ ΤΑ ΟΜΟΓΡΑΦΑ — Η ΑΙΤΙΑ ΠΟΥ ΕΠΕΦΤΕ ΟΛΟΚΛΗΡΗ ΣΕΙΡΑ ════════════════════════
# ΜΕΤΡΗΜΕΝΟ, ΟΧΙ ΥΠΟΘΕΤΙΚΟ: το συλλαβάριο τυπώνει «I35ΧΧ» με **ελληνικό Χ**,
# το corpus το ψηφιοποίησε «I35XX» με **λατινικό X**. Στην οθόνη είναι το ίδιο
# σχήμα· για τον υπολογιστή είναι δύο διαφορετικοί χαρακτήρες, και καμία
# αναζήτηση κειμένου δεν πρόκειται να τα ενώσει. Έπεφταν έτσι ΟΛΑ τα `st-*`
# των σελίδων 136-161 και τα `gt-*` — όχι τυχαία, μια ολόκληρη ενότητα.
#
# ΕΙΝΑΙ Η ΙΔΙΑ ΠΑΓΙΔΑ ΜΕ ΤΟ «F44ΧΧ» που κρατά ο κανόνας 2δ των agents. Εκεί
# κάνει τον σύμβουλο να μη βρίσκει τον κώδικα· εδώ έκανε την παραπομπή να μη
# βρίσκει τη θέση της. Ο ίδιος χαρακτήρας, δύο φορές.
#
# ΓΙΑΤΙ ΔΕΝ ΜΕΤΑΤΡΕΠΟΥΜΕ ΟΛΟ ΤΟ ΚΕΙΜΕΝΟ: η γραμμή είναι ΑΝΑΜΕΙΚΤΗ — «TRAINING
# SECTION» λατινικά, «I35ΧΧ» με ελληνικό Χ, στην ίδια πρόταση. Μια ενιαία
# μετατροπή προς τη μία γλώσσα θα χάλαγε την άλλη μισή. Η λύση είναι να
# ΔΙΠΛΩΝΟΝΤΑΙ και οι δύο πλευρές σε κοινή μορφή πριν συγκριθούν.
HOMOGLYPH = str.maketrans({
    "Α": "A", "Β": "B", "Ε": "E", "Ζ": "Z", "Η": "H", "Ι": "I", "Κ": "K",
    "Μ": "M", "Ν": "N", "Ο": "O", "Ρ": "P", "Τ": "T", "Υ": "Y", "Χ": "X",
})


def fold(s: str) -> str:
    """Κοινή μορφή και των δύο πλευρών: κεφαλαία, ομόγραφα σε λατινικά, μόνο
    αλφαριθμητικά. Ο τονισμός φεύγει με το NFD — «ΑΞΙΟΛΟΓΗΣΗΣ» και
    «Αξιολόγησης» πρέπει να είναι η ίδια λέξη."""
    s = unicodedata.normalize("NFD", detypo(s).upper())
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = unicodedata.normalize("NFC", s).translate(HOMOGLYPH)
    return "".join(c for c in s if c.isalnum())


def detypo(s: str) -> str:
    for a, b in TYPO.items():
        s = s.replace(a, b)
    return s


def squeeze(s: str) -> str:
    return re.sub(r"\s+", " ", unicodedata.normalize("NFKC", s)).strip()


def sha256(p: pathlib.Path) -> str:
    h = hashlib.sha256()
    with p.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def candidates(q: str) -> list[tuple[str, str]]:
    """(πώς, κείμενο) — με τη σειρά που αξίζει να δοκιμαστούν."""
    out: list[tuple[str, str]] = [("direct", q)]

    # ① ο συντακτικός πρόλογος: «3-01 §6: «…»» ή «ΠΔ 29/2020, Άρθρο 3: «…»»
    m = re.search(r"[«“\"](.{25,})", q)
    if m:
        out.append(("no-prefix", m.group(1).rstrip("»”\"")))
    m = re.match(r"^[^:]{3,60}:\s*(.+)$", q)
    if m:
        out.append(("no-prefix", m.group(1).strip("«»“”\"")))

    # ② τα αποσιωπητικά κόβουν τη μέση — το ΠΡΩΤΟ κομμάτι υπάρχει αυτούσιο
    head = re.split(r"\s*(?:\.\.\.|…)\s*", q)[0]
    if len(head) >= MIN_HOOK and head != q:
        out.append(("before-ellipsis", head))

    # ③ τυπογραφικοί χαρακτήρες
    for how, t in list(out):
        d = detypo(t)
        if d != t:
            out.append((how + "+detypo", d))

    seen, uniq = set(), []
    for how, t in out:
        k = t[:200]
        if len(t) >= MIN_HOOK and k not in seen:
            seen.add(k)
            uniq.append((how, t))
    return uniq


def merge_lines(rects, w: float, h: float, pno: int) -> list[dict]:
    """ΕΝΑ ΚΟΥΤΙ ΑΝΑ ΓΡΑΜΜΗ — όχι ανά λέξη, και όχι ένα για όλα.

    Το `search_for` επιστρέφει ξεχωριστό ορθογώνιο για κάθε κομμάτι που
    ταίριαξε: ένα εδάφιο δύο γραμμών γύρισε **δώδεκα** ορθογώνια, ένα ανά
    λέξη. Ο viewer ζωγραφίζει ένα `div` ανά κουτί, οπότε θα έδειχνε δώδεκα
    μικρά πλαίσια αντί για δύο υπογραμμισμένες γραμμές.

    ΟΥΤΕ ΟΜΩΣ ΕΝΑ ΚΟΥΤΙ ΓΙΑ ΟΛΑ: ένα ορθογώνιο που περικλείει δύο γραμμές
    καλύπτει και ό,τι βρίσκεται ανάμεσά τους — σε στήλη ή πίνακα θα έδειχνε
    με βεβαιότητα κείμενο που δεν είναι το αναφερόμενο. Η γραμμή είναι η
    σωστή μονάδα: ακολουθεί το σχήμα του κειμένου.

    Η ομαδοποίηση γίνεται με ΚΑΤΑΚΟΡΥΦΗ ΕΠΙΚΑΛΥΨΗ και όχι με ίσο y, γιατί οι
    λέξεις της ίδιας γραμμής διαφέρουν κατά κλάσματα (τόνοι, ουρές γραμμάτων).
    """
    if not rects or not w or not h:
        return []
    items = sorted(((r.y0, r.y1, r.x0, r.x1) for r in rects), key=lambda t: (t[0], t[2]))
    lines: list[list] = []
    for y0, y1, x0, x1 in items:
        placed = False
        for ln in lines:
            ly0, ly1 = ln[0], ln[1]
            overlap = min(y1, ly1) - max(y0, ly0)
            if overlap > 0.5 * min(y1 - y0, ly1 - ly0):
                ln[0], ln[1] = min(ly0, y0), max(ly1, y1)
                ln[2], ln[3] = min(ln[2], x0), max(ln[3], x1)
                placed = True
                break
        if not placed:
            lines.append([y0, y1, x0, x1])
    return [{"page": pno,
             "xmin": round(x0 / w, 5), "ymin": round(y0 / h, 5),
             "xmax": round(x1 / w, 5), "ymax": round(y1 / h, 5)}
            for y0, y1, x0, x1 in sorted(lines)]


def by_words(page, quote: str, pno: int):
    """ΤΟ ΚΑΤΑΦΥΓΙΟ ΟΤΑΝ Η ΑΝΑΖΗΤΗΣΗ ΚΕΙΜΕΝΟΥ ΔΕΝ ΦΤΑΝΕΙ.

    Αντί να ζητήσει συμβολοσειρά, ταιριάζει **λέξη προς λέξη** πάνω στις λέξεις
    της σελίδας, με τις δύο πλευρές διπλωμένες στην ίδια μορφή (fold). Έτσι
    πέφτουν μαζί τέσσερα εμπόδια που το `search_for` τα βλέπει ως τέσσερα
    διαφορετικά προβλήματα: τα ομόγραφα, ο τονισμός, η αλλαγή γραμμής και η
    διπλή/λειψή στίξη. Το κουτί είναι η ΕΝΩΣΗ των λέξεων που ταίριαξαν, άρα
    ακολουθεί το σχήμα του κειμένου ακόμη κι όταν σπάει σε δύο γραμμές."""
    words = [w for w in page.get_text("words") if fold(w[4])]
    if not words:
        return None
    pf = [fold(w[4]) for w in words]
    nf = [fold(t) for t in quote.split()]
    nf = [t for t in nf if t][:WORD_HOOK]
    if len(nf) < 4:
        return None
    k = len(nf)
    for i in range(len(pf) - k + 1):
        if pf[i:i + k] != nf:
            continue
        w, h = page.rect.width, page.rect.height
        if not w or not h:
            return None
        # μία γραμμή = ένα κουτί· η ένωση γίνεται ΑΝΑ ΓΡΑΜΜΗ (w[6] = line no),
        # αλλιώς ένα εδάφιο δύο γραμμών θα έπαιρνε ένα τεράστιο ορθογώνιο που
        # θα κάλυπτε και ό,τι βρίσκεται ανάμεσά τους.
        lines: dict[tuple, list] = {}
        for x0, y0, x1, y1, *rest in words[i:i + k]:
            lines.setdefault((rest[1], rest[2]), []).append((x0, y0, x1, y1))
        out = []
        for _, rs in sorted(lines.items()):
            out.append({"page": pno,
                        "xmin": round(min(r[0] for r in rs) / w, 5),
                        "ymin": round(min(r[1] for r in rs) / h, 5),
                        "xmax": round(max(r[2] for r in rs) / w, 5),
                        "ymax": round(max(r[3] for r in rs) / h, 5)})
        return out
    return None


def locate(doc, page_no: int, quote: str):
    """→ (boxes, page_found, how) ή (None, None, λόγος). Ποτέ εικασία."""
    pages = [page_no]
    if page_no + 1 <= doc.page_count:
        pages.append(page_no + 1)
    if page_no - 1 >= 1:
        pages.append(page_no - 1)

    for pno in pages:
        page = doc[pno - 1]
        for how, text in candidates(quote):
            for n in HOOKS:
                if len(text) < MIN_HOOK:
                    continue
                rects = page.search_for(text[:n])
                if rects:
                    boxes = merge_lines(rects, page.rect.width, page.rect.height, pno)
                    if not boxes:
                        continue
                    tag = how + ("" if n == HOOKS[0] else f"@{n}")
                    if pno != page_no:
                        tag += f" (σελ.{pno:+d}".replace("+", "±") + ")"
                    return boxes, pno, tag

    # ⑦ ΤΟ ΚΑΤΑΦΥΓΙΟ — λέξη προς λέξη, με διπλωμένα ομόγραφα και τόνους.
    # Τρέχει ΤΕΛΕΥΤΑΙΟ κι όχι πρώτο: το search_for είναι αυστηρότερο, άρα όταν
    # πιάνει είναι και πιο σίγουρο· εδώ μπαίνουμε μόνο αφού αυτό αποτύχει.
    for pno in pages:
        boxes = by_words(doc[pno - 1], quote, pno)
        if boxes:
            tag = "words"
            if pno != page_no:
                tag += f" (σελ.{pno:+d}".replace("+", "±") + ")"
            return boxes, pno, tag

    # γιατί απέτυχε — χρήσιμο για το επόμενο πέρασμα, και για το ΑΝ αξίζει ADE
    on_page = squeeze(detypo(quote))[:100] in squeeze(detypo(doc[page_no - 1].get_text()))
    return None, None, "στη σελίδα αλλά αταίριαστο" if on_page else "δεν βρέθηκε"


def blocks_of(md: str):
    for part in re.split(r"(?m)^### \[", md)[1:]:
        bid = part.split("]", 1)[0].strip()
        q = RE_QUOTE.search(part)
        s = RE_SRC.search(part)
        if not (bid and q and s):
            continue
        ref = s.group("ref").strip()
        pr = RE_PRINTED.search(part)
        yield {"id": bid, "quote": q.group("q").strip(), "pdf": s.group("pdf"),
               "page": int(s.group("page")), "ref": re.sub(r"\s*\(.*$", "", ref).strip(),
               "printed": (pr.group(1).strip() if pr else "")}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--report", action="store_true", help="μόνο μέτρηση, καμία εγγραφή")
    args = ap.parse_args()

    docs: dict[str, object] = {}
    pdfs: dict[str, dict] = {}
    index: dict[str, dict] = {}
    misses: list[dict] = []
    per_corpus: dict[str, list[int]] = {}

    for md_path in sorted(CORPUS_DIR.glob("context-*.md")):
        name = md_path.stem
        hit = tot = 0
        for b in blocks_of(md_path.read_text(encoding="utf-8")):
            tot += 1
            pdf = b["pdf"]
            if pdf not in docs:
                p = ROOT / pdf
                if not p.exists():
                    docs[pdf] = None
                    print(f"  ! λείπει το {pdf}")
                else:
                    docs[pdf] = fitz.open(p)
                    pdfs[pdf] = {"pdf_id": PDF_IDS.get(pdf, ""),
                                 "pages": docs[pdf].page_count, "sha256": sha256(p)}
                    if not PDF_IDS.get(pdf):
                        # Χωρίς κλειδί ο viewer δεν έχει διεύθυνση να ζητήσει:
                        # το μπλοκ θα είχε κουτί και καμία πόρτα προς αυτό.
                        print(f"  ! το {pdf} ΔΕΝ έχει κλειδί URL — πρόσθεσέ το σε "
                              f"PDF_IDS εδώ ΚΑΙ σε PDFS του tools/serve_app.py")
            doc = docs[pdf]
            if doc is None:
                misses.append({**{k: b[k] for k in ("id", "pdf", "page")},
                               "corpus": name, "why": "λείπει το PDF"})
                continue
            boxes, found, how = locate(doc, b["page"], b["quote"])
            if boxes:
                hit += 1
                # ΠΡΩΤΟΣ ΓΡΑΦΕΙ, ΔΕΝ ΞΑΝΑΓΡΑΦΕΤΑΙ: το ίδιο id ζει σε πολλά
                # corpora (το context-full τα περιέχει όλα)· η πρώτη εύρεση
                # είναι εξίσου καλή και η επανάληψη θα άλλαζε μόνο το «corpus».
                index.setdefault(b["id"], {
                    "pdf": pdf, "pdf_id": PDF_IDS.get(pdf, ""),
                    "page": found, "page_printed": b["printed"],
                    "ref": b["ref"], "boxes": boxes, "how": how, "corpus": name,
                })
            else:
                # ΧΩΡΙΣ ΤΟ ΑΥΤΟΛΕΞΕΙ. Το `tools/advisor/*.md` είναι gitignored
                # επίτηδες — τα κανονιστικά κείμενα δεν ανεβαίνουν. Ένα
                # «μόνο 90 χαρακτήρες» σε παράγωγο αρχείο είναι ο τρόπος που
                # διαρρέει ό,τι φυλάχτηκε στην πηγή. Το κείμενο της αστοχίας
                # τυπώνεται στην ΟΘΟΝΗ με --report, όπου και χρειάζεται.
                misses.append({**{k: b[k] for k in ("id", "pdf", "page")},
                               "corpus": name, "why": how})
        per_corpus[name] = [hit, tot]

    print(f"{'corpus':26}{'με κουτί':>10}{'σύνολο':>9}{'κάλυψη':>9}")
    for name, (hit, tot) in sorted(per_corpus.items()):
        print(f"{name:26}{hit:>10}{tot:>9}{(100*hit/tot if tot else 0):>8.1f}%")
    th, tt = sum(h for h, _ in per_corpus.values()), sum(t for _, t in per_corpus.values())
    print(f"{'ΣΥΝΟΛΟ':26}{th:>10}{tt:>9}{(100*th/tt if tt else 0):>8.1f}%")
    print(f"\nμοναδικά ids με κουτί: {len(index)}  ·  αστοχίες: {len(misses)}")

    ways: dict[str, int] = {}
    for v in index.values():
        ways[v["how"].split("@")[0].split(" (")[0]] = ways.get(v["how"].split("@")[0].split(" (")[0], 0) + 1
    print("πώς βρέθηκαν:", dict(sorted(ways.items(), key=lambda kv: -kv[1])))

    if args.report:
        for m in misses[:15]:
            print(f"  ΑΣΤΟΧΙΑ {m['id']:12} {m['pdf']:26} σελ.{m['page']:<4} {m['why']}")
        return 0

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({
        "schema": "fdms-grounding-v1",
        "built_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "note": ("Κουτιά = κλάσματα σελίδας (0..1), αρχή ΠΑΝΩ-ΑΡΙΣΤΕΡΑ, ίδια αρίθμηση "
                 "σελίδων με το «page». Το sha256 σφραγίζει την έκδοση: αν αλλάξει το "
                 "PDF, τα κουτιά δεν ισχύουν."),
        "pdfs": pdfs,
        "coverage": {k: {"boxed": v[0], "total": v[1]} for k, v in sorted(per_corpus.items())},
        "blocks": dict(sorted(index.items())),
        "misses": misses,
    }, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\nγράφτηκε {OUT.relative_to(ROOT)}  ({OUT.stat().st_size:,} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
