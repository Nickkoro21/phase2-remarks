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

console.log("\n=== PROBE 3c — ΠΔ παρ.7/9 overlay: second referral in the same stage ===");
{
  /* AE passed (≥60) once → a new referral goes to the Cdr, who may judge ONCE */
  const first = g4().concat([F("lag"), F("lag"), F("lag"), ev("dp_ae", "score", { score: 70 })]);
  let r = run(first);
  eq("after dp_ae 70 % → free with another instructor", r.status.code, "free");
  eq("… other_ip", r.status.next_with, "other_ip");
  r = run(first.concat([F("pass"), F("lag"), F("lag"), F("lag")]));
  ok("second 1γ fires", firedCases(r).filter((c) => /1γ/.test(c)).length === 2);
  eq("engine says ae", r.stage.engine, "ae");
  eq("overlay (παρ.7) says cdr", r.stage.effective, "cdr");
  eq("→ verdict: Cdr", r.status.code, "dp_cdr");
  ok("… the note names παρ.7 and fail-24", r.status.notes.some((x) => /παρ\.7/.test(x.text) && hasCite(x.cites, "fail-24")));
  r = run(first.concat([F("pass"), F("lag"), F("lag"), F("lag"), ev("dp_cdr", "score", { score: 65 }), F("pass"), F("lag"), F("lag"), F("lag")]));
  eq("third referral: Cdr exhausted (1 allowed, AE was ≥60) → board without a progress test", r.stage.effective, "board");
  eq("→ verdict: Board", r.status.code, "board");
  ok("… cites fail-26", r.status.notes.some((x) => hasCite(x.cites, "fail-26")));
  /* AE failed (<60) → the Cdr has TWO judgements */
  const two = g4().concat([F("lag"), F("lag"), F("lag"), ev("dp_ae", "fail"), ev("dp_cdr", "score", { score: 61 }), F("pass"), F("lag"), F("lag"), F("lag")]);
  r = run(two);
  eq("AE <60 then Cdr pass; new referral → Cdr again (2nd of 2)", r.stage.effective, "cdr");
  r = run(two.concat([ev("dp_cdr", "score", { score: 62 }), F("pass"), F("lag"), F("lag"), F("lag")]));
  eq("… after the 2nd Cdr judgement the next referral is Board directly", r.stage.effective, "board");
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
  const many = [];
  for (let i = 0; i < 17; i++) { many.push(F("lag")); many.push(F("pass")); many.push(F("pass")); many.push(F("pass")); }
  r = run(many, { denom_1d: "planned" });
  ok("17 bad on the planned reading fires 1δ(ΣΥΝΟΛΟ) (17/85 = 20 %)", firedCases(r).indexOf("1δ(ΣΥΝΟΛΟ)") >= 0, firedCases(r).join());
  ok("… exactly at the 17th lag (event 65)", r.fired[0].idx === 64, String(r.fired[0] && r.fired[0].idx));
  ok("… and 1γ never fired (lags were never consecutive)", !firedCases(r).some((c) => /1γ/.test(c)));
  r = run(many.slice(0, 64), { denom_1d: "planned" });
  ok("16 bad → nothing", r.fired.length === 0, firedCases(r).join());
  eq("default denominator is planned (owner ruling 2026-10-17)", run([F("lag")]).opts.denom_1d, "planned");
  ok("… the executed reading is still reachable behind the switch", run([F("pass"), F("pass"), F("pass"), F("lag")], { denom_1d: "executed" }).fired.length === 1);
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
