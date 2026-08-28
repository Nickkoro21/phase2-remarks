"use strict";
/* PROBE 11 — PHASE 4/5: THE PUSH LANE (FDMS → WINGS AHEAD), 28/08/2026.
   Phase 3 made the report write ONE way: a Wings Ahead line the developer
   confirms becomes an FDMS event. This probe drives the other way — a flight
   typed in the Training log becoming a row on a student's Wings Ahead record —
   and what it has to prove is not that an operation is built. It is:

     · that the operations the wire gets are EXACTLY the shapes the deployed
       Wings Ahead side accepts, field by field and type by type, because that
       side refuses a shape BY NAME and never coerces one;
     · that an identity is paired by evId and its two minted numbers are frozen,
       because that is the dedup Wings Ahead said out loud it cannot do
       («byte-identical twins remain indistinguishable … that dedup is
       P45-FDMS's»);
     · that the queue is DERIVED — so offline is waiting, a replay is the
       identical operation, and a second change can never carry the first
       change's `prev`;
     · and that every verdict, including the ones that refuse, lands somewhere a
       human reads instead of somewhere a loop retries.

   Everything here is the PURE half: SchedBridge.planPush / foldVerdict build the
   very operations and the very ledger rows the wire and the store would get.
   Nothing touches the store, the network or the DOM. ALL NAMES FABRICATED. */
const H = require("./harness.js");
const { B, ok, eq } = H;

/* ── the fixture's own syllabus graph, with REAL-SHAPED codes ──────────────
   The letter of a sortie code is what names its track on the Wings Ahead side
   (wa.code_track: B/C contact · I instrument · F formation · N navigation), so a
   fixture that invents «FS4101» would be testing a code the wire refuses. These
   are the shapes the 3-01 actually uses, on both sides. */
const KIND = new Map([
  ["s:C4302", "flights"], ["s:C4303", "flights"], ["s:I4201", "flights"],
  ["s:N4301", "flights"], ["s:F4101", "flights"], ["s:C4590", "flights"],
  ["s:C2101", "fs"], ["s:I3101", "fs"],
  ["s:ZZ999", "flights"],                 // in the graph, NOT a syllabus code shape
  ["g:CO190", "exams"], ["g:GT-AERO-CRM", "lessons"],
]);
const kOf = (uid) => KIND.get(uid) || null;

const STU = { oid: "S-9001", code: "ZZ-1", first_name: "Fabricated", last_name: "Nobody",
  class: "77TST-Z", status: "active" };
const IP = { oid: "R-9001", code: "ZP-1", first_name: "Imaginary", last_name: "Airman",
  status: "active" };
let n = 0;
const ev = (o) => Object.assign({ id: "TV-" + String(++n).padStart(4, "0"), scope: "student",
  student: "ZZ-1", node: "s:C4302", date: "2026-08-12", instructor: "ZP-1",
  result: "completed", device: "T-6A", absent: [] }, o);

const plan = (log, ledger, opts) => B.planPush(
  { trainingLog: [].concat(log), students: [STU], instructors: [IP], bridgePush: ledger || [] },
  Object.assign({ kindOf: kOf }, opts || {}));

const q0 = (p) => (p.queued.length ? p.queued[0] : null);

/* ══════════════════════════════════════════════════════════════════════════
   11a — THE QUALIFYING PREDICATE, ONE CLAUSE AT A TIME (design B.1)
   ══════════════════════════════════════════════════════════════════════════ */
console.log("\n=== PROBE 11a — what qualifies to cross, clause by clause ===");
{
  const p = plan([ev({})]);
  eq("an ordinary student flight is owed exactly once", p.counts.queued, 1);
  eq("and nothing is blocked", p.counts.blocked, 0);

  /* THE ECHO RULE — the loop-breaker, and it is absolute. Two marks, either one
     enough, exactly as isWaWritten() reads them on the other side. */
  const byOrigin = plan([ev({ origin: "wa" })]);
  eq("origin:\"wa\" NEVER plans a push", byOrigin.counts.queued, 0);
  const byId = plan([ev({ id: "wa:S-9001:flights:s:C4302:1" })]);
  eq("and neither does a wa: id, whatever the origin says", byId.counts.queued, 0);
  ok("both are silent, not blocked — an echo is not a refusal, it is not a candidate",
    byOrigin.counts.blocked === 0 && byId.counts.blocked === 0);
  ok("the predicate says WHY in its own words when asked directly",
    /echo rule/.test(B.pushBlockOf(ev({ origin: "wa" }), { kindOf: kOf })),
    B.pushBlockOf(ev({ origin: "wa" }), { kindOf: kOf }));

  /* OFF-GRAPH — the graph is asked here as it is asked at every other seam */
  const off = plan([ev({ node: "s:QQ111" })]);
  eq("a node the syllabus graph does not carry never crosses", off.counts.queued, 0);
  eq("and it is BLOCKED, with the sentence — never silently dropped", off.counts.blocked, 1);
  ok("the sentence is the house's own off-graph one",
    /is not in the FDMS syllabus graph/.test(off.blocked[0].why), off.blocked[0].why);

  /* the two out-of-lane bands, and the checkride */
  eq("a ground lesson does not cross", plan([ev({ node: "g:GT-AERO-CRM", scope: "class",
    class: "77TST-Z" })]).counts.queued, 0);
  const exam = plan([ev({ node: "g:CO190", result: "score", score: 82 })]);
  eq("a ground exam does not cross", exam.counts.queued, 0);
  const chk = plan([ev({ node: "s:C4590" })]);
  eq("a checkride does not cross this lane", chk.counts.queued, 0);
  ok("and it says which section owns it instead", /Evaluations section/.test(chk.blocked[0].why),
    chk.blocked[0].why);

  /* THE INSTRUCTOR — ruling #4, across the wire */
  const solo = plan([ev({ instructor: "SOLO" })]);
  eq("«SOLO» resolves to no instructor, so the flight is blocked", solo.counts.queued, 0);
  eq("and it is listed", solo.counts.blocked, 1);
  ok("naming ruling #4", /never guessed from a name/.test(solo.blocked[0].why), solo.blocked[0].why);
  const noip = plan([ev({ instructor: "" })]);
  ok("an empty instructor is blocked by the solo doctrine",
    /never launches alone/.test(noip.blocked[0].why), noip.blocked[0].why);
  const ghost = plan([ev({ instructor: "ZP-9" })]);
  eq("an instructor code that is not on the roster is blocked", ghost.counts.blocked, 1);

  /* THE STUDENT — the OID is the ONE join, and an unknown OID is one of the four
     ENVELOPE raises on the other side: it voids that student's WHOLE call, so it
     is refused here where it costs one line instead of ten. */
  const noOid = B.planPush({ trainingLog: [ev({})],
    students: [Object.assign({}, STU, { oid: "" })], instructors: [IP], bridgePush: [] },
  { kindOf: kOf });
  eq("a student with no OID is blocked", noOid.counts.blocked, 1);
  ok("naming the OID as the one join", /carries no OID/.test(noOid.blocked[0].why),
    noOid.blocked[0].why);
  const stranger = plan([ev({ student: "ZZ-9" })]);
  eq("an event naming a student this roster does not have is blocked", stranger.counts.blocked, 1);

  /* WHAT A PULL ADDS — the same two refusals, made where the knowledge is */
  const wa = [{ role: "student", active: true, external_oid: "S-9001" },
    { role: "instructor", active: true, external_oid: "R-9001" }];
  eq("with a pull on screen, a matched student still crosses",
    plan([ev({})], [], { waPeople: wa }).counts.queued, 1);
  const inactive = plan([ev({})], [], { waPeople: [{ role: "student", active: false, external_oid: "S-9001" }] });
  eq("an INACTIVE Wings Ahead student is blocked before the envelope raises", inactive.counts.blocked, 1);
  ok("in the server's own words", /no ACTIVE Wings Ahead student carries/.test(inactive.blocked[0].why),
    inactive.blocked[0].why);
}

