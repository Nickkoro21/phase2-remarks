/* Δοκιμές της ΥΠΟΔΟΧΗΣ πάνω στο ΑΛΗΘΙΝΟ app/schedintake.js (29/10/2026).
 *
 * Τι προστατεύουν: ότι ένα άγνωστο πεδίο δεν γίνεται σιωπηλά κενό, ότι το ίδιο
 * γεγονός δεν γράφεται δύο φορές (ούτε μέσα στο μπλοκ, ούτε απέναντι στο
 * ημερολόγιο), ότι μια διαφωνία κρατά το ΥΠΑΡΧΟΝ id ώστε να είναι ενημέρωση
 * και όχι δεύτερη σειρά, και ότι μια χαλασμένη γραμμή δεν παρασύρει τις άλλες.
 *
 * Ο πυρήνας δέχεται τον κόσμο ως όρισμα, οπότε εδώ δεν υπάρχει DOM, δεν
 * υπάρχει store και δεν φορτώνεται το flowchart:
 *
 *   node tools/test_intake.js        (μηδέν εξαρτήσεις)
 */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");

const sb = { console: console, String: String, Number: Number, Object: Object,
  Array: Array, Map: Map, Set: Set, JSON: JSON, Date: Date, Math: Math, isNaN: isNaN };
sb.window = sb; sb.globalThis = sb;
vm.createContext(sb);
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "app", "schedintake.js"), "utf8"),
  sb, { filename: "schedintake.js" });
const I = sb.window.SchedIntake;

let pass = 0, fail = 0;
function is(name, got, want) {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) { pass++; console.log("  ok   " + name); }
  else { fail++; console.log("  FAIL " + name + "\n        got  " + a + "\n        want " + b); }
}
function ok(name, cond) { is(name, !!cond, true); }

/* ── Ο ΨΕΥΤΙΚΟΣ ΚΟΣΜΟΣ ─────────────────────────────────────────────────────
   Ο κανόνας της ώρας πτήσης είναι ΑΝΤΙΓΡΑΦΟ του `SchedReady.durationValue` —
   μόνο οι ρήτρες που αγγίζει η υποδοχή. Δεν δοκιμάζεται εδώ ο κανόνας (τον
   δοκιμάζει το tools/fixtures/bridge/p15-duration.js), δοκιμάζεται ότι η
   υποδοχή τον ΡΩΤΑΕΙ και μεταφέρει το «γιατί» του αυτούσιο. */
let minted = 0;
function makeWorld(log) {
  const nodes = { "s:f4404": "flights", "s:c1101": "fs", "gt-initial": "theory", "s:e1201": "exams" };
  const ids = { f4404: "s:F4404", "s:f4404": "s:F4404", c1101: "s:C1101", "s:c1101": "s:C1101",
    "gt-initial": "GT-INITIAL", e1201: "s:E1201", "s:e1201": "s:E1201" };
  return {
    hasStudent: (c) => ["SP-14", "SP-15"].indexOf(String(c)) >= 0,
    hasInstructor: (c) => ["IP-03"].indexOf(String(c)) >= 0,
    resolveNode: (s) => ids[String(s).replace(/\s+/g, "").toLowerCase()] || null,
    kindOf: (uid) => nodes[String(uid).toLowerCase()] || null,
    durationValue: (v, was) => {
      const s = String(v == null ? "" : v).trim();
      if (!s) return { ok: true, value: null, why: "" };
      if (!/^(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)$/.test(s)) {
        return { ok: false, value: null, why: "the flight time is decimal HOURS written with a dot" };
      }
      const n = Number(s);
      if (n > 9.9) return { ok: false, value: null, why: "no single sortie of this syllabus is ten hours long" };
      return { ok: true, value: n, why: "" };
    },
    todayISO: () => "2026-10-29",
    uid: () => "ev-test-" + (++minted),
    eventsOf: (student, node, date) => (log || []).filter((e) =>
      e.scope === "student" && e.student === student && e.node === node && (e.end_date || e.date) === date),
  };
}
const L = (o) => JSON.stringify(o);

