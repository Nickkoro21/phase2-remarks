"use strict";
/* PROBE 2 — IDENTITY IMMUTABILITY. Fixtures crafted independently. */
const H = require("./harness.js");
const { run, ok, eq, person, record, waExport, fdmsStudent, fdmsIp, ev } = H;

console.log("\n=== PROBE 2a — the date correction: 12 Aug -> 13 Aug on a FAIL ===");
{
  const P = person({ oid: "oid-x01", last_name: "Alpha", first_name: "Zero" });
  const wa = waExport([P], [record("wa-oid-x01", {
    flights: [{ date: "2026-08-13", track: "contact", sortie: "C4302", seq: 1,
      kind: "syllabus", instructor: "Airman", duration: 1.3, mission: "incomplete" }],
  })], true);
  const fdms = {
    students: [fdmsStudent({})],
    instructors: [fdmsIp({})],
    trainingLog: [ev({ date: "2026-08-12", node: "s:C4302", result: "fail", instructor: "ZP-1" })],
  };
  const r = run(wa, fdms);
  const flight = r.rows.filter((x) => x.uid === "s:C4302");
  eq("exactly ONE row for the corrected flight", flight.length, 1);
  eq("its class is source_moved", flight[0] && flight[0].cls, "source_moved");
  eq("NO wa_only anywhere", r.counts.byClass.wa_only, 0);
  eq("NO fdms_only anywhere", r.counts.byClass.fdms_only, 0);
  eq("NO deleted anywhere", r.counts.byClass.deleted, 0);
  ok("the row carries BOTH dates side by side",
    flight[0] && flight[0].waDate === "2026-08-13" && flight[0].fdmsDate === "2026-08-12",
    JSON.stringify([flight[0] && flight[0].waDate, flight[0] && flight[0].fdmsDate]));
  ok("the rid contains no date", flight[0] && !/2026-08/.test(flight[0].rid), flight[0] && flight[0].rid);
  eq("the rid is oid ∷ group ∷ node ∷ ord", flight[0] && flight[0].rid, "OID-X01 ∷ flights ∷ s:C4302 ∷ 1");
  // ΠΔ counters proxy: the number of INCOMPLETE flight facts the report attests
  const busts = r.rows.filter((x) => x.group === "flights" && /INCOMPLETE/.test(x.waVerdict || ""));
  eq("exactly ONE bust is attested (the ΠΔ 1γ streak cannot double)", busts.length, 1);
}

console.log("\n=== PROBE 2b — the same-day seq pair (ruling #1) ===");
{
  const P = person({ oid: "oid-x01", last_name: "Alpha", first_name: "Zero" });
  const wa = waExport([P], [record("wa-oid-x01", {
    flights: [
      { date: "2026-08-14", sortie: "C4303", seq: 1, kind: "syllabus", instructor: "Airman", mission: "incomplete" },
      { date: "2026-08-14", sortie: "C4303", seq: 2, kind: "repeat", instructor: "Airman", mission: "complete" },
    ],
  })], true);
  const fdms = {
    students: [fdmsStudent({})], instructors: [fdmsIp({})],
    trainingLog: [
      ev({ date: "2026-08-14", node: "s:C4303", result: "repeat", instructor: "ZP-1" }),
      ev({ date: "2026-08-14", node: "s:C4303", result: "completed", instructor: "ZP-1" }),
    ],
  };
  const r = run(wa, fdms);
  const rows = r.rows.filter((x) => x.uid === "s:C4303");
  eq("two rows for the two sorties", rows.length, 2);
  const rids = rows.map((x) => x.rid);
  ok("the two identities are DISTINCT", rids[0] !== rids[1], JSON.stringify(rids));
  eq("ordinals are 1 and 2", rows.map((x) => x.ord).join(","), "1,2");
  eq("both agree", rows.map((x) => x.cls).join(","), "agree,agree");
  eq("the morning bust does NOT complete the node", rows[0].completes, false);
  eq("the re-fly DOES complete the node", rows[1].completes, true);
  ok("the bust is marked NON-GRADED (ruling #3)", rows[0].nonGraded === true, String(rows[0].nonGraded));
}

