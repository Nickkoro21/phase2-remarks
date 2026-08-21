# -*- coding: utf-8 -*-
"""
build_offline.py — deterministic single-file exports of Phase 2 FDMS for the
unit's CLOSED network.  **Hard browser target: Firefox 72.0.2** (the unit's
browser — see specs/offline-export-spec.md, the contract for this builder).

Produces (in D:\\FDMS-export\\):
  * Phase2-FDMS.html     — Remarks + Description + global search + Info +
                           MIF chart + offline feedback + the 8-palette gallery
  * Phase2-Validate.html — ONLY the Schedule Validation tool (schedval.js as a
                           full-page standalone app, flowchart2.json inlined,
                           unit-terminology synonyms, theme gallery)
  * README-IT.txt        — Greek note for the unit IT department

LANGUAGE CONTRACT (spec §2) — the app source stays modern; the divergence
lives only here:
  * every inline script (head pre-paint, data bundle, fetch shim, app modules,
    feedback, gallery, adapter) is transpiled with **esbuild --target=es2019**
    (pinned 0.28.2 in tools/package.json; version drift hard-fails);
  * ONE shim block is prepended before any other body script: structuredClone,
    crypto.randomUUID, String.replaceAll (+ defensive at()/Object.hasOwn) —
    each installed only if missing;
  * CSS is patched for Fx72: :focus-visible→:focus, :has() rules dropped,
    min()/max() get a same-property fallback emitted BEFORE the modern value
    (Fx72 drops the modern declaration and keeps the fallback);
  * QUALITY GATE (hard fail): each emitted script must re-parse under esbuild,
    then a string/comment/regex-stripping scanner proves no `?.`, `??`, `||=`,
    `&&=`, `#private`, numeric-separator or BigInt syntax survived, plus a
    checklist scan for Fx72-missing APIs; the final CSS is scanned for
    Fx78+ features.  The builder exits non-zero with the exact locations.

GATE HONESTY NOTE: esbuild at --target=es2019 *lowers* modern syntax instead
of rejecting it, so the esbuild pass proves "parses as JavaScript" (catches
assembly/concatenation bugs) while the stripping scanner is the layer that
proves "no ES2020+ syntax survived".  The scanner strips string literals,
template literals (with nested ${} expressions), comments and regex literals
(pragmatic first-token heuristic for / vs division — documented, good enough
for this codebase) before matching, so "?." inside remark text never
false-positives.

Flags:
  --no-transpile    skip esbuild (DEMO ONLY: proves the quality gate trips on
                    un-transpiled input; the build then fails by design)
  --gate-selftest   run the scanner against known-good/known-bad snippets and
                    exit (regression test for the gate itself)

Deterministic: same inputs + pinned esbuild -> byte-identical outputs.
Re-run any time:  python tools/build_offline.py
"""

import base64
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]          # D:\FDMS
APP = ROOT / "app"
DATA = ROOT / "data"
TOOLS = ROOT / "tools"
EXPORT = ROOT.parent / "FDMS-export"                # D:\FDMS-export
OUT_HTML = EXPORT / "Phase2-FDMS.html"
OUT_VALIDATE = EXPORT / "Phase2-Validate.html"
OUT_README = EXPORT / "README-IT.txt"
MAX_BYTES = 20 * 1024 * 1024                        # hard size guard (main)
MAX_BYTES_VALIDATE = 4 * 1024 * 1024                # hard size guard (validate)

ES_TARGET = "es2019"
ESBUILD_VERSION = "0.28.2"                          # must match tools/package.json

NO_TRANSPILE = "--no-transpile" in sys.argv         # gate-demo mode only


def fail(msg: str) -> None:
    sys.exit(f"BUILD FAILED: {msg}")


def read_text(p: Path) -> str:
    return p.read_text(encoding="utf-8")


def sub1(pattern: str, repl, s: str, what: str, count: int = 1, flags=0) -> str:
    """re.subn that hard-fails unless exactly `count` replacements happened."""
    out, n = re.subn(pattern, repl, s, flags=flags)
    if n != count:
        fail(f"expected {count} match(es) for {what}, got {n} — app/ layout changed?")
    return out


# ────────────────────────────────────────────────────────────────────
# 0. esbuild toolchain (pinned)
# ────────────────────────────────────────────────────────────────────

def find_esbuild() -> Path:
    cands = [
        TOOLS / "node_modules" / "@esbuild" / "win32-x64" / "esbuild.exe",
        TOOLS / "node_modules" / "esbuild" / "bin" / "esbuild",
    ]
    for c in cands:
        if c.is_file():
            return c
    fail(f"esbuild not found under tools/node_modules — run:  cd tools && npm install"
         f"  (package.json pins esbuild {ESBUILD_VERSION})")


_ESBUILD: Path | None = None


def esbuild_exe() -> Path:
    global _ESBUILD
    if _ESBUILD is None:
        _ESBUILD = find_esbuild()
        v = subprocess.run([str(_ESBUILD), "--version"], capture_output=True)
        got = v.stdout.decode("ascii", "replace").strip()
        if v.returncode != 0 or got != ESBUILD_VERSION:
            fail(f"esbuild version drift: expected {ESBUILD_VERSION}, got '{got}' — "
                 f"builds would not be reproducible. Fix tools/package.json + npm install.")
    return _ESBUILD


def esbuild_pass(src: str, name: str, purpose: str) -> str:
    """Run esbuild --target=es2019 over one script (stdin->stdout)."""
    p = subprocess.run(
        [str(esbuild_exe()), "--loader=js", f"--target={ES_TARGET}",
         "--charset=utf8", "--log-level=warning"],
        input=src.encode("utf-8"), capture_output=True)
    if p.returncode != 0:
        fail(f"esbuild {purpose} failed for {name}:\n{p.stderr.decode('utf-8', 'replace')}")
    return p.stdout.decode("utf-8")


def transpile(name: str, src: str) -> str:
    if NO_TRANSPILE:
        return src
    return esbuild_pass(src, name, "transpile")


# ────────────────────────────────────────────────────────────────────
# 1. QUALITY GATE — JS scanner (strings/comments/regex stripped first)
# ────────────────────────────────────────────────────────────────────

_RE_KEYWORDS = {"return", "typeof", "instanceof", "in", "of", "new", "delete",
                "void", "case", "do", "else", "yield", "await", "throw"}


