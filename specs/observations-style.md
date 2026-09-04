# Observations — ΤΟ ΣΥΜΒΟΛΑΙΟ ΥΦΟΥΣ (Γύρος 26)

> Ο κανόνας που ακολουθεί **κατά γράμμα** όποιος γράφει ή διορθώνει κείμενο στο
> `data/observations2/`. Δένει τις **τέσσερις αποφάνσεις του Διοικητή Σμήνους της
> 29/08/2026** με τη ΒαΔ 3-1/2025 §41 και με τους πίνακες κριτηρίων του Phase 2
> Syllabus. Ό,τι δεν είναι εδώ γραμμένο, δεν γράφεται.

Αρχεία που αφορά: `data/observations2/<category>/<item>.json` (117 αρχεία items ·
1 824 error_modes · 4 αρχεία `index.json`) · ο συνθέτης `app/app.js → expandV2()` ·
η αναζήτηση `app/remarksearch.js` · ο έλεγχος `tools/check_observations.py`.
Πηγές αλήθειας: `3-01_2025_ΔΑΕ.pdf` §41 (σελ. εγγράφου 39-41) · `data/criteria/*.json` ·
`data/technique/technique.json` · `data/human_factors.json` · `data/mif/t6a.json`.

---

## 1. Η ΚΑΝΟΝΙΣΤΙΚΗ ΒΑΣΗ — ΒαΔ 3-1/2025 §41 (verbatim)

Η παρατήρηση ΔΕΝ είναι σχόλιο· είναι **θεσμικό πεδίο του Φύλλου Βαθμολογίας**. Ο
κανονισμός λέει τέσσερα πράγματα που κυβερνούν κάθε γραμμή αυτού του συμβολαίου:

> **§41.β** «Είναι σημαντικό να αναγράφονται **αρνητικές ή θετικές** παρατηρήσεις –
> επισημάνσεις, προκειμένου να απεικονίζονται σημαντικά στοιχεία από την απόδοση και
> τις ικανότητες του μαθητή στην πτήση.»

> **§41.γ** «Οι παρατηρήσεις να αναγράφονται υποχρεωτικά, όποτε υπάρχει **απόκλιση**
> από τα προβλεπόμενα επίπεδα απόδοσης … έτσι ώστε να διαφαίνεται **η αιτία**, αλλά
> και **η απόκλιση από τις παραμέτρους** των ελιγμών.»

> **§41.δ** «… πρέπει να αναγράφονται παρατηρήσεις **όταν η απόδοση είναι οριακή**,
> εντός των προβλεπόμενων κωδικών και διαφαίνονται τάσεις … Ακόμα **επιβάλλεται να
> αναγράφονται σχόλια ή εκτιμήσεις, όταν η απόδοση του είναι πάνω από τους
> προβλεπόμενους κώδικες, προκειμένου να δικαιολογηθεί η πολύ υψηλή βαθμολογία** στη
> γενική απόδοση.»

> **§41.στ** «Στις παρατηρήσεις, απαιτείται να αναγράφονται **με ακρίβεια η απόκλιση ή
> το σφάλμα, αλλά και η αιτία που το προκαλεί** και όχι διατυπώσεις του τύπου
> «ασταθής στο ύψος ή στην ταχύτητα» κλπ ή άλλες αδόκιμες εκφράσεις που δεν
> περιέχονται στα αντίστοιχα θεσμικά κείμενα και εγχειρίδια πτήσης.»

> **§41.ζ** «… το σύμβολο # … πριν τον αριθμό του ΕΑ … ο **προβλεπόμενος** κώδικας σε
> παρένθεση ( ), στη συνέχεια το βέλος και μετά ο κώδικας που **επέτυχε** ο μαθητής …
> πχ: **#25. (2) → (1): Ο μαθητής, λόγω…(η αδυναμία ή η εσφαλμένη τεχνική)… δεν
> …(το αίτιο)… με αποτέλεσμα να…(το αποτέλεσμα – απόκλιση, ποιοτικά ή με νούμερο).**»

**Η §41.δ είναι το νομικό έρεισμα της Απόφανσης 1.** Η παρατήρηση πάνω από τον MIF
υπάρχει για να **ΔΙΚΑΙΟΛΟΓΗΣΕΙ ΤΗΝ ΥΨΗΛΗ ΒΑΘΜΟΛΟΓΙΑ**. Ένα κείμενο που απαριθμεί
σφάλματα δεν δικαιολογεί τίποτα — αντιφάσκει με τον ίδιο του τον σκοπό.

---

## 2. Ο ΜΗΧΑΝΙΣΜΟΣ — Ο ΑΞΟΝΑΣ ΕΙΝΑΙ Η **ΣΧΕΣΗ**, ΟΧΙ Ο ΚΩΔΙΚΑΣ

### 2.1 Το εύρημα

Ο ίδιος επιτευχθείς κώδικας σημαίνει **δύο αντίθετα πράγματα** ανάλογα με τον
επιθυμητό. Ένα (2) απέναντι σε επιθυμητό (3) είναι **οπισθοδρόμηση**· το ίδιο (2)
απέναντι σε επιθυμητό (1) είναι **επίτευγμα**. Μέχρι αυτόν τον γύρο και τα δύο
τραβούσαν το ΙΔΙΟ string από το `texts["2"]`. Η αποφανθείσα περίπτωση:

```
instrument-10-tm04-d1a2   (1) → (2), ΠΑΝΩ από τον MIF
"SP, due to a delayed power reduction in the nose-low recovery, entered the pull
 with more speed than necessary and had to use the speed brake to stop the trend.
 ... Above end of block MIF achieved."
```

