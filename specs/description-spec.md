# Description — προδιαγραφή (Γύρος 16)

> Ο **δίδυμος του Remarks**. Το Remarks φτιάχνει **μία γραμμή για ένα αντικείμενο**·
> το Description φτιάχνει **ολόκληρο το μπλοκ της εξόδου**: την πρόταση της
> αποστολής, το κλείσιμο ανάλογα με την έκβαση και τη γραμμή των εκτάκτων
> «#39. (3) -> (3): …». Έξοδος: **ΕΝΑ κείμενο, κεφαλαία, έτοιμο για επικόλληση**
> στο πρόγραμμα των gradesheet της μοίρας.

Αρχεία: `app/description.js` · `app/styles.css` (τμήμα `DESCRIPTION (Round 16)`) ·
`app/index.html` (καρτέλα + τα τέσσερα κελύφη) · `data/descriptions.json` ·
`data/areas.json` · `data/routes.json` · `data/ep_list.json`.
Ο κατάλογος εξόδων διαβάζεται από το **ίδιο** `data/flowchart2.json` που ήδη
διαβάζουν το Flowchart και το Schedule Validation — ποτέ δεύτερο αντίγραφο.

---

## 1. Ο ΚΑΝΟΝΑΣ — τα τέσσερα τυπωμένα πρότυπα (verbatim)

Πηγή: **φωτογραφίες του χρήστη, 20/08/2026**. Αντιγράφονται εδώ κατά γράμμα και
ζουν αυτούσια στο `data/descriptions.json → templates.<id>.canon`. Ό,τι δεν
αποδεικνύεται από αυτά τα τέσσερα κείμενα (και από τα δύο συμπληρωμένα
δείγματα του §2) φέρει `status:"draft"` και εμφανίζεται στην καρτέλα με ορατή
σήμανση «DRAFT — proposed variant».

**1. CONTACT**

> "CONTACT SORTIE. STATIC TO, VFR DEP., FENCE IN, AREA WORK IN ____ FL100-200, FENCE OUT, VFR RTB, (ELP), PATTERN WORK & FULL STOP. THE ABOVE GRADED PROFILE WAS FLOWN. SORTIE OVERALL GRADED AS __. (END OF BLOCK. MINIMUM NUMBER OF MANEUVERS WAS FLOWN AND REQUIRED MIF LEVELS WERE MET.)"

**2. NAVIGATION**

> "NAVIGATION SORTIE. STATIC T/O, VFR DEP., CPM ____, VFR/IFR RTB, (PATTERN WORK) & F/S. THE ABOVE GRADED PROFILE WAS FLOWN. SORTIE GRADED OVERALL AS ____. (END OF BLOCK. ...)"

**3. INSTRUMENTS (SORTIE/CHECKRIDE)**

> "STATIC T/O, IFR DEP., (SID ____), (AREA WORK IN ____ F200-220 / ROUTE), HOLDING, ____ APPROACH AT (DESTINATION) (WITH GCA ASR / PAR), (MISSED APPR. / TOUCH&GO), (ROUTE), HOLDING, ____ APPROACH AT (DESTINATION) (WITH GCA ASR/PAR), (MISSED APPR. / TOUCH&GO), (CLOSED GCA ASR/PAR), & F/S. (SP OCCUPIED REAR COCKPIT.) THE ABOVE GRADED PROFILE WAS FLOWN. SORTIE GRADED OVERALL AS ____. (END OF BLOCK. ...)"

**4. FORMATION (SORTIE/CHECKRIDE)**

> "FORMATION (SORTIE/CHECKRIDE). ____ TO, VFR DEP., FENCE IN, AREA WORK IN ____ F100-200, LEAD CHANGE, SAME PROFILE, FENCE OUT, ( _FR RTB, ____ APPR.), (PATTERN WORK (only if landings exceed 1)) & F/S. ____ OUT - ____ BACK. THE ABOVE GRADED PROFILE WAS FLOWN. SORTIE OVERALL GRADED AS ____. (END OF BLOCK. ...)"

### Λεπτομέρειες που ΔΕΝ εξομαλύνονται