def strip_js(code: str) -> str:
    """Replace string/template/regex literals and comments with placeholders,
    preserving newlines (for line numbers).  Pragmatic regex-vs-division
    heuristic: a '/' starts a regex when the previous significant token cannot
    end an expression.  Good enough for this codebase; documented in spec §3."""
    out = []
    n = len(code)
    i = 0
    # context stack: ("code", from_template) | ("tpl",)
    stack = [["code", False, 0]]  # [type, spawned_by_template, brace_depth]
    mode = "code"
    sub = ""          # sub-mode inside code: "", line, block, sq, dq, re, recls
    last_sig = ""     # last significant char emitted in code mode
    last_word = ""    # last identifier/keyword emitted
    word = ""

    def emit(ch):
        out.append(ch)

    while i < n:
        c = code[i]
        nc = code[i + 1] if i + 1 < n else ""
        top = stack[-1]
        if mode == "code":
            if sub == "line":
                if c == "\n":
                    sub = ""
                    emit("\n")
                else:
                    emit(" ")
                i += 1
                continue
            if sub == "block":
                if c == "*" and nc == "/":
                    sub = ""
                    emit("  ")
                    i += 2
                else:
                    emit("\n" if c == "\n" else " ")
                    i += 1
                continue
            if sub in ("sq", "dq"):
                q = "'" if sub == "sq" else '"'
                if c == "\\":
                    emit("  ")
                    i += 2
                elif c == q:
                    sub = ""
                    emit("0")           # placeholder value → '/' after = division
                    last_sig = "0"
                    last_word = ""
                    i += 1
                else:
                    emit("\n" if c == "\n" else " ")
                    i += 1
                continue
            if sub in ("re", "recls"):
                if c == "\\":
                    emit("  ")
                    i += 2
                elif sub == "re" and c == "[":
                    sub = "recls"
                    emit(" ")
                    i += 1
                elif sub == "recls" and c == "]":
                    sub = "re"
                    emit(" ")
                    i += 1
                elif sub == "re" and c == "/":
                    sub = ""
                    emit("0")
                    last_sig = "0"
                    last_word = ""
                    i += 1
                    while i < n and code[i].isalpha():   # regex flags
                        emit(" ")
                        i += 1
                else:
                    emit("\n" if c == "\n" else " ")
                    i += 1
                continue
            # plain code
            if c == "/" and nc == "/":
                sub = "line"
                emit("  ")
                i += 2
                continue
            if c == "/" and nc == "*":
                sub = "block"
                emit("  ")
                i += 2
                continue
            if c == "'":
                sub = "sq"
                emit(" ")
                i += 1
                continue
            if c == '"':
                sub = "dq"
                emit(" ")
                i += 1
                continue
            if c == "`":
                stack.append(["tpl", False, 0])
                mode = "tpl"
                emit(" ")
                i += 1
                continue
            if c == "/":
                if (last_sig == "" or last_sig in "([{,;=:!&|?+-*%^~<>"
                        or last_word in _RE_KEYWORDS):
                    sub = "re"
                    emit(" ")
                    i += 1
                    continue
                emit(c)
                last_sig = c
                word = ""
                i += 1
                continue
            if c == "{":
                top[2] += 1
                emit(c)
                last_sig = c
                word = ""
                i += 1
                continue
            if c == "}":
                if top[2] > 0:
                    top[2] -= 1
                    emit(c)
                    last_sig = c
                elif top[1]:            # closes a ${ } template expression
                    stack.pop()
                    mode = "tpl"
                    emit(" ")
                else:
                    emit(c)
                    last_sig = c
                word = ""
                i += 1
                continue
            if c.isalnum() or c in "_$":
                word += c
                emit(c)
                last_sig = c
                i += 1
                continue
            if word:
                last_word = word
                word = ""
            if not c.isspace():
                last_sig = c
                last_word = ""
            emit(c)
            i += 1
            continue
        # template literal
        if mode == "tpl":
            if c == "\\":
                emit("  ")
                i += 2
                continue
            if c == "`":
                stack.pop()
                mode = stack[-1][0] if stack[-1][0] != "tpl" else "tpl"
                mode = "code" if stack[-1][0] == "code" else "tpl"
                emit("0")
                last_sig = "0"
                last_word = ""
                i += 1
                continue
            if c == "$" and nc == "{":
                stack.append(["code", True, 0])
                mode = "code"
                sub = ""
                emit("  ")
                last_sig = "("          # expression context
                last_word = ""
                i += 2
                continue
            emit("\n" if c == "\n" else " ")
            i += 1
            continue
    return "".join(out)


_SYNTAX_RULES = [
    (r"\?\.(?![0-9])", "optional chaining `?.` (ES2020 — does not parse in Fx72)"),
    (r"\?\?", "nullish coalescing `??`/`??=` (ES2020/21)"),
    (r"\|\|=(?!=)", "logical assignment `||=` (ES2021)"),
    (r"&&=(?!=)", "logical assignment `&&=` (ES2021)"),
    (r"#[A-Za-z_$]", "private class field `#x` (ES2022)"),
    (r"(?<![\w$])\d[\d_]*_\d", "numeric separator (ES2021)"),
    (r"(?<![\w$])\d+n\b", "BigInt literal (ES2020)"),
]

# APIs missing in Fx72.  kind:
#   shimmed     — allowed, the prepended shim block provides it
#   guarded     — allowed only when the same script also contains the guard text
#   forbidden   — hard fail
_API_RULES = [
    (r"\bstructuredClone\s*\(", "structuredClone (Fx94)", "shimmed", None),
    (r"crypto\.randomUUID", "crypto.randomUUID (Fx95)", "shimmed", None),
    (r"\.replaceAll\s*\(", "String.replaceAll (Fx77)", "shimmed", None),
    (r"\.at\s*\(", ".at() (Fx90)", "shimmed", None),
    (r"Object\.hasOwn\b", "Object.hasOwn (Fx92)", "shimmed", None),
    (r"\bfindLast(?:Index)?\s*\(", "findLast/findLastIndex (Fx104)", "forbidden", None),
    (r"AbortSignal\s*\.", "AbortSignal statics (Fx88+)", "forbidden", None),
    (r"Intl\.(?:RelativeTimeFormat|ListFormat|Segmenter|DisplayNames)",
     "newer Intl API (Fx>72)", "forbidden", None),
    (r"Promise\.any\s*\(", "Promise.any (Fx79)", "forbidden", None),
    (r"showOpenFilePicker|showDirectoryPicker", "File System Access picker", "forbidden", None),
    (r"showSaveFilePicker", "showSaveFilePicker (no Firefox support)",
     "guarded", "typeof window.showSaveFilePicker"),
]


def _line_of(text: str, pos: int) -> int:
    return text.count("\n", 0, pos) + 1


def gate_scan_script(name: str, body: str, shim_present: bool,
                     check_apis: bool = True, check_cssjs: bool = True) -> list:
    """Return list of violation strings for one emitted script body."""
    stripped = strip_js(body)
    bad = []
    for pat, label in _SYNTAX_RULES:
        for m in re.finditer(pat, stripped):
            ln = _line_of(stripped, m.start())
            ctx = stripped.splitlines()[ln - 1].strip()[:90]
            bad.append(f"{name}:{ln}: {label}  →  {ctx}")
    if not check_apis:
        return bad
    for pat, label, kind, guard in _API_RULES:
        hits = list(re.finditer(pat, stripped))
        if not hits:
            continue
        if kind == "shimmed":
            if not shim_present:
                bad.append(f"{name}: uses {label} but the shim block is absent from this page")
            continue
        if kind == "guarded":
            if guard and guard in body:
                continue
            bad.append(f"{name}:{_line_of(stripped, hits[0].start())}: {label} without its typeof guard")
            continue
        bad.append(f"{name}:{_line_of(stripped, hits[0].start())}: {label} — no shim, Fx72 breaks")
    # CSS-in-JS: unpatched min()/max()/clamp() with numeric args (Math.min etc.
    # excluded via lookbehind). Raw-body scan on purpose: these live inside JS
    # template literals; skipped for the JSON data bundle (free text).
    if check_cssjs:
        for m in re.finditer(r"(?<![\w.$-])(?:min|max|clamp)\(\s*\d", body):
            bad.append(f"{name}:{_line_of(body, m.start())}: CSS min()/max()/clamp() inside JS "
                       f"(Fx75+) — patch it in the builder")
    return bad


_CSS_FORBIDDEN = [
    (r":is\(", ":is() (Fx78)"),
    (r":where\(", ":where() (Fx82)"),
    (r":has\(", ":has() (Fx121)"),
    (r"aspect-ratio", "aspect-ratio (Fx81)"),
    (r":focus-visible", ":focus-visible (Fx85 — invalidates the whole rule in Fx72)"),
    (r"content-visibility", "content-visibility"),
    (r"@layer", "@layer"),
    (r"conic-gradient\(", "conic-gradient (Fx83)"),
    (r"backdrop-filter", "backdrop-filter"),
    (r"overflow:\s*clip", "overflow:clip (Fx81)"),
]
_CSS_INFO = [  # degrade silently in Fx72 — reported, not fatal
    (r"accent-color", "accent-color (Fx92) — checkboxes fall back to native look"),
    (r"color-scheme", "color-scheme (Fx96) — print block only, harmless"),
]