/* ══════════════════════════════════════════════════════════════════════════
   11b — THE MAPPING TABLE (design B.2), ROW FOR ROW
   ══════════════════════════════════════════════════════════════════════════ */
console.log("\n=== PROBE 11b — the row an FDMS event becomes, field for field ===");
{
  const row = q0(plan([ev({})])).op.row;
  eq("the date is the event's date, ISO", row.date, "2026-08-12");
  eq("the sortie is the node with its prefix stripped", row.sortie, "C4302");
  eq("the track is read from the code's own letter (wa.code_track)", row.track, "contact");
  eq("the seq is a fact of the row", row.seq, 1);
  eq("the first attempt on a node is its syllabus flight", row.kind, "syllabus");
  eq("the instructor is the SURNAME, normalised — the display", row.instructor, "AIRMAN");
  eq("and the OID beside it is the identity", row.instructor_oid, "R-9001");
  eq("R2 — a sortie NEVER crosses as a number", row.grade, null);
  eq("«completed» becomes mission complete", row.mission, "complete");
  eq("NG is false and never anything else from this lane", row.ng, false);

  eq("«lag» becomes mission INCOMPLETE", q0(plan([ev({ result: "lag" })])).op.row.mission, "incomplete");
  eq("«fail» becomes mission INCOMPLETE", q0(plan([ev({ result: "fail" })])).op.row.mission, "incomplete");
  eq("«repeat» becomes mission INCOMPLETE", q0(plan([ev({ result: "repeat" })])).op.row.mission, "incomplete");

  /* THE ROUND'S OWN DECISION, AGAINST THE FROZEN DESIGN — recorded in the spec
     as a decision and proven here as a behaviour. B.2 said a blank result
     pushes as «awaiting»; the adversarial critique proved that would print
     payload_differs on that row for ever, because FDMS's own engine reads a
     blank result as COMPLETED. So it does not cross at all, and it says why. */
  const blank = plan([ev({ result: "" })]);
  eq("a BLANK result does not cross", blank.counts.queued, 0);
  eq("it is blocked, with a sentence, never silently", blank.counts.blocked, 1);
  ok("and the sentence is the honest one, not «awaiting»",
    /reads a blank result as COMPLETED/.test(blank.blocked[0].why)
      && /Type the result and the flight crosses by itself \(ruling #5\)/.test(blank.blocked[0].why),
    blank.blocked[0].why);

  const scored = plan([ev({ result: "score", score: 78 })]);
  eq("a sortie stored as a NUMBER does not cross (R2)", scored.counts.queued, 0);
  ok("and it says to correct the word in the Training log",
    /never crosses as a number/.test(scored.blocked[0].why), scored.blocked[0].why);

  /* the F/S band writes the SAME shape into the other section */
  const fs = q0(plan([ev({ node: "s:C2101", device: "OFT" })]));
  eq("an F/S sortie goes to the fs section", fs.op.section, "fs");
  eq("with its track read the same way", fs.op.row.track, "contact");
  const instr = q0(plan([ev({ node: "s:I4201" })])).op.row;
  eq("an I-code is instrument", instr.track, "instrument");
  eq("an N-code is navigation", q0(plan([ev({ node: "s:N4301" })])).op.row.track, "vfr_navigation");
  eq("an F-code is formation", q0(plan([ev({ node: "s:F4101" })])).op.row.track, "formation");

  /* a code the graph carries but the wire cannot place */
  const zz = plan([ev({ node: "s:ZZ999" })]);
  eq("a code whose letter names no track does not cross", zz.counts.queued, 0);
  ok("and it is refused HERE, by its real fault, not there as «incomplete»",
    /not a syllabus code Wings Ahead can place in a table/.test(zz.blocked[0].why), zz.blocked[0].why);
  eq("no date, no crossing", plan([ev({ date: "" })]).counts.blocked, 1);
}

/* ══════════════════════════════════════════════════════════════════════════
   11c — THE WIRE SHAPES: refused BY NAME on the other side, so emitted right
   ══════════════════════════════════════════════════════════════════════════ */
console.log("\n=== PROBE 11c — the seven wire shapes the deployed side refuses by name ===");
{
  const e = q0(plan([ev({})]));
  const op = e.op;
  eq("the op verb is one of exactly two words", B.PUSH_OPS.indexOf(op.op) >= 0, true);
  eq("the section is the band, and nothing else is writable", op.section, "flights");
  eq("the rid is a STRING", typeof op.rid, "string");
  ok("non-blank and within the 200-character bound", op.rid.trim().length > 0
    && op.rid.length <= B.RID_MAX, op.rid.length + " chars");
  eq("a create carries prev: null — an upsert with no prev IS a create", op.prev, null);
  eq("clear_tombstone is a BOOLEAN, never a string", typeof op.clear_tombstone, "boolean");

  /* seq — the single sharpest shape on this wire. A string «2» was `created` at
     seq 1 on the other side and then refused on its own replay: two readers,
     two different values, one stuck queue. It is a JSON NUMBER here. */
  eq("seq is a JSON NUMBER", typeof op.row.seq, "number");
  ok("an integer inside 1..20", op.row.seq === Math.floor(op.row.seq)
    && op.row.seq >= 1 && op.row.seq <= B.SEQ_MAX, String(op.row.seq));
  ok("and it survives JSON as a number, not as \"1\"",
    /"seq":1[,}]/.test(JSON.stringify(op.row)), JSON.stringify(op.row));

  eq("kind is one of the five words the lane speaks", B.PUSH_ROW_KEYS.indexOf("kind") >= 0
    && ["syllabus", "repeat", "cef", "fcf", "other"].indexOf(op.row.kind) >= 0, true);
  eq("ng is a BOOLEAN", typeof op.row.ng, "boolean");
  eq("and it is NEVER true from this lane", op.row.ng, false);
  ok("the date is a \"YYYY-MM-DD\" string", typeof op.row.date === "string"
    && /^\d{4}-\d{2}-\d{2}$/.test(op.row.date), op.row.date);

  /* the three keys that must never appear */
  ok("entered_by is NEVER on the wire — provenance is the server's",
    !("entered_by" in op.row) && JSON.stringify(op).indexOf("entered_by") < 0);
  ok("legacy is NEVER on the wire", !("legacy" in op.row));
  ok("duration is NEVER on the wire, in either direction (ruling #8)",
    !("duration" in op.row) && B.PUSH_ROW_KEYS.indexOf("duration") < 0
      && JSON.stringify(op).indexOf("duration") < 0);
  eq("the row carries exactly the ten keys this lane owns",
    Object.keys(op.row).sort().join(","), B.PUSH_ROW_KEYS.slice().sort().join(","));

  /* AT MOST 200 OPERATIONS — the client chunks, and says so before the server
     has to (the server refuses the 201st by name). BUT 200 IS THE ENVELOPE AND
     NOT THE BUDGET: the `anon` role carries a 3 s statement_timeout, and a
     200-op call of creates was measured at 3122 ms → SQLSTATE 57014 (nothing
     written, whole transaction rolled back), 100 at 3014 ms → 57014, while 40
     took 1691 ms and 25 took 1481 ms. So the chunk this side SENDS is 25. */
  eq("the bound this side holds is the server's own", B.PUSH_MAX_OPS, 200);
  eq("and the chunk it actually sends clears the 3 s budget with a factor of two",
    B.PUSH_CHUNK, 25);
  ok("the sent chunk is never larger than the envelope", B.PUSH_CHUNK <= B.PUSH_MAX_OPS);
  const many = new Array(450).fill(0).map((_, i) => ({ op: "upsert", n: i }));
  const chunks = B.chunkOps(many, many);
  eq("450 operations become eighteen calls of 25", chunks.length, 18);
  eq("every one of them is a full chunk", chunks[0].ops.length + "/" + chunks[17].ops.length, "25/25");
  ok("no operation is dropped and none is sent twice",
    chunks.reduce((a, c) => a.concat(c.ops), []).map((x) => x.n).join(",")
      === many.map((x) => x.n).join(","));
  eq("an empty list is no call at all", B.chunkOps([], []).length, 0);

  /* THE HALVING — the sender passes the size, because a timeout halves it */
  eq("a size of 40 splits 450 into 12 calls", B.chunkOps(many, many, 40).length, 12);
  eq("the floor the halving reaches is one operation per call",
    B.chunkOps(many, many, 1).length, 450);
  eq("and an unstated size is the default, never zero calls",
    B.chunkOps(many, many, 0).length, B.chunkOps(many, many).length);
  eq("and the envelope is still the ceiling, whatever is asked for",
    B.chunkOps(many, many, 1000)[0].ops.length, 200);
  eq("the two halves stay lined up — entries[i] is what ops[i] came from",
    B.chunkOps(many, many, 7)[3].entries[2].n, 3 * 7 + 2);
}

