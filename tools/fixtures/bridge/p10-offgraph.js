"use strict";
/* PROBE 10 — PHASE 3b: THE HOLE AND THE LIE (26/08/2026).
   The adversarial verify of Phase 3 came back with two findings, and this file
   is the mechanical half of both.

   FINDING 9 — THE HOLE. `kindOf()` (the FDMS syllabus graph) was asked on ONE
   side only, in the FDMS reader. So a Wings Ahead row naming a sortie the graph
   does not carry — «ZZ999», or the near-miss «C4404» beside the real «C4304» —
   arrived as an ordinary appliable `wa_only`; the confirm dialog promised it
   would «COMPLETE the node and unlock its successors» about a node that does
   not exist; the write landed; and the NEXT report could not see its own write,
   because the same kindOf() gates the reader. The row stayed `wa_only` and
   every further click minted another orphan (2016 → 2019, proven live).

   FINDING 10 — THE LIE. The pane header still wore a «read-only» badge beside
   live ✔ Apply buttons.

   All names fabricated; nothing is read from or written to the store, the repo
   or the network. */
const fs = require("fs");
const H = require("./harness.js");
const { B, run, ok, eq, person, record, waExport, fdmsStudent, fdmsIp, ev } = H;

const bridge = fs.readFileSync(H.BRIDGE_SRC, "utf8");

/* the harness graph knows s:C4302 · s:C4303 · s:C4304 · s:FS4101 ·
   g:GT-AERO-CRM · g:CO190 … and has never heard of these two */
const GHOST = "ZZ999";
const NEARMISS = "C4404";                     // the real node is s:C4304

const waFlights = (list) => waExport([person({ oid: "oid-a1", last_name: "Alpha" })],
  [record("wa-oid-a1", { flights: list })], true);
const flight = (sortie, o) => Object.assign({ date: "2026-08-12", sortie: sortie, seq: 1,
  kind: "syllabus", instructor: "Airman", grade: 78 }, o);
const base = (log) => ({ students: [fdmsStudent({ oid: "oid-a1", last_name: "Alpha" })],
  instructors: [fdmsIp({})], trainingLog: log || [] });
const at = (r, uid) => r.rows.filter((x) => x.uid === uid);

console.log("\n=== PROBE 10a — a sortie the graph has never heard of is REFUSED, not offered ===");
{
  const r = run(waFlights([flight(GHOST)]), base());
  const rows = at(r, "s:" + GHOST);
  eq("exactly one row for it", rows.length, 1);
  eq("and its class is `refused` — the report's own refusal, not a proposal", rows[0].cls, "refused");
  eq("a refused row carries NO apply plan at all", rows[0].plan, null);
  eq("so nothing in the report is appliable", r.counts.appliable, 0);
  ok("the sentence names the code", rows[0].refused.indexOf(GHOST) >= 0, rows[0].refused);
  ok("and says the FDMS syllabus graph does not carry it",
    /not in the FDMS syllabus graph/.test(rows[0].refused), rows[0].refused);
  ok("and says an off-catalogue row lives on the Wings Ahead side only",
    /Wings Ahead side only/.test(rows[0].refused), rows[0].refused);
  /* THE SENTENCE THE OLD HOLE WOULD HAVE PRINTED, and must not be anywhere near
     this row: the dialog's completion promise about a node that does not exist.
     A grade of 78 is a pass, so nodeEffect() answers «complete» unless the
     absence of the node is answered first — and the Effect column is exactly
     where that lie would have survived the refusal. */
  eq("it never claims to complete a node", rows[0].completes, false);
  ok("and the Effect column says why", /no node/.test(rows[0].effect), rows[0].effect);
  eq("the row still reports what Wings Ahead said", rows[0].waVerdict, "COMPLETE · 78 % vs 60 %");
}

