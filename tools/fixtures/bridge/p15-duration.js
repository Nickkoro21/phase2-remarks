"use strict";
/* PROBE 15 — PHASE 6γ: THE FLIGHT TIME BECOMES A FIELD OF THE FDMS TRAINING LOG
   (P46-A3, 05/09/2026), AND THE TWO RULINGS THAT CAME WITH IT.

   The Flight Commander, verbatim:
     R1  «Ναι, το NG solo ολοκληρώνει τον κόμβο για τις πτήσεις προσαρμογής. Να
          δεχόμαστε το non graded, αλλά να μπορεί να πάρει βαθμολογία αν έχει
          μπει. Πρόκειται για την περίπτωση όπου σε ένα solo ο μαθητής
          βαθμολογείται με αποτυχία, π.χ. γιατί δεν εφάρμοσε μια κανονική
          διαδικασία ή δεν ακολούθησε οδηγία του ATC.»
     R2  «Βάλε και το duration στο FDMS. Παράλειψη δική μου όταν ξεκινήσαμε.»
     R3  on recompute() never handing the push ledger to crossCheck():
         «Κάνε ό,τι νομίζεις.» — fixed, as § 15ζ designed it.

   R2 closes the half of ruling #8 that had been open since 21/08/2026. What has
   to be proved here is NOT that a key can be added to an object — it is that
   the number is honest at every seam it now crosses:

     · it is READ from all four appliable groups and WRITTEN into the very
       record the store gets, for each of them;
     · it SURVIVES the store — the collection is shape-agnostic below the key,
       and the merge that makes that true is the same merge that forces a
       clearing write to say `null` out loud;
     · it is COMPARED in three cases and three only — both sides and different
       is a difference, FDMS blank beside a Wings Ahead number is the ADOPTABLE
       difference, and a blank on the Wings Ahead side is SILENCE, because «I do
       not know yet» is not a claim that the flight lasted nothing;
     · an ADOPTION of it writes the hours and NOTHING else — no verdict, no
       seat, no node moved;
     · an event a human typed, that Wings Ahead says nothing about, is left
       exactly where it stands;
     · and — ~~it STILL DOES NOT CROSS THE WIRE~~ — SINCE 10/09/2026 IT DOES.
       P46-A3 left exactly one thing owed and named it: the deployed
       wa.bridge_push refused a pushed duration by name. The Flight Commander
       closed it («ολοκλήρωσε ό,τι απαιτείται για το cloud schema· να μπει και
       το duration όπου δεν υπάρχει»), the branch is gone, wa.chk_duration
       judges the key, and `duration` is the ELEVENTH of PUSH_ROW_KEYS. Probe
       15g is the INVERSE of what it was, deliberately and in full — and it
       gained the guard that goes with the new power: this side refuses a
       figure that guard would RAISE on, because a raise over there rolls back
       every other flight in the same chunk.

   AND WHAT P46-A4 ADDED BESIDE THE WIRE (15m · 15n), from the same ruling:
     · «να μπει και το duration όπου δεν υπάρχει» is not only about the wire.
       Two writers of the progress editor created FLYING training-log events
       without naming the field, and upsert() MERGEs — so a re-record could
       leave one flight's hours standing on a record that had started
       describing another. 15m drives both, and drives the ground event that
       must NOT gain the key;
     · «να υπάρχει και στην αναζήτηση αφού είναι εύκολο» — the training log's
       search haystack learns the hours, in both spellings the app uses for
       them. 15n drives that.

   AND THREE THINGS THE ROUND'S OWN VERIFICATION ADDED (15j · 15k · 15l), each
   one a place where a NEW field had to join an OLD list and had not:

     · what a per-field «↦ adopt» button MEANS — narrowPlan(), which kept the
       verdict's own field list for every field but the instructor, so the hours
       button either did not exist or wrote the verdict;
     · what a CREATE tells the change log, which is what ↺ Undo's drift guard
       reads — so a corrected flight time now REFUSES an undo instead of being
       thrown away by one;
     · and the fact that this form's bound (9.9 h) is tighter than the one the
       bridge writes through (wa.chk_duration, 24 h), so a figure nobody here
       typed must not be able to block the event it sits on.

   ALL NAMES FABRICATED. The plans and the very RECORDS the store would get are
   driven through SchedBridge.plannedEvent, never the store itself; the two
   judgements the last two probes need — narrowPlan and driftOf — are pure and
   were put on the public surface for exactly that reason. */
const fs = require("fs");
const path = require("path");
const H = require("./harness.js");
const { B, run, ok, eq, person, record, waExport, fdmsStudent, fdmsIp, kindOf } = H;

const DAY = "2026-09-05";
const BRIDGE = fs.readFileSync(H.BRIDGE_SRC, "utf8");

/* ── THE READINESS ENGINE, LOADED HEADLESSLY FOR ONE FUNCTION ──────────────
   The Training-log form's duration box is validated by SchedReady.durationValue
   — a pure judgement that lives beside describe().hours, which is the syllabus
   number the box shows as a placeholder. A fixture that re-implemented the rule
   would be pinning its own opinion, so app/scheduler.js is evaluated here the
   same way harness.js evaluates the bridge and the currency engine: § ① of that
   file touches no DOM at load, and nothing below it is called. It is done HERE
   and not in the harness because this is the one probe that needs it. */
const SCHED_SRC = path.resolve(__dirname, "..", "..", "..", "app", "scheduler.js");
const SCHEDULER = fs.readFileSync(SCHED_SRC, "utf8");
// eslint-disable-next-line no-eval
(0, eval)(SCHEDULER);
const R = global.SchedReady;
const STORE_SRC = fs.readFileSync(
  path.resolve(__dirname, "..", "..", "..", "app", "schedstore.js"), "utf8");

/* the roster of this file — invented, and the surnames differ so that ruling
   #4's collision rule is never what a probe here is about */
const IP = fdmsIp({ oid: "oid-ip-e1", code: "ZE-1", last_name: "Airman",
  first_name: "Imaginary", quals: { evaluator: true } });
const base = (log) => ({ students: [fdmsStudent({ oid: "oid-a1", last_name: "Alpha" })],
  instructors: [IP], trainingLog: log || [] });
const waRec = (data) => waExport([person({ oid: "oid-a1", last_name: "Alpha" })],
  [record("wa-oid-a1", data)], true);
const at = (r, uid) => r.rows.filter((x) => x.uid === uid);
const one = (r, uid) => at(r, uid)[0];

/* one flown row per appliable group, in the shapes wa.entry_keys() allows */
const FLIGHT = (o) => Object.assign({ date: "2026-09-01", sortie: "C4302", seq: 1,
  kind: "syllabus", instructor: "Airman", grade: 78 }, o);
const FS = (o) => Object.assign({ date: "2026-09-01", sortie: "FS4101", seq: 1,
  instructor: "Airman", grade: 88 }, o);
const EVAL = (o) => Object.assign({ date: "2026-09-02", evaluation: "C4590",
  with: "Airman", grade: 82 }, o);
const SOLO = (o) => Object.assign({ slot: "C", sortie: "C4303", date: "2026-09-03",
  instructor: "Airman", grade: 75 }, o);

/* an FDMS training-log event, as the store holds one */
let n = 0;
const ev = (o) => Object.assign({ id: "TV-" + String(++n).padStart(4, "0"), scope: "student",
  student: "ZZ-1", node: "s:C4302", date: "2026-09-01", instructor: "ZE-1",
  device: "T-6A", result: "completed", absent: [] }, o);

/* ══════════════════════════════════════════════════════════════════════════
   15a — THE FIELD IS READ FROM ALL FOUR GROUPS AND WRITTEN INTO THE RECORD
   ══════════════════════════════════════════════════════════════════════════ */
