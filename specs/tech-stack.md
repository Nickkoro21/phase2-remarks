# Tech Stack — FDMS / Phase 2 Remarks

> **Κατάσταση: 16/10/2026.** Μέρος του SDD constitution (`mission.md` · `tech-stack.md` ·
> `roadmap.md`).

## Αρχές

- **Zero-build, zero-dependency**: στατικό HTML/CSS/JS (vanilla). Τρέχει offline σε υπηρεσιακό PC
  χωρίς εγκαταστάσεις — μόνο ένας static file server (`python -m http.server 8123`).
  **Κανένα framework, κανένα bundler, κανένα npm στο runtime.**
- **Δεδομένα = JSON στο δίσκο** (`data/`), ποτέ hardcoded στην εφαρμογή. Η εφαρμογή είναι viewer
  και επεξεργαστής, ποτέ πηγή αλήθειας.
- **Ελληνικό UI, αγγλικό περιεχόμενο παρατηρήσεων** (όπως τα ΦΒ).
- **Κάθε απόφαση γράφεται δίπλα στον κώδικα που την υλοποιεί**, με το ΓΙΑΤΙ και τον γύρο/απόφανση
  που τη γέννησε. Τα specs είναι το αρχείο, τα σχόλια είναι η μνήμη.

## Δομή

```
D:\FDMS
├── app\                      # SPA, 13 modules, no framework
│   ├── index.html styles.css # όλα τα scripts με ?v=<buster>
│   ├── app.js                # Remarks: κατηγορία → item → κώδικες → κάρτες
│   ├── remarksearch.js       # αναζήτηση σε ΟΛΕΣ τις παρατηρήσεις
│   ├── description.js        # το μπλοκ περιγραφής ΦΒ
│   ├── mifchart.js flowchart.js
│   ├── scheduler.js          # SchedReady (γράφος) + Training log + η φόρμα
│   ├── schedstore.js         # SchedStore: συλλογές, upsert MERGE, sync
│   ├── schedboard.js         # ημερήσιο πλάνο, actualize, progress editor
│   ├── schedconsq.js         # ΠΔ 1γ/1δ, κατώφλια, παραπομπές
│   ├── schedval.js schedsync.js
│   ├── currency.js           # SchedCurrency: Ε/Σ, εξάμηνα, bump/addEntry/restore
│   └── schedbridge.js        # η γέφυρα ⇄ Wings Ahead (το μεγαλύτερο module)
├── data\
│   ├── criteria\             # 4 κατηγορίες, 118 items (verbatim + resolved)
│   ├── mif\                  # fs.json, t6a.json (9 πίνακες MIF)
│   ├── observations2\        # Η ΖΩΝΤΑΝΗ ΤΡΑΠΕΖΑ — 117 αρχεία, 1 882 error modes
│   ├── observations\         # v1 trunk + master_index.json (ο δείκτης που διαβάζει η εφαρμογή)
│   ├── requirements\         # 379 απαιτήσεις + board_tolerance_matrix + instructor_currency
│   ├── technique\ areas\ sections\ descriptions\ human_factors.json
├── specs\                    # SDD constitution + τα τέσσερα μεγάλα specs
├── tools\
│   ├── check_observations.py # Ο ΕΛΕΓΚΤΗΣ της τράπεζας — πύλη κάθε γύρου παρατηρήσεων
│   ├── index_*_v2.py build_index.py
│   ├── build_offline.py      # το ΕΝΑ HTML για τη μονάδα (ES5, δάπεδο Firefox 32)
│   └── fixtures\bridge\      # 1 625 headless έλεγχοι: node tools/fixtures/bridge/run.js
└── start_app.bat
```

## Οι δύο πύλες που δεν παρακάμπτονται

**1. Η τράπεζα παρατηρήσεων** — `python tools/check_observations.py --quiet --base <commit>`.
Κλείνει με `ERROR 0 · AT-NUMBER 0 · AT-QUALITATIVE 0 · FALLBACK 0`. Το συμβόλαιο είναι το
`observations-style.md`· ο ελεγκτής είναι η εκτέλεσή του.

**2. Η γέφυρα** — `node tools/fixtures/bridge/run.js`. Κλείνει με **0 failed**. Ο αριθμός που
περνάει γράφεται **αφού τρέξει**, ποτέ από μνήμη.

Συνοδεύουν: `node --check` σε κάθε αλλαγμένο .js, `python tools/build_offline.py --dry-run` → `OK`,
και **roster grep** (κανένα πραγματικό όνομα πουθενά).

## Το εργαστήριο του σχήματος (Wings Ahead, πύλη §4φ)

**ΔΕΝ είναι το Docker** (10/09/2026). Το Docker Desktop σπάει επαναλαμβανόμενα σε αυτό το μηχάνημα.
Η τοπική απόδειξη τρέχει σε **native PostgreSQL μέσα στο WSL Ubuntu-22.04**, όπου το
`D:\WingsAhead\db\schema.sql` εφαρμόζεται **αυτούσιο** (έχει vanilla fallback για pgcrypto, μηδέν
`auth.` refs). Χρειάζεται μόνο προοίμιο τριών ρόλων (`anon` · `authenticated` · `service_role`) που
ζει στο scratchpad και **ποτέ** στο repo. Λεπτομέρειες: `wingsahead-spec.md` § 4χ.

Η σειρά της πύλης: τοπική εφαρμογή **×2** με `ON_ERROR_STOP=1` → έλεγχος **συμπεριφοράς** →
μεταφορά στο cloud (για αλλαγή μίας συνάρτησης: DO block που αντικαθιστά **μόνο το μπλοκ** και
σκάει αν δεν βρει το παλιό αυτολεξεί) → διασταύρωση **`md5(prosrc)`** τοπικού ⇄ cloud →
`get_advisors` → commit + push. **Καμία εντολή δεν επιστρέφει ποτέ στήλη `token`.**

## Συμβάσεις

- **Python 3.x** του συστήματος (ΟΧΙ το venv aisuite). **Node** μόνο για τα fixtures και τον
  ES5 builder — ποτέ στο runtime της εφαρμογής.
- **Git:** `git push` από **PowerShell** (ο classifier του Bash το μπλοκάρει). Τα commit messages
  είναι **αγγλικά, με τίτλο που λέει τι άλλαξε και γιατί**, και σώμα που ονομάζει τις αποφάνσεις —
  η παλιά σύμβαση «ελληνικά με πρόθεμα app:/data:» έχει αντικατασταθεί από την πράξη.
- **Ποτέ** commit/stage του `.claude/launch.json`.
- Το `D:\FDMS-export` (το παραδοτέο της μονάδας) είναι **byte-untouchable** από γύρο: ο builder
  τρέχει μόνο `--dry-run`.
- Footer credit στο δημόσιο repo και στη ζωντανή εφαρμογή **μένει**· στο unit-facing export
  **φεύγει**, μέσα από τον builder (απόφανση 28/08/2026).
