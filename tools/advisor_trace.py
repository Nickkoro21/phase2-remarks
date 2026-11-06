# -*- coding: utf-8 -*-
"""ΤΟ ΙΧΝΟΣ ΤΟΥ ΣΥΜΒΟΥΛΟΥ — LangSmith, και ποτέ στον δρόμο της απάντησης.
═══════════════════════════════════════════════════════════════════════════
ΓΙΑΤΙ ΥΠΑΡΧΕΙ. Ο proxy μετράει ΗΔΗ τέσσερις αριθμούς usage ανά γύρο, τις
κλήσεις εργαλείων και τα compactions — και τα πετάει σε **stderr**. Για να
μάθεις τι κόστισε μια ερώτηση πρέπει να κάνεις grep σε αρχείο κειμένου. Το
LangSmith τα κάνει δέντρο: ερώτηση → γύροι → εργαλεία, με tokens, κόστος και
χρόνο στο καθένα, και με δυνατότητα να ξαναπαίξεις μια κακή απάντηση βήμα-βήμα.

Η ΑΡΧΗ ΠΟΥ ΔΙΕΠΕΙ ΟΛΟ ΤΟ ΑΡΧΕΙΟ: **μια αποτυχία εδώ δεν επιτρέπεται να αγγίξει
τον Σύμβουλο.** Το tracing είναι παρατηρητής, όχι συμμετέχων. Αν λείπει το
κλειδί, αν πέσει το δίκτυο του LangSmith, αν αλλάξει το API του SDK — ο
σύμβουλος απαντά **ακριβώς** όπως πριν. Γι' αυτό:
  · ΚΑΘΕ δημόσια μέθοδος είναι τυλιγμένη σε try/except που καταπίνει τα πάντα·
  · όταν είναι σβηστό επιστρέφεται **αντικείμενο-κενό** με τις ίδιες μεθόδους,
    ώστε ο καλών να μη γράφει ποτέ `if tracing:`· ένας κλάδος που δεν υπάρχει
    δεν μπορεί να σπάσει·
  · η αποστολή στο LangSmith γίνεται σε **δικό του νήμα** από το SDK, άρα δεν
    προσθέτει καθυστέρηση στην απάντηση.

ΠΩΣ ΑΝΑΒΕΙ. Χρειάζεται **μόνο** η μεταβλητή περιβάλλοντος `LANGSMITH_API_KEY`,
που τη βάζει ο ιδιοκτήτης — ποτέ δεν περνά από εδώ, δεν γράφεται και δεν
επιστρέφεται. Χωρίς αυτήν το tracing είναι σβηστό και δεν λέει τίποτα.
  LANGSMITH_API_KEY          το κλειδί· η ΜΟΝΗ προϋπόθεση
  ADVISOR_LANGSMITH_PROJECT  προεπιλογή "fdms-advisor"
  ADVISOR_TRACING=0          ρητό σβήσιμο ακόμη κι όταν υπάρχει κλειδί

ΤΟ `LANGSMITH_PROJECT` ΤΟΥ ΣΥΣΤΗΜΑΤΟΣ ΑΓΝΟΕΙΤΑΙ ΕΠΙΤΗΔΕΣ, ΚΑΙ ΑΥΤΟ ΔΕΝ ΕΙΝΑΙ
ΙΔΙΟΤΡΟΠΙΑ. Στο μηχάνημα του ιδιοκτήτη είναι ήδη ορισμένο σε «t6a-assistant»
για το RAG project του. Αν το διαβάζαμε, **κάθε ίχνος του Συμβούλου θα
προσγειωνόταν μέσα σε εκείνο το project** — ανακατεύοντας δύο συστήματα με
άλλο corpus, άλλους agents και άλλο κόστος, και χαλώντας τις μετρήσεις και
των δύο. Το κλειδί είναι κοινό (ίδιος λογαριασμός)· ο προορισμός όχι.
Γι' αυτό το όνομα της μεταβλητής έχει δικό του πρόθεμα: μια κοινή μεταβλητή
είναι μοιρασμένη κατάσταση, και η μοιρασμένη κατάσταση βρίσκει τρόπο να
διαρρεύσει — εδώ θα διέρρεε σιωπηλά, σε πίνακα που δουλεύει.

ΤΟ ΣΧΗΜΑ ΤΟΥ ΔΕΝΤΡΟΥ, και ταιριάζει με αυτό που ήδη τρέχει στο T-6A project:
    ask · <agent>                      (chain)   ← μία ρίζα ανά ερώτηση
      ├── iteration 1                  (llm)     ← usage, μοντέλο, stop_reason
      ├── tool · search_sources        (tool)
      ├── iteration 2                  (llm)
      └── …
Οι αριθμοί usage μπαίνουν ως `usage_metadata` στη μορφή που το LangSmith
αναγνωρίζει, ώστε να **υπολογίζει κόστος μόνο του** — μαζί με τα cache_read /
cache_creation, που στο CAG είναι ο κύριος όγκος και θα έλειπαν αλλιώς.
"""
from __future__ import annotations

