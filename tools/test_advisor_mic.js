/* Δοκιμή του ΒΗΜΑΤΟΣ 1 πάνω στο ΑΛΗΘΙΝΟ app/advisor.js — όχι σε αντίγραφο.
   Φορτώνει το αρχείο με ελάχιστο DOM και οδηγεί μια ψεύτικη μηχανή
   αναγνώρισης, αναπαράγοντας ό,τι κάνει το Chrome του Android. */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");

/* ── ελάχιστο DOM ────────────────────────────────────────────────────────── */
function node(id, tag) {
  return {
    id: id, tagName: tag || "DIV", value: "", textContent: "", innerHTML: "",
    _attr: {}, classList: { _s: new Set(),
      add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
      toggle(c, on) { on ? this._s.add(c) : this._s.delete(c); },
      contains(c) { return this._s.has(c); } },
    setAttribute(k, v) { this._attr[k] = v; }, getAttribute(k) { return this._attr[k] != null ? this._attr[k] : null; },
    removeAttribute(k) { delete this._attr[k]; },
    appendChild() {}, remove() {}, closest() { return null; },
    querySelector() { return null; }, addEventListener() {},
  };
}
const NODES = { "sym-q": node("sym-q", "TEXTAREA"), "sym-interim": node("sym-interim"), "sym-mic": node("sym-mic", "BUTTON") };
const store = {};
const sandbox = {
  console, setTimeout, clearTimeout, setInterval, clearInterval, Date, Math, JSON, String, Number,
  navigator: { userAgent: "test/android" },
  location: { hostname: "127.0.0.1", origin: "http://127.0.0.1:8080", href: "http://127.0.0.1:8080/" },
  localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
  document: {
    readyState: "complete", hidden: false,
    getElementById: (id) => NODES[id] || null,
    createElement: (t) => node("new", t.toUpperCase()),
    addEventListener() {}, body: node("body"), head: node("head"),
    querySelector: () => null,
  },
  fetch: () => Promise.reject(new Error("no network in test")),
  AbortController: function () { this.signal = {}; this.abort = () => {}; },
  TextDecoder: function () { this.decode = () => ""; },
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "app", "advisor.js"), "utf8"), sandbox, { filename: "advisor.js" });

const A = sandbox.window.Advisor, S = A.ui.speech, Q = NODES["sym-q"];

/* ── ψεύτικη μηχανή αναγνώρισης ──────────────────────────────────────────── */
const LIVE = [];
function FakeRec() { this.started = false; this.aborted = false; this.stopped = false; LIVE.push(this); }
FakeRec.prototype.start = function () { this.started = true; };
FakeRec.prototype.stop = function () { this.stopped = true; };
FakeRec.prototype.abort = function () { this.aborted = true; };
/* finals: πίνακας τελικών κομματιών· interim: τρέχον προσωρινό */
FakeRec.prototype.fire = function (finals, interim) {
  const results = finals.map((t) => ({ 0: { transcript: t }, isFinal: true }));
  if (interim) results.push({ 0: { transcript: interim }, isFinal: false });
  results.length = finals.length + (interim ? 1 : 0);
  this.onresult({ results: results, resultIndex: Math.max(0, results.length - 1) });
};
S.api = FakeRec;

/* ── έλεγχοι ─────────────────────────────────────────────────────────────── */
let pass = 0, fail = 0;
function is(name, got, want) {
  const ok = got === want;
  ok ? pass++ : fail++;
  console.log(`${ok ? "  ok  " : "FAIL  "}${name}` + (ok ? "" : `\n        πήρα:  ${JSON.stringify(got)}\n        ήθελα: ${JSON.stringify(want)}`));
}

/* 1. ΤΟ ΣΥΜΠΤΩΜΑ ΤΟΥ ΙΔΙΟΚΤΗΤΗ: η μηχανή του Android ξαναδίνει το ίδιο τελικό
      σε ΝΕΑ θέση καθώς μεγαλώνει. Παλιά: «ποιες ποιες ποιες είναι…» */
Q.value = "";
A._mic.start();
const r1 = LIVE[LIVE.length - 1];
r1.fire(["ποιες"], "");
r1.fire(["ποιες", "ποιες είναι"], "");
r1.fire(["ποιες", "ποιες είναι", "ποιες είναι οι απαιτήσεις"], "");
is("1. επανεκπομπή που μεγαλώνει → μία φορά", Q.value, "ποιες είναι οι απαιτήσεις");

