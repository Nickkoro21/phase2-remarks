# Board decision trees — specification

*Phase II (T-6A) · παραπομπή στο Συμβούλιο Πτητικής Ικανότητας · 17/10/2026*

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

A node: `{ id, kind, label, condition, threshold, outcome, next_with, engine, cites[], unresolved[], link_tree? }`.

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
| `oral_1z` | 1ζ | ΚΕΠΕ at 2/4, referral at 4/8, the written exam, the **ΠΔ ≠ 3-01 contradiction**, second referral → direct Board |
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

### The παρ.7/9 overlay — flagged as interpretation
`SchedConsq` opens every new ladder at the ΑΕ rung. The ΠΔ says the ΑΕ judges
**once per stage** (παρ.7) and the Δκτής **once if the ΑΕ test was ≥60 %, twice
if <60 %** (παρ.9); after that, Board without a progress test. The sandbox
applies this on top of the engine's `pd.stage` and shows both («SchedConsq: ae ·
ΠΔ παρ.7/9 (ερμηνεία): cdr»). It is labelled ΕΡΜΗΝΕΙΑ in the UI and recorded as
unresolved on the `dp_exhausted` node, because παρ.9 keys on «the previous ΑΕ
test» that a second referral never has. **Recommendation:** move it into
`SchedConsq` once the reading is agreed.

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
* **Two switches**, because the sources leave two readings open. Both defaults
  are now **owner rulings of 2026-10-17**; the other reading
  stays behind the switch and is printed beside the verdict either way — he
  wants to *see* the other reading, not lose it.
  * *1ζ: αποτυχία στη γραπτή ΑΕ* — **default 3-01 §58η (fail-38)**: first
    failure → re-examination after 2 calendar days (the day of failure not
    counted) on the same subjects; **Board only on the second failure**. The ΠΔ
    άρθρο 3 παρ.4β reading (fail-39: one failure by the ΑΕ → Συμβούλιο) is the
    other position of the switch and is named in the fired line and the verdict
    whichever position is active. *Ruling 2026-10-17*: the 3-01 is the directive
    the squadron actually works to. This **overrides** the module's original
    decree-over-directive default (ΠΔ), which was an FDMS assumption and is now
    withdrawn.
  * *1δ παρονομαστής* — **default planned, 85 sorties (Syllabus)** → the 20 %
    is reached at the 17th flight graded 0-59. Governing text: ΠΔ 29/2020
    άρθρο 3 παρ.1δ (fail-77), identical in 3-01 §58δ; flight numbers from the
    Syllabus. *Ruling 2026-10-17*: planned flights. The executed-count reading
    (the Progress editor's; on it any second lag in six flights is 33 %) remains
    behind the switch for inspection. The pre-solo 40 % is computable only on
    the executed reading (no source gives the planned pre-solo count), so on
    *planned* it is shown as information and never fires.
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
| 1γ | grace 4 · 2×0-49 · 3×0-59 | fail-76 | SchedConsq.countersFrom c049/c059 |
| 1δ | ≥40 % pre-solo · ≥20 % total · 85 planned → 17 | fail-77 | SchedConsq.countersFrom preSolo/totalFl (+ planned option) |
| 1ε | grace 3 · 3 consecutive · 20 % and ≥3 | fail-40 | SchedConsq.countersFrom fs059/fsCum (new) |
| §30στ F/S last | 3 attempts, 2 days before the 3rd | fail-11 | SchedConsq.walk fsLadder |
| §30ζ A/C last | Εξέταση Καταλληλότητας, then ΠΔ | fail-12, fail-27 | SchedConsq.walk apt |
| §56 first solo | Εξέταση Καταλληλότητας, solo not repeated | fail-19 | SchedConsq.walk apt (solo) |
| ΔΠ pass mark | 60 % | fail-23, fail-25 | SchedConsq.normRes |
| ΔΠ allowance | ΑΕ 1 · Δκτής 1 / 2 | fail-24, fail-26 | data overlay (§4) |
| 1στ | 2 consecutive written → Board | fail-32, fail-62 | SchedConsq written.streak → referral board |
| written pass | 80 % · bold face 100 % | fail-28 | data (passPct) |
| 1ζ | ΚΕΠΕ 2/4 · referral 4/8 · exam after 2 days | fail-36, fail-44, fail-37, fail-39, fail-38, fail-24 | SchedConsq oral.total + data streak/path |
| 1η 1θ 1ι | 1 incident → Board | fail-78, fail-79, fail-80, fail-62 | data → referral board |
| 1ια | ΕΔΕ → ΑΑΣ | fail-81, fail-63 | data |
| ΑΕΡΟΝΑΥΤΙΑ | 59 % · exempt 1γ/1δ · ΚΕΠΕ at 2 | fail-52, fail-57, fail-44 | SchedConsq exemptIf + data |
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

1. **1ζ default = 3-01 §58η — OWNER RULING 2026-10-17** (re-examination after
   2 days, Board on the second failure). The module shipped with ΠΔ παρ.4β as
   default on a decree-over-directive argument; the owner overruled it because
   the 3-01 is the directive the squadron works to. The ΠΔ reading stays on the
   switch and is always printed beside the active one.
2. **1δ default = planned 85 — OWNER RULING 2026-10-17** (confirming what the
   module shipped with, now ruled rather than assumed). Executed is a switch for
   inspection. Pre-solo 40 % fires only on executed.
3. **Nausea exemption = skip**, not break (παρ.2 «δεν υπολογίζονται»).
4. **A referral never re-opens a ladder already open** — the first owns it
   (one κρίση at a time).
5. **The stage exam (fail-33) is fed into the written counter**: it is a
   written ground exam «από Προϊστάμενη αρχή», so two failures read as 1στ by
   the letter of the ΠΔ. The matrix flags that this is not stated expressly;
   the timeline note says so.
6. **ΚΕΠΕ entries**: a trigger opens an entry only if not already in ΚΕΠΕ for
   that category; `kepe_exit` closes all. Exceeding the cap prints the unit
   ruling (ΑΕ 364 ΜΕΑ, 09/08/2026: no re-entry, no referral).
7. **The παρ.7/9 overlay** stays outside the engine and is labelled
   interpretation (§4).
8. **A dp/apt/board record with no open κρίση is ignored** and the row says so,
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

1. **1ζ — RULED 2026-10-17: 3-01 §58η governs** (re-exam after 2 days, Board
   only on the 2nd failure); the ΠΔ παρ.4β reading (1 failure → Board) is kept
   visible behind the switch. Still open in the sources: examiner (ΑΕ only vs
   Δκτής or ΑΕ), syllabus (all subjects vs 50+25+5), no pass mark stated for
   this exam.
2. **1δ denominator — RULED 2026-10-17: planned flights** (85 → 17 lags). The
   executed reading stays behind the switch for inspection. Still open: the
   pre-solo flight count is not given anywhere, so the 40 % has no planned
   basis.
3. **παρ.7 vs παρ.9**: the Δκτής' allowance keys on «the previous ΑΕ test»,
   which a second referral (ΑΕ already used) never has.
4. **1γ sequence**: whether a non-graded sortie (§43) or an exempt nausea
   flight *breaks* or is *skipped*; whether the 4 grace sorties include F/S;
   ΜΟΝΟΣ flights (graded) are not excluded.
5. **1ε**: planned vs executed again; the missing «και άνω».
6. **§31 suspension** speaks of the Board stage; whether it also covers the
   Δοκιμές Προόδου (which are flights) is not said.
7. **Phase II has no repeat checkride and no cap on Εξετάσεις Καταλληλότητας**
   while Phase III/IV has both — intent or omission.
8. **Stage exam (fail-33) and blind control (fail-35)**: a second failure is
   unregulated; blind control's 90 % vs 3-01's 80 %/100 %.
9. **ΑΕΡΟΝΑΥΤΙΑ**: no maximum, no ΚΑΙ threshold; §35 (always 59 %) vs §37
   (graded only if ΑΠΟΤΥΧΙΑ under 75 %/75 %); the 3-01 §58 does not reproduce
   the ΠΔ exemption.
10. **ΚΕΠΕ**: cap exceeded → unit ruling only; «2 for ground exams» total or
    per kind.
11. **Board ΥΠΕΡ**: the practice flight's grading and threshold; who flies the
    exceptional Δοκιμή Προόδου and whether it counts under παρ.9; no cap on
    repeated referrals.
12. **10 working days** run from «the last flight» — for 1στ/1η/1θ/1ι there may
    be none.
13. **The live engine** (before this round) did not implement 1ε counters, the
    nausea exemption, the παρ.7/9 allowances, and treated a lag-only checkride
    as a non-event (§7). The first two are now in; the third is the overlay.
