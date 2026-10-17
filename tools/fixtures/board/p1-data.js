"use strict";
/* PROBE 1 — THE DATA CANNOT DRIFT FROM ITS SOURCES.
   Every cite in board_decision_trees.json must be a verbatim, byte-for-byte
   copy of the requirement it names (verbatim, file basename, page, ref); every
   threshold the trees state must equal the matrix's; every edge must land on a
   node; every node must name who flies next. */
const H = require("./harness.js");
const { TREES, REQ, MX, ok, eq } = H;
const base = (p) => String(p || "").split(/[\\/]/).pop();

console.log("\n=== PROBE 1 — board_decision_trees.json integrity ===");
eq("artifact name", TREES.artifact, "board_decision_trees");
eq("tree_count matches trees[]", TREES.tree_count, TREES.trees.length);
ok("at least 12 families", TREES.trees.length >= 12, String(TREES.trees.length));
const need = ["dp_ladder", "air_1a", "air_1b", "air_1g", "air_1d", "fs_1e", "section_last", "first_solo", "written_1st", "oral_1z", "discipline_direct", "accident_1ia", "airsickness", "kepe", "board_outcome"];
for (const id of need) ok("family present: " + id, TREES.trees.some((t) => t.id === id));

const ids = new Map();
let cites = 0, nodes = 0;
for (const t of TREES.trees) {
  ok(t.id + " · has a root that exists", t.nodes.some((n) => n.id === t.root), t.root);
  for (const n of t.nodes) {
    nodes++;
    ok(t.id + "/" + n.id + " · unique id", !ids.has(n.id)); ids.set(n.id, t.id);
    ok(t.id + "/" + n.id + " · kind known", !!TREES.node_kinds[n.kind], n.kind);
    ok(t.id + "/" + n.id + " · next_with is an actor", Object.prototype.hasOwnProperty.call(TREES.actors, n.next_with), n.next_with);
    ok(t.id + "/" + n.id + " · engine tag", ["schedconsq", "data", "both"].indexOf(n.engine) >= 0, n.engine);
    ok(t.id + "/" + n.id + " · carries at least one cite", (n.cites || []).length >= 1);
    for (const c of n.cites || []) {
      cites++;
      const r = REQ.get(c.requirement_id);
      ok(n.id + " · " + c.requirement_id + " exists in failure_procedures.json", !!r);
      if (!r) continue;
      eq(n.id + " · " + c.requirement_id + " verbatim is a byte copy", c.verbatim, r.verbatim);
      eq(n.id + " · " + c.requirement_id + " file", c.file, base(r.source.file));
      eq(n.id + " · " + c.requirement_id + " page_pdf", c.page_pdf, r.source.page_pdf);
      eq(n.id + " · " + c.requirement_id + " ref", c.ref, r.source.ref);
      ok(n.id + " · " + c.requirement_id + " has a plain-Greek explanation", typeof c.explanation === "string" && c.explanation.length >= 20);
      ok(n.id + " · " + c.requirement_id + " explanation is not the verbatim", c.explanation !== c.verbatim);
    }
  }
  if (n_link(t)) ok(t.id + " · link_tree targets exist", t.nodes.every((n) => !n.link_tree || TREES.trees.some((x) => x.id === n.link_tree)));
}
function n_link(t) { return t.nodes.some((n) => n.link_tree); }
for (const t of TREES.trees) for (const e of t.edges) {
  ok(t.id + " · edge " + e.from + "→" + e.to + " lands on a node", ids.has(e.from) && ids.has(e.to));
}
console.log("  (" + nodes + " nodes, " + cites + " cites checked)");

