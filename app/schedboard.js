"use strict";
/* schedboard.js — PHASE B of specs/scheduler-spec.md
 *
 *   ① window.schBoardInit(el)   — the live D+1 board: setup, duties, waves,
 *      F/S block, lessons, "not scheduled today", alternates, draft/publish,
 *      the print view and the actualize loop.
 *   ② window.schProgressOpen(c) — the per-student progress editor (full CRUD
 *      over the training log, driven by the flow-chart graph).
 *   ③ window.schBalanceInit(el) — the Balance pane (week / month).
 *
 * CONTRACTS
 *   window.SchedStore — collections, keys, subscribe/upsert. The graph column
 *     of a trainingLog event is `node` (never `uid`); dutyRoster is keyed by
 *     `date`; dayPlans is a map { "YYYY-MM-DD": plan } owned by this file.
 *   window.SchedReady — state(), nextFor(student, kind, {plannedUids, depth}),
 *     pendingOtherKinds(), idleDays(), openGates(), blockFor().
 *
 * WIRING
 *   schBoardInit(el) runs on EVERY render of the pane and on every store
 *   change, so the delegated listeners are attached once (el._wired) and only
 *   the markup is rebuilt. Focus and caret are snapshotted across the rebuild
 *   (data-fk), text typing patches derived cells in place instead of
 *   re-rendering, and every write to the store resets the ui state first.
 *
 * TIME ENGINE (spec §5)
 *   line = brief + ground ops + sortie + debrief, total ALWAYS 03:15 —
 *   the debrief is the elastic, minimum 15'. Sortie length comes from the
 *   flow chart (sortie hours → section hours_per_sortie → section total ÷
 *   sorties), 1:10 when the syllabus gives none. Everything is rounded to 5'
 *   and T/O is legal only between HH:05 and HH:35.
 */