«…ενώ τα έχει πάει **καλύτερα** από το επιθυμητό για το στάδιο εμπειρίας του και
εκπαίδευσης που έχει μέχρι εκείνη τη στιγμή.»

### 2.2 Η απόφαση — ΥΒΡΙΔΙΟ: οικογένειες κειμένων ανά σχέση + συνθέτης που διαλέγει με τη σχέση

Δεν διορθώνεται στον συνθέτη (καμία επεξεργασία string δεν κάνει το «λόγω
καθυστερημένης μείωσης ισχύος» να διαβαστεί ως επίτευγμα) και δεν διορθώνεται με
νέα ids (τα ids είναι σταθερά — τα δείχνουν τα Feedback links και η εφαρμογή). Η
τράπεζα αποκτά **μία οικογένεια κειμένων ανά σχέση**, ως **ΑΔΕΛΦΑ κλειδιά του
`texts`**, και ο συνθέτης διαλέγει με τη σχέση:

| σχέση | συνθήκη | κλειδί που αποδίδεται | δόγμα |
|---|---|---|---|
| **below** | `achieved < desired` | `texts["0"·"1"·"2"]` | αδυναμία, αιτία→αποτέλεσμα (§41.στ) |
| **at** | `achieved == desired` | `texts_at["1"·"2"·"3"]` | το πρότυπο ΕΠΙΤΕΥΧΘΗΚΕ + το **αίτιο** του μικρού σφάλματος, **ΧΩΡΙΣ σκάλα** (§41.δ) |
| **above** | `achieved > desired` | `texts_above["1"·"2"·"3"·"4"]` | **πρώτα το επίτευγμα**, μετά η απόδοση της σκάλας (§41.δ) |

Το ακριβές σχήμα μέσα σε κάθε `error_mode` (τα `texts_at` / `texts_above` κάθονται
**δίπλα** στο `texts`, ΠΟΤΕ μέσα του — οι υπάρχοντες validators
`tools/index_*_v2.py` απορρίπτουν άγνωστο κλειδί μέσα στο `texts`):

```json
{
  "id": "instrument-10-tm04",
  "label": "Nose-low recovery - power reduction and speed brake as required",
  "mif_row": 10,
  "source": "technique:7.15 UNUSUAL ATTITUDE RECOVERIES",
  "hf_concept": null,
  "texts": { "0": "...", "1": "...", "2": "...", "3": "...", "4": "...", "marginal": "..." },
  "texts_at":    { "1": "...", "2": "...", "3": "..." },
  "texts_above": { "1": "...", "2": "...", "3": "...", "4": "..." }
}
```

*Πού μπαίνουν:* αμέσως **μετά** το `"texts"`, στην ίδια στοίχιση (6 κενά για το
κλειδί, 8 για τα εσωτερικά), με το ίδιο 2-space indent / LF / χωρίς BOM /
τελικό newline που έχει ήδη το αρχείο.

### 2.3 Τι έγινε ήδη (ο μηχανισμός στέκει ΠΡΙΝ γράψει ο πρώτος γραφέας)

* `app/app.js → expandV2()` επιλύει με τη σχέση, με **ρητή υποχώρηση**: κλειδί που
  λείπει αποδίδει ό,τι απέδιδε πριν τον γύρο. Άρα σε **κάθε** ενδιάμεσο commit η
  τράπεζα είναι καταναλώσιμη και κανένα id δεν εξαφανίζεται.
* Κάθε παραγόμενη παρατήρηση φέρει τώρα `relation` («below/at/above») και `srcKey`
  (π.χ. `texts_above.2`) — το Feedback issue δείχνει πλέον στο **κλειδί που
  πραγματικά τυπώθηκε**, όχι στον κωδικό.
* Η καταληκτική πρόταση **`Above end of block MIF achieved.`** μπαίνει **ΜΟΝΟ από τον
  συνθέτη**, μία φορά, και δεν διπλασιάζεται. **Ο γραφέας ΔΕΝ την πληκτρολογεί.**
* `app/remarksearch.js` δεικτοδοτεί και τις τρεις οικογένειες, με σήμανση σχέσης και
  σήμανση `legacy` για κλειδί που οι νέες οικογένειες κατέστησαν μη-αποδοτέο.
* `VARIANT_LABELS.marginal`: «Marginal @ MIF» → **«At MIF»** (η καρτέλα δεν μπορεί να
  λέει «marginal» πάνω από κείμενο που δηλώνει ότι το πρότυπο επιτεύχθηκε).

**Τα ids ΔΕΝ αλλάζουν.** Η σύνθεση παραμένει `<mode-id>-d<D>a<A>`, 20 ζεύγη ανά mode.
`instrument-10-tm04-d1a2` εξακολουθεί να υπάρχει — απλώς τραβάει πλέον από
`texts_above["2"]` αντί για `texts["2"]`.

---

## 3. Ο ΠΙΝΑΚΑΣ ΥΦΟΥΣ (tone matrix)

### 3.1 BELOW — `texts["0"|"1"|"2"]` (δεν αλλάζει δόγμα· **εμπλουτίζεται**)

Σκελετός §41.ζ, αυτούσιος:

> `SP, due to <ΑΙΤΙΑ: εσφαλμένη τεχνική ή human factor>, <ΤΙ δεν έγινε, με το
> λεξιλόγιο των General Criteria του item>, with the result that <ΑΠΟΤΕΛΕΣΜΑ:
> απόκλιση εντός της ζώνης του επιτευχθέντος κωδικού>. <Η ενέργεια του IP όταν
> ΑΥΤΗ ορίζει τον κωδικό.>`

