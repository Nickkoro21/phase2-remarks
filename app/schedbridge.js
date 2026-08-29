"use strict";
/* SchedBridge — THE BRIDGE: the cross-check report (slice 1) and, from
 * PHASE 3 (26/08/2026), THE CONFIRMED FILL — «Πάμε να το κάνουμε two way».
 *
 * WHAT THIS IS
 *   A Scheduler pane that reads ONE Wings Ahead admin-export file the user
 *   chooses from disk, cross-checks it against the local FDMS store, and paints
 *   a report. The report itself still goes nowhere: not to WA, not to the repo,
 *   not to localStorage, no credential, no network, no schema change on either
 *   side. See specs/bridge-spec.md.
 *
 * WHAT PHASE 3 ADDED — and the five walls around it
 *   The report stopped being read-only in ONE direction only: a row the
 *   developer CONFIRMS becomes an event in the FDMS **training log**. Nothing
 *   is ever written back to Wings Ahead, and nothing is ever written without
 *   all five of these:
 *     1 · THE EDIT LOCK. Every write control carries [data-brgw], which is
 *         deliberately NOT on SchedStore's NAV list — so the veneer disables
 *         it, the capture guard refuses the click by name, and upsert() asks
 *         mayWrite() a third time. Slice 1 promised exactly this in the NAV
 *         comment; Phase 3 is where the promise was called in.
 *     2 · AN EXPLICIT ACT PER ROW. [✔ Apply] on one row, or a selection and
 *         «✔ Apply N selected». There is no auto-apply and no apply-all.
 *     3 · A NUMBERED DIALOG THAT STATES THE NODE EFFECT of every single line
 *         before the confirm — «completes the node» / «does not complete the
 *         node» — because that is the sentence a syllabus graph turns on.
 *     4 · PROVENANCE ON EVERY EVENT (`id: "wa:…"` · `origin: "wa"` · a whole
 *         `bridge` block). Re-loading the SAME export then reads `agree` and
 *         can never duplicate; an export where the student CHANGED the row
 *         reads `payload_differs` AGAINST the event the bridge wrote.
 *     5 · A CHANGE LOG WITH ↺ UNDO (ruling #2), in the store, synced like
 *         everything else, recording who · when · rid · what was written and
 *         what was there before.
 *   What Phase 3 deliberately does NOT do: delete anything (a tombstone is a
 *   separate deliberate act, ruling #2), write to Wings Ahead, open a network
 *   transport, or touch any group but `flights` and `fs`. See § 13 of the spec.
 *
 * THE EIGHT RULINGS OF THE FLIGHT COMMANDER (21/08/2026) — recorded verbatim
 * in the spec; here is what each one MEANS IN THIS FILE:
 *   #1 same sortie twice a day is real, with an explicit seq. The morning bust
 *      is MISSION INCOMPLETE and the re-fly is the completed one → seq is a
 *      fact of the row, never an array index (ordSort / pairGroup).
 *   #2 a bridge-written row may be edited by the student with a report, and
 *      deleted only with the developer's OK (a tombstone) + a change log →
 *      class `deleted` exists so a vanished source is SEEN (never re-proposed
 *      for ever), and slice 1 only reports it.
 *   #3 mission incomplete = NON-GRADED. It never completes a node. The final
 *      say on corrections is the Developer's → judge() / nodeEffect().
 *   #4 primary keys (OIDs) NEVER change; MN / rank / class ARE mutable, and
 *      only the developer changes them → matchPeople() joins on OID, falls back
 *      to MN, and uses the name for DISPLAY ONLY. A class move produces a
 *      ground-history divergence line, reported and never auto-written.
 *   #5 a grade may arrive later — «awaiting» is a legitimate state, not an
 *      error → judge() returns source:"awaiting" and the row is not proposable.
 *   #6 thresholds: ground exams 80, flights 60, F/S 60 (the F/S number was
 *      corrected from 50 on 22/08/2026 — see below). FROZEN PER ROW at the
 *      moment it is judged and printed beside the number, so a later config
 *      change can never re-judge history → THRESHOLDS + row.thr.
 *   #7 minimum leakage. For THIS slice: the report data NEVER leaves the
 *      machine. No download button, no localStorage, no sync, no repo. The
 *      chosen file is read in memory and dropped when the pane is cleared.
 *   #8 duration becomes an FDMS field in slice 6. Identities here are built so
 *      that a duration field can attach later WITHOUT changing any row key —
 *      duration is payload, and payload is never part of a row identity.
 *
 * THE ROW IDENTITY — THE ONE THING THIS SLICE MUST GET RIGHT
 *   rid = oid ∷ group ∷ uid ∷ ord
 *     oid   the person's immutable OID (ruling #4)
 *     group which report group the row belongs to (evaluations · solo_flights ·
 *           flights · fs · lessons · exams) — an FDMS event belongs to exactly
 *           one, so a checkride can never be counted twice
 *     uid   the FDMS node uid — "s:C4302", "g:GT-AERO-CRM::AE 101", "g:CO190"
 *     ord   the ATTEMPT ORDINAL inside (oid, group, uid): 1st attempt, 2nd, …
 *   THE DATE IS NOT IN THE IDENTITY. That is the adversarial critique's first
 *   must-fix: a fingerprint derived from the date means a one-character date
 *   correction orphans one event and mints a second, and SchedConsq.counters()
 *   then counts a FAIL twice — fabricating the ΠΔ 29/2020 referral the
 *   determinism was supposed to prevent. Here a moved date is ONE deviation of
 *   class `source_moved`, never a delete plus an add. Proven by fixture.
 *
 *   ord is assigned by pairGroup() in two passes, so it is order-independent:
 *     1 · rows whose (date, seq) are EQUAL on both sides pair first;
 *     2 · the leftovers pair by their own ordinal among the leftovers, sorted
 *         by (date, seq, side-stable index) — that is the moved-date pass.
 *   Same-date FDMS events on one node keep the store's array order, which is
 *   the tie-break FDMS's own SchedReady.state() uses (scheduler.js § state) —
 *   a fact of the model, not an invention of this file.
 *
 * CUSTODY (ruling #7)
 *   The export file and this report are DATA WITH REAL NAMES. They are the
 *   same class of thing as the private roster and the encrypted store. They
 *   are never committed, never downloaded by this pane, never persisted.
 *   .gitignore carries the filename patterns defensively.
 *
 * NODE-TESTABLE ON PURPOSE
 *   Section ① touches no DOM and no store, and is attached to
 *   window.SchedBridge, so the fixtures can require() this file with
 *   `global.window = global` and run the whole cross-check — and the whole
 *   apply PLAN, including the record it would write — headlessly.
 *   Section ② is the writer: the only place that calls SchedStore. Section ③
 *   is the pane, and it only runs from a UI event.
 */
(() => {
  const W = typeof window !== "undefined" ? window : globalThis;

  /* ══════════════════════════════════════════════════════════════════════════
     ① THE ENGINE — pure, no DOM, no store, no fetch
     ══════════════════════════════════════════════════════════════════════════ */

  const VERSION = "bridge-phase-3";
  const WA_SCHEMA = "wa-export-v1";

  /* RULING #6 — the three thresholds, frozen per row when it is judged.
     80 is FDMS's own exam_pass_pct default (ground school); 60 is ΠΔ 151/13's
     «Κ» floor, the line every referral criterion uses for a flight.

     THE F/S NUMBER IS 60, AND IT ALWAYS WAS (ruling of 22/08/2026 — «60 % f/s,
     flights»). Slice 1 shipped it as 50, and that 50 never existed as a pass
     mark anywhere: it is the «ΣΚ»/ΥΣΤΕΡΗΣΗ BAND FLOOR of the printed ΠΔ scale —
     a label for a range of marks — which the planning mistook for the line a
     simulator sortie has to clear. The school and Wings Ahead judge a simulator
     sortie exactly like a flight, at 60.

     WHAT THE 50 ACTUALLY DID — it did not make noise, it made SILENCE. judge()
     runs per side with the SAME threshold, so a simulator sortie scored 50–59
     printed «COMPLETE · 55 % vs 50 %», completed its node, AND — since both
     sides were judged by the same wrong line — came out as class `agree`. The
     report said "the two databases agree" over a failure painted as a pass that
     was unlocking the nodes behind it. A wrong threshold here does not fabricate
     a deviation; it hides a real one.

     They are constants HERE and never read from config: a config that drifts
     must never re-judge a history already reported. Rows judged BEFORE this
     correction carry their own `thr` — that is what freezing is for, and the
     report prints the number it used beside every verdict. */
  const THRESHOLDS = { exams: 80, flights: 60, fs: 60 };
  const thrOf = (band) => (THRESHOLDS[band] != null ? THRESHOLDS[band] : THRESHOLDS.flights);

  /* THE NINE DEVIATION CLASSES — the architect's six plus the critic's three.
     `tone` is a token name, never a colour. */
  const CLASSES = [
    { id: "agree", label: "Agree", tone: "good",
      what: "the two sides say the same thing about the same row" },
    { id: "source_moved", label: "Source moved", tone: "warn",
      what: "the same row, on a different date — ONE deviation, never a delete plus an add" },
    { id: "payload_differs", label: "Payload differs", tone: "warn",
      what: "the same row on the same date, disagreeing about grade, verdict or instructor" },
    { id: "wa_only", label: "Wings Ahead only", tone: "accent",
      what: "Wings Ahead has the row and FDMS does not" },
    { id: "fdms_only", label: "FDMS only", tone: "accent",
      what: "FDMS has the event and Wings Ahead does not" },
    { id: "deleted", label: "Deleted at source", tone: "bad",
      what: "an FDMS event the bridge wrote whose Wings Ahead source is gone — needs a developer tombstone (ruling #2)" },
    { id: "unwritten", label: "Unwritten — invalid record", tone: "bad",
      what: "the row could never have been written: the record is unwritable or the row breaks a stored rule" },
    { id: "refused", label: "Structurally refused", tone: "muted",
      what: "a rule refuses this row on principle — it is listed with the rule that refused it" },
    { id: "unresolvable", label: "Unresolvable identity", tone: "bad",
      what: "no OID, no MN, or an ambiguous match — never guessed by name (ruling #4)" },
  ];
  const CLASS_IDS = CLASSES.map((c) => c.id);
  const CLASS_BY_ID = {};
  CLASSES.forEach((c) => { CLASS_BY_ID[c.id] = c; });

  /* The five report groups, in the order the Flight Commander asked to read
     them: identities first, then the eight checkrides, the prescribed solos,
     the FAIL / ALMOST GOOD / SMS events, and last the four log tables. */
  const GROUPS = [
    { id: "evaluations", label: "Evaluations (the 8 checkrides)" },
    { id: "solo_flights", label: "Solo flights" },
    { id: "events", label: "FAIL · ALMOST GOOD · NFS · SMS · airsickness" },
    { id: "flights", label: "Flights" },
    { id: "fs", label: "F/S (simulator)" },
    { id: "lessons", label: "Ground lessons" },
    { id: "exams", label: "Ground exams" },
    /* PHASE 3b · FINDING 9 — a home for the events the syllabus graph does not
       carry. It exists so that such an event has somewhere VISIBLE to land: a
       row counted in the summary and then missing from the table is the same
       lie as a clean-looking empty report. */
    { id: "off_graph", label: "Off-catalogue — nodes the syllabus graph does not carry" },
  ];

  /* MIRROR of wa.eval_ids() (D:\WingsAhead\db\schema.sql). Eight codes, in
     syllabus order. Kept here as a literal because the bridge must be able to
     tell a checkride from an ordinary sortie WITHOUT the WA database. */
  const EVAL_IDS = ["C4590", "C4790", "C5090", "C5490", "I4490", "I4890", "F4690", "N4690"];
  /* MIRROR of wa.exam_ids() — the eight ground-exam groups and nothing else. */
  const EXAM_IDS = ["CO190", "JP190", "IN190", "IN290", "FO190", "TACFOR590", "NA190", "LNAV790"];
  /* MIRROR of wa.missions() and wa.flight_kinds(). */
  const MISSIONS = ["complete", "incomplete"];
  const FLIGHT_KINDS = ["syllabus", "repeat", "fcf", "cef", "other"];
  const TRACKS = ["contact", "instrument", "formation", "vfr_navigation"];

  /* the sections of a WA record this slice reads, and where each one lands */
  const WA_SECTIONS = {
    evaluations:  { group: "evaluations", band: "flights" },
    solo_flights: { group: "solo_flights", band: "flights" },
    flights:      { group: "flights", band: "flights" },
    fs:           { group: "fs", band: "fs" },
    lessons:      { group: "lessons", band: "lessons" },
    exams:        { group: "exams", band: "exams" },
    fail:         { group: "events", band: "flights" },
    almost_good:  { group: "events", band: "flights" },
    nfs:          { group: "events", band: null },
    sms:          { group: "events", band: null },
    airsickness:  { group: "events", band: null },
  };
  const WA_SECTION_IDS = Object.keys(WA_SECTIONS);

  /* THE SECTIONS WHOSE ROW IDENTITY IS A SYLLABUS NODE — the six the graph is
     asked about, and only those. The event sections name no node of their own:
     a FAIL / ALMOST GOOD is an ANNOTATION on a flight, an NFS is a form and SMS
     is a status plus a gate, so «the graph does not carry it» is not a finding
     about them, it is their nature. */
  const NODE_SECTIONS = ["evaluations", "solo_flights", "flights", "fs", "lessons", "exams"];

  /* ── small helpers ─────────────────────────────────────────────────────── */
  const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
  const arr = (v) => (Array.isArray(v) ? v : []);
  const str = (v) => (v == null ? "" : String(v));
  const trim = (v) => str(v).trim();
  const up = (v) => trim(v).toUpperCase();
  const num = (v) => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return isNaN(n) ? null : n;
  };
  const isoDate = (v) => {
    const s = trim(v);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
  };
  const posInt = (v, d) => {
    const n = num(v);
    return n != null && n >= 1 && n === Math.floor(n) ? n : d;
  };
  /* OIDs are compared case-insensitively and whitespace-trimmed and NOTHING
     else — an OID is opaque and this app never invents one (ruling #4). */
  const normOid = (v) => up(v);
  /* MN is the fallback join key. Digits and letters only, so "MN 1001",
     "MN-1001" and "mn1001" are one number and a typo is still a typo. */
  const normMn = (v) => up(v).replace(/[^A-Z0-9]/g, "");
  const normName = (v) => up(v).replace(/\s+/g, " ");

  /* ══ THE GRAPH QUESTION — PHASE 3b, FINDING 9 ════════════════════════════
     THE HOLE THIS CLOSES. Until this round `kindOf()` — the FDMS syllabus graph
     — was asked on ONE side only, in the FDMS reader. A Wings Ahead row naming
     a sortie the graph does not carry (a retired code, a typo, «ZZ999», or a
     near-miss like «C4404» beside the real «C4304») therefore sailed through as
     an ordinary appliable `wa_only`; the confirm dialog promised it would
     «COMPLETE the node and unlock its successors» about a node that does not
     exist; the write landed; and the NEXT report could not see its own write,
     because the same kindOf() gates the reader. So the row stayed `wa_only` and
     every further click minted another orphan event.
     From here the question is asked on BOTH sides and at every seam that can
     lead to a write. */

  /* THE NODE BEHIND A ROW IDENTITY. A ground-lesson uid is «g:GROUP::COURSE» —
     the course belongs to the ROW IDENTITY (it is FDMS's own parseGroupCourses
     join key) and NOT to the syllabus node, and the graph is asked about the
     node. Every other uid is its own node. */
  const nodeOfUid = (uid) => {
    const s = trim(uid);
    const i = s.indexOf("::");
    return i > 0 ? s.slice(0, i) : s;
  };
  const codeOfNode = (node) => {
    const i = node.indexOf(":");
    return i > 0 ? node.slice(i + 1) : node;
  };

  /* THE SENTENCE, IN ONE PLACE, because the report, the plan, the refusal and
     the writer must all say it in the SAME words — the R20 lesson about two
     seams is only worth anything if both seams tell the developer the same
     thing. It names the code, and it says what the absence of a node means. */
  function offGraphWhy(uid) {
    const node = nodeOfUid(uid);
    return "«" + codeOfNode(node) + "» is not in the FDMS syllabus graph — there is no node «" + node
      + "» for this row to be about. Nothing can be compared against a node that does not exist, nothing "
      + "can complete it, and nothing may be written for it: SchedReady would never read such an event, "
      + "so no Progress screen would ever show it and this report could not even see its own write. An "
      + "off-catalogue row lives on the Wings Ahead side only — correct the code there, or add the node "
      + "to the syllabus first (specs/bridge-spec.md § 13δ)";
  }

  /* the one predicate both the classification and the Effect column ask */
  function offGraph(r, kindOf) {
    const k = typeof kindOf === "function" ? kindOf : () => null;
    return !!(r && r.side === "wa" && NODE_SECTIONS.indexOf(r.sec) >= 0
      && r.uid && !k(nodeOfUid(r.uid)));
  }

  /* A ROW WITH NO NODE COMPLETES NOTHING. nodeEffect() answers «does this row
     complete its FDMS node», and for a row the graph has never heard of the
     honest answer is not «yes, it scored 78» — there is no node to complete.
     Without this the table printed «completes the node» in the Effect column of
     the very row whose refusal says the node does not exist: the same lie the
     confirm dialog used to tell, one column to the left. */
  function noNodeEffect(row) {
    row.completes = false;
    row.effect = "no node — nothing is completed and nothing is unlocked";
    return row;
  }

  /* the mirror sentence, for an event the STORE already holds on such a node */
  function offGraphSeen(f) {
    const node = nodeOfUid(f.uid);
    return "the FDMS training log holds this event on «" + node + "», and the syllabus graph has no node "
      + "by that name. SchedReady never reads it, so it completes nothing, unlocks nothing and reaches no "
      + "Progress screen — it is listed here for one reason only: an event on a node the catalogue does "
      + "not carry must never be invisible."
      + (f.waWritten ? " This event was written by the BRIDGE (" + f.srcId + "), which is exactly the "
        + "orphan a row that got past the graph check leaves behind." : "")
      + " Correct the node in the Training log, or remove the event there — the bridge deletes nothing "
      + "(ruling #2).";
  }

  /* ── the wa-export-v1 contract ─────────────────────────────────────────── */

  /* THE SHAPE TEST, shared by name with the store-restore Import guard in
     schedstore.js (which repeats it inline on purpose: that guard is a wall and
     must stand even if this file failed to load). A file is a Wings Ahead
     export when it SAYS it is, or when it carries the two arrays only WA has
     and none of the scheduler's own collections. */
  function looksLikeWaExport(d) {
    if (!isObj(d)) return false;
    if (trim(d.schema) === WA_SCHEMA) return true;
    return Array.isArray(d.people) && Array.isArray(d.student_records)
      && d.trainingLog === undefined && d.config === undefined;
  }

  /* parseExport — turn the chosen file into the shape the engine wants, or say
     why it cannot. Accepts both the marked wa-export-v1 file and the unmarked
     public.admin_export() output that WA emits today; the spec records that
     the marker is what the WA side adds next round. */
  function parseExport(raw) {
    let d = raw;
    if (typeof raw === "string") {
      try { d = JSON.parse(raw); }
      catch (e) { return { ok: false, why: "that file is not valid JSON." }; }
    }
    if (!isObj(d)) return { ok: false, why: "that file is not a JSON object." };
    if (!looksLikeWaExport(d)) {
      return { ok: false, why: "that file is not a Wings Ahead export — it carries neither the "
        + WA_SCHEMA + " marker nor the people[] + student_records[] pair the export is made of." };
    }
    const marked = trim(d.schema) === WA_SCHEMA;
    const people = arr(d.people).filter(isObj);
    const records = arr(d.student_records).filter(isObj);
    return {
      ok: true,
      marked,
      schema: marked ? WA_SCHEMA : "(unmarked admin_export — " + WA_SCHEMA + " is what the WA side stamps next round)",
      exported_at: trim(d.exported_at) || trim(d.generated_at),
      /* ── WHEN THIS TAB TOOK THE PAYLOAD IN (P45-FDMSc) ──────────────────
         `exported_at` is WINGS AHEAD's clock; every ledger row's `at` is THIS
         BROWSER's. Comparing the two is a comparison across two machines, and
         a skew of minutes decides whether a destructive act arms — so a second
         instant is stamped here, on the clock the ledger is written with, at
         the one moment every carrier passes through. Both readers of this file
         reach parseExport: the ⟳ live pull and the 📄 file input. It is not
         the payload's age (a file exported yesterday and opened now is old the
         moment it lands) — it is the age of the READING, and § readFresh uses
         them for the two different questions they can each answer. */
      taken_at: new Date().toISOString(),
      people,
      records,
      proposals: arr(d.proposals).filter(isObj),
      /* PHASE 4/5 — WHAT WINGS AHEAD REMEMBERS THE BRIDGE DOING. Both doors
         carry it (bridge_pull and the admin's own download), so a report can
         render «what WA remembers» beside «what the ledger claims» and a drift
         between the two is a line rather than a silence. Absent in an older
         export, which is why every reader below asks arr()/isObj() first.
         `via` is «bridge» when the payload came down the live wire. */
      via: trim(d.via),
      bridge: isObj(d.bridge) ? d.bridge : null,
      tombstones: isObj(d.bridge) ? arr(d.bridge.tombstones).filter(isObj) : [],
      auditTail: isObj(d.bridge) ? arr(d.bridge.audit_tail).filter(isObj) : [],
    };
  }

  /* ── identities (ruling #4) ────────────────────────────────────────────── */

  /* Match on OID when present, else on MN. NEVER on the name — the name is
     display only, and two people who share a surname must stay two people. */
  function matchPeople(waPeople, fdmsStudents, fdmsInstructors) {
    const byOid = new Map(), byMn = new Map(), mnDup = new Set(), oidDup = new Set();
    const addFdms = (rec, coll) => {
      const o = normOid(rec.oid), m = normMn(rec.mn);
      const row = { coll, rec, oid: o, mn: m };
      if (o) { if (byOid.has(o)) oidDup.add(o); else byOid.set(o, row); }
      if (m) { if (byMn.has(m)) mnDup.add(m); else byMn.set(m, row); }
      return row;
    };
    const fRows = [];
    arr(fdmsStudents).forEach((s) => { if (isObj(s)) fRows.push(addFdms(s, "students")); });
    arr(fdmsInstructors).forEach((i) => { if (isObj(i)) fRows.push(addFdms(i, "instructors")); });

    const waOidSeen = new Map();
    arr(waPeople).forEach((p) => {
      const o = normOid(p.external_oid);
      if (!o) return;
      waOidSeen.set(o, (waOidSeen.get(o) || 0) + 1);
    });

    const used = new Set();
    const out = { matched: [], waOnly: [], fdmsOnly: [], ambiguous: [] };
    arr(waPeople).forEach((p) => {
      const oid = normOid(p.external_oid), mn = normMn(p.mn);
      const shown = {
        waId: trim(p.id), oid, mn,
        /* THE OBJECT ID EXACTLY AS WINGS AHEAD CARRIES IT (P45-FDMSe, verify
           item 12b). `normOid` upper-cases, so this report matches a lower-case
           `external_oid` happily and prints «matched BY OID» — and then the
           push sends the UPPER-CASED form, the envelope matches exactly, and
           every one of that person's flights is refused, with nothing on screen
           joining the two facts. Keeping the raw value is what lets the
           divergence below be said before the first push rather than after 30
           refusals. */
        oidRaw: trim(p.external_oid),
        name: trim(p.last_name) + (trim(p.first_name) ? " " + trim(p.first_name) : ""),
        role: trim(p.role), active: p.active !== false, klass: trim(p.class),
        rank: trim(p.rank), callsign: trim(p.call_sign),
      };
      if (oid && waOidSeen.get(oid) > 1) {
        out.ambiguous.push({ wa: shown, why: "two people in the Wings Ahead export carry the same OID "
          + oid + " — an OID is a primary key and never repeats (ruling #4)" });
        return;
      }
      if (oid && oidDup.has(oid)) {
        out.ambiguous.push({ wa: shown, why: "two people in the FDMS roster carry the OID " + oid });
        return;
      }
      let hit = oid ? byOid.get(oid) : null;
      let via = hit ? "oid" : "";
      if (!hit && mn) {
        if (mnDup.has(mn)) {
          out.ambiguous.push({ wa: shown, why: "no OID on the Wings Ahead side and the MN " + mn
            + " is carried by two people in the FDMS roster — matching by name is not allowed (ruling #4)" });
          return;
        }
        hit = byMn.get(mn);
        via = hit ? "mn" : "";
      }
      if (!hit) {
        out.waOnly.push({ wa: shown, why: oid
          ? "OID " + oid + " is in Wings Ahead and not in the FDMS roster"
          : "no OID and no MN that FDMS knows — name matching is refused (ruling #4)" });
        return;
      }
      used.add(hit.rec);
      const f = hit.rec;
      out.matched.push({
        wa: shown, via,
        coll: hit.coll,
        fdms: {
          code: trim(f.code), oid: normOid(f.oid), mn: normMn(f.mn),
          name: trim(f.last_name) + (trim(f.first_name) ? " " + trim(f.first_name) : ""),
          klass: trim(f.class), status: trim(f.status) || "active",
          rank: trim(f.rank), callsign: trim(f.callsign),
        },
        /* ruling #4 — MN / rank / class are MUTABLE and only the developer
           changes them; a divergence is a report line, never a write. */
        divergences: [
          oid && shown.oidRaw && shown.oidRaw !== oid
            ? "CASE — Wings Ahead carries this object id as «" + shown.oidRaw + "». The push sends it "
              + "UPPER-CASED as " + oid + " and the far side matches it EXACTLY, so this person's "
              + "envelope is refused and none of his flights crosses. It is matched here because this "
              + "report compares case-insensitively; the wire does not. Fix the case in the Wings Ahead "
              + "roster before the first push" : "",
          via === "mn" && !oid ? "matched by MN — Wings Ahead carries no OID for this person" : "",
          via === "oid" && oid && normOid(f.oid) !== oid ? "OID mismatch after an OID match (impossible — read this as a bug)" : "",
          mn && normMn(f.mn) && mn !== normMn(f.mn) ? "MN differs — WA " + trim(p.mn) + " · FDMS " + trim(f.mn) : "",
          !normMn(f.mn) && mn ? "FDMS has no MN for this person" : "",
          trim(p.rank) && trim(f.rank) && up(p.rank) !== up(f.rank) ? "rank differs — WA " + trim(p.rank) + " · FDMS " + trim(f.rank) : "",
          normName(shown.name) && normName(hit.rec.last_name) && normName(trim(f.last_name)) !== normName(trim(p.last_name))
            ? "surname differs — WA " + trim(p.last_name) + " · FDMS " + trim(f.last_name) + " (display only; the OID ruled)" : "",
        ].filter(Boolean),
        classMove: trim(p.class) && trim(f.class) && up(p.class) !== up(f.class)
          ? { wa: trim(p.class), fdms: trim(f.class) } : null,
      });
    });
    fRows.forEach((r) => {
      if (used.has(r.rec)) return;
      out.fdmsOnly.push({
        coll: r.coll,
        fdms: {
          code: trim(r.rec.code), oid: r.oid, mn: r.mn,
          name: trim(r.rec.last_name) + (trim(r.rec.first_name) ? " " + trim(r.rec.first_name) : ""),
          klass: trim(r.rec.class), status: trim(r.rec.status) || "active",
        },
        why: "in the FDMS roster and not in the Wings Ahead export",
      });
    });
    return out;
  }

  /* ── judging a row (rulings #3 · #5 · #6) ──────────────────────────────── */

  /* verdict — what the row says happened, and whether it is GRADED.
     complete / incomplete are the two mission words; "awaiting" is ruling #5's
     legitimate null and "non-graded" is ruling #3's, which never completes a
     node. `thr` is frozen onto the row here and printed beside the number. */
  function judge(row) {
    const thr = thrOf(row.band);
    const g = row.grade;
    /* A GROUND LESSON IS ATTENDED, NOT SCORED. wa.entry_keys('lessons') has no
       grade key at all, so «awaiting a grade» there would be a sentence about a
       number that can never exist. And a single course never completes its
       group by itself — only full coverage of every non-conditional course
       does (FDMS's covCore), which is why `completes` stays false. */
    if (row.band === "lessons") {
      return { verdict: "complete", graded: false, source: "attended", thr: null,
        why: "a lesson is attended, not scored — and one course never completes its group on its own" };
    }
    if (row.ng === true) {
      return { verdict: null, graded: false, source: "ng", thr: null,
        why: "non-graded by nature — nobody was in a position to score it" };
    }
    if (g != null) {
      const nonInt = g !== Math.floor(g);
      return {
        verdict: g >= thr ? "complete" : "incomplete", graded: true, source: "grade",
        thr, grade: g, nonInt,
        /* CRITIC MUST-FIX: a non-integer grade is shown IN THE REPORT ONLY.
           Nothing here writes it anywhere, and WA's own chk_grade would refuse
           the whole record if it ever tried. */
        why: nonInt ? "the grade is not a whole number — shown here, written nowhere" : "",
      };
    }
    if (row.mission) {
      return {
        verdict: row.mission, graded: false, source: "mission", thr: null,
        /* RULING #3 — mission incomplete IS non-graded. */
        why: row.mission === "incomplete"
          ? "mission incomplete — non-graded, and it never completes the node (ruling #3)"
          : "mission complete, with no percentage",
      };
    }
    return { verdict: null, graded: false, source: "awaiting", thr: null,
      why: "the debrief has not landed — «awaiting» is a legitimate state (ruling #5)" };
  }

  /* Does this row complete its FDMS node? Only a graded pass and an explicit
     mission complete do. NG and mission-incomplete never do — that is the door
     the adversarial critique asked to be nailed shut, and slice 1 nails it by
     never proposing such a row and by saying so on its face. */
  function nodeEffect(j) {
    if (j.source === "attended") return { completes: false, word: "attended" };
    if (j.source === "ng") return { completes: false, word: "non-graded" };
    if (j.source === "awaiting") return { completes: false, word: "awaiting" };
    if (j.verdict === "complete") return { completes: true, word: "complete" };
    return { completes: false, word: "incomplete" };
  }

  /* THE NON-GRADED BADGE — R18 VERIFY FINDING 1. `graded === false` is NOT the
     test, and reading it as one made the badge a lie on the ordinary row: a
     flight recorded as MISSION COMPLETE carries no percentage BY DESIGN (R2 —
     FDMS must never store a sortie as result:"score"), so it is unscored and it
     DOES complete its node. The badge printed «ruling #3 — a non-graded row
     never completes a node» on the same row whose Effect column said «completes
     the node», on 43 of the 44 rows of the live run, and the summary sentence
     «N non-graded rows (never complete a node)» counted them all.
     The badge belongs to the THREE states that genuinely never complete:
       ng        — nobody was in a position to score it (ruling #3)
       awaiting  — the debrief has not landed (ruling #5)
       incomplete without a grade — mission incomplete IS non-graded (ruling #3)
     A lesson is `attended`, never scorable, and wears no such badge; a graded
     failure is GRADED and wears the number instead. counts.nonGraded is derived
     from this one flag, so the badge and the sentence can never drift apart. */
  function isNonGraded(j) {
    if (!j || j.graded) return false;
    return j.source === "ng" || j.source === "awaiting" || j.verdict === "incomplete";
  }

  /* ══ PHASE 3 · THE CONFIRMED FILL — the writer's PURE half ════════════════
     Everything below is arithmetic on plain objects: it decides WHETHER a row
     may be written, WHAT the event would look like and WHAT it would do to the
     syllabus node. It touches no store and no DOM, so the fixtures drive it
     headlessly and the answers in the confirm dialog are the same answers the
     store gets. § ③ is the only place that calls upsert(). */

  /* THE SCOPE OF THIS SLICE. `flights` and `fs` and nothing else — the same
     scope specs/bridge-spec.md § 11 recorded for it, and each exclusion is a
     reason, not an omission:
       lessons/exams  a ground event is CLASS-scope in FDMS and reaches the
                      student through membership read at run time; writing a
                      per-student copy would freeze a fact that is supposed to
                      move, and a class change would fabricate attendance.
       evaluations    the eight checkrides have their own fixed-slot doctrine
                      on the WA side and their own evaluator rules on this one.
       solo_flights   «a student never launches alone on their own authority» —
                      the solo slots are prescribed, not filled in from a file.
       events         FAIL / ALMOST GOOD are ANNOTATIONS on a flight, NFS is a
                      form, SMS is a status plus a gate. None of them is a
                      training-log event of the shape this writer builds. */
  const APPLY_GROUPS = ["flights", "fs"];

  /* THE PRINTED-SCALE FLOOR — NOT A PASS MARK, and the difference is the whole
     lesson of the 22/08/2026 correction. 60 is the line a sortie must clear
     (THRESHOLDS, ruling #6). 50 is the floor of the «ΣΚ»/ΥΣΤΕΡΗΣΗ BAND of the
     printed ΠΔ scale, i.e. the label a mark between 50 and 59 wears — which is
     exactly what slice 1 mistook for a pass mark. It is used HERE and only here
     to choose the FDMS WORD for a mark already judged INCOMPLETE:
       ≥ thr   → «completed»            (the sortie stands)
       ≥ 50    → «lag»    ΥΣΤΕΡΗΣΗ      (owed — the node stays open)
       < 50    → «fail»   ΑΠΟΤΥΧΙΑ      (owed — the node stays open)
     Both of the last two leave the node owed in SchedReady.state(), so the
     choice between them never changes a graph — it changes the WORD, which is
     the squadron's own vocabulary and belongs in the record. */
  const LAG_FLOOR = 50;

  /* mirrors scheduler.js DEVICE_BY_KIND for the two bands this slice writes */
  const DEVICE_BY_GROUP = { flights: "T-6A", fs: "OFT" };

  /* THE PROVENANCE MARK. `id` is deterministic and DATE-FREE — the same row
     applied twice lands on the same event (upsert UPDATES, never appends), and
     a corrected date moves that one event instead of minting a second, which is
     the critique's first must-fix and the reason SchedConsq.counters() cannot
     count one FAIL twice. `origin` is the one-word greppable mark; the `bridge`
     block is the full identity plus WHAT WINGS AHEAD SAID, so that a later
     export whose row CHANGED is seen as a change and not as agreement. */
  const ORIGIN = "wa";
  const bridgeEvId = (oid, group, uid, ord) => "wa:" + oid + ":" + group + ":" + uid + ":" + ord;

  /* the FDMS result word for a judged Wings Ahead row — "" when FDMS has no
     word that would be true (see applicability() for what that means) */
  function resultOf(j) {
    if (!j) return "";
    if (j.source === "grade") {
      if (j.nonInt) return "";
      if (j.grade >= j.thr) return "completed";
      return j.grade >= LAG_FLOOR ? "lag" : "fail";
    }
    if (j.source === "mission") return j.verdict === "complete" ? "completed" : "lag";
    return "";
  }
  /* what SchedReady.state() will make of that word — the sentence the confirm
     dialog must print for every line (ruling #3). `completed` completes and
     unlocks the successors; `lag` / `fail` leave the node owed. */
  const resultCompletes = (res) => res === "completed";
  const RESULT_WORD = { completed: "MISSION COMPLETE", lag: "ΥΣΤΕΡΗΣΗ (lag)", fail: "ΑΠΟΤΥΧΙΑ (fail)" };

  /* WHY A ROW IS NOT APPLIABLE — the sentence matters more than the boolean.
     Returns "" when the row may be written.
     `need` says how much of the row the act is about, because the three acts
     answer to different rules:
       "date"   an UPDATE that moves a date and nothing else — the verdict and
                the instructor are none of its business;
       "adopt"  a per-field adoption — the row must be expressible, but the
                instructor is checked per field, where the field is offered;
       "full"   a CREATE, which is answerable for every field of the event. */
  function refuseApply(gid, j, ip, person, need, nodeUid, kindOf) {
    /* PHASE 3b · FINDING 9 — SEAM ③, THE SHARED REFUSAL. It is asked FIRST, and
       deliberately BEFORE the `need === "date"` early return: an UPDATE that
       moves a date is still a write, and a date moved onto a node that does not
       exist is the same orphan by a quieter door. `nodeUid` is empty for the
       event sections, whose rows name no node of their own and keep their own
       out-of-slice sentence. */
    const k = typeof kindOf === "function" ? kindOf : () => null;
    if (nodeUid && !k(nodeOfUid(nodeUid))) return offGraphWhy(nodeUid);
    if (APPLY_GROUPS.indexOf(gid) < 0) {
      return "this slice fills FLIGHTS and F/S only — ground lessons and exams, the eight checkrides, "
        + "the prescribed solos and the FAIL / ALMOST GOOD / NFS / SMS events each wait for a slice of "
        + "their own (specs/bridge-spec.md § 13)";
    }
    if (!person || !person.code) {
      return "this person has no FDMS code, and a training-log event names its student by code";
    }
    if (need === "date") return "";
    if (!j) return "there is nothing on the Wings Ahead side to write";
    if (j.source === "ng") {
      return "Wings Ahead records this sortie as NON-GRADED. The FDMS training log has no word for "
        + "«flown, not scorable, and still owed»: «completed» would complete the node and unlock its "
        + "successors, and «lag»/«fail» would say it must be re-flown. It is reported here and written "
        + "nowhere (rulings #3 · #5)";
    }
    if (j.source === "awaiting") {
      return "the debrief has not landed. FDMS reads an event with a blank result as COMPLETED "
        + "(SchedReady.state), so «awaiting» cannot be stored without unlocking the successors. The row "
        + "is re-offered by itself once the grade arrives (ruling #5)";
    }
    if (j.source === "attended") {
      return "a lesson is attended, not scored, and its FDMS event is class-scope — out of this slice";
    }
    if (j.source === "grade" && j.nonInt) {
      return "the grade " + j.grade + " is not a whole number — a non-integer grade is shown in this "
        + "report and written nowhere (ruling #6)";
    }
    if (!resultOf(j)) return "this row has no verdict FDMS could express";
    if (need === "adopt") return "";
    if (!ip || ip.status !== "resolved") {
      return "the instructor is not resolved — " + ((ip && ip.why) || "no instructor on the row")
        + ". An event is never written with an identity guessed from a name (ruling #4)";
    }
    return "";
  }

  /* THE FIELDS OF A PAYLOAD DIFFERENCE THIS SLICE CAN ADOPT — and only those
     the report ALREADY SHOWS ON BOTH SIDES, which is the binding rule. A field
     the table does not print side by side is not adoptable, however easy it
     would be to write. */
  const ADOPTABLE = ["verdict", "grade (Wings Ahead)", "instructor"];

  /* the event the bridge would write for a wa_only row — every field it owns is
     named, empty ones included, because SchedStore.upsert MERGES: a re-write
     that omitted `maneuvers` would leave yesterday's lag reasons on today's
     pass (the critique's tenth must-fix). */
  function buildEvent(p) {
    return {
      id: p.evId,
      origin: ORIGIN,
      bridge: {
        rid: p.rid, oid: p.oid, group: p.group, uid: p.uid, ord: p.ord, seq: p.seq,
        src: p.src, applied_at: p.at, applied_by: p.who, export_at: p.exportAt || "",
      },
      node: p.uid, kind: p.group, scope: "student", student: p.student,
      class: "", classes: undefined, special: undefined, category: undefined, ref: undefined,
      date: p.date, start_date: "", end_date: "",
      instructor: p.ip, device: p.device,
      result: p.result,
      /* R2 — a sortie is NEVER stored as result:"score". Two engines read that
         field with two different thresholds and the same row would be
         «completed» for one and «repeat» for the other. The number itself is
         kept in `bridge.src.grade`, where no engine reads it and the next
         cross-check can see whether Wings Ahead has changed it since. */
      score: null,
      maneuvers: p.result === "lag" || p.result === "fail" ? p.maneuvers || "" : "",
      note: p.note, absent: [],
    };
  }

  /* ── normalising the two sides into one row shape ──────────────────────── */

  function baseRow(side, sec, band, uid, seq, date) {
    return {
      side, sec, band, uid, seq: posInt(seq, 1), date: isoDate(date),
      end_date: "", grade: null, ng: false, mission: "", duration: null,
      kind: "", track: "", instructor: "", instructorOid: "",
      extra: {}, srcId: "", srcNote: "", waWritten: false,
      /* PHASE 3 — what a bridge-written FDMS event remembers about its source.
         `bridgeGrade` is the percentage Wings Ahead carried WHEN THE EVENT WAS
         WRITTEN. It is never a grade of the FDMS event (R2 keeps the number out
         of `result`/`score` for a sortie); it exists so that a later export in
         which the student CHANGED the number is a difference and not silence. */
      bridgeGrade: null, bridgeBlock: null,
      problems: [], raw: null,
    };
  }

  /* the immutable per-row uid, per section — the DATE IS NEVER IN IT */
  function waUid(sec, e) {
    if (sec === "evaluations") return up(e.evaluation) ? "s:" + up(e.evaluation) : "";
    if (sec === "solo_flights") return up(e.sortie) ? "s:" + up(e.sortie) : "";
    if (sec === "flights" || sec === "fs") return up(e.sortie) ? "s:" + up(e.sortie) : "";
    if (sec === "fail" || sec === "almost_good") return up(e.flight_code) ? "s:" + up(e.flight_code) : "";
    if (sec === "airsickness") return up(e.flight_code) ? "s:" + up(e.flight_code) : "";
    if (sec === "lessons") {
      const g = up(e.group);
      /* the course is part of the identity: (group, course) is the join key
         FDMS's own parseGroupCourses produces, never the code alone. */
      return g ? "g:" + g + "::" + (trim(e.course) || "*") : "";
    }
    if (sec === "exams") {
      if (up(e.exam)) return "g:" + up(e.exam);
      /* the ΕΕΘ weekly theory series names no exam — FDMS's graph has no node
         for it at all, so it is refused with the rule, not silently dropped. */
      if (trim(e.series)) return "eeth:" + up(e.series);
      return "";
    }
    if (sec === "nfs") return "ev:nfs@" + isoDate(e.date);
    if (sec === "sms") return "ev:sms@" + isoDate(e.entrance_date);
    return "";
  }

  function waRow(oid, sec, e) {
    const meta = WA_SECTIONS[sec];
    const uid = waUid(sec, e);
    /* exams: a re-sit is a TRIAL, which is exactly an attempt — so it feeds
       the ordinal, not a second identity. Series rows use series_no. */
    const seq = sec === "exams" ? posInt(e.trial, posInt(e.series_no, 1))
      : sec === "sms" ? 1
        : posInt(e.seq, 1);
    const r = baseRow("wa", sec, meta.band, uid, seq,
      sec === "sms" ? e.entrance_date : e.date);
    r.raw = e;
    r.end_date = isoDate(e.end_date) || isoDate(e.exit_date);
    r.grade = num(e.grade);
    r.ng = e.ng === true;
    r.mission = MISSIONS.indexOf(trim(e.mission)) >= 0 ? trim(e.mission) : "";
    r.duration = num(e.duration);
    r.kind = trim(e.kind);
    r.track = trim(e.track);
    r.instructor = trim(e.instructor) || trim(e.with);
    r.instructorOid = normOid(e.instructor_oid);
    r.extra = {
      slot: trim(e.slot), evaluation: up(e.evaluation), exam: up(e.exam),
      trial: posInt(e.trial, 0) || null, series: trim(e.series), series_no: posInt(e.series_no, 0) || null,
      group: up(e.group), course: trim(e.course),
      category: trim(e.category), flight_code: up(e.flight_code),
      items: arr(e.items).map(trim).filter(Boolean),
      reason: trim(e.reason), note: trim(e.note),
      entered_by: trim(e.entered_by), legacy: e.legacy === true,
    };
    r.problems = waRowProblems(sec, r, e);
    return r;
  }

  /* MIRRORED WA VALIDATION — only the rules a read-only reader can check, and
     only so that a row which could never have been written is SEEN as such
     (class `unwritten`) instead of being proposed. Nothing here writes. */
  function waRowProblems(sec, r, e) {
    const p = [];
    const dated = sec === "sms" ? isoDate(e.entrance_date) : isoDate(e.date);
    if (!dated) p.push("no valid date — every entry is dated (only the grade lags)");
    if (!r.uid) p.push("the row names nothing this side can join on (no sortie / group / exam code)");
    if (r.grade != null && (r.grade < 0 || r.grade > 100)) p.push("grade outside 0-100");
    if (r.grade != null && r.grade !== Math.floor(r.grade)) {
      p.push("grade " + r.grade + " is not a whole number — wa.chk_grade would refuse the whole record");
    }
    if (r.ng && r.grade != null) p.push("NG and a grade together — a non-graded flight is not scorable");
    if (r.mission && r.grade != null) p.push("a mission beside a grade — the mission is READ from the grade");
    if (r.mission && r.ng) p.push("a mission on an NG row — an NG flight carries neither grade nor mission");
    if (trim(e.mission) && !r.mission) p.push("unknown mission «" + trim(e.mission) + "» — " + MISSIONS.join(" / "));
    if ((sec === "flights" || sec === "fs")) {
      if (!trim(e.instructor)) p.push("no instructor — a student never launches alone on their own authority");
      if (r.track && TRACKS.indexOf(r.track) < 0) p.push("unknown track «" + r.track + "»");
      if (r.kind && FLIGHT_KINDS.indexOf(r.kind) < 0) p.push("unknown flight kind «" + r.kind + "»");
      if (posInt(e.seq, 1) > 20) p.push("seq above 20");
    }
    return p;
  }

  /* ── the FDMS side ─────────────────────────────────────────────────────── */

  const evNodeOf = (ev) => trim(ev && (ev.node || ev.uid));
  /* AN EVENT THE BRIDGE ITSELF WROTE. Two marks, and either one is enough: the
     `wa:` id convention slice 1 already recognised (so that `deleted` could
     exist before anything was written — ruling #2), and the `origin` word
     Phase 3 stamps beside it. Two marks because an id can be rewritten by hand
     in a restored backup and a word cannot be greppable by accident. */
  const isWaWritten = (ev) => /^wa:/i.test(trim(ev && ev.id))
    || trim(ev && ev.origin).toLowerCase() === ORIGIN;
  const bridgeBlockOf = (ev) => (isObj(ev) && isObj(ev.bridge) ? ev.bridge : null);

  function fdmsRow(oid, ev, band, groupId, course) {
    const node = evNodeOf(ev);
    const uid = groupId === "lessons"
      ? node + "::" + (trim(course) || "*")
      : node;
    const blk = bridgeBlockOf(ev);
    /* PHASE 3 — THE SEQ OF A BRIDGE-WRITTEN EVENT IS A FACT OF THE ROW, not a
       position in an array (ruling #1). An ordinary FDMS event has no seq and
       keeps the store's array order as its tie-break, exactly as slice 1 read
       it; an event the bridge wrote carries the Wings Ahead seq it came from,
       so re-loading the same export pairs the two halves EXACTLY instead of
       leaning on the leftovers pass. */
    const r = baseRow("fdms", groupId, band, uid, blk ? posInt(blk.seq, 1) : 1,
      trim(ev.date) || trim(ev.start_date));
    r.raw = ev;
    r.srcId = trim(ev.id);
    r.waWritten = isWaWritten(ev);
    r.bridgeBlock = blk;
    if (blk && isObj(blk.src)) r.bridgeGrade = num(blk.src.grade);
    r.end_date = isoDate(ev.end_date);
    r.instructor = trim(ev.instructor);
    r.extra = {
      result: trim(ev.result), score: num(ev.score), device: trim(ev.device),
      note: trim(ev.note), maneuvers: trim(ev.maneuvers), scope: trim(ev.scope),
      course: trim(course), periods_done: num(ev.periods_done),
      special: trim(ev.special), category: trim(ev.category),
    };
    /* the FDMS verdict, expressed in the same two words as WA's mission */
    const res = trim(ev.result);
    if (res === "score") {
      r.grade = num(ev.score);
    } else if (res === "completed") {
      r.mission = "complete";
    } else if (res === "lag" || res === "repeat" || res === "fail") {
      r.mission = "incomplete";
    } else {
      /* R1, and it is worth a report line every time: a blank result is not
         "awaiting" in FDMS — SchedReady.state() falls through to COMPLETED and
         unlocks the successors. The report says so on the row. */
      r.problems.push("FDMS records no result — the readiness engine reads a blank result as COMPLETED and unlocks the successors");
      r.mission = "complete";
    }
    return r;
  }

  /* ── pairing inside one (oid, group, uid) bucket ───────────────────────── */

  const ordKey = (r, i) => [r.date || "9999-99-99", String(r.seq).padStart(3, "0"), String(i).padStart(4, "0")].join("|");
  function sortRows(list) {
    return list.map((r, i) => ({ r, k: ordKey(r, i) }))
      .sort((a, b) => (a.k < b.k ? -1 : a.k > b.k ? 1 : 0))
      .map((x) => x.r);
  }

  /* TWO PASSES, so a moved date is one deviation and never a delete plus an
     add (the critique's first must-fix, proven in the fixtures):
       1 · exact (date, seq) pairs — the ordinary case;
       2 · the leftovers, in date order, paired by their own ordinal — this is
           the pass that recognises a corrected date as the SAME attempt. */
  function pairGroup(waList, fdList) {
    const w = sortRows(waList), f = sortRows(fdList);
    const pairs = [], usedW = new Set(), usedF = new Set();
    const key = (r) => r.date + "#" + r.seq;
    const fBy = new Map();
    f.forEach((r, i) => {
      const k = key(r);
      if (!fBy.has(k)) fBy.set(k, []);
      fBy.get(k).push(i);
    });
    w.forEach((r, i) => {
      const bucket = fBy.get(key(r));
      if (!bucket || !bucket.length) return;
      const j = bucket.shift();
      usedW.add(i); usedF.add(j);
      pairs.push({ wa: r, fdms: f[j], exact: true });
    });
    const leftW = w.filter((_, i) => !usedW.has(i));
    const leftF = f.filter((_, j) => !usedF.has(j));
    const n = Math.min(leftW.length, leftF.length);
    for (let i = 0; i < n; i++) pairs.push({ wa: leftW[i], fdms: leftF[i], exact: false });
    return {
      pairs,
      waOnly: leftW.slice(n),
      fdmsOnly: leftF.slice(n),
      /* ord is assigned over the whole bucket in one stable order, so both
         halves of a pair always carry the same number */
      order: [].concat(pairs.map((p) => p.wa), leftW.slice(n), leftF.slice(n)),
    };
  }

  /* ── comparing a paired row ────────────────────────────────────────────── */

  /* R2, and it decides what counts as a difference: FDMS must NEVER store a
     sortie as result:"score" — two engines read that field with two different
     thresholds and the same row would be «completed» for one and «repeat» for
     the other. So a percentage in Wings Ahead beside a bare PASS in FDMS is the
     NORMAL state of a flight, not a deviation. A GROUND EXAM is the one place
     FDMS does carry the number, and there a missing one is worth saying. */
  const carriesNumber = (band) => band === "exams";

  function compareRow(pw, pf, ipResolve) {
    const jw = judge(pw), jf = judge(pf);
    const diffs = [];
    const softVerdict = (j) => (j.source === "ng" || j.source === "awaiting");
    if (jw.verdict !== jf.verdict || softVerdict(jw) !== softVerdict(jf)) {
      diffs.push({
        field: "verdict",
        wa: verdictWord(jw), fdms: verdictWord(jf),
        why: "the two sides disagree about how the sortie went",
      });
    }
    if (pw.grade != null && pf.grade != null && pw.grade !== pf.grade) {
      diffs.push({ field: "grade", wa: String(pw.grade), fdms: String(pf.grade),
        why: "two numbers for one flight" });
    } else if (pw.grade != null && pf.grade == null && carriesNumber(pw.band) && jf.source !== "awaiting") {
      diffs.push({ field: "grade", wa: String(pw.grade), fdms: "—",
        why: "a ground exam is scored in both systems and FDMS carries no number here" });
    } else if (pw.grade == null && pf.grade != null && carriesNumber(pw.band)) {
      diffs.push({ field: "grade", wa: "—", fdms: String(pf.grade),
        why: "FDMS has the percentage and Wings Ahead has only a verdict" });
    }
    /* PHASE 3 — THE DRIFT AGAINST WHAT THE BRIDGE WAS TOLD. A flight does not
       carry its percentage in FDMS by design (R2), so two grades that map to
       the SAME verdict — 78 corrected to 84, both passes — would otherwise be
       perfect silence: same date, same verdict, same instructor, class `agree`.
       An event the bridge wrote remembers the number it was given, so a student
       who corrects it is SEEN, and the row becomes `payload_differs` against
       the bridge's own event. This diff exists only on rows the bridge wrote;
       a hand-typed FDMS event has nothing to have been told. */
    if (pf.bridgeGrade != null && pw.grade != null && pw.grade !== pf.bridgeGrade) {
      diffs.push({ field: "grade (Wings Ahead)", wa: String(pw.grade), fdms: String(pf.bridgeGrade),
        why: "the bridge wrote this event from a Wings Ahead grade of " + pf.bridgeGrade
          + " % and Wings Ahead now says " + pw.grade + " %" });
    } else if (pf.bridgeGrade != null && pw.grade == null) {
      diffs.push({ field: "grade (Wings Ahead)", wa: "—", fdms: String(pf.bridgeGrade),
        why: "the bridge wrote this event from a Wings Ahead grade of " + pf.bridgeGrade
          + " % and the Wings Ahead row no longer carries one" });
    }
    const ip = ipResolve(pw);
    if (ip.status === "ambiguous") {
      diffs.push({ field: "instructor", wa: pw.instructor, fdms: pf.instructor || "—",
        why: ip.why, blocking: true });
    } else if (ip.status === "resolved" && pf.instructor && ip.code && ip.code !== pf.instructor) {
      diffs.push({ field: "instructor", wa: ip.label, fdms: pf.instructor, why: "different instructor" });
    } else if (ip.status === "unknown" && pw.instructor && pf.instructor
      && normName(pw.instructor).indexOf(normName(pf.instructor)) < 0) {
      diffs.push({ field: "instructor", wa: pw.instructor, fdms: pf.instructor,
        why: "different instructor (matched by surname — no OID on the row)" });
    }
    if (pw.end_date && pf.end_date && pw.end_date !== pf.end_date) {
      diffs.push({ field: "end date", wa: pw.end_date, fdms: pf.end_date, why: "the block ends on a different day" });
    }
    if (pw.extra.course && pf.extra.course && pw.extra.course !== pf.extra.course) {
      diffs.push({ field: "course", wa: pw.extra.course, fdms: pf.extra.course, why: "different course" });
    }
    /* RULING #8 — duration is WA-only until slice 6. It is never a difference,
       because FDMS has no field to differ with; it is shown as what it is. */
    return { diffs, jw, jf, duration: pw.duration };
  }

  function verdictWord(j) {
    if (j.source === "attended") return "attended";
    if (j.source === "ng") return "NON-GRADED (NG)";
    if (j.source === "awaiting") return "awaiting a grade";
    if (j.source === "grade") return (j.verdict === "complete" ? "COMPLETE" : "INCOMPLETE")
      + " · " + j.grade + " % vs " + j.thr + " %";
    return j.verdict === "complete" ? "mission COMPLETE" : "mission INCOMPLETE";
  }

  /* ══ the cross-check ═════════════════════════════════════════════════════ */

  /* opts:
       kindOf(uid)     → "flights"|"fs"|"lessons"|"exams"|null   (SchedReady)
       membersOf(cls)  → [studentCode]                            (SchedStore)
       today           → "YYYY-MM-DD"
     fdms:
       { students, instructors, trainingLog }                     (SchedStore) */
  function crossCheck(waParsed, fdms, opts) {
    const o = opts || {};
    const kindOf = typeof o.kindOf === "function" ? o.kindOf : () => null;
    const membersOf = typeof o.membersOf === "function" ? o.membersOf : () => [];
    const students = arr(fdms && fdms.students);
    const instructors = arr(fdms && fdms.instructors);
    const log = arr(fdms && fdms.trainingLog);
    /* PHASE 4/5 — the push ledger rides in beside the store so the report can
       tell the bridge's own echo from a stranger's (D.3). It is read, never
       written, here: § ② is still the only writer in this file. */
    const ledger = arr(fdms && fdms.bridgePush).filter(isObj);

    const ids = matchPeople(waParsed.people, students, instructors);

    /* instructor resolution, per ruling #4 and the surname-collision fact:
       OID first; a surname that matches more than one ACTIVE instructor is
       reported, never guessed. */
    const ipByOid = new Map(), ipBySurname = new Map();
    instructors.forEach((i) => {
      if (!isObj(i)) return;
      const oid = normOid(i.oid);
      if (oid) ipByOid.set(oid, i);
      if ((trim(i.status) || "active") === "departed") return;
      const sn = normName(i.last_name);
      if (!sn) return;
      if (!ipBySurname.has(sn)) ipBySurname.set(sn, []);
      ipBySurname.get(sn).push(i);
    });
    const ipLabel = (i) => trim(i.last_name) + (trim(i.first_name) ? " " + trim(i.first_name).charAt(0) + "." : "")
      + (trim(i.code) ? " (" + trim(i.code) + ")" : "");
    function ipResolve(row) {
      if (row.instructorOid) {
        const hit = ipByOid.get(row.instructorOid);
        if (hit) return { status: "resolved", code: trim(hit.code), label: ipLabel(hit) };
        return { status: "ambiguous", why: "instructor OID " + row.instructorOid + " is not in the FDMS roster" };
      }
      const sn = normName(row.instructor);
      if (!sn) return { status: "unknown", why: "no instructor on the row" };
      const hits = ipBySurname.get(sn) || [];
      if (hits.length === 1) return { status: "resolved", code: trim(hits[0].code), label: ipLabel(hits[0]) };
      if (hits.length > 1) {
        return { status: "ambiguous", why: "the surname «" + trim(row.instructor) + "» matches "
          + hits.length + " active FDMS instructors and the row carries no instructor OID — "
          + "an identity is never guessed by name (ruling #4)" };
      }
      return { status: "unknown", why: "«" + trim(row.instructor) + "» is not an FDMS instructor surname" };
    }

    const recByWaId = new Map();
    arr(waParsed.records).forEach((r) => {
      const id = trim(r.student_id);
      if (id) recByWaId.set(id, r);
    });

    const rows = [];
    const notes = [];
    const persons = [];

    /* rows for a person whose identity could not be resolved are LISTED, not
       compared — never guessed (ruling #4) */
    ids.ambiguous.concat(ids.waOnly).forEach((u) => {
      const rec = recByWaId.get(u.wa.waId);
      const n = rec ? countRecordRows(rec) : 0;
      const row = noteRow("unresolvable", "identity",
        { oid: u.wa.oid || "(none)", code: "", name: u.wa.name, klass: u.wa.klass });
      row.detail = u.why;
      row.extra = n ? n + " Wings Ahead row" + (n === 1 ? "" : "s")
        + " behind this identity, none of them compared" : "no rows behind this identity";
      rows.push(row);
    });

    ids.matched.forEach((m) => {
      if (m.coll !== "students") return;              // instructors carry no record
      const rec = recByWaId.get(m.wa.waId);
      const oid = m.fdms.oid || m.wa.oid;
      const person = {
        oid, code: m.fdms.code, name: m.fdms.name || m.wa.name,
        waName: m.wa.name, via: m.via, klass: m.fdms.klass, waKlass: m.wa.klass,
        status: m.fdms.status, waActive: m.wa.active,
        divergences: m.divergences.slice(), classMove: m.classMove,
        counts: {}, groundDivergence: 0,
      };
      persons.push(person);

      /* CLASS MOVE — ruling #4. FDMS reads class membership LIVE, so a move
         retroactively rewrites the student's ground history; WA's rows are
         frozen at the moment they were typed. Reported, never auto-written,
         and the FC closes the deviations report manually once. */
      if (m.classMove) {
        const row = noteRow("payload_differs", "identity", person);
        row.diffs = [{ field: "class", wa: m.classMove.wa, fdms: m.classMove.fdms,
          why: "a class move — reported, never auto-written (ruling #4)" }];
        row.detail = "FDMS derives ground history from the CURRENT class at read time, so this student's "
          + "lessons and exams in FDMS are the new class's. The Wings Ahead rows are frozen at the "
          + "moment they were typed. The deviations report this produces is closed manually, once, "
          + "and only the developer changes a class (ruling #4).";
        rows.push(row);
      }

      /* THE RECORD ITSELF — is it writable at all? (class `unwritten`) */
      const recProblems = [];
      if (!rec) recProblems.push("the export carries no student_record for this person");
      if (m.wa.active === false) recProblems.push("the Wings Ahead person is INACTIVE — their record cannot be written at all");
      if (m.wa.role && m.wa.role !== "student") recProblems.push("the Wings Ahead role is «" + m.wa.role + "», not student");
      if (rec) {
        const shred = shredCheck(rec);
        if (shred) recProblems.push(shred);
      }

      /* R18 VERIFY FINDING 2 — A RECORD WARNING MUST HAVE A CARRIER.
         `recProblems` is not about one row: it is about the whole record. The
         table can only show it by hanging it on rows, and in the shred's own
         headline case there are no rows to hang it on — migrate_record dropped
         a WHOLE section, so Wings Ahead contributes nothing on those nodes, and
         if FDMS is empty there too the person contributes no line at all. The
         report then reads CLEAN, which is the worst lie this pane could tell.
         withRec() is the ONE door every row-level concat goes through, so
         `recCarried` means exactly «a row carrying these words was pushed»; a
         warning that found no carrier becomes a note of its own (report.notes,
         painted in the Identities panel, never silent). */
      let recCarried = false;
      const withRec = (list) => {
        if (recProblems.length) recCarried = true;
        return arr(list).concat(recProblems);
      };

      const waRows = [];
      if (rec) {
        const data = isObj(rec.data) ? rec.data : {};
        WA_SECTION_IDS.forEach((sec) => {
          arr(data[sec]).forEach((e) => {
            if (!isObj(e)) return;
            if (isEmptySlot(sec, e)) return;             // an unflown fixed slot is a placeholder
            waRows.push(waRow(oid, sec, e));
          });
        });
      }

      /* THE FDMS SIDE — student-scope events plus the class-scope ground
         events that reach this student through current membership. */
      const fdRows = [];
      /* the specials (NFS today) have no node at all, so they can never be
         bucketed by uid — they are matched in the EVENT pass below, and what
         stays unmatched is emitted there. Keeping them out of fdRows is what
         stops one NFS being reported twice. */
      const fdSpecials = [];
      /* PHASE 3b · FINDING 9 — THE DEFENSIVE READ. An event the store holds on
         a node the graph does not carry used to be dropped on the floor by the
         one line `if (!band) return`, and that line is what made the hole
         invisible from BOTH ends: the pane could create such an event and then
         could not show it, so the row stayed `wa_only` and every further click
         minted another orphan. These are collected instead, and emitted below
         as visible `fdms_only` rows of their own. */
      const fdOffGraph = [];
      log.forEach((ev) => {
        if (!isObj(ev)) return;
        const node = evNodeOf(ev);
        if (!node) {
          if (trim(ev.special) && trim(ev.student) === person.code) fdSpecial(ev, person, fdSpecials);
          return;
        }
        /* the reach test comes FIRST now: an event that never reaches this
           student is not this student's orphan either, and asking the graph
           about it would list one stray node once per member of the school. */
        const scope = trim(ev.scope);
        if (scope === "student") {
          if (trim(ev.student) !== person.code) return;
        } else {
          const cls = arr(ev.classes).length ? arr(ev.classes) : [trim(ev.class)].filter(Boolean);
          const reaches = cls.some((c) => arr(membersOf(c)).indexOf(person.code) >= 0);
          if (!reaches) return;
          const absent = arr(ev.absent).some((a) => isObj(a) && trim(a.student) === person.code);
          if (absent) return;                           // the class sat it, this student did not
        }
        const band = kindOf(node);
        if (!band) {
          /* a SPECIAL (NFS today) is outside the graph BY NATURE and has its own
             pass — it is not an off-catalogue node, it is a form. */
          if (!trim(ev.special)) fdOffGraph.push(fdmsRow(oid, ev, "", "off_graph", ev.course));
          return;
        }
        const g = groupOfNode(node, band, waRows);
        fdRows.push(fdmsRow(oid, ev, band, g, ev.course));
      });

      /* ── bucket, pair, classify ─────────────────────────────────────── */
      const buckets = new Map();
      const bucketOf = (r) => {
        const gid = groupIdOfRow(r);
        const k = gid + "\u0000" + r.uid;
        if (!buckets.has(k)) buckets.set(k, { gid, uid: r.uid, wa: [], fdms: [] });
        return buckets.get(k);
      };
      waRows.forEach((r) => {
        if (WA_SECTIONS[r.sec].group === "events") return;   // handled below
        bucketOf(r)[r.side].push(r);
      });
      fdRows.forEach((r) => bucketOf(r)[r.side].push(r));

      buckets.forEach((b) => {
        const res = pairGroup(b.wa, b.fdms);
        let ord = 0;
        const emit = (o) => {
          ord += 1;
          return { ord, rid: [oid, b.gid, b.uid, ord].join(" ∷ ") };
        };
        res.pairs.forEach((pr) => {
          const id = emit();
          const refused = refusalOf(pr.wa, b.gid, kindOf);
          const cmp = compareRow(pr.wa, pr.fdms, ipResolve);
          const bad = withRec(pr.wa.problems);
          /* an identity that cannot be resolved is class 5, not class 4: the
             surname collision the recon named is a BLOCKED row, not a
             disagreement about payload (ruling #4 — never guessed by name). */
          const blocked = cmp.diffs.some((d) => d.blocking);
          let cls;
          if (bad.length) cls = "unwritten";
          else if (refused) cls = "refused";
          else if (blocked) cls = "unresolvable";
          else if (pr.wa.date !== pr.fdms.date) cls = "source_moved";
          else if (cmp.diffs.length) cls = "payload_differs";
          else cls = "agree";
          const prow = mkRow(cls, b.gid, person, b.uid, id, pr.wa, pr.fdms, cmp, refused, bad);
          if (offGraph(pr.wa, kindOf)) noNodeEffect(prow);
          rows.push(prow);
        });
        res.waOnly.forEach((r) => {
          const id = emit();
          const refused = refusalOf(r, b.gid, kindOf);
          const bad = withRec(r.problems);
          const j = judge(r);
          const cls = bad.length ? "unwritten" : refused ? "refused" : "wa_only";
          const row = mkRow(cls, b.gid, person, b.uid, id, r, null,
            { diffs: [], jw: j, jf: null, duration: r.duration }, refused, bad);
          if (offGraph(r, kindOf)) noNodeEffect(row);
          /* WHY a Wings-Ahead-only row is not simply "propose it": each of the
             three non-graded states says something different, and the sentence
             must be the one that is true (rulings #3 and #5). */
          if (cls === "wa_only") {
            if (j.source === "awaiting") {
              row.detail = "reported, awaiting a grade — not proposable (ruling #5)";
            } else if (j.source === "ng") {
              row.detail = "non-graded by nature — reported, and it would never complete the node (ruling #3)";
            } else if (j.source === "attended") {
              row.detail = "the student's own record of a lesson FDMS has no matching event for";
            }
          }
          rows.push(row);
        });
        res.fdmsOnly.forEach((r) => {
          const id = emit();
          /* RULING #2 — a bridge-written FDMS row whose source has vanished is
             not "FDMS only": it is a DELETION at source, and it needs the
             developer's tombstone and a change-log line before anything acts. */
          const cls = r.waWritten ? "deleted" : "fdms_only";
          /* R18 VERIFY FINDING 2 — the record's own problems ride HERE too, not
             only on the paired and WA-only rows. This is the branch the shred
             lands in: a section migrate_record dropped leaves the WA side with
             nothing, so every surviving FDMS event on it arrives as fdms_only —
             and it was the ONE branch that dropped the warning on the floor.
             The class is still decided by the source, never by `bad`: an event
             FDMS holds is not «unwritten», whatever the WA record says. */
          const row = mkRow(cls, b.gid, person, b.uid, id, null, r,
            { diffs: [], jw: null, jf: judge(r), duration: null }, "", withRec(r.problems));
          if (cls === "deleted") {
            row.detail = "the bridge wrote this FDMS event (id " + r.srcId + ") and its Wings Ahead source "
              + "is gone — delete only with the developer's OK, as a tombstone, with a change-log line "
              + "for rollback (ruling #2)";
          }
          rows.push(row);
        });
      });

      /* ── the event sections: FAIL · ALMOST GOOD · NFS · SMS · airsickness ── */
      waRows.forEach((r) => {
        if (WA_SECTIONS[r.sec].group !== "events") return;
        const id = { ord: 1, rid: [oid, "events", r.uid || r.sec, 1].join(" ∷ ") };
        const bad = withRec(r.problems);
        /* the counterpart is claimed BEFORE the class is decided: a row the
           record makes unwritable is still THE row for that event, and leaving
           its FDMS half unclaimed would report one NFS twice. */
        const nfsHit = r.sec === "nfs" ? fdSpecials.find((f) => !f.claimed && f.uid === r.uid) : null;
        if (nfsHit) nfsHit.claimed = true;
        if (bad.length) {
          rows.push(mkRow("unwritten", "events", person, r.uid, id, r, nfsHit || null,
            { diffs: [], jw: judge(r), jf: nfsHit ? judge(nfsHit) : null, duration: null }, "", bad));
          return;
        }
        if (r.sec === "airsickness") {
          rows.push(mkRow("refused", "events", person, r.uid, id, r, null,
            { diffs: [], jw: judge(r), jf: null, duration: null },
            "FDMS's training log has no airsickness event — the fact lives only in Wings Ahead", []));
          return;
        }
        if (r.sec === "sms") {
          const gate = arr(fdms.gates).find((g) => isObj(g) && trim(g.student) === person.code
            && trim(g.type) === "kepe_entry");
          const open = gate && trim(gate.outcome) === "open";
          const waOpen = !r.end_date;
          const agree = (person.status === "kepe") === waOpen && (!!open === waOpen);
          rows.push(mkRow(agree ? "agree" : "payload_differs", "events", person, r.uid, id, r, null,
            { diffs: agree ? [] : [{ field: "SMS state",
              wa: waOpen ? "OPEN since " + r.date : "closed " + r.end_date,
              fdms: "student status «" + person.status + "»" + (gate ? " · kepe_entry gate " + trim(gate.outcome) : " · no kepe_entry gate"),
              why: "Wings Ahead records the episode; FDMS records the STATUS and the gate" }],
            jw: judge(r), jf: null, duration: null }, "", []));
          return;
        }
        if (r.sec === "nfs") {
          rows.push(mkRow(nfsHit ? "agree" : "wa_only", "events", person, r.uid, id, r, nfsHit || null,
            { diffs: [], jw: judge(r), jf: nfsHit ? judge(nfsHit) : null, duration: null }, "", []));
          return;
        }
        /* fail / almost_good are ANNOTATIONS ON a flight, never a second row
           for it: they are cross-referenced against the event already
           classified above, and they never consume one. */
        const want = r.sec === "fail" ? "incomplete" : "incomplete";
        const target = fdRows.filter((f) => f.uid === r.uid);
        const same = target.filter((f) => f.date === r.date);
        let cls = "wa_only", diffs = [], detail = "";
        if (target.length) {
          const t = same.length ? same[0] : target[0];
          const jt = judge(t);
          if (jt.verdict === want) {
            cls = same.length ? "agree" : "source_moved";
            detail = same.length ? "" : "FDMS records the same verdict on " + t.date;
          } else {
            cls = "payload_differs";
            diffs = [{ field: "verdict", wa: (r.sec === "fail" ? "FAIL" : "ALMOST GOOD")
              + (r.grade != null ? " · " + r.grade + " %" : ""),
              fdms: verdictWord(jt),
              why: "Wings Ahead records a gradesheet " + (r.sec === "fail" ? "FAIL" : "ALMOST GOOD")
                + " and FDMS does not record it as incomplete" }];
          }
          rows.push(mkRow(cls, "events", person, r.uid, id, r, same.length ? same[0] : target[0],
            { diffs, jw: judge(r), jf: judge(same.length ? same[0] : target[0]), duration: null }, "", []));
        } else {
          const row = mkRow("wa_only", "events", person, r.uid, id, r, null,
            { diffs: [], jw: judge(r), jf: null, duration: null }, "", []);
          row.detail = "FDMS has no event on " + r.uid + " for this student";
          rows.push(row);
        }
      });

      /* THE ORPHANS, SAID OUT LOUD (Phase 3b · finding 9). One row per event
         the store holds on a node the syllabus does not carry — `fdms_only`,
         with the sentence, in a group of its own so it is never mistaken for a
         flight the FC is waiting on. It carries no apply plan (makePlan answers
         only to wa_only / source_moved / payload_differs), so the report SEES
         it and can still write nothing about it. */
      let offOrd = 0;
      fdOffGraph.forEach((f) => {
        offOrd += 1;
        const row = mkRow("fdms_only", "off_graph", person, f.uid,
          { ord: offOrd, rid: [oid, "off_graph", f.uid, offOrd].join(" ∷ ") }, null, f,
          { diffs: [], jw: null, jf: judge(f), duration: null }, "", withRec(f.problems));
        /* the Effect column asks the ROW, and judge() would read a stored
           `result: "completed"` and print «completes the node» about a node
           that does not exist. The honest answer is the absence itself. */
        noNodeEffect(row);
        row.detail = offGraphSeen(f);
        rows.push(row);
      });

      /* an FDMS special no Wings Ahead row claimed */
      fdSpecials.forEach((f) => {
        if (f.claimed) return;
        rows.push(mkRow("fdms_only", "events", person, f.uid,
          { ord: 1, rid: [oid, "events", f.uid, 1].join(" ∷ ") }, null, f,
          { diffs: [], jw: null, jf: judge(f), duration: null }, "", f.problems));
      });

      /* A RECORD WARNING THAT FOUND NO CARRIER (R18 verify finding 2 · 6).
         The table below is about to say NOTHING about this record, and an empty
         table is read as a clean one. It is not clean: it is silent, and the
         reason it is silent is the warning itself. So the warning is promoted
         to a note of its own — the one place in this report that speaks about a
         person without a row to speak through. */
      if (recProblems.length && !recCarried) {
        notes.push({
          kind: "record", oid, code: person.code, who: person.name,
          klass: person.klass, waName: person.waName,
          problems: recProblems.slice(),
          why: "no deviation row in this report carries this warning — the table below is SILENT "
            + "about this record, which is not the same thing as clean",
        });
      }

      /* ground-history divergence count for the person header (ruling #4) */
      person.groundDivergence = rows.filter((x) => x.oid === oid
        && (x.group === "lessons" || x.group === "exams")
        && x.cls !== "agree").length;
    });

    /* PHASE 3 — ONE PASS, AT THE END, FOR THE WHOLE REPORT.
       `key` is the row's address for every control in the pane: the row
       identity (rid) is unique inside a bucket but the event sections mint one
       per uid, so two FAIL annotations on one flight code could share it — an
       Apply button must never be able to point at the wrong line.
       `plan` is built here, once, from the two sides mkRow() kept beside the
       flattened row, so that the pane, the confirm dialog, the change log and
       the fixtures all read the SAME answer. */
    let appliable = 0;
    rows.forEach((x, i) => {
      x.key = "r" + i;
      x.plan = makePlan(x, ipResolve, waParsed.exported_at, kindOf, ledger);
      if (x.plan) x.plan.key = x.key;
      if (x.plan && x.plan.can) appliable += 1;
      /* D.3's second half — an fdms-stamped Wings Ahead row THIS store's ledger
         has never heard of is an IDENTITY question, and it is promoted to a note
         of its own for the same reason a record warning with no carrier is: a
         line whose sentence nobody reads is a line that was not said. */
      const ec = x._wa ? echoOf(x._wa, x.oid, ledger) : null;
      if (ec && !ec.known && (x.cls === "wa_only" || x.cls === "source_moved" || x.cls === "payload_differs")) {
        notes.push({ kind: "echo", oid: x.oid, code: x.code, who: x.who, klass: x.klass,
          problems: [x.uid + " of " + (x.waDate || "an unrecorded date")], why: ec.why });
      }
    });

    /* counts */
    const byClass = {};
    CLASS_IDS.forEach((c) => { byClass[c] = 0; });
    const byGroup = {};
    rows.forEach((r) => {
      byClass[r.cls] = (byClass[r.cls] || 0) + 1;
      if (!byGroup[r.group]) byGroup[r.group] = {};
      byGroup[r.group][r.cls] = (byGroup[r.group][r.cls] || 0) + 1;
    });
    const nonGraded = rows.filter((r) => r.nonGraded).length;
    const nonInteger = rows.filter((r) => r.nonInteger).length;

    return {
      version: VERSION,
      generated_at: trim(o.today) || new Date().toISOString().slice(0, 10),
      source: {
        schema: waParsed.schema, marked: waParsed.marked,
        exported_at: waParsed.exported_at,
        /* P45-FDMSc — printed beside it, because the age of a read is the half
           of the reconciliation the pane used to leave unsaid */
        taken_at: waParsed.taken_at,
        people: waParsed.people.length, records: waParsed.records.length,
      },
      thresholds: { exams: THRESHOLDS.exams, flights: THRESHOLDS.flights, fs: THRESHOLDS.fs },
      identities: ids,
      persons,
      rows,
      counts: { byClass, byGroup, total: rows.length, nonGraded, nonInteger, appliable },
      notes,
    };
  }

  /* ── crossCheck helpers ────────────────────────────────────────────────── */

  /* a report line that is ABOUT a person rather than about a row — the same
     shape as every other row so nothing downstream has to special-case it */
  function noteRow(cls, group, person) {
    return {
      cls, group, oid: person.oid || "(none)", code: person.code || "", who: person.name || "",
      klass: person.klass || "", uid: "", ord: 0, rid: "",
      waDate: "", fdmsDate: "", waVerdict: "", fdmsVerdict: "",
      grade: null, thr: null, nonInteger: false, nonGraded: false,
      completes: false, effect: "—", duration: null, sec: "", instructor: "", srcId: "",
      diffs: [], refused: "", problems: [], detail: "", extra: "",
      _wa: null, _fd: null, key: "", plan: null,
    };
  }

  function mkRow(cls, group, person, uid, id, wa, fd, cmp, refused, bad) {
    const j = cmp.jw || cmp.jf;
    const eff = j ? nodeEffect(j) : { completes: false, word: "—" };
    return {
      cls, group, oid: person.oid, code: person.code, who: person.name,
      klass: person.klass, uid, ord: id.ord, rid: id.rid,
      waDate: wa ? wa.date : "", fdmsDate: fd ? fd.date : "",
      waVerdict: cmp.jw ? verdictWord(cmp.jw) : "",
      fdmsVerdict: cmp.jf ? verdictWord(cmp.jf) : "",
      grade: wa && wa.grade != null ? wa.grade : (fd && fd.grade != null ? fd.grade : null),
      thr: j && j.thr != null ? j.thr : null,
      nonInteger: !!(cmp.jw && cmp.jw.nonInt) || !!(cmp.jf && cmp.jf.nonInt),
      /* the NON-GRADED mark is about a grade that COULD have been there and is
         not, AND about a row that never completes its node — see isNonGraded() */
      nonGraded: isNonGraded(j),
      completes: eff.completes, effect: eff.word,
      duration: cmp.duration,
      sec: wa ? wa.sec : (fd ? fd.sec : ""),
      instructor: wa ? wa.instructor : (fd ? fd.instructor : ""),
      srcId: fd ? fd.srcId : "",
      diffs: cmp.diffs || [],
      refused: refused || "",
      problems: (bad || []).slice(),
      detail: "",
      extra: "",
      /* PHASE 3 — the two sides are kept BESIDE the flattened row so that the
         apply plan can be built from them in one pass at the end of
         crossCheck(). They are memory only, exactly like the rest of the
         report: nothing here is persisted, downloaded or printed. */
      _wa: wa || null, _fd: fd || null,
      key: "", plan: null,
    };
  }

  /* ══ THE APPLY PLAN ═══════════════════════════════════════════════════════
     One report row in, one answer out: may this line be written, what exactly
     would be written, and WHAT WOULD IT DO TO THE NODE. Pure — the confirm
     dialog, the change log and the fixtures all read the same object, so the
     sentence the developer confirms is the sentence the store gets. */
  function makePlan(x, ipResolve, exportAt, kindOf, ledger) {
    const cls = x.cls;
    if (cls !== "wa_only" && cls !== "source_moved" && cls !== "payload_differs") return null;
    const wa = x._wa, fd = x._fd;
    if (!wa) return null;                       // nothing on the Wings Ahead side to write
    const gid = x.group;
    /* PHASE 3b · FINDING 9 — the uid this row's node is asked about, or "" for
       the event sections. Computed once and handed to BOTH seams below. */
    const nodeUid = NODE_SECTIONS.indexOf(x.sec) >= 0 ? x.uid : "";
    const j = judge(wa);
    const ip = ipResolve(wa);
    const person = { oid: x.oid, code: x.code, name: x.who };
    const p = {
      cls, act: cls === "wa_only" ? "create" : cls === "source_moved" ? "update" : "adopt",
      can: false, why: "",
      key: x.key, rid: x.rid, oid: x.oid, group: gid, uid: x.uid, ord: x.ord,
      seq: wa.seq, student: person.code, who: person.name, klass: x.klass,
      evId: fd && fd.srcId ? fd.srcId : bridgeEvId(x.oid, gid, x.uid, x.ord),
      waWritten: !!(fd && fd.waWritten),
      date: wa.date, fdmsDate: fd ? fd.date : "",
      result: "", ip: ip.status === "resolved" ? ip.code : "", ipLabel: ip.label || wa.instructor,
      device: DEVICE_BY_GROUP[gid] || "",
      completes: false, effect: "", verdict: verdictWord(j),
      fields: [], exportAt: exportAt || "",
      /* `src` is the WHOLE Wings Ahead payload and is written only by a CREATE.
         An UPDATE or an ADOPTION refreshes only the `bridge.src.*` keys that
         belong to what it actually wrote — and it does that THROUGH `fields`,
         so ↺ Undo reverts them with everything else. Refreshing the whole block
         would be a silent lie: adopting the INSTRUCTOR would also quietly
         overwrite the remembered grade, and the grade difference the developer
         did NOT adopt would vanish from the next report. */
      src: { date: wa.date, seq: wa.seq, grade: wa.grade, thr: j.thr == null ? null : j.thr,
        mission: wa.mission, ng: !!wa.ng, instructor: wa.instructor, duration: wa.duration },
    };
    /* push a `bridge.src.<key>` change only when the event is the bridge's own
       and the value really moves — a hand-typed FDMS event has no block */
    const srcMove = (list, key, to) => {
      if (!p.waWritten || !fd) return;
      const from = fd.bridgeBlock && isObj(fd.bridgeBlock.src) ? fd.bridgeBlock.src[key] : null;
      const a = from == null ? "" : from, b = to == null ? "" : to;
      if (String(a) === String(b)) return;
      list.push({ field: "bridge.src." + key, from: from == null ? "" : from, to: to == null ? "" : to });
    };

    /* PHASE 3b · FINDING 9 — SEAM ②, THE PLAN BUILDER. Seam ① should already
       have made this row class `refused`, which never reaches makePlan at all.
       It is asked again here, before anything else, because a classification is
       one edit away from changing and the door must not re-open with it: that
       is the whole R20 lesson — one guard is an intention, two are a wall. */
    const kOf = typeof kindOf === "function" ? kindOf : () => null;
    if (nodeUid && !kOf(nodeOfUid(nodeUid))) { p.why = offGraphWhy(nodeUid); return p; }

    /* PHASE 4/5 · D.3 — THE ECHO RULE, COMPLETED. Once the push lane exists,
       Wings Ahead carries rows the BRIDGE ITSELF wrote, stamped `fdms` by the
       server. Such a row is this store's own reflection: minting an FDMS event
       from it would create a second event for a flight that is already in the
       training log, and the next push would then owe a second Wings Ahead row
       for the same flight. No path mints an FDMS event from FDMS's own echo.
       WHICH SENTENCE depends on whether the ledger knows the row, and the two
       are genuinely different situations:
         · the ledger knows it → its FDMS source is gone, so what this line
           really is, is a PENDING REMOVAL waiting on the Bridge tab;
         · the ledger does not → some other store pushed it (a restored backup,
           another device whose ledger did not travel), and that is an identity
           question, not a flight question. */
    const echo = echoOf(wa, x.oid, ledger);
    if (echo) { p.why = echo.why; return p; }

    /* A ROW THE REPORT ALREADY REFUSED IS NEVER OFFERED. `unwritten`,
       `refused`, `unresolvable` are classes of their own and never reach here,
       but a row can be `wa_only` AND carry record-level problems, and those are
       reasons enough on their own. */
    if (arr(x.problems).length) {
      p.why = "the record carries a warning that would have to be settled first — " + x.problems[0];
      return p;
    }

    if (p.act === "update") {
      /* the date is the only field this act writes, so the instructor and the
         verdict are none of its business — a moved date is a moved date. */
      p.why = refuseApply(gid, j, ip, person, "date", nodeUid, kOf);
      if (!p.why && (!wa.date || !fd || !fd.date)) p.why = "one of the two dates is missing";
      if (!p.why && fd.date === wa.date) p.why = "the two dates are already the same";
      if (p.why) return p;
      const jf = judge(fd);
      const eff = nodeEffect(jf);
      p.can = true;
      p.completes = eff.completes;
      p.effect = "the node effect does not change — this line moves a date";
      p.fields = [{ field: "date", from: fd.date, to: wa.date }];
      srcMove(p.fields, "date", wa.date);
      srcMove(p.fields, "seq", wa.seq);
      return p;
    }

    if (p.act === "adopt") {
      p.why = refuseApply(gid, j, ip, person, "adopt", nodeUid, kOf);
      if (p.why) return p;
      const want = resultOf(j);
      const now = fd ? trim(fd.extra.result) : "";
      const take = [];
      arr(x.diffs).forEach((d) => {
        if (ADOPTABLE.indexOf(d.field) < 0) return;
        if (d.field === "instructor" && ip.status !== "resolved") return;
        take.push(d.field);
      });
      if (!take.length) {
        p.why = "none of the differences on this row is one this slice can adopt. Adoptable: "
          + ADOPTABLE.join(" · ") + " — and only where the report already shows both sides. "
          + "Everything else is corrected in the system that owns the fact.";
        return p;
      }
      if (take.indexOf("verdict") >= 0 || take.indexOf("grade (Wings Ahead)") >= 0) {
        if (!want) { p.why = "Wings Ahead's verdict is one FDMS cannot express"; return p; }
        p.result = want;
        if (want !== now) p.fields.push({ field: "result", from: now, to: want });
        srcMove(p.fields, "grade", wa.grade);
        srcMove(p.fields, "thr", j.thr == null ? null : j.thr);
        srcMove(p.fields, "mission", wa.mission);
        srcMove(p.fields, "ng", !!wa.ng);
        /* the lag reasons belong to the lag. A row that becomes a pass and
           keeps yesterday's `maneuvers` is the stale-field trap upsert()'s
           merge sets for anyone who writes only what changed. */
        if (!(want === "lag" || want === "fail") && fd && trim(fd.extra.maneuvers)) {
          p.fields.push({ field: "maneuvers", from: trim(fd.extra.maneuvers), to: "" });
        }
      }
      if (take.indexOf("instructor") >= 0 && fd && ip.code !== fd.instructor) {
        p.fields.push({ field: "instructor", from: fd.instructor, to: ip.code });
        srcMove(p.fields, "instructor", wa.instructor);
      }
      if (!p.fields.length) {
        p.why = "the adoptable fields already hold the Wings Ahead value";
        return p;
      }
      p.can = true;
      const res = p.result || now;
      p.completes = resultCompletes(res);
      p.effect = p.result
        ? "result «" + (RESULT_WORD[res] || res) + "» → " + effectWord(p.completes)
        : effectWord(p.completes) + " — unchanged by this line";
      return p;
    }

    /* create */
    p.why = refuseApply(gid, j, ip, person, "full", nodeUid, kOf);
    if (p.why) return p;
    p.result = resultOf(j);
    p.can = true;
    p.completes = resultCompletes(p.result);
    p.effect = "result «" + (RESULT_WORD[p.result] || p.result) + "» → " + effectWord(p.completes);
    p.fields = [
      { field: "date", from: "", to: wa.date },
      { field: "result", from: "", to: p.result },
      { field: "instructor", from: "", to: p.ip },
      { field: "device", from: "", to: p.device },
    ];
    return p;
  }
  const effectWord = (c) => (c ? "COMPLETES the node and unlocks its successors"
    : "does NOT complete the node");

  /* IS THIS WINGS AHEAD ROW THE BRIDGE'S OWN ECHO? — the one predicate D.3's
     rule is asked through, so the plan, the report note and the pane all say the
     same thing. It answers null for every row a human typed. */
  function echoOf(wa, oid, ledger) {
    if (!wa || wa.side !== "wa") return null;
    if (trim(wa.extra && wa.extra.entered_by) !== "fdms") return null;
    const known = arr(ledger).find((L) => isObj(L) && normOid(L.oid) === normOid(oid)
      && isObj(L.sent) && up(L.sent.sortie) === up(codeOfNode(nodeOfUid(wa.uid)))
      && isoDate(L.sent.date) === isoDate(wa.date)
      && posInt(L.sent.seq, 1) === posInt(wa.seq, 1)) || null;
    if (known) {
      return { known, why: "this Wings Ahead row is the BRIDGE'S OWN — it was pushed from this store "
        + "(row identity " + trim(known.rid) + ") and Wings Ahead stamped it «fdms». Its FDMS event is "
        + "gone, so what this line really is, is a PENDING REMOVAL: confirm it on the Bridge tab, or ↺ "
        + "undo the deletion in the Training log. Writing it back would create a second FDMS event for a "
        + "flight this store already pushed (design D.3)" };
    }
    return { known: null, why: "Wings Ahead stamped this row «fdms» — the bridge wrote it — and THIS "
      + "store's push ledger has never heard of it: a restored backup, or another device whose ledger did "
      + "not travel with it. It is never written back into FDMS (that would mint an event from this "
      + "system's own reflection); pull the store, or settle the identity first (design D.3)" };
  }

  /* which report group an FDMS event belongs to — EXACTLY ONE, so a checkride
     or a prescribed solo can never be counted twice */
  function groupOfNode(node, band, waRows) {
    const code = node.indexOf("s:") === 0 ? node.slice(2) : "";
    if (code && EVAL_IDS.indexOf(code) >= 0) return "evaluations";
    if (code && waRows.some((r) => r.sec === "solo_flights" && r.uid === node)) return "solo_flights";
    return band;
  }
  const groupIdOfRow = (r) => (r.side === "wa" ? WA_SECTIONS[r.sec].group : r.sec);

  /* the structural refusals — a rule refusing a row on principle, listed with
     the rule that refused it (never silently dropped) */
  function refusalOf(r, gid, kindOf) {
    if (!r || r.side !== "wa") return "";
    const k = typeof kindOf === "function" ? kindOf : () => null;
    const code = r.uid.indexOf("s:") === 0 ? r.uid.slice(2) : "";
    if ((r.sec === "flights" || r.sec === "fs") && code && EVAL_IDS.indexOf(code) >= 0) {
      return "the checkride " + code + " is stored in the Evaluations section — it is SHOWN in the flight "
        + "table but it lives there, and two rows for one event with two grades can disagree";
    }
    if (r.sec === "exams" && r.uid.indexOf("eeth:") === 0) {
      return "the ΕΕΘ weekly theory series names no exam — FDMS's syllabus graph has a node only for "
        + "the eight ground-exam groups (" + EXAM_IDS.join(" · ") + ")";
    }
    if (r.sec === "exams" && r.extra.exam && EXAM_IDS.indexOf(r.extra.exam) < 0) {
      return "«" + r.extra.exam + "» is not one of the eight ground-exam groups";
    }
    if ((gid === "flights" || gid === "fs") && r.kind && r.kind !== "syllabus" && r.kind !== "repeat") {
      return "a " + r.kind.toUpperCase() + " is off-catalogue by nature — FDMS's graph has no node for it";
    }
    /* PHASE 3b · FINDING 9 — SEAM ①, THE CLASSIFICATION ITSELF. Asked LAST so
       that the four rules above keep their own, more specific, words: a
       checkride filed as an ordinary flight and an FCF are already refused for
       what they ARE, and the code they name may well exist. What is left here
       is the plain case — the graph has never heard of this row — and the row
       becomes class `refused`, which carries no apply plan at all, so it can
       never reach the checkbox, the dialog or the writer. */
    if (offGraph(r, k)) return offGraphWhy(r.uid);
    return "";
  }

  /* an unflown fixed slot is a PLACEHOLDER, not an entry (WA round 5) */
  function isEmptySlot(sec, e) {
    if (sec === "evaluations") return !isoDate(e.date) && num(e.grade) == null && !trim(e.with);
    if (sec === "solo_flights") return !isoDate(e.date) && num(e.grade) == null && !trim(e.instructor) && e.ng !== true;
    return false;
  }

  /* MIGRATE_RECORD IS A SILENT SHREDDER for any section it does not name (the
     critique's fifth must-fix). The export carries both `data` (migrated) and
     `data_as_stored` (raw), so the bridge can SEE the shredding instead of
     reading it as "this student has no flights". */
  function shredCheck(rec) {
    const mig = isObj(rec.data) ? rec.data : {};
    const raw = isObj(rec.data_as_stored) ? rec.data_as_stored : null;
    if (!raw) return "";
    const lost = [];
    WA_SECTION_IDS.forEach((sec) => {
      const a = arr(raw[sec]).length, b = arr(mig[sec]).length;
      if (a > b) lost.push(sec + " " + a + "→" + b);
    });
    if (!lost.length) return "";
    return "the stored record carries rows the migrated record does not — " + lost.join(" · ")
      + ". A section the server's migrate_record does not name is dropped on EVERY read and the loss "
      + "becomes permanent on the next save. Nothing here is compared for those sections.";
  }

  function countRecordRows(rec) {
    const d = isObj(rec.data) ? rec.data : {};
    let n = 0;
    WA_SECTION_IDS.forEach((sec) => { n += arr(d[sec]).length; });
    return n;
  }

  /* an FDMS special event (NFS and the out-of-graph sorties) has no node */
  function fdSpecial(ev, person, out) {
    if (trim(ev.special) !== "nfs") return;
    const r = baseRow("fdms", "events", null, "ev:nfs@" + isoDate(ev.date), 1, ev.date);
    r.raw = ev; r.srcId = trim(ev.id); r.waWritten = isWaWritten(ev);
    r.extra = { special: "nfs", category: trim(ev.category), note: trim(ev.note), result: "" };
    r.mission = "complete";
    out.push(r);
  }

  /* ══════════════════════════════════════════════════════════════════════════
     ①β THE PUSH LANE — FDMS → WINGS AHEAD (Phase 4/5, 28/08/2026)
     ══════════════════════════════════════════════════════════════════════════
     Still pure: no DOM, no store, no fetch. It answers one question — WHICH
     Wings Ahead operations does this store owe right now — and it answers it by
     RECOMPUTING, never by remembering:

         queue = (qualifying trainingLog events) × (the bridgePush ledger)
                                                 × (the tombstones Wings Ahead
                                                    told us about)

     THERE IS NO STORED QUEUE, and that is the design decision this whole file
     rests on: a stored queue is a second truth that drifts from the store it
     summarises, can be drained twice, and turns "offline" into "lost". Derived,
     offline means WAITING; a retry costs nothing; and a failed push is simply
     still owed, which is why the header chip can never quietly drop one.

     WHAT IS STORED is the LEDGER — `bridgePush`, one row per pushed identity —
     because it is the one thing that cannot be re-derived from anything: which
     WA row belongs to which FDMS event, and the two numbers minted for it.

     ── THE FOUR THINGS THE DEPLOYED WIRE MADE NON-NEGOTIABLE ─────────────────
     The Wings Ahead side (db/schema.sql, public.bridge_push) landed four rounds
     after this contract was designed, and it is the deployed wire that wins:

      1 · `prev` IS THE WHOLE ROW, not the three fields that name it. The server
          compares it FACT FOR FACT with the row standing at the handle; a claim
          it cannot back is `exists_fdms` and nothing is written. So the ledger
          stores the full row of the LAST ACKNOWLEDGED push and sends exactly
          that. A removal names its row the same way.
      2 · THEREFORE THE QUEUE IS ORDERED PER rid. A second change sent with the
          first change's `prev` is REFUSED. Here that is free rather than
          engineered: each rid contributes AT MOST ONE op per planner run, built
          from (ledger.sent → the event as it stands now), and the ledger only
          advances when an answer arrives. Two edits before one answer collapse
          into ONE op with the right `prev`.
      3 · A REPLAY IS ABSORBED — the identical retry of any verb answers
          `unchanged`. "Identical" means the same `prev`, which the
          last-acknowledged ledger hands us without trying.
      4 · SHAPES ARE REFUSED BY NAME, NEVER COERCED. seq is a JSON NUMBER 1..20
          (never "2"), kind is one of five words, ng is a boolean and never true,
          the date is "YYYY-MM-DD", `entered_by` / `legacy` / `duration` never
          cross, the rid is a string ≤ 200 chars and at most 200 ops ride in one
          call. Everything below emits those shapes deliberately.

     ── AND THE ONE THING THE WINGS AHEAD SIDE SAID IT CANNOT DO ──────────────
     «BYTE-IDENTICAL TWINS REMAIN INDISTINGUISHABLE … that dedup is P45-FDMS's,
     by pairing on evId with a seq minted once and frozen.» It is done HERE:
       · an event is paired to its ledger row by **evId FIRST** — the stable FDMS
         handle — and never by its facts. The attempt ordinal is a POSITION and
         positions renumber when an earlier attempt is deleted; an id does not.
       · `ord` (and with it the rid) and `seq` are MINTED ONCE, at the first
         push, and FROZEN in the ledger. Nothing re-derives them, ever. Delete
         the morning bust from the training log and the surviving afternoon
         flight keeps the seq it was pushed under: the deletion becomes ONE
         pending removal naming the row it removes, and not an update that
         quietly morphs one flight into another.
     ══════════════════════════════════════════════════════════════════════════ */

  const WA_BRIDGE_SCHEMA = "wa-bridge-v1";

  /* MIRRORS of wa.bridge_ops() / wa.bridge_reasons() / wa.bridge_verdicts() and
     of the three numeric bounds the server refuses by name. They are literals
     here for the same reason EVAL_IDS and FLIGHT_KINDS are: the client must be
     able to say what it is about to send WITHOUT the database, and a shape this
     side emits wrongly is a refusal the developer has to read instead of a
     flight that landed. */
  const PUSH_OPS = ["upsert", "remove"];
  const PUSH_REASONS = ["undo", "source_removed", "developer"];
  const PUSH_VERDICTS = ["created", "moved", "updated", "removed", "unchanged",
    "exists_student", "exists_admin", "exists_fdms", "missing", "tombstoned", "refused"];
  const PUSH_MAX_OPS = 200;     // wa: «a single push carries at most 200 operations»
  const RID_MAX = 200;          // wa: the rid is a string of at most 200 characters
  const SEQ_MAX = 20;           // wa: chk_int(seq, 1, 20) on every flight row

  /* ── THE CHUNK THIS SIDE ACTUALLY SENDS, AND WHY IT IS NOT 200 ────────────
     THE ENVELOPE MAX IS NOT A BUDGET. 200 is the largest call the server will
     ACCEPT; it is not the largest call it can COMPLETE. The `anon` role — which
     is the role the app authenticates as, because the bridge rides the anon key
     — carries Supabase's default `statement_timeout = 3s`, and one push is ONE
     statement: it reads the record, rewrites the whole JSON document once per
     operation and writes it back. Measured on this stack, against fresh
     records (P45-FDMS verify item 4):

         200 creates → 3122 ms → SQLSTATE 57014, nothing written
         100 creates → 3014 ms → SQLSTATE 57014, nothing written
          40 creates → 1691 ms → 200 OK
          25 creates → 1481 ms → 200 OK

     The cost is SUPERLINEAR (each op rewrites a document the previous op made
     bigger), so the gap between 40 and the wall is smaller than it looks and it
     narrows as a record fills. 25 clears 3 s with a factor of two in hand on an
     empty record, which is the only margin worth having: the first push of a
     real store owes ~1 900 flights and every one of them lands on a record that
     is growing under it. Below this number the round trips start to dominate;
     above it the margin is somebody's optimism.

     AND THE NUMBER IS NOT THE FIX — the RESILIENCE is. A statement timeout is
     answered «this call was too big», the chunk halves and the SAME operations
     are sent again (§ runPush), down to a floor of one. Nothing is lost when it
     happens: 57014 rolls the whole transaction back, so no verdict arrives, the
     ledger does not advance, and the retry is the identical work. */
  const PUSH_CHUNK = 25;

  /* the keys of a pushed row, in the ONE order everything writes them. `sent`
     and a freshly built row are compared key by key over exactly this list, so
     a key added on one side and not the other is a difference and not a
     surprise. `duration` is NOT here and never will be until FDMS has the field
     (ruling #8); `entered_by` and `legacy` are the server's, never the wire's. */
  const PUSH_ROW_KEYS = ["date", "track", "sortie", "seq", "kind",
    "instructor", "instructor_oid", "grade", "ng", "mission"];

  /* MIRROR of wa.code_track(). The letter of a syllabus code names the table the
     row belongs to, and Wings Ahead validates the pair — so a row whose code
     this side cannot read is refused HERE, by name, instead of arriving as a
     `legacy` row the server refuses as «incomplete». */
  function codeTrack(code) {
    const c = up(code);
    if (!/^[BCIFN][0-9]{4}$/.test(c)) return "";
    const l = c.charAt(0);
    if (l === "B" || l === "C") return "contact";
    if (l === "I") return "instrument";
    if (l === "F") return "formation";
    return "vfr_navigation";
  }

  /* ── THE LEDGER ──────────────────────────────────────────────────────────
     One row per pushed identity. `state` is where the identity IS; `hold` is
     the exception that stopped it, and a held row is never queued again by
     itself — recovery is an explicit act, which is the whole point:
       state ""        never pushed (or put back by an undo / a cleared removal)
             "pushed"  a row of ours stands in Wings Ahead; `sent` is it
             "undone"  the developer took the push back — a removal is OWED
             "removed" the row is gone and a tombstone lies on the identity
       hold  ""        nothing in the way
             "conflict"      exists_fdms — this op did not know the row it claimed
             "student"/"admin"  a human's row stands at the handle
             "missing"       nothing stands where we left our row
             "tombstoned"    the identity is tombstoned and this op did not say so
             "refused"       the server refused the operation's shape or section
             "malformed"     this ledger row's own memory cannot be sent (§ prevProblem)
             "student_oid"   ┐ the two PER-STUDENT holds — they live on a row of
             "timeout"       ┘ their own, `scope: "student"`, see below

     ── AND ONE ROW THAT IS NOT AN IDENTITY (P45-FDMSb, verify item 11) ───────
     `scope: "student"` marks a STUDENT-LEVEL hold: not «this row is stuck» but
     «Wings Ahead could not take ANY row for this person». It carries the oid,
     the student code, the server's own sentence and nothing else — no uid, no
     ord/seq, and `sent: null` for ever, which is what keeps it invisible to
     every reader that walks the ledger looking for rows (echoOf asks
     isObj(L.sent); the removal sweep returns on `!sent`). Its rid is
     `OID ∷ (student)`, two segments where an identity has four, so it can never
     collide with one. Why it is STORED rather than kept in the run: the
     automatic lane fires every five seconds, and a hold that died with the page
     would spend one refused call per student per run for ever. */
  const LED_KEYS = ["rid", "oid", "group", "uid", "ord", "seq", "evId", "student",
    "sent", "state", "hold", "note", "verdict", "reason", "clearTomb", "at", "waRow", "scope"];

  const ledRid = (oid, group, uid, ord) => [oid, group, uid, ord].join(" ∷ ");
  const ledStuRid = (oid) => normOid(oid) + " ∷ (student)";
  const isStuHold = (L) => isObj(L) && trim(L.scope) === "student";

  /* THE INDEX IS BUILT ONCE PER PLANNER RUN, and the two minting tables with
     it. They are here rather than as a scan-per-event for a reason a live store
     makes obvious rather than theoretical: the demo roster carries ~2 000
     training-log events, so a minter that walked the whole ledger for each one
     would be quadratic — and this runs on every store mutation, behind a chip
     that has to stay true while somebody types. Built once, updated as each
     number is minted, it is linear. */
  function ledgerIndex(list) {
    const byRid = new Map(), byEv = new Map(), ordMax = new Map(), seqUsed = new Map();
    const stuHold = new Map();
    const clean = arr(list).filter(isObj);
    clean.forEach((L) => {
      if (!trim(L.rid)) return;
      byRid.set(trim(L.rid), L);
      /* a STUDENT-level hold is not an identity: it mints no ordinal, it takes
         no sequence number, and it must never be paired to an event. */
      if (isStuHold(L)) {
        if (trim(L.hold)) stuHold.set(normOid(L.oid), L);
        return;
      }
      const ev = trim(L.evId);
      if (ev) {
        if (!byEv.has(ev)) byEv.set(ev, []);
        byEv.get(ev).push(L);
      }
      const ok = normOid(L.oid) + " " + trim(L.group) + " " + trim(L.uid);
      if (posInt(L.ord, 0) > (ordMax.get(ok) || 0)) ordMax.set(ok, posInt(L.ord, 0));
      /* a REMOVED identity's seq is free again: its row is gone from the record,
         and the tombstone is on the identity, not on the number. */
      if (trim(L.state) === "removed" || !isObj(L.sent)) return;
      const sk = normOid(L.oid) + " " + up(L.sent.sortie) + " " + isoDate(L.sent.date);
      if (!seqUsed.has(sk)) seqUsed.set(sk, new Set());
      seqUsed.get(sk).add(posInt(L.seq, 1));
    });
    return { byRid, byEv, ordMax, seqUsed, stuHold, list: clean };
  }

  /* THE ATTEMPT ORDINAL, MINTED ONCE. The next free ordinal inside
     (oid, group, uid) ACROSS THE LEDGER — never recomputed from the events,
     because the events renumber and the ledger does not. */
  function mintOrd(idx, oid, group, uid) {
    const k = normOid(oid) + " " + group + " " + uid;
    const n = (idx.ordMax.get(k) || 0) + 1;
    idx.ordMax.set(k, n);                         // the run's own mints count too
    return n;
  }

  /* THE SAME-DAY SEQUENCE NUMBER, MINTED ONCE AND FROZEN (ruling #1 · the
     critique's must-fix 3). The next free seq among the rows this ledger — and
     this run — already hold for the same student, sortie and day: a fact of the
     row, not a position, and never re-derived afterwards. */
  function mintSeq(idx, oid, sortie, date) {
    const k = normOid(oid) + " " + up(sortie) + " " + isoDate(date);
    if (!idx.seqUsed.has(k)) idx.seqUsed.set(k, new Set());
    const used = idx.seqUsed.get(k);
    for (let n = 1; n <= SEQ_MAX; n++) {
      if (!used.has(n)) { used.add(n); return n; }
    }
    return 0;                                     // 20 flights of one code in one day
  }

  /* ── THE ROW AN FDMS EVENT BECOMES (design B.2, field for field) ────────── */
  function pushRowOf(o) {
    return {
      date: o.date,
      track: o.track,
      sortie: o.sortie,
      seq: o.seq,
      kind: o.kind,
      instructor: o.instructor,
      instructor_oid: o.instructorOid,
      /* R2, on this side of the wire too: a sortie NEVER crosses as a number.
         Wings Ahead reads a grade as the thing that decides the mission, and
         FDMS holds no number for a sortie to begin with. */
      grade: null,
      /* NEVER true from this lane (design F.4): FDMS has no NG state to assert
         and NG removes the grade — the server refuses a true by name, and this
         side never asks it to. */
      ng: false,
      mission: o.mission,
    };
  }

  /* the FDMS result word → Wings Ahead's two-word vocabulary (design B.2).
     «lag» and «fail» both mean the sortie is owed; the finer word is the
     squadron's own and stays on this side (12b: «Θελω μονο mission complete,
     mission incomplete»). */
  const PUSH_MISSION = { completed: "complete", lag: "incomplete", fail: "incomplete", repeat: "incomplete" };

  function sameWaRow(a, b) {
    if (!isObj(a) || !isObj(b)) return false;
    for (const k of PUSH_ROW_KEYS) {
      const x = a[k] === undefined ? null : a[k];
      const y = b[k] === undefined ? null : b[k];
      if (x === null || y === null) { if (x !== y) return false; continue; }
      if (String(x) !== String(y)) return false;
    }
    return true;
  }

  /* ── THE OTHER HALF OF THE SHAPE DISCIPLINE — `prev` (P45-FDMS verify item 3)
     ═══════════════════════════════════════════════════════════════════════════
     `row` is rebuilt from scratch by pushRowOf() on every single op, so it
     cannot carry a string seq or a kind nobody speaks even from a poisoned
     ledger. `prev` was not: it is forwarded VERBATIM from `bridgePush.sent`,
     and an ⭱ Import of a hand-made or tampered backup (or a tampered
     `fdms-data` sync copy) can put anything in there. SchedStore.normalize()
     fills a missing key field and sanitises nothing.

     WHAT THAT COSTS, PRECISELY — and it is worse than «the server refuses it»:
       · a STRING seq or an unknown `kind` in `prev` IS refused by name (the
         deployed guard tests both blocks) — one wasted call to be told what
         this side could have said for free;
       · `entered_by` / `legacy` / `duration` in `prev` are NOT refused by name.
         Those three guards read `row_in` only. Such a `prev` goes into
         wa.bridge_row() and is compared fact for fact against the standing row,
         fails to match, and comes back **`exists_fdms`** — a knowledge refusal
         for a claim that was true, blamed on the wrong thing, and held as a
         conflict the developer would go looking for in Wings Ahead.

     AND IT IS NEVER SILENTLY REWRITTEN. `prev` is a CLAIM OF KNOWLEDGE — «the
     row standing there is this one, fact for fact». Sanitising it would forge
     the claim: we would be asserting knowledge of a row we no longer have an
     honest record of, and the server would take our word for it and overwrite.
     So a malformed `prev` becomes a HELD LINE BY NAME with no wire call at all,
     and its recovery is the same one a `missing` gets: read Wings Ahead, then
     ADOPT the row as it actually stands (§ missingLook / startHold).

     Returns "" when the block may cross, or the sentence the developer reads. */
  function rowProblem(r, what) {
    if (!isObj(r)) return "the " + what + " block is not an object";
    for (const k of Object.keys(r)) {
      if (PUSH_ROW_KEYS.indexOf(k) < 0) {
        return "it carries «" + k + "», which is not one of the ten keys of a pushed row — "
          + "`entered_by`, `legacy` and `duration` are the server's or nobody's, and a key this wire "
          + "does not speak makes the whole block describe a row that cannot exist";
      }
    }
    for (const k of PUSH_ROW_KEYS) {
      if (r[k] === undefined) return "«" + k + "» is missing, and a partial " + what + " describes a row "
        + "nobody wrote";
    }
    if (typeof r.date !== "string" || !isoDate(r.date)) {
      return "«date» is not a calendar day written out (YYYY-MM-DD)";
    }
    if (typeof r.sortie !== "string" || !trim(r.sortie)) return "«sortie» is not a flight code";
    if (typeof r.track !== "string" || (trim(r.track) && TRACKS.indexOf(trim(r.track)) < 0)) {
      return "«track» is not one of " + TRACKS.join(" / ");
    }
    if (typeof r.seq !== "number" || r.seq !== Math.floor(r.seq) || r.seq < 1 || r.seq > SEQ_MAX) {
      return "«seq» is " + JSON.stringify(r.seq) + " — the same-day sequence number crosses this wire as "
        + "a JSON NUMBER from 1 to " + SEQ_MAX + ", never as text";
    }
    if (typeof r.kind !== "string" || FLIGHT_KINDS.indexOf(r.kind) < 0) {
      return "«kind» is " + JSON.stringify(r.kind) + " and the lane speaks " + FLIGHT_KINDS.join(" / ");
    }
    if (typeof r.instructor !== "string") return "«instructor» is not text";
    if (typeof r.instructor_oid !== "string") return "«instructor_oid» is not text";
    if (r.grade !== null && (typeof r.grade !== "number" || !isFinite(r.grade))) {
      return "«grade» is neither a number nor null";
    }
    /* `ng` MAY be true here and nowhere else. The bridge never WRITES a true
       (the server refuses it by name on `row`), but an ADOPTED row is read back
       from the record as it actually stands, and a faithful memory of a row
       somebody else flagged is exactly what `prev` is for. */
    if (typeof r.ng !== "boolean") return "«ng» is not a boolean";
    if (typeof r.mission !== "string" || (trim(r.mission) && MISSIONS.indexOf(trim(r.mission)) < 0)) {
      return "«mission» is neither blank nor one of " + MISSIONS.join(" / ");
    }
    return "";
  }
  /* the sentence a held line prints. It names the CAUSE (there is only one way
     a ledger row gets into this state) and the way out, because a hold with no
     named exit is a dead end wearing a badge. */
  function prevProblem(prev) {
    if (prev === null || prev === undefined) return "";        // a create claims nothing
    const why = rowProblem(prev, "remembered");
    if (!why) return "";
    return "the ledger's memory of this row is malformed — " + why + ". A row this store pushed can "
      + "never look like this, so this memory came from a tampered or hand-edited backup (⭱ Import "
      + "restores the ledger verbatim). Nothing was sent: a `prev` is a CLAIM that the row standing in "
      + "Wings Ahead is exactly this one, and repairing it here would forge that claim. Read Wings Ahead "
      + "and re-anchor the identity to the row that actually stands there.";
  }

  /* ── WHY AN EVENT DOES NOT CROSS — the qualifying predicate (design B.1) ──
     Returns "" when the event may be pushed. Every clause is a SENTENCE the
     developer reads on the Bridge tab, because a silent exclusion is the same
     lie as a clean-looking empty report.

     ── AND EVERY CLAUSE NOW SAYS WHOSE FACT IT IS (P45-FDMSd · finding A) ────
     A refusal is not only a sentence, it is EVIDENCE — and the removal
     derivation below has to know whose. «the result changed», «the scope
     changed», «the bridge itself wrote this event» are facts about THE FDMS
     EVENT: the row that event once wrote is genuinely owed a removal. «the
     syllabus graph does not carry this node» is a fact about THE GRAPH, which
     is configuration this run happens to read: the training log is untouched,
     and a row is never taken off a student's Wings Ahead record because a
     lookup failed. `fact` is that distinction, kept in ONE place — beside the
     sentence it belongs to, so a future clause cannot be added without its
     author being asked which kind it is.

     `pushBlockOf` stays exactly what it was (the sentence, or ""), because the
     blocked table, the fixtures and every other reader want the sentence. */
  const BLOCK = (why, fact) => ({ why: why, fact: fact || "event" });
  function pushBlockOf(ev, ctx) { return pushBlockWhy(ev, ctx).why; }
  function pushBlockWhy(ev, ctx) {
    if (trim(ev.scope) !== "student") {
      return BLOCK("a ground event is CLASS-scope in FDMS and reaches the student through membership read "
        + "at run time — pushing a per-student copy would freeze a fact that is supposed to move, and a "
        + "class change would fabricate attendance (design F.4)");
    }
    /* THE ECHO RULE — absolute, and it is the loop-breaker. An event the bridge
       itself wrote FROM Wings Ahead never crosses back to Wings Ahead. Two
       marks, either one enough, exactly as isWaWritten() reads them. */
    if (isWaWritten(ev)) {
      return BLOCK("this FDMS event was written BY the bridge, from a Wings Ahead row — pushing it back "
        + "would be the bridge writing to Wings Ahead what Wings Ahead told it (the echo rule, "
        + "design B.1·3)");
    }
    const node = evNodeOf(ev);
    if (!node || node.indexOf("s:") !== 0) {
      return BLOCK("only a SORTIE crosses this lane — this event names «" + (node || "no node") + "»");
    }
    /* THE TWO GRAPH CLAUSES. Both are answers from `kindOf` — the FDMS syllabus
       graph — about a node the EVENT still names, unchanged. A retired code, a
       syllabus revision, or a SchedReady that has not finished loading each
       produce this exact refusal over a training log nobody touched. */
    const band = ctx.kindOf(nodeOfUid(node));
    if (!band) return BLOCK(offGraphWhy(node), "graph");
    if (APPLY_GROUPS.indexOf(band) < 0) {
      return BLOCK("this lane pushes FLIGHTS and F/S only — ground lessons and exams, the eight "
        + "checkrides, the prescribed solos and the FAIL / ALMOST GOOD / NFS / SMS events each wait for a "
        + "lane of their own (design F.4)", "graph");
    }
    const code = codeOfNode(node);
    if (EVAL_IDS.indexOf(code) >= 0) {
      return BLOCK("the checkride " + code + " lives in the Evaluations section of Wings Ahead, which this "
        + "lane does not write — two rows for one event, with two grades, can disagree");
    }
    if (!isoDate(ev.date)) {
      return BLOCK("the flight has no valid date — every Wings Ahead entry is dated, and only the grade "
        + "lags");
    }
    if (!codeTrack(code)) {
      return BLOCK("«" + code + "» is not a syllabus code Wings Ahead can place in a table (its letter "
        + "names the track: B/C contact · I instrument · F formation · N navigation). A row whose table "
        + "cannot be named arrives there as INCOMPLETE and is refused — so it is refused here, by its "
        + "real fault");
    }
    const res = trim(ev.result);
    if (res === "score") {
      return BLOCK("this event stores a NUMBER as its result, and a sortie never crosses as a number (R2). "
        + "Correct it in the Training log to «completed» / «lag» / «fail»");
    }
    /* A BLANK RESULT DOES NOT PUSH — and this is the round's own decision,
       taken against design B.2's «push it as awaiting», for a reason the
       adversarial critique proved: FDMS's own readiness engine reads a blank
       result as COMPLETED (SchedReady.state, and fdmsRow says so on the row),
       so pushing «awaiting» would assert to Wings Ahead a state this database
       does not itself believe — and every subsequent cross-check would then
       print `payload_differs` on that row for ever, training the developer to
       ignore the one class that must never be ignored. Pushing «complete»
       instead would invent a verdict nobody typed. So the flight waits, exactly
       as an awaiting Wings Ahead row waits on the other side (ruling #5), and
       it crosses by itself the moment the debrief is typed. */
    if (!res) {
      return BLOCK("the debrief has not been typed: this event carries no result. FDMS's own readiness "
        + "engine reads a blank result as COMPLETED, so pushing it would tell Wings Ahead something this "
        + "store does not itself believe. Type the result and the flight crosses by itself (ruling #5)");
    }
    if (!PUSH_MISSION[res]) {
      return BLOCK("«" + res + "» is not a result this lane can express as Wings Ahead's mission complete "
        + "/ mission incomplete");
    }
    return BLOCK("");
  }

  /* ── THE PLANNER ─────────────────────────────────────────────────────────
     Pure. Everything the Bridge tab, the confirm dialog, the header chip and the
     fixtures read comes out of this one call, so the sentence the developer
     confirms is the operation the wire gets. */
  function planPush(fdms, opts) {
    const o = opts || {};
    const kindOf = typeof o.kindOf === "function" ? o.kindOf : () => null;
    const ctx = { kindOf };
    const log = arr(fdms && fdms.trainingLog);
    const idx = ledgerIndex(fdms && fdms.bridgePush);

    /* the two rosters, by code */
    const stuByCode = new Map(), ipByCode = new Map();
    arr(fdms && fdms.students).forEach((s) => { if (isObj(s) && trim(s.code)) stuByCode.set(trim(s.code), s); });
    arr(fdms && fdms.instructors).forEach((i) => { if (isObj(i) && trim(i.code)) ipByCode.set(trim(i.code), i); });

    /* WHAT A PULL ADDS, WHEN THERE IS ONE. Without it the OID is sent and the
       server answers by name; with it the same two refusals are made HERE, where
       they cost nothing — because an unknown or ambiguous OID is one of the four
       ENVELOPE raises and it voids that student's whole call. */
    const waStudentOids = new Set(), waPersonOids = new Set();
    /* ── AND THE ONE THING THIS PRE-CHECK CANNOT CATCH, SAID OUT LOUD ────────
       `normOid` upper-cases, so the two Sets above resolve a lower-case
       `external_oid` and this planner queues the flight — and the ENVELOPE on
       the far side matches EXACTLY and refuses the whole student (P45-FDMSe,
       verify item 12b: 30 people «matched BY OID», 30 × HTTP 400). The case is
       not corrected here — a read is somebody else's roster and this app does
       not rewrite it, not even in memory — it is REPORTED, on the pane where
       ✈ Push now is, before the button is pressed. */
    const oidCase = [];
    let havePull = false;
    arr(o.waPeople).forEach((p) => {
      if (!isObj(p)) return;
      havePull = true;
      const raw = trim(p.external_oid || p.oid), oid = normOid(raw);
      if (!oid) return;
      if (raw !== oid) oidCase.push({ raw, oid, role: trim(p.role) });
      waPersonOids.add(oid);
      if (trim(p.role) === "student" && p.active !== false) waStudentOids.add(oid);
    });
    /* the tombstones Wings Ahead reported at the last pull — an identity nobody
       may resurrect by accident (design B.6). The ledger carries its own memory
       of a removal too; this is the OTHER side's, and a drift between the two is
       a report line rather than a silence. */
    const tombs = new Set();
    arr(o.tombstones).forEach((t) => {
      if (!isObj(t) || t.cleared_at) return;
      tombs.add(normOid(t.student_oid) + " " + trim(t.rid));
    });

    /* THE NUMBERS MINTED IN *THIS* RUN COUNT AS TAKEN, and that is not
       bookkeeping — it is the twin dedup itself. Two events describing the same
       flight with the same facts (ruling #1's own scenario: the morning bust and
       the afternoon re-fly) are ONE ROW to Wings Ahead, which said so in its own
       comment and handed the problem here. If the minters saw only the STORED
       ledger, both would mint ord 1 / seq 1 on their first push, collide on one
       handle, and the second would be answered `exists_fdms` for ever. The two
       tables above are updated as each number is handed out, so the second twin
       is separated from the first in the one place that can tell them apart:
       their FDMS event ids. */
    let queued = [], removals = [];
    const blocked = [], held = [];
    const seenLedger = new Set();

    /* ══ A REMOVAL IS A FACT ABOUT THE TRAINING LOG, NEVER ABOUT A LOOKUP ═════
       ═══════════════════════════════════════════════════════════════════════
       THE FINDING THIS EXISTS FOR (P45-FDMSd, verify item 10). The verifier
       renamed ONE instructor's roster object id in Wings Ahead — an ordinary
       posting, rename or departure. Nothing else moved: the 158 FDMS events
       flown with that instructor sat in the training log, unedited. The next
       live read made this derivation produce **148 PENDING REMOVALS** of
       correct, bridge-written flight rows, every one of them carrying the
       sentence «the FDMS event this row came from is gone from the training
       log, or no longer qualifies to cross». That sentence was FALSE. He
       confirmed one line and the wire answered `removed`: the row is gone from
       Wings Ahead and a `source_removed` tombstone stands on the identity.
       «␥ Confirm all 148» would have destroyed 148 rows.

       WHY IT HAPPENED, AND IT IS A STRUCTURAL FAULT AND NOT A TYPO. The sweep
       below asks the ledger ONE question — «did any event answer for this row
       this run?» — and every `return` in the loop above answers «no» in the
       same voice, whatever it was actually about. So «the developer deleted
       this flight» and «the read on screen cannot resolve an OID» arrived at
       the sweep indistinguishable, and the sweep, being able to name only one
       of them, named the wrong one.

       THE DISTINCTION, AND IT IS A DISTINCTION OF FACTS:
         · A row is owed a REMOVAL when THE FDMS SIDE MOVED — the event was
           deleted from the training log, or it was EDITED out of qualifying
           (its result, its scope, its date, its node). That is a change to the
           thing the row was written from, and the row it wrote is now a claim
           this store no longer makes.
         · A row is STRANDED when the event stands unchanged and this RUN
           cannot resolve something around it — a person in either roster, an
           object id in the read of Wings Ahead, a node in the syllabus graph.
           Nothing over there is owed anything: the rows stand, the events
           stand, and what is broken is a lookup. It becomes ONE held line
           naming the person and the fact, `removals` stays 0, and the reason
           `source_removed` is never built for it.

       AND THE HELD LINE IS ONE PER FACT, NOT ONE PER ROW — the same judgement
       § 15λ·2 took for the student the server refuses: 148 identical lines is
       not a report, it is the place a report goes to be ignored. The strand
       carries the count of rows standing behind it, exactly as the student
       hold carries the count of flights standing behind it. */
    const strandedBy = new Map();          // rid → the key of the fact holding it
    const strands = new Map();             // key → the ONE held line all of them share
    /* the key is «what kind of fact» + «which one», joined the way every other
       composite key in this file is joined — on a character no identifier of
       either system can contain. */
    const sKey = (kind, of) => kind + " " + trim(of);
    const strand = (rows, key, who, what) => {
      arr(rows).forEach((L) => {
        const rid = trim(L.rid);
        if (!rid || strandedBy.has(rid)) return;
        strandedBy.set(rid, key);
      });
      if (!strands.has(key)) strands.set(key, { key, who, what, n: 0, chg: 0, uids: [] });
    };
    /* ── «UNEDITED» IS A CLAIM ABOUT THE TRAINING LOG, SO THE LOG ANSWERS IT ──
       P45-FDMSe, verify item 8. The held line used to end «…and the FDMS events
       they came from are still in the training log, UNEDITED» without ever
       consulting the training log, and the verifier reproduced it in one act:
       make an instructor's object id unresolvable in the read AND move one of
       his events. Without the read that event's old row owes a genuine
       removal; with the read the removal is (correctly, and by the invariant a
       read may never ADD one) absorbed into the strand — and the sentence then
       told the developer all 151 events were unedited when one of them was not.
       This is the check the sentence was missing, and it is three lookups in
       maps this run has already built: TRUE when the row behind the hold WOULD
       have been owed an event-side removal but for the fault holding it. */
    const evChanged = (L) => {
      const e = trim(L && L.evId);
      if (!e) return false;
      if (!liveEv.has(e)) return true;                     // deleted from the log
      const nd = evNode.get(e);
      if (nd && nd !== trim(L.uid)) return true;           // moved to another node
      return evWhy.has(e);                                 // edited out of qualifying
    };
    /* WHAT A REMOVAL IS ALLOWED TO SAY, and the sweep proves each one before it
       says it: the event id is looked for in the training log by name, and when
       it IS there the sentence that disqualified it is the one carried out of
       the loop. A removal that cannot name its fact does not get to guess. */
    const liveEv = new Set();              // every event id the training log carries
    const evWhy = new Map();               // evId → the EVENT-SIDE sentence that disqualified it
    const evNode = new Map();              // evId → the syllabus node it names NOW
    /* ── AND WHAT THE RUN ACTUALLY DID WITH THE EVENT (P45-FDMSe, item 7) ────
       `evWhy` above is filled ONLY for `fact === "event"`, because only an
       event-side clause may be quoted as the reason a row is REMOVED. The
       moved-branch's consequence clause then had nothing to read for a GRAPH
       fact and printed «the flight itself is queued afresh under its new node»
       unconditionally — measured FALSE: move a flight onto a node the syllabus
       graph does not carry and the same pane lists it under «does not cross
       this lane» while the removal beside it promises a re-queue.
       `evFate` is the cure: one entry per event, written at the very point the
       run decides, covering EVERY exit — blocked (whosever fact it is), held
       behind a lookup, already standing, held, undone, queued. Nothing here
       infers; `movedTail` reads it back. */
    const evFate = new Map();              // evId → {kind, why, how, hold}
    const queuedNow = new Set();           // evId → still on the queue when the run ENDS

    log.forEach((ev) => {
      if (!isObj(ev) || !trim(ev.id)) return;
      liveEv.add(trim(ev.id));
      const code = trim(ev.student);
      const stu = code ? stuByCode.get(code) : null;
      const node = evNodeOf(ev);
      /* THE NODE IT NAMES **NOW**, recorded before any refusal can stop the run
         — because «this event moved to another node» is a fact about the event
         whether or not the node it moved TO qualifies, and the row it left
         behind is entitled to be told which node took its place. */
      if (node) evNode.set(trim(ev.id), node);
      const band = node ? kindOf(nodeOfUid(node)) : null;
      const evId = trim(ev.id);

      /* the ledger rows this event is the source of — paired by evId FIRST and
         then by the identity's own (oid, group, uid); an event whose NODE moved
         is a different identity, and the old one is owed a removal. */
      const mine = arr(idx.byEv.get(evId));

      const blk = pushBlockWhy(ev, ctx);
      const why = blk.why;
      if (why) {
        /* an event that no longer qualifies but whose row we PUSHED still owes a
           removal — that is exactly the «source_removed» case, and it is the
           reason the block list and the removal list are built in one pass.
           ONLY WHEN THE EVENT IS WHAT MOVED, though: a GRAPH answer is not an
           edit to the training log, and the rows written under THAT SAME NODE
           are stranded rather than removed. A row written under a DIFFERENT
           node is one this event moved away from — that one is a real removal,
           and it keeps its place in the sweep. */
        evFate.set(evId, { kind: "block", why: why, fact: blk.fact });
        if (blk.fact === "graph" && node) {
          strand(mine.filter((x) => trim(x.uid) === node), sKey("graph", node),
            stu ? label(stu) : code,
            "THE SYLLABUS GRAPH, NOT THE TRAINING LOG: " + why);
        } else if (blk.fact === "event") { evWhy.set(evId, why); }
        /* WHICH REFUSALS ARE WORTH LISTING. A SORTIE this store holds for a
           student and does not send is a fact the developer has to be able to
           see — including, and especially, one whose node the syllabus graph
           does not carry, which is the case a silent list would hide best.
           A GROUND event is not listed: «ground never crosses» is a doctrine
           printed in the legend, not a per-event finding, and one line per
           lesson per student would bury the sortie that matters. An ECHO is not
           listed either: it is not a candidate that failed, it is not a
           candidate. */
        if (!mine.length) {
          if (trim(ev.scope) === "student" && !isWaWritten(ev) && node && node.indexOf("s:") === 0) {
            blocked.push({ evId, student: code, uid: node, date: isoDate(ev.date),
              who: stu ? label(stu) : code, why });
          }
          return;
        }
        return;                                   // its ledger rows are swept below
      }
      /* ── THE FIVE LOOKUPS, AND NOT ONE OF THEM IS AN EDIT TO THE TRAINING LOG
         Two rosters and one read answer below. Each of them can stop this event
         from crossing TODAY, and none of them says anything whatever about the
         row the bridge already wrote: the flight was flown, the event is typed,
         the row stands. So each one strands the rows it cannot vouch for and
         says which lookup failed — the removal list never hears about it. */
      if (!stu) {
        const w = "«" + code + "» is not a student of this FDMS roster — a flight is pushed onto the "
          + "record of a person, and this side cannot name one";
        blocked.push({ evId, student: code, uid: node, date: isoDate(ev.date), who: code, why: w });
        evFate.set(evId, { kind: "lookup", why: w });
        strand(mine, sKey("fdms-stu", code), code, "THE FDMS ROSTER, NOT THE TRAINING LOG: " + w);
        return;
      }
      const oid = normOid(stu.oid);
      if (!oid) {
        const w = "this student carries no OID, and the OID is the ONE thing the two systems join on "
          + "(ruling #4) — a surname never resolves anybody across this wire";
        blocked.push({ evId, student: code, uid: node, date: isoDate(ev.date), who: label(stu), why: w });
        evFate.set(evId, { kind: "lookup", why: w });
        strand(mine, sKey("fdms-stu-oid", code), label(stu),
          "THE FDMS ROSTER, NOT THE TRAINING LOG: " + w);
        return;
      }
      if (havePull && !waStudentOids.has(oid)) {
        const w = "no ACTIVE Wings Ahead student carries the roster object id " + oid + " — the person has "
          + "to exist there, and be active, before a flight can be pushed onto his record";
        blocked.push({ evId, student: code, uid: node, date: isoDate(ev.date), who: label(stu), why: w });
        evFate.set(evId, { kind: "lookup", why: w });
        strand(mine, sKey("wa-stu", oid), label(stu) + " · " + oid,
          "THE READ OF WINGS AHEAD, NOT THE TRAINING LOG: the roster in the read on screen carries no "
          + "ACTIVE person with the object id " + oid + " — he has been deactivated there, renamed, "
          + "re-numbered, or this is a read of a different Wings Ahead.");
        return;
      }
      const ip = ipByCode.get(trim(ev.instructor));
      if (!trim(ev.instructor)) {
        /* THE ONE EVENT-SIDE FACT IN THIS BLOCK: the event itself names nobody.
           Somebody edited the flight, and a row that can no longer say who flew
           it is a claim this store stops making. It is a REMOVAL, and it keeps
           the sentence that proves it. */
        const w = "the flight names no instructor — «a student never launches alone on their own "
          + "authority», and Wings Ahead requires one on every row";
        blocked.push({ evId, student: code, uid: node, date: isoDate(ev.date), who: label(stu), why: w });
        evWhy.set(evId, w);
        evFate.set(evId, { kind: "block", why: w, fact: "event" });
        return;
      }
      if (!ip || !normOid(ip.oid)) {
        const w = "«" + trim(ev.instructor) + "» resolves to no FDMS instructor with an OID — an identity "
          + "is never guessed from a name across this wire (ruling #4)";
        blocked.push({ evId, student: code, uid: node, date: isoDate(ev.date), who: label(stu), why: w });
        evFate.set(evId, { kind: "lookup", why: w });
        strand(mine, sKey("fdms-ip", trim(ev.instructor)), "instructor «" + trim(ev.instructor) + "»",
          "THE FDMS ROSTER, NOT THE TRAINING LOG: " + w);
        return;
      }
      if (havePull && !waPersonOids.has(normOid(ip.oid))) {
        const w = "the instructor's object id " + normOid(ip.oid) + " is not on the Wings Ahead roster — "
          + "the row would carry an identity that side cannot resolve";
        blocked.push({ evId, student: code, uid: node, date: isoDate(ev.date), who: label(stu), why: w });
        evFate.set(evId, { kind: "lookup", why: w });
        strand(mine, sKey("wa-ip", normOid(ip.oid)), label(ip) + " · " + normOid(ip.oid),
          "THE READ OF WINGS AHEAD, NOT THE TRAINING LOG: the roster in the read on screen no longer "
          + "carries the object id " + normOid(ip.oid) + " — the instructor was renamed there, "
          + "re-numbered, or he has departed the squadron.");
        return;
      }

      const group = band;
      let L = mine.find((x) => normOid(x.oid) === oid && trim(x.group) === group && trim(x.uid) === node) || null;
      if (L) seenLedger.add(trim(L.rid));
      else if (mine.length) {
        /* ── THE PAIRING MISSED, AND THE REASON DECIDES EVERYTHING ───────────
           A row of this very event that did not pair is either one the event
           MOVED AWAY FROM — a different node, an FDMS edit, a real removal
           handled by the sweep — or one whose identity was moved UNDER it by
           something that is not the training log at all. Two of those, and both
           strand:
             · the SECTION changed while the node did not. Only `kindOf` can do
               that: the syllabus graph re-filed the code from `flights` to `fs`
               or back. The event is untouched.
             · the student's OID changed in the FDMS ROSTER. The rid embeds the
               OID it was written under, so the old rows point at the person
               they were actually written onto. Nothing here can know whether
               the old number was a mistake being corrected or a second person,
               and «delete the rows» is not a guess this side is entitled to. */
        const here = mine.filter((x) => trim(x.uid) === node && trim(x.state) !== "removed");
        strand(here.filter((x) => normOid(x.oid) === oid && trim(x.group) !== group),
          sKey("graph-band", node), stu ? label(stu) : code,
          "THE SYLLABUS GRAPH, NOT THE TRAINING LOG: the graph now files «" + codeOfNode(node)
          + "» in the «" + group + "» section, and the row the bridge wrote for it stands in another "
          + "section of the same record. The event is unchanged; what moved is the graph.");
        const moved = here.filter((x) => normOid(x.oid) !== oid);
        strand(moved, sKey("oid-moved", code), label(stu),
          "THE FDMS ROSTER, NOT THE TRAINING LOG: this student now carries the object id " + oid
          + " and the row the bridge wrote stands on the record of "
          + (moved.length ? normOid(moved[0].oid) : "another object id") + ". Settle which object id is "
          + "the right one BEFORE the next push: this flight is queued as a create under " + oid + ", and "
          + "the old row is not touched by anything this pane does.");
      }

      const date = isoDate(ev.date);
      const ord = L ? posInt(L.ord, 1) : mintOrd(idx, oid, group, node);
      const rid = L ? trim(L.rid) : ledRid(oid, group, node, ord);
      if (rid.length > RID_MAX) {
        const w = "the row identity is " + rid.length + " characters and the wire carries at most "
          + RID_MAX + " — it is what the tombstones and the audit are keyed to";
        blocked.push({ evId, student: code, uid: node, date, who: label(stu), why: w });
        evFate.set(evId, { kind: "block", why: w, fact: "identity" });
        return;
      }
      const seq = L ? posInt(L.seq, 1) : mintSeq(idx, oid, codeOfNode(node), date);
      if (!seq) {
        const w = "twenty flights of «" + codeOfNode(node) + "» already stand on that day — Wings Ahead "
          + "numbers the same-day flights of one code from 1 to " + SEQ_MAX;
        blocked.push({ evId, student: code, uid: node, date, who: label(stu), why: w });
        evFate.set(evId, { kind: "block", why: w, fact: "identity" });
        return;
      }
      const row = pushRowOf({
        date, track: codeTrack(codeOfNode(node)), sortie: codeOfNode(node), seq,
        /* THE KIND: the first attempt on a node is its syllabus flight; every
           attempt after it is a re-fly, which is exactly what Wings Ahead's
           `repeat` kind exists to say. Frozen with the ordinal. */
        kind: ord > 1 ? "repeat" : "syllabus",
        instructor: normName(ip.last_name) || trim(ip.code),
        instructorOid: normOid(ip.oid),
        mission: PUSH_MISSION[trim(ev.result)],
      });
      const line = { rid, oid, group, uid: node, ord, seq, evId, student: code, who: label(stu),
        date, row, klass: trim(stu.class) };

      if (!L) {
        evFate.set(evId, { kind: "queued", how: "create" });
        queued.push({ kind: "create", line,
          op: { op: "upsert", section: group, rid, prev: null, row, clear_tombstone: false } });
        return;
      }
      const state = trim(L.state), hold = trim(L.hold);
      if (hold) {
        evFate.set(evId, { kind: "held", hold: hold });
        held.push({ line: Object.assign({}, line, { row }), hold, note: trim(L.note),
          verdict: trim(L.verdict), sent: isObj(L.sent) ? L.sent : null, src: "event" });
        return;
      }
      if (state === "removed") {
        evFate.set(evId, { kind: "held", hold: "removed" });
        held.push({ line: Object.assign({}, line, { row }), hold: "removed",
          note: "this identity was removed from Wings Ahead by the bridge and a tombstone lies on it — "
            + "bringing it back is a deliberate act, never something the queue does by itself",
          verdict: trim(L.verdict), sent: isObj(L.sent) ? L.sent : null, src: "event" });
        return;
      }
      if (state === "undone") {
        evFate.set(evId, { kind: "undone" });
        removals.push({ line, reason: "undo", rid, oid, sent: isObj(L.sent) ? L.sent : row,
          why: "the developer took this push back (↺ Undo) — the Wings Ahead row it created is removed "
            + "and the identity is tombstoned, which is what makes the undo stick",
          op: { op: "remove", section: group, rid, prev: isObj(L.sent) ? L.sent : row, reason: "undo" } });
        return;
      }
      if (tombs.has(oid + " " + rid) && !L.clearTomb) {
        evFate.set(evId, { kind: "held", hold: "tombstoned" });
        held.push({ line, hold: "tombstoned", src: "event",
          note: "Wings Ahead reports a live tombstone on this identity — it does not come back on its own",
          verdict: "", sent: isObj(L.sent) ? L.sent : null });
        return;
      }
      const sent = isObj(L.sent) ? L.sent : null;
      if (state === "pushed" && sent && sameWaRow(sent, row)) {
        evFate.set(evId, { kind: "standing" });
        return;                                                           // nothing owed
      }
      const isMove = !!sent && (up(sent.sortie) !== up(row.sortie) || isoDate(sent.date) !== isoDate(row.date)
        || posInt(sent.seq, 1) !== posInt(row.seq, 1));
      evFate.set(evId, { kind: "queued", how: sent ? (isMove ? "move" : "change") : "create" });
      queued.push({ kind: sent ? (isMove ? "move" : "change") : "create",
        line: Object.assign({}, line, { sent }),
        op: { op: "upsert", section: group, rid, prev: sent, row,
          clear_tombstone: !!L.clearTomb } });
    });

    /* ── THE OTHER HALF: a ledger row whose source is gone ────────────────
       Never queued, never automatic. It lands in Pending removals with its
       reason, and it crosses only through the numbered dialog — deletion is
       never accidental, on the wire as at home. */
    idx.list.forEach((L) => {
      const rid = trim(L.rid);
      if (!rid || seenLedger.has(rid)) return;
      if (trim(L.state) === "removed") return;                      // already gone
      const group = trim(L.group), oid = normOid(L.oid);
      const sent = isObj(L.sent) ? L.sent : null;
      if (!sent) return;                       // never landed anywhere — nothing to remove
      const undone = trim(L.state) === "undone";
      if (trim(L.hold) && !undone) {
        held.push({ line: { rid, oid, group, uid: trim(L.uid), ord: posInt(L.ord, 1), seq: posInt(L.seq, 1),
          evId: trim(L.evId), student: trim(L.student), who: trim(L.student), date: isoDate(sent.date),
          row: sent, klass: "" }, hold: trim(L.hold), note: trim(L.note), verdict: trim(L.verdict), sent,
        src: "ledger" });
        return;
      }
      /* ── THE STRAND GATE (P45-FDMSd · finding A) ────────────────────────
         An UNDO is the developer's own act and it is owed whatever the rosters
         are doing — it is the only removal on this side that a human asked for
         by name. Everything else has to get past the lookups first: if a fact
         about a roster, the graph or the read on screen is what took this row's
         event out of the run, the row is HELD behind that fact and no `remove`
         operation is built for it at all. */
      const sK = undone ? "" : strandedBy.get(rid);
      if (sK && strands.has(sK)) {
        const s = strands.get(sK);
        s.n += 1;
        if (evChanged(L)) s.chg += 1;         // and it is SAID, not swallowed
        const u = trim(L.uid);
        if (u && s.uids.length < 4 && s.uids.indexOf(u) < 0) s.uids.push(u);
        return;
      }
      const line = { rid, oid, group, uid: trim(L.uid), ord: posInt(L.ord, 1), seq: posInt(L.seq, 1),
        evId: trim(L.evId), student: trim(L.student), who: trim(L.student),
        date: isoDate(sent.date), row: sent, klass: "" };
      removals.push({ line, reason: undone ? "undo" : "source_removed", rid, oid, sent,
        why: undone
          ? "the developer took this push back (↺ Undo) — the Wings Ahead row it created is removed and "
            + "the identity is tombstoned, which is what makes the undo stick"
          : removalWhy(L),
        /* the ledger row, kept just long enough to ask `removalWhy` a SECOND
           time once the queue is final — see the finalising pass below. It is
           deleted there, so nothing but the sentence leaves this function. */
        srcRow: undone ? null : L,
        op: { op: "remove", section: group, rid, prev: sent,
          reason: undone ? "undo" : "source_removed" } });
    });

    /* ── THE SENTENCE A REMOVAL IS ENTITLED TO SAY ────────────────────────
       It used to say «gone from the training log, OR no longer qualifies … (its
       node, its scope or its result changed)» — an either/or covering four
       possibilities at once, which is what let it be printed over a case that
       was none of them. Each branch below is PROVEN before it is printed: the
       event id is looked for in the training log by name, and when it is there,
       the sentence that disqualified it is the very one the loop above produced
       for it. Nothing here guesses, and there is no «or». */
    function removalWhy(L) {
      const ev = trim(L.evId);
      if (!ev) {
        return "this ledger row names no FDMS event at all, so nothing in the training log can be "
          + "answering for the Wings Ahead row it wrote — it is owed a removal";
      }
      if (!liveEv.has(ev)) {
        return "the FDMS event this row was written from is GONE from the training log — this side has "
          + "looked for «" + ev + "» by id, in the whole log, and it is not there. The row it wrote is "
          + "owed a removal";
      }
      /* THE NODE IS ASKED FIRST, and the order is the judgement: when the event
         has moved, «it now names another node» is the PRECISE fact about this
         row, and «it no longer qualifies» would be a fact about a node that was
         never this row's. */
      const nd = evNode.get(ev);
      if (nd && nd !== trim(L.uid)) {
        return "the FDMS event this row was written from now names the syllabus node «" + nd + "», and "
          + "this row was written for «" + trim(L.uid) + "» — the event MOVED, and the row it left behind "
          + "is owed a removal" + movedTail(ev, nd);
      }
      const w = evWhy.get(ev);
      if (w) {
        return "the FDMS event this row was written from is STILL in the training log and has been edited "
          + "out of qualifying: " + w + " — so the row it wrote is owed a removal";
      }
      return "the FDMS event this row was written from no longer answers for this row identity — its "
        + "object id, its section or its node is not the one the row was written under, and nothing in "
        + "the training log claims it any more";
    }

    /* ── WHAT HAPPENS TO A MOVED FLIGHT UNDER ITS NEW NODE ────────────────────
       The consequence clause of the MOVED branch, and P45-FDMSd's own verify
       caught it lying (item 7): it printed «the flight itself is queued afresh
       under its new node» whenever `evWhy` was empty, and `evWhy` is filled
       only for an EVENT-side refusal. Move a flight onto a node the syllabus
       graph does not carry and the run queues NOTHING — measured QUEUED 0 —
       while the same pane lists that very event under «does not cross this
       lane» as off_graph. One screen, two contradictory sentences.

       So the clause is now MEASURED, with the same classification the blocked
       list uses: `evFate` says what the run decided about this event, and
       `queuedNow` says whether the line survived to the queue the run actually
       returns (two later sweeps can still take one off it — a malformed `prev`,
       a student the server is holding). Nothing is reassured that was not
       looked up, and an event with no recorded fate gets NO parenthetical at
       all rather than a comforting guess. */
    function movedTail(evId, nd) {
      const at = nd ? "«" + nd + "»" : "its new node";
      const f = evFate.get(evId);
      if (queuedNow.has(evId)) {
        return " (and the flight itself IS queued under " + at + " in this same run, "
          + ((f && f.how) === "create" ? "as a new row" : "as a change to the row already standing there")
          + ")";
      }
      if (!f) return "";
      if (f.kind === "standing") {
        return " (and the flight itself is owed nothing under " + at + ": the row the bridge wrote there "
          + "already says exactly this, fact for fact)";
      }
      if (f.kind === "held") {
        return " (and the flight does NOT cross under " + at + " either: the row there is held «"
          + f.hold + "» and off the queue until a human settles it)";
      }
      if (f.kind === "undone") {
        return " (and the flight does NOT cross under " + at + " either: the push that wrote its row "
          + "there was taken back with ↺ Undo, so that row is owed a removal of its own)";
      }
      if (f.kind === "lookup") {
        return " (and the flight does NOT cross under " + at + " either — and this is a LOOKUP, not the "
          + "training log: " + f.why + ")";
      }
      if (f.kind === "queued") {
        /* it was queued and a later sweep took it off — say that, do not
           promise a crossing the caller can see did not happen */
        return " (and the flight itself is NOT on the queue that leaves this run: its line under " + at
          + " was taken off it — the Held table below says by what)";
      }
      return " (and the flight does NOT cross under " + at + " either: " + f.why + ")";
    }

    /* ── AND THE STRANDS BECOME ONE HELD LINE EACH ────────────────────────
       Only the ones that actually caught a row: a lookup that failed for an
       event nobody ever pushed has cost nothing and has nothing to say. */
    let strandedRows = 0, strandedChanged = 0;
    strands.forEach((s) => {
      if (!s.n) return;
      strandedRows += s.n;
      strandedChanged += s.chg;
      const many = s.n !== 1;
      /* THE TWO HALVES OF THE OLD SENTENCE, EACH PUT WHERE IT BELONGS
         (P45-FDMSe, verify item 8). What this side CAN establish it states; what
         it cannot it does not state at all. «Nothing is removed» is a fact about
         what this run built and it stands. «The events are in the training log»
         is a fact this run read — every one of these rows is here BECAUSE its
         event was walked in the log above. «Unedited» was neither: it is now
         asked, per row, by `evChanged`. And «the rows are still standing over
         there» is knowledge of the OTHER side that this pane's read does not
         carry — the read is consulted for its roster of people and nothing
         else — so it is said as what it is. */
      const changed = s.chg
        ? " — and " + (many ? s.chg + " of them " + (s.chg === 1 ? "carries a change of its own"
          : "carry a change of their own") : "IT CARRIES A CHANGE OF ITS OWN")
          + ", WAITING BEHIND THIS HOLD: the event" + (s.chg === 1 ? " it was" : "s they were")
          + " written from " + (s.chg === 1 ? "has" : "have") + " been deleted, moved to another node, or "
          + "edited out of qualifying, and the removal that says so is derived — with the sentence that "
          + "proves it — on the first run where this lookup answers."
        : " — and this run asked the training log about " + (many ? "every one of them: not one is"
          : "it: it is not") + " deleted, moved to another node, or edited out of qualifying.";
      held.push({
        line: { rid: "", oid: "", group: "", uid: s.uids.join(" · ") + (s.n > s.uids.length ? " · …" : ""),
          ord: 0, seq: 0, evId: "", student: "", who: s.who, date: "", row: null, klass: "" },
        hold: "unresolved", src: "roster", rows: s.n, changed: s.chg, verdict: "", sent: null,
        note: s.what + "  NOTHING IS REMOVED AND NOTHING IS LOST: this run builds no removal for "
          + (many ? "any of the " + s.n + " rows" : "the one row") + " the bridge wrote — a row is NEVER "
          + "taken off a student's record because a lookup failed, so «source_removed» is not built for "
          + (many ? "any of them" : "it") + ". "
          + "THE FDMS EVENT" + (many ? "S" : "") + " BEHIND " + (many ? "THEM" : "IT") + " "
          + (many ? "ARE" : "IS") + " IN THE TRAINING LOG — this run walked "
          + (many ? "them" : "it") + " there by id" + changed + " "
          + "WHAT THIS SIDE HAS NOT LOOKED AT is the Wings Ahead record itself: the read on this pane is "
          + "consulted for its roster of PEOPLE and for nothing else, so «the row" + (many ? "s" : "")
          + " still stand" + (many ? "" : "s") + " over there» is what this side last WROTE, not what it "
          + "has just seen — the cross-check report is where that is answered. "
          + "They wait: heal the roster — or take a read that carries it — and "
          + "they are ordinary tracked rows again on the very next run, with nothing to undo. "
          + "AND IF THOSE ROWS REALLY SHOULD COME OFF THE RECORD, the act that says so is deleting the "
          + "FDMS EVENTS in the training log: that is a statement about the flights, it is made where the "
          + "flights live, and each row is then owed a removal that can prove its own reason.",
      });
    });

    /* ── THE TWO SWEEPS THAT ARE NOT ABOUT ONE ROW ────────────────────────
       Both take lines OFF the queue and put them where a human reads them, and
       both run after the identity passes because both are about something the
       identity passes cannot see: the shape of a memory, and a person. */

    /* (a) A `prev` THIS SIDE MUST NOT SEND. The claim is malformed, so it is not
       made: the line is held BY NAME, here, with no wire call — and the ledger
       is not repaired behind the developer's back (see prevProblem). */
    let heldFlights = 0;
    const scrub = (list, src) => list.filter((e) => {
      const why = prevProblem(e.op.prev);
      if (!why) return true;
      held.push({ line: e.line, hold: "malformed", note: why, verdict: "",
        sent: isObj(e.op.prev) ? e.op.prev : null, src });
      return false;
    });
    queued = scrub(queued, "event");
    removals = scrub(removals, "ledger");

    /* (b) ONE STUDENT WINGS AHEAD CANNOT RESOLVE HOLDS ONLY HIS OWN FLIGHTS.
       An unknown or inactive OID is an ENVELOPE raise over there: it voids that
       student's WHOLE call before a single operation is read. Before this round
       the answer stopped the run, so one student typed into FDMS before he
       exists in Wings Ahead — the normal order of onboarding, and ruling #4
       forbids resolving him by name — starved every student behind him. Now the
       refusal is recorded against the PERSON, his lines come off the queue with
       the server's own sentence beside them, and everybody else crosses in the
       same run. The count is kept apart from `queued` on purpose: these flights
       are owed and they are NOT going anywhere until a human acts. */
    if (idx.stuHold.size) {
      const hit = new Map();
      const divert = (list) => list.filter((e) => {
        const oid = normOid(e.line.oid);
        if (!idx.stuHold.has(oid)) return true;
        if (!hit.has(oid)) hit.set(oid, { n: 0, who: trim(e.line.who) });
        hit.get(oid).n += 1;
        heldFlights += 1;
        return false;
      });
      queued = divert(queued);
      removals = divert(removals);
      idx.stuHold.forEach((L, oid) => {
        const h = hit.get(oid);
        held.push({ line: { rid: trim(L.rid), oid, group: "", uid: "(the whole student)", ord: 0, seq: 0,
          evId: "", student: trim(L.student), who: (h && h.who) || trim(L.student) || oid, date: "",
          row: null, klass: "" },
        hold: trim(L.hold), note: trim(L.note), verdict: trim(L.verdict), sent: null,
        src: "student", flights: h ? h.n : 0 });
      });
    }

    /* ── THE MOVED SENTENCE IS FINALISED AFTER THE QUEUE IS ──────────────────
       `removalWhy` was asked once while the queue was still being built; both
       sweeps above can still take a line OFF that queue (a malformed `prev`, a
       student the server is holding), and «the flight itself IS queued» is a
       claim about the queue this run RETURNS. So it is asked again here, with
       `queuedNow` filled — and the ledger row it needed is dropped, so the
       removal that leaves this function carries a sentence and nothing else. */
    queued.forEach((q) => { const i = trim(q.line && q.line.evId); if (i) queuedNow.add(i); });
    removals.forEach((r) => {
      if (r.reason === "source_removed" && r.srcRow) r.why = removalWhy(r.srcRow);
      delete r.srcRow;
    });

    /* group by student: bridge_push takes ONE student per call, and chunks of at
       most 200 operations (the server refuses the 201st by name). */
    const byStudent = new Map();
    const push = (oid, who, code, entry) => {
      if (!byStudent.has(oid)) byStudent.set(oid, { oid, who, code, ops: [], lines: [] });
      const b = byStudent.get(oid);
      b.ops.push(entry.op);
      b.lines.push(entry.line);
    };
    queued.forEach((q) => push(q.line.oid, q.line.who, q.line.student, q));

    return {
      schema: WA_BRIDGE_SCHEMA,
      queued, removals, blocked, held, oidCase,
      students: Array.from(byStudent.values()),
      counts: { queued: queued.length, removals: removals.length, blocked: blocked.length,
        held: held.length, heldFlights, ledger: idx.list.length, students: byStudent.size,
        /* the rows a failed lookup is holding — counted apart from `held`,
           which counts LINES, because one line can stand for 148 rows */
        stranded: strandedRows,
        /* and how many of THOSE are sitting on a real event-side change that
           the hold is (correctly) delaying — the number the held line used to
           deny categorically without ever asking (P45-FDMSe, item 8) */
        strandedChanged: strandedChanged },
    };
  }

  /* one person's display label, without reaching for the store (the planner is
     pure) — the same three rules SchedStore.personLabel uses. */
  function label(p) {
    const ln = trim(p && p.last_name), fn = trim(p && p.first_name);
    if (ln) return ln + (fn ? " " + fn.charAt(0) + "." : "");
    return trim(p && p.code);
  }

  /* ── CHUNKING — the client's own bound, said before the server says it ────
     The wire refuses the 201st operation of a call BY NAME, at the envelope,
     which would take the 200 well-formed ones standing beside it. So the client
     never builds a 201st: it splits, in order, and the two halves stay lined up
     (`entries[i]` is what `ops[i]` came from, which is what folds the answer).
     THE SIZE IS PUSH_CHUNK AND NOT PUSH_MAX_OPS — see the constant: 200 is what
     the envelope accepts and 25 is what the three-second statement budget can
     finish. `size` is passed in by the sender, which halves it on a timeout. */
  function chunkOps(ops, entries, size) {
    const n = Math.max(1, Math.min(posInt(size, PUSH_CHUNK), PUSH_MAX_OPS));
    const out = [];
    for (let i = 0; i < arr(ops).length; i += n) {
      out.push({ ops: ops.slice(i, i + n), entries: arr(entries).slice(i, i + n) });
    }
    return out.length ? out : [];
  }

  /* ── FOLDING A VERDICT (design B.7, against the DEPLOYED eleven words) ────
     One verdict in, one ledger row out — plus the sentence the report prints.
     `advance` is the whole safety property: the ledger moves ONLY on an answer
     that says the row is now what we sent, so the next `prev` is always the row
     of the LAST ACKNOWLEDGED push and a replay is always the identical op. */
  function foldVerdict(v, entry) {
    const op = entry.op, line = entry.line;
    const isRemove = op.op === "remove";
    const row = isObj(op.row) ? op.row : null;
    const base = { rid: line.rid, oid: line.oid, group: line.group, uid: line.uid,
      ord: line.ord, seq: line.seq, evId: line.evId, student: line.student,
      verdict: trim(v && v.verdict), note: trim(v && v.note), at: new Date().toISOString(),
      hold: "", reason: "", clearTomb: false, waRow: null };
    const word = trim(v && v.verdict);
    switch (word) {
      case "created": case "moved": case "updated":
        return Object.assign(base, { sent: row, state: "pushed", cls: "agree",
          say: word === "created" ? "created in Wings Ahead"
            : word === "moved" ? "moved to its corrected date in Wings Ahead"
              : "updated in Wings Ahead" });
      case "unchanged":
        return Object.assign(base, { sent: isRemove ? (isObj(op.prev) ? op.prev : null) : row,
          state: isRemove ? "removed" : "pushed", cls: "agree",
          say: isRemove ? "already removed — the tombstone was already lying on it"
            : "already exactly this, fact for fact — a replay, absorbed" });
      case "removed":
        return Object.assign(base, { sent: isObj(op.prev) ? op.prev : row, state: "removed",
          reason: trim(op.reason), cls: "agree",
          say: "removed from Wings Ahead, and a tombstone now lies on the identity" });
      case "exists_student":
        return Object.assign(base, { sent: isObj(op.prev) ? op.prev : null, state: "pushed",
          hold: "student", waRow: isObj(v.row) ? v.row : null, cls: "payload_differs",
          say: "a row the STUDENT typed stands at that flight, date and seq — the bridge never writes "
            + "over what a human wrote. Both versions are on the report; the developer rules" });
      case "exists_admin":
        return Object.assign(base, { sent: isObj(op.prev) ? op.prev : null, state: "pushed",
          hold: "admin", waRow: isObj(v.row) ? v.row : null, cls: "payload_differs",
          say: "the Wings Ahead admin has taken this row over — only he writes it now" });
      case "exists_fdms":
        /* THE STALE-`prev` REFUSAL, and the queue must NOT wedge on it. The
           ledger did not advance, so nothing was written and nothing was lost —
           but the identity is HELD, off the queue, with the server's own
           sentence beside it, until the developer clears it explicitly. An
           automatic retry would re-send the same stale claim for ever. */
        return Object.assign(base, { sent: isObj(op.prev) ? op.prev : null, state: "pushed",
          hold: "conflict", cls: "payload_differs",
          say: "a row the bridge itself wrote holds that flight, date and seq, and this operation did "
            + "not describe it correctly — Wings Ahead refuses to write over a row the sender has not "
            + "seen. Nothing was written. ⟳ Refresh from Wings Ahead, then clear this line by hand" });
      case "missing":
        /* ── THE MEMORY IS KEPT, AND THAT IS THE WHOLE FIX (verify item 5) ──
           This used to answer `sent: null` — the ledger forgot the row it had
           written — while the pane said «putting it back is a deliberate
           re-push». Follow that sentence and the next push is a CREATE with
           `prev: null`, and the record ends with TWO fdms rows for one FDMS
           event: the orphan is outside the ledger, so ↺ Undo can never reach
           it and only the cross-check's D.3 note ever mentions it again.

           AND THE SERVER CANNOT TELL US WHICH IT IS. `missing` means «nothing
           stands at the handle your `prev` names» — true after a delete AND
           true after a Wings Ahead admin edits an fdms row's DATE, which moves
           the handle and leaves the row standing three lines further down. The
           two are indistinguishable from over there.

           THIS SIDE CAN DO BETTER THAN GUESS, so it keeps what it knows: the
           row it last wrote stays in `sent`, the identity is HELD, and the way
           out is PULL-INFORMED (§ missingLook · startHold) — adopt the row
           where it now stands, or, only once a read of Wings Ahead has shown
           that no such row exists anywhere on the record, re-create it
           deliberately. There is no one-click path from here to a duplicate. */
        /* `prev` and nothing else: the memory is the CLAIM this operation made,
           and an operation that claimed nothing (a create — which this verdict
           cannot answer, since the server raises it only where `prev` is not
           null) has no memory to keep. */
        return Object.assign(base, { sent: isObj(op.prev) ? op.prev : null, state: "",
          hold: "missing", cls: "deleted",
          say: "nothing stands at that flight, date and seq any more" + (isRemove
            ? " — the row this removal was going to take off the record is already gone from it"
            : "") + ". Either the Wings Ahead admin DELETED the row (his custody) or he MOVED it — he "
            + "edits the date and the handle moves with it — and Wings Ahead cannot tell the two apart. "
            + "This store still remembers the row it wrote, so nothing is guessed: ⟳ read Wings Ahead, "
            + "and the report says whether the row is standing somewhere else on that record" });
      case "tombstoned":
        return Object.assign(base, { sent: isObj(op.prev) ? op.prev : null, state: "removed",
          hold: "tombstoned", cls: "deleted",
          say: "this identity is tombstoned in Wings Ahead — only an explicit, confirmed re-push "
            + "brings it back" });
      case "refused":
        return Object.assign(base, { sent: isObj(op.prev) ? op.prev : null,
          state: isObj(op.prev) ? "pushed" : "", hold: "refused", cls: "unwritten",
          say: "Wings Ahead refused this operation — nothing was written, and the operations sent "
            + "beside it were not affected" });
      default:
        return Object.assign(base, { sent: isObj(op.prev) ? op.prev : null,
          state: isObj(op.prev) ? "pushed" : "", hold: "refused",
          verdict: word || "(none)", cls: "unwritten",
          say: "Wings Ahead answered a word this side does not know («" + (word || "none") + "»). "
            + "Nothing is assumed and nothing is advanced: the identity is held and the answer is "
            + "printed as it arrived" });
    }
  }

  /* ── THE PULL-INFORMED RECONCILIATION (verify item 5) ─────────────────────
     ═══════════════════════════════════════════════════════════════════════════
     Two holds — `missing` (nothing stands where we left our row) and `malformed`
     (this store's memory of the row cannot be sent) — have the SAME question
     underneath them: **what is actually standing on that record right now?**
     Neither can be answered from the ledger, and both were previously answered
     by a ⟳ Clear that armed a blind `prev: null` create. So the answer is read
     from Wings Ahead, and the acts the pane offers are what the read found.

     WHAT COUNTS AS A CANDIDATE, and why each clause is there:
       · the same SECTION — an admin's date edit never moves a row between
         `flights` and `fs`, and the section is half of the FDMS identity;
       · stamped `entered_by: "fdms"` — the bridge adopts only rows the bridge
         wrote. A row a human typed or corrected is his, on both sides of this
         wire, and the server would refuse the lane over it anyway;
       · the same SORTIE, taken from the identity's own `uid` and not from the
         remembered block — for a `malformed` hold the block is exactly what
         cannot be trusted, while the uid is minted by FDMS and never travelled;
       · NOT ALREADY CLAIMED by another row identity of this ledger. Adopting a
         row that belongs to another rid would re-anchor two identities onto one
         Wings Ahead row and the next push would overwrite somebody else's
         flight — the one outcome worse than the duplicate this closes.

     AND IT ADOPTS ONLY WHEN THERE IS EXACTLY ONE. Two candidates is not a
     tie-break, it is a question for a human: both are printed, and the only
     acts left are ✕ Stop tracking and reading again. */

  /* a Wings Ahead entry read back as a WIRE ROW — faithfully, not tidied. The
     next `prev` must describe the row AS IT STANDS, so a grade somebody typed
     or an NG flag somebody set is carried verbatim; pushRowOf's opinions belong
     to the row this side WRITES, never to the row it claims to have seen. */
  function adoptRowOf(e) {
    return {
      date: isoDate(e.date), track: trim(e.track), sortie: up(e.sortie),
      seq: posInt(e.seq, 1), kind: FLIGHT_KINDS.indexOf(trim(e.kind)) >= 0 ? trim(e.kind) : "syllabus",
      instructor: trim(e.instructor) || trim(e.with), instructor_oid: normOid(e.instructor_oid),
      grade: num(e.grade), ng: e.ng === true,
      mission: MISSIONS.indexOf(trim(e.mission)) >= 0 ? trim(e.mission) : "",
    };
  }
  const rowHandle = (r) => (isObj(r) ? up(r.sortie) + " ∷ " + isoDate(r.date) + " ∷ " + posInt(r.seq, 1) : "");

  /* ══ IS THIS READ FRESHER THAN THE REFUSAL IT IS ASKED TO EXPLAIN? ═══════
     ═══════════════════════════════════════════════════════════════════════
     THE FINDING THAT MADE THIS FUNCTION EXIST (P45-FDMSb verify item 5a). The
     reconciliation above is correct when the read is fresh and LETHAL when it
     is not, and it had no freshness test of any kind — its input was
     `ui.parsed`, whatever that happened to be. The verifier followed the
     ORDINARY order of work:

         22:09  ⟳ read Wings Ahead, to build the report
         22:10  ✈ push — the first drain, 1 873 flights
         22:19  the Wings Ahead admin MOVES one row's date
         22:20  ✈ push again  ⇒  `missing`

     …and the pane consulted the 22:09 read — taken when that record was still
     empty — and printed, as a statement of fact, «no row the bridge wrote
     stands anywhere on that record — the read confirms the DELETED case». It
     armed ⊕ Re-create. One confirmed click later the record carried TWO
     fdms rows for one FDMS event, the orphan outside the ledger and unreachable
     by ↺ Undo — the exact failure the whole reconciliation exists to prevent,
     reached through the pane's own primary offered act.

     THE STALENESS THAT KILLS IS NOT THE ONE § 15λ CONSIDERED. That table
     considered a read older than the admin's DELETE, whose worst outcome is
     another `missing`. The read older than the PUSH is the one that kills, and
     it is the DEFAULT state: a read is taken to build the report, and the push
     comes after it.

     ── THE THREE TESTS, IN THE ORDER THEY ARE ASKED ───────────────────────
     ① THE ARRIVAL TEST — necessary, exact, and the only one free of clocks.
        `parsed.taken_at` (when THIS tab took the payload in) and `L.at` (when
        THIS tab folded the refusal) are the SAME browser's clock, so their
        order is a fact and not an estimate. A payload that entered this tab
        before the refusal was recorded cannot describe the world after it. This
        alone refuses the verifier's sequence.
     ② THE AUDIT PROOF — clock-free, and it is the strong one when it is there.
        Wings Ahead files EVERY operation in `wa.bridge_audit`, refusals
        included, and the export carries the last 200 of them with their rid and
        verdict. So if the read's own audit tail carries THIS identity's THIS
        refusal, the export was generated after the refusal was filed — both
        instants on the SERVER's clock, nothing crossing a machine boundary.
     ③ THE GENERATION TEST — the payload's own claim, and it is worth saying
        that it is the weakest. `exported_at` is Wings Ahead's clock and `L.at`
        is this browser's; a badly set clock on either machine moves this answer.
        It is asked only when ② cannot be (a file exported before the refusal's
        audit row, or an export older than the audit tail's 200-row window), and
        the sentence it produces NAMES BOTH INSTANTS so a human can check the
        arithmetic himself instead of trusting it.

     WHAT «NOT FRESH» BUYS. Nothing is repaired and nothing is guessed: the act
     that could create a second row is simply not offered, and the line says
     what would make it offerable — in both of the two ways a payload can be
     refreshed, because until this round the dialogs named only one of them and
     that one was, at the time, dead. */
  const stamp = (s) => { const t = Date.parse(trim(s)); return isFinite(t) ? t : NaN; };
  /* AN INSTANT A HUMAN CAN CHECK AGAINST HIS OWN CLOCK. Both instants in every
     staleness sentence go through this one function, so the comparison the
     developer is invited to make is between two values in the same frame — and
     that frame is HIS, not UTC: `exported_at` arrives with a +00:00 offset and
     the ledger's `at` is a Z string, and printing either raw would ask a man in
     Greece to do the arithmetic twice. An instant this side cannot parse is
     printed exactly as it arrived rather than guessed at. */
  const two = (n) => String(n).padStart(2, "0");
  const hm = (s) => {
    const t = trim(s);
    if (!t) return "(no timestamp)";
    const ms = stamp(t);
    if (!isFinite(ms)) return t;
    const d = new Date(ms);
    /* TO THE SECOND, and that is not pedantry: a stale read and the refusal it
       is being asked to explain are routinely seconds apart — the developer
       reads, pushes, and the answer comes back in the same minute — and two
       instants that both print «00:50» invite a check nobody can make. */
    return dmy(d.getFullYear() + "-" + two(d.getMonth() + 1) + "-" + two(d.getDate()))
      + " " + two(d.getHours()) + ":" + two(d.getMinutes()) + ":" + two(d.getSeconds());
  };
  /* the two doors that refresh a read, named together — every sentence that
     asks for a fresher read points at BOTH, because the live one has been down
     at scale on a real store and the file one is what the verifier actually
     used to get out of it. */
  const REFRESH2 = "⟳ Read Wings Ahead takes the live read on this line, and 📄 File loads a "
    + "wa-export-v1 the Wings Ahead admin downloaded — either one settles it, and the file is the "
    + "route that still works when the live door is refusing at scale";

  function readFresh(L, parsed) {
    const out = { fresh: false, how: "", refusedAt: "", takenAt: "", exportedAt: "", why: "" };
    if (!isObj(L) || !isObj(parsed)) return out;
    out.refusedAt = trim(L.at);
    out.takenAt = trim(parsed.taken_at);
    out.exportedAt = trim(parsed.exported_at);
    const tRef = stamp(out.refusedAt);
    if (!isFinite(tRef)) {
      out.why = "this held line carries no timestamp of its own, so nothing on this side can say whether "
        + "the read on screen is older or newer than the refusal it would be used to explain. "
        + REFRESH2 + ", and the line will be able to answer.";
      return out;
    }
    /* ① */
    const tTook = stamp(out.takenAt);
    if (!isFinite(tTook) || tTook <= tRef) {
      out.why = "THIS READ IS OLDER THAN THE REFUSAL IT WOULD BE EXPLAINING — it was taken "
        + hm(out.takenAt) + " and Wings Ahead answered this line " + hm(out.refusedAt)
        + ". A payload that entered this tab before the refusal was recorded cannot say what stands "
        + "on that record now: it was read when the row was still where this store left it. "
        + REFRESH2 + ".";
      return out;
    }
    /* ② */
    const seen = arr(parsed.auditTail).some((a) => isObj(a) && trim(a.rid) === trim(L.rid)
      && trim(a.verdict) === trim(L.verdict) && trim(L.verdict));
    if (seen) {
      out.fresh = true;
      out.how = "audit";
      return out;
    }
    /* ③ */
    const tExp = stamp(out.exportedAt);
    if (isFinite(tExp) && tExp > tRef) {
      out.fresh = true;
      out.how = "clock";
      return out;
    }
    out.why = "THIS READ WAS GENERATED BEFORE THE REFUSAL IT WOULD BE EXPLAINING — Wings Ahead stamped "
      + "it " + hm(out.exportedAt) + " and answered this line " + hm(out.refusedAt) + ". Loading an old "
      + "export now does not make it a new one. " + REFRESH2 + ".";
    return out;
  }

  function missingLook(L, parsed, ledger) {
    const out = { have: false, person: false, record: false, rows: [], free: [], adopt: null, why: "",
      /* P45-FDMSc — the freshness verdict, carried OUT of this function rather
         than re-derived by every caller: `recreate` is the ONLY thing heldActs
         and startHold ask before they arm the act that can write a second row,
         so there is exactly one place where the answer is decided. */
      fresh: false, how: "", stale: "", recreate: false };
    if (!isObj(L)) { out.why = "that row identity is no longer in the ledger."; return out; }
    if (!isObj(parsed) || !arr(parsed.people).length) {
      out.why = "no read of Wings Ahead is in memory on this tab. Nothing can be settled from the ledger "
        + "alone: whether the row was deleted or merely moved is a fact about the OTHER side, and this "
        + "pane deliberately holds no background copy of it — this pane's own " + REFRESH2 + ".";
      return out;
    }
    out.have = true;
    const age = readFresh(L, parsed);
    out.fresh = age.fresh;
    out.how = age.how;
    out.stale = age.fresh ? "" : age.why;
    const oid = normOid(L.oid);
    const p = arr(parsed.people).find((x) => isObj(x) && normOid(x.external_oid || x.oid) === oid) || null;
    if (!p) {
      out.why = "the read on screen carries no person with the roster object id " + oid + " — either it "
        + "is a read of a different Wings Ahead, or the student is gone from that roster.";
      return out;
    }
    out.person = true;
    const rec = arr(parsed.records).find((r) => isObj(r) && trim(r.student_id) === trim(p.id)) || null;
    if (!rec) {
      out.why = "that person carries no record in this read of Wings Ahead, so there is no section to "
        + "look in.";
      return out;
    }
    out.record = true;
    const sec = trim(L.group);
    const data = isObj(rec.data) ? rec.data : {};
    const sortie = up(codeOfNode(nodeOfUid(trim(L.uid)))) || up(isObj(L.sent) ? L.sent.sortie : "");
    /* every handle another identity of this ledger already answers for */
    const claimed = new Map();
    arr(ledger).forEach((X) => {
      if (!isObj(X) || trim(X.rid) === trim(L.rid) || !isObj(X.sent)) return;
      if (normOid(X.oid) !== oid || trim(X.group) !== sec) return;
      claimed.set(rowHandle(X.sent), trim(X.rid));
    });
    arr(data[sec]).forEach((e) => {
      if (!isObj(e) || trim(e.entered_by) !== "fdms") return;
      if (up(e.sortie) !== sortie) return;
      const row = adoptRowOf(e);
      const h = rowHandle(row);
      out.rows.push({ row, handle: h, claimed: claimed.get(h) || "" });
    });
    out.free = out.rows.filter((x) => !x.claimed);
    if (out.free.length === 1) {
      out.adopt = out.free[0];
      /* ⇄ ADOPT IS **NOT** GATED ON FRESHNESS, AND THE JUDGEMENT IS RECORDED
         RATHER THAN ASSUMED (P45-FDMSc). The two acts differ in what they write
         and therefore in what a stale read can cost:
           ⊕ Re-create arms a CREATE — a new row on the record, with no claim
             about what stands there. On a stale read that is a DUPLICATE, and
             the orphan is outside the ledger and unreachable by ↺ Undo. It is
             gated.
           ⇄ Adopt writes THIS STORE'S LEDGER AND NOTHING ELSE — no call, no
             row created, moved or removed. What it can get wrong is WHERE it
             thinks the row stands, and the next push then carries a `prev` that
             describes a row that is not there: Wings Ahead compares `prev` fact
             by fact and answers `missing` (nothing written — this same hold
             again) or `exists_fdms` (nothing written — a named conflict). The
             worst outcome of adopting on a stale read is ANOTHER REFUSAL, never
             a second row and never a write over somebody else's flight; and the
             one genuinely bad adoption — onto a row another identity of this
             ledger answers for — is refused by the `claimed` test above, which
             reads the LIVE ledger and not the payload.
         So it keeps its button and gains an honest warning. Withholding it
         would leave a stale read with no repair at all for the ordinary MOVED
         case and would push the developer onto ✕ Stop tracking, which is the
         act that actually makes a second row (§ startHold · forget). */
      out.why = "one row the bridge wrote is standing on that record for " + sortie + ", at "
        + out.adopt.handle + " — this is the MOVED case: the admin edited the date and the handle moved "
        + "with the row. Adopting it re-anchors this identity to where the row now stands. Nothing is "
        + "written to Wings Ahead by adopting."
        + (out.fresh ? "" : "  ⚠ " + out.stale + " Adopting on a read this old cannot make a second row — "
          + "the worst it can do is claim the wrong handle, and Wings Ahead refuses a `prev` it does not "
          + "recognise without writing anything — but it is a guess until the read is refreshed.");
    } else if (!out.rows.length) {
      /* ── THE SENTENCE THAT WALKED THE DEVELOPER INTO THE DUPLICATE ────────
         «the read confirms the DELETED case» is a STATEMENT OF FACT and it was
         made from whatever read happened to be in memory. It is now made only
         when the read has been shown to postdate the refusal; otherwise the
         line says what it actually knows, which is nothing yet. */
      out.recreate = out.fresh;
      out.why = out.fresh
        ? "no row the bridge wrote stands anywhere on that record for " + sortie + " — the read "
          + "confirms the DELETED case" + (out.how === "audit"
            ? " (and it is Wings Ahead's own audit trail that dates it: this read carries the very "
              + "refusal it is explaining, so it was generated after it — one clock, no arithmetic)"
            : " (this read was generated " + hm(age.exportedAt) + " and Wings Ahead answered this line "
              + hm(age.refusedAt) + " — two clocks, so check them if they look wrong)")
          + ". Putting it back is a deliberate re-creation, and it is the only path from here that "
          + "writes a new row."
        : "no row the bridge wrote stands anywhere on that record for " + sortie + " IN THIS READ — and "
          + "this read cannot be trusted to say so. " + out.stale + " A re-creation is NOT offered "
          + "until the read is newer than the refusal: a create against a row the admin merely MOVED is "
          + "exactly the second row this line exists to keep off the record.";
    } else if (!out.free.length) {
      out.why = out.rows.length + " row" + (out.rows.length === 1 ? "" : "s") + " for " + sortie
        + " stand" + (out.rows.length === 1 ? "s" : "") + " on that record and this ledger already "
        + "answers for " + (out.rows.length === 1 ? "it" : "every one of them") + " under another row "
        + "identity — adopting would point two identities at one Wings Ahead row. Settle it by hand.";
    } else {
      out.why = out.free.length + " rows the bridge wrote stand on that record for " + sortie + " ("
        + out.free.map((x) => x.handle).join(" · ") + ") and nothing here says which one this identity "
        + "is. Two candidates is a question for a human, not a tie-break: settle it in Wings Ahead, or "
        + "stop tracking this identity.";
    }
    return out;
  }

  /* ══════════════════════════════════════════════════════════════════════════
     ② THE WRITER — the ONLY place in this file that touches the store
     ══════════════════════════════════════════════════════════════════════════
     Every function below is reached from an explicit [data-brgw] control, past
     the edit lock, past a numbered confirm dialog that has already stated the
     node effect of every line. Each one writes TWO records and never one: the
     training-log event, and the change-log entry that can take it back. */

  const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ESC[c]);
  const S = () => W.SchedStore;
  const R = () => W.SchedReady;
  const ED = () => W.SchedEdit;
  const dmy = (s) => (W.fmtDMY ? W.fmtDMY(s) : String(s == null ? "" : s));
  const todayOf = () => (R() && R().todayISO ? R().todayISO() : new Date().toISOString().slice(0, 10));

  /* WHO WROTE IT. FDMS has ONE owner and ONE edit lock — there is no second
     account to name, and inventing one would be a fiction in an audit trail.
     So «who» is the honest thing: the act was made on this store, with ✎ Editor
     mode on, on the day recorded beside it. The sync then carries the entry to
     the owner's other devices exactly like every other row. */
  const WHO = "✎ Editor";

  /* THE LOCK, ASKED BEFORE THE UI MOVES (the Round 20 layer-2 doctrine): a
     view-only device is told WHICH act it refused and never meets a dialog it
     is not allowed to finish. The seam asks again inside upsert() and remains
     the wall. */
  const editOn = () => { const E = ED(); return !E || E.on(); };
  function refuseWrite(what) {
    const E = ED();
    if (E && E.refuse) return E.refuse(what);
    if (S() && S().toast) S().toast("View-only — unlock ✎ Editor mode to " + what + ".", "bad");
    return false;
  }

  /* THE HANDLE IS MINTED ONCE AND NEVER RE-USED. `bridgeEvId` is deterministic
     so that the same line applied twice UPDATES one event instead of appending
     a second. But the ordinal is a POSITION IN THE ATTEMPT SEQUENCE, and an
     earlier attempt applied later legitimately renumbers the ones behind it —
     so a freshly computed id can land on a handle an earlier write already
     took. Re-using it would merge one flight into another. The identity that
     matters is (student ∷ node ∷ date ∷ seq), which is what pairGroup() reads;
     the id is only the handle, so on a collision the next free one in the same
     family is taken and the fact is recorded in the change log. */
  function freeEvId(oid, group, uid, ord) {
    const want = bridgeEvId(oid, group, uid, ord);
    if (!S().find("trainingLog", want)) return want;
    for (let k = 1; k <= 99; k++) {
      const c = bridgeEvId(oid, group, uid, k);
      if (!S().find("trainingLog", c)) return c;
    }
    return want + ":" + Date.now().toString(36);
  }

  /* one change-log entry — the shape is recorded in specs/bridge-spec.md § 13γ,
     and § 15ε for the two acts the push lane adds.
     PHASE 4/5 — FOUR KEYS MORE, and every one of them exists so ↺ Undo can take
     a WIRE write back the way it takes a local one back (the 13γ law: every
     claim rides INSIDE the entry, or the trail cannot reverse it):
       waHandle  «flights ∷ C4302 ∷ 2026-08-12 ∷ 1» — the far side's own name
                 for the row, printed so a human can find it over there;
       waBefore  the row as Wings Ahead held it before this act (the op's `prev`)
       waAfter   the row this act left standing there (the op's `row`)
       verdict   what the server answered, in its own word.
     `waBefore`/`waAfter` are the compensating op's two halves AND the wire drift
     guard: an undo may only send a `prev` that is still what this entry left. */
  function logAct(o) {
    return S().upsert("bridgeLog", {
      id: "", act: o.act, at: new Date().toISOString(), date: todayOf(), who: WHO,
      rid: o.rid || "", oid: o.oid || "", group: o.group || "", uid: o.uid || "",
      ord: o.ord || 0, seq: o.seq || 1, student: o.student || "", evId: o.evId || "",
      what: o.what || "", fields: arr(o.fields).map((f) => ({ field: f.field, from: f.from, to: f.to })),
      effect: o.effect || "", undone: false, undoneBy: "", undoOf: o.undoOf || "",
      waHandle: o.waHandle || "", waBefore: o.waBefore || null, waAfter: o.waAfter || null,
      verdict: o.verdict || "",
    });
  }

  /* ── THE LEDGER, WRITTEN (design B.5 · the deployed wire's `prev`) ────────
     One row per pushed identity. It goes through upsert() like everything else,
     so it meets the edit lock, it syncs, it exports and it dies with a Reset. */
  const ledgerRow = (rid) => S().find("bridgePush", rid);
  function ledgerPut(o) {
    const rec = { rid: o.rid };
    LED_KEYS.forEach((k) => { if (k !== "rid" && o[k] !== undefined) rec[k] = o[k]; });
    return S().upsert("bridgePush", rec);
  }
  /* the far side's own name for a row — printed, never sent: Wings Ahead finds
     its row by the handle inside `prev`, and this string is for a human. */
  const waHandleOf = (group, row) => (isObj(row)
    ? group + " ∷ " + up(row.sortie) + " ∷ " + isoDate(row.date) + " ∷ " + posInt(row.seq, 1) : group);

  /* every field of a pushed row that MOVED, in the 13γ shape — this is what
     makes the change-log line readable and the undo reversible. */
  function rowFields(before, after) {
    const out = [];
    PUSH_ROW_KEYS.forEach((k) => {
      const a = !isObj(before) || before[k] == null ? "" : before[k];
      const b = !isObj(after) || after[k] == null ? "" : after[k];
      if (String(a) === String(b)) return;
      out.push({ field: "wa." + k, from: a === false ? "false" : a, to: b === false ? "false" : b });
    });
    return out;
  }

  /* the fields a bridge-written event owns, and the values the log says they
     were left at — the check that makes ↺ Undo safe. Undo must revert exactly
     one write; if the developer has edited the event in the Training log since,
     reverting would silently discard THAT work, so it refuses and says so. */
  function driftOf(ev, fields) {
    for (const f of arr(fields)) {
      const now = evFieldOf(ev, f.field);
      if (String(now == null ? "" : now) !== String(f.to == null ? "" : f.to)) {
        return "«" + f.field + "» now reads " + (trim(now) || "(blank)") + " and this entry left it at "
          + (trim(f.to) || "(blank)");
      }
    }
    return "";
  }
  /* A FIELD NAME IS EITHER AN EVENT FIELD OR ONE KEY OF THE PROVENANCE BLOCK.
     `bridge.src.<key>` is addressed the same way as `date` or `result` on
     purpose: the provenance refresh then rides in the SAME `fields` list the
     change log stores, which is what makes ↺ Undo revert it too. A refresh that
     travelled beside the list instead of inside it would be a write the audit
     trail could not take back — and this trail exists to be taken back. */
  const SRC_PREFIX = "bridge.src.";
  function evFieldOf(ev, field) {
    if (field.indexOf(SRC_PREFIX) === 0) {
      const b = bridgeBlockOf(ev);
      const k = field.slice(SRC_PREFIX.length);
      return b && isObj(b.src) ? b.src[k] : null;
    }
    return ev ? ev[field] : null;
  }
  function evSetField(patch, ev, field, value) {
    if (field.indexOf(SRC_PREFIX) === 0) {
      const b = bridgeBlockOf(ev) || {};
      /* read back from the patch under construction, so several src keys in one
         act accumulate instead of each one erasing the last */
      const cur = isObj(patch.bridge) && isObj(patch.bridge.src) ? patch.bridge.src
        : (isObj(b.src) ? b.src : {});
      const src = Object.assign({}, cur);
      src[field.slice(SRC_PREFIX.length)] = value;
      patch.bridge = Object.assign({}, b, isObj(patch.bridge) ? patch.bridge : {}, { src: src });
      return;
    }
    patch[field] = value == null ? "" : value;
    if (field === "result") {
      patch.score = null;                                   // R2 — never a number on a sortie
      if (!(value === "lag" || value === "fail")) patch.maneuvers = "";
    }
  }

  /* ── the three acts ────────────────────────────────────────────────────── */

  /* CREATE — the main fill. Every field the event owns is written, empty ones
     included, because upsert() MERGES: a write that named only what changed
     would leave yesterday's values in the fields it forgot. */
  /* THE EVENT A PLAN BECOMES — pure, so a fixture can assert on the very record
     the store would get instead of on a paraphrase of it. */
  function plannedEvent(p, evId, at) {
    const day = at || todayOf();
    return buildEvent({
      evId: evId || bridgeEvId(p.oid, p.group, p.uid, p.ord),
      rid: [p.oid, p.group, p.uid, p.ord].join(" ∷ "),
      oid: p.oid, group: p.group, uid: p.uid, ord: p.ord, seq: p.seq,
      src: p.src, at: day, who: WHO, exportAt: p.exportAt,
      student: p.student, date: p.date, ip: p.ip, device: p.device, result: p.result,
      maneuvers: "",
      /* THE NOTE SAYS WHERE THE EVENT CAME FROM AND NOTHING THAT CAN GO STALE.
         An earlier draft wrote the verdict and the percentage into it — and the
         first adoption of a corrected grade made it a lie, because update and
         adopt deliberately never rewrite a note (on a hand-typed event the note
         is the developer's own). One fact, one place: the verdict is the
         `result` column, the number and the threshold live in `bridge.src`,
         which every adoption refreshes, and the whole history is in the change
         log. The note is a pointer. */
      note: "from Wings Ahead · bridge " + dmy(day),
    });
  }

  function applyCreate(p) {
    const evId = freeEvId(p.oid, p.group, p.uid, p.ord);
    const rec = plannedEvent(p, evId, todayOf());
    const rid = rec.bridge.rid;
    if (!S().upsert("trainingLog", rec)) return { ok: false, why: "the edit lock refused the write" };
    logAct({
      act: "create", rid, oid: p.oid, group: p.group, uid: p.uid, ord: p.ord, seq: p.seq,
      student: p.student, evId,
      what: "created the training-log event for " + p.uid + " of " + dmy(p.date)
        + (evId === bridgeEvId(p.oid, p.group, p.uid, p.ord) ? ""
          : " (the computed handle was taken — this event took the next free one)"),
      fields: [
        { field: "date", from: "", to: p.date },
        { field: "result", from: "", to: p.result },
        { field: "instructor", from: "", to: p.ip },
        { field: "device", from: "", to: p.device },
      ],
      effect: p.effect,
    });
    return { ok: true, evId };
  }

  /* UPDATE / ADOPT — field-scoped on purpose. The event may have been typed by
     hand in the Training log, and rewriting it whole would take the developer's
     own note and device with it. Only the named fields move, and the change log
     carries the old value of each one. */
  function applyPatch(p) {
    const ev = S().find("trainingLog", p.evId);
    if (!ev) return { ok: false, why: "that FDMS event is no longer in the training log" };
    const patch = { id: p.evId };
    arr(p.fields).forEach((f) => evSetField(patch, ev, f.field, f.to));
    /* an event the bridge wrote keeps its provenance current: the row identity
       (the ordinal can legitimately move) and what Wings Ahead said. The id
       itself is NEVER rewritten — that would orphan the event. */
    /* BOOKKEEPING, NOT FACTS — and the difference is why these three sit here
       and not in `fields`. The row identity is refreshed because an ordinal can
       legitimately move; `applied_at` / `applied_by` record WHEN THE BRIDGE LAST
       TOUCHED this event, and an undo is itself a touch. Nothing here is a claim
       about the flight, so nothing here is undone. Every claim about the flight
       — the event's own fields AND every `bridge.src.*` key — travels in
       `fields`, where ↺ Undo can reach it.
       The id is NEVER rewritten: that would orphan the event. */
    if (isWaWritten(ev)) {
      const b = bridgeBlockOf(ev) || {};
      patch.bridge = Object.assign({}, b, isObj(patch.bridge) ? patch.bridge : {}, {
        rid: [p.oid, p.group, p.uid, p.ord].join(" ∷ "), ord: p.ord, seq: p.seq,
        applied_at: todayOf(), applied_by: WHO, export_at: p.exportAt || b.export_at || "",
      });
    }
    if (!S().upsert("trainingLog", patch)) return { ok: false, why: "the edit lock refused the write" };
    logAct({
      act: "update", rid: p.rid, oid: p.oid, group: p.group, uid: p.uid, ord: p.ord, seq: p.seq,
      student: p.student, evId: p.evId,
      what: (p.act === "update" ? "moved the date of " : "adopted the Wings Ahead value on ") + p.uid,
      fields: p.fields, effect: p.effect,
    });
    return { ok: true, evId: p.evId };
  }

  function applyPlan(p) {
    if (!p || !p.can) return { ok: false, why: (p && p.why) || "this row is not appliable" };
    /* PHASE 3b · FINDING 9 — SEAM ④, THE WRITER'S OWN. The three seams above
       are all inside the ENGINE, which works on the plan it was handed; this
       one asks the LIVE graph, here, at the last moment before the store is
       touched. It is the seam that answers a console: whatever built the plan,
       whatever the report believed, an event is not written for a node
       SchedReady does not have. With no graph loaded it refuses too — a writer
       that cannot ask is a writer that does not write. */
    const band = R() && R().kindOf ? R().kindOf(nodeOfUid(p.uid)) : null;
    if (!band) return { ok: false, why: offGraphWhy(p.uid) };
    try {
      return p.act === "create" ? applyCreate(p) : applyPatch(p);
    } catch (err) {
      console.error(err);
      return { ok: false, why: "the write failed: " + err.message };
    }
  }

  /* ══════════════════════════════════════════════════════════════════════════
     ②β THE WIRE — two POST doors, the credential inside the BODY
     ══════════════════════════════════════════════════════════════════════════
     `…/rest/v1/rpc/bridge_pull` and `…/rest/v1/rpc/bridge_push`, POST only, the
     token in the JSON body and never in a URL — which is what makes the later
     Cloudflare-Worker lift a URL swap and not a contract change (design E.4),
     and what keeps the credential out of every server log, proxy log and browser
     history on the way. A GET on either door is answered by ONE uniform refusal
     whatever it carries, deliberately, so the status code cannot tell a live
     credential from a dead one — this side therefore never issues one.

     THE TOKEN NEVER LEAVES THIS FUNCTION. It is read from the config, put in the
     body, and that is all: it is not logged, not toasted, not put in an error
     message, not printed in the report and not written to any file. Every
     failure below reports the SERVER's own sentence or this side's own words.  */

  const bridgeCfg = () => {
    const c = S() ? S().cfg("bridge", null) : null;
    return isObj(c) ? c : null;
  };
  const bridgeConfigured = () => {
    const c = bridgeCfg();
    return !!(c && trim(c.url) && trim(c.anon) && trim(c.token));
  };
  const bridgeLive = () => { const c = bridgeCfg(); return !!(c && c.live && bridgeConfigured()); };
  const rpcUrl = (c, fn) => trim(c.url).replace(/\/+$/, "") + "/rest/v1/rpc/" + fn;

  /* WHAT WENT WRONG, AS A STATE AND NOT A TOAST (design C.4). Three kinds, and
     the difference decides what the header chip says and whether the automatic
     lane stays armed:
       "revoked"      the credential is gone — auto disarms until it is re-set;
       "unreachable"  the network did not answer — still owed, retried with
                      backoff, never dropped;
       "refused"      the server answered, and said why in its own words.       */
  function wireError(kind, why, more) {
    return Object.assign({ ok: false, kind, why, status: 0, code: "" }, more || {});
  }

  /* ── WHAT A FAILED CALL MEANS FOR THE REST OF THE RUN ─────────────────────
     Before this round every failure was one thing — «the door stopped
     answering» — and the run stopped. That is right for a door that did not
     answer and wrong for every refusal that names something about ONE call, and
     the live proof was brutal: one student Wings Ahead could not resolve
     starved every student behind him, for ever, on a five-minute retry ceiling.
     So the answer is classified, once, here, and the sentence the server sent
     is what classifies it:

       "toobig"    SQLSTATE 57014 — the `anon` role's 3 s statement_timeout
                   killed the call. NOTHING was written (the transaction rolled
                   back), so the fix is arithmetic: halve the chunk and send the
                   same operations again, down to a floor of one.
       "student"   an ENVELOPE raise naming `student_oid` — an unknown, inactive
                   or duplicated roster object id. It voids THIS student's call
                   and says nothing whatever about the next student's.
       "revoked"   the credential is dead: every lane is closed, so stopping is
                   the only honest answer (and the automatic lane disarms).
       "stop"      everything else that ANSWERED — an envelope refusal about the
                   ops array (this side's own bug, which would repeat identically
                   for every bucket), a 5xx we cannot attribute to a person, a
                   verdict count that does not line up. An unattributable server
                   fault may well be global — a deploy, a full disk — and
                   spraying it across thirty students would turn one failure into
                   thirty log lines and thirty wasted calls.
       "stop"      also every TRANSPORT failure: the original comment («a door
                   that did not answer will not answer the next chunk either»)
                   is exactly right for that case, and only for that case. */
  function wireFailKind(r) {
    if (!r || r.ok) return "";
    if (r.kind === "revoked") return "revoked";
    if (r.kind === "unreachable" || r.kind === "unconfigured") return "stop";
    if (trim(r.code) === "57014" || /statement timeout|canceling statement/i.test(trim(r.why))) {
      return "toobig";
    }
    /* wa.chk() spells its own location in the parentheses it closes with:
       «WA: invalid payload — … (student_oid)». That is the envelope raise for a
       person, and it is the only refusal in the contract that is about one. */
    if (/\(student_oid\)/.test(trim(r.why))) return "student";
    return "stop";
  }

  /* ── THE CALL IS BOUNDED IN TIME (P45-FDMSc, the verify's pre-existing minor)
     ═════════════════════════════════════════════════════════════════════════
     THE FINDING. There was no client-side timeout at all. A peer that accepts
     the connection and then never answers — a half-open socket, a proxy that
     swallowed the request, a laptop lid closed mid-call — left the chip at
     «✈ WA · pushing…» FOR EVER: `fetch` has no default deadline, `wst.busy`
     stayed true, the backoff never re-armed, and the verifier had to kill his
     proxy outright before the promise settled. Nothing was lost (the queue is
     derived) but nothing said so either, and a lane whose whole doctrine is
     «a failure is a STATE, not a silence» had one silence left in it.

     THE NUMBER, AND WHAT IT IS MEASURED AGAINST. The far side gives its own
     statement THREE SECONDS and kills it (`statement_timeout` on the role the
     anon key authenticates as — the same 3 s that sizes PUSH_CHUNK). So no
     honest answer can still be COMPUTED after 3 s; everything past that is
     transport. 20 000 ms is that budget nearly seven times over, and it leaves
     ~17 s of pure transfer — enough to carry the biggest answer this lane has
     (a ~1.5 MB `bridge_pull` body) over a link as slow as 0.7 Mbit/s. A call
     that has not answered inside it is not working, it is gone.

     WHY ABANDONING A PUSH IS SAFE, said once so it is not taken on faith: the
     ledger advances ONLY on an answer, so an abandoned call leaves the identity
     exactly as it was and the next run sends the IDENTICAL operation, which the
     server absorbs as `unchanged` (proven live, md5-identical bodies). The one
     thing that must never happen — a second row — cannot: the retry carries the
     same `prev`, not a create.

     AND IT FOLDS INTO THE STATE THAT ALREADY EXISTS. `unreachable`, with its
     own sentence: the run stops, the chip says «not pushed — unreachable since
     HH:MM», the backoff re-arms, and what is owed stays owed. */
  const WIRE_MS = 20000;

  /* ── THE SIZE AT WHICH A REMOVAL STOPS BEING A CORRECTION (P45-FDMSd) ──────
     Above this many acts in ONE ␥ confirm, the dialog asks for the count to be
     typed back (§ startRemovals argues the whole judgement; this is only where
     the number lives, so a fixture can read it and a round cannot move it
     quietly). TEN, and the line is drawn by what the two sides of it actually
     are. Below it a removal list is a day's corrections — a deleted duplicate,
     a re-typed sortie, an undo or two — and the numbered dialog already prints
     every one of them with the fact that owes it, which is a list a person
     reads. Above it, it is a PURGE: 148 rows on somebody else's database, and
     the one thing that went wrong in finding A is that the number was not taken
     in. A gate that fires on the ordinary case teaches people to type through
     it, so it does not fire there. */
  const RM_TYPE_AT = 10;

  /* AND THE SOCKET IS NOT ABORTED — a judgement, not an omission. The obvious
     shape is an `AbortController`, and it was written that way first; the
     offline builder's quality gate refused it BY NAME («AbortController (Fx57)
     — no shim, Firefox 32 breaks») and the refusal is right. The export's floor
     is Firefox 32 and that gate exists so a floor browser meets a working page,
     not a feature-detected branch that quietly does less. What the abort buys
     is a released socket; what it costs is an API below the floor in the one
     file that must survive being inlined into that export. THE DEADLINE IS THE
     FIX — the wait is bounded and the state is named — and the abandoned call
     is bounded too: the lane sends ONE call at a time (`wst.busy`), the backoff
     between retries is 10 s → 5 min, and the browser's own connection timeout
     ends the socket without anybody's help. Its answer, whenever it comes, is
     read by nobody.

     AND THE LOSER OF THE RACE CANNOT SURFACE AS AN UNHANDLED REJECTION: the
     fetch promise is settled into a VALUE by the two-armed `.then(ok, err)`
     below before it ever enters the race. An unhandled rejection is a console
     error, and this pane ships zero of those. */
  function wireRace(p, ms) {
    let t = null;
    const timer = new Promise((resolve) => {
      t = W.setTimeout(() => resolve({ late: true }), ms);
    });
    return Promise.race([p, timer]).then((v) => {
      if (t !== null) { W.clearTimeout(t); t = null; }
      return v;
    });
  }

  async function wireCall(fn, body) {
    const c = bridgeCfg();
    if (!bridgeConfigured()) {
      return wireError("unconfigured", "the Wings Ahead bridge is not configured on this device — "
        + "open Bridge → ⚙ and paste the project URL, the anon key and the bridge token");
    }
    const opts = {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: trim(c.anon),
        Authorization: "Bearer " + trim(c.anon), Accept: "application/json" },
      body: JSON.stringify(Object.assign({ p_token: trim(c.token) }, body || {})),
    };
    let res = null;
    try {
      /* the two-armed settle: a rejection becomes a VALUE, so the loser of the
         race can never surface as an unhandled promise rejection */
      const call = W.fetch(rpcUrl(c, fn), opts).then(
        (r) => ({ res: r }), (err) => ({ err }));
      const won = await wireRace(call, WIRE_MS);
      if (won.late) {
        return wireError("unreachable", "Wings Ahead accepted the connection and then did not answer "
          + "within " + Math.round(WIRE_MS / 1000) + " seconds — and its own statement budget is three, "
          + "so this is not a slow answer, it is no answer. The call was given up on. Nothing was sent "
          + "twice and nothing is lost: what is owed is still owed, and the identical operation goes "
          + "again on the next push.");
      }
      if (won.err) throw won.err;
      res = won.res;
    } catch (err) {
      return wireError("unreachable", "Wings Ahead did not answer — " + (err && err.message ? err.message : "the request failed")
        + ". Nothing was sent twice and nothing is lost: what is owed is still owed.");
    }
    let data = null, text = "";
    try { text = await res.text(); } catch (e) { text = ""; }
    try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
    if (!res.ok) {
      const msg = trim(data && (data.message || data.error_description || data.error))
        || ("HTTP " + res.status);
      /* PostgREST hands the SQLSTATE back in `code`, and that is what tells a
         statement timeout (57014) from a refusal — the HTTP status does not:
         this stack answered 500 for the timeout, and other builds answer 504. */
      const more = { status: res.status, code: trim(data && data.code) };
      /* the house refusal sentence of wa.auth_bridge, recognised by its own
         words rather than by a status code — the door answers 400 for every
         credential state on purpose. */
      if (/invalid or revoked/i.test(msg) || res.status === 401) {
        return wireError("revoked", msg + " — the automatic lane is disarmed until a working token is set "
          + "in Bridge → ⚙.", more);
      }
      return wireError("refused", msg, more);
    }
    return { ok: true, data };
  }

  /* ── THE PULL — the export-equivalent read, byte-for-byte a wa-export-v1 ── */
  async function wirePull() {
    const r = await wireCall("bridge_pull", {});
    if (!r.ok) return r;
    const p = parseExport(r.data);
    if (!p.ok) {
      return wireError("refused", "Wings Ahead answered, but not with an export this side can read — " + p.why);
    }
    return { ok: true, parsed: p };
  }

  /* ── THE PUSH — ONE STUDENT, ORDERED, CHUNKED AT 200 ─────────────────────
     The whole safety property of this lane is in three lines of it: the ops of
     one rid are built from the LAST ACKNOWLEDGED ledger row, exactly one op per
     rid per run, and the ledger advances only on the answer. So a retry is
     always the identical operation (absorbed as `unchanged`), and a second
     change can never be sent with the first change's `prev`. */
  async function wirePush(oid, ops, lines, entries) {
    const r = await wireCall("bridge_push", { p_student_oid: oid, p_ops: ops });
    if (!r.ok) return r;
    const d = isObj(r.data) ? r.data : {};
    const vs = arr(d.verdicts);
    if (vs.length !== ops.length) {
      /* an answer that does not line up with the question is not folded on a
         guess: the ledger stays exactly where it was, and the whole call is a
         report line. Nothing was lost — the same ops are still owed. */
      return wireError("refused", "Wings Ahead answered " + vs.length + " verdict"
        + (vs.length === 1 ? "" : "s") + " for " + ops.length + " operation"
        + (ops.length === 1 ? "" : "s") + " — nothing is folded on a guess and the ledger is untouched.");
    }
    return { ok: true, verdicts: vs, last_update: trim(d.last_update),
      fdms_entries: d.fdms_entries, entries_total: d.entries_total, entries, lines };
  }

  /* FOLD ONE ANSWER INTO THE TWO LEDGERS — the push ledger (what the wire now
     believes) and the change log (what a human can read and take back). */
  function foldOne(entry, v) {
    const f = foldVerdict(v, entry);
    const op = entry.op;
    const isRemove = op.op === "remove";
    f.unrecorded = !ledgerPut({
      rid: f.rid, oid: f.oid, group: f.group, uid: f.uid, ord: f.ord, seq: f.seq,
      evId: f.evId, student: f.student, sent: f.sent, state: f.state, hold: f.hold,
      note: f.note || f.say, verdict: f.verdict, reason: f.reason,
      clearTomb: f.clearTomb, at: f.at, waRow: f.waRow,
    });
    /* ONLY A WRITE THAT HAPPENED IS A CHANGE-LOG ACT. A refusal, a conflict and
       a replay changed nothing on either side; they are report lines, and
       putting them in a trail whose whole purpose is «↺ take this back» would
       offer an undo for a write that never was. */
    const wrote = ["created", "moved", "updated", "removed"].indexOf(f.verdict) >= 0;
    if (!wrote) return f;
    const before = isObj(op.prev) ? op.prev : null;
    const after = isRemove ? null : (isObj(op.row) ? op.row : null);
    logAct({
      act: isRemove ? "push-remove" : "push",
      rid: f.rid, oid: f.oid, group: f.group, uid: f.uid, ord: f.ord, seq: f.seq,
      student: f.student, evId: f.evId,
      what: (isRemove ? "removed " : "pushed ") + up((after || before || {}).sortie)
        + " of " + dmy((after || before || {}).date) + " " + (isRemove ? "from" : "to")
        + " Wings Ahead — " + f.verdict
        + (isRemove && trim(op.reason) ? " (" + trim(op.reason) + ")" : ""),
      fields: rowFields(before, after),
      effect: f.say,
      waHandle: waHandleOf(f.group, after || before),
      waBefore: before, waAfter: after, verdict: f.verdict,
    });
    return f;
  }

  /* the change-log acts that touched neither side — only the ledger's memory */
  const LEDGER_ONLY_ACTS = ["push-forget", "push-adopt", "push-recreate"];

  /* ── ↺ UNDO — ruling #2's rollback, one entry at a time ────────────────── */
  function undoEntry(id) {
    const e = S().find("bridgeLog", id);
    if (!e) return { ok: false, why: "that change-log entry is gone" };
    if (e.undone) return { ok: false, why: "that entry has already been undone" };
    if (e.act === "undo") {
      return { ok: false, why: "an undo is not itself undone from here — the row is back in the report, "
        + "and applying it again is the deliberate act that re-does it" };
    }
    /* ── THE ACTS THAT CHANGED ONLY WHAT THIS STORE REMEMBERS ────────────────
       ✕ Stop tracking, ⇄ Adopt and ⊕ Re-create write the push ledger and
       nothing else: no training-log event, no Wings Ahead row. There is no
       write to take back, and the generic path below would be worse than
       useless — it reverts by FIELD NAME, and these entries carry `wa.*` field
       names, so it would write keys like «wa.date» onto an FDMS event. They are
       recorded so the trail is complete and they are settled forward, by
       reading Wings Ahead again. */
    if (LEDGER_ONLY_ACTS.indexOf(trim(e.act)) >= 0) {
      return { ok: false, why: "that act wrote nothing to Wings Ahead and nothing in the training log — "
        + "it only changed what this store REMEMBERS about a row. There is nothing to take back: read "
        + "Wings Ahead again and settle the identity from what is standing there." };
    }
    /* ── PHASE 4/5 — UNDOING A WRITE THAT HAPPENED ON THE OTHER SIDE ──────
       The 13γ rule «an undo never offers its own ↺» and the drift guard are the
       same here; what changes is where the compensation lands. NOTHING crosses
       the wire from inside this function: an undo of a push turns into a
       PENDING op that the developer confirms in the numbered dialog, exactly as
       every other write to Wings Ahead does. */
    if (e.act === "push" || e.act === "push-remove") return undoPushEntry(e);
    const ev = S().find("trainingLog", e.evId);
    if (e.act === "create") {
      if (ev) {
        const drift = driftOf(ev, e.fields);
        if (drift) {
          return { ok: false, why: "this event changed after the bridge wrote it — " + drift
            + ". Undo would discard that change, so it refuses: open the event in the Training log instead." };
        }
        if (!S().remove("trainingLog", e.evId)) return { ok: false, why: "the edit lock refused the write" };
      }
      const rev = logAct({
        act: "undo", rid: e.rid, oid: e.oid, group: e.group, uid: e.uid, ord: e.ord, seq: e.seq,
        student: e.student, evId: e.evId, undoOf: e.id,
        what: ev ? "removed the training-log event this entry created"
          : "the event was already gone from the training log — nothing to remove",
        fields: arr(e.fields).map((f) => ({ field: f.field, from: f.to, to: "" })),
        effect: "the node returns to what it was before that line",
      });
      S().upsert("bridgeLog", { id: e.id, undone: true, undoneBy: rev ? rev.id : "" });
      return { ok: true, removed: !!ev };
    }
    /* an UPDATE goes back field by field, and only if every field still holds
       what this entry left it holding */
    if (!ev) return { ok: false, why: "that FDMS event is no longer in the training log" };
    const drift = driftOf(ev, e.fields);
    if (drift) {
      return { ok: false, why: "this event changed after that write — " + drift
        + ". Undo would discard that change, so it refuses: open the event in the Training log instead." };
    }
    const patch = { id: e.evId };
    arr(e.fields).forEach((f) => evSetField(patch, ev, f.field, f.from));
    if (!S().upsert("trainingLog", patch)) return { ok: false, why: "the edit lock refused the write" };
    const rev = logAct({
      act: "undo", rid: e.rid, oid: e.oid, group: e.group, uid: e.uid, ord: e.ord, seq: e.seq,
      student: e.student, evId: e.evId, undoOf: e.id,
      what: "put back what that line changed",
      fields: arr(e.fields).map((f) => ({ field: f.field, from: f.to, to: f.from })),
      effect: "the node returns to what it was before that line",
    });
    S().upsert("bridgeLog", { id: e.id, undone: true, undoneBy: rev ? rev.id : "" });
    return { ok: true, removed: false };
  }

  /* ── ↺ UNDO ACROSS THE WIRE (design D.2) ─────────────────────────────────
     Three shapes, and each one is the honest compensation for what was done:

       an undo of a CREATED push  → the identity owes a REMOVAL (reason «undo»)
           and a tombstone. The removal is what makes the undo STICK: without it
           the very next planner run would owe the same create again, one
           debounce later, for ever. It is not sent from here — it lands in
           Pending removals and crosses on the developer's confirm, because a
           deletion is never accidental on the wire either.

       an undo of a MOVED / UPDATED push → a compensating upsert restoring what
           the row held before, whose `prev` is exactly what this entry LEFT the
           row at. Guarded twice: HERE, against this store's own ledger (has a
           later push already moved it?), and again on the server, which
           compares `prev` fact for fact and answers `exists_fdms` if a human
           has touched the row since — nothing written, a report line.
           The identity is then HELD, and that is not tidiness: the FDMS event
           still says the new value, so an unheld identity would be re-pushed
           immediately and the undo would not stick.

       an undo of a PUSH-REMOVE → the identity goes back to PENDING, carrying
           `clear_tombstone`. Re-pushing it is the explicit act, through the
           dialog — 13γ's «an undo never offers its own ↺», applied to the wire.

     WHAT IT NEVER DOES is touch the FDMS training log: the push lane wrote
     nothing there, so its undo has nothing there to take back. */
  /* THE DECISION, PURE (so a fixture asserts on the very ledger patch the store
     would get, and on the very refusal sentence the developer would read).
     `undoPushEntry` below is the thin half that writes. */
  function undoPushPlan(e, L) {
    if (!isObj(L)) {
      return { ok: false, why: "the push ledger no longer carries the row identity " + trim(e.rid)
        + " — without it this side does not know which Wings Ahead row this act left standing, and an "
        + "undo that guesses is worse than no undo" };
    }
    if (e.act === "push-remove") {
      return { ok: true, pending: "repush",
        ledger: { rid: e.rid, state: "", sent: null, hold: "reopened", clearTomb: true,
          note: "the removal was taken back — this identity is pending again, and bringing the row back "
            + "is a deliberate re-push that clears the tombstone Wings Ahead is holding", verdict: "" },
        what: "took back the removal of " + up((e.waBefore || {}).sortie) + " — the identity is pending again",
        effect: "nothing crossed: re-pushing it is the explicit act that clears the tombstone",
        fields: rowFields(null, e.waBefore) };
    }

    /* THE WIRE DRIFT GUARD, THIS SIDE. `driftOf` asks «does the FDMS event still
       hold what this entry left it holding?»; the wire's own version asks the
       same question of the LEDGER — «is the Wings Ahead row still the one this
       act left standing?» — and refuses if a later push has moved it, because
       undoing an act that is no longer the last one would take back somebody
       else's write. The SERVER then asks it a third time, of the row itself:
       `prev` is compared fact for fact, and a row a human has touched since
       answers exists_student / exists_admin and nothing is written. */
    const drifted = !sameWaRow(isObj(L.sent) ? L.sent : {}, e.waAfter || {});

    if (trim(e.verdict) === "created") {
      if (trim(L.state) === "removed") {
        return { ok: false, why: "that Wings Ahead row is already gone — the removal has landed and a "
          + "tombstone lies on the identity" };
      }
      if (drifted) {
        return { ok: false, why: "the Wings Ahead row changed after that push — this store has since "
          + "pushed it again, so undoing THIS act would remove a row it did not create. Undo the later "
          + "act first" };
      }
      return { ok: true, pending: "removal",
        ledger: { rid: e.rid, state: "undone", hold: "",
          note: "the developer took this push back — the removal is waiting in Pending removals" },
        what: "took back the push of " + up((e.waAfter || {}).sortie) + " of "
          + dmy((e.waAfter || {}).date) + " — the removal is now pending",
        effect: "nothing has crossed yet: the removal is confirmed on the Bridge tab, and it tombstones "
          + "the identity so the queue cannot re-create it",
        fields: rowFields(e.waAfter, null) };
    }

    if (!isObj(e.waBefore)) {
      return { ok: false, why: "this entry did not record the row Wings Ahead held before it, so there is "
        + "nothing to restore it to" };
    }
    if (drifted) {
      return { ok: false, why: "the Wings Ahead row changed after that push — this store has pushed it "
        + "again since, and undoing THIS act would discard the later one. Undo the later act first, or "
        + "settle it from the cross-check report, where the two versions meet" };
    }
    return { ok: true, pending: "compensate",
      ledger: { rid: e.rid, state: "pushed", hold: "compensate",
        note: "↺ an undo is waiting to put this Wings Ahead row back to what it was before the push of "
          + dmy(e.date) + " — it is confirmed on the Bridge tab, and until then the queue leaves the "
          + "identity alone" },
      what: "queued the undo of " + up((e.waAfter || {}).sortie) + " — Wings Ahead goes back to "
        + dmy((e.waBefore || {}).date),
      effect: "nothing has crossed yet: the compensating write is confirmed on the Bridge tab, and Wings "
        + "Ahead refuses it outright if a human has touched the row since",
      fields: rowFields(e.waAfter, e.waBefore) };
  }

  function undoPushEntry(e) {
    const r = undoPushPlan(e, ledgerRow(e.rid));
    if (!r.ok) return r;
    ledgerPut(Object.assign({ at: new Date().toISOString() }, r.ledger));
    const rev = logAct({
      act: "undo", rid: e.rid, oid: e.oid, group: e.group, uid: e.uid, ord: e.ord, seq: e.seq,
      student: e.student, evId: e.evId, undoOf: e.id, what: r.what, effect: r.effect,
      fields: arr(r.fields), waHandle: e.waHandle, waBefore: e.waAfter, waAfter: e.waBefore,
    });
    S().upsert("bridgeLog", { id: e.id, undone: true, undoneBy: rev ? rev.id : "" });
    return { ok: true, pending: r.pending };
  }

  /* the compensating op a held «compensate» identity owes — built from the LOG,
     because the log is what recorded the two halves; the ledger only says the
     row is still where that act left it. */
  function compensationOf(L) {
    const list = arr(S().get("bridgeLog")).filter((x) => isObj(x) && trim(x.rid) === trim(L.rid)
      && x.act === "undo" && isObj(x.waAfter) && isObj(x.waBefore));
    if (!list.length) return null;
    list.sort((a, b) => (String(a.at) < String(b.at) ? 1 : String(a.at) > String(b.at) ? -1 : 0));
    const u = list[0];
    /* `waAfter` of the UNDO entry is the row we are putting BACK; its `waBefore`
       is what stands there now — and that is precisely the `prev` the server
       demands: the row as the bridge last wrote it, fact for fact. */
    return { line: { rid: trim(L.rid), oid: normOid(L.oid), group: trim(L.group), uid: trim(L.uid),
      ord: posInt(L.ord, 1), seq: posInt(L.seq, 1), evId: trim(L.evId), student: trim(L.student),
      who: trim(L.student), date: isoDate(u.waAfter.date), row: u.waAfter, sent: u.waBefore, klass: "" },
    op: { op: "upsert", section: trim(L.group), rid: trim(L.rid), prev: u.waBefore, row: u.waAfter,
      clear_tombstone: false } };
  }

  /* ══════════════════════════════════════════════════════════════════════════
     ③ THE PANE — DOM only, and every write it starts goes through § ②
     ══════════════════════════════════════════════════════════════════════════ */

  /* the whole pane's state. `report`, `parsed` and `fileName` live HERE and
     nowhere else — no localStorage, no store, no sync, no download (ruling #7).
     PHASE 3 keeps the PARSED EXPORT in memory beside the report, and it has to:
     after a line is applied the report must be RE-JUDGED against the store it
     just changed, so the row moves to `agree` in front of the developer instead
     of being taken on trust. It is the same class of data as the report, it
     lives exactly as long, and § schBridgeLeave drops both together. */
  const ui = { report: null, parsed: null, fileName: "", error: "", filter: "",
    cls: "", group: "", q: "", pick: [], logOpen: false, applyMsg: "", applyBad: false,
    /* PHASE 4/5 — the push lane's own pane state. `src` is the SOURCE PICKER
       («📄 file» / «⟳ Wings Ahead live»): the payload is the same wa-export-v1
       whichever carrier brings it, and everything downstream of parseExport is
       Phase 3 verbatim. `plan` is the DERIVED queue, recomputed on every paint —
       it is never stored, here or anywhere. */
    src: "file", plan: null, pushMsg: "", pushBad: false, verdicts: [],
    pulling: false, holdOpen: false, blockOpen: false };

  /* THE WIRE'S STATE — a failure is a STATE, not a toast (design C.4). It lives
     here, beside the report, and the header chip reads it: `owed` cannot be
     silently dropped because it is recomputed from the store on every planner
     run, so «3 not pushed» stays true until it is not. */
  const wst = { busy: false, at: "", kind: "", why: "", since: "", tries: 0, timer: null, back: 0,
    /* the chunk this session is actually sending. It starts at PUSH_CHUNK and
       only ever SHRINKS, when the far side says a call was too big to finish in
       its three seconds — never grows back on its own, because growing back is
       how a lane rediscovers the same wall on every run. A reload starts from
       the default again, which is the honest default for a different store. */
    chunk: PUSH_CHUNK };
  const AUTO_MS = 5000;                 // the debounce SchedSync already lives by
  const BACKOFF_MS = [10000, 30000, 60000, 180000, 300000];   // → a 5-minute ceiling

  function clearAll() {
    ui.report = null; ui.parsed = null; ui.fileName = ""; ui.error = "";
    ui.cls = ""; ui.group = ""; ui.q = ""; ui.pick = [];
    ui.applyMsg = ""; ui.applyBad = false; ui.logOpen = false;
    ui.pushMsg = ""; ui.pushBad = false; ui.verdicts = [];
  }

  /* ── THE DERIVED QUEUE, RECOMPUTED ───────────────────────────────────────
     Nothing is cached across a paint: what this store owes Wings Ahead is a
     function of the training log, the ledger and the tombstones, and asking it
     again is cheaper than being wrong about it. */
  function planNow() {
    if (!S()) return null;
    try {
      return planPush({
        trainingLog: S().get("trainingLog") || [],
        students: S().get("students") || [],
        instructors: S().get("instructors") || [],
        bridgePush: S().get("bridgePush") || [],
      }, {
        kindOf: (uid) => (R() ? R().kindOf(uid) : null),
        /* the pull's own knowledge, when a pull is on screen — the two refusals
           the server raises at the ENVELOPE (unknown OID, inactive student) are
           made HERE when this side can make them, because an envelope raise
           voids that student's whole call. */
        waPeople: ui.parsed ? ui.parsed.people : null,
        tombstones: ui.parsed ? ui.parsed.tombstones : null,
      });
    } catch (err) { console.error(err); return null; }
  }
  const plan = () => (ui.plan = planNow());

  /* THE HOVER RULE (Round 19) — a tooltip inside the Scheduler means «something
     is stored here». Every control below writes; each says WHAT it writes, WHAT
     it never touches, and THE SAFE PATH out. The read-only controls of this
     pane stay deliberately silent, which is the other half of the rule. */
  const TIP = {
    apply: "Writes ONE training-log event for this line, after a dialog that lists it and says what it "
      + "does to the syllabus node. It touches nothing in Wings Ahead and nothing in the repository. "
      + "The act is appended to the Bridge change log below, where ↺ Undo takes back exactly this write.",
    adopt: "Writes the Wings Ahead value of THIS FIELD onto the FDMS event, and nothing else on it — the "
      + "note, the device and every other field stay as they are. Wings Ahead is not touched. The old "
      + "value is kept in the Bridge change log, where ↺ Undo puts it back.",
    move: "Moves the DATE of the existing FDMS event to the Wings Ahead date. It creates no second event — "
      + "that is the whole point of a row identity without a date in it — and changes no verdict. "
      + "The old date is kept in the change log, where ↺ Undo restores it.",
    pick: "Selects this line for «✔ Apply selected». Selecting writes nothing at all: the dialog that "
      + "follows lists every selected line, numbered, with what each one does to its node.",
    batch: "Opens the confirm dialog for every SELECTED line — numbered, one entry each, with the node "
      + "effect spelled out — and writes them into the training log only after you confirm. Wings Ahead "
      + "and the repository are never touched. Every line lands in the change log with its own ↺ Undo.",
    undo: "Reverts EXACTLY this one act: the event it created is removed, or the fields it changed go back "
      + "to the values recorded here. If the event has been edited since, it refuses instead of discarding "
      + "that edit. On a PUSH act it writes nothing at once — it puts a removal or a compensating write "
      + "into Pending removals, which you confirm. The undo is itself recorded as a change-log entry.",
    /* PHASE 4/5 — the hover rule (Round 19) applied to the controls that write
       the OTHER side: WHAT it writes · WHAT it never touches · THE SAFE PATH. */
    push: "Sends the queued flights to Wings Ahead, after a dialog that numbers every one and shows the "
      + "exact row it becomes. It writes ONLY the flight / F-S rows this bridge itself owns, and only for "
      + "students matched by OID. It never writes a grade, a duration or an NG flag, never a ground "
      + "section, never a row a human typed, and never deletes anything. Every write lands in the Bridge "
      + "change log, where ↺ Undo takes exactly that one back.",
    rm: "Removes the Wings Ahead row this bridge wrote and lays a TOMBSTONE on the identity, so the queue "
      + "cannot re-create it. It touches nothing in the FDMS training log and nothing a student typed — a "
      + "corrected row is his, and Wings Ahead refuses this lane over it. ↺ Undo puts the identity back in "
      + "the pending state; bringing the row back is then a deliberate re-push.",
    rmall: "Sends EVERY pending act in the table below, in one go — each one destroys a flight row on a "
      + "student's Wings Ahead record and tombstones its identity. The numbered dialog lists them with the "
      + "fact that owes each one, and above " + RM_TYPE_AT + " acts it asks you to type the count back "
      + "before it sends. Nothing in the FDMS training log is touched, and ↺ Undo reaches every act.",
    cfg: "Opens the bridge credential and the Live switch. Saving WRITES the synced store config, so the "
      + "token reaches your other devices — ciphertext when the sync passphrase is armed. ⭳ Export strips "
      + "it and ⭱ Import never restores it. It is never shown back to you: «Forget» is how it is removed, "
      + "and Revoke in Wings Ahead is how every lane is closed at once.",
    repush: "Puts this identity back in the queue CARRYING clear_tombstone, so the next push re-creates the "
      + "Wings Ahead row and clears the tombstone lying on it. Nothing crosses until you push.",
    clear: "Lets the queue try this identity again. It writes nothing by itself — it only takes the line "
      + "off hold, and the next push is still an explicit act.",
    forget: "Forgets the link between this FDMS event and its Wings Ahead row. It REMOVES NOTHING from "
      + "Wings Ahead: the row stays, and the next cross-check shows it as an fdms-stamped row this store's "
      + "ledger does not know. AND IT PUTS THE FLIGHT BACK IN THE QUEUE AS A NEW ROW — the FDMS event is "
      + "untouched, so the queue owes it again and the next push would CREATE it. Use it when the row over "
      + "there is somebody else's to own; if it is this event's, ⇄ Adopt it instead.",
    /* P45-FDMSb — the four acts that settle a hold the ledger cannot settle by
       itself. Two of them write ONLY this store's memory, one writes nothing at
       all, and none of them touches Wings Ahead. */
    clearstu: "Forgets this STUDENT-level hold, so the next push tries him again. It writes nothing to "
      + "Wings Ahead and touches no flight: his lines simply go back into the queue. If he still does not "
      + "exist on the Wings Ahead roster with this OID, the next push holds him again, with the same "
      + "sentence.",
    lookpull: "Calls rpc/bridge_pull once, now. It is a READ — it writes nothing on either side — and it "
      + "is what tells a row the admin DELETED from a row he MOVED. Until a read NEWER than this refusal "
      + "has run, this line offers no act that could create a second row. If the live door is refusing, "
      + "📄 File loads a wa-export-v1 the Wings Ahead admin downloaded and settles it exactly as well.",
    adopt2: "Re-anchors this row identity to the Wings Ahead row that is standing on the record right now. "
      + "It writes ONLY this store's push ledger — nothing crosses the wire, no row is created, moved or "
      + "removed — and the change log keeps what the ledger remembered before. After it, the queue plans "
      + "the ordinary correction against the row's real handle instead of creating a second one.",
    recreate: "Arms a DELIBERATE re-creation: this store forgets the row it wrote, and the next ✈ Push now "
      + "sends a create. It writes nothing by itself, and it is offered only when a read of Wings Ahead has "
      + "shown that no row the bridge wrote stands anywhere on that record for this flight AND that read is "
      + "NEWER than the refusal it explains — which is the only state in which a create cannot make a "
      + "duplicate. A read taken before the push that was refused arms nothing, whatever it shows.",
    srcFile: "Reads one Wings Ahead export file you pick from disk. Nothing leaves this machine and no "
      + "credential is used. This is the fallback for a closed network, and it stays byte-compatible.",
    srcLive: "Reads the SAME payload straight from Wings Ahead over the bridge credential. It is a READ: "
      + "it writes nothing on either side. There is no background polling — the report carries real names, "
      + "and holding them in memory behind your back is exactly what this pane does not do.",
    pull: "Calls rpc/bridge_pull once, now, and builds the report from what comes back. It writes nothing, "
      + "anywhere. What it fetches lives exactly as long as this tab: leaving the pane drops it.",
  };

  /* LEAVING THE PANE DROPS THE REPORT — R18 VERIFY FINDING 3.
     § 6 of the spec has always said it in words («το ✕ Clear ΚΑΙ η εγκατάλειψη
     της καρτέλας ρίχνουν την αναφορά»), and until this slice it was only half
     true: ✕ Clear dropped it, but a subtab click or a jump to another view
     merely put `display:none` over a DOM full of REAL NAMES, which then sat
     there until a reload. Ctrl+F, Ctrl+A, a screen reader, the browser's own
     find-in-page and any «save page» all still reached it — the same leak the
     access-code curtain was built to close for the Scheduler.
     So the state AND the nodes go, and the pane is repainted to its clean load
     state so the return is a load state and not an empty box (ruling #7).
     PHASE 3 — AND THE PARSED EXPORT GOES WITH THEM. It is the same real names,
     kept in memory for one reason only (re-judging the report against the store
     after a line is applied), so it lives exactly as long as the report and
     dies at exactly the same moment. The change log stays: it is store data,
     it names students by CODE, and it is the trail ruling #2 asked for.
     Called by app/scheduler.js when another subtab takes over and by app/app.js
     when another view does. ✕ Clear is untouched and keeps its own button. */
  W.schBridgeLeave = function schBridgeLeave() {
    const had = !!(ui.report || ui.parsed || ui.fileName || ui.error || ui.q || ui.cls
      || ui.group || ui.pick.length || ui.applyMsg || ui.logOpen);
    clearAll();
    if (!had) return;                                   // nothing was ever painted
    const doc = W.document;
    const el = doc ? doc.getElementById("sch-bridge") : null;
    if (el) render(el);                                 // → head() + placeholder, no data
  };

  /* ══ THE HEADER CHIP — FAILURE AS STATE (design C.4) ═════════════════════
     It lives beside the sync hint and the data badge, the one corner of the
     topbar that already talks about data freshness, and it says one of five
     things:
       ✈ WA · pushed 14:32          everything owed has landed
       ✈ WA · 3 queued              three flights are waiting for ✈ Push now
       ✈ WA · 3 not pushed — unreachable since 14:02 · ⟳
       ✈ WA · token revoked — open Bridge ⚙     (and the automatic lane disarms)
       ✈ WA · 2 to settle           conflicts / removals a human has to rule on
     It is deliberately NOT a toast: a toast is gone in three seconds and this is
     a fact about the store, true until it is not. And because the count is
     RECOMPUTED (there is no stored queue), a failed push cannot be silently
     dropped — it is simply still owed, and the chip keeps saying so.
     It sits OUTSIDE #view-scheduler, like the ⋯ menu, so the edit lock's veneer
     does not reach it — which is why its retry asks editOn() by hand and names
     the act it refused.

     AND IT STAYS OUTSIDE, DELIBERATELY (P45-FDMS verify item 10). SchedEdit's
     SCOPE is «#view-scheduler, #view-currency, #sch-progmodal», so `sweep()`
     never disables this button and the capture guard never refuses its click:
     of every [data-brgw] control, this one alone is not covered by the veneer.
     Bringing it under SCOPE would DISABLE it — and the chip is also the
     read-only route to the pane that explains it, which a view-only device has
     every right to click. A disabled chip would take the explanation away from
     exactly the person who is being told «view-only». So the wall is where it
     has to be instead of where it looks tidiest: this handler asks editOn()
     before anything moves, armAuto() refuses to even arm a timer on a locked
     device, and runPush() asks the lock again before a single byte leaves. The
     attribute stays on the chip so any inventory of the write controls still
     finds it and can ask this question again. */
  function chipEl() {
    const doc = W.document;
    if (!doc || !doc.body) return null;
    let el = doc.getElementById("brg-chip");
    if (el) return el;
    const badge = doc.getElementById("databadge");
    if (!badge || !badge.parentNode) return null;
    el = doc.createElement("button");
    el.type = "button";
    el.id = "brg-chip";
    el.className = "brg-chip hidden";
    el.setAttribute("data-brgw", "chip");
    badge.parentNode.insertBefore(el, badge);
    el.addEventListener("click", () => {
      /* THE CHIP IS A RETRY, NEVER A FIRST WRITE. With the Live switch on it
         re-fires the automatic lane the developer has already armed — that is
         what «⟳» in its own text means. With Live OFF it takes him to the pane,
         where ✈ Push now opens the numbered dialog: a topbar chip must never be
         the shortest route past a confirm. */
      if (!bridgeLive() || wst.kind === "revoked" || !(ui.plan && ui.plan.counts.queued)) {
        openBridgeTab();
        return;
      }
      if (!editOn()) { refuseWrite("push the waiting flights to Wings Ahead"); return; }
      void runPush("chip");
    });
    return el;
  }

  /* the chip's one navigation act: show me the pane that explains this */
  function openBridgeTab() {
    const doc = W.document;
    if (!doc) return;
    const tab = doc.getElementById("tab-scheduler");
    if (tab) tab.click();
    const sub = doc.querySelector('.sch-subtab[data-sch="bridge"]');
    if (sub) sub.click();
  }

  function chipPaint() {
    const el = chipEl();
    if (!el) return;
    if (!bridgeConfigured()) { el.className = "brg-chip hidden"; el.textContent = ""; return; }
    const p = ui.plan || plan();
    const owed = p ? p.counts.queued : 0;
    const settle = p ? p.counts.removals + p.counts.held : 0;
    let txt = "", cls = "brg-chip", tip = "";
    if (wst.kind === "revoked") {
      txt = "✈ WA · token revoked — open Bridge ⚙";
      cls += " is-bad";
      tip = wst.why;
    } else if (wst.kind && owed) {
      txt = "✈ WA · " + owed + " not pushed — " + (wst.kind === "unreachable" ? "unreachable" : "refused")
        + " since " + wst.since + " · ⟳";
      cls += " is-bad";
      tip = wst.why + "  Nothing is lost: the queue is recomputed from the store, so what is owed stays owed.";
    } else if (wst.busy) {
      txt = "✈ WA · pushing…";
      cls += " is-on";
    } else if (owed && !editOn()) {
      /* THE VIEW-ONLY STATE, SAID RATHER THAN IMPLIED. The count is still true —
         these flights ARE owed — and the reason nothing is happening about them
         is a fact about this device, not about the queue. A chip that showed
         «3 queued» and then never moved would teach the developer to distrust
         the chip. */
      txt = "✈ WA · " + owed + " queued · view-only";
      cls += " is-warn";
      tip = "these flights are owed and nothing will cross from this device: the bridge writes Wings "
        + "Ahead only with ✎ Editor mode on, because a write it could not record in its own ledger is a "
        + "write nobody could take back.";
    } else if (owed) {
      txt = "✈ WA · " + owed + " queued";
      cls += " is-on";
      tip = bridgeLive()
        ? "these flights cross by themselves " + (AUTO_MS / 1000) + " s after the last change — or now, if you click"
        : "the live switch is off: click, or use ✈ Push now on the Bridge tab";
    } else if (settle) {
      txt = "✈ WA · " + settle + " to settle";
      cls += " is-warn";
      tip = "removals waiting for a confirm, or lines Wings Ahead refused — the Bridge tab names each one";
    } else if (wst.at) {
      txt = "✈ WA · pushed " + wst.at;
      cls += " is-ok";
      tip = "everything this store owes Wings Ahead has landed";
    } else {
      txt = "✈ WA · nothing owed";
      tip = "the bridge is configured and this store owes Wings Ahead nothing";
    }
    el.textContent = txt;
    el.className = cls;
    el.title = tip || txt;
  }

  /* ── THE DEBOUNCE AND THE BACKOFF (design C.2 row 1 · C.4) ───────────────
     Every store mutation re-arms a 5-second timer — the rhythm SchedSync
     already established, so a burst of typing costs ONE push. It fires only
     when the bridge is configured AND the Live switch is on; otherwise the
     timer's only job is to repaint the chip, which must stay true whether or
     not anything is armed.
     A failure backs off 10 s → 30 s → 1 min → 3 min → 5 min and STOPS THERE.
     A revoked credential is not retried at all: it disarms the automatic lane
     and says so, because retrying a refusal is how a log fills with the same
     sentence a thousand times. */
  function armAuto() {
    if (wst.timer) { clearTimeout(wst.timer); wst.timer = null; }
    plan();
    chipPaint();
    if (!bridgeLive() || wst.kind === "revoked" || wst.busy) return;
    /* AND THE TIMER IS NOT EVEN ARMED ON A VIEW-ONLY DEVICE. runPush refuses
       anyway — that is the wall — but arming a timer whose only outcome is a
       refusal would spend a wake-up every five seconds to say nothing. */
    if (!editOn()) return;
    if (!ui.plan || !ui.plan.counts.queued) return;
    const wait = wst.kind ? BACKOFF_MS[Math.min(wst.tries, BACKOFF_MS.length - 1)] : AUTO_MS;
    wst.timer = setTimeout(() => { wst.timer = null; void runPush("auto"); }, wait);
  }

  let wired = false;
  function wireStore() {
    if (wired || !S()) return;
    wired = true;
    S().subscribe((coll) => {
      if (coll !== "trainingLog" && coll !== "bridgePush" && coll !== "config"
        && coll !== "students" && coll !== "instructors" && coll !== "*") return;
      armAuto();
    });
    armAuto();
  }

  W.schBridgeInit = function schBridgeInit(el) {
    if (!el) return;
    wireStore();
    render(el);
    if (el._brgWired) return;
    el._brgWired = true;
    el.addEventListener("click", (e) => {
      const b = e.target.closest("[data-brg]");
      if (!b) return;
      const a = b.dataset.brg;
      if (a === "pick") { const f = el.querySelector(".brg-file"); if (f) f.click(); return; }
      if (a === "clear") { clearAll(); render(el); return; }
      if (a === "print") { W.print(); return; }
      if (a === "cls") { ui.cls = ui.cls === b.dataset.v ? "" : b.dataset.v; render(el); return; }
      if (a === "group") { ui.group = ui.group === b.dataset.v ? "" : b.dataset.v; render(el); return; }
      if (a === "log") { ui.logOpen = !ui.logOpen; render(el); return; }
      if (a === "blocks") { ui.blockOpen = !ui.blockOpen; render(el); return; }
      /* THE SOURCE PICKER AND THE LIVE PULL ARE READS, and they are on
         [data-brg] for the reason every other read control is: denying them
         would make the report unreachable in the default state of every device,
         for no gain. A pull writes nothing on either side. */
      if (a === "src") {
        if (ui.src !== b.dataset.v) { clearAll(); ui.src = b.dataset.v; }
        render(el);
        return;
      }
      if (a === "pull") { void doPull(el); return; }
    });
    /* THE WRITE CONTROLS — a separate attribute from [data-brg] ON PURPOSE.
       [data-brg] is on SchedStore's NAV list because everything wearing it
       READS; [data-brgw] is deliberately absent from that list, so the edit
       lock's veneer disables these, its capture guard refuses the click, and
       upsert() refuses a third time. Slice 1's NAV comment promised exactly
       this. Every branch below asks editOn() BEFORE any dialog opens. */
    el.addEventListener("click", (e) => {
      const b = e.target.closest("[data-brgw]");
      if (!b || b.disabled) return;
      const a = b.dataset.brgw;
      if (a === "sel") return;                     // the checkbox answers to `change`, once
      if (a === "selall") { pickAll(el, b.dataset.v === "1"); return; }
      if (a === "apply") { startApply(el, [b.dataset.rid], b.dataset.f || ""); return; }
      if (a === "batch") { startApply(el, ui.pick.slice(), ""); return; }
      if (a === "undo") { startUndo(el, b.dataset.id); return; }
      /* PHASE 4/5 — the four controls that write the OTHER side. Same
         attribute, same three walls: the veneer disables them, the capture
         guard refuses the click by name, and each one asks editOn() again
         before a single dialog opens. */
      if (a === "pushnow") { void startPush(el); return; }
      if (a === "rm") { void startRemovals(el, [b.dataset.rid]); return; }
      if (a === "rmall") { void startRemovals(el, []); return; }
      if (a === "hold") { void startHold(el, b.dataset.rid, b.dataset.a || "clear"); return; }
      if (a === "cfg") { void openSettings(el); return; }
    });
    el.addEventListener("change", (e) => {
      const c = e.target.closest('input[data-brgw="sel"]');
      if (!c) return;
      togglePick(el, c.dataset.rid);
    });
    el.addEventListener("input", (e) => {
      const t = e.target.closest("[data-brgq]");
      if (!t) return;
      ui.q = t.value;
      paintRows(el);
    });
    el.addEventListener("change", async (e) => {
      const f = e.target.closest(".brg-file");
      if (!f || !f.files || !f.files[0]) return;
      const file = f.files[0];
      f.value = "";
      await load(el, file);
    });
  };

  async function load(el, file) {
    clearAll();
    ui.fileName = file.name;
    let text = "";
    try { text = await readFile(file); }
    catch (err) { ui.error = "the file could not be read."; render(el); return; }
    const parsed = parseExport(text);
    if (!parsed.ok) { ui.error = parsed.why; render(el); return; }
    ui.parsed = parsed;
    recompute();
    render(el);
  }

  /* RE-JUDGE THE SAME EXPORT AGAINST THE STORE AS IT STANDS NOW. Called once
     on load and again after every apply and every undo, so that what the pane
     shows is never a memory of a store that has since changed: a line applied
     turns into `agree` in front of the developer, and an undone one turns back
     into `wa_only`. Nothing is written here. */
  function recompute() {
    if (!ui.parsed) return;
    try {
      ui.report = crossCheck(ui.parsed, {
        students: S().get("students") || [],
        instructors: S().get("instructors") || [],
        trainingLog: S().get("trainingLog") || [],
        gates: S().get("gates") || [],
      }, {
        kindOf: (uid) => (R() ? R().kindOf(uid) : null),
        membersOf: (c) => S().membersOf(c) || [],
        today: R() ? R().todayISO() : "",
      });
      /* a selection survives a recompute only where the line is still there and
         still appliable — a row that has just become `agree` must not stay
         ticked, or the next batch would open on nothing. */
      const live = new Set(ui.report.rows.filter((x) => x.plan && x.plan.can).map((x) => x.rid));
      ui.pick = ui.pick.filter((rid) => live.has(rid));
    } catch (err) {
      ui.error = "the cross-check could not be completed: " + err.message;
      console.error(err);
    }
  }

  function readFile(file) {
    if (file.text) return file.text();
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(String(fr.result));
      fr.onerror = () => rej(new Error("read failed"));
      fr.readAsText(file);
    });
  }

  /* ── selection ─────────────────────────────────────────────────────────── */

  /* an APPLIABLE row is addressed by its ROW IDENTITY, never by its position:
     the report is rebuilt after every write, and a position would point at a
     different flight the moment one line moved. Inside `flights`/`fs` — the
     only two groups this slice writes — the rid is unique by construction. */
  const planOf = (rid) => {
    if (!ui.report) return null;
    const hit = ui.report.rows.find((x) => x.rid === rid && x.plan && x.plan.can);
    return hit ? hit.plan : null;
  };

  function togglePick(el, rid) {
    if (!rid) return;
    const i = ui.pick.indexOf(rid);
    if (i >= 0) ui.pick.splice(i, 1); else ui.pick.push(rid);
    paintRows(el);
    paintBatch(el);
  }
  function pickAll(el, on) {
    ui.pick = on ? visibleRows().filter((x) => x.plan && x.plan.can).map((x) => x.rid) : [];
    paintRows(el);
    paintBatch(el);
  }

  /* ── the numbered confirm dialog ───────────────────────────────────────── */

  /* THE HOUSE MODAL, nothing new invented: the .ed-pop veil and the .ed-box
     card the editor dialog and the typed-word dialog already use, tokens only.
     It is appended to document.body — OUTSIDE #view-scheduler — for the same
     reason the typed-word dialog is: inside the guarded view the edit lock's
     veneer would disable the very buttons that finish the act it has already
     allowed. Esc · ↩ Cancel · a click on the veil all cancel, and CANCEL MEANS
     NOTHING HAPPENS: the promise resolves false and the caller returns before a
     single record is touched. */
  let popBusy = false;
  /* ── THE NUMBERED DIALOG, AND THE ONE THAT ASKS FOR THE NUMBER BACK ───────
     `o.word` is optional and everything above this line is unchanged without
     it. With it the dialog grows the house's typed-word gate — the very shape
     Round 20 built for ⭱ Import and ⟲ Reset (`SchedStore.wordPrompt`): the same
     `.ed-box` card, the same `.ed-lbl` / `.ed-status` / `.ed-box input`, Enter
     submits, Esc cancels, a wrong word says so and takes the focus back. It is
     re-implemented here rather than reached across a module boundary because
     that one is private to the store and this one has to carry a NUMBERED LIST
     above the input — and because a shared dialog with two callers' worth of
     options is how a confirm dialog quietly gains a path that skips its own
     gate. The input's id is this pane's own, so the two can never collide in
     one document. */
  function confirmPop(o) {
    return new Promise((resolve) => {
      const doc = W.document;
      if (popBusy || !doc || !doc.body) { resolve(false); return; }
      popBusy = true;
      const word = trim(o.word);
      const veil = doc.createElement("div");
      veil.className = "ed-pop brg-pop";
      veil.innerHTML = `<div class="ed-box brg-box" role="dialog" aria-modal="true" aria-label="${esc(o.title)}">
        <div class="ed-ico" aria-hidden="true">${esc(o.ico || "✔")}</div>
        <h3>${esc(o.title)}</h3>
        <p class="hint">${o.lead}</p>
        <ol class="brg-poplist">${o.items}</ol>
        <p class="hint">${o.foot}</p>
        ${word ? `<label class="ed-lbl" for="brg-wordin">Type ${esc(word)} to continue</label>
        <input id="brg-wordin" type="text" autocomplete="off" spellcheck="false"
               placeholder="${esc(word)}" aria-describedby="brg-wordmsg">` : ""}
        <div class="ed-row">
          <button type="button" class="sch-tbtn ${word ? "danger" : "primary"}" data-p="go">${word
    ? `<span class="sch-dgl">${esc(o.ico || "⚠")}</span> ` : ""}${esc(o.go)}</button>
          <button type="button" class="sch-tbtn" data-p="cancel">↩ Cancel</button>
        </div>
        ${word ? `<div class="ed-status" id="brg-wordmsg" role="status"></div>` : ""}
      </div>`;
      let finished = false;
      const done = (v) => {
        if (finished) return;
        finished = true;
        doc.removeEventListener("keydown", onKey, true);
        popBusy = false;
        if (veil.parentNode) veil.remove();
        resolve(v);
      };
      /* the comparison is trimmed and case-insensitive for the same reason the
         store's is: the gate is «read the sentence and type it back», not
         «hold shift». A count is digits, so it only ever trims. */
      const submit = () => {
        if (!word) { done(true); return; }
        const el = veil.querySelector("#brg-wordin");
        const typed = String(el ? el.value : "").trim();
        if (typed.toUpperCase() === word.toUpperCase()) { done(true); return; }
        const m = veil.querySelector("#brg-wordmsg");
        if (m) m.textContent = typed ? "that is not it — type " + word : "type " + word + " to continue";
        if (el) { el.focus(); el.select(); }
      };
      function onKey(e) {
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); done(false); return; }
        if (word && e.key === "Enter" && veil.contains(e.target)) {
          e.preventDefault(); e.stopPropagation(); submit();
        }
      }
      veil.addEventListener("click", (e) => {
        if (e.target === veil || e.target.closest('[data-p="cancel"]')) { done(false); return; }
        if (e.target.closest('[data-p="go"]')) submit();
      });
      doc.addEventListener("keydown", onKey, true);
      doc.body.appendChild(veil);
      const g = veil.querySelector(word ? "#brg-wordin" : '[data-p="go"]');
      if (g) setTimeout(() => g.focus(), 50);
    });
  }

  /* ONE PLAN, ONE FIELD. The per-field ↦ button adopts exactly the difference
     the report is showing on that line and leaves the rest of the row alone —
     which is the binding rule: adoption is offered only where both sides are
     already on screen. */
  function narrowPlan(p, field) {
    if (!field) return p;
    /* the provenance keys narrow with the act too: adopting ONE field must
       never quietly re-stamp what the OTHER fields remembered */
    const keep = field === "instructor"
      ? ["instructor", "bridge.src.instructor"]
      : ["result", "maneuvers", "bridge.src.grade", "bridge.src.thr",
        "bridge.src.mission", "bridge.src.ng"];
    const fields = arr(p.fields).filter((f) => keep.indexOf(f.field) >= 0);
    if (!fields.length) return null;
    const q = Object.assign({}, p, { fields: fields, field: field });
    if (field === "instructor") {
      q.result = "";
      q.effect = "the instructor is not part of what completes a node — the node effect does not change";
    }
    return q;
  }

  /* ONE FIELD VALUE, THE WAY THE HOUSE READS IT. The change log stores the raw
     value — an ISO date is what actually lands in the event — but everything
     this app SHOWS a human is DD/MM, and an audit trail that reads in a second
     format is an audit trail nobody checks. Empty is a dash, never a blank. */
  const fval = (v) => (v === "" || v == null ? "—"
    : (/^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? dmy(String(v)) : String(v)));
  const fchg = (list, back) => arr(list).map((f) => {
    const a = back ? f.to : f.from, b = back ? f.from : f.to;
    return `<span class="brg-fchg"><b>${esc(f.field)}</b> ${esc(fval(a))} → ${esc(fval(b))}</span>`;
  }).join("");

  function planLine(p) {
    const who = esc(p.who || p.student) + (p.student ? ` <span class="sch-code">${esc(p.student)}</span>` : "");
    const act = p.act === "create" ? "CREATE a training-log event"
      : p.act === "update" ? "MOVE the date of the existing FDMS event"
        : "ADOPT the Wings Ahead value" + (p.field ? " of «" + p.field + "»" : "s") + " on the existing FDMS event";
    const fields = fchg(p.fields, false);
    return `<li><b>${who}</b> · <span class="sch-mono">${esc(p.uid)}</span>
      ${p.date ? " · " + esc(dmy(p.date)) : ""}
      <div>${esc(act)}${p.act === "create" ? " — " + esc(p.verdict) : ""}
        ${p.act === "create" && p.ipLabel ? " · " + esc(p.ipLabel) : ""}</div>
      <div class="brg-fchgs">${fields}</div>
      <div class="brg-eff ${p.completes ? "is-c" : ""}">→ ${esc(p.effect)}</div>
      <div class="sch-nd sch-mono">${esc(p.rid)}${p.waWritten ? " · this FDMS event was written by the bridge"
    : p.act === "create" ? "" : " · this FDMS event was TYPED IN THE TRAINING LOG, not written by the bridge"}</div></li>`;
  }

  async function startApply(el, rids, field) {
    if (!editOn()) { refuseWrite("apply a Wings Ahead line to the training log"); return; }
    const plans = [];
    arr(rids).forEach((rid) => {
      const p = planOf(rid);
      if (!p) return;
      const q = narrowPlan(p, field);
      if (q) plans.push(q);
    });
    if (!plans.length) {
      ui.applyMsg = "nothing to apply — the selected line is no longer appliable. Reload the export.";
      ui.applyBad = true;
      render(el);
      return;
    }
    const created = plans.filter((p) => p.act === "create").length;
    const changed = plans.length - created;
    const go = await confirmPop({
      ico: "✔",
      title: plans.length === 1 ? "Apply this line to the training log?"
        : "Apply " + plans.length + " lines to the training log?",
      go: "✔ Apply " + plans.length + " line" + (plans.length === 1 ? "" : "s"),
      lead: "Every line is listed below with what it writes and <b>what it does to the syllabus node</b>. "
        + "This writes the <b>FDMS training log only</b> — Wings Ahead, the repository and the export file "
        + "are not touched.",
      items: plans.map(planLine).join(""),
      foot: "<b>" + created + "</b> created · <b>" + changed + "</b> changed. "
        + "Each act is appended to the <b>Bridge change log</b> below with what was there before, and "
        + "<b>↺ Undo</b> reverts exactly that write. Nothing is deleted here — a deletion stays a separate "
        + "deliberate act (ruling #2).",
    });
    if (!go) { ui.applyMsg = "cancelled — nothing was written."; ui.applyBad = false; render(el); return; }
    let ok = 0;
    const bad = [];
    plans.forEach((p) => {
      const res = applyPlan(p);
      if (res.ok) ok += 1; else bad.push(p.uid + " — " + res.why);
    });
    ui.pick = [];
    recompute();
    ui.applyMsg = ok + " line" + (ok === 1 ? "" : "s") + " written to the training log"
      + (bad.length ? " · " + bad.length + " refused: " + bad.join(" · ") : "")
      + ". The report below was re-judged against the store as it now stands.";
    ui.applyBad = bad.length > 0;
    if (ok && S().toast) S().toast("Bridge — " + ok + " line" + (ok === 1 ? "" : "s") + " applied.", "good");
    render(el);
  }

  async function startUndo(el, id) {
    if (!editOn()) { refuseWrite("undo a bridge write"); return; }
    const e = S().find("bridgeLog", id);
    if (!e) return;
    const go = await confirmPop({
      ico: "↺",
      title: "Undo this bridge write?",
      go: "↺ Undo this act",
      lead: "This reverts <b>exactly this one act</b> and nothing else. If the event has been edited in the "
        + "Training log since, it refuses rather than discard that edit.",
      items: `<li><b>${esc(dmy(e.date))}</b> · ${esc(String(e.act).toUpperCase())}
        · <span class="sch-mono">${esc(e.uid)}</span>
        <div>${esc(e.what)}</div>
        <div class="brg-fchgs">${fchg(e.fields, true)}</div>
        <div class="sch-nd sch-mono">${esc(e.evId)}</div></li>`,
      foot: "The undo is itself recorded as a change-log entry, so the trail keeps both acts.",
    });
    if (!go) { ui.applyMsg = "cancelled — nothing was written."; ui.applyBad = false; render(el); return; }
    const res = undoEntry(id);
    recompute();
    ui.applyMsg = res.ok ? "undone — the change log keeps both acts." : "not undone: " + res.why;
    ui.applyBad = !res.ok;
    if (S().toast) S().toast(res.ok ? "Bridge — the write was undone." : "Bridge — not undone.", res.ok ? "good" : "bad");
    render(el);
  }

  /* ══ THE PUSH LANE'S ACTS — every one of them past the lock and a dialog ══ */

  const paneEl = () => (W.document ? W.document.getElementById("sch-bridge") : null);
  function repaint() { const el = paneEl(); if (el) render(el); }

  /* ONE LINE OF THE NUMBERED DIALOG (13η's shape, verbatim, one wire over):
     who · which flight · what the operation IS · every field that moves,
     from → to · what Wings Ahead will do with it · the row identity. */
  /* ── A CREATE OVER A ROW THAT IS ALREADY STANDING (P45-FDMSc) ─────────────
     A create carries `prev: null` — no claim about the far side — so Wings
     Ahead has nothing to refuse it with, and if a bridge-written row for that
     flight is standing on that record the push leaves TWO. The queue can reach
     that state by more than one road: ✕ Stop tracking on a held identity (the
     verify's item 5b), an ⭱ Import of a backup taken before the row was
     written, a ⟲ Reset. So the warning does not live on any one of those roads
     — it lives HERE, on the line the developer confirms, where every create
     passes. It is the read on screen that answers, and when there is no read
     the line says nothing rather than guessing: silence here is «not known»,
     and the dialog's own foot already says what a create is. */
  function standingBeside(e) {
    if (!ui.parsed || !isObj(e) || !isObj(e.op)) return [];
    if (e.op.op === "remove" || isObj(e.op.prev)) return [];
    const L = e.line;
    const look = missingLook({ rid: trim(L.rid), oid: trim(L.oid), group: trim(L.group),
      uid: trim(L.uid), sent: null, at: "" }, ui.parsed, S() ? S().get("bridgePush") : []);
    return look.free;
  }

  function wireLine(e) {
    const L = e.line, op = e.op;
    const isRemove = op.op === "remove";
    const who = esc(L.who || L.student) + (L.student ? ` <span class="sch-code">${esc(L.student)}</span>` : "");
    const act = isRemove ? "REMOVE the Wings Ahead row and tombstone the identity"
      : e.kind === "move" ? "MOVE the Wings Ahead row to its corrected flight, date and sequence"
        : e.kind === "change" ? "UPDATE the Wings Ahead row"
          : op.clear_tombstone ? "RE-CREATE the Wings Ahead row and CLEAR its tombstone"
            : "CREATE the flight row in Wings Ahead";
    const before = isObj(op.prev) ? op.prev : null;
    const after = isObj(op.row) ? op.row : null;
    const fields = fchg(rowFields(before, after), false);
    const standing = standingBeside(e);
    return `<li><b>${who}</b> · <span class="sch-mono">${esc(L.uid)}</span>
      ${L.date ? " · " + esc(dmy(L.date)) : ""}
      <div>${esc(act)}${isRemove && trim(op.reason) ? " — reason «" + esc(op.reason) + "»" : ""}</div>
      ${e.why ? `<div class="sch-nd">${esc(e.why)}</div>` : ""}
      ${standing.length ? `<div class="brg-eff is-c">⚠ this is a CREATE, and a row the bridge wrote
        for this flight is <b>already standing</b> on that record in the read on screen, at
        ${standing.map((x) => `<span class="sch-mono">${esc(x.handle)}</span>`).join(" · ")} — no
        ledger row of this store answers for it, so nothing here will stop the create and the record
        would carry <b>two</b> rows for one FDMS event. Settle it from the Held table
        (<b>⇄ Adopt</b>) before you send this line.</div>` : ""}
      <div class="brg-fchgs">${fields}</div>
      <div class="brg-eff">→ ${esc(waHandleOf(L.group, after || before))}</div>
      <div class="sch-nd sch-mono">${esc(L.rid)}${L.evId ? " · " + esc(L.evId) : ""}</div></li>`;
  }

  /* ── THE OP THIS SIDE REFUSES TO SEND ────────────────────────────────────
     planPush() scrubs the queue it builds, but it is not the only thing that
     builds operations: a compensating upsert is assembled from the CHANGE LOG
     (compensationOf), whose `waBefore`/`waAfter` come back from a backup on an
     ⭱ Import exactly as the ledger's `sent` does. So the shape is asked again
     here, at the one seam every operation passes through, and this one is the
     wall rather than the surface: it does not touch the ledger, it just does not
     send, and the line goes to the report with its own sentence. */
  function opProblem(op) {
    if (!isObj(op)) return "the operation is not an object";
    const p = prevProblem(op.prev);
    if (p) return p;
    if (op.op !== "upsert") return "";
    if (!isObj(op.row)) return "an upsert carries the row it means to write, and this one carries none";
    const w = rowProblem(op.row, "outgoing");
    return w ? "the row this act would write is malformed — " + w + ". It was not built by the planner "
      + "(which rebuilds every row from scratch); it came back from a change-log entry, so this backup "
      + "or its ledger has been edited. Nothing was sent." : "";
  }

  /* ── THE HOLD THAT IS ABOUT A PERSON, NOT A ROW ──────────────────────────
     One ledger row, `scope: "student"`, carrying the server's own sentence. It
     is what takes that student's lines off the queue on the NEXT planner run —
     without it the automatic lane would spend one refused call on him every
     five seconds for ever — and it is cleared by hand, from the Held table,
     because «recovery is explicit» is the same rule here as everywhere else. */
  function holdStudent(b, hold, why, owed) {
    const code = trim((b.entries[0] && b.entries[0].line && b.entries[0].line.student) || "");
    const own = hold === "timeout"
      ? "Wings Ahead could not finish even ONE operation for this student inside its three-second "
        + "statement budget. Nothing was written — the call rolls back whole — and the flights are still "
        + "owed. This is a fact about the size of that record over there, not about the flights: clear "
        + "the hold to try again."
      : "Wings Ahead refused the whole call for this student AT THE ENVELOPE, before it read a single "
        + "operation — so this says nothing about the flights themselves, and every other student in the "
        + "run crossed. The usual cause is the ordinary order of onboarding: the student is typed into "
        + "FDMS before he exists in Wings Ahead (or he has been deactivated there). He cannot be resolved "
        + "by name across this wire (ruling #4) — add him there, with this OID, and clear the hold.";
    return ledgerPut({
      rid: ledStuRid(b.oid), scope: "student", oid: normOid(b.oid), group: "", uid: "", ord: 0, seq: 0,
      evId: "", student: code, sent: null, state: "", hold, verdict: "", reason: "", clearTomb: false,
      waRow: null, at: new Date().toISOString(),
      note: trim(why) + " — " + own + " (" + owed + " line" + (owed === 1 ? "" : "s")
        + " of his were waiting when this happened.)",
    });
  }

  /* ── THE ONE PLACE THAT SENDS ─────────────────────────────────────────────
     Grouped per student (bridge_push takes ONE), chunked at PUSH_CHUNK — which
     is the three-second budget and not the 200 of the envelope — and halving
     that chunk whenever the far side says the call was too big to finish.

     WHAT STOPS THE RUN AND WHAT DOES NOT is decided by wireFailKind(), and the
     difference is the whole of P45-FDMSb's verify item 11: a door that did not
     answer stops everything (it will not answer the next chunk either), while a
     refusal that names ONE STUDENT holds that student and lets every other
     student cross in the same run. Nothing is lost either way — what is owed is
     derived, so it stays owed until it lands. */
  async function runPush(how, only) {
    if (wst.busy) return { ok: false, why: "a push is already running" };
    /* ── THE THIRD WALL, AND THE ROUND'S ONE OVERRULED DESIGN DECISION ──────
       Design G.12 said the automatic lane should NOT be re-gated on the edit
       lock at fire time, on the sync-auto-push precedent: «the gated act was the
       store write; its 5-second completion is the same doctrine the 5-second
       sync push already lives by.» That reasoning does not survive contact with
       this lane, and the live run is what showed it:

         a view-only device with Live armed pushed the rows to Wings Ahead —
         and then could not write its own ledger, because ledgerPut() goes
         through upsert() and upsert() asks mayWrite(). The far side gained
         rows this store had no memory of creating. Every later planner run
         would owe them again, meet its own rows, and answer `exists_fdms` for
         ever; and ↺ Undo would have nothing to take back.

       The precedent does not transfer, and the difference is exactly why: what
       SchedSync auto-pushes is a snapshot of writes the lock ALREADY allowed,
       and its bookkeeping is localStorage counters that no lock guards. What
       this lane auto-pushes is a write to another system, and its bookkeeping
       is a STORE COLLECTION the lock does guard. A write whose record cannot be
       written must not be made. So the lock is asked HERE too — and it is asked
       in the one place that cannot be walked around, before a single byte
       leaves, which makes it the wall and not the veneer. */
    if (!editOn()) {
      if (how !== "auto") refuseWrite("push flights to Wings Ahead");
      return { ok: false, why: "view-only — the bridge does not write Wings Ahead from a locked device, "
        + "because it could not record what it wrote" };
    }
    const list = only || arr((ui.plan || plan()).queued);
    if (!list.length) return { ok: false, why: "nothing is owed" };
    const buckets = new Map();
    list.forEach((e) => {
      const oid = e.line.oid;
      if (!buckets.has(oid)) buckets.set(oid, { oid, who: e.line.who, entries: [] });
      buckets.get(oid).entries.push(e);
    });
    wst.busy = true;
    chipPaint();
    const seen = [];
    let sent = 0, wrote = 0, unrecorded = 0, stopped = "";
    let heldStudents = 0, refusedLocally = 0, shrankTo = 0;
    for (const b of buckets.values()) {
      if (stopped) break;
      /* THE MEMORY THIS SIDE CANNOT SEND NEVER LEAVES THE ROOM */
      const good = [];
      b.entries.forEach((e) => {
        const why = opProblem(e.op);
        if (!why) { good.push(e); return; }
        refusedLocally += 1;
        seen.push({ rid: e.line.rid, uid: e.line.uid, who: e.line.who, date: e.line.date,
          verdict: "(not sent)", say: why, note: "", cls: "unwritten", waRow: null, unrecorded: false });
      });
      /* THE ADAPTIVE CHUNK. `i` walks the bucket; a chunk that could not finish
         inside the far side's statement budget is not a failure at all — it is
         the same work, halved, sent again. Nothing was written when 57014 came
         back (the whole call rolls back), so the retry is not a replay risk. */
      let i = 0;
      let size = Math.max(1, Math.min(posInt(wst.chunk, PUSH_CHUNK), PUSH_MAX_OPS));
      while (i < good.length) {
        const take = Math.min(size, good.length - i);
        const ch = { ops: good.slice(i, i + take).map((e) => e.op), entries: good.slice(i, i + take) };
        const r = await wirePush(b.oid, ch.ops, ch.entries);
        if (!r.ok) {
          const cls = wireFailKind(r);
          if (cls === "toobig" && take > 1) {
            size = Math.max(1, Math.floor(take / 2));
            wst.chunk = size;
            shrankTo = size;
            continue;                       // the SAME operations, in halves
          }
          if (cls === "student" || cls === "toobig") {
            /* PER-STUDENT, AND THE RUN GOES ON. Recorded against the person so
               the next planner run takes his lines off the queue instead of
               spending a refused call on them every five seconds. */
            const owed = good.length - i;
            if (!holdStudent(b, cls === "toobig" ? "timeout" : "student_oid", r.why, owed)) {
              unrecorded += 1;
            }
            heldStudents += 1;
            seen.push({ rid: ledStuRid(b.oid), uid: "(the whole student)", who: b.who,
              date: "", verdict: cls === "toobig" ? "(timed out)" : "(refused: student)",
              say: r.why, note: "", cls: "unwritten", waRow: null, unrecorded: false });
            break;                          // this student only
          }
          wst.kind = r.kind;
          wst.why = r.why;
          wst.since = wst.since && wst.kind ? wst.since : nowHM();
          wst.tries += 1;
          stopped = r.why;
          break;
        }
        i += take;
        sent += ch.ops.length;
        r.verdicts.forEach((v, i2) => {
          const f = foldOne(ch.entries[i2], v);
          if (["created", "moved", "updated", "removed"].indexOf(f.verdict) >= 0) wrote += 1;
          /* THE NARROW RACE, SURFACED RATHER THAN SWALLOWED. The lock was open
             when this push started and it is the wall that stops a locked device
             writing at all — but a device locked WHILE a call is in flight would
             have its ledger write refused by upsert(), and a Wings Ahead row
             this store cannot remember is precisely the failure the lock check
             above exists to prevent. It cannot pass silently. */
          if (f.unrecorded) unrecorded += 1;
          seen.push({ rid: f.rid, uid: f.uid, who: ch.entries[i2].line.who,
            date: ch.entries[i2].line.date, verdict: f.verdict, say: f.say, note: f.note,
            cls: f.cls, waRow: f.waRow, unrecorded: f.unrecorded });
        });
      }
    }
    if (!stopped) { wst.kind = ""; wst.why = ""; wst.since = ""; wst.tries = 0; wst.at = nowHM(); }
    wst.busy = false;
    ui.verdicts = seen;
    ui.pushBad = !!stopped || !!unrecorded || seen.some((s) => s.cls !== "agree");
    ui.pushMsg = (stopped
      ? sent + " operation" + (sent === 1 ? "" : "s") + " answered, then Wings Ahead stopped answering: "
        + stopped
      : wrote + " write" + (wrote === 1 ? "" : "s") + " landed in Wings Ahead of " + sent
        + " operation" + (sent === 1 ? "" : "s") + " sent"
        + (seen.length > wrote ? " · " + (seen.length - wrote) + " answered with a verdict to settle" : "")
        + ".")
      /* THE THREE THINGS THAT DID NOT STOP THE RUN, each said in its own words */
      + (heldStudents ? "  ⚠ " + heldStudents + " student" + (heldStudents === 1 ? " is" : "s are")
        + " HELD: Wings Ahead refused the whole call for " + (heldStudents === 1 ? "him" : "them")
        + " and every other student in this run crossed. The Held table below carries the server's own "
        + "sentence and the way back." : "")
      + (refusedLocally ? "  ⚠ " + refusedLocally + " line" + (refusedLocally === 1 ? " was" : "s were")
        + " NOT SENT: this store's memory of the row is malformed and a claim it cannot make is a claim "
        + "it does not make. Nothing crossed for " + (refusedLocally === 1 ? "it" : "them") + "." : "")
      + (shrankTo ? "  ⓘ Wings Ahead could not finish a chunk of that size inside its three-second "
        + "statement budget, so the chunk halved to " + shrankTo + " and the same operations went again — "
        + "nothing was written by the call that timed out, and nothing was sent twice." : "")
      + (unrecorded ? "  ⚠ " + unrecorded + " answer" + (unrecorded === 1 ? "" : "s")
        + " could NOT be written to the push ledger — the edit lock closed while the call was in flight. "
        + "Wings Ahead has those rows and this store does not remember them: unlock ✎ Editor mode and "
        + "⟳ Refresh, then settle them from the report." : "");
    plan();
    chipPaint();
    if (how !== "auto") repaint(); else { chipPaint(); repaint(); }
    if (how !== "auto" && S().toast) {
      const part = heldStudents + refusedLocally;
      S().toast(stopped ? "Bridge — the push did not complete."
        : part ? "Bridge — " + wrote + " written · " + part + " waiting on you."
          : "Bridge — " + wrote + " written to Wings Ahead.",
      stopped || part ? "bad" : "good");
    }
    /* the backoff re-arms itself; a revoked credential deliberately does not */
    if (stopped && wst.kind !== "revoked") armAuto();
    return { ok: !stopped, wrote, sent, held: heldStudents, notSent: refusedLocally, chunk: wst.chunk };
  }
  const nowHM = () => {
    const d = new Date();
    return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  };

  async function startPush(el) {
    if (!editOn()) { refuseWrite("push flights to Wings Ahead"); return; }
    const p = plan();
    const list = arr(p && p.queued);
    if (!list.length) {
      ui.pushMsg = "nothing is owed — every qualifying flight in the training log already stands in "
        + "Wings Ahead exactly as it is here.";
      ui.pushBad = false;
      render(el);
      return;
    }
    const creates = list.filter((e) => e.kind === "create").length;
    /* the same question the LINE asks, asked once for the whole run — because a
       queue of 1 900 lines draws only its first 200, and a warning a reader
       cannot reach is not one (P45-FDMSc). Counted over the WHOLE list. */
    const overStanding = ui.parsed ? list.filter((e) => standingBeside(e).length).length : 0;
    /* THE 13η LAW MEETS A FIRST PUSH. The numbered dialog exists so that no line
       crosses unseen, and it lists every one — up to the point where «every one»
       stops being something a person can read: the first push on a real store
       owes some two thousand flights. Above the cap the dialog says how many it
       did not draw, in the same breath as the total it is about to send, because
       a dialog that quietly showed 200 of 1 900 would be the one lie this whole
       pane is built against. The queue table on the pane lists them too. */
    const drawn = list.slice(0, DRAW_MAX);
    const go = await confirmPop({
      ico: "✈",
      title: list.length === 1 ? "Push this flight to Wings Ahead?"
        : "Push " + list.length + " flights to Wings Ahead?",
      go: "✈ Push " + list.length + " line" + (list.length === 1 ? "" : "s"),
      lead: (list.length > DRAW_MAX
        ? "<b>" + list.length + " flights</b> are going and the first <b>" + DRAW_MAX
          + "</b> are listed below — the rest are in the queue table on the pane behind this dialog. "
        : "Every line is listed below with <b>exactly what crosses the wire</b> and what Wings Ahead "
          + "will do with it. ")
        + "This writes the <b>flight rows of the students' Wings Ahead records</b> and "
        + "nothing else: no grade, no duration, no NG, no ground section, and never a row a human typed.",
      items: drawn.map(wireLine).join(""),
      foot: "<b>" + creates + "</b> new · <b>" + (list.length - creates) + "</b> changed"
        + (list.length > DRAW_MAX ? " · <b>" + (list.length - DRAW_MAX) + "</b> not drawn above" : "")
        + (overStanding ? " · <b class=\"sch-warn\">⚠ " + overStanding + "</b> of them would CREATE a row "
          + "where the read on screen already shows a bridge-written row standing for that flight, with "
          + "no ledger row of this store answering for it — each one is marked on its own line above, and "
          + "each one would leave <b>two</b> rows for one FDMS event" : "")
        /* SILENCE IS «NOT KNOWN», AND IT SAYS SO (P45-FDMSd · B's judgement).
           The standing-row warning is drawn from the read on screen; with no
           read on screen it is not drawn at ALL, and an unmarked line then
           looks exactly like a line that was checked and found clear. One
           sentence, once, in the foot — never a mark on every line, because a
           first drain is two thousand creates and a warning on all of them is
           a warning on none. */
        + (!ui.parsed && creates ? " · <b class=\"sch-warn\">no read of Wings Ahead is on screen</b>, so "
          + "not one of these creates has been checked against what is standing over there — an unmarked "
          + "line here means <b>not known</b>, not «clear»" : "")
        + ". Each write lands "
        + "in the <b>Bridge change log</b> below with what Wings Ahead held before it, and <b>↺ Undo</b> "
        + "takes exactly that write back. A row Wings Ahead refuses is a <b>report line</b> — nothing is "
        + "written and nothing is lost.",
    });
    if (!go) { ui.pushMsg = "cancelled — nothing crossed."; ui.pushBad = false; render(el); return; }
    await runPush("now", list);
  }

  /* REMOVALS AND UNDOS — they never cross by themselves, and each one names its
     reason on the line the developer confirms (design C.2 row 3). */
  async function startRemovals(el, rids) {
    if (!editOn()) { refuseWrite("remove a flight row from Wings Ahead"); return; }
    const p = plan();
    const want = arr(rids);
    const rems = arr(p && p.removals).filter((r) => !want.length || want.indexOf(r.rid) >= 0);
    const comps = pendingCompensations().filter((c) => !want.length || want.indexOf(c.line.rid) >= 0);
    const list = rems.concat(comps);
    if (!list.length) {
      ui.pushMsg = "nothing pending — the list was rebuilt and this line is no longer owed.";
      ui.pushBad = false;
      render(el);
      return;
    }
    /* ── HOW MUCH FRICTION A MASS REMOVAL DESERVES (P45-FDMSd · finding A) ────
       THE JUDGEMENT, RECORDED. The house has a pattern for a dangerous act
       (Round 20: ⭱ Import and ⟲ Reset live behind «⋯», demand the edit lock,
       and ask for a TYPED WORD), and «␥ Confirm all N» destroying N rows on
       somebody else's database in one click is unmistakably that class. What it
       gets is the middle term of the three, and each is argued:
         · NOT the «⋯» burial. Import and Reset are permanently on screen beside
           harmless controls, which is what made burying them worth it. Pending
           removals is a panel that does not exist unless something is pending,
           and its whole purpose is confirming; burying the confirm button of a
           confirmation panel is theatre, and it would push the developer onto
           the per-line ✔ Confirm — the same destruction, one row at a time.
         · THE EDIT LOCK: already demanded, first line of this function.
         · THE TYPED VALUE, and it is the COUNT rather than a fixed word. The
           whole failure mode of finding A is a developer who did not take in
           that the number said 148. A fixed «REMOVE» is a reflex you can type
           without reading; the count cannot be typed without having read the
           one fact that matters. It is asked ABOVE A THRESHOLD only, because a
           gate that fires on the ordinary case is a gate that teaches people to
           type through it: below it the numbered dialog already lists every
           line with the fact that proves it, and that is a list a person reads.
       The individually-confirmed removal is untouched — deletion was never
       accidental line by line, and the verifier's own walk-through confirms it
       one row at a time before anything went wrong. */
    const mass = list.length > RM_TYPE_AT;
    const go = await confirmPop({
      ico: "␥",
      title: list.length === 1 ? "Send this removal to Wings Ahead?"
        : "Send " + list.length + " pending acts to Wings Ahead?",
      go: "␥ Send " + list.length + " act" + (list.length === 1 ? "" : "s"),
      word: mass ? String(list.length) : "",
      lead: (mass ? "<b class=\"sch-warn\">This destroys " + list.length + " flight rows on students' "
        + "Wings Ahead records.</b> Every one of them names, on its own line below, the fact that owes "
        + "it: an FDMS event <b>deleted</b> from the training log, an event <b>edited out of "
        + "qualifying</b>, or an <b>↺ Undo</b> you took. A row whose event is standing and unchanged is "
        + "never here — a name this run could not resolve (a roster, an object id, a syllabus node) is "
        + "<b>held</b>, not removed. Read the list, then type the count to send it. " : "")
        + "A removal <b>takes a flight row off a student's Wings Ahead record</b> and lays a "
        + "<b>tombstone</b> on the identity, which is what stops the queue re-creating it one debounce "
        + "later. It removes only rows <b>the bridge itself wrote</b>: a row a student corrected is his, "
        + "and Wings Ahead refuses to let this lane touch it.",
      items: list.slice(0, DRAW_MAX).map(wireLine).join(""),
      foot: (list.length > DRAW_MAX ? "<b>" + (list.length - DRAW_MAX) + "</b> of these are not drawn "
        + "above — the first <b>" + DRAW_MAX + "</b> are, and all <b>" + list.length + "</b> go. "
        + "The Pending removals table on the pane behind this dialog lists every one. " : "")
        + "Each act lands in the <b>Bridge change log</b>, and <b>↺ Undo</b> puts the identity back in "
        + "the pending state — bringing the row back is then a deliberate re-push that clears the "
        + "tombstone. Nothing in the FDMS training log is touched by any of this.",
    });
    if (!go) { ui.pushMsg = "cancelled — nothing crossed."; ui.pushBad = false; render(el); return; }
    await runPush("now", list);
  }

  /* the compensating upserts a held «compensate» identity owes — derived from
     the change log, exactly like everything else in this lane */
  function pendingCompensations() {
    return arr(S() ? S().get("bridgePush") : []).filter((L) => isObj(L) && trim(L.hold) === "compensate")
      .map((L) => {
        const c = compensationOf(L);
        if (!c) return null;
        return { kind: "change", line: c.line, op: c.op,
          why: "↺ an undo: Wings Ahead goes back to what it held before that push" };
      }).filter(Boolean);
  }

  /* A HELD IDENTITY IS CLEARED BY HAND — that is the whole point of holding it.
     Three acts, and none of them writes to Wings Ahead by itself:
       ⟳ clear    the developer has read the refusal and lets the queue try again
       ↩ re-push  a removed identity comes back, carrying clear_tombstone
       ✕ forget   stop tracking this identity here (the Wings Ahead row stays;
                  the next cross-check shows it as this bridge's own echo)     */
  async function startHold(el, rid, act) {
    /* every act that reaches here WRITES this store's ledger. The one act a
       held line offers that does not — ⟳ Read Wings Ahead — wears [data-brg]
       and goes to the pane's own pull, so it never arrives at this function. */
    if (!editOn()) { refuseWrite("change what the bridge is tracking"); return; }
    const L = ledgerRow(rid);
    if (!L) { ui.pushMsg = "that row identity is no longer in the ledger."; ui.pushBad = true; render(el); return; }
    /* ── THE STUDENT-LEVEL HOLD — one act, and it deletes the hold itself ────
       There is nothing to keep: the row exists only to say «Wings Ahead refused
       this person», and once the developer has read it and decided to try again
       the record has no further meaning. Left behind with an empty `hold` it
       would be a dead tuple in a collection whose every other row is a real
       identity. */
    if (isStuHold(L)) {
      if (act !== "clearstu" && act !== "clear") {
        ui.pushMsg = "that hold is about a PERSON, not a row — the only act it takes is clearing it.";
        ui.pushBad = true;
        render(el);
        return;
      }
      S().remove("bridgePush", rid);
      ui.pushMsg = "the hold on that student is cleared — his flights are back in the queue, and the next "
        + "push is still an explicit act.";
      ui.pushBad = false;
      plan();
      render(el);
      return;
    }
    /* ── THE TWO RECONCILING ACTS (verify item 5) ────────────────────────────
       Both are offered only by heldActs(), and only in the state the read of
       Wings Ahead put them in — but neither trusts that: the look is taken
       again HERE, against the pull that is on screen at the moment of the
       click, because the developer may have read a different record since. */
    if (act === "adopt" || act === "recreate") {
      const look = missingLook(L, ui.parsed, S().get("bridgePush"));
      if (!look.have || !look.record) {
        ui.pushMsg = "not settled: " + look.why;
        ui.pushBad = true;
        render(el);
        return;
      }
      if (act === "adopt") {
        if (!look.adopt) { ui.pushMsg = "not adopted: " + look.why; ui.pushBad = true; render(el); return; }
        const before = isObj(L.sent) ? L.sent : null;
        const after = look.adopt.row;
        const go = await confirmPop({
          ico: "⇄", title: "Re-anchor this identity to the row standing in Wings Ahead?",
          go: "⇄ Adopt that row",
          lead: "This writes <b>this store's push ledger and nothing else</b>. Wings Ahead is not called: "
            + "no row is created, moved or removed by adopting, and the row keeps every fact it has now. "
            + "What changes is <b>which row this identity answers for</b> — after it, the queue plans the "
            + "ordinary correction against that row's real handle instead of creating a second one.",
          items: `<li><b>${esc(trim(L.student))}</b> · <span class="sch-mono">${esc(trim(L.uid))}</span>
            <div>${esc(look.why)}</div>
            <div class="brg-fchgs">${fchg(rowFields(before, after), false)}</div>
            <div class="brg-eff">→ ${esc(waHandleOf(trim(L.group), after))}</div>
            <div class="sch-nd sch-mono">${esc(rid)}</div></li>`,
          foot: "The change log keeps what the ledger remembered before this act, so the two versions of "
            + "the memory stay readable. Nothing crosses the wire until you push.",
        });
        if (!go) { ui.pushMsg = "cancelled — the ledger is untouched."; ui.pushBad = false; render(el); return; }
        ledgerPut({ rid, sent: after, state: "pushed", hold: "", clearTomb: false,
          note: "adopted: this identity was re-anchored to the row standing at "
            + look.adopt.handle + " after Wings Ahead answered «missing» at the old handle",
          at: new Date().toISOString() });
        logAct({ act: "push-adopt", rid, oid: trim(L.oid), group: trim(L.group), uid: trim(L.uid),
          ord: posInt(L.ord, 1), seq: posInt(L.seq, 1), student: trim(L.student), evId: trim(L.evId),
          what: "re-anchored " + rid + " to the Wings Ahead row standing at " + look.adopt.handle,
          fields: rowFields(before, after),
          effect: "nothing crossed the wire — only what this store remembers about the row changed",
          waHandle: waHandleOf(trim(L.group), after), waBefore: before, waAfter: after,
          verdict: trim(L.verdict) });
        ui.pushMsg = "adopted — this identity now answers for the row at " + look.adopt.handle
          + ". Nothing crossed the wire.";
        ui.pushBad = false;
        plan();
        render(el);
        return;
      }
      if (look.rows.length) {
        ui.pushMsg = "not re-created: " + look.why;
        ui.pushBad = true;
        render(el);
        return;
      }
      /* THE FRESHNESS WALL, ASKED AGAIN AT THE CLICK (P45-FDMSc). heldActs only
         decides which button is DRAWN; this is the one that decides whether the
         act happens, and it is asked against the read that is on screen at the
         moment of the click — which may be a different one, and may be older. */
      if (!look.recreate) {
        ui.pushMsg = "not re-created: " + look.stale;
        ui.pushBad = true;
        render(el);
        return;
      }
      const go = await confirmPop({
        ico: "⊕", title: "Forget the old row and create a NEW one on the next push?",
        go: "⊕ Arm the re-creation",
        lead: "The read of Wings Ahead on screen shows <b>no row the bridge wrote</b> anywhere on that "
          + "record for this flight, so there is nothing left to move or to correct. This makes the next "
          + "push a <b>create</b>: it forgets the row this store remembers writing, and the operation will "
          + "carry <b>no claim about what stands there</b>. <b>It writes nothing by itself</b> — the "
          + "crossing is still ✈ Push now, with its own numbered dialog.",
        items: `<li><b>${esc(trim(L.student))}</b> · <span class="sch-mono">${esc(trim(L.uid))}</span>
          <div>${esc(look.why)}</div>
          <div class="brg-fchgs">${fchg(rowFields(isObj(L.sent) ? L.sent : null, null), false)}</div>
          <div class="sch-nd sch-mono">${esc(rid)}</div></li>`,
        /* THE FOOT USED TO GIVE ADVICE AND NO LONGER GIVES IT — because the
           advice («if that read is stale, read Wings Ahead again first») was
           advice the developer could not act on: it pointed at ONE door, the
           live one, which on a real store answers 57014 after the first drain.
           The staleness is now a WALL and not a warning, so what the foot has
           to say is what was PROVEN before the button appeared. */
        foot: "This act is offered only because the read is <b>newer than the refusal it explains</b>"
          + (look.how === "audit"
            ? " — Wings Ahead's own audit trail carries this refusal inside this very read, so the two "
              + "instants are on one clock"
            : " — the payload says Wings Ahead generated it after this line was refused")
          + ". On a read older than the refusal the button is not drawn at all: a create against a row "
          + "the admin merely MOVED is exactly the duplicate this dialog exists to keep out.",
      });
      if (!go) { ui.pushMsg = "cancelled — the ledger is untouched."; ui.pushBad = false; render(el); return; }
      const had = isObj(L.sent) ? L.sent : null;
      ledgerPut({ rid, sent: null, state: "", hold: "", clearTomb: false,
        note: "a deliberate re-creation was armed: a read of Wings Ahead showed no row the bridge wrote "
          + "for this flight anywhere on the record, so the next push creates one",
        at: new Date().toISOString() });
      logAct({ act: "push-recreate", rid, oid: trim(L.oid), group: trim(L.group), uid: trim(L.uid),
        ord: posInt(L.ord, 1), seq: posInt(L.seq, 1), student: trim(L.student), evId: trim(L.evId),
        what: "armed a deliberate re-creation of " + rid + " — the remembered row was confirmed gone",
        fields: rowFields(had, null),
        effect: "nothing crossed the wire — the next ✈ Push now sends a create, with its own dialog",
        waHandle: waHandleOf(trim(L.group), had), waBefore: had, waAfter: null, verdict: trim(L.verdict) });
      ui.pushMsg = "armed — the next push creates that row. Nothing crossed the wire.";
      ui.pushBad = false;
      plan();
      render(el);
      return;
    }
    if (act === "clear" && LOOK_HOLDS.indexOf(trim(L.hold)) >= 0) {
      /* the belt to heldActs' braces: a hold whose exit is a reconciliation is
         never cleared into a blind create, whatever asks for it. */
      ui.pushMsg = "that hold is not cleared, it is reconciled: read Wings Ahead and then adopt the row "
        + "where it stands, or — if the read shows no such row anywhere — re-create it deliberately.";
      ui.pushBad = true;
      render(el);
      return;
    }
    if (act === "forget") {
      /* ── WHAT ✕ STOP TRACKING ACTUALLY DOES NEXT (P45-FDMSc, verify item 5b)
         ───────────────────────────────────────────────────────────────────────
         THE FINDING. Its dialog said two true things — «it removes nothing from
         Wings Ahead» and «the next cross-check will show that row as an
         fdms-stamped row this store's ledger does not know» — and left out the
         one that matters: forgetting the ledger row forgets the EVENT's memory
         too, so the very next planner run puts the same FDMS event back in the
         queue as a CREATE with `prev: null`. The verifier clicked it on a hold
         where a FRESH read was showing the row standing, pushed once, and the
         record carried two rows again. Nothing in either dialog mentioned it.

         SAY IT, DO NOT WITHHOLD IT — and the judgement is recorded here because
         it went the other way in the drafting. Withholding the act on a hold
         where the read shows a standing row would be the tidier rule and it
         would be wrong: that is EXACTLY the state the act exists for. Its own
         tooltip says «use it when the row is somebody else's to own», and the
         only way a developer ever learns that a standing row is not this
         event's is by reading a record that shows one standing. A wall there
         would leave him with ⇄ Adopt — which would claim a row that is not his
         — or with nothing. So the act stays, and it stops lying: the sentence
         below names the re-queue, and names the row that will be standing
         beside the new one, by its Wings Ahead handle.

         AND THE SENTENCE IS NOT THE ONLY GUARD. A create built over a standing
         bridge-written row is named again in the PUSH dialog (§ wireLine), for
         every create and not only the ones a forget produced — because the
         re-queue can also be reached by an ⭱ Import that drops a ledger row, or
         by a Reset, and a warning that only fires on one route is a warning
         with a hole in it.

         ── AND THEN THE VERIFIER FOUND THE HOLE IN *THAT* (P45-FDMSd · B) ─────
         THE FINDING. `standingBeside()` (which draws the push-dialog warning)
         and this dialog's own standing-row warning both call `missingLook` on
         the SAME `ui.parsed`. They are not two independent guards; they are ONE
         READ CONSULTED TWICE. On a STALE hold — the exact state the freshness
         test has just flagged as untrustworthy — the read shows nothing, so
         BOTH go quiet, and the verifier walked it end to end to two fdms rows
         for one FDMS event with the standing row named nowhere.
         WORSE, THE FOOT PROMISED THE SECOND GUARD BY NAME: «The push dialog
         names it again on the line itself, so the create cannot cross without
         the standing row being said out loud one more time.» On a stale read it
         does not — which made that sentence false precisely in the state the
         round existed to handle: the house's own «comment that lied», moved out
         of a code comment and into the UI, where a developer acts on it.

         THE CURE IS THE ONE THIS FUNCTION ALREADY HELD IN ITS HAND. `look`
         carries `stale` — the sentence, with both instants to the second and
         both refresh routes — and this dialog was not printing it. It prints it
         now, together with the thing the silence was hiding: that on THIS read
         the standing-row question COULD NOT BE ASKED, so a blank where a
         warning would be means «not known», never «checked and clear». And the
         foot no longer promises a second guard it cannot deliver: it says what
         the push dialog will actually be able to do, which on a stale read is
         nothing, BECAUSE IT READS THE SAME PAYLOAD.

         WHY THE ACT IS STILL NOT WALLED HERE, on the same reasoning as above:
         ✕ Stop tracking is the ONLY exit a stale `missing` hold has that is not
         «read again» — ⊕ is withheld and ⇄ Adopt has nothing to adopt — and a
         developer who has genuinely established that the row over there is
         somebody else's must be able to say so. It stops lying instead. */
      const look = LOOK_HOLDS.indexOf(trim(L.hold)) >= 0
        ? missingLook(L, ui.parsed, S().get("bridgePush")) : null;
      const standing = look && look.free.length ? look.free : [];
      /* the read is on screen and it CANNOT answer for this identity: either it
         is older than the refusal this hold came from, or there is no read at
         all. Both make the silence below meaningless, and both are said. */
      const blind = look && !look.fresh && !standing.length;
      const noRead = !!look && !look.have;
      const go = await confirmPop({
        ico: "✕", title: "Stop tracking this identity?", go: "✕ Stop tracking",
        lead: "This forgets the link between an FDMS event and the Wings Ahead row the bridge wrote for "
          + "it. <b>It removes nothing from Wings Ahead</b> — the row stays exactly where it is — and it "
          + "removes nothing from the FDMS training log either. <b>The FDMS event stays</b>, and an event "
          + "this store owes Wings Ahead with no ledger row beside it is an event the queue owes again: "
          + "<b>this flight returns to the queue as a NEW row</b>, and the next ✈ Push now would "
          + "<b>create</b> it, carrying no claim about what stands over there.",
        items: `<li><span class="sch-mono">${esc(rid)}</span><div>${esc(trim(L.note))}</div>
          <div class="brg-eff">→ the row stays in Wings Ahead, unowned by this store</div>
          <div class="brg-eff">→ this flight goes back in the queue as a <b>create</b></div>
          ${standing.length ? `<div class="brg-eff is-c">⚠ a row the bridge wrote for this flight is
            <b>standing on that record right now</b>, at
            ${standing.map((x) => `<span class="sch-mono">${esc(x.handle)}</span>`).join(" · ")} —
            pushing the create would leave <b>two</b> rows for one FDMS event. If that row is this
            event's, <b>⇄ Adopt</b> it instead; if it is somebody else's to own, this act is the right
            one and the second row is deliberate.</div>` : ""}
          ${blind ? `<div class="brg-eff is-c">⚠ <b>THIS DIALOG CANNOT TELL YOU WHETHER A ROW IS
            STANDING THERE.</b> ${noRead ? "There is no read of Wings Ahead in memory on this tab at all."
    : esc(look.stale)} So the line above is <b>missing, not clear</b>: a bridge-written row for this
            flight may be standing on that record this second — the admin moves a date and the handle
            moves with it — and forgetting this identity would put the same FDMS event back in the queue
            as a create <b>on top of it</b>. That is the second row this whole hold exists to keep off
            the record. <b>⟳ Read Wings Ahead — or 📄 File — first, and this dialog will know.</b>
            ${noRead ? "<br>" + esc(REFRESH2) + "." : ""}</div>` : ""}
          </li>`,
        /* THE FOOT NO LONGER PROMISES A GUARD IT CANNOT DELIVER (P45-FDMSd · B).
           It used to say the push dialog would name the standing row again «so
           the create cannot cross without it being said out loud one more time»
           — a promise that is false exactly when it matters, because the push
           dialog asks the SAME read this dialog just asked. What it says now is
           what is true: one read, consulted twice, and on a read that cannot
           answer both are silent together. */
        foot: "The next cross-check will show that row as an <b>fdms-stamped row this store's ledger does "
          + "not know</b> — an identity note, never a proposal back into FDMS. "
          + (blind
            ? "<b class=\"sch-warn\">And do not wait for the push dialog to catch this:</b> its "
              + "standing-row warning reads the <b>same payload</b> this dialog just read, so on a read "
              + "that cannot answer it will be <b>silent too</b>. Two guards that consult one read are "
              + "one guard consulted twice — the read is the thing to fix, not the dialog."
            : "The push dialog asks the same question again on the line itself, against the read on "
              + "screen at that moment — so if that read still answers, the create cannot cross without "
              + "the standing row being said out loud one more time."),
      });
      if (!go) return;
      S().remove("bridgePush", rid);
      logAct({ act: "push-forget", rid, oid: trim(L.oid), group: trim(L.group), uid: trim(L.uid),
        ord: posInt(L.ord, 1), seq: posInt(L.seq, 1), student: trim(L.student), evId: trim(L.evId),
        what: "stopped tracking " + rid + " — the Wings Ahead row was not touched",
        fields: rowFields(isObj(L.sent) ? L.sent : null, null),
        effect: "nothing crossed the wire", waHandle: waHandleOf(trim(L.group), L.sent),
        waBefore: isObj(L.sent) ? L.sent : null, waAfter: null, verdict: trim(L.verdict) });
    } else if (act === "repush") {
      ledgerPut({ rid, state: "", sent: null, hold: "", clearTomb: true,
        note: "cleared by hand — the next push re-creates this row and clears the tombstone Wings Ahead "
          + "is holding on it", at: new Date().toISOString() });
    } else {
      ledgerPut({ rid, hold: "", note: "cleared by hand — the queue may try this identity again",
        at: new Date().toISOString() });
    }
    plan();
    render(el);
  }

  /* ── THE LIVE PULL — the same wa-export-v1, a different carrier ─────────── */
  async function doPull(el) {
    if (!bridgeConfigured()) {
      ui.error = "the Wings Ahead bridge is not configured on this device — open ⚙ and paste the project "
        + "URL, the anon key and the bridge token.";
      render(el);
      return;
    }
    ui.pulling = true;
    ui.error = "";
    render(el);
    const r = await wirePull();
    ui.pulling = false;
    if (!r.ok) {
      if (r.kind === "revoked") { wst.kind = "revoked"; wst.why = r.why; wst.since = nowHM(); }
      ui.error = r.why;
      chipPaint();
      render(el);
      return;
    }
    clearAll();
    ui.src = "live";
    ui.parsed = r.parsed;
    ui.fileName = "";
    recompute();
    plan();
    chipPaint();
    render(el);
  }

  /* ══ ⚙ THE BRIDGE SETTINGS — CUSTODY, WRITTEN AS A DIALOG (design E.1) ════
     Four values in the SYNCED store config under one key, `config.bridge`:
         { url, anon, token, live, configured_at }
     WHY SYNCED, AND WHAT THAT COSTS, said in the dialog and not only here: the
     config rides the fdms-data snapshot to the owner's other devices —
     ciphertext whenever the sync passphrase is armed, plaintext in a private
     repo when it is not. The blast radius of the credential is the SCOPED
     bridge role: it reads the roster and the records and writes flight rows the
     bridge itself owns. It cannot read one login token, cannot delete a person,
     cannot touch proposals or settings. Revoking it in Wings Ahead closes every
     lane at once, which is the whole reason the role is scoped.
     THE TOKEN IS NEVER RENDERED BACK. The field is type=password and always
     opens EMPTY; the status line says «set · 28/08» and nothing more. What is
     not drawn cannot be read off a shoulder, copied out of a DOM dump, or
     screenshotted into a chat. «Forget» wipes it store-wide — it syncs away
     too, and the dialog says so before it does it. */
  let cfgBusy = false;
  function settingsPop() {
    return new Promise((resolve) => {
      const doc = W.document;
      if (cfgBusy || !doc || !doc.body) { resolve(false); return; }
      cfgBusy = true;
      const c = bridgeCfg() || {};
      const hasTok = !!trim(c.token);
      const veil = doc.createElement("div");
      veil.className = "ed-pop brg-pop";
      veil.innerHTML = `<div class="ed-box brg-box brg-cfgbox" role="dialog" aria-modal="true"
          aria-label="Wings Ahead bridge settings">
        <div class="ed-ico" aria-hidden="true">⚚</div>
        <h3>Wings Ahead bridge</h3>
        <p class="hint">Two doors, both <b>POST</b>, the credential inside the request body:
          <code>rpc/bridge_pull</code> reads the export, <code>rpc/bridge_push</code> writes the flight
          rows this bridge owns. The token is minted <b>once</b> in Wings Ahead (Admin → People → Bridge →
          Mint) and shown there exactly once — the database keeps only a digest and cannot echo it back.</p>
        <label class="brg-cfgl">Project URL</label>
        <input class="brg-cfgin" id="brg-url" placeholder="https://&lt;project&gt;.supabase.co"
          value="${esc(trim(c.url))}" autocomplete="off" spellcheck="false">
        <label class="brg-cfgl">Anon key <span class="sch-nd">(a public value — it travels in backups)</span></label>
        <input class="brg-cfgin" id="brg-anon" value="${esc(trim(c.anon))}" autocomplete="off" spellcheck="false">
        <label class="brg-cfgl">Bridge token
          <span class="sch-nd">${hasTok ? "· set " + esc(dmy(trim(c.configured_at))) : "· not set"}</span></label>
        <input class="brg-cfgin" id="brg-tok" type="password" autocomplete="new-password"
          placeholder="${hasTok ? "•••••••• — leave empty to keep the one already stored" : "paste it once; it is never shown again"}">
        <label class="brg-cfgchk"><input type="checkbox" id="brg-live"${c.live ? " checked" : ""}>
          <span><b>Live</b> — a flight typed in the Training log crosses by itself, ${AUTO_MS / 1000} s
          after the last change. With this off, nothing ever leaves except from <b>✈ Push now</b>.</span></label>
        <p class="hint"><b>Where this token lives, and what that means.</b> It is stored in this browser and
          it <b>syncs</b> to your other devices with the rest of the store — ciphertext whenever the sync
          passphrase is armed, plaintext in your private repo when it is not. Arming the passphrase is the
          difference, and it is worth arming: with this key the <code>fdms-data</code> repo stops being a
          copy of FDMS and becomes a <b>live read of Wings Ahead and a write lane into it</b>. What the
          credential can do is bounded on purpose — it reads the roster and the records and writes the
          flight rows the bridge itself owns; it cannot read one login token, delete a person, or touch
          proposals, settings or evaluations. <b>⭳ Export strips it</b> and an <b>⭱ Import never restores
          it</b>: the backup file wanders, so the credential does not travel in it.</p>
        <p class="hint" id="brg-cfgst"></p>
        <div class="ed-row">
          <button type="button" class="sch-tbtn primary" data-c="save">✔ Save</button>
          <button type="button" class="sch-tbtn" data-c="test">⟳ Test</button>
          ${hasTok ? `<button type="button" class="sch-tbtn danger" data-c="forget">✕ Forget the token</button>` : ""}
          <button type="button" class="sch-tbtn" data-c="cancel">↩ Close</button>
        </div>
      </div>`;
      let finished = false;
      const done = (v) => {
        if (finished) return;
        finished = true;
        doc.removeEventListener("keydown", onKey, true);
        cfgBusy = false;
        if (veil.parentNode) veil.remove();
        resolve(v);
      };
      function onKey(e) {
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); done(false); }
      }
      const st = (m) => { const n = veil.querySelector("#brg-cfgst"); if (n) n.textContent = m; };
      const val = (id) => { const n = veil.querySelector(id); return n ? trim(n.value) : ""; };
      function save() {
        const tok = val("#brg-tok");
        const patch = { url: val("#brg-url"), anon: val("#brg-anon"),
          live: !!(veil.querySelector("#brg-live") || {}).checked,
          configured_at: trim(c.configured_at) || todayOf() };
        /* AN EMPTY FIELD MEANS «KEEP», NEVER «CLEAR». The field is never
           rendered back, so an empty box is the normal state of a configured
           bridge — reading it as a clear would delete the credential every time
           the developer flipped the Live switch. Clearing is «Forget», which
           says what it does and asks first. */
        patch.token = tok || trim(c.token);
        if (tok) patch.configured_at = todayOf();
        if (!S().setConfig({ bridge: patch })) { st("the edit lock refused the write"); return false; }
        return true;
      }
      veil.addEventListener("click", async (e) => {
        if (e.target === veil || e.target.closest('[data-c="cancel"]')) { done(false); return; }
        if (e.target.closest('[data-c="save"]')) { if (save()) done(true); return; }
        if (e.target.closest('[data-c="test"]')) {
          if (!save()) return;
          st("testing…");
          const r = await wirePull();
          if (!r.ok) { st("✕ " + r.why); return; }
          st("✓ connected — " + r.parsed.people.length + " people · " + r.parsed.records.length
            + " records · " + r.parsed.tombstones.length + " tombstone"
            + (r.parsed.tombstones.length === 1 ? "" : "s") + " (export-equivalent read)");
          return;
        }
        if (e.target.closest('[data-c="forget"]')) {
          const cur = bridgeCfg() || {};
          const next = Object.assign({}, cur);
          delete next.token;
          next.live = false;
          if (!S().setConfig({ bridge: next })) { st("the edit lock refused the write"); return; }
          st("the token is gone from this store — and it syncs away from your other devices at the next "
            + "push. Mint a new one in Wings Ahead when you need the lane again.");
          wst.kind = ""; wst.why = "";
          done(true);
        }
      });
      doc.addEventListener("keydown", onKey, true);
      doc.body.appendChild(veil);
      const f = veil.querySelector("#brg-url");
      if (f) setTimeout(() => f.focus(), 50);
    });
  }

  async function openSettings(el) {
    if (!editOn()) { refuseWrite("change the Wings Ahead bridge settings"); return; }
    await settingsPop();
    plan();
    chipPaint();
    render(el);
  }

  /* ══ THE PUSH PANEL — what this store owes Wings Ahead, right now ═════════ */
  function pushPanel() {
    const p = ui.plan || plan();
    if (!p) return "";
    const cfg = bridgeCfg() || {};
    const on = bridgeConfigured();
    const c = p.counts;
    const state = wst.kind === "revoked"
      ? `<div class="sch-consqban is-pd"><b>The bridge credential is not accepted</b> — ${esc(wst.why)}</div>`
      : wst.kind
        ? `<div class="sch-consqban is-pd"><b>${c.queued} not pushed</b> — ${esc(wst.why)}
           <br>Nothing is lost: what this store owes is <b>recomputed</b>, never stored, so it stays owed
           until it lands.</div>`
        : "";
    return `
      <section class="panel sch-panel">
        <div class="sch-h"><h2>Push to Wings Ahead
          <span class="count">${on ? (cfg.live ? "live · " + (AUTO_MS / 1000) + " s debounce" : "manual") : "not configured"}</span></h2>
          <span class="sch-spacer"></span>
          <button type="button" class="sch-btn primary" data-brgw="pushnow" ${c.queued && on ? "" : "disabled"}
            title="${esc(TIP.push)}">✈ Push now${c.queued ? " (" + c.queued + ")" : ""}</button>
          <button type="button" class="sch-btn" data-brgw="cfg" title="${esc(TIP.cfg)}">⚚ ⚙ Settings</button>
        </div>
        <p class="sch-hint">The queue is <b>derived, never stored</b>: it is recomputed from the training
          log, the push ledger and Wings Ahead's own tombstones every time this pane paints. So being
          offline means <b>waiting</b> and never losing, a retry costs nothing, and a failed push is simply
          still owed. Only <b>flights and F/S</b> cross, only rows <b>this bridge owns</b>, and
          <b>never</b> a grade, a duration or an NG flag.</p>
        ${editOn() ? "" : `<div class="sch-consqban"><b>View-only</b> — nothing crosses this wire from this
          device, on any timer and from any button, until <b>✎ Editor mode</b> is on. Not tidiness: the
          ledger that records what was written goes through the same lock, and a write this store could
          not record is a write nobody could take back.</div>`}
        ${on ? "" : `<div class="sch-consqban"><b>Not configured</b> — open <b>⚚ ⚙ Settings</b> (with ✎ Editor
          mode on) and paste the project URL, the anon key and the bridge token you minted in Wings Ahead.</div>`}
        ${state}
        ${oidCaseLine(p)}
        ${ui.pushMsg ? `<div class="sch-consqban ${ui.pushBad ? "is-pd" : "is-ok"}">${esc(ui.pushMsg)}</div>` : ""}
        <div class="brg-chips">
          <span class="sch-badge brg-tone-accent">Queued <b>${c.queued}</b></span>
          <span class="sch-badge brg-tone-warn">Pending removals <b>${c.removals + pendingCompensations().length}</b></span>
          <span class="sch-badge brg-tone-bad">Held <b>${c.held}</b>${c.heldFlights
    ? " · " + c.heldFlights + " owed line" + (c.heldFlights === 1 ? "" : "s") + " behind them" : ""}</span>
          <span class="sch-badge brg-tone-muted">Not crossing <b>${c.blocked}</b></span>
          <span class="sch-badge">Ledger <b>${c.ledger}</b></span>
        </div>
        ${verdictPanel()}
        ${queueTable(p)}
        ${heldTable(p)}
        ${blockedTable(p)}
      </section>`;
  }

  /* ── THE REFUSAL THIS PANE CAN SEE COMING (P45-FDMSe, verify item 12b) ─────
     The planner resolves an object id case-INSENSITIVELY (`normOid` upper-cases
     both sides) and the far side matches it EXACTLY. So a Wings Ahead roster
     carrying `oid-sp-01` passes every check on this side, queues every flight,
     and is then refused at the envelope — one HTTP 400 per person, none of his
     lines written, and nothing on screen saying why. It costs one string
     comparison per person to see it coming, so it is said HERE, above ✈ Push
     now, and not deduced from a wall of refusals afterwards. */
  function oidCaseLine(p) {
    const bad = arr(p && p.oidCase);
    if (!bad.length) return "";
    return `<div class="sch-consqban is-pd"><b>${bad.length} object id${bad.length === 1 ? "" : "s"} in
      the read ${bad.length === 1 ? "is" : "are"} not upper case</b> — Wings Ahead carries
      <code>${esc(bad[0].raw)}</code> and this lane sends <code>${esc(bad[0].oid)}</code>. This side
      resolves the two as one person; <b>the far side does not</b>, and it refuses the whole
      <b>envelope</b> for each of them — every flight of ${bad.length === 1 ? "that person" : "those people"}
      is refused together, and nothing is written. Correct the case <b>in the Wings Ahead
      roster</b>; this app never rewrites a read.</div>`;
  }

  /* HOW MANY LINES A LIST DRAWS BEFORE IT SAYS «and N more». It is the wire's
     own chunk size, deliberately: one screenful of this table is one call, and a
     number the reader can already see somewhere else is easier to trust than a
     round one invented for the layout. A first push on a real store owes some
     two thousand flights — drawing them all is a megabyte of DOM nobody reads,
     and pretending there are only 200 would be the lie this pane exists to
     avoid. So the cap is stated, with the count it hides. */
  const DRAW_MAX = PUSH_MAX_OPS;
  const moreLine = (n, what) => (n <= DRAW_MAX ? ""
    : `<p class="sch-hint"><b>${n - DRAW_MAX}</b> more ${what} ${n - DRAW_MAX === 1 ? "is" : "are"}
       not drawn here — the first <b>${DRAW_MAX}</b> are, which is also exactly how many ride in one
       call to Wings Ahead. Nothing is hidden from the act itself: every one of the <b>${n}</b> is
       counted, and every one of them goes.</p>`);

  function queueTable(p) {
    if (!p.queued.length) {
      return `<div class="sch-ph"><strong>Nothing is owed.</strong>
        <p>Every qualifying flight in the training log stands in Wings Ahead exactly as it stands here.</p></div>`;
    }
    const rows = p.queued.slice(0, DRAW_MAX).map((e) => `<tr>
      <td><span class="sch-badge brg-tone-accent">${esc(e.kind === "create" ? "create"
    : e.kind === "move" ? "move" : "update")}</span></td>
      <td>${esc(e.line.who)}${e.line.student ? ` <span class="sch-code">${esc(e.line.student)}</span>` : ""}</td>
      <td class="sch-mono">${esc(e.line.uid)}</td>
      <td class="sch-mono">${esc(dmy(e.line.date))}</td>
      <td>${esc(waHandleOf(e.line.group, e.op.row))}
        <div class="brg-fchgs">${fchg(rowFields(e.op.prev, e.op.row), false)}</div></td>
      <td class="sch-mono brg-rid">${esc(e.line.rid)}</td></tr>`).join("");
    return `<div class="sch-scroll"><table class="sch-tbl brg-tbl">
      <thead><tr><th>Act</th><th>Student</th><th>Node</th><th>Date</th><th>The Wings Ahead row</th>
        <th>Row identity</th></tr></thead><tbody>${rows}</tbody></table></div>
      ${moreLine(p.queued.length, "queued flight" + (p.queued.length - DRAW_MAX === 1 ? "" : "s"))}`;
  }

  const HOLD_WORD = {
    conflict: "Wings Ahead refused the claim", student: "a student's row stands there",
    admin: "the admin took the row over", missing: "the row is not where we left it",
    tombstoned: "tombstoned in Wings Ahead", refused: "refused", removed: "removed · tombstoned",
    reopened: "removal taken back", compensate: "an undo is waiting",
    malformed: "this store's memory of the row is malformed",
    student_oid: "Wings Ahead cannot resolve this student",
    timeout: "Wings Ahead ran out of time on this student",
    /* P45-FDMSd — the hold that exists so that a LOOKUP can never be printed as
       a removal. It is not a refusal from Wings Ahead and it is not a fault of
       the training log: it is a name this run could not resolve. */
    unresolved: "a roster, not the training log — nothing is removed",
  };
  /* the two holds whose way out is a READ of Wings Ahead and never a ⟳ Clear:
     clearing them would arm a blind `prev: null` create, which is the duplicate
     this round exists to make unreachable. */
  const LOOK_HOLDS = ["missing", "malformed"];

  function heldActs(h) {
    const rid = h.line.rid;
    const stop = `<button type="button" class="sch-mini" data-brgw="hold" data-rid="${esc(rid)}"
      data-a="forget" title="${esc(TIP.forget)}">✕ Stop tracking</button>`;
    if (h.src === "student") {
      return `<button type="button" class="sch-mini" data-brgw="hold" data-rid="${esc(rid)}"
        data-a="clearstu" title="${esc(TIP.clearstu)}">⟳ Clear the hold</button>`;
    }
    /* ── THE STRAND OFFERS NO WRITE AT ALL, AND THAT IS THE JUDGEMENT ────────
       (P45-FDMSd · finding A.) This line is not one identity, it is a FACT
       standing in front of many correct rows, and neither of the two write acts
       a held line normally carries means anything here:
         · ⟳ Clear the hold would write `hold: ""` onto ledger rows whose hold
           is ALREADY "" — the hold is derived from the lookup, not stored — so
           the next paint would draw it again. A control that visibly does
           nothing is the same lie as a sentence that is not true.
         · ✕ Stop tracking would delete correct ledger rows whose Wings Ahead
           rows are standing, which puts every one of those events back in the
           queue as a CREATE. That is the duplicate this whole lane is built
           against, offered as the way out of a problem that costs nothing.
       So the exits are the two the sentence names — heal the roster, or take a
       read that carries it — and the button beside them is the READ. It wears
       [data-brg], so it stays live on a view-only device. */
    if (h.src === "roster") {
      return `<div class="sch-nd">Nothing here is owed to Wings Ahead and nothing is offered: the rows
        stand, the events stand, and the way out is the roster — or a read that carries it.</div>
        <button type="button" class="sch-mini" data-brg="pull"
          title="${esc(TIP.lookpull)}">⟳ Read Wings Ahead</button>`;
    }
    if (LOOK_HOLDS.indexOf(h.hold) >= 0) {
      const look = missingLook(ledgerRow(rid), ui.parsed, S() ? S().get("bridgePush") : []);
      const say = `<div class="sch-nd">${esc(look.why)}</div>`;
      /* ⟳ READ IS OFFERED IN EVERY STATE, not only when there is no read at all.
         A read on screen can be OLDER than the admin's edit, and both dialogs
         below say so in their own words — «if that read is stale, read Wings
         Ahead again first». Advice with no button beside it is advice nobody
         takes.
         AND IT WEARS [data-brg], NOT [data-brgw], because it READS: it is the
         pane's own ⟳ pull reached from the line that needs it, it writes
         nothing on either side, and it must therefore stay live on a view-only
         device — which is exactly the device that has to find out whether there
         is anything to unlock for. The attribute IS the classification here
         (slice 1's NAV rule), so putting the write attribute on a read would be
         the lie, not the convenience. */
      const reread = `<button type="button" class="sch-mini" data-brg="pull"
        title="${esc(TIP.lookpull)}">⟳ Read Wings Ahead</button>`;
      if (!look.have) return say + reread + stop;
      if (look.adopt) {
        return say + `<button type="button" class="sch-mini primary" data-brgw="hold" data-rid="${esc(rid)}"
          data-a="adopt" title="${esc(TIP.adopt2)}">⇄ Adopt the row where it stands</button>` + reread + stop;
      }
      /* ⊕ IS ARMED BY THE READ'S AGE AND NOT ONLY BY ITS CONTENT (P45-FDMSc).
         `look.recreate` is false whenever the read cannot be shown to postdate
         the refusal it would be explaining — and it is the read taken BEFORE
         the push, not the one taken before a delete, that is the ordinary
         state of an owner's tab. The sentence beside it already says which
         instant lost, and both refresh routes are named there. */
      if (look.record && !look.rows.length && look.recreate && h.src === "event") {
        return say + `<button type="button" class="sch-mini" data-brgw="hold" data-rid="${esc(rid)}"
          data-a="recreate" title="${esc(TIP.recreate)}">⊕ Re-create it in Wings Ahead</button>`
          + reread + stop;
      }
      return say + reread + stop;
    }
    const canRepush = h.hold === "removed" || h.hold === "reopened" || h.hold === "tombstoned";
    return (canRepush
      ? `<button type="button" class="sch-mini" data-brgw="hold" data-rid="${esc(rid)}" data-a="repush"
          title="${esc(TIP.repush)}">↩ Re-push (clears the tombstone)</button>`
      : `<button type="button" class="sch-mini" data-brgw="hold" data-rid="${esc(rid)}" data-a="clear"
          title="${esc(TIP.clear)}">⟳ Clear the hold</button>`) + stop;
  }

  function heldTable(p) {
    /* a «compensate» identity is not listed HERE: it has a home of its own in
       Pending removals, where the undo it owes is confirmed. One line, one
       place — a control that appears twice is a control somebody clicks twice. */
    const held = arr(p.held).filter((h) => h.hold !== "compensate");
    if (!held.length) return "";
    const rows = held.map((h) => `<tr>
        <td><span class="sch-badge brg-tone-bad">${esc(HOLD_WORD[h.hold] || h.hold)}</span></td>
        <td>${esc(h.line.who)}${h.src === "student"
    ? `<div class="sch-nd">${h.flights} owed line${h.flights === 1 ? " of his is" : "s of his are"}
       waiting on this</div>`
    : h.src === "roster"
      ? `<div class="sch-nd"><b>${h.rows}</b> row${h.rows === 1 ? "" : "s"} the bridge wrote
         ${h.rows === 1 ? "is" : "are"} waiting on this — <b>this run builds no removal for
         ${h.rows === 1 ? "it" : "any of them"}</b>${posInt(h.changed, 0)
    ? ` · <b>${h.changed}</b> of them carr${h.changed === 1 ? "ies" : "y"} a change of
       ${h.changed === 1 ? "its" : "their"} own behind this hold` : ""}</div>`
      : ""}</td>
        <td class="sch-mono">${esc(h.line.uid)}</td>
        <td>${esc(h.note || "")}${h.verdict ? `<div class="sch-nd">Wings Ahead answered «${esc(h.verdict)}»</div>` : ""}</td>
        <td class="sch-mono brg-rid">${esc(h.line.rid)}</td>
        <td>${heldActs(h)}</td></tr>`).join("");
    const flights = posInt(p.counts.heldFlights, 0);
    const stranded = posInt(p.counts.stranded, 0);
    const changed = posInt(p.counts.strandedChanged, 0);
    return `<p class="sch-hint"><b>Held — waiting for a human.</b> Most of these are Wings Ahead's own
        answers, and every one of them said the same thing in a different way: <b>nothing was written</b>.
        A held line is <b>off the queue</b> on purpose — an automatic retry would re-send the same refused
        claim for ever — and the way back is one explicit act, which is what «recovery is explicit» means.
        ${flights ? `<br><b>${flights}</b> owed line${flights === 1 ? " is" : "s are"} standing behind
        a held STUDENT and ${flights === 1 ? "is" : "are"} not counted as queued: they are owed, and they
        are not going anywhere until somebody settles the person.` : ""}
        ${stranded ? `<br><b>«${esc(HOLD_WORD.unresolved)}»</b> — <b>${stranded}</b> row${stranded === 1
    ? "" : "s"} the bridge already wrote ${stranded === 1 ? "is" : "are"} standing behind a name this run
        could not resolve: a person missing from one of the two rosters, an object id the read on screen
        does not carry, a node the syllabus graph no longer files. <b>This run builds no removal for a
        single one of them.</b> An instructor renamed or posted away in Wings Ahead is an ordinary week in
        a squadron, and it says <b>nothing whatever</b> about the flights he flew: the events behind those
        rows are in the training log — this run walked every one of them there by id — and
        ${changed ? `<b>${changed}</b> of the rows ${changed === 1 ? "carries a change of its own"
    : "carry a change of their own"} <b>waiting behind a hold</b>: that removal is derived, with the
        sentence that proves it, on the first run where the lookup answers.`
    : "not one of them is deleted, moved to another node, or edited out of qualifying."}
        <b>Whether the rows are still standing over there this side has not looked at</b> — the read is
        consulted for its roster of <b>people</b> and nothing else, and the cross-check report is where a
        record is compared. This lane removes a Wings
        Ahead row for exactly two reasons — the FDMS event was <b>deleted</b>, or it was <b>edited out of
        qualifying</b> — and each pending removal proves which one on its own line. A failed lookup is
        neither, so it waits here instead.` : ""}
        <br><b>«${esc(HOLD_WORD.missing)}» and «${esc(HOLD_WORD.malformed)}» are not cleared, they are
        RECONCILED</b> — Wings Ahead answers <code>missing</code> for a row an admin DELETED and for one
        he MOVED (he edits the date and the handle moves with it) and cannot tell them apart, so this side
        reads the record and offers what it found: adopt the row where it stands, or — only once the read
        shows no such row anywhere <b>and that read is newer than the refusal it is explaining</b> —
        re-create it deliberately. <b>The age of the read is half the answer</b>: a read taken before the
        push that was refused shows the record as it was BEFORE the admin touched it, and «nothing stands
        there» is then a fact about the past. Such a read adopts and reads again; it re-creates nothing.</p>
      <div class="sch-scroll"><table class="sch-tbl brg-tbl">
        <thead><tr><th>Why</th><th>Student</th><th>Node</th><th>What Wings Ahead said</th>
          <th>Row identity</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  function blockedTable(p) {
    const b = arr(p.blocked);
    if (!b.length) return "";
    if (!ui.blockOpen) {
      return `<p class="sch-hint"><b>${b.length}</b> training-log event${b.length === 1 ? " does" : "s do"}
        not cross this lane, each for a stated reason —
        <button type="button" class="sch-btn" data-brg="blocks">▸ Show</button></p>`;
    }
    const rows = b.slice(0, DRAW_MAX).map((x) => `<tr>
      <td>${esc(x.who || x.student)}</td>
      <td class="sch-mono">${esc(x.uid)}</td>
      <td class="sch-mono">${esc(dmy(x.date))}</td>
      <td>${esc(x.why)}</td>
      <td class="sch-mono sch-nd">${esc(x.evId)}</td></tr>`).join("");
    return `<p class="sch-hint"><b>${b.length}</b> training-log event${b.length === 1 ? " does" : "s do"}
        not cross this lane — <button type="button" class="sch-btn" data-brg="blocks">▾ Hide</button>
        <br>A silent exclusion is the same lie as a clean-looking empty report, so each one is listed with
        the sentence that refused it.</p>
      <div class="sch-scroll"><table class="sch-tbl brg-tbl">
        <thead><tr><th>Student</th><th>Node</th><th>Date</th><th>Why it does not cross</th>
          <th>Event</th></tr></thead><tbody>${rows}</tbody></table></div>
      ${moreLine(b.length, "event" + (b.length - DRAW_MAX === 1 ? "" : "s"))}`;
  }

  /* WHAT THE LAST PUSH WAS ANSWERED — folded into the report's own vocabulary,
     because a verdict the developer has to learn a second language for is a
     verdict he will not read. */
  function verdictPanel() {
    const v = arr(ui.verdicts);
    if (!v.length) return "";
    const rows = v.map((x) => {
      const k = CLASS_BY_ID[x.cls] || { label: x.cls, tone: "muted" };
      return `<tr>
        <td><span class="sch-badge brg-tone-${esc(k.tone)}">${esc(x.verdict)}</span></td>
        <td><span class="sch-badge brg-tone-${esc(k.tone)}">${esc(k.label)}</span></td>
        <td>${esc(x.who)}</td>
        <td class="sch-mono">${esc(x.uid)} · ${esc(dmy(x.date))}</td>
        <td>${esc(x.say)}${x.waRow ? `<div class="brg-fchgs">${fchg(rowFields(null, x.waRow), false)}</div>` : ""}</td>
      </tr>`;
    }).join("");
    return `<p class="sch-hint"><b>The last push, verdict by verdict</b> — Wings Ahead answers each
        operation in one of eleven words, and each one is folded into the report class it belongs to.
        <b>exists_fdms</b> hands back <b>no row at all</b>, deliberately: describing a bridge row is what
        authorises replacing it, so the refusal names only the handle you sent.</p>
      <div class="sch-scroll"><table class="sch-tbl brg-tbl">
        <thead><tr><th>Verdict</th><th>Report class</th><th>Student</th><th>Flight</th>
          <th>What it means</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  /* ══ PENDING REMOVALS — never automatic, each with its reason ═════════════ */
  function removalsPanel() {
    const p = ui.plan || plan();
    if (!p) return "";
    const rems = arr(p.removals);
    const comps = pendingCompensations();
    const n = rems.length + comps.length;
    if (!n) return "";
    const rows = rems.concat(comps).map((r) => `<tr>
      <td><span class="sch-badge brg-tone-warn">${esc(r.op.op === "remove" ? "remove · " + trim(r.op.reason) : "undo")}</span></td>
      <td>${esc(r.line.who || r.line.student)}${r.line.student ? ` <span class="sch-code">${esc(r.line.student)}</span>` : ""}</td>
      <td class="sch-mono">${esc(r.line.uid)}</td>
      <td class="sch-mono">${esc(dmy(r.line.date))}</td>
      <td>${esc(r.why)}
        <div class="sch-nd">${esc(waHandleOf(r.line.group, r.op.prev || r.op.row))}</div></td>
      <td class="sch-mono brg-rid">${esc(r.line.rid)}</td>
      <td><button type="button" class="sch-mini primary" data-brgw="rm" data-rid="${esc(r.line.rid)}"
        title="${esc(TIP.rm)}">✔ Confirm</button></td></tr>`).join("");
    return `
      <section class="panel sch-panel">
        <div class="sch-h"><h2>Pending removals <span class="count">${n} waiting on you</span></h2>
          <span class="sch-spacer"></span>
          <button type="button" class="sch-btn" data-brgw="rmall" title="${esc(TIP.rmall)}">␥ Confirm all ${n}</button>
        </div>
        <p class="sch-hint"><b>A removal never crosses by itself.</b> Not on the debounce, not on a retry,
          not on any timer — <b>deletion is never accidental, on the wire as at home</b> (ruling #2).
          Each line names the reason it is owed, and confirming it removes the Wings Ahead row and lays a
          <b>tombstone</b> on the identity, which is what stops the queue re-creating it. Bringing one back
          afterwards is a deliberate re-push that clears the tombstone.
          <br><b>A row is here for exactly three reasons</b>, and each line proves which: the FDMS event
          it was written from is <b>gone from the training log</b> · that event is still there and was
          <b>edited out of qualifying</b>, in the words that disqualified it · or you took the push back
          with <b>↺ Undo</b>. A row whose event is standing and unchanged is <b>never</b> here: when a
          name cannot be resolved — a person missing from a roster, an object id the read on screen does
          not carry, a node the syllabus graph no longer files — the rows are <b>held</b>, and no removal
          is built for them.${n > RM_TYPE_AT ? ` <b class="sch-warn">␥ Confirm all ${n}</b> destroys
          <b>${n}</b> rows, so it asks you to type <b>${n}</b> back before it sends.` : ""}</p>
        <div class="sch-scroll"><table class="sch-tbl brg-tbl">
          <thead><tr><th>Act</th><th>Student</th><th>Node</th><th>Date</th><th>Why</th>
            <th>Row identity</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
      </section>`;
  }

  /* ── render ────────────────────────────────────────────────────────────── */

  function render(el) {
    plan();
    el.innerHTML = head() + (ui.report ? body(ui.report)
      : (pushPanel() + removalsPanel() + changeLogPanel()));
    if (ui.report) { paintBatch(el); paintRows(el); }
    chipPaint();
    /* the write controls were just re-created, so the edit lock's veneer must
       run over them again — otherwise a freshly painted ✔ Apply would look
       live on a view-only device until the next mutation happened to trigger
       a sweep. The capture guard and upsert() would still refuse it; this is
       the honesty of the surface, not the wall. */
    const E = ED();
    if (E && E.sweep) E.sweep();
  }

  function head() {
    const r = ui.report;
    const live = ui.src === "live";
    const on = bridgeConfigured();
    return `
      <section class="panel sch-panel">
        <div class="sch-h"><h2>Bridge — the two-way with Wings Ahead
          <span class="count">both directions write on your confirm</span></h2>
          <span class="sch-spacer"></span>
          <span class="brg-src" role="group" aria-label="Where the cross-check reads Wings Ahead from">
            <button type="button" class="sch-btn${live ? "" : " primary"}" data-brg="src" data-v="file"
              title="${esc(TIP.srcFile)}">📄 File</button>
            <button type="button" class="sch-btn${live ? " primary" : ""}" data-brg="src" data-v="live"
              title="${esc(TIP.srcLive)}">⟳ Wings Ahead live</button>
          </span>
          ${live
    ? `<button type="button" class="sch-btn primary" data-brg="pull" ${on && !ui.pulling ? "" : "disabled"}
              title="${esc(TIP.pull)}">${ui.pulling ? "⟳ Reading…" : (r ? "⟳ Refresh" : "⟳ Read Wings Ahead")}</button>`
    : `<button type="button" class="sch-btn primary" data-brg="pick">⭱ Choose a Wings Ahead export…</button>`}
          ${r ? `<button type="button" class="sch-btn" data-brg="print">🖨 Print</button>
                 <button type="button" class="sch-btn" data-brg="clear">✕ Clear</button>` : ""}
          <input type="file" accept="application/json,.json" class="brg-file" hidden>
        </div>
        <p class="sch-hint">The cross-check reads <b>one <code>${esc(WA_SCHEMA)}</code> payload</b> — a file
          you choose from disk, or the same payload straight off the wire — and compares it with the local
          store. <b>The carrier changes nothing downstream</b>: the parser, the nine classes, the pairing
          and the confirm dialog are the same code either way, and the file stays the fallback for a closed
          network. A line you <b>confirm</b> is written into the <b>FDMS training log</b>; a flight you type
          in the Training log is <b>pushed to Wings Ahead</b> from the panel below — one explicit act at a
          time, with ✎ Editor mode on, both recorded in the change log with <b>↺ Undo</b>. The report and
          the payload it came from carry <b>real names</b>: they stay on this machine, they are never
          committed, and they die with the tab (ruling #7).</p>
        ${ui.error ? `<div class="sch-consqban is-pd"><b>Not read</b> — ${esc(ui.error)}</div>` : ""}
        ${ui.fileName && !ui.error ? `<p class="sch-hint">Read from <span class="sch-code">${esc(ui.fileName)}</span>
          — in memory only.</p>` : ""}
        ${lockBanner()}
        ${ui.applyMsg ? `<div class="sch-consqban ${ui.applyBad ? "is-pd" : "is-ok"}">${esc(ui.applyMsg)}</div>` : ""}
        ${!r && !ui.error ? placeholder() : ""}
      </section>`;
  }

  /* THE LOCK, SAID OUT LOUD. The veneer already greys the write controls and
     the guard already refuses the click — but a disabled button explains
     nothing, and the default state of every device is view-only. */
  function lockBanner() {
    if (editOn()) return "";
    return `<div class="sch-consqban"><b>View-only</b> — the report reads, filters and prints as
      always. <b>Applying a line writes the training log</b>, so ✔ Apply, ↦ adopt and ↺ Undo stay inert
      until ✎ Editor mode is on. Nothing on this pane has ever written Wings Ahead.</div>`;
  }

  function placeholder() {
    return `<div class="sch-ph"><strong>Nothing loaded.</strong>
      <p>Export from Wings Ahead (Admin → JSON export) and choose the file above. The report is built
      here, in this browser, from that file and the local scheduler store.</p>
      <p>Thresholds this slice judges with — ground exams <b>${THRESHOLDS.exams}&nbsp;%</b> ·
      flights <b>${THRESHOLDS.flights}&nbsp;%</b> · F/S <b>${THRESHOLDS.fs}&nbsp;%</b> — are frozen onto
      every row as it is judged, so a later configuration change can never re-judge a history already
      reported (ruling #6).</p></div>`;
  }

  function body(r) {
    return summary(r) + identityPanel(r) + rowsPanel(r)
      + pushPanel() + removalsPanel() + changeLogPanel() + legend();
  }

  function summary(r) {
    const c = r.counts.byClass;
    const chips = CLASSES.map((k) => {
      const n = c[k.id] || 0;
      const on = ui.cls === k.id;
      return `<button type="button" class="sch-btn brg-cls tone-${esc(k.tone)}${on ? " primary" : ""}"
        data-brg="cls" data-v="${esc(k.id)}" title="${esc(k.what)}">${esc(k.label)}
        <b>${n}</b></button>`;
    }).join("");
    const gchips = GROUPS.map((g) => {
      const n = Object.keys((r.counts.byGroup[g.id] || {}))
        .reduce((a, k) => a + r.counts.byGroup[g.id][k], 0);
      if (!n) return "";
      const on = ui.group === g.id;
      return `<button type="button" class="sch-btn${on ? " primary" : ""}" data-brg="group"
        data-v="${esc(g.id)}">${esc(g.label)} <b>${n}</b></button>`;
    }).join("");
    return `
      <section class="panel sch-panel">
        <div class="sch-h"><h2>Report <span class="count">${r.counts.total} row${r.counts.total === 1 ? "" : "s"}</span></h2></div>
        <p class="sch-hint">
          Source <span class="sch-code">${esc(r.source.schema)}</span>
          ${r.source.exported_at ? " · exported " + esc(hm(r.source.exported_at)) : ""}
          ${r.source.taken_at ? " · <b>read " + esc(hm(r.source.taken_at)) + "</b>" : ""}
          · ${r.source.people} people · ${r.source.records} records
          · judged with <b>exams ${r.thresholds.exams}&nbsp;%</b> ·
          <b>flights ${r.thresholds.flights}&nbsp;%</b> · <b>F/S ${r.thresholds.fs}&nbsp;%</b>
          ${r.counts.nonGraded ? ` · <b>${r.counts.nonGraded}</b> non-graded row${r.counts.nonGraded === 1 ? "" : "s"} (never complete a node)` : ""}
          ${r.counts.nonInteger ? ` · <b class="sch-warn">${r.counts.nonInteger}</b> non-integer grade${r.counts.nonInteger === 1 ? "" : "s"} — shown here, written nowhere` : ""}
          ${r.counts.appliable ? ` · <b>${r.counts.appliable}</b> line${r.counts.appliable === 1 ? "" : "s"} the developer may apply` : ""}
        </p>
        <div class="brg-chips">${chips}</div>
        <div class="brg-chips">${gchips}</div>
      </section>`;
  }

  function identityPanel(r) {
    const id = r.identities;
    const rowsHtml = r.persons.map((p) => `
      <tr>
        <td class="sch-mono">${esc(p.oid || "—")}</td>
        <td>${esc(p.name)}${p.waName && normName(p.waName) !== normName(p.name)
          ? ` <span class="sch-badge warn">WA: ${esc(p.waName)}</span>` : ""}</td>
        <td class="sch-mono">${esc(p.code || "—")}</td>
        <td>${esc(p.klass || "—")}${p.classMove
          ? ` <span class="sch-badge warn">moved · WA ${esc(p.classMove.wa)}</span>` : ""}</td>
        <td><span class="sch-badge ${p.via === "oid" ? "alt" : "warn"}">${esc(p.via === "oid" ? "by OID" : "by MN")}</span></td>
        <td>${p.divergences.length
          ? p.divergences.map((d) => `<span class="sch-chip">${esc(d)}</span>`).join("")
          : '<span class="sch-nd">—</span>'}</td>
      </tr>`).join("");
    const unm = id.waOnly.concat(id.ambiguous).map((u) => `
      <tr class="brg-bad">
        <td class="sch-mono">${esc(u.wa.oid || "—")}</td>
        <td>${esc(u.wa.name)}</td><td class="sch-mono">—</td>
        <td>${esc(u.wa.klass || "—")}</td>
        <td><span class="sch-badge st-withdrawn">unresolvable</span></td>
        <td>${esc(u.why)}</td>
      </tr>`).join("");
    const fOnly = id.fdmsOnly.filter((u) => u.coll === "students").map((u) => `
      <tr>
        <td class="sch-mono">${esc(u.fdms.oid || "—")}</td>
        <td>${esc(u.fdms.name)}</td><td class="sch-mono">${esc(u.fdms.code)}</td>
        <td>${esc(u.fdms.klass || "—")}</td>
        <td><span class="sch-badge">FDMS only</span></td>
        <td>${esc(u.why)}</td>
      </tr>`).join("");
    return `
      <section class="panel sch-panel">
        <div class="sch-h"><h2>Identities
          <span class="count">${r.persons.length} matched · ${id.waOnly.length + id.ambiguous.length} unresolvable ·
          ${id.fdmsOnly.filter((u) => u.coll === "students").length} FDMS-only</span></h2></div>
        <p class="sch-hint">Matched on <b>OID</b> first and on <b>MN</b> when a side carries no OID.
          <b>Never on the name</b> — a name is display only (ruling #4). A primary key never changes;
          MN, rank and class do, and only the developer changes them.</p>
        ${oidCaseBanner(id)}
        ${notesHtml(r)}
        <div class="sch-scroll"><table class="sch-tbl">
          <thead><tr><th>OID</th><th>Name</th><th>FDMS code</th><th>Class</th><th>Matched</th><th>Notes</th></tr></thead>
          <tbody>${rowsHtml}${unm}${fOnly}</tbody></table></div>
      </section>`;
  }

  /* ── «MATCHED BY OID» AND THEN REFUSED THIRTY TIMES ───────────────────────
     P45-FDMSe, verify item 12b — pre-existing, and it was going to meet the
     owner on his FIRST real push. `normOid` upper-cases before the wire; this
     report matches case-insensitively. A Wings Ahead roster whose
     `external_oid` values are lower-case therefore reports «N matched BY OID»
     — a clean report — and then every one of those students is refused at the
     ENVELOPE, «no ACTIVE student carries the roster object id OID-SP-01», one
     HTTP 400 per person, with nothing anywhere joining the two facts. The
     verifier spent 30 refusals on it.

     THE JUDGEMENT WAS: SAY IT, DO NOT SILENTLY FIX IT. Upper-casing the read
     would be this app writing a correction into somebody else's roster in its
     own memory and then reporting a match that the wire will not honour —
     which is the same lie one layer down. Refusing to match would be worse
     still: it would hide the person from the report that exists to find him.
     So the match stands, and the divergence is named — here in one line above
     the table, and again as a chip on the person's own row — where it is read
     BEFORE the push rather than deduced from a wall of 400s afterwards. */
  function oidCaseBanner(id) {
    const bad = arr(id && id.matched).filter((m) => m.wa && m.wa.oid && m.wa.oidRaw
      && m.wa.oidRaw !== m.wa.oid);
    if (!bad.length) return "";
    const one = bad[0].wa;
    return `<div class="sch-consqban is-pd"><b>${bad.length} object id${bad.length === 1 ? "" : "s"}
      match${bad.length === 1 ? "es" : ""} here and will be REFUSED on the wire</b> — Wings Ahead carries
      ${bad.length === 1 ? "it" : "them"} in a different case (e.g. <code>${esc(one.oidRaw)}</code>), and
      the push sends the upper-cased <code>${esc(one.oid)}</code>. This report compares case-insensitively;
      <b>the far side matches exactly</b>, so each of these people fails at the <b>envelope</b> — one
      refusal per person, and not one of their flights crosses. Nothing here is wrong and nothing is
      written: <b>correct the case in the Wings Ahead roster</b> before the first push.</div>`;
  }

  /* THE NOTES — a record warning with no row to stand on (R18 verify finding
     2 · 6). It is painted HERE, above the identity table, because it is a
     statement about a PERSON and because the alternative is an empty report
     that reads as a clean one. Every value goes through esc() like every other
     interpolation in this file: these are real names. */
  function notesHtml(r) {
    const list = arr(r.notes);
    if (!list.length) return "";
    const items = list.map((n) => `
      <div class="brg-prob"><b>${esc(n.who || n.oid || "—")}</b>${n.code
        ? ` <span class="sch-code">${esc(n.code)}</span>` : ""}${n.klass
        ? ` <span class="sch-nd">${esc(n.klass)}</span>` : ""} — ${esc(n.why)}</div>
      ${arr(n.problems).map((p) => `<div class="brg-prob">${esc(p)}</div>`).join("")}`).join("");
    return `<div class="sch-consqban is-pd"><b>${list.length} record warning${list.length === 1 ? "" : "s"}
      with no row to stand on</b> — for ${list.length === 1 ? "this record" : "these records"} the
      deviation table below says nothing at all, and <b>silence is not a clean report</b>.</div>${items}`;
  }

  function rowsPanel(r) {
    return `
      <section class="panel sch-panel">
        <div class="sch-h"><h2>Deviations <span class="count" id="brg-count"></span></h2>
          <span class="sch-spacer"></span>
          <label class="sch-fld grow"><span>Search</span>
            <input type="search" class="sch-in" data-brgq="1" value="${esc(ui.q)}"
              placeholder="name · code · node · class"></label>
        </div>
        <p class="sch-hint"><b>✔ Apply</b> writes ONE training-log event, or moves one date, or adopts one
          field — after a dialog that numbers every line and says what it does to the node. It writes the
          <b>FDMS training log only</b>: Wings Ahead is never written by this app, and neither is the
          repository. Every act lands in the change log below with <b>↺ Undo</b>.</p>
        <div class="brg-batch" id="brg-batch"></div>
        <div class="sch-scroll" id="brg-rows"></div>
      </section>`;
  }

  function visibleRows() {
    if (!ui.report) return [];
    const q = ui.q.trim().toLowerCase();
    return ui.report.rows.filter((x) => {
      if (ui.cls && x.cls !== ui.cls) return false;
      if (ui.group && x.group !== ui.group) return false;
      if (!q) return true;
      const hay = [x.who, x.code, x.oid, x.uid, x.klass, x.sec, x.instructor, x.detail, x.refused]
        .filter(Boolean).join(" ").toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }

  /* the batch bar — it counts, it selects, it opens the dialog. It writes
     nothing by itself: selecting is not applying, and the bar says so. */
  function paintBatch(el) {
    const host = el.querySelector("#brg-batch");
    if (!host || !ui.report) return;
    const can = visibleRows().filter((x) => x.plan && x.plan.can);
    if (!can.length && !ui.pick.length) {
      host.innerHTML = "";
      return;
    }
    const n = ui.pick.length;
    const allOn = can.length > 0 && can.every((x) => ui.pick.indexOf(x.rid) >= 0);
    host.innerHTML = `
      <button type="button" class="sch-btn" data-brgw="selall" data-v="${allOn ? "0" : "1"}"
        title="${esc(TIP.pick)}">${allOn ? "☐ Clear the selection" : "☑ Select the " + can.length + " appliable line" + (can.length === 1 ? "" : "s") + " shown"}</button>
      <button type="button" class="sch-btn primary" data-brgw="batch" ${n ? "" : "disabled"}
        title="${esc(TIP.batch)}">✔ Apply ${n} selected</button>
      <span class="sch-nd">${n ? "the dialog lists every one of the " + n + " lines, numbered, before anything is written"
    : "selecting writes nothing — the dialog that follows does, and only after you confirm"}</span>`;
  }

  function paintRows(el) {
    const host = el.querySelector("#brg-rows");
    const cnt = el.querySelector("#brg-count");
    if (!host || !ui.report) return;
    const list = visibleRows();
    if (cnt) cnt.textContent = list.length + " of " + ui.report.rows.length + " shown";
    if (!list.length) {
      host.innerHTML = `<div class="sch-ph"><strong>No row matches this filter.</strong></div>`;
      return;
    }
    const byGroup = new Map();
    list.forEach((x) => {
      if (!byGroup.has(x.group)) byGroup.set(x.group, []);
      byGroup.get(x.group).push(x);
    });
    /* every group the report produced is rendered, in the Flight Commander's
       reading order first and anything unforeseen after it — a row must never
       be counted in the summary and then be invisible in the table. */
    const order = ["identity"].concat(GROUPS.map((g) => g.id));
    Array.from(byGroup.keys()).forEach((k) => { if (order.indexOf(k) < 0) order.push(k); });
    let html = "";
    order.forEach((gid) => {
      const rows = byGroup.get(gid);
      if (!rows || !rows.length) return;
      const g = GROUPS.find((x) => x.id === gid);
      html += `<table class="sch-tbl brg-tbl">
        <thead>
          <tr class="sch-loggrp"><td colspan="8">${esc(g ? g.label : "Identities")}
            <span class="count">${rows.length}</span></td></tr>
          <tr><th>Class</th><th>Student</th><th>Node</th><th>Wings Ahead</th><th>FDMS</th>
            <th>Effect</th><th>Row identity</th><th>Apply</th></tr>
        </thead><tbody>${rows.map(rowHtml).join("")}</tbody></table>`;
    });
    host.innerHTML = html;
  }

  function rowHtml(x) {
    const k = CLASS_BY_ID[x.cls] || { label: x.cls, tone: "muted" };
    const marks = [];
    if (x.nonGraded) marks.push(`<span class="sch-badge warn" title="ruling #3 — a non-graded row never completes a node">NON-GRADED</span>`);
    if (x.nonInteger) marks.push(`<span class="sch-badge st-withdrawn" title="shown in the report only — never written anywhere">NOT A WHOLE NUMBER</span>`);
    if (x.duration != null) marks.push(`<span class="sch-chip" title="Wings Ahead only until slice 6 (ruling #8)">${esc(x.duration)} h</span>`);
    /* PER-FIELD ADOPTION — offered on the very line that shows both sides, and
       nowhere else. That is the binding rule of this slice: what the developer
       can adopt is exactly what the report has already put in front of him. */
    const canAdopt = x.plan && x.plan.can && x.plan.act === "adopt";
    const diffs = x.diffs.map((d) => {
      const take = canAdopt && narrowPlan(x.plan, d.field);
      return `<div class="brg-diff"><b>${esc(d.field)}</b>
      <span class="brg-w">WA ${esc(d.wa)}</span>
      <span class="brg-f">FDMS ${esc(d.fdms)}</span>
      <em>${esc(d.why)}</em>${take
    ? ` <button type="button" class="sch-mini" data-brgw="apply" data-rid="${esc(x.rid)}"
          data-f="${esc(d.field)}" title="${esc(TIP.adopt)}">↦ adopt</button>` : ""}</div>`;
    }).join("");
    const probs = x.problems.map((p) => `<div class="brg-prob">${esc(p)}</div>`).join("");
    const ref = x.refused ? `<div class="brg-prob">${esc(x.refused)}</div>` : "";
    const det = x.detail ? `<div class="sch-note">${esc(x.detail)}</div>` : "";
    const ext = x.extra ? `<div class="sch-note">${esc(x.extra)}</div>` : "";
    const moved = x.cls === "source_moved" && x.waDate && x.fdmsDate
      ? `<div class="brg-diff"><b>date</b><span class="brg-w">WA ${esc(dmy(x.waDate))}</span>
         <span class="brg-f">FDMS ${esc(dmy(x.fdmsDate))}</span>
         <em>one deviation — the source moved; this is never a delete plus an add</em></div>` : "";
    /* WHY A LINE THAT LOOKS APPLIABLE IS NOT. The sentence is the deliverable:
       «ng», «awaiting», an unresolved instructor and an out-of-slice group each
       refuse for a different reason, and each reason names the ruling. */
    const noap = x.plan && !x.plan.can && x.plan.why
      ? `<div class="brg-noap"><b>not appliable</b> — ${esc(x.plan.why)}</div>` : "";
    return `<tr class="brg-r brg-${esc(x.cls)}">
      <td><span class="sch-badge brg-tone-${esc(k.tone)}">${esc(k.label)}</span></td>
      <td>${esc(x.who || "—")}${x.code ? ` <span class="sch-code">${esc(x.code)}</span>` : ""}
        ${x.klass ? `<div class="sch-nd">${esc(x.klass)}</div>` : ""}</td>
      <td class="sch-mono">${esc(x.uid || "—")}${x.sec ? `<div class="sch-nd">${esc(x.sec)}</div>` : ""}</td>
      <td>${x.waDate ? esc(dmy(x.waDate)) : '<span class="sch-nd">—</span>'}
        ${x.waVerdict ? `<div>${esc(x.waVerdict)}</div>` : ""}
        ${x.instructor ? `<div class="sch-nd">${esc(x.instructor)}</div>` : ""}</td>
      <td>${x.fdmsDate ? esc(dmy(x.fdmsDate)) : '<span class="sch-nd">—</span>'}
        ${x.fdmsVerdict ? `<div>${esc(x.fdmsVerdict)}</div>` : ""}
        ${x.srcId ? `<div class="sch-nd">${esc(x.srcId)}</div>` : ""}</td>
      <td>${marks.join(" ")}
        <div class="sch-nd">${esc(x.completes ? "completes the node" : "does not complete the node")}</div></td>
      <td class="sch-mono brg-rid">${esc(x.rid || "—")}</td>
      <td class="brg-ap">${applyCell(x)}</td>
    </tr>${diffs || probs || ref || det || ext || moved || noap
      ? `<tr class="brg-sub"><td colspan="8">${moved}${diffs}${ref}${probs}${det}${ext}${noap}</td></tr>` : ""}`;
  }

  /* THE APPLY CELL. Three states and no fourth:
       appliable      a checkbox for the batch and a ✔ Apply for this line;
       could-have-been a muted «not appliable» whose reason is spelled out in
                      the sub-row, because a silent dash is the same lie as an
                      empty report;
       nothing        the class is not one that writes at all (agree needs no
                      act, and deleted/refused/unresolvable/unwritten are the
                      report's own refusals). */
  function applyCell(x) {
    const p = x.plan;
    if (!p) return '<span class="sch-nd">—</span>';
    if (!p.can) return '<span class="sch-nd">not appliable</span>';
    const on = ui.pick.indexOf(x.rid) >= 0;
    const word = p.act === "create" ? "✔ Apply" : p.act === "update" ? "✔ Move the date" : "✔ Adopt";
    const tip = p.act === "create" ? TIP.apply : p.act === "update" ? TIP.move : TIP.adopt;
    return `<label class="brg-sel" title="${esc(TIP.pick)}"><input type="checkbox" data-brgw="sel"
        data-rid="${esc(x.rid)}"${on ? " checked" : ""}><span>select</span></label>
      <button type="button" class="sch-mini primary" data-brgw="apply" data-rid="${esc(x.rid)}"
        title="${esc(tip)}">${esc(word)}</button>`;
  }

  /* ══ THE CHANGE LOG ══════════════════════════════════════════════════════
     RULING #2, verbatim: «όπως σε κάθε σωστά οργανωμένη βάση δεδομένων
     καταγράφουμε μεταβολές για δυνατότητα rollback». Every act the bridge
     performed, newest first, with what was written, what was there before, and
     ↺ Undo beside it. It is store data — it syncs to the private fdms-data with
     everything else, it survives a reload and it leaves with a ⭳ Export. The
     rows name the student by CODE and the label is read from the roster at
     paint time, so no name is stored twice. */
  function changeLogPanel() {
    const list = arr(S() ? S().get("bridgeLog") : []).slice()
      .sort((a, b) => (String(b.at || "") < String(a.at || "") ? -1 : String(b.at || "") > String(a.at || "") ? 1 : 0));
    if (!list.length && !ui.report) return "";
    const live = list.filter((e) => e.act !== "undo" && !e.undone).length;
    const head = `<div class="sch-h"><h2>Bridge change log
        <span class="count">${list.length} act${list.length === 1 ? "" : "s"}${live
  ? " · " + live + " standing" : ""}</span></h2>
        <span class="sch-spacer"></span>
        <button type="button" class="sch-btn" data-brg="log">${ui.logOpen ? "▾ Hide" : "▸ Show"}</button></div>
      <p class="sch-hint">Every write this pane made, and every undo, in the store and synced like every
        other collection (ruling #2 — «we record changes so there can be a rollback»). <b>↺ Undo</b>
        reverts exactly one act; if the event was edited afterwards it refuses instead of discarding
        that edit. Nothing here ever deleted anything on the Wings Ahead side.</p>`;
    if (!ui.logOpen) {
      return `<section class="panel sch-panel">${head}</section>`;
    }
    if (!list.length) {
      return `<section class="panel sch-panel">${head}
        <div class="sch-ph"><strong>Nothing applied yet.</strong>
        <p>The log fills the first time a line is applied.</p></div></section>`;
    }
    const rows = list.map((e) => {
      const who = S().personLabelOf ? S().personLabelOf("students", e.student) : e.student;
      const fields = fchg(e.fields, false);
      /* a ledger-only act offers no ↺: there is no write to take back, and a
         button that refuses on click is a button that should not be drawn */
      const canUndo = e.act !== "undo" && !e.undone && LEDGER_ONLY_ACTS.indexOf(trim(e.act)) < 0;
      return `<tr class="${e.undone ? "brg-undone" : ""}">
        <td class="sch-mono">${esc(dmy(e.date))}</td>
        <td><span class="sch-badge ${e.act === "undo" ? "brg-tone-muted" : "brg-tone-accent"}">${esc(String(e.act).toUpperCase())}</span></td>
        <td>${esc(who || "—")}${e.student ? ` <span class="sch-code">${esc(e.student)}</span>` : ""}</td>
        <td class="sch-mono">${esc(e.uid || "—")}</td>
        <td>${esc(e.what)}
          <div class="brg-fchgs">${fields}</div>
          ${e.effect ? `<div class="sch-nd">${esc(e.effect)}</div>` : ""}
          <div class="sch-nd sch-mono">${esc(e.rid || "")}${e.evId ? " · " + esc(e.evId) : ""}</div></td>
        <td class="sch-mono">${esc(e.who || "—")}</td>
        <td>${canUndo
    ? `<button type="button" class="sch-mini" data-brgw="undo" data-id="${esc(e.id)}"
             title="${esc(TIP.undo)}">↺ Undo</button>`
    : `<span class="sch-nd">${e.undone ? "undone" : "—"}</span>`}</td>
      </tr>`;
    }).join("");
    return `<section class="panel sch-panel">${head}
      <div class="sch-scroll"><table class="sch-tbl brg-tbl">
        <thead><tr><th>When</th><th>Act</th><th>Student</th><th>Node</th><th>What</th><th>By</th><th></th></tr></thead>
        <tbody>${rows}</tbody></table></div></section>`;
  }

  function legend() {
    return `<section class="panel sch-panel">
      <div class="sch-h"><h2>What the Bridge does <span class="count">and what it deliberately does not</span></h2></div>
      <div class="sch-two">
        <div>
          <p class="sch-hint"><b>The nine deviation classes</b></p>
          ${CLASSES.map((c) => `<p class="sch-hint"><span class="sch-badge brg-tone-${esc(c.tone)}">${esc(c.label)}</span>
            ${esc(c.what)}</p>`).join("")}
          <p class="sch-hint"><b>Of the nine, four can be applied</b> — and only in
            <b>${esc(APPLY_GROUPS.join(" · "))}</b>:
            <span class="sch-badge brg-tone-accent">Wings Ahead only</span> creates the event ·
            <span class="sch-badge brg-tone-warn">Source moved</span> offers to move the date ·
            <span class="sch-badge brg-tone-warn">Payload differs</span> offers the fields the report is
            already showing on both sides · <span class="sch-badge brg-tone-good">Agree</span> needs nothing.
            <b>Deleted at source</b> is never deletable from here: a tombstone is a separate deliberate
            act (ruling #2). <b>Unwritten · Structurally refused · Unresolvable identity</b> are the
            report's own refusals and are never appliable.</p>
        </div>
        <div>
          <p class="sch-hint"><b>What the push lane does — and what it never does</b></p>
          <p class="sch-hint">It writes <b>flight and F/S rows Wings Ahead stamps «fdms»</b>, for students
            matched by <b>OID</b>, and nothing else anywhere. It never writes a <b>grade</b> (a sortie is a
            word here, not a number — R2), never a <b>duration</b> (FDMS has no field until slice 6 —
            ruling #8), never <b>NG</b> (this system has no such state to assert, and NG removes a grade),
            never a ground section, an evaluation, a solo or a proposal. It never overwrites a row a
            <b>human</b> typed: Wings Ahead answers <code>exists_student</code> / <code>exists_admin</code>
            and returns both versions for the report. And it never <b>deletes</b> by itself — a removal
            waits in Pending removals, names its reason, and lays a tombstone so the queue cannot undo
            your undo.</p>
          <p class="sch-hint"><b>The echo rule</b> — an FDMS event the bridge wrote from Wings Ahead is
            never pushed back, and a Wings Ahead row this bridge wrote is never proposed back into FDMS.
            Those two sentences are the loop-breaker, and they are absolute in both directions.</p>
          <p class="sch-hint"><b>Deliberately not in this lane</b></p>
          <p class="sch-hint">No delete of anything a person typed, on either side. No schema change
            anywhere. <b>No background polling</b>: the report carries real names, and a poller would hold
            them in memory behind your back — every read and every retry here is an act you took. No
            ground push. Ground lessons and exams, the eight checkrides, the prescribed solos and the
            FAIL / NFS / SMS events are <b>reported and not written</b> in either direction — each waits
            for a slice of its own.</p>
          <p class="sch-hint"><b>What a written event carries</b> —
            <span class="sch-code">id wa:…</span>, <span class="sch-code">origin wa</span> and a
            <span class="sch-code">bridge</span> block holding the row identity and what Wings Ahead said.
            Re-loading the same export therefore reads <b>Agree</b> and can never write it twice; an export
            in which the student <b>changed</b> the row reads <b>Payload differs</b> against the very event
            the bridge wrote. A non-graded, awaiting or non-integer row is <b>never</b> written: FDMS has no
            way to store it without completing a node it must not complete (rulings #3 · #5 · #6).</p>
          <p class="sch-hint"><b>The row identity</b> is
            <span class="sch-code">OID ∷ group ∷ node ∷ attempt</span> and the <b>date is not in it</b>.
            A corrected date is one <span class="sch-badge brg-tone-warn">Source moved</span> row — never a
            delete plus an add, which is how a duplicated FAIL would fabricate a ΠΔ 29/2020 referral.</p>
          <p class="sch-hint"><b>Custody</b> — this report carries real names. It is never written to the
            repository, never downloaded and never persisted; clearing the pane or leaving the tab drops it
            (ruling #7). The <b>events</b> a confirmed line writes are ordinary store data and travel with
            the store, exactly like every event typed in the Training log.</p>
        </div>
      </div>
    </section>`;
  }

  /* ══ public surface ══════════════════════════════════════════════════════ */
  W.SchedBridge = {
    VERSION, WA_SCHEMA, THRESHOLDS, CLASSES, CLASS_IDS, GROUPS,
    EVAL_IDS, EXAM_IDS,
    looksLikeWaExport, parseExport, matchPeople, crossCheck,
    judge, nodeEffect, isNonGraded, pairGroup, verdictWord,
    /* PHASE 3 — the writer's pure half, exported so the fixtures assert on the
       very record the store would get and not on a paraphrase of it. Nothing
       here touches the store: applyPlan/undoEntry, which do, are reached only
       from a [data-brgw] control in § ③. */
    APPLY_GROUPS, LAG_FLOOR, ADOPTABLE, ORIGIN,
    bridgeEvId, resultOf, isWaWritten, plannedEvent, buildEvent,
    /* PHASE 4/5 — the push lane's pure half, on the same terms as Phase 3's:
       the fixtures assert on the very OPERATIONS the wire would get and on the
       very LEDGER row a verdict produces, never on a paraphrase of either.
       Nothing here touches the store or the network — planNow/runPush/wireCall,
       which do, are reached only from a [data-brgw] control past the lock. */
    WA_BRIDGE_SCHEMA, PUSH_OPS, PUSH_REASONS, PUSH_VERDICTS,
    PUSH_MAX_OPS, PUSH_CHUNK, RID_MAX, SEQ_MAX, PUSH_ROW_KEYS, PUSH_MISSION,
    codeTrack, pushBlockOf, planPush, foldVerdict, sameWaRow, chunkOps, echoOf,
    undoPushPlan, rowFields, waHandleOf,
    /* P45-FDMSb — the four judgements the round added, each pure and each
       exported for the same reason as the rest: a fixture asserts on the very
       sentence and the very shape, never on a paraphrase. */
    rowProblem, prevProblem, opProblem, wireFailKind, missingLook, adoptRowOf,
    ledStuRid, LEDGER_ONLY_ACTS,
    /* P45-FDMSc — the age of a read is a judgement like every other one in this
       file, so it is pure, exported, and asserted on directly instead of being
       inferred from the sentence missingLook happens to print. WIRE_MS is here
       for the same reason the chunk is: a number a fixture cannot read is a
       number a round can change without anybody noticing. */
    readFresh, WIRE_MS,
    /* P45-FDMSd — the distinction a removal is made of, exported so a fixture
       asserts on the JUDGEMENT and not on the sentence it happens to print:
       `pushBlockWhy` carries whose fact each refusal is, and RM_TYPE_AT is the
       size at which ␥ Confirm all asks for its count back. A number no fixture
       can read is a number a round can move without anybody noticing. */
    pushBlockWhy, RM_TYPE_AT,
  };

  /* ══ THE LANE ARMS ITSELF AT LOAD, NOT AT THE FIRST VISIT ════════════════
     The header chip and the 5-second debounce are the push lane's honesty
     surface, and a surface that only exists once you have opened the pane it
     talks about is not one: a flight typed in the Training log has to be
     counted the moment it is typed, whichever tab is on screen. So the store
     subscription is wired at load — it reads, it counts and it paints a chip,
     and it sends nothing that the Live switch has not armed and the edit lock
     has not allowed.
     Guarded on `document` because the fixtures require() this file with
     `global.window = global` and no DOM at all; guarded on SchedStore because
     the offline build inlines the modules in app/index.html's own order and a
     module must never assume the one below it has run. */
  if (W.document && W.document.addEventListener) {
    const boot = () => {
      if (!W.SchedStore || !W.SchedStore.ready) return;
      try { W.SchedStore.ready().then(() => { wireStore(); }, () => {}); }
      catch (e) { /* a store that cannot boot is the store's own report, not ours */ }
    };
    if (W.document.readyState === "loading") {
      W.document.addEventListener("DOMContentLoaded", boot, { once: true });
    } else { boot(); }
  }
})();
