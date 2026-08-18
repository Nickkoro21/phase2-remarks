"use strict";
/* ══════════════════════════════════════════════════════════════════════════
   INSTRUCTOR CURRENCY — its own top-level tab   (Round 11 · MATRIX in 12a)
   ══════════════════════════════════════════════════════════════════════════
   Round 11 directive: «Εγώ το θέλω σε ξεχωριστή καρτέλα όπως είναι το
   scheduler, validate, κλπ.» — this tab.
   Round 12a directive (18/08/2026): «Όπως είναι στημένο τώρα το currency πρέπει
   να κοιτάω κάθε εκπαιδευτή ξεχωριστά. Rows τα ονόματα, στήλες τα events.
   Φτιάξε περισσότερους από έναν πίνακες.» — so the one-instructor-at-a-time
   card is gone and the view is a MATRIX: rows = instructors, columns = the
   catalog events, split across FOUR collapsible tables (see the second IIFE).

   WHAT MOVED HERE
     § ③ of scheduler.js — window.SchedCurrency — moved VERBATIM (Round 10b/
     10c/10d behaviour untouched) and extended with the semester model below.
     The Roster keeps NOTHING currency-related any more (user ruling: «Τίποτα»):
     the dot, the "owes N" chip and everything else live in this tab.

   THE TWO FAMILIES OF ITEM — one engine, two shapes
     QUOTAS  the 15 sim / s-category items. Πίνακας 6 (F/S) and Πίνακας 9 (air)
       print, per flyer per SEMESTER, HOW MANY sorties are required. That is a
       quota, not a rolling window: it carries an editable COUNTER per semester
       and never touches the availability tally.
     DATED   the other 76 items, exactly as Round 10c/10d left them: one date
       each, the min(round(v×25%), 45) colour rule, recorded obligations with
       per-id reasons, ≈ conversions and ⚠ flags.
     15 + 76 = 91 = the whole catalog; every id is rendered exactly once —
     asserted at boot by curCoverage() over the four tables.

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
    /* a LABEL helper: it must always return a semester to render, so it keeps
       its fallback — but it no longer keeps quiet about a key that is neither
       blank nor real (Round 12b, same reasoning as semKeyOrNull below). */
    if (!(key === "" || key == null) && !SEM_RE.test(String(key))) {
      console.warn("SchedCurrency.semOf: malformed semester key " + JSON.stringify(key)
        + " — falling back to the current semester for DISPLAY only; nothing is written under it");
    }
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
  /* ── THE SEMESTER KEY, READ AND WRITTEN THE SAME WAY ────────────────────
     Round 12b (R11 verify residual). "" / null / undefined means «the current
     semester» and is the normal call from the card. ANYTHING ELSE that is not
     a real key is a BUG IN THE CALLER — «2026-H9», «2026H1», a Date object —
     and silently answering with the current half would hand back the wrong
     instructor's wrong semester under a name that was never asked for. Both
     the read and the write now say so and refuse: the read returns an empty
     bag (every count reads 0, nothing is invented) and the write returns null
     without touching the store. Valid «2026-H1» keys are untouched.        */
  const semKeyBlank = (k) => k === "" || k === null || k === undefined;
  function semKeyOrNull(semKey, who) {
    if (semKeyBlank(semKey)) return curSem().key;
    const k = String(semKey);
    if (SEM_RE.test(k)) return k;
    console.warn("SchedCurrency." + who + ": refused a malformed semester key — "
      + JSON.stringify(semKey) + " (expected YYYY-H1 / YYYY-H2, or nothing for the current one)");
    return null;
  }
  function countsOf(oid, semKey) {
    const k = semKeyOrNull(semKey, "countsOf");
    if (k === null) return {};
    const r = record(oid);
    const s = r && r.semesters;
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
    /* Round 12b — a malformed key is refused, never coerced (see semKeyOrNull
       above): writing 2 sorties into «the current semester» because the caller
       asked for «2026-H9» would file them under a semester nobody named. */
    const key = semKeyOrNull(semKey, "bumpCount");
    if (key === null) return null;
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
   THE TAB — window.curInit()                        (Round 11 · MATRIX in 12a)
   ══════════════════════════════════════════════════════════════════════════
   User directive of 18/08/2026: «Όπως είναι στημένο τώρα το currency πρέπει να
   κοιτάω κάθε εκπαιδευτή ξεχωριστά. Rows τα ονόματα, στήλες τα events. Φτιάξε
   περισσότερους από έναν πίνακες.» The Round-11 master-detail card (one
   instructor at a time, list on the left) is GONE. The whole squadron is on
   screen at once:

     ROWS      every ACTIVE instructor, one row each, named «SURNAME N.» through
               SchedStore.personLabel — no internal handle is rendered anywhere.
     COLUMNS   the catalog events, split across FOUR tables so a column stays
               readable and no table is wider than ~30 columns:
                 ① ΑΝΑ ΕΞΑΜΗΝΟ        15 (the quota rows + the §49 threshold)
                 ② Landings + Recency 19
                 ③ Ε-items            28
                 ④ Other              29
               Every catalog id sits in EXACTLY ONE table: 15+19+28+29 = 91,
               asserted at boot by curCoverage() — a silent gap would mean an
               instructor holds something the app never shows him.
     CELLS     one compact reading — «x/N» for a quota, signed days-left for a
               dated item — that becomes the REAL native input (number / date)
               on click. The write goes through the SAME two seams as Round 11,
               bump() and bumpCount(), with the same guards; the store event
               repaints and the cell, the row chips and the table rollup are
               recomputed together.
     TABLES    collapse from their header bar (chevron · item count · a one-line
               rollup), remembered per table in localStorage. Default: all open.

   WHAT THIS MODULE DOES NOT DO
     It owns the HTML and nothing else. Every number is computed by
     SchedCurrency out of the catalog, ONE date per dated item and ONE counter
     per quota item per semester. No figure is decided here.

   THE ΕΜΠ / ΑΠ AXIS
     Round 11 had a global toggle on the card. A matrix has no "current
     instructor", so each ROW reads that instructor's OWN `experienced` flag and
     wears it as a tag; the flag is edited where it belongs — the roster form in
     the Scheduler (Round 12a added the checkbox there).                       */
(() => {
  const $id = (x) => document.getElementById(x);
  const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ESC[c]);
  const S = () => window.SchedStore;
  const CUR = () => window.SchedCurrency;
  const dmy = (v) => window.fmtDMY(v);
  /* «SURNAME N.» — the one display-name helper of the whole app (Round 12a) */
  const who = (rec) => S().personLabel(rec);

  /* ── THE FOUR TABLES ─────────────────────────────────────────────────────
     ① is the semester block in PRINTED table order (Πίνακας 6, then Πίνακας 9),
     ②③④ split the 76 dated ids by catalog kind. The kinds are named, never
     sniffed, so a new catalog kind shows up as a coverage warning instead of
     quietly disappearing from the screen.                                    */
  const TABLES = [
    { key: "sem", n: "①", sem: true, label: "ΑΝΑ ΕΞΑΜΗΝΟ — semester quotas",
      note: "sorties per semester — Πίνακας 6 (F/S) and Πίνακας 9 (air). A quota is not a window: "
        + "nothing counts down and a shortfall costs no availability (§40 · §46)" },
    { key: "ldg", n: "②", kinds: ["landing", "recency"], label: "Landings + Recency",
      note: "the rolling windows that decide whether he may fly tonight" },
    { key: "e", n: "③", kinds: ["e-item"], label: "Ε-items (EVENTS)",
      note: "the EVENTS table of the 3-01 — one date each" },
    { key: "oth", n: "④", kinds: ["other"], label: "Other",
      note: "readiness conditions, seminars, definitions and the ΠΡ clocks" },
  ];
  const TBL = new Map(TABLES.map((t) => [t.key, t]));

  /* ui.edit  the ONE cell currently showing a native input, as {code, id, kind}.
              Exactly one at a time, so the input carries id="cur-editing" and
              the repaint puts the caret straight back on it.
     ui.dirty a store write that landed while another tab was open — the matrix
              is 1 365 cells, so it is repainted on activation, not blindly.  */
  const ui = { booted: false, edit: null, dirty: false };

  /* ── collapse state — the board's pattern, this tab's own key ─────────────
     Default OPEN for every table (user ruling: «Οι Πίνακες να μπορούν να
     κλείσουν και να ανοίξουν για ευκολία» — closed is the exception).        */
  const COLKEY = "p2r-cur-collapse";
  function colMap() {
    try { const v = JSON.parse(localStorage.getItem(COLKEY) || "{}"); return v && typeof v === "object" ? v : {}; }
    catch (e) { return {}; }
  }
  function setCol(key, collapsed) {
    const m = colMap();
    m[key] = !!collapsed;
    try { localStorage.setItem(COLKEY, JSON.stringify(m)); } catch (e) { /* private mode */ }
  }
  const tblOpen = (key) => { const m = colMap(); return key in m ? !m[key] : true; };

  /* the collapsible header button — chevron + title, aria-expanded, data-cursec */
  function secBtn(key, titleHtml) {
    const open = tblOpen(key);
    return `<button type="button" class="sch-sec${open ? " is-open" : ""}" data-cursec="${esc(key)}"
      aria-expanded="${open ? "true" : "false"}" title="${open ? "collapse" : "expand"} this table">
      <span class="sch-secarr">${open ? "▾" : "▸"}</span><h2>${titleHtml}</h2></button>`;
  }

  /* ── the people ──────────────────────────────────────────────────────────
     ROWS = the ACTIVE instructors (the directive's own words). A departed one
     keeps his stored dates but leaves the matrix; the header says how many, so
     nobody silently disappears.                                              */
  const natural = (a, b) => String(a).replace(/\d+/g, (n) => n.padStart(6, "0"))
    .localeCompare(String(b).replace(/\d+/g, (n) => n.padStart(6, "0")));
  const allIps = () => (S().get("instructors") || []).slice();
  const departedN = () => allIps().filter((i) => (i.status || "active") === "departed").length;
  /* sorted by the NAME the user reads, not by the code he no longer sees */
  const listed = () => allIps().filter((i) => (i.status || "active") !== "departed")
    .sort((a, b) => String(who(a)).localeCompare(String(who(b))) || natural(a.code, b.code));

  /* per-render memo: summary()/semSummary() walk all 91 items, and every row
     head of every table asks for them. Cleared at the top of render().       */
  const memo = { s: new Map(), sem: new Map() };
  function sumOf(i) {
    if (!memo.s.has(i.code)) memo.s.set(i.code, CUR().summary(i.oid, !!i.experienced));
    return memo.s.get(i.code);
  }
  function semOf(i) {
    if (!memo.sem.has(i.code)) memo.sem.set(i.code, CUR().semSummary(i.oid, i));
    return memo.sem.get(i.code);
  }

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
    S().subscribe(() => {
      if (!ui.booted) return;
      if (visible()) render(); else ui.dirty = true;
    });
    wire($id("view-currency"));
    render();
    curCoverage();                       // the 15 + 19 + 28 + 29 = 91 identity
  };

  const visible = () => { const v = $id("view-currency"); return !!v && !v.classList.contains("hidden"); };

  function render() {
    ui.dirty = false;
    memo.s.clear(); memo.sem.clear();
    const all = listed();
    /* an editor whose person or item vanished (a roster edit, a catalog reload)
       must not survive as a ghost */
    if (ui.edit && !all.some((i) => i.code === ui.edit.code)) ui.edit = null;
    $id("cur-main").innerHTML = headHtml(all) + TABLES.map((t) => tableHtml(t, all)).join("");
    const inp = $id("cur-editing");
    if (inp) { inp.focus(); if (inp.select && ui.edit && ui.edit.kind === "q") inp.select(); }
  }

  /* ══ THE PAGE HEAD ══════════════════════════════════════════════════════ */
  function headHtml(all) {
    if (!CUR().loaded()) {
      return `<div class="sch-ph"><strong>The expiring-items catalog could not be read.</strong>
        <p>Expected <code>${esc(CUR().CAT_URL)}</code>.${CUR().error() ? " " + esc(CUR().error()) : ""}</p></div>`;
    }
    const w = CUR().curSem();
    const dep = departedN();
    return `<div class="cur-head">
      <h2>Instructor currency <span class="count">${all.length} instructor${all.length === 1 ? "" : "s"}</span></h2>
      <span class="sch-nd" title="project ruling: the semester is a calendar half — H1 = 01/01-30/06, H2 = 01/07-31/12. The stored key is «${esc(w.key)}», so 01/01 rolls over instead of overwriting.">${esc(w.label)} — ends ${esc(dmy(w.end))} (${w.left} days left)</span>
      <span class="sch-nd" title="the referee-verified catalog of everything the 3-01/2025 ΔΑΕ makes a T-6A instructor hold">${CUR().items().length} catalog items in ${TABLES.length} tables</span>
      ${dep ? `<span class="sch-badge" title="a departed instructor keeps his stored dates but leaves the matrix — he is still in the Scheduler roster">${dep} departed, not listed</span>` : ""}
      <span class="sch-spacer"></span>
      <span class="sch-hint">rows are instructors, columns are the catalog items${canEdit()
        ? " — click any cell to type its date or count"
        : " — view-only until Editor mode is unlocked in the topbar"}</span>
    </div>`
      + (all.length ? "" : `<div class="sch-ph"><strong>No active instructor.</strong>
        <p>Add them in the Scheduler roster — this tab reads the same records.</p></div>`);
  }

  /* ══ ONE TABLE ══════════════════════════════════════════════════════════ */
  function itemsOf(t) {
    if (!CUR().loaded()) return [];
    if (t.sem) return [].concat.apply([], CUR().semGroups().map((g) => g.items));
    return [].concat.apply([], CUR().groups()
      .filter((g) => g.kinds.some((k) => t.kinds.indexOf(k) >= 0))
      .map((g) => g.items));
  }

  function tableHtml(t, all) {
    if (!CUR().loaded()) return "";
    const its = itemsOf(t);
    const open = tblOpen(t.key);
    const r = rollup(t, its, all);
    return `<section class="panel sch-panel cur-sec cur-mx" data-tbl="${esc(t.key)}">
      <div class="sch-h cur-mxh">
        ${secBtn(t.key, `${t.n} ${esc(t.label)} <span class="count">${its.length} item${its.length === 1 ? "" : "s"}</span>`)}
        <span class="sch-cdot st-${esc(r.state)}" title="${esc(r.tip)}"></span>
        <span class="sch-nd cur-roll" title="${esc(r.tip)}">${esc(r.txt)}</span>
      </div>
      ${open ? legendHtml(t, its) + gridHtml(t, its, all) : ""}
    </section>`;
  }

  /* ── the one-line rollup of the header bar ────────────────────────────────
     It answers "is anything wrong in THIS table?" over the whole squadron, and
     it counts what the table actually holds — never the whole catalog.       */
  function rollup(t, its, all) {
    if (t.sem) {
      let owed = 0, behind = 0;
      for (const i of all) {
        if (!i.oid) continue;
        const sm = semOf(i);
        if (sm.short) { owed += sm.short; behind += 1; }
      }
      const st = !behind ? "ok" : (CUR().curSem().left > CUR().SEM_RED_DAYS ? "expiring" : "expired");
      return { state: st, txt: behind ? owed + " sortie" + (owed === 1 ? "" : "s") + " owed by " + behind + " instructor" + (behind === 1 ? "" : "s")
        : "every quota met",
        tip: "the semester quotas of this table across the whole squadron. A shortfall is NOT an availability loss "
          + "(§40 absorbs a justified one, §46 records the rest) — it never enters the dot or “owes”." };
    }
    const ids = new Set(its.map((it) => it.id));
    let red = 0, amber = 0, oblOver = 0, people = 0;
    for (const i of all) {
      if (!i.oid) continue;
      const s = sumOf(i);
      const mine = s.red.filter((x) => ids.has(x.item.id)).length;
      red += mine;
      amber += s.amber.filter((x) => ids.has(x.item.id)).length;
      oblOver += s.obl.overdueRows.filter((x) => ids.has(x.item.id)).length;
      if (mine) people += 1;
    }
    return {
      state: red ? "expired" : (amber ? "expiring" : "ok"),
      txt: (red ? red + " owed by " + people + " instructor" + (people === 1 ? "" : "s") : "nothing owed")
        + (amber ? " · " + amber + " expiring" : "")
        + (oblOver ? " · " + oblOver + " obligation" + (oblOver === 1 ? "" : "s") + " overdue" : ""),
      tip: "counted rows of THIS table only, across the whole squadron: expired or never recorded = owed. "
        + "Recorded obligations are counted on their own — they never enter the dot, the chips or “owes”.",
    };
  }

  /* ── the legend — ONE line per table, with THAT table's own figures ───────
     Round 11 verify item 17: the card printed the whole catalog's
     counted/obligation/no-counter split under every block, which was false for
     the block it sat under. Every figure below is computed over the items of
     this table alone. counted / no-counter depend on which validity column the
     row reads, so both levels are printed whenever they disagree.            */
  function tableStats(its) {
    const out = { e: { counted: 0, obl: 0, neutral: 0 }, a: { counted: 0, obl: 0, neutral: 0 } };
    for (const it of its) {
      for (const lvl of [true, false]) {
        const bag = lvl ? out.e : out.a;
        const v = CUR().resolve(it, lvl);
        if (v.days == null) bag.neutral += 1;         // same order as summary(): neutral first
        else if (CUR().isObligation(it.id)) bag.obl += 1;
        else bag.counted += 1;
      }
    }
    return out;
  }
  const bothFig = (e, a) => (e === a ? String(e) : e + " ΕΜΠ / " + a + " ΑΠ");

  function semStats(its) {
    const Q = CUR().SEM_QUOTA;
    let printed = 0, dash = 0, win = 0, tp = 0, tot = 0;
    for (const it of its) {
      const q = Q[it.id] || {};
      if (q.window) { win += 1; continue; }
      if (q.posted == null) dash += 1; else printed += 1;
      if (q.tp_only) tp += 1;
      if (q.total) tot += 1;
    }
    return { printed, dash, win, tp, tot };
  }

  function legendHtml(t, its) {
    if (t.sem) {
      const f = semStats(its);
      return `<p class="sch-hint sch-curlegend">
        <span class="sch-cdot st-ok"></span> met (x ≥ N) ·
        <span class="sch-cdot st-expiring"></span> short with more than ${CUR().SEM_RED_DAYS} days of the semester left ·
        <span class="sch-cdot st-expired"></span> short with ${CUR().SEM_RED_DAYS} days or less left ·
        <span class="sch-cdot st-neutral"></span> nothing required.
        <b>In this table:</b> ${f.printed} column${f.printed === 1 ? "" : "s"} with a printed requirement
        (${f.tot} of them the printed <b>ΣΥΝΟΛΑ</b> totals, ${f.tp} Test-Pilot only) ·
        ${f.dash} that print a dash and require nothing ·
        ${f.win} <b>threshold</b> column that is not a quota at all and DOES count for availability (§49).
        <b>N</b> is the <b>ΤΟΠΟΘΕΤΗΜΕΝΟΣ (POSTED)</b> column of Πίνακας 6/9 — the printed split is posted vs attached,
        <b>not</b> experienced vs inexperienced, so a row's ΕΜΠ/ΑΠ tag does not move it (an <i>attached</i> flag is a future axis).
      </p>`;
    }
    const f = tableStats(its);
    return `<p class="sch-hint sch-curlegend">
      <span class="sch-cdot st-ok"></span> in date ·
      <span class="sch-cdot st-expiring"></span> amber when a quarter of the window — at most ${CUR().AMBER_MAX_DAYS} days — remains ·
      <span class="sch-cdot st-expired"></span> expired or never recorded ·
      <span class="sch-cdot st-neutral"></span> no counter (no limit · set outside the 3-01 · n/a).
      <b>In this table:</b> ${esc(bothFig(f.e.counted, f.a.counted))} counted for availability ·
      ${esc(bothFig(f.e.obl, f.a.obl))} recorded obligation${f.e.obl === 1 && f.a.obl === 1 ? "" : "s"} ·
      ${esc(bothFig(f.e.neutral, f.a.neutral))} with no counter${f.e.counted === f.a.counted && f.e.neutral === f.a.neutral ? ""
        : " (the two figures differ because the ΑΠ column prints «--» on some rows — see the ⚠ in the header)"}.
      <b>≈</b> project conversion of a printed period (${esc(CUR().CONV_LEGEND)}) · <b>⚠</b> a printed contradiction — hover the column.
      Columns tagged <b>obligation</b> keep their colour but stay out of the dot, the chips and “owes” — each header states why.
    </p>`;
  }

  /* ── column headers ──────────────────────────────────────────────────────
     The printed names are long ("Ε-45 — VISUAL DELIVERY MED/HI APEX, day"), so
     the header shows the HEAD of the name, set vertically, with the full name
     (and everything else the row knows) in the tooltip. When two items of the
     same table share a head — the four ΠΡ rows all start «Advanced exercises
     (ΠΡ)» — the tail is appended, because two identical column titles would be
     a lie about which one the user is typing into.                          */
  const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
  const headOf = (it) => String(it.name || it.id).split(" — ")[0].trim();
  const tailOf = (it) => String(it.name || it.id).split(" — ").slice(1).join(" — ").trim();
  function colLabels(its) {
    const bag = new Map();
    for (const it of its) {
      const h = headOf(it);
      if (!bag.has(h)) bag.set(h, []);
      bag.get(h).push(it);
    }
    const out = new Map();
    for (const [h, list] of bag) {
      if (list.length === 1) { out.set(list[0].id, clip(h, 30)); continue; }
      /* The head repeats. Appending the whole tail is not enough: «Σ-2 —
         Instrument flight (PDO), day» and «…, night» differ in their LAST word,
         which is exactly the word a clip throws away. So the common opening of
         the tails — which by definition tells nothing apart — is dropped, and
         what is left is what the reader needs: «Σ-2 · day» / «Σ-2 · night». */
      const tails = list.map(tailOf);
      const first = tails[0];
      let n = 0;
      while (n < first.length && tails.every((t) => t[n] === first[n])) n += 1;
      const keep = Math.max(0, first.slice(0, n).lastIndexOf(" ") + 1);   // never cut a word in half
      list.forEach((it, k) => out.set(it.id,
        clip(clip(h, 12) + " · " + (tails[k].slice(keep) || tails[k]), 34)));
    }
    return out;
  }

  function colTip(it, t) {
    const src = it.source || {};
    const q = t.sem ? (CUR().SEM_QUOTA[it.id] || {}) : null;
    const lines = [String(it.name || it.id)];
    if (q && q.window) {
      lines.push("THRESHOLD, NOT A QUOTA — " + (q.why || ""));
    } else if (q) {
      lines.push(q.printed ? "PRINTED: " + q.printed : "");
      lines.push(q.posted == null ? (q.why || "nothing is printed for this column")
        : "ΤΟΠΟΘΕΤΗΜΕΝΟΣ (posted): " + q.posted + " · ΠΡΟΣΚΟΛΛΗΜΕΝΟΣ (attached): "
          + (q.attached == null ? "none — a dash is printed" : q.attached));
      if (q.note) lines.push(q.note);
    }
    if (!q || q.window) {
      const e = CUR().resolve(it, true), a = CUR().resolve(it, false);
      lines.push("Validity — " + (e.text === a.text ? e.text : "ΕΜΠ " + e.text + " · ΑΠ " + a.text));
      if (e.tip || a.tip) lines.push(e.tip || a.tip);
      if (e.warn) lines.push("⚠ " + e.warn);
      if (CUR().isObligation(it.id)) {
        lines.push("RECORDED OBLIGATION — " + CUR().oblWhy(it.id)
          + "; it keeps its colour but stays out of the availability dot, the chips and “owes”.");
      }
      lines.push("If it lapses — " + String(it.lapse_consequence || "—"));
    }
    lines.push("Source: " + ((q && q.src) || (src.ref || "3-01") + (src.page_pdf ? " · PDF p." + src.page_pdf : "")));
    return lines.filter(Boolean).join("\n\n");
  }

  function gridHtml(t, its, all) {
    if (!all.length) return "";
    const labs = colLabels(its);
    const warn = (it) => (CUR().resolve(it, true).warn ? " ⚠" : "");
    const obl = (it) => (!t.sem && CUR().isObligation(it.id) ? " °" : "");
    const head = `<tr><th class="cur-who cur-corner" scope="col">Instructor
        <span class="sch-nd">${all.length}</span></th>`
      + its.map((it) => `<th class="cur-col" scope="col" title="${esc(colTip(it, t))}"
          ><span class="cur-collbl">${esc(labs.get(it.id))}${esc(warn(it))}${esc(obl(it))}</span></th>`).join("")
      + `</tr>`;
    return `<div class="sch-scroll cur-mxscroll">
      <table class="sch-tbl cur-mxtbl">
        <thead>${head}</thead>
        <tbody>${all.map((i) => rowHtml(t, its, i)).join("")}</tbody>
      </table></div>`;
  }

  /* ══ ONE ROW = ONE INSTRUCTOR ═══════════════════════════════════════════ */
  function rowHtml(t, its, i) {
    if (!i.oid) {
      return `<tr class="cur-row"><th class="cur-who" scope="row"><span class="cur-whobox">${whoHtml(i, null, null)}</span></th>
        <td class="cur-cell is-off" colspan="${its.length}">no OID yet — open the roster form in the Scheduler and save the row once</td></tr>`;
    }
    const s = sumOf(i), sm = semOf(i), exp = !!i.experienced;
    return `<tr class="cur-row">
      <th class="cur-who" scope="row"><span class="cur-whobox">${whoHtml(i, s, sm)}</span></th>
      ${its.map((it) => cellHtml(t, it, i, exp)).join("")}
    </tr>`;
  }

  /* the row head — the person, then everything the old left-hand list carried:
     the availability dot, the ΕΜΠ/ΑΠ tag, "owes N", "sem x/M" and the 🖨 that
     prints his binder sheet (printCurrency is Round 11's, untouched).        */
  function whoHtml(i, s, sm) {
    const nm = who(i);
    const idTip = "code " + (i.code || "—") + (i.rank ? " · " + i.rank : "")
      + (i.callsign ? " · " + i.callsign : "") + (i.country ? " · " + i.country : "")
      + (i.test_pilot ? " · TEST PILOT (the SIM-ΔΑ quota applies to him)" : "")
      + "\n\nThe code is the stored key — it stays in the roster form, in the pickers and in search.";
    const lvl = i.experienced
      ? { t: "ΕΜΠ", why: "EXPERIENCED (Annex B §17) — every row of this line reads the ΕΜΠ validity column" }
      : { t: "ΑΠ", why: "INEXPERIENCED (Annex B §17) — every row of this line reads the ΑΠ validity column" };
    const chips = !s ? "" : (s.owes
      ? `<span class="sch-badge cur-expired" title="${esc(availTip(s))}">owes ${s.owes}</span>`
      : s.expiring ? `<span class="sch-badge cur-expiring" title="${esc(availTip(s))}">exp ${s.expiring}</span>` : "")
      + (sm ? `<span class="sch-badge cur-sem st-${esc(sm.state)}" title="${esc(semTip(sm))}">sem ${sm.done}/${sm.total}</span>` : "");
    return `${s ? `<span class="sch-cdot st-${esc(s.state)}" title="${esc(availTip(s))}"></span>`
      : `<span class="sch-cdot st-neutral" title="no OID — nothing is computed for this row"></span>`}
      <span class="cur-who-n" title="${esc(idTip)}">${esc(nm)}</span>
      <span class="sch-curobl cur-lvl" title="${esc(lvl.why + ". Edit the flag in the Scheduler roster form — it is a property of the instructor, not of this view.")}">${esc(lvl.t)}</span>
      ${chips}
      <span class="sch-spacer"></span>
      <button type="button" class="sch-mini cur-pr" data-act="cur-print" data-code="${esc(i.code)}"
        title="print the binder sheet of ${esc(nm)} — one instructor per sheet, both tables, plain monochrome">🖨</button>`;
  }

  const availTip = (s) => (s.owes
    ? "availability — NOT current: " + s.owes + " item" + (s.owes === 1 ? "" : "s") + " expired or never recorded"
    : s.expiring
      ? "availability — available, " + s.expiring + " item" + (s.expiring === 1 ? "" : "s") + " expiring"
      : "availability — available: " + s.counted + " counted items all in date")
    + " (the whole catalog, not just this table)"
    + (s.obl.overdue ? " · plus " + s.obl.overdue + " recorded obligation"
      + (s.obl.overdue === 1 ? "" : "s") + " overdue (no availability loss — not counted here)" : "");

  const semTip = (sem) => "semester quotas — " + sem.done + " of " + sem.total + " met in "
    + sem.sem.label + " (ends " + dmy(sem.sem.end) + ", " + sem.sem.left + " days left)"
    + (sem.short ? " · " + sem.short + " sortie" + (sem.short === 1 ? "" : "s") + " still owed" : "")
    + ". A quota is not a window: it never touches the availability dot or “owes”.";

  /* ══ ONE CELL ═══════════════════════════════════════════════════════════
     Two kinds, one behaviour: a compact reading that becomes the REAL native
     input on click. A cell with nothing to record is NOT editable and says so
     (Round 11 verify item 19: the sim-4 / Σ-20 columns print a dash in the
     3-01 — offering a counter there would invent a requirement).            */
  const isEditing = (code, id) => !!(ui.edit && ui.edit.code === code && ui.edit.id === id);
  /* Round 12b — the edit lock. A locked matrix is a READING: the cells keep
     their colour and their tooltip but take no tabindex and claim no
     role="button", so 1 365 dead tab stops never appear and no screen reader
     is told a cell is actionable when it is not. The seam in SchedStore
     refuses the write anyway; this is only what the user sees. */
  const canEdit = () => !window.SchedEdit || window.SchedEdit.on();
  const CELL_CLICK = "\n\nClick to type it.";
  const CELL_RO = "\n\nView-only — unlock Editor mode in the topbar to change it.";
  const CUR_STATE_TXT = {
    ok: "current", expiring: "expiring", expired: "EXPIRED",
    never: "never recorded", neutral: "no counter",
  };

  function cellHtml(t, it, i, exp) {
    if (t.sem) {
      const q = CUR().quotaOf(it, i);
      if (!q.window) return quotaCell(it, i, q);
    }
    return dateCell(it, i, exp);
  }

  function quotaCell(it, i, q) {
    const st = CUR().semStatusOf(i.oid, it, i);
    const nm = who(i);
    if (q.n == null) {
      return `<td class="cur-cell st-neutral is-off"
        title="${esc(nm + " · " + it.name + "\n\nNothing is required: " + (q.why || "no number is printed for this row")
          + "\n\nSo there is nothing to type here.")}">—</td>`;
    }
    const tip = nm + " · " + it.name + "\n\n" + st.x + " of " + q.n + " sortie"
      + (q.n === 1 ? "" : "s") + " recorded in " + st.sem.label
      + (st.done ? " — met" : " — " + st.short + " still owed, " + st.sem.left + " days of the semester left")
      + "\nA shortfall is not an availability loss." + (canEdit() ? CELL_CLICK : CELL_RO);
    return `<td class="cur-cell st-${esc(st.state)}${isEditing(i.code, it.id) ? " is-edit" : ""}"
      data-cell="${esc(it.id)}" data-code="${esc(i.code)}" data-k="q"
      ${isEditing(i.code, it.id) || !canEdit() ? "" : `tabindex="0" role="button"`} title="${esc(tip)}">
      ${isEditing(i.code, it.id)
        ? `<input id="cur-editing" type="number" class="sch-in cur-cin" data-curcount="${esc(it.id)}"
             data-code="${esc(i.code)}" min="0" max="${CUR().MAX_COUNT}" step="1" value="${st.x}" inputmode="numeric"
             title="sorties recorded in ${esc(st.sem.label)} — typed by hand, nothing is counted from the training log yet">`
        : `<span class="cur-cv">${st.x}<span class="cur-slash">/</span>${q.n}</span>`}</td>`;
  }

  function dateCell(it, i, exp) {
    const st = CUR().statusOf(i.oid, it, exp);
    const nm = who(i);
    /* the reading, in four words: signed days for a live window, «none» when a
       counted row was never recorded, the DD/MM of a row that has no counter,
       and «—» when there is neither a window nor a date. */
    const txt = st.v.days == null ? (st.last ? dmy(st.last).slice(0, 5) : "—")
      : st.state === "never" ? "none" : (st.left > 0 ? "+" : "") + st.left;
    const tip = nm + " · " + it.name + "\n\n"
      + (st.obligation ? "RECORDED OBLIGATION — " + CUR().oblWhy(it.id) + "\n" : "")
      + "validity " + st.v.text
      + " · last done " + (st.last ? dmy(st.last) : "never recorded")
      + (st.expires ? " · expires " + dmy(st.expires) + " (" + (st.left > 0 ? "+" : "") + st.left + " days)" : "")
      + "\n" + CUR_STATE_TXT[st.state] + (st.obligation ? " — outside the availability count" : "")
      + (st.v.warn ? "\n\n⚠ " + st.v.warn : "")
      + (canEdit() ? CELL_CLICK : CELL_RO);
    return `<td class="cur-cell st-${esc(st.state)}${isEditing(i.code, it.id) ? " is-edit" : ""}"
      data-cell="${esc(it.id)}" data-code="${esc(i.code)}" data-k="d"
      ${isEditing(i.code, it.id) || !canEdit() ? "" : `tabindex="0" role="button"`} title="${esc(tip)}">
      ${isEditing(i.code, it.id)
        ? `<input id="cur-editing" type="date" class="sch-in cur-cin cur-cdate" data-curdate="${esc(it.id)}"
             data-code="${esc(i.code)}" value="${esc(st.last)}"
             title="last done — clearing the box means never recorded">`
        : `<span class="cur-cv">${esc(txt)}</span>`}</td>`;
  }

  /* ══ wiring — attached ONCE to the view element ═════════════════════════
     render() only swaps the innerHTML of #cur-main, so these delegated
     listeners survive every repaint.                                        */
  function wire(el) {
    if (el._wired) return;
    el._wired = true;

    /* both seams write STRAIGHT THROUGH: there is no Save button on this tab.
       The store event repaints and the caret goes back on the same input. */
    el.addEventListener("change", (e) => {
      const t = e.target;
      const cd = t.closest ? t.closest("[data-curdate]") : null;
      if (cd) {
        const ip = S().find("instructors", cd.dataset.code);
        if (!ip || !ip.oid) return;
        CUR().bump(ip.oid, cd.dataset.curdate, cd.value, "manual");
        /* a refused date (the seam's own guard) leaves the store untouched and
           the box showing something that was never accepted — repaint anyway */
        if (CUR().dateOf(ip.oid, cd.dataset.curdate) !== CUR().normISO(cd.value)) render();
        return;
      }
      const cc = t.closest ? t.closest("[data-curcount]") : null;
      if (cc) {
        const ip = S().find("instructors", cc.dataset.code);
        if (!ip || !ip.oid) return;
        const id = cc.dataset.curcount;
        /* an empty box means "none recorded", which is 0 — the seam refuses
           anything else and leaves the stored figure untouched. The STORED
           FIGURE, not the return value, decides whether a repaint is still
           owed: a refusal ("150", "two") and a no-op ("02" for a stored 2) both
           leave the box showing something the store never accepted. */
        const raw = String(cc.value).trim();
        const before = CUR().countOf(ip.oid, id);
        CUR().bumpCount(ip.oid, id, raw === "" ? 0 : raw, null, "manual");
        if (CUR().countOf(ip.oid, id) === before) render();     // put the stored truth back
      }
    });

    /* the grid is keyboard-reachable: a cell is role="button" + tabindex, and
       Enter / Space opens its editor. Escape closes it and gives the cell its
       reading back. Once the input is there the keys belong to IT — a Space
       swallowed inside a native date box would be this handler's fault. */
    el.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && ui.edit) { ui.edit = null; render(); return; }
      if (e.target && e.target.tagName === "INPUT") return;
      const cell = e.target.closest ? e.target.closest("[data-cell]") : null;
      if (!cell || (e.key !== "Enter" && e.key !== " ")) return;
      e.preventDefault();
      openCell(cell);
    });

    el.addEventListener("click", (e) => {
      const sec = e.target.closest("[data-cursec]");
      if (sec) {
        setCol(sec.dataset.cursec, sec.getAttribute("aria-expanded") === "true");
        render();
        return;
      }
      const b = e.target.closest("[data-act]");
      if (b && b.dataset.act === "cur-print") { printCurrency(b.dataset.code); return; }
      const cell = e.target.closest("[data-cell]");
      if (cell) { openCell(cell); return; }
      /* a click anywhere else inside the tab closes the open editor — the cell
         goes back to showing its computed reading */
      if (ui.edit && !e.target.closest("#cur-editing")) { ui.edit = null; render(); }
    });
  }

  function openCell(cell) {
    const code = cell.dataset.code, id = cell.dataset.cell;
    if (!code || !id) return;                       // an is-off cell carries neither
    /* belt and braces: the capture guard in SchedEdit already swallows the
       click, and the seam would refuse the write — this simply never opens an
       input the user cannot save */
    if (!canEdit()) { window.SchedEdit.refuse("record a currency date or count"); return; }
    if (isEditing(code, id)) return;
    ui.edit = { code: code, id: id, kind: cell.dataset.k === "q" ? "q" : "d" };
    render();
  }

  /* ══ the squadron binder sheet — ONE instructor, BOTH tables ════════════
     Round 11's sheet, kept exactly as it was (the user asked for the per-row 🖨
     to print «the EXISTING per-instructor binder sheet»); only the identity
     line now reads the display name. Plain monochrome, the semester table
     first, on the board's #sch-print host and its print stylesheet.         */
  const CUR_OBL_PRINT = {
    ok: "recorded", expiring: "due soon", expired: "overdue",
    never: "—", neutral: "—",
  };
  const datedGroups = () => CUR().groups()
    .filter((g) => !g.kinds.some((k) => CUR().SEM_KINDS.indexOf(k) >= 0));
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
          <p class="pv-p"><b>${esc(who(i))}</b> ${esc(i.rank || "")}
            ${i.callsign ? " · " + esc(i.callsign) : ""}${i.country ? " · " + esc(i.country) : ""}${i.test_pilot ? " · TEST PILOT" : ""}
            · code ${esc(i.code)}</p>
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

  /* ── the coverage identity, checked at boot ─────────────────────────────
     The FOUR tables must be the whole catalog with no id rendered twice. A
     silent gap here would mean an instructor holds something the app never
     shows him, so it is asserted rather than assumed.                       */
  function curCoverage() {
    const per = TABLES.map((t) => ({ key: t.key, ids: itemsOf(t).map((it) => it.id) }));
    const seen = new Set();
    const dup = [];
    for (const p of per) for (const id of p.ids) { if (seen.has(id)) dup.push(id); seen.add(id); }
    const all = CUR().items().map((it) => it.id);
    const out = { total: all.length, seen: seen.size, duplicated: dup,
      missing: all.filter((id) => !seen.has(id)) };
    per.forEach((p) => { out[p.key] = p.ids.length; });
    if (dup.length || out.missing.length || out.seen !== out.total) {
      console.warn("SchedCurrency: the four tables do not cover the catalog exactly", out);
    }
    return out;
  }
  window.curCoverage = curCoverage;
})();
