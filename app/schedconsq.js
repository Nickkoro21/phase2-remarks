"use strict";
/* schedconsq.js — ROUND 2 of specs/scheduler-spec.md §3α:
 * the CONSEQUENCE ENGINE. Derives, per student, the ACTIVE consequences of every
 * ΥΣΤΕΡΗΣΗ (lag) / ΑΠΟΤΥΧΙΑ (fail) recorded in the training log:
 *
 *   C1  simple sortie lag/fail        → day-block window (fail-08/09/10 — the
 *       SPECIFIC rule beats the GENERAL one: first lag/fail in a category on
 *       the A/C uses the stricter fail-08 μεθεπόμενη-working-day math)
 *   C2  LAST sortie of a section      → A/C: APT-EXAM pending, category locked
 *       (fail-12) · F/S: 3-attempt ladder (fail-11) · first «ΜΟΝΟΣ»: apt
 *       pending and the solo is never re-offered (fail-19)
 *   C3  checkride fail / score 0-59   → ΠΔ 29/2020: hard block of ALL
 *       activities until the dp_ae → dp_cdr → board resolution path closes
 *       (fail-16)
 *   C4  pre-exam prerequisites        → 4.0 h in the 20-day window · no ≥5
 *       calendar days without a flight (fail-17)
 *   C5  SMS entry counter             → fail-45 caps; display only, NEVER a
 *       block (unit ruling ΑΕ 364 ΜΕΑ, 2026-08-09)
 *
 * Everything is DERIVED from SchedStore.trainingLog + gates + the flowchart2
 * graph (via SchedReady) — nothing is persisted. Legacy result "repeat" is
 * read as lag; stored data is never rewritten.
 *
 * Verbatim excerpts (≤120 chars) are quoted from
 * data/requirements/failure_procedures.json — id + excerpt travel with every
 * institutional warning, same UI pattern as Round 1.
 */
