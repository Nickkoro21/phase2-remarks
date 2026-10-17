"use strict";
/* PROBE 2 — THE ONE ENGINE, DRIVEN HEADLESSLY.
   SchedConsq.walk() and SchedConsq.countersFrom() are fed synthetic events
   through a synthetic ctx. The numbers here are the thresholds the live
   Scheduler uses; if one drifts, this is where it shows. */
const H = require("./harness.js");
const { CQ, ok, eq } = H;

console.log("\n=== PROBE 2 — SchedConsq pure seams exist ===");
ok("walk is exported", typeof CQ.walk === "function");
ok("liveCtx is exported", typeof CQ.liveCtx === "function");
ok("countersFrom is exported", typeof CQ.countersFrom === "function");
ok("smsMax is exported", typeof CQ.smsMax === "function");
ok("referral is a known special", !!CQ.SPECIAL.referral);
ok("the other four specials are still there", ["dp_ae", "dp_cdr", "apt", "board"].every((k) => !!CQ.SPECIAL[k]));

/* a tiny synthetic graph */
const DESC = new Map();
const isLast = new Set();
const ctx = { isLast: isLast, describe: (u) => DESC.get(u) || null, interveningFs: () => false, nextIsExam: (t, u, open) => !!open, boardGates: () => [], kepeGates: () => [] };
let n = 0, day = "2026-01-05";
function fl(res, o) {
  o = o || {};
  const uid = "s:T-" + (++n); day = CQ.addWork(day, 1);
  DESC.set(uid, { uid: uid, kind: o.kind || "flights", label: uid, track: o.track || "contact", checkride: !!o.checkride, first_solo: !!o.first_solo });
  if (o.last) isLast.add(uid);
  const ev = res === "score" ? { result: "score", score: o.score } : { result: res };
  if (o.exempt) ev.nausea_exempt = true;
  return { ev: ev, i: n, uid: uid, kind: o.kind || "flights", date: day, res: CQ.normRes(ev), special: "" };
}
function sp(key, res, o) { o = o || {}; day = CQ.addWork(day, 1); const ev = Object.assign({ special: key, result: res, kind: o.kind || "flights" }, o); return { ev: ev, i: ++n, uid: "", kind: o.kind || "flights", date: day, res: CQ.normRes(ev), special: key }; }
const reset = () => { DESC.clear(); isLast.clear(); n = 0; day = "2026-01-05"; };
const cnt = (fly, extra) => CQ.countersFrom(Object.assign({ fly: fly, describe: ctx.describe, passPct: 80 }, extra || {}));

console.log("\n=== PROBE 2a — walk: the ΠΔ ladder (fail-16 → dp_ae → dp_cdr → board) ===");
{
  reset();
  const log = [fl("score", { checkride: true, score: 55 })];
  let w = CQ.walk(log, ctx);
  ok("checkride 55 % opens the ladder", !!w.pd);
  eq("… at the AE rung", w.pd && w.pd.stage, "ae");
  eq("… citing fail-16", w.pd && w.pd.req, "fail-16");
  eq("… medium air", w.pd && w.pd.medium, "flights");
  log.push(sp("dp_ae", "fail"));
  w = CQ.walk(log, ctx); eq("dp_ae fail → Cdr rung", w.pd && w.pd.stage, "cdr");
  log.push(sp("dp_cdr", "fail"));
  w = CQ.walk(log, ctx); eq("dp_cdr fail → board rung", w.pd && w.pd.stage, "board");
  log.push(sp("board", "fail"));
  w = CQ.walk(log, ctx); eq("board ΚΑΤΑ → stopped", w.pd && w.pd.stage, "stopped");
}
{
  reset();
  const log = [fl("score", { checkride: true, score: 59 }), sp("dp_ae", "completed")];
  const w = CQ.walk(log, ctx);
  ok("59 % is a fail band (not 60)", CQ.bandOf({ result: "score", score: 59 }) === "lag" && CQ.normRes({ result: "score", score: 59 }) === "fail");
  ok("60 % clears", CQ.normRes({ result: "score", score: 60 }) === "completed");
  ok("dp_ae pass closes the ladder", !w.pd);
  ok("… and leaves the avoid-instructor note", !!w.pdNote);
}
{
  reset();
  const w = CQ.walk([fl("lag", { checkride: true })], ctx);
  ok("a checkride recorded as plain ΥΣΤΕΡΗΣΗ (no score) opens the ladder — fail-16 is the whole 0-59 band", !!w.pd && w.pd.req === "fail-16");
  reset();
  ok("a checkride recorded as plain ΑΠΟΤΥΧΙΑ opens it too", !!CQ.walk([fl("fail", { checkride: true })], ctx).pd);
  reset();
  ok("a checkride PASS opens nothing", !CQ.walk([fl("completed", { checkride: true })], ctx).pd);
  reset();
  const w2 = CQ.walk([fl("lag", { checkride: false })], ctx);
  ok("an ordinary lag is still an ordinary lag (day block, no ladder)", !w2.pd && w2.blocks.length === 1);
}
{
  reset();
  const log = [fl("lag", { checkride: true }), sp("dp_ae", "fail"), sp("dp_cdr", "completed")];
  const w = CQ.walk(log, ctx);
  ok("dp_cdr pass closes the ladder too", !w.pd && !!w.pdNote);
  log.push(sp("board", "completed"));
  ok("a stray board record with no ladder is ignored", !CQ.walk(log, ctx).pd);
}

