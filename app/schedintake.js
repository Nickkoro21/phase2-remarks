"use strict";
/* ══════════════════════════════════════════════════════════════════════════
   Η ΥΠΟΔΟΧΗ — window.SchedIntake                             (29/10/2026)
   ══════════════════════════════════════════════════════════════════════════
   Η ΑΠΟΦΑΝΣΗ ΠΟΥ ΥΛΟΠΟΙΕΙ, ΑΥΤΟΛΕΞΕΙ (roadmap, 18/10): «ο proxy ΔΕΝ μπορεί να
   γράψει στον Scheduler: τα δεδομένα ζουν στον browser. Η λύση είναι το ίδιο
   μοτίβο με τον φάκελο υποθέσεων — ο agent επιστρέφει ΠΡΟΤΕΙΝΟΜΕΝΕΣ εγγραφές
   με προεπισκόπηση, η ΣΕΛΙΔΑ τις περνά μέσα από το SchedStore (ραφή, κλείδωμα,
   log), ο ιδιοκτήτης πατά Γράψ' το.»

   ΑΥΤΟ ΕΙΝΑΙ Η «ΣΕΛΙΔΑ» ΤΗΣ ΑΠΟΦΑΝΣΗΣ. Δεν μιλά σε δίκτυο, δεν έχει κλειδί,
   δεν ξέρει τι είναι agent: διαβάζει ΚΕΙΜΕΝΟ, το κρίνει γραμμή-γραμμή, δείχνει
   τι θα κάνει, και γράφει μόνο ό,τι τικάρει ο άνθρωπος. Ο agent που το παράγει
   μπορεί να είναι η κύρια συνεδρία, ένας proxy, ή ο ίδιος ο ιδιοκτήτης με το
   χέρι — η υποδοχή δεν ρωτά και δεν θα μάθει ποτέ.

   ΓΙΑΤΙ ΤΟ ΜΠΛΟΚ ΕΙΝΑΙ JSON ΚΑΙ ΟΧΙ ΣΤΗΛΕΣ. Το κείμενο είναι ΜΗΧΑΝΗ ΠΡΟΣ
   ΜΗΧΑΝΗ· αυτό που διαβάζει ο άνθρωπος είναι ο ΠΙΝΑΚΑΣ της προεπισκόπησης.
   Μια θέση-προς-θέση μορφή («2026-10-28  SP-14  IP-03  …») διαβάζεται πιο
   εύκολα με το μάτι αλλά σπάει σιωπηλά στο πρώτο κενό πεδίο: η στήλη 5 γίνεται
   στήλη 4 και η ώρα πτήσης μπαίνει στη θέση του αποτελέσματος. Μια γραμμή JSON
   δεν έχει θέσεις — έχει ονόματα — και όταν σπάσει, σπάει **μόνη της** και το
   λέει με τον αριθμό της γραμμής.

   ΤΡΙΑ ΠΡΑΓΜΑΤΑ ΠΟΥ ΤΗΝ ΚΑΝΟΥΝ ΑΥΣΤΗΡΟΤΕΡΗ ΑΠΟ ΤΗ ΦΟΡΜΑ, ΕΠΙΤΗΔΕΣ:

   1. ΑΓΝΩΣΤΟ ΚΛΕΙΔΙ = ΑΡΝΗΣΗ. Η φόρμα δεν μπορεί να έχει γραμμένο λάθος όνομα
      πεδίου — τα πεδία της είναι ζωγραφισμένα. Εδώ ένα `studnet=` θα γινόταν
      σιωπηλά «χωρίς μαθητή», δηλαδή μια εγγραφή που δεν ανήκει σε κανέναν. Το
      άγνωστο κλειδί ονομάζεται και η γραμμή δεν γράφεται.

   2. ΜΙΑ ΓΡΑΜΜΗ ΠΟΥ ΥΠΑΡΧΕΙ ΗΔΗ ΔΕΝ ΞΑΝΑΓΡΑΦΕΤΑΙ. Η υποδοχή ψάχνει
      (μαθητής + κόμβος + ημερομηνία) στο `trainingLog` ΠΡΙΝ γράψει τίποτα:
      ίδια στοιχεία → **same**, δεν την ακουμπά· διαφορετικά στοιχεία →
      **clash**, που κρατά το ΥΠΑΡΧΟΝ `id` ώστε το «γράψ' το» να είναι
      ΕΝΗΜΕΡΩΣΗ και όχι δεύτερη σειρά, και ΔΕΝ είναι τικαρισμένη από
      προεπιλογή. Αυτό είναι ακριβώς το σχήμα της ζημιάς της 28/10 — 1085
      γραμμές που κανείς δεν ζήτησε — και είναι ο λόγος που ο έλεγχος μπαίνει
      ΠΡΙΝ και όχι μετά.

   3. ΟΤΙ ΔΕΝ ΚΑΤΑΛΑΒΑΙΝΕΙ, ΤΟ ΑΡΝΕΙΤΑΙ ΑΝΤΙ ΝΑ ΤΟ ΜΑΝΤΕΨΕΙ. Ειδικές εξόδους
      (`sp:`), NFS, μαθήματα και εγγραφές ανά τάξη ΔΕΝ τις δέχεται: τις στέλνει
      στη φόρμα με το όνομά τους. Η φόρμα έχει ανθρώπινο μάτι σε ΚΑΘΕ πεδίο· η
      υποδοχή έχει ανθρώπινο μάτι σε έναν ΠΙΝΑΚΑ. Δεν είναι το ίδιο μάτι, και
      το εύρος το σέβεται.

   ΤΑ ΟΝΟΜΑΤΑ ΔΕΝ ΜΠΑΙΝΟΥΝ ΣΤΟΝ ΠΙΝΑΚΑ. Ο πίνακας δείχνει ΚΩΔΙΚΟΥΣ (SP-14),
   ποτέ `personOption()`. Δύο λόγοι, και ο δεύτερος είναι ο σοβαρός: ο κωδικός
   είναι ό,τι περιέχει το μπλοκ — δείχνοντας κάτι άλλο θα έκρυβε τι πρόκειται
   να γραφτεί· και ο διάλογος δεν αποκτά **καθόλου** φορτίο πραγματικών ονομάτων
   στο DOM, οπότε δεν χρειάζεται τη φύλαξη που χρειάστηκε η γέφυρα
   (`schBridgeLeave`, bridge ruling #7). Μια επιφάνεια που δεν κρατά ονόματα δεν
   μπορεί να τα διαρρεύσει.

   Η ΣΦΡΑΓΙΔΑ ΚΑΙ ΤΟ ΦΡΕΝΟ ΤΗΣ ΓΕΦΥΡΑΣ. Η εγγραφή γίνεται μέσα σε
   `SchedStore.asAgent("scheduler", …)`, άρα κάθε γραμμή φεύγει με `_ag` και
   αφήνει ίχνος στο `agentLog`. Αυτό δεν είναι κόσμημα: το φρένο της γέφυρας
   (`schedbridge.js § queuedByMachine`) ΔΙΑΒΑΖΕΙ αυτό το `_ag` και κρατά
   ΟΛΟΚΛΗΡΗ την αυτόματη ουρά μέχρι να πατήσει ο ιδιοκτήτης «✈ Push now». Χωρίς
   τη σφραγίδα, κάθε γραμμή που περνά από εδώ θα έφτανε στο Wings Ahead σε 5
   δευτερόλεπτα σφραγισμένη με το όνομα του εκπαιδευτή. Η σφραγίδα ΕΙΝΑΙ το
   φρένο — γι' αυτό γράφτηκε πριν από αυτό το αρχείο και όχι μαζί του.

   Ο ΠΥΡΗΝΑΣ ΕΙΝΑΙ ΚΑΘΑΡΟΣ, ΜΕ ΤΟΝ ΚΟΣΜΟ ΩΣ ΟΡΙΣΜΑ. `parse(text, world)` δεν
   αγγίζει `window`: ο κόσμος (ποιοι μαθητές υπάρχουν, πώς λύνεται ένας κόμβος,
   τι είναι νόμιμη ώρα πτήσης, τι υπάρχει ήδη) περνά ως αντικείμενο. Έτσι οι
   δοκιμές τον τρέχουν με ψεύτικο κόσμο, χωρίς DOM και χωρίς το flowchart —
   `node tools/test_intake.js` — και ο κανόνας της ώρας πτήσης είναι ΤΟ ΙΔΙΟ
   `SchedReady.durationValue` που κρίνει τη φόρμα, όχι ένα δεύτερο αντίγραφό του.
   ══════════════════════════════════════════════════════════════════════════ */
