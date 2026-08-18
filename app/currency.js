"use strict";
/* ══════════════════════════════════════════════════════════════════════════
   INSTRUCTOR CURRENCY — its own top-level tab            (Round 11, 18/08/2026)
   ══════════════════════════════════════════════════════════════════════════
   User directive of 18/08/2026: «Εγώ το θέλω σε ξεχωριστή καρτέλα όπως είναι
   το scheduler, validate, κλπ. Αρχικά θα έχουμε τους εκπαιδευτές και δύο
   πίνακες, αυτούς ανά εξάμηνο που θα μπορούμε να βάλουμε πληροφορίες και μετά
   τα υπόλοιπα item που λήγουν ή δε λήγουν.»

   WHAT MOVED HERE
     § ③ of scheduler.js — window.SchedCurrency — moved VERBATIM (Round 10b/
     10c/10d behaviour untouched) and extended with the semester model below.
     The Roster keeps NOTHING currency-related any more (user ruling: «Τίποτα»):
     the dot, the "owes N" chip and the card all live in this tab.

   THE TWO TABLES
     ① ΑΝΑ ΕΞΑΜΗΝΟ — the 15 sim / s-category items. These are semester QUOTAS
       (Πίνακας 6 = F/S, Πίνακας 9 = air), i.e. "how many sorties this
       semester", NOT rolling windows. They carry an editable COUNTER per
       semester and never touch the availability tally.
     ② ΛΗΓΟΥΝ / ΔΕΝ ΛΗΓΟΥΝ — the other 76 items, exactly as Round 10c/10d
       left them: one date each, the min(round(v×25%), 45) colour rule,
       recorded obligations with per-id reasons, ≈ conversions and ⚠ flags.
     15 + 76 = 91 = the whole catalog; every id is rendered exactly once.

   THE ONE EXCEPTION, NAMED OUT LOUD
     `sim-refresh-after-abstention` is of kind "sim", so the kind split puts it
     in table ①, but it is NOT a quota: §49 prints a THRESHOLD IN DAYS (45
     experienced / 30 inexperienced) above which a SIM-1 refresh is required
     before the next air flight, and it really does gate availability. It
     therefore keeps its DATE input, keeps its window colour and keeps counting
     towards the availability dot / "owes N" exactly as in Round 10d — the
     counted totals stay 21 (ΕΜΠ) / 19 (ΑΠ). The row says so on its face.
     Dropping it from the count because of where the kind split puts it would
     have silently deleted a real gate.
   ══════════════════════════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════════════════════════
   THE ENGINE — window.SchedCurrency     (Round 10b/10c/10d; moved here in 11)
   ══════════════════════════════════════════════════════════════════════════
   WHAT IT IS
     Everything that EXPIRES for a T-6A instructor under the 3-01/2025 ΔΑΕ,
     read from the referee-verified catalog
     data/requirements/instructor_currency.json (91 items; its header carries
     the two-pass agreement stats). This module resolves each catalog item
     against ONE instructor's experience level and ONE recorded date and hands
     the UI a status. It computes; it never guesses at the source.

   THE ONE WRITE SEAM
     bump(oid, item_id, date, src) is the ONLY way a date is written. Today
     the Currency card calls it with src="manual"; a future flight-logging
     pass can call it with src="log:<event id>" and the manual date stays the
     truth (an automatic source may only move a date FORWARD and never over a
     manual entry). NOTHING auto-maps today — no sortie, no E-item, no
     exercise code is wired to any catalog row.

   AVAILABILITY vs RECORDED OBLIGATIONS            (Round 10c/10d — finding 1)
     Not every dated row costs the instructor his availability. Fifteen of
     them — see OBLIGATIONS below — are things the catalog itself says do not
     gate the serving instructor (unit conferences, a tenure clock, one-off
     deadlines, the ΠΡ sortie interval that only exists inside a ΠΡ module,
     the ground seminars the 3-01 attaches no consequence to, and the two
     TRAINEE-scoped rules). Each id carries its own user-facing reason — a
     blanket "no availability loss" sentence was proven wrong for the trainee
     pair. They keep their row and their row colour, but they are OUT of the
     availability dot, out of "owes N" and out of the header pill; the card
     counts them on their own line.

   COLOUR SCALE — ONE rule, no exceptions       (Round 10c — finding 2)
     AMBER   days_left <= min(round(validity × 25%), 45)
     RED     expired, or never recorded
     GREEN   anything else
     GREY    no validity to count (no limit · set outside the 3-01 · n/a)
     In words, the same words the card legend and the printed sheet use:
     amber when a quarter of the window — at most 45 days — remains. The 45-day
     ceiling stops a 1-year window from sitting amber for three months; the
     proportional quarter keeps a 10-day window green until its last 3 days.
     ══════════════════════════════════════════════════════════════════════ */