console.log("\n=== PROBE 10b — THE NEAR MISS: C4404 beside the real C4304 ===");
{
  /* the dangerous shape, because everything about it looks right: same family,
     same length, one digit out. Before Phase 3b this was written to the store. */
  const r = run(waFlights([flight(NEARMISS), flight("C4304", { date: "2026-08-13" })]), base());
  const bad = at(r, "s:" + NEARMISS)[0];
  const good = at(r, "s:C4304")[0];
  eq("the typo is refused", bad.cls, "refused");
  eq("with no plan", bad.plan, null);
  ok("and the reason names the typed code, not the real one",
    bad.refused.indexOf(NEARMISS) >= 0 && bad.refused.indexOf("C4304") < 0, bad.refused);
  /* THE REGRESSION HALF — the guard must refuse the ghost and nothing else. */
  eq("the REAL sortie beside it is still wa_only", good.cls, "wa_only");
  eq("still appliable", good.plan.can, true);
  eq("still a CREATE", good.plan.act, "create");
  eq("and the report counts exactly ONE appliable line", r.counts.appliable, 1);
}

console.log("\n=== PROBE 10c — the graph is asked about the NODE, not the row identity ===");
{
  /* a ground lesson's uid is «g:GROUP::COURSE»: the course belongs to the row
     identity, never to the syllabus node. Asking kindOf() about the whole uid
     would refuse every lesson in the school. */
  const wa = waExport([person({ oid: "oid-a1" })], [record("wa-oid-a1", {
    lessons: [{ date: "2026-08-10", group: "GT-AERO-CRM", course: "NEVER-SEEN-101" }],
  })], true);
  const row = at(run(wa, base()), "g:GT-AERO-CRM::NEVER-SEEN-101")[0];
  ok("a lesson on a KNOWN group with an unknown course is not refused", !!row && row.cls !== "refused",
    row && row.cls);
  ok("it is out of this slice for the ordinary reason instead",
    /FLIGHTS and F\/S only/.test(row.plan.why), row.plan.why);

  const gone = waExport([person({ oid: "oid-a1" })], [record("wa-oid-a1", {
    lessons: [{ date: "2026-08-10", group: "GT-NOPE", course: "AE 101" }],
  })], true);
  const g2 = at(run(gone, base()), "g:GT-NOPE::AE 101")[0];
  eq("a lesson on an UNKNOWN group is refused", g2.cls, "refused");
  ok("and the sentence names the group code", g2.refused.indexOf("GT-NOPE") >= 0, g2.refused);
}

console.log("\n=== PROBE 10d — the EVENT sections keep their own words ===");
{
  /* FAIL / ALMOST GOOD / NFS / SMS / airsickness name no node of their own —
     a FAIL is an ANNOTATION on a flight — so «the graph does not carry it» is
     not a finding about them and their sentence must not change. */
  const wa = waExport([person({ oid: "oid-a1" })], [record("wa-oid-a1", {
    fail: [{ date: "2026-08-12", category: "airmanship", flight_code: GHOST,
      items: ["x"], instructor: "Airman", grade: 45 }],
  })], true);
  const row = at(run(wa, base()), "s:" + GHOST)[0];
  eq("the FAIL row is still wa_only, not refused", row.cls, "wa_only");
  ok("and still says FDMS has no event on that code", /has no event on/.test(row.detail), row.detail);
  ok("its plan still refuses for the out-of-slice reason",
    /FLIGHTS and F\/S only/.test(row.plan.why), row.plan.why);
}