* **κώδικας 2** — απόκλιση ανάμεσα στο code 3 και στο code 1, ο SP την **αναγνώρισε
  και τη διόρθωσε μόνος**, χωρίς παρότρυνση.
* **κώδικας 1** — απόκλιση **στο όριο** της ανοχής, διόρθωση **μετά από προφορική
  παρότρυνση** του IP· καμία επέμβαση στα χειριστήρια.
* **κώδικας 0** — απόκλιση **έξω** από τη μέγιστη ανοχή **ή/και επέμβαση του IP στα
  χειριστήρια**. Η επέμβαση από μόνη της ορίζει το 0 (ΒαΔ 3-1 §36 για την απώλεια
  ελέγχου) — τότε το νούμερο είναι προαιρετικό.

Απαγορεύεται: οποιαδήποτε λέξη της σκάλας στη θέση απόδοσης, οποιαδήποτε φράση
«πάνω από τον απαιτούμενο κώδικα», η καταληκτική πρόταση του above.

### 3.2 AT — `texts_at["1"|"2"|"3"]` (Η ΕΞΑΙΡΕΣΗ ΤΗΣ ΑΠΟΦΑΝΣΗΣ 2)

> «**Από 3 σε 3 δεν μπορούμε να πούμε very good, δεν βγάζει νόημα.**»

Στο at-level το κείμενο **δηλώνει απλά το ΑΙΤΙΟ** του (μικρού) σφάλματος, αιτία→
αποτέλεσμα, **πλαισιωμένο ως επίτευξη του επιθυμητού προτύπου για το στάδιο**.
Τέσσερις υποχρεωτικές κινήσεις, με αυτή τη σειρά:

1. **Το γεγονός** — τι πέτυχε ο SP, μέσα στα πρότυπα.
2. **Το αίτιο** — γιατί το σφάλμα (μικρό) υπήρξε· τεχνική ή human factor, ονομαστικά.
3. **Η δήλωση προτύπου** — μία από τις εγκεκριμένες διατυπώσεις (§4.4).
4. **Η τάση / προσδοκία** — «SP is expected to …» (το ζητά ρητά η §41.δ).

**ΑΠΑΓΟΡΕΥΟΝΤΑΙ ΑΠΟΛΥΤΩΣ στο at-level:** `good` / `very good` / `excellent` και κάθε
συνώνυμό τους **στη θέση απόδοσης**, κάθε λέξη-έπαινος (`excellent`, `exceptional`,
`exemplary`, `superior`, `first-rate`, `faultless`, `very good`, `notably good`,
`consistently accurate`, `well-developed`, `sure-handed`) οπουδήποτε, κάθε φράση
«πάνω από τον απαιτούμενο κώδικα», και η καταληκτική πρόταση του above.

### 3.3 ABOVE — `texts_above["2"|"3"|"4"]` (+ προαιρετικά `["1"]`) — Η ΑΠΟΦΑΝΣΗ 1

**ΤΟ ΕΠΙΤΕΥΓΜΑ ΠΡΩΤΑ. Πάντα.** Τρεις κινήσεις:

1. **Πρόταση 1 — ΤΙ ΠΕΤΥΧΕ, με το νούμερο.** Το ρήμα είναι ενέργεια του SP, όχι
   αποτυχία. Ξεκινά με `SP <ρήμα>` — **ΠΟΤΕ** με `SP, due to …`.
2. **Πρόταση 2 (προαιρετική) — η πινελιά.** *Ελαφρύ coaching touch*, ποτέ αλυσίδα
   αδυναμίας. Επιτρεπτές μορφές: «The only refinement available was …», «… would
   make the next repetition tighter still», «The technique is already sound; …».
   **Απαγορευμένες:** «due to», «failed», «did not», «had to», «with the result that».
3. **Πρόταση 3 — Η ΑΠΟΔΟΣΗ ΤΗΣ ΣΚΑΛΑΣ** (§4).

Ο συνθέτης προσθέτει μετά, μόνος του, το `Above end of block MIF achieved.`
**Σύνολο γραμμένων προτάσεων: 2 έως 4** (ώστε το αποδοθέν να μείνει 3-5).

**Το αποφανθέν παράδειγμα, ξαναγραμμένο** (`instrument-10-tm04`, `texts_above["2"]`,
αποδίδεται στο `d1a2`, `d0a2`):

> *ΠΡΙΝ (λάθος τόνος — κατηγορώ μαθητή που ξεπέρασε το στάδιό του):*
> «SP, due to a delayed power reduction in the nose-low recovery, entered the pull
> with more speed than necessary and had to use the speed brake to stop the trend. …»

> *ΜΕΤΑ:*
> «SP recognized each nose-low entry and recovered it without prompting, using the
> speed brake to hold the peak airspeed to about 15 kt above the target and the
> altitude excursion to roughly 200 ft. Making the power reduction part of the first
> recovery action, together with the roll, would keep even that margin smaller.
> The result is above the code required for this Training Section, due to good
> energy management in the dive.»
> — και ο συνθέτης κλείνει: *«Above end of block MIF achieved.»*

---

## 4. Η ΣΚΑΛΑ, ΟΙ ΠΑΛΕΤΕΣ ΚΑΙ Η ΚΑΤΑΝΟΜΗ (ΑΠΟΦΑΝΣΗ 2)

### 4.1 Οι βαθμίδες

Όταν ο SP **ΥΠΕΡΒΑΙΝΕΙ** τον επιθυμητό κώδικα, η καταληκτική απόδοση ακολουθεί τον
**ΕΠΙΤΕΥΧΘΕΝΤΑ** κώδικα:

| επιτευχθείς | βαθμίδα | παλέτα (ο έλεγχος ζητά **συνώνυμα**, όχι παπαγαλία) |
|---|---|---|
| **2** | *good* | `good` · `sound` · `solid` · `steady` · `dependable` · `assured` · `competent` |
| **3** | *very good* | `very good` · `sure-handed` · `well-developed` · `consistently accurate` · `notably good` · `precise` · `disciplined` |
| **4** | *excellent* | `excellent` · `exceptional` · `outstanding` · `exemplary` · `superior` · `first-rate` · `faultless` |
| **1** | *(αβαθμίδωτο)* | **καμία λέξη-έπαινος.** Βλ. §12, ερώτημα 2 |

### 4.2 Ο κανόνας κατανομής (μετράται ανά **αρχείο**, ανά βαθμίδα)

* **τουλάχιστον `max(3, ceil(n/4))` διαφορετικά επίθετα** για n κείμενα της βαθμίδας·
* **καμία λέξη σε πάνω από 40 %** των κειμένων της βαθμίδας του αρχείου·
* **και το ΟΥΣΙΑΣΤΙΚΟ αλλάζει**: η απόδοση είναι `<επίθετο> + <ονομασμένη τεχνική /
  αεροπορικό χαρακτηριστικό>` — «due to good **energy management in the dive**»,
  «due to sound **instrument cross-check**», «due to solid **pattern discipline**».
  Η ίδια δυάδα δεν επαναλαμβάνεται μέσα στο ίδιο αρχείο.

### 4.3 Οι εγκεκριμένες καταληκτικές διατυπώσεις του above

Μία από αυτές, υποχρεωτικά (τις αναγνωρίζει ο έλεγχος):

* `The result is above the code required for this Training Section, due to <ADJ> <noun>.`
* `Performance was above the level required at this point of the syllabus, due to <ADJ> <noun>.`
* `This is beyond what the Training Section asks for at this stage, due to <ADJ> <noun>.`
* `<ADJ> <noun> carried the maneuver above the code required for this Training Section.`

### 4.4 Οι εγκεκριμένες δηλώσεις προτύπου του at-level

* `Performance met the desired standard for this stage.`
* `This is consistent with the expected proficiency for the Training Section.`
* `The maneuver was flown to the standard the Training Section requires at this point.`
* `Performance remained inside the standard required for this stage of training.`
* `The result is in line with the proficiency expected at this point of the syllabus.`
* `The standard for the Training Section was met.`

Και μετά, υποχρεωτικά, η πρόταση τάσης: `SP is expected to …`.

---

## 5. Ο ΣΙΔΕΡΕΝΙΟΣ ΚΑΝΟΝΑΣ ΤΩΝ ΑΡΙΘΜΩΝ (ΑΠΟΦΑΝΣΗ 3)

> **Κάθε απόκλιση που αναφέρει ένα κείμενο πρέπει να πέφτει ΜΕΣΑ στη ζώνη του
> ΕΠΙΤΕΥΧΘΕΝΤΟΣ κωδικού, για ΕΚΕΙΝΟ το item, διαβασμένη από τον ΔΙΚΟ ΤΟΥ πίνακα.**
> **Αριθμός που αντιφάσκει με τον κωδικό του είναι χειρότερος από καθόλου αριθμό.**

### 5.1 Πού διαβάζεται ο πίνακας

`data/criteria/<category>.json → items[] (id == item_id) → expected_performance`:
* `specific_criteria.kind == "table"` → `specific_criteria.parameters[]` (δικός του πίνακας)·
* `kind == "none" | "reference"` → `expected_performance.resolved.parameters[]`
  (κληρονομημένος, με πλήρη provenance — π.χ. το `instrument-10` παίρνει τα Basic
  A/C Control standards του `instrument-04` κατά §7.a(5)).
Η ίδια πληροφορία φαίνεται ζωντανά στο **ℹ Info** της εφαρμογής. Το τυπωμένο υπόμνημα:

> **Code 2 = between 1 and 3 · Code 4 = better than 3 · Code 0 = beyond 1 or IP intervention.**

### 5.2 Οι ζώνες — `kind: "deviation"` (569 από τις 612 τιμές)

Με `C1` = ανοχή code 1 (μέγιστη) και `C3` = ανοχή code 3 (επιθυμητή), **ανά πλευρά**:

| κώδικας | ζώνη | τυπική διατύπωση |
|---|---|---|
| **0** | `> C1` **ή** επέμβαση IP | «more than 300 ft, outside the maximum tolerance» / «the IP took the controls» |
| **1** | `C3 < v <= C1`, **στο πάνω άκρο** (`>= C1 - 0.25·(C1-C3)`) | «about 300 ft, at the tolerance limit» |
| **2** | **αυστηρά** `C3 < v < C1`, κατά προτίμηση στο μέσο | «roughly 200 ft, between the desired and the maximum tolerance» |
| **3** | `v <= C3` (τυπικά `0.6·C3 … C3`) | «within 150 ft of the target» |
| **4** | **σαφώς** καλύτερα από `C3` (`<= 0.4·C3`) ή ποιοτικά | «inside 50 ft» · «a few tens of feet» · «negligible» |

**Στρογγύλεμα:** μόνο τιμές που διαβάζονται σε όργανο — πολλαπλάσια του 5 κάτω από
100, του 10 πάνω από 100· μοίρες/dots/AOA ακέραια ή μισά.

### 5.3 ΑΣΥΜΜΕΤΡΙΑ ΚΑΙ ΜΟΝΟΠΛΕΥΡΗ ΑΝΟΧΗ — η παγίδα του γύρου