import os
import time

_S: dict = {"ready": False, "on": False, "RunTree": None, "project": "", "why": ""}


def _boot() -> None:
    """Μία φορά, τεμπέλικα. Σιωπηλή σε κάθε αποτυχία — το `why` κρατά τον λόγο
    για να μπορεί ο proxy να τον ΚΑΤΑΓΡΑΨΕΙ μία φορά στην εκκίνηση, αντί να
    μένει ο ιδιοκτήτης να αναρωτιέται γιατί δεν βλέπει traces."""
    if _S["ready"]:
        return
    _S["ready"] = True
    try:
        if str(os.environ.get("ADVISOR_TRACING", "")).strip() == "0":
            _S["why"] = "σβηστό ρητά (ADVISOR_TRACING=0)"
            return
        if not str(os.environ.get("LANGSMITH_API_KEY", "")).strip():
            _S["why"] = "χωρίς LANGSMITH_API_KEY — σβηστό"
            return
        from langsmith.run_trees import RunTree     # noqa: PLC0415
        _S["RunTree"] = RunTree
        # ΔΙΚΗ ΜΑΣ μεταβλητή — βλ. το κεφάλαιο στην κεφαλή: το καθολικό
        # LANGSMITH_PROJECT δείχνει στο RAG project και ΔΕΝ διαβάζεται εδώ.
        _S["project"] = str(os.environ.get("ADVISOR_LANGSMITH_PROJECT", "") or "fdms-advisor")
        _S["on"] = True
        _S["why"] = f"ΝΑΙ — project «{_S['project']}»"
    except Exception as e:                          # SDK απών ή χαλασμένος
        _S["on"] = False
        _S["why"] = f"μη διαθέσιμο ({type(e).__name__})"


def status() -> str:
    _boot()
    return _S["why"]


def enabled() -> bool:
    _boot()
    return bool(_S["on"])


# ── ΤΟ ΚΕΝΟ ΑΝΤΙΚΕΙΜΕΝΟ ────────────────────────────────────────────────────
# Ίδιες μέθοδοι, καμία ενέργεια. Ο καλών δεν ρωτά ποτέ αν το tracing είναι
# ανοιχτό· γράφει τον ίδιο κώδικα και στις δύο περιπτώσεις.
class _Null:
    run_id = ""          # ΚΕΙΜΕΝΟ, όχι None: ο καλών το βάζει σε JSON χωρίς έλεγχο
    cost_usd = 0.0

    def llm(self, *a, **k) -> None: ...
    def tool(self, *a, **k) -> None: ...
    def finish(self, *a, **k) -> None: ...
    def fail(self, *a, **k) -> None: ...


