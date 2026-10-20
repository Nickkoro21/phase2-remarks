#!/usr/bin/env python3
# -*- coding: utf-8 -*-
r"""
Ο ΤΟΠΙΚΟΣ PROXY ΤΟΥ ΣΥΜΒΟΥΛΟΥ — advisor_proxy.py
════════════════════════════════════════════════════════════════════════════

ΤΙ ΕΙΝΑΙ. Ένας μικρός HTTP server που τρέχει ΜΟΝΟ στο μηχάνημα του ιδιοκτήτη
(127.0.0.1) και κρατά το κλειδί του API έξω από τη σελίδα. Η καρτέλα
«Σύμβουλος» της εφαρμογής (app/advisor.js) του στέλνει την ερώτηση· αυτός
βάζει μπροστά το corpus (tools/advisor/context-*.md) και το prompt του agent
(agents/<id>/agent.md), καλεί το μοντέλο και επιστρέφει την απάντηση σε ροή.

ΔΕΝ ΕΙΝΑΙ ΜΕΡΟΣ ΤΗΣ ΕΦΑΡΜΟΓΗΣ. Η εφαρμογή μένει zero-dependency· αυτό είναι
εργαλείο developer, έξω από το app/, με το επίσημο SDK (`pip install anthropic`).
Το build_offline.py ΔΕΝ το περιλαμβάνει, ούτε το app/advisor.js: το παραδοτέο
της μονάδας δεν έχει σύμβουλο, δίκτυο ή API.

ΤΟ ΚΛΕΙΔΙ. Διαβάζεται από τη μεταβλητή περιβάλλοντος ANTHROPIC_API_KEY ΤΗ ΣΤΙΓΜΗ
ΤΟΥ ΑΙΤΗΜΑΤΟΣ. Δεν γράφεται πουθενά, δεν τυπώνεται, δεν επιστρέφεται. Αν λείπει,
ο server ξεκινά κανονικά και κάθε /ask απαντά με καθαρό μήνυμα — όχι traceback.

Η ΟΙΚΟΝΟΜΙΑ. Το corpus (~730 KB ελληνικά ≈ 300 χιλ. tokens) πάει στο system
prompt πίσω από ρητό cache_control. Η πρώτη κλήση το ΓΡΑΦΕΙ στο cache, κάθε
επόμενη το ΔΙΑΒΑΖΕΙ στο ~5% της τιμής. Αν το cache σπάσει σιωπηλά (μία byte
αλλαγή στο πρόθεμα) ο λογαριασμός εικοσαπλασιάζεται — γι' αυτό ΚΑΘΕ κλήση
καταγράφει τους τέσσερις αριθμούς usage στο stderr και τους στέλνει στη σελίδα,
και η δεύτερη κλήση με cache_read_input_tokens == 0 σημαίνεται ως CACHE MISS.

ΤΑ ΤΡΙΑ ΦΡΕΝΑ (όλα δικά μας — δεν υπάρχει εξωτερικό workspace να βάλει όριο):
  1. ΓΥΡΟΙ ΑΝΑ ΣΥΖΗΤΗΣΗ    ADVISOR_MAX_TURNS        --max-turns        default 20
     (ο μικρότερος από το global όριο και το `max_turns` του agent.md)
  2. ΑΙΤΗΜΑΤΑ ΑΝΑ ΗΜΕΡΑ    ADVISOR_DAILY_CAP        --daily-cap        default 200
     (μετρητής σε μικρό τοπικό αρχείο κατάστασης, μηδενίζει με την ημερομηνία)
  3. ΜΕΓΕΘΟΣ CORPUS         ADVISOR_MAX_CORPUS_BYTES --max-corpus-bytes default 1_000_000
     (ένα corpus πάνω από το όριο ΑΠΟΡΡΙΠΤΕΤΑΙ — ένα ξεφυγμένο build δεν τριπλασιάζει
     σιωπηλά το κόστος. Το context-full.md (1.17 MB) είναι εσκεμμένα ΠΑΝΩ από την
     προεπιλογή: για να τρέξει agent με αυτό, ο ιδιοκτήτης ανεβάζει ρητά το όριο.)

ΤΑ ΕΡΓΑΛΕΙΑ search_sources + fetch_source (απόφανση ιδιοκτήτη: «δεν βρίσκω
απάντηση, θέλω να ψάξω λίγο περαιτέρω» — μέσα σε όρια που βλέπει). Ο agent που
έχει `search_sources` στο `tools:` του agent.md παίρνει ΚΑΙ ΤΑ ΔΥΟ (ζευγάρι) και
μπορεί να ψάξει ΜΟΝΟ στη WHITELIST (παρακάτω)· ο proxy εκτελεί και επιστρέφει. Ο
έλεγχος είναι ΣΤΗ ΔΙΑΔΡΟΜΗ, όχι στην οδηγία: κάθε source αναλύεται σε απόλυτη
διαδρομή και πρέπει να πέφτει μέσα σε καταχώριση της λίστας· αλλιώς επιστρέφεται
tool error και το μοντέλο μαθαίνει το όριο. D:\FDMS-roster, .claude, το home, ο
φάκελος υποθέσεων — δεν είναι στη λίστα, άρα δεν υπάρχουν. Το ίδιο ισχύει για
την ανάκτηση: μια λαβή με πηγή εκτός λίστας απορρίπτεται από το ΙΔΙΟ resolve_source.
  ΔΥΟ ΕΡΓΑΛΕΙΑ ΑΝΤΙ ΓΙΑ ΕΝΑ (18/10/2026). Η αναζήτηση έκοβε αποσπάσματα 900
  χαρακτήρων ΤΥΦΛΑ, στη μέση λέξης — σε πραγματική ερώτηση 25 ευρήματα, 5.715
  χαρακτήρες, κανένα ολόκληρο, και ο agent με εντολή «παράθεσε αυτολεξεί». Τώρα:
    search_sources  ΒΡΙΣΚΕΙ — αποσπάσματα κομμένα σε όριο πρότασης/παραγράφου,
                    που λένε πόσοι χαρακτήρες παραλείπονται και φέρουν ΛΑΒΗ·
                    η ελληνική κλίση δεν μετρά («δοκιμή» βρίσκει «δοκιμές»).
    fetch_source    ΦΕΡΝΕΙ ΤΟ ΠΛΗΡΕΣ — δέχεται τη λαβή (<πηγή>#<id|h:hash|pN>)
                    και επιστρέφει ΟΛΟΚΛΗΡΗ τη μονάδα: εδάφιο, JSON αντικείμενο,
                    σελίδα PDF· πάνω από το όριο, αριθμημένα μέρη, ποτέ σιωπηλά.
  Η σχεδίαση της λαβής και το σκεπτικό κάθε ορίου: στην κεφαλή της ενότητας
  «search_sources + fetch_source» πιο κάτω.
  Η ΔΙΑΚΡΙΣΗ ΠΟΥ ΜΕΤΡΑΕΙ: το corpus του system prompt είναι ψηφιοποιημένο ΚΑΙ
  επικυρωμένο. Το κείμενο των PDF είναι ΑΚΑΤΕΡΓΑΣΤΗ εξαγωγή — κανείς δεν το
  έλεγξε. Κάθε εύρημα από PDF επιστρέφει τυλιγμένο στον χαρακτηρισμό
  «ΑΚΑΤΕΡΓΑΣΤΟ ΚΕΙΜΕΝΟ ΠΗΓΗΣ (σελ. N) — ΔΕΝ έχει περάσει από επικύρωση», που ο
  agent οφείλει να μεταφέρει στην απάντηση. Τα επιμελημένα αρχεία (data/*, το
  context-full.md) δεν φέρουν τον χαρακτηρισμό, γιατί είναι επικυρωμένα.
  ΦΡΕΝΑ ΤΩΝ ΕΡΓΑΛΕΙΩΝ (18/10/2026 — αναπροσαρμοσμένα για δύο εργαλεία, όχι καταργημένα):
     ADVISOR_TOOL_MAX_CALLS       --tool-max-calls       default 5     αναζητήσεις ανά απάντηση
     ADVISOR_TOOL_MAX_CHARS       --tool-max-chars       default 8000  χαρακτήρες ανά αναζήτηση
     ADVISOR_FETCH_MAX_CALLS      --fetch-max-calls      default 8     ανακτήσεις ανά απάντηση
     ADVISOR_FETCH_MAX_CHARS      --fetch-max-chars      default 12000 χαρακτήρες ανά ανάκτηση (μετά: μέρη)
     ADVISOR_SEARCH_EXCERPT_CHARS --search-excerpt-chars default 700   μήκος αποσπάσματος αναζήτησης
     ADVISOR_TOOL_TOTAL_CHARS     --tool-total-chars     default 60000 χαρακτήρες ΟΛΩΝ των εργαλείων ανά απάντηση
  Κάθε κλήση καταγράφεται: ερώτημα/λαβή, πηγή, ευρήματα, χαρακτήρες, ολόκληρο ή μέρος.

Ο ΦΑΚΕΛΟΣ ΥΠΟΘΕΣΕΩΝ (casefile — απόφανση ιδιοκτήτη: ο Board Director δουλεύει
με ΠΡΑΓΜΑΤΙΚΟΥΣ μαθητές: «ο μαθητής Ψ είχε αεροναυτία, μην κάνεις τίποτα»).
Ξεχωριστό Supabase project (db/casefile.sql). Ο agent ΔΕΝ αγγίζει πίνακες και
ΔΕΝ γράφει SQL: καλεί τέσσερα εργαλεία που ο proxy μεταφράζει σε ΤΡΕΙΣ Postgres
συναρτήσεις και ΔΥΟ αναγνώσεις — αυτή είναι όλη η επιφάνεια:
  casefile_find_student   → GET  students            (ανάγνωση)
  casefile_list_cases     → GET  cases_live          (όψη χωρίς τα ανακληθέντα)
  casefile_add_case       → RPC  fn_add_case(p_actor, …)        → uuid
  casefile_update_case    → RPC  fn_update_case(p_actor, …)     → void
  (fn_upsert_student υπάρχει αλλά ΔΕΝ εκτίθεται: μαθητές γράφει ο ιδιοκτήτης.)
  Το p_actor είναι ΠΑΝΤΑ 'agent:<id>' και το βάζει ο proxy — το μοντέλο δεν το
  επιλέγει. ΔΙΑΓΡΑΦΗ ΔΕΝ ΥΠΑΡΧΕΙ και δεν μπορεί να υπάρξει (REVOKE στο GRANT):
  το p_withdraw=true σημαίνει ανάκληση, το κείμενο επιζεί, το log γράφει 'delete'.
  ΔΙΑΠΙΣΤΕΥΤΗΡΙΑ: FDMS_CASEFILE_URL και FDMS_CASEFILE_KEY (service-role) από το
  περιβάλλον, ίδια πειθαρχία με το ANTHROPIC_API_KEY — τη στιγμή του αιτήματος,
  ποτέ στον δίσκο, ποτέ στο log, ποτέ στην απάντηση. Αν λείπουν, τα εργαλεία
  casefile ΔΕΝ προσφέρονται στο μοντέλο και το /health το λέει· ο σύμβουλος
  απαντά κανονικά τα κανονιστικά, απλώς δεν βλέπει μαθητές.
  ΦΡΕΝΑ:  ADVISOR_CASEFILE_MAX_CALLS  --casefile-max-calls  default 8  κλήσεις/απάντηση
          ADVISOR_CASEFILE_MAX_WRITES --casefile-max-writes default 2  εγγραφές/απάντηση
  Κάθε εγγραφή επιστρέφει στο μοντέλο ΚΑΙ στη σελίδα (event tool_result) το τι
  γράφτηκε, για ποιον, με ποιο id — ο ιδιοκτήτης το βλέπει ανεξάρτητα από το αν
  το μοντέλο το αφηγηθεί.

R-A — Η ΠΥΛΗ ΕΠΙΒΕΒΑΙΩΣΗΣ (απόφανση ιδιοκτήτη: «να ζητάει την επιβεβαίωση πριν
κάνει την εγγραφή είναι ένα fail-safe βήμα»). Τα casefile_add_case /
casefile_update_case ΔΕΝ γράφουν. Επιστρέφουν στο μοντέλο ΠΡΟΕΠΙΣΚΟΠΗΣΗ και ένα
token μίας χρήσης· η σελίδα δείχνει την προεπισκόπηση με «Γράψ' το» / «Άκυρο»,
και η γραμμή γράφεται ΜΟΝΟ όταν ο ιδιοκτήτης πατήσει, μέσω POST /confirm που
εξαργυρώνει το token. Το token: τυχαίο, μίας χρήσης, λήγει σε ADVISOR_CONFIRM_TTL_S
(default 900 s), ΔΕΜΕΝΟ με τη συνεδρία και τον agent που το γέννησαν — ένα token
που επιζεί της ερώτησής του είναι γεμάτο όπλο. Ζει μόνο στη μνήμη του proxy.
Το όριο 2 προεπισκοπήσεων/απάντηση, το log και ο actor `agent:<id>` μένουν.
Οι αναγνώσεις ΔΕΝ έχουν πύλη — δεν υπάρχει τίποτα να αναιρέσεις σε μια ανάγνωση.

R-B — Η ΜΝΗΜΗ, με το σχήμα που έδωσε ο ιδιοκτήτης: «αφού περάσει τις αλλαγές στη
βάση δεδομένων, να σβήνει η συνομιλία και μετά να τραβάει τη νέα βάση δεδομένων».
Η ΔΙΑΡΚΗΣ μνήμη είναι ο φάκελος υποθέσεων, όχι η συνομιλία. Τρία πράγματα:
  1. ΣΥΝΕΔΡΙΕΣ που επιζούν, στον PROXY (όχι στον browser):
     tools/advisor/sessions/<agent>/<id>.json — {id, agent, title, context,
     student_id, created, updated, messages[], writes[], events[]}. ΚΡΑΤΟΥΝ
     ΠΡΑΓΜΑΤΙΚΑ ΟΝΟΜΑΤΑ: gitignored όπως το roster, και ΠΟΤΕ όνομα σε γραμμή log
     (μόνο ids). GET /sessions?agent= · POST /sessions · GET /sessions/<id> ·
     POST /sessions/<id>/archive · POST /sessions/<id>/close. Το /ask παίρνει
     πλέον {session, question} και ο proxy κρατά το ιστορικό.
  2. COMPACTION όταν το ΣΥΝΟΛΟ corpus + ιστορικό πλησιάσει το ταβάνι (Q1, απόφανση
     ιδιοκτήτη «Σύνολο 400.000, βάλ' το να υπολογίζει το σύνολο»· 18/10/2026
     ανέβηκε ρητά σε 600.000 — τα μοντέλα πάνε ως 1 εκατ., τα 600.000 αφήνουν
     περιθώριο, και με δύο εργαλεία κάθε γύρος κουβαλά περισσότερο κείμενο πηγών):
     est(πρόθεμα system) + est(ιστορικό + ερώτηση) > ADVISOR_CONTEXT_CEILING_TOKENS
     (600.000) − max_tokens της απάντησης. Η εκτίμηση: GREEK_CHARS_PER_TOKEN=2.5.
     Προσαρμόζεται μόνη της: ο remarks (162 KB corpus) έχει πολύ περισσότερο χώρο
     συζήτησης από τον board (464 KB). Το ιστορικό ΜΟΝΟ αλλάζει — το corpus είναι το cached
     πρόθεμα και δεν μετακινείται ΠΟΤΕ. Το μοντέλο ξαναγράφει τη συζήτηση σε
     ΔΟΜΗΜΕΝΗ ΣΥΝΟΨΗ σταθερού σχήματος (μαθητής & ερώτημα · τι τεκμηριώθηκε, με
     παραπομπές · τι μένει ανοιχτό · τι γράφτηκε, με ids) και το ιστορικό
     αντικαθίσταται από αυτή (+ τα τελευταία ADVISOR_COMPACT_KEEP ζεύγη
     αυτούσια). Την ενότητα «ΤΙ ΓΡΑΦΤΗΚΕ» τη γράφει ο PROXY από το session.writes
     — όχι από τη μνήμη του μοντέλου. Η κλήση compaction στέλνει ΙΔΙΟ tools +
     system (ίδιο md5 προθέματος) με tool_choice none, ώστε να διαβάσει το corpus
     από το cache. Η σελίδα το λέει όταν συμβεί — η σιωπηλή απώλεια μνήμης είναι
     ακριβώς αυτό που ζήτησε να αποφύγουμε.
  3. «ΕΚΛΕΙΣΕ Η ΥΠΟΘΕΣΗ» — μετά από επιβεβαιωμένη εγγραφή, POST /sessions/<id>/close
     αρχειοθετεί τη συνεδρία και ανοίγει νέα, ΣΠΑΡΜΕΝΗ από ανάγνωση του φακέλου
     του μαθητή όπως είναι ΤΩΡΑ καταγεγραμμένος. Η βάση είναι η σύνοψη.
  Μετά από ώρες το cache (1h) έχει λήξει και η πρώτη ερώτηση ξαναγράφει το corpus
  — αναμενόμενο· το event usage το σημαίνει (cache_rewrite) ώστε να φαίνεται.

F3 — KEEP-ALIVE ΤΟΥ CACHE. Εξάωρο TTL δεν υπάρχει (μόνο 5m / 1h). Αλλά μια
ΑΝΑΓΝΩΣΗ του cache ανανεώνει τον χρόνο του χωρίς έξτρα κόστος: ένα νήμα
ξαναστέλνει το ΙΔΙΟ πρόθεμα (system + tools, ίδιο md5) με max_tokens: 0 λίγο
πριν τη λήξη (1h → στα 50′, 5m → στα 4′), για κάθε agent που ρωτήθηκε μέσα
στις τελευταίες ADVISOR_KEEPALIVE_IDLE_H ώρες. Κόστος: μία ανάγνωση (~$0.04)
αντί για εγγραφή (~$1.60). Καταγράφεται ως [keepalive], μετρά στον ημερήσιο
μετρητή, φαίνεται στο /health. Αν το API απορρίψει το max_tokens: 0 με αυτά
που στέλνουμε, το νήμα το γράφει ΡΗΤΑ στο log και στο /health και σταματά για
τον agent μετά από 2 αποτυχίες — δεν το παρακάμπτει σιωπηλά.
  ADVISOR_KEEPALIVE        --keepalive {0,1}   default 1
  ADVISOR_KEEPALIVE_IDLE_H --keepalive-idle    default 8  (ώρες χωρίς ερώτηση → σταματά)

F4 — ΕΞΑΓΩΓΗ: GET /sessions/<id>/export?agent=&format=md|json → η συζήτηση ως
αναγνώσιμο Markdown (ερωτήσεις, απαντήσεις, εργαλεία, εγγραφές με ids,
compactions, σύνολα usage) ή ως το JSON της. Τοπικά, στον δίσκο του· κανένα
third-party tracing — οι συνεδρίες έχουν πραγματικά ονόματα.

ΑΛΛΕΣ ΡΥΘΜΙΣΕΙΣ
  ADVISOR_CONTEXT_CEILING_TOKENS --context-ceiling default 600000 (ΣΥΝΟΛΟ tokens corpus+ιστορικό, ΕΚΤΙΜΗΣΗ με 2.5 χαρ./token· ήταν 400000 ως 18/10/2026)
  ADVISOR_COMPACT_KEEP        --compact-keep    default 1      (ζεύγη που μένουν αυτούσια)
  ADVISOR_CONFIRM_TTL_S       --confirm-ttl     default 900    (ζωή token επιβεβαίωσης)
  ADVISOR_SESSIONS_DIR        --sessions-dir    default tools/advisor/sessions/
  ADVISOR_PORT        --port        default 8771
  ADVISOR_CACHE_TTL   --cache-ttl   default 1h   (5m | 1h — ο ιδιοκτήτης ρωτά
                                                 αραιά· το 1h αξίζει το 2× στη
                                                 γραφή από το δεύτερο κενό >5')
  ADVISOR_STATE_FILE  --state-file  default tools/advisor/.proxy-state.json
  ADVISOR_AGENTS_DIR  --agents-dir  default agents/
  ADVISOR_CORPUS_DIR  --corpus-dir  default tools/advisor/

ENDPOINTS (CORS μόνο για http://localhost:*, http://127.0.0.1:* και file://)
  GET  /health   κλειδί παρόν?, agents, corpora, μετρητής ημέρας, όρια
  GET  /agents   τα διαθέσιμα agent ids με το corpus τους
  POST /ask      {agent, messages, student?}  →  text/event-stream (SSE)
                 events: start · text · tool_call · tool_result · usage · done · error

ΤΡΕΞΙΜΟ
  python tools/advisor_proxy.py                       → server στο 127.0.0.1:8771
  python tools/advisor_proxy.py --dry-run             → χτίζει και τυπώνει το
                                                        αίτημα, ΧΩΡΙΣ κλήση API
  python tools/advisor_proxy.py --search "ΚΕΠΕ" --source 3-01
                                                      → τρέχει την αναζήτηση τοπικά
  python tools/advisor_proxy.py --fetch "3-01#p54"    → τρέχει την ανάκτηση τοπικά
                                                        (ή context-full#fail-24, --part 2)
  python tools/advisor_proxy.py --count-tokens        → ΜΙΑ δωρεάν κλήση
                                                        count_tokens για το μέγεθος
                                                        του corpus (χρειάζεται κλειδί)
"""
from __future__ import annotations

import argparse
import base64
import datetime as dt
import hashlib
import json
import os
import pathlib
import re
import sys
import threading
import time
import unicodedata
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")   # type: ignore[attr-defined]
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")   # type: ignore[attr-defined]
except Exception:
    pass

ROOT = pathlib.Path(__file__).resolve().parents[1]

# ── ΠΡΟΕΠΙΛΟΓΕΣ (όλες αλλάζουν με env ή flag· η τεκμηρίωση είναι στην κεφαλίδα) ──
DEFAULTS = {
    "port": 8771,
    "max_turns": 20,
    "daily_cap": 200,
    "max_corpus_bytes": 1_000_000,
    "cache_ttl": "1h",
    # 20/10/2026, απόφανση ιδιοκτήτη: «αντί για 5, 20 γύρους αναζήτησης».
    # Ήταν 5 και ΧΤΥΠΟΥΣΕ: στη συνεδρία της F4404 το όριο εξαντλήθηκε πριν ο
    # σύμβουλος φτάσει στον πίνακα MIF, και ο επιθυμητός κώδικας έμεινε κενός.
    "tool_max_calls": 20,
    # 18/10/2026 — δύο εργαλεία (αναζήτηση + ανάκτηση)· το σκεπτικό κάθε αριθμού
    # είναι γραμμένο στην κεφαλή της ενότητας «search_sources + fetch_source».
    "tool_max_chars": 8000,        # ανά κλήση αναζήτησης (ήταν 6000: έκοβε τα 8 ευρήματα της προεπιλογής)
    "tool_total_chars": 120000,    # ανά απάντηση, ΟΛΑ τα εργαλεία — ανέβηκε μαζί με τους γύρους (ήταν 60000)
    "fetch_max_calls": 8,          # ανακτήσεις ανά απάντηση
    "fetch_max_chars": 12000,      # ανά ανάκτηση: το μεγαλύτερο εδάφιο του corpus (11.564) χωρά ΟΛΟΚΛΗΡΟ
    "search_excerpt_chars": 700,   # μήκος αποσπάσματος αναζήτησης (κόβει σε όριο, ποτέ μέσα σε λέξη)
    "casefile_max_calls": 8,
    "casefile_max_writes": 2,
    # Q1: ΣΥΝΟΛΟ tokens (corpus + ιστορικό). Ήταν 400.000 (απόφανση «Σύνολο 400.000»)·
    # 18/10/2026 απόφανση ιδιοκτήτη: 600.000 — τα μοντέλα πάνε ως 1 εκατ., τα
    # 600.000 αφήνουν περιθώριο, και με δύο εργαλεία η απάντηση κουβαλά περισσότερο
    # κείμενο πηγών (έως 60.000 χαρ. ≈ 24.000 tokens ανά γύρο).
    "context_ceiling": 600_000,
    "compact_keep": 1,
    "confirm_ttl": 900,
    "keepalive": 1,
    "keepalive_idle_h": 8,
    "sessions_dir": str(ROOT / "tools" / "advisor" / "sessions"),
    "state_file": str(ROOT / "tools" / "advisor" / ".proxy-state.json"),
    "agents_dir": str(ROOT / "agents"),
    "corpus_dir": str(ROOT / "tools" / "advisor"),
}
# Q1 — Η ΕΚΤΙΜΗΣΗ TOKENS. Δεν υπάρχει tokenizer εδώ· ο builder του corpus δίνει
# εύρος 2.0–2.5 χαρακτήρες/token για ελληνικά. Διαλέγουμε το 2.5 (το ΑΙΣΙΟΔΟΞΟ
# άκρο: λιγότερα tokens ανά χαρακτήρα) ΚΑΙ κρατάμε απόθεμα για την απάντηση· το
# πραγματικό νούμερο του corpus το δίνει μία δωρεάν κλήση `--count-tokens`.
GREEK_CHARS_PER_TOKEN = 2.5


def est_tokens(chars: int) -> int:
    return int(chars / GREEK_CHARS_PER_TOKEN)


DEFAULT_MODEL = "claude-opus-5-5"

# ── Ο ΕΠΙΛΟΓΕΑΣ OPUS (18/10/2026) ───────────────────────────────────────────
# Απόφανση ιδιοκτήτη, μετά το πρώτο λογαριασμό: ο board-director σε Opus (κρίνει
# παραπομπές σε συμβούλιο — σπάνιο και σύνθετο), οι τρεις συνθέτες/αναζητητές σε
# Sonnet, με ένα σήμα «OPUS» που ανάβει και σβήνει ανά agent. «Δεν χρειάζεται
# κάποιο μήνυμα παραπάνω, θα το κρατήσουμε απλό.»
#
# Η ΣΕΛΙΔΑ ΔΕΝ ΟΝΟΜΑΖΕΙ ΜΟΝΤΕΛΟ, ΚΑΙ ΑΥΤΟ ΕΙΝΑΙ ΤΟ ΣΗΜΕΙΟ. Στέλνει μόνο
# `opus: true|false`. Αν δεχόμασταν όνομα μοντέλου από τον browser, μια σελίδα —
# ή οποιοσδήποτε περάσει την Access — θα μπορούσε να ζητήσει ό,τι θέλει: το
# Fable είναι $10/$50 ανά MTok, δυόμισι φορές το Opus. Ο ιδιοκτήτης δεν πληρώνει
# ποτέ μοντέλο που δεν διάλεξε, και η λίστα έχει ΑΚΡΙΒΩΣ δύο εγγραφές.
MODELS = {"opus": "claude-opus-5-5", "sonnet": "claude-sonnet-5-5"}


def is_opus(model: str) -> bool:
    return str(model or "").startswith("claude-opus")


def pick_model(a: dict, req: dict) -> str:
    """Το μοντέλο αυτού του αιτήματος: η επιλογή της σελίδας, αλλιώς του agent."""
    want = req.get("opus")
    if want is None:
        return a["model"]
    return MODELS["opus"] if bool(want) else MODELS["sonnet"]
DEFAULT_EFFORT = "high"
DEFAULT_MAX_TOKENS = 16000
MAX_BODY_BYTES = 256 * 1024
ORIGIN_OK = re.compile(r"^http://(localhost|127\.0\.0\.1)(:\d+)?$")

# ════════════════════════════════════════════════════════════════════════════
# CLOUDFLARE ACCESS — Η ΠΥΛΗ ΟΤΑΝ Ο ΣΥΜΒΟΥΛΟΣ ΒΓΑΙΝΕΙ ΑΠΟ ΤΟ ΜΗΧΑΝΗΜΑ
# ════════════════════════════════════════════════════════════════════════════
# ΤΟ ΠΡΟΒΛΗΜΑ. Μέχρι σήμερα ο proxy δεν είχε ΚΑΜΙΑ αυθεντικοποίηση, και δεν
# χρειαζόταν: δενόταν στο loopback, άρα η μόνη διαδρομή προς αυτόν ήταν το
# πληκτρολόγιο του ιδιοκτήτη. Ο άνθρωπος ήταν δεδομένος ΑΠΟ ΤΗΝ ΑΡΧΙΤΕΚΤΟΝΙΚΗ.
# Μόλις μπει πίσω από tunnel, αυτή η εγγύηση παύει — και πίσω της κάθονται το
# κλειδί του API και ο φάκελος κρίσεων μαθητών.
#
# ΤΟ CORS ΔΕΝ ΕΙΝΑΙ ΦΥΛΑΚΑΣ: το επιβάλλει ο browser, όχι ο server· ένα curl το
# αγνοεί. Ούτε η Access από μόνη της αρκεί: ΜΙΑ λάθος σειρά στο ingress και η
# πόρτα είναι ορθάνοιχτη — το γράφει και ο οδηγός του ιδιοκτήτη. Γι' αυτό ο
# έλεγχος γίνεται ΕΔΩ, στον ίδιο τον proxy.
#
# Ο ΚΑΝΟΝΑΣ — ΤΟ ΠΡΟΘΕΜΑ ΛΕΕΙ ΑΠΟ ΠΟΥ ΗΡΘΕ. Ο κανόνας ingress στέλνει στον
# proxy ΜΟΝΟ ό,τι ταιριάζει στο /advisor-proxy/* · όλα τα άλλα πάνε στον server
# της εφαρμογής. Άρα ό,τι φτάνει ΜΕ το πρόθεμα ήρθε από το tunnel και απαιτεί
# έγκυρο JWT· ό,τι φτάνει ΧΩΡΙΣ αυτό ήρθε από το ίδιο το μηχάνημα, όπου ο
# proxy είναι ήδη δεμένος μόνο στο loopback. Ένας επιτιθέμενος δεν μπορεί να
# «βγάλει» το πρόθεμα: χωρίς αυτό ο κανόνας ingress δεν ταιριάζει καν.
#
# ΑΠΟΤΥΓΧΑΝΕΙ ΚΛΕΙΣΤΑ. Πρόθεμα χωρίς ρυθμισμένη Access → 503, όχι «πέρνα».
#
# ΔΥΟ ΜΕΤΑΒΛΗΤΕΣ ΠΕΡΙΒΑΛΛΟΝΤΟΣ, τις ορίζει ο ιδιοκτήτης, δεν περνούν ποτέ από
# εδώ και δεν τυπώνονται:
#     FDMS_ACCESS_TEAM   το όνομα του team (π.χ. «pelops») — ΟΧΙ μυστικό
#     FDMS_ACCESS_AUD    το AUD tag ΤΗΣ ΣΥΓΚΕΚΡΙΜΕΝΗΣ εφαρμογής Access
# Ο έλεγχος του `aud` είναι ο λόγος που ΑΛΛΗ εφαρμογή του ίδιου team δεν
# φτάνει εδώ με το δικό της token.
ACCESS_TEAM = os.environ.get("FDMS_ACCESS_TEAM", "").strip()
ACCESS_AUD = os.environ.get("FDMS_ACCESS_AUD", "").strip()
BASE_PATH = "/" + os.environ.get("FDMS_ADVISOR_BASE_PATH", "advisor-proxy").strip().strip("/")
ACCESS_SKEW_S = 60
ACCESS_JWKS_TTL_S = 3600
_JWKS: dict = {"at": 0.0, "keys": {}}
_JWKS_LOCK = threading.Lock()


