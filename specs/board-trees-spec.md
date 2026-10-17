# Board decision trees — specification

*Phase II (T-6A) · παραπομπή στο Συμβούλιο Πτητικής Ικανότητας · 17/10/2026*

(«The owner» throughout: identity binds to the person, never to a rank or a post. Verbatim quotations of the regulation that name posts stay as written.)

The owner's brief: the Board Tolerance Matrix «is just as hard as
searching the original manuals». Turn the cases in which a student is referred
to the Συμβούλιο Πτητικής Ικανότητας into decision trees he can read and test —
«I enter that this flight was a FAIL, this one NFS, this one a LAG, and it tells
me where he goes» — and let every single thing shown carry its citation and an
explanation: «3-01, προεδρικό διάταγμα, ποιο εδάφιο, τι λέει και πώς το ερμηνεύει».

This file is the contract. The code is `app/boardtrees.js`; the data is
`data/requirements/board_decision_trees.json`; the fixtures are
`tools/fixtures/board/`.

---

## 1. What exists and where it lives

| piece | file | role |
|---|---|---|
| the matrix (23 entries) | `data/requirements/board_tolerance_matrix.json` | unchanged — the «πόσες φορές χωρίς Συμβούλιο» summary, now rendered properly |
| the 89 requirements | `data/requirements/failure_procedures.json` | unchanged — where every citation resolves |
| **the trees (15 families, 88 nodes, 83 edges)** | `data/requirements/board_decision_trees.json` | **new** — every node: condition · threshold · outcome · who he flies with next · `cites[]` |
| **the module** | `app/boardtrees.js` | **new** — matrix renderer, tree outline + drawer, sandbox UI, and the pure `evaluate()` |
| the engine | `app/schedconsq.js` | **refactored, not duplicated** — `walk()` and `countersFrom()` made pure; `referral` special; 1ε counters; nausea hook; one bug fixed (§7) |
| the Requirements view | `app/app.js` | the `board_matrix` branch now delegates to `BoardTrees.renderBoardArea()` |
| styles | `app/styles.css` | `.bt-*` block at the end, reusing `fc-pill`, `fc-b`, `fc-drawer`, `req-card` |
| script tag | `app/index.html` | `boardtrees.js` after `schedconsq.js` — **11 external script tags now** (§9) |
| fixtures | `tools/fixtures/board/run.js` + `harness.js`, `p1-data.js`, `p2-engine.js`, `p3-sandbox.js` | `node tools/fixtures/board/run.js` → one number |

The three deliverables share one screen: Requirements → **Board Tolerance
Matrix** → three pills: *Πίνακας ανοχής* · *Δέντρα αποφάσεων* · *Δοκιμαστήριο*.

---

## 2. The data model — `board_decision_trees.json`

```
{ artifact, title, scope, generated, derived_from[], rule, sources_legend{},
  lettering { note, pd_cases_count 11, doc301_cases_count 12, offset_from "ζ", offset_amount 1, map[], cite },
  actors { own_ip, other_ip, evaluator, ae, cdr, ae_exam, none, board, aas, cdr_decides, na },
  node_kinds { start, test, step, outcome, terminal, note },
  engine { schedconsq[], data_only[], note },
  thresholds { dp, air_1g, air_1d, fs_1e, fs_last, written, oral, blind, stage_exam, nausea, kepe, board },
  tree_count, trees[] }
```

A tree: `{ id, title, short, pd_cases[], summary, engine_note, root, nodes[], edges[] }`.

A node: `{ id, kind, label, condition, threshold, outcome, next_with, engine, cites[], unresolved[], rulings[], link_tree? }`.

* `next_with` is an `actors` key — **who he flies with next** (ΑΕ Μοίρας, Δκτής
  Μοίρας, άλλος εκπαιδευτής, Αξιολογητής, ο εκπαιδευτής του, κανείς, Συμβούλιο,
  ΑΑΣ). Every node has one; `na` where no flight follows.
* `engine` is `schedconsq` (the threshold lives in `app/schedconsq.js`), `data`
  (the engine does not know the rule; the sandbox reads `thresholds`) or `both`.
* `cites[]` = `{ requirement_id, file, page_pdf, ref, verbatim, explanation }`.
  **`verbatim`, `file`, `page_pdf`, `ref` are copied programmatically** from
  `failure_procedures.json` — the same discipline the matrix uses. No PDF was
  re-read. **`explanation` is the FDMS reading of how that paragraph applies at
  that node** — plain Greek, and marked as interpretation. `p1-data.js` asserts
  byte-equality of every verbatim against its source, so a retyped quote fails
  the run.
* `unresolved[]` carries the matrix's open doubts onto the node where they bite.
* `rulings[]` = `{ date, by: "ο ιδιοκτήτης", text, quote }` — an owner ruling that
  closed a doubt at that node, with his words. Rendered as «✓ απόφανση» on the
  node and in the drawer. One exists today (1ζ, §8).
* `edges[]` = `{ from, to, label }`; a node may be reached twice (the outline
  prints it once and then a `↩` back-reference); `link_tree` jumps to a shared
  sub-tree (the Δοκιμές Προόδου ladder, the Board outcome).