console.log("\n=== PROBE 10e — THE DEFENSIVE READ: an orphan event is never invisible ===");
{
  /* the store holds an event on a node the graph does not carry. Until Phase 3b
     the reader dropped it on the floor — the same `if (!band) return` that hid
     the bridge's own writes from the report that made them. */
  const orphan = ev({ id: "wa:OID-A1:flights:s:" + GHOST + ":1", origin: "wa", date: "2026-08-12",
    node: "s:" + GHOST, result: "completed", instructor: "ZP-1", student: "ZZ-1" });
  const r = run(waFlights([]), base([orphan]));
  const rows = at(r, "s:" + GHOST);
  eq("the orphan produces exactly one visible row", rows.length, 1);
  eq("class fdms_only", rows[0].cls, "fdms_only");
  eq("in a group of its own, so it is never mistaken for a flight owed", rows[0].group, "off_graph");
  eq("it carries no apply plan", rows[0].plan, null);
  eq("the row names the event id", rows[0].srcId, orphan.id);
  ok("the sentence says the graph has no node by that name",
    /has no node/.test(rows[0].detail), rows[0].detail);
  ok("and that SchedReady never reads it", /SchedReady never reads it/.test(rows[0].detail), rows[0].detail);
  ok("and it says this one was written by the BRIDGE", /written by the BRIDGE/.test(rows[0].detail),
    rows[0].detail);
  ok("and it points at the Training log, because the bridge deletes nothing",
    /Training log/.test(rows[0].detail) && /deletes nothing/.test(rows[0].detail), rows[0].detail);
  /* THE EFFECT COLUMN. judge() reads `result: "completed"` and would print
     «completes the node» about a node that does not exist. */
  eq("the row completes nothing", rows[0].completes, false);
  ok("and the effect word says why", /no node/.test(rows[0].effect), rows[0].effect);
  eq("the off-graph group is counted in the summary", r.counts.byGroup.off_graph.fdms_only, 1);
  eq("and the row is in the report's own row list", r.rows.indexOf(rows[0]) >= 0, true);
}

console.log("\n=== PROBE 10f — a HAND-TYPED orphan is shown too, and named as one ===");
{
  const orphan = ev({ id: "TV-7777", date: "2026-08-12", node: "s:" + NEARMISS,
    result: "completed", instructor: "ZP-1", student: "ZZ-1" });
  const rows = at(run(waFlights([]), base([orphan])), "s:" + NEARMISS);
  eq("one visible row", rows.length, 1);
  eq("class fdms_only", rows[0].cls, "fdms_only");
  ok("and it does NOT claim the bridge wrote it", !/written by the BRIDGE/.test(rows[0].detail),
    rows[0].detail);
}

console.log("\n=== PROBE 10g — the two sides of one ghost, together ===");
{
  const orphan = ev({ id: "wa:OID-A1:flights:s:" + GHOST + ":1", origin: "wa", date: "2026-08-12",
    node: "s:" + GHOST, result: "completed", instructor: "ZP-1", student: "ZZ-1" });
  const r = run(waFlights([flight(GHOST)]), base([orphan]));
  const rows = at(r, "s:" + GHOST);
  eq("both sides are visible — the refusal and the orphan", rows.length, 2);
  eq("their classes", rows.map((x) => x.cls).sort().join(","), "fdms_only,refused");
  eq("NEITHER carries a plan", rows.filter((x) => x.plan).length, 0);
  eq("and the report is still appliable nowhere", r.counts.appliable, 0);
  /* THE CLICK THAT USED TO MINT AN EVENT — re-running the same cross-check over
     the same store can never grow the report's appliable count. */
  const again = run(waFlights([flight(GHOST)]), base([orphan]));
  eq("re-judged against the same store: unchanged", again.counts.appliable, 0);
  eq("and still two rows, never three", at(again, "s:" + GHOST).length, 2);
}

console.log("\n=== PROBE 10h — a SPECIAL is outside the graph BY NATURE, not by finding ===");
{
  const r = run(waFlights([]), base([ev({ date: "2026-08-04", node: "", special: "nfs",
    student: "ZZ-1", result: "completed" })]));
  eq("an NFS keeps its own pass in the events group", r.rows.filter((x) => x.group === "events").length, 1);
  eq("and is not reported as an off-catalogue node", (r.counts.byGroup.off_graph || {}).fdms_only || 0, 0);
}