def access_configured() -> bool:
    return bool(ACCESS_TEAM and ACCESS_AUD)


def access_issuer() -> str:
    return f"https://{ACCESS_TEAM}.cloudflareaccess.com"


def _b64u(seg: str) -> bytes:
    return base64.urlsafe_b64decode(seg + "=" * (-len(seg) % 4))


def _jwks(force: bool = False) -> dict:
    now = time.time()
    if not force:
        with _JWKS_LOCK:
            if _JWKS["keys"] and now - _JWKS["at"] < ACCESS_JWKS_TTL_S:
                return dict(_JWKS["keys"])
    import urllib.request
    url = f"{access_issuer()}/cdn-cgi/access/certs"
    with urllib.request.urlopen(url, timeout=10) as r:
        doc = json.loads(r.read().decode("utf-8"))
    keys = {k["kid"]: k for k in doc.get("keys", []) if k.get("kid")}
    with _JWKS_LOCK:
        _JWKS["keys"], _JWKS["at"] = keys, now
    return dict(keys)


def verify_access(token: str) -> dict:
    """Επιστρέφει τα claims ή πετά ValueError. Ποτέ «μισό ναι».

    Η υπογραφή ελέγχεται με τη βιβλιοθήκη `cryptography` — RSA PKCS#1 v1.5 με
    SHA-256, όπως ορίζει το RS256. ΔΕΝ γράφουμε δική μας κρυπτογραφία, και αν
    η βιβλιοθήκη λείπει το αίτημα ΑΠΟΡΡΙΠΤΕΤΑΙ: ένας έλεγχος που δεν μπορεί να
    τρέξει δεν είναι έλεγχος που πέρασε.
    """
    if not access_configured():
        raise ValueError("η Access δεν είναι ρυθμισμένη")
    parts = (token or "").split(".")
    if len(parts) != 3:
        raise ValueError("το token δεν έχει τρία μέρη")
    h_s, p_s, sig_s = parts
    try:
        head = json.loads(_b64u(h_s))
        claims = json.loads(_b64u(p_s))
        sig = _b64u(sig_s)
    except Exception as e:
        raise ValueError(f"το token δεν αποκωδικοποιείται ({type(e).__name__})")
    if head.get("alg") != "RS256":
        raise ValueError(f"μη αποδεκτό alg «{head.get('alg')}»")
    kid = head.get("kid")
    if not kid:
        raise ValueError("λείπει το kid")

    try:
        from cryptography.hazmat.primitives import hashes
        from cryptography.hazmat.primitives.asymmetric import padding, rsa
        from cryptography.exceptions import InvalidSignature
    except ImportError:
        raise ValueError("λείπει η βιβλιοθήκη `cryptography` — ο έλεγχος δεν μπορεί να τρέξει")

    keys = _jwks()
    jwk = keys.get(kid)
    if jwk is None:                       # περιστροφή κλειδιού: ένα refresh, όχι βρόχος
        jwk = _jwks(force=True).get(kid)
    if jwk is None:
        raise ValueError("άγνωστο kid — δεν ανήκει σε αυτό το team")

    n = int.from_bytes(_b64u(jwk["n"]), "big")
    e = int.from_bytes(_b64u(jwk["e"]), "big")
    pub = rsa.RSAPublicNumbers(e, n).public_key()
    try:
        pub.verify(sig, f"{h_s}.{p_s}".encode("ascii"), padding.PKCS1v15(), hashes.SHA256())
    except InvalidSignature:
        raise ValueError("η υπογραφή δεν επαληθεύεται")

    now = time.time()
    if str(claims.get("iss") or "") != access_issuer():
        raise ValueError("λάθος εκδότης")
    aud = claims.get("aud")
    aud = [aud] if isinstance(aud, str) else list(aud or [])
    if ACCESS_AUD not in aud:
        raise ValueError("το token δεν προορίζεται για αυτή την εφαρμογή")
    if float(claims.get("exp") or 0) < now - ACCESS_SKEW_S:
        raise ValueError("το token έχει λήξει")
    nbf = claims.get("nbf") or claims.get("iat")
    if nbf is not None and float(nbf) > now + ACCESS_SKEW_S:
        raise ValueError("το token δεν ισχύει ακόμη")
    return claims


# ── Η WHITELIST ΤΟΥ search_sources ───────────────────────────────────────────
# id → (διαδρομή, είναι φάκελος?, είναι ακατέργαστο PDF?, περιγραφή)
# ΜΟΝΟ αυτά. Ό,τι δεν αναλύεται ΜΕΣΑ σε μία από αυτές τις διαδρομές απορρίπτεται.
WHITELIST = {
    "context-full": (ROOT / "tools" / "advisor" / "context-full.md", False, False,
                     "όλο το ψηφιοποιημένο corpus (482 απαιτήσεις, επικυρωμένο)"),
    "3-01": (ROOT / "3-01_2025_ΔΑΕ.pdf", False, True,
             "ΒαΔ 3-01/2025 ΔΑΕ — ΑΚΑΤΕΡΓΑΣΤΟ κείμενο PDF"),
    "pd-29-2020": (ROOT / "fek_a_57_2020.pdf", False, True,
                   "ΠΔ 29/2020 (ΦΕΚ Α΄57) — ΑΚΑΤΕΡΓΑΣΤΟ κείμενο PDF"),
    "syllabus": (ROOT / "Phase_2_Syllabus_2025.pdf", False, True,
                 "Phase 2 Syllabus 2025 — ΑΚΑΤΕΡΓΑΣΤΟ κείμενο PDF"),
    # `descriptions` (18/10/2026, απόφανση ιδιοκτήτη): ο συνθέτης παρατηρήσεων
    # το χρειάζεται για να βρει ΠΟΙΟ ITEM. Όταν ο εκπαιδευτής δεν είναι σίγουρος
    # πού ταξινομείται μια παρατήρηση — και εκτός Προσαρμογής συμβαίνει συχνά —
    # κοιτάζει τι ΠΕΡΙΕΙΧΕ η έξοδος. Χωρίς αυτό, ο σύμβουλος μαντεύει item.
    "descriptions": (ROOT / "data" / "descriptions.json", False, False,
                     "η γραμματική των περιγραφών: τι περιέχει κάθε έξοδο ανά κατηγορία"),
    "criteria": (ROOT / "data" / "criteria", True, False, "κριτήρια ανά κατηγορία (JSON)"),
    "technique": (ROOT / "data" / "technique", True, False, "T-6A Techniques & Procedures (JSON)"),
    "mif": (ROOT / "data" / "mif", True, False, "πίνακες MIF (JSON)"),
    "requirements": (ROOT / "data" / "requirements", True, False, "απαιτήσεις, πίνακας ανοχής, δέντρα (JSON)"),
}
SEARCHABLE_SUFFIXES = {".json", ".md", ".txt"}

# ── ΤΑ ΕΡΓΑΛΕΙΑ ΠΟΥ ΥΠΑΡΧΟΥΝ — ό,τι άλλο γράψει το agent.md στο `tools:` αγνοείται ──
CASEFILE_TOOLS = ("casefile_find_student", "casefile_list_cases", "casefile_add_case", "casefile_update_case")
COMPOSER_TOOLS = ("description_template", "remarks_lookup")     # Q6/Q7: ανάγνωση της ΠΡΑΓΜΑΤΙΚΗΣ γραμματικής/τράπεζας
# search_sources και fetch_source είναι ΖΕΥΓΑΡΙ: όποιος agent έχει το πρώτο παίρνει
# και το δεύτερο (δες offered_tools) — αναζήτηση χωρίς ανάκτηση είναι η αρρώστια
# των κομμένων παραθεμάτων της 18/10/2026. Το front matter των agents δεν αλλάζει.
SEARCH_TOOLS = ("search_sources", "fetch_source")
KNOWN_TOOLS = SEARCH_TOOLS + CASEFILE_TOOLS + COMPOSER_TOOLS
OBS2_DIR = ROOT / "data" / "observations2"
DESC_JSON = ROOT / "data" / "descriptions.json"
CASE_KINDS = ("fail", "lag", "nfs_in", "nfs_out", "sms_in", "sms_out", "progress_check",
              "airsickness", "ground_exam", "oral_exam", "referral", "board", "note")
UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)
CASEFILE_TIMEOUT_S = 15
RAW_MARK = "ΑΚΑΤΕΡΓΑΣΤΟ ΚΕΙΜΕΝΟ ΠΗΓΗΣ (σελ. {page}) — ΔΕΝ έχει περάσει από επικύρωση"
PDF_TEXT_DIR = ROOT / "tools" / "advisor" / ".pdf-text"

CFG: dict = {}          # γεμίζει στη main() από defaults ← env ← flags
LOCK = threading.Lock()
CACHE_WATCH: dict = {}  # agent id → {"ts": epoch, "prefix": md5} της τελευταίας κλήσης


def log(msg: str) -> None:
    ts = dt.datetime.now().strftime("%H:%M:%S")
    sys.stderr.write(f"[{ts}] {msg}\n")
    sys.stderr.flush()


# ════════════════════════════════════════════════════════════════════════════
# AGENTS — agents/<id>/agent.md, διαβάζονται ΣΕ ΚΑΘΕ αίτημα (edit → re-ask)
# ════════════════════════════════════════════════════════════════════════════

def parse_front_matter(text: str) -> tuple[dict, str]:
    """Ελάχιστος YAML: `key: value`, `key: [a, b]`, και block lists `- x`.
    Χωρίς εξάρτηση — ο proxy έχει μία (anthropic) και αρκεί."""
    if not text.startswith("---"):
        return {}, text
    end = text.find("\n---", 3)
    if end < 0:
        return {}, text
    head, body = text[3:end], text[end + 4:].lstrip("\n")
    fm: dict = {}
    key = None
    for raw in head.splitlines():
        line = raw.rstrip()
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        m = re.match(r"^\s*-\s+(.*)$", line)
        if m and key is not None and isinstance(fm.get(key), list):
            fm[key].append(m.group(1).strip().strip("'\""))
            continue
        m = re.match(r"^([A-Za-z_][\w-]*)\s*:\s*(.*)$", line)
        if not m:
            continue
        key, val = m.group(1), m.group(2).strip()
        if val == "":
            fm[key] = []
        elif val.startswith("[") and val.endswith("]"):
            fm[key] = [v.strip().strip("'\"") for v in val[1:-1].split(",") if v.strip()]
        else:
            fm[key] = val.strip("'\"")
    return fm, body


def agents_dir() -> pathlib.Path:
    return pathlib.Path(CFG["agents_dir"])


def corpus_dir() -> pathlib.Path:
    return pathlib.Path(CFG["corpus_dir"])


def load_agent(agent_id: str) -> dict | None:
    if not re.fullmatch(r"[a-z0-9][a-z0-9_-]{0,63}", agent_id or ""):
        return None
    p = agents_dir() / agent_id / "agent.md"
    if not p.is_file():
        return None
    fm, body = parse_front_matter(p.read_text(encoding="utf-8"))
    corpus_name = pathlib.Path(str(fm.get("corpus") or "context-board.md")).name
    tools = fm.get("tools") or []
    if isinstance(tools, str):
        tools = [tools]
    # `casefile` στο agent.md = και τα τέσσερα· αλλιώς ονομαστικά, ένα-ένα.
    expanded: list[str] = []
    for t in tools:
        for name in (CASEFILE_TOOLS if t == "casefile" else (t,)):
            if name in KNOWN_TOOLS and name not in expanded:
                expanded.append(name)
    tools = expanded
    def _int(v, d):
        try:
            return int(v)
        except (TypeError, ValueError):
            return d
    return {
        "id": agent_id,
        "name": str(fm.get("name") or agent_id),
        "model": str(fm.get("model") or DEFAULT_MODEL),
        "effort": str(fm.get("effort") or DEFAULT_EFFORT),
        "corpus": corpus_name,
        "corpus_path": corpus_dir() / corpus_name,
        "max_turns": _int(fm.get("max_turns"), None),
        "max_tokens": _int(fm.get("max_tokens"), DEFAULT_MAX_TOKENS),
        "language": str(fm.get("language") or "el"),
        "tools": tools,
        "body": body.strip(),
    }


def casefile_configured() -> bool:
    return bool(os.environ.get("FDMS_CASEFILE_URL")) and bool(os.environ.get("FDMS_CASEFILE_KEY"))


def offered_tools(a: dict) -> list[str]:
    """Τι ΠΡΑΓΜΑΤΙ παίρνει το μοντέλο: ό,τι ζητά το agent.md, μείον τα casefile
    όταν λείπουν τα διαπιστευτήρια. Τίποτα σιωπηλό — το /health και το event
    `start` λένε τι προσφέρθηκε."""
    cf_ok = casefile_configured()
    out: list[str] = []
    for t in a["tools"]:
        if t in SEARCH_TOOLS:
            names = list(SEARCH_TOOLS)          # το ζευγάρι, πάντα μαζί
        elif t in COMPOSER_TOOLS or cf_ok:
            names = [t]
        else:
            continue
        out.extend(n for n in names if n not in out)
    return out


def list_agents() -> list[dict]:
    out = []
    d = agents_dir()
    if not d.is_dir():
        return out
    for sub in sorted(d.iterdir()):
        a = load_agent(sub.name) if sub.is_dir() else None
        if a:
            out.append(public_agent(a))
    return out


_CHARS_CACHE: dict = {}


def corpus_chars(a: dict) -> int | None:
    """Χαρακτήρες του corpus (όχι bytes — τα ελληνικά είναι 2 bytes/χαρ.), cached ανά mtime."""
    p = a["corpus_path"]
    if not p.is_file():
        return None
    key = (str(p), p.stat().st_mtime_ns)
    if key not in _CHARS_CACHE:
        _CHARS_CACHE.clear()
        _CHARS_CACHE[key] = len(p.read_text(encoding="utf-8"))
    return _CHARS_CACHE[key]


def public_agent(a: dict) -> dict:
    size = a["corpus_path"].stat().st_size if a["corpus_path"].is_file() else None
    chars = corpus_chars(a)
    return {
        "id": a["id"], "name": a["name"], "model": a["model"], "effort": a["effort"],
        "opus": is_opus(a["model"]), "models": MODELS,
        "corpus": a["corpus"], "corpus_bytes": size, "corpus_chars": chars,
        "corpus_tokens_est": est_tokens(chars + len(a["body"]) + 3000) if chars is not None else None,
        "max_tokens": a["max_tokens"],
        "corpus_ok": size is not None and size <= CFG["max_corpus_bytes"],
        "max_turns": effective_max_turns(a), "language": a["language"], "tools": a["tools"],
        "tools_offered": offered_tools(a),
    }


def effective_max_turns(a: dict) -> int:
    """Το φρένο μόνο ΣΦΙΓΓΕΙ: ο μικρότερος από το global όριο και το agent.md."""
    g = int(CFG["max_turns"])
    return min(g, a["max_turns"]) if a.get("max_turns") else g


# ════════════════════════════════════════════════════════════════════════════
# ΚΑΤΑΣΤΑΣΗ ΗΜΕΡΑΣ — φρένο 2, σε ένα μικρό αρχείο
# ════════════════════════════════════════════════════════════════════════════

def _state_path() -> pathlib.Path:
    return pathlib.Path(CFG["state_file"])


def read_state() -> dict:
    p = _state_path()
    today = dt.date.today().isoformat()
    try:
        s = json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        s = {}
    if s.get("day") != today:
        s = {"day": today, "count": 0,
             "usage": {"input_tokens": 0, "cache_creation_input_tokens": 0,
                       "cache_read_input_tokens": 0, "output_tokens": 0},
             "tool_calls": 0}
    return s


def write_state(s: dict) -> None:
    p = _state_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(".tmp")
    tmp.write_text(json.dumps(s, ensure_ascii=False, indent=1), encoding="utf-8")
    os.replace(tmp, p)


def take_daily_slot() -> tuple[bool, dict]:
    """Μετρά ΠΡΙΝ την κλήση — μια κλήση που απέτυχε στο δίκτυο μέτρησε κι αυτή.
    Συντηρητικό εσκεμμένα: το φρένο είναι για το χρήμα, όχι για τη στατιστική."""
    with LOCK:
        s = read_state()
        if s["count"] >= int(CFG["daily_cap"]):
            return False, s
        s["count"] += 1
        write_state(s)
        return True, s


def add_usage(u: dict, tool_calls: int) -> None:
    with LOCK:
        s = read_state()
        for k in s["usage"]:
            s["usage"][k] += int(u.get(k) or 0)
        s["tool_calls"] = int(s.get("tool_calls") or 0) + tool_calls
        write_state(s)


# ════════════════════════════════════════════════════════════════════════════
# ΤΟ ΑΙΤΗΜΑ — corpus → agent body (+ οδηγίες εργαλείου) → ιστορικό → ερώτηση
# ════════════════════════════════════════════════════════════════════════════

def read_corpus(a: dict) -> tuple[str | None, str | None]:
    """(κείμενο, σφάλμα). Φρένο 3: μέγεθος σε bytes ΠΡΙΝ διαβαστεί."""
    p = a["corpus_path"]
    if not p.is_file():
        return None, f"Το corpus «{a['corpus']}» δεν υπάρχει στο {corpus_dir()}. Τρέξε: python tools/build_advisor_context.py --all"
    size = p.stat().st_size
    cap = int(CFG["max_corpus_bytes"])
    if size > cap:
        return None, (f"Το corpus «{a['corpus']}» είναι {size:,} bytes — πάνω από το όριο "
                      f"{cap:,} (ADVISOR_MAX_CORPUS_BYTES). Άρνηση, για να μην τριπλασιαστεί "
                      f"σιωπηλά το κόστος. Αν το θέλεις πράγματι, ανέβασε το όριο ρητά.")
    return p.read_text(encoding="utf-8"), None


def tool_preamble() -> str:
    ids = "\n".join(f"  - `{k}` — {v[3]}" for k, v in WHITELIST.items())
    return (
        "# ΤΑ ΕΡΓΑΛΕΙΑ search_sources + fetch_source (τα προσθέτει ο proxy)\n\n"
        "Έχεις ένα εργαλείο αναζήτησης ΕΚΤΟΣ του corpus σου. Το corpus του system prompt "
        "είναι η **βάση και η πρώτη στάση** — από εκεί ξεκινάς πάντα, γιατί είναι το μόνο "
        "επικυρωμένο κείμενο. Η αναζήτηση είναι το **δεύτερο βήμα**, όχι παράπτωμα και όχι "
        "έσχατη λύση.\n\n"
        "**ΨΑΧΝΕΙΣ** όταν (α) σου το ζητήσει ο ιδιοκτήτης — ρητά («ψάξε», «βρες πού το "
        "λέει») ή έμμεσα («είσαι σίγουρος;», «διασταύρωσέ το»): η **διασταύρωση είναι "
        "λόγος να ψάξεις ακόμη κι αν έχεις ήδη απάντηση**, γιατί διασταύρωση σημαίνει να "
        "κοιτάξεις την πηγή, όχι να επαναλάβεις τον εαυτό σου· (β) το corpus σιωπά για "
        "κάτι που ρωτήθηκες· (γ) το corpus κρατά παραπομπή χωρίς το αυτολεξεί κείμενο· "
        "(δ) θέλεις να δεις το πρωτότυπο πριν πεις ότι δύο πηγές αντιφάσκουν.\n\n"
        "**ΔΕΝ ψάχνεις** από συνήθεια σε κάθε ερώτηση: όταν το corpus απαντά καθαρά και "
        "κανείς δεν ζήτησε διασταύρωση, απαντάς από το corpus. Αλλά **άρνηση να ψάξεις "
        "όταν σου ζητήθηκε είναι το βαρύτερο από τα δύο σφάλματα** (απόφανση ιδιοκτήτη "
        "18/10/2026). Στην απάντηση **λες ρητά** αν χρησιμοποίησες μόνο το corpus ή και "
        "αναζήτηση, και σε ποια πηγή.\n\n"
        f"Πηγές που δέχεται (παράμετρος `source`, ΜΟΝΟ αυτές):\n{ids}\n\n"
        "**ΔΥΟ ΕΡΓΑΛΕΙΑ, ΔΥΟ ΒΗΜΑΤΑ** (απόφανση ιδιοκτήτη 18/10/2026: *«να είναι τέλειοι οι "
        "σύμβουλοι, να μην τους λείπει καμία πληροφορία, να μην φαντάζονται»*). Το "
        "`search_sources` **ΒΡΙΣΚΕΙ**: γυρίζει αποσπάσματα κομμένα σε όριο πρότασης ή παραγράφου "
        "(ποτέ μέσα σε λέξη), με γραμμή που λέει πόσοι χαρακτήρες **παραλείπονται** πριν και μετά, "
        "και με μια **λαβή** σε κάθε εύρημα (π.χ. `context-full#fail-24`, `3-01#p54`, "
        "`data/criteria/contact.json#contact-36`). Το `fetch_source(λαβή)` **ΦΕΡΝΕΙ ΤΟ ΠΛΗΡΕΣ**: "
        "ολόκληρο το εδάφιο, το JSON αντικείμενο ή τη σελίδα PDF, αυτολεξεί και χωρίς αποκοπή. "
        "Η ελληνική κλίση δεν μετρά στην αναζήτηση («δοκιμή» βρίσκει και «δοκιμές»).\n\n"
        "**Ανακτάς το πλήρες** όταν: (α) πρόκειται να **παραθέσεις** — κάθε παράθεμα από αναζήτηση "
        "βγαίνει από `fetch_source`, όχι από το απόσπασμα· (β) το απόσπασμα είναι **κομμένο** (λέει "
        "«παραλείπονται N») και η απάντηση εξαρτάται από το υπόλοιπο· (γ) η απάντηση **κρίνει "
        "παραπομπή**, συνέπεια ή επιτρεπτό πτήσης. **Ποτέ δεν παραθέτεις κομμένο απόσπασμα σαν να "
        "ήταν ολόκληρο — αν θα το παραθέσεις, ανάκτησέ το.** Αν το `fetch_source` γυρίσει «ΜΕΡΟΣ "
        "k/N», δεν έχεις το όλο: πάρε τα υπόλοιπα μέρη με `part` ή πες ρητά ποιο μέρος διάβασες. "
        "Δεν ανακτάς ό,τι δεν θα χρησιμοποιήσεις.\n\n"
        "- Ό,τι επιστρέφει με τον χαρακτηρισμό «ΑΚΑΤΕΡΓΑΣΤΟ ΚΕΙΜΕΝΟ ΠΗΓΗΣ (σελ. N) — ΔΕΝ "
        "έχει περάσει από επικύρωση» είναι ωμή εξαγωγή από PDF: κολλάει λέξεις, κόβει "
        "γραμμές, και κανείς δεν το έλεγξε. **Μετέφερε τον χαρακτηρισμό αυτολεξεί** δίπλα "
        "σε κάθε τέτοιο παράθεμα και ΜΗΝ το παρουσιάσεις ως επικυρωμένο κείμενο. Τα "
        "ευρήματα από τα επιμελημένα αρχεία (data/*, context-full) δεν φέρουν χαρακτηρισμό "
        "γιατί είναι επικυρωμένα.\n"
        f"- Τα φρένα μένουν ακέραια: το πολύ **{CFG['tool_max_calls']}** αναζητήσεις, "
        f"**{CFG['fetch_max_calls']}** ανακτήσεις (έως {CFG['fetch_max_chars']:,} χαρ. η καθεμία — "
        f"ένα εδάφιο ολόκληρο, όχι ολόκληρο PDF) και **{CFG['tool_total_chars']:,}** χαρακτήρες "
        "κειμένου πηγών συνολικά ανά απάντηση. Μετά, απαντάς με όσα έχεις και λες ρητά ότι "
        "σταμάτησες. Είναι φρένα κόστους — δεν σου απαγορεύουν την πρώτη κλήση.\n"
        "- Μια πηγή εκτός λίστας επιστρέφει σφάλμα — και στην αναζήτηση και στην ανάκτηση· μην "
        "ξαναδοκιμάσεις με άλλη διαδρομή. Λαβή που δεν αναλύεται σημαίνει ότι άλλαξε το corpus: "
        "ξανατρέξε την αναζήτηση.\n"
        "- Ο κανόνας 5 (τίποτα από μνήμης) ισχύει και για ό,τι βρεις: παραθέτεις, δεν "
        "συμπεραίνεις αριθμό που δεν είναι τυπωμένος."
    )


def casefile_preamble(a: dict) -> str:
    return (
        "# Ο ΦΑΚΕΛΟΣ ΥΠΟΘΕΣΕΩΝ — τα εργαλεία casefile_* (τα προσθέτει ο proxy)\n\n"
        "Έχεις πρόσβαση στον φάκελο υποθέσεων του ιδιοκτήτη με ΠΡΑΓΜΑΤΙΚΟΥΣ μαθητές. "
        f"Κάθε ενέργειά σου καταγράφεται αυτόματα στο log με actor `agent:{a['id']}` — δεν "
        "το επιλέγεις εσύ και δεν μπορείς να το αλλάξεις.\n\n"
        "- **Διαβάζεις ελεύθερα** (`casefile_find_student`, `casefile_list_cases`) όταν η "
        "ερώτηση αφορά συγκεκριμένο μαθητή: βρες τον, δες τι έχει ήδη ο φάκελός του, και "
        "ΜΕΤΑ απάντησε — οι μετρητές του κανονισμού είναι ανά Στάδιο και ο φάκελος είναι "
        "η μόνη μνήμη που έχεις για το παρελθόν του.\n"
        "- **Γράφεις ΜΟΝΟ όταν ο ιδιοκτήτης σου το ζητά ρητά** («γράψ' το», «καταχώρισέ το», "
        "«μην κάνεις τίποτα — σημείωσέ το»). Ποτέ προληπτικά, ποτέ «για να υπάρχει». Αν "
        "δεν είσαι βέβαιος ότι το ζήτησε, ρώτα με μία πρόταση.\n"
        "- **Καμία εγγραφή δεν γίνεται από εσένα απευθείας.** Τα `casefile_add_case` / "
        "`casefile_update_case` ετοιμάζουν ΠΡΟΕΠΙΣΚΟΠΗΣΗ· ο ιδιοκτήτης πατά «Γράψ' το» στη "
        "σελίδα και τότε γράφεται. Στην απάντηση λες ότι η εγγραφή **περιμένει την "
        "επιβεβαίωσή του** και τι θα γραφτεί — ποτέ ότι «γράφτηκε», μέχρι να το δεις σε "
        "σύνοψη ή στον φάκελο.\n"
        "- **«Καμία ενέργεια» είναι πραγματική έκβαση και καταχωρίζεται**: μια υπόθεση με "
        "consequence «καμία ενέργεια» και τον ΛΟΓΟ στο note αξίζει περισσότερο από καθόλου "
        "γραμμή — τον επόμενο μήνα κανείς δεν θυμάται γιατί δεν έγινε τίποτα.\n"
        "- **Κάθε εγγραφή την αναφέρεις στην απάντηση**: τι έγραψες, για ποιον, με ποιο id, "
        "αυτολεξεί όπως σου το επέστρεψε το εργαλείο. Ο ιδιοκτήτης πρέπει να το βλέπει χωρίς "
        "να ανοίξει τη βάση.\n"
        "- Πρώτα `casefile_find_student`, μετά οποιαδήποτε εγγραφή: **ποτέ δεν επινοείς "
        "student_id**. Αν ο μαθητής δεν βρίσκεται, το λες — μαθητές προσθέτει ο ιδιοκτήτης, "
        "όχι εσύ.\n"
        "- **Διαγραφή δεν υπάρχει.** Το `withdraw` ανακαλεί μια γραμμή (το κείμενο επιζεί στο "
        "log). Το χρησιμοποιείς μόνο αν ο ιδιοκτήτης ζητήσει ρητά να ανακληθεί συγκεκριμένη "
        "υπόθεση.\n"
        "- Στο `cites` βάζεις τις παραπομπές που στηρίζουν τη συνέπεια, με τα ids του corpus "
        "(π.χ. fail-24) — ό,τι θα έγραφες και στην απάντηση.\n"
        "- Τα ονόματα είναι πραγματικά: τα χρησιμοποιείς όσο χρειάζεται για να ταυτοποιήσεις, "
        "όχι παραπάνω."
    )


def build_system(a: dict, corpus: str, tools: list[str] | None = None) -> list[dict]:
    ttl = CFG["cache_ttl"] if CFG["cache_ttl"] in ("5m", "1h") else "1h"
    cc = {"type": "ephemeral", "ttl": ttl}
    body = a["body"]
    tools = a["tools"] if tools is None else tools
    if "search_sources" in tools:
        body = body + "\n\n" + tool_preamble()
    if any(t in CASEFILE_TOOLS for t in tools):
        body = body + "\n\n" + casefile_preamble(a)
    # ΔΥΟ breakpoints: το corpus (σταθερό για μήνες) και το agent body (αλλάζει
    # όταν ο ιδιοκτήτης επιμελείται το prompt — τότε χάνεται ΜΟΝΟ το δεύτερο).
    return [
        {"type": "text", "text": corpus, "cache_control": cc},
        {"type": "text", "text": body, "cache_control": cc},
    ]


def normalise_messages(raw, student: str) -> tuple[list[dict] | None, str | None]:
    """Μόνο κείμενο, εναλλάξ user/assistant, αρχίζει και τελειώνει με user.
    Το `student` (ό,τι ΠΛΗΚΤΡΟΛΟΓΗΣΕ ο ιδιοκτήτης ως πλαίσιο) μπαίνει ΜΠΡΟΣΤΑ
    στο ΠΡΩΤΟ user μήνυμα — ντετερμινιστικά, ώστε κάθε γύρος να αναπαράγει
    byte-ίδιο πρόθεμα και το ιστορικό να μένει στο cache."""
    if not isinstance(raw, list) or not raw:
        return None, "Το `messages` πρέπει να είναι μη κενή λίστα."
    out = []
    for i, m in enumerate(raw):
        if not isinstance(m, dict):
            return None, f"messages[{i}] δεν είναι αντικείμενο."
        role, content = m.get("role"), m.get("content")
        if role not in ("user", "assistant"):
            return None, f"messages[{i}].role πρέπει να είναι user ή assistant."
        if not isinstance(content, str) or not content.strip():
            return None, f"messages[{i}].content πρέπει να είναι μη κενό κείμενο."
        expected = "user" if i % 2 == 0 else "assistant"
        if role != expected:
            return None, f"messages[{i}]: περίμενα {expected}, ήρθε {role} (εναλλάξ, αρχή με user)."
        out.append({"role": role, "content": content.strip()})
    if out[-1]["role"] != "user":
        return None, "Το τελευταίο μήνυμα πρέπει να είναι του χρήστη."
    if student:
        out[0]["content"] = ("[ΠΛΑΙΣΙΟ ΠΕΡΙΠΤΩΣΗΣ — όπως το έγραψε ο ιδιοκτήτης]\n"
                             + student.strip() + "\n\n" + out[0]["content"])
    # Τρίτο breakpoint: στο τελευταίο user μήνυμα, ώστε ΟΛΟ το ιστορικό μέχρι
    # εδώ να διαβάζεται από το cache στον επόμενο γύρο.
    last = out[-1]
    out[-1] = {"role": "user", "content": [{"type": "text", "text": last["content"],
                                            "cache_control": {"type": "ephemeral"}}]}
    return out, None