def gate_scan_css(name: str, css: str) -> tuple:
    """(violations, notes). min()/max()/clamp() values are allowed ONLY when an
    earlier declaration for the same property exists in the same rule block
    (the dual-emission fallback pattern patch_css produces)."""
    bad, notes = [], []
    for pat, label in _CSS_FORBIDDEN:
        for m in re.finditer(pat, css):
            bad.append(f"{name}:{_line_of(css, m.start())}: {label}")
    for pat, label in _CSS_INFO:
        c = len(re.findall(pat, css))
        if c:
            notes.append(f"{name}: {c}× {label}")
    for m in re.finditer(r"(?<![\w.$-])(?:min|max|clamp)\(", css):
        # declaration start = after previous ';' or '{'
        decl_start = max(css.rfind(";", 0, m.start()), css.rfind("{", 0, m.start())) + 1
        pm = re.match(r"\s*([a-zA-Z-]+)\s*:", css[decl_start:m.start()])
        prop = pm.group(1) if pm else "?"
        block_start = css.rfind("{", 0, decl_start)
        fallback = re.search(r"(?:[;{]|^)\s*" + re.escape(prop) + r"\s*:",
                             css[block_start:decl_start - 1])
        if not fallback:
            bad.append(f"{name}:{_line_of(css, m.start())}: `{prop}: …{css[m.start():m.start()+18]}…` "
                       f"has no same-property fallback before it (Fx72 drops it)")
    return bad, notes


def run_gate(html: str, page: str) -> list:
    """Full quality gate over one assembled HTML page. Returns notes; exits on
    violations."""
    if re.search(r"<script\s+src", html):
        fail(f"{page}: external <script src> survived assembly")
    if re.search(r'<link\s+rel="stylesheet"', html):
        fail(f"{page}: external stylesheet link survived assembly")
    scripts = re.findall(r"<script>(.*?)</script>", html, re.S)
    styles = re.findall(r"<style>(.*?)</style>", html, re.S)
    if not scripts or not styles:
        fail(f"{page}: could not extract inline scripts/styles for the gate")
    shim_present = any("Fx72 runtime shims" in s for s in scripts)
    bad, notes = [], []
    for idx, body in enumerate(scripts):
        mlab = re.search(r"/\* ═+ (.+?) ═+ \*/", body)
        name = f"{page}[script#{idx} {(mlab.group(1) if mlab else 'head')}]"
        if not NO_TRANSPILE:
            esbuild_pass(body, name, "gate re-parse")     # true parser layer
        if "Fx72 runtime shims" in body:
            # the shim block itself: syntax-scan only (it IS the API provider)
            bad += gate_scan_script(name, body, shim_present,
                                    check_apis=False, check_cssjs=False)
            continue
        bad += gate_scan_script(name, body, shim_present,
                                check_cssjs="Embedded data bundle" not in name)
    for idx, body in enumerate(styles):
        b, nn = gate_scan_css(f"{page}[style#{idx}]", body)
        bad += b
        notes += nn
    if bad:
        print(f"\nQUALITY GATE — {len(bad)} violation(s) in {page}:", file=sys.stderr)
        for x in bad[:40]:
            print("  ✗ " + x, file=sys.stderr)
        if len(bad) > 40:
            print(f"  … and {len(bad) - 40} more", file=sys.stderr)
        fail(f"{page} would not run on Firefox 72 — nothing was written")
    return notes


def gate_selftest() -> None:
    cases_bad = [
        ("const x = a?.b;", "optional chaining"),
        ("const y = a ?? b;", "nullish"),
        ("v ||= 3;", "logical assign"),
        ("class A { #x = 1; }", "private field"),
        ("const n = 1_000_000;", "numeric separator"),
        ("const b = 10n;", "bigint"),
        ("s.replaceAll('a','b')", "replaceAll without shim"),
    ]
    cases_good = [
        'const s = "no ?. here ?? really";',
        "const r = /ab?./g; const t = `x ${a ? b : c} ?.`;",
        "const u = 'tpl ${a?.b} not code'; // a?.b in comment",
        "const q = x ? .5 : y;",
        "el.innerHTML = `<a href=\"?x=1&y=2\">${esc(v)}</a>`;",
    ]
    ok = True
    for src, why in cases_bad:
        hits = gate_scan_script("selftest", src, shim_present=False)
        if not hits:
            ok = False
            print(f"SELFTEST FAIL: missed {why}: {src}")
    for src in cases_good:
        hits = [h for h in gate_scan_script("selftest", src, shim_present=True)]
        if hits:
            ok = False
            print(f"SELFTEST FAIL: false positive on: {src}\n  {hits}")
    print("gate selftest:", "PASS" if ok else "FAIL")
    sys.exit(0 if ok else 1)


# ────────────────────────────────────────────────────────────────────
# 2. CSS patch for Fx72 (source stays modern — export-only rewrites)
# ────────────────────────────────────────────────────────────────────

def patch_css(css: str) -> str:
    # :focus-visible (Fx85) → :focus — in Fx72 the unknown pseudo-class would
    # invalidate the whole rule; :focus is the graceful export behaviour.
    # (5 since Round 15 added .cur-pop :focus-visible for the flight popover;
    #  4 was Round 11's .cur-ip. The exact count IS the tripwire: a new focus
    #  ring must be looked at once for Fx72 before the number moves.)
    css = sub1(r":focus-visible", lambda m: ":focus", css, ":focus-visible → :focus", count=5)
    # :has() rules (Fx121, scheduler-only) — the rule would be dropped silently
    # anyway; strip it explicitly so the gate stays clean.
    css = sub1(
        r"\.sch-line:has\([^)]*\) \{[^}]*\}\n",
        lambda m: "/* [offline] has-selector rule dropped for Fx72 */\n",
        css, ":has() rules", count=2)
    # min()/max() (Fx75) — emit a same-property fallback BEFORE the modern
    # declaration; Fx72 drops the modern one and keeps the fallback, modern
    # browsers apply the later declaration. Count-checked per occurrence.
    minmax_fixes = [
        (r"width: min\(860px, 94vw\);",
         "width: 860px; max-width: 94vw; width: min(860px, 94vw);"),
        (r"width: min\(360px, 46%\);",
         "width: 360px; max-width: 46%; width: min(360px, 46%);"),
        (r"width: min\(760px, 96vw\);",
         "width: 760px; max-width: 96vw; width: min(760px, 96vw);"),
        (r"width: min\(430px, 92vw\);",
         "width: 430px; max-width: 92vw; width: min(430px, 92vw);"),
        (r"width: min\(1180px, 100%\);",
         "width: 1180px; max-width: 100%; width: min(1180px, 100%);"),
        (r"width: min\(430px, 94vw\);",
         "width: 430px; max-width: 94vw; width: min(430px, 94vw);"),
        (r"max-height: min\(72vh, 620px\);",
         "max-height: 72vh; max-height: min(72vh, 620px);"),
        # Round 15 — the flight/legend popover (.cur-pop)
        (r"width: min\(380px, 94vw\);",
         "width: 380px; max-width: 94vw; width: min(380px, 94vw);"),
        (r"max-height: min\(74vh, 620px\);",
         "max-height: 74vh; max-height: min(74vh, 620px);"),
    ]
    for pat, repl in minmax_fixes:
        css = sub1(pat, lambda m, r=repl: r, css, f"CSS fallback for `{pat}`")
    return css


# ────────────────────────────────────────────────────────────────────
# 3. Data bundles
# ────────────────────────────────────────────────────────────────────

def collect_data() -> dict:
    files = [
        DATA / "observations" / "master_index.json",   # app.js + remarksearch.js
        DATA / "minimums.json",                        # mifchart.js
        DATA / "manifest.json",                        # mifchart.js (source-jump)
        # Round 16 — the Description tab. It is a pure syllabus/gradesheet tool
        # (no roster data of any kind), so unlike the Scheduler and the Currency
        # matrix it DOES travel to the closed network.
        DATA / "descriptions.json",                    # description.js — the grammar
        DATA / "sections.json",                        # description.js — R17 MISSION/OBJECTIVE per section
        DATA / "areas.json",                           # description.js — working areas
        DATA / "routes.json",                          # description.js — CPM routes
        DATA / "ep_list.json",                         # description.js — the 71 EPs
        DATA / "flowchart2.json",                      # description.js — the sortie roster
    ]
    files += sorted((DATA / "observations2").rglob("*.json"))   # item remarks (v2)
    files += sorted((DATA / "criteria").glob("*.json"))         # Info modal
    files += sorted((DATA / "mif").glob("*.json"))              # MIF progression
    files += sorted((DATA / "requirements").glob("*.json"))     # Info modal links + req view
    bundle = {}
    for f in files:
        if not f.is_file():
            fail(f"missing data file: {f}")
        rel = f.relative_to(ROOT).as_posix()
        try:
            bundle[rel] = json.loads(read_text(f))
        except json.JSONDecodeError as e:
            fail(f"{rel}: invalid JSON ({e})")
    master = bundle["data/observations/master_index.json"]
    v1_only = [it["item_id"] for c in master["categories"].values()
               for it in c["items"] if not it.get("v2_file")]
    if v1_only:
        fail(f"master_index items without v2_file (v1 files are not bundled): {v1_only}")
    return bundle


