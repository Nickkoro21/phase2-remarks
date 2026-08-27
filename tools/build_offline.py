# -*- coding: utf-8 -*-
r"""
build_offline.py — deterministic single-file export of Phase 2 FDMS for the
unit's CLOSED network.

WHAT CHANGED ON 28/08/2026 (Round 22 — THE WHOLE APP, ONE FILE)
  User order: «Ετοίμασε το export του Phase II FDMS όπως είναι τώρα. Προσοχή:
  πρέπει να είναι όλα ΕΝΑ λειτουργικό HTML και να τρέχει στο παλαιολιθικό
  Firefox του κλειστού δικτύου της μονάδας.»

  Two things follow from that sentence and both break the old builder:

  1. ΟΛΑ — ONE file, THE WHOLE APP.  Until today the export was a syllabus
     tool: Scheduler, Currency, Flowchart and Bridge were cut out because the
     roster travelled with them.  It does not travel any more — the export
     ships an EMPTY STORE (data/scheduler/seed.json is replaced by `{}` at
     build time) and the unit loads its own data on site through the app's own
     ⭱ Import, behind «⋯» + the edit lock + the typed word.  So every module
     ships, every tab is live, and nothing roster-derived is inside the file.
     The one module that still does NOT travel is app/schedsync.js: it talks to
     GitHub over the network, which on a closed network can only fail and would
     put a live https endpoint in the file.

  2. ΠΑΛΑΙΟΛΙΘΙΚΟ — the floor drops from Firefox 72 to **Firefox 52 ESR**.
     See § FLOOR below: this is a WORKING ASSUMPTION and it contradicts the
     evidence in specs/offline-export-spec.md § 1.  It is deliberately the
     safer of the two.

FLOOR — READ THIS BEFORE MOVING IT
  specs/offline-export-spec.md § 1 records the unit's browser as **Firefox
  72.0.2 (64-bit) on Windows 10**, on the evidence of three photographs the
  user took at the unit on 12/08/2026 (they are still in D:\FDMS-export as
  viber_image_2026-08-12_*.jpg; the middle one shows the About box reading
  "72.0.2 (64-bit)" with this app's own footer below it).  That is a hard,
  first-hand fact and it has not been retracted.

  The 28/08 order calls the browser "παλαιολιθικό" without naming a version,
  so this builder now targets **Firefox 52 ESR** — twenty releases BELOW the
  photographed browser.  Everything the 52 floor costs (grid-gap longhands, a
  typed date fallback, a clipboard fallback, a handful of extra shims) is
  inert on 72, so the lower floor is free insurance and the file still runs on
  72 exactly as before.  If the user confirms 72.0.2 is still what is on those
  machines, nothing needs rebuilding — but FLOOR below may then be raised to
  "firefox72" / ES_TARGET to "es2019" to get slightly smaller output.

LANGUAGE CONTRACT (spec § 2, floor-adjusted) — the app source stays modern;
the divergence lives only here:
  * every inline script is transpiled with **esbuild --target=es2017**
    (pinned 0.28.2 in tools/package.json; version drift hard-fails).
    es2017 IS the Firefox 52 syntax ceiling: FF52 is the release that shipped
    async/await, the last ES2017 syntax feature, and it has none of ES2018
    (object rest/spread → FF55, async generators / for-await → FF57, optional
    catch binding → FF58).  esbuild's own "firefox52" target cannot be used:
    its compat table calls for-of, destructuring and generators unsupported on
    52 and then refuses to lower them, which is wrong for Firefox (for-of FF13,
    destructuring FF2, generators FF26) and would abort the build.
  * FOUR builder-owned blocks are prepended before any app script —
      ① the CAPABILITY GUARD (hand-written ES5, first script in <head>): it
        feature-detects the floor and, below it, paints a plain-English banner
        naming exactly what is missing instead of a white page;
      ② the RUNTIME SHIMS (everything FF52 lacks that the app or the export's
        own code touches — each installed only if missing);
      ③ the OFFLINE FETCH SHIM (serves ../data/... from the embedded bundle);
      ④ the DATE-INPUT FALLBACK (FF52 has no date picker — <input type=date>
        degrades to a text box, so the export teaches it to accept a typed
        DD/MM/YYYY or YYYY-MM-DD and hands the app ISO either way).
  * CSS is patched for Fx52: :focus-visible→:focus, :has() rules dropped,
    min()/max()/clamp() and inset: and break-inside: get a same-property
    fallback emitted BEFORE the modern value, every gap: gets its grid-gap
    longhand, and a generated `html.no-flexgap` stylesheet restores the
    spacing of flex containers on browsers older than the flex-gap of FF63.
  * QUALITY GATE (hard fail): each emitted script must re-parse under esbuild,
    then a string/comment/regex-stripping scanner proves no ES2018+ syntax
    survived (including a bracket-aware OBJECT-spread detector that does not
    trip on array/call spread, which FF52 has), plus a checklist scan for
    Fx52-missing APIs; the final CSS is scanned for Fx53+ features.  The
    builder exits non-zero with the exact locations.

GATE HONESTY NOTE: esbuild at --target=es2017 *lowers* modern syntax instead
of rejecting it, so the esbuild pass proves "parses as JavaScript" (catches
assembly/concatenation bugs) while the stripping scanner is the layer that
proves "no ES2018+ syntax survived".  The scanner strips string literals,
template literals (with nested ${} expressions), comments and regex literals
(pragmatic first-token heuristic for / vs division — documented, good enough
for this codebase) before matching, so "?." inside remark text never
false-positives.

Flags:
  --stamp=YYYYMMDD  override the date stamp in the output filename
  --no-transpile    skip esbuild (DEMO ONLY: proves the quality gate trips on
                    un-transpiled input; the build then fails by design)
  --gate-selftest   run the scanner against known-good/known-bad snippets and
                    exit (regression test for the gate itself)

Deterministic: same inputs + pinned esbuild + same stamp -> byte-identical
output.  Re-run any time:  python tools/build_offline.py
"""

import base64
import datetime
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]          # D:\FDMS
APP = ROOT / "app"
DATA = ROOT / "data"
TOOLS = ROOT / "tools"
EXPORT = ROOT.parent / "FDMS-export"                # D:\FDMS-export (OUTSIDE the repo)

FLOOR = "Firefox 52 ESR"
ES_TARGET = "es2017"                                # == the Firefox 52 syntax ceiling
ESBUILD_VERSION = "0.28.2"                          # must match tools/package.json
MAX_BYTES = 20 * 1024 * 1024                        # hard size guard

NO_TRANSPILE = "--no-transpile" in sys.argv         # gate-demo mode only


def _stamp() -> str:
    for a in sys.argv[1:]:
        if a.startswith("--stamp="):
            v = a.split("=", 1)[1]
            if not re.fullmatch(r"\d{8}", v):
                sys.exit("BUILD FAILED: --stamp must be YYYYMMDD")
            return v
    return datetime.date.today().strftime("%Y%m%d")


STAMP = _stamp()
OUT_HTML = EXPORT / f"Phase2-FDMS-{STAMP}.html"
OUT_README = EXPORT / f"README-IT-{STAMP}.txt"


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


_ESBUILD = None


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
    """Run esbuild --target=es2017 over one script (stdin->stdout)."""
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


# Syntax above the Firefox 52 floor.  Object rest/spread is NOT here: it needs
# bracket context to tell `{...o}` (FF55) from `[...a]` / `f(...a)` (FF52 has
# both), so it has its own scanner below.
_SYNTAX_RULES = [
    (r"\?\.(?![0-9])", "optional chaining `?.` (ES2020 / Fx74)"),
    (r"\?\?", "nullish coalescing `??`/`??=` (ES2020 / Fx72)"),
    (r"\|\|=(?!=)", "logical assignment `||=` (ES2021 / Fx79)"),
    (r"&&=(?!=)", "logical assignment `&&=` (ES2021 / Fx79)"),
    (r"#[A-Za-z_$]", "private class field `#x` (ES2022 / Fx90)"),
    (r"(?<![\w$])\d[\d_]*_\d", "numeric separator (ES2021 / Fx70)"),
    (r"(?<![\w$])\d+n\b", "BigInt literal (ES2020 / Fx68)"),
    # ── new at the Fx52 floor ──
    (r"\bcatch\s*\{", "optional catch binding `catch {}` (ES2019 / Fx58)"),
    (r"\basync\s+function\s*\*", "async generator (ES2018 / Fx57)"),
    (r"\bfor\s+await\b", "for-await-of (ES2018 / Fx57)"),
    (r"\bnew\s+RegExp\s*\(\s*0\s*,\s*0*[a-z]*s", "RegExp `s` (dotAll) flag (ES2018 / Fx78)"),
    # esbuild rewrites an unsupported-flag literal into new RegExp(...), which
    # then throws at RUNTIME on the old engine — catch the rewrite, not the
    # literal.  Named groups / lookbehind survive as source text inside the
    # string argument, so they are matched on the RAW body (see below).
]