Η καρτέλα τις κρατά κατά γράμμα, ανά πρότυπο:

| | CONTACT | NAVIGATION | INSTRUMENTS | FORMATION |
|---|---|---|---|---|
| απογείωση | `STATIC TO` | `STATIC T/O` | `STATIC T/O` | `____ TO` |
| γενική βαθμ. | `SORTIE OVERALL GRADED AS` | `SORTIE **GRADED OVERALL** AS` | `SORTIE **GRADED OVERALL** AS` | `SORTIE OVERALL GRADED AS` |
| τέλος προφίλ | `… & FULL STOP.` | `… & F/S.` | `… , & F/S.` (κόμμα **και** `&`) | `… & F/S.` |
| αρχική πρόταση | ναι | ναι | **όχι** | ναι, με εναλλαγή SORTIE/CHECKRIDE |

Το `, & F/S.` των INSTRUMENTS είναι όπως στη φωτογραφία και κωδικοποιείται ως
`join: ", & "` στο στοιχείο `fs`.

---

## 2. ΤΑ ΔΥΟ ΣΥΜΠΛΗΡΩΜΕΝΑ ΔΕΙΓΜΑΤΑ (verbatim) — και τι αποδεικνύουν

**FAIL**

> "...AREA WORK IN METHONI F100-F200, FENCE OUT, VFR RTB, ELP, PATTERN WORK & FULL STOP. THE ABOVE GRADED PROFILE WAS FLOWN. SORTIE OVERALL GRADED AS FAIL. END OF BLOCK. ALL ITEMS COMPLETE AND MIFs ACHIEVED EXCEPT #1, 5, 34. SMS ENTRY."
> "#39. (1) -> (1): FUEL BALANCE, TAD FAIL."

**SOLO CLEARANCE**

> "...SORTIE OVERALL GRADED AS VERY GOOD. THE SP IS CLEAR TO FLY SOLO IN THE TRAFFIC PATTERN AND TO EXECUTE ITEMS #1-3, #5, #22-24, #34-38."
> "#39. (3) -> (3): HYD SYS MALFUNCTION, EMERGENCY LDG GR EXTENSION."

**Ο ΚΑΝΟΝΑΣ ΠΟΥ ΟΡΙΖΕΙ ΟΛΗ ΤΗ ΓΡΑΜΜΑΤΙΚΗ:**
το πρότυπο γράφει `(ELP)`, το δείγμα γράφει `ELP`. Άρα

> **η παρένθεση στο τυπωμένο πρότυπο σημαίνει «ΠΡΟΑΙΡΕΤΙΚΟ», όχι «τύπωσε αυτές τις αγκύλες».**

Κάθε προαιρετικό στοιχείο βγαίνει **χωρίς** παρενθέσεις όταν είναι ανοιχτό και
εξαφανίζεται όταν είναι κλειστό. Το ίδιο ισχύει για το `(END OF BLOCK. …)`, το
`(SP OCCUPIED REAR COCKPIT.)`, το `(WITH GCA ASR / PAR)` κ.ο.κ. Η εσωτερική
παρένθεση `(only if landings exceed 1)` του FORMATION είναι **σχόλιο συνθήκης**,
όχι κείμενο: γίνεται tooltip στο chip.

Δύο ακόμη λεπτομέρειες που κρατιούνται αυτούσιες:

* **`MIFs`** — με μικρό `s`, όπως στη φωτογραφία, μέσα σε κατά τα άλλα κεφαλαίο μπλοκ.
* **δύο μορφές αρίθμησης**: το FAIL γράφει `EXCEPT #1, 5, 34` (ένα `#` μπροστά),
  η άδεια SOLO γράφει `#1-3, #5, #22-24, #34-38` (`#` σε κάθε ομάδα). Και οι δύο
  υλοποιούνται (`fmt: "lead"` / `fmt: "each"`) και οι δύο συμπτύσσουν διαδοχικά.

---

## 3. ΟΙ ΑΠΟΦΑΣΕΙΣ ΤΟΥ ΧΡΗΣΤΗ (20/08/2026)

