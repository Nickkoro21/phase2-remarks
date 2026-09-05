"use strict";
/* THE BRIDGE FIXTURE FILE — one run, one number.
       node tools/fixtures/bridge/run.js
   It loads app/schedbridge.js headlessly (harness.js) and drives the whole § 10
   enumeration of specs/bridge-spec.md through it. Every name in every fixture is
   FABRICATED; nothing is read from, or written to, the store, the repo or the
   network — no dependency, no build step, no localStorage.
   Round 20: run it, then write the number it prints — never the other way
   round. Round 20b: and it lives HERE, in the repo, so the next round has
   something to run instead of something to add up.
   See tools/fixtures/bridge/README.md and specs/bridge-spec.md § 10. */
process.env.FIXTURE_RUN = "1";
require("./p2-identity.js");     // identity immutability, the moved date
require("./p3-classes.js");      // the nine classes, the three thresholds
require("./p5-remaining.js");    // the groups the live run never exercised
require("./p6-fs60.js");         // Round 19 — F/S judged at 60
require("./p7-nongraded.js");    // slice 1b — the badge and the shred note
require("./p8-esc.js");          // esc(), all five characters
require("./p9-apply.js");        // Phase 3 — apply · provenance · idempotency · undo
require("./p10-offgraph.js");    // Phase 3b — the off-catalogue node, and the badge
require("./p11-push.js");        // Phase 4/5 — the push lane: predicate · shapes · queue · verdicts
require("./p12-undo.js");        // Phase 4/5 — undo across the wire, and the two drift refusals
require("./p13-evalsolo.js");    // Phase 6α — checkrides and solos appliable, and what each one owes
/* Phase 6β — the currency lane. It is the ONE asynchronous probe, and the
   reason is app/currency.js: that module loads its 91-item catalog through
   fetch(), which is a promise however it is fed, and a probe that ran without
   the catalog could not tell a real Ε id from an invented one. So it exports a
   function, the total is printed after it settles, and the number is still
   printed exactly ONCE and only after everything has run. */
const p14 = require("./p14-currency.js");   // Phase 6β — instructor currency, WA → FDMS

function total() {
  const R = require("./harness.js").report();
  console.log("\n════════════════════════════════════════════");
  console.log("  BRIDGE FIXTURES — " + R.pass + " passed, " + R.fail + " failed");
  console.log("════════════════════════════════════════════");
  if (R.fail) { R.FAILURES.forEach((f) => console.log("  ! " + f)); process.exitCode = 1; }
}

p14().then(total, (err) => {
  console.log("\n  ! p14-currency.js threw: " + ((err && err.stack) || err));
  total();
  process.exitCode = 1;
});