# Object rest/spread `{...x}` is ES2018 (Fx55).  Array spread `[...a]` and call
# spread `f(...a)` are ES2015 and fine on Fx52 — so the check has to know which
# bracket it is inside.
def scan_object_spread(name: str, stripped: str) -> list:
    bad, brackets = [], []
    i, n = 0, len(stripped)
    while i < n:
        c = stripped[i]
        if c in "([{":
            brackets.append(c)
        elif c in ")]}":
            if brackets:
                brackets.pop()
        elif c == "." and stripped[i:i + 3] == "...":
            if brackets and brackets[-1] == "{":
                ln = stripped.count("\n", 0, i) + 1
                ctx = stripped.splitlines()[ln - 1].strip()[:90]
                bad.append(f"{name}:{ln}: object rest/spread `{{...}}` (ES2018 / Fx55)  →  {ctx}")
            i += 3
            continue
        i += 1
    return bad


# APIs missing in Fx52.  kind:
#   shimmed     — allowed, the prepended shim block provides it
#   guarded     — allowed only when the same script also contains the guard text
#   forbidden   — hard fail
_API_RULES = [
    # provided by the shim block
    (r"\bstructuredClone\s*\(", "structuredClone (Fx94)", "shimmed", None),
    (r"crypto\.randomUUID", "crypto.randomUUID (Fx95)", "shimmed", None),
    (r"\.replaceAll\s*\(", "String.replaceAll (Fx77)", "shimmed", None),
    (r"\.at\s*\(", ".at() (Fx90)", "shimmed", None),
    (r"Object\.hasOwn\b", "Object.hasOwn (Fx92)", "shimmed", None),
    (r"\bglobalThis\b", "globalThis (Fx65)", "shimmed", None),
    (r"Object\.fromEntries\b", "Object.fromEntries (Fx63)", "shimmed", None),
    (r"\.flatMap\s*\(", "Array.flatMap (Fx62)", "shimmed", None),
    (r"(?<!\.)\.flat\s*\(", "Array.flat (Fx62)", "shimmed", None),
    (r"\.trimStart\s*\(", "String.trimStart (Fx61)", "shimmed", None),
    (r"\.trimEnd\s*\(", "String.trimEnd (Fx61)", "shimmed", None),
    (r"\.matchAll\s*\(", "String.matchAll (Fx67)", "shimmed", None),
    (r"Promise\.allSettled\s*\(", "Promise.allSettled (Fx71)", "shimmed", None),
    (r"\.finally\s*\(", "Promise.finally (Fx58)", "shimmed", None),
    (r"\.replaceChildren\s*\(", "Element.replaceChildren (Fx86)", "shimmed", None),
    (r"\.toggleAttribute\s*\(", "Element.toggleAttribute (Fx63)", "shimmed", None),
    (r"\bqueueMicrotask\s*\(", "queueMicrotask (Fx69)", "shimmed", None),
    (r"\bfindLast(?:Index)?\s*\(", "findLast/findLastIndex (Fx104)", "shimmed", None),
    (r"navigator\.clipboard", "navigator.clipboard (Fx63)", "shimmed", None),
    # no shim is possible / sensible — these must not appear at all
    (r"\bIntersectionObserver\b", "IntersectionObserver (Fx55)", "forbidden", None),
    (r"\bResizeObserver\b", "ResizeObserver (Fx69)", "forbidden", None),
    (r"\bAbortController\b", "AbortController (Fx57)", "forbidden", None),
    (r"AbortSignal\s*\.", "AbortSignal statics (Fx88+)", "forbidden", None),
    (r"Intl\.(?:RelativeTimeFormat|ListFormat|Segmenter|DisplayNames)",
     "newer Intl API (Fx>52)", "forbidden", None),
    (r"Promise\.any\s*\(", "Promise.any (Fx79)", "forbidden", None),
    (r"showOpenFilePicker|showDirectoryPicker", "File System Access picker", "forbidden", None),
    (r"showSaveFilePicker", "showSaveFilePicker (no Firefox support)",
     "guarded", "typeof window.showSaveFilePicker"),
    # Blob/File .text() is Fx69. Two shapes are accepted:
    #   · `if (x.text) return x.text();` — the FileReader fallback the store,
    #     the scheduler and the Bridge all use;
    #   · code that can only run inside the File System Access tier, which
    #     Firefox does not have at all (the feedback module's shared-file path).
    (r"(?<![\w.$])\b(?:file|blob|f|b)\.text\s*\(\s*\)", "Blob/File.text() (Fx69)",
     "guarded", [".text)", "typeof window.showSaveFilePicker"]),
]

# Regex syntax that esbuild turns into a `new RegExp("…")` STRING — the source
# text survives, so this pair is matched on the raw (un-stripped) body.
_RAW_RULES = [
    (r"new RegExp\(\"[^\"]*\(\?<[=!]", "RegExp lookbehind (ES2018 / Fx78)"),
    (r"new RegExp\(\"[^\"]*\(\?<[A-Za-z_$]", "RegExp named capture group (ES2018 / Fx78)"),
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
    bad += scan_object_spread(name, stripped)
    for pat, label in _RAW_RULES:
        for m in re.finditer(pat, body):
            bad.append(f"{name}:{_line_of(body, m.start())}: {label}")
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
            guards = guard if isinstance(guard, (list, tuple)) else [guard]
            if any(g and g in body for g in guards):
                continue
            bad.append(f"{name}:{_line_of(stripped, hits[0].start())}: {label} without its guard")
            continue
        bad.append(f"{name}:{_line_of(stripped, hits[0].start())}: {label} — no shim, {FLOOR} breaks")
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
    (r":focus-visible", ":focus-visible (Fx85 — invalidates the whole rule)"),
    (r"content-visibility", "content-visibility"),
    (r"@layer", "@layer"),
    (r"@container", "@container"),
    (r"conic-gradient\(", "conic-gradient (Fx83)"),
    (r"backdrop-filter", "backdrop-filter (Fx103)"),
    (r"overflow:\s*clip", "overflow:clip (Fx81)"),
    (r"(?<![\w-])inset\s*:", "inset shorthand (Fx66)"),
    (r"(?<![\w-])subgrid", "subgrid (Fx71)"),
    (r"text-wrap\s*:", "text-wrap (Fx121)"),
    (r"scrollbar-(?:width|color)\s*:", "scrollbar-width/color (Fx64)"),
    (r"(?<![\w-])contain\s*:", "contain (Fx69)"),
    (r"overscroll-behavior", "overscroll-behavior (Fx59)"),
    (r"text-decoration-thickness", "text-decoration-thickness (Fx70)"),
    (r"::marker", "::marker (Fx68)"),
    (r"(?<![\w-])env\(", "env() (Fx65)"),
]
_CSS_INFO = [  # degrade silently on the floor — reported, not fatal
    (r"accent-color", "accent-color (Fx92) — checkboxes fall back to the native look"),
    (r"color-scheme", "color-scheme (Fx96) — print block only, harmless"),
    (r"prefers-reduced-motion", "prefers-reduced-motion (Fx63) — the @media block is "
                                "ignored, so animations simply keep running"),
    (r"-webkit-line-clamp", "-webkit-line-clamp (Fx68) — the text is not clamped, it wraps"),
    (r"(?<![\w-])gap\s*:", "gap: — every one carries its grid-gap longhand, and the "
                           "generated html.no-flexgap sheet restores the flex ones"),
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
        decl_start = max(css.rfind(";", 0, m.start()), css.rfind("{", 0, m.start())) + 1
        pm = re.match(r"\s*([a-zA-Z-]+)\s*:", css[decl_start:m.start()])
        prop = pm.group(1) if pm else "?"
        block_start = css.rfind("{", 0, decl_start)
        fallback = re.search(r"(?:[;{]|^)\s*" + re.escape(prop) + r"\s*:",
                             css[block_start:decl_start - 1])
        if not fallback:
            bad.append(f"{name}:{_line_of(css, m.start())}: `{prop}: …{css[m.start():m.start()+18]}…` "
                       f"has no same-property fallback before it (Fx75 drops it)")
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
    shim_present = any("Fx52 runtime shims" in s for s in scripts)
    if not shim_present:
        fail(f"{page}: the runtime shim block is missing")
    bad, notes = [], []
    for idx, body in enumerate(scripts):
        mlab = re.search(r"/\* ═+ (.+?) ═+ \*/", body)
        name = f"{page}[script#{idx} {(mlab.group(1) if mlab else 'head')}]"
        if not NO_TRANSPILE:
            esbuild_pass(body, name, "gate re-parse")     # true parser layer
        if "Fx52 runtime shims" in body or "FDMS capability guard" in body:
            # the shim block IS the API provider, and the capability guard runs
            # BEFORE it — both are syntax-scanned only.
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
        for x in bad[:60]:
            print("  ✗ " + x, file=sys.stderr)
        if len(bad) > 60:
            print(f"  … and {len(bad) - 60} more", file=sys.stderr)
        fail(f"{page} would not run on {FLOOR} — nothing was written")
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
        ("try { x(); } catch { y(); }", "optional catch binding"),
        ("const o = {...a, b: 1};", "object spread"),
        ("const {a, ...rest} = o;", "object rest"),
        ("async function* g(){}", "async generator"),
        ("for await (const x of y) {}", "for-await"),
        ('const r = new RegExp("(?<y>a)");', "named capture group"),
        ("const q = new IntersectionObserver(f);", "IntersectionObserver"),
    ]
    cases_good = [
        'const s = "no ?. here ?? really";',
        "const r = /ab?./g; const t = `x ${a ? b : c} ?.`;",
        "const u = 'tpl ${a?.b} not code'; // a?.b in comment",
        "const q = x ? .5 : y;",
        'el.innerHTML = `<a href="?x=1&y=2">${esc(v)}</a>`;',
        "const arr = [...a, ...b]; f(...arr);",              # array/call spread: Fx52 OK
        "function g(...args) { return Math.max(...args); }",  # rest params: Fx52 OK
        "try { x(); } catch (e) { y(); }",
    ]
    ok = True
    for src, why in cases_bad:
        hits = gate_scan_script("selftest", src, shim_present=False)
        if not hits:
            ok = False
            print(f"SELFTEST FAIL: missed {why}: {src}")
    for src in cases_good:
        hits = gate_scan_script("selftest", src, shim_present=True)
        if hits:
            ok = False
            print(f"SELFTEST FAIL: false positive on: {src}\n  {hits}")
    print("gate selftest:", "PASS" if ok else "FAIL")
    sys.exit(0 if ok else 1)