Οι πίνακες ΔΕΝ είναι όλοι `±`. Ο αριθμός ελέγχεται στην **πλευρά που ονομάζει το
κείμενο**:

* `contact-23 · FINAL ALTITUDE` — C1 `+200΄, -100΄` · C3 `+100΄, -50΄`
  → code 2 **ψηλά** = 100…200 ft high· code 2 **χαμηλά** = 50…100 ft low. «80 ft high»
  σε code-2 κείμενο είναι **λάθος** (είναι code 3).
* `contact-23 · DOWN WIND / BASE AIRSPEED` — C1 `+20, -0` · C3 `+10, -0`
  → **ΑΡΓΑ ΔΕΝ ΕΠΙΤΡΕΠΕΤΑΙ ΠΟΤΕ.** Κάθε «kt slow» στο downwind είναι **code 0**.
  Ένα code-2 κείμενο μπορεί να πει «15 kt fast»· ΠΟΤΕ «5 kt slow».
* `instrument-21 · ALTITUDE DH` — C1 `+200΄, -0΄` · C3 `+100΄, -0΄` → **ποτέ κάτω από DH**.
* `formation-17 · VERTICAL SEPARATION` — C1 `+6΄, -10΄` · C3 `±4΄`.
* `formation-17 · LATERAL SEPARATION` — C1 `-0΄, +20΄` · C3 `-0΄, +10΄` (σημείο αναφοράς
  τα 10΄ ελάχιστου πλευρικού διαχωρισμού — υποσημείωση του πίνακα).

### 5.4 `kind: "range"` — επιτρεπτή ζώνη, όχι απόκλιση

`formation-18 · b/ FIGHTING WING · DISTANCE` — C1 `500’ – 1500’` · C3 `500’ – 1000’`:

* **code 3** «held between 500 and 1000 ft» · **code 4** κοντά στο ονομαστικό κέντρο·
* **code 2** εντός C1 **αλλά εκτός** C3 → «drifted out to about 1200 ft»·
* **code 1** στο ίδιο το άκρο → «reached about 1500 ft, at the outer limit»·
* **code 0** έξω από C1.
Ίδια λογική: `formation-18 · POSITION (cone)` C1 `20°–60°` · C3 `30°–45°`.

### 5.5 `kind: "nominal_change"` — δύο υπο-περιπτώσεις

* **Οροφή** (`value` μόνο): `contact-24 · TOUCH DOWN POINT` C1 `1500΄` · C3 `1000΄`
  (και `2000΄/1500΄` για FLAPS UP) → συμπεριφέρεται σαν deviation με C1/C3 = οι τιμές:
  code 3 «inside 1000 ft from the threshold», code 2 «about 1200 ft», code 1 «about
  1500 ft, at the limit», code 0 «beyond 1500 ft».
* **Ονομαστικό με παράθυρο** (`value` + `plus`/`minus`): `formation-17 · OBSERVANCE
  ANGLE` C1 `50° ± 5°` · C3 `30° ± 5°` — **αλλάζει το ίδιο το ονομαστικό**: code 3 =
  25-35 degrees, code 1 = 45-55 degrees. Ο αριθμός δεν είναι απόκλιση, είναι **θέση**.

### 5.6 `kind: "qualitative"` στο code 3 — ΜΗΝ ΕΦΕΥΡΕΘΕΙ ΝΟΥΜΕΡΟ

`instrument-24 / -25 / -26 · MAINTAINING GLIDE PATH` — C1 `Up to 300΄ high / Up to
150΄ low`, **C3 = «Slightly above / Slightly below»**. Τα κείμενα code 3 και code 4
χρησιμοποιούν την **ποιοτική** διατύπωση («slightly above the glide path», «a
fraction of a dot»). Τα code 1 / code 2 κρατούν τα αριθμητικά όρια της πλευράς τους.

### 5.7 Items ΧΩΡΙΣ αριθμητικά κριτήρια (29 από τα 117)

`contact-01/36/37/38/39/40/41/crm` · `instrument-01/30/34/crm` ·
`formation-14/15/32/33/34/35/36/37/crm` · `vfr_navigation-01/02/21/22/23/24/25/crm`.

Εκεί ο σιδερένιος κανόνας γίνεται: **ποτέ διαστατική απόκλιση για πρότυπο που δεν
υπάρχει.** Η ποσοτικοποίηση γίνεται με **μετρήσιμα γεγονότα**: πόσες προφορικές
παροτρύνσεις, πόσα items παραλείφθηκαν από τη λίστα, σε πόσες από τις επαναλήψεις,
σε ποια σειρά, «twice», «on three of the four repetitions», «one omitted item,
caught on the flow». Η βάση βαθμολόγησης είναι τα **General Criteria** του item.

### 5.8 Πυκνότητα

Κάθε κείμενο **numeric item** φέρει **τουλάχιστον έναν** ελεγμένο αριθμό — και τα
`texts_at` και τα `texts_above`, όχι μόνο τα below. Αυτό είναι το «πολύ περισσότερο
από σήμερα» της Απόφανσης 3. Δύο αριθμοί σε ένα κείμενο επιτρέπονται όταν αφορούν
**διαφορετικές παραμέτρους** του ίδιου πίνακα (π.χ. ύψος **και** ταχύτητα).

---

## 6. Η ΠΙΝΕΛΙΑ ΤΗΣ ΤΕΧΝΙΚΗΣ ΠΤΗΣΗΣ

> «Έχουμε και την τεχνική πτήσης για να βάλουμε μια πινελιά.»