/* ── 1. Η ΚΑΘΑΡΗ ΓΡΑΜΜΗ ──────────────────────────────────────────────────── */
{
  const r = I.parse(L({ date: "2026-10-28", sp: "SP-14", node: "F4404", ip: "IP-03", dev: "T-6A", dur: "1.4" }),
    makeWorld([]));
  is("1. μία γραμμή, μία εγγραφή", r.tally, { new: 1, same: 0, clash: 0, bad: 0 });
  const rec = r.lines[0].rec;
  is("1β. ο κόμβος λύθηκε σε uid", rec.node, "s:F4404");
  is("1γ. το είδος ήρθε από τον κόσμο", rec.kind, "flights");
  is("1δ. η ώρα πτήσης είναι ΑΡΙΘΜΟΣ, όχι κείμενο", rec.duration, 1.4);
  is("1ε. το αποτέλεσμα προεπιλέγεται σε completed", rec.result, "completed");
  is("1στ. το εύρος είναι πάντα ο μαθητής", rec.scope, "student");
  ok("1ζ. είναι τικαρισμένη από προεπιλογή", r.lines[0].pick);
  /* ΚΑΘΕ ΠΕΔΙΟ ΡΗΤΑ: το upsert συγχωνεύει, άρα ένα πεδίο που λείπει κρατά ό,τι
     ήταν αποθηκευμένο — βλ. τον σχολιασμό στο judge(). */
  for (const k of ["class", "maneuvers", "note", "start_date", "end_date"]) {
    is("1η. γράφεται ρητά κενό: " + k, rec[k], "");
  }
  is("1θ. …και ρητά null το score", rec.score, null);
}

/* ── 2. ΤΟ ΑΓΝΩΣΤΟ ΠΕΔΙΟ ΟΝΟΜΑΖΕΤΑΙ ──────────────────────────────────────── */
{
  const r = I.parse(L({ date: "2026-10-28", studnet: "SP-14", node: "F4404" }), makeWorld([]));
  is("2. το δακτυλογραφικό λάθος σε όνομα πεδίου είναι ΑΡΝΗΣΗ", r.tally.bad, 1);
  ok("2β. …και η άρνηση λέει ΠΟΙΟ πεδίο", r.lines[0].why.indexOf("studnet") >= 0);
  ok("2γ. …και δεν γράφεται τίποτα", !r.lines[0].rec);
}

/* ── 3. Η ΗΜΕΡΟΜΗΝΙΑ ─────────────────────────────────────────────────────── */
{
  is("3. ISO", I.isoDate("2026-10-28"), "2026-10-28");
  is("3β. ελληνική γραφή", I.isoDate("28/10/2026"), "2026-10-28");
  is("3γ. με παύλες", I.isoDate("28-10-2026"), "2026-10-28");
  is("3δ. 31 Φεβρουαρίου ΔΕΝ είναι μέρα", I.isoDate("31/02/2026"), "");
  is("3ε. ασαφές δεν μαντεύεται", I.isoDate("Oct 28 2026"), "");
  const r = I.parse(L({ date: "2026-12-01", sp: "SP-14", node: "F4404" }), makeWorld([]));
  is("3στ. το αύριο είναι πρόγραμμα, όχι εγγραφή", r.tally.bad, 1);
  ok("3ζ. …και το λέει με το σημερινό στο χέρι", r.lines[0].why.indexOf("2026-10-29") >= 0);
}

/* ── 4. ΑΝΘΡΩΠΟΙ ΠΟΥ ΔΕΝ ΥΠΑΡΧΟΥΝ ────────────────────────────────────────── */
{
  const w = makeWorld([]);
  is("4. άγνωστος μαθητής", I.parse(L({ date: "2026-10-28", sp: "SP-99", node: "F4404" }), w).tally.bad, 1);
  is("4β. άγνωστος εκπαιδευτής", I.parse(L({ date: "2026-10-28", sp: "SP-14", node: "F4404", ip: "IP-99" }), w).tally.bad, 1);
  const r = I.parse(L({ date: "2026-10-28", sp: "SP-99", node: "F4404" }), w);
  ok("4γ. …και η υποδοχή δεν φτιάχνει ποτέ πρόσωπα", r.lines[0].why.indexOf("never creates people") >= 0);
}

