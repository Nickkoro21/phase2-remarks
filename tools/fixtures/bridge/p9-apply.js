"use strict";
/* PROBE 9 — PHASE 3: THE CONFIRMED FILL (26/08/2026).
   The report stopped being read-only in ONE direction: a line the developer
   confirms becomes an FDMS training-log event. What has to be proved here is
   not that a write happens — it is that it can happen only ONCE, that a change
   at source is SEEN afterwards, and that a row FDMS cannot express honestly is
   never written at all.

   These fixtures drive the PLAN and the very RECORD the store would get
   (SchedBridge.plannedEvent), never the store itself: § ② of schedbridge.js is
   the only caller of SchedStore, and it is reached only from a [data-brgw]
   control past the edit lock. All names fabricated. */
const fs = require("fs");
const path = require("path");
const H = require("./harness.js");
const { B, run, ok, eq, person, record, waExport, fdmsStudent, fdmsIp, ev } = H;

const DAY = "2026-08-26";
const flightWa = (o) => waExport([person({ oid: "oid-a1", last_name: "Alpha" })], [record("wa-oid-a1", {
  flights: [Object.assign({ date: "2026-08-12", sortie: "C4302", seq: 1, kind: "syllabus",
    instructor: "Airman", duration: 1.3 }, o)],
})], true);
const base = (log) => ({ students: [fdmsStudent({ oid: "oid-a1", last_name: "Alpha" })],
  instructors: [fdmsIp({})], trainingLog: log || [] });
const only = (r, uid) => r.rows.filter((x) => x.uid === (uid || "s:C4302"));

console.log("\n=== PROBE 9a — a wa_only flight: the plan, before anything is written ===");
{
  const r = run(flightWa({ grade: 78 }), base());
  const row = only(r)[0];
  eq("the class is wa_only", row.cls, "wa_only");
  ok("the row carries an apply plan", !!row.plan, JSON.stringify(row.plan));
  eq("the plan may be applied", row.plan.can, true);
  eq("the act is CREATE", row.plan.act, "create");
  eq("the FDMS result word is «completed» (78 ≥ 60)", row.plan.result, "completed");
  eq("and it COMPLETES the node — said before the confirm, not after", row.plan.completes, true);
  eq("the instructor was resolved to an FDMS CODE, never a name", row.plan.ip, "ZP-1");
  eq("the device is derived from the band", row.plan.device, "T-6A");
  eq("the report counts exactly one appliable line", r.counts.appliable, 1);
  ok("the plan's effect sentence names what the node does",
    /COMPLETES the node/.test(row.plan.effect), row.plan.effect);
}

console.log("\n=== PROBE 9b — the record the store would get ===");
{
  const r = run(flightWa({ grade: 78 }), base());
  const rec = B.plannedEvent(only(r)[0].plan, null, DAY);
  eq("the id is the deterministic wa: handle", rec.id, "wa:OID-A1:flights:s:C4302:1");
  ok("THE DATE IS NOT IN THE ID", !/2026-08/.test(rec.id), rec.id);
  eq("origin marks it as the bridge's", rec.origin, "wa");
  eq("the bridge block carries the row identity verbatim", rec.bridge.rid, "OID-A1 ∷ flights ∷ s:C4302 ∷ 1");
  eq("and the seq of the Wings Ahead row (ruling #1)", rec.bridge.seq, 1);
  eq("and WHAT WINGS AHEAD SAID — the grade", rec.bridge.src.grade, 78);
  eq("with the threshold it was judged by, frozen (ruling #6)", rec.bridge.src.thr, 60);
  eq("the node is the syllabus uid", rec.node, "s:C4302");
  eq("the scope is student — anything else is invisible to Progress", rec.scope, "student");
  eq("the student is named by CODE (ruling #4 — codes are what the log stores)", rec.student, "ZZ-1");
  eq("the date is the Wings Ahead date", rec.date, "2026-08-12");
  eq("the instructor is the FDMS code", rec.instructor, "ZP-1");
  eq("R2 — a sortie is NEVER stored as a score", rec.score, null);
  ok("R2 — and its result is a word, not a number", rec.result === "completed", rec.result);
  eq("maneuvers is written EMPTY, because upsert MERGES", rec.maneuvers, "");
  eq("absent is written empty on a student-scope row", JSON.stringify(rec.absent), "[]");
  ok("the note says where it came from", /^from Wings Ahead · bridge /.test(rec.note), rec.note);
  ok("and carries nothing that could go stale — no grade, no verdict",
    !/\d+ ?%/.test(rec.note) && !/COMPLETE/i.test(rec.note), rec.note);
  eq("no start/end date on a flight", rec.start_date + "|" + rec.end_date, "|");
}

