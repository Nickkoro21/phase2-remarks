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
      people,
      records,
      proposals: arr(d.proposals).filter(isObj),
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
      x.plan = makePlan(x, ipResolve, waParsed.exported_at, kindOf);
      if (x.plan) x.plan.key = x.key;
      if (x.plan && x.plan.can) appliable += 1;
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
  function makePlan(x, ipResolve, exportAt, kindOf) {
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

  /* one change-log entry — the shape is recorded in specs/bridge-spec.md § 13γ */
  function logAct(o) {
    return S().upsert("bridgeLog", {
      id: "", act: o.act, at: new Date().toISOString(), date: todayOf(), who: WHO,
      rid: o.rid || "", oid: o.oid || "", group: o.group || "", uid: o.uid || "",
      ord: o.ord || 0, seq: o.seq || 1, student: o.student || "", evId: o.evId || "",
      what: o.what || "", fields: arr(o.fields).map((f) => ({ field: f.field, from: f.from, to: f.to })),
      effect: o.effect || "", undone: false, undoneBy: "", undoOf: o.undoOf || "",
    });
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

  /* ── ↺ UNDO — ruling #2's rollback, one entry at a time ────────────────── */
  function undoEntry(id) {
    const e = S().find("bridgeLog", id);
    if (!e) return { ok: false, why: "that change-log entry is gone" };
    if (e.undone) return { ok: false, why: "that entry has already been undone" };
    if (e.act === "undo") {
      return { ok: false, why: "an undo is not itself undone from here — the row is back in the report, "
        + "and applying it again is the deliberate act that re-does it" };
    }
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
    cls: "", group: "", q: "", pick: [], logOpen: false, applyMsg: "", applyBad: false };

  function clearAll() {
    ui.report = null; ui.parsed = null; ui.fileName = ""; ui.error = "";
    ui.cls = ""; ui.group = ""; ui.q = ""; ui.pick = [];
    ui.applyMsg = ""; ui.applyBad = false; ui.logOpen = false;
  }

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
      + "that edit. The undo is itself recorded as a change-log entry.",
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

  W.schBridgeInit = function schBridgeInit(el) {
    if (!el) return;
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
  function confirmPop(o) {
    return new Promise((resolve) => {
      const doc = W.document;
      if (popBusy || !doc || !doc.body) { resolve(false); return; }
      popBusy = true;
      const veil = doc.createElement("div");
      veil.className = "ed-pop brg-pop";
      veil.innerHTML = `<div class="ed-box brg-box" role="dialog" aria-modal="true" aria-label="${esc(o.title)}">
        <div class="ed-ico" aria-hidden="true">${esc(o.ico || "✔")}</div>
        <h3>${esc(o.title)}</h3>
        <p class="hint">${o.lead}</p>
        <ol class="brg-poplist">${o.items}</ol>
        <p class="hint">${o.foot}</p>
        <div class="ed-row">
          <button type="button" class="sch-tbtn primary" data-p="go">${esc(o.go)}</button>
          <button type="button" class="sch-tbtn" data-p="cancel">↩ Cancel</button>
        </div>
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
      function onKey(e) {
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); done(false); }
      }
      veil.addEventListener("click", (e) => {
        if (e.target === veil || e.target.closest('[data-p="cancel"]')) { done(false); return; }
        if (e.target.closest('[data-p="go"]')) done(true);
      });
      doc.addEventListener("keydown", onKey, true);
      doc.body.appendChild(veil);
      const g = veil.querySelector('[data-p="go"]');
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

  /* ── render ────────────────────────────────────────────────────────────── */

  function render(el) {
    el.innerHTML = head() + (ui.report ? body(ui.report) : changeLogPanel());
    if (ui.report) { paintBatch(el); paintRows(el); }
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
    return `
      <section class="panel sch-panel">
        <div class="sch-h"><h2>Bridge — cross-check with Wings Ahead
          <span class="count">writes on your confirm</span></h2>
          <span class="sch-spacer"></span>
          <button type="button" class="sch-btn primary" data-brg="pick">⭱ Choose a Wings Ahead export…</button>
          ${r ? `<button type="button" class="sch-btn" data-brg="print">🖨 Print</button>
                 <button type="button" class="sch-btn" data-brg="clear">✕ Clear</button>` : ""}
          <input type="file" accept="application/json,.json" class="brg-file" hidden>
        </div>
        <p class="sch-hint">This pane <b>reads</b> one <code>${esc(WA_SCHEMA)}</code> file you choose from
          disk and compares it with the local store. It never writes Wings Ahead, the repository or
          <code>localStorage</code>. Since Phase 3 a line you <b>confirm</b> is written into the
          <b>FDMS training log</b> — one explicit act at a time, with ✎ Editor mode on, recorded in the
          change log below with <b>↺ Undo</b>. The report and the file it came from carry
          <b>real names</b>: they stay on this machine and are never committed (ruling #7).</p>
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
    return summary(r) + identityPanel(r) + rowsPanel(r) + changeLogPanel() + legend();
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
          ${r.source.exported_at ? " · exported " + esc(dmy(String(r.source.exported_at).slice(0, 10))) : ""}
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
        ${notesHtml(r)}
        <div class="sch-scroll"><table class="sch-tbl">
          <thead><tr><th>OID</th><th>Name</th><th>FDMS code</th><th>Class</th><th>Matched</th><th>Notes</th></tr></thead>
          <tbody>${rowsHtml}${unm}${fOnly}</tbody></table></div>
      </section>`;
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
      const canUndo = e.act !== "undo" && !e.undone;
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
          <p class="sch-hint"><b>Deliberately not in this slice</b></p>
          <p class="sch-hint">No write to <b>Wings Ahead</b>, in any direction, ever from here. No delete —
            on either side. No schema change anywhere. No credential and no network call: the transport is
            a file you chose. No cloud, no backup, no download. Ground lessons and exams, the eight
            checkrides, the prescribed solos and the FAIL / NFS / SMS events are <b>reported and not
            written</b> — each waits for a slice of its own. Duration is carried and shown but never
            compared, because FDMS has no field for it until slice 6 (ruling #8).</p>
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
  };
})();