/* ══════════════════════════════════════════════════════════════════════════
   11c·2 — WHAT A FAILED CALL MEANS FOR THE REST OF THE RUN (P45-FDMSb · 11)
   ══════════════════════════════════════════════════════════════════════════
   One classifier, four answers, and the difference between two of them is the
   difference between «one student is held» and «nobody's flights ever cross». */
console.log("\n=== PROBE 11c·2 — the four kinds of failure, told apart by the sentence ===");
{
  const K = B.wireFailKind;
  eq("a fetch that never answered stops the run — it will not answer the next chunk either",
    K({ ok: false, kind: "unreachable", why: "Wings Ahead did not answer — Failed to fetch" }), "stop");
  eq("an unconfigured bridge stops it too",
    K({ ok: false, kind: "unconfigured", why: "not configured" }), "stop");
  eq("a revoked credential is its own answer — every lane is closed",
    K({ ok: false, kind: "revoked", why: "WA: invalid or revoked token" }), "revoked");

  /* THE STATEMENT TIMEOUT — by SQLSTATE, because the HTTP status does not say */
  eq("SQLSTATE 57014 means «too big», never «the door is down»",
    K({ ok: false, kind: "refused", status: 500, code: "57014",
      why: "canceling statement due to statement timeout" }), "toobig");
  eq("and the sentence alone is enough when no code came back",
    K({ ok: false, kind: "refused", status: 504, code: "",
      why: "canceling statement due to statement timeout" }), "toobig");

  /* THE ENVELOPE RAISE THAT NAMES A PERSON — wa.chk() closes with its own
     location in parentheses, and `student_oid` is the only one about a person */
  eq("an unknown roster object id holds ONE student and stops nothing",
    K({ ok: false, kind: "refused", status: 400, code: "P0001",
      why: "WA: invalid payload — no ACTIVE student carries the roster object id OID-SP-02 — the person "
        + "has to exist on the Wings Ahead roster, and be active, before a flight can be pushed onto his "
        + "record (student_oid)" }), "student");
  eq("so does a duplicated one — the roster must be healed, by a human",
    K({ ok: false, kind: "refused", status: 400,
      why: "WA: invalid payload — roster object id S-1 is carried by more than one person — the roster "
        + "must be healed before the bridge writes anything to it (student_oid)" }), "student");
  eq("but an envelope refusal about the OPS array is this side's own bug, and it would repeat "
    + "identically for every student — so it stops",
  K({ ok: false, kind: "refused", status: 400,
    why: "WA: invalid payload — a single push carries at most 200 operations (ops)" }), "stop");
  eq("and an unattributable 5xx stops as well: it may be global, and thirty buckets would make it "
    + "thirty log lines",
  K({ ok: false, kind: "refused", status: 500, code: "XX000", why: "internal error" }), "stop");
}