### The lettering trap
3-01 §58 has **12** cases, ΠΔ 29/2020 άρθρο 3 παρ.1 has **11**: the 3-01 splits
the ΠΔ's 1ζ into §58ζ (criterion) + §58η (re-examination), so from «ζ» on every
3-01 letter is **one ahead** (ΠΔ 1η = §58θ, 1θ = §58ι, 1ι = §58ια, 1ια = §58ιβ).
It is in `lettering.map` (copied from fail-85), rendered as a warning banner
over the trees, and repeated on the oral-exam node and the discipline node.

---

## 3. The fifteen families

| id | ΠΔ | what it answers |
|---|---|---|
| `dp_ladder` | 1α-1ε | the shared ladder: ΑΕ (παρ.3) → Δκτής (παρ.8) → Συμβούλιο; 60 % at each rung; ΑΕ once per stage (παρ.7), Δκτής 1 or 2 (παρ.9) |
| `air_1a` | 1α | dangerous handling, one incident, **not** discipline → ladder |
| `air_1b` | 1β | checkride 0-59 % (ΥΣΤΕΡΗΣΗ included), no repeat in Phase II, nausea not exempt → ladder |
| `air_1g` | 1γ | after 4 grace sorties: 2×0-49 or 3×0-59; the nausea exemption; non-graded sorties |
| `air_1d` | 1δ | ≥40 % pre-solo / ≥20 % total; the denominator doubt |
| `fs_1e` | 1ε | the §30στ 3-attempt ladder on the last F/S of a section **and** the ΠΔ counters (3 grace / 3 consecutive / 20 % & ≥3); Δοκιμή Προόδου in the simulator |
| `section_last` | — | last A/C sortie of a section → Εξέταση Καταλληλότητας → fail → ΠΔ (3-01 only) |
| `first_solo` | — | first ΜΟΝΟΣ lag/fail → Εξέταση Καταλληλότητας with the solo profile; solo never repeated; ≤59 % cancels the next solo |
| `written_1st` | 1στ | 1st fail → ΚΕΠΕ + ΦΜΠ; 2nd consecutive → **direct Board**; stage exam; blind control 90 % |
| `oral_1z` | 1ζ | ΚΕΠΕ at 2/4, referral at 4/8, **one ladder**: γραπτή (3-01 §58ζ) → fail → επανεξέταση by the ΑΕ on all professional subjects after 2 days (3-01 §58η = ΠΔ παρ.4) → fail → Board; second referral → direct Board |
| `discipline_direct` | 1η 1θ 1ι | one incident → special report → direct Board |
| `accident_1ia` | 1ια | ΕΔΕ finding → ΑΑΣ, the Board bypassed |
| `airsickness` | — | definition, 59 %, παρ.2 exemption, ΚΕΠΕ at 2 consecutive, no maximum anywhere |
| `kepe` | — | 6 entry conditions, caps 2/2/1/1, exit, the unit ruling on exceeding the cap |
| `board_outcome` | παρ.11-19 | composition, quorum, 10 working days, hearing, decision, ΥΠΕΡ (change IP + 1 practice flight → Δκτής decides), ΚΑΤΑ (ΓΕΑ / ΑΑΣ) |

---

## 4. One engine — how the thresholds are evaluated

**Rule: a threshold `SchedConsq` already implements is never re-implemented.**
`app/schedconsq.js` was refactored so its two computations can be fed synthetic
data:

* `SchedConsq.walk(evs, ctx)` — the consequence walk (ΠΔ ladder `pd`, aptitude
  exams, the fail-11 F/S ladder, day blocks, ΚΕΠΕ caps). `ctx` supplies the five
  things it used to pull from the store/graph: `isLast`, `describe`,
  `interveningFs`, `nextIsExam`, `boardGates`, `kepeGates`.
  `SchedConsq.analyze(code)` is now `walk(flightEvents(code), liveCtx(code))` —
  same behaviour, same cache.
* `SchedConsq.countersFrom({ fly, exams, nfs, passPct, describe, exemptIf, isSoloDone })`
  — the Progress-editor counters: 1γ (`c049` ≤2, `c059` ≤3, grace 4), 1δ
  (`preSolo` 40 %, `totalFl` 20 %, executed denominator), written (streak, limit
  2), oral (total, 4/8), NFS — **plus two additions made with the trees**:
  * **1ε** (`fs059` 3 consecutive after 3 grace; `fsCum` ≥20 % and ≥3) — the
    live engine had the §30στ ladder but *not* the ΠΔ 1ε counters;
  * **the ΠΔ άρθρο 3 παρ.2 nausea hook** `exemptIf(x)` — a flight it returns
    true for leaves the 1γ/1δ sequence («δεν υπολογίζονται» read as *skipped*,
    not as *breaks the run*; the ΠΔ does not say which). The live Scheduler
    passes no predicate, so nothing changes there.
* `SchedConsq.SPECIAL.referral` — a new recordable special
  `{ special:"referral", stage:"ae"|"board", req, kind }`. It opens the one
  ladder at the named rung. This is how the sandbox hands 1α/1γ/1δ/1ε/1στ/1η/1θ/
  1ι to the engine instead of keeping a second ladder: the engine then resolves
  `dp_ae`, `dp_cdr`, `board` exactly as it does for a live student.
* `SchedConsq.smsMax(cat)` is exported (ΚΕΠΕ caps, fail-45).

