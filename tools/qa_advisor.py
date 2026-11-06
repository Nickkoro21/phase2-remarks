# -*- coding: utf-8 -*-
"""ΤΟ ΣΥΝΕΡΓΕΙΟ ΕΛΕΓΧΟΥ ΤΟΥ ΣΥΜΒΟΥΛΟΥ — QA/QC με ΠΡΑΓΜΑΤΙΚΕΣ κλήσεις.
═══════════════════════════════════════════════════════════════════════════════
ΓΙΑΤΙ ΥΠΑΡΧΕΙ. Τα 47 offline tests αποδεικνύουν ότι ο proxy **χτίζει** σωστό
αίτημα. Δεν λένε τίποτα για το αν η **απάντηση** είναι σωστή, αν το cache
διαβάζεται, αν τα φρένα κρατούν, ή αν ο Haiku τηρεί τον κανόνα «όχι αυτολεξεί»
της 05/11. Αυτά κρίνονται μόνο με ζωντανές κλήσεις — και μόνο αν κάποιος τις
βαθμολογεί με τον ίδιο κανόνα κάθε φορά.

ΓΙΑΤΙ ΑΥΤΟΜΑΤΗ ΒΑΘΜΟΛΟΓΙΑ. 21 ερωτήσεις × 4 κριτήρια = 84 κρίσεις ανά γύρο. Με
το μάτι γίνεται **μία φορά** και μετά ποτέ — και ο κανόνας μετακινείται σιωπηλά
με τη διάθεση του κριτή. Γραμμένος σε κώδικα, ο κανόνας είναι ο ίδιος τον
Νοέμβριο και τον Μάρτιο, και η διαφορά δύο γύρων σημαίνει κάτι.

ΓΙΑΤΙ ΤΟ ΙΧΝΟΣ, ΚΑΙ ΟΧΙ ΑΡΧΕΙΟ. Απόφανση ιδιοκτήτη 06/11/2026: «*θέλω ό,τι
κάνουμε να υπάρχει και στο tracing*». Κάθε κλήση φεύγει σημασμένη με την
παρτίδα και το id της ερώτησης, και **η βαθμολογία γυρίζει πίσω ως feedback
πάνω στο run**. Ανοίγεις το LangSmith και βλέπεις ΚΑΙ την απάντηση ΚΑΙ γιατί
κόπηκε — όχι ένα txt που θα χαθεί. Το κόστος το υπολογίζει ο proxy μόνος του
(advisor_trace.cost_usd) γιατί το LangSmith **δεν ξέρει** το κλιμάκιο των
100.000 tokens του Haiku 5.5 και θα έδειχνε πενταπλάσια φθηνότερα.

ΧΡΗΣΗ
  python tools/qa_advisor.py --base http://127.0.0.1:8772            # όλα
  python tools/qa_advisor.py --only E01,E02 --model sonnet --effort high
  python tools/qa_advisor.py --kinds qa,unknown --batch pre-release
  python tools/qa_advisor.py --dry-run          # τίποτα δεν φεύγει, μόνο σχέδιο

ΤΟ ΚΛΕΙΔΙ ΔΕΝ ΠΕΡΝΑ ΑΠΟ ΕΔΩ. Ο proxy έχει το ANTHROPIC_API_KEY· εμείς μιλάμε
μόνο HTTP στο loopback. Το LANGSMITH_API_KEY χρειάζεται μόνο για το feedback.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import pathlib
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))

CORPUS_OF = {
    "board-director": "context-board.md",
    "syllabus": "context-syllabus.md",
    "description": "context-description.md",
    "remarks": "context-remarks.md",
}

# ── ΤΙ ΜΕΤΡΑΕΙ Η ΑΝΤΙΓΡΑΦΗ, ΚΑΙ ΓΙΑΤΙ ΟΧΙ ΤΟ ΜΗΚΟΣ (διόρθωση 06/11/2026) ────
# Η πρώτη εκδοχή έκοβε κάθε απάντηση με ακολουθία ≥25 λέξεων από το corpus.
# ΜΕΤΡΗΘΗΚΕ ότι αυτό χτυπά ΑΚΡΙΒΩΣ τη συμπεριφορά που ο κανόνας ΕΠΙΤΡΕΠΕΙ: τα
# τρία «κοπήκαμε» του πρώτου γύρου ήταν **μονές φράσεις σε «»** των 25-30
# λέξεων — «*να αποφεύγεται στο βαθμό που είναι δυνατόν*», «*όταν αποτυγχάνει
# σε δύο (2) συνεχόμενες γραπτές αξιολογήσεις ή εξετάσεις εδάφους που
# συντελούνται από τη Μοίρα…*» — δηλαδή περιπτώσεις όπου **η διατύπωση κρίνει**
# και ο κανόνας λέει ρητά «μία φράση σε εισαγωγικά». Μια πρόταση ελληνικού
# κανονισμού ΕΙΝΑΙ 25-35 λέξεις· το μήκος μιας φράσης δεν είναι παράβαση.
#
# Η ΔΙΑΚΡΙΣΗ ΠΟΥ ΕΧΕΙ ΝΟΗΜΑ ΕΙΝΑΙ Η ΜΟΡΦΗ, ΚΑΙ ΜΕΤΡΗΘΗΚΕ: η απάντηση ΠΡΙΝ τη
# διόρθωση του prompt είχε **δύο μπλοκ παράθεσης `>`** με 68 λέξεις μέσα· οι
# απαντήσεις ΜΕΤΑ έχουν **μηδέν** μπλοκ και μία φράση σε «». Άρα κρίνουμε:
#   · μπλοκ παράθεσης → παράβαση, όσο μικρό κι αν είναι (αντιγράφει «κατεβατό»)
#   · ΠΟΛΛΕΣ μεγάλες ακολουθίες → αντιγραφή με δόσεις
#   · μία φράση ως 40 λέξεις → επιτρεπτό, ό,τι λέει ο κανόνας
VERBATIM_HARD = 40        # πάνω από αυτό δεν είναι «φράση», είναι εδάφιο
VERBATIM_RUN = 20         # από εδώ και πάνω μια ακολουθία μετράει ως «παράθεμα»
MAX_LONG_RUNS = 1         # μία φράση επιτρέπεται· δύο είναι συνήθεια
CONCISE_CHARS = 2500      # πάνω από αυτό, η «σύντομη» απάντηση δεν είναι σύντομη
RE_BLOCKQUOTE = re.compile(r"^\s{0,3}>", re.M)

# Οι φράσεις της παραδοχής. ΔΕΝ είναι διακοσμητικές: σε ερώτηση έξω από το
# corpus, η σωστή απάντηση είναι ΑΡΝΗΣΗ. Ένας σύμβουλος που μαντεύει κανόνα
# είναι χειρότερος από κανέναν σύμβουλο.
ADMIT = [
    "δεν προβλέπεται", "δεν υπάρχει", "δεν βρίσκω", "δεν βρήκα", "δεν αναφέρεται",
    "δεν ορίζεται", "δεν καλύπτεται", "δεν περιλαμβάνεται", "δεν το έχω",
    "δεν εντοπίζω", "δεν εντόπισα", "σιωπούν", "εκτός εμβέλειας", "δεν διαθέτω",
    "δεν τεκμηριώνεται", "καμία διάταξη", "δεν ρυθμίζεται",
]

RE_ID = re.compile(r"\[?\b([a-z]{2,12}-\d{1,3})\b\]?")
RE_WS = re.compile(r"\s+")

# ── Η ΠΙΣΤΟΤΗΤΑ ΤΗΣ ΣΗΜΑΝΣΗΣ (06/11/2026) ───────────────────────────────────
# Ο έλεγχος ότι το id ΥΠΑΡΧΕΙ δεν λέει αν η ΣΕΛΙΔΑ και το ΕΔΑΦΙΟ που τυπώνονται
# δίπλα του είναι αυτά που δηλώνει το corpus. **Σωστή απάντηση σε λάθος σελίδα
# είναι η χειρότερη περίπτωση**: ο ιδιοκτήτης ανοίγει τη σελίδα, δεν βρίσκει τη
# διάταξη, και χάνει την εμπιστοσύνη του σε ΟΛΕΣ τις απαντήσεις — και το ⌖ του
# θεατή τον στέλνει κι αυτό αλλού.
#
# ΑΚΡΙΒΕΙΑ ΠΡΙΝ ΑΠΟ ΚΑΛΥΨΗ, ΚΑΙ ΜΕΤΡΗΘΗΚΕ ΓΙΑΤΙ. Η πρώτη εκδοχή κοίταζε ±160
# χαρακτήρες γύρω από το id και κατήγγειλε **πέντε** σημάνσεις· από αυτές οι
# **τέσσερις ήταν σωστές** και το λάθος ήταν δικό της — δάνειζε τον αριθμό της
# ΓΕΙΤΟΝΙΚΗΣ παραπομπής. Το κείμενο έλεγε «§9.b **του st-40**» και ο έλεγχος το
# χρέωνε στο st-18· έλεγε «fail-10 (§30ε)» και το χρέωνε στο fail-08. Ένας
# έλεγχος με ψευδείς συναγερμούς στέλνει να διορθώνεις πρόβλημα που δεν
# υπάρχει, άρα είναι **χειρότερος από κανέναν**: τον εμπιστεύεσαι.
# Γι' αυτό εδώ: καμία ματιά ΠΡΙΝ την αγκύλη· παρένθεση ΜΕΤΑ την αγκύλη μόνο αν
# ξεκινά αμέσως με «σελ.PDF/§/παρ.»· και σε αγκύλη με ΠΟΛΛΑ id, κάθε στοιχείο
# χρεώνεται μόνο στο id του ΔΙΚΟΥ ΤΟΥ τμήματος (τα τμήματα χωρίζονται με «·»).
RE_PAGE = re.compile(r"(?:σελ\.?\s*PDF|PDF)\s*(\d{1,3})", re.I)
RE_REF = re.compile(r"(?:§|παρ\.?)\s*(\d{1,3})\s*([α-ω]{1,3})?(?:\s*\(([^)]{1,6})\))?")
RE_BRACKET = re.compile(r"\[([^\[\]]{0,400})\]")
RE_TAIL_PAREN = re.compile(r"^\s*\(\s*(?:σελ|§|παρ)")
# Η ελληνική αρίθμηση εδαφίων, για να ανοίγουν τα εύρη «§25α-β», «§58α-ιβ».
GREEK_ORD = ["α", "β", "γ", "δ", "ε", "στ", "ζ", "η", "θ", "ι", "ια", "ιβ", "ιγ",
             "ιδ", "ιε", "ιστ", "ιζ", "ιη", "ιθ", "κ"]


# ── ΚΑΝΟΝΙΚΟΠΟΙΗΣΗ: δύο κείμενα συγκρίνονται μόνο αν μιλούν ίδια ────────────
def fold(s: str) -> str:
    """Πεζά, χωρίς τόνους, χωρίς σημεία στίξης, ένα κενό. Ο τόνος και το τελικό
    σίγμα δεν κάνουν ένα παράθεμα «δικό μου κείμενο» — και η παραλλαγή τους
    είναι ο ευκολότερος τρόπος να κρυφτεί μια αντιγραφή."""
    s = unicodedata.normalize("NFD", s or "")
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = s.lower().replace("ς", "σ")
    s = re.sub(r"[^0-9a-zα-ω\s]+", " ", s)
    return RE_WS.sub(" ", s).strip()


def longest_shared_run(answer: str, reference: str) -> int:
    """Οι ΠΕΡΙΣΣΟΤΕΡΕΣ συνεχόμενες λέξεις της απάντησης που υπάρχουν αυτολεξεί
    μέσα στην πηγή. Δυαδική αναζήτηση: αν ταιριάζει ακολουθία k λέξεων,
    ταιριάζει και k-1 — άρα η ιδιότητα είναι μονότονη και 20 δοκιμές αρκούν
    αντί για χιλιάδες."""
    w = fold(answer).split()
    hay = " " + fold(reference) + " "
    if not w:
        return 0

    def hit(k: int) -> bool:
        for i in range(0, len(w) - k + 1):
            if " " + " ".join(w[i:i + k]) + " " in hay:
                return True
        return False

    lo, hi = 0, len(w)
    while lo < hi:
        mid = (lo + hi + 1) // 2
        if hit(mid):
            lo = mid
        else:
            hi = mid - 1
    return lo


def count_long_runs(answer: str, reference: str, k: int = VERBATIM_RUN) -> int:
    """Πόσες ΞΕΧΩΡΙΣΤΕΣ ακολουθίες ≥k λέξεων της απάντησης υπάρχουν στην πηγή.
    Μία επιτρέπεται (η φράση που κρίνει)· δύο και τρεις είναι αντιγραφή με
    δόσεις, που το «μέγιστο μήκος» δεν θα την έπιανε ποτέ."""
    w = fold(answer).split()
    hay = " " + fold(reference) + " "
    n, i = 0, 0
    while i <= len(w) - k:
        if " " + " ".join(w[i:i + k]) + " " in hay:
            j = i + k                       # επέκτεινε όσο ταιριάζει
            while j < len(w) and " " + " ".join(w[i:j + 1]) + " " in hay:
                j += 1
            n += 1
            i = j                           # μη μετρήσεις την ίδια δύο φορές
        else:
            i += 1
    return n


# ── ΤΟ ΣΥΜΠΑΝ ΤΩΝ ΑΝΑΓΝΩΡΙΣΤΙΚΩΝ ───────────────────────────────────────────
def load_universe() -> tuple[set[str], dict]:
    """Όλα τα id που ΥΠΑΡΧΟΥΝ (από το context-full, την αυθεντία) και η
    τοποθεσία τους (από το grounding.json). Ένα id που δεν είναι εδώ και
    εμφανίζεται σε απάντηση είναι **εφεύρεση** — το χειρότερο σφάλμα που
    μπορεί να κάνει αυτό το σύστημα, γιατί μοιάζει με τεκμηρίωση."""
    full = (ROOT / "tools" / "advisor" / "context-full.md")
    ids = set(re.findall(r"^### \[([a-z0-9-]+)\]", full.read_text(encoding="utf-8"), re.M)) if full.is_file() else set()
    g = ROOT / "data" / "grounding.json"
    blocks = json.loads(g.read_text(encoding="utf-8")).get("blocks", {}) if g.is_file() else {}
    return ids, blocks


def refs_in(text: str) -> set:
    """{«30δ», «32β», «58στ»} — αριθμός + ελληνικό γράμμα, χωρίς υποεδάφια.
    Το «§32β(4)» δίνει «32β»: το υποεδάφιο (4) ΕΙΝΑΙ μέσα στο «§32β(1)-(6)» που
    δηλώνει το corpus, και ο Σύμβουλος είναι εκεί **ακριβέστερος** από τη ΠΗΓΗ —
    δεν τον κόβουμε γι' αυτό."""
    return {n + (l or "") for n, l, _ in RE_REF.findall(fold_refs(text))}