| Απόφαση | Πώς υλοποιήθηκε |
|---|---|
| «output is FOR PASTE (English, uppercase)» | Το κείμενο είναι **ήδη** κεφαλαίο στα δεδομένα· δεν εφαρμόζεται `toUpperCase()` πάνω στο μπλοκ (θα χαλούσε το `MIFs`) — κεφαλαιοποιείται μόνο ό,τι πληκτρολογεί ο χρήστης στα ελεύθερα πεδία. Ούτε `text-transform` στην εμφάνιση, για τον ίδιο λόγο. |
| ΠΕΡΙΟΧΕΣ: κλειστή λίστα + ελεύθερο κείμενο (Megalopoli … Methoni, όλες «… Area») | `data/areas.json` (14 εγγραφές). Στην πρόταση μπαίνει το `name` (π.χ. `METHONI`) γιατί το πρότυπο ήδη λέει «AREA WORK IN»· το `full` («METHONI AREA») είναι η ονομασία στον χάρτη. Δίπλα σε κάθε λίστα υπάρχει πάντα «✎ type…». |
| «#39» = το item ΕΚΤΑΚΤΩΝ, ο αριθμός **διαφέρει ανά κατηγορία** | Ερευνήθηκε και επιβεβαιώθηκε τριπλά (πίνακες MIF, `data/criteria/*`, τα τυπωμένα grade sheets): **CONTACT 39/41 · INSTRUMENT 32/34 · FORMATION 36/38 · NAVIGATION 24/26**. Ίδια αρίθμηση για F/S. |
| «(n) -> (n) είναι ΕΠΙΘΥΜΗΤΟΣ -> ΕΠΙΤΕΥΧΘΕΙΣ κωδικός» | Δύο επιλογείς `E,0,1,2,3,4`. Ο **επιθυμητός προεπιλέγεται από το MIF** του item ΕΚΤΑΚΤΩΝ στη στήλη της συγκεκριμένης εξόδου (πεδίο `ep_mif`, π.χ. `C4101 → E`). |
| «η εφαρμογή διαλέγει ΤΥΧΑΙΑ 2-3 διαδικασίες, με κουμπί reroll» | `data/ep_list.json` (71 ονόματα **verbatim**, μαζί με το τυπογραφικό «ELIMATION» της πηγής). 2 ή 3 τυχαίες, χωρίς επανάληψη, `↻ reroll`, `+` για μία ακόμη, `✕` για αφαίρεση, και κάθε επιλογή αλλάζει χειροκίνητα από dropdown με τα 71. |
| CPM: κλειστή λίστα + ελεύθερο | `data/routes.json` (1200, 1201, 1202, 1203, 1204, 1205, 1206, 1209). Ουδέτερο όνομα αρχείου, χωρίς σήμανση μονάδας. |
| ρητά ΠΕΔΙΑ για καθόδους και ναυτιλία | INSTRUMENTS: μπλοκ προσέγγισης (τύπος + προορισμός + GCA + missed/touch&go) με **+/−** για όσα μπλοκ χρειάζονται· NAVIGATION: `CPM ____`· FORMATION: `( _FR RTB, ____ APPR.)`. |
| «grade words: βρες την επίσημη κλίμακα» | §5. |
| ξεχωριστή καρτέλα ανώτατου επιπέδου | `#tab-description` / `#view-description`. |
| feedback όπως στο Remarks | §7. |
| «F/S coverage: κάνε προσπάθεια» | §6. |

---

## 4. Η ΓΡΑΜΜΑΤΙΚΗ — συμβόλαιο του `data/descriptions.json`

### Στοιχείο (element)

```jsonc
{ "id": "area", "label": "AREA WORK",
  "opt": true,            // ήταν σε παρένθεση στο τυπωμένο πρότυπο
  "on": true,             // προεπιλογή· ο χρήστης το γυρίζει με chip
  "status": "canon",      // ή "draft" + "why": "<γιατί είναι πρόταση>"
  "join": ", & ",         // προαιρετικό, όταν το πρότυπο δεν χρησιμοποιεί τον κανόνα
  "note": "…",            // εσωτερικό σχόλιο συνθήκης -> tooltip
  "parts": [ … ] }
```

