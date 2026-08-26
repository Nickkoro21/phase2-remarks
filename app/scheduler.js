"use strict";
/* Round 6 — the ONE shared date formatter: every date RENDERED as text shows
   DD/MM/YYYY; storage stays ISO everywhere; native <input type="date"> stays
   untouched. A leading ISO date in a longer string ("2026-08-10 14:32") is
   converted and the tail kept. Defined here (first scheduler file loaded) so
   schedconsq.js and schedboard.js can share it. */
window.fmtDMY = function fmtDMY(v) {
  const s = String(v == null ? "" : v);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? m[3] + "/" + m[2] + "/" + m[1] + s.slice(10) : s;
};
/* Scheduler — PHASE A of specs/scheduler-spec.md
 *
 *   ① window.SchedReady — the readiness engine that Phase B (schedboard.js)
 *     consumes: per-student node status, the next options per kind, the
 *     pending-other-kinds chips and the idle-day counters.
 *   ② window.schInit()  — the Scheduler tab: subtab routing + Roster,
 *     Training Log and Balance panes. The Board pane is Phase B: this file
 *     only calls window.schBoardInit(el) if it exists, otherwise it shows a
 *     placeholder.
 *
 * Graph = data/flowchart2.json, addressed by uid ("g:CO190" · "s:I4701") —
 * the same namespace schedval.js uses. A bare id is never a key: 13 ids exist
 * both as a group and as a sortie.
 */

/* ══════════════════════════════════════════════════════════════════════════
   ① READINESS ENGINE — window.SchedReady
   ══════════════════════════════════════════════════════════════════════════ */
