# Ανοιχτές αποφάσεις — ανάλυση παραπομπών (Phase II Performance Criteria)

## ΑΠΑΝΤΗΣΕΙΣ (2026-07-31): 1α, 2α, 3α, 4 γενικό, 5α, 6β, 7α

> **ΟΛΑ ΤΑ ΕΡΩΤΗΜΑΤΑ ΑΠΑΝΤΗΘΗΚΑΝ.** Ο χρήστης απάντησε στις **2026-07-31**. Και τα 3 items
> με `needs_user_decision` έγιναν `resolved`· στα `criteria/*.json` και στο `manifest.json`
> **δεν απομένει καμία εγγραφή** `needs_user_decision`. Νέα σύνοψη `manifest.json`:
> **80 `resolved` / 0 `needs_user_decision` / 38 `n/a`**. Το κείμενο του Α΄ και του Β΄
> ΜΕΡΟΥΣ παρακάτω διατηρείται **ως είχε τεθεί**, ως ιστορικό αρχείο του ερωτήματος· κάθε
> ερώτημα φέρει πλέον δίπλα του τη σήμανση ΑΠΑΝΤΗΘΗΚΕ.

| # | item | απάντηση | τι εφαρμόστηκε στα δεδομένα |
|---|---|---|---|
| **1** | `instrument-19` | **1α** | διαγράφηκαν οι 2 γραμμές `provenance: "instrument-18"` — μένουν μόνο οι 3 του `instrument-04` |
| **2** | `formation-13` | **2α** | η VERTICAL SEPARATION έγινε `+10΄/−5΄` **και για τους δύο** κωδικούς |
| **3** | `formation-13` | **3α** | η OBSERVANCE ANGLE μένει ως έχει και δηλώνεται ρητά ως το διαμήκες κριτήριο |
| **4** | `vfr_navigation-16` | **γενικό** | κρατούνται **και τα δύο** σετ (`contact-05` + `formation-17`) — καμία εξειδίκευση ανά ρόλο |
| **5** | `instrument-28` | **5α** | **καμία αλλαγή δεδομένων** — η προεπιλογή επιβεβαιώθηκε |
| **6** | `vfr_navigation-04` | **6β** | διαγράφηκε η γραμμή `COURSE DEVIATION (radials)` (`provenance: "instrument-03"`) |
| **7** | `vfr_navigation-15` / `-20` | **7α** | **καμία αλλαγή δεδομένων** — η προεπιλογή επιβεβαιώθηκε |

### Αναλυτική εφαρμογή ανά απόφαση

**1α — `instrument-19` (EN-ROUTE DESCENT)** · αρχείο `criteria/instrument.json`
Επιλέχθηκε η **ΑΝΑΓΝΩΣΗ Α** (αυστηρά γραμματική, κανόνας 7.a(5)). Στο `resolved` μένουν
**ΜΟΝΟ** οι 3 γραμμές με `provenance: "instrument-04"` (ALTITUDE `±300΄/±150΄`,
AIRSPEED (KIAS) `±20/±10`, HEADING `±10°/±5°`). Διαγράφηκαν οι 2 γραμμές που είχαν
αντιγραφεί από το `instrument-18` — μαζί τους έφυγε και η συγκρουόμενη ταχύτητα
`+15/−10 · +10/−5` καθώς και το όριο πορείας `±8/±5 radials`. Το `instrument-18` **παύει να
είναι δότης**: η εγγραφή του στο `sources` κρατήθηκε μόνο ως σημείωση
(«ΔΕΝ ΕΦΑΡΜΟΖΕΤΑΙ — ΙΣΤΟΡΙΚΗ ΣΗΜΕΙΩΣΗ ΜΟΝΟ»), ώστε να φαίνεται ότι η ΑΝΑΓΝΩΣΗ Β
εξετάστηκε και απορρίφθηκε. Το `open_questions` καθαρίστηκε (το κλειδί αφαιρέθηκε) και
προστέθηκε `note: "User decision 2026-07-31: 1α"`. `status` → `resolved`. Ενημερώθηκε και
το flag του item που ανέφερε την παλιά κατάσταση.