**What is data only** (`thresholds` in the JSON, applied by the thin overlay in
`BoardTrees.evaluate()`): the direct-Board cases (1στ/1η/1θ/1ι → `referral
stage:"board"`), 1ια → ΑΑΣ, the 1ζ exam path (written exam by the ΑΕ,
re-examination under 3-01, second referral → Board), the ΠΔ παρ.7/9 allowance
overlay, the ΚΕΠΕ entry conditions (fail-44), blind control 90 %, the stage
exam, the Board ΥΠΕΡ cycle (practice flight → Δκτής decides → exceptional
Δοκιμή Προόδου). None of these is a counter; the overlay detects a *crossing*
of a SchedConsq counter and records a `referral`.

### The παρ.7/9 budget — in the engine (R7, owner ruling 2026-10-17)
`walk()` keeps, per stage and derived only from the events handed in:
`aeUsed` (the ΑΕ's single right, παρ.7 — spent whether he passed or failed:
occasions of judgment, not failures), `cdrBudget` (**1** if the ΑΕ's Δοκιμή was
≥60 %, **2** if below — παρ.9) and `cdrUsed`. **Every** new κρίση — 1β, 1γ,
1δ, 1ε, fail-12, fail-19, fail-11, an explicit `referral` — opens at the rung
the budget allows: `!aeUsed` → `ae`; `cdrUsed < cdrBudget` → `cdr`
(`pd.rung = "cdr_par7"`); else → `board` (`pd.rung = "board_par9"`, «χωρίς
πτήσεις Δοκιμής Προόδου»). The rung transitions are untouched: a failed `dp_ae`
→ `cdr`, a failed `dp_cdr` → `board` (παρ.8β — every Δκτής failure ends the
ladder; the second Δκτής occasion is reachable only by passing the first). A
direct referral (παρ.5, `rung "direct"`) and the exceptional Δοκιμή Προόδου of
παρ.17β (`rung "exceptional"`) bypass the budget. The unit of accounting is the
**ΣΤΑΔΙΟ**, not the category — «είναι ανά στάδιο, δεν είναι ανά κατηγορία.
Ασχολούμαστε μόνο με το Phase 2.» `walk()` returns `budget`; the sandbox and
`pdStageText()` only put words on the rung the engine chose. The overlay the
sandbox carried until this round is gone: one implementation. The case that
forced it: a student with his ΑΕ Δοκιμή already flown this stage fails the last
sortie of a unit, flies an Εξέταση Καταλληλότητας (3-01 §30ζ) and fails that
too — §30ζ «ΠΔ κατά περίπτωση» = 1β («πτήση **εξέτασης**»); before R7 the
engine offered a second ΑΕ test, which παρ.7 forbids in terms; now it opens at
the Δκτής.

---

## 5. The sandbox — what it does and does not do

* **Input**: a synthetic sequence of events, each one of: Πτήση Α/Φ (category ·
  κανονική / τελευταία ενότητας / Αξιολόγηση / πρώτη ΜΟΝΟΣ · ΕΠΙΤΥΧΩΝ / ΥΣΤΕΡΗΣΗ /
  ΑΠΟΤΥΧΙΑ / βαθμός % · ΑΕΡΟΝΑΥΤΙΑ with the παρ.2 condition), Έξοδος F/S, Δοκιμή
  Προόδου ΑΕ / Δκτή (αέρας / εξομοιωτής), Εξέταση Καταλληλότητας, Συμβούλιο
  (ΥΠΕΡ / ΚΑΤΑ), πτήση εξάσκησης, απόφαση Δκτή, γραπτή εξέταση, προφορική,
  γραπτή ΑΕ (1ζ), blind control, εξέταση τέλους Σταδίου, περιστατικό (1α 1η 1θ
  1ι 1ια), εισήγηση ΚΕΠΕ, έξοδος ΚΕΠΕ. Nine fabricated presets.
* **Output**: a timeline (per event: band, what fired, consequences, each with
  cite chips), the verdict (where he stands · **with whom he flies next** · what
  happens if he fails that too · cites), and the counters (SchedConsq values
  against their limits, ΚΕΠΕ entries against caps, ΑΕ/Δκτής judgements used).
  Every cite chip opens the drawer: paragraph, file and PDF page, the verbatim,
  the explanation at this point, and every other node that uses it.