def fold_refs(s: str) -> str:
    """Τόνοι και τελικό σίγμα πέφτουν· **τα κενά ΜΕΝΟΥΝ**. Η πρώτη εκδοχή τα
    έσβηνε και το «§30θ ΚΑΙ §30ι» γινόταν «30θκ» — ο έλεγχος κατήγγειλε δικό
    του λάθος ως λάθος του Συμβούλου."""
    s = unicodedata.normalize("NFD", s or "")
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return RE_WS.sub(" ", s.lower().replace("ς", "σ").replace(".", "")).strip()


def source_marks() -> dict:
    """id → {pages, refs}: ό,τι ΚΑΛΥΠΤΕΙ η γραμμή `ΠΗΓΗ:` του μπλοκ, με τα εύρη
    ανοιγμένα, συν τα εδάφια που ονοματίζει το `ΑΥΤΟΛΕΞΕΙ` (συχνά δηλώνει και
    την ΔΕΥΤΕΡΗ πηγή: «ΠΔ … παρ.1στ || 3-01 §58στ» — και τα δύο είναι νόμιμα)."""
    p = ROOT / "tools" / "advisor" / "context-full.md"
    out: dict = {}
    if not p.is_file():
        return out
    for m in re.finditer(r"^### \[([a-z0-9-]+)\][^\n]*\n(.*?)(?=^### |\Z)",
                         p.read_text(encoding="utf-8"), re.M | re.S):
        body = m.group(2)
        line = next((l for l in body.splitlines() if l.startswith("ΠΗΓΗ:")), "")
        auto = " ".join(l for l in body.splitlines() if l.startswith("> ΑΥΤΟΛΕΞΕΙ:"))
        refs = refs_in(line) | refs_in(auto)
        for num, a, b in re.findall(r"(\d{1,3})\s*([α-ω]{1,3})\s*[-–]\s*([α-ω]{1,3})", fold_refs(line)):
            if a in GREEK_ORD and b in GREEK_ORD:
                refs |= {num + g for g in GREEK_ORD[GREEK_ORD.index(a): GREEK_ORD.index(b) + 1]}
        out[m.group(1)] = {"pages": {int(x) for x in RE_PAGE.findall(line)},
                           "refs": refs, "line": line[6:].strip()}
    return out


