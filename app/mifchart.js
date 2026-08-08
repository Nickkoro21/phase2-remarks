"use strict";
/* MIF Progress Chart — one interactive step-chart per category.
   X = training sections (T-6A or F/S track), Y = desired MIF code (E, 0-3).
   Multi-select items -> one coloured step line each. Single item + minimums
   dataset -> per-section minimum counts (n / running total) and level-up
   annotations ("0->1: 3 - 1->2: 4 - Total: 7").
   Self-contained: injects its own DOM and styles (no index.html/styles.css edits). */

(() => {
  const PALETTE = ["#58b0ff", "#46d19a", "#ffb454", "#c792ea", "#ff7a70", "#3fd0c9", "#ffd166", "#9d8cff"];
  const LEVELS = ["E", "0", "1", "2", "3"];
  const lvlY = (code) => LEVELS.indexOf(String(code)); // -1 if unknown

  const st = {
    open: false, category: null, track: "t6a",
    selected: new Set(), mif: {}, minimums: undefined, // undefined = not fetched
  };
  const $id = (x) => document.getElementById(x);
  const esc = (s) => { const d = document.createElement("div"); d.textContent = s ?? ""; return d.innerHTML; };

  /* ── styles ── */
  const CSS = `
  .mc-modal{position:fixed;inset:0;background:rgba(5,10,18,.78);display:flex;align-items:center;justify-content:center;z-index:60}
  .mc-modal.hidden{display:none}
  .mc-box{background:var(--panel);border:1px solid var(--line);border-radius:12px;width:min(1240px,96vw);max-height:92vh;display:flex;flex-direction:column;box-shadow:0 18px 60px rgba(0,0,0,.55)}
  .mc-head{display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid var(--line);flex-wrap:wrap}
  .mc-head h3{font-size:15px;margin-right:auto}
  .mc-body{padding:12px 16px 16px;overflow:auto}
  .mc-ctl{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:10px}
  .mc-btn{background:transparent;border:1px solid var(--line);color:var(--muted);border-radius:7px;padding:4px 11px;font-size:12px;cursor:pointer}
  .mc-btn:hover{border-color:var(--accent);color:var(--text)}
  .mc-btn.on{background:var(--accent-soft);border-color:var(--accent);color:var(--accent)}
  .mc-dd{position:relative}
  .mc-dd-list{position:absolute;top:calc(100% + 4px);left:0;z-index:5;background:var(--panel-2);border:1px solid var(--line);border-radius:8px;max-height:300px;overflow:auto;min-width:320px;box-shadow:0 10px 30px rgba(0,0,0,.5);padding:6px}
  .mc-dd-list label{display:flex;gap:8px;align-items:center;padding:4px 8px;border-radius:6px;font-size:12.5px;cursor:pointer;color:var(--text)}
  .mc-dd-list label:hover{background:var(--accent-soft)}
  .mc-dd-list input{accent-color:var(--accent)}
  .mc-svg-wrap{overflow-x:auto;border:1px solid var(--line);border-radius:10px;background:rgba(11,17,27,.5)}
  .mc-steps{font-family:Consolas,monospace;font-size:12.5px;color:var(--warn);margin:10px 2px 0}
  .mc-legend{display:flex;gap:14px;flex-wrap:wrap;margin-top:8px}
  .mc-leg{display:inline-flex;gap:6px;align-items:center;font-size:11.5px;color:var(--muted)}
  .mc-leg i{width:14px;height:3px;border-radius:2px;display:inline-block}
  .mc-si{margin-top:14px}
  .mc-si h4{color:var(--accent);font-size:11.5px;text-transform:uppercase;letter-spacing:.7px;margin-bottom:6px}
  .mc-si li{font-size:12.5px;color:var(--text);margin-bottom:6px;line-height:1.5}
  .mc-si .pg{color:var(--muted);font-family:Consolas,monospace;font-size:11px}
  .mc-hint{color:var(--muted);font-size:12px}
  `;

  function ensureDom() {
    if ($id("mc-modal")) return;
    const style = document.createElement("style");
    style.textContent = CSS;
    document.head.appendChild(style);
    const wrap = document.createElement("div");
    wrap.id = "mc-modal";
    wrap.className = "mc-modal hidden";
    wrap.innerHTML = `
      <div class="mc-box">
        <div class="mc-head">
          <h3 id="mc-title">MIF Progress</h3>
          <div class="mc-dd">
            <button class="mc-btn" id="mc-items-btn">Items ▾</button>
            <div class="mc-dd-list hidden" id="mc-items-list"></div>
          </div>
          <button class="mc-btn" id="mc-track">Track: T-6A</button>
          <button class="mc-btn" id="mc-close">✕ Close</button>
        </div>
        <div class="mc-body">
          <div class="mc-svg-wrap" id="mc-svg-wrap"></div>
          <div class="mc-steps" id="mc-steps"></div>
          <div class="mc-legend" id="mc-legend"></div>
          <div class="mc-legend" id="mc-src"></div>
          <div class="mc-si" id="mc-si"></div>
        </div>
      </div>`;
    document.body.appendChild(wrap);
    wrap.addEventListener("click", (e) => { if (e.target === wrap) close(); });
    $id("mc-close").onclick = close;
    $id("mc-track").onclick = () => { st.track = st.track === "t6a" ? "fs" : "t6a"; $id("mc-track").textContent = `Track: ${st.track === "t6a" ? "T-6A" : "F/S"}`; render(); };
    $id("mc-items-btn").onclick = (e) => { e.stopPropagation(); $id("mc-items-list").classList.toggle("hidden"); };
    document.addEventListener("click", (e) => { if (!e.target.closest(".mc-dd")) $id("mc-items-list")?.classList.add("hidden"); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && st.open) close(); });
  }

  function close() { st.open = false; $id("mc-modal").classList.add("hidden"); }

  async function loadMifData() {
    for (const t of ["t6a", "fs"]) {
      if (!st.mif[t]) {
        const r = await fetch(`../data/mif/${t}.json`, { cache: "no-store" });
        st.mif[t] = await r.json();
      }
    }
  }
  async function loadMinimums() {
    if (st.minimums !== undefined) return;
    try {
      const r = await fetch("../data/minimums.json", { cache: "no-store" });
      st.minimums = r.ok ? await r.json() : null;
    } catch (e) { st.minimums = null; }
  }

  /* Rows of a category on the active track: [{key, name, sn, codes:{unit:code}, units:[...]}] */
  function catTables() {
    return (st.mif[st.track]?.tables || []).filter((t) => t.category === st.category);
  }
  function catRows() {
    const rows = [];
    for (const t of catTables()) {
      const units = (t.columns || []).map((c) => c.unit);
      for (const r of t.items || []) {
        let row = rows.find((x) => x.sn === r.sn && x.name === r.name);
        if (!row) { row = { key: `${r.sn}|${r.name}`, sn: r.sn, name: r.name, codes: {}, units: [] }; rows.push(row); }
        row.units.push(...units);
        for (const u of units) row.codes[u] = r.codes?.[u] ?? null;
      }
    }
    return rows;
  }
  function allUnits() {
    const units = [];
    for (const t of catTables()) for (const c of t.columns || []) units.push(c.unit);
    return units;
  }

  /* minimums lookup: section unit -> min count for a row (by sn or name) */
  function minFor(row, unit) {
    const cat = st.minimums?.categories?.[st.category];
    const sec = cat?.sections?.[unit];
    if (!sec) return null;
    const list = sec.maneuvers || sec;
    if (!Array.isArray(list)) return null;
    const hit = list.find((m) => m.mif_sn === row.sn ||
      (m.mif_row && String(m.mif_row).toLowerCase() === String(row.name).toLowerCase()) ||
      (m.name && m.name.toLowerCase() === String(row.name).toLowerCase()));
    if (hit) return { n: hit.min_number, verbatim: hit.verbatim, shared: false };
    // Requirement SETS (user ruling): e.g. "ILS or LOC final approach" — either member covers it.
    const grp = list.find((m) => Array.isArray(m.mif_sn_group) && m.mif_sn_group.includes(row.sn));
    return grp ? { n: grp.min_number, verbatim: grp.verbatim, shared: true, label: grp.name } : null;
  }

  async function loadAux() {
    if (!st.manifest) {
      const r = await fetch("../data/manifest.json", { cache: "no-store" });
      st.manifest = await r.json();
    }
  }
  async function loadCrit(cat) {
    st.crit = st.crit || {};
    if (!st.crit[cat]) {
      const r = await fetch(`../data/criteria/${cat}.json`, { cache: "no-store" });
      st.crit[cat] = await r.json();
    }
    return st.crit[cat];
  }
  function manifestItems() { return st.manifest?.items || st.manifest?.criteria_items || []; }
  function itemIdForSn(cat, sn) {
    const hit = manifestItems().find((i) => i.category === cat && (i.numbers || []).includes(sn));
    return hit?.id ?? null;
  }
  /* Items whose standard originates in another category (e.g. Instrument Landing -> Contact):
     offer a one-click jump to the source category's line. */
  async function sourceChips(row) {
    try {
      await loadAux();
      const iid = itemIdForSn(st.category, row.sn);
      if (!iid) return [];
      const crit = await loadCrit(st.category);
      const item = (crit.items || []).find((x) => x.id === iid);
      if (!item) return [];
      const ids = new Set();
      const ep = item.expected_performance || {};
      for (const sc of ep.resolved?.sources || []) {
        if (sc?.item && !String(sc.item).startsWith(st.category)) ids.add(sc.item);
      }
      const rt = ep.specific_criteria?.reference_target;
      if (rt && !String(rt).startsWith(st.category)) ids.add(rt);
      const out = [];
      for (const id of ids) {
        const mi = manifestItems().find((i) => i.id === id);
        if (mi && (mi.numbers || []).length) out.push({ label: mi.name, cat: mi.category, sn: mi.numbers[0] });
      }
      return out;
    } catch (e) { return []; }
  }

  function renderSourceChips(rows) {
    const box = $id("mc-src");
    box.innerHTML = "";
    if (rows.length !== 1) return;
    sourceChips(rows[0]).then((chips) => {
      if (!chips.length) return;
      box.innerHTML = `<span class="mc-hint">Standard originates from:</span>` + chips.map((c, i) =>
        `<button class="mc-btn" data-i="${i}">${esc(c.label)} (${esc(c.cat.replace("_", " "))}) →</button>`).join("");
      box.querySelectorAll("button").forEach((b) => {
        b.onclick = () => { const c = chips[Number(b.dataset.i)]; window.openMifChart(c.cat, c.sn); };
      });
    });
  }

  function itemPicker() {
    const list = $id("mc-items-list");
    const rows = catRows();
    list.innerHTML = rows.map((r) => `
      <label><input type="checkbox" data-k="${esc(r.key)}" ${st.selected.has(r.key) ? "checked" : ""}>
      <span>#${esc(String(r.sn ?? "—"))} ${esc(r.name)}</span></label>`).join("");
    list.querySelectorAll("input").forEach((cb) => {
      cb.onchange = () => { cb.checked ? st.selected.add(cb.dataset.k) : st.selected.delete(cb.dataset.k); render(); };
    });
  }

  function render() {
    const rows = catRows().filter((r) => st.selected.has(r.key));
    const units = allUnits();
    const W = Math.max(720, 90 * units.length + 140), H = 320;
    const x0 = 60, y0 = 34, yStep = (H - 96) / (LEVELS.length - 1);
    const X = (i) => x0 + 40 + i * 90;
    const Y = (li) => H - 62 - li * yStep;

    const cs = getComputedStyle(document.documentElement);
    const cLine = (cs.getPropertyValue("--line") || "#29405c").trim();
    const cMuted = (cs.getPropertyValue("--muted") || "#93a7bd").trim();
    let svg = `<svg width="${W}" height="${H}" font-family="Consolas,monospace">`;
    for (let li = 0; li < LEVELS.length; li++) {
      svg += `<line x1="${x0}" y1="${Y(li)}" x2="${W - 20}" y2="${Y(li)}" stroke="${cLine}" stroke-width="1" stroke-dasharray="2 5"/>
        <text x="${x0 - 16}" y="${Y(li) + 4}" fill="${cMuted}" font-size="12" text-anchor="middle">${LEVELS[li]}</text>`;
    }
    units.forEach((u, i) => {
      svg += `<text x="${X(i)}" y="${H - 30}" fill="${cMuted}" font-size="10.5" text-anchor="end" transform="rotate(-28 ${X(i)} ${H - 30})">${esc(u)}</text>`;
    });

    rows.forEach((row, ri) => {
      const color = PALETTE[ri % PALETTE.length];
      let d = "";
      let prev = null; // { i, li }
      units.forEach((u, i) => {
        const li = lvlY(row.codes[u]);
        if (li < 0) { prev = null; return; }
        const px = X(i), py = Y(li);
        if (prev === null) d += ` M ${px} ${py}`;
        else if (prev.li === li) d += ` H ${px}`;
        else { const mx = (X(prev.i) + px) / 2; d += ` H ${mx} V ${py} H ${px}`; }
        svg += `<circle cx="${px}" cy="${py}" r="4.5" fill="${color}"><title>${esc(row.name)} @ ${esc(u)} — MIF ${esc(String(row.codes[u]))}</title></circle>`;
        prev = { i, li };
      });
      svg += `<path d="${d}" fill="none" stroke="${color}" stroke-width="2.5" opacity="0.9"/>`;
    });

    // single-item: min-count bubbles + level-up steps
    let stepsTxt = "";
    if (rows.length === 1) {
      const row = rows[0];
      if (st.minimums === null) {
        stepsTxt = `<span class="mc-hint">Minimum-numbers dataset not available yet.</span>`;
      } else {
        let cum = 0, hasAny = false, sharedSeen = false;
        const stepParts = []; let prevLvl = null, stepSum = 0;
        units.forEach((u, i) => {
          const m = minFor(row, u);
          const n = m?.n;
          if (n != null) { cum += n; hasAny = true; if (m.shared) sharedSeen = true; }
          const li = lvlY(row.codes[u]);
          if (li >= 0 && n != null) {
            const star = m.shared ? "*" : "";
            svg += `<text x="${X(i)}" y="${Y(li) - 12}" fill="#ffb454" font-size="10.5" text-anchor="middle">${n}${star} · Σ${cum}<title>${esc(m.label || "")}</title></text>`;
          }
          if (li >= 0) {
            if (n != null) stepSum += n;
            if (prevLvl !== null && li > prevLvl) {
              if (stepSum > 0) stepParts.push(`${LEVELS[prevLvl]}→${LEVELS[li]}: ${stepSum}`);
              svg += `<line x1="${X(i)}" y1="${y0}" x2="${X(i)}" y2="${H - 56}" stroke="#ffd166" stroke-width="1" stroke-dasharray="3 4" opacity="0.6"/>`;
              stepSum = 0;
            }
            prevLvl = li;
          }
        });
        if (hasAny && stepParts.length) {
          stepsTxt = `Level-up: ${stepParts.join(" · ")} · Total: ${stepParts.reduce((s, p) => s + Number(p.split(": ")[1]), 0)}`;
          if (sharedSeen) stepsTxt += ` <span class="mc-hint">— * shared requirement set (either member of the pair covers it)</span>`;
        }
        else if (!hasAny) stepsTxt = `<span class="mc-hint">No measurable minimum numbers for this item.</span>`;
      }
    } else if (rows.length > 1) {
      stepsTxt = `<span class="mc-hint">Select a single item to see minimum-execution counts and level-up totals.</span>`;
    } else {
      stepsTxt = `<span class="mc-hint">Pick one or more items from the Items menu.</span>`;
    }
    svg += `</svg>`;
    $id("mc-svg-wrap").innerHTML = svg;
    $id("mc-steps").innerHTML = stepsTxt;
    $id("mc-legend").innerHTML = rows.map((r, i) =>
      `<span class="mc-leg"><i style="background:${PALETTE[i % PALETTE.length]}"></i>#${esc(String(r.sn ?? "—"))} ${esc(r.name)}</span>`).join("");
    renderSpecial(rows);
    renderSourceChips(rows);
  }

  function renderSpecial(rows) {
    const box = $id("mc-si");
    const cat = st.minimums?.categories?.[st.category];
    if (!cat?.special_instructions?.length) { box.innerHTML = ""; return; }
    const names = rows.map((r) => String(r.name).toLowerCase());
    const match = (si) => !si.maneuvers?.length || si.maneuvers.some((m) =>
      names.some((n) => n.includes(String(m).toLowerCase()) || String(m).toLowerCase().includes(n)));
    const rel = cat.special_instructions.filter((si) => si.measurable !== false && (!rows.length || match(si)));
    const rest = cat.special_instructions.filter((si) => !rel.includes(si));
    const li = (si) => `<li>${esc(si.verbatim)} <span class="pg">p.${esc(String(si.page_pdf ?? "?"))}</span></li>`;
    box.innerHTML = `
      ${rel.length ? `<h4>Special instructions — related</h4><ul>${rel.map(li).join("")}</ul>` : ""}
      ${rest.length ? `<details><summary class="mc-hint">All category special instructions (${rest.length})</summary><ul>${rest.map(li).join("")}</ul></details>` : ""}`;
  }

  window.openMifChart = async (category, itemSn) => {
    ensureDom();
    st.category = category;
    st.open = true;
    $id("mc-modal").classList.remove("hidden");
    $id("mc-title").textContent = `MIF Progress — ${category.replace("_", " ")}`;
    await loadMifData();
    await loadMinimums();
    st.selected = new Set();
    if (itemSn != null) {
      for (const r of catRows()) if (r.sn === itemSn || (Array.isArray(itemSn) && itemSn.includes(r.sn))) st.selected.add(r.key);
    }
    itemPicker();
    render();
  };
})();