/* ══════════════════════════════════════════════════════════════════════════
   11d — evId-FIRST PAIRING AND THE TWO FROZEN NUMBERS
   ══════════════════════════════════════════════════════════════════════════
   Wings Ahead wrote it down as a limit of its own: two identities describing the
   same flight with the same facts are ONE ROW to that database, and no test
   written there can separate them. This is where they are separated. */
console.log("\n=== PROBE 11d — the dedup Wings Ahead handed to this side ===");
{
  const a = ev({ id: "TV-A" }), b = ev({ id: "TV-B", node: "s:C4303", date: "2026-08-13" });
  const p = plan([a, b]);
  eq("two flights, two operations", p.counts.queued, 2);
  const rids = p.queued.map((x) => x.op.rid);
  ok("two distinct row identities", rids[0] !== rids[1], rids.join(" | "));
  ok("and the identity is DATE-FREE — the date is a handle, never an identity",
    rids.every((r) => !/2026-08/.test(r)), rids.join(" | "));

  /* THE SAME-DAY PAIR (ruling #1): one code, one day, two flights */
  const m = ev({ id: "TV-M", node: "s:C4303", result: "fail" });
  const aft = ev({ id: "TV-N", node: "s:C4303", result: "completed" });
  const pair = plan([m, aft]);
  eq("both same-day attempts are owed", pair.counts.queued, 2);
  eq("and they take seq 1 and seq 2 — a fact, never an array index",
    pair.queued.map((x) => x.op.row.seq).join(","), "1,2");
  eq("the second attempt is a REPEAT, which is what that kind exists to say",
    pair.queued.map((x) => x.op.row.kind).join(","), "syllabus,repeat");

  /* now push them, freeze the ledger, and DELETE THE MORNING BUST — the exact
     corruption lane the adversarial critique named. */
  const led = pair.queued.map((x, i) => ({
    rid: x.op.rid, oid: x.line.oid, group: x.line.group, uid: x.line.uid,
    ord: x.line.ord, seq: x.line.seq, evId: x.line.evId, student: x.line.student,
    sent: x.op.row, state: "pushed", hold: "", verdict: i ? "created" : "created",
  }));
  const after = plan([aft], led);
  eq("the surviving flight is owed NOTHING — its ledger row still matches",
    after.counts.queued, 0);
  eq("and the deleted one is ONE pending removal", after.counts.removals, 1);
  eq("naming the row it removes, at the seq it was pushed under",
    after.removals[0].op.prev.seq, 1);
  eq("with the reason it is owed", after.removals[0].op.reason, "source_removed");
  eq("the survivor's seq did NOT renumber — it is minted once and frozen",
    led[1].seq, 2);
  ok("zero automatic updates to the surviving row: the queue is empty",
    after.queued.length === 0);

  /* AND THE TWIN: two events, same flight, same facts, different ids */
  const t1 = ev({ id: "TV-T1", node: "s:C4302", date: "2026-08-20" });
  const t2 = ev({ id: "TV-T2", node: "s:C4302", date: "2026-08-20" });
  const tw = plan([t1, t2]);
  eq("two byte-identical twins are two operations here, not one", tw.counts.queued, 2);
  ok("with two rids", tw.queued[0].op.rid !== tw.queued[1].op.rid);
  eq("and two DIFFERENT seqs, so they cannot collapse into one row over there",
    tw.queued.map((x) => x.op.row.seq).join(","), "1,2");
}

/* ══════════════════════════════════════════════════════════════════════════
   11e — THE DERIVED QUEUE: ledger match ⇒ empty · drift ⇒ ONE op · tombstone ⇒ none
   ══════════════════════════════════════════════════════════════════════════ */
console.log("\n=== PROBE 11e — the queue is recomputed, never remembered ===");
{
  const e = ev({ id: "TV-Q" });
  const first = q0(plan([e]));
  const L = { rid: first.op.rid, oid: first.line.oid, group: "flights", uid: "s:C4302",
    ord: 1, seq: 1, evId: "TV-Q", student: "ZZ-1", sent: first.op.row, state: "pushed", hold: "" };

  eq("a ledger row that matches owes nothing at all", plan([e], [L]).counts.queued, 0);

  /* THE DATE CORRECTION — ONE op, and its prev is THE WHOLE ROW as last written */
  const moved = plan([Object.assign({}, e, { date: "2026-08-14" })], [L]);
  eq("a corrected date is ONE operation", moved.counts.queued, 1);
  eq("and it is an upsert, never a delete plus an add", moved.queued[0].op.op, "upsert");
  eq("the same row identity — the rid is date-free", moved.queued[0].op.rid, L.rid);
  ok("`prev` is the WHOLE ROW as the bridge last wrote it, not three handle fields",
    Object.keys(moved.queued[0].op.prev).sort().join(",") === B.PUSH_ROW_KEYS.slice().sort().join(","),
    Object.keys(moved.queued[0].op.prev).join(","));
  eq("prev carries the OLD date", moved.queued[0].op.prev.date, "2026-08-12");
  eq("row carries the NEW one", moved.queued[0].op.row.date, "2026-08-14");
  eq("and the seq is the FROZEN one on both sides",
    moved.queued[0].op.prev.seq + "/" + moved.queued[0].op.row.seq, "1/1");

  const changed = plan([Object.assign({}, e, { result: "fail" })], [L]);
  eq("a verdict correction is ONE operation too", changed.counts.queued, 1);
  eq("with the same handle on both sides", changed.queued[0].op.prev.date,
    changed.queued[0].op.row.date);
  eq("and the mission moved", changed.queued[0].op.prev.mission + "→"
    + changed.queued[0].op.row.mission, "complete→incomplete");

  /* ORDERED PER rid, WITHOUT AN ORDERED QUEUE. Two edits before one answer are
     ONE operation carrying the right `prev` — which is what makes the deployed
     side's «a second change with the first change's prev is REFUSED» a rule this
     client cannot break rather than one it has to remember. */
  const twice = plan([Object.assign({}, e, { date: "2026-08-14", result: "lag" })], [L]);
  eq("two edits before one answer collapse into ONE operation", twice.counts.queued, 1);
  eq("whose prev is still the LAST ACKNOWLEDGED row", twice.queued[0].op.prev.date, "2026-08-12");
  eq("and whose row is the event as it stands NOW",
    twice.queued[0].op.row.date + "/" + twice.queued[0].op.row.mission, "2026-08-14/incomplete");

  /* A TOMBSTONE IS WHAT MAKES AN UNDO STICK */
  const tomb = plan([e], [Object.assign({}, L, { state: "removed", verdict: "removed" })]);
  eq("a removed identity is never re-created by the queue", tomb.counts.queued, 0);
  eq("it is HELD, and the way back is one explicit act", tomb.counts.held, 1);
  eq("named as removed", tomb.held[0].hold, "removed");
  const waTomb = plan([e], [L], { tombstones: [{ student_oid: "S-9001", rid: L.rid, cleared_at: null }] });
  eq("a tombstone Wings Ahead reports also holds the identity", waTomb.counts.queued, 0);
  eq("and says so", waTomb.held[0].hold, "tombstoned");
  const cleared = plan([e], [L], { tombstones: [{ student_oid: "S-9001", rid: L.rid,
    cleared_at: "2026-08-27T10:00:00Z" }] });
  eq("a CLEARED tombstone holds nothing", cleared.counts.held, 0);

  /* an identity Wings Ahead refused is off the queue until a human clears it */
  const conf = plan([Object.assign({}, e, { result: "fail" })],
    [Object.assign({}, L, { hold: "conflict", note: "…", verdict: "exists_fdms" })]);
  eq("a held identity is never queued by itself", conf.counts.queued, 0);
  eq("it waits for a human, with what Wings Ahead answered", conf.held[0].verdict, "exists_fdms");

  /* THE UNDO OF A CREATE — the removal is OWED, and it is never queued */
  const undone = plan([e], [Object.assign({}, L, { state: "undone" })]);
  eq("an undone push owes a REMOVAL", undone.counts.removals, 1);
  eq("never a push", undone.counts.queued, 0);
  eq("with reason «undo»", undone.removals[0].op.reason, "undo");
  eq("and a second planner run does not resurrect it — still zero queued",
    plan([e], [Object.assign({}, L, { state: "undone" })]).counts.queued, 0);
  ok("the removal names its row the way the wire demands: prev, the whole row",
    Object.keys(undone.removals[0].op.prev).sort().join(",")
      === B.PUSH_ROW_KEYS.slice().sort().join(","));
  eq("a removal carries NO row key at all — it names, it does not write",
    "row" in undone.removals[0].op, false);
  ok("its reason is one of the three the lane speaks",
    B.PUSH_REASONS.indexOf(undone.removals[0].op.reason) >= 0);

  /* offline is WAITING, never loss: the same plan comes back identical */
  const a1 = JSON.stringify(plan([e], [L]).queued);
  const a2 = JSON.stringify(plan([e], [L]).queued);
  eq("recomputing the queue is deterministic — nothing is consumed by asking", a1, a2);
}