Παραλλαγή (`choice`) αντί για `parts`: λίστα εναλλακτικών με `def` —
π.χ. `(AREA WORK IN ____ F200-220 / ROUTE)`, `(MISSED APPR. / TOUCH&GO)`.
Επανάληψη (`kind:"repeat"`): το μπλοκ προσέγγισης των INSTRUMENTS, `count:2`
όπως το πρότυπο, `min 0` – `max 4`. Το `on_first:false` του στοιχείου `ROUTE`
είναι ο λόγος που το `(ROUTE)` εμφανίζεται **ανάμεσα** στα δύο μπλοκ και όχι
πριν από το πρώτο, ακριβώς όπως τυπώνεται.

### Κομμάτι (part)

| `t` | τι κάνει |
|---|---|
| `lit` | σταθερό κείμενο |
| `slot` | κενό: `list` (κλειστή λίστα ή `areas`/`routes`), `free`, `def`, `ph` (το `____`), `pre`/`post` (π.χ. `" AT "`), `empty` (επιλογή «(none)» που **σβήνει και το `pre`** — αυτό ακριβώς σημαίνει το `(DESTINATION)` του προτύπου) |
| `items` | η συμπτυγμένη λίστα αριθμών, `fmt: "lead"` ή `"each"` |

### Κανόνας ένωσης

Τα ανοιχτά στοιχεία ενώνονται με `", "`, το **τελευταίο** με `" & "`, εκτός αν
το στοιχείο ορίζει δικό του `join`. Στο τέλος μπαίνει τελεία. Έπειτα, με κενό:
οι προτάσεις `post` (`__ OUT - __ BACK.`, `SP OCCUPIED REAR COCKPIT.`), η
σταθερή `THE ABOVE GRADED PROFILE WAS FLOWN.`, η γενική βαθμολογία, και οι
προτάσεις της έκβασης. Η γραμμή των εκτάκτων μπαίνει σε **δική της γραμμή**,
μετά από κενή γραμμή.

### Εκβάσεις (`outcomes`)

| id | κατάσταση | κλείσιμο |
|---|---|---|
| `standard` | canon | `(END OF BLOCK. MINIMUM NUMBER OF MANEUVERS…)` — **αυτόματα ανοιχτό** μόνο στις εξόδους που είναι τέλος ενότητας |
| `fail` | canon | `END OF BLOCK.` + `ALL ITEMS COMPLETE AND MIFs ACHIEVED EXCEPT #…` + `SMS ENTRY.` — η βαθμολογία κλειδώνει σε `FAIL` |
| `solo` | canon | `THE SP IS CLEAR TO FLY SOLO <εμβέλεια> AND TO EXECUTE ITEMS #…` |
| `mic` | **draft** | `MISSION INCOMPLETE (MIC) — ADVERSE WEATHER / A/C MALFUNCTION.` |
| `ng` | **draft** | αντικαθιστά τη γενική με `SORTIE NOT GRADED (NG).` + αιτία |

---

## 5. GRADE WORDS — η επίσημη κλίμακα

**3-01 §29** (PDF σ.50-51, ψηφιοποιημένο ως `data/requirements/failure_procedures.json → fail-01`), verbatim:

> «Η Γενική απόδοση στην πτήση και στο F/S βαθμολογείται, σύμφωνα με το ΠΔ 151/13 όπως ισχύει, με την εκατοστιαία κλίμακα, ως εξής: α. «Α» Άριστα (Βαθμολογία 90%-100%). β. «ΛΚ» Λίαν Καλώς (Βαθμολογία 75%-89%). γ. «Κ» Καλώς (Βαθμολογία 60%-74%). δ. «ΣΚ» Σχεδόν Καλώς (Βαθμολογία 50%-59%). ε. «Ε» ΑΠΟΤΥΧΩΝ (Βαθμολογία 0%-49%).»