console.log("\n=== PROBE 2b — walk: the referral special opens the ladder at the named rung ===");
{
  reset();
  let w = CQ.walk([sp("referral", "completed", { stage: "ae", req: "fail-76" })], ctx);
  eq("referral ae → stage ae", w.pd && w.pd.stage, "ae");
  eq("… keeps its req", w.pd && w.pd.req, "fail-76");
  w = CQ.walk([sp("referral", "completed", { stage: "board", req: "fail-32" })], ctx);
  eq("referral board → stage board directly", w.pd && w.pd.stage, "board");
  ok("… boardSince set", !!(w.pd && w.pd.boardSince));
  w = CQ.walk([sp("referral", "completed", { stage: "ae", req: "fail-40", kind: "fs" })], ctx);
  eq("referral on the F/S carries medium fs", w.pd && w.pd.medium, "fs");
  const log = [fl("lag", { checkride: true }), sp("referral", "completed", { stage: "board", req: "fail-32" })];
  w = CQ.walk(log, ctx);
  eq("a referral never re-opens a ladder already open (first owns it)", w.pd && w.pd.req, "fail-16");
  log.push(sp("board", "completed"));
  ok("board ΥΠΕΡ closes a referral-opened ladder", !CQ.walk(log, ctx).pd);
}

console.log("\n=== PROBE 2c — walk: fail-11 (3 attempts on the last F/S of a section) ===");
{
  reset();
  const log = [fl("lag", { kind: "fs", last: true })];
  let w = CQ.walk(log, ctx);
  ok("1st fail → ladder 1/3, no ΠΔ", w.fsLadder && w.fsLadder.fails === 1 && !w.pd);
  eq("… eligible next working day", w.fsLadder.eligible, CQ.addWork(log[0].date, 1));
  const u = log[0].uid; const d2 = CQ.addWork(day, 1); day = d2;
  log.push({ ev: { result: "fail" }, i: ++n, uid: u, kind: "fs", date: d2, res: "fail", special: "" });
  w = CQ.walk(log, ctx);
  ok("2nd fail → ladder 2/3", w.fsLadder && w.fsLadder.fails === 2 && !w.pd);
  eq("… eligible after 2 clear calendar days (= +3)", w.fsLadder.eligible, CQ.addCal(d2, 3));
  const d3 = CQ.addCal(d2, 3); day = d3;
  log.push({ ev: { result: "lag" }, i: ++n, uid: u, kind: "fs", date: d3, res: "lag", special: "" });
  w = CQ.walk(log, ctx);
  ok("3rd fail → ΠΔ opened", !!w.pd);
  eq("… citing fail-11", w.pd.req, "fail-11");
  eq("… medium fs (1ε: Δοκιμή Προόδου στον εξομοιωτή)", w.pd.medium, "fs");
  ok("… ladder cleared", !w.fsLadder);
}

console.log("\n=== PROBE 2d — walk: fail-12 / fail-19 (aptitude exam pending) ===");
{
  reset();
  let w = CQ.walk([fl("lag", { last: true, track: "formation" })], ctx);
  ok("last A/C sortie lag → apt pending", w.apt.length === 1 && w.apt[0].req === "fail-12");
  ok("… category locked", w.lockedTracks.has("formation"));
  reset();
  const log = [fl("fail", { first_solo: true })];
  w = CQ.walk(log, ctx);
  ok("first solo fail → apt pending with solo flag", w.apt.length === 1 && w.apt[0].req === "fail-19" && w.apt[0].solo);
  ok("… the solo is never re-offered", w.skipUids.has(log[0].uid));
  log.push(sp("apt", "completed", { category: "contact" }));
  w = CQ.walk(log, ctx);
  ok("apt pass resolves and marks the solo virtually done", w.apt.length === 0 && w.virtualDone.has(log[0].uid));
  reset();
  const log2 = [fl("lag", { last: true }), sp("apt", "fail", { category: "contact" })];
  w = CQ.walk(log2, ctx);
  ok("apt fail → ΠΔ at the AE rung citing fail-12", w.pd && w.pd.stage === "ae" && w.pd.req === "fail-12");
}

