"use strict";
/* boardtrees.js — THE BOARD DECISION TREES (specs/board-trees-spec.md).
 *
 * Three things, one module, inside the Requirements view's «Board Tolerance
 * Matrix» area:
 *   § 1  the MATRIX, rendered properly (allowed_before_board is an OBJECT —
 *        the old table printed «[object Object]»; threshold_verbatim and
 *        sources never reached the screen);
 *   § 2  the TREES — data/requirements/board_decision_trees.json drawn as an
 *        indented outline (the flowchart.js idiom: HTML buttons, data-*,
 *        aria-pressed, fc-b badges, one drawer), every node carrying its
 *        cites[] with verbatim AND explanation;
 *   § 3  the SANDBOX — synthetic events in, verdict out. It NEVER reads the
 *        Scheduler store: the owner ruled «θα είναι τυχαίος για να
 *        το βάζουμε και να το δοκιμάζουμε χωρίς να φέρνει τα πραγματικά
 *        δεδομένα από μαθητές». No name, no call sign, no student number.
 *
 * ONE ENGINE. Every threshold SchedConsq implements is evaluated by calling
 * SchedConsq.walk() / SchedConsq.countersFrom() / SchedConsq.smsMax() on the
 * synthetic events. What SchedConsq does not know (direct-Board cases, the 1ζ
 * exam path, ΠΔ παρ.7/9 allowances, KEPE entry conditions, blind control,
 * stage exam) is DATA in board_decision_trees.json.thresholds and is applied
 * by the thin overlay in evaluate(). Nothing here re-implements a counter.
 *
 * evaluate() is pure (no DOM) so tools/fixtures/board/ can drive it headlessly.
 */
