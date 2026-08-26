"use strict";
/* SchedStore — the Scheduler's persistence layer (Phase A of specs/scheduler-spec.md).
 *
 * MODEL
 *   Eleven collections, each in its own localStorage key under the "p2r-sch-" prefix:
 *     students · instructors · classes · trainingLog · availability · dutyRoster ·
 *     gates · instructorCurrency · bridgeLog
 *                      → lists of records addressed by a per-collection key field
 *     config           → one object
 *     dayPlans         → one map { "YYYY-MM-DD": plan }        (Phase B writes it)
 *
 * LAZY SEED
 *   The very first open (no "p2r-sch-meta" of the current schema) fetches
 *   ../data/scheduler/seed.json and writes every collection. Afterwards the seed
 *   file is never read again — the store is the source of truth. resetToSeed()
 *   re-runs the seeding after an explicit confirmation.
 *
 * SOURCE OF TRUTH
 *   Only FACTS are stored (who exists, what happened, who was away). Everything
 *   that can be computed — node status, readiness, balance — is computed by
 *   SchedReady / the Board and is never persisted.
 *
 * LIVE UPDATES
 *   subscribe(fn) → fn(collection, action, record). Every put/upsert/remove and
 *   every import/reset notifies. Returns an unsubscribe function.
 *
 * NOTE ON get()
 *   get() hands back the LIVE in-memory object, not a copy — treat it as
 *   read-only and route every change through put/upsert/remove so that the
 *   write to localStorage and the notification actually happen.
 *
 * EDIT LOCK (Round 12b — user directive «Τα edit και save να μπορω να τα κανω
 *   μονο εγω.»)
 *   VIEW-ONLY IS THE DEFAULT. Every mutating entry point below asks
 *   window.SchedEdit first and REFUSES (toast + null) while the lock is on —
 *   the UI veneer is a courtesy, this is the wall. system(fn) is the one
 *   named hole: replication and bookkeeping the owner's own devices do to
 *   each other (the sync applying a pulled snapshot, the boot pass that mints
 *   OIDs). It never runs from a UI event. See the SchedEdit block at the
 *   bottom of this file and specs/scheduler-spec.md § 13.
 */
