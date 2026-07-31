"use strict";

const REPO = "Nickkoro21/phase2-remarks";

const CAT_LABELS = {
  contact: { name: "Contact" },
  instrument: { name: "Instrument" },
  formation: { name: "Formation" },
  vfr_navigation: { name: "VFR Navigation" },
};
const VARIANT_LABELS = {
  technique: "Technique",
  human_factor: "Human factor",
  marginal: "Marginal @ MIF",
  above: "Above MIF",
};

const state = {
  master: null,
  category: null,
  item: null,      // master index entry
  itemData: null,  // loaded item file
  row: null,       // selected mif_row name or null
  desired: null,
  achieved: null,
  criteriaCache: {},  // category -> criteria json
};

const $ = (id) => document.getElementById(id);

async function init() {
  try {
    const res = await fetch("../data/observations/master_index.json", { cache: "no-store" });
    state.master = await res.json();
    $("databadge").textContent =
      `${state.master.totals.observations} observations · ${state.master.totals.items} items · index ${state.master.generated_at}`;
    renderCategories();
  } catch (e) {
    $("databadge").textContent = "no index";
    $("cat-grid").innerHTML =
      `<p class="hint">master_index.json not found.<br>Run <code>python tools/build_index.py</code> and refresh.</p>`;
  }
}

function renderCategories() {
  const grid = $("cat-grid");
  grid.innerHTML = "";
  for (const [key, label] of Object.entries(CAT_LABELS)) {
    const cat = state.master.categories[key];
    const n = cat ? cat.items.length : 0;
    const obs = cat ? cat.observations : 0;
    const btn = document.createElement("button");
    btn.className = "cat-card" + (n === 0 ? " empty" : "");
    btn.innerHTML = `<strong>${label.name}</strong>
      <span class="cat-count">${n ? `${n} items · ${obs} remarks` : "generation pending…"}</span>`;
    btn.onclick = () => selectCategory(key, btn);
    grid.appendChild(btn);
  }
}

function selectCategory(key, btn) {
  document.querySelectorAll(".cat-card").forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  state.category = key;
  state.item = state.itemData = state.row = state.desired = state.achieved = null;
  $("item-search").disabled = false;
  $("item-search").value = "";
  $("item-info-btn").classList.add("hidden");
  renderItems();
  renderCodes();
  renderResults();
}

function renderItems() {
  const list = $("item-list");
  list.innerHTML = "";
  const cat = state.master.categories[state.category];
  if (!cat || !cat.items.length) {
    list.innerHTML = `<p class="hint">No remarks generated for this category yet — re-run build_index.py later.</p>`;
    return;
  }
  const q = $("item-search").value.trim().toLowerCase();
  const norm = (s) => s.normalize("NFKD").toLowerCase();
  for (const it of cat.items) {
    if (q && !norm(it.item_name).includes(q) && !it.item_id.includes(q)) continue;
    const btn = document.createElement("button");
    btn.className = "item-btn" + (state.item?.item_id === it.item_id ? " active" : "");
    const sn = it.mif_numbers.length ? it.mif_numbers.join(",") : "—";
    btn.innerHTML = `<span class="sn">#${sn}</span>${it.item_name}<span class="obs-n">${it.observations}</span>`;
    btn.onclick = () => selectItem(it, btn);
    list.appendChild(btn);
  }
  if (!list.children.length) list.innerHTML = `<p class="hint">No items match.</p>`;
}

async function selectItem(it, btn) {
  document.querySelectorAll(".item-btn").forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  state.item = it;
  state.row = state.desired = state.achieved = null;
  state.itemData = null;
  $("item-info-btn").classList.remove("hidden");
  renderCodes();
  renderResults();
  try {
    const path = it.v2_file ? `../data/observations2/${it.v2_file}` : `../data/observations/${it.file}`;
    const res = await fetch(path, { cache: "no-store" });
    const data = await res.json();
    state.itemData = data.schema === "v2-trunk" ? expandV2(data) : data;
  } catch (e) {
    $("results").innerHTML = `<p class="hint">Failed to load ${it.file}.</p>`;
    return;
  }
  // Default row: first with data, or null when single/none
  const rows = rowsWithData();
  state.row = rows.length > 1 ? rows[0] : (rows[0] ?? null);
  renderCodes();
  renderResults();
}

/* v2-trunk: expand error modes into the flat observations shape the UI consumes.
   Below MIF -> the mode's text for the achieved level; at MIF -> marginal; above -> positive + closing. */
