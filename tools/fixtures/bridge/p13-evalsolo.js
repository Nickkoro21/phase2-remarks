"use strict";
/* PROBE 13 — PHASE 6α: THE CHECKRIDES AND THE SOLOS BECOME APPLIABLE (05/09/2026).

   The Flight Commander's ruling, verbatim: «checkrides and solos become
   appliable; FAIL / NFS / SMS / airsickness stay report-only». WA → FDMS only.

   What has to be proved here is NOT that two more groups can be written — that
   is one line in APPLY_GROUPS. It is that each of them is written HONESTLY:

     · a checkride names its EVALUATOR (ruling #4 — never a name), and a
       checkride stored as ΥΣΤΕΡΗΣΗ / ΑΠΟΤΥΧΙΑ says on the confirm line that it
       will make SchedPeople.avoidedIps() avoid that evaluator for this student
       afterwards, because that is a consequence of the click on next week's
       board and 13η's rule is that the dialog says it BEFORE;
     · an evaluator without the qualification is a WARNING and not a refusal —
       the record of who evaluated is a fact that already happened, and the
       Training log's own form treats it exactly this way (fail-12);
     · a solo names «SOLO» as its instructor, which is FDMS's own convention,
       and the AUTHORISING instructor is kept in the provenance and printed;
     · SOLO_NG_COMPLETES is the ONE assumption of this round and it is named,
       readable and printed on every line it decides;
     · and the three lines that are never written stay never-written for a
       checkride — `ng`, `awaiting`, a non-integer grade.

   The plans and the very RECORDS the store would get are driven here
   (SchedBridge.plannedEvent), never the store itself: § ② of schedbridge.js is
   the only caller of SchedStore and it is reached only from a [data-brgw]
   control past the edit lock. ALL NAMES FABRICATED. */
const fs = require("fs");
const path = require("path");
const H = require("./harness.js");
const { B, run, ok, eq, person, record, waExport, fdmsStudent, fdmsIp } = H;

const DAY = "2026-09-05";

/* the two instructors of this file, both invented. The surnames differ, so
   ruling #4's collision rule is not what any of these probes is about. */
const EVALUATOR = fdmsIp({ oid: "oid-ip-e1", code: "ZE-1", last_name: "Airman",
  first_name: "Imaginary", quals: { evaluator: true } });
const NOT_EVALUATOR = fdmsIp({ oid: "oid-ip-p1", code: "ZP-9", last_name: "Nonesuch",
  first_name: "Notional", quals: {} });

const base = (log, ips) => ({ students: [fdmsStudent({ oid: "oid-a1", last_name: "Alpha" })],
  instructors: ips || [EVALUATOR], trainingLog: log || [] });
const waRec = (data) => waExport([person({ oid: "oid-a1", last_name: "Alpha" })],
  [record("wa-oid-a1", data)], true);
const at = (r, uid) => r.rows.filter((x) => x.uid === uid);

/* a flown checkride and a flown solo, in the shapes wa.entry_keys() allows */
const CHK = (o) => waRec({ evaluations: [Object.assign({ date: "2026-09-01", evaluation: "C4590",
  with: "Airman", grade: 82 }, o)] });
const SOLO = (o) => waRec({ solo_flights: [Object.assign({ slot: "C", sortie: "C4303",
  date: "2026-09-02", instructor: "Airman", grade: 75 }, o)] });

console.log("\n=== PROBE 13a — THE SCOPE: two groups came in, and only those ===");
{
  eq("APPLY_GROUPS is flights, F/S, the checkrides and the solos",
    B.APPLY_GROUPS.join(","), "flights,fs,evaluations,solo_flights");
  /* THE OTHER HALF OF THE RULING. The push lane read APPLY_GROUPS while the two
     scopes happened to hold the same two words; growing the fill must never
     open the wire, so they are two lists now and this is where that is checked. */
  eq("PUSH_BANDS did NOT grow with it — § 15ι stays", B.PUSH_BANDS.join(","), "flights,fs");
  ok("and the two lists are genuinely different objects, not one name twice",
    B.PUSH_BANDS.join(",") !== B.APPLY_GROUPS.join(","), "the two scopes must differ");
  const bridge = fs.readFileSync(H.BRIDGE_SRC, "utf8");
  const push = bridge.slice(bridge.indexOf("function pushBlockWhy("), bridge.indexOf("function planPush("));
  ok("the push predicate asks PUSH_BANDS", push.indexOf("PUSH_BANDS.indexOf(band) < 0") >= 0, push.slice(0, 200));
  ok("and never TESTS the fill's scope again", push.indexOf("APPLY_GROUPS.indexOf") < 0,
    "the wire must not read the fill's scope");
}