console.log("\n=== PROBE 15a — buildEvent writes the hours, for every appliable group ===");
{
  const CASES = [
    { what: "a flight", uid: "s:C4302", data: { flights: [FLIGHT({ duration: 1.3 })] }, h: 1.3 },
    { what: "an F/S sortie", uid: "s:FS4101", data: { fs: [FS({ duration: 1.5 })] }, h: 1.5 },
    { what: "a checkride", uid: "s:C4590", data: { evaluations: [EVAL({ duration: 1.1 })] }, h: 1.1 },
    { what: "a solo", uid: "s:C4303", data: { solo_flights: [SOLO({ duration: 0.8 })] }, h: 0.8 },
  ];
  CASES.forEach((c) => {
    const row = one(run(waRec(c.data), base()), c.uid);
    ok(c.what + " — the row exists and is appliable", !!(row && row.plan && row.plan.can), c.uid);
    eq(c.what + " — the report carries the number", row.duration, c.h);
    eq(c.what + " — and so does the plan", row.plan.duration, c.h);
    const rec = B.plannedEvent(row.plan, null, DAY);
    eq(c.what + " — the stored event holds it as a NUMBER", rec.duration, c.h);
    eq(c.what + " — and the provenance remembers what Wings Ahead said",
      rec.bridge.src.duration, c.h);
    /* the promise ruling #8 made on 21/08/2026: payload is never a key */
    ok(c.what + " — the row identity does not carry the hours",
      row.rid.indexOf(String(c.h)) < 0, row.rid);
    ok(c.what + " — nor does the event id", rec.id.indexOf(String(c.h)) < 0, rec.id);
  });

  /* AND A BLANK IS null, NOT "" AND NOT 0. An empty string in a number field
     would sort, compare and print as a value; a zero would say the sortie
     lasted nothing, which is not a thing that happened. */
  const noneRow = one(run(waRec({ flights: [FLIGHT({})] }), base()), "s:C4302");
  const noneRec = B.plannedEvent(noneRow.plan, null, DAY);
  ok("a Wings Ahead row with no time still writes the KEY",
    Object.prototype.hasOwnProperty.call(noneRec, "duration"), JSON.stringify(noneRec));
  eq("and its value is null — never \"\" and never 0", noneRec.duration, null);
  eq("the report prints no chip for it", noneRow.duration, null);
  /* a create names in its change-log fields only what it actually writes */
  ok("the change-log fields of that create name no duration",
    !noneRow.plan.fields.some((f) => f.field === "duration"),
    JSON.stringify(noneRow.plan.fields));
  const withRow = one(run(waRec({ flights: [FLIGHT({ duration: 1.3 })] }), base()), "s:C4302");
  const df = withRow.plan.fields.find((f) => f.field === "duration");
  ok("and a create that DOES write one records it, from blank", !!df && df.from === "" && df.to === 1.3,
    JSON.stringify(withRow.plan.fields));
}

/* ══════════════════════════════════════════════════════════════════════════
   15b — THE STORE KEEPS IT, AND THE MERGE IS WHY A CLEARING WRITE SAYS null
   ══════════════════════════════════════════════════════════════════════════
   SchedStore itself is not evaluated here: it reaches for localStorage, a
   MutationObserver and a document at load, and a DOM shim big enough to boot it
   would be a fixture testing its own shim. The two claims that matter are
   STRUCTURAL and are pinned against the real source, and the BEHAVIOUR they
   produce is driven through harness.mkStore, which mirrors the real upsert's
   merge key for key. */
