/* Δοκιμές της ΣΥΓΧΩΝΕΥΣΗΣ πάνω στο ΑΛΗΘΙΝΟ app/schedstore.js (20/10/2026).
 *
 * Τι προστατεύουν: ότι ένα pull δεν ξαναπετά δουλειά, ότι μια διαγραφή δεν
 * ανασταίνεται, ότι τα ΠΑΛΙΑ δεδομένα (χωρίς σφραγίδα) συμπεριφέρονται όπως
 * πάντα, και ότι οι ταφόπλακες δεν ξεμυτίζουν ποτέ στους ζωντανούς πίνακες.
 *
 *   node tools/test_scheduler_merge.js        (μηδέν εξαρτήσεις)
 */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");

/* ── ελάχιστο περιβάλλον browser ─────────────────────────────────────────── */
function makeSandbox() {
  const mem = {};
  const node = () => ({
    id: "", value: "", textContent: "", innerHTML: "", style: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    setAttribute() {}, getAttribute: () => null, removeAttribute() {},
    appendChild() {}, remove() {}, addEventListener() {}, querySelector: () => null,
    querySelectorAll: () => [], insertAdjacentHTML() {}, focus() {}, closest: () => null,
  });
  const sb = {
    console, setTimeout, clearTimeout, setInterval, clearInterval, Date, Math, JSON,
    String, Number, Array, Object, Map, Set, Promise, Error, isNaN, parseInt, parseFloat,
    localStorage: {
      getItem: (k) => (k in mem ? mem[k] : null),
      setItem: (k, v) => { mem[k] = String(v); },
      removeItem: (k) => { delete mem[k]; },
    },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    document: {
      readyState: "complete", body: node(), head: node(), documentElement: node(),
      getElementById: () => null, createElement: () => node(),
      addEventListener() {}, querySelector: () => null, querySelectorAll: () => [],
    },
    fetch: () => Promise.reject(new Error("no network in test")),
    crypto: {},
    MutationObserver: function () { this.observe = () => {}; this.disconnect = () => {}; },
    requestAnimationFrame: (fn) => setTimeout(fn, 0),
    navigator: { userAgent: "test" },
    location: { hostname: "127.0.0.1", origin: "http://127.0.0.1" },
    TextEncoder: function () { this.encode = (s) => Buffer.from(String(s)); },
    btoa: (s) => Buffer.from(s, "binary").toString("base64"),
    atob: (s) => Buffer.from(s, "base64").toString("binary"),
  };
  sb.window = sb; sb.globalThis = sb; sb._mem = mem;
  /* Ο χώρος φαίνεται ΗΔΗ φυτεμένος, ώστε η boot() να μην πάει στο δίκτυο. */
  mem["p2r-sch-meta"] = JSON.stringify({ schema: "scheduler-store-v1", saved_at: "2026-10-20T00:00:00.000Z" });
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "app", "schedstore.js"), "utf8"), sb, { filename: "schedstore.js" });
  /* Το κλείδωμα επεξεργασίας ανοιχτό: εδώ δοκιμάζουμε τη ΣΥΓΧΩΝΕΥΣΗ, όχι την
     πύλη — και η πύλη έχει τις δικές της δοκιμές στην εφαρμογή. */
  sb.window.SchedEdit = { on: () => true, refuse() {}, subscribe: () => () => {} };
  return sb;
}

let pass = 0, fail = 0;
function is(name, got, want) {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) { pass++; console.log("  ok   " + name); }
  else { fail++; console.log("FAIL   " + name + "\n        πήρα:  " + a + "\n        ήθελα: " + b); }
}
const S = () => makeSandbox().window.SchedStore;

/* ── 1. Η ΣΦΡΑΓΙΔΑ ───────────────────────────────────────────────────────── */
{
  const st = S();
  st.setActor("nick@example.gr");
  const r = st.upsert("students", { code: "SP01", class: "A" });
  is("1. η εγγραφή σφραγίζεται με ΠΟΙΟΝ", r._by, "nick@example.gr");
  is("1β. …και με ΠΟΤΕ", typeof r._u === "number" && r._u > 0, true);

  const before = r._u;
  st.upsert("students", { code: "SP01", class: "B" });
  const after = st.find("students", "SP01");
  is("1γ. η δεύτερη γραφή ανανεώνει τη σφραγίδα", after._u >= before, true);
  is("1δ. και το πεδίο άλλαξε κανονικά", after.class, "B");
}

