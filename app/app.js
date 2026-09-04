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
  /* Ruling 2 of 2026-08-29 — at-level is not a criticism. The card used to read
     "Marginal @ MIF" over a text that now states the standard was MET; the badge
     and the prose have to say the same thing. The variant KEY stays "marginal"
     (CSS .v-marginal, every downstream consumer). */
  marginal: "At MIF",
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
    $("databadge").textContent = "last revisited July 2026";
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

/* Progressive disclosure: panels open step by step */
function revealPanels() {
  $("panel-item").classList.toggle("hidden", !state.category);
  $("panel-codes").classList.toggle("hidden", !state.itemData && !state.item);
  $("panel-results").classList.toggle("hidden",
    !(state.itemData && state.desired !== null && state.achieved !== null));
}

function resetRemarks() {
  state.category = state.item = state.itemData = state.row = state.desired = state.achieved = null;
  document.querySelectorAll("#view-remarks .cat-card, #view-remarks .item-btn")
    .forEach((b) => b.classList.remove("active"));
  $("item-search").disabled = true;
  $("item-search").value = "";
  $("item-info-btn").classList.add("hidden");
  $("item-list").innerHTML = `<p class="hint">Select a category first.</p>`;
  revealPanels();
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
  revealPanels();
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
  revealPanels();
}

/* ══════════════════════════════════════════════════════════════════════════
   v2-trunk -> the flat observations shape the UI consumes.

   RELATION IS THE AXIS, NOT THE CODE  (rulings of 2026-08-29 · specs/observations-style.md)
   ──────────────────────────────────────────────────────────────────────────
   One achieved code means two opposite things depending on the desired code:
   an achieved (2) against a desired (3) is a REGRESSION; the same (2) against a
   desired (1) is an ACHIEVEMENT — the SP did better than his Training Section
   asks. Until this round both drew the SAME string out of texts["2"], so the
   above-MIF card read as a fault litany about a student who had EXCEEDED his
   stage. The ruled case is instrument-10-tm04-d1a2 ("SP, due to a delayed power
   reduction ... had to use the speed brake ... Above end of block MIF achieved.").

   The bank now carries one text family per RELATION and the composer picks by
   relation, not by code alone:

     below (a <  d) -> texts[a]         deficiency cause-effect          (BaD 3-1 §41.st)
     at    (a == d) -> texts_at[a]      standard met + cause of the minor
                                        error, NO ladder word            (§41.d, trend)
     above (a >  d) -> texts_above[a]   achievement first + ladder
                                        attribution                      (§41.d — the
                                        remark exists "to justify the very high grade")

   Every family key is OPTIONAL. A mode not yet rewritten falls back to exactly
   what it rendered before this round, so the bank is consumable at every commit
   and no id ever disappears. srcKey records WHICH key produced the text, so the
   Feedback issue lands on the record that actually rendered.

   The closing sentence is appended HERE, once, and can never be doubled.
   ══════════════════════════════════════════════════════════════════════════ */