/* ══════════════════════════════════════════════════════════════════════════
   11f — FOLDING THE ELEVEN VERDICTS
   ══════════════════════════════════════════════════════════════════════════ */
console.log("\n=== PROBE 11f — eleven words in, one ledger row and one report class out ===");
{
  const e = q0(plan([ev({ id: "TV-F" })]));
  const fold = (verdict, extra) => B.foldVerdict(Object.assign({ verdict }, extra || {}), e);

  eq("the vocabulary is exactly eleven words", B.PUSH_VERDICTS.length, 11);
  eq("and it is the deployed list, in the deployed order", B.PUSH_VERDICTS.join(","),
    "created,moved,updated,removed,unchanged,exists_student,exists_admin,exists_fdms,"
    + "missing,tombstoned,refused");

  const cr = fold("created");
  eq("created advances the ledger to «pushed»", cr.state, "pushed");
  eq("and stores the row it wrote as the next `prev`", JSON.stringify(cr.sent),
    JSON.stringify(e.op.row));
  eq("folding into the report's own vocabulary", cr.cls, "agree");
  eq("moved advances the same way", fold("moved").state, "pushed");
  eq("updated too", fold("updated").state, "pushed");

  const un = fold("unchanged");
  eq("unchanged — the replay — advances too, and that is the point", un.state, "pushed");
  eq("it is agreement, not a problem", un.cls, "agree");
  ok("and it says a replay was absorbed", /replay, absorbed/.test(un.say), un.say);

  /* exists_fdms — the one exists_* that hands back NOTHING */
  const xf = fold("exists_fdms", { row: null });
  eq("exists_fdms HOLDS the identity — it never wedges the queue in a retry loop",
    xf.hold, "conflict");
  eq("the ledger did NOT advance: prev stays what was last acknowledged",
    JSON.stringify(xf.sent), JSON.stringify(e.op.prev));
  eq("it is a report line, in a class the developer already knows", xf.cls, "payload_differs");
  ok("and it is folded WITHOUT expecting a row back — row:null is deliberate",
    xf.waRow === null, String(xf.waRow));
  ok("the sentence tells the developer the recovery is explicit",
    /Refresh from Wings Ahead, then clear this line by hand/.test(xf.say), xf.say);

  /* the two that DO return the standing row, for the report's two-versions view */
  const xs = fold("exists_student", { row: { date: "2026-08-12", sortie: "C4302", seq: 1,
    grade: 71, instructor: "SOMEBODY" } });
  eq("exists_student holds the identity as the student's", xs.hold, "student");
  ok("and KEEPS the row it was handed, in full, for the report", xs.waRow
    && xs.waRow.grade === 71, JSON.stringify(xs.waRow));
  eq("as a payload difference the developer rules on", xs.cls, "payload_differs");
  const xa = fold("exists_admin", { row: { sortie: "C4302" } });
  eq("exists_admin says the admin took it over", xa.hold, "admin");
  ok("and keeps his row too", !!xa.waRow);

  /* ── `missing` KEEPS THE MEMORY (P45-FDMSb · verify item 5) ──────────────
     It used to answer `sent: null`, and the pane's own recovery sentence then
     armed a create with `prev: null` — which produced TWO fdms rows for one
     FDMS event, the second one outside the ledger and unreachable by ↺ Undo.
     The server answers `missing` for a row the admin DELETED and for one he
     MOVED (his date edit moves the handle) and cannot tell them apart; this
     side keeps what it wrote so the difference can be READ instead of guessed.
     Folded on a MOVE, because that is the operation the verdict can answer. */
  const mv = { line: e.line, kind: "move",
    op: { op: "upsert", section: "flights", rid: e.op.rid, prev: e.op.row,
      row: Object.assign({}, e.op.row, { date: "2026-08-14" }), clear_tombstone: false } };
  const ms = B.foldVerdict({ verdict: "missing" }, mv);
  eq("missing KEEPS the row this store last wrote — it is the only handle on the moved case",
    JSON.stringify(ms.sent), JSON.stringify(mv.op.prev));
  eq("the identity is not «pushed»: nothing of ours stands at that handle", ms.state, "");
  eq("held meanwhile", ms.hold, "missing");
  eq("in the class the report already has for a vanished row", ms.cls, "deleted");
  ok("and it names BOTH readings — deleted, or moved by an admin's date edit",
    /DELETED/.test(ms.say) && /MOVED/.test(ms.say), ms.say);
  ok("and sends the developer to read Wings Ahead rather than to a button",
    /read Wings Ahead/.test(ms.say), ms.say);
  eq("an operation that CLAIMED nothing keeps nothing — a create has no memory to hold",
    B.foldVerdict({ verdict: "missing" }, e).sent, null);

  eq("tombstoned holds the identity as removed", fold("tombstoned").state, "removed");
  eq("refused holds it and names nothing else", fold("refused").hold, "refused");
  eq("refused is an unwritten line, not a disagreement", fold("refused").cls, "unwritten");

  /* a word this side does not know is not folded on a guess */
  const alien = fold("banana");
  eq("an unknown verdict holds the identity", alien.hold, "refused");
  ok("prints what arrived", /«banana»/.test(alien.say), alien.say);
  ok("and advances NOTHING", JSON.stringify(alien.sent) === JSON.stringify(e.op.prev));

  /* a removal's fold */
  const rm = { op: { op: "remove", section: "flights", rid: e.op.rid, prev: e.op.row,
    reason: "undo" }, line: e.line };
  const rmv = B.foldVerdict({ verdict: "removed" }, rm);
  eq("a removal that landed marks the identity removed", rmv.state, "removed");
  eq("keeping the row it removed, so an undo has something to put back",
    JSON.stringify(rmv.sent), JSON.stringify(e.op.row));
  eq("and its reason", rmv.reason, "undo");
  const rmr = B.foldVerdict({ verdict: "unchanged" }, rm);
  eq("a REPLAYED removal is absorbed as removed, not as pushed", rmr.state, "removed");
  ok("saying the tombstone was already lying there",
    /tombstone was already lying on it/.test(rmr.say), rmr.say);
}