def marks_claimed(text: str) -> list:
    """[(id, {σελίδες}, {εδάφια})] — ό,τι αποδίδεται ΡΗΤΑ στο id, χωρίς δάνεια."""
    out = []

    def push(cur, pg, rf):
        if cur:
            out.append((cur, pg, rf))

    for b in RE_BRACKET.finditer(text):
        cur, pg, rf = None, set(), set()
        for seg in b.group(1).split("·"):
            ids = RE_ID.findall(seg)
            spg = {int(x) for x in RE_PAGE.findall(seg)}
            srf = refs_in(seg)
            if ids:
                push(cur, pg, rf)
                cur, pg, rf = ids[0], set(spg), set(srf)
                for extra in ids[1:]:          # πολλά id στο ίδιο τμήμα:
                    push(cur, pg, rf)          # κανένα δεν κληρονομεί του άλλου
                    cur, pg, rf = extra, set(), set()
            else:
                pg |= spg
                rf |= srf
        push(cur, pg, rf)
        # «[fail-32] (σελ.PDF 5 και 63)» — ΜΟΝΟ όταν η παρένθεση ξεκινά αμέσως
        # με στοιχείο σήμανσης, και μόνο αν η αγκύλη είχε ΕΝΑ id.
        tail = text[b.end(): b.end() + 60].split("[")[0]
        if out and RE_TAIL_PAREN.match(tail) and len(RE_ID.findall(b.group(1))) == 1:
            i, p_, r_ = out[-1]
            out[-1] = (i, p_ | {int(x) for x in RE_PAGE.findall(tail)}, r_ | refs_in(tail))
    return out


