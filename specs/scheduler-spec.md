# Scheduler Spec — Παρακολούθηση & Προγραμματισμός Εκπαίδευσης Phase II

> Feature spec κατά SDD. Εγκρίνεται από τον χρήστη ΠΡΙΝ από κάθε υλοποίηση.
> Πηγές κανόνων: flowchart2.json (ανά-sortie γράφος), data/requirements (θεσμικά, με verbatim),
> unit rules του χρήστη (καταγεγραμμένα εδώ). Ημερομηνία σύνταξης: 2026-08-09.

## 1. Σκοπός — και τι ΔΕΝ είναι

Εργαλείο του Αξιωματικού Εκπαίδευσης για: (α) **παρακολούθηση προόδου** (τι έχει κάνει κάθε
μαθητής, με ποιον εκπαιδευτή), (β) **ρύθμιση εκπαίδευσης** (αναπληρώσεις, ισορροπία φόρτου),
(γ) **παραγωγή του ημερήσιου Flight Schedule board (Δ+1)**.

**Εκτός σκοπού**: βαθμολόγηση σε επίπεδο ΠΑΠ/Φύλλων Βαθμολογίας (τρέχουν άλλα συστήματα),
έγκριση/υπογραφές, συντήρηση εκπαιδευτών (continuation), εφεδρικό μοίρας.

## 2. Πίνακες (source of truth = γεγονότα· ό,τι υπολογίζεται, υπολογίζεται)

| Πίνακας | Πεδία-κλειδιά |
|---|---|
| `students` | **oid (PK, σταθερό)**, code (SP-x δοκιμές), **first_name, last_name, mn (ΑΜ), rank**, class, status, **primary_ip: OID, reserve_ips: [OID]** (αναφορές με object id — οι εκπαιδευτές φεύγουν/αλλάζουν, τα OID όχι), notes |
| `instructors` | **oid (PK)**, code, **first_name, last_name, mn, rank, callsign**, **country {HAF\|ITAF\|Other…}**, **test_pilot (bool)**, **duty, leadership** (Γύρος 9 — από το global roster), quals {night, evaluator, ground, **rsu_solo**}, duty_eligible {SOF, RSU}, **status {active\|departed}** (ο «χαμένος» εκπαιδευτής ΔΕΝ διαγράφεται — μαρκάρεται departed, τα ιστορικά μένουν ακέραια), notes |
| `classes` | id, μέλη, ημ/νία έναρξης |
| `training_events` | date, node (uid flowchart2), scope: class\|student, instructor, device, result {completed \| repeat \| score%}, **absent[] {student, λόγος}** (σε class scope), note. Μαθήματα: **start_date, end_date** |
| `availability` | person, date, κατάσταση {available \| **LV \| SLV \| HLV \| SCL \| OFF \| TO \| AMC**} |
| `duty_roster` | date, **sof_a/sof_b (ανά κύμα)**, **rsu_a/rsu_b (ανά κύμα)**, **ground_1, ground_2** (έως 2 τάξεις), alt_instructors[] |
| `gates` | student, type {Δοκιμή Προόδου ΑΕ/Δκτή, Εξέταση Καταλληλότητας, **SMS** in/out, παραπομπή}, date, outcome |
| `day_plan` | το board μιας ημέρας (βλ. §7) + κατάσταση {draft \| published \| actualized} |
| `config` | mass_briefing default, wave template, IFF pool [2443-2445], όρια, στόχοι μίγματος ημέρας, idle threshold |

**Ιδιωτικότητα** (αναθεώρηση 2026-08-09, απόφαση χρήστη): επιτρέπονται **πραγματικά
ονόματα** στο Roster. Προστασία: (α) τα δεδομένα ζουν ΜΟΝΟ σε localStorage + **private**
repo `fdms-data` (sync)· (β) Γύρος 3: **κρυπτογράφηση του sync payload** με passphrase
(AES-GCM/WebCrypto — το repo κρατά ciphertext) + **κωδικός πρόσβασης** στο Scheduler
(privacy curtain, ρητά ΟΧΙ κρυπτογράφηση των τοπικών δεδομένων)· (γ) το δοκιμαστικό
seed παραμένει με κωδικούς SP-x/IP-x.

## 2α. GLOBAL ROSTER — ένα μητρώο για ΟΛΕΣ τις εφαρμογές FDMS (Γύρος 9, 2026-08-14)

Μέχρι τώρα κάθε εφαρμογή κρατούσε δικό της αντίγραφο της μοίρας. Ο Γύρος 9 κάνει
τη μοίρα **ένα ιδιωτικό αρχείο** που το διαβάζουν όλες.

**ΤΟ ΑΡΧΕΙΟ.** `D:\FDMS-roster\roster.json`, schema `global-roster-v1`. Ζει
**ΕΞΩ** και από τα δύο δημόσια repos και εκεί θα μείνει. Ανά άτομο: `oid`
(αμετάβλητο), `mn` (null μέχρι να δοθούν), `rank`, `last_name`, `first_name`,
`duty`, `leadership`, `call_sign`, `country`, `test_pilot`, `status`,
`duty_eligible {SOF, RSU, RSU_solo}`, `experienced`. Το `students[]` είναι προς
το παρόν κενό (έρχονται την επόμενη εβδομάδα) — ο import τα υποστηρίζει ήδη.

**ΤΟ OID ΕΙΝΑΙ Η ΤΑΥΤΟΤΗΤΑ ΚΑΙ ΕΙΝΑΙ ΑΜΕΤΑΒΛΗΤΟ.** Οι άνθρωποι
μετατίθενται, προάγονται, αλλάζουν call sign και φεύγουν· το object id όχι.
Άρα είναι το κλειδί κάθε εισαγωγής και το ΜΟΝΟ πεδίο που δεν ξαναγράφεται.

