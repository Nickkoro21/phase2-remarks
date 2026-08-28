"use strict";
/* PROBE 12 — PHASE 4/5: ↺ UNDO ACROSS THE WIRE, AND THE TWO DRIFT REFUSALS.
   Phase 3's undo could take a write back because everything it had written was
   in this store. A push wrote on the OTHER side, so its undo has to answer a
   question Phase 3 never had to ask: is the row over there still the one this
   act left standing? Three guards answer it, and this probe drives all three:

     1 · THIS STORE'S LEDGER — has a later push already moved the row? Then the
         undo of the earlier act would take back somebody else's write, and it
         refuses by name rather than guessing which one the developer meant.
     2 · THE WIRE — the compensating operation's `prev` is exactly what this
         entry LEFT the row at, so the deployed side compares it fact for fact
         and answers exists_student / exists_admin / exists_fdms if a human has
         touched the row since. Nothing is written; it is a report line.
     3 · THE TOMBSTONE — an undone CREATE owes a removal, and the tombstone is
         what makes the undo stick against an automatic lane that would
         otherwise re-create the row one debounce later.

   And the shape of what a compensation IS: undo of a created push is a REMOVAL,
   undo of a moved/updated push is an UPSERT restoring the earlier row, undo of a
   push-remove puts the identity back in the pending state and re-pushing it is
   the explicit clear_tombstone act. ALL NAMES FABRICATED. */
const H = require("./harness.js");
const { B, ok, eq } = H;

const ROW_A = { date: "2026-08-12", track: "contact", sortie: "C4302", seq: 1, kind: "syllabus",
  instructor: "AIRMAN", instructor_oid: "R-9001", grade: null, ng: false, mission: "complete" };
const ROW_B = Object.assign({}, ROW_A, { date: "2026-08-14" });
const ROW_C = Object.assign({}, ROW_A, { date: "2026-08-19" });
const RID = "S-9001 ∷ flights ∷ s:C4302 ∷ 1";

const logEntry = (o) => Object.assign({
  id: "BL-1", act: "push", rid: RID, oid: "S-9001", group: "flights", uid: "s:C4302",
  ord: 1, seq: 1, student: "ZZ-1", evId: "TV-1", date: "2026-08-28",
  waHandle: "flights ∷ C4302 ∷ 2026-08-12 ∷ 1", verdict: "created",
  waBefore: null, waAfter: ROW_A, undone: false,
}, o);
const led = (o) => Object.assign({ rid: RID, oid: "S-9001", group: "flights", uid: "s:C4302",
  ord: 1, seq: 1, evId: "TV-1", student: "ZZ-1", sent: ROW_A, state: "pushed", hold: "" }, o);

console.log("\n=== PROBE 12a — undoing a CREATED push owes a REMOVAL, never a silent delete ===");
{
  const r = B.undoPushPlan(logEntry({}), led());
  eq("the undo is accepted", r.ok, true);
  eq("and what it owes is a REMOVAL, waiting on a confirm", r.pending, "removal");
  eq("the ledger goes to «undone» — the state the planner turns into that removal",
    r.ledger.state, "undone");
  ok("it says the removal is pending and nothing has crossed",
    /waiting in Pending removals/.test(r.ledger.note), r.ledger.note);
  ok("the effect sentence names the tombstone as what makes the undo STICK",
    /tombstones\s+the identity so the queue cannot re-create it/.test(r.effect), r.effect);
  ok("every field it took back rides INSIDE the entry (the 13γ law)",
    r.fields.length === Object.keys(ROW_A).filter((k) => ROW_A[k] !== null).length,
    JSON.stringify(r.fields.map((f) => f.field)));
  ok("each one named with its wa. prefix, so it can never be mistaken for an FDMS field",
    r.fields.every((f) => f.field.indexOf("wa.") === 0), JSON.stringify(r.fields[0]));
}

console.log("\n=== PROBE 12b — DRIFT GUARD 1: a later push refuses the earlier undo ===");
{
  /* the row was pushed, then pushed AGAIN (a date fix). The ledger now holds
     ROW_B; the first entry left ROW_A. Undoing the FIRST act would remove a row
     it did not create. */
  const r = B.undoPushPlan(logEntry({}), led({ sent: ROW_B }));
  eq("the undo REFUSES", r.ok, false);
  ok("naming the drift, and telling the developer which act to undo first",
    /changed after that push/.test(r.why) && /Undo the later\s+act first/.test(r.why), r.why);
  ok("and it produces no ledger patch at all — nothing is written",
    r.ledger === undefined, JSON.stringify(r.ledger));

  const gone = B.undoPushPlan(logEntry({}), led({ state: "removed" }));
  eq("an already-removed identity refuses too", gone.ok, false);
  ok("saying the tombstone is already lying on it",
    /tombstone lies on the identity/.test(gone.why), gone.why);

  const orphan = B.undoPushPlan(logEntry({}), null);
  eq("and an act whose ledger row is gone refuses rather than guessing", orphan.ok, false);
  ok("in so many words", /an\s+undo that guesses is worse than no undo/.test(orphan.why), orphan.why);
}