console.log("\n=== PROBE 13b — A CHECKRIDE THAT PASSED: the plan and the record ===");
{
  const r = run(CHK(), base());
  const row = at(r, "s:C4590")[0];
  eq("the row is in the Evaluations group", row.group, "evaluations");
  eq("its class is wa_only", row.cls, "wa_only");
  eq("and it may be applied", row.plan.can, true);
  eq("as a CREATE", row.plan.act, "create");
  eq("82 ≥ 60 → completed", row.plan.result, "completed");
  eq("and it completes the node", row.plan.completes, true);
  eq("the evaluator was resolved to an FDMS CODE, never a name (ruling #4)", row.plan.ip, "ZE-1");
  ok("a qualified evaluator raises no warning", row.plan.warn.length === 0, JSON.stringify(row.plan.warn));
  const rec = B.plannedEvent(row.plan, null, DAY);
  eq("the id is the deterministic wa: handle, with the identity group in it",
    rec.id, "wa:OID-A1:evaluations:s:C4590:1");
  ok("THE DATE IS NOT IN THE ID", !/2026-09/.test(rec.id), rec.id);
  eq("origin marks it as the bridge's", rec.origin, "wa");
  eq("the row identity is § 2's, verbatim", rec.bridge.rid, "OID-A1 ∷ evaluations ∷ s:C4590 ∷ 1");
  eq("bridge.group keeps the IDENTITY group", rec.bridge.group, "evaluations");
  /* THE ONE THING A GROUP NAME MUST NOT BECOME. `kind` is what scheduler.js
     reads for the device and what SchedPeople.avoidedIps() filters on
     (`kind !== "flights" && kind !== "fs"` → skip): a checkride stamped
     «evaluations» would be invisible to the very engine that must avoid its
     evaluator. It is the BAND of the node, which is what the Training log's own
     form would have written for s:C4590. */
  eq("but the event's KIND is the BAND of the node", rec.kind, "flights");
  eq("and the device follows that band, exactly as the log form would", rec.device, "T-6A");
  eq("the evaluator is the FDMS code", rec.instructor, "ZE-1");
  eq("R2 — a checkride is NEVER stored as a score", rec.score, null);
  eq("and the number lives in the provenance instead", rec.bridge.src.grade, 82);
  eq("with the threshold it was judged by, frozen (ruling #6)", rec.bridge.src.thr, 60);
  eq("the student is named by CODE", rec.student, "ZZ-1");
  eq("scope student — anything else is invisible to Progress", rec.scope, "student");
  ok("the note says only where it came from", /^from Wings Ahead · bridge /.test(rec.note), rec.note);
}