/* ── 5. ΤΟ ΕΥΡΟΣ ΠΟΥ ΔΕΝ ΜΑΝΤΕΥΕΤΑΙ ──────────────────────────────────────── */
{
  const w = makeWorld([]);
  const sp = I.parse(L({ date: "2026-10-28", sp: "SP-14", node: "sp:nfs" }), w);
  ok("5. η ειδική έξοδος στέλνεται στη φόρμα", sp.lines[0].why.indexOf("through the form") >= 0);
  const bad = I.parse(L({ date: "2026-10-28", sp: "SP-14", node: "F9999" }), w);
  ok("5β. κόμβος που δεν υπάρχει στο συλλαβάριο", bad.lines[0].why.indexOf("F9999") >= 0);
  const lag = I.parse(L({ date: "2026-10-28", sp: "SP-14", node: "GT-INITIAL", res: "lag" }), w);
  ok("5γ. LAG σε θεωρία δεν είναι αποτέλεσμα", lag.lines[0].why.indexOf("flying verdict") >= 0);
  const dur = I.parse(L({ date: "2026-10-28", sp: "SP-14", node: "GT-INITIAL", dur: "1.2" }), w);
  ok("5δ. ώρα πτήσης σε θεωρία", dur.lines[0].why.indexOf("flown sortie") >= 0);
}

/* ── 6. Ο ΚΡΙΤΗΣ ΤΗΣ ΩΡΑΣ ΕΙΝΑΙ ΤΟΥ ΚΟΣΜΟΥ, ΚΑΙ ΤΟ «ΓΙΑΤΙ» ΠΕΡΝΑ ΑΥΤΟΥΣΙΟ ── */
{
  const w = makeWorld([]);
  const r = I.parse(L({ date: "2026-10-28", sp: "SP-14", node: "F4404", dur: "130" }), w);
  is("6. το «130» κόβεται", r.tally.bad, 1);
  ok("6β. …με τη δική ΤΟΥ εξήγηση, όχι δεύτερη", r.lines[0].why.indexOf("ten hours long") >= 0);
  const c = I.parse(L({ date: "2026-10-28", sp: "SP-14", node: "F4404", dur: "1,4" }), w);
  ok("6γ. το κόμμα δεν γίνεται τελεία στη σιωπή", c.lines[0].why.indexOf("decimal HOURS") >= 0);
}

/* ── 7. ΤΟ ΣΚΟΡ ──────────────────────────────────────────────────────────── */
{
  const w = makeWorld([]);
  const r = I.parse(L({ date: "2026-10-28", sp: "SP-14", node: "E1201", res: "score", score: "85" }), w);
  is("7. το σκορ είναι ΑΡΙΘΜΟΣ", r.lines[0].rec.score, 85);
  ok("7β. score χωρίς νούμερο", I.parse(L({ date: "2026-10-28", sp: "SP-14", node: "E1201", res: "score" }), w).lines[0].why.indexOf("no score") >= 0);
  ok("7γ. νούμερο χωρίς score", I.parse(L({ date: "2026-10-28", sp: "SP-14", node: "E1201", score: "85" }), w).lines[0].why.indexOf("drop the number") >= 0);
  ok("7δ. 120%", I.parse(L({ date: "2026-10-28", sp: "SP-14", node: "E1201", res: "score", score: "120" }), w).lines[0].why.indexOf("between 0 and 100") >= 0);
}