**2α — `formation-13` (FORMATION APPROACH, WINGMAN) · κάθετη διάσταση** ·
αρχείο `criteria/formation.json`
Η γραμμή **VERTICAL SEPARATION** αντικαταστάθηκε από το τυπωμένο όριο του ίδιου του item:
`code_1_raw` = `code_3_raw` = `+ 10' / - 5'`, `code_1` = `code_3` =
`{kind: "deviation", plus: 10, minus: 5}`, `interpolation: "undefined"` (δεν απομένει
διαφοροποίηση κωδικών προς παρεμβολή), `provenance: "formation-13"` (το ίδιο το item).
Το `override_note` γράφει: *«Per user decision 2α (2026-07-31): the printed
'+ 10' / - 5' altitude difference from Leader's wing level' replaces the Fingertip VERTICAL
SEPARATION line for both codes.»* Οι τιμές που υπερισχύθηκαν ήταν `+ 6’, − 10’` (κωδ. 1)
και `± 4’` (κωδ. 3).

**3α — `formation-13` · διαμήκης διάσταση** · αρχείο `criteria/formation.json`
Η γραμμή **OBSERVANCE ANGLE** (`50° ± 5°` κωδ. 1 / `30° ± 5°` κωδ. 3) **παραμένει
αμετάβλητη** και απέκτησε `note`: *«Per user decision 3α (2026-07-31): the Observance Angle
renders the longitudinal position — no separate longitudinal criterion.»* Το
`open_questions` του item καθαρίστηκε, `status` → `resolved`, και στο επίπεδο του
`resolved` προστέθηκε `note: "User decision 2026-07-31: 2α, 3α"`.

**4 (γενικό) — `vfr_navigation-16` (FORMATION APPROACH)** ·
αρχείο `criteria/vfr_navigation.json`
**ΔΕΝ** εξειδικεύεται κατά ρόλο. Κρατήθηκαν **και τα δύο** σετ με τα διακριτά scope τους —
3 γραμμές `provenance: "contact-05"` (ανάγνωση LEADER) και 3 γραμμές
`provenance: "formation-17"` (ανάγνωση WINGMAN). `status` → `resolved`, `open_questions`
καθαρίστηκε, `note: "User decision (2026-07-31): keep general — not specialized by role at
this level."`
**Κληρονομιά της απόφασης 2:** στη γραμμή VERTICAL SEPARATION του σετ `formation-17`
εφαρμόστηκε η **ίδια** αντικατάσταση `+10΄/−5΄` και για τους δύο κωδικούς, με
`interpolation: "undefined"` και το **ίδιο** `override_note`. Το `provenance` της γραμμής
παρέμεινε σκόπιμα `"formation-17"`, γιατί η ίδια η απόφαση 4 ορίζει τα δύο σετ **μέσω
αυτού του πεδίου** — αλλαγή του θα διέλυε τον διαχωρισμό που η απόφαση διατηρεί.
*Δεν επηρεάζεται* το `vfr_navigation-07` (FINGERTIP): παραπέμπει στο `formation-17` ως
καθαρή άσκηση fingertip, όχι μέσω του `formation-13`, οπότε κρατά `+ 6’, − 10’` / `± 4’`.

**5α — `instrument-28` (LANDING)** · **ΚΑΜΙΑ ΑΛΛΑΓΗ ΔΕΔΟΜΕΝΩΝ**
Η τρέχουσα προεπιλογή επιβεβαιώθηκε: η αριθμητική υπέρβαση (`± 1.000 ft` / `± 500 ft` από
το projected touch-down point) εφαρμόζεται σε **όλο** το item και ο περιορισμός
«(for landing after Precision Approach)» παραμένει καταγεγραμμένος μόνο ως `override_note`.
Καταγράφεται η απάντηση, τίποτα άλλο δεν πειράχτηκε.

**6β — `vfr_navigation-04` (VFR DEPARTURE / SID)** ·
αρχείο `criteria/vfr_navigation.json`
Διαγράφηκε από το `resolved` η γραμμή **COURSE DEVIATION (radials)** `±8/±5`
(`provenance: "instrument-03"`), ως **υπέρβαση** του κανόνα 7.a(5) — μένουν μόνο οι 3
γραμμές Basic A/C Control (`provenance: "vfr_navigation-05"`). Η εγγραφή `instrument-03`
στο `sources` κρατήθηκε ως σημείωση μη-εφαρμογής, με το σκεπτικό της απόρριψης στο `basis`.
Προστέθηκε `note: "User decision 2026-07-31: 6β — instrument-03 SID row removed."`
Το `status` ήταν ήδη `resolved` και παρέμεινε.