const ABOVE_TAIL = "Above end of block MIF achieved.";
function withAboveTail(s) {
  const t = String(s).replace(/\s+$/, "");
  return t.slice(-ABOVE_TAIL.length) === ABOVE_TAIL ? t : t + " " + ABOVE_TAIL;
}

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
        let text, variant, relation, srcKey;
        const k = String(a);
        if (a < d) {
          relation = "below";
          text = m.texts?.[k];
          srcKey = `texts.${k}`;
          variant = m.hf_concept ? "human_factor" : "technique";
        } else if (a === d) {
          relation = "at";
          if (m.texts_at?.[k]) { text = m.texts_at[k]; srcKey = `texts_at.${k}`; }
          else if (m.texts?.marginal) { text = m.texts.marginal; srcKey = "texts.marginal"; }
          else { text = m.texts?.[k]; srcKey = `texts.${k}`; }
          variant = "marginal";
        } else {
          relation = "above";
          let base;
          if (m.texts_above?.[k]) { base = m.texts_above[k]; srcKey = `texts_above.${k}`; }
          else { base = m.texts?.[k]; srcKey = `texts.${k}`; }
          text = base ? withAboveTail(base) : null;
          variant = "above";
        }
        if (!text) continue;
        obs.push({
          id: `${m.id}-d${d}a${a}`,
          mif_row: m.mif_row ?? null,
          desired: d, achieved: a, variant, relation, srcKey,
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
      b.onclick = () => { state.desired = d; state.achieved = null; renderCodes(); renderResults(); revealPanels(); };
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
      b.onclick = () => { state.achieved = a; renderCodes(); renderResults(); revealPanels(); };
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
    `**Codes:** desired (${o.desired}) → achieved (${o.achieved}) · relation: ${o.relation ?? "?"} · variant: ${o.variant}`,
    /* The record to correct is the KEY that produced this text, not the code:
       after the relation split, texts["2"] and texts_above["2"] are two different
       records that both render as an achieved (2). */
    `**Record:** \`${o.srcKey ?? "texts." + o.achieved}\` in \`data/observations2/${state.category}/${state.itemData.item_id}.json\` · mode \`${o.id.replace(/-d\d+a\d+$/, "")}\``,
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
        <button type="button" class="obs-id" data-id="${esc(o.id)}" title="Copy this observation id">${esc(o.id)}</button>
        <span class="badge">${VARIANT_LABELS[o.variant] ?? o.variant}</span>
        ${o.mode ? `<span class="badge mode">${esc(o.mode)}</span>` : ""}
        ${o.hf_concept ? `<span class="badge hf">${o.hf_concept}</span>` : ""}
        <a class="fb-btn" href="${feedbackUrl(o)}" target="_blank" rel="noopener" title="Report an error or suggest a correction for this remark">Feedback</a>
        <button class="copy-btn">Copy</button>
      </div>
      <p class="obs-text"></p>`;
    card.querySelector(".obs-text").textContent = o.text;
    // Ruling 4: the id is the handle every Feedback link and every conversation
    // about a remark uses, so it is on the card and one click away from the
    // clipboard - with the same select-text fallback as Copy, because the app
    // also runs over plain http where the clipboard API is blocked.
    const idbtn = card.querySelector(".obs-id");
    idbtn.onclick = async () => {
      const label = idbtn.textContent;
      try {
        await navigator.clipboard.writeText(o.id);
        idbtn.textContent = "copied ✓"; idbtn.classList.add("copied");
        setTimeout(() => { idbtn.textContent = label; idbtn.classList.remove("copied"); }, 1200);
      } catch {
        const r = document.createRange(); r.selectNodeContents(idbtn);
        const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      }
    };
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

/* Round 16b — the house escaper. The old body was `div.textContent -> innerHTML`,
   which escapes & < > but NOT the quote characters, so any value carrying a `"`
   broke out of the attribute it was interpolated into. Same five-character map
   as currency.js / flowchart.js / scheduler.js — safe for text AND attributes. */
const ESC_HTML = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ESC_HTML[c]);
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
  const stripMarker = (t) => (t ?? "").replace(/^\s*(preamble\s*\/|[0-9]+\s*\/|[a-z]\s*\/)\s*/i, "");
  const listBlock = (title, arr) => {
    if (!arr || !arr.length) return "";
    return `<h4>${title}</h4><ul>${arr.map((x) => `<li>${esc(stripMarker(typeof x === "string" ? x : x.text))}</li>`).join("")}</ul>`;
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
  html += await mifProgressionHtml();
  html += await relatedReqHtml();
  body.innerHTML = html;
  body.querySelectorAll("[data-req]").forEach((el) => {
    el.onclick = () => {
      $("info-modal").classList.add("hidden");
      openRequirements(el.dataset.req);
    };
  });
  const chartBtn = body.querySelector("#mif-chart-btn");
  if (chartBtn) {
    chartBtn.onclick = () => {
      $("info-modal").classList.add("hidden");
      /* a backdrop click can deselect the item while the modal is still open */
      if (window.openMifChart && state.item && state.category) {
        const sns = state.item.mif_numbers || [];
        window.openMifChart(state.category, sns.length === 1 ? sns[0] : sns);
      }
    };
  }
}

/* ── MIF progression (desired code per Training Section) ── */

const mifCache = {};
async function loadMif(name) {
  if (mifCache[name]) return mifCache[name];
  const res = await fetch(`../data/mif/${name}.json`, { cache: "no-store" });
  mifCache[name] = await res.json();
  return mifCache[name];
}

async function mifProgressionHtml() {
  const it = state.item;
  if (!it || !it.mif_numbers?.length) return "";
  let html = "";
  try {
    for (const src of ["t6a", "fs"]) {
      const data = await loadMif(src);
      for (const t of data.tables || []) {
        if (t.category !== state.category) continue;
        const rows = (t.items || []).filter((r) => it.mif_numbers.includes(r.sn));
        if (!rows.length) continue;
        const units = (t.columns || []).map((c) => c.unit);
        const head = units.map((u) => `<th>${esc(u)}</th>`).join("");
        const body = rows.map((r) => `<tr><td>${esc(r.name)}</td>${units.map((u) =>
          `<td class="num">${esc(r.codes?.[u] ?? "–")}</td>`).join("")}</tr>`).join("");
        html += `<p class="mif-tbl-title">${esc(t.title_verbatim || t.table_id)}</p>
          <div class="mif-scroll"><table class="spec-table mif-prog">
          <thead><tr><th>Item</th>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
      }
    }
  } catch (e) { /* mif data unavailable — skip section */ }
  return html
    ? `<h4>MIF progression — desired code per Training Section
         <button class="info-btn" id="mif-chart-btn" title="Interactive progress chart for this category">📈 Progress chart</button>
       </h4>${html}`
    : "";
}

/* ── Related requirements (item_links.json, optional) ── */

let linksCache;
async function loadLinks() {
  if (linksCache !== undefined) return linksCache;
  try {
    const res = await fetch("../data/requirements/item_links.json", { cache: "no-store" });
    linksCache = res.ok ? await res.json() : null;
  } catch (e) { linksCache = null; }
  return linksCache;
}

async function relatedReqHtml() {
  const links = await loadLinks();
  if (!links) return "";
  const own = links.links?.[state.item.item_id] || [];
  const cat = links.category_links?.[state.category] || [];
  if (!own.length && !cat.length) return "";
  const li = (l) => `<li><button class="req-link" data-req="${esc(l.req)}">${esc(l.req)}</button> ${esc(l.topic)}</li>`;
  let html = "";
  if (own.length) html += `<ul>${own.map(li).join("")}</ul>`;
  if (cat.length) html += `<p class="hint" style="margin-top:6px">Category-level:</p><ul>${cat.map(li).join("")}</ul>`;
  return `<h4>Related requirements</h4>${html}`;
}

$("item-info-btn").onclick = showInfo;
$("info-close").onclick = () => $("info-modal").classList.add("hidden");
$("info-modal").onclick = (e) => { if (e.target === $("info-modal")) $("info-modal").classList.add("hidden"); };
document.addEventListener("keydown", (e) => { if (e.key === "Escape") $("info-modal").classList.add("hidden"); });

/* ── Requirements view ─────────────────────────────────── */

const REQ_DOMAINS = [
  { id: "ground_training", file: "ground_training.json", label: "Ground Training" },
  { id: "simulator_training", file: "simulator_training.json", label: "Simulator (F/S)" },
  { id: "flight_training", file: "flight_training.json", label: "Flight Training" },
  { id: "failure_procedures", file: "failure_procedures.json", label: "Failures & Procedures" },
  { id: "board_matrix", file: "board_tolerance_matrix.json", label: "Board Tolerance Matrix" },
];
const reqState = { domain: null, cache: {} };

function switchView(view) {
  /* CUSTODY (Round 18 · specs/bridge-spec.md § 6, ruling #7) — the Bridge
     cross-check report carries REAL NAMES. Leaving the Scheduler drops it, DOM
     included: a hidden view is still a readable document, and the pane's own
     promise is that the report never outlives the pane. No-op when nothing was
     loaded, and when the Bridge module is not present at all (offline build). */
  if (view !== "scheduler" && window.schBridgeLeave) window.schBridgeLeave();
  for (const v of ["remarks", "description", "requirements", "flowchart", "scheduler", "currency"]) {
    $(`view-${v}`).classList.toggle("hidden", v !== view);
    $(`tab-${v}`).classList.toggle("active", v === view);
  }
  if (view === "flowchart" && window.fcInit) window.fcInit();
}
$("tab-remarks").onclick = () => switchView("remarks");
/* Round 16 — Description is a view of its own (app/description.js), booted on
   first open like the Scheduler and the Currency matrix. */
$("tab-description").onclick = () => { switchView("description"); if (window.descInit) window.descInit(); };
$("tab-requirements").onclick = () => switchView("requirements");
$("tab-flowchart").onclick = () => switchView("flowchart");
$("tab-scheduler").onclick = () => { switchView("scheduler"); if (window.schInit) window.schInit(); };
/* Round 11 — Instructor Currency is a view of its own (app/currency.js), booted
   on first open exactly like the Scheduler and behind the same access curtain. */
$("tab-currency").onclick = () => { switchView("currency"); if (window.curInit) window.curInit(); };

function renderReqDomains() {
  const grid = $("req-domain-grid");
  grid.innerHTML = "";
  for (const d of REQ_DOMAINS) {
    const btn = document.createElement("button");
    btn.className = "cat-card" + (reqState.domain === d.id ? " active" : "");
    btn.innerHTML = `<strong>${d.label}</strong>`;
    btn.onclick = () => { reqState.domain = d.id; renderReqDomains(); renderReqList(); };
    grid.appendChild(btn);
  }
}

async function loadReqDomain(id) {
  if (reqState.cache[id]) return reqState.cache[id];
  const d = REQ_DOMAINS.find((x) => x.id === id);
  const res = await fetch(`../data/requirements/${d.file}`, { cache: "no-store" });
  reqState.cache[id] = await res.json();
  return reqState.cache[id];
}

function openRequirements(reqId) {
  switchView("requirements");
  const prefix = reqId.split("-")[0];
  const domain = { gt: "ground_training", st: "simulator_training", ft: "flight_training", fail: "failure_procedures" }[prefix];
  if (domain) {
    reqState.domain = domain;
    $("req-search").value = reqId;
    renderReqDomains();
    renderReqList();
  }
}

function kvChips(values) {
  if (!values || typeof values !== "object") return "";
  const parts = Object.entries(values).slice(0, 8).map(([k, v]) =>
    `<span class="badge kv">${esc(k)}: ${esc(typeof v === "object" ? JSON.stringify(v) : String(v))}</span>`);
  return parts.length ? `<div class="kv-row">${parts.join("")}</div>` : "";
}

async function renderReqList() {
  const box = $("req-results");
  $("req-count").textContent = "";
  if (!reqState.domain) { box.innerHTML = `<p class="hint">Pick a domain to browse the Phase II requirements.</p>`; return; }
  box.innerHTML = `<p class="hint">Loading…</p>`;
  let data;
  try { data = await loadReqDomain(reqState.domain); }
  catch (e) { box.innerHTML = `<p class="hint">Failed to load ${reqState.domain}.</p>`; return; }

  const q = $("req-search").value.trim().toLowerCase();
  box.innerHTML = "";
  let shown = 0;

  if (reqState.domain === "board_matrix") {
    const rows = (data.entries || data.cases || data.matrix || data.rows || (Array.isArray(data) ? data : [])).filter((e) =>
      !q || JSON.stringify(e).toLowerCase().includes(q));
    const trs = rows.map((e) => `
      <tr>
        <td>${esc(e.failure_kind ?? "")}</td>
        <td>${esc(e.domain ?? "")}</td>
        <td>${esc(e.allowed_before_board ?? "")}</td>
        <td>${esc(Array.isArray(e.ladder) ? e.ladder.join(" → ") : (e.ladder ?? ""))}</td>
      </tr>`).join("");
    box.innerHTML = `<div class="mif-scroll"><table class="spec-table">
      <thead><tr><th>Failure kind</th><th>Domain</th><th>Allowed before Board</th><th>Ladder</th></tr></thead>
      <tbody>${trs}</tbody></table></div>`;
    $("req-count").textContent = `${rows.length} entries`;
    return;
  }

  for (const r of data.requirements || []) {
    const hay = `${r.id} ${r.topic} ${r.requirement} ${r.verbatim ?? ""}`.toLowerCase();
    if (q && !hay.includes(q)) continue;
    shown++;
    if (shown > 120) break;
    const card = document.createElement("div");
    card.className = "obs-card req-card";
    card.innerHTML = `
      <div class="obs-head">
        <span class="obs-prefix">${esc(r.id)}</span>
        <span class="badge">${esc(r.topic ?? "")}</span>
      </div>
      <p class="obs-text">${esc(r.requirement ?? "")}</p>
      ${kvChips(r.values)}
      ${r.source ? `<p class="req-src">📄 ${esc(r.source.file ?? "")} · p.${esc(String(r.source.page_pdf ?? "?"))}${r.source.ref ? " · " + esc(r.source.ref) : ""}</p>` : ""}
      ${r.verbatim ? `<details><summary>Source text (verbatim)</summary><p class="verbatim">${esc(r.verbatim)}</p></details>` : ""}`;
    box.appendChild(card);
  }
  $("req-count").textContent = shown ? `${shown} shown` : "no matches";
  if (!shown) box.innerHTML = `<p class="hint">No requirements match.</p>`;
}

$("req-search").addEventListener("input", renderReqList);
renderReqDomains();

/* Click outside the panels (remarks view) → deselect everything */
document.addEventListener("click", (e) => {
  if ($("view-remarks").classList.contains("hidden")) return;
  // A control re-rendered by its own click handler is detached by the time the
  // event bubbles here — that is an inside click, never an "outside" one.
  if (!(e.target instanceof Element) || !e.target.isConnected) return;
  if (e.target.closest(".panel, .topbar, .modal-box, #info-modal, .credit, .viewtab, #theme-pop")) return;
  if (state.category) resetRemarks();
});

/* MIF progress chart module (self-contained, injected to avoid index.html churn) */
{
  const mcs = document.createElement("script");
  mcs.src = "mifchart.js?v=" + Date.now(); // cache-bust: module updates ship often
  document.head.appendChild(mcs);
  const rss = document.createElement("script");
  rss.src = "remarksearch.js?v=" + Date.now();
  document.head.appendChild(rss);
  const sys = document.createElement("script");
  sys.src = "schedsync.js?v=" + Date.now();
  document.head.appendChild(sys);
}

/* ══════════════════════════════════════════════════════════════════════════
   THEME GALLERY (Round 8)
   ──────────────────────────────────────────────────────────────────────────
   PALETTES is the catalogue — the JS half of the "PALETTE CATALOGUE" section
   in styles.css (same order, same ids). Each entry only describes the CARD:
   the token values live in the CSS block. ADDING A PALETTE = one CSS block +
   one entry here; the gallery, the light/dark quick switch and persistence
   pick it up with no further code.
     id    — matches html[data-theme="<id>"]
     mode  — "light" | "dark"; drives html[data-mode] and the ☀/☾ switch
     desc  — one line on the card
     sw    — the four card swatches: bg · panel-2 · text · accent
   ══════════════════════════════════════════════════════════════════════════ */
const PALETTES = [
  { id: "obsidian", label: "Obsidian", mode: "dark",
    desc: "The original night deck — navy graphite, sky-blue accent.",
    sw: ["#0e1420", "#1c2a3d", "#e8eef6", "#58b0ff"] },
  { id: "slate", label: "Slate", mode: "light",
    desc: "Daylight briefing room — cool grey paper, deep blue accent.",
    sw: ["#eef2f7", "#f0f4f9", "#1a2733", "#1b5fa6"] },
  { id: "summit", label: "Summit", mode: "light",
    desc: "Alpine white with a steel-blue edge — print-like clarity.",
    sw: ["#f6f8fa", "#eef2f6", "#16202a", "#235d8c"] },
  { id: "ridgeline", label: "Ridgeline", mode: "light",
    desc: "Warm green tint, moss accent — the low-fatigue daylight option.",
    sw: ["#f2f5ee", "#edf2e6", "#1b2318", "#3d6435"] },
  { id: "mesa", label: "Mesa", mode: "light",
    desc: "Sand and ivory, terracotta accent — desert-strip warmth.",
    sw: ["#f7f2e9", "#f3ece0", "#241b12", "#96431f"] },
  { id: "tidal", label: "Tidal", mode: "dark",
    desc: "Deep navy water, ice-cyan accent — night ops, high focus.",
    sw: ["#081727", "#163149", "#e6f1fb", "#63d3ec"] },
  { id: "wilderness", label: "Wilderness", mode: "dark",
    desc: "Olive field kit, brass-gold accent — dispersal at dusk.",
    sw: ["#151a12", "#252d1f", "#eef2e6", "#d8bb52"] },
  { id: "aegean", label: "Aegean", mode: "dark",
    desc: "Squadron colours — blue-black sea, white-blue accent.",
    sw: ["#060d1a", "#132135", "#eef4ff", "#a8d4ff"] },
];

{
  const KEY = "p2r-palette", KEY_MODE = "p2r-palmode", KEY_OLD = "p2r-theme";
  const LAST = { light: "p2r-pal-light", dark: "p2r-pal-dark" };
  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
  };
  const byId = (id) => PALETTES.find((p) => p.id === id) || null;
  const firstOf = (mode) => PALETTES.find((p) => p.mode === mode);

  const btn = $("theme-btn");        // ☀ / ☾  — quick light↔dark flip
  const gal = $("theme-gal-btn");    // ◑ Theme — opens the gallery
  let cur = PALETTES[0], pop = null, grid = null, modeBtn = null;

  /* Migration: the old key stored "light" / "dark" only. */
  function initialId() {
    const saved = byId(ls.get(KEY));
    if (saved) return saved.id;
    const old = ls.get(KEY_OLD);
    return old === "light" ? "slate" : "obsidian";
  }

  function apply(id, persist) {
    const p = byId(id) || PALETTES[0];
    const root = document.documentElement;
    root.setAttribute("data-theme", p.id);
    root.setAttribute("data-mode", p.mode);
    /* flowchart.js re-draws its SVG edges on a class mutation of <html> (it
       reads the zone colours from CSS vars) — so every palette switch has to
       touch the class attribute, not only the data-* ones. */
    for (const c of Array.from(root.classList)) if (c.indexOf("pal-") === 0) root.classList.remove(c);
    root.classList.add("pal-" + p.id);
    root.classList.toggle("light", p.mode === "light");
    cur = p;
    btn.textContent = p.mode === "light" ? "☾" : "☀";
    btn.title = p.mode === "light"
      ? "Switch to the dark palette (" + (byId(ls.get(LAST.dark)) || firstOf("dark")).label + ")"
      : "Switch to the light palette (" + (byId(ls.get(LAST.light)) || firstOf("light")).label + ")";
    if (gal) gal.title = "Theme gallery — " + p.label + " (" + p.mode + ")";
    if (persist !== false) {
      ls.set(KEY, p.id);
      ls.set(KEY_MODE, p.mode);
      ls.set(LAST[p.mode], p.id);
    }
    mark();
  }

  function flipMode() {
    const want = cur.mode === "light" ? "dark" : "light";
    apply((byId(ls.get(LAST[want])) || firstOf(want)).id);
  }

  function mark() {
    if (!grid) return;
    for (const c of grid.children) {
      const on = c.dataset.pal === cur.id;
      c.classList.toggle("is-on", on);
      c.setAttribute("aria-selected", on ? "true" : "false");
      c.querySelector(".thm-tick").textContent = on ? "✓" : "";
    }
    if (modeBtn) {
      modeBtn.textContent = cur.mode === "light" ? "☾ Dark" : "☀ Light";
      modeBtn.title = "Quick switch to the last used " + (cur.mode === "light" ? "dark" : "light") + " palette";
    }
  }

  function build() {
    pop = document.createElement("div");
    pop.id = "theme-pop";
    pop.className = "thm-pop hidden";
    pop.setAttribute("role", "dialog");
    pop.setAttribute("aria-label", "Theme gallery");
    pop.innerHTML =
      `<div class="thm-head"><h3 id="thm-h">Theme</h3>
         <span class="thm-sub">${PALETTES.length} palettes</span>
         <button type="button" class="thm-modebtn" id="thm-mode"></button></div>
       <div class="thm-grid" id="thm-grid" role="listbox" aria-labelledby="thm-h"></div>`;
    document.body.appendChild(pop);
    grid = $("thm-grid");
    modeBtn = $("thm-mode");
    grid.innerHTML = PALETTES.map((p) => `
      <button type="button" class="thm-card" role="option" aria-selected="false"
              data-pal="${esc(p.id)}" title="${esc(p.label)} — ${esc(p.desc)}">
        <span class="thm-sw" aria-hidden="true">${p.sw.map((c) =>
          `<i style="background:${esc(c)}"></i>`).join("")}</span>
        <span class="thm-nm">${esc(p.label)}<span class="thm-tag">${esc(p.mode)}</span>
          <span class="thm-tick"></span></span>
        <span class="thm-d">${esc(p.desc)}</span>
      </button>`).join("");
    grid.addEventListener("click", (ev) => {
      const card = ev.target.closest(".thm-card");
      if (card) apply(card.dataset.pal);
    });
    grid.addEventListener("keydown", (ev) => {
      const cards = Array.from(grid.children);
      const here = document.activeElement && document.activeElement.closest(".thm-card");
      const i = cards.indexOf(here);
      if (i < 0) return;
      const step = { ArrowRight: 1, ArrowDown: 2, ArrowLeft: -1, ArrowUp: -2 }[ev.key];
      if (!step) return;
      ev.preventDefault();
      cards[Math.max(0, Math.min(cards.length - 1, i + step))].focus();
    });
    modeBtn.addEventListener("click", flipMode);
    pop.addEventListener("keydown", (ev) => { if (ev.key === "Escape") { close(); gal.focus(); } });
    document.addEventListener("click", (ev) => {
      if (pop.classList.contains("hidden")) return;
      if (ev.target.closest("#theme-pop, #theme-gal-btn")) return;
      close();
    });
    window.addEventListener("resize", () => { if (!pop.classList.contains("hidden")) place(); });
  }

  function place() {
    const r = gal.getBoundingClientRect();
    pop.style.top = Math.round(r.bottom + 8) + "px";
    pop.style.right = Math.max(8, Math.round(window.innerWidth - r.right)) + "px";
  }

  function close() {
    if (!pop) return;
    pop.classList.add("hidden");
    gal.setAttribute("aria-expanded", "false");
  }

  function toggle() {
    if (!pop) build();
    if (pop.classList.contains("hidden")) {
      mark();
      pop.classList.remove("hidden");
      place();
      gal.setAttribute("aria-expanded", "true");
      const on = grid.querySelector(".thm-card.is-on") || grid.firstElementChild;
      if (on) on.focus();
    } else close();
  }

  apply(initialId());   /* re-applies what the <head> script already painted */
  btn.onclick = flipMode;
  if (gal) {
    gal.setAttribute("aria-haspopup", "dialog");
    gal.setAttribute("aria-expanded", "false");
    gal.onclick = toggle;
  }
}

$("item-search").addEventListener("input", renderItems);
init();