console.log("\n=== PROBE 10i — THE FOUR SEAMS, read in the source, not asserted from memory ===");
{
  /* one guard is an intention; the R20 lesson is that the door is closed at
     every seam that can lead to a write. These are read out of the live file. */
  ok("seam ① — the classification asks the graph on the Wings Ahead side",
    /NODE_SECTIONS\.indexOf\(r\.sec\) >= 0[\s\S]{0,40}!k\(nodeOfUid\(r\.uid\)\)/.test(bridge));
  const rof = bridge.slice(bridge.indexOf("function refusalOf("), bridge.indexOf("function isEmptySlot("));
  ok("and refusalOf is where it lives, so `refused` is the class it produces",
    rof.indexOf("offGraphWhy(r.uid)") >= 0, rof);
  ok("asked LAST, so the four older refusals keep their own words",
    rof.indexOf("offGraphWhy(r.uid)") > rof.indexOf("off-catalogue by nature"), rof);

  const plan = bridge.slice(bridge.indexOf("function makePlan("), bridge.indexOf("const effectWord ="));
  ok("seam ② — the plan builder asks it again itself",
    /if \(nodeUid && !kOf\(nodeOfUid\(nodeUid\)\)\)/.test(plan), "makePlan must ask kindOf");
  ok("and it asks BEFORE any of the three acts is built",
    plan.indexOf("offGraphWhy(nodeUid)") < plan.indexOf('if (p.act === "update")'));

  const ref = bridge.slice(bridge.indexOf("function refuseApply("),
    bridge.indexOf("const ADOPTABLE ="));
  ok("seam ③ — the shared refusal asks it", ref.indexOf("offGraphWhy(nodeUid)") >= 0);
  ok("and asks BEFORE the «date» act returns clean — a moved date is a write too",
    ref.indexOf("offGraphWhy(nodeUid)") < ref.indexOf('if (need === "date") return "";'),
    "the graph question must precede the date early-return");

  const wr = bridge.slice(bridge.indexOf("function applyPlan("), bridge.indexOf("function undoEntry("));
  ok("seam ④ — the WRITER asks the live graph itself",
    /R\(\)\.kindOf\(nodeOfUid\(p\.uid\)\)/.test(wr), wr.slice(0, 400));
  ok("and refuses with the same sentence", wr.indexOf("offGraphWhy(p.uid)") >= 0);
  ok("before either act runs", wr.indexOf("offGraphWhy(p.uid)") < wr.indexOf('p.act === "create"'));
  /* the reader's own seam: the drop-on-the-floor line is gone */
  ok("the FDMS reader no longer drops an unknown node silently",
    bridge.indexOf("if (!band) return;                              // the graph does not know it") < 0,
    "the silent `if (!band) return` must not survive");
  ok("it collects it for the defensive read instead", bridge.indexOf("fdOffGraph.push(") >= 0);
}

console.log("\n=== PROBE 10j — FINDING 10: the badge says what the pane does ===");
{
  ok("the header no longer claims «read-only»",
    !/<span class="count">read-only<\/span>/.test(bridge), "the read-only badge must be gone");
  ok("and says what it actually does instead",
    /<span class="count">writes on your confirm<\/span>/.test(bridge));
  /* the prose beside it already said Phase 3 writes — the badge was the half
     that contradicted it, and a badge is read first and re-read last. */
  ok("the prose still names the training log as what it writes",
    /written into the\s*\n?\s*<b>FDMS training log<\/b>/.test(bridge)
      || bridge.indexOf("<b>FDMS training log</b>") >= 0);
  ok("and still promises Wings Ahead is never written",
    bridge.indexOf("It never writes Wings Ahead, the repository or") >= 0);
  /* the pane's seat, in the Scheduler, said «It writes nothing» in a comment —
     true in slice 1, false since Phase 3, and the next round reads comments. */
  const sched = fs.readFileSync(H.BRIDGE_SRC.replace("schedbridge.js", "scheduler.js"), "utf8");
  ok("the Scheduler's own note about the Bridge is no longer «it writes nothing»",
    sched.indexOf("(app/schedbridge.js, specs/bridge-spec.md). It writes nothing.") < 0);
  ok("and no longer calls the pane READ-ONLY",
    sched.indexOf("BRIDGE (Round 18, slice 1 — READ-ONLY)") < 0);
}

module.exports = true;