def collect_validate_data() -> dict:
    f = DATA / "flowchart2.json"
    if not f.is_file():
        fail(f"missing data file: {f}")
    try:
        return {"data/flowchart2.json": json.loads(read_text(f))}
    except json.JSONDecodeError as e:
        fail(f"flowchart2.json: invalid JSON ({e})")


def data_bundle_js(bundle: dict) -> str:
    parts = []
    for key, obj in bundle.items():
        blob = json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
        parts.append(f"{json.dumps(key)}:{blob}")
    js = "window.FDMS_DATA={\n" + ",\n".join(parts) + "\n};"
    # "</" only occurs inside JSON strings → "<\/" is identical JSON, HTML-safe.
    # "<!--" would open an HTML comment inside a classic script → "<\u0021--".
    return js.replace("</", "<\\/").replace("<!--", "<\\u0021--")


# ────────────────────────────────────────────────────────────────────
# 4. Builder-owned scripts (shims, fetch shim, feedback, adapter)
# ────────────────────────────────────────────────────────────────────

RUNTIME_SHIMS_JS = r"""
"use strict";
/* Fx72 runtime shims — prepended by tools/build_offline.py BEFORE every other
   script. Each installs ONLY when the API is missing (modern browsers keep
   their native implementation). Marker string for the gate: Fx72 runtime shims */
(function () {
  /* structuredClone (Fx94) → JSON deep clone. Sufficient for this app: only
     plain JSON data is ever cloned (the fetch shim's bundle objects). */
  if (typeof window.structuredClone !== "function") {
    window.structuredClone = function (o) {
      return o === undefined ? o : JSON.parse(JSON.stringify(o));
    };
  }
  /* crypto.randomUUID (Fx95) → v4 from getRandomValues (Math.random fallback). */
  try {
    if (window.crypto && typeof window.crypto.randomUUID !== "function") {
      window.crypto.randomUUID = function () {
        var b = new Uint8Array(16), i;
        if (typeof window.crypto.getRandomValues === "function") {
          window.crypto.getRandomValues(b);
        } else {
          for (i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
        }
        b[6] = (b[6] & 15) | 64;
        b[8] = (b[8] & 63) | 128;
        var h = [];
        for (i = 0; i < 16; i++) h.push((b[i] + 256).toString(16).slice(1));
        return h[0] + h[1] + h[2] + h[3] + "-" + h[4] + h[5] + "-" + h[6] + h[7] +
          "-" + h[8] + h[9] + "-" + h[10] + h[11] + h[12] + h[13] + h[14] + h[15];
      };
    }
  } catch (e) { /* crypto locked down — rid() has its own fallback */ }
  /* String.replaceAll (Fx77) → split/join (string) or g-RegExp replace.
     Limitation (documented): "$&"-style patterns in a STRING replacement are
     not interpreted — no call site in this codebase uses them. */
  if (!String.prototype.replaceAll) {
    Object.defineProperty(String.prototype, "replaceAll", {
      configurable: true, writable: true,
      value: function (search, repl) {
        if (search instanceof RegExp) {
          if (String(search.flags).indexOf("g") < 0) {
            throw new TypeError("replaceAll must be called with a global RegExp");
          }
          return String(this).replace(search, repl);
        }
        var s = String(this), find = String(search);
        if (typeof repl === "function") {
          if (find === "") return s.split("").join(String(repl("", 0, s)));
          var out = "", i = 0, j;
          while ((j = s.indexOf(find, i)) >= 0) {
            out += s.slice(i, j) + repl(find, j, s);
            i = j + find.length;
          }
          return out + s.slice(i);
        }
        return s.split(find).join(String(repl));
      }
    });
  }
  /* .at() (Fx90) + Object.hasOwn (Fx92) — defensive, tiny. */
  function atImpl(k) {
    var n = Math.trunc(Number(k) || 0), len = this.length;
    if (n < 0) n += len;
    return (n < 0 || n >= len) ? undefined : this[n];
  }
  if (!Array.prototype.at) {
    Object.defineProperty(Array.prototype, "at",
      { configurable: true, writable: true, value: atImpl });
  }
  if (!String.prototype.at) {
    Object.defineProperty(String.prototype, "at",
      { configurable: true, writable: true, value: atImpl });
  }
  if (!Object.hasOwn) {
    Object.defineProperty(Object, "hasOwn", {
      configurable: true, writable: true,
      value: function (o, k) { return Object.prototype.hasOwnProperty.call(Object(o), k); }
    });
  }
})();
"""

FETCH_SHIM_JS = r"""
"use strict";
/* Offline fetch shim — serves every ../data/... request from the embedded
   bundle. Nothing ever touches the network; misses return a 404-like
   response and log a console.warn. */
(() => {
  const D = window.FDMS_DATA || {};
  const clone = (o) => (typeof structuredClone === "function"
    ? structuredClone(o) : JSON.parse(JSON.stringify(o)));
  const norm = (u) => String(u).split("#")[0].split("?")[0]
    .replace(/^(?:\.\.\/|\.\/)+/, "").replace(/^\//, "");
  window.fetch = function (url) {
    const p = norm(url);
    if (Object.prototype.hasOwnProperty.call(D, p)) {
      return Promise.resolve({
        ok: true, status: 200, url: String(url),
        json: () => Promise.resolve(clone(D[p])),
        text: () => Promise.resolve(JSON.stringify(D[p])),
      });
    }
    console.warn("[FDMS offline] no bundled data for fetch:", String(url));
    return Promise.resolve({
      ok: false, status: 404, url: String(url),
      json: () => Promise.reject(new Error("offline bundle miss: " + p)),
      text: () => Promise.resolve(""),
    });
  };
})();
"""

