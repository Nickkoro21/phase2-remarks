# -*- coding: utf-8 -*-
"""
build_offline.py — deterministic single-file export of Phase 2 FDMS (Remarks module).

Produces D:\\FDMS-export\\Phase2-FDMS.html : ONE self-contained HTML file that
colleagues on a CLOSED network open by double-click (Chrome/Edge, file://).
No internet, no server, no installation.

What it does
  * keeps ONLY the Remarks view (+ Info modal, MIF Progress chart, remark search)
    from app/index.html — Flowchart & Scheduler removed, their DOM ids stubbed
    hidden so app.js binds without errors; Requirements <main> stays as a hidden
    stub (app.js renders into it at load; reachable only via Info-modal links)
  * inlines styles.css, app.js, mifchart.js, remarksearch.js and the 364 MEA
    emblem (data: URI)
  * embeds every JSON the kept modules fetch into window.FDMS_DATA and installs
    a fetch() shim that serves requests from the bundle (404 + console.warn on
    anything missing — nothing ever hits the network)
  * neutralizes the dynamic <script> loader block in app.js (mifchart.js and
    remarksearch.js are inlined instead; schedsync.js is excluded — no GitHub
    on the closed network)
  * appends the OFFLINE FEEDBACK module: intercepts the GitHub-issue links and
    stores feedback either in ONE shared JSON file on a network drive
    (File System Access API, Chrome/Edge) or locally with a JSON export button
  * writes README-IT.txt (Greek) for the unit IT department

Deterministic: same inputs -> byte-identical outputs (no timestamps).
Re-run any time:  python tools/build_offline.py
"""

import base64
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]          # D:\FDMS
APP = ROOT / "app"
DATA = ROOT / "data"
EXPORT = ROOT.parent / "FDMS-export"                # D:\FDMS-export
OUT_HTML = EXPORT / "Phase2-FDMS.html"
OUT_README = EXPORT / "README-IT.txt"
MAX_BYTES = 20 * 1024 * 1024                        # hard size guard


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
# 1. Data bundle — every file the kept modules fetch
#    (v1 per-item observation files are NOT bundled: every master-index
#     item carries v2_file, so app.js never requests them)
# ────────────────────────────────────────────────────────────────────

