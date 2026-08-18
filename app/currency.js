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
   catalog events, split across FIVE collapsible tables plus the conditional ✈
   demo-pilot section of Round 14 (see the second IIFE).

   WHAT MOVED HERE
     § ③ of scheduler.js — window.SchedCurrency — moved VERBATIM (Round 10b/
     10c/10d behaviour untouched) and extended with the semester model below.
     The Roster keeps NOTHING currency-related any more (user ruling: «Τίποτα»):
     the dot, the "owes N" chip and everything else live in this tab.

   THE TWO FAMILIES OF ITEM — one engine, two shapes
     QUOTAS  the 15 sim / s-category items. Πίνακας 6 (F/S) and Πίνακας 9 (air)
       print, per flyer per SEMESTER, HOW MANY sorties are required. That is a
       quota, not a rolling window: it carries a LIST OF RECORDED SORTIES per
       semester (Round 15 — each with its date and the Ε it covered) and never
       touches the availability tally.
     DATED   the other 76 items, exactly as Round 10c/10d left them: one date
       each, the min(round(v×25%), 45) colour rule, recorded obligations with
       per-id reasons, ≈ conversions and ⚠ flags.
     15 + 76 = 91 = the whole catalog; every id is CLAIMED by exactly one table
     — asserted at boot by curCoverage() (Round 13 split the semester block into
     ΑΕΡΟΣ first and F/S last; see the second IIFE).

   THE MAINTENANCE FLIGHT                                        (Round 15)
     A semester cell stopped being a bare counter: it is a list of ENTRIES
     ({date, eids}), the entry is filed under the semester ITS OWN DATE falls
     in, the two ΣΥΝΟΛΟ/ΣΥΝΟΛΑ columns are DERIVED from their components (a
     figure typed into them was a double count and the migration drops it), and
     two RECORDING AIDS that are not catalog items at all — «Νυχτερινή με
     μαθητές» and «Πτήση δοκιμής (FCF)» — ride in the ΑΕΡΟΣ table under
     reserved `x-` ids. See THE MAINTENANCE FLIGHT block further down for the
     entry shape, the migration and why the two synthetic columns are outside
     the 91 identity.

   THE ONE CONDITIONAL SCOPE                                       (Round 14)
     Six of the 91 are Chapter 5 — the ΙΠΤΑΜΕΝΟΣ ΕΠΙΔΕΙΞΗΣ (demo pilot). They
     are shown to, and counted for, the instructors flagged `demo_pilot` and
     nobody else (DEMO_IDS below). With no demo pilot on the roster they are
     out of scope, not missing: 85 of 91 render and curCoverage() says so on
     its own line. Same mechanism as the Test Pilots' SIM-ΔΑ, one flag on the
     person.

   THE ONE EXCEPTION, NAMED OUT LOUD
     `sim-refresh-after-abstention` is of kind "sim", so the kind split puts it
     in the F/S table (⑤), but it is NOT a quota: §49 prints a THRESHOLD IN DAYS (45
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

  /* ── DEMO-PILOT SCOPE ─────────────────────────── (Round 14 · ΑΠΟΦΑΝΣΗ) ──
     User ruling of 18/08/2026, verbatim: «θα βαλουμε πεδιο demo pilot. Αυτη τη
     στιγμη δεν ειναι κανενας. Αν εχουμε ορισει καποιον demo pilot, μονο τοτε
     και μονο για αυτον θα εχουμε τον αντιστοιχο πινακα στο currency.» — this
     resolves the flag left pending by R10c/R11 (spec § 11γ).

     Chapter 5 of the 3-01 is written for the ΙΠΤΑΜΕΝΟΣ ΕΠΙΔΕΙΞΗΣ (the display /
     demo pilot) and for nobody else, so these rows are neither SHOWN to nor
     COUNTED against an instructor who does not hold the post — the same
     mechanism `sim-da` already uses for the Test Pilots, one flag on the
     person. With no demo pilot on the roster they are simply not on screen.

     THE LIST IS READ OUT OF THE CATALOG, id by id, each with the verbatim or
     the flag that puts it inside Chapter 5; auditDemo() re-checks at load that
     every id is still there AND that no other "demo-" id has appeared:
       e-1d-demo ....................... EVENTS row «Ε-1 δ DEMO»; lapse «Loss of
           demo availability; restoration per Ch.5 §18 (15-30 days) or §20».
       demo-500ft-currency ............. §17 «Προκειμένου ο Ιπτάμενος Επίδειξης
           να διατηρήσει τη διαθεσιμότητά του … κάθε 15 ημερολογιακές ημέρες».
       demo-reavailability-15-to-30-days §18 «… ο Ιπτάμενος Επίδειξης μπορεί να
           διατεθεί …» — the simplified restoration route.
       demo-above-1000ft-availability .. §19 «Για την απώλεια διαθεσιμότητας του
           Ιπταμένου στους ελιγμούς της επίδειξης … 90 ημερών».
       demo-reavailability-after-30-days §20 «Μετά την πάροδο … για την
           επαναδιάθεση του Ιπταμένου στα 500΄ AGL» — the full programme.
       demo-pilot-tenure ............... §6 «Μέγιστος χρόνος παραμονής κάθε
           Ιπταμένου Πτήσεων Επίδειξης … τα 2 έτη».
     SIX ids, not the five the directive listed from memory: the §20 programme
     is exactly as demo-scoped as its §18 sibling (its verbatim names the same
     Ιπτάμενος), and leaving it behind would have shown every instructor in the
     squadron a restoration programme for a post he does not hold.            */
  const DEMO_IDS = new Set([
    "e-1d-demo",
    "demo-500ft-currency",
    "demo-reavailability-15-to-30-days",
    "demo-above-1000ft-availability",
    "demo-reavailability-after-30-days",
    "demo-pilot-tenure",
  ]);
  const isDemoItem = (id) => DEMO_IDS.has(id);
  const demoItems = () => items().filter((it) => DEMO_IDS.has(it.id));
  const isDemoPilot = (ip) => !!(ip && ip.demo_pilot);
  const demoPilots = () => (S().get("instructors") || [])
    .filter((i) => (i.status || "active") !== "departed" && i.demo_pilot);
  const anyDemoPilot = () => demoPilots().length > 0;

  /* the instructor RECORD behind an OID. The engine is handed an OID by every
     caller, but two of its answers — which validity column to read, and
     whether Chapter 5 applies at all — are properties of the PERSON. Accepts a
     record as well, so a caller that already holds one pays for no lookup. */
  function ipOf(x) {
    if (x && typeof x === "object") return x;
    const oid = String(x == null ? "" : x);
    if (!oid) return null;
    return (S().get("instructors") || []).find((i) => String(i.oid || "") === oid) || null;
  }

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
      auditDemo();                         // Round 14 — and for the demo-pilot scope
      auditTotals();                       // Round 15 — the two derived ΣΥΝΟΛΑ checksums
      auditSynth();                        // Round 15 — the reserved ids of the recording aids
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
     Round 14 adds a THIRD exit, before either tally: the Chapter 5 rows of a
     man who is not a demo pilot are not his to hold. They are not shown to him
     (the ✈ section renders for demo pilots only), so counting them would have
     been an invisible «owes N» he cannot see and must not fix. `demo` may be
     passed in by a caller that already holds the record; left out, it is read
     off the person behind the OID.
     counted + obl.counted + neutral + demoOut === every item in the catalog. */
  function summary(oid, experienced, demo) {
    const ref = todayISO();
    const isDemo = demo === undefined ? isDemoPilot(ipOf(oid)) : !!demo;
    const obl = { counted: 0, ok: 0, expiring: 0, expired: 0, never: 0,
      overdue: 0, rows: [], overdueRows: [] };
    const out = { ok: 0, expiring: 0, expired: 0, never: 0, neutral: 0, counted: 0,
      owes: 0, state: "ok", red: [], amber: [], obl: obl, ready: loaded(),
      demo: isDemo, demoOut: 0 };
    for (const it of items()) {
      if (!isDemo && isDemoItem(it.id)) { out.demoOut += 1; continue; }
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

  /* ══ NIGHT — DERIVED, NEVER TYPED ═══════════════════════ (Round 14) ════
     User directive of 18/08/2026, verbatim: «το night δεν θα το επιλεγουμε
     εμεις, αλλα θα ενημερωνεται αυτοματα απο το Currency. θα βαζω εγω
     ημερομηνια τελευταιας νυχτερινης πτησης και θα ξεκιναει countdown
     αναλογα.»

     ONE SOURCE, ONE HELPER. Night capability is the state of THIS instructor's
     `night-landing` row read against HIS OWN experience level — Πίνακας 1
     prints 60 days for an ΕΜΠ flyer and 45 for an ΑΠ one — and nothing else:
         ok · expiring  → night-capable          expired · never → not
     `quals.night` is dead as an input. No consumer reads it any more; the
     stored key is deliberately left where it is (harmless, and an older export
     still opens), and the roster form shows a READING of this helper instead
     of a checkbox.

     READY. The catalog is fetched at boot (see the bottom of this IIFE), but a
     caller can still ask in the milliseconds before it lands. It then gets
     ready:false and state "unknown", and NO consumer may turn that into a
     refusal: an unknown is not a "no". The one-shot ready event repaints the
     views that painted too early.                                           */
  const NIGHT_ITEM = "night-landing";
  const dmyOf = (v) => (v && window.fmtDMY ? window.fmtDMY(v) : v || "—");
  function nightOf(x) {
    const ip = ipOf(x);
    const oid = ip ? String(ip.oid || "") : String(x == null ? "" : x);
    const it = byId(NIGHT_ITEM);
    if (!it) {
      return { ready: false, ok: false, state: "unknown", left: null, last: "", expires: "",
        days: null, item: NIGHT_ITEM, oid: oid, short: "unknown",
        text: "night capability is not known yet — the currency catalog has not been read" };
    }
    const st = statusOf(oid, it, !!(ip && ip.experienced));
    const ok = st.state === "ok" || st.state === "expiring";
    return { ready: true, ok: ok, state: st.state, left: st.left, last: st.last,
      expires: st.expires, days: st.v.days, item: NIGHT_ITEM, oid: oid,
      short: ok ? "current (+" + st.left + " d)" : "not current",
      text: st.state === "never"
        ? "not night current — no night landing has ever been recorded for him"
        : st.state === "expired"
          ? "not night current — his last night landing was " + dmyOf(st.last) + " and the "
            + st.v.days + "-day window ran out " + (-st.left) + " day" + (st.left === -1 ? "" : "s") + " ago"
          : "night current — last night landing " + dmyOf(st.last) + ", expires " + dmyOf(st.expires)
            + " (" + st.left + " day" + (st.left === 1 ? "" : "s") + " of the " + st.v.days + "-day window left)" };
  }
  const nightOk = (x) => nightOf(x).ok;

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
      /* the reason reads straight after colTip's own «THRESHOLD, NOT A QUOTA —»
         prefix, so it does not repeat the words (Round 13) */
      why: "§49 prints a THRESHOLD IN DAYS (more than 45 for an experienced flyer, "
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

  /* ══════════════════════════════════════════════════════════════════════
     ΣΥΝΟΛΑ — DERIVED, NEVER TYPED                              (Round 15)
     ══════════════════════════════════════════════════════════════════════
     USER DIRECTIVE, 18/08/2026, verbatim: «Διπλομετραμε απο λαθος … Οι 6
     πτησεις ειναι αυτες που μετρας ως 0/6. Δεν ειναι 6+6.»

     Round 11 gave the two printed TOTAL rows their own counter, so a squadron
     that recorded six air sorties in their own columns AND typed 6 into the
     ΣΥΝΟΛΟ column had twelve on the card. The total is now COMPUTED from its
     components and cannot be typed into at all.

     THE COMPOSITION IS SPELLED OUT, ID BY ID, AND SO ARE THE EXCLUSIONS —
     the same argument as SEM_QUOTA above: a hand-curated list that can be read
     against the printed table beats a rule that quietly sums whatever is in
     the group. `printed` is the figure the 3-01 prints for a POSTED flyer and
     auditTotals() checks, at load, that the components really do add up to it:
       ΑΕΡΟΣ  Σ-1 1 + Σ-2 ημέρας 1 + Σ-2 νύχτας 1 + Σ-3 2 + Σ-4 1 = 6 ✓
              Σ-20 is out: it prints a dash and is where ferry flights and
              invalid sorties are BOOKED — counting it would inflate the total
              with sorties the programme never asked for.
       F/S    SIM-1 1 + SIM-2 1 + SIM-3 1 + SIM-5 1 = 4 ✓
              SIM-4 prints a dash on the T-6A. SIM-ΔΑ is out because §24 lets
              it stand IN PLACE OF SIM-1 for a Test Pilot: adding it would
              count one sortie twice, and a TP who flew SIM-ΔΑ instead of SIM-1
              reads 3/4 — which is the honest reading of a substitution the
              card cannot verify, not a shortfall the app invented. Both
              exclusions carry their reason to the tooltip.                */
  const TOTALS = {
    "semiannual-air-total-t6": {
      of: ["s-1-general-adaptation", "s-2-pdo-day", "s-2-pdo-night", "s-3-air-to-ground", "s-4-air-to-air"],
      printed: 6,
      excl: [["s-20-no-requirements", "it prints a dash — Σ-20 is where ferry flights and invalid sorties are booked, not a sortie the programme requires"]],
    },
    "semiannual-fs-total-t6": {
      of: ["sim-1", "sim-2", "sim-3", "sim-5"],
      printed: 4,
      excl: [["sim-4", "it prints a dash in both columns on the T-6A"],
        ["sim-da", "§24 lets SIM-ΔΑ be counted IN PLACE OF SIM-1, so adding it here would count one sortie twice"]],
    },
  };
  const isTotalItem = (id) => Object.prototype.hasOwnProperty.call(TOTALS, id);

  /* ══════════════════════════════════════════════════════════════════════
     THE TWO RECORDING AIDS — NOT CATALOG ITEMS                 (Round 15)
     ══════════════════════════════════════════════════════════════════════
     USER DIRECTIVE: «Θα προσθεσουμε και αλλη μια στηλη … Νυχτερινή με
     μαθητές» and «Πτηση δοκιμης (FCF) … μονο για test pilots».

     Neither is a row of the 3-01: Πίνακας 9 prints no «νυχτερινή με μαθητές»
     requirement and no FCF sortie. They exist because the squadron flies both
     and wants them WRITTEN DOWN — and because writing them down is what feeds
     the derived night flag (Round 14) and the Ε-1γ row without a second trip
     through the Ε table.

     SO THEY ARE OUTSIDE THE 91 IDENTITY, DELIBERATELY AND VISIBLY
       · their ids carry the reserved `x-` prefix and auditSynth() refuses at
         load to let one collide with a catalog id;
       · curCoverage() never sees them — it counts catalog items, and 91 stays
         91 whether these columns are on screen or not;
       · they have NO quota, so they are grey (the Σ-20 shape), they never
         enter semSummary(), the «sem x/M» chip, the rollups or “owes”;
       · what they DO is record dated entries and, through FLIGHT_DERIVE below,
         push the catalog row they imply.
     A recording aid that pretended to be a catalog item would be the one thing
     this file has refused to do since Round 10b: inventing a requirement.  */
  const SYNTH = {
    /* `after` puts them at the END of the printed rows and before the ΣΥΝΟΛΟ
       line, so Πίνακας 9 keeps its printed sequence (Σ-1 · Σ-2 · Σ-3 · Σ-4 ·
       Σ-20) and the two aids sit together where nothing of the 3-01 is claimed */
    "x-night-students": { grp: "s", after: "s-20-no-requirements",
      name: "Νυχτερινή με μαθητές — Night sortie flown with students",
      why: "the 3-01 prints no separate requirement for it — it is recorded here because the squadron flies it, "
        + "and because a night sortie is what keeps the night-landing row (and therefore the night flag) alive" },
    "x-fcf-flight": { grp: "s", after: "x-night-students", tp_only: true,
      name: "Πτήση δοκιμής (FCF) — Aircraft test flight",
      why: "a functional check flight is flown by the squadron's Test Pilots and is not a Πίνακας 9 requirement; "
        + "recording it here is what dates the Ε-1γ row of the EVENTS table" },
  };
  const isSynthItem = (id) => Object.prototype.hasOwnProperty.call(SYNTH, id);
  /* the pseudo-items the VIEW renders as columns. They carry `synth: true` so
     no code path can mistake one for a catalog item it was handed. */
  const synthItems = (grp) => Object.keys(SYNTH).filter((id) => !grp || SYNTH[id].grp === grp)
    .map((id) => Object.assign({ id: id, synth: true, kind: "x-record" }, SYNTH[id]));

  /* ── WHAT A FLIGHT IN THIS COLUMN ALSO PROVES ──────────────── (Round 15) ─
     USER DIRECTIVE: a night-flavoured entry must refresh the night landing and
     an FCF entry must refresh Ε-1γ, so that «θα ενημερωνεται αυτοματα απο το
     Currency» (Round 14) keeps holding when the flight is logged from the Σ
     side instead of typed into the Ε table.
     ONE TABLE, keyed by the COLUMN the entry was recorded in, audited at load
     against the catalog. The write goes through bump() with an AUTOMATIC src,
     so it can only ever move a date FORWARD and can never clear one — a later
     manual date is never regressed by a flight typed in afterwards.        */
  const FLIGHT_DERIVE = {
    "s-2-pdo-night": ["night-landing"],
    "x-night-students": ["night-landing"],
    "x-fcf-flight": ["e-1c-aircraft-test-fcf"],
  };
  const flightDerive = (itemId) => (FLIGHT_DERIVE[itemId] || []).filter((id) => !loaded() || !!byId(id));

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

  /* Round 14 — the demo scope is curated by hand (see DEMO_IDS), so it is
     audited in both directions: an id that left the catalog would silently
     stop being scoped, and a NEW "demo-" id that nobody listed would be shown
     to the whole squadron. Neither is allowed to happen quietly. */
  function auditDemo() {
    for (const id of DEMO_IDS) {
      if (!C.byId.has(id)) console.warn("SchedCurrency: demo-scoped id is not in the catalog — " + id);
    }
    for (const it of items()) {
      if (String(it.id).indexOf("demo-") === 0 && !DEMO_IDS.has(it.id)) {
        console.warn("SchedCurrency: a «demo-» catalog id is not on the demo-scope list — " + it.id);
      }
    }
  }

  /* Round 15 — THE CHECKSUM. The two ΣΥΝΟΛΑ columns are computed now, so the
     one thing that could go wrong silently is a composition that no longer
     adds up to the printed figure (a catalog edit, a typo in TOTALS). Both
     directions are checked: every component must be a real quota row, and the
     posted requirements must sum to exactly what the 3-01 prints. */
  function auditTotals() {
    for (const id of Object.keys(TOTALS)) {
      const T = TOTALS[id];
      if (!isSemItem(id) || !SEM_QUOTA[id].total) {
        console.warn("SchedCurrency: a derived total is not a `total` quota row — " + id);
      }
      let sum = 0;
      for (const cid of T.of) {
        const q = SEM_QUOTA[cid];
        if (!q) { console.warn("SchedCurrency: total " + id + " names an unknown component — " + cid); continue; }
        sum += q.posted || 0;
      }
      if (sum !== T.printed || sum !== (SEM_QUOTA[id] || {}).posted) {
        console.warn("SchedCurrency: the derived total " + id + " does not match the printed figure — components add up to "
          + sum + ", the 3-01 prints " + T.printed);
      }
      for (const pair of T.excl) {
        if (!SEM_QUOTA[pair[0]]) console.warn("SchedCurrency: total " + id + " excludes an unknown row — " + pair[0]);
      }
    }
  }

  /* Round 15 — the recording aids are the only ids in this file that are NOT
     in the catalog, so the collision is checked in both directions: a catalog
     item that ever took one of these ids would be silently swallowed by the
     synthetic column, and an `x-` id that is not registered here would be a
     column nothing can write to. */
  function auditSynth() {
    for (const id of Object.keys(SYNTH)) {
      if (id.indexOf("x-") !== 0) console.warn("SchedCurrency: a recording aid must use the reserved x- prefix — " + id);
      if (C.byId.has(id)) console.warn("SchedCurrency: a recording aid COLLIDES with a catalog id — " + id);
    }
    for (const key of Object.keys(FLIGHT_DERIVE)) {
      if (!isSemItem(key) && !isSynthItem(key)) {
        console.warn("SchedCurrency: FLIGHT_DERIVE names a column that is neither a quota row nor a recording aid — " + key);
      }
      for (const id of FLIGHT_DERIVE[key]) {
        if (!C.byId.has(id)) console.warn("SchedCurrency: FLIGHT_DERIVE would bump an id that is not in the catalog — " + id);
      }
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
       window   true for the one §49 threshold row (see the file header)
       total    true for the two DERIVED ΣΥΝΟΛΑ columns          (Round 15)
       synth    true for a recording aid — no printed quota at all (Round 15) */
  function quotaOf(it, ip) {
    const id = it && it.id;
    const s = SYNTH[id];
    if (s) {
      const tp = !!s.tp_only && !(ip && ip.test_pilot);
      return { n: null, axis: "", src: "", printed: "", note: "", total: false, window: false,
        synth: true, tp: tp, hide: tp,
        why: tp
          ? "a functional check flight (FCF) is flown by the squadron's Test Pilots — this instructor carries "
            + "no TP flag, so the column is not his to record in"
          : s.why };
    }
    const q = SEM_QUOTA[id];
    if (!q) return { n: null, axis: "", why: "not a semester quota row" };
    const out = { n: q.posted, attached: q.attached, axis: "posted", src: q.src || "",
      printed: q.printed || "", note: q.note || "", why: q.why || "",
      total: !!q.total, window: !!q.window, synth: false, tp: false };
    if (q.tp_only && !(ip && ip.test_pilot)) {
      out.n = null; out.tp = true;
      out.why = "the 3-01 gives this sortie to the squadron's Test Pilots only (§24) — this instructor "
        + "carries no TP flag, so nothing is required of him here";
    }
    return out;
  }

  /* ══════════════════════════════════════════════════════════════════════
     THE MAINTENANCE FLIGHT — a cell is a LIST OF SORTIES     (Round 15)
     ══════════════════════════════════════════════════════════════════════
     USER DIRECTIVE, 18/08/2026, verbatim: «Στις πτησεις, Σ ανα εξαμηνο να
     βαζουμε οταν προσθετουμε και ημερομηνια … Αυτα να μετρουνται στην βαση του
     ημερολογιακου εξαμηνου.» and «Προσθετουμε πτηση συντηρησης. Βαζουμε
     ημερομηνια και λιστα απο Ε για να επιλεξει ποια εκτελεστηκαν.»

     THE ENTRY — one recorded sortie
         { date: "YYYY-MM-DD" | null, eids: ["e-32-bfm", …] }
       WHEN it was flown, and WHICH Ε exercises it covered. The eids are not
       stored as a second source of truth: addEntry() hands each of them to
       bump(), so the Ε table is written by the seam a manual date goes
       through and the Ε row keeps ONE date, as it always had.

     THE DATE DECIDES THE SEMESTER — «στην βαση του ημερολογιακου εξαμηνου»
       addEntry() files under semKeyOf(THE ENTRY'S OWN DATE). A sortie flown on
       30/06 and typed in July lands in H1 and leaves today's cell alone. It is
       the only way a write reaches a semester other than the current one, and
       the form says out loud where the entry went.

     STORAGE, AND A MIGRATION THAT LOSES NOTHING
         semesters: { "2026-H2": { "s-3-air-to-ground": [ {date, eids}, … ] } }
       Round 11 stored the NUMBER 2 there. normEntries() reads BOTH shapes, for
       ever: a number n becomes n entries with `date: null` — the COUNT is
       preserved exactly, the dates are simply not known, and the card marks
       such an entry «undated» instead of inventing a day for it. Nothing is
       rewritten on read; the new shape is written the next time that cell is
       touched. A store may therefore hold either shape (or both) indefinitely
       and every reader still agrees on the count.

     WHAT THE READER DROPS — and says so once
       A figure typed into a ΣΥΝΟΛΟ/ΣΥΝΟΛΑ column was a DOUBLE COUNT (see
       TOTALS above). bagOf() drops those keys from every reading and
       migrationReport() names the affected OIDs once per session on the
       console. The stored number is not erased behind the user's back: it
       simply stops being read, and it disappears from the record the next time
       that instructor's semester is written.                               */
  const MAX_ENTRIES = 99;

  const normEids = (v) => {
    if (!Array.isArray(v)) return [];
    const out = [], seen = Object.create(null);
    for (const x of v) {
      const id = String(x == null ? "" : x).trim();
      if (!id || seen[id]) continue;
      seen[id] = 1;
      out.push(id);
    }
    return out;
  };
  /* one entry, from anything the store may hold. A bare ISO string is accepted
     because it is the one other honest shape a hand-edited file might carry. */
  function normEntry(e) {
    if (typeof e === "string") { const d = normISO(e); return { date: realISO(d) ? d : null, eids: [] }; }
    if (!e || typeof e !== "object") return { date: null, eids: [] };
    const d = normISO(e.date);
    return { date: realISO(d) ? d : null, eids: normEids(e.eids) };
  }
  /* THE MIGRATION, in four lines: an array is a list of entries, a number is
     that many undated entries, anything else is nothing recorded. */
  function normEntries(v) {
    if (Array.isArray(v)) return v.slice(0, MAX_ENTRIES).map(normEntry);
    const n = typeof v === "number" ? v : NaN;
    if (isFinite(n) && n >= 1) {
      const out = [];
      for (let k = 0; k < Math.min(MAX_ENTRIES, Math.floor(n)); k += 1) out.push({ date: null, eids: [] });
      return out;
    }
    return [];
  }

  /* the one-time console line the directive asks for. It scans the WHOLE
     collection, not just the record being read, so the message names every
     affected instructor at once instead of dripping one warning per repaint. */
  const MIG = { told: false };
  function migrationReport() {
    if (MIG.told) return;
    MIG.told = true;
    const hits = [];
    for (const rec of (S().get(COLL) || [])) {
      const sems = rec && rec.semesters;
      if (!sems || typeof sems !== "object") continue;
      for (const key of Object.keys(sems)) {
        const bag = sems[key];
        if (!bag || typeof bag !== "object") continue;
        for (const id of Object.keys(bag)) {
          if (isTotalItem(id)) hits.push(String(rec.oid) + " · " + key + " · " + id + " = " + JSON.stringify(bag[id]));
        }
      }
    }
    if (hits.length) {
      console.info("SchedCurrency — migration (Round 15): " + hits.length + " figure(s) typed straight into a "
        + "ΣΥΝΟΛΟ/ΣΥΝΟΛΑ column are DROPPED from every reading. Those columns are derived from their component "
        + "rows now, so a figure typed into them was counted twice. Nothing else is touched and no component "
        + "count is lost:\n  " + hits.join("\n  "));
    }
  }

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
  /* PURE — a record in, a normalised bag out: { itemId: [entry, …] }. It takes
     the RECORD and not an OID so that a raw seed row, an import preview or a
     test fixture can be read without touching the store. Every read of a
     semester in this file goes through here, which is the only reason the two
     storage shapes can coexist for ever without a reader that knows one of
     them. Derived TOTAL keys never come out: see migrationReport(). */
  function bagOf(rec, key) {
    const raw = (rec && rec.semesters && rec.semesters[key]) || null;
    const out = {};
    if (!raw || typeof raw !== "object") return out;
    for (const id of Object.keys(raw)) {
      if (isTotalItem(id)) continue;                   // a double count — dropped, and reported once
      const list = normEntries(raw[id]);
      if (list.length) out[id] = list;
    }
    return out;
  }
  function semBag(oid, semKey) {
    const k = semKeyOrNull(semKey, "semBag");
    if (k === null) return {};
    migrationReport();
    return bagOf(record(oid), k);
  }
  /* the entries of ONE cell, in stored order (the card sorts a copy for
     display and keeps the stored index for its delete button) */
  function entriesOf(oid, itemId, semKey) { return semBag(oid, semKey)[itemId] || []; }
  /* every semester this instructor has anything recorded in, newest first —
     the flight form uses it to say «2 more in 2026-H1» instead of pretending
     the other halves do not exist */
  function semKeysOf(oid) {
    const r = record(oid);
    const s = (r && r.semesters) || {};
    return Object.keys(s).filter((k) => SEM_RE.test(k) && Object.keys(bagOf(r, k)).length).sort().reverse();
  }
  function countsOf(oid, semKey) {
    const bag = semBag(oid, semKey);
    const out = {};
    for (const id of Object.keys(bag)) out[id] = bag[id].length;
    return out;
  }
  /* THE DERIVED TOTAL — the sum of its components, never a stored figure */
  function totalOf(oid, itemId, semKey) {
    const T = TOTALS[itemId];
    if (!T) return { x: 0, parts: [], printed: null, excl: [] };
    const bag = semBag(oid, semKey);
    const parts = T.of.map((cid) => ({ id: cid, n: (bag[cid] || []).length }));
    return { x: parts.reduce((a, p) => a + p.n, 0), parts: parts, printed: T.printed, excl: T.excl };
  }
  function countOf(oid, itemId, semKey) {
    if (isTotalItem(itemId)) return totalOf(oid, itemId, semKey).x;
    return entriesOf(oid, itemId, semKey).length;
  }

  /* which columns may be RECORDED into. A quota row with a printed number, or
     a recording aid — never a derived total (nothing is typed there), never
     the §49 threshold (it is a date, and it goes through bump()) and never a
     dash row (offering a counter there would invent a requirement — Round 11
     verify item 19). The PERSON-level gate (SIM-ΔΑ and FCF are Test-Pilot
     columns) is quotaOf()'s and the card's; this one is about the id. */
  function isRecordable(itemId) {
    if (isSynthItem(itemId)) return true;
    const q = SEM_QUOTA[itemId];
    return !!q && !q.window && !q.total && q.posted != null;
  }

  /* the one place a semester bag is written back. It writes the NEW SHAPE
     always (arrays of entries), which is how a migrated record leaves the old
     one behind — including any ΣΥΝΟΛΑ figure, because bagOf() never handed it
     over in the first place. An emptied cell drops its key, an emptied
     semester drops its key: reading is identical (missing = nothing recorded)
     and the record stays small. */
  function writeBag(oid, key, bag) {
    const prev = record(oid);
    const sems = Object.assign({}, (prev && prev.semesters) || {});
    const clean = {};
    for (const id of Object.keys(bag)) if (bag[id] && bag[id].length) clean[id] = bag[id];
    if (Object.keys(clean).length) sems[key] = clean; else delete sems[key];
    const rec = { oid: oid, items: Object.assign({}, (prev && prev.items) || {}),
      semesters: sems, updated_at: new Date().toISOString() };
    return S().upsert(COLL, rec);
  }

  /* ══ THE THIRD SEAM — ONE RECORDED FLIGHT ═══════════════ (Round 15) ════
     addEntry(oid, item_id, date, eids, src) appends ONE sortie to ONE cell.
       · the DATE is mandatory and must survive the ISO round trip. A flight
         with no date is what the migration produces out of an old counter, not
         something a user may type: a date is what files the entry.
       · THE SEMESTER IS COMPUTED FROM THAT DATE — never from today's clock,
         never from a semKey argument (there is none): «Αυτα να μετρουνται στην
         βαση του ημερολογιακου εξαμηνου.»
       · eids are checked against the catalog. An unknown id is dropped with a
         warning instead of being stored: it would be a date written for a row
         that does not exist.
       · a derived total, the §49 threshold row and a dash column are refused —
         see isRecordable().
     It does NOT write the Ε dates itself. The caller walks
     result.eids ∪ flightDerive(item_id) through bump() with an AUTOMATIC src,
     so every one of those writes is forward-only by the seam's own rule and a
     later manual date can never be regressed by a flight typed in afterwards.
     Returns { rec, key, entry, x } or null when the call was refused.     */
  function addEntry(oid, itemId, date, eids, src) {
    if (!oid || !itemId) return null;
    if (!isRecordable(itemId)) {
      console.warn("SchedCurrency.addEntry: " + itemId + " does not take recorded flights"
        + (isTotalItem(itemId) ? " — a ΣΥΝΟΛΑ column is derived from its components" : ""));
      return null;
    }
    const iso = normISO(date);
    if (!realISO(iso)) {
      console.warn("SchedCurrency.addEntry: refused an unreadable date for " + itemId + " — " + JSON.stringify(date));
      return null;
    }
    const key = semKeyOf(iso);                         // THE DATE decides the semester
    const bag = semBag(oid, key);
    const list = (bag[itemId] || []).slice();
    if (list.length >= MAX_ENTRIES) {
      console.warn("SchedCurrency.addEntry: " + itemId + " already holds " + MAX_ENTRIES + " entries in " + key);
      return null;
    }
    const ok = [], bad = [];
    for (const id of normEids(eids)) ((loaded() && !byId(id)) ? bad : ok).push(id);
    if (bad.length) console.warn("SchedCurrency.addEntry: dropped Ε id(s) that are not in the catalog — " + bad.join(", "));
    const entry = { date: iso, eids: ok };
    list.push(entry);
    bag[itemId] = list;
    const rec = writeBag(oid, key, bag);
    if (!rec) return null;                             // the edit lock refused the write
    return { rec: rec, key: key, entry: entry, x: list.length, src: String(src || "flight") };
  }

  /* delEntry(oid, item_id, semKey, index) — the card's per-entry ✕. The index
     is the STORED one (the form carries it through its own sort), and an index
     that is not there is a bug in the caller, never «delete something else». */
  function delEntry(oid, itemId, semKey, index) {
    if (!oid || !itemId) return null;
    const key = semKeyOrNull(semKey, "delEntry");
    if (key === null) return null;
    const bag = semBag(oid, key);
    const list = (bag[itemId] || []).slice();
    const i = Math.floor(Number(index));
    if (!isFinite(i) || i < 0 || i >= list.length) {
      console.warn("SchedCurrency.delEntry: there is no entry #" + JSON.stringify(index) + " in "
        + itemId + " / " + key);
      return null;
    }
    list.splice(i, 1);
    if (list.length) bag[itemId] = list; else delete bag[itemId];
    return writeBag(oid, key, bag);
  }

  /* ══ THE SECOND SEAM — A COUNT WITH NO DATES ══════════════════════════
     bumpCount(oid, item_id, count, semKey, src) predates Round 15 and stays,
     because a count is still the honest shape of an import or a future log
     sync that knows HOW MANY sorties were flown but not WHEN. It now works on
     the entry list: raising a count appends UNDATED entries, lowering it drops
     from the END of the list, and the card marks them «undated» exactly like a
     migrated figure. The guards are unchanged:
       · count must be a whole number 0…99. Anything else (NaN, "3 sorties",
         -1, 7.5, undefined, an object) is a BUG IN THE CALLER, never an
         instruction to erase: it is refused loudly and NOTHING is written.
       · "manual" always wins and may count DOWN; any other src is an AUTOMATIC
         source, so it may only raise a count and never zero one.
       · a derived ΣΥΝΟΛΑ column is refused outright — Round 15.
     The card itself no longer calls it: a sortie recorded on screen carries a
     date and goes through addEntry(). Returns the stored record, or null.  */
  const MAX_COUNT = 99;
  function bumpCount(oid, itemId, count, semKey, src) {
    if (!oid || !itemId) return null;
    if (loaded() && !isSynthItem(itemId) && !byId(itemId)) { console.warn("SchedCurrency.bumpCount: unknown item " + itemId); return null; }
    if (isTotalItem(itemId)) {
      console.warn("SchedCurrency.bumpCount: " + itemId + " is a ΣΥΝΟΛΑ column — it is derived from its components "
        + "and nothing may be written into it (Round 15)");
      return null;
    }
    if (!isSemItem(itemId) && !isSynthItem(itemId)) {
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
    const bag = semBag(oid, key);
    const list = (bag[itemId] || []).slice();
    if (!manual && n <= list.length) return prev;      // an automatic source only goes up
    if (n === list.length) return prev;
    if (n < list.length) list.length = n;              // manual only — drops from the END
    else while (list.length < n) list.push({ date: null, eids: [] });
    if (list.length) bag[itemId] = list; else delete bag[itemId];
    return writeBag(oid, key, bag);
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
     so these rows never touch the dot, the pill or "owes N".
     ROUND 15 — THE TWO DERIVED TOTALS ARE NOT ROWS OF THIS TALLY. They are the
     sum of rows already counted here, so leaving them in made «sem 12/13» say
     the same six sorties twice — «Δεν ειναι 6+6». They keep their cell and
     their colour on screen; they are simply not a thirteenth requirement.  */
  function semSummary(oid, ip, semKey) {
    const sem = semOf(semKey);
    const out = { sem: sem, rows: [], total: 0, done: 0, short: 0, behind: [],
      state: "ok", ready: loaded() };
    for (const it of semItems()) {
      if (SEM_QUOTA[it.id].window) continue;           // the §49 threshold is not a quota
      if (SEM_QUOTA[it.id].total) continue;            // Round 15 — derived, never a second requirement
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

  /* ── THE CATALOG IS NO LONGER OPTIONAL ─────────────────── (Round 14) ────
     Until Round 13 it was fetched by the Currency tab, on demand: a user who
     never opened that tab never needed it. Night capability is DERIVED from it
     now, and the board asks for night capability whether or not that tab was
     ever opened — so the fetch starts at boot, once, through the same load()
     promise the tab awaits (nothing is fetched twice).
     When it lands, ONE window event tells the views that already painted to
     paint again; a view that boots later simply reads a loaded catalog. */
  const READY_EVENT = "sched-currency-ready";
  load().then(() => {
    try { window.dispatchEvent(new CustomEvent(READY_EVENT, { detail: { ok: loaded() } })); }
    catch (e) { /* no CustomEvent: the views repaint on the next store write */ }
  });

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
    /* Round 14 — the derived night flag, the demo-pilot scope, the boot event */
    NIGHT_ITEM, nightOf, nightOk, READY_EVENT, ipOf,
    DEMO_IDS, isDemoItem, demoItems, isDemoPilot, demoPilots, anyDemoPilot,
    /* Round 15 — the maintenance flight: entries, derived totals, the two aids */
    MAX_ENTRIES, TOTALS, isTotalItem, totalOf,
    SYNTH, isSynthItem, synthItems, FLIGHT_DERIVE, flightDerive,
    normEntries, bagOf, semBag, entriesOf, semKeysOf, isRecordable, addEntry, delEntry,
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
               Round 13: the name is NEVER clipped (see .cur-whobox in the CSS).
     COLUMNS   the catalog events, split across FIVE tables so a column stays
               readable and no table is wider than ~30 columns, plus ONE
               conditional section (Round 14):
                 ① ΑΝΑ ΕΞΑΜΗΝΟ — ΑΕΡΟΣ   7 (+2 recording aids, Round 15)
                 ② Landings + Recency    16
                 ③ Ε-items               27
                 ④ Other                 27
                 ⑤ ΑΝΑ ΕΞΑΜΗΝΟ — F/S      8 (the SIM quotas + the §49 threshold)
                 ✈ Demo pilot (Κεφ. 5)    6 — RENDERED ONLY when an active
                                            instructor carries `demo_pilot`,
                                            and then with the demo pilots as
                                            its only rows
               Every catalog id sits in EXACTLY ONE table: 7+16+27+27+8+6 = 91,
               asserted at boot by curCoverage() — a silent gap would mean an
               instructor holds something the app never shows him. The two
               Round-15 recording aids («Νυχτερινή με μαθητές», «Πτήση δοκιμής
               (FCF)») are NOT catalog items and are deliberately outside that
               identity: itemsOf() stays catalog-only and only colsOf() adds
               them, so 91 is still 91 with the columns on screen.
               Round 13 directive, in the user's words: «Ξεχωριστό section για
               F/S και πτήσεις. Τα F/S στο τέλος.» — so what he flies opens the
               tab and the simulator closes it, each with its own legend, its
               own rollup and its own collapse state.
     CELLS     one compact reading — «x/N» for a quota, signed days-left for a
               dated item. A DATED cell becomes the real native date input on
               click; a QUOTA cell opens the FLIGHT FORM of Round 15 (date + the
               Ε flown), because a sortie is an event with a day, not a number
               to nudge. The write goes through the same seams, bump() and
               addEntry()/delEntry(), with the same guards; the store event
               repaints and the cell, the row chips and the table rollup are
               recomputed together.
     TABLES    collapse from their header bar (chevron · item count · rollup ·
               ⓘ), remembered per table in localStorage. Default: all open.
               ROUND 15 — «Ολα τα αντιστοιχα τα βαζεις pop up με ενα info
               button.»: the long legend paragraph left the header area and
               lives behind that ⓘ, word for word. One popover at a time.

   WHAT THIS MODULE DOES NOT DO
     It owns the HTML and nothing else. Every number is computed by
     SchedCurrency out of the catalog, ONE date per dated item and ONE LIST OF
     RECORDED SORTIES per quota item per semester. No figure is decided here —
     including the two ΣΥΝΟΛΑ columns, which the engine derives.

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

  /* ── THE FIVE TABLES, AND THE SIXTH THAT IS USUALLY NOT THERE ────────────
     Round 13 directive: «Ξεχωριστό section για F/S και πτήσεις. Τα F/S στο
     τέλος.» The single semester block of Round 12 held both printed tables at
     once, so the simulator and the aircraft shared one screen, one legend and
     one rollup. They are now TWO sections and they sit at the two ends of the
     tab: what he FLIES opens the page, what he flies IN THE BOX closes it.

       ① ΑΝΑ ΕΞΑΜΗΝΟ — ΑΕΡΟΣ   7   Πίνακας 9, the Σ categories + its ΣΥΝΟΛΟ
       ② Landings + Recency    16
       ③ Ε-items               27
       ④ Other                 27
       ⑤ ΑΝΑ ΕΞΑΜΗΝΟ — F/S     8   Πίνακας 6, the SIM rows + its ΣΥΝΟΛΑ, and
                                   the ONE §49 threshold row (see the file
                                   header): it is not a quota, it keeps its
                                   date and it keeps counting for availability,
                                   and it travels with the F/S table because
                                   §49 is answered with SIM-1 sorties.
       ✈ Demo pilot            6   ROUND 14 · Chapter 5 — rendered only when
                                   somebody carries the flag, rows = only the
                                   demo pilots (see SchedCurrency.DEMO_IDS).
     7+16+27+27+8+6 = 91, every id exactly once — asserted by curCoverage().
     Round 13's ②③④ read 19/28/27 because they still held the six Chapter 5
     ids; those moved to ✈ and nothing else changed.

     `semgrp` picks ONE group of the engine's SEM_GRP (the engine is untouched:
     it still knows the printed tables in printed order, and each section here
     reads its own). ②③④ split the dated ids by catalog kind — named, never
     sniffed, so a new catalog kind shows up as a coverage warning instead of
     quietly disappearing from the screen.

     COLLAPSE KEYS — "sem" is deliberately kept for ① so a user who had the
     semester block closed before Round 13 finds the air table closed; "semfs"
     is new and therefore opens by default. A stale key nobody reads any more
     is harmless (colMap only ever answers questions it is asked).            */
  const TABLES = [
    { key: "sem", n: "①", sem: true, semgrp: "s", label: "ΑΝΑ ΕΞΑΜΗΝΟ — ΑΕΡΟΣ (Σ categories), Πίνακας 9",
      note: "sorties per semester ON THE AIRCRAFT. A quota is not a window: nothing counts down and a "
        + "shortfall costs no availability (§40 absorbs a justified one · §46 records the rest)" },
    { key: "ldg", n: "②", kinds: ["landing", "recency"], label: "Landings + Recency",
      note: "the rolling windows that decide whether he may fly tonight" },
    { key: "e", n: "③", kinds: ["e-item"], label: "Ε-items (EVENTS)",
      note: "the EVENTS table of the 3-01 — one date each" },
    { key: "oth", n: "④", kinds: ["other"], label: "Other",
      note: "readiness conditions, seminars, definitions and the ΠΡ clocks" },
    { key: "semfs", n: "⑤", sem: true, semgrp: "sim", label: "ΑΝΑ ΕΞΑΜΗΝΟ — F/S (SIM), Πίνακας 6",
      note: "sorties per semester IN THE SIMULATOR (§22 each at least one hour · §25 the figures are a "
        + "MINIMUM), plus the §49 refresh threshold — the one column here that is not a quota and does "
        + "count for availability" },
    /* ⑥ — ROUND 14, and the only conditional section of the tab. Its rows are
       the demo pilots and nothing else, its columns are the six Chapter 5 ids
       (SchedCurrency.DEMO_IDS), and it is not rendered at all while no active
       instructor carries the flag: «Αυτη τη στιγμη δεν ειναι κανενας.» */
    { key: "demo", n: "✈", demo: true, label: "Demo pilot — Ιπτάμενος Επίδειξης (Κεφ. 5)",
      note: "Chapter 5 of the 3-01 is written for the display pilot and for nobody else, so these rows "
        + "are shown to — and counted for — the instructors flagged DEMO PILOT in the roster, and to no "
        + "one else" },
  ];

  /* ui.edit  the ONE cell currently showing a native input, as {code, id, kind}.
              Exactly one at a time, so the input carries id="cur-editing" and
              the repaint puts the caret straight back on it.
     ui.dirty a store write that landed while another tab was open — the matrix
              is 1 365 cells, so it is repainted on activation, not blindly.
     ui.busy  a MULTI-WRITE in progress (Round 15: one recorded flight is one
              entry plus up to 28 Ε dates, each of them a store event). The
              repaint is held until the last of them lands, so the matrix is
              drawn once and not thirty times.                              */
  const ui = { booted: false, edit: null, dirty: false, busy: false };

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
    /* the demo flag is passed IN, not looked up: the record is already here */
    if (!memo.s.has(i.code)) memo.s.set(i.code, CUR().summary(i.oid, !!i.experienced, !!i.demo_pilot));
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
    curCoverage();                       // the 7 + 16 + 27 + 27 + 8 + 6 = 91 identity
  };

  const visible = () => { const v = $id("view-currency"); return !!v && !v.classList.contains("hidden"); };

  function render() {
    if (ui.busy) { ui.dirty = true; return; }        // one flight = one repaint (see popSave)
    ui.dirty = false;
    memo.s.clear(); memo.sem.clear();
    const all = listed();
    /* an editor whose person or item vanished (a roster edit, a catalog reload)
       must not survive as a ghost */
    if (ui.edit && !all.some((i) => i.code === ui.edit.code)) ui.edit = null;
    if (pop.kind === "flight" && !all.some((i) => i.code === pop.code)) popClose();
    $id("cur-main").innerHTML = headHtml(all) + shownTables().map((t) => tableHtml(t, all)).join("");
    const inp = $id("cur-editing");
    /* preventScroll — Round 15b. A plain focus() SCROLLS the document to the
       matrix editor, and the popover below is then placed against an anchor
       that has just been carried off-screen (R15 verify, notes fix 2): the
       flight form vanished after every save. The caret still lands here. */
    if (inp) inp.focus({ preventScroll: true });
    /* the popover survives the repaint (it lives outside #cur-main), but its
       anchor was just re-created: re-render its body — the entry list is a
       reading of the store that just changed — and hang it off the new cell.
       A popover whose anchor is gone closes itself. */
    if (pop.kind) {
      const keep = document.activeElement;
      const id = keep && keep.id;
      if (!popAnchor()) popClose();
      else {
        popRender();
        const back = id ? $id(id) : null;             // the caret goes back where it was
        if (back && back.focus) back.focus();
        const b = popAnchor();
        if (b && pop.kind === "legend") b.setAttribute("aria-expanded", "true");
      }
    }
  }

  /* ══ THE PAGE HEAD ══════════════════════════════════════════════════════ */
  function headHtml(all) {
    if (!CUR().loaded()) {
      return `<div class="sch-ph"><strong>The expiring-items catalog could not be read.</strong>
        <p>Expected <code>${esc(CUR().CAT_URL)}</code>.${CUR().error() ? " " + esc(CUR().error()) : ""}</p></div>`;
    }
    const w = CUR().curSem();
    const dep = departedN();
    /* the catalog line is HONEST about the demo scope in both states: with no
       demo pilot the six Chapter 5 ids are not missing, they are out of scope,
       and the tooltip names them (Round 14 · curCoverage() asserts the same) */
    const shown = shownTables().length;
    const nDemo = CUR().DEMO_IDS.size;
    const demoNote = demoOn()
      ? ` <span class="sch-badge" title="${esc("the ✈ section is on screen: " + CUR().demoPilots().length
        + " active instructor(s) carry the DEMO PILOT flag, so the " + nDemo + " Chapter 5 items are rendered for them "
        + "and counted in their availability")}">✈ demo pilot</span>`
      : "";
    return `<div class="cur-head">
      <h2>Instructor currency <span class="count">${all.length} instructor${all.length === 1 ? "" : "s"}</span></h2>
      <span class="sch-nd" title="project ruling: the semester is a calendar half — H1 = 01/01-30/06, H2 = 01/07-31/12. The stored key is «${esc(w.key)}», so 01/01 rolls over instead of overwriting.">${esc(w.label)} — ends ${esc(dmy(w.end))} (${w.left} days left)</span>
      <span class="sch-nd" title="${esc("the referee-verified catalog of everything the 3-01/2025 ΔΑΕ makes a T-6A instructor hold. "
        + (demoOn()
          ? "All " + CUR().items().length + " are on screen: somebody carries the DEMO PILOT flag, so the ✈ section renders."
          : "Of them, " + nDemo + " belong to Chapter 5 (the Ιπτάμενος Επίδειξης) and NOBODY on the roster is flagged DEMO PILOT, "
            + "so they are out of scope — not missing: " + [...CUR().DEMO_IDS].join(" · ")))}">${
        demoOn() ? CUR().items().length + " catalog items" : (CUR().items().length - nDemo) + " of "
          + CUR().items().length + " catalog items"} in ${shown} table${shown === 1 ? "" : "s"}${
        demoOn() ? "" : " · " + nDemo + " demo-pilot items out of scope"}</span>${demoNote}
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
    /* ⑥ owns the Chapter 5 ids and every other table is stripped of them
       (Round 14): an id lives in exactly ONE section, as it always has. */
    if (t.demo) return CUR().demoItems();
    const notDemo = (list) => list.filter((it) => !CUR().isDemoItem(it.id));
    /* ONE printed table per section (Round 13). semGroups() keeps the printed
       ROW order inside the group — the ΣΥΝΟΛΑ line closes its own table, as on
       paper — and the §49 threshold row rides along in the sim group. */
    if (t.sem) return notDemo([].concat.apply([], CUR().semGroups()
      .filter((g) => g.key === t.semgrp).map((g) => g.items)));
    return notDemo([].concat.apply([], CUR().groups()
      .filter((g) => g.kinds.some((k) => t.kinds.indexOf(k) >= 0))
      .map((g) => g.items)));
  }

  /* WHICH TABLES ARE ON SCREEN, and WHOSE rows each one holds (Round 14).
     ⑥ is the only conditional section, and it is conditional twice over: the
     section itself appears only when somebody carries the flag, and inside it
     only those people are rows. Everything else is unchanged. */
  const demoOn = () => CUR().anyDemoPilot();
  const shownTables = () => TABLES.filter((t) => !t.demo || demoOn());
  const rowsOf = (t, all) => (t.demo ? all.filter((i) => i.demo_pilot) : all);

  /* ── THE COLUMNS OF A TABLE = ITS CATALOG ITEMS + THE RECORDING AIDS ──────
     ROUND 15. itemsOf() above is, and stays, CATALOG-ONLY: it is what
     curCoverage() counts, and the 7+16+27+27+8+6 = 91 identity must not move
     because the squadron wanted somewhere to write a night sortie down. The
     two aids are added HERE, in the view, at the place the user reads them:
     right after the row they belong beside and BEFORE the ΣΥΝΟΛΟ line, which
     closes its table exactly as it closes the printed one.
     `after` is an id, not an index — a catalog reorder moves the aid with its
     neighbour instead of dropping it in the wrong place — and an aid whose
     neighbour is not in this table simply lands before the total.          */
  function colsOf(t) {
    const its = itemsOf(t);
    if (!t.sem || !t.semgrp) return its;
    const aids = CUR().synthItems(t.semgrp);
    if (!aids.length) return its;
    const out = [];
    const left = aids.slice();
    const take = (id) => {
      for (let k = 0; k < left.length; k += 1) {
        if (left[k].after !== id) continue;
        const a = left.splice(k, 1)[0];
        out.push(a);
        take(a.id);                      // an aid may sit after another aid
        k -= 1;                          // the array shrank under this index
      }
    };
    for (const it of its) {
      /* the printed ΣΥΝΟΛΑ row closes the table: anything still unplaced goes
         in front of it rather than after the line that sums the table */
      if (CUR().isTotalItem(it.id)) { out.push.apply(out, left.splice(0)); out.push(it); continue; }
      out.push(it);
      take(it.id);
    }
    out.push.apply(out, left);
    return out;
  }

  /* ROUND 15 — «Ολα τα αντιστοιχα τα βαζεις pop up με ενα info button.» The
     header bar keeps the four things a glance needs — name, item count, the
     rollup dot and its one line — and the legend paragraph (five lines of it
     under the semester tables) moved behind the ⓘ, word for word. The button
     is marked data-nav: it opens a READING, so a view-only device may press it
     exactly like the collapse chevron next to it. */
  function tableHtml(t, all) {
    if (!CUR().loaded()) return "";
    const its = itemsOf(t);
    const cols = colsOf(t);
    const aids = cols.length - its.length;
    const rows = rowsOf(t, all);
    const open = tblOpen(t.key);
    const r = rollup(t, its, rows);
    return `<section class="panel sch-panel cur-sec cur-mx${t.demo ? " cur-demo" : ""}" data-tbl="${esc(t.key)}">
      <div class="sch-h cur-mxh">
        ${secBtn(t.key, `${t.n} ${esc(t.label)} <span class="count">${its.length} item${its.length === 1 ? "" : "s"}</span>`
          + (aids ? ` <span class="count">+${aids} recording</span>` : "")
          + (t.demo ? ` <span class="count">${rows.length} demo pilot${rows.length === 1 ? "" : "s"}</span>` : ""))}
        <span class="sch-cdot st-${esc(r.state)}" title="${esc(r.tip)}"></span>
        <span class="sch-nd cur-roll" title="${esc(r.tip)}">${esc(r.txt)}</span>
        <button type="button" class="cur-i" data-nav data-curinfo="${esc(t.key)}" aria-expanded="false"
          title="what the colours of this table mean, and what it counts">ⓘ</button>
      </div>
      ${open ? gridHtml(t, cols, rows) : ""}
    </section>`;
  }

  /* ── the one-line rollup of the header bar ────────────────────────────────
     It answers "is anything wrong in THIS table?" over the whole squadron, and
     it counts what the table actually holds — never the whole catalog.

     Round 13: one code path for both families, because table ⑤ now holds BOTH
     — the seven F/S quota columns and the one §49 threshold column, which is a
     dated row that really does gate availability. Splitting the ids here (a
     quota is a SEM_QUOTA entry that is not the `window` one) means the F/S
     header bar can say «every quota met · threshold column: 2 owed» instead of
     hiding half of its own table behind the other half.                      */
  const ppl = (n) => n + " instructor" + (n === 1 ? "" : "s");
  function rollup(t, its, all) {
    const quotaIds = new Set(), dateIds = new Set();
    for (const it of its) {
      const q = CUR().SEM_QUOTA[it.id];
      if (q && !q.window) quotaIds.add(it.id); else dateIds.add(it.id);
    }
    const parts = [], tips = [];
    let worst = "ok";
    const worsen = (s) => { if (s === "expired" || (s === "expiring" && worst === "ok")) worst = s; };

    if (quotaIds.size) {
      let owed = 0, behind = 0;
      for (const i of all) {
        if (!i.oid) continue;
        let mine = 0;
        for (const r of semOf(i).rows) if (quotaIds.has(r.item.id) && r.n != null && !r.done) mine += r.short;
        if (mine) { owed += mine; behind += 1; }
      }
      worsen(!behind ? "ok" : (CUR().curSem().left > CUR().SEM_RED_DAYS ? "expiring" : "expired"));
      parts.push(behind ? owed + " sortie" + (owed === 1 ? "" : "s") + " owed by " + ppl(behind) : "every quota met");
      tips.push("the semester quotas of THIS table across the whole squadron. A shortfall is NOT an availability "
        + "loss (§40 absorbs a justified one, §46 records the rest) — it never enters the dot or “owes”.");
    }

    if (dateIds.size) {
      let red = 0, amber = 0, oblOver = 0, people = 0;
      for (const i of all) {
        if (!i.oid) continue;
        const s = sumOf(i);
        const mine = s.red.filter((x) => dateIds.has(x.item.id)).length;
        red += mine;
        amber += s.amber.filter((x) => dateIds.has(x.item.id)).length;
        oblOver += s.obl.overdueRows.filter((x) => dateIds.has(x.item.id)).length;
        if (mine) people += 1;
      }
      worsen(red ? "expired" : (amber ? "expiring" : "ok"));
      /* in a mixed table the second half must say WHICH columns it is about,
         or «2 owed» reads as a quota figure it is not */
      const pre = !quotaIds.size ? ""
        : (dateIds.size === 1 ? "threshold column: " : "dated columns: ");
      parts.push(pre + (red ? red + " owed by " + ppl(people) : "nothing owed")
        + (amber ? " · " + amber + " expiring" : "")
        + (oblOver ? " · " + oblOver + " obligation" + (oblOver === 1 ? "" : "s") + " overdue" : ""));
      tips.push("counted rows of THIS table only, across the whole squadron: expired or never recorded = owed. "
        + "Recorded obligations are counted on their own — they never enter the dot, the chips or “owes”.");
    }

    return { state: worst, txt: parts.join(" · ") || "nothing in this table", tip: tips.join("\n\n") };
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
    let printed = 0, dash = 0, win = 0, tp = 0, tot = 0, aid = 0;
    for (const it of its) {
      if (it.synth) { aid += 1; continue; }             // Round 15 — a recording aid, not a printed row
      const q = Q[it.id] || {};
      if (q.window) { win += 1; continue; }
      if (q.posted == null) dash += 1; else printed += 1;
      if (q.tp_only) tp += 1;
      if (q.total) tot += 1;
    }
    return { printed, dash, win, tp, tot, aid };
  }

  function legendHtml(t, its) {
    if (t.sem) {
      /* Round 13 — the two semester tables no longer hold the same columns, so
         every clause is built from THIS table's own figures and a clause with
         nothing to say is dropped: the air table has no Test-Pilot row and no
         threshold column, and printing «0 Test-Pilot only» under it would be
         noise at best and a hint at a column that is not there at worst. */
      const f = semStats(its);
      const inner = [f.tot + " of them the printed <b>ΣΥΝΟΛΑ</b> total" + (f.tot === 1 ? "" : "s")]
        .concat(f.tp ? [f.tp + " Test-Pilot only"] : []).join(", ");
      const clauses = [
        f.printed + " column" + (f.printed === 1 ? "" : "s") + " with a printed requirement"
          + (f.tot || f.tp ? " (" + inner + ")" : ""),
      ];
      if (f.dash) {
        clauses.push(f.dash + (f.dash === 1 ? " that prints a dash and requires" : " that print a dash and require")
          + " nothing");
      }
      if (f.win) {
        clauses.push(f.win + " <b>threshold</b> column" + (f.win === 1 ? " that is" : "s that are")
          + " not a quota at all and DO" + (f.win === 1 ? "ES" : "") + " count for availability (§49) — "
          + "coloured by the DATED rule (a quarter of the window, at most " + CUR().AMBER_MAX_DAYS + " days), not by the quota rule above");
      }
      if (f.aid) {
        clauses.push(f.aid + " <b>recording column" + (f.aid === 1 ? "" : "s")
          + "</b> that the 3-01 does not print at all (Round 15) — sorties the squadron wants written down. "
          + "They take dated entries, they are grey because nothing is required, and they are outside the "
          + "91-item catalog: they never enter a quota, a rollup or “owes”");
      }
      return `<p class="sch-hint sch-curlegend">
        <span class="sch-cdot st-ok"></span> met (x ≥ N) ·
        <span class="sch-cdot st-expiring"></span> short with more than ${CUR().SEM_RED_DAYS} days of the semester left ·
        <span class="sch-cdot st-expired"></span> short with ${CUR().SEM_RED_DAYS} days or less left ·
        <span class="sch-cdot st-neutral"></span> nothing required.
        <b>In this table:</b> ${clauses.join(" · ")}.
        <b>N</b> is the <b>ΤΟΠΟΘΕΤΗΜΕΝΟΣ (POSTED)</b> column of ${t.semgrp === "sim" ? "Πίνακας 6" : "Πίνακας 9"} — the printed split is posted vs attached,
        <b>not</b> experienced vs inexperienced, so a row's ΕΜΠ/ΑΠ tag does not move it (an <i>attached</i> flag is a future axis).
        <br><b>x</b> is the number of <b>RECORDED SORTIES</b> of this semester (Round 15): click a cell to add one with its
        date and the <b>Ε</b> it covered, or to delete one. A sortie is filed under the semester <b>its own date</b> falls in,
        so a flight of 30/06 typed in July lands in H1 and leaves this cell alone.
        The <b>ΣΥΝΟΛΑ</b> column${f.tot === 1 ? " is" : "s are"} <b>DERIVED</b> from the component columns and cannot be typed into —
        «Οι 6 πτησεις ειναι αυτες που μετρας ως 0/6. Δεν ειναι 6+6.» — and ${f.tot === 1 ? "it is" : "they are"} left out of the
        “sem x/M” chip for the same reason. Hover ${f.tot === 1 ? "it" : "them"} to see the composition and what is excluded.
      </p>`;
    }
    const f = tableStats(its);
    /* Round 14 — the ✈ table says on its own face WHY it is here and who is in
       it, because its rows are a subset of the roster and nothing else on the
       tab is. Its columns count for the men in it exactly as any other column
       counts for anyone: the scope is the only thing that changed. */
    const demoLine = !t.demo ? "" : `<br><b>Scope:</b> Chapter 5 of the 3-01 (§§6, 17-20 and the Ε-1δ EVENTS row)
      binds the <b>Ιπτάμενος Επίδειξης</b> only. Rows here are the instructors flagged <b>DEMO PILOT</b> in the
      Scheduler roster form; for them these columns count in the availability dot and in “owes” like any other,
      and for everyone else they are not shown and not counted.`;
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
      Columns tagged <b>obligation</b> keep their colour but stay out of the dot, the chips and “owes” — each header states why.${demoLine}
    </p>`;
  }

  /* ── column headers ──────────────────────────────────────────────────────
     The printed names are long ("Ε-45 — VISUAL DELIVERY MED/HI APEX, day"), so
     the header shows the HEAD of the name, set HORIZONTALLY and wrapped over as
     many lines as it needs (Round 13: «Τα ονόματα από τις στήλες wrap και
     οριζόντια γραφή»). When two items of the same table share a head — the four
     ΠΡ rows all start «Advanced exercises (ΠΡ)» — the tail is appended, because
     two identical column titles would be a lie about which one the user is
     typing into.

     ROUND 14 — NOTHING IS CLIPPED, AT ALL. The user's words: «Μερικα item απο
     στηλες τα εμφανιζει με τελιτσες. Δεν το θελουμε... θελουμε το κειμενο χωρις
     τελιτσες. Διαμορφωσε αναλογως για να χωραει, χωρις να μικρυνουμε
     γραμματοσειρα.» Round 13's 38-character ceiling produced «…» on 26 of the
     91 heads — the longest is 86 characters — so the ceiling is GONE and no
     «…» is ever inserted here. The head grows DOWNWARDS instead: five or six
     wrapped lines at the SAME font size, and the thead simply gets taller.
     The width is handled where widths belong, in the CSS: the column keeps its
     112px, and because the label is allowed to break only BETWEEN words, a
     single word wider than that widens ITS column to the word (min-content) —
     the minimum widening the directive asks for, never a shrink and never a
     cut. The full name is still in the tooltip; the head is a label.        */
  const headOf = (it) => String(it.name || it.id).split(" — ")[0].trim();
  const tailOf = (it) => String(it.name || it.id).split(" — ").slice(1).join(" — ").trim();

  /* ── A BARE CODE IS NOT A COLUMN NAME ────────────────────── (Round 15) ───
     USER DIRECTIVE, verbatim: «Στα Ε να εχουμε και την πολυ συντομη εξηγηση
     απο 3-1 (FCF Δοκιμη Α/Φ) για παραδειγμα εδω στο ονομα της στηλης.»
     The Ε columns showed «Ε-1γ» and nothing else, because the head of the
     catalog name IS the code and the code is unique. It now reads
     «Ε-1γ — Aircraft test flight (FCF / Δοκιμή Α/Φ)», and so does every other
     bare-code head in the tab (Σ-1, SIM-3, SIM-ΔΑ …). A head with a space in
     it is already a name and is left exactly as it was.

     THE CLIP IS INTELLIGENT AND THERE IS NO «…» ANYWHERE
       budget          40 characters and 5 units
       a unit          a word — except that a BRACKETED GROUP counts as ONE,
                       because «(FCF / Δοκιμή Α/Φ)» reads as one thing and
                       counting its four words would have thrown away the very
                       gloss the directive asked for
       inside budget   the whole tail is kept, untouched
       otherwise       first drop a TRAILING bracketed gloss («Practice forced
                       landing (Εικονική Αναγκαστική Π/Γ)» → «Practice forced
                       landing»), and only if that is still too long take
                       COMPLETE WORDS from the front, never leaving an unclosed
                       bracket and never ending on a dangling «or / at / with»
     Nothing is ever cut mid-word and no ellipsis character is inserted — the
     head wraps over as many lines as it needs (Round 14) and the FULL name is
     one hover away in the tooltip. Checked over all 91 names: zero ellipsis,
     zero unbalanced brackets, and Ε-45/Ε-46 keep «MED/HI APEX» / «LOW APEX»,
     which is the only thing that tells those two columns apart.            */
  const MAX_LBL_CH = 40;
  const MAX_LBL_UNITS = 5;
  const LBL_STOP = " and or of the a an at in on to with for both per by from ";
  /* words, with a bracketed group counting as one (depth-aware, so the nested
     «(Π.ΒΟΛΗΣ (Η))» of Ε-41α stays a single unit) */
  function lblUnits(s) {
    const out = [];
    let buf = "", depth = 0;
    for (const ch of String(s)) {
      if (ch === "(") depth += 1;
      else if (ch === ")") depth = Math.max(0, depth - 1);
      if (ch === " " && depth === 0) { if (buf) out.push(buf); buf = ""; }
      else buf += ch;
    }
    if (buf) out.push(buf);
    return out;
  }
  const lblFits = (s) => s.length <= MAX_LBL_CH && lblUnits(s).length <= MAX_LBL_UNITS;
  function lblTrim(s) {
    let cur = String(s).trim();
    for (;;) {
      let next = cur.replace(/[\s,·/‐-―(]+$/, "");
      const w = lblUnits(next);
      if (w.length && LBL_STOP.indexOf(" " + w[w.length - 1].toLowerCase() + " ") >= 0) {
        next = w.slice(0, -1).join(" ");
      }
      if (next === cur) return cur;
      cur = next;
    }
  }
  function shortOf(tail) {
    const t = String(tail || "").replace(/\s+/g, " ").trim();
    if (!t || lblFits(t)) return t;
    if (t.charAt(t.length - 1) === ")" && t.indexOf(" (") > 0) {
      const base = lblTrim(t.slice(0, t.lastIndexOf(" (")));
      if (base && lblFits(base)) return base;
    }
    const took = [];
    for (const w of lblUnits(t)) {
      if (took.length + 1 > MAX_LBL_UNITS || took.concat([w]).join(" ").length > MAX_LBL_CH) break;
      took.push(w);
    }
    return lblTrim(took.join(" ")) || lblUnits(t)[0];
  }
  /* a head with no space in it is a CODE («Ε-1γ», «Σ-2», «SIM-ΔΑ»); a head with
     one is already a name («Demo pilot», «Advanced exercises (ΠΡ)») */
  const isCodeHead = (h) => !!h && h.indexOf(" ") < 0;

  /* the two ΣΥΝΟΛΑ columns wear the word the 3-01 PRINTS on that row — the
     catalog name («Semi-annual maintenance air programme, T-6A (Table 9)») is
     the name of the programme, not of the line, and a total column that never
     says «ΣΥΝΟΛΟ» is the one column a reader cannot place. The word is taken
     off the printed row itself, with its two figures stripped. (Round 15) */
  function totalLabel(id) {
    const q = CUR().SEM_QUOTA[id] || {};
    const w = String(q.printed || "").replace(/[\s\d—–-]+$/, "").trim();
    return (w || "ΣΥΝΟΛΟ") + " (derived)";
  }

  function colLabels(its) {
    const enriched = new Map();
    for (const it of its) {
      const h = headOf(it), tl = tailOf(it);
      enriched.set(it.id, CUR().isTotalItem(it.id) ? totalLabel(it.id)
        : isCodeHead(h) && tl ? h + " — " + shortOf(tl) : h);
    }
    /* Two columns may still land on the same label — the five «Demo pilot»
       rows, the four «Advanced exercises (ΠΡ)» ones — and two identical column
       titles would be a lie about which one the user is typing into. Only
       THOSE groups fall back to the Round-13 differentiation. */
    const bag = new Map();
    for (const it of its) {
      const k = enriched.get(it.id);
      if (!bag.has(k)) bag.set(k, []);
      bag.get(k).push(it);
    }
    const out = new Map();
    for (const [lbl, list] of bag) {
      if (list.length === 1) { out.set(list[0].id, lbl); continue; }
      /* The label repeats. The common OPENING of the tails tells nothing apart
         by definition — «Σ-2 — Instrument flight (PDO), day» / «…, night» — so
         it is dropped and what the reader needs is what is kept:
         «Σ-2 · day» / «Σ-2 · night». Nothing is truncated on either side. */
      const tails = list.map(tailOf);
      const first = tails[0];
      let n = 0;
      while (n < first.length && tails.every((t) => t[n] === first[n])) n += 1;
      const keep = Math.max(0, first.slice(0, n).lastIndexOf(" ") + 1);   // never cut a word in half
      list.forEach((it, k) => out.set(it.id, headOf(it) + " · " + (tails[k].slice(keep) || tails[k])));
    }
    return out;
  }

  function colTip(it, t) {
    const src = it.source || {};
    /* Round 15 — a recording aid has no catalog row behind it, so it says what
       it is and stops: no validity, no lapse consequence, no source page. */
    if (it.synth) {
      return [String(it.name), "RECORDING COLUMN — not a row of the 3-01: " + it.why,
        "Dated entries only. Nothing is required, nothing counts down, and it is outside the "
          + CUR().items().length + "-item catalog — it never enters a quota, a rollup or “owes”."
          + (CUR().flightDerive(it.id).length
            ? "\nRecording a flight here also dates: "
              + CUR().flightDerive(it.id).map((id) => (CUR().byId(id) || {}).name || id).join(" · ")
            : ""),
      ].join("\n\n");
    }
    const q = t.sem ? (CUR().SEM_QUOTA[it.id] || {}) : null;
    const lines = [String(it.name || it.id)];
    if (q && q.total) {
      const T = CUR().TOTALS[it.id] || { of: [], excl: [] };
      lines.push("DERIVED TOTAL — nothing is typed here (Round 15). It is the sum of: "
        + T.of.map((id) => (CUR().byId(id) || {}).name || id).join(" · "));
      if (T.excl.length) {
        lines.push("Left out: " + T.excl.map((p) => ((CUR().byId(p[0]) || {}).name || p[0]) + " — " + p[1]).join("\n           "));
      }
      lines.push(q.printed ? "PRINTED: " + q.printed : "");
      lines.push("The 3-01 prints " + q.posted + " for a posted flyer, which is exactly what those component "
        + "columns add up to.");
      lines.push("Source: " + (q.src || "3-01"));
      return lines.filter(Boolean).join("\n\n");
    }
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
    const warn = (it) => (!it.synth && CUR().resolve(it, true).warn ? " ⚠" : "");
    /* an obligation is by definition a DATED row; no quota id is on the list.
       Asking the engine directly (instead of «not a semester table») keeps the
       marker honest now that table ⑤ mixes a dated column in. */
    const obl = (it) => (CUR().isObligation(it.id) ? " °" : "");
    /* THE SPACER COLUMN (Round 13). The table is `min-width: 100%` with AUTO
       layout, so a table narrower than the panel — ① has seven columns — has
       slack to hand out, and an auto-width first column takes all of it: the
       frozen name column measured 392px in ① against 208px in ③, which is the
       eye losing its anchor between two tables of the same rows. One empty
       cell at the end, `width: 100%`, eats the slack instead, and every table
       keeps the same name column. It carries no data and no header text.   */
    const head = `<tr><th class="cur-who cur-corner" scope="col">Instructor
        <span class="sch-nd">${all.length}</span></th>`
      + its.map((it) => `<th class="cur-col${it.synth ? " cur-xcol" : ""}" scope="col" title="${esc(colTip(it, t))}"
          ><span class="cur-collbl">${esc(labs.get(it.id))}${esc(warn(it))}${esc(obl(it))}</span></th>`).join("")
      + `<td class="cur-pad"></td></tr>`;
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
        <td class="cur-cell is-off" colspan="${its.length + 1}">no OID yet — open the roster form in the Scheduler and save the row once</td></tr>`;
    }
    const s = sumOf(i), sm = semOf(i), exp = !!i.experienced;
    return `<tr class="cur-row">
      <th class="cur-who" scope="row"><span class="cur-whobox">${whoHtml(i, s, sm)}</span></th>
      ${its.map((it) => cellHtml(t, it, i, exp)).join("")}
      <td class="cur-pad"></td>
    </tr>`;
  }

  /* the row head — the person, then everything the old left-hand list carried:
     the availability dot, the ΕΜΠ/ΑΠ tag, "owes N", "sem x/M" and the 🖨 that
     prints his binder sheet (printCurrency is Round 11's, untouched).

     ROUND 13 — «Στο Currency να φαίνονται ολόκληρα τα ονόματα». It is written
     on TWO LINES inside the one frozen cell: the dot and the WHOLE name first,
     the chips under it. One line would have had to carry a disambiguated label
     — the seed's own worst case is «Instructor01 T. (IP-14)» — plus four chips
     and a button, which is exactly the ~320px column that made the name
     ellipsise in the first place. Nothing is ellipsised now: a longer name
     WIDENS the column (the CSS pins a minimum, never a maximum) and every
     table widens with it, because every table shows the same rows.
     (Every example name in this file comes from the FAKE public seed.)      */
  function whoHtml(i, s, sm) {
    const nm = who(i);
    const idTip = "code " + (i.code || "—") + (i.rank ? " · " + i.rank : "")
      + (i.callsign ? " · " + i.callsign : "") + (i.country ? " · " + i.country : "")
      + (i.test_pilot ? " · TEST PILOT (the SIM-ΔΑ quota applies to him)" : "")
      + (i.demo_pilot ? " · DEMO PILOT (the Chapter 5 rows of the ✈ table apply to him)" : "")
      + "\n\nThe code is the stored key — it stays in the roster form, in the pickers and in search.";
    const lvl = i.experienced
      ? { t: "ΕΜΠ", why: "EXPERIENCED (Annex B §17) — every row of this line reads the ΕΜΠ validity column" }
      : { t: "ΑΠ", why: "INEXPERIENCED (Annex B §17) — every row of this line reads the ΑΠ validity column" };
    const chips = !s ? "" : (s.owes
      ? `<span class="sch-badge cur-expired" title="${esc(availTip(s))}">owes ${s.owes}</span>`
      : s.expiring ? `<span class="sch-badge cur-expiring" title="${esc(availTip(s))}">exp ${s.expiring}</span>` : "")
      + (sm ? `<span class="sch-badge cur-sem st-${esc(sm.state)}" title="${esc(semTip(sm))}">sem ${sm.done}/${sm.total}</span>` : "")
      + (i.demo_pilot ? `<span class="sch-curobl" title="${esc("DEMO PILOT (Ιπτάμενος Επίδειξης) — the "
        + CUR().DEMO_IDS.size + " Chapter 5 rows of the ✈ table are his and count in the figures on this line. "
        + "The flag is edited in the Scheduler roster form.")}">✈</span>` : "");
    return `<span class="cur-wholine cur-wholine-n">${s
        ? `<span class="sch-cdot st-${esc(s.state)}" title="${esc(availTip(s))}"></span>`
        : `<span class="sch-cdot st-neutral" title="no OID — nothing is computed for this row"></span>`}
        <span class="cur-who-n" title="${esc(idTip)}">${esc(nm)}</span></span>
      <span class="cur-wholine cur-wholine-c">
        <span class="sch-curobl cur-lvl" title="${esc(lvl.why + ". Edit the flag in the Scheduler roster form — it is a property of the instructor, not of this view.")}">${esc(lvl.t)}</span>
        ${chips}
        <span class="sch-spacer"></span>
        <button type="button" class="sch-mini cur-pr" data-act="cur-print" data-code="${esc(i.code)}"
          title="print the binder sheet of ${esc(nm)} — one instructor per sheet, the ΑΕΡΟΣ semester table, the dated items and the F/S semester table last, plain monochrome">🖨</button>
      </span>`;
  }

  const availTip = (s) => (s.owes
    ? "availability — NOT current: " + s.owes + " item" + (s.owes === 1 ? "" : "s") + " expired or never recorded"
    : s.expiring
      ? "availability — available, " + s.expiring + " item" + (s.expiring === 1 ? "" : "s") + " expiring"
      : "availability — available: " + s.counted + " counted items all in date")
    + " (the whole catalog, not just this table)"
    + (s.obl.overdue ? " · plus " + s.obl.overdue + " recorded obligation"
      + (s.obl.overdue === 1 ? "" : "s") + " overdue (no availability loss — not counted here)" : "")
    + (s.demoOut ? " · " + s.demoOut + " Chapter 5 (demo-pilot) row" + (s.demoOut === 1 ? "" : "s")
      + " are out of scope for him and are neither shown nor counted" : "");

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
  const CELL_FLIGHT = "\n\nClick to record a flight (date + the Ε flown), or to delete one.";
  const CELL_RO = "\n\nView-only — unlock Editor mode in the topbar to change it.";
  const CUR_STATE_TXT = {
    ok: "current", expiring: "expiring", expired: "EXPIRED",
    never: "never recorded", neutral: "no counter",
  };

  function cellHtml(t, it, i, exp) {
    if (it.synth) return synthCell(it, i);              // Round 15 — a recording aid
    if (t.sem) {
      const q = CUR().quotaOf(it, i);
      if (q.total) return totalCell(it, i, q);          // Round 15 — derived, never typed
      if (!q.window) return quotaCell(it, i, q);
    }
    return dateCell(it, i, exp);
  }

  /* the SHORT name of a component inside a derived total. The bare code is not
     enough — Σ-2 is printed twice in Πίνακας 9 — so the differentiating word is
     kept when the catalog itself ends the name with one («…, day» / «…, night»)
     and dropped when it would be a sentence («SIM-1 — Precision handling …»).
     «Σ-1 0 + Σ-2 day 0 + Σ-2 night 1 + Σ-3 2 + Σ-4 1» reads at a glance and
     names every row exactly once.                                          */
  function compName(id) {
    const it = CUR().byId(id);
    if (!it) return id;
    const h = headOf(it), tl = tailOf(it);
    const last = tl.indexOf(",") >= 0 ? tl.slice(tl.lastIndexOf(",") + 1).trim() : "";
    return h + (last && last.length <= 6 && last.indexOf(" ") < 0 ? " " + last : "");
  }

  /* the ENTRY reading of one cell: how many sorties, and how many of them came
     out of the old counter with no date attached */
  function entryRead(i, itemId) {
    const list = CUR().entriesOf(i.oid, itemId);
    let undated = 0;
    for (const e of list) if (!e.date) undated += 1;
    return { n: list.length, undated: undated, list: list };
  }
  const entryTip = (r) => (!r.n ? "nothing recorded this semester"
    : r.n + " recorded sortie" + (r.n === 1 ? "" : "s")
      + (r.undated ? " — " + r.undated + " of them with no date (recorded before Round 15, or imported as a count)" : ""));

  function quotaCell(it, i, q) {
    const st = CUR().semStatusOf(i.oid, it, i);
    const nm = who(i);
    if (q.n == null) {
      return `<td class="cur-cell st-neutral is-off"
        title="${esc(nm + " · " + it.name + "\n\nNothing is required: " + (q.why || "no number is printed for this row")
          + "\n\nSo there is nothing to record here.")}">—</td>`;
    }
    const r = entryRead(i, it.id);
    const tip = nm + " · " + it.name + "\n\n" + st.x + " of " + q.n + " sortie"
      + (q.n === 1 ? "" : "s") + " recorded in " + st.sem.label
      + (st.done ? " — met" : " — " + st.short + " still owed, " + st.sem.left + " days of the semester left")
      + "\nA shortfall is not an availability loss."
      + (r.undated ? "\n" + r.undated + " of the recorded sorties carr" + (r.undated === 1 ? "ies" : "y")
        + " no date (recorded before Round 15, or imported as a count)." : "")
      + (canEdit() ? CELL_FLIGHT : CELL_RO);
    return `<td class="cur-cell is-rec st-${esc(st.state)}"
      data-cell="${esc(it.id)}" data-code="${esc(i.code)}" data-k="q"
      ${canEdit() ? `tabindex="0" role="button"` : ""} title="${esc(tip)}">
      <span class="cur-cv">${st.x}<span class="cur-slash">/</span>${q.n}${r.undated
        ? `<span class="cur-undated" aria-hidden="true">°</span>` : ""}</span></td>`;
  }

  /* ── THE DERIVED TOTAL ─────────────────────────────────────── (Round 15) ─
     «Οι 6 πτησεις ειναι αυτες που μετρας ως 0/6. Δεν ειναι 6+6.» It reads x/N
     with the same four colours as any quota cell, and it is NOT a control: no
     tabindex, no role, no click — there is nothing to type into a sum. The
     tooltip is where the honesty lives: every component with its own figure,
     and every deliberately excluded row with the reason it is out.          */
  function totalCell(it, i, q) {
    const st = CUR().semStatusOf(i.oid, it, i);
    const T = CUR().totalOf(i.oid, it.id);
    const parts = T.parts.map((p) => compName(p.id) + " " + p.n).join(" + ");
    const tip = who(i) + " · " + it.name + "\n\nDERIVED — nothing is typed here.\n"
      + parts + " = " + T.x + " of " + (q.n == null ? "—" : q.n) + " in " + st.sem.label
      + (st.done ? " — met" : " — " + st.short + " still owed")
      + (T.excl.length ? "\n\nLeft out of the sum: "
        + T.excl.map((p) => ((CUR().byId(p[0]) || {}).name || p[0]).split(" — ")[0] + " (" + p[1] + ")").join(" · ") : "")
      + "\n\nRecord the sorties in their own columns — this one follows.";
    return `<td class="cur-cell cur-derived st-${esc(st.state)}" title="${esc(tip)}">
      <span class="cur-cv">${st.x}<span class="cur-slash">/</span>${q.n == null ? "—" : q.n}</span></td>`;
  }

  /* ── A RECORDING AID ───────────────────────────────────────── (Round 15) ─
     No quota, so no colour: it wears the same grey the Σ-20 column wears, and
     it says «—» when nothing has been recorded rather than a hopeful 0. The
     FCF column is not even offered to a man without the TP flag (`hide`), the
     same way SIM-ΔΑ is not.                                                 */
  function synthCell(it, i) {
    const q = CUR().quotaOf(it, i);
    const nm = who(i);
    if (q.hide) {
      return `<td class="cur-cell st-neutral is-off"
        title="${esc(nm + " · " + it.name + "\n\n" + q.why)}">—</td>`;
    }
    const r = entryRead(i, it.id);
    const w = CUR().curSem();
    const tip = nm + " · " + it.name + "\n\n" + entryTip(r) + " (" + w.label + ")"
      + "\nNo quota is printed for this column — it is recorded, never owed."
      + (CUR().flightDerive(it.id).length
        ? "\nRecording a flight here also dates: "
          + CUR().flightDerive(it.id).map((id) => (CUR().byId(id) || {}).name || id).join(" · ") : "")
      + (canEdit() ? CELL_FLIGHT : CELL_RO);
    return `<td class="cur-cell cur-xcell is-rec st-neutral"
      data-cell="${esc(it.id)}" data-code="${esc(i.code)}" data-k="q"
      ${canEdit() ? `tabindex="0" role="button"` : ""} title="${esc(tip)}">
      <span class="cur-cv">${r.n ? String(r.n) : "—"}${r.undated
        ? `<span class="cur-undated" aria-hidden="true">°</span>` : ""}</span></td>`;
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

  /* ══════════════════════════════════════════════════════════════════════
     THE POPOVERS — ONE AT A TIME                              (Round 15)
     ══════════════════════════════════════════════════════════════════════
     Two of them, one host, one state:
       LEGEND  «Ολα τα αντιστοιχα τα βαζεις pop up με ενα info button.» — the
               table's own legend, word for word, behind the ⓘ of its header
               bar. It is a READING: it opens on a view-only device too.
       FLIGHT  «Προσθετουμε πτηση συντηρησης. Βαζουμε ημερομηνια και λιστα απο
               Ε για να επιλεξει ποια εκτελεστηκαν.» — the form of this round.

     WHY THE HOST LIVES OUTSIDE #cur-main
       render() replaces the innerHTML of #cur-main on every store write, and
       this form writes to the store: a popover inside it would delete itself
       mid-typing. It sits next to the grid instead, is re-anchored to its cell
       after every repaint, and closes by itself if that cell goes away (a
       collapsed table, a departed instructor, a catalog reload).

     WHY THE CHECKBOX STATE LIVES IN `pop.eids` AND NOT IN THE DOM
       the filter box re-renders the list. A Set is the truth; the boxes are a
       reading of it, exactly like every other cell on this tab.             */
  const pop = { kind: "", key: "", code: "", id: "", date: "", eids: null };

  function popHost() {
    let el = $id("cur-pop");
    if (!el) {
      el = document.createElement("div");
      el.id = "cur-pop";
      el.className = "cur-pop hidden";
      el.setAttribute("role", "dialog");
      el.setAttribute("aria-label", "details");
      ($id("view-currency") || document.body).appendChild(el);
    }
    return el;
  }
  function popClose() {
    pop.kind = ""; pop.key = ""; pop.code = ""; pop.id = ""; pop.eids = null;
    const el = $id("cur-pop");
    if (el) { el.className = "cur-pop hidden"; el.innerHTML = ""; }
    const host = $id("cur-main");
    if (host) for (const b of host.querySelectorAll("[data-curinfo]")) b.setAttribute("aria-expanded", "false");
  }
  /* the element the popover hangs off, found by walking datasets — a person
     code and an item id are user data and have no business in a selector */
  function popAnchor() {
    const host = $id("cur-main");
    if (!host || !pop.kind) return null;
    if (pop.kind === "legend") {
      return [...host.querySelectorAll("[data-curinfo]")].filter((b) => b.dataset.curinfo === pop.key)[0] || null;
    }
    return [...host.querySelectorAll("[data-cell]")]
      .filter((c) => c.dataset.cell === pop.id && c.dataset.code === pop.code)[0] || null;
  }
  function popPlace() {
    const el = popHost();
    const a = popAnchor();
    if (!a) { popClose(); return; }
    const r = a.getBoundingClientRect();
    const w = el.offsetWidth || 340, h = el.offsetHeight || 240, pad = 8;
    const left = Math.max(pad, Math.min(r.left, window.innerWidth - w - pad));
    let top = r.bottom + 6;
    if (top + h > window.innerHeight - pad) top = r.top - h - 6;
    /* BOTH branches are clamped since Round 15b. The "below the anchor" one was
       not, so an anchor that had scrolled out of the viewport for ANY reason
       drew the popover at a negative top — off-screen, with the entry list and
       its ✕ out of reach. A popover is never worth less than visible: it is
       pinned inside the viewport and scrolls its own body (max-height). */
    top = Math.max(pad, Math.min(top, window.innerHeight - h - pad));
    el.style.left = Math.round(left) + "px";
    el.style.top = Math.round(top) + "px";
  }

  function popOpenLegend(key) {
    const t = TABLES.filter((x) => x.key === key)[0];
    if (!t) return;
    if (pop.kind === "legend" && pop.key === key) { popClose(); return; }   // the ⓘ toggles
    popClose();
    pop.kind = "legend"; pop.key = key;
    popRender();
    const b = popAnchor();
    if (b) b.setAttribute("aria-expanded", "true");
  }
  function popOpenFlight(code, id) {
    popClose();
    pop.kind = "flight"; pop.code = code; pop.id = id;
    pop.date = CUR().todayISO();
    pop.eids = new Set();
    popRender();
    const d = $id("cur-pop-date");
    if (d) d.focus();
  }

  /* the Ε an instructor may be shown. Chapter 5's Ε-1δ is not offered to a man
     who does not hold the display post: bumping it would write a date on a row
     Round 14 deliberately does not show him. */
  const eItemsFor = (ip) => CUR().items()
    .filter((it) => it.kind === "e-item" && (ip.demo_pilot || !CUR().isDemoItem(it.id)));
  const eLabel = (it) => {
    const h = headOf(it), tl = tailOf(it);
    return isCodeHead(h) && tl ? h + " — " + shortOf(tl) : String(it.name || it.id);
  };

  function popRender() {
    const el = popHost();
    el.className = "cur-pop cur-pop-" + (pop.kind || "none");
    el.innerHTML = pop.kind === "legend" ? popLegendHtml() : pop.kind === "flight" ? popFlightHtml() : "";
    if (!el.innerHTML) { popClose(); return; }
    popPlace();
  }

  function popLegendHtml() {
    const t = TABLES.filter((x) => x.key === pop.key)[0];
    if (!t) return "";
    return popHead(`${t.n} ${esc(t.label)}`)
      + `<p class="cur-popnote">${esc(t.note)}.</p>`
      + legendHtml(t, colsOf(t));
  }
  const popHead = (title) => `<div class="cur-poph"><strong>${title}</strong>
    <span class="sch-spacer"></span>
    <button type="button" class="sch-mini" data-nav data-pop="close" title="close (Esc)">✕</button></div>`;

  /* ── THE FLIGHT FORM ──────────────────────────────────────── (Round 15) ─
     Date + which Ε were flown, and under it EVERY sortie recorded in this cell,
     grouped by the semester its own date filed it under — this half first, then
     the others newest first, each entry with its own ✕.
     ROUND 15b: the list used to be the current half only, which made a sortie
     mis-typed into 30/06 or into 2027 readable but UNDELETABLE (R15 verify item
     1.i) — the form wrote into any semester by date and deleted from one. Every
     ✕ now carries the key of the group it sits in, so it deletes out of the half
     that actually holds it; an emptied cell and an emptied semester still drop
     their keys (writeBag), so nothing accumulates.                          */
  function popFlightHtml() {
    const ip = S().find("instructors", pop.code);
    const it = CUR().byId(pop.id) || CUR().synthItems().filter((x) => x.id === pop.id)[0];
    if (!ip || !ip.oid || !it) return "";
    const w = CUR().curSem();
    const q = CUR().quotaOf(it, ip);
    /* the stored index is what delEntry() takes, so it is captured BEFORE the
       display sort (newest first) — the two orders are not the same */
    const rowsOf = (k) => CUR().entriesOf(ip.oid, pop.id, k).map((e, i) => ({ e: e, i: i }))
      .sort((a, b) => String(b.e.date || "").localeCompare(String(a.e.date || "")));
    const eids = pop.eids || new Set();
    const es = eItemsFor(ip);
    const auto = CUR().flightDerive(pop.id);
    const other = CUR().semKeysOf(ip.oid).filter((k) => k !== w.key && CUR().entriesOf(ip.oid, pop.id, k).length);
    const bags = [{ key: w.key, label: w.label, cur: true, rows: rowsOf(w.key) }]
      .concat(other.map((k) => ({ key: k, label: CUR().semOf(k).label, cur: false, rows: rowsOf(k) })));
    const ro = !canEdit();
    return popHead("✈ Record a maintenance flight")
      + `<p class="cur-popsub"><b>${esc(who(ip))}</b> · ${esc(it.name)}</p>
      ${ro ? `<p class="cur-popnote">View-only — unlock Editor mode in the topbar to record or delete a flight.</p>` : `
      <div class="cur-popgrid">
        <label class="cur-poplbl" for="cur-pop-date">Date of the flight</label>
        <input id="cur-pop-date" class="sch-in" type="date" value="${esc(pop.date)}" data-pop="date">
      </div>
      <p class="cur-popnote">It is filed under the semester <b>this date</b> falls in, not under today's — a sortie
        flown on 30/06 and typed in July lands in the first half of the year and leaves this cell alone.
        ${q.n == null ? "This column has no printed quota: the flight is recorded, never owed."
          : "This cell counts the sorties of " + esc(w.label) + " against the printed " + q.n + "."}</p>
      <div class="cur-popbar">
        <span class="cur-poplbl">Which Ε were performed on this flight</span>
        <span class="sch-badge" id="cur-pop-n">${eids.size} selected</span>
      </div>
      <input id="cur-pop-q" class="sch-in cur-popq" type="search" placeholder="filter the ${es.length} Ε — code or words"
        autocomplete="off" data-pop="q">
      <div class="cur-elist" id="cur-pop-list">${eListHtml(es, eids, "")}</div>
      ${auto.length ? `<p class="cur-popnote">This column also dates, by itself:
        <b>${esc(auto.map((id) => (CUR().byId(id) || {}).name || id).join(" · "))}</b> — forward only, and never over a later date.</p>` : ""}
      ${es.length < 28 ? `<p class="cur-popnote">${28 - es.length} Ε of the 28 (Chapter 5) belong to the display pilot and are
        not offered here — ${esc(who(ip))} does not hold the post.</p>` : ""}
      <div class="cur-popbtns">
        <button type="button" class="sch-btn primary" data-pop="save">✔ Record flight</button>
        <button type="button" class="sch-btn" data-pop="close">Cancel</button>
      </div>`}
      <hr class="cur-pophr">
      ${bags.map((b) => `<p class="cur-poplbl${b.cur ? "" : " cur-semh"}">${b.cur ? "Recorded in " : ""}${esc(b.label)}
        — ${b.rows.length} sortie${b.rows.length === 1 ? "" : "s"}${b.cur ? "" : " · counted in that half"}</p>
      ${b.rows.length ? `<ul class="cur-entries">${b.rows.map((r) => entryLi(r.e, r.i, ro, b.key)).join("")}</ul>`
        : `<p class="cur-popnote">Nothing recorded in this cell yet.</p>`}`).join("")}
      ${other.length ? `<p class="cur-popnote">A sortie is filed by <b>its own date</b>, so the ${other.length === 1
        ? "half listed above is <b>another semester</b> — counted in <b>its own half</b>"
        : "halves listed above are <b>other semesters</b> — each counted in <b>its own half</b>"}, not in this cell.
        ${ro ? "Shown so that nothing is hidden from a reader."
        : "Each carries its own ✕, so a sortie typed on the wrong day can be taken out of the half that holds it."}</p>` : ""}`;
  }

  function entryLi(e, idx, ro, semKey) {
    const names = (e.eids || []).map((id) => (CUR().byId(id) || {}).name || id);
    return `<li class="cur-entry">
      <span class="cur-entryd${e.date ? "" : " is-undated"}"
        title="${esc(e.date ? "flown " + dmy(e.date) : "no date: this sortie came from a plain counter (before Round 15) or from an import that knew the count but not the day")}"
        >${e.date ? esc(dmy(e.date).slice(0, 5)) : "undated"}</span>
      <span class="cur-entrye" title="${esc(names.length ? names.join("\n") : "no Ε exercise was recorded on this sortie")}"
        >${e.eids && e.eids.length ? e.eids.length + " Ε" : "—"}</span>
      ${ro ? "" : `<button type="button" class="sch-mini cur-entryx" data-pop="del" data-i="${idx}" data-k="${esc(semKey || "")}"
        title="delete this recorded sortie — the Ε dates it wrote are NOT rolled back, they are the truth of what was flown">✕</button>`}
    </li>`;
  }

  function eListHtml(es, eids, q) {
    const f = String(q || "").trim().toLowerCase();
    const hit = es.filter((it) => !f || String(it.name).toLowerCase().indexOf(f) >= 0 || String(it.id).indexOf(f) >= 0);
    if (!hit.length) return `<p class="cur-popnote">No Ε matches “${esc(q)}”.</p>`;
    return hit.map((it) => `<label class="cur-echk" title="${esc(it.name)}">
      <input type="checkbox" data-eid="${esc(it.id)}"${eids.has(it.id) ? " checked" : ""}>
      <span>${esc(eLabel(it))}</span></label>`).join("");
  }

  /* ── the write: ONE entry, then the Ε dates it proves ────────────────────
     addEntry() files the sortie; every selected Ε and every automatic derive
     of this column then goes through bump() with src "flight:<semester>",
     which is an AUTOMATIC source — so it may only move a date FORWARD and can
     never clear one or walk over a later manual entry. The toast says how many
     actually moved, because «2 Ε updated» when one of them was already later
     would be a small lie.                                                   */
  function popSave() {
    const ip = S().find("instructors", pop.code);
    if (!ip || !ip.oid) return;
    const box = $id("cur-pop-date");
    const date = box ? box.value : pop.date;
    pop.date = date;
    const chosen = [...(pop.eids || new Set())];
    ui.busy = true;                                   // one repaint for the whole flight
    try {
      const r = CUR().addEntry(ip.oid, pop.id, date, chosen, "flight");
      if (!r) {
        S().toast(canEdit() ? "Nothing recorded — check the date." : "View-only — unlock Editor mode first.", "bad");
        return;
      }
      const src = "flight:" + r.key;
      const seen = Object.create(null);
      /* ROUND 15b — the two families are counted BY ORIGIN, not by item kind.
         Round 15 asked «is this row an e-item?», which is a question about the
         catalog, not about what the user did: an FCF flight with nothing ticked
         dates Ε-1γ by itself and the toast said «1 Ε updated» (R15 verify item
         2, NIT) — the man ticked no Ε at all. TICKED is Ε; what the COLUMN
         implies by itself (a night landing, the Ε-1γ of an FCF) is a row dated,
         whatever kind the catalog gives it. */
      const ticked = Object.create(null);
      for (const id of chosen) ticked[id] = 1;
      let movedE = 0, movedOther = 0, kept = 0;
      for (const id of CUR().flightDerive(pop.id).concat(chosen)) {
        if (seen[id]) continue;
        seen[id] = 1;
        const before = CUR().dateOf(ip.oid, id);
        CUR().bump(ip.oid, id, date, src);
        if (CUR().dateOf(ip.oid, id) === before) kept += 1;
        else if (ticked[id]) movedE += 1;
        else movedOther += 1;
      }
      const item = CUR().byId(pop.id) || CUR().synthItems().filter((x) => x.id === pop.id)[0] || { name: pop.id };
      S().toast("flight recorded — " + headOf(item)
        + (r.key === CUR().curSem().key ? " · " + r.x + " this semester" : " · filed under " + CUR().semOf(r.key).label)
        + (movedE ? " · " + movedE + " Ε updated" : "")
        + (movedOther ? " · " + movedOther + " row" + (movedOther === 1 ? "" : "s") + " dated" : "")
        + (kept ? " · " + kept + " already later" : ""), "good");
      pop.eids = new Set();
    } finally {
      ui.busy = false;
      render();                                       // repaints the grid AND the popover
    }
  }

  /* the ✕ carries the semester it belongs to (Round 15b) — an entry filed by
     its own date into another half is deleted out of THAT half, never out of
     the current one by accident. A missing key still means «the current one»,
     which is exactly what semKeyOrNull() reads a blank as. */
  function popDel(idx, semKey) {
    const ip = S().find("instructors", pop.code);
    if (!ip || !ip.oid) return;
    const key = semKey || null;
    const ok = CUR().delEntry(ip.oid, pop.id, key, idx);
    if (!ok) { S().toast("Nothing deleted.", "bad"); return; }
    S().toast("Recorded sortie deleted"
      + (key && key !== CUR().curSem().key ? " from " + CUR().semOf(key).label : "")
      + ". The Ε dates it wrote stay — they are what was flown.", "good");
  }

  /* every click inside the popover, in one place */
  function popClick(e) {
    const b = e.target.closest("[data-pop]");
    if (!b) return;
    const act = b.dataset.pop;
    if (act === "close") { popClose(); return; }
    if (act === "save") { popSave(); return; }
    if (act === "del") { popDel(b.dataset.i, b.dataset.k); return; }
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
      /* Round 15 — the flight form's own controls. The date box and the Ε
         checkboxes are STATE, not a write: nothing reaches the store until
         "Record flight" is pressed, so the semester cell cannot move under a
         half-filled form. The filter re-renders only the list, which is what
         keeps the caret in the search box. */
      const pd = t.closest ? t.closest("[data-pop]") : null;
      if (pd && pd.dataset.pop === "date") { pop.date = pd.value; return; }
      if (t && t.dataset && t.dataset.eid && pop.eids) {
        if (t.checked) pop.eids.add(t.dataset.eid); else pop.eids.delete(t.dataset.eid);
        const n = $id("cur-pop-n");
        if (n) n.textContent = pop.eids.size + " selected";
      }
    });

    /* the filter box types — `input`, not `change`, so the list narrows as he
       types. Only the list is rewritten; the checked state comes from the Set,
       so a box ticked before filtering is still ticked after it. */
    el.addEventListener("input", (e) => {
      const t = e.target;
      if (!t || t.id !== "cur-pop-q" || !pop.eids) return;
      const ip = S().find("instructors", pop.code);
      const list = $id("cur-pop-list");
      if (!ip || !list) return;
      list.innerHTML = eListHtml(eItemsFor(ip), pop.eids, t.value);
    });

    /* the grid is keyboard-reachable: a cell is role="button" + tabindex, and
       Enter / Space opens its editor (or the flight form). Escape closes what
       is open. Once an input is there the keys belong to IT — a Space
       swallowed inside a native date box would be this handler's fault. */
    el.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (pop.kind) { popClose(); return; }
        if (ui.edit) { ui.edit = null; render(); return; }
      }
      if (e.target && (e.target.tagName === "INPUT" || e.target.closest("#cur-pop"))) return;
      const cell = e.target.closest ? e.target.closest("[data-cell]") : null;
      if (!cell || (e.key !== "Enter" && e.key !== " ")) return;
      e.preventDefault();
      openCell(cell);
    });

    el.addEventListener("click", (e) => {
      if (e.target.closest("#cur-pop")) { popClick(e); return; }
      const info = e.target.closest("[data-curinfo]");
      if (info) { popOpenLegend(info.dataset.curinfo); return; }
      const sec = e.target.closest("[data-cursec]");
      if (sec) {
        popClose();                                   // its anchor is about to disappear
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

    /* CLICK-OUT and Escape from ANYWHERE — the popover is a floating layer, so
       a click on the topbar or a key pressed with the focus on <body> must
       close it too. Attached once, to the document, and it only ever CLOSES:
       everything that opens one is inside the view listener above.
       CAPTURE PHASE, and that is not a detail: "Record flight" REBUILDS the
       popover, so by the time a bubbling listener saw the event its target
       would be a detached node whose closest("#cur-pop") is null — the form
       would close itself every time it was used. In the capture phase the DOM
       is still the one that was clicked. */
    document.addEventListener("click", (e) => {
      if (!pop.kind || !e.target || !e.target.closest) return;
      if (e.target.closest("#cur-pop") || e.target.closest("[data-curinfo]") || e.target.closest("[data-cell]")) return;
      popClose();
    }, true);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && pop.kind) popClose();
    });
  }

  /* ── the deep link from the roster's NIGHT badge ────────── (Round 14) ────
     The badge in the Scheduler roster form is a READING of one cell of this
     matrix, so it is also the way in: one click opens this tab, opens the
     table that holds the column, brings the cell into view and flashes it. It
     never opens the editor — a locked device gets the reading, not a refusal,
     and the cell's own click does the rest when Editor mode is on.
     The cell is found by walking the rendered cells and comparing datasets:
     a code is user data and has no business inside a CSS selector.          */
  window.curFocusCell = function curFocusCell(code, itemId) {
    if (!code || !itemId) return;
    const t = shownTables().filter((x) => itemsOf(x).some((it) => it.id === itemId))[0];
    if (t && !tblOpen(t.key)) setCol(t.key, false);
    const tab = $id("tab-currency");
    if (tab) tab.click(); else void window.curInit();
    setTimeout(() => {
      const host = $id("cur-main");
      if (!host) return;
      const hit = [...host.querySelectorAll("[data-cell]")]
        .filter((c) => c.dataset.cell === itemId && c.dataset.code === code)[0];
      if (!hit) return;
      if (hit.scrollIntoView) hit.scrollIntoView({ block: "center", inline: "center" });
      hit.classList.add("is-flash");
      setTimeout(() => hit.classList.remove("is-flash"), 1800);
    }, 80);
  };

  function openCell(cell) {
    const code = cell.dataset.code, id = cell.dataset.cell;
    if (!code || !id) return;                       // an is-off cell carries neither
    /* belt and braces: the capture guard in SchedEdit already swallows the
       click, and the seam would refuse the write — this simply never opens an
       input the user cannot save */
    if (!canEdit()) { window.SchedEdit.refuse("record a currency date or a flight"); return; }
    /* ROUND 15 — a semester cell no longer becomes a number box. A sortie is an
       event with a day and a set of Ε, so the cell opens the FLIGHT FORM; a
       second click on the same cell closes it again. */
    if (cell.dataset.k === "q") {
      if (pop.kind === "flight" && pop.code === code && pop.id === id) { popClose(); return; }
      /* ROUND 15b — a flight form and a matrix date editor are never open at
         the same time. Two reasons, and the second is the bug: they are two
         edits of two different things, and the editor's focus() steals the
         scroll on EVERY repaint, dragging the form's anchor out of view. */
      if (ui.edit) { ui.edit = null; popClose(); render(); }
      popOpenFlight(code, id);
      return;
    }
    if (isEditing(code, id)) return;
    ui.edit = { code: code, id: id, kind: "d" };
    render();
  }

  /* ══ the squadron binder sheet — ONE instructor, THREE sections ═════════
     Round 11's sheet, kept as it was (the user asked for the per-row 🖨 to
     print «the EXISTING per-instructor binder sheet»); the identity line reads
     the display name and Round 13 puts the sections in the SAME order as the
     screen — ① ΑΕΡΟΣ semester, ② the dated items, ③ F/S semester last — so a
     binder page and the tab can be read side by side without re-sorting.
     Plain monochrome, on the board's #sch-print host and its print sheet.   */
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
    const isDemo = !!i.demo_pilot;
    const s = CUR().summary(i.oid, exp, isDemo);
    const sem = CUR().semSummary(i.oid, i);
    const w = sem.sem;

    /* ROUND 15 — the RECORDED column carries the dates, because that is what a
       recorded sortie is now. Undated entries (a migrated counter) are named
       as such on paper too: a binder sheet that quietly printed «2» for two
       sorties whose days nobody knows would be the double of the honesty this
       card was built for. */
    const recCell = (it) => {
      const list = CUR().entriesOf(i.oid, it.id);
      if (!list.length) return "0";
      const days = list.filter((e) => e.date).map((e) => dmy(e.date).slice(0, 5));
      const und = list.length - days.length;
      return esc(String(list.length) + (days.length ? " — " + days.join(", ") : "")
        + (und ? (days.length ? " · " : " — ") + und + " undated" : ""));
    };
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
      if (it.synth) {                       // Round 15 — a recording column
        if (q.hide) return "";              // the FCF column is not his to hold
        const n = CUR().entriesOf(i.oid, it.id).length;
        return `<tr><td>${esc(it.name)} (recording column, not a Πίνακας requirement)</td>
          <td>—</td><td>${recCell(it)}</td><td>${n} recorded</td><td>—</td></tr>`;
      }
      const st = CUR().semStatusOf(i.oid, it, i);
      if (q.total) {                        // Round 15 — derived, and it says so
        const T = CUR().totalOf(i.oid, it.id);
        return `<tr><td>${esc(it.name)} (printed total — DERIVED from ${esc(T.parts.map((p) =>
          compName(p.id)).join(" + "))})</td>
          <td>${q.n == null ? "—" : esc(q.n + " sortie" + (q.n === 1 ? "" : "s"))}</td>
          <td>${esc(T.parts.map((p) => compName(p.id) + " " + p.n).join(" + "))} = ${T.x}</td>
          <td>${st.x} / ${q.n == null ? "—" : q.n}</td>
          <td>${esc(SEM_PRINT(st))}</td></tr>`;
      }
      return `<tr><td>${esc(it.name)}${q.tp ? " (Test Pilots only)" : ""}</td>
        <td>${q.n == null ? "—" : esc(q.n + " sortie" + (q.n === 1 ? "" : "s"))}</td>
        <td>${recCell(it)}</td>
        <td>${st.x} / ${q.n == null ? "—" : q.n}</td>
        <td>${esc(SEM_PRINT(st))}</td></tr>`;
    };
    /* Round 13 — the sheet mirrors the screen: ΑΕΡΟΣ opens it, F/S closes it.
       One printed table per section, so the group header row of Round 11/12
       (which now only repeated its own section title) is gone. Round 15 reads
       the SAME column list the screen reads (colsOf), so the two recording
       columns are on paper exactly where they are on screen.                */
    const semBodyOf = (key) => {
      const t = TABLES.filter((x) => x.sem && x.semgrp === key)[0];
      return (t ? colsOf(t) : []).map(semRow).join("");
    };
    const semAirBody = semBodyOf("s");
    const semFsBody = semBodyOf("sim");

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
       group, so a kind header can never dangle alone at the foot of a page.
       Round 14 — the Chapter 5 ids leave section ② here exactly as they leave
       the general tables on screen: they print in their own section, and only
       on the sheet of a man who holds the post. A group emptied by that split
       prints no header either. */
    const body = datedGroups().map((g) => {
      const its = g.items.filter((it) => !CUR().isDemoItem(it.id));
      return its.length
        ? `<tr class="pv-grp"><th colspan="6">${esc(g.label.toUpperCase())}</th></tr>` + its.map(row).join("")
        : "";
    }).join("");
    const demoBody = isDemo ? CUR().demoItems().map(row).join("") : "";
    const demoSec = !isDemo ? "" : `
        <p class="pv-h">④ ✈ ΙΠΤΑΜΕΝΟΣ ΕΠΙΔΕΙΞΗΣ — DEMO PILOT (ΚΕΦ. 5)</p>
        <p class="pv-p">Chapter 5 binds the display pilot only. These ${CUR().DEMO_IDS.size} rows print on this sheet
          because ${esc(who(i))} is flagged DEMO PILOT in the roster, and they are counted in the availability figures
          above like every other row; an instructor who does not hold the post neither sees them nor owes them.</p>
        <table class="pv-t"><thead><tr><th>ITEM</th><th>VALIDITY</th><th>LAST DONE</th><th>EXPIRES</th><th>DAYS LEFT</th><th>STATUS</th></tr></thead>
          <tbody>${demoBody}</tbody></table>`;

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
            ${i.callsign ? " · " + esc(i.callsign) : ""}${i.country ? " · " + esc(i.country) : ""}${i.test_pilot ? " · TEST PILOT" : ""}${isDemo ? " · DEMO PILOT" : ""}
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
          ${isDemo ? "" : `<p class="pv-p">The ${CUR().DEMO_IDS.size} rows of Chapter 5 (Ιπτάμενος Επίδειξης) are neither
            printed nor counted on this sheet: ${esc(who(i))} does not hold the display-pilot post.</p>`}
        </div>
        <p class="pv-h">① ΑΝΑ ΕΞΑΜΗΝΟ — ΑΕΡΟΣ (Σ), ΠΙΝΑΚΑΣ 9 · ${esc(w.label.toUpperCase())} · ENDS ${esc(dmy(w.end))} (${w.left} DAYS LEFT)</p>
        <p class="pv-p">REQUIRED is the ΤΟΠΟΘΕΤΗΜΕΝΟΣ (POSTED) column of Πίνακας 9 — the printed split is
          posted vs attached, not experienced vs inexperienced. A quota is not a window: nothing counts down and a
          shortfall costs no availability (§40 · §46). RECORDED lists the DAY of every sortie booked in this
          semester; a sortie that carries no day was recorded as a plain count before the flight form existed. The
          ΣΥΝΟΛΟ line is DERIVED from the rows above it and is never typed — a figure written straight into it
          would count the same sorties twice. The rows marked «recording column» are not Πίνακας 9 requirements
          at all: they are sorties the squadron writes down, and they are counted nowhere.</p>
        <table class="pv-t"><thead><tr><th>ITEM</th><th>REQUIRED</th><th>RECORDED</th><th>PROGRESS</th><th>STATUS</th></tr></thead>
          <tbody>${semAirBody}</tbody></table>
        <p class="pv-h">② ΛΗΓΟΥΝ / ΔΕΝ ΛΗΓΟΥΝ — DATED ITEMS</p>
        <table class="pv-t"><thead><tr><th>ITEM</th><th>VALIDITY</th><th>LAST DONE</th><th>EXPIRES</th><th>DAYS LEFT</th><th>STATUS</th></tr></thead>
          <tbody>${body}</tbody></table>
        <p class="pv-h">③ ΑΝΑ ΕΞΑΜΗΝΟ — F/S (SIM), ΠΙΝΑΚΑΣ 6 · ${esc(w.label.toUpperCase())}</p>
        <p class="pv-p">REQUIRED is the ΤΟΠΟΘΕΤΗΜΕΝΟΣ (POSTED) column of Πίνακας 6 (§22 each sortie at least one hour ·
          §25 the figures are a MINIMUM). The last row is the §49 REFRESH THRESHOLD, not a quota: it carries a DATE and it
          does count for availability — its VALIDITY, LAST DONE and DAYS LEFT are printed in the quota columns. The ΣΥΝΟΛΑ
          line is DERIVED from SIM-1 + SIM-2 + SIM-3 + SIM-5; SIM-ΔΑ is deliberately outside that sum, because §24 lets it
          be flown IN PLACE OF SIM-1 and adding it would count one sortie twice.</p>
        <table class="pv-t"><thead><tr><th>ITEM</th><th>REQUIRED</th><th>RECORDED</th><th>PROGRESS</th><th>STATUS</th></tr></thead>
          <tbody>${semFsBody}</tbody></table>${demoSec}
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
     The tables must be the whole catalog with no id rendered twice. A silent
     gap would mean an instructor holds something the app never shows him, so
     it is asserted rather than assumed.

     ROUND 14 — TWO FIGURES, AND THE DIFFERENCE BETWEEN THEM IS NAMED.
       `total` / `missing`   the identity over ALL tables, ⑥ included:
                             7 + 16 + 27 + 27 + 8 + 6 = 91, always, whether or
                             not anybody is a demo pilot. This is the one that
                             warns: an id nobody claims is a bug.
       `rendered` / `demoHidden`  what is on screen right now. With no demo
                             pilot the six Chapter 5 ids are OUT OF SCOPE, not
                             missing — they are listed by name in demoHidden
                             and `rendered` reads 85. Flag one instructor and
                             `rendered` is 91 again with demoHidden empty.
     Reporting an out-of-scope row as "missing" would be a false alarm every
     day of the year the squadron has no display pilot; reporting it as covered
     without saying it is hidden would be the silent gap this check exists to
     catch. So both are printed, and only the first one warns.               */
  function curCoverage() {
    const per = TABLES.map((t) => ({ key: t.key, demo: !!t.demo, ids: itemsOf(t).map((it) => it.id) }));
    const seen = new Set();
    const dup = [];
    for (const p of per) for (const id of p.ids) { if (seen.has(id)) dup.push(id); seen.add(id); }
    const all = CUR().items().map((it) => it.id);
    const on = demoOn();
    const hidden = on ? [] : per.filter((p) => p.demo).reduce((a, p) => a.concat(p.ids), []);
    /* ROUND 15 — the recording aids are counted SEPARATELY and on purpose: they
       are columns on screen but not catalog items, so they must never move
       `total`, `seen` or `rendered`. The check that matters here is that no aid
       has quietly become a catalog id (auditSynth() checks the same thing from
       the engine's side; this one proves it about what is actually drawn). */
    const aids = [];
    for (const t of TABLES) for (const c of colsOf(t)) if (c.synth) aids.push(c.id);
    const clash = aids.filter((id) => seen.has(id));
    const out = { total: all.length, seen: seen.size, duplicated: dup,
      missing: all.filter((id) => !seen.has(id)),
      demoPilots: CUR().demoPilots().length, demoHidden: hidden,
      rendered: seen.size - hidden.length, aids: aids, aidClash: clash };
    per.forEach((p) => { out[p.key] = p.ids.length; });
    if (dup.length || out.missing.length || out.seen !== out.total || clash.length) {
      console.warn("SchedCurrency: the tables do not cover the catalog exactly", out);
    }
    return out;
  }
  window.curCoverage = curCoverage;
})();