Πηγή λεξιλογίου: το `source` του ίδιου του mode. Τα `-tmNN` modes φέρουν
`"technique:<section> <title>"` που δείχνει σε πραγματική ενότητα του
`data/technique/technique.json` (275 ενότητες με `technique_summary`,
`procedure_steps`, `common_errors`, `corrections`). **Ο γραφέας διαβάζει εκείνη την
ενότητα** και δανείζεται τη διατύπωσή της. Τα `-emNN` modes δανείζονται από τα
General Criteria και τον πίνακα του item.

Ενδεικτική παλέτα ανά κατηγορία (όχι εξαντλητική· **δεν** αντικαθιστά την πηγή):

* **Contact** — power setting / throttle response · pitch attitude & sight picture ·
  trim · rudder coordination · AOA and on-speed · energy management · wind
  correction & drift · clearing turns · lead point for the roll-out · aim point and
  touchdown attitude · go-around decision point.
* **Instrument** — instrument cross-check (scan pattern, rate & interpretation) ·
  control-and-performance technique · attitude first, then performance · power
  anticipation · lead point for level-off and course intercept · trim to hold the
  attitude · needle/CDI/GSI interpretation · timing and station passage · the
  transition from attitude to raw data.
* **Formation** — line-of-sight rate · closure control · sight picture (wing tip,
  star, canopy rail) · throttle anticipation · nose-tail separation · geometry of
  the rejoin turn · lead's turn rate matching · overshoot recognition and
  correction · visual signals and lookout discipline.
* **VFR Navigation** — map-to-ground orientation · checkpoint timing and ETA
  revision · drift and wind correction angle · track crawl · fuel and time
  awareness · GPS cross-check against pilotage · lookout and low-level clearing ·
  formation integrity while navigating.

Ένα human-factor αίτιο χρησιμοποιείται **μόνο** όταν το mode φέρει `hf_concept`, και
**μόνο** με φράση από το `data/human_factors.json → concepts[].cause_phrases`
(`applicability: "cause_slot"`). Δεν εφευρίσκεται ορολογία HF.

---

## 7. ΛΕΞΙΛΟΓΙΟ, ΜΗΚΟΣ, ΓΡΑΦΗ

* **Υποκείμενο πάντα `SP`. Ο εκπαιδευτής πάντα `IP`.** Ποτέ όνομα, ποτέ callsign,
  ποτέ αριθμός μητρώου, ποτέ ημερομηνία, ποτέ μονάδα, ποτέ νηολόγιο.
* **Ποτέ προσωπική αντωνυμία** (`he` / `she` / `his` / `her`). Αντί για «on his own»
  → «without prompting». *(192 υπάρχοντα κείμενα το παραβιάζουν — ο έλεγχος τα
  βγάζει ως WARN· διορθώνονται όποτε πιάνεται το κείμενο στα χέρια.)*
* **Αγγλικά, ASCII ΜΟΝΟ.** Ούτε `°`, ούτε `±`, ούτε `΄` (U+0384), ούτε «έξυπνα»
  εισαγωγικά. Γράφουμε `degrees`, `plus or minus`, `ft`, `kt`, `KIAS`, `NM`, `dots`,
  `AOA units`, `G`.
* **2 έως 5 προτάσεις** (ο μετρητής του `tools/index_*_v2.py`). Τα `texts_above`
  **2 έως 4**, γιατί ο συνθέτης προσθέτει άλλη μία.
* **Ορολογία θεσμικών κειμένων** (§41.στ). Απαγορεύεται το «unstable in altitude»,
  «not smooth», «poor technique» χωρίς κατονομασμένο αίτιο.
* Κάθε κείμενο **αυτοτελές**: διαβάζεται μόνο του, χωρίς το πρόθεμα και χωρίς τα
  γειτονικά του. Το πρόθεμα `#N. (d) → (a):` το βάζει η εφαρμογή.

---

## 8. ΤΙ ΕΠΙΤΡΕΠΕΤΑΙ ΚΑΙ ΤΙ ΟΧΙ ΝΑ ΑΛΛΑΞΕΙ Ο ΓΡΑΦΕΑΣ

**ΕΠΙΤΡΕΠΕΤΑΙ**
1. Να **προσθέσει** `texts_at` και `texts_above` σε κάθε `error_mode` του πακέτου του.
2. Να γράψει/ξαναγράψει τις **τιμές** μέσα σε αυτά τα δύο αντικείμενα.
3. Να **εμπλουτίσει** τα `texts["0"]`, `texts["1"]`, `texts["2"]` — αριθμοί, πινελιά
   τεχνικής, καθαρισμός αντωνυμιών — **κρατώντας το ίδιο αίτιο και το ίδιο θέμα**
   (το id σημαίνει ό,τι σήμαινε).

**ΑΠΑΓΟΡΕΥΕΤΑΙ**
1. Οποιοδήποτε `id` — mode ή αρχείου. **Κανένα δεν μετονομάζεται, κανένα δεν φεύγει,
   κανένα δεν επινοείται.** Τα Feedback links και η εφαρμογή τα αναφέρουν.
2. Προσθήκη / αφαίρεση / αναδιάταξη `error_modes`.
3. Αλλαγή `label`, `mif_row`, `source`, `hf_concept`.
4. **Οποιοδήποτε κλειδί μέσα στο `texts`** — μένουν ακριβώς έξι: `0 1 2 3 4 marginal`.
   Οι νέες οικογένειες είναι **αδέλφια** του, όχι παιδιά του.