console.log("\n=== PROBE 1b — the lettering trap is in the data, not hidden ===");
const L = TREES.lettering;
eq("ΠΔ has 11 cases", L.pd_cases_count, 11);
eq("3-01 §58 has 12 cases", L.doc301_cases_count, 12);
eq("offset starts at ζ", L.offset_from, "ζ");
eq("offset is one letter", L.offset_amount, 1);
const m = (pd) => (L.map.find((x) => x.pd === pd) || {}).doc301;
eq("1στ ↔ §58στ (not shifted)", m("1στ"), "§58στ");
eq("1ζ ↔ §58ζ + §58η (the split)", m("1ζ"), "§58ζ + §58η");
eq("1η ↔ §58θ", m("1η"), "§58θ");
eq("1θ ↔ §58ι", m("1θ"), "§58ι");
eq("1ι ↔ §58ια", m("1ι"), "§58ια");
eq("1ια ↔ §58ιβ", m("1ια"), "§58ιβ");
ok("lettering note is the matrix's own reading note", MX.reading_notes.indexOf(L.note) >= 0);
eq("lettering cite is fail-85 verbatim", L.cite.verbatim, REQ.get("fail-85").verbatim);

console.log("\n=== PROBE 1c — thresholds equal the matrix (no second number anywhere) ===");
const TH = TREES.thresholds;
const mx = (kindRe) => MX.entries.find((e) => kindRe.test(e.failure_kind)).allowed_before_board;
const a1g = mx(/1γ/);
eq("1γ grace 4", TH.air_1g.grace, a1g.grace_sorties_at_stage_start);
eq("1γ 2×0-49 (matrix tolerates 1)", TH.air_1g.consecutive_0_49, a1g.max_consecutive_0_49_without_referral + 1);
eq("1γ 3×0-59 (matrix tolerates 2)", TH.air_1g.consecutive_0_59, a1g.max_consecutive_0_59_without_referral + 1);
const a1d = mx(/1δ/);
eq("1δ 40 %", TH.air_1d.pre_solo_pct, a1d.pre_solo_threshold_pct);
eq("1δ 20 %", TH.air_1d.total_pct, a1d.total_flights_threshold_pct);
eq("1δ 17 of 85", Math.ceil(TH.air_1d.planned_phase2_sorties * TH.air_1d.total_pct / 100), a1d.indicative_20pct_of_85_planned_sorties);
const a1e = mx(/1ε/);
eq("1ε grace 3", TH.fs_1e.grace, a1e.grace_sorties_at_stage_start);
eq("1ε 3 consecutive (matrix tolerates 2)", TH.fs_1e.consecutive_0_59, a1e.max_consecutive_without_referral + 1);
eq("1ε 20 %", TH.fs_1e.cumulative_pct, a1e.cumulative_pct_of_stage_sorties);
eq("1ε floor 3", TH.fs_1e.cumulative_floor, a1e.cumulative_absolute_floor);
const a1st = mx(/1στ/);
eq("1στ 2 consecutive", TH.written.consecutive_to_board, a1st.consecutive_failures_to_trigger);
eq("1στ zero checks before board", a1st.checks_between_referral_and_board, 0);
const a1z = mx(/1ζ/);
eq("1ζ 4 consecutive", TH.oral.referral_consecutive, a1z.consecutive_failures_to_trigger);
eq("1ζ 8 non-consecutive", TH.oral.referral_total, a1z.non_consecutive_failures_to_trigger);
eq("1ζ KEPE at 2", TH.oral.kepe_consecutive, a1z.kepe_threshold_consecutive);
eq("1ζ KEPE at 4", TH.oral.kepe_total, a1z.kepe_threshold_non_consecutive);
/* the MATRIX still records the two readings as it was written (ΠΔ 1 / 3-01 2);
   the trees read them as one ladder since 2026-10-17 — these pin the matrix
   file, not the rule */