(() => {
  const AGENT = "scheduler";

  /* ── ΤΑ ΠΕΔΙΑ ────────────────────────────────────────────────────────────
     Τα συνώνυμα υπάρχουν γιατί το μπλοκ το γράφει μηχανή και το διορθώνει
     άνθρωπος: `ip` και `instructor` είναι το ίδιο πράγμα σε δύο διαθέσεις.
     Ο,τι ΔΕΝ είναι εδώ μέσα είναι σφάλμα με όνομα — βλ. κανόνα 1 παραπάνω. */
  const ALIAS = {
    d: "date", date: "date", when: "date",
    sp: "student", stu: "student", student: "student",
    ip: "instructor", instructor: "instructor",
    node: "node", item: "node", sortie: "node", uid: "node",
    dev: "device", ac: "device", device: "device",
    res: "result", result: "result",
    dur: "duration", hours: "duration", duration: "duration",
    score: "score",
    man: "maneuvers", maneuvers: "maneuvers",
    note: "note", remark: "note",
  };
  const RESULTS = ["completed", "lag", "fail", "score"];
  const FLY_ONLY = ["lag", "fail"];

  const trim = (v) => String(v == null ? "" : v).trim();
  const pad2 = (n) => (String(n).length < 2 ? "0" + n : String(n));

  /* ── Η ΗΜΕΡΟΜΗΝΙΑ ────────────────────────────────────────────────────────
     Δέχεται ISO και την ελληνική γραφή (28/10/2026 · 28-10-2026 · 28.10.2026)
     γιατί και τα δύο θα γραφτούν. ΔΕΝ δέχεται 10/28/2026: δύο αριθμοί κάτω του
     13 δεν ξεχωρίζουν, οπότε η μία ανάγνωση είναι επιλογή — και η επιλογή είναι
     του τόπου, όχι του parser. Ελέγχεται ότι η ημερομηνία ΥΠΑΡΧΕΙ: το 31/02
     περνά κάθε regex και δεν είναι μέρα. */
  function isoDate(v) {
    const s = trim(v);
    let y, m, d;
    let mm = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (mm) { y = +mm[1]; m = +mm[2]; d = +mm[3]; }
    else {
      mm = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
      if (!mm) return "";
      d = +mm[1]; m = +mm[2]; y = +mm[3];
    }
    if (m < 1 || m > 12 || d < 1 || d > 31) return "";
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return "";
    return y + "-" + pad2(m) + "-" + pad2(d);
  }

  /* ── ΤΑ ΣΩΜΑΤΑ ΤΟΥ ΚΕΙΜΕΝΟΥ ──────────────────────────────────────────────
     Δέχεται ΚΑΙ πίνακα JSON ΚΑΙ μία-γραμμή-ένα-αντικείμενο. Ο πίνακας είναι ό,τι
     παράγει πιο φυσικά μια μηχανή· οι γραμμές είναι ό,τι επιζεί καλύτερα όταν
     μια γραμμή είναι χαλασμένη. Τα σχόλια (`#`, `//`) και τα κενά περνούν
     ασχολίαστα, ώστε το μπλοκ να μπορεί να κουβαλά τον τίτλο της μέρας του.
     Ο ΑΡΙΘΜΟΣ ΓΡΑΜΜΗΣ ΚΡΑΤΙΕΤΑΙ ΑΠΟ ΤΟ ΑΡΧΙΚΟ ΚΕΙΜΕΝΟ και όχι από τη σειρά στη
     λίστα: αυτός είναι ο αριθμός που βλέπει ο άνθρωπος στον editor του. */
  function bodies(text) {
    const raw = String(text == null ? "" : text);
    const t = raw.trim();
    const out = [];
    if (t.charAt(0) === "[") {
      let arr = null;
      try { arr = JSON.parse(t); } catch (e) {
        return { fatal: "the block starts with “[” so it was read as one JSON array, and that array "
          + "does not parse — " + e.message, rows: [] };
      }
      if (!Array.isArray(arr)) return { fatal: "expected an array of records", rows: [] };
      arr.forEach((o, i) => out.push({ n: i + 1, raw: JSON.stringify(o), obj: o, why: "" }));
      return { fatal: "", rows: out };
    }
    raw.split(/\r?\n/).forEach((ln, i) => {
      const s = ln.trim();
      if (!s || s.charAt(0) === "#" || s.slice(0, 2) === "//") return;
      let o = null, why = "";
      try { o = JSON.parse(s); } catch (e) { why = "not a JSON object — " + e.message; }
      if (!why && (!o || typeof o !== "object" || Array.isArray(o))) why = "a line must be one JSON object in { }";
      out.push({ n: i + 1, raw: s, obj: o, why: why });
    });
    return { fatal: "", rows: out };
  }

  /* ── Ο ΚΡΙΤΗΣ ΜΙΑΣ ΓΡΑΜΜΗΣ ───────────────────────────────────────────────
     Επιστρέφει { rec, why, warn }. `why` σημαίνει ΑΡΝΗΣΗ· `warn` σημαίνει
     «γράφεται, αλλά κοίτα το». Τα δύο είναι χωριστά πεδία επίτηδες: μια γραμμή
     μπορεί να είναι και σωστή και ύποπτη, και το να την αρνηθούμε γι' αυτό θα
     έκανε την υποδοχή να χάνει αληθινά γεγονότα. */
  function judge(obj, world) {
    const f = {};
    for (const k of Object.keys(obj)) {
      const key = ALIAS[String(k).toLowerCase()];
      if (!key) {
        return { why: "unknown field “" + k + "” — the intake will not guess which one you meant; "
          + "the fields are date · student · node · instructor · device · result · score · duration · maneuvers · note" };
      }
      if (key in f) return { why: "the field “" + key + "” is given twice (once as “" + k + "”)" };
      f[key] = obj[k];
    }

    /* ── ημερομηνία ── */
    if (!trim(f.date)) return { why: "no date" };
    const date = isoDate(f.date);
    if (!date) {
      return { why: "the date “" + trim(f.date) + "” is not a day — write it as 2026-10-28 or 28/10/2026" };
    }
    /* ΕΝΑ ΑΥΡΙΟ ΔΕΝ ΕΙΝΑΙ ΕΓΓΡΑΦΗ, ΕΙΝΑΙ ΠΡΟΓΡΑΜΜΑ. Το ημερολόγιο καταγράφει
       ό,τι έγινε· ο πίνακας προγραμματίζει ό,τι θα γίνει. Μια ημερομηνία στο
       μέλλον σε μπλοκ που βγήκε από φωτογραφία είναι δακτυλογραφικό λάθος στη
       χρονιά ή στον μήνα, και δεν υπάρχει αναγνώστης που να μπορεί αργότερα να
       το ξεχωρίσει από αληθινή εγγραφή. */
    const today = world.todayISO ? world.todayISO() : "";
    if (today && date > today) {
      return { why: "that day has not happened yet (today is " + today + ") — the log records, the board plans" };
    }

    /* ── μαθητής ── */
    const student = trim(f.student);
    if (!student) return { why: "no student — the intake records per student; a class-wide entry goes through the form" };
    if (!world.hasStudent(student)) {
      return { why: "no student “" + student + "” in the roster — the intake never creates people" };
    }

    /* ── κόμβος ── */
    const nodeIn = trim(f.node);
    if (!nodeIn) return { why: "no node" };
    if (nodeIn.slice(0, 3) === "sp:") {
      return { why: "a special sortie (" + nodeIn + ") carries a category and a consequence set — "
        + "it is recorded through the form, which asks for both" };
    }
    const node = world.resolveNode(nodeIn);
    if (!node) {
      return { why: "no syllabus item matches “" + nodeIn + "” — write the id as it stands in the syllabus (F4404, C1101)" };
    }
    const kind = world.kindOf(node) || "";
    if (kind === "lessons") {
      return { why: "a lesson block spans dates and may carry a course and periods — it is recorded through the form" };
    }
    const isFly = kind === "flights" || kind === "fs";

    /* ── εκπαιδευτής ── */
    const instructor = trim(f.instructor);
    if (instructor && !world.hasInstructor(instructor)) {
      return { why: "no instructor “" + instructor + "” in the roster — the intake never creates people" };
    }

    /* ── αποτέλεσμα ── */
    const result = trim(f.result) || "completed";
    if (RESULTS.indexOf(result) < 0) {
      return { why: "the result “" + result + "” is not one of " + RESULTS.join(" · ") };
    }
    if (!isFly && FLY_ONLY.indexOf(result) >= 0) {
      return { why: "“" + result + "” is a flying verdict and this is a " + (kind || "ground") + " item — a written one is completed or a score" };
    }
    let score = null;
    if (result === "score") {
      const s = trim(f.score);
      if (!s) return { why: "result is a score and no score is given" };
      if (!/^\d{1,3}(\.\d+)?$/.test(s) || Number(s) > 100) {
        return { why: "the score “" + s + "” is not a percentage between 0 and 100" };
      }
      score = Number(s);
    } else if (trim(f.score)) {
      return { why: "a score is given but the result is “" + result + "” — set result to score, or drop the number" };
    }

    /* ── ώρα πτήσης ── Ο ΙΔΙΟΣ κριτής της φόρμας, ποτέ αντίγραφό του. ── */
    const durIn = trim(f.duration);
    if (durIn && !isFly) {
      return { why: "flight time belongs to a flown sortie and this is a " + (kind || "ground") + " item" };
    }
    const dur = world.durationValue(isFly ? durIn : "", null);
    if (!dur.ok) return { why: "flight time — " + dur.why };

    /* ── χειρισμοί ── */
    const man = trim(f.maneuvers);
    if (man && !(isFly && (result === "lag" || result === "fail"))) {
      return { why: "the lagged/failed maneuvers are recorded on a LAG or a FAIL — this line is “" + result + "”" };
    }

    let warn = "";
    if (isFly && (result === "lag" || result === "fail") && !man) {
      warn = "no maneuvers named — fail-10 repeats them on the next sortie, and nothing here says which";
    } else if (isFly && !durIn) {
      warn = "no flight time";
    }
    if (!instructor && result !== "completed") {
      warn = (warn ? warn + " · " : "") + "no instructor on a " + result;
    }

    /* ΚΑΘΕ ΠΕΔΙΟ ΓΡΑΦΕΤΑΙ ΡΗΤΑ, ΑΚΟΜΗ ΚΑΙ ΚΕΝΟ — το ίδιο που λέει ο σχολιασμός
       του `duration` στο saveEvent, για τον ίδιο λόγο: το upsert ΣΥΓΧΩΝΕΥΕΙ, άρα
       ένα πεδίο που η γραμμή παραλείπει κρατά ό,τι είχε η αποθηκευμένη εγγραφή.
       Σε μια ΕΝΗΜΕΡΩΣΗ (clash) αυτό σημαίνει ότι ένα «completed» πάνω σε παλιό
       «fail» θα άφηνε τους χειρισμούς της αποτυχίας κολλημένους σε μια επιτυχία. */
    const rec = {
      node: node, kind: kind, scope: "student", student: student,
      class: "", instructor: instructor, device: trim(f.device),
      result: result, score: score, duration: dur.value,
      maneuvers: man, note: trim(f.note),
      absent: [], date: date, start_date: "", end_date: "",
    };
    return { rec: rec, why: "", warn: warn };
  }

  /* ── ΤΟ ΙΔΙΟ ΓΕΓΟΝΟΣ ─────────────────────────────────────────────────────
     Ταυτότητα = μαθητής + κόμβος + ημερομηνία. ΔΕΝ είναι το `id`: το id το
     μιντάρει όποιος γράφει πρώτος, οπότε δύο συσκευές (ή δύο επικολλήσεις του
     ίδιου μπλοκ) φτιάχνουν δύο id για ένα γεγονός — που είναι ακριβώς το
     εύρημα #888 της 28/10, οι ίδιοι άνθρωποι δύο φορές. Η σύγκριση κοιτά τα
     πεδία ΠΟΥ ΚΑΤΕΧΕΙ Η ΥΠΟΔΟΧΗ και κανένα άλλο: το `_u`, το `_by`, το `_ag`
     και ό,τι έγραψε η γέφυρα δεν είναι διαφωνία για το γεγονός. */
  const OWNED = ["instructor", "device", "result", "score", "duration", "maneuvers", "note"];
  function sameEvent(a, b) {
    for (const k of OWNED) {
      const x = a[k] == null ? "" : a[k], y = b[k] == null ? "" : b[k];
      if (String(x) !== String(y)) return false;
    }
    return true;
  }
  function differs(a, b) {
    const out = [];
    for (const k of OWNED) {
      const x = a[k] == null ? "" : a[k], y = b[k] == null ? "" : b[k];
      if (String(x) !== String(y)) out.push(k + ": " + (String(y) || "—") + " → " + (String(x) || "—"));
    }
    return out;
  }

  /* ══ Ο ΠΥΡΗΝΑΣ ══════════════════════════════════════════════════════════ */
  function parse(text, world) {
    const b = bodies(text);
    const lines = [];
    const within = new Map();          // ταυτότητα → η ΠΡΩΤΗ γραμμή που την πήρε

    for (const row of b.rows) {
      const line = { n: row.n, raw: row.raw, status: "bad", why: row.why, warn: "",
        rec: null, show: null, was: null, pick: false };
      if (row.why) { lines.push(line); continue; }

      const v = judge(row.obj, world);
      if (v.why) { line.why = v.why; lines.push(line); continue; }
      line.warn = v.warn || "";
      /* `show` ΚΑΙ `rec` ΧΩΡΙΣΤΑ, και η διάκριση δεν είναι κοσμητική. Μια γραμμή
         «already in», ή μια «differs» που είναι αμφίσημη, ΔΕΝ γράφεται — άρα το
         `rec` της είναι null. Αλλά ο άνθρωπος πρέπει να δει ΠΟΙΟ γεγονός είναι
         αυτό που δεν γράφεται· αλλιώς ο πίνακας λέει «κάτι υπάρχει ήδη» και τον
         αφήνει να μαντέψει τι, που είναι χειρότερο από το να μην το έλεγε.
         Το `show` είναι για τα μάτια, το `rec` είναι Η ΑΔΕΙΑ: η write() κοιτά
         ΜΟΝΟ το `rec`, οπότε ό,τι φαίνεται εδώ χωρίς `rec` δεν έχει διαδρομή
         προς το store — ούτε καν αν τικαριστεί, γιατί τικ δεν ζωγραφίζεται. */
      line.show = v.rec;

      const key = v.rec.student + "|" + v.rec.node + "|" + v.rec.date;

      /* ΜΕΣΑ ΣΤΟ ΙΔΙΟ ΜΠΛΟΚ. Ελέγχεται ΠΡΙΝ το store, γιατί αλλιώς η δεύτερη
         γραμμή θα κρινόταν «new» (το store δεν την έχει ακόμη) και οι δύο θα
         γραφόντουσαν — η μία πάνω στην άλλη, με τη τελευταία να νικά σιωπηλά. */
      if (within.has(key)) {
        line.status = "bad";
        line.why = "the same student, item and day are already on line " + within.get(key)
          + " of this block — one event, one line";
        lines.push(line);
        continue;
      }
      within.set(key, row.n);

      const hits = world.eventsOf(v.rec.student, v.rec.node, v.rec.date);
      if (!hits.length) {
        v.rec.id = world.uid();
        line.status = "new"; line.pick = true; line.rec = v.rec;
      } else if (hits.length > 1) {
        line.status = "clash"; line.rec = null;
        line.why = "the log already holds " + hits.length + " entries for this student, item and day — "
          + "the intake will not choose between them; settle them in the Training log first";
      } else if (sameEvent(v.rec, hits[0])) {
        line.status = "same"; line.rec = null; line.was = hits[0];
        line.why = "already recorded, with these exact facts";
      } else {
        /* ΤΟ ΥΠΑΡΧΟΝ id ΚΡΑΤΙΕΤΑΙ: έτσι το «γράψ' το» είναι ΕΝΗΜΕΡΩΣΗ της
           σειράς που υπάρχει και όχι δεύτερη σειρά για το ίδιο γεγονός. */
        v.rec.id = hits[0].id;
        line.status = "clash"; line.rec = v.rec; line.was = hits[0]; line.pick = false;
        line.why = differs(v.rec, hits[0]).join(" · ");
      }
      lines.push(line);
    }

    const tally = { new: 0, same: 0, clash: 0, bad: 0 };
    for (const l of lines) tally[l.status] += 1;
    return { fatal: b.fatal, lines: lines, tally: tally };
  }

  /* ══ Ο ΑΛΗΘΙΝΟΣ ΚΟΣΜΟΣ ═════════════════════════════════════════════════ */
  function realWorld() {
    const S = window.SchedStore, R = window.SchedReady;
    if (!S || !R) return null;
    const stu = new Set((S.get("students") || []).map((s) => String(s.code)));
    const ips = new Set((S.get("instructors") || []).map((i) => String(i.code)));

    /* Η ΛΥΣΗ ΤΟΥ ΚΟΜΒΟΥ δέχεται uid (`s:F4404`), id (`F4404`) και τη γραφή του
       συλλαβαρίου με το κενό (`F 4404`), γιατί και τα τρία θα γραφτούν. Τα κενά
       φεύγουν και η σύγκριση είναι χωρίς πεζά/κεφαλαία — ΑΛΛΑ όχι ασαφής: ένα
       πρόθεμα δεν ταιριάζει, μόνο ολόκληρο id. */
    const byId = new Map();
    for (const uid of R.nodes()) {
      const d = R.describe(uid);
      if (!d) continue;
      byId.set(uid.toLowerCase(), uid);
      if (d.id) byId.set(String(d.id).replace(/\s+/g, "").toLowerCase(), uid);
      if (d.label) byId.set(String(d.label).replace(/\s+/g, "").toLowerCase(), uid);
    }
    return {
      hasStudent: (c) => stu.has(String(c)),
      hasInstructor: (c) => ips.has(String(c)),
      resolveNode: (s) => byId.get(String(s).replace(/\s+/g, "").toLowerCase()) || null,
      kindOf: (uid) => R.kindOf(uid),
      durationValue: (v, was) => R.durationValue(v, was),
      todayISO: () => R.todayISO(),
      uid: () => S.uid("ev"),
      eventsOf: (student, node, date) => (S.get("trainingLog") || []).filter((e) =>
        e && e.scope === "student" && String(e.student) === String(student)
        && String(e.node || e.uid || "") === String(node)
        && String(e.end_date || e.date || "") === String(date)),
    };
  }

  /* ══ Η ΕΓΓΡΑΦΗ ═════════════════════════════════════════════════════════
     ΟΛΕΣ ΟΙ ΓΡΑΜΜΕΣ ΣΕ ΕΝΑ `asAgent`, και κάθε μία με δικό της `upsert`: η
     σφραγίδα `_ag` και η γραμμή του `agentLog` βγαίνουν ΑΝΑ ΕΓΓΡΑΦΗ από το
     store, όχι από εδώ — η υποδοχή δεν γράφει ημερολόγιο, δηλώνει ποια είναι.
     Το `upsert` επιστρέφει null όταν το κλείδωμα επεξεργασίας αρνείται, οπότε
     ο αριθμός που επιστρέφεται είναι ό,τι ΟΝΤΩΣ μπήκε και ποτέ ό,τι ζητήθηκε. */
  function write(lines) {
    const S = window.SchedStore;
    if (!S) return { wrote: 0, refused: 0 };
    const todo = (lines || []).filter((l) => l && l.pick && l.rec);
    let wrote = 0;
    S.asAgent(AGENT, () => {
      for (const l of todo) if (S.upsert("trainingLog", l.rec)) wrote += 1;
    });
    return { wrote: wrote, refused: todo.length - wrote };
  }

  window.SchedIntake = {
    AGENT: AGENT, FIELDS: Object.keys(ALIAS), RESULTS: RESULTS,
    parse: parse, world: realWorld, write: write,
    /* εκτεθειμένα για τις δοκιμές και για τον διάλογο, ώστε ο κανόνας να ζει
       σε ΕΝΑ σημείο και να μη ξαναγραφτεί σε δύο */
    isoDate: isoDate, sameEvent: sameEvent, differs: differs,
  };
})();