(() => {
  const CQ = () => window.SchedConsq;
  const ESC_MAP = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ESC_MAP[c]);

  const CAT_LABEL = { contact: "Προσαρμογή", instrument: "Όργανα", formation: "Σχηματισμός", vfr_navigation: "Ναυτιλία" };
  const CATS = ["contact", "instrument", "formation", "vfr_navigation"];
  const EV_LABEL = {
    flight: "Πτήση Α/Φ", fs: "Έξοδος F/S", dp_ae: "Δοκιμή Προόδου ΑΕ", dp_cdr: "Δοκιμή Προόδου Δκτή",
    apt: "Εξέταση Καταλληλότητας", board: "Συμβούλιο — απόφαση", practice: "Πτήση εξάσκησης (μετά ΥΠΕΡ)",
    cdr_decision: "Απόφαση Δκτή μετά την εξάσκηση", written: "Γραπτή εξέταση εδάφους", oral: "Προφορική εξέταση (ενημέρωση)",
    ae_written: "Γραπτή εξέταση ΑΕ (1ζ)", blind: "Blind control (πριν C4790)", stage_exam: "Εξέταση τέλους Σταδίου (Αξ. Διοίκησης)",
    incident: "Περιστατικό", kepe_in: "Εισήγηση Εκπαιδευτή για ΚΕΠΕ", kepe_exit: "Έξοδος από ΚΕΠΕ",
  };
  const INC_LABEL = { "1a": "1α — επικίνδυνος χειρισμός (όχι απειθαρχία)", "1h": "1η — απειθαρχία σε πτήση", "1th": "1θ — έγγραφη απαρέσκεια", "1i": "1ι — ουσίες", "1ia": "1ια — ατύχημα με πόρισμα ΕΔΕ" };
  const RES_LABEL = { pass: "ΕΠΙΤΥΧΩΝ", lag: "ΥΣΤΕΡΗΣΗ (50-59%)", fail: "ΑΠΟΤΥΧΙΑ (0-49%)", score: "Βαθμός %", continue: "ΥΠΕΡ της συνέχισης", stop: "ΚΑΤΑ της συνέχισης", refer: "Εκ νέου παραπομπή (κατ' εξαίρεση ΔΠ)" };
  const ROLE_LABEL = { normal: "Κανονική", last: "Τελευταία ενότητας", checkride: "Αξιολόγηση (checkride)", first_solo: "Πρώτη ΜΟΝΟΣ" };

  /* ══════════════════════════════════════════════════════════════════════════
     § 0  DATA — the trees file, loaded once; a cite index by requirement id
     ══════════════════════════════════════════════════════════════════════════ */
  let DATA = null, DATA_P = null;
  const CITES = new Map();        // requirement_id -> { file, page_pdf, ref, verbatim, uses: [{tree, node, explanation}] }
  function indexData(d) {
    DATA = d;
    CITES.clear();
    for (const t of d.trees || []) for (const n of t.nodes || []) for (const c of n.cites || []) {
      let r = CITES.get(c.requirement_id);
      if (!r) { r = { id: c.requirement_id, file: c.file, page_pdf: c.page_pdf, ref: c.ref, verbatim: c.verbatim, uses: [] }; CITES.set(c.requirement_id, r); }
      r.uses.push({ tree: t.id, treeTitle: t.short || t.title, node: n.id, nodeLabel: n.label, explanation: c.explanation });
    }
    if (d.lettering && d.lettering.cite) {
      const c = d.lettering.cite;
      if (!CITES.has(c.requirement_id)) CITES.set(c.requirement_id, { id: c.requirement_id, file: c.file, page_pdf: c.page_pdf, ref: c.ref, verbatim: c.verbatim, uses: [] });
      CITES.get(c.requirement_id).uses.push({ tree: "lettering", treeTitle: "Αρίθμηση", node: "", nodeLabel: "", explanation: c.explanation });
    }
    return d;
  }
  function load() {
    if (DATA) return Promise.resolve(DATA);
    if (DATA_P) return DATA_P;
    DATA_P = fetch("../data/requirements/board_decision_trees.json", { cache: "no-store" })
      .then((r) => r.json()).then(indexData);
    return DATA_P;
  }
  const setData = (d) => indexData(d);      // headless injection (fixtures)
  const citeOf = (id) => CITES.get(id) || null;
  const nodeOf = (id) => { for (const t of (DATA && DATA.trees) || []) for (const n of t.nodes) if (n.id === id) return { tree: t, node: n }; return null; };

  /* ══════════════════════════════════════════════════════════════════════════
     § 3a  THE SANDBOX EVALUATOR — pure
     ──────────────────────────────────────────────────────────────────────────
     events: [{ t, cat, role, res, score, nausea, kind, medium, date, label }]
       t ∈ flight fs dp_ae dp_cdr apt board practice cdr_decision written oral
           ae_written blind stage_exam incident kepe_in kepe_exit
     opts: { denom_1d: "planned"|"executed", start }
     ══════════════════════════════════════════════════════════════════════════ */
  const R = (id, why) => ({ id: id, why: why || "" });
  const bandOfRes = (res, score) => {
    if (res === "score") { const s = Number(score); return isNaN(s) ? "pass" : s <= 49 ? "fail" : s <= 59 ? "lag" : "pass"; }
    return res === "fail" ? "fail" : res === "lag" ? "lag" : "pass";
  };
  const BAND_TXT = { pass: "ΕΠΙΤΥΧΩΝ", lag: "ΥΣΤΕΡΗΣΗ", fail: "ΑΠΟΤΥΧΙΑ" };

  function evaluate(events, D, opts) {
    D = D || DATA;
    opts = opts || {};
    const Q = CQ();
    if (!Q || !Q.walk) throw new Error("SchedConsq.walk missing — load app/schedconsq.js first");
    if (!D) throw new Error("board_decision_trees.json not loaded");
    const TH = D.thresholds;
    /* 1ζ written-exam failure — ONE ladder (owner, 2026-10-17: «Στο ΠΔ εννοεί
       την πρώτη γραπτή εξέταση μετά την αποτυχία. Αλλιώς θα πήγαιναν οι μισοί
       συμβούλιο…»): γραπτή (3-01 §58ζ) → ΑΠΟΤΥΧΩΝ → επανεξέταση μετά από 2
       ημέρες στα ίδια αντικείμενα, από τον ΑΕ σε όλα τα επαγγελματικά θέματα
       (3-01 §58η = ΠΔ παρ.4) → ΑΠΟΤΥΧΩΝ → Συμβούλιο. There is no switch: the
       two texts are read in sequence, not in conflict. */
    /* 1δ denominator — the PRINTED programme (owner, 2026-10-17: «όχι σε όσες
       έχει πετάξει μέχρι τώρα, αλλά στο σύνολο, είτε για το προ-μόνος είτε για
       όλο το στάδιο»): 15 Προ-ΜΟΝΟΣ sorties (MIF table, PDF 92) → 6; 85 for
       the stage → 17. The Progress editor's executed reading stays one toggle
       away for comparison. */
    const denom = opts.denom_1d === "executed" ? "executed" : "planned";

    /* synthetic graph the walk asks about */
    const DESC = new Map();
    const isLast = new Set();
    const ctx = {
      isLast: isLast,
      describe: (uid) => DESC.get(uid) || null,
      interveningFs: () => false,
      nextIsExam: (track, uid, aptOpen) => !!aptOpen,
      boardGates: () => [],
      kepeGates: () => [],
    };
    const exemptIf = (x) => !!(x.ev && x.ev.nausea_exempt);
    const isSoloDone = (x) => { const d = DESC.get(x.uid); return !!(d && d.first_solo && x.res === "completed"); };

    const log = [];          // normalised flying events for the walk (incl. specials)
    const exams = [];        // [{ev, date, uid, i}]
    const nfs = [];          // nfs records (oral failures)
    const timeline = [];     // one row per input event
    const fired = [];        // every threshold that fired, in order
    let day = opts.start || "2026-01-05";
    let n = 0, idx = 0;
    const date0 = (e) => { if (e.date) return e.date; day = Q.addWork(day, 1); return day; };

    /* overlay state (data-only rules) */
    const st = {
      oralSeq: [],            // "fail"|"pass" of orals, in order
      oralRef: null,          // { stage: "exam"|"reexam", since }
      oralRefDone: 0,         // 1ζ referrals already resolved this stage (fail-24)
      kepe: { in: {}, entries: {}, exhausted: {} },
      nauseaRun: 0,
      le63run: 0,
      blindFails: 0, stageFails: 0,
      aas: null,
      boardYes: null,         // { date, practiced: bool }
      lastDate: "",
    };
    const kepeKey = (kind, cat) => (kind === "ground" ? "ground_exam" : kind === "fs" ? "fs:" + cat : (cat || "contact"));
    const kepeCap = (key) => (key === "ground_exam" ? Q.smsMax("ground_exam") : key.indexOf("fs:") === 0 ? 1 : Q.smsMax(key));
    function kepeEnter(key, label, why, cites, row) {
      if (st.kepe.in[key]) { row.notes.push({ text: "ΚΕΠΕ: ήδη σε ΚΕΠΕ (" + label + ") — " + why, cites: cites }); return; }
      const used = st.kepe.entries[key] || 0, cap = kepeCap(key);
      if (used >= cap) {
        st.kepe.exhausted[key] = true;
        row.notes.push({ text: "ΚΕΠΕ (" + label + "): όριο εισόδων εξαντλημένο (" + used + "/" + cap + ") — απόφανση μονάδας: ΔΕΝ ξαναμπαίνει, καμία άλλη συνέπεια", cites: [R("fail-45", "Η 3-01 ορίζει μέγιστο εισόδων αλλά όχι συνέπεια υπέρβασης· απόφανση ΑΕ 364 ΜΕΑ 2026-08-09.")] });
        return;
      }
      st.kepe.in[key] = true; st.kepe.entries[key] = used + 1;
      row.notes.push({ text: "→ ΚΕΠΕ (" + label + ") — είσοδος " + (used + 1) + "/" + cap + ": " + why, cites: cites.concat([R("fail-45", "Μέγιστες είσοδοι ανά στάδιο: 2 εξετάσεις εδάφους, 2 ΠΡΟΣΑΡΜΟΓΗ, 1 ανά άλλη κατηγορία αέρος / F/S.")]) });
    }

    /* a referral record: the ONE place the ladder is opened from the overlay */
    function refer(row, o) {
      const ev = { special: "referral", stage: o.stage || "ae", req: o.req, label: o.label, kind: o.kind || "flights", result: "completed", exceptional: !!o.exceptional };
      log.push({ ev: ev, i: ++n, uid: "", kind: o.kind || "flights", date: row.date, res: "completed", special: "referral" });
      row.fired.push({ case: o.case, text: o.text, cites: o.cites, stage: o.stage || "ae" });
      fired.push({ idx: row.idx, date: row.date, case: o.case, text: o.text, cites: o.cites });
    }
    const prefix = () => ({ walk: Q.walk(log, ctx), cnt: Q.countersFrom({ passPct: TH.written.pass_pct, describe: ctx.describe, fly: log.filter((x) => !x.special), exams: exams, nfs: nfs, exemptIf: exemptIf, isSoloDone: isSoloDone }) });
    let prev = prefix();

    /* R7 — the ΠΔ παρ.7/9 budget now lives in SchedConsq.walk (pd.rung,
       w.budget). This only puts Greek words on the rung the engine chose. */
    function stageOf(w) {
      const pd = w.pd;
      if (!pd) return null;
      const out = { engine: pd.stage, effective: pd.stage, rung: pd.rung || "", why: [] };
      const B = pd.budget || w.budget;
      if (pd.rung === "cdr_par7") out.why.push({ text: "ΠΔ παρ.7: ο ΑΕ έκρινε ήδη σε αυτό το στάδιο (Δοκιμή ΑΕ " + (B.aePassed ? "≥60%" : "<60%") + ") → η νέα κρίση αρχίζει από τον Δκτή Μοίρας — κρίση " + (B.cdrUsed + 1) + "/" + B.cdrBudget + " του σταδίου (παρ.9). Μία κλίμακα ανά ΣΤΑΔΙΟ, όχι ανά κατηγορία.", cites: [R("fail-24", "«Εάν ο ίδιος Ίκαρος ή Ανθυποσμηναγός τεθεί για δεύτερη φορά υπό την κρίση του … παραπέμπεται στο Διοικητή της Μοίρας»."), R("fail-26", "Μία κρίση Δκτή αν η Δοκιμή ΑΕ ήταν ≥60%, δύο αν ήταν <60%.")] });
      else if (pd.rung === "board_par9") out.why.push({ text: "ΠΔ παρ.9: ο ΑΕ έκρινε ήδη (1/1) και ο Δκτής εξάντλησε τις κρίσεις του (" + B.cdrUsed + "/" + B.cdrBudget + ", επειδή η Δοκιμή ΑΕ ήταν " + (B.aePassed ? "≥60%" : "<60%") + ") → ΣΥΜΒΟΥΛΙΟ ΧΩΡΙΣ ΠΤΗΣΕΙΣ ΔΟΚΙΜΗΣ ΠΡΟΟΔΟΥ. Μία κλίμακα ανά ΣΤΑΔΙΟ, όχι ανά κατηγορία.", cites: [R("fail-26", "«Εφόσον στη συνέχεια τεθεί σε κρίση πτητικής καταλληλότητας παραπέμπεται στο Συμβούλιο Πτητικής Ικανότητας χωρίς πτήσεις Δοκιμής Προόδου»."), R("fail-24", "Ο ΑΕ κρίνει μία φορά ανά στάδιο.")] });
      else if (pd.rung === "exceptional") out.why.push({ text: "Κατ' εξαίρεση Δοκιμή Προόδου (ΠΔ παρ.17β) — εκτός ορίων παρ.7/9", cites: [R("fail-70", "Ο Δκτής παραπέμπει εκ νέου «με εξέταση σε κατ' εξαίρεση πτήση Δοκιμής Προόδου».")] });
      return out;
    }

    for (const e of events) {
      const row = { idx: idx++, t: e.t, date: date0(e), label: "", band: "", fired: [], notes: [], detail: "" };
      st.lastDate = row.date;
      const cat = CATS.indexOf(e.cat) >= 0 ? e.cat : "contact";
      const role = e.role || "normal";
      const res = e.res || "pass";
      const score = e.score;

      if (e.t === "flight" || e.t === "fs") {
        const kind = e.t === "flight" ? "flights" : "fs";
        /* fail-11 is «επαναλαμβάνει την άσκηση» — the SAME sortie: a last-of-
           section F/S flown while that section's ladder is open reuses its uid */
        const wPrev = Q.walk(log, ctx);
        const reuse = kind === "fs" && role === "last" && wPrev.fsLadder && (DESC.get(wPrev.fsLadder.uid) || {}).track === cat ? wPrev.fsLadder.uid : "";
        const uid = reuse || ("s:SBX-" + (kind === "fs" ? "S" : "F") + (++n));
        const nausea = e.nausea === "pre_ok" || e.nausea === "pre_bad";
        let r = res, sc = score;
        if (nausea && r === "pass") { r = "score"; sc = TH.nausea.default_grade_pct; }
        const d = reuse ? DESC.get(uid) : { uid: uid, kind: kind, label: e.label || ((kind === "fs" ? "F/S " : "Πτήση ") + (CAT_LABEL[cat] || cat) + " #" + n), track: cat,
          checkride: kind === "flights" && role === "checkride", first_solo: kind === "flights" && role === "first_solo", short: uid };
        DESC.set(uid, d);
        if (reuse) n++;
        if (role === "last") isLast.add(uid);
        const band = bandOfRes(r, sc);
        /* ΠΔ παρ.2 has three limbs: nausea · graded «Σχεδόν Καλώς» (= ΣΚ 50-59,
           3-01 §29δ — the 59 % of §35 IS that band; owner 2026-10-17) · before
           the onset Καλώς+ or unassessable. A nausea sortie graded ΑΠΟΤΥΧΙΑ
           (0-49) fails limb two and counts. */
        const exempt = e.nausea === "pre_ok" && band === "lag";
        const ev = { result: r === "score" ? "score" : r === "pass" ? "completed" : r, score: r === "score" ? Number(sc) : undefined,
          nausea: nausea, nausea_exempt: exempt };
        log.push({ ev: ev, i: n, uid: uid, kind: kind, date: row.date, res: Q.normRes(ev), special: "" });
        row.label = d.label + (role !== "normal" ? " · " + ROLE_LABEL[role] : "");
        row.band = band + (r === "score" ? " " + sc + "%" : "");
        if (nausea) {
          row.notes.push({ text: "ΑΕΡΟΝΑΥΤΙΑ: βαθμολογία " + (band === "lag" ? "ΥΣΤΕΡΗΣΗ (59% = «ΣΚ» Σχεδόν Καλώς κατά §29δ)" : "ΑΠΟΤΥΧΙΑ (0-49%) — όχι «Σχεδόν Καλώς»")
              + (exempt ? " — απόδοση πριν την εκδήλωση ≥60% ή μη αξιολογήσιμη → ΔΕΝ υπολογίζεται στα 1γ/1δ (ΠΔ παρ.2, απόφανση ιδιοκτήτη 17/10/2026)" : band !== "lag" ? " → η παρ.2 δεν συντρέχει (απαιτεί Σχεδόν Καλώς) → υπολογίζεται" : " — απόδοση πριν την εκδήλωση <60% → υπολογίζεται κανονικά"),
            cites: [R("fail-52", "Η πτήση με σοβαρή-έκδηλη ΑΕΡΟΝΑΥΤΙΑ βαθμολογείται με ΥΣΤΕΡΗΣΗ (59%)."), R("fail-01", "3-01 §29δ: «ΣΚ» Σχεδόν Καλώς = 50%-59% — η γέφυρα ανάμεσα στο «ΥΣΤΕΡΗΣΗ (59%)» της §35 και το «Σχεδόν Καλώς» του ΠΔ παρ.2."), R("fail-57", exempt ? "Και τα τρία σκέλη της παρ.2 συντρέχουν (ναυτία · Σχεδόν Καλώς · πριν Καλώς+/μη αξιολογήσιμος) → η πτήση εξαιρείται από τα 1γ/1δ — μόνο από αυτά." : band !== "lag" ? "Η παρ.2 απαιτεί «βαθμολογήθηκε με επίδοση Σχεδόν Καλώς»· ΑΠΟΤΥΧΙΑ δεν είναι." : "Η εξαίρεση της παρ.2 απαιτεί απόδοση Καλώς+ πριν τη ναυτία· εδώ δεν συντρέχει.")] });
          if (d.checkride) row.notes.push({ text: "Ναυτία σε Αξιολόγηση: ο 1β ΔΕΝ εξαιρείται — το 59% είναι λόγος παραπομπής", cites: [R("fail-57", "«Κατά τις περιπτώσεις των υποπαραγράφων 1γ και 1δ» — ο 1β δεν είναι μέσα.")] });
          if (kind === "fs") row.notes.push({ text: "Ναυτία στον F/S: ο 1ε ΔΕΝ εξαιρείται", cites: [R("fail-57", "Η παρ.2 δεν καλύπτει τον 1ε.")] });
          st.nauseaRun += 1;
          if (st.nauseaRun === TH.nausea.kepe_consecutive) kepeEnter(kepeKey(kind, cat), CAT_LABEL[cat] || cat, "2 συνεχόμενες ΑΕΡΟΝΑΥΤΙΕΣ", [R("fail-44", "Συνθήκη (3): δύο συνεχόμενες πτήσεις με ΑΕΡΟΝΑΥΤΙΑ.")], row);
        } else st.nauseaRun = 0;

        /* KEPE (1) & (2) */
        if (band !== "pass" && !nausea) kepeEnter(kepeKey(kind, cat), CAT_LABEL[cat] || cat, "έξοδος ≤59%", [R("fail-44", "Συνθήκη (1): οποιαδήποτε έξοδος αέρος ή F/S βαθμολογηθεί με 59% και κάτω (πλην ναυτίας).")], row);
        const le63 = (r === "score" && Number(sc) <= TH.kepe.two_consecutive_pct) || band !== "pass";
        if (!d.checkride && le63) { st.le63run += 1; if (st.le63run === 2 && band === "pass") kepeEnter(kepeKey(kind, cat), CAT_LABEL[cat] || cat, "2 συνεχόμενες ≤63%", [R("fail-44", "Συνθήκη (2): δύο συνεχόμενες πτήσεις ≤63%, εκτός τελικών εξετάσεων και Δοκιμών Προόδου. Το 63% είναι το μοναδικό κατώφλι εκτός 49/59/60.")], row); }
        else if (!d.checkride) st.le63run = 0;

        /* immediate consequences (walk) */
        const w = Q.walk(log, ctx);
        if (band !== "pass") {
          if (d.checkride) row.fired.push({ case: "1β", text: "Αξιολόγηση με 0-59% → κρίση Πτητικής Καταλληλότητας → Δοκιμή Προόδου ΑΕ (αέρας)", cites: [R("fail-16", "ΜΙΑ βαθμολογία 0-59% σε πτήση εξέτασης/αξιολόγησης αρκεί· στο Phase II δεν υπάρχει επανάληψη Αξιολόγησης."), R("fail-23", "Ο 1β περνά από Δοκιμή Προόδου ΑΕ στον αέρα.")], stage: "ae" }), fired.push({ idx: row.idx, date: row.date, case: "1β", text: row.fired[row.fired.length - 1].text, cites: row.fired[row.fired.length - 1].cites });
          else if (d.first_solo) row.fired.push({ case: "§56", text: "Πρώτη ΜΟΝΟΣ με ΥΣΤΕΡΗΣΗ/ΑΠΟΤΥΧΙΑ → Εξέταση Καταλληλότητας (profile Αξιολόγησης για ΜΟΝΟΣ)· η ΜΟΝΟΣ δεν επαναλαμβάνεται", cites: [R("fail-19", "Η πρώτη ΜΟΝΟΣ λογίζεται τελευταία πτήση ενότητας."), R("fail-13", "Μετά από ≤59% δεν προγραμματίζεται ΜΟΝΟΣ.")], stage: "apt" });
          else if (kind === "flights" && isLast.has(uid)) row.fired.push({ case: "§30ζ", text: "Τελευταία πτήση ενότητας με ΥΣΤΕΡΗΣΗ/ΑΠΟΤΥΧΙΑ → Εξέταση Καταλληλότητας με Αξιολογητή Μοίρας (εκτός αν η επόμενη είναι Αξιολόγηση / συντρέχει λόγος ΠΔ)", cites: [R("fail-12", "Μη επίτευξη κωδίκων ΠΑΠ στην τελευταία πτήση → Εξέταση Καταλληλότητας· νέα αποτυχία → ΠΔ."), R("fail-27", "Στην Εξέταση εξετάζεται οπωσδήποτε σε ό,τι απέτυχε.")], stage: "apt" });
          else if (kind === "fs" && isLast.has(uid)) {
            const L = w.fsLadder;
            if (w.pd && w.pd.req === "fail-11" && w.pd.since === row.date) row.fired.push({ case: "§30στ→ΠΔ", text: "3η ΥΣΤΕΡΗΣΗ/ΑΠΟΤΥΧΙΑ στην τελευταία έξοδο ενότητας F/S → ΠΔ 29/2020 κατά περίπτωση (1ε) → Δοκιμή Προόδου ΑΕ στον εξομοιωτή", cites: [R("fail-11", "Τρίτη αποτυχία: «να εφαρμόζεται το ΠΔ 29/2020 κατά περίπτωση»."), R("fail-23", "Για τον 1ε η Δοκιμή Προόδου γίνεται στον εξομοιωτή.")], stage: "ae" }), fired.push({ idx: row.idx, date: row.date, case: "§30στ→ΠΔ", text: row.fired[row.fired.length - 1].text, cites: row.fired[row.fired.length - 1].cites });
            else if (L) row.notes.push({ text: "Τελευταία έξοδος ενότητας F/S — αποτυχία " + L.fails + "/3: " + (L.fails === 1 ? "άμεση επανάληψη της άσκησης στο F/S (επόμενη εργάσιμη)" : "νέα έξοδος F/S μετά από 2 ημερολογιακές ημέρες") + " — νωρίτερα " + Q.fmtDay(L.eligible), cites: [R("fail-11", L.fails === 1 ? "Πρώτη επανάληψη χωρίς αναμονή." : "Δεύτερη επανάληψη μετά από 2 ημερολογιακές ημέρες (η ημέρα αποτυχίας δεν μετρά).")] });
          } else {
            const b = w.blocks[w.blocks.length - 1];
            if (b && b.date === row.date) row.notes.push({ text: "Αναπρογραμματισμός: Α/Φ όχι πριν " + Q.fmtDay(b.flt) + " · F/S όχι πριν " + Q.fmtDay(b.fs) + " (" + b.req + ")", cites: [R(b.req, b.req === "fail-08" ? "Πρώτη ΥΣΤΕΡΗΣΗ/ΑΠΟΤΥΧΙΑ στην κατηγορία: μεθεπόμενη εργάσιμη." : b.req === "fail-09" ? "Παρεμβάλλεται F/S: επόμενη ημέρα F/S, μεθεπόμενη Α/Φ." : "Γενικός κανόνας: καμία πτήση την ίδια μέρα, επόμενη εργάσιμη με επανάληψη των ελιγμών.")] });
          }
        }
        /* cumulative criteria — SchedConsq counters, crossing detection */
        const cur = prefix();
        const c = cur.cnt, p = prev.cnt;
        if (kind === "flights" && !w.pd) {
          if (c.c049.value >= c.c049.limit && p.c049.value < p.c049.limit) refer(row, { case: "1γ(Α)", req: "fail-76", kind: "flights", label: "1γ: 2 συνεχόμενες 0-49%", text: "1γ: 2 συνεχόμενες πτήσεις 0-49% (μετά τις 4 πρώτες εξόδους) → κρίση → Δοκιμή Προόδου ΑΕ (αέρας)", cites: [R("fail-76", "Μετρητής c049 = 2/2. Οι 4 πρώτες έξοδοι του σταδίου δεν μετρούν."), R("fail-23", "Ο 1γ περνά από Δοκιμή Προόδου ΑΕ στον αέρα.")] });
          else if (c.c059.value >= c.c059.limit && p.c059.value < p.c059.limit) refer(row, { case: "1γ(Β)", req: "fail-76", kind: "flights", label: "1γ: 3 συνεχόμενες 0-59%", text: "1γ: 3 συνεχόμενες πτήσεις 0-59% (μετά τις 4 πρώτες εξόδους) → κρίση → Δοκιμή Προόδου ΑΕ (αέρας)", cites: [R("fail-76", "Μετρητής c059 = 3/3. Μία πτήση ≥60% θα μηδένιζε την αλληλουχία."), R("fail-23", "Ο 1γ περνά από Δοκιμή Προόδου ΑΕ στον αέρα.")] });
          else {
            const pre = c.preSolo, tot = c.totalFl;
            const totPct = denom === "planned" ? Math.round((tot.bad / TH.air_1d.planned_phase2_sorties) * 1000) / 10 : tot.pct;
            const pTotPct = denom === "planned" ? Math.round((p.totalFl.bad / TH.air_1d.planned_phase2_sorties) * 1000) / 10 : p.totalFl.pct;
            const PS = TH.air_1d.pre_solo_sorties;
            const prePct = denom === "planned" ? Math.round((pre.bad / PS) * 1000) / 10 : pre.pct;
            const pPrePct = denom === "planned" ? Math.round((p.preSolo.bad / PS) * 1000) / 10 : p.preSolo.pct;
            if (!pre.soloDone && (denom === "planned" ? pre.bad > 0 : pre.total > 0) && prePct >= pre.limitPct && !((denom === "planned" ? p.preSolo.bad > 0 : p.preSolo.total > 0) && pPrePct >= pre.limitPct))
              refer(row, { case: "1δ(ΠΡΟ ΜΟΝΟΣ)", req: "fail-77", kind: "flights", label: "1δ: ≥40% ΠΡΟ ΜΟΝΟΣ", text: "1δ: " + pre.bad + "/" + (denom === "planned" ? PS + " τυπωμένες έξοδοι ΠΡΟ ΜΟΝΟΣ (πίνακας MIF)" : pre.total + " εκτελεσθείσες") + " = " + prePct + "% των πτήσεων ΠΡΟ ΜΟΝΟΣ με 0-59% (≥40%) → κρίση → Δοκιμή Προόδου ΑΕ" + (denom === "planned" ? "" : " — ανάγνωση εκτελεσθεισών (Progress editor), προς σύγκριση"), cites: [R("fail-77", denom === "planned" ? "«Στο 40% και άνω των πτήσεων της Προ ΜΟΝΟΣ φάσης»: η φάση έχει 15 τυπωμένες εξόδους (C4101 … C4790-91, Syllabus MIF PDF 92) → η 6η πτήση 0-59% ενεργοποιεί. Παρονομαστής το τυπωμένο πρόγραμμα (απόφανση ιδιοκτήτη 17/10/2026)." : "«Στο 40% και άνω των πτήσεων της Προ ΜΟΝΟΣ φάσης» επί των εκτελεσθεισών — η ανάγνωση του Progress editor, όχι η απόφανση του ιδιοκτήτη (τυπωμένο πρόγραμμα: 15 → 6)."), R("fail-23", "Δοκιμή Προόδου ΑΕ στον αέρα.")] });
            else if (tot.total > 0 && totPct >= tot.limitPct && !(p.totalFl.total > 0 && pTotPct >= tot.limitPct))
              refer(row, { case: "1δ(ΣΥΝΟΛΟ)", req: "fail-77", kind: "flights", label: "1δ: ≥20% συνόλου", text: "1δ: " + tot.bad + "/" + (denom === "planned" ? TH.air_1d.planned_phase2_sorties + " τυπωμένες έξοδοι του Σταδίου" : tot.total + " εκτελεσθείσες") + " = " + totPct + "% με 0-59% (≥20%) → κρίση → Δοκιμή Προόδου ΑΕ" + (denom === "planned" ? "" : " — ανάγνωση εκτελεσθεισών (Progress editor), προς σύγκριση"), cites: [R("fail-77", denom === "planned" ? "Παρονομαστής οι 85 τυπωμένες έξοδοι Phase II → 17 πτήσεις 0-59%. Απόφανση ιδιοκτήτη 17/10/2026: «όχι σε όσες έχει πετάξει μέχρι τώρα, αλλά στο σύνολο»." : "Παρονομαστής οι εκτελεσθείσες πτήσεις (ανάγνωση Progress editor) — όχι η απόφανση του ιδιοκτήτη (τυπωμένο πρόγραμμα: 85 → 17)."), R("fail-23", "Δοκιμή Προόδου ΑΕ στον αέρα.")] });
          }
        }
        if (kind === "fs" && !w.pd) {
          if (c.fs059.value >= c.fs059.limit && p.fs059.value < p.fs059.limit) refer(row, { case: "1ε(αα)", req: "fail-40", kind: "fs", label: "1ε: 3 συνεχόμενες F/S 0-59%", text: "1ε(αα): 3 συνεχόμενες έξοδοι F/S 0-59% (μετά τις 3 πρώτες) → κρίση → Δοκιμή Προόδου ΑΕ ΣΤΟΝ ΕΞΟΜΟΙΩΤΗ", cites: [R("fail-40", "Μετρητής fs059 = 3/3· χάρις 3 εξόδων."), R("fail-23", "Για τον 1ε η Δοκιμή Προόδου γίνεται στον εξομοιωτή.")] });
          else if (c.fsCum.bad >= c.fsCum.floor && c.fsCum.pct >= c.fsCum.limitPct && !(p.fsCum.bad >= p.fsCum.floor && p.fsCum.pct >= p.fsCum.limitPct)) refer(row, { case: "1ε(αβ)", req: "fail-40", kind: "fs", label: "1ε: 20% F/S και ≥3", text: "1ε(αβ): " + c.fsCum.bad + "/" + c.fsCum.total + " = " + c.fsCum.pct + "% των εξόδων F/S με 0-59% (≥20% και όχι λιγότερες από 3) → Δοκιμή Προόδου ΑΕ στον εξομοιωτή — ΑΣΑΦΕΙΑ: παρονομαστής εκτελεσθείσες", cites: [R("fail-40", "Δύο όροι μαζί: ≥3 έξοδοι ΚΑΙ 20%. Προγραμματισμένες ή εκτελεσθείσες δεν ορίζεται."), R("fail-23", "Δοκιμή Προόδου στον εξομοιωτή.")] });
        }
        prev = prefix();
        row.detail = JSON.stringify({ c049: c.c049.value, c059: c.c059.value });
      }

      else if (e.t === "dp_ae" || e.t === "dp_cdr" || e.t === "apt" || e.t === "board") {
        const wBefore = Q.walk(log, ctx);
        /* R8(b)/(c): airsickness on a Δοκιμή Προόδου or an Εξέταση
           Καταλληλότητας. 3-01 §35 grades it ΥΣΤΕΡΗΣΗ (59 %) — and 59 sits
           inside παρ.3β / παρ.8β «από μηδέν (0) έως πενήντα εννέα τοις εκατό
           (59%)». ΠΔ παρ.2's exemption is scoped «Κατά τις περιπτώσεις των
           υποπαραγράφων 1γ και 1δ» — παρ.3 is not in it: the student does not
           escape the rung, he is pushed to the next one. */
        const nz = e.t !== "board" && (e.nausea === "pre_ok" || e.nausea === "pre_bad");
        let rr = res, sc = score;
        if (nz && rr === "pass") { rr = "score"; sc = TH.nausea.default_grade_pct; }
        const ev = { special: e.t, result: e.t === "board" ? (res === "stop" ? "fail" : "completed") : (rr === "score" ? "score" : rr === "pass" ? "completed" : rr), score: rr === "score" ? Number(sc) : undefined, category: e.t === "apt" ? cat : undefined, kind: e.medium === "fs" ? "fs" : "flights", nausea: nz };
        log.push({ ev: ev, i: ++n, uid: "", kind: ev.kind, date: row.date, res: Q.normRes(ev), special: e.t });
        const band = e.t === "board" ? res : bandOfRes(rr, sc);
        row.label = EV_LABEL[e.t] + (e.t === "apt" ? " · " + CAT_LABEL[cat] : "") + (e.medium === "fs" ? " · εξομοιωτής" : "");
        row.band = e.t === "board" ? RES_LABEL[res] || res : (band === "pass" ? "≥60% ΕΠΙΤΥΧΩΝ" : "0-59% ΑΠΟΤΥΧΩΝ") + (rr === "score" ? " (" + sc + "%" + (nz ? " — ΑΕΡΟΝΑΥΤΙΑ" : "") + ")" : "");
        const w = Q.walk(log, ctx);
        if (nz && (e.t === "dp_ae" || e.t === "dp_cdr")) {
          const nextRung = e.t === "dp_ae" ? "Δοκιμή Προόδου από τον Διοικητή Μοίρας" : "Συμβούλιο Πτητικής Ικανότητας";
          const txt = "ΑΕΡΟΝΑΥΤΙΑ σε Δοκιμή Προόδου: (1) η εξαίρεση του ΠΔ παρ.2 ΔΕΝ φτάνει εδώ — το κείμενο αρχίζει «Κατά τις περιπτώσεις των υποπαραγράφων 1γ και 1δ»· η παρ.3 δεν είναι μέσα. (2) Η πτήση βαθμολογείται ΥΣΤΕΡΗΣΗ (59%) κατά 3-01 §35 — και η §43 βαθμολογεί ρητά την ΑΔΕ ναυτίας, αντίθετα με κάθε άλλη ΑΔΕ — και το 59% είναι μέσα στο «από μηδέν (0) έως πενήντα εννέα τοις εκατό (59%)» της παρ." + (e.t === "dp_ae" ? "3β" : "8β") + ": ο μαθητής δεν γλιτώνει το σκαλί, προχωρά στο επόμενο → " + nextRung + ". (3) Η κρίση αν ήταν ΑΕΡΟΝΑΥΤΙΑ είναι ιατρική, όχι δική του: η §34 ορίζει τη «σοβαρή-έκδηλη» με αντικειμενικά γεγονότα και η §39 αφαιρεί από το σύνολο ό,τι ο Ιατρός Αεροπορικής Ιατρικής κρίνει ότι δεν είναι ΑΕΡΟΝΑΥΤΙΑ.";
          const cts = [R("fail-57", "«Κατά τις περιπτώσεις των υποπαραγράφων 1γ και 1δ δεν υπολογίζονται οι πτήσεις…» — μόνο 1γ και 1δ· όχι η Δοκιμή Προόδου της παρ.3."), R("fail-52", "3-01 §35: η πτήση με σοβαρή-έκδηλη ΑΕΡΟΝΑΥΤΙΑ βαθμολογείται με ΥΣΤΕΡΗΣΗ (59%)."), R("fail-88", "§43: οι ΑΔΕ δεν βαθμολογούνται — «εκτός των περιπτώσεων ΑΕΡΟΝΑΥΤΙΑΣ ή περιστατικού Φυσιολογίας Πτήσεων»."), R(e.t === "dp_ae" ? "fail-23" : "fail-25", "Το 59% είναι μέσα στο 0-59% του σκαλιού → " + nextRung + "."), R("fail-51", "§33-34: τι είναι «σοβαρή-έκδηλη» ΑΕΡΟΝΑΥΤΙΑ — έμετος, μεταβίβαση ελέγχου, αδυναμία ασφαλούς χειρισμού, αίτημα διακοπής."), R("fail-56", "§39: τα περιστατικά που κατά την ιατρική γνωμάτευση δεν είναι ΑΕΡΟΝΑΥΤΙΕΣ δεν προσμετρώνται.")];
          row.fired.push({ case: "ΑΕΡΟΝΑΥΤΙΑ σε ΔΠ", text: txt, cites: cts, stage: e.t === "dp_ae" ? "cdr" : "board" }); fired.push({ idx: row.idx, date: row.date, case: "ΑΕΡΟΝΑΥΤΙΑ σε ΔΠ", text: txt, cites: cts });
        }
        if (nz && e.t === "apt") row.notes.push({ text: "ΑΕΡΟΝΑΥΤΙΑ στην Εξέταση Καταλληλότητας: βαθμολογία ΥΣΤΕΡΗΣΗ (59%, §35) = «ΥΣΤΕΡΗΣΗ εκ νέου» της §30ζ → ΠΔ. Η εξαίρεση της παρ.2 (1γ/1δ μόνο) δεν φτάνει εδώ· η Εξέταση είναι «πτήση εξέτασης» (1β).", cites: [R("fail-52", "§35: ΥΣΤΕΡΗΣΗ (59%)."), R("fail-57", "Εξαίρεση μόνο για 1γ και 1δ."), R("fail-12", "«Αν όμως ΥΣΤΕΡΗΣΕΙ ή ΑΠΟΤΥΧΕΙ εκ νέου, τότε να εφαρμόζεται το ΠΔ».")] });
        if (e.t === "dp_ae") {
          if (!wBefore.pd) row.notes.push({ text: "Δεν υπήρχε ανοικτή κρίση — η Δοκιμή Προόδου δεν αντιστοιχεί σε παραπομπή (αγνοείται από τον κινητήρα)", cites: [] });
          else if (band === "pass") row.notes.push({ text: "Δοκιμή Προόδου ΑΕ ≥60% → η κρίση κλείνει· συνεχίζει με ΑΛΛΟΝ εκπαιδευτή", cites: [R("fail-23", "«α. Από εξήντα τοις εκατό (60%) και πάνω, συνεχίζει την εκπαίδευσή του με άλλον εκπαιδευτή»."), R("fail-86", "Βαθμολογικά η επιτυχής Δοκιμή Προόδου γίνεται η Αξιολόγηση της κατηγορίας.")] });
          else row.notes.push({ text: "Δοκιμή Προόδου ΑΕ 0-59% → Δοκιμή Προόδου από τον Διοικητή Μοίρας", cites: [R("fail-23", "«β. … παραπέμπεται για εκ νέου εξέταση Δοκιμής Προόδου με τον Διοικητή της Μοίρας»."), R("fail-26", "Επειδή η Δοκιμή ΑΕ ήταν <60%, ο Δκτής έχει δύο κρίσεις στο στάδιο.")] });
        } else if (e.t === "dp_cdr") {
          if (!wBefore.pd) row.notes.push({ text: "Δεν υπήρχε ανοικτή κρίση — αγνοείται", cites: [] });
          else if (band === "pass") row.notes.push({ text: "Δοκιμή Προόδου Δκτή ≥60% → η κρίση κλείνει· συνεχίζει με ΑΛΛΟΝ εκπαιδευτή", cites: [R("fail-25", "«α. Από εξήντα τοις εκατό (60%) και άνω, συνεχίζει την εκπαίδευσή του με άλλο εκπαιδευτή».")] });
          else row.notes.push({ text: "Δοκιμή Προόδου Δκτή 0-59% → ΣΥΜΒΟΥΛΙΟ ΠΤΗΤΙΚΗΣ ΙΚΑΝΟΤΗΤΑΣ — διακοπή όλων των δραστηριοτήτων· ειδική έκθεση· εισήγηση εντός 10 εργάσιμων", cites: [R("fail-25", "«β. … παραπέμπεται στο Συμβούλιο Πτητικής Ικανότητας»."), R("fail-61", "Διακοπή πτήσεων, F/S, μαθημάτων."), R("fail-66", "Ειδική έκθεση Δκτή Μοίρας με τον Φάκελο Εκπαίδευσης."), R("fail-67", "Εισήγηση συγκρότησης εντός 10 εργάσιμων ημερών από την τελευταία πτήση.")] });
        } else if (e.t === "apt") {
          const open = wBefore.apt.some((a) => !a.category || a.category === cat);
          if (!open) row.notes.push({ text: "Δεν υπήρχε εκκρεμής Εξέταση Καταλληλότητας για την κατηγορία — αγνοείται", cites: [] });
          else if (band === "pass") row.notes.push({ text: "Εξέταση Καταλληλότητας: επίτευξη ΠΑΠ → συνεχίζει την εκπαίδευση (η κατηγορία ξεκλειδώνει)", cites: [R("fail-12", "«Αν στην πτήση Εξέτασης επιτύχει τους ΠΑΠ, να συνεχίζει την εκπαίδευσή του».")] });
          else { row.fired.push({ case: "§30ζ→ΠΔ", text: "Νέα ΥΣΤΕΡΗΣΗ/ΑΠΟΤΥΧΙΑ στην Εξέταση Καταλληλότητας → ΠΔ 29/2020 κατά περίπτωση → Δοκιμή Προόδου ΑΕ (αέρας)", cites: [R("fail-12", "«Αν όμως ΥΣΤΕΡΗΣΕΙ ή ΑΠΟΤΥΧΕΙ εκ νέου, τότε να εφαρμόζεται το ΠΔ 29/2020 κατά περίπτωση»."), R("fail-23", "Δοκιμή Προόδου ΑΕ στον αέρα.")], stage: "ae" }); fired.push({ idx: row.idx, date: row.date, case: "§30ζ→ΠΔ", text: row.fired[0].text, cites: row.fired[0].cites }); }
        } else if (e.t === "board") {
          if (!wBefore.pd) row.notes.push({ text: "Δεν υπήρχε παραπομπή — η απόφαση δεν αντιστοιχεί σε κρίση (αγνοείται)", cites: [] });
          else if (res === "stop") row.notes.push({ text: "ΚΑΤΑ της συνέχισης → Ίκαρος: επικύρωση ΓΕΑ με διαταγή · Ανθσγός: ΑΑΣ οριστική απόφαση. Η εκπαίδευση σταματά.", cites: [R("fail-71", "Δύο διαδρομές επικύρωσης ανάλογα με την ιδιότητα."), R("fail-72", "Η απόφαση στον Ατομικό Φάκελο Εκπαίδευσης.")] });
          else { st.boardYes = { date: row.date, practiced: false }; row.notes.push({ text: "ΥΠΕΡ της συνέχισης → αλλαγή εκπαιδευτή + ΜΙΑ (1) πτήση εξάσκησης ως επιπρόσθετο πρόγραμμα· μετά αποφαίνεται ο Δκτής Μοίρας", cites: [R("fail-70", "Αλλαγή εκπαιδευτή και μία πτήση εξάσκησης· ο Δκτής αποφαίνεται για συνέχιση ή νέα παραπομπή με κατ' εξαίρεση Δοκιμή Προόδου."), R("fail-69", "Απόφαση κατά πλειοψηφία, φανερή ψηφοφορία.")] }); }
        }
        prev = prefix();
      }

      else if (e.t === "practice") {
        row.label = EV_LABEL.practice; row.band = (BAND_TXT[bandOfRes(res, score)] || "") + (e.nausea ? " — ΑΕΡΟΝΑΥΤΙΑ" : "");
        if (e.nausea) row.notes.push({ text: "ΑΕΡΟΝΑΥΤΙΑ στην πτήση εξάσκησης: η παρ.17 δεν λέει αν η πτήση βαθμολογείται — ο Δκτής αποφαίνεται ούτως ή άλλως (παρ.17β).", cites: [R("fail-70", "Η πτήση εξάσκησης δεν προσδιορίζεται αν βαθμολογείται."), R("fail-52", "§35: αν βαθμολογηθεί, ΥΣΤΕΡΗΣΗ (59%).")] });
        if (!st.boardYes) row.notes.push({ text: "Δεν προηγήθηκε απόφαση ΥΠΕΡ — η πτήση εξάσκησης δεν έχει έρεισμα", cites: [] });
        else { st.boardYes.practiced = true; row.notes.push({ text: "Η πτήση εξάσκησης εκτελέστηκε (με νέο εκπαιδευτή). Επόμενο: ο Δκτής Μοίρας αποφαίνεται — συνέχιση ή εκ νέου παραπομπή. Αν βαθμολογείται και με ποιο κατώφλι: ΔΕΝ ΟΡΙΖΕΤΑΙ.", cites: [R("fail-70", "«Ο Διοικητής της Μοίρας μετά την πτήση εξάσκησης αποφαίνεται…» — χωρίς αριθμητικό κριτήριο."), R("fail-87", "Οι κατ' εξαίρεση πτήσεις μετρούν ως απλές πτήσεις στη βαθμολογία.")] }); }
      }
      else if (e.t === "cdr_decision") {
        row.label = EV_LABEL.cdr_decision; row.band = res === "refer" ? RES_LABEL.refer : "Συνέχιση";
        if (!st.boardYes || !st.boardYes.practiced) row.notes.push({ text: "Δεν προηγήθηκε ΥΠΕΡ + πτήση εξάσκησης — αγνοείται", cites: [] });
        else if (res === "refer") { refer(row, { case: "παρ.17β", req: "fail-70", kind: "flights", exceptional: true, label: "εκ νέου παραπομπή (κατ' εξαίρεση ΔΠ)", text: "Ο Δκτής παραπέμπει ΕΚ ΝΕΟΥ στο Συμβούλιο με εξέταση σε ΚΑΤ' ΕΞΑΙΡΕΣΗ πτήση Δοκιμής Προόδου — ποιος την εκτελεί και αν μετρά στα όρια της παρ.9: ΔΕΝ ΟΡΙΖΕΤΑΙ", cites: [R("fail-70", "Εκ νέου παραπομπή «με εξέταση σε κατ' εξαίρεση πτήση Δοκιμής Προόδου».")] }); st.boardYes = null; }
        else { st.boardYes = null; row.notes.push({ text: "Ο Δκτής αποφαίνεται ΥΠΕΡ της συνέχισης — η εκπαίδευση συνεχίζεται με τον νέο εκπαιδευτή", cites: [R("fail-70", "Πρώτη από τις δύο επιλογές της παρ.17β."), R("fail-22", "Όχι με τον εκπαιδευτή που άλλαξε, ούτε με τον Αξιολογητή που τον βαθμολόγησε αρνητικά.")] }); }
        prev = prefix();
      }

      else if (e.t === "written" || e.t === "stage_exam") {
        const uid = "g:SBX-W" + (++n);
        DESC.set(uid, { uid: uid, kind: "exams", label: e.label || (e.t === "stage_exam" ? "Εξέταση τέλους Σταδίου" : "Γραπτή εξέταση") + " #" + n, track: "shared" });
        const ev = { result: res === "score" ? "score" : res === "pass" ? "completed" : "fail", score: res === "score" ? Number(score) : undefined };
        exams.push({ ev: ev, i: n, date: row.date, uid: uid });
        const failed = ev.result === "fail" || (ev.result === "score" && Number(ev.score) < TH.written.pass_pct);
        row.label = DESC.get(uid).label; row.band = (failed ? "ΑΠΟΤΥΧΩΝ" : "ΕΠΙΤΥΧΩΝ") + (res === "score" ? " " + score + "% (βάση " + TH.written.pass_pct + "%)" : "");
        const cur = prefix();
        if (failed) {
          row.notes.push({ text: "Φύλλο μη Πτήσης (Α0473) · γραπτή αποτυχία " + cur.cnt.written.streak + "/" + cur.cnt.written.limit + " συνεχόμενη", cites: [R("fail-83", "ΦΜΠ μετά από αποτυχία σε γραπτή εξέταση."), R("fail-28", "Αποτυχία = κάτω από 80% στα ερωτηματολόγια, κάτω από 100% στις ζωτικές διαδικασίες / όρια Α/Φ.")] });
          kepeEnter("ground_exam", "εξετάσεις εδάφους", "1 γραπτή αποτυχία", [R("fail-44", "Συνθήκη (4): μία γραπτή αποτυχία (και CBT) αρκεί για ΚΕΠΕ.")], row);
          if (e.t === "stage_exam") { st.stageFails += 1; row.notes.push({ text: st.stageFails === 1 ? "Εξέταση Αξιολογητή Διοίκησης: επανάληψη την ΕΠΟΜΕΝΗ ημέρα" : "2η αποτυχία στην επαναληπτική: ΔΕΝ ΡΥΘΜΙΖΕΤΑΙ ρητά — κατά το γράμμα του ΠΔ είναι 2 συνεχόμενες γραπτές (1στ)", cites: [R("fail-33", "Μία επανάληψη την επομένη· για δεύτερη αποτυχία η 3-01 σιωπά."), R("fail-32", "Η εξέταση γίνεται από «Προϊστάμενη αρχή» — εμπίπτει στο 1στ χωρίς να δηλώνεται ρητά.")] }); }
          if (cur.cnt.written.streak >= cur.cnt.written.limit && prev.cnt.written.streak < cur.cnt.written.limit && !cur.walk.pd)
            refer(row, { case: "1στ", req: "fail-32", stage: "board", kind: "flights", label: "1στ: 2 συνεχόμενες γραπτές", text: "1στ: 2 ΣΥΝΕΧΟΜΕΝΕΣ γραπτές αποτυχίες → ειδική έκθεση Δκτή Μοίρας → ΑΠΕΥΘΕΙΑΣ ΣΥΜΒΟΥΛΙΟ, χωρίς Δοκιμή Προόδου", cites: [R("fail-32", "Μετρητής written.streak = 2/2."), R("fail-62", "Παρ.5: 1στ, 1η, 1θ, 1ι → ειδική έκθεση και Συμβούλιο."), R("fail-61", "Διακοπή όλων των δραστηριοτήτων — και για θεωρητική ανεπάρκεια.")] });
        } else if (e.t === "stage_exam") st.stageFails = 0;
        prev = prefix();
      }

      else if (e.t === "oral") {
        const failed = res !== "pass";
        st.oralSeq.push(failed ? "fail" : "pass");
        row.label = EV_LABEL.oral; row.band = failed ? "ΑΠΟΤΥΧΩΝ" : "ΕΠΙΤΥΧΩΝ";
        if (failed) nfs.push({ special: "nfs", category: "oral", date: row.date });
        const cur = prefix();
        let streak = 0; for (let i = st.oralSeq.length - 1; i >= 0 && st.oralSeq[i] === "fail"; i--) streak++;
        const total = cur.cnt.oral.total;
        if (failed) {
          row.notes.push({ text: "Φύλλο μη Πτήσης · προφορικές: " + streak + " συνεχόμενες / " + total + " συνολικά (ΚΕΠΕ στις " + TH.oral.kepe_consecutive + "/" + TH.oral.kepe_total + " · κρίση στις " + TH.oral.referral_consecutive + "/" + TH.oral.referral_total + ")", cites: [R("fail-83", "ΦΜΠ μετά από αποτυχία σε προφορική."), R("fail-36", "Δύο μετρητές: συνεχόμενες (μηδενίζουν με επιτυχία) και συνολικές του σταδίου.")] });
          if (streak === TH.oral.kepe_consecutive || total === TH.oral.kepe_total) kepeEnter("ground_exam", "εξετάσεις εδάφους", streak === TH.oral.kepe_consecutive ? "2 συνεχόμενες προφορικές" : "4 μη συνεχόμενες προφορικές", [R("fail-44", "Συνθήκη (5): 2 συνεχόμενες ή 4 μη συνεχόμενες προφορικές — το μισό του κατωφλίου παραπομπής.")], row);
          if (!st.oralRef && (streak === TH.oral.referral_consecutive || total === TH.oral.referral_total)) {
            if (st.oralRefDone >= 1) refer(row, { case: "1ζ (2η)", req: "fail-24", stage: "board", kind: "flights", label: "1ζ δεύτερη παραπομπή", text: "1ζ για ΔΕΥΤΕΡΗ φορά στο ίδιο στάδιο → ΑΠΕΥΘΕΙΑΣ Συμβούλιο, χωρίς νέα γραπτή εξέταση ΑΕ", cites: [R("fail-24", "«κατά την περίπτωση της υποπαραγράφου 1ζ παραπέμπεται στο Συμβούλιο Πτητικής Ικανότητας».")] });
            else { st.oralRef = { stage: "exam", since: row.date }; const txt = "1ζ: " + (streak === TH.oral.referral_consecutive ? "4 συνεχόμενες" : "8 μη συνεχόμενες") + " προφορικές αποτυχίες → ΓΡΑΠΤΗ εξέταση επαγγελματικών θεμάτων μετά από 2 ημερολογιακές ημέρες (ΠΔ: από ΑΕ, όλα τα θέματα · 3-01: Δκτής ή ΑΕ, 50+25+5)"; const cts = [R("fail-36", "Κατώφλι 4 συνεχόμενες / 8 μη συνεχόμενες."), R("fail-39", "Παρ.4: εξέταση από τον ΑΕ σε όλα τα επαγγελματικά θέματα."), R("fail-37", "3-01 §58ζ: Δκτής ή ΑΕ, ερωτηματολόγιο 50+25+5, μετά από 2 ημέρες.")]; row.fired.push({ case: "1ζ", text: txt, cites: cts, stage: "exam" }); fired.push({ idx: row.idx, date: row.date, case: "1ζ", text: txt, cites: cts }); }
          }
        }
        prev = prefix();
      }

      else if (e.t === "ae_written") {
        const failed = res !== "pass";
        row.label = EV_LABEL.ae_written; row.band = failed ? "ΑΠΟΤΥΧΩΝ" : "ΕΠΙΤΥΧΩΝ";
        if (!st.oralRef) row.notes.push({ text: "Δεν υπήρχε ανοικτή παραπομπή 1ζ — αγνοείται", cites: [] });
        else if (!failed) { st.oralRef = null; st.oralRefDone += 1; row.notes.push({ text: "ΕΠΙΤΥΧΩΝ → συνεχίζει τις πτήσεις. Η μία κρίση ΑΕ για 1ζ του σταδίου καταναλώθηκε — νέα παραπομπή 1ζ πάει απευθείας στο Συμβούλιο", cites: [R("fail-39", "«α. ΕΠΙΤΥΧΩΝ, συνεχίζει τις πτήσεις»."), R("fail-24", "Δεύτερη φορά υπό κρίση ΑΕ για 1ζ → Συμβούλιο.")] }); }
        else if (st.oralRef.stage === "exam") {
          st.oralRef.stage = "reexam";
          const txt = "ΑΠΟΤΥΧΩΝ στη γραπτή (3-01 §58ζ) → ΕΠΑΝΕΞΕΤΑΣΗ μετά από 2 ημερολογιακές ημέρες στα ίδια αντικείμενα, από τον ΑΕ σε όλα τα επαγγελματικά θέματα — η επανεξέταση της 3-01 §58η ΕΙΝΑΙ η εξέταση του ΠΔ παρ.4 (μία κλίμακα, απόφανση ιδιοκτήτη 17/10/2026). ΕΠΙΤΥΧΩΝ → συνεχίζει τις πτήσεις· ΑΠΟΤΥΧΩΝ → Συμβούλιο.";
          const cts = [R("fail-38", "Η 3-01 δίνει τον χρόνο (2 ημερολογιακές ημέρες, η ημέρα αποτυχίας δεν μετρά) και τα «ίδια αντικείμενα»."), R("fail-39", "Το ΠΔ δίνει τον εξεταστή (ΑΕ), την ύλη (όλα τα επαγγελματικά θέματα) και την έκβαση της ίδιας επανεξέτασης.")];
          row.fired.push({ case: "1ζ→επανεξέταση", text: txt, cites: cts, stage: "reexam" }); fired.push({ idx: row.idx, date: row.date, case: "1ζ→επανεξέταση", text: txt, cites: cts });
        } else { st.oralRef = null; st.oralRefDone += 1; refer(row, { case: "1ζ→Συμβούλιο", req: "fail-39", stage: "board", kind: "flights", label: "1ζ: νέα αποτυχία στην επανεξέταση", text: "Νέα ΑΠΟΤΥΧΙΑ στην επανεξέταση → ΠΔ παρ.4β «ΑΠΟΤΥΧΩΝ, παραπέμπεται στο Συμβούλιο» = 3-01 §58η «σε περίπτωση νέας ΑΠΟΤΥΧΙΑΣ, να εφαρμόζεται το ΠΔ» → ΣΥΜΒΟΥΛΙΟ", cites: [R("fail-39", "Η έκβαση της επανεξέτασης: ΑΠΟΤΥΧΩΝ → Συμβούλιο Πτητικής Ικανότητας."), R("fail-38", "Το ίδιο σκαλί, ειπωμένο από την 3-01."), R("fail-61", "Διακοπή όλων των δραστηριοτήτων — και για θεωρητική ανεπάρκεια.")] }); }
        prev = prefix();
      }

      else if (e.t === "blind") {
        const sc = Number(score); const failed = isNaN(sc) ? res !== "pass" : sc < TH.blind.pass_pct;
        row.label = EV_LABEL.blind; row.band = (failed ? "ΑΠΟΤΥΧΩΝ" : "ΕΠΙΤΥΧΩΝ") + (isNaN(sc) ? "" : " " + sc + "% (βάση " + TH.blind.pass_pct + "%)");
        if (failed) { st.blindFails += 1; row.notes.push({ text: st.blindFails === 1 ? "Blind control <90% → επανάληψη την ΕΠΟΜΕΝΗ ημέρα" : "2η αποτυχία στο blind control: ΔΕΝ ΡΥΘΜΙΖΕΤΑΙ σε καμία πηγή", cites: [R("fail-35", "Κατώφλι 90%, μία επανάληψη την επόμενη ημέρα· για δεύτερη αποτυχία το Syllabus σιωπά."), R("fail-28", "Η 3-01 ξέρει μόνο 80%/100% — δεν λέει σε ποια κατηγορία ανήκει το blind control.")] }); }
        else st.blindFails = 0;
      }

      else if (e.t === "incident") {
        const k = e.kind || "1a";
        row.label = EV_LABEL.incident + " · " + (INC_LABEL[k] || k); row.band = "1 περιστατικό";
        if (k === "1a") refer(row, { case: "1α", req: "fail-75", kind: "flights", label: "1α επικίνδυνος χειρισμός", text: "1α: επικίνδυνος χειρισμός Α/Φ ή διαδικασιών (όχι από απειθαρχία) → κρίση → Δοκιμή Προόδου ΑΕ (αέρας)", cites: [R("fail-75", "Ένα περιστατικό αρκεί· η διάκριση από τον 1η είναι η απουσία απειθαρχίας."), R("fail-23", "Ο 1α περνά από Δοκιμή Προόδου.")] });
        else if (k === "1h") refer(row, { case: "1η", req: "fail-78", stage: "board", kind: "flights", label: "1η απειθαρχία", text: "1η: απειθαρχία σε πτήση → ειδική έκθεση Δκτή Μοίρας → ΑΠΕΥΘΕΙΑΣ ΣΥΜΒΟΥΛΙΟ (3-01: §58θ, όχι §58η)", cites: [R("fail-78", "Συμπεριφορά ΚΑΙ αποτέλεσμα (κίνδυνος/παρακώλυση/μάταιη αποστολή)."), R("fail-62", "Παρ.5: απευθείας Συμβούλιο, χωρίς Δοκιμή Προόδου."), R("fail-85", "Μετατόπιση αρίθμησης από το «ζ»: ΠΔ 1η = 3-01 §58θ.")] });
        else if (k === "1th") refer(row, { case: "1θ", req: "fail-79", stage: "board", kind: "flights", label: "1θ απαρέσκεια", text: "1θ: έγγραφη απαρέσκεια για τις πτήσεις → ειδική έκθεση → ΑΠΕΥΘΕΙΑΣ ΣΥΜΒΟΥΛΙΟ (3-01: §58ι)", cites: [R("fail-79", "Πρέπει να είναι ΕΓΓΡΑΦΗ, μετά την έναρξη της πτητικής εκπαίδευσης."), R("fail-62", "Παρ.5: απευθείας Συμβούλιο.")] });
        else if (k === "1i") refer(row, { case: "1ι", req: "fail-80", stage: "board", kind: "flights", label: "1ι ουσίες", text: "1ι: παρουσίαση για πτήση υπό την επήρεια ουσιών (διαπιστωμένη κατά την ειδική διαταγή) → ειδική έκθεση → ΑΠΕΥΘΕΙΑΣ ΣΥΜΒΟΥΛΙΟ (3-01: §58ια)", cites: [R("fail-80", "Απαιτείται διαπίστωση με τις διαδικασίες της διαταγής περί εθιστικών ουσιών."), R("fail-62", "Παρ.5: απευθείας Συμβούλιο.")] });
        else if (k === "1ia") { st.aas = { date: row.date }; const txt = "1ια: αεροπορικό ατύχημα με απόδοση ευθυνών από πόρισμα ΕΔΕ → ο Δκτής ΣΙ/Σμηναρχίας/Πτέρυγας διακόπτει τις πτήσεις → ειδική έκθεση (έγκριση κλιμακίου + ΓΕΑ) → ΑΑΣ. ΤΟ ΣΥΜΒΟΥΛΙΟ ΠΤΗΤΙΚΗΣ ΙΚΑΝΟΤΗΤΑΣ ΠΑΡΑΚΑΜΠΤΕΤΑΙ (3-01: §58ιβ)"; const cts = [R("fail-81", "Το κριτήριο είναι το πόρισμα ΕΔΕ, όχι η εμπλοκή."), R("fail-63", "Παρ.6: διακοπή από επίπεδο ΣΙ/Πτέρυγας και εισαγωγή στο ΑΑΣ.")]; row.fired.push({ case: "1ια", text: txt, cites: cts, stage: "aas" }); fired.push({ idx: row.idx, date: row.date, case: "1ια", text: txt, cites: cts }); }
        prev = prefix();
      }

      else if (e.t === "kepe_in") {
        row.label = EV_LABEL.kepe_in; row.band = CAT_LABEL[cat] || cat;
        kepeEnter(kepeKey(e.medium === "fs" ? "fs" : "flights", cat), CAT_LABEL[cat] || cat, "εισήγηση Εκπαιδευτή (μη αποδεκτή πρόοδος)", [R("fail-44", "Συνθήκη (6): εισήγηση του Εκπαιδευτή.")], row);
      }
      else if (e.t === "kepe_exit") {
        row.label = EV_LABEL.kepe_exit; row.band = "όλες οι κατηγορίες";
        st.kepe.in = {};
        row.notes.push({ text: "Έξοδος από ΚΕΠΕ (επίτευξη στόχων)", cites: [R("fail-48", "Οι στόχοι εξόδου γράφονται στο Φύλλο Εισόδου."), R("fail-49", "Έξοδος όταν εξαλειφθούν οι αδυναμίες.")] });
      }
      else { row.label = String(e.t); row.band = "άγνωστο γεγονός"; }

      /* where he stands after this event */
      const w = Q.walk(log, ctx);
      row.stage = stageOf(w);
      row.pd = w.pd ? { stage: w.pd.stage, req: w.pd.req, medium: w.pd.medium } : null;
      timeline.push(row);
    }

    /* ── the verdict ─────────────────────────────────────────────────────── */
    const w = Q.walk(log, ctx);
    const cnt = prefix().cnt;
    const stage = stageOf(w);
    const status = { code: "free", title: "", next_with: "own_ip", next: "", if_fail: "", cites: [], notes: [] };
    const A = D.actors || {};
    if (st.aas) {
      status.code = "aas"; status.title = "ΑΑΣ — πτήσεις διακεκομμένες από Δκτή ΣΙ/Σμηναρχίας/Πτέρυγας"; status.next_with = "aas";
      status.next = "Καμία πτήση. Ειδική έκθεση μετά το πόρισμα ΕΔΕ → ιεραρχικά στο ΑΑΣ για κρίση πτητικής καταλληλότητας.";
      status.if_fail = "Η απόφαση του ΑΑΣ είναι οριστική και αρχειοθετείται στον Ατομικό Φάκελο.";
      status.cites = [R("fail-63", "Παρ.6: η μόνη περίπτωση που παρακάμπτει το Συμβούλιο Πτητικής Ικανότητας."), R("fail-72", "Αρχειοθέτηση της απόφασης ΑΑΣ.")];
    } else if (w.pd && w.pd.stage === "stopped") {
      status.code = "stopped"; status.title = "Συμβούλιο ΚΑΤΑ της συνέχισης — η εκπαίδευση σταμάτησε"; status.next_with = "na";
      status.next = "Ίκαρος: η ΣΙ υποβάλλει στο ΓΕΑ για επικύρωση με διαταγή · Ανθσγός: ΔΑΕ → ΓΕΑ → ΑΑΣ για οριστική απόφαση.";
      status.cites = [R("fail-71", "Δύο επίπεδα τελικής κρίσης για την ίδια έκβαση."), R("fail-72", "Στον Ατομικό Φάκελο Εκπαίδευσης.")];
    } else if (w.pd && (stage.effective === "board")) {
      status.code = "board"; status.title = "ΠΑΡΑΠΟΜΠΗ ΣΤΟ ΣΥΜΒΟΥΛΙΟ ΠΤΗΤΙΚΗΣ ΙΚΑΝΟΤΗΤΑΣ" + (stage.rung === "board_par9" ? " — ΧΩΡΙΣ πτήσεις Δοκιμής Προόδου (παρ.9: η κλίμακα του σταδίου εξαντλήθηκε)" : ""); status.next_with = "none";
      status.next = "Καμία πτήση, F/S, μάθημα ή εξέταση. Ειδική έκθεση Δκτή Μοίρας + Φάκελος → Δκτής Μονάδας· εισήγηση συγκρότησης εντός 10 εργάσιμων από την τελευταία πτήση. Ο μαθητής προσέρχεται και εκθέτει τις απόψεις του.";
      status.if_fail = "ΥΠΕΡ: αλλαγή εκπαιδευτή + 1 πτήση εξάσκησης, μετά αποφαίνεται ο Δκτής. ΚΑΤΑ: Ίκαρος → ΓΕΑ επικυρώνει · Ανθσγός → ΑΑΣ.";
      status.cites = [R("fail-61", "Διακοπή όλων των δραστηριοτήτων."), R("fail-66", "Ειδική έκθεση με τον Φάκελο."), R("fail-67", "10 εργάσιμες ημέρες."), R("fail-68", "Ακρόαση του παραπεμπομένου."), R("fail-69", "ΥΠΕΡ ή ΚΑΤΑ, κατά πλειοψηφία."), R("fail-70", "Έκβαση ΥΠΕΡ."), R("fail-71", "Έκβαση ΚΑΤΑ.")];
      status.notes = status.notes.concat(stage.why);
    } else if (w.pd && stage.effective === "cdr") {
      status.code = "dp_cdr"; status.title = "Υπό κρίση — επόμενο σκαλί: Δοκιμή Προόδου από τον Διοικητή Μοίρας" + (w.pd.medium === "fs" ? " (στον εξομοιωτή)" : " (στον αέρα)"); status.next_with = "cdr";
      status.next = "Πτήση Δοκιμής Προόδου με τον Δκτή Μοίρας· εξετάζεται οπωσδήποτε σε όλους τους ελιγμούς που απέτυχε. ≥60% → συνεχίζει με ΑΛΛΟΝ εκπαιδευτή.";
      status.if_fail = "0-59% → Συμβούλιο Πτητικής Ικανότητας (δεν υπάρχει τρίτο σκαλί πτήσης).";
      status.cites = [R("fail-25", "Δοκιμή Προόδου Δκτή: ≥60% συνέχιση με άλλο εκπαιδευτή, 0-59% Συμβούλιο."), R("fail-27", "Υποχρεωτική εξέταση στους ελιγμούς που απέτυχε.")];
      status.notes = status.notes.concat(stage.why);
      /* R5 — the branch a reader does not expect: HOW MANY Δκτής occasions the
         stage has is decided by the ΑΕ grade (παρ.9), not by passing the Δκτής.
         Read from the engine's budget (R7). */
      {
        const B = w.budget;
        status.notes.push({ text: "Κλίμακα (ΠΔ παρ.7-9): ο ΑΕ κρίνει ΜΙΑ φορά στο στάδιο" + (B.aeUsed ? " — ήδη έκρινε (" + (B.aePassed ? "≥60%" : "<60%") + ")" : "") + ". " + (!B.aeUsed ? "Οι ευκαιρίες του Δκτή ορίζονται από τον βαθμό της Δοκιμής ΑΕ: ΜΙΑ αν ≥60%, ΔΥΟ αν <60%." : (B.aePassed ? "Επειδή η Δοκιμή ΑΕ ήταν ≥60%, ο Δκτής έχει ΜΙΑ μόνο ευκαιρία στο στάδιο" : "Επειδή η Δοκιμή ΑΕ ήταν <60%, ο Δκτής έχει ΔΥΟ ευκαιρίες στο στάδιο") + " (αυτή είναι η " + (B.cdrUsed + 1) + "η/" + B.cdrBudget + "). ") + "Αποτυχία στον Δκτή → Συμβούλιο ΠΑΝΤΑ (παρ.8β)· μετά την εξάντληση → Συμβούλιο χωρίς Δοκιμή Προόδου (παρ.9).", cites: [R("fail-24", "Παρ.7: ο ΑΕ μία φορά ανά στάδιο."), R("fail-25", "Παρ.8β: 0-59% στον Δκτή → Συμβούλιο."), R("fail-26", "Παρ.9: ΜΙΑ κρίση Δκτή αν η Δοκιμή ΑΕ ήταν καλώς και άνω, ΔΥΟ αν ήταν κάτω από 60%.")] });
      }
    } else if (w.pd && stage.effective === "ae") {
      status.code = "dp_ae"; status.title = "Υπό κρίση — επόμενο σκαλί: Δοκιμή Προόδου από τον ΑΕ Μοίρας" + (w.pd.medium === "fs" ? " (στον εξομοιωτή)" : " (στον αέρα)"); status.next_with = "ae";
      status.next = "Πτήση Δοκιμής Προόδου με τον ΑΕ· εξετάζεται οπωσδήποτε σε όλους τους ελιγμούς που απέτυχε. ≥60% → συνεχίζει με ΑΛΛΟΝ εκπαιδευτή.";
      status.if_fail = "0-59% → Δοκιμή Προόδου από τον Διοικητή Μοίρας (ο Δκτής θα έχει ΔΥΟ ευκαιρίες στο στάδιο, επειδή η Δοκιμή ΑΕ θα ήταν <60%· αν αντίθετα περάσει τον ΑΕ, ο Δκτής θα έχει ΜΙΑ). Αποτυχία στον Δκτή → Συμβούλιο.";
      status.cites = [R("fail-23", "Δοκιμή Προόδου ΑΕ: ≥60% συνέχιση με άλλον εκπαιδευτή, 0-59% Δκτής Μοίρας."), R("fail-27", "Υποχρεωτική εξέταση στους ελιγμούς που απέτυχε."), R("fail-24", "Ο ΑΕ κρίνει μία φορά ανά στάδιο."), R("fail-26", "Πόσες φορές κρίνει ο Δκτής.")];
      status.notes = status.notes.concat(stage.why);
    } else if (st.oralRef) {
      status.code = "oral_exam"; status.next_with = "ae_exam";
      if (st.oralRef.stage === "exam") {
        status.title = "Παραπομπή 1ζ — εκκρεμεί ΓΡΑΠΤΗ εξέταση επαγγελματικών θεμάτων (3-01 §58ζ)";
        status.next = "Όχι πτήση: γραπτή εξέταση μετά από 2 ημερολογιακές ημέρες (νωρίτερα " + Q.fmtDay(Q.addCal(st.oralRef.since, 3)) + ") από τον Δκτή ή τον ΑΕ, 50 κλειστού + 25 ανοικτού + 5 BOLD FACE. ΕΠΙΤΥΧΩΝ → συνεχίζει τις πτήσεις.";
        status.if_fail = "ΑΠΟΤΥΧΩΝ → επανεξέταση μετά από 2 ημερολογιακές ημέρες στα ίδια αντικείμενα, από τον ΑΕ σε όλα τα επαγγελματικά θέματα (3-01 §58η = ΠΔ παρ.4). Νέα αποτυχία εκεί → Συμβούλιο.";
        status.cites = [R("fail-37", "3-01 §58ζ(1)-(3): η πρώτη γραπτή εξέταση."), R("fail-38", "3-01 §58η: η επανεξέταση."), R("fail-39", "ΠΔ παρ.4: ο ΑΕ, η ύλη και η έκβαση της επανεξέτασης."), R("fail-61", "Διακοπή δραστηριοτήτων και για θεωρητική ανεπάρκεια.")];
      } else {
        status.title = "Παραπομπή 1ζ — εκκρεμεί ΕΠΑΝΕΞΕΤΑΣΗ (3-01 §58η = ΠΔ παρ.4)";
        status.next = "Όχι πτήση: επανεξέταση μετά από 2 ημερολογιακές ημέρες (νωρίτερα " + Q.fmtDay(Q.addCal(st.oralRef.since, 3)) + ") στα ίδια αντικείμενα — από τον ΑΕ της Μοίρας, σε όλα τα επαγγελματικά θέματα. ΕΠΙΤΥΧΩΝ → συνεχίζει τις πτήσεις.";
        status.if_fail = "ΑΠΟΤΥΧΩΝ → ΣΥΜΒΟΥΛΙΟ ΠΤΗΤΙΚΗΣ ΙΚΑΝΟΤΗΤΑΣ (ΠΔ παρ.4β· 3-01 §58η «να εφαρμόζεται το ΠΔ»).";
        status.cites = [R("fail-38", "3-01 §58η: χρόνος και ίδια αντικείμενα."), R("fail-39", "ΠΔ παρ.4: εξεταστής, ύλη, έκβαση."), R("fail-61", "Διακοπή δραστηριοτήτων και για θεωρητική ανεπάρκεια.")];
        status.notes.push({ text: "Μία κλίμακα, όχι δύο (απόφανση ιδιοκτήτη 17/10/2026): «Στο ΠΔ εννοεί την πρώτη γραπτή εξέταση μετά την αποτυχία. Αλλιώς θα πήγαιναν οι μισοί συμβούλιο…». Ανοικτά παραμένουν: εξεταστής (ΑΕ μόνο / Δκτής ή ΑΕ), ύλη (όλα τα θέματα / 50+25+5), κατώφλι επιτυχίας.", cites: [R("fail-39", "ΠΔ παρ.4."), R("fail-37", "3-01 §58ζ.")] });
      }
    } else if (st.boardYes && !st.boardYes.practiced) {
      status.code = "practice"; status.title = "Συμβούλιο ΥΠΕΡ — εκκρεμεί η πτήση εξάσκησης"; status.next_with = "other_ip";
      status.next = "Αλλαγή εκπαιδευτή και ΜΙΑ (1) πτήση εξάσκησης ως επιπρόσθετο πρόγραμμα.";
      status.if_fail = "Μετά την πτήση ο Δκτής Μοίρας αποφαίνεται: συνέχιση — ή εκ νέου παραπομπή στο Συμβούλιο με κατ' εξαίρεση Δοκιμή Προόδου. Κατώφλι: ΔΕΝ ΟΡΙΖΕΤΑΙ.";
      status.cites = [R("fail-70", "Παρ.17α-β."), R("fail-22", "Όχι με τον εκπαιδευτή που άλλαξε.")];
    } else if (st.boardYes && st.boardYes.practiced) {
      status.code = "cdr_decides"; status.title = "Πτήση εξάσκησης εκτελέστηκε — αποφαίνεται ο Διοικητής Μοίρας"; status.next_with = "cdr_decides";
      status.next = "Συνέχιση της εκπαίδευσης — ή εκ νέου παραπομπή στο Συμβούλιο με κατ' εξαίρεση πτήση Δοκιμής Προόδου.";
      status.if_fail = "Σε εκ νέου παραπομπή: κατ' εξαίρεση Δοκιμή Προόδου (ποιος την εκτελεί: δεν ορίζεται) → Συμβούλιο. Μέγιστος αριθμός επανειλημμένων παραπομπών: ΔΕΝ ΟΡΙΖΕΤΑΙ.";
      status.cites = [R("fail-70", "Παρ.17β — χωρίς αριθμητικό κριτήριο.")];
    } else if (w.apt && w.apt.length) {
      const a = w.apt[0];
      status.code = "apt"; status.title = "Εκκρεμεί ΕΞΕΤΑΣΗ ΚΑΤΑΛΛΗΛΟΤΗΤΑΣ — " + (CAT_LABEL[a.category] || a.category) + (a.solo ? " (profile Αξιολόγησης για ΜΟΝΟΣ)" : ""); status.next_with = "evaluator";
      status.next = "Πτήση Εξέτασης Καταλληλότητας με Αξιολογητή της Μοίρας· η κατηγορία είναι κλειδωμένη μέχρι τότε. Εξετάζεται οπωσδήποτε σε όλους τους ελιγμούς που απέτυχε. Επίτευξη ΠΑΠ → συνεχίζει.";
      status.if_fail = "ΥΣΤΕΡΗΣΗ/ΑΠΟΤΥΧΙΑ → ΠΔ 29/2020 κατά περίπτωση → Δοκιμή Προόδου ΑΕ (αέρας) → Δκτής → Συμβούλιο.";
      status.cites = [R(a.req, a.solo ? "Πρώτη ΜΟΝΟΣ = τελευταία πτήση ενότητας· η ΜΟΝΟΣ δεν επαναλαμβάνεται." : "Τελευταία πτήση ενότητας: Εξέταση Καταλληλότητας, νέα αποτυχία → ΠΔ."), R("fail-27", "Υποχρεωτικοί ελιγμοί.")];
    } else if (w.fsLadder) {
      const L = w.fsLadder;
      status.code = "fs_ladder"; status.title = "Τελευταία έξοδος ενότητας F/S — αποτυχία " + L.fails + "/3"; status.next_with = "own_ip";
      status.next = (L.fails === 1 ? "Επανάληψη της άσκησης στο F/S (επόμενη εργάσιμη)" : "Νέα έξοδος F/S μετά από 2 ημερολογιακές ημέρες") + " — νωρίτερα " + Q.fmtDay(L.eligible) + ". ΕΠΙΤΥΧΩΝ → συνεχίζει.";
      status.if_fail = L.fails === 1 ? "Νέα αποτυχία (#2) → αναμονή 2 ημερολογιακών ημερών → τρίτη προσπάθεια. Αποτυχία #3 → ΠΔ (1ε) → Δοκιμή Προόδου ΑΕ στον εξομοιωτή." : "Νέα αποτυχία (#3) → ΠΔ 29/2020 κατά περίπτωση (1ε) → Δοκιμή Προόδου ΑΕ στον εξομοιωτή → Δκτής → Συμβούλιο.";
      status.cites = [R("fail-11", "Η κλίμακα των 3 προσπαθειών."), R("fail-23", "Για τον 1ε η Δοκιμή Προόδου γίνεται στον εξομοιωτή.")];
    } else {
      status.code = "free";
      const avoid = !!w.pdNote;
      status.title = avoid ? "Ελεύθερος — συνεχίζει με ΑΛΛΟΝ εκπαιδευτή (μετά από επιτυχή κρίση)" : "Ελεύθερος — συνεχίζει κανονικά";
      status.next_with = avoid ? "other_ip" : "own_ip";
      const b = w.blocks.filter((x) => x.flt > st.lastDate || x.fs > st.lastDate).sort((x, y) => (x.flt < y.flt ? 1 : -1))[0];
      status.next = (b ? "Αναπρογραμματισμός: Α/Φ όχι πριν " + Q.fmtDay(b.flt) + " · F/S όχι πριν " + Q.fmtDay(b.fs) + " (" + b.req + "). " : "") + "Επόμενη πτήση κατά πρόγραμμα" + (avoid ? ", με άλλον εκπαιδευτή" : "") + ".";
      status.if_fail = "Κάθε νέα ΥΣΤΕΡΗΣΗ/ΑΠΟΤΥΧΙΑ μετρά στα σωρευτικά κριτήρια (1γ, 1δ, 1ε) και επιβάλλει αναπρογραμματισμό + ΚΕΠΕ.";
      status.cites = (b ? [R(b.req, "Ο κανόνας αναπρογραμματισμού που ισχύει.")] : []).concat(avoid ? [R("fail-23", "Μετά από επιτυχή Δοκιμή Προόδου: άλλος εκπαιδευτής."), R("fail-22", "Ούτε με τον Αξιολογητή που τον βαθμολόγησε αρνητικά.")] : []);
    }
    status.actor = A[status.next_with] || status.next_with;

    /* counters snapshot */
    const kepe = Object.keys(st.kepe.entries).map((k) => ({ key: k, label: k === "ground_exam" ? "εξετάσεις εδάφους" : k.indexOf("fs:") === 0 ? "F/S " + (CAT_LABEL[k.slice(3)] || k.slice(3)) : (CAT_LABEL[k] || k), entries: st.kepe.entries[k], cap: kepeCap(k), active: !!st.kepe.in[k], exhausted: !!st.kepe.exhausted[k] }));
    let oralStreak = 0; for (let i = st.oralSeq.length - 1; i >= 0 && st.oralSeq[i] === "fail"; i--) oralStreak++;
    const counters = {
      c049: cnt.c049, c059: cnt.c059, preSolo: cnt.preSolo, totalFl: cnt.totalFl, fs059: cnt.fs059, fsCum: cnt.fsCum,
      written: cnt.written, oral: { streak: oralStreak, total: cnt.oral.total, limitC: cnt.oral.limitC, limitT: cnt.oral.limitT },
      kepe: kepe, dpUsed: { ae: w.budget.aeUsed ? 1 : 0, cdr: w.budget.cdrUsed, budget: w.budget.cdrBudget, aePassed: w.budget.aePassed },
      plannedPct: Math.round((cnt.totalFl.bad / TH.air_1d.planned_phase2_sorties) * 1000) / 10,
      plannedPrePct: Math.round((cnt.preSolo.bad / TH.air_1d.pre_solo_sorties) * 1000) / 10,
      preSoloSorties: TH.air_1d.pre_solo_sorties, plannedSorties: TH.air_1d.planned_phase2_sorties,
    };
    return { timeline: timeline, fired: fired, status: status, counters: counters, pd: w.pd, stage: stage, opts: { denom_1d: denom }, events: events.length };
  }

  /* ── R8(a) — THE GATE: only the legal next events for the current state.
     The owner: «όχι απλώς να μου γκριζάρει κάποια πράγματα, αλλά να μου
     περιορίζει τις επιλογές και να μου λέει "αυτό δεν γίνεται", ούτε καν να
     είναι στις προτεινόμενες επιλογές». An event the state does not allow is
     not in the list at all; the state line says where the student stands and
     what the single expected move is. The ENGINE stays the judge — this only
     narrows what is offered. Pure: reads the evaluate() result. ──────────── ── */
  const GROUND = ["written", "oral", "blind", "stage_exam", "incident", "kepe_in", "kepe_exit"];
  function allowedEvents(res) {
    const S = res && res.status ? res.status : { code: "free" };
    const g = { allowed: [], expected: null, state: S.title || "", cites: S.cites || [] };
    switch (S.code) {
      case "aas": case "stopped": g.allowed = []; g.expected = null; break;
      case "board": g.allowed = ["board"]; g.expected = "board"; break;
      case "dp_cdr": g.allowed = ["dp_cdr"]; g.expected = "dp_cdr"; break;
      case "dp_ae": g.allowed = ["dp_ae"]; g.expected = "dp_ae"; break;
      case "oral_exam": g.allowed = ["ae_written"]; g.expected = "ae_written"; break;
      case "practice": g.allowed = ["practice"]; g.expected = "practice"; break;
      case "cdr_decides": g.allowed = ["cdr_decision"]; g.expected = "cdr_decision"; break;
      case "apt": g.allowed = ["apt", "flight", "fs"].concat(GROUND); g.expected = "apt"; break;
      case "fs_ladder": g.allowed = ["fs", "flight"].concat(GROUND); g.expected = "fs"; break;
      default: g.allowed = ["flight", "fs"].concat(GROUND); g.expected = "flight";
    }
    return g;
  }

  /* ── presets — FABRICATED sequences, no student anywhere ───────────────── */
  const PRESETS = [
    { id: "p1g", title: "1γ — τρεις ΥΣΤΕΡΗΣΕΙΣ μετά τη χάρη → ΑΕ → Δκτής → Συμβούλιο", events: [
      { t: "flight", cat: "contact", res: "pass" }, { t: "flight", cat: "contact", res: "pass" }, { t: "flight", cat: "contact", res: "pass" }, { t: "flight", cat: "contact", res: "pass" },
      { t: "flight", cat: "contact", res: "lag" }, { t: "flight", cat: "contact", res: "lag" }, { t: "flight", cat: "contact", res: "lag" },
      { t: "dp_ae", res: "fail" }, { t: "dp_cdr", res: "fail" }, { t: "board", res: "continue" }, { t: "practice", res: "pass" }] },
    { id: "p1st", title: "1στ — δύο συνεχόμενες γραπτές → απευθείας Συμβούλιο", events: [
      { t: "written", res: "score", score: 72 }, { t: "written", res: "fail" }] },
    { id: "p1z", title: "1ζ — τέσσερις προφορικές → γραπτή → αποτυχία → επανεξέταση ΑΕ (μία κλίμακα)", events: [
      { t: "oral", res: "fail" }, { t: "oral", res: "fail" }, { t: "oral", res: "pass" }, { t: "oral", res: "fail" }, { t: "oral", res: "fail" }, { t: "oral", res: "fail" }, { t: "oral", res: "fail" }, { t: "ae_written", res: "fail" }] },
    { id: "p1b", title: "1β — Αξιολόγηση 55% με ναυτία → Δοκιμή Προόδου ΑΕ ≥60%", events: [
      { t: "flight", cat: "contact", res: "pass" }, { t: "flight", cat: "contact", role: "checkride", res: "score", score: 55, nausea: "pre_ok" }, { t: "dp_ae", res: "score", score: 68 }] },
    { id: "p1e", title: "F/S — τελευταία ενότητας ×3 → ΠΔ 1ε στον εξομοιωτή", events: [
      { t: "fs", cat: "instrument", role: "last", res: "lag" }, { t: "fs", cat: "instrument", role: "last", res: "fail" }, { t: "fs", cat: "instrument", role: "last", res: "lag" }] },
    { id: "p30z", title: "§30ζ — τελευταία πτήση ενότητας → Εξέταση Καταλληλότητας → αποτυχία → ΠΔ", events: [
      { t: "flight", cat: "formation", role: "last", res: "lag" }, { t: "apt", cat: "formation", res: "fail" }] },
    { id: "p1h", title: "1η — απειθαρχία → απευθείας Συμβούλιο → ΚΑΤΑ", events: [
      { t: "incident", kind: "1h" }, { t: "board", res: "stop" }] },
    { id: "p1ia", title: "1ια — ατύχημα με πόρισμα ΕΔΕ → ΑΑΣ", events: [{ t: "incident", kind: "1ia" }] },
    { id: "pnausea", title: "Ναυτία ×2 (εξαιρούμενη) → ΚΕΠΕ, χωρίς 1γ", events: [
      { t: "flight", cat: "contact", res: "pass" }, { t: "flight", cat: "contact", res: "pass" }, { t: "flight", cat: "contact", res: "pass" }, { t: "flight", cat: "contact", res: "pass" },
      { t: "flight", cat: "contact", nausea: "pre_ok" }, { t: "flight", cat: "contact", nausea: "pre_ok" }, { t: "flight", cat: "contact", res: "lag" }] },
  ];

  /* ══════════════════════════════════════════════════════════════════════════
     § 1-3  RENDERING — only when there is a document
     ══════════════════════════════════════════════════════════════════════════ */
  const UI = { tab: "matrix", tree: null, sel: null, events: [], denom_1d: "planned", host: null, matrix: null, q: "" };

  const chip = (c) => `<button type="button" class="bt-cite" data-cite="${esc(c.id)}" title="${esc(c.why || "")}">${esc(c.id)}</button>`;
  const chips = (list) => (list || []).length ? `<span class="bt-cites">${list.map(chip).join("")}</span>` : "";
  function srcLine(c) { return `📄 ${esc(c.file)} · σελ. PDF ${esc(String(c.page_pdf))} · ${esc(c.ref)}`; }

  /* drawer — the flowchart.js one, same classes, own element */
  function drawer() {
    let d = document.getElementById("bt-drawer");
    if (!d) {
      d = document.createElement("div"); d.id = "bt-drawer"; d.className = "fc-drawer hidden"; d.setAttribute("role", "dialog");
      d.addEventListener("click", (ev) => { const t = ev.target; if (t === d || t.closest("[data-close]")) d.classList.add("hidden"); });
      document.body.appendChild(d);
      document.addEventListener("keydown", (ev) => { if (ev.key === "Escape") d.classList.add("hidden"); });
    }
    return d;
  }
  function openDrawer(title, body) {
    const d = drawer();
    d.innerHTML = `<div class="fc-drawer-box"><div class="fc-drawer-head"><h3>${title}</h3><button type="button" class="fc-tbtn" data-close aria-label="Κλείσιμο">✕</button></div><div class="fc-drawer-body">${body}</div></div>`;
    d.classList.remove("hidden");
  }
  function citeBlock(c, why) {
    const r = citeOf(c.id || c);
    if (!r) return `<div class="bt-c"><b>${esc(c.id || c)}</b> <span class="hint">— δεν υπάρχει στο ευρετήριο των δέντρων</span></div>`;
    return `<div class="bt-c"><div class="bt-c-head"><b class="obs-prefix">${esc(r.id)}</b> <span class="req-src">${srcLine(r)}</span> <button type="button" class="req-link" data-req="${esc(r.id)}">↗ Requirements</button></div>
      <p class="verbatim">${esc(r.verbatim)}</p>
      ${why ? `<p class="bt-expl"><b>Πώς ερμηνεύεται εδώ:</b> ${esc(why)}</p>` : ""}</div>`;
  }
  function openCite(id, why) {
    const r = citeOf(id);
    if (!r) return;
    const uses = r.uses.map((u) => `<li><span class="badge">${esc(u.treeTitle)}</span> ${u.nodeLabel ? esc(u.nodeLabel) + ": " : ""}${esc(u.explanation)}</li>`).join("");
    openDrawer(`${esc(r.id)} — ${esc(r.ref)}`, `${citeBlock({ id: id }, why)}<h4 class="bt-h4">Πού χρησιμοποιείται στα δέντρα και πώς ερμηνεύεται</h4><ul class="fc-ul">${uses || "<li>—</li>"}</ul>`);
  }

  /* § 1 — the matrix, properly */
  function kv(o) {
    if (!o || typeof o !== "object") return "";
    return Object.keys(o).filter((k) => k !== "statement").map((k) => { const v = o[k]; return `<span class="badge kv">${esc(k)}: ${esc(Array.isArray(v) || (v && typeof v === "object") ? JSON.stringify(v) : String(v))}</span>`; }).join("");
  }
  function renderMatrix(host, data, q) {
    const rows = (data.entries || []).filter((e) => !q || JSON.stringify(e).toLowerCase().indexOf(q) >= 0);
    const notes = (data.reading_notes || []).map((n) => `<li>${esc(n)}</li>`).join("");
    const cards = rows.map((e, i) => {
      const ab = e.allowed_before_board || {};
      const src = (e.sources || []).map((s) => `<span class="badge kv bt-src" title="${esc(s.ref)}"><button type="button" class="bt-cite" data-cite="${esc(s.requirement_id)}">${esc(s.requirement_id)}</button> ${esc(s.file)} σ.${esc(String(s.page_pdf))}</span>`).join("");
      const unres = (e.unresolved || []).length ? `<details class="bt-unres"><summary>⚠ ${e.unresolved.length} απορία/ες — δεν επιλύονται από τις πηγές</summary><ul class="fc-ul">${e.unresolved.map((u) => `<li>${esc(u)}</li>`).join("")}</ul></details>` : "";
      return `<div class="obs-card req-card bt-mx" data-ix="${i}">
        <div class="obs-head"><span class="obs-prefix">${i + 1}</span><strong>${esc(e.failure_kind)}</strong><span class="badge">${esc(e.domain)}</span></div>
        <p class="obs-text"><b>Πόσες φορές χωρίς Συμβούλιο:</b> ${esc(ab.statement || "—")}</p>
        <div class="kv-row">${kv(ab)}</div>
        <h5 class="bt-h5">Κλίμακα</h5><ol class="bt-ladder">${(e.ladder || []).map((l) => `<li>${esc(l)}</li>`).join("")}</ol>
        ${e.source_board_path ? `<p class="hint"><b>Διαδρομή προς Συμβούλιο:</b> ${esc(e.source_board_path)}</p>` : ""}
        <details><summary>Κείμενο πηγής (verbatim)</summary><p class="verbatim">${esc(e.threshold_verbatim || "")}</p></details>
        <div class="kv-row">${src}</div>
        ${unres}
      </div>`;
    }).join("");
    host.innerHTML = `<div class="bt-note"><b>Οδηγός ανάγνωσης</b><ul class="fc-ul">${notes}</ul></div>${cards || `<p class="hint">Καμία εγγραφή δεν ταιριάζει.</p>`}`;
    return rows.length;
  }

  /* § 2 — the trees */
  function treeOutline(t) {
    const byId = new Map(t.nodes.map((n) => [n.id, n]));
    const out = new Map();
    for (const e of t.edges) { if (!out.has(e.from)) out.set(e.from, []); out.get(e.from).push(e); }
    const seen = new Set();
    const K = DATA.node_kinds || {};
    const A = DATA.actors || {};
    function nodeBtn(n) {
      const ext = !byId.has(n.id);
      const link = n.link_tree ? `<span class="fc-b bt-b-link" title="συνέχεια στο δέντρο «${esc((DATA.trees.find((x) => x.id === n.link_tree) || {}).short || n.link_tree)}»">→ ${esc((DATA.trees.find((x) => x.id === n.link_tree) || {}).short || n.link_tree)}</span>` : "";
      const who = n.next_with && n.next_with !== "na" ? `<span class="fc-b bt-b-who" title="Με ποιον πετά μετά">✈ ${esc(A[n.next_with] || n.next_with)}</span>` : "";
      const eng = n.engine === "schedconsq" ? `<span class="fc-b bt-b-eng" title="Το όριο ζει στον SchedConsq (ίδιος κώδικας με τον Scheduler)">SchedConsq</span>` : n.engine === "both" ? `<span class="fc-b bt-b-eng">SchedConsq+δεδομένα</span>` : "";
      const unres = (n.unresolved || []).length ? `<span class="fc-b fc-b-warn" title="${esc(n.unresolved.join(" · "))}">⚠ ${n.unresolved.length}</span>` : "";
      const rul = (n.rulings || []).length ? `<span class="fc-b bt-b-who" title="${esc(n.rulings.map((r) => r.date + " — " + r.by + ": " + r.text).join(" · "))}">✓ απόφανση ${n.rulings.length}</span>` : "";
      return `<button type="button" class="bt-node is-${esc(n.kind)}${UI.sel === n.id ? " fc-sel" : ""}" data-node="${esc(n.id)}" aria-pressed="${UI.sel === n.id}" title="${esc(K[n.kind] || n.kind)}">
        <span class="bt-n-k">${esc(K[n.kind] || n.kind)}</span>
        <span class="bt-n-l">${esc(n.label)}</span>
        ${n.threshold ? `<span class="bt-n-t">${esc(n.threshold)}</span>` : ""}
        <span class="bt-n-b">${eng}${who}${link}${rul}${unres}${(n.cites || []).length ? `<span class="fc-b">${n.cites.length} §</span>` : ""}${ext ? `<span class="fc-b bt-b-link">άλλο δέντρο</span>` : ""}</span>
      </button>`;
    }
    function rec(id, depth, label) {
      const n = byId.get(id) || (nodeOf(id) || {}).node;
      if (!n) return "";
      const edgeLbl = label ? `<span class="bt-edge">${esc(label)}</span>` : "";
      if (seen.has(id)) return `<div class="bt-row" style="--d:${depth}">${edgeLbl}<button type="button" class="bt-ref" data-jump="${esc(id)}">↩ ${esc(n.label)}</button></div>`;
      seen.add(id);
      let h = `<div class="bt-row" style="--d:${depth}">${edgeLbl}${nodeBtn(n)}</div>`;
      for (const e of (out.get(id) || [])) h += rec(e.to, depth + 1, e.label);
      return h;
    }
    let h = rec(t.root, 0, "");
    for (const n of t.nodes) if (!seen.has(n.id)) h += rec(n.id, 0, "(ανεξάρτητη αφετηρία)");
    return h;
  }
  function nodeDetail(id) {
    const hit = nodeOf(id);
    if (!hit) return;
    const n = hit.node, t = hit.tree, A = DATA.actors || {};
    const rows = [["Δέντρο", t.title], ["Είδος κόμβου", (DATA.node_kinds || {})[n.kind] || n.kind], ["Συνθήκη", n.condition], ["Κατώφλι / μετρητής", n.threshold], ["Έκβαση", n.outcome], ["Επόμενη πτήση με", n.next_with && n.next_with !== "na" ? A[n.next_with] || n.next_with : "—"], ["Κινητήρας", n.engine === "schedconsq" ? "SchedConsq — το όριο ζει στον app/schedconsq.js, ο ίδιος κώδικας με τον Scheduler" : n.engine === "both" ? "SchedConsq + δεδομένα δέντρων" : "Δεδομένα δέντρων (board_decision_trees.json) — ο SchedConsq δεν ξέρει τον κανόνα"]]
      .filter((r) => r[1]).map((r) => `<tr><th>${esc(r[0])}</th><td>${esc(r[1])}</td></tr>`).join("");
    const cites = (n.cites || []).map((c) => citeBlock({ id: c.requirement_id }, c.explanation)).join("");
    const unres = (n.unresolved || []).length ? `<h4 class="bt-h4">⚠ Απορίες — δεν επιλύονται από τις πηγές</h4><ul class="fc-ul bt-unres-list">${n.unresolved.map((u) => `<li>${esc(u)}</li>`).join("")}</ul>` : "";
    const rul = (n.rulings || []).length ? `<h4 class="bt-h4">✓ Αποφάνσεις</h4>${n.rulings.map((r) => `<div class="bt-c bt-ruling"><b>${esc(r.date)} — ${esc(r.by)}</b><p class="obs-text">${esc(r.text)}</p>${r.quote ? `<p class="bt-expl">«${esc(r.quote)}»</p>` : ""}</div>`).join("")}` : "";
    const link = n.link_tree ? `<p class="hint">Συνέχεια: <button type="button" class="req-link" data-tree="${esc(n.link_tree)}">${esc((DATA.trees.find((x) => x.id === n.link_tree) || {}).title || n.link_tree)}</button></p>` : "";
    openDrawer(esc(n.label), `<table class="spec-table bt-kv"><tbody>${rows}</tbody></table>${link}<h4 class="bt-h4">Παραπομπές — τι λέει και πώς ερμηνεύεται (${(n.cites || []).length})</h4>${cites || "<p class='hint'>—</p>"}${rul}${unres}`);
  }
  function renderTrees(host) {
    const L = DATA.lettering || {};
    const map = (L.map || []).map((m) => `<tr><td class="num">${esc(m.pd)}</td><td class="num">${esc(m.doc301)}</td><td>${esc(m.topic)}</td><td class="prov">${esc(m.requirement_id)}</td></tr>`).join("");
    const letter = `<details class="bt-note bt-letter"><summary>⚠ ΠΡΟΣΟΧΗ ΣΤΗΝ ΑΡΙΘΜΗΣΗ: η 3-01 §58 έχει ${esc(String(L.doc301_cases_count))} περιπτώσεις, το ΠΔ ${esc(String(L.pd_cases_count))} — από το «${esc(L.offset_from)}» κάθε γράμμα της 3-01 είναι +${esc(String(L.offset_amount))}</summary>
      <p class="hint">${esc(L.note || "")}</p>
      <div class="mif-scroll"><table class="spec-table"><thead><tr><th>ΠΔ 29/2020 αρ.3</th><th>3-01 §58</th><th>Θέμα</th><th>απαίτηση</th></tr></thead><tbody>${map}</tbody></table></div>
      ${L.cite ? `<div class="kv-row">${chip({ id: L.cite.requirement_id, why: L.cite.explanation })}</div>` : ""}</details>`;
    const tabs = DATA.trees.map((t) => `<button type="button" class="fc-pill bt-tpill" data-tree="${esc(t.id)}" aria-pressed="${UI.tree === t.id}" title="${esc(t.title)}">${esc(t.short || t.title)}${t.pd_cases && t.pd_cases.length ? ` <span class="bt-pd">${esc(t.pd_cases.join(" "))}</span>` : ""}</button>`).join("");
    const t = DATA.trees.find((x) => x.id === UI.tree) || DATA.trees[0];
    UI.tree = t.id;
    host.innerHTML = `${letter}<div class="bt-tabs">${tabs}</div>
      <div class="bt-tree">
        <h3 class="bt-tt">${esc(t.title)}</h3>
        <p class="obs-text">${esc(t.summary || "")}</p>
        ${t.engine_note ? `<p class="hint bt-eng">⚙ ${esc(t.engine_note)}</p>` : ""}
        <p class="hint">Κλικ σε κόμβο: συνθήκη · κατώφλι · έκβαση · με ποιον πετά · κάθε παραπομπή με το κείμενό της και την ερμηνεία.</p>
        <div class="bt-outline">${treeOutline(t)}</div>
      </div>`;
  }

  /* § 3 — the sandbox */
  function evForm(gate) {
    const catSel = `<select data-f="cat">${CATS.map((c) => `<option value="${c}">${esc(CAT_LABEL[c])}</option>`).join("")}</select>`;
    const resSel = (opts) => `<select data-f="res">${opts.map((o) => `<option value="${o}">${esc(RES_LABEL[o] || o)}</option>`).join("")}</select>`;
    const types = gate.allowed;
    if (!types.length) return `<div class="bt-form bt-form-none"><span class="hint">Καμία πτητική ή εξεταστική ενέργεια δεν προσφέρεται σε αυτή τη θέση.</span></div>`;
    return `<div class="bt-form">
      <label class="lbl">Γεγονός <select id="bt-ev-t">${types.map((k) => `<option value="${k}"${k === gate.expected ? " selected" : ""}>${esc(EV_LABEL[k])}${k === gate.expected ? " — αναμενόμενο" : ""}</option>`).join("")}</select></label>
      <span class="bt-f bt-f-flight bt-f-fs bt-f-apt bt-f-kepe_in">${catSel.replace('data-f="cat"', 'data-f="cat" id="bt-ev-cat"')}</span>
      <span class="bt-f bt-f-flight bt-f-fs"><select id="bt-ev-role">${Object.keys(ROLE_LABEL).map((k) => `<option value="${k}">${esc(ROLE_LABEL[k])}</option>`).join("")}</select></span>
      <span class="bt-f bt-f-flight bt-f-fs bt-f-dp_ae bt-f-dp_cdr bt-f-apt bt-f-written bt-f-stage_exam bt-f-practice">${resSel(["pass", "lag", "fail", "score"]).replace('data-f="res"', 'data-f="res" id="bt-ev-res"')}</span>
      <span class="bt-f bt-f-oral bt-f-ae_written"><select id="bt-ev-res2"><option value="pass">ΕΠΙΤΥΧΩΝ</option><option value="fail">ΑΠΟΤΥΧΩΝ</option></select></span>
      <span class="bt-f bt-f-board"><select id="bt-ev-res3"><option value="continue">ΥΠΕΡ της συνέχισης</option><option value="stop">ΚΑΤΑ της συνέχισης</option></select></span>
      <span class="bt-f bt-f-cdr_decision"><select id="bt-ev-res4"><option value="continue">Συνέχιση</option><option value="refer">Εκ νέου παραπομπή (κατ' εξαίρεση ΔΠ)</option></select></span>
      <span class="bt-f bt-f-flight bt-f-fs bt-f-dp_ae bt-f-dp_cdr bt-f-apt bt-f-written bt-f-stage_exam bt-f-blind bt-f-practice"><input type="number" id="bt-ev-score" min="0" max="100" placeholder="βαθμός %" style="width:92px"></span>
      <span class="bt-f bt-f-flight bt-f-fs bt-f-dp_ae bt-f-dp_cdr bt-f-apt bt-f-practice"><select id="bt-ev-nausea"><option value="">χωρίς ναυτία</option><option value="pre_ok">ΑΕΡΟΝΑΥΤΙΑ — πριν ≥60% / μη αξιολογήσιμη</option><option value="pre_bad">ΑΕΡΟΝΑΥΤΙΑ — πριν <60%</option></select></span>
      <span class="bt-f bt-f-dp_ae bt-f-dp_cdr bt-f-kepe_in"><select id="bt-ev-medium"><option value="flights">στον αέρα</option><option value="fs">στον εξομοιωτή</option></select></span>
      <span class="bt-f bt-f-incident"><select id="bt-ev-kind">${Object.keys(INC_LABEL).map((k) => `<option value="${k}">${esc(INC_LABEL[k])}</option>`).join("")}</select></span>
      <button type="button" class="fc-tbtn bt-add" id="bt-add">+ Προσθήκη</button>
    </div>`;
  }
  function readForm() {
    const t = document.getElementById("bt-ev-t").value;
    const e = { t: t };
    const v = (id) => { const el = document.getElementById(id); return el ? el.value : ""; };
    if (t === "flight" || t === "fs" || t === "apt" || t === "kepe_in") e.cat = v("bt-ev-cat");
    if (t === "flight" || t === "fs") e.role = v("bt-ev-role");
    if (["flight", "fs", "dp_ae", "dp_cdr", "apt", "practice"].indexOf(t) >= 0) { const nz = v("bt-ev-nausea"); if (nz) e.nausea = nz; }
    if (["flight", "fs", "dp_ae", "dp_cdr", "apt", "written", "stage_exam", "practice"].indexOf(t) >= 0) { e.res = v("bt-ev-res"); if (e.res === "score") e.score = Number(v("bt-ev-score")); }
    if (t === "blind") { e.res = "score"; e.score = Number(v("bt-ev-score")); }
    if (t === "oral" || t === "ae_written") e.res = v("bt-ev-res2");
    if (t === "board") e.res = v("bt-ev-res3");
    if (t === "cdr_decision") e.res = v("bt-ev-res4");
    if (t === "dp_ae" || t === "dp_cdr" || t === "kepe_in") e.medium = v("bt-ev-medium");
    if (t === "incident") e.kind = v("bt-ev-kind");
    return e;
  }
  function evText(e) {
    let s = EV_LABEL[e.t] || e.t;
    if (e.cat) s += " · " + (CAT_LABEL[e.cat] || e.cat);
    if (e.role && e.role !== "normal") s += " · " + ROLE_LABEL[e.role];
    if (e.kind) s += " · " + (INC_LABEL[e.kind] || e.kind);
    if (e.medium === "fs") s += " · εξομοιωτής";
    /* on a Δοκιμή Προόδου / Εξέταση Καταλληλότητας the παρ.2 exemption does not
       reach (R8c): the label must not claim it */
    const dp = e.t === "dp_ae" || e.t === "dp_cdr" || e.t === "apt" || e.t === "practice";
    if (e.nausea && dp && e.res !== "score") s += " → ΑΕΡΟΝΑΥΤΙΑ (59%)";
    else if (e.res) s += " → " + (e.res === "score" ? e.score + "%" : (RES_LABEL[e.res] || e.res));
    if (e.nausea && !(dp && e.res !== "score")) s += " · ΑΕΡΟΝΑΥΤΙΑ" + (dp ? " (η παρ.2 δεν φτάνει εδώ)" : e.nausea === "pre_ok" ? " (εξαιρείται 1γ/1δ)" : " (μετρά)");
    return s;
  }
  function renderSandbox(host) {
    const presets = PRESETS.map((p) => `<option value="${p.id}">${esc(p.title)}</option>`).join("");
    let res = null, err = "";
    try { res = evaluate(UI.events, DATA, { denom_1d: UI.denom_1d }); } catch (e) { err = String(e && e.message || e); }
    const gate = allowedEvents(res);
    const stateLine = res ? `<div class="bt-state is-${esc(res.status.code)}"><b>Θέση:</b> ${esc(res.status.title)} ${chips(res.status.cites)}<br><b>Αναμενόμενο:</b> ${gate.expected ? esc(EV_LABEL[gate.expected]) : "τίποτα — " + esc(res.status.next)}</div>` : "";
    const evRows = UI.events.map((e, i) => {
      const row = res ? res.timeline[i] : null;
      const fired = row ? row.fired.map((f) => `<div class="bt-fire"><span class="fc-b fc-b-final">${esc(f.case)}</span> ${esc(f.text)} ${chips(f.cites)}</div>`).join("") : "";
      const notes = row ? row.notes.map((x) => `<div class="bt-nt">${esc(x.text)} ${chips(x.cites)}</div>`).join("") : "";
      const stg = row && row.stage ? `<span class="fc-b ${row.stage.effective === "board" ? "fc-b-night" : "fc-b-warn"}">κρίση: ${esc(row.stage.effective)}${row.stage.engine !== row.stage.effective ? " (SchedConsq " + esc(row.stage.engine) + ")" : ""}</span>` : "";
      return `<tr class="bt-ev${row && row.fired.length ? " is-fired" : ""}">
        <td class="num">${i + 1}</td><td class="num">${row ? esc(CQ().fmtDay(row.date)) : ""}</td>
        <td><div class="bt-ev-l">${esc(evText(e))}</div>${row && row.band ? `<span class="fc-b ${/ΑΠΟΤΥΧ|ΥΣΤΕΡ|ΚΑΤΑ/.test(row.band) ? "fc-b-night" : ""}">${esc(row.band)}</span>` : ""} ${stg}</td>
        <td>${fired}${notes}</td>
        <td class="bt-ev-act"><button type="button" class="req-link" data-mv="${i}" data-dir="-1" title="πάνω">▲</button><button type="button" class="req-link" data-mv="${i}" data-dir="1" title="κάτω">▼</button><button type="button" class="req-link" data-del="${i}" title="διαγραφή">✕</button></td></tr>`;
    }).join("");
    let verdict = "";
    if (res) {
      const S = res.status, C = res.counters;
      const pct = (o) => `${o.bad}/${o.total} = ${o.pct}%`;
      const bar = (label, val, lim, cites) => `<div class="bt-ctr${val >= lim ? " is-hot" : ""}"><span class="bt-ctr-l">${esc(label)}</span><span class="bt-ctr-v">${esc(String(val))} / ${esc(String(lim))}</span>${chips(cites)}</div>`;
      const kepe = C.kepe.length ? C.kepe.map((k) => `<div class="bt-ctr${k.exhausted ? " is-hot" : ""}"><span class="bt-ctr-l">ΚΕΠΕ ${esc(k.label)}${k.active ? " (ενεργή)" : ""}</span><span class="bt-ctr-v">${k.entries} / ${k.cap}</span></div>`).join("") : `<p class="hint">Καμία είσοδος ΚΕΠΕ.</p>`;
      verdict = `<div class="bt-verdict is-${esc(S.code)}">
        <h3>${esc(S.title)}</h3>
        <table class="spec-table bt-kv"><tbody>
          <tr><th>Επόμενη πτήση με</th><td><b>${esc(S.actor)}</b></td></tr>
          <tr><th>Τι γίνεται τώρα</th><td>${esc(S.next)}</td></tr>
          ${S.if_fail ? `<tr><th>Αν αποτύχει και σε αυτό</th><td>${esc(S.if_fail)}</td></tr>` : ""}
          <tr><th>Παραπομπές</th><td>${chips(S.cites)}</td></tr>
        </tbody></table>
        ${S.notes.length ? `<div class="bt-overlay">${S.notes.map((x) => `<div class="bt-nt">⚙ ${esc(x.text)} ${chips(x.cites)}</div>`).join("")}</div>` : ""}
      </div>
      <h4 class="bt-h4">Μετρητές (SchedConsq.countersFrom — ίδιος κώδικας με τον Progress editor)</h4>
      <div class="bt-ctrs">
        ${bar("1γ(Α) συνεχόμενες 0-49% (μετά 4 χάρης)", C.c049.value, C.c049.limit, [R("fail-76", "2 συνεχόμενες 0-49%.")])}
        ${bar("1γ(Β) συνεχόμενες 0-59% (μετά 4 χάρης)", C.c059.value, C.c059.limit, [R("fail-76", "3 συνεχόμενες 0-59%.")])}
        <div class="bt-ctr${(!C.preSolo.soloDone && (UI.denom_1d === "planned" ? C.preSolo.bad > 0 && C.plannedPrePct >= 40 : C.preSolo.total && C.preSolo.pct >= 40)) ? " is-hot" : ""}"><span class="bt-ctr-l">1δ ΠΡΟ ΜΟΝΟΣ 0-59% (${UI.denom_1d === "planned" ? C.preSoloSorties + " τυπωμένες — MIF" : "εκτελεσθείσες"})${C.preSolo.soloDone ? " · φάση κλειστή" : ""}</span><span class="bt-ctr-v">${UI.denom_1d === "planned" ? esc(C.preSolo.bad + "/" + C.preSoloSorties + " = " + C.plannedPrePct + "%") : esc(pct(C.preSolo))} / 40%</span>${chips([R("fail-77", "40% και άνω των πτήσεων ΠΡΟ ΜΟΝΟΣ — η φάση έχει 15 τυπωμένες εξόδους (πίνακας MIF «CONTACT (PRE-SOLO)», Syllabus PDF 92) → 6. Απόφανση ιδιοκτήτη 17/10/2026: το τυπωμένο πρόγραμμα.")])}</div>
        <div class="bt-ctr${(C.totalFl.total && (UI.denom_1d === "planned" ? C.plannedPct : C.totalFl.pct) >= 20) ? " is-hot" : ""}"><span class="bt-ctr-l">1δ ΣΥΝΟΛΟ 0-59% (${UI.denom_1d === "planned" ? C.plannedSorties + " τυπωμένες" : "εκτελεσθείσες"})</span><span class="bt-ctr-v">${UI.denom_1d === "planned" ? esc(C.totalFl.bad + "/" + C.plannedSorties + " = " + C.plannedPct + "%") : esc(pct(C.totalFl))} / 20%</span>${chips([R("fail-77", "20% και άνω των συνολικών πτήσεων του σταδίου — 85 τυπωμένες → 17. Απόφανση ιδιοκτήτη 17/10/2026: «όχι σε όσες έχει πετάξει μέχρι τώρα, αλλά στο σύνολο».")])}</div>
        ${bar("1ε(αα) συνεχόμενες F/S 0-59% (μετά 3 χάρης)", C.fs059.value, C.fs059.limit, [R("fail-40", "3 συνεχόμενες μετά τις 3 πρώτες.")])}
        <div class="bt-ctr${(C.fsCum.bad >= 3 && C.fsCum.pct >= 20) ? " is-hot" : ""}"><span class="bt-ctr-l">1ε(αβ) F/S 0-59% ≥20% και ≥3</span><span class="bt-ctr-v">${esc(pct(C.fsCum))} (≥3)</span>${chips([R("fail-40", "20% των εξόδων του σταδίου και όχι λιγότερες από 3.")])}</div>
        ${bar("1στ συνεχόμενες γραπτές", C.written.streak, C.written.limit, [R("fail-32", "2 συνεχόμενες γραπτές → απευθείας Συμβούλιο.")])}
        ${bar("1ζ συνεχόμενες προφορικές", C.oral.streak, C.oral.limitC, [R("fail-36", "4 συνεχόμενες.")])}
        ${bar("1ζ συνολικές προφορικές", C.oral.total, C.oral.limitT, [R("fail-36", "8 μη συνεχόμενες.")])}
        ${bar("Δοκιμές Προόδου ΑΕ στο στάδιο (παρ.7 — ανά ΣΤΑΔΙΟ, όχι ανά κατηγορία)", C.dpUsed.ae, 1, [R("fail-24", "Ο ΑΕ κρίνει μία φορά ανά στάδιο, πέρασε ή όχι.")])}
        ${bar("Δοκιμές Προόδου Δκτή στο στάδιο (παρ.9: " + (C.dpUsed.ae ? (C.dpUsed.aePassed ? "ΑΕ ≥60% → 1" : "ΑΕ <60% → 2") : "ορίζεται από τη Δοκιμή ΑΕ") + ")", C.dpUsed.cdr, C.dpUsed.ae ? C.dpUsed.budget : 2, [R("fail-26", "1 ή 2 ανάλογα με τον βαθμό της Δοκιμής ΑΕ· μετά Συμβούλιο χωρίς Δοκιμή Προόδου.")])}
        ${kepe}
      </div>`;
    }
    host.innerHTML = `<div class="bt-note bt-sbx-note"><b>ΔΟΚΙΜΑΣΤΗΡΙΟ.</b> Συνθετικά γεγονότα μόνο — τίποτα δεν διαβάζεται από τον Scheduler, κανένα όνομα, κανένας μαθητής. Οι ημερομηνίες είναι εικονικές (μία εργάσιμη ανά γεγονός) και χρησιμεύουν μόνο στους κανόνες αναπρογραμματισμού.</div>
      <div class="bt-sbx-bar">
        <label class="lbl">Σενάριο <select id="bt-preset"><option value="">— επιλογή —</option>${presets}</select></label>
        <label class="lbl">1δ παρονομαστής (απόφανση ιδιοκτήτη 17/10/2026: το τυπωμένο πρόγραμμα) <select id="bt-denom"><option value="planned"${UI.denom_1d === "planned" ? " selected" : ""}>τυπωμένο πρόγραμμα: 15 ΠΡΟ ΜΟΝΟΣ (→ 6) · 85 Στάδιο (→ 17)</option><option value="executed"${UI.denom_1d === "executed" ? " selected" : ""}>εκτελεσθείσες ως τώρα (ανάγνωση Progress editor, προς σύγκριση)</option></select></label>
        <button type="button" class="fc-tbtn" id="bt-clear">Καθαρισμός</button>
      </div>
      ${stateLine}
      ${evForm(gate)}
      ${err ? `<p class="hint" style="color:var(--bad)">Σφάλμα: ${esc(err)}</p>` : ""}
      <div class="mif-scroll"><table class="spec-table bt-evs"><thead><tr><th>#</th><th>ημέρα</th><th>γεγονός</th><th>τι ενεργοποιήθηκε · συνέπειες</th><th></th></tr></thead><tbody>${evRows || `<tr><td colspan="5" class="hint">Πρόσθεσε γεγονότα ή διάλεξε σενάριο.</td></tr>`}</tbody></table></div>
      ${verdict}`;
    const sel = document.getElementById("bt-ev-t");
    if (sel) {
      const sync = () => { const t = sel.value; for (const el of host.querySelectorAll(".bt-f")) el.classList.toggle("hidden", !el.classList.contains("bt-f-" + t)); };
      sel.addEventListener("change", sync); sync();
    }
  }

  /* host-level render + delegation */
  function render() {
    const host = UI.host;
    if (!host || !DATA) return;
    const tabs = [["matrix", "Πίνακας ανοχής"], ["trees", "Δέντρα αποφάσεων"], ["sandbox", "Δοκιμαστήριο"]]
      .map((t) => `<button type="button" class="fc-pill bt-tab" data-tab="${t[0]}" aria-pressed="${UI.tab === t[0]}">${t[1]}</button>`).join("");
    host.innerHTML = `<div class="bt-tabs bt-top">${tabs}</div><div id="bt-body"></div>`;
    const body = document.getElementById("bt-body");
    let count = "";
    if (UI.tab === "matrix") count = renderMatrix(body, UI.matrix, UI.q) + " εγγραφές";
    else if (UI.tab === "trees") { renderTrees(body); count = DATA.trees.length + " δέντρα"; }
    else { renderSandbox(body); count = UI.events.length + " γεγονότα"; }
    const cnt = document.getElementById("req-count"); if (cnt) cnt.textContent = count;
  }
  function wire(host) {
    if (host._btWired) return;
    host._btWired = true;
    host.addEventListener("click", (ev) => {
      const t = ev.target instanceof Element ? ev.target : null;
      if (!t) return;
      const tab = t.closest(".bt-tab"); if (tab) { UI.tab = tab.dataset.tab; render(); return; }
      const tp = t.closest(".bt-tpill"); if (tp) { UI.tree = tp.dataset.tree; UI.sel = null; render(); return; }
      const c = t.closest("[data-cite]"); if (c) { openCite(c.dataset.cite, c.getAttribute("title") || ""); return; }
      const nd = t.closest("[data-node]"); if (nd) { UI.sel = nd.dataset.node; nodeDetail(nd.dataset.node); return; }
      const jp = t.closest("[data-jump]"); if (jp) { const hit = nodeOf(jp.dataset.jump); if (hit) { UI.tree = hit.tree.id; UI.sel = hit.node.id; render(); } return; }
      if (t.id === "bt-add") { const e = readForm(); const g = allowedEvents(evaluate(UI.events, DATA, { denom_1d: UI.denom_1d })); if (g.allowed.indexOf(e.t) >= 0) { UI.events.push(e); render(); } return; }
      if (t.id === "bt-clear") { UI.events = []; render(); return; }
      const del = t.closest("[data-del]"); if (del) { UI.events.splice(Number(del.dataset.del), 1); render(); return; }
      const mv = t.closest("[data-mv]"); if (mv) { const i = Number(mv.dataset.mv), j = i + Number(mv.dataset.dir); if (j >= 0 && j < UI.events.length) { const x = UI.events[i]; UI.events[i] = UI.events[j]; UI.events[j] = x; render(); } return; }
    });
    host.addEventListener("change", (ev) => {
      const t = ev.target;
      if (t.id === "bt-preset") { const p = PRESETS.find((x) => x.id === t.value); if (p) { UI.events = p.events.map((e) => Object.assign({}, e)); render(); } }
      else if (t.id === "bt-denom") { UI.denom_1d = t.value; render(); }
    });
    document.addEventListener("click", (ev) => {
      const t = ev.target instanceof Element ? ev.target : null;
      if (!t || !t.closest("#bt-drawer")) return;
      const c = t.closest("[data-cite]"); if (c) { openCite(c.dataset.cite, c.getAttribute("title") || ""); return; }
      const rq = t.closest("[data-req]"); if (rq && window.openRequirements) { drawer().classList.add("hidden"); window.openRequirements(rq.dataset.req); return; }
      const tr = t.closest("[data-tree]"); if (tr) { UI.tab = "trees"; UI.tree = tr.dataset.tree; UI.sel = null; drawer().classList.add("hidden"); render(); return; }
    });
  }

  /* entry point from app.js: the Board Tolerance Matrix branch of renderReqList */
  function renderBoardArea(host, matrixData, q) {
    UI.host = host; UI.matrix = matrixData; UI.q = String(q || "").toLowerCase();
    wire(host);
    if (!DATA) { host.innerHTML = `<p class="hint">Φόρτωση δέντρων αποφάσεων…</p>`; load().then(render, () => { host.innerHTML = `<p class="hint">Αποτυχία φόρτωσης board_decision_trees.json.</p>`; }); return; }
    render();
  }

  window.BoardTrees = { load: load, setData: setData, data: () => DATA, evaluate: evaluate, allowedEvents: allowedEvents, PRESETS: PRESETS, EV_LABEL: EV_LABEL, CAT_LABEL: CAT_LABEL,
    renderBoardArea: renderBoardArea, citeOf: citeOf, nodeOf: nodeOf, esc: esc, ui: UI };
})();