console.log("\n=== PROBE 9c — RE-LOADING THE SAME EXPORT: agree, and never a second event ===");
{
  const r1 = run(flightWa({ grade: 78 }), base());
  const rec = B.plannedEvent(only(r1)[0].plan, null, DAY);
  const r2 = run(flightWa({ grade: 78 }), base([rec]));
  const rows = only(r2);
  eq("still exactly ONE row for the flight — no duplicate", rows.length, 1);
  eq("and it now reads `agree`", rows[0].cls, "agree");
  eq("an agree row offers no apply plan at all", rows[0].plan, null);
  eq("nothing in the report is appliable any more", r2.counts.appliable, 0);
  eq("no wa_only survived", r2.counts.byClass.wa_only, 0);
  eq("no fdms_only was invented", r2.counts.byClass.fdms_only, 0);
  eq("the FDMS event is recognised as the bridge's", B.isWaWritten(rec), true);
  /* the second belt: even a second apply of the SAME line lands on the same id */
  eq("the handle is deterministic", B.plannedEvent(only(r1)[0].plan, null, DAY).id, rec.id);
}

console.log("\n=== PROBE 9d — THE STUDENT CHANGES THE ROW: payload_differs against the bridge's own event ===");
{
  const r1 = run(flightWa({ grade: 78 }), base());
  const rec = B.plannedEvent(only(r1)[0].plan, null, DAY);
  /* 84 and 78 are BOTH passes — same verdict, same date, same instructor. Before
     the bridge remembered its source grade this was perfect silence. */
  const r2 = run(flightWa({ grade: 84 }), base([rec]));
  const row = only(r2)[0];
  eq("the class is payload_differs", row.cls, "payload_differs");
  const d = row.diffs.find((x) => x.field === "grade (Wings Ahead)");
  ok("the difference names both numbers", !!d && d.wa === "84" && d.fdms === "78", JSON.stringify(row.diffs));
  eq("the row may be applied as an ADOPTION", row.plan.act, "adopt");
  eq("and it can be", row.plan.can, true);
  const f = row.plan.fields.map((x) => x.field).join(",");
  eq("it adopts the source grade and nothing else — the verdict did not move", f, "bridge.src.grade");
  eq("the node effect is unchanged", row.plan.completes, true);
}

console.log("\n=== PROBE 9e — the change that DOES move the verdict ===");
{
  const r1 = run(flightWa({ grade: 78 }), base());
  const rec = B.plannedEvent(only(r1)[0].plan, null, DAY);
  const r2 = run(flightWa({ grade: 45 }), base([rec]));
  const row = only(r2)[0];
  eq("payload_differs", row.cls, "payload_differs");
  ok("the verdict itself is a difference", row.diffs.some((x) => x.field === "verdict"), JSON.stringify(row.diffs));
  eq("the adoption writes the new result", row.plan.fields.find((x) => x.field === "result").to, "fail");
  eq("45 is ΑΠΟΤΥΧΙΑ, below the printed scale's 50 floor", B.LAG_FLOOR, 50);
  eq("and the node stops being complete", row.plan.completes, false);
  ok("the dialog would say so before the confirm", /does NOT complete/.test(row.plan.effect), row.plan.effect);
}

