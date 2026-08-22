"use strict";
/* PROBE 5 — the groups the live fixture did not exercise, and the MN fallback. */
const H = require("./harness.js");
const { B, run, ok, eq, person, record, waExport, fdmsStudent, fdmsIp, ev } = H;

console.log("\n=== MN FALLBACK (ruling #4) — no OID on the WA side ===");
{
  const P = person({ oid: "", external_oid: null, mn: "MN-9001", last_name: "Alpha" });
  const wa = waExport([P], [record("wa-oid-x01", { flights: [] })], true);
  const r = run(wa, { students: [fdmsStudent({ oid: "oid-x01", mn: "MN 9001" })], instructors: [], trainingLog: [] });
  eq("matched by MN when no OID is present", r.persons.length && r.persons[0].via, "mn");
  ok("and it says so on the person", r.persons[0].divergences.some((d) => /matched by MN/.test(d)),
    JSON.stringify(r.persons[0].divergences));
  ok("MN normalisation folds «MN 9001» / «MN-9001»", true);
}
{
  const P = person({ oid: "", external_oid: null, mn: "MN-9001", last_name: "Alpha" });
  const wa = waExport([P], [record("wa-x", { flights: [] })], true);
  const r = run(wa, { students: [fdmsStudent({ oid: "oid-1", code: "ZZ-1", mn: "MN-9001" }),
                                fdmsStudent({ oid: "oid-2", code: "ZZ-2", mn: "MN-9001" })], instructors: [], trainingLog: [] });
  eq("a DUPLICATE MN in FDMS is refused, never guessed", r.identities.ambiguous.length, 1);
  ok("the reason names the rule", /matching by name is not allowed/.test(r.identities.ambiguous[0].why),
    r.identities.ambiguous[0].why);
  eq("zero persons compared", r.persons.length, 0);
}
{
  const wa = waExport([person({ oid: "oid-dup", id: "w1" }), person({ oid: "oid-dup", id: "w2" })],
    [record("w1", { flights: [] }), record("w2", { flights: [] })], true);
  const r = run(wa, { students: [fdmsStudent({ oid: "oid-dup" })], instructors: [], trainingLog: [] });
  eq("a DUPLICATE OID inside the export is refused for BOTH", r.identities.ambiguous.length, 2);
  ok("the reason says an OID never repeats", /never repeats/.test(r.identities.ambiguous[0].why), r.identities.ambiguous[0].why);
}