(() => {
  const CAT_URL = "../data/requirements/instructor_currency.json";
  const COLL = "instructorCurrency";
  const S = () => window.SchedStore;

  /* THE colour rule, in two numbers: a quarter of the window, ceilinged at 45
     days. amberAt(days) is the whole rule — nothing else may add a guard. */
  const AMBER_FRACTION = 0.25;    // a quarter of the printed window …
  const AMBER_MAX_DAYS = 45;      // … but never more than 45 days of amber
  const amberAt = (days) => Math.min(Math.round(days * AMBER_FRACTION), AMBER_MAX_DAYS);

  /* the five groups of the card, in card order; every catalog kind maps here */
  const GROUPS = [
    { key: "landing", label: "Landings", kinds: ["landing"], note: "" },
    { key: "sim", label: "SIM / F-S", kinds: ["sim", "s-category"],
      note: "semester QUOTAS (sorties per semester), not rolling windows — the date is recorded, nothing counts down" },
    { key: "recency", label: "Recency", kinds: ["recency"], note: "" },
    { key: "e-item", label: "E-items", kinds: ["e-item"], note: "" },
    { key: "other", label: "Other", kinds: ["other"], note: "" },
  ];

  /* ── RECORDED OBLIGATIONS (Round 10c; per-id reasons + 2 ids in 10d) ─────
     Rows that DO have a countable window but that the catalog itself says do
     not gate the SERVING instructor's availability. Each id carries its own
     user-facing WHY — the R10b/10c verifiers proved a blanket "no availability
     loss" sentence is factually wrong for the trainee-scoped pair. They stay
     on the card, stay editable and keep their row colour; they are excluded
     from the availability dot, from "owes N" and from the header pill, and
     are tallied separately as obligations. Curated by id (not by a keyword
     sniff) so the list stays auditable; every id is checked at load.        */
  const W_NOLOSS = "the 3-01 prints no availability loss for it";
  const W_TRAINEE = "it binds the trainee (εκπαιδευόμενος) in re-assignment training, not the serving instructor — §70 governs him";
  const W_DEADLINE = "it is a one-off deadline / tenure clock, not a recurring currency";
  const W_MODULE = "it applies only while a ΠΡ module is in progress — not a standing currency";
  const OBLIGATIONS = new Map([
    /* the two unit/command conferences of Table 14 */
    ["cross-staff-visits-ata-day", W_NOLOSS],      // «Not an individual currency — no lapse for the instructor.» + flag: «Should not drive a per-instructor colour scale.»
    ["squadron-commanders-conference", W_NOLOSS],  // «Not an individual currency — no lapse for the instructor.» (commanders only)
    /* tenure clock and one-off deadlines — none is a recurring currency */
    ["demo-pilot-tenure", W_DEADLINE],             // «The post must be handed over.» + flag: «A tenure limit, not a currency; printed in years.»
    ["pr-programme-completion", W_DEADLINE],       // «A completion deadline for the programme, not a recurring currency.»
    ["demo-reavailability-15-to-30-days", W_DEADLINE], // 10d — «Beyond 30 days this simplified route closes and the full §20 programme applies.» A restoration-route deadline, same nature as pr-programme-completion (R10c verify item 8).
    /* ΠΡ-module scope — 10d, same argument the catalog itself makes */
    ["pr-sortie-interval", W_MODULE],              // 10d — flag: «Applies only while a ΠΡ module is in progress — it is not a standing currency.» Was silently +1 on every instructor's "owes" (R10c verify item 8).
    /* administrative recurrences the 3-01 attaches no consequence to */
    ["body-weight-check", W_NOLOSS],               // «No consequence is printed in the 3-01.» + flag: «not a currency the instructor holds … informational timer.»
    ["monthly-knowledge-exams", W_NOLOSS],         // «No availability loss is printed in the 3-01.»
    /* the five ground seminars / trainings that print no availability loss.
       Π.ΠΔΟ and Tactics are NOT here: their lapse lines name §69δ(1)/(2) and
       Partially Combat Ready, so those two stay counted. */
    ["seminar-sea-survival", W_NOLOSS],            // «No availability loss is printed in the 3-01.»
    ["training-egress-survival", W_NOLOSS],        // «No availability loss is printed in the 3-01.»
    ["training-aircraft-re-servicing", W_NOLOSS],  // «No availability loss is printed in the 3-01.»
    ["seminar-flight-physiology", W_NOLOSS],       // «No availability loss is printed in the 3-01.»
    ["seminar-hpma-crm-orm", W_NOLOSS],            // «No availability loss is printed in the 3-01.»
    /* TRAINEE-scoped (ΜΕΤ/ΕΕΠ): they bite on an εκπαιδευόμενος in re-assignment
       training, not on a maintenance-stage instructor in normal service (§70). */
    ["trainee-20day-unscored-flight", W_TRAINEE],  // flag: «SCOPE … applies to «εκπαιδευόμενοι» … in normal maintenance-stage service he is governed by §70».
    ["trainee-30day-type-availability-loss", W_TRAINEE], // flag: «SCOPE … bites on a qualified instructor only while he is an εκπαιδευόμενος in re-assignment training».
  ]);
  const isObligation = (id) => OBLIGATIONS.has(id);
  const oblWhy = (id) => OBLIGATIONS.get(id) || "";

  /* ── PROJECT CONVERSIONS (catalog open flag 6) ───────────────────────────
     Table 14 and §§83/85/93 print their validity as a PERIOD WORD, never as
     a day count, and the catalog deliberately refused to infer one. The
     colour scale needs a number, so the project converts — pragmatically,
     visibly (every converted row is marked ≈) and ONLY where the printed
     period really is a validity window. Rows whose printed period is a QUOTA
     (s-* / sim-* — "1 sortie per semester"), a THRESHOLD (abstention up to 2
     years) or a definition are NOT converted: they stay grey. Keyed by item
     id so the list stays auditable against the catalog.                    */
  const PERIOD_CONV = {
    "seminar-pdo": 365,                    // Ετήσια
    "seminar-tactics": 365,                // Ετήσια
    "seminar-sea-survival": 365,           // Ετήσια
    "seminar-hpma-crm-orm": 365,           // Ετήσια · §93 «ισχύ ένα έτος»
    "training-aircraft-re-servicing": 365, // Ετήσια · §83 «μία φορά ανά έτος»
    "training-egress-survival": 92,        // Τριμηνιαία · §82 «κάθε 3 μήνες»
    "seminar-flight-physiology": 1095,     // 3-ετής · §85 «ισχύ για 3 έτη»
    "monthly-knowledge-exams": 30,         // Μηνιαίες εξετάσεις
    "body-weight-check": 122,              // κάθε 4 μήνες
    "cross-staff-visits-ata-day": 365,     // Ετήσια
    "squadron-commanders-conference": 365, // Ετήσια
    "demo-pilot-tenure": 730,              // 2 έτη (παράταση σε 3)
    "pr-programme-completion": 213,        // εντός 7 μηνών
  };
  const CONV_LEGEND = "annual 365 · semi-annual 183 · quarterly 92 · monthly 30 · "
    + "4-monthly 122 · 7-month 213 · 2-year 730 · 3-year 1095";
  const CONV_TIP = "≈ project conversion of the printed period — pending unit ruling. Printed: ";

  /* ── THE KNOWN CONTRADICTIONS (catalog open flags 1 and 7) ───────────────
     The stricter reading is applied and the row carries a ⚠ naming BOTH
     printed figures. Nothing is hidden and nothing is silently averaged.  */
  const CONTRA = {
    "type-availability-loss": {
      experienced: 180,
      note: "§70 prints 180 days for an inexperienced flyer and «πάνω από 1 έτος» (≈365) for an "
        + "experienced one INSIDE THE SAME PARAGRAPH — a units mismatch. The stricter 180-day "
        + "reading is applied to both levels. Unit ruling needed.",
    },
    "in-cloud-recency-60d": {
      note: "The 60-day window agrees in both places, but EVENTS note (1) (PDF 107) asks for 2 × Ε-4 "
        + "inside it while Ch.8 §54γ (PDF 155) asks for 3 for the very same permission. The stricter "
        + "reading (3 × Ε-4) is the one to fly. Unit ruling needed.",
    },
    "e-3-in-cloud-flight": {
      note: "Tied to the 2-versus-3 Ε-4 contradiction on the in-cloud recency row: EVENTS note (1) "
        + "asks for 2 × Ε-4 in 60 days, Ch.8 §54γ for 3. Unit ruling needed.",
    },
  };

  const EXTERNAL_TIP = "Validity set by KPA Β-6/ΓΕΑ — outside the 3-01. The date is recorded here, "
    + "but nothing counts down: this document prints no period.";
  const NA_TIP = "The ΑΠ column prints «--», which the 3-01 nowhere defines and which is NOT the "
    + "blank that §48γ maps to «availability retained for ever». Read literally it marks "
    + "non-applicability for an inexperienced flyer. Unit ruling needed — nothing is counted.";

  /* ── catalog ────────────────────────────────────────────────────────────── */
  const C = { cat: null, loadP: null, byId: new Map(), groups: [], err: "" };

  function load() {
    if (!C.loadP) C.loadP = fetchCat();
    return C.loadP;
  }
  async function fetchCat() {
    try {
      const r = await fetch(CAT_URL, { cache: "no-store" });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const j = await r.json();
      if (!j || !Array.isArray(j.items)) throw new Error("no items[] inside");
      C.cat = j;
      for (const it of j.items) C.byId.set(it.id, it);
      C.groups = GROUPS.map((g) => Object.assign({}, g, {
        items: j.items.filter((it) => g.kinds.indexOf(it.kind) >= 0),
      })).filter((g) => g.items.length);
      /* Round 10c — the obligation list is curated by hand against the catalog;
         if the catalog ever renames or drops an id, say so instead of silently
         counting the row back into the availability dot. */
      for (const id of OBLIGATIONS.keys()) {
        if (!C.byId.has(id)) console.warn("SchedCurrency: obligation id is not in the catalog — " + id);
      }
      auditQuotas();                       // Round 11 — same rule for the quota map
      return j;
    } catch (e) {
      C.err = "instructor_currency.json — " + e.message;
      console.warn("SchedCurrency: " + C.err);
      return null;
    }
  }
  const loaded = () => !!C.cat;
  const items = () => (C.cat ? C.cat.items : []);
  const groups = () => C.groups;
  const byId = (id) => C.byId.get(id) || null;
  const stats = () => (C.cat && C.cat.agreement_stats) || null;
  const error = () => C.err;

  const isExternal = (it) => (it.flags || []).some((f) => String(f).indexOf("EXTERNAL VALIDITY") === 0);

  /* ── the resolution: ONE catalog item + ONE experience level → a window ──
     mode  exact    a day count printed in the 3-01           → counted
           approx   a printed period converted by the project → counted, ≈
           external validity lives in KPA Β-6/ΓΕΑ             → grey
           na       the ΑΠ column prints «--»                 → grey, ⚠
           none     no validity printed at all (§48γ blank)   → grey          */
  function resolve(it, experienced) {
    const lvl = experienced ? "experienced" : "inexperienced";
    const v = it.validity_days || {};
    const c = CONTRA[it.id] || null;
    const warn = c ? c.note : "";
    if (isExternal(it)) {
      return { days: null, mode: "external", warn: warn, tip: EXTERNAL_TIP, text: "set by KPA Β-6/ΓΕΑ" };
    }
    if (c && typeof c[lvl] === "number") {
      return { days: c[lvl], mode: "exact", warn: warn, tip: "", text: c[lvl] + " d" };
    }
    if (v[lvl + "_printed"] === "--") {
      return { days: null, mode: "na", warn: NA_TIP, tip: NA_TIP, text: "n/a («--»)" };
    }
    if (typeof v[lvl] === "number") {
      return { days: v[lvl], mode: "exact", warn: warn, tip: "", text: v[lvl] + " d" };
    }
    if (typeof PERIOD_CONV[it.id] === "number") {
      const d = PERIOD_CONV[it.id];
      return { days: d, mode: "approx", warn: warn,
        tip: CONV_TIP + (v.printed_period || "—"), text: "≈ " + d + " d" };
    }
    /* a printed period that was deliberately NOT converted is a quota, a
       threshold or a definition — say so instead of calling it "no limit" */
    if (v.printed_period) {
      return { days: null, mode: "none", warn: warn, text: "— not a window",
        tip: "The 3-01 prints: " + v.printed_period + "\n\nThat is not a rolling validity window (it is a "
          + "per-semester quota, a threshold or a definition), so nothing is counted down. The date is "
          + "still recorded here." };
    }
    return { days: null, mode: "none", warn: warn, text: "— no limit",
      tip: "No validity is printed. Under §48γ a blank validity cell means the availability is retained "
        + "for ever once held." };
  }

  /* ── dates ──────────────────────────────────────────────────────────────── */
  const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
  const normISO = (v) => { const s = String(v == null ? "" : v).slice(0, 10); return ISO_RE.test(s) ? s : ""; };
  /* UTC midnight everywhere: no DST hour can ever shift a day count */
  const utc = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
  const DAY = 86400000;
  const addDays = (iso, n) => new Date(utc(iso) + n * DAY).toISOString().slice(0, 10);
  const daysBetween = (a, b) => Math.round((utc(b) - utc(a)) / DAY);
  /* ISO_RE only checks the SHAPE, so "2026-13-45" passes it and Date.UTC would
     roll it over into an invented day (2027-02-14). The seam refuses anything
     that does not survive the round trip. */
  const realISO = (iso) => !!iso && new Date(utc(iso)).toISOString().slice(0, 10) === iso;
  const todayISO = () => (window.SchedReady ? window.SchedReady.todayISO()
    : new Date().toISOString().slice(0, 10));

  /* ── store access ───────────────────────────────────────────────────────── */
  function record(oid) { return oid ? S().find(COLL, oid) : null; }
  function cellOf(oid, itemId) {
    const r = record(oid);
    return (r && r.items && r.items[itemId]) || null;
  }
  function dateOf(oid, itemId) {
    const c = cellOf(oid, itemId);
    return c ? normISO(c.last_date) : "";
  }

  /* ══ THE SEAM ══════════════════════════════════════════════════════════
     bump(oid, item_id, date, src) — the single writer.
       date ""   (or null) CLEARS the row, and only from src "manual"
       src  "manual" (the card) always wins and may move a date backwards;
            anything else is an AUTOMATIC source: it may only push the date
            forward and it never clears.
     A date that is neither empty nor readable is a BUG IN THE CALLER, never
     an instruction to erase: it is refused loudly and the stored date is left
     untouched (Round 10c — finding 4).
     Returns the stored record, or null when the call was refused.        */
  function bump(oid, itemId, date, src) {
    if (!oid || !itemId) return null;
    if (loaded() && !byId(itemId)) { console.warn("SchedCurrency.bump: unknown item " + itemId); return null; }
    const from = String(src || "manual");
    const manual = from === "manual";
    const blank = date === "" || date === null;       // the only two ways to clear
    const iso = blank ? "" : normISO(date);
    if (!blank && !realISO(iso)) {
      console.warn("SchedCurrency.bump: refused an unreadable date for " + itemId + " — " + JSON.stringify(date));
      return null;                                    // nothing is written, nothing is cleared
    }
    const prev = record(oid);
    const rec = { oid: oid, items: Object.assign({}, (prev && prev.items) || {}) };
    const old = rec.items[itemId] || null;
    const oldISO = old ? normISO(old.last_date) : "";
    if (!iso) {
      if (!manual || !old) return prev;               // an automatic source never clears
      delete rec.items[itemId];
    } else {
      if (!manual && oldISO && oldISO >= iso) return prev;
      if (oldISO === iso && old && old.src === from) return prev;
      rec.items[itemId] = Object.assign({}, old, { last_date: iso, src: from });
    }
    rec.updated_at = new Date().toISOString();
    return S().upsert(COLL, rec);
  }

  /* ── status of ONE row ──────────────────────────────────────────────────── */
  function statusOf(oid, it, experienced, ref) {
    const v = resolve(it, experienced);
    const last = dateOf(oid, it.id);
    const out = { item: it, v: v, last: last, expires: "", left: null,
      state: "neutral", obligation: isObligation(it.id) };
    if (v.days == null) return out;                    // nothing to count
    if (!last) { out.state = "never"; return out; }
    out.expires = addDays(last, v.days);
    out.left = daysBetween(ref || todayISO(), out.expires);
    if (out.left < 0) out.state = "expired";
    else if (out.left <= amberAt(v.days)) out.state = "expiring";
    else out.state = "ok";
    return out;
  }

  /* ── the instructor's aggregate ─────────────────────────────────────────
     Two tallies, never mixed (Round 10c):
       AVAILABILITY  every counted row that is not an obligation. owes =
                     expired + never; it drives the dot, the chip and the pill.
       OBLIGATIONS   the counted rows of OBLIGATIONS. overdue = expired only —
                     a row with no date is not overdue, it is simply not
                     recorded, and nothing about the instructor is unavailable.
     counted + obl.counted + neutral === every item in the catalog.          */
  function summary(oid, experienced) {
    const ref = todayISO();
    const obl = { counted: 0, ok: 0, expiring: 0, expired: 0, never: 0,
      overdue: 0, rows: [], overdueRows: [] };
    const out = { ok: 0, expiring: 0, expired: 0, never: 0, neutral: 0, counted: 0,
      owes: 0, state: "ok", red: [], amber: [], obl: obl, ready: loaded() };
    for (const it of items()) {
      const st = statusOf(oid, it, experienced, ref);
      if (st.state === "neutral") { out.neutral += 1; continue; }
      if (st.obligation) {
        obl.counted += 1; obl[st.state] += 1; obl.rows.push(st);
        if (st.state === "expired") obl.overdueRows.push(st);
        continue;
      }
      out[st.state] += 1;
      out.counted += 1;
      if (st.state === "expired" || st.state === "never") out.red.push(st);
      else if (st.state === "expiring") out.amber.push(st);
    }
    obl.overdue = obl.expired;
    out.owes = out.expired + out.never;
    out.state = out.owes ? "expired" : (out.expiring ? "expiring" : "ok");
    return out;
  }

  /* ══════════════════════════════════════════════════════════════════════
     ΑΝΑ ΕΞΑΜΗΝΟ — THE SEMESTER QUOTAS                          (Round 11)
     ══════════════════════════════════════════════════════════════════════
     Πίνακας 6 (F/S, PDF p.97) and Πίνακας 9 (air, PDF p.101) print, per flyer
     per SEMESTER, HOW MANY sorties of each exercise are required. That is a
     quota, not a rolling window: nothing counts down, so the 25%/45-day colour
     rule above cannot say anything about it and never touches these rows.

     THE AXIS — and why the toggle does not move these numbers
       Both tables split their column into ΤΟΠΟΘΕΤΗΜΕΝΟΣ (POSTED) vs
       ΠΡΟΣΚΟΛΛΗΜΕΝΟΣ (ATTACHED). The catalog flags this in as many words —
       «The split in Tables 6 and 9 is POSTED vs ATTACHED — NOT inexperienced
       vs experienced. A currency card must not merge the two axes.» — so the
       project reads the POSTED column and carries the ATTACHED figure along
       only as a tooltip. Posting is not recorded on the instructor record yet:
       an `attached` flag is a FUTURE AXIS (see spec § 11).

     WHY A HAND-CURATED MAP AND NOT A REGEX
       Same argument as PERIOD_CONV above: the list must stay auditable line by
       line against the printed table. `printed` is the VERBATIM row of the
       3-01 and auditQuotas() checks, at load, that it really is a substring of
       the catalog item's own verbatim AND that any machine-readable
       printed_period agrees with `posted`. If the catalog ever moves, the
       console says so instead of the UI quietly inventing a requirement.     */
  const SEM_KINDS = ["sim", "s-category"];
  const T6 = "Ch.4 Πίνακας 6 (PDF p.97)";
  const T9 = "Ch.4 Πίνακας 9 (PDF p.101)";
  const DASH_WHY = "the 3-01 prints a dash «-» in both columns — no sortie is required";
  /* order = the order of the printed tables; the ΣΥΝΟΛΑ row closes its table */
  const SEM_QUOTA = {
    /* ── Πίνακας 6 — ΕΞΑΜΗΝΙΑΙΟ ΠΡΟΓΡΑΜΜΑ ΣΥΝΤΗΡΗΣΗΣ F/S Α/Φ Τ-6Α ───────── */
    "sim-1": { grp: "sim", posted: 1, attached: 1, src: T6, printed: "1. SIM-1 ΧΕΙΡ. ΑΚΡΙΒΕΙΑΣ – ACRO 1 1" },
    "sim-2": { grp: "sim", posted: 1, attached: 1, src: T6, printed: "2. SIM-2 IFR 1 1" },
    "sim-3": { grp: "sim", posted: 1, attached: null, src: T6, printed: "3. SIM-3 ΑΠΟΣΤΟΛΕΣ Α-Ε 1 -" },
    "sim-4": { grp: "sim", posted: null, attached: null, src: T6, printed: "4. SIM-4 ΑΠΟΣΤΟΛΕΣ Α-Α - -",
      why: DASH_WHY + " on the T-6A (the Μ-346 Table 7 prints 1 for posted, which is out of scope)" },
    "sim-5": { grp: "sim", posted: 1, attached: 1, src: T6, printed: "5. SIM-5 ΔΙΑΔΙΚΑΣΙΕΣ ΑΝΑΓΚΗΣ 1 1" },
    "sim-da": { grp: "sim", posted: 1, attached: 1, src: T6 + " · §24", tp_only: true,
      printed: "* SIM-ΔΑ ΔΟΚΙΜΗ Α/Φ (Μόνο για Δοκιμαστές) 1 1",
      note: "may be counted in place of SIM-1 (§24), so the ΣΥΝΟΛΑ row is not a plain sum" },
    "semiannual-fs-total-t6": { grp: "sim", posted: 4, attached: 3, src: T6 + " · §§21-27", total: true,
      printed: "ΣΥΝΟΛΑ 4 3",
      note: "the printed TOTAL. It is not auto-summed here: §24 lets SIM-ΔΑ stand in for SIM-1 and §25 calls "
        + "the semester figures a MINIMUM, so the squadron's own total is the honest number to type" },
    "sim-refresh-after-abstention": { grp: "sim", posted: null, attached: null, window: true,
      src: "Ch.4 §49 (PDF p.108)",
      why: "not a quota at all — §49 prints a THRESHOLD IN DAYS (more than 45 for an experienced flyer, "
        + "more than 30 for an inexperienced one) above which 1 (or 2) SIM-1 sorties are required BEFORE "
        + "the next air flight. It keeps its date, its window colour and its place in the availability count" },
    /* ── Πίνακας 9 — ΕΞΑΜΗΝΙΑΙΟ ΠΡΟΓΡΑΜΜΑ ΕΞΟΔΩΝ ΣΤΑΔΙΟΥ ΣΥΝΤΗΡΗΣΗΣ Α/Φ Τ-6Α  */
    "s-1-general-adaptation": { grp: "s", posted: 1, attached: 1, src: T9, printed: "1 Σ-1 ΓΕΝΙΚΗ ΠΡΟΣΑΡΜΟΓΗ 1 1" },
    "s-2-pdo-day": { grp: "s", posted: 1, attached: 1, src: T9, printed: "2 Σ-2 ΠΔΟ ΗΜΕΡΑΣ 1 1" },
    "s-2-pdo-night": { grp: "s", posted: 1, attached: null, src: T9, printed: "2 Σ-2 ΠΔΟ ΝΥΧΤΑΣ 1 -" },
    "s-3-air-to-ground": { grp: "s", posted: 2, attached: 1, src: T9, printed: "3 Σ-3 ΑΠΟΣΤΟΛΕΣ ΑΕΡΟΣ-ΕΔΑΦΟΥΣ 2 1" },
    "s-4-air-to-air": { grp: "s", posted: 1, attached: null, src: T9, printed: "4 Σ-4 ΑΠΟΣΤΟΛΕΣ ΑΕΡΟΣ-ΑΕΡΟΣ 1 -" },
    "s-20-no-requirements": { grp: "s", posted: null, attached: null, src: T9, printed: "5 Σ-20 ΑΝΕΥ ΑΠΑΙΤΗΣΕΩΝ - -",
      why: DASH_WHY + " — Σ-20 is where ferry flights and invalid sorties are BOOKED, never something to fly on purpose" },
    "semiannual-air-total-t6": { grp: "s", posted: 6, attached: 3, src: T9 + " · §§38-39", total: true,
      printed: "ΣΥΝΟΛΟ ΕΞΟΔΩΝ 6 3",
      note: "the printed TOTAL (1+1+1+2+1 = 6 for a posted instructor). Not auto-summed: §39 allows a Σ-2 "
        + "to replace a lost exercise and §61 lets E exercises flown on student sorties cover part of it" },
  };
  const SEM_GRP = [
    { key: "sim", label: "ΑΝΑ ΕΞΑΜΗΝΟ — F/S (SIM), Πίνακας 6",
      note: "sorties per semester in the simulator · §22 each sortie at least one hour · §25 the figures are a MINIMUM" },
    { key: "s", label: "ΑΝΑ ΕΞΑΜΗΝΟ — ΑΕΡΟΣ (Σ categories), Πίνακας 9",
      note: "sorties per semester on the aircraft · average sortie 1,2 h · §40 reduction bands absorb a justified shortfall" },
  ];
  const semIds = () => Object.keys(SEM_QUOTA);
  const isSemItem = (id) => Object.prototype.hasOwnProperty.call(SEM_QUOTA, id);
  const semItems = () => items().filter((it) => isSemItem(it.id));
  /* table ② = everything that is not a semester quota row */
  const datedItems = () => items().filter((it) => !isSemItem(it.id));
  /* table ① in the order of the PRINTED tables (SEM_QUOTA key order), not in
     catalog order: the ΣΥΝΟΛΑ row closes its own table, exactly as on paper.
     Mirrors groups() so the two tables render through the same shape.      */
  function semGroups() {
    if (!loaded()) return [];
    return SEM_GRP.map((g) => Object.assign({}, g, {
      items: semIds().filter((id) => SEM_QUOTA[id].grp === g.key)
        .map(byId).filter(Boolean),
    })).filter((g) => g.items.length);
  }

  /* the load-time audit — it never throws, it only tells the truth loudly */
  const QUOTA_RE = /^(\d+) sortie\(s\) per semester \(posted\)/;
  function auditQuotas() {
    const cat = new Set(items().filter((it) => SEM_KINDS.indexOf(it.kind) >= 0).map((it) => it.id));
    for (const id of semIds()) {
      if (!cat.has(id)) { console.warn("SchedCurrency: quota id is not a sim/s-category catalog item — " + id); continue; }
      const it = byId(id), q = SEM_QUOTA[id];
      if (q.printed && String(it.verbatim || "").indexOf(q.printed) < 0) {
        console.warn("SchedCurrency: the printed quota row is no longer inside the catalog verbatim — " + id);
      }
      const pp = String((it.validity_days || {}).printed_period || "");
      const m = QUOTA_RE.exec(pp);
      const read = m ? +m[1] : (pp.indexOf("none — a dash") === 0 ? 0 : null);
      if (read !== null && read !== (q.posted || 0)) {
        console.warn("SchedCurrency: quota mismatch for " + id + " — the catalog reads "
          + read + ", the project map says " + (q.posted === null ? "none" : q.posted));
      }
    }
    for (const id of cat) {
      if (!isSemItem(id)) console.warn("SchedCurrency: a sim/s-category item has no quota entry — " + id);
    }
  }

  /* ── the semester itself: calendar halves (project ruling, spec § 11) ──────
     H1 = 01/01 → 30/06 · H2 = 01/07 → 31/12. The 3-01 says «εξάμηνο» and never
     pins the boundary, so the project picks the calendar halves and prints the
     choice on the card and on the sheet. The KEY is what the store is keyed by
     ("2026-H2"), so a rollover never overwrites the semester that just ended. */
  const SEM_RE = /^\d{4}-H[12]$/;
  const semKeyOf = (iso) => {
    const s = normISO(iso) || todayISO();
    return s.slice(0, 4) + (+s.slice(5, 7) <= 6 ? "-H1" : "-H2");
  };
  const ORD = { 1: "1st", 2: "2nd" };
  function semOf(key) {
    const k = SEM_RE.test(String(key || "")) ? String(key) : semKeyOf(todayISO());
    const year = k.slice(0, 4), half = +k.slice(6, 7);
    const start = year + (half === 1 ? "-01-01" : "-07-01");
    const end = year + (half === 1 ? "-06-30" : "-12-31");
    const left = daysBetween(todayISO(), end);
    return { key: k, year: year, half: half, start: start, end: end, left: left,
      label: ORD[half] + " semester " + year };
  }
  const curSem = () => semOf(semKeyOf(todayISO()));
  /* the one number that decides amber vs red on a quota row */
  const SEM_RED_DAYS = 30;

  /* ── the quota of ONE row for ONE instructor ──────────────────────────────
       n        the POSTED requirement, or null when nothing is printed
       axis     always "posted" while an `attached` flag does not exist
       why      why there is no number, in the user's words
       window   true for the one §49 threshold row (see the file header)     */
  function quotaOf(it, ip) {
    const q = SEM_QUOTA[it.id];
    if (!q) return { n: null, axis: "", why: "not a semester quota row" };
    const out = { n: q.posted, attached: q.attached, axis: "posted", src: q.src || "",
      printed: q.printed || "", note: q.note || "", why: q.why || "",
      total: !!q.total, window: !!q.window, tp: false };
    if (q.tp_only && !(ip && ip.test_pilot)) {
      out.n = null; out.tp = true;
      out.why = "the 3-01 gives this sortie to the squadron's Test Pilots only (§24) — this instructor "
        + "carries no TP flag, so nothing is required of him here";
    }
    return out;
  }

  /* ── the recorded counter ────────────────────────────────────────────────
     STORAGE  the same instructorCurrency record grows a `semesters` map:
              { oid, items: {…}, semesters: { "2026-H2": { "sim-1": 2 } } }
     Keyed BY SEMESTER on purpose: 01/01 rolls the key over and last semester's
     figures survive untouched instead of being reset or overwritten. A missing
     key and a missing item both read as 0.                                  */
  function countsOf(oid, semKey) {
    const r = record(oid);
    const s = r && r.semesters;
    const k = SEM_RE.test(String(semKey || "")) ? semKey : curSem().key;
    return (s && s[k]) || {};
  }
  function countOf(oid, itemId, semKey) {
    const n = countsOf(oid, semKey)[itemId];
    return typeof n === "number" && isFinite(n) ? n : 0;
  }

  /* ══ THE SECOND SEAM ══════════════════════════════════════════════════
     bumpCount(oid, item_id, count, semKey, src) — the single writer of the
     semester counters, built on the same guard philosophy as bump():
       · count must be a whole number 0…99. Anything else (NaN, "3 sorties",
         -1, 7.5, undefined, an object) is a BUG IN THE CALLER, never an
         instruction to erase: it is refused loudly and NOTHING is written.
       · 0 stores as "no key" — reading is identical (missing = 0) and the
         record stays small — but only "manual" may write it, exactly as only
         "manual" may clear a date.
       · "manual" (the card) always wins and may count DOWN; any other src is
         an AUTOMATIC source, so it may only raise a count and never zero one.
         Nothing auto-counts today: no sortie, no log event is wired to a Σ or
         SIM row. When one is, it will call this with src="log:<event id>".
     Returns the stored record, or null when the call was refused.          */
  const MAX_COUNT = 99;
  function bumpCount(oid, itemId, count, semKey, src) {
    if (!oid || !itemId) return null;
    if (loaded() && !byId(itemId)) { console.warn("SchedCurrency.bumpCount: unknown item " + itemId); return null; }
    if (!isSemItem(itemId)) {
      console.warn("SchedCurrency.bumpCount: " + itemId + " is not a semester-quota row — dates go through bump()");
      return null;
    }
    const n = typeof count === "number" ? count : (String(count).trim() === "" ? NaN : Number(count));
    if (!isFinite(n) || n < 0 || n > MAX_COUNT || Math.floor(n) !== n) {
      console.warn("SchedCurrency.bumpCount: refused an unreadable count for " + itemId
        + " — " + JSON.stringify(count));
      return null;
    }
    const key = SEM_RE.test(String(semKey || "")) ? String(semKey) : curSem().key;
    const from = String(src || "manual");
    const manual = from === "manual";
    const prev = record(oid);
    const old = countOf(oid, itemId, key);
    if (!manual && n <= old) return prev;              // an automatic source only goes up
    if (n === old) return prev;
    const sems = Object.assign({}, (prev && prev.semesters) || {});
    const bag = Object.assign({}, sems[key] || {});
    if (n === 0) delete bag[itemId]; else bag[itemId] = n;
    if (Object.keys(bag).length) sems[key] = bag; else delete sems[key];
    const rec = { oid: oid, items: Object.assign({}, (prev && prev.items) || {}),
      semesters: sems, updated_at: new Date().toISOString() };
    return S().upsert(COLL, rec);
  }

  /* ── status of ONE quota row ───────────────────────────────────────────
     GREEN  x >= N (done)              GREY  no printed quota (nothing to meet)
     AMBER  x < N and more than 30 days of the semester left
     RED    x < N and 30 days or less left
     The dot classes are the SAME four the dated table uses (st-ok /
     st-expiring / st-expired / st-neutral), so every palette, the print
     fallback shapes and the legend are shared, not duplicated.             */
  function semStatusOf(oid, it, ip, semKey) {
    const sem = semOf(semKey);
    const q = quotaOf(it, ip);
    const x = countOf(oid, it.id, sem.key);
    const out = { item: it, q: q, x: x, n: q.n, sem: sem, state: "neutral", done: false, short: 0 };
    if (q.n == null) return out;                       // no printed quota → grey
    out.done = x >= q.n;
    out.short = Math.max(0, q.n - x);
    out.state = out.done ? "ok" : (sem.left > SEM_RED_DAYS ? "expiring" : "expired");
    return out;
  }

  /* ── the semester aggregate — its OWN chip, never mixed into "owes" ─────
     A quota is not a window: the 3-01 attaches no availability loss to a
     semester shortfall (§40 absorbs a justified one, §46 records the rest),
     so these rows never touch the dot, the pill or "owes N".               */
  function semSummary(oid, ip, semKey) {
    const sem = semOf(semKey);
    const out = { sem: sem, rows: [], total: 0, done: 0, short: 0, behind: [],
      state: "ok", ready: loaded() };
    for (const it of semItems()) {
      if (SEM_QUOTA[it.id].window) continue;           // the §49 threshold is not a quota
      const st = semStatusOf(oid, it, ip, sem.key);
      out.rows.push(st);
      if (st.n == null) continue;
      out.total += 1;
      if (st.done) out.done += 1;
      else { out.short += st.short; out.behind.push(st); }
    }
    out.state = out.total && out.done >= out.total ? "ok"
      : (!out.total ? "neutral" : (sem.left > SEM_RED_DAYS ? "expiring" : "expired"));
    return out;
  }

  window.SchedCurrency = {
    CAT_URL, COLL, GROUPS, PERIOD_CONV, CONV_LEGEND, CONTRA, OBLIGATIONS,
    AMBER_FRACTION, AMBER_MAX_DAYS, amberAt, isObligation, oblWhy,
    load, loaded, error, items, groups, byId, stats,
    resolve, statusOf, summary,
    record, cellOf, dateOf, bump,
    addDays, daysBetween, todayISO, normISO,
    /* Round 11 — the semester quotas */
    SEM_QUOTA, SEM_GRP, SEM_KINDS, SEM_RED_DAYS, MAX_COUNT,
    isSemItem, semItems, semGroups, datedItems, semKeyOf, semOf, curSem,
    quotaOf, countsOf, countOf, bumpCount, semStatusOf, semSummary,
  };
})();

