"use strict";
/* THE BOARD-TREES FIXTURE FILE — one run, one number.
       node tools/fixtures/board/run.js
   Loads app/schedconsq.js and app/boardtrees.js headlessly (harness.js), reads
   the two data files and drives: the data's integrity against its sources
   (p1), the ONE engine's pure seams (p2) and the sandbox verdicts (p3). Every
   sequence is FABRICATED; nothing is read from or written to a store, the repo
   or the network — no dependency, no build step, no localStorage.
   See tools/fixtures/board/README.md and specs/board-trees-spec.md. */
process.env.FIXTURE_RUN = "1";
require("./p1-data.js");       // the JSON cannot drift from failure_procedures / the matrix
require("./p2-engine.js");     // SchedConsq.walk / countersFrom / smsMax, headless
require("./p3-sandbox.js");    // BoardTrees.evaluate — thresholds, verdicts, cites

const R = require("./harness.js").report();
console.log("\n════════════════════════════════════════════");
console.log("  BOARD FIXTURES — " + R.pass + " passed, " + R.fail + " failed");
console.log("════════════════════════════════════════════");
if (R.fail) { R.FAILURES.forEach((f) => console.log("  ! " + f)); process.exitCode = 1; }