console.log("\n=== PROBE 9e2 — ONLY WHAT WAS ADOPTED MOVES ===");
{
  /* Adopting the instructor must not quietly re-stamp the remembered grade —
     that would erase, without a word, the difference the developer did NOT
     adopt, and the next report would read clean over a live divergence. */
  const r1 = run(flightWa({ grade: 78 }), base());
  const rec = B.plannedEvent(only(r1)[0].plan, null, DAY);
  const two = {
    students: [fdmsStudent({ oid: "oid-a1", last_name: "Alpha" })],
    instructors: [fdmsIp({}), fdmsIp({ oid: "oid-ip-x2", code: "ZP-2", last_name: "Ghostly" })],
    trainingLog: [rec],
  };
  const r2 = run(flightWa({ grade: 84, instructor: "Ghostly" }), two);
  const row = only(r2)[0];
  eq("both differences are on the row", row.diffs.length >= 2, true);
  const p = row.plan;
  eq("the whole-row plan writes both, provenance included",
    p.fields.map((f) => f.field).sort().join(","),
    "bridge.src.grade,bridge.src.instructor,instructor");
  eq("the instructor difference is adoptable on its own",
    B.ADOPTABLE.indexOf("instructor") >= 0, true);
  /* THE PROVENANCE REFRESH RIDES INSIDE `fields`, NEVER BESIDE IT — that is what
     makes ↺ Undo able to revert it. A refresh travelling on the side would be a
     write the audit trail could not take back. */
  ok("every provenance key the act touches is IN the field list",
    p.fields.filter((f) => /^bridge\.src\./.test(f.field)).length === 2, JSON.stringify(p.fields));
  ok("and each one carries both the before and the after",
    p.fields.every((f) => "from" in f && "to" in f), JSON.stringify(p.fields));
  const g = p.fields.find((f) => f.field === "bridge.src.grade");
  eq("the remembered grade moves 78 → 84", g.from + ">" + g.to, "78>84");
  ok("the row's fields never name a field the report does not show",
    p.fields.every((f) => ["result", "maneuvers", "instructor"].indexOf(f.field) >= 0
      || /^bridge\.src\./.test(f.field)), JSON.stringify(p.fields));
}

console.log("\n=== PROBE 9f — UNDO: the event goes, the row comes back ===");
{
  const r1 = run(flightWa({ grade: 78 }), base());
  const rec = B.plannedEvent(only(r1)[0].plan, null, DAY);
  eq("with the event, the line is agree", only(run(flightWa({ grade: 78 }), base([rec])))[0].cls, "agree");
  /* undo removes exactly that event — which is what SchedStore.remove does */
  const after = run(flightWa({ grade: 78 }), base([]));
  eq("without it, the line is wa_only again", only(after)[0].cls, "wa_only");
  eq("and appliable again", only(after)[0].plan.can, true);
  eq("no orphan is left behind", after.counts.byClass.deleted + after.counts.byClass.fdms_only, 0);
}

console.log("\n=== PROBE 9g — SOURCE MOVED: one date, moved; never a delete plus an add ===");
{
  const r1 = run(flightWa({ grade: 78 }), base());
  const rec = B.plannedEvent(only(r1)[0].plan, null, DAY);
  const r2 = run(flightWa({ grade: 78, date: "2026-08-13" }), base([rec]));
  const rows = only(r2);
  eq("ONE row, not two", rows.length, 1);
  eq("class source_moved", rows[0].cls, "source_moved");
  eq("the act is an UPDATE", rows[0].plan.act, "update");
  /* the event's date, and the ONE provenance key that belongs to it — both in
     `fields`, so ↺ Undo puts the pair back together */
  eq("it names the date and its provenance twin, nothing else",
    rows[0].plan.fields.map((f) => f.field).join(","), "date,bridge.src.date");
  eq("from the stored one", rows[0].plan.fields[0].from, "2026-08-12");
  eq("to the Wings Ahead one", rows[0].plan.fields[0].to, "2026-08-13");
  ok("and the remembered grade is NOT touched by a date move",
    !rows[0].plan.fields.some((f) => /grade/.test(f.field)),
    JSON.stringify(rows[0].plan.fields));
  ok("and it says the node effect does not move", /does not change/.test(rows[0].plan.effect), rows[0].plan.effect);
}