(() => {
  const PREFIX = "p2r-sch-";
  const SCHEMA = "scheduler-store-v1";
  const SEED_URL = "../data/scheduler/seed.json";

  /* type: list = array of records · obj = single object · map = plain dictionary
     key : the field that identifies a record inside a list                     */
  const COLLS = {
    students:     { type: "list", key: "code", seed: "students" },
    instructors:  { type: "list", key: "code", seed: "instructors" },
    classes:      { type: "list", key: "id",   seed: "classes" },
    trainingLog:  { type: "list", key: "id",   seed: "training_log" },
    availability: { type: "list", key: "id",   seed: "availability" },
    dutyRoster:   { type: "list", key: "date", seed: "duty_roster" },
    gates:        { type: "list", key: "id",   seed: "gates" },
    /* Round 10b — one row per INSTRUCTOR OID:
       { oid, items: { <catalog_item_id>: { last_date: "YYYY-MM-DD", src?, note? } }, updated_at }
       Written only through SchedCurrency.bump() (scheduler.js § ③). */
    instructorCurrency: { type: "list", key: "oid", seed: "instructor_currency" },
    /* ROUND 21 — THE BRIDGE CHANGE LOG (bridge ruling #2, verbatim: «όπως σε
       κάθε σωστά οργανωμένη βάση δεδομένων καταγράφουμε μεταβολές για δυνατότητα
       rollback»). One row per act the Bridge performed on the training log —
       create · update · undo — carrying who/when/rid, what was written and what
       was there BEFORE, so that ↺ Undo can revert exactly that write and nothing
       else. Written only through SchedBridge (app/schedbridge.js § ③), which
       goes through upsert() like every other write and therefore meets the edit
       lock. It is store data: it syncs, it exports and it restores with
       everything else. Shape: specs/bridge-spec.md § 13γ. */
    bridgeLog:    { type: "list", key: "id",   seed: "bridge_log" },
    config:       { type: "obj",  seed: "config" },
    dayPlans:     { type: "map",  seed: "day_plans" },
  };
  const NAMES = Object.keys(COLLS);
  const empty = (t) => (t === "list" ? [] : {});

  const db = {};
  NAMES.forEach((n) => { db[n] = empty(COLLS[n].type); });

  const subs = new Set();
  let readyP = null;
  let seedError = null;

  /* ── localStorage (never throws: file:// and private mode stay usable) ──── */
  function lsGet(k) {
    try { return localStorage.getItem(PREFIX + k); } catch (e) { return null; }
  }
  function lsSet(k, v) {
    try { localStorage.setItem(PREFIX + k, v); return true; }
    catch (e) { console.warn("SchedStore: cannot write " + PREFIX + k, e); return false; }
  }
  function lsDel(k) { try { localStorage.removeItem(PREFIX + k); } catch (e) {} }
  function parse(s, fb) { try { return s == null ? fb : JSON.parse(s); } catch (e) { return fb; } }

  function persist(name) {
    lsSet(name, JSON.stringify(db[name]));
    lsSet("meta", JSON.stringify({ schema: SCHEMA, saved_at: new Date().toISOString() }));
  }
  function persistAll() { NAMES.forEach(persist); }

  function emit(coll, action, rec) {
    labels.clash = null;                 // a rename must re-decide the "(code)" tags
    subs.forEach((fn) => { try { fn(coll, action, rec); } catch (e) { console.error(e); } });
  }

  /* ── boot ───────────────────────────────────────────────────────────────── */
  function ready() { if (!readyP) readyP = boot(); return readyP; }

  async function boot() {
    const meta = parse(lsGet("meta"), null);
    if (meta && meta.schema === SCHEMA) { loadLocal(); return db; }
    await seedFresh(false);
    return db;
  }

  function loadLocal() {
    for (const n of NAMES) {
      const raw = parse(lsGet(n), null);
      const t = COLLS[n].type;
      if (t === "list") db[n] = Array.isArray(raw) ? raw : [];
      else db[n] = raw && typeof raw === "object" ? raw : {};
    }
    normalize();
  }

  async function seedFresh(persistOnFailure) {
    let seed = null;
    try {
      const r = await fetch(SEED_URL, { cache: "no-store" });
      if (r.ok) seed = await r.json();
      else seedError = "seed.json → HTTP " + r.status;
    } catch (e) { seedError = "seed.json could not be read (" + e.message + ")"; }

    for (const n of NAMES) {
      const c = COLLS[n];
      const v = seed ? seed[c.seed] : null;
      if (c.type === "list") db[n] = Array.isArray(v) ? JSON.parse(JSON.stringify(v)) : [];
      else db[n] = v && typeof v === "object" ? JSON.parse(JSON.stringify(v)) : {};
    }
    normalize();
    if (seed || persistOnFailure) persistAll();
    return !!seed;
  }

  /* Records that predate an id (hand-edited imports, older seeds) get one, so
     that upsert/remove always have a handle. Idempotent.                      */
  function normalize() {
    for (const n of NAMES) {
      const c = COLLS[n];
      if (c.type !== "list") continue;
      if (!Array.isArray(db[n])) { db[n] = []; continue; }
      for (const rec of db[n]) {
        if (rec && typeof rec === "object" && rec[c.key] == null) rec[c.key] = uid(n.slice(0, 3));
      }
    }
    if (!db.config || typeof db.config !== "object") db.config = {};
    if (!db.dayPlans || typeof db.dayPlans !== "object") db.dayPlans = {};
  }

  let seq = 0;
  function uid(tag) {
    seq += 1;
    return (tag || "r") + "-" + Date.now().toString(36) + "-" + seq.toString(36);
  }

  /* ══ DISPLAY NAMES — "Instructor01 T."          (Round 12a, 18/08/2026) ═════
     User ruling: «Αντί να φαίνεται το object id να φαίνεται το Surname,
     Name (πρώτο γράμμα). Δηλαδή για εμένα θα έβλεπα <Επώνυμο> Ν.» — repeated
     a second time («Όχι object id, αλλά ονόματα όπως είπαμε»), so it is an
     acceptance criterion, not a preference: NOTHING outside an edit form
     renders an internal handle any more.

     THE RULE, in order
       1. last name + first initial + "."          → "Instructor01 T."
       2. the last name alone, when no first name  → "Instructor01"
       3. the code, when the record carries no name at all → "IP-7"

     DISAMBIGUATION IS COMPUTED, NOT HOPED FOR
       Two people can honestly land on the same label ("Instructor01 T." twice).
       When they do, EVERY member of that clash carries its code —
       "Instructor01 T. (IP-1)" · "Instructor01 T. (IP-14)" — so the reader is
       never shown two identical names for two different pilots (that pair is
       the collision the PUBLIC SEED carries on purpose). Students and
       instructors are ONE pool for this purpose: a board line, a duty cell and
       a log row put both on the same screen.
       The index is rebuilt on every store write (emit → invalidate), so a
       rename creates or clears the tag immediately.

     CODES REMAIN THE KEYS
       Nothing about storage changes. Codes stay in the edit forms, in the
       tooltips, in every dropdown option ("Instructor01 T. (IP-1)") and in every
       search/filter — only the READING changes.                            */
  const NAMED = ["instructors", "students"];
  const labels = { clash: null };
  const nameTrim = (v) => String(v == null ? "" : v).trim();

  /* the label BEFORE any disambiguation — pure, so it can be called on a
     record that is not in the store yet (an import preview, a form draft) */
  function baseLabel(rec) {
    if (!rec || typeof rec !== "object") return "";
    const last = nameTrim(rec.last_name);
    if (!last) return nameTrim(rec.code);
    const first = nameTrim(rec.first_name);
    /* [...first][0] and not first[0]: a surrogate pair must not be cut in half */
    const ini = first ? [...first][0] : "";
    return ini ? last + " " + ini.toLocaleUpperCase() + "." : last;
  }

  /* normalised label → the set of CODES wearing it. size > 1 = a real clash. */
  function clashIndex() {
    if (labels.clash) return labels.clash;
    const m = new Map();
    for (const coll of NAMED) {
      for (const rec of db[coll] || []) {
        const b = baseLabel(rec);
        if (!b) continue;
        const k = b.toLocaleLowerCase();
        if (!m.has(k)) m.set(k, new Set());
        m.get(k).add(nameTrim(rec.code));
      }
    }
    labels.clash = m;
    return m;
  }

  function personLabel(rec) {
    const b = baseLabel(rec);
    if (!b) return "";
    const code = nameTrim(rec && rec.code);
    if (!code || b === code) return b;              // the code already IS the label
    const set = clashIndex().get(b.toLocaleLowerCase());
    return set && set.size > 1 ? b + " (" + code + ")" : b;
  }

  /* a stored reference (a code) → the label. An id the roster does not know is
     handed back verbatim: a historical log row must never lose its person. */
  function personLabelOf(coll, id) {
    const rec = coll ? find(coll, id) : personOf(id);
    return rec ? personLabel(rec) : nameTrim(id);
  }
  function personOf(id) {
    if (id == null || id === "") return null;
    for (const coll of NAMED) { const r = find(coll, id); if (r) return r; }
    return null;
  }
  /* every person dropdown says the same thing: the name, then the code that is
     actually stored — so the CO can still read the key he types elsewhere. */
  function personOption(rec) {
    const b = personLabel(rec);
    const code = nameTrim(rec && rec.code);
    if (!b) return code;
    if (!code || b === code || b.indexOf("(" + code + ")") >= 0) return b;
    return b + " (" + code + ")";
  }
  function personOptionOf(coll, id) {
    const rec = coll ? find(coll, id) : personOf(id);
    return rec ? personOption(rec) : nameTrim(id);
  }

  /* ══ THE WRITE GATE ═══════════════════════════════════════════════════════
     Round 12b. Reads are never gated; every WRITE passes here first.
       · system(fn) runs fn with the gate suspended. Two callers only, both
         machine-to-machine and neither of them a UI event: SchedSync applying
         a snapshot it just pulled from the owner's own repo, and the boot pass
         that mints a missing OID. fn must be SYNCHRONOUS — the depth counter
         would be decremented before an async body finished.
       · mayWrite(what) is what every seam calls. With no SchedEdit loaded at
         all it allows the write (the module below always loads with this file;
         the guard is for a hand-assembled bundle that dropped it, where the
         honest failure mode is a working app, not a bricked one).            */
  let sysDepth = 0;
  function system(fn) {
    sysDepth += 1;
    try { return fn(); } finally { sysDepth -= 1; }
  }
  function mayWrite(what) {
    if (sysDepth > 0) return true;
    const E = window.SchedEdit;
    if (!E || E.on()) return true;
    E.refuse(what);
    return false;
  }

  /* ── CRUD ───────────────────────────────────────────────────────────────── */
  function get(name) { return db[name]; }

  function put(name, data) {
    if (!COLLS[name]) throw new Error("SchedStore: unknown collection " + name);
    if (!mayWrite("replace " + name)) return null;
    const t = COLLS[name].type;
    db[name] = t === "list" ? (Array.isArray(data) ? data : []) : (data && typeof data === "object" ? data : {});
    normalize();
    persist(name);
    emit(name, "put", null);
    return db[name];
  }

  function keyOf(name) { return COLLS[name] && COLLS[name].key; }

  function find(name, id) {
    const k = keyOf(name);
    if (!k) return null;
    return (db[name] || []).find((r) => String(r[k]) === String(id)) || null;
  }

  function upsert(name, rec) {
    const c = COLLS[name];
    if (!c || c.type !== "list") throw new Error("SchedStore: upsert needs a list collection, got " + name);
    if (!rec || typeof rec !== "object") throw new Error("SchedStore: upsert needs a record");
    if (!mayWrite("save")) return null;
    if (rec[c.key] == null || rec[c.key] === "") rec[c.key] = uid(name.slice(0, 3));
    const list = db[name];
    const i = list.findIndex((r) => String(r[c.key]) === String(rec[c.key]));
    if (i >= 0) list[i] = Object.assign({}, list[i], rec);
    else list.push(rec);
    persist(name);
    emit(name, i >= 0 ? "update" : "insert", rec);
    return i >= 0 ? list[i] : rec;
  }

  function remove(name, id) {
    const c = COLLS[name];
    if (!c || c.type !== "list") throw new Error("SchedStore: remove needs a list collection, got " + name);
    if (!mayWrite("delete")) return null;
    const list = db[name];
    const i = list.findIndex((r) => String(r[c.key]) === String(id));
    if (i < 0) return false;
    const [gone] = list.splice(i, 1);
    persist(name);
    emit(name, "remove", gone);
    return true;
  }

  function subscribe(fn) {
    if (typeof fn !== "function") return () => {};
    subs.add(fn);
    return () => subs.delete(fn);
  }

  /* ── config ─────────────────────────────────────────────────────────────── */
  function cfg(key, fallback) {
    const v = db.config ? db.config[key] : undefined;
    return v === undefined ? fallback : v;
  }
  function setConfig(patch) {
    if (!mayWrite("change a setting")) return null;
    db.config = Object.assign({}, db.config, patch || {});
    persist("config");
    emit("config", "put", null);
    return db.config;
  }

  /* ── derived helpers (classes are READ-ONLY: they follow the members) ───── */
  function classList() {
    const bag = new Map();
    for (const s of db.students || []) {
      const id = (s.class || "—").trim() || "—";
      if (!bag.has(id)) bag.set(id, { id: id, members: [], start_date: "" });
      bag.get(id).members.push(s.code);
    }
    for (const c of db.classes || []) {
      if (bag.has(c.id) && c.start_date) bag.get(c.id).start_date = c.start_date;
    }
    return [...bag.values()].sort((a, b) => a.id.localeCompare(b.id));
  }
  function membersOf(classId) {
    return (db.students || []).filter((s) => (s.class || "") === classId).map((s) => s.code);
  }
  function classOf(studentCode) {
    const s = find("students", studentCode);
    return s ? (s.class || "") : "";
  }

  /* ── availability (only the non-available days are stored) ──────────────── */
  const availId = (person, date) => person + "|" + date;

  function availabilityFor(date) {
    const m = new Map();
    for (const a of db.availability || []) if (a.date === date) m.set(a.person, a.status);
    return m;
  }
  function availabilityOf(person, date) {
    const a = find("availability", availId(person, date));
    return a ? a.status : "available";
  }
  function setAvailability(person, date, status) {
    if (!mayWrite("change availability")) return null;
    const id = availId(person, date);
    if (!status || status === "available") { remove("availability", id); return "available"; }
    upsert("availability", { id: id, person: person, date: date, status: status });
    return status;
  }

  /* ── day plans (Phase B) ────────────────────────────────────────────────── */
  function dayPlan(date) { return (db.dayPlans || {})[date] || null; }
  function putDayPlan(date, plan) {
    if (!mayWrite("save the day plan")) return null;
    db.dayPlans[date] = plan;
    persist("dayPlans");
    emit("dayPlans", "put", plan);
    return plan;
  }
  function removeDayPlan(date) {
    if (!mayWrite("clear the day plan")) return null;
    if (!(date in (db.dayPlans || {}))) return false;
    delete db.dayPlans[date];
    persist("dayPlans");
    emit("dayPlans", "remove", null);
    return true;
  }

  /* ══ ROUND 20 — THE DANGER BURIAL ═════════════════════════════════════════
     USER RULING, 22/08/2026 (verbatim): «Το import και το reset νομίζω
     περισσότερο επικίνδυνα είναι παρά βοηθούν.»

     They are NOT removed — a backup you cannot restore is not a backup, and a
     seed you cannot return to is not a seed. They are BURIED, and every layer
     costs a deliberate act:
       1 · OUT OF REACH   they leave the first line of the toolbar and live
                          under one «⋯» at its end. ☁ Sync and ⭳ Export — the
                          two that cannot lose anything — stay in sight.
       2 · THE EDIT LOCK  both demand ✎ Editor mode BEFORE anything opens: no
                          OS file picker, no dialog. A view-only device is told
                          WHICH act it refused, in the seam's own words.
       3 · THE TYPED WORD the confirmation stopped being a click. REPLACE for
                          Import, RESET for Reset, typed into a dialog that
                          still carries the old counts sentence word for word.
     THE TWO-IMPORTS GUARDS KEEP THEIR PLACE — before the word step — so a
     refused file never costs a single keystroke. See specs/scheduler-spec.md
     § 21.

     esc() lives twice in this file on purpose: the SchedEdit IIFE below has its
     own, and this one is the same five-character map. The dialog interpolates
     record COUNTS, which are digits today — and "it is digits today" is exactly
     the assumption that stops being true one refactor from now.             */
  const ESC5 = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ESC5[c]);

  /* Layer 2 asked BEFORE the UI moves, so a view-only device never meets an OS
     file picker it is not allowed to use. The seam behind each of these asks
     again through mayWrite() and remains the wall — this is the courtesy that
     makes the refusal NAME the act instead of shrugging. */
  const editOn = () => { const E = window.SchedEdit; return !E || E.on(); };
  function refuseWrite(what) {
    const E = window.SchedEdit;
    if (E && E.refuse) return E.refuse(what);
    toast("View-only — unlock Editor mode to " + what + ".", "bad");
    return false;
  }

  /* THE TYPED-WORD DIALOG. House modal, nothing new invented: the .ed-pop veil
     and the .ed-box card the editor dialog already uses, tokens-only.
     Esc cancels · ↩ Cancel cancels · a click on the veil cancels · and CANCEL
     MEANS NOTHING HAPPENS: the promise resolves false and the caller returns
     before a single collection is touched. Enter submits, so the keyboard alone
     finishes it. The comparison is trimmed and case-insensitive on purpose —
     the gate is «read the sentence and type the word», not «hold shift».     */
  let wordBusy = false;
  function wordPrompt(o) {
    return new Promise((resolve) => {
      /* ROUND 20b · finding 7 — NEVER A SILENT NO-OP. This branch used to
         resolve(false) without a word to anybody: the console route
         (`SchedStore.importAll(f)` while the Reset dialog is up) looked like a
         refusal that came from the seam, and a body-less document looked like
         nothing at all. Both now SAY which one happened, and the open dialog
         takes the focus back so the eye lands on the thing that is in the way. */
      if (wordBusy) {                                               // never two at once
        toast("One of these at a time — finish the dialog that is already open.", "bad");
        const live = document.querySelector(".sch-wordpop #sch-wordin");
        if (live) live.focus();
        resolve(false);
        return;
      }
      if (!document.body) {                                         // nowhere to put it
        toast("Cannot ask for the word yet — the page is still loading.", "bad");
        resolve(false);
        return;
      }
      wordBusy = true;
      const veil = document.createElement("div");
      veil.className = "ed-pop sch-wordpop";
      veil.innerHTML = `<div class="ed-box" role="dialog" aria-modal="true" aria-label="${esc(o.title)}">
        <div class="ed-ico" aria-hidden="true">${esc(o.ico || "⚠")}</div>
        <h3>${esc(o.title)}</h3>
        <p class="hint">${o.body}</p>
        <label class="ed-lbl" for="sch-wordin">Type ${esc(o.word)} to continue</label>
        <input id="sch-wordin" type="text" autocomplete="off" spellcheck="false"
               placeholder="${esc(o.word)}" aria-describedby="sch-wordmsg">
        <div class="ed-row">
          <button type="button" class="sch-tbtn danger" data-w="go"><span class="sch-dgl">${esc(o.ico || "⚠")}</span> ${esc(o.go)}</button>
          <button type="button" class="sch-tbtn" data-w="cancel">↩ Cancel</button>
        </div>
        <div class="ed-status" id="sch-wordmsg" role="status"></div>
      </div>`;
      /* ROUND 20b · finding 7 — THE WEDGE. The teardown used to hang off
         `veil.parentNode`: if anything removed the veil from outside (a devtools
         delete, a rogue innerHTML on <body>, a future dialog manager), the very
         first line returned and the LAST THREE NEVER RAN — the capture-phase
         keydown listener stayed on the document for the life of the page and
         `wordBusy` stayed true, which killed BOTH ⭱ Import and ↺ Reset until a
         reload. The idempotence the guard was really buying is now bought by a
         local flag; `parentNode` guards only the one line it belongs to. */
      let finished = false;
      const done = (v) => {
        if (finished) return;
        finished = true;
        document.removeEventListener("keydown", onKey, true);
        wordBusy = false;
        if (veil.parentNode) veil.remove();
        resolve(v);
      };
      const submit = () => {
        const el = veil.querySelector("#sch-wordin");
        const typed = String(el ? el.value : "").trim();
        if (typed.toUpperCase() === String(o.word).toUpperCase()) { done(true); return; }
        const m = veil.querySelector("#sch-wordmsg");
        if (m) m.textContent = typed ? "that is not the word — type " + o.word : "type " + o.word + " to continue";
        if (el) { el.focus(); el.select(); }
      };
      function onKey(e) {
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); done(false); return; }
        if (e.key === "Enter" && veil.contains(e.target)) { e.preventDefault(); e.stopPropagation(); submit(); }
      }
      veil.addEventListener("click", (e) => {
        if (e.target === veil || e.target.closest('[data-w="cancel"]')) { done(false); return; }
        if (e.target.closest('[data-w="go"]')) submit();
      });
      document.addEventListener("keydown", onKey, true);
      document.body.appendChild(veil);
      const f = veil.querySelector("#sch-wordin");
      if (f) setTimeout(() => f.focus(), 50);
    });
  }

  /* ── backup: export / import / reset ────────────────────────────────────── */
  function snapshot() {
    const out = { schema: SCHEMA, exported_at: new Date().toISOString() };
    for (const n of NAMES) out[n] = db[n];
    return out;
  }

  function exportAll() {
    const blob = new Blob([JSON.stringify(snapshot(), null, 1)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "scheduler-backup-" + new Date().toISOString().slice(0, 10) + ".json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast("Backup exported.", "good");
    return true;
  }

  async function readFile(file) {
    if (file.text) return file.text();
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(String(fr.result));
      fr.onerror = () => rej(new Error("read failed"));
      fr.readAsText(file);
    });
  }

  /* Whole-store replacement. Accepts both a snapshot (camelCase keys) and a raw
     seed file (snake_case keys) so a hand-written seed can be imported too.   */
  async function importAll(file) {
    if (!file) return false;
    if (!mayWrite("import a backup")) return false;
    let data;
    try { data = JSON.parse(await readFile(file)); }
    catch (e) { toast("Import failed — not valid JSON.", "bad"); return false; }
    if (!data || typeof data !== "object") { toast("Import failed — unexpected file.", "bad"); return false; }

    /* THE TWO-IMPORTS TRAP (2026-08-18, live incident): this button restores a
       FULL STORE BACKUP. Handed the global roster file it would obediently
       replace the whole store with two raw collections — codes minted from
       record ids, callsigns/quals wiped, config (and the editor lock) gone.
       That exact accident ate an evening. The roster has its own merge that
       never destroys anything: Roster pane → "⭱ Import roster".            */
    if (data.schema === "global-roster-v1"
        || (Array.isArray(data.instructors)
            && data.instructors.some((r) => r && r.call_sign !== undefined)
            && data.trainingLog === undefined && data.config === undefined)) {
      toast("This file is the GLOBAL ROSTER, not a store backup — use Roster → “⭱ Import roster”, which merges by OID and never wipes anything.", "bad");
      return false;
    }

    /* THE SAME TRAP, ONE DOOR OVER (Round 18): a WINGS AHEAD EXPORT is people
       and student records, not a scheduler store. Handed to this button it
       would find no collection and — worse, once it grows a `students` key —
       could replace the store with somebody else's shape. The Bridge only ever
       READS it (Scheduler → Bridge), so the refusal points there.
       The shape test is repeated here on purpose instead of calling
       SchedBridge.looksLikeWaExport(): this guard is a WALL and must stand
       even if app/schedbridge.js failed to load. Keep the two in step. */
    if (data.schema === "wa-export-v1"
        || (Array.isArray(data.people) && Array.isArray(data.student_records)
            && data.trainingLog === undefined && data.config === undefined)) {
      toast("This file is a WINGS AHEAD EXPORT, not a store backup — use Scheduler → “Bridge”, which only reads it, compares it with this store and writes nothing.", "bad");
      return false;
    }

    const pick = (n) => {
      const c = COLLS[n];
      const v = data[n] !== undefined ? data[n] : data[c.seed];
      if (c.type === "list") return Array.isArray(v) ? v : null;
      return v && typeof v === "object" ? v : null;
    };
    const found = NAMES.filter((n) => pick(n) !== null);
    if (!found.length) { toast("Import failed — no scheduler collection inside.", "bad"); return false; }

    /* Round 20 · layer 3 — the counts sentence is the old confirm(), word for
       word; only «Continue?» has become a word you have to type. */
    const n = (pick("students") || []).length + "/" + (pick("trainingLog") || []).length;
    const go = await wordPrompt({
      /* the glyph is no longer part of `go`: the dialog renders it from `ico`
         inside `.sch-dgl`, so the danger tone reaches it at rest too (§ 21η).
         What the button READS is byte-identical: «⭱ Replace the store». */
      ico: "⭱", word: "REPLACE", go: "Replace the store",
      title: "Replace the whole scheduler store?",
      body: "Import replaces the whole scheduler store (students/log: <b>" + esc(n) + "</b>). "
        + "The current data is lost unless you exported it first. It replaces all "
        + NAMES.length + " collections, the config and the editor code with them.",
    });
    if (!go) return false;

    for (const name of NAMES) {
      const v = pick(name);
      db[name] = v !== null ? v : empty(COLLS[name].type);
    }
    normalize();
    persistAll();
    emit("*", "import", null);
    toast("Store replaced from file.", "good");
    return true;
  }

  async function resetToSeed() {
    if (!mayWrite("reset the store")) return false;
    const go = await wordPrompt({
      ico: "↺", word: "RESET", go: "Reset to the seed",     // glyph from `ico` — see above
      title: "Reset the scheduler to the seed file?",
      body: "Roster, training log, availability, duties, gates, day plans and the Bridge change log "
        + "are all discarded. "
        + "The editor code goes with them, so this device is left with no code set. "
        + "This browser’s sync settings and the copy on GitHub are NOT touched.",
    });
    if (!go) return false;
    const ok = await seedFresh(true);
    for (const n of NAMES) lsDel(n);
    persistAll();
    emit("*", "reset", null);
    toast(ok ? "Reset to seed." : "Seed file not reachable — store emptied.", ok ? "good" : "bad");
    return ok;
  }

  /* ── toast (shared with scheduler.js) ───────────────────────────────────── */
  let toastT = null;
  function toast(msg, kind) {
    /* ROUND 20b — a toast asked for before <body> exists used to throw inside
       appendChild, which turned "tell the user" into "lose the message AND the
       call stack". It is now HELD until the body arrives, so the sentence still
       lands; nothing is swallowed and nothing reaches the console. */
    if (!document.body) {
      document.addEventListener("DOMContentLoaded", () => toast(msg, kind), { once: true });
      return;
    }
    let el = document.getElementById("sch-toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "sch-toast";
      el.className = "sch-toast";
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.className = "sch-toast is-on" + (kind ? " is-" + kind : "");
    clearTimeout(toastT);
    toastT = setTimeout(() => { el.className = "sch-toast"; }, 2600);
  }

  /* ── Export / Import / Reset buttons for #sch-tools ───────────────────────
     ROUND 19 — THE HOVER RULE, user directive of 22/08/2026: «οπου εχουμε
     βελακια που μπορει να επηρεασουν την βαση δεδομενων να εχουμε hover
     εξηγησης.» Every glyph that can WRITE says, on hover, three things and in
     this order: WHAT it replaces or writes · WHAT it never touches · THE SAFE
     PATH. Read-only glyphs (🖨 Print, ✕ Close, ‹ › day nav, the Bridge pane's
     READ controls — its ✔ Apply / ↦ adopt / ↺ Undo have carried theirs since
     Phase 3) are deliberately left silent: a tooltip on a control that cannot
     hurt you only teaches the eye to skip tooltips.

     These four are AUTHOR-WRITTEN CONSTANTS with no interpolation, which is
     why they go into the attribute directly. They must therefore never contain
     a double quote — «…» and “…” are the house quotes and are safe inside
     title="…".

     ROUND 20 — the tooltips of ⭱ Import and ↺ Reset TRAVELLED WITH THEM into
     the «⋯» menu, unchanged in substance: the burial moved the buttons, it did
     not make them safer, and a shorter tooltip on a control that is now harder
     to reach would be the wrong trade. ⋯ itself earns one for the same reason
     ☁ Sync did — it writes nothing, but it is the DOOR to two things that
     replace everything. */
  const TIP = {
    export: "Writes NOTHING — it reads the store and hands you the file. "
      + "Downloads scheduler-backup-YYYY-MM-DD.json: every collection, config included. "
      + "It carries REAL NAMES, so keep it off shared drives and out of the repo. "
      + "This is the way back from ⭱ Import and ↺ Reset — take one first.",
    import: "Replaces the WHOLE scheduler store with the chosen backup file — people, classes, "
      + "training log, availability, duties, gates, currency, day plans and config (the editor code with it). "
      + "It needs ✎ Editor mode, and it asks TWICE: it names the counts and then makes you type REPLACE. "
      + "It touches nothing in the cloud until the next push, and "
      + "nothing outside the Scheduler. It refuses a global roster file and a Wings Ahead export BY NAME, "
      + "before any of that. "
      + "For the shared roster use Roster → ⭱ Import roster, which merges by OID and wipes nothing. "
      + "Take a ⭳ Export first — the current data is gone otherwise.",
    reset: "Throws the whole store away and rebuilds it from the seed file that ships with the app. "
      + "Roster, training log, availability, duties, gates, currency, day plans and config all go — "
      + "the editor code with them, so this device is left with no code set. "
      + "It needs ✎ Editor mode and makes you type RESET. "
      + "It does NOT touch this browser’s sync settings or the ☁ Sync access code (those live outside the store), "
      + "and it does NOT touch the GitHub copy — a later ⭳ Pull brings the old data back, while a ⭱ Push after this "
      + "replaces the repo with the seed. Take a ⭳ Export first.",
    more: "Opens the two controls that can REPLACE THE WHOLE STORE — ⭱ Import a backup and ↺ Reset to the seed. "
      + "They live behind this button, and not on the toolbar, because they are more dangerous than they are useful "
      + "(ruling of 22/08/2026). Opening this menu changes nothing: each one still needs ✎ Editor mode and a "
      + "typed word before it does anything at all.",
  };

  /* ROUND 20 · layer 1 — the first line keeps only what cannot lose anything:
     ☁ Sync (inserted here by schedsync.js) and ⭳ Export. The other two move
     behind «⋯».

     THE MENU LIVES ON document.body, like the sync and editor dialogs, and for
     one more reason that is not cosmetic: #sch-tools sits inside
     #view-scheduler, which the edit lock's capture guard treats as DENY BY
     DEFAULT. A button swallowed there says «unlock Editor mode to change
     anything» — the generic sentence. Out here each one reaches its own gate
     and names the act it refused, in the same words the seam uses.
     Only «⋯» stays inside the guarded nav, and it is on the NAV list below
     precisely because it opens a menu and writes nothing. */
  function mountTools(host) {
    if (!host || host._schTools) return;
    host._schTools = true;
    host.innerHTML = `
      <button type="button" class="sch-tbtn" data-t="export" title="${TIP.export}">⭳ Export</button>
      <button type="button" class="sch-tbtn sch-morebtn" data-t="more" aria-haspopup="true"
        aria-expanded="false" aria-controls="sch-morepop" title="${TIP.more}">⋯</button>`;
    const moreBtn = host.querySelector('[data-t="more"]');

    let pop = document.getElementById("sch-morepop");
    if (!pop) { pop = document.createElement("div"); pop.id = "sch-morepop"; document.body.appendChild(pop); }
    pop.className = "sch-morepop hidden";
    pop.setAttribute("role", "menu");
    pop.setAttribute("aria-label", "Store backup and reset");
    pop.innerHTML = `
      <p class="sch-morehint">Both of these REPLACE THE WHOLE STORE. Each one needs ✎ Editor mode
        and asks you to type a word before anything happens.</p>
      <button type="button" class="sch-tbtn" role="menuitem" data-t="import" title="${TIP.import}">⭱ Import</button>
      <button type="button" class="sch-tbtn danger" role="menuitem" data-t="reset" title="${TIP.reset}"><span class="sch-dgl">↺</span> Reset</button>
      <input type="file" accept="application/json,.json" class="sch-file" hidden>`;
    const file = pop.querySelector(".sch-file");

    const isOpen = () => !pop.classList.contains("hidden");
    function onMoreKey(e) {
      if (e.key !== "Escape") return;
      e.preventDefault();
      closeMore();
      moreBtn.focus();
    }
    function closeMore() {
      pop.classList.add("hidden");
      moreBtn.setAttribute("aria-expanded", "false");
      document.removeEventListener("keydown", onMoreKey, true);
    }
    function openMore() {
      pop.classList.remove("hidden");
      moreBtn.setAttribute("aria-expanded", "true");
      /* right-aligned under the button, never off the left edge */
      const r = moreBtn.getBoundingClientRect();
      const w = pop.offsetWidth || 268;
      pop.style.left = Math.round(Math.max(8, r.right - w)) + "px";
      pop.style.top = Math.round(r.bottom + 6) + "px";
      document.addEventListener("keydown", onMoreKey, true);
      const first = pop.querySelector("[data-t]");
      if (first) setTimeout(() => first.focus(), 30);
    }

    host.addEventListener("click", (e) => {
      const b = e.target.closest("[data-t]");
      if (!b) return;
      if (b.dataset.t === "export") exportAll();
      else if (b.dataset.t === "more") { if (isOpen()) closeMore(); else openMore(); }
    });
    pop.addEventListener("click", (e) => {
      const b = e.target.closest("[data-t]");
      if (!b) return;
      /* LAYER 2 — never a silent no-op: a locked device is told which act it
         just refused, and no OS file picker is opened behind the refusal. */
      if (b.dataset.t === "import") {
        if (!editOn()) { refuseWrite("import a backup"); return; }
        file.click();
        closeMore();
      } else if (b.dataset.t === "reset") {
        if (!editOn()) { refuseWrite("reset the store"); return; }
        closeMore();
        void resetToSeed();
      }
    });
    file.addEventListener("change", async () => {
      const chosen = file.files && file.files[0];
      file.value = "";
      if (chosen) await importAll(chosen);
    });
    /* outside click, a resize and a SCROLL close the menu — an anchored popover
       that stays behind a moved anchor is a lie about what it belongs to.
       ROUND 20b · finding 6 — the comment above already promised the scroll and
       only the resize was wired: the menu is `position: fixed` at coordinates
       taken from the button ONCE, so scrolling the Scheduler view slid the
       anchor out from under it and left the card floating over unrelated rows.
       CAPTURE PHASE on purpose: scroll does not bubble, so a bubble-phase
       listener on window would miss every inner scroller — and the pane, the
       board and the log all scroll inside their own boxes. */
    document.addEventListener("click", (e) => {
      if (!isOpen()) return;
      if (e.target.closest && (e.target.closest("#sch-morepop") || e.target.closest('[data-t="more"]'))) return;
      closeMore();
    });
    window.addEventListener("resize", () => { if (isOpen()) closeMore(); });
    window.addEventListener("scroll", () => { if (isOpen()) closeMore(); }, true);
  }

  window.SchedStore = {
    SCHEMA, PREFIX, COLLECTIONS: NAMES,
    ready, get, put, find, upsert, remove, keyOf, subscribe,
    cfg, setConfig,
    classList, membersOf, classOf,
    availabilityFor, availabilityOf, setAvailability,
    dayPlan, putDayPlan, removeDayPlan,
    snapshot, exportAll, importAll, resetToSeed, mountTools,
    uid, toast,
    /* Round 12b — the edit lock's one hole (see mayWrite above) */
    system, mayWrite,
    /* Round 12a — display names ("Instructor01 T."), one helper for the whole app */
    personLabel, personLabelOf, personOption, personOptionOf, personOf, baseLabel,
    seedError: () => seedError,
  };
})();