**7α — `vfr_navigation-15` / `vfr_navigation-20` (INSTRUMENT PROCEDURES)** ·
**ΚΑΜΙΑ ΑΛΛΑΓΗ ΔΕΔΟΜΕΝΩΝ**
Η τρέχουσα προεπιλογή επιβεβαιώθηκε: φορτώνεται μόνο το `instrument-04` (Basic A/C
Control)· οι υπόλοιποι 14 πίνακες διαδικασιών εφαρμόζονται **δυναμικά**, μόνο αν η
συγκεκριμένη διαδικασία εκτελεστεί στην έξοδο. Καταγράφεται η απάντηση, τίποτα άλλο δεν
πειράχτηκε.

### Πού αλλού ενημερώθηκε

* `manifest.json` — `resolved_status` των `instrument-19`, `formation-13`,
  `vfr_navigation-16` → `"resolved"`· `counts.criteria_items_by_resolved_status` →
  `{resolved: 80, needs_user_decision: 0, "n/a": 38}`.
* `README.md` §9.6 — κάθε ερώτημα σημειώθηκε ΑΠΑΝΤΗΜΕΝΟ με την απόφαση και την ημερομηνία.

---

Το πέρασμα ανάλυσης των παραπομπών («As described in …») ολοκληρώθηκε: **77 από τα 80**
items χωρίς δικό τους πίνακα λύθηκαν αυτόματα και τεκμηριωμένα. Απέμεναν **3 items** που
δεν μπορούσαν να λυθούν χωρίς ανθρώπινη κρίση, επειδή η ίδια η πηγή είναι διφορούμενη ή
αυτοαντιφατική· **απαντήθηκαν 2026-07-31** (βλ. ενότητα ΑΠΑΝΤΗΣΕΙΣ στην αρχή) και το
`expected_performance.resolved.status` και των 3 είναι πλέον `resolved` — καμία εγγραφή
`needs_user_decision` δεν απομένει.

> ⚠ **Η προειδοποίηση ασφαλείας παραμένει για ένα item.** Στο `vfr_navigation-16` η
> απόφαση 4 κράτησε σκόπιμα **ΚΑΙ ΤΑ ΔΥΟ** σετ τιμών, διαχωρισμένα με το πεδίο
> `provenance` (`contact-05` = ανάγνωση LEADER, `formation-17` = ανάγνωση WINGMAN).
> **Καμία μηχανή βαθμολόγησης δεν πρέπει να εφαρμόσει ταυτόχρονα τα δύο σετ** — επιλέγει
> ένα ανά έξοδο. Το `status: "resolved"` ΔΕΝ αίρει τον κανόνα· ο μηχαναγνώσιμος δείκτης
> είναι το `resolved.mutually_exclusive_provenance` του item (README §8 κανόνας 12, §9.2).

*(Οι δύο παράγραφοι που ακολουθούν είναι το αρχικό κείμενο της ερώτησης — ιστορικό υλικό,
διατηρείται ως είχε τεθεί. Η απάντηση δόθηκε ήδη στις 2026-07-31 και εφαρμόστηκε.)*

**Πώς απαντάτε:** γράψτε απλώς τους αριθμούς με το γράμμα της επιλογής σας, π.χ.
`1α, 2β, 3α, 4γ`. Μπορείτε να απαντήσετε μόνο το Α΄ ΜΕΡΟΣ και να αφήσετε το Β΄ ως έχει.

**Τι θα γίνει με την απάντηση:** θα ενημερωθούν τα `criteria/*.json` (θα διαγραφούν ή θα
τροποποιηθούν οι αντίστοιχες γραμμές `resolved.parameters`), το `status` θα γίνει
`resolved`, το `open_questions` θα αντικατασταθεί από την καταγραφή της απόφασής σας, και
θα ενημερωθεί το `manifest.json` (`resolved_status`) και το `README.md` (§9.6).

> **Καμία τιμή δεν έχει εφευρεθεί.** Κάθε αριθμός παρακάτω είναι πιστό αντίγραφο
> τυπωμένου πίνακα του `Phase_2_Syllabus_2025.pdf`. Οι μόνοι τροποποιημένοι αριθμοί σε
> όλο το dataset είναι οι δύο γραμμές `TOUCH DOWN POINT` του `instrument-28`, βάσει ρητής
> εντολής της ίδιας της πηγής (βλ. απόφαση 5).

---

