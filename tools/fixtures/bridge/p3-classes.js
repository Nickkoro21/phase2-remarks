"use strict";
/* PROBE 3 — force EACH documented deviation class and count it 1:1.
   PROBE 4 — the three thresholds, both sides of each boundary. */
const H = require("./harness.js");
const { B, run, ok, eq, person, record, waExport, fdmsStudent, fdmsIp, ev } = H;

const seen = {};
function note(cls, where, n) { seen[cls] = (seen[cls] || 0) + n; console.log("        [" + cls + "] +" + n + "  (" + where + ")"); }

console.log("\n=== PROBE 3 — the nine classes, one at a time ===");

/* 1 · agree */
{
  const wa = waExport([person({ oid: "oid-a1" })], [record("wa-oid-a1", {
    flights: [{ date: "2026-08-01", sortie: "C4302", seq: 1, kind: "syllabus", instructor: "Airman", mission: "complete" }] })], true);
  const r = run(wa, { students: [fdmsStudent({ oid: "oid-a1" })], instructors: [fdmsIp({})],
    trainingLog: [ev({ date: "2026-08-01", node: "s:C4302", result: "completed", instructor: "ZP-1" })] });
  const c = r.rows.filter((x) => x.uid === "s:C4302");
  eq("1 · agree — one row, class agree", c.length && c[0].cls, "agree");
  eq("1 · agree — nothing else in the report", r.counts.total, 1);
  note("agree", "flight both sides say complete", 1);
}
/* 2 · wa_only */
{
  const wa = waExport([person({ oid: "oid-a1" })], [record("wa-oid-a1", {
    flights: [{ date: "2026-08-02", sortie: "C4302", seq: 1, kind: "syllabus", instructor: "Airman", mission: "complete" }] })], true);
  const r = run(wa, { students: [fdmsStudent({ oid: "oid-a1" })], instructors: [fdmsIp({})], trainingLog: [] });
  eq("2 · wa_only — exactly one", r.counts.byClass.wa_only, 1);
  eq("2 · wa_only — and nothing else", r.counts.total, 1);
  note("wa_only", "WA has the flight, FDMS does not", 1);
}
/* 3 · fdms_only */
{
  const wa = waExport([person({ oid: "oid-a1" })], [record("wa-oid-a1", { flights: [] })], true);
  const r = run(wa, { students: [fdmsStudent({ oid: "oid-a1" })], instructors: [fdmsIp({})],
    trainingLog: [ev({ id: "EV-9001", date: "2026-08-03", node: "s:C4302", result: "completed", instructor: "ZP-1" })] });
  eq("3 · fdms_only — exactly one", r.counts.byClass.fdms_only, 1);
  eq("3 · fdms_only — and nothing else", r.counts.total, 1);
  note("fdms_only", "FDMS has the event, WA does not", 1);
}
/* 4 · payload_differs */
{
  const wa = waExport([person({ oid: "oid-a1" })], [record("wa-oid-a1", {
    flights: [{ date: "2026-08-04", sortie: "C4302", seq: 1, kind: "syllabus", instructor: "Airman", mission: "complete" }] })], true);
  const r = run(wa, { students: [fdmsStudent({ oid: "oid-a1" })], instructors: [fdmsIp({})],
    trainingLog: [ev({ date: "2026-08-04", node: "s:C4302", result: "fail", instructor: "ZP-1" })] });
  eq("4 · payload_differs — exactly one", r.counts.byClass.payload_differs, 1);
  const row = r.rows[0];
  ok("4 · payload_differs — the verdict diff names both sides",
    row.diffs.some((d) => d.field === "verdict" && /COMPLETE/.test(d.wa) && /INCOMPLETE/.test(d.fdms)), JSON.stringify(row.diffs));
  note("payload_differs", "same date, opposite verdict", 1);
}
/* 5 · unresolvable — surname shared by two ACTIVE instructors */
{
  const wa = waExport([person({ oid: "oid-a1" })], [record("wa-oid-a1", {
    flights: [{ date: "2026-08-05", sortie: "C4302", seq: 1, kind: "syllabus", instructor: "Twinsen", mission: "complete" }] })], true);
  const r = run(wa, { students: [fdmsStudent({ oid: "oid-a1" })],
    instructors: [fdmsIp({ oid: "oid-ip-t1", code: "ZP-7", last_name: "Twinsen", first_name: "Ann" }),
                  fdmsIp({ oid: "oid-ip-t2", code: "ZP-8", last_name: "Twinsen", first_name: "Bob" })],
    trainingLog: [ev({ date: "2026-08-05", node: "s:C4302", result: "completed", instructor: "ZP-7" })] });
  eq("5 · unresolvable — exactly one", r.counts.byClass.unresolvable, 1);
  ok("5 · unresolvable — the rule is written on the row",
    /never guessed by name|ruling #4/.test(JSON.stringify(r.rows[0].diffs)), JSON.stringify(r.rows[0].diffs));
  note("unresolvable", "surname shared by two active IPs — never guessed", 1);
}
/* 5b · unresolvable — a person with no OID and no MN FDMS knows */
{
  const wa = waExport([person({ oid: "", external_oid: null, mn: "", id: "wa-ghost", last_name: "Unknown" })],
    [record("wa-ghost", { flights: [{ date: "2026-08-05", sortie: "C4302", seq: 1, kind: "syllabus", instructor: "Airman", mission: "complete" }] })], true);
  const r = run(wa, { students: [fdmsStudent({ oid: "oid-a1" })], instructors: [fdmsIp({})], trainingLog: [] });
  eq("5b · unresolvable identity — exactly one row", r.counts.byClass.unresolvable, 1);
  ok("5b · the row counts the uncompared rows behind it", /1 Wings Ahead row/.test(r.rows[0].extra), r.rows[0].extra);
  eq("5b · zero persons compared", r.persons.length, 0);
}
/* 6 · refused — an off-catalogue FCF */
{
  const wa = waExport([person({ oid: "oid-a1" })], [record("wa-oid-a1", {
    flights: [{ date: "2026-08-06", sortie: "C4302", seq: 1, kind: "fcf", instructor: "Airman", mission: "complete" }] })], true);
  const r = run(wa, { students: [fdmsStudent({ oid: "oid-a1" })], instructors: [fdmsIp({})], trainingLog: [] });
  eq("6 · refused — exactly one", r.counts.byClass.refused, 1);
  ok("6 · refused — the RULE is printed beside it", /off-catalogue by nature/.test(r.rows[0].refused), r.rows[0].refused);
  note("refused", "an FCF has no node in the graph", 1);
}
/* 6b · refused — a checkride typed into the flight table */
{
  const wa = waExport([person({ oid: "oid-a1" })], [record("wa-oid-a1", {
    flights: [{ date: "2026-08-06", sortie: "C4590", seq: 1, kind: "syllabus", instructor: "Airman", grade: 85 }] })], true);
  const r = run(wa, { students: [fdmsStudent({ oid: "oid-a1" })], instructors: [fdmsIp({})], trainingLog: [] });
  eq("6b · refused — the checkride-in-the-flight-table", r.counts.byClass.refused, 1);
  ok("6b · the rule names the Evaluations section", /Evaluations section/.test(r.rows[0].refused), r.rows[0].refused);
}
/* 7 · source_moved — covered exhaustively in probe 2; counted here */
{
  const wa = waExport([person({ oid: "oid-a1" })], [record("wa-oid-a1", {
    flights: [{ date: "2026-08-08", sortie: "C4302", seq: 1, kind: "syllabus", instructor: "Airman", mission: "complete" }] })], true);
  const r = run(wa, { students: [fdmsStudent({ oid: "oid-a1" })], instructors: [fdmsIp({})],
    trainingLog: [ev({ date: "2026-08-07", node: "s:C4302", result: "completed", instructor: "ZP-1" })] });
  eq("7 · source_moved — exactly one", r.counts.byClass.source_moved, 1);
  eq("7 · source_moved — and NOTHING else", r.counts.total, 1);
  note("source_moved", "one-day correction", 1);
}
/* 8 · deleted — a bridge-written FDMS event whose WA source vanished */
{
  const wa = waExport([person({ oid: "oid-a1" })], [record("wa-oid-a1", { flights: [] })], true);
  const r = run(wa, { students: [fdmsStudent({ oid: "oid-a1" })], instructors: [fdmsIp({})],
    trainingLog: [ev({ id: "wa:abc-123", date: "2026-08-09", node: "s:C4302", result: "completed", instructor: "ZP-1" })] });
  eq("8 · deleted — exactly one", r.counts.byClass.deleted, 1);
  eq("8 · deleted — NOT counted as fdms_only too", r.counts.byClass.fdms_only, 0);
  ok("8 · the tombstone + change log are demanded (ruling #2)",
    /tombstone/.test(r.rows[0].detail) && /change-log/.test(r.rows[0].detail), r.rows[0].detail);
  note("deleted", "id wa:… with no source left", 1);
}
/* 9 · unwritten — an INACTIVE person's record */
{
  const wa = waExport([person({ oid: "oid-a1", active: false })], [record("wa-oid-a1", {
    flights: [{ date: "2026-08-10", sortie: "C4302", seq: 1, kind: "syllabus", instructor: "Airman", mission: "complete" }] })], true);
  const r = run(wa, { students: [fdmsStudent({ oid: "oid-a1" })], instructors: [fdmsIp({})], trainingLog: [] });
  eq("9a · unwritten — inactive person", r.counts.byClass.unwritten, 1);
  ok("9a · the reason is on the row", /INACTIVE/.test(r.rows[0].problems.join(" ")), r.rows[0].problems.join(" | "));
  note("unwritten", "inactive person", 1);
}
/* 9b · unwritten — a record migrate_record already shore (data_as_stored) */
{
  const wa = waExport([person({ oid: "oid-a1" })], [record("wa-oid-a1",
    { flights: [] },
    { flights: [{ date: "2026-08-11", sortie: "C4302", seq: 1, kind: "syllabus", instructor: "Airman", mission: "complete" }],
      airsickness: [{ date: "2026-08-11", instructor: "Airman", flight_code: "C4302" }] })], true);
  const r = run(wa, { students: [fdmsStudent({ oid: "oid-a1" })], instructors: [fdmsIp({})],
    trainingLog: [ev({ date: "2026-08-11", node: "s:C4302", result: "completed", instructor: "ZP-1" })] });
  ok("9b · the shredding is SEEN through data_as_stored",
    r.rows.some((x) => x.problems.some((p) => /migrate_record does not name is dropped/.test(p))),
    JSON.stringify(r.rows.map((x) => x.problems)));
  /* ROUND 20 — the old expectation («unwritten») never matched and never could:
     WA's live record has no flights at all here, FDMS has the event, so the row
     IS fdms_only. Slice 1b's finding F2 is exactly that the shred warning now
     TRAVELS on that branch — which is what this asserts. `unwritten` is still
     forced twice above (9a inactive person, 9c non-integer grade). */
  eq("9b · the row is fdms_only — WA's live record is empty there",
    r.rows.filter((x) => x.uid === "s:C4302")[0].cls, "fdms_only");
  ok("9b · and the shred warning TRAVELS on the fdms_only branch (slice 1b · F2)",
    r.rows.filter((x) => x.uid === "s:C4302")[0].problems.some((p) => /migrate_record does not name is dropped/.test(p)),
    JSON.stringify(r.rows.filter((x) => x.uid === "s:C4302")[0].problems));
}
/* 9c · unwritten — a non-integer grade */
{
  const wa = waExport([person({ oid: "oid-a1" })], [record("wa-oid-a1", {
    exams: [{ date: "2026-08-12", exam: "CO190", trial: 1, grade: 84.5 }] })], true);
  const r = run(wa, { students: [fdmsStudent({ oid: "oid-a1" })], instructors: [fdmsIp({})], trainingLog: [] });
  eq("9c · unwritten — non-integer grade", r.counts.byClass.unwritten, 1);
  ok("9c · chk_grade named as the reason",
    /not a whole number.*chk_grade/.test(r.rows[0].problems.join(" ")), r.rows[0].problems.join(" | "));
}

console.log("\n  classes forced this run: " + JSON.stringify(seen));
const missing = B.CLASS_IDS.filter((c) => !(c in seen) && ["agree","wa_only","fdms_only","payload_differs","unresolvable","refused","source_moved","deleted","unwritten"].indexOf(c) >= 0 && !(c in seen));
eq("ALL NINE documented classes were forced at least once", B.CLASS_IDS.filter((c) => !(c in seen)).join(",") || "(none missing)", "(none missing)");

console.log("\n=== PROBE 4 — the thresholds, both sides of each line ===");
function gradeCase(label, sec, node, grade, wantVerdict, wantThr) {
  const data = {};
  if (sec === "exams") data.exams = [{ date: "2026-08-13", exam: "CO190", trial: 1, grade: grade }];
  if (sec === "flights") data.flights = [{ date: "2026-08-13", sortie: "C4302", seq: 1, kind: "syllabus", instructor: "Airman", grade: grade }];
  if (sec === "fs") data.fs = [{ date: "2026-08-13", sortie: "FS4101", seq: 1, kind: "syllabus", instructor: "Airman", grade: grade }];
  const wa = waExport([person({ oid: "oid-a1" })], [record("wa-oid-a1", data)], true);
  const r = run(wa, { students: [fdmsStudent({ oid: "oid-a1" })], instructors: [fdmsIp({})], trainingLog: [] });
  const row = r.rows[0];
  ok(label + " → " + wantVerdict + " (thr " + wantThr + ")",
    row && row.completes === (wantVerdict === "complete") && row.thr === wantThr && new RegExp(wantThr + " %").test(row.waVerdict),
    row ? row.waVerdict + " completes=" + row.completes + " thr=" + row.thr : "(no row)");
}
gradeCase("exam 79", "exams", "g:CO190", 79, "incomplete", 80);
gradeCase("exam 80", "exams", "g:CO190", 80, "complete", 80);
gradeCase("flight 59", "flights", "s:C4302", 59, "incomplete", 60);
gradeCase("flight 60", "flights", "s:C4302", 60, "complete", 60);
gradeCase("F/S 59", "fs", "s:FS4101", 59, "incomplete", 60);
gradeCase("F/S 60", "fs", "s:FS4101", 60, "complete", 60);
eq("THRESHOLDS are file constants, never config", JSON.stringify(B.THRESHOLDS), JSON.stringify({ exams: 80, flights: 60, fs: 60 }));

console.log("\n=== PROBE 4b — a non-integer FDMS grade appears IN THE REPORT ONLY ===");
{
  const wa = waExport([person({ oid: "oid-a1" })], [record("wa-oid-a1", {
    exams: [{ date: "2026-08-14", exam: "CO190", trial: 1, grade: 84 }] })], true);
  const store = { students: [fdmsStudent({ oid: "oid-a1" })], instructors: [fdmsIp({})],
    trainingLog: [ev({ date: "2026-08-14", node: "g:CO190", result: "score", score: 84.5, instructor: "ZP-1" })] };
  const before = JSON.stringify(store);
  const r = run(wa, store);
  const row = r.rows[0];
  ok("the non-integer grade is FLAGGED in the report", row.nonInteger === true, String(row.nonInteger));
  eq("the report's non-integer counter sees it", r.counts.nonInteger, 1);
  ok("the FDMS verdict prints the fractional number", /84\.5/.test(row.fdmsVerdict), row.fdmsVerdict);
  eq("THE STORE OBJECT IS BYTE-IDENTICAL AFTER THE CROSS-CHECK", JSON.stringify(store), before);
  const dump = JSON.stringify(r);
  ok("84.5 exists in the REPORT (report-only, by design)", dump.indexOf("84.5") >= 0);
}

module.exports = true;