def user_turns(messages: list) -> int:
    return sum(1 for m in messages if isinstance(m, dict) and m.get("role") == "user")


def prefix_digest(system: list[dict]) -> str:
    return hashlib.md5("\x00".join(b["text"] for b in system).encode("utf-8")).hexdigest()


# ════════════════════════════════════════════════════════════════════════════
# search_sources + fetch_source — Η ΑΝΑΖΗΤΗΣΗ ΒΡΙΣΚΕΙ, Η ΑΝΑΚΤΗΣΗ ΦΕΡΝΕΙ ΤΟ ΠΛΗΡΕΣ
# ════════════════════════════════════════════════════════════════════════════
# ΤΟ ΠΕΡΙΣΤΑΤΙΚΟ (18/10/2026). Η παλιά _snippet() έκοβε παράθυρο 900 χαρακτήρων
# ΤΥΦΛΑ, σε θέση χαρακτήρα — στη μέση λέξης, και στις δύο άκρες. Μετρημένο σε
# πραγματική ερώτηση: 25 ευρήματα, 5.715 χαρακτήρες, κανένα ολόκληρο. Και αυτό
# στη διαδρομή του ωμού PDF, όπου ο agent έχει ρητή εντολή «παράθεσε ΑΥΤΟΛΕΞΕΙ,
# σήμανε ΑΚΑΤΕΡΓΑΣΤΟ». Παράθεμα κομμένο στη μέση λέξης δεν είναι αυτολεξεί. Την
# ίδια μέρα ξεριζώθηκε η ίδια αρρώστια ([:600]) από τον builder του corpus· αυτή
# ήταν η ίδια, σε άλλο όργανο.
#
# Η ΑΠΟΦΑΝΣΗ: «να είναι τέλειοι οι σύμβουλοι, να μην τους λείπει καμία πληροφορία,
# να μην φαντάζονται» — «όσα token απαιτούνται για να μην χάνουμε πληροφορίες».
# Άρα ΟΧΙ μεγαλύτερο παράθυρο (ίδια αρρώστια, άλλη δόση), αλλά ΔΥΟ ΕΡΓΑΛΕΙΑ:
#   search_sources  ΒΡΙΣΚΕΙ. Αποσπάσματα κομμένα ΜΟΝΟ σε όριο παραγράφου / πρότασης /
#                   γραμμής — ποτέ μέσα σε λέξη — που λένε πόσοι χαρακτήρες
#                   παραλείπονται πριν και μετά, και φέρουν ΛΑΒΗ.
#   fetch_source    ΦΕΡΝΕΙ ΤΟ ΠΛΗΡΕΣ. Δέχεται τη λαβή και επιστρέφει ΟΛΟΚΛΗΡΗ τη
#                   μονάδα — το εδάφιο «### [id]», το JSON αντικείμενο, τη σελίδα
#                   PDF — χωρίς αποκοπή. Πάνω από fetch_max_chars επιστρέφει
#                   ΑΡΙΘΜΗΜΕΝΟ ΜΕΡΟΣ k/N και το λέει· ποτέ σιωπηλή κοπή.
# Η WHITELIST, ο έλεγχος διαδρομής (resolve_source) και η σήμανση ΑΚΑΤΕΡΓΑΣΤΟ
# ισχύουν ακέραια ΚΑΙ στα δύο: ό,τι δεν είναι στη λίστα δεν υπάρχει ούτε για ανάκτηση.
#
# Η ΛΑΒΗ:  <πηγή>#<εντοπιστής>
#   <πηγή>        id της WHITELIST (context-full, 3-01, criteria, …) ή διαδρομή
#                 αρχείου ΜΕΣΑ σε φάκελο της λίστας (data/criteria/contact.json).
#                 Αναλύεται από το ΙΔΙΟ resolve_source() με την αναζήτηση.
#   <εντοπιστής>  pN | pN-M      σελίδα/σελίδες PDF (μόνο στις ωμές πηγές, έως
#                                FETCH_MAX_PAGES σελίδες τη φορά)
#                 <id>           το id του εδαφίου «### [id]» στο corpus, ή το
#                                "id" / "section" / "table_id" ενός JSON αντικειμένου
#                 h:<12 hex>     sha1 του κειμένου της μονάδας (λευκό διάστημα
#                                ενοποιημένο) — για μονάδες χωρίς id ή με id που
#                                επαναλαμβάνεται μέσα στο ίδιο αρχείο
#   ΓΙΑΤΙ ΕΤΣΙ. Το id είναι ΣΤΑΘΕΡΟ (ίδια λαβή → ίδιο εδάφιο) και ΑΝΘΕΚΤΙΚΟ: ο
#   builder ξαναγράφει το corpus, τα ids μένουν (482/482 μοναδικά στο context-full)·
#   ένας αριθμός γραμμής ή δείκτης μπλοκ θα έσπαγε στην πρώτη εισαγωγή. Το hash
#   είναι ανθεκτικό σε αναδιάταξη και εισαγωγή και σπάει ΜΟΝΟ αν αλλάξει το ίδιο
#   το κείμενο της μονάδας — τότε η παλιά λαβή ΠΡΕΠΕΙ να αποτύχει ρητά («ξανατρέξε
#   την αναζήτηση»), όχι να γυρίσει σιωπηλά άλλο κείμενο. Η σελίδα είναι η φυσική
#   μονάδα της ωμής εξαγωγής PDF: ο χαρακτηρισμός ΑΚΑΤΕΡΓΑΣΤΟ ήδη λέει «σελ. N».
#
# ΤΑ ΟΡΙΑ ΚΑΙ ΤΟ ΣΚΕΠΤΙΚΟ ΤΟΥΣ (μετρημένα στο corpus της 18/10/2026):
#   search_excerpt_chars 700     το απόσπασμα ΒΡΙΣΚΕΙ· το πλήρες είναι μία κλήση
#                                μακριά, άρα δεν χρειάζεται να είναι μεγάλο — αρκεί
#                                να κόβει καθαρά και να λέει τι έμεινε απ' έξω.
#   tool_max_chars       8000    ανά κλήση αναζήτησης: 8 ευρήματα × (700 απόσπασμα
#                                + ~200 κεφαλίδα/λαβή) + κεφαλή ≈ 7.600 — τα 6.000
#                                θα έκοβαν ευρήματα στην προεπιλογή.
#   fetch_max_chars      12000   ανά ανάκτηση: το μεγαλύτερο εδάφιο του corpus είναι
#                                11.564 χαρ. (board [fail-85]), η μεγαλύτερη σελίδα
#                                PDF 4.743 (3-01) — ένα εδάφιο ή 2 σελίδες χωρούν
#                                ΟΛΟΚΛΗΡΑ· ολόκληρο PDF (253 σελ. ≈ 430.000) όχι.
#                                Πάνω από το όριο: μέρη k/N σε όριο παραγράφου.
#   fetch_max_calls      8       ανά απάντηση: μια τεκμηριωμένη απάντηση παραθέτει
#                                2-4 εδάφια· τα 8 αφήνουν χώρο για 2 σελίδες PDF,
#                                3 εδάφια και 2-3 διασταυρώσεις.
#   tool_max_calls       20      ΑΠΟΦΑΝΣΗ ΙΔΙΟΚΤΗΤΗ 20/10/2026 (ήταν 5). Το 5
#                                χτυπούσε αληθινά: στη συνεδρία της F4404 ο
#                                σύμβουλος το εξάντλησε πριν φτάσει στον MIF και
#                                ο επιθυμητός κώδικας έμεινε ΚΕΝΟΣ. Η σειρά που
#                                χρειάζεται μια κατάταξη είναι τεσσάρων σταθμών
#                                (syllabus → descriptions → criteria → mif) και
#                                καμία τους δεν πετυχαίνει με την πρώτη.
#   tool_total_chars     120000  ανά απάντηση, ΟΛΑ τα εργαλεία: ανέβηκε ΜΑΖΙ με
#                                τους γύρους, αλλιώς οι 20 κλήσεις θα χτυπούσαν
#                                τον τοίχο των χαρακτήρων στην 8η. 120.000 χαρ. ≈
#                                48.000 tokens — ΑΥΤΟ είναι πλέον το πραγματικό
#                                φρένο, όχι ο αριθμός των ματιών, και είναι το
#                                σωστό μέτρο: μετράει πόσο ΚΕΙΜΕΝΟ μπήκε, όχι
#                                πόσες φορές κοίταξε. Πέρα από αυτό: ρητό μήνυμα,
#                                όχι σιωπηλή κοπή.
#   Το ημερήσιο όριο (200) και οι γύροι ΣΥΖΗΤΗΣΗΣ (20) ΔΕΝ αλλάζουν.

FETCH_MAX_PAGES = 3          # σελίδες PDF ανά ανάκτηση (pN-M): ένα εδάφιο που
                             # περνά σε επόμενη σελίδα, όχι ξεφύλλισμα κεφαλαίου


def _fold(s: str) -> str:
    """Πεζά, χωρίς τόνους, τελικό σ ενοποιημένο — ώστε «ΚΕΠΕ», «Κέπε» και
    «κεπε» να είναι το ίδιο, και «μαθητής» να πιάνει «ΜΑΘΗΤΗΣ». ΑΛΛΑΖΕΙ ΜΗΚΟΣ
    (NFD + αφαίρεση τόνων) — για ερωτήματα και σύγκριση, ΟΧΙ για θέσεις."""
    s = unicodedata.normalize("NFD", s or "")
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    return s.lower().replace("ς", "σ")


# ── ΑΝΑΔΙΠΛΩΣΗ ΠΟΥ ΔΙΑΤΗΡΕΙ ΤΙΣ ΘΕΣΕΙΣ ─────────────────────────────────────
# Η παλιά _snippet έβρισκε τη θέση του όρου στο ΑΝΑΔΙΠΛΩΜΕΝΟ κείμενο και έκοβε
# το ΠΡΩΤΟΤΥΠΟ με αυτή — σωστό μόνο επειδή τα ελληνικά NFC αναδιπλώνονται
# χαρακτήρα-προς-χαρακτήρα. Ο πίνακας αντικατάστασης κρατά το μήκος ΑΚΡΙΒΩΣ
# (ένας κωδικός → ένας κωδικός), ώστε κάθε θέση στο αναδιπλωμένο να είναι θέση
# στο πρωτότυπο — και το όριο που διαλέγουμε να είναι όριο στο κείμενο που
# επιστρέφουμε. Τα κείμενα κανονικοποιούνται σε NFC στην ανάγνωση.
def _build_fold_table() -> dict:
    """Όλο το BMP (εκτός surrogates), μία φορά στην εκκίνηση (~0,1 s): και το «≠»
    (→ «=» κατά NFD) πρέπει να αναδιπλώνεται όπως στην _fold, αλλιώς οι δύο
    συναρτήσεις διαφωνούν σε ένα σύμβολο και η απόδειξη ισότητας πέφτει."""
    tbl: dict = {}
    for cp in range(0x20, 0x10000):
        if 0xD800 <= cp <= 0xDFFF:
            continue
        ch = chr(cp)
        d = unicodedata.normalize("NFD", ch)
        base = next((c for c in d if not unicodedata.combining(c)), ch)
        low = base.lower()
        if len(low) != 1:
            low = base if len(base) == 1 else ch
        if low == "ς":
            low = "σ"
        if low != ch:
            tbl[cp] = low
    return tbl


_FOLD_TABLE = _build_fold_table()


def _fold_aligned(s: str) -> str:
    """Ίδιο αποτέλεσμα με τη _fold() για NFC κείμενο, ΙΔΙΟ ΜΗΚΟΣ με την είσοδο."""
    return s.translate(_FOLD_TABLE)


# ── ΟΜΟΓΛΥΦΑ: ΤΟ ΙΔΙΟ ΣΧΗΜΑ, ΔΥΟ ΑΛΦΑΒΗΤΑ (20/10/2026) ──────────────────────
# Το εύρημα είναι του ΙΔΙΟΥ ΤΟΥ ΣΥΜΒΟΥΛΟΥ, στη συνεδρία της F4404: «*Το PDF
# γράφει F44ΧΧ με ελληνικά Χ, και η αναζήτηση με λατινικά δεν το έβρισκε.*»
# Ο κωδικός φαίνεται ίδιος στην οθόνη και είναι ΑΛΛΟΣ στη μνήμη.
#
# ΓΙΑΤΙ ΟΧΙ ΜΕΣΑ ΣΤΗΝ _fold. Η αναδίπλωση είναι χαρακτήρα-προς-χαρακτήρα και
# ΑΓΝΟΕΙ ΤΑ ΣΥΜΦΡΑΖΟΜΕΝΑ: αν γινόταν εκεί, κάθε «ο» του κειμένου θα γινόταν
# «o» και το αγγλικό «to» θα χτυπούσε πάνω σε κάθε ελληνικό «το» του
# κανονισμού. Σε κανονισμό η ΑΚΡΙΒΕΙΑ νικά την ανάκληση — απόφανση 18/10.
#
# ΠΟΥ ΓΙΝΕΤΑΙ. ΜΟΝΟ σε όρους που έχουν ΨΗΦΙΟ, δηλαδή σε κωδικούς (F44ΧΧ,
# I4301, C4790). Η πεζή γραφή δεν βλάπτει: στο αναδιπλωμένο κείμενο το
# ελληνικό Χ είναι ήδη «χ» και το λατινικό X «x» — το ζεύγος ζει εκεί.
_HOMO_GR2LA = {"α": "a", "β": "b", "ε": "e", "ζ": "z", "η": "h", "ι": "i",
               "κ": "k", "μ": "m", "ν": "n", "ο": "o", "ρ": "p", "τ": "t",
               "υ": "y", "χ": "x"}
_HOMO_LA2GR = {v: k for k, v in _HOMO_GR2LA.items()}


def _homoglyph_twins(t: str) -> list[str]:
    """Οι γραφές του ΙΔΙΟΥ κωδικού στο άλλο αλφάβητο. Κενή λίστα για πεζά."""
    if not any(c.isdigit() for c in t):
        return []
    out = []
    for table in (_HOMO_GR2LA, _HOMO_LA2GR):
        alt = "".join(table.get(c, c) for c in t)
        if alt != t and alt not in out:
            out.append(alt)
    return out


def _terms(q: str) -> list[str]:
    toks = re.split(r"[\s,.;:·«»\"'()\[\]{}!?/\\|]+", _fold(q))
    seen, out = set(), []
    for t in toks:
        if len(t) >= 2 and t not in seen:
            seen.add(t)
            out.append(t)
            # Ο δίδυμος μπαίνει ΩΣ ΟΡΟΣ, όχι ως εναλλακτική: το φίλτρο είναι
            # «βρέθηκε έστω ένας» (sc > 0), άρα δεν αποκλείει τίποτα· και όταν
            # μια μονάδα έχει ΚΑΙ ΤΙΣ ΔΥΟ γραφές, ανεβαίνει — σωστά.
            for alt in _homoglyph_twins(t):
                if alt not in seen:
                    seen.add(alt)
                    out.append(alt)
    return out


# ── Η ΚΛΙΣΗ (18/10/2026) ────────────────────────────────────────────────────
# Η _fold ισοπεδώνει τόνους και τελικό σίγμα — σωστά. Αλλά η σύγκριση ήταν σκέτο
# substring: «δοκιμη» ΕΙΝΑΙ μέσα στο «δοκιμησ» αλλά ΟΧΙ μέσα στο «δοκιμεσ», άρα
# το ερώτημα «Δοκιμή Προόδου» ΕΧΑΝΕ τις «Δοκιμές Προόδου». Διόρθωση με απλά μέσα,
# χωρίς βιβλιοθήκη και χωρίς μοντέλο: κοπή ΜΟΝΟ της κλιτικής κατάληξης (όχι της
# παραγωγικής — «αξιολόγ-ηση» μένει «αξιολογησ», δεν γίνεται «αξιολογ» που θα
# έπιανε και τον «αξιολογητή»), και ταίριασμα όρου με λέξη όταν οι δύο ρίζες
# είναι ΙΣΕΣ. Το substring παραμένει ως δεύτερος δρόμος, άρα τίποτα που βρισκόταν
# δεν χάνεται· προστίθενται μόνο λέξεις με την ίδια ρίζα.
#   ΓΙΑΤΙ ΜΟΝΟ ΑΥΤΕΣ ΟΙ ΚΑΤΑΛΗΞΕΙΣ: κόβονται οι ελάχιστες ώστε όλες οι πτώσεις
#   ενός ονόματος να δίνουν την ΙΔΙΑ ρίζα — πτήση/πτήσης/πτήσεις/πτήσεων → πτησ,
#   στάδιο/σταδίου/στάδια/σταδίων → σταδι, βαθμός/βαθμού/βαθμοί/βαθμούς → βαθμ.
#   ΔΕΝ κόβονται -ιο/-ια ολόκληρα (θα έκαναν «συμβούλιο» = «σύμβουλος»), ούτε
#   -ι/-ε/-υ (ουδέτερα σε -ι σπάνια εδώ, το ΚΕΠΕ ακρωνύμιο). Ελάχιστη ρίζα 4
#   χαρακτήρες: «μόνος» ΔΕΝ γίνεται «μον» (θα έπιανε το επίρρημα «μόνο»), «ώρες»
#   δεν γίνεται «ωρ». Ρήματα δεν αντιμετωπίζονται — τα κρατά το substring.
#   ΑΚΡΙΒΕΙΑ: σε κανονισμό το άσχετο εύρημα είναι χειρότερο από το κανένα· η
#   ισότητα ριζών (όχι πρόθεμα) είναι ο λόγος που «αξιολόγηση» δεν φέρνει τον
#   «αξιολογητή» και «συμβούλιο» δεν φέρνει τον «σύμβουλο». Μετρήθηκε πριν/μετά
#   (18/10/2026, 17 ερωτήματα × 3 πηγές): «Δοκιμή Προόδου» 48 → 58 εδάφια στο
#   context-full (+δοκιμών, +δοκιμές), «επαναλήψεις» 16 → 54, «μαθητής» 161 → 261·
#   κάθε λέξη που πρόσθεσε η ρίζα καταγράφηκε ονομαστικά και καμία δεν ήταν άλλη
#   λέξη· 16 ζεύγη που ΔΕΝ πρέπει να ταυτίζονται δεν ταυτίστηκαν.
#   ΤΟ ΟΜΟΓΡΑΦΟ ΠΟΥ ΒΓΗΚΕ ΣΤΗ ΜΕΤΡΗΣΗ: «δοκιμ-ή» (η εξέταση) και «δόκιμ-ος» (ο
#   δόκιμος αρχηγός σχηματισμού, οι δόκιμοι ΣΜΥΑ στο 3-01) έχουν ΙΔΙΑ ρίζα
#   «δοκιμ» αφού οι τόνοι έχουν ισοπεδωθεί (και δεν μπορούν να κρατηθούν: τα
#   κεφαλαία «ΔΟΚΙΜΗ ΠΡΟΟΔΟΥ» του κανονισμού δεν έχουν τόνους). Λύση: η κατάληξη
#   του ΟΡΟΥ ορίζει το κλιτικό παράδειγμα και άρα ποιες καταλήξεις ΛΕΞΕΩΝ δέχεται
#   — θηλυκό σε -η δέχεται -η/-ης/-ες/-ων/-εις/-εων, ΟΧΙ -ος/-ου/-ο/-οι/-ους. Το
#   -ων (γενική πληθυντικού) είναι κοινό σε όλα και μένει κοινό. Όρος χωρίς
#   κλιτική κατάληξη (ΚΕΠΕ, μόνος, ώρες, αγγλικά) δεν παίρνει ρίζα — substring μόνο.
_WORD_RE = re.compile(r"[a-zα-ω0-9]+")
_GREEK_WORD_RE = re.compile(r"[α-ω]+")
_STEM_ENDINGS = ("εων", "εισ", "ουσ", "οι", "ων", "ου", "ησ", "εσ", "ασ", "οσ", "υσ", "η", "α", "ο")
_STEM_MIN = 4
_FEM_H = frozenset({"", "η", "ησ", "εσ", "ων", "εισ", "εων"})          # πτήση/πτήσεις, δοκιμή/δοκιμές, μαθητής/μαθητές
_FEM_A = frozenset({"", "α", "ασ", "εσ", "ων", "ο", "ου"})             # αποτυχία/αποτυχίες · στάδια (ουδ. πληθ.) → στάδιο
_MASC_O = frozenset({"", "οσ", "ου", "ο", "οι", "ων", "ουσ", "α"})     # βαθμός/βαθμούς · στάδιο/στάδια
_ANY_END = _FEM_H | _FEM_A | _MASC_O
_PARADIGM = {"η": _FEM_H, "ησ": _FEM_H, "εισ": _FEM_H, "εων": _FEM_H,
             "εσ": _FEM_H | frozenset({"α", "ασ"}),
             "α": _FEM_A, "ασ": _FEM_A,
             "ο": _MASC_O, "ου": _MASC_O, "οσ": _MASC_O, "οι": _MASC_O, "ουσ": _MASC_O,
             "ων": _ANY_END, "υσ": _ANY_END}


def _stem_split(w: str) -> tuple[str, str]:
    """(ρίζα, κατάληξη) μιας ΑΝΑΔΙΠΛΩΜΕΝΗΣ λέξης: μόνο ελληνικές, μόνο κλιτική
    κατάληξη, ποτέ ρίζα κάτω από _STEM_MIN χαρακτήρες. Ό,τι δεν κόβεται: (w, "")."""
    if len(w) <= _STEM_MIN or not _GREEK_WORD_RE.fullmatch(w):
        return w, ""
    for e in _STEM_ENDINGS:
        if w.endswith(e) and len(w) - len(e) >= _STEM_MIN:
            return w[:-len(e)], e
    return w, ""


def _stem(w: str) -> str:
    return _stem_split(w)[0]


def _term_stems(terms: list[str]) -> list[tuple[str, str, frozenset | None]]:
    """(όρος, ρίζα, αποδεκτές καταλήξεις λέξεων) — None όταν ο όρος δεν έχει
    κλιτική κατάληξη, οπότε μετρά μόνο το substring."""
    out = []
    for t in terms:
        s, e = _stem_split(t)
        out.append((t, s, _PARADIGM.get(e) if e else None))
    return out


def _stem_hit(u: dict, s: str, allowed: frozenset | None) -> bool:
    forms = u["stemforms"].get(s)
    return bool(allowed and forms and (allowed & forms))


def _score_unit(u: dict, tstems: list, stems: bool = True) -> int:
    """Πόσοι ΔΙΑΦΟΡΕΤΙΚΟΙ όροι του ερωτήματος βρίσκονται στη μονάδα: substring
    (όπως πάντα) Ή ίδια ρίζα με λέξη της, σε συμβατή κατάληξη (η κλίση).
    stems=False = η παλιά συμπεριφορά, για τη μέτρηση πριν/μετά."""
    f = u["folded"]
    return sum(1 for t, s, al in tstems if t in f or (stems and _stem_hit(u, s, al)))


def _rank_key(u: dict, tstems: list) -> tuple[int, int]:
    """Δευτερεύοντα κριτήρια ΜΕΤΑΞΥ ισόπαλων ευρημάτων (ίδιο πλήθος όρων). Το
    «Δοκιμή Προόδου» δίνει 90 ευρήματα 2/2 στο context-full και το μοντέλο βλέπει
    8: πριν, η σειρά ήταν αλφαβητική στο «γρ.N» — δηλαδή τυχαία. Τώρα πρώτα όσα
    έχουν τους όρους ως ΣΥΝΕΧΟΜΕΝΗ ΦΡΑΣΗ (με ρίζες, άρα και «Δοκιμές Προόδου»),
    μετά όσα τους αναφέρουν ΠΕΡΙΣΣΟΤΕΡΕΣ φορές. Δεν αλλάζει ΠΟΙΑ ευρήματα
    ταιριάζουν — μόνο ποια από τα ισόπαλα φαίνονται πρώτα."""
    seq = u["stemseq"]
    want = tuple(s for _, s, _ in tstems)
    phrase = 0
    if len(want) >= 2:
        first = want[0]
        for i, w in enumerate(seq):
            if w == first and seq[i:i + len(want)] == want:
                phrase = 1
                break
    occ = 0
    for t, s, al in tstems:
        occ += u["stemcount"].get(s, 0) if _stem_hit(u, s, al) else u["folded"].count(t)
    return (-phrase, -occ)


class PathRefused(Exception):
    pass


def resolve_source(source: str) -> tuple[str, pathlib.Path, bool, bool]:
    """(id, διαδρομή, είναι φάκελος, είναι ακατέργαστο). Δέχεται id ΤΗΣ λίστας ή
    διαδρομή που αναλύεται ΜΕΣΑ σε καταχώριση της λίστας. Οτιδήποτε άλλο:
    PathRefused — επιστρέφεται στο μοντέλο ως tool error."""
    source = (source or "").strip()
    if source in WHITELIST:
        p, is_dir, raw, _ = WHITELIST[source]
        return source, p.resolve(), is_dir, raw
    try:
        cand = pathlib.Path(source)
        if not cand.is_absolute():
            cand = ROOT / cand
        rp = cand.resolve()
    except Exception:
        raise PathRefused(f"Μη αναγνώσιμη διαδρομή: {source!r}")
    for sid, (p, is_dir, raw, _) in WHITELIST.items():
        wp = p.resolve()
        if rp == wp:
            return sid, rp, is_dir, raw
        if is_dir and rp != wp and wp in rp.parents:
            if rp.suffix.lower() in SEARCHABLE_SUFFIXES or rp.is_dir():
                return sid, rp, rp.is_dir(), raw
    raise PathRefused(
        f"ΕΚΤΟΣ ΟΡΙΩΝ: «{source}» δεν είναι στη λίστα επιτρεπόμενων πηγών. "
        f"Επιτρέπονται ΜΟΝΟ: {', '.join(WHITELIST)}. Μην ξαναδοκιμάσεις με άλλη διαδρομή."
    )


def pdf_pages(p: pathlib.Path) -> list[str] | None:
    """Το κείμενο ανά σελίδα, εξαγόμενο ΜΙΑ φορά και αποθηκευμένο δίπλα στο
    corpus (gitignored). PyMuPDF πρώτα, pypdf δεύτερο, αλλιώς None (η πηγή
    δηλώνεται μη διαθέσιμη, ο proxy δεν πέφτει)."""
    PDF_TEXT_DIR.mkdir(parents=True, exist_ok=True)
    cache = PDF_TEXT_DIR / (p.stem + ".json")
    try:
        c = json.loads(cache.read_text(encoding="utf-8"))
        if c.get("size") == p.stat().st_size and c.get("mtime") == int(p.stat().st_mtime):
            return c["pages"]
    except Exception:
        pass
    pages: list[str] | None = None
    try:
        import fitz  # PyMuPDF
        doc = fitz.open(str(p))
        pages = [pg.get_text() for pg in doc]
    except Exception:
        try:
            import pypdf
            r = pypdf.PdfReader(str(p))
            pages = [(pg.extract_text() or "") for pg in r.pages]
        except Exception:
            return None
    cache.write_text(json.dumps({"size": p.stat().st_size, "mtime": int(p.stat().st_mtime),
                                 "pages": pages}, ensure_ascii=False), encoding="utf-8")
    return pages


# ── ΟΙ ΜΟΝΑΔΕΣ — ό,τι βρίσκει η αναζήτηση και ό,τι φέρνει ΟΛΟΚΛΗΡΟ η ανάκτηση ──
# Κάθε μονάδα: {"loc": εντοπιστής της λαβής, "where": θέση για άνθρωπο,
# "text": το ΠΛΗΡΕΣ κείμενο (αυτό επιστρέφει το fetch), "stext": το κείμενο
# ΑΝΑΖΗΤΗΣΗΣ (ίδιο με text, εκτός JSON: τα ένθετα αντικείμενα-με-id γίνονται
# «→ id» γιατί έχουν δικές τους μονάδες — αλλιώς μητέρα και παιδί θα βγαίνουν
# διπλά ευρήματα), "folded": το stext αναδιπλωμένο ΜΕ ΙΔΙΟ ΜΗΚΟΣ, "stems": οι
# ρίζες των λέξεων του, "page": αριθμός σελίδας (PDF) ή None}.
#   .md/.txt  μονάδα = μπλοκ χωρισμένο με κενή γραμμή. Στο corpus κάθε απαίτηση
#             είναι ΕΝΑ τέτοιο μπλοκ (μετρήθηκε: τα 63 μπλοκ χωρίς «### [id]» του
#             board είναι επικεφαλίδες και προοίμιο, όχι συνέχειες εδαφίων).
#   .json     μονάδα = αντικείμενο με "id"/"section"/"table_id"/… · ό,τι δεν
#             καλύπτεται από τέτοιο αντικείμενο γίνεται μονάδα ανά κλαδί έως
#             _JSON_UNIT_MAX χαρακτήρες (οι πίνακες ανοχής, το item_links) · οι
#             σκαλιές τιμές ενός κλαδιού μαζεύονται σε μία μονάδα «κεφαλίδας».
#   .pdf      μονάδα = σελίδα (ωμή εξαγωγή, με τον χαρακτηρισμό της).
# Cache ανά (διαδρομή, mtime, μέγεθος): ο builder ξαναγράφει → ξαναδιαβάζεται.
_ID_KEYS = ("id", "uid", "item_id", "section", "table_id")
_JSON_UNIT_MAX = 4000
_BLOCK_RE = re.compile(r"(?:^[^\S\n]*\S[^\n]*\n?)+", re.M)
_ID_HEAD_RE = re.compile(r"^###?\s*\[([^\]\n]+)\]")
_UNITS_CACHE: dict = {}


def _unit_hash(text: str) -> str:
    return "h:" + hashlib.sha1(re.sub(r"\s+", " ", text).strip().encode("utf-8")).hexdigest()[:12]


def _mk_unit(loc: str, where: str, text: str, stext: str, page: int | None = None) -> dict:
    import collections
    folded = _fold_aligned(stext)
    pairs = [_stem_split(w) for w in _WORD_RE.findall(folded)]
    seq = tuple(s for s, _ in pairs)
    cnt = collections.Counter(seq)
    forms: dict[str, set] = collections.defaultdict(set)
    for s, e in pairs:
        forms[s].add(e)
    return {"loc": loc, "where": where, "text": text, "stext": stext, "folded": folded,
            "stemforms": {s: frozenset(v) for s, v in forms.items()}, "stemseq": seq,
            "stemcount": cnt, "page": page}


def _units_blocks(rel: str, text: str) -> list[dict]:
    found = []
    for m in _BLOCK_RE.finditer(text):
        b = m.group().strip()
        if not b:
            continue
        line = text.count("\n", 0, m.start()) + 1
        hm = _ID_HEAD_RE.match(b)
        found.append((b, line, hm.group(1).strip() if hm else None))
    import collections
    counts = collections.Counter(rid for _, _, rid in found if rid)
    units = []
    for b, line, rid in found:
        head = b.splitlines()[0]
        loc = rid if rid and counts[rid] == 1 else _unit_hash(b)
        where = f"{rel} γρ.{line}" + (f" · {head}" if head.startswith("#") else "")
        units.append(_mk_unit(loc, where, b, b))
    return units