(() => {
  const FC_URL = "../data/flowchart2.json";
  const KINDS = ["lessons", "exams", "fs", "flights"];
  const KIND_LABEL = { lessons: "Lessons", exams: "Ground exams", fs: "F/S", flights: "Flights" };
  const KIND_SHORT = { lessons: "LSN", exams: "EXAM", fs: "F/S", flights: "FLT" };
  const TRACK_LABEL = {
    contact: "Contact", instrument: "Instrument", formation: "Formation",
    vfr_navigation: "VFR Navigation", shared: "Shared ground",
  };
  /* Gates that lock flying until they are closed (spec §3 / §6 hard rules).
     kepe_in is NOT a lock — it caps the day at one dual sortie; Phase B reads
     it from openGates() and enforces the cap on the board.
     The alias table absorbs the spellings the seed and hand-entered records
     use, so a gate is never silently ignored because of its wording.        */
  const GATE_LABEL = {
    progress_check_ae: "Progress Check (Training Officer)",
    progress_check_cmdr: "Progress Check (Commander)",
    suitability: "Suitability Examination",
    referral: "Referral",
    kepe_in: "SMS — entry",                       // SMS = Special Monitoring Status (stored type stays kepe_*)
    kepe_out: "SMS — exit",
  };
  const GATE_TITLE = { kepe_in: "Special Monitoring Status", kepe_out: "Special Monitoring Status" };
  const GATE_ALIAS = {
    progress_test_ae: "progress_check_ae", progress_check_ae: "progress_check_ae",
    progress_test_dkti: "progress_check_cmdr", progress_test_cmdr: "progress_check_cmdr",
    progress_check_cmdr: "progress_check_cmdr", progress_check_commander: "progress_check_cmdr",
    suitability: "suitability", suitability_exam: "suitability", suitability_examination: "suitability",
    referral: "referral",
    kepe_entry: "kepe_in", kepe_in: "kepe_in",
    kepe_exit: "kepe_out", kepe_out: "kepe_out",
  };
  const normGate = (t) => GATE_ALIAS[String(t || "").toLowerCase()] || String(t || "");
  const GATE_LOCKS_FLYING = { progress_check_ae: 1, progress_check_cmdr: 1, suitability: 1, referral: 1 };

  const G = {
    fc: null, loadP: null,
    node: new Map(),            // uid -> raw flowchart node
    byGroup: new Map(),         // group id -> [sortie]
    groups: [],
    kind: new Map(),            // uid -> "lessons" | "exams" | "fs" | "flights"
    rank: new Map(),            // uid -> ordering number (syllabus/print order)
    fwd: new Map(),             // uid -> [{from,to,kinds}]   raw
    rev: new Map(),             // uid -> [{from,to,kinds}]   raw
    dropped: new Set(),         // "from>to" back edges removed to break cycles
    prereq: new Map(),          // uid -> [{uid,kinds,via}]   DAG + inferred
    all: [],                    // every schedulable uid, in rank order
    ofKind: { lessons: [], exams: [], fs: [], flights: [] },
    sections: { lessons: [], exams: [], fs: [], flights: [] },
    hay: new Map(),             // uid -> search haystack
  };
  const cache = { state: new Map(), frontier: new Map(), cov: new Map() };

  const num = (x) => (x === "" || x == null || isNaN(Number(x)) ? null : Number(x));

  /* ── load & index ──────────────────────────────────────────────────────── */
  function load() { if (!G.loadP) G.loadP = build(); return G.loadP; }

  async function build() {
    const r = await fetch(FC_URL, { cache: "no-store" });
    G.fc = await r.json();
    const fc = G.fc;
    G.groups = fc.groups || [];

    const order = [];
    for (const g of G.groups) {
      G.node.set(g.uid, g);
      const k = g.band === "ground" ? "lessons" : (g.band === "exams" ? "exams" : null);
      if (k) { G.kind.set(g.uid, k); order.push(g.uid); }
    }
    for (const s of (fc.sorties || [])) {
      G.node.set(s.uid, s);
      if (!G.byGroup.has(s.group)) G.byGroup.set(s.group, []);
      G.byGroup.get(s.group).push(s);
      const k = s.band === "fs" ? "fs" : "flights";
      G.kind.set(s.uid, k);
      order.push(s.uid);
    }
    order.forEach((u, i) => G.rank.set(u, i));
    G.all = order;
    for (const u of order) G.ofKind[G.kind.get(u)].push(u);

    /* edges merged on (from,to) — the same pair is written twice with two
       kinds (prereq + ground_entry) and must count once. */
    const seen = new Map();
    for (const e of [].concat(fc.edges || [], fc.ground_chain_edges || [])) {
      if (!G.node.has(e.from_ref) || !G.node.has(e.to_ref)) continue;
      const key = e.from_ref + ">" + e.to_ref;
      let m = seen.get(key);
      if (!m) {
        m = { from: e.from_ref, to: e.to_ref, kinds: [] };
        seen.set(key, m);
        if (!G.rev.has(e.to_ref)) G.rev.set(e.to_ref, []);
        G.rev.get(e.to_ref).push(m);
        if (!G.fwd.has(e.from_ref)) G.fwd.set(e.from_ref, []);
        G.fwd.get(e.from_ref).push(m);
      }
      if (m.kinds.indexOf(e.kind) < 0) m.kinds.push(e.kind);
    }
    breakCycles();
    for (const u of G.all) G.prereq.set(u, computePrereq(u));
    buildSections();
    buildCourses();
    buildHay();
    return G;
  }

  /* ── Round 5 · ground groups decomposed into their COURSES ──────────────
     Source: duration_summary ("Chapter: Course name | CODE | periods · …"),
     parsed DEFENSIVELY — segments split on " · ", fields on " | "; segments
     without a code (OJT, Air Traffic Rules, the General-Briefing subjects)
     get a synthesized code; "[suppl.]" segments are conditional (foreign SPs)
     and never block the group's completion. The LABEL codes win over the
     table codes (flags note the drift: FF 101-108 vs FF 101-107) — matched
     by prefix/first-number/shared-token. Groups without a duration_summary
     (WSGES · CO 109 · CO 110) fall back to ONE course = the group itself.  */
  const GREEK2LAT = { "Α": "A", "Β": "B", "Ε": "E", "Ζ": "Z", "Η": "H", "Ι": "I", "Κ": "K", "Μ": "M", "Ν": "N", "Ο": "O", "Ρ": "P", "Τ": "T", "Υ": "Y", "Χ": "X" };
  const normTxt = (s) => String(s == null ? "" : s).replace(/[ΑΒΕΖΗΙΚΜΝΟΡΤΥΧ]/g, (c) => GREEK2LAT[c]).replace(/\s+/g, " ").trim().toLowerCase();
  function synthCode(name, taken) {
    const m = /^([A-Z]{2,})\b/.exec(String(name || "").trim());
    let base = m ? m[1]
      : String(name || "").split(/\s+/).map((w) => (w.charAt(0) || "")).join("").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4) || "CRS";
    let code = base, i = 2;
    while (taken.has(code)) code = base + "-" + (i++);
    return code;
  }
  function parseGroupCourses(g) {
    const label = String(g.label || "");
    const parts = label.split(" · ").map((p) => ({ raw: p.trim(), norm: normTxt(p), used: false }));
    const adopt = (codeRaw, nameRaw) => {
      const norm = normTxt(codeRaw);
      let hit = norm ? parts.find((p) => !p.used && p.norm === norm) : null;
      const toks = norm.split(" ").filter(Boolean);
      const t0 = toks[0] || "", n0 = (norm.match(/\d+/) || [""])[0];
      const tokOk = (pt0) => pt0 === t0 || (t0 && (pt0.indexOf(t0) === 0 || t0.indexOf(pt0) === 0));
      if (!hit && norm && norm.indexOf("-") >= 0) {
        hit = parts.find((p) => {
          if (p.used) return false;
          const pt0 = p.norm.split(" ")[0] || "", pn0 = (p.norm.match(/\d+/) || [""])[0];
          return tokOk(pt0) && n0 && pn0 === n0;
        });
        if (!hit) {
          const c = parts.filter((p) => !p.used && tokOk(p.norm.split(" ")[0] || ""));
          if (c.length === 1) hit = c[0];
        }
      }
      if (!hit && norm) {          // shared distinctive token (OPR PL2 → IPR PL2)
        const c = parts.filter((p) => !p.used && toks.some((t) => t.length >= 3 && p.norm.split(" ").indexOf(t) >= 0));
        if (c.length === 1) hit = c[0];
      }
      if (!hit && !norm && nameRaw) {   // code-less segment that IS a label part (Meteo Briefing)
        const nn = normTxt(nameRaw);
        hit = parts.find((p) => !p.used && p.norm === nn);
      }
      if (hit) { hit.used = true; return hit.raw; }
      return "";
    };
    const src = String(g.duration_summary || "");
    const out = [], taken = new Set();
    for (const seg of src.split(" · ")) {
      const fields = seg.split("|").map((x) => x.trim()).filter((x) => x !== "");
      if (fields.length < 2) continue;
      const rawName = fields[0];
      const conditional = /^\[suppl\.?\]/i.test(rawName);
      let name = rawName.replace(/^\[suppl\.?\]\s*/i, "").replace(/^\d+\.\s*/, "");
      const ci = name.indexOf(": ");
      if (ci >= 0) name = name.slice(ci + 2);           // drop the chapter header
      let codeRaw = "", periods = null;
      if (fields.length >= 3) { codeRaw = fields[1]; periods = parseInt(fields[fields.length - 1], 10); }
      else { periods = parseInt(fields[1], 10); }
      if (isNaN(periods)) continue;
      let code = adopt(codeRaw, codeRaw ? "" : name) || codeRaw || synthCode(name, taken);
      if (taken.has(code)) code = synthCode(code, taken);
      taken.add(code);
      out.push({ code: code, name: name, periods: periods, conditional: conditional, group: g.id, uid: g.uid });
    }
    if (!out.length) {              // WSGES · CO 109 · CO 110 — one course = the group
      out.push({ code: label || g.id, name: g.name || "", periods: g.periods == null ? 0 : g.periods, conditional: false, group: g.id, uid: g.uid });
    }
    return out;
  }
  function buildCourses() {
    G.courses = new Map();          // lesson uid -> [course]
    G.courseIx = new Map();         // uid + "::" + code -> course
    for (const g of G.groups) {
      if (G.kind.get(g.uid) !== "lessons") continue;
      const list = parseGroupCourses(g);
      G.courses.set(g.uid, list);
      for (const c of list) G.courseIx.set(g.uid + "::" + c.code, c);
    }
  }
  const coursesOf = (uid) => (G.courses && G.courses.get(uid) ? G.courses.get(uid).slice() : []);
  const courseOf = (uid, code) => (G.courseIx && G.courseIx.get(uid + "::" + String(code == null ? "" : code))) || null;

  /* The printed flow chart draws two legitimate loops, because a ground BLOCK
     is one node here while the chart splits it around its exam:
       GT-FLYPRIN → CO 190 → GT-FLYPRIN   ·   GT-INSTR → IN 190 → GT-INSTR
     Left alone they deadlock readiness. A DFS in syllabus order marks every
     edge that points back onto the stack and those are dropped — the earlier
     node of the pair stays the prerequisite, the later one the successor.   */
  function breakCycles() {
    const color = new Map();                        // 1 = on stack, 2 = done
    for (const root of G.all) {
      if (color.get(root)) continue;
      color.set(root, 1);
      const stack = [{ u: root, i: 0 }];
      while (stack.length) {
        const top = stack[stack.length - 1];
        const outs = G.fwd.get(top.u) || [];
        if (top.i >= outs.length) { color.set(top.u, 2); stack.pop(); continue; }
        const e = outs[top.i++];
        const c = color.get(e.to) || 0;
        if (c === 1) { G.dropped.add(e.from + ">" + e.to); continue; }
        if (c === 2) continue;
        color.set(e.to, 1);
        stack.push({ u: e.to, i: 0 });
      }
    }
  }

  /* Where the syllabus draws no incoming edge at all: previous sortie of the
     same Training Section, else the last sortie of the preceding section of
     the same band + track (identical rule to schedval.js).                  */
  function fallbackPred(uid) {
    const s = G.node.get(uid);
    if (!s || uid.charAt(0) !== "s") return null;
    const sibs = G.byGroup.get(s.group) || [];
    const i = sibs.indexOf(s);
    if (i > 0) return sibs[i - 1].uid;
    const line = G.groups.filter((g) => g.band === s.band && g.track === s.track);
    const gi = line.map((g) => g.id).indexOf(s.group);
    if (gi <= 0) return null;
    const list = G.byGroup.get(line[gi - 1].id) || [];
    return list.length ? list[list.length - 1].uid : null;
  }

  function computePrereq(uid) {
    const out = [];
    for (const m of (G.rev.get(uid) || [])) {
      if (G.dropped.has(m.from + ">" + m.to)) continue;
      if (!G.kind.has(m.from)) continue;              // container nodes never gate
      out.push({ uid: m.from, kinds: m.kinds.slice(), via: "edge" });
    }
    if (!out.length) {
      const fb = fallbackPred(uid);
      if (fb && G.kind.has(fb)) out.push({ uid: fb, kinds: ["inferred"], via: "inferred" });
    }
    return out;
  }

  function buildSections() {
    const push = (kind, sec) => { if (sec.uids.length) G.sections[kind].push(sec); };
    for (const k of ["lessons", "exams"]) {
      push(k, { id: k, label: KIND_LABEL[k], track: "", band: k, uids: G.ofKind[k].slice() });
    }
    for (const g of G.groups) {
      if (g.band !== "fs" && g.band !== "flights") continue;
      const list = (G.byGroup.get(g.id) || []).map((s) => s.uid);
      push(g.band, {
        id: g.id, track: g.track, band: g.band, uids: list,
        label: (TRACK_LABEL[g.track] || g.track) + " · " + g.id + (g.name ? " — " + g.name : ""),
      });
    }
  }

  function buildHay() {
    for (const u of G.all) {
      const n = G.node.get(u);
      const g = u.charAt(0) === "s" ? G.node.get("g:" + n.group) : null;
      const bits = [
        n.id, n.label_verbatim, n.label, n.name, n.group, n.section_verbatim,
        g ? g.name : "", TRACK_LABEL[n.track] || n.track, G.kind.get(u), KIND_LABEL[G.kind.get(u)],
        n.night ? "night" : "", n.checkride ? "checkride" : "",
        n.first_solo ? "first solo" : "", n.solo_candidate ? "solo candidate" : "",
      ];
      /* Round 5 — the group's courses are searchable too */
      for (const c of (G.courses && G.courses.get(u)) || []) bits.push(c.code, c.name);
      G.hay.set(u, bits.filter(Boolean).join(" ").toLowerCase());
    }
  }

  /* ── node description (what the UI and Phase B render) ──────────────────── */
  function describe(uid) {
    const n = G.node.get(uid);
    if (!n) return null;
    const kind = G.kind.get(uid) || null;
    const isSortie = uid.charAt(0) === "s";
    return {
      uid: uid, id: n.id, kind: kind,
      label: n.label_verbatim || n.label || n.id,
      short: isSortie ? (n.label_verbatim || n.id) : n.id,
      name: n.name || "",
      track: n.track || "shared", trackLabel: TRACK_LABEL[n.track] || n.track || "",
      band: n.band, group: isSortie ? n.group : n.id,
      hours: isSortie ? (n.hours == null ? null : n.hours) : null,
      periods: isSortie ? null : (n.periods == null ? null : n.periods),
      night: !!n.night, checkride: !!n.checkride,
      first_solo: !!n.first_solo, solo_candidate: !!n.solo_candidate,
      page_pdf: n.page_pdf || (n.source && n.source.page_pdf) || null,
    };
  }
  const labelOf = (uid) => { const d = describe(uid); return d ? d.label : uid; };

  function search(q, kind) {
    const terms = String(q || "").toLowerCase().split(/\s+/).filter(Boolean);
    const pool = kind ? G.ofKind[kind] || [] : G.all;
    if (!terms.length) return pool.slice();
    return pool.filter((u) => {
      const h = G.hay.get(u) || "";
      for (const t of terms) if (h.indexOf(t) < 0) return false;
      return true;
    });
  }

  /* ── training log → per-node status ─────────────────────────────────────── */
  /* spec §2 names the column `node`; `uid` is accepted as a legacy spelling. */
  const evNode = (ev) => (ev && (ev.node || ev.uid)) || "";
  const evDate = (ev) => ev.end_date || ev.date || "";

  /* Round 5: a class-scope event may carry SEVERAL classes — the new array
     field `classes` UNION the legacy string field `class`; a student matches
     if their class is the string OR in the array. */
  function evClasses(ev) {
    const out = [];
    if (ev && Array.isArray(ev.classes)) for (const c of ev.classes) if (c && out.indexOf(c) < 0) out.push(c);
    if (ev && ev.class && out.indexOf(ev.class) < 0) out.push(ev.class);
    return out;
  }
  function appliesTo(ev, code) {
    if (!ev || !evNode(ev)) return false;
    if (ev.scope === "student") return ev.student === code;
    if (ev.scope === "class") {
      for (const c of evClasses(ev)) if (window.SchedStore.membersOf(c).indexOf(code) >= 0) return true;
    }
    return false;
  }
  const absentIn = (ev, code) => (Array.isArray(ev.absent) ? ev.absent : []).find((a) => a.student === code) || null;

  function passPct() { return num(window.SchedStore.cfg("exam_pass_pct", 80)) || 80; }

  /* status of every flowchart node for one student.
       pending        nothing recorded
       completed      done — unlocks the successors
       repeat         flown/sat and must be redone (score below the pass mark
                      counts as repeat)
       absent_makeup  the class event ran without this student — owed as a makeup
     The last event by date wins, so a makeup recorded later overwrites the
     absence. Class membership is read as it stands TODAY.                    */
  function state(code) {
    if (cache.state.has(code)) return cache.state.get(code);
    const out = {};
    for (const u of G.all) out[u] = { status: "pending", date: null, eventId: null, score: null, reason: null };
    const log = (window.SchedStore.get("trainingLog") || [])
      .map((ev, i) => ({ ev: ev, i: i }))
      .filter((x) => appliesTo(x.ev, code))
      .sort((a, b) => (evDate(a.ev) < evDate(b.ev) ? -1 : evDate(a.ev) > evDate(b.ev) ? 1 : a.i - b.i));

    const courseEvs = new Map();                        // Round 5: lesson uid -> [x]
    for (const x of log) {
      const ev = x.ev;
      const u = evNode(ev);
      if (!out[u]) continue;                            // node not in this graph
      /* Round 5 — a per-COURSE lesson event never flips the group on its own:
         the group completes when EVERY course reaches its period total (or a
         legacy group-level event exists — the seed path, handled below). */
      if (ev.course != null && ev.course !== "" && G.kind.get(u) === "lessons" && G.courses.has(u)) {
        let a = courseEvs.get(u); if (!a) { a = []; courseEvs.set(u, a); }
        a.push(x);
        continue;
      }
      const abs = absentIn(ev, code);
      const sc = num(ev.score);
      let status;
      if (abs) status = "absent_makeup";
      /* Round 2 vocabulary: lag (ΥΣΤΕΡΗΣΗ) / fail (ΑΠΟΤΥΧΙΑ) — the legacy
         "repeat" is read as lag; all three leave the node owed. */
      else if (ev.result === "repeat" || ev.result === "lag" || ev.result === "fail") status = "repeat";
      else if (ev.result === "score") status = sc != null && sc >= passPct() ? "completed" : "repeat";
      else status = "completed";
      out[u] = {
        status: status, date: evDate(ev), eventId: ev.id, score: sc,
        reason: abs ? (abs.reason || "") : null,
        instructor: ev.instructor || null, device: ev.device || null,
      };
    }
    /* Round 5 — aggregate the course events: (a) a legacy group-level event
       already completed the group (backward compat — never downgraded);
       (b) full coverage of every non-conditional course completes it;
       an absence on a course leaves it owed as a NAMED makeup. */
    courseEvs.forEach((list, u) => {
      if (out[u].status === "completed") return;
      const cov = covCore(u, list, code);
      if (cov.complete) {
        out[u] = { status: "completed", date: cov.lastDate, eventId: cov.lastId, score: null,
          reason: null, instructor: cov.lastIp, device: null };
      } else if (cov.owed.length) {
        out[u] = { status: "absent_makeup", date: cov.lastDate, eventId: cov.lastId, score: null,
          reason: "missed course: " + cov.owed.map((c) => c.code).join(" · "), instructor: null, device: null };
      }
      /* partial coverage without absences → the node simply stays pending */
    });
    cache.state.set(code, out);
    return out;
  }

  /* ── Round 5 · course coverage ──────────────────────────────────────────
     covCore aggregates a student's course events of ONE group; done periods
     clamp at the course total for the summaries. An absent course stays owed
     until the student's own coverage reaches the total (a later makeup event
     clears it). periods_done missing/blank counts as the FULL course.       */
  function covCore(uid, list, code) {
    const rows = (G.courses.get(uid) || []).map((c) => ({
      code: c.code, name: c.name, periods: c.periods, conditional: c.conditional,
      done: 0, absent: false, absentReason: "",
    }));
    const by = new Map(rows.map((r) => [r.code, r]));
    let lastDate = null, lastId = null, lastIp = null;
    for (const x of list) {
      const ev = x.ev;
      const r = by.get(String(ev.course));
      if (!r) continue;                                 // unknown course code
      if (absentIn(ev, code)) {
        const a = absentIn(ev, code);
        r.absent = true; r.absentReason = a.reason || "";
        continue;
      }
      const p = num(ev.periods_done);
      r.done += p == null ? r.periods : Math.max(0, p);
      const d = evDate(ev);
      if (lastDate == null || d >= lastDate) { lastDate = d; lastId = ev.id; lastIp = ev.instructor || null; }
    }
    let done = 0, total = 0, complete = true, anyReq = false;
    const owed = [];
    for (const r of rows) {
      r.done = Math.min(r.done, r.periods);
      r.complete = r.periods > 0 && r.done >= r.periods;
      if (r.absent && r.done < r.periods) owed.push(r);
      if (!r.conditional && r.periods > 0) {
        anyReq = true;
        total += r.periods;
        done += r.done;
        if (!r.complete) complete = false;
      }
    }
    return { uid: uid, courses: rows, done: done, total: total, owed: owed,
      complete: anyReq && complete, anyEvent: list.length > 0,
      lastDate: lastDate, lastId: lastId, lastIp: lastIp };
  }
  /* per-STUDENT coverage of one lesson group (cached) */
  function courseCoverage(code, uid) {
    if (!G.courses || !G.courses.has(uid)) return null;
    const key = code + "|" + uid;
    if (cache.cov.has(key)) return cache.cov.get(key);
    const list = [];
    (window.SchedStore.get("trainingLog") || []).forEach((ev, i) => {
      if (ev.course == null || ev.course === "" || evNode(ev) !== uid) return;
      if (!appliesTo(ev, code)) return;
      list.push({ ev: ev, i: i });
    });
    const cov = covCore(uid, list, code);
    /* the legacy group-level completion (seed) shows as complete too */
    if (!cov.complete && (state(code)[uid] || {}).status === "completed") cov.completeLegacy = true;
    cache.cov.set(key, cov);
    return cov;
  }
  /* class-pace coverage: per course the MAX over the members of the selected
     class(es) — absences diverge per student and surface as makeups instead */
  function classCoverage(classes, uid) {
    if (!G.courses || !G.courses.has(uid)) return null;
    const mem = [];
    for (const cl of [].concat(classes || [])) {
      for (const m of window.SchedStore.membersOf(cl || "")) if (mem.indexOf(m) < 0) mem.push(m);
    }
    const base = covCore(uid, [], "");                  // zeroed skeleton
    if (!mem.length) return base;
    let legacy = false;
    for (const m of mem) {
      const cov = courseCoverage(m, uid);
      if (!cov) continue;
      if (cov.complete || cov.completeLegacy) legacy = legacy || !!cov.completeLegacy;
      cov.courses.forEach((r, i) => { if (r.done > base.courses[i].done) base.courses[i].done = r.done; });
    }
    let done = 0, complete = true, anyReq = false;
    for (const r of base.courses) {
      r.complete = r.periods > 0 && r.done >= r.periods;
      if (!r.conditional && r.periods > 0) { anyReq = true; done += r.done; if (!r.complete) complete = false; }
    }
    base.done = done;
    base.complete = anyReq && complete;
    base.completeLegacy = legacy;
    return base;
  }
  const statusOf = (code, uid) => (state(code)[uid] || { status: "pending" }).status;

  /* ── gates ──────────────────────────────────────────────────────────────── */
  const gateOpen = (g) => {
    const o = String(g.outcome || "").toLowerCase();
    return !o || o === "open" || o === "pending";
  };
  function openGates(code) {
    return (window.SchedStore.get("gates") || [])
      .filter((g) => g.student === code && gateOpen(g))
      .map((g) => {
        const t = normGate(g.type);
        return Object.assign({}, g, {
          gateType: t, label: GATE_LABEL[t] || g.type, title: GATE_TITLE[t] || "",
          locksFlying: !!GATE_LOCKS_FLYING[t],
          maxDualPerDay: t === "kepe_in" ? 1 : null,
        });
      });
  }
  /* null = free. Otherwise {reason, gate} — flying kinds only; ground training
     keeps running while a gate is open. EXCEPTION (Round 2, fail-16): an active
     ΠΔ 29/2020 state blocks EVERY kind — flights, F/S, exams and lessons. */
  function blockFor(code, kind) {
    const cq = window.SchedConsq;
    if (cq) {
      const pd = cq.pd(code);
      if (pd) {
        return {
          pd: pd, req: pd.req || "fail-16", vb: cq.vb(pd.req || "fail-16"),
          reason: "PD 29/2020 in force (" + pd.srcLabel + (pd.since ? ", " + window.fmtDMY(pd.since) : "")
            + ") — ALL activities stop · " + cq.pdStageText(pd),
        };
      }
    }
    if (kind !== "flights" && kind !== "fs") return null;
    const g = openGates(code).find((x) => x.locksFlying);
    if (!g) return null;
    return {
      gate: g,
      reason: "open " + g.label + (g.date ? " of " + window.fmtDMY(g.date) : "") + " — flying stays locked until it is closed",
    };
  }

  /* ── readiness frontier ─────────────────────────────────────────────────── */
  /* round 0 = every prerequisite completed → offered plain.
     round k = every missing prerequisite is coverable the same day (already on
     the board via plannedUids · an owed exam/makeup · something that is itself
     ready) → offered *italic* with pendingReason. Depth caps both the number
     of rounds and the number of options, per spec §4 (lookahead 3).          */
  function frontier(code, opts) {
    opts = opts || {};
    const depth = Math.max(1, parseInt(opts.depth, 10) || 3);
    const planned = (opts.plannedUids || []).filter((u) => G.kind.has(u));
    const ck = code + "|" + depth + "|" + planned.slice().sort().join(",");
    if (cache.frontier.has(ck)) return cache.frontier.get(ck);

    const stt = state(code);
    const done = new Set(), owed = new Set();
    for (const u of G.all) {
      const s = stt[u].status;
      if (s === "completed") done.add(u);
      else if (s === "absent_makeup" || s === "repeat") owed.add(u);
    }
    /* Round 2 (fail-19): a passed Aptitude Exam unlocks continuation PAST the
       failed first «ΜΟΝΟΣ» — the engine hands over the uids to treat as done. */
    if (window.SchedConsq) {
      window.SchedConsq.virtualDone(code).forEach((u) => {
        if (stt[u]) { done.add(u); owed.delete(u); }
      });
    }
    const missOf = (u) => (G.prereq.get(u) || []).filter((p) => !done.has(p.uid));

    const round = new Map();
    const cover = new Set(done);
    for (const u of G.all) {
      if (done.has(u)) continue;
      if (!missOf(u).length) { round.set(u, { r: 0, missing: [] }); cover.add(u); }
    }
    owed.forEach((u) => cover.add(u));
    planned.forEach((u) => cover.add(u));

    for (let r = 1; r <= depth; r++) {
      const batch = [];
      for (const u of G.all) {
        if (done.has(u) || round.has(u)) continue;
        const miss = missOf(u);
        if (miss.length && miss.every((p) => cover.has(p.uid))) batch.push({ u: u, miss: miss });
      }
      if (!batch.length) break;
      for (const b of batch) round.set(b.u, { r: r, missing: b.miss });
      for (const b of batch) cover.add(b.u);
    }
    const res = { stt: stt, round: round, done: done, owed: owed };
    cache.frontier.set(ck, res);
    return res;
  }

  function option(uid, r, missing, stt) {
    const d = describe(uid);
    const s = stt[uid] || { status: "pending" };
    const miss = (missing || []).map((p) => ({
      uid: p.uid, label: labelOf(p.uid), kind: G.kind.get(p.uid),
      status: (stt[p.uid] || { status: "pending" }).status, via: p.via,
    }));
    d.conditional = r > 0;
    d.round = r;
    d.status = s.status;
    d.makeup = s.status === "absent_makeup" || s.status === "repeat";
    d.reason = s.reason || null;                 // Round 5: names the missed course
    d.lastDate = s.date || null;
    d.missing = miss;
    d.pendingReason = miss.length
      ? "pending: " + miss.map((m) => m.label + (m.status === "absent_makeup" ? " (makeup)" : m.status === "repeat" ? " (repeat)" : "")).join(" · ")
      : null;
    return d;
  }

  /* kind ∈ lessons | exams | fs | flights — the returned options are ALWAYS of
     that kind alone (spec §4: strict separation). Order: owed makeups first,
     then round, then syllabus order. The array carries .blocked/.blockReason
     when an open gate locks the kind (and is then empty).
     opts.plannedUids = what this student ALREADY has on today's board: it
     unlocks the same-day successors and, unless includePlanned is set, drops
     out of the list so the second row of the day offers the next step.      */
  function nextFor(code, kind, opts) {
    opts = opts || {};
    const depth = Math.max(1, parseInt(opts.depth, 10) || 3);
    const out = [];
    out.blocked = false; out.blockReason = null; out.gate = null;
    if (!G.ofKind[kind]) return out;

    const blk = blockFor(code, kind);
    if (blk) { out.blocked = true; out.blockReason = blk.reason; out.gate = blk.gate; return out; }

    const f = frontier(code, opts);
    const skip = opts.includePlanned ? new Set() : new Set(opts.plannedUids || []);
    const hits = G.ofKind[kind].filter((u) => f.round.has(u) && !skip.has(u)).map((u) => {
      const rr = f.round.get(u);
      return { u: u, r: rr.r, missing: rr.missing, makeup: f.owed.has(u) };
    });
    /* Owed makeups first (spec §3), then everything that is ready today, then
       the conditional ones — each band in syllabus order, so the dropdown
       always reads down the flow chart and never jumps backwards.          */
    hits.sort((a, b) => {
      if (a.makeup !== b.makeup) return a.makeup ? -1 : 1;
      const ca = a.r === 0 ? 0 : 1, cb = b.r === 0 ? 0 : 1;
      if (ca !== cb) return ca - cb;
      return G.rank.get(a.u) - G.rank.get(b.u);
    });

    let picks = hits.slice(0, depth);
    if (!picks.length && opts.fallback !== false) {
      /* Cold start / deep block: nothing qualifies within the lookahead. Show
         the earliest unfinished sorties of the kind, italic, with the reason —
         a dead dropdown would be worse than an honest conditional one.      */
      picks = G.ofKind[kind]
        .filter((u) => f.stt[u].status !== "completed" && !skip.has(u))
        .slice(0, depth)
        .map((u) => ({ u: u, r: depth + 1, missing: (G.prereq.get(u) || []).filter((p) => f.stt[p.uid].status !== "completed") }));
    }
    for (const h of picks) out.push(option(h.u, h.r, h.missing, f.stt));

    /* Round 2 — consequence engine trims and annotates the flying dropdowns:
       · fail-19: a failed first «ΜΟΝΟΣ» is never re-offered
       · fail-12: categories with an APT EXAM pending are hard-locked
       · fail-11: while the F/S ladder runs, the SAME F/S exercise is the ONLY
         next F/S step
       · fail-10: the repeat sortie carries its "repeat: <maneuvers>" chip    */
    const cq = window.SchedConsq;
    if (cq && (kind === "flights" || kind === "fs")) {
      const skip2 = cq.skipUids(code);
      const locked = cq.lockedTracks(code);
      const lad = kind === "fs" ? cq.fsLadder(code) : null;
      const keep = [];
      for (const o of out) {
        if (skip2.has(o.uid)) continue;
        if (locked.has(o.track) && o.uid !== (lad && lad.uid)) continue;
        if (lad && o.uid !== lad.uid) continue;
        const rn = cq.repeatNoteFor(code, o.uid);
        if (rn) {
          o.repeatNote = rn;
          o.pendingReason = o.pendingReason ? o.pendingReason + " · " + rn : rn;
        }
        keep.push(o);
      }
      if (lad && !keep.some((o) => o.uid === lad.uid)) {
        const f2 = frontier(code, opts);
        const o = option(lad.uid, 0, [], f2.stt);
        o.repeatNote = "repeat: " + (lad.maneuvers || "the same F/S exercise");
        o.pendingReason = o.repeatNote + " — fail-11 ladder, attempt " + (lad.fails + 1) + " of 3";
        keep.unshift(o);
      }
      out.length = 0;
      keep.forEach((o) => out.push(o));
      if (locked.size && !lad) {
        out.lockedNote = "APT EXAM pending — " + [...locked].map((t) => TRACK_LABEL[t] || t).join(" · ")
          + " progress locked until it is passed (fail-12)";
      }
    }
    return out;
  }

  /* Everything the student owes in the OTHER kinds — the informative chips of
     spec §4, which must never appear as an option in the wrong dropdown.     */
  function pendingOtherKinds(code) {
    const f = frontier(code, { depth: 1 });
    const out = {};
    for (const k of KINDS) {
      const makeups = [], ready = [];
      for (const u of G.ofKind[k]) {
        const s = f.stt[u];
        if (s.status === "absent_makeup" || s.status === "repeat") makeups.push(option(u, 0, [], f.stt));
        else if (f.round.has(u) && f.round.get(u).r === 0) ready.push(option(u, 0, [], f.stt));
      }
      out[k] = {
        kind: k, label: KIND_LABEL[k], short: KIND_SHORT[k],
        makeups: makeups, ready: ready, due: makeups.length,
        next: ready[0] || null,
        chip: makeups.length ? KIND_SHORT[k] + " due ×" + makeups.length : null,
        title: makeups.length ? makeups.map((m) => m.label + (m.reason ? " — " + m.reason : "") + " (" + m.status.replace("_", " ") + ")").join(" · ") : null,
      };
    }
    return out;
  }

  /* ── idle days ──────────────────────────────────────────────────────────── */
  const DAY = 86400000;
  function dnum(iso) { const t = Date.parse(String(iso) + "T00:00:00Z"); return isNaN(t) ? null : Math.floor(t / DAY); }
  function isWorkday(n) { const d = new Date(n * DAY).getUTCDay(); return d !== 0 && d !== 6; }
  function workdaysBetween(fromIso, toIso) {
    const a = dnum(fromIso), b = dnum(toIso);
    if (a == null || b == null || b <= a) return 0;
    let c = 0;
    for (let n = a + 1; n <= b; n++) if (isWorkday(n)) c++;
    return c;
  }
  /* person → sorted activity dates. Built once per store change: the roster
     asks for 45 counters on every render and rescanning 2 000 events each time
     is the difference between a 45 ms and a 5 ms repaint.                    */
  let actIdx = null;
  function activityIndex() {
    if (actIdx) return actIdx;
    const m = new Map();
    const add = (p, d) => { if (!p || !d) return; let a = m.get(p); if (!a) { a = []; m.set(p, a); } a.push(d); };
    for (const ev of (window.SchedStore.get("trainingLog") || [])) {
      if (ev.special === "nfs") continue;         // Round 6 — a no-fly SHEET is not activity
      const d = evDate(ev);
      if (!d) continue;
      if (ev.instructor) add(ev.instructor, d);
      /* Round 5 — a multi-IP lesson (instructors[]) is activity for each IP */
      if (Array.isArray(ev.instructors)) for (const s of ev.instructors) if (s && s.ip && s.ip !== ev.instructor) add(s.ip, d);
      if (ev.scope === "student") { if (!absentIn(ev, ev.student)) add(ev.student, d); }
      else if (ev.scope === "class") {
        const abs = new Set((ev.absent || []).map((a) => a.student));
        const seen = new Set();
        for (const cl of evClasses(ev)) {
          for (const c of window.SchedStore.membersOf(cl)) if (!abs.has(c) && !seen.has(c)) { seen.add(c); add(c, d); }
        }
      }
    }
    for (const r of (window.SchedStore.get("dutyRoster") || [])) {
      if (!r.date) continue;
      /* duty roster v2 (per-wave duties) with the legacy shape as fallback */
      const v2 = r.sof_a !== undefined || r.sof_b !== undefined || r.rsu !== undefined
        || r.ground_1 !== undefined || r.ground_2 !== undefined;
      const duties = v2 ? [r.sof_a, r.sof_b, r.rsu, r.ground_1, r.ground_2] : [r.SOF, r.RSU, r.ground_instructor];
      duties.concat(r.alt_instructors || []).forEach((p) => add(p, r.date));
    }
    m.forEach((a) => a.sort());
    actIdx = m;
    return m;
  }
  /* Working days since the person's last recorded activity, up to and including
     `date`. null = nothing ever recorded — Phase B sorts those as "most needed".
     Duty days count as activity for instructors. No holiday calendar in v1.  */
  function idleDays(person, date) {
    const ref = date || todayISO();
    if (dnum(ref) == null) return null;
    const arr = activityIndex().get(person);
    if (!arr || !arr.length) return null;
    let lo = 0, hi = arr.length - 1, last = null;      // latest entry ≤ ref
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (arr[mid] <= ref) { last = arr[mid]; lo = mid + 1; } else hi = mid - 1;
    }
    return last === null ? null : workdaysBetween(last, ref);
  }
  function todayISO() { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }

  /* ── cache ──────────────────────────────────────────────────────────────── */
  function invalidate() { cache.state.clear(); cache.frontier.clear(); cache.cov.clear(); actIdx = null; }
  const wire = () => {
    if (window.SchedStore && !window.SchedStore._readyWired) {
      window.SchedStore._readyWired = true;
      window.SchedStore.subscribe(invalidate);
    }
  };
  wire(); setTimeout(wire, 0);

  window.SchedReady = {
    KINDS, KIND_LABEL, KIND_SHORT, TRACK_LABEL, GATE_LABEL,
    load, invalidate,
    node: (uid) => G.node.get(uid) || null,
    describe, label: labelOf, kindOf: (uid) => G.kind.get(uid) || null,
    nodes: (kind) => (kind ? (G.ofKind[kind] || []).slice() : G.all.slice()),
    sections: (kind) => (G.sections[kind] || []).slice(),
    rank: (uid) => (G.rank.has(uid) ? G.rank.get(uid) : Infinity),
    prereqsOf: (uid) => (G.prereq.get(uid) || []).slice(),
    search,
    state, statusOf,
    nextFor, frontier, pendingOtherKinds,
    openGates, blockFor,
    idleDays, workdaysBetween, todayISO,
    /* Round 5 — course decomposition + coverage + multi-class events */
    coursesOf, courseOf, courseCoverage, classCoverage, classesOf: evClasses,
    _graph: G,
  };
})();

/* ══════════════════════════════════════════════════════════════════════════
   ①b PEOPLE — window.SchedPeople (Round 4)
   OIDs are the PRIMARY KEYS of persons. Training events keep referencing
   people by CODE (historical facts, unchanged); ONLY the student fields
   primary_ip / reserve_ips / avoid_ips store instructor OIDs. A stored value
   that still matches an instructor CODE (pre-Round-4 data) resolves on read
   and is rewritten as an oid on the next save of that student.
   Also here: the "lost instructor" engine (3-01 §24στ(6) — fail-22): avoided
   instructors are DERIVED from the training log (Progress-Test path + any
   evaluator who graded ΥΣΤΕΡΗΣΗ/ΑΠΟΤΥΧΙΑ on an evaluation sortie), returned
   as oids, and unioned with the student's manual avoid_ips list.
   ══════════════════════════════════════════════════════════════════════════ */