| Κωδ. | Ελληνικά | Λέξη του μπλοκ | Ζώνη | Τυπωμένη στα αγγλικά; |
|---|---|---|---|---|
| Α | Άριστα | **EXCELLENT** | 90-100 % | όχι — μετάφραση |
| ΛΚ | Λίαν Καλώς | **VERY GOOD** | 75-89 % | όχι — αλλά **το δείγμα του χρήστη τη γράφει** |
| Κ | Καλώς | **GOOD** | 60-74 % | όχι — μετάφραση |
| ΣΚ | Σχεδόν Καλώς | **ALMOST GOOD** | 50-59 % | **ναι**, Syllabus PDF σ.163 §14b(3) |
| Ε | ΑΠΟΤΥΧΩΝ | **FAIL** | 0-49 % | **ναι**, Syllabus PDF σ.163 §14b(3) |

* **«FAIR»**: το ίδιο syllabus λέει FAIR για την ίδια ζώνη στη σ.165 §14c(1) (ναυτία, 59%).
  Κρατείται ως *alias* του ALMOST GOOD, φαίνεται στο ⓘ, δεν προσφέρεται ως ξεχωριστή επιλογή.
* Τα τυπωμένα grade sheets (Syllabus PDF σ.235-238) γράφουν **«OVERALL GRADE … %»** — γι' αυτό
  υπάρχει προαιρετικό πεδίο ποσοστού που παράγει `SORTIE OVERALL GRADED AS VERY GOOD (82%).`
  και **προειδοποιεί** όταν το ποσοστό πέφτει εκτός της ζώνης της λέξης.
* Σε **checkride** κάτω από 60% εμφανίζεται προειδοποίηση: ξεκινά η διαδρομή ΠΔ 29/2020
  (3-01 §58β) — καμία επαναληπτική στη Φάση ΙΙ.

---

## 6. ΠΡΟΕΠΙΛΟΓΕΣ ΑΝΑ ΕΞΟΔΟ, ΚΑΛΥΨΗ, ΚΑΙ F/S

Το `data/descriptions.json → sorties` κρατά και τις **133 εξόδους** (πηγή:
`flowchart2.json` + `mif/t6a.json` + `mif/fs.json` + τα section blocks του PART IV).
Ανά έξοδο: οικογένεια προτύπου, `work` (AREA / ROUTE / ROUTE_LOW / PATTERN_ONLY),
τύπος απογείωσης, ELP, checkride / night / 1st solo / solo candidate / end-of-block,
`ep_item`, `ep_mif`, `not_planned` (κενό κελί MIF), `solo_seed` (τα item με MIF ≥ 2),
σημείωση section, σελίδα syllabus.

**Τι κάνουν αυτά στην οθόνη**

* **`not_planned`** → τα αντίστοιχα νούμερα βγαίνουν γκρίζα στους επιλογείς: δεν
  προγραμματίστηκαν σε αυτή την έξοδο.
* **`solo_seed`** → η άδεια SOLO σπέρνεται **μία φορά** με ακριβώς τα item που
  βαθμολογήθηκαν με Κώδικα «2» ή καλύτερα — αυτό λέει η ίδια η διάταξη:
  3-01 §28θ «*Ως ελάχιστος Κώδικας Επίδοσης για την ασφαλή εκτέλεση … ορίζεται ο
  Κώδικας «2» μιας και η επίτευξή του επιτρέπει την εκτέλεσή τους από τον μαθητή
  σε πτήση «ΜΟΝΟΣ»*» και 3-01 §21α για το τι γράφει το προηγούμενο gradesheet.
* **απαγορευμένα για SOLO** → διαγραμμένα στον επιλογέα και εκτός σποράς.
  Syllabus PDF σ.163 §14b(6), verbatim: «*(a) All kind of STALLS. (b) SPINS
  (including Spin Prevention) (c) Unusual Attitudes. (d) ELP. (e) Straight in
  approach. (f) Slow Flight. (g) No Flap Overhead Patterns/ Landings (h)
  Simulated Lost Wingman Procedures.*» → CONTACT 7, 8, 9, 10, 11, 25, 26, 29, 30, 31.
