"use strict";
/* advisor.js — «ΣΥΜΒΟΥΛΟΣ»: the owner talks to a Claude-backed advisor from
 * inside his own app.
 *
 * WHAT IT IS. A top-level view (tab «Σύμβουλος») with an agent picker, the
 * recent sessions of that agent, a transcript, a question box, send, and a 🎤
 * push-to-talk button. It talks ONLY to the local proxy
 * (tools/advisor_proxy.py, 127.0.0.1:8771) — the API key lives there, never
 * here. The proxy holds the corpus, the agent prompt, the cost brakes, the
 * search whitelist, the case-file tools AND the sessions; this file renders.
 *
 * WHAT IT IS NOT. Not part of the unit deliverable. tools/build_offline.py
 * strips the tab, the <main> and the <script> tag (markers in app/index.html),
 * as schedsync.js is excluded: the closed-network build has no advisor, no
 * network code and no mention of an API. The styles live HERE (injected
 * <style>), not in styles.css, so the export carries zero advisor bytes.
 *
 * MEMORY (R-B, 17/10/2026). The durable memory is the CASE FILE; the
 * transcript is working memory. Sessions are stored by the PROXY
 * (tools/advisor/sessions/<agent>/<id>.json, gitignored — they hold real
 * names), never in this browser: nothing here touches localStorage except the
 * proxy-address override. The panel lists recent sessions, resumes one,
 * starts new ones, shows when the proxy compacted a history into a structured
 * brief, and after a confirmed write offers «Έκλεισε η υπόθεση»: archive, and
 * reopen from a fresh read of the student's case file.
 *
 * THE CONFIRM GATE (R-A). The advisor never writes. A write arrives as a
 * PREVIEW with a one-time token; the box shows «Γράψ' το» / «Άκυρο» and the
 * row exists only after the owner clicks, via POST /confirm. The token is
 * single-use, short-lived, and bound to this session — the panel only passes
 * it back.
 *
 * CUSTODY. No real student data leaves the page unless the owner typed or
 * dictated it; the module never reads the Scheduler store or a roster.
 *
 * SPEECH. SpeechRecognition, lang el-GR, hold-to-talk; the browser vendor
 * recognises on ITS servers, and a permanent line next to the button says so.
 *
 * RENDERING. A small markdown pass; requirement ids ([fail-24], st-12 …) become
 * ↗ buttons into the Requirements view; «ΑΚΑΤΕΡΓΑΣΤΟ ΚΕΙΜΕΝΟ ΠΗΓΗΣ …» is
 * highlighted so unverified PDF text never reads like verified corpus.
 *
 * WIRE. POST /ask {agent, session, question, student?} → SSE: start · compacted ·
 * text · tool_call · tool_result · usage · notice · error · done. Sessions:
 * GET /sessions?agent= · POST /sessions · GET /sessions/<id>?agent= ·
 * POST /sessions/<id>/archive|close. Gate: POST /confirm {agent, session,
 * token, action: write|cancel}.
 */