/* ══════════════════════════════════════════════════════════════════════════
   EDIT LOCK — window.SchedEdit                                  (Round 12b)
   ══════════════════════════════════════════════════════════════════════════
   USER DIRECTIVE, 18/08/2026: «Τα edit και save να μπορω να τα κανω μονο εγω.»

   VIEW-ONLY IS THE DEFAULT — everywhere, from the first paint, on every device
   and after every reload. Nothing in the Scheduler, the Currency matrix, the
   Progress editor, the Training Log, the duty roster or the imports may change
   a record until EDITOR MODE is unlocked with the owner's code.

   THREE LAYERS, IN THE ORDER THAT MATTERS
     1 · THE SEAM     SchedStore.put / upsert / remove / setConfig /
                      setAvailability / putDayPlan / removeDayPlan / importAll /
                      resetToSeed refuse and return null. This is the layer that
                      actually holds: it does not care whether a button was
                      disabled, whether the DOM is stale, whether a render
                      forgot a case or whether the call came from the console.
     2 · THE GUARD    ONE capture-phase listener swallows click / Enter / Space /
                      change inside the guarded views unless the target is on
                      the NAVIGATION list, and says why. It exists so that
                      nothing half-happens in the UI before the seam refuses.
     3 · THE VENEER   a MutationObserver disables the real form controls after
                      every repaint, so the screen LOOKS like what it is. It is
                      the courtesy layer, never the protection.

   HONEST LIMITATION — printed here and in specs/scheduler-spec.md § 13
     This is a DETERRENT for shared screens, borrowed laptops and exported
     files. It is NOT cryptography: everything runs client-side, so whoever
     opens devtools can flip a flag, and the localStorage copy of the data is
     readable to anyone sitting at that keyboard. What actually protects the
     data is the ACCESS-CODE CURTAIN (privacy veil, schedsync.js) and the
     AES-GCM encryption of the cloud copy. The edit lock protects the DATA'S
     INTEGRITY against the honest passer-by, not its confidentiality against an
     attacker.

   THE VERIFIER — where it lives and why
     PBKDF2-SHA256, 310 000 iterations, 16-byte random salt: the same shape as
     the curtain's verifier, and deliberately NOT a bare SHA-256 of a short
     code (a 4-6 character code hashed once is a rainbow-table lookup; the
     directive's «SHA-256 hash» is honoured as the hash FAMILY, hardened).
     It is stored in the STORE CONFIG — so it travels to the owner's other
     devices inside the encrypted sync, exactly as asked — and it is a
     VERIFIER: it never yields the code back.
     Per device the unlock is remembered in localStorage as the FINGERPRINT of
     the verifier it was granted for. Change the code anywhere and every other
     device drops back to view-only by itself the next time it reads the store.

   FIRST-EVER ENABLE (trust on first use)
     With no verifier in the config, the button offers to SET one. That is the
     honest bootstrap: before the owner sets a code there is nothing to check
     against. Once set and synced, every other device must type it.
   ══════════════════════════════════════════════════════════════════════════ */
