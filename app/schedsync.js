"use strict";
/* SchedSync — optional cloud sync of the Scheduler store to a PRIVATE GitHub repo.
 *
 * MODEL
 *   The whole SchedStore snapshot lives as ONE JSON file in a repo the user owns
 *   (default: <owner>/fdms-data, path scheduler/data.json, branch main). Every
 *   push is a commit → free, complete version history. Pull replaces the store.
 *
 * SECURITY
 *   The fine-grained personal access token is typed by the USER into a password
 *   field and kept ONLY in this browser's localStorage ("p2r-sync-token") — it
 *   never enters the store snapshot, exports, or the repo itself. "Forget token"
 *   wipes it. All requests go directly browser → api.github.com over TLS.
 *
 * CONFLICTS
 *   The file's git SHA acts as an optimistic lock: push sends the SHA we last
 *   saw; if another device pushed meanwhile GitHub answers 409/422 and the user
 *   chooses "pull theirs" or "force push mine". Nothing is overwritten silently.
 *
 * OFFLINE / CLOSED NETWORK
 *   No GitHub reachable → status shows the error, localStorage stays authoritative,
 *   Export/Import keeps working. Sync is an add-on, never a dependency.
 */
(() => {
  const CFG_KEY = "p2r-sync-cfg";
  const TOK_KEY = "p2r-sync-token";
  const SHA_KEY = "p2r-sync-sha";
  const DIRTY_KEY = "p2r-sync-dirty"; /* survives reloads — a fresh page must NOT look "clean" */
  const API = "https://api.github.com";

  const st = { dirty: 0, applying: false, busy: false, lastMsg: "", timer: null };

  const $ = (id) => document.getElementById(id);
  const esc = (s) => { const d = document.createElement("div"); d.textContent = s ?? ""; return d.innerHTML; };
  const nowHM = () => new Date().toTimeString().slice(0, 5);

  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
  const lsDel = (k) => { try { localStorage.removeItem(k); } catch (e) {} };

  const cfg = () => { try { return JSON.parse(lsGet(CFG_KEY)) || null; } catch (e) { return null; } };
  const token = () => lsGet(TOK_KEY) || "";
  const configured = () => { const c = cfg(); return !!(c && c.repo && token()); };

  /* ── UTF-8 ⇄ base64 (chunked — payloads are hundreds of KB) ─────────────── */
  function b64encode(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000)
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function b64decode(b64) {
    const bin = atob(b64.replace(/\n/g, ""));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  /* ── GitHub API ─────────────────────────────────────────────────────────── */
  function hdrs() {
    return {
      "Authorization": "Bearer " + token(),
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };
  }
  async function gh(path, opts) {
    const r = await fetch(API + path, Object.assign({ headers: hdrs() }, opts || {}));
    return r;
  }
  function explain(r) {
    if (r.status === 401) return "token rejected (expired or wrong scope?)";
    if (r.status === 403) return "forbidden — check the token's repo access / rate limit";
    if (r.status === 404) return "repo, branch or file not found";
    return "HTTP " + r.status;
  }

  /* Remote file: {json, sha} | null (absent) | throws on other errors.
     Files >1MB: contents API refuses inline content → raw fallback for the body
     + directory listing for the SHA (size-independent).                       */
  async function fetchRemote() {
    const c = cfg();
    const url = "/repos/" + c.repo + "/contents/" + c.path + "?ref=" + encodeURIComponent(c.branch);
    let r = await gh(url);
    if (r.status === 404) return null;
    if (r.ok) {
      const meta = await r.json();
      if (meta.content) return { json: JSON.parse(b64decode(meta.content)), sha: meta.sha };
      r = null; // no inline content (too large) → fall through
    } else if (r.status !== 403) throw new Error(explain(r));

    const raw = await fetch(API + url, { headers: Object.assign(hdrs(), { Accept: "application/vnd.github.raw+json" }) });
    if (!raw.ok) throw new Error(explain(raw));
    const body = JSON.parse(await raw.text());
    const dir = c.path.split("/").slice(0, -1).join("/");
    const list = await gh("/repos/" + c.repo + "/contents/" + (dir ? dir : "") + "?ref=" + encodeURIComponent(c.branch));
    if (!list.ok) throw new Error(explain(list));
    const entry = (await list.json()).find((e) => e.path === c.path);
    if (!entry) throw new Error("file vanished between reads");
    return { json: body, sha: entry.sha };
  }

  async function pushRemote(sha) {
    const c = cfg();
    const snap = window.SchedStore.snapshot();
    const dev = c.device || "device";
    const body = {
      message: "scheduler sync — " + dev + " — " + new Date().toISOString(),
      content: b64encode(JSON.stringify(snap)),
      branch: c.branch,
    };
    if (sha) body.sha = sha;
    const r = await gh("/repos/" + c.repo + "/contents/" + c.path, {
      method: "PUT",
      body: JSON.stringify(body),
    });
    if (r.status === 409 || r.status === 422) return { conflict: true };
    if (!r.ok) throw new Error(explain(r));
    const out = await r.json();
    return { sha: out.content && out.content.sha };
  }

  /* ── apply a pulled snapshot (silent — no confirm(); callers decide) ────── */
  function applySnapshot(snap) {
    const S = window.SchedStore;
    st.applying = true;
    try {
      for (const name of S.COLLECTIONS) {
        const v = snap[name];
        if (v !== undefined) S.put(name, v);
      }
    } finally { st.applying = false; }
    setDirty(0);
  }

  function setDirty(n) {
    st.dirty = n;
    if (n > 0) lsSet(DIRTY_KEY, String(n)); else lsDel(DIRTY_KEY);
    refreshBtn();
  }

  /* ── high-level flows ───────────────────────────────────────────────────── */
  async function doPull(interactive) {
    if (!configured() || st.busy) return;
    st.busy = true; setStatus("pulling…");
    try {
      const remote = await fetchRemote();
      if (!remote) { setStatus("no remote file yet — push first"); return; }
      if (st.dirty > 0 && interactive) {
        if (!confirm("Pull replaces this browser's scheduler data.\nYou have " + st.dirty +
          " local change(s) not pushed — they will be LOST.\n\nContinue?")) { setStatus(st.dirty + " local changes"); return; }
      } else if (st.dirty > 0) { setStatus(st.dirty + " local changes — pull skipped"); return; }
      applySnapshot(remote.json);
      lsSet(SHA_KEY, remote.sha);
      setStatus("pulled ✓ " + nowHM());
      window.SchedStore.toast("Sync: pulled latest from GitHub.", "good");
    } catch (e) { setStatus("pull failed: " + e.message); }
    finally { st.busy = false; }
  }

  async function doPush(force) {
    if (!configured() || st.busy) return;
    st.busy = true; setStatus("pushing…");
    try {
      let sha = lsGet(SHA_KEY) || undefined;
      if (force) {
        const remote = await fetchRemote();
        sha = remote ? remote.sha : undefined;
      }
      const out = await pushRemote(sha);
      if (out.conflict) {
        setStatus("⚠ conflict — remote changed");
        if (confirm("Another device pushed newer data to the repo.\n\nOK = PULL theirs (discards your " + st.dirty +
          " local change(s))\nCancel = keep working locally (use 'Force push' to overwrite them).")) {
          setDirty(0); st.busy = false; await doPull(false); return;
        }
        return;
      }
      if (out.sha) lsSet(SHA_KEY, out.sha);
      setDirty(0);
      setStatus("pushed ✓ " + nowHM());
      window.SchedStore.toast("Sync: pushed to GitHub.", "good");
    } catch (e) { setStatus("push failed: " + e.message); }
    finally { st.busy = false; }
  }

  /* ── UI ─────────────────────────────────────────────────────────────────── */
  const CSS = `
  .sync-pop{position:fixed;inset:0;z-index:70;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.45)}
  .sync-pop.hidden{display:none}
  .sync-box{background:var(--panel);border:1px solid var(--line);border-radius:12px;min-width:340px;max-width:440px;padding:16px 18px;box-shadow:0 12px 40px rgba(0,0,0,.4)}
  .sync-box h3{margin:0 0 4px;font-size:15px}
  .sync-box .hint{font-size:11.5px;color:var(--muted);margin:2px 0 10px;line-height:1.45}
  .sync-box label{display:block;font-size:11px;color:var(--muted);margin:8px 0 3px;text-transform:uppercase;letter-spacing:.04em}
  .sync-box input{width:100%;box-sizing:border-box;padding:7px 10px;background:var(--panel-2);color:var(--text);border:1px solid var(--line);border-radius:7px;font-size:13px}
  .sync-box input:focus{outline:none;border-color:var(--accent)}
  .sync-row{display:flex;gap:8px;margin-top:14px;flex-wrap:wrap}
  .sync-row .sch-tbtn{flex:0 0 auto}
  .sync-status{font-size:12px;color:var(--muted);margin-top:10px;min-height:16px}
  .sync-tok-note{font-size:11px;color:var(--good,#4caf50)}
  `;

  function mount() {
    const host = $("sch-tools");
    if (!host || host._schSync) return false;
    host._schSync = true;

    const style = document.createElement("style");
    style.textContent = CSS;
    document.head.appendChild(style);

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "sch-tbtn";
    btn.id = "sync-open";
    btn.title = "Sync the scheduler store with a private GitHub repo";
    host.insertBefore(btn, host.firstChild);

    const pop = document.createElement("div");
    pop.className = "sync-pop hidden";
    pop.id = "sync-pop";
    document.body.appendChild(pop);

    btn.addEventListener("click", () => { renderPop(); pop.classList.remove("hidden"); });
    pop.addEventListener("click", (e) => {
      if (e.target === pop || e.target.closest("[data-s=close]")) { pop.classList.add("hidden"); return; }
      const b = e.target.closest("[data-s]");
      if (!b) return;
      if (b.dataset.s === "save") saveForm();
      else if (b.dataset.s === "pull") doPull(true);
      else if (b.dataset.s === "push") doPush(false);
      else if (b.dataset.s === "force") { if (confirm("Force push OVERWRITES the repo version with this browser's data. Continue?")) doPush(true); }
      else if (b.dataset.s === "forget") { lsDel(TOK_KEY); lsDel(SHA_KEY); renderPop(); setStatus("token forgotten"); }
    });
    refreshBtn();
    return true;
  }

  function renderPop() {
    const c = cfg() || { repo: "", branch: "main", path: "scheduler/data.json", device: "", auto_pull: true };
    const hasTok = !!token();
    $("sync-pop").innerHTML = `
      <div class="sync-box">
        <h3>☁ GitHub Sync</h3>
        <p class="hint">One JSON file in a <b>private</b> repo you own — every push is a commit
        (full history). Create the repo once, then a fine-grained token:
        GitHub → Settings → Developer settings → Fine-grained tokens → access to
        <b>that repo only</b>, permission <b>Contents: Read &amp; write</b>. Paste it below —
        it stays in THIS browser only.</p>
        <label>Repository (owner/name)</label>
        <input id="sync-repo" placeholder="Nickkoro21/fdms-data" value="${esc(c.repo)}">
        <label>Branch</label>
        <input id="sync-branch" value="${esc(c.branch || "main")}">
        <label>File path in repo</label>
        <input id="sync-path" value="${esc(c.path || "scheduler/data.json")}">
        <label>This device's name (shows in commit messages)</label>
        <input id="sync-device" placeholder="work-laptop / home-pc" value="${esc(c.device || "")}">
        <label>Fine-grained token ${hasTok ? '<span class="sync-tok-note">— saved ✓ (leave empty to keep)</span>' : ""}</label>
        <input id="sync-token" type="password" autocomplete="off" placeholder="${hasTok ? "•••••••••••• saved" : "github_pat_…"}">
        <div class="sync-row">
          <button type="button" class="sch-tbtn" data-s="save">💾 Save</button>
          <button type="button" class="sch-tbtn" data-s="pull">⭳ Pull</button>
          <button type="button" class="sch-tbtn" data-s="push">⭱ Push</button>
          <button type="button" class="sch-tbtn danger" data-s="force">Force push</button>
          <button type="button" class="sch-tbtn danger" data-s="forget">Forget token</button>
          <button type="button" class="sch-tbtn" data-s="close">✕ Close</button>
        </div>
        <div class="sync-status" id="sync-status">${esc(st.lastMsg)}</div>
      </div>`;
  }

  function saveForm() {
    const repo = $("sync-repo").value.trim().replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "").replace(/\/+$/, "");
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) { setStatus("repository must be owner/name"); return; }
    const c = {
      repo,
      branch: $("sync-branch").value.trim() || "main",
      path: $("sync-path").value.trim().replace(/^\/+/, "") || "scheduler/data.json",
      device: $("sync-device").value.trim() || "device",
      auto_pull: true,
    };
    lsSet(CFG_KEY, JSON.stringify(c));
    const t = $("sync-token").value.trim();
    if (t) { lsSet(TOK_KEY, t); $("sync-token").value = ""; }
    renderPop();
    setStatus(configured() ? "saved ✓ — ready to sync" : "saved — token still missing");
    refreshBtn();
  }

  function setStatus(msg) {
    st.lastMsg = msg;
    const el = $("sync-status");
    if (el) el.textContent = msg;
    refreshBtn();
  }

  function refreshBtn() {
    const b = $("sync-open");
    if (!b) return;
    if (!configured()) b.textContent = "☁ Sync";
    else if (/failed|conflict|⚠/.test(st.lastMsg)) b.textContent = "☁ Sync ⚠";
    else if (st.dirty > 0) b.textContent = "☁ Sync (" + st.dirty + ")";
    else b.textContent = "☁ Sync ✓";
  }

  /* ── boot ───────────────────────────────────────────────────────────────── */
  async function boot() {
    if (!window.SchedStore) { setTimeout(boot, 400); return; }
    await window.SchedStore.ready();
    st.dirty = parseInt(lsGet(DIRTY_KEY), 10) || 0;
    window.SchedStore.subscribe(() => {
      if (st.applying) return;
      setDirty(st.dirty + 1);
    });
    if (configured()) doPull(false); // silent: applies only when no local changes
    armMount();
  }
  /* mountTools() (scheduler tab open) REPLACES #sch-tools' innerHTML — wait for
     it before inserting the Sync button, or it would be wiped. */
  function armMount() {
    const host = $("sch-tools");
    if (host && host._schTools) { mount(); refreshBtn(); return; }
    setTimeout(armMount, 600);
  }
  boot();
})();