* **One switch** — the 1δ denominator. (The 1ζ switch that shipped on the
  first pass is **gone**: on 2026-10-17 the owner read the two texts as one
  ladder, see §8 — so there is nothing to switch between.)
  * *1δ παρονομαστής* — **default: the total the phase or the stage HAS**
    (planned, 85 sorties for the stage per the Syllabus → the 20 % is reached at
    the 17th flight graded 0-59). Governing text: ΠΔ 29/2020 άρθρο 3 παρ.1δ
    (fail-77), identical in 3-01 §58δ, flight numbers from the Syllabus.
    *Owner ruling 2026-10-17*, in his words: «Εννοεί στο σύνολο, για όσες είναι
    προ μόνος ή όσες έχει το στάδιο» — 40 % of the total flights of the
    Προ-ΜΟΝΟΣ phase, or 20 % of the total flights of the stage; the programme,
    not the flights executed so far. The executed-count reading (the Progress
    editor's; on it any second lag in six flights is 33 %) remains behind the
    switch for inspection. **The Προ-ΜΟΝΟΣ phase has 15 printed sorties** (R3,
    §8) — so on the ruled default the 40 % is computable too: the 6th flight
    graded 0-59 before the first ΜΟΝΟΣ fires 1δ(ΠΡΟ ΜΟΝΟΣ).
* **The gate (R8a, owner ruling 2026-10-17).** The «Γεγονός» selector offers
  **only the legal next events for the current state** — an event the state
  does not allow is **not in the list** (not greyed: «όχι απλώς να μου
  γκριζάρει κάποια πράγματα, αλλά να μου περιορίζει τις επιλογές»). A state
  line above it says where the student stands and the single expected move,
  cited: «εκκρεμεί Δοκιμή Προόδου από τον ΑΕ», «… από τον Διοικητή Μοίρας»,
  «ΠΑΡΑΠΟΜΠΗ ΣΤΟ ΣΥΜΒΟΥΛΙΟ — ΧΩΡΙΣ πτήσεις Δοκιμής Προόδου», «Ελεύθερος —
  συνεχίζει κανονικά». `BoardTrees.allowedEvents(result)` is pure: no κρίση →
  sorties, exams, ΚΕΠΕ, incidents (never Δοκιμή Προόδου, Board, apt); κρίση at
  `ae` → only `dp_ae`; at `cdr` → only `dp_cdr` (so a spent ΑΕ, R7, never
  offers a second ΑΕ test); at `board` → only the Board; 1ζ referral → only the
  written exam; ΥΠΕΡ → only the practice flight, then only the Δκτής' decision;
  stopped / ΑΑΣ → nothing. **The engine stays the judge**: the gate narrows what
  is offered, it never decides an outcome, and `evaluate()` still processes
  (and reports as ignored) anything handed to it directly.
* **Airsickness on every flying event (R8b)** — flight, F/S, Δοκιμή Προόδου
  ΑΕ / Δκτή, Εξέταση Καταλληλότητας, practice flight — not only the ordinary
  sortie.
* **Airsickness on a Δοκιμή Προόδου does not help the student (R8c)**, and the
  sandbox demonstrates why in one fired line: (1) ΠΔ παρ.2's exemption is
  scoped «Κατά τις περιπτώσεις των υποπαραγράφων 1γ και 1δ» — παρ.3 is not in
  it; (2) the Δοκιμή is graded 59 % (3-01 §35; §43 expressly grades the
  airsickness ΑΔΕ unlike every other ΑΔΕ) and 59 sits inside παρ.3β's / παρ.8β's
  «από μηδέν (0) έως πενήντα εννέα τοις εκατό (59%)» — he is pushed to the next
  rung, not spared it; (3) the gate is medical: §34 defines «σοβαρή-έκδηλη» by
  objective facts and §39 lets the Ιατρός Αεροπορικής Ιατρικής exclude what is
  not airsickness. The same on an Εξέταση Καταλληλότητας (59 % = «ΥΣΤΕΡΗΣΗ εκ
  νέου» → ΠΔ).
* **Dates** are fictional: one working day per event unless typed; they serve
  only the rescheduling rules (fail-08/09/10/11).
* **It never reads the Scheduler store.** `p3-sandbox.js` asserts that
  `boardtrees.js` contains no `SchedStore`, `SchedReady` or `localStorage`
  reference and fetches nothing but its own JSON. No name, call sign or
  student number exists in the module, the data, the presets or the fixtures.
* **It is not a record.** Nothing it computes is persisted anywhere.

---

## 6. Where each threshold comes from

| rule | number | source (requirement) | engine |
|---|---|---|---|
| band ΥΣΤΕΡΗΣΗ / ΑΠΟΤΥΧΙΑ | 50-59 / 0-49 | fail-01 | SchedConsq.bandOf |
| 1α | 1 incident | fail-75 | data → referral |
| 1β | 1 checkride 0-59 | fail-16, fail-86 | SchedConsq.walk (checkride, any lag/fail) |
| 1γ | grace 4 (run starts at the 5th — R2) · 2×0-49 · 3×0-59 · checkrides skipped (R4) | fail-76, fail-44 | SchedConsq.countersFrom c049/c059 |
| 1δ | ≥40 % of the 15 printed Προ-ΜΟΝΟΣ sorties → 6 · ≥20 % of the 85 printed stage sorties → 17 (R3) | fail-77 · MIF table PDF 92 (`data/mif/t6a.json`) | SchedConsq.countersFrom preSolo/totalFl (numerators) + printed denominators in the sandbox |
| 1ε | grace 3 (run starts at the 4th — R2) · 3 consecutive · 20 % and ≥3 | fail-40 | SchedConsq.countersFrom fs059/fsCum (new) |
| §30στ F/S last | 3 attempts, 2 days before the 3rd | fail-11 | SchedConsq.walk fsLadder |
| §30ζ A/C last | Εξέταση Καταλληλότητας, then ΠΔ | fail-12, fail-27 | SchedConsq.walk apt |
| §56 first solo | Εξέταση Καταλληλότητας, solo not repeated | fail-19 | SchedConsq.walk apt (solo) |
| ΔΠ pass mark | 60 % | fail-23, fail-25 | SchedConsq.normRes |
| ΔΠ allowance | ΑΕ exactly 1 · Δκτής 1 if ΑΕ ≥60 / 2 if <60 · Δκτής fail → Board always (R5) | fail-24, fail-25, fail-26 | data overlay (§4) |
| 1στ | 2 consecutive written → Board | fail-32, fail-62 | SchedConsq written.streak → referral board |
| written pass | 80 % · bold face 100 % | fail-28 | data (passPct) |
| 1ζ | ΚΕΠΕ 2/4 · referral 4/8 · γραπτή after 2 days · επανεξέταση after 2 days (ΑΕ, all subjects) · Board on the 2nd failure | fail-36, fail-44, fail-37, fail-38 + fail-39 (same rung), fail-24 | SchedConsq oral.total + data streak/path |
| 1η 1θ 1ι | 1 incident → Board | fail-78, fail-79, fail-80, fail-62 | data → referral board |
| 1ια | ΕΔΕ → ΑΑΣ | fail-81, fail-63 | data |
| ΑΕΡΟΝΑΥΤΙΑ | 59 % = ΣΚ (§29δ) → exempt from 1γ/1δ when pre-onset Καλώς+ (R1) · ΚΕΠΕ at 2 | fail-52, fail-01, fail-57, fail-44 | SchedConsq exemptIf + data |
| ΚΕΠΕ | 6 conditions · caps 2/2/1/1 · 63 % | fail-44, fail-45 | data + SchedConsq.smsMax |
| blind control | 90 %, repeat next day | fail-35 | data |
| stage exam | repeat next day | fail-33 | data (and fed to written.streak — see §8) |
| Board | 10 working days · 1 practice flight | fail-67, fail-70 | data |
| rescheduling | μεθεπόμενη / επόμενη εργάσιμη | fail-08, fail-09, fail-10 | SchedConsq.walk blocks |

`p1-data.js` asserts every number in `thresholds` against the matrix's
`allowed_before_board` and the requirement's `values`; `p2-engine.js` asserts
the engine's limits (2, 3, 40, 20, 3, 3, 20, 3, 2, 4, 8, caps) by driving it.

---

## 7. A bug the fixtures found in the live engine

`walk()` opened the ΠΔ ladder on a checkride only when `res === "fail"`. A
checkride recorded as a plain **ΥΣΤΕΡΗΣΗ** (result `lag`, no score) fell through
as an ordinary sortie — a day block, no κρίση. fail-16 is the whole 0-59 % band
and 3-01 §69 (fail-86) says «ΥΣΤΕΡΗΣΗ ή ΑΠΟΤΥΧΙΑ … ΠΔ». Fixed: `if (d.checkride)`
after the completed branch. A scored checkride (≤59) was already right because
`normRes` maps a score ≤59 to `fail`. `p2-engine.js` pins all three shapes.

---

## 8. Decisions taken here — and the two the owner ruled on

1. **1ζ — RESOLVED by the owner, 2026-10-17: the ΠΔ and the 3-01 describe the
   SAME ladder, not two.** His words: «Στο ΠΔ εννοεί την πρώτη γραπτή εξέταση
   μετά την αποτυχία. Αλλιώς θα πήγαιναν οι μισοί συμβούλιο…». Read in
   sequence: (1) the written exam of 3-01 §58ζ (fail-37) is failed; (2) 3-01
   §58η (fail-38) — re-examination after 2 calendar days (the day of failure not
   counted) on the same subjects — **and this re-examination IS the exam ΠΔ
   άρθρο 3 παρ.4 describes** («εξετάζεται από τον ΑΕ της Μοίρας σε γραπτές
   εξετάσεις εδάφους σε όλα τα επαγγελματικά θέματα»); (3) ΠΔ παρ.4 (fail-39)
   gives its outcome: ΕΠΙΤΥΧΩΝ → continues flying, ΑΠΟΤΥΧΩΝ → Συμβούλιο — which
   is the 3-01's own «σε περίπτωση νέας ΑΠΟΤΥΧΙΑΣ, να εφαρμόζεται το ΠΔ». The
   decree names the examiner and the syllabus *of the re-examination*; it does
   not create a parallel one-strike route (on which half the course would end
   before the Board). Consequences: the first-pass rule switch and any
   decree-against-directive framing are retired from the module, the UI and
   this spec; node `o_reexam`
   cites fail-38 and fail-39 on the same path and carries the ruling in
   `rulings[]`; the former unresolved entry «ΑΝΤΙΦΑΣΗ ΠΟΥ ΑΛΛΑΖΕΙ ΤΟ "ΠΟΣΕΣ
   ΦΟΡΕΣ"» is withdrawn. **Still open, and now more visible** because the two
   texts are one rung: examiner (ΠΔ: ΑΕ only · 3-01: Δκτής ή ΑΕ), syllabus (ΠΔ:
   «όλα τα επαγγελματικά θέματα» · 3-01: 50+25+5), and the 3-01 prints no pass
   mark for it. The module's first-pass default (ΠΔ, on a decree-over-directive
   argument) and its second-pass default (3-01, by ruling) are both superseded
   by this reading.