## Α΄ ΜΕΡΟΣ — ΥΠΟΧΡΕΩΤΙΚΕΣ ΑΠΟΦΑΣΕΙΣ (3 items, 4 ερωτήματα)

---

### 1. `instrument-19` — EN-ROUTE DESCENT · έκταση της παραπομπής

> ✅ **ΑΠΑΝΤΗΘΗΚΕ 2026-07-31 → 1α** — μόνο Basic A/C Control· διαγράφηκαν οι 2 γραμμές `instrument-18`.

**Πού:** PDF σελ. 56 · `kind: "none"` (δεν τυπώνεται καθόλου υποενότητα
`2/ SPECIFIC CRITERIA`) · `rule: "rule_7a5_default"`

**Τι λέει η πηγή, αυτούσια:**
> «Instrument Descent and A/C Basic Control Training Exercises General Criteria apply.»

**Το σκεπτικό:** η πρόταση ονομάζει ρητά **ΜΟΝΟ τα GENERAL criteria** δύο ασκήσεων.
Τα general criteria a/b/c του `instrument-18` (INSTRUMENT DESCENT / PENETRATION) είναι
όμως καθαρά ποιοτικά (οδηγίες ATC, περιορισμοί routing/ύψους, άψογη εκτέλεση) — δεν
περιέχουν κανέναν αριθμό. Άρα, αν πάρουμε το κείμενο κατά γράμμα, το μόνο αριθμητικό
πρότυπο που ενεργοποιείται είναι ο πίνακας Basic A/C Control (`instrument-04`), μέσω του
κανόνα 7.a(5). Από την άλλη, το en-route descent είναι κάθοδος με ραδιοβοηθήματα, οπότε
υπάρχει επιχείρημα ότι εννοούνται και τα **specific** criteria του `instrument-18`.

**Η σύγκρουση:** οι δύο αναγνώσεις δίνουν **αμοιβαία αποκλειόμενα** όρια ταχύτητας για το
ίδιο item — `± 20 / ± 10` (συμμετρικό, από `instrument-04`) έναντι `+15/−10 · +10/−5`
(ασύμμετρο και αυστηρότερο, από `instrument-18`). Επιπλέον η δεύτερη ανάγνωση εισάγει
όριο πορείας (`± 8 / ± 5` radials) που το syllabus **δεν** τυπώνει πουθενά για το item (19).

| | κωδ. «1» | κωδ. «3» | πηγή |
|---|---|---|---|
| ALTITUDE (feet) | ± 300΄ | ± 150΄ | `instrument-04` |
| AIRSPEED (KIAS) | ± 20 | ± 10 | `instrument-04` |
| HEADING (degrees) | ± 10° | ± 5° | `instrument-04` |
| AIRSPEED (knots) | +15 / −10 | +10 / −5 | `instrument-18` |
| MAINTAINING COURSE (radials) | ± 8 | ± 5 | `instrument-18` |

**Επιλογές:**

- **1α — ΑΝΑΓΝΩΣΗ Α: μόνο Basic A/C Control** *(αυστηρά γραμματική· τρέχουσα προεπιλογή
  ασφαλείας)*
  Ισχύουν μόνο οι 3 γραμμές με `provenance: "instrument-04"`.
  *Συνέπεια:* διαγράφονται οι 2 γραμμές `instrument-18`.

- **1β — ΑΝΑΓΝΩΣΗ Β με υπεροχή του `instrument-18` στην ταχύτητα** *(επεκτατική,
  αυστηρότερη)*
  Ισχύουν: ALTITUDE ± 300΄/± 150΄, HEADING ± 10°/± 5°, AIRSPEED **+15/−10 · +10/−5**,
  MAINTAINING COURSE ± 8/± 5.
  *Συνέπεια:* διαγράφεται η γραμμή AIRSPEED (KIAS) του `instrument-04`.

- **1γ — ΑΝΑΓΝΩΣΗ Β με υπεροχή του `instrument-04` στην ταχύτητα** *(επεκτατική,
  χαλαρότερη στην ταχύτητα)*
  Ισχύουν: ALTITUDE ± 300΄/± 150΄, AIRSPEED **± 20/± 10**, HEADING ± 10°/± 5°,
  MAINTAINING COURSE ± 8/± 5.
  *Συνέπεια:* διαγράφεται μόνο η γραμμή AIRSPEED (knots) του `instrument-18`· κρατιέται
  το όριο πορείας.