(() => {
  const S = () => window.SchedStore;
  const R = () => window.SchedReady;

  /* ── calendar ─────────────────────────────────────────────────────────── */
  const DAY = 86400000;
  const dnum = (iso) => { const t = Date.parse(String(iso) + "T00:00:00Z"); return isNaN(t) ? null : Math.floor(t / DAY); };
  const dISO = (n) => new Date(n * DAY).toISOString().slice(0, 10);
  const isWork = (n) => { const d = new Date(n * DAY).getUTCDay(); return d !== 0 && d !== 6; };
  function addWork(iso, k) { let n = dnum(iso); if (n == null) return iso; while (k > 0) { n++; if (isWork(n)) k--; } return dISO(n); }
  function addCal(iso, k) { const n = dnum(iso); return n == null ? iso : dISO(n + k); }
  const later = (a, b) => (a >= b ? a : b);
  const DOWS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const MONS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function fmtDay(iso) {
    const t = Date.parse(String(iso) + "T00:00:00Z");
    if (isNaN(t)) return iso;
    const d = new Date(t);
    return DOWS[d.getUTCDay()] + " " + d.getUTCDate() + " " + MONS[d.getUTCMonth()];
  }

  /* ── requirement records — id + ≤120-char verbatim + source ref ───────── */
  const REQ = {
    "fail-08": "δεν θα ίπταται άλλη πτήση με το Α/Φ ή F/S, την ίδια ή την επόμενη ημέρα. Να προγραμματίζεται τη μεθεπόμενη εργάσιμη",
    "fail-09": "να προγραμματίζεται την επόμενη ημέρα για την έξοδο στο F/S και τη μεθεπόμενη για την πτήση με το Α/Φ.",
    "fail-10": "δεν θα ίπταται άλλη πτήση την ίδια μέρα στο Α/Φ ή στο F/S. Την επόμενη εργάσιμη μέρα να προγραμματίζεται…",
    "fail-11": "να προγραμματίζεται για πτήση στο F/S, μετά από 2 ημερολογιακές ημέρες (μη συμπεριλαμβανομένης της ημέρας που ΥΣΤΕΡΗΣΕ)",
    "fail-12": "να ίπταται Εξέταση Καταλληλότητας με Αξιολογητή της Μοίρας… Αν ΥΣΤΕΡΗΣΕΙ ή ΑΠΟΤΥΧΕΙ εκ νέου, ΠΔ 29/2020 κατά περίπτωση",
    "fail-16": "βαθμολογείται με βαθμολογία από μηδέν (0) έως πενήντα εννέα τοις εκατό (59%) — κρίση Πτητικής Καταλληλότητας",
    "fail-17": "πρέπει να έχει συμπληρώσει τουλάχιστον 4,0 ώρες πτήσης ανεξαρτήτως κατηγορίας ασκήσεων",
    "fail-17b": "έχουν μεσολαβήσει χωρίς πτήση 5 ημερολογιακές ημέρες… Στην περίπτωση αυτή να ίπτανται 1 έξοδο ΕΠΑΝΑΛΗΨΗΣ.",
    "fail-19": "να ίπταται Εξέταση Καταλληλότητας… η πτήση «ΜΟΝΟΣ» δεν θα επαναλαμβάνεται.",
    "fail-45": "Μία φορά λόγω μειωμένης απόδοσης ανά κατηγορία για τις υπόλοιπες κατηγορίες ασκήσεων αέρος και κατηγορίες F/S.",
  };
  const SRC = {
    "fail-08": "3-01 §30δ(1)", "fail-09": "3-01 §30δ(2)", "fail-10": "3-01 §30ε",
    "fail-11": "3-01 §30στ", "fail-12": "3-01 §30ζ", "fail-16": "ΠΔ 29/2020 αρ.3 §1β · 3-01 §58β",
    "fail-17": "3-01 §22ζ-θ", "fail-19": "3-01 §56", "fail-45": "3-01 §32γ",
  };
  const vb = (id) => REQ[id] || "";

  /* ── special out-of-graph sorties (spec §3α list) ─────────────────────── */
  const SPECIAL = {
    dp_ae:  { label: "Progress Test (AE)",       short: "DP-AE",  evaluator: true },
    dp_cdr: { label: "Progress Test (Sq Cdr)",   short: "DP-CDR", evaluator: true },
    apt:    { label: "Aptitude Exam (Ex. Katallilotitas)", short: "APT", evaluator: true },
    board:  { label: "Board Flight (krisi)",     short: "BOARD",  evaluator: false },
  };
  const CATS = ["contact", "instrument", "formation", "vfr_navigation"];
  const CAT_LABEL = { contact: "Contact", instrument: "Instrument", formation: "Formation", vfr_navigation: "VFR Navigation" };

  /* fail-45 caps per Στάδιο — 2× ground exams, 2× ΠΡΟΣΑΡΜΟΓΗ (contact),
     1× per other air / F-S category */
  const smsMax = (cat) => (cat === "ground_exam" || cat === "ground_exams" ? 2 : (cat === "contact" || cat === "adaptation") ? 2 : 1);
  const smsCatLabel = (cat) => (cat === "ground_exam" || cat === "ground_exams") ? "ground exams"
    : cat === "adaptation" ? "Adaptation (contact)" : (CAT_LABEL[cat] || cat || "");

  /* ── caches ───────────────────────────────────────────────────────────── */
  const cache = new Map();
  let LASTSET = null;
  function invalidate() { cache.clear(); }
  const wire = () => {
    if (window.SchedStore && !window.SchedStore._consqWired) {
      window.SchedStore._consqWired = true;
      window.SchedStore.subscribe(invalidate);
    }
  };
  wire(); setTimeout(wire, 0);

  function lastSet() {
    if (LASTSET && LASTSET.size) return LASTSET;
    const s = new Set();
    for (const k of ["fs", "flights"]) for (const sec of R().sections(k)) {
      if (sec.uids.length) s.add(sec.uids[sec.uids.length - 1]);
    }
    if (s.size) LASTSET = s;                        // don't cache pre-load emptiness
    return s;
  }

  /* ── event normalisation ──────────────────────────────────────────────── */
  const evDate = (ev) => ev.end_date || ev.date || "";
  /* completed | lag | fail — legacy "repeat" reads as lag; a scored flight
     0-59 % counts as fail (fail-16 threshold). */
  function normRes(ev) {
    const r = String(ev.result || "completed").toLowerCase();
    if (r === "repeat" || r === "lag") return "lag";
    if (r === "fail") return "fail";
    if (r === "score") {
      const sc = Number(ev.score);
      return !isNaN(sc) && sc <= 59 ? "fail" : "completed";
    }
    return "completed";
  }
  const evKind = (ev) => (ev.special ? (ev.kind || "flights") : R().kindOf(ev.node || ev.uid || ""));

  /* every flying event (flights + F/S + special) of one student, in time order */
  function flightEvents(code) {
    const out = [];
    (S().get("trainingLog") || []).forEach((ev, i) => {
      if (ev.scope !== "student" || ev.student !== code) return;
      const kind = evKind(ev);
      if (kind !== "flights" && kind !== "fs") return;
      out.push({ ev: ev, i: i, uid: ev.node || ev.uid || "", kind: kind, date: evDate(ev), res: normRes(ev), special: ev.special || "" });
    });
    out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.i - b.i));
    return out;
  }

  /* per-sortie minutes — same derivation the board uses (schedboard missionMin) */
  const FALLBACK_MIN = 70;
  function minutesOf(x) {
    if (!x.uid) return FALLBACK_MIN;
    const n = R().node(x.uid);
    if (!n) return FALLBACK_MIN;
    if (n.hours != null) return n.hours * 60;
    const g = n.group ? R().node("g:" + n.group) : null;
    if (g) {
      if (g.hours_per_sortie != null) return g.hours_per_sortie * 60;
      if (g.hours_total != null) {
        let k = 0;
        for (const sec of R().sections(x.kind)) if (sec.id === n.group) k = sec.uids.length;
        return (g.hours_total * 60) / (k || 1);
      }
    }
    return FALLBACK_MIN;
  }

  /* flow-position helpers (current state — only the latest blocks matter) */
  function nextPendingOfTrack(code, track, kind, afterUid) {
    const stt = R().state(code);
    const after = afterUid ? R().rank(afterUid) : -1;
    for (const u of R().nodes(kind)) {
      if (R().rank(u) <= after) continue;
      const d = R().describe(u);
      if (!d || d.track !== track) continue;
      if ((stt[u] || {}).status !== "completed") return u;
    }
    return null;
  }
  /* fail-09: an unexecuted F/S sits (by flow order) between the failed A/C
     sortie and the next unexecuted A/C sortie of the same category */
  function interveningFs(code, failedUid, track) {
    const nf = nextPendingOfTrack(code, track, "flights", failedUid);
    const fsU = nextPendingOfTrack(code, track, "fs", failedUid);
    if (!fsU) return false;
    return nf == null || R().rank(fsU) < R().rank(nf);
  }
  /* fail-08 exception list: evaluation / solo-evaluation / progress test /
     aptitude exam next (airsickness habituation is not modelled in the graph) */
  function nextIsExam(code, track, failedUid, aptOpenForTrack) {
    if (aptOpenForTrack) return true;
    const nf = nextPendingOfTrack(code, track, "flights", failedUid);
    if (!nf) return false;
    const d = R().describe(nf);
    return !!(d && (d.checkride || d.first_solo));
  }

  /* ── THE WALK ─────────────────────────────────────────────────────────── */
  function analyze(code) {
    if (cache.has(code)) return cache.get(code);
    const evs = flightEvents(code);
    const isLast = lastSet();

    let pd = null;                       // { stage, since, boardSince, srcUid, srcLabel, failIp, req }
    let pdNote = null;                   // { avoidIp, since } — after a passed progress test
    const apt = [];                      // [{category, since, srcUid, srcLabel, req, solo, resolved}]
    const skip = new Set();              // uids never re-offered (fail-19 first solo)
    const virtual = new Set();           // uids treated as done once the apt passed
    const ladders = new Map();           // fs-final uid -> {uid,fails,since,eligible,maneuvers,srcLabel}
    let activeLadder = null;
    const blocks = [];                   // [{date, category, flt, fs, req, maneuvers, srcLabel}]
    const repeat = {};                   // track -> {maneuvers, kind, date, srcLabel}
    const catACFails = {};               // track -> count of A/C lag/fail so far (specific-vs-general)

    for (const x of evs) {
      const ev = x.ev, res = x.res, date = x.date, kind = x.kind;
      const man = String(ev.maneuvers || "").trim();

      /* ── special out-of-graph sorties ── */
      if (x.special) {
        const sp = x.special;
        if (sp === "apt") {
          if (res === "completed") {
            for (const a of apt) {
              if (a.resolved) continue;
              if (!ev.category || !a.category || a.category === ev.category) {
                a.resolved = true;
                if (a.solo) virtual.add(a.srcUid);
              }
            }
          } else if (!pd) {
            /* an apt lag/fail sets the ΠΔ 29/2020 flag (fail-12 / fail-19 path) */
            pd = { stage: "ae", since: date, boardSince: "", srcUid: "", failIp: ev.instructor || "", req: "fail-12",
                   srcLabel: SPECIAL.apt.label + (ev.category ? " · " + (CAT_LABEL[ev.category] || ev.category) : "") };
          }
        } else if (sp === "dp_ae") {
          if (pd && pd.stage === "ae") {
            if (res === "completed") { pdNote = { avoidIp: pd.failIp || "", since: date }; pd = null; }
            else pd.stage = "cdr";
          }
        } else if (sp === "dp_cdr") {
          if (pd && (pd.stage === "cdr" || pd.stage === "ae")) {
            if (res === "completed") { pdNote = { avoidIp: pd.failIp || "", since: date }; pd = null; }
            else { pd.stage = "board"; pd.boardSince = date; }
          }
        } else if (sp === "board") {
          if (pd) {
            if (res === "completed") { pdNote = { avoidIp: pd.failIp || "", since: date }; pd = null; }
            else pd.stage = "stopped";
          }
        }
        continue;
      }

      /* ── graph sorties ── */
      const d = R().describe(x.uid);
      if (!d) continue;

      if (res === "completed") {
        if (activeLadder && activeLadder.uid === x.uid) { ladders.delete(x.uid); activeLadder = null; }
        if (repeat[d.track] && repeat[d.track].kind === kind) delete repeat[d.track];
        continue;
      }

      /* lag / fail from here on */
      if (d.checkride && res === "fail") {
        /* C3 — fail-16: PD 29/2020, zero repeats in Phase II */
        pd = { stage: "ae", since: date, boardSince: "", srcUid: x.uid, srcLabel: d.label,
               failIp: ev.instructor || "", req: "fail-16" };
        if (kind === "flights") catACFails[d.track] = (catACFails[d.track] || 0) + 1;
        continue;
      }
      repeat[d.track] = { maneuvers: man, kind: kind, date: date, srcLabel: d.label };

      if (d.first_solo) {
        /* C2 — fail-19: apt pending, the ΜΟΝΟΣ itself is never re-offered */
        apt.push({ category: d.track, since: date, srcUid: x.uid, srcLabel: d.label, req: "fail-19", solo: true, resolved: false });
        skip.add(x.uid);
        blocks.push({ date: date, category: d.track, flt: addWork(date, 1), fs: addWork(date, 1), req: "fail-19", maneuvers: man, srcLabel: d.label });
        catACFails[d.track] = (catACFails[d.track] || 0) + 1;
        continue;
      }

      const final = isLast.has(x.uid);
      if (final && kind === "flights") {
        /* C2 — fail-12: apt exam pending; next sortie IS an exam → next working day */
        apt.push({ category: d.track, since: date, srcUid: x.uid, srcLabel: d.label, req: "fail-12", solo: false, resolved: false });
        blocks.push({ date: date, category: d.track, flt: addWork(date, 1), fs: addWork(date, 1), req: "fail-10", maneuvers: man, srcLabel: d.label });
        catACFails[d.track] = (catACFails[d.track] || 0) + 1;
        continue;
      }
      if (final && kind === "fs") {
        /* C2 — fail-11: the 3-attempt ladder */
        let L = ladders.get(x.uid) || { uid: x.uid, fails: 0, srcLabel: d.label };
        L.fails += 1; L.since = date; L.maneuvers = man;
        ladders.set(x.uid, L);
        activeLadder = L;
        if (L.fails >= 3) {
          pd = { stage: "ae", since: date, boardSince: "", srcUid: x.uid, srcLabel: d.label + " (3rd F/S fail)",
                 failIp: ev.instructor || "", req: "fail-11" };
          ladders.delete(x.uid); activeLadder = null;
        } else {
          /* 1st fail → immediate repeat next working day; 2nd → ≥2 clear
             calendar days (day of failure excluded) → earliest failure+3 */
          L.eligible = L.fails === 1 ? addWork(date, 1) : addCal(date, 3);
          blocks.push({ date: date, category: d.track, flt: addWork(date, 1), fs: L.eligible, req: "fail-11", maneuvers: man, srcLabel: d.label });
        }
        continue;
      }

      /* C1 — simple sortie: SPECIFIC (fail-08) beats GENERAL (fail-10) */
      const firstAC = kind === "flights" && !(catACFails[d.track] > 0);
      if (kind === "flights") catACFails[d.track] = (catACFails[d.track] || 0) + 1;
      let flt, fsD, req;
      if (firstAC) {
        req = "fail-08";
        flt = addWork(date, 2); fsD = addWork(date, 2);
        const aptOpen = apt.some((a) => !a.resolved && a.category === d.track);
        if (interveningFs(code, x.uid, d.track)) { fsD = addWork(date, 1); req = "fail-09"; }
        if (nextIsExam(code, d.track, x.uid, aptOpen)) { flt = addWork(date, 1); if (fsD > addWork(date, 1)) fsD = addWork(date, 1); }
      } else {
        req = "fail-10";
        flt = addWork(date, 1); fsD = addWork(date, 1);
      }
      blocks.push({ date: date, category: d.track, flt: flt, fs: fsD, req: req, maneuvers: man, srcLabel: d.label });
    }

    /* board-stage resolution through the gates UI */
    if (pd && pd.stage === "board") {
      const since = pd.boardSince || pd.since;
      const gs = (S().get("gates") || [])
        .filter((g) => g.student === code && /referral|board/i.test(String(g.type || "")) && (g.date || "") >= since)
        .sort((a, b) => ((a.date || "") < (b.date || "") ? -1 : 1));
      const last = gs.length ? gs[gs.length - 1] : null;
      if (last) {
        const o = String(last.outcome || "").toLowerCase();
        if (o === "continue") { pdNote = { avoidIp: pd.failIp || "", since: last.date || "" }; pd = null; }
        else if (o === "stop") pd.stage = "stopped";
      }
    }

    /* C5 — SMS entry counter (fail-45), display only */
    const smsBag = new Map();
    for (const g of (S().get("gates") || [])) {
      if (g.student !== code) continue;
      const t = String(g.type || "").toLowerCase();
      if (!/kepe(_entry|_in)?$|^kepe/.test(t)) continue;
      const cat = String(g.category || "").toLowerCase();
      smsBag.set(cat, (smsBag.get(cat) || 0) + 1);
    }
    const sms = [];
    smsBag.forEach((n, cat) => {
      const max = cat ? smsMax(cat) : null;
      sms.push({ category: cat, label: smsCatLabel(cat) || "uncategorised", count: n, max: max, exhausted: max != null && n >= max });
    });

    const aptOpen = apt.filter((a) => !a.resolved);
    const out = {
      pd: pd, pdNote: pdNote,
      apt: aptOpen,
      lockedTracks: new Set(aptOpen.map((a) => a.category)),
      skipUids: skip,
      virtualDone: virtual,
      fsLadder: activeLadder,
      blocks: blocks,
      repeat: repeat,
      sms: sms,
      smsExhausted: sms.filter((x) => x.exhausted),
    };
    cache.set(code, out);
    return out;
  }

  /* ── public queries ───────────────────────────────────────────────────── */
  const pdOf = (code) => analyze(code).pd;
  function pdStageText(pd) {
    if (!pd) return "";
    if (pd.stage === "ae") return "next: Progress Test (AE) — record a dp_ae special sortie";
    if (pd.stage === "cdr") return "next: Progress Test (Sq Cdr) — record a dp_cdr special sortie";
    if (pd.stage === "board") return "next: Flight Aptitude Board — record the outcome in the Progress editor";
    if (pd.stage === "stopped") return "board outcome STOP — training stopped";
    return "";
  }

  /* the strictest still-active day-block for `kind` on `date` — null if free */
  function dayBlock(code, date, kind) {
    const a = analyze(code);
    let best = null;
    for (const b of a.blocks) {
      if (b.date > date) continue;                      // future fixture — ignore
      const until = kind === "fs" ? b.fs : b.flt;
      if (until > date && (!best || until > (kind === "fs" ? best.fs : best.flt))) best = b;
    }
    if (kind === "fs" && a.fsLadder && a.fsLadder.eligible > date) {
      if (!best || a.fsLadder.eligible > best.fs) {
        best = { date: a.fsLadder.since, category: "", flt: a.fsLadder.eligible, fs: a.fsLadder.eligible,
                 req: "fail-11", maneuvers: a.fsLadder.maneuvers, srcLabel: a.fsLadder.srcLabel };
      }
    }
    if (!best) return null;
    const until = kind === "fs" ? best.fs : best.flt;
    return { until: until, untilPretty: fmtDay(until), req: best.req, vb: vb(best.req), src: SRC[best.req] || "",
             since: best.date, srcLabel: best.srcLabel || "", maneuvers: best.maneuvers || "" };
  }

  /* compact status for pickers / the not-scheduled panel */
  function status(code, date) {
    const a = analyze(code);
    const out = { pd: a.pd, pdText: pdStageText(a.pd), blockedFlights: false, blockedFs: false,
                  untilFlights: "", untilFs: "", req: "", smsExhausted: a.smsExhausted, apt: a.apt };
    if (a.pd) return out;
    const bf = dayBlock(code, date, "flights");
    const bs = dayBlock(code, date, "fs");
    if (bf) { out.blockedFlights = true; out.untilFlights = bf.until; out.req = bf.req; }
    if (bs) { out.blockedFs = true; out.untilFs = bs.until; if (!out.req) out.req = bs.req; }
    return out;
  }

  /* "repeat: <maneuvers>" chip for a readiness option (fail-10 repetition) */
  function repeatNoteFor(code, uid) {
    const d = R().describe(uid);
    if (!d) return "";
    const r = analyze(code).repeat[d.track];
    if (!r || !r.maneuvers) return "";
    if (r.kind !== d.kind) return "";
    return "repeat: " + r.maneuvers;
  }

  /* C4 — fail-17 pre-exam prerequisites, evaluated for a board date */
  function preExam(code, date) {
    const out = [];
    const from = addCal(date, -20);
    let mins = 0, lastF = "";
    for (const x of flightEvents(code)) {
      if (x.kind !== "flights") continue;
      if (x.date >= date) continue;
      if (x.date >= from) mins += minutesOf(x);
      lastF = later(lastF, x.date);
    }
    const hours = mins / 60;
    if (hours < 4) {
      out.push({ sev: "hard", req: "fail-17", vb: vb("fail-17"),
        text: "only " + hours.toFixed(1) + " h flown in the last 20 days (min 4.0 h) — REPETITION sorties needed first (fail-17)" });
    }
    const gap = lastF ? (dnum(date) - dnum(lastF)) : null;
    if (gap == null) {
      out.push({ sev: "hard", req: "fail-17", vb: vb("fail-17b"),
        text: "no flight ever recorded — 1 REPETITION sortie required first (fail-17)" });
    } else if (gap >= 5) {
      out.push({ sev: "hard", req: "fail-17", vb: vb("fail-17b"),
        text: gap + " calendar days since the last flight (" + lastF + ") — 1 REPETITION sortie required first (fail-17)" });
    }
    return out;
  }

  window.SchedConsq = {
    REQ: REQ, SRC: SRC, SPECIAL: SPECIAL, CATS: CATS, CAT_LABEL: CAT_LABEL,
    analyze: analyze, invalidate: invalidate,
    pd: pdOf, pdStageText: pdStageText,
    pdNote: (code) => analyze(code).pdNote,
    aptPending: (code) => analyze(code).apt,
    lockedTracks: (code) => analyze(code).lockedTracks,
    skipUids: (code) => analyze(code).skipUids,
    virtualDone: (code) => analyze(code).virtualDone,
    fsLadder: (code) => analyze(code).fsLadder,
    smsStatus: (code) => analyze(code).sms,
    smsExhausted: (code) => analyze(code).smsExhausted,
    dayBlock: dayBlock, status: status, preExam: preExam, repeatNoteFor: repeatNoteFor,
    normRes: normRes, evKind: evKind, fmtDay: fmtDay, vb: vb,
  };
})();