/* 2. ΔΥΟ ΔΙΑΦΟΡΕΤΙΚΕΣ ΠΡΟΤΑΣΕΙΣ δεν συμπτύσσονται */
r1.fire(["ποιες", "ποιες είναι", "ποιες είναι οι απαιτήσεις", "και πόσες ώρες"], "");
is("2. αληθινή δεύτερη πρόταση κρατιέται", Q.value, "ποιες είναι οι απαιτήσεις και πόσες ώρες");

/* 3. ΤΟ ΠΡΟΣΩΡΙΝΟ δεν μπαίνει στο κουτί */
r1.fire(["ποιες", "ποιες είναι", "ποιες είναι οι απαιτήσεις", "και πόσες ώρες"], " για τη δοκι");
is("3. το interim μένει έξω από το κουτί", Q.value, "ποιες είναι οι απαιτήσεις και πόσες ώρες");
is("3β. το interim φαίνεται στην ένδειξη", /για τη δοκι/.test(NODES["sym-interim"].innerHTML), true);

/* 4. ΤΟ ΚΛΕΙΣΙΜΟ ΕΙΝΑΙ ΑΜΕΣΟ — δεν περιμένει το onend (που στο κινητό αργεί) */
A._mic.stop();
is("4. το ON σβήνει ΤΩΡΑ, χωρίς onend", S.on, false);
is("4β. το κουμπί ξεβάφεται", NODES["sym-mic"].classList.contains("on"), false);
is("4γ. στάλθηκε stop() στη μηχανή", r1.stopped, true);

/* 5. Η ΑΙΤΙΑ ΤΟΥ ΠΟΛΛΑΠΛΑΣΙΑΣΜΟΥ: ο κύκλος πάτα-άσε-ξαναπάτα. Η ΠΑΛΙΑ μηχανή
      στέλνει αποτέλεσμα ΜΕΤΑ το νέο πάτημα — δεν πρέπει να γράψει τίποτα. */
const before = Q.value;
A._mic.start();
const r2 = LIVE[LIVE.length - 1];
r1.fire(["ΖΟΜΠΙ ΑΠΟ ΤΗΝ ΠΑΛΙΑ ΜΗΧΑΝΗ"], "");
is("5. η παλιά μηχανή ΔΕΝ γράφει", Q.value, before);
r2.fire(["και τώρα η νέα"], "");
is("5β. η νέα μηχανή γράφει κανονικά", Q.value, before + " και τώρα η νέα");

/* 6. ΤΟ ΚΕΙΜΕΝΟ ΠΟΥ ΕΓΡΑΨΕ ΜΕ ΤΟ ΧΕΡΙ ΕΙΝΑΙ ΙΕΡΟ */
Q.value = "ΔΙΚΟ ΜΟΥ ΚΕΙΜΕΝΟ";
r2.fire(["και τώρα η νέα", "συνεχίζω να μιλάω"], "");
is("6. η χειρόγραφη αλλαγή δεν σβήνεται", Q.value, "ΔΙΚΟ ΜΟΥ ΚΕΙΜΕΝΟ συνεχίζω να μιλάω");

/* 7. ΣΙΩΠΗ ΔΕΝ ΓΙΝΕΤΑΙ ΚΕΙΜΕΝΟ (το μάθημα του is_silent) */
A._mic.stop();
Q.value = "";
A._mic.start();
const r3 = LIVE[LIVE.length - 1];
r3.fire(["α"], "");
is("7. ένας χαρακτήρας δεν μπαίνει", Q.value, "");
r3.fire(["αα"], "");
is("7β. δύο χαρακτήρες μπαίνουν", Q.value, "αα");

/* 8. ΤΟ ΚΟΛΛΗΜΕΝΟ ΜΙΚΡΟΦΩΝΟ: 30΄΄ σιωπής → κλείνει ΜΟΝΟ ΤΟΥ */
S.lastAt = Date.now() - 31000;
setTimeout(() => {
  is("8. κλείνει μόνο του στη σιωπή", S.on, false);
  is("8β. το λέει στην ένδειξη", /σιωπής/.test(NODES["sym-interim"].textContent), true);

  /* 9. ΚΑΙ ΑΝ ΤΟ onend ΔΕΝ ΕΡΘΕΙ ΠΟΤΕ: abort() αφήνει το μικρόφωνο */
  setTimeout(() => {
    is("9. abort() στάλθηκε στη μηχανή που δεν τελείωνε", r3.aborted, true);
    is("9β. καμία μηχανή δεν έμεινε τρέχουσα", S.rec, null);
    console.log(`\n${pass} πέρασαν, ${fail} απέτυχαν`);
    process.exit(fail ? 1 : 0);
  }, 1800);
}, 700);