# ────────────────────────────────────────────────────────────────────
# 2. CSS patch for Fx52 (source stays modern — export-only rewrites)
# ────────────────────────────────────────────────────────────────────

def _blank_comments(css: str) -> str:
    """A same-length copy of the stylesheet with every /* … */ interior turned
    into spaces (newlines kept). Structure scanning and selector extraction run
    on THIS copy, so a `{` inside a Greek comment cannot desynchronise the brace
    walk and a comment sitting above a rule cannot end up glued into the
    selector the flex-gap fallback is generated from. Offsets are identical, so
    the bodies are still sliced out of the real stylesheet."""
    def blank(m):
        return "".join("\n" if ch == "\n" else " " for ch in m.group(0))
    return re.sub(r"/\*.*?\*/", blank, css, flags=re.S)


def _leaf_blocks(real_css: str):
    """Yield (at_rule_stack, selector, body_start, body_end) for every INNERMOST
    rule block (a block whose body holds declarations, not other blocks).
    The stack is the list of enclosing at-rule preludes, outermost first, so a
    generated fallback can be re-emitted inside the same @media."""
    css = _blank_comments(real_css)
    stack, out = [], []
    i, n, seg_start = 0, len(css), 0
    while i < n:
        c = css[i]
        if c == "{":
            prelude = css[seg_start:i].strip()
            # find the matching close and see whether it contains another block
            depth, j = 1, i + 1
            inner = False
            while j < n and depth:
                if css[j] == "{":
                    depth += 1
                    inner = True
                elif css[j] == "}":
                    depth -= 1
                j += 1
            if inner or prelude.startswith("@"):
                stack.append(prelude)
                i += 1
                seg_start = i
                continue
            close = css.index("}", i)
            out.append((list(stack), prelude, i + 1, close))
            i = close + 1
            seg_start = i
            continue
        if c == "}":
            if stack:
                stack.pop()
            i += 1
            seg_start = i
            continue
        i += 1
    return out


_LEN = r"[-\w.%()+ /*]+"


def _split_gap(v: str):
    """`gap: 4px 10px` → (row, col); `gap: 6px` → (6px, 6px)."""
    parts = v.strip().split()
    if len(parts) == 1:
        return parts[0], parts[0]
    return parts[0], parts[1]


def _prefix_selector(sel: str, tail: str) -> str:
    """`.a, .b:hover` → `html.no-flexgap .a TAIL, html.no-flexgap .b:hover TAIL`.
    A selector that already starts at the root gets the class welded on instead
    of prefixed, or `html.no-flexgap html.light .x` would never match."""
    outs = []
    for one in sel.split(","):
        one = one.strip()
        if not one:
            continue
        if one.startswith("html"):
            one = "html.no-flexgap" + one[len("html"):]
        elif one.startswith(":root"):
            one = ":root.no-flexgap" + one[len(":root"):]
        else:
            one = "html.no-flexgap " + one
        outs.append(one + " " + tail)
    return ", ".join(outs)