---

### 2. `formation-13` — FORMATION APPROACH. · κάθετη διάσταση

> ✅ **ΑΠΑΝΤΗΘΗΚΕ 2026-07-31 → 2α** — το `+ 10΄ / − 5΄` του ίδιου του item ΑΝΤΙΚΑΘΙΣΤΑ τη VERTICAL SEPARATION, και για τους δύο κωδικούς.

**Πού:** PDF σελ. 68–69 · ρόλος **WINGMAN** · `kind: "none"` ·
`rule: "explicit_reference"`

**Τι λέει η πηγή, αυτούσια:**
> «The fingertip criteria, concerning longitudinal and lateral separation, are applied.
> Moreover, SP can fly up to + 10' / - 5' altitude difference from Leader's wing level.»

**Το σκεπτικό:** ο στόχος της παραπομπής είναι μονοσήμαντος — `formation-17` FINGERTIP,
υποενότητα `2/ SPECIFIC CRITERIA (AS WINGMAN)` (PDF σελ. 70–71), δηλαδή ο ρόλος
συμφωνεί. Αμφίσημη είναι η **έκταση** εφαρμογής: το ίδιο το `formation-13` τυπώνει δικό
του υψομετρικό όριο `+ 10' / − 5'` **χωρίς διάκριση κωδικών 1/3**, το οποίο **δεν
ταυτίζεται** με τη γραμμή VERTICAL SEPARATION του `formation-17`.

| | κωδ. «1» | κωδ. «3» |
|---|---|---|
| VERTICAL SEPARATION (από `formation-17`) | + 6΄ / − 10΄ | ± 4΄ |
| όριο τυπωμένο στο ίδιο το `formation-13` | + 10΄ / − 5΄ (ενιαίο, χωρίς κωδικούς) | |

Οι τιμές αντιγράφηκαν **αμετάβλητες** από το `formation-17` μέχρι να αποφασιστεί· η
αντίφαση καταγράφεται στο `override_note` της γραμμής.

**Επιλογές:**

- **2α — ΑΝΤΙΚΑΤΑΣΤΑΣΗ:** το `+ 10΄ / − 5΄` του ίδιου του item **υπερισχύει** και ισχύει
  και για τους δύο κωδικούς.
  *Συνέπεια:* η γραμμή VERTICAL SEPARATION γίνεται `plus: 10 / minus: 5` (feet) για κωδ.
  «1» **και** κωδ. «3», με `interpolation: "undefined"` (δεν υπάρχει διαφοροποίηση να
  παρεμβληθεί).

- **2β — ΠΡΟΣΘΕΤΟ ΟΡΙΟ:** το `+ 10΄ / − 5΄` είναι **απόλυτο όριο ασφαλείας πάνω από** τα
  κριτήρια fingertip.
  *Συνέπεια:* η γραμμή VERTICAL SEPARATION μένει ως έχει (+6΄/−10΄ · ±4΄) και το
  `+ 10΄ / − 5΄` καταγράφεται ως πρόσθετος, μη-κωδικοποιημένος περιορισμός.

---

### 3. `formation-13` — FORMATION APPROACH. · διαμήκης διάσταση

> ✅ **ΑΠΑΝΤΗΘΗΚΕ 2026-07-31 → 3α** — η OBSERVANCE ANGLE αποδίδει τη διαμήκη θέση· η γραμμή διατηρείται.

**Το σκεπτικό:** η παραπομπή λέει ρητά «**longitudinal** and lateral separation», αλλά ο
πίνακας FINGERTIP **δεν έχει γραμμή longitudinal**. Έχει τρεις γραμμές: LATERAL
SEPARATION, VERTICAL SEPARATION και OBSERVANCE ANGLE (`50° ± 5°` κωδ. «1» /
`30° ± 5°` κωδ. «3»). Η γωνία παρατήρησης είναι γεωμετρικά συνδεδεμένη με τη διαμήκη
θέση του wingman, αλλά η πηγή δεν το λέει.

**Επιλογές:**

- **3α — Η OBSERVANCE ANGLE αποδίδει τη διαμήκη διάσταση.**
  *Συνέπεια:* η γραμμή διατηρείται ως έχει και θεωρείται το διαμήκες κριτήριο.

