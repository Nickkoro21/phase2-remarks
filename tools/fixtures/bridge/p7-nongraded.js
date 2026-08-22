"use strict";
/* PROBE 7 — SLICE 1b's TWO FINDINGS, ASSERTED INSTEAD OF DESCRIBED.
     F1 · the NON-GRADED badge means «this row never completes a node» — so the
          badge and the Effect column may never contradict each other, and
          counts.nonGraded must be derived from the very same flag.
     F2 · F6 · the shred warning must find a carrier — and when there is no row
          to carry it, the report must SAY SO in report.notes instead of reading
          clean. All names fabricated. */
const H = require("./harness.js");
const { B, run, ok, eq, person, record, waExport, fdmsStudent, fdmsIp, ev } = H;

console.log("\n=== PROBE 7a — the SEVEN judge() states, one by one, against isNonGraded() ===");
/* [label, row-as-judge-sees-it, expected source, expected nonGraded, expected completes] */
const STATES = [
  ["a ground lesson — attended, never scorable", { band: "lessons" }, "attended", false, false],
  ["ng: true — nobody was in a position to score it", { band: "flights", ng: true }, "ng", true, false],
  ["a graded PASS", { band: "flights", grade: 75 }, "grade", false, true],
  ["a graded FAIL — graded, so it wears the NUMBER, not the badge", { band: "flights", grade: 40 }, "grade", false, false],
  ["mission complete, no percentage", { band: "flights", mission: "complete" }, "mission", false, true],
  ["mission INCOMPLETE — non-graded by ruling #3", { band: "flights", mission: "incomplete" }, "mission", true, false],
  ["awaiting — the debrief has not landed (ruling #5)", { band: "flights" }, "awaiting", true, false],
];
STATES.forEach(([label, row, src, badge, completes]) => {
  const j = B.judge(row);
  const eff = B.nodeEffect(j);
  eq("7a · " + label + " → source", j.source, src);
  eq("7a · " + label + " → badge", B.isNonGraded(j), badge);
  eq("7a · " + label + " → completes", eff.completes, completes);
});
ok("7a · NOT ONE of the seven both wears the badge and completes the node",
  STATES.every(([, row]) => { const j = B.judge(row); return !(B.isNonGraded(j) && B.nodeEffect(j).completes); }));

console.log("\n=== PROBE 7b — the same invariant over a WHOLE report, not one row at a time ===");
{
  const wa = waExport([person({ oid: "oid-a1" })], [record("wa-oid-a1", {
    flights: [
      { date: "2026-08-01", sortie: "C4302", seq: 1, kind: "syllabus", instructor: "Airman", mission: "complete" },
      { date: "2026-08-02", sortie: "C4303", seq: 1, kind: "syllabus", instructor: "Airman", mission: "incomplete" },
      { date: "2026-08-03", sortie: "C4304", seq: 1, kind: "syllabus", instructor: "Airman", ng: true },
      { date: "2026-08-04", sortie: "C4790", seq: 1, kind: "syllabus", instructor: "Airman" },
      { date: "2026-08-05", sortie: "N4690", seq: 1, kind: "syllabus", instructor: "Airman", grade: 71 },
    ],
    fs: [{ date: "2026-08-06", sortie: "FS4101", seq: 1, kind: "syllabus", instructor: "Airman", grade: 55 }],
    lessons: [{ date: "2026-08-07", group: "GT-AERO-CRM", course: "CRM-1" }],
    exams: [{ date: "2026-08-08", exam: "CO190", trial: 1, grade: 85 }],
  })], true);
  const r = run(wa, { students: [fdmsStudent({ oid: "oid-a1" })], instructors: [fdmsIp({})], trainingLog: [] });
  ok("7b · the report really did produce a spread of rows", r.rows.length >= 7, String(r.rows.length));
  const liars = r.rows.filter((x) => x.nonGraded && x.completes);
  eq("7b · NO row in the report both wears the badge and completes the node", liars.length, 0);
  eq("7b · counts.nonGraded is the badge, counted — never a second opinion",
    r.counts.nonGraded, r.rows.filter((x) => x.nonGraded).length);
  ok("7b · and the badge is NOT simply «unscored»: the mission-complete flight carries no percentage and no badge",
    r.rows.some((x) => x.uid === "s:C4302" && x.nonGraded === false && x.completes === true),
    JSON.stringify(r.rows.filter((x) => x.uid === "s:C4302").map((x) => [x.nonGraded, x.completes])));
  ok("7b · the ground lesson is `attended` and wears no badge",
    r.rows.some((x) => x.group === "lessons" && x.nonGraded === false && x.completes === false));
  ok("7b · the graded pass wears no badge either", r.rows.some((x) => x.uid === "s:N4690" && x.nonGraded === false));
  eq("7b · exactly three rows wear it — incomplete, ng, awaiting", r.counts.nonGraded, 3);
}