def patch_css(css: str) -> tuple:
    """Returns (patched_css, notes). Every rewrite is mechanical and reversible;
    nothing changes what a MODERN browser renders (each fallback is emitted
    BEFORE the modern declaration, or behind html.no-flexgap)."""
    notes = []

    # ── 1. :focus-visible (Fx85) → :focus. On the floor the unknown
    #       pseudo-class would invalidate the WHOLE rule; :focus is the
    #       graceful export behaviour. Count is reported, not asserted: the
    #       rewrite is total, so a new focus ring cannot slip past it.
    css, n_fv = re.subn(r":focus-visible", ":focus", css)
    notes.append(f":focus-visible → :focus ×{n_fv}")

    # ── 2. :has() rules (Fx121) — the rule would be dropped silently anyway;
    #       strip it explicitly so the gate stays clean.
    def drop_has(m):
        # the replacement text must not itself contain the forbidden token —
        # the CSS gate scans the FINAL stylesheet, comments included.
        return "/* [offline] has-selector rule dropped for the floor */\n"
    css, n_has = re.subn(r"[^{}\n]*:has\([^)]*\)[^{}]*\{[^}]*\}\n?", drop_has, css)
    notes.append(f":has() rules dropped ×{n_has}")

    # ── 3. per-declaration fallbacks inside every innermost rule block ──
    #       (walked back-to-front so the offsets stay valid)
    n_minmax = n_gap = n_inset = n_break = 0
    flex_rules = []          # (at_stack, selector, row, col, direction, wrap)
    orphan_gap = []          # gap on a rule nothing proves is a flex container
    blocks = _leaf_blocks(css)
    # DETECTION reads a comment-blanked copy (same offsets) so that a rule
    # commented out, or a comment that talks about gap, cannot be mistaken for
    # a declaration; the SUBSTITUTIONS below rewrite the real body.
    blank = _blank_comments(css)
    # every selector any rule declares display:flex on — so that a MEDIA-QUERY
    # OVERRIDE (`@media … { .fc-vrow { flex-direction: column; gap: 4px } }`),
    # which carries the gap but not the display, is still recognised.
    known_flex = set()
    for _at, _sel, _b0, _b1 in blocks:
        if re.search(r"display\s*:\s*(inline-)?flex", blank[_b0:_b1]):
            for part in _sel.split(","):
                known_flex.add(part.strip())
    for at_stack, sel, b0, b1 in reversed(blocks):
        body = css[b0:b1]
        new = body

        # 3a. inset: T R B L (Fx66) → the four longhands (total replacement:
        #     the shorthand has no fallback value, it simply must not be used)
        def inset_repl(m):
            parts = m.group(1).strip().split()
            if len(parts) == 1:
                t = r = b = l = parts[0]
            elif len(parts) == 2:
                t = b = parts[0]; r = l = parts[1]
            elif len(parts) == 3:
                t, r, b = parts; l = r
            else:
                t, r, b, l = parts[:4]
            return f"top:{t};right:{r};bottom:{b};left:{l}"
        new, k = re.subn(r"(?<![\w-])inset\s*:\s*([^;}]+)", inset_repl, new)
        n_inset += k

        # 3b. break-inside (Fx65 unprefixed) → the legacy page-break-inside first
        def brk_repl(m):
            return f"page-break-inside:{m.group(1)};break-inside:{m.group(1)}"
        new, k = re.subn(r"(?<![\w-])break-inside\s*:\s*([^;}]+)", brk_repl, new)
        n_break += k

        # 3c. gap / row-gap / column-gap → the grid-* longhand first.
        #     Fx52 shipped CSS Grid with grid-gap; the unprefixed forms are
        #     Fx61 (grid) and Fx63 (flex). On a FLEX container Fx52 ignores
        #     both — that is what § 3d below is for.
        def gap_repl(m):
            prop, val = m.group(1), m.group(2).strip()
            legacy = {"gap": "grid-gap", "row-gap": "grid-row-gap",
                      "column-gap": "grid-column-gap"}[prop]
            return f"{legacy}:{val};{prop}:{val}"
        new, k = re.subn(r"(?<![\w-])(gap|row-gap|column-gap)\s*:\s*([^;}]+)", gap_repl, new)
        n_gap += k

        # 3d. collect the flex containers that rely on gap, for the generated
        #     html.no-flexgap sheet (read from the comment-blanked copy)
        probe = blank[b0:b1]
        gm = re.search(r"(?<![\w-])gap\s*:\s*([^;}]+)", probe)
        rgm = re.search(r"(?<![\w-])row-gap\s*:\s*([^;}]+)", probe)
        cgm = re.search(r"(?<![\w-])column-gap\s*:\s*([^;}]+)", probe)
        if gm or rgm or cgm:
            row, col = ("0", "0")
            if gm:
                row, col = _split_gap(gm.group(1))
            if rgm:
                row = rgm.group(1).strip()
            if cgm:
                col = cgm.group(1).strip()
            dm = re.search(r"display\s*:\s*(inline-)?(flex|grid)", probe)
            fd = re.search(r"flex-direction\s*:\s*([\w-]+)", probe)
            fw = re.search(r"flex-wrap\s*:\s*([\w-]+)", probe)
            # a rule is a flex container when it says so, when another rule says
            # so for the same selector (the media-query override case), or when
            # it sets a flex-only property
            is_flex = bool(dm and dm.group(2) == "flex") or (
                not dm and (bool(fd) or bool(fw)
                            or any(p.strip() in known_flex for p in sel.split(","))))
            if is_flex:
                column = bool(fd and "column" in fd.group(1))
                wrap = bool(fw and fw.group(1).strip() == "wrap")
                flex_rules.append((at_stack, sel, row, col, column, wrap))
            elif not dm:
                orphan_gap.append(sel.strip()[:60])

        # 3e. min()/max()/clamp() (Fx75) → a same-property fallback BEFORE the
        #     modern declaration. Fx52 drops the declaration it cannot parse and
        #     keeps the fallback; modern browsers apply the later one.
        #     The fallback value is the FIRST argument, plus max-width/max-height
        #     for the classic `width: min(Npx, Nvw)` shape, which is what every
        #     current call site is.
        def mm_repl(m):
            prop, fn, args = m.group(1), m.group(2), m.group(3)
            first = args.split(",")[0].strip()
            rest = [a.strip() for a in args.split(",")[1:]]
            fb = f"{prop}:{first};"
            if fn == "min" and prop in ("width", "height") and len(rest) == 1:
                fb += f"max-{prop}:{rest[0]};"
            return fb + f"{prop}:{fn}({args})"
        new, k = re.subn(
            r"(?<![\w-])([a-z-]+)\s*:\s*(min|max|clamp)\(([^()]*)\)",
            mm_repl, new)
        n_minmax += k

        if new != body:
            css = css[:b0] + new + css[b1:]

    notes.append(f"gap → grid-gap longhand ×{n_gap}")
    notes.append(f"inset: → four longhands ×{n_inset}")
    notes.append(f"break-inside → page-break-inside first ×{n_break}")
    notes.append(f"min()/max()/clamp() same-property fallback ×{n_minmax}")

    # ── 4. THE GENERATED FLEX-GAP SHEET ───────────────────────────────────
    #    Firefox grew `gap` on flex containers in 63. Below that, 133 of this
    #    app's layouts would collapse to zero spacing. The sheet below restores
    #    them with margins and is gated behind `html.no-flexgap`, a class the
    #    capability guard sets ONLY when the live feature test says flex gap is
    #    missing — so on Fx63+ (and on the photographed Fx72) not one of these
    #    rules can ever match.
    out = ["\n/* ══════════════════════════════════════════════════════════════",
           " * GENERATED BY tools/build_offline.py — flex-gap fallback",
           " * Firefox grew `gap` on FLEX containers in 63; `grid-gap` (emitted",
           " * above next to every gap) covers GRID as far back as 52. These",
           " * rules restore the flex spacing with margins and are switched on",
           " * only by the capability guard's live test (html.no-flexgap).",
           " * ══════════════════════════════════════════════════════════════ */"]
    def zero(v):
        return v.strip() in ("0", "0px", "0em", "0rem", "normal", "")

    seen = set()
    # the blocks were walked back-to-front (so the string offsets stayed valid);
    # the SHEET has to come out in source order or a @media override would be
    # emitted before the base rule it is meant to beat.
    for at_stack, sel, row, col, column, wrap in reversed(flex_rules):
        decl = {}
        if column:
            tail = "> * + *"
            if not zero(row):
                decl["margin-top"] = row
        elif wrap:
            tail = "> *"
            if not zero(col):
                decl["margin-right"] = col
            if not zero(row):
                decl["margin-bottom"] = row
        else:
            tail = "> * + *"
            if not zero(col):
                decl["margin-left"] = col
        # a selector that already carries a fallback is being OVERRIDDEN here
        # (the @media narrow-screen rules flip row→column): the axes this rule
        # does NOT set must be zeroed, or the base rule's margin survives into
        # the new direction as a stray indent.
        if sel.strip() in seen:
            for prop in ("margin-top", "margin-right", "margin-bottom", "margin-left"):
                decl.setdefault(prop, "0")
        seen.add(sel.strip())
        if not decl:
            continue
        rule = _prefix_selector(sel, tail) + "{" + \
            ";".join(f"{k}:{v}" for k, v in decl.items()) + "}"
        for at in reversed(at_stack):
            rule = at + "{" + rule + "}"
        out.append(rule)
    notes.append(f"flex-gap fallback rules generated ×{len(flex_rules)} "
                 f"(behind html.no-flexgap)")
    if orphan_gap:
        notes.append("gap without display: in the same rule (grid-gap only, "
                     f"no flex fallback): {', '.join(orphan_gap)}")
    return css + "\n".join(out) + "\n", notes


# ────────────────────────────────────────────────────────────────────
# 3. Data bundle
# ────────────────────────────────────────────────────────────────────

# THE EMPTY STORE (28/08/2026 order). The app seeds itself from
# ../data/scheduler/seed.json on the very first open. The repo's seed is the
# PUBLIC placeholder roster; even that does not travel. The export ships `{}`:
# every collection comes up empty and is persisted empty, so the store is
# genuinely seeded (no seedError banner, ↺ Reset returns to empty) and the unit
# loads its own data on site through Scheduler → «⋯» → ⭱ Import.
EMPTY_SEED = {}


def collect_data() -> dict:
    files = [
        DATA / "observations" / "master_index.json",   # app.js + remarksearch.js
        DATA / "minimums.json",                        # mifchart.js
        DATA / "manifest.json",                        # mifchart.js (source-jump)
        DATA / "descriptions.json",                    # description.js — the grammar
        DATA / "sections.json",                        # description.js — MISSION/OBJECTIVE
        DATA / "areas.json",                           # description.js — working areas
        DATA / "routes.json",                          # description.js — CPM routes
        DATA / "ep_list.json",                         # description.js — the 71 EPs
        DATA / "flowchart2.json",                      # description/flowchart/scheduler/schedval
    ]
    files += sorted((DATA / "observations2").rglob("*.json"))   # item remarks (v2)
    files += sorted((DATA / "criteria").glob("*.json"))         # Info modal
    files += sorted((DATA / "mif").glob("*.json"))              # MIF progression
    files += sorted((DATA / "requirements").glob("*.json"))     # req view + currency catalog
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

    # the store's seed — bundled EMPTY on purpose (see EMPTY_SEED above)
    real_seed = DATA / "scheduler" / "seed.json"
    if not real_seed.is_file():
        fail(f"missing data file: {real_seed} (the repo seed must exist even though "
             f"the export ships an empty one — its absence means the layout changed)")
    bundle["data/scheduler/seed.json"] = EMPTY_SEED
    return bundle


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
# 4. Builder-owned scripts
# ────────────────────────────────────────────────────────────────────

