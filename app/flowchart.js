"use strict";
/* ══════════════════════════════════════════════════════════════════════════
   PHASE II FLOWCHART — «ΡΑΓΕΣ ΤΡΟΧΙΑΣ» · v2 (ανά SORTIE)

   L0 Πίνακας Σταδίου → L1 Ράγα Τροχιάς (4 ζώνες) → L2 Σταθμός/Έξοδος.
   Πρωτεύων άξονας = ΚΑΤΗΓΟΡΙΑ (5 τροχιές), δευτερεύων = ΖΩΝΗ (4 ζώνες).

   ΔΕΔΟΜΕΝΑ: data/flowchart2.json (schema flowchart-v2)
     groups[73]          — ΤΑΥΤΙΖΟΝΤΑΙ με τους 73 v1 nodes (ίδια σειρά/πεδία)
     group_edges_v1[98]  — ΤΑΥΤΙΖΟΝΤΑΙ με τις 98 v1 ακμές  → L0/L1 μένουν ίδια
     sorties[133]        — οι μεμονωμένες έξοδοι (F/S + flights)
     edges[174]          — ΑΚΜΕΣ ΑΝΑ SORTIE με uid refs "g:X" / "s:X"
     ground_chain_edges  — ground→ground + το μοναδικό sortie→ground βέλος

   ΠΡΟΣΟΧΗ 1: 13 ids υπάρχουν ΚΑΙ ως group ΚΑΙ ως sortie (C1101, I4701, …).
              Τίποτε δεν δεικτοδοτείται με σκέτο id — μόνο με uid.
   ΠΡΟΣΟΧΗ 2: το ίδιο ζεύγος (from,to) γράφεται δύο φορές με διαφορετικό kind
              (same_pair_kinds). Ο renderer ΕΝΩΝΕΙ σε ΜΙΑ ακμή με kinds[].

   Επαφή με τον υπόλοιπο κώδικα: μόνο #view-flowchart, η κλάση .hidden και το
   window.fcInit() (app.js). Το JSON διαβάζεται ΩΣ ΕΧΕΙ, ποτέ δεν γράφεται.
   Vanilla JS, μηδέν εξαρτήσεις, δουλεύει από file://.
   ══════════════════════════════════════════════════════════════════════════ */