2. **1δ — RULED by the owner, 2026-10-17: the denominator is the total the
   phase or the stage HAS** («Εννοεί στο σύνολο, για όσες είναι προ μόνος ή όσες
   έχει το στάδιο»): 40 % of the total flights of the Προ-ΜΟΝΟΣ phase, 20 % of
   the total flights of the stage — the programme, not the flights executed so
   far. Confirms and sharpens the planned default; executed stays a switch for
   inspection. What blocks computing his rule exactly stays open: no source
   gives the Προ-ΜΟΝΟΣ flight count, and whether F/S, ΜΟΝΟΣ, ΕΠΑΝΑΛΗΨΕΙΣ and ΑΔΕ
   sit in the denominator is not said (§10 #2).
3. **R1 — RULED by the owner, 2026-10-17: a 59 % airsickness sortie is EXEMPT
   from the 1γ run and the 1δ percentages.** The reconciliation is textual:
   3-01 §35 (fail-52) grades the sortie «ΥΣΤΕΡΗΣΗ (59%)»; 3-01 §29δ (fail-01)
   defines «ΣΚ» Σχεδόν Καλώς as **50%-59%**; so the 59 % sortie *is* «επίδοση
   Σχεδόν Καλώς» in ΠΔ άρθρο 3 παρ.2's own words (fail-57), and παρ.2 exempts
   it. The two instruments use different labels for the same value; §29δ is the
   bridge. The other two limbs of παρ.2 stay intact: the exemption requires
   that performance **before** the onset was «Καλώς και άνω» or unassessable
   (sandbox: `nausea: "pre_ok"`), and the sortie must sit in the ΣΚ band — a
   nausea sortie graded ΑΠΟΤΥΧΙΑ (0-49) is not «Σχεδόν Καλώς» and counts. The
   reasoning is recorded on nodes `g_exempt`, `d_exempt`, `n_exempt`
   (`rulings[]`, citing fail-01 + fail-52 + fail-57), because the labels will
   confuse the next reader exactly as they confused us. Closed by it: the
   «ναυτία / ΑΕΡΟΝΑΥΤΙΑ» terminology doubt and the «3-01 §58 does not reproduce
   the exemption» doubt (the ΠΔ governs). Still open: whether «δεν
   υπολογίζονται» *skips* the sortie or *breaks* the run — the engine skips.
4. **R2 — RULED INTERPRETATION by the owner, 2026-10-17: the grace period
   excludes the sortie entirely.** Counting starts from the **5th** sortie in
   the air and the **4th** on the F/S; a run of low grades may not include a
   grace sortie. Earliest possible 1γ referral: sorties 5+6 (two at 0-49) or
   5+6+7 (three at 0-59); earliest 1ε(αα): F/S 4+5+6. This is expressly an
   interpretation, not a quotation — ΠΔ παρ.1γ («Όταν μετά τις τέσσερις (4)
   πρώτες εξόδους του σταδίου και σε δύο (2) συνεχόμενες πτήσεις…») and
   παρ.1ε(αα) («Μετά τις τρεις (3) πρώτες εξόδους του σταδίου και σε τρεις (3)
   συνεχόμενες πτήσεις…»), identical in 3-01 §58γ/§58ε, do not say whether a
   run may begin inside the grace period and complete outside it. It is marked
   ΕΡΜΗΝΕΙΑ ΙΔΙΟΚΤΗΤΗ in `unresolved[]` on `g_grace` and `e_grace` with the
   texts shown. The engine already reads it this way (`ac.slice(4)`,
   `fs.slice(3)`); `p2-engine.js` pins 4+5 → 1, 5+6 → 2, 5+6+7 → 3, F/S 4+5+6 → 3.
5. **R3 — RULED by the owner, 2026-10-17: the Προ-ΜΟΝΟΣ count is 15, printed
   in the MIF table.** Syllabus table «CONTACT (PRE-SOLO) / Τ-6A» (PDF 92;
   digitised as `data/mif/t6a.json` `tables[0]`, column for column): C4101
   (1/0) + C4201-03 (3/0) + C4301-03 (3/0) + C4401-03 (3/0) + C4590 (1/0) +
   C4601-02 (2/0) + C4790-91 (1/1) = **14 dual + 1 solo = 15**, ending exactly
   at the first solo. Three independent sources agree (syllabus graph, Contact
   mission table, MIF table). Former doubt #8 («no source prints the count»)
   is **closed**. Both denominators are the **printed programme**, in his
   words: «όχι σε όσες έχει πετάξει μέχρι τώρα, αλλά στο σύνολο, είτε για το
   προ-μόνος είτε για όλο το στάδιο» — **40 % of 15 = 6** low grades in the
   Προ-ΜΟΝΟΣ phase, **20 % of 85 = 17** across the Στάδιο. Encoded in
   `thresholds.air_1d` (`pre_solo_sorties: 15`, `pre_solo_source`), on `d_pre`
   (`rulings[]`), in the sandbox (`1δ(ΠΡΟ ΜΟΝΟΣ)` fires at the 6th low grade on
   the default), and pinned against the digitised MIF by `p1-data.js`.
6. **R4 — RULED by the owner, 2026-10-17: an Αξιολόγηση (checkride) is NOT a
   member of the 1γ consecutive run. A real defect, fixed in the engine.**
   `countersFrom()` removed the specials (dp_ae, dp_cdr, apt, board, referral)
   from the run — right for Δοκιμές Προόδου — but a checkride is a graph node,
   so «checkride 45 → [dp_ae, filtered] → flight 45» became two *adjacent*
   0-49 grades and `trailStreak` fired 1γ(Α). Measured before the fix on
   that sequence (after the 4 grace sorties): **c049 = 2, c059 = 2, fired «1β
   | 1γ(Α)», verdict dp_cdr (a second referral)**; after: **c049 = 1, c059 = 1,
   fired «1β» only, verdict free / other instructor**. The owner's argument:
   a sub-60 checkride is already 1β, opens the ladder (a barrier) and is
   consumed by its own provision when the ΑΕ clears it («συνεχίζει την
   εκπαίδευσή του με άλλον εκπαιδευτή»); counting it again inside 1γ books one
   event into two ladders — «δεν μπορεί να ενεργοποιηθεί το 1γ με αξιολόγηση,
   γιατί έχουμε μπει στη διαδικασία της δοκιμής προόδου». Both sides recorded on
   node `g_ckr` (ΑΠΟΦΑΝΣΗ ΙΔΙΟΚΤΗΤΗ in `unresolved[]`): the ΠΔ does not
   exclude checkrides in terms, but 3-01 §32β(2) (fail-44) shows the drafter
   excludes «τελικές εξετάσεις και Δοκιμές Προόδου» expressly when he means to
   (the ΚΕΠΕ 63 % counter), so the silence is at best ambiguous — the
   double-counting argument settles it. Implementation: the checkride is
   *skipped* by `c049`/`c059` (like an exempt nausea sortie), keeps its slot in
   the 4-sortie grace window, and **1δ is untouched** — a failed checkride
   genuinely is one 0-59 flight of the stage; I see no reason to change 1δ.
   Not ruled and left open: whether a cleared 1β also resets the lags that
   preceded the checkride (the engine skips only: lag · lag · checkride · ΑΕ
   ≥60 · lag = run of 3).
7. **R5 — the Δοκιμή Προόδου ladder, confirmed by the owner against the text
   (2026-10-17) and encoded as the state machine** (`thresholds.dp.state_machine`,
   nodes `dp_ae_pass` / `dp_cdr`, the sandbox verdict): the ΑΕ judges
   **exactly once per Στάδιο, pass or fail** (παρ.7); a **Δκτής failure is
   always the Board** (παρ.8β) — no second chance after it; **how many Δκτής
   occasions exist is set by the ΑΕ grade, not by passing the Δκτής** (παρ.9):
   ΑΕ «καλώς και άνω» (≥60 %) → **one**; ΑΕ below 60 % → **two**; then
   «Συμβούλιο χωρίς πτήσεις Δοκιμής Προόδου». The surprising branch — ΑΕ
   *passed*, so the Δκτής has only one occasion — is now printed on the
   `dp_ae_pass` node's label and condition and in every dp_cdr verdict («Επειδή
   η Δοκιμή ΑΕ ήταν ≥60%, ο Δκτής έχει ΜΙΑ μόνο ευκαιρία … (αυτή είναι η 1η/1)»).