(() => {
  const S = () => window.SchedStore;
  const CFG_KEY = "editor_lock";          // inside the SYNCED store config
  const OPEN_KEY = "p2r-edit-open";       // localStorage: this device, this verifier
  const ITER = 310000;
  const MIN_LEN = 4;

  const $ = (id) => document.getElementById(id);
  const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ESC[c]);
  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
  const lsDel = (k) => { try { localStorage.removeItem(k); } catch (e) {} };

  /* WebCrypto helpers — a deliberate 20-line duplicate of schedsync.js's.
     This file must not depend on schedsync.js: that module is injected
     dynamically by app.js and is absent from the offline bundle, while the
     write gate above has to work from the very first paint.                 */
  function bytesToB64(u8) {
    let bin = "";
    for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function b64ToBytes(b64) {
    const bin = atob(String(b64 || "").replace(/\n/g, ""));
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8;
  }
  async function verifierHash(secret, saltU8, iter) {
    if (!(window.crypto && crypto.subtle)) throw new Error("WebCrypto unavailable in this context");
    const mat = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", hash: "SHA-256", salt: saltU8, iterations: iter }, mat, 256);
    return bytesToB64(new Uint8Array(bits));
  }

  /* ── state ──────────────────────────────────────────────────────────────── */
  const st = { open: false, msg: "", busy: false };
  const subs = new Set();

  const verifier = () => { const v = S() ? S().cfg(CFG_KEY, null) : null; return v && v.hash ? v : null; };
  const fingerprint = (v) => (v ? String(v.hash).slice(0, 24) : "");
  const hasCode = () => !!verifier();

  /* The device flag is only worth anything while it still names THIS verifier:
     a code changed on another device re-locks this one on the next read. */
  function on() {
    if (!st.open) return false;
    const v = verifier();
    if (!v) { st.open = false; return false; }          // the code was removed / reset away
    if (lsGet(OPEN_KEY) !== fingerprint(v)) { st.open = false; return false; }
    return true;
  }

  function boot() {
    const v = verifier();
    st.open = !!v && lsGet(OPEN_KEY) === fingerprint(v);
  }

  function emit() {
    paint();
    subs.forEach((fn) => { try { fn(on()); } catch (e) { console.error(e); } });
    repaintViews();
  }
  const subscribe = (fn) => { if (typeof fn === "function") subs.add(fn); return () => subs.delete(fn); };

  /* the views own their own HTML; they are asked to redraw, never patched */
  function repaintViews() {
    const live = (id) => { const el = $(id); return !!el && !el.classList.contains("hidden"); };
    if (live("view-scheduler") && window.schInit) { try { window.schInit(); } catch (e) { console.error(e); } }
    if (live("view-currency") && window.curInit) { try { window.curInit(); } catch (e) { console.error(e); } }
  }

  /* ROUND 19 — THE HOVER RULE (user directive, 22/08/2026). Of the four buttons
     in this dialog, two only move a flag on THIS DEVICE (lock / unlock) and two
     WRITE THE STORE CONFIG, which the sync then carries to every other device.
     They looked alike; now they say which they are. ✕ Close stays silent. */
  const ETIP = {
    lock: "Puts THIS DEVICE back to view-only. It moves a flag in this browser and nothing else — "
      + "no scheduler data changes, the code itself is untouched, and other devices are unaffected. "
      + "The 👁 View button in the topbar does exactly this in one click.",
    unlock: "Opens THIS DEVICE for editing until you lock it again. It writes nothing to the store: "
      + "the code you type is only checked against the stored verifier, never saved anywhere as text.",
    set: "WRITES THE STORE: it puts a salted PBKDF2-SHA256 verifier of this code into the scheduler config, "
      + "so the next ⭱ Push carries it to every other device — each of them then asks for this code before "
      + "anything may be changed there. No scheduler data is touched, and the code itself is never stored, "
      + "never recoverable and never readable from here. ↺ Reset removes it along with everything else.",
    change: "WRITES THE STORE: replaces the stored verifier with one for the new code — the current code must "
      + "be typed first. Every OTHER device falls back to view-only until the new code is typed there. "
      + "No scheduler data is touched.",
  };

  /* ── the three write actions ────────────────────────────────────────────── */
  async function setCode(code, oldCode) {
    const v = verifier();
    if (v) {                                            // changing an existing code
      if (!(await matches(oldCode))) return "the current code is wrong";
    }
    if (String(code || "").length < MIN_LEN) return "the code must be at least " + MIN_LEN + " characters";
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const rec = { v: 1, kdf: "PBKDF2-SHA256", iter: ITER, salt: bytesToB64(salt),
      hash: await verifierHash(code, salt, ITER), set_at: new Date().toISOString() };
    /* the write that installs the lock is itself gated by the lock — the one
       place where that would be a deadlock, so it goes through system() */
    S().system(() => S().setConfig({ [CFG_KEY]: rec }));
    lsSet(OPEN_KEY, fingerprint(rec));
    st.open = true;
    emit();
    return "";
  }

  async function matches(code) {
    const v = verifier();
    if (!v) return true;
    if (!code) return false;
    return (await verifierHash(code, b64ToBytes(v.salt), (v.iter | 0) || ITER)) === v.hash;
  }

  async function unlock(code) {
    const v = verifier();
    if (!v) return "no editor code is set yet";
    if (!(await matches(code))) return "wrong code";
    lsSet(OPEN_KEY, fingerprint(v));
    st.open = true;
    emit();
    return "";
  }

  function lock() {
    lsDel(OPEN_KEY);
    st.open = false;
    emit();
  }

  /* ── the refusal ────────────────────────────────────────────────────────── */
  let lastToast = 0;
  function refuse(what) {
    const now = Date.now();
    if (now - lastToast > 1200) {                       // one burst = one toast
      lastToast = now;
      if (S() && S().toast) {
        S().toast("View-only — unlock Editor mode to " + (what || "change anything") + ".", "bad");
      }
    }
    const b = $("edit-btn");
    if (b) { b.classList.remove("is-shake"); void b.offsetWidth; b.classList.add("is-shake"); }
    return false;
  }

  /* ══ THE NAVIGATION LIST ═════════════════════════════════════════════════
     Deny by default: inside a guarded view every control is treated as a
     mutation UNLESS it is named here. A missed navigation control is an
     annoyance the user reports; a missed mutation control would be data
     changing while the app says it cannot — the directive's whole point.
     Every entry below reads or moves the VIEW and writes no record.        */
  const NAV = [
    ".sch-subtab", "[data-sec]", "[data-cursec]", "[data-pv]", "[data-bal]",  // panes, sections, print bar, balance period
    "#sch-rosterq", "#sch-avdate", "#sch-progq", "[data-flt]",                // filters and searches
    '[data-act="exp-s"]', '[data-act="exp-i"]', '[data-act="cancel"]',        // open / close a row
    '[data-act="prog-s"]', '[data-act="toggle-form"]', '[data-act="nfs-dismiss"]',
    '[data-pb="close"]', '[data-pb="cancel"]', '[data-pb="sec"]',             // the progress panel's own navigation
    '[data-pb="ctr"]', '[data-pb="goto"]', '[data-pb="st-cancel"]',
    '[data-b="date"]', '[data-b="day-1"]', '[data-b="day+1"]',                // which day the board SHOWS
    '[data-b="day-today"]', '[data-b="print"]', '[data-b="allip"]',
    '[data-t="export"]', "#sync-open", '[data-act="cur-print"]',              // read-only exits: backup, sync dialog, binder sheet
    /* ROUND 20 — «⋯» OPENS A MENU AND WRITES NOTHING, exactly like #sync-open
       one entry above: it is the door, not the act. The two acts behind it —
       ⭱ Import and ↺ Reset — are NOT on this list and never will be: their
       buttons live on document.body, outside this guard's scope, where each
       meets its own SchedEdit.on() check and then its own seam. Putting them
       here would be the mistake this comment exists to prevent. */
    '[data-t="more"]',
    /* ROUND 18 — THE BRIDGE. Every control NAMED HERE reads: it chooses a
       file, filters the report, prints it, clears it, or opens/closes the
       change log. Denying those would make the report unreachable in the
       default state of every device, for no gain — the same category, and the
       same line, as the backup export and the sync dialog above.

       ROUND 21 — AND THE PROMISE THIS LIST MADE WAS KEPT. Slice 1 wrote:
       «if a later slice gives the Bridge a control that WRITES, that control
       must NOT be a [data-brg] one — it goes outside this list and meets the
       lock like every other write.» Phase 3 gave it exactly that, and the
       write controls carry their own attribute **[data-brgw]** (Apply · adopt ·
       Apply N selected · ↺ Undo · the row checkboxes), which is deliberately
       ABSENT from every entry below. They are guarded like any other mutation:
       the veneer disables them, the capture guard refuses the click by name,
       and SchedStore.upsert() asks mayWrite() a third time. */
    "[data-brg]", ".brg-file", "[data-brgq]",
    "[data-nav]",                                                             // anything a view marks explicitly
  ].join(",");
  /* the three hosts the guard covers. #sch-progmodal is created lazily on
     document.body, so it is looked up every time instead of cached. */
  const SCOPE = "#view-scheduler, #view-currency, #sch-progmodal";
  const FORMS = "button, input, select, textarea";
  const ACTIVE = FORMS + ', [role="button"], [tabindex], [data-cell], [data-act], [data-b],'
    + " [data-lb], [data-wb], [data-ab], [data-pb], [data-av], [data-away], [data-avchip],"
    + " [data-rankchip], [data-add-sp], [data-sfip], [data-t], [data-duty], [data-mix]";

  function guarded(t) {
    if (!t || !t.closest) return null;
    if (!t.closest(SCOPE)) return null;
    if (t.closest(NAV)) return null;
    return t.closest(ACTIVE);
  }
  function onCapture(e) {
    if (on()) return;
    /* a click may have just OPENED a lazily-created host (the Progress panel
       is appended to <body> the first time it is asked for), so the veneer is
       re-queued from here as well as from the observer */
    scheduleSweep();
    if (!guarded(e.target)) return;
    e.preventDefault();
    e.stopPropagation();
    refuse("");
  }

  /* ── the veneer ─────────────────────────────────────────────────────────
     Only real form controls are touched: `disabled` is native, keyboard-safe
     and needs no CSS to be honest. Everything else (the matrix cells, the
     summary rows) is left to the guard and to the stylesheet, which is why
     1 365 currency cells cost nothing here.
     Marked with data-edlk so that unlocking re-enables exactly what THIS
     module disabled and never what the app disabled for its own reasons
     (a published board, a step that is not reachable yet).                 */
  const observed = new WeakSet();
  let sweepQ = 0;
  function roots() {
    const out = [];
    for (const sel of SCOPE.split(",")) { const el = document.querySelector(sel.trim()); if (el) out.push(el); }
    return out;
  }
  function sweep() {
    const live = on();
    for (const root of roots()) {
      if (!observed.has(root)) { observed.add(root); mo.observe(root, { childList: true, subtree: true }); }
      if (live) {
        for (const el of root.querySelectorAll("[data-edlk]")) {
          el.disabled = false;
          el.removeAttribute("data-edlk");
          el.classList.remove("is-edlk");
        }
      } else {
        for (const el of root.querySelectorAll(FORMS)) {
          if (el.disabled || el.closest(NAV)) continue;
          el.disabled = true;
          el.setAttribute("data-edlk", "1");
          el.classList.add("is-edlk");
        }
      }
    }
  }
  /* setTimeout, NOT requestAnimationFrame: a background tab never paints, and
     "the veneer only appears once you look at it" would be a lie about when a
     control became inert. A 0-timeout still coalesces one repaint's worth of
     mutations into a single sweep.                                          */
  function scheduleSweep() {
    if (sweepQ) return;
    sweepQ = setTimeout(() => { sweepQ = 0; sweep(); }, 0);
  }
  /* childList only: setting `disabled` is an ATTRIBUTE change, so the veneer
     can never re-trigger itself into a loop. */
  const mo = new MutationObserver(scheduleSweep);

  /* ── the topbar buttons + the dialog ─────────────────────────────────────
     TWO buttons, and the second one exists because of Round 14: «Προσθεσε
     κουμπι να βλεπουμε το view mode, δηλαδη εξοδο απο τον editor.» Leaving
     Editor mode used to cost three clicks through a dialog that also offers
     "change the code" — one 👁 does it now. It is the SAME lock() the dialog
     calls, so there is no second way out of Editor mode, only a shorter one;
     and it is hidden while the device is already locked, because a button that
     does nothing is worse than no button.                                    */
  function paint() {
    const live = on();
    document.documentElement.setAttribute("data-edit", live ? "on" : "off");
    const b = $("edit-btn");
    if (b) {
      b.textContent = live ? "✎ Editor" : "🔒 View-only";
      b.classList.toggle("is-on", live);
      b.setAttribute("aria-pressed", live ? "true" : "false");
      b.title = live
        ? "EDITOR MODE is on for THIS DEVICE — every save, delete and import is allowed. "
          + "Click to lock it back to view-only. This button changes no data either way."
        : (hasCode()
          ? "View-only on THIS DEVICE: everything is readable and nothing can be saved, deleted or imported. "
            + "Click and type the editor code to unlock it. This button changes no data either way."
          : "View-only on THIS DEVICE. No editor code has been set yet — click to set one. "
            + "Setting it writes a verifier into the scheduler config, which the sync carries to your other devices.");
    }
    const v = $("edit-view-btn");
    if (v) {
      v.classList.toggle("hidden", !live);
      v.setAttribute("aria-hidden", live ? "false" : "true");
      v.tabIndex = live ? 0 : -1;
    }
    sweep();
  }

  function mount() {
    if ($("edit-btn")) return true;
    const bar = document.querySelector(".topbar");
    if (!bar) return false;
    const b = document.createElement("button");
    b.type = "button";
    b.id = "edit-btn";
    b.className = "viewtab ed-btn";
    const v = document.createElement("button");
    v.type = "button";
    v.id = "edit-view-btn";
    v.className = "viewtab ed-btn ed-view hidden";
    v.textContent = "👁 View";
    v.title = "ONE CLICK: lock this device back to view-only. Exactly what “🔒 Lock this device” "
      + "does in the Editor dialog, without the dialog. It is shown only while Editor mode is on.";
    const badge = $("databadge");
    if (badge) { bar.insertBefore(b, badge); bar.insertBefore(v, badge); } else { bar.appendChild(b); bar.appendChild(v); }
    b.addEventListener("click", openPop);
    v.addEventListener("click", () => {
      if (!on()) return;                       // already locked: nothing to say
      lock();
      closePop();                              // if the dialog happened to be open
      S().toast("Locked — view-only on this device.", "good");
    });
    paint();
    return true;
  }

  function popHost() {
    let p = $("ed-pop");
    if (p) return p;
    p = document.createElement("div");
    p.id = "ed-pop";
    p.className = "ed-pop hidden";
    document.body.appendChild(p);
    p.addEventListener("click", (e) => {
      if (e.target === p || e.target.closest('[data-e="close"]')) { closePop(); return; }
      const b = e.target.closest("[data-e]");
      if (b) void act(b.dataset.e);
    });
    p.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { closePop(); return; }
      if (e.key === "Enter" && e.target.tagName === "INPUT") {
        e.preventDefault();
        void act(hasCode() ? (on() ? "change" : "unlock") : "set");
      }
    });
    return p;
  }
  function closePop() { const p = $("ed-pop"); if (p) p.classList.add("hidden"); }

  function openPop() {
    st.msg = "";
    renderPop();
    popHost().classList.remove("hidden");
    const f = $("ed-in1");
    if (f) setTimeout(() => f.focus(), 50);
  }

  function renderPop() {
    const p = popHost();
    const live = on();
    const has = hasCode();
    const v = verifier();
    p.innerHTML = `<div class="ed-box" role="dialog" aria-modal="true" aria-label="Editor mode">
      <div class="ed-ico" aria-hidden="true">${live ? "✎" : "🔒"}</div>
      <h3>${live ? "Editor mode is ON" : "View-only"}</h3>
      <p class="hint">${live
        ? "This device may save, delete and import. Lock it again when you hand the screen over."
        : has
          ? "Everything is readable; nothing can be changed. Type the editor code to unlock this device — it stays unlocked until you lock it."
          : "No editor code has been set yet. Set one now: it is stored as a salted PBKDF2-SHA256 verifier inside the store, so it travels to your other devices with the sync — never as plain text, and never recoverable from here."}</p>
      ${live ? "" : (has
        ? `<label class="ed-lbl" for="ed-in1">Editor code</label>
           <input id="ed-in1" type="password" autocomplete="off" placeholder="the code you set">`
        : `<label class="ed-lbl" for="ed-in1">New editor code</label>
           <input id="ed-in1" type="password" autocomplete="off" placeholder="min ${MIN_LEN} characters">
           <label class="ed-lbl" for="ed-in2">Repeat it</label>
           <input id="ed-in2" type="password" autocomplete="off" placeholder="the same code again">`)}
      ${live && has ? `<hr class="ed-hr">
        <h3>Change the code</h3>
        <p class="hint">Every other device falls back to view-only until the new code is typed there.</p>
        <label class="ed-lbl" for="ed-in1">Current code</label>
        <input id="ed-in1" type="password" autocomplete="off">
        <label class="ed-lbl" for="ed-in2">New code</label>
        <input id="ed-in2" type="password" autocomplete="off" placeholder="min ${MIN_LEN} characters">` : ""}
      <div class="ed-row">
        ${live
          ? `<button type="button" class="sch-tbtn" data-e="lock" title="${esc(ETIP.lock)}">🔒 Lock this device</button>
             <button type="button" class="sch-tbtn" data-e="change" title="${esc(ETIP.change)}">Change code</button>`
          : (has
            ? `<button type="button" class="sch-tbtn ed-go" data-e="unlock" title="${esc(ETIP.unlock)}">Unlock</button>`
            : `<button type="button" class="sch-tbtn ed-go" data-e="set" title="${esc(ETIP.set)}">Set the code</button>`)}
        <button type="button" class="sch-tbtn" data-e="close">✕ Close</button>
      </div>
      <div class="ed-status" id="ed-status">${esc(st.msg)}</div>
      <p class="hint ed-fine">Honest about what this is: a deterrent for shared screens and borrowed
        laptops, <b>not</b> cryptography — everything here runs in the browser. Privacy is the 🔒 access-code
        curtain; the cloud copy is what the AES-GCM sync passphrase encrypts.${v && v.set_at
          ? " Code set " + esc(window.fmtDMY ? window.fmtDMY(String(v.set_at).slice(0, 10)) : String(v.set_at).slice(0, 10)) + "."
          : ""}</p>
    </div>`;
  }

  function say(msg) {
    st.msg = msg;
    const el = $("ed-status");
    if (el) el.textContent = msg;
  }
  const val = (id) => { const el = $(id); return el ? el.value.trim() : ""; };

  async function act(what) {
    if (st.busy) return;
    st.busy = true;
    try {
      if (what === "lock") { lock(); closePop(); S().toast("Locked — view-only on this device.", "good"); return; }
      if (what === "set") {
        const a = val("ed-in1"), b = val("ed-in2");
        if (a !== b) { say("the two codes do not match"); return; }
        say("deriving the verifier…");
        const err = await setCode(a, "");
        if (err) { say(err); return; }
        closePop();
        S().toast("Editor code set — this device is unlocked.", "good");
        return;
      }
      if (what === "unlock") {
        say("checking…");
        const err = await unlock(val("ed-in1"));
        if (err) { say(err); return; }
        closePop();
        S().toast("Editor mode ON.", "good");
        return;
      }
      if (what === "change") {
        const oldC = val("ed-in1"), newC = val("ed-in2");
        if (!oldC || !newC) { say("type the current code and the new one"); return; }
        say("deriving the verifier…");
        const err = await setCode(newC, oldC);
        if (err) { say(err); return; }
        renderPop();
        say("code changed ✓ — other devices must type the new one");
        return;
      }
    } catch (e) { say(e.message); }
    finally { st.busy = false; }
  }

  /* ── boot ───────────────────────────────────────────────────────────────── */
  document.addEventListener("click", onCapture, true);
  document.addEventListener("change", onCapture, true);
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    if (e.target && e.target.tagName === "INPUT") return;      // typing, not activating
    onCapture(e);
  }, true);

  window.SchedEdit = { on, hasCode, refuse, lock, unlock, setCode, subscribe, sweep, MIN_LEN };

  function start() {
    boot();
    if (!mount()) setTimeout(start, 300);
    /* the verifier lives in the store: re-read it after the seed loads and
       after every pull, so a code set on another device takes effect here */
    if (S()) {
      S().ready().then(() => { boot(); paint(); });
      S().subscribe((coll) => { if (coll === "config" || coll === "*") { boot(); paint(); } });
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();

/* ══════════════════════════════════════════════════════════════════════════
   THE HOUSE FOCUS TRAP — one listener for every `.ed-pop` dialog
   ══════════════════════════════════════════════════════════════════════════
   ROUND 20b · finding 8, 22/08/2026.

   THE LEAK. `.ed-pop` + `.ed-box` is the house's ONE modal shape: the Editor
   dialog (`#ed-pop`) wears it, and the Round-20 typed-word dialog reuses it
   verbatim (`.sch-wordpop`). Both painted a veil over the page and both let the
   KEYBOARD walk straight off the card: Tab from «↩ Cancel» landed on whatever
   was behind the veil, and from there Enter activated it — a control the user
   could neither see nor point at, while a dialog that says «type RESET to
   continue» was still on screen. A modal that only stops the mouse is not a
   modal.

   WHY THE TAB WRAP AND NOT `inert` / `aria-hidden` ON THE SIBLINGS. Both of the
   alternatives are STATE: something must put them on and something must take
   them off again. The failure this same round fixed two screens up (finding 7 —
   an externally-removed veil that never ran its teardown) is exactly the shape
   of bug that state invites, and there it would leave the whole page
   permanently unfocusable instead of merely wedged. The wrap holds NO state:
   it reads the DOM on each Tab, and the moment no `.ed-pop` is visible it stops
   having an opinion. `inert` is also Fx112+, and `aria-hidden` moves nothing
   for a sighted keyboard user, who is precisely who was leaking.

   WHAT IT DOES, AND ONLY THAT
     · Tab / Shift+Tab inside a visible `.ed-pop` cycle within its `.ed-box`;
     · Tab with focus outside (page load, a click on the veil) is pulled back
       to the first control of the card;
     · with two cards open, the LAST visible one in the DOM wins — the word
       dialog is appended fresh at open and sits at z-index 102, above the
       editor's 72, so «last in the DOM» is «the one on top».
   Esc, Enter, the click handlers, the veil-cancel and every other key are
   untouched: this listener returns immediately for anything that is not Tab.
   See specs/scheduler-spec.md § 21ζ.                                        */
(function () {
  "use strict";
  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]),'
    + ' select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  function liveBox() {
    const pops = document.querySelectorAll(".ed-pop");
    for (let i = pops.length - 1; i >= 0; i--) {          // topmost = last painted
      if (pops[i].classList.contains("hidden")) continue;
      const box = pops[i].querySelector(".ed-box");
      if (box) return box;
    }
    return null;
  }

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Tab" || e.altKey || e.ctrlKey || e.metaKey) return;
    const box = liveBox();
    if (!box) return;
    const list = Array.from(box.querySelectorAll(FOCUSABLE))
      .filter((el) => el.offsetParent !== null || el === document.activeElement);
    e.preventDefault();                                   // the trap owns Tab in here
    if (!list.length) return;
    const at = list.indexOf(document.activeElement);
    let next;
    if (at === -1) next = e.shiftKey ? list[list.length - 1] : list[0];
    else if (e.shiftKey) next = at === 0 ? list[list.length - 1] : list[at - 1];
    else next = at === list.length - 1 ? list[0] : list[at + 1];
    next.focus();
  }, true);
})();
