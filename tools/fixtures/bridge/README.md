# Bridge fixtures — the number that has to be re-runnable

Headless test file for `app/schedbridge.js` — the FDMS ⇄ Wings Ahead cross-check
report, and since Phase 3 (26/08/2026) the **confirmed fill** that writes a
confirmed line into the FDMS training log. Spec: `specs/bridge-spec.md`.

## How to run

```
node tools/fixtures/bridge/run.js
```

No install, no build step, no flags: plain Node, from anywhere. The last line is
the number, and the exit code is `0` only if nothing failed.

```
════════════════════════════════════════════
  BRIDGE FIXTURES — 316 passed, 0 failed
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

It does **not** prove anything about the pane's painting, the palettes, or the
live store — those are verified in the app and recorded in § 10 as such.

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

The offline builder (`tools/build_offline.py`) never looks in here: it collects
from an explicit file list under `app/` and `data/`, so nothing in this directory
can reach the closed-network bundle.