FEEDBACK_JS = r"""
"use strict";
/* Offline feedback module — appended by tools/build_offline.py (not part of app/).
   Intercepts every GitHub "/issues/new" link (per-remark Feedback buttons and
   the global remark-search Feedback buttons) and opens a local dialog instead.
   Storage tiers:
     (a) SHARED FILE — File System Access API (Chrome/Edge ONLY; Firefox has no
         such API, so on the unit's Fx72 this tier simply never appears):
         connect ONE common fdms-feedback.json on a network drive; every save =
         read + append + write. Handle persisted in IndexedDB.
     (b) FALLBACK — localStorage on this computer + "Export feedback (N)" button
         that downloads fdms-feedback-<name|device>-<date>.json. On Firefox this
         is ALWAYS the active tier (detected via typeof, no reference errors). */
(() => {
  const LS_NAME = "fdms-fb-name", LS_REC = "fdms-fb-records";
  const $id = (x) => document.getElementById(x);
  const esc = (s) => { const d = document.createElement("div"); d.textContent = s ?? ""; return d.innerHTML; };
  const FSA = typeof window.showSaveFilePicker === "function";
  let fileHandle = null;
  let cur = null;

  /* ── local tier ── */
  const localRecs = () => {
    try { const v = JSON.parse(localStorage.getItem(LS_REC) || "[]"); return Array.isArray(v) ? v : []; }
    catch (e) { return []; }
  };
  const saveLocal = (rec) => {
    const a = localRecs(); a.push(rec);
    try { localStorage.setItem(LS_REC, JSON.stringify(a)); } catch (e) {}
    refreshBar();
  };
  const rid = () => (crypto.randomUUID ? crypto.randomUUID()
    : Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join(""));

  /* ── IndexedDB persistence of the shared-file handle ── */
  const idb = () => new Promise((res, rej) => {
    const rq = indexedDB.open("fdms-feedback", 1);
    rq.onupgradeneeded = () => rq.result.createObjectStore("kv");
    rq.onsuccess = () => res(rq.result);
    rq.onerror = () => rej(rq.error);
  });
  const idbGet = async (k) => {
    try {
      const db = await idb();
      return await new Promise((res, rej) => {
        const t = db.transaction("kv").objectStore("kv").get(k);
        t.onsuccess = () => res(t.result); t.onerror = () => rej(t.error);
      });
    } catch (e) { return null; }
  };
  const idbSet = async (k, v) => {
    try {
      const db = await idb();
      await new Promise((res, rej) => {
        const t = db.transaction("kv", "readwrite");
        t.objectStore("kv").put(v, k);
        t.oncomplete = () => res(); t.onerror = () => rej(t.error);
      });
    } catch (e) {}
  };

  /* ── shared-file tier (Chrome/Edge only — FSA is false on Firefox) ── */
  async function ensurePerm(h) {
    if (typeof h.queryPermission !== "function") return true;
    if ((await h.queryPermission({ mode: "readwrite" })) === "granted") return true;
    return (await h.requestPermission({ mode: "readwrite" })) === "granted";
  }
  async function readArray(h) {
    const f = await h.getFile();
    const t = await f.text();
    if (!t.trim()) return [];
    const v = JSON.parse(t);                    // throws on corrupt file
    if (!Array.isArray(v)) throw new Error("the file is not a JSON array");
    return v;                                    // never clobber unreadable data
  }
  async function writeArray(h, arr) {
    const w = await h.createWritable();
    await w.write(JSON.stringify(arr, null, 2));
    await w.close();
  }
  async function appendShared(rec) {
    if (!(await ensurePerm(fileHandle))) throw new Error("permission denied");
    const arr = await readArray(fileHandle);
    arr.push(rec);
    await writeArray(fileHandle, arr);
    return arr.length;
  }
  async function connectFile() {
    try {
      const h = await window.showSaveFilePicker({
        suggestedName: "fdms-feedback.json",
        types: [{ description: "FDMS feedback (JSON)", accept: { "application/json": [".json"] } }],
      });
      if (!(await ensurePerm(h))) { setStatus("Write permission was not granted."); return; }
      const arr = await readArray(h);           // existing records survive
      await writeArray(h, arr);                 // round-trip proves readwrite works
      fileHandle = h;
      await idbSet("handle", h);
      setStatus(`Shared file connected: ${h.name} (${arr.length} records) ✓`);
    } catch (e) {
      if (e && e.name === "AbortError") return; // user cancelled the picker
      setStatus("Could not connect the shared file: " + ((e && e.message) || e));
    }
  }

  /* ── styles ── */
  const CSS = `
  .fb-bar{display:flex;gap:10px;align-items:center;justify-content:center;flex-wrap:wrap;margin-top:9px;font-size:12px;color:var(--muted)}
  .fb-bar .fb-b{background:transparent;border:1px solid var(--line);color:var(--muted);border-radius:7px;padding:3px 10px;font-size:11.5px;cursor:pointer}
  .fb-bar .fb-b:hover{color:var(--text);border-color:var(--accent)}
  .fb-ctx{background:var(--panel-2);border:1px solid var(--line);border-left:4px solid var(--accent);border-radius:8px;padding:10px 12px;margin-bottom:4px}
  .fb-ctx .q{font-style:italic;color:var(--text);margin-top:6px;line-height:1.5;font-size:13px}
  .fb-meta{font-family:Consolas,monospace;font-size:12px;color:var(--accent)}
  .fb-lbl{display:block;color:var(--muted);font-size:12px;margin:12px 0 4px}
  .fb-in,.fb-ta{width:100%;background:var(--panel-2);color:var(--text);border:1px solid var(--line);border-radius:8px;padding:8px 10px;font-size:13px;font-family:inherit}
  .fb-ta{min-height:110px;resize:vertical}
  .fb-in:focus,.fb-ta:focus{outline:none;border-color:var(--accent)}
  .fb-note{font-size:11.5px;color:var(--muted);margin-top:10px;line-height:1.5}
  .fb-actions{display:flex;gap:10px;justify-content:flex-end;margin-top:14px}
  .fb-primary{background:var(--accent);color:#06121f;border:1px solid var(--accent);border-radius:8px;padding:6px 16px;font-weight:700;cursor:pointer}
  .fb-primary:hover{filter:brightness(1.12)}
  .fb-flash{color:var(--warn);font-size:12px;margin-right:auto;align-self:center}
  #fb-status{font-size:11.5px}
  `;

  /* ── DOM ── */
  function buildDom() {
    const st = document.createElement("style");
    st.textContent = CSS;
    document.head.appendChild(st);

    const w = document.createElement("div");
    w.id = "fb-modal";
    w.className = "modal hidden";
    w.innerHTML = `
      <div class="modal-box" style="width:660px;max-width:94vw">
        <div class="modal-head">
          <h3>Feedback — report an error / suggest a correction</h3>
          <button id="fb-close" class="info-btn">✕ Close</button>
        </div>
        <div class="modal-body">
          <div class="fb-ctx" id="fb-ctx"></div>
          <label class="fb-lbl" for="fb-comment">What is wrong / suggested correction (required)</label>
          <textarea id="fb-comment" class="fb-ta"></textarea>
          <label class="fb-lbl" for="fb-name">Your name (optional — remembered on this computer)</label>
          <input id="fb-name" class="fb-in" autocomplete="off">
          <p class="fb-note" id="fb-note"></p>
          <div class="fb-actions">
            <span class="fb-flash" id="fb-flash"></span>
            <button id="fb-cancel" class="info-btn">Cancel</button>
            <button id="fb-save" class="fb-primary">Save feedback</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(w);
    w.addEventListener("click", (e) => { if (e.target === w) closeDlg(); });
    $id("fb-close").onclick = closeDlg;
    $id("fb-cancel").onclick = closeDlg;
    $id("fb-save").onclick = save;
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDlg(); });

    const credit = document.querySelector("footer.credit") || document.body;
    const bar = document.createElement("div");
    bar.className = "fb-bar";
    bar.id = "fb-bar";
    bar.innerHTML = `
      ${FSA ? `<button class="fb-b" id="fb-connect" title="One common fdms-feedback.json on a network drive — every computer appends to it">Feedback file: connect shared file…</button>` : ""}
      <button class="fb-b" id="fb-export" title="Download the feedback stored on this computer as a JSON file">Export feedback (<span id="fb-n">0</span>)</button>
      <span id="fb-status"></span>`;
    credit.appendChild(bar);
    if (FSA) $id("fb-connect").onclick = connectFile;
    $id("fb-export").onclick = exportLocal;
    refreshBar();
  }

  const closeDlg = () => $id("fb-modal").classList.add("hidden");
  const setStatus = (t) => { $id("fb-status").textContent = t; };
  const refreshBar = () => { $id("fb-n").textContent = String(localRecs().length); };

  /* ── parse the prefilled GitHub-issue URL ── */
  function parseFb(href) {
    let title = "", body = "";
    try {
      const u = new URL(href);
      title = u.searchParams.get("title") || "";
      body = u.searchParams.get("body") || "";
    } catch (e) {}
    const ctx = { mode_id: "", level: "", item: "", file: "", quote: "" };
    let m = /^Feedback:\s*(.+?)\s*·\s*level\s*(\S+)\s*$/.exec(title);   // remarksearch format
    if (m) { ctx.mode_id = m[1]; ctx.level = m[2]; }
    else if ((m = /^Feedback:\s*(.+)$/.exec(title))) {                   // per-remark format
      const da = /-d(\d)a(\d)$/.exec(m[1]);
      if (da) { ctx.mode_id = m[1].slice(0, da.index); ctx.level = `desired ${da[1]} → achieved ${da[2]}`; }
      else ctx.mode_id = m[1];
    }
    for (const line of body.split("\n")) {
      let mm;
      if ((mm = /\*\*Item:\*\*\s*(.+)$/.exec(line))) ctx.item = mm[1].split("· **File:**")[0].trim();
      if ((mm = /\*\*File:\*\*\s*`([^`]+)`/.exec(line))) ctx.file = mm[1].trim();
      if (!ctx.quote && /^>\s?\S/.test(line)) ctx.quote = line.replace(/^>\s?/, "").trim();
    }
    return ctx;
  }

  function noteText() {
    if (fileHandle) return `Saving appends to the shared file “${fileHandle.name}”. If the file is unreachable, the record is kept on this computer instead (footer → Export feedback).`;
    if (FSA) return "No shared feedback file is connected — the record stays ON THIS COMPUTER until you export it (footer → “Export feedback”) and hand the JSON over. To pool feedback automatically, connect the common JSON file on the network drive (footer → “Feedback file: connect shared file…”).";
    return "This browser cannot write files directly (Firefox has no such API) — records stay ON THIS COMPUTER until you export them (footer → “Export feedback”) and hand the JSON file over.";
  }

  function openDialog(ctx) {
    cur = ctx;
    $id("fb-ctx").innerHTML = `
      <div class="fb-meta">${esc(ctx.mode_id || "—")}${ctx.level ? " · " + esc(ctx.level) : ""}</div>
      ${ctx.item ? `<div style="font-size:13px;margin-top:3px">${esc(ctx.item)}</div>` : ""}
      ${ctx.file ? `<div class="fb-meta" style="color:var(--muted);margin-top:3px">${esc(ctx.file)}</div>` : ""}
      ${ctx.quote ? `<div class="q">“${esc(ctx.quote)}”</div>` : ""}`;
    $id("fb-comment").value = "";
    try { $id("fb-name").value = localStorage.getItem(LS_NAME) || ""; } catch (e) {}
    $id("fb-note").textContent = noteText();
    $id("fb-flash").textContent = "";
    $id("fb-modal").classList.remove("hidden");
    $id("fb-comment").focus();
  }

  async function save() {
    const comment = $id("fb-comment").value.trim();
    if (!comment) { $id("fb-flash").textContent = "A comment is required."; $id("fb-comment").focus(); return; }
    const name = $id("fb-name").value.trim();
    try { localStorage.setItem(LS_NAME, name); } catch (e) {}
    const rec = {
      id: rid(), ts: new Date().toISOString(), name,
      mode_id: cur.mode_id || null, level: cur.level || null, item: cur.item || null,
      file: cur.file || null, quote: cur.quote || null, comment,
    };
    if (fileHandle) {
      try {
        const n = await appendShared(rec);
        closeDlg();
        setStatus(`Feedback saved to “${fileHandle.name}” (${n} records) ✓`);
        return;
      } catch (err) {
        saveLocal(rec);
        closeDlg();
        setStatus(`Shared file unavailable (${(err && err.message) || err}) — record kept on this computer; use “Export feedback”.`);
        return;
      }
    }
    saveLocal(rec);
    closeDlg();
    setStatus("Feedback saved on this computer ✓ — use “Export feedback” to hand it over.");
  }

  function exportLocal() {
    const a = localRecs();
    if (!a.length) { setStatus("No feedback stored on this computer yet."); return; }
    let who = "";
    try { who = localStorage.getItem(LS_NAME) || ""; } catch (e) {}
    who = who.replace(/[^\w\u0370-\u03ff.-]+/g, "_").replace(/^_+|_+$/g, "") || "device";
    const date = new Date().toISOString().slice(0, 10);
    const blob = new Blob([JSON.stringify(a, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const el = document.createElement("a");
    el.href = url;
    el.download = `fdms-feedback-${who}-${date}.json`;
    document.body.appendChild(el);
    el.click();
    el.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    setStatus(`Exported ${a.length} record(s) — the download stays valid; hand the JSON file over.`);
  }

  /* ── intercept every "/issues/new" link (capture phase: block navigation
        and the app's outside-click / dropdown handlers) ── */
  document.addEventListener("click", (e) => {
    const t = e.target instanceof Element ? e.target : null;
    const a = t && t.closest('a[href*="/issues/new"]');
    if (!a) return;
    e.preventDefault();
    e.stopPropagation();
    openDialog(parseFb(a.getAttribute("href") || ""));
  }, true);

  buildDom();

  /* restore the persisted shared-file handle (permission re-confirmed on first save) */
  (async () => {
    if (!FSA) return;
    const h = await idbGet("handle");
    if (h && typeof h.getFile === "function") {
      fileHandle = h;
      setStatus(`Shared file: ${h.name} (permission is confirmed on first save)`);
    }
  })();
})();
"""