console.log("\n=== PROBE 9h — RULING #3: an incomplete mission is stored so it NEVER completes ===");
{
  const r = run(flightWa({ mission: "incomplete" }), base());
  const row = only(r)[0];
  eq("it IS appliable — FDMS has a word for it", row.plan.can, true);
  eq("and the word is «lag» (ΥΣΤΕΡΗΣΗ)", row.plan.result, "lag");
  eq("which does not complete the node", row.plan.completes, false);
  const rec = B.plannedEvent(row.plan, null, DAY);
  eq("the stored result is that word", rec.result, "lag");
  eq("and no number rides with it", rec.score, null);
  /* THE MECHANICAL TIE — the claim «lag does not complete» is a claim about
     app/scheduler.js, so it is read there rather than asserted from memory. */
  const sched = fs.readFileSync(path.resolve(__dirname, "..", "..", "..", "app", "scheduler.js"), "utf8");
  ok("scheduler.js reads lag/fail/repeat as «repeat» — the node stays owed",
    /ev\.result === "repeat" \|\| ev\.result === "lag" \|\| ev\.result === "fail"\) status = "repeat"/.test(sched));
  ok("and anything else falls through to «completed» (R1) — which is why «awaiting» is never written",
    /else status = "completed";/.test(sched));
  ok("the written word is one of the three the engine leaves owed",
    ["lag", "fail", "repeat"].indexOf(rec.result) >= 0, rec.result);
  /* and the report agrees with itself: re-read, the row is agree and still owed */
  const back = only(run(flightWa({ mission: "incomplete" }), base([rec])))[0];
  eq("re-loaded, the same row is agree", back.cls, "agree");
  eq("and the node is still not completed", back.completes, false);
  eq("and it still wears the NON-GRADED badge (ruling #3)", back.nonGraded, true);
}