/* ══════════════════════════════════════════════════════════════════════════
   Ο ΔΙΑΛΟΓΟΣ — ΤΟ ΜΑΤΙ ΤΟΥ ΑΝΘΡΩΠΟΥ                          (29/10/2026)
   ══════════════════════════════════════════════════════════════════════════
   ΧΩΡΙΣΤΟ IIFE ΑΠΟ ΤΟΝ ΠΥΡΗΝΑ, και όχι για τάξη: ο πυρήνας παραπάνω τρέχει
   σε `node` χωρίς DOM (tools/test_intake.js) και θα έπαυε να τρέχει τη στιγμή
   που θα άγγιζε `document`. Το σύνορο είναι εκτελέσιμο, άρα δεν σαπίζει.

   ΤΟ ΚΛΕΙΔΩΜΑ ΡΩΤΙΕΤΑΙ ΠΡΙΝ, ΟΧΙ ΜΕΤΑ. Το `upsert` αρνείται μία φορά ανά
   εγγραφή, οπότε ένα μπλοκ σαράντα γραμμών σε κλειδωμένη συσκευή θα έβγαζε
   σαράντα αρνήσεις και μηδέν εγγραφές — αφού ο άνθρωπος είχε κάνει ΟΛΗ τη
   δουλειά του ελέγχου. Ο διάλογος το λέει στην αρχή και κρατά το κουμπί
   κλειστό· ο ΕΛΕΓΧΟΣ δουλεύει κανονικά, γιατί διάβασμα δεν είναι γραφή και
   είναι χρήσιμο να μπορείς να κρίνεις ένα μπλοκ πριν ξεκλειδώσεις.

   ΜΙΑ ΕΠΙΦΑΝΕΙΑ ΧΩΡΙΣ ΟΝΟΜΑΤΑ. Ο πίνακας δείχνει ΚΩΔΙΚΟΥΣ — βλ. το κεφάλαιο
   «ΤΑ ΟΝΟΜΑΤΑ ΔΕΝ ΜΠΑΙΝΟΥΝ ΣΤΟΝ ΠΙΝΑΚΑ» παραπάνω. Γι' αυτό ο διάλογος δεν
   χρειάζεται φύλαξη εξόδου όπως η γέφυρα: δεν υπάρχει τίποτα να φυλαχτεί.
   ══════════════════════════════════════════════════════════════════════════ */
