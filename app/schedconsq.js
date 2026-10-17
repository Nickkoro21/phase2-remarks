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
    /* Round 6 — the Progress-editor counters cite these */
    "fail-01": "«ΣΚ» Σχεδόν Καλώς (Βαθμολογία 50%-59%) [=ΥΣΤΕΡΗΣΗ] · «Ε» ΑΠΟΤΥΧΩΝ (Βαθμολογία 0%-49%) [=ΑΠΟΤΥΧΙΑ]",
    "fail-36": "αποτυγχάνει σε τέσσερις (4) συνεχόμενες ή οκτώ (8) μη συνεχόμενες… προφορικές εξετάσεις… προ πτήσεως ενημέρωση",
    "fail-38": "να επανεξετάζεται μετά από 2 ημερολογιακές ημέρες… Σε περίπτωση νέας ΑΠΟΤΥΧΙΑΣ, να εφαρμόζεται το ΠΔ 29/2020.",
    "fail-39": "εξετάζεται από τον ΑΕ της Μοίρας… ΕΠΙΤΥΧΩΝ, συνεχίζει τις πτήσεις· ΑΠΟΤΥΧΩΝ, παραπέμπεται στο Συμβούλιο Πτητικής Ικανότητας",
    "fail-76": "μετά τις τέσσερις (4) πρώτες εξόδους… σε δύο (2) συνεχόμενες πτήσεις… 0-49% ή σε τρεις (3) συνεχόμενες… 0-59%",
    "fail-77": "στο σαράντα τοις εκατό (40%) και άνω των πτήσεων της Προ ΜΟΝΟΣ φάσης ή στο είκοσι τοις εκατό (20%)… 0% έως 59%",
    "fail-83": "τα Φύλλα μη Πτήσης (ΦΜΠ) μετά από ΑΠΟΤΥΧΙΑ του μαθητή σε γραπτή ή προφορική εξέταση (έντυπο Α0473)",
  };
  const SRC = {
    "fail-08": "3-01 §30δ(1)", "fail-09": "3-01 §30δ(2)", "fail-10": "3-01 §30ε",
    "fail-11": "3-01 §30στ", "fail-12": "3-01 §30ζ", "fail-16": "ΠΔ 29/2020 αρ.3 §1β · 3-01 §58β",
    "fail-17": "3-01 §22ζ-θ", "fail-19": "3-01 §56", "fail-45": "3-01 §32γ",
    "fail-01": "3-01 §29 · ΠΔ 151/13", "fail-36": "ΠΔ 29/2020 αρ.3 §1ζ · 3-01 §58ζ",
    "fail-38": "3-01 §58η", "fail-39": "ΠΔ 29/2020 αρ.3 §4",
    "fail-76": "ΠΔ 29/2020 αρ.3 §1γ · 3-01 §58γ", "fail-77": "ΠΔ 29/2020 αρ.3 §1δ · 3-01 §58δ",
    "fail-83": "3-01 §11 · ΚΕΦ.9",
  };
  const vb = (id) => REQ[id] || "";

  /* ── special out-of-graph sorties (spec §3α list) ─────────────────────── */
  const SPECIAL = {
    dp_ae:  { label: "Progress Test (AE)",       short: "DP-AE",  evaluator: true },
    dp_cdr: { label: "Progress Test (Sq Cdr)",   short: "DP-CDR", evaluator: true },
    apt:    { label: "Aptitude Exam (Ex. Katallilotitas)", short: "APT", evaluator: true },
    board:  { label: "Board Flight (krisi)",     short: "BOARD",  evaluator: false },
    /* Board trees (specs/board-trees-spec.md §4) — an EXPLICIT ΠΔ 29/2020
       referral record. It opens the one ladder below at the rung the recorder
       names: `stage:"ae"` (παρ.3 — Δοκιμή Προόδου ΑΕ) or `stage:"board"`
       (παρ.5 — 1στ/1η/1θ/1ι go straight to the Board). It is not a flight. */
    referral: { label: "ΠΔ 29/2020 referral (κρίση)", short: "REF", evaluator: false },
  };
  const CATS = ["contact", "instrument", "formation", "vfr_navigation"];
  const CAT_LABEL = { contact: "Contact", instrument: "Instrument", formation: "Formation", vfr_navigation: "VFR Navigation" };

  /* fail-45 caps per Στάδιο — 2× ground exams, 2× ΠΡΟΣΑΡΜΟΓΗ (contact),
     1× per other air / F-S category */
  const smsMax = (cat) => (cat === "ground_exam" || cat === "ground_exams" || cat === "oral" || cat === "written" ? 2 : (cat === "contact" || cat === "adaptation") ? 2 : 1);
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
  /* Board trees (specs/board-trees-spec.md §4): the walk is PURE. It reads the
     normalised events it is handed and asks the context — never the store or
     the graph — for the five things it needs. liveCtx(code) binds those to
     SchedStore/SchedReady for the Scheduler; the Board-trees sandbox and the
     headless fixtures bind them to synthetic data. ONE ladder, two feeders. */
  function liveCtx(code) {
    return {
      isLast: lastSet(),
      describe: (uid) => R().describe(uid),
      interveningFs: (uid, track) => interveningFs(code, uid, track),
      nextIsExam: (track, uid, aptOpen) => nextIsExam(code, track, uid, aptOpen),
      boardGates: (since) => (S().get("gates") || [])
        .filter((g) => g.student === code && /referral|board/i.test(String(g.type || "")) && (g.date || "") >= since),
      kepeGates: () => (S().get("gates") || []).filter((g) => g.student === code),
    };
  }
  function analyze(code) {
    if (cache.has(code)) return cache.get(code);
    const out = walk(flightEvents(code), liveCtx(code));
    cache.set(code, out);
    return out;
  }
  function walk(evs, ctx) {
    const isLast = ctx.isLast || new Set();

    let pd = null;                       // { stage, since, boardSince, srcUid, srcLabel, failIp, req, medium }
    let pdNote = null;                   // { avoidIp, since } — after a passed progress test
    const apt = [];                      // [{category, since, srcUid, srcLabel, req, solo, resolved}]
    const skip = new Set();              // uids never re-offered (fail-19 first solo)
    const virtual = new Set();           // uids treated as done once the apt passed
    const ladders = new Map();           // fs-final uid -> {uid,fails,since,eligible,maneuvers,srcLabel}
    let activeLadder = null;
    const blocks = [];                   // [{date, category, flt, fs, req, maneuvers, srcLabel}]
    const repeat = {};                   // track -> {maneuvers, kind, date, srcLabel}
    const catACFails = {};               // track -> count of A/C lag/fail so far (specific-vs-general)

    /* ══ R7 (owner, 2026-10-17) — THE ΠΔ παρ.7 / παρ.9 BUDGET, per ΣΤΑΔΙΟ ══
       «είναι ανά στάδιο, δεν είναι ανά κατηγορία» — one budget for the whole
       Phase II, not one per category. Derived from the events handed in, never
       from the store (the walk stays pure).
         aeUsed    — the ΑΕ's single right (παρ.7 «μόνο μία (1) φορά»), spent
                     whether he passed or failed: occasions of judgment, not
                     failures.
         cdrBudget — 1 if the ΑΕ's Δοκιμή was ≥60 %, 2 if below (παρ.9).
         cdrUsed   — Δκτής occasions flown.
       EVERY new κρίση — 1β, 1γ, 1δ, 1ε, fail-12, fail-19, fail-11, an explicit
       referral — opens at the rung the budget allows: !aeUsed → "ae";
       cdrUsed < cdrBudget → "cdr" (παρ.7 second sentence); else → "board",
       «χωρίς πτήσεις Δοκιμής Προόδου» (παρ.9 last sentence). The rung
       transitions are untouched: a failed dp_ae still moves to cdr, a failed
       dp_cdr still moves to board (παρ.8β — every Δκτής failure ends the
       ladder, so the second Δκτής occasion is reachable only by passing the
       first). A direct referral (παρ.5) and the exceptional Δοκιμή Προόδου of
       παρ.17β bypass the budget. Until this round the sandbox applied this as
       an overlay and the live Scheduler opened every κρίση at "ae"; now there
       is one implementation. */
    const budget = { aeUsed: false, aePassed: false, cdrBudget: 0, cdrUsed: 0 };
    function openPd(base, exceptional) {
      let stage = "ae", rung = "ae";
      if (exceptional) rung = "exceptional";
      else if (!budget.aeUsed) rung = "ae";
      else if (budget.cdrUsed < budget.cdrBudget) { stage = "cdr"; rung = "cdr_par7"; }
      else { stage = "board"; rung = "board_par9"; }
      base.stage = stage; base.rung = rung;
      base.boardSince = stage === "board" ? base.since : "";
      base.rungReq = rung === "cdr_par7" ? ["fail-24", "fail-26"] : rung === "board_par9" ? ["fail-26", "fail-24"] : rung === "exceptional" ? ["fail-70"] : [];
      base.budget = { aeUsed: budget.aeUsed, aePassed: budget.aePassed, cdrBudget: budget.cdrBudget, cdrUsed: budget.cdrUsed };
      return base;
    }

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
            /* an apt lag/fail sets the ΠΔ 29/2020 flag (fail-12 / fail-19 path).
               The Εξέταση Καταλληλότητας is a «πτήση εξέτασης» of the directive
               — 1β in the ΠΔ's own words — and the ladder opens at the rung
               the stage's budget allows (R7): an ΑΕ already spent means the
               Δκτής, not a second ΑΕ test (παρ.7). */
            pd = openPd({ since: date, srcUid: "", failIp: ev.instructor || "", req: "fail-12", medium: "flights",
                   srcLabel: SPECIAL.apt.label + (ev.category ? " · " + (CAT_LABEL[ev.category] || ev.category) : "") });
          }
        } else if (sp === "referral") {
          /* an explicit ΠΔ referral record (board trees): opens the ladder at
             the rung named — "board" (παρ.5 direct) — or, for a Δοκιμή Προόδου
             case, at the rung the budget allows (R7). A ladder already open is
             never re-opened: the first referral owns it. */
          if (!pd) {
            const direct = String(ev.stage || "") === "board";
            const base = { since: date, srcUid: "", failIp: ev.instructor || "", req: ev.req || (direct ? "fail-62" : "fail-23"),
                   medium: kind === "fs" ? "fs" : "flights", srcLabel: ev.label || SPECIAL.referral.label };
            if (direct) { base.stage = "board"; base.rung = "direct"; base.boardSince = date; base.rungReq = ["fail-62"]; base.budget = Object.assign({}, budget); pd = base; }
            else pd = openPd(base, !!ev.exceptional);
          }
        } else if (sp === "dp_ae") {
          /* παρ.7: an occasion of judgment by the ΑΕ — spent pass or fail;
             παρ.9: the grade sets how many Δκτής occasions the stage has */
          budget.aeUsed = true; budget.aePassed = res === "completed"; budget.cdrBudget = res === "completed" ? 1 : 2;
          if (pd && pd.stage === "ae") {
            if (res === "completed") { pdNote = { avoidIp: pd.failIp || "", since: date }; pd = null; }
            else pd.stage = "cdr";
          }
        } else if (sp === "dp_cdr") {
          budget.cdrUsed += 1;
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
      const d = ctx.describe(x.uid);
      if (!d) continue;

      if (res === "completed") {
        if (activeLadder && activeLadder.uid === x.uid) { ladders.delete(x.uid); activeLadder = null; }
        if (repeat[d.track] && repeat[d.track].kind === kind) delete repeat[d.track];
        continue;
      }

      /* lag / fail from here on */
      if (d.checkride) {
        /* C3 — fail-16: PD 29/2020, zero repeats in Phase II. The criterion is
           the whole 0-59 % band — ΥΣΤΕΡΗΣΗ as much as ΑΠΟΤΥΧΙΑ (3-01 §69,
           fail-86: «βαθμολογηθεί με ΥΣΤΕΡΗΣΗ ή ΑΠΟΤΥΧΙΑ, να ακολουθείται η
           προβλεπόμενη διαδικασία από το ΠΔ»). Until the board fixtures
           (tools/fixtures/board, 17/10/2026) this branch required res ===
           "fail", so a checkride recorded as a plain lag fell through as an
           ordinary sortie. */
        pd = openPd({ since: date, srcUid: x.uid, srcLabel: d.label, failIp: ev.instructor || "", req: "fail-16", medium: "flights" });
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
          pd = openPd({ since: date, srcUid: x.uid, srcLabel: d.label + " (3rd F/S fail)", failIp: ev.instructor || "", req: "fail-11", medium: "fs" });
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
        if (ctx.interveningFs(x.uid, d.track)) { fsD = addWork(date, 1); req = "fail-09"; }
        if (ctx.nextIsExam(d.track, x.uid, aptOpen)) { flt = addWork(date, 1); if (fsD > addWork(date, 1)) fsD = addWork(date, 1); }
      } else {
        req = "fail-10";
        flt = addWork(date, 1); fsD = addWork(date, 1);
      }
      blocks.push({ date: date, category: d.track, flt: flt, fs: fsD, req: req, maneuvers: man, srcLabel: d.label });
    }

    /* board-stage resolution through the gates UI */
    if (pd && pd.stage === "board") {
      const since = pd.boardSince || pd.since;
      const gs = (ctx.boardGates ? ctx.boardGates(since) : [])
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
    for (const g of (ctx.kepeGates ? ctx.kepeGates() : [])) {
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
      budget: budget,                   // R7 — the παρ.7/9 budget of the stage, as it stands now
    };
    return out;
  }

  /* ── public queries ───────────────────────────────────────────────────── */
  const pdOf = (code) => analyze(code).pd;
  function pdStageText(pd) {
    if (!pd) return "";
    if (pd.stage === "ae") return "next: Progress Test (AE) — record a dp_ae special sortie";
    if (pd.stage === "cdr") return "next: Progress Test (Sq Cdr) — record a dp_cdr special sortie" + (pd.rung === "cdr_par7" ? " (the AE already judged this stage — ΠΔ αρ.3 §7)" : "");
    if (pd.stage === "board") return "next: Flight Aptitude Board — record the outcome in the Progress editor" + (pd.rung === "board_par9" ? " (progress tests exhausted — ΠΔ αρ.3 §9, χωρίς πτήσεις Δοκιμής Προόδου)" : "");
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
        text: gap + " calendar days since the last flight (" + (window.fmtDMY ? window.fmtDMY(lastF) : lastF) + ") — 1 REPETITION sortie required first (fail-17)" });
    }
    return out;
  }

  /* ══ Round 6 — CUMULATIVE COUNTERS for the Progress editor ═══════════════
     Band mapping (fail-01, documented): with a score, 0-49 = ΑΠΟΤΥΧΙΑ band,
     50-59 = ΣΧΕΔΟΝ ΚΑΛΩΣ (ΥΣΤΕΡΗΣΗ) band, ≥60 clears. WITHOUT a score the
     recorded result maps onto the bands: fail → 0-49, lag/repeat → 50-59
     (the ALMOST-GOOD band), completed → clears. Special sorties (dp/apt/
     board) are excluded from every cumulative count (3-01 §43 excludes the
     evaluation/ΑΔΕ flights from the referral counting — fail-88 note).     */
  function bandOf(ev) {
    const r = String(ev.result || "completed").toLowerCase();
    if (r === "score") {
      const sc = Number(ev.score);
      if (isNaN(sc)) return "pass";
      return sc <= 49 ? "fail" : sc <= 59 ? "lag" : "pass";
    }
    if (r === "fail") return "fail";
    if (r === "lag" || r === "repeat") return "lag";
    return "pass";
  }
  /* trailing (= CURRENT) consecutive run of `pred` at the end of the list */
  function trailStreak(list, pred) {
    let n = 0;
    for (let i = list.length - 1; i >= 0; i--) { if (pred(list[i])) n++; else break; }
    return n;
  }
  /* Board trees (specs/board-trees-spec.md §4): countersFrom() is PURE — it
     counts whatever normalised lists it is handed. counters(code) collects the
     live student's lists from the store and hands them over; the sandbox and
     the fixtures hand over synthetic ones. The thresholds live HERE and only
     here: 4 grace / 2×0-49 / 3×0-59 (fail-76), 40 % / 20 % (fail-77),
     3 grace / 3×0-59 / 20 % & ≥3 on the F/S (fail-40), 2 written (fail-32),
     4 / 8 oral (fail-36). `exemptIf(x)` is the ΠΔ άρθρο 3 παρ.2 hook
     (fail-57): a flight it returns true for is NOT counted toward 1γ/1δ. The
     live Scheduler passes no predicate today, so nothing changes there.   */
  function countersFrom(inp) {
    const passPct = Number(inp.passPct) > 0 ? Number(inp.passPct) : 80;
    const describe = inp.describe || (() => null);
    const exemptIf = inp.exemptIf || (() => false);
    const isSoloDone = inp.isSoloDone || ((x) => x.uid === "s:C4791" && x.res === "completed");
    const withBand = (x) => {
      const b = bandOf(x.ev);
      const d = describe(x.uid);
      return { date: x.date, label: d ? d.label : x.uid,
        detail: (b === "fail" ? "FAIL band 0-49" : b === "lag" ? "LAG band 50-59" : "PASS")
          + (x.ev.result === "score" && x.ev.score != null ? " · " + x.ev.score + "%" : "") };
    };

    /* flying events of the GRAPH (flights + F/S), chronological, no specials */
    const fly = (inp.fly || []).filter((x) => !x.special);
    const lagEvs = fly.filter((x) => bandOf(x.ev) === "lag");
    const failEvs = fly.filter((x) => bandOf(x.ev) === "fail");
    const lag = { total: lagEvs.length, streak: trailStreak(fly, (x) => bandOf(x.ev) === "lag"), events: lagEvs.map(withBand) };
    const fail = { total: failEvs.length, streak: trailStreak(fly, (x) => bandOf(x.ev) === "fail"), events: failEvs.map(withBand) };

    /* ΠΔ 1γ (fail-76) — A/C flights only; the 4 FIRST sorties of the stage
       are the grace window and never count toward the streaks. Flights the
       παρ.2 nausea exemption covers (fail-57) are left out of the sequence —
       "δεν υπολογίζονται" is read as "skipped", not as "break the run"; the
       sources do not say which (fail-76 flag), and the spec records it. */
    const ac = fly.filter((x) => x.kind === "flights");
    /* R4 (owner, 2026-10-17): an Αξιολόγηση (checkride) is NOT a member of the
       1γ run. A sub-60 checkride is already 1β — it opens the ΠΔ ladder, which
       is a barrier, and is consumed by its own provision when the ΑΕ clears it.
       Counting it again inside 1γ books one event into two ladders: with the
       Δοκιμή Προόδου (a special) filtered out, «checkride 45 → dp_ae → flight
       45» read as two consecutive 0-49. «δεν μπορεί να ενεργοποιηθεί το 1γ με
       αξιολόγηση, γιατί έχουμε μπει στη διαδικασία της δοκιμής προόδου». The
       checkride still occupies its slot in the 4-sortie grace window, and still
       counts in 1δ (it genuinely is a 0-59 flight of the stage). */
    const isCkr = (x) => { const d = describe(x.uid); return !!(d && d.checkride); };
    const acEff = ac.slice(4).filter((x) => !exemptIf(x) && !isCkr(x));
    const s049 = trailStreak(acEff, (x) => bandOf(x.ev) === "fail");
    const s059 = trailStreak(acEff, (x) => bandOf(x.ev) !== "pass");
    const c049 = { value: s049, limit: 2, events: acEff.slice(acEff.length - s049).map(withBand) };
    const c059 = { value: s059, limit: 3, events: acEff.slice(acEff.length - s059).map(withBand) };

    /* ΠΔ 1δ (fail-77) — % of EXECUTED A/C flights graded 0-59; pre-solo =
       the flights flown before the first completed C4791 («ΠΡΟ ΜΟΝΟΣ»);
       with no solo yet, every flight so far is pre-solo. The denominator is
       the EXECUTED count — the ΠΔ does not say planned or executed (fail-77
       flag); the Progress editor has always read it this way. */
    let soloIx = -1;
    ac.forEach((x, i) => { if (soloIx < 0 && isSoloDone(x)) soloIx = i; });
    const acCnt = ac.filter((x) => !exemptIf(x));
    const pre = (soloIx >= 0 ? ac.slice(0, soloIx) : ac.slice()).filter((x) => !exemptIf(x));
    const badOf = (list) => list.filter((x) => bandOf(x.ev) !== "pass");
    const pctOf = (b, t) => (t ? Math.round((b / t) * 1000) / 10 : 0);
    const preBad = badOf(pre), acBad = badOf(acCnt);
    const preSolo = { bad: preBad.length, total: pre.length, pct: pctOf(preBad.length, pre.length), limitPct: 40, events: preBad.map(withBand), soloDone: soloIx >= 0 };
    const totalFl = { bad: acBad.length, total: acCnt.length, pct: pctOf(acBad.length, acCnt.length), limitPct: 20, events: acBad.map(withBand) };

    /* ΠΔ 1ε (fail-40) — the F/S counters: (αα) after the 3 FIRST F/S sorties
       of the stage, 3 consecutive 0-59; (αβ) 0-59 on 20 % of the stage's F/S
       sorties and never fewer than 3. Same executed-denominator reading as 1δ
       (fail-40 flag: planned vs executed is not said). Not exempted by παρ.2. */
    const fs = fly.filter((x) => x.kind === "fs");
    const fsEff = fs.slice(3);
    const sfs = trailStreak(fsEff, (x) => bandOf(x.ev) !== "pass");
    const fs059 = { value: sfs, limit: 3, grace: 3, events: fsEff.slice(fsEff.length - sfs).map(withBand) };
    const fsBad = badOf(fs);
    const fsCum = { bad: fsBad.length, total: fs.length, pct: pctOf(fsBad.length, fs.length), limitPct: 20, floor: 3, events: fsBad.map(withBand) };

    /* ground exams — WRITTEN failures (fail-32: the 2nd consecutive ⇒ ΠΔ
       άρθρο 3 παρ.5, straight to the Board). fail = result fail or score
       under the pass mark. */
    const exams = (inp.exams || []).slice();
    const exFail = (ev) => ev.result === "fail" || (ev.result === "score" && Number(ev.score) < passPct);
    const wr = exams.filter((x) => exFail(x.ev));
    const written = {
      streak: trailStreak(exams, (x) => exFail(x.ev)), total: wr.length, limit: 2,
      events: wr.map((x) => {
        const d = describe(x.uid);
        return { date: x.date, label: d ? d.label : x.uid,
          detail: x.ev.score != null ? x.ev.score + "% (pass " + passPct + "%)" : "FAIL" };
      }),
    };

    /* NFS (fail-83) + the oral ladder (fail-36/39) counted from the NFS
       records with reason "oral" — with no oral-PASS records to break a run,
       every recorded oral failure counts as consecutive (conservative). */
    const nfsEvs = (inp.nfs || []).slice().sort((a, b) => ((a.date || "") < (b.date || "") ? -1 : 1));
    const NFS_TXT = { written: "written exam failure", oral: "oral exam failure", other: "no-fly — student cause" };
    const nfsItem = (e) => ({ date: e.date || "", label: "NFS — " + (NFS_TXT[e.category] || "unspecified"), detail: e.note || "" });
    const oralEvs = nfsEvs.filter((e) => e.category === "oral");
    const oral = { total: oralEvs.length, limitC: 4, limitT: 8, events: oralEvs.map(nfsItem) };
    const nfs = { total: nfsEvs.length, events: nfsEvs.map(nfsItem) };

    return { lag: lag, fail: fail, c049: c049, c059: c059, preSolo: preSolo, totalFl: totalFl,
      fs059: fs059, fsCum: fsCum, written: written, oral: oral, nfs: nfs };
  }
  function counters(code) {
    const ppRaw = Number(S().cfg("exam_pass_pct", 80));
    const passPct = isNaN(ppRaw) || !ppRaw ? 80 : ppRaw;

    /* exam events reach the student per-student OR via class scope (absent
       students excluded) */
    const exams = [];
    (S().get("trainingLog") || []).forEach((ev, i) => {
      if (evKind(ev) !== "exams") return;
      let hit = false;
      if (ev.scope === "student") hit = ev.student === code;
      else if (ev.scope === "class") {
        const cls = [];
        if (Array.isArray(ev.classes)) for (const c of ev.classes) if (c && cls.indexOf(c) < 0) cls.push(c);
        if (ev.class && cls.indexOf(ev.class) < 0) cls.push(ev.class);
        hit = cls.some((c) => S().membersOf(c).indexOf(code) >= 0)
          && !(ev.absent || []).some((a) => a.student === code);
      }
      if (hit) exams.push({ ev: ev, i: i, date: evDate(ev), uid: ev.node || ev.uid || "" });
    });
    exams.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.i - b.i));
    const nfsEvs = (S().get("trainingLog") || []).filter((e) => e.special === "nfs" && e.student === code);

    const out = countersFrom({ passPct: passPct, describe: (u) => R().describe(u),
      fly: flightEvents(code).filter((x) => !x.special), exams: exams, nfs: nfsEvs });
    out.sms = analyze(code).sms;
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
    /* Round 6 — cumulative counters + the fail-01 band mapping */
    counters: counters, bandOf: bandOf,
    /* Board trees — the PURE seams the sandbox and tools/fixtures/board feed:
       the same walk, the same counters, synthetic events in, no store read. */
    walk: walk, liveCtx: liveCtx, countersFrom: countersFrom, smsMax: smsMax,
    addWork: addWork, addCal: addCal,
  };
})();