**«Import roster»** (κουμπί στο Roster, file picker): **MERGE BY OID** —
- OID που υπάρχει ⇒ **ενημέρωση επί τόπου**· ο τοπικός `code` (τον οποίο
  αναφέρει το training log ως ιστορικό γεγονός) **δεν ξαναγράφεται ποτέ**·
- OID που δεν υπάρχει ⇒ **δημιουργία**· ο νέος `code` παίρνει το **call sign**
  (αυτό λέει ήδη η μοίρα), αλλιώς το επόμενο ελεύθερο `IP-n` / `SP-n`·
- όποιος **δεν αναφέρεται** στο αρχείο ⇒ **μένει ανέγγιχτος** (οι αποχωρήσεις
  παραμένουν χειροκίνητη απόφαση, ποτέ παρενέργεια αρχείου)·
- πεδίο για το οποίο το roster **σιωπά** (null/απόν — π.χ. το `mn` σήμερα)
  **δεν γράφεται**: μια εισαγωγή δεν σβήνει ό,τι πληκτρολόγησε ο ΑΕ·
- αντιστοιχίσεις: `call_sign→callsign`, `duty_eligible.RSU_solo→quals.rsu_solo`,
  `SOF/RSU→duty_eligible`, `status: Departed→departed, αλλιώς active`. Το
  `quals.evaluator` **μόνο προστίθεται** (duty = Evaluator) — ένα προσόν που
  όρισε ο χρήστης δεν το αφαιρεί αρχείο που δεν έχει άποψη γι' αυτό.
- Μετά την εισαγωγή **όλα παραμένουν επεξεργάσιμα** από το UI ως συνήθως.

**Η ΠΥΛΗ ΙΔΙΩΤΙΚΟΤΗΤΑΣ.** Κανένα πραγματικό όνομα, call sign ή παράγωγο του
roster δεν μπαίνει ΠΟΤΕ σε αρχείο του repo. Το **δημόσιο seed**
(`tools/build_scheduler_seed.py` → `data/scheduler/seed.json`) κρατά για πάντα
τα ψεύτικα SP-x/IP-x — ο Γύρος 9 του πρόσθεσε μόνο τα **νέα πεδία με ψεύτικες
τιμές** (country HAF/ITAF/Other, test_pilot σε 4 IP), ώστε το UI που τα
εμφανίζει να έχει τι να δείξει. Τα αληθινά δεδομένα ζουν μόνο στο localStorage
του χρήστη και στο ιδιωτικό `fdms-data`.

## 2β. DROPDOWNS — ο κανόνας (Γύρος 9)

**Κάθε dropdown έχει ΜΟΝΟ τις τιμές που χρειάζεται ΣΥΝ ένα «Other…» ελεύθερο
κείμενο.** Ο helper `otherSelect()`/`fvalOther()` του Roster το υλοποιεί μία
φορά: επιλογή «Other…» ⇒ αποκαλύπτεται πεδίο κειμένου, το ζεύγος διαβάζεται ως
**μία** τιμή, η εγγραφή δεν μαθαίνει ποτέ ότι το widget έχει δύο μισά.
Έτσι: **country** (HAF/ITAF/Other…), **duty**, **leadership**, **rank** (chips
πάνω σε ελεύθερο πεδίο — προστέθηκε **Lt Col**, το roster έχει δύο),
**device** F/S (datalist OFT/FTD πάνω σε ελεύθερο πεδίο).

**ΚΛΕΙΣΤΑ ΕΞ ΟΡΙΣΜΟΥ** (δεν είναι ξεχασμένα): ό,τι είναι **αλφάβητο μηχανής**
και όχι λεξιλόγιο της μονάδας — `result` (PASS/LAG/FAIL/Score· η μηχανή
συνεπειών κάνει switch πάνω του), `status` μαθητή/εκπαιδευτή, `scope`
(class/student), `wave` (A/B), κωδικοί απουσίας (`AV_CYCLE` — δες τη σημείωση
κάτω από τον πίνακα). Ελεύθερη τιμή εκεί θα σήμαινε κανόνας που δεν
εφαρμόζεται. Τα pickers οντοτήτων (SP/IP/κόμβος/αποστολή) έχουν ήδη τη δική
τους διαφυγή: **ελεύθερο κείμενο αποστολής**, callsign, IFF, remarks.

### ΠΙΝΑΚΑΣ ΕΛΕΓΧΟΥ — ΚΑΘΕ dropdown ΤΗΣ ΕΦΑΡΜΟΓΗΣ

Ο κανόνας δεν είναι δήλωση προθέσεων: παρακάτω απαριθμούνται **όλα** τα
`<select>` και `<datalist>` του scheduler, διαβασμένα από τον κώδικα —
**43 rendered `<select>` + 4 `<datalist>`** (`app/scheduler.js`: 15 literal
`<select>` + 3 κλήσεις `otherSelect()` + 2 datalists · `app/schedboard.js`:
19 literal `<select>` + 6 κλήσεις του helper `sel()` των duties + 2 datalists).
Ο εντοπισμός γίνεται με τον **selector**, όχι με αριθμό γραμμής, ώστε ο πίνακας
να παραμένει επαληθεύσιμος με ένα grep μετά από κάθε αλλαγή.