console.log("\n=== PROBE 15b — the collection is shape-agnostic, and the merge is the rule ===");
{
  ok("normalize() mints a missing key and strips nothing else",
    /rec\[c\.key\] == null\) rec\[c\.key\] = uid\(/.test(STORE_SRC),
    "SchedStore.normalize must not whitelist fields");
  ok("there is no field whitelist for trainingLog anywhere in the store",
    !/trainingLog[\s\S]{0,400}(whitelist|allowedKeys|pick\()/.test(STORE_SRC));
  ok("upsert MERGES, which is what lets a new field survive a partial write",
    /list\[i\] = Object\.assign\(\{\}, list\[i\], rec\)/.test(STORE_SRC));
  ok("and the collection comment records the field the owner asked for",
    /Βάλε και το duration στο FDMS/.test(STORE_SRC));

  const S = H.mkStore({ trainingLog: [] });
  S.upsert("trainingLog", ev({ id: "TS-1", duration: 1.3 }));
  eq("an event stored with hours keeps them", S.find("trainingLog", "TS-1").duration, 1.3);
  S.upsert("trainingLog", { id: "TS-1", note: "a later, unrelated edit" });
  eq("a partial write that never mentions them keeps them",
    S.find("trainingLog", "TS-1").duration, 1.3);
  S.upsert("trainingLog", { id: "TS-1", duration: null });
  eq("and ONLY an explicit null clears them — which is why the form always writes the key",
    S.find("trainingLog", "TS-1").duration, null);
  /* the form's own record is what proves it writes the key unconditionally */
  ok("scheduler.js § saveEvent writes `duration` on EVERY save, not only on flights",
    /duration: dur\.value,/.test(SCHEDULER), "saveEvent must write the key unconditionally");
}

/* ══════════════════════════════════════════════════════════════════════════
   15c — THREE CASES, AND THE THIRD IS SILENCE
   ══════════════════════════════════════════════════════════════════════════ */
console.log("\n=== PROBE 15c — the comparison: differ · adoptable · silent ===");
{
  const dur = (row) => (row.diffs || []).filter((d) => d.field === "duration");

  /* 1 — both sides carry a number and they differ */
  const bothRow = one(run(waRec({ flights: [FLIGHT({ duration: 1.3 })] }),
    base([ev({ duration: 1.6 })])), "s:C4302");
  eq("both sides carry hours and they differ ⇒ payload_differs", bothRow.cls, "payload_differs");
  eq("exactly one duration difference", dur(bothRow).length, 1);
  eq("with the Wings Ahead figure", dur(bothRow)[0].wa, "1.3 h");
  eq("and the FDMS one beside it", dur(bothRow)[0].fdms, "1.6 h");
  ok("and the sentence says what the disagreement IS",
    /two flight times for one sortie/.test(dur(bothRow)[0].why), dur(bothRow)[0].why);

  /* 2 — FDMS is blank and Wings Ahead has one: the adoptable case */
  const blankRow = one(run(waRec({ flights: [FLIGHT({ duration: 1.3 })] }),
    base([ev({})])), "s:C4302");
  eq("FDMS blank beside a Wings Ahead number ⇒ payload_differs", blankRow.cls, "payload_differs");
  eq("one difference, and it is the duration", dur(blankRow).length, 1);
  eq("printed as nothing on the FDMS side", dur(blankRow)[0].fdms, "—");
  ok("the field is one this slice can adopt", B.ADOPTABLE.indexOf("duration") >= 0,
    B.ADOPTABLE.join(" · "));
  ok("and the row is offered as an adoption", !!(blankRow.plan && blankRow.plan.can
    && blankRow.plan.act === "adopt"), blankRow.plan && blankRow.plan.why);

  /* 3 — Wings Ahead is blank: SILENCE, whatever FDMS holds */
  const waBlank = one(run(waRec({ flights: [FLIGHT({})] }),
    base([ev({ duration: 1.6 })])), "s:C4302");
  eq("a blank on the Wings Ahead side is no difference at all", dur(waBlank).length, 0);
  eq("so the row agrees", waBlank.cls, "agree");
  eq("nothing is appliable on it", waBlank.plan, null);
  eq("and the chip still prints the FDMS number", waBlank.duration, 1.6);

  /* the two agreeing */
  const same = one(run(waRec({ flights: [FLIGHT({ duration: 1.3 })] }),
    base([ev({ duration: 1.3 })])), "s:C4302");
  eq("two equal times are silence", dur(same).length, 0);
  eq("the row agrees", same.cls, "agree");

  /* the comparison is on the NUMBER, not on the text it was written as */
  const text = one(run(waRec({ flights: [FLIGHT({ duration: 1.3 })] }),
    base([ev({ duration: "1.30" })])), "s:C4302");
  eq("«1.30» in the store and 1.3 on the wire are one time", dur(text).length, 0);
  eq("and the row agrees", text.cls, "agree");

  /* a chip on a row with no Wings Ahead side at all */
  const only = one(run(waRec({ flights: [] }), base([ev({ duration: 2.1 })])), "s:C4302");
  eq("an FDMS-only event is still fdms_only", only.cls, "fdms_only");
  eq("and its own hours are what the chip prints", only.duration, 2.1);
}

/* ══════════════════════════════════════════════════════════════════════════
   15d — ADOPTING THE HOURS WRITES THE HOURS
   ══════════════════════════════════════════════════════════════════════════ */
console.log("\n=== PROBE 15d — an adoption of the time touches nothing else ===");
{
  /* a bridge-written event, so the provenance twin exists to be refreshed */
  const seed = B.plannedEvent(
    one(run(waRec({ flights: [FLIGHT({ duration: 1.3 })] }), base()), "s:C4302").plan, null, DAY);
  eq("the seeded event holds the first time", seed.duration, 1.3);

  const moved = one(run(waRec({ flights: [FLIGHT({ duration: 1.8 })] }),
    base([seed])), "s:C4302");
  eq("Wings Ahead's corrected time is a difference", moved.cls, "payload_differs");
  const p = moved.plan;
  ok("and the line is appliable as an adoption", !!(p && p.can && p.act === "adopt"), p && p.why);
  const names = p.fields.map((f) => f.field).sort();
  eq("exactly two fields move: the event's own and its provenance twin",
    names.join(","), "bridge.src.duration,duration");
  const f = p.fields.find((x) => x.field === "duration");
  eq("from the stored time", f.from, 1.3);
  eq("to the one Wings Ahead now says", f.to, 1.8);
  ok("NO verdict is written by it", !p.result, p.result);
  ok("no instructor field rides along", !p.fields.some((x) => /instructor/.test(x.field)),
    JSON.stringify(p.fields));
  ok("no grade is re-stamped", !p.fields.some((x) => /grade/.test(x.field)),
    JSON.stringify(p.fields));
  ok("and the node effect says the line changes nothing about it",
    /unchanged by this line/.test(p.effect), p.effect);

  /* the writer applies the fields one by one — and a cleared time must land as
     null, or `num()` would have to undo an empty string on every read */
  ok("evSetField writes null for a cleared duration, never \"\"",
    /if \(field === "duration"\) \{[\s\S]{0,200}patch\.duration = value == null \|\| value === "" \? null : value;/.test(BRIDGE),
    "the writer must not put \"\" in a number field");

  /* an adoption offered on a row whose ONLY difference is the time is exactly
     one tick, and the report says so where it lists what can be adopted */
  ok("the refusal sentence lists duration among the adoptable fields",
    B.ADOPTABLE.join(" · ").indexOf("duration") >= 0, B.ADOPTABLE.join(" · "));
}

/* ══════════════════════════════════════════════════════════════════════════
   15e — A HAND-TYPED EVENT IS LEFT WHERE IT STANDS
   ══════════════════════════════════════════════════════════════════════════ */
console.log("\n=== PROBE 15e — nothing writes hours onto an event nobody asked about ===");
{
  /* an event the developer typed, with no Wings Ahead row for it at all */
  const typed = ev({ id: "TV-HAND", duration: null, note: "typed by the developer" });
  const r = run(waRec({ flights: [] }), base([typed]));
  const row = one(r, "s:C4302");
  eq("it is fdms_only", row.cls, "fdms_only");
  eq("no plan is offered for it", row.plan, null);
  eq("and the report invents no hours for it", row.duration, null);
  eq("nothing in that report is appliable", r.counts.appliable, 0);

  /* the same event, with a Wings Ahead row that agrees about everything and
     says nothing about the time */
  const r2 = run(waRec({ flights: [FLIGHT({})] }), base([typed]));
  const row2 = one(r2, "s:C4302");
  eq("with a Wings Ahead row that carries no time either, it still agrees", row2.cls, "agree");
  eq("and there is still nothing to apply", r2.counts.appliable, 0);

  /* AND THE SYLLABUS HOURS ARE NEVER WRITTEN FOR ANYBODY. describe().hours is
     what the sortie is PLANNED to take; no seam turns a plan into a record. */
  ok("the bridge never reads describe().hours", !/describe\([\s\S]{0,40}\)\.hours/.test(BRIDGE));
  ok("the form shows the syllabus hours as a PLACEHOLDER and never as a value",
    /placeholder="\$\{esc\(d && d\.hours != null \? String\(d\.hours\) : "1\.3"\)\}"/.test(SCHEDULER),
    "the planned hours must not be pre-filled into the box");
  ok("and it says so to the person typing",
    /that is a HINT and is never written for you/.test(SCHEDULER));
}

/* ══════════════════════════════════════════════════════════════════════════
   15f — R1: THE SOLO DOCTRINE IS A RULING NOW, AND A MARKED SOLO IS JUDGED
   ══════════════════════════════════════════════════════════════════════════ */
console.log("\n=== PROBE 15f — «να μπορεί να πάρει βαθμολογία αν έχει μπει» ===");
{
  eq("the doctrine still stands", B.SOLO_NG_COMPLETES, true);
  /* the NG half — the one the owner confirmed */
  const ng = one(run(waRec({ solo_flights: [SOLO({ grade: null, ng: true })] }), base()), "s:C4303");
  eq("an NG solo is appliable", ng.plan.can, true);
  eq("and it COMPLETES the node", ng.plan.completes, true);
  eq("stored as the completed word", B.plannedEvent(ng.plan, null, DAY).result, "completed");

  /* THE SECOND HALF, WHICH IS THE ONE THE OWNER SPELLED OUT: a solo that DOES
     carry a mark is judged by the flight rule. «π.χ. γιατί δεν εφάρμοσε μια
     κανονική διαδικασία ή δεν ακολούθησε οδηγία του ATC» — the student flew
     alone and was marked down, and the node stays owed. */
  const failed = one(run(waRec({ solo_flights: [SOLO({ grade: 41 })] }), base()), "s:C4303");
  eq("a solo marked 41 is appliable", failed.plan.can, true);
  eq("it is written as ΑΠΟΤΥΧΙΑ", failed.plan.result, "fail");
  eq("and it does NOT complete the node", failed.plan.completes, false);
  eq("no warning claims the solo doctrine decided it", failed.plan.warn.length, 0);
  const lag = one(run(waRec({ solo_flights: [SOLO({ grade: 55 })] }), base()), "s:C4303");
  eq("a solo marked 55 is ΥΣΤΕΡΗΣΗ", lag.plan.result, "lag");
  eq("and the node stays owed", lag.plan.completes, false);
  const pass = one(run(waRec({ solo_flights: [SOLO({ grade: 75 })] }), base()), "s:C4303");
  eq("a solo marked 75 completes", pass.plan.result, "completed");
  ok("and resultFor opens the doctrine for the NG source only",
    B.resultFor("solo_flights", { source: "grade", grade: 41, thr: 60 }) === "fail"
      && B.resultFor("solo_flights", { source: "ng" }) === "completed");

  /* AND THE SENTENCES SAY «RULING», NOT «ASSUMPTION» — everywhere */
  ok("the warning on an NG solo names the ruling and its date",
    /the Flight Commander's ruling of 05\/09\/2026/.test(ng.plan.warn[0]), ng.plan.warn[0]);
  ok("no sentence in the bridge still calls the solo doctrine pending",
    !/pending confirmation/i.test(BRIDGE));
  ok("nor an assumption awaiting the owner",
    !/AN ASSUMPTION AWAITING THE OWNER'S CONFIRMATION/.test(BRIDGE));
  ok("the constant carries his words, so a later reader needs no conversation",
    /Ναι, το NG solo ολοκληρώνει τον κόμβο για τις πτήσεις προσαρμογής/.test(BRIDGE));
}

/* ══════════════════════════════════════════════════════════════════════════
   15g — AND SINCE 10/09/2026 IT CROSSES THE WIRE (P46-A4)
   ══════════════════════════════════════════════════════════════════════════
   THIS PROBE USED TO PROVE THE OPPOSITE, and it was right to: until the Wings
   Ahead round of 10/09/2026 the deployed `wa.bridge_push` refused a pushed
   duration BY NAME, so the honest thing for this side to do was not to send it
   and to say why. The Flight Commander lifted that guard — «ολοκλήρωσε ό,τι
   απαιτείται για το cloud schema· να μπει και το duration όπου δεν υπάρχει» —
   the branch is gone, `wa.chk_duration` judges the key instead, and every
   assertion below is the inverse of the one it replaces. A probe left pinning
   the old doctrine would not be a stale comment: it would FAIL the round that
   obeyed the owner, which is the most expensive kind of wrong a fixture can be.
   ══════════════════════════════════════════════════════════════════════════ */
console.log("\n=== PROBE 15g — the pushed row CARRIES the hours, and refuses what WA would raise on ===");
{
  const STU = { oid: "S-9001", code: "ZZ-1", first_name: "Fabricated", last_name: "Nobody",
    class: "77TST-Z", status: "active" };
  const PIP = { oid: "R-9001", code: "ZP-1", first_name: "Imaginary", last_name: "Airman",
    status: "active" };
  const flown = (o) => Object.assign({ id: "TV-PUSH", scope: "student", student: "ZZ-1",
    node: "s:C4302", date: "2026-09-01", instructor: "ZP-1", result: "completed", device: "T-6A",
    duration: 1.3, absent: [] }, o || {});
  const push = (ev) => B.planPush({ trainingLog: [ev], students: [STU], instructors: [PIP],
    bridgePush: [] }, { kindOf });

  const p = push(flown());
  eq("the flight is owed exactly once", p.counts.queued, 1);
  const row = p.queued[0].op.row;
  ok("and the row the wire gets NAMES the hours",
    Object.prototype.hasOwnProperty.call(row, "duration"), JSON.stringify(row));
  eq("as the number the event holds, never as text", row.duration, 1.3);
  eq("its keys are exactly the ELEVEN of PUSH_ROW_KEYS",
    Object.keys(row).sort().join(","), B.PUSH_ROW_KEYS.slice().sort().join(","));
  ok("PUSH_ROW_KEYS grew by exactly one, and it is this one",
    B.PUSH_ROW_KEYS.indexOf("duration") >= 0 && B.PUSH_ROW_KEYS.length === 11,
    B.PUSH_ROW_KEYS.join(","));
  eq("and the bound this side holds is the far side's own", B.DUR_MAX, 24);
  ok("the number really is in the operation that leaves",
    JSON.stringify(p.queued[0].op).indexOf("1.3") >= 0, JSON.stringify(p.queued[0].op));

  /* A FLIGHT NOBODY HAS TIMED CARRIES null — the key is present and empty,
     because an absent key and a null key are two different memories of one row
     and the far side compares `prev` fact for fact. */
  const q = push(flown({ duration: null }));
  const nrow = q.queued[0].op.row;
  ok("a flight whose time is unknown still names the key", "duration" in nrow);
  eq("and its value is null — never \"\", never 0", nrow.duration, null);
  eq("an event written before the field existed reads the same way",
    push(flown({ duration: undefined })).queued[0].op.row.duration, null);
  eq("and a string in a hand-edited store leaves as a NUMBER",
    push(flown({ duration: "1.3" })).queued[0].op.row.duration, 1.3);

  /* ── AND A SHAPE A RECORD CANNOT HONESTLY HOLD IS NOT LAUNDERED INTO AN HOUR
     num() reads `true` as one hour and `[1.3]` as 1.3. Minted through it, an
     event carrying either would be QUEUED with a flight time nobody recorded —
     and on the far side an invented number is indistinguishable from one
     somebody flew. pushDuration() hands such a shape on RAW instead, so the
     line is held here, by name, with the sentence rowProblem already had. */
  const raw = (d) => B.rowProblem(Object.assign({}, row, { duration: d }), "row");
  eq("a boolean is not one hour — nothing is queued", push(flown({ duration: true })).counts.queued, 0);
  eq("it is held instead", push(flown({ duration: true })).counts.blocked, 1);
  ok("and the held line names «duration» rather than a time it invented",
    /duration/.test(push(flown({ duration: true })).blocked[0].why),
    push(flown({ duration: true })).blocked[0].why);
  ok("the block keeps the raw shape, so the sentence can print it",
    /never as text/.test(raw(true)) && /true/.test(raw(true)), raw(true));
  eq("an array is not a time either", push(flown({ duration: [1.3] })).counts.queued, 0);
  ok("and it is refused by name, not read as 1.3", /duration/.test(raw([1.3])), raw([1.3]));
  eq("text that reads as no number is not «not known yet» — it is held",
    push(flown({ duration: "abc" })).counts.queued, 0);
  ok("because calling it null would assert an absence over a value somebody meant",
    /never as text/.test(raw("abc")), raw("abc"));
  ok("and the comma spelling this wire does not speak is held the same way",
    /never as text/.test(raw("1,3")), raw("1,3"));

  /* ── A NON-FINITE NUMBER GETS ITS OWN SENTENCE ───────────────────────
     JSON.stringify() prints BOTH Infinity and NaN as the four letters «null»,
     so the text clause would have named the value as the one value it then
     calls legal, and blamed text for something that is not text. It is
     reachable through the real planner: num() keeps an Infinity, so a stored
     "1e999" mints one. Precision before bound, the rule of this whole clause:
     a refusal must name the real fault. */
  ok("an infinity is refused as an infinity, and printed as one",
    /Infinity/.test(raw(Infinity)) && !/never as text/.test(raw(Infinity)), raw(Infinity));
  ok("and the sentence says what a flight time IS", /real number of hours/.test(raw(Infinity)),
    raw(Infinity));
  ok("NaN likewise — never described as «null»", /NaN/.test(raw(NaN))
    && !/is null/.test(raw(NaN)), raw(NaN));
  {
    const inf = push(flown({ duration: "1e999" }));
    eq("driven through the planner, the 1e999 store queues nothing", inf.counts.queued, 0);
    ok("and the developer is told the real fault, not that his value is null",
      /Infinity/.test(inf.blocked[0].why) && !/«duration» is null/.test(inf.blocked[0].why),
      inf.blocked[0].why);
  }

  /* THE MIRROR OF wa.chk_duration — because over there a bad figure is a RAISE
     and a raise rolls the whole chunk back. Refused here it costs one line. */
  const why = (d) => B.rowProblem(Object.assign({}, row, { duration: d }), "row");
  eq("a legal figure is not a problem at all", why(1.3), "");
  eq("and neither is null", why(null), "");
  ok("130 h is refused by name, and the sentence names the bound", /duration/.test(why(130))
    && /24/.test(why(130)), why(130));
  ok("a second decimal is refused as a second decimal, not as a size",
    /one decimal/.test(why(1.55)), why(1.55));
  ok("a zero is refused: «not known yet» is null, never nothing", /longer than nothing/.test(why(0)),
    why(0));
  ok("and text is refused as text", /never as text/.test(why("1.3")), why("1.3"));

  /* AND THE EVENT THAT CARRIES ONE DOES NOT REACH THE WIRE AT ALL: the planner
     asks the same question of the row it just built, so one impossible figure
     costs its own line and not the chunk it was riding in. */
  const bad = push(flown({ duration: 130 }));
  eq("the flight with an impossible time is not queued", bad.counts.queued, 0);
  eq("it is listed as not crossing, once", bad.counts.blocked, 1);
  ok("with its own sentence, naming the figure and the bound",
    /duration/.test(bad.blocked[0].why) && /24/.test(bad.blocked[0].why), bad.blocked[0].why);
  ok("and the sentence says the flight itself is not in question",
    /Nothing standing in Wings Ahead is touched/.test(bad.blocked[0].why), bad.blocked[0].why);
  eq("nothing is proposed for removal over a typo", bad.counts.removals, 0);

  /* AND A REMOVAL THE DEVELOPER ASKED FOR IS NOT HELD HOSTAGE BY THE SAME TYPO.
     An ↺ Undo owes a removal that names the row the LEDGER REMEMBERS, never the
     one the event would build now — so the guard is asked at the two UPSERT
     paths and not at the row. Asked at the row, one mistyped figure would keep
     a removal the developer explicitly requested owed for ever. */
  const undone = B.planPush({ trainingLog: [flown({ duration: 130 })], students: [STU],
    instructors: [PIP], bridgePush: [{ rid: "S-9001 ∷ flights ∷ s:C4302 ∷ 1", oid: "S-9001",
      group: "flights", uid: "s:C4302", ord: 1, seq: 1, evId: "TV-PUSH", student: "ZZ-1",
      sent: row, state: "undone", hold: "" }] }, { kindOf });
  eq("the removal an ↺ Undo owes still stands, whatever the box now says",
    undone.counts.removals, 1);
  eq("and nothing of that identity is queued", undone.counts.queued, 0);
  eq("the removal names the row the LEDGER remembers", undone.removals[0].op.prev.duration, 1.3);

  /* AND THE COMMENT BESIDE THE CONSTANT TELLS THE NEXT ROUND WHAT IS TRUE NOW,
     which is the whole reason the sentence beside PUSH_ROW_KEYS has been
     rewritten three times instead of being left to rot. */
  ok("the reason written beside PUSH_ROW_KEYS is the RULING that lifted the guard",
    /`duration` IS THE ELEVENTH/.test(BRIDGE) && /THE FLIGHT COMMANDER LIFTED IT ON 10\/09\/2026/.test(BRIDGE),
    "PUSH_ROW_KEYS must say why the key is there");
  ok("and it names the validator that took the branch's place", /wa\.chk_duration/.test(BRIDGE));
  ok("the pane's own text says the hours cross, and names the day",
    /crosses in both directions since 10\/09\/2026/.test(BRIDGE)
      || /crosses this wire in both directions since 10\/09\/2026/.test(BRIDGE),
    "the push-lane help text must be true");
  ok("and no surface still promises that the bridge never writes a duration",
    BRIDGE.indexOf("never writes a grade, a duration or an NG flag") < 0
      && BRIDGE.indexOf("no grade, no duration, no NG") < 0,
    "a retired promise is not reworded around, it goes");
}

/* ══════════════════════════════════════════════════════════════════════════
   15h — THE FORM'S OWN JUDGEMENT, DRIVEN HEADLESSLY
   ══════════════════════════════════════════════════════════════════════════ */
console.log("\n=== PROBE 15h — what a typed flight time may be ===");
{
  const D = (v) => R.durationValue(v);
  eq("durationValue is exported by the readiness engine", typeof R.durationValue, "function");

  eq("a blank is legitimate — the time is simply not known yet", D("").ok, true);
  eq("and it is null, not zero", D("").value, null);
  eq("so is an absent value", D(null).value, null);
  eq("and whitespace alone", D("   ").value, null);

  eq("1.3 is one hour and eighteen minutes", D("1.3").value, 1.3);
  eq("a whole hour needs no decimal", D("2").value, 2);
  eq("«.5» is half an hour — what a person types is accepted", D(".5").value, 0.5);
  eq("«1.» is one hour", D("1.").value, 1);
  eq("and 9.9 is the last legal figure", D("9.9").value, 9.9);

  ok("a comma is refused rather than guessed", !D("1,3").ok && /written with a dot/.test(D("1,3").why));
  ok("so is a clock reading", !D("1:18").ok, D("1:18").why);
  ok("and text", !D("about an hour").ok);
  ok("zero is refused — a flown sortie lasted longer than nothing",
    !D("0").ok && /longer than nothing/.test(D("0").why), D("0").why);
  ok("and the sentence tells the person what to do instead",
    /leave the box empty while the time is not known yet/.test(D("0").why), D("0").why);
  ok("two decimals are refused, with the rounded number offered",
    !D("1.25").ok && /round it, e\.g\. 1\.3/.test(D("1.25").why), D("1.25").why);
  ok("ten hours is refused as a slipped decimal point",
    !D("10").ok && /decimal HOURS, not minutes/.test(D("10").why), D("10").why);
  ok("and so is 130", !D("130").ok, D("130").why);
  /* THE ORDER OF THE TWO REFUSALS IS ITSELF A CLAIM: 9.95 is under ten hours,
     so the bound's sentence would be FALSE about it. The precision is asked
     first, and every sentence the function prints is therefore true. */
  ok("9.95 is refused for its second decimal and not for its size",
    !D("9.95").ok && /one decimal/.test(D("9.95").why), D("9.95").why);

  /* the form asks THIS function and does not re-implement the rule */
  ok("saveEvent validates through SchedReady.durationValue",
    /R\(\)\.durationValue\(isFly \? f\.duration : "", stored \? stored\.duration : null\)/.test(SCHEDULER),
    "the form must ask the exported judgement");
  ok("and refuses the save rather than storing a bad number",
    /if \(!dur\.ok\) \{ S\(\)\.toast\("Duration — " \+ dur\.why, "bad"\); return; \}/.test(SCHEDULER));
  ok("the box is offered for the flying bands only",
    /\$\{isFly \? `<label class="sch-fld"><span>Duration \(h\)<\/span>/.test(SCHEDULER),
    "a ground lesson is measured in periods, not hours");
  ok("the log row prints the hours beside the device, in the same cell",
    /\$\{esc\(ev\.device \|\| "—"\)\}\$\{hrs\}/.test(SCHEDULER), "the layout must not gain a column");
  ok("and prints nothing at all when there are none",
    /ev\.duration == null \? ""/.test(SCHEDULER));
  ok("editing an event puts the stored number back in the box as text",
    /duration: ev\.duration == null \? "" : String\(ev\.duration\)/.test(SCHEDULER));
}

/* ══════════════════════════════════════════════════════════════════════════
   15i — R3: THE LIVE PANE HANDS THE LEDGER OVER, SO BOTH ECHO SENTENCES EXIST
   ══════════════════════════════════════════════════════════════════════════
   § 15ζ's echo rule has two halves and the browser could only ever reach one:
   crossCheck() has read `fdms.bridgePush` since Phases 4+5, and recompute() —
   the ONE caller inside the app — never put the key in the object it handed
   over. So every Wings Ahead row stamped «fdms» came out as the identity note,
   even for a row THIS store's ledger had pushed itself, and the PENDING REMOVAL
   sentence that sends the developer to the Bridge tab was unreachable from the
   application. The fixtures never saw it because they call crossCheck directly
   and hand the ledger in themselves — which is exactly why the repair is pinned
   at the CALL SITE here and not only at the judgement. */
console.log("\n=== PROBE 15i — the push ledger reaches the live report (R3) ===");
{
  const echoWa = waRec({ flights: [FLIGHT({ entered_by: "fdms", duration: 1.3 })] });
  const LED = [{ rid: "OID-A1 ∷ flights ∷ s:C4302 ∷ 1", oid: "oid-a1", group: "flights",
    uid: "s:C4302", ord: 1, seq: 1, evId: "TV-GONE", student: "ZZ-1", state: "pushed", hold: "",
    sent: { date: "2026-09-01", track: "contact", sortie: "C4302", seq: 1, kind: "syllabus",
      instructor: "Airman", instructor_oid: "", grade: null, ng: false, mission: "complete" } }];

  const blind = one(run(echoWa, base()), "s:C4302");
  ok("with NO ledger the row is still never written back", !blind.plan.can, blind.plan.why);
  ok("and the sentence is the IDENTITY one — some other store pushed it",
    /push ledger has never heard of it/.test(blind.plan.why), blind.plan.why);

  const seeing = one(run(echoWa, Object.assign(base(), { bridgePush: LED })), "s:C4302");
  ok("with the ledger the row is still never written back", !seeing.plan.can, seeing.plan.why);
  ok("but now it is a PENDING REMOVAL, which is a different situation",
    /PENDING REMOVAL/.test(seeing.plan.why), seeing.plan.why);
  ok("and it names the row identity the ledger knows it by",
    seeing.plan.why.indexOf("OID-A1 ∷ flights ∷ s:C4302 ∷ 1") >= 0, seeing.plan.why);
  ok("it sends the developer to the Bridge tab, or to the Training log's undo",
    /Bridge tab/.test(seeing.plan.why) && /undo the deletion/.test(seeing.plan.why), seeing.plan.why);

  /* the judgement itself, asked directly, so the two halves are pinned apart */
  const waRow = { side: "wa", uid: "s:C4302", date: "2026-09-01", seq: 1,
    extra: { entered_by: "fdms" } };
  eq("echoOf answers null for a row a human typed",
    B.echoOf({ side: "wa", uid: "s:C4302", date: "2026-09-01", seq: 1, extra: {} }, "oid-a1", LED), null);
  ok("it knows its own row when the ledger holds it", !!B.echoOf(waRow, "oid-a1", LED).known);
  eq("and it does not when the ledger is empty", B.echoOf(waRow, "oid-a1", []).known, null);

  /* THE CALL SITE — the whole of the defect and the whole of the fix */
  ok("recompute() hands the ledger to crossCheck, as planNow() hands it to planPush",
    /function recompute\(\)[\s\S]{0,2000}bridgePush: S\(\)\.get\("bridgePush"\) \|\| \[\],/.test(BRIDGE),
    "the live report must be given the ledger it is judged against");
  ok("and the reason is written beside it, naming the ruling",
    /THE PUSH LEDGER, WHICH THIS CALL HAD NEVER HANDED OVER/.test(BRIDGE));

  /* AND NOTHING ELSE IN THE REPORT MOVED. The ledger changes ONE sentence on
     the echo rows and must be invisible everywhere else — a report that reads
     differently because a ledger row exists would be a report about the ledger. */
  const ordinary = waRec({ flights: [FLIGHT({ duration: 1.3 })],
    fs: [FS({ duration: 1.5 })], evaluations: [EVAL({ duration: 1.1 })],
    solo_flights: [SOLO({ duration: 0.8 })] });
  const seed = base([ev({ id: "TV-K", node: "s:C4304", date: "2026-08-30", duration: 2.0 })]);
  const without = run(ordinary, seed);
  const with_ = run(ordinary, Object.assign({}, seed, { bridgePush: LED }));
  const strip = (rep) => JSON.stringify(rep.rows.map((x) => ({ cls: x.cls, rid: x.rid,
    duration: x.duration, effect: x.effect, can: !!(x.plan && x.plan.can), why: x.plan ? x.plan.why : "" })));
  eq("a ledger row about a flight nobody exported changes NOTHING in the report",
    strip(with_), strip(without));
  eq("and the counts are identical too",
    JSON.stringify(with_.counts), JSON.stringify(without.counts));
  eq("including the notes, where the identity half of the echo rule is promoted",
    JSON.stringify(with_.notes), JSON.stringify(without.notes));
}

/* ══════════════════════════════════════════════════════════════════════════
   15j — «↦ ADOPT» ON THE HOURS ADOPTS THE HOURS (the verification of this round)
   ══════════════════════════════════════════════════════════════════════════
   ADOPTABLE's own comment says the flight time «is adopted ALONE — an adoption
   of the hours never touches the verdict, the grade or the seat», and § 18β of
   the spec says «κινούνται ακριβώς δύο πεδία». Both were true of the PLAN and
   neither was true of the BUTTON: narrowPlan() — the function that turns one
   row's plan into the plan of ONE «↦ adopt» — kept a list with a branch for
   `instructor` and a fall-through that is the VERDICT bundle, and `duration`
   fell into the fall-through. Two different lies, and the report could reach
   both of them:
     · on a row whose ONLY difference was the hours the filter yielded [], so
       narrowPlan returned null and rowHtml drew NO button on the line at all;
     · on a row where the verdict differed TOO the button WAS drawn, and the
       click adopted THE VERDICT while the dialog said «duration».
   The probe drives the narrowed plan directly, which is why narrowPlan is on
   the public surface now: a judgement reachable only through a click is a
   judgement a fixture cannot read. */
console.log("\n=== PROBE 15j — narrowing a plan to the flight time ===");
{
  eq("narrowPlan is exported, so what a per-field button MEANS can be asserted",
    typeof B.narrowPlan, "function");

  /* THE MIXED ROW — the one the defect was invisible on. A bridge-written
     event standing at «completed» with 1.3 h, and Wings Ahead now saying 45 %
     (a FAIL) and 1.8 h: two adoptable differences on one line, each with its
     own button. */
  const seed = B.plannedEvent(
    one(run(waRec({ flights: [FLIGHT({ duration: 1.3 })] }), base()), "s:C4302").plan, null, DAY);
  const mixed = one(run(waRec({ flights: [FLIGHT({ grade: 45, duration: 1.8 })] }),
    base([seed])), "s:C4302");
  const p = mixed.plan;
  ok("the row offers an adoption", !!(p && p.can && p.act === "adopt"), p && p.why);
  const both = p.fields.map((f) => f.field).sort().join(",");
  ok("and the whole plan really does move the verdict AND the hours",
    /(^|,)result(,|$)/.test(both) && /(^|,)duration(,|$)/.test(both), both);

  const dur = B.narrowPlan(p, "duration");
  ok("the hours line HAS a button — the narrowed plan is not null", !!dur,
    "no plan means no ↦ adopt is drawn on the line this round exists for");
  eq("and it moves exactly two fields: the field and its provenance twin",
    dur.fields.map((f) => f.field).sort().join(","), "bridge.src.duration,duration");
  eq("the hours it writes are the ones Wings Ahead says",
    dur.fields.find((f) => f.field === "duration").to, 1.8);
  ok("NO verdict rides with them", !dur.fields.some((f) => f.field === "result"),
    JSON.stringify(dur.fields.map((f) => f.field)));
  ok("no remembered grade is re-stamped either",
    !dur.fields.some((f) => /grade|thr|mission|ng/.test(f.field)),
    JSON.stringify(dur.fields.map((f) => f.field)));
  eq("the narrowed plan claims no result of its own", dur.result, "");
  ok("and its effect sentence says the node does not move",
    /flight time is not part of what completes a node/.test(dur.effect), dur.effect);

  /* AND THE SYMMETRY — adopting the VERDICT must not quietly move the hours.
     One list answers both buttons, and a repair that taught it about duration
     in only one direction would be half a repair. */
  const ver = B.narrowPlan(p, "verdict");
  ok("the verdict button still writes the verdict",
    !!ver && ver.fields.some((f) => f.field === "result"),
    JSON.stringify(ver && ver.fields.map((f) => f.field)));
  ok("and it leaves the flight time exactly where it is",
    !ver.fields.some((f) => /duration/.test(f.field)),
    JSON.stringify(ver.fields.map((f) => f.field)));

  /* THE DURATION-ONLY ROW — the case this round exists for, and the one the
     defect silenced completely. */
  const only = one(run(waRec({ flights: [FLIGHT({ duration: 1.8 })] }), base([seed])), "s:C4302");
  const alone = B.narrowPlan(only.plan, "duration");
  ok("a row whose ONLY difference is the hours still draws its button", !!alone,
    "narrowPlan returned null, so rowHtml would draw no ↦ adopt at all");
  eq("and that button moves the same two fields",
    alone.fields.map((f) => f.field).sort().join(","), "bridge.src.duration,duration");

  /* the warnings are COPIED, never shared — the P46-A1 rule, still true of a
     branch that did not exist when it was written */
  ok("the narrowed plan carries its own warning array",
    alone.warn !== only.plan.warn, "one line's sentence must not land on another's");
  eq("an unnarrowed call is the plan itself", B.narrowPlan(p, ""), p);

  /* AND THE WHOLE CLASS, NOT ONLY THIS ROUND'S INSTANCE. The report can print a
     difference on a field this slice cannot adopt — a bare `grade` today, an
     `end date` or a `course` the day another group becomes appliable. Such a
     line must draw NO button at all, instead of falling through to the verdict
     bundle and adopting the verdict under somebody else's name. */
  eq("a difference this slice cannot adopt narrows to nothing", B.narrowPlan(p, "grade"), null);
  eq("nor does a lesson block's end date", B.narrowPlan(p, "end date"), null);
  eq("nor its course", B.narrowPlan(p, "course"), null);
  ok("and the guard is ADOPTABLE itself, so the two lists cannot drift apart",
    /if \(ADOPTABLE\.indexOf\(field\) < 0\) return null;/.test(BRIDGE),
    "one list says what may be adopted and another says what each adoption moves");
}

/* ══════════════════════════════════════════════════════════════════════════
   15k — A CREATE RECORDS THE PLAN IT APPLIED, AND ↺ UNDO GUARDS ALL OF IT
   ══════════════════════════════════════════════════════════════════════════
   applyCreate used to log a hand-written four-entry list (date · result ·
   instructor · device) that happened to equal what makePlan builds. It stopped
   being equal the moment a CREATE learned to write the hours — the dialog
   printed `p.fields` and promised them, and the change-log entry recorded a
   write it had performed nowhere. The damage was one seam further on: undoEntry
   hands `e.fields` to driftOf, whose whole job is to refuse an undo that would
   discard work typed into the Training log since — and driftOf can only guard
   the fields the entry NAMES. Correcting the hours of a bridge-written event
   and then pressing ↺ Undo deleted the event, and the correction with it, in
   silence. Before this round every editable field of such an event was in that
   list; reading the plan closes the hole by construction. */
console.log("\n=== PROBE 15k — the change log records the plan, and the drift guard reads it ===");
{
  const row = one(run(waRec({ flights: [FLIGHT({ duration: 1.4 })] }), base()), "s:C4302");
  const p = row.plan;
  eq("the line is a CREATE", p.act, "create");
  const names = p.fields.map((f) => f.field);
  ok("the plan's own field list names the hours", names.indexOf("duration") >= 0, names.join(","));
  eq("with the figure Wings Ahead recorded",
    p.fields.find((f) => f.field === "duration").to, 1.4);
  ok("and it still names the four it always did",
    ["date", "result", "instructor", "device"].every((k) => names.indexOf(k) >= 0), names.join(","));

  /* THE CALL SITE — the change log is handed the plan, not a copy of it */
  ok("applyCreate logs the plan's own fields",
    /function applyCreate\(p, band\)[\s\S]{0,2400}\n      fields: p\.fields,/.test(BRIDGE),
    "the entry must record what the dialog promised");
  ok("and keeps no second list that could drift from it",
    !/function applyCreate\(p, band\)[\s\S]{0,2400}\{ field: "date", from: "", to: p\.date \}/.test(BRIDGE),
    "a literal beside the plan is two lists to keep equal, and one of them was wrong");

  /* THE GUARD — driftOf over the very list the entry now carries */
  eq("driftOf is exported: an undo guard a fixture cannot read is one a round can weaken",
    typeof B.driftOf, "function");
  const rec = B.plannedEvent(p, null, DAY);
  eq("an untouched event has drifted from nothing", B.driftOf(rec, p.fields), "");
  const fixed = Object.assign({}, rec, { duration: 1.6 });
  ok("a corrected flight time IS drift, and the undo has to refuse on it",
    /«duration» now reads 1\.6/.test(B.driftOf(fixed, p.fields)), B.driftOf(fixed, p.fields));
  ok("the four older fields are guarded exactly as before",
    ["date", "result", "instructor", "device"].every((k) => {
      const t = Object.assign({}, rec); t[k] = "ZZZ-CHANGED";
      return B.driftOf(t, p.fields).indexOf("«" + k + "»") === 0;
    }), "every field the bridge wrote must be a field the undo checks");

  /* AND A SORTIE WHOSE HOURS NOBODY KNOWS LOGS NO LINE ABOUT THEM. A change log
     that prints «duration: (blank) → (blank)» on every such flight is a log
     nobody reads — and there is nothing there for an undo to guard. */
  const bare = one(run(waRec({ flights: [FLIGHT({})] }), base()), "s:C4302").plan;
  ok("a create with no flight time logs no duration line",
    !bare.fields.some((f) => f.field === "duration"),
    JSON.stringify(bare.fields.map((f) => f.field)));
  eq("and its record still carries the KEY, holding null",
    B.plannedEvent(bare, null, DAY).duration, null);
}

/* ══════════════════════════════════════════════════════════════════════════
   15l — THE FIGURE THE FORM DID NOT RECEIVE FROM A PERSON IS NOT JUDGED AS ONE
   ══════════════════════════════════════════════════════════════════════════
   The two guards bound two different acts and the numbers differ on purpose:
   `wa.chk_duration` accepts up to 24 h, this form up to 9.9. So an ordinary
   Wings-Ahead-side typo — 15 for 1.5 — is legal over there and illegal here,
   and the bridge can leave it standing in the box. Without the `was` clause
   saveEvent blocked the WHOLE event on it: the note, the result and the
   maneuvers could not be edited until the hours were erased, and the toast
   blamed the developer for a number he never typed. */
console.log("\n=== PROBE 15l — the form never blocks on a figure it did not receive ===");
{
  ok("a 15 h sortie is refused when it is TYPED", !R.durationValue("15").ok,
    R.durationValue("15").why);
  eq("and accepted, untouched, when it is what is already stored",
    R.durationValue("15", 15).ok, true);
  eq("as the very number, not a re-judged one", R.durationValue("15", 15).value, 15);
  ok("touch it and it is a typed figure again", !R.durationValue("16", 15).ok,
    "only the byte-identical value is left alone");
  eq("correcting it passes through every clause", R.durationValue("1.5", 15).value, 1.5);
  eq("clearing the box stays a clearing, never «unchanged»", R.durationValue("", 15).value, null);
  ok("a stored zero is no licence: it is not a figure this field can hold",
    !R.durationValue("0", 0).ok, R.durationValue("0", 0).why);
  ok("nor is a stored blank", !R.durationValue("15", null).ok);
  ok("nor a stored value that is not a number at all", !R.durationValue("15", "15").ok);

  ok("saveEvent reads the stored figure and hands it to the judge",
    /const stored = f\.id \? S\(\)\.find\("trainingLog", f\.id\) : null;/.test(SCHEDULER),
    "the form's own copy is what is being judged, so it cannot be the reference");

  /* AND buildEvent's «NEVER 0» IS MADE TRUE WHERE IT IS CLAIMED. It used to be
     the far side's guarantee — wa.chk_duration enforces n > 0 — quoted as if it
     were this line's. One relaxed CHECK constraint over there and a 0 would have
     been minted here as a flown sortie that lasted nothing. */
  const zero = Object.assign({},
    one(run(waRec({ flights: [FLIGHT({ duration: 1.4 })] }), base()), "s:C4302").plan,
    { duration: 0 });
  eq("a zero handed to the writer is stored as «not known», never as zero",
    B.plannedEvent(zero, null, DAY).duration, null);

  /* THE BOARD'S OWN WRITER — it never learns a flight time, but its event id is
     the PLAN LINE's and the node can move under it, so the field has to be
     NAMED: an unnamed key survives the merge, and would leave yesterday's hours
     on a record that has started describing a different sortie. */
  const BOARD = fs.readFileSync(
    path.resolve(__dirname, "..", "..", "..", "app", "schedboard.js"), "utf8");
  ok("the actualizer names the hours it does not know",
    /duration: existing && existing\.node === node && existing\.duration != null \? existing\.duration : null,/
      .test(BOARD),
    "the hours survive a re-actualize of the SAME sortie and are dropped when it changes");
  ok("the progress editor cannot hit that trap: its ids carry the node",
    /id: "prg:" \+ code \+ ":" \+ (it\.uid|u)/.test(BOARD),
    "a record keyed by node can never start describing a different one");
}

/* ══════════════════════════════════════════════════════════════════════════
   15m — «ΝΑ ΜΠΕΙ ΚΑΙ ΤΟ DURATION ΟΠΟΥ ΔΕΝ ΥΠΑΡΧΕΙ» — THE TWO BOARD WRITERS
   ══════════════════════════════════════════════════════════════════════════
   P46-A4. Three writers create a FLYING training-log event. `saveEvent` names
   the field (15b · 15l), `commitActuals` names it (15l), and the progress
   editor's two — `stepWrite`'s node branch and `progCommit` — did not. That is
   not harmless just because neither of them knows an hour figure: upsert()
   MERGEs, so a key a record leaves out KEEPS whatever is stored under it, and
   a writer that says nothing about the hours is not neutral — it is agreeing
   to whatever number is already there.

   HOW THIS IS DRIVEN, AND WHY IT IS NOT A GREP. app/schedboard.js exposes
   three entry points and neither writer is one of them, so the decision cannot
   be called from here. What CAN be done is better than asserting a string is
   present: the one expression that makes the decision is lifted OUT of the
   source and EVALUATED. The probe therefore pins the real code — not a
   re-implementation of it, which would only pin this file's own opinion — and
   a round that reworded the expression into something that behaves differently
   fails here. ALL NAMES FABRICATED. */
console.log("\n=== PROBE 15m — the progress editor names the hours it does not know ===");
{
  const BOARD = fs.readFileSync(
    path.resolve(__dirname, "..", "..", "..", "app", "schedboard.js"), "utf8");

  const lift = (re) => { const m = BOARD.match(re); return m ? m[1] : ""; };
  const stepExpr = lift(/rec\.duration = (was && was\.node === it\.uid && was\.duration != null \? was\.duration : null);/);
  const prgExpr = lift(/rec\.duration = (was && was\.node === u && was\.duration != null \? was\.duration : null);/);
  ok("stepWrite's node branch decides the hours in one expression", !!stepExpr, stepExpr);
  ok("and so does progCommit, in the same words", !!prgExpr, prgExpr);

  /* eslint-disable no-new-func */
  const stepFn = new Function("was", "it", "return " + (stepExpr || "undefined") + ";");
  const prgFn = new Function("was", "u", "return " + (prgExpr || "undefined") + ";");
  /* eslint-enable no-new-func */
  const NODE = "s:C4302", OTHER = "s:C4303";

  eq("a re-record of the SAME node keeps the hours the developer typed",
    stepFn({ node: NODE, duration: 1.3 }, { uid: NODE }), 1.3);
  eq("a record that has started describing ANOTHER flight loses them",
    stepFn({ node: OTHER, duration: 1.3 }, { uid: NODE }), null);
  eq("a first write names the key with nothing in it", stepFn(null, { uid: NODE }), null);
  eq("and so does a stored event that never had hours",
    stepFn({ node: NODE }, { uid: NODE }), null);

  eq("progCommit keeps them on the same node", prgFn({ node: NODE, duration: 2.1 }, NODE), 2.1);
  eq("and drops them when the node moves", prgFn({ node: OTHER, duration: 2.1 }, NODE), null);
  eq("a node nobody has recorded yet gets a null", prgFn(null, NODE), null);

  /* THE KEY IS WRITTEN ONLY FOR A FLYING BAND — a lesson is measured in
     PERIODS and an exam in nothing, and a null hour figure standing on one
     would be an absence dressed as a fact. */
  ok("both writers ask the band before they name the field",
    (BOARD.match(/if \(kind === "flights" \|\| kind === "fs"\) \{\n\s+const was = S\(\)\.find\("trainingLog", id\);/g) || []).length === 2,
    "the two flying-only guards must both be there");

  const between = (from, to) => {
    const i = BOARD.indexOf(from);
    return i < 0 ? "" : BOARD.slice(i, BOARD.indexOf(to, i) + to.length);
  };
  const stepGround = between('id: "prg:" + code + ":" + it.uid + ":" + it.code,', "});");
  ok("the progress editor's LESSON record exists and names no duration",
    !!stepGround && stepGround.indexOf("duration") < 0, stepGround.slice(0, 120));
  const lessonRec = between("const rec2 = {", "};");
  ok("and neither does the day plan's lesson event", !!lessonRec && lessonRec.indexOf("duration") < 0,
    lessonRec.slice(0, 120));
  ok("and the reason is written where the silence is, not only where the key is",
    /IT NAMES NO `duration`, deliberately/.test(BOARD),
    "a deliberate omission that says nothing reads as a forgotten one");
}

/* ══════════════════════════════════════════════════════════════════════════
   15n — «ΝΑ ΥΠΑΡΧΕΙ ΚΑΙ ΣΤΗΝ ΑΝΑΖΗΤΗΣΗ ΑΦΟΥ ΕΙΝΑΙ ΕΥΚΟΛΟ»
   ══════════════════════════════════════════════════════════════════════════
   P46-A4. The training log's search box now finds a flight by its hours. The
   only thing that makes that non-trivial is that the number wears TWO
   spellings in this app and they disagree on the separator: the form TYPES
   «1.3» (durationValue refuses a comma — a decimal comma in an input would
   make the box mean two things depending on locale) and the row PRINTS «1,3 h»
   (the app's own reading convention, the same the syllabus badge uses). A
   haystack that knew one spelling would fail exactly the person who typed the
   number, or exactly the one who read it off the table.
   Driven the same way as 15m: `durHaystack` is lifted out of app/scheduler.js
   and evaluated, and the search is then simulated the way logRows() does it —
   join, lowercase, indexOf. */
console.log("\n=== PROBE 15n — the hours are searchable, in both spellings ===");
{
  const m = SCHEDULER.match(/function durHaystack\(d\) \{[\s\S]*?\n  \}/);
  ok("the haystack helper is there to be driven", !!m);
  // eslint-disable-next-line no-eval
  const durHaystack = m ? (0, eval)("(" + m[0] + ")") : () => "";

  /* the search as logRows() performs it: the same join, the same lowercase,
     the same substring test — and an event field list with no «h» in it, so a
     stray letter cannot be what makes a match. */
  const hayOf = (ev) => [ev.node, ev.instructor, ev.note,
    durHaystack(ev.duration)]
    .filter(Boolean).join(" ").toLowerCase();
  const hit = (ev, q) => hayOf(ev).indexOf(String(q).toLowerCase()) >= 0;

  const timed = { node: "s:C4302", instructor: "ZP-1", note: "", duration: 1.3 };
  const untimed = { node: "s:C4302", instructor: "ZP-1", note: "", duration: null };
  /* the SAME absence, spelled the three other ways a store can spell it. No
     writer in this app produces them — durationValue() returns `value: null`
     for a blank box — but the whole threat model of this round is the
     hand-edited store and the imported backup, and this is the one guard that
     decides what a stored TIME is worth to a search. */
  const blankStr = { node: "s:C4302", instructor: "ZP-1", note: "", duration: "" };
  const spaces = { node: "s:C4302", instructor: "ZP-1", note: "", duration: "   " };
  const absent = { node: "s:C4302", instructor: "ZP-1", note: "" };

  ok("the figure as the FORM types it finds the flight", hit(timed, "1.3"), hayOf(timed));
  ok("the figure as the ROW prints it finds the same flight", hit(timed, "1,3"), hayOf(timed));
  ok("the glued form a logbook writes finds it too", hit(timed, "1.3h"), hayOf(timed));
  ok("and the printed cell, copied straight out of the table", hit(timed, "1,3 h"), hayOf(timed));
  ok("a whole number reads as one", hit({ node: "s:C4302", duration: 2 }, "2"));

  ok("a DIFFERENT time does not match", !hit(timed, "1.4"), hayOf(timed));
  ok("an event whose time is unknown adds NOTHING to its haystack",
    hayOf(untimed) === "s:c4302 zp-1", hayOf(untimed));
  ok("so a stray «h» cannot drag in every flight nobody has timed", !hit(untimed, "h"),
    hayOf(untimed));
  ok("nor can a bare number the event does not carry", !hit(untimed, "1.3"));

  /* THE EMPTY STRING IS AN ABSENCE AND NOT A VALUE. A null test alone would
     let it through and spell out «  h  h» — the exact failure the assertion
     above says is impossible, reached by a store nobody in this app wrote. */
  eq("an empty string adds NOTHING, exactly as a null does", hayOf(blankStr), "s:c4302 zp-1");
  ok("and a bare «h» still finds nothing", !hit(blankStr, "h"), hayOf(blankStr));
  eq("whitespace is the same absence", hayOf(spaces), "s:c4302 zp-1");
  eq("and so is a record written before the field existed", hayOf(absent), "s:c4302 zp-1");
  ok("a shape that is not a time at all adds nothing either",
    !hit({ node: "s:C4302", duration: true }, "h")
      && !hit({ node: "s:C4302", duration: [1.3] }, "1.3"),
    "a boolean or an array is not an hour, and must not be searchable as one");

  /* AND TEXT THAT IS A NUMBER IS FOUND, because the ROW PRINTS IT: a store
     holding «1.3» as text shows «1,3 h» in the table, and a row a reader can
     SEE must be a row that reader can FIND. */
  ok("a numeric string is searchable in both spellings",
    hit({ node: "s:C4302", duration: "1.3" }, "1.3")
      && hit({ node: "s:C4302", duration: "1.3" }, "1,3"));
  ok("and «1.30» is found as the one hour it is — the equivalence compareRow keeps",
    hit({ node: "s:C4302", duration: "1.30" }, "1,3"),
    hayOf({ node: "s:C4302", duration: "1.30" }));

  /* AND THE BOX SAYS SO — a field that is searchable and unadvertised is a
     feature only its author knows about. */
  ok("the search box names the hours among what it searches",
    /placeholder="node · instructor · note · hours"/.test(SCHEDULER),
    "the placeholder must name the fourth thing it now finds");
  ok("the value reaches the helper RAW — one rule, in one place",
    /durHaystack\(ev\.duration\),/.test(SCHEDULER),
    "a second guard at the call site would be a second rule that can disagree");
  ok("and the helper itself is the type test, not a null test",
    /typeof d === "number" \? d/.test(SCHEDULER) && /if \(!isFinite\(n\)\) return "";/.test(SCHEDULER),
    "an unknown time is not a value to be found by, and \"\" is an unknown time");
}

module.exports = true;