(() => {
  const S = () => window.SchedStore;
  const R = () => window.SchedReady;

  const cache = { avoid: new Map(), idx: null };
  function invalidate() { cache.avoid.clear(); cache.idx = null; }
  const wire = () => {
    if (window.SchedStore && !window.SchedStore._peopleWired) {
      window.SchedStore._peopleWired = true;
      window.SchedStore.subscribe(invalidate);
    }
  };
  wire(); setTimeout(wire, 0);

  function idx() {
    if (cache.idx) return cache.idx;
    const byOid = new Map(), byCode = new Map();
    for (const i of (S().get("instructors") || [])) {
      if (i.oid) byOid.set(String(i.oid), i);
      if (i.code) byCode.set(String(i.code), i);
    }
    cache.idx = { byOid: byOid, byCode: byCode };
    return cache.idx;
  }
  /* stored ref (oid OR legacy code) → instructor record — migration on READ */
  function ip(ref) {
    if (!ref) return null;
    const x = idx();
    return x.byOid.get(String(ref)) || x.byCode.get(String(ref)) || null;
  }
  const ipOid = (ref) => { const r = ip(ref); return r ? (r.oid || "") : ""; };
  const ipCode = (ref) => { const r = ip(ref); return r ? (r.code || "") : String(ref == null ? "" : ref); };
  const departed = (x) => { const r = x && typeof x === "object" ? x : ip(x); return !!(r && r.status === "departed"); };
  const activeIps = () => (S().get("instructors") || []).filter((i) => (i.status || "active") !== "departed");

  /* one-time boot pass: every person gets a stable oid (never editable).
     Round 12b — bookkeeping, not an edit: it runs on every boot, invents no
     fact and changes nothing the user typed, so it goes through the store's
     system() hole rather than being refused in view-only mode (a roster with
     no OIDs would break the Currency matrix for a reader who may not edit). */
  function ensure() {
    S().system(() => {
      for (const coll of ["students", "instructors"]) {
        for (const rec of (S().get(coll) || []).slice()) {
          if (!rec.oid) S().upsert(coll, { code: rec.code, oid: S().uid("oid") });
        }
      }
    });
  }

  /* how strongly an instructor is referenced — decides delete vs "departed" */
  function references(rec) {
    const oid = rec.oid || "", code = rec.code || "";
    let log = 0, stu = 0, duty = 0;
    for (const ev of (S().get("trainingLog") || [])) if (ev.instructor === code) log++;
    for (const s of (S().get("students") || [])) {
      const refs = [s.primary_ip].concat(s.reserve_ips || [], s.avoid_ips || []).filter(Boolean);
      if (refs.some((r) => r === code || (oid && r === oid))) stu++;
    }
    for (const r of (S().get("dutyRoster") || [])) {
      const vals = [r.sof_a, r.sof_b, r.rsu_a, r.rsu_b, r.rsu, r.SOF, r.RSU,
        r.ground_1, r.ground_2, r.ground_instructor].concat(r.alt_instructors || []);
      if (vals.indexOf(code) >= 0) duty++;
    }
    return { log: log, students: stu, duty: duty, any: log + stu + duty > 0 };
  }

  /* ── the LOST-INSTRUCTOR engine (fail-22, 3-01 §24στ(6)(α),(δ)) ─────────
     Derived per student from the log:
       · Progress-Test path: when dp_ae / dp_cdr special sorties exist, the
         instructors recorded on the lag/fail flying events (same category as
         the dp, or all when the dp carries none) that led there are avoided;
       · negative evaluators: the instructor of a FAILED checkride and of any
         dp/apt/board special graded LAG/FAIL is avoided afterwards;
       · plus the consequence engine's own avoid note (failed-checkride IP
         after a passed Progress Test).
     Returned entries: {code, oid, reason, manual:false}.                   */
  function avoidedIps(code) {
    if (cache.avoid.has(code)) return cache.avoid.get(code);
    const out = new Map();
    const add = (ref, reason) => {
      if (!ref || ref === "SOLO") return;
      const rec = ip(ref);
      const c = rec ? rec.code : String(ref);
      if (!out.has(c)) out.set(c, { code: c, oid: rec ? (rec.oid || "") : "", reason: reason, manual: false });
    };
    const CQ = window.SchedConsq || null;
    const isNeg = (ev) => {
      const r = CQ ? CQ.normRes(ev) : String(ev.result || "");
      return r === "lag" || r === "fail" || r === "repeat";
    };
    const evs = [];
    (S().get("trainingLog") || []).forEach((ev, i) => {
      if (ev.scope !== "student" || ev.student !== code) return;
      const kind = ev.special ? (ev.kind || "flights") : R().kindOf(ev.node || ev.uid || "");
      if (kind !== "flights" && kind !== "fs") return;
      evs.push({ ev: ev, i: i, date: ev.end_date || ev.date || "" });
    });
    evs.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.i - b.i));
    for (const x of evs) {
      const ev = x.ev;
      if (ev.special) {
        if ((ev.special === "dp_ae" || ev.special === "dp_cdr" || ev.special === "apt" || ev.special === "board") && isNeg(ev)) {
          add(ev.instructor, "graded LAG/FAIL on the " + ev.special.replace("_", "-").toUpperCase() + " evaluation of " + x.date);
        }
      } else {
        const d = R().describe(ev.node || ev.uid || "");
        if (d && d.checkride && isNeg(ev)) add(ev.instructor, "graded FAIL on checkride " + d.label + " (" + x.date + ")");
      }
    }
    const dps = evs.filter((x) => x.ev.special === "dp_ae" || x.ev.special === "dp_cdr");
    for (const dp of dps) {
      const cat = String(dp.ev.category || "");
      for (const x of evs) {
        if (x.ev.special || x.date > dp.date || !isNeg(x.ev)) continue;
        const d = R().describe(x.ev.node || x.ev.uid || "");
        if (!d) continue;
        if (cat && d.track !== cat) continue;
        add(x.ev.instructor, "instructor on the " + d.label + " LAG/FAIL that led to the Progress Test");
      }
    }
    if (CQ) {
      const n = CQ.pdNote(code);
      if (n && n.avoidIp) add(n.avoidIp, "flew the failed sortie — Progress Test passed, continue with another instructor");
    }
    const arr = [...out.values()];
    cache.avoid.set(code, arr);
    return arr;
  }
  /* engine union manual avoid_ips — what every consumer should use */
  function avoidedAll(code) {
    const arr = avoidedIps(code).slice();
    const seen = new Set(arr.map((a) => a.code));
    const s = S().find("students", code);
    for (const ref of ((s && s.avoid_ips) || [])) {
      const rec = ip(ref);
      const c = rec ? rec.code : String(ref);
      if (!c || seen.has(c)) continue;
      seen.add(c);
      arr.push({ code: c, oid: rec ? (rec.oid || "") : "", reason: "manual avoid list", manual: true });
    }
    return arr;
  }
  function avoidMap(code) {
    const m = new Map();
    if (!code) return m;
    for (const a of avoidedAll(code)) m.set(a.code, a);
    return m;
  }

  window.SchedPeople = {
    ensure, ip, ipOid, ipCode, departed, activeIps, references,
    avoidedIps, avoidedAll, avoidMap, invalidate,
  };
})();

/* ══════════════════════════════════════════════════════════════════════════
   ② UI — window.schInit()
   ══════════════════════════════════════════════════════════════════════════ */