def _id_key(d: dict) -> str | None:
    for k in _ID_KEYS:
        v = d.get(k)
        if isinstance(v, (str, int)) and not isinstance(v, bool) and str(v).strip():
            return k
    return None


def _prune(node):
    """Αντίγραφο με τα ένθετα αντικείμενα-με-id αντικατεστημένα από «→ id»."""
    def one(v):
        if isinstance(v, dict) and _id_key(v):
            return f"→ {v[_id_key(v)]}"
        return _prune(v)
    if isinstance(node, dict):
        return {k: one(v) for k, v in node.items()}
    if isinstance(node, list):
        return [one(v) for v in node]
    return node


def _dump(o) -> str:
    return json.dumps(o, ensure_ascii=False, indent=1)


def _units_json(rel: str, text: str) -> list[dict]:
    try:
        root = json.loads(text)
    except Exception:
        return _units_blocks(rel, text)
    found: list[tuple[str, object, str | None]] = []   # (json path, node, id)

    def scalars_of(node, path):
        if isinstance(node, dict):
            s = {k: v for k, v in node.items() if not isinstance(v, (dict, list))}
        else:
            s = [v for v in node if not isinstance(v, (dict, list))]
        if s:
            found.append((path, s, None))

    def walk(node, path, covered):
        if isinstance(node, dict):
            k = _id_key(node)
            if k:
                found.append((path, node, str(node[k]).strip()))
                for kk, v in node.items():
                    walk(v, f"{path}.{kk}", True)
                return
            if not covered and path != "$" and len(_dump(node)) <= _JSON_UNIT_MAX:
                found.append((path, node, None))
                for kk, v in node.items():
                    walk(v, f"{path}.{kk}", True)
                return
            if not covered:
                scalars_of(node, path)
            for kk, v in node.items():
                walk(v, f"{path}.{kk}", covered)
        elif isinstance(node, list):
            if not covered and path != "$" and len(_dump(node)) <= _JSON_UNIT_MAX:
                found.append((path, node, None))
                for i, v in enumerate(node):
                    walk(v, f"{path}[{i}]", True)
                return
            if not covered:
                scalars_of(node, path)
            for i, v in enumerate(node):
                walk(v, f"{path}[{i}]", covered)

    walk(root, "$", False)
    import collections
    counts = collections.Counter(rid for _, _, rid in found if rid)
    units = []
    for path, node, rid in found:
        full = _dump(node)
        stext = _dump(_prune(node)) if isinstance(node, (dict, list)) else full
        loc = rid if rid and counts[rid] == 1 else _unit_hash(full)
        where = f"{rel} · {path}" + (f" · [{rid}]" if rid else "")
        units.append(_mk_unit(loc, where, full, stext))
    return units


def _build_units(p: pathlib.Path) -> list[dict]:
    rel = p.relative_to(ROOT).as_posix() if ROOT in p.parents else p.name
    if p.suffix.lower() == ".pdf":
        pages = pdf_pages(p)
        if pages is None:
            return []
        return [_mk_unit(f"p{i}", f"{p.name} σελ.PDF {i}", pg, pg, i) for i, pg in enumerate(pages, 1)]
    text = unicodedata.normalize("NFC", p.read_text(encoding="utf-8", errors="replace"))
    if p.suffix.lower() == ".json":
        return _units_json(rel, text)
    return _units_blocks(rel, text)


def _units(p: pathlib.Path) -> list[dict]:
    """Οι μονάδες ενός αρχείου, cached ανά (διαδρομή, mtime, μέγεθος)."""
    st = p.stat()
    key = (str(p), st.st_mtime_ns, st.st_size)
    u = _UNITS_CACHE.get(key)
    if u is None:
        if len(_UNITS_CACHE) > 64:
            _UNITS_CACHE.clear()
        u = _UNITS_CACHE[key] = _build_units(p)
    return u


# ── ΤΑ ΟΡΙΑ ΚΟΠΗΣ — ποτέ μέσα σε λέξη ─────────────────────────────────────────
# Ένα σημείο κοπής είναι η ΑΡΧΗ ενός διαστήματος λευκού (ώστε και οι δύο πλευρές
# να τελειώνουν/αρχίζουν σε ολόκληρη λέξη). Η ποιότητά του, από το καλύτερο:
#   4 παράγραφος (δύο+ αλλαγές γραμμής)    3 τέλος πρότασης (. ; ! ? …)
#   2 άνω τελεία / άνω-κάτω τελεία          1 αλλαγή γραμμής     0 κενό μεταξύ λέξεων
# Διαλέγουμε την καλύτερη ποιότητα μέσα στο επιτρεπτό εύρος· σε ισοπαλία, προς
# την αρχή για το ξεκίνημα (περισσότερο συγκείμενο πριν τον όρο) και προς το
# τέλος για το κλείσιμο (περισσότερο κείμενο). Αν ΔΕΝ υπάρχει κανένα λευκό στο
# εύρος (τερατώδης «λέξη», π.χ. JSON τιμή χωρίς κενά), το απόσπασμα μακραίνει
# μέχρι το επόμενο λευκό — ποτέ δεν κόβει στη μέση.
# ΜΕΤΡΗΜΕΝΟ (18/10/2026, 18 ερωτήματα × 8 πηγές = 1.347 αποσπάσματα): 0 κοπές
# μέσα σε λέξη, έναντι 926 (69%) της παλιάς _snippet στα ΙΔΙΑ ευρήματα· το
# 73% τελειώνει σε τέλος πρότασης, 14% σε άνω τελεία, 4% σε παράγραφο, 4% στο
# τέλος της μονάδας, 3% σε αλλαγή γραμμής, 1% σε κενό λέξης.
_WS_RUN = re.compile(r"\s+")
_SENT_PUNCT = ".;!?…"
_CLAUSE_PUNCT = ":··"
_CLOSERS = "»”\")]"


def _boundaries(text: str, lo: int, hi: int) -> list[tuple[int, int]]:
    """[(θέση, ποιότητα)] για τα διαστήματα λευκού που ΑΡΧΙΖΟΥΝ στο [lo, hi)."""
    out = []
    for m in _WS_RUN.finditer(text, max(0, lo), max(0, min(len(text), hi))):
        s = m.start()
        if s == 0:
            continue
        prev = text[s - 1]
        if prev in _CLOSERS and s >= 2:
            prev = text[s - 2]
        nl = m.group().count("\n")
        if nl >= 2:
            q = 4
        elif prev in _SENT_PUNCT:
            q = 3
        elif prev in _CLAUSE_PUNCT:
            q = 2
        elif nl:
            q = 1
        else:
            q = 0
        out.append((s, q))
    return out


def _pick(cands: list[tuple[int, int]], low: bool) -> int:
    best = max(q for _, q in cands)
    ps = [p for p, q in cands if q == best]
    return min(ps) if low else max(ps)


def _best(cands: list[tuple[int, int]], qmin: int, lo: int, hi: int, latest: bool) -> int | None:
    """Το καλύτερο όριο ποιότητας ≥ qmin μέσα στο [lo, hi] — None αν δεν υπάρχει."""
    c = [(p, q) for p, q in cands if q >= qmin and lo <= p <= hi]
    return _pick(c, low=not latest) if c else None


def _nonws(s: str) -> int:
    return sum(1 for ch in s if not ch.isspace())