def collect_data() -> dict:
    files = [
        DATA / "observations" / "master_index.json",   # app.js + remarksearch.js
        DATA / "minimums.json",                        # mifchart.js
        DATA / "manifest.json",                        # mifchart.js (source-jump)
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
    # master index must not reference a v1-only item (we don't bundle v1 files)
    master = bundle["data/observations/master_index.json"]
    v1_only = [it["item_id"] for c in master["categories"].values()
               for it in c["items"] if not it.get("v2_file")]
    if v1_only:
        fail(f"master_index items without v2_file (v1 files are not bundled): {v1_only}")
    return bundle


def data_bundle_js(bundle: dict) -> str:
    parts = []
    for key, obj in bundle.items():
        blob = json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
        parts.append(f"{json.dumps(key)}:{blob}")
    js = "window.FDMS_DATA={\n" + ",\n".join(parts) + "\n};"
    # "</" only occurs inside JSON strings → "<\/" is identical JSON, HTML-safe
    return js.replace("</", "<\\/")


# ────────────────────────────────────────────────────────────────────
# 2. Fetch shim (installed BEFORE the app scripts)
# ────────────────────────────────────────────────────────────────────

SHIM_JS = r"""
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


# ────────────────────────────────────────────────────────────────────
# 3. Offline feedback module (the one NEW piece of code)
# ────────────────────────────────────────────────────────────────────

FEEDBACK_JS = r"""
"use strict";
/* Offline feedback module — appended by tools/build_offline.py (not part of app/).
   Intercepts every GitHub "/issues/new" link (per-remark Feedback buttons and
   the global remark-search Feedback buttons) and opens a local dialog instead.
   Storage tiers:
     (a) SHARED FILE — File System Access API (Chrome/Edge): connect ONE common
         fdms-feedback.json on a network drive; every save = read + append + write,
         so many computers append to the same file. Handle persisted in IndexedDB.
     (b) FALLBACK — localStorage on this computer + "Export feedback (N)" button
         that downloads fdms-feedback-<name|device>-<date>.json. */
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

  /* ── shared-file tier ── */
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
      <div class="modal-box" style="width:min(660px,94vw)">
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
    return "This browser cannot write files directly — records stay ON THIS COMPUTER until you export them (footer → “Export feedback”) and hand the JSON over.";
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
# 4. app.js — neutralize the dynamic <script> loader block
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


# ────────────────────────────────────────────────────────────────────
# 5. index.html surgery
# ────────────────────────────────────────────────────────────────────

def build_html(css: str, emblem_uri: str, scripts: str) -> str:
    html = read_text(APP / "index.html")

    # inline the stylesheet
    html = sub1(r'<link rel="stylesheet" href="styles\.css[^"]*">',
                lambda m: "<style>\n" + css + "\n</style>", html, "stylesheet link")

    # emblem as data: URI + visible ✈ fallback
    html = sub1(r'src="assets/364mea\.png"',
                lambda m: f'src="{emblem_uri}"', html, "emblem src")
    html = sub1(r'''onerror="this\.style\.display='none'"''',
                lambda m: '''onerror="this.replaceWith('✈')"''', html, "emblem onerror")

    # hide the removed view tabs (app.js binds onclick by id — keep as hidden stubs)
    html = sub1(r'(<button id="tab-(?:requirements|flowchart|scheduler)" class="viewtab")>',
                lambda m: m.group(1) + ' style="display:none">', html,
                "hidden viewtab stubs", count=3)

    # flowchart & scheduler <main> sections -> hidden empty stubs
    # (app.js switchView toggles these ids; their module scripts are not included)
    html = sub1(r'<main class="fc-view hidden" id="view-flowchart"[\s\S]*?</main>',
                lambda m: '<main id="view-flowchart" class="hidden" style="display:none"></main>'
                          '<!-- stub: id required by app.js switchView -->',
                html, "flowchart main stub")
    html = sub1(r'<main class="sch-view hidden" id="view-scheduler"[\s\S]*?</main>',
                lambda m: '<main id="view-scheduler" class="hidden" style="display:none"></main>'
                          '<!-- stub: id required by app.js switchView -->',
                html, "scheduler main stub")
    # NOTE: #view-requirements stays intact (hidden by default). app.js renders
    # the domain grid into it at load, and the Info-modal "Related requirements"
    # links open it — with the tab button hidden it is reachable only that way.

    # drop all external <script src> tags, then inline our chain before </body>
    html = sub1(r'[ \t]*<script src="[^"]+"></script>\n', lambda m: "", html,
                "external script tags", count=7)  # +schedconsq.js (Round 2)
    html = sub1(r"</body>", lambda m: scripts + "\n</body>", html, "</body>")

    html = sub1(r"<!DOCTYPE html>",
                lambda m: "<!DOCTYPE html>\n<!-- Phase 2 FDMS — single-file offline build "
                          "(generated by tools/build_offline.py; do not edit by hand) -->",
                html, "doctype marker")
    return html


# ────────────────────────────────────────────────────────────────────
# 6. README for the IT department (Greek)
# ────────────────────────────────────────────────────────────────────

README_TEMPLATE = """\
Phase 2 FDMS — εφαρμογή ενός αρχείου (offline)
==============================================

ΤΙ ΕΙΝΑΙ
Βοήθημα για τη συμπλήρωση παρατηρήσεων (remarks) στα gradesheets της Φάσης ΙΙ
εκπαίδευσης T-6A: έτοιμες παρατηρήσεις ανά αντικείμενο και κωδικούς (MIF),
κριτήρια αξιολόγησης, πρόοδος MIF ανά εκπαιδευτικό τμήμα και καθολική
αναζήτηση σε όλες τις παρατηρήσεις.

ΕΓΚΑΤΑΣΤΑΣΗ — ΔΕΝ ΧΡΕΙΑΖΕΤΑΙ
- Ένα και μόνο αρχείο: Phase2-FDMS.html ({size_mb} MB). Όλα τα δεδομένα και η
  εικόνα του εμβλήματος είναι ενσωματωμένα μέσα στο ίδιο το αρχείο.
- Άνοιγμα με διπλό κλικ, σε Google Chrome ή Microsoft Edge.
- Δεν απαιτείται internet, server, εγκατάσταση προγράμματος ή δικαιώματα
  διαχειριστή. Η σελίδα δεν στέλνει και δεν λαμβάνει τίποτα από το δίκτυο —
  λειτουργεί εξ ολοκλήρου τοπικά μέσα στον browser.
- Μπορεί να αντιγραφεί ελεύθερα σε υπολογιστές ή σε κοινόχρηστο δίσκο.

ΠΡΟΑΙΡΕΤΙΚΑ — ΚΟΙΝΟ ΑΡΧΕΙΟ ΣΧΟΛΙΩΝ (FEEDBACK)
- Κάθε παρατήρηση έχει κουμπί «Feedback» για διορθώσεις/σχόλια των εκπαιδευτών.
- Τα σχόλια αποθηκεύονται τοπικά στον κάθε υπολογιστή και εξάγονται με το
  κουμπί «Export feedback» (κάτω μέρος της σελίδας) ως μικρό αρχείο JSON,
  το οποίο παραδίδεται στον συντάκτη της εφαρμογής.
- Εναλλακτικά, αν οριστεί ένα κοινό αρχείο (π.χ. fdms-feedback.json) σε δίσκο
  δικτύου, κάθε χρήστης το «συνδέει» μία φορά (κουμπί «Feedback file: connect
  shared file…») και έκτοτε τα σχόλια όλων προστίθενται αυτόματα στο ίδιο
  αρχείο. Δεν απαιτείται καμία ενέργεια από το Τμήμα Πληροφορικής γι' αυτό.
- Σημείωση: αν ο browser δεν επιτρέπει τη σύνδεση κοινού αρχείου όταν η σελίδα
  ανοίγει ως τοπικό αρχείο, το Τμήμα Πληροφορικής μπορεί προαιρετικά να τη
  σερβίρει από απλό intranet http(s) — τότε λειτουργεί σίγουρα.

ΕΠΙΚΟΙΝΩΝΙΑ
Για οποιαδήποτε απορία ή διόρθωση: Ν. Κορωνιάδης — n.koroniadis@cityu.gr
"""


# ────────────────────────────────────────────────────────────────────
# main
# ────────────────────────────────────────────────────────────────────

def main() -> None:
    for f in [APP / "index.html", APP / "styles.css", APP / "app.js",
              APP / "mifchart.js", APP / "remarksearch.js", APP / "assets" / "364mea.png"]:
        if not f.is_file():
            fail(f"missing source file: {f}")

    css = read_text(APP / "styles.css")
    appjs = prepare_appjs()
    mifchart = read_text(APP / "mifchart.js")
    remarksearch = read_text(APP / "remarksearch.js")
    for name, src in [("styles.css", css), ("app.js", appjs),
                      ("mifchart.js", mifchart), ("remarksearch.js", remarksearch)]:
        if re.search(r"</(script|style)", src, re.I):
            fail(f"{name} contains a '</script'/'</style' sequence — inline-unsafe")

    bundle = collect_data()
    data_js = data_bundle_js(bundle)

    png = (APP / "assets" / "364mea.png").read_bytes()
    emblem_uri = "data:image/png;base64," + base64.b64encode(png).decode("ascii")

    tag = lambda label, body: f"<script>\n/* ═══ {label} ═══ */\n{body.strip()}\n</script>"
    scripts = "\n".join([
        tag(f"Embedded data bundle — {len(bundle)} JSON files", data_js),
        tag("Offline fetch shim", SHIM_JS),
        tag("app.js (loader block neutralized by build_offline.py)", appjs),
        tag("mifchart.js", mifchart),
        tag("remarksearch.js", remarksearch),
        tag("Offline feedback module (build_offline.py)", FEEDBACK_JS),
    ])

    html = build_html(css, emblem_uri, scripts)

    EXPORT.mkdir(parents=True, exist_ok=True)
    OUT_HTML.write_text(html, encoding="utf-8", newline="\n")
    size = OUT_HTML.stat().st_size
    size_mb = size / (1024 * 1024)

    OUT_README.write_text(README_TEMPLATE.format(size_mb=f"{size_mb:.0f}"),
                          encoding="utf-8-sig", newline="\r\n")

    print(f"data bundle : {len(bundle)} JSON files, "
          f"{sum(len(json.dumps(v, ensure_ascii=False)) for v in bundle.values()) / 1e6:.1f} MB raw")
    print(f"emblem      : {len(png)} bytes PNG -> {len(emblem_uri)} chars data URI")
    print(f"output      : {OUT_HTML}  ({size:,} bytes = {size_mb:.2f} MB)")
    print(f"readme      : {OUT_README}")
    if size > MAX_BYTES:
        fail(f"output exceeds the {MAX_BYTES // (1024 * 1024)} MB guard ({size_mb:.2f} MB)")
    print("OK")


if __name__ == "__main__":
    main()