/* ── 2. Ο ΔΡΑΣΤΗΣ ────────────────────────────────────────────────────────── */
{
  const sb = makeSandbox(), st = sb.window.SchedStore;
  is("2. χωρίς τίποτα: «editor»", st.actor(), "editor");
  sb._mem["p2r-sync-cfg"] = JSON.stringify({ device: "κινητό" });
  is("2β. με ετικέτα συσκευής", st.actor(), "device:κινητό");
  st.setActor("nick@example.gr");
  is("2γ. το email της Access νικά", st.actor(), "nick@example.gr");
  st.setActor("");
  is("2δ. και καθαρίζει πίσω στη συσκευή", st.actor(), "device:κινητό");
}

/* ── 3. Η ΡΕΠΛΙΚΑ ΔΕΝ ΣΦΡΑΓΙΖΕΙ ──────────────────────────────────────────── */
{
  const st = S();
  st.setActor("laptop@example.gr");
  st.system(() => st.upsert("students", { code: "SP09", _u: 111, _by: "phone@example.gr" }));
  const r = st.find("students", "SP09");
  is("3. η σφραγίδα που ΗΡΘΕ δεν ξαναγράφεται", [r._u, r._by], [111, "phone@example.gr"]);
}

/* ── 4. ΤΑΦΟΠΛΑΚΕΣ ───────────────────────────────────────────────────────── */
{
  const st = S();
  st.upsert("students", { code: "SP01" });
  st.upsert("students", { code: "SP02" });
  st.remove("students", "SP01");
  is("4. η εγγραφή έφυγε από τη λίστα", st.get("students").map((r) => r.code), ["SP02"]);
  is("4β. …και άφησε ίχνος", st.get("graves").map((g) => g.k), ["students:SP01"]);
  st.upsert("students", { code: "SP01" });
  is("4γ. γράφοντάς την ξανά, το ίχνος σβήνει", st.get("graves").length, 0);
}

/* ── 5. Η ΣΥΓΧΩΝΕΥΣΗ ─────────────────────────────────────────────────────── */
{
  const st = S();
  const T = Date.now();
  st.setActor("laptop@example.gr");
  /* ΜΕΣΑ σε system(): η upsert ΣΦΡΑΓΙΖΕΙ με Date.now(), οπότε μια «παλιά»
     εγγραφή δεν γίνεται να φτιαχτεί από την πόρτα του χρήστη — σωστά. */
  st.system(() => st.put("students", [
    { code: "KEEP", note: "δικό μου νεότερο", _u: T + 2000 },
    { code: "OLD", note: "δικό μου παλιό", _u: T - 2000 },
    { code: "ONLY-MINE", note: "μόνο εδώ", _u: T },
  ]));

  const rep = st.merge({
    students: [
      { code: "KEEP", note: "ξένο παλιότερο", _u: T + 1000 },
      { code: "OLD", note: "ξένο νεότερο", _u: T + 3000 },
      { code: "THEIRS", note: "μόνο εκεί", _u: T + 1200 },
    ],
  });
  const by = (c) => (st.find("students", c) || {}).note;
  is("5. το δικό μου νεότερο ΚΡΑΤΙΕΤΑΙ", by("KEEP"), "δικό μου νεότερο");
  is("5β. το ξένο νεότερο ΝΙΚΑΕΙ", by("OLD"), "ξένο νεότερο");
  is("5γ. ό,τι υπάρχει μόνο εκεί ΕΡΧΕΤΑΙ", by("THEIRS"), "μόνο εκεί");
  is("5δ. ό,τι υπάρχει μόνο εδώ ΕΠΙΖΕΙ", by("ONLY-MINE"), "μόνο εδώ");
  is("5ε. η αναφορά μετράει σωστά", [rep.keptLocal, rep.fromRemote, rep.onlyLocal], [1, 2, 1]);
}

