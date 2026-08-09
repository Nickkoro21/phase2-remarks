"use strict";
/* Global remark search — find any remark text across all 117 items / all levels,
   copy it or file targeted feedback (GitHub issue prefilled with the exact
   mode id + level, so corrections land on the right record).
   Self-contained module: injects its own panel + styles into #view-remarks. */

(() => {
  const REPO = "Nickkoro21/phase2-remarks";
  const CATS = ["contact", "instrument", "formation", "vfr_navigation"];
  const LEVELS = ["0", "1", "2", "3", "4", "marginal"];
  const st = { index: null, loading: false };
  const $id = (x) => document.getElementById(x);
  const esc = (s) => { const d = document.createElement("div"); d.textContent = s ?? ""; return d.innerHTML; };

  const CSS = `
  .rs-panel{grid-column:1/-1;background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:12px 14px}
  .rs-row{display:flex;gap:10px;align-items:center}
  .rs-in{flex:1;padding:8px 12px;background:var(--panel-2);color:var(--text);border:1px solid var(--line);border-radius:8px;font-size:13.5px}
  .rs-in:focus{outline:none;border-color:var(--accent)}
  .rs-cnt{color:var(--muted);font-size:12px;white-space:nowrap}
  .rs-res{margin-top:10px;display:flex;flex-direction:column;gap:8px;max-height:46vh;overflow-y:auto}
  .rs-hit{background:var(--panel-2);border:1px solid var(--line);border-left:4px solid var(--accent);border-radius:8px;padding:9px 12px}
  .rs-head{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:5px}
  .rs-id{font-family:Consolas,monospace;font-size:12px;color:var(--accent);font-weight:700}
  .rs-txt{font-size:13px;line-height:1.55;color:var(--text)}
  .rs-txt mark{background:var(--accent-soft);color:var(--accent);padding:0 2px;border-radius:3px}
  .rs-btn{margin-left:auto;background:transparent;border:1px solid var(--line);color:var(--muted);border-radius:7px;padding:3px 9px;font-size:11.5px;cursor:pointer;text-decoration:none}
  .rs-btn:hover{color:var(--text);border-color:var(--accent)}
  .rs-btn+.rs-btn{margin-left:6px}
  `;

  function ensureDom() {
    if ($id("rs-panel")) return;
    const style = document.createElement("style");
    style.textContent = CSS;
    document.head.appendChild(style);
    const panel = document.createElement("section");
    panel.className = "rs-panel";
    panel.id = "rs-panel";
    panel.innerHTML = `
      <div class="rs-row">
        <span class="step">🔎</span>
        <input type="search" id="rs-in" class="rs-in" autocomplete="off"
               placeholder="Search ALL remarks (min. 3 characters) — find the one that needs a correction, copy it or file feedback…">
        <span class="rs-cnt" id="rs-cnt"></span>
      </div>
      <div class="rs-res" id="rs-res"></div>`;
    const view = $id("view-remarks");
    view.insertBefore(panel, view.firstChild);
    let t = null;
    $id("rs-in").addEventListener("input", () => { clearTimeout(t); t = setTimeout(run, 300); });
  }

  async function buildIndex() {
    if (st.index || st.loading) return;
    st.loading = true;
    $id("rs-cnt").textContent = "indexing…";
    const idx = [];
    try {
      const master = await (await fetch("../data/observations/master_index.json", { cache: "no-store" })).json();
      const jobs = [];
      for (const cat of CATS) {
        for (const it of master.categories[cat]?.items || []) {
          if (!it.v2_file) continue;
          jobs.push(fetch(`../data/observations2/${it.v2_file}`, { cache: "force-cache" })
            .then((r) => r.json())
            .then((d) => {
              for (const m of d.error_modes || []) {
                for (const lv of LEVELS) {
                  const txt = m.texts?.[lv];
                  if (!txt) continue;
                  idx.push({ cat, item: d.item_name, itemId: d.item_id, file: it.v2_file,
                             mode: m.label || "", modeId: m.id, level: lv, low: txt.toLowerCase(), txt });
                }
              }
            }).catch(() => {}));
        }
      }
      await Promise.all(jobs);
      st.index = idx;
    } finally { st.loading = false; }
  }

  function fbUrl(h) {
    const title = `Feedback: ${h.modeId} · level ${h.level}`;
    const body = [
      `**Mode id:** \`${h.modeId}\` · **Level:** \`${h.level}\``,
      `**Item:** ${h.item} (${h.cat}) · **File:** \`data/observations2/${h.file}\``,
      ``, `> ${h.txt}`, ``,
      `**What is wrong / suggested correction:**`, ``,
    ].join("\n");
    return `https://github.com/${REPO}/issues/new?title=${encodeURIComponent(title)}&labels=feedback&body=${encodeURIComponent(body)}`;
  }

  async function run() {
    const q = $id("rs-in").value.trim().toLowerCase();
    const res = $id("rs-res");
    if (q.length < 3) { res.innerHTML = ""; $id("rs-cnt").textContent = ""; return; }
    await buildIndex();
    if (!st.index) { $id("rs-cnt").textContent = "index unavailable"; return; }
    const terms = q.split(/\s+/);
    const hits = st.index.filter((h) => terms.every((t) => h.low.includes(t) ||
      h.mode.toLowerCase().includes(t) || h.item.toLowerCase().includes(t)));
    $id("rs-cnt").textContent = `${hits.length} of ${st.index.length}`;
    const mark = (txt) => {
      let out = esc(txt);
      for (const t of terms) {
        if (!t) continue;
        out = out.replace(new RegExp(`(${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"), "<mark>$1</mark>");
      }
      return out;
    };
    res.innerHTML = hits.slice(0, 60).map((h, i) => `
      <div class="rs-hit">
        <div class="rs-head">
          <span class="rs-id">${esc(h.modeId)}</span>
          <span class="badge">${esc(h.level === "marginal" ? "marginal" : "level " + h.level)}</span>
          <span class="badge">${esc(h.item)}</span>
          <span class="badge">${esc(h.mode)}</span>
          <a class="rs-btn" href="${fbUrl(h)}" target="_blank" rel="noopener">Feedback</a>
          <button class="rs-btn" data-copy="${i}">Copy</button>
        </div>
        <p class="rs-txt">${mark(h.txt)}</p>
      </div>`).join("") + (hits.length > 60 ? `<p class="hint">Showing first 60 — narrow the search.</p>` : "");
    res.querySelectorAll("[data-copy]").forEach((b) => {
      b.onclick = async () => {
        const h = hits[Number(b.dataset.copy)];
        try { await navigator.clipboard.writeText(h.txt); b.textContent = "Copied ✓"; setTimeout(() => (b.textContent = "Copy"), 1500); } catch (e) {}
      };
    });
  }

  ensureDom();
})();