/* ── 8. ΤΟ ΙΔΙΟ ΓΕΓΟΝΟΣ: ΜΕΣΑ ΣΤΟ ΜΠΛΟΚ ──────────────────────────────────── */
{
  const two = L({ date: "2026-10-28", sp: "SP-14", node: "F4404", dur: "1.4" }) + "\n"
            + L({ date: "28/10/2026", sp: "SP-14", node: "F 4404", dur: "1.5" });
  const r = I.parse(two, makeWorld([]));
  is("8. δύο γραφές του ίδιου γεγονότος → μία περνά", r.tally, { new: 1, same: 0, clash: 0, bad: 1 });
  ok("8β. …και η δεύτερη δείχνει τον αριθμό της πρώτης", r.lines[1].why.indexOf("line 1") >= 0);
  /* Η ταυτότητα δεν εξαρτάται από τη ΓΡΑΦΗ: «28/10/2026» και «F 4404» είναι
     το ίδιο γεγονός με «2026-10-28» και «F4404». Αν εξαρτιόταν, το μπλοκ θα
     περνούσε και τις δύο — που είναι το εύρημα #888 σε μικρογραφία. */
}

/* ── 9. ΤΟ ΙΔΙΟ ΓΕΓΟΝΟΣ: ΑΠΕΝΑΝΤΙ ΣΤΟ ΗΜΕΡΟΛΟΓΙΟ ─────────────────────────── */
{
  const stored = {
    id: "ev-OLD", scope: "student", student: "SP-14", node: "s:F4404", date: "2026-10-28",
    kind: "flights", instructor: "IP-03", device: "T-6A", result: "completed",
    score: null, duration: 1.4, maneuvers: "", note: "",
  };
  const same = I.parse(L({ date: "2026-10-28", sp: "SP-14", node: "F4404", ip: "IP-03", dev: "T-6A", dur: "1.4" }),
    makeWorld([stored]));
  is("9. ίδια στοιχεία → δεν ακουμπιέται", same.tally, { new: 0, same: 1, clash: 0, bad: 0 });
  ok("9β. …και δεν υπάρχει εγγραφή για να γραφτεί", !same.lines[0].rec);

  const clash = I.parse(L({ date: "2026-10-28", sp: "SP-14", node: "F4404", ip: "IP-03", dev: "T-6A", dur: "1.4", res: "lag", man: "steep turns" }),
    makeWorld([stored]));
  is("9γ. διαφορετικά στοιχεία → clash", clash.tally, { new: 0, same: 0, clash: 1, bad: 0 });
  is("9δ. ΚΡΑΤΑ ΤΟ ΥΠΑΡΧΟΝ id — ενημέρωση, όχι δεύτερη σειρά", clash.lines[0].rec.id, "ev-OLD");
  ok("9ε. ΔΕΝ είναι τικαρισμένη από προεπιλογή", !clash.lines[0].pick);
  ok("9στ. …και λέει τι αλλάζει, όχι ότι αλλάζει", clash.lines[0].why.indexOf("completed → lag") >= 0);

  const twice = I.parse(L({ date: "2026-10-28", sp: "SP-14", node: "F4404", dur: "9.9" }),
    makeWorld([stored, Object.assign({}, stored, { id: "ev-OLD2" })]));
  is("9ζ. δύο αποθηκευμένα για το ίδιο γεγονός → καμία επιλογή", twice.tally.clash, 1);
  ok("9η. …και δεν γράφεται τίποτα", !twice.lines[0].rec);
}

/* ── 10. ΜΙΑ ΧΑΛΑΣΜΕΝΗ ΓΡΑΜΜΗ ΔΕΝ ΠΑΡΑΣΥΡΕΙ ΤΙΣ ΑΛΛΕΣ ───────────────────── */
{
  const text = [
    "# η μέρα της 28ης",
    L({ date: "2026-10-28", sp: "SP-14", node: "F4404", dur: "1.4" }),
    "{ αυτό δεν είναι JSON",
    "",
    "// σχόλιο",
    L({ date: "2026-10-28", sp: "SP-15", node: "C1101", dur: "1.3" }),
  ].join("\n");
  const r = I.parse(text, makeWorld([]));
  is("10. δύο καλές, μία σπασμένη", r.tally, { new: 2, same: 0, clash: 0, bad: 1 });
  is("10β. ο αριθμός γραμμής είναι ΤΟΥ ΚΕΙΜΕΝΟΥ, όχι της λίστας", r.lines.map((l) => l.n), [2, 3, 6]);
  ok("10γ. τα σχόλια και τα κενά περνούν ασχολίαστα", r.lines.length === 3);
}