(() => {
  const $id = (x) => document.getElementById(x);
  const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ESC[c]);
  const S = () => window.SchedStore;
  const R = () => window.SchedReady;

  /* Round 12a — DISPLAY NAMES. Every person on screen reads «SURNAME N.»
     (SchedStore.personLabel, disambiguated with "(code)" when two people
     collide). nm() renders a stored CODE; nmOpt() is the picker form, which
     also names the code because a dropdown is where the CO still needs the
     key. Codes stay in the edit forms, in the tooltips and in the search. */
  const nm = (code) => S().personLabelOf(null, code);
  const nmOpt = (coll, code) => S().personOptionOf(coll, code);

  /* Round 18 — "bridge" is the cross-check with Wings Ahead
     (app/schedbridge.js, specs/bridge-spec.md). Round 21 (Phase 3) made it
     write in ONE direction: a line the developer confirms becomes an FDMS
     training-log event, past the edit lock and a numbered dialog. Towards
     Wings Ahead and towards the repository it still writes nothing, ever. */
  const PANES = ["board", "roster", "log", "balance", "bridge"];
  const STATUS_OPTS = ["active", "hold", "kepe", "withdrawn"];
  /* "kepe" stays the STORED value for compatibility — the UI says SMS */
  const STATUS_LABEL = { kepe: "SMS" };
  const STATUS_TITLE = { kepe: "Special Monitoring Status" };
  const statusLabel = (s) => STATUS_LABEL[s] || s;
  const AV_CYCLE = ["available", "LV", "SLV", "HLV", "SCL", "OFF", "TO", "AMC"];

  /* ROUND 19 — THE HOVER RULE (user directive, 22/08/2026): «οπου εχουμε
     βελακια που μπορει να επηρεασουν την βαση δεδομενων να εχουμε hover
     εξηγησης.» Every glyph in the Roster and the Training Log that WRITES says
     what it writes, what it leaves alone, and the way back. The read-only ones
     — ↩ Cancel, the filters, the NIGHT badge that only jumps to a Currency
     cell — stay silent on purpose, so a tooltip always means «this stores».
     ⭱ Import roster and 🛠 Repair codes already carried theirs and keep them. */
  const TIP = {
    saveS: "Writes this student’s record to the store — code, rank, class, primary and reserve IP, the manual "
      + "avoid list and the notes, all of it as shown above. It touches nothing in the training log: history "
      + "keeps naming him by the code, so changing the code here is what 🛠 Repair codes exists to do safely. "
      + "A new student is created; an existing one is replaced field by field.",
    delS: "Deletes this student’s ROSTER RECORD. It asks first and names how many training-log entries mention "
      + "him — those entries STAY, and they will point at a code that no longer has a person. Availability rows, "
      + "gates and day-plan lines that name him are not cleaned up either. There is no undo short of ⭱ Import "
      + "of a backup, so take a ⭳ Export first.",
    saveI: "Writes this instructor’s record to the store — code, call sign, rank, status, qualifications and duty "
      + "eligibility. It touches no training-log event and no day plan; both keep naming him by his code.",
    delI: "Deletes this instructor, or — when the log, a student or a duty day still names him — offers to mark "
      + "him DEPARTED instead. An instructor with history is NEVER hard-deleted: departed keeps every past event "
      + "readable and takes him out of every picker and every count of the day. Either way it asks first.",
    av: "One click cycles this person’s availability for the date chosen above — "
      + AV_CYCLE.join(" → ") + " — and stores it immediately, one row per person per day. "
      + "It writes no training-log event and does not touch the roster record. Cycle round to «available» to undo.",
    logEdit: "Opens this event in the form below. Nothing is written until «Update entry» there, and that "
      + "REPLACES this same event — it never creates a second one.",
    logDel: "Deletes this training-log event outright, after asking. The student’s progress is recomputed from "
      + "the log, so whatever this event had unlocked and nothing else still satisfies goes back to locked. "
      + "Currency dates it once wrote are NOT rolled back. There is no undo — take a ⭳ Export first.",
    logSave: "Writes this event to the training log. An event opened with ✎ is REPLACED in place; a new one is "
      + "created with a fresh id. This is the student’s history, and the progress graph is recomputed from it "
      + "the moment it lands.",
  };
  /* Round 2 result vocabulary (spec §3α): flying events say PASS / LAG / FAIL.
     The stored values stay completed / lag / fail — legacy "repeat" is read as
     lag everywhere and never rewritten. */
  const RESULT_OPTS_FLY = [
    { v: "completed", t: "PASS" },
    { v: "lag", t: "LAG (YSTERISI)" },
    { v: "fail", t: "FAIL (APOTYXIA)" },
    { v: "score", t: "Score %" },
  ];
  const RESULT_OPTS_GND = [
    { v: "completed", t: "Completed" },
    { v: "score", t: "Score %" },
  ];
  const RESULT_LABEL = { completed: "PASS", lag: "LAG (YSTERISI)", repeat: "LAG (YSTERISI)", fail: "FAIL (APOTYXIA)" };
  /* special out-of-graph sorties (spec §3α) — form value "sp:<key>", stored as
     {node:"", special:key, category, kind:"flights"} */
  const SP_PREFIX = "sp:";
  const CQ = () => window.SchedConsq || null;
  const spKeyOf = (node) => (String(node || "").indexOf(SP_PREFIX) === 0 ? String(node).slice(SP_PREFIX.length) : "");
  /* Round 6 — NFS (Φύλλο Μη Πτήσης, form Α0473) is a recordable ENTRY like the
     special sorties: {node:"", special:"nfs", kind:"nfs", student, date,
     category, note, ref?} — no instructor, no result, never a flight
     (fail-83: it follows a failed written/oral exam or a no-fly by student
     cause). `ref` optionally names the failed exam node → NFS badge there. */
  const NFS_KEY = "nfs";
  const NFS_CATS = [
    { v: "written", t: "written exam failure" },
    { v: "oral", t: "oral exam failure" },
    { v: "other", t: "no-fly — student cause (other)" },
  ];
  const NFS_CAT_LABEL = { written: "written exam failure", oral: "oral exam failure", other: "no-fly — student cause" };
  const DEVICE_BY_KIND = { lessons: "GND", exams: "GND", fs: "OFT", flights: "T-6A" };
  const DEVICES = ["T-6A", "OFT", "FTD", "GND"];
  const LOG_ROW_CAP = 400;                  // the seed alone carries ~2 000 events
  const evNode = (ev) => (ev && (ev.node || ev.uid)) || "";
  const evKind = (ev) => (ev && ev.special ? (ev.kind || "flights") : R().kindOf(evNode(ev)));

  const ui = {
    booted: false, pane: "board",
    /* Round 11 — the Roster holds NOTHING currency-related any more (user
       ruling 18/08/2026: «Τίποτα»). The dot, the "owes N" chip, the card and
       their state moved to the Currency tab (app/currency.js). */
    roster: { editS: null, editI: null, addS: false, addI: false, availDate: "", q: "" },
    log: { f: { student: "", kind: "", from: "", to: "", q: "" }, form: null, nodeQ: "", open: false, nfsSuggest: null },
  };

  const P = () => window.SchedPeople;
  /* Round 12b — the edit lock (schedstore.js). Every mutating control of this
     pane is inert while it is off; the seam refuses the write in any case. */
  const canEdit = () => !window.SchedEdit || window.SchedEdit.on();
  const today = () => R().todayISO();
  const students = () => (S().get("students") || []).slice();
  const instructors = () => (S().get("instructors") || []).slice();
  const activeIps = () => instructors().filter((i) => (i.status || "active") !== "departed");
  /* Round 9 — the rank chips are a QUICK PICK over a free-text field, so the
     free text has always been the "Other…" escape. "Lt Col" joins them because
     the global roster carries two (one HAF, one ITAF). */
  const RANKS = ["Cdt", "2Lt", "1Lt", "Capt", "Maj", "Lt Col", "S.Ten", "Lt"];
  /* Round 9 — country of the instructor. A closed pair PLUS the "Other…"
     free-text escape (the audit rule of this round): the squadron flies with
     HAF and ITAF today, and the third air force that arrives tomorrow must not
     need a code change to be recorded. */
  const COUNTRIES = ["HAF", "ITAF"];
  /* Round 9 — the global roster's own two vocabularies, so that what the file
     carries stays EDITABLE here (and identical to the Wings Ahead lists). */
  const DUTIES = ["Squadron Commander", "DO", "Flight Commander", "Evaluator", "Instructor"];
  const LEADERSHIPS = ["Wingman", "2-ship", "4-ship", "Mission Commander"];
  const OTHER = "__other";

  /* ── boot ───────────────────────────────────────────────────────────────── */
  window.schInit = async function schInit() {
    /* Access-code curtain (schedsync.js): while locked, render NOTHING — the
       veiled DOM must hold no data (Ctrl+A / find-in-page must come up empty).
       The deferred call fires the moment the code is accepted.              */
    if (window.SchedLock && window.SchedLock.locked()) {
      window.SchedLock.onUnlock(() => window.schInit());
      return;
    }
    if (ui.booted) { render(); return; }
    const host = $id("view-scheduler");
    if (!host) return;
    ui.roster.availDate = today();
    try {
      await S().ready();
      await R().load();
      P().ensure();                       // every person gets a stable OID
    } catch (e) {
      const msg = `<div class="sch-ph"><strong>Scheduler data could not be loaded.</strong>
        <p>${esc(e.message)}${S().seedError() ? " · " + esc(S().seedError()) : ""}</p>
        <p>Expected <code>../data/scheduler/seed.json</code> and <code>../data/flowchart2.json</code>
        next to the app.</p></div>`;
      for (const p of PANES) $id("sch-" + p).innerHTML = msg;
      console.error(e);
      return;
    }
    ui.booted = true;
    S().mountTools($id("sch-tools"));
    wireSubtabs();
    S().subscribe(() => { if (ui.booted) render(); });
    /* ROUND 14 — the currency catalog is fetched at boot because night
       capability is derived from it (see currency.js). It is a race the board
       usually wins, but "usually" is not a guarantee: if the catalog lands
       AFTER this pane painted, the night badges and the night warnings would
       be showing "unknown" until the next store write. One repaint, once. */
    window.addEventListener((window.SchedCurrency || {}).READY_EVENT || "sched-currency-ready",
      () => { if (ui.booted) render(); }, { once: true });
    render();
  };

  function wireSubtabs() {
    const bar = $id("sch-subtabs");
    if (!bar || bar._wired) return;
    bar._wired = true;
    bar.addEventListener("click", (e) => {
      const b = e.target.closest(".sch-subtab");
      if (!b) return;
      const from = ui.pane;
      ui.pane = b.dataset.sch;
      /* CUSTODY (bridge ruling #7 · specs/bridge-spec.md § 6) — the cross-check
         report carries REAL NAMES and does not survive the pane it was painted
         in. Hiding it would leave those names in the DOM for find-in-page and
         for anything that reads the document; the bridge drops the state and
         the nodes together and comes back as a clean load state. */
      if (from === "bridge" && ui.pane !== "bridge" && window.schBridgeLeave) window.schBridgeLeave();
      for (const t of bar.querySelectorAll(".sch-subtab")) t.classList.toggle("active", t.dataset.sch === ui.pane);
      for (const p of PANES) $id("sch-" + p).classList.toggle("hidden", p !== ui.pane);
      render();
    });
  }

  function render() {
    if (!ui.booted) return;
    if (ui.pane === "board") renderBoard();
    else if (ui.pane === "roster") renderRoster();
    else if (ui.pane === "log") renderLog();
    else if (ui.pane === "bridge") renderBridge();
    else renderBalance();
  }

  /* ── BOARD (Phase B) ────────────────────────────────────────────────────── */
  function renderBoard() {
    const el = $id("sch-board");
    if (window.schBoardInit) { window.schBoardInit(el); return; }
    el.innerHTML = `<div class="sch-ph">
      <strong>The daily board arrives with Phase B.</strong>
      <p>Phase A gives it the facts and the readiness engine: roster, availability, duties,
      training log and <code>window.SchedReady</code>.</p></div>`;
  }

  /* ── BALANCE (Phase B) ──────────────────────────────────────────────────── */
  function renderBalance() {
    const el = $id("sch-balance");
    if (window.schBalanceInit) { window.schBalanceInit(el); return; }
    el.innerHTML = `<div class="sch-ph">
      <strong>Balance arrives with Phase B.</strong>
      <p>Events, deviation from the cohort average, makeups, idle days and instructor load
      are all derived from the training log and the duty roster recorded here.</p></div>`;
  }

  /* ── BRIDGE (Round 18 slice 1 · Round 21 Phase 3) ───────────────────────
     The cross-check with Wings Ahead. It reads one export file the user
     chooses; since Phase 3 a line the developer CONFIRMS is written into the
     FDMS training log — and nothing is ever written to Wings Ahead or to the
     repository. Everything it does lives in app/schedbridge.js, behind the
     edit lock and its [data-brgw] controls; this is only the seat. */
  function renderBridge() {
    const el = $id("sch-bridge");
    if (window.schBridgeInit) { window.schBridgeInit(el); return; }
    el.innerHTML = `<div class="sch-ph">
      <strong>The Bridge could not be loaded.</strong>
      <p>Expected <code>app/schedbridge.js</code> next to the other Scheduler modules.</p></div>`;
  }

  /* ══ ROSTER ══════════════════════════════════════════════════════════════ */
  /* one live filter over BOTH lists — code · class · notes · name · MN ·
     rank · callsign; case-insensitive */
  function rosterMatch(bits) {
    const q = ui.roster.q.trim().toLowerCase();
    if (!q) return true;
    const hay = bits.filter(Boolean).join(" ").toLowerCase();
    return q.split(/\s+/).every((t) => hay.indexOf(t) >= 0);
  }
  const fStudents = () => students().filter((s) => ui.roster.editS === s.code
    || rosterMatch([s.code, s.class, s.notes, s.status, P().ipCode(s.primary_ip),
      s.first_name, s.last_name, s.mn, s.rank, s.country]));
  const fInstructors = () => instructors().filter((i) => ui.roster.editI === i.code
    || rosterMatch([i.code, i.notes, i.first_name, i.last_name, i.mn, i.rank, i.callsign, i.status,
      i.country, i.duty, i.leadership, i.test_pilot ? "TP test pilot" : ""]));

  function renderRoster() {
    const el = $id("sch-roster");
    el.innerHTML = `
      <div class="sch-rosterbar">
        <label class="sch-fld grow"><span>Filter roster</span>
          <input type="search" id="sch-rosterq" class="sch-in" value="${esc(ui.roster.q)}"
                 placeholder="filter students & instructors — code · class · rank · callsign · country · notes" autocomplete="off"></label>
        <span class="sch-fld">
          <span>Global roster</span>
          <span class="sch-tglrow">
            <button type="button" class="sch-btn" data-act="imp-roster"
              title="Import the shared roster.json — merge BY OID: an OID already here is updated in place, a new OID is created, and anybody the file does not mention is left untouched">⭱ Import roster</button>
            ${canEdit() ? (() => {
              /* Round 14 — the badge counts BOTH passes, so a squadron whose
                 codes are all proper but none of them a call sign still sees
                 there is something to do. */
              const n = repairN();
              return `<button type="button" class="sch-btn${n.total ? " danger" : ""}" data-act="fix-codes"
              title="${esc(n.total
                ? "TWO passes, one transaction — " + n.p1 + " code(s) shaped like a store record id (stu-…/ins-…) "
                  + "and " + n.p2 + " active instructor code(s) that are not the call sign. Both are re-minted and EVERY "
                  + "reference in the log, availability, gates, duties and day plans is rewritten with them. OIDs never change."
                : "Nothing to repair: no code is shaped like a store record id, and every active instructor's code is "
                  + "already his call sign. The button runs both passes and rewrites every reference when there is something to do.")}"
              >🛠 Repair codes${n.total ? " (" + n.total + ")" : ""}</button>`;
            })() : ""}
            <input type="file" accept="application/json,.json" id="sch-rosterfile" class="sch-file" hidden>
          </span></span>
      </div>
      <div class="sch-grid2">
        <section class="panel sch-panel">
          <div class="sch-h"><h2>Students <span class="count" id="sch-scount">${fStudents().length}/${students().length}</span></h2>
            <button type="button" class="sch-btn" data-act="add-s">+ Student</button></div>
          <div class="sch-scroll" id="sch-stww">${studentList()}</div>
        </section>
        <section class="panel sch-panel">
          <div class="sch-h"><h2>Instructors <span class="count" id="sch-icount">${fInstructors().length}/${instructors().length}</span></h2>
            <button type="button" class="sch-btn" data-act="add-i">+ Instructor</button></div>
          <div class="sch-scroll" id="sch-itww">${instructorList()}</div>
        </section>
      </div>
      <section class="panel sch-panel">
        <div class="sch-h"><h2>Classes <span class="count">read-only — they follow the members</span></h2></div>
        ${classBlock()}
      </section>
      <section class="panel sch-panel" id="sch-availwrap">
        <div class="sch-h"><h2>Availability</h2>
          <label class="sch-lbl" for="sch-avdate">Date</label>
          <input type="date" id="sch-avdate" class="sch-in" value="${esc(ui.roster.availDate)}">
          <span class="sch-hint">One click cycles ${AV_CYCLE.join(" → ")} → available</span>
        </div>
        <div id="sch-avgrid">${availGrid()}</div>
      </section>`;
    wireRoster(el);
  }

  /* IP reference pickers — the OPTION VALUE is the instructor OID (spec §2:
     primary/reserve/avoid store oids); the label stays code (+rank/last name).
     Departed IPs are excluded — kept only when they ARE the current value.  */
  function ipRefOptions(selRef) {
    const selRec = selRef ? P().ip(selRef) : null;
    const parts = [`<option value=""${selRec || selRef ? "" : " selected"}>—</option>`];
    for (const i of instructors()) {
      const dep = (i.status || "active") === "departed";
      const isSel = selRec === i;
      if (dep && !isSel) continue;
      const label = S().personOption(i) + (i.rank ? " · " + i.rank : "") + (dep ? " — DEPARTED" : "");
      parts.push(`<option value="${esc(i.oid || i.code)}"${isSel ? " selected" : ""}>${esc(label)}</option>`);
    }
    if (selRef && !selRec) parts.push(`<option value="${esc(selRef)}" selected>${esc("unknown reference — not on the roster")}</option>`);
    return parts.join("");
  }
  /* Round 6 — the manual avoid list is TOGGLE CHIPS (the native multi-select
     needed ctrl-click). Click toggles is-on; the save reads the on-chips.
     Storage unchanged: an array of instructor OIDs. Departed IPs appear only
     while they ARE selected (so an old selection never silently vanishes). */
  function avoidChipsHtml(s) {
    const cur = new Set((s.avoid_ips || []).map((x) => { const rec = P().ip(x); return rec ? (rec.oid || rec.code) : String(x); }));
    const chips = instructors().map((i) => {
      const v = i.oid || i.code;
      const on = cur.has(v);
      const dep = (i.status || "active") === "departed";
      if (dep && !on) return "";
      const label = S().personLabel(i) + (dep ? " — DEPARTED" : "");
      return `<button type="button" class="sch-tgl${on ? " is-on" : ""}" data-avchip="${esc(v)}"
        title="${esc((on ? "click to remove from" : "click to add to") + " the manual avoid list (fail-22)")}">${esc(label)}</button>`;
    }).join("");
    return `<span class="sch-tglrow" data-avbox
      title="manual avoid list — union with the log-derived avoided instructors (fail-22)">${chips || `<em class="sch-hint">no instructor</em>`}</span>`;
  }
  /* Round 6 — rank quick-pick chips under the free-text rank input */
  const rankChipsHtml = () => `<span class="sch-tglrow sch-rankrow">${RANKS.map((r) =>
    `<button type="button" class="sch-tgl sch-rankchip" data-rankchip="${esc(r)}" title="fill the rank field with ${esc(r)} — free text stays allowed">${esc(r)}</button>`).join("")}</span>`;

  /* Round 9 — THE "OTHER…" ESCAPE, one helper for every closed list of this
     pane. A real <select> over the values the unit actually uses, plus one
     "Other…" option that reveals a free-text box holding the stored value.
     fvalOther() below reads the pair back as ONE string, so the record shape
     never learns that the widget has two halves. */
  function otherSelect(field, values, cur, placeholder) {
    const v = String(cur == null ? "" : cur);
    const known = v !== "" && values.indexOf(v) >= 0;
    const isOther = v !== "" && !known;
    return `<select class="sch-in" data-f="${esc(field)}" data-other="${esc(field)}">
        <option value=""${v === "" ? " selected" : ""}>—</option>
        ${values.map((o) => `<option value="${esc(o)}"${known && v === o ? " selected" : ""}>${esc(o)}</option>`).join("")}
        <option value="${OTHER}"${isOther ? " selected" : ""}>Other…</option>
      </select>
      <input class="sch-in sch-otherin${isOther ? "" : " hidden"}" data-fother="${esc(field)}"
             value="${esc(isOther ? v : "")}" placeholder="${esc(placeholder || "type it")}">`;
  }

  /* warning chips of one student row: PD/SMS (Round 2) + Round 4 "lost
     instructor" (fail-22) + departed/missing primary/reserve */
  function studentChips(s) {
    let chips = "";
    if (CQ()) {
      const pd = CQ().pd(s.code);
      if (pd) chips += ` <span class="sch-badge r-fail" title="${esc("fail-16 — " + CQ().vb("fail-16") + " · " + CQ().pdStageText(pd))}">PD 29/2020</span>`;
      for (const x of CQ().smsExhausted(s.code)) {
        chips += ` <span class="sch-badge warn" title="${esc("SMS entries exhausted for " + x.label + " — student can NOT re-enter (unit ruling 2026-08-09); no other consequence. fail-45 — " + CQ().vb("fail-45"))}">SMS✕ ${esc(x.label)}</span>`;
      }
    }
    const prim = s.primary_ip ? P().ip(s.primary_ip) : null;
    const famCodes = [];
    if (s.primary_ip && !prim) chips += ` <span class="sch-chip is-hard" title="stored ref ${esc(String(s.primary_ip))} matches no instructor">primary IP missing — reassign</span>`;
    else if (prim) {
      famCodes.push(prim.code);
      if (P().departed(prim)) chips += ` <span class="sch-chip is-hard" title="${esc(S().personOption(prim) + " is marked DEPARTED")}">primary IP departed — reassign</span>`;
    }
    (s.reserve_ips || []).filter(Boolean).forEach((x, k) => {
      const rec = P().ip(x);
      if (!rec) chips += ` <span class="sch-chip is-soft">reserve IP ${k + 1} missing</span>`;
      else {
        famCodes.push(rec.code);
        if (P().departed(rec)) chips += ` <span class="sch-chip is-soft" title="${esc(S().personOption(rec) + " is marked DEPARTED")}">reserve IP departed</span>`;
      }
    });
    let reassign = false;
    for (const a of P().avoidedAll(s.code)) {
      chips += ` <span class="sch-chip is-hard" title="${esc("fail-22 (3-01 §24στ(6)) — " + a.reason)}">lost instructor: ${esc(nm(a.code))}${a.manual ? " (manual)" : " (Progress Test)"}</span>`;
      if (famCodes.indexOf(a.code) >= 0) reassign = true;
    }
    if (reassign) chips += ` <span class="sch-chip is-hard" title="an avoided instructor is still this student's primary or reserve IP">reassign primary/reserve IP</span>`;
    return chips;
  }

  function studentList() {
    const list = fStudents();
    const rows = list.map((s) => studentRow(s)).join("");
    const add = ui.roster.addS
      ? `<div class="sch-rrow is-exp">${studentForm({ code: "", class: "", status: "active", primary_ip: "", reserve_ips: [], avoid_ips: [], notes: "" }, true)}</div>` : "";
    return rows + add + (!list.length && !ui.roster.addS
      ? `<p class="sch-hint">${ui.roster.q ? "No student matches the filter." : "No students yet."}</p>` : "");
  }

  /* compact summary line — click expands the full edit form (one at a time) */
  function studentRow(s) {
    const exp = ui.roster.editS === s.code;
    const idle = R().idleDays(s.code, today());
    return `<div class="sch-rrow${exp ? " is-exp" : ""}">
      <div class="sch-rsum" data-act="exp-s" data-id="${esc(s.code)}" role="button" tabindex="0"
           title="click to ${exp ? "close" : "open"} the full form">
        <span class="sch-rarrow">${exp ? "▾" : "▸"}</span>
        ${s.rank ? `<span class="sch-rmeta">${esc(s.rank)}</span>` : ""}
        <span class="sch-rname" title="${esc("code " + s.code + " — the stored key; it stays in this form and in every search")}">${esc(S().personLabel(s))}</span>
        ${s.class ? `<span class="sch-badge">${esc(s.class)}</span>` : ""}
        ${s.country ? `<span class="sch-badge" title="air force">${esc(s.country)}</span>` : ""}
        <span class="sch-badge st-${esc(s.status || "active")}"${STATUS_TITLE[s.status] ? ` title="${esc(STATUS_TITLE[s.status])}"` : ""}>${esc(statusLabel(s.status || "active"))}</span>
        ${studentChips(s)}
        ${idle == null ? "" : `<span class="sch-nd" title="working days since the last recorded event">${idle}d</span>`}
        <span class="sch-spacer"></span>
        <button type="button" class="sch-mini" data-act="prog-s" data-id="${esc(s.code)}"
          title="Progress — mark nodes completed, undo, close makeups">Progress</button>
      </div>
      ${exp ? studentForm(s, false) : ""}
    </div>`;
  }

  /* Round 12b — the two dates the roster file carries for a student, read back
     as DD/MM/YYYY under the form. It reports the STORED record, not the boxes
     above it, so it is the "what is filed" line, not a preview of the edit. */
  function personLine(s) {
    const bits = [];
    if (s.date_of_birth) bits.push("DOB " + window.fmtDMY(s.date_of_birth));
    if (s.phase2_start_date) bits.push("Phase II from " + window.fmtDMY(s.phase2_start_date));
    if (!bits.length) return "";
    return `<p class="sch-hint sch-pline" title="as recorded — the global roster file supplies both by OID on import">${esc(bits.join(" · "))}</p>`;
  }

  function studentForm(s, isNew) {
    const r = s.reserve_ips || [];
    return `<div class="sch-rform" data-newrow="${isNew ? 1 : 0}" data-orig="${esc(s.code)}">
      <div class="sch-fgrid">
        <label class="sch-fld"><span>OID — read-only</span><input class="sch-in sch-mono" value="${esc(s.oid || "(assigned on save)")}" readonly tabindex="-1"></label>
        <label class="sch-fld"><span>Code</span><input class="sch-in" data-f="code" value="${esc(s.code)}" placeholder="SP-31"${isNew ? "" : " readonly"}></label>
        <label class="sch-fld"><span>Last name</span><input class="sch-in" data-f="last_name" value="${esc(s.last_name || "")}"></label>
        <label class="sch-fld"><span>First name</span><input class="sch-in" data-f="first_name" value="${esc(s.first_name || "")}"></label>
        <label class="sch-fld"><span>MN (service no)</span><input class="sch-in" data-f="mn" value="${esc(s.mn || "")}"></label>
        <label class="sch-fld"><span>Rank — free text or a chip</span><input class="sch-in" data-f="rank" value="${esc(s.rank || "")}">${rankChipsHtml()}</label>
        <label class="sch-fld"><span>Class</span><input class="sch-in" data-f="class" value="${esc(s.class || "")}" list="sch-classlist" placeholder="99HAF-A"></label>
        <label class="sch-fld"><span>Date of birth</span><input type="date" class="sch-in" data-f="date_of_birth" value="${esc(s.date_of_birth || "")}"
          title="stored ISO, read DD/MM/YYYY like every other date in the app"></label>
        <label class="sch-fld"><span>Phase II start</span><input type="date" class="sch-in" data-f="phase2_start_date" value="${esc(s.phase2_start_date || "")}"
          title="the day this student entered Phase II — the reference date of the whole syllabus clock"></label>
        <label class="sch-fld"><span>Country — air force</span>${otherSelect("country", COUNTRIES, s.country || "HAF", "e.g. FAF")}</label>
        <label class="sch-fld"><span>Status</span><select class="sch-in" data-f="status">${STATUS_OPTS.map((o) =>
          `<option value="${o}"${(s.status || "active") === o ? " selected" : ""}>${esc(statusLabel(o))}</option>`).join("")}</select></label>
        <label class="sch-fld"><span>Primary IP</span><select class="sch-in" data-f="primary_ip">${ipRefOptions(s.primary_ip || "")}</select></label>
        <label class="sch-fld"><span>Reserve IP 1</span><select class="sch-in" data-f="r0">${ipRefOptions(r[0] || "")}</select></label>
        <label class="sch-fld"><span>Reserve IP 2</span><select class="sch-in" data-f="r1">${ipRefOptions(r[1] || "")}</select></label>
        <label class="sch-fld wide"><span>Avoid IPs — manual (fail-22) · click toggles</span>${avoidChipsHtml(s)}</label>
        <label class="sch-fld grow"><span>Notes</span><input class="sch-in" data-f="notes" value="${esc(s.notes || "")}"></label>
      </div>
      ${personLine(s)}
      <div class="sch-fbtns">
        <button type="button" class="sch-btn primary" data-act="save-s" title="${esc(TIP.saveS)}">✔ Save</button>
        <button type="button" class="sch-btn" data-act="cancel">↩ Cancel</button>
        ${isNew ? "" : `<button type="button" class="sch-btn danger" data-act="del-s" data-id="${esc(s.code)}" title="${esc(TIP.delS)}">✕ Delete</button>`}
      </div>
    </div>`;
  }

  function instructorList() {
    const list = fInstructors();
    const rows = list.map((i) => ipRow(i)).join("");
    const add = ui.roster.addI
      ? `<div class="sch-rrow is-exp">${ipForm({ code: "", quals: {}, duty_eligible: {}, status: "active", notes: "" }, true)}</div>` : "";
    return rows + add + (!list.length && !ui.roster.addI
      ? `<p class="sch-hint">${ui.roster.q ? "No instructor matches the filter." : "No instructors yet."}</p>` : "");
  }

  function ipRow(i) {
    const exp = ui.roster.editI === i.code;
    const q = i.quals || {}, d = i.duty_eligible || {};
    const dep = (i.status || "active") === "departed";
    const idle = R().idleDays(i.code, today());
    const qb = (t, title) => `<span class="sch-badge" title="${esc(title || t)}">${esc(t)}</span>`;
    return `<div class="sch-rrow${exp ? " is-exp" : ""}${dep ? " is-dep" : ""}">
      <div class="sch-rsum" data-act="exp-i" data-id="${esc(i.code)}" role="button" tabindex="0"
           title="click to ${exp ? "close" : "open"} the full form">
        <span class="sch-rarrow">${exp ? "▾" : "▸"}</span>
        ${i.rank ? `<span class="sch-rmeta">${esc(i.rank)}</span>` : ""}
        <span class="sch-rname" title="${esc("code " + i.code + " — the stored key; it stays in this form and in every search")}">${esc(S().personLabel(i))}</span>
        ${i.callsign ? `<span class="sch-badge alt" title="personal callsign — auto-fills single-ship lines">${esc(i.callsign)}</span>` : ""}
        ${i.country ? `<span class="sch-badge" title="air force">${esc(i.country)}</span>` : ""}
        ${i.test_pilot ? qb("TP", "test pilot") : ""}
        ${i.duty ? qb(i.duty, "duty — from the global roster") : ""}
        ${i.leadership ? qb(i.leadership, "leadership qualification — from the global roster") : ""}
        ${dep ? `<span class="sch-badge st-withdrawn" title="departed — excluded from every picker, kept in Balance history">DEPARTED</span>` : ""}
        ${i.experienced ? qb("ΕΜΠ", "experienced flyer (Annex B §17) — the ΕΜΠ column of the 3-01 applies to him") : ""}
        ${i.demo_pilot ? qb("✈ DEMO", "demo pilot (Ιπτάμενος Επίδειξης) — the Chapter 5 rows of the ✈ table in Currency are his") : ""}
        ${nightBadge(i) ? qb("☾", "NIGHT — " + nightBadge(i)) : ""}${q.evaluator ? qb("EVAL", "evaluator — checkrides") : ""}
        ${q.ground ? qb("GND", "ground instructor") : ""}${q.rsu_solo ? qb("RSU-solo", "RSU-during-solo qualification — the RSU A/B duty pickers filter on this") : ""}
        ${d.SOF ? qb("SOF", "duty eligible — Supervisor of Flying") : ""}${d.RSU ? qb("RSU", "duty eligible — Runway Supervisory Unit (compatibility)") : ""}
        ${idle == null ? "" : `<span class="sch-nd" title="working days since the last recorded event">${idle}d</span>`}
        <span class="sch-spacer"></span>
      </div>
      ${exp ? ipForm(i, false) : ""}
    </div>`;
  }

  /* ══ NIGHT IS NOT A CHECKBOX ANY MORE ═══════════════════ (Round 14) ════
     User directive, verbatim: «το night δεν θα το επιλεγουμε εμεις, αλλα θα
     ενημερωνεται αυτοματα απο το Currency. θα βαζω εγω ημερομηνια τελευταιας
     νυχτερινης πτησης και θα ξεκιναει countdown αναλογα.»

     So the roster no longer OWNS night capability, it REPORTS it: the single
     source is SchedCurrency.nightOf(), the `night-landing` row of this man read
     against his own ΕΜΠ/ΑΠ column (60 / 45 days). The form shows a badge, not
     an input; the badge is a link into the very cell that decides it. Nothing
     here writes `quals.night` any more — saveInstructor carries the stored
     value through untouched so an old export still round-trips.

     The badge is marked `data-nav`: it moves the VIEW and writes nothing, so
     the edit lock lets it through on a view-only device (schedstore's NAV list
     honours the attribute) — a locked screen may read where the truth lives. */
  const NIGHT_STATE = {
    ok: { cls: "is-ok", txt: (n) => "auto from Currency: current (+" + n.left + " d)" },
    expiring: { cls: "is-warn", txt: (n) => "auto from Currency: current (+" + n.left + " d)" },
    expired: { cls: "is-bad", txt: () => "not current — enter the last night flight in Currency" },
    never: { cls: "is-bad", txt: () => "not current — enter the last night flight in Currency" },
    unknown: { cls: "is-none", txt: () => "auto from Currency — reading the catalog…" },
  };
  /* the roster ROW badge: a one-line reason, or "" when he is not night-capable
     (the row badges are a list of what a man HAS, exactly as before) */
  function nightBadge(i) {
    const CU = window.SchedCurrency;
    if (!CU || !i.oid) return "";
    const n = CU.nightOf(i);
    return n.ok ? n.text + " · derived from the Currency night-landing row, never typed in the roster" : "";
  }
  function nightFld(i, isNew) {
    const CU = window.SchedCurrency;
    const why = "\n\nNIGHT IS DERIVED, NOT SET HERE. It is the state of his night-landing row in the "
      + "Currency tab, read against his own experience level — the 3-01 prints 60 days for an ΕΜΠ flyer "
      + "and 45 for an ΑΠ one. Record the last night flight there and the countdown starts by itself; "
      + "in date (or expiring) means night-capable, expired or never recorded means not.";
    if (isNew || !i.oid || !CU) {
      return `<div class="sch-fld sch-nightfld"><span>Night</span>
        <span class="sch-nightbadge is-none" title="${esc("NIGHT — nothing to read yet: save the row once so it gets "
          + "an OID, then record his last night landing in the Currency tab." + why)}">NIGHT — auto from Currency: save the row first</span></div>`;
    }
    const n = CU.nightOf(i);
    const s = NIGHT_STATE[n.state] || NIGHT_STATE.unknown;
    return `<div class="sch-fld sch-nightfld"><span>Night</span>
      <button type="button" class="sch-nightbadge ${s.cls}" data-nav data-act="night-jump" data-id="${esc(i.code)}"
        title="${esc(n.text + why + "\n\nClick to open the Currency matrix at his night-landing cell.")}"
        >NIGHT — ${esc(s.txt(n))}</button></div>`;
  }

  function ipForm(i, isNew) {
    const q = i.quals || {}, d = i.duty_eligible || {};
    const cb = (f, on, lbl, title) => `<label class="sch-fld sch-chk" title="${esc(title || lbl)}">
      <input type="checkbox" data-f="${f}"${on ? " checked" : ""}> <span>${esc(lbl)}</span></label>`;
    const refs = isNew ? null : P().references(i);
    return `<div class="sch-rform" data-newrow="${isNew ? 1 : 0}" data-orig="${esc(i.code)}">
      <div class="sch-fgrid">
        <label class="sch-fld"><span>OID — read-only</span><input class="sch-in sch-mono" value="${esc(i.oid || "(assigned on save)")}" readonly tabindex="-1"></label>
        <label class="sch-fld"><span>Code</span><input class="sch-in" data-f="code" value="${esc(i.code)}" placeholder="IP-16"${isNew ? "" : " readonly"}></label>
        <label class="sch-fld"><span>Last name</span><input class="sch-in" data-f="last_name" value="${esc(i.last_name || "")}"></label>
        <label class="sch-fld"><span>First name</span><input class="sch-in" data-f="first_name" value="${esc(i.first_name || "")}"></label>
        <label class="sch-fld"><span>MN (service no)</span><input class="sch-in" data-f="mn" value="${esc(i.mn || "")}"></label>
        <label class="sch-fld"><span>Rank — free text or a chip</span><input class="sch-in" data-f="rank" value="${esc(i.rank || "")}">${rankChipsHtml()}</label>
        <label class="sch-fld"><span>Callsign</span><input class="sch-in" data-f="callsign" value="${esc(i.callsign || "")}" placeholder="VIPER01"></label>
        <label class="sch-fld"><span>Country — air force</span>${otherSelect("country", COUNTRIES, i.country || "", "e.g. FAF")}</label>
        <label class="sch-fld"><span>Duty</span>${otherSelect("duty", DUTIES, i.duty || "", "type the duty")}</label>
        <label class="sch-fld"><span>Leadership</span>${otherSelect("leadership", LEADERSHIPS, i.leadership || "", "type the qualification")}</label>
        ${cb("test_pilot", i.test_pilot, "Test pilot", "test pilot — badged TP in the roster row and in the Balance load table; the SIM-ΔΑ semester quota (§24) applies to him alone")}
        ${cb("demo_pilot", i.demo_pilot, "Demo pilot", "DEMO PILOT — Ιπτάμενος Επίδειξης. Chapter 5 of the 3-01 (the 500 ft display currency, the two restoration routes, the 1000 ft limit, the Ε-1δ DEMO event and the 2-year tenure) binds the display pilot and nobody else. Tick this and the ✈ section of the Currency tab appears, with him in it; untick it and those six rows leave his availability count and the screen. Same mechanism as Test pilot — one flag on the person")}
        ${cb("experienced", i.experienced, "Experienced (ΕΜΠ)", "experienced flyer, Annex B §17 — his Currency row reads the ΕΜΠ validity column of the 3-01 instead of the ΑΠ one. Round 12a moved the switch here: the matrix has no single current instructor, and this is a property of the person, not of a view")}
        <label class="sch-fld"><span>Status</span><select class="sch-in" data-f="status">
          <option value="active"${(i.status || "active") === "active" ? " selected" : ""}>active</option>
          <option value="departed"${i.status === "departed" ? " selected" : ""}>departed</option></select></label>
        ${nightFld(i, isNew)}
        ${cb("evaluator", q.evaluator, "Evaluator", "evaluator — checkrides")}
        ${cb("ground", q.ground, "Ground", "ground instructor")}
        ${cb("rsu_solo", q.rsu_solo, "RSU (solo)", "RSU-during-solo qualification — the RSU A/B duty pickers filter on this")}
        ${cb("SOF", d.SOF, "SOF duty", "duty eligible — Supervisor of Flying")}
        ${cb("RSU", d.RSU, "RSU duty", "duty eligible — Runway Supervisory Unit (kept for compatibility)")}
        <label class="sch-fld grow"><span>Notes</span><input class="sch-in" data-f="notes" value="${esc(i.notes || "")}"></label>
      </div>
      <div class="sch-fbtns">
        <button type="button" class="sch-btn primary" data-act="save-i" title="${esc(TIP.saveI)}">✔ Save</button>
        <button type="button" class="sch-btn" data-act="cancel">↩ Cancel</button>
        ${isNew ? "" : `<button type="button" class="sch-btn danger" data-act="del-i" data-id="${esc(i.code)}" title="${esc(TIP.delI)}">
          ${refs && refs.any ? "✕ Mark departed" : "✕ Delete"}</button>`}
        ${refs && refs.any ? `<span class="sch-hint">referenced by ${refs.log} log event${refs.log === 1 ? "" : "s"} · ${refs.students} student${refs.students === 1 ? "" : "s"} · ${refs.duty} duty day${refs.duty === 1 ? "" : "s"} — never hard-deleted</span>` : ""}
      </div>
    </div>`;
  }

  function classBlock() {
    const cl = S().classList();
    if (!cl.length) return `<p class="sch-hint">No classes — they appear as soon as a student carries one.</p>`;
    return `<datalist id="sch-classlist">${cl.map((c) => `<option value="${esc(c.id)}"></option>`).join("")}</datalist>
      <div class="sch-cls">${cl.map((c) => `<div class="sch-clscard">
        <div class="sch-clsid">${esc(c.id)}<span class="sch-badge">${c.members.length}</span></div>
        <div class="sch-clsm">${c.members.map((m) => `<span class="sch-chip" title="${esc(nmOpt("students", m))}">${esc(nm(m))}</span>`).join("")}</div>
      </div>`).join("")}</div>`;
  }

  /* ══ THE PRESENCE STRIP, GROUPED PER CLASS ═════════════ (Round 14) ═════
     User directive, verbatim: «τους μαθητες στους αποντες, παροντες να τους
     χωριζει ανα class.» One long mixed strip of thirty chips answered "who is
     away" but never "which class is short today", which is the question a
     scheduler actually asks. So the STUDENTS block becomes one labelled row per
     class; the instructors block is untouched (they have no class).

     The class list comes from SchedStore.classList() — the ONE place a class
     list is built in this app, already sorted alphabetically and already
     bucketing a student with no class under «—», so nobody is dropped and no
     class is invented here. `cell` is the caller's own chip renderer, so the
     board and the roster share this shape without sharing a chip.
     The same helper exists in schedboard.js for the board's day panel: two
     views, two renderers, ONE grouping rule.                                */
  function avByClass(cell) {
    const seen = new Set(students().map((s) => s.code));
    const groups = S().classList()
      .map((c) => ({ id: c.id, members: c.members.filter((m) => seen.has(m)) }))
      .filter((g) => g.members.length);
    if (!groups.length) return `<p class="sch-hint">No students yet.</p>`;
    return groups.map((g) => `<div class="sch-avcls">
      <span class="sch-avclsid" title="${esc("class " + g.id + " — " + g.members.length
        + " student" + (g.members.length === 1 ? "" : "s") + " on the roster")}">${esc(g.id)}</span>
      <div class="sch-avrow">${g.members.map(cell).join("")}</div></div>`).join("");
  }

  function availGrid() {
    const date = ui.roster.availDate;
    const map = S().availabilityFor(date);
    const cell = (code) => {
      const st = map.get(code) || "available";
      return `<button type="button" class="sch-av av-${esc(st)}" data-av="${esc(code)}" title="${esc(nmOpt(null, code) + " — " + st + ". " + TIP.av)}">
        <span class="sch-code">${esc(nm(code))}</span><span class="sch-avst">${esc(st === "available" ? "OK" : st)}</span></button>`;
    };
    const away = [...map.entries()].filter(([, v]) => v && v !== "available").length;
    return `<p class="sch-hint">${esc(date ? window.fmtDMY(date) : "—")} · <b>${away}</b> away</p>
      <div class="sch-avgroup"><span class="sch-lbl">Students — per class</span>${avByClass(cell)}</div>
      <div class="sch-avgroup"><span class="sch-lbl">Instructors</span><div class="sch-avrow">${activeIps().map((i) => cell(i.code)).join("")}</div></div>`;
  }

  /* Wired ONCE per pane element: renderRoster() only swaps innerHTML, so the
     delegated listeners survive. Re-attaching them on every render would stack
     handlers and make one click fire N times. */
  function wireRoster(el) {
    if (el._wired) return;
    el._wired = true;
    el.addEventListener("change", (e) => {
      /* Round 9 — the "Other…" option reveals its free-text box in place; the
         form is never re-rendered, so what is typed survives until Save. */
      const os = e.target.closest ? e.target.closest("[data-other]") : null;
      if (os) {
        const box = os.closest(".sch-rform");
        const inp = box && box.querySelector(`[data-fother="${os.dataset.other}"]`);
        if (inp) {
          const on = os.value === OTHER;
          inp.classList.toggle("hidden", !on);
          if (on) inp.focus(); else inp.value = "";
        }
        return;
      }
      if (e.target.id === "sch-rosterfile") {
        const f = e.target;
        if (f.files && f.files[0]) importRosterFile(f.files[0]).then(() => { f.value = ""; });
        else f.value = "";
        return;
      }
      if (e.target.id !== "sch-avdate") return;
      ui.roster.availDate = e.target.value;
      $id("sch-avgrid").innerHTML = availGrid();
    });
    /* live roster filter — only the two lists repaint, the input keeps focus */
    el.addEventListener("input", (e) => {
      if (e.target.id !== "sch-rosterq") return;
      ui.roster.q = e.target.value;
      const st = $id("sch-stww"), it = $id("sch-itww");
      if (st) st.innerHTML = studentList();
      if (it) it.innerHTML = instructorList();
      const sc = $id("sch-scount"), ic = $id("sch-icount");
      if (sc) sc.textContent = fStudents().length + "/" + students().length;
      if (ic) ic.textContent = fInstructors().length + "/" + instructors().length;
    });
    el.addEventListener("click", (e) => {
      /* Round 6 — toggle chips (avoid-ips) and rank quick-pick fill the form
         in place: the DOM holds the state until Save reads it. */
      const avc = e.target.closest("[data-avchip]");
      if (avc) { avc.classList.toggle("is-on"); return; }
      const rk = e.target.closest("[data-rankchip]");
      if (rk) {
        const form = rk.closest(".sch-rform");
        const inp = form && form.querySelector('[data-f="rank"]');
        if (inp) { inp.value = rk.dataset.rankchip; inp.focus(); }
        return;
      }
      const av = e.target.closest("[data-av]");
      if (av) {
        const code = av.dataset.av;
        const cur = S().availabilityOf(code, ui.roster.availDate);
        const next = AV_CYCLE[(AV_CYCLE.indexOf(cur) + 1) % AV_CYCLE.length];
        S().setAvailability(code, ui.roster.availDate, next);
        return;                                   // the store event re-renders
      }
      const b = e.target.closest("[data-act]");
      if (!b) return;
      const act = b.dataset.act, id = b.dataset.id;
      if (act === "imp-roster") { const f = $id("sch-rosterfile"); if (f) f.click(); return; }
      if (act === "fix-codes") { repairCodes(); return; }
      /* Round 14 — the NIGHT badge is a reading of ONE currency cell, so it is
         also the door to it: the Currency tab opens at that cell. Read-only on
         purpose (see nightFld) — it changes nothing on the way. */
      if (act === "night-jump") {
        if (window.curFocusCell) window.curFocusCell(id, (window.SchedCurrency || {}).NIGHT_ITEM || "night-landing");
        else S().toast("The Currency tab is not loaded.", "bad");
        return;
      }
      if (act === "prog-s") {
        if (window.schProgressOpen) window.schProgressOpen(id);
        else S().toast("The progress editor arrives with Phase B.", "bad");
      } else if (act === "add-s") { ui.roster.addS = true; ui.roster.editS = null; renderRoster(); }
      else if (act === "add-i") { ui.roster.addI = true; ui.roster.editI = null; renderRoster(); }
      else if (act === "exp-s") { ui.roster.editS = ui.roster.editS === id ? null : id; ui.roster.editI = null; ui.roster.addS = false; renderRoster(); }
      else if (act === "exp-i") { ui.roster.editI = ui.roster.editI === id ? null : id; ui.roster.editS = null; ui.roster.addI = false; renderRoster(); }
      else if (act === "cancel") { ui.roster.editS = ui.roster.editI = null; ui.roster.addS = ui.roster.addI = false; renderRoster(); }
      else if (act === "save-s") saveStudent(b.closest(".sch-rform"));
      else if (act === "save-i") saveInstructor(b.closest(".sch-rform"));
      else if (act === "del-s") delStudent(id);
      else if (act === "del-i") delInstructor(id);
    });
  }

  const fval = (box, f) => { const x = box.querySelector(`[data-f="${f}"]`); return x ? (x.type === "checkbox" ? x.checked : x.value.trim()) : ""; };
  /* Round 9 — reads an otherSelect() pair as one value: the picked option, or
     what was typed into the box "Other…" reveals (empty typed = no value). */
  const fvalOther = (box, f) => {
    const v = fval(box, f);
    if (v !== OTHER) return v;
    const x = box.querySelector(`[data-fother="${f}"]`);
    return x ? x.value.trim() : "";
  };
  /* Round 6 — the avoid list reads the ON chips (was: a native multi-select) */
  const fchips = (box) => [...box.querySelectorAll("[data-avchip].is-on")].map((b) => b.dataset.avchip).filter(Boolean);

  function saveStudent(box) {
    const code = fval(box, "code");
    if (!code) { S().toast("A student needs a code.", "bad"); return; }
    const isNew = box.dataset.newrow === "1";
    if (isNew && S().find("students", code)) { S().toast("Code " + code + " already exists.", "bad"); return; }
    const prev = S().find("students", code);
    const r0 = fval(box, "r0"), r1 = fval(box, "r1");
    /* the form selects carry OIDs — a save REWRITES any legacy code refs */
    const rec = {
      code: code, oid: (prev && prev.oid) || S().uid("oid"),
      class: fval(box, "class"), status: fval(box, "status"),
      first_name: fval(box, "first_name"), last_name: fval(box, "last_name"),
      mn: fval(box, "mn"), rank: fval(box, "rank"),
      /* Round 12b — the three fields the global roster now carries for a
         student. Dates stay ISO in the store; the form is a native date box
         and the reading under it is DD/MM/YYYY, like everywhere else. */
      date_of_birth: fval(box, "date_of_birth"), phase2_start_date: fval(box, "phase2_start_date"),
      country: fvalOther(box, "country"),
      primary_ip: fval(box, "primary_ip"), reserve_ips: [r0, r1].filter(Boolean),
      avoid_ips: fchips(box),
      notes: fval(box, "notes"),
    };
    ui.roster.editS = null; ui.roster.addS = false;   // before the store event re-renders
    S().upsert("students", rec);
    S().toast("Student " + code + " saved.", "good");
  }

  function saveInstructor(box) {
    const code = fval(box, "code");
    if (!code) { S().toast("An instructor needs a code.", "bad"); return; }
    const isNew = box.dataset.newrow === "1";
    if (isNew && S().find("instructors", code)) { S().toast("Code " + code + " already exists.", "bad"); return; }
    const prev = S().find("instructors", code);
    const rec = {
      code: code, oid: (prev && prev.oid) || S().uid("oid"),
      first_name: fval(box, "first_name"), last_name: fval(box, "last_name"),
      mn: fval(box, "mn"), rank: fval(box, "rank"), callsign: fval(box, "callsign"),
      country: fvalOther(box, "country"), test_pilot: !!fval(box, "test_pilot"),
      experienced: !!fval(box, "experienced"), demo_pilot: !!fval(box, "demo_pilot"),
      duty: fvalOther(box, "duty"), leadership: fvalOther(box, "leadership"),
      status: fval(box, "status") || "active",
      /* Round 14 — `night` is no longer a control on this form, so there is
         nothing to read: the STORED value is carried through untouched. Reading
         a checkbox that is not there would have returned "" and quietly wiped
         the key on the first save; nothing consumes it any more either way
         (SchedCurrency.nightOk is the truth), but a save must not destroy data
         it does not own. */
      quals: { night: !!((prev && prev.quals) || {}).night, evaluator: fval(box, "evaluator"), ground: fval(box, "ground"), rsu_solo: fval(box, "rsu_solo") },
      duty_eligible: { SOF: fval(box, "SOF"), RSU: fval(box, "RSU") },
      notes: fval(box, "notes"),
    };
    ui.roster.editI = null; ui.roster.addI = false;   // before the store event re-renders
    S().upsert("instructors", rec);
    S().toast("Instructor " + code + " saved.", "good");
  }

  /* ══ GLOBAL ROSTER IMPORT (Round 9) ══════════════════════════════════════
     ONE roster feeds every FDMS app. The file is PRIVATE and lives outside
     both repos; the public seed of this repo keeps its SP-x / IP-x fakes for
     ever. What arrives here is merged, never replaces:

       · THE OID IS THE IDENTITY and it is IMMUTABLE. An OID already in the
         store is UPDATED IN PLACE — the local `code` (which the training log
         references as a historical fact) is never rewritten. A new OID is
         CREATED. Somebody the file does not mention is LEFT UNTOUCHED:
         departures stay a manual decision, exactly as they were.
       · A field the roster says NOTHING about (null / absent — `mn` is null
         for everyone until the user supplies them) leaves the local value
         alone. Only what the file actually carries is written, so an import
         can never blank a field the CO typed in the UI.
       · Everything stays editable in the UI afterwards, as usual.           */
  const ROSTER_STATUS = { Departed: "departed" };      // everything else flies
  const ROSTER_ST_SP = { Departed: "withdrawn" };

  /* the roster's own field names → the store's, for ONE person. Returns only
     the keys the file actually carries (see the null rule above). */
  const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
  function rosterPatch(r, coll) {
    const p = {};
    const put = (k, v) => { if (v !== null && v !== undefined) p[k] = v; };
    const txt = (v) => (v === null || v === undefined ? undefined : String(v).trim());
    /* a date the file spells wrong is DROPPED, not stored: a half-parsed
       "12/05/1999" in an ISO field would print as garbage everywhere. The
       import summary counts the person either way — nothing else is lost. */
    const isoOnly = (v) => {
      const s = txt(v);
      if (s === undefined || s === "") return undefined;
      const d = s.slice(0, 10);
      if (ISO_DAY.test(d)) return d;
      console.warn("Roster import: ignored a date that is not ISO YYYY-MM-DD — " + JSON.stringify(v));
      return undefined;
    };
    put("last_name", txt(r.last_name));
    put("first_name", txt(r.first_name));
    put("mn", txt(r.mn));
    put("rank", txt(r.rank));
    if (r.status != null) {
      const map = coll === "students" ? ROSTER_ST_SP : ROSTER_STATUS;
      p.status = map[String(r.status)] || (coll === "students" ? "active" : "active");
    }
    /* Round 12b — the three student fields. `country` is shared with the
       instructor branch below, so it is mapped before the split; the two dates
       are ISO in the file and ISO in the store (the UI is what says DD/MM). A
       date the file does not carry leaves the local value alone, exactly like
       every other field here. */
    put("country", txt(r.country));
    if (coll === "students") {
      put("class", txt(r.class || r.class_id));
      put("date_of_birth", isoOnly(r.date_of_birth != null ? r.date_of_birth : r.dob));
      put("phase2_start_date", isoOnly(r.phase2_start_date != null ? r.phase2_start_date : r.phase_2_start_date));
      return p;
    }
    put("callsign", txt(r.call_sign != null ? r.call_sign : r.callsign));
    if (r.test_pilot != null) p.test_pilot = !!r.test_pilot;
    /* Round 14 — the display-pilot post, mapped exactly like test_pilot: a
       boolean the file states, or nothing at all (and then the local value is
       left alone, like every other field here). It is what scopes the six
       Chapter 5 rows of the Currency tab to the man who holds the post. */
    if (r.demo_pilot != null) p.demo_pilot = !!r.demo_pilot;
    put("duty", txt(r.duty));
    put("leadership", txt(r.leadership));
    if (r.experienced != null) p.experienced = !!r.experienced;
    return p;
  }

  /* quals / duty_eligible are OBJECTS: upsert() merges records shallowly, so
     they must be rebuilt from the stored one or the untouched halves vanish.
     The roster carries SOF / RSU / RSU_solo and a `duty`; the qualifications
     it does NOT carry (night, ground) are left exactly as they are, and
     `evaluator` may only be ADDED by an import — an Evaluator by duty gets the
     qualification, and a qualification the CO set by hand is never taken away
     by a file that has no opinion about it.
     ROUND 14 — `night` in particular must STAY out of here for a new reason as
     well as the old one: it is no longer an opinion anybody may hold. Night
     capability is derived from the Currency night-landing row
     (SchedCurrency.nightOk), so a roster file that wrote it would be writing a
     value nothing reads and contradicting the one thing that does. */
  function rosterQuals(r, prev) {
    const q = Object.assign({}, (prev && prev.quals) || {});
    const d = Object.assign({}, (prev && prev.duty_eligible) || {});
    const de = r.duty_eligible || {};
    if (de.RSU_solo != null) q.rsu_solo = !!de.RSU_solo;
    if (de.SOF != null) d.SOF = !!de.SOF;
    if (de.RSU != null) d.RSU = !!de.RSU;
    if (String(r.duty || "") === "Evaluator") q.evaluator = true;
    return { quals: q, duty_eligible: d };
  }

  /* a NEW person needs a local code (the store's key, and what the board and
     the printed sheet show). The call sign is the code the squadron already
     says out loud; if it is missing or taken, fall back to the next free
     IP-n / SP-n. */
  function mintCode(coll, want, taken) {
    const w = String(want || "").trim();
    if (w && !taken.has(w)) { taken.add(w); return w; }
    const pre = coll === "students" ? "SP-" : "IP-";
    for (let n = 1; n < 10000; n++) {
      const c = pre + n;
      if (!taken.has(c)) { taken.add(c); return c; }
    }
    return pre + Date.now();
  }

  /* ══ CODE REPAIR ═════════════════════════════════════════════════════════
     Round 12b. On 18/08/2026 a mid-refactor import minted a handful of people
     with a code shaped like a STORE RECORD ID — "stu-m9x2k1-7", "ins-m9x2k1-3"
     — because a caller handed upsert() a record with no `code` and the store's
     own uid(name.slice(0,3)) filled the key in (schedstore.js, normalize/
     upsert). Those are keys, not codes: they are unreadable on the board and
     on paper, and they are what the training log has been referencing ever
     since. This button re-mints them and rewrites EVERY reference in one pass.

     WHAT A PROPER CODE IS — the same rule as the roster import (mintCode):
     an instructor's own CALL SIGN when he has one and it is free, otherwise
     the next free IP-n / SP-n. The OID never changes: identity is the OID, and
     the roster merges by it, which is why re-importing the roster file
     afterwards re-applies the call sign and the rest by OID and costs nothing.

     WHAT GETS REWRITTEN — enumerated from the store, not guessed:
       trainingLog   ev.student · ev.instructor · ev.absent[].student
       availability  a.person AND a.id (the id IS "person|date")
       gates         g.student
       dutyRoster    sof_a/sof_b/rsu_a/rsu_b/rsu/SOF/RSU/ground_1/ground_2/
                     ground_instructor/alt_instructors[]
       dayPlans      waves[].lines[].sp/.ip · fs[].sp/.ip · lessons[].student/
                     .instructor/.absent{code:reason} · alt_students[].sp ·
                     alt_instructors[].ip
       students      primary_ip · reserve_ips[] · avoid_ips[] — these hold OIDs
                     since Round 4, but a pre-Round-4 value can still be a CODE
                     (SchedPeople.ip() resolves both), so they are remapped too
       ui            the log filter, the open form and the board's in-memory
                     copy of the day plan — the last one matters: it would be
                     written back with the OLD codes on the next keystroke.
     instructorCurrency is keyed by OID and needs nothing.
     IDEMPOTENT: after a run no code matches the shape, so a second click says
     there is nothing to repair.                                             */
  const ID_CODE_RE = /^(stu|ins)-[a-z0-9]+-[a-z0-9]+$/;
  const isIdShaped = (code) => ID_CODE_RE.test(String(code == null ? "" : code));
  /* how many people carry one right now — the button wears the number, so the
     normal state of a healthy store is a quiet button that says nothing.
     Round 14: the badge is the WHOLE plan, both passes, because the second one
     can have work to do while the first has none. repairPlan() walks the two
     roster lists and nothing else, which is 45 records in this squadron. */
  const repairN = () => { const p = repairPlan(); return { p1: p.p1, p2: p.p2, total: p.rows.length }; };

  /* ══ PASS 2 — CODE = CALL SIGN ═══════════════════════════ (Round 14) ════
     What happened, in the user's own account: Repair ran while the call signs
     were still empty, so pass 1 could not use them and fell back to IP-n. The
     call signs are filled in now, and «IP-7» is not what anybody says on the
     radio. So the button gets a SECOND pass with the same machinery:

       an ACTIVE instructor
       whose callsign is set,
       whose callsign differs from his code,
       and whose callsign is not already SOMEBODY ELSE'S code
     gets his code renamed to the call sign, and every reference in the store
     is rewritten in the same transaction (rewriteAll — the one rewriter).

     WHY EACH CONDITION IS THERE, not one of them decorative:
       ACTIVE      a departed man's code is a historical label on log rows
                   nobody will type again; renaming it buys nothing and churns
                   the log. He keeps what he had.
       DIFFERS     the no-op case, and what makes the whole button idempotent:
                   after a run every renamed code IS the call sign, so a second
                   click finds nothing.
       NOT TAKEN   a collision would merge two people into one key. The taken
                   set is seeded with EVERY code in the store — students too,
                   because the two share one namespace in `availability`
                   (person|date) and in the day plans. A blocked rename is
                   simply not offered; nothing is silently renamed to a
                   near-miss like "VIPER01-2", which would be a new handle
                   nobody asked for.
     STUDENTS ARE NOT TOUCHED BY PASS 2 — they have no call sign, and inventing
     one would be inventing data.
     Pass 1 (id-shaped keys) runs first and its results are already in `taken`,
     so a fresh IP-n minted by pass 1 can never be stolen by pass 2.          */
  const callsignOf = (rec) => String((rec && rec.callsign) || "").trim();

  function repairPlan() {
    const map = { students: new Map(), instructors: new Map() };
    const rows = [];
    /* one namespace for both collections: a code is a code (see NOT TAKEN) */
    const taken = new Set();
    for (const coll of ["instructors", "students"]) {
      for (const r of S().get(coll) || []) taken.add(String(r.code));
    }
    /* ── pass 1 — id-shaped keys that were never codes at all (Round 12b) ── */
    for (const coll of ["instructors", "students"]) {
      for (const rec of S().get(coll) || []) {
        if (!isIdShaped(rec.code)) continue;
        /* the call sign is the code the squadron already says out loud —
           the same first choice the roster import makes for a new person */
        const want = coll === "instructors" ? callsignOf(rec) : "";
        taken.delete(String(rec.code));            // the old key is freed by the rename
        const next = mintCode(coll, want, taken);
        map[coll].set(String(rec.code), next);
        rows.push({ pass: 1, coll: coll, from: String(rec.code), to: next,
          who: S().baseLabel(rec) || next, oid: rec.oid || "" });
      }
    }
    /* ── pass 2 — a proper code that is not the call sign (Round 14) ─────── */
    const blocked = [];
    for (const rec of S().get("instructors") || []) {
      const from = String(rec.code);
      if (map.instructors.has(from)) continue;     // pass 1 already renamed him
      if ((rec.status || "active") === "departed") continue;
      const cs = callsignOf(rec);
      if (!cs || cs === from) continue;
      if (taken.has(cs)) {
        blocked.push({ who: S().baseLabel(rec) || from, from: from, cs: cs });
        continue;
      }
      taken.delete(from);
      taken.add(cs);
      map.instructors.set(from, cs);
      rows.push({ pass: 2, coll: "instructors", from: from, to: cs,
        who: S().baseLabel(rec) || cs, oid: rec.oid || "" });
    }
    return { map: map, rows: rows, blocked: blocked,
      p1: rows.filter((r) => r.pass === 1).length, p2: rows.filter((r) => r.pass === 2).length };
  }

  function repairCodes() {
    /* R12 verify item 21 — the button is already gated out of the DOM while
       locked, but a seam-level refusal must never read as a success toast */
    if (window.SchedEdit && !window.SchedEdit.on()) {
      window.SchedEdit.refuse("repair codes");
      return;
    }
    const plan = repairPlan();
    if (!plan.rows.length) {
      S().toast(plan.blocked.length
        ? "Nothing to repair — " + plan.blocked.length + " call sign(s) are already another person's code and were left alone."
        : "Nothing to repair — every code is a proper one and every active instructor's code is his call sign.", "good");
      return;
    }
    let hits = 0;
    const spM = plan.map.students, ipM = plan.map.instructors;
    const sp = (v) => { const k = String(v == null ? "" : v); if (!spM.has(k)) return v; hits += 1; return spM.get(k); };
    const ip = (v) => { const k = String(v == null ? "" : v); if (!ipM.has(k)) return v; hits += 1; return ipM.get(k); };
    const person = (v) => { const k = String(v == null ? "" : v); return spM.has(k) ? sp(v) : (ipM.has(k) ? ip(v) : v); };

    /* count first, on a THROWAWAY copy, so the dialog can promise a number */
    const dry = () => {
      const before = hits;
      rewriteAll(JSON.parse(JSON.stringify({
        trainingLog: S().get("trainingLog") || [], availability: S().get("availability") || [],
        gates: S().get("gates") || [], dutyRoster: S().get("dutyRoster") || [],
        dayPlans: S().get("dayPlans") || {}, students: S().get("students") || [],
      })), sp, ip, person);
      const n = hits - before;
      hits = before;
      return n;
    };
    const refs = dry();

    /* Round 14 — the two passes are previewed SEPARATELY. They are different
       promises: pass 1 repairs a key that was never a code, pass 2 changes a
       perfectly valid code into the name the squadron actually uses. A user
       must be able to see which of the two he is agreeing to. */
    const block = (pass, title) => {
      const rows = plan.rows.filter((r) => r.pass === pass);
      if (!rows.length) return "";
      const list = rows.slice(0, 10).map((r) =>
        "· " + r.from + "  →  " + r.to + "   (" + r.who + (r.oid ? ", OID " + r.oid : ", no OID") + ")").join("\n");
      return title + " — " + rows.length + "\n" + list
        + (rows.length > 10 ? "\n· …and " + (rows.length - 10) + " more" : "") + "\n\n";
    };
    const blockedTxt = plan.blocked.length
      ? "NOT renamed — the call sign is already another person's code:\n"
        + plan.blocked.slice(0, 5).map((b) => "· " + b.who + " keeps " + b.from + " (call sign " + b.cs + " is taken)").join("\n")
        + (plan.blocked.length > 5 ? "\n· …and " + (plan.blocked.length - 5) + " more" : "") + "\n\n"
      : "";
    if (!confirm("Repair " + plan.rows.length + " code" + (plan.rows.length === 1 ? "" : "s") + "?\n\n"
      + block(1, "id-shaped codes")
      + block(2, "codes aligned to call signs")
      + blockedTxt
      + refs + " reference(s) in the training log, availability, gates, duties and day plans are rewritten "
      + "in the same pass. OIDs are NOT touched — identity does not change.\n\n"
      + "Export a backup first if you want a way back.")) return;

    /* ONE deep copy, rewritten, then written back collection by collection */
    const next = JSON.parse(JSON.stringify({
      trainingLog: S().get("trainingLog") || [], availability: S().get("availability") || [],
      gates: S().get("gates") || [], dutyRoster: S().get("dutyRoster") || [],
      dayPlans: S().get("dayPlans") || {}, students: S().get("students") || [],
    }));
    rewriteAll(next, sp, ip, person);
    /* the people themselves: the code IS the key, so the whole list is put.
       The students list is put in every case — even with no student renamed
       its IP references may have been rewritten above. */
    const recode = (list, m) => list.map((r) =>
      (m.has(String(r.code)) ? Object.assign({}, r, { code: m.get(String(r.code)) }) : r));
    if (ipM.size) S().put("instructors", recode(S().get("instructors") || [], ipM));
    S().put("students", recode(next.students, spM));
    S().put("trainingLog", next.trainingLog);
    S().put("availability", next.availability);
    S().put("gates", next.gates);
    S().put("dutyRoster", next.dutyRoster);
    S().put("dayPlans", next.dayPlans);

    /* ui that still names an old code (see the header note on the board) */
    ui.roster.editS = ui.roster.editI = null;
    ui.roster.addS = ui.roster.addI = false;
    if (ui.log.f.student) ui.log.f.student = sp(ui.log.f.student);
    if (ui.log.form) {
      if (ui.log.form.student) ui.log.form.student = sp(ui.log.form.student);
      if (ui.log.form.instructor) ui.log.form.instructor = ip(ui.log.form.instructor);
    }
    if (window.schBoardReset) window.schBoardReset();
    P().invalidate();
    S().toast(plan.rows.length + " code(s) repaired (" + plan.p1 + " id-shaped · " + plan.p2
      + " aligned to call signs) · " + refs + " reference(s) rewritten"
      + (plan.blocked.length ? " · " + plan.blocked.length + " left alone: the call sign is another person's code" : "")
      + ". Re-import the roster file now — it re-applies call sign, names and fields BY OID.", "good");
  }

  /* the one rewriter, used twice: once on a throwaway copy to COUNT and once
     for real. Mutates in place; every substitution goes through sp/ip/person,
     which are what keep the tally honest.                                    */
  function rewriteAll(d, sp, ip, person) {
    for (const ev of d.trainingLog || []) {
      if (ev.student) ev.student = sp(ev.student);
      if (ev.instructor) ev.instructor = ip(ev.instructor);
      for (const a of ev.absent || []) if (a && a.student) a.student = sp(a.student);
    }
    for (const a of d.availability || []) {
      if (!a || !a.person) continue;
      const was = String(a.person);
      a.person = person(a.person);
      if (String(a.person) !== was) a.id = a.person + "|" + a.date;   // the id IS person|date
    }
    for (const g of d.gates || []) if (g && g.student) g.student = sp(g.student);
    const DUTY_ONE = ["sof_a", "sof_b", "rsu_a", "rsu_b", "rsu", "SOF", "RSU", "ground_1", "ground_2", "ground_instructor", "ground"];
    for (const r of d.dutyRoster || []) {
      if (!r) continue;
      for (const k of DUTY_ONE) if (r[k]) r[k] = ip(r[k]);
      if (Array.isArray(r.alt_instructors)) r.alt_instructors = r.alt_instructors.map((x) => (x ? ip(x) : x));
    }
    const plans = d.dayPlans || {};
    for (const date of Object.keys(plans)) {
      const p = plans[date];
      if (!p || typeof p !== "object") continue;
      const flightLine = (l) => { if (!l) return; if (l.sp) l.sp = sp(l.sp); if (l.ip) l.ip = ip(l.ip); };
      for (const w of p.waves || []) for (const l of (w && w.lines) || []) flightLine(l);
      for (const l of p.fs || []) flightLine(l);
      for (const a of p.alt_students || []) if (a && a.sp) a.sp = sp(a.sp);
      for (const a of p.alt_instructors || []) if (a && a.ip) a.ip = ip(a.ip);
      for (const l of p.lessons || []) {
        if (!l) continue;
        if (l.student) l.student = sp(l.student);
        if (l.instructor) l.instructor = ip(l.instructor);
        if (l.absent && typeof l.absent === "object" && !Array.isArray(l.absent)) {
          const out = {};
          for (const k of Object.keys(l.absent)) out[sp(k)] = l.absent[k];
          l.absent = out;
        }
      }
    }
    /* Round 4 stores OIDs here; a pre-Round-4 value can still be a code */
    for (const s of d.students || []) {
      if (!s) continue;
      if (s.primary_ip) s.primary_ip = ip(s.primary_ip);
      if (Array.isArray(s.reserve_ips)) s.reserve_ips = s.reserve_ips.map((x) => (x ? ip(x) : x));
      if (Array.isArray(s.avoid_ips)) s.avoid_ips = s.avoid_ips.map((x) => (x ? ip(x) : x));
    }
    return d;
  }

  /* ── THE MISTYPED-OID WARNING (Round 9 residual) ─────────────────────────
     Merging is BY OID, which is exactly right and exactly why one wrong digit
     is invisible: the row arrives as a BRAND-NEW person who happens to carry
     the surname or the call sign of somebody already here. Neither side can be
     called wrong from here — the file may legitimately hold two people with
     one surname — so the merge is NOT touched. The confirm dialog simply says
     what it noticed, on its own line, and the decision stays the user's.
     Returns [] when there is nothing to say. */
  function rosterCollisions(plan) {
    const norm = (v) => String(v == null ? "" : v).trim().toLowerCase();
    /* everybody already in the app, indexed by the two handles a human types:
       the surname, and the call sign (the local `code` counts as one — a new
       person's call sign BECOMES their code, so a clash there is the same
       mistake wearing a different hat). */
    const byName = new Map(), byCall = new Map();
    const add = (m, k, x) => { if (!k) return; if (!m.has(k)) m.set(k, []); m.get(k).push(x); };
    for (const coll of ["instructors", "students"]) {
      for (const x of S().get(coll) || []) {
        add(byName, norm(x.last_name), x);
        add(byCall, norm(x.callsign), x);
        if (norm(x.callsign) !== norm(x.code)) add(byCall, norm(x.code), x);
      }
    }
    /* Round 12a — the warning names PEOPLE, not handles: the OID is what the
       user is being asked to check, so it stays, but it now follows a name he
       can recognise instead of standing alone. */
    const nameOf = (x) => S().personOption(x) + (x.oid ? "" : " — added by hand, no OID");
    const lines = [];
    for (const p of plan) {
      if (!p.isNew) continue;                            // an update BY OID is the normal path
      const hits = new Map();                            // existing record → what it shares
      const mark = (x, what) => {
        if (String(x.oid || "") === p.oid) return;       // same person: not a clash
        if (!hits.has(x)) hits.set(x, []);
        if (hits.get(x).indexOf(what) < 0) hits.get(x).push(what);
      };
      for (const x of byName.get(norm(p.rec.last_name)) || []) mark(x, "the surname");
      for (const x of byCall.get(norm(p.rec.callsign)) || []) mark(x, "call sign " + p.rec.callsign);
      for (const [x, what] of hits) {
        lines.push("⚠ new " + S().baseLabel(p.rec) + " (OID " + p.oid + ") shares " + what.join(" and ")
          + " with existing " + nameOf(x) + " — check for a mistyped OID");
      }
    }
    if (lines.length > 8) {
      const extra = lines.length - 8;
      lines.length = 8;
      lines.push("⚠ …and " + extra + " more such clash" + (extra === 1 ? "" : "es"));
    }
    return lines;
  }

  function mergeRoster(data) {
    if (!data || typeof data !== "object") { S().toast("Roster import failed — unexpected file.", "bad"); return; }
    const plan = [];                                   // [{coll, rec, isNew, name}]
    for (const coll of ["instructors", "students"]) {
      const list = Array.isArray(data[coll]) ? data[coll] : [];
      const cur = S().get(coll) || [];
      const byOid = new Map();
      const taken = new Set();
      for (const x of cur) { if (x.oid) byOid.set(String(x.oid), x); if (x.code) taken.add(String(x.code)); }
      for (const r of list) {
        const oid = r && r.oid != null ? String(r.oid).trim() : "";
        if (!oid) continue;                            // no OID, no identity
        const prev = byOid.get(oid) || null;
        const patch = rosterPatch(r, coll);
        const rec = prev
          ? Object.assign({ code: prev.code }, patch)  // OID untouched: it is already on the row
          : Object.assign({ code: mintCode(coll, r.call_sign, taken), oid: oid }, patch);
        if (coll === "instructors") Object.assign(rec, rosterQuals(r, prev));
        plan.push({ coll: coll, oid: oid, rec: rec, isNew: !prev,
          name: (rec.rank ? rec.rank + " " : "") + (S().baseLabel(rec) || rec.code) });
      }
    }
    if (!plan.length) { S().toast("Roster import failed — no person with an OID inside.", "bad"); return; }
    const upd = plan.filter((p) => !p.isNew).length, add = plan.length - upd;
    const seen = new Set(plan.map((p) => p.coll + "|" + p.oid));
    const untouched = ["instructors", "students"].reduce((n, c) =>
      n + (S().get(c) || []).filter((x) => !seen.has(c + "|" + String(x.oid || ""))).length, 0);
    const warn = rosterCollisions(plan);
    if (!confirm("Import the global roster?\n\n"
      + "· " + upd + " person(s) already here — updated in place, OID unchanged\n"
      + "· " + add + " new person(s) — created\n"
      + "· " + untouched + " person(s) the file does not mention — left untouched\n\n"
      + (warn.length ? warn.join("\n") + "\n\n" : "")
      + "Nothing is deleted. Everything stays editable afterwards.")) return;
    for (const p of plan) S().upsert(p.coll, p.rec);
    P().invalidate();
    S().toast("Roster imported — " + upd + " updated · " + add + " created · " + untouched + " untouched.", "good");
  }

  /* Blob.text() with the FileReader fallback the store already uses — the
     offline package targets an old Firefox and must not lose the feature. */
  function readTextFile(file) {
    if (file.text) return file.text();
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(String(fr.result));
      fr.onerror = () => rej(new Error("read failed"));
      fr.readAsText(file);
    });
  }

  async function importRosterFile(file) {
    if (!file) return;
    let data;
    try { data = JSON.parse(await readTextFile(file)); }
    catch (e) { S().toast("Roster import failed — not valid JSON.", "bad"); return; }
    mergeRoster(data);
  }

  function delStudent(code) {
    const n = (S().get("trainingLog") || []).filter((e) => e.student === code).length;
    if (!confirm(`Delete student ${code}?` + (n ? `\n${n} training-log entries name this student and stay behind.` : ""))) return;
    ui.roster.editS = null;
    S().remove("students", code);
    S().toast("Student " + code + " deleted.", "good");
  }

  /* a referenced instructor is NEVER hard-deleted — the action becomes "mark
     departed" (kept in history, excluded from every picker); a real delete is
     offered only when nothing references them. */
  function delInstructor(code) {
    const rec = S().find("instructors", code);
    if (!rec) return;
    const refs = P().references(rec);
    if (refs.any) {
      if (rec.status === "departed") { S().toast(code + " is referenced (" + refs.log + " log · " + refs.students + " SP · " + refs.duty + " duty) — stays as DEPARTED.", "bad"); return; }
      if (!confirm(`${code} is referenced by ${refs.log} log event(s), ${refs.students} student(s), ${refs.duty} duty day(s).\n`
        + `Instructors with history are never hard-deleted.\n\nMark ${code} as DEPARTED instead?`)) return;
      ui.roster.editI = null;
      S().upsert("instructors", { code: code, status: "departed" });
      S().toast("Instructor " + code + " marked DEPARTED — history kept, excluded from pickers.", "good");
      return;
    }
    if (!confirm(`Delete instructor ${code}? Nothing references them.`)) return;
    ui.roster.editI = null;
    S().remove("instructors", code);
    S().toast("Instructor " + code + " deleted.", "good");
  }

  /* ══ TRAINING LOG ════════════════════════════════════════════════════════ */
  function blankForm() {
    return {
      id: "", node: "", date: today(), start_date: "", end_date: "",
      scope: "student", class: "", classes: [], student: "", instructor: "", device: "",
      result: "completed", score: "", note: "", absent: {},
      category: "", maneuvers: "",
      course: "", periods_done: "",             // Round 5 — per-course lessons
      nfsRef: "",                               // Round 6 — NFS → failed exam node
    };
  }

  /* Round 5 — the coverage the form should show: the selected student's own,
     or the class-pace (max over members) of the selected classes. */
  function formAudienceCoverage(uid) {
    const f = ui.log.form || {};
    if (f.scope === "student" && f.student) return R().courseCoverage(f.student, uid);
    const cls = (f.classes || []).filter(Boolean);
    if (f.scope === "class" && cls.length) return R().classCoverage(cls, uid);
    return null;
  }
  function courseRemaining(uid, code) {
    const c = R().courseOf(uid, code);
    if (!c) return 0;
    const cov = formAudienceCoverage(uid);
    if (!cov) return c.periods;
    const row = cov.courses.find((r) => r.code === c.code);
    return Math.max(0, c.periods - (row ? row.done : 0));
  }
  const covSuffix = (cov, code) => {
    if (!cov) return "";
    const r = cov.courses.find((x) => x.code === code);
    if (!r) return "";
    return " · " + r.done + "/" + r.periods + " covered" + (r.complete || cov.completeLegacy ? " ✓" : "");
  };

  function renderLog() {
    const el = $id("sch-log");
    el.innerHTML = `
      <section class="panel sch-panel">
        <div class="sch-h"><h2>New entry</h2>
          <button type="button" class="sch-btn" data-act="toggle-form">${ui.log.open ? "Hide" : "Open"} form</button></div>
        ${ui.log.nfsSuggest ? `<div class="sch-consqban is-apt"><b>NFS suggested</b> —
          ground-exam failure of <span class="sch-code">${esc(nm(ui.log.nfsSuggest.student))}</span>
          on ${esc(window.fmtDMY(ui.log.nfsSuggest.date))} (${esc(ui.log.nfsSuggest.label)}) —
          a Φύλλο Μη Πτήσης (Α0473) follows an exam failure
          <em class="sch-wcid" title="${esc("fail-83 — " + (CQ() ? CQ().vb("fail-83") : ""))}">fail-83</em>
          <span class="sch-spacer"></span>
          <button type="button" class="sch-btn primary" data-act="nfs-fill">Record the NFS</button>
          <button type="button" class="sch-mini" data-act="nfs-dismiss" title="dismiss the suggestion">✕</button></div>` : ""}
        <div id="sch-formwrap" class="${ui.log.open ? "" : "hidden"}"></div>
      </section>
      <section class="panel sch-panel">
        <div class="sch-h"><h2>Training log <span class="count" id="sch-logcount"></span></h2></div>
        ${logFilters()}
        <div class="sch-scroll" id="sch-logtbl"></div>
      </section>`;
    if (ui.log.open) renderForm();
    renderLogTable();
    wireLog(el);
  }

  function logFilters() {
    const f = ui.log.f;
    return `<div class="sch-filters">
      <label class="sch-fld"><span>Student</span>
        <select class="sch-in" data-flt="student"><option value="">All</option>
          ${students().map((s) => `<option value="${esc(s.code)}"${f.student === s.code ? " selected" : ""}>${esc(S().personOption(s))}</option>`).join("")}
        </select></label>
      <label class="sch-fld"><span>Kind</span>
        <select class="sch-in" data-flt="kind"><option value="">All</option>
          ${R().KINDS.map((k) => `<option value="${k}"${f.kind === k ? " selected" : ""}>${esc(R().KIND_LABEL[k])}</option>`).join("")}
        </select></label>
      <label class="sch-fld"><span>From</span><input type="date" class="sch-in" data-flt="from" value="${esc(f.from)}"></label>
      <label class="sch-fld"><span>To</span><input type="date" class="sch-in" data-flt="to" value="${esc(f.to)}"></label>
      <label class="sch-fld grow"><span>Search</span><input type="search" class="sch-in" data-flt="q" value="${esc(f.q)}" placeholder="node · instructor · note"></label>
    </div>`;
  }

  function logRows() {
    const f = ui.log.f;
    const q = f.q.trim().toLowerCase();
    return (S().get("trainingLog") || []).filter((ev) => {
      if (f.student) {
        const hit = ev.scope === "student" ? ev.student === f.student
          : R().classesOf(ev).some((c) => S().membersOf(c).indexOf(f.student) >= 0);
        if (!hit) return false;
      }
      if (f.kind && evKind(ev) !== f.kind) return false;
      const d = ev.end_date || ev.date || "";
      const d0 = ev.start_date || ev.date || "";
      if (f.from && d && d < f.from) return false;
      if (f.to && d0 && d0 > f.to) return false;
      if (q) {
        const dsc = R().describe(evNode(ev));
        const spd = ev.special && CQ() ? CQ().SPECIAL[ev.special] : null;
        const hay = [evNode(ev), dsc ? dsc.label : "", dsc ? dsc.name : "",
          spd ? spd.short + " " + spd.label + " special" : "",
          ev.special === NFS_KEY ? "nfs φύλλο μη πτήσης no-fly sheet " + (NFS_CAT_LABEL[ev.category] || "") : "",
          ev.category,
          ev.instructor, ev.device, ev.note, ev.maneuvers, ev.student,
          R().classesOf(ev).join(" "), ev.course]
          .filter(Boolean).join(" ").toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    }).sort((a, b) => {
      const da = a.date || a.start_date || "", dbb = b.date || b.start_date || "";
      return da < dbb ? 1 : da > dbb ? -1 : 0;
    });
  }

  const DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  function dayHead(iso, n) {
    const t = Date.parse(iso + "T00:00:00Z");
    const dow = isNaN(t) ? "" : " — " + DOW[new Date(t).getUTCDay()];
    return `<tr class="sch-loggrp"><td colspan="10">${esc(window.fmtDMY(iso))}${esc(dow)} <span class="count">${n} event${n === 1 ? "" : "s"}</span></td></tr>`;
  }

  /* the log renders GROUPED under date headers, newest date first */
  function renderLogTable() {
    const all = logRows();
    const rows = all.slice(0, LOG_ROW_CAP);
    const cnt = $id("sch-logcount");
    if (cnt) {
      cnt.textContent = all.length + " of " + (S().get("trainingLog") || []).length
        + (all.length > rows.length ? " · newest " + rows.length + " shown" : "");
    }
    const perDay = new Map();
    for (const ev of rows) {
      const d = ev.date || ev.start_date || "—";
      perDay.set(d, (perDay.get(d) || 0) + 1);
    }
    let lastDate = null;
    const body = rows.map((ev) => {
      const gd = ev.date || ev.start_date || "—";
      const head = gd !== lastDate ? dayHead(gd, perDay.get(gd) || 0) : "";
      lastDate = gd;
      return head + logRowHtml(ev);
    }).join("");
    const host = $id("sch-logtbl");
    if (!host) return;
    host.innerHTML = `<table class="sch-tbl">
      <thead><tr><th>Date</th><th>Node</th><th>Kind</th><th>Scope</th><th>IP</th><th>Device</th><th>Result</th><th>Absent</th><th>Note</th><th class="sch-act"></th></tr></thead>
      <tbody>${body || `<tr><td colspan="10" class="sch-hint">No events match.</td></tr>`}</tbody></table>`;
  }

  function logRowHtml(ev) {
      const d = R().describe(evNode(ev));
      const isNfs = ev.special === NFS_KEY;
      const spd = ev.special && !isNfs && CQ() ? CQ().SPECIAL[ev.special] : null;
      const k = evKind(ev);
      const when = ev.start_date
        ? esc(window.fmtDMY(ev.start_date)) + " → " + esc(ev.end_date ? window.fmtDMY(ev.end_date) : "…")
        : esc(ev.date ? window.fmtDMY(ev.date) : "—");
      const evCls = R().classesOf(ev);
      const who = ev.scope === "class"
        ? `<span class="sch-badge">class${evCls.length > 1 ? " ×" + evCls.length : ""}</span> ${esc(evCls.join(" · ") || "—")}`
        : `<span class="sch-badge alt">SP</span> ${esc(nm(ev.student) || "—")}`;
      const abs = (ev.absent || []).length;
      /* PASS / LAG (YSTERISI) / FAIL (APOTYXIA) — legacy repeat renders as LAG */
      const raw = ev.result || "completed";
      const isFly = k === "flights" || k === "fs";
      const res = isNfs ? "—"
        : raw === "score" ? esc(String(ev.score ?? "")) + "%"
          : esc(isFly ? (RESULT_LABEL[raw] || raw) : (raw === "repeat" ? "LAG (YSTERISI)" : raw));
      const rcls = isNfs ? "" : raw === "repeat" ? "lag" : raw;
      /* Round 5 — a per-course lesson event shows the COURSE + its periods */
      const crs = ev.course && d ? R().courseOf(evNode(ev), ev.course) : null;
      const per = ev.course ? (ev.periods_done != null ? ev.periods_done : (crs ? crs.periods : "")) : "";
      const nodeCell = isNfs
        ? `<span class="sch-code">NFS</span> <span class="sch-note">Φύλλο Μη Πτήσης</span>
           ${ev.category ? `<span class="sch-badge warn">${esc(NFS_CAT_LABEL[ev.category] || ev.category)}</span>` : ""}
           ${ev.ref ? `<span class="sch-badge" title="failed exam">${esc(R().label(ev.ref))}</span>` : ""}`
        : spd
        ? `<span class="sch-code">${esc(spd.short)}</span> <span class="sch-note">${esc(spd.label)}</span>
           ${ev.category && CQ() ? `<span class="sch-badge">${esc(CQ().CAT_LABEL[ev.category] || ev.category)}</span>` : ""}`
        : ev.course && d
          ? `<span class="sch-code">${esc(ev.course)}</span> <span class="sch-note">${esc(crs ? crs.name : d.name)}</span>
             <span class="sch-badge" title="${esc("periods covered by this event" + (crs ? " — course total " + crs.periods : "") + " · group " + d.label)}">${esc(String(per))}${crs ? "/" + crs.periods : ""} per.</span>`
          : d ? `<span class="sch-code">${esc(d.short)}</span> <span class="sch-note">${esc(d.name)}</span>`
            : `<span class="sch-warn">${esc(evNode(ev) || "—")}</span>`;
      const ipShares = Array.isArray(ev.instructors) && ev.instructors.length > 1
        ? ` <span class="sch-badge" title="${esc(ev.instructors.map((s) => nm(s.ip) + " " + s.periods + " per.").join(" · "))}">+${ev.instructors.length - 1}</span>` : "";
      return `<tr>
        <td class="sch-mono">${when}</td>
        <td>${nodeCell}</td>
        <td><span class="sch-badge ${isNfs ? "warn" : "k-" + esc(k || "x")}">${esc(isNfs ? "NFS" : (k && R().KIND_SHORT[k]) || "?")}</span></td>
        <td>${who}</td>
        <td class="sch-mono">${esc(nm(ev.instructor) || "—")}${ipShares}</td>
        <td class="sch-mono">${esc(ev.device || "—")}</td>
        <td><span class="sch-badge r-${esc(rcls)}">${res}</span></td>
        <td>${abs ? `<span class="sch-badge warn" title="${esc((ev.absent || []).map((a) => nm(a.student) + (a.reason ? " — " + a.reason : "")).join(" · "))}">${abs} absent</span>` : "—"}</td>
        <td class="sch-note">${ev.maneuvers ? `<span class="sch-badge warn" title="maneuvers to repeat (fail-10)">repeat: ${esc(ev.maneuvers)}</span> ` : ""}${esc(ev.note || "")}</td>
        <td class="sch-act"><button type="button" class="sch-mini" data-act="edit-ev" data-id="${esc(ev.id)}" title="${esc(TIP.logEdit)}">✎</button>
          <button type="button" class="sch-mini danger" data-act="del-ev" data-id="${esc(ev.id)}" title="${esc(TIP.logDel)}">✕</button></td>
      </tr>`;
  }

  /* ── the entry form ─────────────────────────────────────────────────────── */
  function nodeSelectHtml() {
    const f = ui.log.form;
    const hits = new Set(R().search(ui.log.nodeQ));
    const parts = [`<option value="">— select a node —</option>`];
    let n = 0;
    /* special out-of-graph sorties first — they match the free-text search too */
    if (CQ()) {
      const q = ui.log.nodeQ.trim().toLowerCase();
      const sp = Object.keys(CQ().SPECIAL).filter((k) => {
        if (!q) return true;
        const hay = (k + " special " + CQ().SPECIAL[k].label + " " + CQ().SPECIAL[k].short).toLowerCase();
        return q.split(/\s+/).every((t) => hay.indexOf(t) >= 0);
      });
      if (sp.length) {
        n += sp.length;
        parts.push(`<optgroup label="Special — out of graph">` + sp.map((k) =>
          `<option value="${esc(SP_PREFIX + k)}"${f.node === SP_PREFIX + k ? " selected" : ""}>${esc(CQ().SPECIAL[k].short + " — " + CQ().SPECIAL[k].label)}</option>`
        ).join("") + `</optgroup>`);
      }
    }
    /* Round 6 — NFS record, searchable like everything else */
    {
      const q = ui.log.nodeQ.trim().toLowerCase();
      const hay = "nfs record φύλλο μη πτήσης fylo mi ptisis no-fly sheet a0473 exam failure";
      if (!q || q.split(/\s+/).every((t) => hay.indexOf(t) >= 0)) {
        n += 1;
        parts.push(`<optgroup label="Records — out of graph">
          <option value="${esc(SP_PREFIX + NFS_KEY)}"${f.node === SP_PREFIX + NFS_KEY ? " selected" : ""}>NFS — Φύλλο Μη Πτήσης (no-fly sheet · fail-83)</option></optgroup>`);
      }
    }
    for (const k of R().KINDS) {
      for (const sec of R().sections(k)) {
        const shown = sec.uids.filter((u) => hits.has(u));
        if (!shown.length) continue;
        /* Round 5 — LESSONS decompose into their COURSES (one optgroup per
           ground group); ground-exam groups stay whole as before. */
        if (k === "lessons") {
          for (const u of shown) {
            const d = R().describe(u);
            const courses = R().coursesOf(u);
            if (!courses.length) continue;
            const cov = formAudienceCoverage(u);
            n += courses.length;
            parts.push(`<optgroup label="${esc("Lessons · " + d.label)}">` + courses.map((c) => {
              const val = u + "::" + c.code;
              const sel = f.node === u && f.course === c.code;
              const txt = c.code + " — " + c.name + " (" + c.periods + " period" + (c.periods === 1 ? "" : "s")
                + (c.conditional ? " · foreign SPs" : "") + ")" + covSuffix(cov, c.code);
              return `<option value="${esc(val)}"${sel ? " selected" : ""}>${esc(txt)}</option>`;
            }).join("") + `</optgroup>`);
          }
          continue;
        }
        n += shown.length;
        const head = (k === "exams" ? R().KIND_LABEL[k] : R().KIND_SHORT[k] + " · " + sec.label);
        parts.push(`<optgroup label="${esc(head)}">` + shown.map((u) => {
          const d = R().describe(u);
          const tag = (d.checkride ? " ◆" : "") + (d.first_solo ? " ★" : (d.solo_candidate ? " ☆" : "")) + (d.night ? " ☾" : "");
          return `<option value="${esc(u)}"${f.node === u ? " selected" : ""}>${esc(d.short + tag + " — " + d.name)}</option>`;
        }).join("") + `</optgroup>`);
      }
    }
    /* editing a LEGACY group-level lesson event (no course): keep it selectable */
    if (f.node && !f.course && R().kindOf(f.node) === "lessons") {
      const d = R().describe(f.node);
      parts.push(`<optgroup label="kept from the log — whole group (legacy)">
        <option value="${esc(f.node)}" selected>${esc(d ? d.label + " — " + d.name : f.node)}</option></optgroup>`);
      n += 1;
    }
    return { html: parts.join(""), n: n };
  }

  /* evaluator-first IP picker for the special dp/apt sorties (spec §3α B) —
     departed instructors are excluded (kept only as the current value) */
  function evalIpOptions(sel) {
    const pool = activeIps();
    const ev = pool.filter((i) => (i.quals || {}).evaluator);
    const rest = pool.filter((i) => !(i.quals || {}).evaluator);
    const opt = (i) => `<option value="${esc(i.code)}"${i.code === sel ? " selected" : ""}>${esc(S().personOption(i))}</option>`;
    return `<option value="">—</option>` + ev.map(opt).join("")
      + (rest.length ? `<optgroup label="not evaluator-qualified — hard warning">${rest.map(opt).join("")}</optgroup>` : "")
      + (sel && !pool.some((i) => i.code === sel) ? `<optgroup label="departed"><option value="${esc(sel)}" selected>${esc(nmOpt("instructors", sel))}</option></optgroup>` : "");
  }

  function renderForm() {
    const f = ui.log.form || (ui.log.form = blankForm());
    const spKey = spKeyOf(f.node);
    const isNfs = spKey === NFS_KEY;
    const spDef = spKey && !isNfs && CQ() ? CQ().SPECIAL[spKey] : null;
    const kind = isNfs ? "nfs" : (spKey ? "flights" : R().kindOf(f.node));
    const d = f.node && !spKey ? R().describe(f.node) : null;
    const sel = nodeSelectHtml();
    const isLesson = kind === "lessons";
    const isFly = kind === "flights" || kind === "fs";
    if (!f.device && kind) f.device = DEVICE_BY_KIND[kind];

    const host = $id("sch-formwrap");
    host.innerHTML = `
      <div class="sch-form">
        <div class="sch-fgrid">
          <label class="sch-fld grow"><span>Search node</span>
            <input type="search" class="sch-in" id="sch-nodeq" value="${esc(ui.log.nodeQ)}" placeholder="id · name · section · night · checkride" autocomplete="off"></label>
          <label class="sch-fld wide"><span>Node <em>${sel.n} shown</em></span>
            <select class="sch-in sch-mono" id="sch-nodesel">${sel.html}</select></label>
        </div>
        ${d ? `<p class="sch-nodeinfo"><span class="sch-code">${esc(isLesson && f.course ? f.course : d.label)}</span>
          ${esc(isLesson && f.course && R().courseOf(f.node, f.course) ? R().courseOf(f.node, f.course).name : d.name)}
          <span class="sch-badge k-${esc(kind)}">${esc(R().KIND_LABEL[kind])}</span>
          <span class="sch-badge">${esc(d.trackLabel)}</span>
          ${isLesson && f.course ? `<span class="sch-badge" title="group ${esc(d.label)}">${esc(d.label)}</span>` : ""}
          ${d.hours != null ? `<span class="sch-badge">${esc(String(d.hours).replace(".", ","))} h</span>` : ""}
          ${isLesson && f.course && R().courseOf(f.node, f.course)
        ? `<span class="sch-badge">${esc(String(R().courseOf(f.node, f.course).periods))} periods</span>
           ${(() => { const cov = formAudienceCoverage(f.node); const sfx = covSuffix(cov, f.course); return sfx ? `<span class="sch-badge alt">${esc(sfx.replace(" · ", ""))}</span>` : ""; })()}`
        : (d.periods != null ? `<span class="sch-badge">${esc(String(d.periods))} periods</span>` : "")}
          ${d.night ? `<span class="sch-badge warn">night</span>` : ""}
          ${d.checkride ? `<span class="sch-badge warn">checkride</span>` : ""}</p>` : ""}
        ${spDef ? `<p class="sch-nodeinfo"><span class="sch-code">${esc(spDef.short)}</span> ${esc(spDef.label)}
          <span class="sch-badge k-flights">Special sortie</span>
          ${spDef.evaluator ? `<span class="sch-badge warn" title="fail-12 / ΠΔ 29/2020 — flown with an evaluator / the AE / the Sq Cdr">evaluator required</span>` : ""}</p>` : ""}
        ${isNfs ? `<p class="sch-nodeinfo"><span class="sch-code">NFS</span> Φύλλο Μη Πτήσης — no-fly sheet (form Α0473)
          <span class="sch-badge warn" title="${esc("fail-83 — " + (CQ() ? CQ().vb("fail-83") : ""))}">record — no instructor · no result</span>
          <span class="sch-hint">follows a failed written/oral ground exam, or a no-fly by student cause (fail-83)</span></p>` : ""}

        <div class="sch-fgrid">
          ${isLesson
        ? `<label class="sch-fld"><span>Start date</span><input type="date" class="sch-in" data-ff="start_date" value="${esc(f.start_date || f.date)}"></label>
             <label class="sch-fld"><span>End date</span><input type="date" class="sch-in" data-ff="end_date" value="${esc(f.end_date)}"></label>`
        : `<label class="sch-fld"><span>Date</span><input type="date" class="sch-in" data-ff="date" value="${esc(f.date)}"></label>`}
          ${isLesson && f.course ? `<label class="sch-fld"><span>Periods covered</span>
            <input type="number" min="0" class="sch-in" data-ff="periods_done" value="${esc(f.periods_done)}"
              title="periods of ${esc(f.course)} covered by this event — default: the remaining ${esc(String(courseRemaining(f.node, f.course)))}"></label>` : ""}
          ${spKey ? `<label class="sch-fld"><span>Scope</span><select class="sch-in" disabled><option>Student</option></select></label>`
        : `<label class="sch-fld"><span>Scope</span>
            <select class="sch-in" data-ff="scope">
              <option value="student"${f.scope === "student" ? " selected" : ""}>Student</option>
              <option value="class"${f.scope === "class" ? " selected" : ""}>Class</option></select></label>`}
          ${!spKey && f.scope === "class"
        ? `<span class="sch-fld wide"><span>Classes — several at once</span>
             <span class="sch-clsmulti">${S().classList().map((c) => {
          const on = (f.classes || []).indexOf(c.id) >= 0;
          return `<label class="sch-clspick${on ? " is-on" : ""}"><input type="checkbox" data-fcls="${esc(c.id)}"${on ? " checked" : ""}>
                <span>${esc(c.id)} (${c.members.length})</span></label>`;
        }).join("") || `<em class="sch-hint">no class yet</em>`}</span></span>`
        : `<label class="sch-fld"><span>Student</span><select class="sch-in" data-ff="student"><option value="">—</option>
             ${students().map((s) => `<option value="${esc(s.code)}"${f.student === s.code ? " selected" : ""}>${esc(S().personOption(s))}${s.class ? " · " + esc(s.class) : ""}</option>`).join("")}</select></label>`}
          ${isNfs ? `<label class="sch-fld"><span>NFS reason</span><select class="sch-in" data-ff="category"><option value="">—</option>
            ${NFS_CATS.map((o) => `<option value="${esc(o.v)}"${f.category === o.v ? " selected" : ""}>${esc(o.t)}</option>`).join("")}</select></label>`
        : spKey ? `<label class="sch-fld"><span>Category</span><select class="sch-in" data-ff="category"><option value="">—</option>
            ${CQ().CATS.map((c) => `<option value="${esc(c)}"${f.category === c ? " selected" : ""}>${esc(CQ().CAT_LABEL[c])}</option>`).join("")}</select></label>` : ""}
          ${isNfs ? "" : `<label class="sch-fld"><span>Instructor${spDef && spDef.evaluator ? " (evaluator)" : ""}</span>
            <select class="sch-in" data-ff="instructor">${spDef && spDef.evaluator
        ? evalIpOptions(f.instructor)
        : `<option value="">—</option>` + activeIps().map((i) => `<option value="${esc(i.code)}"${f.instructor === i.code ? " selected" : ""}>${esc(S().personOption(i))}</option>`).join("")
          + (f.instructor && !activeIps().some((i) => i.code === f.instructor)
            ? `<optgroup label="departed"><option value="${esc(f.instructor)}" selected>${esc(nmOpt("instructors", f.instructor))}</option></optgroup>` : "")}</select></label>
          <label class="sch-fld"><span>Device</span><input class="sch-in" data-ff="device" value="${esc(f.device)}" list="sch-devlist" placeholder="${esc(DEVICES.join(" · "))}"></label>
          <datalist id="sch-devlist">${DEVICES.map((x) => `<option value="${esc(x)}"></option>`).join("")}</datalist>
          <label class="sch-fld"><span>Result</span><select class="sch-in" data-ff="result">
            ${(isFly ? RESULT_OPTS_FLY : RESULT_OPTS_GND).map((o) => `<option value="${o.v}"${f.result === o.v ? " selected" : ""}>${o.t}</option>`).join("")}</select></label>`}
          ${!isNfs && f.result === "score" ? `<label class="sch-fld"><span>Score %</span>
            <input type="number" min="0" max="100" class="sch-in" data-ff="score" value="${esc(f.score)}"></label>` : ""}
          ${isFly && (f.result === "lag" || f.result === "fail")
        ? `<label class="sch-fld grow"><span>Maneuvers that lagged/failed — repeated on the next sortie (fail-10)</span>
            <input class="sch-in" data-ff="maneuvers" value="${esc(f.maneuvers)}" placeholder="e.g. steep turns · SFL · ILS raw data"></label>` : ""}
          <label class="sch-fld grow"><span>Note</span><input class="sch-in" data-ff="note" value="${esc(f.note)}"></label>
        </div>

        ${f.scope === "class" ? `<div class="sch-fld"><span class="sch-lbl">Absent — they keep the node as a makeup</span>
          <div id="sch-absbox">${absentBox()}</div></div>` : ""}

        <div class="sch-fbtns">
          <button type="button" class="sch-btn primary" data-act="save-ev" title="${esc(TIP.logSave)}">${f.id ? "Update entry" : "Add entry"}</button>
          <button type="button" class="sch-btn" data-act="reset-ev">${f.id ? "Cancel edit" : "Clear"}</button>
          ${f.id ? `<span class="sch-hint">editing <span class="sch-mono">${esc(f.id)}</span></span>` : ""}
        </div>
      </div>`;
  }

  /* Round 5 — the absent picker offers the members of EVERY selected class,
     grouped under class headings (a student in two selected classes shows once) */
  function absentBox() {
    const f = ui.log.form;
    const cls = (f.classes || []).filter(Boolean);
    if (!cls.length) return `<p class="sch-hint">Pick at least one class first.</p>`;
    const row = (code) => {
      const on = Object.prototype.hasOwnProperty.call(f.absent, code);
      return `<label class="sch-absrow${on ? " is-on" : ""}">
        <input type="checkbox" data-abs="${esc(code)}"${on ? " checked" : ""}>
        <span class="sch-code" title="${esc(nmOpt("students", code))}">${esc(nm(code))}</span>
        <input type="text" class="sch-in sch-absr" data-absr="${esc(code)}" placeholder="reason"
               value="${esc(f.absent[code] || "")}"${on ? "" : " disabled"}></label>`;
    };
    const seen = new Set();
    return cls.map((cid) => {
      const mem = S().membersOf(cid).filter((m) => !seen.has(m));
      mem.forEach((m) => seen.add(m));
      return `<div class="sch-absgrp"><div class="sch-absgrp-h">${esc(cid)} <span class="count">${mem.length}</span></div>
        ${mem.length ? `<div class="sch-abs">${mem.map(row).join("")}</div>` : `<p class="sch-hint">no members</p>`}</div>`;
    }).join("");
  }

  function wireLog(el) {
    if (el._wired) return;                      // see wireRoster — attach once
    el._wired = true;
    el.addEventListener("click", (e) => {
      const b = e.target.closest("[data-act]");
      if (!b) return;
      const act = b.dataset.act;
      if (act === "toggle-form") {
        ui.log.open = !ui.log.open;
        if (ui.log.open && !ui.log.form) ui.log.form = blankForm();
        renderLog();
      } else if (act === "save-ev") saveEvent();
      else if (act === "reset-ev") { ui.log.form = blankForm(); renderForm(); }
      else if (act === "edit-ev") editEvent(b.dataset.id);
      else if (act === "del-ev") delEvent(b.dataset.id);
      /* Round 6 — the fail-83 suggestion chip prefills an NFS entry */
      else if (act === "nfs-fill") {
        const g = ui.log.nfsSuggest;
        if (!g) return;
        ui.log.form = Object.assign(blankForm(), {
          node: SP_PREFIX + NFS_KEY, student: g.student, date: g.date,
          category: "written", nfsRef: g.node, device: "", result: "",
          note: "after failed " + g.label + " (fail-83)",
        });
        ui.log.nfsSuggest = null;
        ui.log.open = true;
        renderLog();
      } else if (act === "nfs-dismiss") { ui.log.nfsSuggest = null; renderLog(); }
    });

    el.addEventListener("input", (e) => {
      const t = e.target;
      if (t.dataset.flt) { ui.log.f[t.dataset.flt] = t.value; renderLogTable(); return; }
      if (t.id === "sch-nodeq") {
        ui.log.nodeQ = t.value;
        const sel = $id("sch-nodesel");
        if (sel) { const s = nodeSelectHtml(); sel.innerHTML = s.html; }
        return;
      }
      if (t.dataset.ff) ui.log.form[t.dataset.ff] = t.value;
      if (t.dataset.absr) ui.log.form.absent[t.dataset.absr] = t.value;
    });

    el.addEventListener("change", (e) => {
      const t = e.target;
      if (t.dataset.flt) { ui.log.f[t.dataset.flt] = t.value; renderLogTable(); return; }
      if (t.id === "sch-nodesel") {
        const v = t.value;
        const ci = v.indexOf("::");
        if (ci > 0) {
          /* Round 5 — a COURSE of a ground group: node stays the GROUP uid */
          ui.log.form.node = v.slice(0, ci);
          ui.log.form.course = v.slice(ci + 2);
          ui.log.form.device = "GND";
          ui.log.form.periods_done = String(courseRemaining(ui.log.form.node, ui.log.form.course));
          renderForm();
          return;
        }
        ui.log.form.node = v;
        ui.log.form.course = "";
        ui.log.form.periods_done = "";
        const spk = spKeyOf(v);
        if (spk === NFS_KEY) {
          /* Round 6 — an NFS record: per student, no instructor/device/result */
          ui.log.form.scope = "student";
          ui.log.form.device = "";
          ui.log.form.instructor = "";
          ui.log.form.result = "";
          ui.log.form.category = ui.log.form.category && NFS_CAT_LABEL[ui.log.form.category] ? ui.log.form.category : "";
        } else if (spk) {
          ui.log.form.scope = "student";
          ui.log.form.device = "T-6A";
        } else {
          ui.log.form.device = DEVICE_BY_KIND[R().kindOf(v)] || ui.log.form.device;
          if (R().kindOf(v) === "exams" && ui.log.form.result === "completed") ui.log.form.result = "score";
        }
        renderForm();
        return;
      }
      /* Round 5 — the multi-class checkboxes of a class-scope event */
      if (t.dataset.fcls != null) {
        const f = ui.log.form, id = t.dataset.fcls;
        f.classes = (f.classes || []).slice();
        const ix = f.classes.indexOf(id);
        if (t.checked && ix < 0) f.classes.push(id);
        else if (!t.checked && ix >= 0) f.classes.splice(ix, 1);
        f.class = f.classes[0] || "";
        const mem = new Set();
        f.classes.forEach((c) => S().membersOf(c).forEach((m) => mem.add(m)));
        for (const k of Object.keys(f.absent)) if (!mem.has(k)) delete f.absent[k];
        if (f.course) f.periods_done = String(courseRemaining(f.node, f.course));
        renderForm();
        return;
      }
      if (t.dataset.abs) {                              // in place — never re-render
        const code = t.dataset.abs;
        const reason = el.querySelector(`[data-absr="${CSS.escape(code)}"]`);
        if (t.checked) { ui.log.form.absent[code] = reason ? reason.value : ""; }
        else delete ui.log.form.absent[code];
        if (reason) reason.disabled = !t.checked;
        t.closest(".sch-absrow").classList.toggle("is-on", t.checked);
        return;
      }
      if (!t.dataset.ff) return;
      ui.log.form[t.dataset.ff] = t.value;
      /* Round 5 — a new audience changes the remaining-periods default */
      if (t.dataset.ff === "student" && ui.log.form.course) {
        ui.log.form.periods_done = String(courseRemaining(ui.log.form.node, ui.log.form.course));
      }
      if (t.dataset.ff === "scope" || t.dataset.ff === "class" || t.dataset.ff === "result" || t.dataset.ff === "student") renderForm();
    });
  }

  function saveEvent() {
    const f = ui.log.form;
    if (!f.node) { S().toast("Pick a node first.", "bad"); return; }
    const spKey = spKeyOf(f.node);
    const isNfs = spKey === NFS_KEY;
    const kind = isNfs ? "nfs" : (spKey ? "flights" : R().kindOf(f.node));
    const isLesson = kind === "lessons";
    if (spKey && !f.student) { S().toast(isNfs ? "An NFS is recorded per student." : "A special sortie is recorded per student.", "bad"); return; }
    if (spKey && !f.category) { S().toast(isNfs ? "Pick the NFS reason." : "Pick the category of the special sortie.", "bad"); return; }
    if (!spKey && f.scope === "student" && !f.student) { S().toast("Pick the student.", "bad"); return; }
    const fClasses = (f.classes || []).filter(Boolean);
    if (!spKey && f.scope === "class" && !fClasses.length) { S().toast("Pick at least one class.", "bad"); return; }
    if (isLesson && !f.start_date && !f.date) { S().toast("A lesson block needs a start date.", "bad"); return; }
    if (!isLesson && !f.date) { S().toast("Pick the date.", "bad"); return; }
    if (f.result === "score" && f.score === "") { S().toast("Enter the score.", "bad"); return; }

    /* apt / dp sorties fly with an evaluator — hard warning, not a block */
    let evalWarn = "";
    if (spKey && CQ() && CQ().SPECIAL[spKey] && CQ().SPECIAL[spKey].evaluator) {
      const ip = f.instructor ? S().find("instructors", f.instructor) : null;
      if (!ip || !(ip.quals || {}).evaluator) {
        evalWarn = " ⚠ " + (f.instructor || "no IP") + " is NOT evaluator-qualified (fail-12 — «με Αξιολογητή της Μοίρας»)";
      }
    }

    const isFly = kind === "flights" || kind === "fs";
    const rec = {
      id: f.id || S().uid("ev"),
      node: spKey ? "" : f.node, kind: kind,
      special: spKey || undefined,
      category: spKey ? f.category : undefined,
      scope: spKey ? "student" : f.scope,
      student: (spKey || f.scope === "student") ? f.student : "",
      /* Round 5 — classes: [] is the storage, class stays the first for compat */
      class: (!spKey && f.scope === "class") ? (fClasses[0] || "") : "",
      classes: (!spKey && f.scope === "class") ? fClasses.slice() : undefined,
      instructor: isNfs ? "" : (f.instructor || ""), device: isNfs ? "" : (f.device || ""),
      result: isNfs ? "" : f.result, score: !isNfs && f.result === "score" ? Number(f.score) : null,
      maneuvers: isFly && (f.result === "lag" || f.result === "fail") ? (f.maneuvers || "") : "",
      note: f.note || "",
      ref: isNfs ? (f.nfsRef || undefined) : undefined,   // Round 6 — NFS → exam node
      absent: (!spKey && f.scope === "class")
        ? Object.keys(f.absent).map((c) => ({ student: c, reason: f.absent[c] || "" })) : [],
    };
    if (isLesson) {
      rec.start_date = f.start_date || f.date;
      rec.end_date = f.end_date || rec.start_date;
      rec.date = rec.start_date;
      /* Round 5 — per-course lesson event: node stays the GROUP uid */
      if (f.course) {
        rec.course = f.course;
        rec.periods_done = f.periods_done === "" || isNaN(Number(f.periods_done)) ? null : Math.max(0, Number(f.periods_done));
      }
    } else {
      rec.date = f.date; rec.start_date = ""; rec.end_date = "";
    }
    const wasEdit = !!f.id;
    const label = isNfs ? "NFS (Φύλλο Μη Πτήσης)"
      : spKey ? CQ().SPECIAL[spKey].label
        : (isLesson && f.course ? f.course + " (" + R().label(f.node) + ")" : R().label(f.node));
    /* Round 6 — fail-83: a FAILED written ground exam suggests recording the
       NFS; the chip above the form prefills it (soft — never automatic). */
    let nfsHint = "";
    if (kind === "exams" && rec.scope === "student" && rec.student) {
      const ppRaw = Number(S().cfg("exam_pass_pct", 80));
      const pp = isNaN(ppRaw) || !ppRaw ? 80 : ppRaw;
      const failed = rec.result === "fail" || (rec.result === "score" && rec.score != null && rec.score < pp);
      if (failed) {
        ui.log.nfsSuggest = { student: rec.student, date: rec.date, node: rec.node, label: R().label(rec.node) };
        nfsHint = " · NFS suggested (fail-83)";
      }
    }
    if (isNfs) ui.log.nfsSuggest = null;             // recorded — the chip is done
    ui.log.form = blankForm();                       // before the store event re-renders
    S().upsert("trainingLog", rec);
    S().toast((wasEdit ? "Entry updated — " : "Entry added — ") + label + evalWarn + nfsHint, evalWarn ? "bad" : "good");
  }

  function editEvent(id) {
    const ev = S().find("trainingLog", id);
    if (!ev) return;
    const abs = {};
    for (const a of ev.absent || []) abs[a.student] = a.reason || "";
    ui.log.form = {
      id: ev.id, node: ev.special ? SP_PREFIX + ev.special : evNode(ev),
      date: ev.date || "", start_date: ev.start_date || "", end_date: ev.end_date || "",
      scope: ev.scope || "student", class: ev.class || "",
      classes: ev.scope === "class" ? R().classesOf(ev) : [],
      course: ev.course || "",
      periods_done: ev.periods_done == null ? "" : String(ev.periods_done),
      student: ev.student || "",
      instructor: ev.instructor || "", device: ev.device || "",
      /* migration on READ: the legacy "repeat" shows as LAG in the form */
      result: ev.result === "repeat" ? "lag" : (ev.result || "completed"),
      score: ev.score == null ? "" : String(ev.score),
      note: ev.note || "", absent: abs,
      category: ev.category || "", maneuvers: ev.maneuvers || "",
      nfsRef: ev.ref || "",                       // Round 6 — NFS → exam node
    };
    ui.log.open = true;
    renderLog();
    const w = $id("sch-formwrap");
    if (w) w.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  function delEvent(id) {
    const ev = S().find("trainingLog", id);
    if (!ev) return;
    const lbl = ev.special === NFS_KEY ? "NFS (Φύλλο Μη Πτήσης)"
      : ev.special && CQ() && CQ().SPECIAL[ev.special] ? CQ().SPECIAL[ev.special].label : R().label(evNode(ev));
    if (!confirm(`Delete the ${lbl} entry of ${window.fmtDMY(ev.date || ev.start_date || "—")}?`)) return;
    if (ui.log.form && ui.log.form.id === id) ui.log.form = blankForm();
    S().remove("trainingLog", id);
    S().toast("Entry deleted.", "good");
  }
})();
