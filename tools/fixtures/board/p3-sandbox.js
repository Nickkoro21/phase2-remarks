"use strict";
/* PROBE 3 — THE SANDBOX: synthetic sequences in, verdicts out, every line
   cited. Nothing here names a person. The expectations are the matrix's own
   «πόσες φορές χωρίς Συμβούλιο» numbers. */
const H = require("./harness.js");
const { BT, TREES, ok, eq, F, FS, ev, run, firedCases, hasCite } = H;
const g4 = () => [F("pass"), F("pass"), F("pass"), F("pass")];

console.log("\n=== PROBE 3 — the evaluator is pure and never touches a store ===");
{
  const src = require("fs").readFileSync(require("path").join(H.ROOT, "app", "boardtrees.js"), "utf8");
  ok("boardtrees.js never calls SchedStore", !/SchedStore/.test(src));
  ok("boardtrees.js never calls SchedReady", !/SchedReady/.test(src));
  ok("boardtrees.js never reads localStorage", !/localStorage/.test(src));
  ok("the only fetch is the trees JSON", (src.match(/fetch\(/g) || []).length === 1 && /board_decision_trees\.json/.test(src));
  ok("no names, no call signs, no student numbers in presets", JSON.stringify(BT.PRESETS).indexOf("student") < 0 && !/call_?sign|mn:/i.test(JSON.stringify(BT.PRESETS)));
  const r = run([]);
  eq("empty sequence → free", r.status.code, "free");
  eq("… flies with own instructor", r.status.next_with, "own_ip");
}

console.log("\n=== PROBE 3a — 1γ: 3 consecutive 0-59 after the 4 grace sorties ===");
{
  let r = run(g4().concat([F("lag"), F("lag")]));
  ok("2 lags: nothing fires yet", r.fired.length === 0);
  eq("… still free", r.status.code, "free");
  r = run(g4().concat([F("lag"), F("lag"), F("lag")]));
  ok("3rd lag fires 1γ(Β)", firedCases(r).indexOf("1γ(Β)") >= 0, firedCases(r).join());
  eq("→ next: Δοκιμή Προόδου ΑΕ", r.status.code, "dp_ae");
  eq("… with the AE", r.status.next_with, "ae");
  ok("… cites fail-76 and fail-23", hasCite(r.fired[0].cites, "fail-76") && hasCite(r.fired[0].cites, "fail-23"));
  ok("… the verdict cites fail-23 (60 % rule)", hasCite(r.status.cites, "fail-23"));
  r = run([F("lag"), F("lag"), F("lag"), F("fail")]);
  ok("4 bad sorties INSIDE the grace fire nothing", !firedCases(r).some((c) => /1γ/.test(c)), firedCases(r).join());
  r = run(g4().concat([F("fail"), F("fail")]));
  ok("2 consecutive 0-49 fire 1γ(Α)", firedCases(r).indexOf("1γ(Α)") >= 0, firedCases(r).join());
  r = run(g4().concat([F("lag"), F("lag"), F("pass"), F("lag"), F("lag")]));
  ok("a pass breaks the run — no 1γ", !firedCases(r).some((c) => /1γ/.test(c)), firedCases(r).join());
}

console.log("\n=== PROBE 3b — 1γ then the ladder: ΑΕ fail → Δκτής fail → Συμβούλιο → ΥΠΕΡ → εξάσκηση ===");
{
  const seq = g4().concat([F("lag"), F("lag"), F("lag")]);
  let r = run(seq.concat([ev("dp_ae", "fail")]));
  eq("dp_ae fail → Cdr rung", r.status.code, "dp_cdr");
  eq("… with the Cdr", r.status.next_with, "cdr");
  ok("… cites fail-25", hasCite(r.status.cites, "fail-25"));
  r = run(seq.concat([ev("dp_ae", "fail"), ev("dp_cdr", "fail")]));
  eq("dp_cdr fail → Board", r.status.code, "board");
  eq("… nobody flies with him", r.status.next_with, "none");
  ok("… cites §31 suspension, the report, the 10 days", hasCite(r.status.cites, "fail-61") && hasCite(r.status.cites, "fail-66") && hasCite(r.status.cites, "fail-67"));
  r = run(seq.concat([ev("dp_ae", "fail"), ev("dp_cdr", "fail"), ev("board", "continue")]));
  eq("board ΥΠΕΡ → practice flight pending", r.status.code, "practice");
  eq("… with another instructor", r.status.next_with, "other_ip");
  ok("… cites fail-70", hasCite(r.status.cites, "fail-70"));
  r = run(seq.concat([ev("dp_ae", "fail"), ev("dp_cdr", "fail"), ev("board", "continue"), ev("practice", "pass")]));
  eq("after the practice flight the Cdr decides", r.status.code, "cdr_decides");
  r = run(seq.concat([ev("dp_ae", "fail"), ev("dp_cdr", "fail"), ev("board", "continue"), ev("practice", "pass"), ev("cdr_decision", "continue")]));
  eq("Cdr continues → free with another instructor", r.status.code, "free");
  eq("… other_ip", r.status.next_with, "other_ip");
  r = run(seq.concat([ev("dp_ae", "fail"), ev("dp_cdr", "fail"), ev("board", "continue"), ev("practice", "pass"), ev("cdr_decision", "refer")]));
  ok("Cdr re-refers → παρ.17β fired", firedCases(r).indexOf("παρ.17β") >= 0, firedCases(r).join());
  eq("… an EXCEPTIONAL progress test is next (outside παρ.7/9)", r.status.code, "dp_ae");
  ok("… and the overlay says so", r.status.notes.some((x) => /Κατ' εξαίρεση/.test(x.text)));
  r = run(seq.concat([ev("dp_ae", "fail"), ev("dp_cdr", "fail"), ev("board", "stop")]));
  eq("board ΚΑΤΑ → stopped", r.status.code, "stopped");
  ok("… cites fail-71", hasCite(r.status.cites, "fail-71"));
}

console.log("\n=== PROBE 3b2 — R4: a checkride is not a member of the 1γ run (defect closed 2026-10-17) ===");
{
  /* BEFORE the fix this exact sequence gave c049 = 2, c059 = 2, fired «1β | 1γ(Α)», verdict dp_cdr (a second referral) */
  let r = run(g4().concat([F("score", { role: "checkride", score: 45 }), ev("dp_ae", "score", { score: 70 }), F("score", { score: 45 })]));
  eq("R4 · checkride 45 → ΑΕ 70 → ordinary 45: c049 = 1 (before: 2)", r.counters.c049.value, 1);
  eq("R4 · … c059 = 1 (before: 2)", r.counters.c059.value, 1);
  ok("R4 · … 1γ does NOT fire — only the 1β (before: «1β | 1γ(Α)»)", firedCases(r).join("|") === "1β", firedCases(r).join("|"));
  eq("R4 · … the student is free with another instructor, not under a second referral (before: dp_cdr)", r.status.code, "free");
  eq("R4 · … other_ip", r.status.next_with, "other_ip");
  r = run(g4().concat([F("lag"), F("score", { role: "checkride", score: 55 }), ev("dp_ae", "score", { score: 70 }), F("lag")]));
  ok("R4 · lag · checkride 55 · ΑΕ 70 · lag → no 1γ (before: 1γ(Β))", !firedCases(r).some((c) => /1γ/.test(c)) && r.counters.c059.value === 2, firedCases(r).join("|") + " c059=" + r.counters.c059.value);
  r = run(g4().concat([F("score", { role: "checkride", score: 45 }), ev("dp_ae", "score", { score: 70 }), F("score", { score: 45 }), F("score", { score: 45 })]));
  ok("R4 · two ordinary 0-49 AFTER the cleared checkride still fire 1γ(Α) on their own", firedCases(r).indexOf("1γ(Α)") >= 0, firedCases(r).join("|"));
  r = run(g4().concat([F("score", { role: "checkride", score: 45 }), ev("dp_ae", "score", { score: 70 }), F("pass")]));
  eq("R4 · 1δ untouched: the checkride is one 0-59 flight of the stage (totalFl.bad = 1)", r.counters.totalFl.bad, 1);
  ok("R4 · the tree carries the ruling with both sides and the quote", (() => { const n = BT.nodeOf("g_ckr"); return !!n && n.node.rulings.some((x) => x.by === "ο ιδιοκτήτης" && /δοκιμής προόδου/.test(x.quote)) && n.node.unresolved.some((u) => /ΑΠΟΦΑΝΣΗ ΙΔΙΟΚΤΗΤΗ 17\/10\/2026/.test(u) && /§32β\(2\)/.test(u) && /ΔΕΝ εξαιρεί/.test(u)) && n.node.cites.some((c) => c.requirement_id === "fail-44"); })());
}

console.log("\n=== PROBE 3b3 — R5: the Δκτής' occasions are set by the ΑΕ grade; R6: the aptitude exam consumes no rung ===");
{
  const seq = g4().concat([F("lag"), F("lag"), F("lag")]);
  let r = run(seq.concat([ev("dp_ae", "score", { score: 70 }), F("pass"), F("lag"), F("lag"), F("lag")]));
  eq("R5 · ΑΕ passed → next referral goes to the Δκτής", r.status.code, "dp_cdr");
  ok("R5 · … and the verdict says the Δκτής has ONE occasion because the ΑΕ test was ≥60 %", r.status.notes.some((x) => /ΜΙΑ μόνο ευκαιρία/.test(x.text) && /≥60%/.test(x.text) && /1η\/1/.test(x.text) && hasCite(x.cites, "fail-26")));
  ok("R5 · … and that a Δκτής failure is always the Board (παρ.8β)", r.status.notes.some((x) => /Συμβούλιο ΠΑΝΤΑ/.test(x.text) && hasCite(x.cites, "fail-25")));
  r = run(seq.concat([ev("dp_ae", "score", { score: 70 }), F("pass"), F("lag"), F("lag"), F("lag"), ev("dp_cdr", "score", { score: 65 }), F("pass"), F("lag"), F("lag"), F("lag")]));
  eq("R5 · ΑΕ passed, Δκτής passed once → a third referral is Board without a progress test", r.status.code, "board");
  r = run(seq.concat([ev("dp_ae", "fail")]));
  ok("R5 · ΑΕ failed → the Δκτής has TWO occasions (1η/2)", r.status.code === "dp_cdr" && r.status.notes.some((x) => /ΔΥΟ ευκαιρίες/.test(x.text) && /1η\/2/.test(x.text)));
  r = run(seq.concat([ev("dp_ae", "fail"), ev("dp_cdr", "fail")]));
  eq("R5 · Δκτής failure → Board, no second chance after a Δκτής failure", r.status.code, "board");
  ok("R5 · the ladder node names the surprising branch", /ΜΙΑ μόνο ευκαιρία/.test(BT.nodeOf("dp_ae_pass").node.label) && BT.nodeOf("dp_ae_pass").node.cites.some((c) => c.requirement_id === "fail-26"));
  ok("R5 · thresholds.dp carries the state machine", (() => { const m = TREES.thresholds.dp.state_machine; return !!m && /μία φορά/.test(m.ae) && /ΠΑΝΤΑ/.test(m.cdr_fail) && /ΜΙΑ· /.test(m.cdr_occasions) && /ΔΥΟ/.test(m.cdr_occasions); })());
  /* R6 */
  r = run([F("lag", { role: "last", cat: "formation" }), ev("apt", "fail", { cat: "formation" })]);
  eq("R6 · a failed aptitude exam opens the ladder at the ΑΕ — clean", r.status.code, "dp_ae");
  eq("R6 · … and consumed no ΑΕ occasion (dpUsed.ae = 0)", r.counters.dpUsed.ae, 0);
  ok("R6 · … the verdict names the ΑΕ, not the evaluator, as next", r.status.next_with === "ae" && !/Αξιολογητή/.test(r.status.title));
  r = run([F("lag", { role: "last", cat: "formation" }), ev("apt", "pass", { cat: "formation" }), F("lag", { role: "last", cat: "instrument" }), ev("apt", "pass", { cat: "instrument" })]);
  ok("R6 · two aptitude exams in Phase II: no cap, both resolve, no ladder touched", r.status.code === "free" && r.counters.dpUsed.ae === 0 && r.counters.dpUsed.cdr === 0);
  ok("R6 · the section_last tree says so, with the Phase III/IV contrast", (() => { const n = BT.nodeOf("l_apt").node; return /δεν καταναλώνει/.test(n.label) && /§80β\(4\)/.test(n.condition) && /§81α\(4\)/.test(n.condition) && n.rulings.some((x) => x.by === "ο ιδιοκτήτης"); })());
}

console.log("\n=== PROBE 3c — R7: the παρ.7/9 budget, now the engine's (second referral in the same stage) ===");
{
  /* BEFORE R7 these read «engine says ae / overlay says cdr»; the overlay is
     gone and the engine itself opens the κρίση at the Δκτής. */
  const first = g4().concat([F("lag"), F("lag"), F("lag"), ev("dp_ae", "score", { score: 70 })]);
  let r = run(first);
  eq("after dp_ae 70 % → free with another instructor", r.status.code, "free");
  eq("… other_ip", r.status.next_with, "other_ip");
  r = run(first.concat([F("pass"), F("lag"), F("lag"), F("lag")]));
  ok("second 1γ fires", firedCases(r).filter((c) => /1γ/.test(c)).length === 2);
  eq("R7 · the ENGINE opens it at the Δκτής (was: engine ae, overlay cdr)", r.stage.engine, "cdr");
  eq("R7 · … effective = engine (no overlay left)", r.stage.effective, "cdr");
  eq("R7 · … rung cdr_par7", r.stage.rung, "cdr_par7");
  eq("→ verdict: Cdr", r.status.code, "dp_cdr");
  ok("… the note names παρ.7, «ανά ΣΤΑΔΙΟ», and cites fail-24", r.status.notes.some((x) => /παρ\.7/.test(x.text) && /ανά ΣΤΑΔΙΟ/.test(x.text) && hasCite(x.cites, "fail-24")));
  ok("… and the R5 note says ONE occasion because the ΑΕ test was ≥60 % (1η/1)", r.status.notes.some((x) => /ΜΙΑ μόνο ευκαιρία/.test(x.text) && /1η\/1/.test(x.text)));
  r = run(first.concat([F("pass"), F("lag"), F("lag"), F("lag"), ev("dp_cdr", "score", { score: 65 }), F("pass"), F("lag"), F("lag"), F("lag")]));
  eq("third referral: Cdr exhausted (1 allowed, AE was ≥60) → board without a progress test", r.stage.engine, "board");
  eq("R7 · … rung board_par9", r.stage.rung, "board_par9");
  eq("→ verdict: Board", r.status.code, "board");
  ok("R7 · … the title and the note say «χωρίς πτήσεις Δοκιμής Προόδου», citing fail-26", /ΧΩΡΙΣ πτήσεις Δοκιμής Προόδου/.test(r.status.title) && r.status.notes.some((x) => /ΧΩΡΙΣ ΠΤΗΣΕΙΣ ΔΟΚΙΜΗΣ ΠΡΟΟΔΟΥ/.test(x.text) && hasCite(x.cites, "fail-26")));
  /* AE failed (<60) → the Cdr has TWO judgements */
  const two = g4().concat([F("lag"), F("lag"), F("lag"), ev("dp_ae", "fail"), ev("dp_cdr", "score", { score: 61 }), F("pass"), F("lag"), F("lag"), F("lag")]);
  r = run(two);
  eq("AE <60 then Cdr pass; new referral → Cdr again (2nd of 2)", r.stage.engine, "cdr");
  ok("R7 · … counters: Δκτής 1 of budget 2", r.counters.dpUsed.cdr === 1 && r.counters.dpUsed.budget === 2 && r.counters.dpUsed.aePassed === false);
  r = run(two.concat([ev("dp_cdr", "score", { score: 62 }), F("pass"), F("lag"), F("lag"), F("lag")]));
  eq("… after the 2nd Cdr judgement the next referral is Board directly", r.stage.engine, "board");

  /* THE OWNER'S CASE through the sandbox: ΑΕ passed earlier → last sortie
     fails → Εξέταση Καταλληλότητας fails → Δκτής, never a second ΑΕ */
  r = run([F("pass"), F("score", { role: "checkride", score: 55 }), ev("dp_ae", "score", { score: 72 }), F("lag", { role: "last", cat: "formation" }), ev("apt", "fail", { cat: "formation" })]);
  ok("R7 · OWNER'S CASE: §30ζ→ΠΔ fired", firedCases(r).indexOf("§30ζ→ΠΔ") >= 0, firedCases(r).join("|"));
  eq("R7 · … the ladder opens at the Δκτής", r.status.code, "dp_cdr");
  eq("R7 · … engine rung cdr_par7", r.stage.rung, "cdr_par7");
  ok("R7 · … the verdict names παρ.7 and the fact that the ΑΕ already judged (≥60%)", r.status.notes.some((x) => /παρ\.7/.test(x.text) && /ήδη/.test(x.text) && /≥60%/.test(x.text)));
  eq("R7 · … and the ΑΕ's right is shown spent (1/1)", r.counters.dpUsed.ae, 1);
  r = run([F("pass"), F("score", { role: "checkride", score: 55 }), ev("dp_ae", "score", { score: 72 }), F("lag", { role: "last", cat: "formation" }), ev("apt", "fail", { cat: "formation" }), ev("dp_cdr", "score", { score: 70 }), F("lag", { role: "last", cat: "instrument" }), ev("apt", "fail", { cat: "instrument" })]);
  eq("R7 · … then a second failed Εξέταση Καταλληλότητας in ANOTHER category: Board — per ΣΤΑΔΙΟ, not per category", r.status.code, "board");
  eq("R7 · … rung board_par9", r.stage.rung, "board_par9");
  ok("R7 · the ladder node records the ruling and the unit of accounting", (() => { const n = BT.nodeOf("dp_exhausted").node; return n.rulings.some((x) => x.by === "ο ιδιοκτήτης" && /ανά στάδιο/.test(x.quote)) && n.engine === "schedconsq" && n.unresolved.length === 0; })());
  ok("R7 · the drafting doubt on παρ.9 stays open on dp_cdr, labelled as such", BT.nodeOf("dp_cdr").node.unresolved.some((u) => /ΣΥΝΤΑΚΤΙΚΗ ΑΠΟΡΙΑ/.test(u) && /παραμένει ανοικτή/.test(u)));
  ok("R7 · no overlay left in the module", !/effectiveStage/.test(require("fs").readFileSync(require("path").join(H.ROOT, "app", "boardtrees.js"), "utf8")));
}

console.log("\n=== PROBE 3d — 1β checkride, nausea, 1δ ===");
{
  let r = run([F("pass"), F("score", { role: "checkride", score: 59 })]);
  ok("checkride 59 % fires 1β", firedCases(r).indexOf("1β") >= 0, firedCases(r).join());
  eq("→ dp_ae", r.status.code, "dp_ae");
  ok("… cites fail-16", hasCite(r.fired[0].cites, "fail-16"));
  r = run([F("pass"), F("score", { role: "checkride", score: 59, nausea: "pre_ok" })]);
  ok("nausea on a checkride still fires 1β (παρ.2 covers 1γ/1δ only)", firedCases(r).indexOf("1β") >= 0);
  ok("… and the row says so, citing fail-57", r.timeline[1].notes.some((x) => /1β ΔΕΝ εξαιρείται/.test(x.text) && hasCite(x.cites, "fail-57")));
  r = run([F("pass"), F("score", { role: "checkride", score: 60 })]);
  ok("checkride 60 % fires nothing", r.fired.length === 0);
  /* nausea exemption on 1γ */
  r = run(g4().concat([F("lag"), F("pass", { nausea: "pre_ok" }), F("lag")]));
  ok("lag · exempt-nausea · lag → no 1γ (the nausea flight is skipped, run = 2)", !firedCases(r).some((c) => /1γ/.test(c)), firedCases(r).join());
  eq("… nausea flight graded 59 % by default", r.timeline[5].band, "lag 59%");
  r = run(g4().concat([F("lag"), F("pass", { nausea: "pre_bad" }), F("lag")]));
  ok("lag · non-exempt nausea · lag → 1γ(Β) fires", firedCases(r).indexOf("1γ(Β)") >= 0, firedCases(r).join());
  /* R1 (owner, 2026-10-17): the 59 % airsickness sortie IS «Σχεδόν Καλώς»
     (3-01 §29δ: ΣΚ = 50-59) → ΠΔ παρ.2 exempts it, when the other limbs hold */
  r = run(g4().concat([F("lag"), F("lag"), F("pass", { nausea: "pre_ok" }), F("lag")]));
  ok("R1 · lag·lag·nausea59(pre ok)·lag → the exempt sortie is SKIPPED, not a break: the three lags around it complete the run → 1γ(Β)", firedCases(r).indexOf("1γ(Β)") >= 0, firedCases(r).join());
  r = run(g4().concat([F("lag"), F("lag"), F("pass", { nausea: "pre_ok" })]));
  ok("R1 · lag·lag·nausea59(pre ok) → c059 stays 2: the nausea sortie adds nothing", r.counters.c059.value === 2 && r.fired.length === 0, String(r.counters.c059.value));
  r = run(g4().concat([F("lag"), F("pass", { nausea: "pre_ok" }), F("pass")]));
  ok("R1 · the sandbox row cites fail-01 (§29δ) beside fail-52 and fail-57", r.timeline[5].notes.some((x) => hasCite(x.cites, "fail-01") && hasCite(x.cites, "fail-52") && hasCite(x.cites, "fail-57")));
  ok("R1 · … and names the bridge «ΣΚ» Σχεδόν Καλώς", r.timeline[5].notes.some((x) => /Σχεδόν Καλώς/.test(x.text) && /§29δ/.test(x.text) && /ΔΕΝ υπολογίζεται/.test(x.text)));
  eq("R1 · the exempt sortie leaves the 1δ numerator", r.counters.totalFl.bad, 1);
  r = run(g4().concat([F("lag"), F("score", { score: 45, nausea: "pre_ok" }), F("lag")]));
  ok("R1 · a nausea sortie graded ΑΠΟΤΥΧΙΑ (45 %) is NOT «Σχεδόν Καλώς» → counts → 1γ(Β) fires", firedCases(r).indexOf("1γ(Β)") >= 0, firedCases(r).join());
  ok("R1 · … and the row says why (παρ.2 requires Σχεδόν Καλώς)", r.timeline[5].notes.some((x) => /όχι «Σχεδόν Καλώς»/.test(x.text)));
  r = run(g4().concat([F("lag"), F("pass", { nausea: "pre_bad" }), F("lag")]));
  ok("R1 · the limb «before the onset Καλώς+» still binds: pre_bad counts → 1γ(Β)", firedCases(r).indexOf("1γ(Β)") >= 0, firedCases(r).join());
  r = run([F("pass", { nausea: "pre_ok" }), F("pass", { nausea: "pre_ok" })]);
  ok("2 consecutive nausea → KEPE (3)", r.timeline[1].notes.some((x) => /ΚΕΠΕ/.test(x.text) && /ΑΕΡΟΝΑΥΤΙΕΣ/.test(x.text)));
  ok("… a single nausea does NOT enter KEPE via (1)", !r.timeline[0].notes.some((x) => /→ ΚΕΠΕ/.test(x.text)));
  /* 1δ executed vs planned */
  r = run([F("pass"), F("pass"), F("pass"), F("lag")], { denom_1d: "executed" });
  ok("1 of 4 executed = 25 % → 1δ(ΣΥΝΟΛΟ) fires on the executed reading", firedCases(r).indexOf("1δ(ΣΥΝΟΛΟ)") >= 0, firedCases(r).join());
  ok("… and says the denominator is the executed count", /εκτελεσθείσες/.test(r.fired[0].text));
  r = run([F("pass"), F("pass"), F("pass"), F("lag")], { denom_1d: "planned" });
  ok("… and does NOT on the planned-85 reading (1/85)", !firedCases(r).some((c) => /1δ/.test(c)), firedCases(r).join());
  eq("… plannedPct reported", r.counters.plannedPct, 1.2);
  /* the first ΜΟΝΟΣ closes the Προ-ΜΟΝΟΣ phase first (R3: otherwise the 6th
     low grade of the 15-sortie phase fires 1δ(ΠΡΟ ΜΟΝΟΣ) before the stage's
     17th) — this probe exercises the 20 % stage criterion alone */
  const many = [F("pass", { role: "first_solo" })];
  for (let i = 0; i < 17; i++) { many.push(F("lag")); many.push(F("pass")); many.push(F("pass")); many.push(F("pass")); }
  r = run(many, { denom_1d: "planned" });
  ok("17 bad on the planned reading fires 1δ(ΣΥΝΟΛΟ) (17/85 = 20 %)", firedCases(r).indexOf("1δ(ΣΥΝΟΛΟ)") >= 0, firedCases(r).join());
  ok("… exactly at the 17th lag (event 66)", r.fired[0].idx === 65, String(r.fired[0] && r.fired[0].idx));
  ok("… and 1γ never fired (lags were never consecutive)", !firedCases(r).some((c) => /1γ/.test(c)));
  ok("… and 1δ(ΠΡΟ ΜΟΝΟΣ) never fired (the phase was already closed)", !firedCases(r).some((c) => /ΠΡΟ ΜΟΝΟΣ/.test(c)));
  r = run(many.slice(0, 65), { denom_1d: "planned" });
  ok("16 bad → nothing", r.fired.length === 0, firedCases(r).join());
  r = run(many.slice(1), { denom_1d: "planned" });
  ok("R3 · the same 17 lags WITHOUT a ΜΟΝΟΣ fire 1δ(ΠΡΟ ΜΟΝΟΣ) at the 6th (6/15 = 40 %) — event 21", firedCases(r)[0] === "1δ(ΠΡΟ ΜΟΝΟΣ)" && r.fired[0].idx === 20, firedCases(r).join() + " @" + (r.fired[0] && r.fired[0].idx));
  eq("default denominator is planned (owner ruling 2026-10-17)", run([F("lag")]).opts.denom_1d, "planned");
  ok("… the executed reading is still reachable behind the switch", run([F("pass"), F("pass"), F("pass"), F("lag")], { denom_1d: "executed" }).fired.length === 1);
  /* R3 (owner, 2026-10-17): Προ-ΜΟΝΟΣ = 15 printed sorties → 40 % = 6 */
  const five = [F("lag"), F("pass"), F("lag"), F("pass"), F("lag"), F("pass"), F("lag"), F("pass"), F("lag")];        // 5 lags, never consecutive
  r = run(five);
  ok("R3 · 5 low grades of 15 (33 %) → no 1δ(ΠΡΟ ΜΟΝΟΣ)", !firedCases(r).some((c) => /1δ/.test(c)), firedCases(r).join());
  eq("R3 · … plannedPrePct 33.3", r.counters.plannedPrePct, 33.3);
  r = run(five.concat([F("pass"), F("lag")]));
  ok("R3 · the 6th low grade (6/15 = 40 %) fires 1δ(ΠΡΟ ΜΟΝΟΣ) on the printed programme", firedCases(r).indexOf("1δ(ΠΡΟ ΜΟΝΟΣ)") >= 0, firedCases(r).join());
  ok("R3 · … the fired line names 15, the MIF table and the owner's ruling", /15 τυπωμένες/.test(r.fired[0].text) && /MIF/.test(r.fired[0].text) && hasCite(r.fired[0].cites, "fail-77") && /ιδιοκτήτη/.test(r.fired[0].cites[0].why));
  ok("R3 · … and never 1γ (lags were never consecutive)", !firedCases(r).some((c) => /1γ/.test(c)));
  r = run([F("pass", { role: "first_solo" })].concat(five, [F("pass"), F("lag")]));
  ok("R3 · after the first ΜΟΝΟΣ the Προ-ΜΟΝΟΣ phase is closed — the same 6 low grades fire nothing", !firedCases(r).some((c) => /1δ\(ΠΡΟ/.test(c)), firedCases(r).join());
  eq("R3 · counters expose the printed denominators", r.counters.preSoloSorties + "/" + r.counters.plannedSorties, "15/85");
}

console.log("\n=== PROBE 3e — F/S: the 3-attempt ladder and ΠΔ 1ε ===");
{
  let r = run([FS("lag", { role: "last" })]);
  eq("last-of-section F/S lag → ladder 1/3", r.status.code, "fs_ladder");
  eq("… own instructor", r.status.next_with, "own_ip");
  ok("… cites fail-11", hasCite(r.status.cites, "fail-11"));
  r = run([FS("lag", { role: "last" }), FS("fail", { role: "last" })]);
  ok("2nd fail → 2/3, wait 2 days", /2 ημερολογιακές/.test(r.status.next));
  r = run([FS("lag", { role: "last" }), FS("fail", { role: "last" }), FS("lag", { role: "last" })]);
  ok("3rd fail → §30στ→ΠΔ fired", firedCases(r).indexOf("§30στ→ΠΔ") >= 0, firedCases(r).join());
  eq("→ dp_ae in the simulator", r.status.code, "dp_ae");
  ok("… title says εξομοιωτή", /εξομοιωτή/.test(r.status.title));
  const g3 = [FS("pass"), FS("pass"), FS("pass")];
  r = run(g3.concat([FS("lag"), FS("lag"), FS("lag")]));
  ok("3 consecutive F/S 0-59 after 3 grace → 1ε(αα)", firedCases(r).indexOf("1ε(αα)") >= 0, firedCases(r).join());
  ok("… cites fail-40", hasCite(r.fired[0].cites, "fail-40"));
  r = run([FS("lag"), FS("lag"), FS("lag")]);
  ok("3 of 3 inside grace: (αα) silent but (αβ) fires (3 ≥ floor, 100 % ≥ 20 %)", firedCases(r).indexOf("1ε(αβ)") >= 0 && firedCases(r).indexOf("1ε(αα)") < 0, firedCases(r).join());
  r = run([FS("lag"), FS("pass"), FS("pass"), FS("pass"), FS("pass"), FS("lag"), FS("pass"), FS("pass"), FS("pass"), FS("pass"), FS("pass"), FS("pass")]);
  ok("2 of 12 = 16.7 %, under floor and under 20 % → nothing", !firedCases(r).some((c) => /1ε/.test(c)), firedCases(r).join());
}

console.log("\n=== PROBE 3f — §30ζ last sortie of a section · §56 first solo ===");
{
  let r = run([F("lag", { role: "last", cat: "formation" })]);
  eq("→ aptitude exam pending", r.status.code, "apt");
  eq("… with the evaluator", r.status.next_with, "evaluator");
  ok("… cites fail-12", hasCite(r.status.cites, "fail-12"));
  r = run([F("lag", { role: "last", cat: "formation" }), ev("apt", "pass", { cat: "formation" })]);
  eq("apt pass → free", r.status.code, "free");
  r = run([F("lag", { role: "last", cat: "formation" }), ev("apt", "fail", { cat: "formation" })]);
  ok("apt fail → §30ζ→ΠΔ", firedCases(r).indexOf("§30ζ→ΠΔ") >= 0, firedCases(r).join());
  eq("→ dp_ae", r.status.code, "dp_ae");
  r = run([F("fail", { role: "first_solo" })]);
  eq("first solo fail → apt with solo profile", r.status.code, "apt");
  ok("… title says ΜΟΝΟΣ", /ΜΟΝΟΣ/.test(r.status.title));
  ok("… cites fail-19", hasCite(r.status.cites, "fail-19"));
}

console.log("\n=== PROBE 3g — 1στ written: the fastest road to the Board ===");
{
  let r = run([ev("written", "fail")]);
  ok("1st written fail: KEPE + ΦΜΠ, no referral", r.fired.length === 0 && r.timeline[0].notes.some((x) => /ΚΕΠΕ/.test(x.text)) && r.timeline[0].notes.some((x) => hasCite(x.cites, "fail-83")));
  eq("… still free", r.status.code, "free");
  r = run([ev("written", "fail"), ev("written", "score", { score: 70 })]);
  ok("2nd consecutive (70 % < 80) fires 1στ", firedCases(r).indexOf("1στ") >= 0, firedCases(r).join());
  eq("→ Board DIRECTLY", r.status.code, "board");
  eq("engine stage is board (referral stage:'board')", r.stage.engine, "board");
  ok("… cites fail-32 and fail-62", hasCite(r.fired[0].cites, "fail-32") && hasCite(r.fired[0].cites, "fail-62"));
  r = run([ev("written", "fail"), ev("written", "pass"), ev("written", "fail")]);
  ok("a pass between → no 1στ", !firedCases(r).some((c) => c === "1στ"), firedCases(r).join());
  r = run([ev("written", "fail"), ev("written", "fail")]);
  ok("KEPE ground entries 1 of 2 (second trigger while already in KEPE)", r.counters.kepe.some((k) => k.key === "ground_exam" && k.entries === 1 && k.cap === 2));
  r = run([ev("stage_exam", "fail")]);
  ok("stage exam fail → repeat next day", r.timeline[0].notes.some((x) => /ΕΠΟΜΕΝΗ ημέρα/.test(x.text) && hasCite(x.cites, "fail-33")));
  r = run([ev("stage_exam", "fail"), ev("stage_exam", "fail")]);
  ok("2nd stage-exam fail: unregulated note AND 1στ by the letter of the ΠΔ", r.timeline[1].notes.some((x) => /ΔΕΝ ΡΥΘΜΙΖΕΤΑΙ/.test(x.text)) && firedCases(r).indexOf("1στ") >= 0);
  r = run([ev("blind", "score", { score: 85 })]);
  ok("blind 85 % (<90) → repeat next day, cites fail-35", r.timeline[0].notes.some((x) => /επανάληψη/.test(x.text) && hasCite(x.cites, "fail-35")));
  r = run([ev("blind", "score", { score: 85 }), ev("blind", "score", { score: 80 })]);
  ok("2nd blind fail → unregulated", r.timeline[1].notes.some((x) => /ΔΕΝ ΡΥΘΜΙΖΕΤΑΙ/.test(x.text)));
  r = run([ev("blind", "score", { score: 90 })]);
  ok("blind 90 % passes", /ΕΠΙΤΥΧΩΝ/.test(r.timeline[0].band));
}

console.log("\n=== PROBE 3h — 1ζ oral: KEPE at 2/4, referral at 4/8, γραπτή → επανεξέταση → Συμβούλιο (one ladder) ===");
{
  const o = (res) => ev("oral", res);
  let r = run([o("fail"), o("fail")]);
  ok("2 consecutive → KEPE", r.timeline[1].notes.some((x) => /→ ΚΕΠΕ/.test(x.text)));
  ok("… no referral yet", r.fired.length === 0);
  r = run([o("fail"), o("pass"), o("fail"), o("pass"), o("fail"), o("pass"), o("fail")]);
  ok("4 non-consecutive → KEPE (not referral)", r.timeline[6].notes.some((x) => /→ ΚΕΠΕ|ήδη σε ΚΕΠΕ/.test(x.text)) && r.fired.length === 0);
  r = run([o("fail"), o("fail"), o("fail")]);
  ok("3 consecutive: tolerated", r.fired.length === 0);
  r = run([o("fail"), o("fail"), o("fail"), o("fail")]);
  ok("4th consecutive fires 1ζ", firedCases(r).indexOf("1ζ") >= 0, firedCases(r).join());
  eq("→ written exam by the AE pending", r.status.code, "oral_exam");
  eq("… not a flight", r.status.next_with, "ae_exam");
  ok("… cites fail-39 and fail-37", hasCite(r.status.cites, "fail-39") && hasCite(r.status.cites, "fail-37"));
  const eight = [o("fail"), o("pass"), o("fail"), o("pass"), o("fail"), o("pass"), o("fail"), o("pass"), o("fail"), o("pass"), o("fail"), o("pass"), o("fail"), o("pass"), o("fail")];
  r = run(eight);
  ok("8 non-consecutive fires 1ζ", firedCases(r).indexOf("1ζ") >= 0, firedCases(r).join());
  eq("… oral total 8", r.counters.oral.total, 8);
  const four = [o("fail"), o("fail"), o("fail"), o("fail")];
  r = run(four.concat([ev("ae_written", "pass")]));
  eq("AE exam pass → free", r.status.code, "free");
  /* ONE LADDER (owner, 2026-10-17): γραπτή → fail → επανεξέταση (3-01 §58η =
     ΠΔ παρ.4) → fail → Συμβούλιο. There is no rule switch any more. */
  r = run(four.concat([ev("ae_written", "fail")]));
  ok("1st written fail → re-examination, not the Board", firedCases(r).indexOf("1ζ→επανεξέταση") >= 0 && r.status.code === "oral_exam", firedCases(r).join() + " " + r.status.code);
  ok("… the fired line cites BOTH fail-38 (timing, same subjects) and fail-39 (examiner, syllabus, outcome)", hasCite(r.fired[r.fired.length - 1].cites, "fail-38") && hasCite(r.fired[r.fired.length - 1].cites, "fail-39"));
  ok("… and says they are one ladder, not a contradiction", /μία κλίμακα/.test(r.fired[r.fired.length - 1].text) && !/ΑΝΤΙΦΑΣΗ/.test(r.fired[r.fired.length - 1].text));
  ok("… the verdict: re-exam by the ΑΕ on all professional subjects, after 2 days, same subjects", /ΕΠΑΝΕΞΕΤΑΣΗ/.test(r.status.title) && /ΑΕ/.test(r.status.next) && /όλα τα επαγγελματικά θέματα/.test(r.status.next) && /2 ημερολογιακές/.test(r.status.next) && /ίδια αντικείμενα/.test(r.status.next));
  ok("… and a further failure is the Board", /ΣΥΜΒΟΥΛΙΟ/.test(r.status.if_fail));
  ok("… the verdict note quotes the owner's reconciliation", r.status.notes.some((x) => /Αλλιώς θα πήγαιναν οι μισοί/.test(x.text)));
  ok("… and keeps the three open points visible (examiner, syllabus, pass mark)", r.status.notes.some((x) => /εξεταστής/.test(x.text) && /ύλη/.test(x.text) && /κατώφλι/.test(x.text)));
  const r1 = run(four);
  ok("before the exam, the verdict already names the re-examination as the next rung", /επανεξέταση/.test(r1.status.if_fail) && /§58η = ΠΔ παρ\.4/.test(r1.status.if_fail) && !/ΑΝΤΙΦΑΣΗ/.test(r1.status.if_fail));
  r = run(four.concat([ev("ae_written", "fail"), ev("ae_written", "fail")]));
  ok("re-exam fail → Board", firedCases(r).indexOf("1ζ→Συμβούλιο") >= 0 && r.status.code === "board", firedCases(r).join() + " " + r.status.code);
  ok("… citing fail-39 (παρ.4β) and fail-38 (νέα ΑΠΟΤΥΧΙΑ → ΠΔ)", hasCite(r.fired[r.fired.length - 1].cites, "fail-39") && hasCite(r.fired[r.fired.length - 1].cites, "fail-38"));
  ok("a rule_1z option is ignored — there is one ladder", run(four.concat([ev("ae_written", "fail")]), { rule_1z: "pd" }).status.code === "oral_exam" && !("rule_1z" in run(four).opts));
  ok("nothing in the module still frames 1ζ as ΠΔ-vs-3-01", !/ΠΔ vs 3-01|rule_1z|bt-rule1z/.test(require("fs").readFileSync(require("path").join(H.ROOT, "app", "boardtrees.js"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "")));
  r = run(four.concat([ev("ae_written", "pass")]).concat(four));
  ok("second 1ζ in the same stage → Board directly (fail-24)", firedCases(r).indexOf("1ζ (2η)") >= 0 && r.status.code === "board", firedCases(r).join());
  r = run(four.concat([ev("ae_written", "fail"), ev("ae_written", "pass")]).concat(four));
  ok("… also when the first referral closed on a passed re-examination", firedCases(r).indexOf("1ζ (2η)") >= 0 && r.status.code === "board", firedCases(r).join());
  ok("… cites fail-24", hasCite(r.fired[r.fired.length - 1].cites, "fail-24"));
}

console.log("\n=== PROBE 3i — direct-Board incidents and the ΑΑΣ ===");
{
  let r = run([ev("incident", null, { kind: "1a" })]);
  ok("1α → referral to the ladder", firedCases(r).indexOf("1α") >= 0 && r.status.code === "dp_ae");
  ok("… cites fail-75", hasCite(r.fired[0].cites, "fail-75"));
  for (const k of [["1h", "1η", "fail-78"], ["1th", "1θ", "fail-79"], ["1i", "1ι", "fail-80"]]) {
    r = run([ev("incident", null, { kind: k[0] })]);
    ok(k[1] + " → Board directly", firedCases(r).indexOf(k[1]) >= 0 && r.status.code === "board", firedCases(r).join() + " " + r.status.code);
    ok(k[1] + " cites " + k[2] + " and fail-62", hasCite(r.fired[0].cites, k[2]) && hasCite(r.fired[0].cites, "fail-62"));
    eq(k[1] + " · nobody flies with him", r.status.next_with, "none");
  }
  r = run([ev("incident", null, { kind: "1h" })]);
  ok("1η names the lettering shift (§58θ)", /§58θ/.test(r.fired[0].text) && hasCite(r.fired[0].cites, "fail-85"));
  r = run([ev("incident", null, { kind: "1h" }), ev("board", "stop")]);
  eq("1η then ΚΑΤΑ → stopped", r.status.code, "stopped");
  r = run([ev("incident", null, { kind: "1ia" })]);
  eq("1ια → ΑΑΣ, not the Board", r.status.code, "aas");
  eq("… actor ΑΑΣ", r.status.next_with, "aas");
  ok("… cites fail-63", hasCite(r.status.cites, "fail-63"));
  ok("… the text says the Board is bypassed", /ΠΑΡΑΚΑΜΠΤΕΤΑΙ/.test(r.fired[0].text));
}

console.log("\n=== PROBE 3j — KEPE entries and caps (fail-44 / fail-45) ===");
{
  let r = run([F("lag", { cat: "instrument" })]);
  ok("instrument lag → KEPE instrument 1/1", r.counters.kepe.some((k) => k.key === "instrument" && k.entries === 1 && k.cap === 1));
  r = run([F("lag", { cat: "instrument" }), ev("kepe_exit"), F("lag", { cat: "instrument" })]);
  ok("after exit a new trigger hits the exhausted cap: unit ruling, no referral", r.timeline[2].notes.some((x) => /εξαντλημένο/.test(x.text) && hasCite(x.cites, "fail-45")));
  ok("… and nothing fired", r.fired.length === 0);
  r = run([F("lag", { cat: "contact" }), ev("kepe_exit"), F("lag", { cat: "contact" })]);
  ok("contact (ΠΡΟΣΑΡΜΟΓΗ) allows 2 entries", r.counters.kepe.some((k) => k.key === "contact" && k.entries === 2 && k.cap === 2));
  r = run([F("score", { score: 63 }), F("score", { score: 61 })]);
  ok("2 consecutive ≤63 (passes) → KEPE (2)", r.timeline[1].notes.some((x) => /≤63%/.test(x.text)));
  r = run([F("score", { score: 63 }), F("score", { score: 64 })]);
  ok("63 then 64 → no KEPE", !r.timeline[1].notes.some((x) => /ΚΕΠΕ/.test(x.text)));
  r = run([ev("kepe_in", null, { cat: "formation" })]);
  ok("instructor recommendation (6) enters KEPE", r.timeline[0].notes.some((x) => /→ ΚΕΠΕ/.test(x.text) && hasCite(x.cites, "fail-44")));
}

console.log("\n=== PROBE 3l — R8(c): airsickness on a Δοκιμή Προόδου does not help the student ===");
{
  const open = [F("pass"), F("score", { role: "checkride", score: 55 })];
  let r = run(open.concat([ev("dp_ae", "pass", { nausea: "pre_ok" })]));
  ok("R8c · nausea on the ΑΕ test → graded 59 % (§35), 0-59 band", /59%/.test(r.timeline[2].band) && /ΑΠΟΤΥΧΩΝ/.test(r.timeline[2].band) && /ΑΕΡΟΝΑΥΤΙΑ/.test(r.timeline[2].band), r.timeline[2].band);
  eq("R8c · … the ladder advances to the Δκτής (παρ.3β) — the rung is not escaped", r.status.code, "dp_cdr");
  const f = r.timeline[2].fired.find((x) => x.case === "ΑΕΡΟΝΑΥΤΙΑ σε ΔΠ");
  ok("R8c · … a fired line explains it", !!f);
  ok("R8c · … (1) παρ.2 does not reach the Δοκιμή — scoping words quoted", !!f && /Κατά τις περιπτώσεις των υποπαραγράφων 1γ και 1δ/.test(f.text) && /παρ\.3 δεν είναι μέσα/.test(f.text) && hasCite(f.cites, "fail-57"));
  ok("R8c · … (2) 59 % (§35, §43) sits inside παρ.3β's 0-59 → next rung", !!f && /59%/.test(f.text) && /§43/.test(f.text) && /παρ\.3β/.test(f.text) && /Διοικητή Μοίρας/.test(f.text) && hasCite(f.cites, "fail-52") && hasCite(f.cites, "fail-88") && hasCite(f.cites, "fail-23"));
  ok("R8c · … (3) the gate is medical: §34 defines, §39 excludes — the doctor decides", !!f && /ιατρική/.test(f.text) && /§34/.test(f.text) && /§39/.test(f.text) && hasCite(f.cites, "fail-51") && hasCite(f.cites, "fail-56"));
  ok("R8c · … the ΑΕ's right is spent by it (an occasion of judgment, παρ.7)", r.counters.dpUsed.ae === 1 && r.counters.dpUsed.budget === 2);
  r = run(open.concat([ev("dp_ae", "fail"), ev("dp_cdr", "pass", { nausea: "pre_ok" })]));
  eq("R8c · nausea on the Δκτής test → 59 % → Board (παρ.8β)", r.status.code, "board");
  ok("R8c · … the line names παρ.8β and the Board", r.timeline[3].fired.some((x) => /παρ\.8β/.test(x.text) && /Συμβούλιο/.test(x.text) && hasCite(x.cites, "fail-25")));
  r = run([F("lag", { role: "last", cat: "formation" }), ev("apt", "pass", { cat: "formation", nausea: "pre_ok" })]);
  eq("R8b · nausea on an Εξέταση Καταλληλότητας → 59 % = ΥΣΤΕΡΗΣΗ εκ νέου → ΠΔ", r.status.code, "dp_ae");
  ok("R8b · … the row says παρ.2 does not reach it", r.timeline[1].notes.some((x) => /παρ\.2/.test(x.text) && /1γ\/1δ μόνο/.test(x.text)));
  r = run(open.concat([ev("dp_ae", "score", { score: 45, nausea: "pre_ok" })]));
  ok("R8c · an explicit lower score with nausea is kept (45 %)", /45%/.test(r.timeline[2].band) && r.status.code === "dp_cdr");
  ok("R8d · the §37 ΑΔΕ gap is recorded on dp_ae without a reading", BT.nodeOf("dp_ae").node.unresolved.some((u) => /ΚΕΝΟ/.test(u) && /δεν επιλέγεται ανάγνωση/.test(u) && /§37/.test(u) && /§71/.test(u) && /παρ\.7/.test(u) && /75%/.test(u)));
}

console.log("\n=== PROBE 3m — R8(a): the gate offers only the legal next events; the state line says where he stands ===");
{
  const A = (r) => BT.allowedEvents(r);
  let g = A(run([]));
  ok("R8a · free: ordinary sorties, exams, ΚΕΠΕ, incidents — no Δοκιμή Προόδου, no Board, no apt", g.allowed.indexOf("flight") >= 0 && g.allowed.indexOf("fs") >= 0 && g.allowed.indexOf("written") >= 0 && g.allowed.indexOf("oral") >= 0 && g.allowed.indexOf("kepe_in") >= 0 && g.allowed.indexOf("incident") >= 0 && ["dp_ae", "dp_cdr", "board", "apt", "practice", "cdr_decision", "ae_written"].every((t) => g.allowed.indexOf(t) < 0), g.allowed.join());
  eq("R8a · … expected: a flight", g.expected, "flight");
  ok("R8a · … state line: free", /Ελεύθερος/.test(g.state));
  g = A(run([F("pass"), F("score", { role: "checkride", score: 55 })]));
  ok("R8a · κρίση at ae: ONLY the ΑΕ test is offered, and it is the expected one", g.allowed.join() === "dp_ae" && g.expected === "dp_ae", g.allowed.join());
  ok("R8a · … state line: εκκρεμεί Δοκιμή Προόδου με τον ΑΕ, cited", /Δοκιμή Προόδου από τον ΑΕ/.test(g.state) && g.cites.some((c) => c.id === "fail-23"));
  g = A(run([F("pass"), F("score", { role: "checkride", score: 55 }), ev("dp_ae", "fail")]));
  ok("R8a · κρίση at cdr: ONLY the Δκτής test", g.allowed.join() === "dp_cdr" && g.expected === "dp_cdr");
  g = A(run([F("pass"), F("score", { role: "checkride", score: 55 }), ev("dp_ae", "score", { score: 70 }), F("lag", { role: "last", cat: "formation" }), ev("apt", "fail", { cat: "formation" })]));
  ok("R8a · ΑΕ spent (R7): the ΑΕ test is NOT offered — the Δκτής is", g.allowed.join() === "dp_cdr", g.allowed.join());
  g = A(run([F("pass"), F("score", { role: "checkride", score: 55 }), ev("dp_ae", "fail"), ev("dp_cdr", "fail")]));
  ok("R8a · κρίση at board: ONLY the Board — nothing that flies", g.allowed.join() === "board" && g.expected === "board");
  g = A(run([F("pass"), F("score", { role: "checkride", score: 55 }), ev("dp_ae", "score", { score: 70 }), ev("dp_cdr", "score", { score: 70 }), F("score", { role: "checkride", score: 50 })]));
  ok("R8a · ladder exhausted: ONLY the Board, and the state line says «χωρίς πτήσεις Δοκιμής Προόδου»", g.allowed.join() === "board" && /ΧΩΡΙΣ πτήσεις Δοκιμής Προόδου/.test(g.state), g.allowed.join() + " / " + g.state);
  g = A(run([ev("incident", null, { kind: "1h" }), ev("board", "stop")]));
  ok("R8a · stopped: nothing is offered", g.allowed.length === 0 && g.expected === null);
  g = A(run([ev("incident", null, { kind: "1ia" })]));
  ok("R8a · ΑΑΣ: nothing is offered", g.allowed.length === 0);
  g = A(run([F("lag", { role: "last", cat: "formation" })]));
  ok("R8a · apt pending: the Εξέταση Καταλληλότητας is expected; ordinary sorties still offered; no Δοκιμή Προόδου", g.expected === "apt" && g.allowed.indexOf("flight") >= 0 && g.allowed.indexOf("dp_ae") < 0);
  g = A(run([ev("oral", "fail"), ev("oral", "fail"), ev("oral", "fail"), ev("oral", "fail")]));
  ok("R8a · 1ζ referral: ONLY the written exam", g.allowed.join() === "ae_written");
  g = A(run([F("pass"), F("score", { role: "checkride", score: 55 }), ev("dp_ae", "fail"), ev("dp_cdr", "fail"), ev("board", "continue")]));
  ok("R8a · after ΥΠΕΡ: only the practice flight; then only the Δκτής' decision", g.allowed.join() === "practice" && A(run([F("pass"), F("score", { role: "checkride", score: 55 }), ev("dp_ae", "fail"), ev("dp_cdr", "fail"), ev("board", "continue"), ev("practice", "pass")])).allowed.join() === "cdr_decision");
  ok("R8a · the gate narrows, the engine judges: an off-gate event handed straight to evaluate() is still processed and told to the user", run([ev("dp_ae", "pass")]).timeline[0].notes.some((x) => /αγνοείται/.test(x.text)));
  const src = require("fs").readFileSync(require("path").join(H.ROOT, "app", "boardtrees.js"), "utf8");
  ok("R8a · the form has no disabled options (hidden, not greyed)", !/<option[^>]*disabled/.test(src));
}

console.log("\n=== PROBE 3k — every fired line and every verdict cite resolves in the trees' cite index ===");
{
  let total = 0, missing = [];
  for (const p of BT.PRESETS) {
    const r = run(p.events);
    const all = [].concat(r.status.cites);
    r.fired.forEach((f) => f.cites.forEach((c) => all.push(c)));
    r.timeline.forEach((row) => row.notes.forEach((x) => x.cites.forEach((c) => all.push(c))));
    for (const c of all) { total++; if (!BT.citeOf(c.id)) missing.push(c.id); }
  }
  ok("presets run and cite " + total + " times", total > 60);
  ok("every cite id has verbatim + ref in the index", missing.length === 0, missing.join(","));
  ok("every preset leaves a verdict", BT.PRESETS.every((p) => run(p.events).status.title.length > 0));
}