/* ── 11. Ο ΠΙΝΑΚΑΣ JSON ──────────────────────────────────────────────────── */
{
  const r = I.parse(JSON.stringify([
    { date: "2026-10-28", sp: "SP-14", node: "F4404", dur: "1.4" },
    { date: "2026-10-28", sp: "SP-15", node: "C1101", dur: "1.3" },
  ]), makeWorld([]));
  is("11. ένας πίνακας διαβάζεται όπως οι γραμμές", r.tally.new, 2);
  const broken = I.parse("[{\"date\":\"2026-10-28\",}]", makeWorld([]));
  ok("11β. χαλασμένος πίνακας → ΕΝΑ μήνυμα, όχι σιωπή", !!broken.fatal);
  is("11γ. …και καμία γραμμή", broken.lines.length, 0);
}

/* ── 12. Η ΠΡΟΕΙΔΟΠΟΙΗΣΗ ΔΕΝ ΕΙΝΑΙ ΑΡΝΗΣΗ ───────────────────────────────── */
{
  const w = makeWorld([]);
  const r = I.parse(L({ date: "2026-10-28", sp: "SP-14", node: "F4404", ip: "IP-03", res: "fail", dur: "1.4" }), w);
  is("12. LAG/FAIL χωρίς χειρισμούς γράφεται…", r.tally.new, 1);
  ok("12β. …αλλά το λέει (fail-10)", r.lines[0].warn.indexOf("fail-10") >= 0);
  const nd = I.parse(L({ date: "2026-10-28", sp: "SP-14", node: "F4404" }), w);
  ok("12γ. πτήση χωρίς ώρα γράφεται και το λέει", nd.tally.new === 1 && nd.lines[0].warn.indexOf("flight time") >= 0);
  const man = I.parse(L({ date: "2026-10-28", sp: "SP-14", node: "F4404", man: "steep turns" }), w);
  ok("12δ. χειρισμοί σε completed είναι ΑΡΝΗΣΗ, όχι σιωπηλή απόρριψη",
    man.tally.bad === 1 && man.lines[0].why.indexOf("LAG or a FAIL") >= 0);
}

/* ── 13. ΤΟ ΙΔΙΟ ΠΕΔΙΟ ΔΥΟ ΦΟΡΕΣ ─────────────────────────────────────────── */
{
  const r = I.parse('{"sp":"SP-14","student":"SP-15","date":"2026-10-28","node":"F4404"}', makeWorld([]));
  is("13. «sp» και «student» μαζί → άρνηση, όχι ο ένας από τους δύο", r.tally.bad, 1);
  ok("13β. …και λέει ποιο πεδίο", r.lines[0].why.indexOf("student") >= 0);
}

