# Bridge fixtures — the number that has to be re-runnable

Headless test file for `app/schedbridge.js`, the **read-only** FDMS ⇄ Wings Ahead
cross-check. Spec: `specs/bridge-spec.md`.

## How to run

```
node tools/fixtures/bridge/run.js
```

No install, no build step, no flags: plain Node, from anywhere. The last line is
the number, and the exit code is `0` only if nothing failed.

```
════════════════════════════════════════════
  BRIDGE FIXTURES — 176 passed, 0 failed
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
  stays text.

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

The offline builder (`tools/build_offline.py`) never looks in here: it collects
from an explicit file list under `app/` and `data/`, so nothing in this directory
can reach the closed-network bundle.