console.log("\n=== PROBE 2e — countersFrom: ΠΔ 1γ (fail-76) ===");
{
  reset();
  const g = [fl("pass"), fl("pass"), fl("pass"), fl("pass")];         // the 4 grace sorties
  let c = cnt(g.concat([fl("fail"), fl("fail")]));
  eq("2 consecutive 0-49 after grace → c049 = 2", c.c049.value, 2); eq("… limit 2", c.c049.limit, 2);
  c = cnt([fl("fail"), fl("fail"), fl("fail"), fl("fail")]);
  eq("4 fails INSIDE the grace window count nothing", c.c049.value, 0);
  reset();
  c = cnt([fl("pass"), fl("pass"), fl("pass"), fl("pass"), fl("lag"), fl("fail"), fl("lag")]);
  eq("3 consecutive 0-59 (mixed) → c059 = 3", c.c059.value, 3); eq("… limit 3", c.c059.limit, 3);
  eq("… but c049 streak is 0 (last was lag)", c.c049.value, 0);
  reset();
  c = cnt([fl("pass"), fl("pass"), fl("pass"), fl("pass"), fl("lag"), fl("lag"), fl("pass"), fl("lag")]);
  eq("a pass resets the run", c.c059.value, 1);
  reset();
  c = cnt([fl("pass"), fl("pass"), fl("pass"), fl("pass"), fl("lag"), fl("lag", { exempt: true }), fl("lag")], { exemptIf: (x) => !!x.ev.nausea_exempt });
  eq("ΠΔ παρ.2: an exempt nausea flight is skipped — run is 2, not 3", c.c059.value, 2);
  reset();
  c = cnt([fl("pass"), fl("pass"), fl("pass"), fl("pass"), fl("lag"), fl("lag", { exempt: true }), fl("lag")]);
  eq("without the exemptIf hook (live Scheduler today) the same flight counts: 3", c.c059.value, 3);
  reset();
  c = cnt([fl("pass"), fl("pass"), fl("pass"), fl("pass"), fl("lag", { kind: "fs" }), fl("lag", { kind: "fs" }), fl("lag", { kind: "fs" })]);
  eq("F/S sorties never feed the A/C 1γ counters", c.c059.value, 0);
}

console.log("\n=== PROBE 2f — countersFrom: ΠΔ 1δ (fail-77) ===");
{
  reset();
  let c = cnt([fl("pass"), fl("lag"), fl("pass"), fl("pass"), fl("fail")]);
  eq("2 bad of 5 executed = 40 %", c.totalFl.pct, 40); eq("… limit 20 %", c.totalFl.limitPct, 20);
  eq("pre-solo = everything before the first completed first_solo (none yet → all)", c.preSolo.total, 5);
  eq("… 40 % limit", c.preSolo.limitPct, 40);
  ok("… soloDone false", c.preSolo.soloDone === false);
  reset();
  const solo = fl("pass", { first_solo: true });
  c = cnt([fl("lag"), fl("pass"), solo, fl("lag"), fl("lag")], { isSoloDone: (x) => DESC.get(x.uid).first_solo && x.res === "completed" });
  eq("pre-solo stops at the solo: 2 flights", c.preSolo.total, 2);
  eq("… 1 bad = 50 %", c.preSolo.pct, 50);
  ok("… soloDone true", c.preSolo.soloDone === true);
  eq("total counts all 5", c.totalFl.total, 5);
  reset();
  c = cnt([fl("lag", { exempt: true }), fl("pass")], { exemptIf: (x) => !!x.ev.nausea_exempt });
  eq("exempt flight leaves the 1δ numerator", c.totalFl.bad, 0);
  eq("… and the denominator", c.totalFl.total, 1);
}