console.log("\n=== PROBE 7c — the shred warning must find a CARRIER on every branch ===");
const shred = (live, log) => {
  const stored = {
    flights: [{ date: "2026-08-11", sortie: "C4302", seq: 1, kind: "syllabus", instructor: "Airman", mission: "complete" }],
    airsickness: [{ date: "2026-08-11", instructor: "Airman", flight_code: "C4302" }],
  };
  const wa = waExport([person({ oid: "oid-a1" })], [record("wa-oid-a1", live, stored)], true);
  return run(wa, { students: [fdmsStudent({ oid: "oid-a1" })], instructors: [fdmsIp({})],
    trainingLog: log || [] });
};
const carries = (r) => r.rows.some((x) => x.problems.some((p) => /migrate_record does not name is dropped/.test(p)));
{
  /* paired: WA still has the row AND FDMS has the event */
  const r = shred({ flights: [{ date: "2026-08-11", sortie: "C4302", seq: 1, kind: "syllabus", instructor: "Airman", mission: "complete" }] },
    [ev({ date: "2026-08-11", node: "s:C4302", result: "completed", instructor: "ZP-1" })]);
  ok("7c · PAIRED branch carries the warning", carries(r), JSON.stringify(r.rows.map((x) => x.problems)));
  eq("7c · and no note is needed — a row spoke for it", r.notes.length, 0);
}
{
  /* wa_only: WA has the row, FDMS has nothing */
  const r = shred({ flights: [{ date: "2026-08-11", sortie: "C4302", seq: 1, kind: "syllabus", instructor: "Airman", mission: "complete" }] }, []);
  ok("7c · WA-ONLY branch carries the warning", carries(r), JSON.stringify(r.rows.map((x) => x.problems)));
  eq("7c · and no note is needed", r.notes.length, 0);
}
{
  /* fdms_only: the section was shredded away, FDMS still has the event — the
     headline case of finding F2, where the warning used to be dropped */
  const r = shred({ flights: [] }, [ev({ date: "2026-08-11", node: "s:C4302", result: "completed", instructor: "ZP-1" })]);
  ok("7c · FDMS-ONLY branch carries the warning (the F2 headline)", carries(r), JSON.stringify(r.rows.map((x) => x.problems)));
  eq("7c · the row is fdms_only", r.rows.filter((x) => x.uid === "s:C4302")[0].cls, "fdms_only");
  eq("7c · and no note is needed — that row spoke for it", r.notes.length, 0);
}

console.log("\n=== PROBE 7d — F6: a warning with NO row to travel on becomes a NOTE ===");
{
  const r = shred({ flights: [] }, []);      // shredded on one side, empty on the other
  eq("7d · the table is silent — no row at all for this record", r.rows.length, 0);
  eq("7d · so report.notes speaks EXACTLY ONCE", r.notes.length, 1);
  ok("7d · the note carries the shred warning itself",
    r.notes[0].problems.some((p) => /migrate_record does not name is dropped/.test(p)), JSON.stringify(r.notes[0].problems));
  ok("7d · and says why an empty table is not a clean one",
    /SILENT|not the same thing as clean/.test(r.notes[0].why), r.notes[0].why);
  ok("7d · the note names the person it is about, never a bare warning",
    !!r.notes[0].oid && r.notes[0].kind === "record", JSON.stringify({ oid: r.notes[0].oid, kind: r.notes[0].kind }));
}
{
  /* and NOT twice: a carried warning must not also become a note */
  const r = shred({ flights: [] }, [ev({ date: "2026-08-11", node: "s:C4302", result: "completed", instructor: "ZP-1" })]);
  eq("7d · a warning a row DID carry produces NO second note", r.notes.length, 0);
}
{
  /* a clean record produces neither */
  const wa = waExport([person({ oid: "oid-a1" })], [record("wa-oid-a1", { flights: [] })], true);
  const r = run(wa, { students: [fdmsStudent({ oid: "oid-a1" })], instructors: [fdmsIp({})], trainingLog: [] });
  eq("7d · a record that was never shredded produces no note", r.notes.length, 0);
}

module.exports = true;
