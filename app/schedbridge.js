"use strict";
/* SchedBridge — THE BRIDGE, SLICE 1: the READ-ONLY CROSS-CHECK REPORT.
 *
 * WHAT THIS IS
 *   A Scheduler pane that reads ONE Wings Ahead admin-export file the user
 *   chooses from disk, cross-checks it against the local FDMS store, and paints
 *   a report. It writes NOTHING — not to the store, not to WA, not to the repo,
 *   not to localStorage. There is no credential anywhere in this file and no
 *   schema change on either side. See specs/bridge-spec.md.
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
 *   #6 thresholds: ground exams 80, flights 60, F/S 50. FROZEN PER ROW at the
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
 *   Section ① touches no DOM and is attached to window.SchedBridge, so the
 *   fixtures can require() this file with `global.window = global` and run the
 *   whole cross-check headlessly. Section ② is the pane and only runs from a
 *   UI event.
 */
(() => {
  const W = typeof window !== "undefined" ? window : globalThis;

  /* ══════════════════════════════════════════════════════════════════════════
     ① THE ENGINE — pure, no DOM, no store, no fetch
     ══════════════════════════════════════════════════════════════════════════ */

  const VERSION = "bridge-slice-1";
  const WA_SCHEMA = "wa-export-v1";

  /* RULING #6 — the three thresholds, frozen per row when it is judged.
     80 is FDMS's own exam_pass_pct default (ground school); 60 is ΠΔ 151/13's
     «Κ» floor, the line every referral criterion uses for a flight; 50 is the
     «ΣΚ» / ΥΣΤΕΡΗΣΗ floor of the same printed scale, which the earlier mapping
     gave the simulator. They are constants HERE and never read from config:
     a config that drifts must never re-judge a history already reported. */
  const THRESHOLDS = { exams: 80, flights: 60, fs: 50 };
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

  /* ── normalising the two sides into one row shape ──────────────────────── */

  function baseRow(side, sec, band, uid, seq, date) {
    return {
      side, sec, band, uid, seq: posInt(seq, 1), date: isoDate(date),
      end_date: "", grade: null, ng: false, mission: "", duration: null,
      kind: "", track: "", instructor: "", instructorOid: "",
      extra: {}, srcId: "", srcNote: "", waWritten: false,
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
  /* an event the bridge itself wrote carries the "wa:" id convention — slice 1
     writes none, but it must RECOGNISE them so `deleted` can exist (ruling #2) */
  const isWaWritten = (ev) => /^wa:/i.test(trim(ev && ev.id));

  function fdmsRow(oid, ev, band, groupId, course) {
    const node = evNodeOf(ev);
    const uid = groupId === "lessons"
      ? node + "::" + (trim(course) || "*")
      : node;
    const r = baseRow("fdms", groupId, band, uid, 1,
      trim(ev.date) || trim(ev.start_date));
    r.raw = ev;
    r.srcId = trim(ev.id);
    r.waWritten = isWaWritten(ev);
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
      log.forEach((ev) => {
        if (!isObj(ev)) return;
        const node = evNodeOf(ev);
        if (!node) {
          if (trim(ev.special) && trim(ev.student) === person.code) fdSpecial(ev, person, fdSpecials);
          return;
        }
        const band = kindOf(node);
        if (!band) return;                              // the graph does not know it
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
          const refused = refusalOf(pr.wa, b.gid);
          const cmp = compareRow(pr.wa, pr.fdms, ipResolve);
          const bad = pr.wa.problems.concat(recProblems);
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
          rows.push(mkRow(cls, b.gid, person, b.uid, id, pr.wa, pr.fdms, cmp, refused, bad));
        });
        res.waOnly.forEach((r) => {
          const id = emit();
          const refused = refusalOf(r, b.gid);
          const bad = r.problems.concat(recProblems);
          const j = judge(r);
          const cls = bad.length ? "unwritten" : refused ? "refused" : "wa_only";
          const row = mkRow(cls, b.gid, person, b.uid, id, r, null,
            { diffs: [], jw: j, jf: null, duration: r.duration }, refused, bad);
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
          const row = mkRow(cls, b.gid, person, b.uid, id, null, r,
            { diffs: [], jw: null, jf: judge(r), duration: null }, "", r.problems);
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
        const bad = r.problems.concat(recProblems);
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

      /* an FDMS special no Wings Ahead row claimed */
      fdSpecials.forEach((f) => {
        if (f.claimed) return;
        rows.push(mkRow("fdms_only", "events", person, f.uid,
          { ord: 1, rid: [oid, "events", f.uid, 1].join(" ∷ ") }, null, f,
          { diffs: [], jw: null, jf: judge(f), duration: null }, "", f.problems));
      });

      /* ground-history divergence count for the person header (ruling #4) */
      person.groundDivergence = rows.filter((x) => x.oid === oid
        && (x.group === "lessons" || x.group === "exams")
        && x.cls !== "agree").length;
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
      counts: { byClass, byGroup, total: rows.length, nonGraded, nonInteger },
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
         not — a lesson was never scorable, so it wears no such badge */
      nonGraded: !!j && !j.graded && j.source !== "attended",
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
    };
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
  function refusalOf(r, gid) {
    if (!r || r.side !== "wa") return "";
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
     ② THE PANE — DOM only, runs from a UI event, writes nothing
     ══════════════════════════════════════════════════════════════════════════ */

  const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ESC[c]);
  const S = () => W.SchedStore;
  const R = () => W.SchedReady;
  const dmy = (s) => (W.fmtDMY ? W.fmtDMY(s) : String(s == null ? "" : s));

  /* the whole pane's state. `report` and `file` live HERE and nowhere else —
     no localStorage, no store, no sync, no download (ruling #7). */
  const ui = { report: null, fileName: "", error: "", filter: "", cls: "", group: "", q: "" };

  function clearAll() {
    ui.report = null; ui.fileName = ""; ui.error = "";
    ui.cls = ""; ui.group = ""; ui.q = "";
  }

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
    try {
      ui.report = crossCheck(parsed, {
        students: S().get("students") || [],
        instructors: S().get("instructors") || [],
        trainingLog: S().get("trainingLog") || [],
        gates: S().get("gates") || [],
      }, {
        kindOf: (uid) => (R() ? R().kindOf(uid) : null),
        membersOf: (c) => S().membersOf(c) || [],
        today: R() ? R().todayISO() : "",
      });
    } catch (err) {
      ui.error = "the cross-check could not be completed: " + err.message;
      console.error(err);
    }
    render(el);
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

  /* ── render ────────────────────────────────────────────────────────────── */

  function render(el) {
    el.innerHTML = head() + (ui.report ? body(ui.report) : "");
    if (ui.report) paintRows(el);
  }

  function head() {
    const r = ui.report;
    return `
      <section class="panel sch-panel">
        <div class="sch-h"><h2>Bridge — cross-check with Wings Ahead
          <span class="count">read-only</span></h2>
          <span class="sch-spacer"></span>
          <button type="button" class="sch-btn primary" data-brg="pick">⭱ Choose a Wings Ahead export…</button>
          ${r ? `<button type="button" class="sch-btn" data-brg="print">🖨 Print</button>
                 <button type="button" class="sch-btn" data-brg="clear">✕ Clear</button>` : ""}
          <input type="file" accept="application/json,.json" class="brg-file" hidden>
        </div>
        <p class="sch-hint">This pane <b>reads</b> one <code>${esc(WA_SCHEMA)}</code> file you choose from
          disk and compares it with the local store. It writes nothing — not the store, not Wings Ahead,
          not the repository, not <code>localStorage</code>. The report and the file it came from carry
          <b>real names</b>: they stay on this machine and are never committed (ruling #7).</p>
        ${ui.error ? `<div class="sch-consqban is-pd"><b>Not read</b> — ${esc(ui.error)}</div>` : ""}
        ${ui.fileName && !ui.error ? `<p class="sch-hint">Read from <span class="sch-code">${esc(ui.fileName)}</span>
          — in memory only.</p>` : ""}
        ${!r && !ui.error ? placeholder() : ""}
      </section>`;
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
    return summary(r) + identityPanel(r) + rowsPanel(r) + legend();
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
        <div class="sch-scroll"><table class="sch-tbl">
          <thead><tr><th>OID</th><th>Name</th><th>FDMS code</th><th>Class</th><th>Matched</th><th>Notes</th></tr></thead>
          <tbody>${rowsHtml}${unm}${fOnly}</tbody></table></div>
      </section>`;
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
        <div class="sch-scroll" id="brg-rows"></div>
      </section>`;
  }

  function paintRows(el) {
    const host = el.querySelector("#brg-rows");
    const cnt = el.querySelector("#brg-count");
    if (!host || !ui.report) return;
    const q = ui.q.trim().toLowerCase();
    const list = ui.report.rows.filter((x) => {
      if (ui.cls && x.cls !== ui.cls) return false;
      if (ui.group && x.group !== ui.group) return false;
      if (!q) return true;
      const hay = [x.who, x.code, x.oid, x.uid, x.klass, x.sec, x.instructor, x.detail, x.refused]
        .filter(Boolean).join(" ").toLowerCase();
      return hay.indexOf(q) >= 0;
    });
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
          <tr class="sch-loggrp"><td colspan="7">${esc(g ? g.label : "Identities")}
            <span class="count">${rows.length}</span></td></tr>
          <tr><th>Class</th><th>Student</th><th>Node</th><th>Wings Ahead</th><th>FDMS</th>
            <th>Effect</th><th>Row identity</th></tr>
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
    const diffs = x.diffs.map((d) => `<div class="brg-diff"><b>${esc(d.field)}</b>
      <span class="brg-w">WA ${esc(d.wa)}</span>
      <span class="brg-f">FDMS ${esc(d.fdms)}</span>
      <em>${esc(d.why)}</em></div>`).join("");
    const probs = x.problems.map((p) => `<div class="brg-prob">${esc(p)}</div>`).join("");
    const ref = x.refused ? `<div class="brg-prob">${esc(x.refused)}</div>` : "";
    const det = x.detail ? `<div class="sch-note">${esc(x.detail)}</div>` : "";
    const ext = x.extra ? `<div class="sch-note">${esc(x.extra)}</div>` : "";
    const moved = x.cls === "source_moved" && x.waDate && x.fdmsDate
      ? `<div class="brg-diff"><b>date</b><span class="brg-w">WA ${esc(dmy(x.waDate))}</span>
         <span class="brg-f">FDMS ${esc(dmy(x.fdmsDate))}</span>
         <em>one deviation — the source moved; this is never a delete plus an add</em></div>` : "";
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
    </tr>${diffs || probs || ref || det || ext || moved
      ? `<tr class="brg-sub"><td colspan="7">${moved}${diffs}${ref}${probs}${det}${ext}</td></tr>` : ""}`;
  }

  function legend() {
    return `<section class="panel sch-panel">
      <div class="sch-h"><h2>What slice 1 does <span class="count">and what it deliberately does not</span></h2></div>
      <div class="sch-two">
        <div>
          <p class="sch-hint"><b>The nine deviation classes</b></p>
          ${CLASSES.map((c) => `<p class="sch-hint"><span class="sch-badge brg-tone-${esc(c.tone)}">${esc(c.label)}</span>
            ${esc(c.what)}</p>`).join("")}
        </div>
        <div>
          <p class="sch-hint"><b>Deliberately not in this slice</b></p>
          <p class="sch-hint">No writes — to either side. No schema change anywhere. No credential and no
            network call: the transport is a file you chose. No cloud, no backup, no download. Duration is
            carried and shown but never compared, because FDMS has no field for it until slice 6 (ruling #8).</p>
          <p class="sch-hint"><b>The row identity</b> is
            <span class="sch-code">OID ∷ group ∷ node ∷ attempt</span> and the <b>date is not in it</b>.
            A corrected date is one <span class="sch-badge brg-tone-warn">Source moved</span> row — never a
            delete plus an add, which is how a duplicated FAIL would fabricate a ΠΔ 29/2020 referral.</p>
          <p class="sch-hint"><b>Custody</b> — this report carries real names. It is never written to the
            repository, never downloaded and never persisted; clearing the pane or leaving the tab drops it
            (ruling #7).</p>
        </div>
      </div>
    </section>`;
  }

  /* ══ public surface ══════════════════════════════════════════════════════ */
  W.SchedBridge = {
    VERSION, WA_SCHEMA, THRESHOLDS, CLASSES, CLASS_IDS, GROUPS,
    EVAL_IDS, EXAM_IDS,
    looksLikeWaExport, parseExport, matchPeople, crossCheck,
    judge, nodeEffect, pairGroup, verdictWord,
  };
})();