8. **R6 — documentation, no behaviour change (owner, 2026-10-17): the Εξέταση
   Καταλληλότητας consumes NO rung of the ΠΔ ladder.** 3-01 §30ζ gives it to an
   «Αξιολογητή της Μοίρας» — not the ΑΕ, not the Δκτής; it is the 3-01's own
   remedy for a failed last sortie of a unit and sits *below* the ladder; only
   «αν ΥΣΤΕΡΗΣΕΙ ή ΑΠΟΤΥΧΕΙ εκ νέου» does the ΠΔ fire, and then the ladder
   starts clean at the ΑΕ. Phase II sets no cap on Εξετάσεις Καταλληλότητας and
   no repeat of a failed one (Phase III/IV: §80β(4) caps at 3, §81α(4) allows a
   repeat). Stated on `l_apt` / `l_pd`; the engine already keeps them apart
   (`apt` is its own special, never `dp_ae`), and `dpUsed.ae` stays 0 after an
   aptitude exam.
9. **Nausea exemption = skip**, not break (παρ.2 «δεν υπολογίζονται»).
9a. **R8 (owner, 2026-10-17)** — the sandbox gate (hide, not grey), airsickness
   on every flying event, the three-part demonstration on a Δοκιμή Προόδου (§5),
   and **one gap recorded without a reading (R8d)** on `dp_ae`: if the
   airsickness comes early enough that the Δοκιμή becomes an ΑΔΕ under 3-01 §37
   (75 %/75 %), no source says whether the Δοκιμή is re-flown or whether
   re-flying it consumes a παρ.7 occasion («τεθεί υπό την κρίση» counts a
   judgment, not a flight); §71 removes airsickness ΑΔΕ only from the grade
   average.
