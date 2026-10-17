"use strict";
/* BOARD-TREES harness — loads app/schedconsq.js and app/boardtrees.js headlessly
   and feeds them the two data files. No store, no graph, no network, no name.
   Repo-relative paths only (tools/fixtures/board → three levels up). */
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..", "..", "..");
const P = (...a) => path.join(ROOT, ...a);

global.window = global;
global.document = undefined;                 // the module must stay DOM-free until render
// eslint-disable-next-line no-eval
(0, eval)(fs.readFileSync(P("app", "schedconsq.js"), "utf8"));
// eslint-disable-next-line no-eval
(0, eval)(fs.readFileSync(P("app", "boardtrees.js"), "utf8"));
const CQ = global.SchedConsq;
const BT = global.BoardTrees;
if (!CQ || !BT) throw new Error("SchedConsq / BoardTrees did not attach");

const TREES = JSON.parse(fs.readFileSync(P("data", "requirements", "board_decision_trees.json"), "utf8"));
const FP = JSON.parse(fs.readFileSync(P("data", "requirements", "failure_procedures.json"), "utf8"));
const MX = JSON.parse(fs.readFileSync(P("data", "requirements", "board_tolerance_matrix.json"), "utf8"));
BT.setData(TREES);
const REQ = new Map(FP.requirements.map((r) => [r.id, r]));

let pass = 0, fail = 0;
const FAILURES = [];
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  PASS  " + name); }
  else { fail++; FAILURES.push(name + (extra ? "  << " + extra : "")); console.log("  FAIL  " + name + (extra ? "\n        " + extra : "")); }
}
function eq(name, got, want) { ok(name, got === want, "got " + JSON.stringify(got) + " want " + JSON.stringify(want)); }

/* sandbox shorthands — every sequence is FABRICATED */
const F = (res, o) => Object.assign({ t: "flight", cat: "contact", res: res || "pass" }, o || {});
const FS = (res, o) => Object.assign({ t: "fs", cat: "instrument", res: res || "pass" }, o || {});
const ev = (t, res, o) => Object.assign({ t: t, res: res }, o || {});
const run = (events, opts) => BT.evaluate(events, TREES, opts);
const firedCases = (r) => r.fired.map((f) => f.case);
const hasCite = (list, id) => (list || []).some((c) => (c.id || c.requirement_id) === id);

module.exports = { ROOT, CQ, BT, TREES, FP, MX, REQ, ok, eq, F, FS, ev, run, firedCases, hasCite,
  report: () => ({ pass, fail, FAILURES }) };
