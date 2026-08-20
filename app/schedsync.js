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
 * ENCRYPTION (optional, spec §2 rev 2026-08-09)
 *   With a session passphrase set, the pushed payload is AES-GCM-256 ciphertext;
 *   the key comes from PBKDF2-SHA256 (310 000 iterations, random 16-byte salt +
 *   12-byte IV per push). Wire format:
 *     {"fdms_enc":1,"kdf":"PBKDF2-SHA256","iter":N,"salt":b64,"iv":b64,"ct":b64}
 *   The passphrase is stored NOWHERE — memory only, re-entered after each page
 *   load. Plaintext remotes are still accepted (migration path). A wrong
 *   passphrase on pull NEVER touches local data.
 *
 * ACCESS-CODE CURTAIN ("🔒 Lock")
 *   A PBKDF2 verifier (salt+hash only, "p2r-lock-verifier") gates the Scheduler
 *   VIEW behind a full-pane overlay once per browser session. It is a privacy
 *   curtain for shared screens — local data is NOT encrypted by it; the sync
 *   passphrase is what encrypts the cloud copy. Data ops (auto-pull, store
 *   writes) proceed under the curtain; only the UI is veiled.
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
  const ENC_KEY = "p2r-sync-enc";     /* "1" = the remote we last saw was ciphertext */
  const LOCK_KEY = "p2r-lock-verifier";
  const LOCK_OPEN = "p2r-lock-open"; /* sessionStorage: curtain already passed this session */
  const API = "https://api.github.com";
  const ITER = 310000; /* PBKDF2-SHA256 iterations for both payload key and lock verifier */
  const AUTO_MS = 5000;              /* debounce: 5 s after the LAST change of a burst */

  const st = { dirty: 0, applying: false, busy: false, lastMsg: "", lockMsg: "", timer: null,
    auto: { t: null, state: "", at: "", failed: "" } };
  /* memory-only session secrets — never localStorage/sessionStorage */
  const sess = { pass: null, key: null, keyId: "", unlocked: false };

  const $ = (id) => document.getElementById(id);
  /* Round 16b — quote-safe: the repo / branch / path / device values below are
     typed by the user and land inside value="…". The old textContent helper let
     a `"` escape the attribute. */
  const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ESC[c]);
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
  /* raw bytes ⇄ base64 (salt / iv / ciphertext) */
  function bytesToB64(u8) {
    let bin = "";
    for (let i = 0; i < u8.length; i += 0x8000)
      bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function b64ToBytes(b64) {
    const bin = atob(String(b64 || "").replace(/\n/g, ""));
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8;
  }

  /* ── WebCrypto: PBKDF2-SHA256 → AES-GCM-256 key / lock verifier ─────────── */
  function needSubtle() {
    if (!(window.crypto && crypto.subtle)) throw new Error("WebCrypto unavailable in this context");
    return crypto.subtle;
  }
  async function kdfMaterial(secret) {
    return needSubtle().importKey("raw", new TextEncoder().encode(secret), "PBKDF2", false, ["deriveBits", "deriveKey"]);
  }
  async function aesKeyFrom(secret, saltU8, iter) {
    const mat = await kdfMaterial(secret);
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", hash: "SHA-256", salt: saltU8, iterations: iter },
      mat, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  }
  async function verifierHash(secret, saltU8, iter) {
    const mat = await kdfMaterial(secret);
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", hash: "SHA-256", salt: saltU8, iterations: iter }, mat, 256);
    return bytesToB64(new Uint8Array(bits));
  }
  const isEnvelope = (j) => !!(j && typeof j === "object" && j.fdms_enc === 1 && j.salt && j.iv && j.ct);

  /* fresh random salt + IV on EVERY push */
  async function encryptPayload(plain) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await aesKeyFrom(sess.pass, salt, ITER);
    const ct = new Uint8Array(await crypto.subtle.encrypt(
      { name: "AES-GCM", iv }, key, new TextEncoder().encode(plain)));
    return JSON.stringify({
      fdms_enc: 1, kdf: "PBKDF2-SHA256", iter: ITER,
      salt: bytesToB64(salt), iv: bytesToB64(iv), ct: bytesToB64(ct),
    });
  }
  /* throws on a wrong passphrase (AES-GCM authentication failure) */
  async function decryptEnvelope(env, pass) {
    const iter = (env.iter | 0) > 0 ? (env.iter | 0) : ITER;
    const id = env.salt + "|" + iter;
    const key = (pass === sess.pass && sess.key && sess.keyId === id)
      ? sess.key
      : await aesKeyFrom(pass, b64ToBytes(env.salt), iter);
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64ToBytes(env.iv) }, key, b64ToBytes(env.ct));
    sess.key = key; sess.keyId = id; /* cache the derived key in memory, only after success */
    return new TextDecoder().decode(pt);
  }

  function armPass(p) {
    if (!p) return;
    if (p !== sess.pass) { sess.pass = p; sess.key = null; sess.keyId = ""; }
    refreshPassNote();
    hint();                    // arming the key can be what turns auto-sync on
  }
  function clearPass() {
    sess.pass = null; sess.key = null; sess.keyId = "";
    refreshPassNote();
    hint();
  }
  function fieldPass() { const el = $("sync-pass"); return el ? el.value.trim() : ""; }
  function clearPassField() { const el = $("sync-pass"); if (el) el.value = ""; }
  function refreshPassNote() {
    const n = $("sync-pass-note");
    if (n) n.textContent = sess.pass ? "— set for this session ✓" : "";
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
    let payload = JSON.stringify(snap);
    if (sess.pass) payload = await encryptPayload(payload); /* repo sees ciphertext only */
    const dev = c.device || "device";
    const body = {
      message: "scheduler sync — " + dev + " — " + new Date().toISOString(),
      content: b64encode(payload),
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

  /* ── apply a pulled snapshot (silent — no confirm(); callers decide) ──────
     Round 12b — this is REPLICATION, not editing: the owner's own device is
     copying the owner's own repo file into itself, and it must keep working
     while the app is in view-only mode (that is the normal state of a second
     device). So it runs inside SchedStore.system(), the one named hole in the
     edit lock — see the SchedEdit block in schedstore.js.                    */
  function applySnapshot(snap) {
    const S = window.SchedStore;
    st.applying = true;
    try {
      S.system(() => {
        for (const name of S.COLLECTIONS) {
          const v = snap[name];
          if (v !== undefined) S.put(name, v);
        }
      });
    } finally { st.applying = false; }
    setDirty(0);
  }

  function setDirty(n) {
    st.dirty = n;
    if (n > 0) lsSet(DIRTY_KEY, String(n)); else lsDel(DIRTY_KEY);
    refreshBtn();
    hint();
  }

  /* ── high-level flows ───────────────────────────────────────────────────── */
  async function doPull(interactive) {
    if (!configured() || st.busy) return;
    st.busy = true; setStatus("pulling…");
    try {
      const remote = await fetchRemote();
      if (!remote) { setStatus("no remote file yet — push first"); return; }
      let snap = remote.json;
      if (isEnvelope(snap)) {
        const fp = fieldPass();
        const pass = fp || sess.pass; /* a freshly typed passphrase wins over the cached one */
        if (!pass) {
          setStatus(interactive
            ? "remote is encrypted — type the passphrase above, then Pull"
            : "⚠ remote is encrypted — enter the passphrase in ☁ Sync, then Pull");
          return;
        }
        let plain;
        try { plain = await decryptEnvelope(snap, pass); }
        catch (e) { setStatus("wrong passphrase (or corrupted remote data) — nothing was changed"); return; }
        try { snap = JSON.parse(plain); }
        catch (e) { setStatus("decrypted payload is not valid JSON — nothing was changed"); return; }
        armPass(pass); clearPassField();
      }
      /* what the remote LOOKS like decides whether an automatic push is safe:
         pushing plaintext over a ciphertext remote would silently downgrade
         the repo copy, so auto-sync refuses to do it without the passphrase */
      lsSet(ENC_KEY, isEnvelope(remote.json) ? "1" : "0");
      if (st.dirty > 0 && interactive) {
        if (!confirm("Pull replaces this browser's scheduler data.\nYou have " + st.dirty +
          " local change(s) not pushed — they will be LOST.\n\nContinue?")) { setStatus(st.dirty + " local changes"); return; }
      } else if (st.dirty > 0) { setStatus(st.dirty + " local changes — pull skipped"); return; }
      applySnapshot(snap);
      lsSet(SHA_KEY, remote.sha);
      setStatus("pulled ✓ " + nowHM());
      window.SchedStore.toast("Sync: pulled latest from GitHub.", "good");
    } catch (e) { setStatus("pull failed: " + e.message); }
    finally { st.busy = false; }
  }

  /* auto = an unattended push scheduled by the debounce below: it must never
     open a dialog and never toast a success, or a working evening would be one
     long stream of pop-ups. It reports through the topbar hint instead.     */
  async function doPush(force, auto) {
    if (!configured() || st.busy) return;
    st.busy = true; setStatus("pushing…");
    try {
      const fp = fieldPass();
      if (fp) { armPass(fp); clearPassField(); } /* typing + Push arms without Save */
      let sha = lsGet(SHA_KEY) || undefined;
      if (force) {
        const remote = await fetchRemote();
        sha = remote ? remote.sha : undefined;
      }
      const out = await pushRemote(sha);
      if (out.conflict) {
        setStatus("⚠ conflict — remote changed");
        if (auto) return;                       // the hint says so; the user decides in ☁ Sync
        if (confirm("Another device pushed newer data to the repo.\n\nOK = PULL theirs (discards your " + st.dirty +
          " local change(s))\nCancel = keep working locally (use 'Force push' to overwrite them).")) {
          setDirty(0); st.busy = false; await doPull(false); return;
        }
        return;
      }
      if (out.sha) lsSet(SHA_KEY, out.sha);
      lsSet(ENC_KEY, sess.pass ? "1" : "0");
      setDirty(0);
      setStatus("pushed ✓ " + nowHM() + (sess.pass ? " (encrypted)" : ""));
      if (!auto) window.SchedStore.toast("Sync: pushed to GitHub.", "good");
    } catch (e) { setStatus("push failed: " + e.message); }
    finally { st.busy = false; }
  }

  /* ══ AUTO-SYNC ON CHANGE ═══════════════════════════════════════════════
     User directive, 18/08/2026: «Οταν περασω μεταβολη να γινεται sync το
     αρχειο.» Every store mutation re-arms a 5-second timer; a burst of edits
     coalesces into ONE commit five seconds after the last of them.

     WHEN IT STAYS OFF — and it says so instead of pretending
       · sync not configured (no repo / no token on this device);
       · the remote copy is ciphertext and the passphrase is not in this
         session. Pushing then would replace the encrypted repo file with
         PLAINTEXT — a silent security downgrade — so it refuses and asks.
       · a previous automatic push failed or hit a conflict: it stops, toasts
         ONCE and waits for the user in ☁ Sync. It never retries in a loop.
     Nothing here changes how the passphrase is handled: it stays memory-only.
     The manual Pull / Push / Force push buttons are untouched.             */
  function autoReason() {
    const c = cfg();
    if (!c || !c.repo) return "auto-sync off — no repository is configured yet (open ☁ Sync).";
    if (!token()) return "auto-sync off — this browser holds no token (paste it in ☁ Sync).";
    if (lsGet(ENC_KEY) === "1" && !sess.pass) {
      return "auto-sync off — the repo copy is encrypted and the passphrase is not in this session; "
        + "type it in ☁ Sync so a push cannot silently write plaintext.";
    }
    if (st.auto.failed) return st.auto.failed;
    return "";
  }
  const autoOn = () => !autoReason();

  function autoSchedule() {
    if (!autoOn()) { hint(); return; }
    clearTimeout(st.auto.t);
    st.auto.state = "pending";
    hint();
    st.auto.t = setTimeout(() => { void autoRun(); }, AUTO_MS);
  }

  async function autoRun() {
    st.auto.t = null;
    if (!autoOn() || !st.dirty) { hint(); return; }
    if (st.busy) { st.auto.t = setTimeout(() => { void autoRun(); }, 1500); return; }  // a manual op is running
    st.auto.state = "busy";
    hint();
    await doPush(false, true);
    if (st.dirty > 0) {
      st.auto.state = "failed";
      st.auto.failed = "auto-sync stopped — " + (st.lastMsg || "the last push did not go through")
        + ". Use ☁ Sync, then it re-arms itself.";
      window.SchedStore.toast("Auto-sync stopped — " + (st.lastMsg || "push failed"), "bad");
    } else {
      st.auto.state = "done";
      st.auto.at = nowHM();
      st.auto.failed = "";
    }
    hint();
  }
  /* a manual Pull / Push / Save clears the stop flag: the user has just been
     told what happened and has acted on it */
  function autoRearm() { st.auto.failed = ""; st.auto.state = st.dirty ? "pending" : st.auto.state; hint(); }

  /* the hint lives beside the databadge — the one place in the topbar that
     already talks about data freshness */
  function hintEl() {
    let el = $("sync-hint");
    if (el) return el;
    const badge = $("databadge");
    if (!badge || !badge.parentNode) return null;
    el = document.createElement("span");
    el.id = "sync-hint";
    el.className = "sync-hint";
    badge.parentNode.insertBefore(el, badge);
    return el;
  }
  function hint() {
    const el = hintEl();
    if (!el) return;
    const why = autoReason();
    let txt = "", cls = "sync-hint";
    if (why) { txt = why; cls += st.auto.failed ? " is-bad" : " is-off"; }
    else if (st.auto.state === "busy") { txt = "syncing…"; cls += " is-on"; }
    else if (st.auto.state === "pending") { txt = "syncing…"; cls += " is-on"; }
    else if (st.auto.state === "done") { txt = "synced " + st.auto.at; cls += " is-ok"; }
    else txt = st.dirty ? "auto-sync armed" : "";
    el.textContent = txt;
    el.className = cls;
    el.title = why || (st.auto.state === "done"
      ? "the whole store was pushed to the GitHub repo at " + st.auto.at
      : "every change is pushed automatically, " + (AUTO_MS / 1000) + " s after the last one");
  }

  /* ── access-code curtain (privacy veil, honest: NOT encryption) ─────────── */
  const lockCfgGet = () => { try { return JSON.parse(lsGet(LOCK_KEY)) || null; } catch (e) { return null; } };
  const veilNeeded = () => !!lockCfgGet() && !sess.unlocked;

  async function writeLock(code, pair) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const rec = {
      v: 1, kdf: "PBKDF2-SHA256", iter: ITER,
      salt: bytesToB64(salt), hash: await verifierHash(code, salt, ITER), pair: !!pair,
    };
    lsSet(LOCK_KEY, JSON.stringify(rec));
  }
  async function lockMatches(code) {
    const v = lockCfgGet();
    if (!v) return true;
    return (await verifierHash(code, b64ToBytes(v.salt), (v.iter | 0) || ITER)) === v.hash;
  }
  /* persist=true → the code was TYPED correctly: the whole browser session
     (incl. reloads, sessionStorage) is open. persist=false → set/changed just
     now: this page stays open, the NEXT session asks for the new code.       */
  let lockPending = null; /* deferred scheduler render — see window.SchedLock */
  function unlockSession(persist) {
    sess.unlocked = true;
    removeVeil();
    try {
      if (persist) sessionStorage.setItem(LOCK_OPEN, "1");
      else sessionStorage.removeItem(LOCK_OPEN);
    } catch (e) {}
    const fn = lockPending;
    lockPending = null;
    if (fn) { try { fn(); } catch (e) { console.error(e); } }
  }
  /* While locked, scheduler.js defers its ENTIRE render through this hook, so
     the veiled DOM contains NO data (no Ctrl+A / find-in-page leak).         */
  window.SchedLock = {
    locked: veilNeeded,
    onUnlock: (fn) => { lockPending = fn; },
  };
  function removeVeil() { const v = $("sch-lock"); if (v) v.remove(); }
  function shake(el) {
    if (!el) return;
    el.classList.remove("is-shake");
    void el.offsetWidth; /* restart the animation */
    el.classList.add("is-shake");
  }

  function mountVeil() {
    const view = $("view-scheduler");
    if (!view || $("sch-lock")) return;
    const veil = document.createElement("div");
    veil.className = "sch-lockveil";
    veil.id = "sch-lock";
    veil.innerHTML = `
      <form class="sch-lockbox" id="sch-lockform">
        <div class="sch-lockico" aria-hidden="true">🔒</div>
        <h3>Scheduler locked</h3>
        <p class="hint">Enter the access code. This is a privacy curtain for shared screens —
        the sync passphrase is what encrypts the cloud copy.</p>
        <input type="password" id="sch-lockcode" autocomplete="off" placeholder="access code" aria-label="Access code">
        <button type="submit" class="sch-tbtn sch-lockbtn">Unlock</button>
        <div class="sync-status" id="sch-lockmsg"></div>
      </form>`;
    view.appendChild(veil);
    $("sch-lockform").addEventListener("submit", (e) => { e.preventDefault(); void tryUnlock(); });
  }

  async function tryUnlock() {
    const box = document.querySelector("#sch-lock .sch-lockbox");
    const inp = $("sch-lockcode");
    const msg = $("sch-lockmsg");
    try {
      const v = lockCfgGet();
      if (!v) { unlockSession(false); return; }
      const code = inp ? inp.value : "";
      if (!code) { shake(box); return; }
      if (msg) msg.textContent = "checking…";
      if (!(await lockMatches(code))) {
        if (msg) msg.textContent = "wrong code — try again";
        shake(box);
        if (inp) inp.select();
        return;
      }
      if (v.pair) armPass(code); /* paired secret also arms the session encryption key */
      unlockSession(true);
    } catch (e) { if (msg) msg.textContent = e.message; }
  }

  async function lockSetNew() {
    try {
      const code = ($("lock-new") ? $("lock-new").value : "").trim();
      if (code.length < 4) { setLockStatus("code must be at least 4 characters"); return; }
      const pair = !!($("lock-pair") && $("lock-pair").checked);
      setLockStatus("deriving verifier…");
      await writeLock(code, pair);
      if (pair) armPass(code);
      unlockSession(false);
      renderPop();
      setLockStatus("access code set ✓ — the Scheduler will ask for it next session");
    } catch (e) { setLockStatus(e.message); }
  }

  async function lockChangeCode() {
    try {
      const v = lockCfgGet();
      if (!v) { renderPop(); return; }
      const oldC = ($("lock-old") ? $("lock-old").value : "").trim();
      const newC = ($("lock-new") ? $("lock-new").value : "").trim();
      if (!oldC) { setLockStatus("enter the current code first"); return; }
      if (newC.length < 4) { setLockStatus("new code must be at least 4 characters"); return; }
      setLockStatus("checking…");
      if (!(await lockMatches(oldC))) { setLockStatus("current code is wrong"); return; }
      const pair = !!($("lock-pair") && $("lock-pair").checked);
      await writeLock(newC, pair);
      if (pair) armPass(newC);
      unlockSession(false);
      renderPop();
      setLockStatus("code changed ✓");
    } catch (e) { setLockStatus(e.message); }
  }

  async function lockRemoveCode() {
    try {
      const v = lockCfgGet();
      if (!v) { renderPop(); return; }
      const oldC = ($("lock-old") ? $("lock-old").value : "").trim();
      if (!oldC) { setLockStatus("enter the current code to remove it"); return; }
      setLockStatus("checking…");
      if (!(await lockMatches(oldC))) { setLockStatus("current code is wrong"); return; }
      if (!confirm("Remove the access code? The Scheduler will open without asking.")) { setLockStatus(""); return; }
      lsDel(LOCK_KEY);
      unlockSession(false);
      try { sessionStorage.removeItem(LOCK_OPEN); } catch (e) {}
      renderPop();
      setLockStatus("code removed — curtain off");
    } catch (e) { setLockStatus(e.message); }
  }

  function setLockStatus(msg) {
    st.lockMsg = msg;
    const el = $("lock-status");
    if (el) el.textContent = msg;
  }

  /* ── UI ─────────────────────────────────────────────────────────────────── */
  const CSS = `
  .sync-pop{position:fixed;inset:0;z-index:70;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.45)}
  .sync-pop.hidden{display:none}
  .sync-box{background:var(--panel);border:1px solid var(--line);border-radius:12px;min-width:340px;max-width:440px;max-height:88vh;overflow-y:auto;padding:16px 18px;box-shadow:0 12px 40px rgba(0,0,0,.4)}
  .sync-box h3{margin:0 0 4px;font-size:15px}
  .sync-box .hint{font-size:11.5px;color:var(--muted);margin:2px 0 10px;line-height:1.45}
  .sync-box label{display:block;font-size:11px;color:var(--muted);margin:8px 0 3px;text-transform:uppercase;letter-spacing:.04em}
  .sync-box input{width:100%;box-sizing:border-box;padding:7px 10px;background:var(--panel-2);color:var(--text);border:1px solid var(--line);border-radius:7px;font-size:13px}
  .sync-box input:focus{outline:none;border-color:var(--accent)}
  .sync-row{display:flex;gap:8px;margin-top:14px;flex-wrap:wrap}
  .sync-row .sch-tbtn{flex:0 0 auto}
  .sync-status{font-size:12px;color:var(--muted);margin-top:10px;min-height:16px}
  .sync-tok-note{font-size:11px;color:var(--good,#4caf50)}
  .sync-hr{border:0;border-top:1px solid var(--line);margin:16px 0 10px}
  .sync-box label.sync-chk{display:flex;gap:7px;align-items:flex-start;text-transform:none;letter-spacing:0;font-size:11.5px;line-height:1.45;margin:9px 0 2px;cursor:pointer;color:var(--muted)}
  .sync-box label.sync-chk input{width:auto;margin-top:2px;accent-color:var(--accent)}
  .sch-view{position:relative}
  .sch-lockveil{position:absolute;inset:0;z-index:66;display:flex;align-items:flex-start;justify-content:center;background:var(--bg);min-height:60vh;padding-top:9vh}
  .sch-lockbox{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:24px 28px;width:min(340px,92vw);text-align:center;box-shadow:0 12px 40px rgba(0,0,0,.35)}
  .sch-lockbox h3{margin:6px 0 4px;font-size:15px;color:var(--text)}
  .sch-lockbox .hint{font-size:11.5px;color:var(--muted);line-height:1.45;margin:4px 0 12px}
  .sch-lockico{font-size:26px}
  .sch-lockbox input{width:100%;box-sizing:border-box;padding:8px 10px;background:var(--panel-2);color:var(--text);border:1px solid var(--line);border-radius:7px;font-size:14px;text-align:center;margin-bottom:10px}
  .sch-lockbox input:focus{outline:none;border-color:var(--accent)}
  .sch-lockbtn{width:100%}
  .sch-lockbox .sync-status{margin-top:8px}
  .is-shake{animation:schshake .45s}
  @keyframes schshake{10%,90%{transform:translateX(-2px)}20%,80%{transform:translateX(4px)}30%,50%,70%{transform:translateX(-6px)}40%,60%{transform:translateX(6px)}}
  `;

  let cssDone = false;
  function injectCss() {
    if (cssDone) return;
    cssDone = true;
    const style = document.createElement("style");
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  function mount() {
    const host = $("sch-tools");
    if (!host || host._schSync) return false;
    host._schSync = true;

    injectCss();

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
      /* every manual act clears the auto-sync stop flag: the user has just been
         told what went wrong and has done something about it */
      if (b.dataset.s === "save") { saveForm(); autoRearm(); }
      else if (b.dataset.s === "pull") { autoRearm(); doPull(true); }
      else if (b.dataset.s === "push") { autoRearm(); doPush(false); }
      else if (b.dataset.s === "force") { if (confirm("Force push OVERWRITES the repo version with this browser's data. Continue?")) { autoRearm(); doPush(true); } }
      else if (b.dataset.s === "forget") { lsDel(TOK_KEY); lsDel(SHA_KEY); renderPop(); setStatus("token forgotten"); hint(); }
      else if (b.dataset.s === "pass-clear") { clearPass(); renderPop(); setStatus("passphrase cleared — next push will be PLAINTEXT"); hint(); }
      else if (b.dataset.s === "lock-set") void lockSetNew();
      else if (b.dataset.s === "lock-change") void lockChangeCode();
      else if (b.dataset.s === "lock-remove") void lockRemoveCode();
    });
    refreshBtn();
    return true;
  }

  function renderPop() {
    const c = cfg() || { repo: "", branch: "main", path: "scheduler/data.json", device: "", auto_pull: true };
    const hasTok = !!token();
    const lk = lockCfgGet();
    $("sync-pop").innerHTML = `
      <div class="sync-box">
        <h3>☁ GitHub Sync</h3>
        <p class="hint">One JSON file in a <b>private</b> repo you own — every push is a commit
        (full history). Create the repo once, then a fine-grained token:
        GitHub → Settings → Developer settings → Fine-grained tokens → access to
        <b>that repo only</b>, permission <b>Contents: Read &amp; write</b>. Paste it below —
        it stays in THIS browser only.</p>
        <label>Repository (owner/name)</label>
        <input id="sync-repo" placeholder="e.g.  Nickkoro21/fdms-data" value="${esc(c.repo)}">
        <label>Branch</label>
        <input id="sync-branch" value="${esc(c.branch || "main")}">
        <label>File path in repo</label>
        <input id="sync-path" value="${esc(c.path || "scheduler/data.json")}">
        <label>This device's name (shows in commit messages)</label>
        <input id="sync-device" placeholder="work-laptop / home-pc" value="${esc(c.device || "")}">
        <label>Fine-grained token ${hasTok ? '<span class="sync-tok-note">— saved ✓ (leave empty to keep)</span>' : ""}</label>
        <input id="sync-token" type="password" autocomplete="off" placeholder="${hasTok ? "•••••••••••• saved" : "github_pat_…"}">
        <label>Encryption passphrase <span class="sync-tok-note" id="sync-pass-note">${sess.pass ? "— set for this session ✓" : ""}</span></label>
        <input id="sync-pass" type="password" autocomplete="off" placeholder="${sess.pass ? "armed — repo copy is ciphertext" : "optional — encrypts the repo copy"}">
        <p class="hint">Stored <b>nowhere</b> — re-enter it after every page load. With it set, the repo
        holds <b>only ciphertext</b> (AES-GCM&nbsp;256, PBKDF2-SHA256 · 310k). Forgetting it makes the
        <b>remote</b> backups unreadable — local data is unaffected. Empty → plaintext, as before.</p>
        <div class="sync-row">
          <button type="button" class="sch-tbtn" data-s="save">💾 Save</button>
          <button type="button" class="sch-tbtn" data-s="pull">⭳ Pull</button>
          <button type="button" class="sch-tbtn" data-s="push">⭱ Push</button>
          <button type="button" class="sch-tbtn danger" data-s="force">Force push</button>
          <button type="button" class="sch-tbtn danger" data-s="forget">Forget token</button>
          ${sess.pass ? '<button type="button" class="sch-tbtn" data-s="pass-clear">Clear passphrase</button>' : ""}
          <button type="button" class="sch-tbtn" data-s="close">✕ Close</button>
        </div>
        <div class="sync-status" id="sync-status">${esc(st.lastMsg)}</div>
        <p class="hint"><b>Auto-sync:</b> ${autoOn()
          ? "on — every change is pushed " + (AUTO_MS / 1000) + " s after the last one of a burst, as one commit."
          : esc(autoReason())}</p>
        <hr class="sync-hr">
        <h3>🔒 Scheduler lock ${lk ? '<span class="sync-tok-note">— code active ✓</span>' : ""}</h3>
        <p class="hint">Privacy curtain for shared screens — local data is <b>NOT</b> encrypted;
        use the sync passphrase above for real encryption of the cloud copy.</p>
        ${lk ? `
        <label>Current code</label>
        <input id="lock-old" type="password" autocomplete="off" placeholder="needed to change or remove">
        <label>New code</label>
        <input id="lock-new" type="password" autocomplete="off" placeholder="min 4 characters">` : `
        <label>Access code</label>
        <input id="lock-new" type="password" autocomplete="off" placeholder="asked before the Scheduler opens (min 4 chars)">`}
        <label class="sync-chk"><input type="checkbox" id="lock-pair" ${lk && lk.pair ? "checked" : ""}>
          use the same secret as the sync encryption passphrase — one thing to remember;
          unlocking the curtain then also arms the session encryption key</label>
        <div class="sync-row">
          ${lk
            ? `<button type="button" class="sch-tbtn" data-s="lock-change">Change code</button>
               <button type="button" class="sch-tbtn danger" data-s="lock-remove">Remove code</button>`
            : `<button type="button" class="sch-tbtn" data-s="lock-set">Set code</button>`}
        </div>
        <div class="sync-status" id="lock-status">${esc(st.lockMsg)}</div>
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
    const p = fieldPass();
    if (p) armPass(p); /* memory only — renderPop() below clears the field */
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
  /* Curtain boot is independent of SchedStore — the veil must exist BEFORE the
     scheduler tab is ever opened. Data ops keep running under it.            */
  function lockBoot() {
    injectCss();
    try { sess.unlocked = sessionStorage.getItem(LOCK_OPEN) === "1"; } catch (e) { sess.unlocked = false; }
    if (veilNeeded()) mountVeil();
    const tab = $("tab-scheduler");
    if (tab) tab.addEventListener("click", () => {
      if (veilNeeded()) {
        mountVeil();
        const i = $("sch-lockcode");
        if (i) setTimeout(() => i.focus(), 60);
      }
    });
  }

  async function boot() {
    if (!window.SchedStore) { setTimeout(boot, 400); return; }
    await window.SchedStore.ready();
    st.dirty = parseInt(lsGet(DIRTY_KEY), 10) || 0;
    window.SchedStore.subscribe(() => {
      if (st.applying) return;
      setDirty(st.dirty + 1);
      autoSchedule();                 // Round 12b — every mutation re-arms the 5 s debounce
    });
    if (configured()) doPull(false); // silent: applies only when no local changes
    /* changes that survived a reload without ever being pushed still owe a
       push — arm the same timer instead of waiting for the next keystroke */
    if (st.dirty > 0) autoSchedule(); else hint();
    armMount();
  }
  /* mountTools() (scheduler tab open) REPLACES #sch-tools' innerHTML — wait for
     it before inserting the Sync button, or it would be wiped. */
  function armMount() {
    const host = $("sch-tools");
    if (host && host._schTools) { mount(); refreshBtn(); return; }
    setTimeout(armMount, 600);
  }
  lockBoot();
  boot();
})();
