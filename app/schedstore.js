"use strict";
/* SchedStore — the Scheduler's persistence layer (Phase A of specs/scheduler-spec.md).
 *
 * MODEL
 *   Ten collections, each in its own localStorage key under the "p2r-sch-" prefix:
 *     students · instructors · classes · trainingLog · availability · dutyRoster ·
 *     gates · instructorCurrency
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

  /* ══ DISPLAY NAMES — "Koroniadis N."          (Round 12a, 18/08/2026) ═════
     User ruling: «Αντί να φαίνεται το object id να φαίνεται το Surname,
     Name (πρώτο γράμμα). Δηλαδή για εμένα θα έβλεπα Koroniadis N.» — repeated
     a second time («Όχι object id, αλλά ονόματα όπως είπαμε»), so it is an
     acceptance criterion, not a preference: NOTHING outside an edit form
     renders an internal handle any more.

     THE RULE, in order
       1. last name + first initial + "."          → "Koroniadis N."
       2. the last name alone, when no first name  → "Koroniadis"
       3. the code, when the record carries no name at all → "IP-7"

     DISAMBIGUATION IS COMPUTED, NOT HOPED FOR
       Two people can honestly land on the same label ("Koroniadis N." twice).
       When they do, EVERY member of that clash carries its code —
       "Koroniadis N. (IP-3)" · "Koroniadis N. (IP-9)" — so the reader is never
       shown two identical names for two different pilots. Students and
       instructors are ONE pool for this purpose: a board line, a duty cell and
       a log row put both on the same screen.
       The index is rebuilt on every store write (emit → invalidate), so a
       rename creates or clears the tag immediately.

     CODES REMAIN THE KEYS
       Nothing about storage changes. Codes stay in the edit forms, in the
       tooltips, in every dropdown option ("Koroniadis N. (IP-3)") and in every
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

  /* ── CRUD ───────────────────────────────────────────────────────────────── */
  function get(name) { return db[name]; }

  function put(name, data) {
    if (!COLLS[name]) throw new Error("SchedStore: unknown collection " + name);
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
    const id = availId(person, date);
    if (!status || status === "available") { remove("availability", id); return "available"; }
    upsert("availability", { id: id, person: person, date: date, status: status });
    return status;
  }

  /* ── day plans (Phase B) ────────────────────────────────────────────────── */
  function dayPlan(date) { return (db.dayPlans || {})[date] || null; }
  function putDayPlan(date, plan) {
    db.dayPlans[date] = plan;
    persist("dayPlans");
    emit("dayPlans", "put", plan);
    return plan;
  }
  function removeDayPlan(date) {
    if (!(date in (db.dayPlans || {}))) return false;
    delete db.dayPlans[date];
    persist("dayPlans");
    emit("dayPlans", "remove", null);
    return true;
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
    let data;
    try { data = JSON.parse(await readFile(file)); }
    catch (e) { toast("Import failed — not valid JSON.", "bad"); return false; }
    if (!data || typeof data !== "object") { toast("Import failed — unexpected file.", "bad"); return false; }

    const pick = (n) => {
      const c = COLLS[n];
      const v = data[n] !== undefined ? data[n] : data[c.seed];
      if (c.type === "list") return Array.isArray(v) ? v : null;
      return v && typeof v === "object" ? v : null;
    };
    const found = NAMES.filter((n) => pick(n) !== null);
    if (!found.length) { toast("Import failed — no scheduler collection inside.", "bad"); return false; }

    const n = (pick("students") || []).length + "/" + (pick("trainingLog") || []).length;
    if (!confirm("Import replaces the whole scheduler store (students/log: " + n + ").\n"
      + "The current data is lost unless you exported it first.\n\nContinue?")) return false;

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
    if (!confirm("Reset the scheduler to the seed file?\n"
      + "Roster, training log, availability, duties, gates and day plans are all discarded.\n\nContinue?")) return false;
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

  /* ── Export / Import / Reset buttons for #sch-tools ─────────────────────── */
  function mountTools(host) {
    if (!host || host._schTools) return;
    host._schTools = true;
    host.innerHTML = `
      <button type="button" class="sch-tbtn" data-t="export" title="Download a JSON backup of the whole scheduler store">⭳ Export</button>
      <button type="button" class="sch-tbtn" data-t="import" title="Replace the store from a JSON backup">⭱ Import</button>
      <button type="button" class="sch-tbtn danger" data-t="reset" title="Discard everything and reload the seed file">↺ Reset</button>
      <input type="file" accept="application/json,.json" class="sch-file" hidden>`;
    const file = host.querySelector(".sch-file");
    host.addEventListener("click", (e) => {
      const b = e.target.closest("[data-t]");
      if (!b) return;
      if (b.dataset.t === "export") exportAll();
      else if (b.dataset.t === "import") file.click();
      else if (b.dataset.t === "reset") resetToSeed();
    });
    file.addEventListener("change", async () => {
      if (file.files && file.files[0]) await importAll(file.files[0]);
      file.value = "";
    });
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
    /* Round 12a — display names ("Koroniadis N."), one helper for the whole app */
    personLabel, personLabelOf, personOption, personOptionOf, personOf, baseLabel,
    seedError: () => seedError,
  };
})();
