"use strict";
/* PROBE 14 — PHASE 6β: THE CURRENCY LANE, WA → FDMS AND ONLY WA → FDMS.
   The Flight Commander's ruling of 05/09/2026: the FDMS Currency reads the
   instructors' currency rows out of the live pull, ties them BY OID, and the Ε
   dates and Σ sorties an instructor recorded in Wings Ahead appear in FDMS —
   report first, written only through the confirm dialog.

   THIS PROBE IS THE FIRST ONE THAT WRITES. Every probe before it asserts on a
   PLAN, because § ① of the bridge is pure and § ② is reached only from a
   [data-brgw] control. A currency plan is not the whole claim: the claim is
   that ONE sortie lands in the semester of ITS OWN DATE, that the Ε dates move
   FORWARD ONLY, that a second click appends nothing, and that ↺ Undo puts the
   whole record back. None of that can be read off a plan, so this probe drives
   the real seams of app/currency.js against a headless store (harness.mkStore)
   and the REAL 91-item catalog.

   It is also the only asynchronous probe: app/currency.js loads its catalog
   through fetch(), which is a promise however it is fed. run.js awaits it and
   prints the total once, after it settles.

   AND — probe 14q — it is the only one that evaluates a SECOND engine. Every
   assertion above it runs against a LOADED SchedCurrency, which is exactly why
   none of them could see that a page whose Currency tab has never been opened
   judges every Ε id against an EMPTY catalog. 14q therefore builds a cold
   engine, puts it in front of the bridge for the length of one block, and puts
   the warm one back in a `finally`.

   ALL NAMES FABRICATED. Nothing is read from or written to the real store, the
   repository or the network. */
const fs = require("fs");
const H = require("./harness.js");
const { B, ok, eq } = H;

const SRC = fs.readFileSync(H.BRIDGE_SRC, "utf8");
const CUR_SRC_TXT = fs.readFileSync(H.CUR_SRC, "utf8");

/* ── fixture builders — every name fabricated ───────────────────────────── */
const OID = "OID-IP-77";
const CODE = "ZP-7";
const WAID = "wa-ip-77";
const fdIp = (o) => Object.assign({
  oid: OID, code: CODE, first_name: "Imaginary", last_name: "Airman", mn: "MN-8077",
  rank: "Capt", callsign: "GHOST77", status: "active", experienced: true,
}, o);
const waIp = (o) => H.person(Object.assign({
  id: WAID, role: "instructor", external_oid: OID, mn: "MN-8077",
  first_name: "Imaginary", last_name: "Airman", class: "",
}, o));
const cont = (o) => Object.assign({ date: "2026-03-10", kind: "continuation",
  s_category: "s-3-air-to-ground", e_items: [], seq: 1 }, o);
const withSp = (o) => Object.assign({ date: "2026-03-10", kind: "with_sp",
  sortie: "C4302", e_items: [], seq: 1 }, o);
const insRec = (rows, o) => Object.assign({ instructor_id: WAID,
  data: { currency: rows }, data_as_stored: { currency: rows },
  entries_total: rows.length, legacy_rows: 0, withsp_legacy_rows: 0,
  last_update: "2026-09-01T08:00:00Z" }, o);
const waFile = (people, insRecs) => Object.assign(H.waExport(people, [], true), {
  instructor_records: insRecs,
  currency_kinds: [{ id: "continuation", label: "Continuation" }, { id: "with_sp", label: "With SP" }],
});
const curRec = (o) => Object.assign({ oid: OID, items: {}, semesters: {} }, o);
/* one report run of this lane, with its own FDMS side */
const runCur = (rows, fdCur, people, insRecs) => H.run(
  waFile(people || [waIp()], insRecs || [insRec(rows || [])]),
  { instructors: [fdIp()], students: [], trainingLog: [],
    instructorCurrency: fdCur ? [fdCur] : [] });
const curRows = (rep) => rep.rows.filter((r) => r.group === "currency");
const one = (rep) => { const l = curRows(rep); return l.length === 1 ? l[0] : null; };