/* ══════════════════════════════════════════════════════════════════════════
   11g — sameWaRow: the client's own «is this the same row» test
   ══════════════════════════════════════════════════════════════════════════ */
console.log("\n=== PROBE 11g — the comparison that decides whether anything is owed ===");
{
  const r = q0(plan([ev({})])).op.row;
  ok("a row equals itself", B.sameWaRow(r, Object.assign({}, r)));
  ok("a changed date is a different row", !B.sameWaRow(r, Object.assign({}, r, { date: "2026-08-13" })));
  ok("a changed mission is a different row",
    !B.sameWaRow(r, Object.assign({}, r, { mission: "incomplete" })));
  ok("a changed seq is a different row", !B.sameWaRow(r, Object.assign({}, r, { seq: 2 })));
  ok("a changed instructor OID is a different row",
    !B.sameWaRow(r, Object.assign({}, r, { instructor_oid: "R-9002" })));
  ok("an absent key and a null key are the same emptiness — the wire drops both",
    B.sameWaRow(Object.assign({}, r, { mission: null }),
      (function () { const c = Object.assign({}, r); delete c.mission; return c; }())));
  ok("a key this lane does not own cannot change the answer",
    B.sameWaRow(r, Object.assign({}, r, { entered_by: "fdms", legacy: false })));
  ok("nothing is not a row", !B.sameWaRow(null, r) && !B.sameWaRow(r, null));
}

/* ══════════════════════════════════════════════════════════════════════════
   11h — THE ECHO RULE COMPLETED (design D.3): an fdms row never comes back
   ══════════════════════════════════════════════════════════════════════════ */
console.log("\n=== PROBE 11h — a Wings Ahead row this bridge wrote is never proposable ===");
{
  const waRow = { side: "wa", sec: "flights", uid: "s:C4302", date: "2026-08-12", seq: 1,
    extra: { entered_by: "fdms" } };
  const human = { side: "wa", sec: "flights", uid: "s:C4302", date: "2026-08-12", seq: 1,
    extra: { entered_by: "" } };
  const led = [{ rid: "S-9001 ∷ flights ∷ s:C4302 ∷ 1", oid: "S-9001",
    sent: { sortie: "C4302", date: "2026-08-12", seq: 1 } }];

  eq("a row a HUMAN typed is not an echo and stays proposable",
    B.echoOf(human, "S-9001", led), null);
  const known = B.echoOf(waRow, "S-9001", led);
  ok("an fdms-stamped row the ledger KNOWS is a pending removal line", !!known && !!known.known,
    JSON.stringify(known));
  ok("naming the row identity it was pushed under",
    /S-9001 ∷ flights ∷ s:C4302 ∷ 1/.test(known.why), known.why);
  ok("and refusing to mint a second FDMS event from this system's own reflection",
    /would create a second FDMS event/.test(known.why), known.why);
  const stranger = B.echoOf(waRow, "S-9001", []);
  ok("an fdms-stamped row the ledger does NOT know is an identity note",
    !!stranger && !stranger.known);
  ok("naming the two honest causes", /restored backup/.test(stranger.why)
    && /another device whose ledger did not travel/.test(stranger.why), stranger.why);
}

/* ══════════════════════════════════════════════════════════════════════════
   11i — THE POISONED LEDGER: `prev` IS THE OTHER HALF OF THE SHAPE DISCIPLINE
   ══════════════════════════════════════════════════════════════════════════
   `row` is rebuilt from scratch by pushRowOf() on every operation and cannot
   carry a string seq even from a ledger somebody hand-edited — the P45-FDMS
   verify proved that with this very fixture's planner. `prev` was forwarded
   VERBATIM, and an ⭱ Import restores the ledger verbatim, so a tampered or
   hand-made backup could put a string seq / kind:"banana" / a duration / an
   entered_by on the wire. Half of those the server refuses by name; the other
   half it CANNOT — the entered_by / legacy / duration guards read `row` only —
   and a `prev` carrying them comes back `exists_fdms`: a knowledge refusal for
   a claim that was true. So the check is made here, and the claim is never
   silently repaired, because repairing a claim of knowledge is forging it. */