* **`end_of_block`** → ανοίγει μόνη της η πρόταση «END OF BLOCK…» (τελευταία μη-SOLO
  έξοδος της ενότητας, 3-01 §21γ· η ίδια η πρόταση: Syllabus σ.164 §14b(9), σ.165 §14c(7)).

**Κάλυψη προτύπων** — καμία έξοδος δεν μένει χωρίς πρόταση, καμία δεν βγαίνει
σιωπηλά λάθος. 21 οικογένειες δείχνουν στα 4 πρότυπα· όπου το τυπωμένο πρότυπο
δεν καλύπτει την έξοδο, εμφανίζεται πλαίσιο «DRAFT — proposed variant» με τον λόγο:

| οικογένεια | πρότυπο | τι αλλάζει | draft |
|---|---|---|---|
| `contact-pattern` (C4601, C4602, C4790, C4791) | CONTACT | AREA WORK / FENCE IN / FENCE OUT **κλειστά**, ELP ανοιχτό | ναι — είναι τμήματα **μόνο κυκλώματος** (PDF σ.173, σ.175)· το υποχρεωτικό «AREA WORK IN ____ FL100-200» του προτύπου δεν ισχύει εκεί |
| `nav-2ship`, `nav-checkride-2ship` (N44XX-N46XX) | NAVIGATION | + `LOW LEVEL`, + `__ OUT - __ BACK.` | ναι — το τυπωμένο NAVIGATION είναι μονήρους· η πρόταση OUT/BACK δανείζεται **αυτούσια** από το FORMATION |
| `*-checkride` (CONTACT / INSTRUMENT / NAVIGATION) | ίδιο | αρχική πρόταση «… CHECKRIDE.» | ναι — μόνο το FORMATION τυπώνει την εναλλαγή· για τα άλλα τρία **προτείνεται** |
| `formation-checkride` | FORMATION | «FORMATION CHECKRIDE.» | **όχι** — το τυπώνει το ίδιο το πρότυπο |
| `instrument-route-night` (I4701), `fs-…-night` (I3601) | INSTRUMENT | «NIGHT INSTRUMENT SORTIE.» | ναι — κανένα πρότυπο δεν ονομάζει τη νύχτα |
| `fs-*` (46 έξοδοι) | κατά κατηγορία | «… F/S SORTIE.» | ναι — **δεν δόθηκε πρότυπο F/S** |
| `fs-cockpit` (B1001-02), `fs-ep-drill` (C2101, C2301, C2302) | CONTACT | **όλα** τα στοιχεία προφίλ κλειστά | ναι — δεν υπάρχει προφίλ πτήσης· η πρόταση χτίζεται από chips ή από «+ custom» |

**F/S — τι βρέθηκε.** Οι πίνακες MIF του F/S έχουν **την ίδια αρίθμηση** (41/34/38/26),
άρα ο αριθμός του item ΕΚΤΑΚΤΩΝ, οι επιλογείς αντικειμένων και η σπορά SOLO
δουλεύουν αυτούσια για F/S. Αλλάζει **μόνο** η αρχική πρόταση — και αυτή ως πρόταση.

**Διέξοδος για ό,τι δεν χωρά πουθενά:** κουμπί **«+ custom element»**. Προσθέτει
στοιχείο ελεύθερου κειμένου οπουδήποτε στην πρόταση (◀ ▶ για μετακίνηση, ✕ για
διαγραφή), και το μπλοκ σημαίνεται ως draft όσο υπάρχει έστω ένα.

---

## 7. FEEDBACK — ο ίδιος δίαυλος, χωρίς αλλαγή στον builder

Κάθε παραγόμενο μπλοκ έχει κουμπί **Feedback** που παράγει σύνδεσμο
`issues/new` **ακριβώς** στη μορφή που ήδη αποκωδικοποιεί η `parseFb()` του
`tools/build_offline.py`:

```
title: Feedback: desc-<templateId>-<sortie>
body : **Item:** <ΠΡΟΤΥΠΟ> description template · <sortie> <όνομα> · **File:** `data/descriptions.json`
       **Template:** `…` · **Family:** `…` · **Outcome:** `…` · **Head:** `…`
       > <το μπλοκ όπως φαίνεται>
       > <η γραμμή των εκτάκτων>
       **What is wrong / suggested correction:**
```