VALIDATE_ADAPTER_JS = r"""
"use strict";
/* Validate standalone boot (build_offline.py) — the schedval dialog IS the
   page: open it immediately, then append the override stylesheet AFTER the
   style element schedval.js injects at runtime, so the override wins the
   cascade (same specificity, later in document order). Closing/Escape is a
   visual no-op and the close button is hidden. */
(function () {
  var CSS = [
    "/* Validate standalone: the schedval dialog IS the page */",
    ".sv-modal, .sv-modal.hidden { position: static; display: block; background: transparent; z-index: auto; }",
    ".sv-box { margin: 14px auto 30px; max-height: none; width: 880px; max-width: 96vw; box-shadow: none; }",
    ".sv-body { overflow: visible; }",
    "#sv-close { display: none; }"
  ].join("\n");
  function boot() {
    if (typeof window.openSchedVal !== "function") {
      document.body.insertAdjacentHTML("beforeend",
        '<p style="padding:20px">Schedule Validation failed to initialise.</p>');
      return;
    }
    window.openSchedVal("");   // ensureDom() runs synchronously inside
    var st = document.createElement("style");
    st.textContent = CSS;
    document.head.appendChild(st);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
"""


# ────────────────────────────────────────────────────────────────────
# 5. Source preparation (modern app/ files → export-ready text)
# ────────────────────────────────────────────────────────────────────

def prepare_appjs() -> str:
    src = read_text(APP / "app.js")
    out, n = re.subn(
        r"/\* MIF progress chart module[\s\S]*?document\.head\.appendChild\(sys\);\s*\n\}",
        "/* [offline build] dynamic module loaders removed — mifchart.js and "
        "remarksearch.js are inlined below; schedsync.js excluded (closed network). */",
        src,
    )
    if n != 1:
        fail(f"dynamic loader block in app.js: expected 1 match, got {n}")
    return out


def prepare_mifchart() -> str:
    src = read_text(APP / "mifchart.js")
    # CSS-in-JS min() (Fx75) → px + max-width (visually identical)
    return sub1(r"width:min\(1240px,96vw\)", lambda m: "width:1240px;max-width:96vw",
                src, "mifchart modal width min()")


def prepare_schedval() -> str:
    src = read_text(APP / "schedval.js")
    return sub1(r"width:min\(760px,94vw\)", lambda m: "width:760px;max-width:94vw",
                src, "schedval modal width min()")


def extract_prepaint(index_html: str) -> str:
    m = re.search(r"<script>\n(/\* Palette before first paint[\s\S]*?)\n</script>", index_html)
    if not m:
        fail("pre-paint palette script not found in app/index.html")
    return m.group(1)


def extract_gallery(appjs_src: str) -> str:
    """Lift the Round-8 theme gallery (PALETTES + wiring block) out of app.js
    for the Validate page; wrapped with its two tiny helpers from app.js."""
    m = re.search(r'(/\* ═[\s\S]*?THEME GALLERY[\s\S]*?\n\})\n\n\$\("item-search"\)', appjs_src)
    if not m:
        fail("theme gallery block not found in app.js — extraction anchor changed?")
    block = m.group(1)
    return (
        '"use strict";\n'
        "/* Theme gallery — lifted verbatim from app.js by build_offline.py */\n"
        "(() => {\n"
        "const $ = (id) => document.getElementById(id);\n"
        "const esc = (s) => { const d = document.createElement(\"div\"); "
        "d.textContent = s == null ? \"\" : s; return d.innerHTML; };\n"
        + block +
        "\n})();\n"
    )