- **3β — Δεν υπάρχει διαμήκες αριθμητικό κριτήριο για αυτό το item.**
  *Συνέπεια:* η OBSERVANCE ANGLE διατηρείται ως αυτοτελής παράμετρος γωνίας, και η
  διαμήκης θέση κρίνεται μόνο ποιοτικά (general criteria).

---

### 4. `vfr_navigation-16` — FORMATION APPROACH · στόχος / ρόλος

> ✅ **ΑΠΑΝΤΗΘΗΚΕ 2026-07-31 → γενικό** — ΔΕΝ εξειδικεύεται κατά ρόλο· κρατούνται και τα δύο σετ (`contact-05` + `formation-17`).

**Πού:** PDF σελ. 88 · `kind: "reference"` · `rule: "explicit_reference"`

**Τι λέει η πηγή, αυτούσια:**
> «As described in Formation Category.»

**Το σκεπτικό:** η κατηγορία Formation περιέχει **δύο** items με το ίδιο ακριβώς όνομα:
`formation-06` «(6) FORMATION APPROACH» (ρόλος **LEADER**, PDF 64) και `formation-13`
«(13) FORMATION APPROACH.» (ρόλος **WINGMAN**, PDF 68–69). Η πηγή δεν διευκρινίζει ποιο
εννοεί. Τα δύο δίνουν εντελώς διαφορετικά αριθμητικά πρότυπα.

| Επιλογή A — LEADER (`formation-06` → `contact-05`) | κωδ. «1» | κωδ. «3» |
|---|---|---|
| ALTITUDE (feet) | ± 300΄ | ± 150΄ |
| AIRSPEED (knots) | ± 20 | ± 10 |
| EXIT HEADING (degrees) | ± 10° | ± 5° |

| Επιλογή B — WINGMAN (`formation-13` → `formation-17`) | κωδ. «1» | κωδ. «3» |
|---|---|---|
| LATERAL SEPARATION (feet) | − 0΄ / + 20΄ | − 0΄ / + 10΄ |
| VERTICAL SEPARATION (feet) | + 6΄ / − 10΄ | ± 4΄ |
| OBSERVANCE ANGLE (degrees) | 50° ± 5° | 30° ± 5° |

*συν* το μη-κωδικοποιημένο `+ 10΄ / − 5΄` υψομετρικής διαφοράς από το wing level του
Leader.

**Τεκμηριωμένο επιχείρημα υπέρ της B:** ο SP της Φάσης ΙΙ στις εξόδους ναυτιλίας
σχηματισμού (`Ν44ΧΧ` / `Ν45ΧΧ`) πετά κατά κανόνα ως **Νο2** σε 2-ship. Πρβλ.
`vfr_navigation-23` κριτήριο d/ «Is able to expect Νο1 intentions as a wingman but he/she
never assumes.» και τον τίτλο του ίδιου του `vfr_navigation-05`:
«BASIC A/C CONTROL / **WINGMAN CONSIDERATION**». **Δεν** εφαρμόστηκε αυτόματα.

**Επιλογές:**

- **4α — LEADER:** ισχύει μόνο το σετ `contact-05` (3 γραμμές).
  *Συνέπεια:* διαγράφονται οι 3 γραμμές `formation-17`.

- **4β — WINGMAN:** ισχύει μόνο το σετ `formation-17` (3 γραμμές).
  *Συνέπεια:* διαγράφονται οι 3 γραμμές `contact-05`.

- **4γ — ΑΝΑ ΡΟΛΟ (role-aware):** κρατούνται και τα δύο σετ και η επιλογή γίνεται τη
  στιγμή της βαθμολόγησης, ανάλογα με τον ρόλο που πέταξε ο SP στη συγκεκριμένη έξοδο —
  ακριβώς όπως ήδη γίνεται στην κατηγορία Formation (υποενότητες LEADER / WINGMAN).
  *Συνέπεια:* τα `parameters` μένουν ως έχουν, ο διαχωρισμός γίνεται με το `provenance`,
  και το φύλλο βαθμολόγησης πρέπει να καταγράφει τον ρόλο.

> ⚠ **Εξάρτηση:** αν επιλέξετε **4β** ή **4γ**, η απάντησή σας στην **απόφαση 2**
> μεταφέρεται αυτόματα και εδώ — το `vfr_navigation-16` κουβαλά τις ίδιες τρεις γραμμές
> του `formation-17`, μαζί με την αμφισβητούμενη VERTICAL SEPARATION.

---