eq("1ζ matrix still records the ΠΔ-only reading as 1 check (data unchanged)", a1z.checks_between_referral_and_board_PD, 1);
eq("1ζ matrix still records the 3-01 reading as 2 checks (= the one ladder)", a1z.checks_between_referral_and_board_3_01, 2);
const dp = mx(/ΚΛΙΜΑΚΑ ΔΟΚΙΜΩΝ/);
eq("DP: AE once per stage", TH.dp.ae_per_stage, dp.AE_checks_max_per_stage);
eq("DP: Cdr once if AE ≥60", TH.dp.cdr_if_ae_ge60, dp.SqnCdr_checks_if_prev_AE_ge_60pct);
eq("DP: Cdr twice if AE <60", TH.dp.cdr_if_ae_lt60, dp.SqnCdr_checks_if_prev_AE_lt_60pct);
eq("DP pass mark 60", TH.dp.pass_pct, REQ.get("fail-23").values.pass_threshold_pct);
const fsl = mx(/ΤΕΛΕΥΤΑΙΑ έξοδο ενότητας στο F\/S/);
eq("F/S last: 3 attempts", TH.fs_last.attempts, fsl.total_attempts);
eq("F/S last: 2 days before third", TH.fs_last.wait_days_before_third, fsl.wait_calendar_days_before_third);
const kp = mx(/ΚΕΠΕ/);
eq("KEPE ground cap 2", TH.kepe.caps.ground, kp.ground_exams_max);
eq("KEPE adaptation cap 2", TH.kepe.caps.adaptation, kp.adaptation_category_max);
eq("KEPE other air cap 1", TH.kepe.caps.other_air, kp.other_air_categories_max_per_category);
eq("KEPE F/S cap 1", TH.kepe.caps.fs, kp.fs_categories_max_per_category);
eq("KEPE 63 % is the odd threshold", TH.kepe.two_consecutive_pct, REQ.get("fail-44").values.two_consecutive_threshold_pct);
eq("blind control 90 %", TH.blind.pass_pct, mx(/blind control/).pass_pct);
eq("nausea graded 59", TH.nausea.default_grade_pct, mx(/ΑΕΡΟΝΑΥΤΙΑ/).default_grade_pct);
eq("written pass 80", TH.written.pass_pct, REQ.get("fail-28").values.questionnaire_pass_pct);
eq("bold face 100", TH.written.bold_face_pct, REQ.get("fail-28").values.bold_face_and_limits_pass_pct);
eq("board deadline 10 working days", TH.board.deadline_working_days, REQ.get("fail-67").values.deadline_working_days);
eq("board ΥΠΕΡ: 1 practice flight", TH.board.practice_flights, mx(/ΥΠΕΡ της συνέχισης/).practice_flights);

console.log("\n=== PROBE 1d — the matrix's unresolved doubts are carried into the trees ===");
const allUnres = TREES.trees.reduce((s, t) => s.concat(t.nodes.reduce((u, n) => u.concat(n.unresolved || []), [])), []);
ok("≥ 20 unresolved items surfaced on nodes", allUnres.length >= 20, String(allUnres.length));
/* 1ζ — RESOLVED by the owner 2026-10-17: one ladder, not a contradiction */
const oral = TREES.trees.find((t) => t.id === "oral_1z");
ok("1ζ: no unresolved entry frames ΠΔ παρ.4 vs 3-01 §58η as a contradiction any more", !allUnres.some((u) => /ΑΝΤΙΦΑΣΗ ΠΟΥ ΑΛΛΑΖΕΙ/.test(u)));
ok("1ζ: the ΠΔ-only one-failure node is gone", !oral.nodes.some((n) => n.id === "o_pd" || n.id === "o_301"));
const rx = oral.nodes.find((n) => n.id === "o_reexam");
ok("1ζ: a single re-examination node exists", !!rx);
ok("1ζ: it cites fail-38 AND fail-39 on the same path", !!rx && rx.cites.some((c) => c.requirement_id === "fail-38") && rx.cites.some((c) => c.requirement_id === "fail-39"));
ok("1ζ: the owner's reconciliation is recorded as a dated ruling with his words", !!rx && rx.rulings.some((r) => r.date === "2026-10-17" && r.by === "ο ιδιοκτήτης" && /Αλλιώς θα πήγαιναν οι μισοί/.test(r.quote)));
ok("1ζ: examiner (#22), syllabus (#23) and pass mark (#24) stay open on that node", !!rx && rx.unresolved.length === 3 && rx.unresolved.some((u) => /ΑΡΜΟΔΙΟΤΗΤΑΣ/.test(u)) && rx.unresolved.some((u) => /ΥΛΗΣ/.test(u)) && rx.unresolved.some((u) => /κατώφλι/.test(u)));
ok("1ζ: the edges are one ladder — γραπτή → επανεξέταση → Συμβούλιο", oral.edges.some((e) => e.from === "o_exam" && e.to === "o_reexam") && oral.edges.some((e) => e.from === "o_reexam" && e.to === "o_board") && oral.edges.some((e) => e.from === "o_reexam" && e.to === "o_pass"));
ok("the 1δ denominator doubt is named", allUnres.some((u) => /προγραμματισμένες/i.test(u) && /εκτελεσθείσες/i.test(u)));
ok("… and the owner ruling of 2026-10-17 (the total the phase/stage HAS) is recorded on it, in his words", allUnres.some((u) => /ΠΡΟΓΡΑΜΜΑΤΙΣΜΕΝΕΣ/.test(u) && /ΑΠΟΦΑΝΣΗ ΙΔΙΟΚΤΗΤΗ/.test(u) && /17\/10\/2026/.test(u) && /όσες έχει το στάδιο/.test(u)));
ok("1δ: the denominator membership (#10) stays open", allUnres.some((u) => /παρονομαστή/.test(u) && /F\/S, ΜΟΝΟΣ/.test(u)));
ok("no post or rank names the owner anywhere in the data", !/ΔΚΤΗ ΣΜΗΝΟΥΣ|Flight Commander|Διοικητής Σμήνους/.test(JSON.stringify(TREES.trees.map((t) => t.nodes.map((n) => ({ u: n.unresolved, r: n.rulings }))))));