# ────────────────────────────────────────────────────────────────────
# 6. HTML assembly
# ────────────────────────────────────────────────────────────────────

def script_tag(label: str, body: str) -> str:
    b = body.strip()
    if re.search(r"</(script|style)", b, re.I):
        fail(f"script '{label}' contains '</script'/'</style' — inline-unsafe")
    return f"<script>\n/* ═══ {label} ═══ */\n{b}\n</script>"


def build_main_html(css: str, emblem_uri: str, prepaint_js: str, scripts: str) -> str:
    html = read_text(APP / "index.html")

    # head pre-paint palette script → transpiled version (same URL keys)
    html = sub1(r"<script>\n/\* Palette before first paint[\s\S]*?\n</script>",
                lambda m: "<script>\n" + prepaint_js.strip() + "\n</script>",
                html, "pre-paint script swap")

    # inline the stylesheet
    html = sub1(r'<link rel="stylesheet" href="styles\.css[^"]*">',
                lambda m: "<style>\n" + css + "\n</style>", html, "stylesheet link")

    # emblem as data: URI + visible ✈ fallback
    html = sub1(r'src="assets/364mea\.png"',
                lambda m: f'src="{emblem_uri}"', html, "emblem src")
    html = sub1(r'''onerror="this\.style\.display='none'"''',
                lambda m: '''onerror="this.replaceWith('✈')"''', html, "emblem onerror")

    # hide the removed view tabs (app.js binds by id — keep as hidden stubs).
    # tab-schedval is hidden too: Schedule Validation ships as its own file.
    # tab-description (Round 16) is deliberately NOT in this list: Description
    # ships offline intact, so the count stays 5.
    # tab-currency (Round 11) is hidden for the same reason as the Scheduler:
    # it reads the ROSTER, and nothing roster-derived travels to the closed
    # network in a file — the offline bundle stays a syllabus tool.
    html = sub1(r'(<button id="tab-(?:requirements|flowchart|scheduler|currency|schedval)" class="viewtab"[^>]*)>',
                lambda m: m.group(1) + ' style="display:none">', html,
                "hidden viewtab stubs", count=5)

    # flowchart & scheduler <main> sections -> hidden empty stubs
    html = sub1(r'<main class="fc-view hidden" id="view-flowchart"[\s\S]*?</main>',
                lambda m: '<main id="view-flowchart" class="hidden" style="display:none"></main>'
                          '<!-- stub: id required by app.js switchView -->',
                html, "flowchart main stub")
    html = sub1(r'<main class="sch-view hidden" id="view-scheduler"[\s\S]*?</main>',
                lambda m: '<main id="view-scheduler" class="hidden" style="display:none"></main>'
                          '<!-- stub: id required by app.js switchView -->',
                html, "scheduler main stub")
    html = sub1(r'<main class="cur-view hidden" id="view-currency"[\s\S]*?</main>',
                lambda m: '<main id="view-currency" class="hidden" style="display:none"></main>'
                          '<!-- stub: id required by app.js switchView -->',
                html, "currency main stub")
    # NOTE: #view-requirements stays intact (hidden by default) — reachable
    # through the Info-modal "Related requirements" links.

    # drop all external <script src> tags, then inline our chain before </body>
    # (10 since Round 18 added schedbridge.js — the read-only Wings Ahead
    # cross-check. It is a SCHEDULER module, so like scheduler.js / schedstore.js
    # / schedboard.js / currency.js it does NOT travel: the closed-network
    # bundle stays a syllabus tool and nothing roster-derived reaches it. The
    # count still has to move, because the count is the tripwire on THIS file.)
    # (9 since Round 16 added description.js; 8 was Round 11's currency.js. Not
    # all of them travel: the offline build inlines its own chain, WITHOUT the
    # scheduler and the currency matrix but WITH Description.)
    # (8 since Round 11 added currency.js — none of them travels; the offline
    # build inlines its own shorter chain, without the scheduler or currency.)
    html = sub1(r'[ \t]*<script src="[^"]+"></script>\n', lambda m: "", html,
                "external script tags", count=10)
    html = sub1(r"</body>", lambda m: scripts + "\n</body>", html, "</body>")

    html = sub1(r"<!DOCTYPE html>",
                lambda m: "<!DOCTYPE html>\n<!-- Phase 2 FDMS — single-file offline build "
                          "(generated by tools/build_offline.py; do not edit by hand; "
                          "ES2019 / Firefox 72 compatible) -->",
                html, "doctype marker")
    return html


def build_validate_html(css: str, emblem_uri: str, prepaint_js: str, scripts: str) -> str:
    return f"""<!DOCTYPE html>
<!-- Phase 2 FDMS — Schedule Validation — single-file offline build
     (generated by tools/build_offline.py; do not edit by hand;
     ES2019 / Firefox 72 compatible) -->
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Phase 2 FDMS — Schedule Validation</title>
<style>
{css}
</style>
<script>
{prepaint_js.strip()}
</script>
</head>
<body>
<header class="topbar">
  <div class="brand">
    <img class="brand-icon" src="{emblem_uri}" alt="364 MEA"
         style="height:40px;width:auto" onerror="this.replaceWith('✈')">
    <div>
      <h1>Phase 2 FDMS</h1>
      <p class="tagline">Schedule Validation — what the syllabus requires before a sortie</p>
    </div>
  </div>
  <button id="theme-btn" class="viewtab" title="Light / dark theme">☀</button>
  <button id="theme-gal-btn" class="viewtab thm-btn" title="Theme gallery"><span class="thm-dot"></span><span class="thm-lbl">Theme</span></button>
</header>
<footer class="credit">
  <span class="credit-line">
    Developed by <strong>Koro</strong> · with <strong>Claude</strong> riding the right seat
    · fueled by Kalamata coffee <span class="coffee">☕</span> — July 2026
  </span>
</footer>
{scripts}
</body>
</html>
"""


# ────────────────────────────────────────────────────────────────────
# 7. README for the IT department (Greek)
# ────────────────────────────────────────────────────────────────────