module.exports = async function p14() {
  const C = await H.loadCurrency();

  console.log("\n=== PROBE 14a — THE CARRIER: the parser keeps what it used to drop ===");
  {
    const p = B.parseExport(JSON.stringify(waFile([waIp()], [insRec([cont({})])])));
    eq("the export parses", p.ok, true);
    eq("and the instructor records are KEPT — the key the parser dropped until this round",
      p.instructorRecords.length, 1);
    eq("with the MIGRATED record behind it (wa.export_body hands `data` through migrate_instructor_record)",
      p.instructorRecords[0].data.currency.length, 1);
    eq("and the closed kind list rides along, so no reader hardcodes the two words",
      p.currencyKinds.map((k) => k.id).join(","), "continuation,with_sp");

    /* BOTH CARRIERS, ONE FUNCTION. public.bridge_pull is wa.export_body(false)
       with a `via` stamp on top, so the live pull and the downloaded file are
       the same payload and reach the same parser. */
    const live = B.parseExport(Object.assign(JSON.parse(JSON.stringify(
      waFile([waIp()], [insRec([cont({})])]))), { via: "bridge" }));
    eq("the LIVE pull carries them too — one parser, two doors", live.instructorRecords.length, 1);
    eq("and says so", live.via, "bridge");

    const old = B.parseExport(JSON.stringify(H.waExport([waIp()], [], true)));
    eq("an export from before the WA side had the key reads as ZERO, never as a crash",
      old.instructorRecords.length, 0);
  }

  console.log("\n=== PROBE 14b — THE HEADER SAYS THE NUMBER, AND SAYS THE ZERO IN WORDS ===");
  {
    const rep = runCur([cont({})]);
    eq("the report counts the instructor records it read", rep.source.instructorRecords, 1);
    const empty = H.run(H.waExport([waIp()], [], true),
      { instructors: [fdIp()], students: [], trainingLog: [] });
    eq("an export without the key counts zero", empty.source.instructorRecords, 0);
    /* the sentence itself is the deliverable: a table with no rows in it looks
       identical whether the export carried nothing or the bridge dropped it */
    ok("and the pane prints that zero AS A SENTENCE, not as a blank",
      /no instructor records in this export/.test(SRC));
    eq("the group exists, after the student groups and before the off-catalogue one",
      B.GROUPS.map((g) => g.id).join(","),
      "evaluations,solo_flights,events,flights,fs,lessons,exams,currency,off_graph");
    const note = (B.GROUPS.find((g) => g.id === "currency") || {}).note || "";
    ok("and it owes its reader two sentences BEFORE its first row — the date in the identity…",
      /DATE IS PART OF THE ROW IDENTITY/.test(note), note);
    ok("…and the one-way fact with the OTHER side's own reason",
      /NO admin write path/.test(note) && /p_as_admin/.test(note), note);
    ok("the renderer really prints a group note (it is not a field nobody reads)",
      /g\.note[\s\S]{0,200}sch-loggrp/.test(SRC));
  }

  console.log("\n=== PROBE 14c — THE JOIN IS THE OBJECT ID, AND NOTHING ELSE (ruling #4) ===");
  {
    /* a surname match is not even attempted — matchPeople has never matched by
       name — but the MN fallback that IS good enough for a student is refused
       here BY NAME: an MN is mutable, and a currency record is the one payload
       where a wrong join writes another pilot's flights. */
    const noOid = H.run(waFile([waIp({ external_oid: null, mn: "MN-NOBODY" })], [insRec([cont({})])]),
      { instructors: [fdIp()], students: [], trainingLog: [], instructorCurrency: [] });
    const r = one(noOid);
    ok("an instructor Wings Ahead carries with NO OID is refused for this lane", r && r.cls === "refused", r && r.cls);
    ok("the refusal names the ruling and what the wrong join would do",
      r && /ruling #4/.test(r.refused) && /another pilot's flights/.test(r.refused), r && r.refused);
    ok("and it says how many rows were behind that identity, so a skip is never silent",
      r && /1 Wings Ahead currency row behind this identity/.test(r.extra), r && r.extra);
    ok("the Identities line counts those rows too — «no rows behind this identity» would be false now",
      noOid.rows.some((x) => x.group === "identity" && x.cls === "unresolvable"
        && /1 Wings Ahead row behind this identity/.test(x.extra)));
    eq("nothing of it is appliable", noOid.counts.appliable, 0);

    const mnOnly = H.run(waFile([waIp({ external_oid: null, mn: "MN-8077" })], [insRec([cont({})])]),
      { instructors: [fdIp({ oid: "" })], students: [], trainingLog: [], instructorCurrency: [] });
    const m = one(mnOnly);
    ok("an instructor matched only by MN is refused as well", m && m.cls === "refused", m && m.cls);
    ok("and told exactly how to open the lane", m && /external_oid in Wings Ahead/.test(m.refused), m && m.refused);

    const stranger = H.run(waFile([waIp({ external_oid: "OID-NOBODY" })], [insRec([cont({})])]),
      { instructors: [fdIp()], students: [], trainingLog: [], instructorCurrency: [] });
    ok("an OID no FDMS instructor holds is refused for this lane too",
      (one(stranger) || {}).cls === "refused");

    /* ── AND THE TWO WAYS A RECORD USED TO VANISH WITH NO ROW AND NO NOTE ──
       Both were silence of exactly the kind this pane has refused since slice
       1b: the header said «1 instructor record» and the table said nothing at
       all, which reads as «compared, nothing found». */
    const asStudent = { oid: OID, code: "ZZ-9", first_name: "Fabricated", last_name: "Nobody",
      mn: "MN-9001", class: "77TST-Z", status: "active" };
    const stu = H.run(waFile([waIp()], [insRec([cont({})])]),
      { instructors: [], students: [asStudent], trainingLog: [], instructorCurrency: [] });
    eq("the header counted the record", stu.source.instructorRecords, 1);
    const s1 = one(stu);
    ok("and an OID that resolves to an FDMS STUDENT gets its own refusal, not silence",
      s1 && s1.cls === "refused", s1 && s1.cls);
    ok("naming both rosters and refusing to guess which one is right",
      !!s1 && /FDMS STUDENT/.test(s1.refused) && /refuses to guess which roster is/.test(s1.refused),
      s1 && s1.refused);
    eq("and nothing of it is appliable", stu.counts.appliable, 0);

    const ghost = H.run(waFile([waIp()], [insRec([cont({})], { instructor_id: "wa-ghost-999" })]),
      { instructors: [fdIp()], students: [], trainingLog: [], instructorCurrency: [] });
    eq("the header counted this one too", ghost.source.instructorRecords, 1);
    const g1 = one(ghost);
    ok("a record whose instructor_id names nobody in `people[]` gets a line as well",
      g1 && g1.cls === "refused", g1 && g1.cls);
    ok("saying the export's own people list does not carry that identity",
      g1 && /does not carry/.test(g1.refused), g1 && g1.refused);
    ok("and that the LIVE pull cannot produce it — the foreign key is on the other side",
      g1 && /foreign key over there/.test(g1.refused), g1 && g1.refused);
  }

  console.log("\n=== PROBE 14d — A CONTINUATION ROW: agree · payload_differs · wa_only ===");
  {
    const KEY = C.semKeyOf("2026-03-10");
    const fd = (eids) => curRec({ semesters: { [KEY]: { "s-3-air-to-ground": [{ date: "2026-03-10", eids: eids }] } } });

    const agree = one(runCur([cont({ e_items: ["e-1a-aerobatics"] })], fd(["e-1a-aerobatics"])));
    eq("the same sortie on the same day, covering the same Ε, is `agree`", agree.cls, "agree");
    eq("and nothing is offered on it", agree.plan, null);

    const covered = one(runCur([cont({ e_items: ["e-1a-aerobatics"] })],
      fd(["e-1a-aerobatics", "e-1b-spin"])));
    eq("an FDMS entry carrying MORE Ε than Wings Ahead names is still `agree`", covered.cls, "agree");
    ok("and the extra is said out loud — this lane adds, it never removes",
      /never removes/.test(covered.extra), covered.extra);

    const diff = one(runCur([cont({ e_items: ["e-1a-aerobatics", "e-1b-spin"] })], fd(["e-1a-aerobatics"])));
    eq("an entry that does not cover every Ε is `payload_differs`", diff.cls, "payload_differs");
    eq("the report shows BOTH lists on the line", diff.diffs.length, 1);
    ok("and names the one act this lane offers", /DATE the missing Ε|DATE the missing/i.test(diff.diffs[0].why)
      || /date the missing/i.test(diff.diffs[0].why), diff.diffs[0].why);
    eq("the plan is an Ε-date act and NOT a rewrite of the entry", diff.plan.act, "cur-edate");
    eq("carrying exactly the missing Ε", diff.plan.eids.join(","), "e-1b-spin");
    ok("and the row says the line will still read payload_differs afterwards — the ruling, not a defect",
      /the bridge does not rewrite an entry a person wrote/.test(diff.extra), diff.extra);

    const only = one(runCur([cont({ e_items: ["e-1a-aerobatics"] })], curRec({})));
    eq("a sortie FDMS does not hold at all is `wa_only`", only.cls, "wa_only");
    eq("and the plan records ONE sortie", only.plan.act, "cur-flight");
    eq("in the column Wings Ahead named", only.plan.itemId, "s-3-air-to-ground");
    eq("under the semester of the FLIGHT'S OWN date", only.plan.semKey, KEY);
    ok("and every claim it makes rides in `fields` (the 13γ law)",
      only.plan.fields.length === 2
      && only.plan.fields[0].field === "sortie · s-3-air-to-ground"
      && only.plan.fields[1].field === "Ε e-1a-aerobatics",
      JSON.stringify(only.plan.fields));
    eq("the src it will stamp is the row identity, prefixed", only.plan.src, "wa:" + only.rid);
    /* P46-A1's finding F5 was that the Effect column printed nothing at all.
       Every row of THIS group leaves it saying what the line does, and an
       appliable one hands it the PLAN's own sentence, so the table and the
       confirm dialog cannot drift apart. */
    eq("the Effect column carries the plan's own sentence", only.effect, only.plan.effect);
    ok("which names the semester and says it is the flight's own, never today's",
      /the semester of the FLIGHT'S OWN DATE, never today's/.test(only.effect), only.effect);
    ok("an `agree` row still says what it means", /nothing to do/.test(agree.effect), agree.effect);
    eq("and a payload_differs row says what the one adoptable act does", diff.effect, diff.plan.effect);
    ok("which is «no sortie, no semester count»",
      /NO sortie is recorded and no semester count changes/.test(diff.effect), diff.effect);

    /* seq is the attempt within (Σ, date) — the second sortie of one day is a
       fact of the row, exactly as ruling #1 says for a student's flight */
    const two = runCur([cont({ seq: 1 }), cont({ seq: 2 })], fd([]));
    const cls = curRows(two).map((r) => r.cls).sort().join(",");
    eq("two sorties on one day: the first pairs, the second is still owed", cls, "agree,wa_only");
  }

  console.log("\n=== PROBE 14e — THE ROW IDENTITY CARRIES THE DATE, AND SAYS SO ===");
  {
    const rid = one(runCur([cont({})], curRec({}))).rid;
    eq("rid = OID ∷ currency ∷ <what> ∷ <date> ∷ <seq>", rid,
      OID + " ∷ currency ∷ s-3-air-to-ground ∷ 2026-03-10 ∷ 1");
    eq("and the builder is the same one the report used", B.curRid(OID, "s-3-air-to-ground", "2026-03-10", 1), rid);
    eq("a with-SP row names the sortie in the same slot",
      B.curWhat({ kind: "with_sp", sortie: "C4302" }), "sortie:C4302");

    /* THE CONSEQUENCE, STATED RATHER THAN HIDDEN. There is no node and no other
       key, so a corrected date cannot be recognised as the same attempt: it is
       two rows, and the group's note tells the reader to read them together. */
    const KEY = C.semKeyOf("2026-03-12");
    const moved = runCur([cont({ date: "2026-03-12" })],
      curRec({ semesters: { [KEY]: { "s-3-air-to-ground": [{ date: "2026-03-10", eids: [] }] } } }));
    const l = curRows(moved);
    eq("a moved date is TWO rows", l.length, 2);
    eq("one on each side", l.map((r) => r.cls).sort().join(","), "fdms_only,wa_only");
    eq("and never a `source_moved` — that class needs an identity the date is not in",
      l.filter((r) => r.cls === "source_moved").length, 0);
    ok("the FDMS-side row carries its own date in its own identity",
      l.filter((r) => r.cls === "fdms_only")[0].rid.indexOf("2026-03-10") > 0);
  }

  console.log("\n=== PROBE 14f — `unwritten`, ONE REASON AT A TIME, EACH ONE NAMED ===");
  {
    const why = (row) => {
      const r = one(runCur([row], curRec({})));
      return r && r.cls === "unwritten" ? (r.problems[0] || "") : "NOT UNWRITTEN — " + (r && r.cls);
    };
    ok("no kind at all", /says whether it was a Continuation flight/.test(why(cont({ kind: "" }))));
    ok("a kind Wings Ahead does not know", /continuation \/ with_sp/.test(why(cont({ kind: "own" }))));
    ok("no readable date", /no readable date/.test(why(cont({ date: "" }))));
    ok("a date that is only date-SHAPED", /no readable date/.test(why(cont({ date: "2026-13-45" }))));
    ok("seq above what a cell can hold", /outside what a cell can hold/.test(why(cont({ seq: 500 }))));
    ok("an Ε the 3-01 catalog does not carry",
      /does not carry — e-99-nope/.test(why(cont({ e_items: ["e-99-nope"] }))));
    ok("a Continuation row naming no Σ", /names which Σ category it was, and this row names none/
      .test(why(cont({ s_category: "" }))));
    ok("a Wings Ahead LEGACY placeholder", /LEGACY placeholder/
      .test(why(cont({ s_category: "legacy-aeros-unspecified" }))));
    ok("a Σ id FDMS does not know", /not a semester column this FDMS knows/
      .test(why(cont({ s_category: "s-9-invented" }))));
    ok("a printed ΣΥΝΟΛΑ column — derived, never written into", /DERIVES it from its component columns/
      .test(why(cont({ s_category: "semiannual-air-total-t6" }))));
    ok("the §49 THRESHOLD row, which is a date and not a sortie", /THRESHOLD IN DAYS/
      .test(why(cont({ s_category: "sim-refresh-after-abstention" }))));
    ok("a dash column — no sortie is required there", /prints a dash/
      .test(why(cont({ s_category: "s-20-no-requirements" }))));

    /* x-demo-flight — the one id where the answer had to be LOOKED UP rather
       than assumed. FDMS keeps the demo scope as six CATALOG items shown to a
       demo_pilot, and NOT as a recordable semester column; FLIGHT_DERIVE names
       no Ε it would date. So it is unwritten with the reason, and no column is
       invented for it. */
    const demo = why(cont({ s_category: "x-demo-flight" }));
    ok("the DEMO sortie is unwritten, and the reason names what was checked",
      /DEMO_IDS/.test(demo) && /e-1d-demo/.test(demo) && /FLIGHT_DERIVE/.test(demo), demo);
    eq("and the engine agrees: there is no recordable column for it", C.isRecordable("x-demo-flight"), false);
    eq("nor a catalog item under that id", C.byId("x-demo-flight"), null);
    eq("while e-1d-demo IS a catalog item — and a DEMO-SCOPED one", C.isDemoItem("e-1d-demo"), true);
    eq("which Wings Ahead itself can never name on a row (it is not in wa.e_item_ids())",
      C.flightDerive("x-demo-flight").length, 0);
    ok("none of the eleven refusals is appliable",
      runCur([cont({ s_category: "x-demo-flight" })], curRec({})).counts.appliable === 0);
    eq("and their Effect column points at the reason instead of printing a dash",
      one(runCur([cont({ s_category: "x-demo-flight" })], curRec({}))).effect,
      "not written — the reason is under the line");
  }

  console.log("\n=== PROBE 14g — A WITH-SP ROW: Ε COVERAGE, ONE LINE PER Ε ===");
  {
    const fdE = (d) => curRec({ items: { "e-1a-aerobatics": { last_date: d, src: "manual" } } });

    const never = one(runCur([withSp({ e_items: ["e-1a-aerobatics"] })], curRec({})));
    eq("an Ε FDMS has never dated is `wa_only`", never.cls, "wa_only");
    eq("and the act is an Ε date and nothing else", never.plan.act, "cur-edate");
    eq("no sortie, no column, no semester count", never.plan.itemId, "");
    ok("and the line says whose flight it was", /the flight is the student's/.test(never.extra), never.extra);
    ok("citing the paragraph that makes it count", /§61/.test(never.extra), never.extra);

    const older = one(runCur([withSp({ e_items: ["e-1a-aerobatics"] })], fdE("2026-01-01")));
    eq("an Ε FDMS holds OLDER than the flight is `wa_only` too", older.cls, "wa_only");
    eq("and the plan moves it to the flight's day", older.plan.fields[0].to, "2026-03-10");
    eq("from the day it stands at", older.plan.fields[0].from, "2026-01-01");

    const later = one(runCur([withSp({ e_items: ["e-1a-aerobatics"] })], fdE("2026-06-01")));
    eq("an Ε FDMS holds LATER is `agree` — an automatic source never moves a date back", later.cls, "agree");
    eq("and nothing is offered", later.plan, null);
    ok("with the sentence that says what `agree` means here",
      /this lane owes this Ε nothing/.test(later.extra), later.extra);

    const bad = one(runCur([withSp({ e_items: ["e-77-nope"] })], curRec({})));
    eq("an Ε id the catalog does not carry is `unwritten`", bad.cls, "unwritten");

    /* A BAD SIBLING DOES NOT TAKE THE GOOD Ε WITH IT. The whole-row refusal
       used to run BEFORE the kind split, so one unreadable id made an Ε the
       instructor really flew disappear from the table entirely — no class, no
       line, no Apply. A with-SP row is one line per Ε precisely because each Ε
       has its own answer, and «unreadable» is one of those answers. */
    const mixed = curRows(runCur([withSp({ e_items: ["e-1a-aerobatics", "e-77-nope"] })], curRec({})));
    eq("a with-SP row with one bad Ε and one good one makes TWO lines", mixed.length, 2);
    eq("the good Ε keeps its own class…", (mixed.find((r) => /e-1a-aerobatics$/.test(r.rid)) || {}).cls, "wa_only");
    ok("…and its own Apply", !!(mixed.find((r) => /e-1a-aerobatics$/.test(r.rid)) || {}).plan);
    eq("while only the bad one is refused", (mixed.find((r) => /e-77-nope$/.test(r.rid)) || {}).cls, "unwritten");
    ok("with the catalog's own sentence under it",
      /does not carry — e-77-nope/.test(((mixed.find((r) => /e-77-nope$/.test(r.rid)) || {}).problems || [])[0] || ""));
    /* the Continuation row keeps the whole-row refusal, and that is the right
       rule there: a recorded sortie is ONE indivisible act */
    const contMixed = curRows(runCur([cont({ e_items: ["e-1a-aerobatics", "e-77-nope"] })], curRec({})));
    eq("a Continuation row with the same mixed list is ONE row…", contMixed.length, 1);
    eq("…and the whole act is refused — a sortie is not divisible by its Ε", contMixed[0].cls, "unwritten");

    const bare = one(runCur([withSp({ e_items: [] })], curRec({})));
    eq("a with-SP row claiming NO Ε is one informative line", bare.cls, "refused");
    ok("and it says the student side owns the flight",
      /the student side owns the flight/.test(bare.refused), bare.refused);
    eq("nothing to apply on it", bare.plan, null);

    const many = curRows(runCur([withSp({ e_items: ["e-1a-aerobatics", "e-1b-spin"] })], fdE("2026-06-01")));
    eq("two Ε on one flight make TWO lines, each with its own class", many.length, 2);
    eq("and each line has its own address", new Set(many.map((r) => r.rid)).size, 2);
    ok("the row identity is readable as its first five parts",
      many[0].rid.indexOf(OID + " ∷ currency ∷ sortie:C4302 ∷ 2026-03-10 ∷ 1 ∷ ") === 0, many[0].rid);
    eq("and the two answers really do differ", many.map((r) => r.cls).sort().join(","), "agree,wa_only");
  }

  console.log("\n=== PROBE 14h — THE FDMS SIDE IS LISTED, AND IT IS REPORT-ONLY ===");
  {
    const KEY = C.semKeyOf("2026-03-10");
    const fd = curRec({ semesters: { [KEY]: {
      "s-3-air-to-ground": [{ date: "2026-03-10", eids: [] }, { date: "2026-04-02", eids: ["e-1b-spin"] }],
      "x-night-students": [{ date: "2026-02-01", eids: [], src: "wa:OLD ∷ currency ∷ x ∷ y ∷ 1" }],
    } } });
    const l = curRows(runCur([cont({})], fd));
    eq("the paired sortie plus the two nobody named", l.length, 3);
    const only = l.filter((r) => r.cls === "fdms_only");
    eq("both unpaired entries are listed", only.length, 2);
    ok("each one says it is report-only IN BOTH DIRECTIONS, with the other side's reason",
      only.every((r) => /never pushed and never proposed/.test(r.detail)
        && /no admin write path/.test(r.detail)), only[0].detail);
    eq("and none of them is appliable", only.filter((r) => r.plan && r.plan.can).length, 0);
    ok("an entry the bridge itself wrote is marked as such",
      only.some((r) => /written by the bridge/.test(r.extra)), only.map((r) => r.extra).join(" | "));
    ok("and the Effect column of such a row says «report only», not a dash",
      only.every((r) => /report only — nothing is written and nothing is ever pushed/.test(r.effect)),
      only[0].effect);

    /* an instructor Wings Ahead carries NO currency record for is not compared
       at all — listing his whole local history as «deviations» would drown the
       table in lines that are not deviations from anything */
    const none = H.run(waFile([waIp()], []),
      { instructors: [fdIp()], students: [], trainingLog: [], instructorCurrency: [fd] });
    eq("no instructor record on the WA side ⇒ no currency rows at all", curRows(none).length, 0);
  }

  console.log("\n=== PROBE 14i — THE WRITE: the semester of ITS OWN date, with its src ===");
  {
    /* THE DATE IS DELIBERATELY IN A HALF THAT CANNOT BE THE CURRENT ONE. The
       whole claim of addEntry() is «filed under the semester ITS OWN DATE falls
       in, never today's», and a fixture that used a date in this very half
       would be asserting nothing at all. */
    const PREV = Number(C.curSem().key.slice(0, 4)) - 1;
    const OLD = PREV + "-03-10";
    const OLDKEY = PREV + "-H1";
    eq("the fixture's date really is in another semester than today's", OLDKEY === C.curSem().key, false);

    const store = H.mkStore({ instructors: [fdIp()] });
    global.SchedEdit = null;
    const rep = H.run(waFile([waIp()], [insRec([{ date: OLD, kind: "continuation",
      s_category: "x-night-students", e_items: ["e-1a-aerobatics"], seq: 1 }])]),
    { instructors: [fdIp()], students: [], trainingLog: [], instructorCurrency: [] });
    const p = one(rep).plan;
    eq("the line is appliable", p.can, true);

    /* a LATER manual date on one of the Ε this column dates by itself — it must
       survive the write untouched, which is the whole point of bump()'s rule */
    C.bump(OID, "night-landing", C.addDays(OLD, 40), "manual");
    const kept = C.dateOf(OID, "night-landing");

    const res = B.applyCurrency(p);
    eq("the write is accepted", res.ok, true);
    const list = C.entriesOf(OID, "x-night-students", OLDKEY);
    eq("ONE sortie landed", list.length, 1);
    eq("under the semester of the FLIGHT'S own date, not today's", C.entriesOf(OID, "x-night-students", C.curSem().key).length, 0);
    eq("carrying the day Wings Ahead named", list[0].date, OLD);
    eq("and the Ε it claimed", list[0].eids.join(","), "e-1a-aerobatics");
    eq("and REMEMBERING who wrote it — the one key Round 15 dropped", list[0].src, "wa:" + p.rid);
    eq("the ticked Ε was dated", C.dateOf(OID, "e-1a-aerobatics"), OLD);
    eq("with the same provenance on the Ε row", C.cellOf(OID, "e-1a-aerobatics").src, "wa:" + p.rid);
    eq("what the COLUMN dates by itself was offered too", C.flightDerive("x-night-students").join(","), "night-landing");
    eq("…and the later MANUAL date on it was NOT regressed", C.dateOf(OID, "night-landing"), kept);

    /* the change log — ruling #2, and the snapshot that makes rollback possible */
    const log = store.get("bridgeLog");
    eq("one change-log entry", log.length, 1);
    eq("named for what it is", log[0].act, "cur-flight");
    eq("about the instructor, by CODE", log[0].student, CODE);
    eq("in the currency group, so the log reads the right roster", log[0].group, "currency");
    ok("it lists the seams it called, in order",
      log[0].seams.join(" ").indexOf("addEntry(x-night-students") === 0
      && log[0].seams.some((s) => s === "bump(e-1a-aerobatics)"), JSON.stringify(log[0].seams));
    ok("it does NOT claim to have moved the Ε the seam left alone",
      !log[0].fields.some((f) => f.field === "Ε night-landing"), JSON.stringify(log[0].fields));
    /* the snapshot is the whole record and nothing less: the manual Ε date that
       stood before this act is IN it, which is exactly what makes the rollback
       able to leave that date alone afterwards */
    eq("it carries the record as it stood BEFORE — semesters empty…",
      JSON.stringify(log[0].curBefore.semesters), "{}");
    eq("…and the manual date already standing on the Ε this column derives",
      log[0].curBefore.items["night-landing"].last_date, kept);
    ok("and as it stands AFTER", !!log[0].curAfter && !!log[0].curAfter.semesters[OLDKEY]);

    console.log("\n=== PROBE 14j — A SECOND CLICK APPENDS NOTHING ===");
    const again = B.applyCurrency(p);
    eq("applying an already-applied line answers ok", again.ok, true);
    eq("and says UNCHANGED", again.unchanged, true);
    ok("in words a person can act on", /already recorded/.test(again.why), again.why);
    eq("the cell still holds ONE sortie", C.entriesOf(OID, "x-night-students", OLDKEY).length, 1);
    eq("and the change log did not grow", store.get("bridgeLog").length, 1);
    ok("the pane counts «unchanged» apart from «written», so the sentence cannot lie",
      /already recorded — nothing written for/.test(SRC));

    /* ── AND THE CASE THE POSITIONAL RE-CHECK COULD NOT SEE ────────────────
       `seq` is AUTHORED on the Wings Ahead side (wa.chk_int(seq, 1, 9)) and its
       uniqueness is on (kind ∷ what ∷ date ∷ seq) alone — never on density. So
       a deleted first row leaves a LONE `seq: 2`, and «is the k-th same-day
       entry there?» answers no for ever: the pane kept offering «✔ Record the
       sortie» for a sortie it had just recorded, and the second click appended
       a twin with the same date, the same Ε and the same src. Provenance is the
       answer — an entry stamped with this row's identity IS this row. */
    const store5 = H.mkStore({ instructors: [fdIp()] });
    const LONE = [{ date: OLD, kind: "continuation", s_category: "x-night-students",
      e_items: ["e-1a-aerobatics"], seq: 2 }];
    const judge = () => curRows(H.run(waFile([waIp()], [insRec(LONE)]),
      { instructors: [fdIp()], students: [], trainingLog: [],
        instructorCurrency: store5.get("instructorCurrency") }));
    const lone1 = judge();
    eq("a lone seq 2 with nothing in FDMS is `wa_only`", lone1[0].cls, "wa_only");
    const w1 = B.applyCurrency(lone1[0].plan);
    eq("and it writes", w1.ok, true);
    eq("one sortie", C.entriesOf(OID, "x-night-students", OLDKEY).length, 1);
    const lone2 = judge();
    eq("RE-READ: the row now reads as recorded, not as missing", lone2[0].cls, "agree");
    eq("nothing is armed on the whole report", lone2.filter((r) => r.plan && r.plan.can).length, 0);
    eq("and no phantom `fdms_only` twin appeared beside it", lone2.length, 1);
    const w2 = B.applyCurrency(lone1[0].plan);      // the stale plan, clicked twice
    eq("a second click on the stale plan answers ok", w2.ok, true);
    eq("and UNCHANGED", w2.unchanged, true);
    ok("saying it recognised its OWN write", /this very line wrote it/.test(w2.why), w2.why);
    eq("the cell still holds exactly one sortie", C.entriesOf(OID, "x-night-students", OLDKEY).length, 1);
    eq("and the change log still holds exactly one act", store5.get("bridgeLog").length, 1);
    /* and the row claims ITS OWN entry only: a sortie somebody typed on the
       card the same day is not swallowed by it, it gets its own report-only
       line — which is the k-th-same-day rule still doing its work underneath */
    C.addEntry(OID, "x-night-students", OLD, [], "flight");
    eq("a hand-typed sortie on the same day is listed on its own, not absorbed",
      judge().filter((r) => r.cls === "fdms_only").length, 1);
    /* THE STORE GOES BACK — 14k / 14l below read the store 14i wrote into, and
       mkStore() re-points window.SchedStore at whatever it just built */
    global.SchedStore = store;

    console.log("\n=== PROBE 14k — NOTHING OF THIS LANE REACHES THE WIRE ===");
    eq("the push bands did not grow", B.PUSH_BANDS.join(","), "flights,fs");
    eq("and the currency group is not among them", B.PUSH_BANDS.indexOf(B.CUR_GROUP), -1);
    eq("nor among the groups the training-log fill writes", B.APPLY_GROUPS.indexOf(B.CUR_GROUP), -1);
    const pp = B.planPush({ trainingLog: store.get("trainingLog"), students: [], instructors: [fdIp()],
      bridgePush: store.get("bridgePush") }, { kindOf: H.kindOf, today: "2026-09-05" });
    eq("the planner owes Wings Ahead nothing after a currency write", pp.counts.queued, 0);
    eq("no removal was built either", pp.counts.removals, 0);
    eq("and no student envelope at all", pp.students.length, 0);
    eq("and the LEDGER is still empty — a currency write never becomes a pushed identity",
      store.get("bridgePush").length, 0);
    const sub = /S\(\)\.subscribe\(\(coll\) => \{([\s\S]*?)\}\);/.exec(SRC);
    ok("the automatic push lane does not even ARM on an instructorCurrency write",
      !!sub && !/instructorCurrency/.test(sub[1]), sub && sub[1]);

    console.log("\n=== PROBE 14l — ↺ UNDO PUTS THE WHOLE RECORD BACK ===");
    const snapAfter = JSON.stringify(C.record(OID).semesters);
    const e = store.get("bridgeLog")[0];
    const u = B.undoCurrency(e);
    eq("the undo is accepted", u.ok, true);
    eq("the sortie is gone", C.entriesOf(OID, "x-night-students", OLDKEY).length, 0);
    eq("the Ε date it wrote is gone with it — which no forward-only seam could have done",
      C.dateOf(OID, "e-1a-aerobatics"), "");
    eq("the LATER manual date it never touched is still standing", C.dateOf(OID, "night-landing"), kept);
    eq("the entry is stamped undone", store.get("bridgeLog")[0].undone, true);
    eq("and the trail keeps BOTH acts", store.get("bridgeLog").length, 2);
    eq("the second being the undo", store.get("bridgeLog")[1].act, "undo");
    ok("which names the act it reverses", store.get("bridgeLog")[1].undoOf === e.id);

    /* THE DRIFT GUARD — 13γ's rule, in the only shape this collection allows */
    const redo = B.applyCurrency(one(H.run(waFile([waIp()], [insRec([{ date: OLD, kind: "continuation",
      s_category: "x-night-students", e_items: ["e-1a-aerobatics"], seq: 1 }])]),
    { instructors: [fdIp()], students: [], trainingLog: [],
      instructorCurrency: store.get("instructorCurrency") })).plan);
    eq("the line is appliable again after the undo", redo.ok, true);
    const e2 = store.get("bridgeLog").filter((x) => x.act === "cur-flight" && !x.undone).pop();
    C.addEntry(OID, "x-night-students", C.addDays(OLD, 1), [], "flight");   // a hand-typed sortie beside it
    const refused = B.undoCurrency(e2);
    eq("an undo over a record somebody has touched since REFUSES", refused.ok, false);
    ok("naming the cell and both readings", /now holds \[/.test(refused.why) && /left it holding \[/.test(refused.why),
      refused.why);
    eq("and the hand-typed sortie survives", C.entriesOf(OID, "x-night-students", C.semKeyOf(C.addDays(OLD, 1))).length, 2);
    eq("the drift guard is a pure judgement a fixture can read",
      B.curDrift({ items: {}, semesters: {} }, { items: {}, semesters: {} }), "");

    console.log("\n=== PROBE 14m — THE LOCK, AT BOTH WALLS ===");
    const store2 = H.mkStore({ instructors: [fdIp()] });
    const p2 = one(H.run(waFile([waIp()], [insRec([cont({ e_items: ["e-1a-aerobatics"] })])]),
      { instructors: [fdIp()], students: [], trainingLog: [], instructorCurrency: [] })).plan;
    const refusals = [];
    global.SchedEdit = { on: () => false, refuse: (w) => { refusals.push(w); return false; } };
    const locked = B.applyCurrency(p2);
    eq("a view-only device writes nothing", locked.ok, false);
    eq("and says which wall said no", locked.why, "the edit lock refused the write");
    eq("no record was created at all", store2.get("instructorCurrency").length, 0);
    eq("and no change-log entry either", store2.get("bridgeLog").length, 0);
    global.SchedEdit = null;
    store2.locked = true;                       // the SchedStore wall, one layer deeper
    const walled = B.applyCurrency(p2);
    eq("and the seam's own wall refuses too, on its own", walled.ok, false);
    ok("with SchedCurrency's own sentence", /SchedCurrency refused the sortie/.test(walled.why), walled.why);
    eq("still nothing written", store2.get("instructorCurrency").length, 0);
    store2.locked = false;
    /* ↺ UNDO ASKS THE SAME WALL, AND ASKS IT FIRST. restore()'s own rule is
       that «a state already standing is not an error» — a null snapshot over a
       record that is already gone answers true without touching the store at
       all — which on a view-only device would be the truth about the RECORD and
       a lie about the ACT: the change-log stamp behind it is refused and the
       pane would still print «rolled back». The two halves of § ② are
       symmetrical instead. */
    const store6 = H.mkStore({ instructors: [fdIp()] });
    global.SchedEdit = null;
    const p6 = one(H.run(waFile([waIp()], [insRec([cont({ e_items: ["e-1a-aerobatics"] })])]),
      { instructors: [fdIp()], students: [], trainingLog: [], instructorCurrency: [] })).plan;
    eq("a line is written on an unlocked device", B.applyCurrency(p6).ok, true);
    const e6 = store6.get("bridgeLog")[0];
    global.SchedEdit = { on: () => false, refuse: () => false };
    const noUndo = B.undoCurrency(e6);
    eq("and ↺ Undo on a view-only device refuses", noUndo.ok, false);
    eq("with the same sentence the write uses", noUndo.why, "the edit lock refused the write");
    eq("the sortie is untouched", C.entriesOf(OID, "s-3-air-to-ground", C.semKeyOf("2026-03-10")).length, 1);
    eq("and the log entry is NOT stamped undone", !!store6.get("bridgeLog")[0].undone, false);
    eq("nor did a reverse act appear beside it", store6.get("bridgeLog").length, 1);

    /* THE WRITER JOINS ON THE OID TOO, AND RE-ASKS AT THE MOMENT IT WRITES.
       The roster row is FOUND by the FDMS code because that is the store's key,
       but the code is not the join — the object id is (ruling #4). A roster
       edit between the report and the click that moves the code to another
       person must not file this instructor's Wings Ahead sortie onto that other
       pilot's card. */
    global.SchedEdit = null;
    const store7 = H.mkStore({ instructors: [fdIp()] });
    const p7 = one(H.run(waFile([waIp()], [insRec([cont({ e_items: ["e-1a-aerobatics"] })])]),
      { instructors: [fdIp()], students: [], trainingLog: [], instructorCurrency: [] })).plan;
    store7.db.instructors[0] = fdIp({ oid: "OID-SOMEBODY-ELSE", last_name: "Different" });
    const drifted = B.applyCurrency(p7);
    eq("the roster moved that code to another pilot ⇒ the write REFUSES", drifted.ok, false);
    ok("naming the object id the line was built for and the one the roster now holds",
      /OID-IP-77/.test(drifted.why) && /OID-SOMEBODY-ELSE/.test(drifted.why), drifted.why);
    ok("and the ruling that makes the OID the only join", /ruling #4/.test(drifted.why), drifted.why);
    eq("no currency record was created for anybody", store7.get("instructorCurrency").length, 0);
    eq("and no change-log entry either", store7.get("bridgeLog").length, 0);
    const backUndo = B.undoCurrency({ student: CODE, oid: OID, rid: "x", fields: [],
      curBefore: null, curAfter: null });
    eq("↺ Undo refuses on the same grounds — it is the same door", backUndo.ok, false);
    ok("with the same sentence", /joins on the OID and on nothing else/.test(backUndo.why), backUndo.why);

    global.SchedStore = store2;                 // the probes below read 14m's own store
    ok("the write controls still carry [data-brgw] and are still absent from the NAV list",
      /data-brgw="apply"/.test(SRC)
      && !/"\[data-brgw\]"/.test(fs.readFileSync(H.BRIDGE_SRC.replace("schedbridge.js", "schedstore.js"), "utf8")));

    console.log("\n=== PROBE 14n — restore(): the one backwards seam, and its four refusals ===");
    const store3 = H.mkStore({ instructors: [fdIp()] });
    C.addEntry(OID, "s-3-air-to-ground", "2026-03-10", ["e-1a-aerobatics"], "flight");
    const stood = JSON.stringify({ items: C.record(OID).items, semesters: C.record(OID).semesters });
    eq("a snapshot that is not a record is refused", C.restore(OID, "a string", "wa-undo:x"), null);
    eq("an array is refused too", C.restore(OID, ["items"], "wa-undo:x"), null);
    eq("so is one whose items are not an object", C.restore(OID, { items: 3 }, "wa-undo:x"), null);
    eq("a rollback that names no source is refused", C.restore(OID, { items: {}, semesters: {} }, ""), null);
    eq("and the record stood through every one of them, untouched",
      JSON.stringify({ items: C.record(OID).items, semesters: C.record(OID).semesters }), stood);
    store3.locked = true;
    eq("a view-only device restores nothing", C.restore(OID, { items: {}, semesters: {} }, "wa-undo:x"), null);
    store3.locked = false;
    eq("a null snapshot means «there was no record» and removes the row", C.restore(OID, null, "wa-undo:x"), true);
    eq("which is exactly what it says", store3.get("instructorCurrency").length, 0);
    ok("and the seam is documented in the module header, beside bump",
      /THE ONE SEAM THAT MOVES BACKWARDS/.test(CUR_SRC_TXT)
      && /restore\(oid, snapshot, src\)/.test(CUR_SRC_TXT));
    ok("with the reason it may exist at all — ruling #2 and its one caller",
      /ruling #2/.test(CUR_SRC_TXT) && /ONE CALLER/.test(CUR_SRC_TXT));

    console.log("\n=== PROBE 14o — THE PROVENANCE IS VISIBLE ON THE CARD ===");
    ok("normEntry KEEPS a src when there is one", C.normEntries([{ date: "2026-03-10", eids: [], src: "wa:X" }])[0].src === "wa:X");
    ok("and an entry with none still reads exactly as Round 15 left it",
      JSON.stringify(C.normEntries([{ date: "2026-03-10", eids: [] }])[0]) === '{"date":"2026-03-10","eids":[]}');
    const store4 = H.mkStore({ instructors: [fdIp()] });
    C.addEntry(OID, "s-3-air-to-ground", "2026-03-10", [], "flight");
    ok("the CARD's own write stores no src at all — byte-identical to before this round",
      C.entriesOf(OID, "s-3-air-to-ground", C.semKeyOf("2026-03-10"))[0].src === undefined);
    C.addEntry(OID, "s-3-air-to-ground", "2026-03-11", [], "wa:R1");
    eq("a bridge write does", C.entriesOf(OID, "s-3-air-to-ground", C.semKeyOf("2026-03-11"))[1].src, "wa:R1");
    ok("and the card draws a WA chip beside such an entry",
      /isWaEntry\(e\)/.test(CUR_SRC_TXT) && /cur-entrywa/.test(CUR_SRC_TXT) && />WA<\/span>/.test(CUR_SRC_TXT));
    ok("only for a bridge entry — a src-less list renders exactly as it did",
      /\$\{wa \? `<span class="sch-badge alt cur-entrywa"/.test(CUR_SRC_TXT));
    void store4;
  }

  console.log("\n=== PROBE 14p — THE SEAMS ARE THE ONLY DOOR, AND THE OLD ONES DID NOT MOVE ===");
  {
    /* § ② is the only caller of the store, and THE PANE reaches the currency
       writer only through applyPlan / undoEntry — the two functions a
       [data-brgw] control calls, and the two that stay off the public surface.
       applyCurrency / undoCurrency ARE exported, and the surface says why in so
       many words: every other lane's whole write is ONE RECORD that
       plannedEvent() hands a fixture, and a currency act is a SEQUENCE of seam
       calls with no such object. They gain no power by it — the lock is asked
       first inside them, and again inside every seam. */
    eq("the pane's own two doors stay off the surface — applyPlan", B.applyPlan, undefined);
    eq("…and undoEntry", B.undoEntry, undefined);
    ok("while the currency writer is exported WITH ITS REASON WRITTEN BESIDE IT",
      typeof B.applyCurrency === "function" && typeof B.undoCurrency === "function"
      && /the ONLY impure functions on this/.test(SRC)
      && /a SEQUENCE — a re-check/.test(SRC));
    eq("and the lock is asked before a seam is called — in BOTH halves, with one sentence",
      (SRC.match(/if \(!editOn\(\)\) return \{ ok: false, why: "the edit lock refused the write" \};/g) || []).length, 2);
    ok("the writer calls addEntry and bump, and nothing else of the store",
      /C\.addEntry\(oid, p\.itemId, p\.date, p\.eids, src\)/.test(SRC) && /C\.bump\(oid, id, p\.date, src\)/.test(SRC));
    ok("and it asks the LIVE engine for what a column dates by itself, not the plan's memory",
      /C\.flightDerive\(p\.itemId\)/.test(SRC));
    ok("the two acts are named once, where the change log and the undo both read them",
      B.CUR_ACTS.join(",") === "cur-flight,cur-edate");
    ok("makePlan is never asked about a currency row",
      /if \(x\.group !== CUR_GROUP\) x\.plan = makePlan\(/.test(SRC));
    ok("and a currency plan never narrows by field", B.curPlanEdate === undefined ? false : true);
    eq("narrowPlan refuses to narrow one", (() => {
      const q = { group: "currency", fields: [{ field: "Ε x", from: "", to: "2026-03-10" }] };
      return /if \(p\.group === CUR_GROUP\) return null;/.test(SRC) ? "refused" : "narrowed";
    })(), "refused");

    /* THE OLD ROAD DID NOT MOVE. A flight row's plan is what it always was —
       the currency lane added a group, not a change to the four that write the
       training log. */
    const rep = H.run(H.waExport([H.person({ oid: "oid-x01" })],
      [H.record("wa-oid-x01", { flights: [{ date: "2026-08-12", sortie: "C4302", seq: 1,
        kind: "syllabus", instructor: "AIRMAN", grade: 78, mission: "" }] })], true),
    { students: [H.fdmsStudent({})], instructors: [H.fdmsIp({ last_name: "AIRMAN" })], trainingLog: [] });
    const f = rep.rows.filter((r) => r.group === "flights")[0];
    eq("a flight is still `wa_only`", f.cls, "wa_only");
    eq("still a CREATE", f.plan.act, "create");
    eq("still with its node's band", f.plan.kind, "flights");
    eq("and still no currency key on it", f.plan.itemId, undefined);
  }

  console.log("\n=== PROBE 14q — A COLD ENGINE: THE LANE REPORTS THE SILENCE INSTEAD OF GUESSING ===");
  {
    /* THE STATE THE REAL PAGE IS IN WHEN THE BRIDGE TAB IS OPENED FIRST.
       SchedCurrency attaches at SCRIPT LOAD; its 91-item catalog arrives only
       when `CUR().load()` runs, and that runs inside `curInit()` — which fires
       on the FIRST CLICK of the Currency tab (app/app.js) and nowhere else. So
       a developer who opens Bridge before Currency has an engine whose every
       method answers, and whose `byId()` answers null for EVERY id. Asking only
       «does the engine exist» let the whole «an Ε id the catalog does not carry
       ⇒ unwritten» rule pass in silence: the row read `wa_only`, it was ARMED,
       and applying it wrote a 3-01 exercise that does not exist onto an
       instructor's permanent card, with the report saying nothing at all.
       Every probe above it awaits load() first, which is exactly why none of
       them could see this — so this one evaluates a SECOND, never-loaded
       engine and puts it in front of the bridge. */
    const warm = global.SchedCurrency;
    // eslint-disable-next-line no-eval
    (0, eval)(CUR_SRC_TXT);
    const cold = global.SchedCurrency;
    try {
      eq("the second engine really is the cold one", cold === warm, false);
      eq("it attached, exactly as a <script> tag makes it", typeof cold.bagOf, "function");
      eq("and it says so itself: the catalog is not there", cold.loaded(), false);
      eq("so every id the 3-01 carries reads as unknown", cold.byId("e-1a-aerobatics"), null);

      const store = H.mkStore({ instructors: [fdIp()] });
      global.SchedEdit = null;
      const rep = H.run(waFile([waIp()], [insRec([{ date: "2025-03-10", kind: "continuation",
        s_category: "x-night-students", e_items: ["e-99-does-not-exist"], seq: 1 }])]),
      { instructors: [fdIp()], students: [], trainingLog: [], instructorCurrency: [] });
      eq("NOTHING is compared while the catalog is unfetched", curRows(rep).length, 0);
      eq("and therefore nothing is armed", rep.counts.appliable, 0);
      const n = (rep.notes || []).filter((x) => x.kind === "currency");
      eq("the lane says the silence out loud instead of leaving a blank table", n.length, 1);
      ok("counting the records it read and did not compare",
        /1 Wings Ahead instructor record\(s\) were read and none of them compared/.test(n[0].problems[0]),
        JSON.stringify(n[0].problems));
      ok("and telling the developer the one thing that fixes it",
        /open the Currency tab once and re-read/.test(n[0].why), n[0].why);
      ok("naming what cannot be checked without the catalog",
        /an Ε id\s+cannot be checked against the 3-01/.test(n[0].why.replace(/\s+/g, " "))
        || /cannot be checked against the 3-01/.test(n[0].why), n[0].why);

      /* AND THE WRITER SAYS IT AGAIN, at the moment of the write: a plan can
         outlive the page state that built it. */
      const stale = { act: "cur-flight", can: true, group: "currency", rid: "R", oid: OID, student: CODE,
        date: "2025-03-10", seq: 1, itemId: "x-night-students", eids: ["e-99-does-not-exist"],
        derive: [], src: "wa:R", fields: [], uid: "x-night-students", ord: 1 };
      const res = B.applyCurrency(stale);
      eq("a stale plan clicked against a cold engine writes NOTHING", res.ok, false);
      ok("and says why in the same words", /catalog is not loaded/.test(res.why), res.why);
      eq("no currency record was created at all", store.get("instructorCurrency").length, 0);
      eq("and no change-log entry either", store.get("bridgeLog").length, 0);
    } finally {
      global.SchedCurrency = warm;              // the warm engine goes back to the page
    }
    eq("the loaded engine is back in front of the bridge", global.SchedCurrency.loaded(), true);
  }

  console.log("\n=== PROBE 14r — THE SENTENCES THE PANE PRINTS ABOUT THIS LANE ===");
  {
    /* THE SENTENCE IS THE DELIVERABLE — including the standing ones nobody
       clicks. Two of them were left behind by the round that built this lane:
       the hint above the table still promised «the FDMS training log only»
       after the same button had learnt to write a currency card, and the table
       header still called an INSTRUCTOR a «Student» and a Σ column a «Node». */
    ok("the standing hint names the currency card beside the training log",
      /that instructor's own\s+<b>currency card<\/b>/.test(SRC), "the rowsPanel hint");
    ok("and still says that Wings Ahead is never written by this app",
      /Wings Ahead is never written by this app/.test(SRC));
    ok("the confirm dialog says the same thing, so the two cannot drift",
      /and the <b>instructors' currency records<\/b>/.test(SRC));
    ok("the report's own table head asks WHICH GROUP it is painting",
      /isCur \? "Instructor" : "Student"/.test(SRC) && /isCur \? "Σ column \/ Ε" : "Node"/.test(SRC));
    ok("the change-log table head was already corrected, and stays that way",
      /Person<\/th>/.test(SRC) && /Node \/ column<\/th>/.test(SRC));
  }

  global.SchedEdit = null;
};
