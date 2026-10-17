# Board fixtures — the thresholds that must never drift silently

Headless test file for the **Board decision trees** (`app/boardtrees.js`,
`data/requirements/board_decision_trees.json`) and for the pure seams they
pull out of the consequence engine (`app/schedconsq.js`: `walk`, `countersFrom`,
`smsMax`). Spec: `specs/board-trees-spec.md`.

## How to run

```
node tools/fixtures/board/run.js
```

Plain Node, no install, no flags. The last line is the number; the exit code is
`0` only if nothing failed.

## What the three probes prove

* **p1-data** — every `cites[]` entry in the trees JSON is a byte-for-byte copy
  of the requirement it names (verbatim, file, page, ref); every threshold the
  trees state equals the matrix's `allowed_before_board`; every edge lands on a
  node; every node names who flies next and carries at least one cite; the
  3-01 §58 lettering shift (ζ → +1) is in the data.
* **p2-engine** — `SchedConsq.walk()` and `SchedConsq.countersFrom()` driven
  with synthetic events: the ΠΔ ladder (ae → cdr → board → stopped), the new
  `referral` special, the F/S 3-attempt ladder, the aptitude-exam paths, the
  1γ / 1δ / 1ε counters (grace 4 / 3, limits 2-3, 40 % / 20 %, floor 3), the
  nausea exemption hook, written / oral counts, the KEPE caps, and that the
  live wrapper still binds to the store.
* **p3-sandbox** — `BoardTrees.evaluate()` scenarios: where the student goes
  and with whom after each sequence, which thresholds fired, every line cited,
  the 1ζ contradiction shown under both rules, the ΠΔ παρ.7/9 overlay, direct
  Board incidents, the ΑΑΣ, KEPE entries — and that the module never touches
  `SchedStore`, `SchedReady`, `localStorage` or any URL but its own JSON.

Every sequence is fabricated. No name, call sign or student number appears.