console.log("\n=== PROBE 13c — A CHECKRIDE THAT DID NOT: and what it does to a PERSON ===");
{
  const lag = at(run(CHK({ grade: 55 }), base()), "s:C4590")[0].plan;
  eq("55 is ΥΣΤΕΡΗΣΗ", lag.result, "lag");
  eq("and the node stays owed", lag.completes, false);
  const bad = at(run(CHK({ grade: 45 }), base()), "s:C4590")[0].plan;
  eq("45 is ΑΠΟΤΥΧΙΑ", bad.result, "fail");
  eq("and the node stays owed", bad.completes, false);
  /* 13η — THE DIALOG STATES THE EFFECT BEFORE THE WRITE, and for a checkride the
     effect is not only on the node. This is the sentence the round exists to
     make sure a developer reads before he clicks. */
  [["lag", lag], ["fail", bad]].forEach(([w, p]) => {
    ok("the " + w + " line says it MOVES A PERSON", /AND IT MOVES A PERSON/.test(p.effect), p.effect);
    ok("it names the engine that will do the avoiding",
      /SchedPeople\.avoidedIps\(\)/.test(p.effect), p.effect);
    ok("and it names the evaluator it will avoid", /ZE-1/.test(p.effect), p.effect);
    ok("with the regulation the rule comes from", /3-01 §24στ\(6\)/.test(p.effect), p.effect);
  });
  ok("a PASS says nothing of the kind — there is nothing to avoid",
    !/MOVES A PERSON/.test(at(run(CHK(), base()), "s:C4590")[0].plan.effect));
  /* AND IT PROMISES NO WINDOW THE ENGINE DOES NOT KEEP (verify F7). avoidedIps()
     builds a FLAT per-student avoid list — the date survives only inside the
     reason string — and every consumer reads it through avoidMap(), which is
     not date-scoped either. «from this date on» was a limit the code does not
     enforce, so the sentence says «on every board» instead. */
  ok("and it does NOT promise a date window", !/from this date on/.test(lag.effect), lag.effect);
  ok("it says the avoid holds on EVERY board", /ON EVERY BOARD/.test(lag.effect), lag.effect);
  /* THE MECHANICAL TIE — the claim «a lag/fail checkride avoids its evaluator»
     is a claim about app/scheduler.js, so it is read THERE and not asserted
     from memory (the same discipline as probe 9h). */
  const sched = fs.readFileSync(path.resolve(__dirname, "..", "..", "..", "app", "scheduler.js"), "utf8");
  ok("scheduler.js avoids the instructor of a negatively graded checkride",
    /d && d\.checkride && isNeg\(ev\)\) add\(ev\.instructor, "graded FAIL on checkride/.test(sched));
  ok("and isNeg is lag / fail / repeat — the three words a lag or a fail is stored as",
    /r === "lag" \|\| r === "fail" \|\| r === "repeat"/.test(sched));
  ok("the avoid list is flat — no date filter anywhere on it",
    /const avoidedAll = |function avoidedAll\(code\)/.test(sched) && !/avoid.*\.filter\(.*date/.test(sched));
  /* WHY `kind` MUST BE THE BAND — READ AT THE CONSUMER THAT ACTUALLY READS IT
     (verify F4). It is NOT avoidedIps(): that engine computes the kind of a
     NON-special event from the graph (`ev.special ? ev.kind : R().kindOf(…)`),
     so a checkride stamped «evaluations» would have reached it anyway. The
     consumer that reads `ev.kind` straight off the stored event is
     schedboard.js's pre-solo check, which counts the different instructors a
     student has already flown with. And the rule the field obeys is «write what
     the Training log's own form would have written», which is read here too. */
  const board = fs.readFileSync(path.resolve(__dirname, "..", "..", "..", "app", "schedboard.js"), "utf8")
    .replace(/\s+/g, " ");
  ok("schedboard.js reads ev.kind off the stored training-log event (max-4-IPs before the first solo)",
    board.indexOf('ev.kind === "flights" && ev.instructor && ev.instructor !== SOLO) seen.add(ev.instructor);') >= 0,
    "the pre-solo instructor count is the consumer of a bridge-written event's kind");
  ok("and the Training log's own form stamps the GRAPH's band, which is what this bridge mirrors",
    /const kind = isNfs \? "nfs" : \(spKey \? "flights" : R\(\)\.kindOf\(f\.node\)\);/.test(sched)
      && /if \(!f\.device && kind\) f\.device = DEVICE_BY_KIND\[kind\];/.test(sched));
  ok("while avoidedIps() computes a NON-special event's kind from the graph, never from the field",
    /const kind = ev\.special \? \(ev\.kind \|\| "flights"\) : R\(\)\.kindOf\(ev\.node \|\| ev\.uid \|\| ""\);/.test(sched),
    "the round's WHY must name a consumer that really reads ev.kind");
}

console.log("\n=== PROBE 13d — AN EVALUATOR WITHOUT THE QUAL: a warning, never a refusal ===");
{
  const row = at(run(CHK({ with: "Nonesuch" }), base(null, [NOT_EVALUATOR])), "s:C4590")[0];
  eq("the line IS appliable — the record of who evaluated already happened", row.plan.can, true);
  eq("and it writes his code", row.plan.ip, "ZP-9");
  eq("exactly one warning rides with it", row.plan.warn.length, 1);
  ok("which names the person", /Nonesuch/.test(row.plan.warn[0]), row.plan.warn[0]);
  ok("says he is not evaluator-qualified", /NOT evaluator-qualified/.test(row.plan.warn[0]), row.plan.warn[0]);
  ok("in the Training log's own words (fail-12)", /fail-12/.test(row.plan.warn[0]), row.plan.warn[0]);
  ok("and says out loud that it is recorded, not refused",
    /recorded, not refused/.test(row.plan.warn[0]), row.plan.warn[0]);
  /* the same fact, one seam over: the pane must be able to PRINT it */
  const bridge = fs.readFileSync(H.BRIDGE_SRC, "utf8");
  ok("the confirm dialog renders every warning of a line",
    /arr\(p\.warn\)\.map\(/.test(bridge), "planLine must print p.warn");
}

console.log("\n=== PROBE 13e — THE EVALUATOR THAT DOES NOT RESOLVE: refused, ruling #4 ===");
{
  const row = at(run(CHK({ with: "Nobodyhere" }), base()), "s:C4590")[0];
  eq("the row is still reported", row.cls, "wa_only");
  eq("and it is NOT appliable", row.plan.can, false);
  ok("the reason is ruling #4 — an identity is never guessed from a name",
    /never written with an identity guessed from a name \(ruling #4\)/.test(row.plan.why), row.plan.why);
  ok("and it says what that identity IS on a checkride",
    /that identity is the EVALUATOR/.test(row.plan.why), row.plan.why);
  /* THE MODULE NAME IS PINNED, NOT ONLY THE FUNCTION (verify F3). This sentence
     is not a comment — it is the text a developer reads under «not appliable»
     on every checkride whose evaluator does not resolve, and it named
     `SchedReady.avoidedIps()`, which does not exist: avoidedIps is exported on
     window.SchedPeople. A regex over the bare function name passed either way. */
  ok("naming the engine that will read it afterwards, with the module it really lives on",
    /SchedPeople\.avoidedIps\(\)/.test(row.plan.why), row.plan.why);
  ok("and never the module it does not", !/SchedReady\.avoidedIps/.test(row.plan.why), row.plan.why);
  eq("nothing in that report is appliable", run(CHK({ with: "Nobodyhere" }), base()).counts.appliable, 0);
}

console.log("\n=== PROBE 13f — THE THREE LINES THAT ARE STILL NEVER WRITTEN (13ζ) ===");
{
  const aw = at(run(CHK({ grade: null }), base()), "s:C4590")[0];
  eq("an awaiting checkride is reported", aw.cls, "wa_only");
  eq("and not appliable (ruling #5)", aw.plan.can, false);
  ok("because FDMS reads a blank result as COMPLETED", /COMPLETED/.test(aw.plan.why), aw.plan.why);
  ok("and the row says so on its face", /awaiting a grade/.test(aw.detail), aw.detail);

  const ng = at(run(CHK({ grade: null, ng: true }), base()), "s:C4590")[0];
  eq("an NG checkride is reported", ng.cls, "wa_only");
  eq("and not appliable — the solo rule is for SOLOS only", ng.plan.can, false);
  ok("with the 13ζ sentence, unchanged", /no word for/.test(ng.plan.why), ng.plan.why);
  eq("it wears the NON-GRADED badge", ng.nonGraded, true);
  eq("and it completes nothing", ng.completes, false);

  const ni = at(run(CHK({ grade: 82.5 }), base()), "s:C4590")[0];
  eq("a non-integer grade is class `unwritten`", ni.cls, "unwritten");
  eq("and carries no plan at all", ni.plan, null);
  eq("the writer refuses it a second time whatever the group",
    B.resultFor("evaluations", { source: "grade", grade: 82.5, nonInt: true, thr: 60 }), "");
}

console.log("\n=== PROBE 13g — A CHECKRIDE THE SYLLABUS GRAPH DOES NOT CARRY ===");
{
  /* C5090 is one of the eight checkride codes and the harness graph has never
     heard of it — a retired code, or a syllabus this store has not loaded. The
     four seams of 13δ answer it exactly as they answer an unknown sortie. */
  const r = run(CHK({ evaluation: "C5090" }), base());
  const row = at(r, "s:C5090")[0];
  eq("its class is `refused`", row.cls, "refused");
  eq("a refused row carries NO plan at all", row.plan, null);
  ok("the sentence names the code", row.refused.indexOf("C5090") >= 0, row.refused);
  ok("and says the FDMS syllabus graph does not carry it",
    /not in the FDMS syllabus graph/.test(row.refused), row.refused);
  eq("it completes nothing, because there is no node to complete", row.completes, false);
  ok("and the Effect column says exactly that", /no node/.test(row.effect), row.effect);
  eq("nothing in that report is appliable", r.counts.appliable, 0);
}

console.log("\n=== PROBE 13h — A GRADED SOLO: «SOLO» in the seat, the authoriser in the provenance ===");
{
  const r = run(SOLO(), base());
  const row = at(r, "s:C4303")[0];
  eq("the row is in the Solo flights group", row.group, "solo_flights");
  eq("its class is wa_only", row.cls, "wa_only");
  eq("and it may be applied", row.plan.can, true);
  eq("75 ≥ 60 → completed", row.plan.result, "completed");
  eq("FDMS's own convention goes in the instructor field", row.plan.ip, "SOLO");
  eq("and the constant is read from FDMS, not invented here", B.SOLO_IP, "SOLO");
  ok("the confirm line names who AUTHORISED the flight",
    row.plan.authorisedBy.indexOf("ZE-1") >= 0, row.plan.authorisedBy);
  const rec = B.plannedEvent(row.plan, null, DAY);
  eq("the event names SOLO", rec.instructor, "SOLO");
  eq("and the authorising instructor is kept in the provenance", rec.bridge.src.instructor, "Airman");
  eq("the id carries the identity group", rec.id, "wa:OID-A1:solo_flights:s:C4303:1");
  eq("bridge.group keeps it too", rec.bridge.group, "solo_flights");
  eq("while the event's kind is the node's BAND", rec.kind, "flights");
  eq("and the device is the aircraft", rec.device, "T-6A");
  /* THE MECHANICAL TIE — «SOLO» is not a word this file made up: two engines
     read it, and both are read here rather than trusted. */
  const board = fs.readFileSync(path.resolve(__dirname, "..", "..", "..", "app", "schedboard.js"), "utf8");
  ok("schedboard.js declares SOLO as the instructor-less line",
    /const SOLO = "SOLO";/.test(board) && /const isSolo = \(l\) => l && l\.ip === SOLO;/.test(board));
  const sched = fs.readFileSync(path.resolve(__dirname, "..", "..", "..", "app", "scheduler.js"), "utf8");
  ok("and avoidedIps() skips exactly that reference, so a solo avoids nobody",
    /if \(!ref \|\| ref === "SOLO"\) return;/.test(sched));
}

console.log("\n=== PROBE 13i — A NON-GRADED SOLO: the ONE place `ng` completes a node ===");
{
  const r = run(SOLO({ grade: null, ng: true }), base());
  const row = at(r, "s:C4303")[0];
  eq("SOLO_NG_COMPLETES is the named assumption of this round", B.SOLO_NG_COMPLETES, true);
  eq("the line may be applied", row.plan.can, true);
  eq("and the word written is «completed»", row.plan.result, "completed");
  eq("so the node IS completed", row.plan.completes, true);
  eq("the seat is still SOLO", row.plan.ip, "SOLO");
  /* AND THE REPORT SAYS THE SAME THING AS THE WRITER. Slice 1b's finding F1 was
     a badge saying «never completes a node» on a row whose Effect column said
     «completes the node»; an NG solo is the one row that is non-graded AND
     completes, so it must wear neither the badge nor the word. */
  eq("the row does NOT wear the NON-GRADED badge", row.nonGraded, false);
  eq("its Effect column agrees with the plan", row.completes, true);
  ok("and names what it is", /flown solo/.test(row.effect), row.effect);
  /* AND THE TABLE ACTUALLY PRINTS THAT STRING (verify F5). It did not: the
     Effect cell derived a phrase of its own from `completes` and never read
     `x.effect`, so this word — and Phase 3b's «no node — …» — were computed and
     thrown away. A fixture that pins a field the report never shows proves
     nothing, so the renderer is read here too. */
  const src = fs.readFileSync(H.BRIDGE_SRC, "utf8");
  ok("the Effect cell renders the row's own effect sentence",
    /\$\{esc\(x\.effect\b/.test(src),
    "rowHtml must print x.effect, not re-derive a phrase from x.completes");
  ok("with the completion phrase only as a fallback",
    /x\.completes \? "completes the node" : "does not complete the node"\)\)/.test(src), "fallback missing");
  ok("and it never re-derives the cell from x.completes alone again",
    !/>\$\{esc\(x\.completes \?/.test(src), "the Effect cell must read the engine's answer");
  ok("the row says the doctrine out loud", /DOES complete the node/.test(row.detail), row.detail);
  /* THE ASSUMPTION IS PRINTED ON EVERY LINE IT DECIDES, in the dialog, before
     the confirm — because it is an assumption and not a ruling. */
  eq("exactly one warning rides with it", row.plan.warn.length, 1);
  ok("and it is the sentence the round owes the Flight Commander",
    /NG solo — COMPLETES the node \(solo doctrine, pending confirmation\)/.test(row.plan.warn[0]),
    row.plan.warn[0]);
  ok("which names the spec section that records it as OPEN",
    /§ 16/.test(row.plan.warn[0]), row.plan.warn[0]);
  const rec = B.plannedEvent(row.plan, null, DAY);
  eq("the stored result is the word", rec.result, "completed");
  eq("and no number rides with it (R2)", rec.score, null);
  eq("the provenance remembers that Wings Ahead said NG", rec.bridge.src.ng, true);
  eq("with no grade, because a solo carries none by nature", rec.bridge.src.grade, null);
  eq("and the authorising instructor, whom NG never removes", rec.bridge.src.instructor, "Airman");
  /* re-read: the doctrine is read on BOTH sides, or every applied NG solo would
     read `payload_differs` for ever against the event the bridge itself wrote */
  const back = at(run(SOLO({ grade: null, ng: true }), base([rec])), "s:C4303")[0];
  eq("re-loaded, the same row is agree", back.cls, "agree");
  eq("and it still completes the node", back.completes, true);
  eq("nothing is appliable any more", run(SOLO({ grade: null, ng: true }), base([rec])).counts.appliable, 0);
  /* and NG stays welded shut everywhere else */
  eq("resultFor opens for a solo", B.resultFor("solo_flights", { source: "ng" }), "completed");
  eq("and for nothing else", B.resultFor("flights", { source: "ng" }), "");
  eq("nor for a checkride", B.resultFor("evaluations", { source: "ng" }), "");
  eq("the bare resultOf is untouched — a judgement has no group", B.resultOf({ source: "ng" }), "");
}

console.log("\n=== PROBE 13j — AN UNFLOWN SOLO SLOT IS A PLACEHOLDER, not a line ===");
{
  /* the fixed slots of the syllabus are present from day one and empty until
     they are flown (WA round 5 · wa.slot_empty). A slot with no date is nothing
     to apply and nothing to report — it is a position, not an entry.
     AND «EMPTY» IS wa.slot_empty()'S OWN TEST (verify F6): the slot key is
     present and EVERYTHING that would say a flight happened is absent — date,
     grade, instructor, SORTIE, DURATION, ng. */
  const r = run(waRec({ solo_flights: [{ slot: "C" }] }), base());
  eq("no row at all is produced for the empty slot",
    r.rows.filter((x) => x.sec === "solo_flights").length, 0);
  eq("and nothing anywhere in that report is appliable", r.counts.appliable, 0);
  eq("the same is true of an evaluation slot nobody has flown",
    run(waRec({ evaluations: [{ evaluation: "C4790" }] }), base()).rows.filter((x) => x.uid === "s:C4790").length, 0);
  /* AND A ROW THAT NAMES A SORTIE IS FLOWN — NOT AN EMPTY SLOT. Wings Ahead
     would refuse it on save (no date, no instructor); this side used to DROP it
     silently, which is the same lie as a clean-looking empty report. It is seen
     instead, with its reasons, and it carries no plan. */
  const named = at(run(waRec({ solo_flights: [{ slot: "C", sortie: "C4304" }] }), base()), "s:C4304");
  eq("a slot that NAMES a sortie is reported, never dropped", named.length, 1);
  eq("as class `unwritten` — Wings Ahead could not have written it", named[0].cls, "unwritten");
  eq("and it carries no plan at all", named[0].plan, null);
  ok("the reasons name the missing date", named[0].problems.some((s) => /no valid date/.test(s)),
    JSON.stringify(named[0].problems));
  ok("and the missing authorising instructor",
    named[0].problems.some((s) => /never launches alone on their own authority/.test(s)),
    JSON.stringify(named[0].problems));
  /* the same for a row carrying only a duration — a duration is a report about
     a flight that happened, so the slot is no longer empty (wa.slot_empty) */
  eq("a solo slot carrying only a DURATION is not an empty slot either",
    run(waRec({ solo_flights: [{ slot: "C", sortie: "C4304", duration: 1.2 }] }), base())
      .rows.filter((x) => x.uid === "s:C4304").length, 1);
  /* a slot-LESS solo is the «additional solo» escape hatch of the WA validator,
     and it follows exactly the same path as a slotted one. */
  const add = at(run(waRec({ solo_flights: [{ sortie: "C4304", date: "2026-09-03",
    instructor: "Airman", grade: 70 }] }), base()), "s:C4304")[0];
  eq("a slot-less additional solo is an ordinary appliable line", add.plan.can, true);
  eq("with the same instructor convention", add.plan.ip, "SOLO");
  eq("and the same identity shape", add.rid, "OID-A1 ∷ solo_flights ∷ s:C4304 ∷ 1");
}

console.log("\n=== PROBE 13p — A FLOWN SOLO WITH NOBODY'S SIGNATURE ON IT (verify F1) ===");
{
  /* THE ROW THAT WOULD HAVE WRITTEN AWAY THE ONE FACT THIS ROUND KEEPS. A solo
     with a date and a grade but NO instructor came out appliable, wrote «SOLO»
     into the seat and carried an EMPTY bridge.src.instructor — so the confirm
     dialog printed no «authorised by …» line at all, and § 16γ's whole promise
     («the AUTHORISING instructor is kept and printed») was silently void on
     exactly the row where it mattered. It could never have come out of Wings
     Ahead either: wa.chk demands the name on EVERY flown solo, NG included. */
  const bare = at(run(waRec({ solo_flights: [{ slot: "C", sortie: "C4303",
    date: "2026-09-02", grade: 75 }] }), base()), "s:C4303");
  eq("the row is SEEN, not dropped", bare.length, 1);
  eq("its class is `unwritten` — Wings Ahead could not have written it", bare[0].cls, "unwritten");
  eq("and it carries NO plan, so it can never reach the checkbox", bare[0].plan, null);
  ok("the sentence is the squadron's own, and it names Wings Ahead's rule",
    bare[0].problems.some((s) => /never launches alone on their own authority/.test(s)
      && /every FLOWN solo row, NG included/.test(s)), JSON.stringify(bare[0].problems));
  eq("nothing in that report is appliable", run(waRec({ solo_flights: [{ slot: "C", sortie: "C4303",
    date: "2026-09-02", grade: 75 }] }), base()).counts.appliable, 0);
  /* the same for an NG solo — NG removes the grade, never the person */
  const ngBare = at(run(waRec({ solo_flights: [{ slot: "C", sortie: "C4303",
    date: "2026-09-02", ng: true }] }), base()), "s:C4303");
  eq("an NG solo with no authoriser is `unwritten` too", ngBare[0].cls, "unwritten");
  eq("and SOLO_NG_COMPLETES does not open a door for it", ngBare[0].plan, null);
  /* and the row that DOES name one is untouched by this clause */
  eq("a solo that names its authoriser is appliable exactly as before",
    at(run(SOLO(), base()), "s:C4303")[0].plan.can, true);
  ok("with the name kept and printed", at(run(SOLO(), base()), "s:C4303")[0].plan.authorisedBy
    .indexOf("ZE-1") >= 0);
  /* the mirrored rule is Wings Ahead's `wa.chk` (db/schema.sql) — it is NOT read
     from here: these fixtures are repo-relative by rule (harness.js § BRIDGE_SRC)
     so that any clone can re-run the number, and the WA repo is not in this one.
     What is pinned here is that OUR side quotes it and refuses on it. */
}

console.log("\n=== PROBE 13k — APPLIED TWICE IS ONE EVENT; A MOVED DATE MOVES IT ===");
{
  [["a checkride", CHK, "s:C4590"], ["a solo", SOLO, "s:C4303"]].forEach(([what, mk, uid]) => {
    const r1 = run(mk(), base());
    const rec = B.plannedEvent(at(r1, uid)[0].plan, null, DAY);
    eq(what + " — the handle is deterministic",
      B.plannedEvent(at(r1, uid)[0].plan, null, DAY).id, rec.id);
    const r2 = run(mk(), base([rec]));
    const rows = at(r2, uid);
    eq(what + " — still exactly ONE row, no duplicate", rows.length, 1);
    eq(what + " — and it reads agree", rows[0].cls, "agree");
    eq(what + " — an agree row offers no plan", rows[0].plan, null);
    eq(what + " — nothing is appliable any more", r2.counts.appliable, 0);
    eq(what + " — no fdms_only was invented", r2.counts.byClass.fdms_only, 0);
    eq(what + " — the event is recognised as the bridge's", B.isWaWritten(rec), true);
    /* the moved date: ONE deviation, one event, never a delete plus an add */
    const r3 = run(mk({ date: "2026-09-09" }), base([rec]));
    const m = at(r3, uid);
    eq(what + " — a corrected date is ONE row", m.length, 1);
    eq(what + " — of class source_moved", m[0].cls, "source_moved");
    eq(what + " — the act is an UPDATE", m[0].plan.act, "update");
    eq(what + " — naming the date and its provenance twin, nothing else",
      m[0].plan.fields.map((f) => f.field).join(","), "date,bridge.src.date");
    ok(what + " — and saying the node effect does not move",
      /does not change/.test(m[0].plan.effect), m[0].plan.effect);
    eq(what + " — no second event is minted", r3.counts.byClass.wa_only, 0);
    eq(what + " — and nothing is orphaned", r3.counts.byClass.deleted + r3.counts.byClass.fdms_only, 0);
  });
}

console.log("\n=== PROBE 13q — THE SORTIE RE-FILED IN THE OTHER SECTION (verify F2) ===");
{
  /* THE ONE ROW THAT MUST NOT BECOME TWO. Moving a sortie between the
     `solo_flights` and the `flights` sections of the student's record is an
     ordinary operator correction on the Wings Ahead side — and the bridge has
     already WRITTEN an event for it under the old section. `groupOfNode()` now
     reads that event's own `bridge.group`, so it must read it LAST: asked
     first, a stored group beat the live Wings Ahead row that claims the same
     node, and one flight split into a `deleted` in the old group plus a fresh
     `wa_only` in the new one — a delete plus an add, offering a SECOND FDMS
     event for the same flight, the same node and the same date. § 2 forbids
     that by name, and on a FAIL SchedConsq.counters() would count it twice. */
  const SORTIE = "s:C4303";
  const asSolo = () => waRec({ solo_flights: [{ slot: "C", sortie: "C4303", date: "2026-09-02",
    instructor: "Airman", grade: 75 }] });
  const asFlight = () => waRec({ flights: [{ sortie: "C4303", date: "2026-09-02",
    instructor: "Airman", grade: 75 }] });

  [["a solo re-filed as a flight", asSolo, asFlight, "solo_flights"],
    ["a flight re-filed as a solo", asFlight, asSolo, "flights"]].forEach(([what, was, now, grp]) => {
    const rec = B.plannedEvent(at(run(was(), base()), SORTIE)[0].plan, null, DAY);
    eq(what + " — the bridge wrote it under the OLD group", rec.bridge.group, grp);
    const r = run(now(), base([rec]));
    const rows = at(r, SORTIE);
    eq(what + " — the sortie is EXACTLY ONE row", rows.length, 1);
    eq(what + " — and no tombstone is asked for", r.counts.byClass.deleted, 0);
    eq(what + " — nothing was orphaned", r.counts.byClass.fdms_only, 0);
    eq(what + " — and NO second event is offered", r.counts.byClass.wa_only, 0);
    /* whatever the one row proposes, it proposes it ONTO THE EVENT THAT EXISTS */
    if (rows[0].plan) {
      eq(what + " — any plan targets the event already written", rows[0].plan.evId, rec.id);
      ok(what + " — and it is never a create", rows[0].plan.act !== "create", rows[0].plan.act);
    }
  });
  /* AND THE FALLBACK STILL DOES ITS OWN JOB. A bridge-written solo whose Wings
     Ahead row has VANISHED has nobody claiming the node, so the event's own
     `bridge.group` answers and it is listed under Solo flights instead of
     Flights. The CLASS was never the group's business — `deleted` comes from
     `waWritten` — so what this fixes is the heading and the report rid. */
  const gone = B.plannedEvent(at(run(asSolo(), base()), SORTIE)[0].plan, null, DAY);
  const g = run(waRec({ solo_flights: [] }), base([gone])).rows.filter((x) => x.uid === SORTIE);
  eq("a vanished solo is one row", g.length, 1);
  eq("listed under Solo flights, not Flights", g[0].group, "solo_flights");
  eq("with a solo-shaped row identity", g[0].rid, "OID-A1 ∷ solo_flights ∷ s:C4303 ∷ 1");
  eq("and the class is the one waWritten decides", g[0].cls, "deleted");
}

console.log("\n=== PROBE 13l — ↺ UNDO: the store comes back byte for byte ===");
{
  /* undoEntry() is deliberately NOT on the public surface — it touches the
     store — so what is driven here is the STORE STATE its two halves produce:
     a create appends exactly the planned record, and its undo removes exactly
     that id (SchedStore.remove). A hand-typed event sits beside it, so
     «byte for byte» means something: the undo must not touch it. */
  const typed = { id: "TV-HAND-1", scope: "student", student: "ZZ-1", node: "s:C4302",
    date: "2026-08-01", result: "completed", instructor: "ZE-1", device: "T-6A",
    kind: "flights", absent: [] };
  [["a checkride", CHK, "s:C4590"], ["a solo", SOLO, "s:C4303"]].forEach(([what, mk, uid]) => {
    const before = JSON.stringify([typed]);
    const rec = B.plannedEvent(at(run(mk(), base([typed])), uid)[0].plan, null, DAY);
    const afterCreate = [typed, rec];
    eq(what + " — with the event, the line is agree", at(run(mk(), base(afterCreate)), uid)[0].cls, "agree");
    const afterUndo = afterCreate.filter((e) => e.id !== rec.id);
    eq(what + " — the undo leaves the training log byte for byte as it was",
      JSON.stringify(afterUndo), before);
    const back = at(run(mk(), base(afterUndo)), uid)[0];
    eq(what + " — the row is wa_only again", back.cls, "wa_only");
    eq(what + " — and appliable again", back.plan.can, true);
    eq(what + " — with nothing orphaned behind it",
      run(mk(), base(afterUndo)).counts.byClass.deleted, 0);
  });
}

console.log("\n=== PROBE 13m — THE DRIFT AT SOURCE, for each of the two ===");
{
  /* a checkride whose grade the student corrected downwards: the verdict moves,
     and the adoption says what the new verdict does to the PERSON as well. */
  const rec = B.plannedEvent(at(run(CHK(), base()), "s:C4590")[0].plan, null, DAY);
  const row = at(run(CHK({ grade: 45 }), base([rec])), "s:C4590")[0];
  eq("the class is payload_differs against the bridge's own event", row.cls, "payload_differs");
  eq("the act is an ADOPTION", row.plan.act, "adopt");
  eq("it writes the new result and refreshes the remembered grade",
    row.plan.fields.map((f) => f.field).join(","), "result,bridge.src.grade");
  eq("the node stops being complete", row.plan.completes, false);
  ok("and the adoption ALSO says it moves a person",
    /AND IT MOVES A PERSON/.test(row.plan.effect), row.plan.effect);

  /* a solo whose AUTHORISING instructor changed. The event names «SOLO» either
     way, so this is a provenance change and nothing else — and it must not be
     reported as «two sides disagree about who flew». */
  const srec = B.plannedEvent(at(run(SOLO(), base()), "s:C4303")[0].plan, null, DAY);
  const two = { students: [fdmsStudent({ oid: "oid-a1" })],
    instructors: [EVALUATOR, fdmsIp({ oid: "oid-ip-g1", code: "ZG-1", last_name: "Ghostly" })],
    trainingLog: [srec] };
  const s = at(run(SOLO({ instructor: "Ghostly" }), two), "s:C4303")[0];
  eq("the class is payload_differs", s.cls, "payload_differs");
  const d = s.diffs.find((x) => x.field === "instructor");
  ok("the difference names both authorising names", !!d && d.wa === "Ghostly" && d.fdms === "Airman",
    JSON.stringify(s.diffs));
  ok("and says the event names SOLO either way",
    /names «SOLO» either way/.test(d.why), d.why);
  eq("the adoption writes the PROVENANCE and never the seat",
    s.plan.fields.map((f) => f.field).join(","), "bridge.src.instructor");
  ok("no field of the event itself is touched",
    !s.plan.fields.some((f) => f.field === "instructor"), JSON.stringify(s.plan.fields));

  /* and the same solo, re-read unchanged, is silent: «SOLO» beside «Airman» is
     two true statements about two different facts, not a deviation. */
  const same = at(run(SOLO(), base([srec])), "s:C4303")[0];
  eq("an unchanged solo re-reads as agree", same.cls, "agree");
  eq("with no instructor difference invented", same.diffs.length, 0);
}

console.log("\n=== PROBE 13n — WHAT STILL DOES NOT CROSS TO WINGS AHEAD (§ 15ι) ===");
{
  /* the ruling was about the FILL. An event this bridge wrote for a checkride
     or a solo is refused by the echo rule before any scope question — and that
     is the loop-breaker, not a scope decision, so it is checked as such. */
  const ctx = { kindOf: H.kindOf };
  const chk = B.plannedEvent(at(run(CHK(), base()), "s:C4590")[0].plan, null, DAY);
  const solo = B.plannedEvent(at(run(SOLO(), base()), "s:C4303")[0].plan, null, DAY);
  ok("a bridge-written checkride never pushes back",
    /written BY the bridge/.test(B.pushBlockOf(chk, ctx)), B.pushBlockOf(chk, ctx));
  ok("nor a bridge-written solo",
    /written BY the bridge/.test(B.pushBlockOf(solo, ctx)), B.pushBlockOf(solo, ctx));
  /* a checkride somebody TYPED in the Training log is refused too, by the
     clause that owns that fact: it lives in the Evaluations section over there. */
  const typedChk = { id: "TV-9", scope: "student", student: "ZZ-1", node: "s:C4590",
    kind: "flights", date: "2026-09-01", result: "completed", instructor: "ZE-1" };
  ok("and a hand-typed checkride is refused by the clause that owns that fact",
    /lives in the Evaluations section/.test(B.pushBlockOf(typedChk, ctx)), B.pushBlockOf(typedChk, ctx));
  /* AND THE BAND CLAUSE ITSELF, reached the only way it can be: a graph that
     answers something other than flights / fs about a node an event names.
     This is the clause that used to read APPLY_GROUPS, and the sentence it
     carries is what a developer will read after the 05/09 ruling. */
  const ground = { kindOf: (u) => (u === "s:C4302" ? "lessons" : H.kindOf(u)) };
  const strayEv = { id: "TV-8", scope: "student", student: "ZZ-1", node: "s:C4302",
    kind: "flights", date: "2026-09-01", result: "completed", instructor: "ZE-1" };
  ok("a node the graph does not call a flight is refused by the band clause",
    /this lane pushes FLIGHTS and F\/S only/.test(B.pushBlockOf(strayEv, ground)),
    B.pushBlockOf(strayEv, ground));
  ok("and the sentence says the 05/09 ruling did not open this direction",
    /did not open this direction/.test(B.pushBlockOf(strayEv, ground)),
    B.pushBlockOf(strayEv, ground));
}

console.log("\n=== PROBE 13o — THE FOUR SEAMS AND THE LOCK ARE THE SAME ONES ===");
{
  /* the round added two groups and NO new door. These are read out of the live
     file so that a later edit cannot open one quietly. */
  const bridge = fs.readFileSync(H.BRIDGE_SRC, "utf8");
  ok("the write controls still carry [data-brgw]", bridge.indexOf('data-brgw="apply"') >= 0);
  const store = fs.readFileSync(path.resolve(__dirname, "..", "..", "..", "app", "schedstore.js"), "utf8");
  const nav = store.slice(store.indexOf("const NAV = ["), store.indexOf("].join(\",\")"));
  ok("and are still absent from SchedStore's NAV list", nav.indexOf('"[data-brgw]"') < 0);
  ok("the writer still asks the LIVE graph last",
    /R\(\)\.kindOf\(nodeOfUid\(p\.uid\)\)/.test(bridge));
  ok("and hands that live band to the record it writes",
    /applyCreate\(p, band\)/.test(bridge), "seam ④ must decide the kind too");
  eq("applyPlan is still not exported", typeof B.applyPlan, "undefined");
  eq("undoEntry is still not exported", typeof B.undoEntry, "undefined");
  eq("but the pure planner is", typeof B.plannedEvent, "function");
  ok("there is still no background poller", !/setInterval/.test(bridge));
  ok("and still no download of a report full of real names",
    bridge.indexOf("createObjectURL") < 0 && !/\.download\s*=/.test(bridge));
  /* the assumption must be readable, or a later round could flip it in silence */
  ok("SOLO_NG_COMPLETES is a named constant with the pending-confirmation words on it",
    /const SOLO_NG_COMPLETES = true;/.test(bridge)
      && /AN ASSUMPTION AWAITING THE OWNER'S CONFIRMATION/.test(bridge));
}

module.exports = true;
