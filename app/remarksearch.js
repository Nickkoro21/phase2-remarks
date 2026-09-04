"use strict";
/* Global remark search — find any remark text across all 117 items / all levels,
   copy it or file targeted feedback (GitHub issue prefilled with the exact
   mode id + level, so corrections land on the right record).
   Self-contained module: injects its own panel + styles into #view-remarks. */

(() => {
  const REPO = "Nickkoro21/phase2-remarks";
  const CATS = ["contact", "instrument", "formation", "vfr_navigation"];
  const LEVELS = ["0", "1", "2", "3", "4", "marginal"];
  /* Round 26 — the bank split by RELATION (specs/observations-style.md). The same
     achieved code now has up to three records: texts[a] (below), texts_at[a] (at),
     texts_above[a] (above). All three are indexed, each labelled with the relation
     it renders under, so the Feedback issue names the key that actually produced
     the card. A legacy key that the new families have made unreachable is still
     searchable — it is in the file, an IP may well find it in an old gradesheet —
     but it is badged so nobody corrects a string the app no longer shows. */
  const AT_LEVELS = ["0", "1", "2", "3"];
  const ABOVE_LEVELS = ["1", "2", "3", "4"];
  const st = { index: null, loading: false };
  const $id = (x) => document.getElementById(x);
  /* Round 16b — the house escaper. Every call here is text content today, but
     the helper is now quote-safe so the next attribute added cannot open a hole. */
  const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ESC[c]);

  const CSS = `
  .rs-panel{grid-column:1/-1;background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:12px 14px}
  .rs-row{display:flex;gap:10px;align-items:center}
  .rs-in{flex:1;padding:8px 12px;background:var(--panel-2);color:var(--text);border:1px solid var(--line);border-radius:8px;font-size:13.5px}
  .rs-in:focus{outline:none;border-color:var(--accent)}
  .rs-cnt{color:var(--muted);font-size:12px;white-space:nowrap}
  .rs-res{margin-top:10px;display:flex;flex-direction:column;gap:8px;max-height:46vh;overflow-y:auto}
  .rs-hit{background:var(--panel-2);border:1px solid var(--line);border-left:4px solid var(--accent);border-radius:8px;padding:9px 12px}
  .rs-head{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:5px}
  /* Ruling 4 — the mode id as a discreet click-to-copy chip, the same shape
     .obs-id has in styles.css. This module owns its own rules, so the whole
     chip is defined here rather than split across two stylesheets. */
  .rs-id{font-family:Consolas,monospace;font-size:11px;color:var(--muted);
    background:var(--panel-2);border:1px solid var(--line);border-radius:6px;
    padding:1px 6px;cursor:pointer;line-height:1.6}
  .rs-id:hover{color:var(--accent);border-color:var(--accent)}
  /* :focus, not :focus-visible — the offline builder rewrites styles.css for
     Firefox 32 but not the CSS a module emits, and an unknown pseudo-class
     invalidates the whole rule there. */
  .rs-id:focus{outline:2px solid var(--accent);outline-offset:1px}
  .rs-id.copied{color:var(--good);border-color:var(--good)}
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
                const push = (txt, key, label, legacy) => {
                  if (!txt) return;
                  idx.push({ cat, item: d.item_name, itemId: d.item_id, file: it.v2_file,
                             mode: m.label || "", modeId: m.id, level: label, key,
                             legacy: !!legacy, low: txt.toLowerCase(), txt });
                };
                for (const lv of LEVELS) {
                  /* texts["3"] / texts["4"] can only ever have rendered ABOVE, and
                     texts.marginal only AT — so a family key of the same code
                     retires them. texts["0"|"1"|"2"] always keep their below role. */
                  const retired = (lv === "3" || lv === "4") ? !!m.texts_above?.[lv]
                                : (lv === "marginal") ? AT_LEVELS.every((x) => !!m.texts_at?.[x])
                                : false;
                  const role = (lv === "marginal") ? "at" : (lv === "3" || lv === "4") ? "above" : "below";
                  push(m.texts?.[lv], `texts.${lv}`,
                       lv === "marginal" ? "at · marginal" : `${role} ${lv}`, retired);
                }
                for (const lv of AT_LEVELS) push(m.texts_at?.[lv], `texts_at.${lv}`, `at ${lv}`, false);
                for (const lv of ABOVE_LEVELS) push(m.texts_above?.[lv], `texts_above.${lv}`, `above ${lv}`, false);
              }
            }).catch(() => {}));
        }
      }
      await Promise.all(jobs);
      st.index = idx;
    } finally { st.loading = false; }
  }

  function fbUrl(h) {
    const title = `Feedback: ${h.modeId} · ${h.key}`;
    const body = [
      `**Mode id:** \`${h.modeId}\` · **Record:** \`${h.key}\` · **Renders:** ${h.level}${h.legacy ? " (legacy — no longer rendered)" : ""}`,
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
    /* Round 16b — mark FIRST on the raw text with two control-character
       sentinels, escape SECOND. Marking the escaped string let a query hit the
       inside of an entity («#39» inside `&#39;`) and split it into visible junk;
       it also meant a query containing a quote or an ampersand never lit up. */
    const mark = (txt) => {
      let out = String(txt == null ? "" : txt);
      for (const t of terms) {
        if (!t) continue;
        out = out.replace(new RegExp(`(${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"), "\u0001$1\u0002");
      }
      return esc(out).replace(/\u0001/g, "<mark>").replace(/\u0002/g, "</mark>");
    };
    res.innerHTML = hits.slice(0, 60).map((h, i) => `
      <div class="rs-hit">
        <div class="rs-head">
          <button type="button" class="rs-id" data-cid="${i}" title="Copy this mode id">${esc(h.modeId)}</button>
          <span class="badge">${esc(h.level)}</span>
          ${h.legacy ? `<span class="badge">legacy</span>` : ""}
          <span class="badge">${esc(h.item)}</span>
          <span class="badge">${esc(h.mode)}</span>
          <a class="rs-btn" href="${fbUrl(h)}" target="_blank" rel="noopener">Feedback</a>
          <button class="rs-btn" data-copy="${i}">Copy</button>
        </div>
        <p class="rs-txt">${mark(h.txt)}</p>
      </div>`).join("") + (hits.length > 60 ? `<p class="hint">Showing first 60 — narrow the search.</p>` : "");
    // Ruling 4: the mode id is click-to-copy here too, same chip, same fallback.
    res.querySelectorAll("[data-cid]").forEach((b) => {
      b.onclick = async () => {
        const id = hits[Number(b.dataset.cid)].modeId, label = b.textContent;
        try {
          await navigator.clipboard.writeText(id);
          b.textContent = "copied ✓"; b.classList.add("copied");
          setTimeout(() => { b.textContent = label; b.classList.remove("copied"); }, 1200);
        } catch (e) {
          const r = document.createRange(); r.selectNodeContents(b);
          const s = getSelection(); s.removeAllRanges(); s.addRange(r);
        }
      };
    });
    res.querySelectorAll("[data-copy]").forEach((b) => {
      b.onclick = async () => {
        const h = hits[Number(b.dataset.copy)];
        try { await navigator.clipboard.writeText(h.txt); b.textContent = "Copied ✓"; setTimeout(() => (b.textContent = "Copy"), 1500); } catch (e) {}
      };
    });
  }

  ensureDom();
})();