console.log("\n=== PROBE 2c — the MN changed on one side; the OID did not (ruling #4) ===");
{
  const P = person({ oid: "oid-x01", mn: "MN-9099", last_name: "Alpha", first_name: "Zero" });
  const wa = waExport([P], [record("wa-oid-x01", {
    flights: [{ date: "2026-08-15", sortie: "C4304", seq: 1, kind: "syllabus", instructor: "Airman", mission: "complete" }],
  })], true);
  const fdms = {
    students: [fdmsStudent({ mn: "MN-9001" })], instructors: [fdmsIp({})],
    trainingLog: [ev({ date: "2026-08-15", node: "s:C4304", result: "completed", instructor: "ZP-1" })],
  };
  const r = run(wa, fdms);
  eq("the person matched", r.persons.length, 1);
  eq("matched VIA OID, not MN", r.persons[0].via, "oid");
  const d = r.persons[0].divergences.join(" | ");
  ok("the MN divergence is REPORTED", /MN differs/.test(d), d);
  ok("the divergence names both numbers", /MN-9099/.test(d) && /MN-9001/.test(d), d);
  eq("the flight still pairs (identity survived the MN change)",
    r.rows.filter((x) => x.uid === "s:C4304").map((x) => x.cls).join(","), "agree");
  // nothing auto-fixed: the engine returns data only; assert the fdms record object is untouched
  eq("FDMS record MN untouched by the report", fdms.students[0].mn, "MN-9001");
}

console.log("\n=== PROBE 2d — the OID is the key: same person, different NAME on each side ===");
{
  const P = person({ oid: "oid-x01", last_name: "Renamed", first_name: "After Marriage" });
  const wa = waExport([P], [record("wa-oid-x01", { flights: [] })], true);
  const fdms = { students: [fdmsStudent({ last_name: "Nobody" })], instructors: [], trainingLog: [] };
  const r = run(wa, fdms);
  eq("still ONE matched person (name is display only)", r.persons.length, 1);
  eq("zero unresolvable identities", r.identities.waOnly.length + r.identities.ambiguous.length, 0);
  ok("the surname difference is reported as display-only",
    r.persons[0].divergences.some((x) => /surname differs/.test(x)), JSON.stringify(r.persons[0].divergences));
}

console.log("\n=== PROBE 2e — REORDERING probe (the spec's declared limit) ===");
{
  // three attempts; the middle one's date is corrected so it jumps past the third
  const P = person({ oid: "oid-x01" });
  const wa = waExport([P], [record("wa-oid-x01", {
    flights: [
      { date: "2026-08-10", sortie: "C4302", seq: 1, kind: "syllabus", instructor: "Airman", mission: "incomplete" },
      { date: "2026-08-22", sortie: "C4302", seq: 1, kind: "repeat", instructor: "Airman", mission: "incomplete" },
      { date: "2026-08-20", sortie: "C4302", seq: 1, kind: "repeat", instructor: "Airman", mission: "complete" },
    ],
  })], true);
  const fdms = {
    students: [fdmsStudent({})], instructors: [fdmsIp({})],
    trainingLog: [
      ev({ date: "2026-08-10", node: "s:C4302", result: "fail", instructor: "ZP-1" }),
      ev({ date: "2026-08-12", node: "s:C4302", result: "fail", instructor: "ZP-1" }),
      ev({ date: "2026-08-20", node: "s:C4302", result: "completed", instructor: "ZP-1" }),
    ],
  };
  const r = run(wa, fdms);
  const rows = r.rows.filter((x) => x.uid === "s:C4302");
  eq("still exactly THREE rows, never six", rows.length, 3);
  eq("no wa_only", r.counts.byClass.wa_only, 0);
  eq("no fdms_only", r.counts.byClass.fdms_only, 0);
  console.log("        (classes: " + rows.map((x) => x.cls).join(", ") + ")");
  const busts = rows.filter((x) => /INCOMPLETE/.test(x.waVerdict || "")).length;
  eq("exactly TWO busts attested, not four", busts, 2);
}

console.log("\n=== PROBE 2f — a genuinely NEW attempt is not swallowed by the moved-date pass ===");
{
  const P = person({ oid: "oid-x01" });
  const wa = waExport([P], [record("wa-oid-x01", {
    flights: [
      { date: "2026-08-10", sortie: "C4302", seq: 1, kind: "syllabus", instructor: "Airman", mission: "incomplete" },
      { date: "2026-08-11", sortie: "C4302", seq: 1, kind: "repeat", instructor: "Airman", mission: "complete" },
    ],
  })], true);
  const fdms = {
    students: [fdmsStudent({})], instructors: [fdmsIp({})],
    trainingLog: [ev({ date: "2026-08-10", node: "s:C4302", result: "fail", instructor: "ZP-1" })],
  };
  const r = run(wa, fdms);
  const rows = r.rows.filter((x) => x.uid === "s:C4302");
  eq("two rows", rows.length, 2);
  eq("the first agrees", rows[0].cls, "agree");
  eq("the genuinely-new second attempt is wa_only, NOT source_moved", rows[1].cls, "wa_only");
}

module.exports = true;