(() => {
  const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ESC[c]);
  const I = () => window.SchedIntake;
  const S = () => window.SchedStore;

  const BADGE = {
    new:   { cls: "ink-new",   t: "new" },
    clash: { cls: "ink-clash", t: "differs" },
    same:  { cls: "ink-same",  t: "already in" },
    bad:   { cls: "ink-bad",   t: "refused" },
  };

  let st = null;          // { veil, lines, fatal }  ·  null = κλειστός

  const locked = () => { const E = window.SchedEdit; return !!(E && !E.on()); };

  function close() {
    if (!st) return;
    const v = st.veil;
    st = null;                                             // ΠΡΩΤΑ η κατάσταση: ένα
    if (v && v.parentNode) v.parentNode.removeChild(v);    // δεύτερο close() δεν
    document.removeEventListener("keydown", onKey, true);  // βρίσκει τίποτα
  }

  function onKey(e) {
    if (!st || e.key !== "Escape") return;
    e.preventDefault();
    close();
  }

  /* ── Ο ΠΙΝΑΚΑΣ ───────────────────────────────────────────────────────────
     Μία σειρά ανά γραμμή του κειμένου, ΜΕ ΤΟΝ ΑΡΙΘΜΟ ΤΗΣ: αυτός είναι ο
     αριθμός που βλέπει ο άνθρωπος στο πεδίο πάνω, οπότε «γραμμή 7» σημαίνει
     το ίδιο πράγμα στα δύο μέρη της οθόνης. */
  function rows() {
    if (!st) return "";
    if (st.fatal) return '<p class="ink-fatal">' + esc(st.fatal) + "</p>";
    if (!st.lines.length) return '<p class="sch-hint">Nothing to read yet.</p>';
    return '<table class="sch-tbl ink-tbl"><thead><tr>'
      + "<th></th><th>#</th><th></th><th>date</th><th>student</th><th>item</th>"
      + "<th>IP</th><th>result</th><th>hrs</th><th>what the intake sees</th>"
      + "</tr></thead><tbody>" + st.lines.map(row).join("") + "</tbody></table>";
  }

  function row(l, i) {
    const b = BADGE[l.status] || BADGE.bad;
    const r = l.show || l.rec || {};        // τα μάτια βλέπουν ό,τι κρίθηκε· το τικ ακολουθεί το `rec`
    const tick = l.rec
      ? '<input type="checkbox" data-ink="pick" data-i="' + i + '"'
        + (l.pick ? " checked" : "") + ' aria-label="write line ' + l.n + '">'
      : "";
    /* Η ΑΙΤΙΟΛΟΓΙΑ ΚΑΙ Η ΠΡΟΕΙΔΟΠΟΙΗΣΗ ΣΤΗΝ ΙΔΙΑ ΣΤΗΛΗ, με διαφορετικό χρώμα:
       είναι και τα δύο «τι βλέπει η υποδοχή σε αυτή τη γραμμή», και μια δεύτερη
       στήλη κενή στις 9 από 10 σειρές διαβάζεται ως σφάλμα. */
    const say = [
      l.why ? '<span class="ink-why">' + esc(l.why) + "</span>" : "",
      l.warn ? '<span class="ink-warn">&#9888; ' + esc(l.warn) + "</span>" : "",
      !l.why && !l.warn && r.note ? '<span class="ink-note">' + esc(r.note) + "</span>" : "",
    ].filter(Boolean).join(" ");
    return '<tr class="ink-r ink-r-' + l.status + '">'
      + '<td class="ink-tick">' + tick + "</td>"
      + '<td class="ink-n">' + l.n + "</td>"
      + '<td><span class="sch-badge ' + b.cls + '">' + esc(b.t) + "</span></td>"
      + "<td>" + esc(r.date || "") + "</td>"
      + '<td class="sch-code">' + esc(r.student || "") + "</td>"
      + "<td>" + esc(r.node ? String(r.node).replace(/^[sg]:/, "") : "") + "</td>"
      + "<td>" + esc(r.instructor || "") + "</td>"
      + "<td>" + esc(r.result ? (r.result === "score" ? r.score + "%" : r.result) : "") + "</td>"
      + "<td>" + (r.duration == null ? "" : esc(r.duration)) + "</td>"
      + '<td class="ink-say">' + say + "</td></tr>";
  }

  function foot() {
    if (!st || st.fatal) return "";
    const t = { new: 0, same: 0, clash: 0, bad: 0 };
    for (const l of st.lines) t[l.status] += 1;
    const picked = st.lines.filter((l) => l.pick && l.rec).length;
    const bits = [];
    if (t.new) bits.push(t.new + " new");
    if (t.clash) bits.push(t.clash + " differ from what is stored");
    if (t.same) bits.push(t.same + " already in");
    if (t.bad) bits.push(t.bad + " refused");
    const clashNote = t.clash
      ? '<p class="sch-hint ink-clashnote">A line that <b>differs</b> is an <b>update</b> of the entry '
        + "already in the log &mdash; it keeps that entry&#39;s identity instead of adding a second one "
        + "for the same day. It is <b>not</b> ticked for you: tick it only when the block is the newer "
        + "truth.</p>"
      : "";
    const picks = picked
      ? esc(picked + (picked === 1 ? " line" : " lines") + " will be written, stamped «"
          + I().AGENT + "»")
      : "Nothing is ticked &mdash; nothing will be written.";
    return '<p class="ink-tally">' + esc(bits.join(" · ") || "nothing read") + "</p>"
      + clashNote + '<p class="ink-picked">' + picks + "</p>";
  }

  function paint() {
    if (!st) return;
    const box = st.veil.querySelector(".ink-out");
    const ft = st.veil.querySelector(".ink-foot");
    const go = st.veil.querySelector('[data-ink="write"]');
    if (box) box.innerHTML = rows();
    if (ft) ft.innerHTML = foot();
    if (go) {
      const n = st.lines.filter((l) => l.pick && l.rec).length;
      go.disabled = !n || locked();
      go.textContent = n ? "✎ Write " + n : "✎ Write";
    }
  }

  function check() {
    if (!st) return;
    const w = I().world();
    if (!w) { if (S()) S().toast("The Scheduler is still loading.", "bad"); return; }
    const ta = st.veil.querySelector(".ink-in");
    const out = I().parse(ta ? ta.value : "", w);
    st.lines = out.lines;
    st.fatal = out.fatal;
    paint();
  }

  function doWrite() {
    if (!st || locked()) return;
    const out = I().write(st.lines);
    if (!out.wrote) { if (S()) S().toast("Nothing was written.", "bad"); return; }
    if (S()) {
      S().toast(out.wrote + (out.wrote === 1 ? " entry" : " entries")
        + " written and stamped — the bridge holds them until you press ✈ Push now.", "good");
    }
    close();
  }

  function open() {
    if (st) { const t = st.veil.querySelector(".ink-in"); if (t) t.focus(); return; }
    if (!document.body) return;
    const veil = document.createElement("div");
    veil.className = "ed-pop ink-pop";
    const lockNote = locked()
      ? '<p class="ink-lock">Editor mode is <b>off</b>, so nothing can be written on this device. '
        + "Checking a block still works &mdash; unlock when you are ready to write.</p>"
      : "";
    veil.innerHTML = '<div class="ed-box ink-box" role="dialog" aria-modal="true" aria-label="Intake">'
      + "<h3>⇩ Intake — a block of flights, checked before it lands</h3>"
      + '<p class="hint">One JSON object per line (or one array). '
      + "<code>date student node</code> are required; "
      + "<code>instructor device result score duration maneuvers note</code> are optional. "
      + "Per student, flying and ground items only &mdash; a special sortie, an NFS, a lesson block "
      + "or a class-wide entry goes through the form, which asks for what those need.</p>"
      + lockNote
      + '<textarea class="ink-in" spellcheck="false" rows="7" placeholder=\''
      + '{"date":"2026-10-28","sp":"SP-14","node":"F4404","ip":"IP-03","dev":"T-6A","dur":"1.4"}\'>'
      + "</textarea>"
      + '<div class="ed-row ink-row">'
      + '<button type="button" class="sch-tbtn" data-ink="check">⇵ Check</button>'
      + '<span class="sch-spacer"></span>'
      + '<button type="button" class="sch-tbtn" data-ink="write" disabled>✎ Write</button>'
      + '<button type="button" class="sch-tbtn" data-ink="close">↩ Close</button>'
      + "</div>"
      + '<div class="ink-out"></div><div class="ink-foot"></div></div>';
    document.body.appendChild(veil);
    st = { veil: veil, lines: [], fatal: "" };

    veil.addEventListener("click", (e) => {
      if (e.target === veil) { close(); return; }               // η αυλαία ακυρώνει
      const b = e.target.closest("[data-ink]");
      if (!b || !st) return;
      const act = b.dataset.ink;
      if (act === "close") close();
      else if (act === "check") check();
      else if (act === "write") doWrite();
      else if (act === "pick") {
        const l = st.lines[Number(b.dataset.i)];
        if (l && l.rec) { l.pick = !!b.checked; paint(); }
      }
    });
    document.addEventListener("keydown", onKey, true);
    const ta = veil.querySelector(".ink-in");
    if (ta) ta.focus();
  }

  if (window.SchedIntake) {
    window.SchedIntake.open = open;
    window.SchedIntake.close = close;
  }
})();