(() => {
  const KIND_LABELS = {
    theory: "Theory",
    ground_exam: "Ground exam",
    sim: "Simulator (F/S)",
    flight: "Flight",
    checkride: "Checkride",
  };

  /* ΣΤΥΛ ΑΚΜΩΝ (αίτημα χρήστη): solid = sequence · dashed = feed/prereq ·
     dotted = before. Τα ground_entry/ground_sequence δεν ονομάστηκαν ρητά:
     το ground_entry κόβει ζώνες όπως το prereq → dashed, το ground_sequence
     μένει μέσα στη ζώνη GROUND όπως το sequence → solid.                    */
  const DASH = { solid: "", dashed: "6 4", dotted: "2 4" };
  function edgeStyle(m) {
    const k = m.kinds;
    if (k.indexOf("sequence") >= 0 || k.indexOf("ground_sequence") >= 0) return "solid";
    if (k.indexOf("feed") >= 0 || k.indexOf("prereq") >= 0 || k.indexOf("ground_entry") >= 0) return "dashed";
    if (k.indexOf("before") >= 0) return "dotted";
    return "solid";
  }

  /* ── ταξινομία ── */
  const TRACKS = [
    { id: "contact",        label: "Contact",        rgb: "88,176,255",  hex: "#58b0ff", tot: "contact" },
    { id: "instrument",     label: "Instrument",     rgb: "157,140,255", hex: "#9d8cff", tot: "instrument" },
    { id: "formation",      label: "Formation",      rgb: "70,209,154",  hex: "#46d19a", tot: "formation" },
    // ΠΡΟΣΟΧΗ: το totals.* κλειδί λέγεται "navigation", όχι "vfr_navigation".
    { id: "vfr_navigation", label: "VFR Navigation", rgb: "255,157,92",  hex: "#ff9d5c", tot: "navigation" },
    { id: "shared",         label: "Shared ground",  rgb: "125,140,163", hex: "#7d8ca3", tot: null },
  ];
  const TRACK_BY = {};
  for (const t of TRACKS) TRACK_BY[t.id] = t;
  const TRACK_ALIAS = { core: "shared", shared: "shared" };

  /* ΧΡΩΜΑ ΑΝΑ ΖΩΝΗ (single-track view). Οι τιμές ζουν στο CSS ώστε το light
     theme να τις σκουραίνει — εδώ κρατάμε μόνο τα ονόματα των μεταβλητών.   */
  const BANDS = [
    { id: "ground",  label: "GROUND",  g: "▤", sub: "GROUND ACADEMICS · PART II §11" },
    { id: "exams",   label: "EXAMS",   g: "▣", sub: "WRITTEN EXAMS · ≥80%" },
    { id: "fs",      label: "F/S",     g: "⬒", sub: "FLIGHT SIMULATOR · PART III §13" },
    { id: "flights", label: "FLIGHTS", g: "✈", sub: "T-6A SORTIES · PART IV §14" },
  ];
  const BAND_BY = {};
  for (const b of BANDS) BAND_BY[b.id] = b;
  const bandVar = (id) => "var(--fcb-" + id + ")";
  const bandRgb = (id) => "var(--fcb-" + id + "-rgb)";
  const BAND_OF = { theory: "ground", ground_exam: "exams", sim: "fs", flight: "flights", checkride: "flights" };
  const BAND_ALIAS = { exam: "exams", air: "flights" };

  const G = { sec: "●", exam: "▣", ckr: "◆", solo: "★", fin: "⦿", night: "☾", in: "⇤", out: "⇥", warn: "⚠", info: "ⓘ" };
  /* Πάνω από τόσους χαρακτήρες, η σημείωση ακμής δεν τυπώνεται στη λίστα
     σχέσεων του popup — ζει ολόκληρη στον πίνακα «Source & verbatim».       */
  const NOTE_INLINE = 140;

  /* ── κατάσταση ── */
  let fc = null;
  let loaded = false;
  const S = {
    lv: 0, track: null, sel: null,          // sel = uid ("g:X" / "s:X")
    density: "rich", poster: false,
    hiddenBands: new Set(), spot: new Set(),
    open: new Set(),        // ανοιχτά Training Sections (group ids) — accordion ανά ζώνη
    rendered: new Set(),    // uids που βρίσκονται ΤΩΡΑ στο DOM της ράγας
    chev: new Set(),        // "uid>uid" ακμές που ήδη τις λέει ένα chevron
    pulsed: new Set(),
    sug: [], sugIx: -1, hashLock: false,
  };
  const IX = {
    byId: new Map(),      // group id  → group
    out: new Map(), in: new Map(), deg: new Map(),   // ΟΜΑΔΙΚΕΣ ακμές (v1)
    exam: new Map(), search: [],
    sortie: new Map(),    // sortie id → sortie
    srtOf: new Map(),     // group id  → [sortie, …] στη σειρά του διαγράμματος
    uid: new Map(),       // uid → group | sortie
    labelPart: new Map(), // τυπωμένο κουτί ("CO 101-105") → group id  (gates mapping)
  };
  const SE = { out: new Map(), in: new Map(), all: [] };  // ΑΚΜΕΣ ΑΝΑ SORTIE (ενωμένες)

  const el = (id) => document.getElementById(id);
  const ESC_MAP = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ESC_MAP[c]); }
  function cssVar(name) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name);
    return (v || "").trim() || "#7d8ca3";
  }

  /* §0.3 ΜΟΡΦΟΠΟΙΗΣΗ — computed νούμερα πάντα με ελληνικό κόμμα.
     parseTot() χρησιμοποιείται ΜΟΝΟ για πλάτη μπάρας & ελέγχους, ποτέ για εμφάνιση. */
  function fmt(n) { return (Math.round(n * 10) / 10).toFixed(1).replace(".", ","); }
  function parseTot(s) {
    if (s == null || /^\s*-\s*\/\s*-\s*$/.test(s)) return { srt: null, h: null };
    const p = String(s).split("/");
    if (p.length < 2) return { srt: null, h: null };
    return { srt: parseInt(p[0].trim(), 10), h: parseFloat(p[1].trim().replace(",", ".")) };
  }
  const r1 = (n) => Math.round(n * 10) / 10;
  const plural = (n, one, many) => n + " " + (n === 1 ? one : many);
  /* Ελληνικά κεφαλαία ΧΩΡΙΣ τόνο (το toUpperCase κρατά το τονικό σημάδι). */
  function up(s) {
    let u = String(s || "").toUpperCase();
    if (u.normalize) u = u.normalize("NFD").replace(/[̀́͂]/g, "").normalize("NFC");
    return u;
  }

  /* ── uid helpers ───────────────────────────────────────────────────────── */
  const isSortieUid = (u) => String(u || "").charAt(0) === "s";
  const node = (uid) => IX.uid.get(uid) || null;
  const domId = (uid) => (isSortieUid(uid) ? "fcs-" : "fcn-") + String(uid).slice(2);
  const elOf = (uid) => el(domId(uid));
  const trackOf = (n) => TRACK_ALIAS[n.track || n.category || "shared"] || (n.track || n.category || "shared");
  const bandOf  = (n) => BAND_ALIAS[n.band] || n.band || BAND_OF[n.kind];
  const srtLabel = (s) => s.label_verbatim || s.id;
  const labelOf = (n) => (n.uid && isSortieUid(n.uid) ? srtLabel(n) : n.label);
  function cellOf(id) { const n = IX.byId.get(id); return n ? trackOf(n) + "|" + bandOf(n) : "?"; }

  /* ── δείκτης ────────────────────────────────────────────────────────────── */
  function buildIndex() {
    for (const n of fc.nodes) { IX.byId.set(n.id, n); IX.uid.set("g:" + n.id, n); }
    for (const e of fc.edges) {
      if (!IX.out.has(e.from)) IX.out.set(e.from, []);
      IX.out.get(e.from).push(e);
      if (!IX.in.has(e.to)) IX.in.set(e.to, []);
      IX.in.get(e.to).push(e);
      IX.deg.set(e.from, (IX.deg.get(e.from) || 0) + 1);
      IX.deg.set(e.to,   (IX.deg.get(e.to)   || 0) + 1);
    }
    for (const n of fc.nodes) {
      for (const x of (n.exams || [])) IX.exam.set(x.code, { ex: x, node: n.id, gate: false });
      if (n.kind === "ground_exam") {
        IX.exam.set(n.label, {
          ex: { code: n.label, name: n.name, periods: n.periods, periods_foreign: n.periods_foreign, gates: [] },
          node: n.id, gate: true,
        });
      }
    }

    /* ΤΥΠΩΜΕΝΑ ΚΟΥΤΙΑ → κόμβος. Τα in-block exams γράφουν «gates: CO 101-105»,
       δηλαδή το ΤΥΠΩΜΕΝΟ κουτί, όχι το id. Το ίδιο string είναι ένα από τα
       κομμάτια του label ενός group (label = «FF 101-108 · CO 101-105 · …»),
       οπότε η αντιστοίχιση γίνεται ΜΟΝΟ με τα δεδομένα — καμία εικασία.      */
    for (const n of fc.nodes) {
      for (const p of String(n.label || "").split(" · ")) {
        const k = p.trim();
        if (k && !IX.labelPart.has(k)) IX.labelPart.set(k, n.id);
      }
    }

    /* sorties + ενωμένες ακμές ανά sortie */
    for (const s of (fc.sorties || [])) {
      IX.sortie.set(s.id, s);
      IX.uid.set(s.uid, s);
      if (!IX.srtOf.has(s.group)) IX.srtOf.set(s.group, []);
      IX.srtOf.get(s.group).push(s);
    }
    const seen = new Map();
    for (const e of fcSortieEdges()) {
      if (!IX.uid.has(e.from_ref) || !IX.uid.has(e.to_ref)) continue;   // άγνωστο άκρο → αγνοείται
      const key = e.from_ref + ">" + e.to_ref;
      let m = seen.get(key);
      if (!m) {
        m = { key: key, from: e.from_ref, to: e.to_ref, kinds: [], ev: [] };
        seen.set(key, m);
        SE.all.push(m);
        if (!SE.out.has(e.from_ref)) SE.out.set(e.from_ref, []);
        SE.out.get(e.from_ref).push(m);
        if (!SE.in.has(e.to_ref)) SE.in.set(e.to_ref, []);
        SE.in.get(e.to_ref).push(m);
      }
      if (m.kinds.indexOf(e.kind) < 0) m.kinds.push(e.kind);
      m.ev.push(e);
    }

    /* ── αναζήτηση: sections + sorties + exams ── */
    for (const n of fc.nodes) {
      IX.search.push({
        uid: "g:" + n.id, code: n.label,
        hay: (n.id + " " + n.label + " " + (n.name || "")).toLowerCase(),
        sub: (KIND_LABELS[n.kind] || n.kind) + " · section",
      });
    }
    for (const s of (fc.sorties || [])) {
      IX.search.push({
        uid: s.uid, code: srtLabel(s),
        hay: (s.id + " " + srtLabel(s) + " " + (s.name || "") + " " + (s.section_verbatim || "")).toLowerCase(),
        sub: "sortie · " + s.group + " · " + (BAND_BY[bandOf(s)] || { label: "" }).label,
      });
    }
    IX.exam.forEach((v, code) => {
      IX.search.push({
        uid: "g:" + v.node, code: code, hay: (code + " " + (v.ex.name || "")).toLowerCase(),
        sub: (v.gate ? "gate exam" : "exam") + " · " + IX.byId.get(v.node).label,
      });
    });
  }
  /* Οι ακμές ανά sortie = "edges" + "ground_chain_edges" (η δεύτερη κρατά τα
     ground→ground βέλη ΚΑΙ το μοναδικό sortie→ground: I4501 → CO 109).
     ΠΡΟΣΟΧΗ: το fc.edges έχει ΗΔΗ αντικατασταθεί από τις ομαδικές ακμές v1 —
     οι ακμές ανά sortie φυλάσσονται στο fc.sortieEdges από το fcInit().      */
  function fcSortieEdges() {
    return [].concat(fc.sortieEdges || [], fc.ground_chain_edges || []);
  }

  /* ══ ΣΧΕΣΕΙΣ ΤΟΥ ΚΟΜΒΟΥ — Η ΜΟΝΑΔΙΚΗ ΠΗΓΗ ΤΟΥ SIDE SHEET ═══════════════════
     Οι κάρτες δεν κουβαλούν πια τσιπάκια· ΟΛΕΣ οι σχέσεις συγκεντρώνονται εδώ
     και τυπώνονται μία φορά, στο popup. Τρεις πηγές, ενωμένες ανά «άλλο άκρο»:
       1. SE  — οι ενωμένες ακμές ανά sortie (edges + ground_chain_edges).
                Περιέχουν ΚΑΙ group άκρα: ground_entry (g:IN290 → s:I4101) και
                ground_sequence (g:GT-INSTR → g:IN290) — αυτό έλειπε από το
                sheet του IN 290, ενώ φαινόταν ως chip πάνω στην κάρτα.
       2. IX.in/IX.out — οι ομαδικές ακμές v1 (section → section).
       3. exams[].gates — το «▸ gates CO 101-105» των in-block exam chips.    */
  function relations(uid) {
    const bag = { in: new Map(), out: new Map() };
    const add = (dir, other, kinds, ev) => {
      if (!other || other === uid || !IX.uid.has(other)) return;
      let r = bag[dir].get(other);
      if (!r) { r = { uid: other, kinds: [], ev: [] }; bag[dir].set(other, r); }
      for (const k of kinds) if (k && r.kinds.indexOf(k) < 0) r.kinds.push(k);
      for (const e of ev) r.ev.push(e);
    };

    for (const m of (SE.in.get(uid) || [])) add("in", m.from, m.kinds, m.ev);
    for (const m of (SE.out.get(uid) || [])) add("out", m.to, m.kinds, m.ev);

    if (!isSortieUid(uid)) {
      const id = String(uid).slice(2);
      for (const e of (IX.in.get(id) || []))
        add("in", "g:" + e.from, [e.kind], [{ kind: e.kind, note: e.note, from_ref: "g:" + e.from, to_ref: uid }]);
      for (const e of (IX.out.get(id) || []))
        add("out", "g:" + e.to, [e.kind], [{ kind: e.kind, note: e.note, from_ref: uid, to_ref: "g:" + e.to }]);
      for (const g of gateRels(id, "out")) add("out", "g:" + g.other, ["exam gate"], [g.ev]);
      for (const g of gateRels(id, "in"))  add("in",  "g:" + g.other, ["exam gate"], [g.ev]);
    }
    return { inn: Array.from(bag.in.values()), out: Array.from(bag.out.values()) };
  }

  /* «gates» ενός in-block exam που δείχνει ΕΞΩ από το ίδιο του το block.
     (π.χ. JX 190 / JX 191 μέσα στο GT-METEO-BA ⇒ πύλη για τον κόμβο JP 190*) */
  function gateRels(gid, dir) {
    const out = [];
    const scan = (host) => {
      for (const x of (host.exams || [])) {
        for (const t of (x.gates || [])) {
          const key = String(t).trim();
          const tgt = IX.labelPart.get(key);
          if (!tgt || tgt === host.id) continue;                 // πύλη μέσα στο ίδιο block
          if (dir === "out" && host.id !== gid) continue;
          if (dir === "in" && tgt !== gid) continue;
          out.push({
            other: dir === "out" ? tgt : host.id,
            ev: {
              kind: "exam gate",
              note: x.code + " (in-block exam of " + shortLabel(host) + ") gates the printed box “" + key + "”",
              from_ref: "g:" + host.id, to_ref: "g:" + tgt,
            },
          });
        }
      }
    };
    if (dir === "out") { const n = IX.byId.get(gid); if (n) scan(n); }
    else for (const n of fc.nodes) if (n.id !== gid) scan(n);
    return out;
  }

  /* ΣΗΜΕΙΩΣΕΙΣ ΔΕΔΟΜΕΝΩΝ — ό,τι σήμαινε το ⚠ της κάρτας, σε κείμενο. */
  function dataNotes(n) {
    const out = (n.flags || []).slice();
    if (n.note) out.push(n.note);
    if (!isSortieUid(n.uid || "") && n.sorties_total != null && n.hours_total == null) {
      out.push("No hours printed for this Training Section — it is one of the gaps behind the "
        + G.info + " mismatch on the band total.");
    }
    return out;
  }

  /* ΠΡΟΣΟΧΗ: το totals.final_evaluations_verbatim γράφει «Ν4690» με ΕΛΛΗΝΙΚΟ κεφαλαίο Νι.
     Κάθε string-match σε λατινικό "N4690" αποτυγχάνει ΣΙΩΠΗΛΑ → μόνο δομικό κριτήριο. */
  function isFinal(n) {
    if (!n.checkride) return false;
    return !(IX.out.get(n.id) || []).some((e) => e.kind === "sequence" && cellOf(e.to) === cellOf(n.id));
  }
  /* κόμβοι «ΔΙΑΡΚΩΣ»: χωρίς κουτί στο Training Flow Chart (GT-WSGES, GT-GENBRIEF) */
  function isContinuous(n) {
    return (IX.deg.get(n.id) || 0) === 0 || /^not_in_flow_chart/.test((n.flags || []).join("|"));
  }

  const nodesOf = (track) => fc.nodes.filter((n) => trackOf(n) === track);
  const srtOf = (gid) => IX.srtOf.get(gid) || [];
  const flagLike = (re) => (fc.flags || []).filter((f) => re.test(f));

  /* ═══ ΚΑΝΟΝΑΣ ΑΚΕΡΑΙΟΤΗΤΑΣ (§0.2) ═══════════════════════════════════════
     Κάθε headline νούμερο βγαίνει από το fc.totals και ΤΥΠΩΝΕΤΑΙ ΑΥΤΟΥΣΙΟ.  */
  function agg(track) {
    const all = nodesOf(track);
    const by = (b) => all.filter((n) => bandOf(n) === b);
    const ground = by("ground"), exams = by("exams"), fs = by("fs"), flights = by("flights");
    const inline = [];
    for (const n of ground) for (const x of (n.exams || [])) inline.push({ ex: x, node: n.id });

    const key = TRACK_BY[track].tot;
    const pFs = key ? fc.totals.fs[key] : null;
    const pFl = key ? fc.totals.flight[key] : null;

    const sum = (list) => ({
      srt: list.reduce((s, n) => s + (n.sorties_total || 0), 0),
      h:   r1(list.reduce((s, n) => s + (n.hours_total || 0), 0)),
      gaps: list.filter((n) => n.sorties_total != null && n.hours_total == null),
    });
    let cFs = sum(fs);
    const cAir = sum(flights);
    // Το printed contact F/S («16 / 20,8») ΔΕΝ περιλαμβάνει το familiarization.
    if (track === "contact") {
      const fam = parseTot(fc.totals.fs.familiarization);
      if (fam.srt != null) cFs = { srt: cFs.srt - fam.srt, h: r1(cFs.h - fam.h), gaps: cFs.gaps };
    }
    const mm = (printed, computed) => {
      const p = parseTot(printed);
      if (p.h == null) return null;
      if (r1(p.h) === computed.h && (p.srt == null || p.srt === computed.srt)) return null;
      return "syllabus: " + printed + " · sum of sections here: " + computed.srt + " / " + fmt(computed.h)
           + (computed.gaps.length ? " — see " + computed.gaps.map((n) => n.label).join(", ") : "");
    };

    const feeds = {};
    for (const n of all) {
      for (const e of (IX.out.get(n.id) || [])) {
        const to = IX.byId.get(e.to);
        if (!to) continue;
        const tt = trackOf(to);
        if (tt !== track) feeds[tt] = (feeds[tt] || 0) + 1;
      }
    }
    const nSrt = fs.concat(flights).reduce((s, g) => s + srtOf(g.id).length, 0);
    return {
      all: all, ground: ground, exams: exams, fs: fs, flights: flights, inline: inline,
      periodsGround: ground.reduce((s, n) => s + (n.periods || 0), 0),
      periodsExam:   exams.reduce((s, n) => s + (n.periods || 0), 0),
      examCount: exams.length + inline.length,
      sorties: nSrt,
      printedFs: pFs, printedFl: pFl,
      mmFs: pFs ? mm(pFs, cFs) : null,
      mmAir: pFl ? mm(pFl.total, cAir) : null,
      ckr: flights.filter((n) => n.checkride),
      finals: flights.filter(isFinal),
      soloSections: flights.filter((n) => n.solo_allowed && !n.solo_required),
      firstSolo: all.filter((n) => n.solo_required),
      nights: all.filter((n) => n.night),
      feeds: feeds,
    };
  }

  /* ══════════════════════ INIT ══════════════════════ */
  async function fcInit() {
    if (loaded) return;
    loaded = true;
    try {
      const res = await fetch("../data/flowchart2.json", { cache: "no-store" });
      fc = await res.json();
    } catch (err) {
      el("fc-vitals").innerHTML = '<p class="hint">flowchart2.json not found.</p>';
      return;
    }
    /* groups ≡ v1 nodes · group_edges_v1 ≡ v1 edges → L0 και οι ζώνες
       GROUND/EXAMS δουλεύουν χωρίς μετάφραση. Οι ΑΝΑ SORTIE ακμές (το αρχικό
       fc.edges του v2) φυλάσσονται ΠΡΙΝ την αντικατάσταση.                  */
    fc.sortieEdges = fc.edges || [];
    fc.nodes = fc.groups || fc.nodes || [];
    fc.edges = fc.group_edges_v1 || [];
    fc.sorties = fc.sorties || [];
    buildIndex();
    renderL0();
    wire();
    readHash();
    render();
  }
  window.fcInit = fcInit;
  /* Συμβόλαιο προς schedval.js: ΠΟΙΟ είναι το τρέχον επιλεγμένο uid ("s:"/"g:")
     ώστε το κουμπί VALIDATE να ανοίγει προφορτωμένο. null = καμία επιλογή.    */
  window.fcSelectedUid = () => S.sel;

  /* ══════════════════════ L0 — ΠΙΝΑΚΑΣ ΣΤΑΔΙΟΥ ══════════════════════ */
  function renderL0() {
    const t = fc.totals;
    const gate = fc.nodes.filter((n) => n.kind === "ground_exam").length;
    const inline = fc.nodes.reduce((s, n) => s + (n.exams || []).length, 0);
    const fsN = fc.nodes.filter((n) => bandOf(n) === "fs").length;
    const airN = fc.nodes.filter((n) => bandOf(n) === "flights").length;
    const ckr = fc.nodes.filter((n) => n.checkride);
    const fins = ckr.filter(isFinal);
    const sumPer = fc.nodes.reduce((s, n) => s + (n.periods || 0), 0);
    const nFs = fc.sorties.filter((s) => bandOf(s) === "fs").length;
    const nAir = fc.sorties.filter((s) => bandOf(s) === "flights").length;

    const vitals = [
      { k: "ground", h: "GROUND", n: String(t.ground_training_periods),
        s: "periods · " + t.ground_training_periods_foreign_sps + " foreign SPs · min. 25 working days",
        i: sumPer !== t.ground_training_periods
          ? "syllabus: " + t.ground_training_periods + " periods · sum of nodes here: " + sumPer
          : null },
      { k: "exams", h: "EXAMS", n: String(gate + inline),
        s: gate + " gates + " + inline + " in-block · ≥80%", i: null },
      { k: "fs", h: "F/S", n: t.fs.total, s: fsN + " sections · " + nFs + " sorties", i: null },
      { k: "flights", h: "FLIGHTS", n: t.flight.total.total,
        s: airN + " sections · " + nAir + " sorties · " + t.flight.total.dual + " D + " + t.flight.total.solo + " S", i: null },
      { k: "solo", h: "SOLO", n: t.flight.total.solo, s: "★ all mandatory · min. 6,0 h", i: null },
      { k: "ckr", h: "CHECKRIDES", n: String(ckr.length),
        s: fins.length + " FINAL · min. 78 flying days", i: null },
    ];
    el("fc-vitals").innerHTML = vitals.map((v) => `
      <button type="button" class="fc-vt" data-drawer="${esc(v.k)}" aria-label="${esc(v.h + " — " + v.n + " " + v.s)}">
        <span class="fc-vt-h">${esc(v.h)}</span>
        <span class="fc-vt-n">${esc(v.n)}${v.i ? `<span class="fc-info" title="${esc(v.i)}" aria-hidden="true">${G.info}</span>` : ""}</span>
        <span class="fc-vt-s">${esc(v.s)}</span>
      </button>`).join("");

    el("fc-gate").innerHTML =
      `<span class="fc-gate-g" aria-hidden="true">⛔</span>${esc(t.ground_gate_verbatim)}`;

    // ΜΠΑΡΑ ΦΟΡΤΙΟΥ — LOAD (μερίδιο ωρών), ΠΟΤΕ progress.
    const tot = parseTot(t.flight.total.total).h;
    const segs = TRACKS.filter((x) => x.tot).map((x) => {
      const h = parseTot(t.flight[x.tot].total).h;
      const pct = Math.round((h / tot) * 1000) / 10;
      return `<button type="button" class="fc-load-seg" data-track="${esc(x.id)}"
        style="flex:${h};background:${x.hex}"
        title="${esc(up(x.label) + " · " + fmt(h) + " h · " + Math.round(pct) + "% of FLIGHTS")}"
        aria-label="${esc(x.label + " " + fmt(h) + " hours")}"></button>`;
    }).join("");
    el("fc-load").innerHTML = segs;
    const cap = el("fc-load-cap") || (() => {
      const p = document.createElement("p");
      p.className = "fc-load-cap"; p.id = "fc-load-cap";
      el("fc-load").insertAdjacentElement("afterend", p);
      return p;
    })();
    cap.textContent = "LOAD — share of FLIGHTS hours";

    el("fc-tracks").innerHTML = TRACKS.map(trackCard).join("");
    el("fc-spine").innerHTML = spine();
  }

  function trackCard(tk) {
    const A = agg(tk.id);
    const counts = { ground: A.ground.length, exams: A.exams.length, fs: A.fs.length, flights: A.flights.length };
    const skel = BANDS.map((b) => counts[b.id]
      ? `<span class="fc-skel-seg" style="flex:${counts[b.id]};background:${bandVar(b.id)}"></span>` : "").join("");

    let m1, m2 = "";
    if (tk.id === "shared") {
      m1 = (A.periodsGround + A.periodsExam) + " periods";
      const gates = A.exams.map((n) => n.label).join(", ");
      const ins = A.inline.map((x) => x.ex.code).join(", ");
      m2 = "EXAMS " + A.examCount + " (" + gates + " gate" + (ins ? " + " + ins + " in-block" : "") + ")";
    } else {
      m1 = "GROUND " + A.periodsGround + " per. · EXAMS " + A.examCount
         + " (" + plural(A.exams.length, "gate", "gates")
         + (A.inline.length ? " + " + A.inline.length + " in-block" : "") + ")";
      const fam = tk.id === "contact" ? " (+FAM " + fc.totals.fs.familiarization + ")" : "";
      const solo = A.printedFl.solo === "- / -" ? "solo —" : A.printedFl.solo + " S";
      m2 = "F/S " + A.printedFs + fam + " · FLIGHTS " + A.printedFl.total + " h"
         + (A.mmAir ? " " + G.info : "") + " — " + A.printedFl.dual + " D · " + solo;
    }

    const chips = [];
    if (tk.id === "shared") {
      chips.push(`<span class="fc-b">▤ ${A.ground.length} blocks</span>`);
      if (A.exams.length) chips.push(`<span class="fc-b fc-b-warn">▣ ${esc(A.exams.map((n) => n.label).join(" · "))}</span>`);
    } else {
      if (A.ckr.length) {
        chips.push(`<span class="fc-b fc-b-ckr">${G.ckr} ${A.ckr.length} CKR${A.ckr.length === A.finals.length ? " FINAL" : ""}</span>`);
      }
      if (A.firstSolo.length) chips.push(`<span class="fc-b fc-b-solo-req">${G.solo} 1st SOLO</span>`);
      if (A.soloSections.length) chips.push(`<span class="fc-b fc-b-solo">SOLO in ${A.soloSections.length} sections</span>`);
      if (A.nights.length) chips.push(`<span class="fc-b fc-b-night">${G.night} NIGHT ×${A.nights.length}</span>`);
      if (A.sorties) chips.push(`<span class="fc-b">${A.sorties} sorties</span>`);
    }

    const micro = A.flights.length ? `<span class="fc-micro" aria-hidden="true">${microRail(A.flights)}</span>` : "";
    const feedTxt = Object.keys(A.feeds).map((k) => TRACK_BY[k].label + " ×" + A.feeds[k]).join(" · ");
    const feed = feedTxt ? `<span class="fc-tc-feed">FEEDS → ${esc(feedTxt)}</span>` : "";

    return `<button type="button" class="fc-tc${tk.id === "shared" ? " is-core" : ""}" data-track="${esc(tk.id)}"
      style="--tk:${tk.hex};--tk-rgb:${tk.rgb}"
      aria-label="${esc(tk.label + " — " + A.all.length + " sections")}"
      title="${esc(m1 + (m2 ? " · " + m2 : ""))}">
      <span class="fc-tc-h"><span class="fc-tc-t">${esc(up(tk.label))}</span><span class="fc-tc-n">${A.all.length} sections</span></span>
      <span class="fc-skel" aria-hidden="true">${skel}</span>
      <span class="fc-tc-m">${esc(m1)}${m2 ? "<br>" + esc(m2) : ""}</span>
      ${chips.length ? `<span class="fc-tc-chips">${chips.join("")}</span>` : ""}
      ${micro}${feed}
    </button>`;
  }

  /* μίνι-ράγα: solo_required > checkride > solo_allowed > απλός σταθμός */
  function microRail(list) {
    return list.map((n, ix) => {
      let cls = "fc-micro-dot";
      if (n.solo_required) cls += " is-solo-req";
      else if (n.checkride) cls += " is-ckr";
      else if (n.solo_allowed) cls += " is-solo";
      else if (n.night) cls += " is-night";
      const dot = `<span class="${cls}"></span>`;
      return ix ? `<span class="fc-micro-line"></span>` + dot : dot;
    }).join("");
  }

  function spine() {
    const ck = fc.nodes.filter((n) => n.checkride);
    let h = `<span class="fc-spine-h">CHECKRIDE SPINE</span>`;
    ck.forEach((n, ix) => {
      const prev = ck[ix - 1];
      if (prev) {
        const same = trackOf(prev) === trackOf(n);
        h += `<span class="fc-spine-sep" aria-hidden="true">${same ? "→" : "‖"}</span>`;
      }
      const tk = TRACK_BY[trackOf(n)];
      const fin = isFinal(n);
      h += `<button type="button" class="fc-gate-pill" data-jump="g:${esc(n.id)}" style="--tk:${tk.hex}"
        title="${esc(n.name + (n.duration_verbatim ? " — " + n.duration_verbatim : ""))}"
        aria-label="${esc(n.label + " — " + n.name)}">
        <span class="fc-gp-code">${esc(n.label)}</span>
        ${n.solo_required ? `<span class="fc-b fc-b-solo-req">${G.solo}</span>` : ""}
        <span class="fc-gp-d" aria-hidden="true">${fin ? G.fin : G.ckr}</span>
        ${fin ? `<span class="fc-b fc-b-final">FINAL</span>` : ""}
      </button>`;
    });
    return h;
  }

  /* ══════════════════════ L1 — ΡΑΓΑ ΤΡΟΧΙΑΣ ══════════════════════ */
  function openTrack(id, keepSel) {
    const tid = TRACK_ALIAS[id] || id;
    if (!TRACK_BY[tid]) return;
    S.track = tid;
    if (S.lv < 1) S.lv = 1;
    if (!keepSel && S.sel) {
      const n = node(S.sel);
      if (!n || trackOf(n) !== tid) { S.sel = null; S.lv = 1; }
    }
    if (S.sel) ensureOpenFor(S.sel);
    renderTrackbar();
    renderFilters();
    renderBands();
    if (S.sel) applySelection(); else closeSheet();
    render();
    scheduleEdges();
  }

  function renderTrackbar() {
    const tk = TRACK_BY[S.track], A = agg(S.track);
    let h = `<button type="button" class="fc-back" id="fc-back">◀ All tracks</button>`;
    for (const t of TRACKS) {
      h += `<button type="button" class="fc-pill" data-track="${esc(t.id)}" aria-pressed="${t.id === S.track}"
        style="--tk:${t.hex};--tk-rgb:${t.rgb}">${esc(t.label)}</button>`;
    }
    const sum = A.printedFl
      ? "GROUND " + A.periodsGround + " per. · EXAMS " + A.examCount
        + " · F/S " + A.printedFs + " · FLIGHTS " + A.printedFl.total + " h · " + A.sorties + " sorties"
        + (A.mmAir ? "  " + G.info + " " + A.mmAir : "")
      : (A.periodsGround + A.periodsExam) + " periods · EXAMS " + A.examCount + " · feeds the flying tracks";
    h += `<span class="fc-tb-sum">${esc(sum)}</span>`;
    el("fc-trackbar").innerHTML = h;
    el("fc-trackbar").style.setProperty("--tk", tk.hex);
    el("fc-trackbar").style.setProperty("--tk-rgb", tk.rgb);
  }

  function renderFilters() {
    let h = `<span class="fc-fgroup-h">BANDS</span>`;
    for (const b of BANDS) {
      const on = !S.hiddenBands.has(b.id);
      h += `<button type="button" class="fc-fbtn${on ? "" : " is-off"}" data-band="${esc(b.id)}"
        aria-pressed="${on}" style="--bc:${bandVar(b.id)}">${esc(b.label)}</button>`;
    }
    h += `<span class="fc-fgroup-h">SPOTLIGHT</span>`;
    const spots = [["solo", G.solo + " SOLO"], ["ckr", G.ckr + " Checkrides"], ["night", G.night + " Night"]];
    for (const [k, lab] of spots) {
      h += `<button type="button" class="fc-fbtn" data-spot="${k}" aria-pressed="${S.spot.has(k)}">${esc(lab)}</button>`;
    }
    h += `<span class="fc-fgroup-h">SECTIONS</span>`
       + `<button type="button" class="fc-fbtn" data-sections="all" title="Expand every Training Section (E)">Expand all</button>`
       + `<button type="button" class="fc-fbtn" data-sections="none" title="Collapse every Training Section (X)">Collapse all</button>`;
    el("fc-filters").innerHTML = h;
  }

  const spotHit = (n) => {
    const solo = n.solo_allowed || n.solo_required || n.solo_candidate || n.first_solo;
    if (S.spot.has("solo") && solo) return true;
    if (S.spot.has("ckr") && n.checkride) return true;
    if (S.spot.has("night") && n.night) return true;
    return false;
  };

  /* ── ΑΝΟΙΓΜΑ/ΚΛΕΙΣΙΜΟ TRAINING SECTION (accordion ανά ζώνη) ───────────────
     Χειροκίνητο κλικ = accordion (κλείνει τα υπόλοιπα της ίδιας ζώνης).
     Αυτόματο άνοιγμα από επιλογή = προσθετικό, ώστε τα δύο άκρα μιας ακμής
     να φαίνονται ταυτόχρονα.                                                */
  function openSection(gid, exclusive) {
    const g = IX.byId.get(gid);
    if (!g) return;
    if (exclusive) {
      const b = bandOf(g);
      for (const other of Array.from(S.open)) {
        const og = IX.byId.get(other);
        if (og && og.id !== gid && bandOf(og) === b) S.open.delete(other);
      }
    }
    S.open.add(gid);
  }
  function ensureOpenFor(uid) {
    if (!isSortieUid(uid)) return;
    const s = node(uid);
    if (!s) return;
    openSection(s.group, true);
    const around = [].concat(SE.in.get(uid) || [], SE.out.get(uid) || []);
    for (const m of around) {
      const other = node(m.from === uid ? m.to : m.from);
      if (!other || !isSortieUid(other.uid)) continue;
      if (trackOf(other) !== S.track) continue;          // άλλη τροχιά → chip στο side sheet
      openSection(other.group, false);
    }
  }

  /* Η ΣΕΙΡΑ ΤΟΥ fc.groups ΕΙΝΑΙ Η ΣΕΙΡΑ ΤΩΝ TRAINING SECTIONS ΤΟΥ SYLLABUS
     και η σειρά του fc.sorties η σειρά των εξόδων — ΚΑΜΙΑ ταξινόμηση.       */
  function renderBands() {
    const t = S.track, tk = TRACK_BY[t], A = agg(t);
    const host = el("fc-bands");
    host.style.setProperty("--tk", tk.hex);
    host.style.setProperty("--tk-rgb", tk.rgb);
    host.className = "fc-bands" + (S.density === "compact" ? " is-compact" : "") + (S.spot.size ? " spot" : "");

    // 1) ΠΟΙΟΙ κόμβοι μπαίνουν στο DOM — καθορίζει feed chips ΚΑΙ ακμές.
    S.rendered = new Set();
    S.chev = new Set();
    const vis = {};
    for (const b of BANDS) {
      if (S.hiddenBands.has(b.id)) { vis[b.id] = []; continue; }
      vis[b.id] = A[b.id].slice();
      for (const n of vis[b.id]) {
        S.rendered.add("g:" + n.id);
        if (b.id === "fs" || b.id === "flights") {
          if (S.open.has(n.id)) for (const s of srtOf(n.id)) S.rendered.add(s.uid);
        }
      }
    }
    const coreChips = (t !== "shared" && !S.hiddenBands.has("ground")) ? nodesOf("shared") : [];
    for (const n of coreChips) S.rendered.add("g:" + n.id);

    // 2) HTML
    let h = "";
    for (const b of BANDS) {
      if (S.hiddenBands.has(b.id)) continue;
      const body = bandBody(t, b, A, vis, coreChips);
      if (!body.count) continue;
      h += `<section class="fc-band" data-band="${esc(b.id)}"
              style="--bc:${bandVar(b.id)};--tk:${bandVar(b.id)};--tk-rgb:${bandRgb(b.id)}"
              aria-label="${esc(b.label + " — " + b.sub)}">
        <div class="fc-band-head">
          <span class="fc-band-g" aria-hidden="true">${b.g}</span>
          <span class="fc-band-t">${esc(b.label)}</span>
          <span class="fc-band-n">${body.count}</span>
          <span class="fc-band-tot">${esc(bandTot(b, A))}</span>
          ${body.phase ? phaseSrcBtn(body.phase) : ""}
        </div>${body.html}</section>`;
    }
    host.innerHTML = h || `<p class="fc-empty">No band visible — turn a band filter back on.</p>`;

    const cards = host.querySelectorAll(".fc-card");
    for (let i = 0; i < cards.length; i++) cards[i].style.setProperty("--i", Math.min(i, 12));

    // 1st SOLO pulse: μία φορά ανά session ανά τροχιά
    if (!S.pulsed.has(t)) {
      const fs = A.firstSolo[0];
      if (fs) { const c = el("fcn-" + fs.id); if (c) { c.classList.add("is-pulse"); S.pulsed.add(t); } }
    }
  }

  function bandTot(b, A) {
    if (b.id === "ground")  return A.periodsGround + " periods";
    if (b.id === "exams")   return A.examCount + " exams · ≥80%";
    if (b.id === "fs")      return A.printedFs ? "F/S " + A.printedFs + (A.mmFs ? " " + G.info : "") : "—";
    if (b.id === "flights") return A.printedFl ? "FLIGHTS " + A.printedFl.total + " h" + (A.mmAir ? " " + G.info : "") : "—";
    return "";
  }

  function phaseSrcBtn(pid) {
    const p = (fc.phases || []).find((x) => x.id === pid);
    if (!p || !p.source) return "";
    return `<button type="button" class="fc-band-src" data-drawer="phase:${esc(pid)}"
      title="${esc(p.source.ref)}">p.${esc(String(p.source.page_pdf))}</button>`;
  }

  function bandBody(t, b, A, vis, coreChips) {
    let html = "", count = 0, phase = null;
    const list = vis[b.id];
    if (list.length) phase = list[0].phase;

    if (b.id === "ground") {
      const main = t === "shared" ? list.filter((n) => !isContinuous(n)) : list;
      count += main.length;
      if (main.length) html += `<div class="fc-row">${chainRow(main, "is-ground")}</div>`;
      if (t === "shared") {
        const cont = list.filter(isContinuous);
        if (cont.length) {
          count += cont.length;
          html += `<div class="fc-sub"><div class="fc-sub-h">CONTINUOUS <em>— runs throughout the phase · no box in the Training Flow Chart</em></div>
            <div class="fc-row">${cont.map((n) => card(n, "is-ground", "end")).join("")}</div></div>`;
        }
      } else if (coreChips.length) {
        html += `<div class="fc-sub"><div class="fc-sub-h">SHARED GROUND <em>— common academics · ${G.in} = feeds this track</em></div>
          <div class="fc-row">${coreChips.map((n) => card(n, "is-core" + (feedsTrack(n, t) ? " is-feed" : ""), "end")).join("")}</div></div>`;
      }

    } else if (b.id === "exams") {
      count += list.length;
      if (list.length) html += `<div class="fc-row">${chainRow(list, "is-gate")}</div>`;
      if (A.inline.length) {
        count += A.inline.length;
        html += `<div class="fc-sub"><div class="fc-sub-h">IN-BLOCK <em>— they live inside the ground card</em></div>
          <div class="fc-row">${A.inline.map(exChip).join("")}</div></div>`;
      }

    } else {   // fs · flights → ΑΝΑΔΙΠΛΩΜΕΝΕΣ ΚΑΡΤΕΣ-ΓΟΝΕΙΣ
      count += list.length;
      if (list.length) {
        html += `<div class="fc-row fc-secrow">${sectionRow(list)}</div>`;
        html += `<p class="fc-cap">${esc(list.reduce((s, g) => s + srtOf(g.id).length, 0))} sorties in ${list.length} Training Sections — click a section to open its sortie chain.</p>`;
      }
    }
    return { html: html, count: count, phase: phase };
  }

  function feedsTrack(coreNode, track) {
    return (IX.out.get(coreNode.id) || []).some((e) => IX.byId.get(e.to) && trackOf(IX.byId.get(e.to)) === track)
        || (IX.in.get(coreNode.id) || []).some((e) => IX.byId.get(e.from) && trackOf(IX.byId.get(e.from)) === track);
  }

  function chainRow(list, cls) {
    return list.map((n, ix) => {
      const next = list[ix + 1];
      let link = "end";
      if (next) {
        const e = (IX.out.get(n.id) || []).find((x) => x.to === next.id);
        if (e) { link = e.kind === "implied" ? "implied" : "seq"; S.chev.add("g:" + e.from + ">g:" + e.to); }
        else link = "none";
      }
      return card(n, typeof cls === "function" ? cls(n) : (cls || ""), link);
    }).join("");
  }

  const LINK_TITLE = {
    seq: "chain: arrow drawn in the Training Flow Chart",
    implied: "order inferred from box placement — no arrow drawn in the flow chart",
    none: "no connection in the source",
    end: "end of band",
  };

  /* ── ΚΑΡΤΑ TRAINING SECTION (groups) ──────────────────────────────────────
     §3.5 Η ΚΑΡΤΑ ΚΡΑΤΑ ΜΟΝΟ: κωδικό + badges (user 2026-08-09). Όνομα/μετρικές:
     tooltip + side sheet. Τα τσιπάκια αναφοράς, τα in-block exams, οι πύλες και
     τα data notes ζουν ΟΛΑ στο popup (side sheet) — τίποτα δεν χάνεται.     */
  function card(n, cls, link, noId) {
    const full = n.label + (n.name ? " — " + n.name : "");
    return `<button type="button" class="fc-card ${cls}${spotHit(n) ? " is-spot" : ""}"
      ${noId ? "" : `id="fcn-${esc(n.id)}"`} data-uid="g:${esc(n.id)}" data-n="${esc(n.id)}" data-link="${esc(link)}"
      aria-pressed="false" aria-label="${esc(full)}"
      title="${esc(full + " · " + (LINK_TITLE[link] || ""))}">
      <span class="fc-c-top"><span class="fc-c-code">${esc(shortLabel(n))}</span>${statusChips(n)}</span>
    </button>`;
  }

  /* ── ΣΕΙΡΑ ΑΠΟ TRAINING SECTIONS με σταδιακή αποκάλυψη ─────────────────────
     Κλειστό section = μία κάρτα-γονέας. Ανοιχτό = η κάρτα ΚΑΙ, ΣΤΗ ΘΕΣΗ ΤΗΣ,
     η αλυσίδα των sorties της (η .is-open πιάνει ολόκληρη τη γραμμή).        */
  function sectionRow(list) {
    return list.map((g, ix) => {
      const next = list[ix + 1];
      let link = "end";
      if (next) {
        const e = (IX.out.get(g.id) || []).find((x) => x.to === next.id);
        if (e) { link = e.kind === "implied" ? "implied" : "seq"; S.chev.add("g:" + e.from + ">g:" + e.to); }
        else link = "none";
      }
      return sectionCard(g, link);
    }).join("");
  }

  function sectionCard(g, link) {
    const open = S.open.has(g.id);
    const list = srtOf(g.id);
    const full = g.label + (g.name ? " — " + g.name : "");
    const cls = (g.checkride ? "is-ckr " : "") + "is-sec" + (spotHit(g) ? " is-spot" : "");
    const head = `<button type="button" class="fc-card ${cls}" id="fcn-${esc(g.id)}"
        data-uid="g:${esc(g.id)}" data-n="${esc(g.id)}" data-sec="${esc(g.id)}" data-link="${esc(link)}"
        aria-expanded="${open}" aria-pressed="false" aria-label="${esc(full + " — " + list.length + " sorties")}"
        title="${esc(full + " · " + (open ? "click to collapse" : "click to open its sortie chain"))}">
      <span class="fc-c-top">
        <span class="fc-sec-caret" aria-hidden="true">${open ? "▾" : "▸"}</span>
        <span class="fc-c-code">${esc(shortLabel(g))}</span>${statusChips(g)}
      </span>
    </button>`;
    const body = open
      ? `<div class="fc-sec-body"><div class="fc-sec-chain">${srtChain(g, list)}</div></div>`
      : "";
    return `<div class="fc-sec${open ? " is-open" : ""}" data-secwrap="${esc(g.id)}">${head}${body}</div>`;
  }

  /* ── ΑΛΥΣΙΔΑ SORTIES ── */
  function srtChain(g, list) {
    if (!list.length) return `<span class="fc-cap">No sortie recorded for this section.</span>`;
    let h = "";
    list.forEach((s, ix) => {
      h += srtChip(s);
      const next = list[ix + 1];
      if (!next) return;
      const m = (SE.out.get(s.uid) || []).find((x) => x.to === next.uid);
      if (m) {
        S.chev.add(s.uid + ">" + next.uid);
        h += `<span class="fc-srt-link" aria-hidden="true" title="${esc(m.kinds.join(" · "))}">→</span>`;
      } else {
        h += `<span class="fc-srt-link is-none" aria-hidden="true" title="no arrow in the source">·</span>`;
      }
    });
    return h;
  }

  function srtChip(s) {
    const bits = [];
    if (s.checkride) bits.push(`<span class="fc-b fc-b-ckr">${G.ckr}</span>`);
    if (s.first_solo) bits.push(`<span class="fc-b fc-b-solo-req">${G.solo} 1st</span>`);
    else if (s.solo_candidate) bits.push(`<span class="fc-b fc-b-solo">${G.solo}</span>`);
    if (s.night) bits.push(`<span class="fc-b fc-b-night">${G.night}</span>`);
    const cls = "fc-srt"
      + (s.checkride ? " is-ckr" : "")
      + (s.first_solo ? " is-1st" : (s.solo_candidate ? " is-cand" : ""))
      + (s.night ? " is-night" : "")
      + (spotHit(s) ? " is-spot" : "");
    const ttl = srtLabel(s) + " — " + (s.name || "") + " · section " + s.group
      + (s.hours != null ? " · " + fmt(s.hours) + " h" : "");
    return `<button type="button" class="${cls}" id="fcs-${esc(s.id)}" data-uid="${esc(s.uid)}" data-s="${esc(s.id)}"
      aria-pressed="false" title="${esc(ttl)}" aria-label="${esc(ttl)}">
      <span class="fc-srt-code">${esc(srtLabel(s))}</span>
      ${bits.length ? `<span class="fc-srt-b">${bits.join("")}</span>` : ""}
      ${s.hours != null ? `<span class="fc-srt-h">${esc(fmt(s.hours))} h</span>` : ""}
    </button>`;
  }

  /* §3.4 μακριά labels: «FF 101-108 · FF 190 · …» → «FF 101-108 +6». */
  function shortLabel(n) {
    const parts = String(n.label || "").split(" · ");
    return parts.length > 1 ? parts[0] + " +" + (parts.length - 1) : n.label;
  }

  /* ΜΟΝΟ κατάσταση: CKR/FINAL · 1st SOLO · SOLO n/m · NIGHT · ⚠ = υπάρχουν
     σημειώσεις δεδομένων (το ΚΕΙΜΕΝΟ τους ζει στο popup, ενότητα DATA NOTES). */
  function statusChips(n) {
    const c = [];
    if (n.checkride) {
      c.push(isFinal(n)
        ? `<span class="fc-b fc-b-final">${G.fin} FINAL</span>`
        : `<span class="fc-b fc-b-ckr">${G.ckr} CKR</span>`);
    }
    if (n.solo_required) c.push(`<span class="fc-b fc-b-solo-req">${G.solo} 1st SOLO</span>`);
    else if (n.solo_allowed) c.push(`<span class="fc-b fc-b-solo">${G.solo} SOLO ${n.sorties_solo}/${n.sorties_total}</span>`);
    if (n.night) c.push(`<span class="fc-b fc-b-night">${G.night} NIGHT</span>`);
    const nn = dataNotes(n).length;
    if (nn) {
      c.push(`<span class="fc-b fc-b-warn" title="${esc(nn + (nn === 1 ? " data note" : " data notes")
        + " — open the card to read them")}">${G.warn}${G.info} ${nn}</span>`);
    }
    return c.join("");
  }

  function metrics(n) {
    if (n.kind === "theory" || n.kind === "ground_exam") {
      let s = (n.periods != null ? n.periods + " per." : "—");
      if (n.periods_foreign != null) s += " · " + n.periods_foreign + " foreign";
      return esc(s);
    }
    const h = n.hours_total != null ? fmt(n.hours_total) + " h" : "— h";
    const split = n.sorties_solo
      ? `<span class="fc-c-split"> · ${n.sorties_dual}D+${n.sorties_solo}S</span>`
      : (n.sorties_dual != null ? `<span class="fc-c-split"> · ${n.sorties_dual}D</span>` : "");
    return esc((n.sorties_total != null ? n.sorties_total + " srt · " : "") + h) + split;
  }

  /* §3.5 IN-BLOCK EXAM — ίδιο λιτό λεξιλόγιο με την κάρτα: κωδικός · όνομα ·
     ΜΙΑ γραμμή μετρικών. Οι πύλες («gates …») ζουν στο popup του ground
     κόμβου που τα φιλοξενεί (πίνακας IN-BLOCK EXAMS) — το κλικ πάει εκεί.   */
  function exChip(x) {
    const e = x.ex;
    const host = IX.byId.get(x.node);
    const m = (e.periods == null ? "—" : e.periods + " per.")
      + (e.periods_foreign != null ? " · " + e.periods_foreign + " foreign" : "");
    const ttl = e.code + " — " + (e.name || "") + " · inside " + (host ? shortLabel(host) : x.node)
      + ((e.gates || []).length ? " · gates " + e.gates.join(", ") : "");
    return `<button type="button" class="fc-exchip" data-jump="g:${esc(x.node)}" data-exam="${esc(e.code)}"
      title="${esc(ttl)}" aria-label="${esc(ttl)}">
      <span class="fc-c-top"><b>${esc(e.code)}</b></span>
    </button>`;
  }

  /* ══════════════════════ L2 — ΕΠΙΛΟΓΗ ══════════════════════ */
  function select(uid) {
    const n = node(uid);
    if (!n) return;
    const t = trackOf(n);
    if (S.poster) { S.poster = false; el("fc-poster").setAttribute("aria-pressed", "false"); }
    const needsOpen = isSortieUid(uid) && !S.rendered.has(uid);
    if (S.track !== t || needsOpen || !S.rendered.has(uid)) {
      S.sel = uid;
      const b = bandOf(n);
      if (S.hiddenBands.has(b)) S.hiddenBands.delete(b);
      ensureOpenFor(uid);
      openTrack(t, true);
      return;
    }
    S.sel = uid;
    S.lv = 2;
    ensureOpenFor(uid);
    if (isSortieUid(uid)) renderBands();      // τα auto-open sections χρειάζονται re-render
    applySelection();
    render();
  }

  /* Μοναδική πηγή αλήθειας για το επίπεδο: όποιος δρόμος κι αν οδήγησε εδώ
     (κάρτα, chip, πύλη ράχης, αναζήτηση, deep link) η ύπαρξη επιλογής = L2. */
  function applySelection() {
    const uid = S.sel;
    const n = node(uid);
    if (!n) { closeSheet(); return; }
    S.lv = 2;
    const conn = new Set([uid]);
    if (isSortieUid(uid)) {
      for (const m of (SE.out.get(uid) || [])) conn.add(m.to);
      for (const m of (SE.in.get(uid) || [])) conn.add(m.from);
      conn.add("g:" + n.group);
    } else {
      for (const e of (IX.out.get(n.id) || [])) conn.add("g:" + e.to);
      for (const e of (IX.in.get(n.id) || [])) conn.add("g:" + e.from);
      for (const s of srtOf(n.id)) conn.add(s.uid);
    }
    const items = el("fc-bands").querySelectorAll("[data-uid]");
    for (const c of items) {
      const u = c.dataset.uid;
      const sel = u === uid;
      c.classList.toggle("fc-sel", sel);
      c.classList.toggle("fc-dim", !conn.has(u));
      c.setAttribute("aria-pressed", sel ? "true" : "false");
    }
    decorateChain(uid);
    renderDetail(uid);
    drawNow();
  }

  /* Καθαρίζει ΠΑΝΤΑ πρώτα τα overlays της αλυσίδας, μετά (α) ανάβει τους
     συνδέσμους δίπλα στην επιλογή — η διπλανή ακμή τη λέει ήδη το «→», δεν
     ξανασχεδιάζεται ως γραμμή — και (β) βάζει τα τσιπάκια αναφοράς.         */
  function decorateChain(uid) {
    const host = el("fc-bands");
    for (const o of host.querySelectorAll(".fc-srt-link.is-on")) o.classList.remove("is-on");
    for (const o of host.querySelectorAll(".fc-srt-refs")) o.parentNode.removeChild(o);
    if (!isSortieUid(uid)) return;
    const c = elOf(uid);
    if (!c) return;
    for (const sib of [c.previousElementSibling, c.nextElementSibling]) {
      if (sib && sib.classList.contains("fc-srt-link")) sib.classList.add("is-on");
    }
    const bits = [];
    for (const m of (SE.in.get(uid) || [])) if (!S.rendered.has(m.from)) bits.push(srtRefChip(m.from, "in", m));
    for (const m of (SE.out.get(uid) || [])) if (!S.rendered.has(m.to)) bits.push(srtRefChip(m.to, "out", m));
    if (!bits.length) return;
    const span = document.createElement("span");
    span.className = "fc-srt-refs";
    span.innerHTML = bits.join("");
    c.insertAdjacentElement("afterend", span);
  }
  function srtRefChip(otherUid, dir, m) {
    const o = node(otherUid);
    if (!o) return "";
    const tk = TRACK_BY[trackOf(o)];
    const lb = labelOf(o);
    const txt = dir === "in" ? G.in + "[" + lb + "]" : "[" + lb + "]" + G.out;
    return `<span class="fc-feed" role="button" tabindex="-1" data-jump="${esc(otherUid)}"
      style="--fk:${tk.hex}" title="${esc(m.kinds.join(" + ") + " · " + tk.label + " · " + (BAND_BY[bandOf(o)] || { label: "" }).label)}">${esc(txt)}</span>`;
  }

  function clearSelection() {
    S.sel = null;
    if (S.lv > 1) S.lv = 1;
    const host = el("fc-bands");
    for (const c of host.querySelectorAll("[data-uid]")) { c.classList.remove("fc-sel", "fc-dim"); c.setAttribute("aria-pressed", "false"); }
    for (const o of host.querySelectorAll(".fc-srt-link.is-on")) o.classList.remove("is-on");
    for (const o of host.querySelectorAll(".fc-srt-refs")) o.parentNode.removeChild(o);
    clearSvg();
    closeSheet();
    render();
  }

  function closeSheet() {
    el("fc-detail").classList.add("hidden");
    el("fc-l1").classList.remove("has-sheet");
    drawNow();
  }

  /* ── ΑΚΜΕΣ ──────────────────────────────────────────────────────────────
     ΑΠΑΓΟΡΕΥΕΤΑΙ transform σε πρόγονο του scroller (χαλάει τα rect μαθηματικά)
     → η επιλογή είναι outline+box-shadow και ΠΟΤΕ scale.
     Σχεδιάζονται ΜΟΝΟ ακμές του επιλεγμένου κόμβου, με ΚΑΙ ΤΑ ΔΥΟ άκρα στο
     DOM, που ΔΕΝ τις λέει ήδη ένα chevron.                                  */
  let rafId = 0;
  function drawNow() {
    if (S.sel && S.lv >= 2 && !S.poster) drawEdges(S.sel); else clearSvg();
  }
  function scheduleEdges() {
    if (rafId) return;
    const raf = window.requestAnimationFrame || ((f) => setTimeout(f, 16));
    rafId = raf(() => { rafId = 0; drawNow(); });
  }
  function clearSvg() { const s = el("fc-svg"); if (s) while (s.firstChild) s.removeChild(s.firstChild); }

  const SVGNS = "http://www.w3.org/2000/svg";
  function mk(tag, attrs) {
    const e = document.createElementNS(SVGNS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  /* Οι ακμές του επιλεγμένου κόμβου, ενωμένες σε ΕΝΑ βέλος ανά (from,to). */
  function edgesAround(uid) {
    if (isSortieUid(uid)) {
      return [].concat(SE.in.get(uid) || [], SE.out.get(uid) || []);
    }
    const id = String(uid).slice(2);
    const seen = new Map(), out = [];
    const add = (e) => {
      const key = "g:" + e.from + ">g:" + e.to;
      let m = seen.get(key);
      if (!m) {
        m = { key: key, from: "g:" + e.from, to: "g:" + e.to, kinds: [], ev: [] };
        seen.set(key, m); out.push(m);
      }
      if (m.kinds.indexOf(e.kind) < 0) m.kinds.push(e.kind);
      m.ev.push(e);
    };
    for (const e of (IX.in.get(id) || [])) add(e);
    for (const e of (IX.out.get(id) || [])) add(e);
    return out;
  }

  function drawEdges(uid) {
    const svg = el("fc-svg"), sc = el("fc-rail-scroll");
    if (!svg || !sc) return;
    clearSvg();
    svg.setAttribute("width", sc.clientWidth);
    svg.setAttribute("height", sc.scrollHeight);
    const n = node(uid);
    if (!n) return;
    const OUT_C = cssVar("--fcb-" + (bandOf(n) || "flights"));
    const IN_C = cssVar("--fcb-exams");

    const defs = mk("defs", {});
    for (const [mid, col] of [["fc-arr-in", IN_C], ["fc-arr-out", OUT_C]]) {
      const m = mk("marker", { id: mid, markerWidth: 6, markerHeight: 6, refX: 5, refY: 3, orient: "auto", markerUnits: "strokeWidth" });
      m.appendChild(mk("path", { d: "M0,0 L6,3 L0,6 z", fill: col }));
      defs.appendChild(m);
    }
    svg.appendChild(defs);

    const sr = sc.getBoundingClientRect();
    const box = (u) => {
      const c = elOf(u);
      if (!c) return null;
      const r = c.getBoundingClientRect();
      return {
        l: r.left - sr.left + sc.scrollLeft, r: r.right - sr.left + sc.scrollLeft,
        t: r.top - sr.top + sc.scrollTop,    b: r.bottom - sr.top + sc.scrollTop,
        cx: r.left - sr.left + sc.scrollLeft + r.width / 2,
        cy: r.top - sr.top + sc.scrollTop + r.height / 2,
      };
    };

    // Το fade-in το κάνει CSS keyframe (@keyframes fcEdge) — κανένα δεύτερο tick.
    const g = mk("g", { opacity: "0.9" });
    for (const m of edgesAround(uid)) {
      if (S.chev.has(m.from + ">" + m.to)) continue;              // το λέει ήδη το chevron
      if (!S.rendered.has(m.from) || !S.rendered.has(m.to)) continue;   // → τσιπάκι αναφοράς
      const a = box(m.from), b = box(m.to);
      if (!a || !b) continue;
      const outgoing = m.from === uid;
      let d;
      if (b.t >= a.b - 6) {                       // b κάτω από το a
        const y1 = a.b, y2 = b.t, dd = Math.max(28, (y2 - y1) / 2);
        d = `M ${a.cx} ${y1} C ${a.cx} ${y1 + dd}, ${b.cx} ${y2 - dd}, ${b.cx} ${y2}`;
      } else if (a.t >= b.b - 6) {                // b πάνω από το a
        const y1 = a.t, y2 = b.b, dd = Math.max(28, (y1 - y2) / 2), off = 24;
        d = `M ${a.cx} ${y1} C ${a.cx - off} ${y1 - dd}, ${b.cx - off} ${y2 + dd}, ${b.cx} ${y2}`;
      } else if (b.l >= a.r - 6) {                // δίπλα-δεξιά
        const x1 = a.r, x2 = b.l, dd = Math.max(24, (x2 - x1) / 2);
        d = `M ${x1} ${a.cy} C ${x1 + dd} ${a.cy}, ${x2 - dd} ${b.cy}, ${x2} ${b.cy}`;
      } else {                                    // δίπλα-αριστερά ή επικάλυψη
        const x1 = a.l, x2 = b.r, dd = Math.max(24, (x1 - x2) / 2);
        d = `M ${x1} ${a.cy} C ${x1 - dd} ${a.cy}, ${x2 + dd} ${b.cy}, ${x2} ${b.cy}`;
      }
      const p = mk("path", {
        d: d, fill: "none", "stroke-width": "2",
        stroke: outgoing ? OUT_C : IN_C,
        "marker-end": "url(#" + (outgoing ? "fc-arr-out" : "fc-arr-in") + ")",
      });
      const st = edgeStyle(m);
      if (DASH[st]) p.setAttribute("stroke-dasharray", DASH[st]);
      const ttl = mk("title", {});
      const A = node(m.from), B = node(m.to);
      ttl.textContent = (A ? labelOf(A) : m.from) + " → " + (B ? labelOf(B) : m.to)
        + " · " + m.kinds.join(" + ") + " (" + st + ")";
      p.appendChild(ttl);
      g.appendChild(p);
    }
    svg.appendChild(g);
  }

  /* ══════════════════════ SIDE SHEET ══════════════════════ */
  function renderDetail(uid) {
    if (isSortieUid(uid)) renderSortieDetail(node(uid));
    else renderGroupDetail(node(uid));
    el("fc-detail").classList.remove("hidden");
    el("fc-l1").classList.add("has-sheet");
  }

  function sheetTint(n) {
    const box = el("fc-detail");
    const b = bandOf(n);
    box.style.setProperty("--tk", bandVar(b));
    box.style.setProperty("--tk-rgb", bandRgb(b));
  }

  /* ── ΕΞΟΔΟΣ (sortie) ── */
  function renderSortieDetail(s) {
    if (!s) return;
    const box = el("fc-detail");
    const g = IX.byId.get(s.group);
    const tk = TRACK_BY[trackOf(s)];
    sheetTint(s);

    const badges = [];
    if (s.checkride) badges.push(`<span class="fc-b fc-b-ckr">${G.ckr} CHECKRIDE</span>`);
    if (s.first_solo) badges.push(`<span class="fc-b fc-b-solo-req">${G.solo} 1st SOLO</span>`);
    else if (s.solo_candidate) badges.push(`<span class="fc-b fc-b-solo">${G.solo} SOLO CANDIDATE</span>`);
    if (s.night) badges.push(`<span class="fc-b fc-b-night">${G.night} NIGHT</span>`);

    const vg = [];
    const put = (k, v) => vg.push(`<div class="fc-vg"><span>${esc(k)}</span> ${esc(v == null ? "—" : String(v))}</div>`);
    put("HOURS", s.hours != null ? fmt(s.hours) : null);
    put("BAND", (BAND_BY[bandOf(s)] || {}).label);
    put("SECTION", s.group);
    put("PRINTED", s.section_verbatim);
    put("TRACK", tk.label);
    put("PAGE", s.page_pdf != null ? "PDF p." + s.page_pdf : null);

    const chain = srtOf(s.group);
    const ci = chain.findIndex((x) => x.id === s.id);
    const prev = ci > 0 ? chain[ci - 1] : null;
    const next = ci >= 0 && ci < chain.length - 1 ? chain[ci + 1] : null;

    const rel = relations(s.uid);
    const srcGroups = [{
      title: srtLabel(s) + " — this sortie",
      rows: [
        ["File", (s.source_files || []).join(" · ")],
        ["Page", s.page_pdf != null ? "PDF p." + s.page_pdf : ""],
        ["Ref", s.section_verbatim ? "printed section “" + s.section_verbatim + "”" : ""],
        ["Hours basis", s.hours_basis || "", "fc-src-vb"],   // υπολογισμός, ΟΧΙ verbatim
      ],
    }].concat(
      (s.also_printed_in || []).map((a) => ({
        title: "Also printed in" + (a.role ? " · " + a.role : ""),
        rows: [
          ["File", a.file || ""],
          ["Page", a.page_pdf != null ? "PDF p." + a.page_pdf : ""],
          ["Ref", [a.role, a.cross_category].filter(Boolean).join(" · ")],
        ],
      })),
      srcGroupsOfRels(rel.inn, "in"),
      srcGroupsOfRels(rel.out, "out")
    );

    box.innerHTML = `
      <div class="fc-d-head">
        <span class="fc-d-code">${esc(srtLabel(s))}</span>
        <span class="badge">sortie</span>
        <span class="badge" style="color:${tk.hex};border-color:${tk.hex}">${esc(tk.label)}</span>
        <button type="button" class="copy-btn" id="fc-close" aria-label="Close">✕</button>
      </div>
      <p class="obs-text">${esc(s.name || "")}</p>
      ${badges.length ? `<div class="fc-d-badges">${badges.join("")}</div>` : ""}
      <div class="fc-vitals-grid">${vg.join("")}</div>
      ${s.hours_basis ? `<p class="fc-cap">${esc(s.hours_basis)}</p>` : ""}
      <div class="fc-d-acts">
        <button type="button" class="req-link fc-svbtn" data-schedval="${esc(s.uid)}"
          title="Open Schedule validation for this sortie">✓ VALIDATE SCHEDULE</button>
      </div>
      ${g ? `<h4 class="fc-h4">TRAINING SECTION</h4>
        <p class="fc-ul"><button type="button" class="req-link fc-jump" data-jump="g:${esc(g.id)}">${esc(g.label)}</button>
        <span class="hint"> ${esc(g.name || "")}</span></p>
        <p class="fc-cap">${esc(metricsPlain(g))}</p>` : ""}
      ${relList(rel.inn, "in")}
      ${relList(rel.out, "out")}
      ${notesBlock(s)}
      <div class="fc-step">
        <button type="button" class="req-link" data-jump="${prev ? esc(prev.uid) : ""}" ${prev ? "" : "disabled"}>◀ PREV</button>
        <button type="button" class="req-link" data-copy="${esc(s.id)}">COPY ${esc(s.id)}</button>
        <button type="button" class="req-link" data-jump="${next ? esc(next.uid) : ""}" ${next ? "" : "disabled"}>NEXT ▶</button>
      </div>
      ${srcDetails(srcGroups)}`;
  }

  function metricsPlain(n) {
    const bits = [];
    if (n.sorties_total != null) bits.push(n.sorties_total + (n.sorties_total === 1 ? " sortie" : " sorties"));
    if (n.hours_total != null) bits.push(fmt(n.hours_total) + " h");
    if (n.hours_per_sortie != null) bits.push(fmt(n.hours_per_sortie) + " h per sortie");
    if (n.device) bits.push(n.device);
    return bits.join(" · ");
  }

  /* ── ← FED BY · BEFORE  /  FEEDS → · AFTER ────────────────────────────────
     Μία γραμμή ανά ΑΛΛΟ ΑΚΡΟ, με ενωμένα kinds. Το «off-rail» σημαίνει ότι το
     άλλο άκρο δεν είναι τώρα στη ράγα — ήταν αυτό ακριβώς που τύπωνε το
     dashed τσιπάκι αναφοράς πάνω στην κάρτα.                                */
  function relList(list, dir) {
    if (!list.length) return "";
    const rows = list.map((r) => {
      const o = node(r.uid);
      if (!o) return "";
      const ot = TRACK_BY[trackOf(o)];
      const bd = (BAND_BY[bandOf(o)] || { label: "" }).label;
      const off = !S.rendered.has(r.uid);
      /* Η γραμμή μένει ΜΙΑ γραμμή: μόνο οι σύντομες σημειώσεις μπαίνουν εδώ.
         Οι μακροσκελείς (σημειώσεις ψηφιοποίησης) πάνε ΟΛΕΣ στον αναδιπλωμένο
         πίνακα «Source & verbatim» — τίποτα δεν χάνεται, τίποτα δεν φωνάζει.  */
      const seen = {}, notes = [];
      let long = 0;
      for (const e of r.ev) {
        if (!e.note || seen[e.note]) continue;
        seen[e.note] = 1;
        if (e.note.length > NOTE_INLINE) long++; else notes.push(e.note);
      }
      const lb = isSortieUid(r.uid) ? labelOf(o) : shortLabel(o);   // τα ground labels είναι τεράστια
      return `<li><span class="fc-dot" style="background:${ot.hex}" aria-hidden="true"></span>
        <button type="button" class="req-link fc-jump" data-jump="${esc(r.uid)}"
          title="${esc(labelOf(o) + (o.name ? " — " + o.name : ""))}">${esc(lb)}</button>
        <span class="hint">${esc(o.name || "")}</span>
        <span class="fc-rel-m">${esc(r.kinds.join(" + ") + " · " + ot.label + " · " + bd)}${off
          ? `<span class="fc-rel-off" title="not on the rail right now — it used to print as a dashed reference chip">off-rail</span>` : ""}${long
          ? `<span class="fc-rel-more">+${long} in Source &amp; verbatim</span>` : ""}</span>
        ${notes.map((t) => `<span class="fc-rel-n">${esc(t)}</span>`).join("")}</li>`;
    }).join("");
    return `<h4 class="fc-h4">${dir === "in" ? "← FED BY · BEFORE" : "FEEDS → · AFTER"}
      <span class="fc-h4-n">${list.length}</span></h4><ul class="fc-ul fc-rel">${rows}</ul>`;
  }

  /* ΣΗΜΕΙΩΣΕΙΣ ΔΕΔΟΜΕΝΩΝ — το κείμενο πίσω από το ⚠ⓘ badge της κάρτας. */
  function notesBlock(n) {
    const list = dataNotes(n);
    if (!list.length) return "";
    return `<h4 class="fc-h4">${G.warn} DATA NOTES <span class="fc-h4-n">${list.length}</span></h4>`
      + `<ul class="fc-ul fc-notes">${list.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>`;
  }

  /* ΠΗΓΕΣ / VERBATIM των ακμών → ομάδες γραμμών File / Page / Ref / Verbatim.
     Μία ομάδα ανά (source, verbatim): η ίδια πρόταση συχνά καλύπτει δύο άκρα
     («… are I4501 and I3601 …») — τα άκρα απαριθμούνται μαζί στον τίτλο.     */
  function srcGroupsOfRels(list, dir) {
    const bag = new Map();
    for (const r of list) {
      for (const e of r.ev) {
        if (!e.verbatim && !e.source && !e.note) continue;
        const k = (e.source || "") + "|" + (e.verbatim || "") + "|" + (e.note || "");
        let v = bag.get(k);
        if (!v) { v = { e: e, ends: [], kinds: [] }; bag.set(k, v); }
        const other = node(dir === "in" ? e.from_ref : e.to_ref) || node(r.uid);
        const lb = !other ? r.uid
          : (other.uid && isSortieUid(other.uid) ? labelOf(other) : shortLabel(other));
        if (v.ends.indexOf(lb) < 0) v.ends.push(lb);
        if (e.kind && v.kinds.indexOf(e.kind) < 0) v.kinds.push(e.kind);
      }
    }
    const out = [];
    bag.forEach((v) => {
      const e = v.e;
      out.push({
        title: (dir === "in" ? "← " : "→ ") + v.ends.join(" · ") + (v.kinds.length ? " · " + v.kinds.join(" + ") : ""),
        rows: [
          ["File", (e.origin || []).map((o) => o + ".json").join(" · ")],
          ["Page", e.page_pdf != null ? "PDF p." + e.page_pdf + (e.page_pdf_target != null ? " → p." + e.page_pdf_target : "") : ""],
          ["Ref", e.source || ""],
          ["Note", e.note || "", "fc-src-vb"],
          ["Verbatim", e.verbatim ? "“" + e.verbatim + "”" : "", "fc-src-vb"],
        ],
      });
    });
    return out;
  }

  /* §3β ΑΝΑΔΙΠΛΩΜΕΝΟ «Source & verbatim» — ΠΙΝΑΚΑΣ, μία ομάδα ανά πηγή/ακμή.
     groups = [{ title, rows: [[key, value, cssClass?], …] }]                */
  function srcDetails(groups, opts) {
    const o = opts || {};
    const gs = (groups || []).filter((g) => g && (g.rows || []).some((r) => r[1] != null && r[1] !== ""));
    if (!gs.length) return "";
    const body = gs.map((g) =>
      `<tr class="fc-src-grp"><th colspan="2">${esc(g.title || "")}</th></tr>`
      + g.rows.filter((r) => r[1] != null && r[1] !== "").map((r) =>
        `<tr><th>${esc(r[0])}</th><td${r[2] ? ` class="${esc(r[2])}"` : ""}>${esc(r[1])}</td></tr>`).join("")
    ).join("");
    return `<details class="fc-src"${o.open ? " open" : ""}>
      <summary>📄 ${esc(o.label || "Source & verbatim")} <span class="fc-h4-n">${gs.length}</span></summary>
      <div class="fc-scroll-x"><table class="fc-tbl fc-src-tbl"><tbody>${body}</tbody></table></div>
    </details>`;
  }

  /* ── TRAINING SECTION (group) — η v1 συμπεριφορά ── */
  function renderGroupDetail(n) {
    if (!n) return;
    const box = el("fc-detail"), tk = TRACK_BY[trackOf(n)];
    sheetTint(n);

    const vg = [];
    const put = (k, v) => vg.push(`<div class="fc-vg"><span>${esc(k)}</span> ${esc(v == null ? "—" : String(v))}</div>`);
    if (n.kind === "theory" || n.kind === "ground_exam") {
      put("PERIODS", n.periods);
      put("FOREIGN", n.periods_foreign);
    } else {
      put("SORTIES", n.sorties_total);
      put("HOURS", n.hours_total != null ? fmt(n.hours_total) : null);
      put("DUAL srt", n.sorties_dual);
      put("DUAL h", n.hours_dual != null ? fmt(n.hours_dual) : null);
      put("SOLO srt", n.sorties_solo);
      put("SOLO h", n.hours_solo != null ? fmt(n.hours_solo) : null);
      put("PER SORTIE", n.hours_per_sortie != null ? fmt(n.hours_per_sortie) : null);
      if (n.device) put("DEVICE", n.device);
      if (n.means_of_training) put("MEANS", n.means_of_training);
    }

    let examTbl = "";
    if ((n.exams || []).length) {
      examTbl = `<h4 class="fc-h4" id="fc-d-exams">${G.exam} IN-BLOCK EXAMS <span class="fc-h4-n">${n.exams.length}</span></h4><div class="fc-scroll-x">
        <table class="fc-tbl"><thead><tr><th>Code</th><th>Name</th><th>Per.</th><th>Foreign</th><th>Gates</th></tr></thead><tbody>
        ${n.exams.map((x) => `<tr><td class="num">${esc(x.code)}</td><td>${esc(x.name || "")}</td>
          <td class="num">${esc(String(x.periods == null ? "—" : x.periods))}</td>
          <td class="num">${esc(x.periods_foreign == null ? "—" : String(x.periods_foreign))}</td>
          <td>${esc((x.gates || []).join(", "))}</td></tr>`).join("")}
        </tbody></table></div>`;
    }

    let cond = "";
    if (n.conditional) {
      const extra = Object.keys(n.conditional).filter((k) => k !== "reason")
        .map((k) => `<span class="badge kv">${esc(k)}: ${esc(String(n.conditional[k]))}</span>`).join("");
      cond = `<h4 class="fc-h4">FOREIGN SPs</h4><p class="hint">${esc(n.conditional.reason || "")}</p>
        ${extra ? `<div class="kv-row">${extra}</div>` : ""}`;
    }

    const chain = fc.nodes.filter((x) => cellOf(x.id) === cellOf(n.id));
    const ci = chain.findIndex((x) => x.id === n.id);
    const prev = ci > 0 ? chain[ci - 1] : null, next = ci >= 0 && ci < chain.length - 1 ? chain[ci + 1] : null;

    /* Οι ΤΡΕΙΣ πηγές σχέσεων (v1 ακμές · ground_chain/ground_entry · gates)
       ενωμένες — έτσι το IN 290 δείχνει επιτέλους ΠΟΙΟ ΜΑΘΗΜΑ το τροφοδοτεί. */
    const rel = relations(n.uid || ("g:" + n.id));
    const srcGroups = [{
      title: n.label + " — this node",
      rows: [
        ["File", (n.source && n.source.file) || ""],
        ["Page", n.source && n.source.page_pdf != null ? "PDF p." + n.source.page_pdf : ""],
        ["Ref", (n.source && n.source.ref) || ""],
        ["Verbatim", n.duration_verbatim ? "“" + n.duration_verbatim + "”" : "", "fc-src-vb"],
      ],
    }];
    if (!n.duration_verbatim && n.duration_summary) {
      srcGroups.push({
        title: "Duration — " + G.warn + " editorial summary, NOT verbatim (legend.notes)",
        rows: [["Summary", n.duration_summary, "fc-src-vb"]],
      });
    }
    const svBtn = (bandOf(n) === "fs" || bandOf(n) === "flights") && srtOf(n.id).length
      ? `<div class="fc-d-acts">
          <button type="button" class="req-link fc-svbtn" data-schedval="g:${esc(n.id)}"
            title="Open Schedule validation on the first sortie of this Training Section">✓ VALIDATE SCHEDULE</button>
        </div>` : "";

    box.innerHTML = `
      <div class="fc-d-head">
        <span class="fc-d-code">${esc(n.label)}</span>
        <span class="badge">${esc(KIND_LABELS[n.kind] || n.kind)}</span>
        <span class="badge" style="color:${tk.hex};border-color:${tk.hex}">${esc(tk.label)}</span>
        <button type="button" class="copy-btn" id="fc-close" aria-label="Close">✕</button>
      </div>
      <p class="obs-text">${esc(n.name || "")}</p>
      ${n.mission_verbatim ? `<p class="verbatim">MISSION — ${esc(n.mission_verbatim)}</p>` : ""}
      ${n.objective_verbatim ? `<p class="verbatim">OBJECTIVE — ${esc(n.objective_verbatim)}</p>` : ""}
      <div class="fc-vitals-grid">${vg.join("")}</div>
      ${svBtn}
      ${sortieBlock(n)}
      ${examTbl}
      ${cond}
      ${relList(rel.inn, "in")}
      ${relList(rel.out, "out")}
      ${notesBlock(n)}
      <div class="fc-step">
        <button type="button" class="req-link" data-jump="${prev ? "g:" + esc(prev.id) : ""}" ${prev ? "" : "disabled"}>◀ PREV</button>
        <button type="button" class="req-link" data-jump="${next ? "g:" + esc(next.id) : ""}" ${next ? "" : "disabled"}>NEXT ▶</button>
      </div>
      ${srcDetails(srcGroups.concat(srcGroupsOfRels(rel.inn, "in"), srcGroupsOfRels(rel.out, "out")))}`;
  }

  /* ── ΕΞΟΔΟΙ ΜΕΣΑ ΣΤΟ SHEET ΤΟΥ SECTION ───────────────────────────────────
     ΚΡΙΣΙΜΟ: sorties_solo ≠ solo candidates. Οι υποψήφιες είναι 17 σε όλο το
     στάδιο, οι πραγματικές SOLO 8 → ΔΥΟ διακριτά glyphs, ποτέ ισοπέδωση.    */
  function sortieBlock(n) {
    const list = srtOf(n.id);
    if (!list.length) return "";
    const chips = list.map((s) => {
      let cls = "fc-sortie", gl = "";
      if (s.first_solo) { cls += " is-1st"; gl = G.solo + " "; }
      else if (s.solo_candidate) { cls += " is-cand"; gl = G.solo + " "; }
      else if (s.checkride) { cls += " is-ckr"; gl = G.ckr + " "; }
      else if (s.night) { cls += " is-night"; gl = G.night + " "; }
      return `<button type="button" class="${cls}" data-jump="${esc(s.uid)}"
        title="${esc(s.name || "")}">${esc(gl + srtLabel(s))}</button>`;
    }).join("");
    const cand = list.filter((s) => s.solo_candidate).length;
    let cap = "";
    if (cand && n.sorties_solo !== cand) {
      cap = `<p class="fc-cap">SOLO ${n.sorties_solo} of ${cand} candidate sorties (green frame in the flow chart)</p>`;
    }
    return `<h4 class="fc-h4">SORTIES (${list.length})</h4><div class="fc-sorties">${chips}</div>${cap}`;
  }

  /* ══════════════════════ DRAWER ══════════════════════ */
  function openDrawer(key) {
    const t = fc.totals;
    let title = "", body = "";
    /* §3β Το μπλοκ πηγής του drawer ζει σε ΑΝΑΔΙΠΛΩΜΕΝΟ details-πίνακα. */
    const SRC = [];
    const addSrc = (ttl, o, verbatim) => SRC.push({
      title: ttl,
      rows: [
        ["File", (o && o.file) || ""],
        ["Page", o && o.page_pdf != null ? "PDF p." + o.page_pdf : ""],
        ["Ref", (o && o.ref) || ""],
        ["Verbatim", verbatim ? "“" + verbatim + "”" : "", "fc-src-vb"],
      ],
    });
    let srcOpen = false;

    if (key.indexOf("phase:") === 0) {
      const p = (fc.phases || []).find((x) => x.id === key.slice(6));
      if (!p) return;
      title = p.label;
      addSrc(p.label, p.source);
      srcOpen = true;                       // η πηγή ΕΙΝΑΙ όλο το περιεχόμενο

    } else if (key === "ground") {
      title = "GROUND — " + t.ground_training_periods + " periods";
      addSrc("Ground training", null, t.ground_training_verbatim);
      addSrc("Minimum duration", null, t.ground_training_min_duration_verbatim);
      flagLike(/ground/i).slice(0, 3).forEach((f, i) => addSrc("Data note " + (i + 1), null, f));

    } else if (key === "exams") {
      const p2 = (fc.phases || []).find((x) => x.id === "p2");
      const gate = fc.nodes.filter((n) => n.kind === "ground_exam").length;
      const inl = fc.nodes.reduce((s, n) => s + (n.exams || []).length, 0);
      title = "EXAMS — " + (gate + inl) + " (" + gate + " gates + " + inl + " in-block)";
      const rows = [];
      IX.exam.forEach((v, code) => {
        rows.push(`<tr><td class="num">${esc(code)}</td><td>${esc(v.ex.name || "")}</td>
          <td class="num">${esc(String(v.ex.periods == null ? "—" : v.ex.periods))}</td>
          <td class="num">${esc(v.ex.periods_foreign == null ? "—" : String(v.ex.periods_foreign))}</td>
          <td>${esc(v.gate ? "gate (node)" : "inside " + IX.byId.get(v.node).label)}</td>
          <td>${esc((v.ex.gates || []).join(", "))}</td></tr>`);
      });
      if (p2 && p2.source) addSrc(p2.label || "Exams", p2.source);
      body = `<div class="fc-scroll-x"><table class="fc-tbl"><thead><tr><th>Code</th><th>Name</th><th>Per.</th><th>Foreign</th><th>Position</th><th>Gates</th></tr></thead><tbody>${rows.join("")}</tbody></table></div>`;

    } else if (key === "fs" || key === "flights") {
      const isFs = key === "fs";
      title = (isFs ? "F/S — " + t.fs.total : "FLIGHTS — " + t.flight.total.total);
      const rows = TRACKS.filter((x) => x.tot).map((x) => {
        const A = agg(x.id);
        const n = (isFs ? A.fs : A.flights).reduce((s, g) => s + srtOf(g.id).length, 0);
        return isFs
          ? `<tr><td>${esc(x.label)}</td><td class="num">${esc(t.fs[x.tot])}</td><td class="num">${A.fs.length}</td><td class="num">${n}</td></tr>`
          : `<tr><td>${esc(x.label)}</td><td class="num">${esc(t.flight[x.tot].dual)}</td>
             <td class="num">${esc(t.flight[x.tot].solo)}</td><td class="num">${esc(t.flight[x.tot].total)}</td><td class="num">${n}</td></tr>`;
      }).join("");
      const nAll = fc.sorties.filter((s) => bandOf(s) === (isFs ? "fs" : "flights")).length;
      addSrc(isFs ? "F/S totals" : "Flight totals", isFs ? t.fs.source : t.flight.source);
      body = isFs
        ? `<div class="fc-scroll-x"><table class="fc-tbl"><thead><tr><th>Track</th><th>Sorties / hours</th><th>Sections</th><th>Sorties here</th></tr></thead><tbody>${rows}
            <tr><td>Familiarization</td><td class="num">${esc(t.fs.familiarization)}</td><td class="num">—</td><td class="num">—</td></tr>
            <tr><td><b>TOTAL</b></td><td class="num"><b>${esc(t.fs.total)}</b></td>
            <td class="num">${fc.nodes.filter((n) => bandOf(n) === "fs").length}</td><td class="num"><b>${nAll}</b></td></tr>
            </tbody></table></div>`
        : `<div class="fc-scroll-x"><table class="fc-tbl"><thead><tr><th>Track</th><th>DUAL</th><th>SOLO</th><th>TOTAL</th><th>Sorties here</th></tr></thead><tbody>${rows}
            <tr><td><b>TOTAL</b></td><td class="num"><b>${esc(t.flight.total.dual)}</b></td>
            <td class="num"><b>${esc(t.flight.total.solo)}</b></td><td class="num"><b>${esc(t.flight.total.total)}</b></td>
            <td class="num"><b>${nAll}</b></td></tr>
            </tbody></table></div>`;

    } else if (key === "solo") {
      title = "SOLO — " + t.flight.total.solo;
      const rows = fc.nodes.filter((n) => n.solo_allowed || n.solo_required).map((n) => {
        const cand = srtOf(n.id).filter((s) => s.solo_candidate);
        return `<tr><td class="num">${esc(n.label)}</td><td>${esc(n.name || "")}</td>
         <td class="num">${esc(String(n.sorties_solo == null ? "—" : n.sorties_solo))}</td>
         <td class="num">${cand.length}</td>
         <td>${esc(cand.map(srtLabel).join(", "))}</td></tr>`;
      }).join("");
      addSrc("Minimum SOLO hours", t.minimum_hours_source, t.minimum_hours_verbatim);
      body = `<div class="fc-scroll-x"><table class="fc-tbl"><thead><tr><th>Section</th><th>Mission</th><th>SOLO</th><th>Candidates</th><th>Codes</th></tr></thead><tbody>${rows}</tbody></table></div>`;

    } else if (key === "ckr") {
      const ck = fc.sorties.filter((s) => s.checkride);
      title = "CHECKRIDES — " + ck.length;
      const rows = ck.map((s) => {
        const g = IX.byId.get(s.group);
        return `<tr><td class="num">${esc(srtLabel(s))}</td><td>${esc(TRACK_BY[trackOf(s)].label)}</td>
         <td>${esc(s.name || "")}</td><td>${g && isFinal(g) ? G.fin + " FINAL" : ""}</td></tr>`;
      }).join("");
      addSrc("Final evaluations", null, t.final_evaluations_verbatim);
      addSrc("Minimum flying days", null, t.flight_training_min_duration_verbatim);
      body = `<p class="fc-cap">The FINALs are derived STRUCTURALLY (a checkride with no outgoing sequence inside its own cell) — the source verbatim spells «Ν4690» with a Greek capital Nu.</p>`
        + `<div class="fc-scroll-x"><table class="fc-tbl"><thead><tr><th>Sortie</th><th>Track</th><th>Mission</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
    } else return;

    const d = el("fc-drawer");
    d.innerHTML = `<div class="fc-drawer-box">
      <div class="fc-drawer-head"><h3>${esc(title)}</h3>
        <button type="button" class="copy-btn" data-close="1">✕ Close</button></div>
      <div class="fc-drawer-body">${body}${srcDetails(SRC, { open: srcOpen })}</div></div>`;
    d.classList.remove("hidden");
  }

  /* ══════════════════════ LEGEND ══════════════════════ */
  function renderLegendPop() {
    const row = (sw, txt) => `<div class="fc-leg">${sw}<span>${esc(txt)}</span></div>`;
    const dot = (c) => `<i style="background:${c}"></i>`;
    const gl = (g) => `<b aria-hidden="true">${g}</b>`;
    let h = `<h4 class="fc-h4">SHAPE = MEANING</h4>`;
    h += row(gl(G.sec), "training section (parent card — click to open its sortie chain)")
       + row(gl("▸▾"), "section collapsed / expanded")
       + row(gl(G.exam), "ground exam (gate)")
       + row(gl(G.ckr), "checkride sortie")
       + row(gl(G.fin), "FINAL evaluation (last one of the category)")
       + row(gl(G.solo), "SOLO — filled = 1st SOLO, green = candidate sortie")
       + row(gl(G.night), "night sortie")
       + row(gl(G.in + G.out), "reference chip — the other end is off the rail (drawn next to the selected sortie)")
       + row(gl(G.warn + G.info), "data notes exist — the text lives in the card popup, section DATA NOTES")
       + row(gl(G.info), "printed ≠ sum of sections");
    h += `<h4 class="fc-h4">CARD = HEADLINE · POPUP = EVERYTHING ELSE</h4>`;
    h += `<p class="fc-cap">A card carries only its code, its short name, one line of metrics and the status
      badges above. Every relation (← FED BY · BEFORE / FEEDS → · AFTER), the in-block exams, the exam gates,
      the data notes and the sources move into the popup that opens on click — printed once, never twice.</p>`;
    h += `<h4 class="fc-h4">ZONES — the colour of a single-track view</h4>`;
    for (const b of BANDS) h += row(dot(bandVar(b.id)), b.label + " — " + b.sub);
    h += `<h4 class="fc-h4">TRACKS — the colour of the “All tracks” dashboard</h4>`;
    for (const t of TRACKS) h += row(dot(t.hex), t.label);
    h += `<h4 class="fc-h4">STATUS</h4>`
       + row(dot("#5fe0a8"), "candidate SOLO — green frame")
       + row(dot("#ffd166"), "1st SOLO / evaluation")
       + row(dot("#ff7a70"), "night");
    h += `<h4 class="fc-h4">EDGES — one arrow per pair, kinds merged</h4>`
       + row(gl("──"), "solid — sequence (arrow drawn in the Training Flow Chart)")
       + row(gl("- -"), "dashed — feed / prereq / ground entry (crosses a column)")
       + row(gl("··"), "dotted — before (rule written in the text, no arrow)")
       + row(dot(bandVar("exams")), "amber arrow — INTO the selection (← BEFORE)")
       + row(gl("→"), "zone-coloured arrow — OUT of the selection (AFTER →)");
    h += `<h4 class="fc-h4">SOURCE OF THE COLORS</h4><p class="verbatim">${esc(fc.legend.symbols_verbatim)}</p>`;
    const s = fc.legend.symbols_source;
    h += `<p class="req-src">📄 ${esc(s.file)} · p.${esc(String(s.page_pdf))} · ${esc(s.ref)}</p>`;
    h += `<div class="fc-step"><button type="button" class="req-link" data-close="1">Close</button></div>`;
    el("fc-legend-pop").innerHTML = h;
  }

  /* ══════════════════════ POSTER ══════════════════════ */
  function renderPoster() {
    const phases = (fc.phases || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
    el("fc-poster-view").innerHTML = phases.map((p) => {
      const list = fc.nodes.filter((n) => n.phase === p.id);
      return `<div class="fc-pcol">
        <div class="fc-pcol-h">${esc(p.label)} <span class="fc-band-n">${list.length}</span></div>
        ${list.map((n) => {
          const b = bandOf(n);
          return card(n, "is-poster" + (n.checkride ? " is-ckr" : ""), "end", true)
            .replace('class="fc-card', `style="--tk:${bandVar(b)};--tk-rgb:${bandRgb(b)}" class="fc-card`);
        }).join("")}
      </div>`;
    }).join("");
  }

  /* ══════════════════════ ΑΝΑΖΗΤΗΣΗ ══════════════════════ */
  let qTimer = 0;
  function search(q) {
    const box = el("fc-sug");
    const s = String(q || "").trim().toLowerCase();
    if (!s) { box.classList.add("hidden"); S.sug = []; S.sugIx = -1; return; }
    const seen = new Set(), hits = [];
    for (const e of IX.search) {
      if (e.hay.indexOf(s) < 0) continue;
      const k = e.uid + "|" + e.code;
      if (seen.has(k)) continue;
      seen.add(k);
      hits.push(e);
      if (hits.length >= 10) break;
    }
    S.sug = hits; S.sugIx = hits.length ? 0 : -1;
    box.innerHTML = hits.length
      ? hits.map((e, i) => {
          const n = node(e.uid);
          const tk = TRACK_BY[trackOf(n || {})] || TRACK_BY.shared;
          return `<button type="button" class="fc-sug-item${i === 0 ? " is-on" : ""}" data-jump="${esc(e.uid)}" data-ix="${i}">
            <span class="fc-sug-dot" style="background:${tk.hex}"></span>
            <span class="fc-sug-code">${esc(e.code)}</span>
            <span class="fc-sug-sub">${esc(e.sub)}</span></button>`;
        }).join("")
      : `<p class="fc-sug-empty">No results.</p>`;
    box.classList.remove("hidden");
  }
  function sugMove(d) {
    if (!S.sug.length) return;
    S.sugIx = (S.sugIx + d + S.sug.length) % S.sug.length;
    const items = el("fc-sug").querySelectorAll(".fc-sug-item");
    for (let i = 0; i < items.length; i++) items[i].classList.toggle("is-on", i === S.sugIx);
  }
  function sugPick() {
    if (S.sugIx < 0 || !S.sug[S.sugIx]) return;
    const uid = S.sug[S.sugIx].uid;
    el("fc-sug").classList.add("hidden");
    el("fc-q").blur();
    jump(uid);
  }

  /* ══════════════════════ ΠΛΟΗΓΗΣΗ ══════════════════════ */
  function jump(uid) {
    if (!uid) return;
    const u = normUid(uid);
    const n = node(u);
    if (!n) return;
    if (S.poster) { S.poster = false; el("fc-poster").setAttribute("aria-pressed", "false"); }
    const b = bandOf(n);
    if (S.hiddenBands.has(b)) S.hiddenBands.delete(b);
    select(u);
    const c = elOf(u);
    if (c) c.scrollIntoView({ behavior: "smooth", block: "center" });
    scheduleEdges();
  }
  /* συμβατότητα: σκέτο id → group πρώτα (v1 deep links), αλλιώς sortie */
  function normUid(x) {
    const s = String(x);
    if (s.indexOf("g:") === 0 || s.indexOf("s:") === 0) return s;
    if (IX.byId.has(s)) return "g:" + s;
    if (IX.sortie.has(s)) return "s:" + s;
    return s;
  }

  function goL0() {
    S.lv = 0; S.sel = null; S.track = null;
    S.rendered = new Set(); S.chev = new Set();
    clearSvg(); closeSheet(); render();
  }

  function render() {
    const l0 = el("fc-l0"), l1 = el("fc-l1"), pv = el("fc-poster-view");
    l0.classList.toggle("hidden", S.poster || S.lv > 0);
    l1.classList.toggle("hidden", S.poster || S.lv === 0);
    pv.classList.toggle("hidden", !S.poster);
    el("view-flowchart").dataset.lv = String(S.lv);
    renderCrumbs();
    syncHash();
  }

  function renderCrumbs() {
    const bits = [`<button type="button" class="fc-crumb${S.lv === 0 && !S.poster ? " is-here" : ""}" data-go="l0">Phase II</button>`];
    if (S.poster) {
      bits.push(`<span class="fc-crumb-sep" aria-hidden="true">▸</span><span class="fc-crumb is-here">POSTER</span>`);
    } else if (S.track) {
      const tk = TRACK_BY[S.track];
      bits.push(`<span class="fc-crumb-sep" aria-hidden="true">▸</span>
        <button type="button" class="fc-crumb${S.lv === 1 ? " is-here" : ""}" data-go="l1" style="color:${tk.hex}">${esc(tk.label)}</button>`);
      const n = S.sel ? node(S.sel) : null;
      if (n && isSortieUid(S.sel)) {
        const g = IX.byId.get(n.group);
        if (g) bits.push(`<span class="fc-crumb-sep" aria-hidden="true">▸</span>
          <button type="button" class="fc-crumb" data-jump="g:${esc(g.id)}">${esc(g.label)}</button>`);
        bits.push(`<span class="fc-crumb-sep" aria-hidden="true">▸</span>
          <span class="fc-crumb is-here">${esc(srtLabel(n))}</span>`);
      } else if (n) {
        bits.push(`<span class="fc-crumb-sep" aria-hidden="true">▸</span>
          <span class="fc-crumb is-here">${esc(n.label)}</span>`);
      }
    }
    el("fc-crumbs").innerHTML = bits.join("");
  }

  /* ══════════════════════ HASH ══════════════════════ */
  function syncHash() {
    let h = "#fc";
    if (S.poster) h += "/poster";
    else { if (S.track) h += "/" + S.track; if (S.sel) h += "/" + S.sel; }
    if (location.hash === h) return;
    S.hashLock = true;
    try { history.replaceState(null, "", h); }
    catch (e) { try { location.hash = h; } catch (e2) { /* file:// — αγνοείται */ } }
    setTimeout(() => { S.hashLock = false; }, 0);
  }
  function readHash() {
    const m = /^#fc(?:\/([^/]+))?(?:\/(.+))?$/.exec(location.hash || "");
    if (!m) return;
    if (m[1] === "poster") { setPoster(true); return; }
    const tid = TRACK_ALIAS[m[1]] || m[1];
    if (tid && TRACK_BY[tid]) {
      const u = m[2] ? normUid(m[2]) : null;
      if (u && node(u)) { S.sel = u; ensureOpenFor(u); openTrack(tid, true); }
      else openTrack(tid);
    }
  }

  /* ══════════════════════ ΔΙΑΚΟΠΤΕΣ ══════════════════════ */
  function setDensity(d) {
    S.density = d;
    const b = el("fc-density");
    b.textContent = d === "compact" ? "COMPACT" : "RICH";
    b.setAttribute("aria-pressed", d === "compact" ? "true" : "false");
    if (S.track) renderBands();
    if (S.sel) applySelection();
    scheduleEdges();
  }
  function setPoster(on) {
    S.poster = on;
    el("fc-poster").setAttribute("aria-pressed", on ? "true" : "false");
    if (on) { renderPoster(); clearSvg(); closeSheet(); }
    render();
  }
  function toggleLegend() {
    const p = el("fc-legend-pop"), open = p.classList.contains("hidden");
    if (open) renderLegendPop();
    p.classList.toggle("hidden", !open);
    el("fc-legend-btn").setAttribute("aria-expanded", open ? "true" : "false");
  }
  function setAllSections(on) {
    if (!S.track) return;
    S.open = new Set();
    if (on) {
      const A = agg(S.track);
      for (const g of A.fs.concat(A.flights)) S.open.add(g.id);
    }
    renderBands();
    if (S.sel && S.rendered.has(S.sel)) applySelection(); else clearSelection();
    scheduleEdges();
  }

  function copyCode(btn, code) {
    const done = () => { btn.classList.add("copied"); setTimeout(() => btn.classList.remove("copied"), 900); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code).then(done, () => fallback());
    } else fallback();
    function fallback() {
      const ta = document.createElement("textarea");
      ta.value = code; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); done(); } catch (e) { /* noop */ }
      document.body.removeChild(ta);
    }
  }

  /* ══════════════════════ ΣΥΝΔΕΣΕΙΣ ══════════════════════ */
  function wire() {
    const view = el("view-flowchart");

    view.addEventListener("click", (ev) => {
      const t = ev.target;

      const close = t.closest("[data-close]");
      if (close) {
        el("fc-drawer").classList.add("hidden");
        el("fc-legend-pop").classList.add("hidden");
        el("fc-legend-btn").setAttribute("aria-expanded", "false");
        return;
      }
      if (t.id === "fc-drawer") { t.classList.add("hidden"); return; }

      const cp = t.closest("[data-copy]");
      if (cp) { copyCode(cp, cp.dataset.copy); return; }

      /* Schedule validation ΑΠΕΥΘΕΙΑΣ από το popup του κόμβου (schedval.js). */
      const sv = t.closest("[data-schedval]");
      if (sv) {
        ev.stopPropagation();
        if (window.openSchedVal) window.openSchedVal(sv.dataset.schedval);
        return;
      }

      const feed = t.closest("[data-jump]");
      if (feed && feed.dataset.jump) { ev.stopPropagation(); jump(feed.dataset.jump); return; }

      const dw = t.closest("[data-drawer]");
      if (dw) { openDrawer(dw.dataset.drawer); return; }

      const tc = t.closest("[data-track]");
      if (tc) { openTrack(tc.dataset.track); return; }

      const fb = t.closest("[data-band]");
      if (fb && fb.classList.contains("fc-fbtn")) {
        const id = fb.dataset.band;
        if (S.hiddenBands.has(id)) S.hiddenBands.delete(id); else S.hiddenBands.add(id);
        const sn = S.sel ? node(S.sel) : null;
        if (sn && S.hiddenBands.has(bandOf(sn))) clearSelection();
        renderFilters(); renderBands();
        if (S.sel && S.rendered.has(S.sel)) applySelection();
        scheduleEdges();
        return;
      }
      const sa = t.closest("[data-sections]");
      if (sa) { setAllSections(sa.dataset.sections === "all"); return; }
      const sp = t.closest("[data-spot]");
      if (sp) {
        const k = sp.dataset.spot;
        if (S.spot.has(k)) S.spot.delete(k); else S.spot.add(k);
        renderFilters(); renderBands();
        if (S.sel && S.rendered.has(S.sel)) applySelection();
        return;
      }

      const srt = t.closest(".fc-srt");
      if (srt) { ev.stopPropagation(); select(srt.dataset.uid); return; }

      const cardEl = t.closest(".fc-card");   // ΟΧΙ «card» — σκιάζει τη συνάρτηση card()
      if (cardEl) {
        ev.stopPropagation();
        const gid = cardEl.dataset.sec;
        if (gid) {                            // κάρτα-γονέας F/S ή FLIGHTS
          if (S.open.has(gid)) {
            S.open.delete(gid);
            const wasInside = S.sel && (S.sel === "g:" + gid
              || (isSortieUid(S.sel) && node(S.sel) && node(S.sel).group === gid));
            renderBands();
            if (wasInside) clearSelection();
            else if (S.sel && S.rendered.has(S.sel)) applySelection();
            scheduleEdges();
          } else {
            openSection(gid, true);
            S.sel = "g:" + gid;
            S.lv = 2;
            renderBands();
            applySelection();
            render();
          }
          return;
        }
        select(cardEl.dataset.uid);
        return;
      }

      if (t.id === "fc-close") { clearSelection(); return; }
      const go = t.closest("[data-go]");
      if (go) { go.dataset.go === "l0" ? goL0() : clearSelection(); return; }
      if (t.id === "fc-back") { goL0(); return; }
      if (t.id === "fc-density") { setDensity(S.density === "rich" ? "compact" : "rich"); return; }
      if (t.id === "fc-poster") { setPoster(!S.poster); return; }
      if (t.id === "fc-legend-btn") { toggleLegend(); return; }

      // κλικ σε κενό της σκηνής = ΜΟΝΟ αποεπιλογή (δεν αλλάζει επίπεδο)
      if (t.closest("#fc-rail-scroll") && S.sel) clearSelection();
    });

    el("fc-rail-scroll").addEventListener("scroll", scheduleEdges);
    window.addEventListener("resize", () => { if (!el("view-flowchart").classList.contains("hidden")) scheduleEdges(); });

    const q = el("fc-q");
    q.addEventListener("input", () => {
      clearTimeout(qTimer);
      qTimer = setTimeout(() => search(q.value), 120);
    });
    q.addEventListener("keydown", (ev) => {
      if (ev.key === "ArrowDown") { ev.preventDefault(); sugMove(1); }
      else if (ev.key === "ArrowUp") { ev.preventDefault(); sugMove(-1); }
      else if (ev.key === "Enter") { ev.preventDefault(); sugPick(); }
      else if (ev.key === "Escape") { el("fc-sug").classList.add("hidden"); q.blur(); }
    });

    document.addEventListener("keydown", keyNav);
    window.addEventListener("hashchange", () => { if (!S.hashLock) readHash(); });

    /* Τα χρώματα των ακμών διαβάζονται από CSS vars τη στιγμή του σχεδιασμού →
       στην εναλλαγή dark/light (app.js: html.light) πρέπει να ξανασχεδιαστούν. */
    if (window.MutationObserver) {
      new MutationObserver(() => scheduleEdges())
        .observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    }
  }

  /* §6.4 ΠΛΗΚΤΡΟΛΟΓΙΟ — ενεργό μόνο όταν το view είναι ορατό και ο στόχος
     δεν είναι πεδίο κειμένου (αλλιώς κλέβει πλήκτρα από Remarks/Requirements). */
  function keyNav(ev) {
    if (!fc) return;
    const view = el("view-flowchart");
    if (!view || view.classList.contains("hidden")) return;
    const svm = el("sv-modal");                       // Schedule validation ανοιχτό
    if (svm && !svm.classList.contains("hidden")) return;   // → δικά του πλήκτρα
    const tag = (ev.target.tagName || "").toUpperCase();
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    if (ev.ctrlKey || ev.altKey || ev.metaKey) return;
    const k = ev.key;

    if (k === "/") { ev.preventDefault(); el("fc-q").focus(); el("fc-q").select(); return; }
    if (k === "Escape") {
      if (!el("fc-drawer").classList.contains("hidden")) { el("fc-drawer").classList.add("hidden"); return; }
      if (!el("fc-legend-pop").classList.contains("hidden")) { toggleLegend(); return; }
      if (S.poster) { setPoster(false); return; }
      if (S.sel) clearSelection(); else if (S.lv === 1) goL0();
      return;
    }
    if (k >= "1" && k <= "5") { ev.preventDefault(); openTrack(TRACKS[+k - 1].id); return; }
    if (k === "0") { ev.preventDefault(); goL0(); return; }
    if (k === "l" || k === "L" || k === "λ" || k === "Λ") { toggleLegend(); return; }
    if (k === "p" || k === "P" || k === "π" || k === "Π") { setPoster(!S.poster); return; }
    if (k === "c" || k === "C" || k === "ψ" || k === "Ψ") { setDensity(S.density === "rich" ? "compact" : "rich"); return; }
    if (S.poster || S.lv === 0) return;
    if (k === "e" || k === "E" || k === "ε" || k === "Ε") { setAllSections(true); return; }
    if (k === "x" || k === "X" || k === "χ" || k === "Χ") { setAllSections(false); return; }

    const items = [].slice.call(el("fc-bands").querySelectorAll(".fc-card[data-uid], .fc-srt[data-uid]"));
    if (!items.length) return;
    if (k === "ArrowRight" || k === "ArrowLeft") {
      ev.preventDefault();
      const i = S.sel ? items.findIndex((c) => c.dataset.uid === S.sel) : -1;
      const j = Math.max(0, Math.min(items.length - 1, i + (k === "ArrowRight" ? 1 : -1)));
      const tgt = items[i < 0 ? 0 : j];
      select(tgt.dataset.uid);
      const back = elOf(tgt.dataset.uid);
      if (back) back.scrollIntoView({ block: "nearest" });
      return;
    }
    if (k === "ArrowDown" || k === "ArrowUp") {
      ev.preventDefault();
      const bandsEl = [].slice.call(el("fc-bands").querySelectorAll(".fc-band"));
      if (!bandsEl.length) return;
      let bi = 0;
      if (S.sel) {
        const cur = elOf(S.sel);
        const sec = cur && cur.closest(".fc-band");
        bi = Math.max(0, bandsEl.indexOf(sec));
      }
      const nb = bandsEl[Math.max(0, Math.min(bandsEl.length - 1, bi + (k === "ArrowDown" ? 1 : -1)))];
      const first = nb.querySelector(".fc-card[data-uid]");
      if (first) { select(first.dataset.uid); const b2 = elOf(first.dataset.uid); if (b2) b2.scrollIntoView({ block: "nearest" }); }
      return;
    }
    if (k === "Enter" && S.sel) { ev.preventDefault(); applySelection(); }
  }
})();