(() => {
  /* ══════════════════════════════════════════════════════════════════════
     0 · helpers
     ══════════════════════════════════════════════════════════════════════ */
  const $id = (x) => document.getElementById(x);
  const ESCM = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ESCM[c]);
  const S = () => window.SchedStore;
  const R = () => window.SchedReady;
  const num = (v, d) => (v == null || v === "" || isNaN(Number(v)) ? d : Number(v));
  const cssq = (s) => (window.CSS && CSS.escape ? CSS.escape(String(s)) : String(s).replace(/["\\]/g, "\\$&"));

  const DAY_MS = 86400000;
  const isoShift = (iso, d) => {
    const t = Date.parse(String(iso) + "T00:00:00Z");
    return isNaN(t) ? iso : new Date(t + d * DAY_MS).toISOString().slice(0, 10);
  };
  const today = () => R().todayISO();
  const students = () => (S().get("students") || []).slice();
  const instructors = () => (S().get("instructors") || []).slice();
  const AV_CYCLE = ["available", "LV", "AMC", "TO", "SLV"];
  const FS_DEVICES = ["OFT", "FTD"];

  /* ── time ─────────────────────────────────────────────────────────────── */
  const pad2 = (n) => (n < 10 ? "0" : "") + n;
  function hm2min(s) {
    const m = /^\s*(\d{1,2}):(\d{2})\s*$/.exec(String(s == null ? "" : s));
    if (!m) return null;
    const h = +m[1], mi = +m[2];
    return h > 23 || mi > 59 ? null : h * 60 + mi;
  }
  function min2hm(v) {
    if (v == null || isNaN(v)) return "—";
    const x = ((Math.round(v) % 1440) + 1440) % 1440;
    return pad2(Math.floor(x / 60)) + ":" + pad2(x % 60);
  }
  function dur2hm(v) {
    if (v == null || isNaN(v)) return "—";
    const s = v < 0 ? "−" : "";
    const x = Math.abs(Math.round(v));
    return s + Math.floor(x / 60) + ":" + pad2(x % 60);
  }
  const round5 = (v, r) => Math.round(v / (r || 5)) * (r || 5);

  /* ── config (spec §6 "parameters of the day") ─────────────────────────── */
  function CF() {
    const w = S().cfg("wave_template", {}) || {};
    const sl = S().cfg("slots", {}) || {};
    return {
      brief: num(w.brief_min, 30), ground: num(w.ground_ops_min, 45),
      minDeb: num(w.debrief_min_min, 15), total: num(w.total_min, 195),
      round: num(w.round_min, 5) || 5,
      slotFrom: num(sl.to_window_from_min, 5), slotTo: num(sl.to_window_to_min, 35),
      stagger: num(sl.stagger_min, 5) || 5,
      turn: num(S().cfg("turnaround_ip_min", 120), 120),
      iff: (S().cfg("iff_pool", ["2443", "2444", "2445"]) || []).slice(),
      fsPref: num(S().cfg("ip_fs_pref", 2), 2), fsMax: num(S().cfg("ip_fs_max", 3), 3),
      sofMax: num(S().cfg("sof_rsu_max_sorties", 1), 1),
      depth: num(S().cfg("lookahead_depth", 3), 3),
      idle: num(S().cfg("idle_threshold_workdays", 3), 3),
      massBrief: S().cfg("mass_briefing_default", "06:00"),
      mix: S().cfg("day_mix_default", {}) || {},
    };
  }
  const slotOK = (t, c) => { const m = ((t % 60) + 60) % 60; return m >= c.slotFrom && m <= c.slotTo; };
  /* nearest legal T/O at or after t — keeps the suggested times inside the
     HH:05–HH:35 window instead of proposing a violation. */
  function legalSlot(t, c) {
    let x = round5(t, c.round);
    for (let i = 0; i < 48; i++) {
      const h = Math.floor(x / 60), m = x - h * 60;
      if (m < c.slotFrom) { x = h * 60 + c.slotFrom; continue; }
      if (m > c.slotTo) { x = (h + 1) * 60 + c.slotFrom; continue; }
      return x;
    }
    return x;
  }

  /* ── sortie length from the flow chart ────────────────────────────────── */
  const FALLBACK_MIN = 70;                                   // 1:10, spec §5
  let GRP = null;
  function groupUids(gid) {
    if (!GRP) {
      GRP = new Map();
      for (const k of ["fs", "flights"]) for (const s of R().sections(k)) GRP.set(s.id, s.uids);
    }
    return GRP.get(gid) || [];
  }
  function missionMin(uid) {
    if (!uid) return FALLBACK_MIN;
    const n = R().node(uid);
    if (!n) return FALLBACK_MIN;
    if (n.hours != null) return round5(n.hours * 60, 5);
    const g = n.group ? R().node("g:" + n.group) : null;
    if (g) {
      if (g.hours_per_sortie != null) return round5(g.hours_per_sortie * 60, 5);
      if (g.hours_total != null) {
        const k = groupUids(n.group).length || 1;
        return round5((g.hours_total * 60) / k, 5);
      }
    }
    return FALLBACK_MIN;
  }
  const missionLabel = (uid) => { const d = uid ? R().describe(uid) : null; return d ? d.label : ""; };
  /* A line is on a free-text mission only when the user picked "Custom…" —
     an empty new line must not sprout a text box next to its dropdown. */
  const customText = (l) => (l && l.customOn ? String(l.custom || "").trim() : "");

  /* ── people ───────────────────────────────────────────────────────────── */
  const awayOf = (code, date) => { const st = S().availabilityOf(code, date); return st === "available" ? "" : st; };
  function dutyOf(date) {
    const r = S().find("dutyRoster", date) || {};
    return {
      SOF: r.SOF || "", RSU: r.RSU || "", ground_instructor: r.ground_instructor || "",
      alt_instructors: (r.alt_instructors || []).slice(),
    };
  }
  function setDuty(date, patch) {
    S().upsert("dutyRoster", Object.assign({ date: date }, dutyOf(date), patch));
  }
  function completion(code) {
    const st = R().state(code);
    let d = 0, t = 0, fd = 0, ft = 0;
    for (const u of R().nodes()) { t++; if (st[u] && st[u].status === "completed") d++; }
    for (const u of R().nodes("flights")) { ft++; if (st[u] && st[u].status === "completed") fd++; }
    return { done: d, total: t, fdone: fd, ftotal: ft };
  }

  /* ══════════════════════════════════════════════════════════════════════
     1 · ui state & the plan model
     ══════════════════════════════════════════════════════════════════════ */
  const ui = {
    date: "", plan: null, loadedFor: "", allIp: false, quiet: false, saveT: null,
    bal: { period: "week", anchor: "" },
    prog: { code: "", pending: null, q: "" },
    wired: false,
  };

  const newId = (tag) => S().uid(tag);
  const newWave = (name, kind) => ({ id: newId("wv"), kind: kind || "wave", name: name, brief: "", lines: [] });

  function blankPlan(date) {
    const c = CF();
    return {
      date: date, status: "draft", mass_briefing: c.massBrief,
      mix: Object.assign({}, c.mix),
      waves: [newWave("Wave 1", "wave"), newWave("Wave 2", "wave")],
      fs: [], lessons: [], alt_students: [], alt_instructors: [],
      actuals: {}, published_at: "", actualized_at: "",
    };
  }

  /* Stored plans are trusted but not assumed complete — a hand-edited or
     imported plan must never crash the board. */
  function hydrate(p, date) {
    const b = blankPlan(date);
    if (!p || typeof p !== "object") return b;
    const out = Object.assign(b, p);
    out.date = date;
    out.waves = Array.isArray(p.waves) && p.waves.length ? p.waves : b.waves;
    /* plans written before the explicit custom flag: a non-empty free text is
       what "custom mode" meant back then. */
    const fixCustom = (l) => {
      if (!l) return;
      if (!l.id) l.id = newId("ln");
      if (l.customOn == null) l.customOn = !!String(l.custom || "").trim();
      if (l.altCustomOn == null) l.altCustomOn = !!String(l.altCustom || "").trim();
    };
    out.waves.forEach((w) => {
      if (!w.id) w.id = newId("wv");
      if (!w.kind) w.kind = "wave";
      if (!Array.isArray(w.lines)) w.lines = [];
      w.lines.forEach(fixCustom);
    });
    ["fs", "lessons", "alt_students", "alt_instructors"].forEach((k) => {
      if (!Array.isArray(out[k])) out[k] = [];
      out[k].forEach(fixCustom);
    });
    if (!out.actuals || typeof out.actuals !== "object") out.actuals = {};
    if (!out.mix || typeof out.mix !== "object") out.mix = Object.assign({}, CF().mix);
    return out;
  }

  function ensurePlan() {
    if (!ui.date) ui.date = isoShift(today(), 1);              // default D+1
    if (ui.plan && ui.loadedFor === ui.date) return ui.plan;
    ui.plan = hydrate(S().dayPlan(ui.date), ui.date);
    ui.loadedFor = ui.date;
    return ui.plan;
  }

  /* Draft autosave: nothing typed is ever lost, and the store event it emits
     is swallowed (ui.quiet) so the board is not rebuilt under the caret. */
  function saveSoon() {
    clearTimeout(ui.saveT);
    ui.saveT = setTimeout(() => {
      if (!ui.plan) return;
      ui.quiet = true;
      S().putDayPlan(ui.plan.date, ui.plan);
      setTimeout(() => { ui.quiet = false; }, 0);
    }, 600);
  }
  function saveNow() {
    clearTimeout(ui.saveT);
    if (!ui.plan) return;
    ui.quiet = true;
    S().putDayPlan(ui.plan.date, ui.plan);
    setTimeout(() => { ui.quiet = false; }, 0);
  }

  const dayWaves = (plan) => plan.waves.filter((w) => w.kind === "wave");
  const firstWave = (plan) => plan.waves.find((w) => w.kind === "wave") || null;
  function findLine(plan, id) {
    for (const w of plan.waves) { const l = w.lines.find((x) => x.id === id); if (l) return { line: l, wave: w }; }
    return null;
  }
  const findFs = (plan, id) => plan.fs.find((x) => x.id === id) || null;

  function plannedByStudent(plan) {
    const m = new Map();
    const add = (sp, u) => {
      if (!sp || !u) return;
      let a = m.get(sp); if (!a) { a = []; m.set(sp, a); }
      if (a.indexOf(u) < 0) a.push(u);
    };
    for (const w of plan.waves) for (const l of w.lines) add(l.sp, l.node);
    for (const l of plan.fs) add(l.sp, l.node);
    for (const l of plan.lessons) {
      if (!l.node) continue;
      if (l.scope === "class" && l.class) S().membersOf(l.class).forEach((sp) => add(sp, l.node));
      else add(l.student, l.node);
    }
    return m;
  }

  /* the options offered to one line: everything already planned for that
     student EXCEPT this line's own mission unlocks the successors. */
  function optionsFor(sp, kind, planned, own, depth) {
    if (!sp) { const e = []; e.blocked = false; e.blockReason = null; return e; }
    const list = (planned.get(sp) || []).filter((u) => u !== own);
    return R().nextFor(sp, kind, { plannedUids: list, depth: depth });
  }

  /* ══════════════════════════════════════════════════════════════════════
     2 · analysis — times, ranking, warnings (spec §5 §6)
     ══════════════════════════════════════════════════════════════════════ */
  function analyze(plan) {
    const c = CF();
    const A = {
      c: c, duty: dutyOf(plan.date), planned: plannedByStudent(plan),
      t: new Map(), warn: new Map(), opts: new Map(), alt: new Map(),
      fsWarn: new Map(), fsOpts: new Map(), lsWarn: new Map(),
      ipSlots: new Map(), spSlots: new Map(), ipFs: new Map(),
      spWave1: new Set(), spFs1: new Set(), spDual: new Map(),
      hard: 0, soft: 0, mixActual: new Map(), onBoard: new Set(),
    };
    const pushSlot = (map, who, rec) => { if (!who) return; let a = map.get(who); if (!a) { a = []; map.set(who, a); } a.push(rec); };

    /* ── ① order the waves by T/O and lay the clock out ──────────────── */
    const firstIdx = plan.waves.findIndex((w) => w.kind === "wave");
    plan.waves.forEach((w, wi) => {
      w.lines.sort((a, b) => {
        const ta = hm2min(a.to), tb = hm2min(b.to);
        if (ta == null && tb == null) return 0;
        if (ta == null) return 1;
        if (tb == null) return -1;
        return ta - tb;
      });
      w.lines.forEach((l, li) => {
        const dur = missionMin(l.node);
        const to = hm2min(l.to);
        const deb = c.total - c.brief - c.ground - dur;
        const rec = {
          wi: wi, li: li, rank: li + 1, dur: dur, to: to, deb: deb,
          brief: to == null ? null : to - c.brief - c.ground,
          ldg: to == null ? null : to + dur,
          end: to == null ? null : to + dur + deb,
        };
        A.t.set(l.id, rec);
        pushSlot(A.ipSlots, l.ip, { id: l.id, wi: wi, rank: rec.rank, to: rec.to, ldg: rec.ldg });
        pushSlot(A.spSlots, l.sp, { id: l.id, wi: wi, rank: rec.rank, to: rec.to, ldg: rec.ldg });
        if (l.sp) {
          A.onBoard.add(l.sp);
          if (l.ip) A.spDual.set(l.sp, (A.spDual.get(l.sp) || 0) + 1);
          if (wi === firstIdx) A.spWave1.add(l.sp);
          const cl = S().classOf(l.sp) || "—";
          A.mixActual.set(cl, (A.mixActual.get(cl) || 0) + 1);
        }
      });
    });
    plan.fs.forEach((l, i) => {
      l.slot = i + 1;
      if (l.ip) A.ipFs.set(l.ip, (A.ipFs.get(l.ip) || 0) + 1);
      if (l.sp) { A.onBoard.add(l.sp); if (l.slot === 1) A.spFs1.add(l.sp); }
    });

    /* ── ② the mission dropdowns (they also feed the warnings) ───────── */
    for (const w of plan.waves) for (const l of w.lines) {
      A.opts.set(l.id, optionsFor(l.sp, "flights", A.planned, l.node, c.depth));
      const alt = optionsFor(l.sp, "flights", A.planned, null, c.depth + 1);
      A.alt.set(l.id, alt.filter((o) => o.uid !== l.node));
    }
    for (const l of plan.fs) A.fsOpts.set(l.id, optionsFor(l.sp, "fs", A.planned, l.node, c.depth));

    /* ── ③ warnings ──────────────────────────────────────────────────── */
    plan.waves.forEach((w, wi) => w.lines.forEach((l) => {
      const ws = flightWarnings(plan, w, wi, firstIdx, l, A);
      A.warn.set(l.id, ws);
      ws.forEach((x) => { if (x.sev === "hard") A.hard++; else A.soft++; });
    }));
    plan.fs.forEach((l) => {
      const ws = fsWarnings(plan, l, A);
      A.fsWarn.set(l.id, ws);
      ws.forEach((x) => { if (x.sev === "hard") A.hard++; else A.soft++; });
    });
    plan.lessons.forEach((l) => {
      const ws = lessonWarnings(plan, l, A);
      A.lsWarn.set(l.id, ws);
      ws.forEach((x) => { if (x.sev === "hard") A.hard++; else A.soft++; });
    });
    return A;
  }

  /* the mission the line actually carries, described */
  function missionInfo(l, opts, planned) {
    const out = { d: null, opt: null, warns: [] };
    if (l.customOn) { out.warns.push({ sev: "soft", text: "custom mission — outside the readiness engine" }); return out; }
    if (!l.node) return out;
    out.d = R().describe(l.node);
    out.opt = (opts || []).find((o) => o.uid === l.node) || null;
    return out;
  }

  function flightWarnings(plan, w, wi, firstIdx, l, A) {
    const c = A.c, t = A.t.get(l.id) || {}, out = [];
    const push = (sev, text) => out.push({ sev: sev, text: text });

    if (!l.sp) push("soft", "no student on this line");
    if (!l.ip) push("soft", "no instructor on this line");
    if (!l.node && !customText(l)) push("soft", "no mission on this line");

    if (l.sp && awayOf(l.sp, plan.date)) push("hard", l.sp + " is away (" + awayOf(l.sp, plan.date) + ")");
    if (l.ip && awayOf(l.ip, plan.date)) push("hard", l.ip + " is away (" + awayOf(l.ip, plan.date) + ")");

    /* gates — spec §3 / §6 */
    if (l.sp) {
      const blk = R().blockFor(l.sp, "flights");
      if (blk) push("hard", l.sp + " — " + blk.reason);
      const kepe = R().openGates(l.sp).find((g) => g.maxDualPerDay);
      const dual = A.spDual.get(l.sp) || 0;
      if (kepe && dual > kepe.maxDualPerDay) {
        push("hard", l.sp + " — " + kepe.label + ": " + kepe.maxDualPerDay + " dual sortie a day, " + dual + " on the board");
      }
    }

    /* clock */
    if (t.to == null) push("soft", "no T/O time");
    else {
      if (!slotOK(t.to, c)) {
        push("hard", "T/O " + min2hm(t.to) + " outside the HH:" + pad2(c.slotFrom) + "–HH:" + pad2(c.slotTo) + " slot window");
      }
      if (t.deb < c.minDeb) {
        push("hard", "debrief " + dur2hm(t.deb) + " under the " + c.minDeb + "′ minimum — a " + dur2hm(t.dur)
          + " sortie does not fit the " + dur2hm(c.total) + " line");
      }
    }

    /* instructor availability inside the day */
    const mine = A.ipSlots.get(l.ip) || [];
    for (const o of mine) {
      if (o.id === l.id) continue;
      if (o.wi === wi) { push("hard", l.ip + " already flies #" + o.rank + " of this wave"); continue; }
      if (t.to == null || o.ldg == null) continue;
      if (o.to < t.to && t.to - o.ldg < c.turn) {
        push("hard", l.ip + " turnaround " + dur2hm(t.to - o.ldg) + " after the " + min2hm(o.ldg)
          + " LDG — " + dur2hm(c.turn) + " required");
      }
    }
    for (const o of (A.spSlots.get(l.sp) || [])) {
      if (o.id !== l.id && o.wi === wi) push("hard", l.sp + " already flies #" + o.rank + " of this wave");
    }

    /* duty — SOF/RSU fly at most once, and after the duty */
    if (l.ip && (A.duty.SOF === l.ip || A.duty.RSU === l.ip)) {
      const role = A.duty.SOF === l.ip ? "SOF" : "RSU";
      if (mine.length > c.sofMax) push("hard", l.ip + " is on " + role + " duty — " + c.sofMax + " sortie max, " + mine.length + " on the board");
      if (wi === firstIdx) push("hard", l.ip + " is on " + role + " duty — the sortie comes after the duty, not in the first wave");
    }
    if (l.ip && A.duty.ground_instructor === l.ip) push("soft", l.ip + " is the ground instructor of the day");

    /* qualifications */
    const mi = missionInfo(l, A.opts.get(l.id), A.planned);
    mi.warns.forEach((x) => out.push(x));
    const ipRec = l.ip ? S().find("instructors", l.ip) : null;
    if (mi.d && ipRec) {
      const q = ipRec.quals || {};
      if (mi.d.checkride && !q.evaluator) push("hard", "checkride — " + l.ip + " is not an evaluator");
      if (mi.d.night && !q.night) push("hard", "night sortie — " + l.ip + " is not night qualified");
    }
    if (mi.d && mi.d.night && w.kind !== "night") push("soft", "night sortie planned in a day wave");
    if (mi.d && !mi.d.night && w.kind === "night") push("soft", "day sortie planned in the night wave");

    /* continuity of the primary / reserve instructor (soft, spec §6) */
    if (l.sp && l.ip) {
      const s = S().find("students", l.sp);
      const fam = [s && s.primary_ip].concat((s && s.reserve_ips) || []).filter(Boolean);
      if (fam.length && fam.indexOf(l.ip) < 0) push("soft", l.ip + " is neither primary nor reserve IP of " + l.sp + " (" + fam.join(" / ") + ")");
    }

    /* readiness */
    if (l.sp && mi.d) out.push.apply(out, readinessWarnings(l, mi, A));
    return out;
  }

  function readinessWarnings(l, mi, A) {
    const out = [];
    const opts = (l.kindHint === "fs" ? A.fsOpts.get(l.id) : A.opts.get(l.id)) || [];
    if (opts.blocked) return out;                          // the gate warning already said it
    if (!mi.opt) {
      const st = R().statusOf(l.sp, l.node);
      if (st === "completed") out.push({ sev: "soft", text: l.sp + " already completed " + mi.d.label });
      else out.push({ sev: "soft", text: "off-flow — " + mi.d.label + " is not among the next options of " + l.sp });
      return out;
    }
    if (mi.opt.makeup) out.push({ sev: "soft", text: "makeup — " + mi.d.label + " is owed (" + String(mi.opt.status).replace("_", " ") + ")" });
    const miss = mi.opt.missing || [];
    if (miss.length) {
      const planned = new Set(A.planned.get(l.sp) || []);
      const open = miss.filter((m) => !planned.has(m.uid));
      out.push(open.length
        ? { sev: "soft", text: "conditional — pending " + open.map((m) => m.label).join(" · ") + ", not on today's board" }
        : { sev: "soft", text: "conditional — its prerequisite (" + miss.map((m) => m.label).join(" · ") + ") is on today's board" });
    }
    return out;
  }

  function fsWarnings(plan, l, A) {
    const c = A.c, out = [];
    const push = (sev, text) => out.push({ sev: sev, text: text });
    if (!l.sp) push("soft", "no student on this F/S line");
    if (!l.ip) push("soft", "no instructor on this F/S line");
    if (!l.node && !customText(l)) push("soft", "no mission on this F/S line");
    if (!l.device) push("soft", "no device");

    if (l.sp && awayOf(l.sp, plan.date)) push("hard", l.sp + " is away (" + awayOf(l.sp, plan.date) + ")");
    if (l.ip && awayOf(l.ip, plan.date)) push("hard", l.ip + " is away (" + awayOf(l.ip, plan.date) + ")");
    if (l.sp) { const blk = R().blockFor(l.sp, "fs"); if (blk) push("hard", l.sp + " — " + blk.reason); }

    if (l.sp && l.slot === 1 && A.spWave1.has(l.sp)) {
      push("soft", l.sp + " has the first F/S slot AND the first flight wave");
    }
    if (l.ip) {
      const n = A.ipFs.get(l.ip) || 0;
      if (n > c.fsMax) push("hard", l.ip + " carries " + n + " F/S — over the maximum of " + c.fsMax);
      else if (n > c.fsPref) push("soft", l.ip + " carries " + n + " F/S — the preference is " + c.fsPref);
    }
    const mi = missionInfo(l, A.fsOpts.get(l.id), A.planned);
    mi.warns.forEach((x) => out.push(x));
    if (l.sp && mi.d) out.push.apply(out, readinessWarnings(Object.assign({ kindHint: "fs" }, l), mi, A));
    return out;
  }

  function lessonWarnings(plan, l, A) {
    const out = [];
    const push = (sev, text) => out.push({ sev: sev, text: text });
    if (!l.node) push("soft", "no lesson or exam picked");
    if (l.scope === "class" && !l.class) push("soft", "no class");
    if (l.scope === "student" && !l.student) push("soft", "no student");
    if (l.instructor && awayOf(l.instructor, plan.date)) push("hard", l.instructor + " is away (" + awayOf(l.instructor, plan.date) + ")");
    if (l.instructor && A.duty.ground_instructor && l.instructor !== A.duty.ground_instructor) {
      push("soft", "the ground instructor of the day is " + A.duty.ground_instructor);
    }
    return out;
  }

  /* ══════════════════════════════════════════════════════════════════════
     3 · board markup
     ══════════════════════════════════════════════════════════════════════ */
  function warnHtml(list) {
    if (!list || !list.length) return "";
    return `<div class="sch-lwarn">` + list.map((w) =>
      `<span class="sch-wc ${w.sev === "hard" ? "is-hard" : "is-soft"}">${esc(w.text)}</span>`).join("") + `</div>`;
  }

  function spOptions(sel, date, exclude) {
    const rows = students().filter((s) => (s.status || "active") !== "withdrawn").map((s) => {
      const idle = R().idleDays(s.code, date);
      const pend = R().pendingOtherKinds(s.code);
      const chips = R().KINDS.map((k) => pend[k] && pend[k].chip).filter(Boolean).join(" ");
      const away = awayOf(s.code, date);
      return {
        code: s.code, idle: idle == null ? 9999 : idle, away: away,
        text: s.code + " · " + (idle == null ? "never" : idle + "d")
          + (s.class ? " · " + s.class : "") + (chips ? " · " + chips : "") + (away ? " · " + away : ""),
      };
    });
    rows.sort((a, b) => (b.idle - a.idle) || a.code.localeCompare(b.code));
    return `<option value="">— SP —</option>` + rows
      .filter((r) => !r.away || r.code === sel || !exclude)
      .map((r) => `<option value="${esc(r.code)}"${r.code === sel ? " selected" : ""}>${esc(r.text)}</option>`).join("");
  }

  /* IP picker filtered per slot (spec §7): who is free, and who is not — with
     the reason spelled out instead of silently vanishing. */
  function ipOptions(sel, plan, A, ctx) {
    const c = A.c, ok = [], no = [];
    const wname = (wi) => (plan.waves[wi] ? plan.waves[wi].name : "wave " + (wi + 1));
    for (const i of instructors()) {
      const reasons = [];
      const away = awayOf(i.code, plan.date);
      if (away) reasons.push(away);
      const mine = (A.ipSlots.get(i.code) || []).filter((o) => o.id !== ctx.id);
      if (ctx.kind === "flight") {
        if (mine.some((o) => o.wi === ctx.wi)) reasons.push("already in " + wname(ctx.wi));
        if (ctx.to != null) {
          /* the same wave is already covered above — only the OTHER waves can
             lose the 2:00 turnaround, in either direction. */
          for (const o of mine) {
            if (o.wi === ctx.wi) continue;
            if (o.ldg != null && o.to < ctx.to && ctx.to - o.ldg < c.turn) reasons.push("turnaround " + dur2hm(ctx.to - o.ldg) + " after " + wname(o.wi));
            else if (o.to != null && o.to > ctx.to && o.to - (ctx.to + ctx.dur) < c.turn) reasons.push("turnaround before " + wname(o.wi));
          }
        }
        if ((A.duty.SOF === i.code || A.duty.RSU === i.code)) {
          const role = A.duty.SOF === i.code ? "SOF" : "RSU";
          if (ctx.wi === ctx.firstIdx) reasons.push(role + " duty");
          else if (mine.length >= c.sofMax) reasons.push(role + " duty — " + c.sofMax + " sortie used");
        }
        if (ctx.checkride && !((i.quals || {}).evaluator)) reasons.push("not an evaluator");
        if (ctx.night && !((i.quals || {}).night)) reasons.push("not night qualified");
      } else {
        /* the load this candidate would carry: their current F/S count, minus
           this very line when they are already on it. */
        const n = (A.ipFs.get(i.code) || 0) - (i.code === ctx.curIp ? 1 : 0);
        if (n >= c.fsMax) reasons.push("F/S load " + n);
      }
      const rec = { code: i.code, why: [...new Set(reasons)].join(" · ") };
      (reasons.length ? no : ok).push(rec);
    }
    const opt = (r, dim) => `<option value="${esc(r.code)}"${r.code === sel ? " selected" : ""}${dim ? ' class="cond"' : ""}>`
      + esc(r.code + (r.why ? " — " + r.why : "")) + `</option>`;
    let html = `<option value="">— IP —</option>` + ok.map((r) => opt(r, false)).join("");
    if (no.length && (ui.allIp || no.some((r) => r.code === sel))) {
      html += `<optgroup label="not eligible for this slot">` + no.map((r) => opt(r, true)).join("") + `</optgroup>`;
    } else if (no.length) {
      html += `<optgroup label="${esc(no.length + " filtered out — tick “all IPs”")}"></optgroup>`;
    }
    return html;
  }

  function missionOptions(sel, customOn, opts) {
    const parts = [`<option value=""${!sel && !customOn ? " selected" : ""}>— mission —</option>`];
    const seen = new Set();
    for (const o of opts || []) {
      seen.add(o.uid);
      const tag = (o.makeup ? "↺ " : "") + (o.conditional ? "~ " : "")
        + o.label + (o.name ? " — " + o.name : "")
        + (o.checkride ? " ◆" : "") + (o.first_solo ? " ★" : (o.solo_candidate ? " ☆" : "")) + (o.night ? " ☾" : "");
      parts.push(`<option value="${esc(o.uid)}"${o.uid === sel ? " selected" : ""}${o.conditional ? ' class="cond"' : ""}`
        + ` title="${esc(o.pendingReason || "ready")}">${esc(tag)}</option>`);
    }
    if (sel && !seen.has(sel)) {
      const d = R().describe(sel);
      parts.push(`<optgroup label="kept from the plan"><option value="${esc(sel)}" selected>`
        + esc((d ? d.label + " — " + d.name : sel)) + `</option></optgroup>`);
    }
    parts.push(`<option value="__custom__"${customOn ? " selected" : ""}>Custom…</option>`);
    return parts.join("");
  }

  function setupBar(plan, A) {
    const c = A.c, locked = plan.status !== "draft";
    const dis = locked ? " disabled" : "";
    const cls = S().classList();
    return `<section class="panel sch-panel sch-setup">
      <div class="sch-h">
        <h2>Flight schedule</h2>
        <span class="sch-badge sch-st-${esc(plan.status)}">${esc(plan.status)}</span>
        <span class="sch-hint">${A.hard ? `<b class="sch-hard">${A.hard} hard</b> · ` : ""}${A.soft} soft warnings</span>
        <span class="sch-spacer"></span>
        ${locked
        ? `<button type="button" class="sch-btn" data-b="reopen">↩ Reopen as draft</button>
           <button type="button" class="sch-btn" data-b="print">🖨 Print view</button>`
        : `<button type="button" class="sch-btn primary" data-b="publish">✔ Publish</button>
           <button type="button" class="sch-btn" data-b="print">🖨 Print view</button>`}
        <button type="button" class="sch-btn danger" data-b="clear">Clear day</button>
      </div>
      <div class="sch-fgrid">
        <label class="sch-fld"><span>Date</span>
          <input type="date" class="sch-in" data-b="date" data-fk="date" value="${esc(plan.date)}"></label>
        <span class="sch-daynav">
          <button type="button" class="sch-mini" data-b="day-1" title="previous day">‹</button>
          <button type="button" class="sch-mini" data-b="day-today" title="today">D</button>
          <button type="button" class="sch-mini" data-b="day+1" title="next day">›</button>
        </span>
        <label class="sch-fld"><span>Mass briefing</span>
          <input type="time" step="300" class="sch-in" data-b="mass" data-fk="mass" value="${esc(plan.mass_briefing)}"${dis}></label>
        <span class="sch-fld"><span>Line</span>
          <span class="sch-mono sch-hint">brief ${c.brief}′ + ground ops ${c.ground}′ + sortie + debrief = ${dur2hm(c.total)}</span></span>
        <span class="sch-fld"><span>Day mix — target / on board</span>
          <span class="sch-mixrow">${cls.map((k) => {
            const act = A.mixActual.get(k.id) || 0;
            const tgt = num(plan.mix[k.id], 0);
            const cl = tgt && act < tgt ? " is-under" : (tgt && act > tgt ? " is-over" : "");
            return `<span class="sch-mixcell${cl}"><b>${esc(k.id)}</b>
              <input type="number" min="0" class="sch-in sch-num" data-mix="${esc(k.id)}" data-fk="mix-${esc(k.id)}" value="${esc(String(tgt))}"${dis}>
              <span class="sch-mono">/ ${act}</span></span>`;
          }).join("")}</span></span>
        <label class="sch-fld sch-chk"><input type="checkbox" data-b="allip"${ui.allIp ? " checked" : ""}> <span>all IPs</span></label>
      </div>
      <div class="sch-addrow">
        <button type="button" class="sch-btn" data-b="add-line"${dis}>+ Wave line</button>
        <button type="button" class="sch-btn" data-b="add-fs"${dis}>+ F/S line</button>
        <button type="button" class="sch-btn" data-b="add-night"${dis}>+ Night</button>
        <button type="button" class="sch-btn" data-b="add-lesson"${dis}>+ Lessons block</button>
        <button type="button" class="sch-btn" data-b="add-wave"${dis}>+ Wave</button>
      </div>
    </section>`;
  }

  function dutiesPanel(plan) {
    const d = dutyOf(plan.date);
    const locked = plan.status !== "draft";
    const dis = locked ? " disabled" : "";
    const sel = (role, cur, filter) => {
      const list = instructors().filter(filter || (() => true));
      return `<select class="sch-in" data-duty="${esc(role)}" data-fk="duty-${esc(role)}"${dis}>
        <option value="">—</option>${list.map((i) => `<option value="${esc(i.code)}"${i.code === cur ? " selected" : ""}>`
        + esc(i.code + (awayOf(i.code, plan.date) ? " — " + awayOf(i.code, plan.date) : "")) + `</option>`).join("")}</select>`;
    };
    const mark = (code) => {
      const st = S().availabilityOf(code, plan.date);
      return `<button type="button" class="sch-av av-${esc(st)}" data-away="${esc(code)}" title="${esc(code + " — " + st)} · click to cycle"${dis}>
        <span class="sch-code">${esc(code)}</span><span class="sch-avst">${esc(st === "available" ? "OK" : st)}</span></button>`;
    };
    const away = students().concat(instructors()).filter((p) => awayOf(p.code, plan.date));
    return `<section class="panel sch-panel">
      <div class="sch-h"><h2>Duties &amp; absences</h2>
        <span class="sch-hint">${away.length} away on ${esc(plan.date)}</span></div>
      <div class="sch-fgrid">
        <label class="sch-fld"><span>SOF</span>${sel("SOF", d.SOF, (i) => (i.duty_eligible || {}).SOF)}</label>
        <label class="sch-fld"><span>RSU</span>${sel("RSU", d.RSU, (i) => (i.duty_eligible || {}).RSU)}</label>
        <label class="sch-fld"><span>Ground instructor</span>${sel("ground_instructor", d.ground_instructor, (i) => (i.quals || {}).ground)}</label>
      </div>
      <div class="sch-avgroup"><span class="sch-lbl">Students — one click cycles ${AV_CYCLE.join(" → ")}</span>
        <div class="sch-avrow">${students().map((s) => mark(s.code)).join("")}</div></div>
      <div class="sch-avgroup"><span class="sch-lbl">Instructors</span>
        <div class="sch-avrow">${instructors().map((i) => mark(i.code)).join("")}</div></div>
    </section>`;
  }

  function flightLineHtml(plan, w, wi, firstIdx, l, A) {
    const t = A.t.get(l.id) || {}, c = A.c;
    const locked = plan.status !== "draft";
    const dis = locked ? " disabled" : "";
    const opts = A.opts.get(l.id) || [];
    const alts = A.alt.get(l.id) || [];
    const mi = missionInfo(l, opts, A.planned);
    const ipCtx = {
      id: l.id, kind: "flight", wi: wi, firstIdx: firstIdx, to: t.to, dur: t.dur,
      checkride: !!(mi.d && mi.d.checkride), night: !!(mi.d && mi.d.night),
    };
    const debBad = t.deb != null && t.deb < c.minDeb;
    const toBad = t.to != null && !slotOK(t.to, c);
    return `<div class="sch-line${locked ? " is-locked" : ""}" data-l="${esc(l.id)}" data-blk="w">
      ${warnHtml(A.warn.get(l.id))}
      <div class="sch-lrow">
        <span class="sch-rank" title="ranked by T/O inside the wave">#${t.rank || "?"}</span>
        <label class="sch-lf w-sp"><span>SP</span>
          <select class="sch-in" data-lf="sp" data-fk="sp-${esc(l.id)}"${dis}>${spOptions(l.sp, plan.date, false)}</select></label>
        <label class="sch-lf w-ms"><span>Main mission${opts.blocked ? ` <em class="sch-hard">blocked</em>` : ""}</span>
          <select class="sch-in" data-lf="node" data-fk="node-${esc(l.id)}"${dis}>${missionOptions(l.node, l.customOn, opts)}</select></label>
        ${l.customOn
        ? `<label class="sch-lf w-cs"><span>Custom</span>
             <input class="sch-in" data-lf="custom" data-fk="custom-${esc(l.id)}" value="${esc(l.custom || "")}" placeholder="free-text mission"${dis}></label>` : ""}
        <label class="sch-lf w-ms"><span>Alt mission</span>
          <select class="sch-in" data-lf="alt" data-fk="alt-${esc(l.id)}"${dis}>${missionOptions(l.alt, l.altCustomOn, alts)}</select></label>
        ${l.altCustomOn
        ? `<label class="sch-lf w-cs"><span>Alt custom</span>
             <input class="sch-in" data-lf="altCustom" data-fk="altc-${esc(l.id)}" value="${esc(l.altCustom || "")}"${dis}></label>` : ""}
        <label class="sch-lf w-ip"><span>IP</span>
          <select class="sch-in" data-lf="ip" data-fk="ip-${esc(l.id)}"${dis}>${ipOptions(l.ip, plan, A, ipCtx)}</select></label>
        <label class="sch-lf w-cl"><span>Callsign</span>
          <input class="sch-in" data-lf="callsign" data-fk="cs-${esc(l.id)}" value="${esc(l.callsign || "")}" placeholder="e.g. PA1"${dis}></label>
        <label class="sch-lf w-to"><span>T/O</span>
          <input type="time" step="300" class="sch-in${toBad ? " is-bad" : ""}" data-lf="to" data-fk="to-${esc(l.id)}" value="${esc(l.to || "")}"${dis}></label>
        <span class="sch-lf w-tm"><span>brief · LDG · debrief</span>
          <span class="sch-ltimes sch-mono">${timesHtml(t, c)}</span></span>
        <label class="sch-lf w-if"><span>IFF</span>
          <input class="sch-in" data-lf="iff" data-fk="iff-${esc(l.id)}" value="${esc(l.iff || "")}"${dis}></label>
        <label class="sch-lf grow"><span>Remarks</span>
          <input class="sch-in" data-lf="remarks" data-fk="rm-${esc(l.id)}" value="${esc(l.remarks || "")}"${dis}></label>
        <span class="sch-lact">
          <button type="button" class="sch-mini" data-lb="dup" title="duplicate"${dis}>⧉</button>
          <button type="button" class="sch-mini danger" data-lb="del" title="remove the line"${dis}>✕</button></span>
      </div>
      ${mi.opt && mi.opt.pendingReason ? `<p class="sch-cond">${esc(mi.opt.pendingReason)}</p>` : ""}
      ${opts.blocked ? `<p class="sch-cond is-hard">${esc(opts.blockReason || "")}</p>` : ""}
    </div>`;
  }

  function timesHtml(t, c) {
    if (t.to == null) return `sortie ${dur2hm(t.dur)} · debrief ${dur2hm(t.deb)}`;
    const bad = t.deb < c.minDeb ? " sch-hard" : "";
    return `${min2hm(t.brief)} → T/O ${min2hm(t.to)} → LDG ${min2hm(t.ldg)}`
      + ` <span class="${bad}">dbrf ${dur2hm(t.deb)}</span> → ${min2hm(t.end)} · ${dur2hm(c.total)}`;
  }

  function wavesHtml(plan, A) {
    const firstIdx = plan.waves.findIndex((w) => w.kind === "wave");
    const locked = plan.status !== "draft";
    const dis = locked ? " disabled" : "";
    return plan.waves.map((w, wi) => `<section class="panel sch-panel sch-wave${w.kind === "night" ? " is-night" : ""}" data-w="${esc(w.id)}">
      <div class="sch-h">
        <h2>${esc(w.name)}${w.kind === "night" ? " ☾" : ""} <span class="count">${w.lines.length} line${w.lines.length === 1 ? "" : "s"}</span></h2>
        ${w.kind === "night" ? `<label class="sch-fld"><span>Night briefing</span>
          <input type="time" step="300" class="sch-in" data-wf="brief" data-fk="wb-${esc(w.id)}" value="${esc(w.brief || "")}"${dis}></label>` : ""}
        <span class="sch-spacer"></span>
        <button type="button" class="sch-btn" data-wb="add"${dis}>+ line</button>
        ${plan.waves.length > 1 ? `<button type="button" class="sch-mini danger" data-wb="del" title="remove the wave"${dis}>✕</button>` : ""}
      </div>
      ${w.lines.length
      ? w.lines.map((l) => flightLineHtml(plan, w, wi, firstIdx, l, A)).join("")
      : `<p class="sch-hint">No line yet — “+ line” adds one, or click a student in “Not scheduled today”.</p>`}
    </section>`).join("");
  }

  function fsHtml(plan, A) {
    const locked = plan.status !== "draft";
    const dis = locked ? " disabled" : "";
    const rows = plan.fs.map((l, i) => {
      const opts = A.fsOpts.get(l.id) || [];
      const mi = missionInfo(l, opts, A.planned);
      return `<div class="sch-line${locked ? " is-locked" : ""}" data-l="${esc(l.id)}" data-blk="fs">
        ${warnHtml(A.fsWarn.get(l.id))}
        <div class="sch-lrow">
          <span class="sch-rank" title="F/S slot order">S${l.slot}</span>
          <label class="sch-lf w-sp"><span>SP</span>
            <select class="sch-in" data-lf="sp" data-fk="fsp-${esc(l.id)}"${dis}>${spOptions(l.sp, plan.date, false)}</select></label>
          <label class="sch-lf w-ms"><span>Mission${opts.blocked ? ` <em class="sch-hard">blocked</em>` : ""}</span>
            <select class="sch-in" data-lf="node" data-fk="fnode-${esc(l.id)}"${dis}>${missionOptions(l.node, l.customOn, opts)}</select></label>
          ${l.customOn
          ? `<label class="sch-lf w-cs"><span>Custom</span>
               <input class="sch-in" data-lf="custom" data-fk="fcu-${esc(l.id)}" value="${esc(l.custom || "")}"${dis}></label>` : ""}
          <label class="sch-lf w-ip"><span>IP</span>
            <select class="sch-in" data-lf="ip" data-fk="fip-${esc(l.id)}"${dis}>${ipOptions(l.ip, plan, A, { id: l.id, kind: "fs", curIp: l.ip })}</select></label>
          <label class="sch-lf w-dv"><span>Device</span>
            <select class="sch-in" data-lf="device" data-fk="fdv-${esc(l.id)}"${dis}>
              ${FS_DEVICES.map((d) => `<option value="${esc(d)}"${l.device === d ? " selected" : ""}>${esc(d)}</option>`).join("")}</select></label>
          <label class="sch-lf grow"><span>Remarks</span>
            <input class="sch-in" data-lf="remarks" data-fk="frm-${esc(l.id)}" value="${esc(l.remarks || "")}"${dis}></label>
          <span class="sch-lact">
            <button type="button" class="sch-mini" data-lb="up" title="earlier slot"${dis || (i === 0 ? " disabled" : "")}>↑</button>
            <button type="button" class="sch-mini" data-lb="down" title="later slot"${dis || (i === plan.fs.length - 1 ? " disabled" : "")}>↓</button>
            <button type="button" class="sch-mini danger" data-lb="del" title="remove"${dis}>✕</button></span>
        </div>
        ${mi.opt && mi.opt.pendingReason ? `<p class="sch-cond">${esc(mi.opt.pendingReason)}</p>` : ""}
        ${opts.blocked ? `<p class="sch-cond is-hard">${esc(opts.blockReason || "")}</p>` : ""}
      </div>`;
    }).join("");
    const load = [...A.ipFs.entries()].sort((a, b) => b[1] - a[1])
      .map(([ip, n]) => `<span class="sch-chip${n > A.c.fsMax ? " is-hard" : (n > A.c.fsPref ? " is-soft" : "")}">${esc(ip)} ×${n}</span>`).join("");
    return `<section class="panel sch-panel sch-fsblock">
      <div class="sch-h"><h2>F/S <span class="count">no clock — slot order and device</span></h2>
        <span class="sch-hint">${load || "no F/S load"}</span>
        <span class="sch-spacer"></span>
        <button type="button" class="sch-btn" data-b="add-fs"${dis}>+ F/S line</button></div>
      ${rows || `<p class="sch-hint">No simulator line today.</p>`}
    </section>`;
  }

  function lessonsHtml(plan, A) {
    const locked = plan.status !== "draft";
    const dis = locked ? " disabled" : "";
    if (!plan.lessons.length) return "";
    const nodeOpts = (sel) => {
      const parts = [`<option value="">— lesson / exam —</option>`];
      for (const k of ["lessons", "exams"]) {
        const list = R().nodes(k);
        parts.push(`<optgroup label="${esc(R().KIND_LABEL[k])}">` + list.map((u) => {
          const d = R().describe(u);
          return `<option value="${esc(u)}"${u === sel ? " selected" : ""}>${esc(d.label + " — " + d.name)}</option>`;
        }).join("") + `</optgroup>`);
      }
      return parts.join("");
    };
    const rows = plan.lessons.map((l) => `<div class="sch-line${locked ? " is-locked" : ""}" data-l="${esc(l.id)}" data-blk="ls">
      ${warnHtml(A.lsWarn.get(l.id))}
      <div class="sch-lrow">
        <span class="sch-rank">L</span>
        <label class="sch-lf w-ls"><span>Lesson / exam</span>
          <select class="sch-in" data-lf="node" data-fk="lnode-${esc(l.id)}"${dis}>${nodeOpts(l.node)}</select></label>
        <label class="sch-lf w-sp"><span>Scope</span>
          <select class="sch-in" data-lf="scope" data-fk="lsc-${esc(l.id)}"${dis}>
            <option value="class"${l.scope === "class" ? " selected" : ""}>Class</option>
            <option value="student"${l.scope === "student" ? " selected" : ""}>Student</option></select></label>
        ${l.scope === "student"
        ? `<label class="sch-lf w-sp"><span>Student</span>
             <select class="sch-in" data-lf="student" data-fk="lst-${esc(l.id)}"${dis}>${spOptions(l.student, plan.date, false)}</select></label>`
        : `<label class="sch-lf w-sp"><span>Class</span>
             <select class="sch-in" data-lf="class" data-fk="lcl-${esc(l.id)}"${dis}><option value="">—</option>
               ${S().classList().map((c) => `<option value="${esc(c.id)}"${l.class === c.id ? " selected" : ""}>${esc(c.id)} (${c.members.length})</option>`).join("")}</select></label>`}
        <label class="sch-lf w-ip"><span>Instructor</span>
          <select class="sch-in" data-lf="instructor" data-fk="lip-${esc(l.id)}"${dis}><option value="">—</option>
            ${instructors().map((i) => `<option value="${esc(i.code)}"${l.instructor === i.code ? " selected" : ""}>${esc(i.code)}</option>`).join("")}</select></label>
        <label class="sch-lf w-cl"><span>Time</span>
          <input class="sch-in" data-lf="time" data-fk="ltm-${esc(l.id)}" value="${esc(l.time || "")}" placeholder="08:00–10:00"${dis}></label>
        <label class="sch-lf grow"><span>Note</span>
          <input class="sch-in" data-lf="note" data-fk="lnt-${esc(l.id)}" value="${esc(l.note || "")}"${dis}></label>
        <span class="sch-lact"><button type="button" class="sch-mini danger" data-lb="del" title="remove"${dis}>✕</button></span>
      </div>
    </div>`).join("");
    return `<section class="panel sch-panel">
      <div class="sch-h"><h2>Lessons &amp; exams <span class="count">${plan.lessons.length}</span></h2>
        <span class="sch-spacer"></span>
        <button type="button" class="sch-btn" data-b="add-lesson"${dis}>+ block</button></div>
      ${rows}
    </section>`;
  }

  function notScheduledHtml(plan, A) {
    const c = A.c;
    const locked = plan.status !== "draft";
    const rows = students()
      .filter((s) => (s.status || "active") === "active")
      .filter((s) => !A.onBoard.has(s.code))
      .filter((s) => !awayOf(s.code, plan.date))
      .map((s) => {
        const idle = R().idleDays(s.code, plan.date);
        const pend = R().pendingOtherKinds(s.code);
        const chips = R().KINDS.map((k) => pend[k] && pend[k].chip ? `<span class="sch-chip k-${k}" title="${esc(pend[k].title || "")}">${esc(pend[k].chip)}</span>` : "").join("");
        return { code: s.code, cls: s.class || "—", idle: idle == null ? 9999 : idle, raw: idle, chips: chips };
      })
      .sort((a, b) => (b.idle - a.idle) || a.code.localeCompare(b.code));
    const cells = rows.map((r) => {
      const hot = r.raw == null || r.raw > c.idle * 2 ? " is-hard" : (r.raw > c.idle ? " is-soft" : "");
      return `<button type="button" class="sch-nsc${hot}" data-add-sp="${esc(r.code)}"${locked ? " disabled" : ""}
        title="add a wave line for ${esc(r.code)}">
        <span class="sch-code">${esc(r.code)}</span>
        <span class="sch-nd">${r.raw == null ? "never" : r.raw + "d"}</span>
        <span class="sch-note">${esc(r.cls)}</span>${r.chips}</button>`;
    }).join("");
    return `<section class="panel sch-panel">
      <div class="sch-h"><h2>Not scheduled today <span class="count">${rows.length}</span></h2>
        <span class="sch-hint">idle working days · amber over ${c.idle} · click to add a line</span></div>
      <div class="sch-nsgrid">${cells || `<p class="sch-hint">Everyone available is on the board.</p>`}</div>
    </section>`;
  }

  function alternatesHtml(plan, A) {
    const locked = plan.status !== "draft";
    const dis = locked ? " disabled" : "";
    const sRows = plan.alt_students.map((a) => `<div class="sch-altrow" data-l="${esc(a.id)}" data-blk="as">
      <select class="sch-in" data-lf="sp" data-fk="asp-${esc(a.id)}"${dis}>${spOptions(a.sp, plan.date, false)}</select>
      <select class="sch-in" data-lf="node" data-fk="asn-${esc(a.id)}"${dis}>${missionOptions(a.node, a.customOn,
        optionsFor(a.sp, "flights", A.planned, a.node, A.c.depth))}</select>
      ${a.customOn ? `<input class="sch-in" data-lf="custom" data-fk="asc-${esc(a.id)}" value="${esc(a.custom)}"${dis}>` : ""}
      <input class="sch-in" data-lf="note" data-fk="asnt-${esc(a.id)}" value="${esc(a.note || "")}" placeholder="note"${dis}>
      <button type="button" class="sch-mini danger" data-lb="del"${dis}>✕</button></div>`).join("");
    const iRows = plan.alt_instructors.map((a) => `<div class="sch-altrow" data-l="${esc(a.id)}" data-blk="ai">
      <select class="sch-in" data-lf="ip" data-fk="aip-${esc(a.id)}"${dis}><option value="">—</option>
        ${instructors().map((i) => `<option value="${esc(i.code)}"${a.ip === i.code ? " selected" : ""}>${esc(i.code)}</option>`).join("")}</select>
      <input class="sch-in" data-lf="note" data-fk="aint-${esc(a.id)}" value="${esc(a.note || "")}" placeholder="note"${dis}>
      <button type="button" class="sch-mini danger" data-lb="del"${dis}>✕</button></div>`).join("");
    return `<section class="panel sch-panel">
      <div class="sch-h"><h2>Alternates</h2></div>
      <div class="sch-grid2">
        <div><div class="sch-h"><span class="sch-lbl">Students (+ sortie)</span>
            <button type="button" class="sch-mini" data-b="add-alt-s"${dis}>+</button></div>
          ${sRows || `<p class="sch-hint">None.</p>`}</div>
        <div><div class="sch-h"><span class="sch-lbl">Instructors</span>
            <button type="button" class="sch-mini" data-b="add-alt-i"${dis}>+</button></div>
          ${iRows || `<p class="sch-hint">None.</p>`}</div>
      </div>
    </section>`;
  }

  function summaryHtml(plan, A) {
    const away = students().concat(instructors())
      .map((p) => ({ code: p.code, st: awayOf(p.code, plan.date) })).filter((x) => x.st);
    const sAvail = students().filter((s) => (s.status || "active") === "active" && !awayOf(s.code, plan.date)).length;
    const iAvail = instructors().filter((i) => !awayOf(i.code, plan.date)).length;
    const sorties = plan.waves.reduce((n, w) => n + w.lines.length, 0);
    const rows = S().classList().map((k) => {
      let d = 0, t = 0, fd = 0, ft = 0;
      for (const m of k.members) { const c = completion(m); d += c.done; t += c.total; fd += c.fdone; ft += c.ftotal; }
      const pc = t ? Math.round((d / t) * 100) : 0;
      const pf = ft ? Math.round((fd / ft) * 100) : 0;
      return `<tr><td class="sch-code">${esc(k.id)}</td><td class="sch-mono">${k.members.length}</td>
        <td class="sch-mono">${A.mixActual.get(k.id) || 0} / ${esc(String(num(plan.mix[k.id], 0)))}</td>
        <td class="sch-mono">${fd}/${ft} · ${pf}%</td><td class="sch-mono">${pc}%</td></tr>`;
    }).join("");
    return `<section class="panel sch-panel">
      <div class="sch-h"><h2>Manning · absences · completion</h2></div>
      <div class="sch-fgrid">
        <span class="sch-kpi"><b>${sorties}</b><span>sorties</span></span>
        <span class="sch-kpi"><b>${plan.fs.length}</b><span>F/S</span></span>
        <span class="sch-kpi"><b>${A.onBoard.size}</b><span>SP on board</span></span>
        <span class="sch-kpi"><b>${sAvail}</b><span>SP available</span></span>
        <span class="sch-kpi"><b>${iAvail}/${instructors().length}</b><span>IP available</span></span>
        <span class="sch-kpi${A.hard ? " is-hard" : ""}"><b>${A.hard}</b><span>hard warnings</span></span>
      </div>
      <p class="sch-hint">Away: ${away.length ? away.map((a) => esc(a.code + " (" + a.st + ")")).join(" · ") : "nobody"}</p>
      <table class="sch-tbl"><thead><tr><th>Class</th><th>SP</th><th>Mix on board / target</th><th>Flights completed</th><th>Overall</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="5" class="sch-hint">No class.</td></tr>`}</tbody></table>
    </section>`;
  }

  /* ══════════════════════════════════════════════════════════════════════
     4 · actualize (spec §9)
     ══════════════════════════════════════════════════════════════════════ */
  const canActualize = (plan) => plan.status !== "draft" && plan.date <= today();
  const evIdOf = (plan, lineId) => "plan:" + plan.date + ":" + lineId;

  function allSchedLines(plan) {
    const out = [];
    plan.waves.forEach((w, wi) => w.lines.forEach((l) => out.push({ blk: "w", wave: w, wi: wi, l: l, kind: "flights", device: "T-6A" })));
    plan.fs.forEach((l) => out.push({ blk: "fs", wave: null, wi: -1, l: l, kind: "fs", device: l.device || "OFT" }));
    return out;
  }

  function actualizeHtml(plan, A) {
    const rows = allSchedLines(plan).map((x) => {
      const a = plan.actuals[x.l.id] || {};
      const node = a.node || x.l.node;
      const d = node ? R().describe(node) : null;
      const kindNodes = R().nodes(x.kind);
      return `<div class="sch-actrow" data-act-l="${esc(x.l.id)}">
        <span class="sch-rank">${x.blk === "fs" ? "S" + x.l.slot : "#" + ((A.t.get(x.l.id) || {}).rank || "?")}</span>
        <span class="sch-mono">${esc(x.blk === "fs" ? "F/S" : x.wave.name)}</span>
        <span class="sch-code">${esc(x.l.sp || "—")}</span>
        <span class="sch-note">${esc(d ? d.label : (customText(x.l) || "—"))}</span>
        <span class="sch-mono">${esc(x.l.ip || "—")}</span>
        <span class="sch-actbtns">
          <button type="button" class="sch-mini${a.state === "done" ? " is-on good" : ""}" data-ab="done" title="flown as planned">✓</button>
          <button type="button" class="sch-mini${a.state === "cancelled" ? " is-on danger" : ""}" data-ab="cancelled" title="cancelled">✗</button>
          <button type="button" class="sch-mini${a.state === "changed" ? " is-on warn" : ""}" data-ab="changed" title="flown, but another mission">~</button>
        </span>
        ${a.state === "cancelled" ? `<input class="sch-in grow" data-ab-f="reason" data-fk="acr-${esc(x.l.id)}" value="${esc(a.reason || "")}" placeholder="reason">` : ""}
        ${a.state === "changed" ? `<select class="sch-in grow" data-ab-f="node" data-fk="acn-${esc(x.l.id)}">
          <option value="">— what was actually flown —</option>
          ${kindNodes.map((u) => { const dd = R().describe(u); return `<option value="${esc(u)}"${a.node === u ? " selected" : ""}>${esc(dd.label + " — " + dd.name)}</option>`; }).join("")}
        </select>` : ""}
        ${a.eventId && S().find("trainingLog", a.eventId) ? `<span class="sch-badge good" title="${esc(a.eventId)}">logged</span>` : ""}
      </div>`;
    }).join("");
    const n = Object.values(plan.actuals).filter((a) => a && (a.state === "done" || a.state === "changed")).length;
    return `<section class="panel sch-panel sch-actualize">
      <div class="sch-h"><h2>Actualize <span class="count">${esc(plan.date)}</span></h2>
        <span class="sch-hint">✓ and ~ become training-log events — re-running never duplicates them</span>
        <span class="sch-spacer"></span>
        <button type="button" class="sch-btn primary" data-b="commit-actual">Write ${n} event${n === 1 ? "" : "s"} to the log</button>
      </div>
      ${rows || `<p class="sch-hint">No line to actualize.</p>`}
    </section>`;
  }

  /* Deterministic ids ("plan:<date>:<lineId>") make the write idempotent: a
     second run upserts the very same record instead of adding a twin, and a
     line flipped back to ✗ removes the event it once created.              */
  function commitActuals(plan) {
    let added = 0, updated = 0, removed = 0;
    for (const x of allSchedLines(plan)) {
      const a = plan.actuals[x.l.id];
      const id = evIdOf(plan, x.l.id);
      const existing = S().find("trainingLog", id);
      if (!a || a.state === "cancelled" || !a.state) {
        if (existing) { S().remove("trainingLog", id); removed++; }
        if (a) delete a.eventId;
        continue;
      }
      const node = a.state === "changed" ? (a.node || "") : x.l.node;
      if (!node || !x.l.sp) continue;
      const rec = {
        id: id, node: node, kind: R().kindOf(node) || x.kind, scope: "student",
        student: x.l.sp, class: "", date: plan.date,
        instructor: x.l.ip || "", device: x.blk === "fs" ? (x.l.device || "OFT") : "T-6A",
        result: "completed", score: null,
        note: (a.state === "changed" ? "actualized (changed from " + (missionLabel(x.l.node) || "—") + ")" : "actualized from the day plan")
          + (x.l.remarks ? " · " + x.l.remarks : ""),
        absent: [], start_date: "", end_date: "",
      };
      if (existing) updated++; else added++;
      a.eventId = id;
      S().upsert("trainingLog", rec);
    }
    plan.status = "actualized";
    plan.actualized_at = new Date().toISOString();
    saveNow();
    S().toast(added + " added · " + updated + " updated · " + removed + " withdrawn.", "good");
  }

  /* ══════════════════════════════════════════════════════════════════════
     5 · print view (spec §9 — the squadron form, monochrome)
     ══════════════════════════════════════════════════════════════════════ */
  function printView(plan, A) {
    const d = A.duty;
    const head = (t) => `<h3 class="pv-h">${esc(t)}</h3>`;
    const waveTable = (w, wi) => {
      if (!w.lines.length) return "";
      return head(w.name + (w.kind === "night" ? " — night" + (w.brief ? ", briefing " + w.brief : "") : ""))
        + `<table class="pv-t"><thead><tr><th>#</th><th>CALLSIGN</th><th>IP</th><th>SP</th><th>MISSION</th><th>ALT</th>
        <th>BRIEF</th><th>T/O</th><th>LDG</th><th>DBRF</th><th>IFF</th><th>REMARKS</th></tr></thead><tbody>`
        + w.lines.map((l) => {
          const t = A.t.get(l.id) || {};
          return `<tr><td>${t.rank || ""}</td><td>${esc(l.callsign || "")}</td><td>${esc(l.ip || "")}</td>
            <td>${esc(l.sp || "")}</td>
            <td>${esc(customText(l) || missionLabel(l.node))}</td>
            <td>${esc((l.altCustomOn ? String(l.altCustom || "").trim() : "") || missionLabel(l.alt))}</td>
            <td>${esc(min2hm(t.brief))}</td><td>${esc(min2hm(t.to))}</td><td>${esc(min2hm(t.ldg))}</td>
            <td>${esc(dur2hm(t.deb))}</td><td>${esc(l.iff || "")}</td><td>${esc(l.remarks || "")}</td></tr>`;
        }).join("") + `</tbody></table>`;
    };
    const fsT = plan.fs.length ? head("F/S") + `<table class="pv-t"><thead><tr><th>SLOT</th><th>DEVICE</th><th>IP</th><th>SP</th><th>MISSION</th><th>REMARKS</th></tr></thead><tbody>`
      + plan.fs.map((l) => `<tr><td>${l.slot}</td><td>${esc(l.device || "")}</td><td>${esc(l.ip || "")}</td>
        <td>${esc(l.sp || "")}</td><td>${esc(customText(l) || missionLabel(l.node))}</td><td>${esc(l.remarks || "")}</td></tr>`).join("")
      + `</tbody></table>` : "";
    const lsT = plan.lessons.length ? head("Lessons & exams") + `<table class="pv-t"><thead><tr><th>TIME</th><th>SUBJECT</th><th>SCOPE</th><th>INSTRUCTOR</th><th>NOTE</th></tr></thead><tbody>`
      + plan.lessons.map((l) => `<tr><td>${esc(l.time || "")}</td><td>${esc(missionLabel(l.node))}</td>
        <td>${esc(l.scope === "student" ? l.student : l.class)}</td><td>${esc(l.instructor || "")}</td><td>${esc(l.note || "")}</td></tr>`).join("")
      + `</tbody></table>` : "";
    const alt = head("Alternates") + `<p class="pv-p"><b>Students:</b> `
      + (plan.alt_students.length ? plan.alt_students.map((a) => esc(a.sp + " — " + (customText(a) || missionLabel(a.node)) + (a.note ? " (" + a.note + ")" : ""))).join(" · ") : "—")
      + `</p><p class="pv-p"><b>Instructors:</b> `
      + (plan.alt_instructors.length ? plan.alt_instructors.map((a) => esc(a.ip + (a.note ? " (" + a.note + ")" : ""))).join(" · ") : "—") + `</p>`;
    const away = students().concat(instructors()).map((p) => ({ c: p.code, s: awayOf(p.code, plan.date) })).filter((x) => x.s);
    const sAvail = students().filter((s) => (s.status || "active") === "active" && !awayOf(s.code, plan.date)).length;
    const iAvail = instructors().filter((i) => !awayOf(i.code, plan.date)).length;
    const cls = S().classList().map((k) => {
      let dn = 0, t = 0, fd = 0, ft = 0;
      for (const m of k.members) { const c = completion(m); dn += c.done; t += c.total; fd += c.fdone; ft += c.ftotal; }
      return `<tr><td>${esc(k.id)}</td><td>${k.members.length}</td><td>${A.mixActual.get(k.id) || 0} / ${esc(String(num(plan.mix[k.id], 0)))}</td>
        <td>${fd}/${ft}</td><td>${t ? Math.round((dn / t) * 100) : 0}%</td></tr>`;
    }).join("");

    return `<div class="pv-page">
      <div class="pv-top">
        <h2>DAILY FLIGHT SCHEDULE</h2>
        <p class="pv-p"><b>${esc(plan.date)}</b> · mass briefing <b>${esc(plan.mass_briefing)}</b>
          · status <b>${esc(plan.status)}</b>${plan.published_at ? " · published " + esc(plan.published_at.slice(0, 16).replace("T", " ")) : ""}</p>
        <p class="pv-p"><b>SOF</b> ${esc(d.SOF || "—")} &nbsp; <b>RSU</b> ${esc(d.RSU || "—")} &nbsp;
          <b>GROUND</b> ${esc(d.ground_instructor || "—")}</p>
      </div>
      ${plan.waves.map(waveTable).join("")}
      ${fsT}${lsT}${alt}
      ${head("Absences")}<p class="pv-p">${away.length ? away.map((a) => esc(a.c + " " + a.s)).join(" · ") : "—"}</p>
      ${head("Manning")}<p class="pv-p">SP available ${sAvail}/${students().length} · IP available ${iAvail}/${instructors().length}
        · sorties ${plan.waves.reduce((n, w) => n + w.lines.length, 0)} · F/S ${plan.fs.length}</p>
      ${head("Completion ratio")}<table class="pv-t"><thead><tr><th>CLASS</th><th>SP</th><th>ON BOARD / TARGET</th><th>FLIGHTS</th><th>OVERALL</th></tr></thead>
        <tbody>${cls}</tbody></table>
    </div>`;
  }

  function openPrint(plan, A, andPrint) {
    closePrint();
    const host = document.createElement("div");
    host.id = "sch-print";
    host.innerHTML = `<div class="pv-bar">
        <button type="button" class="sch-btn" data-pv="close">✕ Close</button>
        <button type="button" class="sch-btn primary" data-pv="print">🖨 Print</button>
        <span class="sch-hint">the printed sheet drops this bar and the app chrome</span>
      </div>` + printView(plan, A);
    document.body.appendChild(host);
    document.documentElement.classList.add("sch-printing");
    host.addEventListener("click", (e) => {
      const b = e.target.closest("[data-pv]");
      if (!b) return;
      if (b.dataset.pv === "close") closePrint();
      else window.print();
    });
    if (andPrint) setTimeout(() => window.print(), 120);
  }
  function closePrint() {
    const h = $id("sch-print");
    if (h) h.remove();
    document.documentElement.classList.remove("sch-printing");
  }

  /* ══════════════════════════════════════════════════════════════════════
     6 · board mutations
     ══════════════════════════════════════════════════════════════════════ */
  function nextIff(plan) {
    const c = CF();
    if (!c.iff.length) return "";
    const used = new Set();
    plan.waves.forEach((w) => w.lines.forEach((l) => { if (l.iff) used.add(l.iff); }));
    let n = 0;
    plan.waves.forEach((w) => { n += w.lines.length; });
    for (const x of c.iff) if (!used.has(x)) return x;
    return c.iff[n % c.iff.length];
  }

  function suggestTO(plan, wave) {
    const c = CF();
    const wi = plan.waves.indexOf(wave);
    const base = wave.kind === "night"
      ? hm2min(wave.brief || "19:00")
      : hm2min(plan.mass_briefing) == null ? hm2min("06:00") : hm2min(plan.mass_briefing);
    let start = legalSlot((base == null ? 360 : base) + c.brief + c.ground + (wave.kind === "night" ? 0 : wi * c.total), c);
    for (const l of wave.lines) { const t = hm2min(l.to); if (t != null && t >= start) start = t; }
    if (wave.lines.length) {
      let x = round5(start + c.stagger, c.round);
      return min2hm(legalSlot(x, c));
    }
    return min2hm(start);
  }

  function autofill(plan, line, kind) {
    if (!line.sp) return;
    const planned = plannedByStudent(plan);
    const c = CF();
    const opts = optionsFor(line.sp, kind, planned, line.node, c.depth);
    if (!line.node && !line.customOn && opts.length) line.node = opts[0].uid;
    if (kind === "flights") {
      const alts = optionsFor(line.sp, "flights", planned, null, c.depth + 1).filter((o) => o.uid !== line.node);
      if (!line.alt && !line.altCustomOn && alts.length) line.alt = alts[0].uid;
    }
  }

  function addLine(plan, wave, sp) {
    const w = wave || firstWave(plan) || plan.waves[0];
    if (!w) return null;
    const l = {
      id: newId("ln"), sp: sp || "", ip: "", node: "", alt: "", custom: "", altCustom: "", customOn: false, altCustomOn: false,
      callsign: "", to: suggestTO(plan, w), iff: nextIff(plan), remarks: "",
    };
    w.lines.push(l);
    if (sp) autofill(plan, l, "flights");
    return l;
  }
  function addFs(plan, sp) {
    const l = { id: newId("ln"), slot: plan.fs.length + 1, sp: sp || "", ip: "", node: "", custom: "", customOn: false, device: "OFT", remarks: "" };
    plan.fs.push(l);
    if (sp) autofill(plan, l, "fs");
    return l;
  }
  function addLesson(plan) {
    plan.lessons.push({ id: newId("ln"), node: "", scope: "class", class: "", student: "", instructor: dutyOf(plan.date).ground_instructor || "", time: "", note: "" });
  }

  /* balanced landing spot for a "not scheduled today" click */
  function leanestWave(plan) {
    const ws = dayWaves(plan);
    if (!ws.length) return plan.waves[0] || null;
    return ws.reduce((a, b) => (b.lines.length < a.lines.length ? b : a), ws[0]);
  }

  /* ══════════════════════════════════════════════════════════════════════
     7 · render + wiring
     ══════════════════════════════════════════════════════════════════════ */
  function snapFocus(el) {
    const a = document.activeElement;
    if (!a || !el.contains(a)) return null;
    const k = a.getAttribute("data-fk");
    if (!k) return null;
    let s = null, e = null;
    try { s = a.selectionStart; e = a.selectionEnd; } catch (x) { /* time/date inputs */ }
    return { k: k, s: s, e: e };
  }
  function restoreFocus(el, f) {
    if (!f) return;
    const n = el.querySelector('[data-fk="' + cssq(f.k) + '"]');
    if (!n) return;
    n.focus();
    if (f.s != null && n.setSelectionRange) { try { n.setSelectionRange(f.s, f.e); } catch (x) { /* not a text field */ } }
  }

  function renderBoard(el) {
    const plan = ensurePlan();
    let A;
    try { A = analyze(plan); }
    catch (e) {
      console.error(e);
      el.innerHTML = `<div class="sch-ph"><strong>The board could not be built.</strong><p>${esc(e.message)}</p></div>`;
      return;
    }
    const f = snapFocus(el);
    el.innerHTML = setupBar(plan, A) + dutiesPanel(plan) + wavesHtml(plan, A) + fsHtml(plan, A)
      + lessonsHtml(plan, A) + notScheduledHtml(plan, A) + alternatesHtml(plan, A)
      + (canActualize(plan) ? actualizeHtml(plan, A) : "") + summaryHtml(plan, A);
    restoreFocus(el, f);
  }

  /* typing must not rebuild the DOM under the caret: the derived cells and the
     warning strips are patched in place instead. */
  function patchDerived(el) {
    const plan = ensurePlan();
    let A;
    try { A = analyze(plan); } catch (e) { return; }
    for (const box of el.querySelectorAll(".sch-line")) {
      const id = box.dataset.l;
      const list = box.dataset.blk === "fs" ? A.fsWarn.get(id) : (box.dataset.blk === "ls" ? A.lsWarn.get(id) : A.warn.get(id));
      const cur = box.querySelector(".sch-lwarn");
      const html = warnHtml(list);
      if (cur) { if (html) cur.outerHTML = html; else cur.remove(); }
      else if (html) box.insertAdjacentHTML("afterbegin", html);
      const tm = box.querySelector(".sch-ltimes");
      if (tm && A.t.has(id)) tm.innerHTML = timesHtml(A.t.get(id), A.c);
    }
  }

  function wireBoard(el) {
    if (el._wired) return;
    el._wired = true;

    el.addEventListener("click", (e) => {
      const plan = ensurePlan();
      const away = e.target.closest("[data-away]");
      if (away) {
        const code = away.dataset.away;
        const cur = S().availabilityOf(code, plan.date);
        S().setAvailability(code, plan.date, AV_CYCLE[(AV_CYCLE.indexOf(cur) + 1) % AV_CYCLE.length]);
        return;                                            // the store event repaints
      }
      const addSp = e.target.closest("[data-add-sp]");
      if (addSp) { addLine(plan, leanestWave(plan), addSp.dataset.addSp); saveNow(); renderBoard(el); return; }

      const ab = e.target.closest("[data-ab]");
      if (ab) {
        const row = ab.closest("[data-act-l]");
        const id = row.dataset.actL;
        const cur = plan.actuals[id] || (plan.actuals[id] = {});
        cur.state = cur.state === ab.dataset.ab ? "" : ab.dataset.ab;
        saveSoon(); renderBoard(el); return;
      }
      const lb = e.target.closest("[data-lb]");
      if (lb) { lineButton(el, plan, lb); return; }
      const wb = e.target.closest("[data-wb]");
      if (wb) { waveButton(el, plan, wb); return; }
      const b = e.target.closest("[data-b]");
      if (b) boardButton(el, plan, b);
    });

    el.addEventListener("change", (e) => {
      const plan = ensurePlan();
      const t = e.target;
      if (t.dataset.duty != null) {
        const p = {}; p[t.dataset.duty] = t.value;
        setDuty(plan.date, p);
        return;                                            // store event repaints
      }
      if (t.dataset.b === "date") { ui.date = t.value || ui.date; ui.plan = null; renderBoard(el); return; }
      if (t.dataset.b === "mass") { plan.mass_briefing = t.value; saveSoon(); renderBoard(el); return; }
      if (t.dataset.b === "allip") { ui.allIp = t.checked; renderBoard(el); return; }
      if (t.dataset.mix != null) { plan.mix[t.dataset.mix] = num(t.value, 0); saveSoon(); renderBoard(el); return; }
      if (t.dataset.wf != null) {
        const w = plan.waves.find((x) => x.id === t.closest("[data-w]").dataset.w);
        if (w) { w[t.dataset.wf] = t.value; saveSoon(); renderBoard(el); }
        return;
      }
      if (t.dataset.abF != null) {
        const id = t.closest("[data-act-l]").dataset.actL;
        const cur = plan.actuals[id] || (plan.actuals[id] = {});
        cur[t.dataset.abF] = t.value;
        saveSoon(); return;
      }
      if (t.dataset.lf != null) { fieldChange(el, plan, t, true); return; }
    });

    el.addEventListener("input", (e) => {
      const plan = ensurePlan();
      const t = e.target;
      if (t.dataset.lf != null && t.tagName === "INPUT" && t.type !== "checkbox") {
        fieldChange(el, plan, t, false);
        return;
      }
      if (t.dataset.abF != null) {
        const id = t.closest("[data-act-l]").dataset.actL;
        const cur = plan.actuals[id] || (plan.actuals[id] = {});
        cur[t.dataset.abF] = t.value;
        saveSoon();
      }
    });
  }

  function targetOf(plan, node) {
    const box = node.closest("[data-l]");
    if (!box) return null;
    const id = box.dataset.l, blk = box.dataset.blk;
    if (blk === "w") { const h = findLine(plan, id); return h ? { rec: h.line, kind: "flights", blk: blk } : null; }
    if (blk === "fs") { const r = findFs(plan, id); return r ? { rec: r, kind: "fs", blk: blk } : null; }
    if (blk === "ls") { const r = plan.lessons.find((x) => x.id === id); return r ? { rec: r, kind: "lessons", blk: blk } : null; }
    if (blk === "as") { const r = plan.alt_students.find((x) => x.id === id); return r ? { rec: r, kind: "flights", blk: blk } : null; }
    if (blk === "ai") { const r = plan.alt_instructors.find((x) => x.id === id); return r ? { rec: r, kind: "flights", blk: blk } : null; }
    return null;
  }

  function fieldChange(el, plan, t, isChange) {
    const tg = targetOf(plan, t);
    if (!tg) return;
    const f = t.dataset.lf, rec = tg.rec;
    let heavy = isChange;

    if ((f === "node" || f === "alt") && t.value === "__custom__") {
      rec[f] = "";
      rec[f === "node" ? "customOn" : "altCustomOn"] = true;
      heavy = true;
    } else if (f === "node" || f === "alt") {
      rec[f] = t.value;
      rec[f === "node" ? "custom" : "altCustom"] = "";
      rec[f === "node" ? "customOn" : "altCustomOn"] = false;
      heavy = true;
    } else if (f === "sp") {
      rec.sp = t.value;
      rec.node = ""; rec.alt = ""; rec.custom = ""; rec.altCustom = "";
      rec.customOn = false; rec.altCustomOn = false;
      autofill(plan, rec, tg.kind);
      heavy = true;
    } else {
      rec[f] = t.value;
    }
    saveSoon();
    if (heavy) renderBoard(el); else patchDerived(el);
  }

  function lineButton(el, plan, b) {
    const tg = targetOf(plan, b);
    if (!tg) return;
    const rec = tg.rec, blk = tg.blk;
    const act = b.dataset.lb;
    if (act === "del") {
      if (blk === "w") { const h = findLine(plan, rec.id); if (h) h.wave.lines = h.wave.lines.filter((x) => x.id !== rec.id); }
      else if (blk === "fs") plan.fs = plan.fs.filter((x) => x.id !== rec.id);
      else if (blk === "ls") plan.lessons = plan.lessons.filter((x) => x.id !== rec.id);
      else if (blk === "as") plan.alt_students = plan.alt_students.filter((x) => x.id !== rec.id);
      else if (blk === "ai") plan.alt_instructors = plan.alt_instructors.filter((x) => x.id !== rec.id);
      delete plan.actuals[rec.id];
    } else if (act === "dup" && blk === "w") {
      const h = findLine(plan, rec.id);
      if (h) {
        const copy = Object.assign({}, rec, { id: newId("ln"), to: suggestTO(plan, h.wave), iff: nextIff(plan) });
        h.wave.lines.push(copy);
      }
    } else if ((act === "up" || act === "down") && blk === "fs") {
      const i = plan.fs.findIndex((x) => x.id === rec.id);
      const j = act === "up" ? i - 1 : i + 1;
      if (i >= 0 && j >= 0 && j < plan.fs.length) { const tmp = plan.fs[i]; plan.fs[i] = plan.fs[j]; plan.fs[j] = tmp; }
    }
    saveNow();
    renderBoard(el);
  }

  function waveButton(el, plan, b) {
    const wid = b.closest("[data-w]").dataset.w;
    const w = plan.waves.find((x) => x.id === wid);
    if (!w) return;
    if (b.dataset.wb === "add") addLine(plan, w, "");
    else if (b.dataset.wb === "del") {
      if (w.lines.length && !confirm("Remove " + w.name + " with its " + w.lines.length + " line(s)?")) return;
      plan.waves = plan.waves.filter((x) => x.id !== wid);
    }
    saveNow();
    renderBoard(el);
  }

  function boardButton(el, plan, b) {
    const a = b.dataset.b;
    if (a === "day-1") { ui.date = isoShift(plan.date, -1); ui.plan = null; renderBoard(el); return; }
    if (a === "day+1") { ui.date = isoShift(plan.date, 1); ui.plan = null; renderBoard(el); return; }
    if (a === "day-today") { ui.date = today(); ui.plan = null; renderBoard(el); return; }
    if (a === "add-line") { addLine(plan, leanestWave(plan), ""); saveNow(); renderBoard(el); return; }
    if (a === "add-fs") { addFs(plan, ""); saveNow(); renderBoard(el); return; }
    if (a === "add-lesson") { addLesson(plan); saveNow(); renderBoard(el); return; }
    if (a === "add-wave") { plan.waves.push(newWave("Wave " + (dayWaves(plan).length + 1), "wave")); saveNow(); renderBoard(el); return; }
    if (a === "add-night") {
      if (plan.waves.some((w) => w.kind === "night")) { S().toast("The night wave is already on the board.", "bad"); return; }
      const w = newWave("Night", "night");
      w.brief = "19:00";
      plan.waves.push(w);
      saveNow(); renderBoard(el); return;
    }
    if (a === "add-alt-s") { plan.alt_students.push({ id: newId("al"), sp: "", node: "", custom: "", customOn: false, note: "" }); saveNow(); renderBoard(el); return; }
    if (a === "add-alt-i") { plan.alt_instructors.push({ id: newId("al"), ip: "", note: "" }); saveNow(); renderBoard(el); return; }
    if (a === "clear") {
      if (!confirm("Discard the whole board of " + plan.date + "?")) return;
      ui.plan = null; ui.loadedFor = "";
      S().removeDayPlan(plan.date);
      renderBoard(el);
      S().toast("Day cleared.", "good");
      return;
    }
    if (a === "print") { openPrint(plan, analyze(plan), false); return; }
    if (a === "reopen") { plan.status = "draft"; saveNow(); renderBoard(el); S().toast("Back to draft.", "good"); return; }
    if (a === "publish") {
      const A = analyze(plan);
      if (A.hard && !confirm(A.hard + " hard warning(s) on the board.\nPublish anyway?")) return;
      plan.status = "published";
      plan.published_at = new Date().toISOString();
      saveNow();
      renderBoard(el);
      S().toast("Published — the print view is open.", "good");
      openPrint(plan, analyze(plan), true);
      return;
    }
    if (a === "commit-actual") { commitActuals(plan); renderBoard(el); return; }
  }

  /* ══════════════════════════════════════════════════════════════════════
     8 · PROGRESS EDITOR — full CRUD over one student's progress
     ══════════════════════════════════════════════════════════════════════ */
  const PSTAT = {
    completed: { t: "done", c: "good" }, pending: { t: "—", c: "" },
    repeat: { t: "repeat", c: "bad" }, absent_makeup: { t: "makeup", c: "warn" },
  };

  function progHost() {
    let h = $id("sch-progmodal");
    if (!h) {
      h = document.createElement("div");
      h.id = "sch-progmodal";
      h.className = "sch-modal hidden";
      document.body.appendChild(h);
      h.addEventListener("click", (e) => {
        if (e.target === h) { progClose(); return; }
        const b = e.target.closest("[data-pb]");
        if (b) progButton(b);
      });
      h.addEventListener("change", (e) => {
        if (e.target.dataset.pf != null && ui.prog.pending) ui.prog.pending[e.target.dataset.pf] = e.target.value;
      });
      h.addEventListener("input", (e) => {
        if (e.target.id === "sch-progq") { ui.prog.q = e.target.value; progRenderBody(); }
      });
      if (!window._schProgKey) {
        window._schProgKey = true;
        document.addEventListener("keydown", (e) => { if (e.key === "Escape") progClose(); });
      }
    }
    return h;
  }
  function progClose() {
    const h = $id("sch-progmodal");
    if (h) { h.classList.add("hidden"); h.innerHTML = ""; }
    ui.prog = { code: "", pending: null, q: "" };
  }

  window.schProgressOpen = function schProgressOpen(code) {
    if (!code) return;
    ui.prog = { code: code, pending: null, q: "" };
    const h = progHost();
    h.classList.remove("hidden");
    progRender();
  };

  function progRender() {
    const h = $id("sch-progmodal");
    if (!h || !ui.prog.code) return;
    const code = ui.prog.code;
    const s = S().find("students", code) || { code: code };
    const c = completion(code);
    const idle = R().idleDays(code, today());
    const gates = R().openGates(code);
    h.innerHTML = `<div class="sch-modalbox">
      <div class="sch-h">
        <h2>Progress — <span class="sch-code">${esc(code)}</span></h2>
        <span class="sch-badge">${esc(s.class || "—")}</span>
        <span class="sch-badge">${c.done}/${c.total} nodes · ${c.total ? Math.round((c.done / c.total) * 100) : 0}%</span>
        <span class="sch-badge">flights ${c.fdone}/${c.ftotal}</span>
        <span class="sch-nd">${idle == null ? "never flown" : idle + "d idle"}</span>
        ${gates.map((g) => `<span class="sch-badge warn" title="${esc(g.note || "")}">${esc(g.label)}${g.date ? " · " + esc(g.date) : ""}</span>`).join("")}
        <span class="sch-spacer"></span>
        <input type="search" id="sch-progq" class="sch-in" placeholder="filter nodes…" value="${esc(ui.prog.q)}">
        <button type="button" class="sch-btn" data-pb="close">✕ Close</button>
      </div>
      <div id="sch-progbody" class="sch-modalbody"></div>
    </div>`;
    progRenderBody();
  }

  function progRenderBody() {
    const host = $id("sch-progbody");
    if (!host) return;
    const code = ui.prog.code;
    const st = R().state(code);
    const q = ui.prog.q.trim().toLowerCase();
    const hit = new Set(R().search(q));
    const owed = R().nodes().filter((u) => st[u] && (st[u].status === "absent_makeup" || st[u].status === "repeat"));

    const chip = (u) => {
      const s = st[u] || { status: "pending" };
      const d = R().describe(u);
      const p = PSTAT[s.status] || PSTAT.pending;
      const done = s.status === "completed";
      return `<div class="sch-pnode is-${esc(s.status)}" data-uid="${esc(u)}" title="${esc(d.name)}">
        <span class="sch-code">${esc(d.short)}</span>
        <span class="sch-badge ${esc(p.c)}">${esc(p.t)}</span>
        ${s.date ? `<span class="sch-nd">${esc(s.date)}</span>` : ""}
        ${s.instructor ? `<span class="sch-nd">${esc(s.instructor)}</span>` : ""}
        <span class="sch-pact">
          ${done
          ? `<button type="button" class="sch-mini danger" data-pb="undo" title="withdraw the completion">↺</button>`
          : `<button type="button" class="sch-mini good" data-pb="done" title="${s.status === "pending" ? "mark completed" : "mark the makeup done"}">✓</button>`}
          <button type="button" class="sch-mini" data-pb="upto" title="complete everything up to here in this section line">⇥</button>
        </span>
      </div>`;
    };

    const secs = [];
    for (const k of R().KINDS) {
      for (const sec of R().sections(k)) {
        const list = sec.uids.filter((u) => hit.has(u));
        if (!list.length) continue;
        const dn = list.filter((u) => st[u] && st[u].status === "completed").length;
        secs.push(`<section class="sch-psec">
          <h3><span class="sch-badge k-${esc(k)}">${esc(R().KIND_SHORT[k])}</span> ${esc(sec.label)}
            <span class="count">${dn}/${list.length}</span></h3>
          <div class="sch-pgrid">${list.map(chip).join("")}</div></section>`);
      }
    }

    const pend = ui.prog.pending;
    const bar = pend ? `<div class="sch-pbar">
      <span class="sch-lbl">${esc(pend.title)}</span>
      <label class="sch-fld"><span>Date</span><input type="date" class="sch-in" data-pf="date" value="${esc(pend.date)}"></label>
      <label class="sch-fld"><span>Instructor</span><select class="sch-in" data-pf="instructor"><option value="">—</option>
        ${instructors().map((i) => `<option value="${esc(i.code)}"${pend.instructor === i.code ? " selected" : ""}>${esc(i.code)}</option>`).join("")}</select></label>
      <button type="button" class="sch-btn primary" data-pb="confirm">Save</button>
      <button type="button" class="sch-btn" data-pb="cancel">Cancel</button>
    </div>` : "";

    host.innerHTML = bar + (owed.length ? `<section class="sch-psec sch-powed">
      <h3>Owed makeups <span class="count">${owed.length}</span></h3>
      <div class="sch-pgrid">${owed.map(chip).join("")}</div></section>` : "")
      + (secs.join("") || `<p class="sch-hint">No node matches the filter.</p>`);
  }

  function progButton(b) {
    const act = b.dataset.pb;
    if (act === "close") { progClose(); return; }
    if (act === "cancel") { ui.prog.pending = null; progRenderBody(); return; }
    if (act === "confirm") { progCommit(); return; }
    const box = b.closest("[data-uid]");
    const uid = box ? box.dataset.uid : "";
    const code = ui.prog.code;
    if (act === "undo") { progUndo(code, uid); return; }
    if (act === "done") {
      const st = R().state(code)[uid] || { status: "pending" };
      ui.prog.pending = {
        mode: "one", uids: [uid], date: today(), instructor: "",
        title: (st.status === "pending" ? "Mark completed" : "Mark the makeup done") + " — " + R().label(uid),
      };
      progRenderBody(); return;
    }
    if (act === "upto") {
      const line = uptoList(code, uid);
      if (!line.length) { S().toast("Everything up to here is already completed.", "good"); return; }
      if (!confirm("Mark " + line.length + " node(s) of this line as completed, up to and including " + R().label(uid) + "?")) return;
      ui.prog.pending = { mode: "bulk", uids: line, date: today(), instructor: "", title: "Complete " + line.length + " nodes up to " + R().label(uid) };
      progRenderBody();
    }
  }

  /* every not-completed node of the same section line, in syllabus order, up
     to and including the clicked one */
  function uptoList(code, uid) {
    const st = R().state(code);
    const kind = R().kindOf(uid);
    const pool = R().nodes(kind);
    const idx = pool.indexOf(uid);
    if (idx < 0) return [];
    const d = R().describe(uid);
    return pool.slice(0, idx + 1).filter((u) => {
      if (st[u] && st[u].status === "completed") return false;
      const dd = R().describe(u);
      return kind === "lessons" || kind === "exams" ? true : dd.track === d.track;
    });
  }

  function progCommit() {
    const p = ui.prog.pending;
    if (!p) return;
    if (!p.date) { S().toast("Pick the date.", "bad"); return; }
    const code = ui.prog.code;
    const date = p.date, ip = p.instructor || "";
    const uids = p.uids.slice();
    ui.prog.pending = null;                                  // ui state first
    for (const u of uids) {
      const kind = R().kindOf(u);
      const rec = {
        id: "prg:" + code + ":" + u, node: u, kind: kind, scope: "student",
        student: code, class: "", date: date, instructor: ip,
        device: kind === "flights" ? "T-6A" : (kind === "fs" ? "OFT" : "GND"),
        result: "completed", score: null, note: "progress editor", absent: [],
        start_date: "", end_date: "",
      };
      S().upsert("trainingLog", rec);
    }
    S().toast(uids.length + " node(s) marked completed.", "good");
    progRender();
  }

  function progUndo(code, uid) {
    const s = R().state(code)[uid];
    if (!s || !s.eventId) { S().toast("Nothing recorded for this node.", "bad"); return; }
    const ev = S().find("trainingLog", s.eventId);
    if (!ev) { S().toast("The event is gone already.", "bad"); return; }
    if (ev.scope === "class") {
      S().toast("Recorded as a class event of " + (ev.class || "—") + " — edit it in the Training Log.", "bad");
      return;
    }
    if (!confirm("Withdraw the " + R().label(uid) + " completion of " + code + " (" + (ev.date || "—") + ")?")) return;
    S().remove("trainingLog", s.eventId);
    S().toast("Withdrawn.", "good");
    progRender();
  }

  /* ══════════════════════════════════════════════════════════════════════
     9 · BALANCE (spec §8)
     ══════════════════════════════════════════════════════════════════════ */
  function balRange() {
    const anchor = ui.bal.anchor || today();
    if (ui.bal.period === "month") {
      const from = anchor.slice(0, 8) + "01";
      const y = +anchor.slice(0, 4), m = +anchor.slice(5, 7);
      const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
      return { from: from, to: anchor.slice(0, 8) + pad2(last), label: anchor.slice(0, 7) };
    }
    const t = Date.parse(anchor + "T00:00:00Z");
    const dow = (new Date(t).getUTCDay() + 6) % 7;           // Monday = 0
    const from = new Date(t - dow * DAY_MS).toISOString().slice(0, 10);
    const to = new Date(t + (6 - dow) * DAY_MS).toISOString().slice(0, 10);
    return { from: from, to: to, label: from + " → " + to };
  }

  function balData(rg) {
    const sp = new Map(), ip = new Map();
    const sRec = (c) => { let r = sp.get(c); if (!r) { r = { code: c, lessons: 0, exams: 0, fs: 0, flights: 0, total: 0 }; sp.set(c, r); } return r; };
    const iRec = (c) => { let r = ip.get(c); if (!r) { r = { code: c, flights: 0, fs: 0, ground: 0, duties: 0, total: 0 }; ip.set(c, r); } return r; };
    students().forEach((s) => sRec(s.code));
    instructors().forEach((i) => iRec(i.code));

    for (const ev of (S().get("trainingLog") || [])) {
      const d = ev.end_date || ev.date || "";
      if (!d || d < rg.from || d > rg.to) continue;
      const node = ev.node || ev.uid || "";
      const kind = R().kindOf(node);
      if (!kind) continue;
      const abs = new Set((ev.absent || []).map((a) => a.student));
      const credit = (c) => { if (!c || abs.has(c) || !sp.has(c)) return; const r = sRec(c); r[kind]++; r.total++; };
      if (ev.scope === "class") S().membersOf(ev.class || "").forEach(credit);
      else credit(ev.student);
      if (ev.instructor && ip.has(ev.instructor)) {
        const r = iRec(ev.instructor);
        if (kind === "flights") r.flights++;
        else if (kind === "fs") r.fs++;
        else r.ground++;
        r.total++;
      }
    }
    for (const r of (S().get("dutyRoster") || [])) {
      if (!r.date || r.date < rg.from || r.date > rg.to) continue;
      [r.SOF, r.RSU, r.ground_instructor].filter(Boolean).forEach((c) => {
        if (!ip.has(c)) return;
        const x = iRec(c); x.duties++; x.total++;
      });
    }
    return { sp: sp, ip: ip };
  }

  /* Deviation as a plain difference from the cohort mean: a percentage of an
     average below 1 event says "+2100%" and means nothing. The colour only
     fires once the cohort actually has a rhythm to deviate from.            */
  function balCell(v, avg) {
    const d = v - avg;
    let cl = "";
    if (avg >= 1) {
      const dev = d / avg;
      if (dev < -0.5) cl = " is-hard";
      else if (dev < -0.25) cl = " is-soft";
      else if (dev > 0.5) cl = " is-over";
    }
    const txt = (d >= 0 ? "+" : "−") + Math.abs(d).toFixed(1);
    return `<td class="sch-mono${cl}">${v} <span class="sch-nd" title="cohort average ${avg.toFixed(1)}">${txt}</span></td>`;
  }
  const lastLogDate = () => (S().get("trainingLog") || [])
    .reduce((m, e) => { const d = e.end_date || e.date || ""; return d > m ? d : m; }, "");

  window.schBalanceInit = function schBalanceInit(el) {
    if (!el) return;
    /* open on a period that actually holds events: if the log stops before
       today (a fresh seed, a quiet spell), anchor on its last day instead of
       greeting the user with a table of zeros. */
    if (!ui.bal.anchor) { const l = lastLogDate(); ui.bal.anchor = l && l < today() ? l : today(); }
    const rg = balRange();
    const D = balData(rg);
    const c = CF();

    const byClass = new Map();
    for (const s of students()) {
      const k = s.class || "—";
      if (!byClass.has(k)) byClass.set(k, []);
      byClass.get(k).push(s.code);
    }
    const classAvg = new Map();
    byClass.forEach((mem, k) => {
      const tot = mem.reduce((n, cch) => n + ((D.sp.get(cch) || {}).total || 0), 0);
      classAvg.set(k, mem.length ? tot / mem.length : 0);
    });

    const spRows = students().map((s) => {
      const r = D.sp.get(s.code) || { lessons: 0, exams: 0, fs: 0, flights: 0, total: 0 };
      const idle = R().idleDays(s.code, today());
      const st = R().state(s.code);
      const owed = R().nodes().filter((u) => st[u] && (st[u].status === "absent_makeup" || st[u].status === "repeat")).length;
      const avg = classAvg.get(s.class || "—") || 0;
      const idleCl = idle == null || idle > c.idle * 2 ? " is-hard" : (idle > c.idle ? " is-soft" : "");
      return `<tr><td class="sch-code">${esc(s.code)}</td><td>${esc(s.class || "—")}</td>
        <td class="sch-mono">${r.lessons}</td><td class="sch-mono">${r.exams}</td>
        <td class="sch-mono">${r.fs}</td><td class="sch-mono">${r.flights}</td>
        ${balCell(r.total, avg)}
        <td class="sch-mono${idleCl}">${idle == null ? "never" : idle + "d"}</td>
        <td class="sch-mono${owed > 2 ? " is-hard" : (owed ? " is-soft" : "")}">${owed}</td></tr>`;
    }).join("");

    const ipList = instructors();
    const ipAvg = ipList.length ? ipList.reduce((n, i) => n + ((D.ip.get(i.code) || {}).total || 0), 0) / ipList.length : 0;
    const ipRows = ipList.map((i) => {
      const r = D.ip.get(i.code) || { flights: 0, fs: 0, ground: 0, duties: 0, total: 0 };
      return `<tr><td class="sch-code">${esc(i.code)}</td>
        <td class="sch-mono">${r.flights}</td>
        <td class="sch-mono${r.fs > c.fsMax ? " is-hard" : (r.fs > c.fsPref ? " is-soft" : "")}">${r.fs}</td>
        <td class="sch-mono">${r.ground}</td><td class="sch-mono">${r.duties}</td>
        ${balCell(r.total, ipAvg)}</tr>`;
    }).join("");
    const periodTotal = [...D.sp.values()].reduce((n, r) => n + r.total, 0);
    const lastLog = lastLogDate();

    el.innerHTML = `
      <section class="panel sch-panel">
        <div class="sch-h"><h2>Balance <span class="count">${esc(rg.label)}</span></h2>
          <span class="sch-seg">
            <button type="button" class="sch-btn${ui.bal.period === "week" ? " primary" : ""}" data-bal="week">Week</button>
            <button type="button" class="sch-btn${ui.bal.period === "month" ? " primary" : ""}" data-bal="month">Month</button>
          </span>
          <label class="sch-fld"><span>Anchor</span>
            <input type="date" class="sch-in" data-bal="anchor" value="${esc(ui.bal.anchor)}"></label>
          <button type="button" class="sch-mini" data-bal="prev" title="previous period">‹</button>
          <button type="button" class="sch-mini" data-bal="next" title="next period">›</button>
          <span class="sch-hint">amber under −25% of the cohort average · red under −50% · idle over ${c.idle} working days</span>
        </div>
        ${periodTotal ? "" : `<p class="sch-hint"><b>No event in this period.</b>${lastLog
        ? " The training log ends on " + esc(lastLog) + " — step back with ‹ or move the anchor." : ""}</p>`}
      </section>
      <section class="panel sch-panel">
        <div class="sch-h"><h2>Students</h2><span class="sch-hint">${periodTotal} student events in the period</span></div>
        <div class="sch-scroll"><table class="sch-tbl">
          <thead><tr><th>SP</th><th>Class</th><th>LSN</th><th>EXAM</th><th>F/S</th><th>FLT</th>
            <th>Total · Δ vs class ⌀</th><th>Idle</th><th>Makeups owed</th></tr></thead>
          <tbody>${spRows || `<tr><td colspan="9" class="sch-hint">No student.</td></tr>`}</tbody></table></div>
      </section>
      <section class="panel sch-panel">
        <div class="sch-h"><h2>Instructors</h2><span class="sch-hint">duties come from the duty roster</span></div>
        <div class="sch-scroll"><table class="sch-tbl">
          <thead><tr><th>IP</th><th>Flights</th><th>F/S</th><th>Ground</th><th>Duties</th><th>Load · Δ vs ⌀</th></tr></thead>
          <tbody>${ipRows || `<tr><td colspan="6" class="sch-hint">No instructor.</td></tr>`}</tbody></table></div>
      </section>`;

    if (el._wired) return;
    el._wired = true;
    const step = (dir) => {
      if (ui.bal.period === "month") {
        const y = +ui.bal.anchor.slice(0, 4), m = +ui.bal.anchor.slice(5, 7);
        const d = new Date(Date.UTC(y, m - 1 + dir, 1));
        ui.bal.anchor = d.toISOString().slice(0, 10);
      } else ui.bal.anchor = isoShift(ui.bal.anchor, 7 * dir);
    };
    el.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-bal]");
      if (!b) return;
      const v = b.dataset.bal;
      if (v === "week" || v === "month") ui.bal.period = v;
      else if (v === "prev") step(-1);
      else if (v === "next") step(1);
      window.schBalanceInit(el);
    });
    el.addEventListener("change", (e) => {
      if (e.target.dataset.bal !== "anchor") return;
      ui.bal.anchor = e.target.value || today();
      window.schBalanceInit(el);
    });
  };

  /* ══════════════════════════════════════════════════════════════════════
     10 · entry point
     ══════════════════════════════════════════════════════════════════════ */
  window.schBoardInit = function schBoardInit(el) {
    if (!el) return;
    if (ui.quiet) { ui.quiet = false; return; }               // our own autosave
    if (!ui.wired) {
      ui.wired = true;
      /* a whole-store replacement invalidates the working copy */
      S().subscribe((coll) => { if (coll === "*") { ui.plan = null; ui.loadedFor = ""; GRP = null; } });
    }
    wireBoard(el);
    try { renderBoard(el); }
    catch (e) {
      console.error(e);
      el.innerHTML = `<div class="sch-ph"><strong>The board could not be drawn.</strong><p>${esc(e.message)}</p></div>`;
    }
  };
})();