/* ── 6. ΤΑΦΟΠΛΑΚΑ vs ΕΓΓΡΑΦΗ ─────────────────────────────────────────────── */
{
  const st = S();
  st.upsert("students", { code: "DEL", _u: 1000 });
  st.remove("students", "DEL");                       // ταφόπλακα ΤΩΡΑ (νεότερη)
  const rep = st.merge({ students: [{ code: "DEL", note: "η άλλη συσκευή την έχει ακόμη", _u: 1000 }] });
  is("6. η διαγραφή ΔΕΝ ανασταίνεται", st.find("students", "DEL"), null);
  is("6β. μετρήθηκε ως σβησμένη", rep.deleted, 1);
}
{
  const st = S();
  st.upsert("students", { code: "DEL" });
  st.remove("students", "DEL");
  const g = st.get("graves")[0];
  const rep = st.merge({ students: [{ code: "DEL", note: "ξαναγράφτηκε ΜΕΤΑ", _u: g._u + 5000 }] });
  is("6γ. εγγραφή νεότερη από την ταφόπλακα ΑΝΑΣΤΑΙΝΕΤΑΙ", (st.find("students", "DEL") || {}).note, "ξαναγράφτηκε ΜΕΤΑ");
  is("6δ. και η ταφόπλακα φεύγει", [st.get("graves").length, rep.revived], [0, 1]);
}

/* ── 7. ΠΑΛΙΑ ΔΕΔΟΜΕΝΑ (ΚΑΜΙΑ ΣΦΡΑΓΙΔΑ) — ΤΟ ΠΕΡΙΣΤΑΤΙΚΟ ΤΗΣ 28/10 ───────
   Ο αρχικός κανόνας έλεγε «σε ισοπαλία νικά το repo». Στην πράξη ο
   ιδιοκτήτης πάτησε Push, βρήκε σύγκρουση, επέλεξε pull — και το αρχείο του
   ΑΥΓΟΥΣΤΟΥ βρέθηκε να υπερισχύει εγγραφών του ΟΚΤΩΒΡΙΟΥ, επειδή καμία δεν
   είχε σφραγίδα. Η απουσία σφραγίδας ΔΕΝ είναι απόδειξη παλαιότητας· είναι
   απουσία πληροφορίας. Όταν δεν ξέρεις, δεν καταστρέφεις.                   */
{
  const st = S();
  st.system(() => st.put("students", [{ code: "A", note: "τοπικό άσφραγιστο" }]));
  st.merge({ students: [{ code: "A", note: "απομακρυσμένο άσφραγιστο" }] });
  is("7. ισοπαλία χωρίς σφραγίδες: ΚΡΑΤΙΕΤΑΙ ΤΟ ΤΟΠΙΚΟ",
     (st.find("students", "A") || {}).note, "τοπικό άσφραγιστο");

  /* …αλλά ΑΥΣΤΗΡΑ νεότερο απομακρυσμένο εξακολουθεί να νικά, */
  st.merge({ students: [{ code: "A", note: "απομακρυσμένο ΜΕ σφραγίδα", _u: Date.now() }] });
  is("7β. σφραγισμένο ξένο νικά το άσφραγιστο τοπικό",
     (st.find("students", "A") || {}).note, "απομακρυσμένο ΜΕ σφραγίδα");

  /* …και ό,τι δεν υπάρχει καθόλου τοπικά, έρχεται κανονικά. */
  st.merge({ students: [{ code: "B", note: "καινούργιο από το repo" }] });
  is("7γ. εγγραφή που λείπει τοπικά ΕΡΧΕΤΑΙ",
     (st.find("students", "B") || {}).note, "καινούργιο από το repo");
}

/* ── 8. CONFIG ΑΝΑ ΚΛΕΙΔΙ ────────────────────────────────────────────────── */
{
  const st = S();
  st.setConfig({ editor_lock: { hash: "ΔΙΚΟ ΜΟΥ" } });
  const mine = st.get("config")._u.editor_lock;
  st.merge({ config: {
    editor_lock: { hash: "ΞΕΝΟ ΠΑΛΙΟ" },
    bridge: { url: "https://example" },
    _u: { editor_lock: mine - 1000, bridge: mine + 1000 },
    _by: { editor_lock: "other", bridge: "other" },
  } });
  is("8. το δικό μου νεότερο κλειδί μένει", st.cfg("editor_lock").hash, "ΔΙΚΟ ΜΟΥ");
  is("8β. το ξένο νεότερο κλειδί μπαίνει", st.cfg("bridge").url, "https://example");
  is("8γ. μία ρύθμιση δεν σβήνει την άλλη", !!(st.cfg("editor_lock") && st.cfg("bridge")), true);
}

