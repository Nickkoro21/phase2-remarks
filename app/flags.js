/* ΤΟ ΔΕΛΤΙΟ ΕΛΕΓΧΟΥ — μία σημείωση τη φορά, με το PDF δίπλα.   (07/11/2026)
   ─────────────────────────────────────────────────────────────────────────
   ΤΙ ΚΑΝΕΙ. Δείχνει κάθε σημείωση της ψηφιοποίησης με ΤΡΙΑ πράγματα μαζί:
   την αυτόματη σήμανση, ΓΙΑΤΙ μπήκε αυτή η σήμανση, και κουμπιά ⌖ για ΚΑΘΕ
   κομμάτι που αναφέρει — το δικό της και τα άλλα που κατονομάζει. Έτσι
   ο ιδιοκτήτης βλέπει «τι λέει το κείμενο στη μία περίπτωση, τι λέει στην
   άλλη» χωρίς να ψάχνει σελίδες.

   ΤΙ ΔΕΝ ΚΑΝΕΙ. Δεν γράφει σε κανένα αρχείο του repo. Οι κρίσεις ζουν στον
   browser και κατεβαίνουν ως JSON όταν τις ζητήσεις. Αυτό είναι ΕΠΙΛΟΓΗ, όχι
   περιορισμός: ένα εργαλείο ελέγχου δεν έχει δουλειά να πειράζει τα δεδομένα
   που ελέγχει. Η ενσωμάτωση γίνεται μετά, ρητά, με τα μάτια σου πάνω στο diff.

   Η ΑΥΤΟΜΑΤΗ ΣΗΜΑΝΣΗ ΔΕΝ ΕΙΝΑΙ ΚΡΙΣΗ. Βγαίνει ΜΟΝΟ από το ρητό πρόθεμα κάθε
   σημείωσης· όπου δεν υπάρχει πρόθεμα, το ⚠ ΑΛΥΤΟ είναι ΠΡΟΕΠΙΛΟΓΗ. Η κάρτα
   το γράφει κάθε φορά, για να μη διαβαστεί ως γνώμη κάτι που είναι άγνοια. */