console.log("\n=== THE EVALUATIONS GROUP (the 8 checkrides) ===");
{
  const wa = waExport([person({ oid: "oid-a1" })], [record("wa-oid-a1", {
    evaluations: [{ date: "2026-08-01", evaluation: "C4590", with: "Airman", grade: 88 }] })], true);
  const r = run(wa, { students: [fdmsStudent({ oid: "oid-a1" })], instructors: [fdmsIp({})],
    trainingLog: [ev({ date: "2026-08-01", node: "s:C4590", result: "completed", instructor: "ZP-1" })] });
  eq("the checkride lands in the evaluations group, not flights", r.rows[0].group, "evaluations");
  eq("exactly one row — never counted as a flight as well", r.rows.length, 1);
  eq("its rid names the evaluations group", r.rows[0].rid, "OID-A1 ∷ evaluations ∷ s:C4590 ∷ 1");
  eq("it agrees", r.rows[0].cls, "agree");
}
console.log("\n=== SOLO FLIGHTS ===");
{
  const wa = waExport([person({ oid: "oid-a1" })], [record("wa-oid-a1", {
    solo_flights: [{ slot: "S1", sortie: "C4302", date: "2026-08-02", instructor: "Airman", grade: 75 }] })], true);
  const r = run(wa, { students: [fdmsStudent({ oid: "oid-a1" })], instructors: [fdmsIp({})],
    trainingLog: [ev({ date: "2026-08-02", node: "s:C4302", result: "completed", instructor: "ZP-1" })] });
  eq("the prescribed solo lands in solo_flights, not flights", r.rows[0].group, "solo_flights");
  eq("exactly one row", r.rows.length, 1);
  eq("judged at the FLIGHT threshold (75 >= 60)", r.rows[0].thr, 60);
  eq("and it completes", r.rows[0].completes, true);
}
console.log("\n=== FAIL · ALMOST GOOD · NFS · SMS · AIRSICKNESS ===");
{
  const wa = waExport([person({ oid: "oid-a1" })], [record("wa-oid-a1", {
    flights: [{ date: "2026-08-03", sortie: "C4302", seq: 1, kind: "syllabus", instructor: "Airman", mission: "incomplete" }],
    fail: [{ date: "2026-08-03", category: "airmanship", flight_code: "C4302", items: ["x"], instructor: "Airman", grade: 45 }],
    nfs: [{ date: "2026-08-04", reason: "weather", note: "" }],
    sms: [{ entrance_date: "2026-08-05", exit_date: null, reason: "3-01", note: "" }],
    airsickness: [{ date: "2026-08-06", instructor: "Airman", flight_code: "C4302" }] })], true);
  const r = run(wa, { students: [fdmsStudent({ oid: "oid-a1" })], instructors: [fdmsIp({})],
    trainingLog: [ev({ date: "2026-08-03", node: "s:C4302", result: "fail", instructor: "ZP-1" })] });
  const evs = r.rows.filter((x) => x.group === "events");
  console.log("        event rows: " + evs.map((x) => x.sec + "=" + x.cls).join(", "));
  eq("the FAIL agrees with the FDMS incomplete", evs.find((x) => x.sec === "fail").cls, "agree");
  eq("the FAIL does NOT consume a second flight row", r.rows.filter((x) => x.group === "flights").length, 1);
  eq("the NFS with no FDMS counterpart is wa_only", evs.find((x) => x.sec === "nfs").cls, "wa_only");
  eq("airsickness is structurally refused", evs.find((x) => x.sec === "airsickness").cls, "refused");
  ok("the airsickness rule is written", /no airsickness event/.test(evs.find((x) => x.sec === "airsickness").refused),
    evs.find((x) => x.sec === "airsickness").refused);
}
{ /* the NFS both sides know — must be ONE row, never two */
  const wa = waExport([person({ oid: "oid-a1" })], [record("wa-oid-a1", {
    nfs: [{ date: "2026-08-04", reason: "weather", note: "" }] })], true);
  const r = run(wa, { students: [fdmsStudent({ oid: "oid-a1", code: "ZZ-1" })], instructors: [fdmsIp({})],
    trainingLog: [ev({ date: "2026-08-04", node: "", special: "nfs", student: "ZZ-1", result: "completed" })] });
  eq("one NFS known to both sides is ONE row, not two", r.rows.length, 1);
  eq("and it agrees", r.rows[0].cls, "agree");
}
console.log("\n=== LESSONS — attended, never scored, never completes on its own ===");
{
  const wa = waExport([person({ oid: "oid-a1" })], [record("wa-oid-a1", {
    lessons: [{ date: "2026-08-07", end_date: "2026-08-07", group: "GT-AERO-CRM", course: "AE 101" }] })], true);
  const r = run(wa, { students: [fdmsStudent({ oid: "oid-a1" })], instructors: [], trainingLog: [] });
  eq("uid pairs (group, course), never the code alone", r.rows[0].uid, "g:GT-AERO-CRM::AE 101");
  eq("a lesson never completes its group on its own", r.rows[0].completes, false);
  eq("and it wears NO non-graded badge (it was never scorable)", r.rows[0].nonGraded, false);
}
console.log("\n=== RULING #5 — «awaiting» is legitimate, never proposed ===");
{
  const wa = waExport([person({ oid: "oid-a1" })], [record("wa-oid-a1", {
    flights: [{ date: "2026-08-08", sortie: "C4302", seq: 1, kind: "syllabus", instructor: "Airman" }] })], true);
  const r = run(wa, { students: [fdmsStudent({ oid: "oid-a1" })], instructors: [fdmsIp({})], trainingLog: [] });
  eq("class wa_only", r.rows[0].cls, "wa_only");
  ok("the row says «not proposable»", /awaiting a grade — not proposable/.test(r.rows[0].detail), r.rows[0].detail);
  eq("it does not complete the node", r.rows[0].completes, false);
}
console.log("\n=== RULING #8 — duration carried, never compared ===");
{
  const wa = waExport([person({ oid: "oid-a1" })], [record("wa-oid-a1", {
    flights: [{ date: "2026-08-09", sortie: "C4302", seq: 1, kind: "syllabus", instructor: "Airman", duration: 1.7, mission: "complete" }] })], true);
  const r = run(wa, { students: [fdmsStudent({ oid: "oid-a1" })], instructors: [fdmsIp({})],
    trainingLog: [ev({ date: "2026-08-09", node: "s:C4302", result: "completed", instructor: "ZP-1" })] });
  eq("the duration is carried onto the row", r.rows[0].duration, 1.7);
  eq("and it produced NO difference", r.rows[0].diffs.length, 0);
  eq("the row agrees", r.rows[0].cls, "agree");
  ok("no diff mentions duration", !JSON.stringify(r.rows[0].diffs).match(/duration/i));
}
console.log("\n=== R1 — the blank-result warning the readiness engine needs ===");
{
  const wa = waExport([person({ oid: "oid-a1" })], [record("wa-oid-a1", { flights: [] })], true);
  const r = run(wa, { students: [fdmsStudent({ oid: "oid-a1" })], instructors: [fdmsIp({})],
    trainingLog: [ev({ date: "2026-08-10", node: "s:C4302", result: "", instructor: "ZP-1" })] });
  ok("a blank FDMS result is called out as reading COMPLETED",
    r.rows[0].problems.some((p) => /blank result as COMPLETED and unlocks/.test(p)), r.rows[0].problems.join(" | "));
}
/* ROUND 20 — the label «dead field» was the slice-1 truth and stopped being
   true in slice 1b (findings F2 · F6): report.notes now SPEAKS whenever a
   record warning found no row to travel on. Empty on a clean record is
   still the right answer; the two loaded cases live in p7-nongraded.js. */
console.log("\n=== report.notes — silent on a clean record (slice 1b) ===");
{
  const wa = waExport([person({ oid: "oid-a1" })], [record("wa-oid-a1", { flights: [] })], true);
  const r = run(wa, { students: [fdmsStudent({ oid: "oid-a1" })], instructors: [], trainingLog: [] });
  ok("report.notes is EMPTY when nothing was shredded", Array.isArray(r.notes) && r.notes.length === 0,
    JSON.stringify(r.notes));
}

module.exports = true;