def corpus_text(agent: str) -> str:
    p = ROOT / "tools" / "advisor" / CORPUS_OF.get(agent, "")
    return p.read_text(encoding="utf-8") if p.is_file() else ""


# ── Η ΚΛΗΣΗ ────────────────────────────────────────────────────────────────
def ask(base: str, agent: str, question: str, model: str | None, effort: str | None,
        trace: dict, timeout: int = 420) -> dict:
    """Μία ερώτηση, χωρίς συνεδρία (τίποτα δεν γράφεται στις συνεδρίες του
    ιδιοκτήτη). Επιστρέφει ό,τι μάζεψε από το SSE."""
    body = {"agent": agent, "messages": [{"role": "user", "content": question}], "trace": trace}
    if model:
        body["model"] = model
    if effort:
        body["effort"] = effort
    req = urllib.request.Request(
        base.rstrip("/") + "/ask",
        data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json; charset=utf-8"},
        method="POST")
    out = {"text": "", "usage": None, "tool_calls": [], "errors": [], "notices": [],
           "trace_run_id": "", "cost_usd": 0.0, "stop_reason": "", "compacted": None,
           "http": 200, "seconds": 0.0}
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            for raw in r:
                line = raw.decode("utf-8", "replace").strip()
                if not line.startswith("data: "):
                    continue
                try:
                    ev = json.loads(line[6:])
                except Exception:
                    continue
                t = ev.get("type")
                if t == "text":
                    out["text"] += ev.get("text", "")
                elif t == "usage":
                    out["usage"] = {k: v for k, v in ev.items() if k != "type"}
                elif t == "tool_call":
                    out["tool_calls"].append({"name": ev.get("name"), "input": ev.get("input")})
                elif t == "error":
                    out["errors"].append(f"{ev.get('code')}: {ev.get('message')}")
                elif t == "notice":
                    out["notices"].append(ev.get("message"))
                elif t == "compacted":
                    out["compacted"] = {k: ev.get(k) for k in ("n", "chars_before", "chars_after")}
                elif t == "done":
                    out["stop_reason"] = ev.get("stop_reason") or ""
                    out["trace_run_id"] = ev.get("trace_run_id") or ""
                    out["cost_usd"] = float(ev.get("cost_usd") or 0.0)
    except urllib.error.HTTPError as e:
        out["http"] = e.code
        try:
            out["errors"].append(json.loads(e.read().decode("utf-8")).get("error", ""))
        except Exception:
            out["errors"].append(f"HTTP {e.code}")
    except Exception as e:
        out["errors"].append(f"{type(e).__name__}: {e}")
    out["seconds"] = round(time.time() - t0, 1)
    return out