console.log("\n=== PROBE 9i — the three rows FDMS cannot hold honestly are never written ===");
{
  const ng = only(run(flightWa({ ng: true }), base()))[0];
  eq("an NG row is wa_only", ng.cls, "wa_only");
  eq("and not appliable", ng.plan.can, false);
  ok("the reason names what FDMS lacks", /no word for/.test(ng.plan.why), ng.plan.why);
  ok("and it names the rulings", /#3|#5/.test(ng.plan.why), ng.plan.why);

  const aw = only(run(flightWa({}), base()))[0];
  eq("an awaiting row is wa_only", aw.cls, "wa_only");
  eq("and not appliable", aw.plan.can, false);
  ok("the reason is R1 — a blank result reads as COMPLETED", /COMPLETED/.test(aw.plan.why), aw.plan.why);

  const ni = only(run(flightWa({ grade: 78.5 }), base()))[0];
  eq("a non-integer grade is class `unwritten`", ni.cls, "unwritten");
  eq("and carries no plan at all", ni.plan, null);
  eq("the writer refuses a non-integer outright", B.resultOf({ source: "grade", grade: 78.5, nonInt: true, thr: 60 }), "");
}

console.log("\n=== PROBE 9j — the printed scale decides the WORD, the threshold decides the VERDICT ===");
{
  const at = (g) => B.resultOf({ source: "grade", grade: g, nonInt: false, thr: 60 });
  eq("60 → completed", at(60), "completed");
  eq("59 → lag", at(59), "lag");
  eq("50 → lag", at(50), "lag");
  eq("49 → fail", at(49), "fail");
  eq("0 → fail", at(0), "fail");
  eq("mission complete → completed", B.resultOf({ source: "mission", verdict: "complete" }), "completed");
  eq("mission incomplete → lag", B.resultOf({ source: "mission", verdict: "incomplete" }), "lag");
  eq("ng → nothing", B.resultOf({ source: "ng" }), "");
  eq("awaiting → nothing", B.resultOf({ source: "awaiting" }), "");
  eq("attended → nothing", B.resultOf({ source: "attended" }), "");
}

console.log("\n=== PROBE 9k — the instructor is never guessed from a name (ruling #4) ===");
{
  const unknown = only(run(flightWa({ grade: 78, instructor: "Nosuch" }), base()))[0];
  eq("an unknown surname makes the row unappliable", unknown.plan.can, false);
  ok("and says why", /never written with an identity guessed/.test(unknown.plan.why), unknown.plan.why);

  const two = run(flightWa({ grade: 78 }), {
    students: [fdmsStudent({ oid: "oid-a1" })],
    instructors: [fdmsIp({}), fdmsIp({ oid: "oid-ip-x2", code: "ZP-2", first_name: "Notional" })],
    trainingLog: [],
  });
  const amb = only(two)[0];
  eq("a surname worn by two active instructors is unappliable", amb.plan.can, false);
  ok("and the reason counts them", /matches 2 active/.test(amb.plan.why), amb.plan.why);
}

console.log("\n=== PROBE 9l — the groups this fill deliberately does not write ===");
{
  /* P46-A1 (05/09/2026) — the scope grew by the Flight Commander's ruling
     («checkrides and solos become appliable; FAIL / NFS / SMS / airsickness stay
     report-only»), and what stayed OUT is what this probe is now about. The two
     that came in are driven end to end in p13-evalsolo.js. */
  const scope = B.APPLY_GROUPS.join(",");
  eq("the scope is flights, F/S, the checkrides and the solos", scope,
    "flights,fs,evaluations,solo_flights");
  const wa = waExport([person({ oid: "oid-a1" })], [record("wa-oid-a1", {
    lessons: [{ date: "2026-08-10", group: "GT-AERO-CRM", course: "AE 101" }],
    exams: [{ date: "2026-08-11", exam: "CO190", trial: 1, grade: 88 }],
    airsickness: [{ date: "2026-08-07", instructor: "Airman", flight_code: "C4302" }],
  })], true);
  const r = run(wa, base());
  ["g:GT-AERO-CRM::AE 101", "g:CO190"].forEach((uid) => {
    const row = r.rows.find((x) => x.uid === uid);
    ok("a row exists for " + uid, !!row, uid);
    if (!row || !row.plan) { ok(uid + " carries no appliable plan", !row || !row.plan || !row.plan.can); return; }
    eq(uid + " is not appliable", row.plan.can, false);
    ok(uid + " says it is out of this slice",
      /writes FLIGHTS, F\/S, the eight CHECKRIDES and the prescribed SOLOS/.test(row.plan.why), row.plan.why);
    ok(uid + " names ground lessons and exams as what still waits",
      /ground lessons and exams/.test(row.plan.why), row.plan.why);
  });
  /* airsickness is the half of the ruling that did NOT move: it is refused
     before any scope question, by the sentence that says FDMS has no such
     event at all. */
  const sick = r.rows.find((x) => x.sec === "airsickness");
  ok("an airsickness row is still there", !!sick, "airsickness");
  eq("and it is class `refused`", sick.cls, "refused");
  eq("carrying no plan at all", sick.plan, null);
  eq("nothing in that report is appliable", r.counts.appliable, 0);
}

console.log("\n=== PROBE 9l2 — THE REGRESSION: a flights and an F/S plan, frozen ===");
{
  /* P46-A1 — THE ROUND THAT GREW THE SCOPE MUST NOT HAVE MOVED THE OLD ONE.
     `kind` stopped being the report group and became the BAND of the node, the
     device table is now keyed by band, and refuseApply / makePlan learned two
     new groups: every one of those edits runs through the flights and F/S path
     as well. So the two records the store would get for the two original groups
     are pinned here CHARACTER FOR CHARACTER, taken from the run BEFORE this
     round's first edit. A paraphrase would not have caught `kind`.

     P46-A3 — AND THE ONE KEY THAT WAS ALLOWED TO ARRIVE IS SUBTRACTED BEFORE
     THE COMPARISON, RATHER THAN BAKED INTO THE FROZEN STRING. Ruling #8's FDMS
     half added `duration` to a training-log event, so the record produced today
     genuinely differs from the P46-A1 one by exactly that key. Re-freezing the
     new bytes would have thrown away what this probe is FOR: it would then
     prove only that today equals today. So the frozen strings stay the
     pre-P46-A3 ones, the new key is lifted off and asserted on its own, and
     what is compared is still «everything the old path used to write». A second
     new key would fail here, which is the whole point. */
  const wa = waExport([person({ oid: "oid-a1", last_name: "Alpha" })], [record("wa-oid-a1", {
    flights: [{ date: "2026-08-12", sortie: "C4302", seq: 1, kind: "syllabus",
      instructor: "Airman", duration: 1.3, grade: 78 }],
    fs: [{ date: "2026-08-13", sortie: "FS4101", seq: 1, instructor: "Airman", grade: 88 }],
  })], true);
  const r = run(wa, base());
  const FROZEN = {
    "s:C4302": '{"id":"wa:OID-A1:flights:s:C4302:1","origin":"wa","bridge":{"rid":"OID-A1 ∷ flights ∷ s:C4302 ∷ 1","oid":"OID-A1","group":"flights","uid":"s:C4302","ord":1,"seq":1,"src":{"date":"2026-08-12","seq":1,"grade":78,"thr":60,"mission":"","ng":false,"instructor":"Airman","duration":1.3},"applied_at":"2026-08-26","applied_by":"✎ Editor","export_at":"2026-08-21T09:00:00Z"},"node":"s:C4302","kind":"flights","scope":"student","student":"ZZ-1","class":"","date":"2026-08-12","start_date":"","end_date":"","instructor":"ZP-1","device":"T-6A","result":"completed","score":null,"maneuvers":"","note":"from Wings Ahead · bridge 2026-08-26","absent":[]}',
    "s:FS4101": '{"id":"wa:OID-A1:fs:s:FS4101:1","origin":"wa","bridge":{"rid":"OID-A1 ∷ fs ∷ s:FS4101 ∷ 1","oid":"OID-A1","group":"fs","uid":"s:FS4101","ord":1,"seq":1,"src":{"date":"2026-08-13","seq":1,"grade":88,"thr":60,"mission":"","ng":false,"instructor":"Airman","duration":null},"applied_at":"2026-08-26","applied_by":"✎ Editor","export_at":"2026-08-21T09:00:00Z"},"node":"s:FS4101","kind":"fs","scope":"student","student":"ZZ-1","class":"","date":"2026-08-13","start_date":"","end_date":"","instructor":"ZP-1","device":"OFT","result":"completed","score":null,"maneuvers":"","note":"from Wings Ahead · bridge 2026-08-26","absent":[]}',
  };
  /* the hours P46-A3 added, per node — asserted on their own, then removed so
     the rest of the record can still be compared to the frozen bytes */
  const HOURS = { "s:C4302": 1.3, "s:FS4101": null };
  Object.keys(FROZEN).forEach((uid) => {
    const row = r.rows.find((x) => x.uid === uid);
    ok("a plan still exists for " + uid, !!(row && row.plan && row.plan.can), uid);
    const rec = B.plannedEvent(row.plan, null, DAY);
    ok(uid + " — the event now HAS a duration key (ruling #8, P46-A3)",
      Object.prototype.hasOwnProperty.call(rec, "duration"), JSON.stringify(rec));
    eq(uid + " — and it holds what Wings Ahead said the sortie took", rec.duration, HOURS[uid]);
    delete rec.duration;
    eq(uid + " — everything else is byte-identical to the pre-P46-A3 record",
      JSON.stringify(rec), FROZEN[uid]);
  });
  const f = r.rows.find((x) => x.uid === "s:C4302").plan;
  const s = r.rows.find((x) => x.uid === "s:FS4101").plan;
  eq("the flight's device is still the aircraft", f.device, "T-6A");
  eq("the F/S device is still the trainer", s.device, "OFT");
  eq("and the band is what the graph said, which for these two IS the group",
    f.kind + "/" + s.kind, "flights/fs");
  eq("the flight names a resolved FDMS instructor code, not «SOLO»", f.ip, "ZP-1");
  eq("no warning is raised on an ordinary flight", f.warn.length, 0);
  eq("and its effect sentence is exactly the Phase-3 one",
    f.effect, "result «MISSION COMPLETE» → COMPLETES the node and unlocks its successors");
}

console.log("\n=== PROBE 9m — a deletion is never offered from here (ruling #2) ===");
{
  const wa = waExport([person({ oid: "oid-a1" })], [record("wa-oid-a1", { flights: [] })], true);
  const r = run(wa, base([ev({ id: "wa:OID-A1:flights:s:C4302:1", origin: "wa", date: "2026-08-12",
    node: "s:C4302", result: "completed", instructor: "ZP-1" })]));
  const row = only(r)[0];
  eq("the vanished source is class `deleted`", row.cls, "deleted");
  eq("and carries no plan — it is report-only", row.plan, null);
  ok("its sentence asks for a tombstone and a change-log line",
    /tombstone/.test(row.detail) && /change-log/.test(row.detail), row.detail);
}

console.log("\n=== PROBE 9n — the seq of a bridge event is a FACT OF THE ROW, not an index ===");
{
  const wa = waExport([person({ oid: "oid-a1" })], [record("wa-oid-a1", {
    flights: [
      { date: "2026-08-14", sortie: "C4303", seq: 1, instructor: "Airman", mission: "incomplete" },
      { date: "2026-08-14", sortie: "C4303", seq: 2, instructor: "Airman", grade: 74 },
    ],
  })], true);
  const r1 = run(wa, base());
  const rows1 = only(r1, "s:C4303");
  eq("two wa_only rows, one per attempt", rows1.length, 2);
  const recs = rows1.map((x) => B.plannedEvent(x.plan, null, DAY));
  eq("their handles differ", recs[0].id === recs[1].id, false);
  eq("the morning bust is stored as lag", recs[0].result, "lag");
  eq("the re-fly is stored as completed", recs[1].result, "completed");
  eq("each remembers its own seq", recs[0].bridge.seq + "/" + recs[1].bridge.seq, "1/2");
  const r2 = run(wa, base(recs));
  const rows2 = only(r2, "s:C4303");
  eq("re-loaded: still two rows", rows2.length, 2);
  eq("both agree", rows2.map((x) => x.cls).join(","), "agree,agree");
  eq("the bust still does not complete the node", rows2[0].completes, false);
  eq("the re-fly does", rows2[1].completes, true);
}

console.log("\n=== PROBE 9o — the write controls are OUTSIDE the edit lock's navigation list ===");
{
  const store = fs.readFileSync(path.resolve(__dirname, "..", "..", "..", "app", "schedstore.js"), "utf8");
  const nav = store.slice(store.indexOf("const NAV = ["), store.indexOf("].join(\",\")"));
  ok("the READ controls of the Bridge are on the NAV list", nav.indexOf('"[data-brg]"') >= 0);
  /* the QUOTED selector is what the list is made of; the comment beside it may
     name [data-brgw] as many times as it likes — an entry is a string. */
  ok("the WRITE controls are NOT — they meet the lock like every other write",
    nav.indexOf('"[data-brgw]"') < 0, "\"[data-brgw]\" must not be an entry of NAV");
  const bridge = fs.readFileSync(H.BRIDGE_SRC, "utf8");
  ok("and the pane really does mark its write controls with it", bridge.indexOf('data-brgw="apply"') >= 0);
  ok("the bridge never touches localStorage itself — the store's seams are the only door",
    !/localStorage\s*[.[]/.test(bridge), "no localStorage access anywhere in the bridge");
  /* PHASE 4/5 — THE ONE PROMISE THIS ROUND DELIBERATELY BREAKS, and what
     replaces it. Slice 1 and Phase 3 could say «no network call in this file»
     because the transport was a file the user picked; the push lane IS a
     network call, so the assertion becomes the one that still means something:
     there is EXACTLY ONE caller, it is POST, it goes to the two named RPC doors,
     and the credential rides in the BODY — never in a URL, where a GET would
     put it into every proxy log and browser history on the way. */
  eq("there is exactly ONE network caller in this file", (bridge.match(/W\.fetch\(/g) || []).length, 1);
  ok("and it is the only fetch of any spelling",
    (bridge.match(/(?:^|[^.\w])fetch\s*\(/g) || []).length === 0 && bridge.indexOf("XMLHttpRequest") < 0);
  ok("it is POST — never a GET, whose status code would tell a live credential from a dead one",
    /method:\s*"POST"/.test(bridge) && !/method:\s*"GET"/.test(bridge));
  ok("it speaks to the two named doors and nothing else",
    /rpc\/" \+ fn/.test(bridge) && /wireCall\("bridge_pull"/.test(bridge)
      && /wireCall\("bridge_push"/.test(bridge));
  ok("the credential is put in the BODY and never interpolated into a URL",
    /p_token: trim\(c\.token\)/.test(bridge) && !/p_token=/.test(bridge));
  /* THE EXACT CONSTRUCTION, PINNED. The live acceptance drives the deployed
     Wings Ahead stack through a harness of its own, and a harness that builds
     the request slightly differently would prove nothing about THIS code. So
     the four pieces are asserted here, character for character, and the live
     harness is written against these four lines. */
  ok("the URL is <config.url without trailing slashes> + /rest/v1/rpc/<fn>",
    bridge.indexOf('const rpcUrl = (c, fn) => trim(c.url).replace(/\\/+$/, "") + "/rest/v1/rpc/" + fn;') >= 0);
  ok("the anon key travels as BOTH apikey and Authorization: Bearer, the PostgREST pair",
    /apikey: trim\(c\.anon\),\s*\n?\s*Authorization: "Bearer " \+ trim\(c\.anon\)/.test(bridge));
  ok("the content type is JSON and the answer is asked for as JSON",
    /"Content-Type": "application\/json"/.test(bridge) && /Accept: "application\/json"/.test(bridge));
  ok("the body is the token merged with the call's own arguments, and nothing else",
    /body: JSON\.stringify\(Object\.assign\(\{ p_token: trim\(c\.token\) \}, body \|\| \{\}\)\)/.test(bridge));
  ok("and the token is never logged, toasted or put in a message",
    !/console\.[a-z]+\([^)]*token/i.test(bridge) && !/toast\([^)]*\.token/.test(bridge));
  /* THE RHYTHM AND THE CEILING (design C.4). The debounce is the one SchedSync
     already established, so a burst of typing costs ONE push on both lanes; the
     backoff climbs to five minutes and STOPS there, because a lane that keeps
     halving its patience eventually hammers a door that is not answering. */
  ok("the debounce is the 5 s SchedSync already lives by",
    /const AUTO_MS = 5000;/.test(bridge));
  ok("the backoff is a ramp with a 5-minute ceiling",
    /const BACKOFF_MS = \[10000, 30000, 60000, 180000, 300000\];/.test(bridge));
  ok("and it is read with a clamp, so the ceiling is a ceiling and not a step",
    /BACKOFF_MS\[Math\.min\(wst\.tries, BACKOFF_MS\.length - 1\)\]/.test(bridge));
  ok("a REVOKED credential is not retried at all — it disarms and says so",
    /if \(stopped && wst\.kind !== "revoked"\) armAuto\(\);/.test(bridge));
  /* THE ROUND'S OVERRULED DESIGN DECISION, PINNED. The automatic lane asks the
     edit lock at fire time — found live: a view-only device pushed rows to Wings
     Ahead and could not write its own ledger, because ledgerPut goes through
     upsert and upsert asks mayWrite. */
  ok("the automatic lane asks the edit lock before a single byte leaves",
    /if \(!editOn\(\)\) \{\s*\n\s*if \(how !== "auto"\) refuseWrite/.test(bridge));
  ok("and the timer is not even armed on a locked device",
    bridge.indexOf("if (!editOn()) return;") >= 0);
  ok("the chip says the view-only state instead of counting silently",
    bridge.indexOf('" queued · view-only"') >= 0);
  ok("there is no background POLLER anywhere — every read is an act somebody took",
    !/setInterval/.test(bridge));
  ok("and no download — a JSON of real names is exactly the object that wanders",
    bridge.indexOf("createObjectURL") < 0 && !/\.download\s*=/.test(bridge) && !/download=/.test(bridge));
  ok("the change log is a store collection, declared once",
    store.indexOf("bridgeLog:") > 0 && (store.match(/bridgeLog:/g) || []).length === 1);
  ok("neither counted pseudo-class was spent by the new controls",
    bridge.indexOf("focus-vis") < 0);
  /* the store-touching half is deliberately NOT on the public surface: nothing
     outside a [data-brgw] click can reach it. */
  eq("applyPlan is not exported", typeof B.applyPlan, "undefined");
  eq("undoEntry is not exported", typeof B.undoEntry, "undefined");
  eq("but the pure planner is, for these fixtures", typeof B.plannedEvent, "function");
}

module.exports = true;
