"use strict";
/* ADVERSARIAL VERIFIER harness — INDEPENDENT fixtures, FAKE names only.
   Loads app/schedbridge.js headlessly and probes the engine. */
const fs = require("fs");
const path = require("path");

/* THE ONE PATH TO THE ENGINE — repo-relative, never absolute (Round 20b): the
   fixtures moved into the repo so any clone can re-run the number, and a
   `D:/FDMS/...` hard-code would have made them runnable on exactly one machine.
   tools/fixtures/bridge → three levels up is the repo root. */
const BRIDGE_SRC = path.resolve(__dirname, "..", "..", "..", "app", "schedbridge.js");

global.window = global;
const src = fs.readFileSync(BRIDGE_SRC, "utf8");
// eslint-disable-next-line no-eval
(0, eval)(src);
const B = global.SchedBridge;
if (!B) throw new Error("SchedBridge did not attach");

/* ── kindOf: the FDMS syllabus graph, faked to the shapes the bridge asks for ── */
const KIND = new Map([
  ["s:C4302", "flights"], ["s:C4303", "flights"], ["s:C4304", "flights"],
  ["s:C4590", "flights"], ["s:C4790", "flights"], ["s:I4490", "flights"],
  ["s:F4690", "flights"], ["s:N4690", "flights"],
  ["s:FS4101", "fs"], ["s:FS4102", "fs"],
  ["g:GT-AERO-CRM", "lessons"], ["g:GT-WSGES", "lessons"],
  ["g:CO190", "exams"], ["g:JP190", "exams"], ["g:IN190", "exams"],
]);
const kindOf = (uid) => KIND.get(uid) || null;

/* ── assertion plumbing ─────────────────────────────────────────────────── */
let pass = 0, fail = 0;
const FAILURES = [];
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  PASS  " + name); }
  else { fail++; FAILURES.push(name + (extra ? "  << " + extra : "")); console.log("  FAIL  " + name + (extra ? "\n        " + extra : "")); }
}
function eq(name, got, want) { ok(name, got === want, "got " + JSON.stringify(got) + " want " + JSON.stringify(want)); }

/* ── fixture builders — ALL NAMES FABRICATED ────────────────────────────── */
function person(o) {
  return Object.assign({
    id: "wa-" + o.oid, role: "student", mn: "MN-9001", rank: "2Lt",
    first_name: "Fabricated", last_name: "Nobody", class: "77TST-Z",
    duty: "", leadership: "", status: "", external_oid: o.oid,
    call_sign: null, country: "TST", test_pilot: false, active: true,
  }, o);
}
function record(sid, data, stored) {
  const r = { student_id: sid, data: data, entered_by: "admin", co_entries: 0, entries_total: 0, last_update: "2026-08-21" };
  if (stored) r.data_as_stored = stored;
  return r;
}
function waExport(people, records, marked) {
  const d = { exported_at: "2026-08-21T09:00:00Z", people: people, student_records: records, proposals: [] };
  if (marked) d.schema = "wa-export-v1";
  return d;
}
function fdmsStudent(o) {
  return Object.assign({
    oid: "oid-x01", code: "ZZ-1", first_name: "Fabricated", last_name: "Nobody",
    mn: "MN-9001", rank: "2Lt", class: "77TST-Z", status: "active",
  }, o);
}
function fdmsIp(o) {
  return Object.assign({
    oid: "oid-ip-x1", code: "ZP-1", first_name: "Imaginary", last_name: "Airman",
    mn: "MN-8001", rank: "Capt", callsign: "GHOST01", status: "active",
  }, o);
}
let evN = 0;
function ev(o) { evN++; return Object.assign({ id: "TV-" + String(evN).padStart(4, "0"), scope: "student", student: "ZZ-1", absent: [] }, o); }

function run(waFile, fdms, opts) {
  const p = B.parseExport(JSON.stringify(waFile));
  if (!p.ok) throw new Error("parseExport refused the fixture: " + p.why);
  return B.crossCheck(p, Object.assign({ students: [], instructors: [], trainingLog: [], gates: [] }, fdms),
    Object.assign({ kindOf, membersOf: () => [], today: "2026-08-21" }, opts));
}
const clsOf = (rep, pred) => rep.rows.filter(pred).map((r) => r.cls);

module.exports = { B, BRIDGE_SRC, run, ok, eq, person, record, waExport, fdmsStudent, fdmsIp, ev, kindOf, clsOf,
  report: () => ({ pass, fail, FAILURES }) };
