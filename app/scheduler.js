"use strict";
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
    kepe_in: "KEPE — entry",
    kepe_out: "KEPE — exit",
  };
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
  const cache = { state: new Map(), frontier: new Map() };

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
    buildHay();
    return G;
  }

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

  function appliesTo(ev, code) {
    if (!ev || !evNode(ev)) return false;
    if (ev.scope === "student") return ev.student === code;
    if (ev.scope === "class") return window.SchedStore.membersOf(ev.class).indexOf(code) >= 0;
    return false;
  }
  const absentIn = (ev, code) => (ev.absent || []).find((a) => a.student === code) || null;

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

    for (const x of log) {
      const ev = x.ev;
      const u = evNode(ev);
      if (!out[u]) continue;                            // node not in this graph
      const abs = absentIn(ev, code);
      const sc = num(ev.score);
      let status;
      if (abs) status = "absent_makeup";
      else if (ev.result === "repeat") status = "repeat";
      else if (ev.result === "score") status = sc != null && sc >= passPct() ? "completed" : "repeat";
      else status = "completed";
      out[u] = {
        status: status, date: evDate(ev), eventId: ev.id, score: sc,
        reason: abs ? (abs.reason || "") : null,
        instructor: ev.instructor || null, device: ev.device || null,
      };
    }
    cache.state.set(code, out);
    return out;
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
          gateType: t, label: GATE_LABEL[t] || g.type, locksFlying: !!GATE_LOCKS_FLYING[t],
          maxDualPerDay: t === "kepe_in" ? 1 : null,
        });
      });
  }
  /* null = free. Otherwise {reason, gate} — flying kinds only; ground training
     keeps running while a gate is open. */
  function blockFor(code, kind) {
    if (kind !== "flights" && kind !== "fs") return null;
    const g = openGates(code).find((x) => x.locksFlying);
    if (!g) return null;
    return {
      gate: g,
      reason: "open " + g.label + (g.date ? " of " + g.date : "") + " — flying stays locked until it is closed",
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
        title: makeups.length ? makeups.map((m) => m.label + " (" + m.status.replace("_", " ") + ")").join(" · ") : null,
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
      const d = evDate(ev);
      if (!d) continue;
      if (ev.instructor) add(ev.instructor, d);
      if (ev.scope === "student") { if (!absentIn(ev, ev.student)) add(ev.student, d); }
      else if (ev.scope === "class") {
        const abs = new Set((ev.absent || []).map((a) => a.student));
        for (const c of window.SchedStore.membersOf(ev.class || "")) if (!abs.has(c)) add(c, d);
      }
    }
    for (const r of (window.SchedStore.get("dutyRoster") || [])) {
      if (!r.date) continue;
      [r.SOF, r.RSU, r.ground_instructor].concat(r.alt_instructors || []).forEach((p) => add(p, r.date));
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
  function invalidate() { cache.state.clear(); cache.frontier.clear(); actIdx = null; }
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
    _graph: G,
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

  const PANES = ["board", "roster", "log", "balance"];
  const STATUS_OPTS = ["active", "hold", "kepe", "withdrawn"];
  const AV_CYCLE = ["available", "LV", "AMC", "TO", "SLV"];
  const RESULT_OPTS = [
    { v: "completed", t: "Completed" },
    { v: "repeat", t: "Repeat" },
    { v: "score", t: "Score %" },
  ];
  const DEVICE_BY_KIND = { lessons: "GND", exams: "GND", fs: "OFT", flights: "T-6A" };
  const DEVICES = ["T-6A", "OFT", "FTD", "GND"];
  const LOG_ROW_CAP = 400;                  // the seed alone carries ~2 000 events
  const evNode = (ev) => (ev && (ev.node || ev.uid)) || "";

  const ui = {
    booted: false, pane: "board",
    roster: { editS: null, editI: null, addS: false, addI: false, availDate: "" },
    log: { f: { student: "", kind: "", from: "", to: "", q: "" }, form: null, nodeQ: "", open: false },
  };

  const today = () => R().todayISO();
  const students = () => (S().get("students") || []).slice();
  const instructors = () => (S().get("instructors") || []).slice();

  /* ── boot ───────────────────────────────────────────────────────────────── */
  window.schInit = async function schInit() {
    if (ui.booted) { render(); return; }
    const host = $id("view-scheduler");
    if (!host) return;
    ui.roster.availDate = today();
    try {
      await S().ready();
      await R().load();
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
    render();
  };

  function wireSubtabs() {
    const bar = $id("sch-subtabs");
    if (!bar || bar._wired) return;
    bar._wired = true;
    bar.addEventListener("click", (e) => {
      const b = e.target.closest(".sch-subtab");
      if (!b) return;
      ui.pane = b.dataset.sch;
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

  /* ══ ROSTER ══════════════════════════════════════════════════════════════ */
  function renderRoster() {
    const el = $id("sch-roster");
    el.innerHTML = `
      <div class="sch-grid2">
        <section class="panel sch-panel">
          <div class="sch-h"><h2>Students <span class="count">${students().length}</span></h2>
            <button type="button" class="sch-btn" data-act="add-s">+ Student</button></div>
          <div class="sch-scroll">${studentTable()}</div>
        </section>
        <section class="panel sch-panel">
          <div class="sch-h"><h2>Instructors <span class="count">${instructors().length}</span></h2>
            <button type="button" class="sch-btn" data-act="add-i">+ Instructor</button></div>
          <div class="sch-scroll">${instructorTable()}</div>
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

  function ipOptions(sel, blank) {
    return (blank ? `<option value=""${sel ? "" : " selected"}>—</option>` : "")
      + instructors().map((i) => `<option value="${esc(i.code)}"${i.code === sel ? " selected" : ""}>${esc(i.code)}</option>`).join("");
  }

  function studentTable() {
    const list = students();
    const rows = list.map((s) => (ui.roster.editS === s.code ? studentEditRow(s) : studentRow(s))).join("");
    const add = ui.roster.addS ? studentEditRow({ code: "", class: "", status: "active", primary_ip: "", reserve_ips: [], notes: "" }, true) : "";
    return `<table class="sch-tbl">
      <thead><tr><th>Code</th><th>Class</th><th>Status</th><th>Primary IP</th><th>Reserve IPs</th><th>Notes</th><th class="sch-act"></th></tr></thead>
      <tbody>${rows}${add}${!list.length && !ui.roster.addS ? `<tr><td colspan="7" class="sch-hint">No students yet.</td></tr>` : ""}</tbody></table>`;
  }

  function studentRow(s) {
    const idle = R().idleDays(s.code, today());
    return `<tr>
      <td class="sch-code">${esc(s.code)}</td>
      <td>${esc(s.class || "—")}</td>
      <td><span class="sch-badge st-${esc(s.status || "active")}">${esc(s.status || "active")}</span></td>
      <td class="sch-mono">${esc(s.primary_ip || "—")}</td>
      <td class="sch-mono">${esc((s.reserve_ips || []).filter(Boolean).join(" · ") || "—")}</td>
      <td class="sch-note">${esc(s.notes || "")}${idle == null ? "" : ` <span class="sch-nd" title="working days since the last recorded event">${idle}d</span>`}</td>
      <td class="sch-act"><button type="button" class="sch-mini" data-act="prog-s" data-id="${esc(s.code)}"
          title="Progress — mark nodes completed, undo, close makeups">Progress</button>
        <button type="button" class="sch-mini" data-act="edit-s" data-id="${esc(s.code)}" title="Edit">✎</button>
        <button type="button" class="sch-mini danger" data-act="del-s" data-id="${esc(s.code)}" title="Delete">✕</button></td>
    </tr>`;
  }

  function studentEditRow(s, isNew) {
    const r = s.reserve_ips || [];
    return `<tr class="sch-edit" data-newrow="${isNew ? 1 : 0}" data-orig="${esc(s.code)}">
      <td><input class="sch-in" data-f="code" value="${esc(s.code)}" placeholder="SP-31"${isNew ? "" : " readonly"}></td>
      <td><input class="sch-in" data-f="class" value="${esc(s.class || "")}" list="sch-classlist" placeholder="99HAF-A"></td>
      <td><select class="sch-in" data-f="status">${STATUS_OPTS.map((o) =>
        `<option value="${o}"${(s.status || "active") === o ? " selected" : ""}>${o}</option>`).join("")}</select></td>
      <td><select class="sch-in" data-f="primary_ip">${ipOptions(s.primary_ip || "", true)}</select></td>
      <td class="sch-two"><select class="sch-in" data-f="r0">${ipOptions(r[0] || "", true)}</select>
        <select class="sch-in" data-f="r1">${ipOptions(r[1] || "", true)}</select></td>
      <td><input class="sch-in" data-f="notes" value="${esc(s.notes || "")}"></td>
      <td class="sch-act"><button type="button" class="sch-mini good" data-act="save-s" title="Save">✔</button>
        <button type="button" class="sch-mini" data-act="cancel" title="Cancel">↩</button></td>
    </tr>`;
  }

  function instructorTable() {
    const list = instructors();
    const rows = list.map((i) => (ui.roster.editI === i.code ? ipEditRow(i) : ipRow(i))).join("");
    const add = ui.roster.addI ? ipEditRow({ code: "", quals: {}, duty_eligible: {}, notes: "" }, true) : "";
    return `<table class="sch-tbl">
      <thead><tr><th>Code</th><th title="Night qualified">Night</th><th title="Evaluator — checkrides">Eval</th>
      <th title="Ground instructor">Ground</th><th title="Duty eligible — Supervisor of Flying">SOF</th>
      <th title="Duty eligible — Runway Supervisory Unit">RSU</th><th>Notes</th><th class="sch-act"></th></tr></thead>
      <tbody>${rows}${add}${!list.length && !ui.roster.addI ? `<tr><td colspan="8" class="sch-hint">No instructors yet.</td></tr>` : ""}</tbody></table>`;
  }

  const yn = (v) => (v ? `<span class="sch-yes">●</span>` : `<span class="sch-no">·</span>`);

  function ipRow(i) {
    const q = i.quals || {}, d = i.duty_eligible || {};
    const idle = R().idleDays(i.code, today());
    return `<tr>
      <td class="sch-code">${esc(i.code)}</td>
      <td>${yn(q.night)}</td><td>${yn(q.evaluator)}</td><td>${yn(q.ground)}</td>
      <td>${yn(d.SOF)}</td><td>${yn(d.RSU)}</td>
      <td class="sch-note">${esc(i.notes || "")}${idle == null ? "" : ` <span class="sch-nd" title="working days since the last recorded event">${idle}d</span>`}</td>
      <td class="sch-act"><button type="button" class="sch-mini" data-act="edit-i" data-id="${esc(i.code)}" title="Edit">✎</button>
        <button type="button" class="sch-mini danger" data-act="del-i" data-id="${esc(i.code)}" title="Delete">✕</button></td>
    </tr>`;
  }

  function ipEditRow(i, isNew) {
    const q = i.quals || {}, d = i.duty_eligible || {};
    const cb = (f, on) => `<input type="checkbox" data-f="${f}"${on ? " checked" : ""}>`;
    return `<tr class="sch-edit" data-newrow="${isNew ? 1 : 0}" data-orig="${esc(i.code)}">
      <td><input class="sch-in" data-f="code" value="${esc(i.code)}" placeholder="IP-16"${isNew ? "" : " readonly"}></td>
      <td>${cb("night", q.night)}</td><td>${cb("evaluator", q.evaluator)}</td><td>${cb("ground", q.ground)}</td>
      <td>${cb("SOF", d.SOF)}</td><td>${cb("RSU", d.RSU)}</td>
      <td><input class="sch-in" data-f="notes" value="${esc(i.notes || "")}"></td>
      <td class="sch-act"><button type="button" class="sch-mini good" data-act="save-i" title="Save">✔</button>
        <button type="button" class="sch-mini" data-act="cancel" title="Cancel">↩</button></td>
    </tr>`;
  }

  function classBlock() {
    const cl = S().classList();
    if (!cl.length) return `<p class="sch-hint">No classes — they appear as soon as a student carries one.</p>`;
    return `<datalist id="sch-classlist">${cl.map((c) => `<option value="${esc(c.id)}"></option>`).join("")}</datalist>
      <div class="sch-cls">${cl.map((c) => `<div class="sch-clscard">
        <div class="sch-clsid">${esc(c.id)}<span class="sch-badge">${c.members.length}</span></div>
        <div class="sch-clsm">${c.members.map((m) => `<span class="sch-chip">${esc(m)}</span>`).join("")}</div>
      </div>`).join("")}</div>`;
  }

  function availGrid() {
    const date = ui.roster.availDate;
    const map = S().availabilityFor(date);
    const cell = (code) => {
      const st = map.get(code) || "available";
      return `<button type="button" class="sch-av av-${esc(st)}" data-av="${esc(code)}" title="${esc(code)} — ${esc(st)} · click to cycle">
        <span class="sch-code">${esc(code)}</span><span class="sch-avst">${esc(st === "available" ? "OK" : st)}</span></button>`;
    };
    const away = [...map.entries()].filter(([, v]) => v && v !== "available").length;
    return `<p class="sch-hint">${esc(date || "—")} · <b>${away}</b> away</p>
      <div class="sch-avgroup"><span class="sch-lbl">Students</span><div class="sch-avrow">${students().map((s) => cell(s.code)).join("")}</div></div>
      <div class="sch-avgroup"><span class="sch-lbl">Instructors</span><div class="sch-avrow">${instructors().map((i) => cell(i.code)).join("")}</div></div>`;
  }

  /* Wired ONCE per pane element: renderRoster() only swaps innerHTML, so the
     delegated listeners survive. Re-attaching them on every render would stack
     handlers and make one click fire N times. */
  function wireRoster(el) {
    if (el._wired) return;
    el._wired = true;
    el.addEventListener("change", (e) => {
      if (e.target.id !== "sch-avdate") return;
      ui.roster.availDate = e.target.value;
      $id("sch-avgrid").innerHTML = availGrid();
    });
    el.addEventListener("click", (e) => {
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
      if (act === "prog-s") {
        if (window.schProgressOpen) window.schProgressOpen(id);
        else S().toast("The progress editor arrives with Phase B.", "bad");
      } else if (act === "add-s") { ui.roster.addS = true; ui.roster.editS = null; renderRoster(); }
      else if (act === "add-i") { ui.roster.addI = true; ui.roster.editI = null; renderRoster(); }
      else if (act === "edit-s") { ui.roster.editS = id; ui.roster.addS = false; renderRoster(); }
      else if (act === "edit-i") { ui.roster.editI = id; ui.roster.addI = false; renderRoster(); }
      else if (act === "cancel") { ui.roster.editS = ui.roster.editI = null; ui.roster.addS = ui.roster.addI = false; renderRoster(); }
      else if (act === "save-s") saveStudent(b.closest("tr"));
      else if (act === "save-i") saveInstructor(b.closest("tr"));
      else if (act === "del-s") delStudent(id);
      else if (act === "del-i") delInstructor(id);
    });
  }

  const fval = (tr, f) => { const x = tr.querySelector(`[data-f="${f}"]`); return x ? (x.type === "checkbox" ? x.checked : x.value.trim()) : ""; };

  function saveStudent(tr) {
    const code = fval(tr, "code");
    if (!code) { S().toast("A student needs a code.", "bad"); return; }
    const isNew = tr.dataset.newrow === "1";
    if (isNew && S().find("students", code)) { S().toast("Code " + code + " already exists.", "bad"); return; }
    const r0 = fval(tr, "r0"), r1 = fval(tr, "r1");
    const rec = {
      code: code, class: fval(tr, "class"), status: fval(tr, "status"),
      primary_ip: fval(tr, "primary_ip"), reserve_ips: [r0, r1].filter(Boolean),
      notes: fval(tr, "notes"),
    };
    ui.roster.editS = null; ui.roster.addS = false;   // before the store event re-renders
    S().upsert("students", rec);
    S().toast("Student " + code + " saved.", "good");
  }

  function saveInstructor(tr) {
    const code = fval(tr, "code");
    if (!code) { S().toast("An instructor needs a code.", "bad"); return; }
    const isNew = tr.dataset.newrow === "1";
    if (isNew && S().find("instructors", code)) { S().toast("Code " + code + " already exists.", "bad"); return; }
    const rec = {
      code: code,
      quals: { night: fval(tr, "night"), evaluator: fval(tr, "evaluator"), ground: fval(tr, "ground") },
      duty_eligible: { SOF: fval(tr, "SOF"), RSU: fval(tr, "RSU") },
      notes: fval(tr, "notes"),
    };
    ui.roster.editI = null; ui.roster.addI = false;   // before the store event re-renders
    S().upsert("instructors", rec);
    S().toast("Instructor " + code + " saved.", "good");
  }

  function delStudent(code) {
    const n = (S().get("trainingLog") || []).filter((e) => e.student === code).length;
    if (!confirm(`Delete student ${code}?` + (n ? `\n${n} training-log entries name this student and stay behind.` : ""))) return;
    ui.roster.editS = null;
    S().remove("students", code);
    S().toast("Student " + code + " deleted.", "good");
  }

  function delInstructor(code) {
    const n = (S().get("trainingLog") || []).filter((e) => e.instructor === code).length;
    if (!confirm(`Delete instructor ${code}?` + (n ? `\n${n} training-log entries name this instructor and stay behind.` : ""))) return;
    ui.roster.editI = null;
    S().remove("instructors", code);
    S().toast("Instructor " + code + " deleted.", "good");
  }

  /* ══ TRAINING LOG ════════════════════════════════════════════════════════ */
  function blankForm() {
    return {
      id: "", node: "", date: today(), start_date: "", end_date: "",
      scope: "student", class: "", student: "", instructor: "", device: "",
      result: "completed", score: "", note: "", absent: {},
    };
  }

  function renderLog() {
    const el = $id("sch-log");
    el.innerHTML = `
      <section class="panel sch-panel">
        <div class="sch-h"><h2>New entry</h2>
          <button type="button" class="sch-btn" data-act="toggle-form">${ui.log.open ? "Hide" : "Open"} form</button></div>
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
          ${students().map((s) => `<option value="${esc(s.code)}"${f.student === s.code ? " selected" : ""}>${esc(s.code)}</option>`).join("")}
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
          : S().membersOf(ev.class || "").indexOf(f.student) >= 0;
        if (!hit) return false;
      }
      if (f.kind && R().kindOf(evNode(ev)) !== f.kind) return false;
      const d = ev.end_date || ev.date || "";
      const d0 = ev.start_date || ev.date || "";
      if (f.from && d && d < f.from) return false;
      if (f.to && d0 && d0 > f.to) return false;
      if (q) {
        const dsc = R().describe(evNode(ev));
        const hay = [evNode(ev), dsc ? dsc.label : "", dsc ? dsc.name : "", ev.instructor, ev.device, ev.note, ev.student, ev.class]
          .filter(Boolean).join(" ").toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    }).sort((a, b) => {
      const da = a.date || a.start_date || "", dbb = b.date || b.start_date || "";
      return da < dbb ? 1 : da > dbb ? -1 : 0;
    });
  }

  function renderLogTable() {
    const all = logRows();
    const rows = all.slice(0, LOG_ROW_CAP);
    const cnt = $id("sch-logcount");
    if (cnt) {
      cnt.textContent = all.length + " of " + (S().get("trainingLog") || []).length
        + (all.length > rows.length ? " · newest " + rows.length + " shown" : "");
    }
    const body = rows.map((ev) => {
      const d = R().describe(evNode(ev));
      const k = R().kindOf(evNode(ev));
      const when = ev.start_date ? esc(ev.start_date) + " → " + esc(ev.end_date || "…") : esc(ev.date || "—");
      const who = ev.scope === "class"
        ? `<span class="sch-badge">class</span> ${esc(ev.class || "—")}`
        : `<span class="sch-badge alt">SP</span> ${esc(ev.student || "—")}`;
      const abs = (ev.absent || []).length;
      const res = ev.result === "score" ? esc(String(ev.score ?? "")) + "%" : esc(ev.result || "completed");
      return `<tr>
        <td class="sch-mono">${when}</td>
        <td>${d ? `<span class="sch-code">${esc(d.short)}</span> <span class="sch-note">${esc(d.name)}</span>`
          : `<span class="sch-warn">${esc(evNode(ev) || "—")}</span>`}</td>
        <td><span class="sch-badge k-${esc(k || "x")}">${esc(k ? R().KIND_SHORT[k] : "?")}</span></td>
        <td>${who}</td>
        <td class="sch-mono">${esc(ev.instructor || "—")}</td>
        <td class="sch-mono">${esc(ev.device || "—")}</td>
        <td><span class="sch-badge r-${esc(ev.result || "completed")}">${res}</span></td>
        <td>${abs ? `<span class="sch-badge warn" title="${esc((ev.absent || []).map((a) => a.student + (a.reason ? " — " + a.reason : "")).join(" · "))}">${abs} absent</span>` : "—"}</td>
        <td class="sch-note">${esc(ev.note || "")}</td>
        <td class="sch-act"><button type="button" class="sch-mini" data-act="edit-ev" data-id="${esc(ev.id)}" title="Edit">✎</button>
          <button type="button" class="sch-mini danger" data-act="del-ev" data-id="${esc(ev.id)}" title="Delete">✕</button></td>
      </tr>`;
    }).join("");
    const host = $id("sch-logtbl");
    if (!host) return;
    host.innerHTML = `<table class="sch-tbl">
      <thead><tr><th>Date</th><th>Node</th><th>Kind</th><th>Scope</th><th>IP</th><th>Device</th><th>Result</th><th>Absent</th><th>Note</th><th class="sch-act"></th></tr></thead>
      <tbody>${body || `<tr><td colspan="10" class="sch-hint">No events match.</td></tr>`}</tbody></table>`;
  }

  /* ── the entry form ─────────────────────────────────────────────────────── */
  function nodeSelectHtml() {
    const f = ui.log.form;
    const hits = new Set(R().search(ui.log.nodeQ));
    const parts = [`<option value="">— select a node —</option>`];
    let n = 0;
    for (const k of R().KINDS) {
      for (const sec of R().sections(k)) {
        const shown = sec.uids.filter((u) => hits.has(u));
        if (!shown.length) continue;
        n += shown.length;
        const head = (k === "lessons" || k === "exams" ? R().KIND_LABEL[k] : R().KIND_SHORT[k] + " · " + sec.label);
        parts.push(`<optgroup label="${esc(head)}">` + shown.map((u) => {
          const d = R().describe(u);
          const tag = (d.checkride ? " ◆" : "") + (d.first_solo ? " ★" : (d.solo_candidate ? " ☆" : "")) + (d.night ? " ☾" : "");
          return `<option value="${esc(u)}"${f.node === u ? " selected" : ""}>${esc(d.short + tag + " — " + d.name)}</option>`;
        }).join("") + `</optgroup>`);
      }
    }
    return { html: parts.join(""), n: n };
  }

  function renderForm() {
    const f = ui.log.form || (ui.log.form = blankForm());
    const kind = R().kindOf(f.node);
    const d = f.node ? R().describe(f.node) : null;
    const sel = nodeSelectHtml();
    const isLesson = kind === "lessons";
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
        ${d ? `<p class="sch-nodeinfo"><span class="sch-code">${esc(d.label)}</span> ${esc(d.name)}
          <span class="sch-badge k-${esc(kind)}">${esc(R().KIND_LABEL[kind])}</span>
          <span class="sch-badge">${esc(d.trackLabel)}</span>
          ${d.hours != null ? `<span class="sch-badge">${esc(String(d.hours).replace(".", ","))} h</span>` : ""}
          ${d.periods != null ? `<span class="sch-badge">${esc(String(d.periods))} periods</span>` : ""}
          ${d.night ? `<span class="sch-badge warn">night</span>` : ""}
          ${d.checkride ? `<span class="sch-badge warn">checkride</span>` : ""}</p>` : ""}

        <div class="sch-fgrid">
          ${isLesson
        ? `<label class="sch-fld"><span>Start date</span><input type="date" class="sch-in" data-ff="start_date" value="${esc(f.start_date || f.date)}"></label>
             <label class="sch-fld"><span>End date</span><input type="date" class="sch-in" data-ff="end_date" value="${esc(f.end_date)}"></label>`
        : `<label class="sch-fld"><span>Date</span><input type="date" class="sch-in" data-ff="date" value="${esc(f.date)}"></label>`}
          <label class="sch-fld"><span>Scope</span>
            <select class="sch-in" data-ff="scope">
              <option value="student"${f.scope === "student" ? " selected" : ""}>Student</option>
              <option value="class"${f.scope === "class" ? " selected" : ""}>Class</option></select></label>
          ${f.scope === "class"
        ? `<label class="sch-fld"><span>Class</span><select class="sch-in" data-ff="class"><option value="">—</option>
             ${S().classList().map((c) => `<option value="${esc(c.id)}"${f.class === c.id ? " selected" : ""}>${esc(c.id)} (${c.members.length})</option>`).join("")}</select></label>`
        : `<label class="sch-fld"><span>Student</span><select class="sch-in" data-ff="student"><option value="">—</option>
             ${students().map((s) => `<option value="${esc(s.code)}"${f.student === s.code ? " selected" : ""}>${esc(s.code)}${s.class ? " · " + esc(s.class) : ""}</option>`).join("")}</select></label>`}
          <label class="sch-fld"><span>Instructor</span><select class="sch-in" data-ff="instructor"><option value="">—</option>
            ${instructors().map((i) => `<option value="${esc(i.code)}"${f.instructor === i.code ? " selected" : ""}>${esc(i.code)}</option>`).join("")}</select></label>
          <label class="sch-fld"><span>Device</span><input class="sch-in" data-ff="device" value="${esc(f.device)}" list="sch-devlist" placeholder="${esc(DEVICES.join(" · "))}"></label>
          <datalist id="sch-devlist">${DEVICES.map((x) => `<option value="${esc(x)}"></option>`).join("")}</datalist>
          <label class="sch-fld"><span>Result</span><select class="sch-in" data-ff="result">
            ${RESULT_OPTS.map((o) => `<option value="${o.v}"${f.result === o.v ? " selected" : ""}>${o.t}</option>`).join("")}</select></label>
          ${f.result === "score" ? `<label class="sch-fld"><span>Score %</span>
            <input type="number" min="0" max="100" class="sch-in" data-ff="score" value="${esc(f.score)}"></label>` : ""}
          <label class="sch-fld grow"><span>Note</span><input class="sch-in" data-ff="note" value="${esc(f.note)}"></label>
        </div>

        ${f.scope === "class" ? `<div class="sch-fld"><span class="sch-lbl">Absent — they keep the node as a makeup</span>
          <div id="sch-absbox">${absentBox()}</div></div>` : ""}

        <div class="sch-fbtns">
          <button type="button" class="sch-btn primary" data-act="save-ev">${f.id ? "Update entry" : "Add entry"}</button>
          <button type="button" class="sch-btn" data-act="reset-ev">${f.id ? "Cancel edit" : "Clear"}</button>
          ${f.id ? `<span class="sch-hint">editing <span class="sch-mono">${esc(f.id)}</span></span>` : ""}
        </div>
      </div>`;
  }

  function absentBox() {
    const f = ui.log.form;
    if (!f.class) return `<p class="sch-hint">Pick a class first.</p>`;
    const mem = S().membersOf(f.class);
    if (!mem.length) return `<p class="sch-hint">This class has no members.</p>`;
    return `<div class="sch-abs">` + mem.map((code) => {
      const on = Object.prototype.hasOwnProperty.call(f.absent, code);
      return `<label class="sch-absrow${on ? " is-on" : ""}">
        <input type="checkbox" data-abs="${esc(code)}"${on ? " checked" : ""}>
        <span class="sch-code">${esc(code)}</span>
        <input type="text" class="sch-in sch-absr" data-absr="${esc(code)}" placeholder="reason"
               value="${esc(f.absent[code] || "")}"${on ? "" : " disabled"}></label>`;
    }).join("") + `</div>`;
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
        ui.log.form.node = t.value;
        ui.log.form.device = DEVICE_BY_KIND[R().kindOf(t.value)] || ui.log.form.device;
        if (R().kindOf(t.value) === "exams" && ui.log.form.result === "completed") ui.log.form.result = "score";
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
      if (t.dataset.ff === "scope" || t.dataset.ff === "class" || t.dataset.ff === "result") renderForm();
    });
  }

  function saveEvent() {
    const f = ui.log.form;
    if (!f.node) { S().toast("Pick a node first.", "bad"); return; }
    const kind = R().kindOf(f.node);
    const isLesson = kind === "lessons";
    if (f.scope === "student" && !f.student) { S().toast("Pick the student.", "bad"); return; }
    if (f.scope === "class" && !f.class) { S().toast("Pick the class.", "bad"); return; }
    if (isLesson && !f.start_date && !f.date) { S().toast("A lesson block needs a start date.", "bad"); return; }
    if (!isLesson && !f.date) { S().toast("Pick the date.", "bad"); return; }
    if (f.result === "score" && f.score === "") { S().toast("Enter the score.", "bad"); return; }

    const rec = {
      id: f.id || S().uid("ev"),
      node: f.node, kind: kind,
      scope: f.scope,
      student: f.scope === "student" ? f.student : "",
      class: f.scope === "class" ? f.class : "",
      instructor: f.instructor || "", device: f.device || "",
      result: f.result, score: f.result === "score" ? Number(f.score) : null,
      note: f.note || "",
      absent: f.scope === "class"
        ? Object.keys(f.absent).map((c) => ({ student: c, reason: f.absent[c] || "" })) : [],
    };
    if (isLesson) {
      rec.start_date = f.start_date || f.date;
      rec.end_date = f.end_date || rec.start_date;
      rec.date = rec.start_date;
    } else {
      rec.date = f.date; rec.start_date = ""; rec.end_date = "";
    }
    const wasEdit = !!f.id, node = f.node;
    ui.log.form = blankForm();                       // before the store event re-renders
    S().upsert("trainingLog", rec);
    S().toast((wasEdit ? "Entry updated — " : "Entry added — ") + R().label(node), "good");
  }

  function editEvent(id) {
    const ev = S().find("trainingLog", id);
    if (!ev) return;
    const abs = {};
    for (const a of ev.absent || []) abs[a.student] = a.reason || "";
    ui.log.form = {
      id: ev.id, node: evNode(ev), date: ev.date || "", start_date: ev.start_date || "", end_date: ev.end_date || "",
      scope: ev.scope || "student", class: ev.class || "", student: ev.student || "",
      instructor: ev.instructor || "", device: ev.device || "",
      result: ev.result || "completed", score: ev.score == null ? "" : String(ev.score),
      note: ev.note || "", absent: abs,
    };
    ui.log.open = true;
    renderLog();
    const w = $id("sch-formwrap");
    if (w) w.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  function delEvent(id) {
    const ev = S().find("trainingLog", id);
    if (!ev) return;
    if (!confirm(`Delete the ${R().label(evNode(ev))} entry of ${ev.date || ev.start_date || "—"}?`)) return;
    if (ui.log.form && ui.log.form.id === id) ui.log.form = blankForm();
    S().remove("trainingLog", id);
    S().toast("Entry deleted.", "good");
  }
})();