function expandV2(data) {
  const obs = [];
  const rowName = (v) => {
    if (v == null) return null;
    if (typeof v === "number") {
      const r = (data.mif_rows || []).find((x) => x.sn === v);
      return r ? r.row_name : String(v);
    }
    return v;
  };
  for (const m of data.error_modes || []) {
    m.mif_row = rowName(m.mif_row);
    for (let d = 0; d <= 3; d++) {
      for (let a = 0; a <= 4; a++) {
        let text, variant;
        if (a < d) {
          text = m.texts?.[String(a)];
          variant = m.hf_concept ? "human_factor" : "technique";
        } else if (a === d) {
          text = m.texts?.marginal || m.texts?.[String(a)];
          variant = "marginal";
        } else {
          const base = m.texts?.[String(a)];
          text = base ? base.replace(/\s+$/, "") + " Above end of block MIF achieved." : null;
          variant = "above";
        }
        if (!text) continue;
        obs.push({
          id: `${m.id}-d${d}a${a}`,
          mif_row: m.mif_row ?? null,
          desired: d, achieved: a, variant,
          hf_concept: m.hf_concept ?? null,
          mode: m.label ?? null,
          text,
        });
      }
    }
  }
  return { ...data, observations: obs };
}

function rowsWithData() {
  if (!state.itemData) return [];
  const set = new Set();
  for (const o of state.itemData.observations) if (o.mif_row) set.add(o.mif_row);
  return [...set];
}

function obsPool() {
  if (!state.itemData) return [];
  return state.itemData.observations.filter((o) => (o.mif_row ?? null) === (state.row ?? null));
}

function renderCodes() {
  const rows = rowsWithData();
  const wrap = $("row-select-wrap");
  if (rows.length > 1) {
    wrap.classList.remove("hidden");
    const sel = $("row-select");
    sel.innerHTML = rows.map((r) => `<option${r === state.row ? " selected" : ""}>${r}</option>`).join("");
    sel.onchange = () => { state.row = sel.value; state.desired = state.achieved = null; renderCodes(); renderResults(); };
  } else {
    wrap.classList.add("hidden");
  }

  const pool = obsPool();
  const desiredSet = new Set(pool.map((o) => o.desired));
  const dWrap = $("desired-chips");
  dWrap.innerHTML = "";
  if (!state.itemData) { dWrap.innerHTML = `<p class="hint">—</p>`; }
  else {
    for (let d = 0; d <= 3; d++) {
      const b = document.createElement("button");
      b.className = "chip" + (state.desired === d ? " active" : "");
      b.textContent = d;
      b.disabled = !desiredSet.has(d);
      b.onclick = () => { state.desired = d; state.achieved = null; renderCodes(); renderResults(); };
      dWrap.appendChild(b);
    }
  }

  const aWrap = $("achieved-chips");
  aWrap.innerHTML = "";
  if (state.desired === null) { aWrap.innerHTML = `<p class="hint">Select the desired code first.</p>`; }
  else {
    const achievedSet = new Set(pool.filter((o) => o.desired === state.desired).map((o) => o.achieved));
    for (let a = 0; a <= 4; a++) {
      const b = document.createElement("button");
      b.className = "chip" + (state.achieved === a ? " active" : "");
      b.textContent = a;
      b.disabled = !achievedSet.has(a);
      b.onclick = () => { state.achieved = a; renderCodes(); renderResults(); };
      aWrap.appendChild(b);
    }
  }
}

function prefixFor(o) {
  let sn = "—";
  if (o.mif_row && state.itemData.mif_rows) {
    const row = state.itemData.mif_rows.find((r) => r.row_name === o.mif_row);
    if (row && row.sn != null) sn = row.sn;
  } else if (state.itemData.mif_numbers?.length) {
    sn = state.itemData.mif_numbers[0];
  }
  return `#${sn}. (${o.desired}) → (${o.achieved}):`;
}

function feedbackUrl(o) {
  const title = `Feedback: ${o.id}`;
  const body = [
    `**Observation id:** \`${o.id}\``,
    `**Item:** ${state.itemData.item_name} (${state.category}${o.mif_row ? ` · ${o.mif_row}` : ""})`,
    `**Codes:** desired (${o.desired}) → achieved (${o.achieved}) · variant: ${o.variant}`,
    ``,
    `> ${o.text}`,
    ``,
    `**What is wrong / suggested correction:**`,
    ``,
  ].join("\n");
  return `https://github.com/${REPO}/issues/new?title=${encodeURIComponent(title)}&labels=feedback&body=${encodeURIComponent(body)}`;
}