| # | Dropdown (πάνελ · πεδίο) | Selector (αρχείο) | Τιμές | «Other…»; | Αν ΚΛΕΙΣΤΟ — γιατί |
|---|---|---|---|---|---|
| 1 | Roster · μαθητής — Class | `input[list=sch-classlist]` (scheduler.js) | τα class ids που ήδη υπάρχουν | **ΝΑΙ** — το ίδιο το πεδίο είναι ελεύθερο κείμενο· το datalist είναι quick-pick | — |
| 2 | Roster · μαθητής — Status | `select[data-f=status]` · `STATUS_OPTS` | active · hold · SMS (αποθηκεύεται `kepe`) · withdrawn | ΟΧΙ | **αλφάβητο μηχανής** — η μηχανή ετοιμότητας και οι counters κάνουν switch πάνω του |
| 3 | Roster · μαθητής — Primary IP / Reserve IP 1 / Reserve IP 2 | `select[data-f=primary_ip‖r0‖r1]` · `ipRefOptions()` | οι IP του μητρώου (η αποθηκευμένη τιμή κρατιέται ορατή κι όταν ο IP έφυγε) | ΟΧΙ | **picker οντότητας** — δείχνει σε εγγραφή του μητρώου· ελεύθερο κείμενο θα ήταν σπασμένη αναφορά |
| 4 | Roster · εκπαιδευτής — Country | `select[data-other=country]` · `COUNTRIES` | HAF · ITAF | **ΝΑΙ** | — |
| 5 | Roster · εκπαιδευτής — Duty | `select[data-other=duty]` · `DUTIES` | Squadron Commander · DO · Flight Commander · Evaluator · Instructor | **ΝΑΙ** | — |
| 6 | Roster · εκπαιδευτής — Leadership | `select[data-other=leadership]` · `LEADERSHIPS` | Wingman · 2-ship · 4-ship · Mission Commander | **ΝΑΙ** | — |
| 7 | Roster · εκπαιδευτής — Status | `select[data-f=status]` | active · departed | ΟΧΙ | **αλφάβητο μηχανής** — το `departed` φιλτράρει ΚΑΘΕ picker και εμποδίζει το hard delete |
| 8 | Roster · Rank (μαθητή & εκπαιδευτή) | `input[data-f=rank]` + chips `RANKS` | Cdt · 2Lt · 1Lt · Capt · Maj · Lt Col · S.Ten · Lt | **ΝΑΙ** — το πεδίο είναι εξαρχής ελεύθερο· τα chips είναι quick-pick | — |
| 9 | Training log · Node | `select#sch-nodesel` | κόμβοι συλλαβού (lessons ανά course) + special sorties + NFS | ΟΧΙ | **picker οντότητας** — η διαφυγή ζει στο board (`Custom…` αποστολή) |
| 10 | Training log · Scope | `select[data-ff=scope]` (και μία disabled μονο-επιλογή στα special sorties) | Student · Class | ΟΧΙ | **αλφάβητο μηχανής** — καθορίζει σε πόσες εγγραφές γράφεται το γεγονός |
| 11 | Training log · Student | `select[data-ff=student]` | οι μαθητές του μητρώου | ΟΧΙ | **picker οντότητας** |
| 12 | Training log · NFS reason | `select[data-ff=category]` · `NFS_CATS` | written exam failure · oral exam failure · **no-fly — student cause (other)** | **ΝΑΙ** — η τρίτη τιμή είναι η ίδια η τυπωμένη «άλλη αιτία» του Α0473, με ελεύθερο `Note` δίπλα | — |
| 13 | Training log · Category (special sortie) | `select[data-ff=category]` · `SchedConsq.CATS` | Contact · Instrument · Formation · VFR Navigation | ΟΧΙ | **λεξιλόγιο συλλαβού** — η μηχανή συνεπειών μετρά ανά track· πέμπτο track δεν υπάρχει |
| 14 | Training log · Instructor | `select[data-ff=instructor]` (`evalIpOptions()` στα evaluator sorties) | ενεργοί IP· evaluator-qualified πρώτοι | ΟΧΙ | **picker οντότητας** |
| 15 | Training log · Device | `input[data-ff=device][list=sch-devlist]` · `DEVICES` | T-6A · OFT · FTD · GND | **ΝΑΙ** — ελεύθερο πεδίο με datalist | — |
| 16 | Training log · Result | `select[data-ff=result]` · `RESULT_OPTS_FLY` / `_GND` | πτήσεις: PASS · LAG · FAIL · Score % — εδάφους: Completed · Score % | ΟΧΙ | **αλφάβητο μηχανής** — fail-08…12 κάνουν switch πάνω του |
| 17 | Training log · φίλτρο Student | `select[data-flt=student]` | All + οι μαθητές | ΟΧΙ | **picker οντότητας** (φίλτρο) |
| 18 | Training log · φίλτρο Kind | `select[data-flt=kind]` · `KINDS` | All · Lessons · Ground exams · F/S · Flights | ΟΧΙ | **αλφάβητο μηχανής** — τα τέσσερα είδη κόμβου του γράφου |
| 19 | Board · Duties — SOF A · SOF B · RSU A · RSU B · Ground 1 · Ground 2 (6 selects) | `select[data-duty]` (schedboard.js) | ενεργοί IP φιλτραρισμένοι στο προσόν (SOF / rsu_solo / ground) | ΟΧΙ | **picker οντότητας** |
| 20 | Board · Wave line — SP | `select[data-lf=sp]` · `spOptions()` | όλοι οι μη-withdrawn μαθητές — ο μπλοκαρισμένος/απών μένει στη λίστα με τον λόγο γραμμένο δίπλα του | ΟΧΙ | **picker οντότητας** |
| 21 | Board · Wave line — Main mission / Alt mission | `select[data-lf=node‖alt]` · `missionOptions()` | οι επιτρεπτές αποστολές του SP + η αποθηκευμένη | **ΝΑΙ** — επιλογή `Custom…` ⇒ ελεύθερο κείμενο αποστολής | — |
| 22 | Board · Wave line — IP | `select[data-lf=ip]` · `ipOptions()` | ενεργοί IP με τα φορτία/συγκρούσεις τους | ΟΧΙ | **picker οντότητας** |
| 23 | Board · Wave line — T/O | `input[data-lf=to][list=sch-todl]` | πλέγμα από 05:00 ως το τέλος της ημέρας με βήμα `config.round_min` (default 5′) | **ΝΑΙ** — ελεύθερη πληκτρολόγηση HH:MM | — |
| 24 | Board · F/S — SP / Mission / IP | `select[data-lf=sp‖node‖ip]` | ό,τι και στη wave line | Mission: **ΝΑΙ** (`Custom…`) | picker οντότητας για SP/IP |
| 25 | Board · F/S — Device | `input[data-lf=device][list=sch-fsdev]` · `FS_DEVICES` | OFT · FTD | **ΝΑΙ** — ελεύθερο πεδίο· νέος προσομοιωτής δεν χρειάζεται release | — |
| 26 | Board · Lessons — Wave | `select[data-lf=wave]` | A · B | ΟΧΙ | **αλφάβητο μηχανής** — Ground 1 καλύπτει το wave A, Ground 2 το B· τρίτο κύμα δεν υπάρχει |
| 27 | Board · Lessons — Course / exam | `select[data-lf=node]` · `nodeOpts()` | courses ανά ground group + ground exams (+ legacy whole-group) | ΟΧΙ | **picker οντότητας** |
| 28 | Board · Lessons — Scope | `select[data-lf=scope]` | Class · Student | ΟΧΙ | **αλφάβητο μηχανής** (ίδιο με #10) |
| 29 | Board · Lessons — Student | `select[data-lf=student]` | οι μαθητές | ΟΧΙ | **picker οντότητας** |
| 30 | Board · Lessons — Ground instructor | `select[data-lf=instructor]` | IP με `quals.ground` (+ η αποθηκευμένη τιμή) | ΟΧΙ | **picker οντότητας** |
| 31 | Board · Alternates — SP / sortie / IP | `select[data-lf=sp‖node‖ip]` | ό,τι και στη wave line | sortie: **ΝΑΙ** (`Custom…`) | picker οντότητας για SP/IP |
| 32 | Board · Actualize — «what was actually flown» | `select[data-ab-f=node]` | οι κόμβοι του ίδιου είδους | ΟΧΙ | **picker οντότητας** |
| 33 | Board · Actualize — Result | `select[data-ab-f=result]` | PASS · LAG · FAIL | ΟΧΙ | **αλφάβητο μηχανής** (ίδιο με #16) |
| 34 | Progress · Instructor (γρήγορη καταχώρηση) | `select[data-pf=instructor]` | ενεργοί IP | ΟΧΙ | **picker οντότητας** |
| 35 | Progress · Instructor (stepper) | `select[data-sf=instructor]` · `stepIpOptions()` | ενεργοί IP, evaluator πρώτοι στα checkrides | ΟΧΙ | **picker οντότητας** |

**Τι ΔΕΝ είναι dropdown** (και γι' αυτό δεν έχει σειρά στον πίνακα): η λίστα
`Avoid IPs` και τα `Rank` chips είναι **toggle chips**, το `absent` των lessons
είναι checkbox + **ελεύθερο** πεδίο αιτίας, και η διαθεσιμότητα είναι **κουμπί
κύκλου** πάνω στο `AV_CYCLE` (`available → LV → SLV → HLV → SCL → OFF → TO →
AMC`). Ακρίβεια που οφείλει ένας πίνακας ελέγχου: το `AV_CYCLE` είναι σήμερα
**σταθερά του κώδικα** και στα δύο panes — το `config.absence_codes` του seed
δεν διαβάζεται από το UI, άρα η παραμετροποίηση των κωδικών απουσίας είναι
**ανοιχτό**, όχι υλοποιημένο.

## 3. Κατάσταση κόμβου ανά μαθητή

`pending → scheduled → completed | absent(→makeup) | repeat`. Το completed ξεκλειδώνει
διαδόχους στον γράφο flowchart2. Ανοιχτό gate (Δοκιμή, Καταλληλότητας, SMS-περιορισμός)
κλειδώνει ό,τι ορίζει ο αντίστοιχος κανόνας. Απών σε class event ⇒ αυτόματη εκκρεμότητα
αναπλήρωσης του κόμβου.

## 3α. Καταγραφή αποτυχιών & μηχανή συνεπειών (Γύρος 2)

**Training Log — πλήρες λεξιλόγιο αποτελεσμάτων** για πτήσεις/F-S:
`ΕΠΙΤΥΧΩΝ (completed) | ΥΣΤΕΡΗΣΗ | ΑΠΟΤΥΧΙΑ` (το παλιό `repeat` ⇒ ΥΣΤΕΡΗΣΗ).
**Ειδικές έξοδοι εκτός γράφου**, καταχωρίσιμες στο Log με κατηγορία & αποτέλεσμα:
`Δοκιμή Προόδου ΑΕ | Δοκιμή Προόδου Δκτή | Εξέταση Καταλληλότητας | Πτήση κρίσης`.

**Τρεις διαφορετικές περιπτώσεις 1ης ΥΣΤΕΡΗΣΗΣ/ΑΠΟΤΥΧΙΑΣ** (μηχανή συνεπειών —
η καταχώριση στο Log παράγει αυτόματα την αντίστοιχη εκκρεμότητα/μπλόκο):

1. **Απλή πτήση ενότητας** (fail-08/09/10, §30δ-ε): καμία άλλη πτήση Α/Φ ή F/S ίδια +
   επόμενη ημέρα· προγραμματισμός τη **ΜΕΘΕΠΟΜΕΝΗ** εργάσιμη στην ίδια κατηγορία
   (ΕΠΟΜΕΝΗ εργάσιμη αν η επόμενη πτήση είναι Αξιολόγηση/ΜΟΝΟΣ-Αξιολόγηση/Δοκιμή
   Προόδου/Εξ. Καταλληλότητας/εθισμός ΑΕΡΟΝΑΥΤΙΑΣ)· αν παρεμβάλλεται ανεκτέλεστη F/S:
   επόμενη ημέρα F/S, μεθεπόμενη Α/Φ (fail-09)· επανάληψη ΟΛΩΝ των ελιγμών που υστέρησε.
2. **Τελευταία πτήση ενότητας** (καθοριστική): **Α/Φ** ⇒ Εξέταση Καταλληλότητας με
   Αξιολογητή (fail-12· 1 προσπάθεια, νέα αποτυχία ⇒ ΠΔ 29/2020). **F/S** ⇒ κλίμακα 3
   προσπαθειών: άμεση επανάληψη → (νέα αποτυχία) F/S μετά από 2 ημερολογιακές ημέρες →
   (3η) ΠΔ 29/2020 (fail-11). Πρώτη «ΜΟΝΟΣ» = τελευταία ενότητας ⇒ Εξ. Καταλληλότητας,
   η ΜΟΝΟΣ ΔΕΝ επαναλαμβάνεται (fail-19).
3. **Πτήση Αξιολόγησης/Τελικής (checkride)**: 0-59% ⇒ **ΜΗΔΕΝ επαναλήψεις στο Phase II**,
   άμεση ενεργοποίηση ΠΔ 29/2020 + διακοπή ΟΛΩΝ των δραστηριοτήτων (fail-16, §31) ⇒
   hard μπλόκο παντού μέχρι έκβαση (Δοκιμή Προόδου ΑΕ → Δκτή → Συμβούλιο).

**Προϋποθέσεις πριν από κάθε Αξιολόγηση/Δοκιμή/Εξέταση** (fail-17, §22ζ-θ): 4.0 ώρες
στο 20ήμερο (αλλιώς ΕΠΑΝΑΛΗΨΕΙΣ)· όχι ≥5 ημερολογιακές ημέρες χωρίς πτήση (αλλιώς 1
ΕΠΑΝΑΛΗΨΗ πρώτα)· καμία άλλη έξοδος την ίδια ημέρα.

**SMS μέγιστες είσοδοι** (fail-45): 2×εξετάσεις εδάφους, 2×ΠΡΟΣΑΡΜΟΓΗ, 1×ανά λοιπή
κατηγορία/F-S ανά Στάδιο. **Απόφανση μονάδας (ΑΕ, 2026-08-09): με εξάντληση ορίου ο
μαθητής απλώς ΔΕΝ ξαναμπαίνει σε SMS — καμία άλλη συνέπεια** (καταγεγραμμένο και στα
data/requirements ως unit ruling).

## 4. Μηχανή ετοιμότητας (per-student dropdowns)

- Βασίζεται στον ανά-sortie γράφο (flowchart2) + gates + αναπληρώσεις.
- **Βάθος 3** μπροστά. **Αυστηρός διαχωρισμός ειδών**: dropdown πτήσεων ⇒ μόνο πτήσεις,
  F/S ⇒ μόνο F/S, εξετάσεων ⇒ μόνο εξετάσεις. Εκκρεμότητα άλλου είδους εμφανίζεται ως
  ενημερωτικό chip δίπλα στο όνομα, ποτέ ως επιλογή σε λάθος μπλοκ.
- ***Italic*** = υπό αίρεση διαθέσιμο: η προϋπόθεσή του εκκρεμεί αλλά μπορεί να καλυφθεί
  την ίδια ημέρα (π.χ. προηγούμενο sortie στο κύμα 1, ή οφειλόμενη εξέταση που δίνεται το
  πρωί). Hover ⇒ «pending: …». Επιλογή italic χωρίς την προϋπόθεση στο board ⇒ warning, όχι μπλόκο.
- Ταξινόμηση λιστών κατά «ανάγκη» (μέρες αδράνειας φθίνουσα), όχι αλφαβητικά.
- **Ελεύθερο κείμενο αποστολής**: σε κάθε γραμμή πτήσης, αν το dropdown δεν καλύπτει την
  ειδική περίπτωση, ο χρήστης πληκτρολογεί ελεύθερα mission. Minimal εμφάνιση (ένα πεδίο,
  όχι επιπλέον UI). Ελεύθερη αποστολή ⇒ εκτός μηχανής ετοιμότητας, σημειώνεται ως custom.
- **ALT mission ≠ κατηγορία MAIN**: η αυτόματη πρόταση ALT προέρχεται από ΔΙΑΦΟΡΕΤΙΚΟ
  category (track) από το MAIN· χειροκίνητη επιλογή ίδιας κατηγορίας ⇒ soft warning.
- **ΜΟΝΟΣ (solo)**: στο πεδίο IP εμφανίζεται επιλογή «SOLO» ΜΟΝΟ για sorties ενότητας με
  `solo_allowed` (flowchart2). Solo γραμμή ⇒ χωρίς IP στους counters, standard callsign.

## 5. Μηχανή χρόνου

- Γραμμή = `brief 30' + ground ops + πτήση + debrief` με **σύνολο ΠΑΝΤΑ 03:15**.
  Το **debrief είναι το λάστιχο** (προσθήκη/αφαίρεση)· ελάχιστο debrief 15' (αλλιώς κόκκινο).
  Όλοι οι χρόνοι **στρογγυλεμένοι σε 5λεπτο**.
- **Διάρκεια πτήσης ανά αποστολή** από το syllabus (flowchart2 hours) — όχι καρφωτό 1:10.
- **Slots**: T/O σε **combo** (dropdown 5λέπτων + ελεύθερη πληκτρολόγηση HH:MM). Κανονικό
  παράθυρο **HH:05–HH:35**· εκτός παραθύρου ⇒ **σήμανση (soft), όχι μπλόκο**.
- **Turnaround IP**: T/O 2ης εξόδου ≥ LDG 1ης + **2:00**.
- **Κύματα**: 2 ημέρας (ranking κατά T/O **μέσα σε κάθε κύμα**) + night ως εξαίρεση με δικό
  του briefing. Το mass briefing time είναι παράμετρος ημέρας.
- **F/S**: χωρίς ώρες στο board· κανόνας σειράς: **όχι 1ο slot F/S ΚΑΙ 1ο κύμα πτήσης** για
  το ίδιο πρόσωπο.
- **Editable T/O** ανά γραμμή ⇒ live recompute (LDG/debrief/σύνολο 3:15) ⇒ επανέλεγχος
  κανόνων ⇒ auto-ranking κύματος.

## 6. Rulebook

| Τύπος | Κανόνες (σύνοψη) |
|---|---|
| Hard θεσμικοί | prerequisites/ροή flowchart2 · gates · όχι 2 συνεχόμενες ΜΟΝΟΣ · τελευταία sortie ενότητας όχι ΜΟΝΟΣ · checkride μόνο με Αξιολογητή · ημέρα checkride ΧΩΡΙΣ 2η έξοδο (st-53· εξαίρεση ζεύγος C4790→C4791, st-51) · μετά ΥΣΤΕΡΗΣΗ (result=repeat) όχι πτήση ίδια/επόμενη ημέρα · **turnaround μαθητή 2h** LDG→T/O (st-51· εξαίρεση C4790→C4791) · max 1 νυχτερινή/ημέρα (st-50) — **κάθε παραβίαση δείχνει requirement id + σύντομο verbatim** |
| **Ημερήσιος φόρτος SP** (οι **alternates ΜΕΤΡΑΝΕ**) | ≤2 items = ΟΚ (st-48/49: 1 Α/Φ+1 F/S ή 2 F/S) · 3 items = soft «acceleration, ΜΕΤΑ ΜΟΝΟΣ μόνο» (st-50: 2 Α/Φ+1 F/S ή 1 Α/Φ+2 F/S) · >3 = hard · **>2 κατηγορίες ασκήσεων = hard** (st-52· εξαιρείται F/S κανονικών/EP διαδικασιών) |
| **SMS** (Special Monitoring Status — πρώην ΚΕΠΕ, fail-47 §32δ) | max **1 dual Ή 1 F/S** ημερησίως· 2η έξοδος ΜΟΝΟ αν είναι πτήση «ΜΟΝΟΣ»· badge **SMS** παντού (board, roster, dropdowns, print) |
| Hard unit | turnaround IP 2h · **SOF-Α/RSU-Α: όχι πτήση στο κύμα 1, SOF-Β/RSU-Β: όχι στο κύμα 2· SOF/RSU max 1 έξοδος, μετά την υπηρεσία** · όχι 1ος F/S + 1ο κύμα · σύνολο γραμμής 3:15 · T/O εκτός HH:05–:35 ⇒ soft σήμανση |
| Soft (override+λόγος) | F/S ανά IP: προτίμηση 2, max 3 · μαθήματα σε ημέρες υπηρεσίας ground instructor · **συνέχεια κύριου/εφεδρικών IP ΜΟΝΟ έως το C4791 + max 4 διαφορετικοί IP έως το C4791 — μετά «πετάνε όλοι με όλους»** (unit rule 2026-08-09) · στόχοι μίγματος · ALT ίδιας κατηγορίας με MAIN |
| Παράμετροι ημέρας | mass briefing time · μίγμα · διαθέσιμα devices · IFF pool |

## 7. Το Live Board (Δ+1)

**Ροή χρήστη**: ημερομηνία → απόντες (LV/AMC/TO/SLV) → duties (SOF/RSU/ground) →
«παίζω μπάλα»: γραμμές με dropdowns/ελεύθερο κείμενο, live warnings, editable T/O.

**Γραμμή πτήσης**: IP (picker **φιλτραρισμένος ανά slot**: απουσίες, duty, turnaround,
φόρτος) · SP · callsign (**ελεύθερο κείμενο**· standard single-ship, PA1/PA2 σε σχηματισμούς)
· MAIN mission (dropdown ή ελεύθερο) · ALT mission (αυτόματη πρόταση, επεξεργάσιμη) ·
T/O (editable) · υπολογιζόμενα brief/LDG/debrief/total · IFF (auto από pool 2443-2445,
επεξεργάσιμο) · Remarks (ελεύθερο).

**Μπλοκ**: Κύμα 1 · Κύμα 2 · Night (προαιρετικό) · **Μαθήματα/Εξετάσεις ανά κύμα (Α/Β,
προαιρετικά — δεν υπάρχουν πάντα)** · F/S (χωρίς ώρες, με device και σειρά) · Duties
(**SOF-Α, SOF-Β, RSU-Α, RSU-Β, Ground 1, Ground 2**) · **Alternate students (+sortie) / alternate
instructors** · Absents analysis · Manning · Completion ratio ανά cohort.

## 8. Counters — «κανείς δεν ξεχνιέται, κανείς δεν καίγεται»

- Inline: `Nd` μέρες από τελευταίο event δίπλα σε κάθε όνομα στα dropdowns.
- Panel **«Not scheduled today»**: διαθέσιμοι εκτός board, με μέρες αδράνειας· amber > 3
  εργάσιμες (ρυθμιζόμενο).
- Καρτέλα **Balance** (εβδομάδα/μήνας): μαθητές (events, απόκλιση από μ.ό. cohort,
  αναπληρώσεις, αδράνεια) · εκπαιδευτές (πτήσεις + F/S + ground + **SOF** + **στήλη
  «RSU (solo)»** ξεχωριστά, load vs μ.ό.).

## 8α. UI πρόσβασης στα δεδομένα

- **Roster**: διαδραστικό live φίλτρο (πληκτρολόγηση ⇒ άμεσο φιλτράρισμα SP & IP).
- **Training Log**: ομαδοποίηση **κατά ημερομηνία** (νεότερα πρώτα, date headers).
- **Progress editor**: ΑΝΟΙΧΤΑ μόνο ό,τι ΔΕΝ έχει ολοκληρωθεί + έως **3 βήματα μπροστά**
  ανά είδος, με τα **prerequisites ορατά** πάνω στα βήματα (από ακμές flowchart2)·
  όλα τα υπόλοιπα (ολοκληρωμένα/μακρινά) συνεπτυγμένα, ανοίγουν με κουμπιά ανά ενότητα.
  Συμμαζεμένη, συμπαγής εμφάνιση.

## 9. Βρόχος πραγματοποίησης & Draft/Publish

- Board: `draft` (ελεύθερο παίξιμο, warnings) → `publish` (κλείδωμα + **εκτυπώσιμη όψη
  πανομοιότυπη με το έντυπο της Μοίρας** + αρχειοθέτηση).
- Επόμενο πρωί, **actualize**: ανά γραμμή ✓ έγινε / ✗ ακυρώθηκε (λόγος) / ~ άλλαξε ⇒ τα ✓
  γίνονται αυτόματα `training_events`. **Καμία διπλοκαταχώρηση.** Τα ratios/counters
  ενημερώνονται μόνα τους.

## 10. Ανοιχτά default (προς επικύρωση στην υλοποίηση)

min debrief 15' · idle threshold 3 εργάσιμες · duty roster: εισαγωγή από χρήστη (όχι
πρόταση συστήματος, v1) · αποθήκευση: JSON αρχεία σε φάκελο επιλογής χρήστη · βάθος
lookahead 3 (σταθερό v1).

## 11. INSTRUCTOR CURRENCY — καρτέλα εκπαιδευτή (Γύρος 10b· split & χρώμα Γύρος 10c)

Πηγή: `data/requirements/instructor_currency.json` (91 ελεγμένα items από το 3-01/2025
ΔΑΕ). Αποθήκευση: `instructorCurrency` (κλειδί = OID), **μία ημερομηνία ανά item**.
Μηχανή: `window.SchedCurrency` (app/scheduler.js § ③). Η καρτέλα δείχνει **και τις 91
γραμμές** — καμία δεν κρύβεται, όλες παραμένουν επεξεργάσιμες.

### 11α. ΔΙΑΘΕΣΙΜΟΤΗΤΑ vs ΚΑΤΑΓΕΓΡΑΜΜΕΝΕΣ ΥΠΟΧΡΕΩΣΕΙΣ (ο διαχωρισμός)

Δύο **ξεχωριστά** αθροίσματα, ποτέ ανακατεμένα:

- **counted (διαθεσιμότητα)** — κάθε γραμμή με μετρήσιμο παράθυρο που, αν λήξει,
  **κοστίζει διαθεσιμότητα** στον εκπαιδευτή. Μόνο αυτές οδηγούν την **τελεία** στο
  roster, το **«owes N»** και το **pill** της κεφαλίδας. Σύνολο: **21 (ΕΜΠ) / 19 (ΑΠ)**
  (Γύρος 10δ — βλ. τις 2 μετατάξεις στον πίνακα).
- **obligations (καταγεγραμμένες υποχρεώσεις)** — **15** γραμμές με παράθυρο που το
  ίδιο το catalog λέει ότι **δεν δεσμεύουν τη διαθεσιμότητα του εν ενεργεία εκπαιδευτή** —
  ο λόγος διαφέρει ανά γραμμή (καμία τυπωμένη απώλεια · πεδίο εκπαιδευομένου · προθεσμία/
  θητεία · μόνο εντός ΠΡ module) και **κάθε tag/tooltip τυπώνει τον δικό της λόγο**
  (Γύρος 10δ — το ενιαίο «no availability loss» αποδείχθηκε ψευδές για το ζεύγος
  εκπαιδευομένου). Μένουν στη θέση τους, με τη δική τους χρωματική κατάσταση γραμμής
  και επεξεργάσιμη ημερομηνία, αλλά **εκτός** τελείας / «owes» / pill. Μετριούνται μόνες τους:
  δεύτερη μικρή γραμμή «**obligations overdue: N**» (ουδέτερο στυλ, τα chips πηδούν
  στη γραμμή όπως τα owed chips) — εμφανίζεται **μόνο** όταν N > 0.
- **no counter** — ό,τι δεν έχει παράθυρο (χωρίς όριο §48γ · KPA Β-6/ΓΕΑ · «--»).
  Ταυτότητα ελέγχου: `counted + obligations + no counter = 91`.

**overdue ≠ κενό**: υποχρέωση χωρίς ημερομηνία **δεν** είναι overdue — απλώς δεν έχει
καταγραφεί (στο έντυπο τυπώνεται «—»).

Η λίστα είναι **χειροκίνητη, ανά id** (όχι keyword sniff) μέσα στη μηχανή, με τη
δικαιολόγηση από το catalog σε σχόλιο δίπλα σε κάθε id, και **ελέγχεται στο load**
(`console.warn` αν κάποιο id λείπει από το catalog):

| id | κατηγορία λόγου (10δ) | βάση από το catalog |
|---|---|---|
| `cross-staff-visits-ata-day` | καμία απώλεια | «Not an individual currency — no lapse for the instructor» · flag «Should not drive a per-instructor colour scale» |
| `squadron-commanders-conference` | καμία απώλεια | «Not an individual currency — no lapse for the instructor» (μόνο διοικητές) |
| `demo-pilot-tenure` | προθεσμία/θητεία | «The post must be handed over» · flag «A tenure limit, not a currency» |
| `pr-programme-completion` | προθεσμία/θητεία | «A completion deadline for the programme, not a recurring currency» |
| `demo-reavailability-15-to-30-days` | προθεσμία/θητεία | **10δ** — «Beyond 30 days this simplified route closes and the full §20 programme applies»: προθεσμία διαδρομής επαναδιάθεσης, ίδια φύση με το `pr-programme-completion` (R10c verify #8) |
| `pr-sortie-interval` | μόνο εντός ΠΡ module | **10δ** — flag «Applies only while a ΠΡ module is in progress — it is not a standing currency»: μετρούσε σιωπηλά +1 στο «owes» κάθε εκπαιδευτή (R10c verify #8) |
| `body-weight-check` | καμία απώλεια | «No consequence is printed in the 3-01» · flag «not a currency the instructor holds» |
| `monthly-knowledge-exams` | καμία απώλεια | «No availability loss is printed in the 3-01» |
| `seminar-sea-survival` | καμία απώλεια | «No availability loss is printed in the 3-01» |
| `training-egress-survival` | καμία απώλεια | «No availability loss is printed in the 3-01» |
| `training-aircraft-re-servicing` | καμία απώλεια | «No availability loss is printed in the 3-01» |
| `seminar-flight-physiology` | καμία απώλεια | «No availability loss is printed in the 3-01» |
| `seminar-hpma-crm-orm` | καμία απώλεια | «No availability loss is printed in the 3-01» |
| `trainee-20day-unscored-flight` | πεδίο εκπαιδευομένου | flag SCOPE: αφορά **εκπαιδευόμενο** (ΜΕΤ/ΕΕΠ) σε επαναδιάθεση· ο εκπαιδευτής σε κανονική υπηρεσία διέπεται από §70 |
| `trainee-30day-type-availability-loss` | πεδίο εκπαιδευομένου | flag SCOPE: ίδια ανάγνωση Annex B §13 |

**Εκκρεμεί απόφανση χρήστη** (R10c verify #8, δεύτερο σκέλος): οι 4 γραμμές `demo-*`
αφορούν μόνο πιλότους επίδειξης (θέση max-4, Κεφ. 5) αλλά μετρώνται/εμφανίζονται για
όλους — χρειάζεται μελλοντικό flag «display pilot» ανά εκπαιδευτή για να κρυφτούν ή να
εξαιρεθούν στοχευμένα. Στο έντυπο οι υποχρεώσεις τυπώνουν πλέον και **due soon** (10δ)
ώστε το χαρτί να μη χάνει το σήμα «πλησιάζει» — recorded / due soon / overdue / —.

**Δεν** μπαίνουν εδώ το `seminar-pdo` και το `seminar-tactics`: το lapse τους ονομάζει
ρητά §69δ(1)/(2) και **Partially Combat Ready**, άρα κοστίζουν διαθεσιμότητα και
μετρώνται κανονικά.

### 11β. ΧΡΩΜΑ — ΕΝΑΣ κανόνας, χωρίς εξαιρέσεις

```
AMBER  days_left <= min(round(validity × 25%), 45)
RED    ληγμένο ή ποτέ καταγεγραμμένο
GREEN  οτιδήποτε άλλο
GREY   δεν υπάρχει παράθυρο να μετρηθεί
```

Με λόγια — και το legend της καρτέλας **και** του εντύπου λένε ακριβώς αυτό: *amber όταν
απομένει ένα τέταρτο του παραθύρου — το πολύ 45 ημέρες*. Το πλαφόν των 45 ημερών
εμποδίζει ένα ετήσιο παράθυρο να στέκεται amber επί τρίμηνο· το ποσοστό κρατά ένα
10ήμερο παράθυρο πράσινο ως τις τελευταίες 3 ημέρες. Παραδείγματα κατωφλίου:
10d→3 · 15d→4 · 30d→8 · 45d→11 · 60d→15 · 90d→23 · 120d→30 · 180d→45 · 365d→45 · 1095d→45.

### 11γ. Η ΜΙΑ ΡΑΦΗ ΕΓΓΡΑΦΗΣ

`bump(oid, item_id, date, src)` είναι ο μοναδικός writer:

- `""` ή `null` **καθαρίζει** — και **μόνο** με `src="manual"`.
- Οτιδήποτε άλλο δεν διαβάζεται ως πραγματική ημερομηνία (λάθος μορφή, «2026-02-30»,
  «14/08/2026», `undefined`, αντικείμενο) **απορρίπτεται**: `null` + `console.warn`,
  **χωρίς να αγγίξει** την αποθηκευμένη τιμή. Ένα buggy μελλοντικό call δεν σβήνει ποτέ.
- `manual` υπερισχύει και πάει και πίσω· κάθε άλλο `src` είναι **αυτόματη** πηγή: μόνο
  εμπρός, ποτέ δεν καθαρίζει.

### 11δ. Έντυπο (squadron binder)

Ένας εκπαιδευτής ανά φύλλο, μονόχρωμο. `@page` περιθώρια 12/10 mm, οι τίτλοι στηλών
επαναλαμβάνονται (`display: table-header-group`), καμία γραμμή δεν κόβεται στη μέση και
καμία κεφαλίδα ομάδας δεν μένει μόνη στο κάτω μέρος σελίδας (`break-after: avoid`).
Οι υποχρεώσεις τυπώνουν **«overdue» / «recorded» / «—»** — ποτέ «EXPIRED» — και το
legend εξηγεί τον διαχωρισμό σε μία πρόταση.
