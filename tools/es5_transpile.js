/* ══════════════════════════════════════════════════════════════════════════
 * es5_transpile.js — the ES5 stage of tools/build_offline.py
 *
 * ROUND 23 (29/08/2026).  The unit's floor moved to **Firefox 32**, and at
 * that floor there is no half-measure left: FF32 has arrow functions (22) but
 * no `let`/`const` (51), no classes (45), no template literals (34), no
 * destructuring (53), no default/rest params (15/43-ish), no for-of that Babel
 * will vouch for (53).  Rather than chase a per-feature table twenty releases
 * old, the export is compiled to **pure ES5** — the one dialect every engine
 * from 2011 onward parses — and the proof is mechanical: acorn with
 * `ecmaVersion: 5` must parse every emitted script with zero errors.
 *
 * esbuild cannot do this.  It bottoms out at ES2015 and answers
 * `--target=es5` with "Transforming const to the configured target
 * environment (\"es5\") is not supported yet".  Babel can, so Babel is the
 * transpiler and esbuild is out of the build.
 *
 * The toolchain does NOT live in the repo (see build_offline.py section 0):
 * node_modules is passed in as argv[2] so the public repo never gains a
 * vendored multi-MB blob.
 *
 * usage:  node es5_transpile.js <node_modules_dir> <mode> <in.json> <out.json>
 *   mode = versions   → out: {babel, presetEnv, acorn}
 *   mode = transpile  → in: [{name, code}]  out: [{name, code}]
 *   mode = parse5     → in: [{name, code}]  out: [{name, ok, error}]
 * Any failure is written to out.json as {"fatal": "..."} and exits 1.
 * ══════════════════════════════════════════════════════════════════════════ */
"use strict";

const fs = require("fs");
const path = require("path");
const Module = require("module");

const [, , depsDir, mode, inPath, outPath] = process.argv;

function die(msg) {
  try { fs.writeFileSync(outPath, JSON.stringify({ fatal: String(msg) }), "utf8"); } catch (e) {}
  process.stderr.write(String(msg) + "\n");
  process.exit(1);
}

if (!depsDir || !mode || !outPath) die("usage: es5_transpile.js <node_modules> <mode> <in> <out>");
if (!fs.existsSync(depsDir)) die("build deps directory does not exist: " + depsDir);

/* resolve @babel/* and acorn out of the EXTERNAL deps dir, not out of the repo */
const req = (name) => require(require.resolve(name, { paths: [depsDir, path.dirname(depsDir)] }));

let babel, presetEnv, acorn, versions;
try {
  babel = req("@babel/core");
  presetEnv = require.resolve("@babel/preset-env", { paths: [depsDir, path.dirname(depsDir)] });
  acorn = req("acorn");
  versions = {
    babel: req("@babel/core/package.json").version,
    presetEnv: req("@babel/preset-env/package.json").version,
    acorn: req("acorn/package.json").version,
  };
} catch (e) {
  die("cannot load the build toolchain from " + depsDir + ": " + e.message);
}