## Β΄ ΜΕΡΟΣ — ΠΡΟΑΙΡΕΤΙΚΕΣ ΕΠΙΒΕΒΑΙΩΣΕΙΣ

Τα παρακάτω **έχουν ήδη λυθεί** (`status: "resolved"`) με τεκμηριωμένη προεπιλογή. Δεν
χρειάζεται να απαντήσετε — απαντήστε μόνο αν θέλετε να αλλάξει η προεπιλογή.

---

### 5. `instrument-28` — LANDING · εμβέλεια της αριθμητικής υπέρβασης

> ✅ **ΑΠΑΝΤΗΘΗΚΕ 2026-07-31 → 5α** — η προεπιλογή ισχύει· ΚΑΜΙΑ αλλαγή δεδομένων.

**Τι λέει η πηγή, αυτούσια:**
> «Specific criteria of the corresponding section of the Contact category apply, except
> for the parameters regarding the touch down from the beginning of RWY (**for landing
> after Precision Approach**). Specifically, for standard “1” the effective distance
> limits are modified to ± 1.000 feet and for standard “3” to ± 500 feet, from the
> projected Touch Down Point.»

**Τι έγινε:** αντιγράφηκαν και οι 6 γραμμές του πίνακα LANDING του `contact-24`
(υπο-πίνακες `a/ FLAPS LDG - FLAPS T/O – AΟA.` και `b/ FLAPS UP`) και τροποποιήθηκαν
**μόνο** οι δύο γραμμές `TOUCH DOWN POINT`:

| | πριν (`contact-24`) | μετά (`instrument-28`) |
|---|---|---|
| υπο-πίνακας `a/` | 1500΄ / 1000΄ | ± 1.000 feet / ± 500 feet |
| υπο-πίνακας `b/` | 2000΄ / 1500΄ | ± 1.000 feet / ± 500 feet |
| σημείο αναφοράς | **αρχή του διαδρόμου** (απόλυτο άνω όριο) | **projected touch-down point** (συμμετρική απόκλιση) |
| `interpolation` | `undefined` | `standard` (κωδ. «2» = 500–1000 ft) |

*(«± 1.000 feet» = 1000 πόδια — ευρωπαϊκό διαχωριστικό χιλιάδων, όχι 1,0 ft.)*

**Το ανοιχτό σημείο:** η τυπωμένη παρένθεση «(for landing after Precision Approach)»
περιορίζει κατά γράμμα την υπέρβαση στις προσγειώσεις μετά από **precision** προσέγγιση
(ILS / GCA PAR). Για μη-precision προσεγγίσεις (VOR/TACAN/LOCALIZER/ASR) θα ίσχυαν τα
πρωτότυπα όρια του `contact-24`.

- **5α — ΤΡΕΧΟΥΣΑ ΠΡΟΕΠΙΛΟΓΗ:** η υπέρβαση εφαρμόζεται σε όλο το item `instrument-28`,
  και ο περιορισμός καταγράφεται μόνο ως σημείωση (`override_note`).
- **5β — ΚΑΤΑ ΓΡΑΜΜΑ:** διπλό σετ ορίων touch-down — `± 1000 / ± 500` ft μετά από
  precision approach, `1500΄/1000΄` και `2000΄/1500΄` (από την αρχή του διαδρόμου) μετά
  από μη-precision approach.

---

### 6. `vfr_navigation-04` — VFR DEPARTURE / SID · η γραμμή COURSE DEVIATION

> ✅ **ΑΠΑΝΤΗΘΗΚΕ 2026-07-31 → 6β** — η γραμμή COURSE DEVIATION (`instrument-03`) ΑΦΑΙΡΕΘΗΚΕ.

**Τι έγινε:** εκτός από τις 3 γραμμές Basic A/C Control (`vfr_navigation-05`) που
προβλέπει ο κανόνας 7.a(5), προστέθηκε και η γραμμή `COURSE DEVIATION (radials)`
`± 8 / ± 5` από το `instrument-03` (SID), με `scope_note` που την περιορίζει **μόνο στο
σκέλος SID**.

**Το σκεπτικό:** το γενικό κριτήριο a/ του item λέει «All corresponding criteria from
Contact, Instrument and Formation categories.» και το ίδιο το όνομα του item περιέχει
«/ SID». Η προσθήκη όμως **υπερβαίνει το γράμμα** του κανόνα 7.a(5), που προβλέπει μόνο
τον πίνακα Basic A/C Control.