5. Τα `texts["3"]`, `texts["4"]`, `texts["marginal"]` — **παγωμένα**. Είναι η
   υποχώρηση που κρατά την εφαρμογή τίμια στη μέση του γύρου, και η ιστορική
   εγγραφή από την οποία αντιγράφηκαν παλιά gradesheets.
6. `item_id`, `item_name`, `category`, `schema`, `mif_numbers`, `mif_rows`.
7. Τα `index.json` — **παράγονται**, δεν γράφονται στο χέρι.
8. Αρχείο εκτός του δικού του πακέτου. Και τίποτα εκτός `data/observations2/`.
9. Η πρόταση `Above end of block MIF achieved.` πληκτρολογημένη μέσα σε κείμενο.
10. Αναδιαμόρφωση («reflow») ολόκληρου αρχείου. **5 αρχεία έχουν ήδη CRLF**
    (`contact-29`, `contact-34`, `formation-09`, `formation-10`, `instrument-11`) —
    μένουν όπως είναι· το diff πρέπει να δείχνει μόνο τις πραγματικές αλλαγές.

---

## 9. Ο ΕΛΕΓΧΟΣ — `tools/check_observations.py`

```
python tools/check_observations.py                 # πλήρης αναφορά
python tools/check_observations.py --only contact-23   # ένα αρχείο
python tools/check_observations.py --quiet          # μόνο σύνολα και ευρήματα
python tools/check_observations.py --base <rev>     # άλλη βάση σύγκρισης ids
```

Αναφέρει, ΠΟΤΕ δεν γράφει σε αρχείο δεδομένων:

1. **SHAPE** — parse, BOM/CRLF/τελικό newline, τα έξι κλειδιά του `texts`, νόμιμα
   κλειδιά στις οικογένειες, ASCII, 2-5 προτάσεις (2-4 στο above), κενά κείμενα.
2. **IDS** — κάθε mode id και κάθε συντεθειμένο id `<mode>-d<D>a<A>` ταυτόσημο με τη
   βάση `0e5f7ae` (origin/main στην αρχή του γύρου), μέσω `git show`.
3. **LADDER** — λέξη-έπαινος ή απόδοση σκάλας σε at/below · at-level που δεν δηλώνει
   ποτέ ότι το πρότυπο επιτεύχθηκε · above που ανοίγει με τον τύπο της αδυναμίας ·
   above χωρίς λέξη της σωστής βαθμίδας στην απόδοση.
4. **NUMBERS** — best effort: κάθε διαστατικός αριθμός βγαίνει από το κείμενο και
   συγκρίνεται με τη ζώνη του **επιτευχθέντος** κωδικού, **ανά πλευρά** (plus/minus
   χωριστά). Αναγνωρίζει τις **παραθέσεις ορίου** («inside the 300 ft limit») και τις
   **απόλυτες ενδείξεις** («45 degrees of bank») και τις προσπερνά. Δύο κάδοι:
   `NUMBER FLAG` (έξω από τη ζώνη) και `NUMBER ON-BOUNDARY` (ακριβώς πάνω στο όριο).
   **Κανένας από τους δύο δεν ρίχνει τον έλεγχο** — είναι για το μάτι του ανθρώπου.
5. **PALETTE** — ανά αρχείο και βαθμίδα: πόσα διαφορετικά επίθετα, τι ποσοστό παίρνει
   το συχνότερο (καπάκι 40 %).
6. **COVERAGE** — πόσα modes έχουν πλήρη `texts_at` / `texts_above`.
7. **HYGIENE** — non-ASCII, ελληνικοί χαρακτήρες, μεγάλες ακολουθίες ψηφίων,
   αντωνυμίες, και **λίστα κεφαλαιογράμματων λέξεων εκτός λεξιλογίου** για ανθρώπινο
   μάτι. *Ο αυθεντικός έλεγχος ιδιωτικότητας είναι το τελικό grep κατά του
   `D:\FDMS-roster`, που τρέχει χωριστά στο τέλος του γύρου.*

**Έξοδος στη βάση αναφοράς (πριν γράψει ο πρώτος γραφέας):** `ERROR: 0` ·
`WARN: 192` · `NUMBER FLAG: 135` · `NUMBER ON-BOUNDARY: 284`. Αυτό είναι το
**ταβάνι**: ο γύρος δεν επιτρέπεται να το ανεβάσει.

---

## 10. ΟΡΑΤΑ IDS (ΑΠΟΦΑΝΣΗ 4) — προδιαγραφή για τον INTEGRATOR

Δεν υλοποιείται εδώ. Η θέση και η μορφή:

* **Πού:** `app/app.js → renderResults()`, μέσα στο `.obs-head`, **αμέσως μετά** το
  `<span class="obs-prefix">#N. (d) → (a):</span>` και **πριν** τα badges.
* **Τι:** `<button type="button" class="obs-id" data-id="${esc(o.id)}"
  title="Copy this observation id">${esc(o.id)}</button>` — διακριτικό mono chip.
* **CSS** (δίπλα στο `.obs-prefix`, γραμμή ~293 του `app/styles.css`):
  `font-family:Consolas,monospace; font-size:11px; color:var(--muted);
  background:var(--panel-2); border:1px solid var(--line); border-radius:6px;
  padding:1px 6px; cursor:pointer;` · `:hover` → `--accent` · `.copied` → `--good`.
* **Συμπεριφορά:** click → `navigator.clipboard.writeText(o.id)`, η ετικέτα γίνεται
  `copied ✓` για 1,2 s, με το **ίδιο fallback επιλογής κειμένου** που έχει ήδη το
  κουμπί Copy (η εφαρμογή τρέχει και σε http, όπου το clipboard API μπλοκάρεται).