# ── ΤΟ ΤΙΜΟΛΟΓΙΟ, ΓΙΑΤΙ ΤΟ LANGSMITH ΔΕΝ ΤΟ ΞΕΡΕΙ ΣΩΣΤΑ ΓΙΑ ΜΑΣ ────────────────
# Ο Haiku 5.5 έχει ΔΥΟ τιμές: $0.10/$0.50 ανά MTok όταν το prompt είναι ως
# 100.000 tokens, και $0.50/$2.50 πάνω από εκεί — ΠΕΝΤΑΠΛΑΣΙΟ. Τα τρία από τα
# τέσσερα corpora μας (μετρημένα 06/11/2026: board 432.036, syllabus 323.089,
# description 142.398, remarks 96.637) είναι ΠΑΝΩ από τη γραμμή. Η στήλη
# κόστους του LangSmith δεν γνωρίζει αυτό το κλιμάκιο, άρα θα έδειχνε τον
# Σύμβουλο έως πέντε φορές φθηνότερο απ' ό,τι είναι — και σε έναν πίνακα που
# δουλεύει, ένα νούμερο που λέει ψέματα είναι χειρότερο από κανένα νούμερο.
# Γι' αυτό υπολογίζουμε ΕΜΕΙΣ το κόστος και το στέλνουμε ως metadata.
#
# write = 2x της εισόδου (TTL 1 ώρα· ο κυλιόμενος 4ος δείκτης είναι 5 λεπτών,
# δηλαδή 1.25x — τον χρεώνουμε ΚΙ ΑΥΤΟΝ ως 2x, άρα η εκτίμηση είναι ελαφρώς
# ΑΝΩ του αληθινού· προτιμούμε να υπερεκτιμά παρά να καθησυχάζει).
PRICES = {
    "claude-haiku-5-5":  {"in": 0.10, "out": 0.50, "in_hi": 0.50, "out_hi": 2.50, "read": 0.10},
    "claude-sonnet-5-5": {"in": 2.00, "out": 10.00, "in_hi": 2.00, "out_hi": 10.00, "read": 0.10},
    "claude-opus-5-5":   {"in": 4.00, "out": 20.00, "in_hi": 4.00, "out_hi": 20.00, "read": 0.05},
}
TIER_LINE = 100_000


def cost_usd(model: str, u: dict) -> float | None:
    """Δολάρια για ΕΝΑΝ γύρο. None για μοντέλο που δεν ξέρουμε — ποτέ μαντεμένη τιμή."""
    p = PRICES.get(str(model or ""))
    if not p:
        return None
    fresh = int(u.get("input_tokens") or 0)
    cr = int(u.get("cache_read_input_tokens") or 0)
    cw = int(u.get("cache_creation_input_tokens") or 0)
    out = int(u.get("output_tokens") or 0)
    hi = (fresh + cr + cw) > TIER_LINE          # το κλιμάκιο κρίνεται στο ΣΥΝΟΛΟ εισόδου
    p_in = p["in_hi"] if hi else p["in"]
    p_out = p["out_hi"] if hi else p["out"]
    total = (fresh * p_in + cw * p_in * 2.0 + cr * p_in * p["read"] + out * p_out) / 1e6
    return round(total, 6)


def _usage_meta(u: dict) -> dict:
    """Οι τέσσερις αριθμοί μας στη μορφή που τιμολογεί το LangSmith.
    ΤΟ `input_tokens` ΕΙΝΑΙ ΤΟ ΣΥΝΟΛΟ, με τα cache ως ΥΠΟ-σύνολα — έτσι το
    ορίζει το σχήμα, και αν στέλναμε μόνο το φρέσκο θα έδειχνε το CAG μας
    εικοσιπλάσια φθηνότερο απ' ό,τι είναι."""
    fresh = int(u.get("input_tokens") or 0)
    cr = int(u.get("cache_read_input_tokens") or 0)
    cw = int(u.get("cache_creation_input_tokens") or 0)
    out = int(u.get("output_tokens") or 0)
    return {
        "input_tokens": fresh + cr + cw,
        "output_tokens": out,
        "total_tokens": fresh + cr + cw + out,
        "input_token_details": {"cache_read": cr, "cache_creation": cw},
    }