/* ── THE BABEL CONTRACT — every knob here is a judgement, so each is written
 *    down.  Read this before changing one.
 *
 *  targets firefox 32 + forceAllTransforms
 *      `targets` records WHY (the unit's floor).  `forceAllTransforms` is what
 *      actually guarantees ES5: on targets alone preset-env would happily leave
 *      arrow functions in (Firefox grew them in 22), and an arrow is a parse
 *      error for `ecmaVersion: 5`, so the mechanical proof would fail on a
 *      construct the browser could in fact run.  The file compiles to ES5 flat,
 *      and the ES5 parse is then a REAL proof rather than a near-miss.
 *
 *  assumptions, and NO `loose: true`
 *      `loose: true` was tried first and is a TRAP at this floor.  It implies
 *      iterableIsArray for the spread transform, and this app spreads Map
 *      iterators: `[...bag.values()]` came out as `[].concat(bag.values())`,
 *      which does not expand an iterator — it appends it as ONE element, so a
 *      list of classes silently became a list of one iterator object.  Caught
 *      by reading the emitted code; guarded from here on by the spread case in
 *      build_offline.py's --gate-selftest.  The assumptions below are therefore
 *      spelled out one at a time, and iterableIsArray is not among them.
 *
 *      iterableIsArray is the fast, tempting one — it turns `for (const x of
 *      xs)` into an index loop — and it is wrong for the same reason: this app
 *      iterates Maps and Sets (`[...map.values()]`,
 *      `for (const id of OBLIGATIONS.keys())`), and an index loop over a Map
 *      silently yields nothing.  Without it Babel emits its iterator helper,
 *      whose fallback chain is: Symbol.iterator → the STRING key "@@iterator"
 *      → Array/String/Map/Set/arguments/typed arrays by brand → array-like by
 *      .length.  Firefox 32 has no Symbol (36), so the "@@iterator" rung is the
 *      one that carries the weight — and the export's shim block installs
 *      exactly that string key on Array/String/Map/Set and on the Map/Set/Array
 *      iterator prototypes.  arrayLikeIsIterable adds the .length rung for
 *      NodeList/HTMLCollection (NodeList became iterable in 50).
 *
 *  comments false
 *      Matches what esbuild used to do and keeps ~17 copies of Babel's helper
 *      preamble from carrying their prose.  Every block that has to stay
 *      READABLE in the shipped file carries its note in the <script> label
 *      instead, which build_offline.py writes after this stage.
 * ── */
const BABEL_OPTS = {
  babelrc: false,
  configFile: false,
  browserslistConfigFile: false,
  sourceType: "script",
  comments: false,
  compact: false,
  minified: false,
  presets: [[presetEnv, {
    targets: { firefox: "32" },
    forceAllTransforms: true,
    modules: false,
    bugfixes: true,
  }]],
  assumptions: {
    arrayLikeIsIterable: true,
    skipForOfIteratorClosing: true,
    setPublicClassFields: true,
    privateFieldsAsProperties: true,
    constantSuper: true,
    noDocumentAll: true,
    noNewArrows: true,
    objectRestNoSymbols: true,
    setSpreadProperties: true,
  },
};

function readIn() {
  try { return JSON.parse(fs.readFileSync(inPath, "utf8")); }
  catch (e) { die("cannot read " + inPath + ": " + e.message); }
}

function writeOut(obj) {
  fs.writeFileSync(outPath, JSON.stringify(obj), "utf8");
}

if (mode === "versions") {
  writeOut(versions);
  process.exit(0);
}

if (mode === "transpile") {
  const items = readIn();
  const out = [];
  for (const it of items) {
    let res;
    try {
      res = babel.transformSync(it.code, Object.assign({ filename: it.name }, BABEL_OPTS));
    } catch (e) {
      die("Babel failed on " + it.name + ":\n" + (e && e.message ? e.message : e));
    }
    out.push({ name: it.name, code: res.code });
  }
  writeOut(out);
  process.exit(0);
}

if (mode === "parse5") {
  const items = readIn();
  const out = [];
  for (const it of items) {
    try {
      /* ecmaVersion 5 — THE PROOF.  Not "ES5-ish": acorn refuses `let`, `=>`,
         backticks, `class`, `...`, for-of, destructuring, default params,
         getters on computed keys, everything.  A clean pass means Firefox 32
         (and the photographed 72, and every release between) can PARSE the
         script; what it can then RUN is the API floor's problem, which the
         shim block and the capability guard answer. */
      acorn.parse(it.code, { ecmaVersion: 5, sourceType: "script", allowReserved: true });
      out.push({ name: it.name, ok: true });
    } catch (e) {
      const line = e && e.loc ? e.loc.line : 0;
      const col = e && e.loc ? e.loc.column : 0;
      const src = String(it.code).split("\n")[line - 1] || "";
      out.push({
        name: it.name, ok: false,
        error: (e && e.message ? e.message : String(e)),
        context: src.slice(Math.max(0, col - 60), col + 60).trim(),
      });
    }
  }
  writeOut(out);
  process.exit(0);
}

die("unknown mode: " + mode);