(function () {
  "use strict";

  var SRC = "../data/flag-review-items.json";
  var KEY = "fdms-flag-review-v1";

  var MARKS = [
    { id: "⚠ ΑΛΥΤΟ",       cls: "m0", hint: "συγκρούονται — καμία ενέργεια δεν ικανοποιεί και τις δύο" },
    { id: "± ΑΠΟΚΛΙΣΗ",    cls: "m1", hint: "το λένε και οι δύο, αλλιώς — μπαίνει στην πρόταση με απόδοση" },
    { id: "✓ ΣΥΜΦΩΝΟΥΝ",   cls: "m2", hint: "λένε το ίδιο — ενίσχυση, όχι αμφιβολία" },
    { id: "○ ΣΙΩΠΗ",       cls: "m3", hint: "καμία πηγή δεν το ορίζει" },
    { id: "◇ ΑΛΛΟ ΠΕΔΙΟ",  cls: "m4", hint: "ισχύει σε άλλο Στάδιο ή κατηγορία" },
    { id: "· ΨΗΦΙΟΠΟΙΗΣΗ", cls: "m5", hint: "πώς διαβάστηκε μια τιμή, όχι τι ισχύει" },
    { id: "— ΑΔΙΑΦΟΡΟ",    cls: "m5", hint: "δεν μας πειράζει· να μη φτάνει στον agent" },
    { id: "? ΣΥΖΗΤΗΣΗ",    cls: "m0", hint: "θέλει κουβέντα — ξαναδές το" }
  ];

  var S = { items: [], view: [], i: 0, verd: {} };

  var ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return ESC[c]; }); }
  function el(id) { return document.getElementById(id); }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      S.verd = raw ? JSON.parse(raw) : {};
    } catch (e) { S.verd = {}; }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(S.verd)); }
    catch (e) { /* ιδιωτικό παράθυρο — η λήψη JSON παραμένει ο δρόμος */ }
  }

  function cls(mark) {
    for (var i = 0; i < MARKS.length; i++) if (MARKS[i].id === mark) return MARKS[i].cls;
    return "m3";
  }

  /* ΤΟ ΚΟΥΜΠΙ ΤΗΣ ΠΗΓΗΣ. Το φτιάχνει ο ΘΕΑΤΗΣ, όχι εμείς — ίδια όψη και ίδιος
     τίτλος με την εφαρμογή. Αν το id δεν έχει τοποθεσία στο ευρετήριο, ο
     θεατής γυρίζει κενό και το λέμε ρητά αντί να δείξουμε νεκρό κουμπί. */
  function srcBtn(id) {
    var b = (window.PdfView && window.PdfView.button) ? window.PdfView.button(id) : "";
    return b || '<span class="pill" title="δεν έχει τοποθεσία στο ευρετήριο">(χωρίς σελίδα)</span>';
  }

  /* ΠΟΙΟ id ΑΝΟΙΓΕΙ PDF. Το κοντινότερο στη σημείωση δεν έχει πάντα σελίδα:
     στα δέντρα απόφασης είναι ο ΚΟΜΒΟΣ (`b_ckr`), όχι το κομμάτι. Ανεβαίνουμε
     την αλυσίδα από μέσα προς τα έξω και παίρνουμε το πρώτο που ο θεατής
     αναγνωρίζει — αν κανένα, το λέμε αντί να δείξουμε νεκρό κουμπί. */
  function pdfId(it) {
    var ch = (it.chain && it.chain.length) ? it.chain : [it.owner];
    if (!window.PdfView || !window.PdfView.has) return "";
    for (var i = ch.length - 1; i >= 0; i--) if (window.PdfView.has(ch[i])) return ch[i];
    for (var j = 0; j < (it.refs || []).length; j++) if (window.PdfView.has(it.refs[j])) return it.refs[j];
    return "";
  }

  function filt() {
    var m = el("fMark").value, f = el("fFile").value, st = el("fState").value;
    var pdf = el("fPdf").value;
    S.view = S.items.filter(function (it) {
      if (m && it.mark !== m) return false;
      if (f && it.file !== f) return false;
      if (pdf === "yes" && !pdfId(it)) return false;
      if (pdf === "no" && pdfId(it)) return false;
      var done = !!S.verd[it.key];
      if (st === "todo" && done) return false;
      if (st === "done" && !done) return false;
      return true;
    });
    if (S.i >= S.view.length) S.i = Math.max(0, S.view.length - 1);
    render();
  }

  function render() {
    var card = el("card"), msg = el("msg");
    var done = 0, k;
    for (k in S.verd) if (S.verd.hasOwnProperty(k)) done++;
    el("prog").innerHTML = S.view.length
      ? ("κάρτα " + (S.i + 1) + " / " + S.view.length +
         " · έκρινα <b class=\"done\">" + done + "</b> / " + S.items.length)
      : ("έκρινα <b class=\"done\">" + done + "</b> / " + S.items.length);

    if (!S.view.length) {
      card.hidden = true; msg.hidden = false;
      msg.textContent = "Καμία σημείωση με αυτά τα φίλτρα.";
      return;
    }
    msg.hidden = true; card.hidden = false;

    var it = S.view[S.i], v = S.verd[it.key] || { mark: "", note: "" };
    var pid = pdfId(it);
    var refs = (it.refs || []).map(function (r) {
      return '<span class="pill">' + esc(r) + "</span>" + srcBtn(r);
    }).join(" &nbsp; ");

    var buttons = MARKS.map(function (m, n) {
      return '<button type="button" data-v="' + esc(m.id) + '" title="' + esc(m.hint) + '"' +
             (v.mark === m.id ? ' class="on"' : "") + ">" + esc(m.id) +
             "<kbd>" + (n + 1) + "</kbd></button>";
    }).join("");

    card.innerHTML =
      '<span class="mark ' + cls(it.mark) + '">' + esc(it.mark) + "</span>" +
      '<span class="pill" style="margin-left:10px">αυτόματη σήμανση</span>' +
      '<p class="why">' + esc(it.why) + "</p>" +
      '<div class="meta"><span><b>' + esc(it.owner) + "</b>" +
      (pid ? (pid !== it.owner ? ' <span class="pill">σελίδα του ' + esc(pid) + "</span>" : "") + srcBtn(pid)
           : ' <span class="pill" title="το αρχείο αυτό δεν περνά από το grounding — δεν υπάρχει κουτί να δείξουμε">'
             + "— χωρίς σελίδα στο ευρετήριο</span>") + "</span>" +
      "<span>" + esc(it.file) + "</span>" +
      (it.topic ? "<span>" + esc(it.topic) + "</span>" : "") +
      '<span>' + esc(it.kind === "unresolved" ? "από δέντρο απόφασης" : "σημείωση απαίτησης") + "</span></div>" +
      (it.requirement ? '<p class="req">' + esc(it.requirement) + "</p>" : "") +
      (it.source ? '<p class="req"><b>ΠΗΓΗ:</b> ' + esc(it.source) + "</p>" : "") +
      (/ΑΠΟΦΑΝΣΗ ΙΔΙΟΚΤΗΤΗ|ΑΠΟΦΑΣΗ ΙΔΙΟΚΤΗΤΗ|ΕΡΜΗΝΕΙΑ ΙΔΙΟΚΤΗΤΗ/.test(it.text)
        ? '<p class="why" style="color:#7ee787">✓ η σημείωση κουβαλά ΗΔΗ απόφανσή σου — '
          + "διάβασέ τη πριν κρίνεις</p>" : "") +
      '<div class="lab">Η σημείωση, αυτολεξεί</div>' +
      '<div class="note">' + esc(it.text) + "</div>" +
      (refs ? '<div class="lab">Τα άλλα κομμάτια που κατονομάζει</div><div>' + refs + "</div>" : "") +
      '<div class="lab">Το σχόλιό σου — η κρίση είναι στα κουμπιά κάτω</div>' +
      '<textarea id="note" placeholder="σχόλιο — γιατί· τι να γράφει ο agent αντί γι\' αυτό">' +
      esc(v.note || "") + "</textarea>";

    el("note").addEventListener("input", function () {
      var cur = S.verd[it.key] || { mark: "", note: "" };
      cur.note = this.value;
      cur.at = new Date().toISOString().slice(0, 10);
      if (!cur.mark && !cur.note) delete S.verd[it.key]; else S.verd[it.key] = cur;
      save();
    });
    /* ΤΑ ΚΟΥΜΠΙΑ ΤΗΣ ΚΡΙΣΗΣ ΖΟΥΝ ΣΤΟ ΥΠΟΣΕΛΙΔΟ, ΟΧΙ ΣΤΗΝ ΚΑΡΤΑ. Μετρήθηκε στην
       πρώτη δοκιμή: με τον θεατή ανοιχτό η κάρτα ψηλώνει και τα κουμπιά
       έπεφταν ΚΑΤΩ από το σταθερό υποσέλιδο.

       ΤΟ ΣΦΑΛΜΑ ΠΟΥ ΒΡΗΚΕ Ο ΙΔΙΟΚΤΗΤΗΣ (07/11/2026): «δεν έχω κρίνει καμία»,
       ενώ ο μετρητής έλεγε 2. Το `#verd` ζει στο υποσέλιδο και ΔΕΝ
       ξαναφτιάχνεται — μόνο το `innerHTML` του. Ο ακροατής όμως προστίθετο
       ΣΕ ΚΑΘΕ render: στην κάρτα 3 ένα κλικ έτρεχε τρεις φορές, και το
       `verdict()` είναι ΔΙΑΚΟΠΤΗΣ (ξαναπάτημα = αναίρεση). Μονός αριθμός
       κλήσεων άφηνε κρίση, ζυγός την έσβηνε — τυχαίο αποτέλεσμα, και
       ΑΟΡΑΤΟ. Ο ακροατής μπαίνει πια ΜΙΑ φορά, στο boot. */
    el("verd").innerHTML = buttons;
    el("prev").disabled = S.i <= 0;
    el("next").disabled = S.i >= S.view.length - 1;
  }

  function verdict(mark) {
    var it = S.view[S.i];
    if (!it) return;
    var cur = S.verd[it.key] || { mark: "", note: "" };
    cur.mark = (cur.mark === mark) ? "" : mark;          // ξαναπάτημα = αναίρεση
    cur.at = new Date().toISOString().slice(0, 10);
    if (!cur.mark && !cur.note) delete S.verd[it.key]; else S.verd[it.key] = cur;
    save();
    render();
  }

  function go(d) {
    if (!S.view.length) return;
    S.i = Math.max(0, Math.min(S.view.length - 1, S.i + d));
    render();
    window.scrollTo(0, 0);
  }

  function nextTodo() {
    for (var n = S.i + 1; n < S.view.length; n++) {
      if (!S.verd[S.view[n].key]) { S.i = n; render(); window.scrollTo(0, 0); return; }
    }
    go(1);
  }

  /* Η ΛΗΨΗ. Ό,τι κατεβαίνει είναι ΑΥΤΟΤΕΛΕΣ: κουβαλά το id, την αυτόματη
     σήμανση ΚΑΙ το κείμενο της σημείωσης, ώστε να διαβάζεται και χωρίς το
     δελτίο — και να φαίνεται αν η σημείωση άλλαξε από τότε που κρίθηκε. */
  function download() {
    var out = [], i, it, v;
    for (i = 0; i < S.items.length; i++) {
      it = S.items[i]; v = S.verd[it.key];
      if (!v) continue;
      out.push({ key: it.key, owner: it.owner, file: it.file, mark_auto: it.mark,
                 verdict: v.mark || "", note: v.note || "", at: v.at || "",
                 text: it.text });
    }
    var doc = { schema: "fdms-flag-verdicts-v1", at: new Date().toISOString().slice(0, 10),
                of: S.items.length, decided: out.length, verdicts: out };
    var blob = new Blob([JSON.stringify(doc, null, 1) + "\n"], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "flag-verdicts-" + doc.at.replace(/-/g, "") + ".json";
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  }

  function upload(f) {
    var r = new FileReader();
    r.onload = function () {
      try {
        var j = JSON.parse(r.result);
        var list = j && j.verdicts;
        if (!list || !list.length) { alert("Το αρχείο δεν έχει κρίσεις."); return; }
        var n = 0;
        for (var i = 0; i < list.length; i++) {
          var v = list[i];
          if (!v.key) continue;
          S.verd[v.key] = { mark: v.verdict || "", note: v.note || "", at: v.at || "" };
          n++;
        }
        save(); filt();
        alert("Φορτώθηκαν " + n + " κρίσεις.");
      } catch (e) { alert("Δεν διαβάστηκε ως JSON."); }
    };
    r.readAsText(f, "utf-8");
  }

  function fill(sel, vals) {
    for (var i = 0; i < vals.length; i++) {
      var o = document.createElement("option");
      o.value = o.textContent = vals[i];
      sel.appendChild(o);
    }
  }

  function boot(doc) {
    S.items = doc.items || [];
    var files = {}, marks = {}, i;
    for (i = 0; i < S.items.length; i++) { files[S.items[i].file] = 1; marks[S.items[i].mark] = 1; }
    fill(el("fMark"), MARKS.map(function (m) { return m.id; }).filter(function (m) { return marks[m]; }));
    fill(el("fFile"), Object.keys(files).sort());

    el("fMark").addEventListener("change", function () { S.i = 0; filt(); });
    el("fFile").addEventListener("change", function () { S.i = 0; filt(); });
    el("fState").addEventListener("change", function () { S.i = 0; filt(); });
    el("fPdf").addEventListener("change", function () { S.i = 0; filt(); });
    el("prev").addEventListener("click", function () { go(-1); });
    el("next").addEventListener("click", function () { go(1); });
    el("verd").addEventListener("click", function (ev) {
      var b = ev.target.closest ? ev.target.closest("button[data-v]") : null;
      if (b) verdict(b.dataset.v);
    });
    el("dl").addEventListener("click", download);
    el("clr").addEventListener("click", function () {
      var n = 0, k;
      for (k in S.verd) if (S.verd.hasOwnProperty(k)) n++;
      if (!n) { alert("Δεν υπάρχει καμία κρίση."); return; }
      if (!confirm("Σβήσιμο " + n + " κρίσεων. Αν δεν τις έχεις κατεβάσει, χάνονται. Σίγουρα;")) return;
      S.verd = {}; save(); filt();
    });
    el("up").addEventListener("click", function () { el("file").click(); });
    el("file").addEventListener("change", function () { if (this.files[0]) upload(this.files[0]); });

    document.addEventListener("click", function (ev) {
      var sv = ev.target.closest ? ev.target.closest("[data-src]") : null;
      if (sv && window.PdfView) { window.PdfView.open(sv.dataset.src); }
    });

    document.addEventListener("keydown", function (ev) {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName)) return;
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      if (ev.key === "ArrowLeft") { ev.preventDefault(); go(-1); }
      else if (ev.key === "ArrowRight") { ev.preventDefault(); go(1); }
      else if (ev.key === "Enter") { ev.preventDefault(); nextTodo(); }
      else if (ev.key >= "1" && ev.key <= "8") {
        var m = MARKS[+ev.key - 1];
        if (m) { ev.preventDefault(); verdict(m.id); }
      }
    });

    /* ΠΡΟΕΠΙΛΟΓΗ: ΟΣΕΣ ΑΝΟΙΓΟΥΝ PDF. Ο ιδιοκτήτης έπεσε αμέσως σε κάρτα
       `d_tot` (δέντρο απόφασης) που ΔΕΝ έχει τοποθεσία, και η πρώτη του
       αντίδραση ήταν «δεν βλέπω πώς μπορώ να ανοίξω το PDF». Σωστή: 289 από
       τις 646 δεν έχουν σελίδα, γιατί τα αρχεία τους δεν περνούν από το
       grounding. Ο έλεγχος ΜΕ το κείμενο δίπλα είναι το νόημα του εργαλείου,
       άρα αυτό δείχνουμε πρώτο — οι υπόλοιπες είναι ένα κλικ μακριά. */
    el("fPdf").value = "yes";
    load();
    filt();
  }

  load();
  fetch(SRC, { cache: "no-store" })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (j) {
      if (!j || j.schema !== "fdms-flag-review-v1") throw new Error("schema");
      /* Ο θεατής πρώτα: χωρίς το ευρετήριο τα κουμπιά ⌖ θα έβγαιναν νεκρά. */
      var p = (window.PdfView && window.PdfView.ready) ? window.PdfView.ready() : Promise.resolve(false);
      return p.then(function () { boot(j); });
    })
    .catch(function (e) {
      el("msg").innerHTML =
        "<b>Το δελτίο δεν φόρτωσε.</b><br>Λείπει το <code>data/flag-review-items.json</code>" +
        " — τρέξε <code>python tools/build_flag_review.py</code>.<br><br>" +
        "<span class=\"pill\">" + esc(String(e && e.message || e)) + "</span>";
    });
})();