/* ── 14. Η ΕΓΓΡΑΦΗ ΠΕΡΝΑ ΑΠΟ ΤΟ STORE ΩΣ AGENT ──────────────────────────── */
{
  const seen = [];
  let scope = "";
  sb.window.SchedStore = {
    asAgent: (label, fn) => { scope = label; try { return fn(); } finally { scope = ""; } },
    upsert: (coll, rec) => { seen.push({ coll: coll, id: rec.id, ag: scope }); return rec; },
  };
  const r = I.parse(L({ date: "2026-10-28", sp: "SP-14", node: "F4404", dur: "1.4" }), makeWorld([]));
  const out = I.write(r.lines);
  is("14. γράφτηκε μία", out, { wrote: 1, refused: 0 });
  is("14β. …στο trainingLog", seen[0].coll, "trainingLog");
  is("14γ. …ΜΕΣΑ στην εμβέλεια του agent (εκεί γεννιέται το _ag και το ίχνος)", seen[0].ag, "scheduler");

  /* ΤΟ ΚΛΕΙΔΩΜΑ ΕΠΕΞΕΡΓΑΣΙΑΣ: το upsert επιστρέφει null και ο αριθμός που
     επιστρέφεται είναι ό,τι ΟΝΤΩΣ μπήκε — ποτέ ό,τι ζητήθηκε. */
  sb.window.SchedStore.upsert = () => null;
  is("14δ. με κλειστό το κλείδωμα δεν λέει ψέματα", I.write(r.lines), { wrote: 0, refused: 1 });

  /* Οι μη τικαρισμένες δεν φεύγουν: αυτό είναι ΟΛΗ η προστασία του clash. */
  seen.length = 0;
  sb.window.SchedStore.upsert = (coll, rec) => { seen.push(rec.id); return rec; };
  const none = r.lines.map((l) => Object.assign({}, l, { pick: false }));
  is("14ε. ό,τι δεν τικάρει ο άνθρωπος δεν γράφεται", I.write(none).wrote, 0);
  is("14στ. …και δεν φτάνει ούτε στο store", seen.length, 0);
}

/* ── 15. ΤΙ ΒΛΕΠΕΙ ΤΟ ΜΑΤΙ ΚΑΙ ΤΙ ΕΧΕΙ ΑΔΕΙΑ ──────────────────────────────
   Μια γραμμή που ΔΕΝ γράφεται πρέπει παρ' όλα αυτά να ΛΕΕΙ ποιο γεγονός
   είναι: ένα «already in» χωρίς μαθητή και ημερομηνία αφήνει τον άνθρωπο να
   μαντέψει ποιο, που είναι χειρότερο από το να μην το έλεγε καθόλου. Το
   `show` είναι για τα μάτια, το `rec` είναι Η ΑΔΕΙΑ — και η write() κοιτά
   μόνο το δεύτερο, ακόμη κι αν κάποιος τικάρει το πρώτο. */
{
  const stored = {
    id: "ev-OLD", scope: "student", student: "SP-14", node: "s:F4404", date: "2026-10-28",
    kind: "flights", instructor: "IP-03", device: "T-6A", result: "completed",
    score: null, duration: 1.4, maneuvers: "", note: "",
  };
  const same = I.parse(L({ date: "2026-10-28", sp: "SP-14", node: "F4404", ip: "IP-03", dev: "T-6A", dur: "1.4" }),
    makeWorld([stored]));
  is("15. μια «already in» δείχνει ΠΟΙΟ γεγονός είναι", same.lines[0].show.student, "SP-14");
  is("15β. …και ποια μέρα", same.lines[0].show.date, "2026-10-28");
  ok("15γ. …αλλά χωρίς άδεια να γραφτεί", !same.lines[0].rec);
  is("15δ. …και η write() δεν την πιάνει ΟΥΤΕ τικαρισμένη",
     I.write(same.lines.map((l) => Object.assign({}, l, { pick: true }))).wrote, 0);

  const twice = I.parse(L({ date: "2026-10-28", sp: "SP-14", node: "F4404", dur: "9.9" }),
    makeWorld([stored, Object.assign({}, stored, { id: "ev-OLD2" })]));
  ok("15ε. και μια αμφίσημη «differs» το ίδιο", !!twice.lines[0].show && !twice.lines[0].rec);

  const bad = I.parse(L({ date: "2026-10-28", studnet: "SP-14", node: "F4404" }), makeWorld([]));
  ok("15στ. μια αρνημένη γραμμή ΔΕΝ δείχνει τίποτα — δεν κρίθηκε ποτέ", !bad.lines[0].show);
}

console.log("\n" + pass + " πέρασαν, " + fail + " απέτυχαν");
process.exit(fail ? 1 : 0);