/* ══════════════════════════════════════════════════════════════════════════
   THE TAB — window.curInit()                                    (Round 11)
   ══════════════════════════════════════════════════════════════════════════
   A top-level view like Scheduler or the Flowchart, not a row expansion:
   LEFT   the instructor list — availability dot, "owes N", semester chip.
          Clicking selects; the selection survives every repaint and every
          tab switch (module ui state, exactly like the Scheduler's panes).
   RIGHT  the selected instructor: header (identity · pill · counters ·
          EXPERIENCED toggle · Print) and the TWO tables.
   Everything shown is computed by SchedCurrency out of the catalog, ONE date
   per dated item and ONE counter per quota item per semester. This module
   owns the HTML and nothing else — no number is decided here.              */
(() => {
  const $id = (x) => document.getElementById(x);
  const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ESC[c]);
  const S = () => window.SchedStore;
  const CUR = () => window.SchedCurrency;
  const dmy = (v) => window.fmtDMY(v);

  /* sel   the SELECTED instructor code — it persists across repaints and tab
           switches. focus puts the caret back on the input the store event
           repainted away under the user's hands (kind + item id).          */
  const ui = { booted: false, sel: "", focus: null };

  const instructors = () => (S().get("instructors") || []).slice();
  /* active first, then natural order on the code ("IP-2" before "IP-10") */
  const natural = (a, b) => String(a).replace(/\d+/g, (n) => n.padStart(6, "0"))
    .localeCompare(String(b).replace(/\d+/g, (n) => n.padStart(6, "0")));
  function listed() {
    return instructors().sort((a, b) => {
      const da = (a.status || "active") === "departed" ? 1 : 0;
      const db = (b.status || "active") === "departed" ? 1 : 0;
      return da - db || natural(a.code, b.code);
    });
  }
  const selected = () => (ui.sel ? S().find("instructors", ui.sel) : null) || null;

  /* ── boot ───────────────────────────────────────────────────────────────── */
  window.curInit = async function curInit() {
    /* the same access-code curtain the Scheduler respects: while locked this
       view renders NOTHING, so the veiled DOM holds no roster data. */
    if (window.SchedLock && window.SchedLock.locked()) {
      window.SchedLock.onUnlock(() => window.curInit());
      return;
    }
    if (ui.booted) { render(); return; }
    if (!$id("view-currency")) return;
    try {
      await S().ready();
      if (window.SchedPeople) window.SchedPeople.ensure();   // every IP gets a stable OID
      await CUR().load();
    } catch (e) {
      $id("cur-main").innerHTML = `<div class="sch-ph"><strong>Currency data could not be loaded.</strong>
        <p>${esc(e.message)}${S().seedError() ? " · " + esc(S().seedError()) : ""}</p></div>`;
      console.error(e);
      return;
    }
    ui.booted = true;
    S().subscribe(() => { if (ui.booted) render(); });
    wire($id("view-currency"));
    render();
    curCoverage();                       // the 15 + 76 = 91 identity, asserted once
  };

  function render() {
    const all = listed();
    if (!all.length) ui.sel = "";
    else if (!all.some((i) => i.code === ui.sel)) ui.sel = all[0].code;
    $id("cur-list").innerHTML = listHtml(all);
    $id("cur-main").innerHTML = mainHtml(selected());
    restoreFocus($id("view-currency"));
  }

  /* a counter/date is written on `change`, the store event repaints the whole
     view, and the input the user was standing on disappears with it. Item ids
     are plain kebab-case slugs, so the attribute selector is safe. */
  function restoreFocus(el) {
    const f = ui.focus;
    ui.focus = null;
    if (!f) return;
    const inp = el.querySelector(`[data-${f.kind}="${f.id}"]`);
    if (!inp) return;
    inp.focus();
    if (inp.select && f.kind === "curcount") inp.select();
  }

  /* ══ LEFT — the instructor list ═════════════════════════════════════════ */
  function listHtml(all) {
    const head = `<div class="sch-h"><h2>Instructors <span class="count">${all.length}</span></h2></div>`;
    if (!all.length) return head + `<p class="sch-hint">No instructors yet — add them in the Scheduler roster.</p>`;
    if (!CUR().loaded()) {
      return head + `<p class="sch-hint">The expiring-items catalog could not be read — expected
        <code>${esc(CUR().CAT_URL)}</code>.${CUR().error() ? " " + esc(CUR().error()) : ""}</p>`;
    }
    return head + `<div class="cur-iplist">${all.map(ipRowHtml).join("")}</div>
      <p class="sch-hint">The dot and “owes N” read the DATED table only. “sem” is the semester quotas —
      a separate count, because a quota is not a window.</p>`;
  }

  function ipRowHtml(i) {
    const on = i.code === ui.sel;
    const dep = (i.status || "active") === "departed";
    const name = (i.last_name || "—") + (i.first_name ? ", " + i.first_name : "");
    let dot = "", chips = "";
    if (!i.oid) {
      chips = `<span class="sch-badge" title="no OID yet — the currency record is addressed by OID. Open the roster form in the Scheduler and save the row once.">no OID</span>`;
    } else {
      const s = CUR().summary(i.oid, !!i.experienced);
      const sem = CUR().semSummary(i.oid, i);
      dot = `<span class="sch-cdot st-${esc(s.state)}" title="${esc(availTip(s))}"></span>`;
      chips = (s.owes ? `<span class="sch-badge cur-expired" title="${esc(availTip(s))}">owes ${s.owes}</span>`
        : s.expiring ? `<span class="sch-badge cur-expiring" title="${esc(availTip(s))}">exp ${s.expiring}</span>` : "")
        + `<span class="sch-badge cur-sem st-${esc(sem.state)}" title="${esc(semTip(sem))}">sem ${sem.done}/${sem.total}</span>`;
    }
    return `<button type="button" class="cur-ip${on ? " is-on" : ""}${dep ? " is-dep" : ""}"
      data-cur-ip="${esc(i.code)}" aria-pressed="${on ? "true" : "false"}">
      ${dot}
      <span class="sch-code">${esc(i.code)}</span>
      ${i.rank ? `<span class="cur-ip-rank">${esc(i.rank)}</span>` : ""}
      <span class="cur-ip-name">${esc(name)}</span>
      ${dep ? `<span class="sch-badge st-withdrawn" title="departed — kept for history">DEP</span>` : ""}
      <span class="sch-spacer"></span>${chips}</button>`;
  }

  const availTip = (s) => (s.owes
    ? "availability — NOT current: " + s.owes + " item" + (s.owes === 1 ? "" : "s") + " expired or never recorded"
    : s.expiring
      ? "availability — available, " + s.expiring + " item" + (s.expiring === 1 ? "" : "s") + " expiring"
      : "availability — available: " + s.counted + " counted items all in date")
    + (s.obl.overdue ? " · plus " + s.obl.overdue + " recorded obligation"
      + (s.obl.overdue === 1 ? "" : "s") + " overdue (no availability loss — not counted here)" : "");

  const semTip = (sem) => "semester quotas — " + sem.done + " of " + sem.total + " met in "
    + sem.sem.label + " (ends " + dmy(sem.sem.end) + ", " + sem.sem.left + " days left)"
    + (sem.short ? " · " + sem.short + " sortie" + (sem.short === 1 ? "" : "s") + " still owed" : "")
    + ". A quota is not a window: it never touches the availability dot or “owes”.";

  /* ══ RIGHT — the selected instructor ════════════════════════════════════ */
  function mainHtml(i) {
    if (!CUR().loaded()) {
      return `<div class="sch-ph"><strong>The expiring-items catalog could not be read.</strong>
        <p>Expected <code>${esc(CUR().CAT_URL)}</code>.${CUR().error() ? " " + esc(CUR().error()) : ""}</p></div>`;
    }
    if (!i) return `<div class="sch-ph"><strong>Pick an instructor on the left.</strong>
      <p>Everything the 3-01/2025 ΔΑΕ makes an instructor hold is here: the semester quotas of
      Πίνακας 6 / Πίνακας 9, and the ${CUR().datedItems().length} dated items that either expire or do not.</p></div>`;
    if (!i.oid) return `<div class="sch-ph"><strong>${esc(i.code)} has no OID yet.</strong>
      <p>The currency record is addressed by OID. Open the roster form in the Scheduler and save the row once.</p></div>`;

    const exp = !!i.experienced;
    const s = CUR().summary(i.oid, exp);
    const sem = CUR().semSummary(i.oid, i);
    const pill = s.owes ? { c: "expired", t: "NOT current: " + s.owes + " item" + (s.owes === 1 ? "" : "s") }
      : s.expiring ? { c: "expiring", t: "Expiring: " + s.expiring }
        : { c: "ok", t: "Available" };
    const name = (i.last_name || "—") + (i.first_name ? ", " + i.first_name : "");
    return `<div class="cur-head">
        <span class="sch-code">${esc(i.code)}</span>
        ${i.rank ? `<span class="sch-rmeta">${esc(i.rank)}</span>` : ""}
        <span class="cur-hname">${esc(name)}</span>
        ${i.callsign ? `<span class="sch-badge alt" title="personal callsign">${esc(i.callsign)}</span>` : ""}
        ${i.country ? `<span class="sch-badge" title="air force">${esc(i.country)}</span>` : ""}
        ${i.test_pilot ? `<span class="sch-badge" title="test pilot — the SIM-ΔΑ semester quota applies to him">TP</span>` : ""}
        <span class="sch-curpill st-${pill.c}" title="${esc(availTip(s))}">${esc(pill.t)}</span>
        <span class="sch-badge cur-sem st-${esc(sem.state)}" title="${esc(semTip(sem))}">semester: ${sem.done} of ${sem.total} done</span>
        <span class="sch-spacer"></span>
        <label class="sch-curexp" title="Annex B §17 — an EXPERIENCED (ΕΜΠ) flyer reads the ΕΜΠ validity column, an inexperienced (ΑΠ) one the ΑΠ column. Saved on the instructor; switching it recomputes both tables. The semester quotas do not move: their axis is POSTED vs ATTACHED, not experience.">
          <input type="checkbox" data-curexp="1"${exp ? " checked" : ""}>
          <span>Experienced (ΕΜΠ)</span></label>
        <button type="button" class="sch-btn" data-act="cur-print"
                title="one instructor per sheet, both tables, plain monochrome for the squadron binder">🖨 Print</button>
      </div>
      ${semBlock(i, sem)}
      ${datedBlock(i, s, exp)}`;
  }

  /* ══ TABLE ① — ΑΝΑ ΕΞΑΜΗΝΟ ══════════════════════════════════════════════ */
  function semBlock(i, sem) {
    const w = sem.sem;
    return `<section class="panel sch-panel cur-sec">
      <div class="sch-h"><h2>① ΑΝΑ ΕΞΑΜΗΝΟ — semester quotas
        <span class="count">${CUR().semItems().length} items</span></h2>
        <span class="sch-nd" title="project ruling: the semester is a calendar half — H1 = 01/01-30/06, H2 = 01/07-31/12. The stored key is «${esc(w.key)}», so 01/01 rolls over instead of overwriting.">${esc(w.label)} — ends ${esc(dmy(w.end))} (${w.left} days left)</span>
        <span class="sch-badge cur-sem st-${esc(sem.state)}">${sem.done}/${sem.total} met${sem.short ? " · " + sem.short + " owed" : ""}</span>
      </div>
      <p class="sch-hint sch-curlegend">
        <span class="sch-cdot st-ok"></span> met (x ≥ N) ·
        <span class="sch-cdot st-expiring"></span> short with more than ${CUR().SEM_RED_DAYS} days of the semester left ·
        <span class="sch-cdot st-expired"></span> short with ${CUR().SEM_RED_DAYS} days or less left ·
        <span class="sch-cdot st-neutral"></span> no printed quota.
        <b>N</b> is the <b>ΤΟΠΟΘΕΤΗΜΕΝΟΣ (POSTED)</b> column of the printed table — the split in Πίνακας 6/9 is
        posted vs attached, <b>not</b> experienced vs inexperienced, so the ΕΜΠ toggle does not move it
        (an <i>attached</i> flag on the instructor is a future axis). A shortfall here is <b>not</b> an availability
        loss — §40 absorbs a justified one, §46 records the rest — so these rows never enter the dot, the pill or “owes”.
      </p>
      <div class="sch-scroll cur-semscroll">
        <table class="sch-tbl sch-curtbl sch-semtbl">
          <thead><tr><th>Item</th><th>Required this semester</th><th>Recorded</th><th>Progress</th><th>Status</th></tr></thead>
          <tbody>${CUR().semGroups().map((g) => semGroupHtml(g, i)).join("")}</tbody>
        </table>
      </div>
    </section>`;
  }

  function semGroupHtml(g, i) {
    return `<tr class="sch-curgrp"><td colspan="5">${esc(g.label)}
      <span class="sch-nd">${g.items.length}</span>
      ${g.note ? `<span class="sch-curgnote">${esc(g.note)}</span>` : ""}</td></tr>`
      + g.items.map((it) => semRowHtml(it, i)).join("");
  }

  /* ONE quota row — or, for the single §49 threshold, one dated row that keeps
     its window and its place in the availability count (see the file header). */
  function semRowHtml(it, i) {
    const q = CUR().quotaOf(it, i);
    if (q.window) return semWindowRowHtml(it, i, q);
    const st = CUR().semStatusOf(i.oid, it, i);
    const src = it.source || {};
    const tip = String(it.lapse_consequence || "—") + "\n\nIf it lapses — see " + (src.ref || "3-01")
      + (src.page_pdf ? " · PDF p." + src.page_pdf : "");
    const need = q.n == null
      ? `<span title="${esc(q.why || "no number is printed for this row")}">—</span>`
      : `<b>${q.n}</b> <span class="cur-unit">sortie${q.n === 1 ? "" : "s"}</span>`;
    const needTip = (q.printed ? "PRINTED: " + q.printed + "\n\n" : "")
      + (q.n == null ? q.why : "Required of a ΤΟΠΟΘΕΤΗΜΕΝΟΣ (posted) instructor: " + q.n
        + " · ΠΡΟΣΚΟΛΛΗΜΕΝΟΣ (attached): " + (q.attached == null ? "none — a dash is printed" : q.attached))
      + (q.note ? "\n\n" + q.note : "") + "\n\nSource: " + (q.src || "3-01");
    const pct = q.n ? Math.min(100, Math.round((st.x / q.n) * 100)) : 0;
    return `<tr class="cur-${esc(st.state)}" data-semrow="${esc(it.id)}">
      <td class="sch-curname">
        <span class="sch-curinfo" title="${esc(tip)}">ⓘ</span>
        <span>${esc(it.name)}</span>
        ${q.total ? `<span class="sch-curobl" title="${esc(q.note)}">total</span>` : ""}
        ${q.tp ? `<span class="sch-curobl" title="${esc(q.why)}">TP only</span>` : ""}
      </td>
      <td class="sch-mono${q.n == null ? " sch-no" : ""}" title="${esc(needTip)}">${need}</td>
      <td><input type="number" class="sch-in sch-curcnt" data-curcount="${esc(it.id)}"
                 min="0" max="${CUR().MAX_COUNT}" step="1" value="${st.x}" inputmode="numeric"
                 title="sorties recorded in ${esc(st.sem.label)} — typed here by hand, nothing is counted from the training log yet"></td>
      <td class="sch-mono cur-prog">${st.x}<span class="cur-slash">/</span>${q.n == null ? "—" : q.n}
        ${q.n == null ? "" : `<span class="cur-bar"><i style="width:${pct}%"></i></span>`}</td>
      <td><span class="sch-cdot st-${esc(st.state)}" title="${esc(semStateTitle(st))}"></span></td>
    </tr>`;
  }

  const semStateTitle = (st) => (st.n == null ? "no printed quota — nothing to meet"
    : st.done ? "met — " + st.x + " of " + st.n + " recorded this semester"
      : st.short + " sortie" + (st.short === 1 ? "" : "s") + " still owed · "
        + st.sem.left + " days of " + st.sem.label + " left");

  /* the §49 threshold, rendered inside table ① because its KIND is "sim" —
     but it is a window, so it keeps its date input, its window colour and its
     place in the availability tally. The row says exactly that. */
  function semWindowRowHtml(it, i, q) {
    const st = CUR().statusOf(i.oid, it, !!i.experienced);
    const src = it.source || {};
    const tip = String(it.lapse_consequence || "—") + "\n\nIf it lapses — see " + (src.ref || "3-01")
      + (src.page_pdf ? " · PDF p." + src.page_pdf : "");
    const left = st.v.days == null ? "—" : st.state === "never" ? "no date" : (st.left > 0 ? "+" : "") + st.left + " d";
    return `<tr class="cur-${esc(st.state)}" data-semrow="${esc(it.id)}" data-currow="${esc(it.id)}">
      <td class="sch-curname">
        <span class="sch-curinfo" title="${esc(tip)}">ⓘ</span>
        <span>${esc(it.name)}</span>
        <span class="sch-curobl" title="${esc(q.why)}">threshold, not a quota</span>
        ${st.v.warn ? `<span class="sch-curwarn" title="${esc(st.v.warn)}">⚠</span>` : ""}
      </td>
      <td class="sch-mono" title="${esc(q.why + "\n\nSource: " + (q.src || "3-01"))}">${esc(st.v.text)}</td>
      <td><input type="date" class="sch-in sch-curdate" data-curdate="${esc(it.id)}" value="${esc(st.last)}"
                 title="the last air flight — the clock resets on each one; empty means never recorded"></td>
      <td class="sch-mono cur-left">${esc(left)}${st.expires ? ` <span class="cur-slash">exp ${esc(dmy(st.expires))}</span>` : ""}</td>
      <td><span class="sch-cdot st-${esc(st.state)}" title="${esc(CUR_STATE_TXT[st.state])} · counted for availability"></span></td>
    </tr>`;
  }

  /* ══ TABLE ② — ΛΗΓΟΥΝ / ΔΕΝ ΛΗΓΟΥΝ (Round 10c/10d, unchanged) ═══════════ */
  const CUR_STATE_TXT = {
    ok: "current", expiring: "expiring", expired: "EXPIRED",
    never: "never recorded", neutral: "no counter",
  };
  /* an obligation has no availability state to lose, so it never says EXPIRED:
     on paper it is "recorded", "due soon", "overdue" or "—" (10d). */
  const CUR_OBL_PRINT = {
    ok: "recorded", expiring: "due soon", expired: "overdue",
    never: "—", neutral: "—",
  };
  /* 10d — the WHY differs per id (no printed loss / trainee scope / deadline /
     ΠΡ module); the engine's curated map carries the per-id sentence. */
  const oblWhy = (id) => "recorded obligation — " + (CUR().oblWhy(id) || "outside the availability count")
    + ", so it is tracked here but stays out of the dot, the pill and “owes”";
  const OBL_LINE = "recorded obligations are tracked but stay out of the dot, the pill and “owes” — hover each chip for its reason";
  const oblTitle = (st) => (st.state === "expired" ? "overdue"
    : st.state === "never" ? "not recorded"
      : st.state === "expiring" ? "recorded — due soon"
        : st.state === "ok" ? "recorded" : "no counter") + " · " + oblWhy(st.item.id);
  const stateTitle = (st) => (st.obligation ? oblTitle(st) : CUR_STATE_TXT[st.state]);

  /* table ② groups = every catalog group whose kinds are not semester kinds */
  const datedGroups = () => CUR().groups()
    .filter((g) => !g.kinds.some((k) => CUR().SEM_KINDS.indexOf(k) >= 0));

  function datedBlock(i, s, exp) {
    const chip = (st) => `<button type="button" class="sch-pgoto${st.obligation ? " is-obl" : ""}" data-act="cur-goto" data-id="${esc(st.item.id)}"
      title="${esc(st.item.name)} — ${esc(stateTitle(st))}. Click to jump to the row.">${esc(shortName(st.item))}
      <span class="sch-pgoto-s">${esc(st.state === "never" ? "no date" : st.left + "d")}</span></button>`;
    const owed = s.red.concat(s.amber);
    const n = CUR().datedItems().length;
    return `<section class="panel sch-panel cur-sec">
      <div class="sch-h"><h2>② ΛΗΓΟΥΝ / ΔΕΝ ΛΗΓΟΥΝ — dated items <span class="count">${n} items</span></h2>
        <span class="sch-nd" title="items whose window is counted for availability / recorded obligations (no printed availability loss · trainee-scoped · a deadline, tenure or ΠΡ-module clock — hover each row for its reason) / items the 3-01 gives no counter for">${s.counted} counted · ${s.obl.counted} obligations · ${s.neutral} no counter</span>
      </div>
      ${s.obl.overdue ? `<div class="sch-curoblline">
        <span class="sch-nd" title="${esc(OBL_LINE)}">obligations overdue: ${s.obl.overdue}</span>
        ${s.obl.overdueRows.map(chip).join("")}</div>` : ""}
      <p class="sch-hint sch-curlegend">
        <span class="sch-cdot st-ok"></span> in date ·
        <span class="sch-cdot st-expiring"></span> amber when a quarter of the window — at most ${CUR().AMBER_MAX_DAYS} days — remains ·
        <span class="sch-cdot st-expired"></span> expired or never recorded ·
        <span class="sch-cdot st-neutral"></span> no counter (no limit · set outside the 3-01 · n/a).
        <b>≈</b> project conversion of a printed period (${esc(CUR().CONV_LEGEND)}) · <b>⚠</b> a printed contradiction — hover it.
        Rows tagged <b>obligation</b> keep their own colour but are left out of the dot, the pill and
        “owes” — each tag states why (no printed availability loss · trainee-scoped · a deadline, tenure or ΠΡ-module clock).
      </p>
      ${owed.length ? `<div class="sch-curowed">${owed.map(chip).join("")}</div>` : ""}
      <div class="sch-scroll sch-curscroll">
        <table class="sch-tbl sch-curtbl">
          <thead><tr><th>Item</th><th>Validity</th><th>Last done</th><th>Expires</th><th>Days left</th><th>Status</th></tr></thead>
          <tbody>${datedGroups().map((g) => curGroupHtml(g, i.oid, exp)).join("")}</tbody>
        </table>
      </div>
      <p class="sch-hint">Dates and counters are the source of truth and are typed here by hand — nothing is filled in
        from the training log yet. Source: <code>${esc(CUR().CAT_URL)}</code> · 3-01/2025 ΔΑΕ.</p>
    </section>`;
  }

  /* the printed name is long ("Ε-45 — Visual delivery, medium/high apex, day");
     the chips and the print sheet want the head of it */
  function shortName(it) {
    const n = String(it.name || it.id);
    const cut = n.split(" — ")[0];
    return cut.length > 26 ? cut.slice(0, 25) + "…" : cut;
  }

  function curGroupHtml(g, oid, exp) {
    const rows = g.items.map((it) => curRowHtml(it, oid, exp)).join("");
    return `<tr class="sch-curgrp"><td colspan="6">${esc(g.label)}
      <span class="sch-nd">${g.items.length}</span>
      ${g.note ? `<span class="sch-curgnote">${esc(g.note)}</span>` : ""}</td></tr>` + rows;
  }

  function curRowHtml(it, oid, exp) {
    const st = CUR().statusOf(oid, it, exp);
    const src = it.source || {};
    const tip = (st.obligation ? "RECORDED OBLIGATION — " + (CUR().oblWhy(it.id) || "outside the availability count")
      + "; excluded from the availability dot, from “owes N” and from the header pill.\n\n" : "")
      + String(it.lapse_consequence || "—") + "\n\nIf it lapses — see " + (src.ref || "3-01")
      + (src.page_pdf ? " · PDF p." + src.page_pdf : "");
    const left = st.v.days == null ? "—"
      : st.state === "never" ? "no date"
        : (st.left > 0 ? "+" : "") + st.left + " d";
    return `<tr class="cur-${esc(st.state)}" data-currow="${esc(it.id)}">
      <td class="sch-curname">
        <span class="sch-curinfo" title="${esc(tip)}">ⓘ</span>
        <span>${esc(it.name)}</span>
        ${st.obligation ? `<span class="sch-curobl" title="${esc(oblWhy(it.id))}">obligation</span>` : ""}
        ${st.v.warn ? `<span class="sch-curwarn" title="${esc(st.v.warn)}">⚠</span>` : ""}
      </td>
      <td class="sch-mono${st.v.days == null ? " sch-no" : ""}"${st.v.tip ? ` title="${esc(st.v.tip)}"` : ""}>${esc(st.v.text)}</td>
      <td><input type="date" class="sch-in sch-curdate" data-curdate="${esc(it.id)}" value="${esc(st.last)}"
                 title="last done — empty means never recorded"></td>
      <td class="sch-mono">${st.expires ? esc(dmy(st.expires)) : "—"}</td>
      <td class="sch-mono cur-left">${esc(left)}</td>
      <td><span class="sch-cdot st-${esc(st.state)}" title="${esc(stateTitle(st))}"></span></td>
    </tr>`;
  }

  /* ══ the squadron binder sheet — ONE instructor, BOTH tables ════════════
     Plain monochrome, the semester table first. Reuses the board's #sch-print
     host and its print stylesheet, so the palette is forced to black on white
     and the 10c pagination rules (repeating header, no split row, no dangling
     group title) apply to both tables for free.                            */
  const SEM_PRINT = (st) => (st.n == null ? "—"
    : st.done ? "met"
      : "short " + st.short + (st.sem.left <= CUR().SEM_RED_DAYS ? " — semester ends " + dmy(st.sem.end) : ""));

  function printCurrency(code) {
    const i = S().find("instructors", code);
    if (!i || !i.oid || !CUR().loaded()) { S().toast("Nothing to print — no instructor or catalog.", "bad"); return; }
    const exp = !!i.experienced;
    const s = CUR().summary(i.oid, exp);
    const sem = CUR().semSummary(i.oid, i);
    const w = sem.sem;

    const semRow = (it) => {
      const q = CUR().quotaOf(it, i);
      if (q.window) {                       // the §49 threshold — a date row
        const stw = CUR().statusOf(i.oid, it, exp);
        const left = stw.v.days == null ? "—" : stw.state === "never" ? "—" : (stw.left > 0 ? "+" : "") + stw.left;
        return `<tr><td>${esc(it.name)} (threshold, not a quota)</td>
          <td>${esc(stw.v.text)}</td>
          <td>${stw.last ? esc(dmy(stw.last)) : "—"}</td>
          <td>${esc(left)}</td>
          <td>${esc(CUR_STATE_TXT[stw.state])}</td></tr>`;
      }
      const st = CUR().semStatusOf(i.oid, it, i);
      return `<tr><td>${esc(it.name)}${q.total ? " (printed total)" : ""}${q.tp ? " (Test Pilots only)" : ""}</td>
        <td>${q.n == null ? "—" : esc(q.n + " sortie" + (q.n === 1 ? "" : "s"))}</td>
        <td>${st.x}</td>
        <td>${st.x} / ${q.n == null ? "—" : q.n}</td>
        <td>${esc(SEM_PRINT(st))}</td></tr>`;
    };
    const semBody = CUR().semGroups().map((g) =>
      `<tr class="pv-grp"><th colspan="5">${esc(g.label.toUpperCase())}</th></tr>`
      + g.items.map(semRow).join("")).join("");

    const row = (it) => {
      const st = CUR().statusOf(i.oid, it, exp);
      const left = st.v.days == null ? "—" : st.state === "never" ? "—" : (st.left > 0 ? "+" : "") + st.left;
      return `<tr><td>${esc(it.name)}${st.v.warn ? " ⚠" : ""}</td>
        <td>${esc(st.v.text)}</td>
        <td>${st.last ? esc(dmy(st.last)) : "—"}</td>
        <td>${st.expires ? esc(dmy(st.expires)) : "—"}</td>
        <td>${esc(left)}</td>
        <td>${esc((st.obligation ? CUR_OBL_PRINT : CUR_STATE_TXT)[st.state])}</td></tr>`;
    };
    /* pv-grp is what the print stylesheet keeps glued to the first row of its
       group, so a kind header can never dangle alone at the foot of a page */
    const body = datedGroups().map((g) =>
      `<tr class="pv-grp"><th colspan="6">${esc(g.label.toUpperCase())}</th></tr>` + g.items.map(row).join("")).join("");

    const old = $id("sch-print");
    if (old) old.remove();
    const host = document.createElement("div");
    host.id = "sch-print";
    host.innerHTML = `<div class="pv-bar">
        <button type="button" class="sch-btn" data-pv="close">✕ Close</button>
        <button type="button" class="sch-btn primary" data-pv="print">🖨 Print</button>
        <span class="sch-hint">the printed sheet drops this bar and the app chrome</span>
      </div>
      <div class="pv-page">
        <div class="pv-top">
          <h2>INSTRUCTOR CURRENCY</h2>
          <p class="pv-p"><b>${esc(i.code)}</b> ${esc(i.rank || "")} ${esc((i.last_name || "") + (i.first_name ? ", " + i.first_name : ""))}
            ${i.callsign ? " · " + esc(i.callsign) : ""}${i.country ? " · " + esc(i.country) : ""}${i.test_pilot ? " · TEST PILOT" : ""}</p>
          <p class="pv-p">Experience level <b>${exp ? "EXPERIENCED (ΕΜΠ)" : "INEXPERIENCED (ΑΠ)"}</b>
            · printed <b>${esc(dmy(CUR().todayISO()))}</b></p>
          <p class="pv-p">${s.owes ? "<b>NOT CURRENT — " + s.owes + " item" + (s.owes === 1 ? "" : "s") + " expired or never recorded.</b>"
            : s.expiring ? "<b>Available</b> — " + s.expiring + " item" + (s.expiring === 1 ? "" : "s") + " expiring."
              : "<b>Available</b> — all " + s.counted + " counted items in date."}
            ${"Recorded obligations: " + s.obl.counted + " row" + (s.obl.counted === 1 ? "" : "s") + " outside that count"
              + (s.obl.overdue ? ", <b>" + s.obl.overdue + " overdue</b>." : ", none overdue.")}
            Semester quotas: <b>${sem.done} of ${sem.total}</b> met${sem.short ? ", " + sem.short + " sortie"
              + (sem.short === 1 ? "" : "s") + " still owed" : ""} — a shortfall there is not an availability loss.</p>
          <p class="pv-p">Colour scale: expiring = a quarter of the window — at most ${CUR().AMBER_MAX_DAYS} days — or less remaining ·
            current = anything more · EXPIRED / never recorded = not current ·
            no counter = the 3-01 prints no validity. ≈ = project conversion of a printed period. ⚠ = printed contradiction.</p>
          <p class="pv-p">Rows whose STATUS reads <b>recorded</b>, <b>due soon</b>, <b>overdue</b> or <b>—</b> are recorded
            obligations, left out of the availability count above — each is either printed with no availability loss,
            scoped to the trainee rather than the serving instructor, or a one-off deadline / tenure / ΠΡ-module clock.</p>
        </div>
        <p class="pv-h">① ΑΝΑ ΕΞΑΜΗΝΟ — SEMESTER QUOTAS · ${esc(w.label.toUpperCase())} · ENDS ${esc(dmy(w.end))} (${w.left} DAYS LEFT)</p>
        <p class="pv-p">REQUIRED is the ΤΟΠΟΘΕΤΗΜΕΝΟΣ (POSTED) column of Πίνακας 6 / Πίνακας 9 — the printed split is
          posted vs attached, not experienced vs inexperienced. A quota is not a window: nothing counts down and a
          shortfall costs no availability (§40 · §46).</p>
        <table class="pv-t"><thead><tr><th>ITEM</th><th>REQUIRED</th><th>RECORDED</th><th>PROGRESS</th><th>STATUS</th></tr></thead>
          <tbody>${semBody}</tbody></table>
        <p class="pv-h">② ΛΗΓΟΥΝ / ΔΕΝ ΛΗΓΟΥΝ — DATED ITEMS</p>
        <table class="pv-t"><thead><tr><th>ITEM</th><th>VALIDITY</th><th>LAST DONE</th><th>EXPIRES</th><th>DAYS LEFT</th><th>STATUS</th></tr></thead>
          <tbody>${body}</tbody></table>
      </div>`;
    document.body.appendChild(host);
    document.documentElement.classList.add("sch-printing");
    host.addEventListener("click", (e) => {
      const b = e.target.closest("[data-pv]");
      if (!b) return;
      if (b.dataset.pv === "close") { host.remove(); document.documentElement.classList.remove("sch-printing"); }
      else window.print();
    });
  }

  /* ══ wiring — attached ONCE to the view element ═════════════════════════
     render() only swaps the innerHTML of #cur-list / #cur-main, so these
     delegated listeners survive every repaint. */
  function wire(el) {
    if (el._wired) return;
    el._wired = true;

    el.addEventListener("change", (e) => {
      const t = e.target;
      const ip = selected();
      /* both seams write STRAIGHT THROUGH: there is no Save button on this
         tab, the store event repaints and the caret is put back. */
      const cd = t.closest ? t.closest("[data-curdate]") : null;
      if (cd) {
        if (!ip || !ip.oid) return;
        ui.focus = { kind: "curdate", id: cd.dataset.curdate };
        CUR().bump(ip.oid, cd.dataset.curdate, cd.value, "manual");
        return;
      }
      const cc = t.closest ? t.closest("[data-curcount]") : null;
      if (cc) {
        if (!ip || !ip.oid) return;
        const id = cc.dataset.curcount;
        ui.focus = { kind: "curcount", id: id };
        /* an empty box means "none recorded", which is 0 — the seam refuses
           anything else and leaves the stored figure untouched.
           The STORED FIGURE, not the return value, is what decides whether a
           repaint is still owed: a write emits and the store event repaints,
           while a refusal ("150", "two") and a no-op ("02" for a stored 2)
           both leave the box showing something the store never accepted. */
        const raw = String(cc.value).trim();
        const before = CUR().countOf(ip.oid, id);
        CUR().bumpCount(ip.oid, id, raw === "" ? 0 : raw, null, "manual");
        if (CUR().countOf(ip.oid, id) === before) render();   // put the stored truth back
        return;
      }
      if (t.matches && t.matches("[data-curexp]")) {
        if (ip) S().upsert("instructors", { code: ip.code, experienced: !!t.checked });
      }
    });

    el.addEventListener("click", (e) => {
      const pick = e.target.closest("[data-cur-ip]");
      if (pick) { ui.sel = pick.dataset.curIp; ui.focus = null; render(); return; }
      const b = e.target.closest("[data-act]");
      if (!b) return;
      const act = b.dataset.act;
      if (act === "cur-print") { printCurrency(ui.sel); return; }
      if (act === "cur-goto") {
        const row = el.querySelector(`[data-currow="${b.dataset.id}"]`);
        if (!row) return;
        row.scrollIntoView({ block: "center", behavior: "smooth" });
        row.classList.remove("is-flash");
        void row.offsetWidth;                            // restart the animation
        row.classList.add("is-flash");
      }
    });
  }

  /* ── the coverage identity, checked at boot ─────────────────────────────
     table ① + table ② must be the whole catalog with no id rendered twice.
     A silent gap here would mean an instructor holds something the app never
     shows him, so it is asserted rather than assumed.                       */
  function curCoverage() {
    const sem = CUR().semItems().map((it) => it.id);
    const dated = [].concat.apply([], datedGroups().map((g) => g.items.map((it) => it.id)));
    const all = CUR().items().map((it) => it.id);
    const seen = new Set(sem.concat(dated));
    const out = { sem: sem.length, dated: dated.length, total: all.length,
      duplicated: sem.concat(dated).length - seen.size,
      missing: all.filter((id) => !seen.has(id)) };
    if (out.duplicated || out.missing.length || out.sem + out.dated !== out.total) {
      console.warn("SchedCurrency: the two tables do not cover the catalog exactly", out);
    }
    return out;
  }
  window.curCoverage = curCoverage;
})();