console.log("\n=== PROBE 11i — a `prev` this side will not send, and never rewrites ===");
{
  const good = q0(plan([ev({ id: "TV-P1" })])).op.row;
  eq("a row this planner built is a legal `prev`", B.prevProblem(good), "");
  eq("and a create's absent claim is legal too — it claims nothing", B.prevProblem(null), "");

  const bad = (patch, kill) => {
    const c = Object.assign({}, good, patch || {});
    if (kill) delete c[kill];
    return B.prevProblem(c);
  };
  ok("a STRING seq is refused here, before the wire is asked",
    /seq/.test(bad({ seq: "2" })) && /JSON NUMBER/.test(bad({ seq: "2" })), bad({ seq: "2" }));
  ok("so is a seq out of the 1..20 the record is validated against", !!bad({ seq: 21 }));
  ok("an unknown kind is refused by name", /kind/.test(bad({ kind: "banana" })), bad({ kind: "banana" }));
  ok("a non-boolean ng is refused by its SHAPE", !!bad({ ng: "maybe" }));
  ok("a date that is not a calendar day is refused", !!bad({ date: "12/08/2026" }));
  ok("and a date that is not a string at all", !!bad({ date: 20260812 }));
  ok("a mission nobody speaks is refused", !!bad({ mission: "aborted" }));
  ok("a track nobody speaks is refused", !!bad({ track: "aerobatics" }));
  ok("a grade that is neither a number nor null is refused", !!bad({ grade: "71" }));

  /* THE THREE THE SERVER WOULD NOT CATCH ON `prev` */
  ok("`duration` in the memory is refused HERE — the server's duration guard reads `row` only, so this "
    + "one would have come back as a knowledge refusal for a true claim",
  /duration/.test(bad({ duration: 1.5 })), bad({ duration: 1.5 }));
  ok("`entered_by` likewise", /entered_by/.test(bad({ entered_by: "admin" })));
  ok("`legacy` likewise", /legacy|not one of the ten keys/.test(bad({ legacy: true })));
  ok("a missing key is a partial memory, and refused", /missing/.test(bad(null, "mission")));

  /* THE ONE TRUE IN `prev` THAT IS NOT A FAULT */
  eq("ng:true is legal in a MEMORY — the bridge never writes one, but an adopted row is read back as it "
    + "actually stands", B.prevProblem(Object.assign({}, good, { ng: true })), "");

  /* AND IT IS NEVER REWRITTEN — the sentence says why, and names the way out */
  const why = bad({ seq: "2" });
  ok("the sentence names the cause: a tampered or hand-edited backup",
    /tampered or hand-edited backup/.test(why), why);
  ok("it says nothing was sent", /Nothing was sent/.test(why), why);
  ok("it refuses to forge the claim rather than «fixing» it",
    /repairing it here would forge that claim/.test(why), why);
  ok("and it sends the developer to Wings Ahead to re-anchor",
    /re-anchor the identity/.test(why), why);

  /* THE PLANNER TAKES IT OFF THE QUEUE — a held line, no wire call */
  const led = [{ rid: "S-9001 ∷ flights ∷ s:C4302 ∷ 1", oid: "S-9001", group: "flights",
    uid: "s:C4302", ord: 1, seq: 1, evId: "TV-P2", student: "ZZ-1", state: "pushed", hold: "",
    sent: Object.assign({}, good, { seq: "1", duration: 1.5, entered_by: "admin" }) }];
  const p = plan([ev({ id: "TV-P2", date: "2026-08-13" })], led);
  eq("a poisoned memory queues NOTHING", p.counts.queued, 0);
  eq("it is HELD, by name", p.counts.held, 1);
  eq("under a hold of its own", p.held[0].hold, "malformed");
  ok("carrying the sentence", /malformed/.test(p.held[0].note), p.held[0].note);

  /* THE SAME WALL AT THE SENDER, for the ops the planner did not build */
  const comp = { op: "upsert", section: "flights", rid: "r", prev: good,
    row: Object.assign({}, good, { kind: "banana" }), clear_tombstone: false };
  ok("a compensating op built from the CHANGE LOG is asked the same question",
    /the row this act would write is malformed/.test(B.opProblem(comp)), B.opProblem(comp));
  eq("a clean op passes both halves",
    B.opProblem({ op: "upsert", section: "flights", rid: "r", prev: null, row: good }), "");
  ok("and an upsert with no row at all is refused before it is sent",
    /carries none/.test(B.opProblem({ op: "upsert", rid: "r", prev: null, row: null })));
}

/* ══════════════════════════════════════════════════════════════════════════
   11j — ONE STUDENT WINGS AHEAD CANNOT RESOLVE HOLDS ONLY HIS OWN FLIGHTS
   ══════════════════════════════════════════════════════════════════════════
   The live proof of the failure: buckets = 30 students, the FIRST one carried
   an OID Wings Ahead does not know, the 400 was read as a transport failure,
   the loop broke, and a perfectly valid flight of a real active student in the
   LAST bucket was never sent — no ledger row, nothing. The backoff then retried
   the same first bucket for ever. Here is the ledger row that stops that. */
console.log("\n=== PROBE 11j — a held student, and everybody else crosses ===");
{
  const STU2 = { oid: "S-9002", code: "ZZ-2", first_name: "Second", last_name: "Nobody",
    class: "77TST-Z", status: "active" };
  const twoStudents = (ledger) => B.planPush({
    trainingLog: [ev({ id: "TV-J1", student: "ZZ-1" }), ev({ id: "TV-J2", student: "ZZ-2" })],
    students: [STU, STU2], instructors: [IP], bridgePush: ledger || [] }, { kindOf: kOf });

  const clean = twoStudents([]);
  eq("with nothing held, both students are owed", clean.counts.queued, 2);
  eq("and they are two calls, because bridge_push takes ONE student", clean.students.length, 2);

  const rid = B.ledStuRid("S-9002");
  eq("a student hold's identity has two segments where a row's has four", rid, "S-9002 ∷ (student)");
  const held = twoStudents([{ rid, scope: "student", oid: "S-9002", student: "ZZ-2", sent: null,
    state: "", hold: "student_oid", note: "no ACTIVE student carries the roster object id S-9002" }]);
  eq("the held student's flight comes OFF the queue", held.counts.queued, 1);
  eq("and the other student's flight is still owed — this is the whole finding",
    held.queued[0].line.student, "ZZ-1");
  eq("one call goes out, for the student who can receive it", held.students.length, 1);
  eq("the hold is listed, once, for the PERSON and not once per flight", held.counts.held, 1);
  eq("carrying the count of flights standing behind it", held.counts.heldFlights, 1);
  eq("the held line names the person, not a row", held.held[0].src, "student");
  ok("and prints the server's own sentence",
    /no ACTIVE student carries the roster object id/.test(held.held[0].note), held.held[0].note);
  eq("its flights are NOT counted as queued: they are owed and they are not going anywhere",
    held.counts.queued + held.counts.heldFlights, 2);

  /* A HOLD THAT HAS BEEN CLEARED IS NOT A HOLD */
  const cleared = twoStudents([{ rid, scope: "student", oid: "S-9002", student: "ZZ-2", sent: null,
    state: "", hold: "", note: "cleared by hand" }]);
  eq("clearing it puts his flights straight back in the queue", cleared.counts.queued, 2);

  /* AND IT IS NEVER MISTAKEN FOR AN IDENTITY */
  const withRow = twoStudents([{ rid, scope: "student", oid: "S-9002", student: "ZZ-2", sent: null,
    state: "", hold: "timeout", note: "canceling statement due to statement timeout" }]);
  eq("a timeout at the floor of one operation is the same shape of hold", withRow.counts.held, 1);
  ok("a student hold mints no ordinal and takes no sequence number: the surviving student's own "
    + "numbers are untouched by it",
  withRow.queued[0].op.rid === "S-9001 ∷ flights ∷ s:C4302 ∷ 1"
      && withRow.queued[0].op.row.seq === 1, JSON.stringify(withRow.queued[0].op));
  eq("and it is not a removal candidate either — it has no row to remove", withRow.counts.removals, 0);
}

