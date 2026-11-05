/* ════════════════════════════════════════════════════════════════════════════
   Ο ΘΕΑΤΗΣ ΤΗΣ ΠΗΓΗΣ — ΔΕΥΤΕΡΟΣ ΓΥΡΟΣ                           (05/11/2026)
   ════════════════════════════════════════════════════════════════════════════

   ΤΙ ΛΥΝΕΙ. Η παραπομπή του Συμβούλου ήταν ΚΕΙΜΕΝΟ: ένα `[ft-123]` κι ένα
   απόσπασμα. Για να επαληθεύσει κανείς ότι λέει αυτό που λέει, έπρεπε να
   ανοίξει το PDF με το χέρι. Εδώ η παραπομπή είναι ΤΟΠΟΘΕΣΙΑ: ανοίγει το
   πραγματικό εγχειρίδιο εκεί που ζει, με τις γραμμές φωτισμένες.

   ΤΙ ΑΛΛΑΞΕ ΑΠΟ ΤΟΝ ΠΡΩΤΟ ΓΥΡΟ, ΚΑΙ ΓΙΑΤΙ ΗΤΑΝ ΛΑΘΟΣ ΟΠΩΣ ΗΤΑΝ. Ο πρώτος
   θεατής ήταν ΜΟΝΤΕΛΟ ΔΙΑΛΟΓΟΥ: σκέπαζε την εφαρμογή και έδειχνε ΜΙΑ παγωμένη
   σελίδα. Ο ιδιοκτήτης το δοκίμασε και είπε το προφανές — ένας κανονισμός δεν
   διαβάζεται σε μία σελίδα. Η παράγραφος συνεχίζει παρακάτω, η προηγούμενη
   εξηγεί το γιατί, και η απάντηση του Συμβούλου πρέπει να είναι ΔΙΠΛΑ, όχι από
   κάτω. Άρα, αυτός ο γύρος φέρνει:

     · ΜΟΙΡΑΣΜΕΝΟ ΠΑΡΑΘΥΡΟ, με λαβή που σέρνεις — η συζήτηση αριστερά, η πηγή
       δεξιά, και τα δύο ζωντανά. Σε κινητό γίνεται πλήρης οθόνη: στα 390
       pixel δεν μοιράζεις τίποτα.
     · ΣΥΝΕΧΕΣ ΚΥΛΙΣΜΑ σε ΟΛΟ το έγγραφο, με τις σελίδες να ζωγραφίζονται όσο
       πλησιάζουν και να σβήνονται όσο απομακρύνονται (253 σελίδες × καμβάς
       δεν χωρούν σε μνήμη κινητού).
     · ΒΕΛΑΚΙΑ ΑΠΟ ΚΟΜΜΑΤΙ ΣΕ ΚΟΜΜΑΤΙ: όλα όσα έχουμε πάρει από ΑΥΤΟ το
       εγχειρίδιο, στη σειρά που τυπώθηκαν. Τα υπόλοιπα κομμάτια της σελίδας
       φαίνονται αχνά — βλέπεις με μια ματιά τι κρατήσαμε από εκεί.
     · ΑΝΑΖΗΤΗΣΗ (Ctrl+F) σε ολόκληρο το έγγραφο, όχι μόνο στη σελίδα.
     · ΕΠΙΠΕΔΟ ΚΕΙΜΕΝΟΥ πάνω από τον καμβά: το κείμενο ΕΠΙΛΕΓΕΤΑΙ και
       αντιγράφεται. Χωρίς αυτό, το PDF είναι φωτογραφία.

   ΤΑ ΚΟΥΤΙΑ ΕΙΝΑΙ ΚΛΑΣΜΑΤΑ ΣΕΛΙΔΑΣ (0..1), με αρχή πάνω-αριστερά. Στρώνονται με
   ποσοστά, άρα ισχύουν σε κάθε zoom, κάθε πυκνότητα οθόνης, κάθε πλάτος — και
   είναι η σύμβαση του ADE, οπότε αν κάποτε περάσουμε τους πίνακες από εκεί, ο
   κώδικας εδώ δεν αλλάζει.

   ΤΟ pdf.js ΕΡΧΕΤΑΙ ΑΠΟ CDN, ΚΑΙ ΕΙΝΑΙ ΑΠΟΦΑΣΗ. Η εφαρμογή δεν έχει CSP, και
   το κλειστό δίκτυο βγήκε από τον σχεδιασμό στις 04/11. Αν πέσει το CDN, ο
   θεατής το λέει καθαρά και δίνει «άνοιγμα σε νέα καρτέλα».
   ════════════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  var INDEX_URL = "../data/grounding.json";
  var PDF_BASE = "../pdf/";
  var WIDTH_KEY = "p2r-pdfview-width";

  /* Η έκδοση είναι καρφωτή, όχι «latest»: CDN που αλλάζει από κάτω σου είναι
     σπασμένη εφαρμογή χωρίς commit. Η 3.11.174 είναι η τελευταία της σειράς 3 —
     κλασικό script, χωρίς modules, δουλεύει και σε κινητό. */
  var VER = "3.11.174";
  var LIB_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/" + VER + "/pdf.min.js";
  var WORKER_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/" + VER + "/pdf.worker.min.js";

  var CSS = '\
:root { --gv-w: 46vw; }\
body.gv-split { padding-right: var(--gv-w); }\
#gv-root { position: fixed; top: 0; right: 0; bottom: 0; width: var(--gv-w); z-index: 9000;\
  display: none; flex-direction: column; background: var(--panel, #11161d); color: var(--text, #e6edf3);\
  border-left: 1px solid var(--line, #30363d); box-shadow: -10px 0 34px rgba(0,0,0,.42); }\
#gv-root.on { display: flex; }\
#gv-grip { position: absolute; left: -4px; top: 0; bottom: 0; width: 9px; cursor: col-resize; z-index: 2; }\
#gv-grip::after { content: ""; position: absolute; left: 4px; top: 0; bottom: 0; width: 1px; background: transparent; }\
#gv-grip:hover::after, body.gv-drag #gv-grip::after { background: var(--accent, #58a6ff); }\
body.gv-drag { cursor: col-resize; user-select: none; }\
body.gv-drag #gv-scroll { pointer-events: none; }\
#gv-head { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 8px 10px;\
  border-bottom: 1px solid var(--line, #30363d); background: var(--panel-2, #161b22); font-size: 12.5px; }\
#gv-head .gv-t { font-weight: 600; max-width: 42%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }\
#gv-head .gv-m { color: var(--muted, #8b949e); }\
#gv-head .gv-sp { flex: 1 1 auto; }\
.gv-b { font: inherit; font-size: 12.5px; cursor: pointer; color: var(--text, #e6edf3); background: var(--bg-2, #0d1117);\
  border: 1px solid var(--line, #30363d); border-radius: 8px; padding: 3px 9px; }\
.gv-b:hover { border-color: var(--accent, #58a6ff); color: var(--accent, #58a6ff); }\
.gv-b:disabled { opacity: .38; cursor: default; border-color: var(--line, #30363d); color: var(--muted, #8b949e); }\
.gv-b.gv-chunk { border-color: var(--accent, #58a6ff); color: var(--accent, #58a6ff); }\
#gv-sub { width: 100%; font-size: 11.5px; color: var(--muted, #8b949e); line-height: 1.45; }\
#gv-find { display: none; align-items: center; gap: 6px; padding: 6px 10px;\
  border-bottom: 1px solid var(--line, #30363d); background: var(--panel-2, #161b22); font-size: 12.5px; }\
#gv-find.on { display: flex; }\
#gv-find input { flex: 1 1 auto; min-width: 80px; font: inherit; font-size: 12.5px; padding: 4px 8px;\
  color: var(--text, #e6edf3); background: var(--bg-2, #0d1117); border: 1px solid var(--line, #30363d); border-radius: 8px; }\
#gv-find input:focus { outline: none; border-color: var(--accent, #58a6ff); }\
#gv-fn { color: var(--muted, #8b949e); white-space: nowrap; font-variant-numeric: tabular-nums; }\
#gv-scroll { flex: 1 1 auto; overflow: auto; background: #3a3f46; padding: 10px 0 40px; }\
.gv-page { position: relative; margin: 0 auto 10px; background: #fff; box-shadow: 0 2px 10px rgba(0,0,0,.45); }\
.gv-page canvas { display: block; width: 100%; height: 100%; }\
.gv-no { position: absolute; left: 6px; top: 4px; font-size: 10px; color: #8b949e; background: rgba(0,0,0,.45);\
  padding: 1px 6px; border-radius: 6px; z-index: 4; pointer-events: none; }\
.gv-text { position: absolute; inset: 0; overflow: hidden; line-height: 1; z-index: 2; }\
.gv-text span, .gv-text br { color: transparent; position: absolute; white-space: pre; cursor: text;\
  transform-origin: 0% 0%; }\
.gv-text ::selection { background: rgba(88,166,255,.42); }\
.gv-text .gv-hit { background: rgba(255,145,0,.42); border-radius: 2px; }\
.gv-text .gv-hit.gv-cur { background: rgba(255,90,0,.70); }\
.gv-boxes { position: absolute; inset: 0; z-index: 3; pointer-events: none; }\
.gv-box { position: absolute; border-radius: 2px; }\
.gv-box.gv-other { outline: 1px dashed rgba(120,170,255,.75); background: rgba(120,170,255,.10); pointer-events: auto; cursor: pointer; }\
.gv-box.gv-this { outline: 1.5px solid rgba(255,196,0,.95); background: rgba(255,214,0,.30); animation: gv-pulse 1s ease-out 2; }\
@keyframes gv-pulse { 0% { background: rgba(255,214,0,.66); } 100% { background: rgba(255,214,0,.30); } }\
#gv-foot { padding: 6px 10px; border-top: 1px solid var(--line, #30363d); background: var(--panel-2, #161b22);\
  font-size: 11px; color: var(--muted, #8b949e); line-height: 1.5; }\
#gv-msg { padding: 20px; font-size: 13.5px; line-height: 1.65; color: var(--text, #e6edf3); }\
#gv-msg code { font-family: Consolas, monospace; font-size: 12.5px; background: var(--bg-2, #0d1117);\
  border: 1px solid var(--line, #30363d); border-radius: 6px; padding: 2px 7px; }\
.gv-src { font: inherit; font-size: 11px; cursor: pointer; margin-left: 2px; padding: 0 5px; border-radius: 6px;\
  color: var(--muted, #8b949e); background: transparent; border: 1px solid var(--line, #30363d); vertical-align: baseline; }\
.gv-src:hover { color: var(--accent, #58a6ff); border-color: var(--accent, #58a6ff); }\
@media (max-width: 760px) {\
  body.gv-split { padding-right: 0; }\
  #gv-root { width: 100vw; left: 0; border-left: 0; }\
  #gv-grip { display: none; }\
}';

  function style() {
    if (document.getElementById("gv-style")) return;
    var st = document.createElement("style");
    st.id = "gv-style";
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  var ESC_MAP = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return ESC_MAP[c]; }); }
  function el(id) { return document.getElementById(id); }
  function narrow() { return window.innerWidth <= 760; }

  /* ── ΤΟ ΕΥΡΕΤΗΡΙΟ ──────────────────────────────────────────────────────── */
  var INDEX = null, indexPromise = null, BY_PDF = {};

  function ready() {
    if (indexPromise) return indexPromise;
    indexPromise = fetch(INDEX_URL, { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        /* Έλεγχος σχήματος: αν αλλάξει η μορφή του αρχείου θέλουμε ΣΙΩΠΗ
           (κανένα κουμπί) αντί για σπασμένο θεατή. */
        INDEX = (j && j.schema === "fdms-grounding-v1" && j.blocks) ? j : null;
        if (INDEX) group();
        return !!INDEX;
      })
      .catch(function () { INDEX = null; return false; });
    return indexPromise;
  }

  /* Τα κομμάτια ανά εγχειρίδιο, ΣΤΗ ΣΕΙΡΑ ΠΟΥ ΤΥΠΩΘΗΚΑΝ — σελίδα, και μέσα στη
     σελίδα από πάνω προς τα κάτω. Αυτή η σειρά είναι τα βελάκια: «δείξε μου το
     επόμενο που πήραμε από αυτό το βιβλίο». Η σειρά των ids στο corpus ΔΕΝ
     κάνει, γιατί δεν είναι η σειρά του εγγράφου. */
  function group() {
    BY_PDF = {};
    var ids = Object.keys(INDEX.blocks);
    for (var i = 0; i < ids.length; i++) {
      var b = INDEX.blocks[ids[i]];
      (BY_PDF[b.pdf_id] = BY_PDF[b.pdf_id] || []).push({ id: ids[i], page: b.page, y: top(b) });
    }
    for (var k in BY_PDF) {
      BY_PDF[k].sort(function (a, c) { return a.page - c.page || a.y - c.y; });
    }
  }

  function top(b) {
    var y = 1;
    for (var i = 0; i < (b.boxes || []).length; i++) if (b.boxes[i].ymin < y) y = b.boxes[i].ymin;
    return y;
  }

  function has(id) { return !!(INDEX && INDEX.blocks && INDEX.blocks[id]); }
  function block(id) { return (INDEX && INDEX.blocks && INDEX.blocks[id]) || null; }

  /* ── ΤΟ pdf.js ─────────────────────────────────────────────────────────── */
  var libPromise = null;

  function lib() {
    if (libPromise) return libPromise;
    libPromise = new Promise(function (resolve, reject) {
      if (window.pdfjsLib) return resolve(window.pdfjsLib);
      var s = document.createElement("script");
      s.src = LIB_URL;
      s.onload = function () { resolve(window.pdfjsLib); };
      s.onerror = function () { reject(new Error("cdn")); };
      document.head.appendChild(s);
    }).then(function (L) {
      if (!L) throw new Error("cdn");
      /* Ο WORKER ΚΑΤΕΒΑΙΝΕΙ ΩΣ ΚΕΙΜΕΝΟ ΚΑΙ ΓΙΝΕΤΑΙ BLOB ΙΔΙΑΣ ΠΡΟΕΛΕΥΣΗΣ.
         Ο browser δεν δέχεται `new Worker(<ξένη προέλευση>)`, και το κλασικό
         κόλπο (blob με importScripts προς το CDN) ΜΕΤΡΗΘΗΚΕ ΟΤΙ ΣΠΑΕΙ: ο worker
         πέθαινε με «unknown error when fetching the script» και μετά το
         `getPage` απαντούσε κανονικά ενώ το `render` ΔΕΝ ΤΕΛΕΙΩΝΕ ΠΟΤΕ. Το
         `fetch` της σελίδας περνά (το cdnjs στέλνει CORS), οπότε φέρνουμε τον
         κώδικα εδώ και τον δίνουμε στον worker από μνήμη. */
      return fetch(WORKER_URL)
        .then(function (r) { if (!r.ok) throw new Error("worker"); return r.text(); })
        .then(function (src) {
          L.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([src], { type: "application/javascript" }));
          return L;
        })
        .catch(function () { L.GlobalWorkerOptions.workerSrc = WORKER_URL; return L; });
    });
    return libPromise;
  }

  /* Ένα έγγραφο ανά εγχειρίδιο, ΜΙΑ φορά: το pdf.js κρατά τη δομή και ζητά με
     Range μόνο ό,τι λείπει — η δεύτερη παραπομπή στο ίδιο βιβλίο είναι ακαριαία. */
  var DOCS = {};
  function doc(pdfId) {
    if (DOCS[pdfId]) return DOCS[pdfId];
    DOCS[pdfId] = lib().then(function (L) {
      return L.getDocument({ url: PDF_BASE + encodeURIComponent(pdfId), withCredentials: true }).promise;
    }).catch(function (e) { delete DOCS[pdfId]; throw e; });
    return DOCS[pdfId];
  }

  /* ── ΚΑΤΑΣΤΑΣΗ ─────────────────────────────────────────────────────────── */
  var S = {
    on: false, id: null, b: null, pdfId: null, doc: null, pages: 0,
    base: 1,           // κλίμακα που γεμίζει το πλάτος
    zoom: 1,           // ο πολλαπλασιαστής του χρήστη
    slots: [],         // τα <div class="gv-page">
    token: 0,          // ακυρώνει αργές ζωγραφιές μετά από άλλο άνοιγμα
    list: [],          // τα κομμάτια ΑΥΤΟΥ του εγχειριδίου, στη σειρά
    cur: -1,           // ποιο κομμάτι δείχνουμε
    text: null,        // το κείμενο ανά σελίδα, για την αναζήτηση
    textPromise: null,
    hits: [], hit: -1, q: ""
  };

  /* ── ΤΟ ΚΕΛΥΦΟΣ ────────────────────────────────────────────────────────── */
  function shell() {
    style();
    if (el("gv-root")) return;
    var r = document.createElement("div");
    r.id = "gv-root";
    r.setAttribute("role", "complementary");
    r.setAttribute("aria-label", "Η πηγή");
    r.innerHTML =
      '<div id="gv-grip" title="Σύρε για να μοιράσεις το παράθυρο"></div>' +
      '<div id="gv-head">' +
        '<span class="gv-t" id="gv-title">—</span>' +
        '<span class="gv-sp"></span>' +
        '<button type="button" class="gv-b gv-chunk" id="gv-cprev" title="Προηγούμενο κομμάτι που χρησιμοποιήσαμε (Shift+←)">⟨</button>' +
        '<span class="gv-m" id="gv-ck">—</span>' +
        '<button type="button" class="gv-b gv-chunk" id="gv-cnext" title="Επόμενο κομμάτι που χρησιμοποιήσαμε (Shift+→)">⟩</button>' +
        '<span class="gv-m" id="gv-pg">—</span>' +
        '<button type="button" class="gv-b" id="gv-ffind" title="Αναζήτηση στο έγγραφο (Ctrl+F)">⌕</button>' +
        '<button type="button" class="gv-b" id="gv-out" title="Σμίκρυνση (−)">−</button>' +
        '<button type="button" class="gv-b" id="gv-in" title="Μεγέθυνση (+)">+</button>' +
        '<button type="button" class="gv-b" id="gv-tab" title="Άνοιγμα του PDF σε νέα καρτέλα">⧉</button>' +
        '<button type="button" class="gv-b" id="gv-x" title="Κλείσιμο (Esc)">✕</button>' +
        '<span class="gv-m" id="gv-sub"></span>' +
      '</div>' +
      '<div id="gv-find">' +
        '<input type="search" id="gv-q" placeholder="Αναζήτηση σε ΟΛΟ το έγγραφο…" autocomplete="off">' +
        '<span id="gv-fn">—</span>' +
        '<button type="button" class="gv-b" id="gv-fprev" title="Προηγούμενο (Shift+Enter)">‹</button>' +
        '<button type="button" class="gv-b" id="gv-fnext" title="Επόμενο (Enter)">›</button>' +
        '<button type="button" class="gv-b" id="gv-fx" title="Κλείσιμο αναζήτησης (Esc)">✕</button>' +
      '</div>' +
      '<div id="gv-scroll"></div>' +
      '<div id="gv-foot"></div>';
    document.body.appendChild(r);
    wire(r);
  }

  function wire(r) {
    r.addEventListener("click", function (ev) {
      var t = ev.target.closest ? ev.target.closest("button, .gv-box") : null;
      if (!t) return;
      if (t.id === "gv-x") close();
      else if (t.id === "gv-in") zoom(0.2);
      else if (t.id === "gv-out") zoom(-0.2);
      else if (t.id === "gv-cprev") chunk(S.cur - 1);
      else if (t.id === "gv-cnext") chunk(S.cur + 1);
      else if (t.id === "gv-ffind") findOpen();
      else if (t.id === "gv-fx") findClose();
      else if (t.id === "gv-fnext") findGo(1);
      else if (t.id === "gv-fprev") findGo(-1);
      else if (t.id === "gv-tab") window.open(PDF_BASE + encodeURIComponent(S.pdfId) + "#page=" + seenPage(), "_blank", "noopener");
      else if (t.classList && t.classList.contains("gv-box") && t.dataset.id) show(t.dataset.id);
    });

    /* Η ΛΑΒΗ. Pointer events και όχι mouse: το ίδιο καλώδιο δουλεύει με ποντίκι,
       με δάχτυλο και με πένα, και το setPointerCapture κρατά το σύρσιμο ακόμη
       κι όταν ο δείκτης βγει έξω από τη λαβή. */
    var grip = el("gv-grip");
    grip.addEventListener("pointerdown", function (ev) {
      if (narrow()) return;
      ev.preventDefault();
      grip.setPointerCapture(ev.pointerId);
      document.body.classList.add("gv-drag");
      var move = function (e) {
        var w = Math.max(320, Math.min(window.innerWidth - 260, window.innerWidth - e.clientX));
        width(w + "px");
      };
      var up = function () {
        document.body.classList.remove("gv-drag");
        grip.removeEventListener("pointermove", move);
        grip.removeEventListener("pointerup", up);
        try { localStorage.setItem(WIDTH_KEY, getComputedStyle(document.documentElement).getPropertyValue("--gv-w").trim()); } catch (e) { /* ιδιωτικό */ }
        refit();
      };
      grip.addEventListener("pointermove", move);
      grip.addEventListener("pointerup", up);
    });

    el("gv-q").addEventListener("input", function () { findRun(this.value); });
    el("gv-q").addEventListener("keydown", function (ev) {
      if (ev.key === "Enter") { ev.preventDefault(); findGo(ev.shiftKey ? -1 : 1); }
      else if (ev.key === "Escape") { ev.preventDefault(); findClose(); }
    });

    document.addEventListener("keydown", function (ev) {
      if (!S.on) return;
      var typing = ev.target && /^(INPUT|TEXTAREA)$/.test(ev.target.tagName);
      if ((ev.ctrlKey || ev.metaKey) && (ev.key === "f" || ev.key === "F")) {
        /* ΠΑΙΡΝΟΥΜΕ ΤΟ Ctrl+F ΜΟΝΟ ΟΣΟ Ο ΘΕΑΤΗΣ ΕΙΝΑΙ ΑΝΟΙΧΤΟΣ. Η εύρεση του
           browser ψάχνει ΜΟΝΟ τις σελίδες που τυχαίνει να είναι ζωγραφισμένες —
           δηλαδή ψεύδεται: «καμία αντιστοιχία» σε έγγραφο που την έχει δέκα
           σελίδες πιο κάτω. Η δική μας ψάχνει ΟΛΟ το έγγραφο. */
        ev.preventDefault();
        findOpen();
        return;
      }
      if (typing) return;
      if (ev.key === "Escape") { ev.preventDefault(); if (el("gv-find").classList.contains("on")) findClose(); else close(); }
      else if (ev.shiftKey && ev.key === "ArrowLeft") { ev.preventDefault(); chunk(S.cur - 1); }
      else if (ev.shiftKey && ev.key === "ArrowRight") { ev.preventDefault(); chunk(S.cur + 1); }
      else if (ev.key === "+" || ev.key === "=") { ev.preventDefault(); zoom(0.2); }
      else if (ev.key === "-") { ev.preventDefault(); zoom(-0.2); }
    });

    var rt = null;
    window.addEventListener("resize", function () {
      if (!S.on) return;
      clearTimeout(rt);
      rt = setTimeout(refit, 180);
    });

    /* Με στραγγάλισμα: το scroll στέλνει δεκάδες συμβάντα ανά δευτερόλεπτο και
       το `update` διαβάζει γεωμετρία (ακριβό). Η κεφαλίδα ενημερώνεται αμέσως
       γιατί είναι μια ανάγνωση, η ζωγραφική με καθυστέρηση. */
    var st = null;
    el("gv-scroll").addEventListener("scroll", function () {
      headPage();
      if (st) return;
      st = setTimeout(function () { st = null; update(); }, 90);
    });
  }

  function width(w) {
    document.documentElement.style.setProperty("--gv-w", w);
  }

  /* ── ΣΕΛΙΔΕΣ: ΘΕΣΕΙΣ, ΤΕΜΠΕΛΗΣ ΖΩΓΡΑΦΙΚΗ ──────────────────────────────── */
  function scale() { return S.base * S.zoom; }

  function slots(w, h) {
    var sc = el("gv-scroll");
    sc.innerHTML = "";
    S.slots = [];
    for (var p = 1; p <= S.pages; p++) {
      var d = document.createElement("div");
      d.className = "gv-page";
      d.dataset.p = String(p);
      d.style.width = Math.floor(w) + "px";
      d.style.height = Math.floor(h) + "px";
      d.innerHTML = '<span class="gv-no">σελ. ' + p + "</span>";
      sc.appendChild(d);
      S.slots.push(d);
    }
    update();
  }

  /* ΠΟΙΕΣ ΣΕΛΙΔΕΣ ΖΩΓΡΑΦΙΖΟΝΤΑΙ, ΜΕ ΑΡΙΘΜΗΤΙΚΗ ΚΑΙ ΟΧΙ ΜΕ ΠΑΡΑΤΗΡΗΤΗ.
     Ο IntersectionObserver ήταν η πρώτη γραφή και ΔΕΝ κράτησε: οι ειδοποιήσεις
     του δένονται με τον κύκλο σχεδίασης του browser, και όπου αυτός δεν τρέχει
     (κρυμμένη καρτέλα, ενσωματωμένο παράθυρο — μετρήθηκε 05/11) ΔΕΝ φτάνει
     ποτέ καμία: ο θεατής έμενε με λευκές σελίδες χωρίς κανένα σφάλμα. Εδώ οι
     θέσεις υπολογίζονται από το scrollTop — ντετερμινιστικά, παντού.

     Ζωγραφίζουμε ένα παράθυρο ΠΡΙΝ και δύο ΜΕΤΑ (διαβάζεις προς τα κάτω), και
     σβήνουμε ό,τι ξεφύγει πιο μακριά: 253 καμβάδες είναι εκατοντάδες MB και
     σκοτώνουν το κινητό. Η υστέρηση ανάμεσα στα δύο όρια είναι επίτηδες —
     χωρίς αυτήν, μια σελίδα στο σύνορο θα ζωγραφιζόταν και θα σβηνόταν σε
     κάθε κύλιση. */
  function update() {
    var sc = el("gv-scroll");
    if (!sc || !S.slots.length) return;
    var v = sc.clientHeight || 600;
    var keepTop = sc.scrollTop - v, keepBot = sc.scrollTop + v * 2;
    var dropTop = sc.scrollTop - v * 3, dropBot = sc.scrollTop + v * 4;
    for (var i = 0; i < S.slots.length; i++) {
      var s = S.slots[i], y0 = s.offsetTop, y1 = y0 + s.offsetHeight;
      if (y1 > keepTop && y0 < keepBot) paint(s);
      else if (y1 < dropTop || y0 > dropBot) wipe(s);
    }
  }

  function wipe(slot) {
    if (!slot.dataset.painted) return;
    delete slot.dataset.painted;
    slot.innerHTML = '<span class="gv-no">σελ. ' + slot.dataset.p + "</span>";
  }

  function paint(slot) {
    if (slot.dataset.painted || slot.dataset.busy) return;
    var my = S.token, p = +slot.dataset.p;
    slot.dataset.busy = "1";
    S.doc.getPage(p).then(function (page) {
      if (my !== S.token || !S.on) { delete slot.dataset.busy; return; }
      var vp = page.getViewport({ scale: scale() });
      /* Ο καμβάς σε ΦΥΣΙΚΑ pixel, το στοιχείο σε CSS pixel: αλλιώς σε retina ή
         σε κινητό το κείμενο βγαίνει θολό. Πάνω από 2 δεν κερδίζει τίποτα και
         τετραπλασιάζει τη μνήμη. */
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var cv = document.createElement("canvas");
      cv.width = Math.floor(vp.width * dpr);
      cv.height = Math.floor(vp.height * dpr);
      var ctx = cv.getContext("2d");
      ctx.scale(dpr, dpr);
      slot.style.width = Math.floor(vp.width) + "px";
      slot.style.height = Math.floor(vp.height) + "px";
      return page.render({ canvasContext: ctx, viewport: vp }).promise.then(function () {
        if (my !== S.token || !S.on) return;
        slot.innerHTML = '<span class="gv-no">σελ. ' + p + "</span>";
        slot.appendChild(cv);
        slot.dataset.painted = "1";
        boxes(slot, p);
        return layer(slot, page, vp, my);
      });
    }).catch(function () {
      /* Μία σελίδα που δεν ζωγραφίστηκε δεν ρίχνει το έγγραφο. */
      slot.innerHTML = '<span class="gv-no">σελ. ' + slot.dataset.p + " — δεν ζωγραφίστηκε</span>";
    }).then(function () { delete slot.dataset.busy; });
  }

  /* ΤΟ ΕΠΙΠΕΔΟ ΚΕΙΜΕΝΟΥ. Διάφανα <span> ακριβώς πάνω από τα γράμματα του
     καμβά: έτσι το κείμενο ΕΠΙΛΕΓΕΤΑΙ και αντιγράφεται, και έτσι φωτίζουμε τα
     ευρήματα της αναζήτησης. Το `--scale-factor` είναι ΑΠΑΙΤΗΣΗ του pdf.js 3:
     χωρίς αυτό τα span πέφτουν σε λάθος θέσεις. */
  function layer(slot, page, vp, my) {
    var L = window.pdfjsLib;
    if (!L || !L.renderTextLayer) return;
    var box = document.createElement("div");
    box.className = "gv-text";
    box.style.setProperty("--scale-factor", String(vp.scale));
    slot.appendChild(box);
    return page.getTextContent().then(function (tc) {
      if (my !== S.token || !S.on) return;
      return L.renderTextLayer({ textContent: tc, container: box, viewport: vp, textDivs: [] }).promise
        .then(function () { if (S.q) mark(box); });
    }).catch(function () { /* χωρίς επίπεδο κειμένου η σελίδα μένει εικόνα */ });
  }

  function boxes(slot, p) {
    var wrap = document.createElement("div");
    wrap.className = "gv-boxes";
    var list = S.list, any = false;
    for (var i = 0; i < list.length; i++) {
      if (list[i].page !== p) continue;
      var b = block(list[i].id);
      if (!b) continue;
      var mine = list[i].id === S.id;
      for (var k = 0; k < (b.boxes || []).length; k++) {
        var r = b.boxes[k];
        if ((r.page || b.page) !== p) continue;
        var d = document.createElement("div");
        d.className = "gv-box " + (mine ? "gv-this" : "gv-other");
        d.dataset.id = list[i].id;
        if (!mine) d.title = "κομμάτι " + list[i].id + " — πάτα το για να το δεις";
        d.style.left = (r.xmin * 100) + "%";
        d.style.top = (r.ymin * 100) + "%";
        d.style.width = ((r.xmax - r.xmin) * 100) + "%";
        d.style.height = ((r.ymax - r.ymin) * 100) + "%";
        wrap.appendChild(d);
        any = true;
      }
    }
    if (any) slot.appendChild(wrap);
  }

  /* ── ΠΛΟΗΓΗΣΗ ──────────────────────────────────────────────────────────── */
  function seenPage() {
    var sc = el("gv-scroll");
    if (!sc || !S.slots.length) return 1;
    var mid = sc.scrollTop + sc.clientHeight * 0.35;
    for (var i = 0; i < S.slots.length; i++) {
      if (S.slots[i].offsetTop + S.slots[i].offsetHeight > mid) return i + 1;
    }
    return S.pages;
  }

  function headPage() {
    var e = el("gv-pg");
    if (e) e.textContent = "σελ. " + seenPage() + " / " + S.pages;
  }

  function toPage(p, frac) {
    var sc = el("gv-scroll"), slot = S.slots[p - 1];
    if (!sc || !slot) return;
    /* Λίγο ΠΑΝΩ από το σημείο, επίτηδες: ο κανονισμός διαβάζεται με τη φράση
       που προηγείται, όχι από τη μέση της παραγράφου. */
    var y = slot.offsetTop + (frac == null ? 0 : Math.max(0, frac * slot.offsetHeight - sc.clientHeight * 0.28));
    sc.scrollTop = y;
    headPage();
    update();
  }

  function chunk(i) {
    if (!S.list.length) return;
    if (i < 0) i = 0;
    if (i > S.list.length - 1) i = S.list.length - 1;
    show(S.list[i].id);
  }

  function show(id) {
    var b = block(id);
    if (!b) return;
    S.id = id;
    S.b = b;
    S.cur = -1;
    for (var i = 0; i < S.list.length; i++) if (S.list[i].id === id) { S.cur = i; break; }
    repaintBoxes();
    head();
    toPage(b.page, top(b));
  }

  /* Τα κουτιά αλλάζουν χρώμα όταν αλλάζει το «τρέχον» κομμάτι — ξαναφτιάχνουμε
     ΜΟΝΟ τα κουτιά, όχι τους καμβάδες: η ζωγραφική είναι το ακριβό μέρος. */
  function repaintBoxes() {
    for (var i = 0; i < S.slots.length; i++) {
      var slot = S.slots[i];
      if (!slot.dataset.painted) continue;
      var old = slot.querySelector(".gv-boxes");
      if (old) old.remove();
      boxes(slot, +slot.dataset.p);
    }
  }

  function zoom(d) {
    var z = Math.max(0.5, Math.min(4, Math.round((S.zoom + d) * 100) / 100));
    if (z === S.zoom) return;
    var p = seenPage();
    S.zoom = z;
    relayout();
    toPage(p);
  }

  function refit() {
    if (!S.on || !S.doc) return;
    var p = seenPage();
    fitBase().then(function () { relayout(); toPage(p); });
  }

  function fitBase() {
    return S.doc.getPage(1).then(function (page) {
      var sc = el("gv-scroll");
      var avail = Math.max(260, (sc ? sc.clientWidth : 700) - 26);
      S.base = avail / page.getViewport({ scale: 1 }).width;
      S.page1 = page.getViewport({ scale: 1 });
    });
  }

  function relayout() {
    var vp = S.page1;
    if (!vp) return;
    var w = vp.width * scale(), h = vp.height * scale();
    S.token++;
    slots(w, h);
  }

  /* ── ΑΝΑΖΗΤΗΣΗ ─────────────────────────────────────────────────────────── */
  function findOpen() {
    el("gv-find").classList.add("on");
    var q = el("gv-q");
    q.focus();
    q.select();
    textIndex();
  }

  function findClose() {
    el("gv-find").classList.remove("on");
    S.q = "";
    S.hits = [];
    S.hit = -1;
    el("gv-fn").textContent = "—";
    var spans = document.querySelectorAll(".gv-text .gv-hit");
    for (var i = 0; i < spans.length; i++) spans[i].classList.remove("gv-hit", "gv-cur");
  }

  /* ΤΟ ΚΕΙΜΕΝΟ ΟΛΟΥ ΤΟΥ ΕΓΓΡΑΦΟΥ, ΜΙΑ ΦΟΡΑ. 253 σελίδες θέλουν λίγα
     δευτερόλεπτα· το λέμε στον μετρητή αντί να παγώσουμε σιωπηλά, και το
     κρατάμε όσο ζει η καρτέλα. */
  function textIndex() {
    if (S.textPromise) return S.textPromise;
    var my = S.token, out = [];
    var fn = el("gv-fn");
    var chain = Promise.resolve();
    var mk = function (p) {
      return function () {
        if (my !== S.token) return;
        return S.doc.getPage(p).then(function (pg) { return pg.getTextContent(); }).then(function (tc) {
          var s = "";
          for (var i = 0; i < tc.items.length; i++) s += tc.items[i].str + (tc.items[i].hasEOL ? "\n" : "");
          out[p - 1] = fold(s);
          if (p % 10 === 0 && fn) fn.textContent = "δεικτοδότηση " + p + "/" + S.pages;
        }).catch(function () { out[p - 1] = ""; });
      };
    };
    for (var p = 1; p <= S.pages; p++) chain = chain.then(mk(p));
    S.textPromise = chain.then(function () {
      S.text = out;
      if (fn) fn.textContent = "—";
      if (S.q) findRun(S.q);
      return out;
    });
    return S.textPromise;
  }

  /* ΤΑ ΔΥΟ ΑΛΦΑΒΗΤΑ ΞΑΝΑ. Ο κωδικός «I35ΧΧ» τυπώνεται με λατινικό I και
     ελληνικό Χ — ΑΝΑΜΕΙΚΤΑ. Αν η αναζήτηση δεν τα ισοπεδώσει, ο χρήστης που
     πληκτρολογεί «I35XX» με αγγλικά παίρνει μηδέν ευρήματα σε σελίδα που τον
     έχει. Ίδια θεραπεία με τον proxy: πεζά, χωρίς τόνους, ελληνικά ομόγραφα σε
     λατινικά. Το μήκος μένει ΙΔΙΟ, γιατί οι θέσεις είναι ο χάρτης μας. */
  var HOMO = { "Α": "A", "Β": "B", "Ε": "E", "Ζ": "Z", "Η": "H", "Ι": "I", "Κ": "K", "Μ": "M",
               "Ν": "N", "Ο": "O", "Ρ": "P", "Τ": "T", "Υ": "Y", "Χ": "X" };
  function fold(s) {
    s = String(s || "").toUpperCase();
    if (s.normalize) s = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return s.replace(/[ΑΒΕΖΗΙΚΜΝΟΡΤΥΧ]/g, function (c) { return HOMO[c]; });
  }

  function findRun(q) {
    S.q = String(q || "");
    var f = fold(S.q.trim());
    S.hits = [];
    S.hit = -1;
    if (f.length < 2 || !S.text) {
      el("gv-fn").textContent = f.length ? (S.text ? "0" : "δεικτοδότηση…") : "—";
      remark();
      return;
    }
    for (var p = 0; p < S.text.length; p++) {
      var t = S.text[p] || "", i = t.indexOf(f);
      while (i !== -1) { S.hits.push(p + 1); i = t.indexOf(f, i + f.length); }
    }
    el("gv-fn").textContent = S.hits.length ? "1 / " + S.hits.length : "0";
    remark();
    if (S.hits.length) { S.hit = 0; toPage(S.hits[0]); }
  }

  function findGo(d) {
    if (!S.hits.length) return;
    S.hit = (S.hit + d + S.hits.length) % S.hits.length;
    el("gv-fn").textContent = (S.hit + 1) + " / " + S.hits.length;
    toPage(S.hits[S.hit]);
  }

  function remark() {
    var ls = document.querySelectorAll(".gv-text");
    for (var i = 0; i < ls.length; i++) mark(ls[i]);
  }

  /* Το φώτισμα είναι ΑΝΑ SPAN, όχι ανά γράμμα: το pdf.js σπάει το κείμενο σε
     κομμάτια που δεν ακολουθούν τις λέξεις, και μια ακριβής υπογράμμιση θα
     ήθελε ξαναχτίσιμο του span. Φωτίζουμε όποιο κομμάτι περιέχει τον όρο —
     αρκεί για να πέσει το μάτι, και δεν λέει ψέματα για το πού είναι. */
  function mark(box) {
    var f = fold((S.q || "").trim());
    var spans = box.querySelectorAll("span");
    for (var i = 0; i < spans.length; i++) {
      var hit = f.length >= 2 && fold(spans[i].textContent).indexOf(f) !== -1;
      spans[i].classList.toggle("gv-hit", hit);
    }
  }

  /* ── ΚΕΦΑΛΙΔΑ ──────────────────────────────────────────────────────────── */
  function head() {
    var b = S.b;
    if (el("gv-title")) el("gv-title").textContent = b ? (b.pdf || b.pdf_id) : "—";
    if (el("gv-ck")) el("gv-ck").textContent = S.list.length ? ("κομμάτι " + (S.cur + 1) + " / " + S.list.length) : "—";
    if (el("gv-cprev")) el("gv-cprev").disabled = !(S.cur > 0);
    if (el("gv-cnext")) el("gv-cnext").disabled = !(S.cur >= 0 && S.cur < S.list.length - 1);
    headPage();
    if (el("gv-sub")) el("gv-sub").innerHTML = sub();
    if (el("gv-foot")) el("gv-foot").innerHTML = foot();
  }

  function sub() {
    var b = S.b;
    if (!b) return "";
    var bits = [];
    if (b.ref) bits.push("<b>" + esc(b.ref) + "</b>");
    if (b.page_printed) bits.push("τυπωμένη σελ. " + esc(b.page_printed));
    bits.push("στη σελ. " + b.page + " του αρχείου");
    return bits.join(" · ");
  }

  function foot() {
    var b = S.b;
    if (!b) return "";
    /* ΤΟ «ΠΩΣ» ΔΕΝ ΚΡΥΒΕΤΑΙ. «Ακριβές ταίριασμα» και «ανά λέξη» δεν αξίζουν την
       ίδια εμπιστοσύνη, και όποιος κρίνει μαθητή πρέπει να ξέρει πόσο σφιχτό
       ήταν το ταίριασμα — όχι να βλέπει ένα κίτρινο κουτί και να το πιστεύει. */
    var raw = String(b.how || "");
    var shift = /\(σελ\.±(\d+)\)/.exec(raw);
    var hook = /@(\d+)/.exec(raw);
    var base = raw.split("@")[0].split(" (")[0];
    var NAMES = { "direct": "ακριβές ταίριασμα", "words": "ανά λέξη — χαλαρό",
                  "no-prefix": "χωρίς το πρόθεμα της παραπομπής",
                  "before-ellipsis": "μέχρι τα αποσιωπητικά" };
    var how = NAMES[base] || base;
    if (hook) how += ", με τα πρώτα " + hook[1] + " χαρακτήρες";
    return "<b>" + esc(S.id) + "</b> · εντοπίστηκε: " + esc(how) + " · corpus: " + esc(b.corpus || "—") +
           (shift ? " · <b>⚠ σε ΑΛΛΗ σελίδα από όση δήλωνε το corpus (" + esc(shift[1]) + " σελίδες μακριά)</b>" : "") +
           " · τα <span style=\"outline:1px dashed rgba(120,170,255,.75);padding:0 4px\">διακεκομμένα</span> " +
           "είναι τα υπόλοιπα κομμάτια που κρατήσαμε από το ίδιο βιβλίο — πάτα τα.";
  }

  function msg(html) {
    var sc = el("gv-scroll");
    if (sc) sc.innerHTML = '<div id="gv-msg">' + html + "</div>";
  }

  /* ── ΑΝΟΙΓΜΑ / ΚΛΕΙΣΙΜΟ ────────────────────────────────────────────────── */
  function open(id) {
    shell();
    var b = block(id);
    S.on = true;
    S.id = id;
    S.b = b;
    S.token++;
    S.zoom = 1;
    S.hits = []; S.hit = -1; S.q = "";
    el("gv-root").classList.add("on");
    document.body.classList.add("gv-split");
    try {
      var w = localStorage.getItem(WIDTH_KEY);
      if (w && /^[\d.]+(px|vw|%)$/.test(w)) width(w);
    } catch (e) { /* ιδιωτικό παράθυρο */ }
    findClose();

    if (!b) {
      head();
      msg("<b>Αυτή η παραπομπή δεν έχει τοποθεσία στο ευρετήριο.</b><br>" +
          "Καλύφθηκαν 468 από τα 482 αναγνωριστικά· όσα λείπουν είναι κυρίως " +
          "<b>πίνακες</b>, που το κείμενό τους δεν ταιριάζει γραμμικά με τη σελίδα.");
      return;
    }

    /* Αλλάζει εγχειρίδιο; Τότε όλα από την αρχή: άλλο έγγραφο, άλλα κομμάτια,
       άλλο ευρετήριο κειμένου. Ίδιο; Κρατάμε ό,τι έχουμε και απλώς πάμε εκεί. */
    if (S.pdfId === b.pdf_id && S.doc) {
      S.list = BY_PDF[b.pdf_id] || [];
      show(id);
      return;
    }
    S.pdfId = b.pdf_id;
    S.doc = null;
    S.text = null;
    S.textPromise = null;
    S.list = BY_PDF[b.pdf_id] || [];
    S.cur = -1;
    head();
    msg("Άνοιγμα του εγγράφου…");
    var my = S.token;
    doc(b.pdf_id).then(function (d) {
      if (my !== S.token || !S.on) return;
      S.doc = d;
      S.pages = d.numPages;
      return fitBase().then(function () {
        if (my !== S.token || !S.on) return;
        relayout();
        show(id);
      });
    }).catch(function (e) {
      if (my !== S.token) return;
      var cdn = String(e && e.message) === "cdn";
      head();
      msg(cdn
        ? ("<b>Ο θεατής δεν φόρτωσε.</b> Το <code>pdf.js</code> έρχεται από το cdnjs και δεν απάντησε — " +
           "χωρίς ίντερνετ ο θεατής δεν δουλεύει, το έγγραφο όμως ναι:<br><br>" +
           '<button type="button" class="gv-b" id="gv-tab2">⧉ Άνοιγμα του PDF σε νέα καρτέλα</button>')
        : ("<b>Το έγγραφο δεν άνοιξε.</b> Ο server απάντησε: " + esc(String(e && e.message || e)) +
           "<br><br>Αν λέει 404, λείπει το αρχείο από τη ρίζα <code>D:\\FDMS</code> ή ο server τρέχει " +
           "παλιά έκδοση — θέλει <code>Restart-Service fdms-app</code>."));
      var t = el("gv-tab2");
      if (t) t.onclick = function () { window.open(PDF_BASE + encodeURIComponent(S.pdfId), "_blank", "noopener"); };
    });
  }

  function close() {
    if (!S.on) return;
    S.on = false;
    S.token++;
    var r = el("gv-root");
    if (r) r.classList.remove("on");
    document.body.classList.remove("gv-split");
    var sc = el("gv-scroll");
    if (sc) sc.innerHTML = "";          // οι καμβάδες είναι δεκάδες MB
    S.slots = [];
  }

  /* Το κουμπί δίπλα στην παραπομπή. Το φτιάχνει ΕΔΩ ο θεατής και όχι ο καλών,
     ώστε η όψη και ο τίτλος να αλλάζουν σε ΕΝΑ σημείο. */
  function button(id) {
    return has(id)
      ? '<button type="button" class="gv-src" data-src="' + esc(id) + '" title="Η σελίδα του εγχειριδίου, με την παραπομπή φωτισμένη">⌖</button>'
      : "";
  }

  window.PdfView = { ready: ready, has: has, open: open, close: close, button: button, block: block, _s: S };
})();