# ── Η ΒΑΘΜΟΛΟΓΙΑ ───────────────────────────────────────────────────────────
def grade(case: dict, res: dict, universe: set[str], blocks: dict, corpus: str,
          marks: dict | None = None) -> dict:
    text = res["text"]
    # ΜΟΝΟ ο χώρος ονομάτων των ΑΠΑΙΤΗΣΕΩΝ κρίνεται. Μετρήθηκε 06/11: οι agents
    # `description`/`remarks` παραπέμπουν νόμιμα σε **θέματα Φύλλου** (contact-05,
    # instrument-04) — άλλος χώρος ονομάτων, όχι απαιτήσεις. Χωρίς αυτό το
    # φίλτρο ο βαθμολογητής τα κατήγγειλε ως «εφευρεμένα» και θα μας έστελνε να
    # διορθώσουμε πρόβλημα που δεν υπάρχει — ψευδής συναγερμός χειρότερος από
    # κανέναν έλεγχο, γιατί τον εμπιστεύεσαι.
    prefixes = {i.rsplit("-", 1)[0] for i in universe}
    cited, other = [], []
    for m in RE_ID.finditer(text):
        i = m.group(1)
        bucket = cited if i.rsplit("-", 1)[0] in prefixes else other
        if i not in bucket:
            bucket.append(i)
    known = [i for i in cited if i in universe]
    invented = [i for i in cited if i not in universe]
    located = [i for i in known if i in blocks]
    low = fold(text)
    admits = any(fold(p) in low for p in ADMIT)
    run = longest_shared_run(text, corpus) if text else 0
    runs = count_long_runs(text, corpus) if text else 0
    blocks_q = len(RE_BLOCKQUOTE.findall(text))

    sc: dict = {}
    notes: list[str] = []
    soft: list[str] = []
    kind = case.get("kind")

    if kind == "qa":
        sc["marking_ok"] = bool(known)
        sc["no_invented_ids"] = not invented
        sc["no_block_quoting"] = blocks_q == 0
        sc["no_verbatim"] = run < VERBATIM_HARD and runs <= MAX_LONG_RUNS
        hit = [i for i in case.get("expect_ids", []) if i in known]
        if case.get("expect_ids"):
            sc["expected_ids_found"] = len(hit) / len(case["expect_ids"])
        if not known:
            notes.append("ΚΑΜΙΑ σήμανση — χωρίς id δεν υπάρχει ⌖ και η απάντηση είναι ανεπαλήθευτη")
        if invented:
            notes.append("ΕΦΕΥΡΕΜΕΝΑ id: " + ", ".join(invented))
        if blocks_q:
            notes.append(f"{blocks_q} γραμμές μπλοκ παράθεσης «>» — κατεβατό από το corpus")
        if run >= VERBATIM_HARD:
            notes.append(f"αντιγραφή {run} συνεχόμενων λέξεων — εδάφιο, όχι φράση")
        elif runs > MAX_LONG_RUNS:
            notes.append(f"{runs} χωριστά παραθέματα ≥{VERBATIM_RUN} λέξεων — αντιγραφή με δόσεις")
        # ΜΑΛΑΚΟ: το μήκος είναι ποιότητα, όχι παράβαση. Δεν ρίχνει την
        # απάντηση στην ίδια κλάση με μια εφευρεμένη παραπομπή.
        if len(text) > CONCISE_CHARS:
            soft.append(f"{len(text):,} χαρακτήρες — πάνω από το όριο συντομίας")
    elif kind == "unknown":
        sc["admits"] = admits
        sc["no_invented_ids"] = not invented
        if not admits:
            notes.append("ΔΕΝ παραδέχτηκε άγνοια σε ερώτηση έξω από τις πηγές")
        if invented:
            notes.append("ΕΦΕΥΡΕΜΕΝΑ id: " + ", ".join(invented))
    elif kind == "tool":
        sc["tools_fired"] = bool(res["tool_calls"])
        sc["no_invented_ids"] = not invented
        if not res["tool_calls"]:
            notes.append("ΔΕΝ κάλεσε εργαλείο σε ερώτηση που το απαιτεί")

    # ── Η ΠΙΣΤΟΤΗΤΑ ΤΗΣ ΣΗΜΑΝΣΗΣ, για ΚΑΘΕ είδος ερώτησης ──────────────────
    # Ισχύει και στις αρνήσεις και στις κλήσεις εργαλείων: ό,τι σημάνει, το
    # σημαίνει σωστά. Μετριέται μόνο ό,τι τυπώθηκε ΡΗΤΑ δίπλα στο id — το σκέτο
    # `[fail-24]` δεν είναι λάθος, απλώς δεν ελέγχεται από εδώ.
    cite = {"pages_ok": 0, "pages_bad": 0, "refs_ok": 0, "refs_bad": 0, "bad": []}
    for i, pgs, rfs in (marks_claimed(text) if marks else []):
        m = marks.get(i)
        if not m:
            continue
        if pgs and m["pages"]:
            if pgs & m["pages"]:
                cite["pages_ok"] += 1
            else:
                cite["pages_bad"] += 1
                cite["bad"].append(f"[{i}] σελ. {sorted(pgs)} ≠ corpus {sorted(m['pages'])}")
        for rf in rfs:
            if rf in m["refs"]:
                cite["refs_ok"] += 1
            else:
                cite["refs_bad"] += 1
                cite["bad"].append(f"[{i}] εδάφιο «{rf}» — το corpus καλύπτει {sorted(m['refs']) or '—'}")
    if cite["pages_bad"] or cite["refs_bad"]:
        sc["citations_faithful"] = False
        notes.append("ΣΗΜΑΝΣΗ ΠΟΥ ΔΕΝ ΣΤΕΚΕΙ — " + "· ".join(dict.fromkeys(cite["bad"]))[:300])
    elif cite["pages_ok"] or cite["refs_ok"]:
        sc["citations_faithful"] = True
    sc["cite_pages_ok"] = cite["pages_ok"]
    sc["cite_refs_ok"] = cite["refs_ok"]
    sc["cite_wrong"] = cite["pages_bad"] + cite["refs_bad"]

    sc["longest_verbatim_words"] = run
    sc["long_runs"] = runs
    sc["blockquote_lines"] = blocks_q
    sc["chars"] = len(text)
    ok = all(bool(v) for k, v in sc.items()
             if isinstance(v, bool) or k == "expected_ids_found")
    return {"cited": cited, "other_refs": other, "known": known, "invented": invented, "located": located,
            "admits": admits, "longest_run": run, "long_runs": runs, "blockquotes": blocks_q,
            "chars": len(text), "scores": sc, "notes": notes, "soft": soft,
            "pass": ok and not res["errors"]}


