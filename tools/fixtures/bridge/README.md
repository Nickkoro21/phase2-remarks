# Bridge fixtures — the number that has to be re-runnable

Headless test file for `app/schedbridge.js` — the FDMS ⇄ Wings Ahead cross-check
report, and since Phase 3 (26/08/2026) the **confirmed fill** that writes a
confirmed line into the FDMS training log. Since Phases 4+5 (28/08/2026) it also
covers the **push lane** — a flight typed in the Training log becoming a row on a
student's Wings Ahead record: the qualifying predicate, the wire shapes the
deployed `bridge_push` refuses by name, the derived queue, the eleven verdicts
and the three shapes of ↺ Undo across the wire (`p11-push.js`, `p12-undo.js`).
Since Phase 6α (05/09/2026) it also covers the **checkrides and the solos**, which
the Flight Commander's ruling of that day made appliable WA → FDMS
(`p13-evalsolo.js`).
Spec: `specs/bridge-spec.md` (§ 10, § 13ια, § 14γ, § 15κ, § 15λ, § 15μ, § 15ν,
§ 15ξ, § 16).

## How to run

```
node tools/fixtures/bridge/run.js
```

No install, no build step, no flags: plain Node, from anywhere. The last line is
the number, and the exit code is `0` only if nothing failed.

```
════════════════════════════════════════════
  BRIDGE FIXTURES — 1104 passed, 0 failed
════════════════════════════════════════════
```

## What the number proves — and what it does not

It proves that **this working copy of `app/schedbridge.js`** still answers the
whole enumeration of `specs/bridge-spec.md` § 10 the way the spec says it does:

* **line identity** survives a corrected date (one `source_moved`, and explicitly
  **no** phantom `wa_only` + `fdms_only` pair), a class move, a renamed person,
  and a line with no date at all;
* **all nine divergence classes** are forced at least once;
* the **three thresholds** are exactly where the rulings put them — `79/80`
  (exam), `59/60` (flight) and `59/60` (F/S, the ruling of 22/08/2026). The F/S
  probe also re-runs the engine **with the constant put back to 50** in a `vm`
  sandbox, so the silent failure that number used to cause is demonstrated
  mechanically instead of argued;
* the **NON-GRADED** badge means "does not complete the node" on every row that
  wears it, over the whole report;
* a **shredded WA record** still raises its warning down the `fdms_only` branch,
  and one that no row carried produces exactly one `report.notes` entry —
  silence is not a clean report;
* `esc()` covers all five characters, and a deliberately hostile fixture name
  stays text;
* **Phase 3** — the apply plan and the very record the store would get: the
  provenance shape (`id wa:…` · `origin` · the `bridge` block), **re-loading the
  same export reads `agree` and can never write twice**, a changed source grade
  becomes `payload_differs` **against the bridge's own event**, a corrected date
  is one `update` (the event's date and its provenance twin, nothing else — the
  remembered grade is not re-stamped by a date move, and every provenance key an
  act touches rides **inside** the change-log field list so ↺ Undo can revert
  it), an incomplete mission is stored as `lag` — tied
  **mechanically** to the line of `app/scheduler.js` that leaves such a node owed
  — and `ng` / `awaiting` / a non-integer grade are never appliable, each with
  the sentence that says why. The write controls are checked to be **absent from
  `SchedStore`'s NAV list**, and the store-touching half is checked to be absent
  from the public surface.
* **Phase 3b** — the two findings of the Phase-3 adversarial verify. A Wings
  Ahead row naming a sortie the **syllabus graph does not carry** (`ZZ999`, and
  the near-miss `C4404` beside the real `C4304`) is class `refused` with the
  sentence, carries **no plan**, and completes nothing — while the real sortie
  beside it still applies. The graph is asked about the **node**, not the row
  identity, so a known lesson group with an unknown course is untouched. The
  **four seams** (classification · plan builder · shared refusal · the writer's
  own, which asks the live graph) are read out of the source, including the
  ordering that puts the question **before** the «date» act's early return. And
  an event the store already holds on such a node is a **visible** `fdms_only`
  row in its own group, never dropped on the floor.