/* ── 9. ΤΑ ΙΧΝΗ ΔΕΝ ΞΕΜΥΤΙΖΟΥΝ ΠΟΥΘΕΝΑ ──────────────────────────────────── */
{
  const st = S();
  st.upsert("students", { code: "X" });
  st.remove("students", "X");
  is("9. ο ζωντανός πίνακας είναι καθαρός", st.get("students").length, 0);
  is("9β. το στιγμιότυπο ΟΜΩΣ τα κουβαλά (αλλιώς δεν ταξιδεύουν)",
     st.snapshot().graves.length, 1);
}

/* ── 10. Ο ΚΩΔΙΚΟΣ ΚΑΙ Ο ΔΙΑΚΟΠΤΗΣ ΤΗΣ ΓΕΦΥΡΑΣ ΔΕΝ ΤΑΞΙΔΕΥΟΥΝ ───────────────
   Η 28η/10 με μία πρόταση: το `config` ταξίδεψε ολόκληρο, μαζί του ο
   `live: true` ΜΕ τον κωδικό, και η γέφυρα οπλίστηκε μόνη της σε συσκευή με
   φυτεμένα δεδομένα — 1085 ψεύτικες γραμμές στο Wings Ahead σε 110 δευτερόλεπτα.
   Αυτές οι τέσσερις δοκιμές είναι το φράγμα, και η 10γ είναι η σημαντική: χωρίς
   αυτήν η διόρθωση θα ζούσε μέχρι το πρώτο pull από το ΠΑΛΙΟ αρχείο του repo. */
{
  const st = S();
  st.setConfig({ bridge: {
    url: "https://wa.example", anon: "anon-public", token: "ΜΥΣΤΙΚΟ", live: true,
    configured_at: "2026-08-28",
  } });

  const snap = st.snapshot();
  is("10α. το στιγμιότυπο ΔΕΝ κουβαλά τον κωδικό", snap.config.bridge.token, undefined);
  is("10β. …ούτε τον διακόπτη Live", snap.config.bridge.live, undefined);
  is("10β2. …αλλά κρατά ό,τι είναι δημόσιο", snap.config.bridge.url, "https://wa.example");
  is("10β3. …και τον anon", snap.config.bridge.anon, "anon-public");
}
{
  /* ΤΟ ΠΑΛΙΟ ΑΡΧΕΙΟ ΤΟΥ REPO: γράφτηκε πριν την αλλαγή και ΕΧΕΙ τα δύο μέσα.
     Έρχεται με ΝΕΟΤΕΡΗ σφραγίδα, δηλαδή κερδίζει καθαρά τη συγχώνευση — και
     παρ' όλα αυτά δεν επιτρέπεται να φέρει ούτε κωδικό ούτε άδεια. */
  const st = S();
  st.setConfig({ bridge: { url: "https://old.example", anon: "a" } });
  const mine = st.get("config")._u.bridge;
  st.merge({ config: {
    bridge: { url: "https://wa.example", anon: "anon-public", token: "ΜΥΣΤΙΚΟ", live: true },
    _u: { bridge: mine + 5000 },
    _by: { bridge: "η μολυσμένη συσκευή" },
  } });
  const got = st.cfg("bridge");
  is("10γ. ΤΟ PULL ΔΕΝ ΞΑΝΑΟΠΛΙΖΕΙ: κανένας κωδικός", got.token, undefined);
  is("10γ2. …και καμία άδεια Live", got.live, undefined);
  is("10γ3. …ενώ το δημόσιο μέρος πέρασε κανονικά", got.url, "https://wa.example");
}

console.log("\n" + pass + " πέρασαν, " + fail + " απέτυχαν");
process.exit(fail ? 1 : 0);
