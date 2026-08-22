"use strict";
/* PROBE 6 — ROUND 19's RULING: F/S IS JUDGED AT 60, LIKE A FLIGHT.
   «60% f/s, flights» (22/08/2026). The 50 never existed as a pass mark — it was
   the ΠΔ band floor misread as one — and at 50 a 55 % simulator sortie was
   printed COMPLETE on both sides, class `agree`, completing a node. That is the
   silent failure ruling #6 forbids, so it is proved MECHANICALLY here: the
   inverse is re-run against a copy of the engine with the constant put back. */
const H = require("./harness.js");
const { B, run, ok, eq, person, record, waExport, fdmsStudent, fdmsIp, ev } = H;

const fsAt = (grade, log) => {
  const wa = waExport([person({ oid: "oid-a1" })], [record("wa-oid-a1", {
    fs: [{ date: "2026-08-15", sortie: "FS4101", seq: 1, kind: "syllabus", instructor: "Airman", grade: grade }] })], true);
  return run(wa, { students: [fdmsStudent({ oid: "oid-a1" })], instructors: [fdmsIp({})],
    trainingLog: log ? [ev(Object.assign({ date: "2026-08-15", node: "s:FS4101", instructor: "ZP-1" }, log))] : [] });
};

console.log("\n=== PROBE 6 — the zone the old fs:50 swallowed: 55 % on both sides ===");
{
  const r = fsAt(55, { result: "score", score: 55 });
  const row = r.rows[0];
  ok("55 % reads INCOMPLETE against the 60 line", /INCOMPLETE/.test(row.waVerdict) && /55 %/.test(row.waVerdict), row.waVerdict);
  eq("the frozen threshold printed on the row is 60", row.thr, 60);
  eq("the two sides still AGREE — the correction invents no deviation", row.cls, "agree");
  eq("and it does NOT complete the node", row.completes, false);
  ok("the FDMS side reads it the same way", /55/.test(row.fdmsVerdict), row.fdmsVerdict);
}

console.log("\n=== PROBE 6b — the boundary itself ===");
{
  eq("F/S 59 does not complete", fsAt(59).rows[0].completes, false);
  eq("F/S 60 completes", fsAt(60).rows[0].completes, true);
  eq("the constant is 60, not 50", B.THRESHOLDS.fs, 60);
  eq("and it is the SAME number a flight is judged by", B.THRESHOLDS.fs, B.THRESHOLDS.flights);
}

console.log("\n=== PROBE 6c — THE MECHANICAL INVERSE: the engine with fs back at 50 ===");
{
  const fs = require("fs");
  const src = fs.readFileSync(H.BRIDGE_SRC, "utf8");
  const back = src.replace("const THRESHOLDS = { exams: 80, flights: 60, fs: 60 };",
                           "const THRESHOLDS = { exams: 80, flights: 60, fs: 50 };");
  ok("the copy really was altered (one constant, nothing else)", back !== src && back.length === src.length);
  const sandbox = { console: console };
  sandbox.window = sandbox;
  const vm = require("vm");
  vm.createContext(sandbox);
  vm.runInContext(back, sandbox);
  const OLD = sandbox.SchedBridge;
  const wa = waExport([person({ oid: "oid-a1" })], [record("wa-oid-a1", {
    fs: [{ date: "2026-08-15", sortie: "FS4101", seq: 1, kind: "syllabus", instructor: "Airman", grade: 55 }] })], true);
  const p = OLD.parseExport(JSON.stringify(wa));
  const r = OLD.crossCheck(p, { students: [fdmsStudent({ oid: "oid-a1" })], instructors: [fdmsIp({})],
    trainingLog: [ev({ date: "2026-08-15", node: "s:FS4101", result: "score", score: 55, instructor: "ZP-1" })], gates: [] },
    { kindOf: H.kindOf, membersOf: () => [], today: "2026-08-21" });
  const row = r.rows[0];
  ok("at 50 the SAME sortie printed COMPLETE · 55 % vs 50 %", /COMPLETE/.test(row.waVerdict) && /50 %/.test(row.waVerdict), row.waVerdict);
  eq("at 50 it silently COMPLETED the node", row.completes, true);
  eq("at 50 the class was still `agree` — nothing on screen said anything was wrong", row.cls, "agree");
}

module.exports = true;
