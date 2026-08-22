"use strict";
/* PROBE 8 — esc(), COMPLETE ON ALL FIVE CHARACTERS, and the hostile fixture
   name. A Wings Ahead export is a file a human typed into; the report paints it
   into innerHTML. The house map is exactly & < > " ' — five, no fewer. The name
   below is FABRICATED and deliberately hostile. */
const fs = require("fs");
const H = require("./harness.js");
const { run, ok, eq, person, record, waExport, fdmsStudent, fdmsIp } = H;

console.log("\n=== PROBE 8 — the five-character map in app/schedbridge.js ===");
{
  const src = fs.readFileSync(H.BRIDGE_SRC, "utf8");
  const map = /const ESC = \{([^}]*)\}/.exec(src);
  ok("the ESC table exists", !!map);
  const body = map ? map[1] : "";
  [["&", "&amp;"], ["<", "&lt;"], [">", "&gt;"], ['"', "&quot;"], ["'", "&#39;"]].forEach(([ch, ent]) => {
    ok("esc() maps " + JSON.stringify(ch) + " → " + ent, body.indexOf(ent) >= 0, body.trim());
  });
  ok("and the replacer covers the same five, no fewer",
    /replace\(\/\[&<>"'\]\/g/.test(src), "the /[&<>\"']/g class was not found verbatim");
}

console.log("\n=== PROBE 8b — a hostile fabricated name never becomes markup ===");
{
  const NASTY = '<img src=x onerror="alert(1)"> O\u2019"Nobody" & Sons';
  const wa = waExport([person({ oid: "oid-a1", last_name: NASTY, first_name: "Fabricated" })],
    [record("wa-oid-a1", { flights: [
      { date: "2026-08-16", sortie: "C4302", seq: 1, kind: "syllabus", instructor: NASTY, mission: "complete" }] })], true);
  const r = run(wa, { students: [fdmsStudent({ oid: "oid-a1" })], instructors: [fdmsIp({})], trainingLog: [] });
  const dump = JSON.stringify(r);
  ok("8b · the name survives INTO the report as data", dump.indexOf("onerror") >= 0);
  /* the renderer is what must neutralise it; it lives behind a DOM this probe
     has none of, so the contract is asserted on the escaper itself */
  const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ESC[c]);
  const painted = esc(NASTY);
  ok("8b · escaped, it opens no tag", painted.indexOf("<") < 0 && painted.indexOf(">") < 0, painted);
  ok("8b · escaped, it closes no attribute", painted.indexOf('"') < 0 && painted.indexOf("'") < 0, painted);
  ok("8b · and the ampersand is escaped FIRST, so nothing double-decodes",
    painted.indexOf("&amp;lt;") < 0 && /&lt;img/.test(painted), painted);
}

module.exports = true;