# ① THE CAPABILITY GUARD — the FIRST script in <head>.
#    HAND-WRITTEN ES5 ON PURPOSE. Every other block in this file is ES2017, so
#    on a browser below the floor those blocks die with a SyntaxError at PARSE
#    time and never run — which is exactly the white page this guard exists to
#    prevent. It must therefore parse on an engine that has no arrow functions,
#    no `const`, no template literals. Do not "modernise" it.
#    Marker string for the gate: FDMS capability guard
CAPABILITY_GUARD_JS = r"""
/* FDMS capability guard — build_offline.py. ES5 ONLY (see the note in the
   builder): this block has to parse on a browser too old for the rest.
   It does two things:
     · below the floor → paints a plain-English banner naming what is missing,
       instead of leaving a white page or a half-rendered screen;
     · on the floor but without flex `gap` (Firefox < 63) → sets
       html.no-flexgap, which switches on the generated fallback stylesheet. */
(function () {
  "use strict";
  var missing = [];
  function need(label, test) {
    var ok = false;
    try { ok = !!test(); } catch (e) { ok = false; }
    if (!ok) missing.push(label);
  }
  /* syntax the transpiled bundle still needs (ES2015/2017) — probed with
     new Function so a SyntaxError is caught instead of killing this script */
  need("modern JavaScript (arrow functions, let/const, classes, template literals)",
    function () { new Function("let a=1;const b=(x)=>`${x}`;class C{};return b(a)"); return true; });
  need("async functions (async/await)",
    function () { new Function("return (async function(){ await 0; });")(); return true; });
  need("Promise", function () { return typeof Promise === "function"; });
  need("Map and Set", function () { return typeof Map === "function" && typeof Set === "function"; });
  need("Symbol", function () { return typeof Symbol === "function"; });
  need("Object.assign", function () { return typeof Object.assign === "function"; });
  need("Object.entries", function () { return typeof Object.entries === "function"; });
  need("Array.from", function () { return typeof Array.from === "function"; });
  need("String.padStart", function () { return typeof "".padStart === "function"; });
  need("localStorage (needed to keep the scheduler data on this computer)",
    function () { window.localStorage.setItem("p2r-probe", "1");
                  window.localStorage.removeItem("p2r-probe"); return true; });
  need("Blob and URL.createObjectURL (needed by Export)",
    function () { return typeof Blob === "function" && typeof URL !== "undefined" &&
                         typeof URL.createObjectURL === "function"; });
  need("FileReader (needed by Import)", function () { return typeof FileReader === "function"; });
  need("CSS custom properties (needed by every colour in this page)",
    function () { return window.CSS && CSS.supports && CSS.supports("--a", "0"); });
  need("CSS Grid", function () { return window.CSS && CSS.supports && CSS.supports("display", "grid"); });

  var WARN = [];
  /* not fatal — the app says so itself where it matters, but naming it here
     saves the reader a hunt */
  try {
    if (!(window.crypto && window.crypto.subtle)) {
      WARN.push("Web Crypto is unavailable, so the editor code cannot be set on this " +
                "computer — the scheduler will stay in view-only mode.");
    }
  } catch (e) {}

  function banner() {
    var d = document.createElement("div");
    d.setAttribute("style",
      "position:fixed;inset:0;left:0;top:0;right:0;bottom:0;z-index:2147483647;" +
      "background:#0b1220;color:#e6edf6;font:15px/1.6 Segoe UI,Tahoma,sans-serif;" +
      "padding:6vh 6vw;overflow:auto");
    var li = "";
    for (var i = 0; i < missing.length; i++) {
      li += "<li style=\"margin:6px 0\">" + missing[i] + "</li>";
    }
    d.innerHTML =
      "<h1 style=\"font-size:22px;margin:0 0 10px\">Phase 2 FDMS cannot run in this browser</h1>" +
      "<p style=\"margin:0 0 14px;color:#9fb3c8\">This file was built for " +
      "<strong>Firefox 52 or newer</strong>. The browser that opened it is missing " +
      "the following, and the page would otherwise come up blank or half-drawn:</p>" +
      "<ul style=\"margin:0 0 18px 20px;padding:0\">" + li + "</ul>" +
      "<p style=\"margin:0;color:#9fb3c8\">Nothing is broken and no data was lost — " +
      "open the same file in a newer Firefox, or in Chrome or Edge, and it will work. " +
      "If none of those is available on this computer, hand this message to the IT " +
      "department: it names exactly what the browser lacks.</p>";
    if (document.body) {
      while (document.body.firstChild) document.body.removeChild(document.body.firstChild);
      document.body.appendChild(d);
    } else {
      document.addEventListener("DOMContentLoaded", banner);
    }
  }

  /* flex `gap` (Firefox 63) — a live test, because no CSS.supports() query can
     tell flex gap from grid gap. Runs first thing on DOMContentLoaded: this is
     the first script in the document, so its listener is also the first to
     fire, before any app module paints. */
  function flexGapTest() {
    try {
      var box = document.createElement("div");
      box.style.display = "flex";
      box.style.flexDirection = "column";
      box.style.rowGap = "1px";
      box.style.position = "absolute";
      box.style.visibility = "hidden";
      box.appendChild(document.createElement("div"));
      box.appendChild(document.createElement("div"));
      document.body.appendChild(box);
      var ok = box.scrollHeight === 1;
      box.parentNode.removeChild(box);
      if (!ok) document.documentElement.className += " no-flexgap";
    } catch (e) { /* leave the modern path alone if the probe itself fails */ }
  }

  if (missing.length) {
    banner();
    if (window.console && console.error) {
      console.error("[FDMS] below the browser floor — missing: " + missing.join(" · "));
    }
    return;
  }
  for (var w = 0; w < WARN.length; w++) {
    if (window.console && console.warn) console.warn("[FDMS] " + WARN[w]);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", flexGapTest);
  } else {
    flexGapTest();
  }
})();
"""