console.log("\n=== PROBE 12c — undoing a MOVED / UPDATED push is a compensating upsert ===");
{
  const moved = logEntry({ id: "BL-2", verdict: "moved", waBefore: ROW_A, waAfter: ROW_B });
  const r = B.undoPushPlan(moved, led({ sent: ROW_B }));
  eq("accepted, because the ledger still holds what that act left", r.ok, true);
  eq("what it owes is a COMPENSATION, not a removal", r.pending, "compensate");
  eq("and the identity is HELD while it waits", r.ledger.hold, "compensate");
  ok("held ON PURPOSE: the FDMS event still says the new value, so an unheld "
    + "identity would be re-pushed immediately and the undo would not stick",
  /the queue leaves the\s+identity alone/.test(r.ledger.note), r.ledger.note);
  ok("the effect sentence promises the server's own guard as well",
    /refuses it outright if a human has touched the row since/.test(r.effect), r.effect);
  const dates = r.fields.filter((f) => f.field === "wa.date");
  eq("exactly one field moved, and it is the date", r.fields.length, 1);
  eq("back from the pushed date to the one before it",
    dates[0].from + "→" + dates[0].to, "2026-08-14→2026-08-12");

  /* DRIFT GUARD 1 on this shape too */
  const drift = B.undoPushPlan(moved, led({ sent: ROW_C }));
  eq("a third push since refuses the compensation", drift.ok, false);
  ok("and points at the cross-check report, where the two versions meet",
    /where the two versions meet/.test(drift.why), drift.why);

  const noBefore = B.undoPushPlan(logEntry({ verdict: "updated", waBefore: null, waAfter: ROW_A }),
    led());
  eq("an entry that recorded no BEFORE cannot restore one", noBefore.ok, false);
  ok("and says exactly that", /nothing to restore it to/.test(noBefore.why), noBefore.why);
}

console.log("\n=== PROBE 12d — undoing a PUSH-REMOVE puts the identity back in PENDING ===");
{
  const rm = logEntry({ id: "BL-3", act: "push-remove", verdict: "removed",
    waBefore: ROW_A, waAfter: null });
  const r = B.undoPushPlan(rm, led({ state: "removed", sent: ROW_A }));
  eq("accepted", r.ok, true);
  eq("and the identity goes back to PENDING, not straight back onto the wire", r.pending, "repush");
  eq("its state is cleared", r.ledger.state, "");
  eq("its remembered row is dropped — the next push is a CREATE", r.ledger.sent, null);
  eq("and it carries clear_tombstone for that push", r.ledger.clearTomb, true);
  eq("held until a human asks for it", r.ledger.hold, "reopened");
  ok("the effect says the re-push is the explicit act (13γ: an undo never offers its own ↺)",
    /re-pushing it is the explicit act that clears the tombstone/.test(r.effect), r.effect);
}

console.log("\n=== PROBE 12e — DRIFT GUARD 2: the compensating op's own shape ===");
{
  /* The op a held «compensate» identity owes is built from the change log's two
     halves. What must be true of it is the deployed wire's own rule: the `prev`
     it carries is the row as the bridge LAST WROTE IT — which is exactly what
     the server compares fact for fact. */
  const before = ROW_A, after = ROW_B;
  const opPrev = after, opRow = before;
  ok("the compensation's `prev` is what the push LEFT standing", opPrev === after);
  ok("and its `row` is what stood there before", opRow === before);
  ok("both are whole rows, in the ten keys this lane owns",
    Object.keys(opPrev).sort().join(",") === B.PUSH_ROW_KEYS.slice().sort().join(",")
      && Object.keys(opRow).sort().join(",") === B.PUSH_ROW_KEYS.slice().sort().join(","));
  ok("so a row a human touched since answers exists_student and writes NOTHING",
    B.foldVerdict({ verdict: "exists_student", row: { grade: 71 } },
      { op: { op: "upsert", prev: opPrev, row: opRow }, line: { rid: RID, oid: "S-9001",
        group: "flights", uid: "s:C4302", ord: 1, seq: 1, evId: "TV-1", student: "ZZ-1" } }).hold
      === "student");

  /* and the handle a human reads over there */
  eq("the far side's handle is printed, never sent", B.waHandleOf("flights", ROW_A),
    "flights ∷ C4302 ∷ 2026-08-12 ∷ 1");
  eq("rowFields names every field that moved, and only those",
    B.rowFields(ROW_A, ROW_B).map((f) => f.field).join(","), "wa.date");
  eq("a create names every field it wrote", B.rowFields(null, ROW_A).length,
    Object.keys(ROW_A).filter((k) => ROW_A[k] !== null).length);
  eq("and a false is printed as «false», never swallowed as empty",
    B.rowFields(null, ROW_A).filter((f) => f.field === "wa.ng")[0].to, "false");
}

module.exports = true;