console.log("\n=== PROBE 2g — countersFrom: ΠΔ 1ε (fail-40) — new in the engine ===");
{
  reset();
  const g = [fl("pass", { kind: "fs" }), fl("pass", { kind: "fs" }), fl("pass", { kind: "fs" })];
  let c = cnt(g.concat([fl("lag", { kind: "fs" }), fl("fail", { kind: "fs" }), fl("lag", { kind: "fs" })]));
  eq("3 consecutive after the 3 grace → fs059 = 3", c.fs059.value, 3); eq("… limit 3", c.fs059.limit, 3); eq("… grace 3", c.fs059.grace, 3);
  reset();
  c = cnt([fl("lag", { kind: "fs" }), fl("lag", { kind: "fs" }), fl("lag", { kind: "fs" })]);
  eq("3 fails inside the F/S grace count nothing for (αα)", c.fs059.value, 0);
  eq("… but (αβ) sees 3 of 3 = 100 %", c.fsCum.bad, 3);
  eq("… floor is 3", c.fsCum.floor, 3); eq("… 20 % limit", c.fsCum.limitPct, 20);
  reset();
  c = cnt([fl("lag", { kind: "fs" }), fl("lag", { kind: "fs" }), fl("pass", { kind: "fs" }), fl("pass", { kind: "fs" }), fl("pass", { kind: "fs" }), fl("pass", { kind: "fs" }), fl("pass", { kind: "fs" }), fl("pass", { kind: "fs" }), fl("pass", { kind: "fs" }), fl("pass", { kind: "fs" })]);
  eq("2 of 10 = 20 % but under the floor of 3", c.fsCum.bad, 2);
  ok("… so (αβ) must not fire (fixture of the rule the sandbox applies)", !(c.fsCum.bad >= c.fsCum.floor && c.fsCum.pct >= c.fsCum.limitPct));
  reset();
  c = cnt([fl("lag", { kind: "fs", exempt: true }), fl("lag", { kind: "fs" }), fl("lag", { kind: "fs" }), fl("lag", { kind: "fs" })], { exemptIf: (x) => !!x.ev.nausea_exempt });
  eq("the nausea exemption does NOT reach the F/S counters (παρ.2 names 1γ/1δ only)", c.fsCum.bad, 4);
}

console.log("\n=== PROBE 2h — countersFrom: written (fail-32) and oral (fail-36) ===");
{
  const ex = (res, score, d) => ({ ev: res === "score" ? { result: "score", score: score } : { result: res }, date: d, uid: "g:X" });
  let c = cnt([], { exams: [ex("fail", null, "2026-02-01"), ex("fail", null, "2026-02-02")] });
  eq("2 consecutive written fails → streak 2", c.written.streak, 2); eq("… limit 2", c.written.limit, 2);
  c = cnt([], { exams: [ex("fail", null, "2026-02-01"), ex("completed", null, "2026-02-02"), ex("fail", null, "2026-02-03")] });
  eq("a pass between resets the streak", c.written.streak, 1); eq("… total still 2", c.written.total, 2);
  c = cnt([], { exams: [ex("score", 79, "2026-02-01"), ex("score", 80, "2026-02-02")], passPct: 80 });
  eq("79 % fails, 80 % passes at the 80 mark", c.written.total, 1); eq("… streak 0", c.written.streak, 0);
  c = cnt([], { nfs: [{ special: "nfs", category: "oral", date: "2026-02-01" }, { special: "nfs", category: "oral", date: "2026-02-02" }, { special: "nfs", category: "written", date: "2026-02-03" }] });
  eq("oral total counts only oral NFS", c.oral.total, 2); eq("… limits 4", c.oral.limitC, 4); eq("… and 8", c.oral.limitT, 8);
  eq("nfs total counts all", c.nfs.total, 3);
}

console.log("\n=== PROBE 2i — smsMax (fail-45) ===");
eq("ground exams 2", CQ.smsMax("ground_exam"), 2);
eq("contact (ΠΡΟΣΑΡΜΟΓΗ) 2", CQ.smsMax("contact"), 2);
eq("instrument 1", CQ.smsMax("instrument"), 1);
eq("formation 1", CQ.smsMax("formation"), 1);
eq("vfr_navigation 1", CQ.smsMax("vfr_navigation"), 1);

console.log("\n=== PROBE 2j — the live wrapper still binds to the store (liveCtx shape) ===");
{
  global.SchedStore = { get: () => [], cfg: () => 80, membersOf: () => [], subscribe: () => {} };
  global.SchedReady = { describe: () => null, sections: () => [], kindOf: () => null, nodes: () => [], rank: () => Infinity, state: () => ({}), node: () => null };
  const c = CQ.liveCtx("ZZ-0");
  ok("liveCtx exposes the five seams", ["isLast", "describe", "interveningFs", "nextIsExam", "boardGates", "kepeGates"].every((k) => k in c));
  ok("analyze of an unknown synthetic code is empty, not an error", (() => { const a = CQ.analyze("ZZ-0"); return !a.pd && a.blocks.length === 0; })());
  const k = CQ.counters("ZZ-0");
  ok("counters() still returns every Progress-editor key", ["lag", "fail", "c049", "c059", "preSolo", "totalFl", "written", "oral", "nfs", "sms"].every((x) => x in k));
  ok("… plus the two new F/S keys", "fs059" in k && "fsCum" in k);
  delete global.SchedStore; delete global.SchedReady;
}
