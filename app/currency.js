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
       quota, not a rolling window: it carries an editable COUNTER per semester
       and never touches the availability tally.
     DATED   the other 76 items, exactly as Round 10c/10d left them: one date
       each, the min(round(v×25%), 45) colour rule, recorded obligations with
       per-id reasons, ≈ conversions and ⚠ flags.
     15 + 76 = 91 = the whole catalog; every id is CLAIMED by exactly one table
     — asserted at boot by curCoverage() (Round 13 split the semester block into
     ΑΕΡΟΣ first and F/S last; see the second IIFE).

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
                 ① ΑΝΑ ΕΞΑΜΗΝΟ — ΑΕΡΟΣ   7
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
               instructor holds something the app never shows him.
               Round 13 directive, in the user's words: «Ξεχωριστό section για
               F/S και πτήσεις. Τα F/S στο τέλος.» — so what he flies opens the
               tab and the simulator closes it, each with its own legend, its
               own rollup and its own collapse state.
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
    $id("cur-main").innerHTML = headHtml(all) + shownTables().map((t) => tableHtml(t, all)).join("");
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

  function tableHtml(t, all) {
    if (!CUR().loaded()) return "";
    const its = itemsOf(t);
    const rows = rowsOf(t, all);
    const open = tblOpen(t.key);
    const r = rollup(t, its, rows);
    return `<section class="panel sch-panel cur-sec cur-mx${t.demo ? " cur-demo" : ""}" data-tbl="${esc(t.key)}">
      <div class="sch-h cur-mxh">
        ${secBtn(t.key, `${t.n} ${esc(t.label)} <span class="count">${its.length} item${its.length === 1 ? "" : "s"}</span>`
          + (t.demo ? ` <span class="count">${rows.length} demo pilot${rows.length === 1 ? "" : "s"}</span>` : ""))}
        <span class="sch-cdot st-${esc(r.state)}" title="${esc(r.tip)}"></span>
        <span class="sch-nd cur-roll" title="${esc(r.tip)}">${esc(r.txt)}</span>
      </div>
      ${open ? legendHtml(t, its) + gridHtml(t, its, rows) : ""}
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
      return `<p class="sch-hint sch-curlegend">
        <span class="sch-cdot st-ok"></span> met (x ≥ N) ·
        <span class="sch-cdot st-expiring"></span> short with more than ${CUR().SEM_RED_DAYS} days of the semester left ·
        <span class="sch-cdot st-expired"></span> short with ${CUR().SEM_RED_DAYS} days or less left ·
        <span class="sch-cdot st-neutral"></span> nothing required.
        <b>In this table:</b> ${clauses.join(" · ")}.
        <b>N</b> is the <b>ΤΟΠΟΘΕΤΗΜΕΝΟΣ (POSTED)</b> column of ${t.semgrp === "sim" ? "Πίνακας 6" : "Πίνακας 9"} — the printed split is posted vs attached,
        <b>not</b> experienced vs inexperienced, so a row's ΕΜΠ/ΑΠ tag does not move it (an <i>attached</i> flag is a future axis).
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
  function colLabels(its) {
    const bag = new Map();
    for (const it of its) {
      const h = headOf(it);
      if (!bag.has(h)) bag.set(h, []);
      bag.get(h).push(it);
    }
    const out = new Map();
    for (const [h, list] of bag) {
      if (list.length === 1) { out.set(list[0].id, h); continue; }
      /* The head repeats. The common OPENING of the tails tells nothing apart
         by definition — «Σ-2 — Instrument flight (PDO), day» / «…, night» — so
         it is dropped and what the reader needs is what is kept:
         «Σ-2 · day» / «Σ-2 · night». Nothing is truncated on either side. */
      const tails = list.map(tailOf);
      const first = tails[0];
      let n = 0;
      while (n < first.length && tails.every((t) => t[n] === first[n])) n += 1;
      const keep = Math.max(0, first.slice(0, n).lastIndexOf(" ") + 1);   // never cut a word in half
      list.forEach((it, k) => out.set(it.id, h + " · " + (tails[k].slice(keep) || tails[k])));
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
      + its.map((it) => `<th class="cur-col" scope="col" title="${esc(colTip(it, t))}"
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
    if (!canEdit()) { window.SchedEdit.refuse("record a currency date or count"); return; }
    if (isEditing(code, id)) return;
    ui.edit = { code: code, id: id, kind: cell.dataset.k === "q" ? "q" : "d" };
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
    /* Round 13 — the sheet mirrors the screen: ΑΕΡΟΣ opens it, F/S closes it.
       One printed table per section, so the group header row of Round 11/12
       (which now only repeated its own section title) is gone.              */
    const semBodyOf = (key) => [].concat.apply([], CUR().semGroups()
      .filter((g) => g.key === key).map((g) => g.items)).map(semRow).join("");
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
          shortfall costs no availability (§40 · §46).</p>
        <table class="pv-t"><thead><tr><th>ITEM</th><th>REQUIRED</th><th>RECORDED</th><th>PROGRESS</th><th>STATUS</th></tr></thead>
          <tbody>${semAirBody}</tbody></table>
        <p class="pv-h">② ΛΗΓΟΥΝ / ΔΕΝ ΛΗΓΟΥΝ — DATED ITEMS</p>
        <table class="pv-t"><thead><tr><th>ITEM</th><th>VALIDITY</th><th>LAST DONE</th><th>EXPIRES</th><th>DAYS LEFT</th><th>STATUS</th></tr></thead>
          <tbody>${body}</tbody></table>
        <p class="pv-h">③ ΑΝΑ ΕΞΑΜΗΝΟ — F/S (SIM), ΠΙΝΑΚΑΣ 6 · ${esc(w.label.toUpperCase())}</p>
        <p class="pv-p">REQUIRED is the ΤΟΠΟΘΕΤΗΜΕΝΟΣ (POSTED) column of Πίνακας 6 (§22 each sortie at least one hour ·
          §25 the figures are a MINIMUM). The last row is the §49 REFRESH THRESHOLD, not a quota: it carries a DATE and it
          does count for availability — its VALIDITY, LAST DONE and DAYS LEFT are printed in the quota columns.</p>
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
    const out = { total: all.length, seen: seen.size, duplicated: dup,
      missing: all.filter((id) => !seen.has(id)),
      demoPilots: CUR().demoPilots().length, demoHidden: hidden,
      rendered: seen.size - hidden.length };
    per.forEach((p) => { out[p.key] = p.ids.length; });
    if (dup.length || out.missing.length || out.seen !== out.total) {
      console.warn("SchedCurrency: the tables do not cover the catalog exactly", out);
    }
    return out;
  }
  window.curCoverage = curCoverage;
})();