# ② RUNTIME SHIMS — everything the floor lacks that this app (or the export's
#    own code) touches. Each installs ONLY when the API is missing, so a modern
#    browser keeps its native implementation.
#    Marker string for the gate: Fx52 runtime shims
RUNTIME_SHIMS_JS = r"""
"use strict";
/* Fx52 runtime shims — prepended by tools/build_offline.py BEFORE every app
   script. Each installs ONLY when the API is missing (modern browsers keep
   their native implementation). Marker string for the gate: Fx52 runtime shims */
(function () {
  var def = function (obj, name, value) {
    try {
      Object.defineProperty(obj, name, { configurable: true, writable: true, value: value });
    } catch (e) { try { obj[name] = value; } catch (e2) {} }
  };

  /* globalThis (Fx65) — schedbridge.js reads it in the else branch of a
     typeof-window ternary; harmless there, but a defined value costs nothing. */
  if (typeof window.globalThis === "undefined") { window.globalThis = window; }

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
    def(String.prototype, "replaceAll", function (search, repl) {
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
    });
  }

  /* .at() (Fx90) */
  function atImpl(k) {
    var n = Math.trunc(Number(k) || 0), len = this.length;
    if (n < 0) n += len;
    return (n < 0 || n >= len) ? undefined : this[n];
  }
  if (!Array.prototype.at) def(Array.prototype, "at", atImpl);
  if (!String.prototype.at) def(String.prototype, "at", atImpl);

  /* Object.hasOwn (Fx92) */
  if (!Object.hasOwn) {
    def(Object, "hasOwn", function (o, k) {
      return Object.prototype.hasOwnProperty.call(Object(o), k);
    });
  }

  /* Object.fromEntries (Fx63) */
  if (!Object.fromEntries) {
    def(Object, "fromEntries", function (list) {
      var out = {};
      Array.from(list).forEach(function (pair) { out[pair[0]] = pair[1]; });
      return out;
    });
  }

  /* Array.flat / flatMap (Fx62) */
  if (!Array.prototype.flat) {
    def(Array.prototype, "flat", function (depth) {
      var d = depth === undefined ? 1 : Math.floor(Number(depth) || 0);
      var out = [];
      (function walk(arr, lvl) {
        for (var i = 0; i < arr.length; i++) {
          if (Array.isArray(arr[i]) && lvl > 0) walk(arr[i], lvl - 1);
          else if (i in arr) out.push(arr[i]);
        }
      })(this, d);
      return out;
    });
  }
  if (!Array.prototype.flatMap) {
    def(Array.prototype, "flatMap", function (fn, thisArg) {
      return Array.prototype.map.call(this, fn, thisArg).flat(1);
    });
  }

  /* Array.findLast / findLastIndex (Fx104) */
  if (!Array.prototype.findLastIndex) {
    def(Array.prototype, "findLastIndex", function (fn, thisArg) {
      for (var i = this.length - 1; i >= 0; i--) {
        if (fn.call(thisArg, this[i], i, this)) return i;
      }
      return -1;
    });
  }
  if (!Array.prototype.findLast) {
    def(Array.prototype, "findLast", function (fn, thisArg) {
      var i = Array.prototype.findLastIndex.call(this, fn, thisArg);
      return i < 0 ? undefined : this[i];
    });
  }

  /* String.trimStart / trimEnd (Fx61) — trimLeft/trimRight exist since Fx3.5 */
  if (!String.prototype.trimStart) {
    def(String.prototype, "trimStart", function () { return String(this).replace(/^\s+/, ""); });
  }
  if (!String.prototype.trimEnd) {
    def(String.prototype, "trimEnd", function () { return String(this).replace(/\s+$/, ""); });
  }

  /* String.matchAll (Fx67) — returns an array (iterable, spreadable, for-of-able),
     which is every way this codebase could consume it. */
  if (!String.prototype.matchAll) {
    def(String.prototype, "matchAll", function (re) {
      var flags = String(re.flags === undefined ? "g" : re.flags);
      if (flags.indexOf("g") < 0) {
        throw new TypeError("matchAll must be called with a global RegExp");
      }
      var r = new RegExp(re.source, flags), s = String(this), out = [], m;
      while ((m = r.exec(s)) !== null) {
        out.push(m);
        if (m[0] === "") r.lastIndex += 1;
      }
      return out;
    });
  }

  /* Promise.prototype.finally (Fx58) */
  if (typeof Promise === "function" && !Promise.prototype["finally"]) {
    def(Promise.prototype, "finally", function (cb) {
      var P = this.constructor || Promise;
      return this.then(
        function (v) { return P.resolve(cb && cb()).then(function () { return v; }); },
        function (e) { return P.resolve(cb && cb()).then(function () { throw e; }); }
      );
    });
  }

  /* Promise.allSettled (Fx71) */
  if (typeof Promise === "function" && !Promise.allSettled) {
    def(Promise, "allSettled", function (list) {
      return Promise.all(Array.from(list).map(function (p) {
        return Promise.resolve(p).then(
          function (value) { return { status: "fulfilled", value: value }; },
          function (reason) { return { status: "rejected", reason: reason }; }
        );
      }));
    });
  }

  /* queueMicrotask (Fx69) */
  if (typeof window.queueMicrotask !== "function") {
    window.queueMicrotask = function (fn) {
      Promise.resolve().then(fn).catch(function (e) { setTimeout(function () { throw e; }); });
    };
  }

  /* Element.replaceChildren (Fx86) · Element.toggleAttribute (Fx63) */
  if (typeof Element !== "undefined") {
    if (!Element.prototype.replaceChildren) {
      def(Element.prototype, "replaceChildren", function () {
        while (this.firstChild) this.removeChild(this.firstChild);
        for (var i = 0; i < arguments.length; i++) {
          var n = arguments[i];
          this.appendChild(typeof n === "string" ? document.createTextNode(n) : n);
        }
      });
    }
    if (!Element.prototype.toggleAttribute) {
      def(Element.prototype, "toggleAttribute", function (name, force) {
        var has = this.hasAttribute(name);
        var want = force === undefined ? !has : !!force;
        if (want) { if (!has) this.setAttribute(name, ""); }
        else if (has) this.removeAttribute(name);
        return want;
      });
    }
  }

  /* navigator.clipboard.writeText (Fx63) → the execCommand("copy") route, which
     Fx52 does have. Same contract: returns a Promise that rejects on failure,
     so every `await navigator.clipboard.writeText(...)` call site and every
     .then/.catch keeps working unchanged. */
  try {
    if (!navigator.clipboard || typeof navigator.clipboard.writeText !== "function") {
      var api = {
        writeText: function (text) {
          return new Promise(function (resolve, reject) {
            var ta = document.createElement("textarea");
            ta.value = String(text === undefined || text === null ? "" : text);
            ta.setAttribute("readonly", "");
            ta.style.position = "fixed";
            ta.style.top = "0";
            ta.style.left = "-9999px";
            (document.body || document.documentElement).appendChild(ta);
            var sel = document.getSelection();
            var prev = sel && sel.rangeCount ? sel.getRangeAt(0) : null;
            ta.select();
            ta.setSelectionRange(0, ta.value.length);
            var ok = false;
            try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
            if (ta.parentNode) ta.parentNode.removeChild(ta);
            if (prev && sel) { sel.removeAllRanges(); sel.addRange(prev); }
            if (ok) resolve(); else reject(new Error("copy was refused by the browser"));
          });
        }
      };
      if (navigator.clipboard) {
        try { navigator.clipboard.writeText = api.writeText; }
        catch (e) { def(navigator, "clipboard", api); }
      } else {
        def(navigator, "clipboard", api);
      }
    }
  } catch (e) { /* a locked-down navigator: the app's own try/catch takes over */ }
})();
"""

# ③ OFFLINE FETCH SHIM
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

# ④ DATE-INPUT FALLBACK
DATE_FALLBACK_JS = r"""
"use strict";
/* Typed-date fallback — build_offline.py (not part of app/).

   Firefox grew the date picker in 57. Below that, <input type="date"> is an
   unknown type and the browser renders a PLAIN TEXT BOX: no calendar, no
   format hint, no validation — and whatever is typed goes straight into the
   store, where every date in this app is ISO "YYYY-MM-DD".

   This module does three things, and only when the picker is genuinely absent:
     · marks <html class="no-datepicker"> (the stylesheet needs no change; the
       class is there so the screen can be read for what it is);
     · gives every date field a placeholder, a pattern and a title, so the
       expected format is on screen rather than in someone's memory;
     · NORMALISES what was typed, in the capture phase — before the app's own
       change handler sees it — accepting DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY,
       D/M/YY and YYYYMMDD as well as plain ISO, and rewriting the field to
       ISO. The app therefore keeps reading exactly what it always read.

   Anything it cannot parse is left ALONE and flagged with aria-invalid: a
   silent wrong guess about a date is worse than a field the reader can see is
   not right. */
(() => {
  const test = document.createElement("input");
  try { test.setAttribute("type", "date"); } catch (e) { /* older DOM */ }
  test.value = "not-a-date";
  const supported = test.type === "date" && test.value === "";
  if (supported) return;

  document.documentElement.className += " no-datepicker";
  const HINT = "YYYY-MM-DD";
  const TITLE = "Type the date as " + HINT + " (2026-08-28). "
    + "DD/MM/YYYY is accepted too and is converted for you.";

  const pad = (n) => (n < 10 ? "0" + n : String(n));
  const valid = (y, m, d) => {
    if (!(y >= 1900 && y <= 2199 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return false;
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  };
  const iso = (y, m, d) => y + "-" + pad(m) + "-" + pad(d);

  /* the parser. Order matters: ISO first, because it is what the store holds
     and what the app writes back into the field on every re-render. */
  function toIso(raw) {
    const s = String(raw == null ? "" : raw).trim();
    if (!s) return "";
    let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
    if (m) {
      const y = +m[1], mo = +m[2], d = +m[3];
      return valid(y, mo, d) ? iso(y, mo, d) : null;
    }
    m = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2}|\d{4})$/.exec(s);
    if (m) {
      let y = +m[3];
      if (m[3].length === 2) y += y < 70 ? 2000 : 1900;
      const d = +m[1], mo = +m[2];               // DD/MM — the unit's own order
      return valid(y, mo, d) ? iso(y, mo, d) : null;
    }
    m = /^(\d{4})(\d{2})(\d{2})$/.exec(s);
    if (m) {
      const y = +m[1], mo = +m[2], d = +m[3];
      return valid(y, mo, d) ? iso(y, mo, d) : null;
    }
    return null;
  }

  function dress(el) {
    if (el.getAttribute("data-fdms-dated") === "1") return;
    el.setAttribute("data-fdms-dated", "1");
    if (!el.getAttribute("placeholder")) el.setAttribute("placeholder", HINT);
    if (!el.getAttribute("title")) el.setAttribute("title", TITLE);
    el.setAttribute("pattern", "\\d{4}-\\d{2}-\\d{2}|\\d{1,2}[/.\\-]\\d{1,2}[/.\\-]\\d{2,4}");
    el.setAttribute("autocomplete", "off");
    el.setAttribute("spellcheck", "false");
    el.setAttribute("inputmode", "numeric");
    el.setAttribute("maxlength", "10");
  }

  const dateFields = (root) => {
    const out = [];
    const scope = root && root.querySelectorAll ? root : document;
    const list = scope.querySelectorAll('input[type="date"]');
    for (let i = 0; i < list.length; i++) out.push(list[i]);
    if (root && root.matches && root.matches('input[type="date"]')) out.push(root);
    return out;
  };

  const dressAll = () => { dateFields(document).forEach(dress); };

  /* normalise in the CAPTURE phase — this listener is on `document`, so it runs
     before any handler the app bound on a pane or on the field itself. */
  function normalise(e) {
    const el = e.target;
    if (!el || el.tagName !== "INPUT" || el.getAttribute("type") !== "date") return;
    const out = toIso(el.value);
    if (out === null) { el.setAttribute("aria-invalid", "true"); return; }
    el.removeAttribute("aria-invalid");
    if (out !== el.value) el.value = out;
  }
  document.addEventListener("change", normalise, true);
  document.addEventListener("focusout", normalise, true);

  /* the app re-renders whole panes with innerHTML, so the dressing has to be
     re-applied; one debounced pass per batch of mutations is enough. */
  let pending = 0;
  const schedule = () => {
    if (pending) return;
    pending = setTimeout(() => { pending = 0; dressAll(); }, 40);
  };
  if (typeof MutationObserver === "function") {
    new MutationObserver(schedule).observe(document.documentElement,
      { childList: true, subtree: true });
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", dressAll);
  } else {
    dressAll();
  }
  console.warn("[FDMS offline] this browser has no date picker — date fields accept "
    + HINT + " (DD/MM/YYYY is converted for you).");
})();
"""