Επιβεβαιώθηκε ζωντανά **και στο offline build**: το τοπικό παράθυρο feedback
ανοίγει και γεμίζει σωστά (mode id, item, file, quote) — **μηδέν** αλλαγές στο
`FEEDBACK_JS`.

---

## 8. OFFLINE

Το Description **ταξιδεύει** στο κλειστό δίκτυο (σε αντίθεση με Scheduler και
Currency): είναι καθαρά εργαλείο syllabus / gradesheet, δεν αγγίζει roster.
Στον builder: `description.js` στην αλυσίδα των inline scripts, τα πέντε αρχεία
δεδομένων στο bundle, ο μετρητής `external script tags` **8 → 9**. Ο μετρητής
`hidden viewtab stubs` **μένει 5** — η καρτέλα δεν κρύβεται.

> **Παγίδα για τον επόμενο γύρο:** οι μετρητές του CSS gate είναι **κειμενικοί**.
> Ακόμη και η αναφορά ενός απαγορευμένου ονόματος μέσα σε **σχόλιο** ρίχνει το
> build. Το τμήμα CSS του Description το λέει ρητά στην κεφαλίδα του.

---

## 9. ΑΝΟΙΧΤΑ — περιμένουν απόφανση του χρήστη

1. **`____ OUT - ____ BACK.`** — υλοποιήθηκε ως **αριθμός αεροσκαφών** που
   απογειώθηκαν / επέστρεψαν (κάθε τμήμα FORMATION τυπώνει «NUMBER OF AIRCRAFT:
   Sorties will be performed with two A/C»), με προεπιλογή `2 OUT - 2 BACK`.
   Αν στη μοίρα γράφονται **ώρες**, το πεδίο δέχεται ελεύθερο κείμενο ήδη —
   πες το και αλλάζει η προεπιλογή και η ετικέτα.
2. **Αρχική πρόταση «… CHECKRIDE.»** για CONTACT / INSTRUMENT / NAVIGATION.
3. **Αρχική πρόταση «… F/S SORTIE.»** — ή γράφεται αλλιώς το F/S;
4. **Νυχτερινή έξοδος** — «NIGHT INSTRUMENT SORTIE.» ή σημειώνεται μέσα στο προφίλ;
5. **MIC / NG** ως εκβάσεις — η διατύπωση είναι δική μας πρόταση.
6. **Συντομογραφίες εκτάκτων** — υπάρχουν μόνο οι **τέσσερις** που αποδεικνύουν οι
   φωτογραφίες (`HYD SYS MALFUNCTION`, `EMERGENCY LDG GR EXTENSION`, `FUEL BALANCE`,
   `TAD FAIL`). Δεν εφευρέθηκε καμία άλλη. Αν υπάρχει επίσημος κατάλογος
   συντομογραφιών, μπαίνει στο `data/ep_list.json` ως `short`.
7. **RNAV** — δεν υπάρχει ούτε στα MIF items ούτε στους μετρητές του τυπωμένου
   grade sheet (VOR / TACAN / PAR / ASR / ILS / LOC). Δεν προσφέρεται ως έτοιμη
   επιλογή· το ελεύθερο πεδίο το καλύπτει.
8. **Ετικέτες αντικειμένων** — χρησιμοποιούνται οι ετικέτες των **τυπωμένων grade
   sheets** (σ.235-238) όπου διαφέρουν από τους πίνακες MIF, γιατί εκεί
   επικολλάται το κείμενο. Διαφορές: CONTACT 22/30/31, INSTRUMENT 3/11,
   FORMATION 20/25/26/28, NAVIGATION 12/17/18.
9. **Ψηφιοποίηση των 4 τυπωμένων grade sheets** σε `data/gradesheets/*.json` —
   προτείνεται για επόμενο γύρο· θα έδινε και τους μετρητές προσεγγίσεων /
   προσγειώσεων / LANDING CURRENCY / CRM / MIC / MC ως πεδία.