def _excerpt(text: str, pos: int, end: int, width: int) -> tuple[str, int, int, tuple[int, int]]:
    """(απόσπασμα, ΜΗ-ΛΕΥΚΟΙ χαρακτήρες που παραλείπονται ΠΡΙΝ, ΜΕΤΑ, [αρχή, τέλος)
    μέσα στο κείμενο). Το απόσπασμα περιέχει ολόκληρο το ταίριασμα [pos, end) και
    κόβει μόνο σε όρια. Οι παραλείψεις μετρούν ουσία, όχι λευκό: μια σελίδα PDF
    που τελειώνει σε δεκαπέντε κενές γραμμές ΔΕΝ «παραλείπει 30 χαρακτήρες»."""
    n = len(text)
    if n <= width:
        a2 = n - len(text.lstrip())
        b2 = len(text.rstrip())
        return text[a2:b2], 0, 0, (a2, b2)
    # ΑΡΧΗ: η πιο πρώιμη αρχή πρότασης έως W/3 πίσω (συγκείμενο πριν τον όρο)·
    # αλλιώς η αρχή ΤΗΣ πρότασης του όρου έως W/2 πίσω· αλλιώς αλλαγή γραμμής·
    # αλλιώς κενό λέξης — ποτέ μέσα σε λέξη.
    if pos <= width // 3:
        a = 0
    else:
        back = [(p, q) for p, q in _boundaries(text, pos - width // 2, pos + 1) if p <= pos]
        a = _best(back, 2, pos - width // 3, pos, latest=False)
        if a is None:
            a = _best(back, 2, pos - width // 2, pos, latest=True)
        if a is None:
            a = _best(back, 1, pos - width // 3, pos, latest=True)
        if a is None:
            a = _best(back, 0, pos - width // 3, pos, latest=False)
        if a is None:
            a = pos
            while a > 0 and not text[a - 1].isspace():
                a -= 1
    # ΤΕΛΟΣ: τέλος πρότασης/γραμμής στο τελευταίο τρίτο του παραθύρου· αλλιώς
    # οπουδήποτε στο παράθυρο· αλλιώς τέλος πρότασης λίγο ΠΕΡΑ από το πλάτος (έως
    # 1,3×W — μια ολόκληρη πρόταση αξίζει 200 χαρακτήρες)· αλλιώς κενό λέξης.
    if n - a <= width:
        b = n
    else:
        hi = a + width
        far = a + (13 * width) // 10
        fwd = [(p, q) for p, q in _boundaries(text, a + width // 3, far + 1) if p >= end]
        b = _best(fwd, 1, a + (2 * width) // 3, hi, latest=True)
        if b is None:
            b = _best(fwd, 1, a + width // 3, hi, latest=True)
        if b is None:
            b = _best(fwd, 2, hi + 1, far, latest=False)
        if b is None:
            b = _best(fwd, 0, a + width // 3, hi, latest=True)
        if b is None:
            m = _WS_RUN.search(text, max(hi, end))
            b = m.start() if m else n
    seg = text[a:b]
    a2 = a + (len(seg) - len(seg.lstrip()))
    b2 = b - (len(seg) - len(seg.rstrip()))
    return text[a2:b2], _nonws(text[:a2]), _nonws(text[b2:]), (a2, b2)


def _anchor(u: dict, tstems: list[tuple[str, str]]) -> tuple[int, int]:
    """[αρχή, τέλος) του ΠΡΩΤΟΥ ταιριάσματος στη μονάδα — substring ή ίδια ρίζα."""
    f = u["folded"]
    best: tuple[int, int] | None = None
    for t, s, al in tstems:
        i = f.find(t)
        if i >= 0:
            cand = (i, i + len(t))
        elif _stem_hit(u, s, al):
            cand = None
            for m in _WORD_RE.finditer(f):
                ws, we = _stem_split(m.group())
                if ws == s and we in al:
                    cand = (m.start(), m.end())
                    break
            if cand is None:
                continue
        else:
            continue
        if best is None or cand[0] < best[0]:
            best = cand
    return best or (0, 0)


def _tidy(s: str) -> str:
    """Για ΕΜΦΑΝΙΣΗ αποσπάσματος: κενές γραμμές φεύγουν, οι εσωτερικές σειρές
    διαστημάτων γίνονται ένα, η ΕΣΟΧΗ κάθε γραμμής μένει (το JSON διαβάζεται).
    Το fetch ΔΕΝ περνά από εδώ — επιστρέφει αυτολεξεί."""
    out = []
    for line in s.splitlines():
        body = line.strip()
        if not body:
            continue
        lead = len(line) - len(line.lstrip())
        out.append(" " * min(lead, 12) + re.sub(r"[ \t]+", " ", body))
    return "\n".join(out)


def _split_parts(text: str, max_chars: int) -> list[tuple[int, int]]:
    """Μέρη ≤ max_chars σε όρια (παράγραφος > πρόταση > γραμμή > λέξη), ποτέ
    μέσα σε λέξη. Η συρραφή ΟΛΩΝ των μερών είναι ακριβώς το κείμενο."""
    parts, i, n = [], 0, len(text)
    while n - i > max_chars:
        lo, hi = i + max_chars // 2, i + max_chars
        c = [(p, q) for p, q in _boundaries(text, lo, hi + 1) if lo <= p <= hi]
        if c:
            cut = _pick(c, low=False)
        else:
            m = _WS_RUN.search(text, hi)
            cut = m.start() if m else n
        if cut <= i:
            break
        parts.append((i, cut))
        i = cut
    parts.append((i, n))
    return parts


def _source_files(path: pathlib.Path, is_dir: bool) -> list[pathlib.Path]:
    files = [path]
    if is_dir:
        files = sorted(f for f in path.rglob("*")
                       if f.is_file() and f.suffix.lower() in SEARCHABLE_SUFFIXES
                       and not any(part.startswith(".") for part in f.relative_to(path).parts))
    out = []
    for f in files:
        # ξανά ο έλεγχος διαδρομής ανά αρχείο — ένα symlink δεν βγαίνει έξω
        rf = f.resolve()
        if rf != path and path not in rf.parents:
            continue
        out.append(rf)
    return out


def _handle_prefix(sid: str, path: pathlib.Path, rf: pathlib.Path) -> str:
    """Η πηγή της λαβής: το id της λίστας όταν το αρχείο ΕΙΝΑΙ η καταχώριση,
    αλλιώς η διαδρομή του αρχείου σχετικά με τη ρίζα (αναλύεται ξανά από το
    resolve_source μέσα στον φάκελο της λίστας)."""
    if rf == path:
        return sid
    return rf.relative_to(ROOT).as_posix() if ROOT in rf.parents else str(rf)


def search_sources_impl(query: str, source: str, max_hits: int, per_call_chars: int,
                        excerpt_chars: int | None = None, stems: bool = True) -> tuple[str, int]:
    """Επιστρέφει (κείμενο για το μοντέλο, πλήθος ευρημάτων). Σηκώνει PathRefused.
    Κάθε εύρημα: θέση · λαβή · πόσο παραλείπεται · απόσπασμα κομμένο σε όριο."""
    sid, path, is_dir, raw = resolve_source(source)
    terms = _terms(query)
    if not terms:
        raise PathRefused("Κενό ερώτημα — δώσε τουλάχιστον μία λέξη 2+ χαρακτήρων.")
    tstems = _term_stems(terms)
    max_hits = max(1, min(int(max_hits or 8), 20))
    width = int(excerpt_chars if excerpt_chars is not None else CFG.get("search_excerpt_chars", 700))
    hits: list[tuple[int, dict, str]] = []   # score, unit, πρόθεμα λαβής

    if raw:
        if pdf_pages(path) is None:
            raise PathRefused(f"Η πηγή «{sid}» δεν είναι διαθέσιμη: δεν υπάρχει βιβλιοθήκη "
                              f"εξαγωγής κειμένου PDF (PyMuPDF/pypdf) σε αυτή την Python.")
        for u in _units(path):
            sc = _score_unit(u, tstems, stems)
            if sc:
                hits.append((sc, u, sid))
    else:
        for rf in _source_files(path, is_dir):
            prefix = _handle_prefix(sid, path, rf)
            for u in _units(rf):
                sc = _score_unit(u, tstems, stems)
                if sc:
                    hits.append((sc, u, prefix))

    hits.sort(key=lambda h: (-h[0], *_rank_key(h[1], tstems), h[1]["where"]))
    total = len(hits)
    shown = hits[:max_hits]
    head = (f"ΠΗΓΗ «{sid}» ({WHITELIST[sid][3]}) · ερώτημα: {query!r} · όροι: {', '.join(terms)} · "
            f"{total} ευρήματα, δείχνω {len(shown)}.\n"
            f"Κάθε εύρημα φέρει ΛΑΒΗ. Το απόσπασμα κόβεται σε όριο πρότασης/παραγράφου/γραμμής — ποτέ μέσα σε "
            f"λέξη — και λέει πόσοι χαρακτήρες παραλείπονται. ΠΡΙΝ παραθέσεις, κάλεσε fetch_source(λαβή) για το πλήρες.")
    if raw:
        head += ("\nΠΡΟΣΟΧΗ: όλα τα παρακάτω είναι ΑΚΑΤΕΡΓΑΣΤΗ εξαγωγή κειμένου από PDF — "
                 "ΟΧΙ επικυρωμένο υλικό. Μετέφερε τον χαρακτηρισμό κάθε ευρήματος στην απάντηση.")
    parts = [head]
    used = len(head)
    for n, (sc, u, prefix) in enumerate(shown, 1):
        handle = f"{prefix}#{u['loc']}"
        pos, end = _anchor(u, tstems)
        exc, before, after, _span = _excerpt(u["stext"], pos, end, width)
        mark = (" — " + RAW_MARK.format(page=u["page"])) if raw else ""
        if before == 0 and after == 0:
            span = f"ΟΛΟΚΛΗΡΗ η μονάδα ({len(u['text']):,} χαρ.)"
        else:
            span = (f"απόσπασμα {len(exc):,} από {len(u['stext']):,} χαρ. · παραλείπονται {before:,} πριν + "
                    f"{after:,} μετά → fetch_source(\"{handle}\") για το πλήρες")
        block = (f"\n[{n}] ({sc}/{len(terms)} όροι) {u['where']}{mark}"
                 f"\n    λαβή: {handle} · {span}"
                 f"\n    " + _tidy(exc).replace("\n", "\n    "))
        if used + len(block) > per_call_chars:
            parts.append(f"\n… (κόπηκε στο όριο των {per_call_chars} χαρακτήρων ανά κλήση· "
                         f"{len(shown) - n + 1} ευρήματα δεν εμφανίζονται — στένεψε το ερώτημα ή μείωσε το max_hits)")
            break
        parts.append(block)
        used += len(block)
    if not shown:
        parts.append("\n(κανένα εύρημα — δοκίμασε άλλη λέξη-κλειδί ή άλλη πηγή από τη λίστα)")
    return "".join(parts), total


_HANDLE_HELP = ("Μορφή λαβής: <πηγή>#<εντοπιστής> — π.χ. context-full#fail-24, 3-01#p54, 3-01#p54-55, "
                "data/criteria/contact.json#contact-36, context-full#h:1a2b3c4d5e6f. "
                "Πάρε τη λαβή από το search_sources· μην την επινοήσεις.")


def fetch_source_impl(handle: str, part: int, max_chars: int) -> tuple[str, dict]:
    """Επιστρέφει (κείμενο για το μοντέλο, meta). Σηκώνει PathRefused.
    meta: handle, where, chars (του πλήρους), part, parts, complete, raw,
    body (ΑΚΡΙΒΩΣ οι χαρακτήρες που επιστράφηκαν — για την απόδειξη)."""
    h = (handle or "").strip().strip("«»\"'")
    src, sep, loc = h.rpartition("#")
    if not sep or not src.strip() or not loc.strip():
        raise PathRefused(f"Μη έγκυρη λαβή {handle!r}. {_HANDLE_HELP}")
    src, loc = src.strip(), loc.strip()
    sid, path, is_dir, raw = resolve_source(src)
    try:
        part = max(1, int(part or 1))
    except (TypeError, ValueError):
        part = 1

    if raw:
        m = re.fullmatch(r"p(\d{1,4})(?:-(\d{1,4}))?", loc, re.I)
        if not m:
            raise PathRefused(f"Στην ωμή πηγή «{sid}» ο εντοπιστής είναι σελίδα: pN ή pN-M (π.χ. {sid}#p54). "
                              f"Έλαβα «{loc}».")
        pages = pdf_pages(path)
        if pages is None:
            raise PathRefused(f"Η πηγή «{sid}» δεν είναι διαθέσιμη: δεν υπάρχει βιβλιοθήκη "
                              f"εξαγωγής κειμένου PDF (PyMuPDF/pypdf) σε αυτή την Python.")
        a, b = int(m.group(1)), int(m.group(2) or m.group(1))
        if a < 1 or b > len(pages) or a > b:
            raise PathRefused(f"Η «{sid}» έχει σελίδες 1–{len(pages)}· ζητήθηκε {a}" + (f"–{b}" if b != a else "") + ".")
        if b - a + 1 > FETCH_MAX_PAGES:
            raise PathRefused(f"ΟΡΙΟ: έως {FETCH_MAX_PAGES} σελίδες ανά ανάκτηση (ζητήθηκαν {b - a + 1}). "
                              f"Η ανάκτηση φέρνει ένα εδάφιο ολόκληρο, όχι ολόκληρο PDF — ζήτα {a}-{a + FETCH_MAX_PAGES - 1} "
                              f"και μετά τις επόμενες.")
        chunks, total = [], 0
        for i in range(a, b + 1):
            pg = pages[i - 1]
            total += len(pg)
            chunks.append((f"── σελ.PDF {i} — " + RAW_MARK.format(page=i) + " ──\n" if b != a else "") + pg)
        if total > max_chars:
            raise PathRefused(f"ΟΡΙΟ: οι σελίδες {a}–{b} έχουν {total:,} χαρακτήρες, πάνω από το όριο "
                              f"{max_chars:,} ανά ανάκτηση. Ζήτα λιγότερες σελίδες (μία-μία χωρούν πάντα).")
        body = "\n".join(chunks)
        where = f"{path.name} σελ.PDF {a}" + (f"–{b}" if b != a else "")
        head = (f"ΠΛΗΡΕΣ ΚΕΙΜΕΝΟ · λαβή «{sid}#{loc}» · {where} · {total:,} χαρακτήρες · "
                f"ΟΛΟΚΛΗΡ{'ΕΣ ΟΙ ΣΕΛΙΔΕΣ' if b != a else 'Η Η ΣΕΛΙΔΑ'}, χωρίς αποκοπή\n"
                f"ΠΡΟΣΟΧΗ: {RAW_MARK.format(page=(f'{a}–{b}' if b != a else a))}. Ωμή εξαγωγή από PDF — "
                f"κολλάει λέξεις, κόβει γραμμές. Μετέφερε τον χαρακτηρισμό δίπλα σε κάθε παράθεμα.\n\n")
        return head + body, {"handle": f"{sid}#{loc}", "where": where, "chars": total, "part": 1, "parts": 1,
                             "complete": True, "raw": True, "body": body, "pages": [a, b]}

    matches: list[tuple[pathlib.Path, dict]] = []
    for rf in _source_files(path, is_dir):
        for u in _units(rf):
            if u["loc"] == loc:
                matches.append((rf, u))
    if not matches:
        raise PathRefused(f"Η λαβή «{h}» δεν αντιστοιχεί σε μονάδα της πηγής «{sid}». Είτε δεν προήλθε από το "
                          f"search_sources είτε το corpus άλλαξε από τότε — ξανατρέξε την αναζήτηση και πάρε φρέσκια λαβή. "
                          f"{_HANDLE_HELP}")
    if len(matches) > 1:
        cands = ", ".join(f"{_handle_prefix(sid, path, rf)}#{loc}" for rf, _ in matches[:6])
        raise PathRefused(f"Ασαφής λαβή «{h}»: ο εντοπιστής «{loc}» υπάρχει σε {len(matches)} αρχεία της πηγής. "
                          f"Δώσε τη διαδρομή του αρχείου: {cands}")
    rf, u = matches[0]
    full_handle = f"{_handle_prefix(sid, path, rf)}#{loc}"
    text = u["text"]
    n = len(text)
    spans = _split_parts(text, max_chars)
    if part > len(spans):
        raise PathRefused(f"Η μονάδα «{full_handle}» έχει {len(spans)} μέρ{'ος' if len(spans) == 1 else 'η'} — "
                          f"ζητήθηκε το {part}.")
    s, e = spans[part - 1]
    body = text[s:e]
    complete = len(spans) == 1
    if complete:
        head = (f"ΠΛΗΡΕΣ ΚΕΙΜΕΝΟ · λαβή «{full_handle}» · {u['where']} · {n:,} χαρακτήρες · "
                f"ΟΛΟΚΛΗΡΟ, χωρίς αποκοπή (επικυρωμένο υλικό — όχι ωμή εξαγωγή)\n\n")
    else:
        nxt = (f" Για τη συνέχεια: fetch_source(\"{full_handle}\", part={part + 1})." if part < len(spans) else
               " Αυτό είναι το τελευταίο μέρος.")
        head = (f"ΜΕΡΟΣ {part}/{len(spans)} · λαβή «{full_handle}» · {u['where']} · χαρακτήρες {s + 1:,}–{e:,} "
                f"από {n:,} · ΔΕΝ ΕΙΝΑΙ ΟΛΟΚΛΗΡΟ — η μονάδα ξεπερνά το όριο {max_chars:,} χαρ. ανά ανάκτηση και "
                f"κόπηκε σε όριο παραγράφου/γραμμής, ποτέ μέσα σε λέξη.{nxt}\n\n")
    return head + body, {"handle": full_handle, "where": u["where"], "chars": n, "part": part, "parts": len(spans),
                         "complete": complete, "raw": False, "body": body, "span": [s, e]}


# ════════════════════════════════════════════════════════════════════════════
# casefile — PostgREST πάνω από το ξεχωριστό Supabase project, ΧΩΡΙΣ SQL
# ════════════════════════════════════════════════════════════════════════════

class CasefileError(Exception):
    pass


def _cf_request(method: str, path: str, body: dict | None = None, query: str = "") -> object:
    """Μία κλήση στο REST του casefile. URL και κλειδί από το περιβάλλον ΤΩΡΑ·
    δεν τυπώνονται, δεν επιστρέφονται. Σηκώνει CasefileError με το μήνυμα του
    PostgREST (ποτέ τα headers)."""
    import urllib.error
    import urllib.request
    url = os.environ.get("FDMS_CASEFILE_URL", "").rstrip("/")
    key = os.environ.get("FDMS_CASEFILE_KEY", "")
    if not url or not key:
        raise CasefileError("Ο φάκελος υποθέσεων δεν είναι διαθέσιμος (λείπουν τα διαπιστευτήρια στο περιβάλλον).")
    full = f"{url}/rest/v1/{path}" + (f"?{query}" if query else "")
    data = json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None
    req = urllib.request.Request(full, data=data, method=method, headers={
        "apikey": key, "Authorization": f"Bearer {key}",
        "Content-Type": "application/json", "Accept": "application/json",
    })
    try:
        with urllib.request.urlopen(req, timeout=CASEFILE_TIMEOUT_S) as r:
            raw = r.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        try:
            msg = json.loads(e.read().decode("utf-8"))
            msg = msg.get("message") or msg.get("hint") or json.dumps(msg, ensure_ascii=False)
        except Exception:
            msg = e.reason
        raise CasefileError(f"Ο φάκελος απέρριψε την κλήση ({e.code}): {msg}")
    except urllib.error.URLError as e:
        raise CasefileError(f"Δεν υπάρχει σύνδεση με τον φάκελο υποθέσεων: {e.reason}")
    return json.loads(raw) if raw.strip() else None


def _pg_quote(v: str) -> str:
    """Τιμή για φίλτρο PostgREST: χωρίς τους χαρακτήρες που αλλάζουν τη σύνταξη."""
    return re.sub(r"[,.()*\"\\]", " ", str(v or "")).strip()


def _fmt_student(s: dict) -> str:
    name = " ".join(x for x in (s.get("rank"), s.get("last_name"), s.get("first_name")) if x)
    bits = [f"id={s.get('id')}", name]
    if s.get("mn"):
        bits.append(f"ΑΜ {s['mn']}")
    if s.get("course"):
        bits.append(f"σειρά {s['course']}")
    if s.get("oid"):
        bits.append(f"oid {s['oid']}")
    if s.get("active") is False:
        bits.append("ΑΝΕΝΕΡΓΟΣ")
    return " · ".join(bits)


def _fmt_case(c: dict) -> str:
    cites = c.get("cites") or []
    cite_s = "; ".join(" ".join(str(v) for v in x.values()) if isinstance(x, dict) else str(x) for x in cites)
    return (f"case {c.get('id')} · {c.get('occurred_on')} · {c.get('kind')}"
            + (f" · {c.get('stage')}" if c.get("stage") else "")
            + (f" · {c.get('sortie')}" if c.get("sortie") else "")
            + (f" · {c.get('score_pct')}%" if c.get("score_pct") is not None else "")
            + f" · status={c.get('status')}"
            + (f"\n    συνέπεια: {c.get('consequence')}" if c.get("consequence") else "")
            + (f"\n    σημείωση: {c.get('note')}" if c.get("note") else "")
            + (f"\n    παραπομπές: {cite_s}" if cite_s else ""))


def _parse_cites(cites: str) -> list:
    cites = (cites or "").strip()
    if not cites:
        return []
    try:
        v = json.loads(cites)
    except Exception:
        # ανεκτικό: «fail-24; ΠΔ 29/2020 άρθρο 3 παρ.7» → [{ref: ...}, ...]
        return [{"ref": x.strip()} for x in cites.split(";") if x.strip()]
    if not isinstance(v, list):
        raise CasefileError("Το `cites` πρέπει να είναι JSON λίστα αντικειμένων, π.χ. "
                            '[{"src":"ΠΔ 29/2020","ref":"άρθρο 3 παρ.7","id":"fail-24"}]')
    out = []
    for x in v:
        if isinstance(x, dict) and all(isinstance(k, str) and isinstance(val, (str, int, float)) for k, val in x.items()):
            out.append(x)
        elif isinstance(x, str):
            out.append({"ref": x})
        else:
            raise CasefileError("Κάθε στοιχείο του `cites` πρέπει να είναι αντικείμενο με string τιμές.")
    return out


# ════════════════════════════════════════════════════════════════════════════
# ΣΥΝΕΔΡΙΕΣ — tools/advisor/sessions/<agent>/<id>.json (R-B.1)
# Πραγματικά ονόματα μέσα: ΠΟΤΕ στο git, ΠΟΤΕ σε γραμμή log — μόνο ids.
# ════════════════════════════════════════════════════════════════════════════

SID_RE = re.compile(r"^[0-9a-f]{16}$")


def _now() -> str:
    return dt.datetime.now().replace(microsecond=0).isoformat()


def sessions_dir() -> pathlib.Path:
    return pathlib.Path(CFG["sessions_dir"])


def session_path(agent: str, sid: str) -> pathlib.Path | None:
    if not SID_RE.match(sid or "") or not re.fullmatch(r"[a-z0-9][a-z0-9_-]{0,63}", agent or ""):
        return None
    return sessions_dir() / agent / f"{sid}.json"


def new_session(agent: str, context: str = "", title: str = "", student_id: str | None = None,
                student_label: str = "", seed: list[dict] | None = None, note: str = "") -> dict:
    import secrets
    s = {"id": secrets.token_hex(8), "agent": agent, "title": (title or "").strip()[:80],
         "context": (context or "").strip(), "student_id": student_id, "student_label": student_label,
         "created": _now(), "updated": _now(), "archived": False,
         "messages": list(seed or []), "writes": [], "events": [], "compactions": 0}
    if note:
        s["events"].append({"at": _now(), "type": "seed", "text": note})
    save_session(s)
    log(f"[session] new agent={agent} id={s['id']} seeded={bool(seed)}")
    return s


def save_session(s: dict) -> None:
    p = session_path(s["agent"], s["id"])
    if not p:
        raise ValueError("bad session id")
    p.parent.mkdir(parents=True, exist_ok=True)
    s["updated"] = _now()
    tmp = p.with_suffix(".tmp")
    tmp.write_text(json.dumps(s, ensure_ascii=False, indent=1), encoding="utf-8")
    os.replace(tmp, p)


def load_session(agent: str, sid: str) -> dict | None:
    p = session_path(agent, sid)
    if not p or not p.is_file():
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return None


def session_summary(s: dict) -> dict:
    return {"id": s["id"], "agent": s["agent"], "title": s.get("title") or "(χωρίς τίτλο)",
            "created": s["created"], "updated": s["updated"], "archived": bool(s.get("archived")),
            "turns": sum(1 for m in s["messages"] if m["role"] == "user" and not m.get("kind")),
            "writes": len(s.get("writes") or []), "compactions": int(s.get("compactions") or 0),
            "student_label": s.get("student_label") or "", "chars": history_chars(s["messages"]),
            "history_tokens_est": est_tokens(history_chars(s["messages"]))}


def list_sessions(agent: str, include_archived: bool = False, limit: int = 30) -> list[dict]:
    d = sessions_dir() / agent
    out = []
    if not d.is_dir():
        return out
    for p in d.glob("*.json"):
        try:
            s = json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            continue
        if s.get("archived") and not include_archived:
            continue
        out.append(session_summary(s))
    out.sort(key=lambda x: x["updated"], reverse=True)
    return out[:limit]


def history_chars(messages: list[dict]) -> int:
    return sum(len(m.get("content") or "") for m in messages)


def context_budget(a: dict, system: list[dict], s: dict, question: str = "") -> dict:
    """Q1 — το ΣΥΝΟΛΟ που βλέπει το μοντέλο, σε εκτιμώμενα tokens, και αν
    ξεχείλισε: corpus (όλο το system) + ιστορικό + ερώτηση, έναντι ταβανιού
    μείον το απόθεμα της απάντησης (max_tokens του agent)."""
    corpus_t = est_tokens(sum(len(b["text"]) for b in system))
    hist_t = est_tokens(history_chars(s["messages"]) + len(question or ""))
    ceiling = int(CFG["context_ceiling"])
    reserve = int(a["max_tokens"])
    return {"corpus": corpus_t, "history": hist_t, "total": corpus_t + hist_t, "ceiling": ceiling,
            "reserve": reserve, "compact_at": ceiling - reserve,
            "overflow": corpus_t + hist_t > ceiling - reserve, "chars_per_token": GREEK_CHARS_PER_TOKEN}


def derive_title(question: str, agent: dict) -> str:
    """Q8 — σύντομη ετικέτα ΧΩΡΙΣ κλήση μοντέλου: κωδικός εξόδου · θέμα · βαθμός.
    Αν δεν βγαίνει τίποτα, η ερώτηση κομμένη, όπως πριν."""
    q = question or ""
    parts: list[str] = []
    # υπαγόρευση: «4600 2» είναι το 4602 (τετραψήφιο που λήγει σε 0 + μονοψήφιο)
    q = re.sub(r"\b(\d{3})0\s([1-9])\b", r"\1\2", q)
    m = re.search(r"\b([CIFNB])\s?(\d{4})\b", q, re.I)
    if m:
        parts.append(m.group(1).upper() + m.group(2))
    else:
        m = re.search(r"(?<![\d.,])([1-9]\d{3})(?![\d.,%])", q)   # «την 4602» από υπαγόρευση, χωρίς γράμμα
        if m:
            parts.append(m.group(1))
    KINDS = [
        (r"περιγραφ|description", "περιγραφή"), (r"παρατήρησ|remark|observation", "παρατήρηση"),
        (r"αεροναυτ|airsick", "αεροναυτία"), (r"αποτυχ|απέτυχ|κόπηκε|fail\b", "αποτυχία"),
        (r"υστέρησ|υστερησ|\blag\b", "υστέρηση"), (r"κεπε|\bsms\b", "ΚΕΠΕ"),
        (r"δοκιμ[ήη] προόδου|progress check", "δοκιμή προόδου"), (r"συμβούλι|\bboard\b", "συμβούλιο"),
        (r"αξιολόγησ|checkride", "αξιολόγηση"), (r"μόνος|\bsolo\b", "ΜΟΝΟΣ"),
        (r"εξέτασ|exam", "εξέταση"), (r"φύλλο μη πτήσης|\bnfs\b", "ΦμΠ"),
    ]
    for pat, lab in KINDS:
        if re.search(pat, q, re.I):
            parts.append(lab)
            break
    if not any(p in ("περιγραφή", "παρατήρηση") for p in parts):
        subj = {"description": "περιγραφή", "remarks": "παρατήρηση"}.get(agent["id"])
        if subj:
            parts.append(subj)
    m = re.search(r"\b(\d{1,3})\s?%", q)
    if m and 0 <= int(m.group(1)) <= 100:
        parts.append(m.group(1) + "%")
    m = re.search(r"#\s?(\d{1,2})\b", q)
    if m:
        parts.append("#" + m.group(1))
    title = " · ".join(dict.fromkeys(parts))
    return title if title else q[:80]


def api_messages(s: dict, question: str | None = None) -> list[dict]:
    """Το ιστορικό της συνεδρίας στο σχήμα του API (+ η νέα ερώτηση), με το
    context στο ΠΡΩΤΟ user μήνυμα και το cache breakpoint στο τελευταίο."""
    raw = [{"role": m["role"], "content": m["content"]} for m in s["messages"]]
    if question is not None:
        raw.append({"role": "user", "content": question})
    out, _ = normalise_messages(raw, s.get("context") or "")
    return out or []


# ── ΕΚΚΡΕΜΕΙΣ ΕΓΓΡΑΦΕΣ (R-A): token μίας χρήσης, στη μνήμη, δεμένο με συνεδρία ──
PENDING: dict[str, dict] = {}


def pending_sweep() -> None:
    now = time.time()
    for k in [k for k, v in PENDING.items() if v["expires"] < now]:
        PENDING.pop(k, None)


def pending_create(agent: str, session: str, tool: str, payload: dict, preview: str, meta: dict) -> dict:
    import secrets
    with LOCK:
        pending_sweep()
        tok = secrets.token_urlsafe(24)
        rec = {"token": tok, "agent": agent, "session": session, "tool": tool, "payload": payload,
               "preview": preview, "meta": meta, "created": time.time(),
               "expires": time.time() + int(CFG["confirm_ttl"])}
        PENDING[tok] = rec
    return rec


def pending_take(token: str, agent: str, session: str) -> dict | None:
    """Μία φορά, μέσα στον χρόνο, από την ΙΔΙΑ συνεδρία/agent — αλλιώς None."""
    with LOCK:
        pending_sweep()
        rec = PENDING.get(token or "")
        if not rec or rec["agent"] != agent or rec["session"] != session:
            return None
        return PENDING.pop(token)


def casefile_cases_text(student_id: str, limit: int = 40) -> tuple[str, str]:
    """(κείμενο αφετηρίας, ετικέτα μαθητή) από το cases_live — για το «Έκλεισε η
    υπόθεση» και για τον seeded νέο γύρο. Σηκώνει CasefileError."""
    rows = _cf_request("GET", "cases_live", query=(
        f"student_id=eq.{student_id}&order=occurred_on.desc,created_at.desc&limit={limit}"
        "&select=id,occurred_on,kind,stage,sortie,score_pct,consequence,cites,note,status,rank,last_name,first_name,course,oid")) or []
    if not rows:
        st = _cf_request("GET", "students", query=f"id=eq.{student_id}&select=id,oid,rank,last_name,first_name,mn,course,active") or []
        label = _fmt_student(st[0]).split(" · ", 1)[-1] if st else student_id
        return f"Μαθητής: {label}\n(καμία ζωντανή υπόθεση στον φάκελο)", label
    label = _fmt_student(rows[0]).split(" · ", 1)[-1]
    body = f"Μαθητής: {label} · student_id {student_id}\n{len(rows)} ζωντανές υποθέσεις (νεότερες πρώτα):\n" + \
        "\n".join("  " + _fmt_case(c) for c in rows)
    return body, label


class ToolBudget:
    """Τα φρένα ΟΛΩΝ των εργαλείων ΑΝΑ ΑΠΑΝΤΗΣΗ, και το ημερολόγιο κλήσεων."""

    def __init__(self, emit=None, agent_id: str = "agent", session_id: str | None = None,
                 human: str = ""):
        self.calls = 0            # search_sources (+ τα composer tools, που μοιράζονται τον μετρητή)
        self.fetches = 0          # fetch_source — δικός του μετρητής: η ανάκτηση δεν τρώει αναζητήσεις
        self.chars = 0            # ΟΛΑ τα εργαλεία, έναντι του tool_total_chars
        self.cf_calls = 0         # casefile_* (όλα)
        self.cf_writes = 0        # προεπισκοπήσεις εγγραφής (add/update)
        self.agent_id = agent_id
        self.session_id = session_id
        self.human = (human or "").strip()
        self.last_pending = None
        self.log: list[dict] = []
        self.emit = emit

    def make_tools(self, names: list[str]) -> list:
        out = []
        if any(n in SEARCH_TOOLS for n in names):
            out.extend(self.make_search_tools())      # πάντα το ζευγάρι
        cf = [n for n in names if n in CASEFILE_TOOLS]
        if cf:
            out.extend(self.make_casefile_tools(cf))
        if "remarks_lookup" in names:
            out.append(self.make_remarks_lookup())
        if "description_template" in names:
            out.append(self.make_description_template())
        return out

    # ── Q6: description_template — η ΠΡΑΓΜΑΤΙΚΗ γραμματική από το descriptions.json ──
    def make_description_template(self):
        from anthropic import beta_tool
        from anthropic.lib.tools import ToolError
        budget = self
        cap = max(int(CFG["tool_max_chars"]), 9000)

        def part_str(p: dict) -> str:
            t = p.get("t")
            if t == "lit":
                return p.get("v", "")
            if t == "items":
                return "{items " + ("#a-b, c, d" if p.get("fmt") == "lead" else "#a-b, #c, #d") + "}"
            if t == "slot":
                bits = [p.get("id", "slot")]
                if p.get("list"):
                    bits.append("list " + p["list"])
                if p.get("def") is not None:
                    bits.append("def " + str(p["def"]))
                if p.get("free"):
                    bits.append("free")
                if p.get("empty"):
                    bits.append("may be empty")
                return (p.get("pre") or "") + "{" + " · ".join(bits) + "}" + (p.get("post") or "")
            return "{" + json.dumps(p, ensure_ascii=False) + "}"

        def elem_str(e: dict, fam_on: dict) -> str:
            eid = e.get("id", "?")
            on = fam_on.get(eid, e.get("on"))
            flags = [str(e.get("status") or "?"), "προαιρετικό" if e.get("opt") else "υποχρεωτικό",
                     ("ΟΝ" if on else "off") + (" (από οικογένεια)" if eid in fam_on else "")]
            if e.get("def") is not None:
                flags.append("def " + str(e["def"]))
            if e.get("fam"):
                flags.append("μόνο fam " + ",".join(e["fam"]))
            s = f"  - {eid} [{' · '.join(flags)}]: {e.get('label', '')}"
            if e.get("parts"):
                s += "\n      → " + "".join(part_str(p) for p in e["parts"])
            for c in e.get("choice") or []:
                s += f"\n      · {c.get('id')} [{c.get('status') or 'canon'}]: " + ("".join(part_str(p) for p in c.get("parts") or []) or c.get("label", ""))
            for v in e.get("variants") or []:
                s += f"\n      · {v.get('id')} [{v.get('status') or 'canon'}]: {v.get('text') or v.get('label') or ''}"
            if e.get("note"):
                s += f"\n      σημ.: {clean_short(e['note'], 220)}"
            return s

        def clean_short(x, n):
            x = re.sub(r"\s+", " ", str(x or "")).strip()
            return x if len(x) <= n else x[:n] + "…"

        def description_template(sortie: str) -> str:
            """Επιστρέφει από το ίδιο το data/descriptions.json της εφαρμογής ό,τι χρειάζεται για να συνθέσεις το μπλοκ ΜΙΑΣ εξόδου από την πραγματική γραμματική: τυπωμένο canon της κατηγορίας, προεπιλογή της εξόδου, items της κατηγορίας με αριθμούς, στοιχεία/επιλογές με status (canon/enriched/draft), ουρές outcomes, γραμμή EP. Κάλεσέ το πριν γράψεις.

            Args:
                sortie: Ο κωδικός της εξόδου, π.χ. C4602, I2201, F4102, N4401, B1001 (δέχεται και «C 4602» ή «4602»).
            """
            budget.calls += 1
            if budget.calls > int(CFG["tool_max_calls"]):
                budget.record_cf("description_template", f"sortie={sortie!r}", "limit")
                raise ToolError(f"ΟΡΙΟ: {CFG['tool_max_calls']} κλήσεις ανά απάντηση.")
            try:
                D = json.loads(DESC_JSON.read_text(encoding="utf-8"))
            except Exception as e:
                raise ToolError(f"Δεν διαβάζεται το descriptions.json: {e}")
            key = re.sub(r"\s+", "", str(sortie or "")).upper()
            S = D.get("sorties") or {}
            if key not in S:
                cands = [k for k in S if k.endswith(key)] if key else []
                if len(cands) == 1:
                    key = cands[0]
                else:
                    budget.record_cf("description_template", f"sortie={sortie!r}", "error")
                    raise ToolError(f"Η έξοδος «{sortie}» δεν υπάρχει στο descriptions.json"
                                    + (f" — ίσως: {', '.join(cands[:6])}" if cands else "") + ". Ζήτα κωδικό ή κατηγορία.")
            so = S[key]
            cat = so.get("cat")
            C = (D.get("categories") or {}).get(cat) or {}
            T = (D.get("templates") or {}).get(C.get("template") or cat) or {}
            F = (D.get("families") or {}).get(so.get("family")) or {}
            fam_on = F.get("on") or {}
            L = [f"ΕΞΟΔΟΣ {key} · {so.get('name')} · κατηγορία {cat} · οικογένεια {so.get('family')} · section {so.get('section')}"
                 + (f" · Syllabus σελ.PDF {so.get('page')}" if so.get("page") else "")]
            pre = {k: so.get(k) for k in ("band", "work", "to", "elp", "checkride", "first_solo", "night", "end_of_block",
                                           "ep_item", "ep_mif", "items_total", "solo_seed", "not_planned", "hours") if so.get(k) is not None}
            L.append("ΠΡΟΕΠΙΛΟΓΗ ΕΞΟΔΟΥ: " + " · ".join(f"{k}={v}" for k, v in pre.items()))
            if so.get("note"):
                L.append("  σημ. εξόδου: " + clean_short(so["note"], 300))
            L.append(f"\nΤΥΠΩΜΕΝΟ CANON ({T.get('label')}, πηγή: {clean_short(T.get('canon_source'), 120)}):\n  «{T.get('canon')}»")
            L.append("  (παρένθεση στο canon = προαιρετικό στοιχείο, τυπώνεται ΧΩΡΙΣ αγκύλες όταν είναι ΟΝ)")
            H = T.get("head") or {}
            if H:
                L.append(f"\nΚΕΦΑΛΗ (head) [{'προαιρετικό' if H.get('opt') else 'υποχρεωτικό'} · {'ΟΝ' if H.get('on') else 'off'} · def {H.get('def')}]:")
                for v in H.get("variants") or []:
                    L.append(f"  · {v.get('id')} [{v.get('status') or 'canon'}]: {v.get('text') or v.get('label') or ''}")
            if F:
                L.append(f"\nΟΙΚΟΓΕΝΕΙΑ {so.get('family')}: on/off που επιβάλλει στο προφίλ: {json.dumps(fam_on, ensure_ascii=False)}")
                if F.get("mission"):
                    L.append(elem_str(dict(F["mission"], id="mission"), {}))
                if F.get("note"):
                    L.append("  σημ.: " + clean_short(F["note"], 220))
            for sec, lab in (("profile", "ΠΡΟΦΙΛ (με τη σειρά που τυπώνεται)"), ("post", "ΜΕΤΑ ΤΟ ΠΡΟΦΙΛ"),
                             ("graded", "ΒΑΘΜΟΛΟΓΗΜΕΝΟ ΠΡΟΦΙΛ"), ("overall", "OVERALL")):
                V = T.get(sec)
                if not V:
                    continue
                L.append(f"\n{lab}:")
                if isinstance(V, list):
                    for e in V:
                        L.append(elem_str(e, fam_on))
                elif isinstance(V, dict):
                    L.append(elem_str(dict(V, id=V.get("id", sec)), fam_on))
            L.append("\nOUTCOMES (ουρά μετά το «SORTIE OVERALL GRADED AS __.»):")
            for o in D.get("outcomes") or []:
                L.append(f"  - {o.get('id')} [{o.get('status')}] {o.get('label')}: " + " ".join(
                    ("(" if t.get("opt") else "") + "".join(part_str(p) for p in t.get("parts") or []) + (")" if t.get("opt") else "")
                    + ("" if t.get("on") else "[off]") for t in o.get("tail") or []))
            ep = D.get("ep_line") or {}
            L.append(f"\nΓΡΑΜΜΗ EP: fmt «{ep.get('fmt')}» · item #{so.get('ep_item') or C.get('ep_item')} · MIF {so.get('ep_mif')} · "
                     f"{'-'.join(str(x) for x in ep.get('picks') or [])} διαδικασίες από {ep.get('pool')} · {'ΟΝ' if ep.get('default_on') else 'off'} εξ ορισμού")
            items = C.get("items") or []
            L.append(f"\nITEMS ΤΗΣ ΚΑΤΗΓΟΡΙΑΣ ({len(items)}; στο EXCEPT/SOLO γράφονται ΜΟΝΟ οι ΑΡΙΘΜΟΙ): "
                     + " · ".join(f"{i.get('n')} {i.get('label')}" for i in items))
            if C.get("solo_forbidden"):
                L.append(f"  ποτέ ΜΟΝΟΣ: #{', '.join(str(x) for x in C['solo_forbidden'])}")
            lists = D.get("lists") or {}
            used = sorted({p.get("list") for sec in ("profile", "post") for e in (T.get(sec) or []) for p in (e.get("parts") or []) if p.get("list")} |
                          {p.get("list") for o in D.get("outcomes") or [] for t in o.get("tail") or [] for p in t.get("parts") or [] if p.get("list")})
            for ln in used:
                if ln in lists:
                    vals = lists[ln].get("values") or []
                    L.append(f"ΛΙΣΤΑ {ln}: " + " · ".join(f"{v.get('v')}{' [' + v['status'] + ']' if v.get('status') else ''}" for v in vals[:14]))
            res = "\n".join(L)
            if len(res) > cap:
                res = res[:cap] + f"\n… (κόπηκε στο όριο {cap} χαρακτήρων)"
            budget.chars += len(res)
            budget.record_cf("description_template", f"sortie={key}", "ok")
            return res

        return beta_tool(description_template, name="description_template")

    # ── Q7: remarks_lookup — πραγματικά κείμενα της τράπεζας για item + ζεύγος κωδικών ──
    def make_remarks_lookup(self):
        from anthropic import beta_tool
        from anthropic.lib.tools import ToolError
        budget = self
        per_call = int(CFG["tool_max_chars"])
        ABOVE_TAIL = "Above end of block MIF achieved."

        def remarks_lookup(item: str, desired: int, achieved: int, query: str = "", max_results: int = 5) -> str:
            """Επιστρέφει ΠΡΑΓΜΑΤΙΚΕΣ παρατηρήσεις της τράπεζας (data/observations2, 1.910 modes που πέρασαν τον ελεγκτή) για ένα item και ένα ζεύγος κωδικών, επιλεγμένες με τον ΙΔΙΟ κανόνα σχέσης που χρησιμοποιεί η εφαρμογή (κάτω/στο/πάνω από το MIF). Για να γράψεις στο ύφος των υπαρχουσών — όχι για αντιγραφή.

            Args:
                item: Το item: «contact-36», ή «36» μαζί με κατηγορία στο query, ή μέρος του ονόματος (π.χ. «clearing», «GCA»).
                desired: Ο επιθυμητός κώδικας MIF (0-3).
                achieved: Ο κώδικας επίδοσης (0-4).
                query: Προαιρετικά λέξεις-κλειδιά για το error mode (π.χ. «lookout», «complacency») ή η κατηγορία (contact/instrument/formation/vfr_navigation).
                max_results: Πόσα κείμενα (1-8, προεπιλογή 5).
            """
            budget.calls += 1
            if budget.calls > int(CFG["tool_max_calls"]):
                budget.record_cf("remarks_lookup", f"item={item!r}", "limit")
                raise ToolError(f"ΟΡΙΟ: {CFG['tool_max_calls']} αναζητήσεις ανά απάντηση. Γράψε με όσα έχεις.")
            try:
                d, a_ = int(desired), int(achieved)
            except (TypeError, ValueError):
                raise ToolError("desired/achieved πρέπει να είναι ακέραιοι (0-3 / 0-4).")
            if not (0 <= d <= 3 and 0 <= a_ <= 4):
                raise ToolError("desired 0-3, achieved 0-4. Ο κώδικας «E» δεν υπάρχει στην τράπεζα.")
            n_max = max(1, min(int(max_results or 5), 8))
            qf = _fold(query)
            cat_hint = next((c for c in ("contact", "instrument", "formation", "vfr_navigation") if c in qf), None)
            # ── εύρεση του αρχείου: id, αριθμός+κατηγορία, ή όνομα ──
            files = [f for f in OBS2_DIR.glob("*/*.json") if f.name != "index.json"]
            it = _fold(item)
            hits = []
            for f in files:
                stem = f.stem                                   # contact-36
                cat, _, num = stem.rpartition("-")
                if it == stem or (it == num and (not cat_hint or cat == cat_hint)):
                    hits.append(f)
            if not hits:
                for f in files:
                    try:
                        j = json.loads(f.read_text(encoding="utf-8"))
                    except Exception:
                        continue
                    if it and it in _fold(j.get("item_name", "")) and (not cat_hint or j.get("category") == cat_hint):
                        hits.append(f)
            if not hits:
                raise ToolError(f"Δεν βρέθηκε item «{item}». Δώσε id όπως contact-36, ή αριθμό + κατηγορία, ή μέρος του ονόματος.")
            if len(hits) > 1 and not (len(hits) <= 4):
                raise ToolError(f"Πολλά items ταιριάζουν ({len(hits)}): στένεψε — " + ", ".join(h.stem for h in hits[:8]))
            rel = "below" if a_ < d else "at" if a_ == d else "above"
            out, total, shown = [], 0, 0
            for f in hits:
                j = json.loads(f.read_text(encoding="utf-8"))
                rows = {r["sn"]: r["row_name"] for r in j.get("mif_rows") or []}
                out.append(f"ITEM {j['item_id']} · {j['item_name']} · {j['category']} · MIF rows {', '.join(f'{k} {v}' for k, v in rows.items())} · "
                           f"σχέση {rel.upper()} (desired {d} → achieved {a_})")
                modes = j.get("error_modes") or []
                terms = [t for t in _terms(query) if t not in ("contact", "instrument", "formation", "vfr_navigation", "vfr", "navigation")]
                if terms:
                    modes = [m for m in modes if any(t in _fold(m.get("label", "") + " " + str(m.get("hf_concept", "")) + " " + str(m.get("mif_row", ""))) for t in terms)]
                k = str(a_)
                for m in modes:
                    if shown >= n_max:
                        break
                    text, src, fb = None, None, False
                    if rel == "below":
                        text, src = (m.get("texts") or {}).get(k), f"texts.{k}"
                    elif rel == "at":
                        if (m.get("texts_at") or {}).get(k):
                            text, src = m["texts_at"][k], f"texts_at.{k}"
                        elif (m.get("texts") or {}).get("marginal"):
                            text, src, fb = m["texts"]["marginal"], "texts.marginal", True
                        else:
                            text, src, fb = (m.get("texts") or {}).get(k), f"texts.{k}", True
                    else:
                        if (m.get("texts_above") or {}).get(k):
                            t = m["texts_above"][k].rstrip()
                            text, src = (t if t.endswith(ABOVE_TAIL) else t + " " + ABOVE_TAIL), f"texts_above.{k}"
                        else:
                            text, src, fb = (m.get("texts") or {}).get(k), f"texts.{k}", True
                    if not text:
                        continue
                    total += 1
                    line = (f"\n[{m.get('id')}] {m.get('label')}" + (f" · HF {m['hf_concept']}" if m.get("hf_concept") else "")
                            + (f" · MIF row {m['mif_row']}" if m.get("mif_row") else "") + f" · {src}"
                            + (" · FALLBACK (λείπει το κανονικό κλειδί — ΜΗΝ το μιμηθείς ως πρότυπο)" if fb else "")
                            + f"\n    #{rows and list(rows)[0] or '?'}. ({d}) -> ({a_}): {text}")
                    if sum(len(x) for x in out) + len(line) > per_call:
                        out.append(f"\n… (κόπηκε στο όριο {per_call} χαρακτήρων)")
                        shown = n_max
                        break
                    out.append(line)
                    shown += 1
            if shown == 0:
                out.append("\n(κανένα κείμενο για αυτή τη σχέση/κλειδί — δοκίμασε άλλο ζεύγος ή κενό query)")
            res = "".join(out)
            budget.chars += len(res)
            budget.record_cf("remarks_lookup", f"item={item!r} {d}->{a_} q={query!r} shown={shown}", "ok")
            return res

        return beta_tool(remarks_lookup, name="remarks_lookup")

    # ── casefile ──────────────────────────────────────────────────────────
    def make_casefile_tools(self, names: list[str]) -> list:
        from anthropic import beta_tool
        from anthropic.lib.tools import ToolError
        budget = self
        max_calls = int(CFG["casefile_max_calls"])
        max_writes = int(CFG["casefile_max_writes"])
        # Ο ΔΡΑΣΤΗΣ ΚΟΥΒΑΛΑ ΚΑΙ ΤΟΝ ΑΝΘΡΩΠΟ. Τοπικά μένει «agent:<id>», όπως
        # πάντα: ο άνθρωπος είναι ο ιδιοκτήτης στο πληκτρολόγιό του. Μέσω
        # Cloudflare Access προστίθεται το email ΠΟΥ ΥΠΕΓΡΑΨΕ Η CLOUDFLARE —
        # δεν το πληκτρολογεί χρήστης και δεν το στέλνει ο browser μόνος του.
        actor = f"agent:{self.agent_id}" + (f" · {self.human}" if self.human else "")

        def gate(tool: str, write: bool, summary: str) -> None:
            budget.cf_calls += 1
            if budget.cf_calls > max_calls:
                budget.record_cf(tool, summary, "limit")
                raise ToolError(f"ΟΡΙΟ: {max_calls} κλήσεις φακέλου ανά απάντηση. Απάντησε με όσα έχεις.")
            if write:
                budget.cf_writes += 1
                if budget.cf_writes > max_writes:
                    budget.record_cf(tool, summary, "limit")
                    raise ToolError(f"ΟΡΙΟ: {max_writes} εγγραφές φακέλου ανά απάντηση. Πες στον "
                                    f"ιδιοκτήτη τι έμεινε να γραφτεί και ζήτα νέο γύρο.")

        def run(tool: str, summary: str, fn):
            try:
                res = fn()
            except CasefileError as e:
                budget.record_cf(tool, summary, "error")
                raise ToolError(str(e))
            except Exception as e:
                budget.record_cf(tool, summary, "error")
                raise ToolError(f"Σφάλμα φακέλου: {type(e).__name__}: {e}")
            budget.record_cf(tool, summary, "ok", res if tool in ("casefile_add_case", "casefile_update_case") else None)
            return res

        def casefile_find_student(query: str, course: str = "", include_inactive: bool = False) -> str:
            """Βρίσκει μαθητές στον φάκελο υποθέσεων κατά επώνυμο, όνομα, ΑΜ ή oid. ΠΑΝΤΑ πρώτο βήμα πριν από οποιαδήποτε άλλη κλήση casefile — το student_id που επιστρέφει είναι το μόνο έγκυρο.

            Args:
                query: Επώνυμο ή όνομα (μερικό, χωρίς τόνους δεν πειράζει), ή ΑΜ, ή oid.
                course: Προαιρετικά η σειρά (π.χ. 99Α) για να στενέψει η λίστα.
                include_inactive: Να επιστραφούν και ανενεργοί μαθητές (προεπιλογή όχι).
            """
            q = _pg_quote(query)
            if len(q) < 2:
                raise ToolError("Δώσε τουλάχιστον 2 χαρακτήρες.")
            gate("casefile_find_student", False, f"q={q!r}")

            def go():
                parts = [f"or=(last_name.ilike.*{q}*,first_name.ilike.*{q}*,mn.eq.{q},oid.eq.{q})",
                         "select=id,oid,rank,last_name,first_name,mn,course,active",
                         "order=last_name.asc,first_name.asc", "limit=20"]
                if course:
                    parts.append(f"course=eq.{_pg_quote(course)}")
                if not include_inactive:
                    parts.append("active=is.true")
                from urllib.parse import quote
                rows = _cf_request("GET", "students", query="&".join(quote(p, safe="=&*,.()") for p in parts)) or []
                if not rows:
                    return (f"Κανένας μαθητής για «{q}». Μαθητές προσθέτει ο ιδιοκτήτης — πες του ότι δεν "
                            f"βρέθηκε και μην επινοήσεις id.")
                return f"{len(rows)} μαθητές:\n" + "\n".join("  " + _fmt_student(s) for s in rows)
            return run("casefile_find_student", f"q={q!r}", go)

        def casefile_list_cases(student_id: str, kind: str = "", status: str = "", limit: int = 30) -> str:
            """Οι ζωντανές υποθέσεις ενός μαθητή (οι ανακληθείσες δεν εμφανίζονται), νεότερες πρώτα.

            Args:
                student_id: Το uuid του μαθητή από casefile_find_student.
                kind: Προαιρετικό φίλτρο είδους: fail, lag, nfs_in, nfs_out, sms_in, sms_out, progress_check, airsickness, ground_exam, oral_exam, referral, board, note.
                status: Προαιρετικό φίλτρο: open ή closed.
                limit: Μέγιστο πλήθος γραμμών (1-100, προεπιλογή 30).
            """
            sid = (student_id or "").strip().lower()
            if not UUID_RE.match(sid):
                raise ToolError("Το student_id πρέπει να είναι uuid από casefile_find_student.")
            if kind and kind not in CASE_KINDS:
                raise ToolError(f"Άγνωστο kind «{kind}». Επιτρέπονται: {', '.join(CASE_KINDS)}")
            if status and status not in ("open", "closed"):
                raise ToolError("Το status φίλτρο είναι open ή closed.")
            lim = max(1, min(int(limit or 30), 100))
            gate("casefile_list_cases", False, f"student={sid[:8]}… kind={kind or '*'}")

            def go():
                parts = [f"student_id=eq.{sid}", "order=occurred_on.desc,created_at.desc", f"limit={lim}",
                         "select=id,occurred_on,kind,stage,sortie,score_pct,consequence,cites,note,status,rank,last_name,first_name,course"]
                if kind:
                    parts.append(f"kind=eq.{kind}")
                if status:
                    parts.append(f"status=eq.{status}")
                rows = _cf_request("GET", "cases_live", query="&".join(parts)) or []
                if not rows:
                    return "Ο φάκελος του μαθητή δεν έχει ζωντανές υποθέσεις (με αυτά τα φίλτρα)."
                who = _fmt_student(rows[0]).split(" · ", 1)[-1]
                return f"{len(rows)} υποθέσεις — {who}:\n" + "\n".join("  " + _fmt_case(c) for c in rows)
            return run("casefile_list_cases", f"student={sid[:8]}…", go)

        def casefile_add_case(student_id: str, occurred_on: str, kind: str, consequence: str, note: str,
                              stage: str = "", sortie: str = "", score_pct: int = -1, cites: str = "") -> str:
            """ΓΡΑΦΕΙ νέα υπόθεση στον φάκελο ενός μαθητή. ΜΟΝΟ όταν ο ιδιοκτήτης το ζήτησε ρητά. «Καμία ενέργεια» με τον λόγο της είναι έγκυρη και χρήσιμη υπόθεση. Ό,τι επιστρέψει το αναφέρεις αυτολεξεί στην απάντηση.

            Args:
                student_id: Το uuid του μαθητή από casefile_find_student — ποτέ επινοημένο.
                occurred_on: Ημερομηνία του περιστατικού, YYYY-MM-DD.
                kind: Είδος: fail, lag, nfs_in, nfs_out, sms_in, sms_out, progress_check, airsickness, ground_exam, oral_exam, referral, board, note.
                consequence: Τι εφαρμόστηκε στην πράξη (π.χ. «καμία ενέργεια», «δεν πετά την επόμενη ημέρα», «Δοκιμή Προόδου με ΑΕ»).
                note: Η κρίση/ο λόγος του ιδιοκτήτη, με τα λόγια του — ο λόγος που υπάρχει ο φάκελος.
                stage: Στάδιο/κατηγορία (contact, instrument, formation, vfr_navigation) αν υπάρχει.
                sortie: Κωδικός εξόδου (π.χ. C4790) αν υπάρχει.
                score_pct: Βαθμός 0-100 όπου βαθμολογείται· -1 = δεν βαθμολογείται.
                cites: Παραπομπές ως JSON λίστα, π.χ. [{"src":"ΠΔ 29/2020","ref":"άρθρο 3 παρ.1δ","id":"fail-16"}] — ή κενό.
            """
            sid = (student_id or "").strip().lower()
            if not UUID_RE.match(sid):
                raise ToolError("Το student_id πρέπει να είναι uuid από casefile_find_student.")
            if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", occurred_on or ""):
                raise ToolError("Το occurred_on πρέπει να είναι YYYY-MM-DD.")
            try:
                dt.date.fromisoformat(occurred_on)
            except ValueError:
                raise ToolError("Μη έγκυρη ημερομηνία.")
            if kind not in CASE_KINDS:
                raise ToolError(f"Άγνωστο kind «{kind}». Επιτρέπονται: {', '.join(CASE_KINDS)}")
            if not (consequence or "").strip():
                raise ToolError("Το consequence είναι υποχρεωτικό — και «καμία ενέργεια» είναι συνέπεια.")
            if not (note or "").strip():
                raise ToolError("Το note είναι υποχρεωτικό: ο λόγος, με τα λόγια του ιδιοκτήτη.")
            sc = None if score_pct is None or int(score_pct) < 0 else int(score_pct)
            if sc is not None and sc > 100:
                raise ToolError("Το score_pct είναι 0-100 ή -1.")
            try:
                cites_v = _parse_cites(cites)
            except CasefileError as e:
                raise ToolError(str(e))
            summary = f"student={sid[:8]}… {occurred_on} {kind} {sortie or ''}".strip()
            gate("casefile_add_case", True, summary)

            def go():
                payload = {
                    "p_actor": actor, "p_student_id": sid, "p_occurred_on": occurred_on, "p_kind": kind,
                    "p_stage": stage or None, "p_sortie": sortie or None, "p_score_pct": sc,
                    "p_consequence": consequence.strip(), "p_cites": cites_v, "p_note": note.strip(),
                }
                preview = (f"ΝΕΑ ΥΠΟΘΕΣΗ · μαθητής {sid} · {occurred_on} · {kind}"
                           + (f" · {stage}" if stage else "") + (f" · {sortie}" if sortie else "")
                           + (f" · {sc}%" if sc is not None else "")
                           + f"\n  συνέπεια: {consequence.strip()}\n  σημείωση: {note.strip()}"
                           + (f"\n  παραπομπές: {json.dumps(cites_v, ensure_ascii=False)}" if cites_v else ""))
                return budget.stage_write("casefile_add_case", payload, preview, {"student_id": sid})
            return run("casefile_add_case", summary, go)

        def casefile_update_case(case_id: str, consequence: str = "", note: str = "", status: str = "",
                                 cites: str = "", withdraw: bool = False) -> str:
            """ΑΛΛΑΖΕΙ υπάρχουσα υπόθεση (συνέπεια, σημείωση, κατάσταση, παραπομπές) ή την ΑΝΑΚΑΛΕΙ. ΜΟΝΟ όταν ο ιδιοκτήτης το ζήτησε ρητά. Διαγραφή δεν υπάρχει: withdraw=true σημαίνει ανάκληση και το κείμενο επιζεί στο log. Κενά πεδία μένουν ως έχουν.

            Args:
                case_id: Το uuid της υπόθεσης από casefile_list_cases.
                consequence: Νέα συνέπεια, ή κενό για να μείνει ως έχει.
                note: Νέα/συμπληρωματική σημείωση, ή κενό.
                status: open ή closed, ή κενό.
                cites: Νέες παραπομπές ως JSON λίστα, ή κενό.
                withdraw: true = ανάκληση της υπόθεσης (μόνο με ρητή εντολή του ιδιοκτήτη).
            """
            cid = (case_id or "").strip().lower()
            if not UUID_RE.match(cid):
                raise ToolError("Το case_id πρέπει να είναι uuid από casefile_list_cases.")
            if status and status not in ("open", "closed"):
                raise ToolError("Το status είναι open ή closed (η ανάκληση γίνεται με withdraw=true).")
            if not any([consequence.strip(), note.strip(), status, cites.strip(), withdraw]):
                raise ToolError("Δεν δόθηκε καμία αλλαγή.")
            try:
                cites_v = _parse_cites(cites) if cites.strip() else None
            except CasefileError as e:
                raise ToolError(str(e))
            summary = f"case={cid[:8]}… " + ("WITHDRAW" if withdraw else ",".join(
                k for k, v in (("consequence", consequence.strip()), ("note", note.strip()), ("status", status), ("cites", cites.strip())) if v))
            gate("casefile_update_case", True, summary)

            def go():
                # null = αμετάβλητο: η fn_update_case κάνει coalesce(p_x, x) σε κάθε πεδίο.
                payload = {
                    "p_actor": actor, "p_case_id": cid,
                    "p_consequence": consequence.strip() or None, "p_note": note.strip() or None,
                    "p_status": status or None, "p_cites": cites_v, "p_withdraw": bool(withdraw),
                }
                what = "ΑΝΑΚΛΗΣΗ" if withdraw else "ΕΝΗΜΕΡΩΣΗ"
                preview = (f"{what} ΥΠΟΘΕΣΗΣ {cid}"
                           + (f"\n  συνέπεια → {consequence.strip()}" if consequence.strip() else "")
                           + (f"\n  σημείωση → {note.strip()}" if note.strip() else "")
                           + (f"\n  status → {status}" if status else "")
                           + (f"\n  παραπομπές → {json.dumps(cites_v, ensure_ascii=False)}" if cites_v else "")
                           + ("\n  (τα υπόλοιπα πεδία μένουν ως έχουν)"))
                return budget.stage_write("casefile_update_case", payload, preview, {"case_id": cid})
            return run("casefile_update_case", summary, go)

        fns = {"casefile_find_student": casefile_find_student, "casefile_list_cases": casefile_list_cases,
               "casefile_add_case": casefile_add_case, "casefile_update_case": casefile_update_case}
        return [beta_tool(fns[n], name=n) for n in CASEFILE_TOOLS if n in names]

    def stage_write(self, tool: str, payload: dict, preview: str, meta: dict) -> str:
        """R-A: ΔΕΝ γράφει. Κρατά την εγγραφή ως εκκρεμή με token μίας χρήσης,
        δεμένο με αυτή τη συνεδρία, και λέει στο μοντέλο ότι ο ιδιοκτήτης
        αποφασίζει στη σελίδα. Χωρίς συνεδρία δεν υπάρχει πού να δεθεί — άρνηση."""
        from anthropic.lib.tools import ToolError
        if not self.session_id:
            raise ToolError("Οι εγγραφές στον φάκελο γίνονται μόνο μέσα σε αποθηκευμένη συνεδρία της σελίδας.")
        rec = pending_create(self.agent_id, self.session_id, tool, payload, preview, meta)
        self.last_pending = rec
        return (f"ΠΡΟΕΠΙΣΚΟΠΗΣΗ — ΔΕΝ ΓΡΑΦΤΗΚΕ ΑΚΟΜΑ. Η εγγραφή είναι εκκρεμής και ο ιδιοκτήτης "
                f"θα τη δει στη σελίδα με τα κουμπιά «Γράψ' το» / «Άκυρο»· γράφεται ΜΟΝΟ αν πατήσει "
                f"«Γράψ' το» (λήγει σε {int(CFG['confirm_ttl']) // 60} λεπτά).\n{preview}\n"
                f"Στην απάντησή σου πες του ρητά ότι η εγγραφή ΠΕΡΙΜΕΝΕΙ την επιβεβαίωσή του, και τι "
                f"ακριβώς θα γραφτεί. Μην πεις ότι γράφτηκε.")

    def record_cf(self, tool: str, summary: str, status: str, result: str | None = None):
        entry = {"n": self.cf_calls, "tool": tool, "summary": summary, "status": status,
                 "write": tool in ("casefile_add_case", "casefile_update_case")}
        if entry["write"] and status == "ok" and getattr(self, "last_pending", None):
            p = self.last_pending
            self.last_pending = None
            entry.update({"pending": True, "token": p["token"], "preview": p["preview"],
                          "expires": int(p["expires"]), "meta": p["meta"]})
        self.log.append(entry)
        if tool in COMPOSER_TOOLS:
            log(f"[tool] {tool} call={self.calls}/{CFG['tool_max_calls']} {summary} status={status}")
        else:
            log(f"[casefile] {tool} call={self.cf_calls}/{CFG['casefile_max_calls']} "
                f"writes={self.cf_writes}/{CFG['casefile_max_writes']} {summary} status={status}")
        if self.emit:
            self.emit({"type": "tool_result", **entry})

    # ── search_sources + fetch_source — το ζευγάρι ────────────────────────
    def make_search_tools(self) -> list:
        from anthropic import beta_tool
        from anthropic.lib.tools import ToolError
        budget = self
        max_calls = int(CFG["tool_max_calls"])
        per_call = int(CFG["tool_max_chars"])
        total_cap = int(CFG["tool_total_chars"])
        max_fetches = int(CFG["fetch_max_calls"])
        per_fetch = int(CFG["fetch_max_chars"])

        def search_sources(query: str, source: str, max_hits: int = 8) -> str:
            """Αναζήτηση λέξεων-κλειδιών ΕΚΤΟΣ του corpus, σε λίστα επιτρεπόμενων πηγών — ΒΡΙΣΚΕΙ, δεν παραθέτει. Κάθε εύρημα γυρίζει με απόσπασμα κομμένο σε όριο πρότασης/παραγράφου (ποτέ μέσα σε λέξη), με το πόσοι χαρακτήρες παραλείπονται πριν και μετά, και με ΛΑΒΗ για το fetch_source που φέρνει το πλήρες. Το corpus είναι η πρώτη στάση· κάλεσε το εργαλείο όταν ο ιδιοκτήτης ζητά αναζήτηση ή διασταύρωση, όταν το corpus σιωπά, όταν κρατά παραπομπή χωρίς αυτολεξεί κείμενο, ή πριν ονομάσεις κάτι ⚠ ΑΛΥΤΟ — όχι από συνήθεια σε κάθε ερώτηση. Η ελληνική κλίση δεν μετρά («δοκιμή» βρίσκει και «δοκιμές»). Ό,τι επιστρέφει με «ΑΚΑΤΕΡΓΑΣΤΟ ΚΕΙΜΕΝΟ ΠΗΓΗΣ» είναι ανεπικύρωτη εξαγωγή PDF και πρέπει να παρατεθεί με αυτόν τον χαρακτηρισμό.

            Args:
                query: Λέξεις-κλειδιά (ελληνικά ή αγγλικά, 1-5 λέξεις — όχι ολόκληρη πρόταση). Ο τονισμός, η πεζότητα και η πτώση δεν μετρούν.
                source: Το id της πηγής: context-full, 3-01, pd-29-2020, syllabus, criteria, technique, mif, requirements. Τίποτα άλλο δεν επιτρέπεται.
                max_hits: Πόσα ευρήματα να επιστραφούν (1-20, προεπιλογή 8).
            """
            budget.calls += 1
            if budget.calls > max_calls:
                msg = (f"ΟΡΙΟ: επιτρέπονται {max_calls} αναζητήσεις ανά απάντηση και τις "
                       f"εξάντλησες. Απάντησε ΤΩΡΑ με όσα έχεις και πες ρητά ότι σταμάτησες.")
                budget.record(query, source, None, 0, "limit")
                raise ToolError(msg)
            if budget.chars >= total_cap:
                budget.record(query, source, None, 0, "limit")
                raise ToolError(f"ΟΡΙΟ: εξαντλήθηκαν οι {total_cap} χαρακτήρες ευρημάτων ανά "
                                f"απάντηση. Απάντησε με όσα έχεις.")
            room = min(per_call, total_cap - budget.chars)
            try:
                text, n = search_sources_impl(query, source, max_hits, room)
            except PathRefused as e:
                budget.record(query, source, None, 0, "refused")
                raise ToolError(str(e))
            except Exception as e:  # ένα σπασμένο αρχείο δεν ρίχνει τον proxy
                budget.record(query, source, None, 0, "error")
                raise ToolError(f"Σφάλμα ανάγνωσης πηγής: {type(e).__name__}: {e}")
            budget.chars += len(text)
            budget.record(query, source, n, len(text), "ok")
            return text

        def fetch_source(handle: str, part: int = 1) -> str:
            """Φέρνει ΟΛΟΚΛΗΡΗ τη μονάδα που δείχνει μια λαβή του search_sources — το εδάφιο «### [id]» του corpus, το JSON αντικείμενο, ή τη σελίδα PDF — αυτολεξεί και χωρίς αποκοπή. Κάλεσέ το ΠΡΙΝ παραθέσεις οτιδήποτε από αναζήτηση: ποτέ δεν παραθέτεις κομμένο απόσπασμα σαν να ήταν ολόκληρο. Αν η μονάδα ξεπερνά το όριο χαρακτήρων, επιστρέφει ΑΡΙΘΜΗΜΕΝΟ ΜΕΡΟΣ k/N (κομμένο σε όριο παραγράφου) και το λέει — ζήτα το επόμενο με part. Ό,τι είναι από PDF φέρει τον χαρακτηρισμό ΑΚΑΤΕΡΓΑΣΤΟ. Ισχύει η ίδια λίστα πηγών με το search_sources.

            Args:
                handle: Η λαβή όπως την έδωσε το search_sources, π.χ. «context-full#fail-24», «3-01#p54», «3-01#p54-55», «data/criteria/contact.json#contact-36». Μορφή <πηγή>#<εντοπιστής>· μην την επινοήσεις.
                part: Ποιο μέρος (προεπιλογή 1 = το πρώτο, ή ολόκληρο όταν χωρά). Μόνο όταν η προηγούμενη απάντηση είπε «ΜΕΡΟΣ k/N».
            """
            budget.fetches += 1
            if budget.fetches > max_fetches:
                budget.record_fetch(handle, part, None, 0, "limit")
                raise ToolError(f"ΟΡΙΟ: επιτρέπονται {max_fetches} ανακτήσεις ανά απάντηση και τις "
                                f"εξάντλησες. Απάντησε ΤΩΡΑ με όσα έχεις και πες ρητά ότι σταμάτησες.")
            if budget.chars >= total_cap:
                budget.record_fetch(handle, part, None, 0, "limit")
                raise ToolError(f"ΟΡΙΟ: εξαντλήθηκαν οι {total_cap:,} χαρακτήρες κειμένου πηγών ανά "
                                f"απάντηση. Απάντησε με όσα έχεις.")
            try:
                # Τα μέρη υπολογίζονται ΠΑΝΤΑ με το ίδιο per_fetch, ώστε «ΜΕΡΟΣ 2/3» να
                # σημαίνει το ίδιο σε κάθε κλήση· αν το μέρος δεν χωρά στο υπόλοιπο του
                # ορίου ανά απάντηση, ΑΡΝΗΣΗ με αριθμούς — όχι μικρότερο, σιωπηλά κομμένο μέρος.
                text, meta = fetch_source_impl(handle, part, per_fetch)
            except PathRefused as e:
                budget.record_fetch(handle, part, None, 0, "refused")
                raise ToolError(str(e))
            except Exception as e:  # ένα σπασμένο αρχείο δεν ρίχνει τον proxy
                budget.record_fetch(handle, part, None, 0, "error")
                raise ToolError(f"Σφάλμα ανάγνωσης πηγής: {type(e).__name__}: {e}")
            if budget.chars + len(text) > total_cap:
                budget.record_fetch(handle, part, meta, 0, "limit")
                raise ToolError(f"ΟΡΙΟ: η μονάδα «{meta['handle']}» έχει {len(text):,} χαρακτήρες αλλά "
                                f"απομένουν μόνο {total_cap - budget.chars:,} από τους {total_cap:,} ανά "
                                f"απάντηση. Δεν επιστρέφεται κομμένη. Απάντησε με όσα έχεις και πες ότι "
                                f"το εδάφιο δεν ανακτήθηκε.")
            budget.chars += len(text)
            budget.record_fetch(handle, part, meta, len(text), "ok")
            return text

        return [beta_tool(search_sources, name="search_sources"), beta_tool(fetch_source, name="fetch_source")]

    def record(self, query, source, hits, chars, status):
        entry = {"n": self.calls, "tool": "search_sources", "query": query, "source": source,
                 "hits": hits, "chars": chars, "status": status, "write": False}
        self.log.append(entry)
        log(f"[tool] search_sources call={self.calls}/{CFG['tool_max_calls']} source={source!r} "
            f"q={query!r} hits={hits} chars={chars} status={status}")
        if self.emit:
            self.emit({"type": "tool_result", **entry})

    def record_fetch(self, handle, part, meta, chars, status):
        """Το ημερολόγιο της ανάκτησης: λαβή, μέρος, πόσο κείμενο, ολόκληρο ή όχι.
        Το `summary` είναι ό,τι δείχνει η σελίδα στο γενικό κλαδί 🗂 (app/advisor.js)."""
        m = meta or {}
        summary = (f"{m.get('handle') or handle}" + (f" · μέρος {m['part']}/{m['parts']}" if m.get("parts", 1) > 1 else "")
                   + (f" · {m['chars']:,} χαρ." if m.get("chars") else "")
                   + (" · ολόκληρο" if m.get("complete") else "") + (" · ΑΚΑΤΕΡΓΑΣΤΟ" if m.get("raw") else ""))
        entry = {"n": self.fetches, "tool": "fetch_source", "handle": handle, "part": part,
                 "chars": chars, "status": status, "write": False, "summary": summary,
                 "complete": bool(m.get("complete")), "raw": bool(m.get("raw"))}
        self.log.append(entry)
        log(f"[tool] fetch_source call={self.fetches}/{CFG['fetch_max_calls']} handle={handle!r} part={part} "
            f"chars={chars} status={status}")
        if self.emit:
            self.emit({"type": "tool_result", **entry})


# ════════════════════════════════════════════════════════════════════════════
# Η ΚΛΗΣΗ — streaming, με ή χωρίς εργαλείο, usage ανά γύρο
# ════════════════════════════════════════════════════════════════════════════

def request_params(a: dict, system: list[dict], messages: list[dict]) -> dict:
    """ΤΟ ΤΕΤΑΡΤΟ BREAKPOINT — ΚΥΛΙΟΜΕΝΟ (20/10/2026).

    ΤΟ ΜΕΤΡΗΜΕΝΟ ΠΡΟΒΛΗΜΑ. Τα τρία ρητά breakpoints (corpus, σώμα, τελευταίο
    μήνυμα χρήστη) μπαίνουν ΠΡΙΝ τον βρόχο των εργαλείων. Ό,τι προσθέτει ο
    βρόχος — tool_use και tool_result — πέφτει ΜΕΤΑ από αυτά, άρα ΔΕΝ είναι στο
    cache: κάθε επανάληψη ξαναστέλνει ΟΛΑ τα προηγούμενα αποτελέσματα ως φρέσκια
    είσοδο. Από το ΔΙΚΟ ΜΑΣ log της 20/10 (agent=remarks, μία ερώτηση):

        iter=1 in=4      iter=2 in=5.498   iter=3 in=10.229   iter=4 in=17.642
        DONE iters=4 in=33.373

    Η φρέσκια είσοδος μεγαλώνει ΤΕΤΡΑΓΩΝΙΚΑ με τις επαναλήψεις. Στους 5 γύρους
    το σύνολο ήταν 76.969 tokens. Στους 20, με τον ίδιο ρυθμό, θα ξεπερνούσε το
    ΕΝΑ ΕΚΑΤΟΜΜΥΡΙΟ φρέσκα tokens για ΜΙΑ ερώτηση — δεκαπλάσιο κόστος για να
    διαβάσει τα ίδια αποσπάσματα ξανά και ξανά.

    Η ΘΕΡΑΠΕΙΑ. Το top-level `cache_control` βάζει μόνο του δείκτη στο ΤΕΛΕΥΤΑΙΟ
    μπλοκ του αιτήματος και τον ΜΕΤΑΚΙΝΕΙ μπροστά όσο μεγαλώνει η συζήτηση: κάθε
    επανάληψη διαβάζει από το cache ό,τι έγραψε η προηγούμενη και πληρώνει ως
    φρέσκο ΜΟΝΟ το νέο αποτέλεσμα. Τετραγωνικό → γραμμικό.

    ΓΙΑΤΙ ΧΩΡΙΣ ttl. Ο αυτόματος δείκτης είναι 5 λεπτών, και ΠΡΕΠΕΙ να είναι:
    (α) ο βρόχος ζει δευτερόλεπτα, (β) ο κανόνας σειράς θέλει τα μεγάλα TTL
    πρώτα — 1 ώρα για το corpus, 5 λεπτά για την ουρά· το ανάποδο θα έσπαγε,
    (γ) στην πρώτη επανάληψη το τελευταίο μπλοκ είναι το μήνυμα του χρήστη, που
    έχει ΗΔΗ ρητό δείκτη 5 λεπτών: ίδιο TTL σημαίνει no-op, ΔΙΑΦΟΡΕΤΙΚΟ θα ήταν
    400. Τέσσερα breakpoints συνολικά — ακριβώς στο όριο του API.
    """
    return {
        "model": a["model"],
        "max_tokens": int(a["max_tokens"]),
        "system": system,
        "messages": messages,
        "thinking": {"type": "adaptive"},
        "output_config": {"effort": a["effort"]},
        "cache_control": {"type": "ephemeral"},
    }


def _usage_dict(u) -> dict:
    g = (lambda k: int(getattr(u, k, 0) or 0)) if u is not None else (lambda k: 0)
    return {k: g(k) for k in ("input_tokens", "cache_creation_input_tokens",
                              "cache_read_input_tokens", "output_tokens")}


def run_ask(a: dict, params: dict, emit, budget: ToolBudget | None, tools: list[str] = ()) -> dict:
    """Τρέχει την κλήση και στέλνει events μέσω emit(). Επιστρέφει
    {"text", "stop_reason", "usage", "iterations"}. Σηκώνει anthropic.* σφάλματα."""
    import anthropic
    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"], max_retries=2)
    totals = {"input_tokens": 0, "cache_creation_input_tokens": 0,
              "cache_read_input_tokens": 0, "output_tokens": 0}
    pieces: list[str] = []
    stop = None
    iterations = 0
    t0 = time.time()

    def consume(stream):
        nonlocal stop
        for ev in stream:
            if ev.type == "text":
                pieces.append(ev.text)
                emit({"type": "text", "text": ev.text})
        final = stream.get_final_message()
        stop = final.stop_reason
        u = _usage_dict(final.usage)
        for k in totals:
            totals[k] += u[k]
        for b in final.content:
            if getattr(b, "type", "") == "tool_use":
                emit({"type": "tool_call", "name": b.name, "input": b.input})
        log(f"[ask] agent={a['id']} iter={iterations} in={u['input_tokens']} "
            f"cache_w={u['cache_creation_input_tokens']} cache_r={u['cache_read_input_tokens']} "
            f"out={u['output_tokens']} stop={stop}")
        return final

    if budget is not None and tools:
        runner = client.beta.messages.tool_runner(
            tools=budget.make_tools(list(tools)), stream=True,
            # σκληρό backstop πίσω από τα ToolError των φρένων
            max_iterations=int(CFG["tool_max_calls"]) + int(CFG["fetch_max_calls"]) + int(CFG["casefile_max_calls"]) + 3,
            **params,
        )
        for stream in runner:          # ο runner ανοίγει/κλείνει το stream· εμείς το καταναλώνουμε
            iterations += 1
            consume(stream)
    else:
        iterations = 1
        with client.messages.stream(**params) as stream:
            consume(stream)

    text = "".join(pieces)
    dt_s = time.time() - t0
    log(f"[ask] agent={a['id']} DONE iters={iterations} in={totals['input_tokens']} "
        f"cache_w={totals['cache_creation_input_tokens']} cache_r={totals['cache_read_input_tokens']} "
        f"out={totals['output_tokens']} stop={stop} {dt_s:.1f}s")
    return {"text": text, "stop_reason": stop, "usage": totals, "iterations": iterations}


# ════════════════════════════════════════════════════════════════════════════
# COMPACTION (R-B.2) — το ιστορικό γίνεται δομημένη σύνοψη· το corpus δεν κουνιέται
# ════════════════════════════════════════════════════════════════════════════

COMPACT_PROMPT = (
    "[ΕΝΤΟΛΗ ΤΟΥ PROXY — COMPACTION]\n"
    "Το ιστορικό μεγάλωσε. Ξαναγράψε ΟΛΗ τη μέχρι τώρα συζήτηση ως δομημένη σύνοψη, ΑΚΡΙΒΩΣ με "
    "αυτό το σχήμα και τίποτα άλλο — καμία εισαγωγή, καμία απάντηση σε νέα ερώτηση:\n\n"
    "# ΣΥΝΟΨΗ ΣΥΝΕΔΡΙΑΣ\n"
    "## ΜΑΘΗΤΗΣ ΚΑΙ ΕΡΩΤΗΜΑ\n"
    "(ποιος, ποιο Στάδιο/έξοδος, τι ρωτήθηκε — με τα λόγια του ιδιοκτήτη όπου μετρούν)\n"
    "## ΤΙ ΕΧΕΙ ΤΕΚΜΗΡΙΩΘΕΙ\n"
    "(μία γραμμή ανά συμπέρασμα· ΚΑΘΕ γραμμή με το [id] και την παραπομπή της· τα αυτολεξεί "
    "παραθέματα που χρησιμοποιήθηκαν μένουν αυτολεξεί· ό,τι ήταν «ΑΚΑΤΕΡΓΑΣΤΟ ΚΕΙΜΕΝΟ ΠΗΓΗΣ» "
    "μένει σημειωμένο έτσι· οι ✓ ΑΠΟΦΑΝΣΕΙΣ μένουν με τα λόγια του ιδιοκτήτη)\n"
    "## ΤΙ ΜΕΝΕΙ ΑΝΟΙΧΤΟ\n"
    "(ερωτήσεις σου που δεν απαντήθηκαν, ⚠ ΑΛΥΤΑ, αποφάσεις που περιμένουν τον ιδιοκτήτη, "
    "εγγραφές που περιμένουν «Γράψ' το»)\n"
    "## ΤΙ ΓΡΑΦΤΗΚΕ ΣΤΟΝ ΦΑΚΕΛΟ\n"
    "(γράψε ΜΟΝΟ: «— το συμπληρώνει ο proxy από το αρχείο της συνεδρίας —»)\n\n"
    "Χωρίς παραπομπή, ένα συμπέρασμα ΔΕΝ μπαίνει στη σύνοψη."
)
SUMMARY_HEAD = "[ΣΥΝΟΨΗ ΤΗΣ ΜΕΧΡΙ ΤΩΡΑ ΣΥΖΗΤΗΣΗΣ — μετά από compaction· οι παραπομπές της ισχύουν]\n"
SUMMARY_ACK = "Έλαβα τη σύνοψη· συνεχίζω από αυτή, με τις παραπομπές της."


def compaction_params(a: dict, system: list[dict], s: dict, tool_dicts: list[dict]) -> dict:
    """ΙΔΙΟ tools + ΙΔΙΟ system με το /ask (ίδιο md5 προθέματος → το corpus
    διαβάζεται από το cache) και tool_choice none: η σύνοψη δεν ψάχνει."""
    p = {
        "model": a["model"], "max_tokens": 6000, "system": system,
        "messages": api_messages(s, COMPACT_PROMPT),
        "thinking": {"type": "adaptive"}, "output_config": {"effort": a["effort"]},
    }
    if tool_dicts:
        p["tools"] = tool_dicts
        p["tool_choice"] = {"type": "none"}
    return p


def writes_section(s: dict) -> str:
    """Η ενότητα «ΤΙ ΓΡΑΦΤΗΚΕ» από το ΑΡΧΕΙΟ της συνεδρίας — αυθεντικό, όχι μνήμη μοντέλου."""
    ws = s.get("writes") or []
    if not ws:
        return "## ΤΙ ΓΡΑΦΤΗΚΕ ΣΤΟΝ ΦΑΚΕΛΟ\n(τίποτα — καμία επιβεβαιωμένη εγγραφή σε αυτή τη συνεδρία)"
    lines = [f"- {w['at']} · {w['tool']} · case {w.get('case_id')} · {(w.get('preview') or '').splitlines()[0]}" for w in ws]
    return "## ΤΙ ΓΡΑΦΤΗΚΕ ΣΤΟΝ ΦΑΚΕΛΟ (από το αρχείο της συνεδρίας)\n" + "\n".join(lines)


def apply_brief(s: dict, brief: str, usage: dict | None = None) -> dict:
    """Αντικαθιστά τα messages με τη σύνοψη (+ τα τελευταία compact_keep ζεύγη
    αυτούσια). Μόνο messages — το system δεν αγγίζεται εδώ ούτε πουθενά."""
    i = brief.find("## ΤΙ ΓΡΑΦΤΗΚΕ")
    body = (brief[:i] if i >= 0 else brief).rstrip() + "\n\n" + writes_section(s)
    msgs = s["messages"]
    before = history_chars(msgs)
    tail: list[dict] = []
    j, pairs = len(msgs), 0
    while pairs < int(CFG["compact_keep"]) and j >= 2 and msgs[j - 1]["role"] == "assistant" \
            and msgs[j - 2]["role"] == "user" and not msgs[j - 2].get("kind"):
        tail = msgs[j - 2:j] + tail
        j -= 2
        pairs += 1
    s["messages"] = [
        {"role": "user", "content": SUMMARY_HEAD + body, "kind": "summary", "at": _now()},
        {"role": "assistant", "content": SUMMARY_ACK, "kind": "summary", "at": _now()},
    ] + tail
    s["compactions"] = int(s.get("compactions") or 0) + 1
    ev = {"at": _now(), "type": "compaction", "n": s["compactions"], "chars_before": before,
          "chars_after": history_chars(s["messages"]), "kept_pairs": pairs, "usage": usage}
    s["events"].append(ev)
    return ev


def run_compaction(a: dict, s: dict, system: list[dict], tool_dicts: list[dict]) -> dict:
    """Η μία κλήση του compaction. Σηκώνει anthropic.* σφάλματα."""
    import anthropic
    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"], max_retries=2)
    p = compaction_params(a, system, s, tool_dicts)
    api = client.beta.messages if tool_dicts else client.messages
    with api.stream(**p) as stream:
        text = "".join(stream.text_stream)
        final = stream.get_final_message()
    u = _usage_dict(final.usage)
    log(f"[compact] agent={a['id']} session={s['id']} in={u['input_tokens']} cache_w={u['cache_creation_input_tokens']} "
        f"cache_r={u['cache_read_input_tokens']} out={u['output_tokens']} stop={final.stop_reason}")
    if not text.strip() or final.stop_reason == "refusal":
        raise RuntimeError("η σύνοψη ήρθε κενή")
    return apply_brief(s, text, u)


# ════════════════════════════════════════════════════════════════════════════
# KEEP-ALIVE (F3) — μία ανάγνωση του cache λίγο πριν λήξει, αντί για εγγραφή
# ════════════════════════════════════════════════════════════════════════════

KEEPALIVE: dict[str, dict] = {}     # agent id → snapshot του προθέματος + χρόνοι
KEEPALIVE_MARGIN = {"1h": 600, "5m": 60}   # πόσο ΠΡΙΝ τη λήξη στέλνεται το ping


def keepalive_params(snap: dict) -> dict:
    """ΙΔΙΟ model/system/tools/thinking/effort με το /ask (το effort και το
    thinking αποδίδονται στο prompt — αλλιώς το ping θερμαίνει άλλο κλειδί),
    max_tokens 0, ένα μήνυμα ΧΩΡΙΣ cache_control (τίποτα να γραφτεί), χωρίς stream."""
    p = {"model": snap["model"], "max_tokens": 0, "system": snap["system"],
         "messages": [{"role": "user", "content": "keep-alive"}],
         "thinking": {"type": "adaptive"}, "output_config": {"effort": snap["effort"]}}
    if snap.get("tools"):
        p["tools"] = snap["tools"]
    return p


def keepalive_register(a: dict, system: list[dict], tool_dicts: list[dict]) -> None:
    """Μετά από κάθε επιτυχημένη κλήση: αυτό είναι το πρόθεμα που ζει στο cache."""
    with LOCK:
        snap = KEEPALIVE.get(a["id"]) or {"pings": 0, "failures": 0, "last_error": None, "last_read": None, "disabled": False}
        snap.update({"model": a["model"], "effort": a["effort"], "system": system, "tools": tool_dicts,
                     "prefix": prefix_digest(system), "last_ask": time.time(), "last_touch": time.time()})
        if snap.get("prefix_was") != snap["prefix"]:
            snap["failures"], snap["disabled"], snap["prefix_was"] = 0, False, snap["prefix"]
        KEEPALIVE[a["id"]] = snap


def keepalive_ping(agent_id: str, snap: dict) -> None:
    import anthropic
    if not os.environ.get("ANTHROPIC_API_KEY"):
        return
    ok, state = take_daily_slot()
    if not ok:
        log(f"[keepalive] agent={agent_id} παραλείπεται: ημερήσιο όριο ({state['count']}/{CFG['daily_cap']})")
        snap["last_touch"] = time.time()          # μην ξαναδοκιμάσεις κάθε 30″
        return
    params = keepalive_params(snap)
    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"], max_retries=1)
    api = client.beta.messages if params.get("tools") else client.messages
    try:
        r = api.create(**params)
    except anthropic.BadRequestError as e:
        snap["failures"] += 1
        snap["last_error"] = f"400: {e.message}"
        log(f"[keepalive] agent={agent_id} ΑΠΟΡΡΙΦΘΗΚΕ από το API ({snap['failures']}/2): {e.message}")
        if snap["failures"] >= 2:
            snap["disabled"] = True
            log(f"[keepalive] agent={agent_id} ΣΤΑΜΑΤΑ — το max_tokens:0 δεν γίνεται δεκτό με αυτό το αίτημα. "
                f"Δες /health.keepalive.agents.{agent_id}.last_error. Το corpus θα ξαναγράφεται στη λήξη του TTL.")
        snap["last_touch"] = time.time()
        return
    except (anthropic.APIStatusError, anthropic.APIConnectionError) as e:
        snap["last_error"] = f"{type(e).__name__}: {getattr(e, 'message', e)}"
        log(f"[keepalive] agent={agent_id} σφάλμα δικτύου/API: {snap['last_error']} — ξανά στον επόμενο κύκλο")
        snap["last_touch"] = time.time() - (int(CFG["cache_ttl"] == "1h") * 3000 or 200)   # ξαναδοκίμασε σύντομα
        return
    u = _usage_dict(r.usage)
    add_usage(u, 0)
    snap.update({"pings": snap["pings"] + 1, "last_touch": time.time(), "last_read": u["cache_read_input_tokens"],
                 "failures": 0, "last_error": None})
    warn = "" if u["cache_read_input_tokens"] > 0 else "  ⚠ cache_read=0 — το πρόθεμα ΔΕΝ ήταν στο cache (ξαναγράφτηκε)"
    log(f"[keepalive] agent={agent_id} ping #{snap['pings']} cache_r={u['cache_read_input_tokens']} "
        f"cache_w={u['cache_creation_input_tokens']} in={u['input_tokens']} stop={r.stop_reason}{warn}")


def keepalive_loop() -> None:
    ttl_s = 3600 if CFG["cache_ttl"] == "1h" else 300
    due_after = ttl_s - KEEPALIVE_MARGIN.get(CFG["cache_ttl"], 600)
    idle_s = int(CFG["keepalive_idle_h"]) * 3600
    while True:
        time.sleep(30)
        try:
            now = time.time()
            for agent_id, snap in list(KEEPALIVE.items()):
                if snap.get("disabled") or now - snap["last_ask"] > idle_s:
                    continue
                if now - snap["last_touch"] >= due_after:
                    keepalive_ping(agent_id, snap)
        except Exception as e:          # το νήμα δεν πεθαίνει ποτέ σιωπηλά
            log(f"[keepalive] UNEXPECTED {type(e).__name__}: {e}")


def keepalive_status() -> dict:
    now = time.time()
    ttl_s = 3600 if CFG["cache_ttl"] == "1h" else 300
    due_after = ttl_s - KEEPALIVE_MARGIN.get(CFG["cache_ttl"], 600)
    idle_s = int(CFG["keepalive_idle_h"]) * 3600
    agents = {}
    for k, s in KEEPALIVE.items():
        idle = now - s["last_ask"] > idle_s
        agents[k] = {"pings": s["pings"], "last_read_tokens": s["last_read"], "last_error": s["last_error"],
                     "disabled": s["disabled"], "idle": idle,
                     "seconds_since_ask": int(now - s["last_ask"]),
                     "next_ping_in_s": None if (s["disabled"] or idle) else max(0, int(due_after - (now - s["last_touch"])))}
    return {"enabled": bool(int(CFG["keepalive"])), "idle_hours": int(CFG["keepalive_idle_h"]),
            "ping_after_s": due_after, "cache_ttl": CFG["cache_ttl"], "agents": agents}


# ════════════════════════════════════════════════════════════════════════════
# ΕΞΑΓΩΓΗ (F4) — η συνεδρία ως Markdown που διαβάζει άνθρωπος
# ════════════════════════════════════════════════════════════════════════════

def session_markdown(s: dict) -> str:
    L = [f"# Σύμβουλος FDMS — συζήτηση {s['id']}", "",
         f"- **Agent:** {s['agent']}", f"- **Τίτλος:** {s.get('title') or '(χωρίς τίτλο)'}",
         f"- **Άνοιξε:** {s['created']} · **Τελευταία:** {s['updated']}" + ("  · ΑΡΧΕΙΟΘΕΤΗΜΕΝΗ" if s.get("archived") else "")]
    if s.get("student_label"):
        L.append(f"- **Μαθητής:** {s['student_label']}" + (f" (student_id {s['student_id']})" if s.get("student_id") else ""))
    if s.get("context"):
        L += ["", "## Πλαίσιο περίπτωσης (όπως το έγραψε ο ιδιοκτήτης)", "", s["context"]]
    tot = {"input_tokens": 0, "cache_creation_input_tokens": 0, "cache_read_input_tokens": 0, "output_tokens": 0}
    L += ["", "## Συζήτηση", ""]
    for m in s["messages"]:
        at = (m.get("at") or "")[11:16]
        if m.get("kind") == "summary":
            if m["role"] == "user":
                L += [f"### ♻ Σύνοψη μετά από compaction ({at})", "", m["content"], ""]
            continue
        if m.get("kind") == "seed":
            if m["role"] == "user":
                L += [f"### ⤷ Αφετηρία από τον φάκελο ({at})", "", "```", m["content"], "```", ""]
            continue
        if m["role"] == "user":
            L += [f"### 🧑 Ερώτηση ({at})", "", m["content"], ""]
            continue
        L += [f"### 🤖 Απάντηση ({at})", ""]
        for t in m.get("tools") or []:
            if t.get("tool") == "search_sources":
                L.append(f"- 🔎 `search_sources` · {t.get('source')} · «{t.get('query')}» · {t.get('hits')} ευρήματα · {t.get('status')}")
            elif t.get("tool") == "fetch_source":
                L.append(f"- 📄 `fetch_source` · {t.get('summary') or t.get('handle')} · {t.get('status')}")
            elif t.get("write"):
                st = "✓ ΓΡΑΦΤΗΚΕ case " + str(t.get("case_id")) if t.get("confirmed") else \
                     "✕ ακυρώθηκε" if t.get("cancelled") else "✕ απορρίφθηκε: " + str(t.get("failed")) if t.get("failed") else \
                     "… εκκρεμής (δεν επιβεβαιώθηκε)" if t.get("pending") else str(t.get("status"))
                L.append(f"- ✎ `{t.get('tool')}` · {st}")
                if t.get("preview"):
                    L += ["", "  ```", "  " + str(t["preview"]).replace("\n", "\n  "), "  ```"]
            else:
                L.append(f"- 🗂 `{t.get('tool')}` · {t.get('summary', '')} · {t.get('status')}")
        if m.get("tools"):
            L.append("")
        L += [m["content"], ""]
        u = m.get("usage") or {}
        if u:
            for k in tot:
                tot[k] += int(u.get(k) or 0)
            L.append(f"_usage: in {u.get('input_tokens')} · cache✎ {u.get('cache_creation_input_tokens')} · "
                     f"cache◉ {u.get('cache_read_input_tokens')} · out {u.get('output_tokens')}"
                     + (" · ↻ το corpus ξαναγράφτηκε" if u.get("cache_rewrite") else "") + "_")
            L.append("")
    L += ["## Εγγραφές στον φάκελο", ""]
    if s.get("writes"):
        for w in s["writes"]:
            L += [f"- {w['at']} · `{w['tool']}` · **case {w.get('case_id')}** · actor {w.get('actor')}", "", "  ```",
                  "  " + str(w.get("preview") or "").replace("\n", "\n  "), "  ```"]
    else:
        L.append("(καμία επιβεβαιωμένη εγγραφή)")
    L += ["", "## Συμβάντα", ""]
    for e in s.get("events") or []:
        if e.get("type") == "compaction":
            L.append(f"- {e['at']} · ♻ compaction #{e.get('n')}: {e.get('chars_before'):,} → {e.get('chars_after'):,} χαρακτήρες, {e.get('kept_pairs')} ζεύγος αυτούσιο")
        else:
            L.append(f"- {e['at']} · {e.get('type')}: {e.get('text', '')}")
    if not s.get("events"):
        L.append("(κανένα)")
    L += ["", "## Σύνολα usage (tokens)", "",
          f"input {tot['input_tokens']:,} · cache write {tot['cache_creation_input_tokens']:,} · "
          f"cache read {tot['cache_read_input_tokens']:,} · output {tot['output_tokens']:,}", "",
          "_Εξαγωγή από tools/advisor_proxy.py — η συζήτηση ζει στο tools/advisor/sessions/ του ιδιοκτήτη και πουθενά αλλού._", ""]
    return "\n".join(L)


def _patch_tool_entry(s: dict, token: str, patch: dict) -> None:
    for m in s["messages"]:
        for t in m.get("tools") or []:
            if t.get("token") == token:
                t.update(patch)
                t.pop("token", None)       # το token έφυγε: δεν ξαναχρησιμοποιείται από πουθενά


# ════════════════════════════════════════════════════════════════════════════
# HTTP
# ════════════════════════════════════════════════════════════════════════════

class Handler(BaseHTTPRequestHandler):
    server_version = "FDMSAdvisorProxy/1.0"

    def log_message(self, fmt, *args):   # το δικό μας log, όχι του BaseHTTP
        pass

    # ── CORS: ΜΟΝΟ localhost / 127.0.0.1 (οποιαδήποτε θύρα) και file:// (null) ──
    def _cors(self) -> None:
        origin = self.headers.get("Origin")
        if origin and (origin == "null" or ORIGIN_OK.match(origin)):
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.send_header("Access-Control-Expose-Headers", "Content-Disposition")   # F4: το όνομα αρχείου της λήψης
            self.send_header("Access-Control-Max-Age", "600")

    def _gate(self) -> bool:
        """True = συνέχισε κανονικά. False = η απάντηση έχει ήδη σταλεί.

        Δες το μπλοκ «CLOUDFLARE ACCESS» στην κορυφή: το πρόθεμα της διαδρομής
        λέει από πού ήρθε το αίτημα. Με πρόθεμα → tunnel → απαιτείται JWT. Χωρίς
        → από το ίδιο το μηχάνημα, όπου ο proxy είναι δεμένος μόνο στο loopback.
        """
        self.access_email = ""
        raw = self.path or "/"
        bare = raw.split("?", 1)[0]
        if not (bare == BASE_PATH or bare.startswith(BASE_PATH + "/")):
            return True
        self.path = raw[len(BASE_PATH):] or "/"
        if not access_configured():
            log("ΑΡΝΗΣΗ: αίτημα με πρόθεμα tunnel αλλά η Access δεν είναι ρυθμισμένη.")
            self._json(503, {"code": "access_unconfigured",
                             "error": "Ο proxy δέχεται αιτήματα από το tunnel μόνο με ρυθμισμένη Access "
                                      "(FDMS_ACCESS_TEAM, FDMS_ACCESS_AUD)."})
            return False
        try:
            claims = verify_access(self.headers.get("Cf-Access-Jwt-Assertion", ""))
        except Exception as e:
            log(f"ΑΡΝΗΣΗ Access: {e}")
            self._json(403, {"code": "access_denied", "error": f"Η Cloudflare Access δεν επαλήθευσε: {e}"})
            return False
        self.access_email = str(claims.get("email") or "").strip()
        return True

    def _json(self, code: int, obj: dict) -> None:
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self._cors()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _raw(self, code: int, body: bytes, ctype: str, filename: str) -> None:
        self.send_response(code)
        self._cors()
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        if not self._gate():
            return
        self.send_response(204)
        self._cors()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        if not self._gate():
            return
        from urllib.parse import parse_qs, urlparse
        u = urlparse(self.path)
        path, qs = u.path, parse_qs(u.query)
        q1 = lambda k: (qs.get(k) or [""])[0]
        if path == "/health":
            # ΠΟΙΟΣ ΕΙΣΑΙ, ΚΑΤΑ ΤΗΝ CLOUDFLARE. Το `you` γεμίζει ΜΟΝΟ από το
            # υπογεγραμμένο JWT (η _gate το έβγαλε από τα claims), ποτέ από
            # κάτι που στέλνει η σελίδα. Τοπικά μένει κενό — εκεί ο άνθρωπος
            # είναι ο ιδιοκτήτης στο πληκτρολόγιό του. Υπάρχει για να
            # επαληθεύεται η ταυτότητα ΧΩΡΙΣ να γραφτεί γραμμή στον φάκελο.
            h = health()
            h["access"]["you"] = getattr(self, "access_email", "")
            return self._json(200, h)
        if path == "/agents":
            return self._json(200, {"agents": list_agents()})
        if path == "/sessions":
            agent = q1("agent")
            if not load_agent(agent):
                return self._json(404, {"code": "unknown_agent", "error": f"Άγνωστος agent «{agent}»."})
            return self._json(200, {"agent": agent, "sessions": list_sessions(agent, q1("archived") == "1")})
        m = re.fullmatch(r"/sessions/([0-9a-f]{16})", path)
        if m:
            s = load_session(q1("agent"), m.group(1))
            if not s:
                return self._json(404, {"code": "unknown_session", "error": "Η συνεδρία δεν βρέθηκε."})
            return self._json(200, {"session": s, "summary": session_summary(s)})
        m = re.fullmatch(r"/sessions/([0-9a-f]{16})/export", path)
        if m:
            s = load_session(q1("agent"), m.group(1))
            if not s:
                return self._json(404, {"code": "unknown_session", "error": "Η συνεδρία δεν βρέθηκε."})
            fmt = q1("format") or "md"
            stem = f"advisor-{s['agent']}-{s['created'][:10]}-{s['id']}"
            if fmt == "json":
                return self._raw(200, json.dumps(s, ensure_ascii=False, indent=1).encode("utf-8"),
                                 "application/json; charset=utf-8", stem + ".json")
            return self._raw(200, session_markdown(s).encode("utf-8"), "text/markdown; charset=utf-8", stem + ".md")
        return self._json(404, {"error": "not found", "endpoints": ["/health", "/agents", "/sessions", "/ask", "/confirm"]})

    def _body(self) -> dict | None:
        try:
            n = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            n = 0
        if n <= 0 or n > MAX_BODY_BYTES:
            self._json(413, {"error": f"Το σώμα του αιτήματος πρέπει να είναι 1–{MAX_BODY_BYTES} bytes.", "code": "bad_request"})
            return None
        try:
            req = json.loads(self.rfile.read(n).decode("utf-8"))
            if not isinstance(req, dict):
                raise ValueError
            return req
        except Exception:
            self._json(400, {"error": "Μη έγκυρο JSON.", "code": "bad_request"})
            return None

    def do_POST(self):
        if not self._gate():
            return
        path = self.path.split("?", 1)[0]
        req = self._body()
        if req is None:
            return
        if path == "/ask":
            return self._ask(req)
        if path == "/confirm":
            return self._confirm(req)
        if path == "/sessions":
            return self._session_new(req)
        m = re.fullmatch(r"/sessions/([0-9a-f]{16})/(archive|close)", path)
        if m:
            return self._session_close(req, m.group(1), m.group(2) == "close")
        return self._json(404, {"error": "not found"})

    # ── ΣΥΝΕΔΡΙΕΣ ───────────────────────────────────────────────────────────
    def _session_new(self, req: dict):
        a = load_agent(str(req.get("agent") or ""))
        if not a:
            return self._json(404, {"code": "unknown_agent", "error": "Άγνωστος agent."})
        ctx = req.get("context") or ""
        if not isinstance(ctx, str) or len(ctx) > 4000:
            return self._json(400, {"code": "bad_request", "error": "Το context πρέπει να είναι κείμενο έως 4000 χαρακτήρες."})
        s = new_session(a["id"], context=ctx, title=str(req.get("title") or ""))
        return self._json(200, {"session": s, "summary": session_summary(s)})

    def _session_close(self, req: dict, sid: str, reopen: bool):
        """archive: απλώς κλείνει. close («Έκλεισε η υπόθεση»): κλείνει ΚΑΙ ανοίγει
        νέα, σπαρμένη από τον φάκελο του μαθητή όπως είναι ΤΩΡΑ (R-B.3)."""
        agent = str(req.get("agent") or "")
        s = load_session(agent, sid)
        if not s:
            return self._json(404, {"code": "unknown_session", "error": "Η συνεδρία δεν βρέθηκε."})
        new = None
        if reopen:
            seed, note, label = None, "", s.get("student_label") or ""
            if s.get("student_id") and casefile_configured():
                try:
                    text, label = casefile_cases_text(s["student_id"])
                    seed = [{"role": "user", "content": "[ΑΦΕΤΗΡΙΑ — ο φάκελος του μαθητή όπως είναι ΤΩΡΑ καταγεγραμμένος]\n" + text,
                             "kind": "seed", "at": _now()},
                            {"role": "assistant", "content": "Έλαβα τον φάκελο όπως είναι τώρα καταγεγραμμένος. Ρώτα.",
                             "kind": "seed", "at": _now()}]
                    note = "Νέα συνεδρία με αφετηρία τον φάκελο του μαθητή (ανάγνωση cases_live)."
                except CasefileError as e:
                    note = f"Νέα συνεδρία ΧΩΡΙΣ αφετηρία — ο φάκελος δεν διαβάστηκε: {e}"
            else:
                note = ("Νέα συνεδρία χωρίς αφετηρία: " + ("δεν υπάρχει μαθητής δεμένος στη συνεδρία."
                        if not s.get("student_id") else "ο φάκελος δεν είναι ρυθμισμένος στον proxy."))
            new = new_session(agent, context="", title="", student_id=s.get("student_id"),
                              student_label=label, seed=seed, note=note)
        s["archived"] = True
        s["events"].append({"at": _now(), "type": "archived",
                            "text": "Έκλεισε η υπόθεση → νέα συνεδρία " + new["id"] if new else "Αρχειοθετήθηκε."})
        save_session(s)
        log(f"[session] {'close' if reopen else 'archive'} agent={agent} id={sid}" + (f" → {new['id']}" if new else ""))
        return self._json(200, {"ok": True, "archived": sid, "session": new, "summary": session_summary(new) if new else None})

    # ── Η ΠΥΛΗ ΕΠΙΒΕΒΑΙΩΣΗΣ (R-A) ───────────────────────────────────────────
    def _confirm(self, req: dict):
        agent, sid = str(req.get("agent") or ""), str(req.get("session") or "")
        tok, action = str(req.get("token") or ""), str(req.get("action") or "write")
        a = load_agent(agent)
        s = load_session(agent, sid) if a else None
        if not a or not s:
            return self._json(404, {"code": "unknown_session", "error": "Άγνωστος agent ή συνεδρία."})
        rec = pending_take(tok, agent, sid)
        if not rec:
            return self._json(410, {"code": "token_invalid", "error":
                "Η εκκρεμής εγγραφή δεν ισχύει πια: έληξε, χρησιμοποιήθηκε ήδη, ή ανήκει σε άλλη συνεδρία. "
                "Ζήτα ξανά από τον σύμβουλο να την ετοιμάσει."})
        if action == "cancel":
            _patch_tool_entry(s, tok, {"pending": False, "cancelled": True, "at": _now()})
            save_session(s)
            log(f"[casefile] CANCELLED tool={rec['tool']} session={sid}")
            return self._json(200, {"ok": True, "cancelled": True})
        if not casefile_configured():
            return self._json(503, {"code": "casefile_off", "error": "Ο φάκελος δεν είναι ρυθμισμένος στον proxy."})
        payload, tool = rec["payload"], rec["tool"]
        try:
            if tool == "casefile_add_case":
                cid = str(_cf_request("POST", "rpc/fn_add_case", payload)).strip('"')
                student_id = payload.get("p_student_id")
            else:
                _cf_request("POST", "rpc/fn_update_case", payload)
                cid = payload["p_case_id"]
                student_id = s.get("student_id")
                if not student_id:
                    try:
                        rows = _cf_request("GET", "cases_live", query=f"id=eq.{cid}&select=student_id") or []
                        student_id = rows[0]["student_id"] if rows else None
                    except CasefileError:
                        student_id = None
        except CasefileError as e:
            _patch_tool_entry(s, tok, {"pending": False, "failed": str(e), "at": _now()})
            save_session(s)
            log(f"[casefile] CONFIRM FAILED tool={tool} session={sid}: {e}")
            return self._json(502, {"code": "casefile", "error": f"Ο φάκελος απέρριψε την εγγραφή: {e} "
                                    "(το token καταναλώθηκε — ζήτα ξανά την προετοιμασία)"})
        result = (("ΓΡΑΦΤΗΚΕ" if tool == "casefile_add_case" else ("ΑΝΑΚΛΗΘΗΚΕ" if payload.get("p_withdraw") else "ΕΝΗΜΕΡΩΘΗΚΕ"))
                  + f" · case {cid} · actor {payload['p_actor']} · {_now()}\n{rec['preview']}")
        w = {"at": _now(), "tool": tool, "case_id": cid, "preview": rec["preview"], "actor": payload["p_actor"]}
        s["writes"].append(w)
        if student_id:
            s["student_id"] = student_id
        _patch_tool_entry(s, tok, {"pending": False, "confirmed": True, "case_id": cid, "result": result, "at": _now()})
        save_session(s)
        log(f"[casefile] CONFIRMED tool={tool} case={cid} session={sid} writes={len(s['writes'])}")
        return self._json(200, {"ok": True, "case_id": cid, "result": result, "writes": len(s["writes"]),
                                "student_id": s.get("student_id")})

    def _ask(self, req: dict):
        # ── φρένο 0: το κλειδί ──
        if not os.environ.get("ANTHROPIC_API_KEY"):
            return self._json(503, {"code": "no_key", "error":
                "Δεν έχει οριστεί η μεταβλητή περιβάλλοντος ANTHROPIC_API_KEY στο τερματικό που "
                "τρέχει τον proxy. Όρισέ την (PowerShell: $env:ANTHROPIC_API_KEY = \"...\") και "
                "ξαναξεκίνησε: python tools/advisor_proxy.py"})

        a = load_agent(str(req.get("agent") or ""))
        if not a:
            return self._json(404, {"code": "unknown_agent", "error":
                f"Άγνωστος agent «{req.get('agent')}». Διαθέσιμοι: "
                f"{', '.join(x['id'] for x in list_agents()) or '(κανείς — λείπει ο φάκελος agents/)'}"})

        a["model"] = pick_model(a, req)

        student = req.get("student")
        if student is not None and not isinstance(student, str):
            return self._json(400, {"code": "bad_request", "error": "Το `student` πρέπει να είναι κείμενο."})

        # ── με ΣΥΝΕΔΡΙΑ (η σελίδα): {session, question}· ο proxy κρατά το ιστορικό.
        #    Χωρίς: {messages} stateless, όπως πριν (δοκιμές, curl). ──
        session = None
        question = None
        if req.get("session"):
            session = load_session(a["id"], str(req.get("session")))
            if not session:
                return self._json(404, {"code": "unknown_session", "error": "Η συνεδρία δεν βρέθηκε — άνοιξε νέα."})
            if session.get("archived"):
                return self._json(409, {"code": "session_archived", "error": "Η συνεδρία έχει κλείσει. Άνοιξε νέα."})
            question = req.get("question")
            if not isinstance(question, str) or not question.strip():
                return self._json(400, {"code": "bad_request", "error": "Λείπει η ερώτηση (`question`)."})
            question = question.strip()
            if student and not session.get("context") and not any(not m.get("kind") for m in session["messages"]):
                session["context"] = student.strip()
            messages = api_messages(session, question)
            turns = sum(1 for m in session["messages"] if m["role"] == "user" and not m.get("kind")) + 1
        else:
            messages, err = normalise_messages(req.get("messages"), student or "")
            if err:
                return self._json(400, {"code": "bad_request", "error": err})
            turns = user_turns(messages)

        # ── φρένο 1: γύροι ανά συζήτηση ──
        cap = effective_max_turns(a)
        if turns > cap:
            return self._json(429, {"code": "turn_cap", "turn": turns, "max_turns": cap, "error":
                f"Η συζήτηση έφτασε το όριο των {cap} γύρων. Άνοιξε νέα συζήτηση — "
                f"κάθε γύρος ξαναδιαβάζει όλο το ιστορικό."})

        # ── φρένο 3: corpus ──
        corpus, err = read_corpus(a)
        if err:
            return self._json(413, {"code": "corpus_too_big", "error": err})

        # ── φρένο 2: ημέρα ──
        ok, state = take_daily_slot()
        if not ok:
            return self._json(429, {"code": "daily_cap", "today": state["count"],
                                    "daily_cap": int(CFG["daily_cap"]), "error":
                f"Συμπληρώθηκαν {state['count']} αιτήματα σήμερα (όριο ADVISOR_DAILY_CAP="
                f"{CFG['daily_cap']}). Αύριο ξανά, ή ανέβασε το όριο ρητά."})

        tools = offered_tools(a)
        system = build_system(a, corpus, tools)
        params = request_params(a, system, messages)
        digest = prefix_digest(system)

        # ── SSE ──
        self.send_response(200)
        self._cors()
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Accel-Buffering", "no")
        self.end_headers()

        def emit(obj: dict) -> None:
            try:
                self.wfile.write(("data: " + json.dumps(obj, ensure_ascii=False) + "\n\n").encode("utf-8"))
                self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError, OSError):
                raise ClientGone()

        emit({"type": "start", "agent": a["id"], "turn": turns, "max_turns": cap,
              "today": state["count"], "daily_cap": int(CFG["daily_cap"]), "model": a["model"],
              "tools": tools, "casefile": casefile_configured(),
              "session": session["id"] if session else None})
        budget = ToolBudget(emit, a["id"], session["id"] if session else None,
                            human=getattr(self, "access_email", "")) if tools else None
        try:
            import anthropic
            try:
                # ── R-B.2 / Q1: compaction ΠΡΙΝ τη νέα ερώτηση, όταν το ΣΥΝΟΛΟ
                #    corpus + ιστορικό πλησιάζει το ταβάνι. Μόνο τα messages αλλάζουν. ──
                if session:
                    emit({"type": "tokens", **context_budget(a, system, session, question)})
                if session and context_budget(a, system, session, question)["overflow"]:
                    tool_dicts = [t.to_dict() for t in budget.make_tools(list(tools))] if budget else []
                    ev = run_compaction(a, session, system, tool_dicts)
                    save_session(session)
                    messages = api_messages(session, question)
                    params = request_params(a, system, messages)
                    cb = context_budget(a, system, session, question)
                    emit({"type": "compacted", **{k: v for k, v in ev.items() if k != "usage"},
                          "usage": ev.get("usage"), "tokens": cb, "message": (
                              f"Έγινε compaction #{ev['n']}: το σύνολο πλησίαζε τα {cb['ceiling']:,} tokens — το ιστορικό "
                              f"({ev['chars_before']:,} χαρακτήρες ≈ {est_tokens(ev['chars_before']):,} tokens) έγινε δομημένη "
                              f"σύνοψη ({ev['chars_after']:,} ≈ {est_tokens(ev['chars_after']):,}). Οι παραπομπές και οι εγγραφές κρατήθηκαν.")})
                res = run_ask(a, params, emit, budget, tools)
            except anthropic.AuthenticationError:
                return emit({"type": "error", "code": "auth", "message":
                             "Το API δεν δέχτηκε το κλειδί (401). Έλεγξε την ANTHROPIC_API_KEY."})
            except anthropic.RateLimitError:
                return emit({"type": "error", "code": "rate_limit", "message":
                             "Όριο ρυθμού στο API (429). Περίμενε λίγο και ξαναρώτα."})
            except anthropic.BadRequestError as e:
                return emit({"type": "error", "code": "bad_request", "message": f"Το API απέρριψε το αίτημα (400): {e.message}"})
            except anthropic.APIStatusError as e:
                return emit({"type": "error", "code": "api", "message": f"Σφάλμα API {e.status_code}: {e.message}"})
            except anthropic.APIConnectionError:
                return emit({"type": "error", "code": "network", "message":
                             "Δεν υπάρχει σύνδεση με το API. Έλεγξε το δίκτυο."})

            u = res["usage"]
            # ── Η ΑΠΟΔΕΙΞΗ ΤΟΥ CACHE: δεύτερη κλήση με ίδιο πρόθεμα μέσα στο TTL
            #    πρέπει να ΔΙΑΒΑΣΕΙ. Αν όχι, κάτι σιωπηλό το σπάει — φώναξέ το. ──
            prev = CACHE_WATCH.get(a["id"])
            ttl_s = 3600 if CFG["cache_ttl"] == "1h" else 300
            expected_read = bool(prev and prev["prefix"] == digest and time.time() - prev["ts"] < ttl_s)
            cache_ok = (not expected_read) or u["cache_read_input_tokens"] > 0
            if not cache_ok:
                log(f"[ask] CACHE MISS WARNING agent={a['id']}: ίδιο πρόθεμα μέσα στο TTL, "
                    f"cache_read_input_tokens=0 — ο λογαριασμός πληρώνει ολόκληρο το corpus.")
            CACHE_WATCH[a["id"]] = {"ts": time.time(), "prefix": digest}
            if int(CFG["keepalive"]):
                keepalive_register(a, system, [t.to_dict() for t in budget.make_tools(list(tools))] if budget else [])
            add_usage(u, (budget.calls + budget.cf_calls) if budget else 0)
            usage_ev = {"type": "usage", **u, "iterations": res["iterations"],
                        "tool_calls": budget.calls if budget else 0,
                        "casefile_calls": budget.cf_calls if budget else 0,
                        "casefile_writes": budget.cf_writes if budget else 0,
                        "cache_ok": cache_ok, "expected_cache_read": expected_read,
                        # το corpus ΞΑΝΑΓΡΑΦΤΗΚΕ (π.χ. επιστροφή μετά από ώρες, το 1h έληξε):
                        # αναμενόμενο, αλλά να φαίνεται — όχι να ξαφνιάζει στον λογαριασμό.
                        "cache_rewrite": u["cache_creation_input_tokens"] > max(2000, u["cache_read_input_tokens"])}
            emit(usage_ev)
            if session:
                if not session.get("title"):
                    session["title"] = derive_title(question, a)
                session["messages"].append({"role": "user", "content": question, "at": _now()})
                session["messages"].append({"role": "assistant", "content": res["text"], "at": _now(),
                                            "tools": budget.log if budget else [],
                                            "usage": {k: v for k, v in usage_ev.items() if k != "type"},
                                            "stop_reason": res["stop_reason"]})
                save_session(session)
            if res["stop_reason"] == "refusal":
                emit({"type": "error", "code": "refusal", "message":
                      "Το μοντέλο αρνήθηκε να απαντήσει (stop_reason=refusal)."})
            elif res["stop_reason"] == "max_tokens":
                emit({"type": "notice", "message":
                      f"Η απάντηση κόπηκε στο όριο max_tokens={a['max_tokens']}."})
            emit({"type": "done", "stop_reason": res["stop_reason"], "text": res["text"],
                  "session": session_summary(session) if session else None})
        except ClientGone:
            log(f"[ask] agent={a['id']} ο client έκλεισε τη σύνδεση")
        except Exception as e:  # ποτέ traceback στη σελίδα· στο stderr ναι
            log(f"[ask] UNEXPECTED {type(e).__name__}: {e}")
            try:
                emit({"type": "error", "code": "internal", "message": f"Εσωτερικό σφάλμα proxy: {type(e).__name__}: {e}"})
            except ClientGone:
                pass


class ClientGone(Exception):
    pass


class ProxyServer(ThreadingHTTPServer):
    """allow_reuse_address OFF: on Windows SO_REUSEADDR lets a SECOND proxy bind
    a port that is already bound, and two proxies then race for the same
    requests. A busy port must fail loudly at startup, not share."""
    allow_reuse_address = False
    daemon_threads = True


def health() -> dict:
    state = read_state()
    corpora = {}
    cd = corpus_dir()
    if cd.is_dir():
        for p in sorted(cd.glob("context-*.md")):
            corpora[p.name] = {"bytes": p.stat().st_size, "ok": p.stat().st_size <= int(CFG["max_corpus_bytes"])}
    pdf_lib = None
    for mod in ("fitz", "pypdf"):
        try:
            __import__(mod)
            pdf_lib = mod
            break
        except Exception:
            continue
    try:
        import anthropic
        sdk = anthropic.__version__
    except Exception:
        sdk = None
    return {
        "ok": True,
        "key_present": bool(os.environ.get("ANTHROPIC_API_KEY")),
        "sdk": sdk,
        "agents": list_agents(),
        "corpora": corpora,
        "today": {"day": state["day"], "count": state["count"], "usage": state["usage"],
                  "tool_calls": state.get("tool_calls", 0)},
        "caps": {"max_turns": int(CFG["max_turns"]), "daily_cap": int(CFG["daily_cap"]),
                 "max_corpus_bytes": int(CFG["max_corpus_bytes"]), "cache_ttl": CFG["cache_ttl"],
                 "tool_max_calls": int(CFG["tool_max_calls"]), "tool_max_chars": int(CFG["tool_max_chars"]),
                 "tool_total_chars": int(CFG["tool_total_chars"]),
                 "fetch_max_calls": int(CFG["fetch_max_calls"]), "fetch_max_chars": int(CFG["fetch_max_chars"]),
                 "fetch_max_pages": FETCH_MAX_PAGES, "search_excerpt_chars": int(CFG["search_excerpt_chars"]),
                 "context_ceiling_tokens": int(CFG["context_ceiling"]),
                 "casefile_max_calls": int(CFG["casefile_max_calls"]),
                 "casefile_max_writes": int(CFG["casefile_max_writes"])},
        # ΜΟΝΟ «ρυθμισμένο ή όχι» — ούτε το team, ούτε το AUD, ούτε κανένα email.
        "access": {"configured": access_configured(), "base_path": BASE_PATH,
                   "env": ["FDMS_ACCESS_TEAM", "FDMS_ACCESS_AUD"]},
        # ΜΟΝΟ «ρυθμισμένο ή όχι» — ούτε το URL ούτε το κλειδί βγαίνουν ποτέ από εδώ.
        "casefile": {"configured": casefile_configured(), "tools": list(CASEFILE_TOOLS),
                     "env": ["FDMS_CASEFILE_URL", "FDMS_CASEFILE_KEY"],
                     "confirm_gate": True, "confirm_ttl_s": int(CFG["confirm_ttl"]), "pending": len(PENDING)},
        "memory": {"sessions_dir": str(sessions_dir()), "context_ceiling_tokens": int(CFG["context_ceiling"]),
                   "chars_per_token": GREEK_CHARS_PER_TOKEN, "estimate": True,
                   "compact_keep_pairs": int(CFG["compact_keep"]),
                   "sessions": {a["id"]: len(list_sessions(a["id"])) for a in list_agents()}},
        "keepalive": keepalive_status(),
        "tools": {"search_sources": {
            "whitelist": {k: {"path": str(v[0]), "dir": v[1], "raw_pdf": v[2], "exists": v[0].exists(), "about": v[3]}
                          for k, v in WHITELIST.items()},
            "pdf_text_library": pdf_lib,
            "excerpt_chars": int(CFG["search_excerpt_chars"]),
            "excerpt_cuts_only_at": "παράγραφος > πρόταση > άνω τελεία > γραμμή > λέξη (ποτέ μέσα σε λέξη)",
            "greek_inflection": "ρίζα μετά από κοπή κλιτικής κατάληξης, ελάχιστη ρίζα 4 χαρ., + substring",
                   "homoglyphs": "όροι ΜΕ ΨΗΦΙΟ ψάχνονται και στα δύο αλφάβητα (F44ΧΧ ≡ F44XX)",
        }, "fetch_source": {
            "handle": "<πηγή>#<id | h:<12hex> | pN | pN-M> — ίδια WHITELIST, ίδιος έλεγχος διαδρομής",
            "max_chars": int(CFG["fetch_max_chars"]), "max_calls": int(CFG["fetch_max_calls"]),
            "max_pages": FETCH_MAX_PAGES, "over_limit": "αριθμημένα μέρη k/N σε όριο παραγράφου — ποτέ σιωπηλή κοπή",
        }},
    }


# ════════════════════════════════════════════════════════════════════════════
# CLI
# ════════════════════════════════════════════════════════════════════════════

def configure(args) -> None:
    env = {
        "port": ("ADVISOR_PORT", int), "max_turns": ("ADVISOR_MAX_TURNS", int),
        "daily_cap": ("ADVISOR_DAILY_CAP", int), "max_corpus_bytes": ("ADVISOR_MAX_CORPUS_BYTES", int),
        "cache_ttl": ("ADVISOR_CACHE_TTL", str), "tool_max_calls": ("ADVISOR_TOOL_MAX_CALLS", int),
        "tool_max_chars": ("ADVISOR_TOOL_MAX_CHARS", int), "tool_total_chars": ("ADVISOR_TOOL_TOTAL_CHARS", int),
        "fetch_max_calls": ("ADVISOR_FETCH_MAX_CALLS", int), "fetch_max_chars": ("ADVISOR_FETCH_MAX_CHARS", int),
        "search_excerpt_chars": ("ADVISOR_SEARCH_EXCERPT_CHARS", int),
        "casefile_max_calls": ("ADVISOR_CASEFILE_MAX_CALLS", int),
        "casefile_max_writes": ("ADVISOR_CASEFILE_MAX_WRITES", int),
        "context_ceiling": ("ADVISOR_CONTEXT_CEILING_TOKENS", int), "compact_keep": ("ADVISOR_COMPACT_KEEP", int),
        "confirm_ttl": ("ADVISOR_CONFIRM_TTL_S", int), "sessions_dir": ("ADVISOR_SESSIONS_DIR", str),
        "keepalive": ("ADVISOR_KEEPALIVE", int), "keepalive_idle_h": ("ADVISOR_KEEPALIVE_IDLE_H", int),
        "state_file": ("ADVISOR_STATE_FILE", str), "agents_dir": ("ADVISOR_AGENTS_DIR", str),
        "corpus_dir": ("ADVISOR_CORPUS_DIR", str),
    }
    for k, d in DEFAULTS.items():
        v = d
        name, cast = env[k]
        if os.environ.get(name):
            try:
                v = cast(os.environ[name])
            except ValueError:
                log(f"αγνοώ {name}={os.environ[name]!r} (μη έγκυρη τιμή)")
        flag = getattr(args, k, None)
        if flag is not None:
            v = flag
        CFG[k] = v
    if CFG["cache_ttl"] not in ("5m", "1h"):
        log(f"cache_ttl={CFG['cache_ttl']!r} δεν είναι 5m/1h — χρησιμοποιώ 1h")
        CFG["cache_ttl"] = "1h"


def dry_run(agent_id: str, question: str) -> int:
    """Χτίζει το αίτημα ΑΚΡΙΒΩΣ όπως θα έφευγε, δύο φορές, και τυπώνει το σχήμα
    του με το corpus συνοπτικά. Κανένα byte δεν πάει στο API."""
    a = load_agent(agent_id)
    if not a:
        print(f"άγνωστος agent «{agent_id}» — διαθέσιμοι: {[x['id'] for x in list_agents()]}")
        return 2
    corpus, err = read_corpus(a)
    if err:
        print("ΑΡΝΗΣΗ (φρένο 3):", err)
        return 3
    msgs, err = normalise_messages([{"role": "user", "content": question}], "")
    if err:
        print(err)
        return 2
    tools = offered_tools(a)
    sys1 = build_system(a, corpus, tools)
    sys2 = build_system(a, read_corpus(a)[0], tools)
    p = request_params(a, sys1, msgs)
    shown = json.loads(json.dumps(p, ensure_ascii=False))
    for b in shown["system"]:
        t = b["text"]
        b["text"] = (f"<{len(t):,} chars · md5 {hashlib.md5(t.encode('utf-8')).hexdigest()} · "
                     f"αρχίζει: {t[:70]!r}>")
    out = {"endpoint": "POST /v1/messages (stream)", "params": shown,
           "tools": [], "max_iterations": None, "cache_breakpoints": 3,
           "cache_prefix_stable_across_two_builds": prefix_digest(sys1) == prefix_digest(sys2),
           "prefix_md5": prefix_digest(sys1),
           "corpus_bytes": a["corpus_path"].stat().st_size,
           "corpus_estimate_tokens": f"{len(corpus) // 25 * 10:,}–{len(corpus) // 2:,}",
           "caps": {"max_turns": effective_max_turns(a), "daily_cap": int(CFG["daily_cap"]),
                    "max_corpus_bytes": int(CFG["max_corpus_bytes"])}}
    out["tools_in_agent_md"] = a["tools"]
    out["tools_offered"] = tools
    out["casefile_configured"] = casefile_configured()
    # F3: το keep-alive ping, όπως θα έφευγε — ίδιο πρόθεμα, max_tokens 0, χωρίς breakpoint στο μήνυμα
    ka_tools = [t.to_dict() for t in ToolBudget(None, a["id"], "deadbeefdeadbeef").make_tools(tools)] if tools else []
    kp = keepalive_params({"model": a["model"], "effort": a["effort"], "system": sys1, "tools": ka_tools})
    out["keepalive_request"] = {
        "enabled": bool(int(CFG["keepalive"])), "endpoint": "client.beta.messages.create" if ka_tools else "client.messages.create",
        "max_tokens": kp["max_tokens"], "stream": False, "messages": kp["messages"],
        "thinking": kp["thinking"], "output_config": kp["output_config"], "tools": [t["name"] for t in ka_tools],
        "system_md5_equals_ask": prefix_digest(kp["system"]) == prefix_digest(sys1),
        "ping_after_s": keepalive_status()["ping_after_s"], "idle_hours": int(CFG["keepalive_idle_h"]),
        "unverified": "το max_tokens:0 μαζί με tools+thinking adaptive στο beta endpoint δεν έχει σταλεί ποτέ από εδώ — "
                      "αν απορριφθεί, το νήμα το γράφει στο log/health και σταματά μετά από 2 αποτυχίες",
    }
    if tools:
        for tool in ToolBudget(None, a["id"]).make_tools(tools):
            td = tool.to_dict() if hasattr(tool, "to_dict") else {"name": getattr(tool, "name", "?")}
            out["tools"].append(json.loads(json.dumps(td, ensure_ascii=False, default=str)))
        out["max_iterations"] = int(CFG["tool_max_calls"]) + int(CFG["fetch_max_calls"]) + int(CFG["casefile_max_calls"]) + 3
        out["runner"] = "client.beta.messages.tool_runner(stream=True)"
    else:
        out["runner"] = "client.messages.stream()"
    print(json.dumps(out, ensure_ascii=False, indent=2))
    return 0


def compact_demo(agent_id: str) -> int:
    """ΧΩΡΙΣ API. Συνθετική συνεδρία πάνω από το όριο → δείχνει (α) την απόφαση,
    (β) το αίτημα compaction με ΙΔΙΟ md5 προθέματος με το /ask, (γ) το prompt,
    (δ) την αντικατάσταση με μια πλαστή σύνοψη και το event που γράφεται."""
    a = load_agent(agent_id)
    if not a:
        print(f"άγνωστος agent «{agent_id}»")
        return 2
    corpus, err = read_corpus(a)
    if err:
        print("ΑΡΝΗΣΗ (φρένο 3):", err)
        return 3
    tools = offered_tools(a)
    system = build_system(a, corpus, tools)
    # συνθετικό ιστορικό: τόσα ζεύγη ώστε corpus + ιστορικό να περάσει το ταβάνι (Q1)
    s = {"id": "deadbeefdeadbeef", "agent": a["id"], "title": "demo", "context": "Προσαρμογή, 8η έξοδος",
         "student_id": None, "student_label": "", "created": _now(), "updated": _now(), "archived": False,
         "messages": [], "writes": [{"at": _now(), "tool": "casefile_add_case", "case_id": "2b1c0d9e-1111-2222-3333-444444444444",
                                     "preview": "ΝΕΑ ΥΠΟΘΕΣΗ · 2026-10-17 · fail · C4790\n  συνέπεια: καμία ενέργεια", "actor": "agent:" + a["id"]}],
         "events": [], "compactions": 0}
    k = 0
    while not context_budget(a, system, s)["overflow"]:
        k += 1
        s["messages"].append({"role": "user", "content": f"Ερώτηση {k}: " + ("τι ισχύει για την αποτυχία; " * 40), "at": _now()})
        s["messages"].append({"role": "assistant", "content": f"Απάντηση {k} [fail-24] §30ζ " + ("κείμενο απάντησης. " * 100), "at": _now()})
    before = history_chars(s["messages"])
    budget_before = context_budget(a, system, s)
    ask_digest = prefix_digest(system)
    tool_dicts = [t.to_dict() for t in ToolBudget(None, a["id"], s["id"]).make_tools(tools)] if tools else []
    p = compaction_params(a, system, s, tool_dicts)
    canned = ("# ΣΥΝΟΨΗ ΣΥΝΕΔΡΙΑΣ\n## ΜΑΘΗΤΗΣ ΚΑΙ ΕΡΩΤΗΜΑ\nΠροσαρμογή, 8η έξοδος, ΑΠΟΤΥΧΙΑ στην C4790.\n"
              "## ΤΙ ΕΧΕΙ ΤΕΚΜΗΡΙΩΘΕΙ\n- Αξιολόγηση αποτυχία → Εξέταση Καταλληλότητας με Αξιολογητή [fail-24] ΒαΔ 3-01 §30ζ\n"
              "## ΤΙ ΜΕΝΕΙ ΑΝΟΙΧΤΟ\n- ⚠ ΑΛΥΤΟ: νυχτερινή\n## ΤΙ ΓΡΑΦΤΗΚΕ ΣΤΟΝ ΦΑΚΕΛΟ\n— το συμπληρώνει ο proxy από το αρχείο της συνεδρίας —")
    ev = apply_brief(s, canned, {"input_tokens": 0, "cache_creation_input_tokens": 0, "cache_read_input_tokens": 0, "output_tokens": 0})
    shown_sys = [{"cache_control": b.get("cache_control"), "text": f"<{len(b['text']):,} chars · md5 {hashlib.md5(b['text'].encode('utf-8')).hexdigest()}>"} for b in p["system"]]
    out = {
        "trigger": {"history_chars": before, "pairs_needed": k, "budget_before": budget_before,
                    "fires": budget_before["overflow"], "budget_after": context_budget(a, system, s)},
        "compaction_request": {"model": p["model"], "max_tokens": p["max_tokens"], "thinking": p["thinking"],
                               "output_config": p["output_config"], "tools": [t["name"] for t in p.get("tools", [])],
                               "tool_choice": p.get("tool_choice"), "system": shown_sys,
                               "messages": f"{len(p['messages'])} (ιστορικό + COMPACT_PROMPT ως τελευταίο user)",
                               "last_user_starts": p["messages"][-1]["content"][0]["text"][:90] + "…"},
        "prefix_md5_ask": ask_digest, "prefix_md5_compaction": prefix_digest(p["system"]),
        "same_prefix_so_corpus_stays_cached": ask_digest == prefix_digest(p["system"]),
        "COMPACT_PROMPT": COMPACT_PROMPT,
        "after_apply_brief": {"event": ev, "messages": [{"role": m["role"], "kind": m.get("kind"), "chars": len(m["content"]),
                                                          "head": m["content"][:110]} for m in s["messages"]],
                              "summary_message_full": s["messages"][0]["content"]},
    }
    print(json.dumps(out, ensure_ascii=False, indent=2))
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="Ο τοπικός proxy του Συμβούλου FDMS (127.0.0.1 μόνο).",
                                 formatter_class=argparse.RawDescriptionHelpFormatter,
                                 epilog=__doc__.split("ΑΛΛΕΣ ΡΥΘΜΙΣΕΙΣ", 1)[0])
    ap.add_argument("--port", type=int, help=f"θύρα (default {DEFAULTS['port']})")
    ap.add_argument("--max-turns", type=int, dest="max_turns", help="φρένο 1: γύροι ανά συζήτηση (20)")
    ap.add_argument("--daily-cap", type=int, dest="daily_cap", help="φρένο 2: αιτήματα ανά ημέρα (200)")
    ap.add_argument("--max-corpus-bytes", type=int, dest="max_corpus_bytes", help="φρένο 3: μέγιστο corpus σε bytes (1_000_000)")
    ap.add_argument("--cache-ttl", dest="cache_ttl", choices=["5m", "1h"], help="TTL του prompt cache (1h)")
    ap.add_argument("--tool-max-calls", type=int, dest="tool_max_calls", help="search_sources: κλήσεις ανά απάντηση (20)")
    ap.add_argument("--tool-max-chars", type=int, dest="tool_max_chars", help="search_sources: χαρακτήρες ανά κλήση (8000)")
    ap.add_argument("--tool-total-chars", type=int, dest="tool_total_chars", help="όλα τα εργαλεία: χαρακτήρες κειμένου πηγών ανά απάντηση (120000)")
    ap.add_argument("--fetch-max-calls", type=int, dest="fetch_max_calls", help="fetch_source: ανακτήσεις ανά απάντηση (8)")
    ap.add_argument("--fetch-max-chars", type=int, dest="fetch_max_chars", help="fetch_source: χαρακτήρες ανά ανάκτηση πριν κοπεί σε μέρη (12000)")
    ap.add_argument("--search-excerpt-chars", type=int, dest="search_excerpt_chars", help="search_sources: μήκος αποσπάσματος (700· κόβει σε όριο, ποτέ μέσα σε λέξη)")
    ap.add_argument("--casefile-max-calls", type=int, dest="casefile_max_calls", help="casefile: κλήσεις ανά απάντηση (8)")
    ap.add_argument("--casefile-max-writes", type=int, dest="casefile_max_writes", help="casefile: προεπισκοπήσεις εγγραφής ανά απάντηση (2)")
    ap.add_argument("--context-ceiling", type=int, dest="context_ceiling",
                    help=f"compaction όταν ΕΚΤΙΜΩΜΕΝΑ tokens corpus+ιστορικού ξεπεράσουν N − max_tokens (600000· εκτίμηση {GREEK_CHARS_PER_TOKEN} χαρ./token, όχι μέτρηση)")
    ap.add_argument("--keepalive", type=int, choices=[0, 1], dest="keepalive", help="keep-alive του cache με max_tokens:0 πριν τη λήξη (1)")
    ap.add_argument("--keepalive-idle", type=int, dest="keepalive_idle_h", help="ώρες χωρίς ερώτηση μετά τις οποίες σταματά το keep-alive (8)")
    ap.add_argument("--compact-keep", type=int, dest="compact_keep", help="ζεύγη που μένουν αυτούσια μετά το compaction (1)")
    ap.add_argument("--confirm-ttl", type=int, dest="confirm_ttl", help="ζωή του token επιβεβαίωσης σε δευτερόλεπτα (900)")
    ap.add_argument("--sessions-dir", dest="sessions_dir", help="φάκελος συνεδριών (tools/advisor/sessions)")
    ap.add_argument("--compact-demo", action="store_true", dest="compact_demo",
                    help="ΧΩΡΙΣ API: δείξε πότε/πώς γίνεται compaction σε συνθετικό ιστορικό και το αποτέλεσμα")
    ap.add_argument("--state-file", dest="state_file", help="αρχείο μετρητή ημέρας")
    ap.add_argument("--agents-dir", dest="agents_dir", help="φάκελος agents/")
    ap.add_argument("--corpus-dir", dest="corpus_dir", help="φάκελος των context-*.md")
    ap.add_argument("--agent", default="board-director", help="agent για --dry-run/--count-tokens")
    ap.add_argument("--question", default="Μαθητής βαθμολογήθηκε ΑΠΟΤΥΧΙΑ στην C4790. Τι ενεργοποιείται και με ποιον πετάει μετά;",
                    help="ερώτηση για --dry-run/--count-tokens")
    ap.add_argument("--dry-run", action="store_true", help="χτίσε και τύπωσε το αίτημα — ΧΩΡΙΣ κλήση API")
    ap.add_argument("--search", metavar="QUERY", help="τρέξε το search_sources τοπικά (χωρίς API) με --source")
    ap.add_argument("--source", default="3-01", help="πηγή για --search (id ή διαδρομή — δείχνει και την άρνηση)")
    ap.add_argument("--fetch", metavar="HANDLE", help="τρέξε το fetch_source τοπικά (χωρίς API), π.χ. context-full#fail-24 ή 3-01#p54")
    ap.add_argument("--part", type=int, default=1, help="μέρος για --fetch όταν η μονάδα ξεπερνά το όριο (1)")
    ap.add_argument("--count-tokens", action="store_true", dest="count_tokens",
                    help="ΜΙΑ δωρεάν κλήση count_tokens για το corpus+prompt (θέλει κλειδί)")
    args = ap.parse_args()
    configure(args)

    if args.search is not None:
        try:
            text, n = search_sources_impl(args.search, args.source, 8, int(CFG["tool_max_chars"]))
            print(text)
            print(f"\n— {n} ευρήματα συνολικά, {len(text)} χαρακτήρες προς το μοντέλο")
            return 0
        except PathRefused as e:
            print("TOOL ERROR (όπως θα το έβλεπε το μοντέλο):", e)
            return 4

    if args.fetch is not None:
        try:
            text, meta = fetch_source_impl(args.fetch, args.part, int(CFG["fetch_max_chars"]))
            print(text)
            print(f"\n— λαβή {meta['handle']} · {meta['chars']:,} χαρακτήρες η μονάδα · μέρος {meta['part']}/{meta['parts']}"
                  f" · {'ΟΛΟΚΛΗΡΟ' if meta['complete'] else 'ΜΕΡΙΚΟ'} · {len(text):,} χαρακτήρες προς το μοντέλο")
            return 0
        except PathRefused as e:
            print("TOOL ERROR (όπως θα το έβλεπε το μοντέλο):", e)
            return 4

    if args.compact_demo:
        return compact_demo(args.agent)

    if args.dry_run:
        return dry_run(args.agent, args.question)

    if args.count_tokens:
        if not os.environ.get("ANTHROPIC_API_KEY"):
            print("Χρειάζεται ANTHROPIC_API_KEY στο περιβάλλον.")
            return 2
        a = load_agent(args.agent)
        corpus, err = read_corpus(a) if a else (None, "άγνωστος agent")
        if err:
            print(err)
            return 3
        import anthropic
        msgs, _ = normalise_messages([{"role": "user", "content": args.question}], "")
        c = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
        r = c.messages.count_tokens(model=a["model"], system=build_system(a, corpus), messages=msgs,
                                    thinking={"type": "adaptive"})
        print(f"input_tokens για corpus «{a['corpus']}» + prompt + ερώτηση: {r.input_tokens:,}")
        return 0

    try:
        srv = ProxyServer(("127.0.0.1", int(CFG["port"])), Handler)
    except OSError as e:
        log(f"Η θύρα 127.0.0.1:{CFG['port']} δεν δεσμεύεται ({e.strerror or e}). Κάτι άλλο την έχει· "
            f"ξεκίνα με --port N (ή ADVISOR_PORT=N) και πες στη σελίδα τη νέα διεύθυνση: στο "
            f"DevTools console  localStorage.setItem('p2r-advisor-proxy','http://127.0.0.1:N')")
        return 1
    key = "ΝΑΙ" if os.environ.get("ANTHROPIC_API_KEY") else "ΟΧΙ — κάθε /ask θα απαντά 503 μέχρι να οριστεί"
    log(f"Σύμβουλος FDMS — proxy στο http://127.0.0.1:{CFG['port']}  (μόνο loopback)")
    log(f"ANTHROPIC_API_KEY στο περιβάλλον: {key}")
    log(f"agents: {[x['id'] for x in list_agents()] or '(κανείς)'}  · corpus dir: {corpus_dir()}")
    if access_configured():
        log(f"Cloudflare Access: ΝΑΙ — αιτήματα στο {BASE_PATH}/* απαιτούν έγκυρο JWT "
            f"(team «{ACCESS_TEAM}», έλεγχος aud) · ο δράστης στο log παίρνει το email που υπέγραψε η Cloudflare")
    else:
        log(f"Cloudflare Access: ΟΧΙ — μόνο τοπική χρήση. Αίτημα στο {BASE_PATH}/* θα απαντήσει 503 "
            f"(όρισε FDMS_ACCESS_TEAM και FDMS_ACCESS_AUD για να ανοίξει ο δρόμος του tunnel).")
    log(f"φρένα: max_turns={CFG['max_turns']} daily_cap={CFG['daily_cap']} "
        f"max_corpus_bytes={CFG['max_corpus_bytes']:,} · search: {CFG['tool_max_calls']} κλήσεις × {CFG['tool_max_chars']} chars "
        f"(απόσπασμα {CFG['search_excerpt_chars']}) · fetch: {CFG['fetch_max_calls']} κλήσεις × {CFG['fetch_max_chars']} chars · "
        f"σύνολο {CFG['tool_total_chars']} chars/απάντηση · cache_ttl={CFG['cache_ttl']}")
    if int(CFG["keepalive"]):
        threading.Thread(target=keepalive_loop, name="keepalive", daemon=True).start()
        log(f"keep-alive: ΝΑΙ — ping στα {keepalive_status()['ping_after_s'] // 60}′ από την τελευταία επαφή, "
            f"σταματά μετά από {CFG['keepalive_idle_h']} ώρες χωρίς ερώτηση · compaction όταν corpus+ιστορικό ≈ "
            f"{int(CFG['context_ceiling']):,} tokens (εκτίμηση {GREEK_CHARS_PER_TOKEN} χαρ./token)")
    else:
        log("keep-alive: ΟΧΙ (ADVISOR_KEEPALIVE=0)")
    log("Ctrl+C για τερματισμό.")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        log("τερματισμός.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