FEEDBACK_JS = r"""
"use strict";
/* Offline feedback module — appended by tools/build_offline.py (not part of app/).
   Intercepts every GitHub "/issues/new" link (per-remark Feedback buttons and
   the global remark-search Feedback buttons) and opens a local dialog instead.
   Storage tiers:
     (a) SHARED FILE — File System Access API (Chrome/Edge ONLY; Firefox has no
         such API, so on the unit's Firefox this tier simply never appears):
         connect ONE common fdms-feedback.json on a network drive; every save =
         read + append + write. Handle persisted in IndexedDB.
     (b) FALLBACK — localStorage on this computer + "Export feedback (N)" button
         that downloads fdms-feedback-<name|device>-<date>.json. On Firefox this
         is ALWAYS the active tier (detected via typeof, no reference errors). */
(() => {
  const LS_NAME = "fdms-fb-name", LS_REC = "fdms-fb-records";
  const $id = (x) => document.getElementById(x);
  const esc = (s) => { const d = document.createElement("div"); d.textContent = s == null ? "" : s; return d.innerHTML; };
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
  .fb-bar{display:flex;grid-gap:10px;gap:10px;align-items:center;justify-content:center;flex-wrap:wrap;margin-top:9px;font-size:12px;color:var(--muted)}
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
  .fb-actions{display:flex;grid-gap:10px;gap:10px;justify-content:flex-end;margin-top:14px}
  .fb-primary{background:var(--accent);color:#06121f;border:1px solid var(--accent);border-radius:8px;padding:6px 16px;font-weight:700;cursor:pointer}
  .fb-primary:hover{filter:brightness(1.12)}
  .fb-flash{color:var(--warn);font-size:12px;margin-right:auto;align-self:center}
  html.no-flexgap .fb-bar > * + *{margin-left:10px}
  html.no-flexgap .fb-actions > * + *{margin-left:10px}
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
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !$id("fb-modal").classList.contains("hidden")) closeDlg();
    });

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


# ────────────────────────────────────────────────────────────────────
# 5. Source preparation (modern app/ files → export-ready text)
# ────────────────────────────────────────────────────────────────────

def prepare_appjs() -> str:
    """Neutralise the dynamic module loader. mifchart.js and remarksearch.js are
    inlined right after app.js instead; schedsync.js is the one module that does
    NOT travel — it talks to GitHub, which on a closed network can only fail and
    would put a live https endpoint inside the file."""
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


def prepare_cssjs(name: str, src: str) -> str:
    """CSS-in-JS `gap:` inside a JS template literal gets the same grid-gap
    longhand the stylesheet gets. Purely additive; modern browsers read the
    later `gap` exactly as before."""
    def rep(m):
        prop, val = m.group(1), m.group(2)
        legacy = {"gap": "grid-gap", "row-gap": "grid-row-gap",
                  "column-gap": "grid-column-gap"}[prop]
        return f"{legacy}:{val};{prop}:{val}"
    out, n = re.subn(r"(?<![\w-])(gap|row-gap|column-gap):([-\w.%]+(?: [-\w.%]+)?)(?=[;\"'`}])",
                     rep, src)
    return out


def extract_prepaint(index_html: str) -> str:
    m = re.search(r"<script>\n(/\* Palette before first paint[\s\S]*?)\n</script>", index_html)
    if not m:
        fail("pre-paint palette script not found in app/index.html")
    return m.group(1)


# ────────────────────────────────────────────────────────────────────
# 6. HTML assembly
# ────────────────────────────────────────────────────────────────────

def script_tag(label: str, body: str) -> str:
    b = body.strip()
    if re.search(r"</(script|style)", b, re.I):
        fail(f"script '{label}' contains '</script'/'</style' — inline-unsafe")
    return f"<script>\n/* ═══ {label} ═══ */\n{b}\n</script>"


def build_main_html(css: str, emblem_uri: str, guard_js: str, prepaint_js: str,
                    scripts: str) -> str:
    html = read_text(APP / "index.html")

    # the capability guard goes FIRST, before the pre-paint palette script
    html = sub1(r"<script>\n/\* Palette before first paint[\s\S]*?\n</script>",
                lambda m: (script_tag("FDMS capability guard (build_offline.py)", guard_js)
                           + "\n<script>\n" + prepaint_js.strip() + "\n</script>"),
                html, "head scripts (guard + pre-paint)")

    # inline the stylesheet
    html = sub1(r'<link rel="stylesheet" href="styles\.css[^"]*">',
                lambda m: "<style>\n" + css + "\n</style>", html, "stylesheet link")

    # emblem as data: URI + visible ✈ fallback
    html = sub1(r'src="assets/364mea\.png"',
                lambda m: f'src="{emblem_uri}"', html, "emblem src")
    html = sub1(r'''onerror="this\.style\.display='none'"''',
                lambda m: '''onerror="this.replaceWith('✈')"''', html, "emblem onerror")

    # ROUND 22 — NOTHING IS STUBBED OUT ANY MORE. Every tab that exists in
    # app/index.html ships: Remarks · Description · Requirements · Flowchart ·
    # Scheduler (Board/Roster/Log/Balance/Bridge) · Currency · Validate. The
    # roster used to be the reason three <main>s were emptied; the export now
    # ships an EMPTY STORE instead, so there is nothing to hide.
    # The tripwire that used to be "5 hidden tabs / 3 main stubs" is now this
    # assertion: every view id app.js can switch to must be present, and no
    # element may still be a stub.
    for vid in ["view-remarks", "view-description", "view-requirements",
                "view-flowchart", "view-scheduler", "view-currency"]:
        if f'id="{vid}"' not in html:
            fail(f"view {vid} missing from app/index.html — layout changed?")
    if "stub:" in html:
        fail("a leftover stub marker is in the assembled HTML")

    # drop all external <script src> tags, then inline our chain before </body>
    # (10 tags: app · description · flowchart · schedval · schedstore · scheduler ·
    #  schedconsq · schedboard · schedbridge · currency. The count is the
    #  tripwire on app/index.html: a new module must be looked at once — added
    #  to SCRIPT_CHAIN in main() and to the floor sweep — before it moves.)
    html = sub1(r'[ \t]*<script src="[^"]+"></script>\n', lambda m: "", html,
                "external script tags", count=10)
    html = sub1(r"</body>", lambda m: scripts + "\n</body>", html, "</body>")

    html = sub1(r"<!DOCTYPE html>",
                lambda m: "<!DOCTYPE html>\n"
                          f"<!-- Phase 2 FDMS — single-file offline build {STAMP}\n"
                          "     generated by tools/build_offline.py; do not edit by hand.\n"
                          f"     Browser floor: {FLOOR} (JavaScript transpiled to {ES_TARGET}).\n"
                          "     Self-contained: no network request of any kind is made.\n"
                          "     The scheduler store ships EMPTY — load data on site through\n"
                          "     Scheduler → «⋯» → ⭱ Import (needs the editor lock open). -->",
                html, "doctype marker")
    return html


# ────────────────────────────────────────────────────────────────────
# 7. README for the IT department (Greek)
# ────────────────────────────────────────────────────────────────────

README_TEMPLATE = """\
Phase 2 FDMS — μία εφαρμογή, ΕΝΑ αρχείο (offline)
=================================================
Έκδοση: {stamp}          Αρχείο: {name} ({size_mb} MB)

ΤΙ ΕΙΝΑΙ
Ολόκληρο το Phase 2 FDMS σε ΕΝΑ αυτόνομο αρχείο HTML: Remarks, Description,
Requirements, Phase II Flowchart, Scheduler (Board / Roster / Training Log /
Balance / Bridge), Instructor Currency και Schedule Validation.

ΕΓΚΑΤΑΣΤΑΣΗ — ΔΕΝ ΧΡΕΙΑΖΕΤΑΙ
- Άνοιγμα με διπλό κλικ. Όλα τα δεδομένα, το CSS, το JavaScript και το έμβλημα
  είναι ενσωματωμένα μέσα στο αρχείο.
- Συμβατό με Mozilla Firefox {floor_short} ή νεότερο, καθώς και με οποιονδήποτε
  σύγχρονο Chrome / Edge.