(() => {
  /* The proxy's default address. If the owner has to move the port (something
     else on 8771), the proxy says so at startup and the page reads the override
     from localStorage — a per-viewer convenience, never student data. */
  const PROXY_DEFAULT = "http://127.0.0.1:8771";
  const PROXY = (() => { try { const v = localStorage.getItem("p2r-advisor-proxy"); return v && /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(v) ? v : PROXY_DEFAULT; } catch (e) { return PROXY_DEFAULT; } })();
  const START_CMD = "python tools/advisor_proxy.py";
  const ESC_MAP = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ESC_MAP[c]);
  const $ = (id) => document.getElementById(id);
  const fmtK = (n) => (n >= 10000 ? (n / 1000).toFixed(0) + "k" : n >= 1000 ? (n / 1000).toFixed(1) + "k" : String(n || 0));
  const ago = (iso) => {
    const t = Date.parse(iso); if (isNaN(t)) return "";
    const m = Math.round((Date.now() - t) / 60000);
    if (m < 1) return "τώρα"; if (m < 60) return `${m}′`; const h = Math.round(m / 60); if (h < 24) return `${h} ω`; return `${Math.round(h / 24)} ημ`;
  };
  const hhmm = (iso) => (iso || "").slice(11, 16);

  const UI = {
    host: null, booted: false, health: null, healthAt: 0, offline: false,
    agent: null, sessions: [], session: null, busy: false, abort: null, pending: null, errors: [], draft: null,
    turnMax: 20, today: null, speech: { api: null, rec: null, on: false, interim: "", err: "" },
  };

  /* ════════════════════════════════════════════════════════════════════════
     § 0  STYLES — injected, so styles.css (which ships) stays advisor-free
     ════════════════════════════════════════════════════════════════════════ */
  const CSS = `
.adv-view.hidden, #view-advisor .hidden { display: none; }
.adv-view { flex: 1; display: flex; flex-direction: column; padding: 14px 22px; min-height: 0; min-width: 0; }
.adv-main { display: flex; flex-direction: column; gap: 12px; min-width: 0; max-width: 1100px; width: 100%; margin: 0 auto; }
.adv-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.adv-bar .spacer { flex: 1 1 auto; }
.adv-agent { --tk: var(--accent); --tk-rgb: var(--accent-rgb); }
.adv-status { display: flex; flex-wrap: wrap; gap: 5px; align-items: center; }
.adv-status .badge.ok { color: var(--good); border-color: var(--good); }
.adv-status .badge.bad { color: var(--bad); border-color: var(--bad); }
.adv-status .badge.warn { color: var(--warn); border-color: var(--warn); }
.adv-sess { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: 12.5px; color: var(--muted); }
.adv-sess select { font: inherit; font-size: 12.5px; color: var(--text); background: var(--bg-2); border: 1px solid var(--line); border-radius: 8px; padding: 5px 8px; max-width: 520px; }
.adv-sess .adv-close { color: var(--good); border-color: var(--good); }
.adv-notice { border: 1px solid var(--line); border-left: 5px solid var(--warn); border-radius: 10px; padding: 12px 16px; background: var(--panel-2); font-size: 13.5px; line-height: 1.6; }
.adv-notice code, .adv-cmd { font-family: Consolas, monospace; font-size: 12.5px; background: var(--bg-2); border: 1px solid var(--line); border-radius: 6px; padding: 2px 8px; color: var(--text); user-select: all; }
.adv-help { font-size: 11.5px; color: var(--muted); line-height: 1.5; margin: -4px 0 0; }
.adv-help b { color: var(--text); font-weight: 600; }
.adv-events { display: flex; flex-direction: column; gap: 4px; }
.adv-event { font-size: 12px; color: var(--muted); border: 1px dashed var(--line); border-radius: 8px; padding: 4px 10px; }
.adv-event.is-compaction { border-style: solid; border-color: var(--hf); color: var(--text); }
.adv-transcript { display: flex; flex-direction: column; gap: 10px; min-height: 160px; max-height: 58vh; overflow-y: auto; padding: 4px 2px; }
.adv-msg { border: 1px solid var(--line); border-radius: 12px; padding: 10px 14px; font-size: 13.5px; line-height: 1.6; max-width: 92%; background: var(--panel); position: relative; }
.adv-msg.is-user { align-self: flex-end; background: var(--accent-soft); border-color: rgba(var(--accent-rgb), 0.5); white-space: pre-wrap; }
.adv-msg.is-assistant { align-self: flex-start; }
.adv-msg.is-system { align-self: stretch; max-width: none; border-left: 5px solid var(--hf); background: var(--panel-2); font-size: 13px; }
.adv-msg.is-error { align-self: stretch; max-width: none; border-left: 5px solid var(--bad); background: var(--panel-2); }
.adv-msg.is-notice { align-self: stretch; max-width: none; border-left: 5px solid var(--warn); background: var(--panel-2); font-size: 12.5px; }
.adv-who { display: block; font-size: 10px; text-transform: uppercase; letter-spacing: 0.8px; color: var(--muted); margin-bottom: 4px; }
.adv-ctx { font-size: 11.5px; color: var(--muted); border-top: 1px dashed var(--line); margin-top: 6px; padding-top: 4px; white-space: pre-wrap; }
.adv-h { font-size: 13.5px; margin: 10px 0 4px; color: var(--accent); letter-spacing: 0.3px; }
.adv-h:first-child { margin-top: 0; }
.adv-msg p { margin: 0 0 6px; }
.adv-msg ul, .adv-msg ol { margin: 0 0 6px 20px; }
.adv-msg li { margin: 2px 0; }
.adv-quote { margin: 6px 0 8px; padding: 6px 12px; border-left: 3px solid var(--gold, var(--accent)); background: var(--panel-2); color: var(--text); font-style: italic; white-space: pre-wrap; }
.adv-quote .adv-qlab { display: block; font-style: normal; font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.8px; color: var(--muted); margin-bottom: 2px; }
.adv-pre { font-family: Consolas, monospace; font-size: 12px; background: var(--bg-2); border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; overflow-x: auto; white-space: pre; margin: 6px 0; }
.adv-msg code { font-family: Consolas, monospace; font-size: 12px; background: var(--bg-2); border-radius: 4px; padding: 0 4px; }
.adv-cite { font-size: 11.5px; padding: 0 6px; margin: 0 1px; vertical-align: baseline; }
.adv-ref { font-family: Consolas, monospace; font-size: 12px; color: var(--accent); white-space: nowrap; }
.adv-id { font-family: Consolas, monospace; font-size: 12px; color: var(--muted); }
.adv-raw { background: rgba(var(--warn-rgb), 0.22); color: var(--text); border-bottom: 2px solid var(--warn); padding: 0 3px; border-radius: 3px; font-style: normal; }
.adv-ruling { color: var(--good); font-weight: 700; }
.adv-unres { color: var(--warn); font-weight: 700; }
.adv-tools { display: flex; flex-direction: column; gap: 3px; margin-bottom: 6px; }
.adv-tool { font-size: 12px; color: var(--muted); font-family: Consolas, monospace; border: 1px dashed var(--line); border-radius: 8px; padding: 3px 8px; }
.adv-tool.is-write { border-style: solid; border-color: var(--warn); color: var(--text); background: rgba(var(--warn-rgb), 0.10); white-space: pre-wrap; font-family: inherit; }
.adv-tool.is-done { border-color: var(--good); background: rgba(var(--good-rgb), 0.10); }
.adv-tool.is-off { opacity: 0.7; background: transparent; }
.adv-tool.is-refused { border-color: var(--bad); color: var(--bad); }
.adv-gate { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 6px; }
.adv-gate .adv-yes { background: var(--good); color: var(--on-accent); border: 1px solid var(--good); border-radius: 999px; padding: 5px 14px; font-weight: 700; cursor: pointer; font-family: inherit; font-size: 12.5px; }
.adv-gate .adv-no { background: transparent; color: var(--muted); border: 1px solid var(--line); border-radius: 999px; padding: 5px 12px; cursor: pointer; font-family: inherit; font-size: 12.5px; }
.adv-gate .adv-ttl { font-size: 11px; color: var(--muted); font-family: Consolas, monospace; }
.adv-usage { font-size: 11px; color: var(--muted); font-family: Consolas, monospace; margin-top: 8px; border-top: 1px dashed var(--line); padding-top: 4px; display: flex; flex-wrap: wrap; gap: 10px; }
.adv-usage .miss { color: var(--bad); font-weight: 700; }
.adv-usage .rewrite { color: var(--warn); }
.adv-compose { display: flex; flex-direction: column; gap: 8px; border: 1px solid var(--line); border-radius: 12px; padding: 10px 12px; background: var(--panel); }
.adv-compose textarea { width: 100%; resize: vertical; font: inherit; font-size: 13.5px; line-height: 1.5; color: var(--text); background: var(--bg-2); border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; box-sizing: border-box; }
.adv-compose textarea:focus { outline: none; border-color: var(--accent); }
.adv-compose textarea:disabled { opacity: 0.7; }
#adv-student { min-height: 44px; font-size: 12.5px; }
#adv-q { min-height: 72px; }
.adv-row { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
.adv-mic { font-size: 18px; line-height: 1; padding: 6px 12px; border-radius: 999px; border: 1px solid var(--line); background: transparent; cursor: pointer; color: var(--text); font-family: inherit; user-select: none; -webkit-user-select: none; touch-action: none; }
.adv-mic.on { border-color: var(--bad); background: rgba(var(--bad-rgb), 0.18); animation: adv-pulse 1.1s ease-in-out infinite; }
@keyframes adv-pulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(var(--bad-rgb), 0.5); } 50% { box-shadow: 0 0 0 8px rgba(var(--bad-rgb), 0); } }
.adv-speech-note { font-size: 11.5px; color: var(--muted); line-height: 1.4; flex: 1 1 260px; }
.adv-interim { font-size: 12px; color: var(--accent); font-style: italic; min-height: 1.2em; }
.adv-send { background: var(--accent); color: var(--on-accent); border: 1px solid var(--accent); border-radius: 999px; padding: 7px 18px; font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit; }
.adv-send:disabled { opacity: 0.45; cursor: default; }
.adv-stop { color: var(--bad); border-color: var(--bad); }
.adv-turn { font-size: 11.5px; color: var(--muted); font-family: Consolas, monospace; }
.adv-hint { color: var(--muted); font-size: 12.5px; }
@media (max-width: 740px) { .adv-view { padding: 10px 12px; } .adv-msg { max-width: 100%; } }
`;
  function ensureStyle() {
    if ($("adv-style")) return;
    const st = document.createElement("style");
    st.id = "adv-style";
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  /* ════════════════════════════════════════════════════════════════════════
     § 1  MARKDOWN — small, honest, and it knows what a citation looks like
     ════════════════════════════════════════════════════════════════════════ */
  const RE_ID_OPEN = /^(fail|gt|st|ft)-\d+$/i;           // ids app.js can open in Requirements
  function inline(s) {
    // s is already HTML-escaped
    s = s.replace(/`([^`]+)`/g, (m, c) => `<code>${c}</code>`);
    s = s.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
    s = s.replace(/(^|[\s(«])\*([^*\n]+)\*(?=[\s).,;:»]|$)/g, "$1<i>$2</i>");
    s = s.replace(/ΑΚΑΤΕΡΓΑΣΤΟ ΚΕΙΜΕΝΟ ΠΗΓΗΣ[^<\n]*?(?:επικύρωση|ΕΠΙΚΥΡΩΣΗ)/g, (m) => `<mark class="adv-raw">${m}</mark>`);
    s = s.replace(/✓ ΑΠΟΦΑΝΣΗ/g, `<span class="adv-ruling">✓ ΑΠΟΦΑΝΣΗ</span>`);
    s = s.replace(/⚠ ΑΛΥΤΟ/g, `<span class="adv-unres">⚠ ΑΛΥΤΟ</span>`);
    s = s.replace(/\[([a-z]{2,6}-\d+)\]|(?<![\w-])((?:fail|gt|st|ft)-\d+)(?![\w-])/g, (m, bracketed, bare) => {
      const id = bracketed || bare;
      return RE_ID_OPEN.test(id)
        ? `<button type="button" class="req-link adv-cite" data-req="${esc(id)}" title="Άνοιγμα στο Requirements">${esc(id)}</button>`
        : `<span class="adv-id">[${esc(id)}]</span>`;
    });
    s = s.replace(/(§\s?\d+[α-ωa-z]{0,3}(?:\(\d+\))?(?:\s?[α-ω]\.)?)/g, `<span class="adv-ref">$1</span>`);
    s = s.replace(/(άρθρο\s\d+(?:\s?παρ\.?\s?\d+[α-ω]?)?|παρ\.\s?\d+[α-ω]?)/g, `<span class="adv-ref">$1</span>`);
    return s;
  }
  function md(text) {
    const src = String(text || "").replace(/\r\n?/g, "\n");
    const out = [];
    const chunks = src.split(/```/);
    chunks.forEach((chunk, i) => {
      if (i % 2 === 1) { out.push(`<pre class="adv-pre">${esc(chunk.replace(/^[a-z]*\n/, ""))}</pre>`); return; }
      const lines = chunk.split("\n");
      let para = [], list = null, quote = [];
      const flushP = () => { if (para.length) { out.push(`<p>${inline(esc(para.join(" ")))}</p>`); para = []; } };
      const flushL = () => { if (list) { out.push(`<${list.tag}>${list.items.map((x) => `<li>${inline(esc(x))}</li>`).join("")}</${list.tag}>`); list = null; } };
      const flushQ = () => { if (quote.length) { out.push(`<blockquote class="adv-quote"><span class="adv-qlab">αυτολεξεί</span>${inline(esc(quote.join("\n")))}</blockquote>`); quote = []; } };
      for (const raw of lines) {
        const line = raw.replace(/\s+$/, "");
        let m;
        if (!line.trim()) { flushP(); flushL(); flushQ(); continue; }
        if ((m = /^(#{1,4})\s+(.*)$/.exec(line))) { flushP(); flushL(); flushQ(); out.push(`<h4 class="adv-h">${inline(esc(m[2]))}</h4>`); continue; }
        if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) { flushP(); flushL(); flushQ(); out.push("<hr>"); continue; }
        if ((m = /^\s*>\s?(.*)$/.exec(line))) { flushP(); flushL(); quote.push(m[1]); continue; }
        if ((m = /^\s*(?:[-•*]|\d+[.)])\s+(.*)$/.exec(line))) {
          flushP(); flushQ();
          const tag = /^\s*\d/.test(line) ? "ol" : "ul";
          if (!list || list.tag !== tag) { flushL(); list = { tag: tag, items: [] }; }
          list.items.push(m[1]); continue;
        }
        if (list && /^\s{2,}\S/.test(line)) { list.items[list.items.length - 1] += " " + line.trim(); continue; }
        flushL(); flushQ(); para.push(line.trim());
      }
      flushP(); flushL(); flushQ();
    });
    return out.join("");
  }

  /* ════════════════════════════════════════════════════════════════════════
     § 2  THE PROXY — feature-detect, sessions, confirm
     ════════════════════════════════════════════════════════════════════════ */
  function jfetch(path, opts) {
    return fetch(PROXY + path, Object.assign({ cache: "no-store" }, opts || {})).then((r) => r.json().then((j) => {
      if (!r.ok) { const e = new Error(j.error || r.statusText); e.code = j.code; e.status = r.status; throw e; }
      return j;
    }));
  }
  const jpost = (path, body) => jfetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });

  function health(force) {
    if (!force && UI.health && Date.now() - UI.healthAt < 30000) return Promise.resolve(UI.health);
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 2500);
    return fetch(PROXY + "/health", { signal: ac.signal, cache: "no-store" })
      .then((r) => r.json())
      .then((h) => {
        clearTimeout(t);
        UI.health = h; UI.healthAt = Date.now(); UI.offline = false;
        if (!UI.agent || !(h.agents || []).some((a) => a.id === UI.agent)) {
          const pref = (h.agents || []).find((a) => a.id === "board-director") || (h.agents || [])[0];
          UI.agent = pref ? pref.id : null;
        }
        const ag = (h.agents || []).find((a) => a.id === UI.agent);
        UI.turnMax = ag ? ag.max_turns : (h.caps ? h.caps.max_turns : 20);
        UI.today = h.today || null;
        return h;
      })
      .catch(() => { clearTimeout(t); UI.offline = true; UI.health = null; UI.healthAt = Date.now(); return null; });
  }
  function loadSessions() {
    if (!UI.agent || UI.offline) { UI.sessions = []; return Promise.resolve([]); }
    return jfetch(`/sessions?agent=${encodeURIComponent(UI.agent)}`).then((j) => { UI.sessions = j.sessions || []; return UI.sessions; }).catch(() => { UI.sessions = []; return []; });
  }
  function loadSession(id) {
    return jfetch(`/sessions/${encodeURIComponent(id)}?agent=${encodeURIComponent(UI.agent)}`).then((j) => { UI.session = j.session; return j.session; });
  }
  function newSession(context) {
    return jpost("/sessions", { agent: UI.agent, context: context || "" }).then((j) => { UI.session = j.session; return j.session; });
  }
  const agentOf = (id) => ((UI.health && UI.health.agents) || []).find((a) => a.id === id) || null;
  const userTurns = () => (UI.session ? UI.session.messages.filter((m) => m.role === "user" && !m.kind).length : 0);

  /* ════════════════════════════════════════════════════════════════════════
     § 3  RENDER
     ════════════════════════════════════════════════════════════════════════ */
  function render() {
    const host = UI.host;
    if (!host) return;
    const h = UI.health;
    const agents = (h && h.agents) || [];
    const S = UI.session;
    const pills = agents.map((a) => `<button type="button" class="fc-pill adv-agent" data-agent="${esc(a.id)}" aria-pressed="${UI.agent === a.id}" title="${esc(a.name)} · ${esc(a.corpus)} · ${a.corpus_bytes ? fmtK(a.corpus_bytes) + "B" : "—"}${a.tools_offered && a.tools_offered.length ? " · εργαλεία: " + esc(a.tools_offered.join(", ")) : ""}">${esc(a.name)}</button>`).join("");
    const st = h ? `
      <span class="badge ${h.key_present ? "ok" : "bad"}" title="ANTHROPIC_API_KEY στο περιβάλλον του proxy">${h.key_present ? "κλειδί ✓" : "χωρίς κλειδί"}</span>
      <span class="badge" title="Αιτήματα σήμερα / ημερήσιο όριο (φρένο 2)">σήμερα ${h.today ? h.today.count : 0}/${h.caps ? h.caps.daily_cap : "?"}</span>
      <span class="badge ${h.casefile && h.casefile.configured ? "ok" : ""}" title="Φάκελος υποθέσεων: FDMS_CASEFILE_URL/KEY στο περιβάλλον του proxy. Κάθε εγγραφή περνά από «Γράψ' το».">${h.casefile && h.casefile.configured ? "φάκελος ✓ · πύλη" : "φάκελος —"}</span>
      <span class="badge" title="Prompt cache TTL">cache ${h.caps ? esc(h.caps.cache_ttl) : "—"}</span>` : "";
    const notice = UI.offline ? `
      <div class="adv-notice" role="alert">
        <b>Ο τοπικός σύμβουλος δεν τρέχει.</b> Η καρτέλα αυτή χρειάζεται τον proxy στο <code>${esc(PROXY)}</code>,
        που κρατά το κλειδί του API έξω από τη σελίδα. Άνοιξε ένα τερματικό στο <code>D:\\FDMS</code>, όρισε την
        <code>ANTHROPIC_API_KEY</code> και τρέξε:<br>
        <span class="adv-cmd">${esc(START_CMD)}</span><br>
        Οι υπόλοιπες καρτέλες δουλεύουν κανονικά· αυτή ξαναελέγχει με το κουμπί «Έλεγχος».
      </div>` : (h && !h.key_present ? `
      <div class="adv-notice" role="alert"><b>Ο proxy τρέχει, αλλά χωρίς κλειδί.</b> Όρισε την <code>ANTHROPIC_API_KEY</code>
        στο τερματικό του proxy και ξαναξεκίνησέ τον — κάθε ερώτηση θα απαντά 503 μέχρι τότε.</div>` : "");
    const sessOpts = [`<option value="">— νέα συζήτηση —</option>`].concat(UI.sessions.map((s) =>
      `<option value="${esc(s.id)}" ${S && S.id === s.id ? "selected" : ""}>${esc(s.title)} · ${esc(ago(s.updated))} · ${s.turns} γύρ.${s.writes ? ` · ✎${s.writes}` : ""}${s.compactions ? ` · ♻${s.compactions}` : ""}${s.student_label ? ` · ${esc(s.student_label)}` : ""}</option>`)).join("");
    const canClose = S && (S.writes || []).length > 0 && !UI.busy;
    const speechOK = !!UI.speech.api;
    const turns = userTurns();
    const capped = turns >= UI.turnMax;
    const canSend = !UI.offline && h && h.key_present && UI.agent && !UI.busy && !capped;
    const ctxLocked = !!(S && S.messages.some((m) => !m.kind));
    const ctxVal = S ? (S.context || "") : (UI.ctxDraft || "");
    const draft = UI.draft != null ? UI.draft : (($("adv-q") || {}).value || "");
    UI.draft = null;

    host.innerHTML = `
      <div class="adv-bar">
        <div class="bt-tabs" style="margin:0" aria-label="Agent">${pills || `<span class="adv-hint">— κανένας agent (λείπει ο φάκελος agents/)</span>`}</div>
        <span class="spacer"></span>
        <div class="adv-status">${st}</div>
        <button type="button" class="fc-tbtn" id="adv-recheck" title="Ξαναρώτα τον proxy (GET /health)">↻ Έλεγχος</button>
      </div>
      ${notice}
      ${!UI.offline && h ? `<div class="adv-sess">
        <label for="adv-sess-sel">Συζήτηση</label>
        <select id="adv-sess-sel" ${UI.busy ? "disabled" : ""} title="Οι συνεδρίες μένουν στον proxy (tools/advisor/sessions) — όχι στον browser">${sessOpts}</select>
        <button type="button" class="fc-tbtn" id="adv-new" ${UI.busy ? "disabled" : ""} title="Καινούργια συζήτηση (η τρέχουσα μένει στη λίστα)">✦ Νέα</button>
        ${S ? `<button type="button" class="fc-tbtn" id="adv-archive" ${UI.busy ? "disabled" : ""} title="Αρχειοθέτηση — φεύγει από τη λίστα, δεν σβήνεται">▣ Αρχειοθέτηση</button>` : ""}
        ${canClose ? `<button type="button" class="fc-tbtn adv-close" id="adv-close" title="Αρχειοθετεί αυτή τη συζήτηση και ανοίγει νέα με αφετηρία τον φάκελο του μαθητή όπως είναι ΤΩΡΑ καταγεγραμμένος">✓ Έκλεισε η υπόθεση</button>` : ""}
        ${S ? `<button type="button" class="fc-tbtn" id="adv-export" ${UI.busy ? "disabled" : ""} title="Κατεβάζει αυτή τη συζήτηση ως αρχείο Markdown (ερωτήσεις, απαντήσεις, εργαλεία, εγγραφές, compactions, usage)">⭳ Λήψη</button>` : ""}
        ${S ? `<span class="adv-turn" title="Χαρακτήρες ιστορικού αυτής της συζήτησης — ΟΧΙ tokens, ΟΧΙ το corpus. Το corpus μένει στο cache και δεν μετρά εδώ.">${esc(S.id)} · ${S.messages.reduce((n, m) => n + (m.content || "").length, 0).toLocaleString("el-GR")} χαρακτήρες ιστορικού${h.memory ? ` · ♻ σύμπτυξη στους ${Number(h.memory.compact_after_chars).toLocaleString("el-GR")} χαρακτήρες (≈ ${(Math.round(h.memory.compact_after_chars / 2.8 / 5000) * 5000).toLocaleString("el-GR")} tokens)` : ""}</span>` : ""}
      </div>
      <p class="adv-help"><b>Έλεγχος</b>: ξαναρωτά τον τοπικό proxy αν είναι ζωντανός. <b>Νέα</b>: καινούργια συζήτηση — η τρέχουσα μένει στη λίστα. <b>Αρχειοθέτηση</b>: φεύγει από τη λίστα, δεν σβήνεται ποτέ. <b>Λήψη</b>: κατεβάζει τη συζήτηση ως Markdown στον δίσκο σου. <b>Έκλεισε η υπόθεση</b>: αρχειοθετεί και ανοίγει νέα με αφετηρία τον φάκελο του μαθητή. Οι συζητήσεις ζουν στον proxy (tools/advisor/sessions), όχι στον browser.</p>` : ""}
      ${S && S.events && S.events.length ? `<div class="adv-events">${S.events.slice(-4).map(eventHTML).join("")}</div>` : ""}
      <div class="adv-transcript" id="adv-transcript" role="log" aria-live="polite" aria-label="Συζήτηση">
        ${S && S.messages.length ? "" : `<p class="adv-hint">Ρώτα κανονιστικά: «Ο μαθητής βαθμολογήθηκε ΑΠΟΤΥΧΙΑ στην C4790 — τι ενεργοποιείται και με ποιον πετάει μετά;». Ο σύμβουλος απαντά ΜΟΝΟ από το επικυρωμένο corpus, με id και παραπομπή· ό,τι βρει έξω από αυτό το σημαίνει ως <mark class="adv-raw">ακατέργαστο</mark>. Μια εγγραφή στον φάκελο γίνεται μόνο όταν πατήσεις εσύ «Γράψ' το».</p>`}
      </div>
      <div class="adv-compose">
        <label class="lbl" for="adv-student" style="margin:0">Πλαίσιο περίπτωσης (προαιρετικό) — μόνο ό,τι γράφεις εσύ ταξιδεύει· δένει με το πρώτο μήνυμα της συζήτησης</label>
        <textarea id="adv-student" ${ctxLocked ? "disabled title='Κλειδώνει μετά το πρώτο μήνυμα — Νέα για να αλλάξει'" : ""} placeholder="π.χ. Προσαρμογή, 8η έξοδος του σταδίου, C4790 Αξιολόγηση, είχε ήδη Δοκιμή Προόδου με ΑΕ 62%">${esc(ctxVal)}</textarea>
        <label class="lbl" for="adv-q" style="margin:0">Ερώτηση <span class="adv-turn">γύρος ${Math.min(turns + 1, UI.turnMax)}/${UI.turnMax}</span></label>
        <textarea id="adv-q" placeholder="Γράψε ή κράτα πατημένο το 🎤 και μίλα… (Ctrl+Enter στέλνει)" ${UI.busy ? "disabled" : ""}></textarea>
        <div class="adv-interim" id="adv-interim">${esc(UI.speech.interim || UI.speech.err)}</div>
        <div class="adv-row">
          ${speechOK ? `<button type="button" class="adv-mic${UI.speech.on ? " on" : ""}" id="adv-mic" aria-pressed="${UI.speech.on}" title="Κράτα πατημένο και μίλα (el-GR)">🎤</button>
          <span class="adv-speech-note">Η ομιλία αποστέλλεται στους διακομιστές του κατασκευαστή του browser για αναγνώριση (el-GR). Το κείμενο μπαίνει στο κουτί — το διορθώνεις πριν το στείλεις.</span>` : `<span class="adv-speech-note">Ο browser δεν έχει αναγνώριση ομιλίας — πληκτρολόγησε.</span>`}
          <span class="spacer" style="flex:1 1 auto"></span>
          ${UI.busy ? `<button type="button" class="fc-tbtn adv-stop" id="adv-stop">■ Διακοπή</button>` : ""}
          <button type="button" class="adv-send" id="adv-send" ${canSend ? "" : "disabled"} title="${capped ? "Όριο γύρων — Νέα συζήτηση" : "Ctrl+Enter"}">${capped ? "Όριο γύρων" : "Στείλε ▸"}</button>
        </div>
      </div>`;
    if (draft) $("adv-q").value = draft;
    renderTranscript();
  }

  function eventHTML(e) {
    if (e.type === "compaction") return `<div class="adv-event is-compaction">♻ Compaction #${e.n} στις ${esc(hhmm(e.at))}: το ιστορικό (${fmtK(e.chars_before)} χαρ.) έγινε δομημένη σύνοψη (${fmtK(e.chars_after)} χαρ.)${e.kept_pairs ? `, ${e.kept_pairs} ζεύγος αυτούσιο` : ""}. Οι παραπομπές και οι εγγραφές κρατήθηκαν.</div>`;
    if (e.type === "seed") return `<div class="adv-event">⤷ ${esc(e.text)}</div>`;
    if (e.type === "archived") return `<div class="adv-event">▣ ${esc(e.text)}</div>`;
    return `<div class="adv-event">${esc(e.text || e.type)}</div>`;
  }
  function msgHTML(m, i, all) {
    const S = UI.session;
    if (m.kind === "summary" || m.kind === "seed") {
      if (m.role === "assistant") return "";                     // the ack line adds nothing on screen
      const lab = m.kind === "summary" ? "σύνοψη μετά από compaction — αυτό θυμάται ο σύμβουλος" : "αφετηρία — ο φάκελος όπως ήταν καταγεγραμμένος όταν άνοιξε η συζήτηση";
      return `<div class="adv-msg is-system"><span class="adv-who">${lab}</span>${md(m.content)}</div>`;
    }
    if (m.role === "user") {
      const first = all.findIndex((x) => x.role === "user" && !x.kind) === i;
      return `<div class="adv-msg is-user"><span class="adv-who">εσύ${m.at ? " · " + esc(hhmm(m.at)) : ""}</span>${esc(m.content)}${first && S && S.context ? `<div class="adv-ctx">πλαίσιο: ${esc(S.context)}</div>` : ""}</div>`;
    }
    return `<div class="adv-msg is-assistant"><span class="adv-who">${esc(agentOf(UI.agent) ? agentOf(UI.agent).name : "σύμβουλος")}${m.at ? " · " + esc(hhmm(m.at)) : ""}</span>${toolsHTML(m.tools)}${md(m.content)}${m.usage ? usageHTML(m.usage) : ""}</div>`;
  }
  function toolsHTML(tools) {
    if (!tools || !tools.length) return "";
    return `<div class="adv-tools">${tools.map((t) => {
      if (t.tool === "search_sources") {
        return `<div class="adv-tool${t.status === "refused" ? " is-refused" : ""}">🔎 ${esc(t.source || "?")} · «${esc(t.query || "")}»${t.hits != null ? ` · ${t.hits} ευρήματα` : ""}${t.status && t.status !== "ok" ? ` · ${esc(t.status)}` : ""}</div>`;
      }
      if (!t.write) return `<div class="adv-tool${t.status === "error" ? " is-refused" : ""}">🗂 ${esc(t.tool || t.name || "")}${t.summary ? ` · ${esc(t.summary)}` : ""}${t.status && t.status !== "ok" ? ` · ${esc(t.status)}` : ""}</div>`;
      // a WRITE: pending (gate) · confirmed · cancelled · failed · refused by a brake
      if (t.confirmed) return `<div class="adv-tool is-write is-done">✓ ΓΡΑΦΤΗΚΕ ΣΤΟΝ ΦΑΚΕΛΟ · case ${esc(t.case_id)} · ${esc(hhmm(t.at))}\n${esc(t.preview || "")}</div>`;
      if (t.cancelled) return `<div class="adv-tool is-write is-off">✕ Ακυρώθηκε από εσένα · ${esc(t.tool)}\n${esc(t.preview || "")}</div>`;
      if (t.failed) return `<div class="adv-tool is-write is-refused">✕ Ο φάκελος απέρριψε την εγγραφή: ${esc(t.failed)}</div>`;
      if (t.pending && t.token) {
        const left = t.expires ? Math.max(0, Math.round((t.expires * 1000 - Date.now()) / 60000)) : null;
        const expired = left === 0;
        return `<div class="adv-tool is-write">✎ ΕΚΚΡΕΜΗΣ ΕΓΓΡΑΦΗ — περιμένει εσένα · ${esc(t.tool)}\n${esc(t.preview || "")}
          <div class="adv-gate">${expired ? `<span class="adv-ttl">έληξε — ζήτα ξανά από τον σύμβουλο να την ετοιμάσει</span>` :
            `<button type="button" class="adv-yes" data-confirm="${esc(t.token)}" ${UI.busy ? "disabled" : ""}>Γράψ' το</button>
             <button type="button" class="adv-no" data-cancel="${esc(t.token)}" ${UI.busy ? "disabled" : ""}>Άκυρο</button>
             <span class="adv-ttl">λήγει σε ${left}′ · actor agent:${esc(UI.agent)}</span>`}</div></div>`;
      }
      return `<div class="adv-tool is-write is-refused">✎ ${esc(t.tool)} · ${esc(t.summary || "")} · ${esc(t.status || "")}</div>`;
    }).join("")}</div>`;
  }
  function usageHTML(u) {
    const miss = u.expected_cache_read && !u.cache_ok;
    return `<div class="adv-usage" title="input · cache write · cache read · output (tokens)">
      <span>in ${fmtK(u.input_tokens)}</span><span>cache✎ ${fmtK(u.cache_creation_input_tokens)}</span>
      <span>cache◉ ${fmtK(u.cache_read_input_tokens)}</span><span>out ${fmtK(u.output_tokens)}</span>
      ${u.iterations > 1 ? `<span>${u.iterations} γύροι εργαλείων</span>` : ""}
      ${u.casefile_writes ? `<span>${u.casefile_writes} προεπισκ. εγγραφής</span>` : ""}
      ${u.cache_rewrite && !miss ? `<span class="rewrite">↻ το corpus ξαναγράφτηκε στο cache (η μνήμη 1h είχε λήξει) — αναμενόμενο μετά από διάλειμμα</span>` : ""}
      ${miss ? `<span class="miss">⚠ ΧΩΡΙΣ cache — πλήρης χρέωση του corpus</span>` : ""}</div>`;
  }
  function renderTranscript() {
    const t = $("adv-transcript");
    if (!t) return;
    const msgs = UI.session ? UI.session.messages : [];
    const parts = msgs.map((m, i) => msgHTML(m, i, msgs)).filter(Boolean);
    if (UI.pending) {
      for (const n of UI.pending.notices || []) parts.push(`<div class="adv-msg is-notice"><span class="adv-who">σημείωση</span>${esc(n)}</div>`);
      parts.push(`<div class="adv-msg is-user"><span class="adv-who">εσύ</span>${esc(UI.pending.question)}</div>`);
      parts.push(`<div class="adv-msg is-assistant" id="adv-live"><span class="adv-who">${esc(agentOf(UI.agent) ? agentOf(UI.agent).name : "σύμβουλος")} · …</span>${toolsHTML(UI.pending.tools)}${md(UI.pending.text) || `<span class="adv-hint">σκέφτεται…</span>`}</div>`);
    }
    for (const e of UI.errors || []) parts.push(`<div class="adv-msg ${e.kind === "notice" ? "is-notice" : "is-error"}"><span class="adv-who">${e.kind === "notice" ? "σημείωση" : "σφάλμα"}</span>${esc(e.text)}</div>`);
    if (parts.length) t.innerHTML = parts.join("");
    t.scrollTop = t.scrollHeight;
  }

  /* ════════════════════════════════════════════════════════════════════════
     § 4  SEND — SSE over fetch; the proxy keeps the history
     ════════════════════════════════════════════════════════════════════════ */
  function send() {
    const q = (($("adv-q") || {}).value || "").trim();
    if (!q || UI.busy || !UI.agent) return;
    const ctx = (($("adv-student") || {}).value || "").trim();
    UI.errors = [];
    UI.busy = true;
    UI.draft = "";
    UI.pending = { question: q, text: "", tools: [], usage: null, notices: [] };
    render();
    const ac = new AbortController();
    UI.abort = ac;
    let lastDraw = 0;
    const draw = (force) => { const now = Date.now(); if (force || now - lastDraw > 120) { lastDraw = now; renderTranscript(); } };
    const fail = (text) => { UI.errors.push({ kind: "error", text: text }); UI.draft = q; };
    const ensure = UI.session ? Promise.resolve(UI.session) : newSession(ctx).then((s) => { loadSessions(); return s; });
    ensure.then((S) => fetch(PROXY + "/ask", { method: "POST", headers: { "Content-Type": "application/json" }, signal: ac.signal,
      body: JSON.stringify({ agent: UI.agent, session: S.id, question: q, student: ctx || undefined }) }))
      .then((res) => {
        if (!res.ok) return res.json().then((j) => { fail(`${j.error || res.statusText} (${res.status}${j.code ? " · " + j.code : ""})`); });
        const reader = res.body.getReader(), dec = new TextDecoder();
        let buf = "", gotDone = false;
        const handle = (ev) => {
          const P = UI.pending;
          if (!P) return;
          switch (ev.type) {
            case "start": UI.turnMax = ev.max_turns || UI.turnMax; if (UI.today) UI.today.count = ev.today; break;
            case "compacted": P.notices.push(ev.message); draw(true); break;
            case "text": P.text += ev.text; draw(false); break;
            case "tool_call": P.tools.push({ tool: ev.name, name: ev.name, pending: true, write: /^casefile_(add|update)_case$/.test(ev.name),
              query: ev.input && ev.input.query, source: ev.input && ev.input.source,
              summary: ev.name !== "search_sources" ? Object.keys(ev.input || {}).filter((k) => ev.input[k] !== "" && ev.input[k] !== false && ev.input[k] !== -1).map((k) => `${k}=${String(ev.input[k]).slice(0, 40)}`).join(" · ") : "" }); draw(true); break;
            case "tool_result": {
              const slot = P.tools.find((t) => t.pending && !t.token && t.tool === ev.tool);
              const rec = Object.assign({}, ev, { query: ev.query || (slot && slot.query), source: ev.source || (slot && slot.source) });
              if (!("pending" in ev)) rec.pending = false;
              if (slot) Object.assign(slot, rec); else P.tools.push(rec);
              draw(true); break;
            }
            case "usage": P.usage = ev; break;
            case "notice": UI.errors.push({ kind: "notice", text: ev.message }); break;
            case "error": UI.errors.push({ kind: "error", text: ev.message }); break;
            case "done": gotDone = true; break;
          }
        };
        const pump = () => reader.read().then(({ done, value }) => {
          if (done) return;
          buf += dec.decode(value, { stream: true });
          let i;
          while ((i = buf.indexOf("\n\n")) >= 0) {
            const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
            for (const line of chunk.split("\n")) if (line.startsWith("data: ")) { try { handle(JSON.parse(line.slice(6))); } catch (e) { /* a torn frame; the next one is whole */ } }
          }
          return pump();
        });
        return pump().then(() => {
          if (!gotDone) fail(UI.pending && UI.pending.text.trim() ? "Η ροή κόπηκε πριν το τέλος — η απάντηση δεν αποθηκεύτηκε." : "Η ροή κόπηκε πριν την απάντηση.");
        });
      })
      .catch((e) => { fail(e.name === "AbortError" ? "Διακόπηκε." : (e.status ? `${e.message} (${e.status}${e.code ? " · " + e.code : ""})` : `Δεν υπάρχει σύνδεση με τον proxy (${e.message}). Τρέχει ο ${START_CMD}?`)); })
      .then(() => { UI.busy = false; UI.pending = null; UI.abort = null;
        // the proxy's copy is canonical (tokens, confirmed ids, compaction events): reload it
        const reload = UI.session ? loadSession(UI.session.id).catch(() => null) : Promise.resolve();
        return reload.then(() => health(true)).then(loadSessions).then(render);
      });
  }

  function confirmWrite(token, action) {
    if (!UI.session || UI.busy) return;
    UI.busy = true; render();
    jpost("/confirm", { agent: UI.agent, session: UI.session.id, token: token, action: action })
      .then((j) => { if (j.cancelled) UI.errors = [{ kind: "notice", text: "Η εγγραφή ακυρώθηκε — τίποτα δεν γράφτηκε." }];
                     else UI.errors = [{ kind: "notice", text: `Γράφτηκε: ${j.result.split("\n")[0]}. Τώρα μπορείς να πατήσεις «Έκλεισε η υπόθεση».` }]; })
      .catch((e) => { UI.errors = [{ kind: "error", text: `${e.message}${e.code ? " (" + e.code + ")" : ""}` }]; })
      .then(() => loadSession(UI.session.id).catch(() => null))
      .then(() => { UI.busy = false; return loadSessions(); }).then(render);
  }
  function closeCase() {
    if (!UI.session || UI.busy) return;
    if (!confirm("Αρχειοθέτηση αυτής της συζήτησης και νέα με αφετηρία τον φάκελο του μαθητή όπως είναι τώρα;")) return;
    UI.busy = true; render();
    jpost(`/sessions/${encodeURIComponent(UI.session.id)}/close`, { agent: UI.agent })
      .then((j) => { UI.session = j.session; UI.errors = []; })
      .catch((e) => { UI.errors = [{ kind: "error", text: e.message }]; })
      .then(() => { UI.busy = false; return loadSessions(); }).then(render);
  }
  function exportSession() {
    // The proxy answers with Content-Disposition: attachment, so a plain link
    // click saves the file and the page stays where it is. Nothing leaves the
    // machine: it is his own proxy writing to his own Downloads folder.
    if (!UI.session) return;
    const url = `${PROXY}/sessions/${encodeURIComponent(UI.session.id)}/export?agent=${encodeURIComponent(UI.agent)}&format=md`;
    fetch(url, { cache: "no-store" }).then((r) => {
      if (!r.ok) return r.json().then((j) => { throw new Error(j.error || r.statusText); });
      const cd = r.headers.get("Content-Disposition") || "";
      const name = (/filename="([^"]+)"/.exec(cd) || [])[1] || `advisor-${UI.session.id}.md`;
      return r.blob().then((b) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(b); a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        UI.errors = [{ kind: "notice", text: `Κατέβηκε: ${name}` }]; renderTranscript();
      });
    }).catch((e) => { UI.errors = [{ kind: "error", text: `Η λήψη απέτυχε: ${e.message}` }]; renderTranscript(); });
  }
  function archiveSession() {
    if (!UI.session || UI.busy) return;
    jpost(`/sessions/${encodeURIComponent(UI.session.id)}/archive`, { agent: UI.agent })
      .catch((e) => { UI.errors = [{ kind: "error", text: e.message }]; })
      .then(() => { UI.session = null; UI.errors = []; return loadSessions(); }).then(render);
  }

  /* ════════════════════════════════════════════════════════════════════════
     § 5  SPEECH — hold to talk, el-GR, text lands in the box
     ════════════════════════════════════════════════════════════════════════ */
  function speechStart() {
    const S = UI.speech;
    if (!S.api || S.on) return;
    const rec = new S.api();
    rec.lang = "el-GR"; rec.continuous = true; rec.interimResults = true; rec.maxAlternatives = 1;
    S.rec = rec; S.on = true; S.interim = ""; S.err = "";
    let finals = "";
    rec.onresult = (ev) => {
      let interim = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (r.isFinal) finals += (finals ? " " : "") + r[0].transcript.trim(); else interim += r[0].transcript;
      }
      S.interim = interim;
      const q = $("adv-q");
      if (q && finals) {
        const base = q.getAttribute("data-base") != null ? q.getAttribute("data-base") : q.value;
        if (q.getAttribute("data-base") == null) q.setAttribute("data-base", base);
        q.value = (base ? base.replace(/\s+$/, "") + " " : "") + finals;
      }
      const il = $("adv-interim"); if (il) il.textContent = interim;
    };
    rec.onerror = (ev) => { S.err = ev.error === "not-allowed" ? "Ο browser δεν έδωσε άδεια μικροφώνου." : `Αναγνώριση ομιλίας: ${ev.error}`; };
    rec.onend = () => {
      S.on = false; S.rec = null; S.interim = "";
      const q = $("adv-q"); if (q) q.removeAttribute("data-base");
      const b = $("adv-mic"); if (b) { b.classList.remove("on"); b.setAttribute("aria-pressed", "false"); }
      const il = $("adv-interim"); if (il) il.textContent = S.err;
    };
    try { rec.start(); } catch (e) { S.on = false; S.rec = null; S.err = "Δεν ξεκίνησε η αναγνώριση ομιλίας."; }
    const b = $("adv-mic"); if (b) { b.classList.add("on"); b.setAttribute("aria-pressed", "true"); }
  }
  function speechStop() { const S = UI.speech; if (S.rec) { try { S.rec.stop(); } catch (e) { /* already stopped */ } } }

  /* ════════════════════════════════════════════════════════════════════════
     § 6  WIRE + BOOT
     ════════════════════════════════════════════════════════════════════════ */
  function wire(host) {
    if (host._advWired) return;
    host._advWired = true;
    host.addEventListener("click", (ev) => {
      const t = ev.target instanceof Element ? ev.target : null;
      if (!t) return;
      const ag = t.closest(".adv-agent");
      if (ag) {
        if (UI.busy || ag.dataset.agent === UI.agent) return;
        UI.agent = ag.dataset.agent; UI.session = null; UI.errors = [];
        const a = agentOf(UI.agent); UI.turnMax = a ? a.max_turns : UI.turnMax;
        loadSessions().then(render); return;
      }
      if (t.id === "adv-recheck") { health(true).then(loadSessions).then(render); return; }
      if (t.id === "adv-new") { if (UI.busy) return; UI.session = null; UI.errors = []; UI.ctxDraft = ""; render(); return; }
      if (t.id === "adv-archive") { archiveSession(); return; }
      if (t.id === "adv-export") { exportSession(); return; }
      if (t.id === "adv-close") { closeCase(); return; }
      if (t.id === "adv-send") { send(); return; }
      if (t.id === "adv-stop") { if (UI.abort) UI.abort.abort(); return; }
      const y = t.closest("[data-confirm]"); if (y) { confirmWrite(y.dataset.confirm, "write"); return; }
      const n = t.closest("[data-cancel]"); if (n) { confirmWrite(n.dataset.cancel, "cancel"); return; }
      const c = t.closest(".adv-cite"); if (c && window.openRequirements) { window.openRequirements(c.dataset.req); return; }
    });
    host.addEventListener("change", (ev) => {
      if (ev.target && ev.target.id === "adv-sess-sel") {
        const id = ev.target.value;
        UI.errors = [];
        if (!id) { UI.session = null; render(); return; }
        loadSession(id).then(render, (e) => { UI.errors = [{ kind: "error", text: e.message }]; UI.session = null; render(); });
      }
    });
    host.addEventListener("keydown", (ev) => {
      if (ev.target && ev.target.id === "adv-q" && ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); send(); }
      if (ev.target && ev.target.id === "adv-mic" && (ev.key === " " || ev.key === "Enter")) { ev.preventDefault(); if (UI.speech.on) speechStop(); else speechStart(); }
    });
    host.addEventListener("input", (ev) => { if (ev.target && ev.target.id === "adv-student" && !UI.session) UI.ctxDraft = ev.target.value; });
    host.addEventListener("pointerdown", (ev) => { const b = ev.target.closest && ev.target.closest("#adv-mic"); if (b) { ev.preventDefault(); speechStart(); } });
    host.addEventListener("pointerup", (ev) => { if (ev.target.closest && ev.target.closest("#adv-mic")) speechStop(); });
    host.addEventListener("pointercancel", () => { if (UI.speech.on) speechStop(); });
    document.addEventListener("pointerup", (ev) => { if (UI.speech.on && !(ev.target.closest && ev.target.closest("#adv-mic"))) speechStop(); });
  }

  function advInit() {
    const view = $("view-advisor");
    if (!view) return;                                   // offline build: no view, nothing to do
    ensureStyle();
    let host = $("adv-main");
    if (!host) { host = document.createElement("section"); host.className = "adv-main"; host.id = "adv-main"; view.appendChild(host); }
    UI.host = host;
    wire(host);
    if (!UI.booted) {
      UI.booted = true;
      UI.speech.api = window.SpeechRecognition || window.webkitSpeechRecognition || null;
      UI.errors = [];
      host.innerHTML = `<p class="adv-hint">Έλεγχος του τοπικού proxy…</p>`;
    }
    health(false).then(loadSessions).then(render);
  }

  window.advInit = advInit;
  window.Advisor = { md: md, ui: UI, PROXY: PROXY };
})();