function renderResults() {
  const box = $("results");
  $("result-count").textContent = "";
  if (!state.itemData || state.desired === null || state.achieved === null) {
    box.innerHTML = `<p class="hint">${state.itemData
      ? "Select the desired and the achieved code."
      : "Pick a category, an item and the codes to see the available remarks."}</p>`;
    return;
  }
  const hits = obsPool().filter((o) => o.desired === state.desired && o.achieved === state.achieved);
  if (!hits.length) {
    box.innerHTML = `<p class="hint">No remark available for the combination (${state.desired}) → (${state.achieved}).</p>`;
    return;
  }
  $("result-count").textContent = `${hits.length} available`;
  box.innerHTML = "";
  for (const o of hits) {
    const card = document.createElement("div");
    card.className = `obs-card v-${o.variant}`;
    const prefix = prefixFor(o);
    const full = `${prefix} ${o.text}`;
    card.innerHTML = `
      <div class="obs-head">
        <span class="obs-prefix">${prefix}</span>
        <span class="badge">${VARIANT_LABELS[o.variant] ?? o.variant}</span>
        ${o.mode ? `<span class="badge mode">${esc(o.mode)}</span>` : ""}
        ${o.hf_concept ? `<span class="badge hf">${o.hf_concept}</span>` : ""}
        <a class="fb-btn" href="${feedbackUrl(o)}" target="_blank" rel="noopener" title="Report an error or suggest a correction for this remark">Feedback</a>
        <button class="copy-btn">Copy</button>
      </div>
      <p class="obs-text"></p>`;
    card.querySelector(".obs-text").textContent = o.text;
    const cbtn = card.querySelector(".copy-btn");
    cbtn.onclick = async () => {
      try {
        await navigator.clipboard.writeText(full);
        cbtn.textContent = "Copied ✓"; cbtn.classList.add("copied");
        setTimeout(() => { cbtn.textContent = "Copy"; cbtn.classList.remove("copied"); }, 1600);
      } catch { /* clipboard blocked over http — select fallback */
        const r = document.createRange(); r.selectNodeContents(card.querySelector(".obs-text"));
        const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      }
    };
    box.appendChild(card);
  }
}

/* ── Item info modal ─────────────────────────────────────── */

async function loadCriteria(cat) {
  if (state.criteriaCache[cat]) return state.criteriaCache[cat];
  const res = await fetch(`../data/criteria/${cat}.json`, { cache: "no-store" });
  const data = await res.json();
  state.criteriaCache[cat] = data;
  return data;
}

function esc(s) {
  const d = document.createElement("div");
  d.textContent = s ?? "";
  return d.innerHTML;
}

function specTableHtml(params, sourceTag) {
  if (!params || !params.length) return "";
  const rows = params.map((p) => `
    <tr>
      <td>${esc(p.maneuver ? p.maneuver + " — " : "")}${esc(p.parameter)}</td>
      <td class="num">${esc(p.code_1_raw ?? "")}</td>
      <td class="num">${esc(p.code_3_raw ?? "")}</td>
      <td class="prov">${esc(p.override_note ? "override" : (p.provenance && sourceTag ? `std: ${p.provenance}` : ""))}</td>
    </tr>`).join("");
  return `
    <table class="spec-table">
      <thead><tr><th>Parameter</th><th>Code 1</th><th>Code 3</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="spec-note">Code 2 = between 1 and 3 · Code 4 = better than 3 · Code 0 = beyond 1 or IP intervention.</p>`;
}

async function showInfo() {
  if (!state.item || !state.category) return;
  const modal = $("info-modal");
  const body = $("info-body");
  $("info-title").textContent = `${state.item.item_name}`;
  body.innerHTML = `<p class="hint">Loading criteria…</p>`;
  modal.classList.remove("hidden");
  let criteria;
  try {
    criteria = await loadCriteria(state.category);
  } catch (e) {
    body.innerHTML = `<p class="hint">Failed to load criteria for ${state.category}.</p>`;
    return;
  }
  const item = (criteria.items || []).find((i) => i.id === state.item.item_id);
  if (!item) {
    body.innerHTML = `<p class="hint">No criteria entry found for ${state.item.item_id}.</p>`;
    return;
  }
  const ep = item.expected_performance || {};
  const sc = ep.specific_criteria || {};
  const resolved = ep.resolved || sc.resolved || item.resolved || null;

  let html = "";
  const listBlock = (title, arr) => {
    if (!arr || !arr.length) return "";
    return `<h4>${title}</h4><ul>${arr.map((x) => `<li>${esc(typeof x === "string" ? x : `${x.key ? x.key + "/ " : ""}${x.text}`)}</li>`).join("")}</ul>`;
  };
  html += listBlock("Execution", item.execution);
  html += listBlock("Conditions", item.conditions);
  html += listBlock("Expected performance — General criteria", ep.general_criteria);

  // Specific criteria: always show the actual values (own table, or resolved values inline)
  if (sc.kind === "table" && sc.parameters?.length) {
    html += `<h4>Expected performance — Specific criteria</h4>` + specTableHtml(sc.parameters, false);
  } else if (resolved && resolved.parameters?.length) {
    html += `<h4>Expected performance — Specific criteria</h4>` + specTableHtml(resolved.parameters, true);
  } else {
    html += `<h4>Expected performance — Specific criteria</h4>
      <p class="hint">Qualitative item — graded against the General criteria (no numeric standards).</p>`;
  }
  body.innerHTML = html;
}

$("item-info-btn").onclick = showInfo;
$("info-close").onclick = () => $("info-modal").classList.add("hidden");
$("info-modal").onclick = (e) => { if (e.target === $("info-modal")) $("info-modal").classList.add("hidden"); };
document.addEventListener("keydown", (e) => { if (e.key === "Escape") $("info-modal").classList.add("hidden"); });

$("item-search").addEventListener("input", renderItems);
init();