- **6α — ΤΡΕΧΟΥΣΑ ΠΡΟΕΠΙΛΟΓΗ:** η γραμμή διατηρείται, με ισχύ μόνο στο σκέλος SID.
- **6β — ΑΥΣΤΗΡΑ:** η γραμμή αφαιρείται· μένουν μόνο οι 3 γραμμές Basic A/C Control.

---

### 7. `vfr_navigation-15` / `vfr_navigation-20` — INSTRUMENT PROCEDURES · υπό όρους πίνακες

> ✅ **ΑΠΑΝΤΗΘΗΚΕ 2026-07-31 → 7α** — η προεπιλογή ισχύει· ΚΑΜΙΑ αλλαγή δεδομένων.

**Τι λέει η πηγή, αυτούσια:** «As described in Instrument Category.» — παραπομπή σε
**ολόκληρη κατηγορία**, στην οποία δεν υπάρχει item με το όνομα «INSTRUMENT PROCEDURES».
*(Τα δύο items είναι γνήσια διπλοεγγραφή του πρωτοτύπου στην ίδια σελίδα — README §7.2.)*

**Τι έγινε:** φορτώθηκε το βασικό, πάντα ισχύον πρότυπο `instrument-04` (Basic A/C
Control, 3 γραμμές). **Δεν** αντιγράφηκαν οι πίνακες των επιμέρους διαδικασιών
(`instrument-03` SID, `-12`/`-13` course intercept & maintaining course, `-14`/`-15` arc,
`-16` point to point, `-17` holding, `-18` penetration, `-20` VOR/TACAN, `-21` ILS,
`-22` LOC, `-23` ASR, `-24` PAR, `-29` missed approach), επειδή η πηγή δεν κατονομάζει
καμία — απλώς καταγράφηκαν σε εγγραφή `sources` με `item: null`.

- **7α — ΤΡΕΧΟΥΣΑ ΠΡΟΕΠΙΛΟΓΗ:** μόνο το `instrument-04` φορτώνεται· οι υπόλοιποι πίνακες
  εφαρμόζονται δυναμικά, μόνο αν η συγκεκριμένη διαδικασία όντως εκτελεστεί στην έξοδο.
- **7β — ΠΡΟ-ΦΟΡΤΩΣΗ:** αντιγράφονται και οι 14 πίνακες μέσα στο item, με `provenance` ανά
  διαδικασία, ώστε το item να είναι αυτάρκες.

---

## Σύνοψη για γρήγορη απάντηση

| # | item | ερώτημα | επιλογές | προεπιλογή |
|---|---|---|---|---|
| 1 | `instrument-19` | έκταση παραπομπής | α = μόνο Basic A/C Control · β = + `instrument-18` (ταχύτητα `instrument-18`) · γ = + `instrument-18` (ταχύτητα `instrument-04`) | **α** |
| 2 | `formation-13` | κάθετη διάσταση | α = `+10΄/−5΄` αντικαθιστά · β = πρόσθετο απόλυτο όριο | — |
| 3 | `formation-13` | διαμήκης διάσταση | α = OBSERVANCE ANGLE = διαμήκες κριτήριο · β = δεν υπάρχει διαμήκες κριτήριο | — |
| 4 | `vfr_navigation-16` | στόχος / ρόλος | α = LEADER · β = WINGMAN · γ = ανά ρόλο | — |
| 5 | `instrument-28` | εμβέλεια υπέρβασης | α = σε όλο το item · β = μόνο μετά από precision approach | **α** |
| 6 | `vfr_navigation-04` | γραμμή COURSE DEVIATION | α = διατηρείται (μόνο SID) · β = αφαιρείται | **α** |
| 7 | `vfr_navigation-15/-20` | πίνακες διαδικασιών | α = δυναμικά · β = προ-φόρτωση 14 πινάκων | **α** |

**ΑΠΑΝΤΗΘΗΚΕ 2026-07-31:** `1α · 2α · 3α · 4 γενικό · 5α · 6β · 7α` — βλ. ενότητα
«ΑΠΑΝΤΗΣΕΙΣ (2026-07-31)» στην αρχή του αρχείου για την εφαρμογή κάθε απόφασης.

Παράδειγμα απάντησης: `1α, 2β, 3α, 4γ` — ή απλώς `1α, 2α, 3α, 4β` κ.ο.κ.