* **Phases 4+5b** — the four findings of the push lane's adversarial verify.
  The **chunk** the client sends is 25 and not the envelope's 200 (the `anon`
  role's 3 s statement timeout kills a 200-op call), the sender's halving is
  driven through `chunkOps`, and `wireFailKind` is asked all six sentences a
  failed call can carry — so that a **transport** failure still stops the run
  while a refusal naming `student_oid` holds **one student** and lets everybody
  else cross. A `missing` verdict **keeps** the row it last wrote, and
  `missingLook` is driven through all five states a read of Wings Ahead can be
  in (moved · deleted · ambiguous · already claimed by another identity · a
  malformed memory rescued by the identity's own `uid`). And a **poisoned
  ledger** — a hand-made backup with a string `seq`, `kind:"banana"`, a
  `duration`, an `entered_by` — is refused **by name, on `prev`, with no wire
  call**, and never silently repaired.

* **P45-FDMSc — the AGE of a read.** The verify of the round above walked the
  pane's own primary offered act into a duplicate twice, because `missingLook`
  asked only what a read **shows** and never how **old** it is. So `readFresh`
  is driven through all three of its tests — the **arrival** test (`taken_at`
  against the held row's `at`, one clock, the verifier's exact sequence), the
  **audit** proof (the read's own `bridge.audit_tail` carrying this rid's this
  verdict — and refused when the rid or the verdict is somebody else's), and
  the **generation** test (a file opened now but exported before the refusal) —
  plus the two states where nothing can be proven and therefore nothing arms.
  `parseExport` is checked to **stamp** the arrival instant, so neither carrier
  can forget it; both instants are asserted to be printed in the reader's own
  frame; and **⇄ Adopt is asserted NOT to be gated** — the recorded judgement,
  because it writes the ledger alone and a stale adoption costs a refusal, not
  a second row. `WIRE_MS` is read as the number it is (20 s against the far
  side's own 3 s budget) and checked not to be confused with the server's 57014,
  which halves and retries instead of stopping.

* **P45-FDMSe — a sentence that cannot prove itself is not printed.** The round
  above rewrote `removalWhy` to abolish the guessing «or» and its own verify
  found that the rewrite had left one unproven clause and added a second. So a
  MOVED event's consequence clause is driven through **every** fate its flight
  can have under its new node — queued (and still on the queue when the run
  ends), refused by the **graph**, refused by the **event**, refused by an
  identity bound, held, already standing, undone — and the branch that used to
  promise «queued afresh» unconditionally is asserted to be **gone from the
  whole plan**. The strand's held line is driven both ways: with an event-side
  change waiting behind the hold (it must be **counted and said**) and without
  one (it must say the log was **asked**), and the two categorical claims it
  used to make about the training log and about the Wings Ahead record are
  asserted **absent**. `11n ⑤bis` drives § 15ν·2's **table row 14** — the
  branch a mutation could delete with the whole 805 staying green — in the
  verifier's own store shape. And the client's upper-casing of OIDs against a
  far side that matches exactly is surfaced in two places and driven in
  `11p·3`, including that it is a **warning and not a new refusal**.

* **Phase 6α — the checkrides and the solos.** The ruling («checkrides and solos
  become appliable; FAIL / NFS / SMS / airsickness stay report-only») is driven
  group by group: a checkride writes its EVALUATOR by code and never by name,
  and a checkride stored as ΥΣΤΕΡΗΣΗ / ΑΠΟΤΥΧΙΑ prints on the confirm line that
  `SchedPeople.avoidedIps()` will avoid that evaluator afterwards — tied
  **mechanically** to the lines of `app/scheduler.js` that do it. An evaluator
  without the qualification is a **warning**, in the Training log's own words
  (fail-12), and never a refusal; an evaluator who does not resolve is a refusal,
  in ruling #4's. A solo writes the literal **`SOLO`** in the instructor field —
  tied to `schedboard.js`'s own constant and to the `avoidedIps()` line that
  skips it — and keeps the AUTHORISING instructor in `bridge.src`, where a change
  of it is an adoption of the **provenance** and never of the seat. The one open
  assumption of the round, **`SOLO_NG_COMPLETES`**, is asserted to be a named
  constant, to be true for solos and false for every other group, and to print
  «pending confirmation» on every line it decides. The event's `kind` is asserted
  to be the **band** of the node and never the report group. And § 15ι is checked
  to have **stayed**: `PUSH_BANDS` is still `flights, fs`, the push predicate no
  longer tests the fill's scope at all, and neither a bridge-written checkride
  nor a bridge-written solo crosses back.

It does **not** prove anything about the pane's painting, the palettes, or the
live store — those are verified in the app and recorded in § 10 as such. That
limit is load-bearing rather than decorative: the three dialog cures of
P45-FDMSd (the forget dialog's blind block, the corrected footer, the
typed-count gate) can each be deleted with this number **staying green**,
because these fixtures assert what `missingLook` and `planPush` **carry**,
never what a dialog **prints**. The same holds for this round's two panels —
`plan.oidCase` and `held[i].changed` are asserted here as data; that they are
painted is checked with eyes, on the live walk.

## House rules for this directory

* **Every name here is fabricated** — `Fabricated Nobody`, `Imaginary Airman`,
  codes `ZZ-…` / `ZP-…`, class `77TST-Z`, `MN-9001`. Not one value comes from the
  private roster, and none ever may: the custody rule of `specs/bridge-spec.md`
  § 6 forbids real identities from reaching a commit, which is exactly why these
  fixtures are allowed to live in one.
* The fixtures **read** `app/schedbridge.js` and nothing else. No writes, no
  network, no `localStorage`, no store, no repo file touched.
* The path to the engine is **repo-relative** (`harness.js` → `BRIDGE_SRC`).
  Never hard-code a drive letter here: the whole point of the move into the repo
  was that any clone can re-run the count.
* **Run it, then write the number it printed** — never arithmetic on the previous
  one. That rule is why this directory exists at all: every round before Round 20
  deleted its fixtures at the end, so the next round had nothing to run and the
  count in the spec drifted (finding F4, twice).

## Files

| file | what it drives |
|---|---|
| `run.js` | the entry point — requires the probes in order, prints the count |
| `harness.js` | loads the engine headless, the fabricated fixture builders, `ok`/`eq` |
| `p2-identity.js` | line identity, immutability, the moved date |
| `p3-classes.js` | the nine classes, the three thresholds |
| `p5-remaining.js` | the groups the live run never exercised |
| `p6-fs60.js` | F/S judged at 60, and the mechanical inverse at 50 |
| `p7-nongraded.js` | the NON-GRADED badge and the shred note |
| `p8-esc.js` | `esc()`, all five characters, hostile name |
| `p9-apply.js` | Phase 3 — the plan, the written record, idempotency, drift, undo, the refusals |
| `p10-offgraph.js` | Phase 3b — the off-catalogue node (four seams + the defensive read), and the honest badge |
| `p11-push.js` | Phases 4+5 — the push lane: the predicate, the wire shapes, the derived queue, the eleven verdicts; 4+5b's chunk/halving, failure classification, poisoned `prev`, held student, pull-informed reconciliation; and P45-FDMSc's three freshness tests and the wire deadline; and P45-FDMSd's distinction between a removal owed by the training log and a row stranded by a lookup, the invariant that a read of Wings Ahead can never ADD a removal, and the staleness the ✕ Stop tracking dialog now prints; and P45-FDMSe's measured consequence clause (`11p`), the strand line that asks the training log instead of asserting about it (`11p·2`), the OID-case surfacing (`11p·3`), and § 15ν·2 table row 14 at last (`11n ⑤bis`) |
| `p12-undo.js` | Phases 4+5 — ↺ Undo across the wire: the three shapes and the two drift refusals |
| `p13-evalsolo.js` | Phase 6α — checkrides and solos appliable: the evaluator (ruling #4 · the fail-12 warning · the avoided-evaluator sentence, with no date window it cannot keep), the `SOLO` convention and the authorising instructor — **required**, so a flown solo with nobody's signature is `unwritten` and never proposed — `SOLO_NG_COMPLETES`, the empty slot on `wa.slot_empty`'s own test, idempotency, the moved date, **the sortie re-filed in the other section (one row, never a second event)**, undo byte-for-byte, and that the push lane did **not** grow with the fill |

The offline builder (`tools/build_offline.py`) never looks in here: it collects
from an explicit file list under `app/` and `data/`, so nothing in this directory
can reach the closed-network bundle.