/* ── the three rulings of 2026-10-17 ── */
const nodeById = (id) => { for (const t of TREES.trees) for (const n of t.nodes) if (n.id === id) return n; return null; };
console.log("\n=== PROBE 1e — R1: a 59 % airsickness sortie is exempt from 1γ/1δ (ΠΔ παρ.2 via 3-01 §29δ) ===");
for (const id of ["g_exempt", "n_exempt", "d_exempt"]) {
  const n = nodeById(id);
  ok(id + " · cites fail-01 (§29δ: ΣΚ = 50-59 — the bridge between the labels)", !!n && n.cites.some((c) => c.requirement_id === "fail-01"));
  ok(id + " · cites fail-57 (παρ.2) and fail-52 (§35: 59 %)", !!n && n.cites.some((c) => c.requirement_id === "fail-57") && (id === "d_exempt" || n.cites.some((c) => c.requirement_id === "fail-52")));
  ok(id + " · carries the owner's ruling, dated, by «ο ιδιοκτήτης»", !!n && n.rulings.some((r) => r.date === "2026-10-17" && r.by === "ο ιδιοκτήτης"));
}
ok("R1 · the ruling records the REASONING (§29δ bridge), not just the outcome", nodeById("g_exempt").rulings.some((r) => /§29δ/.test(r.text) && /ίδια τιμή/.test(r.text) && /Σχεδόν Καλώς/.test(r.text)));
ok("R1 · the other two limbs of παρ.2 stay intact (performance before the onset)", nodeById("g_exempt").rulings.some((r) => /ΠΡΙΝ την εκδήλωση/.test(r.text) && /Καλώς και άνω/.test(r.text)));
ok("R1 · the terminology doubt (ναυτία / ΑΕΡΟΝΑΥΤΙΑ) is closed", !allUnres.some((u) => /δεν ταυτίζονται ρητά/.test(u)));
ok("R1 · the «3-01 §58 does not reproduce the exemption» doubt is closed", !allUnres.some((u) => /δεν αναπαράγει/.test(u) && /ναυτίας|εξαίρεση/.test(u)));
ok("R1 · the skip-vs-break reading of «δεν υπολογίζονται» stays open", nodeById("g_exempt").unresolved.some((u) => /ΠΑΡΑΚΑΜΨΗ/.test(u)));