/* ══════════════════════════════════════════════════════════════════════════
   11k — `missing`, RECONCILED AGAINST A READ INSTEAD OF CLEARED INTO A CREATE
   ══════════════════════════════════════════════════════════════════════════
   The duplicate the verify walked into: clear the hold, push, and because the
   ledger had forgotten the row the operation was a CREATE with `prev: null`.
   Wings Ahead answers `missing` for a DELETED row and for a MOVED one alike, so
   the client reads the record and offers what it found — and only that. */
console.log("\n=== PROBE 11k — adopt the row where it stands, or re-create it deliberately ===");
{
  const sent = { date: "2026-08-12", track: "contact", sortie: "C4302", seq: 1, kind: "syllabus",
    instructor: "AIRMAN", instructor_oid: "R-9001", grade: null, ng: false, mission: "complete" };
  const L = { rid: "S-9001 ∷ flights ∷ s:C4302 ∷ 1", oid: "S-9001", group: "flights", uid: "s:C4302",
    ord: 1, seq: 1, evId: "TV-K1", student: "ZZ-1", state: "", hold: "missing", sent };
  const wa = (rows) => ({ people: [{ id: "P-1", external_oid: "S-9001", role: "student", active: true }],
    records: [{ student_id: "P-1", data: { flights: rows } }] });
  const row = (o) => Object.assign({ sortie: "C4302", date: "2026-08-12", seq: 1, kind: "syllabus",
    track: "contact", instructor: "AIRMAN", instructor_oid: "R-9001", mission: "complete",
    entered_by: "fdms" }, o || {});

  /* NO READ IN MEMORY — and therefore no act that could create a second row */
  const blind = B.missingLook(L, null, [L]);
  ok("with no read of Wings Ahead in memory, nothing is offered", !blind.have && !blind.adopt);
  ok("and the sentence says why the ledger cannot answer it alone",
    /read Wings Ahead first/.test(blind.why), blind.why);

  /* THE MOVED CASE — one fdms row of that sortie, standing elsewhere */
  const moved = B.missingLook(L, wa([row({ date: "2026-08-19" })]), [L]);
  ok("a read that finds ONE bridge-written row for that flight offers the adoption", !!moved.adopt);
  eq("and it is the row as it ACTUALLY stands, date and all", moved.adopt.row.date, "2026-08-19");
  eq("read back into the ten keys of the wire",
    Object.keys(moved.adopt.row).sort().join(","), B.PUSH_ROW_KEYS.slice().sort().join(","));
  ok("naming the case in the developer's own terms", /MOVED case/.test(moved.why), moved.why);
  ok("and saying that adopting writes nothing to Wings Ahead",
    /Nothing is written to Wings Ahead by adopting/.test(moved.why), moved.why);

  /* THE DELETED CASE — nothing of ours anywhere on that record */
  const gone = B.missingLook(L, wa([]), [L]);
  eq("a read that finds nothing offers no adoption", gone.adopt, null);
  ok("and says the read CONFIRMS the deleted case", /DELETED case/.test(gone.why), gone.why);
  const humans = B.missingLook(L, wa([row({ date: "2026-08-19", entered_by: "" })]), [L]);
  eq("a row a human typed is never adopted — the bridge owns only its own rows",
    humans.adopt, null);
  eq("nor is a row of a different flight",
    B.missingLook(L, wa([row({ sortie: "C4303" })]), [L]).adopt, null);

  /* THE AMBIGUOUS CASE — two candidates is a question, not a tie-break */
  const two = B.missingLook(L, wa([row({ date: "2026-08-19" }), row({ date: "2026-08-20" })]), [L]);
  eq("two candidates adopt nothing", two.adopt, null);
  ok("and both are printed", /2026-08-19/.test(two.why) && /2026-08-20/.test(two.why), two.why);
  ok("saying it is a question for a human", /question for a human/.test(two.why), two.why);

  /* THE CLAIMED CASE — the worst outcome of all, refused */
  const other = { rid: "S-9001 ∷ flights ∷ s:C4302 ∷ 2", oid: "S-9001", group: "flights",
    sent: Object.assign({}, sent, { date: "2026-08-19", seq: 1 }) };
  const claimed = B.missingLook(L, wa([row({ date: "2026-08-19" })]), [L, other]);
  eq("a row ANOTHER identity of this ledger already answers for is never adopted",
    claimed.adopt, null);
  ok("because that would point two identities at one Wings Ahead row",
    /two identities at one Wings Ahead row/.test(claimed.why), claimed.why);

  /* THE SAME MACHINERY SERVES THE MALFORMED HOLD, and it reads the sortie from
     the IDENTITY rather than from the memory it cannot trust */
  const poisoned = Object.assign({}, L, { hold: "malformed",
    sent: Object.assign({}, sent, { seq: "1", sortie: 12345 }) });
  const rescue = B.missingLook(poisoned, wa([row({ date: "2026-08-19" })]), [poisoned]);
  ok("a malformed memory is still rescued — the uid names the sortie, and the uid never travelled",
    !!rescue.adopt, rescue.why);

  /* AND THE READ IS ASKED OF THE RIGHT PERSON AND THE RIGHT SECTION */
  eq("a read of a different Wings Ahead resolves nobody",
    B.missingLook(L, { people: [{ id: "P-9", external_oid: "S-0000", role: "student" }], records: [] },
      [L]).person, false);
  eq("and an F/S identity is never adopted out of the flights section",
    B.missingLook(Object.assign({}, L, { group: "fs" }), wa([row({ date: "2026-08-19" })]), [L]).adopt,
    null);
}

module.exports = true;