- ΔΕΝ απαιτείται internet, server, εγκατάσταση προγράμματος ή δικαιώματα
  διαχειριστή. Η σελίδα ΔΕΝ στέλνει και ΔΕΝ λαμβάνει τίποτα από το δίκτυο —
  λειτουργεί εξ ολοκλήρου τοπικά μέσα στον browser.
- Μπορεί να αντιγραφεί ελεύθερα σε υπολογιστές ή σε κοινόχρηστο δίσκο.
- Αν ο browser είναι πολύ παλιός για την εφαρμογή, η σελίδα ΔΕΝ βγαίνει λευκή:
  εμφανίζει αγγλικό μήνυμα που ονομάζει ακριβώς τι λείπει.

ΔΕΔΟΜΕΝΑ — ΤΟ ΑΡΧΕΙΟ ΕΡΧΕΤΑΙ ΑΔΕΙΟ
- Δεν περιέχει ΚΑΝΕΝΑ ονοματεπώνυμο, call sign, ΑΜ ή στοιχείο μαθητή/εκπαιδευτή.
- Ο Scheduler ξεκινά με ΑΔΕΙΑ βάση. Η φόρτωση γίνεται επιτόπου:
    Scheduler → ✎ Editor (ορίζεται κωδικός επεξεργασίας την πρώτη φορά)
              → «⋯» → ⭱ Import → επιλογή αρχείου → πληκτρολόγηση REPLACE
- Τα δεδομένα μένουν ΤΟΠΙΚΑ στον κάθε υπολογιστή (localStorage του browser).
- Αντίγραφο ασφαλείας: «⋯» → ⭳ Export (κατεβάζει scheduler-backup-<ημ/νία>.json).

ΗΜΕΡΟΜΗΝΙΕΣ ΣΕ ΠΟΛΥ ΠΑΛΙΟ FIREFOX
Ο Firefox απέκτησε ημερολόγιο (date picker) στην έκδοση 57. Σε παλαιότερη
έκδοση τα πεδία ημερομηνίας γίνονται απλά κουτιά κειμένου — γράφετε
2026-08-28 (ή 28/08/2026, μετατρέπεται αυτόματα). Στον Firefox 57+ και σε
Chrome/Edge εμφανίζεται κανονικά το ημερολόγιο.

ΣΧΟΛΙΑ ΕΚΠΑΙΔΕΥΤΩΝ (FEEDBACK)
- Κάθε παρατήρηση έχει κουμπί «Feedback» για διορθώσεις/σχόλια.
- Στον Firefox τα σχόλια αποθηκεύονται ΤΟΠΙΚΑ. Με το «Export feedback (N)»
  (κάτω μέρος της σελίδας) εξάγονται ως μικρό JSON, το οποίο παραδίδεται στον
  συντάκτη της εφαρμογής. Δεν απαιτείται ενέργεια από το Τμήμα Πληροφορικής.

ΕΠΙΚΟΙΝΩΝΙΑ
Για οποιαδήποτε απορία ή διόρθωση: Ν. Κορωνιάδης — n.koroniadis@cityu.gr
"""


# ────────────────────────────────────────────────────────────────────
# main
# ────────────────────────────────────────────────────────────────────

# THE SCRIPT CHAIN — the whole app, in app/index.html's own order, with the two
# dynamically-injected modules folded in where app.js would have injected them.
# schedsync.js is deliberately absent (see prepare_appjs).
SCRIPT_CHAIN = [
    ("app.js (loader block neutralized by build_offline.py)", "app"),
    ("mifchart.js", "mifchart"),
    ("remarksearch.js", "remarksearch"),
    ("description.js", "description"),
    ("flowchart.js", "flowchart"),
    ("schedval.js", "schedval"),
    ("schedstore.js", "schedstore"),
    ("scheduler.js", "scheduler"),
    ("schedconsq.js", "schedconsq"),
    ("schedboard.js", "schedboard"),
    ("schedbridge.js", "schedbridge"),
    ("currency.js", "currency"),
]


def main() -> None:
    if "--gate-selftest" in sys.argv:
        gate_selftest()

    sources = ["app.js", "mifchart.js", "remarksearch.js", "description.js",
               "flowchart.js", "schedval.js", "schedstore.js", "scheduler.js",
               "schedconsq.js", "schedboard.js", "schedbridge.js", "currency.js"]
    for f in [APP / "index.html", APP / "styles.css",
              APP / "assets" / "364mea.png", DATA / "flowchart2.json"] + \
             [APP / s for s in sources]:
        if not f.is_file():
            fail(f"missing source file: {f}")
    if not NO_TRANSPILE:
        esbuild_exe()   # resolve + version-check up front

    index_html = read_text(APP / "index.html")
    css, css_notes = patch_css(read_text(APP / "styles.css"))
    prepaint_raw = extract_prepaint(index_html)

    raw = {
        "app": prepare_appjs(),
        "mifchart": prepare_mifchart(),
        "schedval": prepare_schedval(),
    }
    for s in sources:
        key = s[:-3]
        if key not in raw:
            raw[key] = read_text(APP / s)
    # CSS-in-JS gap → grid-gap longhand, for every module that writes CSS
    for key in list(raw):
        raw[key] = prepare_cssjs(key, raw[key])

    for name, src in [("styles.css", css)] + [(k + ".js", v) for k, v in raw.items()]:
        if re.search(r"</(script|style)", src, re.I):
            fail(f"{name} contains a '</script'/'</style' sequence — inline-unsafe")

    png = (APP / "assets" / "364mea.png").read_bytes()
    emblem_uri = "data:image/png;base64," + base64.b64encode(png).decode("ascii")

    # ── transpile EVERYTHING that ships as inline JS ──
    t = transpile
    guard_js = t("capability-guard", CAPABILITY_GUARD_JS)   # ES5 in → ES5 out
    prepaint_js = t("prepaint", prepaint_raw)
    shims_js = t("runtime-shims", RUNTIME_SHIMS_JS)
    fetch_js = t("fetch-shim", FETCH_SHIM_JS)
    datefb_js = t("date-fallback", DATE_FALLBACK_JS)
    feedback_js = t("feedback", FEEDBACK_JS)
    mods = {k: t(k + ".js", v) for k, v in raw.items()}

    bundle = collect_data()
    data_js = data_bundle_js(bundle)          # generated ES5-safe object literal
    scripts = "\n".join(
        [script_tag("Fx52 runtime shims (build_offline.py)", shims_js),
         script_tag(f"Embedded data bundle — {len(bundle)} JSON files", data_js),
         script_tag("Offline fetch shim", fetch_js),
         script_tag("Typed-date fallback (build_offline.py)", datefb_js)]
        + [script_tag(label, mods[key]) for label, key in SCRIPT_CHAIN]
        + [script_tag("Offline feedback module (build_offline.py)", feedback_js)]
    )
    html = build_main_html(css, emblem_uri, guard_js, prepaint_js, scripts)

    # ── QUALITY GATE (hard fail — nothing is written on violation) ──
    notes = run_gate(html, OUT_HTML.name)

    # ── write ──
    EXPORT.mkdir(parents=True, exist_ok=True)
    OUT_HTML.write_text(html, encoding="utf-8", newline="\n")
    size = OUT_HTML.stat().st_size
    OUT_README.write_text(
        README_TEMPLATE.format(stamp=STAMP, name=OUT_HTML.name,
                               size_mb=f"{size / 1048576:.1f}",
                               floor_short=FLOOR.replace("Firefox ", "")),
        encoding="utf-8-sig", newline="\r\n")

    print(f"floor       : {FLOOR}  (esbuild --target={ES_TARGET})")
    print(f"modules     : {len(SCRIPT_CHAIN)} app modules "
          f"+ guard/shims/fetch/date/feedback  (schedsync.js excluded)")
    print(f"data bundle : {len(bundle)} JSON files, "
          f"{sum(len(json.dumps(v, ensure_ascii=False)) for v in bundle.values()) / 1e6:.1f} MB raw"
          f"  (data/scheduler/seed.json shipped EMPTY)")
    print(f"emblem      : {len(png)} bytes PNG -> {len(emblem_uri)} chars data URI")
    print(f"transpile   : esbuild {ESBUILD_VERSION} --target={ES_TARGET}"
          + ("  ** SKIPPED (--no-transpile) **" if NO_TRANSPILE else ""))
    print(f"output      : {OUT_HTML}  ({size:,} bytes = {size / 1048576:.2f} MB)")
    print(f"readme      : {OUT_README}")
    for x in css_notes:
        print(f"css patch   : {x}")
    for x in notes:
        print(f"css note    : {x}")
    if size > MAX_BYTES:
        fail(f"output exceeds the {MAX_BYTES // 1048576} MB guard")
    print("OK")


if __name__ == "__main__":
    main()