console.log("\n=== PROBE 1f — R2: the grace period excludes the sortie entirely (ruled interpretation) ===");
{
  const g = nodeById("g_grace"), e = nodeById("e_grace");
  ok("g_grace · unresolved carries ΕΡΜΗΝΕΙΑ ΙΔΙΟΚΤΗΤΗ 17/10/2026", g.unresolved.some((u) => /ΕΡΜΗΝΕΙΑ ΙΔΙΟΚΤΗΤΗ 17\/10\/2026/.test(u)));
  ok("g_grace · … counting starts from the 5th sortie, earliest 5+6 / 5+6+7", g.unresolved.some((u) => /5η έξοδο/.test(u) && /5\+6/.test(u) && /5\+6\+7/.test(u)));
  ok("g_grace · … and quotes the ΠΔ παρ.1γ anchor", g.unresolved.some((u) => /μετά τις τέσσερις \(4\) πρώτες εξόδους του σταδίου/.test(u)));
  ok("g_grace · … and says the texts do not settle it", g.unresolved.some((u) => /δεν λέει αν μια αλληλουχία/.test(u)));
  ok("g_grace · the Α/Φ-vs-F/S membership question stays open inside it", g.unresolved.some((u) => /μόνο Α\/Φ ή και F\/S/.test(u)));
  ok("e_grace · unresolved carries ΕΡΜΗΝΕΙΑ ΙΔΙΟΚΤΗΤΗ 17/10/2026, from the 4th, earliest 4+5+6", e.unresolved.some((u) => /ΕΡΜΗΝΕΙΑ ΙΔΙΟΚΤΗΤΗ 17\/10\/2026/.test(u) && /4η έξοδο/.test(u) && /4\+5\+6/.test(u)));
  ok("e_grace · … and quotes the ΠΔ παρ.1ε(αα) anchor", e.unresolved.some((u) => /Μετά τις τρεις \(3\) πρώτες εξόδους του σταδίου/.test(u)));
  ok("R2 · both anchors are byte-present in the cited verbatims (fail-76 / fail-40)", /μετά τις τέσσερις \(4\) πρώτες εξόδους του σταδίου/.test(REQ.get("fail-76").verbatim) && /Μετά τις τρεις \(3\) πρώτες εξόδους του σταδίου/.test(REQ.get("fail-40").verbatim));
}