class _Trace:
    def __init__(self, root) -> None:
        self._root = root
        self._n = 0
        self.cost_usd = 0.0
        try:
            self.run_id = str(root.id)
        except Exception:
            self.run_id = ""

    def llm(self, usage: dict, model: str, stop: str | None, t0: float) -> None:
        """Ένας γύρος του μοντέλου."""
        try:
            self._n += 1
            c_usd = cost_usd(model, usage)
            if c_usd:
                self.cost_usd = round(self.cost_usd + c_usd, 6)
            c = self._root.create_child(
                name=f"iteration {self._n}", run_type="llm",
                inputs={"model": model},
                start_time=_dt(t0),
                extra={"metadata": {"ls_provider": "anthropic", "ls_model_name": model,
                                    "cost_usd": c_usd}},
            )
            c.post()
            c.end(outputs={"stop_reason": stop, "usage_metadata": _usage_meta(usage)})
            c.patch()
        except Exception:
            pass

    def tool(self, name: str, inp, budget: dict | None = None) -> None:
        """Το span του εργαλείου κουβαλά ΤΑ ΦΡΕΝΑ, όχι το κείμενο που γύρισε.
        ΤΟ ΚΕΙΜΕΝΟ ΜΕΝΕΙ ΕΚΤΟΣ ΕΠΙΤΗΔΕΣ: αποσπάσματα corpus σε εξωτερικό πίνακα
        είναι το corpus σε εξωτερικό πίνακα. Οι μετρητές (κλήσεις, ανακτήσεις,
        χαρακτήρες) λένε ό,τι χρειάζεται ένας έλεγχος: πού χτυπά το φρένο."""
        try:
            c = self._root.create_child(name=f"tool · {name}", run_type="tool",
                                        inputs={"input": inp},
                                        extra={"metadata": budget or {}})
            c.post()
            c.end(outputs={"budget": budget or {}})
            c.patch()
        except Exception:
            pass

    def finish(self, text: str, usage: dict, iterations: int, stop: str | None,
               extra: dict | None = None) -> None:
        try:
            md = {"cost_usd": self.cost_usd}
            md.update(extra or {})
            self._root.add_metadata(md) if hasattr(self._root, "add_metadata") else None
            self._root.end(outputs={
                "text": text, "iterations": iterations, "stop_reason": stop,
                "cost_usd": self.cost_usd,
                "usage_metadata": _usage_meta(usage),
            })
            self._root.patch()
        except Exception:
            pass

    def fail(self, err: str) -> None:
        try:
            self._root.end(error=str(err)[:2000])
            self._root.patch()
        except Exception:
            pass


def _dt(ts: float):
    from datetime import datetime, timezone
    return datetime.fromtimestamp(ts, timezone.utc)


def start(agent: dict, question: str, session_id: str = "", extra: dict | None = None):
    """Η ρίζα μιας ερώτησης. Επιστρέφει ΠΑΝΤΑ αντικείμενο με τις ίδιες μεθόδους."""
    if not enabled():
        return _Null()
    try:
        md = {
            "agent": agent.get("id", ""),
            "model": agent.get("model", ""),
            "effort": agent.get("effort", ""),
            "session": session_id,
        }
        md.update(extra or {})
        rt = _S["RunTree"](
            name=f"ask · {agent.get('id', '?')}",
            run_type="chain",
            project_name=_S["project"],
            inputs={"question": question},
            extra={"metadata": md},
        )
        rt.post()
        return _Trace(rt)
    except Exception:
        return _Null()


# ── Η ΒΑΘΜΟΛΟΓΙΑ ΓΥΡΙΖΕΙ ΠΙΣΩ ΣΤΟ ΙΧΝΟΣ ─────────────────────────────────────
# ΓΙΑΤΙ ΥΠΑΡΧΕΙ. Ένας έλεγχος που γράφει «πέρασε/κόπηκε» σε αρχείο κειμένου
# πεθαίνει με το αρχείο. Γραμμένο ως feedback ΠΑΝΩ στο run, το εύρημα κάθεται
# δίπλα στην απάντηση που το γέννησε: ανοίγεις το run, βλέπεις ΚΑΙ το κείμενο
# ΚΑΙ γιατί κόπηκε, και στο βάθος του χρόνου βγαίνει καμπύλη — «παραβιάσεις
# αυτολεξεί ανά εβδομάδα» — που κανένα txt δεν δίνει.
# Ίδια αρχή με όλο το αρχείο: αποτυχία εδώ δεν αγγίζει τίποτα.
def score(run_id: str, scores: dict, comment: str = "") -> bool:
    """scores: {«κλειδί»: True/False/αριθμός}. Επιστρέφει αν γράφτηκε."""
    if not run_id or not enabled() or not scores:
        return False
    try:
        from langsmith import Client                       # noqa: PLC0415
        cl = Client()
        for k, v in scores.items():
            val = float(v) if not isinstance(v, bool) else (1.0 if v else 0.0)
            cl.create_feedback(run_id, key=str(k), score=val,
                               comment=(comment or "")[:2000] or None)
        return True
    except Exception:
        return False