* **Ίδιο chip** στο `app/remarksearch.js`: το `.rs-id` γίνεται click-to-copy του
  mode id.
* Ο offline builder ενσωματώνει τα ίδια αρχεία — δεν χρειάζεται νέο `gap`, οπότε δεν
  ακουμπά τα tripwires του ES5 gate.

---

## 11. ΤΟ ΜΟΙΡΑΣΜΑ

13 πακέτα γραφέων + 1 ανάθεση για τα `index.json`. **Και τα 121 αρχεία ανατίθενται
ακριβώς μία φορά.** Ομαδοποίηση **ανά κατηγορία**, ώστε κάθε γραφέας να κατέχει τους
πίνακες κριτηρίων μιας κατηγορίας. Ισοστάθμιση κατά **αριθμό error_modes**
(121-152 ανά πακέτο).

| πακέτο | κατηγορία | αρχεία | modes | items με πίνακα / ποιοτικά |
|---|---|---|---|---|
| CT-1 | contact | 9 | 146 | 8 / 1 |
| CT-2 | contact | 7 | 146 | 7 / 0 |
| CT-3 | contact | 11 | 152 | 4 / 7 |
| IN-1 | instrument | 9 | 141 | 8 / 1 |
| IN-2 | instrument | 10 | 148 | 10 / 0 |
| IN-3 | instrument | 11 | 151 | 8 / 3 |
| FM-1 | formation | 8 | 134 | 8 / 0 |
| FM-2 | formation | 9 | 143 | 7 / 2 |
| FM-3 | formation | 9 | 142 | 9 / 0 |
| FM-4 | formation | 8 | 121 | 1 / 7 |
| VN-1 | vfr_navigation | 9 | 137 | 7 / 2 |
| VN-2 | vfr_navigation | 8 | 128 | 8 / 0 |
| VN-3 | vfr_navigation | 9 | 135 | 3 / 6 |
| IDX | (όλες) | 4 × `index.json` | — | παράγονται, δεν γράφονται |

**Φόρτος:** 6 υποχρεωτικά νέα κείμενα ανά mode (`texts_at` 1·2·3 + `texts_above`
2·3·4) = **10 944** νέα κείμενα, 726-912 ανά πακέτο. Το `texts_above["1"]` είναι
προαιρετικό (+1 824).

**Μετά τους γραφείς:** `python tools/index_instrument_v2.py` (ομοίως formation,
vfr_navigation) για τα `index.json` — η κατηγορία `contact` δεν έχει δικό της
indexer· ο integrator είτε γράφει τον αντίστοιχο, είτε ενημερώνει το
`data/observations2/contact/index.json` με τα ίδια πεδία.
Έπειτα `python tools/build_index.py` και, τελευταίο,
`python tools/check_observations.py`.

---

## 12. ΑΝΟΙΧΤΑ ΕΡΩΤΗΜΑΤΑ ΓΙΑ ΤΟΝ ΔΙΟΙΚΗΤΗ ΣΜΗΝΟΥΣ

1. **`texts_at["0"]` — το ζεύγος (0) → (0).** Ο κωδικός 0 εμφανίζεται ως **επιθυμητός**
   σε **65 κελιά** του `data/mif/t6a.json` (ο ελιγμός εισάγεται/επιδεικνύεται· δεν
   ζητείται ακόμη πρότυπο). Σήμερα το 0→0 αποδίδει το `texts.marginal`, που μιλά για
   «μέσα στα πρότυπα» — ανακριβές. Χρειάζεται δικό του κείμενο («flown with the IP
   assistance the Training Section still provides at this point»); **Μέχρι απόφανση:
   καμία αλλαγή συμπεριφοράς** — ο συνθέτης δέχεται ήδη το κλειδί όποτε αποφασιστεί.
2. **Η βαθμίδα του επιτευχθέντος (1) πάνω από MIF** (μόνο από επιθυμητό 0). Η
   απόφανση ονομάτισε 2/3/4. Πρόταση: **καμία λέξη-έπαινος** — σκέτη διαπίστωση
   («…, which is above the level the Training Section requires at this point»).
3. **Τα παγωμένα `texts["3"]`, `texts["4"]`, `texts["marginal"]`** μένουν για πάντα ως
   ιστορική εγγραφή/υποχώρηση, ή σβήνονται όταν ολοκληρωθούν οι οικογένειες;
4. **Η ετικέτα της καρτέλας** «Marginal @ MIF» → **«At MIF»** (έγινε· η καρτέλα δεν
   μπορεί να λέει «οριακό» πάνω από κείμενο που δηλώνει επίτευξη προτύπου).
5. **Τα 5 αρχεία με CRLF** — κανονικοποιούνται σε ξεχωριστό commit ή μένουν;

---

## 13. Η ΔΙΟΡΘΩΣΗ MIF ΤΗΣ ΗΜΕΡΑΣ (σημείωση, όχι εργασία)

`data/mif/t6a.json` — contact **T/O @ C4901-05**, `null` → `"3"` (τυπογραφικό του
Syllabus, provenance στα `flags` του πίνακα). Η τράπεζα και ο συνθέτης **δεν**
διαβάζουν προόδους MIF για τη σύνθεση: ο επιθυμητός κώδικας επιλέγεται από τον IP με
τα chips. Οι πίνακες MIF διαβάζονται μόνο από το **ℹ Info** (`mifProgressionHtml()`)
και από το `mifchart.js`. Άρα η μόνη ορατή συνέπεια είναι ότι η γραμμή T/O δείχνει
πλέον `3` αντί για `–` και είναι συνεχής. **Καμία ενέργεια για τους γραφείς.**