console.log("\n=== PROBE 1g — R3: the Προ-ΜΟΝΟΣ count is 15, printed in the MIF table ===");
{
  const fs = require("fs"), path = require("path");
  const mif = JSON.parse(fs.readFileSync(path.join(H.ROOT, "data", "mif", "t6a.json"), "utf8"));
  const t0 = mif.tables[0];
  ok("MIF table 0 is «CONTACT (PRE-SOLO) / Τ-6A»", /CONTACT \(PRE-SOLO\)/.test(t0.title_verbatim));
  eq("… on Syllabus PDF page 92", t0.page_pdf, 92);
  eq("… seven training-unit columns", t0.columns.length, 7);
  eq("… the last column is C4790-91", t0.columns[6].unit, "C4790-91");
  const dual = t0.columns.reduce((s, c) => s + c.sorties_dual, 0), solo = t0.columns.reduce((s, c) => s + c.sorties_solo, 0);
  eq("… 14 dual", dual, 14); eq("… 1 solo", solo, 1);
  eq("… = 15 sorties, ending at the first solo", dual + solo, 15);
  eq("thresholds.air_1d.pre_solo_sorties = 15", TREES.thresholds.air_1d.pre_solo_sorties, 15);
  eq("thresholds.air_1d.pre_solo_sorties equals the digitised MIF count", TREES.thresholds.air_1d.pre_solo_sorties, dual + solo);
  eq("40 % of 15 → 6", TREES.thresholds.air_1d.pre_solo_low_grades_to_trigger, Math.ceil(15 * 0.4));
  eq("20 % of 85 → 17", TREES.thresholds.air_1d.total_low_grades_to_trigger, Math.ceil(85 * 0.2));
  ok("the source is named (file, page, table, digitised copy, columns)", (() => { const s = TREES.thresholds.air_1d.pre_solo_source; return s.page_pdf === 92 && /PRE-SOLO/.test(s.table) && /t6a\.json/.test(s.digitised) && /C4790-91 \(1\/1\)/.test(s.columns); })());
  const dp = nodeById("d_pre");
  ok("d_pre · threshold names 15 → 6", /15/.test(dp.threshold) && /6η πτήση/.test(dp.threshold));
  ok("d_pre · the #8 doubt («no source gives the count») is CLOSED", !allUnres.some((u) => /αριθμός πτήσεων της «ΠΡΟ ΜΟΝΟΣ» φάσης/.test(u)) && dp.unresolved.length === 0);
  ok("d_pre · carries the owner's ruling with his words", dp.rulings.some((r) => r.date === "2026-10-17" && r.by === "ο ιδιοκτήτης" && /όχι σε όσες έχει πετάξει μέχρι τώρα/.test(r.quote)));
  ok("d_tot · the ruling text now carries both quotes and both numbers (17, 6)", nodeById("d_tot").unresolved.some((u) => /όχι σε όσες έχει πετάξει/.test(u) && /17/.test(u) && /→ 6/.test(u)));
}
console.log("\n=== PROBE 1h — R4: the checkride ruling is on the 1γ tree with both sides ===");
{
  const n = nodeById("g_ckr");
  ok("g_ckr exists on air_1g", !!n && TREES.trees.find((t) => t.id === "air_1g").nodes.some((x) => x.id === "g_ckr"));
  ok("… cites fail-16 (1β), fail-76 (1γ silent), fail-44 (§32β(2) excludes expressly), fail-23 (consumed on clearance)", !!n && ["fail-16", "fail-76", "fail-44", "fail-23"].every((id) => n.cites.some((c) => c.requirement_id === id)));
  ok("… unresolved carries ΑΠΟΦΑΝΣΗ ΙΔΙΟΚΤΗΤΗ 17/10/2026 with both sides", !!n && n.unresolved.some((u) => /ΑΠΟΦΑΝΣΗ ΙΔΙΟΚΤΗΤΗ 17\/10\/2026/.test(u) && /ΔΕΝ εξαιρεί/.test(u) && /§32β\(2\)/.test(u) && /διπλής καταχώρισης/.test(u)));
  ok("… and leaves the skip-vs-reset question after a cleared checkride open", !!n && n.unresolved.some((u) => /ΔΕΝ ΡΥΘΜΙΣΤΗΚΕ/.test(u)));
  ok("… the ruling quotes the owner", !!n && n.rulings.some((r) => r.by === "ο ιδιοκτήτης" && /έχουμε μπει στη διαδικασία της δοκιμής προόδου/.test(r.quote)));
  ok("… reached by an edge from the nausea test", TREES.trees.find((t) => t.id === "air_1g").edges.some((e) => e.to === "g_ckr"));
}
eq("unresolved entries on nodes after R4, R7 and R8(d)", allUnres.length, 32);
ok("R7 · the παρ.7/9 budget is the engine's: no node still says the sandbox applies it as an overlay", !allUnres.some((u) => /μόνο το δοκιμαστήριο/.test(u)));
ok("R7 · fail-24 and fail-26 are listed under the engine, not data_only", TREES.engine.schedconsq.indexOf("fail-24") >= 0 && TREES.engine.schedconsq.indexOf("fail-26") >= 0 && TREES.engine.data_only.indexOf("fail-24") < 0);
ok("R7 · thresholds.dp names the unit of accounting: the stage", /ΣΤΑΔΙΟ/.test(TREES.thresholds.dp.unit_of_accounting) && TREES.thresholds.dp.engine === "schedconsq");
ok("the KEPE cap ruling is marked as unit interpretation", allUnres.some((u) => /ερμηνεία μονάδας/i.test(u)));
ok("no node explanation re-types a verbatim as explanation (sanity)", TREES.trees.every((t) => t.nodes.every((n) => n.cites.every((c) => c.explanation.indexOf("«Όταν") !== 0))));