README_TEMPLATE = """\
Phase 2 FDMS — εφαρμογές ενός αρχείου (offline)
===============================================

ΤΙ ΠΕΡΙΛΑΜΒΑΝΕΙ ΤΟ ΠΑΚΕΤΟ — ΔΥΟ ΑΡΧΕΙΑ
1) Phase2-FDMS.html ({size_mb} MB)
   Βοήθημα για τη συμπλήρωση παρατηρήσεων (remarks) στα gradesheets της
   Φάσης ΙΙ εκπαίδευσης T-6A: έτοιμες παρατηρήσεις ανά αντικείμενο και
   κωδικούς (MIF), κριτήρια αξιολόγησης, πρόοδος MIF ανά εκπαιδευτικό
   τμήμα, καθολική αναζήτηση και συλλογή σχολίων (feedback).
2) Phase2-Validate.html ({size_val_mb} MB)
   Έλεγχος προγραμματισμού (Schedule Validation): για ΟΠΟΙΑΔΗΠΟΤΕ έξοδο
   του σταδίου (F/S ή πτήση) δείχνει τι απαιτεί το syllabus πριν από
   αυτήν — μαθήματα, γραπτή εξέταση, F/S, πτήση — με τις πηγές αυτολεξεί.
   Η αναζήτηση καταλαβαίνει και ορολογία μονάδας (π.χ. «tactical»,
   «two-ship», «nav», «night», «solo», «checkride»).

ΕΓΚΑΤΑΣΤΑΣΗ — ΔΕΝ ΧΡΕΙΑΖΕΤΑΙ
- Κάθε αρχείο είναι πλήρως αυτόνομο: όλα τα δεδομένα και το έμβλημα είναι
  ενσωματωμένα μέσα του. Άνοιγμα με διπλό κλικ.
- Συμβατά με Mozilla Firefox 72 ή νεότερο (τον browser του κλειστού
  δικτύου) καθώς και με οποιονδήποτε σύγχρονο Chrome / Edge.
- Δεν απαιτείται internet, server, εγκατάσταση προγράμματος ή δικαιώματα
  διαχειριστή. Οι σελίδες δεν στέλνουν και δεν λαμβάνουν τίποτα από το
  δίκτυο — λειτουργούν εξ ολοκλήρου τοπικά μέσα στον browser.
- Μπορούν να αντιγραφούν ελεύθερα σε υπολογιστές ή σε κοινόχρηστο δίσκο.

ΣΧΟΛΙΑ ΕΚΠΑΙΔΕΥΤΩΝ (FEEDBACK) — ΡΟΗ ΓΙΑ ΤΟ ΚΛΕΙΣΤΟ ΔΙΚΤΥΟ
- Κάθε παρατήρηση στο Phase2-FDMS.html έχει κουμπί «Feedback» για
  διορθώσεις/σχόλια των εκπαιδευτών.
- Στον Firefox τα σχόλια αποθηκεύονται ΤΟΠΙΚΑ στον κάθε υπολογιστή.
  Με το κουμπί «Export feedback (N)» (κάτω μέρος της σελίδας) εξάγονται
  ως μικρό αρχείο JSON, το οποίο παραδίδεται/αποστέλλεται στον συντάκτη
  της εφαρμογής — αυτή είναι η προβλεπόμενη ροή στο κλειστό δίκτυο.
- Σημείωση: η αυτόματη σύνδεση με ΚΟΙΝΟ αρχείο σχολίων σε δίσκο δικτύου
  υποστηρίζεται ΜΟΝΟ σε Chrome/Edge (ο Firefox δεν διαθέτει τη σχετική
  δυνατότητα). Όπου υπάρχει μόνο Firefox ισχύει η τοπική εξαγωγή παραπάνω.
- Δεν απαιτείται καμία ενέργεια από το Τμήμα Πληροφορικής για τα σχόλια.

ΕΠΙΚΟΙΝΩΝΙΑ
Για οποιαδήποτε απορία ή διόρθωση: Ν. Κορωνιάδης — n.koroniadis@cityu.gr
"""


# ────────────────────────────────────────────────────────────────────
# main
# ────────────────────────────────────────────────────────────────────

def main() -> None:
    if "--gate-selftest" in sys.argv:
        gate_selftest()

    for f in [APP / "index.html", APP / "styles.css", APP / "app.js",
              APP / "mifchart.js", APP / "remarksearch.js", APP / "schedval.js",
              APP / "description.js",
              APP / "assets" / "364mea.png", DATA / "flowchart2.json"]:
        if not f.is_file():
            fail(f"missing source file: {f}")
    if not NO_TRANSPILE:
        esbuild_exe()   # resolve + version-check up front

    index_html = read_text(APP / "index.html")
    css = patch_css(read_text(APP / "styles.css"))
    appjs_raw = prepare_appjs()
    mifchart_raw = prepare_mifchart()
    remarksearch_raw = read_text(APP / "remarksearch.js")
    description_raw = read_text(APP / "description.js")
    schedval_raw = prepare_schedval()
    gallery_raw = extract_gallery(read_text(APP / "app.js"))
    prepaint_raw = extract_prepaint(index_html)

    for name, src in [("styles.css", css), ("app.js", appjs_raw),
                      ("mifchart.js", mifchart_raw), ("remarksearch.js", remarksearch_raw),
                      ("description.js", description_raw), ("schedval.js", schedval_raw)]:
        if re.search(r"</(script|style)", src, re.I):
            fail(f"{name} contains a '</script'/'</style' sequence — inline-unsafe")

    png = (APP / "assets" / "364mea.png").read_bytes()
    emblem_uri = "data:image/png;base64," + base64.b64encode(png).decode("ascii")

    # ── transpile EVERYTHING that ships as inline JS ──
    t = transpile
    prepaint_js = t("prepaint", prepaint_raw)
    shims_js = t("runtime-shims", RUNTIME_SHIMS_JS)
    fetch_js = t("fetch-shim", FETCH_SHIM_JS)
    appjs = t("app.js", appjs_raw)
    mifchart = t("mifchart.js", mifchart_raw)
    remarksearch = t("remarksearch.js", remarksearch_raw)
    description = t("description.js", description_raw)
    feedback = t("feedback", FEEDBACK_JS)
    schedval = t("schedval.js", schedval_raw)
    gallery = t("gallery", gallery_raw)
    adapter = t("validate-adapter", VALIDATE_ADAPTER_JS)

    # ── artifact 1: Phase2-FDMS.html ──
    bundle = collect_data()
    data_js = data_bundle_js(bundle)          # generated ES5-safe object literal
    scripts_main = "\n".join([
        script_tag("Fx72 runtime shims (build_offline.py)", shims_js),
        script_tag(f"Embedded data bundle — {len(bundle)} JSON files", data_js),
        script_tag("Offline fetch shim", fetch_js),
        script_tag("app.js (loader block neutralized by build_offline.py)", appjs),
        script_tag("mifchart.js", mifchart),
        script_tag("remarksearch.js", remarksearch),
        script_tag("description.js", description),
        script_tag("Offline feedback module (build_offline.py)", feedback),
    ])
    html_main = build_main_html(css, emblem_uri, prepaint_js, scripts_main)

    # ── artifact 2: Phase2-Validate.html ──
    vbundle = collect_validate_data()
    vdata_js = data_bundle_js(vbundle)
    scripts_val = "\n".join([
        script_tag("Fx72 runtime shims (build_offline.py)", shims_js),
        script_tag("Embedded data bundle — flowchart2.json", vdata_js),
        script_tag("Offline fetch shim", fetch_js),
        script_tag("schedval.js", schedval),
        script_tag("Theme gallery (lifted from app.js)", gallery),
        script_tag("Validate standalone boot (build_offline.py)", adapter),
    ])
    html_val = build_validate_html(css, emblem_uri, prepaint_js, scripts_val)

    # ── QUALITY GATE (hard fail — nothing is written on violation) ──
    notes = run_gate(html_main, "Phase2-FDMS.html")
    notes += run_gate(html_val, "Phase2-Validate.html")

    # ── write ──
    EXPORT.mkdir(parents=True, exist_ok=True)
    OUT_HTML.write_text(html_main, encoding="utf-8", newline="\n")
    OUT_VALIDATE.write_text(html_val, encoding="utf-8", newline="\n")
    size = OUT_HTML.stat().st_size
    size_val = OUT_VALIDATE.stat().st_size
    OUT_README.write_text(
        README_TEMPLATE.format(size_mb=f"{size / 1048576:.0f}",
                               size_val_mb=f"{size_val / 1048576:.1f}"),
        encoding="utf-8-sig", newline="\r\n")

    print(f"data bundle : {len(bundle)} JSON files, "
          f"{sum(len(json.dumps(v, ensure_ascii=False)) for v in bundle.values()) / 1e6:.1f} MB raw"
          f"  (+ flowchart2.json for Validate)")
    print(f"emblem      : {len(png)} bytes PNG -> {len(emblem_uri)} chars data URI")
    print(f"transpile   : esbuild {ESBUILD_VERSION} --target={ES_TARGET}"
          + ("  ** SKIPPED (--no-transpile) **" if NO_TRANSPILE else ""))
    print(f"output      : {OUT_HTML}  ({size:,} bytes = {size / 1048576:.2f} MB)")
    print(f"output      : {OUT_VALIDATE}  ({size_val:,} bytes = {size_val / 1048576:.2f} MB)")
    print(f"readme      : {OUT_README}")
    for x in notes:
        print(f"css note    : {x}")
    if size > MAX_BYTES:
        fail(f"main output exceeds the {MAX_BYTES // 1048576} MB guard")
    if size_val > MAX_BYTES_VALIDATE:
        fail(f"validate output exceeds the {MAX_BYTES_VALIDATE // 1048576} MB guard")
    print("OK")


if __name__ == "__main__":
    main()