def regrade(path: pathlib.Path, push: bool = False) -> int:
    """ΞΑΝΑΒΑΘΜΟΛΟΓΗΣΗ ΧΩΡΙΣ ΚΛΗΣΕΙΣ. Όταν αλλάζει ο ΚΑΝΟΝΑΣ βαθμολόγησης, η
    σωστή δοκιμή του είναι πάνω στα ΙΔΙΑ δεδομένα — αλλιώς δεν ξέρεις αν
    βελτιώθηκε το μοντέλο ή αν χαλάρωσε ο κριτής. Μηδέν κόστος, κάθε φορά."""
    d = json.loads(path.read_text(encoding="utf-8"))
    universe, blocks = load_universe()
    marks = source_marks()
    corpora: dict = {}
    npass = pushed = 0
    tracer = None
    if push:
        # ΓΙΑΤΙ ΥΠΑΡΧΕΙ ΤΟ PUSH. Ένας ΝΕΟΣ έλεγχος που μπαίνει σήμερα δεν έχει
        # νόημα μόνο για το μέλλον: οι απαντήσεις που ΕΧΟΥΜΕ είναι τα δεδομένα
        # πάνω στα οποία κρίνεται. Η ξαναβαθμολόγηση κολλά τις νέες μετρήσεις
        # ΠΑΝΩ ΣΤΑ ΙΔΙΑ runs του LangSmith — δηλαδή ό,τι τρέξαμε ήδη αποκτά
        # αναδρομικά τη στήλη, χωρίς καμία νέα κλήση και χωρίς χρέωση.
        try:
            import advisor_trace as tracer       # noqa: PLC0415
        except Exception as e:
            print(f"(δεν φορτώθηκε το advisor_trace: {e} — το feedback δεν θα σταλεί)")
    for r in d["rows"]:
        c, old = r["case"], r["grade"]
        a = c["agent"]
        if a not in corpora:
            corpora[a] = corpus_text(a)
        res = dict(r["result"])
        res["text"] = r["text"]
        g = grade(c, res, universe, blocks, corpora[a], marks)
        if tracer and r["result"].get("trace_run_id"):
            if tracer.score(r["result"]["trace_run_id"], g["scores"],
                            comment=("ΞΑΝΑΒΑΘΜΟΛΟΓΗΣΗ " + d["batch"] + " · " + c["id"] + "\n" +
                                     ("\n".join(g["notes"]) or "καθαρό"))):
                pushed += 1
        npass += bool(g["pass"])
        flip = "" if g["pass"] == old["pass"] else ("  → ΑΛΛΑΞΕ σε " + ("ΠΕΡΑΣΕ" if g["pass"] else "ΚΟΠΗΚΕ"))
        print(f"{c['id']:4s} {c['kind']:8s} {'ΠΕΡΑΣΕ' if g['pass'] else 'ΚΟΠΗΚΕ'}  "
              f"μήκος_παρ={g['longest_run']:>3}λ  παραθέματα={g['long_runs']}  "
              f"μπλοκ='>'×{g['blockquotes']}  {g['chars']:>5,}χαρ{flip}")
        for n in g["notes"]:
            print(f"      ⚠ {n}")
        for n in g.get("soft", []):
            print(f"      · {n}")
        r["grade"] = g
    print(f"\n{npass}/{len(d['rows'])} περνούν με τον ΤΡΕΧΟΝΤΑ κανόνα "
          f"(ήταν {d.get('passed')}/{d.get('total')} με τον παλιό)")
    if push:
        print(f"feedback που γράφτηκε ΠΑΝΩ στα runs του LangSmith: {pushed}/{len(d['rows'])}")
    out = path.with_name(path.stem + "-regraded.json")
    d["passed"], d["regraded_at"] = npass, dt.datetime.now().isoformat(timespec="seconds")
    out.write_text(json.dumps(d, ensure_ascii=False, indent=2), encoding="utf-8")
    print("→", out)
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="QA/QC του Συμβούλου FDMS με ζωντανές κλήσεις.")
    ap.add_argument("--base", default="http://127.0.0.1:8772", help="ο proxy που ελέγχουμε")
    ap.add_argument("--file", default=str(ROOT / "tools" / "fixtures" / "qa_questions.jsonl"))
    ap.add_argument("--batch", default="", help="όνομα παρτίδας (μπαίνει στο ίχνος)")
    ap.add_argument("--only", default="", help="ids ερωτήσεων, χωρισμένα με κόμμα")
    ap.add_argument("--kinds", default="qa,unknown,tool", help="είδη προς εκτέλεση")
    ap.add_argument("--model", default="", help="κλειδί μοντέλου (haiku|sonnet|opus) — κενό = η προεπιλογή του agent")
    ap.add_argument("--effort", default="", help="low|medium|high|xhigh — κενό = η προεπιλογή")
    ap.add_argument("--dry-run", action="store_true", help="δείξε τι θα έτρεχε, χωρίς καμία κλήση")
    ap.add_argument("--push-feedback", action="store_true", dest="push",
                    help="με --regrade: γράψε τις ΝΕΕΣ βαθμολογίες ΠΑΝΩ στα υπάρχοντα runs "
                         "του LangSmith (καμία κλήση μοντέλου, μηδέν κόστος)")
    ap.add_argument("--regrade", default="", metavar="JSON",
                    help="ΞΑΝΑΒΑΘΜΟΛΟΓΗΣΕ αποθηκευμένη παρτίδα — ΚΑΜΙΑ κλήση, μηδέν κόστος. "
                         "Έτσι μια αλλαγή κανόνα κρίνεται πάνω στα ΙΔΙΑ δεδομένα, όχι σε νέα.")
    ap.add_argument("--out", default="", help="φάκελος αναφοράς (default: scratch κοντά στο αρχείο)")
    args = ap.parse_args()

    if args.regrade:
        return regrade(pathlib.Path(args.regrade), push=args.push)

    batch = args.batch or ("qa-" + dt.datetime.now().strftime("%Y%m%d-%H%M"))
    cases = [json.loads(l) for l in pathlib.Path(args.file).read_text(encoding="utf-8").splitlines() if l.strip()]
    kinds = {k.strip() for k in args.kinds.split(",") if k.strip()}
    only = {k.strip() for k in args.only.split(",") if k.strip()}
    cases = [c for c in cases if c.get("kind") in kinds and (not only or c["id"] in only)]
    if not cases:
        print("Καμία ερώτηση δεν ταιριάζει στα φίλτρα.")
        return 2

    print(f"ΠΑΡΤΙΔΑ «{batch}» — {len(cases)} ερωτήσεις → {args.base}"
          f"{'  [ΧΩΡΙΣ ΚΛΗΣΕΙΣ]' if args.dry_run else ''}")
    if args.dry_run:
        for c in cases:
            print(f"  {c['id']:4s} {c['kind']:8s} {c['agent']:15s} {c['q'][:70]}")
        return 0

    universe, blocks = load_universe()
    marks = source_marks()
    print(f"σύμπαν αναγνωριστικών: {len(universe)} · με τοποθεσία: {len(blocks)} · "
          f"με δηλωμένη σελίδα/εδάφιο: {sum(1 for v in marks.values() if v['pages'] or v['refs'])}")
    corpora = {a: corpus_text(a) for a in {c["agent"] for c in cases}}

    try:
        import advisor_trace as tracer
    except Exception:
        tracer = None

    rows = []
    total = 0.0
    for n, c in enumerate(cases, 1):
        trace = {"qa_batch": batch, "qa_id": c["id"], "qa_kind": c["kind"]}
        if c.get("expect_ids"):
            trace["qa_expect_ids"] = c["expect_ids"]
        res = ask(args.base, c["agent"], c["q"], args.model or None, args.effort or None, trace)
        g = grade(c, res, universe, blocks, corpora.get(c["agent"], ""), marks)
        total += res["cost_usd"]
        u = res["usage"] or {}
        mark = "ΠΕΡΑΣΕ" if g["pass"] else "ΚΟΠΗΚΕ"
        print(f"[{n:2d}/{len(cases)}] {c['id']:4s} {c['kind']:8s} {mark}  "
              f"{g['chars']:>5,}χαρ  run={g['longest_run']:>3}λ  id={len(g['known'])}"
              f"{'+' + str(len(g['invented'])) + 'ΕΦΕΥΡ' if g['invented'] else ''}  "
              f"εργ={len(res['tool_calls'])}  "
              f"cache_r={u.get('cache_read_input_tokens', 0):,} w={u.get('cache_creation_input_tokens', 0):,}  "
              f"${res['cost_usd']:.4f}  {res['seconds']}s")
        for note in g["notes"]:
            print(f"        ⚠ {note}")
        for note in g.get("soft", []):
            print(f"        · {note}")
        for e in res["errors"]:
            print(f"        ✖ {e}")
        if tracer and res["trace_run_id"]:
            okf = tracer.score(res["trace_run_id"], g["scores"],
                               comment=("ΠΑΡΤΙΔΑ " + batch + " · " + c["id"] + "\n" +
                                        ("\n".join(g["notes"]) or "καθαρό")))
            if not okf and n == 1:
                print("        (το feedback δεν γράφτηκε στο LangSmith — έλεγξε το LANGSMITH_API_KEY)")
        rows.append({"case": c, "result": {k: v for k, v in res.items() if k != "text"},
                     "text": res["text"], "grade": g})

    npass = sum(1 for r in rows if r["grade"]["pass"])
    print(f"\n{npass}/{len(rows)} πέρασαν · συνολικό κόστος ${total:.4f}")

    outdir = pathlib.Path(args.out) if args.out else pathlib.Path(args.file).parent / "qa-runs"
    outdir.mkdir(parents=True, exist_ok=True)
    p = outdir / f"{batch}.json"
    p.write_text(json.dumps({"batch": batch, "base": args.base, "model": args.model or "(agent)",
                             "effort": args.effort or "(agent)", "at": dt.datetime.now().isoformat(timespec="seconds"),
                             "passed": npass, "total": len(rows), "cost_usd": round(total, 6),
                             "rows": rows}, ensure_ascii=False, indent=2), encoding="utf-8")
    print("→", p)
    return 0 if npass == len(rows) else 1


if __name__ == "__main__":
    raise SystemExit(main())