10. **A referral never re-opens a ladder already open** — the first owns it
   (one κρίση at a time).
11. **The stage exam (fail-33) is fed into the written counter**: it is a
   written ground exam «από Προϊστάμενη αρχή», so two failures read as 1στ by
   the letter of the ΠΔ. The matrix flags that this is not stated expressly;
   the timeline note says so.
12. **ΚΕΠΕ entries**: a trigger opens an entry only if not already in ΚΕΠΕ for
   that category; `kepe_exit` closes all. Exceeding the cap prints the unit
   ruling (ΑΕ 364 ΜΕΑ, 09/08/2026: no re-entry, no referral).
13. **R7 — the παρ.7/9 budget moved INTO `schedconsq.js`** (owner ruling
   2026-10-17, unit of accounting = the stage); the sandbox overlay is removed
   (§4). The live Scheduler now opens a second κρίση of the stage at the Δκτής
   (or the Board) instead of a second ΑΕ test.
14. **A dp/apt/board record with no open κρίση is ignored** and the row says so,
   mirroring the engine.

---

## 9. The offline builder — read before shipping

`app/index.html` now carries **11** external `<script src>` tags
(`boardtrees.js` after `schedconsq.js`). `tools/build_offline.py` has a tripwire
that counts exactly **10** and a `SCRIPT_CHAIN` list; **both must be updated**
(`count=11`; add `("boardtrees.js", "boardtrees")` after `schedconsq`, and add
the module to the floor sweep) or the offline build fails by design. The new
JSON needs nothing: the builder globs `data/requirements/*.json` into
`window.FDMS_DATA` and the fetch shim serves it.

