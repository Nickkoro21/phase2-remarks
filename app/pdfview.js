/* ════════════════════════════════════════════════════════════════════════════
   ΒΗΜΑ Γ — Ο ΘΕΑΤΗΣ ΤΗΣ ΠΗΓΗΣ                                   (05/11/2026)
   ════════════════════════════════════════════════════════════════════════════

   ΤΙ ΛΥΝΕΙ. Μέχρι σήμερα η παραπομπή του Συμβούλου ήταν ΚΕΙΜΕΝΟ: ένα `[ft-123]`
   και από κάτω ένα απόσπασμα «ΑΥΤΟΛΕΞΕΙ». Για να επαληθεύσει κανείς ότι το
   απόσπασμα λέει όντως αυτό που λέει, έπρεπε να ανοίξει το PDF με το χέρι, να
   βρει τη σελίδα και να διαβάσει. Δηλαδή: ΕΜΠΙΣΤΕΥΟΣΟΥΝ το αντίγραφο.

   Εδώ η παραπομπή γίνεται ΤΟΠΟΘΕΣΙΑ. Το `data/grounding.json` κρατά, για 468
   αναγνωριστικά, σε ποιο εγχειρίδιο και σε ποια σελίδα ζουν — και τα ΚΟΥΤΙΑ των
   γραμμών τους. Ο θεατής ανοίγει εκείνη τη σελίδα του ΠΡΑΓΜΑΤΙΚΟΥ εγγράφου και
   φωτίζει τις γραμμές. Δεν διαβάζεις τι είπε ο Σύμβουλος ότι γράφει ο
   κανονισμός· βλέπεις τον κανονισμό.

   ΤΑ ΚΟΥΤΙΑ ΕΙΝΑΙ ΚΛΑΣΜΑΤΑ ΣΕΛΙΔΑΣ (0..1), με αρχή πάνω-αριστερά. Αυτό ΔΕΝ
   είναι λεπτομέρεια: σημαίνει ότι το ίδιο κουτί ισχύει σε κάθε zoom, σε κάθε
   πυκνότητα οθόνης και σε κάθε πλάτος παραθύρου — το στρώνουμε με ποσοστά πάνω
   από τον καμβά και δεν ξαναϋπολογίζεται ΠΟΤΕ. Είναι και η σύμβαση του ADE,
   οπότε αν κάποτε περάσουμε τους πίνακες από εκεί, ο κώδικας εδώ δεν αλλάζει.

   ΤΟ pdf.js ΕΡΧΕΤΑΙ ΑΠΟ CDN, ΚΑΙ ΕΙΝΑΙ ΑΠΟΦΑΣΗ. Η εφαρμογή δεν έχει CSP που να
   το εμποδίζει, και το κλειστό δίκτυο βγήκε από τον σχεδιασμό στις 04/11
   («ό,τι κάνουμε, το κάνουμε για να έχει ίντερνετ»). Η εναλλακτική — τοπικό
   αντίγραφο — θα ήθελε 1,4 MB μέσα στο δημόσιο repo ΚΑΙ νέα επέκταση στη λίστα
   του server. Αν πέσει το CDN, ο θεατής το λέει καθαρά και δίνει το κουμπί
   «άνοιγμα σε νέα καρτέλα»: η πηγή μένει προσβάσιμη ακόμη κι όταν ο θεατής όχι.

   ΤΙΠΟΤΑ ΔΕΝ ΦΟΡΤΩΝΕΤΑΙ ΠΡΙΝ ΧΡΕΙΑΣΤΕΙ. Το ευρετήριο (300 KB) κατεβαίνει μία
   φορά, όταν ανοίξει η καρτέλα του Συμβούλου· το pdf.js και το ίδιο το PDF μόνο
   στο πρώτο άνοιγμα. Και επειδή ο server σερβίρει με Range, το pdf.js παίρνει
   ΜΟΝΟ τη σελίδα που δείχνει — όχι τα 3,6 MB του εγχειριδίου.
   ════════════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  var INDEX_URL = "../data/grounding.json";
  var PDF_BASE = "../pdf/";

  /* Η ΕΚΔΟΣΗ ΕΙΝΑΙ ΚΑΡΦΩΤΗ, ΟΧΙ «latest». Ένα CDN που αλλάζει έκδοση από κάτω
     σου είναι σπασμένη εφαρμογή χωρίς commit. Η 3.11.174 είναι η τελευταία της
     σειράς 3 — κλασικό script, χωρίς modules, δουλεύει και σε κινητό. */
  var PDFJS_VER = "3.11.174";
  var PDFJS_LIB = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/" + PDFJS_VER + "/pdf.min.js";
  var PDFJS_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/" + PDFJS_VER + "/pdf.worker.min.js";

  var CSS = '\
#gv-back { position: fixed; inset: 0; z-index: 9000; background: rgba(0,0,0,.55); display: flex; }\
#gv-panel { position: relative; margin: auto; display: flex; flex-direction: column; width: min(960px, 96vw);\
  height: min(94vh, 1100px); background: var(--panel, #11161d); color: var(--text, #e6edf3);\
  border: 1px solid var(--line, #30363d); border-radius: 14px; box-shadow: 0 18px 60px rgba(0,0,0,.6); overflow: hidden; }\
#gv-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 9px 12px;\
  border-bottom: 1px solid var(--line, #30363d); background: var(--panel-2, #161b22); font-size: 12.5px; }\
#gv-head .gv-t { font-weight: 600; color: var(--text, #e6edf3); }\
#gv-head .gv-m { color: var(--muted, #8b949e); }\
#gv-head .gv-sp { flex: 1 1 auto; }\
.gv-b { font: inherit; font-size: 12.5px; cursor: pointer; color: var(--text, #e6edf3); background: var(--bg-2, #0d1117);\
  border: 1px solid var(--line, #30363d); border-radius: 8px; padding: 4px 10px; }\
.gv-b:hover { border-color: var(--accent, #58a6ff); color: var(--accent, #58a6ff); }\
.gv-b:disabled { opacity: .4; cursor: default; border-color: var(--line, #30363d); color: var(--muted, #8b949e); }\
#gv-scroll { flex: 1 1 auto; overflow: auto; padding: 14px; background: #3a3f46; text-align: center; }\
#gv-stage { position: relative; display: inline-block; line-height: 0; box-shadow: 0 2px 14px rgba(0,0,0,.5); }\
#gv-stage canvas { display: block; }\
.gv-box { position: absolute; background: rgba(255,214,0,.30); outline: 1.5px solid rgba(255,196,0,.95);\
  border-radius: 2px; pointer-events: none; animation: gv-pulse 1.1s ease-out 2; }\
@keyframes gv-pulse { 0% { background: rgba(255,214,0,.62); } 100% { background: rgba(255,214,0,.30); } }\
#gv-foot { padding: 7px 12px; border-top: 1px solid var(--line, #30363d); background: var(--panel-2, #161b22);\
  font-size: 11.5px; color: var(--muted, #8b949e); line-height: 1.5; }\
#gv-msg { padding: 22px; font-size: 13.5px; line-height: 1.65; color: var(--text, #e6edf3); text-align: left; }\
#gv-msg b { color: var(--text, #e6edf3); }\
#gv-msg code { font-family: Consolas, monospace; font-size: 12.5px; background: var(--bg-2, #0d1117);\
  border: 1px solid var(--line, #30363d); border-radius: 6px; padding: 2px 7px; }\
.gv-src { font: inherit; font-size: 11px; cursor: pointer; margin-left: 2px; padding: 0 5px; border-radius: 6px;\
  color: var(--muted, #8b949e); background: transparent; border: 1px solid var(--line, #30363d); vertical-align: baseline; }\
.gv-src:hover { color: var(--accent, #58a6ff); border-color: var(--accent, #58a6ff); }\
@media (max-width: 760px) {\
  #gv-panel { width: 100vw; height: 100vh; border: 0; border-radius: 0; }\
  #gv-scroll { padding: 6px; }\
  #gv-head { font-size: 12px; }\
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

  /* ── ΤΟ ΕΥΡΕΤΗΡΙΟ ──────────────────────────────────────────────────────── */
  var INDEX = null;          // το φορτωμένο grounding.json
  var indexPromise = null;

  function ready() {
    if (indexPromise) return indexPromise;
    indexPromise = fetch(INDEX_URL, { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        /* Ο έλεγχος σχήματος δεν είναι τυπικότητα: αν κάποτε αλλάξει η μορφή
           του αρχείου, θέλουμε ΣΙΩΠΗ (κανένα κουμπί) αντί για σπασμένο θεατή. */
        INDEX = (j && j.schema === "fdms-grounding-v1" && j.blocks) ? j : null;
        return !!INDEX;
      })
      .catch(function () { INDEX = null; return false; });
    return indexPromise;
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
      s.src = PDFJS_LIB;
      s.onload = function () { resolve(window.pdfjsLib); };
      s.onerror = function () { reject(new Error("cdn")); };
      document.head.appendChild(s);
    }).then(function (L) {
      if (!L) throw new Error("cdn");
      /* Ο WORKER ΚΑΤΕΒΑΙΝΕΙ ΩΣ ΚΕΙΜΕΝΟ ΚΑΙ ΓΙΝΕΤΑΙ BLOB ΙΔΙΑΣ ΠΡΟΕΛΕΥΣΗΣ.
         ΓΙΑΤΙ ΟΧΙ ΑΠΕΥΘΕΙΑΣ Η ΔΙΕΥΘΥΝΣΗ ΤΟΥ CDN: ο browser ΔΕΝ δέχεται
         `new Worker(<ξένη προέλευση>)`. ΓΙΑΤΙ ΟΥΤΕ ΜΕ importScripts μέσα σε
         blob — το κλασικό κόλπο: ΜΕΤΡΗΘΗΚΕ ΟΤΙ ΣΠΑΕΙ. Στη δοκιμή της 05/11 ο
         worker πέθανε με «An unknown error occurred when fetching the script»
         και το pdf.js έμεινε σε κατάσταση όπου το `getPage` απαντούσε αλλά το
         `render` ΔΕΝ ΤΕΛΕΙΩΝΕ ΠΟΤΕ — σελίδα που γυρίζει για πάντα, χωρίς
         σφάλμα. Το `fetch` της ΣΕΛΙΔΑΣ περνά κανονικά (το cdnjs στέλνει CORS),
         οπότε φέρνουμε τον κώδικα εδώ και τον δίνουμε στον worker από μνήμη:
         καμία ξένη προέλευση δεν ζητείται μέσα από τον worker.
         Αν αποτύχει και αυτό, βάζουμε τη διεύθυνση ωμή — χειρότερα από το να
         μην παίξει δεν γίνεται, και τουλάχιστον το λέει. */
      return fetch(PDFJS_WORKER)
        .then(function (r) { if (!r.ok) throw new Error("worker " + r.status); return r.text(); })
        .then(function (src) {
          L.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([src], { type: "application/javascript" }));
          return L;
        })
        .catch(function () { L.GlobalWorkerOptions.workerSrc = PDFJS_WORKER; return L; });
    });
    return libPromise;
  }

  /* Ένα έγγραφο ανά εγχειρίδιο, ΜΙΑ φορά. Το pdf.js κρατά τη δομή του αρχείου
     και ζητά με Range μόνο ό,τι λείπει — η δεύτερη παραπομπή στο ίδιο εγχειρίδιο
     ανοίγει ακαριαία. */
  var DOCS = {};
  function doc(pdfId) {
    if (DOCS[pdfId]) return DOCS[pdfId];
    DOCS[pdfId] = lib().then(function (L) {
      return L.getDocument({ url: PDF_BASE + encodeURIComponent(pdfId), withCredentials: true }).promise;
    }).catch(function (e) { delete DOCS[pdfId]; throw e; });
    return DOCS[pdfId];
  }

  /* ── Η ΚΑΤΑΣΤΑΣΗ ΤΟΥ ΘΕΑΤΗ ─────────────────────────────────────────────── */
  var S = { open: false, id: null, b: null, page: 1, pages: 0, zoom: 1, doc: null, token: 0, returnTo: null };

  function el(id) { return document.getElementById(id); }

  function shell() {
    style();
    if (el("gv-back")) return;
    var back = document.createElement("div");
    back.id = "gv-back";
    back.setAttribute("role", "dialog");
    back.setAttribute("aria-modal", "true");
    back.setAttribute("aria-label", "Η σελίδα της πηγής");
    back.innerHTML =
      '<div id="gv-panel">' +
        '<div id="gv-head">' +
          '<span class="gv-t" id="gv-title">—</span>' +
          '<span class="gv-m" id="gv-sub"></span>' +
          '<span class="gv-sp"></span>' +
          '<button type="button" class="gv-b" id="gv-prev" title="Προηγούμενη σελίδα (←)">‹</button>' +
          '<span class="gv-m" id="gv-pg">—</span>' +
          '<button type="button" class="gv-b" id="gv-next" title="Επόμενη σελίδα (→)">›</button>' +
          '<button type="button" class="gv-b" id="gv-out" title="Σμίκρυνση">−</button>' +
          '<button type="button" class="gv-b" id="gv-in" title="Μεγέθυνση">+</button>' +
          '<button type="button" class="gv-b" id="gv-tab" title="Ανοίγει το PDF σε νέα καρτέλα του browser">⧉</button>' +
          '<button type="button" class="gv-b" id="gv-x" title="Κλείσιμο (Esc)">✕</button>' +
        '</div>' +
        '<div id="gv-scroll"><div id="gv-stage"></div></div>' +
        '<div id="gv-foot"></div>' +
      '</div>';
    document.body.appendChild(back);

    back.addEventListener("click", function (ev) {
      if (ev.target === back) { close(); return; }                 // κλικ στο σκοτάδι
      var t = ev.target.closest ? ev.target.closest("button") : null;
      if (!t) return;
      if (t.id === "gv-x") close();
      else if (t.id === "gv-prev") go(S.page - 1);
      else if (t.id === "gv-next") go(S.page + 1);
      else if (t.id === "gv-in") zoom(0.25);
      else if (t.id === "gv-out") zoom(-0.25);
      else if (t.id === "gv-tab" && S.b) window.open(PDF_BASE + encodeURIComponent(S.b.pdf_id) + "#page=" + S.page, "_blank", "noopener");
    });
    /* ΑΛΛΑΞΕ ΤΟ ΠΛΑΤΟΣ — ΞΑΝΑΖΩΓΡΑΦΙΣΕ. Ο καμβάς ζωγραφίζεται ΜΙΑ φορά, στο
       πλάτος που βρήκε· αν γυρίσει το κινητό ή αλλάξει το παράθυρο, η σελίδα θα
       έμενε στο παλιό μέγεθος (μικροσκοπική ή κομμένη). Με καθυστέρηση, γιατί
       το resize στέλνει δεκάδες συμβάντα και κάθε ζωγραφιά είναι ακριβή. */
    var rt = null;
    window.addEventListener("resize", function () {
      if (!S.open || !S.doc) return;
      clearTimeout(rt);
      rt = setTimeout(function () {
        var sc = el("gv-scroll");
        if (S.open && S.doc && sc && sc.clientWidth && sc.clientWidth !== S.drawnAt) draw();
      }, 180);
    });
    document.addEventListener("keydown", function (ev) {
      if (!S.open) return;
      if (ev.key === "Escape") { ev.preventDefault(); close(); }
      else if (ev.key === "ArrowLeft") { ev.preventDefault(); go(S.page - 1); }
      else if (ev.key === "ArrowRight") { ev.preventDefault(); go(S.page + 1); }
    });
  }

  function msg(html) {
    var stage = el("gv-stage");
    if (stage) stage.innerHTML = '<div id="gv-msg">' + html + "</div>";
  }

  function head(title, sub, foot) {
    if (el("gv-title")) el("gv-title").textContent = title;
    if (el("gv-sub")) el("gv-sub").textContent = sub || "";
    if (el("gv-foot")) el("gv-foot").innerHTML = foot || "";
    if (el("gv-pg")) el("gv-pg").textContent = S.pages ? S.page + " / " + S.pages : "—";
    if (el("gv-prev")) el("gv-prev").disabled = !(S.pages && S.page > 1);
    if (el("gv-next")) el("gv-next").disabled = !(S.pages && S.page < S.pages);
  }

  function zoom(d) {
    S.zoom = Math.max(0.5, Math.min(3, Math.round((S.zoom + d) * 100) / 100));
    draw();
  }

  function go(p) {
    if (!S.pages || p < 1 || p > S.pages || p === S.page) return;
    S.page = p;
    draw();
  }

  /* ── Η ΖΩΓΡΑΦΙΚΗ ───────────────────────────────────────────────────────── */
  function draw() {
    var stage = el("gv-stage"), scroll = el("gv-scroll");
    if (!stage || !S.doc) return;
    var my = ++S.token;                       // το κουπόνι: αργή σελίδα που γύρισε
    head(headTitle(), headSub());             // μετά από άλλη, δεν ζωγραφίζει πάνω της
    S.doc.getPage(S.page).then(function (page) {
      if (my !== S.token || !S.open) return;
      /* ΠΛΑΤΟΣ ΠΟΥ ΧΩΡΑΕΙ, ΕΠΙ ΤΟ ΖΟΥΜ. Το `scale: 1` του pdf.js είναι 72 dpi —
         μικροσκοπικό σε οθόνη. Υπολογίζουμε πόσο χρειάζεται για να γεμίσει το
         διαθέσιμο πλάτος και από εκεί και πέρα το ζουμ είναι πολλαπλασιαστής. */
      var avail = Math.max(240, (scroll ? scroll.clientWidth : 800) - 28);
      S.drawnAt = scroll ? scroll.clientWidth : 0;
      var base = page.getViewport({ scale: 1 });
      var scale = (avail / base.width) * S.zoom;
      var vp = page.getViewport({ scale: scale });
      /* Ο καμβάς σε ΦΥΣΙΚΑ pixel (devicePixelRatio) και σε CSS pixel το μέγεθος:
         αλλιώς σε οθόνη retina ή σε κινητό το κείμενο βγαίνει θολό. */
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var cv = document.createElement("canvas");
      cv.width = Math.floor(vp.width * dpr);
      cv.height = Math.floor(vp.height * dpr);
      cv.style.width = Math.floor(vp.width) + "px";
      cv.style.height = Math.floor(vp.height) + "px";
      var ctx = cv.getContext("2d");
      ctx.scale(dpr, dpr);
      return page.render({ canvasContext: ctx, viewport: vp }).promise.then(function () {
        if (my !== S.token || !S.open) return;
        stage.innerHTML = "";
        stage.style.width = Math.floor(vp.width) + "px";
        stage.appendChild(cv);
        boxes(stage);
      });
    }).catch(function (e) {
      if (my !== S.token) return;
      msg("<b>Η σελίδα δεν ζωγραφίστηκε.</b><br>" + esc(String(e && e.message || e)));
    });
  }

  function boxes(stage) {
    var b = S.b;
    if (!b || !b.boxes || !b.boxes.length) return;
    /* ΜΟΝΟ στη σελίδα της παραπομπής. Αν ο χρήστης γυρίσει σελίδα, τα κουτιά
       δεν τον ακολουθούν — θα έδειχναν τοποθεσία που δεν ισχύει εκεί. */
    for (var i = 0; i < b.boxes.length; i++) {
      var k = b.boxes[i];
      if ((k.page || b.page) !== S.page) continue;
      var d = document.createElement("div");
      d.className = "gv-box";
      d.style.left = (k.xmin * 100) + "%";
      d.style.top = (k.ymin * 100) + "%";
      d.style.width = ((k.xmax - k.xmin) * 100) + "%";
      d.style.height = ((k.ymax - k.ymin) * 100) + "%";
      stage.appendChild(d);
    }
  }

  function headTitle() {
    var b = S.b;
    return b ? (b.pdf || b.pdf_id) : "—";
  }

  function headSub() {
    var b = S.b;
    if (!b) return "";
    var bits = [];
    if (b.ref) bits.push(b.ref);
    if (b.page_printed) bits.push("τυπωμένη σελ. " + b.page_printed);
    if (S.page !== b.page) bits.push("η παραπομπή είναι στη σελ. " + b.page);
    return bits.join(" · ");
  }

  function footer() {
    var b = S.b;
    if (!b) return "";
    /* ΤΟ «ΠΩΣ» ΔΕΝ ΚΡΥΒΕΤΑΙ. Το ευρετήριο ξέρει με ποιον τρόπο εντοπίστηκε η
       κάθε παραπομπή — ακριβές ταίριασμα, κομμένο άγκιστρο, ή αναζήτηση ανά
       λέξη. Όποιος κρίνει μαθητή με βάση αυτό πρέπει να ξέρει πόσο σφιχτό ήταν
       το ταίριασμα, ΟΧΙ να βλέπει ένα κίτρινο κουτί και να το πιστεύει. */
    /* Το `how` του ευρετηρίου είναι σύνθετο: «βάση[@μήκος άγκιστρου]
       [(σελ.±απόσταση)]», π.χ. `no-prefix@120` ή `direct (σελ.±95)`. Το
       ξεδιπλώνουμε σε ελληνικά — και το «άλλη σελίδα» ΔΕΝ πάει στα ψιλά: αν ο
       εντοπισμός βρέθηκε αλλού από εκεί που δήλωνε το corpus, αυτό είναι
       ακριβώς η πληροφορία που θέλει όποιος επαληθεύει. */
    var raw = String(b.how || "");
    var shift = /\(σελ\.±(\d+)\)/.exec(raw);
    var hook = /@(\d+)/.exec(raw);
    var base = raw.split("@")[0].split(" (")[0];
    var NAMES = { "direct": "ακριβές ταίριασμα", "words": "ανά λέξη — χαλαρό",
                  "no-prefix": "χωρίς το πρόθεμα της παραπομπής",
                  "before-ellipsis": "μέχρι τα αποσιωπητικά" };
    var how = NAMES[base] || base;
    if (hook) how += ", με τα πρώτα " + hook[1] + " χαρακτήρες";
    return "<b>" + esc(S.id) + "</b> · εντοπίστηκε: " + esc(how) +
           " · corpus: " + esc(b.corpus || "—") +
           (shift ? " · <b>⚠ σε ΑΛΛΗ σελίδα από όση δήλωνε το corpus (" + esc(shift[1]) + " σελίδες μακριά)</b>" : "") +
           " · τα κουτιά δείχνουν τις ΓΡΑΜΜΕΣ του αποσπάσματος, όχι λέξη προς λέξη.";
  }

  /* ── ΑΝΟΙΓΜΑ / ΚΛΕΙΣΙΜΟ ────────────────────────────────────────────────── */
  function open(id) {
    shell();
    var b = block(id);
    S.open = true;
    S.id = id;
    S.b = b;
    S.zoom = 1;
    S.pages = 0;
    S.doc = null;
    S.token++;
    S.returnTo = document.activeElement;
    el("gv-back").style.display = "flex";
    var x = el("gv-x"); if (x) x.focus();

    if (!b) {
      head("—", "", "");
      msg("<b>Αυτή η παραπομπή δεν έχει τοποθεσία στο ευρετήριο.</b><br>" +
          "Το <code>data/grounding.json</code> κάλυψε 468 από τα 482 αναγνωριστικά· " +
          "όσα λείπουν είναι κυρίως <b>πίνακες</b>, που το κείμενό τους δεν ταιριάζει γραμμικά με τη σελίδα.");
      return;
    }
    S.page = b.page;
    head(headTitle(), headSub(), footer());
    msg("Άνοιγμα του εγγράφου…");
    var my = S.token;
    doc(b.pdf_id).then(function (d) {
      if (my !== S.token || !S.open) return;
      S.doc = d;
      S.pages = d.numPages;
      if (S.page < 1 || S.page > S.pages) S.page = 1;
      draw();
      head(headTitle(), headSub(), footer());
    }).catch(function (e) {
      if (my !== S.token) return;
      var cdn = String(e && e.message) === "cdn";
      head(headTitle(), headSub(), footer());
      msg(cdn
        ? ("<b>Ο θεατής δεν φόρτωσε.</b> Το <code>pdf.js</code> έρχεται από το cdnjs και δεν απάντησε — " +
           "χωρίς ίντερνετ ο θεατής δεν δουλεύει, το έγγραφο όμως ναι:<br><br>" +
           '<button type="button" class="gv-b" id="gv-tab2">⧉ Άνοιγμα του PDF σε νέα καρτέλα</button>')
        : ("<b>Το έγγραφο δεν άνοιξε.</b> Ο server απάντησε: " + esc(String(e && e.message || e)) +
           "<br><br>Αν λέει 404, λείπει το αρχείο από τη ρίζα <code>D:\\FDMS</code> ή ο server τρέχει " +
           "παλιά έκδοση — θέλει <code>Restart-Service fdms-app</code>."));
      var b2 = el("gv-tab2");
      if (b2) b2.onclick = function () { window.open(PDF_BASE + encodeURIComponent(S.b.pdf_id) + "#page=" + S.page, "_blank", "noopener"); };
    });
  }

  function close() {
    if (!S.open) return;
    S.open = false;
    S.token++;
    var back = el("gv-back");
    if (back) back.style.display = "none";
    var stage = el("gv-stage");
    if (stage) stage.innerHTML = "";              // ο καμβάς είναι δεκάδες MB σε μνήμη
    try { if (S.returnTo && S.returnTo.focus) S.returnTo.focus(); } catch (e) { /* έφυγε από το DOM */ }
    S.returnTo = null;
  }

  /* Το κουμπί που μπαίνει δίπλα σε μια παραπομπή. Το φτιάχνει ΕΔΩ ο θεατής και
     όχι ο καλών, ώστε η όψη και ο τίτλος να αλλάζουν σε ΕΝΑ σημείο. */
  function button(id) {
    return has(id)
      ? '<button type="button" class="gv-src" data-src="' + esc(id) + '" title="Η σελίδα του εγχειριδίου, με την παραπομπή φωτισμένη">⌖</button>'
      : "";
  }

  window.PdfView = { ready: ready, has: has, open: open, close: close, button: button, block: block };
})();
