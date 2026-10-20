"use strict";
/* advisor.js — «ΣΥΜΒΟΥΛΟΣ»: the owner talks to a Claude-backed advisor from
 * inside his own app.
 *
 * WHAT IT IS. A top-level view (tab «Σύμβουλος») with an agent picker, the
 * recent sessions of that agent, a transcript, a question box, send, and a 🎤
 * microphone SWITCH (press to start, press again to stop — §5). It talks ONLY to the local proxy
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
  /* WHERE THE PROXY IS, AND WHY IT DEPENDS ON WHERE THE PAGE IS.

     TWO HOMES, TWO ANSWERS.
       · Served from localhost — the owner at his own machine. The proxy is at
         127.0.0.1:8771, a separate origin, and the proxy's CORS list allows it.
         The port is overridable from localStorage: if 8771 is taken, the proxy
         says so at startup. A per-viewer convenience, never student data.
       · Served from anywhere else — through the Cloudflare tunnel. Then the
         proxy is NOT a separate address: it sits behind the SAME hostname at
         /advisor-proxy, routed there by one ingress rule. Same origin means NO
         CORS and NO mixed content, and the proxy keeps binding to loopback —
         cloudflared is what reaches it, from inside the machine.

     An absolute http:// address would be wrong in the second case twice over:
     an https page may not fetch http, and 127.0.0.1 on a PHONE is the phone. */
  const BASE_PATH = "/advisor-proxy";
  const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\]|::1)$/.test(location.hostname);
  const PROXY_DEFAULT = "http://127.0.0.1:8771";
  const PROXY = (() => {
    if (!LOCAL) return location.origin + BASE_PATH;
    try { const v = localStorage.getItem("p2r-advisor-proxy"); return v && /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(v) ? v : PROXY_DEFAULT; } catch (e) { return PROXY_DEFAULT; }
  })();
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
    turnMax: 20, today: null,
    /* ΤΟ ΜΙΚΡΟΦΩΝΟ (§5). `serial` είναι το κουπόνι: κάθε μηχανή αναγνώρισης
       παίρνει έναν αριθμό και τα handlers της σιωπούν μόλις πάψει να είναι ο
       τρέχων. Χωρίς αυτό, ο κύκλος πάτα-άσε-ξαναπάτα σε κινητό αφήνει ΔΥΟ
       μηχανές ζωντανές και γράφουν και οι δύο στο ίδιο πλαίσιο. */
    speech: { api: null, rec: null, on: false, interim: "", err: "", serial: 0,
              base: "", skip: "", said: "", prev: null, startedAt: 0, lastAt: 0, timer: null, trace: [] },
  };

  /* ════════════════════════════════════════════════════════════════════════
     § 0  STYLES — injected, so styles.css (which ships) stays advisor-free
     ════════════════════════════════════════════════════════════════════════ */
  const CSS = `
.sym-view.hidden, #view-advisor .hidden { display: none; }
.sym-view { flex: 1; display: flex; flex-direction: column; padding: 14px 22px; min-height: 0; min-width: 0; }
.sym-main { display: flex; flex-direction: column; gap: 12px; min-width: 0; max-width: 1100px; width: 100%; margin: 0 auto; }
.sym-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.sym-authbar { position: sticky; top: 0; z-index: 60; display: flex; flex-wrap: wrap; align-items: center;
  gap: 10px; padding: 10px 16px; background: var(--warn); color: #1a1205; font-size: 13.5px; font-weight: 600;
  box-shadow: 0 2px 10px var(--shadow); }
.sym-authbar button { font: inherit; font-weight: 700; cursor: pointer; border-radius: 8px; padding: 5px 14px;
  border: 1px solid rgba(0,0,0,.45); background: rgba(255,255,255,.85); color: #1a1205; }
.sym-authbar button:hover { background: #fff; }
.sym-authbar .sym-auth-sp { flex: 1 1 auto; }
.sym-bar .spacer { flex: 1 1 auto; }
.sym-agent { --tk: var(--accent); --tk-rgb: var(--accent-rgb); }
.sym-status { display: flex; flex-wrap: wrap; gap: 5px; align-items: center; }
.sym-status .badge.ok { color: var(--good); border-color: var(--good); }
.sym-opus { cursor: pointer; font: inherit; font-size: inherit; background: transparent; color: var(--muted); }
.sym-opus:hover { color: var(--text); }
.sym-opus.on { color: var(--accent); border-color: var(--accent); background: rgba(var(--accent-rgb), 0.16); font-weight: 600; }
.sym-status .badge.bad { color: var(--bad); border-color: var(--bad); }
.sym-status .badge.warn { color: var(--warn); border-color: var(--warn); }
.sym-sess { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: 12.5px; color: var(--muted); }
.sym-sess select { font: inherit; font-size: 12.5px; color: var(--text); background: var(--bg-2); border: 1px solid var(--line); border-radius: 8px; padding: 5px 8px; max-width: 520px; }
.sym-sess .sym-close { color: var(--good); border-color: var(--good); }
.sym-notice { border: 1px solid var(--line); border-left: 5px solid var(--warn); border-radius: 10px; padding: 12px 16px; background: var(--panel-2); font-size: 13.5px; line-height: 1.6; }
.sym-notice code, .sym-cmd { font-family: Consolas, monospace; font-size: 12.5px; background: var(--bg-2); border: 1px solid var(--line); border-radius: 6px; padding: 2px 8px; color: var(--text); user-select: all; }
.sym-help { font-size: 11.5px; color: var(--muted); line-height: 1.5; margin: -4px 0 0; }
.sym-help b { color: var(--text); font-weight: 600; }
.sym-events { display: flex; flex-direction: column; gap: 4px; }
.sym-event { font-size: 12px; color: var(--muted); border: 1px dashed var(--line); border-radius: 8px; padding: 4px 10px; }
.sym-event.is-compaction { border-style: solid; border-color: var(--hf); color: var(--text); }
.sym-transcript { display: flex; flex-direction: column; gap: 10px; min-height: 160px; max-height: 58vh; overflow-y: auto; padding: 4px 2px; }
.sym-msg { border: 1px solid var(--line); border-radius: 12px; padding: 10px 14px; font-size: 13.5px; line-height: 1.6; max-width: 92%; background: var(--panel); position: relative; }
.sym-msg.is-user { align-self: flex-end; background: var(--accent-soft); border-color: rgba(var(--accent-rgb), 0.5); white-space: pre-wrap; }
.sym-msg.is-assistant { align-self: flex-start; }
.sym-tablewrap { overflow-x: auto; margin: 8px 0; -webkit-overflow-scrolling: touch; }
.sym-table { border-collapse: collapse; font-size: 12.5px; min-width: 100%; }
.sym-table th, .sym-table td { border: 1px solid var(--line); padding: 5px 9px; text-align: left; vertical-align: top; }
.sym-table th { background: var(--bg-2); color: var(--text); font-weight: 600; white-space: nowrap; }
.sym-table tbody tr:nth-child(even) { background: rgba(127,127,127,.06); }
.sym-msg.is-system { align-self: stretch; max-width: none; border-left: 5px solid var(--hf); background: var(--panel-2); font-size: 13px; }
.sym-msg.is-error { align-self: stretch; max-width: none; border-left: 5px solid var(--bad); background: var(--panel-2); }
.sym-msg.is-notice { align-self: stretch; max-width: none; border-left: 5px solid var(--warn); background: var(--panel-2); font-size: 12.5px; }
.sym-who { display: block; font-size: 10px; text-transform: uppercase; letter-spacing: 0.8px; color: var(--muted); margin-bottom: 4px; }
.sym-ctx { font-size: 11.5px; color: var(--muted); border-top: 1px dashed var(--line); margin-top: 6px; padding-top: 4px; white-space: pre-wrap; }
.sym-h { font-size: 13.5px; margin: 10px 0 4px; color: var(--accent); letter-spacing: 0.3px; }
.sym-h:first-child { margin-top: 0; }
.sym-msg p { margin: 0 0 6px; }
.sym-msg ul, .sym-msg ol { margin: 0 0 6px 20px; }
.sym-msg li { margin: 2px 0; }
.sym-quote { margin: 6px 0 8px; padding: 6px 12px; border-left: 3px solid var(--gold, var(--accent)); background: var(--panel-2); color: var(--text); font-style: italic; white-space: pre-wrap; }
.sym-quote .sym-qlab { display: block; font-style: normal; font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.8px; color: var(--muted); margin-bottom: 2px; }
.sym-pre { font-family: Consolas, monospace; font-size: 12px; background: var(--bg-2); border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; overflow-x: auto; white-space: pre-wrap; margin: 0; }
.sym-prewrap { position: relative; margin: 6px 0; }
.sym-copy { position: absolute; top: 6px; right: 6px; font-size: 11px; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--line); background: var(--panel); color: var(--accent); cursor: pointer; font-family: inherit; }
.sym-copy:hover { border-color: var(--accent); }
.sym-copy.done { color: var(--good); border-color: var(--good); }
.sym-diag { font-size: 12.5px; line-height: 1.5; border: 1px solid var(--line); border-left: 4px solid var(--accent); border-radius: 8px; padding: 6px 12px; background: var(--panel-2); font-family: Consolas, monospace; }
.sym-diag.bad { border-left-color: var(--bad); }
.sym-msg code { font-family: Consolas, monospace; font-size: 12px; background: var(--bg-2); border-radius: 4px; padding: 0 4px; }
.sym-cite { font-size: 11.5px; padding: 0 6px; margin: 0 1px; vertical-align: baseline; }
.sym-ref { font-family: Consolas, monospace; font-size: 12px; color: var(--accent); white-space: nowrap; }
.sym-id { font-family: Consolas, monospace; font-size: 12px; color: var(--muted); }
.sym-raw { background: rgba(var(--warn-rgb), 0.22); color: var(--text); border-bottom: 2px solid var(--warn); padding: 0 3px; border-radius: 3px; font-style: normal; }
.sym-ruling { color: var(--good); font-weight: 700; }
.sym-unres { color: var(--warn); font-weight: 700; }
.sym-tools { display: flex; flex-direction: column; gap: 3px; margin-bottom: 6px; }
.sym-tool { font-size: 12px; color: var(--muted); font-family: Consolas, monospace; border: 1px dashed var(--line); border-radius: 8px; padding: 3px 8px; }
.sym-tool.is-write { border-style: solid; border-color: var(--warn); color: var(--text); background: rgba(var(--warn-rgb), 0.10); white-space: pre-wrap; font-family: inherit; }
.sym-tool.is-done { border-color: var(--good); background: rgba(var(--good-rgb), 0.10); }
.sym-tool.is-off { opacity: 0.7; background: transparent; }
.sym-tool.is-refused { border-color: var(--bad); color: var(--bad); }
.sym-gate { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 6px; }
.sym-gate .sym-yes { background: var(--good); color: var(--on-accent); border: 1px solid var(--good); border-radius: 999px; padding: 5px 14px; font-weight: 700; cursor: pointer; font-family: inherit; font-size: 12.5px; }
.sym-gate .sym-no { background: transparent; color: var(--muted); border: 1px solid var(--line); border-radius: 999px; padding: 5px 12px; cursor: pointer; font-family: inherit; font-size: 12.5px; }
.sym-gate .sym-ttl { font-size: 11px; color: var(--muted); font-family: Consolas, monospace; }
.sym-usage { font-size: 11px; color: var(--muted); font-family: Consolas, monospace; margin-top: 8px; border-top: 1px dashed var(--line); padding-top: 4px; display: flex; flex-wrap: wrap; gap: 10px; }
.sym-usage .miss { color: var(--bad); font-weight: 700; }
.sym-usage .rewrite { color: var(--warn); }
.sym-compose { display: flex; flex-direction: column; gap: 8px; border: 1px solid var(--line); border-radius: 12px; padding: 10px 12px; background: var(--panel); }
.sym-compose textarea { width: 100%; resize: vertical; font: inherit; font-size: 13.5px; line-height: 1.5; color: var(--text); background: var(--bg-2); border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; box-sizing: border-box; }
.sym-compose textarea:focus { outline: none; border-color: var(--accent); }
.sym-compose textarea:disabled { opacity: 0.7; }
#sym-student { min-height: 44px; font-size: 12.5px; }
#sym-q { min-height: 72px; }
.sym-row { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
.sym-mic { font-size: 18px; line-height: 1; padding: 6px 12px; border-radius: 999px; border: 1px solid var(--line); background: transparent; cursor: pointer; color: var(--text); font-family: inherit; user-select: none; -webkit-user-select: none; touch-action: manipulation; }
.sym-mic.on { border-color: var(--bad); background: rgba(var(--bad-rgb), 0.18); animation: sym-pulse 1.1s ease-in-out infinite; }
@keyframes sym-pulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(var(--bad-rgb), 0.5); } 50% { box-shadow: 0 0 0 8px rgba(var(--bad-rgb), 0); } }
.sym-speech-note { font-size: 11.5px; color: var(--muted); line-height: 1.4; flex: 1 1 260px; }
.sym-interim { font-size: 12px; color: var(--accent); font-style: italic; min-height: 1.2em; }
.sym-interim .live { color: var(--bad); font-style: normal; font-weight: 700; font-family: Consolas, monospace; }
.sym-send { background: var(--accent); color: var(--on-accent); border: 1px solid var(--accent); border-radius: 999px; padding: 7px 18px; font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit; }
.sym-send:disabled { opacity: 0.45; cursor: default; }
.sym-stop { color: var(--bad); border-color: var(--bad); }
.sym-turn { font-size: 11.5px; color: var(--muted); font-family: Consolas, monospace; }
.sym-hint { color: var(--muted); font-size: 12.5px; }
@media (max-width: 740px) { .sym-view { padding: 10px 12px; } .sym-msg { max-width: 100%; } }
`;
  function ensureStyle() {
    if ($("sym-style")) return;
    const st = document.createElement("style");
    st.id = "sym-style";
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
    s = s.replace(/ΑΚΑΤΕΡΓΑΣΤΟ ΚΕΙΜΕΝΟ ΠΗΓΗΣ[^<\n]*?(?:επικύρωση|ΕΠΙΚΥΡΩΣΗ)/g, (m) => `<mark class="sym-raw">${m}</mark>`);
    s = s.replace(/✓ ΑΠΟΦΑΝΣΗ/g, `<span class="sym-ruling">✓ ΑΠΟΦΑΝΣΗ</span>`);
    s = s.replace(/⚠ ΑΛΥΤΟ/g, `<span class="sym-unres">⚠ ΑΛΥΤΟ</span>`);
    s = s.replace(/\[([a-z]{2,6}-\d+)\]|(?<![\w-])((?:fail|gt|st|ft)-\d+)(?![\w-])/g, (m, bracketed, bare) => {
      const id = bracketed || bare;
      return RE_ID_OPEN.test(id)
        ? `<button type="button" class="req-link sym-cite" data-req="${esc(id)}" title="Άνοιγμα στο Requirements">${esc(id)}</button>`
        : `<span class="sym-id">[${esc(id)}]</span>`;
    });
    s = s.replace(/(§\s?\d+[α-ωa-z]{0,3}(?:\(\d+\))?(?:\s?[α-ω]\.)?)/g, `<span class="sym-ref">$1</span>`);
    s = s.replace(/(άρθρο\s\d+(?:\s?παρ\.?\s?\d+[α-ω]?)?|παρ\.\s?\d+[α-ω]?)/g, `<span class="sym-ref">$1</span>`);
    return s;
  }
  function md(text) {
    const src = String(text || "").replace(/\r\n?/g, "\n");
    const out = [];
    const chunks = src.split(/```/);
    chunks.forEach((chunk, i) => {
      if (i % 2 === 1) {
        // Q5 — every produced block gets a copy button: the composers exist so the
        // last step into the gradesheet software is one click, not a hand selection.
        const body = chunk.replace(/^[a-z]*\n/, "").replace(/\n$/, "");
        out.push(`<div class="sym-prewrap"><button type="button" class="sym-copy" data-copy title="Αντιγραφή στο πρόχειρο">⎘ Αντιγραφή</button><pre class="sym-pre">${esc(body)}</pre></div>`);
        return;
      }
      const lines = chunk.split("\n");
      let para = [], list = null, quote = [];
      /* ΟΙ ΠΙΝΑΚΕΣ ΕΙΝΑΙ Ο ΤΡΟΠΟΣ ΠΟΥ ΤΟ ΜΟΝΤΕΛΟ ΠΑΡΑΘΕΤΕΙ ΑΠΑΙΤΗΣΕΙΣ, και ο
         renderer δεν τους ήξερε: κάθε γραμμή τους έπεφτε στην παράγραφο και
         τυπωνόταν ωμή — «| # | Απαίτηση | Πηγή ||---|---|---||…». Το βρήκε ο
         ιδιοκτήτης στο κινητό (18/10) και το είχε δει και στον υπολογιστή. */
      const isSep = (l) => l.indexOf("|") >= 0 && /^[\s:|-]*-[\s:|-]*$/.test(l.trim());
      const cells = (l) => l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
      const alignOf = (c) => (/^:-+:$/.test(c) ? ' style="text-align:center"' : /^-+:$/.test(c) ? ' style="text-align:right"' : "");
      const flushP = () => { if (para.length) { out.push(`<p>${inline(esc(para.join(" ")))}</p>`); para = []; } };
      const flushL = () => { if (list) { out.push(`<${list.tag}>${list.items.map((x) => `<li>${inline(esc(x))}</li>`).join("")}</${list.tag}>`); list = null; } };
      const flushQ = () => { if (quote.length) { out.push(`<blockquote class="sym-quote"><span class="sym-qlab">αυτολεξεί</span>${inline(esc(quote.join("\n")))}</blockquote>`); quote = []; } };
      for (let li = 0; li < lines.length; li++) {
        const raw = lines[li];
        const line = raw.replace(/\s+$/, "");
        let m;
        /* κεφαλίδα ΚΑΙ γραμμή διαχωρισμού. Χωρίς τη δεύτερη δεν είναι πίνακας —
           μια πρόταση με κάθετο δεν πρέπει να γίνει table. */
        if (line.indexOf("|") >= 0 && li + 1 < lines.length && isSep(lines[li + 1])) {
          flushP(); flushL(); flushQ();
          const head = cells(line), al = cells(lines[li + 1]).map(alignOf);
          const rows = [];
          li += 2;
          while (li < lines.length && lines[li].trim() && lines[li].indexOf("|") >= 0) { rows.push(cells(lines[li])); li++; }
          li--;
          const th = head.map((c, k) => `<th${al[k] || ""}>${inline(esc(c))}</th>`).join("");
          const tb = rows.map((r) => `<tr>${head.map((_, k) => `<td${al[k] || ""}>${inline(esc(r[k] == null ? "" : r[k]))}</td>`).join("")}</tr>`).join("");
          /* Ο ΧΩΡΟΣ ΓΥΡΩ ΚΥΛΑΕΙ, ΟΧΙ Η ΣΕΛΙΔΑ: σε κινητό ένας πίνακας τεσσάρων
             στηλών δεν χωρά, και χωρίς αυτό θα έσπρωχνε όλη τη σελίδα πλάγια. */
          out.push(`<div class="sym-tablewrap"><table class="sym-table"><thead><tr>${th}</tr></thead><tbody>${tb}</tbody></table></div>`);
          continue;
        }
        if (!line.trim()) { flushP(); flushL(); flushQ(); continue; }
        if ((m = /^(#{1,4})\s+(.*)$/.exec(line))) { flushP(); flushL(); flushQ(); out.push(`<h4 class="sym-h">${inline(esc(m[2]))}</h4>`); continue; }
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
      if (!r.ok) {
        /* 302 προς τη φόρμα της Access φτάνει εδώ ως 401/403 ή ως σφάλμα
           δικτύου (cross-origin ανακατεύθυνση που κόβεται από το CORS). */
        if (r.status === 401 || r.status === 403) Access.check();
        const e = new Error(j.error || r.statusText); e.code = j.code; e.status = r.status; throw e;
      }
      return j;
    }, () => {                                   // απάντηση που ΔΕΝ είναι JSON
      Access.check();
      const e = new Error("Η απάντηση δεν ήταν JSON — πιθανή λήξη της συνεδρίας.");
      e.status = r.status; throw e;
    })).catch((e) => { if (e instanceof TypeError) Access.check(); throw e; });
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

  /* ΤΟ ΣΗΜΑ «OPUS» (18/10/2026) — ΑΝΑ AGENT, ΟΧΙ ΚΑΘΟΛΙΚΑ.
     Ο board-director γεννιέται σε Opus (κρίνει παραπομπές σε συμβούλιο), οι
     τρεις άλλοι σε Sonnet. Η προεπιλογή ΔΕΝ ζει εδώ: έρχεται από το `agent.md`
     μέσω του /health (`a.opus`), ώστε να υπάρχει ΕΝΑ σημείο αλήθειας. Το
     localStorage κρατά μόνο τη δική σου παρέκκλιση — ρύθμιση ανά θεατή, ποτέ
     δεδομένα μαθητών.
     Η σελίδα στέλνει `opus: true|false`, ΠΟΤΕ όνομα μοντέλου· ο proxy έχει τη
     λευκή λίστα των δύο. */
  const OPUS_KEY = "p2r-advisor-opus";
  const opusPrefs = () => { try { return JSON.parse(localStorage.getItem(OPUS_KEY)) || {}; } catch (e) { return {}; } };
  function opusOn(id) {
    const key = id || UI.agent;
    const p = opusPrefs();
    if (Object.prototype.hasOwnProperty.call(p, key)) return !!p[key];
    const a = agentOf(key);
    return !!(a && a.opus);
  }
  function opusSet(v) {
    const p = opusPrefs();
    p[UI.agent] = !!v;
    try { localStorage.setItem(OPUS_KEY, JSON.stringify(p)); } catch (e) { /* ιδιωτικό παράθυρο */ }
  }
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
    const pills = agents.map((a) => `<button type="button" class="fc-pill sym-agent" data-agent="${esc(a.id)}" aria-pressed="${UI.agent === a.id}" title="${esc(a.name)} · ${esc(a.corpus)} · ${a.corpus_bytes ? fmtK(a.corpus_bytes) + "B" : "—"}${a.tools_offered && a.tools_offered.length ? " · εργαλεία: " + esc(a.tools_offered.join(", ")) : ""}">${esc(a.name)}</button>`).join("");
    const st = h ? `
      <button type="button" class="badge sym-opus${UI.agent && opusOn() ? " on" : ""}" id="sym-opus"
        aria-pressed="${!!(UI.agent && opusOn())}"
        title="${UI.agent && opusOn() ? "Opus — βαθύτερη συλλογιστική, ακριβότερο. Πάτα για Sonnet." : "Sonnet — γρήγορο και φθηνότερο. Πάτα για Opus."}">OPUS</button>
      <span class="badge ${h.key_present ? "ok" : "bad"}" title="ANTHROPIC_API_KEY στο περιβάλλον του proxy">${h.key_present ? "κλειδί ✓" : "χωρίς κλειδί"}</span>
      <span class="badge" title="Αιτήματα σήμερα / ημερήσιο όριο (φρένο 2)">σήμερα ${h.today ? h.today.count : 0}/${h.caps ? h.caps.daily_cap : "?"}</span>
      <span class="badge ${h.casefile && h.casefile.configured ? "ok" : ""}" title="Φάκελος υποθέσεων: FDMS_CASEFILE_URL/KEY στο περιβάλλον του proxy. Κάθε εγγραφή περνά από «Γράψ' το».">${h.casefile && h.casefile.configured ? "φάκελος ✓ · πύλη" : "φάκελος —"}</span>
      <span class="badge" title="Prompt cache TTL">cache ${h.caps ? esc(h.caps.cache_ttl) : "—"}</span>` : "";
    const notice = UI.offline ? `
      <div class="sym-notice" role="alert">
        <b>Ο σύμβουλος δεν απαντά.</b> ${LOCAL ? "" : "Αυτή η διεύθυνση δεν δρομολογεί τον σύμβουλο — άνοιξε την εφαρμογή από τη δική σου διεύθυνση (το tunnel ή το localhost). "}Η καρτέλα χρειάζεται τον proxy στο <code>${esc(PROXY)}</code>,
        που κρατά το κλειδί του API έξω από τη σελίδα. Άνοιξε ένα τερματικό στο <code>D:\\FDMS</code>, όρισε την
        <code>ANTHROPIC_API_KEY</code> και τρέξε:<br>
        <span class="sym-cmd">${esc(START_CMD)}</span><br>
        Οι υπόλοιπες καρτέλες δουλεύουν κανονικά· αυτή ξαναελέγχει με το κουμπί «Έλεγχος».
      </div>` : (h && !h.key_present ? `
      <div class="sym-notice" role="alert"><b>Ο proxy τρέχει, αλλά χωρίς κλειδί.</b> Όρισε την <code>ANTHROPIC_API_KEY</code>
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
    const draft = UI.draft != null ? UI.draft : (($("sym-q") || {}).value || "");
    UI.draft = null;

    host.innerHTML = `
      <div class="sym-bar">
        <div class="bt-tabs" style="margin:0" aria-label="Agent">${pills || `<span class="sym-hint">— κανένας agent (λείπει ο φάκελος agents/)</span>`}</div>
        <span class="spacer"></span>
        <div class="sym-status">${st}</div>
        <button type="button" class="fc-tbtn" id="sym-recheck" title="Ξαναρώτα τον proxy (GET /health)">↻ Έλεγχος</button>
      </div>
      ${notice}
      ${UI.diag ? `<div class="sym-diag${UI.offline || !(h && h.key_present) ? " bad" : ""}" role="status">${esc(UI.diag)}</div>` : ""}
      ${!UI.offline && h ? `<div class="sym-sess">
        <label for="sym-sess-sel">Συζήτηση</label>
        <select id="sym-sess-sel" ${UI.busy ? "disabled" : ""} title="Οι συνεδρίες μένουν στον proxy (tools/advisor/sessions) — όχι στον browser">${sessOpts}</select>
        <button type="button" class="fc-tbtn" id="sym-new" ${UI.busy ? "disabled" : ""} title="Καινούργια συζήτηση (η τρέχουσα μένει στη λίστα)">✦ Νέα</button>
        ${S ? `<button type="button" class="fc-tbtn" id="sym-archive" ${UI.busy ? "disabled" : ""} title="Αρχειοθέτηση — φεύγει από τη λίστα, δεν σβήνεται">▣ Αρχειοθέτηση</button>` : ""}
        ${canClose ? `<button type="button" class="fc-tbtn sym-close" id="sym-close" title="Αρχειοθετεί αυτή τη συζήτηση και ανοίγει νέα με αφετηρία τον φάκελο του μαθητή όπως είναι ΤΩΡΑ καταγεγραμμένος">✓ Έκλεισε η υπόθεση</button>` : ""}
        ${S ? `<button type="button" class="fc-tbtn" id="sym-export" ${UI.busy ? "disabled" : ""} title="Κατεβάζει αυτή τη συζήτηση ως αρχείο Markdown (ερωτήσεις, απαντήσεις, εργαλεία, εγγραφές, compactions, usage)">⭳ Λήψη</button>` : ""}
        ${S ? tokensLabel(S, h) : ""}
      </div>
      <p class="sym-help"><b>Έλεγχος</b>: ξαναρωτά τον τοπικό proxy αν είναι ζωντανός. <b>Νέα</b>: καινούργια συζήτηση — η τρέχουσα μένει στη λίστα. <b>Αρχειοθέτηση</b>: φεύγει από τη λίστα, δεν σβήνεται ποτέ. <b>Λήψη</b>: κατεβάζει τη συζήτηση ως Markdown στον δίσκο σου. <b>Έκλεισε η υπόθεση</b>: αρχειοθετεί και ανοίγει νέα με αφετηρία τον φάκελο του μαθητή. Οι συζητήσεις ζουν στον proxy (tools/advisor/sessions), όχι στον browser.</p>` : ""}
      ${S && S.events && S.events.length ? `<div class="sym-events">${S.events.slice(-4).map(eventHTML).join("")}</div>` : ""}
      <div class="sym-transcript" id="sym-transcript" role="log" aria-live="polite" aria-label="Συζήτηση">
        ${S && S.messages.length ? "" : `<p class="sym-hint">Ρώτα κανονιστικά: «Ο μαθητής βαθμολογήθηκε ΑΠΟΤΥΧΙΑ στην C4790 — τι ενεργοποιείται και με ποιον πετάει μετά;». Ο σύμβουλος απαντά ΜΟΝΟ από το επικυρωμένο corpus, με id και παραπομπή· ό,τι βρει έξω από αυτό το σημαίνει ως <mark class="sym-raw">ακατέργαστο</mark>. Μια εγγραφή στον φάκελο γίνεται μόνο όταν πατήσεις εσύ «Γράψ' το».</p>`}
      </div>
      <div class="sym-compose">
        <label class="lbl" for="sym-student" style="margin:0">Πλαίσιο περίπτωσης (προαιρετικό) — μόνο ό,τι γράφεις εσύ ταξιδεύει· δένει με το πρώτο μήνυμα της συζήτησης</label>
        <textarea id="sym-student" ${ctxLocked ? "disabled title='Κλειδώνει μετά το πρώτο μήνυμα — Νέα για να αλλάξει'" : ""} placeholder="π.χ. Προσαρμογή, 8η έξοδος του σταδίου, C4790 Αξιολόγηση, είχε ήδη Δοκιμή Προόδου με ΑΕ 62%">${esc(ctxVal)}</textarea>
        <label class="lbl" for="sym-q" style="margin:0">Ερώτηση <span class="sym-turn">γύρος ${Math.min(turns + 1, UI.turnMax)}/${UI.turnMax}</span></label>
        <textarea id="sym-q" placeholder="Γράψε, ή πάτα 🎤 και μίλα — ξαναπάτα για τέλος… (Ctrl+Enter στέλνει)" ${UI.busy ? "disabled" : ""}></textarea>
        <div class="sym-interim" id="sym-interim">${esc(UI.speech.interim || UI.speech.err)}</div>
        <div class="sym-row">
          ${speechOK ? `<button type="button" class="sym-mic${UI.speech.on ? " on" : ""}" id="sym-mic" aria-pressed="${UI.speech.on}" title="Πάτα για έναρξη — ξαναπάτα για τέλος (el-GR)">🎤</button>
          ${traceOn() ? `<button type="button" class="fc-tbtn" id="sym-mic-trace" title="Αντιγράφει το ίχνος των συμβάντων αναγνώρισης">⧉ ίχνος</button>` : ""}
          <span class="sym-speech-note">Πάτα το 🎤 και μίλα· <b>ξαναπάτα για τέλος</b> — δεν το κρατάς πατημένο. Κλείνει μόνο του μετά από 30΄΄ σιωπής ή στα 3΄. Η ομιλία αποστέλλεται στους διακομιστές του κατασκευαστή του browser για αναγνώριση (el-GR). Το κείμενο μπαίνει στο κουτί — το διορθώνεις πριν το στείλεις.</span>` : `<span class="sym-speech-note">Ο browser δεν έχει αναγνώριση ομιλίας — πληκτρολόγησε.</span>`}
          <span class="spacer" style="flex:1 1 auto"></span>
          ${UI.busy ? `<button type="button" class="fc-tbtn sym-stop" id="sym-stop">■ Διακοπή</button>` : ""}
          <button type="button" class="sym-send" id="sym-send" ${canSend ? "" : "disabled"} title="${capped ? "Όριο γύρων — Νέα συζήτηση" : "Ctrl+Enter"}">${capped ? "Όριο γύρων" : "Στείλε ▸"}</button>
        </div>
      </div>`;
    if (draft) $("sym-q").value = draft;
    renderTranscript();
  }

  /* Q1 — the TOTAL the model sees: corpus + conversation, as the proxy estimates
     it (chars ÷ 2.5 for Greek — an estimate, said so in the tooltip). */
  function tokensLabel(S, h) {
    const a = agentOf(UI.agent) || {};
    const cpt = (h.memory && h.memory.chars_per_token) || 2.5;
    const corpus = a.corpus_tokens_est || 0;
    const hist = Math.round(S.messages.reduce((n, m) => n + (m.content || "").length, 0) / cpt);
    const ceiling = (h.memory && h.memory.context_ceiling_tokens) || 400000;
    const f = (n) => Number(n).toLocaleString("el-GR");
    return `<span class="sym-turn" title="Εκτίμηση (${cpt} χαρακτήρες/token για ελληνικά), όχι μέτρηση. Το corpus μένει στο cache· συμπτύσσεται το ιστορικό όταν το σύνολο πλησιάσει το ταβάνι μείον τον χώρο της απάντησης.">${esc(S.id)} · σύνολο ~${f(corpus + hist)} / ${f(ceiling)} tokens (corpus ${f(corpus)} + συζήτηση ${f(hist)})</span>`;
  }
  function fallbackCopy(text, done) {
    const ta = document.createElement("textarea");
    ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); done(); } catch (e) { /* the user can still select by hand */ }
    ta.remove();
  }
  /* Q3 — «Έλεγχος» answers in a line he can read, not just by re-rendering. */
  function diagLine() {
    const h = UI.health;
    const at = new Date().toTimeString().slice(0, 5);
    if (UI.offline || !h) return `${at} · ✕ Ο proxy στο ${PROXY} ΔΕΝ απαντά. Τρέξε: ${START_CMD}`;
    const ags = (h.agents || []).map((a) => `${a.id}${a.tools_offered && a.tools_offered.length ? " (" + a.tools_offered.join(", ") + ")" : ""}`).join(" · ");
    const ka = h.keepalive && h.keepalive.enabled ? "ναι" : "όχι";
    const who = h.access && h.access.you ? ` · συνδεδεμένος ως ${h.access.you}` : "";
    return `${at} · ✓ proxy ζωντανός στο ${PROXY}${who} · κλειδί ${h.key_present ? "✓ παρόν" : "✕ ΛΕΙΠΕΙ"} · φάκελος ${h.casefile && h.casefile.configured ? "✓ συνδεδεμένος" : "✕ όχι"} · keep-alive ${ka} · σήμερα ${h.today ? h.today.count : 0}/${h.caps ? h.caps.daily_cap : "?"} · agents: ${ags || "κανένας"}`;
  }
  function eventHTML(e) {
    if (e.type === "compaction") return `<div class="sym-event is-compaction">♻ Compaction #${e.n} στις ${esc(hhmm(e.at))}: το ιστορικό (${fmtK(e.chars_before)} χαρ.) έγινε δομημένη σύνοψη (${fmtK(e.chars_after)} χαρ.)${e.kept_pairs ? `, ${e.kept_pairs} ζεύγος αυτούσιο` : ""}. Οι παραπομπές και οι εγγραφές κρατήθηκαν.</div>`;
    if (e.type === "seed") return `<div class="sym-event">⤷ ${esc(e.text)}</div>`;
    if (e.type === "archived") return `<div class="sym-event">▣ ${esc(e.text)}</div>`;
    return `<div class="sym-event">${esc(e.text || e.type)}</div>`;
  }
  function msgHTML(m, i, all) {
    const S = UI.session;
    if (m.kind === "summary" || m.kind === "seed") {
      if (m.role === "assistant") return "";                     // the ack line adds nothing on screen
      const lab = m.kind === "summary" ? "σύνοψη μετά από compaction — αυτό θυμάται ο σύμβουλος" : "αφετηρία — ο φάκελος όπως ήταν καταγεγραμμένος όταν άνοιξε η συζήτηση";
      return `<div class="sym-msg is-system"><span class="sym-who">${lab}</span>${md(m.content)}</div>`;
    }
    if (m.role === "user") {
      const first = all.findIndex((x) => x.role === "user" && !x.kind) === i;
      return `<div class="sym-msg is-user"><span class="sym-who">εσύ${m.at ? " · " + esc(hhmm(m.at)) : ""}</span>${esc(m.content)}${first && S && S.context ? `<div class="sym-ctx">πλαίσιο: ${esc(S.context)}</div>` : ""}</div>`;
    }
    return `<div class="sym-msg is-assistant"><span class="sym-who">${esc(agentOf(UI.agent) ? agentOf(UI.agent).name : "σύμβουλος")}${m.at ? " · " + esc(hhmm(m.at)) : ""}</span>${toolsHTML(m.tools)}${md(m.content)}${m.usage ? usageHTML(m.usage) : ""}</div>`;
  }
  function toolsHTML(tools) {
    if (!tools || !tools.length) return "";
    return `<div class="sym-tools">${tools.map((t) => {
      if (t.tool === "search_sources") {
        return `<div class="sym-tool${t.status === "refused" ? " is-refused" : ""}">🔎 ${esc(t.source || "?")} · «${esc(t.query || "")}»${t.hits != null ? ` · ${t.hits} ευρήματα` : ""}${t.status && t.status !== "ok" ? ` · ${esc(t.status)}` : ""}</div>`;
      }
      if (!t.write) return `<div class="sym-tool${t.status === "error" ? " is-refused" : ""}">🗂 ${esc(t.tool || t.name || "")}${t.summary ? ` · ${esc(t.summary)}` : ""}${t.status && t.status !== "ok" ? ` · ${esc(t.status)}` : ""}</div>`;
      // a WRITE: pending (gate) · confirmed · cancelled · failed · refused by a brake
      if (t.confirmed) return `<div class="sym-tool is-write is-done">✓ ΓΡΑΦΤΗΚΕ ΣΤΟΝ ΦΑΚΕΛΟ · case ${esc(t.case_id)} · ${esc(hhmm(t.at))}\n${esc(t.preview || "")}</div>`;
      if (t.cancelled) return `<div class="sym-tool is-write is-off">✕ Ακυρώθηκε από εσένα · ${esc(t.tool)}\n${esc(t.preview || "")}</div>`;
      if (t.failed) return `<div class="sym-tool is-write is-refused">✕ Ο φάκελος απέρριψε την εγγραφή: ${esc(t.failed)}</div>`;
      if (t.pending && t.token) {
        const left = t.expires ? Math.max(0, Math.round((t.expires * 1000 - Date.now()) / 60000)) : null;
        const expired = left === 0;
        return `<div class="sym-tool is-write">✎ ΕΚΚΡΕΜΗΣ ΕΓΓΡΑΦΗ — περιμένει εσένα · ${esc(t.tool)}\n${esc(t.preview || "")}
          <div class="sym-gate">${expired ? `<span class="sym-ttl">έληξε — ζήτα ξανά από τον σύμβουλο να την ετοιμάσει</span>` :
            `<button type="button" class="sym-yes" data-confirm="${esc(t.token)}" ${UI.busy ? "disabled" : ""}>Γράψ' το</button>
             <button type="button" class="sym-no" data-cancel="${esc(t.token)}" ${UI.busy ? "disabled" : ""}>Άκυρο</button>
             <span class="sym-ttl">λήγει σε ${left}′ · actor agent:${esc(UI.agent)}</span>`}</div></div>`;
      }
      return `<div class="sym-tool is-write is-refused">✎ ${esc(t.tool)} · ${esc(t.summary || "")} · ${esc(t.status || "")}</div>`;
    }).join("")}</div>`;
  }
  function usageHTML(u) {
    const miss = u.expected_cache_read && !u.cache_ok;
    return `<div class="sym-usage" title="input · cache write · cache read · output (tokens)">
      <span>in ${fmtK(u.input_tokens)}</span><span>cache✎ ${fmtK(u.cache_creation_input_tokens)}</span>
      <span>cache◉ ${fmtK(u.cache_read_input_tokens)}</span><span>out ${fmtK(u.output_tokens)}</span>
      ${u.iterations > 1 ? `<span>${u.iterations} γύροι εργαλείων</span>` : ""}
      ${u.casefile_writes ? `<span>${u.casefile_writes} προεπισκ. εγγραφής</span>` : ""}
      ${u.cache_rewrite && !miss ? `<span class="rewrite">↻ το corpus ξαναγράφτηκε στο cache (η μνήμη 1h είχε λήξει) — αναμενόμενο μετά από διάλειμμα</span>` : ""}
      ${miss ? `<span class="miss">⚠ ΧΩΡΙΣ cache — πλήρης χρέωση του corpus</span>` : ""}</div>`;
  }
  function renderTranscript() {
    const t = $("sym-transcript");
    if (!t) return;
    const msgs = UI.session ? UI.session.messages : [];
    const parts = msgs.map((m, i) => msgHTML(m, i, msgs)).filter(Boolean);
    if (UI.pending) {
      for (const n of UI.pending.notices || []) parts.push(`<div class="sym-msg is-notice"><span class="sym-who">σημείωση</span>${esc(n)}</div>`);
      parts.push(`<div class="sym-msg is-user"><span class="sym-who">εσύ</span>${esc(UI.pending.question)}</div>`);
      parts.push(`<div class="sym-msg is-assistant" id="sym-live"><span class="sym-who">${esc(agentOf(UI.agent) ? agentOf(UI.agent).name : "σύμβουλος")} · …</span>${toolsHTML(UI.pending.tools)}${md(UI.pending.text) || `<span class="sym-hint">σκέφτεται…</span>`}</div>`);
    }
    for (const e of UI.errors || []) parts.push(`<div class="sym-msg ${e.kind === "notice" ? "is-notice" : "is-error"}"><span class="sym-who">${e.kind === "notice" ? "σημείωση" : "σφάλμα"}</span>${esc(e.text)}</div>`);
    if (parts.length) t.innerHTML = parts.join("");
    t.scrollTop = t.scrollHeight;
  }

  /* ════════════════════════════════════════════════════════════════════════
     § 4  SEND — SSE over fetch; the proxy keeps the history
     ════════════════════════════════════════════════════════════════════════ */
  function send() {
    /* ΠΡΩΤΑ ΚΛΕΙΝΕΙ ΤΟ ΜΙΚΡΟΦΩΝΟ (βρέθηκε 19/10, στο κινητό: «δεν μπόρεσα να
       το στείλω»). Όσο ακούει, κάθε συμβάν ξανάγραφε το πλαίσιο — ο ιδιοκτήτης
       πατούσε «Στείλε» και το κείμενο άλλαζε κάτω από τα χέρια του. Το
       speechStop() ορφανεύει τα handlers ΑΜΕΣΩΣ, οπότε η γραμμή από κάτω
       διαβάζει κείμενο που δεν μπορεί πια να αλλάξει. */
    if (UI.speech.on) speechStop();
    const q = (($("sym-q") || {}).value || "").trim();
    if (!q || UI.busy || !UI.agent) return;
    const ctx = (($("sym-student") || {}).value || "").trim();
    UI.errors = [];
    UI.busy = true;
    UI.draft = "";
    UI.pending = { question: q, text: "", tools: [], usage: null, notices: [] };
    render();
    const ac = new AbortController();
    UI.abort = ac;
    let lastDraw = 0;
    const draw = (force) => { const now = Date.now(); if (force || now - lastDraw > 120) { lastDraw = now; renderTranscript(); } };
    const fail = (text) => { UI.errors.push({ kind: "error", text: text, conn: true }); UI.draft = q; };
    /* Πόσες απαντήσεις είχε η συνεδρία ΠΡΙΝ στείλουμε — το μέτρο της ανάκτησης. */
    const before = UI.session ? UI.session.messages.filter((m) => m.role === "assistant" && !m.kind).length : 0;
    const ensure = UI.session ? Promise.resolve(UI.session) : newSession(ctx).then((s) => { loadSessions(); return s; });
    ensure.then((S) => fetch(PROXY + "/ask", { method: "POST", headers: { "Content-Type": "application/json" }, signal: ac.signal,
      body: JSON.stringify({ agent: UI.agent, session: S.id, question: q, student: ctx || undefined, opus: opusOn() }) }))
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
        return reload.then(recoverIfAnswered).then(() => health(true)).then(loadSessions).then(render);
      });

    /* ΜΙΑ ΧΑΜΕΝΗ ΡΟΗ ΔΕΝ ΕΙΝΑΙ ΧΑΜΕΝΗ ΑΠΑΝΤΗΣΗ (18/10/2026).

       ΤΙ ΕΙΔΕ Ο ΙΔΙΟΚΤΗΤΗΣ: ρώτησε από το κινητό, η απάντηση ήρθε ολόκληρη και
       από κάτω της κόκκινο «Δεν υπάρχει σύνδεση με τον proxy». Το log του
       proxy ήταν ΚΑΘΑΡΟ: η απάντηση είχε ολοκληρωθεί κανονικά σε 57,5
       δευτερόλεπτα. Αυτό που κόπηκε ήταν η ΣΥΝΔΕΣΗ ΤΗΣ ΡΟΗΣ — κινητό που
       αλλάζει δίκτυο, σβήνει οθόνη, ή ο browser παγώνει καρτέλα στο παρασκήνιο.

       Η ανάκτηση ΗΔΗ γινόταν: οι συζητήσεις ζουν στον proxy, και η γραμμή από
       πάνω ξαναφορτώνει τη συνεδρία. Αυτό που ΔΕΝ γινόταν ήταν να φύγει το
       μήνυμα — κι έτσι μια επιτυχία έμοιαζε αποτυχία, που είναι χειρότερο από
       μια τίμια αποτυχία: σε κάνει να ξαναρωτήσεις και να ξαναπληρώσεις.

       Το μέτρο είναι η ΙΔΙΑ Η ΣΥΝΕΔΡΙΑ, όχι η αίσθηση του δικτύου: αν ο proxy
       κρατά περισσότερες απαντήσεις απ' ό,τι πριν, η απάντηση υπάρχει. */
    function recoverIfAnswered() {
      if (!UI.errors.some((e) => e.conn)) return;
      const now = UI.session ? UI.session.messages.filter((m) => m.role === "assistant" && !m.kind).length : 0;
      if (now <= before) return;                       // πράγματι χάθηκε — το μήνυμα μένει
      UI.errors = UI.errors.filter((e) => !e.conn);
      UI.errors.push({ kind: "notice", text: "Η σύνδεση κόπηκε στη μέση, αλλά η απάντηση είχε ολοκληρωθεί και ανακτήθηκε από τον proxy. Δεν χρειάζεται να ξαναρωτήσεις." });
      UI.draft = null;                                 // μην ξαναγεμίσεις το κουτί με την ίδια ερώτηση
    }
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
     § 5  SPEECH — ΔΙΑΚΟΠΤΗΣ: πάτα-άνοιξε, ξαναπάτα-κλείσε (el-GR)

     Απόφανση ιδιοκτήτη 19/10/2026, από δοκιμή στο κινητό: «*Πατάμε,
     ενεργοποιούμε μικρόφωνο· ξαναπατάμε, κλείνει. Για να μην το κρατάμε
     πατημένο*» — το κουμπί είναι μικρό, θέλει να κοιτάξει κάτι ενδιάμεσα, και
     η θέση του κουμπιού μετακινείται όσο μεγαλώνει το κείμενο.

     ΤΙ ΕΣΠΑΓΕ ΠΡΙΝ. Το «κρατά-και-μίλα» σε κινητό: το pointerup έφτανε
     χιλιοστά μετά το pointerdown, το rec.stop() έφευγε πριν καλά ξεκινήσει η
     μηχανή, το onend αργούσε ή δεν ερχόταν ΠΟΤΕ — και το S.on έμενε true με
     continuous=true. Αποτέλεσμα: η παλιά μηχανή ζωντανή, το επόμενο πάτημα
     έφτιαχνε δεύτερη, και ΔΥΟ μηχανές έγραφαν στο ίδιο πλαίσιο. Αυτό ήταν ο
     «πολλαπλασιασμός», ΟΧΙ η συνένωση — εκείνη διορθώθηκε στις 18/10 και η
     ανακατασκευή από το ev.results παραμένει ιδεμπότη, παρακάτω.

     ΟΙ ΤΡΕΙΣ ΑΣΦΑΛΕΙΕΣ:
       1. ΚΟΥΠΟΝΙ (`serial`) — handlers μηχανής που δεν είναι η τρέχουσα
          σιωπούν. Καμία καθυστερημένη εγγραφή, από καμία παλιά μηχανή.
       2. ΤΟ ΚΛΕΙΣΙΜΟ ΔΕΝ ΠΕΡΙΜΕΝΕΙ ΤΟ onend — καθαρίζει ΤΩΡΑ και στέλνει
          abort() στη μηχανή μετά από 1,5΄΄, για να αφήσει το μικρόφωνο.
       3. ΜΟΝΟ ΤΟΥ ΚΛΕΙΝΕΙ — 30΄΄ σιωπής ή 3΄ συνολικά (το μάθημα του
          TRAIL_QUIET από το robot/device/mic.py: δεν μετράμε RMS μέσα στον
          browser, μετράμε σιωπή σε ΣΥΜΒΑΝΤΑ). Κολλημένο μικρόφωνο γράφει το
          δωμάτιο· εδώ δεν γίνεται να κολλήσει αθόρυβα.
     ════════════════════════════════════════════════════════════════════════ */
  const MIC_QUIET_MS = 30000;    /* σιωπή που κλείνει το μικρόφωνο */
  const MIC_MAX_MS = 180000;     /* σκληρό ανώτατο, ό,τι κι αν γίνει */
  const MIC_ABORT_MS = 1500;     /* πόσο περιμένουμε το onend πριν το abort() */
  const MIC_TRACE_KEY = "p2r-mic-trace";

  function traceOn() { try { return localStorage.getItem(MIC_TRACE_KEY) === "1"; } catch (e) { return false; } }

  function micPaint() {
    const S = UI.speech;
    const b = $("sym-mic");
    if (b) { b.classList.toggle("on", S.on); b.setAttribute("aria-pressed", String(S.on)); }
    const il = $("sym-interim");
    if (!il) return;
    if (!S.on) { il.textContent = S.err || ""; return; }
    const sec = Math.floor((Date.now() - S.startedAt) / 1000);
    const mmss = Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0");
    il.innerHTML = `<span class="live">● ακούει ${mmss}</span> · ξαναπάτα για τέλος${S.interim ? " — " + esc(S.interim) : ""}`;
  }

  /* Καθαρίζει ΤΑ ΠΑΝΤΑ και είναι ασφαλές να κληθεί όσες φορές θέλει. */
  function micClear() {
    const S = UI.speech;
    if (S.timer) { clearInterval(S.timer); S.timer = null; }
    S.on = false; S.rec = null; S.interim = ""; S.base = ""; S.skip = ""; S.said = ""; S.prev = null;
    micPaint();
  }

  function speechStart() {
    const S = UI.speech;
    if (!S.api || S.on) return;
    const q = $("sym-q");
    const rec = new S.api();
    rec.lang = "el-GR"; rec.continuous = true; rec.interimResults = true; rec.maxAlternatives = 1;
    const mine = ++S.serial;                       /* το κουπόνι αυτής της μηχανής */
    S.rec = rec; S.on = true; S.interim = ""; S.err = "";
    S.base = q ? q.value : ""; S.skip = ""; S.prev = null; S.said = "";
    S.startedAt = S.lastAt = Date.now();
    if (traceOn()) S.trace = [{ t: 0, ev: "start" }];

    rec.onresult = (ev) => {
      if (mine !== S.serial) return;               /* παλιά μηχανή — σιωπή */
      S.lastAt = Date.now();
      /* Η ΑΝΑΚΑΤΑΣΚΕΥΗ (18/10): δεν συσσωρεύουμε ΠΟΤΕ. Το ev.results κρατά όλη
         τη συνεδρία, άρα ξαναχτίζουμε από το μηδέν και η πράξη είναι ιδεμπότη
         — ό,τι κι αν ξαναδώσει η μηχανή, το αποτέλεσμα είναι το ίδιο. */
      let finals = "", last = "", interim = "";
      for (let i = 0; i < ev.results.length; i++) {
        const r = ev.results[i];
        const t = ((r[0] && r[0].transcript) || "").trim();
        if (!r.isFinal) { interim += (r[0] && r[0].transcript) || ""; continue; }
        if (!t) continue;
        /* ΣΥΜΠΤΥΞΗ ΕΠΑΝΕΚΠΟΜΠΗΣ: η μηχανή του Android ξαναδίνει το ΙΔΙΟ τελικό
           καθώς μεγαλώνει, σε ΝΕΑ θέση («ποιες είναι» και μετά «ποιες είναι οι
           απαιτήσεις»). Κρατάμε το μακρύτερο των δύο.
           ΤΟ ΤΙΜΗΜΑ, γραμμένο: «ναι» → «ναι βέβαια» χάνει το πρώτο «ναι». */
        if (last && (t.indexOf(last) === 0 || last.indexOf(t) === 0)) {
          const keep = t.length >= last.length ? t : last;
          finals = finals.slice(0, finals.length - last.length) + keep;
          last = keep;
          continue;
        }
        finals += (finals ? " " : "") + t;
        last = t;
      }
      S.interim = interim;
      if (traceOn()) S.trace.push({ t: Date.now() - S.startedAt, n: ev.results.length, i: ev.resultIndex, f: finals.length, text: finals.slice(-60) });
      const box = $("sym-q");
      if (box) {
        /* ΑΝ ΕΓΡΑΨΕ ΜΕ ΤΟ ΧΕΡΙ ΟΣΟ ΑΚΟΥΓΑΜΕ, το κείμενό του είναι ιερό: η βάση
           ξαναπιάνεται από το κουτί και ό,τι έχει ήδη ειπωθεί μπαίνει στο
           `skip`, για να μην ξαναγραφτεί από κάτω. */
        /* Η άγκυρα είναι ό,τι είχε ΗΔΗ γραφτεί (`said`), ΟΧΙ ό,τι ακούστηκε
           μέχρι τώρα (`finals`): οι λέξεις αυτού του συμβάντος δεν τις είδε
           ποτέ στο κουτί, και δεν επιτρέπεται να χαθούν μαζί με την άγκυρα. */
        if (S.prev != null && box.value !== S.prev) { S.base = box.value; S.skip = S.said; }
        const tail = (S.skip && finals.indexOf(S.skip) === 0) ? finals.slice(S.skip.length).trim() : finals;
        /* Το μάθημα του is_silent: σιωπή δεν γίνεται κείμενο. */
        const out = tail.length >= 2 ? (S.base ? S.base.replace(/\s+$/, "") + " " + tail : tail) : S.base;
        box.value = out; S.prev = out; S.said = finals;
      }
      micPaint();
    };

    rec.onerror = (ev) => {
      if (mine !== S.serial) return;
      if (ev.error === "no-speech" || ev.error === "aborted") return;   /* φυσιολογικά, δεν τρομάζουμε */
      S.err = ev.error === "not-allowed" ? "Ο browser δεν έδωσε άδεια μικροφώνου."
            : `Αναγνώριση ομιλίας: ${ev.error}`;
    };

    rec.onend = () => {
      if (mine !== S.serial) return;    /* το κλείσιμο έχει ήδη γίνει αλλού */
      micClear();
    };

    /* Ο ΦΥΛΑΚΑΣ. Κλείνει μόνο του στη σιωπή ή στο ανώτατο, και ξαναβάφει τον
       χρόνο ώστε να φαίνεται ΠΑΝΤΑ ότι το μικρόφωνο είναι ανοιχτό. */
    S.timer = setInterval(() => {
      if (mine !== S.serial || !S.on) return;
      const now = Date.now();
      if (now - S.startedAt > MIC_MAX_MS) { S.err = "Το μικρόφωνο έκλεισε στα 3΄."; speechStop(); return; }
      if (now - S.lastAt > MIC_QUIET_MS) { S.err = "Το μικρόφωνο έκλεισε μετά από 30΄΄ σιωπής."; speechStop(); return; }
      micPaint();
    }, 500);

    try { rec.start(); } catch (e) { S.err = "Δεν ξεκίνησε η αναγνώριση ομιλίας."; micClear(); return; }
    micPaint();
  }

  function speechStop() {
    const S = UI.speech;
    const rec = S.rec;
    S.serial++;        /* ΟΡΦΑΝΕΥΕΙ ΤΑ HANDLERS ΤΩΡΑ — καμία καθυστερημένη εγγραφή */
    micClear();        /* το κουμπί σβήνει ΤΩΡΑ, δεν περιμένει το onend */
    if (!rec) return;
    try { rec.stop(); } catch (e) { /* μπορεί να μην ξεκίνησε καν */ }
    /* ΚΑΙ ΑΝ ΤΟ onend ΔΕΝ ΕΡΘΕΙ ΠΟΤΕ: το abort() αφήνει το μικρόφωνο με το
       ζόρι. Αυτό ήταν το κολλημένο μικρόφωνο που «κατέγραφε τις συνομιλίες». */
    setTimeout(() => { try { rec.abort(); } catch (e) { /* τελείωσε ήδη */ } }, MIC_ABORT_MS);
  }

  function micToggle() { if (UI.speech.on) speechStop(); else speechStart(); }

  function micTraceText() {
    const S = UI.speech;
    const head = `mic-trace · ${navigator.userAgent}`;
    return [head].concat(S.trace.map((r) => r.ev === "start" ? "— start —"
      : `${r.t}ms results=${r.n} from=${r.i} len=${r.f} …${r.text}`)).join("\n");
  }

  /* ════════════════════════════════════════════════════════════════════════
     § 6  WIRE + BOOT
     ════════════════════════════════════════════════════════════════════════ */
  function wire(host) {
    if (host._advWired) return;
    host._advWired = true;
    host.addEventListener("click", (ev) => {
      const t = ev.target instanceof Element ? ev.target : null;
      if (!t) return;
      /* Ο ΔΙΑΚΟΠΤΗΣ. Ένα click — και το <button> δίνει click μόνο του σε Enter
         και κενό, οπότε ΔΕΝ χρειάζεται (και δεν πρέπει να υπάρχει) χειριστής
         πλήκτρων: θα γύριζε τον διακόπτη δύο φορές. */
      if (t.closest("#sym-mic")) { micToggle(); return; }
      if (t.closest("#sym-mic-trace")) {
        const b = t.closest("#sym-mic-trace"), text = micTraceText();
        const done = () => { b.textContent = "✓ Αντιγράφηκε"; setTimeout(() => { b.textContent = "⧉ ίχνος"; }, 1800); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
        else fallbackCopy(text, done);
        return;
      }
      if (t.closest("#sym-opus")) {
        if (UI.busy || !UI.agent) return;
        opusSet(!opusOn());
        render();                      /* καμία προειδοποίηση — απόφανση 18/10 */
        return;
      }
      const ag = t.closest(".sym-agent");
      if (ag) {
        if (UI.busy || ag.dataset.agent === UI.agent) return;
        UI.agent = ag.dataset.agent; UI.session = null; UI.errors = [];
        const a = agentOf(UI.agent); UI.turnMax = a ? a.max_turns : UI.turnMax;
        loadSessions().then(render); return;
      }
      if (t.id === "sym-recheck") { health(true).then(loadSessions).then(() => { UI.diag = diagLine(); render(); }); return; }
      const cp = t.closest("[data-copy]");
      if (cp) {
        const pre = cp.parentElement.querySelector("pre");
        const text = pre ? pre.textContent : "";
        const done = () => { cp.textContent = "✓ Αντιγράφηκε"; cp.classList.add("done"); setTimeout(() => { cp.textContent = "⎘ Αντιγραφή"; cp.classList.remove("done"); }, 1800); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
        else fallbackCopy(text, done);
        return;
      }
      if (t.id === "sym-new") { if (UI.busy) return; UI.session = null; UI.errors = []; UI.ctxDraft = ""; render(); return; }
      if (t.id === "sym-archive") { archiveSession(); return; }
      if (t.id === "sym-export") { exportSession(); return; }
      if (t.id === "sym-close") { closeCase(); return; }
      if (t.id === "sym-send") { send(); return; }
      if (t.id === "sym-stop") { if (UI.abort) UI.abort.abort(); return; }
      const y = t.closest("[data-confirm]"); if (y) { confirmWrite(y.dataset.confirm, "write"); return; }
      const n = t.closest("[data-cancel]"); if (n) { confirmWrite(n.dataset.cancel, "cancel"); return; }
      const c = t.closest(".sym-cite"); if (c && window.openRequirements) { window.openRequirements(c.dataset.req); return; }
    });
    host.addEventListener("change", (ev) => {
      if (ev.target && ev.target.id === "sym-sess-sel") {
        const id = ev.target.value;
        UI.errors = [];
        if (!id) { UI.session = null; render(); return; }
        loadSession(id).then(render, (e) => { UI.errors = [{ kind: "error", text: e.message }]; UI.session = null; render(); });
      }
    });
    host.addEventListener("keydown", (ev) => {
      if (ev.target && ev.target.id === "sym-q" && ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); send(); }
    });
    host.addEventListener("input", (ev) => { if (ev.target && ev.target.id === "sym-student" && !UI.session) UI.ctxDraft = ev.target.value; });
    /* Το φύλλο που κρύβεται ή χάνεται: το μικρόφωνο δεν μένει ανοιχτό πίσω από
       μια άλλη καρτέλα. Το κολλημένο ON ήταν το μισό πρόβλημα της 19/10. */
    document.addEventListener("visibilitychange", () => { if (document.hidden && UI.speech.on) speechStop(); });
  }

  function advInit() {
    const view = $("view-advisor");
    if (!view) return;                                   // offline build: no view, nothing to do
    ensureStyle();
    let host = $("sym-main");
    if (!host) { host = document.createElement("section"); host.className = "sym-main"; host.id = "sym-main"; view.appendChild(host); }
    UI.host = host;
    wire(host);
    if (!UI.booted) {
      UI.booted = true;
      UI.speech.api = window.SpeechRecognition || window.webkitSpeechRecognition || null;
      UI.errors = [];
      host.innerHTML = `<p class="sym-hint">Έλεγχος του τοπικού proxy…</p>`;
    }
    health(false).then(loadSessions).then(render);
  }

  /* ════════════════════════════════════════════════════════════════════════
     § 7  THE EDITOR LOCK (Q2) — the tab exists only while THIS DEVICE is
     unlocked for editing, through the app's own SchedEdit (schedstore.js):
     same flag, same dialog, same 👁 View button as the Scheduler's dangerous
     controls. View-only never sees the advisor. Fail closed: no SchedEdit, no tab.
     ════════════════════════════════════════════════════════════════════════ */
  function applyLock(open) {
    const tab = $("tab-advisor"), view = $("view-advisor");
    if (!tab) return;
    tab.classList.toggle("hidden", !open);
    if (!open && view && !view.classList.contains("hidden")) {
      if (UI.abort) { try { UI.abort.abort(); } catch (e) { /* nothing streaming */ } }
      if (typeof window.switchView === "function") window.switchView("remarks");
    }
  }
  (function gate() {
    const E = window.SchedEdit;
    if (!E || typeof E.on !== "function") { applyLock(false); return; }
    applyLock(!!E.on());
    if (typeof E.subscribe === "function") E.subscribe((open) => applyLock(!!open));
  })();

  /* ════════════════════════════════════════════════════════════════════════
     § 9  Η ΣΥΝΕΔΡΙΑ ΤΗΣ CLOUDFLARE ACCESS — ΤΟ ΚΟΥΜΠΙ «ΣΥΝΔΕΣΗ»
     ════════════════════════════════════════════════════════════════════════
     ΤΟ ΠΡΟΒΛΗΜΑ, ΟΠΩΣ ΤΟ ΕΖΗΣΕ Ο ΙΔΙΟΚΤΗΤΗΣ ΚΑΙ ΣΕ ΑΛΛΕΣ ΕΦΑΡΜΟΓΕΣ. Μετά τις
     12 ώρες η συνεδρία λήγει. Η σελίδα είναι όμως ΗΔΗ ανοιχτή: δεν γίνεται
     πλοήγηση εγγράφου, άρα η Access δεν προλαβαίνει να δείξει τη φόρμα της.
     Τα αιτήματα απλώς αρχίζουν να αποτυγχάνουν — και μια ανανέωση καταλήγει
     καμιά φορά στη σελίδα «success logout», από την οποία δεν φαίνεται δρόμος
     πίσω. Η εφαρμογή μοιάζει χαλασμένη ενώ απλώς θέλει σύνδεση.

     Η ΛΥΣΗ ΕΙΝΑΙ ΜΙΑ ΠΛΟΗΓΗΣΗ ΕΓΓΡΑΦΟΥ. Μόνο αυτή την περνά η Access από τη
     ροή της. Γι' αυτό το κουμπί δεν κάνει fetch: αλλάζει `location`.

     ΔΥΟ ΚΟΥΜΠΙΑ, ΓΙΑΤΙ ΔΥΟ ΕΙΝΑΙ ΟΙ ΚΑΤΑΣΤΑΣΕΙΣ. «Σύνδεση» για τη λήξη.
     «Καθάρισε & σύνδεση» για το κολλημένο cookie — σβήνει τη συνεδρία ΜΕΣΩ
     fetch (ώστε να ΜΗΝ προσγειωθείς στη σελίδα logout, που είναι ακριβώς η
     παγίδα) και αμέσως μετά πλοηγεί.

     ΤΟ 404 ΔΕΝ ΕΙΝΑΙ ΛΗΞΗ. Σε origin χωρίς Access — π.χ. το GitHub Pages — το
     `/cdn-cgi/access/get-identity` απαντά 404. Αν το μετρούσαμε ως νεκρή
     συνεδρία, η μπάρα θα εμφανιζόταν σε κάθε δημόσιο επισκέπτη, ζητώντας του
     να συνδεθεί κάπου που δεν υπάρχει. Μόνο 401/403 ή αποτυχία δικτύου
     μετρούν. */
  const Access = (() => {
    const ST = { bar: null, busy: false, supported: null };

    /* 200 → ζωντανή · 404 → δεν υπάρχει Access εδώ · άλλο/σφάλμα → νεκρή */
    function probe() {
      return fetch("/cdn-cgi/access/get-identity", { cache: "no-store", credentials: "include" })
        .then((r) => (r.ok ? "alive" : (r.status === 404 ? "absent" : "dead")))
        .catch(() => "dead");
    }

    function hide() { if (ST.bar) { ST.bar.remove(); ST.bar = null; } }

    function show() {
      if (ST.bar) return;
      /* ΤΟ CSS ΜΠΑΙΝΕΙ ΕΔΩ, ΟΧΙ ΣΤΟ advInit. Βρέθηκε στη δοκιμή: το
         `ensureStyle()` τρέχει μόνο όταν ανοίξει η καρτέλα του συμβούλου, ενώ
         αυτή η μπάρα αφορά ΟΛΗ την εφαρμογή — πίσω από την Access είναι κάθε
         καρτέλα. Χωρίς αυτή τη γραμμή, όποιος κάθεται στο Remarks θα έβλεπε
         μια άστυλη γραμμή κειμένου αντί για ειδοποίηση. */
      ensureStyle();
      const bar = document.createElement("div");
      bar.className = "sym-authbar";
      bar.setAttribute("role", "alert");
      bar.innerHTML = `<span>🔒 Η συνεδρία έληξε — η Cloudflare Access ζητά νέα σύνδεση.</span>
        <span class="sym-auth-sp"></span>
        <button type="button" id="sym-login" title="Πλοηγεί στη σελίδα σύνδεσης της Access και επιστρέφει εδώ">Σύνδεση</button>
        <button type="button" id="sym-relogin" title="Σβήνει πρώτα τη συνεδρία — για όταν η σύνδεση κολλάει">Καθάρισε &amp; σύνδεση</button>`;
      document.body.insertBefore(bar, document.body.firstChild);
      ST.bar = bar;
      $("sym-login").addEventListener("click", () => go());
      $("sym-relogin").addEventListener("click", () => {
        fetch("/cdn-cgi/access/logout", { cache: "no-store", credentials: "include" })
          .catch(() => {})
          .then(() => go());
      });
    }

    function go() {
      /* cache-buster: η ανανέωση μιας κρυφής σελίδας δεν ξαναρωτά την Access */
      location.href = location.origin + "/app/?r=" + Date.now();
    }

    function check() {
      if (LOCAL || ST.busy || ST.supported === "absent") return Promise.resolve("alive");
      ST.busy = true;
      return probe().then((v) => {
        ST.busy = false;
        ST.supported = v === "absent" ? "absent" : "present";
        if (v === "dead") show(); else hide();
        return v;
      });
    }

    if (!LOCAL) {
      const start = () => {
        check();
        setInterval(check, 5 * 60 * 1000);
        /* Η ΠΙΟ ΣΥΧΝΗ ΣΤΙΓΜΗ ΤΗΣ ΛΗΞΗΣ: ο ιδιοκτήτης ξαναπιάνει το κινητό μετά
           από ώρες. Ο έλεγχος στην επαναφορά της καρτέλας τον προλαβαίνει. */
        document.addEventListener("visibilitychange", () => { if (!document.hidden) check(); });
      };
      if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
      else start();
    }
    return { check: check, show: show };
  })();

  window.advInit = function () {
    const E = window.SchedEdit;
    if (!E || typeof E.on !== "function" || !E.on()) { applyLock(false); return; }   // belt and braces
    advInit();
  };
  window.Advisor = { md: md, ui: UI, PROXY: PROXY, LOCAL: LOCAL, access: Access, diagLine: diagLine, _applyLock: applyLock,
                     _mic: { start: speechStart, stop: speechStop, toggle: micToggle, trace: micTraceText } };
})();