---

## 10. The open doubts, named (for the owner)

Carried on the nodes as `unresolved[]`; the ones that change an answer:

1. **1ζ — RESOLVED 2026-10-17 (one ladder, §8).** What remains genuinely
   open, and is now more visible: the examiner of the re-examination (ΠΔ: ΑΕ
   only · 3-01 §58ζ: Δκτής ή ΑΕ), its syllabus (ΠΔ: all professional subjects ·
   3-01: 50+25+5), and the pass mark (the 3-01 states none; presumably §25β's
   80 %/100 %).
2. **1δ denominator — RULED 2026-10-17: the printed programme** (15 Προ-ΜΟΝΟΣ
   → 6; 85 stage → 17; R3 in §8 — the Προ-ΜΟΝΟΣ count doubt is closed by the
   MIF table). Still open: whether F/S, ΜΟΝΟΣ, ΕΠΑΝΑΛΗΨΕΙΣ and ΑΔΕ sit in the
   denominator (§43 removes them only from the numerator). The executed reading
   stays behind the switch for inspection.
3. **παρ.7 vs παρ.9 — a drafting doubt, still open after R7** (it is only
   now visible in the right place, on `dp_cdr`): the Δκτής' allowance keys on
   «the previous ΑΕ test», which a second referral (ΑΕ already used) never has.
   The engine reads «previous» as the stage's one and only ΑΕ test (budget 1 if
   ≥60 %, 2 if <60 %, for the whole stage). Also open: whether the exceptional
   Δοκιμή Προόδου of παρ.17β counts against the budget (the engine counts the
   `dp_ae`/`dp_cdr` flown under it). Also open (R8d): a Δοκιμή Προόδου that
   becomes an ΑΔΕ through airsickness under §37 — re-flown? a παρ.7 occasion?
   No source says.
4. **1γ sequence**: whether a non-graded sortie (§43) or an exempt nausea
   flight *breaks* or is *skipped* (the engine skips); whether the 4 grace
   sorties include F/S; ΜΟΝΟΣ flights (graded) are not excluded. **Ruled as
   interpretation (R2)**: a run may not include a grace sortie — counting starts
   at the 5th (air) / 4th (F/S). **Ruled (R4)**: a checkride is not a member of
   the run (skipped). Not ruled: whether a cleared 1β resets the lags that
   preceded the checkride.
5. **1ε**: planned vs executed again; the missing «και άνω».
6. **§31 suspension** speaks of the Board stage; whether it also covers the
   Δοκιμές Προόδου (which are flights) is not said.
7. **Phase II has no repeat checkride and no cap on Εξετάσεις Καταλληλότητας**
   while Phase III/IV has both — intent or omission.
8. **Stage exam (fail-33) and blind control (fail-35)**: a second failure is
   unregulated; blind control's 90 % vs 3-01's 80 %/100 %.
9. **ΑΕΡΟΝΑΥΤΙΑ**: no maximum, no ΚΑΙ threshold; §35 (always 59 %) vs §37
   (graded only if ΑΠΟΤΥΧΙΑ under 75 %/75 %). **Ruled (R1)**: the 59 % sortie is
   «Σχεδόν Καλώς» via §29δ and exempt from 1γ/1δ under παρ.2's other limbs; the
   label and the 3-01-silence doubts are closed.
10. **ΚΕΠΕ**: cap exceeded → unit ruling only; «2 for ground exams» total or
    per kind.
11. **Board ΥΠΕΡ**: the practice flight's grading and threshold; who flies the
    exceptional Δοκιμή Προόδου and whether it counts under παρ.9; no cap on
    repeated referrals.
12. **10 working days** run from «the last flight» — for 1στ/1η/1θ/1ι there may
    be none.
13. **The live engine** (before this round) did not implement 1ε counters, the
    nausea exemption, the παρ.7/9 allowances, treated a lag-only checkride as a
    non-event (§7), and double-booked a failed checkride into the 1γ run (R4,
    §8 #6). All four are now in the engine (the παρ.7/9 budget since R7).
