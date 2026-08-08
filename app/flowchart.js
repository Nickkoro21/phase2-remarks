"use strict";
/* ══════════════════════════════════════════════════════════════════════════
   PHASE II FLOWCHART — «ΡΑΓΕΣ ΤΡΟΧΙΑΣ»
   L0 Πίνακας Σταδίου → L1 Ράγα Τροχιάς (4 ζώνες) → L2 Σταθμός → L3 Έξοδοι.
   Πρωτεύων άξονας = ΚΑΤΗΓΟΡΙΑ (5 τροχιές), δευτερεύων = ΣΤΑΔΙΟ (4 ζώνες).

   Επαφή με τον υπόλοιπο κώδικα: μόνο #view-flowchart, η κλάση .hidden και
   το window.fcInit() (app.js:480). Το data/flowchart.json διαβάζεται ΩΣ ΕΧΕΙ.
   Vanilla JS, μηδέν εξαρτήσεις, δουλεύει από file://.
   ══════════════════════════════════════════════════════════════════════════ */

(() => {
  /* ── κρατημένα αυτούσια από την προηγούμενη υλοποίηση ── */
  const KIND_COLORS = {
    theory: "#7d8ca3",
    ground_exam: "#ffb454",
    sim: "#3fd0c9",
    flight: "#58b0ff",
    checkride: "#ffd166",
  };
  const CAT_COLORS = {
    contact: "#58b0ff",
    instrument: "#9d8cff",
    formation: "#46d19a",
    vfr_navigation: "#ff9d5c",
  };
  const KIND_LABELS = {
    theory: "Theory",
    ground_exam: "Ground exam",
    sim: "Simulator (F/S)",
    flight: "Flight",
    checkride: "Checkride",
  };
  const EDGE_STYLE = { sequence: "", prereq: "6 4", implied: "2 4" };

  /* ── ταξινομία ── */
  const TRACKS = [
    { id: "contact",        label: "Contact",        rgb: "88,176,255",  hex: "#58b0ff", tot: "contact" },
    { id: "instrument",     label: "Instrument",     rgb: "157,140,255", hex: "#9d8cff", tot: "instrument" },
    { id: "formation",      label: "Formation",      rgb: "70,209,154",  hex: "#46d19a", tot: "formation" },
    // ΠΡΟΣΟΧΗ: το totals.* κλειδί λέγεται "navigation", όχι "vfr_navigation".
    { id: "vfr_navigation", label: "VFR Navigation", rgb: "255,157,92",  hex: "#ff9d5c", tot: "navigation" },
    { id: "core",           label: "Shared ground",  rgb: "125,140,163", hex: "#7d8ca3", tot: null },
  ];
  const TRACK_BY = {};
  for (const t of TRACKS) TRACK_BY[t.id] = t;

  const BANDS = [
    { id: "ground", label: "GROUND",    c: "#7d8ca3", g: "▤", sub: "GROUND ACADEMICS · PART II §11" },
    { id: "exam",   label: "EXAMS",     c: "#ffb454", g: "▣", sub: "WRITTEN EXAMS · ≥80%" },
    { id: "fs",     label: "F/S",       c: "#3fd0c9", g: "⬒", sub: "FLIGHT SIMULATOR · PART III §13" },
    { id: "air",    label: "T-6A",      c: null,      g: "✈", sub: "AIRCRAFT · PART IV §14" },
  ];
  const BAND_OF = { theory: "ground", ground_exam: "exam", sim: "fs", flight: "air", checkride: "air" };

  const G = { sec: "●", exam: "▣", ckr: "◆", solo: "★", fin: "⦿", night: "☾", in: "⇤", out: "⇥", warn: "⚠", info: "ⓘ" };

  /* ── κατάσταση ── */
  let fc = null;
  let loaded = false;
  const S = {
    lv: 0, track: null, selected: null,
    density: "rich", poster: false,
    hiddenBands: new Set(), spot: new Set(),
    rendered: new Set(),   // ids στο DOM της τρέχουσας ράγας
    chev: new Set(),       // "from>to" ακμές που ήδη τις λέει ένα chevron
    pulsed: new Set(),     // 1st-SOLO pulse: μία φορά ανά session ανά τροχιά
    sug: [], sugIx: -1, hashLock: false,
  };
  const IX = {
    byId: new Map(), out: new Map(), in: new Map(), deg: new Map(),
    sortie: new Map(), exam: new Map(), search: [],
  };

  const el = (id) => document.getElementById(id);
  function esc(s) { const d = document.createElement("div"); d.textContent = s ?? ""; return d.innerHTML; }

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
    // NFD ⇒ ο τόνος γίνεται ξεχωριστό combining U+0301· τα διαλυτικά μένουν.
    if (u.normalize) u = u.normalize("NFD").replace(/[̀́͂]/g, "").normalize("NFC");
    return u;
  }

  const trackOf = (n) => n.category || "core";
  const bandOf  = (n) => BAND_OF[n.kind];
  function cellOf(id) { const n = IX.byId.get(id); return n ? trackOf(n) + "|" + bandOf(n) : "?"; }

  /* ── δείκτης ── */
  function buildIndex() {
    for (const n of fc.nodes) IX.byId.set(n.id, n);
    for (const e of fc.edges) {
      if (!IX.out.has(e.from)) IX.out.set(e.from, []);
      IX.out.get(e.from).push(e);
      if (!IX.in.has(e.to)) IX.in.set(e.to, []);
      IX.in.get(e.to).push(e);
      IX.deg.set(e.from, (IX.deg.get(e.from) || 0) + 1);
      IX.deg.set(e.to,   (IX.deg.get(e.to)   || 0) + 1);
    }
    for (const n of fc.nodes) {
      for (const s of (n.sorties || [])) IX.sortie.set(s, n.id);
      for (const x of (n.exams || [])) IX.exam.set(x.code, { ex: x, node: n.id, gate: false });
      if (n.kind === "ground_exam") {
        IX.exam.set(n.label, {
          ex: { code: n.label, name: n.name, periods: n.periods, periods_foreign: n.periods_foreign, gates: [] },
          node: n.id, gate: true,
        });
      }
    }
    for (const n of fc.nodes) {
      IX.search.push({
        id: n.id, code: n.label,
        hay: (n.id + " " + n.label + " " + (n.name || "")).toLowerCase(),
        sub: KIND_LABELS[n.kind] || n.kind,
      });
    }
    IX.sortie.forEach((nid, code) => {
      IX.search.push({ id: nid, code: code, hay: code.toLowerCase(), sub: "sortie · " + IX.byId.get(nid).label });
    });
    IX.exam.forEach((v, code) => {
      IX.search.push({
        id: v.node, code: code, hay: (code + " " + (v.ex.name || "")).toLowerCase(),
        sub: (v.gate ? "gate exam" : "exam") + " · " + IX.byId.get(v.node).label,
      });
    });
  }

  /* ΠΡΟΣΟΧΗ: το totals.final_evaluations_verbatim γράφει «Ν4690» με ΕΛΛΗΝΙΚΟ κεφαλαίο Νι.
     Κάθε string-match σε λατινικό "N4690" αποτυγχάνει ΣΙΩΠΗΛΑ → μόνο δομικό κριτήριο.
     isFinal = checkride χωρίς εξερχόμενη sequence μέσα στο ίδιο κελί. */
  function isFinal(n) {
    if (!n.checkride) return false;
    return !(IX.out.get(n.id) || []).some((e) => e.kind === "sequence" && cellOf(e.to) === cellOf(n.id));
  }

  /* κόμβοι «ΔΙΑΡΚΩΣ»: χωρίς κουτί στο Training Flow Chart (GT-WSGES, GT-GENBRIEF) */
  function isContinuous(n) {
    return (IX.deg.get(n.id) || 0) === 0 || /^not_in_flow_chart/.test((n.flags || []).join("|"));
  }

  const nodesOf = (track) => fc.nodes.filter((n) => trackOf(n) === track);
  const flagLike = (re) => (fc.flags || []).filter((f) => re.test(f));

  /* ═══ ΚΑΝΟΝΑΣ ΑΚΕΡΑΙΟΤΗΤΑΣ (§0.2) ═══════════════════════════════════════
     Κάθε headline νούμερο βγαίνει από το fc.totals και ΤΥΠΩΝΕΤΑΙ ΑΥΤΟΥΣΙΟ ως
     string. ΠΟΤΕ δεν αθροίζεται από κόμβους. Το άθροισμα υπολογίζεται μόνο για
     να ανιχνευθεί απόκλιση και να μπει το ⓘ δίπλα στο τυπωμένο νούμερο.        */
  function agg(track) {
    const all = nodesOf(track);
    const by = (b) => all.filter((n) => bandOf(n) === b);
    const ground = by("ground"), exam = by("exam"), fs = by("fs"), air = by("air");
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
    const cAir = sum(air);
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
        const tt = trackOf(IX.byId.get(e.to));
        if (tt !== track) feeds[tt] = (feeds[tt] || 0) + 1;
      }
    }
    return {
      all: all, ground: ground, exam: exam, fs: fs, air: air, inline: inline,
      periodsGround: ground.reduce((s, n) => s + (n.periods || 0), 0),
      periodsExam:   exam.reduce((s, n) => s + (n.periods || 0), 0),
      examCount: exam.length + inline.length,
      printedFs: pFs, printedFl: pFl,
      mmFs: pFs ? mm(pFs, cFs) : null,
      mmAir: pFl ? mm(pFl.total, cAir) : null,
      ckr: air.filter((n) => n.checkride),
      finals: air.filter(isFinal),
      soloSections: air.filter((n) => n.solo_allowed && !n.solo_required),
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
      const res = await fetch("../data/flowchart.json", { cache: "no-store" });
      fc = await res.json();
    } catch (err) {
      el("fc-vitals").innerHTML = '<p class="hint">flowchart.json not found.</p>';
      return;
    }
    buildIndex();
    renderL0();
    wire();
    readHash();
    render();
  }
  window.fcInit = fcInit;

  /* ══════════════════════ L0 — ΠΙΝΑΚΑΣ ΣΤΑΔΙΟΥ ══════════════════════ */
  function renderL0() {
    const t = fc.totals;
    const gate = fc.nodes.filter((n) => n.kind === "ground_exam").length;
    const inline = fc.nodes.reduce((s, n) => s + (n.exams || []).length, 0);
    const fsN = fc.nodes.filter((n) => bandOf(n) === "fs").length;
    const airN = fc.nodes.filter((n) => bandOf(n) === "air").length;
    const ckr = fc.nodes.filter((n) => n.checkride);
    const fins = ckr.filter(isFinal);
    const sumPer = fc.nodes.reduce((s, n) => s + (n.periods || 0), 0);

    const vitals = [
      { k: "ground", h: "GROUND", n: String(t.ground_training_periods),
        s: "periods · " + t.ground_training_periods_foreign_sps + " foreign SPs · min. 25 working days",
        i: sumPer !== t.ground_training_periods
          ? "syllabus: " + t.ground_training_periods + " periods · sum of nodes here: " + sumPer
          : null },
      { k: "exams", h: "EXAMS", n: String(gate + inline),
        s: gate + " gates + " + inline + " in-block · ≥80%", i: null },
      { k: "fs", h: "F/S", n: t.fs.total, s: fsN + " Training Sections", i: null },
      { k: "air", h: "T-6A", n: t.flight.total.total,
        s: airN + " Training Sections · " + t.flight.total.dual + " D + " + t.flight.total.solo + " S", i: null },
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
        title="${esc(up(x.label) + " · " + fmt(h) + " h · " + Math.round(pct) + "% of T-6A")}"
        aria-label="${esc(x.label + " " + fmt(h) + " hours")}"></button>`;
    }).join("");
    el("fc-load").innerHTML = segs;
    const cap = el("fc-load-cap") || (() => {
      const p = document.createElement("p");
      p.className = "fc-load-cap"; p.id = "fc-load-cap";
      el("fc-load").insertAdjacentElement("afterend", p);
      return p;
    })();
    cap.textContent = "LOAD — share of T-6A hours";

    el("fc-tracks").innerHTML = TRACKS.map(trackCard).join("");
    el("fc-spine").innerHTML = spine();
  }

  function trackCard(tk) {
    const A = agg(tk.id);
    const counts = { ground: A.ground.length, exam: A.exam.length, fs: A.fs.length, air: A.air.length };
    const skel = BANDS.map((b) => counts[b.id]
      ? `<span class="fc-skel-seg" style="flex:${counts[b.id]};background:${b.c || tk.hex}"></span>` : "").join("");

    let m1, m2 = "";
    if (tk.id === "core") {
      m1 = (A.periodsGround + A.periodsExam) + " periods";
      const gates = A.exam.map((n) => n.label).join(", ");
      const ins = A.inline.map((x) => x.ex.code).join(", ");
      m2 = "EXAMS " + A.examCount + " (" + gates + " gate" + (ins ? " + " + ins + " in-block" : "") + ")";
    } else {
      m1 = "GROUND " + A.periodsGround + " per. · EXAMS " + A.examCount
         + " (" + plural(A.exam.length, "gate", "gates")
         + (A.inline.length ? " + " + A.inline.length + " in-block" : "") + ")";
      const fam = tk.id === "contact" ? " (+FAM " + fc.totals.fs.familiarization + ")" : "";
      const solo = A.printedFl.solo === "- / -" ? "solo —" : A.printedFl.solo + " S";
      m2 = "F/S " + A.printedFs + fam + " · T-6A " + A.printedFl.total + " h"
         + (A.mmAir ? " " + G.info : "") + " — " + A.printedFl.dual + " D · " + solo;
    }

    const chips = [];
    if (tk.id === "core") {
      chips.push(`<span class="fc-b">▤ ${A.ground.length} blocks</span>`);
      if (A.exam.length) chips.push(`<span class="fc-b fc-b-warn">▣ ${esc(A.exam.map((n) => n.label).join(" · "))}</span>`);
    } else {
      if (A.ckr.length) {
        chips.push(`<span class="fc-b fc-b-ckr">${G.ckr} ${A.ckr.length} CKR${A.ckr.length === A.finals.length ? " FINAL" : ""}</span>`);
      }
      if (A.firstSolo.length) chips.push(`<span class="fc-b fc-b-solo-req">${G.solo} 1st SOLO</span>`);
      if (A.soloSections.length) chips.push(`<span class="fc-b fc-b-solo">SOLO in ${A.soloSections.length} sections</span>`);
      if (A.nights.length) chips.push(`<span class="fc-b fc-b-night">${G.night} NIGHT ×${A.nights.length}</span>`);
    }

    const micro = A.air.length ? `<span class="fc-micro" aria-hidden="true">${microRail(A.air)}</span>` : "";
    const feedTxt = Object.keys(A.feeds).map((k) => TRACK_BY[k].label + " ×" + A.feeds[k]).join(" · ");
    const feed = feedTxt ? `<span class="fc-tc-feed">FEEDS → ${esc(feedTxt)}</span>` : "";

    return `<button type="button" class="fc-tc${tk.id === "core" ? " is-core" : ""}" data-track="${esc(tk.id)}"
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
  function microRail(air) {
    return air.map((n, ix) => {
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
      h += `<button type="button" class="fc-gate-pill" data-n="${esc(n.id)}" style="--tk:${tk.hex}"
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
    if (!TRACK_BY[id]) return;
    S.track = id;
    if (S.lv < 1) S.lv = 1;
    if (!keepSel && S.selected && trackOf(IX.byId.get(S.selected)) !== id) { S.selected = null; S.lv = 1; }
    renderTrackbar();
    renderFilters();
    renderBands();
    if (S.selected) applySelection(); else closeSheet();
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
        + " · F/S " + A.printedFs + " · T-6A " + A.printedFl.total + " h"
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
        aria-pressed="${on}">${esc(b.label)}</button>`;
    }
    h += `<span class="fc-fgroup-h">SPOTLIGHT</span>`;
    const spots = [["solo", G.solo + " SOLO"], ["ckr", G.ckr + " Checkrides"], ["night", G.night + " Night"]];
    for (const [k, lab] of spots) {
      h += `<button type="button" class="fc-fbtn" data-spot="${k}" aria-pressed="${S.spot.has(k)}">${esc(lab)}</button>`;
    }
    el("fc-filters").innerHTML = h;
  }

  const spotHit = (n) => {
    if (S.spot.has("solo") && (n.solo_allowed || n.solo_required)) return true;
    if (S.spot.has("ckr") && n.checkride) return true;
    if (S.spot.has("night") && n.night) return true;
    return false;
  };

  /* Η ΣΕΙΡΑ ΤΟΥ fc.nodes ΕΙΝΑΙ Η ΣΕΙΡΑ ΤΩΝ TRAINING SECTIONS ΤΟΥ SYLLABUS —
     ΚΑΜΙΑ ταξινόμηση. (Το I4701 φαίνεται 7ο στο instrument/air ενώ το flag του
     I4601-03 λέει ότι στο flow chart πετιέται ανάμεσα σε I4602 και I4603· αυτό
     το εξηγεί το flag στο side sheet — δεν «διορθώνεται» εδώ.)                  */
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
      for (const n of vis[b.id]) S.rendered.add(n.id);
    }
    const coreChips = (t !== "core" && !S.hiddenBands.has("ground")) ? nodesOf("core") : [];
    for (const n of coreChips) S.rendered.add(n.id);

    // 2) HTML
    let h = "";
    for (const b of BANDS) {
      if (S.hiddenBands.has(b.id)) continue;
      const body = bandBody(t, b, A, vis, coreChips);
      if (!body.count) continue;
      h += `<section class="fc-band" data-band="${esc(b.id)}" style="--bc:${b.c || tk.hex}"
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
    if (b.id === "ground") return A.periodsGround + " periods";
    if (b.id === "exam")   return A.examCount + " exams · ≥80%";
    if (b.id === "fs")     return A.printedFs ? "F/S " + A.printedFs + (A.mmFs ? " " + G.info : "") : "—";
    if (b.id === "air")    return A.printedFl ? "T-6A " + A.printedFl.total + " h" + (A.mmAir ? " " + G.info : "") : "—";
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
      const main = t === "core" ? list.filter((n) => !isContinuous(n)) : list;
      count += main.length;
      if (main.length) html += `<div class="fc-row">${chainRow(main, "is-ground")}</div>`;
      if (t === "core") {
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

    } else if (b.id === "exam") {
      count += list.length;
      if (list.length) html += `<div class="fc-row">${chainRow(list, "is-gate")}</div>`;
      if (A.inline.length) {
        count += A.inline.length;
        html += `<div class="fc-sub"><div class="fc-sub-h">IN-BLOCK <em>— they live inside the ground card</em></div>
          <div class="fc-row">${A.inline.map(exChip).join("")}</div></div>`;
      }

    } else if (b.id === "fs") {
      count += list.length;
      if (list.length) html += `<div class="fc-row">${chainRow(list, "")}</div>`;

    } else if (b.id === "air") {
      count += list.length;
      if (list.length) html += `<div class="fc-row">${chainRow(list, (n) => (n.checkride ? "is-ckr" : ""))}</div>`;
    }
    return { html: html, count: count, phase: phase };
  }

  function feedsTrack(coreNode, track) {
    return (IX.out.get(coreNode.id) || []).some((e) => trackOf(IX.byId.get(e.to)) === track)
        || (IX.in.get(coreNode.id) || []).some((e) => trackOf(IX.byId.get(e.from)) === track);
  }

  function chainRow(list, cls) {
    return list.map((n, ix) => {
      const next = list[ix + 1];
      let link = "end";
      if (next) {
        const e = (IX.out.get(n.id) || []).find((x) => x.to === next.id);
        if (e) { link = e.kind === "implied" ? "implied" : "seq"; S.chev.add(e.from + ">" + e.to); }
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

  function card(n, cls, link, noId) {
    const full = n.label + (n.name ? " — " + n.name : "");
    const fam = n.kind === "sim" && /familiariz/i.test(n.name || "");
    return `<button type="button" class="fc-card ${cls}${spotHit(n) ? " is-spot" : ""}"
      ${noId ? "" : `id="fcn-${esc(n.id)}"`} data-n="${esc(n.id)}" data-link="${esc(link)}"
      aria-pressed="false" aria-label="${esc(full)}"
      title="${esc(full + " · " + (LINK_TITLE[link] || ""))}">
      <span class="fc-c-top"><span class="fc-c-code">${esc(shortLabel(n))}</span>${statusChips(n, fam)}</span>
      <span class="fc-c-name">${esc(n.name || "")}</span>
      <span class="fc-c-m">${metrics(n)}</span>
      ${feedChips(n)}
    </button>`;
  }

  /* §3.4 μακριά labels: «FF 101-108 · FF 190 · …» (109 χαρ. στο GT-FLYPRIN)
     → «FF 101-108 +6». Το πλήρες κείμενο μένει σε title= και στο side sheet. */
  function shortLabel(n) {
    const parts = String(n.label || "").split(" · ");
    return parts.length > 1 ? parts[0] + " +" + (parts.length - 1) : n.label;
  }

  function statusChips(n, fam) {
    const c = [];
    if (n.checkride) {
      c.push(isFinal(n)
        ? `<span class="fc-b fc-b-final">${G.fin} FINAL</span>`
        : `<span class="fc-b fc-b-ckr">${G.ckr} CKR</span>`);
    }
    if (n.solo_required) c.push(`<span class="fc-b fc-b-solo-req">${G.solo} 1st SOLO</span>`);
    else if (n.solo_allowed) c.push(`<span class="fc-b fc-b-solo">${G.solo} SOLO ${n.sorties_solo}/${n.sorties_total}</span>`);
    if (n.night) c.push(`<span class="fc-b fc-b-night">${G.night} NIGHT</span>`);
    if ((n.exams || []).length) c.push(`<span class="fc-b">+${n.exams.length} IN-BLOCK EXAMS</span>`);
    if (fam) c.push(`<span class="fc-b">FAM</span>`);
    if ((n.flags || []).length) c.push(`<span class="fc-b fc-b-warn" title="data note">${G.warn}</span>`);
    return c.join("");
  }

  function metrics(n) {
    if (n.kind === "theory" || n.kind === "ground_exam") {
      let s = (n.periods != null ? n.periods + " per." : "—");
      if (n.periods_foreign != null) s += " · " + n.periods_foreign + " foreign";
      return esc(s);
    }
    const h = n.hours_total != null ? fmt(n.hours_total) + " h" : "— h " + G.warn;
    const split = n.sorties_solo
      ? `<span class="fc-c-split"> · ${n.sorties_dual}D+${n.sorties_solo}S</span>`
      : (n.sorties_dual != null ? `<span class="fc-c-split"> · ${n.sorties_dual}D</span>` : "");
    return esc((n.sorties_total != null ? n.sorties_total + " srt · " : "") + h) + split;
  }

  /* §3.5 ΤΣΙΠΑΚΙΑ ΑΝΑΦΟΡΑΣ — ακμή με το άλλο άκρο εκτός DOM ΔΕΝ γίνεται ποτέ
     γραμμή. Είναι το ιδίωμα της ίδιας της πηγής: «[C 5201] is repeated as a
     dashed reference box at the head of the FORMATION flow».                  */
  function feedChips(n) {
    const bits = [];
    for (const e of (IX.in.get(n.id) || [])) if (!S.rendered.has(e.from)) bits.push(refChip(e.from, "in", e));
    for (const e of (IX.out.get(n.id) || [])) if (!S.rendered.has(e.to)) bits.push(refChip(e.to, "out", e));
    return bits.length ? `<span class="fc-c-feeds">${bits.join("")}</span>` : "";
  }
  function refChip(otherId, dir, e) {
    const o = IX.byId.get(otherId);
    if (!o) return "";
    const tk = TRACK_BY[trackOf(o)];
    const txt = dir === "in" ? G.in + "[" + shortLabel(o) + "]" : "[" + shortLabel(o) + "]" + G.out;
    return `<span class="fc-feed" role="button" tabindex="-1" data-jump="${esc(otherId)}"
      style="--fk:${tk.hex}" title="${esc((e.note || e.kind) + " · " + tk.label)}">${esc(txt)}</span>`;
  }

  function exChip(x) {
    const e = x.ex;
    const gates = (e.gates || []).length ? " ▸ gates " + e.gates.join(", ") : "";
    return `<button type="button" class="fc-exchip" data-n="${esc(x.node)}" data-exam="${esc(e.code)}"
      title="${esc(e.name || "")}" aria-label="${esc(e.code + " — " + (e.name || ""))}">
      <b>${esc(e.code)}</b> ▸ ${esc(e.periods + " per.")}${e.periods_foreign != null ? esc(" (" + e.periods_foreign + " foreign)") : ""}${esc(gates)}
      <span aria-hidden="true">↑</span></button>`;
  }

  /* ══════════════════════ L2 — ΣΤΑΘΜΟΣ ══════════════════════ */
  function select(id) {
    const n = IX.byId.get(id);
    if (!n) return;
    const t = trackOf(n);
    if (S.poster) { S.poster = false; el("fc-poster").setAttribute("aria-pressed", "false"); }
    if (S.track !== t || !S.rendered.has(id)) { S.selected = id; openTrack(t, true); return; }
    S.selected = id;
    S.lv = 2;
    applySelection();
    render();
  }

  /* Μοναδική πηγή αλήθειας για το επίπεδο: όποιος δρόμος κι αν οδήγησε εδώ
     (κάρτα, πύλη ράχης, αναζήτηση, deep link) η ύπαρξη επιλογής ΕΙΝΑΙ το L2.
     Χωρίς αυτό το drawNow() θα έκοβε τις ακμές στα jumps (γκέτο S.lv >= 2). */
  function applySelection() {
    const id = S.selected;
    S.lv = 2;
    const conn = new Set([id]);
    for (const e of (IX.out.get(id) || [])) conn.add(e.to);
    for (const e of (IX.in.get(id) || [])) conn.add(e.from);
    const cards = el("fc-bands").querySelectorAll(".fc-card");
    for (const c of cards) {
      const nid = c.dataset.n;
      const sel = nid === id;
      c.classList.toggle("fc-sel", sel);
      c.classList.toggle("fc-dim", !conn.has(nid));
      c.setAttribute("aria-pressed", sel ? "true" : "false");
    }
    renderDetail(id);
    drawNow();
  }

  function clearSelection() {
    S.selected = null;
    if (S.lv > 1) S.lv = 1;
    const cards = el("fc-bands").querySelectorAll(".fc-card");
    for (const c of cards) { c.classList.remove("fc-sel", "fc-dim"); c.setAttribute("aria-pressed", "false"); }
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
     ΑΠΑΓΟΡΕΥΕΤΑΙ transform σε οποιονδήποτε πρόγονο του scroller (θα χαλούσε
     τα getBoundingClientRect μαθηματικά) — γι' αυτό η επιλογή είναι
     outline+box-shadow και ΠΟΤΕ scale.
     Σχεδιάζονται ΜΟΝΟ ακμές με ΚΑΙ ΤΑ ΔΥΟ άκρα στο DOM που ΔΕΝ τις λέει ήδη
     ένα chevron → πρακτικά ≤5 κοντές γραμμές.                                */
  let rafId = 0;
  function drawNow() {
    if (S.selected && S.lv >= 2 && !S.poster) drawEdges(S.selected); else clearSvg();
  }
  /* rAF throttle για scroll / resize / φίλτρα. Οι αλλαγές κατάστασης (επιλογή,
     άνοιγμα-κλείσιμο sheet) σχεδιάζουν ΑΜΕΣΑ: το rAF δεν χτυπά σε κρυφό tab. */
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

  function drawEdges(id) {
    const svg = el("fc-svg"), sc = el("fc-rail-scroll");
    if (!svg || !sc) return;
    clearSvg();
    svg.setAttribute("width", sc.clientWidth);
    svg.setAttribute("height", sc.scrollHeight);
    const tk = TRACK_BY[S.track];
    const IN_C = "#ffb454", OUT_C = tk.hex;

    const defs = mk("defs", {});
    for (const [mid, col] of [["fc-arr-in", IN_C], ["fc-arr-out", OUT_C]]) {
      const m = mk("marker", { id: mid, markerWidth: 6, markerHeight: 6, refX: 5, refY: 3, orient: "auto", markerUnits: "strokeWidth" });
      m.appendChild(mk("path", { d: "M0,0 L6,3 L0,6 z", fill: col }));
      defs.appendChild(m);
    }
    svg.appendChild(defs);

    const sr = sc.getBoundingClientRect();
    const box = (nid) => {
      const c = el("fcn-" + nid);
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
    const edges = [].concat(IX.in.get(id) || [], IX.out.get(id) || []);
    for (const e of edges) {
      if (S.chev.has(e.from + ">" + e.to)) continue;             // το λέει ήδη το chevron
      if (!S.rendered.has(e.from) || !S.rendered.has(e.to)) continue;  // → τσιπάκι αναφοράς
      const a = box(e.from), b = box(e.to);
      if (!a || !b) continue;
      const outgoing = e.from === id;
      let d;
      if (b.t >= a.b - 6) {                       // b κάτω από το a
        const y1 = a.b, y2 = b.t, dd = Math.max(28, (y2 - y1) / 2);
        d = `M ${a.cx} ${y1} C ${a.cx} ${y1 + dd}, ${b.cx} ${y2 - dd}, ${b.cx} ${y2}`;
      } else if (a.t >= b.b - 6) {                // b πάνω από το a (I4501-02 → GT-CO109)
        const y1 = a.t, y2 = b.b, dd = Math.max(28, (y1 - y2) / 2), off = 24;
        d = `M ${a.cx} ${y1} C ${a.cx - off} ${y1 - dd}, ${b.cx - off} ${y2 + dd}, ${b.cx} ${y2}`;
      } else if (b.l >= a.r - 6) {                // δίπλα-δεξιά (GT-FLYPRIN → GT-AERO-CRM)
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
      if (EDGE_STYLE[e.kind]) p.setAttribute("stroke-dasharray", EDGE_STYLE[e.kind]);
      const ttl = mk("title", {});
      ttl.textContent = (IX.byId.get(e.from).label) + " → " + (IX.byId.get(e.to).label)
        + " · " + e.kind + (e.note ? " · " + e.note : "");
      p.appendChild(ttl);
      g.appendChild(p);
    }
    svg.appendChild(g);
  }

  /* ── SIDE SHEET (§4.3, 11 τμήματα) ── */
  function renderDetail(id) {
    const n = IX.byId.get(id), box = el("fc-detail"), tk = TRACK_BY[trackOf(n)];
    const out = IX.out.get(id) || [], inn = IX.in.get(id) || [];
    box.style.setProperty("--tk", tk.hex);
    box.style.setProperty("--tk-rgb", tk.rgb);

    // 3 · VITALS GRID
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

    // 5 · ΕΞΕΤΑΣΕΙΣ (εντός block)
    let examTbl = "";
    if ((n.exams || []).length) {
      examTbl = `<h4 class="fc-h4" id="fc-d-exams">${G.exam} IN-BLOCK EXAMS</h4><div class="fc-scroll-x">
        <table class="fc-tbl"><thead><tr><th>Code</th><th>Name</th><th>Per.</th><th>Foreign</th><th>Gates</th></tr></thead><tbody>
        ${n.exams.map((x) => `<tr><td class="num">${esc(x.code)}</td><td>${esc(x.name || "")}</td>
          <td class="num">${esc(String(x.periods ?? "—"))}</td>
          <td class="num">${esc(x.periods_foreign == null ? "—" : String(x.periods_foreign))}</td>
          <td>${esc((x.gates || []).join(", "))}</td></tr>`).join("")}
        </tbody></table></div>`;
    }

    // 6 · CONDITIONAL (foreign SPs)
    let cond = "";
    if (n.conditional) {
      const extra = Object.keys(n.conditional).filter((k) => k !== "reason")
        .map((k) => `<span class="badge kv">${esc(k)}: ${esc(String(n.conditional[k]))}</span>`).join("");
      cond = `<h4 class="fc-h4">FOREIGN SPs</h4><p class="hint">${esc(n.conditional.reason || "")}</p>
        ${extra ? `<div class="kv-row">${extra}</div>` : ""}`;
    }

    // 7 · ΠΡΙΝ / ΜΕΤΑ
    const li = (e, dir) => {
      const nid = dir === "out" ? e.to : e.from;
      const o = IX.byId.get(nid);
      const ot = TRACK_BY[trackOf(o)];
      return `<li><span class="fc-dot" style="background:${ot.hex}" aria-hidden="true"></span>
        <button type="button" class="req-link fc-jump" data-jump="${esc(nid)}">${esc(o.label)}</button>
        <span class="hint">${esc(e.kind)}${e.note ? " · " + esc(e.note) : ""}</span></li>`;
    };

    // 8 · STEPPER μέσα στην αλυσίδα του κελιού
    const chain = fc.nodes.filter((x) => cellOf(x.id) === cellOf(id));
    const ci = chain.findIndex((x) => x.id === id);
    const prev = ci > 0 ? chain[ci - 1] : null, next = ci >= 0 && ci < chain.length - 1 ? chain[ci + 1] : null;

    // 10 · duration verbatim / editorial summary
    let dur = "";
    if (n.duration_verbatim) dur = `<p class="req-src">“${esc(n.duration_verbatim)}”</p>`;
    else if (n.duration_summary) {
      dur = `<p class="fc-cap">${G.warn} editorial summary — NOT verbatim (legend.notes)</p>
             <p class="verbatim">${esc(n.duration_summary)}</p>`;
    }

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
      ${sortieBlock(n)}
      ${examTbl}
      ${cond}
      ${inn.length ? `<h4 class="fc-h4">← BEFORE</h4><ul class="fc-ul">${inn.map((e) => li(e, "in")).join("")}</ul>` : ""}
      ${out.length ? `<h4 class="fc-h4">AFTER →</h4><ul class="fc-ul">${out.map((e) => li(e, "out")).join("")}</ul>` : ""}
      <div class="fc-step">
        <button type="button" class="req-link" data-jump="${prev ? esc(prev.id) : ""}" ${prev ? "" : "disabled"}>◀ PREV</button>
        <button type="button" class="req-link" data-jump="${next ? esc(next.id) : ""}" ${next ? "" : "disabled"}>NEXT ▶</button>
      </div>
      ${(n.flags || []).length ? `<details><summary>${G.warn} DATA NOTES (${n.flags.length})</summary>
        ${n.flags.map((f) => `<p class="verbatim">${esc(f)}</p>`).join("")}</details>` : ""}
      ${dur}
      ${n.source ? `<p class="req-src">📄 ${esc(n.source.file || "")}${n.source.page_pdf ? " · p." + esc(String(n.source.page_pdf)) : ""}${n.source.ref ? " · " + esc(n.source.ref) : ""}</p>` : ""}`;

    box.classList.remove("hidden");
    el("fc-l1").classList.add("has-sheet");
  }

  /* ── L3 — ΕΞΟΔΟΙ ────────────────────────────────────────────────────────
     ΚΡΙΣΙΜΟ: sorties_solo ≠ solo_candidate_sorties.length. Οι υποψήφιες είναι
     15 σε όλο το στάδιο, οι πραγματικές SOLO 8. Ισοπέδωση θα έδειχνε ~15 solo
     και θα παραβίαζε το §9.c (ελάχ. 6,0 SOLO h) → ΔΥΟ διακριτά glyphs.        */
  function sortieBlock(n) {
    const list = n.sorties || [];
    if (!list.length) return "";
    const cand = n.solo_candidate_sorties || [];
    const chips = list.map((code) => {
      let cls = "fc-sortie", gl = "";
      if (cand.indexOf(code) >= 0 && n.solo_required) { cls += " is-1st"; gl = G.solo + " "; }
      else if (cand.indexOf(code) >= 0) { cls += " is-cand"; gl = G.solo + " "; }
      else if (n.checkride) { cls += " is-ckr"; gl = G.ckr + " "; }
      else if (n.night) { cls += " is-night"; gl = G.night + " "; }
      return `<button type="button" class="${cls}" data-copy="${esc(code)}"
        title="copy code">${esc(gl + code)}</button>`;
    }).join("");
    let cap = "";
    if (cand.length && n.sorties_solo !== cand.length) {
      cap = `<p class="fc-cap">SOLO ${n.sorties_solo} of ${cand.length} candidate sorties (green outline in the flow chart)</p>`;
    }
    return `<h4 class="fc-h4">SORTIES (${list.length})</h4><div class="fc-sorties">${chips}</div>${cap}`;
  }

  /* ══════════════════════ DRAWER (§2.1) ══════════════════════ */
  function openDrawer(key) {
    const t = fc.totals;
    let title = "", body = "";
    const vb = (s) => `<p class="verbatim">${esc(s)}</p>`;
    const src = (o) => o ? `<p class="req-src">📄 ${esc(o.file)} · p.${esc(String(o.page_pdf))} · ${esc(o.ref)}</p>` : "";

    if (key.indexOf("phase:") === 0) {
      const p = (fc.phases || []).find((x) => x.id === key.slice(6));
      if (!p) return;
      title = p.label;
      body = src(p.source);

    } else if (key === "ground") {
      title = "GROUND — " + t.ground_training_periods + " periods";
      body = vb(t.ground_training_verbatim) + vb(t.ground_training_min_duration_verbatim)
        + flagLike(/282/).map(vb).join("") + flagLike(/41 ground boxes/).map(vb).join("");

    } else if (key === "exams") {
      const p2 = (fc.phases || []).find((x) => x.id === "p2");
      title = "EXAMS — 14 (8 gates + 6 in-block)";
      const rows = [];
      IX.exam.forEach((v, code) => {
        rows.push(`<tr><td class="num">${esc(code)}</td><td>${esc(v.ex.name || "")}</td>
          <td class="num">${esc(String(v.ex.periods ?? "—"))}</td>
          <td class="num">${esc(v.ex.periods_foreign == null ? "—" : String(v.ex.periods_foreign))}</td>
          <td>${esc(v.gate ? "gate (node)" : "inside " + IX.byId.get(v.node).label)}</td>
          <td>${esc((v.ex.gates || []).join(", "))}</td></tr>`);
      });
      body = src(p2 && p2.source) + flagLike(/FULL EXAM SET/).map(vb).join("")
        + `<div class="fc-scroll-x"><table class="fc-tbl"><thead><tr><th>Code</th><th>Name</th><th>Per.</th><th>Foreign</th><th>Position</th><th>Gates</th></tr></thead><tbody>${rows.join("")}</tbody></table></div>`;

    } else if (key === "fs") {
      title = "F/S — " + t.fs.total;
      const rows = TRACKS.filter((x) => x.tot).map((x) =>
        `<tr><td>${esc(x.label)}</td><td class="num">${esc(t.fs[x.tot])}</td><td class="num">${agg(x.id).fs.length}</td></tr>`).join("");
      body = `<div class="fc-scroll-x"><table class="fc-tbl"><thead><tr><th>Track</th><th>Sorties / hours</th><th>Sections</th></tr></thead><tbody>${rows}
        <tr><td>Familiarization</td><td class="num">${esc(t.fs.familiarization)}</td><td class="num">—</td></tr>
        <tr><td><b>TOTAL</b></td><td class="num"><b>${esc(t.fs.total)}</b></td><td class="num">${fc.nodes.filter((n) => bandOf(n) === "fs").length}</td></tr>
        </tbody></table></div>` + src(t.fs.source);

    } else if (key === "air") {
      title = "T-6A — " + t.flight.total.total;
      const rows = TRACKS.filter((x) => x.tot).map((x) =>
        `<tr><td>${esc(x.label)}</td><td class="num">${esc(t.flight[x.tot].dual)}</td>
         <td class="num">${esc(t.flight[x.tot].solo)}</td><td class="num">${esc(t.flight[x.tot].total)}</td></tr>`).join("");
      body = `<div class="fc-scroll-x"><table class="fc-tbl"><thead><tr><th>Track</th><th>DUAL</th><th>SOLO</th><th>TOTAL</th></tr></thead><tbody>${rows}
        <tr><td><b>TOTAL</b></td><td class="num"><b>${esc(t.flight.total.dual)}</b></td>
        <td class="num"><b>${esc(t.flight.total.solo)}</b></td><td class="num"><b>${esc(t.flight.total.total)}</b></td></tr>
        </tbody></table></div>` + src(t.flight.source) + flagLike(/I4101-02/).map(vb).join("");

    } else if (key === "solo") {
      title = "SOLO — " + t.flight.total.solo;
      const rows = fc.nodes.filter((n) => n.solo_allowed || n.solo_required).map((n) =>
        `<tr><td class="num">${esc(n.label)}</td><td>${esc(n.name || "")}</td>
         <td class="num">${esc(String(n.sorties_solo ?? "—"))}</td>
         <td class="num">${esc(String((n.solo_candidate_sorties || []).length))}</td>
         <td>${esc((n.solo_candidate_sorties || []).join(", "))}</td></tr>`).join("");
      body = vb(t.minimum_hours_verbatim) + src(t.minimum_hours_source)
        + `<div class="fc-scroll-x"><table class="fc-tbl"><thead><tr><th>Section</th><th>Mission</th><th>SOLO</th><th>Candidates</th><th>Codes</th></tr></thead><tbody>${rows}</tbody></table></div>`;

    } else if (key === "ckr") {
      title = "CHECKRIDES — " + fc.nodes.filter((n) => n.checkride).length;
      const rows = fc.nodes.filter((n) => n.checkride).map((n) =>
        `<tr><td class="num">${esc(n.label)}</td><td>${esc(TRACK_BY[trackOf(n)].label)}</td>
         <td>${esc(n.name || "")}</td><td>${isFinal(n) ? G.fin + " FINAL" : ""}</td></tr>`).join("");
      body = vb(t.final_evaluations_verbatim) + vb(t.flight_training_min_duration_verbatim)
        + `<p class="fc-cap">The 4 FINALs are derived STRUCTURALLY (a checkride with no outgoing sequence inside its own cell) — the source verbatim spells «Ν4690» with a Greek capital Nu.</p>`
        + `<div class="fc-scroll-x"><table class="fc-tbl"><thead><tr><th>Code</th><th>Track</th><th>Mission</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
    } else return;

    const d = el("fc-drawer");
    d.innerHTML = `<div class="fc-drawer-box">
      <div class="fc-drawer-head"><h3>${esc(title)}</h3>
        <button type="button" class="copy-btn" data-close="1">✕ Close</button></div>
      <div class="fc-drawer-body">${body}</div></div>`;
    d.classList.remove("hidden");
  }

  /* ══════════════════════ LEGEND (§7.2 / §7.3) ══════════════════════ */
  function renderLegendPop() {
    const row = (sw, txt) => `<div class="fc-leg">${sw}<span>${esc(txt)}</span></div>`;
    const dot = (c) => `<i style="background:${c}"></i>`;
    const gl = (g) => `<b aria-hidden="true">${g}</b>`;
    let h = `<h4 class="fc-h4">SHAPE = MEANING</h4>`;
    h += row(gl(G.sec), "training section")
       + row(gl(G.exam), "ground exam (gate)")
       + row(gl(G.ckr), "checkride")
       + row(gl(G.fin), "FINAL evaluation (last one of the category)")
       + row(gl(G.solo), "SOLO — filled = 1st SOLO, outline = candidate sortie")
       + row(gl(G.night), "night")
       + row(gl(G.in + G.out), "reference chip to another track (dashed reference box)")
       + row(gl(G.warn), "data note")
       + row(gl(G.info), "printed ≠ sum of sections");
    h += `<h4 class="fc-h4">TRACKS (left ribbon + code color)</h4>`;
    for (const t of TRACKS) h += row(dot(t.hex), t.label);
    h += `<h4 class="fc-h4">BANDS (header only, never on the card)</h4>`;
    for (const b of BANDS) h += row(dot(b.c || "var(--tk)"), b.label + " — " + b.sub);
    h += `<h4 class="fc-h4">STATUS</h4>`
       + row(dot("#5fe0a8"), "candidate SOLO — green outline")
       + row(dot("#ffd166"), "1st SOLO / evaluation")
       + row(dot("#ff7a70"), "night");
    h += `<h4 class="fc-h4">EDGES</h4>`
       + row(gl("──"), "sequence — arrow in the flow chart")
       + row(gl("- -"), "prereq — arrow crossing a column")
       + row(gl("··"), "implied — order with no drawn arrow");
    h += `<h4 class="fc-h4">SOURCE OF THE COLORS</h4><p class="verbatim">${esc(fc.legend.symbols_verbatim)}</p>`;
    const s = fc.legend.symbols_source;
    h += `<p class="req-src">📄 ${esc(s.file)} · p.${esc(String(s.page_pdf))} · ${esc(s.ref)}</p>`;
    h += `<div class="fc-step"><button type="button" class="req-link" data-close="1">Close</button></div>`;
    el("fc-legend-pop").innerHTML = h;
  }

  /* ══════════════════════ POSTER (§9) ══════════════════════ */
  function renderPoster() {
    const phases = (fc.phases || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
    el("fc-poster-view").innerHTML = phases.map((p) => {
      const list = fc.nodes.filter((n) => n.phase === p.id);
      return `<div class="fc-pcol">
        <div class="fc-pcol-h">${esc(p.label)} <span class="fc-band-n">${list.length}</span></div>
        ${list.map((n) => {
          const tk = TRACK_BY[trackOf(n)];
          return card(n, "is-poster" + (n.checkride ? " is-ckr" : ""), "end", true)
            .replace('class="fc-card', `style="--tk:${tk.hex};--tk-rgb:${tk.rgb}" class="fc-card`);
        }).join("")}
      </div>`;
    }).join("");
  }

  /* ══════════════════════ ΑΝΑΖΗΤΗΣΗ (§6.2) ══════════════════════ */
  let qTimer = 0;
  function search(q) {
    const box = el("fc-sug");
    const s = String(q || "").trim().toLowerCase();
    if (!s) { box.classList.add("hidden"); S.sug = []; S.sugIx = -1; return; }
    const seen = new Set(), hits = [];
    for (const e of IX.search) {
      if (e.hay.indexOf(s) < 0) continue;
      const k = e.id + "|" + e.code;
      if (seen.has(k)) continue;
      seen.add(k);
      hits.push(e);
      if (hits.length >= 8) break;
    }
    S.sug = hits; S.sugIx = hits.length ? 0 : -1;
    box.innerHTML = hits.length
      ? hits.map((e, i) => {
          const tk = TRACK_BY[trackOf(IX.byId.get(e.id))];
          return `<button type="button" class="fc-sug-item${i === 0 ? " is-on" : ""}" data-jump="${esc(e.id)}" data-ix="${i}">
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
    const id = S.sug[S.sugIx].id;
    el("fc-sug").classList.add("hidden");
    el("fc-q").blur();
    jump(id);
  }

  /* ══════════════════════ ΠΛΟΗΓΗΣΗ ══════════════════════ */
  function jump(id) {
    const n = IX.byId.get(id);
    if (!n) return;
    const t = trackOf(n);
    if (S.poster) { S.poster = false; el("fc-poster").setAttribute("aria-pressed", "false"); }
    if (S.track !== t || !S.rendered.has(id)) {
      // απόκρυψη ζώνης που περιέχει τον στόχο → ξανα-άνοιγμά της
      const b = bandOf(n);
      if (S.hiddenBands.has(b)) S.hiddenBands.delete(b);
      S.selected = id;
      openTrack(t, true);
    } else {
      select(id);
    }
    const c = el("fcn-" + id);
    if (c) c.scrollIntoView({ behavior: "smooth", block: "center" });
    scheduleEdges();
  }

  function goL0() {
    S.lv = 0; S.selected = null; S.track = null;
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
      if (S.selected) {
        bits.push(`<span class="fc-crumb-sep" aria-hidden="true">▸</span>
          <span class="fc-crumb is-here">${esc(IX.byId.get(S.selected).label)}</span>`);
      }
    }
    el("fc-crumbs").innerHTML = bits.join("");
  }

  /* ══════════════════════ HASH (§6.6) ══════════════════════ */
  function syncHash() {
    let h = "#fc";
    if (S.poster) h += "/poster";
    else { if (S.track) h += "/" + S.track; if (S.selected) h += "/" + S.selected; }
    if (location.hash === h) return;
    S.hashLock = true;
    try { history.replaceState(null, "", h); }
    catch (e) { try { location.hash = h; } catch (e2) { /* file:// — αγνοείται */ } }
    setTimeout(() => { S.hashLock = false; }, 0);
  }
  function readHash() {
    const m = /^#fc(?:\/([^/]+))?(?:\/([^/]+))?/.exec(location.hash || "");
    if (!m) return;
    if (m[1] === "poster") { setPoster(true); return; }
    if (m[1] && TRACK_BY[m[1]]) {
      if (m[2] && IX.byId.get(m[2])) { S.selected = m[2]; openTrack(m[1], true); }
      else openTrack(m[1]);
    }
  }

  /* ══════════════════════ ΔΙΑΚΟΠΤΕΣ ══════════════════════ */
  function setDensity(d) {
    S.density = d;
    const b = el("fc-density");
    b.textContent = d === "compact" ? "COMPACT" : "RICH";
    b.setAttribute("aria-pressed", d === "compact" ? "true" : "false");
    if (S.track) renderBands();
    if (S.selected) applySelection();
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

      const feed = t.closest(".fc-feed, .fc-jump, .fc-sug-item, [data-jump]");
      if (feed && feed.dataset.jump) { ev.stopPropagation(); jump(feed.dataset.jump); return; }

      const cp = t.closest("[data-copy]");
      if (cp) { copyCode(cp, cp.dataset.copy); return; }

      const dw = t.closest("[data-drawer]");
      if (dw) { openDrawer(dw.dataset.drawer); return; }

      const ex = t.closest(".fc-exchip");
      if (ex) { jump(ex.dataset.n); return; }

      const tc = t.closest("[data-track]");
      if (tc) { openTrack(tc.dataset.track); return; }

      const gp = t.closest(".fc-gate-pill");
      if (gp) { jump(gp.dataset.n); return; }

      const fb = t.closest("[data-band]");
      if (fb && fb.classList.contains("fc-fbtn")) {
        const id = fb.dataset.band;
        if (S.hiddenBands.has(id)) S.hiddenBands.delete(id); else S.hiddenBands.add(id);
        if (S.selected && S.hiddenBands.has(bandOf(IX.byId.get(S.selected)))) clearSelection();
        renderFilters(); renderBands();
        if (S.selected) applySelection();
        scheduleEdges();
        return;
      }
      const sp = t.closest("[data-spot]");
      if (sp) {
        const k = sp.dataset.spot;
        if (S.spot.has(k)) S.spot.delete(k); else S.spot.add(k);
        renderFilters(); renderBands();
        if (S.selected) applySelection();
        return;
      }

      const cardEl = t.closest(".fc-card");   // ΟΧΙ «card» — σκιάζει τη συνάρτηση card()
      if (cardEl) { ev.stopPropagation(); select(cardEl.dataset.n); return; }

      if (t.id === "fc-close") { clearSelection(); return; }
      const go = t.closest("[data-go]");
      if (go) { go.dataset.go === "l0" ? goL0() : clearSelection(); return; }
      if (t.id === "fc-back") { goL0(); return; }
      if (t.id === "fc-density") { setDensity(S.density === "rich" ? "compact" : "rich"); return; }
      if (t.id === "fc-poster") { setPoster(!S.poster); return; }
      if (t.id === "fc-legend-btn") { toggleLegend(); return; }

      // κλικ σε κενό της σκηνής = ΜΟΝΟ αποεπιλογή (δεν αλλάζει επίπεδο)
      if (t.closest("#fc-rail-scroll") && S.selected) clearSelection();
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
  }

  /* §6.4 ΠΛΗΚΤΡΟΛΟΓΙΟ — ενεργό μόνο όταν το view είναι ορατό και ο στόχος
     δεν είναι πεδίο κειμένου (αλλιώς κλέβει πλήκτρα από Remarks/Requirements). */
  function keyNav(ev) {
    if (!fc) return;
    const view = el("view-flowchart");
    if (!view || view.classList.contains("hidden")) return;
    const tag = (ev.target.tagName || "").toUpperCase();
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    if (ev.ctrlKey || ev.altKey || ev.metaKey) return;
    const k = ev.key;

    if (k === "/") { ev.preventDefault(); el("fc-q").focus(); el("fc-q").select(); return; }
    if (k === "Escape") {
      if (!el("fc-drawer").classList.contains("hidden")) { el("fc-drawer").classList.add("hidden"); return; }
      if (!el("fc-legend-pop").classList.contains("hidden")) { toggleLegend(); return; }
      if (S.poster) { setPoster(false); return; }
      if (S.selected) clearSelection(); else if (S.lv === 1) goL0();
      return;
    }
    if (k >= "1" && k <= "5") { ev.preventDefault(); openTrack(TRACKS[+k - 1].id); return; }
    if (k === "0") { ev.preventDefault(); goL0(); return; }
    if (k === "l" || k === "L" || k === "λ" || k === "Λ") { toggleLegend(); return; }
    if (k === "p" || k === "P" || k === "π" || k === "Π") { setPoster(!S.poster); return; }
    if (k === "c" || k === "C" || k === "ψ" || k === "Ψ") { setDensity(S.density === "rich" ? "compact" : "rich"); return; }
    if (S.poster || S.lv === 0) return;

    const cards = [].slice.call(el("fc-bands").querySelectorAll(".fc-card"));
    if (!cards.length) return;
    if (k === "ArrowRight" || k === "ArrowLeft") {
      ev.preventDefault();
      const i = S.selected ? cards.findIndex((c) => c.dataset.n === S.selected) : -1;
      const j = Math.max(0, Math.min(cards.length - 1, i + (k === "ArrowRight" ? 1 : -1)));
      const tgt = cards[i < 0 ? 0 : j];
      select(tgt.dataset.n);
      tgt.scrollIntoView({ block: "nearest" });
      return;
    }
    if (k === "ArrowDown" || k === "ArrowUp") {
      ev.preventDefault();
      const bandsEl = [].slice.call(el("fc-bands").querySelectorAll(".fc-band"));
      if (!bandsEl.length) return;
      let bi = 0;
      if (S.selected) {
        const cur = el("fcn-" + S.selected);
        const sec = cur && cur.closest(".fc-band");
        bi = Math.max(0, bandsEl.indexOf(sec));
      }
      const nb = bandsEl[Math.max(0, Math.min(bandsEl.length - 1, bi + (k === "ArrowDown" ? 1 : -1)))];
      const first = nb.querySelector(".fc-card");
      if (first) { select(first.dataset.n); first.scrollIntoView({ block: "nearest" }); }
      return;
    }
    if (k === "Enter" && S.selected) { ev.preventDefault(); applySelection(); }
  }
})();
